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
  const SEARCH_TIMEOUT_MS = 35_000;
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
  // Adjacent titles are used for a separate discovery route and evidence
  // scoring. They are deliberately narrower than a thesaurus: each family is
  // selected from the reviewed role and context, never from generic words
  // such as "cliente" or "proyecto" alone.
  const ADJACENT_ROLE_FAMILIES = [
    { match: /\b(?:jefe de proyectos?|gerente de proyectos?|project managers?|project coordinators?|coordinador de proyectos?|pmo)\b/, kind: "project" },
    { match: /\b(?:qa|quality assurance|software test(?:ing)?|test automation|sdet)\b/, kind: "qa" },
    { match: /\b(?:telecom(?:munications|unicaciones)? engineer|ingenier[oa] de telecomunicaciones|network engineer|ingenier[oa] de redes|noc engineer)\b/, kind: "telecom-engineering" },
    { match: /\b(?:tecnic[oa].{0,24}(?:telecom\w*|redes|fibra)|(?:telecom\w*|fiber optic|ftth|network) technician|instalador.{0,24}(?:telecom\w*|fibra|redes))\b/, kind: "telecom-technician" },
    { match: /\b(?:service desk|help desk|it support|soporte tecnico|soporte de it)\b/, kind: "it-support" },
    { match: /\b(?:data analyst|analista de datos|business intelligence analyst|bi analyst)\b/, kind: "data-analyst" },
    { match: /\b(?:sap.{0,16}consultant|consultor.{0,16}sap|erp consultant|consultor.{0,16}erp)\b/, kind: "erp-consulting" },
    { match: /\b(?:salesforce administrator|salesforce admin|administrador.{0,16}salesforce)\b/, kind: "crm-admin" },
    { match: /\b(?:talent acquisition|technical recruiter|it recruiter|recruiter|reclutador|reclutadora|talent sourcer)\b/, kind: "recruiting" },
    { match: /\b(?:internal auditor|it auditor|auditor interno|auditor de sistemas|auditor de tecnologia)\b/, kind: "auditing" },
    { match: /\b(?:account executive|account manager|business development|sales development|sales representative|comercial de software|ejecutivo de cuentas)\b/, kind: "sales" },
    { match: /\b(?:customer success|client success)\b/, kind: "customer-success" },
    { match: /\b(?:customer support|atencion al cliente|customer service|customer care)\b/, kind: "customer-support" },
  ];

  const ADJACENT_TITLES = Object.freeze({
    project: {
      junior: ["Project Engineer", "Technical Project Coordinator", "Project Support Officer", "Implementation Coordinator", "Deployment Coordinator", "Field Project Coordinator"],
      senior: ["Technical Project Manager", "Telecom Project Manager", "Delivery Manager", "Program Manager", "PMO Manager", "Deployment Manager"],
      general: ["Technical Project Coordinator", "Implementation Coordinator", "Project Engineer", "Delivery Coordinator", "Project Support Officer", "Deployment Coordinator"],
      telecom: ["Telecom Project Coordinator", "Network Deployment Coordinator", "Telecom Project Engineer", "Field Project Coordinator"],
    },
    qa: ["QA Analyst", "Software Tester", "Test Analyst", "Quality Analyst", "Test Engineer", "Software Development Engineer in Test"],
    "telecom-engineering": ["Telecommunications Engineer", "Telecom Engineer", "Network Engineer", "Network Operations Engineer", "NOC Engineer", "Field Engineer"],
    "telecom-technician": ["Telecom Technician", "Fiber Optic Technician", "FTTH Technician", "Network Technician", "Field Technician", "Telecom Installer"],
    "it-support": ["IT Support Specialist", "Service Desk Analyst", "Help Desk Technician", "Desktop Support Engineer", "Technical Support Engineer"],
    "data-analyst": ["BI Analyst", "Reporting Analyst", "Business Data Analyst", "Data Specialist"],
    "erp-consulting": ["ERP Implementation Consultant", "Functional Consultant", "Business Systems Analyst", "ERP Functional Analyst"],
    "crm-admin": ["Salesforce Administrator", "CRM Administrator", "Salesforce Consultant", "CRM Specialist"],
    recruiting: ["Technical Recruiter", "IT Recruiter", "Talent Acquisition Specialist", "Talent Sourcer", "Recruitment Consultant"],
    auditing: ["Internal Auditor", "IT Auditor", "Technology Auditor", "Compliance Auditor", "Audit Analyst"],
    sales: ["Account Executive", "Business Development Representative", "Sales Development Representative", "Account Manager", "Commercial Manager", "Sales Representative"],
    "customer-success": ["Customer Success Manager", "Customer Success Specialist", "Client Success Manager"],
    "customer-support": ["Customer Support Specialist", "Customer Service Representative", "Customer Care Specialist", "Call Center Agent", "Customer Experience Associate"],
  });

  const EDUCATION_SIGNAL_ALIASES = Object.freeze([
    { match: /\b(?:telecomunicaciones|telecommunications|telecom)\b/, terms: ["Ingeniería de Telecomunicaciones", "Telecommunications Engineering"] },
    { match: /\b(?:industrial|industriales)\b/, terms: ["Ingeniería Industrial", "Industrial Engineering"] },
    { match: /\b(?:informatica|informaticos|computer science|computer engineering)\b/, terms: ["Ingeniería Informática", "Computer Engineering"] },
    { match: /\b(?:electronica|electronic engineering)\b/, terms: ["Ingeniería Electrónica", "Electronics Engineering"] },
    { match: /\b(?:ade|administracion y direccion de empresas|business administration)\b/, terms: ["Administración y Dirección de Empresas", "Business Administration"] },
  ]);

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
    const normalized = roleFamilyText(original);
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

  function roleFamilyText(roles) {
    return normalizeText(cleanTerms(roles).join(" ")).replace(/\b([a-z]+)\/[oa]\b/g, "$1");
  }

  function adjacentRoleTerms(roles, seniority, domains) {
    const normalized = roleFamilyText(roles);
    const family = ADJACENT_ROLE_FAMILIES.find((entry) => entry.match.test(normalized));
    if (!family) return [];
    const seniorityText = normalizeText([...(Array.isArray(seniority) ? seniority : []), ...cleanTerms(roles)].join(" "));
    const junior = /\b(?:junior|jr|trainee|pasante|practicante|intern|entry level)\b/.test(seniorityText);
    const senior = /\b(?:senior|sr|ssr|lead|principal|director|head)\b/.test(seniorityText);
    let titles = ADJACENT_TITLES[family.kind];
    if (family.kind === "project") {
      const allContext = normalizeText([...cleanTerms(domains), ...cleanTerms(roles)].join(" "));
      const telecom = /\b(?:telecom|telecommunications|telecomunicaciones|fiber|fibra|network|redes|infraestructura|instalaciones)\b/.test(allContext);
      const levelTitles = junior ? ADJACENT_TITLES.project.junior : senior ? ADJACENT_TITLES.project.senior : ADJACENT_TITLES.project.general;
      titles = telecom ? [...ADJACENT_TITLES.project.telecom, ...levelTitles] : levelTitles;
    }
    const seen = new Set([...cleanTerms(roles).map(normalizeText), ...expandRoleFamily(roles, seniority).map(normalizeText)]);
    return [...new Set(titles.filter((title) => !seen.has(normalizeText(title))))].slice(0, 8);
  }

  function educationSignals(state) {
    const context = (Array.isArray(state && state.roleContext) ? state.roleContext : [])
      .map((entry) => String(entry || ""))
      .filter((entry) => /formaci[oó]n indicada/i.test(entry));
    const source = normalizeText(context.join(" "));
    if (!source) return { terms: [], required: false };
    const terms = EDUCATION_SIGNAL_ALIASES
      .filter((entry) => entry.match.test(source))
      .flatMap((entry) => entry.terms);
    return {
      terms: [...new Set(terms)].slice(0, 10),
      required: /\b(?:indispensable|requerid[oa]|obligatori[oa]|must have|required)\b/.test(source),
    };
  }

  function domainSearchTerms(domains) {
    const aliases = [
      { match: /\b(?:telecom|telecommunications|telecomunicaciones|telco)\b/, terms: ["telecomunicaciones", "telecommunications", "telecom", "telco"] },
      { match: /\b(?:travel|turismo|tourism|hospitality|hotelero)\b/, terms: ["travel", "tourism", "hospitality", "hotel"] },
      { match: /\b(?:construccion|construction|obra|civil engineering)\b/, terms: ["construcción", "construction", "obra", "civil engineering"] },
      { match: /\b(?:banca|banking|fintech|financial services)\b/, terms: ["banca", "banking", "fintech", "financial services"] },
    ];
    const values = cleanTerms(domains);
    return [...new Set(values.flatMap((value) => {
      const family = aliases.find((entry) => entry.match.test(normalizeText(value)));
      return family ? family.terms : [value];
    }))];
  }

  function isJuniorProjectManagement(state) {
    const roleText = normalizeText([...(Array.isArray(state && state.rol) ? state.rol : []), ...(Array.isArray(state && state.seniority) ? state.seniority : [])].join(" "));
    return /\b(?:junior|jr|trainee|pasante|practicante|intern)\b/.test(roleText)
      && /\b(?:jefe de proyectos?|project managers?|project coordinators?|coordinador de proyectos?|pmo)\b/.test(roleText);
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
      if (id === "linkedin" && query && query.length <= MAX_QUERY_LENGTH) {
        // Search from three complementary angles. Early-career PM candidates
        // often use PMO / coordinator titles instead of the vacancy title, so
        // reserve a query specifically for those adjacent title families.
        const variants = [query];
        for (const variantStrategy of ["equivalent", "market"]) {
          let variantState;
          let queryMode = variantStrategy;
          let educationTermsForVariant = [];
          if (isJuniorProjectManagement(state) && variantStrategy === "equivalent") {
            variantState = { ...state, rol: ["Project Coordinator", "PMO Analyst"], deseables: [] };
            queryMode = "precise";
          } else {
            const adjacent = adjacentRoleTerms(state.rol, state.seniority, state.dominio);
            if (variantStrategy === "equivalent" && adjacent.length) {
              variantState = { ...state, rol: adjacent.slice(0, 2), deseables: [] };
              queryMode = "precise";
            } else if (variantStrategy === "market" && isJuniorProjectManagement(state)) {
              const education = educationSignals(state);
              const telecomContext = /\b(?:telecom|telecommunications|telecomunicaciones|fiber|fibra|network|redes|infraestructura|instalaciones)\b/i
                .test([...cleanTerms(state.dominio), ...cleanTerms(state.atributos), ...cleanTerms(state.roleContext)].join(" "));
              variantState = {
                ...state,
                rol: telecomContext ? ["Project Engineer", "Telecom Project Coordinator"] : ["Project Engineer", "Implementation Coordinator"],
                atributos: ["PMO", "project coordination", ...cleanTerms(state.atributos).slice(0, 1)],
                deseables: [],
                dominio: cleanTerms(state.dominio),
              };
              educationTermsForVariant = education.required ? education.terms : [];
              queryMode = "precise";
            } else if (variantStrategy === "market" && adjacent.length > 2) {
              const education = educationSignals(state);
              variantState = {
                ...state,
                rol: adjacent.slice(2, 4),
                deseables: [],
              };
              educationTermsForVariant = education.required ? education.terms : [];
              queryMode = "precise";
            } else {
              variantState = variantStrategy === "market"
                ? { ...state, rol: [], dominio: [] }
                : { ...state, rol: compactRoleFamily(state.rol, state.seniority) };
            }
          }
          const candidateBase = generator.buildPublicLinkedinQuery(variantState, queryMode);
          const educationClause = educationTermsForVariant.length
            ? ` (${educationTermsForVariant.map((term) => `"${term.replace(/"/g, "")}"`).join(" OR ")})`
            : "";
          const candidate = candidateBase ? candidateBase + educationClause : "";
          if (candidate && candidate.length <= MAX_QUERY_LENGTH && !variants.includes(candidate)) variants.push(candidate);
        }
        return { source: id, query, variants, label: source.label };
      }
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

  function localityAliases(locality) {
    const aliases = {
      "islas canarias": ["islas canarias", "canarias", "canary islands"],
      "canarias": ["canarias", "islas canarias", "canary islands"],
      "islas baleares": ["islas baleares", "balearic islands"],
      "palma de mallorca": ["palma de mallorca", "palma"],
      "pais vasco": ["pais vasco", "basque country"],
    };
    return aliases[normalizeText(locality)] || [locality];
  }

  function nonResidencePrefix(preceding) {
    return /(?:open to|willing to relocate to|relocating to|abierto a|dispuesto a trasladarme a|busco oportunidades en|interesado en|university of|universidad (?:de|del|en)|degree (?:from|at)|grado (?:en|de)|estudi(?:e|o|aron) en|studied (?:at|in)|graduat(?:ed)? (?:from|in)|experience (?:in|at)|experiencia (?:laboral )?en|trabaj(?:e|o|aron) en|worked (?:at|in)|office in|sede en)\s*$/.test(preceding);
  }

  function hasResidenceEvidence(text, locality) {
    const normalized = normalizeText(text);
    for (const alias of localityAliases(locality)) {
      const wanted = normalizeText(alias);
      if (!wanted) continue;
      let index = normalized.indexOf(wanted);
      while (index >= 0) {
        const preceding = normalized.slice(Math.max(0, index - 64), index);
        // A city in education, work history, or relocation preference is not
        // evidence of current residence.
        if (!nonResidencePrefix(preceding)) return true;
        index = normalized.indexOf(wanted, index + wanted.length);
      }
    }
    return false;
  }

  function hasNearbyLocationPair(text, localities, countriesAndCodes) {
    const normalized = normalizeText(text);
    const localityTerms = cleanTerms(localities).flatMap(localityAliases).map(normalizeText).filter(Boolean);
    const countryTerms = cleanTerms(countriesAndCodes).map(normalizeText).filter(Boolean);
    const positions = (haystack, needle) => {
      const found = [];
      let at = haystack.indexOf(needle);
      while (at >= 0) {
        found.push(at);
        at = haystack.indexOf(needle, at + needle.length);
      }
      return found;
    };
    for (const locality of localityTerms) {
      for (const cityAt of positions(normalized, locality)) {
        const preceding = normalized.slice(Math.max(0, cityAt - 64), cityAt);
        if (nonResidencePrefix(preceding)) continue;
        for (const country of countryTerms) {
          if (positions(normalized, country).some((countryAt) => Math.abs(countryAt - cityAt) <= 120)) return true;
        }
      }
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
    const countryCodes = countries && countries.COUNTRY_CODES || {};
    const localityVisible = localityPlaces.length
      ? localityPlaces.some((place) => hasResidenceEvidence(text, place))
      : true;
    let countryVisible = countryPlaces.length
      ? countryPlaces.some((place) => {
        const canonicalCountry = Object.keys(countryNames).find((country) =>
          (countryNames[country] || [country]).some((name) => normalizeText(name) === normalizeText(place))
        );
        const countryAliases = canonicalCountry ? countryNames[canonicalCountry] || [canonicalCountry] : [place];
        const nameMatch = countryAliases.some((name) => hasPhrase(text, name));
        const codeMatch = canonicalCountry && (countryCodes[canonicalCountry] || [])
          .some((code) => hasPhrase(text, code));
        return nameMatch || codeMatch;
      })
      : !localityPlaces.length;
    if (localityPlaces.length && countryVisible) {
      const evidenceTerms = countryPlaces.flatMap((place) => {
        const canonicalCountry = Object.keys(countryNames).find((country) =>
          (countryNames[country] || [country]).some((name) => normalizeText(name) === normalizeText(place))
        );
        return [
          ...(canonicalCountry ? countryNames[canonicalCountry] || [canonicalCountry] : [place]),
          ...(canonicalCountry ? countryCodes[canonicalCountry] || [] : []),
        ];
      });
      countryVisible = hasNearbyLocationPair(text, localityPlaces, evidenceTerms);
    }
    // Multiple cities in the same search scope are alternatives (e.g. Santiago
    // de Compostela OR Palma), while country evidence must still be present.
    const missing = [];
    if (localityPlaces.length && !localityVisible) missing.push("localidad");
    if ((localityPlaces.length || countryPlaces.length) && !countryVisible) missing.push("país");
    if (!localityPlaces.length && !countryPlaces.length && places.length) missing.push(places[places.length - 1]);
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
    const adjacentRoles = adjacentRoleTerms(state.rol, state.seniority, state.dominio);
    const location = cleanTerms(state.alcance);
    const domain = cleanTerms(state.dominio);
    const education = educationSignals(state);
    // Substring checks make short technology names dangerously noisy ("R"
    // inside "remote", or "SAP" inside "landscape"). Use normalized token
    // boundaries so punctuation and accents remain flexible without matching
    // unrelated words.
    const hits = (terms) => terms.filter((term) => hasPhrase(searchable, term));
    const roleHits = hits(role);
    const adjacentRoleHits = hits(adjacentRoles);
    const requiredHits = hits(required);
    const alternativeHits = hits(alternatives);
    const locationHits = hits(location);
    const domainHits = hits(domainSearchTerms(domain));
    const educationHits = hits(education.terms);
    const specificLocation = location.length ? location[location.length - 1] : "";
    const specificLocationHit = Boolean(specificLocation && hasResidenceEvidence(searchable, specificLocation));
    const geography = geographyEvidence(text, state);
    const mandatoryCoverage = required.length ? requiredHits.length / required.length : 0;
    const attributeCoverage = alternatives.length ? alternativeHits.length / alternatives.length : 0;
    const roleCoverage = role.length ? (roleHits.length ? 1 : adjacentRoleHits.length ? 0.65 : 0) : 0;
    const locationCoverage = location.length ? (geography.confirmed ? 1 : 0) : 0;
    const domainWeight = domain.length ? 10 : 0;
    const educationWeight = education.terms.length ? 5 : 0;
    // This ranks only visible text. Missing snippet evidence remains unknown,
    // never a factual rejection of the candidate.
    const activeWeight = (required.length ? 45 : 0) + (alternatives.length ? 25 : 0) + (role.length ? 15 : 0)
      + domainWeight + educationWeight + (location.length ? 15 : 0);
    const evidencePoints = 45 * mandatoryCoverage + 25 * Math.min(1, attributeCoverage) + 15 * roleCoverage
      + domainWeight * (domainHits.length ? 1 : 0) + educationWeight * (educationHits.length ? 1 : 0) + 15 * locationCoverage;
    const score = activeWeight ? Math.round((evidencePoints / activeWeight) * 100) : 0;
    const visibleSignals = [...new Set([...requiredHits, ...alternativeHits, ...roleHits, ...adjacentRoleHits, ...domainHits, ...educationHits, ...locationHits])];
    const locationStatus = !location.length ? "Sin filtro geográfico" : geography.confirmed ? "Localidad y país visibles" : geography.localityVisible ? "Localidad mencionada; país y residencia por confirmar" : "Ubicación sin confirmar";
    const roleMatchType = roleHits.length ? "equivalent" : adjacentRoleHits.length ? "adjacent" : role.length ? "unverified" : "not_requested";
    const educationStatus = !education.terms.length ? "Sin formación específica indicada"
      : educationHits.length ? "Formación relacionada visible"
        : education.required ? "Formación requerida por confirmar" : "Formación valorable por confirmar";
    const confidence = score >= 70 && (!location.length || geography.confirmed) ? "Coincidencia textual alta" : score >= 40 ? "Coincidencia textual parcial" : "Pocas señales públicas";
    const scoreBreakdown = [
      required.length ? `Obligatorios visibles ${requiredHits.length}/${required.length}` : "Sin obligatorios confirmados",
      alternatives.length ? `Señales de apoyo visibles ${alternativeHits.length}/${alternatives.length}` : "Sin señales de apoyo",
      role.length ? (roleHits.length ? "Cargo equivalente visible" : adjacentRoleHits.length ? "Cargo afín visible" : "Título sin confirmar") : "Sin título obligatorio",
      domain.length ? `Sector relacionado ${domainHits.length ? "visible" : "por confirmar"}` : "Sin sector",
      education.terms.length ? educationStatus : "Sin formación indicada",
      location.length ? locationStatus : "Sin filtro geográfico",
    ];
    return {
      score, confidence, locationStatus, visibleSignals, scoreBreakdown, requiredHits, roleHits, adjacentRoleHits,
      roleMatchType, alternativeHits, locationHits, domainHits, educationHits, educationRequired: education.required,
      educationStatus, specificLocationHit: Boolean(specificLocationHit), localityVisible: geography.localityVisible,
      locationConfirmed: geography.confirmed,
    };
  }

  function experienceEvidence(title, snippet, state) {
    const seniorityText = normalizeText([...(Array.isArray(state && state.seniority) ? state.seniority : []), ...(Array.isArray(state && state.rol) ? state.rol : [])].join(" "));
    if (!/\b(?:junior|jr|trainee|pasante|practicante|intern)\b/.test(seniorityText)) {
      return { experienceFit: "not_requested", experienceLabel: "Antigüedad sin filtro", experienceYears: null, experienceRank: 1 };
    }
    const maxFromContext = (Array.isArray(state && state.roleContext) ? state.roleContext : [])
      .map((entry) => normalizeText(entry).match(/experiencia indicada:\s*0\s*[-–]\s*(\d{1,2}) anos?/))
      .find(Boolean);
    const maxYears = maxFromContext ? Number(maxFromContext[1]) : 3;
    const titleText = normalizeText(title);
    const description = normalizeText(snippet);
    const seniorTitle = /\b(?:senior|sr\.?|lead|principal|director|head of|gerente|responsable)\b/.test(titleText);
    const explicitYears = [
      ...Array.from(description.matchAll(/\b(?:mas de|over|more than)\s*(\d{1,2})\s*(?:anos?|years?)\b/g), (match) => Number(match[1])),
      ...Array.from(description.matchAll(/\b(\d{1,2})\s*\+?\s*(?:anos?|years?)\s+(?:de\s+)?(?:experiencia|experience)\b/g), (match) => Number(match[1])),
    ];
    const experienceYears = explicitYears.length ? Math.max(...explicitYears) : null;
    if (seniorTitle || (experienceYears !== null && experienceYears > maxYears)) {
      return { experienceFit: "above_limit", experienceLabel: "Antigüedad superior a la buscada", experienceYears, experienceRank: 3 };
    }
    if (/\b(?:junior|jr|trainee|pasante|practicante|intern|early career|entry level)\b/.test(`${titleText} ${description}`)) {
      return { experienceFit: "junior_visible", experienceLabel: "Nivel inicial visible; años por confirmar", experienceYears, experienceRank: 0 };
    }
    if (experienceYears !== null) {
      return { experienceFit: "within_limit", experienceLabel: `Experiencia visible: ${experienceYears} años`, experienceYears, experienceRank: 0 };
    }
    return { experienceFit: "unknown", experienceLabel: "Años de experiencia por validar", experienceYears: null, experienceRank: 2 };
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
      const experience = experienceEvidence(title, snippet, state);
      if (experience.experienceFit === "above_limit") return;
      const evidence = termEvidence(`${title} ${snippet}`, state);
      const required = cleanTerms(state.imprescindibles);
      const alternatives = cleanTerms(state.atributos);
      const hasSkillEvidence = evidence.alternativeHits.length > 0 || evidence.requiredHits.length > 0;
      const hasSupportingEvidence = hasSkillEvidence
        || evidence.domainHits.length > 0 || evidence.educationHits.length > 0;
      const supportingSignalConfirmed = !alternatives.length || hasSkillEvidence;
      const hasProfileRelevance = evidence.roleHits.length > 0 || evidence.requiredHits.length > 0
        || evidence.alternativeHits.length > 0 || evidence.domainHits.length > 0
        || (evidence.adjacentRoleHits.length > 0 && hasSupportingEvidence);
      // The provider returns search results, not confirmed candidates. Keep
      // the user's Boolean semantics when checking visible evidence: every
      // mandatory item must appear, and at least one alternative must appear
      // when there are no mandatory items.
      if (!hasProfileRelevance) return;
      if (required.length && evidence.requiredHits.length !== required.length) return;
      // A search result can match a skill that Google does not repeat in its
      // title or snippet. Do not treat an omitted snippet signal as proof that
      // the person lacks it; keep role/location matches visible for review.
      // Explicitly confirmed mandatory signals remain a hard filter above.
      // The public shortlist is location-specific: a city mention without the
      // requested country is not enough to distinguish homonyms or confirm
      // residence. Keep such leads out of the ranked list instead of making
      // the recruiter infer geography from an incomplete search snippet.
      if (cleanTerms(state.alcance).length && !evidence.locationConfirmed) return;
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
        supportingSignalConfirmed,
        ...experience,
        ...evidence,
      });
    });
    normalized.sort((a, b) => a.experienceRank - b.experienceRank || b.score - a.score || (a.providerPosition || 999) - (b.providerPosition || 999));
    return normalized.slice(0, MAX_RESULTS);
  }

  async function search(endpoint, plan, state, fetchImpl, timeoutMs = SEARCH_TIMEOUT_MS) {
    const fetcher = fetchImpl || fetch;
    if (!endpoint) throw new Error("La búsqueda de perfiles públicos todavía no está configurada en este entorno.");
    let response;
    let deadline;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timeoutId;
    try {
      const request = fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        ...(controller ? { signal: controller.signal } : {}),
        body: JSON.stringify(plan),
      });
      deadline = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          controller?.abort();
          const error = new Error("search_timeout");
          error.name = "TimeoutError";
          reject(error);
        }, Math.max(1, Number(timeoutMs) || SEARCH_TIMEOUT_MS));
      });
      response = await Promise.race([request, deadline]);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error && error.name === "TimeoutError") {
        throw new Error("La búsqueda tardó demasiado en responder. Revisá la conexión y probá de nuevo.");
      }
      throw new Error("No se pudo conectar con el servicio de búsqueda. Revisá la conexión e intentá de nuevo manualmente.");
    }
    let payload;
    try {
      payload = await Promise.race([response.json(), deadline]);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error && error.name === "TimeoutError") {
        throw new Error("La búsqueda tardó demasiado en responder. Revisá la conexión y probá de nuevo.");
      }
      if (!response.ok) throw new Error(`El servicio de búsqueda respondió con un error (${response.status}).`);
      throw new Error("El servicio devolvió una respuesta inválida. No se pudo mostrar la lista; probá de nuevo más tarde.");
    } finally {
      clearTimeout(timeoutId);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("El servicio devolvió una respuesta inválida. No se pudo mostrar la lista; probá de nuevo más tarde.");
    }
    const sourceDiagnostics = Array.isArray(payload.sourceDiagnostics) ? payload.sourceDiagnostics : [];
    const failWithSourceDetails = (message) => {
      const error = new Error(message);
      error.sourceDiagnostics = sourceDiagnostics;
      error.requestId = typeof payload.requestId === "string" ? payload.requestId : null;
      throw error;
    };
    if (payload.error === "free_quota_exhausted") throw new Error("Se agotó el cupo gratuito del mes. No se inició la búsqueda.");
    if (payload.error === "hourly_quota_exhausted") throw new Error("Se agotó el cupo horario. Esperá y volvé a probar.");
    if (payload.error === "rate_limited") throw new Error("Se alcanzó el límite temporal de RADAR. Probá en un minuto.");
    if (payload.error === "provider_rate_limited") throw new Error("Un buscador alcanzó su límite temporal. Revisá el cupo o probá más tarde.");
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
          queriesRun: Math.max(0, Number(item.queriesRun) || 0),
          queriesRequested: Math.max(0, Number(item.queriesRequested) || 0),
          quotaLimited: item.quotaLimited === true,
          elapsedMs: Math.max(0, Number(item.elapsedMs) || 0),
          code: typeof item.code === "string" ? item.code : null,
          engines: Array.isArray(item.engines) ? item.engines.filter((engine) => ["Google", "Bing", "Yahoo"].includes(engine)) : [],
          providerErrors: Array.isArray(item.providerErrors) ? item.providerErrors
            .filter((entry) => entry && ["Google", "Bing", "Yahoo"].includes(entry.provider))
            .map((entry) => ({ provider: entry.provider, code: typeof entry.code === "string" ? entry.code : "source_unavailable" })) : [],
        })),
      count: Number(payload.count) || 0,
      requestId: typeof payload.requestId === "string" && /^[0-9a-f-]{36}$/i.test(payload.requestId) ? payload.requestId : null,
      elapsedMs: Math.max(0, Number(payload.elapsedMs) || 0),
      locationContext: payload.locationContext && typeof payload.locationContext === "object"
        ? {
          mode: payload.locationContext.mode === "provider_location" ? "provider_location" : "query_only",
          canonicalName: String(payload.locationContext.canonicalName || "").slice(0, 180) || null,
          countryCode: /^[A-Z]{2}$/.test(payload.locationContext.countryCode || "") ? payload.locationContext.countryCode : null,
        }
        : null,
    };
  }

  return { SOURCES, PUBLIC_SOURCE_IDS, MAX_SOURCES, MAX_RESULTS, SEARCH_TIMEOUT_MS, buildPlan, buildGithubUserQuery, expandRoleFamily, compactRoleFamily, adjacentRoleTerms, educationSignals, domainSearchTerms, validateProfileUrl, parseDisplayName, profileIdentityEvidence, termEvidence, experienceEvidence, geographyEvidence, locationScopeNeedsCountry, locationScopeError, normalizeResults, search };
});
