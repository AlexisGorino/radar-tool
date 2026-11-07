const assert = require("node:assert/strict");
const Discovery = require("../js/talent-discovery.js");
const Generator = require("../js/generator.js");

const cases = [
  { name: "recruiting", role: "Recruiter IT", required: "LinkedIn Recruiter", alternatives: ["selección tech", "sourcing"], domain: "talent acquisition", country: "Argentina", city: "Buenos Aires" },
  { name: "nursing", role: "Enfermero de terapia intensiva", required: "cuidados intensivos", alternatives: ["paciente crítico", "UCI"], domain: "salud", country: "España", city: "Madrid" },
  { name: "sales", role: "Ejecutivo de cuentas B2B", required: "Salesforce", alternatives: ["venta consultiva", "SaaS"], domain: "software", country: "Argentina", city: "Córdoba" },
  { name: "sap", role: "Consultor SAP", required: "SAP FI", alternatives: ["S/4HANA", "FICO"], domain: "finanzas", country: "México", city: "Ciudad de México" },
  { name: "design", role: "UX Researcher", required: "usability testing", alternatives: ["Figma", "entrevistas de usuario"], domain: "producto digital", country: "España", city: "Barcelona" },
  { name: "payroll", role: "Analista de nómina", required: "Workday", alternatives: ["payroll", "Excel"], domain: "recursos humanos", country: "Argentina", city: "Rosario" },
];

let expectedRelevant = 0;
let retrievedRelevant = 0;
let falsePositives = 0;

for (const item of cases) {
  const state = {
    rol: [item.role], seniority: [], imprescindibles: [item.required], atributos: item.alternatives,
    deseables: [], dominio: [item.domain], alcance: [item.country, item.city], refinar: [],
  };
  const plan = Discovery.buildPlan(state, ["linkedin"], Generator);
  assert.ok(plan.queries.length > 0, `${item.name}: should generate a LinkedIn query`);
  assert.ok(plan.queries.length <= 3, `${item.name}: must respect the three-query route limit`);
  assert.ok(plan.queries[0].query.includes(item.city), `${item.name}: first query must retain the requested city`);
  assert.ok(plan.queries[0].query.includes(item.country), `${item.name}: first query must retain the requested country`);

  const expectedUrl = `https://linkedin.com/in/benchmark-${item.name}`;
  const results = [
    { source: "linkedin", url: expectedUrl, title: `Alex Candidate - ${item.role}`, snippet: `${item.required} · ${item.alternatives.join(" · ")} · ${item.domain} · ${item.city}, ${item.country}` },
    { source: "linkedin", url: `https://linkedin.com/in/wrong-city-${item.name}`, title: `Sam Candidate - ${item.role}`, snippet: `${item.required} · ${item.alternatives.join(" · ")} · ${item.domain} · Otra ciudad, ${item.country}` },
    { source: "linkedin", url: `https://linkedin.com/in/missing-required-${item.name}`, title: `Taylor Candidate - ${item.role}`, snippet: `${item.alternatives.join(" · ")} · ${item.domain} · ${item.city}, ${item.country}` },
  ];
  const shortlist = Discovery.normalizeResults({ results }, state);
  const actualUrls = shortlist.map((candidate) => candidate.url);
  expectedRelevant += 1;
  if (actualUrls.includes(expectedUrl)) retrievedRelevant += 1;
  falsePositives += actualUrls.filter((url) => url !== expectedUrl).length;
  assert.deepEqual(actualUrls, [expectedUrl], `${item.name}: keep the evidence-complete exact-location profile only`);
}

const precision = retrievedRelevant / (retrievedRelevant + falsePositives);
const recall = retrievedRelevant / expectedRelevant;
assert.equal(precision, 1, "benchmark precision should remain 100% on known negative cases");
assert.equal(recall, 1, "benchmark recall should remain 100% on known positive cases");
console.log(`Search quality benchmark: ${cases.length} job families; precision ${(precision * 100).toFixed(0)}%; recall ${(recall * 100).toFixed(0)}%; no external requests or candidate data.`);
