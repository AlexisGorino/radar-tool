describe("RADAR talent search flow", () => {
  beforeEach(() => {
    // Keep automated QA from writing usage events to the real Mindata sheet.
    cy.intercept("POST", "https://script.google.com/**", { statusCode: 200, body: "QA stub" });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        win.localStorage.setItem("radar-experience-mode-v1", "guided");
      },
    });
    cy.get("#appShell").should("be.visible");
  });

  it("requires a country for a city-only scope without consuming a search", () => {
    let searchCalls = 0;
    cy.intercept("POST", "/mock-search", (request) => {
      searchCalls += 1;
      request.reply({ statusCode: 200, body: { results: [], sourceErrors: [] } });
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('[data-field="rol"]').type("Técnico de redes{enter}");
    cy.get('[data-field="atributos"]').type("Cisco{enter}");
    cy.get('[data-field="alcance"]').type("Santiago{enter}");
    cy.get("#generateBtn").click();
    cy.get("#findProfilesBtn").should("be.enabled").click();
    cy.get("#publicSearchStatus").should("contain.text", "Completá la ciudad y el país");
    cy.then(() => expect(searchCalls).to.equal(0));
  });

  it("requires review, preserves the Canary Islands scope, and creates no more than three LinkedIn routes", () => {
    cy.get("#jdInput").type(
      "Puesto: Técnico/a instalador/a de telecomunicaciones. Requisitos excluyentes: FTTH y OTDR. Ubicación: Islas Canarias. Excel es deseable.",
      { delay: 0 }
    );
    cy.get("#analyzeBtn").click();
    cy.get("#jdReview").should("be.visible");
    cy.get("#applyJdBtn").should("be.disabled");
    cy.contains("#jdReviewQuestions button", "Sí, es este perfil").click();
    cy.contains("#jdReviewQuestions button", "Sí, usar estas señales").click();
    cy.contains("#jdReviewQuestions button", "Sí, limitar a esta ubicación").click();
    cy.get("#applyJdBtn").should("be.enabled").click();
    cy.get("#generateBtn").click();

    cy.get("#results").should("have.class", "show");
    cy.get("#out-universal").should("contain.text", "FTTH").and("contain.text", "OTDR").and("contain.text", "Canarias");
    cy.get("#out-universal").should("not.contain.text", "España");
    cy.get("#linkedinTiers a").should("have.length.at.most", 3).and("have.length.at.least", 2);
    cy.get("#linkedinTiers a").each(($link) => {
      expect(new URL($link.prop("href")).hostname).to.include("linkedin.com");
    });
  });

  it("turns an informal search idea into editable criteria and clarifies an ambiguous sector", () => {
    cy.get("#ideaModeBtn").click();
    cy.get("#jdInput").should("have.attr", "aria-label", "Idea de búsqueda escrita con tus palabras");
    cy.get("#intakeModeHint").should("contain.text", "Describilo con tus palabras.");
    cy.get("#jdInput").type("Un desarrollador con experiencia en sector travel manejando Amadeus para Buenos Aires, Argentina.", { delay: 0 });
    cy.get("#analyzeBtn").click();

    cy.get("#jdReview").should("be.visible");
    cy.get(".jd-review-role-input").should("have.value", "desarrollador");
    cy.get("#jdReviewGrid").should("contain.text", "Amadeus");
    cy.contains("#jdReviewQuestions", "¿A qué te referís con “travel”?").should("be.visible");
    cy.contains("#jdReviewQuestions button", "Obligatorio: Amadeus").click();
    cy.contains("#jdReviewQuestions button", "Plataformas de viajes").click();
    cy.contains("#jdReviewQuestions button", "Sí, es este perfil").click();
    cy.contains("#jdReviewQuestions button", "Sí, limitar a esta ubicación").click();
    cy.get("#applyJdBtn").should("be.enabled").click();

    cy.get("#chips-rol").should("contain.text", "desarrollador");
    cy.get("#chips-imprescindibles").should("contain.text", "Amadeus");
    cy.get("#chips-dominio").should("contain.text", "travel tech");
    cy.get("#generateBtn").click();
    cy.get("#out-universal").should("contain.text", "Amadeus").and("contain.text", "Buenos Aires");
  });

  it("keeps a SAP skills list out of the job-title field and flags signals beyond the query cap", () => {
    cy.get("#ideaModeBtn").click();
    cy.get("#jdInput").type([
      "Necesito buscar perfiles de:",
      "- SAP FI/CO Financials",
      "- SAP MM Material Management",
      "- SAP SD Sales",
      "- SAP HCM Recursos Humanos",
      "- Salesforce Service Cloud",
      "- Salesforce Sales Cloud",
      "- ServiceNow",
      "Certificados que vivan en Brasil",
    ].join("\n"), { delay: 0 });
    cy.get("#analyzeBtn").click();

    cy.get("#jdReview").should("be.visible");
    cy.get("#jdReviewGrid .jd-review-role-input").should("have.value", "");
    ["SAP FI", "SAP CO", "SAP MM", "SAP SD", "SAP HCM", "Salesforce Service Cloud"].forEach((term) => {
      cy.get("#jdReviewGrid").should("contain.text", term);
    });
    cy.get("#jdReviewWarning").should("contain.text", "Salesforce Sales Cloud, ServiceNow");
    cy.contains("#jdReviewQuestions", "No detectamos el cargo.").should("be.visible");
    cy.get("#jdReviewGrid").should("contain.text", "Brasil");
  });

  it("boots the search flow on the pinned Angular 21 runtime", () => {
    cy.get("radar-root").should("have.attr", "ng-version", "21.2.25");
    cy.get("#radarBootError").should("not.exist");
    cy.get("#jdReview").should("not.be.visible");
    cy.get("#jdInput").should("be.visible");
    cy.get("html").should("have.attr", "data-radar-ready", "true");
    cy.window().then((win) => {
      const versionedLegacyScripts = win.performance.getEntriesByType("resource").filter((entry) => {
        const url = new URL(entry.name);
        return url.pathname.endsWith("/js/app.js") && url.searchParams.has("v");
      });
      expect(versionedLegacyScripts, "legacy app script has a build-specific cache key").to.have.length(1);
    });
  });

  it("saves a Gemini key and confirms model access without sending a JD", () => {
    cy.intercept("GET", "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash", (request) => {
      expect(request.url).not.to.include("AIza-qa-secret");
      expect(request.headers["x-goog-api-key"]).to.equal("AIza-qa-secret");
      request.reply({ statusCode: 200, body: { name: "models/gemini-3.8-flash" } });
    }).as("geminiModelCheck");
    cy.get("#aiSettingsBtn").click();
    cy.get("#aiKeyInput").type("AIza-qa-secret");
    cy.get("#saveAiKeyBtn").click();
    cy.get("#aiKeyInput").should("have.value", "");
    cy.get("#testAiKeyBtn").click();
    cy.wait("@geminiModelCheck");
    cy.get("#aiKeyHint").should("contain.text", "Conexión correcta");
    cy.window().its("localStorage.radar-gemini-key-v1").should("equal", "AIza-qa-secret");
  });

  it("explains when Google rejects the Gemini key", () => {
    cy.intercept("GET", "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash", {
      statusCode: 403,
      body: { error: { message: "API key not valid" } },
    }).as("geminiKeyRejected");
    cy.get("#aiSettingsBtn").click();
    cy.get("#aiKeyInput").type("AIza-bad-key");
    cy.get("#saveAiKeyBtn").click();
    cy.get("#testAiKeyBtn").click();
    cy.wait("@geminiKeyRejected");
    cy.get("#aiKeyHint").should("contain.text", "Gemini rechazó la API key");
  });

  it("analyzes a job description through the Gemini review button", () => {
    const jd = "Buscamos QA Analyst con Cypress en Córdoba, Argentina. Excel es deseable.";
    let attempts = 0;
    const analysis = {
      isJobPosting: true,
      jobEvidence: "Buscamos QA Analyst",
      role: { term: "QA Analyst", evidence: "Buscamos QA Analyst" },
      roleAlternatives: ["Analista QA"],
      requiredSkills: [{ term: "Cypress", evidence: "con Cypress" }],
      preferredSkills: [{ term: "Excel", evidence: "Excel es deseable" }],
      industries: [],
      locations: [{ country: "Argentina", locality: "Córdoba", evidence: "en Córdoba, Argentina" }],
      seniority: { term: "", evidence: "" },
      modality: { term: "", evidence: "" },
    };
    cy.intercept("POST", "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", (request) => {
      attempts++;
      expect(request.headers["x-goog-api-key"]).to.equal("AIza-qa-secret");
      expect(request.url).not.to.include("AIza-qa-secret");
      expect(request.body.contents[0].parts[0].text).to.include(jd);
      expect(request.body.generationConfig.responseMimeType).to.equal("application/json");
      if (attempts === 1) {
        request.reply({ statusCode: 503, body: { error: { message: "Service temporarily unavailable" } } });
        return;
      }
      request.reply({ body: { candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] } });
    }).as("geminiAnalyzeJD");
    cy.window().then((win) => win.localStorage.setItem("radar-gemini-key-v1", "AIza-qa-secret"));
    cy.reload();
    cy.get("#jdInput").type(jd, { delay: 0 });
    cy.get("#analyzeBtn").click();
    cy.get("#aiAnalyzeJdBtn").should("be.visible").click();
    cy.wait("@geminiAnalyzeJD");
    cy.wait("@geminiAnalyzeJD");
    cy.then(() => expect(attempts).to.equal(2));
    cy.get("#jdReviewAiStatus").should("contain.text", "Análisis actualizado");
    cy.contains("#jdReviewQuestions button", "Sí, es este perfil").click();
    cy.contains("#jdReviewQuestions button", "Sí, usar estas señales").click();
    cy.contains("#jdReviewQuestions button", "Sí, limitar a esta ubicación").click();
    cy.get("#applyJdBtn").click();
    cy.get("#chips-rol").should("contain.text", "QA Analyst");
    cy.get("#chips-atributos").should("contain.text", "Cypress");
    cy.get("#chips-alcance").should("contain.text", "Argentina").and("contain.text", "Córdoba");
  });

  it("keeps optional filters and extra portals out of the first view", () => {
    cy.get("#welcomeTitle").should("contain.text", "Encontrá el perfil que necesitás.");
    cy.get('label[for="jdInput"]').should("contain.text", "Descripción del puesto");
    cy.get('label[for="roleInput"]').should("contain.text", "Cargo o familia");
    cy.get('label[for="signalsInput"]').should("contain.text", "Conocimientos o tareas");
    cy.get('label[for="requiredInput"]').should("contain.text", "Obligatorios · deben coincidir todos");
    cy.contains(".field-desc", "Alternativas: alcanza con que coincida una").should("be.visible");
    cy.get(".required-help").should("contain.text", "todos deben cumplirse");
    cy.get("#generateBtn").should("contain.text", "Ver búsquedas");
    cy.get("#advancedCriteria").should("not.have.attr", "open");
    cy.get('[data-field="deseables"]').should("not.be.visible");
    cy.get('[data-field="refinar"]').should("not.be.visible");
    cy.get("#moreNetworks").should("not.have.attr", "open");
    cy.get("#networkTabs").should("not.be.visible");
    cy.get("#networkOptionsCard").should("not.be.visible");
    cy.get("#advancedCriteria > summary").click();
    cy.get('[data-field="deseables"]').should("be.visible");
    cy.get('[data-field="rol"]').type("Analista de datos{enter}");
    cy.get('[data-field="atributos"]').type("SQL{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#networkOptionsCard").should("be.visible");
    cy.get("#moreNetworks").should("not.have.attr", "open");
    cy.get("#moreNetworks > summary").click();
    cy.get("#networkTabs").should("be.visible");
  });

  it("offers a guided route and an expert route without changing the search criteria", () => {
    cy.get("#appShell").should("have.attr", "data-experience-mode", "guided");
    cy.get("#experienceModeHint").should("contain.text", "Describí · 2. Revisá · 3. Buscá");
    cy.get("#expertModeBtn").click();
    cy.get("#appShell").should("have.attr", "data-experience-mode", "expert");
    cy.get("#expertModeBtn").should("have.attr", "aria-pressed", "true");
    cy.get("#advancedCriteria").should("not.have.attr", "open");
    cy.get('[data-field="rol"]').should("be.visible");
    cy.get('[data-field="deseables"]').should("not.be.visible");
    cy.get("#ideaModeBtn").click();
    cy.get("#jdInput").type("QA con Playwright en Barcelona{enter}");
    cy.get("#guidedModeBtn").click();
    cy.get("#appShell").should("have.attr", "data-experience-mode", "guided");
    cy.get("#advancedCriteria").should("not.have.attr", "open");
    cy.get("#jdInput").should("have.value", "QA con Playwright en Barcelona\n");
    cy.window().its("localStorage.radar-experience-mode-v1").should("equal", "guided");
  });

  it("takes a junior recruiter from a plain-language QA brief to a relevant, location-matched shortlist", () => {
    cy.intercept("POST", "/mock-search", (request) => {
      expect(request.body.location).to.equal("España, Barcelona");
      expect(request.body.queries.map((query) => query.source)).to.deep.equal(["linkedin"]);
      expect(request.body.queries[0].query).to.include("Playwright");
      request.reply({
        statusCode: 200,
        body: {
          count: 2,
          sourceErrors: [],
          results: [
            { source: "linkedin", url: "https://linkedin.com/in/lucia-perez", title: "Lucía Pérez - QA Automation Engineer - LinkedIn", snippet: "Playwright · Barcelona, España", position: 1 },
            { source: "linkedin", url: "https://linkedin.com/in/marta-ruiz", title: "Marta Ruiz - QA Engineer - LinkedIn", snippet: "Cypress · Barcelona, España", position: 2 },
          ],
        },
      });
    }).as("juniorRecruiterSearch");
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "Junior" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get("#ideaModeBtn").click();
    cy.get("#jdInput").type("Busco QA con Playwright en Barcelona, España.", { delay: 0 });
    cy.get("#analyzeBtn").click();
    cy.contains("#jdReviewQuestions", "¿Buscás QA?").should("be.visible");
    cy.contains("#jdReviewQuestions button", "Sí, es este perfil").click();
    cy.contains("#jdReviewQuestions button", "Sí, usar estas señales").click();
    cy.contains("#jdReviewQuestions button", "Sí, limitar a esta ubicación").click();
    cy.get("#applyJdBtn").should("be.enabled").click();
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="github"]').should("not.be.checked");
    cy.get('#publicSearchSources input[value="linkedin"]').should("be.checked");
    cy.get("#findProfilesBtn").should("be.enabled").click();
    cy.wait("@juniorRecruiterSearch");
    cy.get(".public-profile-card").should("have.length", 2);
    cy.get(".public-profile-card").eq(0).should("contain.text", "Lucía Pérez").and("contain.text", "Playwright");
    cy.get(".public-profile-card").eq(1).should("contain.text", "Marta Ruiz").and("contain.text", "Señales de apoyo visibles 0/1");
    cy.get("#publicSearchStatus").should("contain.text", "2 perfiles").and("contain.text", "ubicación confirmada");
  });

  it("lets an expert build a strict SAP Boolean and sends module equivalents to the shortlist", () => {
    cy.intercept("POST", "/mock-search", (request) => {
      expect(request.body.location).to.equal("Argentina, Buenos Aires");
      expect(request.body.queries.map((query) => query.source)).to.deep.equal(["linkedin"]);
      expect(request.body.queries[0].query).to.include("Consultor SAP FI/CO").and.to.include("SAP FI/CO Consultant").and.to.include("Buenos Aires");
      request.reply({
        statusCode: 200,
        body: {
          count: 1,
          sourceErrors: [],
          results: [{ source: "linkedin", url: "https://linkedin.com/in/gustavo-martinez", title: "Gustavo Martínez - SAP FI/CO Consultant - LinkedIn", snippet: "SAP FI · SAP CO · Buenos Aires, Argentina", position: 1 }],
        },
      });
    }).as("expertSapSearch");
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "Expert" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get("#expertModeBtn").click();
    cy.get('[data-field="rol"]').type("Consultor SAP FI/CO{enter}");
    cy.get('[data-field="imprescindibles"]').type("SAP FI{enter}");
    cy.get('[data-field="atributos"]').type("SAP CO{enter}");
    cy.get('[data-field="atributos"]').type("S/4HANA{enter}");
    cy.get("#advancedCriteria > summary").click();
    cy.get('[data-field="dominio"]').type("banca{enter}");
    cy.get("#countrySelect").select("Argentina");
    cy.get('[data-field="alcance"]').type("Buenos Aires{enter}");
    cy.get("#readinessProfile").should("contain.text", "Configurado");
    cy.get("#readinessLocation").should("contain.text", "Configurada");
    cy.get("#generateBtn").click();
    cy.get("#out-universal").should("contain.text", "Consultor SAP FI/CO").and("contain.text", "SAP FI").and("contain.text", "Buenos Aires");
    cy.get("#linkedinTiers a").should("have.length.at.most", 3);
    cy.get('#publicSearchSources input[value="linkedin"]').should("be.checked");
    cy.get("#findProfilesBtn").should("be.enabled").click();
    cy.wait("@expertSapSearch");
    cy.get(".public-profile-card").should("have.length", 1).and("contain.text", "Gustavo Martínez").and("contain.text", "SAP FI");
  });

  it("puts the shortlist before the manual search routes", () => {
    cy.get('[data-field="rol"]').type("QA{enter}");
    cy.get('[data-field="atributos"]').type("Playwright{enter}");
    cy.get('[data-field="alcance"]').type("Barcelona{enter}");
    cy.get("#countrySelect").select("España");
    cy.get("#generateBtn").click();
    cy.get("#publicSearchSetup").should("be.visible");
    cy.get("#resultHero").should("be.visible");
    cy.get("#publicSearchSetup").then(($shortlist) => {
      cy.get("#resultHero").then(($manualSearch) => {
        expect($shortlist[0].compareDocumentPosition($manualSearch[0]) & Node.DOCUMENT_POSITION_FOLLOWING).to.be.greaterThan(0);
      });
    });
    cy.get("#publicSearchTitle").should("contain.text", "Lista de perfiles para revisar");
  });

  it("explains when recognizable profile links lack enough public evidence to qualify", () => {
    cy.intercept("POST", "/mock-search", {
      statusCode: 200,
      body: {
        count: 1,
        sourceErrors: [],
        sourceDiagnostics: [{ source: "linkedin", status: "profiles_found", organicCount: 10, profileCount: 1, code: null }],
        results: [{ source: "linkedin", url: "https://linkedin.com/in/camila-qa", title: "Camila QA - QA Automation Engineer - LinkedIn", snippet: "Playwright · test automation", position: 1 }],
      },
    }).as("incompleteEvidenceSearch");
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("QA Automation Engineer{enter}");
    cy.get('[data-field="imprescindibles"]').type("Playwright{enter}");
    cy.get('[data-field="alcance"]').type("Barcelona{enter}");
    cy.get("#countrySelect").select("España");
    cy.get("#generateBtn").click();
    cy.get("#findProfilesBtn").click();
    cy.wait("@incompleteEvidenceSearch");
    cy.get(".public-profile-card").should("not.exist");
    cy.get(".public-search-no-match-context").should("contain.text", "encontró 1 enlaces").and("contain.text", "no alcanza para confirmar los requisitos y la ubicación");
    cy.get(".public-search-diagnostics").should("contain.text", "1 enlaces de perfil reconocibles");
  });

  it("updates the readiness checklist as the recruiter clarifies the profile", () => {
    cy.get("#readinessProfile").should("contain.text", "Incompleto");
    cy.get("#readinessLocation").should("contain.text", "Falta ubicación");
    cy.get("#readinessJd").should("contain.text", "Manual");
    cy.get(".hint.guided-only").should("contain.text", "Enter agrega cada criterio");

    cy.get('[data-field="rol"]').type("Analista de datos{enter}");
    cy.get('[data-field="atributos"]').type("SQL{enter}");
    cy.get("#readinessProfile").should("contain.text", "Configurado").and("contain.text", "Analista de datos");

    cy.get('[data-field="alcance"]').type("Valencia{enter}");
    cy.get("#readinessLocation").should("contain.text", "Revisar").and("contain.text", "agregá también el país");
    cy.get("#countrySelect").select("España");
    cy.get("#readinessLocation").should("contain.text", "Configurada").and("contain.text", "España");

    cy.get("#jdInput").type("Buscamos una persona para el equipo de datos.", { delay: 0 });
    cy.get("#readinessJd").should("contain.text", "Revisar");
    cy.get("#analyzeBtn").click();
    cy.get("#jdReview").should("be.visible");
    cy.get("#readinessJd").should("contain.text", "Revisar");
  });

  it("shows the precise shortlist rules in the published Angular UI", () => {
    cy.get("#publicSearchSetup").should("not.be.visible");
    cy.get("html").should("have.attr", "data-radar-ready", "true");
    cy.get("#countrySelect option").should("not.contain.text", "Chile");
    cy.get('[data-field="rol"]').type("Analista de datos{enter}");
    cy.get('[data-field="atributos"]').type("SQL{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#publicSearchSetup").should("be.visible");
    cy.get("#publicSearchSetup").should("contain.text", "Hasta 20 · LinkedIn + GitHub");
    cy.get("#publicSearchSetup").should("contain.text", "el cargo y la localidad");
    cy.get('#publicSearchSources input').should("have.length", 2);
    cy.get("#publicSearchSources").should("contain.text", "LinkedIn").and("contain.text", "GitHub");
  });

  it("explains when GitHub is not a useful source for a nontechnical profile", () => {
    let searchCalls = 0;
    cy.intercept("POST", "/mock-search", (request) => {
      searchCalls += 1;
      request.reply({ statusCode: 200, body: { results: [], sourceErrors: [] } });
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').uncheck();
    cy.get('#publicSearchSources input[value="github"]').check();
    cy.get("#findProfilesBtn").click();
    cy.get("#publicSearchStatus").should("contain.text", "GitHub sirve para perfiles técnicos");
    cy.then(() => expect(searchCalls).to.equal(0));
  });

  it("keeps the public-profile search disabled until its server endpoint is configured", () => {
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "");
    cy.get('[data-field="rol"]').type("Analista de datos{enter}");
    cy.get('[data-field="atributos"]').type("SQL{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#publicSearchSetup").should("be.visible");
    cy.get("#findProfilesBtn").should("be.disabled");
    cy.get("#publicSearchConfigNote").should("contain.text", "Servicio no configurado");
  });

  it("checks provider readiness without spending a search credit", () => {
    let paidSearchCalls = 0;
    cy.intercept("GET", "/mock-search/health", { statusCode: 200, body: { ready: true, error: null, usesSearchCredit: false } });
    cy.intercept("POST", "/mock-search", () => { paidSearchCalls += 1; });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de datos{enter}");
    cy.get('[data-field="imprescindibles"]').type("SQL{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#checkProfilesConnectionBtn").should("be.enabled").click();
    cy.get("#publicSearchStatus").should("contain.text", "prueba no consumió búsquedas");
    cy.then(() => expect(paidSearchCalls).to.equal(0));
  });

  it("builds a public-profile shortlist, preserves the selected locality, and labels missing evidence", () => {
    cy.intercept("POST", "/mock-search", (request) => {
      expect(request.body.location).to.equal("España, Islas Canarias");
      expect(request.body.maxResults).to.equal(20);
      expect(request.body.queries.map((query) => query.source)).to.include("linkedin");
      expect(request.body.queries.map((query) => query.source)).to.include("github");
      expect(request.body.queries.find((query) => query.source === "github").query).to.equal('type:user language:Python location:"Islas Canarias"');
      request.reply({
        statusCode: 200,
        body: {
          count: 24,
          locationContext: { mode: "provider_location", canonicalName: "Canary Islands,Spain", countryCode: "ES" },
          sourceErrors: [{ source: "github", code: "source_unavailable" }],
          results: [
            ...Array.from({ length: 22 }, (_, index) => ({
              source: "linkedin",
              url: `https://www.linkedin.com/in/candidate-${index + 1}`,
              title: `${index === 0 ? "Ana Pérez" : `Perfil Candidato ${index + 1}`} - Telecom Technician - LinkedIn`,
              snippet: "FTTH, OTDR. Islas Canarias, España.",
              position: index + 1,
            })),
            { source: "linkedin", url: "https://www.linkedin.com/in/juan-gomez", title: "Juan Gómez - Technician - LinkedIn", snippet: "Telecomunicaciones · España", position: 23 },
            { source: "linkedin", url: "https://www.linkedin.com/jobs/view/123", title: "Oferta laboral - LinkedIn", snippet: "FTTH Islas Canarias", position: 24 },
          ],
        },
      });
    });

    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Técnico instalador{enter}");
    cy.get('[data-field="imprescindibles"]').type("FTTH{enter}");
    cy.get('[data-field="imprescindibles"]').type("OTDR{enter}");
    cy.get('[data-field="atributos"]').type("Python{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");
    cy.get('[data-field="alcance"]').type("Islas Canarias{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="github"]').check();
    cy.get("#findProfilesBtn").should("be.enabled").click();
    cy.get(".public-profile-card").should("have.length", 20);
    cy.get(".public-search-results-heading").should("contain.text", "20 perfiles públicos para revisar");
    cy.get(".public-profile-rank").first().should("have.text", "01");
    cy.get(".public-profile-rank").last().should("have.text", "20");
    cy.get(".public-profile-score").first().should("contain.text", "/100");
    cy.get(".public-profile-details summary").first().click();
    cy.get(".public-profile-details[open]").should("contain.text", "Coincidencias");
    cy.contains("Ana Pérez").should("be.visible");
    cy.contains("Localidad y país visibles").should("be.visible");
    cy.get(".public-profile-card").should("not.contain.text", "Juan Gómez");
    cy.get(".public-profile-card a").each(($link) => {
      expect(new URL($link.prop("href")).hostname).to.equal("www.linkedin.com");
    });
    cy.get("#publicSearchStatus").should("contain.text", "Resultado parcial: 20 perfiles");
    cy.get("#publicSearchResults").should("contain.text", "Búsqueda en Canary Islands,Spain");
    cy.get("#publicSearchResults").should("contain.text", "No respondió GitHub");
    cy.get(".public-search-next-actions").should("contain.text", "Seguí con otras rutas");
    cy.get(".public-search-next-actions a").should("have.attr", "href", "#results");
    cy.get("#publicSearchSources input").should("have.length", 2);
  });

  it("shares only selected public profile links and keeps WhatsApp messages within the supported selection", () => {
    cy.intercept("POST", "/mock-search", {
      statusCode: 200,
      body: {
        count: 9,
        sourceErrors: [],
        results: Array.from({ length: 9 }, (_, index) => ({
          source: "linkedin",
          url: `https://linkedin.com/in/candidate-${index + 1}`,
          title: `Candidate ${index + 1} - Telecom Technician - LinkedIn`,
          snippet: "FTTH Islas Canarias, España",
          position: index + 1,
        })),
      },
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
        cy.stub(win, "open").as("shareWindow");
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Técnico instalador{enter}");
    cy.get('[data-field="atributos"]').type("FTTH{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");
    cy.get('[data-field="alcance"]').type("Islas Canarias{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').check();
    cy.get("#findProfilesBtn").click();
    cy.get(".public-profile-card").should("have.length", 9);
    cy.get("#shareProfilesWhatsappBtn").should("be.disabled");
    cy.get("#publicShareSelectAll").check();
    cy.get("#publicShareSelectionCount").should("have.text", "9 seleccionados");
    cy.get("#publicShareHint").should("contain.text", "hasta 8 perfiles");
    cy.get(".public-profile-share-checkbox").last().uncheck();
    cy.get("#shareProfilesWhatsappBtn").should("be.enabled").click();
    cy.get("@shareWindow").should("have.been.calledOnce").then((shareWindow) => {
      const target = shareWindow.firstCall.args[0];
      expect(target).to.include("https://wa.me/?text=");
      const message = new URL(target).searchParams.get("text");
      expect(message).to.include("candidate-1");
      expect(message).not.to.include("candidate-9");
      expect(message).to.include("no determina idoneidad");
    });
    cy.get("#shareProfilesEmailBtn").click();
    cy.get("@shareWindow").should("have.been.calledTwice").then((shareWindow) => {
      const target = shareWindow.secondCall.args[0];
      expect(target).to.include("mailto:");
      const body = new URL(target).searchParams.get("body");
      expect(body).to.include("candidate-1");
      expect(body).not.to.include("candidate-9");
    });
  });

  it("shows city-only LinkedIn leads for review without presenting interest as residence", () => {
    cy.intercept("POST", "/mock-search", {
      statusCode: 200,
      body: {
        count: 3,
        sourceErrors: [],
        results: [
          { source: "linkedin", url: "https://linkedin.com/in/barcelona-qa", title: "Lucia Sanchez - QA Automation Engineer", snippet: "Playwright · TypeScript · Barcelona", position: 1 },
          { source: "linkedin", url: "https://linkedin.com/in/open-to-barcelona", title: "Kseniya Cherasheva - Senior QA Engineer", snippet: "Playwright · Open to Barcelona", position: 2 },
          { source: "linkedin", url: "https://linkedin.com/in/verified-barcelona", title: "Maria Villar Romero - QA Engineer", snippet: "Playwright · Barcelona, Cataluña, España", position: 3 },
        ],
      },
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("QA Engineer{enter}");
    cy.get('[data-field="atributos"]').type("Playwright{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");
    cy.get('[data-field="alcance"]').type("Barcelona{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').check();
    cy.get("#findProfilesBtn").click();
    cy.get(".public-profile-card").should("have.length", 2);
    cy.get(".public-search-location-review").should("contain.text", "no confirma el país");
    cy.get(".public-profile-card").should("contain.text", "Localidad mencionada; país y residencia por confirmar");
    cy.get(".public-profile-card").should("not.contain.text", "Kseniya Cherasheva");
    cy.get(".public-profile-share-checkbox").should("have.length", 1);
    cy.get(".public-profile-card").contains("Lucia Sanchez").parents(".public-profile-card")
      .should("contain.text", "Localidad mencionada; país y residencia por confirmar");
    cy.get(".public-profile-card").contains("Maria Villar Romero").parents(".public-profile-card")
      .should("contain.text", "Localidad y país visibles");
  });

  it("suggests a deliberate broader search after no results and keeps hard requirements and locality", () => {
    const sentQueries = [];
    cy.intercept("POST", "/mock-search", (request) => {
      sentQueries.push(request.body.queries[0].query);
      request.reply({ statusCode: 200, body: { count: 0, results: [], sourceErrors: [] } });
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Jefe de Proyecto{enter}");
    cy.get('[data-field="imprescindibles"]').type("MS Project{enter}");
    cy.get('[data-field="atributos"]').type("Jira{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");
    cy.get('[data-field="alcance"]').type("Santiago de Compostela{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').check();
    cy.get("#findProfilesBtn").click();
    cy.get("#publicSearchRefine").should("be.visible").and("contain.text", "Conserva ubicación y obligatorias");
    cy.get("#broadenPublicSearchBtn").click();
    cy.then(() => {
      expect(sentQueries).to.have.length(2);
      expect(sentQueries[0]).to.match(/Jefe de Proyecto/i);
      expect(sentQueries[1]).not.to.match(/Jefe de Proyecto|Project Manager/i);
      expect(sentQueries[1]).to.match(/Santiago de Compostela/i);
      expect(sentQueries[1]).to.match(/MS Project/i);
    });
    cy.get("#publicSearchRefine").should("be.visible").and("contain.text", "Quita cargo y sector");
    cy.get("#broadenPublicSearchBtn").should("contain.text", "Ampliar sin cargo ni sector");
    cy.get("#publicSearchSources").should("contain.text", "Perfiles técnicos con actividad pública");
    cy.get("#broadenPublicSearchBtn").click();
    cy.get(".public-search-next-questions").should("be.visible").and("contain.text", "¿Qué querés ajustar?");
    cy.get(".public-search-next-questions").contains("¿El cargo puede tener otro nombre?").click();
    cy.get('[data-field="rol"]').should("be.focused");
    cy.then(() => expect(sentQueries).to.have.length(3));
  });

  it("hides stale expansion advice when a broader search fails", () => {
    let requestCount = 0;
    cy.intercept("POST", "/mock-search", (request) => {
      requestCount += 1;
      if (requestCount === 1) {
        request.reply({ statusCode: 200, body: { count: 0, results: [], sourceErrors: [] } });
      } else {
        request.reply({ statusCode: 502, body: { error: "sources_unavailable", sourceErrors: [{ source: "linkedin", code: "provider_timeout" }] } });
      }
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').check();
    cy.get("#findProfilesBtn").click();
    cy.get("#publicSearchRefine").should("be.visible");
    cy.get("#broadenPublicSearchBtn").click();
    cy.get(".public-search-error").should("contain.text", "tardó demasiado");
    cy.get("#publicSearchRefine").should("not.be.visible");
    cy.get(".public-search-empty").should("not.exist");
  });

  it("offers a source-only retry and a deliberate widening after a partial empty response", () => {
    const plans = [];
    cy.intercept("POST", "/mock-search", (request) => {
      plans.push(request.body);
      if (plans.length === 1) {
        request.reply({
          statusCode: 200,
          body: {
            count: 0,
            results: [],
            sourceErrors: [{ source: "linkedin", code: "provider_timeout" }],
            sourceDiagnostics: [
              { source: "linkedin", status: "error", organicCount: 0, profileCount: 0, code: "provider_timeout" },
              { source: "github", status: "no_indexed_results", organicCount: 0, profileCount: 0, code: null },
            ],
          },
        });
        return;
      }
      request.reply({
        statusCode: 200,
        body: {
          count: 1,
          results: [{ source: "linkedin", url: "https://www.linkedin.com/in/ana-perez", title: "Ana Pérez - Recruiter", snippet: "Recruiting · reclutamiento · Argentina", position: 1 }],
          sourceErrors: [],
          sourceDiagnostics: [{ source: "linkedin", status: "profiles_found", organicCount: 12, profileCount: 1, code: null, engines: ["Google", "Brave"], providerErrors: [{ provider: "Google", code: "provider_timeout" }] }],
        },
      });
    }).as("partialSearch");
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').check();
    cy.get('#publicSearchSources input[value="github"]').check();
    cy.get("#findProfilesBtn").click();
    cy.get(".public-search-diagnostics").should("contain.text", "El proveedor agotó el tiempo de espera");
    cy.get(".public-search-diagnostics").should("contain.text", "Sin resultados indexados");
    cy.wait("@partialSearch");
    cy.get(".public-search-retry").should("contain.text", "LinkedIn").click();
    cy.wait("@partialSearch").then(() => {
      expect(plans).to.have.length(2);
      expect(plans[1].queries.map((query) => query.source)).to.deep.equal(["linkedin"]);
    });
    cy.get(".public-profile-card").should("have.length", 1);
    cy.get(".public-search-diagnostics").should("contain.text", "Google + Brave").and("contain.text", "Google agotó el tiempo de espera");
    cy.get("#publicSearchRefine").should("be.visible");
  });

  it("offers a broader search even when an earlier source failed", () => {
    cy.intercept("POST", "/mock-search", {
      statusCode: 200,
      body: { count: 0, results: [], sourceErrors: [{ source: "linkedin", code: "provider_timeout" }] },
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get('#publicSearchSources input[value="linkedin"]').check();
    cy.get("#findProfilesBtn").click();
    cy.get("#publicSearchRefine").should("be.visible");
    cy.get("#publicSearchStatus").should("contain.text", "Respuesta parcial");
    cy.get(".public-search-empty").should("contain.text", "Las que fallaron quedan pendientes");
  });

  it("shows an actionable limit message when the public search provider rate-limits a request", () => {
    cy.intercept("POST", "/mock-search", { statusCode: 429, body: { error: "rate_limited" } });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#findProfilesBtn").should("be.enabled").click();
    cy.get(".public-search-error").should("contain.text", "límite temporal");
    cy.get(".public-search-error").should("contain.text", "No se reintenta automáticamente para cuidar el cupo");
    cy.get(".public-search-fallback").should("contain.text", "no consume consultas de SerpApi");
    cy.get(".public-search-fallback a").should("have.length.at.least", 2);
    cy.get("#findProfilesBtn").should("be.enabled");
  });

  it("explains how to continue when the free monthly search quota is exhausted", () => {
    cy.intercept("POST", "/mock-search", {
      statusCode: 429,
      body: { error: "free_quota_exhausted" },
    });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#findProfilesBtn").click();
    cy.get(".public-search-error").should("contain.text", "Se agotó el cupo gratuito de LinkedIn");
    cy.get(".public-search-error").should("contain.text", "se renueva cada mes");
    cy.get(".public-search-fallback").should("contain.text", "no consume consultas de SerpApi");
    cy.get(".public-search-fallback a").should("contain.text", "Abrir Google X-Ray");
    cy.get("#findProfilesBtn").should("be.enabled");
  });

  it("distinguishes a source failure from a completed search with no matches", () => {
    cy.intercept("POST", "/mock-search", {
      statusCode: 502,
      body: { error: "sources_unavailable", sourceErrors: [{ source: "linkedin", code: "provider_timeout" }] },
    }).as("failedPublicSearch");
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const endpoint = win.document.querySelector('meta[name="radar-search-endpoint"]');
        if (endpoint) endpoint.content = "/mock-search";
      },
    });
    cy.get('meta[name="radar-search-endpoint"]').invoke("attr", "content", "/mock-search");
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.get("#findProfilesBtn").click();
    cy.wait("@failedPublicSearch");
    cy.get(".public-search-error").should("contain.text", "tardó demasiado en responder");
    cy.get(".public-search-error").should("contain.text", "No se reintenta automáticamente para cuidar el cupo");
    cy.get(".public-search-fallback a").should("contain.text", "Abrir Google X-Ray");
    cy.get(".public-search-empty").should("not.exist");
  });

  it("shows a recoverable message when a legacy module fails to load", () => {
    cy.intercept("GET", "**/js/app.js?v=*", { forceNetworkError: true });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
      },
    });
    cy.get("#radarBootError").should("be.visible").and("contain.text", "No pudimos iniciar");
    cy.get("#radarBootRetry").should("be.visible").and("contain.text", "Reintentar");
  });

  it("blocks vague manual searches until role signals and geography are entered", () => {
    cy.get("#generateBtn").click();
    cy.get("#generateBtn + .inline-error").should("contain.text", "Sin título");
    cy.get('[data-field="rol"]').type("Recepcionista{enter}");
    cy.get('[data-field="atributos"]').type("atención al cliente{enter}");
    cy.get("#advancedCriteria").then(($details) => {
      if (!$details.prop("open")) cy.wrap($details).find("summary").click();
    });
    cy.get('[data-field="dominio"]').type("retail{enter}");
    cy.get('[data-field="alcance"]').type("Rosario{enter}");
    cy.get("#generateBtn").click();
    cy.get("#out-universal").should("contain.text", "Recepcionista").and("contain.text", "atención al cliente").and("contain.text", "Rosario");
    cy.get("#out-universal").should("contain.text", "retail");
    cy.get("#relaxedModeCheckbox").check();
    cy.get("#out-universal").should("contain.text", "Rosario").and("not.contain.text", "retail");
  });

  it("records only anonymous per-source outcome counts in local storage", () => {
    cy.get('[data-field="rol"]').type("Analista de selección{enter}");
    cy.get('[data-field="atributos"]').type("reclutamiento{enter}");
    cy.get('[data-field="alcance"]').type("Argentina{enter}");
    cy.get("#generateBtn").click();
    cy.contains("#outcomePanel button", "Encontré perfiles útiles").click();
    cy.window().then((win) => {
      const saved = JSON.parse(win.localStorage.getItem("radar-outcomes-v1"));
      expect(saved).to.deep.equal({ linkedin: { relevant: 1, noisy: 0, empty: 0 } });
    });
  });

  it("separates required signals, alternatives, and desirables across search routes", () => {
    cy.get('[data-field="rol"]').type("QA Engineer{enter}");
    cy.get('[data-field="atributos"]').type("Selenium{enter}");
    cy.get("#chips-atributos").contains("button", "!").click();
    cy.get("#chips-imprescindibles").should("contain.text", "Selenium");
    cy.get('[data-field="atributos"]').type("Cypress{enter}");
    cy.get("#advancedCriteria").then(($details) => {
      if (!$details.prop("open")) cy.wrap($details).find("summary").click();
    });
    cy.get('[data-field="deseables"]').type("Playwright{enter}");
    cy.get('[data-field="dominio"]').type("retail{enter}");
    cy.get('[data-field="alcance"]').type("Rosario{enter}");
    cy.get("#generateBtn").click();

    cy.get("#out-universal").should("contain.text", "Selenium").and("contain.text", "Cypress").and("not.contain.text", "Playwright");
    cy.contains("#linkedinTiers a", "2 · Equilibrada").should("contain.text", "deseable");
    cy.get("#linkedinTiers a").eq(1).should(($route) => {
      const query = decodeURIComponent(new URL($route.prop("href")).searchParams.get("keywords"));
      expect(query).to.include("Selenium");
      expect(query).to.include("Playwright");
      expect(query).to.include("Rosario");
    });
    cy.get("#relaxedModeCheckbox").check();
    cy.get("#out-universal").should("contain.text", "Selenium").and("contain.text", "Playwright").and("contain.text", "Rosario").and("not.contain.text", "retail");
  });

  it("keeps the compact QA title family, Playwright, and exact city across sourcing routes", () => {
    cy.get('[data-field="rol"]').type("QA Engineer{enter}");
    cy.get('[data-field="atributos"]').type("Playwright{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");
    cy.get('[data-field="alcance"]').type("Barcelona{enter}");
    cy.get("#generateBtn").click();

    cy.get("#out-universal")
      .should("contain.text", "QA Engineer")
      .and("contain.text", "QA Automation Engineer")
      .and("contain.text", "Playwright")
      .and("contain.text", "Barcelona")
      .and("not.contain.text", "Software Test Engineer");
    cy.get("#linkedinTiers a").first().should(($route) => {
      const query = decodeURIComponent(new URL($route.prop("href")).searchParams.get("keywords"));
      expect(query).to.include('("QA Engineer" OR "QA Automation Engineer")');
      expect(query).to.include("Playwright");
      expect(query).to.include("Barcelona");
      expect(query).not.to.include("Software Test Engineer");
    });
    cy.get("#out-xray").should("contain.text", "QA Automation Engineer").and("contain.text", "Playwright").and("contain.text", "Barcelona").and("not.contain.text", "Software Test Engineer");
  });

  it("routes LinkedIn, GitHub, X-Ray networks, CV search, and custom sites to their intended destinations", () => {
    cy.get('[data-field="rol"]').type("UX Designer{enter}");
    cy.get('[data-field="atributos"]').type("Figma{enter}");
    cy.get('[data-field="atributos"]').type("investigación de usuarios{enter}");
    cy.get("#advancedCriteria").then(($details) => {
      if (!$details.prop("open")) cy.wrap($details).find("summary").click();
    });
    cy.get('[data-field="dominio"]').type("diseño{enter}");
    cy.get('[data-field="alcance"]').type("España{enter}");

    const selectNetwork = (name) => cy.get("#networkTabs button").contains(name).click();
    cy.get("#generateBtn").click();
    cy.get("#moreNetworks > summary").click();
    selectNetwork("LinkedIn");
    cy.get("#generateBtn").click();
    cy.get("#linkedinTiers a").each(($link) => expect(new URL($link.prop("href")).hostname).to.include("linkedin.com"));

    selectNetwork("GitHub");
    cy.get("#generateBtn").click();
    cy.get("#openGithub").should("have.attr", "href").and("include", "github.com/search");

    [["Stack Overflow", "stackoverflow.com/users"], ["Xing", "xing.com/profile"], ["Behance", "behance.net"]].forEach(([name, domain]) => {
      selectNetwork(name);
      cy.get("#generateBtn").click();
      cy.get("#openGoogle").should("have.attr", "href").and("include", encodeURIComponent("site:" + domain));
    });

    selectNetwork("CVs sueltos (PDF/Word)");
    cy.get("#generateBtn").click();
    cy.get("#out-xray").should("contain.text", "filetype:pdf").and("contain.text", "filetype:docx");
    cy.get("#openGoogle").should("have.attr", "href").and("include", "google.com/search");

    selectNetwork("Otro sitio");
    cy.get("#customSiteInput").type("talent.example.org");
    cy.get("#generateBtn").click();
    cy.get("#openGoogle").should("have.attr", "href").and("include", encodeURIComponent("site:talent.example.org"));
  });
});
