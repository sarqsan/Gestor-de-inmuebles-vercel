/**
 * AG-06 · Sincronización de la actualización de renta con los recibos futuros.
 *
 * PROBLEMA QUE RESUELVE
 * `generarPeriodosParaContrato` conserva intactos los periodos ya materializados
 * y solo aplica `contrato.rentaMensual` a los nuevos. Como el motor materializa
 * hasta el mes actual + 2, al confirmar una subida los recibos de los próximos
 * meses seguían con el importe anterior: el propietario veía recibos de 900 €
 * para meses en los que el contrato ya decía 950 €.
 *
 * REGLA ECONÓMICA (no negociable)
 * Solo se actualiza un recibo que cumpla TODAS estas condiciones:
 *   1. `estado === 'PENDIENTE'`.
 *   2. `importeRecibido === 0`.
 *   3. El periodo NO ha empezado: la fecha efectiva es anterior o igual al
 *      primer día del mes del periodo.
 *
 * Nunca se toca un recibo cobrado, parcial, retrasado, reclamado, anulado ni
 * histórico. Un `RETRASADO` es una deuda ya reclamada al inquilino: cambiarle
 * el importe automáticamente alteraría lo que se le está pidiendo. Un periodo
 * ya iniciado queda fuera por la misma razón, aunque siga en `PENDIENTE`.
 *
 * El importe aplicado es la renta NUEVA del contrato, no un incremento sobre el
 * importe del recibo: si alguien ajustó a mano un recibo, ese ajuste no se
 * arrastra a la subida.
 */

/** Mínimo estructural del recibo que necesita este motor. */
export interface ReciboActualizable {
  id: string;
  periodoMesAnio: string;
  importePrevisto: number;
  importeRecibido?: number;
  estado: string;
  historialCambios?: readonly unknown[];
}

export interface ParametrosSincronizacionRenta {
  /** Renta nueva ya confirmada (la que se escribe en el contrato). */
  rentaNueva: number;
  /** Renta que tenía el contrato antes de la actualización. */
  rentaAnterior: number;
  /**
   * Fecha efectiva (`YYYY-MM-DD`). Los periodos anteriores a su mes quedan
   * fuera; el mes de la fecha efectiva y los siguientes son actualizables.
   */
  fechaEfectividad: string;
  /** Actor que confirma la operación, para la traza del recibo. */
  usuarioId: string;
  usuarioNombre: string;
  /** Marca temporal de la modificación (`ISO`). */
  ahora: string;
  /** Identificador estable de la operación; se usa para no duplicar la traza. */
  idempotencyKeyHash: string;
}

export interface CambioReciboRenta {
  reciboId: string;
  periodoMesAnio: string;
  importeAnterior: number;
  importeNuevo: number;
}

export interface ResultadoSincronizacionRenta<T extends ReciboActualizable> {
  /** Recibos resultantes, en el mismo orden. Inmutable: no muta la entrada. */
  recibos: T[];
  /** Solo los que cambiaron, para auditoría y para la respuesta. */
  cambios: CambioReciboRenta[];
  /** Motivos por los que un periodo NO se actualizó (no es un error). */
  omitidos: Array<{ reciboId: string; periodoMesAnio: string; motivo: MotivoOmisionRecibo }>;
}

export type MotivoOmisionRecibo =
  | 'ESTADO_NO_PENDIENTE'
  | 'YA_COBRADO'
  | 'PERIODO_INICIADO'
  | 'ANTERIOR_A_EFECTIVIDAD'
  | 'IMPORTE_YA_ACTUALIZADO'
  | 'SIN_PERIODO_VALIDO';

/** `NOTA` del historial: la usa el contrato para trazar el cambio económico. */
export const ACCION_HISTORIAL_ACTUALIZACION_RENTA = 'ACTUALIZACION_RENTA_IMPORTE_PREVISTO';

const PERIODO_RE = /^(\d{4})-(\d{2})$/;

/** Primer día del mes del periodo, o `null` si el periodo no es válido. */
export function inicioDelPeriodo(periodoMesAnio: string): string | null {
  const coincidencia = PERIODO_RE.exec(String(periodoMesAnio ?? ''));
  if (!coincidencia) return null;
  const mes = Number(coincidencia[2]);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  return `${coincidencia[1]}-${coincidencia[2]}-01`;
}

/**
 * Decide si un recibo concreto puede actualizarse y por qué no.
 * Devuelve `null` cuando SÍ procede.
 *
 * Se expone para poder explicar cada omisión sin depender de que la operación
 * se haya ejecutado: la respuesta y la auditoría se construyen con el mismo
 * criterio que la escritura.
 */
export function motivoNoActualizable(
  recibo: ReciboActualizable,
  fechaEfectividad: string,
  rentaNueva: number,
): MotivoOmisionRecibo | null {
  const inicio = inicioDelPeriodo(recibo.periodoMesAnio);
  if (!inicio) return 'SIN_PERIODO_VALIDO';

  // El estado manda: ningún recibo que no esté PENDIENTE se toca, sea cual sea
  // su importe recibido. Comprobarlo primero evita que una futura relajación de
  // la regla de importes alcance a un recibo ya cobrado.
  if (recibo.estado !== 'PENDIENTE') return 'ESTADO_NO_PENDIENTE';
  if ((recibo.importeRecibido ?? 0) !== 0) return 'YA_COBRADO';

  // Un periodo ya empezado no se reabre aunque siga pendiente.
  if (inicio <= fechaEfectividad) return 'PERIODO_INICIADO';

  // La subida aplica desde el primer periodo cuya fecha de inicio sea igual o
  // posterior a la efectiva. `inicio > fechaEfectividad` ya lo garantiza; este
  // segundo control es explícito para que la regla no dependa del formato.
  if (inicio < fechaEfectividad) return 'ANTERIOR_A_EFECTIVIDAD';

  if (Number(recibo.importePrevisto) === rentaNueva) return 'IMPORTE_YA_ACTUALIZADO';
  return null;
}

