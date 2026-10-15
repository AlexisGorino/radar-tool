// node tests/market-matrix.js — JDs sintéticas representativas por rubro y mercado.
// Sin red: cubre extracción de roles, skills y alcance antes de que el usuario revise.
const assert = require("assert");
const path = require("path");
const Extractor = require(path.join(__dirname, "..", "js", "extractor.js"));
const Generator = require(path.join(__dirname, "..", "js", "generator.js"));
const Discovery = require(path.join(__dirname, "..", "js", "talent-discovery.js"));

const cases = [
  { name: "backend cloud · Argentina", jd: "Buscamos Backend Developer con Java, Spring Boot y AWS para fintech en CABA, Argentina.", role: "Backend Developer", skill: "Java", country: "Argentina", place: "Caba" },
  { name: "data · Argentina", jd: "Se busca Analista de Datos con SQL y Power BI para el equipo de reporting en Rosario, Argentina.", role: "Analista de Datos", skill: "SQL", country: "Argentina", place: "Rosario" },
  { name: "cybersecurity · Argentina", jd: "Buscamos Analista de Ciberseguridad con experiencia en SIEM y Fortinet para Córdoba, Argentina.", role: "Analista de Ciberseguridad", skill: "SIEM", country: "Argentina", place: "Córdoba" },
  { name: "Tier I soporte IT · Argentina", jd: "Tier I - Técnico/a de soporte IT. Atención de incidencias, Windows y Active Directory. Ubicación: Buenos Aires, Argentina.", role: "Técnico/a de soporte IT", skill: "Active Directory", country: "Argentina", place: "Buenos Aires" },
  { name: "Tier I instalador telecom · Islas Canarias", jd: "Tier I - Técnico/a instalador/a de telecomunicaciones. Requisitos excluyentes: FTTH, OTDR y fibra óptica. Excel deseable. Ubicación: Islas Canarias, España.", role: "Técnico/a instalador/a de telecomunicaciones", skill: "OTDR", optional: "Excel", country: "España", place: "Islas Canarias" },
  { name: "QA automation · México", jd: "Empresa de retail en Guadalajara, México busca QA Automation Engineer con Selenium y Cypress. Se valorará Playwright.", role: "QA Automation Engineer", skill: "Selenium", country: "México", place: "Guadalajara" },
  { name: "RRHH / hunting · Argentina", jd: "Necesitamos Recruiter IT con experiencia en ATS y LinkedIn Recruiter para búsqueda de perfiles tecnológicos en Buenos Aires, Argentina.", role: "Recruiter IT", skill: "ATS", country: "Argentina", place: "Buenos Aires" },
  { name: "finanzas · Perú", jd: "Se busca Analista Contable con NIIF y Auditoría para el equipo financiero en Lima, Perú. Excel avanzado deseable.", role: "Analista Contable", skill: "NIIF", optional: "Excel avanzado", country: "Perú", place: "Lima" },
  { name: "project manager SAP · Colombia", jd: "Buscamos Project Manager SAP con SAP FI y SAP CO para banca en Bogotá, Colombia.", role: "Project Manager SAP", skill: "SAP FI", country: "Colombia", place: "Bogotá" },
  { name: "marketing · México", jd: "Se busca Growth Marketing Manager con SEO y Google Ads para ecommerce en Ciudad de México, México.", role: "Growth Marketing Manager", skill: "SEO", country: "México", place: "Ciudad de México" },
  { name: "diseño · Uruguay", jd: "Buscamos UX Designer con Figma y Design Systems para Montevideo, Uruguay.", role: "UX Designer", skill: "Figma", country: "Uruguay", place: "Montevideo" },
  { name: "QA · Alemania", jd: "Suchen QA Engineer mit Erfahrung in Selenium und Playwright in Munich, Germany.", role: "QA Engineer", skill: "Selenium", country: "Alemania", place: "Múnich" },
  { name: "data engineer · España", jd: "Buscamos Data Engineer con Python, Spark y Airflow para Madrid, España.", role: "Data Engineer", skill: "Python", country: "España", place: "Madrid" },
  { name: "telecom field engineer · España", jd: "Técnico de campo de telecomunicaciones para instalación de antenas, radioenlace y redes HFC en Tenerife, España.", role: "Técnico de campo de telecomunicaciones", skill: "Radioenlace", country: "España", place: "Tenerife" },
  { name: "legal / compliance · España", jd: "Buscamos Abogado Laboral con experiencia en Compliance para Madrid, España.", role: "Abogado Laboral", skill: "Compliance", country: "España", place: "Madrid" },
  { name: "customer support · Irlanda", jd: "Hiring Customer Support Specialist with English and Zendesk, based in Dublin, Ireland.", role: "Customer Support Specialist", skill: "Zendesk", country: "Irlanda", place: "Dublín" },
  { name: "consultoría SAP FI/CO · Argentina", jd: "Buscamos Consultor Funcional SAP FI/CO con experiencia en SAP FI, SAP CO y S/4HANA para Buenos Aires, Argentina.", role: "Consultor Funcional SAP FI/CO", skill: "SAP FI", country: "Argentina", place: "Buenos Aires" },
  { name: "consultor SAP FI/CO sin etiqueta formal · Argentina", jd: "Consultor SAP FI/CO con S/4HANA para cierre contable en Buenos Aires, Argentina.", role: "Consultor SAP FI/CO", skill: "SAP FI", country: "Argentina", place: "Buenos Aires" },
  { name: "consultoría ERP · España", jd: "Se busca Consultor ERP con experiencia en implementación de Oracle Fusion y NetSuite para Valencia, España.", role: "Consultor ERP", skill: "Oracle Fusion", country: "España", place: "Valencia" },
  { name: "Salesforce CRM · México", jd: "Buscamos Administrador Salesforce Service Cloud con gestión de casos y experiencia en CRM para Guadalajara, México.", role: "Administrador Salesforce Service Cloud", skill: "Salesforce Service Cloud", country: "México", place: "Guadalajara" },
  { name: "Dynamics 365 CRM · Colombia", jd: "Hiring a Dynamics 365 CRM Consultant with Power BI experience in Bogotá, Colombia.", role: "Dynamics 365 CRM Consultant", skill: "Dynamics 365", country: "Colombia", place: "Bogotá" },
  { name: "telecomunicaciones · Perú", jd: "Buscamos Ingeniero de Redes de Telecomunicaciones con Cisco, MPLS y SD-WAN para Lima, Perú.", role: "Ingeniero de Redes de Telecomunicaciones", skill: "Cisco", country: "Perú", place: "Lima" },
  { name: "talento no IT · España", jd: "Buscamos Talent Acquisition Specialist con experiencia en ATS, selección end-to-end y employer branding para Madrid, España.", role: "Talent Acquisition Specialist", skill: "ATS", country: "España", place: "Madrid" },
  { name: "supply chain no IT · Perú", jd: "Se busca Analista de Supply Chain con experiencia en inventarios, WMS y Excel avanzado para Lima, Perú.", role: "Analista de Supply Chain", skill: "WMS", country: "Perú", place: "Lima" },
  { name: "auditoría · España", jd: "Buscamos Auditor Interno con experiencia en ISO 9001, control interno y gestión de calidad en Sevilla, España.", role: "Auditor Interno", skill: "ISO 9001", country: "España", place: "Sevilla" },
  { name: "infraestructura sin cargo explícito · Argentina", jd: "Requisitos excluyentes: Kubernetes, Terraform y AWS. Guardia de producción para una plataforma fintech en Neuquén, Argentina.", role: "", skill: "Kubernetes", country: "Argentina", place: "Neuquén" },
];

