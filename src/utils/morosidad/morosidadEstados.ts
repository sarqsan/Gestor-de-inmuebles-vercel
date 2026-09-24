/**
 * BLOQUE C — Máquina de estados del expediente de morosidad.
 * Motor PURO (sin I/O, determinista, testeable). Regla fundamental:
 *
 *   «Una deuda nunca desaparece porque alguien cambie un estado.»
 *
 * Por eso:
 *  - No existe transición alguna que borre tramos de deuda ni importes.
 *  - `PAGADA` y `CERRADA` solo son alcanzables con una condición verificable
 *    (saldo cero, o motivo de cierre + confirmación explícita).
 *  - Toda transición produce un item de histórico append-only con fecha, usuario,
 *    motivo, observaciones y evidencia opcional.
 *
 * DISEÑO (decisión documentada, FASE 2): la lista de referencia del encargo se
 * ajusta porque `PAGO_PARCIAL` es un HITO de saldo, no un callejón: se entra y se
 * sale de él sin perder trazabilidad, y se añade `COMPROMISO_INCUMPLIDO` porque
 * sin él el incumplimiento de un calendario de pagos no tendría estado propio.
 */

import { ESTADO_EXPEDIENTE_LABELS } from '../../types/morosidad';
import type {
  EstadoExpediente,
  ExpedienteMorosidad,
  MotivoTransicion,
  TransicionExpediente,
} from '../../types/morosidad';

/** Grafo de transiciones válidas. Todo lo no listado queda BLOQUEADO. */
export const TRANSICIONES_MOROSIDAD: Record<EstadoExpediente, EstadoExpediente[]> = {
  DETECTADA: ['PENDIENTE_CONTACTO', 'RECLAMACION_INICIADA', 'PAGADA', 'CERRADA'],
  PENDIENTE_CONTACTO: ['RECLAMACION_INICIADA', 'EN_RECOBRO', 'PAGADA', 'CERRADA'],
  RECLAMACION_INICIADA: ['EN_RECOBRO', 'COMPROMISO_PAGO', 'PAGO_PARCIAL', 'ESCALADA', 'JURIDICA', 'PAGADA', 'CERRADA'],
  EN_RECOBRO: ['COMPROMISO_PAGO', 'PAGO_PARCIAL', 'ESCALADA', 'JURIDICA', 'PAGADA', 'CERRADA'],
  COMPROMISO_PAGO: ['PAGO_PARCIAL', 'EN_RECOBRO', 'COMPROMISO_INCUMPLIDO', 'PAGADA', 'CERRADA'],
  PAGO_PARCIAL: ['EN_RECOBRO', 'COMPROMISO_PAGO', 'ESCALADA', 'JURIDICA', 'PAGADA', 'CERRADA'],
  COMPROMISO_INCUMPLIDO: ['EN_RECOBRO', 'COMPROMISO_PAGO', 'ESCALADA', 'JURIDICA', 'PAGADA', 'CERRADA'],
  ESCALADA: ['EN_RECOBRO', 'JURIDICA', 'PAGADA', 'CERRADA'],
  JURIDICA: ['ESCALADA', 'EN_RECOBRO', 'PAGADA', 'CERRADA'],
  // Terminales: la única salida es una reapertura explícita (nuevo expediente o
  // `reabrirExpediente`, que exige motivo y crea histórico).
  PAGADA: ['CERRADA'],
  CERRADA: [],
};

/** Transiciones que exigen MOTIVO obligatorio (nunca un cambio silencioso). */
export const TRANSICIONES_CON_MOTIVO_OBLIGATORIO: Partial<Record<EstadoExpediente, MotivoTransicion[]>> = {
  DETECTADA: ['DETECCION_AUTOMATICA', 'CAMBIO_MANUAL'],
  PAGADA: ['DEUDA_SALDADA', 'PAGO_RECIBIDO'],
  CERRADA: [
    'DEUDA_SALDADA',
    'CERRADA_SIN_COBRO',
    'ANULACION_O_RECTIFICACION',
    'DISPUTA_RESUELTA',
    'REAPERTURA',
  ],
  ESCALADA: ['ESCALADO_ASEGURADORA'],
  JURIDICA: ['ESCALADO_JURIDICO'],
  COMPROMISO_INCUMPLIDO: ['COMPROMISO_INCUMPLIDO'],
  COMPROMISO_PAGO: ['COMPROMISO_ALCANZADO'],
  PAGO_PARCIAL: ['PAGO_PARCIAL_RECIBIDO'],
};

/** Pares que solo son válidos "hacia atrás" mediante la vía de reapertura. */
export function esReapertura(
  anterior: EstadoExpediente,
  nuevo: EstadoExpediente,
): boolean {
  return anterior === 'CERRADA' && nuevo !== 'CERRADA';
}

export interface ResultadoTransicion {
  ok: boolean;
  errores: string[];
  advertencias: string[];
  estadoNuevo: EstadoExpediente;
  motivo: MotivoTransicion;
}

