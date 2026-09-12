# Testing

Dos capas: automatizada (lógica pura, corre en cada cambio) y manual
(flujo completo en navegador, antes de cada deploy).

## Automatizada

```
node tests/run.js        # tests unitarios: extractor, generator, seguridad
node tests/jd-bank.js    # tests de regresión con JDs reales
node tests/locations.js  # detección de provincias/estados/regiones, sin falsos positivos
```

272 casos en total, sin dependencias ni framework. `tests/run.js` cubre las
funciones puras una por una (detección de país, extracción de rol, armado
de booleanos, URLs). `tests/jd-bank.js` es la red de regresión: JDs reales
de Argentina, México, Colombia, Chile, Perú, Uruguay, Brasil, España,
Alemania, Reino Unido, Países Bajos e Italia, en español e inglés, con
distintos formatos de redacción ("buscamos", "se busca", "posición:",
"looking for", "X Developer with Y"), para agarrar retrocesos en precisión
antes de que lleguen a producción. `tests/locations.js` prueba que además
de capitales y ciudades grandes se detecten provincias/estados/regiones
(Neuquén, Jalisco, Cataluña, Baviera...) y que palabras comunes que se
parecen a un nombre de provincia (ej. "salta" como verbo) no disparen un
falso positivo.

Correr los tres antes de cualquier cambio a `extractor.js`, `generator.js`,
`keywords.js` o `countries.js` — son los módulos donde un cambio chico
rompe casos que no se ven a simple vista.

## Hallazgo importante: `site:` en Bing dejó de ser confiable

Probado en vivo (no es una suposición): `site:stackoverflow.com/users
terraform` en Bing devuelve una página de Zhihu (un sitio chino de
preguntas y respuestas) — Bing directamente ignora la restricción de
sitio. Se repitió el mismo resultado con `site:linkedin.com/in`. Por eso:

- LinkedIn ahora tiene un botón propio ("Buscar en LinkedIn") que usa el
  buscador nativo de LinkedIn en vez de X-Ray — no depende de que ningún
  buscador externo tenga indexados los perfiles.
- Para el resto de las redes (X-Ray por sitio), Google quedó como opción
  principal y Bing marcado como "menos confiable hoy" en la propia UI.
- Si ni Google trae nada, la salida es copiar el booleano y pegarlo a mano
  en el buscador propio del sitio (cuando lo tiene, como LinkedIn o los
  portales de empleo).

Esto no es algo que el código de RADAR pueda arreglar — es un cambio de
comportamiento de los buscadores externos. Si en el futuro Bing vuelve a
respetar `site:`, hay que revisar esta nota y la de la UI (`xrayNote` /
`NETWORK_DESCRIPTIONS.linkedin` en `js/app.js`).

## Auditoría completa contra buscadores reales (todas las redes)

Con Google momentáneamente sin captcha, se probaron en vivo las 10 redes
contra Google (no Bing) con dos perfiles reales (PM Ciberseguridad y Sr.
Backend Developer). Resultado, red por red:

| Red | Funciona vía Google | Nota |
|---|---|---|
| LinkedIn (X-Ray) | Sí | Trae perfiles reales y relevantes |
| LinkedIn (nativo) | Sí | Recomendado, no depende de indexación |
| GitHub (nativo) | Sí | Probado directo contra github.com |
| Stack Overflow | Sí | Trae perfiles técnicos reales |
| Xing | Sí | Trae perfiles reales |
| X / Twitter | Sí | Trae cuentas reales del rubro |
| Behance | Sí | Trae portfolios reales |
| CVs sueltos | Sí | Trae PDFs de CV reales |
| Otro sitio (custom) | Sí | Probado contra bumeran.com.ar |
| **Wellfound** | Corregido | El dominio apuntaba a `wellfound.com` (que Google llena de *avisos de trabajo*, no candidatos); corregido a `wellfound.com/u`, la ruta real de perfiles de personas. |
| **Indeed CVs** | **Sacada** | Google no tiene indexada `indeed.com/r` ni con términos genéricos — Indeed exige cuenta de reclutador para ver currículums, no hay nada público que buscar. Se probó marcarla como "no confiable" en la UI, pero a pedido se sacó del todo la red en vez de dejar una opción que no sirve. |

Conclusión operativa: Bing no sirve para X-Ray hoy (ver arriba), Google sí
y de forma consistente en las redes restantes. La UI ya recomienda Google
primero en todos los `platform-note`.

## "Relajar búsqueda"

