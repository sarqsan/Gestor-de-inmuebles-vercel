import { describe, it, expect } from 'vitest';
import {
  aplicarTitularidadesAInmueble,
  clavePerteneceAInmueble,
  claveTitularidad,
  cerrarTitularidad,
  crearTitularidad,
  derivarPorcentajes,
  idsTitularesVigentes,
  inmueblesDelTitular,
  leerRepartoReal,
  modificarTitularidad,
  normalizarPrincipal,
  numeroTitulares,
  participaAhora,
  participaEnInmueble,
  proyectarIdsDesdeTitularidades,
  reactivarTitularidad,
  reconstruirHistorial,
  titularidadesHistoricas,
  titularidadesVigentes,
  validarPorcentajes,
} from './titularidadesEngine';
import type { ConfigFiscalLiquidacion } from '../tesoreria/tipos';
import type { Inmueble, Titularidad } from '../types';

const ini = (parcial: Partial<Titularidad>): Titularidad =>
  ({ historial: [], version: 1, ...parcial }) as Titularidad;

const t = (
  inmuebleId: string,
  propietarioId: string,
  extra: Partial<Titularidad> = {}
): Titularidad =>
  ini({
    id: claveTitularidad(inmuebleId, propietarioId),
    inmuebleId,
    propietarioId,
    porcentaje: null,
    porcentajePendiente: true,
    esPrincipal: false,
    rol: 'COTITULAR',
    estado: 'ACTIVA',
    fechaDesde: '2026-01-01T00:00:00.000Z',
    fechaHasta: null,
    motivoBaja: null,
    origen: 'ALTA',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  });

const configCon = (segundo: string, pct: number): ConfigFiscalLiquidacion =>
  ({
    honorariosPct: 8,
    ivaHonorariosPct: 21,
    aplicaIvaHonorarios: true,
    aplicaRetencion: false,
    retencionPct: 0,
    repartoCopropiedad: {
      segundoPropietarioId: segundo,
      segundoPropietarioNombre: `Titular ${segundo}`,
      porcentajeSegundo: pct,
    },
  }) as ConfigFiscalLiquidacion;

const configSinReparto: ConfigFiscalLiquidacion = {
  honorariosPct: 8,
  ivaHonorariosPct: 21,
  aplicaIvaHonorarios: true,
  aplicaRetencion: false,
  retencionPct: 0,
} as ConfigFiscalLiquidacion;

/* ------------------------------------------------------------------ */

describe('BLOQUE 2 · Titularidades: clave determinista e idempotencia (2.1)', () => {
  it('la clave es inmuebleId__propietarioId', () => {
    expect(claveTitularidad('inm-1', 'prop-A')).toBe('inm-1__prop-A');
  });

  it('la clave identifica al inmueble', () => {
    expect(clavePerteneceAInmueble('inm-1__prop-A', 'inm-1')).toBe(true);
    expect(clavePerteneceAInmueble('inm-1__prop-A', 'inm-2')).toBe(false);
  });

  it('crear dos veces la misma relación NO duplica (clave estable)', () => {
    const a = crearTitularidad({ inmuebleId: 'inm-1', propietarioId: 'prop-A' });
    const b = crearTitularidad({ inmuebleId: 'inm-1', propietarioId: 'prop-A' });
    expect(a.id).toBe(b.id);
  });
});

