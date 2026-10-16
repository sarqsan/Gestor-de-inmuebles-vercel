/**
 * FASE A — RELOJ DE AVISOS (GAP 1)
 * ================================
 * El ERP era una SPA + funciones serverless **sin reloj**: «si pasa el día 5»
 * no se evaluaba solo. Este módulo es el motor del endpoint de cron protegido
 * (`/api/cron/avisos`): un único barrido diario, acotado e **idempotente**.
 *
 * Qué hace en cada pasada:
 *   1. **Pendientes de entrega**: notificaciones `PROGRAMADA` ya vencidas,
 *      `PENDIENTE` atascadas y `FALLIDA` con reintentos disponibles se
 *      reintentan por el dispatcher canónico (nunca por una vía paralela).
 *   2. **Regla del día 5** (decisión del 16-10-2026): por cada contrato con una
 *      mensualidad cuyo vencimiento ya pasó y sigue sin cobrarse, emite:
 *        · al INQUILINO → `cobro.retraso_pago` (recordatorio para que abone);
 *        · al PROPIETARIO → `cobro.renta_no_cobrada_propietario` (para que lo
 *          tenga en cuenta).
 *      La clave de idempotencia es determinista por (contrato, periodo), así que
 *      repetir el barrido el mismo día (o cualquier día) NO duplica ni reenvía.
 *
 * Garantías:
 *   · Nada se marca como cobrado: este módulo **no escribe** en contratos ni en
 *     cobros; solo avisa (la única vía de cobro sigue siendo
 *     `registrarPagoPeriodo`).
 *   · Sin transporte real, las notificaciones quedan `FALLIDA` con causa visible
 *     (modo seguro): jamás un falso «enviado».
 *   · Barrido acotado (`limiteColeccion`, por defecto 100 documentos por
 *     consulta) y con marca explícita de truncamiento si se alcanza el tope.
 */

import type { CobroPeriodo, ContratoFormalizacion } from '../../src/types.js';
import type { ContextoAutorizacion, Notificacion } from '../../src/types/notificaciones.js';
import { idempotenciaDeEvento } from '../../src/types/notificaciones.js';
import type { DispatcherNotificaciones } from '../../src/notificaciones/dispatcher.js';
import { MAX_REINTENTOS } from '../../src/notificaciones/dispatcher.js';
import { generarPeriodosParaContrato } from '../../src/utils/cobrosEngine.js';

export const COLECCION_CONTRATOS = 'contratos_formalizacion';
export const COLECCION_NOTIFICACIONES = 'notificaciones';
export const COLECCION_PROPIETARIOS = 'propietarios';

/** Tipos de evento usados por la regla del día 5. */
export const TIPO_EVENTO_INQUILINO_DIA5 = 'cobro.retraso_pago';
export const TIPO_EVENTO_PROPIETARIO_DIA5 = 'cobro.renta_no_cobrada_propietario';

/** Consulta acotada (la cumple `ClienteFirestoreRest`). */
export interface ConsultaAcotada {
  igualdades?: Array<[campo: string, valor: string]>;
  orden?: { campo: string; direccion: 'ASCENDING' | 'DESCENDING' };
  limite: number;
}

export interface PuertoRelojAvisos {
  consultarIgualdadesOrden(
    coleccion: string,
    consulta: ConsultaAcotada,
  ): Promise<Array<{ id: string; datos: Record<string, unknown> }>>;
  leerDocumento(ruta: string): Promise<{ datos: Record<string, unknown> } | null>;
}

export interface DependenciasRelojAvisos {
  ahora: Date;
  puerto: PuertoRelojAvisos;
  /** Fábrica del dispatcher canónico (misma que el endpoint; no hay vía paralela). */
  crearDispatcher: (contexto: ContextoAutorizacion) => DispatcherNotificaciones;
  /** Actor interno del reloj. Por defecto `SISTEMA` (alcance de administración). */
  contexto?: ContextoAutorizacion;
  /** Tope de documentos por consulta (1..100). Por defecto 100. */
  limiteColeccion?: number;
  /** Procedencia del disparo, solo para la traza del resumen. */
  origen?: string;
}

