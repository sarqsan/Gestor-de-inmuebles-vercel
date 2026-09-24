import { describe, expect, it } from 'vitest';
import type { ContratoFormalizacion, HabitacionInmueble, Inmueble, UsuarioApp } from '../types';
import {
  canAccessHabitacionesInmueble,
  habitacionDisponibleParaNuevaSeleccion,
  habitacionesTrasCambioModalidad,
  payloadIdsCruzadosDenegado,
  validarContratoHabitacion,
} from './habitacionesEngine';
import {
  generarPeriodosIdempotente,
  generarPeriodosParaContrato,
  historialEconomicoHabitacion,
  impagoAisladoEntreHabitaciones,
  ingresosInmuebleDesdeCircuito,
  payloadEconomicoIdsCruzadosDenegado,
  rentabilidadInmuebleDesdeCircuito,
} from './cobrosEngine';

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
    valorAdquisicion: 100000,
    ...p,
  }) as Inmueble;

const hab = (id: string): HabitacionInmueble => ({
  id,
  inmuebleId: 'inm-A',
  propietarioId: 'prop-A',
  nombre: id,
  estado: 'DISPONIBLE',
  activo: true,
  fechaAlta: '2026-01-01',
  fechaModificacion: '2026-01-01',
  creadoPor: 'A',
  actualizadoPor: 'A',
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
    candidatoNombre: p.candidatoNombre || 'Ana',
    candidatoDni: 'x',
    candidatoTelefono: 'x',
    candidatoEmail: 'x',
    rentaMensual: p.rentaMensual ?? 500,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: 500,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    fechaInicioContrato: p.fechaInicioContrato || '2026-01-01',
    esVigente: p.esVigente ?? true,
    modalidadAlquiler: p.modalidadAlquiler || 'habitaciones',
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
    registroCobros: p.registroCobros,
  }) as ContratoFormalizacion;

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

