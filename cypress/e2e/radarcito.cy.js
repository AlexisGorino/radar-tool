function primeAuthenticatedSession(win, radarcito) {
  win.localStorage.setItem("radar-auth-v1", "ok");
  win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
  if (radarcito) win.localStorage.setItem("radarcito-v1", JSON.stringify(radarcito));
}

const visit = (radarcito) => {
  cy.intercept("POST", "https://script.google.com/**", { statusCode: 200, body: "QA stub" });
  cy.intercept("POST", "**/api/analyze", { statusCode: 503, body: { error: "ai_unavailable" } });
  cy.visit("/", { onBeforeLoad: (win) => primeAuthenticatedSession(win, radarcito) });
  cy.get("#appShell").should("be.visible");
};

const ask = (text) => {
  cy.get("#radarcitoQuestion").type(`${text}{enter}`);
};

describe("Radarcito, la guía de RADAR", () => {
  describe("primera visita", () => {
    beforeEach(() => visit());

    it("saluda sin tapar la pantalla y recorre los pasos señalando cada control", () => {
      cy.get("#radarcitoNudge", { timeout: 6000 }).should("be.visible").and("contain.text", "Radarcito");
      cy.get("#radarcitoPanel").should("have.class", "hidden");
      cy.get("#radarcitoNudge").click();
      cy.get("#radarcitoPanel").should("be.visible");
      cy.get("#radarcitoLauncher").should("have.attr", "aria-expanded", "true");
      cy.get("#radarcitoMessage").should("contain.text", "Soy tu guía");

      cy.get("#radarcitoTourNext").click();
      cy.get("#radarcitoMessage").should("contain.text", "Contá a quién buscás");
      cy.get("#jdInput").should("have.class", "radarcito-spot");
      cy.get("#radarcitoTourNext").click();
      cy.get("#analyzeBtn").should("have.class", "radarcito-spot");
      cy.get("#radarcitoTourPrev").click();
      cy.get("#radarcitoTourCount").should("contain.text", "Paso 2 de 6");

      cy.get("#radarcitoTourSkip").click();
      cy.get(".radarcito-spot").should("not.exist");
      cy.window().its("localStorage").invoke("getItem", "radarcito-v1").should("contain", "\"toured\":true");
    });

    it("se cierra con Escape y devuelve el foco al botón", () => {
      cy.get("#radarcitoLauncher").click();
      cy.get("#radarcitoPanel").should("be.visible");
      cy.get("#radarcitoPanel").type("{esc}");
      cy.get("#radarcitoPanel").should("have.class", "hidden");
      cy.focused().should("have.id", "radarcitoLauncher");
    });
  });

  describe("con el recorrido ya hecho", () => {
    beforeEach(() => visit({ toured: true }));

    it("no vuelve a ofrecer el recorrido solo", () => {
      cy.wait(2200);
      cy.get("#radarcitoNudge").should("have.class", "hidden");
    });

    it("acompaña el flujo: ejemplo, lectura y revisión", () => {
      cy.get("#radarcitoLauncher").click();
      cy.get("#radarcitoMessage").should("contain.text", "Pegá una JD");
      cy.contains("#radarcitoActions button", "Probar con un ejemplo").click();
      cy.get("#jdInput").invoke("val").should("contain", "Senior QA Automation Engineer");
      cy.get("#radarcitoMessage").should("contain.text", "Leer y proponer criterios");
      cy.contains("#radarcitoActions button", "Leer y proponer criterios").click();
      cy.get("#jdReview").should("not.have.class", "hidden");
      cy.get("#radarcitoMessage").should("contain.text", "Esto es lo que entendí");
    });

    it("responde sobre la JD y sobre conocimiento general, y ofrece la IA solo cuando no sabe", () => {
      cy.get("#radarcitoLauncher").click();
      cy.get("#radarcitoAskTab").click();
      cy.get("#radarcitoLog").should("contain.text", "perfiles y tecnologías de cualquier área");

      ask("¿Qué es Kubernetes?");
      cy.get("#radarcitoLog").should("contain.text", "Orquesta muchos contenedores");
      cy.get(".radarcito-chip-ai").should("not.exist");

      cy.contains("#radarcitoSuggestions button", "Probar con un ejemplo").click();
      ask("¿Qué idiomas piden?");
      cy.get("#radarcitoLog").should("contain.text", "Inglés avanzado");
      ask("Explicame los términos técnicos de la JD");
      cy.get("#radarcitoLog").should("contain.text", "Playwright:");
      ask("¿Qué preguntas le hago al candidato?");
      cy.get("#radarcitoLog").should("contain.text", "proyecto concreto donde usaste Playwright");

      cy.intercept("POST", "**/api/ask", { statusCode: 200, body: { status: "answered", answer: "París es la capital.\n- Dato uno", model: "stub" } }).as("askAi");
      ask("¿Cuál es la capital de Francia?");
      cy.get(".radarcito-chip-ai").should("be.visible").click();
      cy.wait("@askAi").its("request.body").should((body) => {
        expect(body.question).to.contain("capital de Francia");
        expect(body.context).to.not.contain("Barcelona");
      });
      cy.get("#radarcitoLog").should("contain.text", "París es la capital").and("contain.text", "Puede equivocarse");
    });

    it("carga los títulos equivalentes en los criterios con un clic", () => {
      cy.get("#radarcitoLauncher").click();
      cy.get("#radarcitoAskTab").click();
      ask("¿Cómo hunteo un QA automation engineer?");
      cy.contains(".radarcito-chip-ai", "Agregar a los criterios").should("contain.text", "SDET").click();
      cy.get("#chips-rol").should("contain.text", "SDET").and("contain.text", "Test Automation Engineer");
      cy.get("#radarcitoLog").should("contain.text", "los agregué como alternativas del cargo");
      cy.get("#chips-rol").should("have.class", "radarcito-spot");
    });

    it("si la IA no responde, lo dice sin romper la conversación", () => {
      cy.intercept("POST", "**/api/ask", { statusCode: 502, body: { error: "ai_unavailable" } });
      cy.get("#radarcitoLauncher").click();
      cy.get("#radarcitoAskTab").click();
      ask("¿Cuál es la capital de Francia?");
      cy.get(".radarcito-chip-ai").click();
      cy.get("#radarcitoLog").should("contain.text", "No pude consultar a la IA");
      ask("hola");
      cy.get("#radarcitoLog").should("contain.text", "Soy Radarcito");
    });
  });
});
