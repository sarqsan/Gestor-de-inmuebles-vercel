import { describe, it, expect } from 'vitest';
import {
  inmueblesConIndice,
  planificarMigracion,
  planReversion,
  propuestasAplicables,
  ranurasTitularidad,
  type EntradaMigracion,
} from './migracionTitularidades';
import { crearTitularidad } from '../utils/titularidadesEngine';
import type { ConfigFiscalLiquidacion } from '../tesoreria/tipos';
import type { Inmueble, Propietario, Titularidad } from '../types';

const inm = (parcial: Partial<Inmueble>): Inmueble =>
  ({
    id: 'x',
    direccion: 'Dir',
    ciudad: 'Ciu',
    precio: 800,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...parcial,
  }) as Inmueble;

const tit = (id: string): Propietario =>
  ({ id, nombre: id, nifCif: id, email: `${id}@t.local` }) as unknown as Propietario;

const reparto = (segundo: string, pct: number): ConfigFiscalLiquidacion =>
  ({
    honorariosPct: 8,
    ivaHonorariosPct: 21,
    aplicaIvaHonorarios: true,
    aplicaRetencion: false,
    retencionPct: 0,
    repartoCopropiedad: { segundoPropietarioId: segundo, segundoPropietarioNombre: segundo, porcentajeSegundo: pct },
  }) as ConfigFiscalLiquidacion;

const sinReparto: ConfigFiscalLiquidacion = {
  honorariosPct: 8,
  ivaHonorariosPct: 21,
  aplicaIvaHonorarios: true,
  aplicaRetencion: false,
  retencionPct: 0,
} as ConfigFiscalLiquidacion;

const LOTE = 'mig-2026-09-30-001';

/* ------------------------------------------------------------------ */

