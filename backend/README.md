# Búsqueda pública de perfiles

El frontend de GitHub Pages no contiene credenciales. `worker.mjs` consulta
Google mediante SerpApi en hasta tres variantes por búsqueda de LinkedIn y
consulta la API pública de GitHub directamente. Valida dominio/ruta y devuelve
título, fragmento, URL y posición. No persiste consultas ni perfiles.

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
   comparten red. Antes de llamar a Google, consulta la API gratuita de cuenta
   para comprobar cupo mensual y horario; falla cerrada si no puede verificarlo.
   Cloudflare cuenta por IP compartida y su limitador es una defensa aproximada,
   no un medidor contable del proveedor.
6. Copiar la URL `https://<worker>.<cuenta>.workers.dev/api/search` a la meta
   `radar-search-endpoint` en `src/index.html` y agregar **solo el origen exacto**
   (`https://<worker>.<cuenta>.workers.dev`) a `connect-src` en la CSP. Ejecutar
   build y publicar el frontend. No se agrega ninguna clave al cliente.
7. No configurar una API de Bing o Brave para el modo gratuito. La API de Bing
   ya no está disponible; Brave requiere tarjeta aunque su crédito mensual sea
   gratuito. Bing y LinkedIn quedan disponibles como búsquedas directas desde
   la interfaz, sin consumo del cupo de RADAR.

## Límites funcionales

- El proveedor busca páginas públicas indexadas; no consulta LinkedIn Recruiter,
  perfiles privados, ATS ni disponibilidad de una persona.
- LinkedIn se consulta mediante hasta tres búsquedas X-Ray cortas: por cargo,
  por habilidades sin título y por habilidades sin sector. Todas conservan
  localidad, país y requisitos imprescindibles. Los perfiles de GitHub se consultan con
  los filtros compatibles con su API y solo se muestran si la ubicación exacta,
  una señal del puesto y la familia de rol aparecen en su bio pública; por eso
  esta fuente puede devolver pocos perfiles.
- LinkedIn consume hasta tres búsquedas SerpApi por búsqueda de RADAR; el Worker
  comprueba el cupo gratuito para las tres antes de iniciar. GitHub no consume
  búsquedas SerpApi. Se seleccionan LinkedIn, GitHub o ambas fuentes. El Worker
  devuelve hasta 20 enlaces por búsqueda (hasta 10 perfiles enriquecidos de
  GitHub) y alterna fuentes antes de que el frontend ordene por señales visibles.
  Comprueba el cupo antes de iniciar consultas.
- La ciudad/región más específica debe aparecer en el fragmento para que RADAR
  la marque como visible. La búsqueda que incluya el país pero no la ciudad se
  etiqueta como ubicación sin confirmar.
- SerpApi puede conservar consultas hasta 31 días. RADAR envía solo cargo, señales y ubicación
  (nunca la JD completa), pero no puede impedir la retención de cada proveedor.
- El gate de contraseña de GitHub Pages es una pantalla de cliente, no una
  autenticación corporativa. El rate limit reduce abuso casual, pero no sustituye
  identidad individual ni Cloudflare Access. El cupo del proveedor debe quedarse
  en el plan gratuito para impedir cargos.
