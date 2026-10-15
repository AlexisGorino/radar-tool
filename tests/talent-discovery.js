const assert = require("node:assert/strict");
const Discovery = require("../js/talent-discovery.js");
const Generator = require("../js/generator.js");
const Countries = require("../js/countries.js");

let passed = 0;
function test(name, run) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

const canaryState = {
  rol: ["Técnico instalador de telecomunicaciones"],
  imprescindibles: ["FTTH", "OTDR"],
  atributos: ["fibra óptica"],
  deseables: ["Excel"],
  dominio: ["telecomunicaciones"],
  alcance: ["España", "Islas Canarias"],
  refinar: ["Senior"],
};

test("builds source-specific queries and preserves the exact Canary Islands scope", () => {
  const plan = Discovery.buildPlan(canaryState, ["linkedin", "stackoverflow", "github", "behance", "resumes"], Generator);
  assert.equal(plan.queries.length, 1);
  assert.deepEqual(plan.queries.map((query) => query.source), ["linkedin"]);
  assert.deepEqual(plan.skippedSources, ["github"]);
  assert.equal(plan.skippedReasons.github, "requires_language_signal");
  assert.equal(plan.maxResults, 20);
  assert.equal(plan.location, "España, Islas Canarias");
  assert.match(plan.queries[0].query, /Canarias/i);
  assert.doesNotMatch(plan.queries[0].query, /\bEspaña\b/);
  assert.match(plan.queries[0].query, /-Senior/);
});

test("uses first-party GitHub user search qualifiers instead of public-web X-Ray", () => {
  const state = {
    rol: ["Backend Developer"], imprescindibles: [], atributos: ["Python", "AWS"], deseables: [], dominio: [],
    alcance: ["Argentina", "Buenos Aires"], refinar: [], seniority: [],
  };
  const plan = Discovery.buildPlan(state, ["github"], Generator);
  assert.deepEqual(plan.queries.map((entry) => entry.source), ["github"]);
  assert.equal(plan.queries[0].query, 'type:user language:Python location:"Buenos Aires"');
  assert.deepEqual(plan.queries[0].profileEvidence.alternatives, ["Python", "AWS"]);
  assert.equal(plan.location, "Argentina, Buenos Aires");
  const roleOnly = Discovery.buildPlan({ ...state, rol: ["Python developer"], imprescindibles: [], atributos: [], deseables: [] }, ["github"], Generator);
  assert.equal(roleOnly.queries[0].query, 'type:user language:Python location:"Buenos Aires"');
});

test("keeps GitHub out of searches without a verifiable programming language", () => {
  const state = {
    rol: ["Técnico de telecomunicaciones"], imprescindibles: ["FTTH", "OTDR"], atributos: ["Excel"], deseables: [],
    dominio: ["telecomunicaciones"], alcance: ["España", "Islas Canarias"], refinar: [],
  };
  const plan = Discovery.buildPlan(state, ["linkedin", "github"], Generator);
  assert.deepEqual(plan.queries.map((entry) => entry.source), ["linkedin"]);
  assert.deepEqual(plan.skippedSources, ["github"]);
  assert.equal(plan.skippedReasons.github, "requires_language_signal");
});

test("does not silently send oversized plans; exposes sources that need a shorter query", () => {
  const crowded = {
    rol: ["QA"], imprescindibles: [], atributos: ["Python"], deseables: [], dominio: [], alcance: ["Argentina"],
    refinar: Array.from({ length: 20 }, (_, index) => `exclusion-${index}-${"x".repeat(80)}`),
  };
  const plan = Discovery.buildPlan(crowded, ["linkedin"], Generator);
  assert.equal(plan.queries.length, 0);
  assert.deepEqual(plan.skippedSources, ["linkedin"]);
});

test("widens junior project-management titles without dropping specific locality or job signals", () => {
  const state = {
    rol: ["Jefe de Proyecto"], imprescindibles: [], atributos: ["MS Project", "PMBOK"],
    deseables: ["PRINCE2"], dominio: ["telecomunicaciones"], alcance: ["España", "Santiago de Compostela"], refinar: [], seniority: ["junior"],
  };
  const plan = Discovery.buildPlan(state, ["linkedin"], Generator);
  const query = plan.queries[0].query;
  ["Jefe de Proyecto", "Junior Project Manager", "Santiago de Compostela", "MS Project", "telecomunicaciones"].forEach((term) => {
    assert.ok(query.toLowerCase().includes(term.toLowerCase()), `query missing ${term}: ${query}`);
  });
  assert.doesNotMatch(query, /PRINCE2|Coordinador de Proyectos/);
  assert.ok(query.length <= 900, `query exceeds provider limit (${query.length})`);
  assert.doesNotMatch(query, /NOT junior|-junior/i, "experience level is search context, not an exclusion");
  const evidence = Discovery.termEvidence("Project Manager junior · telecomunicaciones · Santiago de Compostela", state);
  assert.ok(evidence.roleHits.includes("Project Manager"), "a translated title counts as role evidence");
});

