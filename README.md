# RADAR — Generador de booleanos

**En vivo: https://alexisgorino.github.io/radar-tool/**

Herramienta de sourcing de Mindata, creada por **Ale Gorino**.
Convierte una JD en un booleano preciso y en variantes listas para LinkedIn,
Google/Bing (X-Ray), GitHub, Behance, CVs sueltos en PDF/Word y otras redes.

Pensada para el uso diario de un reclutador: el análisis de JD y la generación
de consultas siguen funcionando en el navegador. La interfaz se compila con
Angular 21; los documentos se leen localmente con lectores vendorizados para
PDF y Word `.docx`. Una función opcional de perfiles públicos usa un Worker
separado con la clave del proveedor en el servidor; requiere configuración
operativa antes de habilitarse en GitHub Pages.

## Funcionalidad

- **Método RADAR**: Rol, Atributos, Dominio, Alcance, Refinar — cinco campos
  que arman el booleano.
- **Prioridad de requisitos**: separa imprescindibles (todos se exigen con AND),
  señales equivalentes (cualquiera puede coincidir con OR) y deseables (se omiten
  de la ruta precisa y aparecen en rutas más amplias). El análisis nunca decide
  por sí solo qué habilidad es excluyente: lo confirma quien recluta.
- **Analizador de JD y briefs libres**: pegá o escribí la necesidad con tus
  palabras, o arrastrá/subí un `.txt`, `.pdf` o `.docx` (se lee en el navegador).
  RADAR muestra cargo, señales del perfil, industria, ubicación y evidencia.
  Pide confirmar esas decisiones y completar datos concretos antes de aplicar.
  Si el país está solo en el nombre del archivo, pide confirmarlo.
- **Relevamiento mínimo también en modo manual**: exige una señal concreta del
  perfil, además de decidir ubicación o búsqueda sin límite geográfico. Para
  buscar sin título hacen falta varias señales específicas.
- **Control de lectura**: avisa si un PDF tiene páginas con poco texto, posible
  orden mezclado o caracteres dañados. Un PDF sin texto legible no se aplica;
  los escaneos aún requieren que se pegue una versión en texto.
- **Sinónimos de rol**: sugiere variantes del puesto (ES/EN) con un click,
  para no perder candidatos por diferencias de nomenclatura.
