import {
  AnexoContractual,
  ConceptoFiniquito,
  ContratoFormalizacion,
  EstadoAnexoContractual,
  EstadoFormalizacion,
  EventoContrato,
  FiniquitoContrato,
  FinalizacionContrato,
  HabitacionInmueble,
  ModalidadContractual,
  TipoEventoContrato,
  TipoFinalizacionContrato,
  UsuarioApp,
  Inmueble,
} from '../types';
import { calcularResumenCobros } from './cobrosEngine';
import { finalizarOcupacionHabitacion, contratoEstaActivo } from './habitacionesEngine';
import { canAccessContrato } from '../lib/authService';

/**
 * GAP 2 — MOTOR DEL CICLO CONTRACTUAL (contratos especiales, anexos, rescisión y finiquito).
 *
 * REGLAS DE ARQUITECTURA:
 * - NO es un segundo motor económico: la generación de periodos y el estado de los cobros
 *   siguen viviendo en cobrosEngine (generarPeriodosParaContrato ya respeta fechaFinContrato).
 * - NO duplica el circuito de habitaciones: la liberación de habitación delega en
 *   habitacionesEngine.finalizarOcupacionHabitacion.
 * - NO duplica el motor de notificaciones de Arena B: solo define el contrato de eventos
 *   (crearEventoContrato) y los puntos de emisión (PUNTOS_EVENTO_CONTRATO).
 */

// =====================================================================
// MODALIDADES CONTRACTUALES
// =====================================================================

export const MODALIDADES_CONTRACTUALES: ModalidadContractual[] = [
  'VIVIENDA_HABITUAL',
  'TEMPORADA',
  'LOCAL_USO_DISTINTO',
  'HABITACION',
];

export const MODALIDAD_CONTRACTUAL_LABELS: Record<ModalidadContractual, string> = {
  VIVIENDA_HABITUAL: 'Vivienda habitual',
  TEMPORADA: 'Temporada',
  LOCAL_USO_DISTINTO: 'Local / uso distinto',
  HABITACION: 'Habitación',
};

export function esModalidadContractual(valor: string): valor is ModalidadContractual {
  return MODALIDADES_CONTRACTUALES.includes(valor as ModalidadContractual);
}

/**
 * Infiere la modalidad de contratos preexistentes (compatibilidad hacia atrás):
 * con habitacionId → HABITACION; sin él → VIVIENDA_HABITUAL (el único modelo anterior).
 */
export function inferirModalidadContractual(contrato: ContratoFormalizacion): ModalidadContractual {
  if (contrato.modalidadContractual && esModalidadContractual(contrato.modalidadContractual)) {
    return contrato.modalidadContractual;
  }
  return contrato.habitacionId ? 'HABITACION' : 'VIVIENDA_HABITUAL';
}

export interface OpcionesContratoEspecial {
  modalidad: string;
  finalidadUso?: string;
  motivoTemporalidad?: string;
  fechaInicio?: string; // YYYY-MM-DD
  fechaFin?: string; // YYYY-MM-DD
  duracionMeses?: number;
  rentaMensual?: number;
  fianzaLegalMeses?: number;
  garantiaAdicionalMeses?: number;
  condicionesParticulares?: string;
}

export type ResultadoOperacion<T> = { ok: true; valor: T; error?: undefined } | { ok: false; error: string; valor?: undefined };

function esFechaValidaYYYYMMDD(fecha?: string): boolean {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  return !isNaN(Date.parse(`${fecha}T00:00:00`));
}

/**
 * Valida fechas y coherencia de modalidad sobre un contrato ya existente.
 */
export function validarContratoEspecial(contrato: ContratoFormalizacion, opts?: OpcionesContratoEspecial): string | null {
  const modalidad = (opts?.modalidad ?? contrato.modalidadContractual ?? inferirModalidadContractual(contrato)) as string;
  if (!esModalidadContractual(modalidad)) {
    return `Modalidad contractual inválida: "${modality2txt(modalidad)}".`;
  }
  const inicio = opts?.fechaInicio ?? contrato.fechaInicioContrato;
  const fin = opts?.fechaFin ?? contrato.fechaFinContrato;
  if (!esFechaValidaYYYYMMDD(inicio)) return 'La fecha de inicio no es válida (formato YYYY-MM-DD).';
  if (fin !== undefined && !esFechaValidaYYYYMMDD(fin)) return 'La fecha de fin no es válida (formato YYYY-MM-DD).';
  if (fin !== undefined && Date.parse(`${fin}T00:00:00`) < Date.parse(`${inicio}T00:00:00`)) {
    return 'La fecha de fin no puede ser anterior a la fecha de inicio.';
  }
  if (modalidad === 'HABITACION' && !contrato.habitacionId) {
    return 'La modalidad HABITACION requiere habitacionId.';
  }
  if (modalidad === 'TEMPORADA') {
    const motivo = opts?.motivoTemporalidad ?? contrato.motivoTemporalidad;
    if (!motivo || !motivo.trim()) {
      return 'La modalidad TEMPORADA requiere registrar expresamente el motivo/causa de la temporalidad.';
    }
    if (fin === undefined) {
      return 'La modalidad TEMPORADA requiere fecha de finalización expresa.';
    }
  }
  if (modalidad === 'LOCAL_USO_DISTINTO') {
    const uso = opts?.finalidadUso ?? contrato.finalidadUso;
    if (!uso || !uso.trim()) {
      return 'La modalidad LOCAL_USO_DISTINTO requiere indicar la finalidad/uso del local.';
    }
  }
  return null;
}

