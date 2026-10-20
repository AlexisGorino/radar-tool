# Búsqueda pública de perfiles

El frontend de GitHub Pages no contiene credenciales. `worker.mjs` consulta
Google, Bing y Yahoo mediante la misma cuenta SerpApi en hasta tres variantes
por búsqueda de LinkedIn; consulta la API pública de GitHub directamente.
Valida dominio/ruta y devuelve
título, fragmento, URL y posición. No persiste consultas ni perfiles.

El mismo Worker expone `/api/analyze`, enlazado a Cloudflare Workers AI. Analiza
el texto cuando la persona inicia esa acción; intenta retirar correos y
teléfonos detectables y no registra ni almacena el contenido. No requiere una
API key de Gemini ni otro secreto. El uso depende de la cuota de Workers AI de
la cuenta.

## Configuración segura

1. Crear una cuenta SerpApi y comprobar que el plan activo es el gratuito. El
   proveedor publica 250 búsquedas mensuales gratis; el endpoint cobra una
   búsqueda por fuente seleccionada, no por perfil devuelto. No habilitar un
   plan pago ni facturación automática para esta integración.
2. Revisar y aceptar las condiciones del proveedor solo si la persona que opera
   la cuenta está autorizada a hacerlo por Mindata. El plan gratuito no incluye
   las protecciones legales que el proveedor reserva para algunos planes pagos.
3. Instalar Wrangler en un entorno local, ejecutar `npx wrangler login` y
   desplegar desde `backend/` con `npx wrangler deploy`.
4. Cargar la clave sin imprimirla en consola ni guardarla en Git:
   `npx wrangler secret put SERPAPI_KEY`.
5. Verificar `ALLOWED_ORIGIN` en `wrangler.toml` y cambiar el `namespace_id` de
   rate limiting por un entero libre en la cuenta Cloudflare. El Worker limita
   diez solicitudes por IP por minuto para no bloquear tan rápido a equipos que
   comparten red. Antes de llamar a los motores, consulta la API gratuita de cuenta
   para comprobar cupo mensual y horario; falla cerrada si no puede verificarlo.
   Cloudflare cuenta por IP compartida y su limitador es una defensa aproximada,
   no un medidor contable del proveedor.
   El binding `AI` de `wrangler.toml` habilita `/api/analyze` sin crear ni
   guardar otra clave. Workers AI tiene una cuota gratuita por cuenta; al
   agotarse, RADAR sigue con el análisis local y pide revisar los campos.
6. Copiar la URL `https://<worker>.<cuenta>.workers.dev/api/search` a la meta
   `radar-search-endpoint` en `src/index.html` y agregar **solo el origen exacto**
   (`https://<worker>.<cuenta>.workers.dev`) a `connect-src` en la CSP. Ejecutar
   build y publicar el frontend. No se agrega ninguna clave al cliente.
7. No se necesita una segunda clave para Bing ni Yahoo: SerpApi ofrece esos
   motores con la clave actual y el mismo límite gratuito de 250 consultas al
   mes. Brave queda fuera porque pide tarjeta y no hace falta sumar otro proveedor.

## Límites funcionales

- El proveedor busca páginas públicas indexadas; no consulta LinkedIn Recruiter,
  perfiles privados, ATS ni disponibilidad de una persona.
- LinkedIn se consulta mediante hasta tres búsquedas X-Ray cortas: por cargo,
  por habilidades sin título y por habilidades sin sector. Todas conservan
  localidad, país y requisitos imprescindibles. Los perfiles de GitHub se consultan con
  los filtros compatibles con su API y solo se muestran si la ubicación exacta,
  una señal del puesto y la familia de rol aparecen en su bio pública; por eso
  esta fuente puede devolver pocos perfiles.
- LinkedIn consume hasta tres búsquedas SerpApi por búsqueda de RADAR: Google,
  Bing y Yahoo usan una variante cada uno. Todos conservan cargo/señales y
  localidad/país; el backend comprueba el cupo común antes de consultar. Si queda
  menos cupo mensual u horario, RADAR usa las consultas que todavía puede pagar
  y lo indica como resultado parcial; si no puede comprobar el plan gratuito,
  no consulta al proveedor. GitHub no consume
  búsquedas SerpApi. Se seleccionan LinkedIn, GitHub o ambas fuentes. El Worker
  devuelve hasta 20 enlaces por búsqueda (hasta 10 perfiles enriquecidos de
  GitHub) y alterna fuentes antes de que el frontend ordene por señales visibles.
  Comprueba el cupo antes de iniciar consultas.
- La ciudad/región más específica debe aparecer en el fragmento para que RADAR
  la marque como visible. La búsqueda que incluya el país pero no la ciudad se
  etiqueta como ubicación sin confirmar.
- Si se seleccionan varias ciudades, LinkedIn las incluye como alternativas y
  GitHub consulta cada localidad por separado (máximo tres). En ambos casos el
  filtro final exige ciudad y país; Santiago en Chile no coincide con Santiago
  de Compostela, España.
- Para buscar perfiles, SerpApi recibe consultas resumidas de cargo, señales y
  ubicación; no recibe la JD completa. SerpApi puede conservar esas consultas
  hasta 31 días. El análisis con Workers AI sí envía el texto extraído al Worker
  y al modelo cuando la persona toca "Analizar"; el código intenta quitar
  emails y teléfonos detectables y no guarda el texto.
- El Worker devuelve tiempos por fuente, un tiempo total y una referencia de
  búsqueda. Cloudflare puede mostrar un evento agregado `radar_public_search`
  (estado, conteos, duración y códigos de error) para diagnosticar fallas. El
  evento no registra términos de búsqueda, JD, nombres, enlaces de perfiles ni IP.
- El gate de contraseña de GitHub Pages es una pantalla de cliente, no una
  autenticación corporativa. El rate limit reduce abuso casual, pero no sustituye
  identidad individual ni Cloudflare Access. El cupo del proveedor debe quedarse
  en el plan gratuito para impedir cargos.

## Cobertura de motores

- La búsqueda automática usa Google, Bing y Yahoo vía SerpApi para localizar
  páginas públicas indexadas de LinkedIn. No es una API oficial de LinkedIn ni
  accede a LinkedIn Recruiter. Cada motor devuelve candidatos desde su propio
  índice; RADAR valida URL, señales y ubicación con las mismas reglas.
- GitHub se consulta mediante su API pública oficial. RADAR no hace scraping de
  resultados HTML ni simula resultados de motores que no respondieron.
- La API propia de Bing de Microsoft fue retirada, pero Bing se integra aquí por
  el adaptador de SerpApi. Yahoo también se integra por SerpApi. Ambas llamadas
  consumen el cupo gratuito existente; no son APIs oficiales de LinkedIn, Bing
  ni Yahoo.
