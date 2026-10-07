// Public-profile discovery: query planning, source validation and evidence scoring.
// The provider adapter is deliberately separate so API keys never reach this file.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RadarTalentDiscovery = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SOURCES = Object.freeze({
    linkedin: { label: "LinkedIn", domain: "linkedin.com", path: /^\/(?:in|pub)\//i },
    github: { label: "GitHub", domain: "github.com", path: /^\/[^/]+\/?$/i },
    stackoverflow: { label: "Stack Overflow", domain: "stackoverflow.com", path: /^\/users\/\d+\//i },
    xing: { label: "Xing", domain: "xing.com", path: /^\/profile\//i },
    behance: { label: "Behance", domain: "behance.net", path: /^\/[^/]+\/?$/i },
  });
  const MAX_SOURCES = 4;
  const MAX_RESULTS = 50;
  const MAX_QUERY_LENGTH = 900;

  function cleanTerms(values) {
    return (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => value && value.length <= 100)
      .slice(0, 8);
  }

  function buildPlan(state, recommendations, generator) {
    const allowed = new Set(Object.keys(SOURCES));
    const chosen = (Array.isArray(recommendations) ? recommendations : [])
      .map((entry) => typeof entry === "string" ? entry : entry && entry.id)
      .filter((id, index, all) => allowed.has(id) && all.indexOf(id) === index)
      .slice(0, MAX_SOURCES);
    const skippedSources = [];
    const plan = chosen.map((id) => {
      const source = SOURCES[id];
      const tiers = generator.buildXRayTiers(state, id === "linkedin" ? "linkedin.com/in" : source.domain, false, id === "stackoverflow" || id === "xing");
      const usable = tiers.find((tier) => tier.query && tier.query.length <= MAX_QUERY_LENGTH);
      if (!usable) {
        skippedSources.push(id);
        return null;
      }
      return { source: id, query: usable.query, label: source.label };
    }).filter(Boolean);
    const location = cleanTerms(state.alcance).join(", ");
    return { queries: plan, maxResults: MAX_RESULTS, location, skippedSources };
  }

  function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function validateProfileUrl(rawUrl, sourceId) {
    const source = SOURCES[sourceId];
    if (!source) return null;
    try {
      const url = new URL(rawUrl);
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      if (url.protocol !== "https:" || (host !== source.domain && !host.endsWith("." + source.domain))) return null;
      if (!source.path.test(url.pathname)) return null;
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } catch {
      return null;
    }
  }

  function parseDisplayName(title, sourceId) {
    const label = SOURCES[sourceId] && SOURCES[sourceId].label;
    if (!label || !title) return "";
    const clean = String(title).replace(/\s+/g, " ").trim();
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const suffix = new RegExp(`(?:\\s*(?:[|·—–-])\\s*${escaped})(?:\\s*\\|.*)?\\s*$`, "i");
    if (!suffix.test(clean)) return "";
    const withoutSource = clean.replace(suffix, "").trim();
    const candidate = withoutSource.split(/\s[|·—–-]\s/, 1)[0].trim();
    // A name is surfaced only when the source title provides a distinct
    // 2–5 word prefix. Otherwise retain the profile URL and say it is unknown.
    if (candidate === clean || candidate.length > 70 || candidate.split(/\s+/).length < 2 || candidate.split(/\s+/).length > 4) return "";
    if (/\b(profile|perfil|jobs|empleo|vacante|company|empresa|developer|engineer|designer|recruiter|consultant|technician|tecnico|técnico|manager|analyst|analista|software|telecom|auditor)\b/i.test(candidate)) return "";
    return candidate;
  }

  function termEvidence(text, state) {
    const searchable = normalizeText(text);
    const required = cleanTerms(state.imprescindibles);
    const alternatives = cleanTerms(state.atributos);
    const role = cleanTerms(state.rol);
    const location = cleanTerms(state.alcance);
    const hits = (terms) => terms.filter((term) => searchable.includes(normalizeText(term)));
    const roleHits = hits(role);
    const requiredHits = hits(required);
    const alternativeHits = hits(alternatives);
    const locationHits = hits(location);
    const specificLocation = location.length ? location[location.length - 1] : "";
    const specificLocationHit = specificLocation && searchable.includes(normalizeText(specificLocation));
    const mandatoryCoverage = required.length ? requiredHits.length / required.length : 0;
    const attributeCoverage = alternatives.length ? alternativeHits.length / alternatives.length : 0;
    const roleCoverage = role.length ? (roleHits.length ? 1 : 0) : 0;
    const locationCoverage = location.length ? (specificLocationHit ? 1 : locationHits.length ? 0.35 : 0) : 0;
    // This ranks only visible text. Missing snippet evidence remains unknown,
    // never a factual rejection of the candidate.
    const activeWeight = (required.length ? 45 : 0) + (alternatives.length ? 25 : 0) + (role.length ? 15 : 0) + (location.length ? 15 : 0);
    const evidencePoints = 45 * mandatoryCoverage + 25 * Math.min(1, attributeCoverage) + 15 * roleCoverage + 15 * locationCoverage;
    const score = activeWeight ? Math.round((evidencePoints / activeWeight) * 100) : 0;
    const visibleSignals = [...new Set([...requiredHits, ...alternativeHits, ...roleHits, ...locationHits])];
    const locationStatus = !location.length ? "Sin filtro geográfico" : specificLocationHit ? "Localidad visible" : locationHits.length ? "País o región visible; localidad sin confirmar" : "Ubicación no confirmada";
    const confidence = score >= 70 && (!location.length || specificLocationHit) ? "Señales fuertes" : score >= 40 ? "Revisar evidencia" : "Evidencia limitada";
    const scoreBreakdown = [
      required.length ? `Imprescindibles ${requiredHits.length}/${required.length}` : "Sin imprescindibles",
      alternatives.length ? `Alternativas ${alternativeHits.length}/${alternatives.length}` : "Sin alternativas",
      role.length ? `Cargo ${roleHits.length}/${role.length}` : "Sin título obligatorio",
      location.length ? locationStatus : "Sin filtro geográfico",
    ];
    return { score, confidence, locationStatus, visibleSignals, scoreBreakdown, requiredHits, roleHits, alternativeHits, locationHits, specificLocationHit: Boolean(specificLocationHit) };
  }

  function normalizeResults(payload, state) {
    const raw = Array.isArray(payload && payload.results) ? payload.results : [];
    const seen = new Set();
    const normalized = [];
    raw.forEach((item) => {
      const sourceId = item && item.source;
      const url = validateProfileUrl(item && item.url, sourceId);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const title = String(item.title || "").slice(0, 240);
      const snippet = String(item.snippet || "").slice(0, 800);
      const evidence = termEvidence(`${title} ${snippet}`, state);
      normalized.push({
        source: sourceId,
        sourceLabel: SOURCES[sourceId].label,
        url,
        title: title || "Perfil público",
        name: parseDisplayName(title, sourceId),
        snippet,
        providerPosition: Number.isFinite(Number(item.position)) ? Number(item.position) : null,
        ...evidence,
      });
    });
    normalized.sort((a, b) => b.score - a.score || (a.providerPosition || 999) - (b.providerPosition || 999));
    return normalized.slice(0, MAX_RESULTS);
  }

  async function search(endpoint, plan, state, fetchImpl) {
    const fetcher = fetchImpl || fetch;
    if (!endpoint) throw new Error("La búsqueda de perfiles públicos todavía no está configurada en este entorno.");
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify(plan),
    });
    const payload = await response.json();
    if (payload.error === "free_quota_exhausted") throw new Error("Se agotó el cupo gratuito mensual; RADAR no inició consultas que pudieran generar cargos.");
    if (payload.error === "free_plan_required") throw new Error("La búsqueda está pausada: el proveedor debe tener un plan gratuito activo para mantener el costo en USD 0.");
    if (payload.error === "budget_unavailable") throw new Error("RADAR no pudo verificar que la cuenta siga dentro del plan gratuito; no inició la búsqueda.");
    if (response.status === 429) throw new Error("Se alcanzó el límite temporal de búsquedas. Probá más tarde.");
    if (response.status === 503) throw new Error("La búsqueda pública no está disponible ahora. Revisá la configuración del proveedor.");
    if (!response.ok) throw new Error(`El proveedor de búsqueda respondió con un error (${response.status}).`);
    return {
      results: normalizeResults(payload, state),
      sourceErrors: Array.isArray(payload.sourceErrors) ? payload.sourceErrors : [],
      count: Number(payload.count) || 0,
    };
  }

  return { SOURCES, MAX_SOURCES, MAX_RESULTS, buildPlan, validateProfileUrl, parseDisplayName, termEvidence, normalizeResults, search };
});