describe('BLOQUE 2 · Relación completa (2.2)', () => {
  it('una relación nueva lleva todos los campos exigidos', () => {
    const r = crearTitularidad({
      inmuebleId: 'inm-1',
      propietarioId: 'prop-A',
      porcentaje: 50,
      esPrincipal: true,
      rol: 'PROPIETARIO',
      fechaDesde: '2020-01-01T00:00:00.000Z',
    });

    expect(r.inmuebleId).toBe('inm-1');
    expect(r.propietarioId).toBe('prop-A');
    expect(r.porcentaje).toBe(50);
    expect(r.esPrincipal).toBe(true);
    expect(r.rol).toBe('PROPIETARIO');
    expect(r.estado).toBe('ACTIVA');
    expect(r.fechaDesde).toBe('2020-01-01T00:00:00.000Z');
    expect(r.fechaHasta).toBeNull();
    expect(r.motivoBaja).toBeNull();
    expect(r.origen).toBe('ALTA');
    expect(r.version).toBe(1);
    expect(r.historial).toHaveLength(1);
    expect(r.historial[0].tipo).toBe('ALTA');
  });

  it('cerrar NO borra: deja el registro con fechaHasta, motivo e historial', () => {
    const original = crearTitularidad({ inmuebleId: 'inm-1', propietarioId: 'prop-B', porcentaje: 50 });
    const cerrada = cerrarTitularidad(original, {
      fechaHasta: '2025-06-01T00:00:00.000Z',
      motivo: 'Venta de su parte',
      estado: 'TRANSMITIDA',
      actorId: 'u-admin',
    });

    expect(cerrada.estado).toBe('TRANSMITIDA');
    expect(cerrada.fechaHasta).toBe('2025-06-01T00:00:00.000Z');
    expect(cerrada.motivoBaja).toBe('Venta de su parte');
    expect(cerrada.version).toBe(2);
    // Append-only: el historial CRECE, nunca se recorta.
    expect(cerrada.historial).toHaveLength(2);
    expect(cerrada.historial[1].tipo).toBe('TRANSMISION');
    expect(original.estado).toBe('ACTIVA'); // no muta el original
  });

  it('modificar añade evento e incrementa versión; sin cambios reales no toca nada', () => {
    const original = crearTitularidad({ inmuebleId: 'inm-1', propietarioId: 'prop-B', porcentaje: 30 });
    const sinCambios = modificarTitularidad(original, { porcentaje: 30 });
    expect(sinCambios).toBe(original);

    const modificada = modificarTitularidad(original, { porcentaje: 20, motivo: 'Corrección' });
    expect(modificada.version).toBe(2);
    expect(modificada.historial).toHaveLength(2);
    expect(modificada.historial[1].tipo).toBe('MODIFICACION');
  });

  it('reactivar conserva TODO el historial previo', () => {
    const cerrada = cerrarTitularidad(
      crearTitularidad({ inmuebleId: 'inm-1', propietarioId: 'prop-B', porcentaje: 50 }),
      { fechaHasta: '2025-01-01T00:00:00.000Z', motivo: 'Error material' }
    );
    const reactivada = reactivarTitularidad(cerrada, { fechaDesde: '2025-02-01T00:00:00.000Z' });

    expect(reactivada.estado).toBe('ACTIVA');
    expect(reactivada.fechaHasta).toBeNull();
    expect(reactivada.historial).toHaveLength(3);
    expect(reactivada.historial[2].tipo).toBe('REACTIVACION');
  });
});

describe('BLOQUE 2 · Porcentajes: NUNCA inventados (2.3)', () => {
  it('sin reparto configurado → pendiente (no se supone 50/50)', () => {
    expect(derivarPorcentajes(null, 'prop-A', 'prop-B')).toBeNull();
    expect(derivarPorcentajes(configSinReparto, 'prop-A', 'prop-B')).toBeNull();
    expect(leerRepartoReal(configSinReparto, 'prop-A')).toBeNull();
  });

  it('con reparto real → porcentajes del reparto', () => {
    const r = derivarPorcentajes(configCon('prop-B', 30), 'prop-A', 'prop-B');
    expect(r).toEqual({ primero: 70, segundo: 30 });
  });

  it('el reparto SÓLO aplica al segundo titular que indica', () => {
    expect(derivarPorcentajes(configCon('prop-B', 30), 'prop-A', 'prop-C')).toBeNull();
  });

  it('rechaza repartos inválidos en lugar de corregirlos', () => {
    expect(leerRepartoReal(configCon('prop-B', 0), 'prop-A')).toBeNull();
    expect(leerRepartoReal(configCon('prop-B', 100), 'prop-A')).toBeNull();
    expect(leerRepartoReal(configCon('prop-A', 30), 'prop-A')).toBeNull();
  });

  it('un titular con porcentaje nulo queda marcado como pendiente', () => {
    const r = crearTitularidad({ inmuebleId: 'inm-1', propietarioId: 'prop-B' });
    expect(r.porcentaje).toBeNull();
    expect(r.porcentajePendiente).toBe(true);
  });

  it('validarPorcentajes: suma correcta', () => {
    const v = validarPorcentajes([
      t('inm-1', 'prop-A', { porcentaje: 70, porcentajePendiente: false }),
      t('inm-1', 'prop-B', { porcentaje: 30, porcentajePendiente: false }),
    ]);
    expect(v.valido).toBe(true);
    expect(v.suma).toBe(100);
    expect(v.pendientes).toEqual([]);
  });

  it('validarPorcentajes: NO ajusta una suma incorrecta, la reporta', () => {
    const v = validarPorcentajes([
      t('inm-1', 'prop-A', { porcentaje: 60, porcentajePendiente: false }),
      t('inm-1', 'prop-B', { porcentaje: 30, porcentajePendiente: false }),
    ]);
    expect(v.valido).toBe(false);
    expect(v.suma).toBe(90);
    expect(v.errores.join(' ')).toMatch(/no se ajusta autom/i);
  });

  it('validarPorcentajes: con pendientes no se valida la suma y avisa', () => {
    const v = validarPorcentajes([
      t('inm-1', 'prop-A', { porcentaje: null, porcentajePendiente: true }),
      t('inm-1', 'prop-B', { porcentaje: null, porcentajePendiente: true }),
    ]);
    expect(v.suma).toBeNull();
    expect(v.pendientes).toEqual(['prop-A', 'prop-B']);
    expect(v.avisos.join(' ')).toMatch(/PENDIENTE/i);
  });

  it('ignora las relaciones cerradas al validar', () => {
    const v = validarPorcentajes([
      t('inm-1', 'prop-A', { porcentaje: 100, porcentajePendiente: false, esPrincipal: true }),
      t('inm-1', 'prop-B', { porcentaje: 40, porcentajePendiente: false, estado: 'BAJA' }),
    ]);
    expect(v.valido).toBe(true);
    expect(v.suma).toBe(100);
  });
});