function modality2txt(m: string): string {
  return m || '(vacía)';
}

/**
 * Aplica datos de contrato especial sobre un contrato existente (p.ej. borrador LAU).
 * No genera afirmaciones jurídicas: solo almacena lo aportado por el usuario.
 */
export function aplicarContratoEspecial(
  contrato: ContratoFormalizacion,
  opts: OpcionesContratoEspecial,
  usuarioNombre: string
): ResultadoOperacion<ContratoFormalizacion> {
  const errorModalidad = validarContratoEspecial(contrato, opts);
  if (errorModalidad) return { ok: false, error: errorModalidad };

  const modalidad = opts.modalidad as ModalidadContractual;
  const actualizado: ContratoFormalizacion = {
    ...contrato,
    modalidadContractual: modalidad,
    finalidadUso: opts.finalidadUso ?? contrato.finalidadUso,
    motivoTemporalidad: opts.motivoTemporalidad ?? contrato.motivoTemporalidad,
    fechaInicioContrato: opts.fechaInicio ?? contrato.fechaInicioContrato,
    fechaFinContrato: opts.fechaFin ?? contrato.fechaFinContrato,
    duracionMeses: opts.duracionMeses ?? contrato.duracionMeses,
    rentaMensual: opts.rentaMensual ?? contrato.rentaMensual,
    fianzaLegalMeses: opts.fianzaLegalMeses ?? contrato.fianzaLegalMeses,
    garantiaAdicionalMeses: opts.garantiaAdicionalMeses ?? contrato.garantiaAdicionalMeses,
    version: contrato.version ?? 1,
    fechaActualizacion: new Date().toISOString(),
    historial: [
      {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fecha: new Date().toLocaleString('es-ES'),
        autor: 'propietario',
        accion: 'Contrato especial configurado',
        detalle: `Modalidad ${MODALIDAD_CONTRACTUAL_LABELS[modalidad]} aplicada por ${usuarioNombre}`,
      },
      ...contrato.historial,
    ],
  };
  if (modalidad === 'HABITACION') {
    actualizado.modalidadAlquiler = 'habitaciones';
  }
  return { ok: true, valor: actualizado };
}

// =====================================================================
// ESTADOS TERMINALES Y TRANSICIONES
// =====================================================================

export const ESTADOS_TERMINALES_CONTRATO: EstadoFormalizacion[] = ['FINALIZADO', 'RESCINDIDO', 'CANCELADO'];

export function esEstadoTerminalContrato(estado: EstadoFormalizacion): boolean {
  return ESTADOS_TERMINALES_CONTRATO.includes(estado);
}

/**
 * Un contrato en estado terminal NO puede volver silenciosamente a un estado activo.
 * Entre estados terminales sí se permite reclasificar (p.ej. FINALIZADO → RESCINDIDO).
 */
export function transicionEstadoContratoPermitida(
  actual: EstadoFormalizacion,
  siguiente: EstadoFormalizacion
): boolean {
  if (!esEstadoTerminalContrato(actual)) return true;
  return esEstadoTerminalContrato(siguiente);
}

/**
 * Protege contra la reactivación silenciosa de un contrato finalizado/rescindido/cancelado.
 */
export function reactivacionContratoTerminalProhibida(
  actual: ContratoFormalizacion,
  siguiente: Partial<ContratoFormalizacion>
): boolean {
  if (!esEstadoTerminalContrato(actual.estado)) return false;
  if (siguiente.estado && !esEstadoTerminalContrato(siguiente.estado)) return true;
  if (siguiente.esVigente === true) return true;
  return false;
}

// =====================================================================
// FINALIZACIÓN / RESCISIÓN / CANCELACIÓN
// =====================================================================

export interface OpcionesFinalizacion {
  tipo: TipoFinalizacionContrato;
  fechaEfectiva: string; // YYYY-MM-DD
  motivo?: string;
  observaciones?: string;
  usuarioNombre: string;
  usuarioId?: string;
}

const ESTADO_SEGUN_TIPO_FINALIZACION: Record<TipoFinalizacionContrato, EstadoFormalizacion> = {
  FINALIZACION_NATURAL: 'FINALIZADO',
  MUTUO_ACUERDO: 'FINALIZADO',
  RESCISION_ANTICIPADA: 'RESCINDIDO',
  CANCELACION_EXPEDIENTE: 'CANCELADO',
};

/**
 * Finaliza/rescinde/cancela un contrato de forma formal e inmutable.
 * - No permite operar sobre contratos ya terminales.
 * - No toca registroCobros (los cobros históricos se conservan intactos).
 * - No genera afirmaciones jurídicas: registra los datos aportados por el usuario.
 */
