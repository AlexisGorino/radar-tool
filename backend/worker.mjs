const SOURCES = Object.freeze({
  linkedin: { domain: "linkedin.com", path: /^\/(?:in|pub)\//i },
  github: { domain: "github.com", path: /^\/[^/]+\/?$/i },
  stackoverflow: { domain: "stackoverflow.com", path: /^\/users\/\d+\//i },
  xing: { domain: "xing.com", path: /^\/profile\//i },
  behance: { domain: "behance.net", path: /^\/[^/]+\/?$/i },
});
const PUBLIC_SOURCE_IDS = new Set(["linkedin", "github"]);
const MAX_SOURCES = PUBLIC_SOURCE_IDS.size;
const MAX_RESULTS = 20;
const MAX_QUERY_LENGTH = 900;
const MAX_BODY_BYTES = 12_000;
const MAX_GITHUB_PROFILES = 10;
const LOCATION_LOOKUP_TIMEOUT_MS = 4_000;
const SEARCH_TIMEOUT_MS = 30_000;
const BRAVE_TIMEOUT_MS = 15_000;
const GITHUB_TIMEOUT_MS = 8_000;
const COUNTRY_CODE_CACHE = new Map();
const PROVIDER_ERROR_CODES = new Set([
  "provider_rate_limited",
  "provider_credentials_rejected",
  "provider_location_rejected",
  "provider_query_rejected",
  "provider_request_rejected",
  "provider_timeout",
  "provider_network_error",
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
  if (typeof body.location !== "string" || body.location.length > 180) return false;
  const unique = new Set();
  const requested = requestedLocationParts(body.location);
  if (!requested.countryCode) return false;
  return body.queries.every((entry) => {
    if (!entry || !PUBLIC_SOURCE_IDS.has(entry.source) || typeof entry.query !== "string") return false;
    const query = entry.query.trim();
    if (query.length < 5 || query.length > MAX_QUERY_LENGTH) return false;
    if (entry.source === "linkedin" && !query.toLowerCase().includes("site:linkedin.com/in")) return false;
    if (entry.source === "github") {
      const location = query.match(/\blocation:"([^"\r\n]{1,100})"/i);
      if (!location || normalizeLocation(location[1]) !== normalizeLocation(requested.locality)
        || !/\btype:user\b/i.test(query) || !/\blanguage:[\w+#.-]+/i.test(query)
        || /\b(?:site|in):/i.test(query)) return false;
      if (entry.profileEvidence !== undefined) {
        const evidence = entry.profileEvidence;
        if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
        for (const key of ["required", "alternatives", "role"]) {
          if (!Array.isArray(evidence[key]) || evidence[key].length > 8
            || evidence[key].some((term) => typeof term !== "string" || !term.trim() || term.length > 100)) return false;
        }
      }
    }
    if (unique.has(entry.source)) return false;
    unique.add(entry.source);
    return true;
  });
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
  if (normalized === "chile") {
    COUNTRY_CODE_CACHE.set(normalized, null);
    return null;
  }
  const aliases = {
    "usa": "US", "eeuu": "US", "estados unidos": "US", "united states": "US",
    "uk": "GB", "gran bretana": "GB", "reino unido": "GB", "united kingdom": "GB",
    "espana": "ES", "spain": "ES", "argentina": "AR", "brasil": "BR", "brazil": "BR",
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

function profileHasExactLocation(result, rawLocation) {
  const requested = requestedLocationParts(rawLocation);
  if (!requested.countryCode || !requested.locality) return false;
  const text = " " + normalizeLocation(String(result.title || "") + " " + String(result.snippet || "")) + " ";
  const localityAliases = {
    "islas canarias": ["canary islands"],
    "canarias": ["canary islands"],
    "islas baleares": ["balearic islands"],
    "pais vasco": ["basque country"],
  };
  const localityNames = [requested.locality, ...(localityAliases[normalizeLocation(requested.locality)] || [])];
  const countryNames = [requested.parts.find((part) => countryCodeForLabel(part) === requested.countryCode), requested.countryCode];
  if (typeof Intl.DisplayNames === "function") {
    for (const locale of ["es", "en", "pt", "fr", "de", "it"]) {
      const name = new Intl.DisplayNames([locale], { type: "region" }).of(requested.countryCode);
      if (name && name !== requested.countryCode) countryNames.push(name);
    }
  }
  const hasAnyPhrase = (values) => values.some((value) => {
    const normalized = normalizeLocation(value);
    return normalized && text.includes(" " + normalized + " ");
  });
  return hasAnyPhrase(localityNames) && hasAnyPhrase(countryNames);
}

async function lookupBrave(query, source, rawLocation, apiKey) {
  const requested = requestedLocationParts(rawLocation);
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");
  url.searchParams.set("extra_snippets", "true");
  if (requested.countryCode) url.searchParams.set("country", requested.countryCode);
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": apiKey },
    signal: AbortSignal.timeout(BRAVE_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) throw new Error("provider_credentials_rejected");
  if (response.status === 429 || response.status === 402) throw new Error("provider_rate_limited");
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("provider_unavailable");
  }
  if (!response.ok) throw new Error("provider_unavailable");
  const webResults = data && data.web && Array.isArray(data.web.results) ? data.web.results : [];
  const results = webResults.map((item, index) => safeResult({
    link: item.url,
    title: item.title,
    snippet: [item.description, ...(Array.isArray(item.extra_snippets) ? item.extra_snippets : [])].filter(Boolean).join(" · ").slice(0, 800),
    position: index + 1,
  }, source)).filter(Boolean);
  return { results: results.slice(0, MAX_RESULTS), organicCount: webResults.length, profileCount: results.length };
}

async function lookupLinkedIn(query, location, rawLocation, googleKey, braveKey, googleAllowed) {
  let googleResult = null;
  let googleError = null;
  const providerErrors = [];
  if (googleAllowed && googleKey) {
    try {
      googleResult = await lookup(query, location, "linkedin", googleKey);
    } catch (error) {
      googleError = error;
      providerErrors.push({ provider: "Google", code: safeProviderErrorCode(error) });
    }
  }

  const confirmedLocationCount = googleResult
    ? googleResult.results.filter((item) => profileHasExactLocation(item, rawLocation)).length
    : 0;
  const shouldExpand = Boolean(braveKey) && (!googleResult || confirmedLocationCount < 3);
  let braveResult = null;
  if (shouldExpand) {
    try {
      braveResult = await lookupBrave(query, "linkedin", rawLocation, braveKey);
    } catch (error) {
      providerErrors.push({ provider: "Brave", code: safeProviderErrorCode(error) });
    }
  }

  const resultsByUrl = new Map();
  for (const item of [...(googleResult?.results || []), ...(braveResult?.results || [])]) {
    const current = resultsByUrl.get(item.url);
    if (!current || String(item.snippet || "").length > String(current.snippet || "").length) resultsByUrl.set(item.url, item);
  }
  const results = [...resultsByUrl.values()].slice(0, MAX_RESULTS);
  if (!googleResult && !braveResult) {
    const failure = providerErrors.at(-1);
    throw new Error(failure?.code || (googleError ? safeProviderErrorCode(googleError) : "provider_unavailable"));
  }
  const engines = [];
  if (googleResult) engines.push("Google");
  if (braveResult) engines.push("Brave");
  return {
    results,
    organicCount: (googleResult?.organicCount || 0) + (braveResult?.organicCount || 0),
    profileCount: results.length,
    ...(engines.length > 1 || engines[0] === "Brave" ? { engines } : {}),
    ...(providerErrors.length ? { providerErrors } : {}),
  };
}

function exactGithubLocation(profileLocation, rawLocation) {
  const requested = requestedLocationParts(rawLocation);
  const profileParts = String(profileLocation || "").split(/[,;|·]/).map(normalizeLocation).filter(Boolean);
  if (!profileParts.length || !requested.locality || !requested.countryCode) return false;
  const localityAliases = {
    "islas canarias": ["canary islands"], "canarias": ["canary islands"],
    "islas baleares": ["balearic islands"], "pais vasco": ["basque country"],
  };
  const localityTerms = new Set([requested.locality, ...(localityAliases[normalizeLocation(requested.locality)] || [])]
    .map(normalizeLocation).filter(Boolean));
  if (!profileParts.some((part) => localityTerms.has(part))) return false;
  const names = [];
  names.push(requested.countryCode);
  const requestedCountry = requested.parts.find((part) => countryCodeForLabel(part) === requested.countryCode);
  if (requestedCountry) names.push(requestedCountry);
  if (typeof Intl.DisplayNames === "function") {
    for (const locale of ["es", "en", "pt", "fr", "de", "it"]) {
      const name = new Intl.DisplayNames([locale], { type: "region" }).of(requested.countryCode);
      if (name && name !== requested.countryCode) names.push(name);
    }
  }
  const countryNames = new Set(names.map(normalizeLocation).filter(Boolean));
  return profileParts.some((part) => countryNames.has(part));
}

async function githubRequest(url, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RADAR-Talent-Discovery",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(GITHUB_TIMEOUT_MS),
  });
  if (response.status === 403 || response.status === 429) {
    if (response.headers.get("X-RateLimit-Remaining") === "0" || response.headers.has("Retry-After") || response.status === 429) throw new Error("provider_rate_limited");
    throw new Error("source_unavailable");
  }
  if (response.status === 422) throw new Error("provider_query_rejected");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("source_unavailable");
  return response.json();
}

async function lookupGithubUsers(query, rawLocation, token, profileEvidence = {}) {
  const url = new URL("https://api.github.com/search/users");
  url.searchParams.set("q", query);
  url.searchParams.set("per_page", String(MAX_GITHUB_PROFILES));
  const data = await githubRequest(url.toString(), token);
  if (!data || !Array.isArray(data.items)) throw new Error("source_unavailable");
  const language = query.match(/\blanguage:([\w+#.-]+)/i)?.[1] || "";
  const requiredSignals = Array.isArray(profileEvidence.required) ? profileEvidence.required : [];
  const alternativeSignals = Array.isArray(profileEvidence.alternatives) ? profileEvidence.alternatives : [];
  const roleSignals = Array.isArray(profileEvidence.role) ? profileEvidence.role : [];
  const details = await Promise.all(data.items.slice(0, MAX_GITHUB_PROFILES).map(async (user) => {
    const login = String(user && user.login || "");
    if (!/^[a-z\d-]{1,39}$/i.test(login)) return null;
    const profileUrl = new URL(`/users/${encodeURIComponent(login)}`, "https://api.github.com");
    const profile = await githubRequest(profileUrl.toString(), token);
    if (!profile || !exactGithubLocation(profile.location, rawLocation)) return null;
    const normalizedBio = normalizeLocation(profile.bio || "");
    if (requiredSignals.some((term) => !normalizedBio.includes(normalizeLocation(term)))) return null;
    if (alternativeSignals.length && !alternativeSignals.some((term) => normalizedBio.includes(normalizeLocation(term)))) return null;
    if (roleSignals.length && !roleSignals.some((term) => normalizedBio.includes(normalizeLocation(term)))) return null;
    const title = `${String(profile.name || profile.login).slice(0, 100)} - ${String(profile.bio || "GitHub").slice(0, 120)}`;
    const location = String(profile.location || "").slice(0, 180);
    const bio = String(profile.bio || "").slice(0, 500);
    const repositories = Math.max(0, Number(profile.public_repos) || 0);
    const snippet = [bio, location, language ? `Lenguaje de repositorios: ${language}` : "", repositories ? `${repositories} repositorios públicos` : ""].filter(Boolean).join(" · ").slice(0, 800);
    return safeResult({ link: profile.html_url, title, snippet, position: Number(user.score) || null }, "github");
  }));
  const results = details.filter(Boolean);
  return { results, organicCount: Math.max(0, Number(data.total_count) || data.items.length), profileCount: results.length };
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
    const workerOrigin = new URL(request.url).origin;
    const responseOrigin = requestOrigin === workerOrigin ? workerOrigin : allowedOrigin;
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith("/api/")) {
      if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not found", { status: 404 });
    }
    if (requestOrigin && requestOrigin !== allowedOrigin && requestOrigin !== workerOrigin) {
      return new Response("Origin not allowed", { status: 403 });
    }
    if (request.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": responseOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      },
    });
    const isHealthCheck = request.method === "GET" && pathname === "/api/health";
    if (!isHealthCheck && (request.method !== "POST" || pathname !== "/api/search")) return json({ error: "not_found" }, 404, responseOrigin);
    if (!env.SEARCH_LIMITER) return json({ error: "rate_limit_not_configured" }, 503, responseOrigin);

    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
    const limit = await env.SEARCH_LIMITER.limit({ key: clientIp });
    if (!limit.success) return json({ error: "rate_limited" }, 429, responseOrigin, { "Retry-After": "60" });

    if (isHealthCheck) {
      const braveConfigured = Boolean(env.BRAVE_SEARCH_API_KEY);
      const budget = env.SERPAPI_KEY
        ? await freeBudgetAllows(env.SERPAPI_KEY, 1)
        : { allowed: false, reason: "not_configured" };
      const ready = budget.allowed || braveConfigured;
      return json({
        ready,
        error: ready ? null : budget.reason,
        usesSearchCredit: false,
        braveConfigured,
      }, ready ? 200 : 503, responseOrigin);
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: "request_too_large" }, 413, responseOrigin);
    let plan;
    try {
      plan = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, responseOrigin);
    }
    if (!validatePlan(plan)) return json({ error: "invalid_search_plan" }, 400, responseOrigin);

    const linkedinQueries = plan.queries.filter((entry) => entry.source === "linkedin");
    const githubQueries = plan.queries.filter((entry) => entry.source === "github");
    const sourceErrorsBeforeSearch = [];
    let googleLinkedinAllowed = false;
    let googleBudgetError = null;
    if (linkedinQueries.length && env.SERPAPI_KEY) {
      const budget = await freeBudgetAllows(env.SERPAPI_KEY, linkedinQueries.length);
      googleLinkedinAllowed = budget.allowed;
      if (!budget.allowed) googleBudgetError = budget.reason;
    } else if (linkedinQueries.length) {
      googleBudgetError = "provider_credentials_rejected";
    }
    const braveConfigured = Boolean(env.BRAVE_SEARCH_API_KEY);
    if (linkedinQueries.length && !googleLinkedinAllowed && !braveConfigured) {
      sourceErrorsBeforeSearch.push({ source: "linkedin", code: googleBudgetError || "provider_credentials_rejected" });
    }

    // The free locations catalog validates/canonicalizes search origin once
    // per run. It never spends a paid search; `q` always retains the exact
    // locality even when the catalog cannot confirm it.
    const location = await resolveSearchLocation(plan.location);
    // Query selected sources concurrently: sequential timeouts could leave a
    // four-source search waiting up to two minutes before reporting failure.
    const activeQueries = [
      ...(googleLinkedinAllowed || braveConfigured
        ? linkedinQueries.map((entry) => ({ ...entry, googleAllowed: googleLinkedinAllowed }))
        : []),
      ...githubQueries,
    ];
    const settledSources = await Promise.all(activeQueries.map(async (entry) => {
      try {
        const result = entry.source === "github"
          ? await lookupGithubUsers(entry.query, plan.location, env.GITHUB_TOKEN, entry.profileEvidence)
          : await lookupLinkedIn(entry.query, location, plan.location, env.SERPAPI_KEY, env.BRAVE_SEARCH_API_KEY, entry.googleAllowed);
        return { source: entry.source, ...await result };
      } catch (error) {
        return { source: entry.source, error: safeProviderErrorCode(error) };
      }
    }));
    const resultsBySource = settledSources.filter((item) => Array.isArray(item.results)).map((item) => item.results);
    const sourceErrors = [
      ...sourceErrorsBeforeSearch,
      ...settledSources.flatMap((item) => [
        ...(item.error ? [{ source: item.source, code: item.error }] : []),
        ...(item.providerErrors || []).map((providerError) => ({ source: item.source, code: providerError.code })),
      ]),
    ];
    const sourceDiagnostics = [
      ...sourceErrorsBeforeSearch.map((item) => ({ ...item, status: "error", organicCount: 0, profileCount: 0 })),
      ...settledSources.map((item) => ({
        source: item.source,
        status: item.error ? "error" : item.profileCount ? "profiles_found" : item.organicCount ? "no_public_profiles" : "no_indexed_results",
        organicCount: Number(item.organicCount) || 0,
        profileCount: Number(item.profileCount) || 0,
        code: item.error || item.providerErrors?.[0]?.code || null,
        ...(item.engines ? { engines: item.engines } : {}),
        ...(item.providerErrors ? { providerErrors: item.providerErrors } : {}),
      })),
    ];
    const results = takeBalanced(resultsBySource);
    if (!results.length && sourceErrors.length === plan.queries.length) {
      const rateLimited = sourceErrors.some((error) => error.code === "provider_rate_limited");
      return json({ error: rateLimited ? "provider_rate_limited" : "sources_unavailable", sourceErrors, sourceDiagnostics }, rateLimited ? 429 : 502, responseOrigin);
    }
    return json({ results, sourceErrors, sourceDiagnostics, count: results.length, locationContext: { mode: location.mode, canonicalName: location.canonicalName, countryCode: location.countryCode } }, 200, responseOrigin);
  },
};

export { validatePlan, validProfileUrl, safeResult, takeBalanced, freeBudgetAllows, countryCodeForLabel, requestedLocationParts, exactLocationCandidate, resolveSearchLocation, exactGithubLocation, lookupGithubUsers, lookupBrave, profileHasExactLocation };
