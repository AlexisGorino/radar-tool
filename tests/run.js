// node tests/run.js — zero deps, runs anywhere including a bare CI box.
const assert = require("assert");
const path = require("path");

const Countries = require(path.join(__dirname, "..", "js", "countries.js"));
const Keywords = require(path.join(__dirname, "..", "js", "keywords.js"));
const Extractor = require(path.join(__dirname, "..", "js", "extractor.js"));
const Generator = require(path.join(__dirname, "..", "js", "generator.js"));

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, err });
  }
}

// ---------------------------------------------------------------
// 1. Country detection — must isolate the right country, not bleed into others
// ---------------------------------------------------------------

test("detects Argentina from city name", () => {
  assert.strictEqual(Countries.detectCountry("Buscamos un dev para Córdoba, Argentina"), "Argentina");
});

test("detects Chile without matching Argentina", () => {
  const c = Countries.detectCountry("Puesto remoto en Santiago de Chile");
  assert.strictEqual(c, "Chile");
});

test("detects México (accented and unaccented city names)", () => {
  assert.strictEqual(Countries.detectCountry("Vacante en Ciudad de Mexico"), "México");
  assert.strictEqual(Countries.detectCountry("Vacante en Ciudad de México"), "México");
});

test("detects Spain and does not also flag Argentina", () => {
  const text = "Empresa en Madrid, España busca perfil senior";
  assert.strictEqual(Countries.detectCountry(text), "España");
});

test("detects Germany from city Berlin", () => {
  assert.strictEqual(Countries.detectCountry("Remote role based in Berlin"), "Alemania");
});

test("does not false-positive on unrelated word containing a country substring", () => {
  // "chilena" contains "chile" as a substring but not as a whole word match target ("chile" alone)
  const c = Countries.detectCountry("Salsa chilena de referencia en el menú");
  // Whole-word matching means "chile" the word won't match "chilena" the word.
  assert.notStrictEqual(c, "Chile");
});

test("no country mentioned returns null, not a false match", () => {
  assert.strictEqual(Countries.detectCountry("Buscamos un desarrollador con experiencia en cloud"), null);
});

test("modality detection finds remoto/híbrido variants", () => {
  assert.deepStrictEqual(Countries.detectModality("Modalidad remoto, full time"), ["remoto"]);
  assert.deepStrictEqual(Countries.detectModality("Trabajo hybrid desde casa"), ["híbrido"]);
});

test("modality detection finds feminine agreement (modalidad híbrida/remota)", () => {
  assert.deepStrictEqual(Countries.detectModality("Modalidad híbrida, 2 días en oficina"), ["híbrido"]);
  assert.deepStrictEqual(Countries.detectModality("Puesto 100% remota"), ["remoto"]);
});

// ---------------------------------------------------------------
// 2. Role extraction across many real-world-style postings
// ---------------------------------------------------------------

const rolCases = [
  ["Buscamos un Consultor SAP BTP Developer senior para un cliente en Buenos Aires.", "Consultor SAP BTP Developer"],
  ["Se busca Analista de Datos con experiencia en Power BI, para empresa de retail.", "Analista de Datos"],
  ["Puesto: Jefe de Proyecto Telecomunicaciones. Se requiere disponibilidad para viajar.", "Jefe de Proyecto Telecomunicaciones"],
  ["Necesitamos un Diseñador UX/UI con portfolio en Figma.", "Diseñador UX/UI"],
  ["Estamos buscando Scrum Master certificado para equipo distribuido.", "Scrum Master certificado"],
  ["Cargo: Ejecutivo de Cuentas, sector seguros, con cartera propia.", "Ejecutivo de Cuentas"],
];

rolCases.forEach(([jd, expectedStart], i) => {
  test(`role extraction case ${i + 1}: "${expectedStart}"`, () => {
    const rol = Extractor.guessRol(jd);
    assert.ok(rol.length > 0, "expected at least one role candidate");
    assert.ok(
      rol[0].toLowerCase().startsWith(expectedStart.toLowerCase().split(" ")[0]),
      `expected role to start similarly to "${expectedStart}", got "${rol[0]}"`
    );
  });
});

