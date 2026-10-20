/**
 * P7 · Presentación trazable del expediente de seguro de impago.
 *
 * Un expediente puede contener tres cosas muy distintas y la interfaz no debe
 * confundirlas:
 *   1. Cálculos locales del gestor (ratio de esfuerzo, estimación de solvencia).
 *   2. Una LECTURA AUTOMÁTICA (IA) del correo recibido de la aseguradora.
 *   3. La decisión humana del propietario.
 *
 * Nada de lo anterior es un dictamen oficial de la aseguradora. Estas funciones
 * puras fijan las etiquetas y el tono que usan el listado y el detalle del
 * expediente, para que ambos cuenten lo mismo y no se anuncie un éxito que no
 * ha ocurrido.
 */
import type {
  DecisionFinalPropietarioSeguro,
  SolicitudSeguroEstado,
  SolicitudSeguroImpago,
} from '../types';

/** Valores de decisión que llegaron a persistirse con etiquetas de interfaz. */
const DECISIONES_HEREDADAS: Record<string, DecisionFinalPropietarioSeguro> = {
  ACEPTADO: 'ACEPTAR_CANDIDATO',
  CONDICIONADO_AVAL: 'SOLICITAR_AVAL_EXTRA',
  RECHAZADO: 'RECHAZAR_CANDIDATO',
};

/**
 * Normaliza la decisión humana guardada al contrato declarado. Evita que un
 * expediente antiguo quede con un estado que ninguna parte del sistema sabe
 * interpretar.
 */
export function normalizarDecisionPropietarioSeguro(
  valor: unknown,
): DecisionFinalPropietarioSeguro {
  if (typeof valor !== 'string') return 'PENDIENTE';
  if (valor in DECISIONES_HEREDADAS) return DECISIONES_HEREDADAS[valor];
  const permitidas: DecisionFinalPropietarioSeguro[] = [
    'PENDIENTE',
    'ACEPTAR_CANDIDATO',
    'SOLICITAR_AVAL_EXTRA',
    'RECHAZAR_CANDIDATO',
    'TRAMITAR_OTRA_ASEGURADORA',
  ];
  return permitidas.includes(valor as DecisionFinalPropietarioSeguro)
    ? (valor as DecisionFinalPropietarioSeguro)
    : 'PENDIENTE';
}

export type TonoEstadoSeguro = 'exito' | 'error' | 'revision' | 'neutro' | 'informativo';

export interface EstadoSeguroPresentado {
  etiqueta: string;
  descripcion: string;
  tono: TonoEstadoSeguro;
  requiereRevisionHumana: boolean;
}

/** Traduce el estado persistido a un mensaje que no afirme más de lo ocurrido. */
export function presentarEstadoSolicitudSeguro(
  estado: SolicitudSeguroEstado,
): EstadoSeguroPresentado {
  switch (estado) {
    case 'BORRADOR':
      return {
        etiqueta: 'Borrador',
        descripcion: 'Sin envío confirmado por el servicio de correo.',
        tono: 'neutro',
        requiereRevisionHumana: false,
      };
    case 'CORREO_ENVIADO':
      return {
        etiqueta: 'Correo enviado',
        descripcion: 'Envío confirmado por el servicio de correo con identificador de mensaje.',
        tono: 'exito',
        requiereRevisionHumana: false,
      };
    case 'SOLICITUD_PENDIENTE':
      return {
        etiqueta: 'Esperando respuesta',
        descripcion: 'Solicitud enviada; todavía no hay respuesta de la aseguradora.',
        tono: 'neutro',
        requiereRevisionHumana: false,
      };
    case 'RESPUESTA_RECIBIDA':
      return {
        etiqueta: 'Respuesta recibida',
        descripcion: 'La respuesta está registrada pero aún no se ha analizado.',
        tono: 'informativo',
        requiereRevisionHumana: true,
      };
    case 'RESPUESTA_PROCESADA':
      return {
        etiqueta: 'Respuesta analizada',
        descripcion: 'Lectura automática completada; requiere validación humana antes de decidir.',
        tono: 'informativo',
        requiereRevisionHumana: true,
      };
    case 'ERROR_PROCESAMIENTO':
      return {
        etiqueta: 'Revisión humana pendiente',
        descripcion: 'No se pudo analizar automáticamente; el texto original se conserva.',
        tono: 'revision',
        requiereRevisionHumana: true,
      };
    case 'CANCELADA':
      return {
        etiqueta: 'Cancelada',
        descripcion: 'Expediente cancelado; no se realizarán más envíos.',
        tono: 'neutro',
        requiereRevisionHumana: false,
      };
    default:
      return {
        etiqueta: 'Estado desconocido',
        descripcion: 'Estado no reconocido; revisar el expediente.',
        tono: 'revision',
        requiereRevisionHumana: true,
      };
  }
}