test("normalizes inclusive Spanish job titles before expanding the public search", () => {
  const state = {
    rol: ["un/a Jefe/a de Proyecto"], imprescindibles: [], atributos: ["coordinación de tareas", "seguimiento de cronograma"],
    deseables: ["Excel"], dominio: ["telecomunicaciones"], alcance: ["España", "Santiago de Compostela"], refinar: [], seniority: ["junior"],
  };
  const titles = Discovery.expandRoleFamily(state.rol, state.seniority);
  assert.ok(titles.includes("Jefe de Proyecto"));
  assert.ok(titles.includes("Junior Project Manager"));
  assert.ok(titles.includes("Coordinador de Proyectos Junior"));
  assert.ok(titles.every((title) => !/un\/a|jefe\/a/i.test(title)));
  const plan = Discovery.buildPlan(state, ["linkedin"], Generator);
  const query = plan.queries[0].query;
  assert.match(query, /Jefe de Proyecto/i);
  assert.match(query, /Project Manager/i);
  assert.match(query, /Santiago/i);
  assert.doesNotMatch(query, /un\/a Jefe\/a/);
});

test("expands QA titles to common automation variants without weakening the requested skill or city", () => {
  const state = {
    rol: ["QA Engineer"], imprescindibles: [], atributos: ["Playwright"], deseables: [], dominio: [],
    alcance: ["España", "Barcelona"], refinar: [], seniority: [],
  };
  const titles = Discovery.expandRoleFamily(state.rol, state.seniority);
  ["QA Automation Engineer", "Automation QA Engineer", "Test Automation Engineer", "Software Test Engineer", "Quality Assurance Engineer"]
    .forEach((title) => assert.ok(titles.includes(title), `missing title variant: ${title}`));
  const query = Discovery.buildPlan(state, ["linkedin"], Generator).queries[0].query;
  assert.match(query, /QA Automation Engineer/i);
  assert.doesNotMatch(query, /Software Test Engineer/i);
  assert.ok(query.length < 180, `LinkedIn query should stay compact (${query.length}): ${query}`);
  assert.match(query, /Playwright/i);
  assert.match(query, /Barcelona/i);
  assert.ok(query.length <= 900);
  assert.equal(Discovery.geographyEvidence("QA Automation Engineer · Playwright · Barcelona, Spain", state).confirmed, true);
});

test("builds a short LinkedIn X-Ray query around the strongest skill instead of every extracted synonym", () => {
  const state = {
    rol: ["Senior QA Engineer"], imprescindibles: [], atributos: ["Playwright", "TypeScript"],
    deseables: [], dominio: [], alcance: ["España", "Barcelona"], refinar: [], seniority: ["senior"],
  };
  const query = Discovery.buildPlan(state, ["linkedin"], Generator).queries[0].query;
  assert.equal(query, 'site:linkedin.com/in ("Senior QA Engineer" OR "QA Engineer") (Playwright OR TypeScript) Barcelona');
  assert.ok(query.length < 140);
  assert.doesNotMatch(query, /Software Test|Automation QA/);
  const noTitle = Discovery.buildPlan(state, ["linkedin"], Generator, { strategy: "equivalent" }).queries[0].query;
  assert.match(noTitle, /Playwright/);
  assert.match(noTitle, /Barcelona/);
  assert.doesNotMatch(noTitle, /QA Engineer/);
});