test("role extraction never returns a string longer than 60 chars", () => {
  const longJd = "Buscamos un Ingeniero de Software Full Stack con experiencia sólida en microservicios, contenedores, orquestación y despliegue continuo para un banco líder en la región";
  const rol = Extractor.guessRol(longJd);
  rol.forEach((r) => assert.ok(r.length <= 60, `role too long: "${r}" (${r.length} chars)`));
});

// ---------------------------------------------------------------
// 3. Full analyzeJD across many varied job postings (regression net)
// ---------------------------------------------------------------

const jdBank = [
  {
    name: "SAP BTP - Argentina - banca",
    text: "Buscamos un Consultor SAP BTP Developer senior para un cliente en Buenos Aires, modalidad remoto, 5+ años de experiencia. Sector banca. Manejo de ABAP y SAP Fiori.",
    expect: { hasAtributo: "SAP BTP", hasDominio: "banca", country: "Argentina" },
  },
  {
    name: "Telecom PM - sin país explícito",
    text: "Puesto: Jefe de Proyecto Telecomunicaciones. Se requiere disponibilidad para viajar, GPON, RF, 3+ años en el sector telecom.",
    expect: { hasAtributo: "GPON", hasDominio: "telecom", country: null },
  },
  {
    name: "Java dev - Chile",
    text: "Se necesita Desarrollador Java Senior, Spring Boot, para proyecto fintech en Santiago de Chile, modalidad híbrida.",
    expect: { hasAtributo: "Java", hasDominio: "fintech", country: "Chile" },
  },
  {
    name: "Data scientist - España",
    text: "Buscamos Data Scientist con Python y Machine Learning para empresa de seguros en Madrid.",
    expect: { hasAtributo: "Python", hasDominio: "seguros", country: "España" },
  },
  {
    name: "DevOps - remoto LATAM sin ciudad",
    text: "Necesitamos DevOps Engineer con AWS y Kubernetes, 100% remoto, para startup de e-commerce.",
    expect: { hasAtributo: "AWS", hasDominio: "e-commerce", country: null },
  },
  {
    name: "QA Manager - México",
    text: "Se busca QA Manager con experiencia en Selenium y automation, para empresa de retail en Guadalajara.",
    expect: { hasAtributo: "Selenium", hasDominio: "retail", country: "México" },
  },
  {
    name: "Salesforce consultant - Colombia",
    text: "Buscamos Consultor Salesforce CRM para cliente de banca en Bogotá, 4 años de experiencia mínima.",
    expect: { hasAtributo: "Salesforce", hasDominio: "banca", country: "Colombia" },
  },
  {
    name: "Frontend React - Alemania",
    text: "Frontend Developer with React and TypeScript needed for a healthcare startup based in Berlin.",
    expect: { hasAtributo: "React", hasDominio: null, country: "Alemania" },
  },
  {
    name: "SRE - Uruguay",
    text: "Buscamos SRE con Terraform y Docker, sector telecom, Montevideo, presencial.",
    expect: { hasAtributo: "Terraform", hasDominio: "telecom", country: "Uruguay" },
  },
  {
    name: "Sin ningún dato reconocible",
    text: "Un texto random sin ningun patron reconocible de puesto laboral especifico aqui mencionado.",
    expect: { hasAtributo: null, hasDominio: null, country: null },
  },
  {
    name: "JD vacía",
    text: "",
    expect: { hasAtributo: null, hasDominio: null, country: null },
  },
  {
    name: "Texto con intento de HTML/script embebido",
    text: "Buscamos <script>alert(1)</script> Desarrollador Python senior para banco en Lima, Peru.",
    expect: { hasAtributo: "Python", hasDominio: "banco", country: "Perú" },
  },
];

jdBank.forEach((c) => {
  test(`analyzeJD: ${c.name}`, () => {
    const result = Extractor.analyzeJD(c.text);
    if (c.expect.hasAtributo) {
      assert.ok(
        result.atributos.some((a) => a.toLowerCase() === c.expect.hasAtributo.toLowerCase()),
        `expected atributos to include "${c.expect.hasAtributo}", got [${result.atributos.join(", ")}]`
      );
    } else {
      assert.strictEqual(result.atributos.length, 0, `expected no atributos, got [${result.atributos.join(", ")}]`);
    }
    if (c.expect.hasDominio) {
      assert.ok(
        result.dominio.some((d) => d.toLowerCase() === c.expect.hasDominio.toLowerCase()),
        `expected dominio to include "${c.expect.hasDominio}", got [${result.dominio.join(", ")}]`
      );
    }
    assert.strictEqual(result.country, c.expect.country, `expected country "${c.expect.country}", got "${result.country}"`);
  });
});

