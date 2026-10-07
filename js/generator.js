// RADAR state -> boolean strings and search URLs. Pure, no DOM/network.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const Keywords = require("./keywords.js");
    const Countries = require("./countries.js");
    module.exports = factory(Keywords, Countries);
  } else {
    root.RadarGenerator = factory(root.RadarKeywords, root.RadarCountries);
  }
})(typeof self !== "undefined" ? self : this, function (Keywords, Countries) {
  "use strict";

  // Must stay >= extractor.js's MAX_ATTRIBUTES (6): that cap is what the UI
  // and the docs promise ("hoy 6" in TESTING.md) for auto-detected skills,
  // and the Rol/Atributos inputs literally say "Sin límite de términos" for
  // anything typed by hand (synonym pills included — clicking a 5th one is
  // one click away). A smaller cap here silently drops chips the user can
  // see on screen from the boolean that actually gets searched, with no
  // indication anything was cut — caught with 5 rol synonyms and 6 atributos
  // chips loaded, where only the first 4 of each were making it into the query.
  const MAX_TERMS_PER_GROUP = 6;

  function quoteIfPhrase(term) {
    const clean = term.replace(/"/g, "").trim();
    return clean.includes(" ") ? `"${clean}"` : clean;
  }

  function orGroup(terms) {
    const trimmed = (terms || []).filter(Boolean).slice(0, MAX_TERMS_PER_GROUP);
    const parts = trimmed.map(quoteIfPhrase);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    return "(" + parts.join(" OR ") + ")";
  }

  // Same grouping, but never quotes a multi-word term as an exact phrase.
  // Only used for the Rol block on networks where profiles don't read like a
  // résumé (Stack Overflow, Xing). "Backend Developer" quoted returned 1 hit
  // on Stack Overflow; the same word unquoted returned 5. Atributos still
  // goes through the normal orGroup on every network — a multi-word skill
  // ("Machine Learning") is worth keeping as an exact phrase everywhere.
  function orGroupRaw(terms) {
    const trimmed = (terms || []).filter(Boolean).slice(0, MAX_TERMS_PER_GROUP);
    if (trimmed.length === 0) return "";
    if (trimmed.length === 1) return trimmed[0];
    return "(" + trimmed.join(" OR ") + ")";
  }

  function andGroup(terms) {
    const trimmed = (terms || []).filter(Boolean).slice(0, MAX_TERMS_PER_GROUP);
    return trimmed.map(quoteIfPhrase).join(" AND ");
  }

  // A candidate's own profile almost never has the country in Spanish unless
  // the country itself is Spanish-speaking ("Germany", not "Alemania") —
  // adding "Germany" to a Xing search that returned nothing brought back
  // several real profiles, because Google doesn't localize Xing's pages
  // into Spanish the way it happens to do for LinkedIn's. Widens with an OR
  // instead of replacing, so it never costs a match on a site that does localize.
  function expandLocationTerm(term) {
    const regionalAliases = {
      "islas canarias": ["Islas Canarias", "Canarias", "Canary Islands", "Tenerife", "Gran Canaria", "Las Palmas", "Santa Cruz de Tenerife"],
      "munich": ["Múnich", "Munich", "München"],
      "dublin": ["Dublín", "Dublin"],
    };
    const region = regionalAliases[String(term || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()];
    if (region) return region;
    const alias = Countries.searchAlias(term);
    return alias ? [term, alias] : [term];
  }

  function searchLocationTerms(state) {
    const terms = state.alcance || [];
    const firstIsCountry = terms.length > 1 && Object.keys(Countries.ALL_COUNTRIES).some((country) => country.toLowerCase() === terms[0].toLowerCase());
    const hasLocality = terms.slice(1).some((term) => !Object.keys(Countries.ALL_COUNTRIES).some((country) => country.toLowerCase() === term.toLowerCase()));
    // Country + city/region is a hierarchy, not an alternative. OR-ing the
    // country back in silently widens a city-specific search to the nation.
    return firstIsCountry && hasLocality ? terms.slice(1) : terms;
  }

  // relaxed=true drops only Dominio from the AND chain. Alcance is a hard
  // constraint: relaxing a search must never silently widen a city-specific
  // vacancy to an entire country (or remove geography altogether). Chaining
  // all four blocks with AND can legitimately
  // zero out a search — a real person rarely matches role + skills +
  // industry + location all at once in the exact words RADAR picked — so
  // this is the one-click way out of that without manually deleting chips.
  function coreBlocks(state, relaxed, looseRol) {
    // Same cleanup GitHub's free text already gets (see stripAbbreviatedTitlePrefix
    // below) applied here too, so a chip typed by hand ("Sr. Backend Developer")
    // can't quietly re-introduce the same dead-on-arrival exact phrase that
    // extractor.js already strips out of anything it auto-detects.
    const rol = (state.rol || []).map(stripAbbreviatedTitlePrefix);
    const rolBlock = looseRol ? orGroupRaw(rol) : orGroup(rol);
    const alcance = searchLocationTerms(state).flatMap(expandLocationTerm);
    const blocks = [rolBlock, orGroup(state.atributos)];
    if (!relaxed) blocks.push(orGroup(state.dominio));
    blocks.push(orGroup(alcance));
    return blocks.filter(Boolean);
  }

  // AND/OR/NOT/quotes only, no site-specific syntax — works as typed in
  // LinkedIn Recruiter and most ATS search boxes, and is the base for X-Ray.
  function buildUniversalBoolean(state, relaxed) {
    const blocks = coreBlocks(state, relaxed);
    if (!blocks.length) return "";
    let out = blocks.join(" AND ");
    (state.refinar || []).forEach((t) => {
      out += ` NOT ${quoteIfPhrase(t)}`;
    });
    return out;
  }

  /** Same logic, exclusions replaced with the minus operator (Google/Bing syntax). */
  function buildXRayQuery(state, siteDomain, relaxed, looseRol) {
    const blocks = coreBlocks(state, relaxed, looseRol);
    let out = siteDomain ? `site:${siteDomain} ` : "";
    out += blocks.join(" ");
    (state.refinar || []).forEach((t) => {
      out += ` -${quoteIfPhrase(t)}`;
    });
    return out.trim();
  }

  function appendExclusions(query, state) {
    let out = query;
    (state.refinar || []).forEach((term) => { out += ` -${quoteIfPhrase(term)}`; });
    return out.trim();
  }

  function buildXRayTiers(state, siteDomain, relaxed, looseRol) {
    const tiers = [{ label: "Precisa", query: buildXRayQuery(state, siteDomain, relaxed, looseRol) }];
    const role = looseRol ? orGroupRaw(state.rol) : orGroup(state.rol);
    const location = orGroup((state.alcance || []).slice(-1).flatMap(expandLocationTerm));
    const usefulAttributes = (state.atributos || []).filter((term) => !Keywords.GENERIC_SKILLS.some((generic) => generic.toLowerCase() === term.toLowerCase()));
    if (role && location) {
      const balanced = [role, orGroup(usefulAttributes.slice(0, 1)), location].filter(Boolean).join(" ");
      const query = appendExclusions((siteDomain ? `site:${siteDomain} ` : "") + balanced, state);
      tiers.push({ label: "Equilibrada (rol + skill + ubicación)", query });
    }
    if (location) {
      const filters = orGroup(usefulAttributes.slice(0, 2)) || orGroup(state.dominio);
      if (filters) {
        const domain = usefulAttributes.length ? orGroup((state.dominio || []).slice(0, 1)) : "";
        const query = appendExclusions((siteDomain ? `site:${siteDomain} ` : "") + [filters, domain, location].filter(Boolean).join(" "), state);
        tiers.push({ label: usefulAttributes.length ? (domain ? "Skills + dominio + ubicación · sin título" : "Skills + ubicación · sin título") : "Dominio + ubicación · sin título", query });
      }
    }
    if ((state.rol || []).some((term) => /[a-záéíóúñ]\/a\b/i.test(term))) {
      const index = tiers.findIndex((tier) => tier.label.includes("sin título"));
      if (index > 0) tiers.unshift(...tiers.splice(index, 1));
    }
    const seen = new Set();
    return tiers.filter((tier) => tier.query && !seen.has(tier.query) && seen.add(tier.query));
  }

  /**
   * "CVs sueltos" mode: finds loose resume files across the open web,
   * not tied to any one site. Restricts to PDF/Word and common CV title words.
   */
  function buildResumesQuery(state, relaxed) {
    const blocks = coreBlocks(state, relaxed);
    let out = "(filetype:pdf OR filetype:doc OR filetype:docx) ";
    out += '(intitle:cv OR intitle:resume OR intitle:curriculum OR intitle:"hoja de vida") ';
    out += blocks.join(" ");
    (state.refinar || []).forEach((t) => {
      out += ` -${quoteIfPhrase(t)}`;
    });
    return out.trim();
  }

  function googleUrl(query) {
    return "https://www.google.com/search?q=" + encodeURIComponent(query);
  }

  function bingUrl(query) {
    return "https://www.bing.com/search?q=" + encodeURIComponent(query);
  }

  // LinkedIn's own search box parses AND/OR/NOT/quotes natively (no X-Ray
  // needed) — this stays reliable even when Google/Bing stop indexing
  // linkedin.com/in pages, which is increasingly common.
  function linkedinSearchUrl(linkedinBooleanQuery) {
    return "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(linkedinBooleanQuery);
  }

  // Free LinkedIn search (not Recruiter/Sales Navigator) silently breaks
  // down past ~3-4 boolean operators per LinkedIn's own help docs — verified
  // live: a real query with 6 operators (1 AND + 5 OR) returned zero
  // results on a search that Google X-Ray, run the same day, answered with
  // 10+ real profiles. Atributos gets capped, not dropped, tier by tier.
  //
  // Alcance stays IN every tier on purpose (not just capped like Atributos):
  // location is usually the one hard constraint a recruiter can't relax —
  // dropping it entirely (the original version of this function did, betting
  // on LinkedIn's own Location filter as a better substitute) meant a JD for
  // "Santiago de Compostela" searched the whole platform with no city at
  // all. Only ONE location term is used, though, and never widened with
  // expandLocationTerm's country alias (fine for Google, where there's no
  // operator ceiling to blow) — the most specific term already detected
  // (city over country, see extractor.js's alcance order) is what actually
  // narrows a LinkedIn search, and it alone already costs an AND.
  const LINKEDIN_MAX_ATRIBUTOS_ESPECIFICA = 2;
  const LINKEDIN_MAX_ATRIBUTOS_MEDIA = 1;

  function linkedinLocationTerm(state) {
    const alcance = state.alcance || [];
    return alcance.length ? [alcance[alcance.length - 1]] : [];
  }

  function buildLinkedinBooleanTier(state, maxAtributos) {
    const rol = (state.rol || []).map(stripAbbreviatedTitlePrefix);
    // A bare title such as "Auditor" matches many unrelated professions.
    // Keep the JD's industry attached in every tier when the title is broad.
    const broadRole = rol.length === 1 && rol[0].trim().split(/\s+/).length === 1;
    const blocks = [
      orGroup(rol),
      broadRole ? orGroup((state.dominio || []).slice(0, 1)) : "",
      orGroup((state.atributos || []).slice(0, maxAtributos)),
      orGroup(linkedinLocationTerm(state)),
    ].filter(Boolean);
    if (!blocks.length) return "";
    let out = blocks.join(" AND ");
    (state.refinar || []).forEach((t) => {
      out += ` NOT ${quoteIfPhrase(t)}`;
    });
    return out;
  }

  function buildLinkedinBoolean(state) {
    return buildLinkedinBooleanTier(state, LINKEDIN_MAX_ATRIBUTOS_ESPECIFICA);
  }

  // Three progressively broader tries instead of one shot: if the specific
  // one comes up empty, LinkedIn's own filters (or a Google captcha) aren't
  // always the reason — sometimes the query is just too narrow for how
  // little a real profile spells out. Atributos is already ranked
  // excluyente-first (see optionalOnlySkills in extractor.js), so trimming
  // it down keeps the sharpest requirement and drops the rest, tier by tier
  // — Alcance never gets trimmed away, see above. Query strings that end up
  // identical (little to trim in the first place) are deduped — no point
  // showing the same button three times.
  function buildLinkedinBooleanTiers(state) {
    const location = orGroup(linkedinLocationTerm(state));
    const hasRole = (state.rol || []).some((term) => term && term.trim());
    const tiers = hasRole ? [
      { label: location ? "Específica (rol + requisitos + ubicación)" : "Específica (rol + requisitos)", query: buildLinkedinBooleanTier(state, LINKEDIN_MAX_ATRIBUTOS_ESPECIFICA) },
      { label: location ? "Equilibrada (rol + 1 requisito + ubicación)" : "Equilibrada (rol + 1 requisito)", query: buildLinkedinBooleanTier(state, LINKEDIN_MAX_ATRIBUTOS_MEDIA) },
      { label: location ? "Amplia (rol + ubicación)" : "Amplia (rol + dominio si aplica)", query: buildLinkedinBooleanTier(state, 0) },
    ] : [];
    const rolelessAttributes = orGroup((state.atributos || []).filter((term) => !Keywords.GENERIC_SKILLS.some((generic) => generic.toLowerCase() === term.toLowerCase())).slice(0, 2));
    const rolelessDomain = orGroup((state.dominio || []).slice(0, 1));
    if (location) {
      const rolelessVariants = hasRole
        ? [[rolelessAttributes || rolelessDomain, rolelessAttributes ? rolelessDomain : "", location]]
        : [
            [rolelessAttributes, rolelessDomain, location],
            [orGroup((state.atributos || []).filter((term) => !Keywords.GENERIC_SKILLS.some((generic) => generic.toLowerCase() === term.toLowerCase())).slice(0, 1)), rolelessDomain, location],
            [rolelessDomain, location],
          ];
      rolelessVariants.forEach((blocks, index) => {
        const usable = blocks.filter(Boolean);
        if (usable.length < 2 || !usable[usable.length - 1]) return;
        let query = usable.join(" AND ");
        (state.refinar || []).forEach((term) => { query += ` NOT ${quoteIfPhrase(term)}`; });
        const rolelessLabel = rolelessDomain
          ? ["Skills + dominio + ubicación", "1 skill + dominio + ubicación", "Dominio + ubicación"][index]
          : ["Skills + ubicación", "1 skill + ubicación", "Dominio + ubicación"][index];
        tiers.push({ label: hasRole ? (rolelessDomain ? "Requisitos + dominio + ubicación · sin título" : "Requisitos + ubicación · sin título") : rolelessLabel, query });
      });
    }
    if (!location) {
      const filters = rolelessAttributes ? [orGroup((state.dominio || []).slice(0, 1)), rolelessAttributes].filter(Boolean).join(" AND ") : orGroup(state.dominio);
      if (filters) {
        let query = filters;
        (state.refinar || []).forEach((term) => { query += ` NOT ${quoteIfPhrase(term)}`; });
        tiers.push({ label: rolelessAttributes ? "Dominio y skills · sin título" : "Dominio · sin título", query });
      }
    }
    if ((state.rol || []).some((term) => /[a-záéíóúñ]\/a\b/i.test(term))) {
      const index = tiers.findIndex((tier) => tier.label.includes("sin título"));
      if (index > 0) tiers.unshift(...tiers.splice(index, 1));
    }
    const seen = new Set();
    return tiers.filter((t) => t.query && !seen.has(t.query) && seen.add(t.query));
  }

  /** Picks the first attribute that matches a known GitHub-supported language. */
  function detectGithubLanguage(atributos) {
    const found = (atributos || []).find((a) => Keywords.GH_LANGUAGES.includes(a.toLowerCase()));
    return found ? found.toLowerCase().replace("node.js", "javascript").replace("c#", "csharp") : null;
  }

  // GitHub's user search is free-text, not a phrase match like Google/LinkedIn
  // — a title abbreviation with a period ("Sr. Backend Developer") silently
  // zeroes out the results. Dropping "Sr." from an otherwise identical query
  // took it from 0 to 7 real matches. Strip that kind of prefix before it's
  // used as GitHub free text; it stays untouched everywhere else (universal
  // boolean, X-Ray), where it's wrapped in quotes and doesn't cause this.
  function stripAbbreviatedTitlePrefix(text) {
    return text.replace(/^(?:sr|jr|ssr|lic|ing|dr|dra)\.\s*/i, "").trim();
  }

  /** Native GitHub search (people). */
  function buildGithubPeopleUrl(state) {
    const lang = detectGithubLanguage(state.atributos);
    const cityLike = searchLocationTerms(state).slice(-1).find(
      (a) => !Keywords.SENIOR_WORDS.includes(a.toLowerCase()) && !Keywords.JUNIOR_WORDS.includes(a.toLowerCase()) && isNaN(parseInt(a, 10))
    );
    const qualifiers = [];
    if (lang) qualifiers.push(`language:${lang}`);
    if (cityLike) qualifiers.push(`location:"${cityLike}"`);
    // GitHub's free-text search still matches on rol/atributos even without a
    // recognized language qualifier — dropping them left non-technical roles
    // (sales, recruiting, etc.) with a location-only query and no real signal.
    const rawFreeText = (state.rol || [])[0] || (state.atributos || [])[0] || "";
    const freeText = stripAbbreviatedTitlePrefix(rawFreeText);
    const q = [freeText, qualifiers.join(" ")].filter(Boolean).join(" ").trim();
    return "https://github.com/search?q=" + encodeURIComponent(q) + "&type=users";
  }

  /** Native GitHub search (repositories) — for "buscar por repositorio". */
  function buildGithubRepoUrl(state, minStars) {
    const lang = detectGithubLanguage(state.atributos);
    const parts = [];
    if (state.rol && state.rol[0]) parts.push(stripAbbreviatedTitlePrefix(state.rol[0]));
    if (lang) parts.push(`language:${lang}`);
    if (minStars) parts.push(`stars:>${minStars}`);
    const q = parts.join(" ") || (state.atributos || [])[0] || "";
    return "https://github.com/search?q=" + encodeURIComponent(q) + "&type=repositories";
  }

  function getTruncatedFields(state) {
    return ["rol", "atributos", "dominio", "alcance"].filter((field) => (state[field] || []).length > MAX_TERMS_PER_GROUP);
  }

  return {
    MAX_TERMS_PER_GROUP,
    quoteIfPhrase,
    orGroup,
    orGroupRaw,
    andGroup,
    expandLocationTerm,
    coreBlocks,
    buildUniversalBoolean,
    buildXRayQuery,
    buildXRayTiers,
    buildResumesQuery,
    googleUrl,
    bingUrl,
    linkedinSearchUrl,
    buildLinkedinBoolean,
    buildLinkedinBooleanTiers,
    getTruncatedFields,
    detectGithubLanguage,
    stripAbbreviatedTitlePrefix,
    buildGithubPeopleUrl,
    buildGithubRepoUrl,
  };
});