test("offers controlled no-title and no-sector recovery routes that retain hard criteria", () => {
  const state = {
    rol: ["Jefe de Proyecto"], imprescindibles: ["MS Project"], atributos: ["Jira", "PMBOK"],
    deseables: ["PRINCE2"], dominio: ["telecomunicaciones"], alcance: ["España", "Santiago de Compostela"], refinar: ["Senior"],
  };
  const sources = ["linkedin"];
  const precise = Discovery.buildPlan(state, sources, Generator).queries[0].query;
  const equivalent = Discovery.buildPlan(state, sources, Generator, { strategy: "equivalent" }).queries[0].query;
  const market = Discovery.buildPlan(state, sources, Generator, { strategy: "market" }).queries[0].query;
  assert.match(precise, /Jefe de Proyecto/i);
  assert.doesNotMatch(equivalent, /Jefe de Proyecto|Project Manager/i);
  assert.match(equivalent, /Santiago de Compostela/i);
  assert.match(equivalent, /MS Project/i);
  assert.match(equivalent, /telecomunicaciones/i);
  assert.doesNotMatch(market, /Jefe de Proyecto|telecomunicaciones/i);
  assert.match(market, /Santiago de Compostela/i);
  assert.match(market, /MS Project/i);
  assert.match(market, /-Senior/i);
});

test("preserves every configured country and locality in the public-search query plan", () => {
  const profile = { rol: ["Analista"], imprescindibles: [], atributos: ["atención al cliente"], deseables: [], dominio: [], refinar: [] };
  const normalize = (text) => String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let placesChecked = 0;
  Object.entries(Countries.ALL_COUNTRIES).forEach(([country, terms]) => {
    const countryNames = new Set((Countries.BARE_COUNTRY_NAMES[country] || [country]).map(normalize));
    const localities = terms.filter((term) => !countryNames.has(normalize(term)));
    localities.forEach((locality) => {
      const plan = Discovery.buildPlan({ ...profile, alcance: [country, locality] }, ["linkedin"], Generator);
      assert.equal(plan.location, `${country}, ${locality}`);
      const query = normalize(plan.queries[0].query);
      assert.ok(query.includes(normalize(locality)), `missing ${locality}, ${country}: ${plan.queries[0].query}`);
      if (!normalize(locality).includes(normalize(country))) {
        assert.ok(!query.includes(normalize(country)), `country widened the specific locality ${locality}, ${country}: ${plan.queries[0].query}`);
      }
      placesChecked += 1;
    });
  });
  assert.ok(placesChecked > 200, `expected broad geography coverage, checked ${placesChecked}`);
  console.log(`  ↳ validated ${placesChecked} configured localities`);
});

test("validates only HTTPS person-profile URL patterns for each selected source", () => {
  assert.equal(Discovery.validateProfileUrl("https://www.linkedin.com/in/ana-garcia/?trk=abc#top", "linkedin"), "https://www.linkedin.com/in/ana-garcia");
  assert.equal(Discovery.validateProfileUrl("http://linkedin.com/in/ana", "linkedin"), null);
  assert.equal(Discovery.validateProfileUrl("https://linkedin.com/jobs/view/123", "linkedin"), null);
  assert.equal(Discovery.validateProfileUrl("https://stackoverflow.com/users/42/ana", "stackoverflow"), "https://stackoverflow.com/users/42/ana");
  assert.equal(Discovery.validateProfileUrl("https://stackoverflow.com/questions/42/example", "stackoverflow"), null);
  assert.equal(Discovery.validateProfileUrl("https://github.com/ana", "github"), "https://github.com/ana");
  assert.equal(Discovery.validateProfileUrl("https://attacker.example/linkedin.com/in/ana", "linkedin"), null);
});

test("extracts a name only when the result title separates a plausible name from its source", () => {
  assert.equal(Discovery.parseDisplayName("Ana García - Telecom Technician - LinkedIn", "linkedin"), "Ana García");
  assert.equal(Discovery.parseDisplayName("Cecilio José Bolaños Lorenzo - Técnico Instalador y telecomunicaciones", "linkedin"), "Cecilio José Bolaños Lorenzo");
  assert.equal(Discovery.parseDisplayName("José Alexandre Gama da Silva - NOC TELECOM Especialist", "linkedin"), "José Alexandre Gama da Silva");
  assert.equal(Discovery.parseDisplayName("Diego Capello - Network Engineer", "linkedin"), "Diego Capello");
  assert.equal(Discovery.parseDisplayName("Backend Developer | LinkedIn", "linkedin"), "");
  assert.equal(Discovery.parseDisplayName("Técnico de Telecomunicaciones - LinkedIn", "linkedin"), "");
  assert.equal(Discovery.parseDisplayName("Network Engineer | NOC - LinkedIn", "linkedin"), "");
  assert.equal(Discovery.parseDisplayName("Ana García - Portfolio", "linkedin"), "");
});

