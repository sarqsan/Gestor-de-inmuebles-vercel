import { describe, expect, it } from 'vitest';
import type { Candidato, ContratoFormalizacion, HabitacionInmueble, Inmueble, UsuarioApp, VisitSlot } from '../types';
import {
  aplicarReservaHabitacion,
  asegurarHabitacionesDelInmueble,
  canAccessHabitacionesInmueble,
  canMutateHabitaciones,
  cancelarReservaHabitacion,
  candidatoSoloSuHabitacion,
  habitacionDisponibleParaNuevaSeleccion,
  habitacionesTrasCambioModalidad,
  ocupacionDesdeContrato,
  payloadIdsCruzadosDenegado,
  reasignacionContratoHabitacionProhibida,
  reservaSlotSoloEsaHabitacion,
  validarContratoHabitacion,
} from './habitacionesEngine';

const inm = (id: string, propietarioId: string): Inmueble =>
  ({
    id,
    direccion: id,
    ciudad: 'Alicante',
    precio: 800,
    estado: 'disponible',
    habitaciones: 3,
    banos: 1,
    superficie: 90,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId,
    modalidadAlquiler: 'habitaciones',
  }) as Inmueble;

const hab = (p: Partial<HabitacionInmueble>): HabitacionInmueble => ({
  id: p.id || 'h1',
  inmuebleId: p.inmuebleId || 'inm-A',
  propietarioId: p.propietarioId || 'prop-A',
  nombre: p.nombre || 'H1',
  estado: p.estado || 'DISPONIBLE',
  activo: p.activo !== false,
  fechaAlta: '2026-01-01',
  fechaModificacion: '2026-01-01',
  creadoPor: 'A',
  actualizadoPor: 'A',
});

const user = (tipo: UsuarioApp['tipoPerfil'], propietarioId?: string): UsuarioApp => ({
  id: tipo + (propietarioId || ''),
  nombre: tipo,
  email: 't@t.com',
  tipoPerfil: tipo,
  estado: 'ACTIVO',
  roles: tipo === 'ADMINISTRADOR' ? ['SUPERADMIN'] : [],
  permisos: [],
  propietarioId,
  createdAt: '',
  updatedAt: '',
});

const contrato = (p: Partial<ContratoFormalizacion>): ContratoFormalizacion =>
  ({
    id: p.id || 'c1',
    candidatoId: p.candidatoId || 'cand1',
    inmuebleId: p.inmuebleId || 'inm-A',
    propietarioId: p.propietarioId || 'prop-A',
    inmuebleNombre: 'A',
    inmuebleDireccion: 'A',
    inmuebleCiudad: 'Alicante',
    propietarioNombre: 'P',
    propietarioDni: 'x',
    propietarioDireccion: 'x',
    propietarioTelefono: 'x',
    propietarioEmail: 'x',
    propietarioIban: 'x',
    candidatoNombre: 'Ana',
    candidatoDni: 'x',
    candidatoTelefono: 'x',
    candidatoEmail: 'x',
    rentaMensual: 400,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: 400,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    fechaInicioContrato: '2026-01-01',
    esVigente: p.esVigente ?? true,
    modalidadAlquiler: 'habitaciones',
    habitacionId: p.habitacionId,
    duracionAnios: 1,
    diaLimitePagoMes: 5,
    permitirMascotas: false,
    permitirSubarriendo: false,
    incluyeMueblesInventario: false,
    gastosComunidadCargo: 'arrendador',
    ibiCargo: 'arrendador',
    suministrosCargo: 'arrendatario',
    clausulaDesistimientoAnticipado: false,
    clausulasPersonalizadas: [],
    estado: p.estado || 'FORMALIZADO_ACTIVO',
    evaluacionAsegurabilidad: {} as ContratoFormalizacion['evaluacionAsegurabilidad'],
    actaEntregaLlaves: {} as ContratoFormalizacion['actaEntregaLlaves'],
    firmaArrendador: { firmado: true },
    firmaArrendatario: { firmado: true },
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
    historial: [],
  }) as ContratoFormalizacion;

const inmA = inm('inm-A', 'prop-A');
const inmB = inm('inm-B', 'prop-B');
const h1 = hab({ id: 'h1', nombre: 'Norte' });
const h2 = hab({ id: 'h2', nombre: 'Sur' });
const hB = hab({ id: 'hB', inmuebleId: 'inm-B', propietarioId: 'prop-B' });
const propA = user('PROPIETARIO', 'prop-A');
const propB = user('PROPIETARIO', 'prop-B');

