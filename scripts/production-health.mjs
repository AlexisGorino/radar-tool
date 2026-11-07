const endpoints = [
  { name: "web", url: "https://alexisgorino.github.io/radar-tool/" },
  { name: "search-api", url: "https://radar-public-profile-search.alexis-gorino.workers.dev/api/health" },
];

async function fetchWithRetry(endpoint) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint.url, { signal: AbortSignal.timeout(8_000), headers: { Accept: "text/html, application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (endpoint.name === "web") {
        const html = await response.text();
        if (!html.includes("Radar Tool @")) throw new Error("la página no muestra la marca esperada");
        return "HTTP 200 · sitio disponible";
      }
      const health = await response.json();
      if (health.ready !== true) throw new Error(`servicio no listo (${String(health.error || "sin detalle")})`);
      if (health.usesSearchCredit !== false) throw new Error("la comprobación de salud no debe consumir créditos de búsqueda");
      if (!Array.isArray(health.engines) || health.engines.length < 1) throw new Error("no hay motores de búsqueda informados");
      return `API lista · ${health.engines.join(", ")}`;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error(`${endpoint.name}: ${lastError?.message || "fallo de red"}`);
}

const results = await Promise.all(endpoints.map(async (endpoint) => ({ name: endpoint.name, detail: await fetchWithRetry(endpoint) })));
for (const result of results) console.log(`OK ${result.name}: ${result.detail}`);