export function transicionPermitida(
  anterior: EstadoExpediente,
  nuevo: EstadoExpediente,
): boolean {
  if (anterior === nuevo) return false;
  const permitidas = TRANSICIONES_MOROSIDAD[anterior] || [];
  return permitidas.includes(nuevo);
}

/** Un estado terminal solo se reabre con motivo REAPERTURA. */
export function esEstadoTerminal(estado: EstadoExpediente): boolean {
  return estado === 'PAGADA' || estado === 'CERRADA';
}

/**
 * Valida una transición contra el expediente REAL (no solo contra el grafo):
 *  - grafo de transiciones;
 *  - motivo obligatorio en los estados sensibles;
 *  - `PAGADA` exige saldo cero verificado;
 *  - `ESCALADA` exige requerimiento fehaciente registrado o confirmación explícita;
 *  - `JURIDICA` exige el requisito de procedibilidad (MASC) declarado (LO 1/2025),
 *    configurable vía política;
 *  - `CERRADA` con saldo pendiente exige motivo + confirmación.
 */
export function validarTransicion(
  expediente: Pick<
    ExpedienteMorosidad,
    | 'estado'
    | 'saldoPendiente'
    | 'requerimientoFehacienteExiste'
    | 'juridico'
    | 'enDisputa'
    | 'numEvidencias'
  >,
  nuevo: EstadoExpediente,
  motivo: MotivoTransicion | undefined,
  opciones: {
    confirmarCierreConSaldo?: boolean;
    /** Fuerza el salto sin evidencia adjunta (solo admins; queda trazado). */
    forzarSinEvidencia?: boolean;
    /** Política: exige MASC declarado para la vía jurídica. */
    exigeMascParaJuridica?: boolean;
  } = {},
): ResultadoTransicion {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const anterior = expediente.estado;

  if (!nuevo) errores.push('estadoDestinoAusente');
  if (!transicionPermitida(anterior, nuevo)) {
    errores.push(`transicion_bloqueada:${anterior}->${nuevo}`);
  }

  const motivosObligatorios = TRANSICIONES_CON_MOTIVO_OBLIGATORIO[nuevo];
  if (motivosObligatorios && motivosObligatorios.length > 0) {
    if (!motivo) errores.push(`motivo_requerido:${nuevo}`);
    else if (!motivosObligatorios.includes(motivo)) {
      errores.push(`motivo_no_admite_estado:${motivo}!${nuevo}`);
    }
  } else if (!motivo) {
    advertencias.push('motivo_recomendado');
  }

  // Invariantes de saldo: una deuda viva no se "paga" sola.
  if (nuevo === 'PAGADA' && Number(expediente.saldoPendiente || 0) > 0.009) {
    errores.push('pagada_requiere_saldo_cero');
  }
  if (nuevo === 'CERRADA' && Number(expediente.saldoPendiente || 0) > 0.009) {
    if (!opciones.confirmarCierreConSaldo) {
      errores.push('cierre_con_saldo_requiere_confirmacion');
    } else if (motivo !== 'CERRADA_SIN_COBRO' && motivo !== 'ANULACION_O_RECTIFICACION' && motivo !== 'DISPUTA_RESUELTA') {
      errores.push('cierre_con_saldo_requiere_motivo_habilitante');
    } else {
      advertencias.push('cerrado_con_saldo_pendiente_registrado');
    }
  }
  if (nuevo === 'ESCALADA' && !expediente.requerimientoFehacienteExiste) {
    if (opciones.forzarSinEvidencia) {
      advertencias.push('escalado_sin_requerimiento_fehaciente_registrado');
    } else {
      errores.push('escalado_requiere_requerimiento_o_confirmacion');
    }
  }
  if (nuevo === 'JURIDICA') {
    if (opciones.exigeMascParaJuridica) {
      const req = expediente.juridico?.requisitoProcedibilidad;
      if (req !== 'CUMPLIDO_EVIDENCIA' && req !== 'IMPOSIBILIDAD_DECLARADA') {
        errores.push('juridica_requiere_actividad_negociadora_previa_LO1_2025');
      }
    }
    if (!expediente.juridico?.abogadoNombre && !expediente.juridico?.abogadoProfesionalId) {
      advertencias.push('juridica_sin_abogado_registrado');
    }
  }
  if (expediente.enDisputa && nuevo !== 'CERRADA' && nuevo !== 'JURIDICA') {
    advertencias.push('deuda_en_disputa_revise_motivo');
  }

  return {
    ok: errores.length === 0,
    errores,
    advertencias,
    estadoNuevo: nuevo,
    motivo: motivo || 'CAMBIO_MANUAL',
  };
}

export interface EntradaTransicion {
  expedienteId: string;
  /** Clave de aislamiento del histórico (se propaga desde el expediente). */
  propietarioId?: string;
  estadoAnterior: EstadoExpediente | null;
  estadoNuevo: EstadoExpediente;
  motivo: MotivoTransicion;
  observaciones?: string;
  actorId?: string;
  actorNombre?: string;
  evidenciaId?: string;
  importeTotalAntes: number;
  importeTotalDespues: number;
  fecha?: string; // ISO (inyectable para determinismo en tests)
}

