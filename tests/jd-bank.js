// node tests/jd-bank.js
// Regression bank of real-world postings (LATAM, Spain, Europe) against
// analyzeJD() — catches drift in role/skill/domain/location precision.
const path = require("path");
const fs = require("fs");
const Extractor = require(path.join(__dirname, "..", "js", "extractor.js"));

// Real JD as extracted by pdf.js from a corporate "ficha de puesto" table
// template (label/value cells, no sentence punctuation between them once
// flattened) — this exact shape once produced a garbled role ("CLIENTE W2M
// - PM Ciberseguridad COD VACANTE KJRSab5BFeZS...") from the table's own
// header labels. Kept as a fixture so a future regex change can't reopen it.
const pdfTemplateJD = fs.readFileSync(path.join(__dirname, "fixtures", "pdf-table-template-jd.txt"), "utf8");

// Real JD from a different company, different (modern, prose-style) template
// — the title sits alone at the very top of the document with no verb, no
// label, and (once pdf.js flattens the page) no real line break to split
// on either. This once produced an EMPTY rol. Kept as a fixture for the
// same reason as the one above.
const pdfModernTemplateJD = fs.readFileSync(path.join(__dirname, "fixtures", "pdf-modern-template-jd.txt"), "utf8");

const cases = [
  {
    name: "ES - JD real en formato ficha/tabla (PDF de agencia, PM Ciberseguridad)",
    text: pdfTemplateJD,
    expectRolContains: "pm ciberseguridad",
    expectSkills: ["AWS", "ISO 27001"],
    expectDominio: "ciberseguridad",
    expectCountry: "España",
  },
  {
    name: "AR - JD real, plantilla moderna sin verbo ni etiqueta (Sr. Backend Developer, Ardua)",
    text: pdfModernTemplateJD,
    expectRolContains: "backend developer",
    expectSkills: ["Go", "AWS", "Lambda", "SQS"],
    expectDominio: "fintech",
    expectCountry: "Argentina",
  },
  {
    name: "AR - Backend Python banco",
    text: "Buscamos Backend Developer Python Senior para banco líder en Buenos Aires. Requisitos: Python, Django, AWS, PostgreSQL, Docker. Modalidad híbrida. 5+ años de experiencia.",
    expectRolContains: "backend",
    expectSkills: ["Python", "AWS", "Docker", "PostgreSQL"],
    expectDominio: "banco",
    expectCountry: "Argentina",
  },
  {
    name: "AR - Community Manager turismo (no debe confundir Manager con seniority)",
    text: "Se busca Community Manager para agencia de turismo en Mendoza, Argentina. Manejo de redes sociales y Canva.",
    expectRolContains: "community manager",
    expectCountry: "Argentina",
    expectNotAlcance: ["manager"],
  },
  {
    name: "MX - QA Automation retail",
    text: "Empresa de retail en Guadalajara busca QA Automation Engineer con Selenium, Cypress y experiencia en metodologías Agile. Presencial.",
    expectRolContains: "qa",
    expectSkills: ["Selenium", "Cypress", "Agile"],
    expectDominio: "retail",
    expectCountry: "México",
  },
  {
    name: "CO - Consultor SAP FI banca",
    text: "Buscamos Consultor SAP FI para cliente del sector banca en Bogotá, Colombia. Experiencia en SAP FI, SAP CO y S/4HANA. 4 años de experiencia.",
    expectRolContains: "consultor sap fi",
    expectSkills: ["SAP FI", "SAP CO", "S/4HANA"],
    expectDominio: "banca",
    expectCountry: "Colombia",
  },
  {
    name: "CL - DevOps fintech remoto",
    text: "Necesitamos DevOps Engineer con Kubernetes, Terraform y CI/CD para startup fintech, 100% remoto, basado en Santiago de Chile.",
    expectRolContains: "devops",
    expectSkills: ["Kubernetes", "Terraform", "CI/CD"],
    expectDominio: "fintech",
    expectCountry: "Chile",
  },
  {
    name: "PE - Data Scientist salud",
    text: "Se necesita Data Scientist con Python, Machine Learning y Power BI para empresa de salud en Lima, Perú.",
    expectRolContains: "data scientist",
    expectSkills: ["Python", "Machine Learning", "Power BI"],
    expectDominio: "salud",
    expectCountry: "Perú",
  },
  {
    name: "UY - SRE telecom presencial",
    text: "Buscamos SRE con Terraform y Docker, sector telecom, Montevideo, presencial.",
    expectRolContains: "sre",
    expectSkills: ["Terraform", "Docker"],
    expectDominio: "telecom",
    expectCountry: "Uruguay",
  },
  {
    name: "ES - Frontend React Madrid",
    text: "Buscamos Frontend Developer con React y TypeScript para empresa de seguros en Madrid, España. Jornada híbrida.",
    expectRolContains: "frontend",
    expectSkills: ["React", "TypeScript"],
    expectDominio: "seguros",
    expectCountry: "España",
  },
  {
    name: "ES - Product Manager fintech Barcelona (formato posición:)",
    text: "Posición: Product Manager. Empresa fintech en Barcelona busca perfil con experiencia en gestión de producto digital y metodologías ágiles.",
    expectRolContains: "product manager",
    expectDominio: "fintech",
    expectCountry: "España",
  },
  {
    name: "DE - React healthcare Berlin (inglés)",
    text: "Frontend Developer with React and TypeScript needed for a healthcare startup based in Berlin, Germany. Remote friendly.",
    expectRolContains: "frontend",
    expectSkills: ["React", "TypeScript"],
    expectCountry: "Alemania",
  },
  {
    name: "UK - Project Manager Londres (cargo:)",
    text: "Cargo: Project Manager. Empresa de logística con sede en Londres, Reino Unido, requiere gestión de proyectos internacionales.",
    expectRolContains: "project manager",
    expectDominio: "logística",
    expectCountry: "Reino Unido",
  },
  {
    name: "NL - DevOps Amsterdam",
    text: "Buscamos DevOps Engineer con AWS y Kubernetes para empresa de e-commerce en Amsterdam, Países Bajos, modalidad remota.",
    expectRolContains: "devops",
    expectSkills: ["AWS", "Kubernetes"],
    expectDominio: "e-commerce",
    expectCountry: "Países Bajos",
  },
  {
    name: "AR - Vacante corta sin verbo de búsqueda (primera línea como rol)",
    text: "Analista de Datos Senior\nEmpresa de energía en Rosario, Argentina.\nRequiere Power BI, SQL y Tableau.",
    expectRolContains: "analista de datos",
    expectSkills: ["Power BI", "SQL", "Tableau"],
    expectDominio: "energía",
    expectCountry: "Argentina",
  },
  {
    name: "MX - Head of Sales (no debe tomar Head como seniority del título)",
    text: "Buscamos Head of Sales para empresa de manufactura en Monterrey, México, con cartera de clientes internacionales.",
    expectRolContains: "head of sales",
    expectDominio: "manufactura",
    expectCountry: "México",
    expectNotAlcance: ["head"],
  },
  {
    name: "AR - Tech Lead banco (Lead no debe ir a alcance)",
    text: "Buscamos Tech Lead con experiencia en microservicios para banco en Buenos Aires.",
    expectRolContains: "tech lead",
    expectDominio: "banco",
    expectCountry: "Argentina",
    expectNotAlcance: ["lead"],
  },
  {
    name: "ES - Diseñador UX/UI con Figma",
    text: "Necesitamos un Diseñador UX/UI con portfolio en Figma para agencia digital en Valencia, España.",
    expectRolContains: "diseñador ux/ui",
    expectSkills: ["Figma", "UX", "UI"],
    expectCountry: "España",
  },
  {
    name: "BR - SAP BTP banca (portugués/español mixto - detecta país por ciudad)",
    text: "Buscamos Consultor SAP BTP para banco en Sao Paulo, Brasil. ABAP y Fiori requeridos.",
    expectRolContains: "consultor sap btp",
    expectSkills: ["SAP BTP", "ABAP", "Fiori"],
    expectDominio: "banco",
    expectCountry: "Brasil",
  },
  {
    name: "AR - JD larga con mucho ruido (carta de presentación incluida)",
    text: "Somos una empresa líder en el rubro fintech con más de 10 años en el mercado. Contamos con un ambiente de trabajo colaborativo y beneficios competitivos. Buscamos incorporar a un Ingeniero de Software Backend con sólidos conocimientos en Java, Spring Boot y microservicios, para sumarse a un equipo ágil en Buenos Aires, Argentina. Se valorará experiencia previa en el sector fintech. Ofrecemos modalidad remota y posibilidad de crecimiento.",
    expectRolContains: "ingeniero de software backend",
    expectSkills: ["Java"],
    expectDominio: "fintech",
    expectCountry: "Argentina",
  },
  {
    name: "MX - Vacante en formato vacante:",
    text: "Vacante: Gerente de Proyectos TI. Empresa consultora en Ciudad de México requiere experiencia en gestión de equipos y metodologías Scrum.",
    expectRolContains: "gerente de proyectos ti",
    expectSkills: ["Scrum"],
    expectDominio: "consultora",
    expectCountry: "México",
  },
  {
    name: "CO - Scrum Master certificado",
    text: "Estamos buscando Scrum Master certificado para equipo distribuido de una empresa de educación en Medellín, Colombia.",
    expectRolContains: "scrum master",
    expectDominio: "educación",
    expectCountry: "Colombia",
  },
  {
    name: "AR - JD con HTML/script embebido (seguridad)",
    text: "Buscamos <script>alert(1)</script> Desarrollador Python senior para banco en Lima, Peru.",
    expectRolContains: "desarrollador",
    expectSkills: ["Python"],
    expectCountry: "Perú",
    securityCheck: true,
  },
  {
    name: "ES - Ejecutivo de Cuentas seguros (cargo: formato con coma)",
    text: "Cargo: Ejecutivo de Cuentas, sector seguros, con cartera propia. Sede en Sevilla, España.",
    expectRolContains: "ejecutivo de cuentas",
    expectDominio: "seguros",
    expectCountry: "España",
  },
  {
    name: "AR - Vacante sin ningún dato reconocible (no debe alucinar)",
    text: "Un texto random sin ningun patron reconocible de puesto laboral especifico aqui mencionado.",
    expectSkillsEmpty: true,
    expectDominioEmpty: true,
    expectCountryNull: true,
  },
  {
    name: "PY - Analista funcional Dynamics",
    text: "Se necesita Analista Funcional Dynamics 365 para empresa de logística en Asunción, Paraguay, modalidad remota.",
    expectRolContains: "analista funcional dynamics",
    expectSkills: ["Dynamics 365"],
    expectDominio: "logística",
    expectCountry: "Paraguay",
  },
  {
    name: "EC - Ingeniero de Redes GPON telecom",
    text: "Buscamos Ingeniero de Redes con experiencia en GPON y RF para empresa de telecomunicaciones en Quito, Ecuador. Disponibilidad para viajar.",
    expectRolContains: "ingeniero de redes",
    expectSkills: ["GPON", "RF"],
    expectDominio: "telecomunicaciones",
    expectCountry: "Ecuador",
  },
  {
    name: "IT - Machine Learning Engineer Milan (inglés)",
    text: "We are looking for a Machine Learning Engineer with Python and Spark experience, based in Milan, Italy. Hybrid work.",
    expectRolContains: "machine learning engineer",
    expectSkills: ["Python", "Spark"],
    expectCountry: "Italia",
  },
  {
    name: "AR - Analista de Datos vs Científico de Datos (no deben confundirse skills)",
    text: "Buscamos Analista de Datos Junior con conocimientos de SQL y Power BI para empresa de retail en Córdoba, Argentina.",
    expectRolContains: "analista de datos",
    expectSkills: ["SQL", "Power BI"],
    expectDominio: "retail",
    expectCountry: "Argentina",
  },

  // -----------------------------------------------------------------
  // Short-form input: just "rol + ubicación", no JD paragraph at all.
  // A very common real usage pattern — recruiter types a quick search
  // instead of pasting a full posting. The location must not bleed
  // into the role text.
  // -----------------------------------------------------------------
  {
    name: "corto - 'sap fico en brasil' (bug reportado: ubicación colándose en el rol)",
    text: "sap fico en brasil",
    expectRolExact: "sap fico",
    expectRolNotContains: ["brasil", " en "],
    expectSkills: ["SAP FICO"],
    expectCountry: "Brasil",
  },
  {
    name: "corto - 'desarrollador java en buenos aires'",
    text: "desarrollador java en buenos aires",
    expectRolExact: "desarrollador java",
    expectRolNotContains: ["buenos aires"],
    expectSkills: ["Java"],
    expectCountry: "Argentina",
  },
  {
    name: "corto - 'product manager remoto' (modalidad al final, sin ubicación)",
    text: "product manager remoto",
    expectRolExact: "product manager",
    expectRolNotContains: ["remoto"],
  },
  {
    name: "corto - 'data analyst senior en madrid' (seniority + ubicación, ambas afuera del rol)",
    text: "data analyst senior en madrid",
    expectRolExact: "data analyst",
    expectRolNotContains: ["senior", "madrid"],
    expectCountry: "España",
  },
  {
    name: "corto - 'community manager en mendoza' (ciudad, no país, no debe romper el rol)",
    text: "community manager en mendoza",
    expectRolExact: "community manager",
    expectRolNotContains: ["mendoza"],
    expectCountry: "Argentina",
  },

  // -----------------------------------------------------------------
  // Perfiles no técnicos (marketing, RRHH, finanzas, legal) — el banco de
  // skills estaba fuerte en tecnología/SAP/ciberseguridad pero vacío para
  // el resto de las profesiones que un reclutador también busca todos los días.
  // -----------------------------------------------------------------
  {
    name: "MX - Growth Marketing Manager",
    text: "Buscamos Growth Marketing Manager con experiencia en SEO, SEM, Google Ads y Google Analytics para empresa de e-commerce en Guadalajara, México.",
    expectRolContains: "growth marketing manager",
    expectSkills: ["SEO", "SEM", "Google Ads", "Google Analytics"],
    expectDominio: "e-commerce",
    expectCountry: "México",
  },
  {
    name: "AR - Recruiter / Talent Acquisition",
    text: "Necesitamos un Recruiter con manejo de ATS y LinkedIn Recruiter para empresa de retail en Córdoba, Argentina.",
    expectRolContains: "recruiter",
    expectSkills: ["ATS", "LinkedIn Recruiter"],
    expectDominio: "retail",
    expectCountry: "Argentina",
  },
  {
    name: "CO - Analista Contable Senior",
    text: "Se busca Analista Contable Senior con conocimientos de NIIF, Excel avanzado y experiencia en Auditoría, para banco en Bogotá, Colombia.",
    expectRolContains: "analista contable",
    expectSkills: ["NIIF", "Excel avanzado", "Auditoría"],
    expectDominio: "banco",
    expectCountry: "Colombia",
  },
  {
    name: "ES - Abogado Laboral / Legal Counsel",
    text: "Buscamos Abogado especializado en Derecho Laboral y Compliance para empresa de consultoría en Madrid, España.",
    expectRolContains: "abogado",
    expectSkills: ["Derecho Laboral", "Compliance"],
    expectDominio: "consultoría",
    expectCountry: "España",
  },
];

