/**
 * ORDEN 17 — correctiva D2 (documentada en MAPA §12.2 tras GAP-R4).
 *
 * Antes del fix, reportingEngine (GAP3) y matchingEngine (GAP6) filtraban gastos
 * por `g.fecha`, alias que el ERP nunca escribe (crearGasto/normalizarGasto
 * escriben `fechaDevengo` y `fechaPago`). Resultado: informes y exportación
 * fiscal con gastos = 0 y candidatos GAP6 "Fecha fuera ventana 999d".
 *
 * Estos tests fijan el comportamiento corregido usando gastos tal y como los
 * produce el ERP (sin `fecha`). Sin red, Firebase ni localStorage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContratoFormalizacion, Gasto, Inmueble, UsuarioApp } from '../types';
import type { MovimientoBancario } from '../types/conciliacion';
import { crearGasto, fechaEfectivaGasto, normalizarGasto } from './gastosEngine';
import {
  crearRangoAnual,
  crearRangoMensual,
  generarEvolucionTemporal,
  generarExportacionFiscal,
  generarInformeCartera,
  generarInformeInmueble,
  generarInformeRentabilidad,
} from './reportingEngine';
import { buscarCandidatos } from './conciliacion/matchingEngine';

const PROP = 'prop_d2';

const inmueble: Inmueble = {
  id: 'inm_d2',
  propietarioId: PROP,
  direccion: 'Calle Prueba 1',
} as any;

const admin: UsuarioApp = {
  id: 'u_admin',
  email: 'admin@test.local',
  nombre: 'Admin',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  createdAt: '',
  updatedAt: '',
} as any;

/** Gasto creado exactamente como lo hace el ERP: sin `fecha`, con `fechaDevengo`. */
function gastoERP(over: Partial<Parameters<typeof crearGasto>[0]> = {}): Gasto {
  const g = crearGasto({
    inmuebleId: inmueble.id,
    propietarioId: PROP,
    categoria: 'COMUNIDAD',
    concepto: 'Comunidad junio 2026',
    importe: 120,
    fechaDevengo: '2026-06-15',
    ...over,
  } as any);
  return normalizarGasto(g);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 21, 12));
});
afterEach(() => vi.useRealTimers());

describe('D2 · fechaEfectivaGasto (gastosEngine)', () => {
  it('el ERP no escribe `fecha`: crearGasto+normalizarGasto solo rellenan fechaDevengo', () => {
    const g = gastoERP();
    expect(g.fecha).toBeUndefined();
    expect(g.fechaDevengo).toBe('2026-06-15');
  });

  it('DEVENGO: fechaDevengo → fechaPago → fecha → createdAt', () => {
    expect(fechaEfectivaGasto({ fechaDevengo: '2026-06-15', fechaPago: '2026-07-01', fecha: '2020-01-01' } as Gasto)).toBe('2026-06-15');
    expect(fechaEfectivaGasto({ fechaPago: '2026-07-01', fecha: '2020-01-01' } as Gasto)).toBe('2026-07-01');
    expect(fechaEfectivaGasto({ fecha: '2020-01-01', createdAt: '2019-01-01T00:00:00Z' } as Gasto)).toBe('2020-01-01');
    expect(fechaEfectivaGasto({ createdAt: '2019-01-01T00:00:00Z' } as Gasto)).toBe('2019-01-01T00:00:00Z');
    expect(fechaEfectivaGasto({} as Gasto)).toBeUndefined();
  });

  it('PAGO: prioriza fechaPago sobre fechaDevengo', () => {
    expect(fechaEfectivaGasto({ fechaDevengo: '2026-06-15', fechaPago: '2026-07-01' } as Gasto, 'PAGO')).toBe('2026-07-01');
    expect(fechaEfectivaGasto({ fechaDevengo: '2026-06-15' } as Gasto, 'PAGO')).toBe('2026-06-15');
  });

  it('compatibilidad: fixtures legacy que solo traen `fecha` siguen funcionando', () => {
    expect(fechaEfectivaGasto({ fecha: '2024-01-15' } as Gasto)).toBe('2024-01-15');
  });
});