Verificado en vivo: la versión completa del booleano de PM Ciberseguridad
(Rol AND Atributos AND Dominio AND Alcance) no encontraba a la persona
exacta que sí tenía ese cargo en su perfil de LinkedIn — Google, ante una
consulta sin resultados exactos, aflojaba la búsqueda por su cuenta y
mostraba resultados más genéricos. Sacando Dominio y Alcance del AND
(`relaxed=true` en `coreBlocks`/`buildUniversalBoolean`/`buildXRayQuery`/
`buildResumesQuery` en `generator.js`) la misma consulta encontró
directamente a alguien con el cargo exacto "PM Ciberseguridad" en su
perfil. El checkbox "Relajar búsqueda" en la UI expone esto con un click,
sin tener que borrar chips a mano.

## PDF real, subida completa (no solo texto ya extraído)

Verificado con los dos PDFs reales, subidos como archivo de verdad
(`File`/`DataTransfer` sobre el `<input type="file">`, el mismo camino que
un drag-and-drop real) para que `pdf.js` los lea dentro del navegador —
no inyectando el texto ya extraído a mano. Ambos casos completaron Rol,
Atributos, Dominio y Alcance correctamente y sin errores de consola.

También se generó un PDF sintético de 15 páginas (bastante más de los
20.000 caracteres de `MAX_INPUT_LENGTH`) para probar el límite real, no
solo en un test unitario con un string armado a mano. Medido desde adentro
de la página (sin esperas artificiales del lado del test, que habían
contaminado una primera medición): **339 ms** de principio a fin, JD
truncada a exactamente 20.000 caracteres, Rol/Atributos extraídos bien.
Sin problema de performance.

## Accesibilidad

- **Contraste de color (WCAG AA)**: calculado con la fórmula de luminancia
  relativa, no a ojo. El rojo de marca (`#F11423`) y el gris de texto
  secundario (`#7A7A7A`) daban 4.32:1 y 4.29:1 sobre blanco — por debajo
  del mínimo de 4.5:1 para texto normal (afectaba texto chico como
  `.hint`/`.platform-note` y los botones rojos con texto blanco). Ajustados
  a `#E71322` y `#767676` — visualmente el mismo color, ahora ≥4.5:1 en
  todos los pares texto/fondo relevantes del sitio.
- **Paneles laterales (Historial/Ayuda/Feedback) como diálogo real**:
  `role="dialog"` + `aria-modal="true"` + `aria-labelledby`. El foco se
  mueve adentro al abrir, queda atrapado con Tab/Shift+Tab mientras el
  panel está abierto (no se escapa al contenido de atrás), y vuelve al
  botón que lo abrió al cerrar (con Escape, con el botón ×, o clickeando
  afuera). Probado a mano con teclado en el navegador: abrir el panel de
  feedback (4 elementos enfocables), Tab x4 hasta el botón de enviar, un
  Tab más vuelve al botón de cerrar (no se escapa), Escape cierra y
  devuelve el foco al botón "¿Sugerencias o encontraste un bug?" original.

## Mobile

