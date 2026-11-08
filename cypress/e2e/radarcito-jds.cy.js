// Radarcito con JDs modelo en el navegador real: dos de IT y dos de otras áreas, de la JD pegada
// hasta los títulos equivalentes cargados en los criterios, como lo haría un recruiter.
const SCENARIOS = require("../../tests/fixtures/radarcito-jds.js");

const ask = (text) => cy.get("#radarcitoQuestion").type(`${text}{enter}`);

describe("Radarcito con JDs modelo", () => {
  SCENARIOS.forEach((jd) => {
    it(`${jd.title}: pregunta sobre la JD y carga los títulos equivalentes`, () => {
      cy.intercept("POST", "https://script.google.com/**", { statusCode: 200, body: "QA stub" });
      cy.intercept("POST", "**/api/analyze", { statusCode: 503, body: { error: "ai_unavailable" } });
      cy.visit("/", {
        onBeforeLoad(win) {
          win.localStorage.setItem("radar-auth-v1", "ok");
          win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
          win.localStorage.setItem("radarcito-v1", JSON.stringify({ toured: true }));
        },
      });
      cy.get("#appShell").should("be.visible");

      // La persona pega la JD y RADAR la lee; Radarcito acompaña el paso.
      cy.get("#jdInput").invoke("val", jd.text).trigger("input");
      cy.get("#analyzeBtn").click();
      cy.get("#jdReview").should("not.have.class", "hidden");
      cy.get("#radarcitoLauncher").click();
      cy.get("#radarcitoMessage").should("contain.text", "Esto es lo que entendí");

      // Preguntas de recruiter, respondidas con lo que dice esta JD.
      cy.get("#radarcitoAskTab").click();
      ask("Resumime la JD");
      cy.get("#radarcitoLog .radarcito-msg-bot").last().invoke("text").should("match", jd.role);

      ask("¿Qué tecnologías piden?");
      cy.get("#radarcitoLog .radarcito-msg-bot").last().should(($message) => {
        jd.expect.stack.forEach((pattern) => expect($message.text()).to.match(pattern));
      });

      ask("¿Hay salario?");
      cy.get("#radarcitoLog .radarcito-msg-bot").last().invoke("text")
        .should("match", jd.expect.salary || /No veo ninguna referencia salarial/);

      ask("¿Qué preguntas le hago al candidato?");
      cy.get("#radarcitoLog .radarcito-msg-bot").last().should("contain.text", "proyecto concreto donde usaste");

      // Ninguna de esas respuestas ofreció consultar a la IA: la base local alcanzó.
      cy.get(".radarcito-chip-ai").should("not.exist");

      // Hunting: los títulos equivalentes pasan a los criterios con un clic.
      ask("¿Cómo hunteo este perfil?");
      cy.contains(".radarcito-chip-ai", "Agregar a los criterios").click();
      cy.get("#chips-rol").invoke("text").should("match", jd.expect.hunt);
      cy.get("#radarcitoLog").should("contain.text", "los agregué como alternativas del cargo");
    });
  });
});
