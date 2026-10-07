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

  // Suggestions are based on the type of public profile each network holds.
  // They describe a useful starting point, not a claim that candidates exist.
  function recommendNetworks(state) {
    const terms = [...(state.rol || []), ...(state.imprescindibles || []), ...(state.atributos || []), ...(state.deseables || []), ...(state.dominio || [])].join(" ").toLowerCase();
    const country = (state.country || (state.alcance || [])[0] || "").toLowerCase();
    const result = [{ id: "linkedin", reason: "Perfiles profesionales de múltiples rubros" }];
    if (/developer|desarrollador|programador|software|devops|sre|data engineer|ingenier[oa] de datos|python|java|kubernetes|github|react/.test(terms)) {
      result.push({ id: "github", reason: "Actividad técnica y proyectos públicos" });
      result.push({ id: "stackoverflow", reason: "Participación técnica pública" });
    }
    if (/diseñ|disen|designer|ux|ui|figma|ilustra/.test(terms)) {
      result.push({ id: "behance", reason: "Portfolios y trabajos visuales" });
    }
    if (/alemania|austria|suiza|germany|austria|switzerland/.test(country)) {
      result.push({ id: "xing", reason: "Red profesional con foco en mercados DACH" });
    }
    result.push({ id: "resumes", reason: "CVs públicos indexados en la web" });
    return result;
  }

  return { NETWORKS, NETWORK_ORDER, recommendNetworks };
});