let passed = 0;
const failures = [];
for (const c of cases) {
  try {
    const r = Extractor.analyzeJD(c.jd);
    if (c.role) assert.ok(r.rol.some((role) => role.toLowerCase().includes(c.role.toLowerCase())), `rol: ${r.rol.join(" | ") || "vacío"}`);
    else assert.deepStrictEqual(r.rol, [], `no debía inventar rol: ${r.rol.join(" | ")}`);
    assert.strictEqual(r.country, c.country, `país: ${r.country}`);
    assert.ok(r.alcance.some((place) => place.toLowerCase() === c.place.toLowerCase()), `localidad: ${r.alcance.join(" | ")}`);
    assert.ok([...r.atributos, ...(r.atributosDeseables || [])].some((skill) => skill.toLowerCase() === c.skill.toLowerCase()), `skill ${c.skill}: requeridos=${r.atributos}; deseables=${r.atributosDeseables}`);
    if (c.optional) {
      assert.ok(!r.atributos.some((skill) => skill.toLowerCase() === c.optional.toLowerCase()), `${c.optional} no debe entrar por defecto como requisito`);
      assert.ok(r.atributosDeseables.some((skill) => skill.toLowerCase() === c.optional.toLowerCase()), `${c.optional} debe quedar disponible para revisión`);
    }
    if (c.name.includes("Tier I")) {
      assert.ok(!r.rol[0].includes("Tier I"), "tier es nivel de soporte, no parte del título");
      assert.deepStrictEqual(r.refinar, [], "no inferir exclusiones NOT a partir de la JD");
    }
    if (c.name.includes("Islas Canarias")) {
      const xray = Generator.buildXRayTiers(r, "linkedin.com/in");
      assert.ok(xray[0].query.includes("Tenerife") && xray[0].query.includes("Canary Islands"), "X-Ray should cover common profile location variants for the islands");
      const native = Generator.buildLinkedinBooleanTiers(r);
      assert.ok(native[0].query.includes("Islas Canarias"), "LinkedIn should keep the exact locality as the primary scope");
    }
    const query = Generator.buildUniversalBoolean(r);
    assert.ok(query, "debe ofrecer al menos una consulta útil");
    assert.ok(query.length <= 900, `booleano demasiado largo (${query.length} caracteres)`);
    assert.ok(query.toLowerCase().includes(c.place.toLowerCase()), "el booleano debe preservar la localidad solicitada");
    assert.ok(r.alcance.some((place) => place.toLowerCase() === c.country.toLowerCase()), "el análisis debe conservar el país para validar resultados");
    const linkedinTiers = Generator.buildLinkedinBooleanTiers(r);
    assert.ok(linkedinTiers.length, "debe ofrecer una ruta de búsqueda en LinkedIn");
    assert.ok(linkedinTiers.every((tier) => tier.query.length <= 900), "todos los booleanos LinkedIn deben ser compactos");
    if (!c.role) {
      const tiers = Generator.buildLinkedinBooleanTiers(r);
      assert.ok(tiers.length && tiers.some((tier) => !tier.query.includes("Developer")), "debe permitir búsqueda por skills sin título");
    }
    passed++;
  } catch (error) {
    failures.push(`${c.name}: ${error.message}`);
  }
}

