/**
 * F4 — REPARTO DE N TITULARES DENTRO DEL MOTOR DE LIQUIDACIÓN REAL.
 * ==================================================================
 * Estas pruebas NO llaman a un diagnóstico aislado: construyen una
 * LIQUIDACIÓN COMPLETA (cobros → honorarios → IVA → gastos → reparto → cuadre)
 * y comprueban el importe que acaba en manos de cada titular.
 */
import { describe, expect, it } from 'vitest';
import { aprobarLiquidacion, construirBorradorLiquidacion } from '../src/tesoreria/liquidacionEngine';
import type { EntradaLiquidacion } from '../src/tesoreria/liquidacionEngine';
import type { CobroPeriodo, ContratoFormalizacion, Propietario, Titularidad } from '../src/types';
import type { GastoInmueble as GastoTesoreria } from '../src/tesoreria/tipos';
import { construirTitularidad } from '../src/utils/titularidadesEngine';

const PERIODO = '2026-03';

function propietario(id: string, nombre: string): Propietario {
  return {
    id,
    nombre,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: '600000000',
    email: `${id}@correo.com`,
    direccion: 'Calle 1',
    ciudad: 'Valencia',
    codigoPostal: '46001',
    cuentasBancarias: [{ id: 'c1', alias: 'Principal', iban: 'ES91 2100 0418 4502 0005 1332', esPrincipal: true }],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
  } as Propietario;
}

function cobro(parcial: Partial<CobroPeriodo> & { id: string; inmuebleId: string }): CobroPeriodo {
  return {
    contratoId: 'con-1',
    inquilinoId: 'inq-1',
    propietarioId: 'p1',
    mes: 3,
    anio: 2026,
    periodoMesAnio: PERIODO,
    nombreMes: 'Marzo 2026',
    importePrevisto: 1000,
    importeRecibido: 1000,
    fechaVencimiento: '2026-03-05',
    estado: 'RECIBIDO',
    historialCambios: [],
    ...parcial,
  } as CobroPeriodo;
}

function contrato(cobros: CobroPeriodo[], inmuebleId = 'inm-1'): ContratoFormalizacion {
  return {
    id: 'con-1',
    inmuebleId,
    propietarioId: 'p1',
    registroCobros: cobros,
  } as unknown as ContratoFormalizacion;
}

function gasto(total: number): GastoTesoreria {
  return {
    id: 'g1',
    inmuebleId: 'inm-1',
    propietarioId: 'p1',
    categoria: 'comunidad',
    concepto: 'Comunidad',
    base: Number((total / 1.21).toFixed(2)),
    ivaPct: 21,
    ivaImporte: Number((total - total / 1.21).toFixed(2)),
    total,
    fechaGasto: '2026-03-10',
    pagadoPor: 'administracion',
    imputableA: 'propietario',
    estado: 'pagado',
    fechaCreacion: '2026-03-10',
  } as unknown as GastoTesoreria;
}

function titularidades(reparto: Array<[string, number | null]>): Titularidad[] {
  return reparto.map(([pid, pct]) =>
    construirTitularidad({ inmuebleId: 'inm-1', propietarioId: pid, porcentaje: pct, propietarioNombre: `Nombre ${pid}` }),
  );
}

function entrada(parcial: Partial<EntradaLiquidacion> = {}): EntradaLiquidacion {
  return {
    propietario: propietario('p1', 'Ana Titular'),
    periodo: PERIODO,
    contratos: [contrato([cobro({ id: 'cob-1', inmuebleId: 'inm-1', importePrevisto: 1000, importeRecibido: 1000 })])],
    gastos: [],
    actor: { id: 'u1', nombre: 'Admin' },
    ...parcial,
  };
}

const nombres = { p1: 'Ana', p2: 'Luis', p3: 'Marta' };