export function finalizarContrato(
  contrato: ContratoFormalizacion,
  opts: OpcionesFinalizacion
): ResultadoOperacion<ContratoFormalizacion> {
  if (esEstadoTerminalContrato(contrato.estado)) {
    return { ok: false, error: `El contrato ya está en estado terminal (${contrato.estado}) y no puede finalizarse de nuevo.` };
  }
  if (!esFechaValidaYYYYMMDD(opts.fechaEfectiva)) {
    return { ok: false, error: 'La fecha efectiva de finalización no es válida (formato YYYY-MM-DD).' };
  }
  if (Date.parse(`${opts.fechaEfectiva}T00:00:00`) < Date.parse(`${contrato.fechaInicioContrato}T00:00:00`)) {
    return { ok: false, error: 'La fecha efectiva no puede ser anterior a la fecha de inicio del contrato.' };
  }
  if (!opts.usuarioNombre || !opts.usuarioNombre.trim()) {
    return { ok: false, error: 'Debe identificarse el usuario que ejecuta la finalización.' };
  }

  const estadoNuevo = ESTADO_SEGUN_TIPO_FINALIZACION[opts.tipo];
  const finalizacion: FinalizacionContrato = {
    tipo: opts.tipo,
    fechaEfectiva: opts.fechaEfectiva,
    motivo: opts.motivo,
    observaciones: opts.observaciones,
    ejecutadoPor: opts.usuarioNombre,
    ejecutadoPorId: opts.usuarioId,
    fechaOperacion: new Date().toISOString(),
  };

  const actualizado: ContratoFormalizacion = {
    ...contrato,
    estado: estadoNuevo,
    esVigente: false,
    fechaFinContrato: opts.fechaEfectiva,
    finalizacion,
    fechaActualizacion: new Date().toISOString(),
    historial: [
      {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        fecha: new Date().toLocaleString('es-ES'),
        autor: 'propietario',
        accion: `Contrato ${estadoNuevo.toLowerCase()} (${opts.tipo})`,
        detalle: `Fecha efectiva ${opts.fechaEfectiva}. Ejecutado por ${opts.usuarioNombre}${opts.motivo ? `. Motivo: ${opts.motivo}` : ''}`,
      },
      ...contrato.historial,
    ],
  };
  return { ok: true, valor: actualizado };
}

/**
 * Integración con habitaciones: finaliza el contrato y libera la habitación SOLO si
 * las reglas actuales lo permiten (habitación OCUPADA por este mismo contrato).
 * No inventa disponibilidad si la habitación está bloqueada/inactiva u ocupada por otro contrato.
 */
export function finalizarContratoConHabitacion(
  contrato: ContratoFormalizacion,
  habitacion: HabitacionInmueble | undefined,
  opts: OpcionesFinalizacion
): ResultadoOperacion<{ contrato: ContratoFormalizacion; habitacion?: HabitacionInmueble }> {
  if (contrato.habitacionId) {
    if (!habitacion) return { ok: false, error: 'La habitación asociada al contrato no existe.' };
    if (habitacion.id !== contrato.habitacionId || habitacion.inmuebleId !== contrato.inmuebleId) {
      return { ok: false, error: 'Acceso denegado: la habitación no corresponde al inmueble/habitación del contrato.' };
    }
  }

  const res = finalizarContrato(contrato, opts);
  if (!res.ok) return { ok: false, error: res.error };

  let habitacionActualizada: HabitacionInmueble | undefined;
  if (contrato.habitacionId && habitacion) {
    if (habitacion.estado === 'OCUPADA' && habitacion.contratoId === contrato.id) {
      habitacionActualizada = finalizarOcupacionHabitacion(habitacion, opts.usuarioNombre);
    }
    // Si no está OCUPADA por este contrato, no se altera (reglas actuales mandan).
  }
  return { ok: true, valor: { contrato: res.valor, habitacion: habitacionActualizada } };
}

// =====================================================================
// ANEXOS CONTRACTUALES (VERSIONADOS, INMUTABLES TRAS CONFIRMACIÓN)
// =====================================================================

export interface DatosAnexo {
  tipo: AnexoContractual['tipo'];
  titulo: string;
  descripcion?: string;
  fecha?: string;
  contenido: string;
  referenciaDocumental?: string;
}

function buscarAnexo(contrato: ContratoFormalizacion, anexoId: string): AnexoContractual | undefined {
  return (contrato.anexos || []).find((a) => a.id === anexoId);
}

/**
 * Crea un anexo nuevo (versión 1, estado BORRADOR) asociado al contrato.
 */
