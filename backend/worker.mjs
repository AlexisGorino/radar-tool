const SOURCES = Object.freeze({
  linkedin: { domain: "linkedin.com", path: /^\/(?:in|pub)\//i },
  github: { domain: "github.com", path: /^\/[^/]+\/?$/i },
  stackoverflow: { domain: "stackoverflow.com", path: /^\/users\/\d+\//i },
  xing: { domain: "xing.com", path: /^\/profile\//i },
  behance: { domain: "behance.net", path: /^\/[^/]+\/?$/i },
});
const MAX_SOURCES = 4;
const MAX_RESULTS = 50;
const MAX_QUERY_LENGTH = 900;
const MAX_BODY_BYTES = 12_000;

function json(body, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function validProfileUrl(rawUrl, sourceId) {
  const source = SOURCES[sourceId];
  if (!source) return false;
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return url.protocol === "https:" && (host === source.domain || host.endsWith(`.${source.domain}`)) && source.path.test(url.pathname);
  } catch {
    return false;
  }
}

function validatePlan(body) {
  if (!body || !Array.isArray(body.queries) || body.queries.length < 1 || body.queries.length > MAX_SOURCES) return false;
  if (body.maxResults !== MAX_RESULTS) return false;
  const unique = new Set();
    return body.queries.every((entry) => {
    if (!entry || !Object.prototype.hasOwnProperty.call(SOURCES, entry.source) || typeof entry.query !== "string") return false;
    const query = entry.query.trim();
    const expectedSite = entry.source === "linkedin" ? "linkedin.com/in" : SOURCES[entry.source].domain;
    if (query.length < 5 || query.length > MAX_QUERY_LENGTH || !query.toLowerCase().includes(`site:${expectedSite}`)) return false;
    if (unique.has(entry.source)) return false;
    unique.add(entry.source);
    return true;
  }) && (typeof body.location === "string" && body.location.length <= 180);
}

function safeResult(item, source) {
  if (!item || !validProfileUrl(item.link, source)) return null;
  return {
    source,
    url: item.link,
    title: String(item.title || "").slice(0, 240),
    snippet: String(item.snippet || "").slice(0, 800),
    position: Number.isFinite(Number(item.position)) ? Number(item.position) : null,
  };
}

async function lookup(query, location, source, apiKey) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(MAX_RESULTS));
  url.searchParams.set("api_key", apiKey);
  if (location) url.searchParams.set("location", location);
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(18_000) });
  if (response.status === 429) throw new Error("provider_rate_limited");
  if (!response.ok) throw new Error(`provider_${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error("provider_error");
  return (Array.isArray(data.organic_results) ? data.organic_results : [])
    .map((item) => safeResult(item, source)).filter(Boolean).slice(0, MAX_RESULTS);
}

async function freeBudgetAllows(apiKey, searchesNeeded) {
  const url = new URL("https://serpapi.com/account.json");
  url.searchParams.set("api_key", apiKey);
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return { allowed: false, reason: "budget_unavailable" };
  const account = await response.json();
  if (account.plan_monthly_price === undefined || account.plan_monthly_price === null || account.plan_monthly_price === "") {
    return { allowed: false, reason: "free_plan_required" };
  }
  const monthlyPrice = Number(account.plan_monthly_price);
  const remaining = Number(account.plan_searches_left);
  const searchesThisHour = Number(account.this_hour_searches);
  const hourlyLimit = Number(account.account_rate_limit_per_hour);
  if (account.account_status !== "Active" || !Number.isFinite(monthlyPrice) || monthlyPrice !== 0 || !Number.isFinite(remaining)) {
    return { allowed: false, reason: "free_plan_required" };
  }
  if (remaining < searchesNeeded) return { allowed: false, reason: "free_quota_exhausted" };
  if (!Number.isFinite(searchesThisHour) || !Number.isFinite(hourlyLimit)) {
    return { allowed: false, reason: "budget_unavailable" };
  }
  if (searchesThisHour + searchesNeeded > hourlyLimit) {
    return { allowed: false, reason: "hourly_quota_exhausted" };
  }
  return { allowed: true };
}

function takeBalanced(resultsBySource, maximum = MAX_RESULTS) {
  const selected = [];
  let rank = 0;
  while (selected.length < maximum) {
    let added = false;
    for (const results of resultsBySource) {
      if (results[rank]) {
        selected.push(results[rank]);
        added = true;
        if (selected.length === maximum) break;
      }
    }
    if (!added) break;
    rank += 1;
  }
  return selected;
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || "https://alexisgorino.github.io";
    const requestOrigin = request.headers.get("Origin") || "";
    if (requestOrigin !== allowedOrigin) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
    if (request.method !== "POST" || new URL(request.url).pathname !== "/api/search") return json({ error: "not_found" }, 404, allowedOrigin);
    if (!env.SERPAPI_KEY) return json({ error: "not_configured" }, 503, allowedOrigin);
    if (!env.SEARCH_LIMITER) return json({ error: "rate_limit_not_configured" }, 503, allowedOrigin);

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const limit = await env.SEARCH_LIMITER.limit({ key: clientIp });
    if (!limit.success) return json({ error: "rate_limited" }, 429, allowedOrigin, { "Retry-After": "60" });

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: "request_too_large" }, 413, allowedOrigin);
    let plan;
    try {
      plan = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, allowedOrigin);
    }
    if (!validatePlan(plan)) return json({ error: "invalid_search_plan" }, 400, allowedOrigin);

    const budget = await freeBudgetAllows(env.SERPAPI_KEY, plan.queries.length);
    if (!budget.allowed) {
      const exhausted = budget.reason === "free_quota_exhausted";
      const hourlyExhausted = budget.reason === "hourly_quota_exhausted";
      return json({ error: budget.reason }, exhausted || hourlyExhausted ? 429 : 503, allowedOrigin);
    }

    const resultsBySource = [];
    const sourceErrors = [];
    for (const entry of plan.queries) {
      try {
        resultsBySource.push(await lookup(entry.query, plan.location, entry.source, env.SERPAPI_KEY));
      } catch (error) {
        sourceErrors.push({ source: entry.source, code: error.message === "provider_rate_limited" ? "provider_rate_limited" : "source_unavailable" });
      }
    }
    const results = takeBalanced(resultsBySource);
    if (!results.length && sourceErrors.length === plan.queries.length) {
      const rateLimited = sourceErrors.some((error) => error.code === "provider_rate_limited");
      return json({ error: rateLimited ? "provider_rate_limited" : "sources_unavailable", sourceErrors }, rateLimited ? 429 : 502, allowedOrigin);
    }
    return json({ results, sourceErrors, count: results.length }, 200, allowedOrigin);
  },
};

export { validatePlan, validProfileUrl, safeResult, takeBalanced, freeBudgetAllows };
