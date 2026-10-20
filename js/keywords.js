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
    "Salesforce Sales Cloud", "Salesforce Service Cloud", "Salesforce", "ServiceNow", "HubSpot", "Dynamics 365", "CRM", "ERP",
    // Capital-markets and treasury platforms are products, never job titles by themselves.
    "Murex MX.3", "Murex Datamart", "Murex", "Calypso", "Calpyso", "Adenza Calypso", "Kondor", "Finastra", "Temenos T24",
    "Java", "Python", "JavaScript", "TypeScript", "React", "Angular", "Vue",
    "Node.js", ".NET", "C#", "C++", "Go", "Kotlin", "Swift", "PHP", "Ruby",
    "Spring", "Spring Boot", "Django", "Flask", "FastAPI", "Laravel", "Rails",
    "AWS", "Azure", "GCP", "Kubernetes", "Docker", "Terraform", "CI/CD",
    "Lambda", "API Gateway", "SQS", "SNS", "Serverless Framework", "CDK", "SAM",
    "GitHub Actions", "Jenkins", "GitLab CI",
    "SQL", "NoSQL", "MongoDB", "PostgreSQL", "MySQL", "Redis", "DynamoDB",
    "DevOps", "SRE", "Scrum", "Kanban", "Agile",
    "GPON", "FTTH", "RF", "Networking", "Cisco", "Fibra óptica", "Fibra optica", "OTDR", "Fusionadora", "Empalme de fibra",
    "5G", "5G NR", "4G LTE", "RAN", "OSS/BSS", "VoIP", "SIP", "OLT", "ODF", "DWDM", "BGP", "OSPF",
    "Nokia", "Ericsson", "Huawei", "ZTE", "Nokia NetAct", "Ericsson ENM", "TEMS", "Nemo Outdoor",
    "PON", "XGS-PON", "5G Core", "EPC", "VoLTE", "Drive Test", "Anritsu", "EXFO", "Viavi", "VFL",
    "Ekahau", "nPerf", "Baja tensión",
    "Cableado estructurado", "Radioenlace", "Redes HFC", "Instalación de antenas", "Instalacion de antenas", "CCTV", "Trabajo en altura",
    "Fortinet", "Palo Alto Networks", "Check Point", "Juniper", "Aruba", "Meraki", "SD-WAN", "MPLS",
    "QA", "Testing", "Automation", "Selenium", "Cypress",
    "Machine Learning", "Data Science", "Power BI", "Tableau", "ETL", "Spark",
    "Kafka", "Airflow", "dbt", "Snowflake", "Databricks", "Redshift", "BigQuery",
    "Looker", "Airbyte", "Prefect", "Flink", "Data Warehouse", "Data Lake",
    "Figma", "UX", "UI",
    "ISO 27001", "NIST", "GDPR", "NIS2", "DORA", "PCI-DSS", "CISM", "CISSP", "CISA", "CRISC",
    "PMP", "PRINCE2", "IAM", "PAM", "Zero Trust", "SIEM", "SOC", "Pentesting",
    "MS Project", "Microsoft Project", "PMBOK", "Gantt", "Jira", "Confluence", "SharePoint",
    "PowerPoint", "Asana", "Monday.com", "CAPM",
    "Rust", "Scala", "Elixir", "Dart", "Flutter", "React Native", "Perl", "Objective-C", "Haskell", "Unity",
    // Marketing / ventas
    "SEO", "SEM", "Google Ads", "Meta Ads", "Google Analytics", "Marketing Digital",
    "Email Marketing", "Copywriting", "Growth", "Inbound Marketing", "Performance Marketing",
    // RRHH / reclutamiento
    "ATS", "Workday", "Reclutamiento", "Employer Branding", "Compensaciones y Beneficios",
    "LinkedIn Recruiter", "Onboarding",
    // Finanzas / contabilidad
    "NIIF", "IFRS", "Excel", "Excel avanzado", "Contabilidad", "Auditoria", "Auditoría",
    "Tesoreria", "Tesorería", "Presupuestos", "Costos", "US GAAP", "SEPA", "Kyriba", "Cash Management",
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
    // Activos digitales y regulación europea. Son señales concretas para
    // sourcing financiero; sin este vocabulario, la JD de un especialista
    // podía quedar con cargo falso y cero requisitos detectados.
    "Activos digitales", "Digital Assets", "Criptoactivos", "Crypto Assets", "Stablecoins", "CBDC", "CBDCs", "RWA", "MiCA", "CASP", "CASPs", "Tokenización", "Tokenization",
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
    // People, operations and corporate systems used outside technology teams.
    "Liquidación de Sueldos", "Payroll", "BambooHR", "Greenhouse ATS", "Lever ATS",
    "SAP SuccessFactors", "SAP Ariba", "SAP Concur", "SAP EWM", "Oracle Fusion", "Oracle NetSuite",
    "Salesforce CPQ",
    "Manejo de cartera", "Prospección comercial", "Cierre de ventas", "Compras estratégicas", "Abastecimiento",
    "Gestión de proveedores", "Planificación de demanda", "Inventario", "Auditoría interna", "Cuentas por pagar",
    "Cuentas por cobrar", "Cierre contable", "Conciliaciones bancarias", "Facturación", "Impuestos",
    "Power BI", "Google Analytics 4", "GA4", "Meta Ads", "Google Ads", "HubSpot CRM", "Salesforce CRM",
    "Revit", "BIM", "AutoCAD Civil 3D", "PLC", "SCADA", "ISO 14001", "HACCP", "Six Sigma",
    "Atención primaria", "Enfermería", "Farmacología", "GCP clínico", "Vigilancia epidemiológica",
  ];

  const INDUSTRIES = [
    "banca", "banco", "seguros", "aseguradora", "telecomunicaciones", "telecom", "hoteleria",
    "hotelería", "travel technology", "travel tech", "travel", "tourism", "hospitality", "retail", "salud", "farmaceutica", "farmacéutica", "fintech", "e-commerce", "ecommerce",
    "manufactura", "industrial", "energia", "energía", "petrolera", "consultoria", "consultoría", "consultora",
    "logistica", "logística", "turismo", "educacion", "educación",
    "gaming", "inmobiliario", "inmobiliaria", "real estate", "agro", "agropecuario", "mineria", "minería",
    "automotriz", "construccion", "construcción", "alimenticia", "textil",
    "ciberseguridad", "seguridad informatica", "seguridad informática", "seguridad de la informacion", "seguridad de la información",
    "bpo", "moda", "sin fines de lucro", "ong",
    "servicios financieros", "finanzas", "financiero", "mercado de capitales", "sector público", "sector publico", "gobierno",
    "recursos humanos", "rrhh", "biotecnología", "biotecnologia", "biotech", "ciencias de la vida", "farmacia",
    "construcción civil", "construccion civil", "utilities", "servicios públicos", "servicios publicos", "SaaS",
  ];

  // Common to almost every posting in their category — real, but they don't
  // discriminate a search the way a specific tool/framework/cert does.
  // Ranked last in Atributos so the technical, specific terms win the cap.
  const GENERIC_SKILLS = ["Scrum", "Kanban", "Agile", "DevOps", "QA", "Testing", "ERP", "CRM", "Excel", "Excel avanzado", "Networking", "Confluence", "SharePoint", "PowerPoint", "Asana", "Monday.com"];

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
    "jefe de proyecto": ["project manager", "jefe de proyectos", "gerente de proyecto", "coordinador de proyectos", "project coordinator", "pmo analyst"],
    "jefe de proyectos": ["project manager", "jefe de proyecto", "gerente de proyectos", "coordinador de proyectos", "project coordinator", "pmo analyst"],
    "coordinador de proyectos": ["project coordinator", "jefe de proyecto", "jefe de proyectos", "project manager"],
    "scrum master": ["agile coach", "facilitador ágil"],
    "data scientist": ["científico de datos", "analista de datos"],
    "devops": ["sre", "ingeniero de infraestructura", "platform engineer"],
    "tecnico instalador": ["técnico de campo", "field technician", "instalador de telecomunicaciones", "técnico de fibra óptica"],
    "técnico instalador": ["tecnico de campo", "field technician", "instalador de telecomunicaciones", "tecnico de fibra optica"],
    "instalador de telecomunicaciones": ["técnico instalador", "técnico de campo", "telecom field technician", "instalador de fibra óptica"],
    "tecnico de telecomunicaciones": ["técnico instalador", "telecom technician", "field technician"],
    "especialista en activos digitales": ["digital assets specialist", "digital assets consultant", "digital asset specialist", "consultor de activos digitales"],
    "digital assets specialist": ["especialista en activos digitales", "digital asset consultant", "crypto assets specialist"],
    // Search expansions are suggestions the recruiter can accept; they are
    // never silently added to the generated query.
    "qa de automatización": ["QA automation", "automation tester", "test automation engineer", "ingeniero de automatización de pruebas"],
    "automation tester": ["QA de automatización", "QA automation", "test automation engineer", "analista de pruebas automatizadas"],
    "analista qa": ["QA analyst", "quality assurance analyst", "software tester", "analista de pruebas"],
    "consultor sap": ["SAP consultant", "SAP functional consultant", "consultor funcional SAP"],
    "analista sap": ["SAP analyst", "SAP functional analyst", "consultor SAP"],
    "especialista sap": ["SAP specialist", "SAP functional consultant", "consultor SAP"],
    "consultor murex": ["Murex consultant", "Murex functional consultant", "consultor de mercados de capitales"],
    "consultor calypso": ["Calypso consultant", "Calypso functional consultant", "consultor de mercados de capitales"],
    "analista murex": ["Murex analyst", "analista funcional de mercados de capitales"],
    "analista calypso": ["Calypso analyst", "analista funcional de mercados de capitales"],
    "ingeniero ran": ["RAN engineer", "radio access network engineer", "ingeniero de acceso radio"],
    "ran engineer": ["ingeniero RAN", "radio access network engineer", "ingeniero de acceso radio"],
    "tecnico de fibra": ["fiber optic technician", "técnico FTTH", "instalador de fibra óptica"],
    "técnico de fibra": ["fiber optic technician", "técnico FTTH", "instalador de fibra óptica"],
    "noc engineer": ["ingeniero NOC", "network operations engineer", "operador de centro de operaciones de red"],
    "ingeniero noc": ["NOC engineer", "network operations engineer", "operador NOC"],
    "analista contable": ["accounting analyst", "accountant", "financial accounting analyst"],
    "contador": ["accountant", "accounting analyst", "contable"],
    "contable": ["accountant", "accounting analyst", "contador"],
    "recruiter": ["reclutador", "talent acquisition specialist", "sourcer"],
    "talent acquisition": ["recruiter", "reclutador", "especialista de selección"],
    "ejecutivo de cuentas": ["account executive", "account manager", "sales executive"],
    "account executive": ["ejecutivo de cuentas", "account manager", "sales executive"],
    "comprador": ["buyer", "procurement specialist", "especialista de compras"],
    "procurement specialist": ["comprador", "buyer", "especialista de compras"],
    "analista de logística": ["logistics analyst", "supply chain analyst", "analista de cadena de suministro"],
    "logistics analyst": ["analista de logística", "supply chain analyst", "analista de cadena de suministro"],
    "software engineer": ["ingeniero de software", "software developer", "desarrollador de software"],
    "ingeniero de software": ["software engineer", "software developer", "desarrollador de software"],
    "frontend developer": ["front-end developer", "frontend engineer", "desarrollador frontend"],
    "desarrollador frontend": ["frontend developer", "front-end developer", "frontend engineer"],
    "backend developer": ["back-end developer", "backend engineer", "desarrollador backend"],
    "desarrollador backend": ["backend developer", "back-end developer", "backend engineer"],
    "analista de datos": ["data analyst", "business intelligence analyst", "analista BI"],
    "data analyst": ["analista de datos", "business intelligence analyst", "analista BI"],
    "ingeniero de datos": ["data engineer", "analytics engineer", "ingeniero de analítica"],
    "data engineer": ["ingeniero de datos", "analytics engineer", "ingeniero de analítica"],
    "qa engineer": ["quality assurance engineer", "software tester", "analista QA"],
    "qa automation engineer": ["test automation engineer", "automation tester", "ingeniero de automatización de pruebas"],
    "analista de ciberseguridad": ["cybersecurity analyst", "security analyst", "analista de seguridad informática"],
    "cybersecurity analyst": ["analista de ciberseguridad", "security analyst", "analista de seguridad informática"],
    "security engineer": ["ingeniero de seguridad", "cybersecurity engineer", "ingeniero de ciberseguridad"],
    "ingeniero de redes": ["network engineer", "ingeniero de networking", "network administrator"],
    "network engineer": ["ingeniero de redes", "ingeniero de networking", "network administrator"],
    "radio frequency engineer": ["RF engineer", "ingeniero de radiofrecuencia", "ingeniero RF"],
    "ingeniero de radiofrecuencia": ["RF engineer", "radio frequency engineer", "ingeniero RF"],
    "field technician": ["técnico de campo", "field service technician", "técnico instalador"],
    "customer success manager": ["CSM", "gerente de éxito del cliente", "responsable de customer success"],
    "customer support specialist": ["especialista de soporte al cliente", "customer service representative", "agente de atención al cliente"],
    "enfermero": ["nurse", "registered nurse", "profesional de enfermería"],
    "enfermera": ["nurse", "registered nurse", "profesional de enfermería"],
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
    const matchedKeys = Object.keys(ROLE_SYNONYMS).filter((key) => {
      const re = new RegExp("(^|[^a-záéíóúñü0-9])" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-záéíóúñü0-9])", "i");
      return re.test(text);
    });
    const specificKeys = matchedKeys.filter((key) => !matchedKeys.some((other) => {
      if (other.length <= key.length) return false;
      const containsGenericKey = new RegExp("(^|[^a-záéíóúñü0-9])" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^a-záéíóúñü0-9])", "i");
      return containsGenericKey.test(other);
    }));
    specificKeys.forEach((key) => {
      ROLE_SYNONYMS[key].forEach((syn) => {
        if (!out.some((o) => o.toLowerCase() === syn.toLowerCase())) out.push(syn);
      });
    });
    return out;
  }

  return { SKILLS, INDUSTRIES, GENERIC_SKILLS, SENIOR_WORDS, JUNIOR_WORDS, ROLE_SYNONYMS, GH_LANGUAGES, getSynonyms };
});