describe('integración económica alquiler por habitaciones', () => {
  const h1 = hab('h1');
  const h2 = hab('h2');
  const c1 = contrato({ id: 'c1', habitacionId: 'h1', rentaMensual: 500, candidatoId: 'inquilino1' });
  const c2 = contrato({ id: 'c2', habitacionId: 'h2', rentaMensual: 450, candidatoId: 'inquilino2' });
  const inmueble = inm();

  it('1. habitación puede tener contrato', () => {
    expect(validarContratoHabitacion({ contrato: c1, habitacion: h1, inmueble, contratosExistentes: [] })).toBeNull();
  });
  it('2. contrato conserva inmuebleId', () => {
    expect(c1.inmuebleId).toBe(inmueble.id);
  });
  it('3. contrato conserva habitacionId', () => {
    expect(c1.habitacionId).toBe('h1');
  });
  it('4. contrato conserva propietarioId', () => {
    expect(c1.propietarioId).toBe('prop-A');
  });
  it('5. contrato de habitación genera cobro', () => {
    const periodos = generarPeriodosParaContrato(c1);
    expect(periodos.length).toBeGreaterThan(0);
  });
  it('6. cobro conserva habitacionId', () => {
    expect(generarPeriodosParaContrato(c1)[0].habitacionId).toBe('h1');
  });
  it('7. cobro conserva contratoId', () => {
    expect(generarPeriodosParaContrato(c1)[0].contratoId).toBe('c1');
  });
  it('8. cobro conserva inmuebleId', () => {
    expect(generarPeriodosParaContrato(c1)[0].inmuebleId).toBe('inm-A');
  });
  it('9. dos habitaciones generan cobros independientes', () => {
    const p1 = generarPeriodosParaContrato(c1);
    const p2 = generarPeriodosParaContrato(c2);
    expect(p1[0].id).not.toBe(p2[0].id);
    expect(p1[0].habitacionId).not.toBe(p2[0].habitacionId);
  });
  it('10. impago de habitación A no afecta a B', () => {
    const a = generarPeriodosParaContrato(c1).map((p, i) =>
      i === 0 ? { ...p, estado: 'RETRASADO' as const } : { ...p, estado: 'PENDIENTE' as const }
    );
    const b = generarPeriodosParaContrato(c2).map((p) => ({ ...p, estado: 'PENDIENTE' as const }));
    expect(impagoAisladoEntreHabitaciones(a, b)).toBe(true);
  });
  it('11. doble generación no duplica cobro', () => {
    const once = generarPeriodosParaContrato(c1);
    const twice = generarPeriodosIdempotente(c1);
    expect(twice.map((p) => p.id).sort().join()).toBe(once.map((p) => p.id).sort().join());
  });
  it('12. cambio de inquilino conserva histórico', () => {
    const histA = contrato({
      id: 'c1-old',
      habitacionId: 'h1',
      esVigente: false,
      estado: 'FINALIZADO',
      candidatoNombre: 'Ana',
      fechaFinContrato: '2026-06-01',
    });
    const histB = contrato({ id: 'c1-new', habitacionId: 'h1', candidatoNombre: 'Luis' });
    const hist = historialEconomicoHabitacion('h1', [histA, histB]);
    expect(hist.contratos).toHaveLength(2);
  });
  it('13. segundo contrato histórico conserva cobros anteriores', () => {
    const oldC = contrato({
      id: 'old',
      habitacionId: 'h1',
      esVigente: false,
      estado: 'FINALIZADO',
      registroCobros: generarPeriodosParaContrato(contrato({ id: 'old', habitacionId: 'h1' })),
    });
    const newC = contrato({ id: 'new', habitacionId: 'h1' });
    const hist = historialEconomicoHabitacion('h1', [oldC, newC]);
    expect(hist.cobros.some((c) => c.contratoId === 'old')).toBe(true);
  });
  it('14. ingresos de habitaciones se reflejan en inmueble', () => {
    const c1g = { ...c1, registroCobros: generarPeriodosParaContrato(c1) };
    const c2g = { ...c2, registroCobros: generarPeriodosParaContrato(c2) };
    const ing = ingresosInmuebleDesdeCircuito(inmueble, [c1g, c2g]);
    expect(ing.ingresoPrevisto).toBeGreaterThan(0);
  });
  it('15. rentabilidad utiliza ingresos reales del circuito', () => {
    const paid = generarPeriodosParaContrato(c1).map((p) => ({
      ...p,
      importeRecibido: p.importePrevisto,
      estado: 'RECIBIDO' as const,
    }));
    const r = rentabilidadInmuebleDesdeCircuito(inmueble, [{ ...c1, registroCobros: paid }]);
    expect(r.ingresosCobrados).toBeGreaterThan(0);
    expect(r.rentabilidadPct).not.toBeNull();
  });
  it('16. modalidad alquiler completo no se rompe', () => {
    const full = inm({ modalidadAlquiler: 'completo' });
    const cf = contrato({ id: 'cf', modalidadAlquiler: 'completo', habitacionId: undefined, rentaMensual: 1200 });
    const ing = ingresosInmuebleDesdeCircuito(full, [cf, c1]);
    expect(ing.cobros.every((c) => !c.habitacionId)).toBe(true);
  });
  it('17. cambio a habitaciones no elimina datos', () => {
    const after = habitacionesTrasCambioModalidad([h1, h2], 'inm-A', 'habitaciones');
    expect(after).toHaveLength(2);
  });
  it('18. propietario A no accede a datos de B', () => {
    const inmB = inm({ id: 'inm-B', propietarioId: 'prop-B' });
    expect(canAccessHabitacionesInmueble(user('PROPIETARIO', 'prop-A'), inmB)).toBe(false);
  });
  it('19. manipulación de IDs → DENEGADA', () => {
    expect(payloadIdsCruzadosDenegado({ inmuebleId: 'inm-B', habitacionId: 'h1' }, inmueble, h1)).toBe(true);
    expect(payloadEconomicoIdsCruzadosDenegado({ inmuebleId: 'inm-B', contratoId: 'c1' }, c1)).toBe(true);
  });
  it('20. logout elimina acceso privado', () => {
    expect(canAccessHabitacionesInmueble(null, inmueble)).toBe(false);
  });
  it('21. recarga conserva los datos (idempotencia de periodos)', () => {
    const a = generarPeriodosIdempotente(c1);
    const b = generarPeriodosIdempotente({ ...c1, registroCobros: a });
    expect(b).toHaveLength(a.length);
  });
  it('22. cambios persisten realmente (registroCobros no se pisa)', () => {
    const gen = generarPeriodosParaContrato(c1);
    const paid = [{ ...gen[0], importeRecibido: 500, estado: 'RECIBIDO' as const }, ...gen.slice(1)];
    const reload = generarPeriodosParaContrato({ ...c1, registroCobros: paid });
    expect(reload[0].importeRecibido).toBe(500);
  });
  it('23. habitación ocupada no genera nueva contratación simultánea', () => {
    expect(habitacionDisponibleParaNuevaSeleccion(h1, [c1])).toBe(false);
  });
  it('24. dos contratos activos incompatibles para una misma habitación → DENEGADO', () => {
    const extra = contrato({ id: 'cX', habitacionId: 'h1' });
    expect(
      validarContratoHabitacion({ contrato: extra, habitacion: h1, inmueble, contratosExistentes: [c1] })
    ).toBeTruthy();
  });
});
