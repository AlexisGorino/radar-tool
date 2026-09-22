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

  // A candidate's own profile almost never has the country in Spanish unless
  // the country itself is Spanish-speaking ("Germany", not "Alemania") —
  // adding "Germany" to a Xing search that returned nothing brought back
  // several real profiles, because Google doesn't localize Xing's pages
  // into Spanish the way it happens to do for LinkedIn's. Widens with an OR
  // instead of replacing, so it never costs a match on a site that does localize.
  function expandLocationTerm(term) {
    const alias = Countries.searchAlias(term);
    return alias ? [term, alias] : [term];
  }

  // relaxed=true drops Dominio and Alcance from the AND chain, keeping only
  // Rol AND Atributos. Chaining all four blocks with AND can legitimately
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
    const alcance = (state.alcance || []).flatMap(expandLocationTerm);
    const blocks = [rolBlock, orGroup(state.atributos)];
    if (!relaxed) blocks.push(orGroup(state.dominio), orGroup(alcance));
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
    const blocks = [
      orGroup(rol),
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
    const tiers = [
      { label: "Específica", query: buildLinkedinBooleanTier(state, LINKEDIN_MAX_ATRIBUTOS_ESPECIFICA) },
      { label: "Media", query: buildLinkedinBooleanTier(state, LINKEDIN_MAX_ATRIBUTOS_MEDIA) },
      { label: "Amplia (rol + ubicación)", query: buildLinkedinBooleanTier(state, 0) },
    ];
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
    const cityLike = (state.alcance || []).find(
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

  return {
    MAX_TERMS_PER_GROUP,
    quoteIfPhrase,
    orGroup,
    orGroupRaw,
    expandLocationTerm,
    coreBlocks,
    buildUniversalBoolean,
    buildXRayQuery,
    buildResumesQuery,
    googleUrl,
    bingUrl,
    linkedinSearchUrl,
    buildLinkedinBoolean,
    buildLinkedinBooleanTiers,
    detectGithubLanguage,
    stripAbbreviatedTitlePrefix,
    buildGithubPeopleUrl,
    buildGithubRepoUrl,
  };
});
