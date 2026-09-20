# Fase 2.0 — Módulo de Gastos: Explotación vs Financiación

**Rama:** `arena/01a0a413-gestor-de-inmuebles-vercel`
**Alcance:** modelo de datos, persistencia, clasificación contable, alta/edición/listado y aislamiento por propietario.

## 1. Objetivo

Registrar todos los costes asociados a una vivienda de alquiler **separando dos
naturalezas que nunca deben mezclarse en el cuadre de rentabilidad**:

| Naturaleza | Qué recoge | Efecto |
|---|---|---|
| **EXPLOTACIÓN** | Comunidad, IBI, seguro de hogar, suministros a cargo del propietario, mantenimiento, reparaciones, comisión de administración, limpieza | Coste operativo: **reduce el resultado del alquiler** y, habitualmente, es deducible en IRPF. |
| **FINANCIACIÓN** | Cuota hipotecaria / préstamos | **Salida de caja**, no gasto operativo. La parte de **capital amortiza deuda** (no es gasto); solo los **intereses** son gasto financiero. |

Esto evita el error habitual de tratar la cuota hipotecaria como un "gasto más"
del alquiler, que infravaloraría artificialmente el resultado operativo.

## 2. Modelo de datos (`src/types.ts`)

Nueva colección Firestore **`gastos`** (documento = `Gasto`, id `gas_…`):

- Identidad y aislamiento: `inmuebleId` (obligatorio), **`propietarioId`**
  (clave de aislamiento, igual que en contratos), `contratoId?`.
- Clasificación: `tipo: 'EXPLOTACION' | 'FINANCIACION'`,
  `categoria: CategoriaGasto`, `concepto`, `proveedor?`.
- Importes: `importe` total; en financiación, desglose opcional
  `capitalAmortizado?` e `intereses?`.
- Tiempo: `fechaDevengo?`, `fechaPago?`, `periodoMesAnio?` (`YYYY-MM`).
- Gestión: `estado: 'PENDIENTE' | 'PAGADO' | 'ANULADO'`,
  `aCargoDe: 'arrendador' | 'arrendatario'`, `deducible?`, `metodoPago?`,
  `notas?`, justificante (`justificanteUrl?/justificantePath?`, pendiente de uso),
  y trazabilidad (`creadoPor(Id)`, `createdAt`, `updatedAt`).

El catálogo de categorías, etiquetas, defaults, el alta y los cálculos viven en
**`src/utils/gastosEngine.ts`**; el tipo se deriva siempre de la categoría
(nunca se almacena un tipo incoherente: `normalizarGasto` lo garantiza y borra
el desglose de capital/intereses si la categoría pasa a ser de explotación).

### Categorías

- **Explotación:** `COMUNIDAD`, `IBI`, `SEGURO_HOGAR`, `SUMINISTROS`,
  `MANTENIMIENTO`, `REPARACION`, `ADMINISTRACION`, `LIMPIEZA`,
  `OTRO_EXPLOTACION`.
- **Financiación:** `CUOTA_HIPOTECARIA` (cuota íntegra), `INTERESES_PRESTAMO`,
  `OTRO_FINANCIACION`.

## 3. Criterio de totales (`resumenGastos`)

Los gastos `ANULADOS` no computan. Sobre los demás:

- **Explotación (pagado):** suma de `EXPLOTACION` en estado `PAGADO`.
- **Financiación · hipoteca (pagado):** suma íntegra de las cuotas
  `FINANCIACION` pagadas; se desglosa en **intereses** y **capital amortizado**.
  Si el desglose no se informa, la cuota se asigna a capital (no se inventa
  gasto financiero).
- **Salida real de caja:** explotación + cuotas íntegras efectivamente pagadas.
- **Pendiente:** importe de los gastos `PENDIENTE` (ambas naturalezas).

Además, las tarjetas del propietario **solo suman lo que cuesta al arrendador**
(`aCargoDe === 'arrendador'`); los gastos a cargo del inquilino se listan con
una etiqueta pero no entran en su caja.

## 4. Persistencia y aislamiento

- `src/lib/firebase.ts`: `subscribeGastos(cb, scope?)`, `saveGastoFirestore`,
  `deleteGastoFirestore`. La suscripción usa la **única consulta demostrable**
  `where('propietarioId','==', pid)` para propietarios; los profesionales
  reciben `[]`; el administrador, la colección completa.
- `App.tsx`: estado `gastos`, suscripción con `dataScope`, `scopedGastos`
  (defensa en profundidad por `propietarioId`/inmueble asignado),
  `handleSaveGasto` (que **asegura `propietarioId`** resolviéndolo desde el
  inmueble o el propietario autenticado) y `handleDeleteGasto`.
- **`firestore.rules`**: bloque `match /gastos/{gastoId}` con los helpers
  `gastoEsMio/gastoVisible`, replicando el patrón de contratos (list por
  `propietarioId`, get también por inmueble asignado, escrituras solo del
  propietario titular o administrador; profesionales sin ninguna regla
  permitida → denegado por el catch-all).
- Navegación: **Gestión de Gastos / Mis Gastos** en `Sidebar` y `MobileNav`
  (admin y propietario; nunca profesional) y sección `'gastos'` añadida al
  route guard del propietario. UI: `GastosSection` + `GastoModal`.

> **Igual que en la Fase 1.4, las reglas las despliega Firebase CLI, no Vercel:**
> `firebase deploy --only firestore:rules --project startup-sanctuary-sln7n`.

## 5. Próximas fases (no incluidas)

- **2.1 — Cuadre de rentabilidad:** cruzar ingresos (cobros) con gastos por
  inmueble/período: resultado operativo (ingresos − explotación), cash-flow
  después de hipoteca, y resumen fiscal (deducibles / intereses).
- **2.2 — Recurrentes y justificantes:** generación periódica de cuotas
  (comunidad/hipoteca mensual) y subida de facturas a Storage, reutilizando el
  patrón de los justificantes de cobro.
- Posible subcolección/entidad de **préstamo** (capital vivo, TIN, plazo) para
  calcular el desglose capital/intereses automáticamente.

## 6. Checklist de pruebas

1. **Administrador:** ve "Gestión de Gastos"; crea un gasto de comunidad
   (explotación) y una cuota hipotecaria (financiación) en un inmueble.
2. Verifica que las tarjetas separan Explotación, Financiación (con desglose
   intereses/capital), salida de caja y pendiente; un gasto `PENDIENTE` no suma
   en los pagados y sí en "Pendiente".
3. Cambiar la naturaleza en el modal cambia categorías, color y muestra/oculta
   el desglose de capital/intereses; al guardar, el tipo queda coherente.
4. Un gasto marcado **a cargo del inquilino** aparece listado pero no suma en
   las tarjetas del propietario.
5. **Propietario:** solo ve sus gastos; crear uno le asigna su `propietarioId`;
   no puede editar/borrar gastos de otro propietario (reglas).
6. **Profesional:** no ve el menú y la suscripción no le entrega datos.
7. Filtros por inmueble, naturaleza, categoría, estado, año y búsqueda;
   orden por fecha descendente.
