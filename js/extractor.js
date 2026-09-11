/**
 * extractor.js
 * Turns raw job-description text into structured RADAR fields.
 * Every function here is pure: same input always returns the same output,
 * no DOM access, no globals mutated. That is what tests/run.js exercises.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const Countries = require("./countries.js");
    const Keywords = require("./keywords.js");
    module.exports = factory(Countries, Keywords);
  } else {
    root.RadarExtractor = factory(root.RadarCountries, root.RadarKeywords);
  }
})(typeof self !== "undefined" ? self : this, function (Countries, Keywords) {
  "use strict";

  const MAX_INPUT_LENGTH = 20000; // guardrail against pathological input

  function dedupe(arr) {
    const seen = new Set();
    const out = [];
    arr.forEach((a) => {
      const k = a.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(a);
      }
    });
    return out;
  }

  function findMatches(text, bank) {
    const found = [];
    bank.forEach((term) => {
      if (Countries.containsWord(text, term) && !found.some((f) => f.toLowerCase() === term.toLowerCase())) {
        found.push(term);
      }
    });
    return found;
  }

  function stripTags(text) {
    return text.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ");
  }

  function trimRolPhrase(raw) {
    let rol = raw.trim();
    const stopWords = /\s+(para|con|with|senior|junior|ssr|sr\.?|trainee|responsable de|a cargo de|que tenga|que cuente|de al menos|needed|required|based in|located in)\b[\s\S]*/i;
    rol = rol.replace(stopWords, "").trim();
    if (rol.length > 60) {
      const cut = rol.slice(0, 60);
      const lastSpace = cut.lastIndexOf(" ");
      rol = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
    }
    // drop a trailing connector word left over from the cut ("de", "en", "y"...)
    rol = rol.replace(/\s+(de|en|y|para|con)$/i, "").trim();
    return rol;
  }

  function guessRol(rawText) {
    const text = stripTags(rawText);
    const patterns = [
      // explicit label wins over a generic "busca" phrased elsewhere in the text
      // (e.g. "Posición: Product Manager. ... busca perfil con experiencia..." must not extract "perfil")
      /(?:puesto|posici[oó]n|cargo|rol|vacante)\s*[:\-]\s*([^.\n]{3,90})/i,
      // Spanish: "buscamos un X", "se busca X", "empresa X busca Y"...
      /(?:buscamos|se busca|se necesita|necesitamos|estamos buscando|busca incorporar|busca)\s+(?:un[ao]?\s+)?(?:incorporar\s+)?(?:a\s+)?(?:un[ao]?\s+)?([^.\n,]{3,90})/i,
      // English: "looking for a X", "seeking X", "hiring a X"
      /(?:looking for|seeking|hiring)\s+(?:an?\s+)?([^.\n,]{3,90})/i,
      // English: "X Developer with Y" / "X Engineer needed for..." — role phrase leads the sentence
      /^([A-Za-z][A-Za-z0-9À-ÿ\/\-\s]{2,60}?)\s+(?:with|needed|required)\b/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return [trimRolPhrase(m[1])];
    }
    const firstLine = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 3 && l.length < 60);
    return firstLine ? [trimRolPhrase(firstLine)] : [];
  }

  function extractYears(text) {
    const m = text.match(/(\d{1,2})\s*\+?\s*(?:a[nñ]os|years)/i);
    return m ? [m[0].trim()] : [];
  }

  /**
   * Analyzes free-text JD and returns suggested RADAR fields.
   * Caller decides whether/how to merge these into existing state.
   */
  function analyzeJD(rawText) {
    const text = String(rawText || "").slice(0, MAX_INPUT_LENGTH);
    if (!text.trim()) {
      return { rol: [], atributos: [], dominio: [], alcance: [], refinar: [], country: null };
    }

    const rol = dedupe(guessRol(text));
    const atributos = dedupe(findMatches(text, Keywords.SKILLS));
    const dominio = dedupe(findMatches(text, Keywords.INDUSTRIES));

    const country = Countries.detectCountry(text);
    const modality = Countries.detectModality(text);
    // exclude senior/junior words that are actually part of the role title itself
    // (e.g. "Community Manager", "Tech Lead", "Head of Sales" should not count as seniority signals)
    const rolText = rol.join(" ");
    const seniorFound = findMatches(text, Keywords.SENIOR_WORDS).filter((w) => !Countries.containsWord(rolText, w));
    const juniorFound = findMatches(text, Keywords.JUNIOR_WORDS).filter((w) => !Countries.containsWord(rolText, w));
    const years = extractYears(text);

    const alcance = dedupe([...(country ? [country] : []), ...modality, ...seniorFound, ...juniorFound, ...years]);

    const refinar = [];
    if (seniorFound.length && !juniorFound.length) {
      refinar.push("junior", "trainee", "practicante");
    }

    return { rol, atributos, dominio, alcance, refinar: dedupe(refinar), country };
  }

  return {
    MAX_INPUT_LENGTH,
    dedupe,
    findMatches,
    guessRol,
    trimRolPhrase,
    extractYears,
    analyzeJD,
  };
});