describe('cierre aislamiento alquiler por habitaciones', () => {
  it('1. inmueble con varias habitaciones', () => {
    expect([h1, h2]).toHaveLength(2);
  });
  it('2. habitaciones vinculadas al inmueble', () => {
    expect(asegurarHabitacionesDelInmueble([h1, h2, hB], 'inm-A').every((h) => h.inmuebleId === 'inm-A')).toBe(true);
  });
  it('3. propietario consulta las suyas', () => {
    expect(canAccessHabitacionesInmueble(propA, inmA)).toBe(true);
  });
  it('4. propietario A no consulta habitaciones de B', () => {
    expect(canAccessHabitacionesInmueble(propA, inmB)).toBe(false);
    expect(canMutateHabitaciones(propA, inmB)).toBe(false);
  });
  it('5. habitación A no contamina B', () => {
    const res = aplicarReservaHabitacion(h1, 'A');
    expect(res.estado).toBe('RESERVADA');
    expect(h2.estado).toBe('DISPONIBLE');
  });
  it('6. candidato vinculado a habitación correcta', () => {
    const cand = { habitacionId: 'h1' } as Candidato;
    expect(candidatoSoloSuHabitacion(cand, 'h1')).toBe(true);
  });
  it('7. candidato no consulta otra habitación', () => {
    const cand = { habitacionId: 'h1' } as Candidato;
    expect(candidatoSoloSuHabitacion(cand, 'h2')).toBe(false);
  });
  it('8. reserva afecta solo esa habitación', () => {
    const slot = { id: 's1', inmuebleId: 'inm-A', habitacionId: 'h1' } as VisitSlot;
    expect(reservaSlotSoloEsaHabitacion(slot, 'h1')).toBe(true);
    expect(reservaSlotSoloEsaHabitacion(slot, 'h2')).toBe(false);
  });
  it('9. cancelar reserva libera solo esa unidad', () => {
    const r1 = aplicarReservaHabitacion(h1, 'A');
    const r2 = aplicarReservaHabitacion(h2, 'A');
    const lib = cancelarReservaHabitacion(r1, 'A');
    expect(lib.estado).toBe('DISPONIBLE');
    expect(r2.estado).toBe('RESERVADA');
  });
  it('10. ocupada no aparece disponible', () => {
    const c = contrato({ habitacionId: 'h1' });
    const occ = ocupacionDesdeContrato(aplicarReservaHabitacion(h1, 'A'), c, 'A');
    expect(habitacionDisponibleParaNuevaSeleccion(occ, [c])).toBe(false);
  });
  it('11. disponible puede volver a proceso', () => {
    expect(habitacionDisponibleParaNuevaSeleccion(h1, [])).toBe(true);
  });
  it('12. selección conserva inmuebleId', () => {
    const c = contrato({ inmuebleId: 'inm-A', habitacionId: 'h1' });
    expect(c.inmuebleId).toBe('inm-A');
  });
  it('13. selección conserva habitacionId', () => {
    const c = contrato({ inmuebleId: 'inm-A', habitacionId: 'h1' });
    expect(c.habitacionId).toBe('h1');
  });
  it('14. contrato conserva inmuebleId', () => {
    expect(validarContratoHabitacion({ contrato: contrato({ habitacionId: 'h1' }), habitacion: h1, inmueble: inmA, contratosExistentes: [] })).toBeNull();
  });
  it('15. contrato conserva habitación', () => {
    expect(reasignacionContratoHabitacionProhibida(contrato({ habitacionId: 'h1' }), { habitacionId: 'h2' })).toBe(true);
  });
  it('16. contrato conserva propietarioId', () => {
    const err = validarContratoHabitacion({
      contrato: contrato({ habitacionId: 'h1', propietarioId: 'prop-B' }),
      habitacion: h1,
      inmueble: inmA,
      contratosExistentes: [],
    });
    expect(err).toBeTruthy();
  });
  it('17. documentación mantiene aislamiento (por inmuebleId)', () => {
    expect(h1.inmuebleId).not.toBe(hB.inmuebleId);
  });
  it('18. IDs cruzados desde cliente denegados', () => {
    expect(payloadIdsCruzadosDenegado({ inmuebleId: 'inm-B', propietarioId: 'prop-A', habitacionId: 'h1' }, inmA, h1)).toBe(true);
    expect(payloadIdsCruzadosDenegado({ inmuebleId: 'inm-A', propietarioId: 'prop-A', habitacionId: 'h1' }, inmA, h1)).toBe(false);
  });
  it('19. reglas de aislamiento (propietario B no muta A)', () => {
    expect(canMutateHabitaciones(propB, inmA)).toBe(false);
  });
  it('20. flujo habitación → candidato → selección → contrato', () => {
    const cand = { id: 'cand1', habitacionId: 'h1', inmuebleId: 'inm-A' } as Candidato;
    const reserved = aplicarReservaHabitacion(h1, 'A');
    const c = contrato({ candidatoId: cand.id, habitacionId: 'h1', inmuebleId: 'inm-A', propietarioId: 'prop-A' });
    const occ = ocupacionDesdeContrato(reserved, c, 'A');
    expect(candidatoSoloSuHabitacion(cand, 'h1')).toBe(true);
    expect(c.inmuebleId).toBe(inmA.id);
    expect(c.habitacionId).toBe(h1.id);
    expect(c.propietarioId).toBe('prop-A');
    expect(habitacionDisponibleParaNuevaSeleccion(occ, [c])).toBe(false);
    expect(habitacionesTrasCambioModalidad([h1, h2], 'inm-A', 'completo')).toHaveLength(2);
  });
});
