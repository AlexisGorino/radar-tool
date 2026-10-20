# Seguridad y privacidad

## Modelo de amenaza

El input no confiable es el texto de la JD que pega o sube el usuario.
Puede venir de cualquier lado (mail, portal, Word convertido a texto), así
que se trata siempre como texto plano, nunca como markup.

## Controles implementados

**Red limitada a las integraciones de RADAR.** `connect-src` en la CSP sólo
permite el propio origen, el Worker de RADAR (análisis y búsqueda),
`https://formsubmit.co` (feedback), `https://generativelanguage.googleapis.com`
(sugerencias opcionales con Gemini) y `https://script.google.com` más
`https://script.googleusercontent.com` (registro de uso). El análisis de JD
llama al Worker desde `app.js`; la búsqueda pública también. Gemini solo se
usa si la persona carga su propia clave y solicita esa función.

**Sin `innerHTML` sobre input de usuario.** Todo lo que viene del usuario
(términos de los chips, texto de la JD, nombre de archivo) se inserta con
`textContent`, que el navegador nunca interpreta como HTML/JS. Los únicos
usos de `innerHTML` en `app.js` son para vaciar contenedores (`wrap.innerHTML = ""`)
antes de repoblarlos con nodos creados por `document.createElement`.

**CSP restrictiva.** `script-src 'self'`, `style-src 'self'`, `base-uri 'none'`,
`form-action 'none'`. No se cargan scripts ni estilos de terceros — no hay
CDN, no hay analytics, no hay fuentes externas.

**Validación de archivos.** El upload/drag-and-drop acepta `.txt` (hasta
500 KB), `.pdf` y `.docx` (hasta 8 MB) — cualquier otro tipo se rechaza antes de
leer un solo byte (`MAX_TXT_BYTES` / `MAX_PDF_BYTES` / `MAX_DOCX_BYTES` en `app.js`). El
contenido leído además se trunca a 20.000 caracteres (`MAX_INPUT_LENGTH` en
`extractor.js`) antes de procesarlo, para no colgar el regex engine con un
archivo patológico.

**Lectura de PDF sin subir el archivo.** El parseo de `.pdf` usa pdf.js
(Mozilla), vendorizado en `js/vendor/` — se sirve desde el mismo origen,
no desde un CDN. El archivo se decodifica localmente y nunca se sube a
ningún lado. La CSP agrega
`worker-src 'self' blob:` porque pdf.js corre el parseo en un Web Worker
propio; sigue sin admitir orígenes externos.

**Lectura de Word sin subir el archivo.** Mammoth extrae solo texto plano
de `.docx`; RADAR lo inserta con `textContent`. La librería se sirve desde
`js/vendor/` y no transmite el archivo a terceros.

**Tags HTML en el texto de la JD.** Si alguien pega una JD con `<script>` o
cualquier otro tag embebido, `extractor.js` los descarta antes de intentar
extraer el rol (`stripTags`). No es una medida de seguridad — `textContent`
ya lo cubre — es para que la sugerencia de rol no quede con basura de markup.

**URLs codificadas.** Toda URL armada hacia Google, Bing o GitHub pasa por
`encodeURIComponent` antes de concatenarse (`generator.js`), evitando que un
término con caracteres especiales rompa la URL o inyecte parámetros.

## Pantalla de acceso (`js/gate.js` + `AccessGateComponent`)

Es una puerta de recepción, no una cerradura. El repo es público en GitHub,
así que la contraseña ("MinDataTeam") está a un click de "ver código fuente"
de cualquiera que la busque — esto **no** es control de acceso real, y no
hay que tratarlo como si protegiera algo. Lo que sí hace: evita que la
herramienta se abra en frío para un visitante casual que llega al link
público (un buscador que la indexó, alguien que la reenvió sin contexto),
sin agregar backend, cuentas ni fricción para el equipo. Una vez tipeada
correctamente, se guarda en `localStorage` (`radar-auth-v1`) para no
volver a pedirla en ese navegador. Si en algún momento se necesita
protección de verdad (por ejemplo, si la JD que se pega empezara a incluir
datos sensibles), esto hay que reemplazarlo por autenticación real del lado
del servidor — un password compartido en JS del lado del cliente nunca
puede serlo, sin importar cuánto se lo ofusque.

## Excepción: feedback por mail (`sendFeedbackTo`)

