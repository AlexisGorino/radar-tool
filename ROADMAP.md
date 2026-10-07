# Próximas iteraciones de RADAR

## Entregado en la iteración de octubre de 2026

- Revisión obligatoria de cargo, señales del perfil y alcance antes de aplicar
  una JD o un brief libre; el generador manual también exige ese mínimo.
- Detección de páginas PDF con poco texto, posible desorden de lectura y
  caracteres dañados. Los PDF sin texto suficiente quedan bloqueados.
- Lectura local de Word `.docx`, además de PDF, TXT y texto pegado/escrito.
- Banco de regresión ampliado para IT, telecom, RRHH, finanzas, diseño y
  escritos libres. LinkedIn muestra hasta tres rutas con una explicación breve.
- La ampliación del booleano elimina el sector y conserva la ubicación.
- Feedback agregado por fuente, guardado localmente sin consultas ni perfiles.
- Prioridades explícitas para requisitos: imprescindibles, alternativas y
  deseables, con rutas de búsqueda que explican qué señales conservan.

La precisión de candidatos reales, OCR de escaneos y acceso a resultados de
portales siguen pendientes y requieren una etapa separada.

## Prioridad 1: calidad verificable

1. Ampliar el banco de JDs anonimizadas con ejemplos de RRHH, telecom, finanzas,
   operaciones, salud, IT y diseño, incluidos PDFs escaneados y plantillas con
   tablas. Cada caso debe comprobar cargo, requisitos, deseables, ubicación y
   exclusiones, además del enlace final.
2. Medir precisión de candidatos con revisión humana: para cada consulta,
   evaluar una muestra de perfiles como relevante, dudosa o irrelevante. Guardar
   solo métricas agregadas y la corrección de la estrategia, no datos personales.
3. Agregar OCR para PDFs escaneados y detectar páginas con lectura incompleta o
   columnas mezcladas. Hasta entonces RADAR debe detenerse y pedir texto legible.

## Prioridad 2: búsqueda guiada

4. Convertir la revisión en preguntas por pasos: cargo imprescindible u opcional,
   requisitos excluyentes, experiencia equivalente, ubicación exacta, movilidad
   y trabajo remoto. Mostrar cómo cada respuesta cambia la consulta.
5. Mantener variantes con y sin título para roles poco normalizados; ofrecer
   sinónimos profesionales revisables por el reclutador.
6. Dar a cada red una ficha honesta: qué tipo de perfiles contiene, si permite
   filtros estructurados y cuándo requiere cuenta o acceso de reclutador.

## Prioridad 3: integración y aprendizaje

7. Para validar resultados internos de LinkedIn o bases privadas hacen falta
   acceso autorizado, permisos y una integración compatible con cada plataforma.
   Un sitio estático que abre enlaces no puede observar ni clasificar esos
   resultados automáticamente.
8. Si el equipo quiere IA compartida, mover el análisis a un servicio con
   autenticación, gestión segura de claves, controles de costo y política de
   retención. Enviar a terceros solo JDs autorizadas y sin datos innecesarios.
9. Añadir feedback de reclutadores sobre falsos positivos y búsquedas vacías,
   y usarlo para ajustar sinónimos, pesos y preguntas con evaluación periódica.

## Prioridad 4: plataforma técnica

10. Migrar las interacciones del DOM a Angular por flujo: primero carga y
    validación de documentos, luego revisión interactiva de la JD y finalmente
    generación de consultas. Mantener pruebas de paridad para los módulos puros
    y Cypress para los recorridos completos.
11. Agregar un backend antes de ofrecer autenticación real, IA compartida,
    secretos del equipo o uso multiusuario. El password actual está en una
    aplicación pública de navegador y solo funciona como pantalla de entrada;
    no protege el contenido. El backend debería usar identidad individual,
    permisos, límites por usuario, secretos fuera del cliente y auditoría
    mínima con retención definida.
12. Añadir telemetría técnica sin texto de JD ni datos de candidatos: fallos de
    lectura por formato, tiempo de análisis, errores de carga y versiones del
    cliente. Habilitarlo solo con política de privacidad y retención acordadas.
13. Automatizar controles de dependencias y accesibilidad en CI, además de
    mantener la CSP estricta, los presupuestos de bundle y el despliegue
    versionado.

No conviene conectar ni scrapear redes que no den acceso autorizado. Para
mostrar perfiles reales dentro de RADAR haría falta una API oficial o un
proveedor con permisos, límites y condiciones de uso compatibles; mientras
tanto el producto debe generar búsquedas transparentes y abrirlas en la fuente.
