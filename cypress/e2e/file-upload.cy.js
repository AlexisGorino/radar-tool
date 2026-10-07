describe("RADAR document upload races", () => {
  beforeEach(() => {
    cy.intercept("POST", "https://script.google.com/**", { statusCode: 200, body: "QA stub" });
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("radar-auth-v1", "ok");
        win.localStorage.setItem("radar-user-v1", JSON.stringify({ nombre: "QA", apellido: "RADAR" }));
        const readers = [];
        class DeferredFileReader {
          result = null;
          onload = null;
          onerror = null;
          readAsText() {
            readers.push(this);
          }
        }
        Object.defineProperty(win, "FileReader", { configurable: true, value: DeferredFileReader });
        win.__radarReaders = readers;
      },
    });
    cy.get("#appShell").should("be.visible");
  });

  it("ignores a late file error after the recruiter has replaced the text", () => {
    cy.get("#fileInput").selectFile({
      contents: "Texto de una búsqueda anterior",
      fileName: "anterior.txt",
      mimeType: "text/plain",
    });
    cy.get("#jdInput").type("Busco una nueva búsqueda escrita manualmente.");
    cy.window().then((win) => {
      win.__radarReaders[0].onerror();
    });
    cy.get("#jdInput").should("have.value", "Busco una nueva búsqueda escrita manualmente.");
    cy.get(".row-actions + .inline-error").should("not.exist");
  });
});
