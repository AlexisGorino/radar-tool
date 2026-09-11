# RADAR — Generador de booleanos

Herramienta de sourcing de Mindata, creada por **Ale Gorino** y **Franco Velazco**.
Convierte una JD en un booleano preciso y en variantes listas para LinkedIn,
Google/Bing (X-Ray), GitHub, Indeed, Behance, CVs sueltos en PDF/Word y otras redes.

Pensada para el uso diario de un reclutador: sin cuentas, sin backend, sin
dependencias externas. Corre igual abierto como archivo local, en Netlify,
en Vercel, en GitHub Pages o publicada como página estática en cualquier lado.

## Funcionalidad

- **Método RADAR**: Rol, Atributos, Dominio, Alcance, Refinar — cinco campos
  que arman el booleano.
- **Analizador de JD**: pegá o arrastrá una JD y el detector completa los
  campos solo (rol, skills, industria, país, modalidad, seniority).
- **Sinónimos de rol**: sugiere variantes del puesto (ES/EN) con un click,
  para no perder candidatos por diferencias de nomenclatura.
- **Redes soportadas**: LinkedIn, GitHub (búsqueda nativa de personas o
  repos), Stack Overflow, Indeed CVs, Xing, X/Twitter, Wellfound, Behance,
  búsqueda de CVs sueltos (PDF/Word en toda la web) y cualquier sitio custom.
- **Historial de búsquedas**: guarda las últimas 20 búsquedas en el propio
  navegador (no en un servidor) para recuperarlas con un click.
- **Atajo de teclado**: Ctrl/Cmd + Enter arma el booleano desde cualquier campo.
- **Ayuda integrada**: panel con la explicación del método RADAR.

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
    generator.js              construcción de booleanos y URLs (funciones puras)
    app.js                      conecta el motor con el DOM
  assets/
    mindata-logo.png
    favicon.svg
  tests/run.js         suite de tests (node tests/run.js, sin dependencias)
```

`extractor.js` y `generator.js` no tocan el DOM ni hacen llamadas de red:
son funciones puras, lo que permite testearlas directamente con Node sin
levantar un navegador. `app.js` es la única capa que conoce el HTML.

## Correr los tests

```
node tests/run.js
```

46 tests. Cubre extracción de rol, detección de país (LATAM + Europa, sin
falsos positivos entre países), detección de skills/industria, sinónimos de
rol, construcción de booleanos (largo acotado, comillas, exclusiones),
generación de URLs (Google, Bing, GitHub, CVs sueltos) y un caso de
seguridad (texto con HTML/script embebido no se ejecuta ni se interpreta).

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

- Todo corre en el navegador. No hay llamadas de red salientes: el `Content-
  Security-Policy` del `index.html` incluye `connect-src 'none'`.
- Ningún texto de la JD se envía a ningún servidor ni se guarda ahí.
- El historial de búsquedas (opcional) se guarda solo en `localStorage` del
  propio navegador — nunca sale de la máquina del usuario.
- El texto ingresado por el usuario siempre se inserta en la página con
  `textContent`, nunca con `innerHTML`, así que no hay forma de inyectar
  HTML o JavaScript pegando una JD maliciosa.
- El archivo subido se valida por tipo y tamaño (.txt, máx. 500 KB) antes
  de leerlo.
- Todas las URLs armadas (Google, Bing, GitHub) codifican el query con
  `encodeURIComponent`.

## Desplegarlo gratis

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

## Créditos

© Mindata. Todos los derechos reservados.
Creado por Ale Gorino y Franco Velazco.