export type TipoDestinatarioAviso = 'INQUILINO' | 'PROPIETARIO';

export interface AvisoEmitido {
  destinatario: TipoDestinatarioAviso;
  contratoId: string;
  periodoId: string;
  periodoMesAnio: string;
  tipoEvento: string;
  notificacionId: string | null;
  estado: Notificacion['estado'] | null;
  entregada: boolean;
  duplicada: boolean;
  error?: string;
}

export interface AvisoNoEmitido {
  destinatario: TipoDestinatarioAviso;
  contratoId: string;
  periodoId: string;
  motivo: string;
}

export interface ResumenRelojAvisos {
  fecha: string;
  origen: string;
  pendientesProcesadas: number;
  pendientesEntregadas: number;
  pendientesFallidas: number;
  contratosRevisados: number;
  consultaTruncada: boolean;
  emitidos: AvisoEmitido[];
  noEmitidos: AvisoNoEmitido[];
  errores: string[];
}

function fechaHoyISO(ahora: Date): string {
  return ahora.toISOString().slice(0, 10);
}

function formatearImporte(valor: number): string {
  return `${(Number.isFinite(valor) ? valor : 0).toFixed(2)} €`;
}

function texto(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  return limpio.length ? limpio : undefined;
}

/**
 * Una mensualidad exige aviso del día 5 cuando su vencimiento ya pasó (el día 5
 * ha quedado atrás) y sigue sin cobrarse por completo.
 */
export function periodoExigeAvisoDia5(periodo: CobroPeriodo, ahora: Date): boolean {
  if (!periodo?.fechaVencimiento) return false;
  const pendiente = (Number(periodo.importePrevisto) || 0) - (Number(periodo.importeRecibido) || 0);
  if (pendiente <= 0.005) return false;
  if (periodo.estado === 'VERIFICADO') return false;
  const vencimiento = new Date(`${periodo.fechaVencimiento}T00:00:00`);
  if (Number.isNaN(vencimiento.getTime())) return false;
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  // Vencido: el día límite (p. ej. el 5) ya pasó ⇒ hoy es al menos el día 6.
  return vencimiento.getTime() < hoy.getTime();
}

/** Periodos de un contrato que exigen el aviso del día 5, del más antiguo al más reciente. */
export function periodosConAvisoDia5(contrato: ContratoFormalizacion, ahora: Date): CobroPeriodo[] {
  const periodos = generarPeriodosParaContrato(contrato);
  return periodos
    .filter((p) => periodoExigeAvisoDia5(p, ahora))
    .sort((a, b) => (a.fechaVencimiento < b.fechaVencimiento ? -1 : a.fechaVencimiento > b.fechaVencimiento ? 1 : 0));
}

interface Contacto {
  email?: string;
  nombre?: string;
}

async function contactoPropietario(
  puerto: PuertoRelojAvisos,
  contrato: ContratoFormalizacion,
  periodo: CobroPeriodo,
): Promise<Contacto> {
  const propietarioId = texto(periodo.propietarioId) || texto(contrato.propietarioId);
  if (propietarioId) {
    try {
      const doc = await puerto.leerDocumento(`${COLECCION_PROPIETARIOS}/${propietarioId}`);
      const email = texto(doc?.datos?.email);
      const nombre = texto(doc?.datos?.nombre);
      if (email) return { email, ...(nombre ? { nombre } : {}) };
    } catch {
      // Si la lectura falla, se intenta el contacto desnormalizado del contrato.
    }
  }
  return {
    ...(texto(contrato.propietarioEmail) ? { email: texto(contrato.propietarioEmail) } : {}),
    ...(texto(periodo.propietarioNombre) || texto(contrato.propietarioNombre)
      ? { nombre: texto(periodo.propietarioNombre) || texto(contrato.propietarioNombre) }
      : {}),
  };
}

/**
 * Ejecuta una pasada del reloj. NUNCA lanza: los fallos por aviso se acumulan en
 * `errores` y el resumen refleja exactamente lo que ocurrió.
 */
