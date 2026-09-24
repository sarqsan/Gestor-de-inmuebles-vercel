# Fase 3.3 — Diagnóstico asistido por IA de la inspección visual

Alcance: analizar con **visión artificial** las fotografías cargadas en la
Fase 3.2 y volcar el resultado en `FotoInspeccion.analisisIa`, con
**lenguaje no asertivo** (indicios y sugerencias, nunca certezas de daño),
según la especificación §4.4.

## Qué se implementa

- **Endpoint serverless** `POST /api/analizar-inspeccion` en `server.ts`:
  - Recibe un lote (máx. 8 fotos) con `{ id, estancia, imageUrl | imageBase64 }`
    y un contexto (dirección, destino).
  - Resuelve la imagen desde una URL firmada de Storage (el servidor la
    descarga, sin restricciones CORS), desde el almacén `/api/documents` o
    desde base64 directo.
  - Una llamada multimodal a Gemini por foto, modelo `gemini-3.7-flash`, con
    `responseMimeType: application/json`.
  - Prompt estructurado en español con las 6 categorías: pintura/acabados,
    iluminación, electrodomésticos/grifería, mobiliario/decoración, limpieza y
    presentación, y desperfectos/elementos faltantes.
  - **Reglas obligatorias de lenguaje prudente**: "se aprecian indicios de…",
    "podría ser conveniente revisar…"; prohibido afirmar humedad/grietas/plagas/
    averías como hechos; no inventar lo que no se ve; si la foto no es evaluable
    se dice; no recomendar manipulación de instalaciones (luz/gas/agua), que
    quedan para profesional cualificado.
  - Salida por foto: `observaciones[]`, `sugerenciasMejora[]`,
    `prioridad` orientativa (`baja|media|alta`).
  - **Sin clave Gemini** (o si una foto no se puede resolver/parsea mal) devuelve
    una **guía honesta de revisión manual** con `motor: 'heuristico'`; nunca
    finge haber visto la imagen.
- **Cliente** `src/utils/inspeccionIa.ts`:
  - Lotes de 8, progreso, **autoguardado por lote**.
  - Estrategia resilente: primero envía la URL (la descarga el servidor); si con
    modelo disponible alguna foto falla, la reintenta enviando el base64 desde
    el navegador.
  - Consolida `analisisIa` con `analizFecha`.
- **Motor** (`recomercializacionEngine.ts`): `aplicarAnalisisFotos` (inmutable).
- **Tipo** (`types.ts`): `FotoInspeccion.analisisIa` gana `prioridad` y `motor`.
- **UI** (`InspeccionFotograficaModal`):
  - Botones **«Diagnóstico IA»** (fotos pendientes) y **«Reanalizar»**.
  - Progreso, insignia de prioridad por foto, panel de hallazgos por estancia
    (observaciones y sugerencias, colapsable) y visor en grande con el detalle.
  - Aviso legal fijo: ayuda orientativa, no pericial, no detecta defectos
    ocultos; cuando el resultado es heurístico se indica expresamente.
  - En el detalle del expediente se muestra el nº de fotos analizadas.

## Decisiones

- El análisis **no cambia el estado** del expediente: sigue en
  `FOTOS_ACTUALIZADAS`; el siguiente estado (`VALORACION_COMPLETADA`) pertenece a
  la fase de pricing (3.5).
- La IA no decide ni valora económicamente; solo orienta la puesta a punto. Los
  resultados son revisables y se pueden reanalizar.
- No se persiste ningún binario nuevo: la IA solo añade texto al documento del
  expediente; las imágenes siguen únicamente en Storage.

## Archivos

- Modificados: `server.ts`, `src/types.ts`,
  `src/utils/recomercializacionEngine.ts`,
  `src/components/modals/InspeccionFotograficaModal.tsx`,
  `src/components/modals/DetalleExpedienteModal.tsx`.
- Nuevo: `src/utils/inspeccionIa.ts`.
- **Sin cambios** en colecciones, Firestore Rules ni Storage Rules.

## Requisitos operativos

- `GEMINI_API_KEY` configurada en el entorno de Vercel para el diagnóstico real.
  Sin ella, la UI funciona y muestra una guía de revisión manual claramente
  etiquetada (`motor: 'heuristico'`).
- Las Storage Rules de la Fase 3.2 deben estar desplegadas para que existan
  fotos que analizar.

## Pendiente para siguientes fases

- 3.4: convertir las sugerencias en `MejoraROI` accionables (coste, subida de
  renta/valor, payback) y solicitud de presupuesto a profesionales.
- 3.5: pricing/escenarios; 3.6: kit de publicación, bolsa/RFPs y acople del
  cierre con el contrato.
- Bloque 0 (seguridad, de la auditoría): proteger/autenticar los `/api/*`,
  incluido este, y limitar uso/coste.

## Verificación

- `tsc --noEmit` y `npm run build` correctos.
- Humo local del endpoint sin clave: 400 sin fotos y guía heurística honesta
  con lote válido. La rama con Gemini (visión real) queda pendiente de probar
  con la clave en el entorno desplegado.
