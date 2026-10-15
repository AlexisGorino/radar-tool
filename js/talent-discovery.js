// Public-profile discovery: query planning, source validation and evidence scoring.
// The provider adapter is deliberately separate so API keys never reach this file.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./countries.js"));
  } else {
    root.RadarTalentDiscovery = factory(root.RadarCountries);
  }
})(typeof self !== "undefined" ? self : this, function (countries) {
  "use strict";

  const SOURCES = Object.freeze({
    linkedin: { label: "LinkedIn", domain: "linkedin.com", path: /^\/(?:in|pub)\//i, description: "Perfiles profesionales públicos; algunos no aparecen indexados." },
    github: { label: "GitHub", domain: "github.com", path: /^\/[^/]+\/?$/i, description: "Perfiles técnicos con actividad pública en el lenguaje y la localidad indicados." },
    stackoverflow: { label: "Stack Overflow", domain: "stackoverflow.com", path: /^\/users\/\d+\//i, description: "Respuestas técnicas públicas; útil en ingeniería." },
    xing: { label: "Xing", domain: "xing.com", path: /^\/profile\//i, description: "Más perfiles en Alemania, Austria y Suiza." },
    behance: { label: "Behance", domain: "behance.net", path: /^\/[^/]+\/?$/i, description: "Portfolios de diseño e ilustración." },
  });
  const PUBLIC_SOURCE_IDS = Object.freeze(["linkedin", "github"]);
  const MAX_SOURCES = PUBLIC_SOURCE_IDS.length;
  const MAX_RESULTS = 20;
  const MAX_QUERY_LENGTH = 900;
  const GITHUB_LANGUAGES = ["TypeScript", "JavaScript", "Python", "C++", "C#", "PowerShell", "Kotlin", "Elixir", "Scala", "Ruby", "Swift", "Dart", "Rust", "Java", "PHP", "HCL", "SQL", "Shell", "Lua", "Go", "R"];
  const SEARCH_ROLE_EQUIVALENTS = [
    { match: /\b(?:talent acquisition|recruiter|recruiter it|reclutador|reclutadora|seleccionador|seleccionadora)\b/, aliases: ["Talent Acquisition Specialist", "Recruiter"] },
    { match: /\b(?:(?:consultor(?:a)?|consultant)\s+(?:funcional\s+)?(?:de\s+)?sap\s+(?:fi\s*\/\s*co|fico)|sap\s+(?:fi\s*\/\s*co|fico)\s+(?:consultor(?:a)?|consultant)|sap functional consultant)\b/, aliases: ["SAP FI/CO Consultant", "SAP Functional Consultant"] },
    { match: /\b(?:consultor|consultora|consultant)\b.*\berp\b|\berp\b.*\b(?:consultor|consultora|consultant)\b/, aliases: ["ERP Consultant", "Consultor Funcional ERP"] },
    { match: /\b(?:administrador|administradora|administrator|admin)\b.*\bsalesforce\b|\bsalesforce\b.*\b(?:administrador|administradora|administrator|admin)\b/, aliases: ["Salesforce Administrator", "Salesforce Admin"] },
    { match: /\b(?:consultor|consultora|consultant)\b.*\bdynamics 365\b|\bdynamics 365\b.*\b(?:consultor|consultora|consultant)\b/, aliases: ["Dynamics 365 Consultant", "Microsoft Dynamics Consultant"] },
    { match: /\b(?:analista|analyst)\b.*\bsupply chain\b|\bsupply chain\b.*\b(?:analista|analyst)\b/, aliases: ["Supply Chain Analyst", "Analista de Cadena de Suministro"] },
    { match: /\b(?:auditor interno|internal auditor)\b/, aliases: ["Internal Auditor", "Auditor Interno"] },
    { match: /\b(?:ingeniero|ingeniera|engineer)\b.*\b(?:redes de telecomunicaciones|telecom(?:munications)? network)\b|\b(?:redes de telecomunicaciones|telecom(?:munications)? network)\b.*\b(?:ingeniero|ingeniera|engineer)\b/, aliases: ["Telecommunications Network Engineer", "Ingeniero de Redes"] },
  ];

  function cleanTerms(values) {
    return (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim())
      .filter((value) => value && value.length <= 100)
      .slice(0, 8);
  }

  function expandRoleFamily(roles, seniority) {
    // Vacancy copy often uses Spanish inclusive gender notation ("jefe/a")
    // and article prefixes ("un/a"). Those forms are useful for the review
    // screen, but are rarely written that way in candidate headlines. Normalize
    // them for discovery so we can expand the role family without changing the
    // user's reviewed fields or loosening the location and hard requirements.
    const original = cleanTerms(roles).map((term) => term
      .replace(/^\s*(?:un\/a|una|un)\s+/i, "")
      .replace(/\bjefes\/as\b/gi, "Jefes")
      .replace(/\bjefe\/a\b/gi, "Jefe")
      .replace(/\bcoordinadores\/as\b/gi, "Coordinadores")
      .replace(/\bcoordinador\/a\b/gi, "Coordinador")
      .replace(/\bgerentes\/as\b/gi, "Gerentes")
      .replace(/\bgerente\/a\b/gi, "Gerente")
      .trim());
    const normalized = normalizeText(original.join(" "));
    const projectManagement = /\b(?:jefe de proyectos?|gerente de proyectos?|project manager|project coordinator|coordinador de proyectos?)\b/.test(normalized);
    const qualityAssurance = /\b(?:qa|quality assurance|software test(?:ing)?|test automation)\b/.test(normalized);
    if (qualityAssurance) {
      const aliases = [
        "QA Engineer",
        "QA Automation Engineer",
        "Automation QA Engineer",
        "Test Automation Engineer",
        "Software Test Engineer",
        "Quality Assurance Engineer",
      ];
      const seen = new Set(original.map(normalizeText));
      aliases.forEach((term) => {
        if (!seen.has(normalizeText(term)) && original.length < 6) {
          original.push(term);
          seen.add(normalizeText(term));
        }
      });
      return original;
    }
    const equivalentFamily = SEARCH_ROLE_EQUIVALENTS.find((family) => family.match.test(normalized));
    if (equivalentFamily) {
      const seen = new Set(original.map(normalizeText));
      equivalentFamily.aliases.forEach((term) => {
        if (!seen.has(normalizeText(term)) && original.length < 6) {
          original.push(term);
          seen.add(normalizeText(term));
        }
      });
      return original;
    }
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

  function compactRoleFamily(roles, seniority) {
    const selected = cleanTerms(roles);
    if (selected.length > 1) return selected;
    const expanded = expandRoleFamily(roles, seniority);
    if (expanded.length <= 2) return expanded;
    const seniorityText = normalizeText([...(Array.isArray(seniority) ? seniority : []), ...expanded].join(" "));
    const junior = /\b(?:junior|jr|trainee|pasante|practicante|intern)\b/.test(seniorityText);
    const primary = expanded[0];
    const primaryHasSeniority = /\b(?:senior|sr|ssr|junior|jr|trainee|intern)\b/i.test(primary);
    const baseSignature = normalizeText(primary).replace(/\b(?:senior|sr|ssr|junior|jr|trainee|intern)\b/g, "").replace(/\bproyectos\b/g, "proyecto").replace(/\s+/g, " ").trim();
    const juniorAlias = junior && expanded.slice(1).find((term) => /\b(?:junior|jr|trainee|intern)\b/i.test(term));
    const alias = juniorAlias || expanded.slice(1).find((term) => {
      const signature = normalizeText(term).replace(/\b(?:senior|sr|ssr|junior|jr|trainee|intern)\b/g, "").replace(/\bproyectos\b/g, "proyecto").replace(/\s+/g, " ").trim();
      return primaryHasSeniority || signature !== baseSignature;
    });
    return alias ? [primary, alias] : [primary];
  }

  function buildGithubUserQuery(state) {
    const required = cleanTerms(state && state.imprescindibles);
    const alternatives = cleanTerms(state && state.atributos);
    const terms = [...cleanTerms(state && state.rol), ...required, ...alternatives, ...cleanTerms(state && state.deseables)];
    const location = cleanTerms(state && state.alcance);
    const countryNames = countries && countries.BARE_COUNTRY_NAMES || {};
    const countryTerms = new Set(Object.values(countryNames).flat().map(normalizeText));
    const locality = [...location].reverse().find((place) => !countryTerms.has(normalizeText(place))) || location[location.length - 1] || "";
    if (!locality) return "";

    const normalizedSkills = normalizeText(terms.join(" "));
    const language = GITHUB_LANGUAGES.find((name) => (` ${normalizedSkills} `).includes(` ${normalizeText(name)} `));
    if (!language) return "";
    // GitHub user search supports repository-language and profile-location
    // qualifiers. It does not search bios, so bios are checked only after
    // fetching each public profile; do not route this source through X-Ray.
    const escapedLocality = locality.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
    // GitHub's user search does not search profile bios for free text. Keep its
    // supported qualifiers here and check job signals against the returned
    // public bio instead of accidentally searching usernames for a skill.
    return `type:user language:${language} location:"${escapedLocality}"`.slice(0, 240);
  }

  function buildPlan(state, recommendations, generator, options) {
    const strategy = options && options.strategy || "precise";
    const allowed = new Set(PUBLIC_SOURCE_IDS);
    const chosen = (Array.isArray(recommendations) ? recommendations : [])
      .map((entry) => typeof entry === "string" ? entry : entry && entry.id)
      .filter((id, index, all) => allowed.has(id) && all.indexOf(id) === index)
      .slice(0, MAX_SOURCES);
    const skippedSources = [];
    const skippedReasons = {};
    const plan = chosen.map((id) => {
      const source = SOURCES[id];
      // Project management vacancies use several standard title families in
      // LATAM and Spain. Expand only this well-defined family, while keeping
      // the JD's requirements and its most specific location in the query.
      const queryState = strategy === "market"
        ? { ...state, rol: [], dominio: [] }
        : { ...state, rol: compactRoleFamily(state.rol, state.seniority) };
      if (id === "github") {
        const query = buildGithubUserQuery(queryState);
        if (!query) {
          skippedSources.push(id);
          skippedReasons[id] = "requires_language_signal";
          return null;
        }
        const profileEvidence = {
          required: cleanTerms(state.imprescindibles),
          alternatives: cleanTerms(state.atributos).slice(0, 2).length
            ? cleanTerms(state.atributos).slice(0, 2)
            : cleanTerms(state.deseables).slice(0, 1),
          role: cleanTerms(expandRoleFamily(state.rol, state.seniority)),
        };
        return { source: id, query, label: source.label, profileEvidence };
      }
      const query = generator.buildPublicLinkedinQuery(queryState, strategy);
      const usable = query && query.length <= MAX_QUERY_LENGTH ? { query } : null;
      if (!usable) {
        skippedSources.push(id);
        skippedReasons[id] = "query_too_long";
        return null;
      }
      return { source: id, query: usable.query, label: source.label };
    }).filter(Boolean);
    const location = cleanTerms(state.alcance).join(", ");
    const selectedSignals = cleanTerms(state.imprescindibles).length
      ? cleanTerms(state.imprescindibles)
      : cleanTerms(state.atributos).slice(0, 2).length
        ? cleanTerms(state.atributos).slice(0, 2)
        : cleanTerms(state.deseables).slice(0, 1).length
          ? cleanTerms(state.deseables).slice(0, 1)
          : cleanTerms(state.dominio).slice(0, 1);
    const signalSummary = selectedSignals.length > 1 && !cleanTerms(state.imprescindibles).length
      ? selectedSignals.join(" o ")
      : selectedSignals.join(" + ");
    const searchSummary = [
      cleanTerms(state.rol)[0] && strategy !== "equivalent" && strategy !== "market" ? cleanTerms(state.rol)[0] : "",
      signalSummary,
      cleanTerms(state.alcance).at(-1) || "",
    ].filter(Boolean).join(" · ");
    return { queries: plan, maxResults: MAX_RESULTS, location, skippedSources, skippedReasons, searchSummary };
  }

  function normalizeText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function normalizedPhrase(value) {
    return " " + normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim() + " ";
  }

  function hasPhrase(text, phrase) {
    const normalized = normalizedPhrase(text);
    const wanted = normalizedPhrase(phrase);
    return Boolean(wanted.trim()) && normalized.includes(wanted);
  }

  function hasResidenceEvidence(text, locality) {
    const normalized = normalizeText(text);
    const wanted = normalizeText(locality);
    if (!wanted) return false;
    let index = normalized.indexOf(wanted);
    while (index >= 0) {
      const preceding = normalized.slice(Math.max(0, index - 64), index);
      // A stated interest in a city is not evidence of residence there.
      if (!/(?:open to|willing to relocate to|relocating to|abierto a|dispuesto a trasladarme a|busco oportunidades en|interesado en)\s*$/.test(preceding)) return true;
      index = normalized.indexOf(wanted, index + wanted.length);
    }
    return false;
  }

  function geographyEvidence(text, state) {
    const places = cleanTerms(state.alcance);
    if (!places.length) return { confirmed: true, missing: [] };
    const countryNames = countries && countries.BARE_COUNTRY_NAMES || {};
    const countryTerms = new Set(Object.values(countryNames).flat().map(normalizeText));
    const countryPlaces = places.filter((place) => countryTerms.has(normalizeText(place)));
    const localityPlaces = places.filter((place) => !countryTerms.has(normalizeText(place)));
    const required = localityPlaces.length ? [...localityPlaces, ...countryPlaces] : countryPlaces.length ? countryPlaces : [places[places.length - 1]];
    const countryCodes = countries && countries.COUNTRY_CODES || {};
    const localityVisible = localityPlaces.length
      ? localityPlaces.some((place) => hasResidenceEvidence(text, place))
      : true;
    const missing = required.filter((place) => {
      if (countryPlaces.includes(place)) {
        const canonicalCountry = Object.keys(countryNames).find((country) =>
          (countryNames[country] || [country]).some((name) => normalizeText(name) === normalizeText(place))
        );
        const countryAliases = canonicalCountry ? countryNames[canonicalCountry] || [canonicalCountry] : [place];
        const nameMatch = countryAliases.some((name) => hasPhrase(text, name));
        const codeMatch = canonicalCountry && (countryCodes[canonicalCountry] || [])
          .some((code) => hasPhrase(text, code));
        return !nameMatch && !codeMatch;
      }
      return !hasResidenceEvidence(text, place);
    });
    if (localityPlaces.length && !countryPlaces.length) missing.push("país");
    return { confirmed: missing.length === 0, localityVisible, missing: [...new Set(missing)] };
  }

  function locationScopeError(state) {
    const places = cleanTerms(state && state.alcance);
    if (!places.length) {
      return "Agregá una localidad y el país en Alcance para que el listado no mezcle ubicaciones.";
    }
    if (places.some((place) => normalizeText(place) === "chile")) {
      return "Chile y sus regiones ya no forman parte del alcance geográfico de RADAR. Elegí otro país y su localidad.";
    }
    if (places.some((place) => normalizeText(place) === "santiago")) {
      return "Completá la ciudad y el país. RADAR no adivina a qué Santiago te referís.";
    }
    if (locationScopeNeedsCountry(state)) {
      return "Para exigir una localidad exacta sin mezclar ciudades homónimas, agregá también el país en Alcance.";
    }
    return "";
  }

  function locationScopeNeedsCountry(state) {
    const places = cleanTerms(state && state.alcance);
    if (!places.length) return false;
    const countryNames = countries && countries.BARE_COUNTRY_NAMES || {};
    const countryTerms = new Set(Object.values(countryNames).flat().map(normalizeText));
    return places.some((place) => !countryTerms.has(normalizeText(place)))
      && !places.some((place) => countryTerms.has(normalizeText(place)));
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

  function profileIdentityEvidence(name, rawUrl, sourceId) {
    if (!name) return { identityStatus: "Nombre no visible", identityAlignment: "unknown" };
    if (sourceId === "github") return { identityStatus: "Nombre informado por GitHub", identityAlignment: "source" };
    let slug = "";
    try {
      const segments = new URL(rawUrl).pathname.split("/").filter(Boolean);
      const profileIndex = segments.findIndex((segment) => /^(?:in|pub)$/i.test(segment));
      slug = profileIndex >= 0 ? segments[profileIndex + 1] || "" : "";
    } catch {
      return { identityStatus: "Nombre sugerido por el índice; validá el enlace", identityAlignment: "unknown" };
    }
    const normalizedSlug = normalizeText(slug).replace(/[^a-z0-9]+/g, " ").trim();
    const compactSlug = normalizedSlug.replace(/\s+/g, "");
    const particles = new Set(["da", "das", "de", "del", "der", "di", "dos", "du", "la", "las", "los", "van", "von", "y"]);
    const nameTokens = normalizeText(name).replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 1 && !particles.has(token));
    const matchingTokens = nameTokens.filter((token) => compactSlug.includes(token));
    if (nameTokens.length && matchingTokens.length >= Math.min(2, nameTokens.length)) {
      return { identityStatus: "Nombre compatible con el enlace", identityAlignment: "compatible" };
    }
    const slugTokens = normalizedSlug.split(/\s+/).filter((token) => token.length >= 3 && !/^\d+$/.test(token));
    if (slugTokens.length >= 2 && matchingTokens.length === 0) {
      return { identityStatus: "Nombre y enlace por revisar", identityAlignment: "mismatch" };
    }
    return { identityStatus: "Nombre sugerido por el índice; validá el enlace", identityAlignment: "unknown" };
  }

  function termEvidence(text, state) {
    const searchable = normalizeText(text);
    const required = cleanTerms(state.imprescindibles);
    const alternatives = cleanTerms(state.atributos);
    const role = expandRoleFamily(state.rol, state.seniority);
    const location = cleanTerms(state.alcance);
    const domain = cleanTerms(state.dominio);
    const hits = (terms) => terms.filter((term) => searchable.includes(normalizeText(term)));
    const roleHits = hits(role);
    const requiredHits = hits(required);
    const alternativeHits = hits(alternatives);
    const locationHits = hits(location);
    const domainHits = hits(domain);
    const specificLocation = location.length ? location[location.length - 1] : "";
    const specificLocationHit = Boolean(specificLocation && hasPhrase(searchable, specificLocation));
    const geography = geographyEvidence(text, state);
    const mandatoryCoverage = required.length ? requiredHits.length / required.length : 0;
    const attributeCoverage = alternatives.length ? alternativeHits.length / alternatives.length : 0;
    const roleCoverage = role.length ? (roleHits.length ? 1 : 0) : 0;
    const locationCoverage = location.length ? (geography.confirmed ? 1 : 0) : 0;
    // This ranks only visible text. Missing snippet evidence remains unknown,
    // never a factual rejection of the candidate.
    const activeWeight = (required.length ? 45 : 0) + (alternatives.length ? 25 : 0) + (role.length ? 15 : 0) + (location.length ? 15 : 0);
    const evidencePoints = 45 * mandatoryCoverage + 25 * Math.min(1, attributeCoverage) + 15 * roleCoverage + 15 * locationCoverage;
    const score = activeWeight ? Math.round((evidencePoints / activeWeight) * 100) : 0;
    const visibleSignals = [...new Set([...requiredHits, ...alternativeHits, ...roleHits, ...locationHits])];
    const locationStatus = !location.length ? "Sin filtro geográfico" : geography.confirmed ? "Localidad y país visibles" : geography.localityVisible ? "Localidad mencionada; país y residencia por confirmar" : "Ubicación sin confirmar";
    const confidence = score >= 70 && (!location.length || geography.confirmed) ? "Coincidencia textual alta" : score >= 40 ? "Coincidencia textual parcial" : "Pocas señales públicas";
    const scoreBreakdown = [
      required.length ? `Imprescindibles ${requiredHits.length}/${required.length}` : "Sin imprescindibles",
      alternatives.length ? `Alternativas ${alternativeHits.length}/${alternatives.length}` : "Sin alternativas",
      role.length ? `Cargo ${roleHits.length}/${role.length}` : "Sin título obligatorio",
      location.length ? locationStatus : "Sin filtro geográfico",
    ];
    return { score, confidence, locationStatus, visibleSignals, scoreBreakdown, requiredHits, roleHits, alternativeHits, locationHits, domainHits, specificLocationHit: Boolean(specificLocationHit), localityVisible: geography.localityVisible, locationConfirmed: geography.confirmed };
  }

  function normalizeResults(payload, state) {
    const raw = Array.isArray(payload && payload.results) ? payload.results : [];
    const seen = new Set();
    const normalized = [];
    raw.forEach((item) => {
      const sourceId = item && item.source;
      if (!PUBLIC_SOURCE_IDS.includes(sourceId)) return;
      const url = validateProfileUrl(item && item.url, sourceId);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const title = String(item.title || "").slice(0, 240);
      const snippet = String(item.snippet || "").slice(0, 800);
      const evidence = termEvidence(`${title} ${snippet}`, state);
      const required = cleanTerms(state.imprescindibles);
      const alternatives = cleanTerms(state.atributos);
      const hasProfileRelevance = evidence.roleHits.length > 0 || evidence.requiredHits.length > 0
        || evidence.alternativeHits.length > 0 || evidence.domainHits.length > 0;
      // The provider returns search results, not confirmed candidates. Keep
      // the user's Boolean semantics when checking visible evidence: every
      // mandatory item must appear, and at least one alternative must appear
      // when there are no mandatory items.
      if (!hasProfileRelevance) return;
      if (required.length && evidence.requiredHits.length !== required.length) return;
      if (!required.length && alternatives.length && !evidence.alternativeHits.length) return;
      // Keep exact city mentions for recruiter review when the snippet omits
      // the country. They remain visibly unverified and are never shareable
      // as confirmed matches. Exclude generic intent such as "open to Barcelona".
      if (!evidence.locationConfirmed && !evidence.localityVisible) return;
      const name = parseDisplayName(title, sourceId);
      const identity = profileIdentityEvidence(name, url, sourceId);
      normalized.push({
        source: sourceId,
        sourceLabel: SOURCES[sourceId].label,
        url,
        title: title || "Perfil público",
        name,
        ...identity,
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
    const sourceDiagnostics = Array.isArray(payload.sourceDiagnostics) ? payload.sourceDiagnostics : [];
    const failWithSourceDetails = (message) => {
      const error = new Error(message);
      error.sourceDiagnostics = sourceDiagnostics;
      throw error;
    };
    if (payload.error === "free_quota_exhausted") throw new Error("Se agotó el cupo gratuito del mes. No se inició la búsqueda.");
    if (payload.error === "hourly_quota_exhausted") throw new Error("Se agotó el cupo horario. Esperá y volvé a probar.");
    if (payload.error === "rate_limited") throw new Error("Se alcanzó el límite temporal de RADAR. Probá en un minuto.");
    if (payload.error === "provider_rate_limited") throw new Error("SerpApi rechazó temporalmente la consulta. Revisá el cupo.");
    if (payload.error === "sources_unavailable") {
      const codes = new Set((Array.isArray(payload.sourceErrors) ? payload.sourceErrors : []).map((item) => item.code));
      if (codes.has("provider_credentials_rejected")) failWithSourceDetails("El proveedor rechazó la credencial configurada. Revisá Cloudflare.");
      if (codes.has("provider_location_rejected")) failWithSourceDetails("El proveedor no reconoció la ubicación. Probá una localidad o país más específico.");
      if (codes.has("provider_query_rejected")) failWithSourceDetails("El proveedor rechazó el formato de búsqueda. Quitá algunos términos.");
      if (codes.has("provider_request_rejected")) failWithSourceDetails("El proveedor rechazó la consulta. Revisá la ubicación o los términos y probá una búsqueda más breve.");
      if (codes.has("provider_timeout")) failWithSourceDetails("El proveedor tardó demasiado en responder. Probá de nuevo.");
      if (codes.has("provider_network_error")) failWithSourceDetails("RADAR no pudo conectarse con el proveedor de búsqueda. Revisá la configuración y probá de nuevo.");
      if (codes.has("provider_unavailable")) failWithSourceDetails("El proveedor de búsqueda no respondió correctamente. No se obtuvieron perfiles; probá de nuevo más tarde.");
      if (codes.has("source_unavailable")) failWithSourceDetails("La fuente no está disponible. Probá más tarde u otra fuente.");
      failWithSourceDetails("No se pudo completar la consulta. No se obtuvieron perfiles; revisá la conexión o probá otra fuente.");
    }
    if (payload.error === "free_plan_required") throw new Error("No hay un plan gratuito activo. La búsqueda no se inició para evitar cargos.");
    if (payload.error === "budget_unavailable") throw new Error("No se pudo verificar el cupo. La búsqueda no se inició.");
    if (response.status === 429) throw new Error("El proveedor limitó temporalmente esta búsqueda. Revisá el cupo horario o mensual y probá más tarde.");
    if (response.status === 503) throw new Error("Servicio de búsqueda no disponible. Revisá la configuración.");
    if (!response.ok) throw new Error(`El proveedor de búsqueda respondió con un error (${response.status}).`);
    return {
      results: normalizeResults(payload, state),
      sourceErrors: Array.isArray(payload.sourceErrors) ? payload.sourceErrors : [],
      sourceDiagnostics: sourceDiagnostics
        .filter((item) => item && SOURCES[item.source]).map((item) => ({
          source: item.source,
          status: ["error", "profiles_found", "no_public_profiles", "no_indexed_results"].includes(item.status) ? item.status : "unknown",
          organicCount: Math.max(0, Number(item.organicCount) || 0),
          profileCount: Math.max(0, Number(item.profileCount) || 0),
          code: typeof item.code === "string" ? item.code : null,
        })),
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

  return { SOURCES, PUBLIC_SOURCE_IDS, MAX_SOURCES, MAX_RESULTS, buildPlan, buildGithubUserQuery, expandRoleFamily, compactRoleFamily, validateProfileUrl, parseDisplayName, profileIdentityEvidence, termEvidence, geographyEvidence, locationScopeNeedsCountry, locationScopeError, normalizeResults, search };
});