// Non-technical roles still have a useful public route: LinkedIn. GitHub is
// intentionally omitted when a profile has no searchable programming language.
const recruiter = Extractor.analyzeJD("Buscamos Talent Acquisition Specialist con ATS y LinkedIn Recruiter para Madrid, España.");
const recruiterPlan = Discovery.buildPlan(recruiter, ["linkedin", "github"], Generator);
assert.ok(recruiterPlan.queries.some((query) => query.source === "linkedin"), "non-IT profiles deben conservar LinkedIn");
assert.ok(!recruiterPlan.queries.some((query) => query.source === "github"), "no enviar perfiles no técnicos a GitHub");
assert.ok(recruiterPlan.skippedSources.includes("github"), "explicar por qué GitHub no aplica");

const equivalenceCases = [
  { jd: "Buscamos Consultor Funcional SAP FI/CO para Buenos Aires, Argentina.", expected: "SAP FI/CO Consultant", locality: "Buenos Aires" },
  { jd: "Consultor SAP FI/CO con S/4HANA para cierre contable en Buenos Aires, Argentina.", expected: "SAP FI/CO Consultant", locality: "Buenos Aires" },
  { jd: "Buscamos Administrador Salesforce Service Cloud para Madrid, España.", expected: "Salesforce Administrator", locality: "Madrid" },
  { jd: "Se busca Consultor Dynamics 365 CRM para Bogotá, Colombia.", expected: "Dynamics 365 Consultant", locality: "Bogotá" },
  { jd: "Buscamos Talent Acquisition Specialist con ATS para Lima, Perú.", expected: "Recruiter", locality: "Lima" },
  { jd: "Se busca Analista de Supply Chain con WMS para Montevideo, Uruguay.", expected: "Supply Chain Analyst", locality: "Montevideo" },
  { jd: "Buscamos Auditor Interno para Valencia, España.", expected: "Internal Auditor", locality: "Valencia" },
  { jd: "Buscamos Ingeniero de Redes de Telecomunicaciones para Rosario, Argentina.", expected: "Telecommunications Network Engineer", locality: "Rosario" },
];
for (const sample of equivalenceCases) {
  const analyzed = Extractor.analyzeJD(sample.jd);
  const equivalents = Discovery.expandRoleFamily(analyzed.rol, analyzed.seniority);
  assert.ok(equivalents.includes(sample.expected), `${sample.expected}: ofrecer un título equivalente conocido`);
  const plan = Discovery.buildPlan(analyzed, ["linkedin"], Generator);
  const query = plan.queries[0] && plan.queries[0].query;
  assert.ok(query && query.includes(sample.locality), `${sample.expected}: consulta conserva localidad`);
  assert.ok(query.includes(sample.expected), `${sample.expected}: LinkedIn recibe el equivalente sin perder el cargo original`);
}

console.log(`\n${passed} passed, ${failures.length} failed (${cases.length} market cases)\n`);
failures.forEach((failure) => console.log(`FAIL: ${failure}`));
if (failures.length) process.exit(1);