describe('BLOQUE 2 · Migración: DRY-RUN sin escribir nada (2.4)', () => {
  it('el informe recuenta documentos, relaciones, incoherencias y pendientes', () => {
    const entradas: EntradaMigracion[] = [
      { inmueble: inm({ id: 'inm-1', propietarioId: 'A', propietarioPrincipalId: 'A' }) },
      {
        inmueble: inm({
          id: 'inm-2',
          propietarioId: 'A',
          propietarioPrincipalId: 'A',
          propietarioSecundarioId: 'B',
        }),
        config: reparto('B', 30),
      },
      { inmueble: inm({ id: 'inm-3' }) }, // sin titular
    ];

    const plan = planificarMigracion(entradas, { migracionId: LOTE });

    expect(plan.inmueblesAnalizados).toBe(3);
    expect(plan.inmueblesAfectados).toBe(2);
    expect(plan.inmueblesSinTitular).toEqual(['inm-3']);
    expect(plan.titularidadesGeneradas).toBe(3);
    expect(plan.porcentajesUnicoTitular).toBe(1);
    expect(plan.porcentajesDeReparto).toBe(2);
    expect(plan.porcentajesPendientes).toBe(0);
    expect(plan.requiereDecision).toBe(true);
    expect(plan.resumen).toMatch(/DRY-RUN/);
    expect(plan.resumen).toMatch(/no se ha escrito nada/);
  });

  it('NO inventa porcentajes: sin reparto real quedan PENDIENTES', () => {
    const entradas: EntradaMigracion[] = [
      {
        inmueble: inm({
          id: 'inm-1',
          propietarioId: 'A',
          propietarioPrincipalId: 'A',
          propietarioSecundarioId: 'B',
        }),
        config: sinReparto,
      },
    ];
    const plan = planificarMigracion(entradas, { migracionId: LOTE });

    expect(plan.porcentajesPendientes).toBe(2);
    for (const p of plan.propuestas) {
      expect(p.titularidad.porcentaje).toBeNull();
      expect(p.titularidad.porcentajePendiente).toBe(true);
    }
  });

  it('con 3 titulares no reparte a partes iguales: todos PENDIENTES', () => {
    const entradas: EntradaMigracion[] = [
      {
        inmueble: inm({
          id: 'inm-1',
          propietarioPrincipalId: 'A',
          propietarioId: 'B',
          propietarioSecundarioId: 'C',
        }),
        config: reparto('B', 30),
      },
    ];
    const plan = planificarMigracion(entradas, { migracionId: LOTE });

    expect(plan.titularidadesGeneradas).toBe(3);
    expect(plan.porcentajesPendientes).toBe(3);
    expect(plan.incoherencias.some((i) => i.tipo === 'REPARTO_INVALIDO')).toBe(true);
    expect(plan.incoherencias.find((i) => i.tipo === 'REPARTO_INVALIDO')?.detalle).toMatch(
      /NO se reparte a partes iguales/
    );
  });

  it('toma los porcentajes del reparto real cuadrando los titulares', () => {
    const entradas: EntradaMigracion[] = [
      {
        inmueble: inm({ id: 'inm-1', propietarioPrincipalId: 'A', propietarioSecundarioId: 'B' }),
        config: reparto('B', 40),
      },
    ];
    const plan = planificarMigracion(entradas, { migracionId: LOTE });
    const a = plan.propuestas.find((p) => p.titularidad.propietarioId === 'A');
    const b = plan.propuestas.find((p) => p.titularidad.propietarioId === 'B');

    expect(a?.titularidad.porcentaje).toBe(60);
    expect(b?.titularidad.porcentaje).toBe(40);
    expect(a?.titularidad.esPrincipal).toBe(true);
    expect(b?.titularidad.rol).toBe('COTITULAR');
  });

  it('el reparto que apunta a un tercero NO se extrapola', () => {
    const entradas: EntradaMigracion[] = [
      {
        inmueble: inm({ id: 'inm-1', propietarioPrincipalId: 'A', propietarioSecundarioId: 'B' }),
        config: reparto('Z', 40),
      },
    ];
    const plan = planificarMigracion(entradas, { migracionId: LOTE });
    expect(plan.porcentajesPendientes).toBe(2);
    expect(plan.incoherencias.some((i) => i.tipo === 'REPARTO_APUNTA_A_TERCERO')).toBe(true);
  });

  it('detecta titulares que no constan en la colección propietarios', () => {
    const entradas: EntradaMigracion[] = [
      { inmueble: inm({ id: 'inm-1', propietarioPrincipalId: 'FANTASMA' }) },
    ];
    const plan = planificarMigracion(entradas, {
      migracionId: LOTE,
      propietarios: [tit('A')],
    });
    expect(plan.incoherencias.some((i) => i.tipo === 'TITULAR_NO_REGISTRADO')).toBe(true);
  });
});

