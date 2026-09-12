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

  function coreBlocks(state) {
    return [orGroup(state.rol), orGroup(state.atributos), orGroup(state.dominio), orGroup(state.alcance)].filter(Boolean);
  }

  // AND/OR/NOT/quotes only, no site-specific syntax — works as typed in
  // LinkedIn Recruiter and most ATS search boxes, and is the base for X-Ray.
  function buildUniversalBoolean(state) {
    const blocks = coreBlocks(state);
    if (!blocks.length) return "";
    let out = blocks.join(" AND ");
    (state.refinar || []).forEach((t) => {
      out += ` NOT ${quoteIfPhrase(t)}`;
    });
    return out;
  }

  /** Same logic, exclusions replaced with the minus operator (Google/Bing syntax). */
  function buildXRayQuery(state, siteDomain) {
    const blocks = coreBlocks(state);
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
  function buildResumesQuery(state) {
    const blocks = coreBlocks(state);
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

  /** Picks the first attribute that matches a known GitHub-supported language. */
  function detectGithubLanguage(atributos) {
    const found = (atributos || []).find((a) => Keywords.GH_LANGUAGES.includes(a.toLowerCase()));
    return found ? found.toLowerCase().replace("node.js", "javascript").replace("c#", "csharp") : null;
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
    const freeText = (state.rol || [])[0] || (state.atributos || [])[0] || "";
    const q = [freeText, qualifiers.join(" ")].filter(Boolean).join(" ").trim();
    return "https://github.com/search?q=" + encodeURIComponent(q) + "&type=users";
  }

  /** Native GitHub search (repositories) — for "buscar por repositorio". */
  function buildGithubRepoUrl(state, minStars) {
    const lang = detectGithubLanguage(state.atributos);
    const parts = [];
    if (state.rol && state.rol[0]) parts.push(state.rol[0]);
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
    detectGithubLanguage,
    buildGithubPeopleUrl,
    buildGithubRepoUrl,
  };
});
