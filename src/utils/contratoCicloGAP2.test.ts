import { describe, expect, it } from 'vitest';
import type {
  AnexoContractual,
  ContratoFormalizacion,
  HabitacionInmueble,
  Inmueble,
  UsuarioApp,
} from '../types';
import {
  MODALIDAD_CONTRACTUAL_LABELS,
  MODALIDADES_CONTRACTUALES,
  accesoCruzadoContratoDenegado,
  agregarConceptoFiniquito,
  aplicarContratoEspecial,
  calcularSaldoFiniquito,
  canGestionarCicloContrato,
  cerrarFiniquito,
  confirmarAnexo,
  contratosProximosAFinalizar,
  crearAnexo,
  crearContratoDerivado,
  crearEventoContrato,
  crearFiniquito,
  crearNuevaVersionAnexo,
  esEstadoTerminalContrato,
  esModalidadContractual,
  finalizarContrato,
  finalizarContratoConHabitacion,
  inferirModalidadContractual,
  modificarAnexo,
  modificarAnexoConfirmadoProhibido,
  periodosPosterioresA,
  reactivacionContratoTerminalProhibida,
  registrarMovimientoFiniquito,
  revisarPendientesCierre,
  sugerirConceptosFiniquito,
  transicionEstadoContratoPermitida,
  validarContratoEspecial,
} from './contratoCicloEngine';
import { generarPeriodosParaContrato } from './cobrosEngine';

const fechaEn = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
};

const cont = (p: Partial<ContratoFormalizacion> = {}): ContratoFormalizacion =>
  ({
    id: 'cont-1',
    candidatoId: 'cand-1',
    inmuebleId: 'inm-A',
    propietarioId: 'prop-A',
    inmuebleNombre: 'Piso A',
    inmuebleDireccion: 'Calle A 1',
    inmuebleCiudad: 'Alicante',
    propietarioNombre: 'Prop A',
    propietarioDni: '11111111A',
    propietarioDireccion: 'Dir A',
    propietarioTelefono: '600000001',
    propietarioEmail: 'a@a.es',
    propietarioIban: 'ES00',
    candidatoNombre: 'Inq Uno',
    candidatoDni: '22222222B',
    candidatoTelefono: '600000002',
    candidatoEmail: 'inq@inq.es',
    rentaMensual: 800,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: 800,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    fechaInicioContrato: fechaEn(-90),
    duracionAnios: 1,
    diaLimitePagoMes: 5,
    permitirMascotas: false,
    permitirSubarriendo: false,
    incluyeMueblesInventario: false,
    gastosComunidadCargo: 'arrendador',
    ibiCargo: 'arrendador',
    suministrosCargo: 'arrendatario',
    clausulaDesistimientoAnticipado: true,
    clausulasPersonalizadas: [],
    estado: 'FORMALIZADO_ACTIVO',
    esVigente: true,
    evaluacionAsegurabilidad: {} as never,
    actaEntregaLlaves: {} as never,
    firmaArrendador: { firmado: true },
    firmaArrendatario: { firmado: true },
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    historial: [],
    ...p,
  }) as ContratoFormalizacion;

const hab = (p: Partial<HabitacionInmueble> = {}): HabitacionInmueble => ({
  id: 'h1',
  inmuebleId: 'inm-A',
  propietarioId: 'prop-A',
  nombre: 'Hab 1',
  estado: 'OCUPADA',
  activo: true,
  fechaAlta: new Date().toISOString(),
  fechaModificacion: new Date().toISOString(),
  creadoPor: 'P',
  actualizadoPor: 'P',
  contratoId: 'cont-1',
  historial: [],
  ...p,
});