Verificado en viewport 375×812 después de todos los cambios de esta
sesión (Alcance/Refinar, sugerencias, botón de LinkedIn, "Relajar
búsqueda"): sin overflow horizontal (`scrollWidth === innerWidth`), grid
de campos en una columna, red tabs en flex-wrap, panel de ayuda e
historial ocupando el ancho disponible correctamente.

## Cobertura de skills más allá de tecnología

El banco de skills (`keywords.js`) estaba fuertemente sesgado a
tecnología/SAP/ciberseguridad y no tenía nada para marketing, RRHH,
finanzas o legal, a pesar de que `ROLE_SYNONYMS` ya contemplaba roles como
"vendedor" o "reclutador". Se agregaron términos específicos para esas
áreas (SEO/SEM/Google Ads, ATS/LinkedIn Recruiter, NIIF/Auditoría,
Compliance/Derecho Laboral, etc.) y más lenguajes de programación para
GitHub (Rust, Scala, Elixir, Dart, Perl, Objective-C, Haskell).

Probado en vivo contra Google: "Growth Marketing Manager" con SEO/SEM/
Google Ads en México encontró un match exacto de título y ubicación
("Jacobo Sacal Pérez - Growth Marketing Manager, Ciudad de México").
También se probó por primera vez el modo "buscar repositorios" de
GitHub (nunca se había probado en vivo) con Rust + mínimo de estrellas:
315 resultados reales y relevantes.

## Qué va en cada campo (y qué no)

Detectado en vivo probando una JD real de una agencia (ficha en tabla,
PDF) que devolvía el rol completamente roto ("CLIENTE W2M - PM
Ciberseguridad COD VACANTE KJRSab5BFeZS..."). La causa: un patrón de
regex demasiado ingenuo tomaba el encabezado de la tabla como si fuera el
valor. Corregido (`looksLikeTemplateNoise` en `extractor.js`), pero de
paso se redefinió qué corresponde a cada campo, porque "más términos" no
es "mejor booleano" — cada término de más filtra candidatos, no los
acerca:

- **Rol**: el título del puesto y sus sinónimos. Nunca un nombre de skill
  o de país suelto (`isBareNonRole` lo bloquea — "busco Java" no debe
  devolver "Java" como rol).
- **Atributos**: lo técnico y específico, priorizado por dónde aparece en
  el texto (`findMatchesRanked`), no por orden del banco de palabras.
  Términos genéricos (Scrum, Kanban, Agile, QA...) quedan al final y solo
  entran si sobra lugar bajo el tope (`MAX_ATTRIBUTES`, hoy 6).
- **Dominio**: como mucho 2 términos (`MAX_DOMINIO`), priorizados igual
  que Atributos — no todo lo que matchea en el banco de industrias
  merece estar (una carrera universitaria que menciona "Telecomunicaciones"
  de pasada no debería competir con la industria real de la vacante).
- **Alcance**: **solo país y localidad**. Modalidad (remoto/híbrido/
  presencial) y seniority ya no se agregan acá ni al booleano — casi
  nunca están escritos tal cual en un perfil público, así que ANDearlos
  no acerca candidatos, los excluye. `detectLocationDetailed` en
  `countries.js` devuelve país + la ciudad/provincia específica si la
  hay (ej. "España" + "Palma").
- **Refinar**: nunca se auto-completa (`refinar` siempre empieza vacío).
  Lo que el JD sugiere (seniority, modalidad) aparece como pills debajo
  del campo ("Sugerencias — click para excluir"), pero excluir algo es
  una decisión del reclutador, no algo que un match de palabra clave deba
  tomar solo.

Fixture de regresión: `tests/fixtures/pdf-table-template-jd.txt` es el
texto real extraído por pdf.js de esa JD (no una versión limpiada a
mano) — si un cambio futuro vuelve a romper la extracción con este tipo
de formato de tabla, `tests/jd-bank.js` lo va a agarrar. Una segunda JD
real de otra empresa, con un formato de prosa moderno completamente
distinto (el título solo al principio del documento, sin verbo ni
etiqueta), está guardada en `tests/fixtures/pdf-modern-template-jd.txt`
— ese caso dejó en evidencia dos bugs más: el rol quedaba vacío (no había
ningún patrón que lo capturara) y, probando la búsqueda de GitHub contra
GitHub de verdad, un "Sr." con punto en el texto libre hacía que GitHub
devolviera 0 resultados en vez de los 7 reales que trae la misma consulta
sin ese prefijo.

## "¿Esto es una JD?"

Si el texto pegado o subido no tiene ninguna señal real de ser una
descripción de puesto (ni rol, ni país, ni skills, ni dominio, ni una
palabra típica como "requisitos"/"responsabilidades"), "Analizar JD"
muestra un error en vez de completar los campos con ruido o dejarlos
vacíos en silencio (`isJobPosting` en `extractor.js`, umbral en
`countJobPostingSignals`). Un rol real detectado alcanza por sí solo
(ya pasó por los filtros anti-falso-positivo de `guessRol`), así que una
consulta corta manual como "busco un Backend Developer" sigue
aceptándose aunque no tenga ubicación ni skills.

Límite conocido y aceptado: esto no distingue de forma confiable una JD
de un CV — ambos son documentos profesionales que comparten vocabulario
("experiencia", skills, a veces hasta una industria). Sí rechaza con
confianza texto claramente no relacionado (una noticia, una receta, un
párrafo al azar), que era el caso que importaba resolver.

## Manual (checklist previo a deploy)

**Carga de JD**
- [ ] Pegar una JD larga (banco, LATAM) y tocar "Analizar JD" → los 5 campos
      se completan con valores sensatos, sin duplicados.
- [ ] Arrastrar un `.txt` a la zona de drop → se carga y analiza solo.
- [ ] Subir un `.pdf` con texto real (no escaneado) → se extrae el texto
      y se analiza solo, igual que un `.txt`.
- [ ] Subir un `.pdf` escaneado (solo imagen, sin texto) → aviso de que no
      se pudo extraer texto, no rompe nada.
- [ ] Subir un archivo que no sea `.txt` ni `.pdf` (ej. `.docx`) → mensaje
      de error, no rompe nada.
- [ ] Subir un `.txt` de más de 500 KB, o un `.pdf` de más de 8 MB →
      mensaje de error, no lo lee.
- [ ] JD vacía + "Analizar JD" → no crashea, no agrega campos basura.
- [ ] Pegar texto claramente no relacionado (una noticia, una receta) y
      analizar → mensaje de error ("no parece una descripción de puesto"),
      ningún campo se completa con ruido.

**Campos RADAR**
- [ ] Escribir un término y Enter en cada uno de los 5 campos → aparece
      como chip.
- [ ] Escribir el mismo término dos veces → no se duplica.
- [ ] Sacar un chip con la × → desaparece y no rompe el resto.
- [ ] Elegir un país del selector de Alcance → se agrega como chip.
- [ ] Escribir un rol con sinónimo conocido (ej. "Desarrollador") → aparecen
      pills de sinónimos abajo del campo; click en una la agrega a Rol.
- [ ] Analizar una JD que mencione modalidad o seniority (ej. "remoto",
      "senior") → esos términos NO aparecen como chips en Alcance ni en
      Refinar; aparecen como pills debajo de Refinar ("Sugerencias —
      click para excluir") y solo se agregan como chip si se clickean.
- [ ] Analizar una JD que mencione una ciudad/provincia además del país
      (ej. "Rosario, Argentina") → Alcance queda con ambos chips
      (país + localidad), con acentos y mayúsculas correctos.

**Generar booleano**
- [ ] Generar sin cargar Rol → error inline, no genera.
- [ ] Generar con los 5 campos cargados → booleano universal + X-Ray
      correctos, comillas solo en términos con espacio.
- [ ] Cambiar de red (LinkedIn → GitHub → Stack Overflow → CVs sueltos →
      Otro sitio) y volver a generar → cada una arma su propia query/URL.
- [ ] Modo GitHub, buscar repos con mínimo de estrellas → el filtro
      `stars:>N` aparece en la URL.
- [ ] "Otro sitio" con un dominio custom (ej. `bumeran.com.ar`) → el
      `site:` de la X-Ray usa ese dominio.
- [ ] Botones "Abrir en Google" / "Abrir en Bing" → abren en pestaña nueva
      con la query ya cargada.
- [ ] "Copiar" en cada caja de resultado → el portapapeles tiene el texto
      exacto mostrado.

**Historial**
- [ ] Generar 2-3 búsquedas distintas → aparecen en el panel de Historial,
      más reciente primero.
- [ ] Click en un ítem del historial → restaura los 5 campos, la red, y
      vuelve a generar.
- [ ] "Borrar historial" → vacía la lista.
- [ ] Cerrar la pestaña y volver a abrir la página → el historial persiste
      (es `localStorage`, no depende de la sesión).
- [ ] Abrir la página en modo incógnito / otro navegador → el historial no
      aparece (confirma que es local a ese navegador, no compartido).

**Responsive / accesibilidad**
- [ ] Viewport mobile (375px) → el grid de campos RADAR pasa a una
      columna, nada se corta ni desborda horizontalmente.
- [ ] Navegar los inputs con Tab → orden lógico, se ve el foco.
- [ ] Ctrl/Cmd + Enter desde cualquier campo → dispara "Armar booleano".
- [ ] Escape con un panel lateral abierto (Historial/Ayuda) → lo cierra.

**Reportar bug/sugerencia**
- [ ] Abrir el panel sin escribir nada y tocar "Enviar" → pide completar
      el texto, no manda nada.
- [ ] Elegir "Alexis", escribir un texto y enviar → un solo POST a
      `formsubmit.co/ajax/alexis.gorino@mindata.es`, mensaje de éxito.
- [ ] Elegir "Ambos" → dos POST en paralelo (Alexis + Franco), éxito solo
      si los dos responden bien.
- [ ] Cortar la red (o bloquear `formsubmit.co`) y enviar → mensaje de
      error claro, el botón vuelve a habilitarse.
- Nota: la primera vez que se usa una dirección nueva, FormSubmit le pide
  a esa dirección confirmar con un click antes de reenviar de verdad —
  hay que hacerlo una vez por cada mail (Alexis y Franco).

**Consola**
- [ ] Sin errores en la consola del navegador durante todo el flujo de
      arriba.
