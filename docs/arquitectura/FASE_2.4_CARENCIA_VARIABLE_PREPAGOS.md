# Fase 2.4 — Carencia, tipo variable y amortizaciones anticipadas

**Rama:** `arena/01a0a413-gestor-de-inmuebles-vercel`
**Depende de:** Fase 2.3 (préstamos/hipotecas). Ampliación del motor financiero
sin tocar el resto de módulos.

## 1. Nuevas capacidades del préstamo

Sobre el tipo `Prestamo` (colección `prestamos`) se añaden tres grupos de
campos opcionales (los préstamos antiguos siguen funcionando igual):

| Campo | Significado |
|---|---|
| `carenciaMeses?: number` | Meses iniciales de carencia (0 por defecto). |
| `tipoCarencia?: 'TOTAL' \| 'PARCIAL'` | **TOTAL**: no se paga nada y los intereses se capitalizan (se añaden al saldo). **PARCIAL**: sólo se pagan intereses, sin amortizar capital. |
| `tramosTipo?: TramoTipoInteres[]` | Revisiones de tipo: `{ fechaInicio: YYYY-MM, tasaInteresAnual }`. El TIN inicial es el del préstamo; cada tramo lo sustituye desde esa fecha (tipo variable, p. ej. revisión del Euribor). |
| `amortizaciones?: AmortizacionAnticipada[]` | Prepago parcial: `{ periodo: YYYY-MM, importe, modalidad }`. |
| `ModalidadAmortizacion` | `REDUCE_CUOTA` (mantiene el plazo y baja el recibo) o `REDUCE_PLAZO` (mantiene el recibo y vence antes). |

## 2. Motor (simulación mes a mes)

`generarTablaAmortizacion` en `src/utils/prestamosEngine.ts` pasa de la fórmula
cerrada de cuota constante a una **simulación cronológica** que, para cada mes:

1. Aplica las amortizaciones anticipadas del período (reducen el principal
   antes de calcular intereses).
2. Toma el tipo vigente con `tasaEnPeriodo(prestamo, periodo)` (tramos).
3. Calcula intereses sobre el saldo vivo.
4. En **carencia total**: cuota 0 e intereses capitalizados; en **parcial**:
   cuota = intereses.
5. En período normal:
   - recalcula la cuota francesa al salir de carencia, en cada cambio de tipo
     (manteniendo el plazo restante, como una revisión de hipoteca) y tras un
     prepago `REDUCE_CUOTA`;
   - con `REDUCE_PLAZO` conserva la cuota, por lo que el cuadro termina antes.
6. La última cuota se ajusta para dejar el saldo **exactamente a cero**
   (también en el último mes del calendario, absorbiendo redondeos de carencia o
   cambios de tipo).

`cuotaDelPeriodo` incorpora `amortizacionAdicional`: el `capital` devuelto
incluye el prepago y la `cuota` suma esa salida de caja del mes.
`resumenPrestamo` cuenta los prepagos en el capital amortizado.

## 3. Integración con gastos recurrentes y rentabilidad

- Al guardar un préstamo, el importe nominal y el mes de inicio de la plantilla
  recurrente se derivan del cuadro: con **carencia total** la plantilla empieza
  en el primer mes con pago; con **carencia parcial** empieza en el inicio
  pagando sólo intereses.
- El efecto de enriquecimiento (`App.tsx`) ajusta cada recibo generado al
  cuadro: `importe`, `intereses` y `capitalAmortizado` (incluido el prepago de
  ese mes). Sigue siendo idempotente y no pisa recibos ya desglosados; los
  recibos históricos no se modifican al editar las condiciones.
- Como resultado, el cuadre de Rentabilidad refleja automáticamente meses de
  carencia (menor o nula salida), subidas/bajadas de tipo y los prepagos como
  salida extraordinaria de caja y reducción de deuda.

## 4. UI

- **`PrestamoModal`**: editores compactos de meses/tipo de carencia, tramos de
  tipo (añadir/quitar revisiones con fecha y nuevo TIN) y amortizaciones
  anticipadas (período, importe y modalidad). La previsualización se calcula
  desde el cuadro real: primera cuota tras carencia, nº de recibos, intereses
  totales y avisos de carencia/variable/prepagos. Validaciones de fechas dentro
  del plazo y de que la suma de prepagos no supera el capital.
- **`TablaAmortizacionModal`**: filas ámbar para carencia, borde violeta en los
  cambios de tipo, columna **Amort. extra** y exportación CSV con esas
  indicaciones.

## 5. Verificación (motor, reloj fijado)

- **Regresión sin extras**: 150.000 € al 3 % a 30 años → cuota 632,41 €,
  capital total 150.000 €, intereses 77.665,33 €, 360 filas, saldo 0 (idéntico
  a la 2.3).
- **Carencia parcial 12 m**: 12 recibos de sólo 375 € sin amortizar; después
  cuota de 645,89 €; capital 150.000 €, intereses 79.270,15 €, saldo 0.
- **Carencia total 12 m**: no hay cobro; el saldo crece por intereses
  capitalizados hasta 154.562,39 €; primera cuota ordinaria 665,54 €;
  intereses 81.605,76 €; saldo 0.
- **Tipo variable** (3 % → 4 % en el mes 13): cuota 632,41 € el primer año y
  713,74 € tras la revisión; saldo final 0.
- **Prepago 50.000 € a los 12 meses – reduce plazo**: el préstamo vence en
  **206 recibos** manteniendo la cuota; saldo 0.
- **Prepago 50.000 € – reduce cuota**: 360 recibos; la cuota baja de 632,41 € a
  417,50 €; saldo 0.
- `tsc`, `npm run build` y carga de módulos en el dev server en verde.

## 6. Supuestos y límites

- El prepago se aplica al inicio del período indicado (antes de devengar
  intereses ese mes); no se modelan comisiones por cancelación anticipada.
- Los tramos se interpretan como tipo fijo por tramo desde la fecha indicada
  (no hay índice referenciado automático tipo Euribor + diferencial; se
  introducen manualmente en cada revisión).
- Editar carencia/tipo/prepagos de un préstamo con recibos ya generados afecta
  a los recibos futuros aún no desglosados; los históricos permanecen inmutables.
