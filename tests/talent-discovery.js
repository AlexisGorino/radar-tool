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
  assert.equal(plan.queries.length, 4);
  assert.deepEqual(plan.queries.map((query) => query.source), ["linkedin", "stackoverflow", "github", "behance"]);
  assert.equal(plan.maxResults, 50);
  assert.equal(plan.location, "España, Islas Canarias");
  plan.queries.forEach(({ query }) => {
    assert.match(query, /Canarias/i);
    assert.doesNotMatch(query, /\bEspaña\b/);
    assert.match(query, /-Senior/);
  });
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
  assert.equal(Discovery.parseDisplayName("Backend Developer | LinkedIn", "linkedin"), "");
  assert.equal(Discovery.parseDisplayName("Ana García - Portfolio", "linkedin"), "");
});

test("scores exact locality evidence separately from country-only evidence", () => {
  const countryOnly = Discovery.termEvidence("Telecom technician · España · FTTH · OTDR", canaryState);
  const exactLocality = Discovery.termEvidence("Telecom technician · Islas Canarias · FTTH · OTDR", canaryState);
  assert.equal(countryOnly.locationStatus, "País o región visible; localidad sin confirmar");
  assert.equal(countryOnly.specificLocationHit, false);
  assert.equal(exactLocality.locationStatus, "Localidad visible");
  assert.equal(exactLocality.specificLocationHit, true);
  assert.ok(exactLocality.score > countryOnly.score);
});

test("deduplicates canonical profile links, drops job/company pages and caps the shortlist at 50", () => {
  const results = Array.from({ length: 55 }, (_, index) => ({
    source: "linkedin",
    url: `https://linkedin.com/in/profile-${index}${index === 1 ? "?trk=duplicate" : ""}`,
    title: `Ana Persona ${index} - Telecom Technician - LinkedIn`,
    snippet: "FTTH OTDR Islas Canarias",
    position: index + 1,
  }));
  results[54] = { source: "linkedin", url: "https://linkedin.com/jobs/view/123", title: "Oferta - LinkedIn", snippet: "FTTH" };
  results.push({ ...results[1], url: "https://linkedin.com/in/profile-1#about" });
  const normalized = Discovery.normalizeResults({ results }, canaryState);
  assert.equal(normalized.length, 50);
  assert.equal(new Set(normalized.map((row) => row.url)).size, 50);
  assert.ok(normalized.every((row) => !row.url.includes("/jobs/")));
});

test("search omits credentials, does not send the JD, and reports provider errors clearly", async () => {
  const payload = { queries: [{ source: "linkedin", query: "site:linkedin.com/in engineer Argentina" }], maxResults: 50, location: "Argentina" };
  let request;
  const found = await Discovery.search("https://radar.example/api/search", payload, canaryState, async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  });
  assert.equal(found.results.length, 0);
  assert.equal(request.url, "https://radar.example/api/search");
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.cache, "no-store");
  assert.doesNotMatch(request.options.body, /api_key|job description|full JD/i);
  await assert.rejects(
    Discovery.search("https://radar.example/api/search", payload, canaryState, async () => ({ ok: false, status: 429, json: async () => ({ error: "rate_limited" }) })),
    /límite temporal/
  );
});

console.log(`\n${passed} talent-discovery tests passed.`);