/** Identificador determinista del item de histórico (replay ⇒ mismo id ⇒ no duplica). */
export function idTransicion(
  expedienteId: string,
  estadoNuevo: EstadoExpediente,
  motivo: MotivoTransicion,
  fechaISO: string,
  sufijo?: string,
): string {
  const dia = (fechaISO || '').slice(0, 10).replace(/-/g, '');
  // El sufijo (importes/evidencia) separa dos hechos distintos del mismo día sin
  // reescribir el anterior: el histórico es append-only y el id debe ser único.
  const base = `${expedienteId}|${estadoNuevo}|${motivo}|${dia}${sufijo ? '|' + sufijo : ''}`
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, '_');
  return `trn_${simpleHash(base).toString(16).padStart(8, '0')}`;
}

/** FNV-1a (mismo espíritu que `hashCorto` de GAP1; sin dependencias externas). */
export function simpleHash(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Sufijo del identificador: separa dos transiciones del mismo estado/día cuando
 * cambian los importes o la evidencia asociada (p. ej. dos pagos parciales el mismo día).
 */
export function sufijoTransicion(e: EntradaTransicion): string {
  const montos = `${redondear2(e.importeTotalAntes)}>${redondear2(e.importeTotalDespues)}`;
  return e.evidenciaId ? `${montos}#${e.evidenciaId}` : montos;
}

/** Construye el item append-only de histórico (NUNCA reescribe el anterior). */
export function construirTransicion(e: EntradaTransicion): TransicionExpediente {
  const fecha = e.fecha || new Date().toISOString();
  return {
    id: idTransicion(e.expedienteId, e.estadoNuevo, e.motivo, fecha, sufijoTransicion(e)),
    expedienteId: e.expedienteId,
    propietarioId: e.propietarioId,
    fecha,
    estadoAnterior: e.estadoAnterior,
    estadoNuevo: e.estadoNuevo,
    motivo: e.motivo,
    observaciones: e.observaciones,
    actorId: e.actorId,
    actorNombre: e.actorNombre,
    evidenciaId: e.evidenciaId,
    importeTotalAntes: redondear2(e.importeTotalAntes),
    importeTotalDespues: redondear2(e.importeTotalDespues),
  };
}

export function redondear2(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

// ==========================================================================
// INTERPRETABILIDAD (mapa maestro §6.3 — capa transversal de ayuda/IA)
// ==========================================================================

export interface EstadoInterpretable {
  estado: EstadoExpediente;
  etiqueta: string;
  terminal: boolean;
  transicionesPermitidas: EstadoExpediente[];
  accionesHabilitadas: string[];
  requiereAtencion: boolean;
}

const ACCIONES_POR_ESTADO: Record<EstadoExpediente, string[]> = {
  DETECTADA: ['registrar_comunicacion', 'asignar_politica', 'cerrar'],
  PENDIENTE_CONTACTO: ['registrar_comunicacion', 'registrar_llamada', 'iniciar_reclamacion', 'cerrar'],
  RECLAMACION_INICIADA: ['registrar_comunicacion', 'registrar_compromiso', 'escalar_aseguradora', 'derivar_juridico', 'cerrar'],
  EN_RECOBRO: ['registrar_comunicacion', 'registrar_compromiso', 'registrar_pago', 'escalar_aseguradora', 'derivar_juridico', 'cerrar'],
  COMPROMISO_PAGO: ['registrar_pago', 'registrar_comunicacion', 'incumplir_compromiso', 'cerrar'],
  PAGO_PARCIAL: ['registrar_pago', 'registrar_comunicacion', 'registrar_compromiso', 'escalar_aseguradora', 'derivar_juridico', 'cerrar'],
  COMPROMISO_INCUMPLIDO: ['registrar_comunicacion', 'nuevo_compromiso', 'escalar_aseguradora', 'derivar_juridico', 'cerrar'],
  PAGADA: ['cerrar'],
  ESCALADA: ['registrar_comunicacion', 'derivar_juridico', 'registrar_pago', 'cerrar'],
  JURIDICA: ['registrar_actuacion', 'registrar_pago', 'cerrar'],
  CERRADA: ['reabrir'],
};

/** Expone el estado del expediente en forma interpretable (sin inventar datos). */
export function describirEstado(expediente: Pick<ExpedienteMorosidad, 'estado' | 'saldoPendiente' | 'proximaAccionFecha'>): EstadoInterpretable {
  const estado = expediente.estado;
  return {
    estado,
    etiqueta: ESTADO_EXPEDIENTE_LABELS[estado] || estado,
    terminal: esEstadoTerminal(estado),
    transicionesPermitidas: TRANSICIONES_MOROSIDAD[estado] || [],
    accionesHabilitadas: ACCIONES_POR_ESTADO[estado] || [],
    requiereAtencion:
      Number(expediente.saldoPendiente || 0) > 0 &&
      estado !== 'PAGADA' &&
      estado !== 'CERRADA' &&
      (!expediente.proximaAccionFecha ||
        expediente.proximaAccionFecha <= new Date().toISOString().slice(0, 10)),
  };
}
