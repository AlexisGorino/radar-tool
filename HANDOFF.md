# RADAR — Estado del proyecto (handoff completo)

Documento para retomar el proyecto en una sesión nueva sin perder contexto.
Escrito el 2026-09-12, actualizado el 2026-09-22 después de una segunda
ronda de testing en vivo con JDs reales de clientes de Mindata.

## 1. Qué es esto y dónde vive

**RADAR**: herramienta de sourcing para reclutadores de Mindata, creada por
Ale Gorino y Franco Velazco. Convierte una JD (pegada, o subida en `.txt`/
`.pdf`) en un booleano de búsqueda preciso, más variantes listas para
LinkedIn, GitHub y otras redes.

- **Repo**: `C:\Users\SQUAD_USR\radar-tool` — git propio, **separado** de
  relay-talent/recrucopilot/cvpower (a pedido explícito, sin ningún vínculo).
- **GitHub**: https://github.com/AlexisGorino/radar-tool (público, tu cuenta)
- **En vivo**: https://alexisgorino.github.io/radar-tool/ (GitHub Pages,
  rama `main`, se redespliega solo ~30-60s después de cada push)
- **CI**: `.github/workflows/tests.yml` corre los 322 tests en cada push/PR
- También existe una versión más vieja como Claude Artifact
  (`https://claude.ai/code/artifact/8b5c64a6-4577-4036-a090-ee0b917511cf`)
  — **no es la versión vigente**, GitHub Pages es la fuente de verdad.

## 2. Arquitectura (ver `ARCHITECTURE.md` para el detalle completo)

100% estático, sin backend, sin build step. Capas:

```
index.html                              markup
app.js                                   única capa que toca el DOM
extractor.js  generator.js               núcleo: funciones puras
countries.js  keywords.js  networks.js   datos estáticos
js/vendor/pdf.min.js                     pdf.js de Mozilla, vendorizado
```

Método RADAR: **R**ol, **A**tributos, **D**ominio, **A**lcance, **R**efinar.

## 3. Qué hace hoy (funcionalidad completa)

- Analiza JD pegada o subida (`.txt`/`.pdf`, se lee en el navegador con
  pdf.js, nunca sale de la máquina) y completa los 5 campos solo. Si el
  texto es un currículum en vez de una JD, o si no se pudo identificar el
  rol con confianza, avisa con un mensaje en pantalla en vez de generar
  campos con datos inventados.