const usuarioPropA = { id: 'u1', nombre: 'Prop A', email: 'propa@a.es', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', roles: ['PROPIETARIO'], permisos: [], propietarioId: 'prop-A', createdAt: '', updatedAt: '' } as UsuarioApp;
const usuarioPropB = { id: 'u2', nombre: 'Prop B', email: 'propb@b.es', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', roles: ['PROPIETARIO'], permisos: [], propietarioId: 'prop-B', createdAt: '', updatedAt: '' } as UsuarioApp;
const inmuebleA = { id: 'inm-A', propietarioId: 'prop-A', propietarioPrincipalId: 'prop-A', estado: 'alquilado' } as Inmueble;
const inmuebleB = { id: 'inm-B', propietarioId: 'prop-B', propietarioPrincipalId: 'prop-B', estado: 'disponible' } as Inmueble;

// =====================================================================
describe('GAP2 · 1. Contratos por modalidad', () => {
  it('1.1 creación vivienda habitual', () => {
    const c = cont();
    const r = aplicarContratoEspecial(c, { modalidad: 'VIVIENDA_HABITUAL' }, 'P');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.modalidadContractual).toBe('VIVIENDA_HABITUAL');
      expect(r.valor.version).toBe(1);
      expect(r.valor.historial.length).toBeGreaterThan(0);
    }
  });

  it('1.2 creación temporada (con motivo y fecha fin)', () => {
    const c = cont();
    const r = aplicarContratoEspecial(
      c,
      { modalidad: 'TEMPORADA', motivoTemporalidad: 'Desplazamiento laboral', fechaFin: fechaEn(180), duracionMeses: 6 },
      'P'
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.modalidadContractual).toBe('TEMPORADA');
      expect(r.valor.motivoTemporalidad).toBe('Desplazamiento laboral');
      expect(r.valor.fechaFinContrato).toBeDefined();
    }
  });

  it('1.3 creación local / uso distinto', () => {
    const c = cont();
    const r = aplicarContratoEspecial(
      c,
      { modalidad: 'LOCAL_USO_DISTINTO', finalidadUso: 'Oficina de arquitectura', fechaFin: fechaEn(365) },
      'P'
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.finalidadUso).toBe('Oficina de arquitectura');
  });

  it('1.4 creación habitación conserva habitacionId y modalidadAlquiler', () => {
    const c = cont({ habitacionId: 'h1', modalidadAlquiler: 'habitaciones' });
    const r = aplicarContratoEspecial(c, { modalidad: 'HABITACION' }, 'P');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.habitacionId).toBe('h1');
      expect(r.valor.modalidadAlquiler).toBe('habitaciones');
      expect(r.valor.modalidadContractual).toBe('HABITACION');
    }
  });

  it('1.5 modalidad inválida rechazada', () => {
    const c = cont();
    const r = aplicarContratoEspecial(c, { modalidad: 'TURISTICO' }, 'P');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Modalidad contractual inválida');
    expect(esModalidadContractual('TURISTICO')).toBe(false);
    expect(MODALIDADES_CONTRACTUALES.length).toBe(4);
    expect(Object.keys(MODALIDAD_CONTRACTUAL_LABELS).length).toBe(4);
  });

  it('1.6 fechas inválidas rechazadas (fin < inicio y formato)', () => {
    const c = cont({ fechaInicioContrato: '2026-06-01' });
    expect(validarContratoEspecial(c, { modalidad: 'TEMPORADA', motivoTemporalidad: 'x', fechaFin: '2026-01-01' }))
      .toContain('anterior');
    expect(validarContratoEspecial(c, { modalidad: 'VIVIENDA_HABITUAL', fechaInicio: '01/06/2026' }))
      .toContain('no es válida');
  });

  it('1.7 temporada sin motivo rechazada; habitación sin habitacionId rechazada', () => {
    const c = cont();
    expect(validarContratoEspecial(c, { modalidad: 'TEMPORADA', fechaFin: fechaEn(30) })).toContain('motivo');
    expect(validarContratoEspecial(cont(), { modalidad: 'HABITACION' })).toContain('habitacionId');
  });

  it('1.8 inferencia de modalidad para contratos preexistentes', () => {
    expect(inferirModalidadContractual(cont())).toBe('VIVIENDA_HABITUAL');
    expect(inferirModalidadContractual(cont({ habitacionId: 'h1' }))).toBe('HABITACION');
    expect(inferirModalidadContractual(cont({ modalidadContractual: 'TEMPORADA' }))).toBe('TEMPORADA');
  });
});