export function crearAnexo(
  contrato: ContratoFormalizacion,
  datos: DatosAnexo,
  usuarioNombre: string,
  usuarioId?: string
): ResultadoOperacion<{ contrato: ContratoFormalizacion; anexo: AnexoContractual }> {
  if (esEstadoTerminalContrato(contrato.estado)) {
    return { ok: false, error: 'No se pueden añadir anexos a un contrato finalizado/rescindido/cancelado.' };
  }
  if (!datos.titulo.trim() || !datos.contenido.trim()) {
    return { ok: false, error: 'El anexo requiere título y contenido.' };
  }
  const anexo: AnexoContractual = {
    id: `anexo_${contrato.id}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    contratoId: contrato.id,
    propietarioId: contrato.propietarioId,
    inmuebleId: contrato.inmuebleId,
    habitacionId: contrato.habitacionId,
    tipo: datos.tipo,
    titulo: datos.titulo.trim(),
    descripcion: datos.descripcion,
    fecha: datos.fecha || new Date().toISOString().split('T')[0],
    contenido: datos.contenido,
    version: 1,
    estado: 'BORRADOR',
    referenciaDocumental: datos.referenciaDocumental,
    fechaCreacion: new Date().toISOString(),
    creadoPor: usuarioNombre,
    creadoPorId: usuarioId,
  };
  const actualizado: ContratoFormalizacion = {
    ...contrato,
    anexos: [...(contrato.anexos || []), anexo],
    fechaActualizacion: new Date().toISOString(),
  };
  return { ok: true, valor: { contrato: actualizado, anexo } };
}

/**
 * Confirma un anexo en borrador. Tras la confirmación queda inmovilizado.
 */
export function confirmarAnexo(
  contrato: ContratoFormalizacion,
  anexoId: string,
  usuarioNombre: string
): ResultadoOperacion<ContratoFormalizacion> {
  const anexo = buscarAnexo(contrato, anexoId);
  if (!anexo) return { ok: false, error: 'El anexo no existe.' };
  if (anexo.estado !== 'BORRADOR') {
    return { ok: false, error: `Solo puede confirmarse un anexo en BORRADOR (estado actual: ${anexo.estado}).` };
  }
  const anexos = (contrato.anexos || []).map((a) =>
    a.id === anexoId
      ? { ...a, estado: 'CONFIRMADO' as EstadoAnexoContractual, fechaConfirmacion: new Date().toISOString() }
      : a
  );
  return {
    ok: true,
    valor: { ...contrato, anexos, fechaActualizacion: new Date().toISOString() },
  };
}

/**
 * REGLA DE ORO: un anexo CONFIRMADO o SUPERSEDIDO no se modifica.
 */
export function modificarAnexoConfirmadoProhibido(anexo: AnexoContractual): boolean {
  return anexo.estado === 'CONFIRMADO' || anexo.estado === 'SUPERSEDIDO';
}

/**
 * Modifica un anexo SOLO mientras está en BORRADOR.
 */
export function modificarAnexo(
  contrato: ContratoFormalizacion,
  anexoId: string,
  datos: Partial<DatosAnexo>
): ResultadoOperacion<ContratoFormalizacion> {
  const anexo = buscarAnexo(contrato, anexoId);
  if (!anexo) return { ok: false, error: 'El anexo no existe.' };
  if (modificarAnexoConfirmadoProhibido(anexo)) {
    return {
      ok: false,
      error: 'Un anexo confirmado no puede modificarse silenciosamente. Cree una nueva versión (el anexo original se conserva).',
    };
  }
  const anexos = (contrato.anexos || []).map((a) =>
    a.id === anexoId
      ? {
          ...a,
          titulo: datos.titulo ?? a.titulo,
          descripcion: datos.descripcion ?? a.descripcion,
          contenido: datos.contenido ?? a.contenido,
          tipo: datos.tipo ?? a.tipo,
          fecha: datos.fecha ?? a.fecha,
          referenciaDocumental: datos.referenciaDocumental ?? a.referenciaDocumental,
        }
      : a
  );
  return { ok: true, valor: { ...contrato, anexos, fechaActualizacion: new Date().toISOString() } };
}

/**
 * Nueva versión de un anexo confirmado: el original pasa a SUPERSEDIDO (se conserva)
 * y se crea un anexo nuevo con version+1 y referencia al original.
 */
export function crearNuevaVersionAnexo(
  contrato: ContratoFormalizacion,
  anexoOriginalId: string,
  datos: DatosAnexo,
  usuarioNombre: string,
  usuarioId?: string
): ResultadoOperacion<{ contrato: ContratoFormalizacion; anexo: AnexoContractual }> {
  if (esEstadoTerminalContrato(contrato.estado)) {
    return { ok: false, error: 'No se pueden versionar anexos de un contrato en estado terminal.' };
  }
  const original = buscarAnexo(contrato, anexoOriginalId);
  if (!original) return { ok: false, error: 'El anexo original no existe.' };
  if (original.estado !== 'CONFIRMADO') {
    return { ok: false, error: 'Solo se versionan anexos CONFIRMADOS. Los borradores se editan directamente.' };
  }
  const nuevoAnexo: AnexoContractual = {
    id: `anexo_${contrato.id}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    contratoId: contrato.id,
    propietarioId: contrato.propietarioId,
    inmuebleId: contrato.inmuebleId,
    habitacionId: contrato.habitacionId,
    tipo: datos.tipo || original.tipo,
    titulo: datos.titulo.trim() || original.titulo,
    descripcion: datos.descripcion,
    fecha: datos.fecha || new Date().toISOString().split('T')[0],
    contenido: datos.contenido || original.contenido,
    version: original.version + 1,
    estado: 'BORRADOR',
    anexoOriginalId: original.id,
    referenciaDocumental: datos.referenciaDocumental,
    fechaCreacion: new Date().toISOString(),
    creadoPor: usuarioNombre,
    creadoPorId: usuarioId,
  };
  const anexos = (contrato.anexos || []).map((a) =>
    a.id === anexoOriginalId ? { ...a, estado: 'SUPERSEDIDO' as EstadoAnexoContractual } : a
  );
  anexos.push(nuevoAnexo);
  return {
    ok: true,
    valor: {
      contrato: { ...contrato, anexos, fechaActualizacion: new Date().toISOString() },
      anexo: nuevoAnexo,
    },
  };
}

