# Fase 3.0 — Recomercialización: modelo de datos y seguridad

**Rama:** `arena/01a0a413-gestor-de-inmuebles-vercel`
**Alcance:** tipos, colecciones Firestore (suscripciones acotadas + CRUD),
motor de la máquina de estados y Security Rules. **No incluye UI** (llega en
3.1+) ni el análisis visual por IA (3.3). Sigue la especificación
`docs/arquitectura/RECOMERCIALIZACION_INTELIGENTE.md`.

## 1. Principio rector

El ciclo de recomercialización (salida del inquilino → inspección/IA →
reformas/ROI → pricing → estrategia → nuevo contrato/venta) **reutiliza siempre
el mismo `inmuebleId`** y conserva el histórico; nunca se duplica el activo al
cambiar de inquilino, contrato o precio.

## 2. Tipos (`src/types.ts`)

- **`ExpedienteRecomercializacion`** (col. `expedientes_recomercializacion`):
  `inmuebleId` (invariante), `propietarioId` (aislamiento),
  `contratoAnteriorId?`, `estado`, `destinoPrevisto`, `modalidadElegida?` y
  bloques escalonados que se rellenan por etapa:
  - `datosSalida?` (fechas de comunicación/preaviso/llaves, fianza, estado del
    contrato);
  - `revisionFotografica?` → `FotoInspeccion[]` por estancia con `analisisIa?`
    (observaciones y sugerencias en redacción no asertiva);
  - `mejorasPropuestas?` (`MejoraROI`: coste, subida de renta/valor, payback);
  - `pricing?` (escenarios conservador/recomendado/máximo y horquilla de venta);
  - `comercializacion?` (inmobiliarias contactadas, kit de publicación).
- **`InmobiliariaDirectorio`** (col. `inmobiliarias_directorio`): bolsa de
  agencias (cobertura por CP, servicios venta/alquiler/habitaciones,
  comisiones medias, `verificada`, `esPatrocinada`, `origen`, `activo`).
- **`PropuestaInmobiliaria`** (col. `propuestas_inmobiliaria`): RFP con
  honorarios, plazo, servicios, estrategia y estado.
- **`LeadInmobiliario`** (col. `leads_inmobiliario`): contacto de
  intermediación (solicitado/contactado/acuerdo/descartado).

Enumerados: `EstadoRecomercializacion` (10 estados), `DestinoInmueble`,
`ModalidadComercializacion`, `EstanciaFoto`, `EstadoPropuestaInmobiliaria`,
`EstadoLeadInmobiliario`.

## 3. Máquina de estados (`src/utils/recomercializacionEngine.ts`)

- `TRANSICIONES_RECOMERCIALIZACION`: transiciones permitidas, explícitas:

  `BORRADOR → SALIDA_NOTIFICADA → REVISION_PENDIENTE → FOTOS_ACTUALIZADAS →
  VALORACION_COMPLETADA → DECISION_ESTRATEGIA → EN_COMERCIALIZACION →
  CERRADO_REARRENDADO | CERRADO_VENDIDO`, con `CANCELADO` alcanzable desde las
  fases abiertas (y reapertura a BORRADOR). La revisión puede saltar directo a
  valoración (fotos opcionales).
- `puedeTransicionar`, `esEstadoCierre`, etiquetas de estado/destino/modalidad/
  estancia (`ESTADOS_RECOMERCIALIZACION`, `DESTINO_INMUEBLE_LABEL`,
  `MODALIDAD_COMERCIALIZACION_LABEL`, `ESTANCIA_LABEL`).
- Factorías: `crearExpediente` (nace en BORRADOR con destino INDECISO y
  estructuras vacías), `crearInmobiliaria`, `crearPropuesta`, `crearLead`, con
  IDs `exp_…`, `inmb_…`, `prop_…`, `lead_…`.

## 4. Persistencia (`src/lib/firebase.ts`)

- `subscribeExpedientesRecomercializacion`, `subscribePropuestasInmobiliaria` y
  `subscribeLeadsInmobiliarios(cb, scope)` usan un helper común
  `subscribeColeccionPropietario`: profesionales → `[]`, propietario →
  consulta demostrable `where('propietarioId','==', pid)`, administrador →
  colección completa. Acompañadas de `save…/delete…Firestore`.
- `subscribeInmobiliarias(cb, scope)`: lectura para administrador y propietarios
  (la bolsa se necesita para delegar/comparar); profesionales no la reciben.
  Escritura de agencias reservada al administrador (CRUD `save/delete`).

## 5. Security Rules (`firestore.rules`)

Nuevos helpers genéricos de aislamiento reutilizables —
`aisladoEsMio(d)`, `aisladoVisible(d)`, `aisladoCreateOk()`,
`aisladoUpdateOk()` — equivalentes a los de contratos/gastos (titularidad por
`propietarioId`; get también por inmueble asignado). Bloques:

| Colección | Lectura | Escritura |
|---|---|---|
| `expedientes_recomercializacion` | admin o propietario titular/asignado | titular o admin |
| `propuestas_inmobiliaria` | igual (contiene `propietarioId`) | titular o admin |
| `leads_inmobiliario` | igual (contiene `propietarioId`) | titular o admin |
| `inmobiliarias_directorio` | admin o propietario (get/list) | **solo admin** |

Los profesionales no tienen ninguna regla permitida → denegados por el
catch-all. Listados demostrables por `propietarioId` (las reglas no filtran).

> Despliegue (no lo hace Vercel):
> `firebase deploy --only firestore:rules --project startup-sanctuary-sln7n`.

## 6. Verificación

- Prueba de motor: recorrido feliz válido por los 7 estados hasta
  `CERRADO_REARRENDADO` (cierre), salto ilegal `BORRADOR→EN_COMERCIALIZACION`
  denegado, reapertura `CANCELADO→BORRADOR` permitida, y factorías con valores
  por defecto correctos.
- Balance de llaves de reglas correcto (4 bloques nuevos), `tsc --noEmit` y
  `npm run build` en verde.

## 7. Próximas subfases

- **3.1** Puntos de entrada y UI: acciones «Recomercializar inmueble» / «El
  inquilino se va» y modal guiado de la salida del inquilino (estado del
  contrato, preaviso, llaves, fianza).
- **3.2** Inspección visual: subida de fotos por estancias a Storage.
- **3.3** Diagnóstico por IA con lenguaje prudente (prompt en `server.ts`).
- **3.4** Reformas y simulador de ROI; **3.5** pricing dinámico; **3.6** kit de
  publicación propia + bolsa de inmobiliarias y comparativa de RFPs.
