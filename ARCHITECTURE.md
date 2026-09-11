# Arquitectura

Monolito estático de una sola capa de presentación. Sin backend, sin build
step, sin bundler. Se eligió a propósito: el objetivo es que cualquiera del
equipo pueda abrir `index.html` y entender el flujo completo en minutos, y
que el deploy sea arrastrar una carpeta a un hosting estático.

## Capas

```
┌─────────────────────────────────────────┐
│  index.html                              │  markup + puntos de montaje
├─────────────────────────────────────────┤
│  app.js                                  │  capa de UI (único módulo con DOM)
├─────────────────────────────────────────┤
│  extractor.js   generator.js             │  núcleo: funciones puras
├─────────────────────────────────────────┤
│  countries.js  keywords.js  networks.js  │  datos estáticos
└─────────────────────────────────────────┘
```

**Datos** (`countries.js`, `keywords.js`, `networks.js`): objetos y arrays
planos. Países LATAM/Europa con sus variantes de nombre y ciudades, banco de
skills/industrias/seniority, sinónimos de rol y catálogo de redes buscables.
No tienen lógica más allá de un par de funciones de consulta (`detectCountry`,
`getSynonyms`).

**Núcleo** (`extractor.js`, `generator.js`): toda la lógica de negocio vive
acá, como funciones puras — mismo input, mismo output, sin tocar el DOM ni
el estado global. `extractor.js` convierte texto libre de una JD en los
cinco campos del método RADAR (Rol, Atributos, Dominio, Alcance, Refinar).
`generator.js` toma esos campos y arma el booleano y las URLs de búsqueda.
Que sean puras es lo que permite testearlas con Node sin levantar un
navegador ni mockear nada.

**UI** (`app.js`): la única capa que conoce el DOM. Lee inputs, llama al
núcleo, pinta el resultado. Mantiene un objeto `state` en memoria (los cinco
campos + red seleccionada) que es la única fuente de verdad de la pantalla.

Cada módulo se expone como global (`RadarCountries`, `RadarKeywords`, etc.)
via el patrón UMD que también soporta `require()`, así los mismos archivos
corren en el navegador y en los tests de Node sin duplicar código.

## La única dependencia externa

`js/vendor/pdf.min.js` (pdf.js, de Mozilla) para leer texto de PDFs
subidos. Vendorizada como archivo local, no cargada desde un CDN — sigue
sin haber llamadas de red en ningún flujo del sitio. Todo lo demás del
proyecto es JavaScript propio sin dependencias.

## Por qué no hay framework

No hay estado complejo que justifique uno: cinco listas de strings, una red
seleccionada, y un resultado derivado. React/Vue/lo que sea agregarían un
build step y una capa de indirección sin resolver ningún problema real acá.
El árbol del DOM es chico y se re-renderiza entero por campo en cada cambio
(`renderChips`), que a esta escala es más simple que diffear manualmente.

## Persistencia

No hay backend ni base de datos. El historial de búsquedas (opcional) usa
`localStorage` del navegador — por diseño, no sincroniza entre dispositivos
ni personas. Ver `SECURITY.md` para el resto del modelo de privacidad.

## Deploy

Carpeta estática pura: sirve igual desde un `file://`, un servidor local,
o cualquier hosting estático (Netlify, Vercel, GitHub Pages, S3+CloudFront,
nginx). No hay variables de entorno ni configuración de build.
