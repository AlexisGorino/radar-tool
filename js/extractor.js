// JD text -> RADAR fields. No DOM, no side effects — see tests/run.js and tests/jd-bank.js.
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

  const MAX_INPUT_LENGTH = 20000;
  // Keep the auto-detected fields strategic rather than exhaustive — every
  // extra term in a boolean narrows the pool, so more matches is worse, not
  // better. Only the sharpest, most technical signals should make the cut.
  const MAX_ATTRIBUTES = 6;
  const MAX_DOMINIO = 2;

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

  /**
   * Same match set as findMatches, but ordered by where each term first
   * appears in the text instead of bank order — a term mentioned in the
   * first line of a JD is a stronger signal than one buried in a footnote,
   * so it should surface first. Optionally capped to `limit` terms so a
   * field like Dominio stays "lo justo y necesario" instead of collecting
   * every incidental match (a degree name mentioning "Telecomunicaciones"
   * shouldn't dilute the JD's actual industry).
   */
  function findMatchesRanked(text, bank, limit, deprioritize) {
    const lowerText = text.toLowerCase();
    const found = findMatches(text, bank);
    const deprioritizeSet = new Set((deprioritize || []).map((t) => t.toLowerCase()));
    const withIndex = found.map((term) => {
      const re = new RegExp("(^|[^a-záéíóúñü0-9])" + term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-záéíóúñü0-9])", "i");
      const m = lowerText.match(re);
      return { term, index: m ? m.index : Infinity, generic: deprioritizeSet.has(term.toLowerCase()) };
    });
    // specific/technical terms first (by where they appear), generic ones
    // (Scrum, Agile, QA...) only fill whatever room is left under the cap
    withIndex.sort((a, b) => (a.generic === b.generic ? a.index - b.index : a.generic ? 1 : -1));
    const ranked = withIndex.map((x) => x.term);
    return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
  }

  function stripTags(text) {
    return text.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ");
  }

  // Every country/city term plus modality words, longest-first so "buenos aires"
  // is tried before "aires" would ever be (it isn't a term, but same idea applies
  // generally) — avoids a short term matching inside a longer one.
  let LOCATION_TAIL_RE = null;
  function locationTailRegex() {
    if (LOCATION_TAIL_RE) return LOCATION_TAIL_RE;
    const terms = [];
    Object.values(Countries.ALL_COUNTRIES).forEach((list) => terms.push(...list));
    terms.push(...Countries.countryList());
    const escaped = Array.from(new Set(terms.map((t) => t.toLowerCase())))
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    LOCATION_TAIL_RE = new RegExp("\\s+en\\s+(?:" + escaped.join("|") + ")\\b.*$", "i");
    return LOCATION_TAIL_RE;
  }

  // Strips a leading "busco/necesito/quiero/buscamos/..." verb the same way
  // the pattern-based capture already excludes it — needed for the firstLine
  // fallback path, which passes a whole raw line through without ever going
  // through that capture group.
  const LEADING_VERB_RE =
    /^(?:buscamos|se busca|se necesita|necesitamos|estamos buscando|queremos incorporar|queremos sumar|busca incorporar|busco|necesito|quiero|busca)\s+(?:un[ao]?\s+)?(?:incorporar\s+)?(?:a\s+)?(?:un[ao]?\s+)?(?:\d+\s+)?/i;

  function trimRolPhrase(raw) {
    let rol = raw.trim().replace(LEADING_VERB_RE, "").trim();
    const stopWords =
      /\s+(para|con|a nuestro|a nuestra|al equipo|a su equipo|with|senior|junior|ssr|sr\.?|trainee|responsable de|a cargo de|que tenga|que cuente|de al menos|needed|required|based in|located in|remoto|remota|remote|h[íi]brid[oa]|hybrid|presencial|onsite)\b[\s\S]*/i;
    rol = rol.replace(stopWords, "").trim();
    rol = rol.replace(locationTailRegex(), "").trim();
    // a leading count ("1 PM Ciberseguridad") isn't part of the title
    rol = rol.replace(/^\d+\s+/, "").trim();
    if (rol.length > 60) {
      const cut = rol.slice(0, 60);
      const lastSpace = cut.lastIndexOf(" ");
      rol = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
    }
    // drop a trailing connector word left over from the cut ("de", "en", "y"...)
    rol = rol.replace(/\s+(de|en|y|para|con)$/i, "").trim();
    return rol;
  }

  // Corporate "ficha de puesto" templates (frequent in agency JDs) put a label
  // like "PUESTO - CLIENTE" right next to the next field's label, with no
  // sentence punctuation in between once a PDF flattens the table — so a
  // naive "puesto: X" match can swallow half the form. If a candidate role
  // still contains several of these scaffolding words, it's the form, not a
  // job title, and should be discarded in favor of the next pattern.
  const TEMPLATE_NOISE_WORDS = [
    "cliente",
    "cod",
    "vacante",
    "departamento",
    "area",
    "área",
    "ubicacion",
    "ubicación",
    "candidato",
    "modalidad",
    "horario",
    "laboral",
    "rate",
    "salarial",
    "conocimientos",
    "validacion",
    "validación",
    "tecnica",
    "técnica",
    "skills",
    "tecnologicas",
    "tecnológicas",
    "funciones",
    "comentarios",
    "adicionales",
  ];
  function looksLikeTemplateNoise(candidate) {
    let hits = 0;
    for (const w of TEMPLATE_NOISE_WORDS) {
      if (Countries.containsWord(candidate, w)) hits++;
      if (hits >= 2) return true;
    }
    return false;
  }

  // A bare programming language, cloud provider or framework name is never a
  // job title on its own ("busco Java" names a skill, not a role) — but an
  // acronym like "SRE" or "SAP FICO" genuinely doubles as informal shorthand
  // for the role itself in real recruiter usage, so only the unambiguous
  // ones are blocked here, not the whole SKILLS bank.
  const NEVER_A_ROLE = new Set(
    [
      "java", "python", "javascript", "typescript", "c#", "c++", "php", "ruby", "go", "kotlin", "swift",
      "node.js", ".net", "react", "angular", "vue",
      "aws", "azure", "gcp", "sql", "nosql", "mongodb", "postgresql", "mysql",
      "docker", "kubernetes", "terraform", "ci/cd",
      "spring", "spring boot", "django", "flask", "fastapi", "laravel", "rails",
      "selenium", "cypress", "figma", "power bi", "tableau", "etl", "spark",
    ].map((t) => t.toLowerCase())
  );
  // A bare place name ("Brasil", "Rosario") is never a job title either.
  function isBareNonRole(candidate) {
    const c = candidate.trim().toLowerCase();
    if (!c) return true;
    if (NEVER_A_ROLE.has(c)) return true;
    const placeMatch =
      Object.keys(Countries.ALL_COUNTRIES).some((country) => country.toLowerCase() === c) ||
      Object.values(Countries.ALL_COUNTRIES).some((terms) => terms.some((t) => t === c));
    return placeMatch;
  }

  function guessRol(rawText) {
    const text = stripTags(rawText);
    const patterns = [
      // explicit label wins over a generic "busca" phrased elsewhere in the text
      // (e.g. "Posición: Product Manager. ... busca perfil con experiencia..." must not extract "perfil")
      /(?:puesto|posici[oó]n|cargo|rol|vacante)\s*[:\-]\s*([^.\n]{3,90})/i,
      // Spanish: "buscamos un X", "se busca X", "empresa X busca Y", "queremos incorporar X",
      // "busco X" / "necesito X" / "quiero X" (recruiter typing for themselves, first person)...
      /(?:buscamos|se busca|se necesita|necesitamos|estamos buscando|queremos incorporar|queremos sumar|busca incorporar|busco|necesito|quiero|busca)\s+(?:un[ao]?\s+)?(?:incorporar\s+)?(?:a\s+)?(?:un[ao]?\s+)?(?:\d+\s+)?([^.\n,]{3,90})/i,
      // English: "looking for a X", "seeking X", "hiring a X"
      /(?:looking for|seeking|hiring)\s+(?:an?\s+)?([^.\n,]{3,90})/i,
      // English: "X Developer with Y" / "X Engineer needed for..." — role phrase leads the sentence
      /^([A-Za-z][A-Za-z0-9À-ÿ\/\-\s]{2,60}?)\s+(?:with|needed|required)\b/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        const candidate = trimRolPhrase(m[1]);
        if (candidate && !looksLikeTemplateNoise(candidate) && !isBareNonRole(candidate)) return [candidate];
      }
    }
    const firstLine = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 3 && l.length < 60 && !looksLikeTemplateNoise(l) && !isBareNonRole(trimRolPhrase(l)));
    return firstLine ? [trimRolPhrase(firstLine)] : [];
  }

  function extractYears(text) {
    const m = text.match(/(\d{1,2})\s*\+?\s*(?:a[nñ]os|years)/i);
    return m ? [m[0].trim()] : [];
  }

  function analyzeJD(rawText) {
    const text = String(rawText || "").slice(0, MAX_INPUT_LENGTH);
    if (!text.trim()) {
      return { rol: [], atributos: [], dominio: [], alcance: [], refinar: [], refinarSuggestion: [], country: null };
    }

    const rol = dedupe(guessRol(text));
    const atributos = dedupe(findMatchesRanked(text, Keywords.SKILLS, MAX_ATTRIBUTES, Keywords.GENERIC_SKILLS));
    const dominio = dedupe(findMatchesRanked(text, Keywords.INDUSTRIES, MAX_DOMINIO));

    // Alcance is país + localidad only. Modalidad (remoto/híbrido/presencial)
    // and seniority used to be folded in here too, but they're candidate
    // attributes almost never spelled out verbatim on a public profile —
    // ANDing them into the boolean filters out good matches instead of
    // narrowing toward better ones. They're detected below only so the UI
    // can offer them as an editable suggestion, never as an auto-added term.
    const { country, locality } = Countries.detectLocationDetailed(text);
    const alcance = dedupe([...(country ? [country] : []), ...(locality ? [locality] : [])]);

    const modality = Countries.detectModality(text);
    const rolText = rol.join(" ");
    // "empresa/banco/compañía líder" describes the company, not the candidate's seniority
    const companyLeaderPhrase = /(empresa|compañ[íi]a|compania|banco|organizaci[oó]n|firma|grupo|corporaci[oó]n)\s+l[íi]der/i;
    const seniorFound = findMatches(text, Keywords.SENIOR_WORDS).filter((w) => {
      if (Countries.containsWord(rolText, w)) return false;
      if (/^l[íi]der$/i.test(w) && companyLeaderPhrase.test(text)) return false;
      return true;
    });
    const juniorFound = findMatches(text, Keywords.JUNIOR_WORDS).filter((w) => !Countries.containsWord(rolText, w));

    // Refinar (NOT/exclusiones) is never auto-filled: it's a deliberate
    // choice by the recruiter, not something a keyword match should guess.
    // What's detected above is surfaced as a suggestion the UI can offer,
    // not as pre-added chips.
    const refinarSuggestion = dedupe([...seniorFound, ...juniorFound, ...modality]);

    return { rol, atributos, dominio, alcance, refinar: [], refinarSuggestion, country };
  }

  return {
    MAX_INPUT_LENGTH,
    MAX_ATTRIBUTES,
    MAX_DOMINIO,
    dedupe,
    findMatches,
    findMatchesRanked,
    looksLikeTemplateNoise,
    guessRol,
    trimRolPhrase,
    extractYears,
    analyzeJD,
  };
});
