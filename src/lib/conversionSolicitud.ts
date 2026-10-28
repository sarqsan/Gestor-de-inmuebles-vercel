/**
 * P0.2.7 — Conversión EXPLÍCITA de solicitud → candidato.
 * ===========================================================================
 * Antes la conversión era implícita: el alta pública creaba un candidato "por
 * su cuenta" y, si fallaba, no había forma de saber que la solicitud seguía
 * pendiente de convertir. Este módulo separa las dos decisiones:
 *
 *  · `planificarConversionSolicitud` es PURA: decide si procede y construye el
 *    candidato + la traza de la solicitud. No escribe nada.
 *  · El llamador persiste candidato y solicitud; si el candidato falla, la
 *    solicitud se marca `CONVERSION_PENDIENTE` con el motivo, para que siga
 *    visible en la bandeja y se pueda reintentar.
 *
 * Nunca confirma pagos ni contabiliza cobros (exclusión permanente D1).
 */
import type { Candidato, SolicitudAlquiler, SolicitudHistorialItem } from '../types';

export interface ResultadoConversion {
  readonly procede: boolean;
  readonly motivo?: string;
  readonly candidato?: Candidato;
  readonly solicitud?: SolicitudAlquiler;
}

export interface OpcionesConversion {
  /** Reloj inyectable para trazas deterministas. */
  ahora?: () => Date;
  /** Id del candidato (por defecto, el de la solicitud). */
  candidatoId?: string;
}

function traza(
  accion: string,
  detalle: string,
  fecha: string,
  sufijo: string,
): SolicitudHistorialItem {
  return {
    id: `h-conv-${sufijo}`,
    fecha,
    accion,
    detalle,
  } as SolicitudHistorialItem;
}

/**
 * Planifica la conversión. Si la solicitud ya está cancelada o no tiene
 * identidad mínima, no procede. La traza usa `append-only` sobre el historial
 * existente (nunca lo sustituye).
 */
export function planificarConversionSolicitud(
  solicitud: SolicitudAlquiler,
  candidatosExistentes: readonly Candidato[] = [],
  opciones: OpcionesConversion = {},
): ResultadoConversion {
  const ahora = (opciones.ahora ?? (() => new Date()))().toISOString();
  const sufijo = ahora.replace(/\D/g, '').slice(0, 17);

  if (solicitud.estado === 'CANCELADA' || solicitud.estado === 'NO SELECCIONADO') {
    return { procede: false, motivo: 'La solicitud está descartada o cancelada.' };
  }
  const nombre = String(solicitud.candidatoNombre || '').trim();
  const email = String(solicitud.candidatoEmail || '').trim().toLowerCase();
  if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      procede: false,
      motivo: 'Faltan nombre o correo válidos del candidato.',
      solicitud: {
        ...solicitud,
        observacionesOwner: 'CONVERSION_PENDIENTE: identidad incompleta.',
        historial: [
          traza('Conversión pendiente', 'No se pudo convertir: identidad incompleta.', ahora, sufijo),
          ...(solicitud.historial || []),
        ],
        fechaActualizacion: ahora,
      },
    };
  }
  const duplicado = candidatosExistentes.find(
    (c) => String(c.email || '').trim().toLowerCase() === email && c.inmuebleId === solicitud.inmuebleId,
  );
  if (duplicado) {
    return {
      procede: false,
      motivo: 'Ya existe un candidato con ese correo para el inmueble.',
      solicitud: {
        ...solicitud,
        estado: 'EN ANÁLISIS',
        observacionesOwner: `Vinculado al candidato existente ${duplicado.id}.`,
        historial: [
          traza('Conversión reutilizada', `Vinculada al candidato existente ${duplicado.id}.`, ahora, sufijo),
          ...(solicitud.historial || []),
        ],
        fechaActualizacion: ahora,
      },
    };
  }

  const candidato: Candidato = {
    id: opciones.candidatoId || solicitud.candidatoId || `cand-${sufijo}`,
    nombre,
    email,
    telefono: String(solicitud.candidatoTelefono || ''),
    inmuebleId: solicitud.inmuebleId,
    inmuebleNombre: solicitud.inmuebleNombre,
    numPersonas: solicitud.numTotalPersonas ?? 1,
    ingresosNetos: solicitud.ingresosNetosMensuales ?? 0,
    tipoEmpleo: (solicitud.situacionLaboral || 'estudiante_otro') as Candidato['tipoEmpleo'],
    tipoContrato: (solicitud.tipoContrato || 'no_aplica') as Candidato['tipoContrato'],
    antiguedadLaboral: solicitud.antiguedadLaboral || 'No especificada',
    otrosIngresos: solicitud.otrosIngresos ?? 0,
    avalista: Boolean(solicitud.tieneAvalista),
    observaciones: `Convertido explícitamente desde la solicitud ${solicitud.id}.`,
    estado: 'nuevo',
    fechaCreacion: ahora.slice(0, 10),
    documentos: (solicitud.documentos || []) as Candidato['documentos'],
    scoreEstimado: solicitud.scoreSolvencia,
  };

  return {
    procede: true,
    candidato,
    solicitud: {
      ...solicitud,
      candidatoId: candidato.id,
      estado: 'EN ANÁLISIS',
      observacionesOwner: `Convertida a candidato ${candidato.id}.`,
      historial: [
        traza('Conversión a candidato', `Candidato ${candidato.id} creado desde la solicitud.`, ahora, sufijo),
        ...(solicitud.historial || []),
      ],
      fechaActualizacion: ahora,
    },
  };
}

/** Marca una solicitud cuya conversión falló, sin perderla de la bandeja. */
export function marcarConversionFallida(
  solicitud: SolicitudAlquiler,
  error: unknown,
  ahora = new Date().toISOString(),
): SolicitudAlquiler {
  const motivo = error instanceof Error ? error.message : 'Error desconocido';
  return {
    ...solicitud,
    observacionesOwner: `CONVERSION_PENDIENTE: ${motivo}`.slice(0, 500),
    historial: [
      traza('Conversión pendiente', `El candidato no se pudo guardar: ${motivo}`.slice(0, 500), ahora, ahora.replace(/\D/g, '').slice(0, 17)),
      ...(solicitud.historial || []),
    ],
    fechaActualizacion: ahora,
  };
}