/**
 * Aplica la nueva renta a los recibos que procede y deja traza en cada uno.
 * Función pura: no muta la entrada y es idempotente respecto a la traza.
 */
export function sincronizarImportesPrevistos<T extends ReciboActualizable>(
  recibos: readonly T[],
  params: ParametrosSincronizacionRenta,
): ResultadoSincronizacionRenta<T> {
  const cambios: CambioReciboRenta[] = [];
  const omitidos: Array<{ reciboId: string; periodoMesAnio: string; motivo: MotivoOmisionRecibo }> = [];

  const resultantes = recibos.map((recibo) => {
    const motivo = motivoNoActualizable(recibo, params.fechaEfectividad, params.rentaNueva);
    if (motivo) {
      omitidos.push({ reciboId: recibo.id, periodoMesAnio: recibo.periodoMesAnio, motivo });
      return recibo;
    }

    const importeAnterior = Number(recibo.importePrevisto);
    cambios.push({
      reciboId: recibo.id,
      periodoMesAnio: recibo.periodoMesAnio,
      importeAnterior,
      importeNuevo: params.rentaNueva,
    });

    const historialPrevio = Array.isArray(recibo.historialCambios) ? recibo.historialCambios : [];
    // La entrada de traza lleva la clave de idempotencia: un reintento que
    // llegara a reconstruir el recibo no añade una segunda entrada idéntica.
    const entrada = {
      id: `hist_renta_${params.idempotencyKeyHash}_${recibo.id}`,
      fecha: params.ahora,
      usuarioId: params.usuarioId,
      usuarioNombre: params.usuarioNombre,
      accion: ACCION_HISTORIAL_ACTUALIZACION_RENTA,
      detalles: `Actualización de renta: ${importeAnterior} € → ${params.rentaNueva} € `
        + `(efectiva desde ${params.fechaEfectividad}; renta anterior del contrato ${params.rentaAnterior} €)`,
      importeAnterior,
      importeNuevo: params.rentaNueva,
    };
    const yaTrazado = historialPrevio.some(
      (item) => (item as { id?: unknown })?.id === entrada.id,
    );

    return {
      ...recibo,
      importePrevisto: params.rentaNueva,
      historialCambios: yaTrazado ? [...historialPrevio] : [...historialPrevio, entrada],
    } as T;
  });

  return { recibos: resultantes, cambios, omitidos };
}

/**
 * Documento de `audit_logs` para la operación. Reutiliza el esquema existente
 * (`AuditLog`) y la colección que ya usan los demás servicios: no se crea un
 * sistema de auditoría paralelo.
 */
export function documentoAuditoriaSincronizacionRenta(params: {
  cambios: readonly CambioReciboRenta[];
  omitidos: ResultadoSincronizacionRenta<ReciboActualizable>['omitidos'];
  contratoId: string;
  inmuebleId?: string;
  propietarioId?: string;
  rentaAnterior: number;
  rentaNueva: number;
  fechaEfectividad: string;
  anexoId: string;
  actor: { uid: string; usuarioId: string; email: string; nombre: string };
  ahora: string;
  idempotencyKeyHash: string;
}): { id: string; datos: Record<string, unknown> } {
  const id = `audit_renta_${params.contratoId}_${params.idempotencyKeyHash}`;
  return {
    id,
    datos: {
      id,
      usuarioId: params.actor.usuarioId,
      usuarioEmail: params.actor.email,
      usuarioNombre: params.actor.nombre,
      accion: 'ACTUALIZACION_RENTA_IMPORTES_PREVISTOS',
      descripcion: `Actualización de renta ${params.rentaAnterior} € → ${params.rentaNueva} €: `
        + `${params.cambios.length} recibo(s) futuro(s) pendiente(s) actualizado(s)`,
      fechaHora: params.ahora,
      auditadoEn: params.ahora,
      entidadAfectada: 'contrato',
      idAfectado: params.contratoId,
      resultado: 'EXITO',
      detalles: {
        contratoId: params.contratoId,
        inmuebleId: params.inmuebleId ?? null,
        propietarioId: params.propietarioId ?? null,
        anexoId: params.anexoId,
        idempotencyKeyHash: params.idempotencyKeyHash,
        actorUid: params.actor.uid,
        motivo: 'ACTUALIZACION_RENTA',
        fechaEfectividad: params.fechaEfectividad,
        rentaAnterior: params.rentaAnterior,
        rentaNueva: params.rentaNueva,
        recibosActualizados: params.cambios.map((cambio) => ({
          reciboId: cambio.reciboId,
          periodoMesAnio: cambio.periodoMesAnio,
          importeAnterior: cambio.importeAnterior,
          importeNuevo: cambio.importeNuevo,
        })),
        recibosOmitidos: params.omitidos.map((omitido) => ({
          reciboId: omitido.reciboId,
          periodoMesAnio: omitido.periodoMesAnio,
          motivo: omitido.motivo,
        })),
      },
    },
  };
}
