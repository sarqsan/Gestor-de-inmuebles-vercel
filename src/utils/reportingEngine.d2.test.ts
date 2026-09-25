/**
 * D2 — fecha de referencia de gastos en reportingEngine.
 *
 * Los informes de rango leían solo `Gasto.fecha`. El ERP escribe
 * `fechaDevengo` / `fechaPago` y deja `fecha` vacía. Estos tests fijan el
 * contrato: devengo, si no pago, si no el alias histórico `fecha`.
 * No cubren deducibilidad (D1) ni el desfase de zona horaria de los rangos
 * construidos con `toISOString` (D3).
 */
import { describe, expect, it } from 'vitest';
import type { Gasto, Inmueble, RangoFechas } from '../types';
import {
  fechaReferenciaGasto,
  generarEvolucionTemporal,
  generarExportacionFiscal,
  generarInformeCartera,
  generarInformeInmueble,
  generarInformeRentabilidad,
} from './reportingEngine';

const rango = (inicio: string, fin: string, periodo: RangoFechas['periodo'] = 'PERSONALIZADO'): RangoFechas => ({
  fechaInicio: inicio,
  fechaFin: fin,
  periodo,
  ejercicio: Number(inicio.slice(0, 4)),
});

const inmueble = (): Inmueble =>
  ({
    id: 'inm1',
    direccion: 'Calle Mayor 1',
    ciudad: 'Madrid',
    precio: 800,
    estado: 'alquilado',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop1',
  }) as Inmueble;

const gasto = (p: Partial<Gasto> = {}): Gasto =>
  ({
    id: 'g1',
    inmuebleId: 'inm1',
    propietarioId: 'prop1',
    tipo: 'EXPLOTACION',
    categoria: 'IBI',
    concepto: 'IBI',
    importe: 120,
    estado: 'PAGADO',
    aCargoDe: 'arrendador',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...p,
  }) as Gasto;

const cartera = (gastos: Gasto[], r: RangoFechas = rango('2026-01-01', '2026-12-31', 'ANUAL')) =>
  generarInformeCartera('prop1', [inmueble()], [], gastos, [], [], [], [], r)!;

describe('reportingEngine · D2 fechaReferenciaGasto', () => {
  it('prioriza fechaDevengo, luego fechaPago, luego el alias histórico fecha', () => {
    expect(fechaReferenciaGasto(gasto({ fechaDevengo: '2026-03-01', fechaPago: '2026-04-01', fecha: '2026-05-01' }))).toBe('2026-03-01');
    expect(fechaReferenciaGasto(gasto({ fechaPago: '2026-04-01', fecha: '2026-05-01' }))).toBe('2026-04-01');
    expect(fechaReferenciaGasto(gasto({ fecha: '2026-05-01' }))).toBe('2026-05-01');
  });

  it('cadena vacía cae a la siguiente; una cadena inválida no se salta (mismo || que fiscalEngine)', () => {
    expect(fechaReferenciaGasto(gasto({ fechaDevengo: '', fechaPago: '2026-04-02' }))).toBe('2026-04-02');
    expect(fechaReferenciaGasto(gasto({ fechaDevengo: 'no-es-fecha', fechaPago: '2026-04-02', fecha: '2026-05-01' }))).toBeUndefined();
  });

  it('sin ninguna de las tres fechas operativas no usa createdAt ni periodoMesAnio', () => {
    expect(fechaReferenciaGasto(gasto({ periodoMesAnio: '2026-06' }))).toBeUndefined();
    expect(fechaReferenciaGasto(gasto({}))).toBeUndefined();
  });
});

describe('reportingEngine · D2 informes y exportación', () => {
  it('cartera: un gasto del ERP solo con fechaDevengo entra en el rango (el caso observado)', () => {
    const informe = cartera([gasto({ id: 'ibi', importe: 120, fechaDevengo: '2026-03-10' })]);
    expect(informe.economia.gastosTotales).toBe(120);
  });

  it('cartera: un gasto antiguo solo con fecha sigue contando; uno sin fechas operativas no', () => {
    const informe = cartera([
      gasto({ id: 'viejo', importe: 40, fecha: '2026-02-02' }),
      gasto({ id: 'vacio', importe: 999 }),
    ]);
    expect(informe.economia.gastosTotales).toBe(40);
  });

  it('cartera: el devengo manda sobre el pago cuando caen en años distintos', () => {
    const en2026 = cartera([
      gasto({ id: 'devengo-fuera', importe: 50, fechaDevengo: '2025-12-20', fechaPago: '2026-01-10', fecha: '2026-02-01' }),
      gasto({ id: 'devengo-dentro', importe: 70, fechaDevengo: '2026-01-10', fechaPago: '2025-12-20' }),
      gasto({ id: 'solo-pago', importe: 15, fechaPago: '2026-08-08' }),
    ]);
    expect(en2026.economia.gastosTotales).toBe(85);
  });

  it('evolución anual: el cambio de año sigue al devengo, no al pago ni al alias', () => {
    const items = generarEvolucionTemporal(
      [inmueble()],
      [],
      [gasto({ importe: 33, fechaDevengo: '2025-12-15', fechaPago: '2026-01-10', fecha: '2026-02-01' })],
      rango('2025-01-01', '2026-12-31', 'ANUAL'),
    );
    const y2025 = items.find((i) => i.periodo === '2025');
    const y2026 = items.find((i) => i.periodo === '2026');
    expect(y2025?.gastos).toBe(33);
    expect(y2026?.gastos).toBe(0);
  });

  it('inmueble y rentabilidad usan la misma fecha; la lista no queda con fecha vacía', () => {
    const g = gasto({ importe: 80, fechaDevengo: '2026-05-15' });
    const inm = generarInformeInmueble('inm1', [inmueble()], [], [g], [], [], rango('2026-01-01', '2026-12-31'))!;
    expect(inm.economia.gastosTotales).toBe(80);
    expect(inm.gastos.lista).toEqual([
      expect.objectContaining({ id: 'g1', fecha: '2026-05-15', importe: 80 }),
    ]);
    const rent = generarInformeRentabilidad('prop1', [inmueble()], [], [g], rango('2026-01-01', '2026-12-31'))!;
    expect(rent.gastos).toBe(80);
    expect(rent.detallePorInmueble?.[0].gastos).toBe(80);
  });

  it('exportación fiscal incluye el gasto del ERP y rellena fecha/periodo desde el devengo', () => {
    const exp = generarExportacionFiscal(
      'prop1',
      [inmueble()],
      [],
      [
        gasto({ id: 'ibi', importe: 120, fechaDevengo: '2026-03-10', ejercicioFiscal: 2025 }),
        gasto({ id: 'fuera', importe: 9, fechaDevengo: '2025-03-10' }),
      ],
      rango('2026-01-01', '2026-12-31'),
    );
    const lineas = exp.items.filter((i) => i.tipo === 'GASTO');
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({
      referenciaId: 'ibi',
      fecha: '2026-03-10',
      periodo: '2026-03',
      importe: 120,
      ejercicio: 2025,
    });
  });
});