describe('BLOQUE 2 · Migración: ADITIVA, IDEMPOTENTE y REVERSIBLE (2.4)', () => {
  const entrada2: EntradaMigracion = {
    inmueble: inm({ id: 'inm-1', propietarioPrincipalId: 'A', propietarioSecundarioId: 'B' }),
    config: reparto('B', 30),
  };

  it('genera claves deterministas inmuebleId__propietarioId', () => {
    const plan = planificarMigracion([entrada2], { migracionId: LOTE });
    expect(plan.propuestas.map((p) => p.titularidad.id).sort()).toEqual([
      'inm-1__A',
      'inm-1__B',
    ]);
  });

  it('IDEMPOTENTE: la segunda pasada no duplica ni propone cambios', () => {
    const primera = planificarMigracion([entrada2], { migracionId: LOTE });
    const yaCreadas = primera.propuestas.map((p) => p.titularidad);

    const segunda = planificarMigracion([entrada2], {
      migracionId: LOTE,
      existentes: yaCreadas,
    });

    expect(segunda.porAccion.SIN_CAMBIOS).toBe(2);
    expect(segunda.porAccion.CREAR).toBe(0);
    expect(propuestasAplicables(segunda)).toHaveLength(0);
  });

  it('evita duplicados dentro de la misma pasada', () => {
    const plan = planificarMigracion(
      [
        {
          inmueble: inm({
            id: 'inm-1',
            propietarioPrincipalId: 'A',
            propietarioId: 'A',
            propietarioSecundarioId: 'A',
          }),
        },
      ],
      { migracionId: LOTE }
    );
    expect(plan.titularidadesGeneradas).toBe(1);
    expect(plan.duplicadosEvitados).toBe(2);
  });

  it('NO sobrescribe una titularidad creada a mano', () => {
    const manual: Titularidad = crearTitularidad({
      inmuebleId: 'inm-1',
      propietarioId: 'B',
      porcentaje: 15,
      origen: 'ALTA',
    });
    const plan = planificarMigracion([entrada2], { migracionId: LOTE, existentes: [manual] });

    const propuestaB = plan.propuestas.find((p) => p.titularidad.propietarioId === 'B');
    expect(propuestaB?.accion).toBe('SIN_CAMBIOS');
    expect(propuestaB?.detalle).toMatch(/NO se sobrescribe/);
    expect(manual.porcentaje).toBe(15);
  });

  it('ADITIVA: no propone borrar ni modificar los campos heredados', () => {
    const plan = planificarMigracion([entrada2], { migracionId: LOTE });
    for (const p of plan.propuestas) {
      expect(p.titularidad.origen).toBe('MIGRACION');
      expect(p.titularidad.migracionId).toBe(LOTE);
    }
    // El índice es lo único que se propone añadir al inmueble.
    expect(inmueblesConIndice(plan)).toEqual([{ inmuebleId: 'inm-1', titularesIds: ['A', 'B'] }]);
  });

  it('REVERSIBLE: la reversión cierra (no borra) y protege lo ajeno', () => {
    const plan = planificarMigracion([entrada2], { migracionId: LOTE });
    const migradas = plan.propuestas.map((p) => p.titularidad);
    const manual = crearTitularidad({
      inmuebleId: 'inm-1',
      propietarioId: 'C',
      porcentaje: 10,
      origen: 'ALTA',
    });

    const reversion = planReversion(LOTE, [...migradas, manual]);

    expect(reversion.titularidadesACerrar).toHaveLength(2);
    expect(reversion.clavesProtegidas).toEqual([manual.id]);
    for (const cerrada of reversion.titularidadesACerrar) {
      expect(cerrada.estado).toBe('BAJA');
      expect(cerrada.motivoBaja).toContain('REVERSION_MIGRACION');
      expect(cerrada.historial.length).toBeGreaterThan(1); // append-only
    }
    expect(reversion.resumen).toMatch(/no se borra nada/);
  });

  it('la reversión de otro lote no toca nada', () => {
    const plan = planificarMigracion([entrada2], { migracionId: LOTE });
    const reversion = planReversion('OTRO-LOTE', plan.propuestas.map((p) => p.titularidad));
    expect(reversion.titularidadesACerrar).toHaveLength(0);
  });
});

describe('BLOQUE 2 · Migración: coherencia de ranuras', () => {
  it('prelación: propietarioPrincipalId manda sobre propietarioId', () => {
    const ranuras = ranurasTitularidad(
      inm({ id: 'inm-1', propietarioId: 'A', propietarioPrincipalId: 'P' })
    );
    expect(ranuras[0]).toEqual({ campo: 'propietarioPrincipalId', propietarioId: 'P' });
  });

  it('ranuras en conflicto → incoherencia BLOQUEANTE (requiere decisión humana)', () => {
    const plan = planificarMigracion(
      [{ inmueble: inm({ id: 'inm-1', propietarioId: 'A', propietarioPrincipalId: 'B' }) }],
      { migracionId: LOTE }
    );
    const inc = plan.incoherencias.find((i) => i.tipo === 'RANURAS_EN_CONFLICTO');
    expect(inc?.bloqueante).toBe(true);
    expect(plan.requiereDecision).toBe(true);
    // Aun así se generan las dos titularidades (tratarlas como dos titulares).
    expect(plan.titularidadesGeneradas).toBe(2);
  });
});