// =====================================================================
describe('GAP2 · 2. Histórico, prórrogas y relación origen/derivado', () => {
  it('2.1 contrato derivado vincula origen y versión', () => {
    const origen = cont({ version: 1 });
    const r = crearContratoDerivado(origen, { nuevaFechaInicio: fechaEn(30), nuevaRentaMensual: 850, usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.derivado.contratoOrigenId).toBe(origen.id);
    expect(r.valor.derivado.version).toBe(2);
    expect(r.valor.derivado.estado).toBe('BORRADOR_CONTRATO');
    expect(r.valor.origenActualizado.contratoDerivadoId).toBe(r.valor.derivado.id);
  });

  it('2.2 el derivado conserva inmueble/habitación/propietario (renovación segura)', () => {
    const origen = cont({ habitacionId: 'h1', modalidadAlquiler: 'habitaciones' });
    const r = crearContratoDerivado(origen, { nuevaFechaInicio: fechaEn(10), usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.derivado.inmuebleId).toBe('inm-A');
    expect(r.valor.derivado.habitacionId).toBe('h1');
    expect(r.valor.derivado.propietarioId).toBe('prop-A');
    expect(r.valor.derivado.candidatoId).toBe(origen.candidatoId);
  });

  it('2.3 el derivado NO duplica cobros históricos ni anexos', () => {
    const origen = cont({ registroCobros: generarPeriodosParaContrato(cont()) });
    const r = crearContratoDerivado(origen, { nuevaFechaInicio: fechaEn(10), usuarioNombre: 'P' });
    if (!r.ok) throw new Error('debe crear derivado');
    expect(r.valor.derivado.registroCobros).toEqual([]);
    expect(r.valor.derivado.anexos).toEqual([]);
    expect(r.valor.derivado.finiquito).toBeUndefined();
  });

  it('2.4 un origen no puede tener dos derivados', () => {
    const origen = cont({ contratoDerivadoId: 'cont-otro' });
    const r = crearContratoDerivado(origen, { nuevaFechaInicio: fechaEn(10), usuarioNombre: 'P' });
    expect(r.ok).toBe(false);
  });

  it('2.5 fechas del derivado validadas', () => {
    const origen = cont();
    const rMal = crearContratoDerivado(origen, { nuevaFechaInicio: 'fecha-mal', usuarioNombre: 'P' });
    expect(rMal.ok).toBe(false);
    const rPeor = crearContratoDerivado(origen, { nuevaFechaInicio: fechaEn(10), nuevaFechaFin: fechaEn(1), usuarioNombre: 'P' });
    expect(rPeor.ok).toBe(false);
  });

  it('2.6 preservación histórica: historial append-only en origen y derivado', () => {
    const origen = cont({ historial: [{ id: 'h0', fecha: 'x', autor: 'sistema', accion: 'origen' }] });
    const r = crearContratoDerivado(origen, { nuevaFechaInicio: fechaEn(5), usuarioNombre: 'P' });
    if (!r.ok) throw new Error('ok');
    expect(r.valor.origenActualizado.historial.some((h) => h.id === 'h0')).toBe(true);
    expect(r.valor.origenActualizado.historial[0].accion).toContain('derivado');
    expect(r.valor.derivado.historial.length).toBeGreaterThan(0);
  });
});

// =====================================================================
describe('GAP2 · 3. Anexos contractuales', () => {
  it('3.1 crear anexo (v1, borrador, con aislamiento de ids)', () => {
    const c = cont({ habitacionId: 'h1' });
    const r = crearAnexo(c, { tipo: 'MODIFICACION_CONTRACTUAL', titulo: 'Actualización renta', contenido: 'Renta pasa a 850€' }, 'P');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.valor.anexo;
    expect(a.version).toBe(1);
    expect(a.estado).toBe('BORRADOR');
    expect(a.contratoId).toBe(c.id);
    expect(a.inmuebleId).toBe('inm-A');
    expect(a.habitacionId).toBe('h1');
    expect(a.propietarioId).toBe('prop-A');
  });

  it('3.2 consultar anexos: permanecen en el contrato', () => {
    const c = cont();
    const r1 = crearAnexo(c, { tipo: 'INVENTARIO', titulo: 'Inv', contenido: 'x' }, 'P');
    if (!r1.ok) throw new Error('ok');
    expect(r1.valor.contrato.anexos?.length).toBe(1);
    expect(r1.valor.contrato.anexos?.[0].titulo).toBe('Inv');
  });

  it('3.3 confirmar y versionar: el original queda SUPERSEDIDO y se conserva', () => {
    const c = cont();
    const r1 = crearAnexo(c, { tipo: 'PRORROGA', titulo: 'Prórroga 1', contenido: 'v1' }, 'P');
    if (!r1.ok) throw new Error('ok');
    const r2 = confirmarAnexo(r1.valor.contrato, r1.valor.anexo.id, 'P');
    if (!r2.ok) throw new Error('ok');
    expect(r2.valor.anexos?.[0].estado).toBe('CONFIRMADO');
    const r3 = crearNuevaVersionAnexo(r2.valor, r1.valor.anexo.id, { tipo: 'PRORROGA', titulo: 'Prórroga 1 corregida', contenido: 'v2' }, 'P');
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    const anexos = r3.valor.contrato.anexos || [];
    expect(anexos.length).toBe(2);
    expect(anexos.find((a) => a.id === r1.valor.anexo.id)?.estado).toBe('SUPERSEDIDO');
    expect(r3.valor.anexo.version).toBe(2);
    expect(r3.valor.anexo.anexoOriginalId).toBe(r1.valor.anexo.id);
  });

  it('3.4 impedir modificación indebida de anexo confirmado', () => {
    const c = cont();
    const r1 = crearAnexo(c, { tipo: 'OTRO', titulo: 'T', contenido: 'c' }, 'P');
    if (!r1.ok) throw new Error('ok');
    const r2 = confirmarAnexo(r1.valor.contrato, r1.valor.anexo.id, 'P');
    if (!r2.ok) throw new Error('ok');
    const rMod = modificarAnexo(r2.valor, r1.valor.anexo.id, { contenido: 'alterado' });
    expect(rMod.ok).toBe(false);
    if (!rMod.ok) expect(rMod.error).toContain('nueva versión');
    expect(modificarAnexoConfirmadoProhibido(r2.valor.anexos![0])).toBe(true);
    // el contenido original sigue intacto
    expect(r2.valor.anexos?.[0].contenido).toBe('c');
  });

  it('3.5 un borrador sí puede editarse', () => {
    const c = cont();
    const r1 = crearAnexo(c, { tipo: 'OTRO', titulo: 'T', contenido: 'c' }, 'P');
    if (!r1.ok) throw new Error('ok');
    const rMod = modificarAnexo(r1.valor.contrato, r1.valor.anexo.id, { contenido: 'editado' });
    expect(rMod.ok).toBe(true);
    if (rMod.ok) expect(rMod.valor.anexos?.[0].contenido).toBe('editado');
  });

  it('3.6 sin anexos a contratos terminales; no se versiona un borrador', () => {
    const fin = cont({ estado: 'FINALIZADO' });
    expect(crearAnexo(fin, { tipo: 'OTRO', titulo: 'T', contenido: 'c' }, 'P').ok).toBe(false);
    const c = cont();
    const r1 = crearAnexo(c, { tipo: 'OTRO', titulo: 'T', contenido: 'c' }, 'P');
    if (!r1.ok) throw new Error('ok');
    expect(crearNuevaVersionAnexo(r1.valor.contrato, r1.valor.anexo.id, { tipo: 'OTRO', titulo: 'T2', contenido: 'c2' }, 'P').ok).toBe(false);
  });
});

// =====================================================================
describe('GAP2 · 4. Finalización / rescisión / cancelación', () => {
  it('4.1 finalización válida (natural)', () => {
    const c = cont();
    const r = finalizarContrato(c, { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.estado).toBe('FINALIZADO');
    expect(r.valor.esVigente).toBe(false);
    expect(r.valor.fechaFinContrato).toBe(fechaEn(0));
    expect(r.valor.finalizacion?.ejecutadoPor).toBe('P');
    expect(r.valor.historial[0].accion).toContain('finalizado');
  });

  it('4.2 rescisión anticipada → RESCINDIDO', () => {
    const r = finalizarContrato(cont(), { tipo: 'RESCISION_ANTICIPADA', fechaEfectiva: fechaEn(0), motivo: 'Impago', usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.estado).toBe('RESCINDIDO');
      expect(r.valor.finalizacion?.motivo).toBe('Impago');
    }
  });

  it('4.3 cancelación de expediente → CANCELADO', () => {
    const r = finalizarContrato(cont(), { tipo: 'CANCELACION_EXPEDIENTE', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.estado).toBe('CANCELADO');
  });

  it('4.4 contrato ya finalizado no puede finalizarse otra vez', () => {
    const c = cont({ estado: 'FINALIZADO', esVigente: false });
    expect(finalizarContrato(c, { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' }).ok).toBe(false);
    expect(esEstadoTerminalContrato('FINALIZADO')).toBe(true);
    expect(esEstadoTerminalContrato('RESCINDIDO')).toBe(true);
    expect(esEstadoTerminalContrato('CANCELADO')).toBe(true);
    expect(esEstadoTerminalContrato('FORMALIZADO_ACTIVO')).toBe(false);
  });

  it('4.5 fecha inválida rechazada (formato y anterior al inicio)', () => {
    expect(finalizarContrato(cont(), { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: '31/12/2026', usuarioNombre: 'P' }).ok).toBe(false);
    expect(finalizarContrato(cont({ fechaInicioContrato: '2026-06-01' }), { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: '2026-01-01', usuarioNombre: 'P' }).ok).toBe(false);
  });

  it('4.6 prohibida la reactivación silenciosa de un contrato terminal', () => {
    const c = cont({ estado: 'FINALIZADO', esVigente: false });
    expect(reactivacionContratoTerminalProhibida(c, { estado: 'FORMALIZADO_ACTIVO' })).toBe(true);
    expect(reactivacionContratoTerminalProhibida(c, { esVigente: true })).toBe(true);
    expect(reactivacionContratoTerminalProhibida(c, { estado: 'RESCINDIDO' })).toBe(false); // reclasificar terminales sí
    expect(transicionEstadoContratoPermitida('FINALIZADO', 'FORMALIZADO_ACTIVO')).toBe(false);
    expect(transicionEstadoContratoPermitida('FINALIZADO', 'CANCELADO')).toBe(true);
    expect(transicionEstadoContratoPermitida('FORMALIZADO_ACTIVO', 'FINALIZADO')).toBe(true);
  });

  it('4.7 la finalización no altera los cobros históricos', () => {
    const cobros = generarPeriodosParaContrato(cont());
    const c = cont({ registroCobros: cobros });
    const r = finalizarContrato(c, { tipo: 'RESCISION_ANTICIPADA', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' });
    if (!r.ok) throw new Error('ok');
    expect(r.valor.registroCobros).toEqual(cobros);
  });

  it('4.8 aislamiento por propietario en la gestión del ciclo', () => {
    const c = cont();
    expect(canGestionarCicloContrato(usuarioPropA, c, [inmuebleA])).toBe(true);
    expect(canGestionarCicloContrato(usuarioPropB, c, [inmuebleA, inmuebleB])).toBe(false);
    expect(accesoCruzadoContratoDenegado(c, { propietarioId: 'prop-B' })).toBe(true);
    expect(accesoCruzadoContratoDenegado(c, { inmuebleId: 'inm-B' })).toBe(true);
    expect(accesoCruzadoContratoDenegado(c, { propietarioId: 'prop-A', inmuebleId: 'inm-A' })).toBe(false);
  });
});

// =====================================================================
describe('GAP2 · 5. Finiquito y cierre económico', () => {
  const contratoFinalizado = (extra: Partial<ContratoFormalizacion> = {}) => {
    const c = cont({ ...extra });
    const r = finalizarContrato(c, { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' });
    if (!r.ok) throw new Error('fin');
    return r.valor;
  };

  it('5.1 saldo negativo: fianza a devolver (propietario devuelve)', () => {
    const r = crearFiniquito(contratoFinalizado(), 'P');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.finiquito?.estado).toBe('ABIERTO');
    expect(r.valor.finiquito!.saldoFinal).toBe(-800); // solo devolución de fianza
    expect(r.valor.finiquito!.conceptos.some((x) => x.tipo === 'DEVOLUCION_FIANZA')).toBe(true);
  });

  it('5.2 saldo positivo: cargos > devoluciones', () => {
    const rFin = crearFiniquito(contratoFinalizado(), 'P');
    if (!rFin.ok) throw new Error('finiquito');
    const rDanos = agregarConceptoFiniquito(rFin.valor, { tipo: 'DANOS', concepto: 'Pared dañada', importe: 1200 }, 'P');
    if (!rDanos.ok) throw new Error('ok');
    expect(rDanos.valor.finiquito!.saldoFinal).toBe(400); // 1200 - 800
    expect(rDanos.valor.finiquito!.conceptos.find((x) => x.tipo === 'DANOS')?.favoreceA).toBe('PROPIETARIO');
  });

  it('5.3 saldo cero (fianza == daños) y cálculo correcto redondeado', () => {
    const rFin = crearFiniquito(contratoFinalizado(), 'P');
    if (!rFin.ok) throw new Error('finiquito');
    const r = agregarConceptoFiniquito(rFin.valor, { tipo: 'DANOS', concepto: 'Limpieza', importe: 800 }, 'P');
    if (!r.ok) throw new Error('ok');
    expect(r.valor.finiquito!.saldoFinal).toBe(0);
    expect(calcularSaldoFiniquito([])).toBe(0);
  });

  it('5.4 conceptos pendientes detectados desde cobros existentes (solo lectura)', () => {
    const cBase = cont();
    const cobros = generarPeriodosParaContrato(cBase).map((p, i) =>
      i === 0 ? { ...p, estado: 'RETRASADO' as const } : p
    );
    const fin = contratoFinalizado({ registroCobros: cobros });
    const pendientes = revisarPendientesCierre(fin);
    expect(pendientes.periodosRetrasados).toBeGreaterThan(0);
    const sugeridos = sugerirConceptosFiniquito(fin, 'P');
    expect(sugeridos.some((s) => s.tipo === 'RENTA_PENDIENTE')).toBe(true);
  });

  it('5.5 registrar pago/devolución: importes reclamado/pendiente/pagado/devuelto', () => {
    const r = crearFiniquito(contratoFinalizado(), 'P');
    if (!r.ok) throw new Error('ok');
    const concepto = r.valor.finiquito!.conceptos[0];
    const rPago = registrarMovimientoFiniquito(r.valor, concepto.id, 300);
    expect(rPago.ok).toBe(true);
    if (!rPago.ok) return;
    const cAct = rPago.valor.finiquito!.conceptos[0];
    expect(cAct.importeDevuelto).toBe(300);
    expect(cAct.importePendiente).toBe(500);
    expect(cAct.estado).toBe('PARCIAL');
    const rFin = registrarMovimientoFiniquito(rPago.valor, concepto.id, 500);
    if (!rFin.ok) throw new Error('ok');
    expect(rFin.valor.finiquito!.conceptos[0].estado).toBe('LIQUIDADO');
    expect(rFin.valor.finiquito!.saldoFinal).toBe(0);
  });

  it('5.6 cierre requiere todo liquidado; finiquito cerrado no admite movimientos', () => {
    const r = crearFiniquito(contratoFinalizado(), 'P');
    if (!r.ok) throw new Error('ok');
    const temprano = cerrarFiniquito(r.valor, 'P');
    expect(temprano.ok).toBe(false);
    const conceptoId = r.valor.finiquito!.conceptos[0].id;
    const liq = registrarMovimientoFiniquito(r.valor, conceptoId, 800);
    if (!liq.ok) throw new Error('ok');
    const cierre = cerrarFiniquito(liq.valor, 'P', 'Cierre conforme');
    expect(cierre.ok).toBe(true);
    if (!cierre.ok) return;
    expect(cierre.valor.finiquito!.estado).toBe('CERRADO');
    expect(cierre.valor.finiquito!.cerradoPor).toBe('P');
    expect(registrarMovimientoFiniquito(cierre.valor, conceptoId, 10).ok).toBe(false);
    expect(cerrarFiniquito(cierre.valor, 'P').ok).toBe(false);
  });

  it('5.7 el finiquito NO altera retroactivamente los cobros históricos', () => {
    const cobros = generarPeriodosParaContrato(cont());
    const fin = contratoFinalizado({ registroCobros: cobros });
    const r = crearFiniquito(fin, 'P');
    if (!r.ok) throw new Error('ok');
    // Liquidar TODOS los conceptos sugeridos (rentas pendientes + fianza)
    let actual = r.valor;
    for (const conc of actual.finiquito!.conceptos) {
      const rp = registrarMovimientoFiniquito(actual, conc.id, conc.importeReclamado);
      if (!rp.ok) throw new Error(`liquidar ${conc.tipo}`);
      actual = rp.valor;
    }
    const cierre = cerrarFiniquito(actual, 'P');
    if (!cierre.ok) throw new Error('ok');
    expect(cierre.valor.registroCobros).toEqual(cobros);
  });

  it('5.8 finiquito solo tras estado terminal y una única vez', () => {
    expect(crearFiniquito(cont(), 'P').ok).toBe(false);
    const fin = contratoFinalizado();
    const r = crearFiniquito(fin, 'P');
    if (!r.ok) throw new Error('ok');
    expect(crearFiniquito(r.valor, 'P').ok).toBe(false);
  });

  it('5.9 periodos futuros controlados tras finalización (generación económica)', () => {
    const c = cont({ esVigente: false, estado: 'FINALIZADO', fechaFinContrato: fechaEn(0) });
    const periodos = generarPeriodosParaContrato(c, 24);
    // generarPeriodosParaContrato ya corta en el mes de fin: nada más allá de la fecha efectiva
    const posteriores = periodosPosterioresA({ ...c, registroCobros: periodos }, fechaEn(45));
    expect(posteriores).toBe(0);
  });
});

// =====================================================================
describe('GAP2 · 6. Habitaciones', () => {
  it('6.1 habitacionId correcto en contrato de habitación', () => {
    const c = cont({ habitacionId: 'h1', modalidadContractual: 'HABITACION' });
    expect(inferirModalidadContractual(c)).toBe('HABITACION');
    expect(validarContratoEspecial(c, { modalidad: 'HABITACION' })).toBeNull();
  });

  it('6.2 aislamiento: contrato de habitación no puede usar habitación ajena', () => {
    const c = cont({ habitacionId: 'h1' });
    const habAjena = hab({ id: 'h2', contratoId: 'otro-contrato' });
    const r = finalizarContratoConHabitacion(c, habAjena, { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('no corresponde');
  });

  it('6.3 finalización de contrato de habitación libera la habitación (reglas actuales)', () => {
    const c = cont({ habitacionId: 'h1' });
    const h = hab({ estado: 'OCUPADA', contratoId: 'cont-1' });
    const r = finalizarContratoConHabitacion(c, h, { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor.contrato.estado).toBe('FINALIZADO');
    expect(r.valor.habitacion?.estado).toBe('DISPONIBLE');
    // El circuito consolidado conserva contratoId como trazabilidad del último contrato
    expect(r.valor.habitacion?.contratoId).toBe('cont-1');
    expect(r.valor.habitacion?.historial?.[0].estadoNuevo).toBe('DISPONIBLE');
  });

  it('6.4 no libera habitación bloqueada/inactiva ni ocupada por otro contrato', () => {
    const c = cont({ habitacionId: 'h1' });
    const ocupadaOtro = hab({ estado: 'OCUPADA', contratoId: 'cont-otro' });
    const r1 = finalizarContratoConHabitacion(c, ocupadaOtro, { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' });
    if (!r1.ok) throw new Error('ok');
    expect(r1.valor.habitacion).toBeUndefined(); // sin cambios: no le pertenece
    expect(ocupadaOtro.estado).toBe('OCUPADA');
  });

  it('6.5 impedir acceso cruzado propietario/inmueble/habitación', () => {
    const c = cont({ habitacionId: 'h1' });
    expect(accesoCruzadoContratoDenegado(c, { habitacionId: 'h2' })).toBe(true);
    expect(accesoCruzadoContratoDenegado(c, { habitacionId: 'h1', inmuebleId: 'inm-A', propietarioId: 'prop-A' })).toBe(false);
    const h = hab({ inmuebleId: 'inm-B' });
    const r = finalizarContratoConHabitacion(c, h, { tipo: 'FINALIZACION_NATURAL', fechaEfectiva: fechaEn(0), usuarioNombre: 'P' });
    expect(r.ok).toBe(false);
  });
});

// =====================================================================
describe('GAP2 · 7. Eventos y próxima finalización (extensión para notificaciones B)', () => {
  it('7.1 contratos próximos a finalizar dentro de ventana', () => {
    const a = cont({ id: 'a', fechaFinContrato: fechaEn(10) });
    const b = cont({ id: 'b', fechaFinContrato: fechaEn(60) });
    const c = cont({ id: 'c', estado: 'FINALIZADO', esVigente: false, fechaFinContrato: fechaEn(5) });
    const proximos = contratosProximosAFinalizar([a, b, c], 30);
    expect(proximos.map((x) => x.id)).toEqual(['a']);
  });

  it('7.2 crearEventoContrato produce eventos estructurados sin dispatcher', () => {
    const c = cont({ habitacionId: 'h1' });
    const ev = crearEventoContrato('CONTRATO_FINALIZADO', c, 'fin de contrato');
    expect(ev.tipo).toBe('CONTRATO_FINALIZADO');
    expect(ev.contratoId).toBe(c.id);
    expect(ev.inmuebleId).toBe('inm-A');
    expect(ev.habitacionId).toBe('h1');
    expect(ev.propietarioId).toBe('prop-A');
    expect(ev.fecha).toBeTruthy();
  });
});
