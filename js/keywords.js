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
    "Kafka", "Airflow", "dbt", "Snowflake", "Databricks", "Redshift", "BigQuery",
    "Looker", "Airbyte", "Prefect", "Flink", "Data Warehouse", "Data Lake",
    "Figma", "UX", "UI",
    "ISO 27001", "NIST", "GDPR", "NIS2", "DORA", "PCI-DSS", "CISM", "CISSP", "CISA", "CRISC",
    "PMP", "PRINCE2", "IAM", "PAM", "Zero Trust", "SIEM", "SOC", "Pentesting",
    "Rust", "Scala", "Elixir", "Dart", "Flutter", "React Native", "Perl", "Objective-C", "Haskell", "Unity",
    // Marketing / ventas
    "SEO", "SEM", "Google Ads", "Meta Ads", "Google Analytics", "Marketing Digital",
    "Email Marketing", "Copywriting", "Growth", "Inbound Marketing", "Performance Marketing",
    // RRHH / reclutamiento
    "ATS", "Workday", "Reclutamiento", "Employer Branding", "Compensaciones y Beneficios",
    "LinkedIn Recruiter", "Onboarding",
    // Finanzas / contabilidad
    "NIIF", "IFRS", "Excel avanzado", "Contabilidad", "Auditoria", "Auditoría",
    "Tesoreria", "Tesorería", "Presupuestos", "Costos", "US GAAP",
    // Legal
    "Compliance", "Derecho Laboral", "Propiedad Intelectual", "Contratos",
    // IA / Machine Learning (más allá de "Machine Learning" / "Data Science")
    "Inteligencia Artificial", "IA Generativa", "Generative AI", "LLM", "GPT",
    "NLP", "Procesamiento de Lenguaje Natural", "Computer Vision", "PyTorch",
    "TensorFlow", "Hugging Face", "LangChain", "RAG", "Prompt Engineering", "MLOps",
    "Scikit-learn", "OpenAI", "Copilot",
    // Más SAP / otros ERP
    "SAP MDG", "SAP TM", "SAP IBP", "SAP Ariba", "SAP Concur", "SAP GRC",
    "Oracle EBS", "Oracle Fusion", "NetSuite", "Odoo", "Sage", "Infor",
    // Infraestructura / observabilidad / seguridad ofensiva
    "Linux", "Windows Server", "Active Directory", "VMware", "Ansible", "Puppet", "Chef",
    "Prometheus", "Grafana", "ELK", "Splunk", "Nagios", "VPN", "Firewall",
    // Testing / QA adicional
    "Playwright", "JMeter", "Postman", "SoapUI",
    // Mobile / blockchain
    "Android", "iOS", "Xamarin", "Blockchain", "Solidity", "Web3", "Smart Contracts",
    // Salud / farma
    "Farmacovigilancia", "Buenas Practicas de Manufactura", "Buenas Prácticas de Manufactura",
    "GMP", "Registro Sanitario", "Ensayos Clinicos", "Ensayos Clínicos",
    // Ingeniería (mecánica/civil/industrial) y calidad
    "AutoCAD", "SolidWorks", "Lean Manufacturing", "Six Sigma", "ISO 9001", "Gestion de Calidad", "Gestión de Calidad",
    // Logística / comercio exterior
    "Supply Chain", "Comercio Exterior", "Logistica Internacional", "Logística Internacional",
    "Gestion de Inventarios", "Gestión de Inventarios", "WMS", "TMS", "Comex",
    // Educación
    "Diseño Instruccional", "Diseno Instruccional", "LMS", "E-learning",
    // Hotelería / turismo
    "Revenue Management", "Gestion Hotelera", "Gestión Hotelera", "PMS",
    // Atención al cliente
    "Atencion al Cliente", "Atención al Cliente", "Call Center", "Zendesk",
    // Retail
    "Visual Merchandising", "Category Management",
  ];

  const INDUSTRIES = [
    "banca", "banco", "seguros", "aseguradora", "telecomunicaciones", "telecom", "hoteleria",
    "hotelería", "retail", "salud", "farmaceutica", "farmacéutica", "fintech", "e-commerce", "ecommerce",
    "manufactura", "industrial", "energia", "energía", "petrolera", "consultoria", "consultoría", "consultora",
    "logistica", "logística", "turismo", "educacion", "educación",
    "gaming", "inmobiliario", "inmobiliaria", "real estate", "agro", "agropecuario", "mineria", "minería",
    "automotriz", "construccion", "construcción", "alimenticia", "textil",
    "ciberseguridad", "seguridad informatica", "seguridad informática", "seguridad de la informacion", "seguridad de la información",
    "bpo", "moda", "sin fines de lucro", "ong",
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

  const GH_LANGUAGES = [
    "java", "python", "javascript", "typescript", "react", "node", "node.js", ".net", "c#", "c++", "go", "kotlin", "swift", "php", "ruby",
    "rust", "scala", "elixir", "dart", "perl", "objective-c", "haskell",
  ];

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
