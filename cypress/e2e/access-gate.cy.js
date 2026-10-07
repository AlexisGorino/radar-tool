describe("RADAR team access", () => {
  beforeEach(() => {
    cy.intercept("POST", "https://script.google.com/**", { statusCode: 200, body: "QA stub" });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.removeItem("radar-auth-v1");
        win.localStorage.removeItem("radar-user-v1");
      },
    });
    cy.get("#authGateSubmit").should("be.enabled");
  });

  it("keeps access closed for an incorrect password", () => {
    cy.get("#authGateNombre").type("QA");
    cy.get("#authGateApellido").type("RADAR");
    cy.get("#authGatePassword").type("incorrecta");
    cy.get("#authGateForm").submit();
    cy.get("#authGateError").should("contain.text", "Contraseña incorrecta");
    cy.get("html").should("not.have.class", "authed");
    cy.window().its("localStorage").invoke("getItem", "radar-auth-v1").should("be.null");
  });

  it("opens the app and records the same team check-in on valid credentials", () => {
    cy.get("#authGateNombre").type("QA");
    cy.get("#authGateApellido").type("RADAR");
    cy.get("#authGatePassword").type("MinDataTeam");
    cy.get("#authGateForm").submit();
    cy.get("html").should("have.class", "authed");
    cy.get("#appShell").should("be.visible");
    cy.window().its("localStorage").invoke("getItem", "radar-auth-v1").should("eq", "ok");
    cy.window().its("localStorage").invoke("getItem", "radar-user-v1").should("contain", "QA");
  });
});
