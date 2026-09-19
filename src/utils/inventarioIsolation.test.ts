import {
  aplicarBajaLogica,
  asegurarInventarioDelInmueble,
  canAccessInventarioInmueble,
  canMutateInventario,
  filtrarInventarioPorCategoria,
} from './inventarioEngine';
import { ElementoInventario, Inmueble, UsuarioApp } from '../types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

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

function run() {
  // TEST 4 association
  const onlyA = asegurarInventarioDelInmueble([itemA, itemB], 'inm-A');
  assert(onlyA.length === 1 && onlyA[0].inmuebleId === 'inm-A', 'TEST4 asociación inmuebleId');

  // TEST 7 filter
  const filtered = filtrarInventarioPorCategoria([itemA, { ...itemA, id: 'x', categoria: 'BANO' }], 'COCINA');
  assert(filtered.every((i) => i.categoria === 'COCINA'), 'TEST7 filtro categoría');

  // TEST 6 estado / baja
  const baja = aplicarBajaLogica(itemA, 'Admin');
  assert(baja.estado === 'BAJA' && baja.activo === false, 'TEST6 cambio estado baja');

  // TEST 9 isolation A vs B
  assert(canAccessInventarioInmueble(propA, inmA) === true, 'propA accede A');
  assert(canAccessInventarioInmueble(propA, inmB) === false, 'TEST10 propA denegado B');
  assert(canAccessInventarioInmueble(propB, inmA) === false, 'TEST10 propB denegado A');

  // TEST 11 profesional no asignado
  assert(canAccessInventarioInmueble(prof, inmA, { id: 'prof-1', inmuebleIdsAsignados: [] } as never) === false, 'TEST11 profesional denegado');
  assert(
    canAccessInventarioInmueble(prof, inmA, {
      id: 'prof-1',
      inmuebleIdsAsignados: ['inm-A'],
    } as never) === true,
    'profesional asignado OK'
  );
  assert(canMutateInventario(prof, inmA, { id: 'prof-1', inmuebleIdsAsignados: ['inm-A'] } as never) === false, 'profesional no muta');
  assert(canAccessInventarioInmueble(admin, inmA) === true, 'admin global');
  assert(canMutateInventario(propA, inmA) === true, 'propietario muta');

  console.log('inventarioIsolation tests OK');
}

run();