test("flags a LinkedIn title whose readable profile slug does not support the suggested name", () => {
  const mismatched = Discovery.profileIdentityEvidence("Lucia Sanchez", "https://linkedin.com/in/ramon-garcia", "linkedin");
  assert.equal(mismatched.identityAlignment, "mismatch");
  assert.match(mismatched.identityStatus, /revisar/);
  const compatible = Discovery.profileIdentityEvidence("Maria Villar Romero", "https://linkedin.com/in/mariavillar-qa", "linkedin");
  assert.equal(compatible.identityAlignment, "compatible");
  const opaque = Discovery.profileIdentityEvidence("Maria Villar Romero", "https://linkedin.com/in/ACoAAIdx987", "linkedin");
  assert.equal(opaque.identityAlignment, "unknown", "opaque LinkedIn slugs remain reviewable instead of being discarded");
});

test("scores exact locality evidence separately from country-only evidence", () => {
  const countryOnly = Discovery.termEvidence("Telecom technician · España · FTTH · OTDR", canaryState);
  const exactLocality = Discovery.termEvidence("Telecom technician · Islas Canarias · FTTH · OTDR", canaryState);
  assert.match(countryOnly.locationStatus, /Ubicación sin confirmar/);
  assert.equal(countryOnly.specificLocationHit, false);
  assert.match(exactLocality.locationStatus, /país.*residencia por confirmar/);
  assert.equal(exactLocality.specificLocationHit, true);
  assert.equal(countryOnly.locationConfirmed, false);
  assert.equal(exactLocality.locationConfirmed, false, "a locality without its country does not pass");
  assert.equal(exactLocality.localityVisible, true, "an exact locality can be shown separately for recruiter review");
  const exactPlaceAndCountry = Discovery.termEvidence("Telecom technician · Islas Canarias · España · FTTH · OTDR", canaryState);
  assert.equal(exactPlaceAndCountry.locationConfirmed, true);
  assert.ok(exactPlaceAndCountry.score > countryOnly.score);

  const argentinaCode = Discovery.geographyEvidence("Backend developer · Buenos Aires, AR", {
    alcance: ["Argentina", "Buenos Aires"],
  });
  assert.equal(argentinaCode.confirmed, true, "common ISO country codes should confirm the requested country");
  const wrongCountryCode = Discovery.geographyEvidence("Backend developer · Buenos Aires, BR", {
    alcance: ["Argentina", "Buenos Aires"],
  });
  assert.equal(wrongCountryCode.confirmed, false, "a different ISO country code must not pass the locality filter");
  const countryOnlyCode = Discovery.geographyEvidence("Backend developer · AR", {
    alcance: ["Argentina", "Buenos Aires"],
  });
  assert.equal(countryOnlyCode.confirmed, false, "a country code alone must not satisfy the locality requirement");
  assert.equal(Discovery.geographyEvidence("QA Engineer · Open to Barcelona", { alcance: ["España", "Barcelona"] }).localityVisible, false,
    "interest in a location must not be presented as residence evidence");
});

test("keeps exact-city LinkedIn leads visible for review without treating them as country-verified", () => {
  const state = {
    rol: ["QA Engineer"], imprescindibles: [], atributos: ["Playwright", "TypeScript"],
    deseables: [], dominio: [], alcance: ["España", "Barcelona"], refinar: [], seniority: [],
  };
  const rows = Discovery.normalizeResults({ results: [
    { source: "linkedin", url: "https://linkedin.com/in/barcelona-qa", title: "Lucia Sanchez - QA Automation Engineer", snippet: "Playwright · TypeScript · Barcelona" },
    { source: "linkedin", url: "https://linkedin.com/in/open-to-barcelona", title: "Kseniya Cherasheva - Senior QA Engineer", snippet: "Playwright · Open to Barcelona" },
    { source: "linkedin", url: "https://linkedin.com/in/spain-only", title: "Aida Alvarez - QA Engineer", snippet: "Playwright · España" },
    { source: "linkedin", url: "https://linkedin.com/in/verified-barcelona", title: "Maria Villar Romero - QA Engineer", snippet: "Playwright · Barcelona, Cataluña, España" },
  ] }, state);
  assert.deepEqual(rows.map((row) => row.url), [
    "https://linkedin.com/in/verified-barcelona",
    "https://linkedin.com/in/barcelona-qa",
  ]);
  assert.equal(rows[0].locationConfirmed, true);
  assert.equal(rows[1].locationConfirmed, false);
  assert.equal(rows[1].locationStatus, "Localidad mencionada; país y residencia por confirmar");
  assert.equal(rows[1].identityAlignment, "unknown", "a custom slug without readable name evidence remains explicitly unverified");
});

