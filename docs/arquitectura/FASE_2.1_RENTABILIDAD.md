# Fase 2.1 — Cuadre de rentabilidad (ingresos vs gastos)

**Rama:** `arena/01a0a413-gestor-de-inmuebles-vercel`
**Depende de:** Fase 2.0 (módulo de gastos) y Fase 1 (cobros).
**Alcance:** cruzar los ingresos por alquiler (cobros) con los gastos de
explotación y la financiación hipotecaria, por inmueble y por año, sin mezclar
naturalezas contables.

## 1. Esquema contable

```
Resultado operativo (NOI) = ingresos cobrados − gastos de explotación pagados
                           (a cargo del arrendador)

Cash-flow tras hipoteca   = resultado operativo − cuota hipotecaria íntegra

Base fiscal orientativa   = explotación deducible + intereses hipotecarios
```

- La cuota hipotecaria se descuenta **solo en el cash-flow**. Su parte de
  **capital no es un gasto** (amortiza deuda) y únicamente los **intereses**
  tienen naturaleza de gasto financiero / deducible.
- Los gastos a cargo del **arrendatario** no entran en el cuadre del propietario.
- Solo computan los gastos en estado **PAGADO**. Los **PENDIENTES** se muestran
  como aviso de caja pero no reducen el resultado; los **ANULADOS** se ignoran.
- Los ingresos se toman de `CobroPeriodo.importeRecibido`; se informa también el
  devengo (`importePrevisto`) y la diferencia pendiente de cobro.

## 2. Implementación

- **`src/utils/rentabilidadEngine.ts`**
  - `cuadreRentabilidad({ cobros, gastos, inmuebles }, anio)` → una
    `CuadreInmueble` por inmueble visible (aunque no tenga movimiento), con
    ingresos, explotación, deducibles, cuota/intereses/capital, resultado
    operativo, margen %, cash-flow, base fiscal y rentabilidad neta.
  - `resumenGlobal(filas)` → totales de cartera.
  - `aniosConDatos(cobros, gastos)` → años para el selector.
  - La imputación temporal usa `anio/mes` en cobros y `periodoMesAnio` (o fecha
    de devengo) en gastos. La rentabilidad neta sobre adquisición solo se calcula
    para un año concreto y si el inmueble tiene `valorAdquisicion > 0`.
- **`src/components/sections/RentabilidadPanel.tsx`**: selector de año
  (o "Todos los años"), 6 tarjetas de cartera y tabla por inmueble con total.
- **`GastosSection`**: conmutador **Gastos / Rentabilidad** en la cabecera; la
  vista de rentabilidad recibe `cobros` (de `scopedCobros`), `gastos`
  (`scopedGastos`) e `inmuebles` (`scopedInmuebles`), todos ya aislados por
  propietario (los profesionales no llegan a esta sección).

### Trazabilidad por inmueble y exportación

- `detalleRentabilidad(...)` en el motor devuelve, para un inmueble y año: el
  cuadre anual, una **cuadrícula mensual** (ingresos / explotación / hipoteca /
  resultado operativo / cash-flow por mes, con barra proporcional) y los
  **movimientos reales** que lo sustentan (cobros y gastos no anulados). Los
  gastos pendientes o a cargo del inquilino se muestran marcados como "no
  computa", de modo que el total es plenamente trazable.
- `DetalleRentabilidadModal` se abre al **pulsar una fila** de la tabla de
  inmuebles.
- `cuadreToCSV(filas, global, anio)` exporta el cuadre completo (columnas de
  ingresos, explotación, deducibles, resultado, margen, hipoteca, intereses,
  capital, cash-flow, base fiscal y rentabilidad neta) con separador `;`, coma
  decimal y BOM, listo para Excel; botón **CSV** en la cabecera del panel.

## 3. Fórmulas y columnas

| Columna | Cálculo |
|---|---|
| Ingresos | Σ `importeRecibido` de los cobros del año |
| Explotación | Σ gastos `EXPLOTACION` PAGADOS a cargo del arrendador |
| Resultado op. | Ingresos − Explotación |
| Margen | Resultado op. ÷ Ingresos (%) |
| Hipoteca | Σ cuotas `FINANCIACION` íntegras PAGADAS |
| Cash-flow | Resultado op. − Hipoteca |
| Rentab. neta* | Resultado op. anual ÷ `valorAdquisicion` (%) |

Verificado con un caso de prueba: 12.000 € previstos / 11.000 € cobrados,
1.700 € de explotación, cuota 7.200 € (3.000 intereses + 4.200 capital) →
resultado operativo **9.300 €** (margen 84,5 %), cash-flow **2.100 €**, base
fiscal **4.700 €**, rentabilidad neta s/150.000 € **6,2 %**; un suministro a
cargo del inquilino (800 €) y una reparación pendiente (300 €) quedan fuera.

## 4. Pendientes / no incluidos (fases siguientes)

- **2.2** Recurrentes (comunidad/hipoteca mensual) y subida de facturas a
  Storage; cuotas del préstamo calculadas (capital/intereses automáticos).
- Ya incluidos en esta fase: desglose mensual por inmueble (modal de detalle) y
  exportación CSV. Queda pendiente exportación Excel/formato fiscal oficial.
- Vista específica de caja con gastos PENDIENTES y cobros en retraso unificada.
- Esto es un cuadre de gestión en base a caja/devengo simple; no sustituye un
  cierre fiscal oficial (las deducciones dependen de normativa aplicable).