El botón "¿Sugerencias o encontraste un bug?" es la primera función del
sitio que hace una llamada de red. Manda lo que la persona escribió a
[FormSubmit](https://formsubmit.co) (`POST` a `formsubmit.co/ajax/<email>`),
que lo reenvía por mail a Alexis, a Franco o a ambos según lo que elija
quien reporta. No hay backend propio ni base de datos: FormSubmit es un
relay gratuito sin cuenta, pensado justo para formularios de sitios
estáticos. La llamada de red sólo ocurre cuando la persona toca "Enviar" —
nunca automáticamente. El formulario tiene además un honeypot
(`#feedbackWebsite`, oculto por CSS y por `aria-hidden`, nunca visible ni
para una persona ni para un lector de pantalla): un bot que completa cada
`<input>` de la página lo va a llenar, una persona real nunca lo ve — si
llega con contenido, el envío se cancela en silencio antes de tocar la red.
Nota operativa: la primera vez que se le manda algo
a una dirección nueva, FormSubmit le exige a esa dirección confirmar con
un click en un mail de activación antes de empezar a reenviar de verdad —
tanto Alexis como Franco necesitan hacer ese click una vez cada uno.

## La excepción opcional: IA con Gemini (`js/ai.js`)

Función opt-in, apagada por defecto. El botón "IA (opcional)" de la topbar
abre un panel donde cada usuario carga su **propia** key de [Google AI
Studio](https://aistudio.google.com/apikey) (nivel gratuito). Esa key:

- se guarda únicamente en el `localStorage` de ese navegador
  (`radar-gemini-key-v1`) — nunca en el código, nunca en un commit, nunca en
  un servidor de Mindata;
- nunca se comparte entre usuarios ni entre navegadores;
- es visible sólo enmascarada (últimos 4 caracteres) una vez guardada.

Con una key cargada, el botón "Sugerir con IA" (al lado de los sinónimos de
Rol) manda el Rol elegido más un extracto de la JD (primeros 4.000
caracteres) directo desde el navegador a la API de Gemini —
`generativelanguage.googleapis.com`, nunca pasa por infraestructura de
Mindata — y recibe de vuelta sinónimos de rol y atributos de nicho, que se
muestran como pills clickeables: nada se agrega al booleano sin que la
persona lo elija a mano, igual que los sinónimos estáticos de
`keywords.js`. Sin key guardada, el botón directamente no aparece y
`js/ai.js` no hace ninguna llamada.

Si una key de Gemini se expone por error (pegada en un lugar público,
commiteada por accidente), hay que rotarla desde AI Studio — no hay forma
de invalidarla desde RADAR mismo, porque RADAR no tiene backend que la
custodie.

## Lectura automática con Cloudflare Workers AI

Al tocar "Analizar descripción" o "Analizar perfil", el navegador envía el
texto extraído al Worker de RADAR y éste llama a Workers AI. El código intenta
reemplazar correos y teléfonos reconocibles antes de la inferencia; la limpieza
por patrones no garantiza detectar todos los datos personales. El Worker no
escribe el texto en logs ni lo guarda en una base de datos. Cloudflare explica
el tratamiento en su [política de uso de datos de Workers AI](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

La IA separa señales, propone funciones de referencia y devuelve fragmentos
de evidencia. RADAR verifica que las citas literales aparezcan en el texto; las
funciones se muestran como sugerencias, nunca se incorporan sin elección de la
persona. La búsqueda queda bloqueada mientras la lectura está pendiente. Si la
IA falla, RADAR informa el fallo y permite completar el análisis local.

## Excepción: registro de uso por nombre (`js/tracking.js`)

A diferencia de las dos excepciones anteriores, ésta **no es opt-in**: es
parte del gate de acceso. La primera vez que alguien entra a RADAR en un
navegador, además de la contraseña de equipo tiene que poner su nombre y
apellido — eso queda guardado en `localStorage` (`radar-user-v1`) y no se
vuelve a pedir en ese navegador.

Con esa identidad guardada, `RadarTracking.logEvent(...)` manda un `POST`
a un Apps Script propio de Mindata (Google Sheet "RADAR — Uso", cuenta
`mindata.es`) en dos momentos: al hacer el check-in (`evento: "check_in"`)
y cada vez que se toca "Armar booleano" (`evento: "generar_booleano"`, con
la red elegida). El payload es **siempre** `{ nombre, apellido, evento,
timestamp, red? }` — nunca el texto de la JD, nunca los campos Rol/
Atributos/Dominio/Alcance/Refinar, nunca el booleano generado. Esto es
intencional: sirve para saber quién usa la herramienta y con qué
frecuencia, no para auditar qué buscó cada quien.

Es **fire-and-forget**: la llamada va después de que el booleano ya se
generó y se ve en pantalla, envuelta en un `catch` silencioso — si Sheets
no responde (sin conexión, cuota agotada, endpoint caído), no afecta en
nada al resto de RADAR, simplemente se pierde ese evento. Ver `js/tracking.js`.

## Persistencia

- RADAR no persiste el texto de la JD. Durante el análisis se envía al Worker y
  al modelo para procesarlo; durante la búsqueda se envían solo consultas
  resumidas y ubicación al proveedor. La retención que aplique cada proveedor
  está sujeta a sus políticas.
- El historial de búsquedas (opcional): se guarda en `localStorage` del
  navegador que lo generó. No sale de esa máquina, no se sincroniza, no lo
  ve nadie más que esa persona en ese navegador.

## Qué pasa si falla algo

Los textos de búsqueda y los perfiles públicos consultados deben tratarse como
información de trabajo. No pegues datos sensibles de candidatos; las ofertas y
briefs pueden contener información confidencial aunque no incluyan datos
personales.