test("rejects public profiles that do not show all mandatory signals", () => {
  const state = {
    rol: ["QA Engineer"], imprescindibles: ["Playwright"], atributos: [],
    deseables: [], dominio: [], alcance: ["España", "Barcelona"], refinar: [], seniority: [],
  };
  const rows = Discovery.normalizeResults({ results: [
    { source: "linkedin", url: "https://linkedin.com/in/only-role", title: "Ana Garcia - QA Engineer", snippet: "Barcelona, España · Cypress" },
    { source: "linkedin", url: "https://linkedin.com/in/complete-evidence", title: "Sofia Torres - QA Automation Engineer", snippet: "Playwright · Barcelona, España" },
  ] }, state);
  assert.deepEqual(rows.map((row) => row.url), ["https://linkedin.com/in/complete-evidence"]);
});

test("keeps exact-city role matches when snippets omit non-mandatory alternative skills", () => {
  const state = {
    rol: ["Senior QA Engineer"], imprescindibles: [], atributos: ["Postman", "SoapUI", "SQL"],
    deseables: ["Playwright", "TypeScript"], dominio: ["fintech", "banca"],
    alcance: ["España", "Barcelona"], refinar: [], seniority: ["senior"],
  };
  const plan = Discovery.buildPlan(state, ["linkedin"], Generator);
  assert.equal(plan.location, "España, Barcelona");
  assert.match(plan.queries[0].query, /Barcelona/);
  assert.doesNotMatch(plan.queries[0].query, /Madrid/);
  const rows = Discovery.normalizeResults({ results: [
    { source: "linkedin", url: "https://linkedin.com/in/only-role", title: "Ana Garcia - Senior QA Engineer", snippet: "Barcelona, Cataluña, España · Fintech" },
    { source: "linkedin", url: "https://linkedin.com/in/matching-alternative", title: "Eva Perez - Senior QA Engineer", snippet: "Postman · Barcelona, España · Fintech" },
    { source: "linkedin", url: "https://linkedin.com/in/wrong-city", title: "Luis Perez - Senior QA Engineer", snippet: "Postman · Madrid, España · Fintech" },
  ] }, state);
  assert.deepEqual(rows.map((row) => row.url), [
    "https://linkedin.com/in/matching-alternative",
    "https://linkedin.com/in/only-role",
  ]);
  assert.equal(rows[1].locationConfirmed, true);
  assert.equal(rows[1].score, 55, "unseen support skills lower the evidence score without being treated as absent");
  assert.ok(rows[1].scoreBreakdown.includes("Señales de apoyo visibles 0/3"));
});

test("requires locality and country evidence, deduplicates profiles and caps the shortlist at 20", () => {
  const results = Array.from({ length: 55 }, (_, index) => ({
    source: "linkedin",
    url: `https://linkedin.com/in/profile-${index}${index === 1 ? "?trk=duplicate" : ""}`,
    title: `Ana Persona ${index} - Telecom Technician - LinkedIn`,
    snippet: "FTTH OTDR Islas Canarias España",
    position: index + 1,
  }));
  results[54] = { source: "linkedin", url: "https://linkedin.com/jobs/view/123", title: "Oferta - LinkedIn", snippet: "FTTH Islas Canarias España" };
  results.push({ ...results[1], url: "https://linkedin.com/in/profile-1#about" });
  results.push({ source: "linkedin", url: "https://linkedin.com/in/country-only", title: "Paula Pérez - Telecom - LinkedIn", snippet: "FTTH España" });
  results.push({ source: "stackoverflow", url: "https://stackoverflow.com/users/42/ana", title: "Ana Persona - Telecom", snippet: "FTTH Islas Canarias España" });
  const normalized = Discovery.normalizeResults({ results }, canaryState);
  assert.equal(normalized.length, 20);
  assert.equal(new Set(normalized.map((row) => row.url)).size, 20);
  assert.ok(normalized.every((row) => !row.url.includes("/jobs/")));
  assert.ok(normalized.every((row) => ["linkedin", "github"].includes(row.source)));

  const spainSantiago = Discovery.normalizeResults({ results: [
    { source: "linkedin", url: "https://linkedin.com/in/santiago-compostela", title: "Ana Pérez - Telecom Technician - LinkedIn", snippet: "FTTH · Santiago de Compostela, España" },
  ] }, { rol: ["Telecom Technician"], imprescindibles: ["FTTH"], atributos: [], dominio: [], alcance: ["España", "Santiago de Compostela"] });
  assert.deepEqual(spainSantiago.map((row) => row.url), ["https://linkedin.com/in/santiago-compostela"]);
  const argentinaAbbreviation = Discovery.normalizeResults({ results: [
    { source: "github", url: "https://github.com/biancarosa", title: "Bianca Rosa - GitHub", snippet: "Buenos Aires, AR · Lenguaje de repositorios: Python" },
  ] }, { rol: [], imprescindibles: [], atributos: ["Python"], alcance: ["Argentina", "Buenos Aires"] });
  assert.deepEqual(argentinaAbbreviation.map((row) => row.url), ["https://github.com/biancarosa"], "a public GitHub location with the correct ISO country code should survive normalization");
  assert.equal(Discovery.locationScopeError({ alcance: ["Santiago"] }).includes("país"), true);
  assert.equal(Discovery.locationScopeError({ alcance: ["Chile", "Santiago"] }).includes("Chile"), true);
});

