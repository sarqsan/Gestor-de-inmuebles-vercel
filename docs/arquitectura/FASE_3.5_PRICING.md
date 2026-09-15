# Fase 3.5 — Pricing y escenarios de precio

Alcance (especificación §4.6): recalcular el valor del activo para su nueva
comercialización a partir de la **renta del contrato anterior**, la evolución
por **IPC/actualización**, las **mejoras confirmadas** (3.4) y una muestra de
**comparables** del mismo código postal y tipología, produciendo los tres
escenarios de alquiler y una estimación de venta.

## Qué se implementa

- **Motor determinista** `src/utils/pricingRecomerc.ts` (transparente y
  testeable sin IA):
  - Renta actualizada por IPC: `rentaAnterior × (1 + IPC%)`.
  - Con comparables: la **mediana** de los testigos manda (peso 65%) y la renta
    actualizada modera el arranque (35%); se calcula también €/m²·mes.
  - Sin comparables: renta actualizada × ajuste de mercado (%) + suma de la
    renta extra de las mejoras confirmadas. Con testigos no se suman las
    mejoras para no duplicar (se asume que el mercado ya las recoge).
  - Escenarios de alquiler: **conservador** (−5%, rápida absorción),
    **recomendado** (equilibrio) y **máximo razonable** (+6%, perfiles de alta
    solvencia); rentas redondeadas a 5 €.
  - Venta: €/m² por comparación (o €/m² manual), horquilla −6%/+6%, precio de
    salida +3% (margen de negociación) redondeado a centenas; sin datos, parte
    de la valoración de referencia del inmueble más la plusvalía de las
    mejoras confirmadas. Plazo medio orientativo: 90 días alquiler / 180 venta.
  - Cada cálculo devuelve `notasCalculo` con la trazabilidad de las hipótesis.
- **Endpoint** `POST /api/estimar-pricing` (`server.ts`):
  - El cliente envía la base calculada y los datos; el modelo solo puede
    **refinar** dentro de ±6% (alquiler) y ±8% (venta), y exclusivamente si los
    comparables lo justifican. No puede inventar testigos ni portales.
  - Devuelve `confianza` (alta con 3+ comparables coherentes, media con 1-2,
    baja sin ellos) y notas en lenguaje no asertivo.
  - Sin clave Gemini se respeta la base (`motor: 'calculadora'`); ante error
    también se cae a la base.
- **Cliente** `src/utils/pricingIa.ts` y tipos (`ComparableMercado`, hipótesis
  y métricas en `PricingRecomercializacion`).
- **UI** `PricingModal`:
  - Hipótesis editables: renta anterior (prefijada del contrato vinculado),
    IPC/acuerdo acumulado, ajuste de mercado (desactivado si hay testigos),
    resumen de mejoras confirmadas.
  - Editor de **comparables** (fuente, m², alquiler €/mes, venta €) con alta y
    borrado; tarjetas de los 3 escenarios con €/m²; bloque de venta con €/m²
    manual, valor, horquilla, precio de salida y plazo; justificación del
    cálculo y avisos de que no es tasación ni garantía.
  - «Revisar con IA», «Guardar sin completar» y «Completar valoración», que
    mueve el expediente a `VALORACION_COMPLETADA` (transición ya permitida por
    la máquina de estados desde `FOTOS_ACTUALIZADAS`; también posible desde
    `REVISION_PENDIENTE`).
- **Detalle del expediente**: tarjeta «Valoración y escenarios de precio» con
  los tres escenarios y la estimación de venta, botón de cálculo/recálculo,
  acción para volver de `VALORACION_COMPLETADA` a `FOTOS_ACTUALIZADAS` y estado
  habilitado en la línea de tiempo.

## Decisiones y límites

- No hay integración con portales ni índices en tiempo real: IPC, ajuste de
  zona y comparables los introduce/valida el propietario. La IA **no navega** y
  solo revisa los datos aportados; se marca la confianza explícitamente.
- El precio se guarda en `expediente.pricing` (sin colecciones ni reglas
  nuevas). Al reabrir el modal se recuperan hipótesis y comparables.
- Las cifras se presentan siempre como estimación orientativa, no como tasación
  oficial ni garantía de precio o plazo.

## Archivos

- Nuevos: `src/utils/pricingRecomerc.ts`, `src/utils/pricingIa.ts`,
  `src/components/modals/PricingModal.tsx`, este documento.
- Modificados: `server.ts`, `src/types.ts`,
  `src/components/modals/DetalleExpedienteModal.tsx`.
- Sin cambios en Firestore/Storage Rules ni colecciones.

## Verificación

- `tsc --noEmit` y `npm run build` correctos.
- Motor (tsx): sin comparables, 900 € + 8% IPC + 3% mercado + 40 € de mejora →
  recomendado 1.040 € (13 €/m² a 80 m²). Con testigos 990/1.050/1.100 € y base
  972 € → escenarios 970/1.025/1.085 (12,81 €/m²). Venta a 2.300 €/m² →
  184.000 €, horquilla 173.000–195.000, salida 189.500 €.
- Endpoint sin clave: respeta la base calculada (`motor: calculadora`). La
  revisión con Gemini real queda pendiente de `GEMINI_API_KEY` en Vercel.

## Pendiente

- 3.6: estrategia (gestión propia/inmobiliaria/híbrida), kit de publicación,
  bolsa/RFPs y seguimiento de agencias, y acople final entrega de llaves →
  finalización de contrato → nuevo anuncio/contrato sobre el mismo inmueble.