test("input past MAX_INPUT_LENGTH is truncated before processing, does not hang or crash", () => {
  const huge = "Buscamos Backend Developer Python. " + "relleno ".repeat(50000); // ~430KB
  const start = Date.now();
  const result = Extractor.analyzeJD(huge);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `analyzeJD took too long on oversized input: ${elapsed}ms`);
  assert.ok(result.rol.length > 0, "still extracts a role from the truncated prefix");
});

test("HTML-like text in JD never gets executed or specially parsed — it is just a string", () => {
  const result = Extractor.analyzeJD("<img src=x onerror=alert(1)> Buscamos Analista para banca");
  // guessRol may or may not pick this up depending on line heuristics; the point is
  // whatever it returns is a plain string, not interpreted markup.
  result.rol.forEach((r) => assert.strictEqual(typeof r, "string"));
});

// ---------------------------------------------------------------
// 4. Generator — conciseness, correctness, URL safety
// ---------------------------------------------------------------

test("universal boolean stays short even with many attributes (caps at 4 per group)", () => {
  const state = {
    rol: ["Desarrollador Backend"],
    atributos: ["Java", "Python", "Go", "Kotlin", "Swift", "PHP", "Ruby"],
    dominio: ["fintech"],
    alcance: ["Argentina"],
    refinar: ["junior"],
  };
  const bool = Generator.buildUniversalBoolean(state);
  const orMatches = bool.match(/OR/g) || [];
  assert.ok(orMatches.length <= 3, `expected at most 3 OR joins (4 terms), got ${orMatches.length}: ${bool}`);
  assert.ok(bool.length < 220, `boolean too long (${bool.length} chars): ${bool}`);
});

test("universal boolean quotes multi-word terms only", () => {
  const state = { rol: ["Project Manager"], atributos: ["AWS"], dominio: [], alcance: [], refinar: [] };
  const bool = Generator.buildUniversalBoolean(state);
  assert.strictEqual(bool, '"Project Manager" AND AWS');
});

test("universal boolean applies NOT for every refinar term", () => {
  const state = { rol: ["QA"], atributos: [], dominio: [], alcance: [], refinar: ["junior", "trainee"] };
  const bool = Generator.buildUniversalBoolean(state);
  assert.ok(bool.includes("NOT junior"));
  assert.ok(bool.includes("NOT trainee"));
});

