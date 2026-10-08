import assert from "node:assert/strict";
import Worker, { safeResult, takeBalanced, validProfileUrl, validatePlan, freeBudgetAllows, countryCodeForLabel, requestedLocationParts, exactLocationCandidate, resolveSearchLocation } from "../backend/worker.mjs";

let passed = 0;
async function test(name, run) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

const validPlan = {
  maxResults: 50,
  location: "España, Islas Canarias",
  queries: [
    { source: "linkedin", query: 'site:linkedin.com/in "Telecom technician" FTTH Canarias' },
    { source: "github", query: "site:github.com Python Canarias" },
  ],
};

async function main() {
  await test("accepts only bounded, source-bound query plans", () => {
    assert.equal(validatePlan(validPlan), true);
    assert.equal(validatePlan({ ...validPlan, maxResults: 500 }), false);
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

  await test("resolves a locality only to an exact provider result in the requested country", async () => {
    assert.equal(countryCodeForLabel("España"), "ES");
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

  await test("balances source representation and returns at most 50 results", () => {
    const lists = [
      Array.from({ length: 50 }, (_, i) => ({ source: "linkedin", position: i + 1 })),
      Array.from({ length: 50 }, (_, i) => ({ source: "github", position: i + 1 })),
    ];
    const chosen = takeBalanced(lists);
    assert.equal(chosen.length, 50);
    assert.equal(chosen.filter((row) => row.source === "linkedin").length, 25);
    assert.equal(chosen.filter((row) => row.source === "github").length, 25);
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
    const seen = [];
    globalThis.fetch = async (rawUrl) => {
      const url = new URL(rawUrl);
      if (url.pathname.endsWith("/account.json")) {
        return new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 250, this_hour_searches: 0, account_rate_limit_per_hour: 50 }), { status: 200 });
      }
      if (url.pathname.endsWith("/locations.json")) {
        return new Response(JSON.stringify([{ name: "Canary Islands", canonical_name: "Canary Islands,Spain", country_code: "ES", target_type: "Region", reach: 500000 }]), { status: 200 });
      }
      seen.push(url);
      const source = url.searchParams.get("q").includes("linkedin.com/in") ? "linkedin" : "github";
      const host = source === "linkedin" ? "linkedin.com" : "github.com";
      return new Response(JSON.stringify({ organic_results: Array.from({ length: 40 }, (_, index) => ({
        position: index + 1,
        title: `${source} profile ${index}`,
        link: `https://${host}/${source === "linkedin" ? "in/" : ""}person-${index}`,
        snippet: "Public profile",
      })) }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    try {
      const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
        method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(validPlan),
      }), {
        ALLOWED_ORIGIN: "https://alexisgorino.github.io",
        SERPAPI_KEY: "server-secret",
        SEARCH_LIMITER: { limit: async () => ({ success: true }) },
      });
      const json = await response.json();
      assert.equal(response.status, 200);
      assert.equal(json.results.length, 50);
      assert.equal(json.results.filter((row) => row.source === "linkedin").length, 25);
      assert.equal(json.results.filter((row) => row.source === "github").length, 25);
      assert.deepEqual(json.locationContext, { mode: "provider_location", canonicalName: "Canary Islands,Spain", countryCode: "ES" });
      assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://alexisgorino.github.io");
      assert.equal(seen.length, 2);
      seen.forEach((url) => {
        assert.equal(url.searchParams.get("num"), "50");
        assert.match(url.searchParams.get("q"), /Canarias/);
        assert.equal(url.searchParams.get("location"), "Canary Islands,Spain");
        assert.equal(url.searchParams.get("gl"), "es");
        assert.equal(url.searchParams.get("api_key"), "server-secret");
      });
      assert.doesNotMatch(JSON.stringify(json), /server-secret/);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("fails closed without a rate-limit binding or provider secret", async () => {
    const base = new Request("https://radar-search.example/api/search", {
      method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(validPlan),
    });
    const noRate = await Worker.fetch(base.clone(), { ALLOWED_ORIGIN: "https://alexisgorino.github.io", SERPAPI_KEY: "key" });
    assert.equal(noRate.status, 503);
    const noKey = await Worker.fetch(base.clone(), { ALLOWED_ORIGIN: "https://alexisgorino.github.io", SEARCH_LIMITER: { limit: async () => ({ success: true }) } });
    assert.equal(noKey.status, 503);
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

  await test("reports safe provider failure categories without leaking upstream details", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (rawUrl) => {
      const url = new URL(rawUrl);
      if (url.pathname.endsWith("/account.json")) {
        return new Response(JSON.stringify({ account_status: "Active", plan_monthly_price: 0, plan_searches_left: 250, this_hour_searches: 0, account_rate_limit_per_hour: 50 }), { status: 200 });
      }
      return new Response("credential detail must stay hidden", { status: 401 });
    };
    try {
      const response = await Worker.fetch(new Request("https://radar-search.example/api/search", {
        method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(validPlan),
      }), {
        ALLOWED_ORIGIN: "https://alexisgorino.github.io",
        SERPAPI_KEY: "server-secret",
        SEARCH_LIMITER: { limit: async () => ({ success: true }) },
      });
      const payload = await response.json();
      assert.equal(response.status, 502);
      assert.equal(payload.error, "sources_unavailable");
      assert.ok(payload.sourceErrors.every((entry) => entry.code === "provider_credentials_rejected"));
      assert.doesNotMatch(JSON.stringify(payload), /credential detail|server-secret/);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await test("distinguishes provider network and timeout failures without exposing exception text", async () => {
    const previousFetch = globalThis.fetch;
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
          method: "POST", headers: { Origin: "https://alexisgorino.github.io", "Content-Type": "application/json" }, body: JSON.stringify(validPlan),
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
