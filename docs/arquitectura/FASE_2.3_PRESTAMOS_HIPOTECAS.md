# Fase 2.3 — Préstamos / hipotecas y cuadro de amortización automático

**Rama:** `arena/01a0a413-gestor-de-inmuebles-vercel`
**Depende de:** Fase 2.2 (recurrentes y facturas). Cierra el cálculo automático
del reparto capital/intereses que el cuadre de rentabilidad (2.1) necesitaba.

## 1. Objetivo

Una hipoteca no es un gasto de explotación y cada cuota tiene dos partes:
**intereses** (gasto financiero, deducible según normativa) y **capital**
(devuelve deuda, no es gasto). Hasta ahora la cuota recurrente se registraba
íntegra y el desglose era manual. Con esta fase, una entidad `Prestamo` con las
condiciones del préstamo calcula ese desglose automáticamente (sistema francés,
cuota constante) y lo traslada a los recibos.

## 2. Modelo y motor

- Tipo `Prestamo` (colección **`prestamos`**, id `prest_…`): `inmuebleId`,
  `propietarioId` (aislamiento), `tipo` (`HIPOTECARIO | PERSONAL`),
  descripción, entidad, **capitalInicial, tasaInteresAnual (TIN %), plazoMeses,
  fechaInicio (YYYY-MM), diaVencimiento**, `gastoRecurrenteId` de enlace,
  `activo` y trazabilidad.
- **`src/utils/prestamosEngine.ts`** (sistema francés):
  - `tasaMensual = TIN/100/12`;
    `cuota = C·i / (1 − (1+i)^−n)` (con TIN 0 → cuota plana `C/n`).
  - `generarTablaAmortizacion(prestamo)`: filas por mes con cuota, intereses
    (sobre saldo vivo), capital y saldo final; la **última cuota se ajusta**
    para dejar el saldo exactamente a cero.
  - `cuotaDelPeriodo(prestamo, YYYY-MM)`: desglose de un recibo concreto.
  - `resumenPrestamo(prestamo, corte?)`: cuota constante, totales (capital,
    intereses, coste total) y estado teórico a fecha: cuotas vencidas, capital
    amortizado, **saldo vivo**, % amortizado y si está finalizado.
  - `nuevoPrestamoId`.

## 3. Integración con recurrentes y rentabilidad

- Al **guardar un préstamo** (`handleSavePrestamo` en `App.tsx`) se crea o
  actualiza la plantilla `GastoRecurrente` vinculada
  (`CUOTA_HIPOTECARIA`, mensual, importe = cuota constante, proveedor = entidad,
  día de cargo y mes de inicio del préstamo) y se guarda su id en
  `gastoRecurrenteId`.
- El mecanismo de la 2.2 materializa los recibos `PENDIENTES`. Un **efecto de
  enriquecimiento** busca, para cada préstamo activo, sus recibos
  (`creadoPorId === gastoRecurrenteId`) que aún no tengan desglose y, con
  `cuotaDelPeriodo`, les asigna `intereses` y `capitalAmortizado`. Solo rellena
  recibos sin desglose: **no pisa ediciones manuales** y es idempotente.
- Editar las condiciones del préstamo actualiza la plantilla y los recibos
  futuros; **los ya generados no se modifican** (histórico inmutable).
- Eliminar el préstamo **desactiva** la plantilla vinculada (deja de generar
  cuotas) y borra sus condiciones, conservando los recibos históricos.
- Como resultado, en la pestaña **Rentabilidad** la cuota sigue contando como
  salida de caja íntegra, pero la base fiscal solo suma los **intereses** y el
  capital aparece informativo, automáticamente.

## 4. UI

- Nueva pestaña **Préstamos** en Gestión de Gastos:
  - `PrestamoModal`: alta/edición con **previsualización en vivo** de la cuota,
    intereses totales, coste total y plazo mientras se teclean los datos.
  - Tarjetas por préstamo: cuota mensual, **saldo vivo teórico**, intereses
    totales, barra de % amortizado y cuotas vencidas/totales, estado
    "Finalizado", y acciones **Cuadro / Editar / Eliminar**.
  - `TablaAmortizacionModal`: cuadro completo mes a mes (destaca el mes en
    curso), con exportación **CSV**.

## 5. Permisos

- `firestore.rules`: `match /prestamos/{prestamoId}` reutiliza los helpers
  `gastoEsMio/gastoVisible` (datos económicos por `propietarioId`/inmueble
  asignado): listado demostrable por `propietarioId`, get por titularidad o
  inmueble asignado, escrituras solo del titular o administrador; profesionales
  sin ninguna regla permitida (deny por el catch-all).
- `subscribePrestamos(cb, scope)` replica el patrón acotado; el `App` refuerza
  el filtrado y garantiza `propietarioId`.
- Despliegue de reglas (no lo hace Vercel):
  `firebase deploy --only firestore:rules --project startup-sanctuary-sln7n`.

## 6. Verificación

Pruebas de motor:
- 150.000 € al 3 % a 30 años → cuota **632,41 €**; primera cuota: 375 € de
  intereses y 257,41 € de capital; capital amortizado total **150.000 €**,
  intereses totales **77.665,33 €**, saldo final 0.
- TIN 0 % (12.000 €/12 meses) → cuota plana 1.000 € y 0 € de intereses.
- En todos los casos `cuota = capital + intereses` y el saldo final es 0
  (ajuste de la última cuota). El capital de cada recibo crece a lo largo del
  tiempo y los intereses decrecen, como corresponde al sistema francés.
- `tsc`, `npm run build` y carga de módulos en el dev server en verde.

## 7. Supuesto y pendientes

- El saldo vivo es **teórico según calendario** (cuota constante); no contempla
  aún amortizaciones anticipadas, tipos variables (revisión de hipoteca) ni
  carencia. Esas situaciones pueden incorporarse después editando las
  condiciones (los recibos históricos se conservan) o con una evolución del
  modelo (tipo variable por tramos, amortización anticipada).
