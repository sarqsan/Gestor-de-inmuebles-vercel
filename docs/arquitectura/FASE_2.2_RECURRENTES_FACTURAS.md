# Fase 2.2 — Gastos recurrentes y facturas en Storage

**Rama:** `arena/01a0a413-gestor-de-inmuebles-vercel`
**Depende de:** Fase 2.0 (gastos), 2.1 (rentabilidad) y 1.2 (patrón de Storage).

## 1. Gastos recurrentes (generación automática)

Una **plantilla** `GastoRecurrente` (colección `gastos_recurrentes`) define un
coste periódico; **no es un gasto**, sino el patrón con el que el sistema
materializa documentos `Gasto` en estado `PENDIENTE`.

Campos de la plantilla: inmueble/propietario, naturaleza y categoría, concepto,
proveedor, importe, `frecuencia` (`MENSUAL | TRIMESTRAL | ANUAL`),
`diaVencimiento` (1-28), `fechaInicio`/`fechaFin` (`YYYY-MM`), a-cargo-de,
deducible, método de pago, `activo` y el cursor `ultimoPeriodoGenerado`.

### Reglas de materialización (`src/utils/gastosEngine.ts`)

- `periodosDebidos(plantilla, hasta)` enumera los períodos debidos hasta el mes
  en curso según la frecuencia.
- `materializarGastoRecurrente(plantilla, periodo)` crea el `Gasto` con **ID
  determinista** `grec_{plantilla}_{año}_{mes}`, fecha de devengo el día de
  vencimiento, `periodoMesAnio` y concepto `"{concepto} · {mes de año}"`.
- `generarGastosRecurrentes(plantillas, gastosExistentes)` es **idempotente**:
  si el ID ya existe no se duplica ni se pisa el apunte (los pagos y ediciones
  están a salvo). Devuelve los gastos nuevos y las plantillas con el cursor
  avanzado (`ultimoPeriodoGenerado`).
- El **backfill** al crear una plantilla con inicio en el pasado está limitado a
  los **últimos 12 meses** (incluido el actual) para evitar ráfagas de cientos de
  pendientes.
- La generación se dispara **al abrir la aplicación** (efecto en `App.tsx`,
  mismo enfoque que la materialización de cobros): calcula lo debido, guarda los
  gastos y actualiza cursores, con una firma de control anti-repetición.
- **Histórico intacto**: desactivar (`activo=false`) o eliminar una plantilla no
  borra los apuntes ya generados; simplemente detiene las nuevas ocurrencias.
- La cuota hipotecaria recurrente se crea sin desglose capital/intereses; al
  pagarla se puede completar (el motor de rentabilidad asigna por defecto la
  cuota a capital y solo reconoce como gasto financiero los intereses
  informados). El cálculo automático del cuadro de amortización queda para una
  entidad de préstamo (fase siguiente).

## 2. Facturas / justificantes en Storage

- El `Gasto` ya contemplaba `justificanteUrl` y `justificantePath`.
- `uploadFacturaGasto(gastoId, fichero, nombre, propietarioId?)` en
  `src/lib/firebase.ts` sube el PDF/imagen a
  **`gastos_facturas/{propietarioId|'sin_asignar'}/{gastoId}/{ts}_{nombre}`** y
  devuelve la URL tokenizada; si Storage falla o tarda, reintenta por el
  endpoint del servidor (mismo patrón resilente que los justificantes de cobro).
  `deleteFacturaGastoStorage(path)` lo elimina.
- En `GastoModal` se puede **adjuntar, sustituir, abrir y quitar** la factura;
  primero se guarda el gasto (para resolver `propietarioId`) y después se sube
  el fichero y se vuelve a guardar con la URL. El listado muestra un enlace
  **Factura** cuando existe.
- Firestore guarda solo metadatos/URL; el binario nunca va a la base de datos.

## 3. Permisos

- **`firestore.rules`**: nuevo `match /gastos_recurrentes/{plantillaId}` con los
  mismos helpers que gastos/contratos (`gastoEsMio/gastoVisible`): listado
  demostrable por `propietarioId`, get también por inmueble asignado, escrituras
  solo del titular o administrador; los profesionales no tienen ninguna regla
  permitida (deny por el catch-all).
- **`storage.rules`**: ruta `gastos_facturas/{propietarioId}/{gastoId}/{archivo}`
  con cuenta interna, PDF/imagen y máximo 12 MB; misma nota residual de
  aislamiento fino por propietario pendiente de *custom claims*.
- La suscripción `subscribeGastosRecurrentes(cb, scope)` replica el patrón
  acotado (profesionales `[]`, propietario `where('propietarioId','==', pid)`,
  administrador la colección completa) y el `App` refuerza el filtrado y
  garantiza `propietarioId` al guardar.

> Las reglas se despliegan con Firebase CLI, no con Vercel:
> `firebase deploy --only firestore:rules,storage --project startup-sanctuary-sln7n`.

## 4. UI

Tercera pestaña **Recurrentes** en Gestión de Gastos: tarjetas con naturaleza,
categoría, frecuencia y día, importe por recibo, próxima generación y última
hasta la que se ha materializado; activar/desactivar, editar y eliminar
(`GastoRecurrenteModal`). La pestaña **Gastos** lista además el enlace a la
factura.

## 5. Verificación

Prueba de motor (con reloj fijado a 2026-09): comunidad mensual desde julio →
3 apuntes los días 5; hipoteca mensual con inicio antiguo → 12 apuntes (tope de
backfill); IBI anual y seguro trimestral en sus meses; segunda ejecución → **0
nuevos** (idempotencia); próxima ocurrencia de comunidad = 2026-10; `fechaFin`
en agosto detiene septiembre; plantilla inactiva no genera. `tsc`,
`npm run build` y carga de módulos en el dev server en verde.

## 6. Pendientes (siguientes fases)

- Entidad **préstamo/hipoteca** (capital inicial, TIN, plazo, carencia) que
  calcule automáticamente el reparto capital/intereses de cada cuota.
- Conciliación de recibos devueltos y edición masiva de recurrentes.
- Aislamiento fino de Storage por propietario mediante custom claims.
