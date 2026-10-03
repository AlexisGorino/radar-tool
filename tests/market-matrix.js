// node tests/market-matrix.js — JDs sintéticas representativas por rubro y mercado.
// Sin red: cubre extracción de roles, skills y alcance antes de que el usuario revise.
const assert = require("assert");
const path = require("path");
const Extractor = require(path.join(__dirname, "..", "js", "extractor.js"));
const Generator = require(path.join(__dirname, "..", "js", "generator.js"));

const cases = [
  { name: "backend cloud · Argentina", jd: "Buscamos Backend Developer con Java, Spring Boot y AWS para fintech en CABA, Argentina.", role: "Backend Developer", skill: "Java", country: "Argentina", place: "Caba" },
  { name: "data · Argentina", jd: "Se busca Analista de Datos con SQL y Power BI para el equipo de reporting en Rosario, Argentina.", role: "Analista de Datos", skill: "SQL", country: "Argentina", place: "Rosario" },
  { name: "cybersecurity · Argentina", jd: "Buscamos Analista de Ciberseguridad con experiencia en SIEM y Fortinet para Córdoba, Argentina.", role: "Analista de Ciberseguridad", skill: "SIEM", country: "Argentina", place: "Córdoba" },
  { name: "Tier I soporte IT · Argentina", jd: "Tier I - Técnico/a de soporte IT. Atención de incidencias, Windows y Active Directory. Ubicación: Buenos Aires, Argentina.", role: "Técnico/a de soporte IT", skill: "Active Directory", country: "Argentina", place: "Buenos Aires" },
  { name: "Tier I instalador telecom · Islas Canarias", jd: "Tier I - Técnico/a instalador/a de telecomunicaciones. Requisitos excluyentes: FTTH, OTDR y fibra óptica. Excel deseable. Ubicación: Islas Canarias, España.", role: "Técnico/a instalador/a de telecomunicaciones", skill: "OTDR", optional: "Excel", country: "España", place: "Islas Canarias" },
  { name: "telecomunicaciones · Chile", jd: "Buscamos Ingeniero de Redes con Cisco y MPLS para Santiago de Chile.", role: "Ingeniero de Redes", skill: "Cisco", country: "Chile", place: "Santiago" },
  { name: "QA automation · México", jd: "Empresa de retail en Guadalajara busca QA Automation Engineer con Selenium y Cypress. Se valorará Playwright.", role: "QA Automation Engineer", skill: "Selenium", country: "México", place: "Guadalajara" },
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
    if (!c.role) {
      const tiers = Generator.buildLinkedinBooleanTiers(r);
      assert.ok(tiers.length && tiers.some((tier) => !tier.query.includes("Developer")), "debe permitir búsqueda por skills sin título");
    }
    passed++;
  } catch (error) {
    failures.push(`${c.name}: ${error.message}`);
  }
}

console.log(`\n${passed} passed, ${failures.length} failed (${cases.length} market cases)\n`);
failures.forEach((failure) => console.log(`FAIL: ${failure}`));
if (failures.length) process.exit(1);
