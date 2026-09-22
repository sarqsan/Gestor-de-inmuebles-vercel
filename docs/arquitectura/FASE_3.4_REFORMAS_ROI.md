# Fase 3.4 — Reformas y optimización (simulador de ROI)

Alcance (especificación §4.5 y §12): convertir las sugerencias del diagnóstico
visual (3.3) en **mejoras accionables y cuantificadas**, con escenarios de
reforma, estimación orientativa de coste, subida de renta, plusvalía, plazo de
retorno (payback) y solicitud de presupuesto a profesionales.

## Qué se implementa

- **Endpoint** `POST /api/proponer-mejoras` (`server.ts`):
  - Entrada: renta anterior, destino, zona y el diagnóstico por estancia
    (observaciones + sugerencias del 3.3).
  - Con Gemini: de 3 a 7 propuestas realistas en JSON, con rangos de coste
    (merceta español), `incrementoRentaMensual` en € conservador,
    `incrementoValoracion` en €, `impacto` y `categoria`. Enfatiza mejoras de
    rápida amortización; para venta prioriza plusvalía; cifras como rangos
    orientativos, nunca presupuestos ni rentas garantizadas (lenguaje prudente).
  - Sin clave (o error): **catálogo heurístico** de mejoras frecuentes
    (pintura, iluminación, cocina, baño, suelos, home staging, eficiencia,
    reparaciones, puesta a punto). El emparejado se hace **solo con el
    contenido** de observaciones/sugerencias, no con el nombre de la estancia
    (se corrigió un falso positivo que disparaba «cocina» por la propia
    etiqueta de la estancia).
- **Cliente** `src/utils/mejorasIa.ts`: construye la propuesta, llama al
  endpoint, devuelve `MejoraROI` con `origen: 'ia'` y `evitarDuplicadosMejora`
  por texto normalizado.
- **Motor** (`recomercializacionEngine.ts`):
  - `CATEGORIA_MEJORA_LABEL`, `nuevoMejoraId`, `normalizarMejora`,
    `agregarMejora`, `actualizarMejora`, `quitarMejora`.
  - `costeMedioMejora`, `paybackMejora` (inversión media / renta extra mensual).
  - `escenariosROI`: **sin reformar / reforma parcial (confirmadas) / reforma
    completa (todas)**, con inversión mín/media/máx, renta extra mensual y
    anual, plusvalía, payback y ROI anual orientativo.
  - `sugerenciasDesdeFotos` para alimentar al generador.
- **Tipo** (`types.ts`): nueva unión `CategoriaMejora`; `MejoraROI` gana
  `categoria`, `impacto`, `presupuestoSolicitadoFecha` y `origen`.
- **UI**:
  - Nuevo `MejorasROIModal`: escenarios comparativos, lista editable
    (actuación, categoría, impacto, rango de coste, +€ renta/mes, +€ valor;
    payback y coste medio calculados), casilla de confirmación (alimenta el
    escenario parcial), alta manual, borrado, generar con IA, autoguardado.
    Solicitud de presupuesto a un profesional de la bolsa (deja constancia en
    la mejora; la orden de trabajo formal pertenece al futuro módulo de
    Incidencias/Mantenimiento).
  - `DetalleExpedienteModal`: tarjeta «Reformas y optimización (ROI)» visible
    desde `FOTOS_ACTUALIZADAS`, con resumen de escenarios parcial/completo y
    acceso al modal.
  - `RecomercializacionSection`: calcula la **renta anterior** del contrato
    vinculado (o el más reciente del inmueble), pasa la bolsa de profesionales
    y muestra un contador de mejoras en la tarjeta del expediente.
  - `App.tsx`: pasa `scopedProfesionales` a la sección.

## Decisiones

- Las mejoras se guardan **dentro del expediente**
  (`expedientes_recomercializacion.mejorasPropuestas`): sin colecciones ni
  reglas nuevas; el aislamiento por propietario ya cubre el dato.
- El estado del expediente **no cambia** en la 3.4: las mejoras alimentan el
  pricing de la 3.5, que es quien llevará a `VALORACION_COMPLETADA`.
- Todas las cifras se marcan explícitamente como **estimaciones orientativas**,
  no presupuestos ni garantías; instalaciones = profesionales cualificados.
- La «solicitud de presupuesto» es un registro de intención (profesional
  elegido + fecha); el flujo operativo (orden, parte, valoración) se hará en el
  bloque de Incidencias/Profesionales.

## Archivos

- Nuevos: `src/components/modals/MejorasROIModal.tsx`,
  `src/utils/mejorasIa.ts`.
- Modificados: `server.ts`, `src/types.ts`,
  `src/utils/recomercializacionEngine.ts`,
  `src/components/modals/DetalleExpedienteModal.tsx`,
  `src/components/sections/RecomercializacionSection.tsx`, `src/App.tsx`.
- Sin cambios en Firestore/Storage Rules ni colecciones.

## Verificación

- `tsc --noEmit` y `npm run build` correctos.
- Humo local del endpoint (sin clave): sin diagnóstico propone la puesta a
  punto general; con texto solo de iluminación en cocina devuelve únicamente
  iluminación (no cocina por la etiqueta); pintura integral + azulejos devuelve
  pintura y baño. La rama con Gemini queda pendiente de `GEMINI_API_KEY` en
  Vercel (mismo patrón que los demás endpoints).

## Pendiente

- 3.5: pricing/escenarios de precio (conservador/recomendado/máximo) usando
  renta anterior, mejoras confirmadas e IPC; estado `VALORACION_COMPLETADA`.
- 3.6: estrategia, kit de publicación, bolsa/RFPs y acople final con el
  contrato. Bloque 4: orden de trabajo real al profesional.
