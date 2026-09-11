# Testing

Dos capas: automatizada (lógica pura, corre en cada cambio) y manual
(flujo completo en navegador, antes de cada deploy).

## Automatizada

```
node tests/run.js       # 48 tests unitarios: extractor, generator, seguridad
node tests/jd-bank.js   # 123 tests de regresión con JDs reales
```

171 casos en total, sin dependencias ni framework. `tests/run.js` cubre las
funciones puras una por una (detección de país, extracción de rol, armado
de booleanos, URLs). `tests/jd-bank.js` es la red de regresión: JDs reales
de Argentina, México, Colombia, Chile, Perú, Uruguay, Brasil, España,
Alemania, Reino Unido, Países Bajos e Italia, en español e inglés, con
distintos formatos de redacción ("buscamos", "se busca", "posición:",
"looking for", "X Developer with Y"), para agarrar retrocesos en precisión
antes de que lleguen a producción.

Correr ambos antes de cualquier cambio a `extractor.js`, `generator.js`,
`keywords.js` o `countries.js` — son los módulos donde un cambio chico
rompe casos que no se ven a simple vista.

## Manual (checklist previo a deploy)

**Carga de JD**
- [ ] Pegar una JD larga (banco, LATAM) y tocar "Analizar JD" → los 5 campos
      se completan con valores sensatos, sin duplicados.
- [ ] Arrastrar un `.txt` a la zona de drop → se carga y analiza solo.
- [ ] Subir un archivo que no sea `.txt` (ej. `.pdf`) → mensaje de error,
      no rompe nada.
- [ ] Subir un `.txt` de más de 500 KB → mensaje de error, no lo lee.
- [ ] JD vacía + "Analizar JD" → no crashea, no agrega campos basura.

**Campos RADAR**
- [ ] Escribir un término y Enter en cada uno de los 5 campos → aparece
      como chip.
- [ ] Escribir el mismo término dos veces → no se duplica.
- [ ] Sacar un chip con la × → desaparece y no rompe el resto.
- [ ] Elegir un país del selector de Alcance → se agrega como chip.
- [ ] Escribir un rol con sinónimo conocido (ej. "Desarrollador") → aparecen
      pills de sinónimos abajo del campo; click en una la agrega a Rol.

**Generar booleano**
- [ ] Generar sin cargar Rol → error inline, no genera.
- [ ] Generar con los 5 campos cargados → booleano universal + X-Ray
      correctos, comillas solo en términos con espacio.
- [ ] Cambiar de red (LinkedIn → GitHub → Indeed → CVs sueltos → Otro
      sitio) y volver a generar → cada una arma su propia query/URL.
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

**Consola**
- [ ] Sin errores en la consola del navegador durante todo el flujo de
      arriba.
