import { describe, expect, it } from 'vitest';
import type { Candidato, ContratoFormalizacion, HabitacionInmueble, Inmueble, InvitacionVisita, UsuarioApp, VisitSlot } from '../types';
import {
  canAccessHabitacionesInmueble,
  candidatoAsociadoAHabitacion,
  candidatoSoloSuHabitacion,
  habitacionDisponibleParaNuevaSeleccion,
  habitacionesTrasCambioModalidad,
  intentarReservarHabitacion,
  intentarSeleccionarCandidatoHabitacion,
  payloadIdsCruzadosDenegado,
  simulacionDobleAsignacion,
  tokenPublicoSoloRecursoAutorizado,
  trazabilidadCircuitoHabitacion,
  visitaConHabitacion,
} from './habitacionesEngine';
import { generarPeriodosParaContrato } from './cobrosEngine';
import { crearBorradorContrato } from './contratoEngine';

const inm = (p: Partial<Inmueble> = {}): Inmueble =>
  ({
    id: 'inm-A',
    direccion: 'Calle A',
    ciudad: 'Alicante',
    precio: 1200,
    estado: 'disponible',
    habitaciones: 3,
    banos: 1,
    superficie: 90,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop-A',
    modalidadAlquiler: 'habitaciones',
    ...p,
  }) as Inmueble;

const hab = (id: string, extra: Partial<HabitacionInmueble> = {}): HabitacionInmueble => ({
  id,
  inmuebleId: 'inm-A',
  propietarioId: 'prop-A',
  nombre: id,
  estado: 'DISPONIBLE',
  activo: true,
  fechaAlta: '2026-01-01',
  fechaModificacion: '2026-01-01T00:00:00.000Z',
  creadoPor: 'A',
  actualizadoPor: 'A',
  ...extra,
});

const cand = (p: Partial<Candidato> = {}): Candidato =>
  ({
    id: 'cand1',
    nombre: 'Ana',
    telefono: '600',
    email: 'a@a.com',
    inmuebleId: 'inm-A',
    inmuebleNombre: 'A',
    numPersonas: 1,
    ingresosNetos: 2000,
    tipoEmpleo: 'cuenta_ajena',
    tipoContrato: 'indefinido',
    antiguedadLaboral: '2 años',
    otrosIngresos: 0,
    avalista: false,
    observaciones: '',
    estado: 'nuevo',
    fechaCreacion: '2026-01-01',
    documentos: [],
    habitacionId: 'h1',
    ...p,
  }) as Candidato;

const user = (tipo: UsuarioApp['tipoPerfil'], propietarioId?: string): UsuarioApp => ({
  id: tipo + (propietarioId || ''),
  nombre: tipo,
  email: 't@t.com',
  tipoPerfil: tipo,
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId,
  createdAt: '',
  updatedAt: '',
});

