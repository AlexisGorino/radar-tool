const SOURCES = Object.freeze({
  linkedin: { domain: "linkedin.com", path: /^\/(?:in|pub)\//i },
  github: { domain: "github.com", path: /^\/[^/]+\/?$/i },
  stackoverflow: { domain: "stackoverflow.com", path: /^\/users\/\d+\//i },
  xing: { domain: "xing.com", path: /^\/profile\//i },
  behance: { domain: "behance.net", path: /^\/[^/]+\/?$/i },
});
const MAX_SOURCES = 4;
const MAX_RESULTS = 40;
const MAX_QUERY_LENGTH = 900;
const MAX_BODY_BYTES = 12_000;
const LOCATION_LOOKUP_TIMEOUT_MS = 4_000;
const SEARCH_TIMEOUT_MS = 30_000;
const COUNTRY_CODE_CACHE = new Map();
const PROVIDER_ERROR_CODES = new Set([
  "provider_rate_limited",
  "provider_credentials_rejected",
  "provider_location_rejected",
  "provider_query_rejected",
  "provider_request_rejected",
  "provider_unavailable",
]);

function safeProviderErrorCode(error) {
  if (PROVIDER_ERROR_CODES.has(error && error.message)) return error.message;
  if (error && (error.name === "TimeoutError" || error.name === "AbortError")) return "provider_timeout";
  if (error && error.name === "TypeError") return "provider_network_error";
  return "source_unavailable";
}

function json(body, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function normalizeLocation(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function countryCodeForLabel(value) {
  const normalized = normalizeLocation(value);
  if (COUNTRY_CODE_CACHE.has(normalized)) return COUNTRY_CODE_CACHE.get(normalized);
  const aliases = {
    "usa": "US", "eeuu": "US", "estados unidos": "US", "united states": "US",
    "uk": "GB", "gran bretana": "GB", "reino unido": "GB", "united kingdom": "GB",
    "espana": "ES", "spain": "ES", "argentina": "AR", "chile": "CL", "brasil": "BR", "brazil": "BR",
    "mexico": "MX", "colombia": "CO", "peru": "PE", "uruguay": "UY", "paraguay": "PY", "bolivia": "BO",
    "ecuador": "EC", "venezuela": "VE", "panama": "PA", "costa rica": "CR", "guatemala": "GT",
    "honduras": "HN", "el salvador": "SV", "nicaragua": "NI", "republica dominicana": "DO", "puerto rico": "PR",
    "alemania": "DE", "germany": "DE", "francia": "FR", "france": "FR", "italia": "IT", "italy": "IT",
    "portugal": "PT", "paises bajos": "NL", "holanda": "NL", "netherlands": "NL", "belgica": "BE", "belgium": "BE",
    "irlanda": "IE", "ireland": "IE", "suiza": "CH", "switzerland": "CH", "austria": "AT", "polonia": "PL",
    "poland": "PL", "suecia": "SE", "sweden": "SE", "noruega": "NO", "norway": "NO", "dinamarca": "DK",
    "denmark": "DK", "finlandia": "FI", "finland": "FI", "grecia": "GR", "greece": "GR", "turquia": "TR",
    "turkey": "TR", "canada": "CA", "australia": "AU", "nueva zelanda": "NZ", "new zealand": "NZ",
    "japon": "JP", "japan": "JP", "china": "CN", "india": "IN", "singapur": "SG", "singapore": "SG",
    "israel": "IL", "sudafrica": "ZA", "south africa": "ZA", "emiratos arabes unidos": "AE", "uae": "AE",
  };
  if (aliases[normalized]) {
    COUNTRY_CODE_CACHE.set(normalized, aliases[normalized]);
    return aliases[normalized];
  }

  // Intl.DisplayNames covers country names in common recruiting languages,
  // avoiding a second, incomplete country list alongside the UI catalog.
  if (typeof Intl.DisplayNames !== "function") {
    COUNTRY_CODE_CACHE.set(normalized, null);
    return null;
  }
  const locales = ["es", "en", "pt", "fr", "de", "it"];
  for (const locale of locales) {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        const label = names.of(code);
        if (label && label !== code && normalizeLocation(label) === normalized) {
          COUNTRY_CODE_CACHE.set(normalized, code);
          return code;
        }
      }
    }
  }
  COUNTRY_CODE_CACHE.set(normalized, null);
  return null;
}

function requestedLocationParts(rawLocation) {
  const parts = String(rawLocation || "").split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
  const countryParts = parts.map((part) => ({ part, code: countryCodeForLabel(part) })).filter((item) => item.code);
  const countryCode = countryParts.length ? countryParts[0].code : null;
  const localityParts = parts.filter((part) => !countryParts.some((item) => item.part === part));
  return { parts, countryCode, locality: localityParts.at(-1) || parts.at(-1) || "" };
}

function exactLocationCandidate(candidate, requested, countryCode) {
  if (!candidate || typeof candidate.canonical_name !== "string" || typeof candidate.name !== "string") return false;
  if (countryCode && String(candidate.country_code || "").toUpperCase() !== countryCode) return false;
  const type = normalizeLocation(candidate.target_type);
  if (/university|airport|dma|metro|neighborhood|postal|zip|county subdivision/.test(type)) return false;
  const term = normalizeLocation(requested);
  const name = normalizeLocation(candidate.name);
  const canonical = normalizeLocation(candidate.canonical_name);
  const aliases = {
    "islas canarias": ["canary islands"], "canarias": ["canary islands"],
    "islas baleares": ["balearic islands"], "pais vasco": ["basque country"],
    "nueva york": ["new york"],
  };
  const acceptedTerms = [term, ...(aliases[term] || [])];
  return acceptedTerms.some((value) => value && (name === value || canonical.startsWith(`${value} `) || canonical.includes(` ${value} `)));
}

async function resolveSearchLocation(rawLocation) {
  const requested = requestedLocationParts(rawLocation);
  const queryOnly = () => ({ canonicalName: null, countryCode: requested.countryCode, mode: "query_only" });
  if (!requested.locality) return queryOnly();

  try {
    const url = new URL("https://serpapi.com/locations.json");
    url.searchParams.set("q", requested.locality);
    url.searchParams.set("limit", "10");
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(LOCATION_LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return queryOnly();
    const locations = await response.json();
    if (!Array.isArray(locations)) return queryOnly();
    const matches = locations
      .filter((item) => exactLocationCandidate(item, requested.locality, requested.countryCode))
      .sort((a, b) => Number(b.reach || 0) - Number(a.reach || 0));
    const matchingCountries = new Set(matches.map((item) => String(item.country_code || "").toUpperCase()).filter(Boolean));
    if (!matches.length || (!requested.countryCode && matchingCountries.size > 1)) {
      return queryOnly();
    }
    const match = matches[0];
    return {
      canonicalName: match.canonical_name.slice(0, 180),
      countryCode: String(match.country_code || "").toUpperCase() || null,
      mode: "provider_location",
    };
  } catch {
    // Provider location is optional. The exact location terms remain in q,
    // so a catalog outage must not broaden the requested geographic scope.
    return queryOnly();
  }
}

async function lookup(query, location, source, apiKey) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  // SerpApi's Google endpoint returns one page of organic results by default.
  // Its documented pagination uses `start`; `num` is not a supported parameter.
  // One page per selected source keeps the free-plan cost predictable.
  url.searchParams.set("api_key", apiKey);
  if (location.canonicalName) url.searchParams.set("location", location.canonicalName);
  if (location.countryCode) url.searchParams.set("gl", location.countryCode.toLowerCase());
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (response.status === 429) throw new Error("provider_rate_limited");
  if (response.status === 401 || response.status === 403) throw new Error("provider_credentials_rejected");
  let data;
  try {
    data = await response.json();
  } catch {
    if (response.status === 400) throw new Error("provider_request_rejected");
    if (!response.ok) throw new Error("provider_unavailable");
    throw new Error("provider_unavailable");
  }
  if (response.status === 400 || data.error) {
    const detail = String(data.error || data.message || "").toLowerCase();
    if (/api[ _-]?key|credential|unauthori[sz]ed/.test(detail)) throw new Error("provider_credentials_rejected");
    if (/location|geograph|uule|latitude|longitude/.test(detail)) throw new Error("provider_location_rejected");
    if (/query|parameter|invalid search|unsupported engine|search term/.test(detail)) throw new Error("provider_query_rejected");
    throw new Error("provider_request_rejected");
  }
  if (!response.ok) throw new Error("provider_unavailable");
  const organicResults = Array.isArray(data.organic_results) ? data.organic_results : [];
  const profileResults = organicResults.map((item) => safeResult(item, source)).filter(Boolean);
  return {
    results: profileResults.slice(0, MAX_RESULTS),
    organicCount: organicResults.length,
    profileCount: profileResults.length,
  };
}

async function freeBudgetAllows(apiKey, searchesNeeded) {
  try {
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
  } catch {
    return { allowed: false, reason: "budget_unavailable" };
  }
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
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
    const pathname = new URL(request.url).pathname;
    const isHealthCheck = request.method === "GET" && pathname === "/api/health";
    if (!isHealthCheck && (request.method !== "POST" || pathname !== "/api/search")) return json({ error: "not_found" }, 404, allowedOrigin);
    if (!env.SERPAPI_KEY) return json({ error: "not_configured" }, 503, allowedOrigin);
    if (!env.SEARCH_LIMITER) return json({ error: "rate_limit_not_configured" }, 503, allowedOrigin);

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const limit = await env.SEARCH_LIMITER.limit({ key: clientIp });
    if (!limit.success) return json({ error: "rate_limited" }, 429, allowedOrigin, { "Retry-After": "60" });

    if (isHealthCheck) {
      const budget = await freeBudgetAllows(env.SERPAPI_KEY, 1);
      return json({ ready: budget.allowed, error: budget.allowed ? null : budget.reason, usesSearchCredit: false }, budget.allowed ? 200 : 503, allowedOrigin);
    }

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

    // The free locations catalog validates/canonicalizes search origin once
    // per run. It never spends a paid search; `q` always retains the exact
    // locality even when the catalog cannot confirm it.
    const location = await resolveSearchLocation(plan.location);
    // Query selected sources concurrently: sequential timeouts could leave a
    // four-source search waiting up to two minutes before reporting failure.
    const settledSources = await Promise.all(plan.queries.map(async (entry) => {
      try {
        return { source: entry.source, ...await lookup(entry.query, location, entry.source, env.SERPAPI_KEY) };
      } catch (error) {
        return { source: entry.source, error: safeProviderErrorCode(error) };
      }
    }));
    const resultsBySource = settledSources.filter((item) => Array.isArray(item.results)).map((item) => item.results);
    const sourceErrors = settledSources.filter((item) => item.error).map((item) => ({ source: item.source, code: item.error }));
    const sourceDiagnostics = settledSources.map((item) => ({
      source: item.source,
      status: item.error ? "error" : item.profileCount ? "profiles_found" : item.organicCount ? "no_public_profiles" : "no_indexed_results",
      organicCount: Number(item.organicCount) || 0,
      profileCount: Number(item.profileCount) || 0,
      code: item.error || null,
    }));
    const results = takeBalanced(resultsBySource);
    if (!results.length && sourceErrors.length === plan.queries.length) {
      const rateLimited = sourceErrors.some((error) => error.code === "provider_rate_limited");
      return json({ error: rateLimited ? "provider_rate_limited" : "sources_unavailable", sourceErrors, sourceDiagnostics }, rateLimited ? 429 : 502, allowedOrigin);
    }
    return json({ results, sourceErrors, sourceDiagnostics, count: results.length, locationContext: { mode: location.mode, canonicalName: location.canonicalName, countryCode: location.countryCode } }, 200, allowedOrigin);
  },
};

export { validatePlan, validProfileUrl, safeResult, takeBalanced, freeBudgetAllows, countryCodeForLabel, requestedLocationParts, exactLocationCandidate, resolveSearchLocation };
