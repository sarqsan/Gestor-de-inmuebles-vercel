/**
 * ESCENARIO E2E EXIGIDO (BLOQUES 1 y 2)
 * =====================================
 * «A crea los titulares B y C; crea INMUEBLE 1 (A/B/C) e INMUEBLE 2 (sólo A);
 *  B entra y ve ÚNICAMENTE los inmuebles autorizados; INMUEBLE 1 se alquila
 *  (contrato, recibos, gastos, documentos); INMUEBLE 1 se vende → queda
 *  VENDIDO → desaparece de la cartera activa del propietario mientras conserva
 *  contrato, recibos, gastos, documentos, fiscalidad e historial de titularidad,
 *  y aparece en HISTÓRICO.»
 *
 * Se ejecuta sobre los motores puros (sin Firestore ni React), que son los que
 * toman las decisiones de negocio. La persistencia real se valida en las
 * pruebas de los motores y en las reglas; aquí se valida el RECORRIDO completo.
 */
import { describe, it, expect } from 'vitest';
import {
  aplicarTitularidadesAInmueble,
  cerrarTitularidad,
  crearTitularidad,
  inmueblesDelTitular,
  modificarTitularidad,
  numeroTitulares,
  reconstruirHistorial,
  titularidadesVigentes,
  validarPorcentajes,
} from '../src/utils/titularidadesEngine';
import { filtrarInmueblesPorTitularidad } from '../src/utils/alcancePatrimonial';
import {
  esCarteraActiva,
  esHistorico,
  estadoExplotacionDe,
  filtrarCarteraActiva,
  filtrarHistorico,
  marcarVendido,
} from '../src/utils/cicloPatrimonialEngine';
import type { Inmueble, Propietario, Titularidad, UsuarioApp } from '../src/types';

const tit = (id: string, email: string): Propietario =>
  ({ id, nombre: id, nifCif: `NIF-${id}`, email }) as unknown as Propietario;

const usuario = (id: string, propietarioId: string, email: string): UsuarioApp =>
  ({
    id,
    email,
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    propietarioId,
    roles: [],
    permisos: [],
  }) as unknown as UsuarioApp;

type InmuebleConDocumentos = Inmueble & { documentos?: Array<{ id: string; nombre: string }> };

const inm = (id: string, extra: Partial<Inmueble> = {}): Inmueble =>
  ({
    id,
    direccion: `Dir ${id}`,
    ciudad: 'Alicante',
    precio: 900,
    estado: 'disponible',
    habitaciones: 3,
    banos: 2,
    superficie: 85,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...extra,
  }) as Inmueble;

const A = tit('prop-A', 'a@t.local');
const B = tit('prop-B', 'b@t.local');
const C = tit('prop-C', 'c@t.local');
const usrA = usuario('u-A', 'prop-A', 'a@t.local');
const usrB = usuario('u-B', 'prop-B', 'b@t.local');
const usrC = usuario('u-C', 'prop-C', 'c@t.local');

const F_ALTA = '2026-01-01T00:00:00.000Z';
const F_ALQUILER = '2026-02-01T00:00:00.000Z';
const F_VENTA = '2028-03-15T00:00:00.000Z';

/* ------------------------------------------------------------------ */

