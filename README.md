# RADAR — Generador de booleanos

**En vivo: https://alexisgorino.github.io/radar-tool/**

Herramienta de sourcing de Mindata, creada por **Ale Gorino**.
Convierte una JD en un booleano preciso y en variantes listas para LinkedIn,
Google/Bing (X-Ray), GitHub, Behance, CVs sueltos en PDF/Word y otras redes.

Pensada para el uso diario de un reclutador: sin cuentas, sin backend, sin
dependencias externas más allá de una librería vendorizada para leer PDF.
Corre igual abierto como archivo local, en Netlify, en Vercel, en GitHub
Pages o publicada como página estática en cualquier lado.

## Funcionalidad

- **Método RADAR**: Rol, Atributos, Dominio, Alcance, Refinar — cinco campos
  que arman el booleano.
- **Analizador de JD con revisión**: pegá el texto, o arrastrá/subí un `.txt` o
  `.pdf` (se lee en el navegador). RADAR muestra cargo, requisitos, industria,
  ubicación y evidencia antes de aplicar nada. Pregunta por los datos que faltan.
  Si el país está solo en el nombre del archivo, pide confirmarlo.
- **Sinónimos de rol**: sugiere variantes del puesto (ES/EN) con un click,
  para no perder candidatos por diferencias de nomenclatura.
- **Sugerencias con IA (opcional)**: cargando tu propia key gratuita de
  [Google AI Studio](https://aistudio.google.com/apikey) (botón "IA
  (opcional)" en la topbar), RADAR le pide a Gemini sinónimos de rol y
  atributos de nicho adicionales a los del diccionario estático. La key
  vive solo en el `localStorage` de tu navegador; sin key, la función
  directamente no aparece.
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
  index.html          punto de entrada
  css/styles.css       estilos (paleta e identidad Mindata)
  js/
    countries.js        datos: países LATAM + Europa, detección de ubicación
    keywords.js          datos: skills, industrias, seniority, sinónimos de rol
    networks.js           datos: redes soportadas
    extractor.js            parsing de la JD → campos RADAR (funciones puras)
    pdf-text.js             conserva líneas y espacios de los PDF leídos por pdf.js
    generator.js              construcción de booleanos y URLs (funciones puras)
    ai.js                       capa opcional de sugerencias con Gemini (prompt + parseo, funciones puras)
    tracking.js                   registro de uso por nombre (payload + fetch, funciones puras)
    app.js                          conecta el motor con el DOM
  assets/
    mindata-logo.png
    favicon.svg
  js/vendor/
    pdf.min.js           pdf.js, vendorizado localmente (sin CDN)
    pdf.worker.min.js
  tests/
    run.js               suite unitaria (node tests/run.js, sin dependencias)
    jd-bank.js            banco de regresion con JDs reales (node tests/jd-bank.js)
    ai.js                   tests de ai.js (node tests/ai.js)
    tracking.js                tests de tracking.js (node tests/tracking.js)
    market-matrix.js          roles y mercados de IT, no IT y telecomunicaciones
    pdf-text.js               regresión de extracción, validación y ubicación
```

`extractor.js` y `generator.js` no tocan el DOM ni hacen llamadas de red:
son funciones puras, lo que permite testearlas directamente con Node sin
levantar un navegador. `app.js` es la única capa que conoce el HTML.

## Correr los tests

```
node tests/run.js
node tests/jd-bank.js
node tests/locations.js
node tests/ai.js
node tests/tracking.js
node tests/market-matrix.js
node tests/pdf-text.js
```

Ver [`TESTING.md`](TESTING.md) para el detalle y
el checklist de QA manual.

## Probarlo en local

No hace falta build. Basta con levantar cualquier servidor estático desde
la carpeta del proyecto, por ejemplo:

```
npx serve .
```

o, si tenés Python:

```
python -m http.server 8080
```

y abrir `http://localhost:8080` (o el puerto que corresponda).

## Seguridad y privacidad

- Todo corre en el navegador. El `Content-Security-Policy` del `index.html`
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
- El archivo subido se valida por tipo y tamaño (.txt hasta 500 KB, .pdf
  hasta 8 MB) antes de leerlo. El PDF se parsea en el navegador con pdf.js
  vendorizado localmente — nunca se sube a ningún servidor.
- Todas las URLs armadas (Google, Bing, GitHub) codifican el query con
  `encodeURIComponent`.

## Dónde está desplegado

GitHub Pages, sirviendo directo desde la rama `main` de este repo:
**https://alexisgorino.github.io/radar-tool/**. Los cambios publicados en
`main` se despliegan mediante GitHub Pages. Algunas redes externas requieren
iniciar sesión para consultar sus resultados.

## Desplegarlo en otro lado

No hace falta cuenta ni tarjeta. Tres opciones, elegí la que te resulte
más cómoda:

### Opción A — Netlify Drop (más rápida, sin cuenta)

1. Andá a **app.netlify.com/drop**
2. Arrastrá la carpeta `radar-tool` completa a la página
3. En unos segundos te da una URL pública (algo como
   `nombre-random.netlify.app`)

Para que la URL quede fija y no se pierda, creá una cuenta gratuita
después (te lo ofrece la misma pantalla).

### Opción B — Vercel

1. Instalá la CLI una sola vez: `npm i -g vercel`
2. Desde adentro de la carpeta `radar-tool`, corré:
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