test("search omits credentials, does not send the JD, and reports provider errors clearly", async () => {
  const payload = { queries: [{ source: "linkedin", query: "site:linkedin.com/in engineer Argentina" }], maxResults: 20, location: "Argentina" };
  let request;
  const found = await Discovery.search("https://radar.example/api/search", payload, canaryState, async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({
      results: [],
      locationContext: { mode: "provider_location", canonicalName: "Canary Islands,Spain", countryCode: "ES" },
      sourceDiagnostics: [{ source: "linkedin", status: "no_indexed_results", organicCount: 0, profileCount: 0, code: null, engines: ["Google", "Brave", "Unknown"], providerErrors: [{ provider: "Brave", code: "provider_rate_limited" }, { provider: "Untrusted", code: "secret" }] }],
    }) };
  });
  assert.equal(found.results.length, 0);
  assert.deepEqual(found.locationContext, { mode: "provider_location", canonicalName: "Canary Islands,Spain", countryCode: "ES" });
  assert.deepEqual(found.sourceDiagnostics[0].engines, ["Google", "Brave"]);
  assert.deepEqual(found.sourceDiagnostics[0].providerErrors, [{ provider: "Brave", code: "provider_rate_limited" }]);
  assert.equal(request.url, "https://radar.example/api/search");
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.cache, "no-store");
  assert.doesNotMatch(request.options.body, /api_key|job description|full JD/i);
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 429, json: async () => ({ error: "rate_limited" }) })),
    /límite temporal/
  );
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 429, json: async () => ({ error: "hourly_quota_exhausted" }) })),
    /cupo horario/
  );
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 429, json: async () => ({ error: "provider_rate_limited" }) })),
    /buscador alcanzó su límite temporal/
  );
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 502, json: async () => ({ error: "sources_unavailable", sourceErrors: [{ source: "linkedin", code: "provider_credentials_rejected" }] }) })),
    /credencial configurada/
  );
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 502, json: async () => ({ error: "sources_unavailable", sourceErrors: [{ source: "linkedin", code: "provider_request_rejected" }] }) })),
    /Revisá la ubicación o los términos/
  );
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 502, json: async () => ({ error: "sources_unavailable", sourceErrors: [{ source: "linkedin", code: "provider_location_rejected" }] }) })),
    /no reconoció la ubicación/
  );
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 502, json: async () => ({ error: "sources_unavailable", sourceErrors: [{ source: "linkedin", code: "provider_query_rejected" }] }) })),
    /rechazó el formato de búsqueda/
  );
  let providerError;
  try {
    await Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({
      ok: false,
      status: 502,
      json: async () => ({
        error: "sources_unavailable",
        sourceErrors: [{ source: "linkedin", code: "provider_timeout" }],
        sourceDiagnostics: [{ source: "linkedin", status: "error", organicCount: 0, profileCount: 0, code: "provider_timeout" }],
      }),
    }));
  } catch (error) {
    providerError = error;
  }
  assert.match(providerError.message, /tardó demasiado en responder/);
  assert.equal(providerError.sourceDiagnostics[0].source, "linkedin");
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 502, json: async () => ({ error: "sources_unavailable", sourceErrors: [{ source: "linkedin", code: "provider_network_error" }] }) })),
    /no pudo conectarse/
  );
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => { throw new TypeError("Failed to fetch"); }),
    /No se pudo conectar con el servicio/
  );
});

console.log(`\n${passed} talent-discovery tests passed.`);