// =====================================================================
// PRÓRROGAS / RENOVACIONES (RELACIÓN HISTÓRICA ORIGEN ↔ DERIVADO)
// =====================================================================

/**
 * Crea el contrato derivado (prórroga/renovación/novación) a partir del contrato origen.
 * - Copia el núcleo (inmueble/habitación/propietario/candidato): NO duplica histórico de cobros.
 * - Vincula contratoOrigenId ↔ contratoDerivadoId.
 * - El origen no puede tener ya otro derivado.
 */
export function crearContratoDerivado(
  origen: ContratoFormalizacion,
  datos: {
    nuevaRentaMensual?: number;
    nuevaFechaInicio: string;
    nuevaFechaFin?: string;
    duracionMeses?: number;
    motivo?: string;
    usuarioNombre: string;
  }
): ResultadoOperacion<{ origenActualizado: ContratoFormalizacion; derivado: ContratoFormalizacion }> {
  if (origen.contratoDerivadoId) {
    return { ok: false, error: 'Este contrato ya tiene un contrato derivado registrado.' };
  }
  if (!esFechaValidaYYYYMMDD(datos.nuevaFechaInicio)) {
    return { ok: false, error: 'La fecha de inicio del contrato derivado no es válida.' };
  }
  if (datos.nuevaFechaFin && Date.parse(`${datos.nuevaFechaFin}T00:00:00`) < Date.parse(`${datos.nuevaFechaInicio}T00:00:00`)) {
    return { ok: false, error: 'La fecha de fin del derivado no puede ser anterior a su inicio.' };
  }

  const versionSiguiente = (origen.version ?? 1) + 1;
  const derivado: ContratoFormalizacion = {
    ...origen,
    id: `cont-${origen.candidatoId}-${Date.now().toString(36)}-v${versionSiguiente}`,
    token: `cnt-${Math.random().toString(36).substring(2, 9)}`,
    contratoOrigenId: origen.id,
    contratoDerivadoId: undefined,
    version: versionSiguiente,
    rentaMensual: datos.nuevaRentaMensual ?? origen.rentaMensual,
    fianzaLegalImporte: datos.nuevaRentaMensual ? datos.nuevaRentaMensual * (origen.fianzaLegalMeses || 1) : origen.fianzaLegalImporte,
    fechaInicioContrato: datos.nuevaFechaInicio,
    fechaFinContrato: datos.nuevaFechaFin,
    duracionMeses: datos.duracionMeses ?? origen.duracionMeses,
    esVigente: false, // pasa a vigente al formalizarse, no automáticamente
    estado: 'BORRADOR_CONTRATO',
    finalizacion: undefined,
    finiquito: undefined,
    anexos: [], // los anexos pertenecen al contrato concreto, no se heredan
    registroCobros: [], // los cobros históricos permanecen en el origen
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    historial: [
      {
        id: `hist-${Date.now()}`,
        fecha: new Date().toLocaleString('es-ES'),
        autor: 'propietario',
        accion: 'Contrato derivado creado',
        detalle: `Deriva del contrato ${origen.id}${datos.motivo ? ` — motivo: ${datos.motivo}` : ''} (v${versionSiguiente})`,
      },
    ],
  };

  const origenActualizado: ContratoFormalizacion = {
    ...origen,
    contratoDerivadoId: derivado.id,
    fechaActualizacion: new Date().toISOString(),
    historial: [
      {
        id: `hist-${Date.now()}-der`,
        fecha: new Date().toLocaleString('es-ES'),
        autor: 'sistema',
        accion: 'Contrato derivado vinculado',
        detalle: `Se preparó el contrato derivado ${derivado.id}${datos.motivo ? ` — motivo: ${datos.motivo}` : ''}`,
      },
      ...origen.historial,
    ],
  };
  return { ok: true, valor: { origenActualizado, derivado } };
}

// =====================================================================
// FINIQUITO (CIERRE ECONÓMICO)
// =====================================================================

const TIPOS_FAVOR_PROPIETARIO: ConceptoFiniquito['tipo'][] = [
  'RENTA_PENDIENTE',
  'SUMINISTROS_PENDIENTES',
  'DANOS',
  'OTROS_CARGOS_PROPIETARIO',
];
const TIPOS_FAVOR_INQUILINO: ConceptoFiniquito['tipo'][] = [
  'DEVOLUCION_FIANZA',
  'GARANTIAS_A_DEVOLVER',
  'SALDOS_A_FAVOR_INQUILINO',
];

export function favorecidoPorTipo(tipo: ConceptoFiniquito['tipo']): 'PROPIETARIO' | 'INQUILINO' {
  return TIPOS_FAVOR_PROPIETARIO.includes(tipo) ? 'PROPIETARIO' : 'INQUILINO';
}

