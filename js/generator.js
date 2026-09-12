// RADAR state -> boolean strings and search URLs. Pure, no DOM/network.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const Keywords = require("./keywords.js");
    module.exports = factory(Keywords);
  } else {
    root.RadarGenerator = factory(root.RadarKeywords);
  }
})(typeof self !== "undefined" ? self : this, function (Keywords) {
  "use strict";

  const MAX_TERMS_PER_GROUP = 4; // keeps the boolean short and readable

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

  // relaxed=true drops Dominio and Alcance from the AND chain, keeping only
  // Rol AND Atributos. Verified live while sourcing real profiles: chaining
  // all four blocks with AND can legitimately zero out a search (a real
  // person rarely matches role + skills + industry + location all at once
  // in the exact words RADAR picked) — this is the one-click way out of
  // that without manually deleting chips.
  function coreBlocks(state, relaxed) {
    const blocks = [orGroup(state.rol), orGroup(state.atributos)];
    if (!relaxed) blocks.push(orGroup(state.dominio), orGroup(state.alcance));
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
  function buildXRayQuery(state, siteDomain, relaxed) {
    const blocks = coreBlocks(state, relaxed);
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
  function linkedinSearchUrl(universalBooleanQuery) {
    return "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(universalBooleanQuery);
  }

  /** Picks the first attribute that matches a known GitHub-supported language. */
  function detectGithubLanguage(atributos) {
    const found = (atributos || []).find((a) => Keywords.GH_LANGUAGES.includes(a.toLowerCase()));
    return found ? found.toLowerCase().replace("node.js", "javascript").replace("c#", "csharp") : null;
  }

  // GitHub's user search is free-text, not a phrase match like Google/LinkedIn
  // — a title abbreviation with a period ("Sr. Backend Developer") silently
  // zeroes out the results (verified live: identical query without "Sr."
  // went from 0 to 7 real matches). Strip that kind of prefix before it's
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
    coreBlocks,
    buildUniversalBoolean,
    buildXRayQuery,
    buildResumesQuery,
    googleUrl,
    bingUrl,
    linkedinSearchUrl,
    detectGithubLanguage,
    stripAbbreviatedTitlePrefix,
    buildGithubPeopleUrl,
    buildGithubRepoUrl,
  };
});
