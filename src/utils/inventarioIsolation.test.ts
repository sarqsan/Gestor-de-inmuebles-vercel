import { describe, it, expect } from 'vitest';
import {
  aplicarBajaLogica,
  asegurarInventarioDelInmueble,
  canAccessInventarioInmueble,
  canMutateInventario,
  filtrarInventarioPorCategoria,
} from './inventarioEngine';
import { ElementoInventario, Inmueble, UsuarioApp } from '../types';

const inmA: Inmueble = {
  id: 'inm-A',
  direccion: 'Calle A',
  ciudad: 'Alicante',
  precio: 800,
  estado: 'disponible',
  habitaciones: 2,
  banos: 1,
  superficie: 70,
  candidatosCount: 0,
  fianzaMeses: 1,
  propietarioId: 'prop-A',
};

const inmB: Inmueble = { ...inmA, id: 'inm-B', propietarioId: 'prop-B', direccion: 'Calle B' };

const admin: UsuarioApp = {
  id: 'u-admin',
  nombre: 'Admin',
  email: 'admin@test.com',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  roles: ['SUPERADMIN'],
  permisos: [],
  createdAt: '',
  updatedAt: '',
};

const propA: UsuarioApp = {
  ...admin,
  id: 'u-prop-a',
  tipoPerfil: 'PROPIETARIO',
  propietarioId: 'prop-A',
  roles: [],
};

const propB: UsuarioApp = {
  ...admin,
  id: 'u-prop-b',
  tipoPerfil: 'PROPIETARIO',
  propietarioId: 'prop-B',
  roles: [],
};

const prof: UsuarioApp = {
  ...admin,
  id: 'u-prof',
  tipoPerfil: 'PROFESIONAL',
  profesionalId: 'prof-1',
  roles: [],
};

const itemA: ElementoInventario = {
  id: 'inv1',
  inmuebleId: 'inm-A',
  nombre: 'Frigorífico',
  categoria: 'COCINA',
  cantidad: 1,
  estado: 'BUEN_ESTADO',
  fechaAlta: '2026-01-01',
  fechaModificacion: '2026-01-01',
  creadoPor: 'Admin',
  actualizadoPor: 'Admin',
  activo: true,
  historial: [],
};

const itemB: ElementoInventario = { ...itemA, id: 'inv2', inmuebleId: 'inm-B', categoria: 'SALON', nombre: 'Sofá' };

describe('aislamiento e integridad de inventario', () => {
  it('TEST4 asociación inmuebleId', () => {
    const onlyA = asegurarInventarioDelInmueble([itemA, itemB], 'inm-A');
    expect(onlyA.length).toBe(1);
    expect(onlyA[0].inmuebleId).toBe('inm-A');
  });

  it('TEST7 filtro categoría', () => {
    const filtered = filtrarInventarioPorCategoria([itemA, { ...itemA, id: 'x', categoria: 'BANO' }], 'COCINA');
    expect(filtered.every((i) => i.categoria === 'COCINA')).toBe(true);
  });

  it('TEST6 cambio estado baja', () => {
    const baja = aplicarBajaLogica(itemA, 'Admin');
    expect(baja.estado).toBe('BAJA');
    expect(baja.activo).toBe(false);
  });

  it('TEST9 y TEST10 aislamiento propietario A vs B', () => {
    expect(canAccessInventarioInmueble(propA, inmA)).toBe(true);
    expect(canAccessInventarioInmueble(propA, inmB)).toBe(false);
    expect(canAccessInventarioInmueble(propB, inmA)).toBe(false);
  });

  it('TEST11 control de acceso profesional y admin', () => {
    expect(canAccessInventarioInmueble(prof, inmA, { id: 'prof-1', inmuebleIdsAsignados: [] } as never)).toBe(false);
    expect(
      canAccessInventarioInmueble(prof, inmA, {
        id: 'prof-1',
        inmuebleIdsAsignados: ['inm-A'],
      } as never)
    ).toBe(true);
    expect(canMutateInventario(prof, inmA, { id: 'prof-1', inmuebleIdsAsignados: ['inm-A'] } as never)).toBe(false);
    expect(canAccessInventarioInmueble(admin, inmA)).toBe(true);
    expect(canMutateInventario(propA, inmA)).toBe(true);
  });
});
