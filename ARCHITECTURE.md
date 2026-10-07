# Arquitectura

Aplicación cliente sin backend. La presentación de producción se compila con
Angular 21 y GitHub Actions publica el resultado estático; los documentos y
las búsquedas continúan en el navegador. La lógica RADAR permanece separada
en módulos puros para conservar sus pruebas y facilitar una migración por
etapas de las interacciones del DOM a componentes tipados.

## Capas

```
┌─────────────────────────────────────────┐
│  src/app/                                │  shell Angular 21
├─────────────────────────────────────────┤
│  LegacyDomBridge + app.js                │  transición para el UI existente
├─────────────────────────────────────────┤
│  extractor.js   generator.js review.js   │  núcleo: funciones puras
├─────────────────────────────────────────┤
│  ai.js tracking.js outcome.js            │  servicios opcionales: IA / uso / métricas locales
├─────────────────────────────────────────┤
│  countries.js  keywords.js  networks.js  │  datos estáticos
└─────────────────────────────────────────┘
```

**Datos** (`countries.js`, `keywords.js`, `networks.js`): objetos y arrays
planos. Países LATAM/Europa con sus variantes de nombre y ciudades, banco de
skills/industrias/seniority, sinónimos de rol y catálogo de redes buscables.
No tienen lógica más allá de un par de funciones de consulta (`detectCountry`,
`getSynonyms`).

**Núcleo** (`extractor.js`, `generator.js`, `review.js`): toda la lógica de negocio vive
acá, como funciones puras — mismo input, mismo output, sin tocar el DOM ni
el estado global. `extractor.js` convierte texto libre de una JD en los
cinco campos del método RADAR (Rol, Atributos, Dominio, Alcance, Refinar) y
en `refinarSuggestion` (seniority/modalidad detectados pero no aplicados
como filtro — ver más abajo). También calcula `isJobPosting`: una sumatoria
de señales (rol, país, atributos, dominio, palabras típicas de JD) para
distinguir un texto pegado por error (una noticia, un CV) de una JD real,
sin bloquear consultas manuales cortas legítimas. `generator.js` toma esos
campos y arma el booleano y las URLs de búsqueda. El generador conserva las
señales imprescindibles como grupos AND, las alternativas como OR y omite los
deseables de la consulta precisa. Su modo `relaxed` elimina Dominio, añade los
deseables como alternativas y conserva Alcance.
Que sean puras es lo que permite testearlas con Node sin levantar un
navegador ni mockear nada.

Decisión de diseño deliberada: Alcance solo contiene país + localidad.
Modalidad y seniority se detectan pero nunca se agregan solos al booleano
— son atributos que casi nunca están escritos tal cual en un perfil
público, así que ANDearlos filtra candidatos buenos en vez de acercar a
ellos. Se ofrecen como sugerencia clickeable en la UI, nunca como chip
puesto de entrada.

**IA opcional** (`ai.js`): arma el prompt para Gemini y parsea la respuesta
como funciones puras — sin DOM. La única función con efecto (`suggestTerms`)
hace `fetch` directo a la API de Gemini, pero sólo cuando `app.js` la llama
explícitamente y sólo si hay una key guardada en `localStorage`; sin key, el
módulo entero es inerte. No participa del núcleo determinístico: sus
sugerencias son pills que el usuario elige sumar a mano a Rol/Atributos,
igual que los sinónimos estáticos de `keywords.js` — nunca se auto-agregan.

**Registro de uso** (`tracking.js`): igual patrón — funciones puras
(armado de payload) más una función con efecto (`logEvent`, `fetch`
fire-and-forget a un Apps Script propio). No es opcional como `ai.js`: es
parte del gate de acceso (`app.js` la llama al hacer check-in y al generar
un booleano). Nunca participa del núcleo determinístico ni ve los campos
RADAR — solo identidad + evento + cuándo.

**Feedback de resultados** (`outcome.js`): conserva conteos locales por fuente
para perfiles útiles, resultados ruidosos o búsquedas vacías. No almacena
consultas, JDs, nombres ni datos de perfiles. Un tablero de equipo requeriría un
servicio compartido con reglas explícitas de retención y acceso.

