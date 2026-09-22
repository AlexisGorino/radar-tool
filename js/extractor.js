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

  // Real JDs commonly split skills into "Excluyentes/Requisitos" (dealbreakers)
  // and "Deseables/Plus/Nice to have" (bonus) — see the Ardua fixture. A skill
  // that only shows up after that marker is optional, not a filter you want
  // eating one of the few slots the boolean has room for. A skill mentioned
  // on BOTH sides (required, and repeated as a "plus") stays a real requirement.
  const OPTIONAL_SECTION_RE = /\b(deseables?|plus|nice to have|valorable|opcionales?|a favor|suma(?:n)? puntos)\b/i;

  function optionalOnlySkills(text, bank) {
    const marker = text.match(OPTIONAL_SECTION_RE);
    if (!marker) return [];
    const before = text.slice(0, marker.index);
    const after = text.slice(marker.index);
    const requiredElsewhere = new Set(findMatches(before, bank).map((t) => t.toLowerCase()));
    return findMatches(after, bank).filter((t) => !requiredElsewhere.has(t.toLowerCase()));
  }

  function stripTags(text) {
    return text.replace(/<[^>]*>/g, " ").replace(/\s{2,}/g, " ").trim();
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

  // A JD names its own opening ("Sr. Backend Developer", "Ssr. QA Analyst")
  // with the internal seniority shorthand, but almost nobody spells their
  // own profile title that way — quoting it whole turns a normal boolean
  // into one that matches almost nobody. This exact prefix zeroed out
  // LinkedIn, Google X-Ray and Bing on a real Rol AND Atributos AND Dominio
  // AND Alcance search that had no other problem. Strip it before it ever
  // reaches a chip, the same way it's already stripped for GitHub's free
  // text in generator.js — the seniority itself still surfaces, but as a
  // Refinar suggestion (SENIOR_WORDS/JUNIOR_WORDS below), never as a
  // dead-weight literal baked into the one field every network ANDs against.
  const LEADING_SENIORITY_ABBREV_RE = /^(?:sr|ssr|jr)\.?\s+/i;

  function trimRolPhrase(raw) {
    let rol = raw.trim().replace(LEADING_VERB_RE, "").replace(LEADING_SENIORITY_ABBREV_RE, "").trim();
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

  // The 2-hits rule above only sees whatever survives trimRolPhrase — and a
  // stray "Senior" or similar stopword right after the second label can cut
  // the candidate down to just one surviving noise word ("PUESTO - CLIENTE
  // Sogeti España - Senior QA Engineer..." trims to "CLIENTE Sogeti España -"
  // once "Senior" triggers the cut, losing "COD VACANTE" before the noise
  // check ever runs). A "ficha de puesto" header is really "label directly
  // followed by ANOTHER label" ("Puesto - Cliente", "Puesto - Cod Vacante")
  // — checking the raw, untrimmed capture's first word catches that shape
  // regardless of what gets trimmed away afterward.
  function startsWithTemplateLabel(rawCapture) {
    const firstWord = (rawCapture || "").trim().split(/\s+/)[0] || "";
    return TEMPLATE_NOISE_WORDS.some((w) => w.toLowerCase() === firstWord.toLowerCase());
  }

  // Mindata's own recurring "ficha de puesto" header reads "Cliente <empresa>
  // [- <área>] - <título real> COD VACANTE ...", flattened by pdf.js into one
  // run. The real title is whatever sits in the LAST hyphen-separated
  // segment, right before trailing noise fields (COD VACANTE, DEPARTAMENTO...)
  // pick back up — recovered here instead of just discarding the whole match,
  // since a short JD may have no other clean label anywhere else to fall
  // back on. Tested against two real fichas — one 2-segment ("Cliente W2M -
  // PM Ciberseguridad"), one 3-segment ("Cliente Mindata - Financiero -
  // Tesorería Junior") — and both resolve to just the trailing title.
  function salvageTemplateHeaderTitle(rawCapture) {
    const segments = rawCapture.split(/\s+-\s+/).map((s) => s.trim());
    const last = segments[segments.length - 1];
    if (!last) return null;
    const trailingNoiseRe = new RegExp("\\s+(?:" + TEMPLATE_NOISE_WORDS.join("|") + ")\\b[\\s\\S]*", "i");
    return last.replace(trailingNoiseRe, "").trim();
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

  // A responsibility bullet ("Rol: Gestionar proyectos estratégicos...",
  // "Funciones: Liderar el equipo...") starts with an infinitive verb
  // describing an action — a real job title is a noun phrase ("PM
  // Ciberseguridad", "Senior QA Engineer"), never a verb. One real JD's
  // "Rol:" label introduced a full responsibility sentence instead of a
  // title, and it would have won the retry loop below on its own merit —
  // it's not template noise, it's not a bare skill, nothing else catches it.
  const RESPONSIBILITY_VERBS = new Set([
    "gestionar", "liderar", "definir", "diseñar", "disenar", "coordinar", "ejecutar",
    "analizar", "desarrollar", "administrar", "supervisar", "colaborar", "participar",
    "contribuir", "mantener", "dar", "brindar", "realizar", "apoyar", "garantizar",
    "identificar", "elaborar", "revisar", "controlar", "planificar", "organizar",
    "negociar", "asegurar", "monitorizar", "validar", "construir", "implementar",
    "documentar", "reportar", "responder", "atender", "asistir", "capacitar",
  ]);
  function looksLikeResponsibilityBullet(candidate) {
    const firstWord = candidate.trim().toLowerCase().split(/\s+/)[0] || "";
    return RESPONSIBILITY_VERBS.has(firstWord);
  }

  function guessRol(rawText) {
    const text = stripTags(rawText);
    const patterns = [
      // explicit label wins over a generic "busca" phrased elsewhere in the text
      // (e.g. "Posición: Product Manager. ... busca perfil con experiencia..." must not extract "perfil")
      // "cargo" excludes a leading "a " on purpose: "3 personas a cargo" / "posiciones
      // a cargo" is an org-chart idiom (who reports to this role), never a title label —
      // a real label reads "Cargo: X" with nothing in front of it. "puesto" excludes
      // "código de/del puesto" — a corporate JD's internal job CODE label ("Código de
      // Puesto: MD-COM-IR-SR"), not the title; "denominación (oficial)" is the label
      // that template actually uses for the real title, right after the code.
      /(?<!a )(?:(?<!c[oó]digo de )(?<!c[oó]digo del )puesto|posici[oó]n|cargo|rol|vacante|denominaci[oó]n(?:\s+oficial)?)\s*[:\-]\s*([^.\n]{3,90})/gi,
      // Spanish: "buscamos un X", "se busca X", "empresa X busca Y", "queremos incorporar X",
      // "busco X" / "necesito X" / "quiero X" (recruiter typing for themselves, first person)...
      /(?:buscamos|se busca|se necesita|necesitamos|estamos buscando|queremos incorporar|queremos sumar|busca incorporar|busco|necesito|quiero|busca)\s+(?:un[ao]?\s+)?(?:incorporar\s+)?(?:a\s+)?(?:un[ao]?\s+)?(?:\d+\s+)?([^.\n,]{3,90})/gi,
      // English: "looking for a X", "seeking X", "hiring a X"
      /(?:looking for|seeking|hiring)\s+(?:an?\s+)?([^.\n,]{3,90})/gi,
      // English: "X Developer with Y" / "X Engineer needed for..." — role phrase leads the sentence
      /^([A-Za-z][A-Za-z0-9À-ÿ\/\-\s]{2,60}?)\s+(?:with|needed|required)\b/i,
    ];
    for (const p of patterns) {
      // A "ficha de puesto" template's own header ("PUESTO - CLIENTE X - Y")
      // is often the FIRST thing a label pattern matches, and it's noise. A
      // real JD had a clean "Puesto: Senior QA Engineer" label sitting
      // further down that never got a chance, because this loop used to
      // give up on the whole pattern after just its first, bad match.
      // Global + a manual loop tries every match of a pattern in turn before
      // moving on to the next pattern.
      let m;
      p.lastIndex = 0;
      while ((m = p.exec(text)) !== null) {
        const raw = startsWithTemplateLabel(m[1]) ? salvageTemplateHeaderTitle(m[1]) : m[1];
        const candidate = raw ? trimRolPhrase(raw) : "";
        if (
          candidate &&
          !looksLikeTemplateNoise(candidate) &&
          !isBareNonRole(candidate) &&
          !looksLikeResponsibilityBullet(candidate)
        )
          return [candidate];
        if (!p.global) break; // patterns without /g (the English lead-sentence one) only ever get one shot
      }
    }
    // Plain-text JDs with real line breaks: the title is often just the
    // first short line, no verb or label needed ("Analista de Datos Senior\n...").
    const firstLine = text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 3 && l.length < 60 && !looksLikeTemplateNoise(l) && !isBareNonRole(trimRolPhrase(l)) && !looksLikeResponsibilityBullet(trimRolPhrase(l)));
    if (firstLine) return [trimRolPhrase(firstLine)];

    // PDF-extracted JDs rarely have real line breaks at all — pdf.js joins
    // every text run on a page with a single space, so a modern JD template
    // that opens with just the title ("Sr. Backend Developer  Ardua
    // Solutions · Tecnología  Reporta a: ...") has no punctuation or verb
    // to anchor on and no "\n" to split on either, so every pattern above
    // and the firstLine check both come up empty. As a last resort, look
    // for a title-shaped phrase — ending in a recognizable job-title noun —
    // right at the start of the document.
    const TITLE_NOUN =
      "Developer|Engineer|Manager|Analyst|Consultant|Designer|Architect|Specialist|Director|Coordinator|Lead|Officer|Representative|Executive|Assistant|Technician|Recruiter|Scientist|Programmer|" +
      "Desarrollador[a]?|Ingenier[oa]|Gerente|Analista|Consultor[a]?|Diseñador[a]?|Arquitect[oa]|Especialista|Director[a]?|Coordinador[a]?|L[íi]der|Ejecutivo[a]?|Asistente|T[ée]cnic[oa]|Responsable|Jefe[a]?|Programador[a]?|Comercial|Vendedor[a]?|Auditor[a]?";
    const titleHeadRe = new RegExp("^((?:[A-Za-zÀ-ÿ.]+\\s+){0,6}?(?:" + TITLE_NOUN + "))\\b", "i");
    const prefix = text.slice(0, 150).replace(LEADING_VERB_RE, "");
    const headMatch = prefix.match(titleHeadRe);
    if (headMatch) {
      const candidate = trimRolPhrase(headMatch[1]);
      if (
        candidate &&
        !startsWithTemplateLabel(headMatch[1]) &&
        !looksLikeTemplateNoise(candidate) &&
        !isBareNonRole(candidate) &&
        !looksLikeResponsibilityBullet(candidate)
      )
        return [candidate];
    }
    return [];
  }

  // Words that show up in an actual job posting (any section: intro,
  // responsibilities, requirements, benefits...) but essentially never in
  // unrelated text pasted by mistake (a CV, a news article, a random
  // paragraph). Used only as one signal among several — see isJobPosting.
  const JD_SECTION_WORDS = [
    "responsabilidades", "funciones", "tareas", "requisitos", "requerimientos",
    "beneficios", "salario", "sueldo", "experiencia", "conocimientos", "habilidades",
    "perfil", "puesto", "vacante", "cargo", "posici[oó]n", "postulate", "postulaci[oó]n",
    "buscamos", "se busca", "estamos buscando", "necesitamos", "reporta a",
    "responsibilities", "requirements", "qualifications", "reports to", "apply",
  ];
  function countJobPostingSignals(text, analyzed) {
    let signals = 0;
    // A real role title survives several anti-false-positive guards already
    // (looksLikeTemplateNoise, isBareNonRole...), so on its own it's already
    // as trustworthy as two weaker signals combined — "busco un Backend
    // Developer" with nothing else shouldn't be rejected as "not a JD".
    if (analyzed.rol.length) signals += 2;
    if (analyzed.country) signals++;
    if (analyzed.atributos.length) signals++;
    if (analyzed.dominio.length) signals++;
    if (JD_SECTION_WORDS.some((w) => new RegExp("\\b" + w + "\\b", "i").test(text))) signals++;
    return signals;
  }

  // Below this many signals (rol / país / atributos / dominio / palabra
  // típica de JD), the text is treated as "not a job posting" rather than
  // silently generating an empty or misleading analysis. 2 is deliberately
  // low: a short manual query like "busco Java Developer en Brasil" only
  // has 2 signals (rol + país) and must still be accepted.
  const MIN_JOB_POSTING_SIGNALS = 2;

  // A résumé almost always leads with the candidate's own contact info —
  // email, "Curriculum Vitae" — a JD almost never does. This fires even when
  // the text also has enough generic JD-shaped signals to otherwise pass
  // isJobPosting (a résumé's own "Experience"/skills section does): it's a
  // narrower, specific check that overrides the general one, not a stricter
  // version of it. A real candidate's CV (name, phone, email, "Professional
  // Experience") passed isJobPosting on its own JD-like vocabulary alone and
  // came out with a nonsense Rol pulled from "Seeking challenging backend
  // projects...".
  const RESUME_HEAD_CHARS = 200;
  function looksLikeResume(text) {
    const head = text.slice(0, RESUME_HEAD_CHARS);
    return /[\w.+-]+@[\w.-]+\.\w{2,}/.test(head) || /curriculum\s*vitae/i.test(head);
  }

  function analyzeJD(rawText) {
    const text = String(rawText || "").slice(0, MAX_INPUT_LENGTH);
    if (!text.trim()) {
      return { rol: [], atributos: [], dominio: [], alcance: [], refinar: [], refinarSuggestion: [], country: null, isJobPosting: false, isResume: false };
    }

    const rol = dedupe(guessRol(text));
    const deprioritizeSkills = [...Keywords.GENERIC_SKILLS, ...optionalOnlySkills(text, Keywords.SKILLS)];
    const atributos = dedupe(findMatchesRanked(text, Keywords.SKILLS, MAX_ATTRIBUTES, deprioritizeSkills));
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

    const analyzed = { rol, atributos, dominio, alcance, refinar: [], refinarSuggestion, country };
    analyzed.isResume = looksLikeResume(text);
    // A résumé never counts as a job posting, no matter how many generic
    // signals it also trips — see looksLikeResume above.
    analyzed.isJobPosting = !analyzed.isResume && countJobPostingSignals(text, analyzed) >= MIN_JOB_POSTING_SIGNALS;
    return analyzed;
  }

  return {
    MAX_INPUT_LENGTH,
    MAX_ATTRIBUTES,
    MAX_DOMINIO,
    MIN_JOB_POSTING_SIGNALS,
    dedupe,
    findMatches,
    findMatchesRanked,
    looksLikeTemplateNoise,
    optionalOnlySkills,
    looksLikeResume,
    countJobPostingSignals,
    guessRol,
    trimRolPhrase,
    analyzeJD,
  };
});