describe('BLOQUE 2 · N titulares: 1, 2, 3, 4, N (2.5)', () => {
  const cuatro = [
    t('inm-1', 'prop-A', { esPrincipal: true, rol: 'PROPIETARIO' }),
    t('inm-1', 'prop-B'),
    t('inm-1', 'prop-C'),
    t('inm-1', 'prop-D'),
  ];

  it('cuenta y lista correctamente con 4 titulares', () => {
    expect(numeroTitulares(cuatro, 'inm-1')).toBe(4);
    expect(idsTitularesVigentes(cuatro, 'inm-1')).toEqual(['prop-A', 'prop-B', 'prop-C', 'prop-D']);
  });

  it('escala a N sin límite artificial', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => t('inm-9', `prop-${i}`));
    expect(numeroTitulares(muchos, 'inm-9')).toBe(12);
  });

  it('un solo titular principal a la vez', () => {
    const conVarios = [
      t('inm-1', 'prop-A', { esPrincipal: true, fechaDesde: '2026-01-01T00:00:00.000Z' }),
      t('inm-1', 'prop-B', { esPrincipal: true, fechaDesde: '2026-03-01T00:00:00.000Z' }),
    ];
    const normalizado = normalizarPrincipal(conVarios);
    expect(normalizado.filter((x) => x.esPrincipal)).toHaveLength(1);
    // Se conserva el más antiguo: criterio determinista, no aleatorio.
    expect(normalizado.find((x) => x.esPrincipal)?.propietarioId).toBe('prop-A');
  });

  it('separa vigentes de históricas', () => {
    const mezcla = [
      t('inm-1', 'prop-A', { esPrincipal: true }),
      t('inm-1', 'prop-B', { estado: 'BAJA', fechaHasta: '2025-01-01T00:00:00.000Z' }),
    ];
    expect(titularidadesVigentes(mezcla, 'inm-1')).toHaveLength(1);
    expect(titularidadesHistoricas(mezcla, 'inm-1')).toHaveLength(1);
  });

  it('participación: en algún momento vs ahora mismo', () => {
    const hist = [
      t('inm-1', 'prop-B', { estado: 'BAJA', fechaHasta: '2025-01-01T00:00:00.000Z' }),
    ];
    expect(participaEnInmueble(hist, 'inm-1', 'prop-B')).toBe(true);
    expect(participaAhora(hist, 'inm-1', 'prop-B')).toBe(false);
  });

  it('cada titular ve sólo los inmuebles en los que participa', () => {
    const titularidades = [
      t('inm-1', 'prop-A', { esPrincipal: true }),
      t('inm-1', 'prop-B'),
      t('inm-2', 'prop-A', { esPrincipal: true }),
    ];
    const inmuebles = [{ id: 'inm-1' }, { id: 'inm-2' }, { id: 'inm-3' }];

    expect(inmueblesDelTitular(inmuebles, titularidades, 'prop-B').map((i) => i.id)).toEqual(['inm-1']);
    expect(inmueblesDelTitular(inmuebles, titularidades, 'prop-A').map((i) => i.id)).toEqual(['inm-1', 'inm-2']);
  });
});