export type OrigenDictamenSeguro =
  | 'RESPUESTA_SIN_ANALIZAR'
  | 'EN_TRAMITE'
  | 'LECTURA_IA'
  | 'PENDIENTE_REVISION_HUMANA';

export interface DictamenPresentado {
  origen: OrigenDictamenSeguro;
  etiqueta: string;
  descripcion: string;
  tono: TonoEstadoSeguro;
  /** Nunca `true`: la aplicación no emite dictámenes oficiales de aseguradoras. */
  esDictamenOficial: false;
  requiereRevisionHumana: boolean;
}

type DatosDictamen = Pick<
  SolicitudSeguroImpago,
  'estado' | 'procesadoConIA' | 'emailRespuestaRaw' | 'dictamenAseguradora' | 'dictamenTexto'
>;

/**
 * Describe el origen del dictamen mostrado. La lectura de la IA se presenta
 * como lectura automática del correo, no como dictamen de la aseguradora.
 */
export function presentarDictamenSeguro(solicitud: DatosDictamen): DictamenPresentado {
  const textoRespuesta = (solicitud.emailRespuestaRaw || '').trim();

  if (solicitud.procesadoConIA) {
    const valor = solicitud.dictamenTexto?.trim() || solicitud.dictamenAseguradora;
    return {
      origen: 'LECTURA_IA',
      etiqueta: `Lectura IA · ${valor}`,
      descripcion:
        'Extracción automática del correo recibido. No es un dictamen oficial ni un certificado de la aseguradora: requiere validación humana.',
      tono: 'informativo',
      esDictamenOficial: false,
      requiereRevisionHumana: true,
    };
  }

  if (solicitud.estado === 'ERROR_PROCESAMIENTO' || textoRespuesta.length > 0) {
    return {
      origen: 'PENDIENTE_REVISION_HUMANA',
      etiqueta: 'Pendiente de revisión humana',
      descripcion: textoRespuesta
        ? 'Hay una respuesta conservada sin análisis automático válido. Debe revisarla una persona.'
        : 'El expediente quedó marcado como error de procesamiento y no tiene respuesta conservada.',
      tono: 'revision',
      esDictamenOficial: false,
      requiereRevisionHumana: true,
    };
  }

  if (solicitud.estado === 'RESPUESTA_RECIBIDA') {
    return {
      origen: 'RESPUESTA_SIN_ANALIZAR',
      etiqueta: 'Respuesta recibida sin analizar',
      descripcion: 'La respuesta está registrada, pero todavía no se ha extraído ningún dato.',
      tono: 'informativo',
      esDictamenOficial: false,
      requiereRevisionHumana: true,
    };
  }

  return {
    origen: 'EN_TRAMITE',
    etiqueta: solicitud.dictamenAseguradora === 'EN_ESTUDIO' ? 'En estudio' : 'Sin respuesta',
    descripcion: 'Todavía no hay dictamen de la aseguradora registrado en el expediente.',
    tono: 'neutro',
    esDictamenOficial: false,
    requiereRevisionHumana: false,
  };
}

/** Clases Tailwind del tono, para que listado y detalle usen la misma paleta. */
export function clasesTonoEstadoSeguro(tono: TonoEstadoSeguro): string {
  switch (tono) {
    case 'exito':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'error':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    case 'revision':
      return 'bg-amber-100 text-amber-900 border-amber-300';
    case 'informativo':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}
