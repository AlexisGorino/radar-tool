// Skills, industries, seniority markers and role synonyms used by extractor.js.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RadarKeywords = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SKILLS = [
    "SAP BTP", "SAP FICO", "SAP FI", "SAP CO", "SAP MM", "SAP SD", "SAP HCM", "SAP PP",
    "SAP QM", "SAP WM", "SAP EWM", "SAP Fiori", "SAP Basis", "SAP PM", "SAP ABAP",
    "SuccessFactors", "S/4HANA", "Business One", "ABAP", "SAP", "Fiori", "HANA",
    "Salesforce", "HubSpot", "Dynamics 365", "CRM", "ERP",
    "Java", "Python", "JavaScript", "TypeScript", "React", "Angular", "Vue",
    "Node.js", ".NET", "C#", "C++", "Go", "Kotlin", "Swift", "PHP", "Ruby",
    "Spring", "Spring Boot", "Django", "Flask", "FastAPI", "Laravel", "Rails",
    "AWS", "Azure", "GCP", "Kubernetes", "Docker", "Terraform", "CI/CD",
    "Lambda", "API Gateway", "SQS", "SNS", "Serverless Framework", "CDK", "SAM",
    "GitHub Actions", "Jenkins", "GitLab CI",
    "SQL", "NoSQL", "MongoDB", "PostgreSQL", "MySQL", "Redis", "DynamoDB",
    "DevOps", "SRE", "Scrum", "Kanban", "Agile",
    "GPON", "RF", "Networking", "Cisco", "Telecomunicaciones",
    "QA", "Testing", "Automation", "Selenium", "Cypress",
    "Machine Learning", "Data Science", "Power BI", "Tableau", "ETL", "Spark",
    "Figma", "UX", "UI",
    "ISO 27001", "NIST", "GDPR", "NIS2", "DORA", "PCI-DSS", "CISM", "CISSP", "CISA", "CRISC",
    "PMP", "PRINCE2", "IAM", "PAM", "Zero Trust", "SIEM", "SOC", "Pentesting",
  ];

  const INDUSTRIES = [
    "banca", "banco", "seguros", "aseguradora", "telecomunicaciones", "telecom", "hoteleria",
    "hotelería", "retail", "salud", "farmaceutica", "farmacéutica", "fintech", "e-commerce", "ecommerce",
    "manufactura", "industrial", "energia", "energía", "petrolera", "consultoria", "consultoría", "consultora",
    "logistica", "logística", "turismo", "educacion", "educación",
    "gaming", "inmobiliario", "inmobiliaria", "real estate", "agro", "agropecuario", "mineria", "minería",
    "automotriz", "construccion", "construcción", "alimenticia", "textil",
    "ciberseguridad", "seguridad informatica", "seguridad informática", "seguridad de la informacion", "seguridad de la información",
  ];

  // Common to almost every posting in their category — real, but they don't
  // discriminate a search the way a specific tool/framework/cert does.
  // Ranked last in Atributos so the technical, specific terms win the cap.
  const GENERIC_SKILLS = ["Scrum", "Kanban", "Agile", "DevOps", "QA", "Testing", "ERP", "CRM"];

  const SENIOR_WORDS =["senior", "sr", "lead", "líder", "lider", "manager", "gerente", "head", "director", "principal"];
  const JUNIOR_WORDS = ["junior", "jr", "trainee", "practicante", "ssr", "semi-senior", "semi senior", "pasante", "intern"];

  /** Role -> extra synonyms to offer when the "sinónimos" toggle is on. */
  const ROLE_SYNONYMS = {
    "desarrollador": ["developer", "programador", "engineer", "ingeniero de software"],
    "developer": ["desarrollador", "programador", "software engineer"],
    "consultor": ["consultant", "especialista", "analista"],
    "arquitecto": ["architect", "arquitecto de soluciones", "solution architect"],
    "gerente": ["manager", "jefe", "responsable", "head"],
    "analista": ["analyst", "especialista"],
    "reclutador": ["recruiter", "talent acquisition", "sourcer"],
    "vendedor": ["sales", "ejecutivo de cuentas", "account executive"],
    "diseñador": ["designer", "ux designer", "ui designer"],
    "product manager": ["pm", "product owner", "gerente de producto"],
    "project manager": ["pm", "jefe de proyecto", "gerente de proyecto"],
    "scrum master": ["agile coach", "facilitador ágil"],
    "data scientist": ["científico de datos", "analista de datos"],
    "devops": ["sre", "ingeniero de infraestructura", "platform engineer"],
  };

  const GH_LANGUAGES = ["java", "python", "javascript", "typescript", "react", "node", "node.js", ".net", "c#", "c++", "go", "kotlin", "swift", "php", "ruby"];

  /**
   * Returns synonym suggestions for a role phrase by matching any known key
   * that appears as a whole word inside it (e.g. "Desarrollador Backend" -> matches "desarrollador").
   * Case-insensitive. Returns [] when nothing matches.
   */
  function getSynonyms(rolPhrase) {
    const text = String(rolPhrase || "").toLowerCase();
    const out = [];
    Object.keys(ROLE_SYNONYMS).forEach((key) => {
      const re = new RegExp("(^|[^a-záéíóúñü0-9])" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-záéíóúñü0-9])", "i");
      if (re.test(text)) {
        ROLE_SYNONYMS[key].forEach((syn) => {
          if (!out.some((o) => o.toLowerCase() === syn.toLowerCase())) out.push(syn);
        });
      }
    });
    return out;
  }

  return { SKILLS, INDUSTRIES, GENERIC_SKILLS, SENIOR_WORDS, JUNIOR_WORDS, ROLE_SYNONYMS, GH_LANGUAGES, getSynonyms };
});