describe('D2 · GAP3 reportingEngine con gastos reales del ERP', () => {
  const gastos = [gastoERP(), gastoERP({ concepto: 'IBI', categoria: 'IBI', importe: 300, fechaDevengo: '2026-03-15' })];
  const contratos: ContratoFormalizacion[] = [];

  it('generarInformeCartera suma los gastos del ejercicio en economia.gastosTotales (antes: 0)', () => {
    const inf = generarInformeCartera(PROP, [inmueble], contratos, gastos, [], [], [], [], crearRangoAnual(2026), admin)!;
    expect(inf.economia.gastosTotales).toBe(420);
  });

  it('generarInformeCartera respeta el rango: solo junio → 120', () => {
    const inf = generarInformeCartera(PROP, [inmueble], contratos, gastos, [], [], [], [], crearRangoMensual(2026, 6), admin)!;
    expect(inf.economia.gastosTotales).toBe(120);
  });

  it('generarInformeInmueble incluye total y lista con fecha efectiva', () => {
    const inf = generarInformeInmueble(inmueble.id, [inmueble], contratos, gastos, [], [], crearRangoAnual(2026), admin)!;
    expect(inf.gastos.total).toBe(420);
    expect(inf.gastos.lista.map((x) => x.fecha).sort()).toEqual(['2026-03-15', '2026-06-15']);
  });

  it('generarEvolucionTemporal mensual asigna el gasto al mes de devengo', () => {
    const items = generarEvolucionTemporal([inmueble], contratos, gastos, { ...crearRangoAnual(2026), periodo: 'MENSUAL' } as any);
    const byP = (p: string) => items.find((i) => i.periodo === p);
    expect(byP('2026-06')?.gastos).toBe(120);
    expect(byP('2026-03')?.gastos).toBe(300);
    expect(byP('2026-05')?.gastos).toBe(0);
  });

  it('generarInformeRentabilidad computa gastos (total y por inmueble)', () => {
    const inf = generarInformeRentabilidad(PROP, [inmueble], contratos, gastos, crearRangoAnual(2026), admin);
    expect(inf.gastos).toBe(420);
    expect(inf.detallePorInmueble?.[0]?.gastos).toBe(420);
  });

  it('generarExportacionFiscal emite los items GASTO con ejercicio/periodo/fecha derivados de fechaDevengo', () => {
    const exp = generarExportacionFiscal(PROP, [inmueble], contratos, gastos, crearRangoAnual(2026), admin);
    const items = exp.items.filter((i) => i.tipo === 'GASTO');
    expect(items).toHaveLength(2);
    expect(exp.totalGastos).toBe(420);
    const ibi = items.find((i) => i.concepto === 'IBI')!;
    expect(ibi.ejercicio).toBe(2026);
    expect(ibi.periodo).toBe('2026-03');
    expect(ibi.fecha).toBe('2026-03-15');
  });

  it('gasto sin ninguna fecha (ni createdAt) queda fuera del rango sin lanzar', () => {
    const roto = { ...gastoERP(), fechaDevengo: undefined, fechaPago: undefined, createdAt: '' } as unknown as Gasto;
    const inf = generarInformeInmueble(inmueble.id, [inmueble], contratos, [roto], [], [], crearRangoAnual(2026), admin)!;
    expect(inf.gastos.total).toBe(0);
  });
});

describe('D2 · GAP6 matchingEngine con gastos reales del ERP', () => {
  const mov: MovimientoBancario = {
    id: 'mov_d2',
    propietarioId: PROP,
    fechaOperacion: '2026-07-01',
    fechaValor: '2026-07-01',
    importe: -120,
    concepto: 'RECIBO COMUNIDAD',
    tipo: 'GASTO',
    estado: 'PENDIENTE',
  } as any;

  it('candidato GASTO usa fechaPago (criterio PAGO) y ya no cae en "fuera ventana 999d"', () => {
    const g = { ...gastoERP(), estado: 'PAGADO', fechaPago: '2026-07-01' } as Gasto;
    const res = buscarCandidatos(mov, [], [g], [inmueble], []);
    expect(res).toHaveLength(1);
    expect(res[0].candidato.fecha).toBe('2026-07-01');
    const fecha = res[0].factores.find((f) => f.criterio === 'FECHA_EXACTA' || f.criterio === 'FECHA_VENTANA');
    expect(fecha?.coincide).toBe(true);
    expect(fecha?.detalle).not.toContain('999d');
  });

  it('sin fechaPago cae a fechaDevengo (gasto pendiente)', () => {
    const g = gastoERP({ fechaDevengo: '2026-06-28' });
    const res = buscarCandidatos(mov, [], [g], [inmueble], []);
    expect(res[0].candidato.fecha).toBe('2026-06-28');
    const fecha = res[0].factores.find((f) => f.criterio === 'FECHA_EXACTA' || f.criterio === 'FECHA_VENTANA');
    expect(fecha?.coincide).toBe(true);
  });
});