describe('BLOQUE 2 · Historial patrimonial reconstruible (2.10)', () => {
  it('2020 A50/B50 → 2025 A100', () => {
    const titularidades: Titularidad[] = [
      t('inm-1', 'prop-A', {
        esPrincipal: true,
        rol: 'PROPIETARIO',
        porcentaje: 50,
        porcentajePendiente: false,
        fechaDesde: '2020-01-01T00:00:00.000Z',
      }),
      t('inm-1', 'prop-B', {
        porcentaje: 50,
        porcentajePendiente: false,
        fechaDesde: '2020-01-01T00:00:00.000Z',
        fechaHasta: '2025-01-01T00:00:00.000Z',
        estado: 'TRANSMITIDA',
        motivoBaja: 'Compra de la parte',
      }),
    ];

    const fotos = reconstruirHistorial(titularidades, 'inm-1');

    // 2020-2025: A y B al 50 %.
    const en2021 = fotos.find((f) => f.fecha === '2020-01-01T00:00:00.000Z');
    expect(en2021?.titulares.map((x) => x.propietarioId).sort()).toEqual(['prop-A', 'prop-B']);

    // 2025: B ya no figura → A es titular único.
    const en2025 = fotos.find((f) => f.fecha === '2025-01-01T00:00:00.000Z');
    expect(en2025?.titulares.map((x) => x.propietarioId)).toEqual(['prop-A']);

    // El histórico sigue conteniendo a B.
    expect(participaEnInmueble(titularidades, 'inm-1', 'prop-B')).toBe(true);
    expect(participaAhora(titularidades, 'inm-1', 'prop-B')).toBe(false);
  });

  it('el historial no pierde etapas aunque un titular vuelva a entrar', () => {
    let b = crearTitularidad({
      inmuebleId: 'inm-1',
      propietarioId: 'prop-B',
      fechaDesde: '2020-01-01T00:00:00.000Z',
    });
    b = cerrarTitularidad(b, { fechaHasta: '2022-01-01T00:00:00.000Z', motivo: 'Venta' });
    b = reactivarTitularidad(b, { fechaDesde: '2024-01-01T00:00:00.000Z' });

    expect(b.historial.map((e) => e.tipo)).toEqual(['ALTA', 'BAJA', 'REACTIVACION']);
    expect(b.estado).toBe('ACTIVA');
  });
});

describe('BLOQUE 2 · Proyección sobre el inmueble (compatibilidad)', () => {
  it('titularesIds se deriva de las titularidades vigentes', () => {
    const titularidades = [
      t('inm-1', 'prop-A', { esPrincipal: true }),
      t('inm-1', 'prop-B'),
      t('inm-1', 'prop-C', { estado: 'BAJA' }),
    ];
    expect(proyectarIdsDesdeTitularidades(titularidades, 'inm-1')).toEqual(['prop-A', 'prop-B']);
  });

  it('aplicar NO destruye los campos heredados existentes', () => {
    const inmueble = {
      id: 'inm-1',
      propietarioId: 'prop-X',
      propietarioPrincipalId: 'prop-X',
      propietarioSecundarioId: 'prop-Y',
    } as Inmueble;
    const titularidades = [t('inm-1', 'prop-A', { esPrincipal: true }), t('inm-1', 'prop-B')];

    const r = aplicarTitularidadesAInmueble(inmueble, titularidades);

    // Los heredados se CONSERVAN: la migración es aditiva y reversible.
    expect(r.propietarioId).toBe('prop-X');
    expect(r.propietarioSecundarioId).toBe('prop-Y');
    // El índice sí refleja el modelo N.
    expect(r.titularesIds).toEqual(['prop-A', 'prop-B']);
  });

  it('aplicar rellena los heredados sólo si están vacíos', () => {
    const inmueble = { id: 'inm-1' } as Inmueble;
    const titularidades = [t('inm-1', 'prop-A', { esPrincipal: true }), t('inm-1', 'prop-B')];
    const r = aplicarTitularidadesAInmueble(inmueble, titularidades);
    expect(r.propietarioId).toBe('prop-A');
    expect(r.propietarioSecundarioId).toBe('prop-B');
  });
});
