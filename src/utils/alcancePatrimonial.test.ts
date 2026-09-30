import { describe, it, expect } from 'vitest';
import {
  esTitularDelInmueble,
  filtrarInmueblesPorTitularidad,
  idsTitularesInmueble,
  prepararAlcancePatrimonial,
  proyectarTitularesIds,
  resolverTitularDeCuenta,
} from './alcancePatrimonial';
import type { Inmueble, Propietario, UsuarioApp } from '../types';

/* ------------------------------------------------------------------ */
/* Utilidades de montaje                                                */
/* ------------------------------------------------------------------ */

const inmueble = (parcial: Partial<Inmueble>): Inmueble =>
  ({
    id: 'x',
    direccion: 'Dir',
    ciudad: 'Ciudad',
    precio: 800,
    estado: 'disponible',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    candidatosCount: 0,
    fianzaMeses: 1,
    ...parcial,
  }) as Inmueble;

const titular = (id: string, email: string): Propietario =>
  ({
    id,
    nombre: `Titular ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: '',
    email,
    direccion: '',
    ciudad: '',
    codigoPostal: '',
    cuentasBancarias: [],
    fechaCreacion: '2026-01-01T00:00:00.000Z',
    fechaActualizacion: '2026-01-01T00:00:00.000Z',
  }) as unknown as Propietario;

const usuario = (parcial: Partial<UsuarioApp>): UsuarioApp =>
  ({
    id: 'u',
    nombre: 'Usuario',
    email: '',
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...parcial,
  }) as unknown as UsuarioApp;

const A = titular('prop-A', 'a@correo.com');
const B = titular('prop-B', 'b@correo.com');
const C = titular('prop-C', 'c@correo.com');

const usuarioA = usuario({ id: 'u-A', email: 'a@correo.com', propietarioId: 'prop-A' });
const usuarioB = usuario({ id: 'u-B', email: 'b@correo.com', propietarioId: 'prop-B' });
const admin = usuario({ id: 'u-admin', email: 'admin@correo.com', tipoPerfil: 'ADMINISTRADOR' });

const inmA = inmueble({ id: 'inm-A', propietarioId: 'prop-A', propietarioPrincipalId: 'prop-A' });
const inmB = inmueble({ id: 'inm-B', propietarioId: 'prop-B', propietarioPrincipalId: 'prop-B' });
const inmAYB = inmueble({
  id: 'inm-A-B',
  propietarioId: 'prop-A',
  propietarioPrincipalId: 'prop-A',
  propietarioSecundarioId: 'prop-B',
});
const inmSinTitular = inmueble({ id: 'inm-huerfano' });

const cartera = [inmA, inmB, inmAYB, inmSinTitular];

/* ------------------------------------------------------------------ */

describe('BLOQUE 1 · Aislamiento de carteras (A sólo ve A, B sólo ve B)', () => {
  it('1.5 · A NO ve los inmuebles de B', () => {
    const visibles = filtrarInmueblesPorTitularidad(cartera, usuarioA).map((i) => i.id);
    expect(visibles).toContain('inm-A');
    expect(visibles).toContain('inm-A-B');
    expect(visibles).not.toContain('inm-B'); // <— inmueble exclusivo de B
    expect(visibles).not.toContain('inm-huerfano');
  });

  it('1.5 · B NO ve los inmuebles de A', () => {
    const visibles = filtrarInmueblesPorTitularidad(cartera, usuarioB).map((i) => i.id);
    expect(visibles).toContain('inm-B');
    expect(visibles).toContain('inm-A-B'); // cotitular
    expect(visibles).not.toContain('inm-A'); // <— inmueble exclusivo de A
  });

  it('1.5 · el cotitular SÍ ve el inmueble en el que participa', () => {
    expect(esTitularDelInmueble(inmAYB, 'prop-B')).toBe(true);
    expect(esTitularDelInmueble(inmAYB, 'prop-A')).toBe(true);
    expect(esTitularDelInmueble(inmAYB, 'prop-C')).toBe(false);
    expect(filtrarInmueblesPorTitularidad(cartera, usuarioB)).toContain(inmAYB);
  });

  it('1.5 · un titular sin relación con el inmueble NO lee nada', () => {
    const ajeno = usuario({ id: 'u-C', email: 'c@correo.com', propietarioId: 'prop-C' });
    expect(filtrarInmueblesPorTitularidad(cartera, ajeno)).toEqual([]);
  });

  it('1.5 · sin sesión no se ve nada; administración lo ve todo', () => {
    expect(filtrarInmueblesPorTitularidad(cartera, null)).toEqual([]);
    expect(filtrarInmueblesPorTitularidad(cartera, admin)).toHaveLength(cartera.length);
  });

  it('1.5 · la delegación explícita suma, pero no destapa el resto', () => {
    const delegado = usuario({
      id: 'u-C',
      email: 'c@correo.com',
      propietarioId: 'prop-C',
      inmuebleIds: ['inm-A'],
    });
    const visibles = filtrarInmueblesPorTitularidad(cartera, delegado).map((i) => i.id);
    expect(visibles).toEqual(['inm-A']);
    expect(visibles).not.toContain('inm-B');
  });

  it('1.5 · un inmueble sin titular no aparece en la cartera de nadie', () => {
    expect(filtrarInmueblesPorTitularidad(cartera, usuarioA)).not.toContain(inmSinTitular);
    expect(filtrarInmueblesPorTitularidad(cartera, usuarioB)).not.toContain(inmSinTitular);
  });
});

describe('BLOQUE 1 · Índice proyectado titularesIds (write-through)', () => {
  it('proyecta los tres campos escalares sin duplicados', () => {
    expect(proyectarTitularesIds(inmAYB)).toEqual(['prop-A', 'prop-B']);
  });

  it('es idempotente', () => {
    const unaVez = proyectarTitularesIds(inmAYB);
    const dosVeces = proyectarTitularesIds({ ...inmAYB, titularesIds: unaVez });
    expect(dosVeces).toEqual(unaVez);
  });

  it('no inventa información: sin titulares devuelve lista vacía', () => {
    expect(proyectarTitularesIds(inmSinTitular)).toEqual([]);
    expect(proyectarTitularesIds(null)).toEqual([]);
    expect(proyectarTitularesIds(undefined)).toEqual([]);
  });

  it('descarta valores no válidos (undefined, vacío, duplicado)', () => {
    expect(
      proyectarTitularesIds({
        propietarioId: 'prop-A',
        propietarioPrincipalId: 'prop-A',
        propietarioSecundarioId: undefined,
        titularesIds: ['prop-A', '', '  ', 'prop-B'],
      })
    ).toEqual(['prop-A', 'prop-B']);
  });

  it('idsTitularesInmueble es coherente con la proyección', () => {
    expect(idsTitularesInmueble(inmAYB)).toEqual(proyectarTitularesIds(inmAYB));
  });
});

describe('BLOQUE 1 · Vinculación cuenta ↔ titular', () => {
  it('resuelve por propietarioId explícito', () => {
    const v = resolverTitularDeCuenta(usuarioA, [A, B, C]);
    expect(v.estado).toBe('OK');
    expect(v.propietarioId).toBe('prop-A');
  });

  it('resuelve por email si la cuenta no trae propietarioId', () => {
    const v = resolverTitularDeCuenta(
      usuario({ id: 'u-B', email: 'B@correo.com', propietarioId: undefined }),
      [A, B, C]
    );
    expect(v.estado).toBe('OK');
    expect(v.propietarioId).toBe('prop-B');
  });

  it('NO inventa: email duplicado en varios titulares → KO con motivo', () => {
    const duplicado = titular('prop-B2', 'b@correo.com');
    const v = resolverTitularDeCuenta(
      usuario({ id: 'u-B', email: 'b@correo.com', propietarioId: undefined }),
      [A, B, duplicado]
    );
    expect(v.estado).toBe('KO');
    expect(v.motivo).toMatch(/más de un titular/i);
    expect(v.propietarioId).toBeUndefined();
  });

  it('NO inventa: propietarioId apunta a un titular inexistente → KO', () => {
    const v = resolverTitularDeCuenta(
      usuario({ id: 'u-X', email: 'x@correo.com', propietarioId: 'prop-fantasma' }),
      [A, B]
    );
    expect(v.estado).toBe('KO');
    expect(v.motivo).toMatch(/no consta en el sistema/i);
  });

  it('sin sesión ni coincidencia: KO con motivo accionable', () => {
    expect(resolverTitularDeCuenta(null, [A]).estado).toBe('KO');
    const v = resolverTitularDeCuenta(usuario({ id: 'u-Z', email: 'z@correo.com' }), [A, B]);
    expect(v.estado).toBe('KO');
    expect(v.motivo).toMatch(/no está vinculada a ningún titular/i);
  });
});

describe('BLOQUE 1 · Alta y edición con ámbito patrimonial garantizado (1.4)', () => {
  it('el alta desde el portal auto-identifica al titular (no se exige autodescubrirse)', () => {
    const res = prepararAlcancePatrimonial(inmueble({ id: 'nuevo' }), usuarioA, [A, B]);
    expect(res.estado).toBe('OK');
    if (res.estado === 'OK') {
      expect(res.propietarioId).toBe('prop-A');
      expect(res.inmueble.propietarioId).toBe('prop-A');
      expect(res.inmueble.propietarioPrincipalId).toBe('prop-A');
      expect(res.inmueble.titularesIds).toEqual(['prop-A']);
      expect(res.autovinculado).toBe(true);
    }
  });

  it('1.4 · un propietario NO puede dar de alta el inmueble a nombre de un tercero', () => {
    const res = prepararAlcancePatrimonial(
      inmueble({ id: 'nuevo', propietarioId: 'prop-B', propietarioPrincipalId: 'prop-B' }),
      usuarioA,
      [A, B]
    );
    expect(res.estado).toBe('OK');
    if (res.estado === 'OK') {
      expect(res.inmueble.propietarioId).toBe('prop-A'); // mandó la cuenta, no el formulario
      expect(res.inmueble.propietarioPrincipalId).toBe('prop-A');
    }
  });

  it('1.4 · BLOQUEA el alta sin titularidad resoluble (evita el "sólo en localStorage")', () => {
    const res = prepararAlcancePatrimonial(
      inmueble({ id: 'nuevo' }),
      usuario({ id: 'u-Z', email: 'z@correo.com' }),
      [A, B]
    );
    expect(res.estado).toBe('KO');
    if (res.estado === 'KO') {
      expect(res.codigo).toBe('TITULAR_NO_RESUELTO');
      expect(res.motivo.length).toBeGreaterThan(20);
    }
  });

  it('1.4 · sin sesión no se permite guardar', () => {
    const res = prepararAlcancePatrimonial(inmueble({ id: 'nuevo' }), null, [A, B]);
    expect(res.estado).toBe('KO');
    if (res.estado === 'KO') expect(res.codigo).toBe('SIN_SESION');
  });

  it('administración conserva el titular indicado en el formulario', () => {
    const res = prepararAlcancePatrimonial(
      inmueble({ id: 'nuevo', propietarioId: 'prop-B' }),
      admin,
      [A, B]
    );
    expect(res.estado).toBe('OK');
    if (res.estado === 'OK') expect(res.propietarioId).toBe('prop-B');
  });

  it('administración: bloquea un alta sin titular (no habría cartera posible)', () => {
    const res = prepararAlcancePatrimonial(inmueble({ id: 'nuevo' }), admin, [A, B]);
    expect(res.estado).toBe('KO');
    if (res.estado === 'KO') expect(res.codigo).toBe('TITULAR_NO_RESUELTO');
  });

  it('administración: al editar un inmueble históricamente sin titular no lo bloquea', () => {
    const res = prepararAlcancePatrimonial(inmSinTitular, admin, [A, B], {
      titularPreexistente: 'prop-A',
    });
    expect(res.estado).toBe('OK');
    if (res.estado === 'OK') expect(res.propietarioId).toBe('prop-A');
  });

  it('no muta el objeto de entrada', () => {
    const original = inmueble({ id: 'nuevo' });
    const copia = JSON.parse(JSON.stringify(original));
    prepararAlcancePatrimonial(original, usuarioA, [A, B]);
    expect(original).toEqual(copia);
  });

  it('conserva los datos del formulario (no se pierde información al normalizar)', () => {
    const res = prepararAlcancePatrimonial(
      inmueble({ id: 'nuevo', direccion: 'Gran Vía 1', precio: 1200, superficie: 95 }),
      usuarioA,
      [A, B]
    );
    expect(res.estado).toBe('OK');
    if (res.estado === 'OK') {
      expect(res.inmueble.direccion).toBe('Gran Vía 1');
      expect(res.inmueble.precio).toBe(1200);
      expect(res.inmueble.superficie).toBe(95);
    }
  });
});