describe('F4 — liquidación completa con N titulares', () => {
  it('3 titulares 50/30/20 ⇒ 500 / 300 / 200 sobre el neto', () => {
    const res = construirBorradorLiquidacion(
      entrada({ titularidades: titularidades([['p1', 50], ['p2', 30], ['p3', 20]]), nombresTitulares: nombres }),
    );
    expect(res.ok).toBe(true);
    const liq = res.liquidacion!;
    // Bruto 1000 − honorarios 8 % (80) − IVA 21 % (16,80) = 903,20 a repartir.
    expect(liq.totalBrutoCobrado).toBe(1000);
    expect(res.reparto?.origen).toBe('TITULARIDADES');
    const totalRepartido = (res.reparto?.detalle || []).reduce((a, p) => a + p.importe, 0);
    expect(totalRepartido).toBeCloseTo(903.2, 2);
    // El neto de la liquidación es la parte del titular principal (50 %).
    expect(liq.netoPropietario).toBe(451.6);
    expect(res.reparto?.detalle.map((p) => p.importe)).toEqual([451.6, 270.96, 180.64]);
    // Las líneas de reparto dejan el neto del titular principal.
    expect(liq.lineas.filter((l) => l.naturaleza === 'retenido').map((l) => l.importe)).toEqual([-270.96, -180.64]);
    expect(liq.lineas.filter((l) => l.naturaleza === 'retenido')[0].concepto).toContain('Luis');
    // La liquidación SIGUE cuadrando: suma de líneas = neto.
    const suma = liq.lineas.reduce((a, l) => a + l.importe, 0);
    expect(Math.abs(suma - liq.netoPropietario)).toBeLessThan(0.011);
  });

  it('4 titulares al 25 % ⇒ partes idénticas', () => {
    const res = construirBorradorLiquidacion(
      entrada({
        titularidades: titularidades([
          ['p1', 25],
          ['p2', 25],
          ['p3', 25],
          ['p4', 25],
        ]),
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.reparto?.detalle.map((p) => p.importe)).toEqual([225.8, 225.8, 225.8, 225.8]);
    expect(res.reparto?.importePrincipal).toBe(225.8);
  });

  it('el reparto se aplica DESPUÉS de gastos e impuestos', () => {
    const res = construirBorradorLiquidacion(
      entrada({
        gastos: [gasto(121)],
        titularidades: titularidades([['p1', 60], ['p2', 40]]),
        nombresTitulares: nombres,
      }),
    );
    expect(res.ok).toBe(true);
    const liq = res.liquidacion!;
    // 1000 − 80 − 16,80 − 121 = 782,20 a repartir (60/40).
    expect((res.reparto?.detalle || []).reduce((a, p) => a + p.importe, 0)).toBeCloseTo(782.2, 2);
    expect(res.reparto?.detalle.map((p) => p.importe)).toEqual([469.32, 312.88]);
    expect(liq.netoPropietario).toBe(469.32);
  });

  it('un único titular ⇒ todo para él y SIN líneas de reparto', () => {
    const res = construirBorradorLiquidacion(entrada({ titularidades: titularidades([['p1', 100]]) }));
    expect(res.ok).toBe(true);
    expect(res.reparto?.origen).toBe('TITULARIDADES');
    expect(res.reparto?.partes).toHaveLength(0);
    expect(res.liquidacion?.netoPropietario).toBe(903.2);
  });
});

describe('F4 — bloqueos (nunca reparte "a ojo")', () => {
  it('3 titulares con porcentajes pendientes ⇒ BLOQUEA la liquidación', () => {
    const res = construirBorradorLiquidacion(
      entrada({ titularidades: titularidades([['p1', 50], ['p2', null], ['p3', null]]) }),
    );
    expect(res.ok).toBe(false);
    expect(res.errores.join(' ')).toMatch(/representable/);
    expect(res.liquidacion).toBeUndefined();
  });

  it('2 titulares sin porcentaje ⇒ BLOQUEA (no asume 50/50)', () => {
    const res = construirBorradorLiquidacion(entrada({ titularidades: titularidades([['p1', null], ['p2', null]]) }));
    expect(res.ok).toBe(false);
    expect(res.errores.join(' ')).toMatch(/50\/50/);
  });

  it('porcentajes que no suman 100 ⇒ BLOQUEA', () => {
    const res = construirBorradorLiquidacion(entrada({ titularidades: titularidades([['p1', 60], ['p2', 30]]) }));
    expect(res.ok).toBe(false);
    expect(res.errores.join(' ')).toMatch(/suman 90/);
  });

  it('un titular pendiente se DERIVA del resto y la liquidación avanza', () => {
    const res = construirBorradorLiquidacion(
      entrada({ titularidades: titularidades([['p1', 70], ['p2', 10], ['p3', null]]) }),
    );
    expect(res.ok).toBe(true);
    expect(res.reparto?.detalle.map((p) => p.porcentaje)).toEqual([70, 10, 20]);
  });
});

describe('F4 — compatibilidad con el comportamiento anterior', () => {
  it('sin titularidades + repartoCopropiedad ⇒ reparto binario heredado', () => {
    const res = construirBorradorLiquidacion(
      entrada({
        config: { repartoCopropiedad: { segundoPropietarioId: 'p2', porcentajeSegundo: 40, segundoPropietarioNombre: 'Luis' } },
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.reparto?.origen).toBe('REPARTO_BINARIO');
    expect(res.reparto?.importePrincipal).toBe(541.92);
    expect(res.liquidacion?.netoPropietario).toBe(541.92);
  });

  it('sin titularidades y sin reparto ⇒ todo para el titular principal', () => {
    const res = construirBorradorLiquidacion(entrada());
    expect(res.ok).toBe(true);
    expect(res.reparto?.origen).toBe('SIN_REPARTO');
    expect(res.liquidacion?.netoPropietario).toBe(903.2);
  });

  it('la liquidación con reparto sigue siendo aprobable (cuadre e idempotencia)', () => {
    const res = construirBorradorLiquidacion(
      entrada({ titularidades: titularidades([['p1', 50], ['p2', 30], ['p3', 20]]) }),
    );
    expect(res.ok).toBe(true);
    const aprobada = aprobarLiquidacion(res.liquidacion!, { id: 'u1', nombre: 'Admin' });
    expect(aprobada.ok).toBe(true);
    expect(aprobada.liquidacion?.estado).toBe('APROBADA');
  });

  it('reparto con titularidades de VARIOS inmuebles del mismo propietario', () => {
    const res = construirBorradorLiquidacion({
      ...entrada({
        contratos: [
          contrato([cobro({ id: 'cob-1', inmuebleId: 'inm-1', importePrevisto: 600, importeRecibido: 600 })]),
          contrato([cobro({ id: 'cob-2', inmuebleId: 'inm-2', importePrevisto: 400, importeRecibido: 400 })]),
        ],
      }),
      titularidades: titularidades([['p1', 80], ['p2', 20]]),
    });
    expect(res.ok).toBe(true);
    expect(res.liquidacion?.inmuebleIds.sort()).toEqual(['inm-1', 'inm-2']);
    expect(res.reparto?.detalle.map((p) => p.importe)).toEqual([722.56, 180.64]);
  });
});