- **Sugerencias con IA (opcional)**: cargando tu propia key gratuita de
  [Google AI Studio](https://aistudio.google.com/apikey) (botón "IA
  (opcional)" en la topbar), RADAR le pide a Gemini sinónimos de rol y
  atributos de nicho adicionales a los del diccionario estático. La key
  vive solo en el `localStorage` de tu navegador; sin key, la función
  directamente no aparece.
- **LinkedIn con tres rutas claras**: propone como máximo tres búsquedas y
  explica cuándo usar el cargo o buscar solo por habilidades.
- **Redes soportadas**: LinkedIn (búsqueda nativa + X-Ray), GitHub (búsqueda
  nativa de personas o repos), Stack Overflow, Xing, Behance, búsqueda de
  CVs sueltos (PDF/Word en toda la web) y cualquier sitio custom. Todas
  probadas en vivo contra Google, con perfiles reales de desarrollo, SAP,
  ciberseguridad, telecomunicaciones, RRHH y diseño en distintos países (ver
  `TESTING.md`) — Indeed CVs, X/Twitter y Wellfound se sacaron del listado
  porque, probados de verdad, no traían candidatos reales.
- **Rutas sugeridas**: prioriza LinkedIn para búsquedas generales, GitHub para
  perfiles técnicos, Behance para diseño y Xing para mercados DACH. Son puntos
  de partida; cada red conserva sus filtros y límites propios. Los portales que
  publican ofertas, pero no perfiles, no sirven como fuente de candidatos por X-Ray.
- **Shortlist de perfiles públicos**: al configurar el Worker, consulta hasta
  cuatro fuentes públicas indexadas y presenta hasta 50 perfiles con enlace,
  fragmento visible, señales coincidentes y ubicación confirmada/parcial/no
  confirmada. El resultado no prueba disponibilidad ni garantiza encaje; RADAR
  no conserva la lista. Ver configuración, cuotas y límites en `backend/README.md`.
- **Ampliación segura**: quita el sector cuando se necesitan más resultados y
  conserva la ubicación elegida para no abrir accidentalmente una búsqueda
  regional a todo un país.
- **Feedback de sourcing**: permite registrar si una fuente trajo perfiles útiles,
  mucho ruido o ningún perfil. Solo guarda conteos por fuente en este navegador;
  no conserva la búsqueda ni datos de candidatos.
- **Historial de búsquedas**: guarda las últimas 20 búsquedas en el propio
  navegador (no en un servidor) para recuperarlas con un click.
- **Registro de uso por nombre**: al entrar por primera vez en un navegador,
  además de la contraseña de equipo pide nombre y apellido. Sirve para que
  el equipo sepa quién usa la herramienta y con qué frecuencia — nunca
  registra qué buscó cada persona, solo el hecho de que entró o generó un
  booleano. Ver `SECURITY.md`.
- **Atajo de teclado**: Ctrl/Cmd + Enter arma el booleano desde cualquier campo.
- **Ayuda integrada**: panel con la explicación del método RADAR.
- **Reportar bug/sugerencia**: botón al pie que arma un mail precargado a
  Ale y Franco — nada se envía solo, la persona confirma desde su cliente
  de mail.

## Estructura

```
radar-tool/
  src/
    main.ts                 bootstrap Angular 21
    app/                    shell Angular y adaptador gradual del DOM existente
    styles.css              sistema visual RADAR
  angular.json              build estático con base /radar-tool/
  index.html                entrada estática de compatibilidad y desarrollo
  css/styles.css            estilos previos para esa entrada
  js/
    countries.js        datos: países LATAM + Europa, detección de ubicación
    keywords.js          datos: skills, industrias, seniority, sinónimos de rol
    networks.js           datos: redes soportadas
    extractor.js            parsing de la JD → campos RADAR (funciones puras)
    pdf-text.js             conserva líneas y espacios de los PDF leídos por pdf.js
    review.js               reglas del relevamiento obligatorio (funciones puras)
    generator.js              construcción de booleanos y URLs (funciones puras)
    ai.js                       capa opcional de sugerencias con Gemini (prompt + parseo, funciones puras)
    tracking.js                   registro de uso por nombre (payload + fetch, funciones puras)
    outcome.js                    conteos anónimos locales de resultado por fuente
    app.js                          capa de compatibilidad para los flujos existentes
  assets/
    mindata-logo.png
    favicon.svg
  js/vendor/
    pdf.min.js           pdf.js, vendorizado localmente (sin CDN)
    pdf.worker.min.js
    mammoth.browser.min.js  lectura local de Word .docx (licencia en mammoth.LICENSE)
  tests/
    run.js               suite unitaria (node tests/run.js, sin dependencias)
    jd-bank.js            banco de regresion con JDs reales (node tests/jd-bank.js)
    ai.js                   tests de ai.js (node tests/ai.js)
    tracking.js                tests de tracking.js (node tests/tracking.js)
    market-matrix.js          roles y mercados de IT, no IT y telecomunicaciones
    pdf-text.js               regresión de extracción, validación y ubicación
    review-quality.js         JDs variadas, briefs y documentos defectuosos
    docx.js                   extracción de Word y revisión posterior
```

`extractor.js` y `generator.js` no tocan el DOM ni hacen llamadas de red:
son funciones puras, lo que permite testearlas directamente con Node sin
levantar un navegador. La migración a Angular se hace por etapas:
`AppComponent` controla el arranque y `LegacyDomBridge` carga la capa DOM
existente en orden explícito. Así se conserva la experiencia de hunting mientras
cada interacción se migra a componentes y servicios tipados, sin cambiar las
reglas de búsqueda de golpe.

## Correr los tests

```
node tests/run.js
node tests/jd-bank.js
node tests/locations.js
node tests/ai.js
node tests/tracking.js
node tests/market-matrix.js
node tests/pdf-text.js
node tests/review-quality.js
node tests/docx.js
node tests/outcome.js
```

Las pruebas de navegador usan Cypress y están configuradas para GitHub Actions. Para
correrlas localmente, instalá las dependencias con `npm install`; después abrí
una terminal con `npm run start:test` y ejecutá `npm run test:e2e` en otra.

Ver [`TESTING.md`](TESTING.md) para el detalle y
el checklist de QA manual.

## Desarrollo y build

Requiere Node 22.12 o superior y npm:

```
npm ci
npm run start:dev
```

El build de producción genera `dist/radar-tool/browser` con el prefijo público
`/radar-tool/` utilizado por GitHub Pages:

```
npm run build
npm run check:angular
```

Para probar Cypress contra el build de Angular, primero compilá; después abrí
una terminal con `npm run start:angular` y ejecutá `npm run test:e2e` en otra.
`npm run start:test` conserva el servidor estático de compatibilidad.

## Seguridad y privacidad

- Todo corre en el navegador. El `Content-Security-Policy` de `src/index.html`
  restringe `connect-src` al propio origen más tres excepciones puntuales:
  FormSubmit (botón de feedback), la API de Gemini (solo si activaste
  "Sugerir con IA" con tu propia key) y un Apps Script propio de Mindata
  (registro de uso por nombre, ver más abajo).
- Ningún texto de la JD se envía a ningún servidor ni se guarda ahí, salvo
  el extracto que vos mandás a Gemini a propósito con "Sugerir con IA".
- El registro de uso manda nombre, apellido, qué acción se hizo y cuándo —
  nunca el contenido de una búsqueda.
- El historial de búsquedas (opcional) se guarda solo en `localStorage` del
  propio navegador — nunca sale de la máquina del usuario.
- El texto ingresado por el usuario siempre se inserta en la página con
  `textContent`, nunca con `innerHTML`, así que no hay forma de inyectar
  HTML o JavaScript pegando una JD maliciosa.
- El archivo subido se valida por tipo y tamaño (.txt hasta 500 KB, .pdf y
  .docx hasta 8 MB) antes de leerlo. PDF y Word se parsean en el navegador
  con librerías vendorizadas localmente — nunca se suben a un servidor.
- Todas las URLs armadas (Google, Bing, GitHub) codifican el query con
  `encodeURIComponent`.

## Dónde está desplegado

GitHub Pages, compilando con el workflow `deploy-radar-pages`:
**https://alexisgorino.github.io/radar-tool/**. Los cambios publicados en
`main` generan un build Angular 21 y se publican como artefacto de Pages.
Algunas redes externas requieren iniciar sesión para consultar sus resultados.

## Desplegarlo en otro lado

No hace falta cuenta ni tarjeta. Tres opciones, elegí la que te resulte
más cómoda:

### Opción A — Netlify Drop (más rápida, sin cuenta)

1. Generá un build para raíz: `npm run build -- --base-href /`
2. Andá a **app.netlify.com/drop**
3. Arrastrá `dist/radar-tool/browser` a la página
4. En unos segundos te da una URL pública (algo como
   `nombre-random.netlify.app`)

Para que la URL quede fija y no se pierda, creá una cuenta gratuita
después (te lo ofrece la misma pantalla).

### Opción B — Vercel

1. Instalá la CLI una sola vez: `npm i -g vercel`
2. Generá el build para la raíz del dominio: `npm run build -- --base-href /`
3. Desde adentro de la carpeta `radar-tool`, corré:
   ```
   vercel
   ```
3. Seguí las preguntas (podés aceptar todas las opciones por defecto,
   es un sitio estático, no necesita configuración de build)
4. Te da una URL de prueba al toque. Para la URL definitiva:
   ```
   vercel --prod
   ```

### Opción C — GitHub Pages

1. Subí la carpeta a un repo de GitHub
2. Settings → Pages → Source: rama `main`, carpeta `/root`
3. Guardá. La URL queda en `tuusuario.github.io/nombre-repo`

Cualquiera de las tres sirve para lo mismo: una URL pública para
compartir con el equipo. Netlify Drop es la que menos pasos tiene.

## Más documentación

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — por qué está armado así, capas y límites de cada módulo.
- [`SECURITY.md`](SECURITY.md) — modelo de amenaza y controles implementados.
- [`TESTING.md`](TESTING.md) — cómo correr los tests automáticos y checklist de QA manual.

## Créditos

© Mindata. Todos los derechos reservados.
Creado por Ale Gorino.