/**
 * Calcula el saldo del finiquito.
 * saldoFinal > 0 → el inquilino debe pagar al propietario.
 * saldoFinal < 0 → el propietario debe devolver al inquilino.
 * Se usan los importes RECLAMADOS pendientes (reclamado - pagado/devuelto).
 */
export function calcularSaldoFiniquito(conceptos: ConceptoFiniquito[]): number {
  let saldo = 0;
  for (const c of conceptos) {
    const pendiente = Math.max(0, c.importeReclamado - (c.favoreceA === 'PROPIETARIO' ? c.importePagado : c.importeDevuelto));
    saldo += c.favoreceA === 'PROPIETARIO' ? pendiente : -pendiente;
  }
  return Math.round(saldo * 100) / 100;
}

/**
 * Sugiere conceptos iniciales a partir de datos YA EXISTENTES (solo lectura):
 * - periodos de cobro pendientes/retrasados (no los modifica);
 * - fianza y garantías del contrato a devolver.
 */
export function sugerirConceptosFiniquito(contrato: ContratoFormalizacion, usuarioNombre: string): ConceptoFiniquito[] {
  const conceptos: ConceptoFiniquito[] = [];
  const resumen = calcularResumenCobros(contrato.registroCobros || []);

  if (resumen.totalRetrasado > 0) {
    conceptos.push({
      id: `fconc_${Date.now().toString(36)}_ret`,
      tipo: 'RENTA_PENDIENTE',
      favoreceA: 'PROPIETARIO',
      concepto: `Rentas vencidas pendientes (${resumen.countRetrasados} periodo/s)`,
      importeReclamado: resumen.totalRetrasado,
      importePendiente: resumen.totalRetrasado,
      importePagado: 0,
      importeDevuelto: 0,
      estado: 'PENDIENTE',
      fechaCreacion: new Date().toISOString(),
      creadoPor: usuarioNombre,
    });
  }
  if (resumen.totalIncidencias > 0) {
    conceptos.push({
      id: `fconc_${Date.now().toString(36)}_inc`,
      tipo: 'OTROS_CARGOS_PROPIETARIO',
      favoreceA: 'PROPIETARIO',
      concepto: `Periodos con incidencia económica (${resumen.countIncidencias})`,
      importeReclamado: resumen.totalIncidencias,
      importePendiente: resumen.totalIncidencias,
      importePagado: 0,
      importeDevuelto: 0,
      estado: 'PENDIENTE',
      fechaCreacion: new Date().toISOString(),
      creadoPor: usuarioNombre,
    });
  }
  const fianzaTotal = (contrato.fianzaLegalImporte || 0) + (contrato.garantiaAdicionalImporte || 0);
  if (fianzaTotal > 0) {
    conceptos.push({
      id: `fconc_${Date.now().toString(36)}_fia`,
      tipo: 'DEVOLUCION_FIANZA',
      favoreceA: 'INQUILINO',
      concepto: 'Devolución de fianza legal y garantías adicionales',
      importeReclamado: fianzaTotal,
      importePendiente: fianzaTotal,
      importePagado: 0,
      importeDevuelto: 0,
      estado: 'PENDIENTE',
      fechaCreacion: new Date().toISOString(),
      creadoPor: usuarioNombre,
    });
  }
  return conceptos;
}

/**
 * Genera el finiquito del contrato (estado ABIERTO) con los conceptos sugeridos.
 * No altera registroCobros: los cobros históricos se conservan intactos.
 */
export function crearFiniquito(
  contrato: ContratoFormalizacion,
  usuarioNombre: string,
  conceptosIniciales?: ConceptoFiniquito[]
): ResultadoOperacion<ContratoFormalizacion> {
  if (!esEstadoTerminalContrato(contrato.estado)) {
    return { ok: false, error: 'El finiquito se genera al cerrar el contrato: primero debe finalizarse/rescindirse.' };
  }
  if (contrato.finiquito) {
    return { ok: false, error: 'Este contrato ya tiene un finiquito generado.' };
  }
  const conceptos = conceptosIniciales ?? sugerirConceptosFiniquito(contrato, usuarioNombre);
  const finiquito: FiniquitoContrato = {
    contratoId: contrato.id,
    inmuebleId: contrato.inmuebleId,
    habitacionId: contrato.habitacionId,
    propietarioId: contrato.propietarioId,
    estado: 'ABIERTO',
    conceptos,
    saldoFinal: calcularSaldoFiniquito(conceptos),
    fechaGeneracion: new Date().toISOString(),
    generadoPor: usuarioNombre,
  };
  return {
    ok: true,
    valor: {
      ...contrato,
      finiquito,
      fechaActualizacion: new Date().toISOString(),
      historial: [
        {
          id: `hist-${Date.now()}-fin`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: 'Finiquito generado',
          detalle: `Finiquito abierto con ${conceptos.length} concepto/s por ${usuarioNombre}`,
        },
        ...contrato.historial,
      ],
    },
  };
}

/**
 * Registra un pago/devolución sobre un concepto del finiquito.
 * - favoreceA PROPIETARIO: suma a importePagado.
 * - favoreceA INQUILINO: suma a importeDevuelto.
 * Nunca toca registroCobros.
 */