export async function ejecutarRelojAvisos(dependencias: DependenciasRelojAvisos): Promise<ResumenRelojAvisos> {
  const {
    ahora,
    puerto,
    crearDispatcher,
    contexto = { perfil: 'SISTEMA' },
    limiteColeccion = 100,
    origen = 'CRON',
  } = dependencias;
  const limite = Math.max(1, Math.min(100, limiteColeccion));
  const dispatcher = crearDispatcher(contexto);
  const resumen: ResumenRelojAvisos = {
    fecha: ahora.toISOString(),
    origen,
    pendientesProcesadas: 0,
    pendientesEntregadas: 0,
    pendientesFallidas: 0,
    contratosRevisados: 0,
    consultaTruncada: false,
    emitidos: [],
    noEmitidos: [],
    errores: [],
  };

  // -------------------------------------------------------------------------
  // 1) Notificaciones pendientes de entrega
  // -------------------------------------------------------------------------
  const estadosReintentables: Array<'PROGRAMADA' | 'PENDIENTE' | 'FALLIDA'> = ['PROGRAMADA', 'PENDIENTE', 'FALLIDA'];
  for (const estado of estadosReintentables) {
    let filas: Array<{ id: string; datos: Record<string, unknown> }> = [];
    try {
      filas = await puerto.consultarIgualdadesOrden(COLECCION_NOTIFICACIONES, {
        igualdades: [['estado', estado]],
        limite,
      });
      if (filas.length >= limite) resumen.consultaTruncada = true;
    } catch (err) {
      resumen.errores.push(`consulta_notificaciones_${estado}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    for (const fila of filas) {
      const notificacion = fila.datos as unknown as Notificacion;
      if (!notificacion?.id || !notificacion.estado) continue;
      if (estado === 'PROGRAMADA') {
        const cuando = notificacion.programarPara ? new Date(notificacion.programarPara).getTime() : 0;
        if (Number.isNaN(cuando) || cuando > ahora.getTime()) continue;
      }
      if (estado === 'FALLIDA' && (notificacion.intentos || 0) >= MAX_REINTENTOS) continue;

      resumen.pendientesProcesadas += 1;
      try {
        const resultado = await dispatcher.reintentar(notificacion);
        if (resultado.entregada) resumen.pendientesEntregadas += 1;
        else resumen.pendientesFallidas += 1;
      } catch (err) {
        resumen.pendientesFallidas += 1;
        resumen.errores.push(`reintento_${notificacion.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2) Regla del día 5 (inquilino + propietario)
  // -------------------------------------------------------------------------
  let contratos: Array<{ id: string; datos: Record<string, unknown> }> = [];
  try {
    contratos = await puerto.consultarIgualdadesOrden(COLECCION_CONTRATOS, { limite });
    if (contratos.length >= limite) resumen.consultaTruncada = true;
  } catch (err) {
    resumen.errores.push(`consulta_contratos: ${err instanceof Error ? err.message : String(err)}`);
    return resumen;
  }

  const fechaHoy = fechaHoyISO(ahora);

  for (const fila of contratos) {
    const contrato = fila.datos as unknown as ContratoFormalizacion;
    if (!contrato?.id && !fila.id) continue;
    const contratoId = texto(contrato.id) || fila.id;
    resumen.contratosRevisados += 1;

    let periodos: CobroPeriodo[] = [];
    try {
      periodos = periodosConAvisoDia5({ ...contrato, id: contratoId }, ahora);
    } catch (err) {
      resumen.errores.push(`periodos_${contratoId}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    for (const periodo of periodos) {
      const entidadId = `${contratoId}__${periodo.periodoMesAnio || periodo.id}`;
      const propietarioId = texto(periodo.propietarioId) || texto(contrato.propietarioId);
      const inmuebleId = texto(periodo.inmuebleId) || texto(contrato.inmuebleId);
      const inmuebleDireccion = texto(periodo.inmuebleDireccion) || texto(contrato.inmuebleDireccion) || 'Inmueble';
      const inquilinoNombre = texto(periodo.inquilinoNombre) || texto(contrato.candidatoNombre) || 'Inquilino';
      const importePendiente = (Number(periodo.importePrevisto) || 0) - (Number(periodo.importeRecibido) || 0);

      // (a) Inquilino: recordatorio para que abone.
      const emailInquilino = texto(periodo.inquilinoEmail) || texto(contrato.candidatoEmail);
      if (!emailInquilino) {
        resumen.noEmitidos.push({ destinatario: 'INQUILINO', contratoId, periodoId: periodo.id, motivo: 'sin_email_contacto' });
      } else {
        await emitirAviso({
          dispatcher,
          resumen,
          destinatario: 'INQUILINO',
          contratoId,
          periodo,
          inmuebleId,
          propietarioId,
          tipoEvento: TIPO_EVENTO_INQUILINO_DIA5,
          entidadId,
          contacto: { email: emailInquilino, nombre: inquilinoNombre },
          datos: {
            inmuebleDireccion,
            periodoMesAnio: periodo.periodoMesAnio || '',
            fechaHoy,
            fechaVencimiento: periodo.fechaVencimiento || '',
            diaVencimiento: periodo.fechaVencimiento || '',
            importePrevisto: formatearImporte(importePendiente),
          },
        });
      }

      // (b) Propietario: renta no cobrada.
      const contacto = await contactoPropietario(puerto, contrato, periodo);
      if (!contacto.email) {
        resumen.noEmitidos.push({ destinatario: 'PROPIETARIO', contratoId, periodoId: periodo.id, motivo: 'sin_email_contacto' });
      } else {
        await emitirAviso({
          dispatcher,
          resumen,
          destinatario: 'PROPIETARIO',
          contratoId,
          periodo,
          inmuebleId,
          propietarioId,
          tipoEvento: TIPO_EVENTO_PROPIETARIO_DIA5,
          entidadId,
          contacto: { email: contacto.email, nombre: contacto.nombre || 'Propietario' },
          datos: {
            inmuebleDireccion,
            periodoMesAnio: periodo.periodoMesAnio || '',
            fechaHoy,
            fechaVencimiento: periodo.fechaVencimiento || '',
            inquilinoNombre,
            importePrevisto: formatearImporte(importePendiente),
          },
        });
      }
    }
  }

  return resumen;
}

async function emitirAviso(opciones: {
  dispatcher: DispatcherNotificaciones;
  resumen: ResumenRelojAvisos;
  destinatario: TipoDestinatarioAviso;
  contratoId: string;
  periodo: CobroPeriodo;
  inmuebleId?: string;
  propietarioId?: string;
  tipoEvento: string;
  entidadId: string;
  contacto: Contacto;
  datos: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const {
    dispatcher,
    resumen,
    destinatario,
    contratoId,
    periodo,
    inmuebleId,
    propietarioId,
    tipoEvento,
    entidadId,
    contacto,
    datos,
  } = opciones;

  try {
    const resultado = await dispatcher.dispatch({
      origen: 'COBRO',
      tipoEvento,
      entidadId,
      idempotencyKey: idempotenciaDeEvento('COBRO', tipoEvento, entidadId),
      ...(inmuebleId ? { inmuebleId } : {}),
      ...(propietarioId ? { propietarioId } : {}),
      datos,
      destinatario: { ...contacto },
    });
    resumen.emitidos.push({
      destinatario,
      contratoId,
      periodoId: periodo.id,
      periodoMesAnio: periodo.periodoMesAnio || '',
      tipoEvento,
      notificacionId: resultado.notificacion?.id ?? null,
      estado: resultado.estado ?? resultado.notificacion?.estado ?? null,
      entregada: Boolean(resultado.entregada),
      duplicada: Boolean(resultado.duplicada),
      ...(resultado.error ? { error: resultado.error } : {}),
    });
  } catch (err) {
    resumen.errores.push(`${destinatario}_${contratoId}_${periodo.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
