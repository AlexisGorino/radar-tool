# Seguridad y privacidad

## Modelo de amenaza

El input no confiable es el texto de la JD que pega o sube el usuario.
Puede venir de cualquier lado (mail, portal, Word convertido a texto), así
que se trata siempre como texto plano, nunca como markup.

## Controles implementados

**Sin red.** `index.html` fija `connect-src 'none'` en su Content-Security-
Policy. No hay `fetch`, `XMLHttpRequest`, `WebSocket` ni beacons en ningún
archivo del proyecto — se puede confirmar con `grep -r "fetch\|XMLHttpRequest" js/`
y da cero resultados. El texto de la JD nunca sale del navegador.

**Sin `innerHTML` sobre input de usuario.** Todo lo que viene del usuario
(términos de los chips, texto de la JD, nombre de archivo) se inserta con
`textContent`, que el navegador nunca interpreta como HTML/JS. Los únicos
usos de `innerHTML` en `app.js` son para vaciar contenedores (`wrap.innerHTML = ""`)
antes de repoblarlos con nodos creados por `document.createElement`.

**CSP restrictiva.** `script-src 'self'`, `style-src 'self'`, `base-uri 'none'`,
`form-action 'none'`. No se cargan scripts ni estilos de terceros — no hay
CDN, no hay analytics, no hay fuentes externas.

**Validación de archivos.** El upload/drag-and-drop acepta `.txt` (hasta
500 KB) y `.pdf` (hasta 8 MB) — cualquier otro tipo se rechaza antes de
leer un solo byte (`MAX_TXT_BYTES` / `MAX_PDF_BYTES` en `app.js`). El
contenido leído además se trunca a 20.000 caracteres (`MAX_INPUT_LENGTH` en
`extractor.js`) antes de procesarlo, para no colgar el regex engine con un
archivo patológico.

**Lectura de PDF sin salir del navegador.** El parseo de `.pdf` usa pdf.js
(Mozilla), vendorizado en `js/vendor/` — se sirve desde el mismo origen,
no desde un CDN. No hay excepción a `connect-src 'none'`: el archivo se
decodifica localmente y nunca se sube a ningún lado. La CSP agrega
`worker-src 'self' blob:` porque pdf.js corre el parseo en un Web Worker
propio; sigue sin admitir orígenes externos.

**Tags HTML en el texto de la JD.** Si alguien pega una JD con `<script>` o
cualquier otro tag embebido, `extractor.js` los descarta antes de intentar
extraer el rol (`stripTags`). No es una medida de seguridad — `textContent`
ya lo cubre — es para que la sugerencia de rol no quede con basura de markup.

**URLs codificadas.** Toda URL armada hacia Google, Bing o GitHub pasa por
`encodeURIComponent` antes de concatenarse (`generator.js`), evitando que un
término con caracteres especiales rompa la URL o inyecte parámetros.

## La única excepción intencional

El botón "¿Sugerencias o encontraste un bug?" arma un enlace `mailto:` con
lo que la persona escribió en el formulario, dirigido a Ale y Franco. Es la
única función del sitio que puede terminar mandando algo fuera del
navegador — y sólo pasa si la persona confirma el envío desde su propio
cliente de mail. No hay ningún `fetch`/`XMLHttpRequest` involucrado.

## Qué NO se guarda en ningún lado

- El texto de la JD: vive sólo en memoria del navegador mientras la pestaña
  está abierta. Cerrarla lo borra.
- El historial de búsquedas (opcional): se guarda en `localStorage` del
  navegador que lo generó. No sale de esa máquina, no se sincroniza, no lo
  ve nadie más que esa persona en ese navegador.

## Qué pasa si falla algo

No hay cuentas, contraseñas ni datos personales sensibles que proteger más
allá del contenido de la JD, que por definición ya es información pública o
semi-pública (una vacante publicada). El peor escenario de un bug acá es una
búsqueda mal armada, no una fuga de datos — no hay dónde fugarlos.
