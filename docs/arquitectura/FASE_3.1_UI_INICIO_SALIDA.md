# Fase 3.1 — Puntos de entrada y UI guiada de inicio/salida del inquilino

Alcance: aterrizar el modelo y la máquina de estados de la **Fase 3.0** en la
interfaz, permitiendo abrir un expediente de recomercialización desde el flujo
natural de trabajo y registrar la salida del inquilino hasta
`SALIDA_NOTIFICADA` / `REVISION_PENDIENTE`.

## Objetivos cubiertos

1. **Acción «Recomercializar» desde el activo** (`InmueblesSection`), en las
   acciones del contrato activo, antes de «Finalizar Alquiler».
2. **Acción «El inquilino se va» desde el contrato** (`FormalizacionSection`,
   icono `RefreshCw` en las acciones de cada expediente no cancelado).
3. **Alta guiada** (`RecomercializarModal`): inmueble, contrato anterior
   opcional, destino previsto, fechas de comunicación / salida prevista /
   entrega de llaves, fianza a devolver y observaciones.
4. **Detalle y operación** (`DetalleExpedienteModal`): línea de tiempo de
   estados, edición de los datos de salida, y acciones para registrar la
   comunicación, la entrega de llaves, cancelar, reabrir y eliminar.
5. **Sección Recomercialización** (`RecomercializacionSection`): KPIs,
   búsqueda por dirección, filtros por estado y tarjetas de expedientes.
6. **Navegación** (Sidebar y MobileNav) y route guard: permitida para
   `ADMINISTRADOR` y `PROPIETARIO`; denegada a `PROFESIONAL`.

## Reglas de comportamiento

- **No se duplica activo ni histórico**: el expediente referencia el
  `inmuebleId` existente y, opcionalmente, el `contratoAnteriorId`. Nunca se
  crea un inmueble nuevo.
- **Un expediente abierto por inmueble**: el alta impide crear un segundo
  expediente mientras exista uno no cerrado/cancelado para ese `inmuebleId`.
- **Aislamiento por propietario**: los datos se leen/acotan por
  `propietarioId` (suscripción + `scopedExpedientesRecomerc`), reforzado por
  inmueble asignado. Los profesionales no tienen acceso.
- **Estado inicial según los datos registrados en el alta**:
  - Sin fechas → `BORRADOR`.
  - Con fecha de comunicación → `SALIDA_NOTIFICADA`
    (`datosSalida.contratoEstado = EN_PROCESO_RESOLUCION`).
  - Con entrega de llaves (exige salida prevista) → `REVISION_PENDIENTE`
    (`contratoEstado = FINALIZADO_LIQUIDADO`).
- En el detalle los avances son encadenados y guiados por la máquina:
  `BORRADOR → SALIDA_NOTIFICADA → REVISION_PENDIENTE`. Los estados de las
  fases 3.2–3.6 se muestran deshabilitados en la línea de tiempo.

## Decisión de acoplamiento con el contrato formalizado

El `ContratoFormalizacion` tiene su propio vocabulario de estados
(`FORMALIZADO_ACTIVO`, `FINALIZADO`, …), distinto del eje de salida
`ACTIVO / EN_PROCESO_RESOLUCION / FINALIZADO_LIQUIDADO` modelado en
`DatosSalidaInquilino.contratoEstado`.

En la 3.1 el expediente **no muta automáticamente el documento de contrato**:
registra la intención/estado de salida en su propio eje. La finalización
operativa del contrato (disponibilidad del inmueble, cese de cobros y
conservación del histórico) continúa por el flujo existente «Finalizar
Alquiler», ya probado. El orquestado automático (entrega de llaves →
finalizar contrato y dejar el activo disponible) se evaluará al cerrar el
ciclo, en la fase de comercialización/kit de publicación.

## Archivos

- Nuevos:
  - `src/components/modals/RecomercializarModal.tsx`
  - `src/components/modals/DetalleExpedienteModal.tsx`
  - `src/components/sections/RecomercializacionSection.tsx`
- Modificados: `src/App.tsx`, `src/types.ts`, `Sidebar.tsx`, `MobileNav.tsx`,
  `InmueblesSection.tsx`, `FormalizacionSection.tsx`.

## Pendiente para siguientes fases

- 3.2: inspección visual y fotos por estancia (Storage).
- 3.3: diagnóstico asistido por IA (`server.ts`, lenguaje no asertivo).
- 3.4: cálculo de mejoras y ROI.
- 3.5: pricing.
- 3.6: kit de publicación, bolsa de inmobiliarias y RFPs; orquestado del
  cierre con el contrato.