export function registrarMovimientoFiniquito(
  contrato: ContratoFormalizacion,
  conceptoId: string,
  importe: number
): ResultadoOperacion<ContratoFormalizacion> {
  const fin = contrato.finiquito;
  if (!fin) return { ok: false, error: 'El contrato no tiene finiquito.' };
  if (fin.estado === 'CERRADO') return { ok: false, error: 'El finiquito ya está cerrado.' };
  if (!(importe > 0)) return { ok: false, error: 'El importe del movimiento debe ser positivo.' };
  const concepto = fin.conceptos.find((c) => c.id === conceptoId);
  if (!concepto) return { ok: false, error: 'El concepto no existe en el finiquito.' };

  const conceptos = fin.conceptos.map((c) => {
    if (c.id !== conceptoId) return c;
    if (c.favoreceA === 'PROPIETARIO') {
      const pagado = Math.min(c.importeReclamado, Math.round((c.importePagado + importe) * 100) / 100);
      return {
        ...c,
        importePagado: pagado,
        importePendiente: Math.max(0, Math.round((c.importeReclamado - pagado) * 100) / 100),
        estado: (pagado >= c.importeReclamado ? 'LIQUIDADO' : 'PARCIAL') as ConceptoFiniquito['estado'],
      };
    }
    const devuelto = Math.min(c.importeReclamado, Math.round((c.importeDevuelto + importe) * 100) / 100);
    return {
      ...c,
      importeDevuelto: devuelto,
      importePendiente: Math.max(0, Math.round((c.importeReclamado - devuelto) * 100) / 100),
      estado: (devuelto >= c.importeReclamado ? 'LIQUIDADO' : 'PARCIAL') as ConceptoFiniquito['estado'],
    };
  });

  const finiquito: FiniquitoContrato = { ...fin, conceptos, saldoFinal: calcularSaldoFiniquito(conceptos) };
  return { ok: true, valor: { ...contrato, finiquito, fechaActualizacion: new Date().toISOString() } };
}

/**
 * Añade un concepto manual al finiquito abierto.
 */
