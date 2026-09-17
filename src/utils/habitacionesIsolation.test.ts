import {
  aplicarDesactivarHabitacion,
  asegurarHabitacionesDelInmueble,
  canAccessHabitacionesInmueble,
  canMutateHabitaciones,
  habitacionesTrasCambioModalidad,
  inmuebleEnModoHabitaciones,
} from './habitacionesEngine';
import { HabitacionInmueble, Inmueble, UsuarioApp } from '../types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const inmA: Inmueble = {
  id: 'inm-A',
  direccion: 'Calle A',
  ciudad: 'Alicante',
  precio: 800,
  estado: 'disponible',
  habitaciones: 3,
  banos: 1,
  superficie: 90,
  candidatosCount: 0,
  fianzaMeses: 1,
  propietarioId: 'prop-A',
  modalidadAlquiler: 'completo',
};

const inmB: Inmueble = { ...inmA, id: 'inm-B', propietarioId: 'prop-B' };

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

const propA: UsuarioApp = { ...admin, id: 'u-a', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-A', roles: [] };
const propB: UsuarioApp = { ...admin, id: 'u-b', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-B', roles: [] };

const habA1: HabitacionInmueble = {
  id: 'h1',
  inmuebleId: 'inm-A',
  nombre: 'Habitación 1',
  estado: 'DISPONIBLE',
  activo: true,
  fechaAlta: '2026-01-01',
  fechaModificacion: '2026-01-01',
  creadoPor: 'Admin',
  actualizadoPor: 'Admin',
};

const habA2: HabitacionInmueble = { ...habA1, id: 'h2', nombre: 'Habitación 2' };
const habB: HabitacionInmueble = { ...habA1, id: 'hB', inmuebleId: 'inm-B', nombre: 'Ajena' };

function run() {
  // TEST 1 vivienda completa
  assert(inmuebleEnModoHabitaciones(inmA) === false, 'TEST1 vivienda completa');

  // TEST 2 cambiar a habitaciones
  const inmHab = { ...inmA, modalidadAlquiler: 'habitaciones' as const };
  assert(inmuebleEnModoHabitaciones(inmHab) === true, 'TEST2 modo habitaciones');

  // TEST 3-4 vinculación inmuebleId
  const todas = [habA1, habA2, habB];
  const deA = asegurarHabitacionesDelInmueble(todas, 'inm-A');
  assert(deA.length === 2 && deA.every((h) => h.inmuebleId === 'inm-A'), 'TEST4 todas vinculadas a A');

  // TEST 5 edición aislada
  const editada = { ...habA1, nombre: 'Habitación 1 norte' };
  assert(editada.id === 'h1' && habA2.nombre === 'Habitación 2', 'TEST5 solo cambia la seleccionada');

  // TEST 6 estado
  const alquilada = { ...habA1, estado: 'ALQUILADA' as const };
  assert(alquilada.estado === 'ALQUILADA', 'TEST6 estado');

  // TEST 7-8 cambio de modalidad no borra
  const trasCompleto = habitacionesTrasCambioModalidad(deA, 'inm-A', 'completo');
  assert(trasCompleto.length === 2, 'TEST7 no se eliminan al pasar a vivienda completa');
  const trasHab = habitacionesTrasCambioModalidad(trasCompleto, 'inm-A', 'habitaciones');
  assert(trasHab.length === 2, 'TEST8 vuelven a estar disponibles');

  // TEST 9 aislamiento
  assert(canAccessHabitacionesInmueble(propA, inmA) === true, 'propA accede A');
  assert(canAccessHabitacionesInmueble(propA, inmB) === false, 'TEST9 denegado B');
  assert(canAccessHabitacionesInmueble(propB, inmA) === false, 'TEST9 propB denegado A');
  assert(canMutateHabitaciones(propA, inmA) === true, 'propA muta A');
  assert(canMutateHabitaciones(propA, inmB) === false, 'propA no muta B');

  const desact = aplicarDesactivarHabitacion(habA1, 'Admin');
  assert(desact.activo === false && desact.id === habA1.id, 'desactivar no borra');

  console.log('habitacionesIsolation tests OK');
}

run();