- También entiende consultas manuales cortas ("busco un Backend Developer
  con Java y Spring que viva en Brasil").
- Cuando la JD separa requisitos excluyentes de deseables, los excluyentes
  ganan prioridad en Atributos — un skill que solo figura como "deseable"
  es el primero que se descarta si hay que acortar.
- Sugiere sinónimos de rol con un click.
- **Redes**: LinkedIn (botón nativo en tres variantes — específica, media,
  amplia — porque el plan gratuito de LinkedIn rompe la búsqueda pasados
  3-4 operadores AND/OR; más X-Ray de respaldo), GitHub (personas o
  repos), Stack Overflow, Xing, Behance, CVs sueltos (PDF/Word en toda la
  web), Otro sitio (dominio custom). **Indeed CVs, X/Twitter y Wellfound
  se sacaron del listado** — los tres se probaron en vivo y ninguno traía
  candidatos reales.
- **"Relajar búsqueda"**: un checkbox que saca Dominio/Alcance del AND
  (deja solo Rol AND Atributos) para cuando la versión completa da cero
  resultados — confirmado en vivo que esto realmente rescata candidatos
  reales que la versión estricta no encontraba.
- Historial de búsquedas en `localStorage` (privado por navegador, nunca
  se sincroniza ni se sube a ningún lado).
- Formulario de feedback → manda por FormSubmit.co a
  `alexis.gorino@mindata.es` y/o `franco.velazco@mindata.es`. **Nunca se
  probó un envío real** (ver pendientes).
- Pantalla de contraseña compartida del equipo ("MinDataTeam") antes de
  entrar — es una puerta de recepción, no seguridad real: el repo es
  público, así que esa contraseña está a la vista de cualquiera que abra
  el código. Ver `SECURITY.md` para el detalle.
- Accesibilidad: contraste de color WCAG AA corregido, paneles laterales
  con foco atrapado y devuelto correctamente.

## 4. Bugs reales encontrados y corregidos (con evidencia en vivo, no en teoría)

Cada uno de estos se encontró abriendo el link real contra Google/Bing/
GitHub, no adivinando. Detalle completo en `TESTING.md`.

1. Rol se armaba con basura de tablas en PDFs de agencia con formato ficha
   ("CLIENTE W2M - PM Ciberseguridad COD VACANTE...") → corregido.
2. Rol quedaba vacío en JDs modernas donde el título está solo, al
   principio del documento, sin verbo ni etiqueta → corregido con un
   patrón que reconoce sustantivos de puesto (Developer, Engineer, etc.)
3. GitHub daba 0 resultados por un "Sr." colado en la query → sacándolo,
   7 resultados reales (uno justo en la localidad exacta del puesto).
4. Alcance mezclaba país + modalidad + seniority → ahora es **solo país y
   localidad**; modalidad/seniority se detectan pero solo se ofrecen como
   sugerencia clickeable en Refinar, nunca se auto-agregan (decisión
   explícita: meterlos en el booleano filtra candidatos en vez de acercarlos).
5. Refinar se auto-completaba → ahora arranca siempre vacío.
6. Atributos/Dominio no tenían prioridad (orden del banco de palabras) →
   ahora se ordenan por dónde aparecen en el texto, y términos genéricos
   (Scrum/Kanban/QA) quedan al final.
7. Wellfound apuntaba a `wellfound.com` (avisos de trabajo, no candidatos)
   → corregido a `wellfound.com/u` (perfiles de personas reales).
8. Indeed CVs confirmado no funcional (Google no indexa `indeed.com/r`,
   ni con términos genéricos) → **sacado del todo**, no solo avisado.
9. Bing confirmado roto para X-Ray en general (ignora `site:` — hasta
   interpretaba "PM" como la hora) → LinkedIn tiene botón de búsqueda
   nativa propia; el resto de las redes recomienda Google en la UI.
10. "busco X" (primera persona) no se reconocía como intención de rol.
11. Un nombre de skill o país suelto ("Java", "Brasil") se colaba como si
    fuera el Rol cuando no había un título real → corregido, pero "SRE" y
    "SAP FICO" siguen aceptándose porque sí pueden ser el título en sí.
12. Bug de mayúsculas en localidades acentuadas ("NeuquÉN" en vez de
    "Neuquén") y en siglas (CABA/CDMX quedaban como "Caba"/"Cdmx") →
    corregidos.
13. Comillas dentro de un término rompían la sintaxis del booleano →
    se limpian antes de armar la query.
14. Contraste de color por debajo del mínimo WCAG AA → colores de marca
    ajustados (visualmente iguales).

En la ronda del 2026-09-22, probando con JDs reales de clientes distintos
(QA en España, auditor de telecomunicaciones, comercial en México,
tesorería en Galicia), aparecieron varios más: el booleano de LinkedIn
excedía el límite de operadores del plan gratuito y daba cero resultados,
una ciudad ambigua entre dos países ("Santiago" — Chile o España) se le
asignaba al país equivocado, y el extractor de Rol se rendía con la
primera etiqueta que encontraba en vez de seguir buscando una limpia.
Detalle completo, con la evidencia de cada uno, en `TESTING.md`.

## 5. Testing (ver `TESTING.md` para el detalle completo)

- **322 tests automáticos** (`node tests/run.js`, `tests/jd-bank.js`,
  `tests/locations.js`), corriendo solos en cada push vía GitHub Actions.
- Varias JDs reales tuyas guardadas como fixture de regresión permanente
  (`tests/fixtures/`).
- Probado en vivo contra **Google** (funciona bien para X-Ray, con
  resultados reales confirmados en decenas de búsquedas), **Bing**
  (confirmado no confiable), **GitHub** (personas y repos, con resultados
  reales verificados).
- Subida real de PDF probada de punta a punta (archivo de verdad por el
  input, no texto pre-extraído) — incluye un PDF sintético de 15 páginas
  para probar el límite de 20.000 caracteres (339ms, sin problema).
- Accesibilidad probada a mano con teclado (foco atrapado, Escape,
  vuelta de foco) además de calculada (contraste de color).
- Mobile (375px) verificado después de cada cambio grande de UI.

## 6. Pendientes técnicos (pequeños, no bloqueantes)

- **Cross-browser real**: nunca se probó en Firefox/Safari de verdad (la
  herramienta de este asistente solo maneja un navegador tipo Chrome). El
  código fue auditado y no usa nada exclusivo de Chrome, pero sería bueno
  que alguien lo abra en Firefox/Safari y confirme que se ve bien.
- Las categorías de skills más nuevas (RRHH, SAP, ciberseguridad,
  telecomunicaciones) ya se re-confirmaron en vivo en la segunda ronda de
  testing (2026-09-22) contra Google real, con JDs de clientes reales de
  Mindata — quedan documentadas en `TESTING.md`.
- El banco de skills (`js/keywords.js`) es, por naturaleza, una lista
  que nunca puede estar "100% completa" — es fácil seguir agregando
  términos ahí mismo si aparece un rubro nuevo sin cobertura.

## 7. Pendientes que son decisión tuya, no técnica

1. **Envío real de prueba del formulario de feedback**: el código está
   revisado pero nunca se disparó un envío real — le llegaría un mail de
   verdad a vos y a Franco. Decime "mandalo" si querés que lo pruebe así.
2. **"Evaluá a tu candidato" (IA)**: quedó pendiente que elijas entre:
   - **Gratis**: arma un prompt ya redactado que copiás y pegás vos mismo
     en Claude/ChatGPT (cero costo, cero backend).
   - **Automática**: necesita un backend propio + una cuenta de API de
     IA que vos tendrías que abrir y pagar (no puedo crear cuentas ni
     cargar tarjetas en tu nombre).
3. **Presentación de Google Slides**: no pude editarla in situ (el
   permiso que tengo sobre ese archivo de Drive solo alcanza para leer y
   renombrar, no para escribir contenido). Ya te mandé la diapositiva de
   cierre ("Muchas gracias / Este regalo es para ustedes" + QR + link)
   como archivo `.pptx` aparte para que la copies vos con dos clicks. Si
   en algún momento querés que te arme el deck entero de nuevo como
   archivo separado (con un link nuevo, no el mismo), avisame.
4. **Confirmación de FormSubmit**: la primera vez que le llega algo a una
   dirección nueva, FormSubmit le pide a esa dirección clickear un mail
   de activación antes de reenviar de verdad. No sé si vos y Franco ya
   lo hicieron.

## 8. Documentación ya escrita en el repo (primera parada en una sesión nueva)

- `README.md` — qué es, funcionalidad, cómo correr los tests, cómo
  desplegarlo en otro lado si hiciera falta.
- `ARCHITECTURE.md` — por qué es estático/sin framework, capas, CI,
  nota de compatibilidad de navegadores.
- `SECURITY.md` — modelo de amenaza, qué protege la CSP, la única
  excepción de red (FormSubmit) explicada en detalle.
- `TESTING.md` — el más largo y detallado: historia completa de cada bug
  encontrado probando en vivo, tabla de qué red funciona y cuál no,
  auditoría de accesibilidad, checklist de QA manual.
- Este archivo (`HANDOFF.md`) — este resumen ejecutivo de todo lo demás.

## 9. Detalles de git a tener en cuenta

- Commits firmados como Alexis Gorino / `alexis.gorino@squad.com.ar`
  (tu mail de trabajo) — distinto de las direcciones de Mindata usadas
  en el formulario de feedback (`@mindata.es`), es intencional, no un error.
- No hay dependencias de npm en lo que se despliega — `pdfjs-dist` se
  instaló temporalmente solo para diagnóstico un par de veces y se borró
  cada vez, nunca quedó commiteado.

## 10. Si arrancás de cero en una sesión nueva

1. Leé este archivo primero.
2. Si necesitás el detalle técnico de un bug puntual, buscalo en
   `TESTING.md` (está todo, con el texto exacto de cada búsqueda probada).
3. Antes de tocar `extractor.js`, `generator.js`, `keywords.js` o
   `countries.js`, corré `node tests/run.js && node tests/jd-bank.js && node tests/locations.js`
   — son los archivos donde un cambio chico rompe casos que no se ven a
   simple vista.
4. Los tres puntos de la sección 7 son las únicas decisiones que
   realmente faltan para "cerrar" el proyecto del todo.
