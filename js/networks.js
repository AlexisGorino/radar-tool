// Searchable networks: X-Ray domain, display label, and search mode.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RadarNetworks = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const NETWORKS = {
    linkedin: { id: "linkedin", label: "LinkedIn", site: "linkedin.com/in", mode: "xray" },
    github: { id: "github", label: "GitHub", site: "github.com", mode: "native-github" },
    // looseRol: la bio de Stack Overflow/Xing no lee como un currículum —
    // nadie escribe ahí el título del puesto tal cual. Citarlo como frase
    // exacta lo mata (verificado en vivo, ver generator.js/orGroupRaw).
    stackoverflow: { id: "stackoverflow", label: "Stack Overflow", site: "stackoverflow.com/users", mode: "xray", looseRol: true },
    xing: { id: "xing", label: "Xing", site: "xing.com/profile", mode: "xray", looseRol: true },
    behance: { id: "behance", label: "Behance", site: "behance.net", mode: "xray" },
    resumes: { id: "resumes", label: "CVs sueltos (PDF/Word)", site: "", mode: "resumes" },
    custom: { id: "custom", label: "Otro sitio", site: "", mode: "xray" },
  };

  const NETWORK_ORDER = ["linkedin", "github", "stackoverflow", "xing", "behance", "resumes", "custom"];

  return { NETWORKS, NETWORK_ORDER };
});
