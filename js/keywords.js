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
    "SAP BTP", "SAP FI", "SAP CO", "SAP MM", "SAP SD", "SAP HCM", "SAP Fiori",
    "SuccessFactors", "S/4HANA", "Business One", "ABAP", "SAP", "Fiori", "HANA",
    "Salesforce", "HubSpot", "Dynamics 365", "CRM", "ERP",
    "Java", "Python", "JavaScript", "TypeScript", "React", "Angular", "Vue",
    "Node.js", ".NET", "C#", "C++", "Go", "Kotlin", "Swift", "PHP", "Ruby",
    "AWS", "Azure", "GCP", "Kubernetes", "Docker", "Terraform", "CI/CD",
    "SQL", "NoSQL", "MongoDB", "PostgreSQL", "MySQL",
    "DevOps", "SRE", "Scrum", "Kanban", "Agile",
    "GPON", "RF", "Networking", "Cisco", "Telecomunicaciones",
    "QA", "Testing", "Automation", "Selenium", "Cypress",
    "Machine Learning", "Data Science", "Power BI", "Tableau", "ETL", "Spark",
    "Figma", "UX", "UI",
  ];

  const INDUSTRIES = [
    "banca", "banco", "seguros", "aseguradora", "telecomunicaciones", "telecom", "hoteleria",
    "hotelería", "retail", "salud", "farmaceutica", "farmacéutica", "fintech", "e-commerce", "ecommerce",
    "manufactura", "industrial", "energia", "energía", "petrolera", "consultoria", "consultoría", "consultora",
    "logistica", "logística", "turismo", "educacion", "educación",
    "gaming", "inmobiliario", "inmobiliaria", "real estate", "agro", "agropecuario", "mineria", "minería",
    "automotriz", "construccion", "construcción", "alimenticia", "textil",
  ];

  const SENIOR_WORDS = ["senior", "sr", "lead", "líder", "lider", "manager", "gerente", "head", "director", "principal"];
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

  return { SKILLS, INDUSTRIES, SENIOR_WORDS, JUNIOR_WORDS, ROLE_SYNONYMS, GH_LANGUAGES, getSynonyms };
});
