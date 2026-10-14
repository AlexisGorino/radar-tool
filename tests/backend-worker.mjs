import assert from "node:assert/strict";
import Worker, { safeResult, takeBalanced, validProfileUrl, validatePlan, freeBudgetAllows, countryCodeForLabel, requestedLocationParts, exactLocationCandidate, exactGithubLocation, resolveSearchLocation } from "../backend/worker.mjs";

let passed = 0;
async function test(name, run) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

const validPlan = {
  maxResults: 20,
  location: "España, Islas Canarias",
  queries: [
    { source: "linkedin", query: 'site:linkedin.com/in "Telecom technician" FTTH Canarias' },
    { source: "github", query: 'type:user language:Python location:"Islas Canarias"' },
  ],
};

async function main() {
  await test("accepts only bounded, source-bound query plans", () => {
    assert.equal(validatePlan(validPlan), true);
    assert.equal(validatePlan({ ...validPlan, location: "Chile, Santiago" }), false);
    assert.equal(validatePlan({ ...validPlan, location: "Santiago" }), false);
    assert.equal(validatePlan({ ...validPlan, queries: [{ source: "github", query: 'in:bio developer location:"Madrid"' }] }), false, "GitHub query locality must match the request scope");
    assert.equal(validatePlan({ ...validPlan, maxResults: 500 }), false);
    assert.equal(validatePlan({ ...validPlan, queries: [{ source: "stackoverflow", query: "site:stackoverflow.com/users/42/ person" }] }), false);
    assert.equal(validatePlan({ ...validPlan, queries: [{ source: "linkedin", query: "site:example.com test" }] }), false);
    assert.equal(validatePlan({ ...validPlan, queries: [...validPlan.queries, ...validPlan.queries] }), false);
    assert.equal(validatePlan({ ...validPlan, location: "x".repeat(181) }), false);
  });

  await test("accepts public profile URLs only on their expected hosts and paths", () => {
    assert.equal(validProfileUrl("https://linkedin.com/in/person", "linkedin"), true);
    assert.equal(validProfileUrl("https://linkedin.com/jobs/view/123", "linkedin"), false);
    assert.equal(validProfileUrl("https://notlinkedin.com/in/person", "linkedin"), false);
    assert.equal(safeResult({ link: "https://stackoverflow.com/questions/1/q", title: "Bad" }, "stackoverflow"), null);
  });

  await test("requires exact locality and country components in GitHub profile locations", () => {
    assert.equal(exactGithubLocation("Buenos Aires, Argentina", "Argentina, Buenos Aires"), true);
    assert.equal(exactGithubLocation("Buenos Aires, AR", "Argentina, Buenos Aires"), true);
    assert.equal(exactGithubLocation("Buenos Aires Province, Argentina", "Argentina, Buenos Aires"), false);
    assert.equal(exactGithubLocation("New York, United States", "United States, York"), false);
    assert.equal(exactGithubLocation("Santiago, Chile", "España, Santiago de Compostela"), false);
    assert.equal(exactGithubLocation("Canary Islands, Spain", "España, Islas Canarias"), true);
  });

  await test("resolves a locality only to an exact provider result in the requested country", async () => {
    assert.equal(countryCodeForLabel("España"), "ES");
    assert.equal(countryCodeForLabel("Chile"), null);
    assert.deepEqual(requestedLocationParts("España, Islas Canarias"), {
      parts: ["España", "Islas Canarias"], countryCode: "ES", locality: "Islas Canarias",
    });
    assert.equal(exactLocationCandidate({ name: "Canary Islands", canonical_name: "Canary Islands,Spain", country_code: "ES", target_type: "Region" }, "Canary Islands", "ES"), true);
    assert.equal(exactLocationCandidate({ name: "Canary Islands", canonical_name: "Canary Islands,Spain", country_code: "ES", target_type: "Region" }, "Islas Canarias", "ES"), true);
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (rawUrl) => {
        const url = new URL(rawUrl);
        assert.equal(url.pathname, "/locations.json");
        assert.ok(["Canary Islands", "Islas Canarias"].includes(url.searchParams.get("q")));
        assert.equal(url.searchParams.get("limit"), "10");
        return new Response(JSON.stringify([
          { name: "Canary Islands", canonical_name: "Canary Islands,Spain", country_code: "ES", target_type: "Region", reach: 500000 },
          { name: "Islas Canarias", canonical_name: "Islas Canarias, Mexico", country_code: "MX", target_type: "Region", reach: 1000 },
        ]), { status: 200 });
      };
      assert.deepEqual(await resolveSearchLocation("España, Canary Islands"), {
        canonicalName: "Canary Islands,Spain", countryCode: "ES", mode: "provider_location",
      });
      assert.deepEqual(await resolveSearchLocation("España, Islas Canarias"), {
        canonicalName: "Canary Islands,Spain", countryCode: "ES", mode: "provider_location",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("keeps geography in the query and safely omits an unresolved provider location", async () => {
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => { throw new Error("catalog unavailable"); };
      assert.deepEqual(await resolveSearchLocation("España, Islas Canarias"), {
        canonicalName: null, countryCode: "ES", mode: "query_only",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("balances LinkedIn and GitHub representation and returns at most 20 results", () => {
    const lists = [
      Array.from({ length: 40 }, (_, i) => ({ source: "linkedin", position: i + 1 })),
      Array.from({ length: 40 }, (_, i) => ({ source: "github", position: i + 1 })),
    ];
    const chosen = takeBalanced(lists);
    assert.equal(chosen.length, 20);
    assert.equal(chosen.filter((row) => row.source === "linkedin").length, 10);
    assert.equal(chosen.filter((row) => row.source === "github").length, 10);
  });

  await test("requires a confirmed free plan and enough remaining monthly searches before querying", async () => {
    const previousFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 4, this_hour_searches: 2, account_rate_limit_per_hour: 20 }), { status: 200 });
      assert.deepEqual(await freeBudgetAllows("server-secret", 4), { allowed: true });
      assert.deepEqual(await freeBudgetAllows("server-secret", 5), { allowed: false, reason: "free_quota_exhausted" });
      globalThis.fetch = async () => new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 20, this_hour_searches: 18, account_rate_limit_per_hour: 20 }), { status: 200 });
      assert.deepEqual(await freeBudgetAllows("server-secret", 4), { allowed: false, reason: "hourly_quota_exhausted" });
      globalThis.fetch = async () => new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 20 }), { status: 200 });
      assert.deepEqual(await freeBudgetAllows("server-secret", 1), { allowed: false, reason: "budget_unavailable" });
      globalThis.fetch = async () => new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 10, plan_searches_left: 20 }), { status: 200 });
      assert.deepEqual(await freeBudgetAllows("server-secret", 1), { allowed: false, reason: "free_plan_required" });
      globalThis.fetch = async () => new Response(JSON.stringify({ account_status: "Active", plan_searches_left: 20 }), { status: 200 });
      assert.deepEqual(await freeBudgetAllows("server-secret", 1), { allowed: false, reason: "free_plan_required" });
      globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });
      assert.deepEqual(await freeBudgetAllows("server-secret", 1), { allowed: false, reason: "budget_unavailable" });
      globalThis.fetch = async () => { throw new Error("network unavailable"); };
      assert.deepEqual(await freeBudgetAllows("server-secret", 1), { allowed: false, reason: "budget_unavailable" });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("rejects requests from other origins before consuming provider quota", async () => {
    const previousFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error("unexpected fetch"); };
    try {
      const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
        method: "POST", headers: { Origin: "https://malicious.example", "Content-Type": "application/json" }, body: JSON.stringify(validPlan),
      }), { ALLOWED_ORIGIN: "https://alexisgorino.github.io", SERPAPI_KEY: "test", SEARCH_LIMITER: { limit: async () => ({ success: true }) } });
      assert.equal(response.status, 403);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("returns a bounded, balanced, no-store response and keeps provider credentials server-side", async () => {
    const previousFetch = globalThis.fetch;
    const seenSerp = [];
    const githubDetails = [];
    const githubAuthHeaders = [];
    globalThis.fetch = async (rawUrl, init = {}) => {
      const url = new URL(rawUrl);
      const requestHeaders = new Headers(init.headers || {});
      if (url.pathname.endsWith("/account.json")) {
        return new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 250, this_hour_searches: 0, account_rate_limit_per_hour: 50 }), { status: 200 });
      }
      if (url.pathname.endsWith("/locations.json")) {
        return new Response(JSON.stringify([{ name: "Canary Islands", canonical_name: "Canary Islands,Spain", country_code: "ES", target_type: "Region", reach: 500000 }]), { status: 200 });
      }
      if (url.hostname === "api.github.com" && url.pathname === "/search/users") {
        githubAuthHeaders.push(requestHeaders.get("Authorization") || "");
        assert.equal(url.searchParams.get("q"), 'type:user language:Python location:"Islas Canarias"');
        assert.equal(url.searchParams.get("per_page"), "10");
        return new Response(JSON.stringify({ total_count: 25, items: Array.from({ length: 10 }, (_, index) => ({ login: `github-person-${index}`, html_url: `https://github.com/github-person-${index}`, score: 1 })) }), { status: 200 });
      }
      if (url.hostname === "api.github.com" && /^\/users\//.test(url.pathname)) {
        githubAuthHeaders.push(requestHeaders.get("Authorization") || "");
        const login = url.pathname.split("/").at(-1);
        githubDetails.push(login);
        return new Response(JSON.stringify({ login, name: `GitHub Person ${login.slice(-1)}`, bio: "Python developer", location: "Islas Canarias, España", public_repos: 12, html_url: `https://github.com/${login}` }), { status: 200 });
      }
      if (url.hostname === "api.github.com") githubAuthHeaders.push(requestHeaders.get("Authorization") || "");
      seenSerp.push(url);
      return new Response(JSON.stringify({ organic_results: Array.from({ length: 40 }, (_, index) => ({
        position: index + 1,
        title: `LinkedIn Person ${index} - Telecom technician`,
        link: `https://linkedin.com/in/person-${index}`,
        snippet: "Public profile",
      })) }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
        method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(validPlan),
      }), {
        ALLOWED_ORIGIN: "https://alexisgorino.github.io",
        SERPAPI_KEY: "server-secret",
        GITHUB_TOKEN: "github-secret",
        SEARCH_LIMITER: { limit: async () => ({ success: true }) },
      });
      const json = await response.json();
      assert.equal(response.status, 200);
      assert.equal(json.results.length, 20);
      assert.equal(json.results.filter((row) => row.source === "linkedin").length, 10);
      assert.equal(json.results.filter((row) => row.source === "github").length, 10);
      assert.deepEqual(json.sourceDiagnostics, [
        { source: "linkedin", status: "profiles_found", organicCount: 40, profileCount: 40, code: null },
        { source: "github", status: "profiles_found", organicCount: 25, profileCount: 10, code: null },
      ]);
      assert.deepEqual(json.locationContext, { mode: "provider_location", canonicalName: "Canary Islands,Spain", countryCode: "ES" });
      assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://alexisgorino.github.io");
      assert.equal(seenSerp.length, 1, "only LinkedIn should use a SerpApi credit");
      assert.equal(githubDetails.length, 10, "GitHub returns only ten enriched public profiles per request");
      assert.equal(githubAuthHeaders.length, 11);
      assert.ok(githubAuthHeaders.every((value) => value === "Bearer github-secret"));
      seenSerp.forEach((url) => {
        assert.equal(url.searchParams.has("num"), false);
        assert.match(url.searchParams.get("q"), /Canarias/);
        assert.equal(url.searchParams.get("location"), "Canary Islands,Spain");
        assert.equal(url.searchParams.get("gl"), "es");
        assert.equal(url.searchParams.get("api_key"), "server-secret");
      });
      assert.ok(json.results.filter((row) => row.source === "github").every((row) => row.snippet.includes("Islas Canarias, España") && row.snippet.includes("Lenguaje de repositorios: Python")));
      assert.doesNotMatch(JSON.stringify(json), /server-secret/);
      assert.doesNotMatch(JSON.stringify(json), /github-secret/);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("starts all selected source searches concurrently", async () => {
    const previousFetch = globalThis.fetch;
    const requestedSources = [];
    let releaseSearches;
    const searchesReleased = new Promise((resolve) => { releaseSearches = resolve; });
    globalThis.fetch = async (rawUrl) => {
      const url = new URL(rawUrl);
      if (url.pathname.endsWith("/account.json")) {
        return new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 250, this_hour_searches: 0, account_rate_limit_per_hour: 50 }), { status: 200 });
      }
      if (url.pathname.endsWith("/locations.json")) return new Response("[]", { status: 200 });
      const source = url.hostname === "api.github.com" ? "github" : "linkedin";
      requestedSources.push(source);
      if (requestedSources.length === 2) releaseSearches();
      await Promise.race([searchesReleased, new Promise((resolve) => setTimeout(resolve, 100))]);
      return new Response(JSON.stringify(source === "github" ? { total_count: 0, items: [] } : { organic_results: [] }), { status: 200 });
    };
    try {
      const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
        method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(validPlan),
      }), {
        ALLOWED_ORIGIN: "https://alexisgorino.github.io", SERPAPI_KEY: "server-secret",
        SEARCH_LIMITER: { limit: async () => ({ success: true }) },
      });
      assert.equal(response.status, 200);
      assert.equal(requestedSources.length, 2, "all sources should be dispatched before either search resolves");
      const payload = await response.json();
      assert.ok(payload.sourceDiagnostics.every((entry) => entry.status === "no_indexed_results"));
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("fails closed without a rate-limit binding or provider secret", async () => {
    const linkedinOnlyPlan = { ...validPlan, queries: validPlan.queries.filter((entry) => entry.source === "linkedin") };
    const base = new Request("https://radar-search.example/api/search", {
      method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(linkedinOnlyPlan),
    });
    const noRate = await Worker.fetch(base.clone(), { ALLOWED_ORIGIN: "https://alexisgorino.github.io", SERPAPI_KEY: "key" });
    assert.equal(noRate.status, 503);
    const noKey = await Worker.fetch(base.clone(), { ALLOWED_ORIGIN: "https://alexisgorino.github.io", SEARCH_LIMITER: { limit: async () => ({ success: true }) } });
    assert.equal(noKey.status, 502);
    assert.equal((await noKey.json()).sourceErrors[0].code, "provider_credentials_rejected");
  });

  await test("searches GitHub directly without SerpApi and keeps only exact locality plus country matches", async () => {
    const previousFetch = globalThis.fetch;
    const requestedPaths = [];
    globalThis.fetch = async (rawUrl) => {
      const url = new URL(rawUrl);
      requestedPaths.push(`${url.hostname}${url.pathname}`);
      if (url.hostname === "api.github.com" && url.pathname === "/search/users") {
        return new Response(JSON.stringify({ total_count: 2, items: [
          { login: "buenos-aires-engineer", html_url: "https://github.com/buenos-aires-engineer" },
          { login: "santiago-chile-engineer", html_url: "https://github.com/santiago-chile-engineer" },
        ] }), { status: 200 });
      }
      const login = url.pathname.split("/").at(-1);
      const location = login === "buenos-aires-engineer" ? "Buenos Aires, Argentina" : "Santiago, Chile";
      return new Response(JSON.stringify({ login, name: "Public Engineer", bio: "Backend developer · Python", location, public_repos: 8, html_url: `https://github.com/${login}` }), { status: 200 });
    };
    const githubOnlyPlan = {
      ...validPlan,
      location: "Argentina, Buenos Aires",
      queries: [{ source: "github", query: 'type:user language:Python location:"Buenos Aires"' }],
    };
    try {
      const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
        method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(githubOnlyPlan),
      }), {
        ALLOWED_ORIGIN: "https://alexisgorino.github.io",
        SEARCH_LIMITER: { limit: async () => ({ success: true }) },
      });
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.results.length, 1);
      assert.equal(payload.results[0].url, "https://github.com/buenos-aires-engineer");
      assert.deepEqual(payload.sourceDiagnostics, [
        { source: "github", status: "profiles_found", organicCount: 2, profileCount: 1, code: null },
      ]);
      assert.ok(requestedPaths.every((path) => !path.endsWith("/account.json") && !path.endsWith("/search.json")), "GitHub-only search must not check or spend SerpApi search quota");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("does not list GitHub users that match only language and city but not the vacancy signal", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (rawUrl) => {
      const url = new URL(rawUrl);
      if (url.hostname === "api.github.com" && url.pathname === "/search/users") {
        assert.equal(url.searchParams.get("q"), 'type:user language:TypeScript location:"Buenos Aires"');
        return new Response(JSON.stringify({ total_count: 2, items: [
          { login: "unrelated-python", html_url: "https://github.com/unrelated-python" },
          { login: "qa-playwright", html_url: "https://github.com/qa-playwright" },
        ] }), { status: 200 });
      }
      if (url.hostname === "api.github.com" && /^\/users\//.test(url.pathname)) {
        const login = url.pathname.split("/").at(-1);
        return new Response(JSON.stringify({
          login,
          name: login === "qa-playwright" ? "QA Playwright" : "Python Developer",
          bio: login === "qa-playwright" ? "QA automation engineer with Playwright" : "Python developer",
          location: "Buenos Aires, Argentina",
          public_repos: 4,
          html_url: `https://github.com/${login}`,
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    try {
      const plan = {
        maxResults: 20,
        location: "Argentina, Buenos Aires",
        queries: [{ source: "github", query: 'type:user language:TypeScript location:"Buenos Aires"', profileEvidence: { required: [], alternatives: ["Playwright"], role: ["QA Engineer", "QA Automation Engineer"] } }],
      };
      const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
        method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(plan),
      }), {
        ALLOWED_ORIGIN: "https://alexisgorino.github.io",
        SEARCH_LIMITER: { limit: async () => ({ success: true }) },
      });
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(payload.results.map((row) => row.url), ["https://github.com/qa-playwright"]);
      assert.equal(payload.sourceDiagnostics[0].profileCount, 1);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("returns a retry hint when the shared network limiter blocks a request", async () => {
    const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
      method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(validPlan),
    }), {
      ALLOWED_ORIGIN: "https://alexisgorino.github.io",
      SERPAPI_KEY: "server-secret",
      SEARCH_LIMITER: { limit: async () => ({ success: false }) },
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    assert.deepEqual(await response.json(), { error: "rate_limited" });
  });

  await test("checks production search readiness without calling the paid search endpoint", async () => {
    const previousFetch = globalThis.fetch;
    const requestedPaths = [];
    try {
      globalThis.fetch = async (rawUrl) => {
        const url = new URL(rawUrl);
        requestedPaths.push(url.pathname);
        return new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 25, this_hour_searches: 0, account_rate_limit_per_hour: 50 }), { status: 200 });
      };
      const response = await Worker.fetch(new Request("https://radar-search.example/api/health", {
        method: "GET", headers: { Origin: "https://alexisgorino.github.io" },
      }), {
        ALLOWED_ORIGIN: "https://alexisgorino.github.io",
        SERPAPI_KEY: "server-secret",
        SEARCH_LIMITER: { limit: async () => ({ success: true }) },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ready: true, error: null, usesSearchCredit: false });
      assert.deepEqual(requestedPaths, ["/account.json"]);
      assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, POST, OPTIONS");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("reports safe provider failure categories without leaking upstream details", async () => {
    const previousFetch = globalThis.fetch;
    const linkedinOnlyPlan = { ...validPlan, queries: validPlan.queries.filter((entry) => entry.source === "linkedin") };
    globalThis.fetch = async (rawUrl) => {
      const url = new URL(rawUrl);
      if (url.pathname.endsWith("/account.json")) {
        return new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 250, this_hour_searches: 0, account_rate_limit_per_hour: 50 }), { status: 200 });
      }
      return new Response("credential detail must stay hidden", { status: 401 });
    };
    try {
      const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
        method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(linkedinOnlyPlan),
      }), {
        ALLOWED_ORIGIN: "https://alexisgorino.github.io",
        SERPAPI_KEY: "server-secret",
        SEARCH_LIMITER: { limit: async () => ({ success: true }) },
      });
      const payload = await response.json();
      assert.equal(response.status, 502);
      assert.equal(payload.error, "sources_unavailable");
      assert.ok(payload.sourceErrors.every((entry) => entry.code === "provider_credentials_rejected"));
      assert.ok(payload.sourceDiagnostics.every((entry) => entry.status === "error" && entry.code === "provider_credentials_rejected"));
      assert.doesNotMatch(JSON.stringify(payload), /credential detail|server-secret/);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("separates provider location and query rejections without leaking upstream text", async () => {
    const previousFetch = globalThis.fetch;
    const linkedinOnlyPlan = { ...validPlan, queries: validPlan.queries.filter((entry) => entry.source === "linkedin") };
    try {
      for (const [message, code] of [
        ["Invalid location requested", "provider_location_rejected"],
        ["Invalid search query parameter", "provider_query_rejected"],
      ]) {
        globalThis.fetch = async (rawUrl) => {
          const url = new URL(rawUrl);
          if (url.pathname.endsWith("/account.json")) {
            return new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 250, this_hour_searches: 0, account_rate_limit_per_hour: 50 }), { status: 200 });
          }
          if (url.pathname.endsWith("/locations.json")) return new Response("[]", { status: 200 });
          return new Response(JSON.stringify({ error: message }), { status: 400 });
        };
        const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
          method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(linkedinOnlyPlan),
        }), {
          ALLOWED_ORIGIN: "https://alexisgorino.github.io",
          SERPAPI_KEY: "server-secret",
          SEARCH_LIMITER: { limit: async () => ({ success: true }) },
        });
        const payload = await response.json();
        assert.equal(response.status, 502);
        assert.ok(payload.sourceErrors.every((entry) => entry.code === code));
        assert.doesNotMatch(JSON.stringify(payload), new RegExp(message));
      }
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("distinguishes provider network and timeout failures without exposing exception text", async () => {
    const previousFetch = globalThis.fetch;
    const linkedinOnlyPlan = { ...validPlan, queries: validPlan.queries.filter((entry) => entry.source === "linkedin") };
    try {
      for (const [name, code] of [["TypeError", "provider_network_error"], ["TimeoutError", "provider_timeout"]]) {
        globalThis.fetch = async (rawUrl) => {
          const url = new URL(rawUrl);
          if (url.pathname.endsWith("/account.json")) {
            return new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 250, this_hour_searches: 0, account_rate_limit_per_hour: 50 }), { status: 200 });
          }
          const error = new Error("network detail must stay hidden");
          error.name = name;
          throw error;
        };
        const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
          method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(linkedinOnlyPlan),
        }), {
          ALLOWED_ORIGIN: "https://alexisgorino.github.io",
          SERPAPI_KEY: "server-secret",
          SEARCH_LIMITER: { limit: async () => ({ success: true }) },
        });
        const payload = await response.json();
        assert.equal(response.status, 502);
        assert.ok(payload.sourceErrors.every((entry) => entry.code === code));
        assert.doesNotMatch(JSON.stringify(payload), /network detail|server-secret/);
      }
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  console.log(`\n${passed} backend-worker tests passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