describe('E2E · Portal del propietario con N titulares y baja patrimonial', () => {
  // ---------- 1. A da de alta a B y a C y crea dos inmuebles ----------
  const inmueble1 = inm('inm-1', {
    propietarioId: 'prop-A',
    propietarioPrincipalId: 'prop-A',
    propietarioSecundarioId: 'prop-B',
  });
  const inmueble2 = inm('inm-2', {
    propietarioId: 'prop-A',
    propietarioPrincipalId: 'prop-A',
    estado: 'alquilado',
    contratoActivoId: 'ct-2',
  });

  // Titularidades: INMUEBLE 1 → A, B y C (N = 3). INMUEBLE 2 → sólo A.
  let titularidades: Titularidad[] = [
    crearTitularidad({
      inmuebleId: 'inm-1',
      propietarioId: 'prop-A',
      esPrincipal: true,
      rol: 'PROPIETARIO',
      fechaDesde: F_ALTA,
      origen: 'ALTA',
    }),
    crearTitularidad({
      inmuebleId: 'inm-1',
      propietarioId: 'prop-B',
      rol: 'COTITULAR',
      fechaDesde: F_ALTA,
      origen: 'ALTA',
    }),
    crearTitularidad({
      inmuebleId: 'inm-1',
      propietarioId: 'prop-C',
      rol: 'COTITULAR',
      fechaDesde: F_ALTA,
      origen: 'ALTA',
    }),
    crearTitularidad({
      inmuebleId: 'inm-2',
      propietarioId: 'prop-A',
      esPrincipal: true,
      rol: 'PROPIETARIO',
      fechaDesde: F_ALTA,
      origen: 'ALTA',
    }),
  ];

  const cartera = [inmueble1, inmueble2];

  it('1 · INMUEBLE 1 tiene 3 titulares (A, B, C) e INMUEBLE 2 sólo 1 (A)', () => {
    expect(numeroTitulares(titularidades, 'inm-1')).toBe(3);
    expect(numeroTitulares(titularidades, 'inm-2')).toBe(1);
  });

  it('2 · los porcentajes desconocidos quedan PENDIENTES, nunca inventados', () => {
    const v = validarPorcentajes(titularidadesVigentes(titularidades, 'inm-1'));
    expect(v.suma).toBeNull();
    expect(v.pendientes.sort()).toEqual(['prop-A', 'prop-B', 'prop-C']);
    expect(v.avisos.join(' ')).toMatch(/PENDIENTE/);
  });

  it('3 · se puede fijar el reparto real A50/B30/C20 sin perder trazabilidad', () => {
    titularidades = titularidades.map((t) => {
      if (t.inmuebleId !== 'inm-1') return t;
      const pct = t.propietarioId === 'prop-A' ? 50 : t.propietarioId === 'prop-B' ? 30 : 20;
      return modificarTitularidad(t, { porcentaje: pct, motivo: 'Escritura de compraventa' });
    });

    const v = validarPorcentajes(titularidadesVigentes(titularidades, 'inm-1'));
    expect(v.valido).toBe(true);
    expect(v.suma).toBe(100);
    // Cada modificación queda registrada (historial append-only).
    for (const t of titularidadesVigentes(titularidades, 'inm-1')) {
      expect(t.version).toBe(2);
      expect(t.historial.map((e) => e.tipo)).toEqual(['ALTA', 'MODIFICACION']);
    }
  });

  it('4 · B ve ÚNICAMENTE los inmuebles en los que participa', () => {
    const visiblesB = inmueblesDelTitular(cartera, titularidades, 'prop-B').map((i) => i.id);
    expect(visiblesB).toEqual(['inm-1']); // nunca inm-2

    // Y con el filtro de ámbito del BLOQUE 1 (defensa en profundidad):
    const conIndice = cartera.map((i) => aplicarTitularidadesAInmueble(i, titularidades));
    expect(filtrarInmueblesPorTitularidad(conIndice, usrB).map((i) => i.id)).toEqual(['inm-1']);
    expect(filtrarInmueblesPorTitularidad(conIndice, usrC).map((i) => i.id)).toEqual(['inm-1']);
    expect(filtrarInmueblesPorTitularidad(conIndice, usrA).map((i) => i.id)).toEqual([
      'inm-1',
      'inm-2',
    ]);
  });

  it('5 · B no ve el inmueble exclusivo de A por ninguna vía', () => {
    expect(inmueblesDelTitular(cartera, titularidades, 'prop-B')).not.toContain(inmueble2);
  });

  // ---------- 6. INMUEBLE 1 se alquila ----------
  const inmueble1Alquilado: InmuebleConDocumentos = {
    ...inmueble1,
    estado: 'alquilado',
    contratoActivoId: 'ct-1',
    documentos: [
      { id: 'doc-1', nombre: 'Contrato LAU.pdf' },
      { id: 'doc-2', nombre: 'Inventario.pdf' },
    ],
    ibanCobro: 'ES11 1111 1111 1111 1111',
    referenciaCatastral: 'RC-1',
  } as unknown as Inmueble;

  it('6 · INMUEBLE 1 alquilado: el eje de explotación lo refleja', () => {
    expect(estadoExplotacionDe(inmueble1Alquilado)).toBe('ALQUILADO');
    expect(esCarteraActiva(inmueble1Alquilado)).toBe(true);
  });

  // ---------- 7. INMUEBLE 1 se vende ----------
  const vendido = marcarVendido(inmueble1Alquilado, {
    fecha: F_VENTA,
    motivo: 'Venta a tercero',
    actorId: 'u-A',
    actorNombre: 'Titular A',
  });

  it('7 · tras la venta DESAPARECE de la cartera activa', () => {
    expect(esCarteraActiva(vendido)).toBe(false);
    const activa = filtrarCarteraActiva([vendido, inmueble2]).map((i) => i.id);
    expect(activa).toEqual(['inm-2']);
    expect(activa).not.toContain('inm-1');
  });

  it('8 · ...y APARECE en el HISTÓRICO (sigue siendo alcanzable)', () => {
    expect(esHistorico(vendido)).toBe(true);
    expect(filtrarHistorico([vendido, inmueble2]).map((i) => i.id)).toEqual(['inm-1']);
  });

  it('9 · la venta CONSERVA contrato, recibos, gastos, documentos y fiscalidad', () => {
    expect(vendido.contratoActivoId).toBe('ct-1');
    expect((vendido as InmuebleConDocumentos).documentos).toEqual(inmueble1Alquilado.documentos);
    expect(vendido.ibanCobro).toBe('ES11 1111 1111 1111 1111');
    expect(vendido.referenciaCatastral).toBe('RC-1');
    expect(vendido.propietarioId).toBe('prop-A');
    expect(vendido.titularesIds).toBeUndefined(); // no se toca: no estaba en el original
    // El eje de explotación sigue describiendo la realidad del alquiler.
    expect(estadoExplotacionDe(vendido)).toBe('ALQUILADO');
    expect(vendido.bajaPatrimonial?.conservaHistorico).toBe(true);
  });

  it('10 · la titularidad y su HISTORIAL siguen reconstruibles tras la venta', () => {
    // La venta del inmueble NO borra la titularidad: sigue ahí para el histórico.
    expect(numeroTitulares(titularidades, 'inm-1')).toBe(3);

    // Se cierra la participación de C (vende su parte) y sigue en el histórico.
    const c = titularidades.find((t) => t.id === 'inm-1__prop-C')!;
    const cCerrada = cerrarTitularidad(c, {
      fechaHasta: F_VENTA,
      estado: 'TRANSMITIDA',
      motivo: 'Venta de su parte',
    });
    const trasVenta = titularidades.map((t) => (t.id === c.id ? cCerrada : t));

    expect(numeroTitulares(trasVenta, 'inm-1')).toBe(2);

    const fotos = reconstruirHistorial(trasVenta, 'inm-1');
    // Antes: A, B y C.
    expect(
      fotos.find((f) => f.fecha === F_ALTA)?.titulares.map((x) => x.propietarioId).sort()
    ).toEqual(['prop-A', 'prop-B', 'prop-C']);
    // Después de la venta: A y B únicamente.
    expect(
      fotos.find((f) => f.fecha === F_VENTA)?.titulares.map((x) => x.propietarioId).sort()
    ).toEqual(['prop-A', 'prop-B']);
    // Y C consta en el histórico con su porcentaje.
    expect(cCerrada.porcentaje).toBe(20);
    expect(cCerrada.historial.map((e) => e.tipo)).toEqual(['ALTA', 'MODIFICACION', 'TRANSMISION']);
  });

  it('11 · B sigue viendo el inmueble vendido desde su histórico', () => {
    const carteraTrasVenta = [vendido, inmueble2];
    expect(inmueblesDelTitular(carteraTrasVenta, titularidades, 'prop-B').map((i) => i.id)).toEqual([
      'inm-1',
    ]);
    // Pero ya no forma parte de su cartera activa.
    const activaB = filtrarCarteraActiva(
      inmueblesDelTitular(carteraTrasVenta, titularidades, 'prop-B')
    );
    expect(activaB).toHaveLength(0);
  });
});