export function agregarConceptoFiniquito(
  contrato: ContratoFormalizacion,
  datos: { tipo: ConceptoFiniquito['tipo']; concepto: string; importe: number },
  usuarioNombre: string
): ResultadoOperacion<ContratoFormalizacion> {
  const fin = contrato.finiquito;
  if (!fin) return { ok: false, error: 'El contrato no tiene finiquito.' };
  if (fin.estado === 'CERRADO') return { ok: false, error: 'El finiquito ya está cerrado.' };
  if (!(datos.importe > 0)) return { ok: false, error: 'El importe debe ser positivo.' };
  if (!datos.concepto.trim()) return { ok: false, error: 'El concepto requiere descripción.' };
  const nuevo: ConceptoFiniquito = {
    id: `fconc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    tipo: datos.tipo,
    favoreceA: favorecidoPorTipo(datos.tipo),
    concepto: datos.concepto.trim(),
    importeReclamado: datos.importe,
    importePendiente: datos.importe,
    importePagado: 0,
    importeDevuelto: 0,
    estado: 'PENDIENTE',
    fechaCreacion: new Date().toISOString(),
    creadoPor: usuarioNombre,
  };
  const conceptos = [...fin.conceptos, nuevo];
  return {
    ok: true,
    valor: {
      ...contrato,
      finiquito: { ...fin, conceptos, saldoFinal: calcularSaldoFiniquito(conceptos) },
      fechaActualizacion: new Date().toISOString(),
    },
  };
}

/**
 * Cierra el finiquito. Requiere todos los conceptos LIQUIDADOS.
 */
export function cerrarFiniquito(
  contrato: ContratoFormalizacion,
  usuarioNombre: string,
  observaciones?: string
): ResultadoOperacion<ContratoFormalizacion> {
  const fin = contrato.finiquito;
  if (!fin) return { ok: false, error: 'El contrato no tiene finiquito.' };
  if (fin.estado === 'CERRADO') return { ok: false, error: 'El finiquito ya estaba cerrado.' };
  const noLiquidados = fin.conceptos.filter((c) => c.estado !== 'LIQUIDADO');
  if (noLiquidados.length > 0) {
    return { ok: false, error: `No puede cerrarse: hay ${noLiquidados.length} concepto/s sin liquidar.` };
  }
  const finiquito: FiniquitoContrato = {
    ...fin,
    estado: 'CERRADO',
    saldoFinal: calcularSaldoFiniquito(fin.conceptos),
    fechaCierre: new Date().toISOString(),
    cerradoPor: usuarioNombre,
    observaciones: observaciones ?? fin.observaciones,
  };
  return {
    ok: true,
    valor: {
      ...contrato,
      finiquito,
      fechaActualizacion: new Date().toISOString(),
      historial: [
        {
          id: `hist-${Date.now()}-fc`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: 'Finiquito cerrado',
          detalle: `Saldo final ${finiquito.saldoFinal} €. Cerrado por ${usuarioNombre}`,
        },
        ...contrato.historial,
      ],
    },
  };
}

// =====================================================================
// CIERRE ECONÓMICO (SOLO LECTURA SOBRE COBROS EXISTENTES)
// =====================================================================

/**
 * Periodos de cobro cuya fecha de vencimiento es posterior a una fecha dada.
 * Útil para verificar que tras finalizar no quedan periodos futuros vivos.
 */
export function periodosPosterioresA(contrato: ContratoFormalizacion, fechaCorte: string): number {
  const corte = Date.parse(`${fechaCorte}T23:59:59`);
  return (contrato.registroCobros || []).filter((p) => Date.parse(`${p.fechaVencimiento}T00:00:00`) > corte).length;
}

/**
 * Resumen de pendientes económicos del contrato (para revisar antes de finalizar).
 * Solo lectura: no altera ningún cobro.
 */
export function revisarPendientesCierre(contrato: ContratoFormalizacion): {
  periodosPendientes: number;
  periodosRetrasados: number;
  importePendiente: number;
  importeRetrasado: number;
} {
  const resumen = calcularResumenCobros(contrato.registroCobros || []);
  return {
    periodosPendientes: resumen.countPendientes,
    periodosRetrasados: resumen.countRetrasados,
    importePendiente: resumen.totalPendiente,
    importeRetrasado: resumen.totalRetrasado,
  };
}

// =====================================================================
// PRÓXIMA FINALIZACIÓN Y EVENTOS (PUNTOS DE EXTENSIÓN PARA NOTIFICACIONES B)
// =====================================================================

/**
 * Contratos activos cuya fecha de fin contractual cae dentro de la ventana indicada.
 * Punto de emisión del evento CONTRATO_PROXIMO_A_FINALIZAR.
 */
export function contratosProximosAFinalizar(
  contratos: ContratoFormalizacion[],
  diasVentana: number,
  hoy: Date = new Date()
): ContratoFormalizacion[] {
  const limite = hoy.getTime() + diasVentana * 24 * 60 * 60 * 1000;
  return contratos.filter((c) => {
    if (!contratoEstaActivo(c)) return false;
    if (!c.fechaFinContrato || !esFechaValidaYYYYMMDD(c.fechaFinContrato)) return false;
    const t = Date.parse(`${c.fechaFinContrato}T00:00:00`);
    return t >= hoy.getTime() && t <= limite;
  });
}

/**
 * PUNTOS DE EMISIÓN DE EVENTOS para el motor de notificaciones de Arena B (GAP 1).
 * C no implementa el dispatcher: solo produce el evento estructurado cuando ocurre la acción.
 */
export const PUNTOS_EVENTO_CONTRATO: { tipo: TipoEventoContrato; donde: string }[] = [
  { tipo: 'CONTRATO_CREADO', donde: 'App.handleSaveContrato / FormalizarContratoModal (primer guardado)' },
  { tipo: 'CONTRATO_FORMALIZADO', donde: 'FormalizarContratoModal al pasar a FORMALIZADO_ACTIVO' },
  { tipo: 'ANEXO_CREADO', donde: 'crearAnexo / crearNuevaVersionAnexo (contratoCicloEngine)' },
  { tipo: 'CONTRATO_PROXIMO_A_FINALIZAR', donde: 'contratosProximosAFinalizar (contratoCicloEngine)' },
  { tipo: 'CONTRATO_FINALIZADO', donde: 'finalizarContrato / finalizarContratoConHabitacion (contratoCicloEngine)' },
  { tipo: 'FINIQUITO_GENERADO', donde: 'crearFiniquito (contratoCicloEngine)' },
  { tipo: 'FINIQUITO_CERRADO', donde: 'cerrarFiniquito (contratoCicloEngine)' },
];

/**
 * Fábrica pura de eventos del ciclo contractual. El dispatcher lo aporta Arena B.
 */
export function crearEventoContrato(tipo: TipoEventoContrato, contrato: ContratoFormalizacion, detalle?: string): EventoContrato {
  return {
    tipo,
    contratoId: contrato.id,
    inmuebleId: contrato.inmuebleId,
    habitacionId: contrato.habitacionId,
    propietarioId: contrato.propietarioId,
    fecha: new Date().toISOString(),
    detalle,
  };
}

// =====================================================================
// SEGURIDAD / RBAC
// =====================================================================

/**
 * RBAC del ciclo contractual: reutiliza canAccessContrato de authService.
 * Un usuario solo puede gestionar anexos/finalización/finiquito de contratos que puede leer.
 */
export function canGestionarCicloContrato(
  usuario: UsuarioApp | null | undefined,
  contrato: ContratoFormalizacion,
  allInmuebles: Inmueble[]
): boolean {
  return canAccessContrato(usuario, contrato, allInmuebles);
}

/**
 * Aislamiento: deniega el acceso cuando el contrato no pertenece al propietario/inmueble/habitación indicados.
 */
export function accesoCruzadoContratoDenegado(
  contrato: ContratoFormalizacion,
  ids: { propietarioId?: string; inmuebleId?: string; habitacionId?: string }
): boolean {
  if (ids.propietarioId && contrato.propietarioId && ids.propietarioId !== contrato.propietarioId) return true;
  if (ids.inmuebleId && contrato.inmuebleId !== ids.inmuebleId) return true;
  if (ids.habitacionId && contrato.habitacionId && ids.habitacionId !== contrato.habitacionId) return true;
  return false;
}