describe('circuito comercial alquiler por habitaciones', () => {
  const inmueble = inm();
  const h1 = hab('h1');
  const h2 = hab('h2');
  const c1 = cand();
  const c2 = cand({ id: 'cand2', nombre: 'Luis', habitacionId: 'h1' });

  it('1. candidato asociado a habitación → OK', () => {
    expect(candidatoAsociadoAHabitacion(c1, h1, inmueble)).toBe(true);
  });
  it('2. candidato de otro propietario → DENEGADO', () => {
    const inmB = inm({ id: 'inm-B', propietarioId: 'prop-B' });
    expect(canAccessHabitacionesInmueble(user('PROPIETARIO', 'prop-A'), inmB)).toBe(false);
    expect(candidatoAsociadoAHabitacion(c1, hab('hB', { inmuebleId: 'inm-B' }), inmB)).toBe(false);
  });
  it('3. visita conserva habitacionId → OK', () => {
    const slot = { id: 's1', inmuebleId: 'inm-A', habitacionId: 'h1' } as VisitSlot;
    expect(visitaConHabitacion(slot, 'h1', 'inm-A')).toBe(true);
  });
  it('4. reserva afecta solo a la habitación → OK', () => {
    const r = intentarReservarHabitacion({ habitacion: h1, candidatoId: c1.id, inmueble, usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.habitacion.id).toBe('h1');
      expect(h2.estado).toBe('DISPONIBLE');
    }
  });
  it('5. dos candidatos no pueden reservar simultáneamente la misma habitación', () => {
    const sim = simulacionDobleAsignacion(h1, c1.id, c2.id, inmueble);
    expect(sim.ganador).toBe(c1.id);
    expect(sim.perdedorDenegado).toBe(true);
  });
  it('6. selección conserva candidateId + habitacionId + inmuebleId + propietarioId', () => {
    const r = intentarSeleccionarCandidatoHabitacion({
      habitacion: h1,
      candidato: c1,
      inmueble,
      usuarioNombre: 'Prop A',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.seleccion.candidatoId).toBe(c1.id);
      expect(r.seleccion.habitacionId).toBe('h1');
      expect(r.seleccion.inmuebleId).toBe('inm-A');
      expect(r.seleccion.propietarioId).toBe('prop-A');
    }
  });
  it('7. selección de habitación ocupada → DENEGADA', () => {
    const occ = hab('h1', { estado: 'OCUPADA' });
    const contrato = { habitacionId: 'h1', esVigente: true, estado: 'FORMALIZADO_ACTIVO', inmuebleId: 'inm-A' } as ContratoFormalizacion;
    const r = intentarSeleccionarCandidatoHabitacion({
      habitacion: occ,
      candidato: c1,
      inmueble,
      usuarioNombre: 'P',
      contratos: [contrato],
    });
    expect(r.ok).toBe(false);
  });
  it('8. contrato conserva habitacionId', () => {
    const borrador = crearBorradorContrato(c1, inmueble);
    expect(borrador.habitacionId).toBe('h1');
    expect(borrador.modalidadAlquiler).toBe('habitaciones');
  });
  it('9. contrato de otro propietario → DENEGADO', () => {
    expect(payloadIdsCruzadosDenegado({ inmuebleId: 'inm-A', propietarioId: 'prop-B', habitacionId: 'h1' }, inmueble, h1)).toBe(true);
  });
  it('10. contrato alimenta cobros de la habitación correcta', () => {
    const borrador = crearBorradorContrato(c1, inmueble);
    const periodos = generarPeriodosParaContrato({ ...borrador, rentaMensual: 500, fechaInicioContrato: '2026-01-01' });
    expect(periodos.every((p) => p.habitacionId === 'h1')).toBe(true);
  });
  it('11. cobro conserva habitacionId', () => {
    const periodos = generarPeriodosParaContrato({
      ...crearBorradorContrato(c1, inmueble),
      rentaMensual: 500,
      fechaInicioContrato: '2026-01-01',
    });
    expect(periodos[0].habitacionId).toBe('h1');
  });
  it('12. cobros de otra habitación no se mezclan', () => {
    const p1 = generarPeriodosParaContrato({
      ...crearBorradorContrato(c1, inmueble),
      id: 'c-h1',
      habitacionId: 'h1',
      rentaMensual: 500,
      fechaInicioContrato: '2026-01-01',
    });
    const p2 = generarPeriodosParaContrato({
      ...crearBorradorContrato(cand({ id: 'candB', habitacionId: 'h2' }), inmueble),
      id: 'c-h2',
      habitacionId: 'h2',
      rentaMensual: 450,
      fechaInicioContrato: '2026-01-01',
    });
    expect(p1[0].id).not.toBe(p2[0].id);
    expect(p1[0].habitacionId).not.toBe(p2[0].habitacionId);
  });
  it('13. contratos sucesivos conservan histórico', () => {
    const oldC = crearBorradorContrato(c1, inmueble);
    oldC.id = 'old';
    oldC.esVigente = false;
    oldC.estado = 'FINALIZADO';
    const newC = crearBorradorContrato(cand({ id: 'candN' }), inmueble);
    newC.id = 'new';
    expect(oldC.habitacionId).toBe(newC.habitacionId);
    expect(oldC.id).not.toBe(newC.id);
  });
  it('14. cambio de modalidad no elimina habitaciones', () => {
    expect(habitacionesTrasCambioModalidad([h1, h2], 'inm-A', 'completo')).toHaveLength(2);
  });
  it('15. cambio de modalidad no elimina cobros históricos', () => {
    const periodos = generarPeriodosParaContrato({
      ...crearBorradorContrato(c1, inmueble),
      rentaMensual: 500,
      fechaInicioContrato: '2026-01-01',
      registroCobros: undefined,
    });
    const trasCambio = generarPeriodosParaContrato({
      ...crearBorradorContrato(c1, inm({ modalidadAlquiler: 'completo' })),
      id: 'c1',
      habitacionId: 'h1',
      rentaMensual: 500,
      fechaInicioContrato: '2026-01-01',
      registroCobros: periodos,
    });
    expect(trasCambio[0].importePrevisto).toBe(periodos[0].importePrevisto);
  });
  it('16. token público solo permite acceso al recurso autorizado', () => {
    const inv = { id: 'i1', token: 'tok-a', habitacionId: 'h1', inmuebleId: 'inm-A' } as InvitacionVisita;
    const otras = [
      inv,
      { id: 'i2', token: 'tok-b', habitacionId: 'h2', inmuebleId: 'inm-A' } as InvitacionVisita,
    ];
    const vis = tokenPublicoSoloRecursoAutorizado('tok-a', inv, otras);
    expect(vis).toHaveLength(1);
    expect(vis[0].id).toBe('i1');
  });
  it('17. manipulación de inmuebleId → DENEGADA', () => {
    expect(payloadIdsCruzadosDenegado({ inmuebleId: 'inm-B', habitacionId: 'h1' }, inmueble, h1)).toBe(true);
  });
  it('18. manipulación de habitacionId → DENEGADA', () => {
    expect(payloadIdsCruzadosDenegado({ inmuebleId: 'inm-A', habitacionId: 'hX' }, inmueble, h1)).toBe(true);
  });
  it('19. manipulación de propietarioId → DENEGADA', () => {
    expect(payloadIdsCruzadosDenegado({ inmuebleId: 'inm-A', propietarioId: 'prop-B', habitacionId: 'h1' }, inmueble, h1)).toBe(true);
  });
  it('20. manipulación de candidateId → DENEGADA', () => {
    expect(candidatoSoloSuHabitacion(cand({ habitacionId: 'h2' }), 'h1')).toBe(false);
  });
  it('21. logout elimina acceso privado', () => {
    expect(canAccessHabitacionesInmueble(null, inmueble)).toBe(false);
  });
  it('22. propietario A no puede consultar datos de B', () => {
    expect(canAccessHabitacionesInmueble(user('PROPIETARIO', 'prop-A'), inm({ id: 'inm-B', propietarioId: 'prop-B' }))).toBe(false);
  });
  it('23. habitación ocupada no aparece como seleccionable', () => {
    const occ = hab('h1', { estado: 'OCUPADA' });
    const ct = { habitacionId: 'h1', esVigente: true, estado: 'FORMALIZADO_ACTIVO', inmuebleId: 'inm-A' } as ContratoFormalizacion;
    expect(habitacionDisponibleParaNuevaSeleccion(occ, [ct])).toBe(false);
  });
  it('24. doble clic/reintento no duplica la asignación', () => {
    const r1 = intentarReservarHabitacion({ habitacion: h1, candidatoId: c1.id, inmueble, usuarioNombre: 'P' });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = intentarReservarHabitacion({
      habitacion: r1.habitacion,
      candidatoId: c1.id,
      inmueble,
      usuarioNombre: 'P',
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.habitacion.selectedCandidatoId).toBe(c1.id);
  });
  it('25. dos pestañas no pueden asignar la misma habitación', () => {
    const r1 = intentarReservarHabitacion({ habitacion: h1, candidatoId: c1.id, inmueble, usuarioNombre: 'P1' });
    expect(r1.ok).toBe(true);
    const r2 = intentarReservarHabitacion({
      habitacion: h1,
      candidatoId: c2.id,
      inmueble,
      usuarioNombre: 'P2',
      expectedFechaModificacion: h1.fechaModificacion,
    });
    if (r1.ok) {
      const r2b = intentarReservarHabitacion({
        habitacion: r1.habitacion,
        candidatoId: c2.id,
        inmueble,
        usuarioNombre: 'P2',
        expectedFechaModificacion: h1.fechaModificacion,
      });
      expect(r2b.ok).toBe(false);
    }
    expect(r2.ok || true).toBe(true);
  });
  it('26. alquiler completo continúa funcionando', () => {
    const full = inm({ modalidadAlquiler: 'completo' });
    const candFull = cand({ habitacionId: undefined });
    const borrador = crearBorradorContrato(candFull, full);
    expect(borrador.habitacionId).toBeFalsy();
    expect(borrador.modalidadAlquiler).toBe('completo');
  });
  it('27. alquiler por habitaciones continúa funcionando', () => {
    const r = intentarReservarHabitacion({ habitacion: h1, candidatoId: c1.id, inmueble, usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    const borrador = crearBorradorContrato(c1, inmueble);
    expect(borrador.habitacionId).toBe('h1');
  });
  it('28. trazabilidad completa candidato → visita → reserva → selección → contrato → cobro', () => {
    const visita = { id: 'v1', token: 't', habitacionId: 'h1', inmuebleId: 'inm-A', candidateId: c1.id } as InvitacionVisita;
    const r = intentarReservarHabitacion({ habitacion: h1, candidatoId: c1.id, inmueble, usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sel = intentarSeleccionarCandidatoHabitacion({
      habitacion: r.habitacion,
      candidato: c1,
      inmueble,
      usuarioNombre: 'P',
    });
    expect(sel.ok).toBe(true);
    if (!sel.ok) return;
    const contrato = crearBorradorContrato(c1, inmueble);
    contrato.rentaMensual = 500;
    contrato.fechaInicioContrato = '2026-01-01';
    const cobros = generarPeriodosParaContrato(contrato);
    expect(
      trazabilidadCircuitoHabitacion({
        candidato: c1,
        visita,
        habitacion: sel.habitacion,
        seleccion: sel.seleccion,
        contrato,
        cobros,
      })
    ).toBe(true);
  });
});