test("a term with an embedded double quote never produces a malformed boolean", () => {
  const state = { rol: ['Java "Enterprise" Developer'], atributos: [], dominio: [], alcance: [], refinar: [] };
  const bool = Generator.buildUniversalBoolean(state);
  assert.strictEqual(bool, '"Java Enterprise Developer"');
  assert.strictEqual((bool.match(/"/g) || []).length, 2, `expected exactly one quoted phrase, got: ${bool}`);
});

test("empty state produces empty boolean, not a crash", () => {
  const bool = Generator.buildUniversalBoolean({ rol: [], atributos: [], dominio: [], alcance: [], refinar: [] });
  assert.strictEqual(bool, "");
});

test("relaxed mode drops Dominio and Alcance, keeps only Rol AND Atributos", () => {
  const state = { rol: ["PM Ciberseguridad"], atributos: ["AWS", "ISO 27001"], dominio: ["ciberseguridad"], alcance: ["España", "Palma"], refinar: [] };
  const full = Generator.buildUniversalBoolean(state, false);
  const relaxed = Generator.buildUniversalBoolean(state, true);
  assert.ok(full.includes("ciberseguridad") && full.includes("España"), `full version should include dominio/alcance, got: ${full}`);
  assert.ok(!relaxed.includes("ciberseguridad") && !relaxed.includes("España"), `relaxed version must drop dominio/alcance, got: ${relaxed}`);
  assert.strictEqual(relaxed, '"PM Ciberseguridad" AND (AWS OR "ISO 27001")');
});

test("relaxed mode still applies NOT exclusions from Refinar", () => {
  const state = { rol: ["QA"], atributos: ["Selenium"], dominio: ["retail"], alcance: ["Argentina"], refinar: ["junior"] };
  const relaxed = Generator.buildUniversalBoolean(state, true);
  assert.ok(relaxed.includes("NOT junior"));
  assert.ok(!relaxed.includes("retail"));
});

test("relaxed X-Ray and resumes queries also drop Dominio/Alcance", () => {
  const state = { rol: ["QA"], atributos: ["Selenium"], dominio: ["retail"], alcance: ["Argentina"], refinar: [] };
  const xray = Generator.buildXRayQuery(state, "linkedin.com/in", true);
  assert.ok(!xray.includes("retail") && !xray.includes("Argentina"));
  const resumes = Generator.buildResumesQuery(state, true);
  assert.ok(!resumes.includes("retail") && !resumes.includes("Argentina"));
});

test("X-Ray query uses minus instead of NOT and includes site:", () => {
  const state = { rol: ["QA"], atributos: [], dominio: [], alcance: [], refinar: ["junior"] };
  const xray = Generator.buildXRayQuery(state, "linkedin.com/in");
  assert.ok(xray.startsWith("site:linkedin.com/in"));
  assert.ok(xray.includes("-junior"));
  assert.ok(!xray.includes("NOT"));
});

test("Google and Bing URLs are properly percent-encoded (no raw spaces or quotes)", () => {
  const query = 'site:linkedin.com/in "Project Manager" AND AWS -junior';
  const gUrl = Generator.googleUrl(query);
  const bUrl = Generator.bingUrl(query);
  assert.ok(!gUrl.includes(" "), "Google URL must not contain raw spaces");
  assert.ok(!gUrl.includes('"'), "Google URL must not contain raw quotes");
  assert.ok(gUrl.startsWith("https://www.google.com/search?q="));
  assert.ok(bUrl.startsWith("https://www.bing.com/search?q="));
});

test("linkedinSearchUrl encodes the universal boolean for LinkedIn's own search box", () => {
  const url = Generator.linkedinSearchUrl('"Project Manager" AND AWS -junior');
  assert.ok(url.startsWith("https://www.linkedin.com/search/results/people/?keywords="));
  assert.ok(!url.includes(" "), "must be percent-encoded, no raw spaces");
  assert.ok(!url.includes('"'), "must be percent-encoded, no raw quotes");
});

test("GitHub people URL detects language and builds native search query", () => {
  const state = { rol: ["Developer"], atributos: ["Python", "AWS"], dominio: [], alcance: ["Argentina"], refinar: [] };
  const url = Generator.buildGithubPeopleUrl(state);
  assert.ok(url.includes("language%3Apython") || url.includes("language:python"));
  assert.ok(url.includes("type=users"));
});

test("GitHub repo URL includes stars filter when provided", () => {
  const state = { rol: ["cli tool"], atributos: ["Go"], dominio: [], alcance: [], refinar: [] };
  const url = Generator.buildGithubRepoUrl(state, 100);
  assert.ok(url.includes("stars"));
  assert.ok(url.includes("type=repositories"));
});

test("GitHub people URL keeps the role text for non-technical searches (not just location)", () => {
  const state = { rol: ["Ejecutivo de Cuentas"], atributos: ["CRM"], dominio: ["seguros"], alcance: ["México"], refinar: ["junior"] };
  const url = Generator.buildGithubPeopleUrl(state);
  assert.ok(url.includes(encodeURIComponent("Ejecutivo de Cuentas")), `expected role text in url, got: ${url}`);
  assert.ok(url.includes("location"));
});

test("GitHub people URL strips 'Sr./Jr./Ssr.' title prefixes that silently zero out GitHub's search", () => {
  const state = { rol: ["Sr. Backend Developer"], atributos: ["Go", "AWS"], dominio: ["fintech"], alcance: ["Argentina"], refinar: [] };
  const url = Generator.buildGithubPeopleUrl(state);
  assert.ok(url.includes(encodeURIComponent("Backend Developer")));
  assert.ok(!url.includes(encodeURIComponent("Sr.")), `"Sr." must not reach the GitHub query, got: ${url}`);
});

test("stripAbbreviatedTitlePrefix only strips a real abbreviation, not a normal word", () => {
  assert.strictEqual(Generator.stripAbbreviatedTitlePrefix("Sr. Backend Developer"), "Backend Developer");
  assert.strictEqual(Generator.stripAbbreviatedTitlePrefix("Srta. Backend Developer"), "Srta. Backend Developer");
  assert.strictEqual(Generator.stripAbbreviatedTitlePrefix("Backend Developer"), "Backend Developer");
});

test("GitHub people URL falls back gracefully when no language detected", () => {
  const state = { rol: ["Product Manager"], atributos: [], dominio: [], alcance: [], refinar: [] };
  const url = Generator.buildGithubPeopleUrl(state);
  assert.ok(url.includes("type=users"));
  assert.ok(url.length > 40); // did not throw, produced something usable
});

// ---------------------------------------------------------------
// 4b. "Is this actually a job posting?" — pasted content unrelated to a JD
// (a recipe, a news article, a CV) should be flagged instead of silently
// producing an empty or misleading analysis.
// ---------------------------------------------------------------

test("unrelated text (news, recipe) is flagged as not a job posting", () => {
  const news = Extractor.analyzeJD(
    "El gobierno anuncio ayer nuevas medidas economicas que afectaran el tipo de cambio segun analistas del mercado financiero local."
  );
  assert.strictEqual(news.isJobPosting, false);

  const recipe = Extractor.analyzeJD("Para hacer un buen asado necesitas carne de calidad, sal gruesa y paciencia.");
  assert.strictEqual(recipe.isJobPosting, false);
});

test("empty input is flagged as not a job posting", () => {
  const r = Extractor.analyzeJD("");
  assert.strictEqual(r.isJobPosting, false);
});

test("a short manual query with just a role is still accepted as a job posting", () => {
  const r = Extractor.analyzeJD("busco un Backend Developer");
  assert.strictEqual(r.rol[0], "Backend Developer");
  assert.strictEqual(r.isJobPosting, true, "a real role title alone is enough signal");
});

test("a short manual query with role + location is accepted", () => {
  const r = Extractor.analyzeJD("busco un Backend Developer con Java y Spring que viva en Brasil");
  assert.strictEqual(r.isJobPosting, true);
});

test("a full real JD (with no explicit role match) is still accepted via combined signals", () => {
  // dominio + país + atributos + JD-section words add up even without a
  // confidently-parsed rol — this must not be flagged as "not a JD".
  const r = Extractor.analyzeJD(
    "Requisitos: experiencia en Python y SQL. Responsabilidades: mantenimiento de pipelines de datos. Sede en Bogotá, Colombia. Sector fintech."
  );
  assert.strictEqual(r.isJobPosting, true);
});

// ---------------------------------------------------------------
// 5. Chip-list style operations (add/remove/clear) — logic mirrors app.js state handling
// ---------------------------------------------------------------

test("dedupe removes case-insensitive duplicates but keeps first casing", () => {
  const out = Extractor.dedupe(["Java", "java", "JAVA", "Python"]);
  assert.deepStrictEqual(out, ["Java", "Python"]);
});

test("no artificial cap on number of chips a field can hold", () => {
  const many = Array.from({ length: 50 }, (_, i) => "skill" + i);
  const out = Extractor.dedupe(many);
  assert.strictEqual(out.length, 50);
});

// Alcance is país + localidad only now — seniority/modality never get
// auto-added to it (or to refinar): they're surfaced as refinarSuggestion
// for the recruiter to accept or ignore, never as a pre-added filter term.

test("role words like 'Manager' or 'Lead' inside the title are not mistaken for a seniority signal", () => {
  const r1 = Extractor.analyzeJD("Se busca Community Manager para empresa de turismo en Mendoza, Argentina.");
  assert.ok(!r1.refinarSuggestion.some((a) => a.toLowerCase() === "manager"), `refinarSuggestion should not include "manager", got [${r1.refinarSuggestion.join(", ")}]`);
  assert.strictEqual(r1.refinar.length, 0, "refinar is never auto-filled");

  const r2 = Extractor.analyzeJD("Buscamos Tech Lead con experiencia en microservicios para banco en Lima.");
  assert.ok(!r2.refinarSuggestion.some((a) => a.toLowerCase() === "lead"), `refinarSuggestion should not include "lead" from the title, got [${r2.refinarSuggestion.join(", ")}]`);
});

test("'empresa/banco lider' describes the company, not the candidate's seniority", () => {
  const r = Extractor.analyzeJD("Buscamos Backend Developer Python Senior para banco líder en Buenos Aires, modalidad híbrida.");
  assert.ok(!r.refinarSuggestion.some((a) => a.toLowerCase() === "líder"), `refinarSuggestion should not include "líder" from "banco líder", got [${r.refinarSuggestion.join(", ")}]`);
  assert.ok(r.refinarSuggestion.some((a) => a.toLowerCase() === "senior"), "expected 'senior' to still be suggested");
  assert.strictEqual(r.refinar.length, 0, "refinar is never auto-filled, only suggested");
});

test("a real 'líder' seniority signal is still detected when not describing the company", () => {
  const r = Extractor.analyzeJD("Se busca Analista Contable con experiencia como líder de equipo para empresa de retail en Lima.");
  assert.ok(r.refinarSuggestion.some((a) => a.toLowerCase() === "líder"), `expected "líder" in refinarSuggestion, got [${r.refinarSuggestion.join(", ")}]`);
});

test("a real seniority signal outside the title is still detected", () => {
  const r = Extractor.analyzeJD("Buscamos Community Manager senior con 5 años de experiencia para turismo.");
  assert.ok(r.refinarSuggestion.some((a) => a.toLowerCase() === "senior"), "expected 'senior' in refinarSuggestion when it appears outside the title");
});

test("alcance only ever holds país + localidad — never modalidad or seniority", () => {
  const r = Extractor.analyzeJD("Buscamos Backend Developer Senior, Python, modalidad remota, para banco en Rosario, Argentina. 5+ años de experiencia.");
  assert.deepStrictEqual(r.alcance.sort(), ["Argentina", "Rosario"].sort());
  assert.ok(r.refinarSuggestion.includes("senior"));
  assert.ok(r.refinarSuggestion.includes("remoto"));
});

test("locality is captured alongside country when the JD names a specific place", () => {
  const r = Extractor.analyzeJD("Puesto híbrido en Palma, con posibilidad de residir en Mallorca, España.");
  assert.strictEqual(r.country, "España");
  assert.ok(r.alcance.includes("España"));
  assert.ok(r.alcance.some((a) => a === "Palma" || a === "Mallorca"), `expected a specific locality, got [${r.alcance.join(", ")}]`);
});

test("manual short query with no explicit title splits skills/location correctly, doesn't fabricate a role", () => {
  const r = Extractor.analyzeJD("busco java con spring que sepa cloud y viva en brasil");
  assert.deepStrictEqual(r.rol, [], "no explicit job title was given — rol must stay empty, not 'busco java'");
  assert.ok(r.atributos.includes("Java"));
  assert.ok(r.atributos.includes("Spring"));
  assert.deepStrictEqual(r.alcance, ["Brasil"]);
});

test("manual short query WITH an explicit title extracts role, skills and location separately", () => {
  const r = Extractor.analyzeJD("busco un Backend Developer con Java y Spring que viva en Brasil");
  assert.strictEqual(r.rol[0], "Backend Developer");
  assert.ok(r.atributos.includes("Java"));
  assert.ok(r.atributos.includes("Spring"));
  assert.deepStrictEqual(r.alcance, ["Brasil"]);
});

test("SRE and SAP FICO are accepted as role titles even though they're also listed as skills", () => {
  const r1 = Extractor.analyzeJD("busco SRE con Kubernetes en Chile");
  assert.strictEqual(r1.rol[0], "SRE");
  const r2 = Extractor.analyzeJD("sap fico en brasil");
  assert.strictEqual(r2.rol[0], "sap fico");
});

test("title-shaped phrase at the very start of a JD with no line breaks or verb is still found", () => {
  // Simulates exactly what pdf.js hands us for a modern JD template: every
  // text run on the page joined by a single space, no real "\n" anywhere.
  const flattened =
    "Sr. Backend Developer  Ardua Solutions · Tecnología  Reporta a: Santiago Ahmed  Híbrido — Puerto Madero, CABA — Full Time  Sobre la Empresa  Somos una fintech...";
  const r = Extractor.guessRol(flattened);
  assert.strictEqual(r[0], "Sr. Backend Developer");
});

test("title-shaped phrase at doc start works in English too", () => {
  const flattened = "Backend Engineer  CoolStartup Inc · Engineering  Remote — Full Time  About the company  We build...";
  const r = Extractor.guessRol(flattened);
  assert.strictEqual(r[0], "Backend Engineer");
});

test("CABA and CDMX stay fully upper-case as localities, not title-cased", () => {
  const r1 = Extractor.analyzeJD("Puesto híbrido en CABA, Argentina.");
  assert.ok(r1.alcance.includes("CABA"), `expected "CABA", got [${r1.alcance.join(", ")}]`);

  const r2 = Extractor.analyzeJD("Vacante en CDMX, México.");
  assert.ok(r2.alcance.includes("CDMX"), `expected "CDMX", got [${r2.alcance.join(", ")}]`);
});

test("generic methodology terms (Scrum, Kanban, Agile) rank behind specific technical/cert terms", () => {
  const r = Extractor.analyzeJD(
    "Buscamos PM con Scrum, Kanban, PMP, ISO 27001, NIST, GDPR, NIS2, CISM, CISSP, AWS, Azure, GCP, Zero Trust, SIEM."
  );
  const genericIdx = r.atributos.findIndex((a) => a.toLowerCase() === "scrum");
  const specificIdx = r.atributos.findIndex((a) => a.toLowerCase() === "iso 27001");
  assert.ok(specificIdx !== -1, "ISO 27001 should survive the cap");
  if (genericIdx !== -1) {
    assert.ok(specificIdx < genericIdx, "specific technical terms should rank ahead of generic ones like Scrum");
  }
});

// ---------------------------------------------------------------
// 6. Role synonyms
// ---------------------------------------------------------------

test("getSynonyms returns suggestions for a known role word inside a phrase", () => {
  const syns = Keywords.getSynonyms("Desarrollador Backend Senior");
  assert.ok(syns.includes("developer"), `expected "developer" in synonyms, got [${syns.join(", ")}]`);
});

test("getSynonyms returns [] when nothing matches", () => {
  const syns = Keywords.getSynonyms("Astronauta Jefe de Cohetes");
  assert.deepStrictEqual(syns, []);
});

test("getSynonyms does not match a role word as a substring of another word", () => {
  // "pm" appears as a synonym key context test: "reclutador" should not match unrelated word "reclutadora-lite" style substrings
  const syns = Keywords.getSynonyms("Reclutadora Senior"); // "reclutadora" != whole word "reclutador"
  assert.deepStrictEqual(syns, []);
});

// ---------------------------------------------------------------
// 7. Resumes (loose CV files) query mode
// ---------------------------------------------------------------

test("buildResumesQuery restricts to PDF/Word and CV title words, no site: restriction", () => {
  const state = { rol: ["Analista de Datos"], atributos: ["Power BI"], dominio: [], alcance: ["Argentina"], refinar: [] };
  const q = Generator.buildResumesQuery(state);
  assert.ok(q.includes("filetype:pdf"));
  assert.ok(q.includes("intitle:cv"));
  assert.ok(!q.includes("site:"));
  assert.ok(q.includes('"Analista de Datos"'));
});

test("buildResumesQuery applies exclusions with minus operator", () => {
  const state = { rol: ["QA"], atributos: [], dominio: [], alcance: [], refinar: ["junior"] };
  const q = Generator.buildResumesQuery(state);
  assert.ok(q.includes("-junior"));
});

// ---------------------------------------------------------------
// Report
// ---------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)\n`);
if (failed) {
  failures.forEach((f) => {
    console.log(`FAIL: ${f.name}`);
    console.log(`  ${f.err.message}\n`);
  });
  process.exit(1);
} else {
  console.log("All tests passed.");
  process.exit(0);
}