**UI** (`app.js`): la única capa que conoce el DOM. Lee inputs, llama al
núcleo, pinta el resultado. Mantiene un objeto `state` en memoria (los cinco
campos y subgrupos de prioridad + red seleccionada) que es la única fuente de
verdad de la pantalla.

Cada módulo se expone como global (`RadarCountries`, `RadarKeywords`, etc.)
via el patrón UMD que también soporta `require()`, así los mismos archivos
corren en el navegador y en los tests de Node sin duplicar código.

## Lectores locales

`js/vendor/pdf.min.js` (pdf.js, de Mozilla) para leer texto de PDFs
subidos y `js/vendor/mammoth.browser.min.js` para extraer texto de `.docx`.
Ambos están vendorizados como archivos locales, sin CDN. El texto de esos
documentos no sale del navegador durante el análisis determinístico.

## Migración gradual a Angular

Angular 21 es la entrada de producción y es dueño del ciclo de vida del shell,
del acceso y del estado de arranque. `AccessGateComponent` mantiene el flujo
existente, mientras `LegacyDomBridge` monta temporalmente los módulos de
negocio en el orden declarado, después de que Angular haya renderizado el DOM.
El núcleo puro sigue en JavaScript para evitar cambiar a la vez lógica de
búsqueda y capa visual; cada interacción DOM se migra en cortes con pruebas de
paridad antes de retirar el puente.

La compilación genera el identificador del build en `index.html`. El puente
lo aplica como query de caché a los módulos heredados, de modo que cada
publicación solicita los scripts correspondientes a su versión. Un fallo de
carga se comunica desde el template Angular con una acción explícita para
reintentar, sin manipular el DOM desde el componente.

## Persistencia

No hay backend ni base de datos. El historial de búsquedas (opcional) usa
`localStorage` del navegador — por diseño, no sincroniza entre dispositivos
ni personas. Ver `SECURITY.md` para el resto del modelo de privacidad.

## Deploy

Carpeta estática pura: sirve igual desde un `file://`, un servidor local,
o cualquier hosting estático (Netlify, Vercel, GitHub Pages, S3+CloudFront,
nginx). No hay variables de entorno ni configuración de build.

En producción hoy: GitHub Pages publica el build de Angular desde la rama
`main` en https://alexisgorino.github.io/radar-tool/. Cada push ejecuta
build y despliegue; el sitio servido es `dist/radar-tool/browser`, no el
contenido fuente del repositorio.

## Integración continua

`.github/workflows/tests.yml` compila Angular, ejecuta las suites unitarias
del núcleo y corre Cypress contra el build servido bajo el subpath de Pages.
La cobertura de navegador comprueba el acceso, el ciclo de arranque, la
revisión de JD, la geografía y rutas generadas; una falla en la carga del
puente también debe mostrar el estado de recuperación.

## Compatibilidad de navegadores

No se usa ninguna sintaxis o API exclusiva de un motor: `const`/`let`,
arrow functions, template literals, `Set`, `fetch`, `FileReader`,
`DataTransfer`, `Promise.all` — todo con soporte amplio en Firefox, Safari
y Chrome desde hace varios años. `pdf.js` (vendorizado en `js/vendor/`) es
la propia librería de Mozilla, construida para el lector de PDF nativo de
Firefox, así que su compatibilidad cross-browser viene garantizada desde
el origen. Verificado por lectura de código, no con un navegador Firefox/
Safari real corriendo la app — si algo se ve distinto en esos navegadores,
probablemente sea un detalle visual de CSS, no una función rota.
## Angular 21 migration

The Angular application is the production entry point. `AppComponent` owns
startup and reports boot failures; `LegacyDomBridge` loads the established
document, extraction, review, generation, AI, tracking, and feedback scripts in
dependency order after Angular has rendered the existing view. This explicit
adapter preserves behavior during the migration and avoids dependence on
undocumented script-tag ordering in the published `index.html`.

This is a compatibility phase, not the end state: DOM-facing interactions in
`js/app.js` should move into focused Angular components and typed services in
small, behavior-preserving slices. Keep the pure extraction, review, and query
generation modules covered by their regression suites until each slice has
parity. The browser suite serves the compiled Angular build to catch broken
asset paths and bootstrap errors at the GitHub Pages subpath.
