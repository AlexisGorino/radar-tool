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
    linkedin: { label: "LinkedIn", domain: "linkedin.com", path: /^\/(?:in|pub)\//i, description: "Perfiles profesionales de distintos rubros. El buscador público puede omitir perfiles privados o no indexados." },
    github: { label: "GitHub", domain: "github.com", path: /^\/[^/]+\/?$/i, description: "Actividad y proyectos públicos, sobre todo para tecnología. No demuestra experiencia laboral ni disponibilidad." },
    stackoverflow: { label: "Stack Overflow", domain: "stackoverflow.com", path: /^\/users\/\d+\//i, description: "Participación técnica pública en preguntas y respuestas; útil para perfiles de ingeniería." },
    xing: { label: "Xing", domain: "xing.com", path: /^\/profile\//i, description: "Perfiles profesionales con mayor presencia en Alemania, Austria y Suiza." },
    behance: { label: "Behance", domain: "behance.net", path: /^\/[^/]+\/?$/i, description: "Portfolios de diseño, UX/UI e ilustración; no es fuente adecuada para la mayoría de los otros puestos." },
  });
  const MAX_SOURCES = 4;
  const MAX_RESULTS = 40;
  const MAX_QUERY_LENGTH = 900;

  function cleanTerms(values) {
    return (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => value && value.length <= 100)
      .slice(0, 8);
  }

  function expandRoleFamily(roles, seniority) {
    const original = cleanTerms(roles);
    const normalized = normalizeText(original.join(" "));
    const projectManagement = /\b(?:jefe de proyectos?|gerente de proyectos?|project manager|project coordinator|coordinador de proyectos?)\b/.test(normalized);
    if (!projectManagement) return original;
    const juniorContext = normalizeText([...(Array.isArray(seniority) ? seniority : []), ...original].join(" "));
    const junior = /\b(?:junior|jr|trainee|pasante|practicante|intern)\b/.test(juniorContext);
    const aliases = junior
      ? ["Jefe de Proyecto", "Jefe de Proyectos", "Project Manager", "Junior Project Manager", "Coordinador de Proyectos", "Coordinador de Proyectos Junior"]
      : ["Jefe de Proyecto", "Jefe de Proyectos", "Project Manager", "Coordinador de Proyectos", "Project Coordinator", "PMO Analyst"];
    const seen = new Set(original.map(normalizeText));
    aliases.forEach((term) => {
      if (!seen.has(normalizeText(term)) && original.length < 6) {
        original.push(term);
        seen.add(normalizeText(term));
      }
    });
    return original;
  }

  function buildPlan(state, recommendations, generator, options) {
    const strategy = options && options.strategy || "precise";
    const allowed = new Set(Object.keys(SOURCES));
    const chosen = (Array.isArray(recommendations) ? recommendations : [])
      .map((entry) => typeof entry === "string" ? entry : entry && entry.id)
      .filter((id, index, all) => allowed.has(id) && all.indexOf(id) === index)
      .slice(0, MAX_SOURCES);
    const skippedSources = [];
    const plan = chosen.map((id) => {
      const source = SOURCES[id];
      // Project management vacancies use several standard title families in
      // LATAM and Spain. Expand only this well-defined family, while keeping
      // the JD's requirements and its most specific location in the query.
      const queryState = strategy === "market"
        ? { ...state, rol: [], dominio: [] }
        : { ...state, rol: expandRoleFamily(state.rol, state.seniority) };
      const tiers = generator.buildXRayTiers(queryState, id === "linkedin" ? "linkedin.com/in" : source.domain, false, id === "stackoverflow" || id === "xing");
      const preferred = strategy === "equivalent"
        ? tiers.find((tier) => tier.label.includes("sin título")) || tiers[1]
        : tiers[0];
      const usable = preferred && preferred.query && preferred.query.length <= MAX_QUERY_LENGTH ? preferred : null;
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
    const parts = clean.split(/\s+(?:[|·—–-])\s+/).map((part) => part.trim()).filter(Boolean);
    // Search engines commonly put the person first and the headline after a
    // dash, with or without the source name at the end. A delimiter is
    // required so a headline-only result is never presented as a person's name.
    if (parts.length < 2) return "";
    if (normalizeText(parts[parts.length - 1]) === normalizeText(label)) parts.pop();
    if (/\b(portfolio|portafolio|profile|perfil)\b/.test(normalizeText(parts.slice(1).join(" ")))) return "";
    const candidate = parts[0] || "";
    const words = candidate.split(/\s+/);
    // Allow compound surnames and initials, but reject role headlines and
    // phrases with sentence-like casing. False names are worse than no name.
    if (candidate.length > 70 || words.length < 2 || words.length > 6) return "";
    const particles = new Set(["da", "das", "de", "del", "der", "di", "dos", "du", "la", "las", "los", "van", "von", "y"]);
    const nameWords = words.filter((word) => !particles.has(normalizeText(word)));
    if (nameWords.length < 2 || !nameWords.every((word) => /^[A-ZÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ'.’\-]*$/.test(word) || /^[A-ZÁÉÍÓÚÜÑ]{2,}\.?$/.test(word))) return "";
    if (/\b(profile|perfil|jobs|empleo|vacante|company|empresa|developer|engineer|designer|recruiter|consultant|technician|tecnico|técnico|manager|analyst|analista|software|telecom|auditor|ingeniero|instalador|operador|supervisor|specialist|especialista|coordinator|coordinador|administrator|administrador|sales|support|customer|field|senior|junior|tier|network|redes|servicio|service)\b/i.test(normalizeText(candidate))) return "";
    return candidate;
  }

  function termEvidence(text, state) {
    const searchable = normalizeText(text);
    const required = cleanTerms(state.imprescindibles);
    const alternatives = cleanTerms(state.atributos);
    const role = expandRoleFamily(state.rol, state.seniority);
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
    let response;
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify(plan),
      });
    } catch {
      throw new Error("No se pudo conectar con el servicio de búsqueda. Revisá la conexión e intentá de nuevo manualmente.");
    }
    const payload = await response.json();
    if (payload.error === "free_quota_exhausted") throw new Error("Se agotó el cupo gratuito mensual; RADAR no inició consultas que pudieran generar cargos.");
    if (payload.error === "hourly_quota_exhausted") throw new Error("Se alcanzó el cupo horario del proveedor; RADAR no inició la búsqueda. Esperá a que se renueve y volvé a intentar.");
    if (payload.error === "rate_limited") throw new Error("La red compartida alcanzó el límite temporal de RADAR. Esperá un minuto y probá de nuevo.");
    if (payload.error === "provider_rate_limited") throw new Error("SerpApi rechazó temporalmente la consulta por su límite de uso. Revisá el cupo horario o mensual y reintentá más tarde.");
    if (payload.error === "sources_unavailable") {
      const codes = new Set((Array.isArray(payload.sourceErrors) ? payload.sourceErrors : []).map((item) => item.code));
      if (codes.has("provider_credentials_rejected")) throw new Error("El proveedor rechazó la credencial configurada. La consulta no pudo completarse; revisá el secreto SERPAPI_KEY en Cloudflare.");
      if (codes.has("provider_location_rejected")) throw new Error("El proveedor no reconoció la ubicación como contexto de búsqueda. La localidad sigue dentro de la consulta; probá elegir una localidad más específica o buscar solo con el país.");
      if (codes.has("provider_query_rejected")) throw new Error("El proveedor rechazó el formato de búsqueda. RADAR conserva tus filtros; reducí la cantidad de términos y volvé a intentar.");
      if (codes.has("provider_request_rejected")) throw new Error("El proveedor rechazó la consulta. Revisá la ubicación o los términos y probá una búsqueda más breve.");
      if (codes.has("provider_timeout")) throw new Error("El proveedor tardó demasiado en responder. No se obtuvieron perfiles; revisá la conexión e intentá de nuevo manualmente.");
      if (codes.has("provider_network_error")) throw new Error("RADAR no pudo conectarse con el proveedor de búsqueda. Revisá la configuración y probá de nuevo.");
      if (codes.has("provider_unavailable")) throw new Error("El proveedor de búsqueda no respondió correctamente. No se obtuvieron perfiles; probá de nuevo más tarde.");
      if (codes.has("source_unavailable")) throw new Error("La fuente respondió con un error inesperado. No se obtuvieron perfiles; intentá más tarde o probá otra fuente.");
      throw new Error("No se pudo completar la consulta. No se obtuvieron perfiles; revisá la conexión o probá otra fuente.");
    }
    if (payload.error === "free_plan_required") throw new Error("La búsqueda está pausada: el proveedor debe tener un plan gratuito activo para mantener el costo en USD 0.");
    if (payload.error === "budget_unavailable") throw new Error("RADAR no pudo verificar que la cuenta siga dentro del plan gratuito; no inició la búsqueda.");
    if (response.status === 429) throw new Error("El proveedor limitó temporalmente esta búsqueda. Revisá el cupo horario o mensual y probá más tarde.");
    if (response.status === 503) throw new Error("La búsqueda pública no está disponible ahora. Revisá la configuración del proveedor.");
    if (!response.ok) throw new Error(`El proveedor de búsqueda respondió con un error (${response.status}).`);
    return {
      results: normalizeResults(payload, state),
      sourceErrors: Array.isArray(payload.sourceErrors) ? payload.sourceErrors : [],
      count: Number(payload.count) || 0,
      locationContext: payload.locationContext && typeof payload.locationContext === "object"
        ? {
          mode: payload.locationContext.mode === "provider_location" ? "provider_location" : "query_only",
          canonicalName: String(payload.locationContext.canonicalName || "").slice(0, 180) || null,
          countryCode: /^[A-Z]{2}$/.test(payload.locationContext.countryCode || "") ? payload.locationContext.countryCode : null,
        }
        : null,
    };
  }

  return { SOURCES, MAX_SOURCES, MAX_RESULTS, buildPlan, expandRoleFamily, validateProfileUrl, parseDisplayName, termEvidence, normalizeResults, search };
});
