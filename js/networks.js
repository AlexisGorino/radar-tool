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
    stackoverflow: { id: "stackoverflow", label: "Stack Overflow", site: "stackoverflow.com/users", mode: "xray" },
    xing: { id: "xing", label: "Xing", site: "xing.com/profile", mode: "xray" },
    twitter: { id: "twitter", label: "X / Twitter", site: "x.com", mode: "xray" },
    wellfound: { id: "wellfound", label: "Wellfound", site: "wellfound.com/u", mode: "xray" },
    behance: { id: "behance", label: "Behance", site: "behance.net", mode: "xray" },
    resumes: { id: "resumes", label: "CVs sueltos (PDF/Word)", site: "", mode: "resumes" },
    custom: { id: "custom", label: "Otro sitio", site: "", mode: "xray" },
  };

  const NETWORK_ORDER = ["linkedin", "github", "stackoverflow", "xing", "twitter", "wellfound", "behance", "resumes", "custom"];

  return { NETWORKS, NETWORK_ORDER };
});