let passed = 0;
let failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push({ name, detail });
  }
}

cases.forEach((c) => {
  const r = Extractor.analyzeJD(c.text);
  const rolText = (r.rol.join(" ") || "").toLowerCase();

  if (c.expectRolContains) {
    check(
      `${c.name} :: rol contains "${c.expectRolContains}"`,
      rolText.includes(c.expectRolContains.toLowerCase()),
      `got rol="${r.rol.join(" | ")}"`
    );
  }

  if (c.expectRolExact) {
    check(`${c.name} :: rol is exactly "${c.expectRolExact}"`, rolText === c.expectRolExact.toLowerCase(), `got rol="${r.rol.join(" | ")}"`);
  }

  if (c.expectRolNotContains) {
    c.expectRolNotContains.forEach((w) => {
      check(`${c.name} :: rol does NOT contain "${w}"`, !rolText.includes(w.toLowerCase()), `got rol="${r.rol.join(" | ")}"`);
    });
  }

  if (c.expectSkills) {
    c.expectSkills.forEach((s) => {
      check(
        `${c.name} :: atributos includes "${s}"`,
        r.atributos.some((a) => a.toLowerCase() === s.toLowerCase()),
        `got atributos=[${r.atributos.join(", ")}]`
      );
    });
  }

  if (c.expectDominio) {
    check(
      `${c.name} :: dominio includes "${c.expectDominio}"`,
      r.dominio.some((d) => d.toLowerCase() === c.expectDominio.toLowerCase()),
      `got dominio=[${r.dominio.join(", ")}]`
    );
  }

  if (c.expectCountry) {
    check(`${c.name} :: country = "${c.expectCountry}"`, r.country === c.expectCountry, `got country="${r.country}"`);
  }

  if (c.expectCountryNull) {
    check(`${c.name} :: country is null`, r.country === null, `got country="${r.country}"`);
  }

  if (c.expectSkillsEmpty) {
    check(`${c.name} :: atributos empty`, r.atributos.length === 0, `got atributos=[${r.atributos.join(", ")}]`);
  }

  if (c.expectDominioEmpty) {
    check(`${c.name} :: dominio empty`, r.dominio.length === 0, `got dominio=[${r.dominio.join(", ")}]`);
  }

  if (c.expectNotAlcance) {
    c.expectNotAlcance.forEach((w) => {
      check(
        `${c.name} :: alcance does NOT include "${w}"`,
        !r.alcance.some((a) => a.toLowerCase() === w.toLowerCase()),
        `got alcance=[${r.alcance.join(", ")}]`
      );
    });
  }

  if (c.securityCheck) {
    check(`${c.name} :: rol strings are plain text, no markup`, r.rol.every((x) => typeof x === "string" && !x.includes("<script")), `got rol="${r.rol.join(" | ")}"`);
  }
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)\n`);
if (failed) {
  failures.forEach((f) => console.log(`FAIL: ${f.name}\n  ${f.detail}\n`));
  process.exit(1);
} else {
  console.log("All JD-bank checks passed.");
  process.exit(0);
}
