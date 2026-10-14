# Búsqueda pública de perfiles

El frontend de GitHub Pages no contiene credenciales. `worker.mjs` es un proxy
de alcance limitado para SerpApi; acepta hasta dos consultas `site:` por
solicitud (LinkedIn y GitHub), pide resultados públicos de Google, valida
dominio/ruta y devuelve únicamente título, fragmento, URL y posición. No
persiste consultas ni perfiles.

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

## Límites funcionales

- El proveedor busca páginas públicas indexadas; no consulta LinkedIn Recruiter,
  perfiles privados, ATS ni disponibilidad de una persona.
- LinkedIn se consulta como una búsqueda X-Ray corta: cargo y un máximo de dos
  señales alternativas, más la localidad. Los requisitos marcados como
  imprescindibles se conservan todos. Los perfiles de GitHub se consultan con
  los filtros compatibles con su API y solo se muestran si la ubicación exacta,
  una señal del puesto y la familia de rol aparecen en su bio pública; por eso
  esta fuente puede devolver pocos perfiles.
- Se seleccionan LinkedIn, GitHub o ambas fuentes. El Worker devuelve hasta 20
  enlaces por búsqueda (hasta 10 por fuente según la página pública consultada)
  y alterna fuentes antes de que el frontend ordene por señales visibles. Cada
  fuente consume una consulta del proveedor; el Worker valida el plan y el cupo
  antes de iniciar búsquedas.
- La ciudad/región más específica debe aparecer en el fragmento para que RADAR
  la marque como visible. La búsqueda que incluya el país pero no la ciudad se
  etiqueta como ubicación sin confirmar.
- El plan gratis de SerpApi mantiene búsquedas y resultados en su sistema por
  hasta 31 días. RADAR envía solo el booleano resumido (nunca la JD completa),
  pero no puede impedir esa retención del proveedor.
- El gate de contraseña de GitHub Pages es una pantalla de cliente, no una
  autenticación corporativa. El rate limit reduce abuso casual, pero no sustituye
  identidad individual ni Cloudflare Access. El cupo del proveedor debe quedarse
  en el plan gratuito para impedir cargos.
