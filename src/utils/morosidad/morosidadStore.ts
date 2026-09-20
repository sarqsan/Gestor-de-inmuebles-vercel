/**
 * BLOQUE C — Orquestador de morosidad (caso de uso).
 * -------------------------------------------------------------------------
 * Capa de aplicación con I/O **inyectado** (`RepositorioMorosidad`): el motor de
 * negocio sigue siendo puro y testeable sin Firebase, y la persistencia real la
 * aporta `src/lib/morosidadFirestore.ts`.
 *
 * Garantías:
 *  - idempotencia total: abrir, re-detectar, re-comunicar o re-escalar es inocuo
 *    (ids deterministas + clave de idempotencia GAP 1);
 *  - histórico append-only: todo cambio de estado genera un documento propio en
 *    `expedientes_morosidad_hist`, que nunca se reescribe;
 *  - CERO escritura en cobros: la única vía para «registrar un pago» es
 *    `cobrosEngine.registrarPagoPeriodo` (interfaz oficial, compartida con GAP 6
 *    y con el BLOQUE B). Nunca se marca «pagado» a mano en el expediente.
 */

import type { CobroPeriodo, ContratoFormalizacion, UsuarioApp } from '../../types';
import type {
  CompromisoPago,
  ComunicacionExpediente,
  EvidenciaMorosidad,
  ExpedienteMorosidad,
  ModuloImporteJuridico,
  MotivoTransicion,
  PoliticaMorosidad,
  TransicionExpediente,
} from '../../types/morosidad';
import { registrarPagoPeriodo } from '../cobrosEngine';
import {
  aplicarTransicionEnExpediente,
  calcularProximaAccion,
  construirComunicacion,
  construirExpediente,
  crearEvidencia,
  detectarDeudasContrato,
  fechaHoyISO,
  registrarComunicacionExterna,
  resolverPolitica,
  sincronizarExpediente,
  tieneRequerimientoFehaciente,
  TOLERANCIA_CENTIMOS,
} from './morosidadEngine';
import { evaluarEscalado, generarPlanRecobro } from './dunningPolicy';
import {
  aplicarCobrosAlCompromiso,
  crearCompromiso,
  revisarVencimientos,
} from './compromisos';
import {
  abrirExpedienteAseguradora,
  construirConceptoIntereses,
  prepararExpedienteJuridico,
  totalConceptosJuridicos,
} from './legalAmounts';
import { construirEventoMorosidad, TIPO_EVENTO_MOROSIDAD, type EventoMorosidad } from './eventos';

/** Clave GAP 1 → evento de recobro (inverso de `TIPO_EVENTO_MOROSIDAD`). */
export const EVENTO_POR_TIPO_EVENTO: Record<string, EventoMorosidad> = Object.fromEntries(
  (Object.entries(TIPO_EVENTO_MOROSIDAD) as [EventoMorosidad, string][]).map(([ev, clave]) => [clave, ev]),
);
import {
  despacharEventoMorosidadPorGAP1,
  type ContextoDestinatarios,
  type DispatcherContexto,
  type ResultadoPuenteGAP1,
} from './puenteGAP1';
import { redondear2 } from './morosidadEstados';

export interface RepositorioMorosidad {
  leerExpediente(id: string): Promise<ExpedienteMorosidad | null>;
  listarExpedientes(): Promise<ExpedienteMorosidad[]>;
  guardarExpediente(exp: ExpedienteMorosidad): Promise<void>;
  appendHistorial(t: TransicionExpediente): Promise<void>;
  /** Lectura del histórico append-only (opcional: la UI la usa para el detalle). */
  listarHistorial?(expedienteId: string): Promise<TransicionExpediente[]>;
  listarEvidencias?(expedienteId: string): Promise<EvidenciaMorosidad[]>;
  guardarCompromiso(c: CompromisoPago): Promise<void>;
  listarCompromisos(expedienteId: string): Promise<CompromisoPago[]>;
  appendEvidencia(e: EvidenciaMorosidad): Promise<void>;
  listarPoliticas(): Promise<PoliticaMorosidad[]>;
  /** Cobros canónicos del contrato (leídos de `contratos_formalizacion`). */
  listarCobrosContrato(contratoId: string): Promise<CobroPeriodo[]>;
  /** Persiste el contrato actualizado por la vía oficial (registrarPagoPeriodo). */
  guardarContrato(c: ContratoFormalizacion): Promise<void>;
  /** Referencias de liquidaciones del BLOQUE B que incluyen alguno de los cobros. */
  listarLiquidacionesPorCobros?(cobroIds: string[]): Promise<{ id: string; periodo: string; estado: string; cobroIds: string[] }[]>;
  /** Publicación de auditoría (audit_logs canónico). */
  auditar(accion: string, descripcion: string, detalles: Record<string, unknown>): Promise<void>;
}

/**
 * Append del item de histórico con tolerancia a colisión de id (dos hechos
 * equivalentes el mismo día). El histórico es append-only y las reglas §33
 * deniegan el update: si el id ya existe se reescribe la firma con un sufijo
 * de ocurrencia, sin tocar nunca la transición anterior.
 */
async function appendSeguro(ctx: ContextoCaso, t: TransicionExpediente): Promise<void> {
  try {
    await ctx.repositorio.appendHistorial(t);
  } catch {
    await ctx.repositorio.appendHistorial({ ...t, id: `${t.id}x2` }).catch(() => undefined);
  }
}

export interface Actor {
  id?: string;
  nombre?: string;
  email?: string;
}

export interface ContextoCaso {
  repositorio: RepositorioMorosidad;
  actor?: Actor | null;
  /** YYYY-MM-DD (inyectable ⇒ determinista en tests). */
  fechaReferencia?: string;
  dispatcher?: DispatcherContexto | null;
  destinatarios?: ContextoDestinatarios;
  incluirEstimadosEnReclamacion?: boolean;
}

function hoyDe(ctx: ContextoCaso): string {
  return (ctx.fechaReferencia || new Date().toISOString().slice(0, 10));
}

// ==========================================================================
// DETECCIÓN + APERTURA (FASE 3 y 17)
// ==========================================================================

export interface ResultadoDeteccion {
  creados: ExpedienteMorosidad[];
  sincronizados: { id: string; cambios: string[] }[];
  omitidos: { contratoId: string; motivo: string }[];
  errores: string[];
}

/**
 * Detecta deuda en los contratos y abre/sincroniza expedientes. Repetir la
 * ejecución NO duplica: el id es determinista sobre la firma de tramos.
 */
export async function detectarYGestionar(
  contratos: ContratoFormalizacion[],
  ctx: ContextoCaso,
  opts: { soloContratos?: string[] } = {},
): Promise<ResultadoDeteccion> {
  const fechaReferencia = hoyDe(ctx);
  const politicas = await ctx.repositorio.listarPoliticas().catch(() => [] as PoliticaMorosidad[]);
  const abiertos = await ctx.repositorio.listarExpedientes().catch(() => [] as ExpedienteMorosidad[]);
  const porContrato = new Map<string, ExpedienteMorosidad>();
  for (const ex of abiertos) {
    // El expediente vigente para un contrato es el más reciente no cerrado.
    const previa = porContrato.get(ex.contratoId);
    if (!previa || (previa.estado === 'CERRADA' || previa.estado === 'PAGADA') === true) {
      if (!previa) porContrato.set(ex.contratoId, ex);
      if (previa && (ex.estado === 'CERRADA' || ex.estado === 'PAGADA') === false) porContrato.set(ex.contratoId, ex);
    } else if ((ex.estado === 'CERRADA' || ex.estado === 'PAGADA') === false && ex.creadoEn > previa.creadoEn) {
      porContrato.set(ex.contratoId, ex);
    }
  }

  const creados: ExpedienteMorosidad[] = [];
  const sincronizados: { id: string; cambios: string[] }[] = [];
  const omitidos: { contratoId: string; motivo: string }[] = [];
  const errores: string[] = [];

  for (const contrato of contratos || []) {
    if (opts.soloContratos && !opts.soloContratos.includes(contrato.id)) continue;
    const piezas = detectarDeudasContrato(contrato, { fechaReferencia, diasGracia: 2 });
    const reclamables = piezas.filter((p) => p.clasificacion !== 'EN_DISPUTA');
    const existente = porContrato.get(contrato.id);

    if (!existente) {
      if (reclamables.length === 0) {
        omitidos.push({ contratoId: contrato.id, motivo: piezas.length > 0 ? 'solo_deuda_en_disputa' : 'sin_deuda_vencida' });
        continue;
      }
      const { politica } = resolverPolitica(politicas, String(contrato.propietarioId || ''), fechaHoyISO(fechaReferencia));
      const construido = construirExpediente({
        contrato,
        piezas,
        fechaReferencia,
        politicaId: politica.id,
        versionPolitica: politica.version,
        actor: ctx.actor ? ({ id: ctx.actor.id, nombre: ctx.actor.nombre, email: ctx.actor.email } as UsuarioApp) : null,
      });
      if (!construido.ok || !construido.expediente) {
        errores.push(...construido.errores.map((e) => `${contrato.id}:${e}`));
        continue;
      }
      const plan = generarPlanRecobro({
        expedienteId: construido.expediente.id,
        politica,
        piezas: construido.expediente.piezasDeuda,
        fechaReferencia,
        expedienteCerrado: false,
      });
      const proxima = calcularProximaAccion(plan.plan, fechaReferencia);
      const expediente: ExpedienteMorosidad = {
        ...construido.expediente,
        planRecobro: plan.plan,
        proximaAccionFecha: proxima.fecha,
        proximaAccionCodigo: proxima.codigo,
        requerimientoFehacienteExiste: false,
      };
      const transicion = aplicarTransicionEnExpediente(
        { ...expediente, estado: 'DETECTADA' },
        'PENDIENTE_CONTACTO',
        'DETECCION_AUTOMATICA',
        {
          actor: ctx.actor as UsuarioApp,
          fecha: fechaHoyISO(fechaReferencia),
          observaciones: `Detector: ${reclamables.length} periodo(s) vencido(s), saldo ${redondear2(expediente.saldoPendiente)} €.`,
        },
      );
      const final = transicion.ok && transicion.expediente ? transicion.expediente : expediente;
      await ctx.repositorio.guardarExpediente(final);
      if (transicion.transicion) {
        await appendSeguro(ctx, transicion.transicion);
      }
      await ctx.repositorio
        .auditar(
          'MOROSIDAD_EXPEDIENTE_ABIERTO',
          `Expediente ${final.id} abierto por detección automática (${reclamables.length} tramos, ${redondear2(final.saldoPendiente)} €).`,
          { expedienteId: final.id, contratoId: contrato.id, propietarioId: final.propietarioId, saldo: final.saldoPendiente },
        )
        .catch(() => undefined);
      creados.push(final);
      continue;
    }

    // Sincronización del expediente abierto contra la fuente canónica.
    const cobros = await ctx.repositorio.listarCobrosContrato(contrato.id).catch(() => contrato.registroCobros || []);
    const sync = sincronizarExpediente(existente, cobros.length ? cobros : (contrato.registroCobros || []), {
      fechaReferencia,
      diasGracia: 2,
      actor: ctx.actor ? ({ id: ctx.actor.id, nombre: ctx.actor.nombre, email: ctx.actor.email } as UsuarioApp) : null,
    });
    if (!sync.modificado) {
      omitidos.push({ contratoId: contrato.id, motivo: 'sin_cambios' });
      continue;
    }
    const { politica } = resolverPolitica(politicas, String(existente.propietarioId || ''), fechaHoyISO(fechaReferencia));
    const plan = generarPlanRecobro({
      expedienteId: existente.id,
      politica,
      piezas: sync.expediente.piezasDeuda,
      fechaReferencia,
      clavesComunicacionExistentes: (sync.expediente.comunicaciones || []).map((c) => c.tipoEvento),
      expedienteCerrado: sync.expediente.estado === 'CERRADA' || sync.expediente.estado === 'PAGADA',
    });
    const proxima = calcularProximaAccion(plan.plan, fechaReferencia);
    let actualizado: ExpedienteMorosidad = {
      ...sync.expediente,
      planRecobro: plan.plan,
      proximaAccionFecha: proxima.fecha,
      proximaAccionCodigo: proxima.codigo,
    };

    const cambios: string[] = [];
    if (sync.transicionSugerida) {
      const t = aplicarTransicionEnExpediente(
        actualizado,
        sync.transicionSugerida.estadoNuevo,
        sync.transicionSugerida.motivo,
        {
          actor: ctx.actor as UsuarioApp,
          fecha: fechaHoyISO(fechaReferencia),
          observaciones: `Detector: ${[
            sync.cambios.pagados.length ? `${sync.cambios.pagados.length} tramo(s) pagado(s)` : '',
            sync.cambios.parciales.length ? `${sync.cambios.parciales.length} con pago parcial` : '',
            sync.cambios.nuevos.length ? `${sync.cambios.nuevos.length} tramo(s) nuevo(s)` : '',
            sync.cambios.retirados.length ? `${sync.cambios.retirados.length} retirado(s) por anulación/devolución` : '',
          ].filter(Boolean).join('; ')}`,
          confirmarCierreConSaldo: sync.transicionSugerida.motivo === 'ANULACION_O_RECTIFICACION',
          forzarSinEvidencia: true,
          exigeMascParaJuridica: politica.escalado?.requiereMascDeclaradoParaJuridica !== false,
        },
      );
      if (t.ok && t.expediente && t.transicion) {
        actualizado = t.expediente;
        await appendSeguro(ctx, t.transicion);
        cambios.push(`estado:${t.transicion.estadoNuevo}`);
        await cerrarCompromisosSiPagado(actualizado, ctx, t.transicion.id);
      } else if (!t.ok) {
        cambios.push(`transicion_bloqueada:${t.errores.join(',')}`);
      }
    }
    if (sync.cambios.pagados.length > 0) {
      const ev = crearEvidencia({
        expedienteId: actualizado.id,
        propietarioId: actualizado.propietarioId,
        tipo: 'PAGO',
        fecha: fechaReferencia,
        resumen: `Pago detectado en la fuente canónica para ${sync.cambios.pagados.length} tramo(s).`,
        detalle: `cobros: ${sync.cambios.pagados.join(', ')}`,
        referenciaEntidadTipo: 'cobro',
        referenciaEntidadId: sync.cambios.pagados[0],
        actor: ctx.actor as UsuarioApp,
        claveEstable: `pago-detectado|${actualizado.id}|${sync.cambios.pagados.slice().sort().join('|')}`,
      });
      if (ev.ok && ev.evidencia) {
        await ctx.repositorio.appendEvidencia(ev.evidencia);
        actualizado = { ...actualizado, numEvidencias: Number(actualizado.numEvidencias || 0) + 1, ultimaEvidenciaFecha: fechaReferencia };
      }
      // Evento GAP 1 (cierre por pago / aviso de pago parcial) — aditivo, idempotente.
      await emitirEvento(actualizado, sync.cambios.pagados[0], actualizado.saldoPendiente <= TOLERANCIA_CENTIMOS ? 'expediente.cerrado_pago' : 'expediente.registro_pagos', ctx);
      cambios.push(`pagados:${sync.cambios.pagados.length}`);
    }
    if (sync.cambios.retirados.length > 0) cambios.push(`retirados:${sync.cambios.retirados.length}`);
    if (sync.cambios.nuevos.length > 0) cambios.push(`nuevos:${sync.cambios.nuevos.length}`);

    // Compromisos: re-aplicar cobros reales y revisar vencimientos.
    const compromisos = await ctx.repositorio.listarCompromisos(actualizado.id).catch(() => [] as CompromisoPago[]);
    for (const cmp of compromisos.filter((c) => c.estado === 'VIGENTE')) {
      const cobrosContrato = await ctx.repositorio.listarCobrosContrato(actualizado.contratoId).catch(() => [] as CobroPeriodo[]);
      const aplic = aplicarCobrosAlCompromiso(cmp, cobrosContrato, { fechaReferencia, actor: ctx.actor });
      const revisado = aplic.compromiso;
      if (revisado.importeCubierto !== cmp.importeCubierto || revisado.estado !== cmp.estado) {
        await ctx.repositorio.guardarCompromiso(revisado);
        cambios.push(`compromiso:${revisado.id}:${revisado.estado}`);
        if (revisado.estado === 'INCUMPLIDO' && cmp.estado === 'VIGENTE') {
          const t = aplicarTransicionEnExpediente(actualizado, 'COMPROMISO_INCUMPLIDO', 'COMPROMISO_INCUMPLIDO', {
            actor: ctx.actor as UsuarioApp,
            fecha: fechaHoyISO(fechaReferencia),
            observaciones: `Calendario ${revisado.id}: cuota vencida sin cobertura en la fuente.`,
            exigeMascParaJuridica: false,
          } as never);
          if (t.ok && t.expediente && t.transicion) {
            actualizado = t.expediente;
            await appendSeguro(ctx, t.transicion);
          }
          await emitirEvento(actualizado, undefined, 'compromiso.incumplido', ctx);
        }
      }
    }

    await ctx.repositorio.guardarExpediente(actualizado);
    await ctx.repositorio
      .auditar('MOROSIDAD_EXPEDIENTE_SINCRONIZADO', `Expediente ${actualizado.id} sincronizado con la fuente de cobros.`, {
        expedienteId: actualizado.id,
        cambios,
        saldo: actualizado.saldoPendiente,
      })
      .catch(() => undefined);
    sincronizados.push({ id: actualizado.id, cambios });
  }

  return { creados, sincronizados, omitidos, errores };
}

async function cerrarCompromisosSiPagado(expediente: ExpedienteMorosidad, ctx: ContextoCaso, transicionId: string): Promise<void> {
  if (expediente.saldoPendiente > TOLERANCIA_CENTIMOS) return;
  const compromisos = await ctx.repositorio.listarCompromisos(expediente.id).catch(() => [] as CompromisoPago[]);
  for (const cmp of compromisos.filter((c) => c.estado === 'VIGENTE' || c.estado === 'INCUMPLIDO')) {
    const hoy = new Date().toISOString();
    await ctx.repositorio
      .guardarCompromiso({
        ...cmp,
        estado: 'CANCELADO',
        fechaCierre: hoy,
        actualizadoEn: hoy,
        historial: [
          {
            id: `hist_${transicionId}|cierre`,
            fecha: hoy,
            accion: 'COMPROMISO_CERRADO_POR_PAGO_COMPLETO',
            detalle: 'El expediente quedó saldado según la fuente canónica de cobros; el calendario se cierra sin modificar ningún cobro.',
            actorNombre: ctx.actor?.nombre,
          },
          ...(cmp.historial || []),
        ],
      })
      .catch(() => undefined);
  }
}

/** Emite un evento de recobro por GAP 1 y devuelve el espejo local. */
export async function emitirEvento(
  expediente: ExpedienteMorosidad,
  cobroId: string | undefined,
  evento: EventoMorosidad,
  ctx: ContextoCaso,
  opts: { destinatarioTipo?: ComunicacionExpediente['destinatarioTipo'] } = {},
): Promise<{ comunicacion?: ComunicacionExpediente; expediente: ExpedienteMorosidad }> {
  const pieza = cobroId ? (expediente.piezasDeuda || []).find((p) => p.cobroId === cobroId) : undefined;
  const destinatarioTipo = opts.destinatarioTipo || (evento.startsWith('escalado.') ? 'ADMINISTRACION' : 'INQUILINO');
  const ev = construirEventoMorosidad({
    expediente,
    pieza,
    evento,
    destinatarioTipo,
    nombreDestinatario: ctx.destinatarios?.contrato?.candidatoNombre,
    contactoDestinatario: ctx.destinatarios?.contrato?.candidatoEmail,
    actorNombre: ctx.actor?.nombre || ctx.actor?.email,
  });

  let dispatch: ResultadoPuenteGAP1 = {
    ok: false,
    idempotencyKey: `ev:morosidad:${evento.replace(/\./g, '_')}:${(cobroId ? `${expediente.id}#${cobroId}` : expediente.id)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_')}`,
    tipoEvento: `morosidad.${evento.replace(/\./g, '_')}`,
    estadoComunicacion: 'PENDIENTE_ENVIO' as ComunicacionExpediente['estado'],
    entregada: false,
    duplicada: false,
    error: 'dispatcher_no_configurado',
    motivoDenegacion: 'Sin contexto de dispatcher GAP 1: la comunicación queda preparada, no enviada.',
  };
  if (ctx.dispatcher) {
    dispatch = await despacharEventoMorosidadPorGAP1(ev, ctx.dispatcher, ctx.destinatarios);
  }

  const comunicacion = construirComunicacion(
    expediente.id,
    {
      tipoEvento: dispatch.tipoEvento,
      origen: ctx.dispatcher ? 'MOROSIDAD' : 'MOROSIDAD_PREPARADA',
      idempotencyKey: dispatch.idempotencyKey,
      destinatarioTipo,
      destinatarioReferencia: ctx.destinatarios?.contrato?.candidatoEmail
        ? 'contrato:candidatoEmail'
        : ctx.destinatarios?.propietario?.email
          ? 'propietario:email'
          : undefined,
      notificacionId: dispatch.notificacionId,
      piezaDeudaId: pieza?.id,
      cobroId: pieza?.cobroId,
      actor: ctx.actor as UsuarioApp,
    },
    {
      estado: dispatch.estadoComunicacion,
      provider: dispatch.provider,
      externalId: dispatch.externalId,
      error: dispatch.error,
      cuerpoResumen: ev.mensaje,
    },
  );

  const requiereFehaciente = comunicacion.tipoEvento === 'morosidad.requerimiento_fehaciente' && dispatch.entregada;
  const actualizado: ExpedienteMorosidad = {
    ...expediente,
    comunicaciones: [comunicacion, ...(expediente.comunicaciones || []).filter((c) => c.id !== comunicacion.id)].slice(0, 40),
    ultimaComunicacionId: comunicacion.id,
    requerimientoFehacienteExiste:
      expediente.requerimientoFehacienteExiste || requiereFehaciente || tieneRequerimientoFehaciente(expediente.comunicaciones || []),
    actualizadoEn: new Date().toISOString(),
  };
  await ctx.repositorio.guardarExpediente(actualizado);
  await ctx.repositorio
    .auditar(`MOROSIDAD_COMUNICACION_${comunicacion.estado}`, `${comunicacion.tipoEvento} en ${actualizado.id} (${comunicacion.estado}).`, {
      expedienteId: actualizado.id,
      comunicacionId: comunicacion.id,
      idempotencyKey: comunicacion.idempotencyKey,
      notificacionId: comunicacion.notificacionId,
      entregada: dispatch.entregada,
    })
    .catch(() => undefined);
  return { comunicacion, expediente: actualizado };
}

// ==========================================================================
// REGISTRAR COMUNICACIÓN MANUAL / FEHACIENTE
// ==========================================================================

export async function registrarComunicacion(
  expedienteId: string,
  datos: {
    tipoEvento: string;
    medio: ComunicacionExpediente['medio'];
    destinatarioTipo: ComunicacionExpediente['destinatarioTipo'];
    asunto?: string;
    resumen?: string;
    fecha: string;
    evidencia?: { resumen?: string; fecha?: string; detalle?: string; hash?: string; storagePath?: string; nombreArchivo?: string; tipoMime?: string; tamanoBytes?: number };
    cobroId?: string;
    notas?: string;
  },
  ctx: ContextoCaso,
): Promise<{
  ok: boolean;
  errores: string[];
  comunicacion?: ComunicacionExpediente;
  evidencia?: EvidenciaMorosidad;
  expediente?: ExpedienteMorosidad;
  requiereEvidencia: boolean;
}> {
  const expediente = await ctx.repositorio.leerExpediente(expedienteId);
  if (!expediente) return { ok: false, errores: ['expediente_no_encontrado'], requiereEvidencia: false };
  const pieza = datos.cobroId ? (expediente.piezasDeuda || []).find((p) => p.cobroId === datos.cobroId) : undefined;

  const { comunicacion, requiereEvidencia } = registrarComunicacionExterna(expediente.id, {
    tipoEvento: datos.tipoEvento,
    medio: datos.medio,
    destinatarioTipo: datos.destinatarioTipo,
    asunto: datos.asunto,
    resumen: datos.resumen,
    fecha: datos.fecha,
    notas: datos.notas,
    actor: ctx.actor as UsuarioApp,
  });

  let evidencia: EvidenciaMorosidad | undefined;
  const needsEvi = !!datos.evidencia || requiereEvidencia;
  if (needsEvi) {
    const ev = crearEvidencia({
      expedienteId: expediente.id,
      propietarioId: expediente.propietarioId,
      tipo: datos.medio === 'LLAMADA' ? 'LLAMADA' : ['BUROFAX', 'CARTA_CERTIFICADA', 'NOTARIAL'].includes(datos.medio) ? 'NOTIFICACION_FEHACIENTE' : 'COMUNICACION',
      fecha: datos.evidencia?.fecha || datos.fecha,
      resumen: datos.evidencia?.resumen || `${datos.medio}: ${datos.resumen || datos.tipoEvento}`,
      detalle: datos.evidencia?.detalle,
      cobroId: pieza?.cobroId,
      piezaDeudaId: pieza?.id,
      referenciaEntidadTipo: 'comunicacion',
      referenciaEntidadId: comunicacion.id,
      storagePath: datos.evidencia?.storagePath,
      nombreArchivo: datos.evidencia?.nombreArchivo,
      tipoMime: datos.evidencia?.tipoMime,
      tamanoBytes: datos.evidencia?.tamanoBytes,
      actor: ctx.actor as UsuarioApp,
      claveEstable: `com|${comunicacion.id}`,
    });
    if (!ev.ok) return { ok: false, errores: ev.errores, requiereEvidencia };
    evidencia = ev.evidencia;
    if (evidencia) await ctx.repositorio.appendEvidencia(evidencia);
  }

  let comunicacionFinal: ComunicacionExpediente = { ...comunicacion, evidenciaId: evidencia?.id };

  // FASE 8: si el medio es un canal que GAP 1 soporta (EMAIL/INAPP) y existe
  // dispatcher, la comunicación se EMITE por GAP 1 (documento en `notificaciones`
  // con la clave de idempotencia canónica) y el espejo local adopta el estado que
  // devuelve el dispatcher. Con medios que requieren tercero (burofax, notarial,
  // certificado, llamada) NO se emite nada: solo se registra lo declarado.
  const canalGAP1 = datos.medio === 'EMAIL' || datos.medio === 'INAPP';
  if (canalGAP1 && ctx.dispatcher) {
    const evento = EVENTO_POR_TIPO_EVENTO[datos.tipoEvento];
    if (evento) {
      const { comunicacion: espejo } = await emitirEvento(expediente, pieza?.cobroId, evento, ctx, {
        destinatarioTipo: datos.destinatarioTipo,
      });
      if (espejo) {
        comunicacionFinal = {
          ...espejo,
          evidenciaId: evidencia?.id ?? espejo.evidenciaId,
          cuerpoResumen: espejo.cuerpoResumen || datos.resumen,
          asunto: datos.asunto ?? espejo.asunto,
          notas: datos.notas ?? espejo.notas,
          actorId: ctx.actor?.id,
          actorNombre: ctx.actor?.nombre || ctx.actor?.email,
        };
      }
    }
  }

  const actualizado: ExpedienteMorosidad = {
    ...expediente,
    comunicaciones: [comunicacionFinal, ...(expediente.comunicaciones || []).filter((c) => c.id !== comunicacionFinal.id)].slice(0, 40),
    ultimaComunicacionId: comunicacionFinal.id,
    requerimientoFehacienteExiste:
      expediente.requerimientoFehacienteExiste ||
      (['BUROFAX', 'CARTA_CERTIFICADA', 'NOTARIAL'].includes(datos.medio) && !!evidencia),
    numEvidencias: Number(expediente.numEvidencias || 0) + (evidencia ? 1 : 0),
    ultimaEvidenciaFecha: evidencia ? datos.fecha : expediente.ultimaEvidenciaFecha,
    actualizadoEn: new Date().toISOString(),
  };
  await ctx.repositorio.guardarExpediente(actualizado);
  await ctx.repositorio
    .auditar('MOROSIDAD_COMUNICACION_REGISTRADA', `Comunicación ${datos.medio} registrada en ${expediente.id} (${datos.fecha}).`, {
      expedienteId: expediente.id,
      comunicacionId: comunicacionFinal.id,
      medio: datos.medio,
      evidenciaId: evidencia?.id,
      externa: true,
    })
    .catch(() => undefined);

  // El primer contacto saca el expediente de PENDIENTE_CONTACTO (trazable).
  let conEstado = actualizado;
  if (actualizado.estado === 'DETECTADA' || actualizado.estado === 'PENDIENTE_CONTACTO') {
    const t = aplicarTransicionEnExpediente(actualizado, 'RECLAMACION_INICIADA', 'REQUERIMIENTO_ENVIADO', {
      actor: ctx.actor as UsuarioApp,
      evidenciaId: evidencia?.id,
      observaciones: `Comunicación ${datos.medio} registrada el ${datos.fecha}.`,
      exigeMascParaJuridica: false,
    } as never);
    if (t.ok && t.expediente && t.transicion) {
      conEstado = t.expediente;
      await ctx.repositorio.guardarExpediente(conEstado);
      await appendSeguro(ctx, t.transicion);
    }
  }
  return {
    ok: true,
    errores: [],
    comunicacion: comunicacionFinal,
    evidencia,
    expediente: conEstado,
    requiereEvidencia,
  };
}

// ==========================================================================
// REGISTRAR PAGO — SOLO por la interfaz oficial de cobros (FASE 7 y 12)
// ==========================================================================

export interface ResultadoRegistrarPago {
  ok: boolean;
  errores: string[];
  contratoActualizado?: ContratoFormalizacion;
  expediente?: ExpedienteMorosidad;
}

/**
 * Registra un pago en el cobro canónico usando EXCLUSIVAMENTE
 * `cobrosEngine.registrarPagoPeriodo`, y después re-sincroniza el expediente.
 * Si el cobro ya está conciliado (GAP 6) el pago no se repite: `registrarPagoPeriodo`
 * sobrescribe con el mismo valor (trazable) y la sincronización concluye saldo 0.
 */
export async function registrarPago(
  contrato: ContratoFormalizacion,
  cobroId: string,
  pago: {
    importeRecibido: number;
    fechaPago: string;
    metodoPago?: 'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro';
    observaciones?: string;
    referenciaBancaria?: string;
  },
  ctx: ContextoCaso,
): Promise<ResultadoRegistrarPago> {
  const errores: string[] = [];
  const periodo = (contrato.registroCobros || []).find((p) => p.id === cobroId);
  if (!periodo) return { ok: false, errores: ['cobro_no_encontrado_en_contrato'] };
  if (!(Number(pago.importeRecibido) >= 0)) errores.push('importe_invalido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pago.fechaPago || '')) errores.push('fecha_pago_invalida');
  if (Number(pago.importeRecibido) > redondear2(Number(periodo.importePrevisto) * 2)) {
    errores.push('importe_superior_al_previsto_revisar');
  }
  if (errores.length > 0) return { ok: false, errores };

  const contratoActualizado = registrarPagoPeriodo(
    contrato,
    cobroId,
    {
      importeRecibido: redondear2(pago.importeRecibido),
      fechaPago: pago.fechaPago,
      metodoPago: pago.metodoPago || 'transferencia',
      observaciones: pago.observaciones,
      referenciaBancaria: pago.referenciaBancaria,
    },
    (ctx.actor as UsuarioApp) || null,
  );
  await ctx.repositorio.guardarContrato(contratoActualizado);

  const expediente = await ctx.repositorio.leerExpediente(
    (await ctx.repositorio.listarExpedientes()).find((e) => e.contratoId === contrato.id && e.estado !== 'CERRADA')?.id || '',
  );
  let resultadoExpediente = expediente || undefined;
  if (expediente) {
    const sync = sincronizarExpediente(expediente, contratoActualizado.registroCobros || [], {
      fechaReferencia: hoyDe(ctx),
      actor: ctx.actor as UsuarioApp,
    });
    let actualizado = sync.expediente;
    const evid = crearEvidencia({
      expedienteId: expediente.id,
      propietarioId: expediente.propietarioId,
      tipo: 'PAGO',
      fecha: pago.fechaPago,
      resumen: `Pago de ${redondear2(pago.importeRecibido).toFixed(2)} € registrado vía cobrosEngine (interfaz oficial).`,
      detalle: pago.observaciones,
      cobroId,
      referenciaEntidadTipo: 'cobro',
      referenciaEntidadId: cobroId,
      importeRelacionado: redondear2(pago.importeRecibido),
      resultado: pago.referenciaBancaria ? `ref. ${pago.referenciaBancaria}` : undefined,
      actor: ctx.actor as UsuarioApp,
      claveEstable: `pago|${cobroId}|${redondear2(pago.importeRecibido)}|${pago.fechaPago}`,
    });
    if (evid.ok && evid.evidencia) {
      await ctx.repositorio.appendEvidencia(evid.evidencia);
      actualizado = { ...actualizado, numEvidencias: Number(actualizado.numEvidencias || 0) + 1, ultimaEvidenciaFecha: pago.fechaPago };
    }
    if (sync.transicionSugerida) {
      const t = aplicarTransicionEnExpediente(actualizado, sync.transicionSugerida.estadoNuevo, sync.transicionSugerida.motivo, {
        actor: ctx.actor as UsuarioApp,
        evidenciaId: evid.evidencia?.id,
        observaciones: `Pago registrado: saldo ${redondear2(actualizado.saldoPendiente)} €.`,
        exigeMascParaJuridica: false,
      } as never);
      if (t.ok && t.expediente && t.transicion) {
        actualizado = t.expediente;
        await appendSeguro(ctx, t.transicion);
      }
    }
    // Compromiso vigente: aplicar la cobertura desde la fuente (no se inventa nada).
    const compromisos = await ctx.repositorio.listarCompromisos(expediente.id).catch(() => [] as CompromisoPago[]);
    for (const cmp of compromisos.filter((c) => c.estado === 'VIGENTE')) {
      const aplic = aplicarCobrosAlCompromiso(cmp, contratoActualizado.registroCobros || [], {
        fechaReferencia: hoyDe(ctx),
        actor: ctx.actor,
      });
      await ctx.repositorio.guardarCompromiso(aplic.compromiso);
    }
    await ctx.repositorio.guardarExpediente(actualizado);
    await ctx.repositorio
      .auditar('MOROSIDAD_PAGO_REGISTRADO', `Pago del periodo ${cobroId} registrado por la vía oficial y sincronizado en ${expediente.id}.`, {
        expedienteId: expediente.id,
        cobroId,
        importe: redondear2(pago.importeRecibido),
        saldo: actualizado.saldoPendiente,
      })
      .catch(() => undefined);
    await emitirEvento(
      actualizado,
      cobroId,
      actualizado.saldoPendiente <= TOLERANCIA_CENTIMOS ? 'expediente.cerrado_pago' : 'pago.parcial',
      ctx,
    ).catch(() => undefined);
    resultadoExpediente = actualizado;
  }
  return { ok: true, errores: [], contratoActualizado, expediente: resultadoExpediente };
}

// ==========================================================================
// COMPROMISOS / ESCALADOS / CIERRE
// ==========================================================================

export async function registrarCompromiso(
  expedienteId: string,
  datos: {
    fechaPropuesta: string;
    importeTotal: number;
    numPagos: number;
    periodicidadDias?: number;
    primeraCuotaFecha?: string;
    origenRegistro: CompromisoPago['origenRegistro'];
    observaciones?: string;
    evidencia?: { resumen: string; fecha: string; detalle?: string };
  },
  ctx: ContextoCaso,
): Promise<{ ok: boolean; errores: string[]; compromiso?: CompromisoPago; expediente?: ExpedienteMorosidad }> {
  const expediente = await ctx.repositorio.leerExpediente(expedienteId);
  if (!expediente) return { ok: false, errores: ['expediente_no_encontrado'] };
  const errores: string[] = [];
  const saldo = redondear2(expediente.saldoPendiente);
  if (saldo <= TOLERANCIA_CENTIMOS) errores.push('sin_saldo_pendiente');
  if (Number(datos.importeTotal) > redondear2(saldo + TOLERANCIA_CENTIMOS)) {
    errores.push('importe_compromiso_superior_a_deuda');
  }
  if (expediente.compromisoVigenteId) errores.push(`ya_existe_compromiso:${expediente.compromisoVigenteId}`);
  if (errores.length > 0) return { ok: false, errores };

  let evidenciaId: string | undefined;
  if (datos.evidencia) {
    const ev = crearEvidencia({
      expedienteId,
      propietarioId: expediente?.propietarioId,
      tipo: 'PROMESA_PAGO',
      fecha: datos.evidencia.fecha,
      resumen: datos.evidencia.resumen,
      detalle: datos.evidencia.detalle,
      referenciaEntidadTipo: 'compromiso',
      referenciaEntidadId: `${expedienteId}|${datos.fechaPropuesta}`,
      actor: ctx.actor as UsuarioApp,
      claveEstable: `promesa|${expedienteId}|${datos.fechaPropuesta}`,
    });
    if (ev.ok && ev.evidencia) {
      await ctx.repositorio.appendEvidencia(ev.evidencia);
      evidenciaId = ev.evidencia.id;
    }
  }

  const c = crearCompromiso({
    expedienteId,
    contratoId: expediente.contratoId,
    inmuebleId: expediente.inmuebleId,
    propietarioId: expediente.propietarioId,
    fechaPropuesta: datos.fechaPropuesta,
    importeTotal: redondear2(datos.importeTotal),
    numPagos: Number(datos.numPagos),
    periodicidadDias: Number(datos.periodicidadDias || 30),
    primeraCuotaFecha: datos.primeraCuotaFecha,
    origenRegistro: datos.origenRegistro,
    evidenciaId,
    observaciones: datos.observaciones,
    actor: ctx.actor,
  });
  if (!c.ok || !c.compromiso) return { ok: false, errores: c.errores };
  await ctx.repositorio.guardarCompromiso(c.compromiso);

  const t = aplicarTransicionEnExpediente(expediente, 'COMPROMISO_PAGO', 'COMPROMISO_ALCANZADO', {
    actor: ctx.actor as UsuarioApp,
    evidenciaId,
    observaciones: `Calendario de ${c.compromiso.numPagos} cuota(s) por ${redondear2(c.compromiso.importeTotal)} €.`,
    exigeMascParaJuridica: false,
  } as never);
  let actualizado: ExpedienteMorosidad = {
    ...expediente,
    compromisoVigenteId: c.compromiso.id,
    numEvidencias: Number(expediente.numEvidencias || 0) + (evidenciaId ? 1 : 0),
  };
  if (t.ok && t.expediente && t.transicion) {
    actualizado = { ...t.expediente, compromisoVigenteId: c.compromiso.id };
    await appendSeguro(ctx, t.transicion);
  }
  await ctx.repositorio.guardarExpediente(actualizado);
  await ctx.repositorio
    .auditar('MOROSIDAD_COMPROMISO_CREADO', `Compromiso ${c.compromiso.id} registrado en ${expedienteId}.`, {
      expedienteId,
      compromisoId: c.compromiso.id,
      importe: c.compromiso.importeTotal,
      numPagos: c.compromiso.numPagos,
    })
    .catch(() => undefined);
  await emitirEvento(actualizado, undefined, 'compromiso.alcanzado', ctx).catch(() => undefined);
  return { ok: true, errores: [], compromiso: c.compromiso, expediente: actualizado };
}

export async function escalar(
  expedienteId: string,
  destino: 'ASEGURADORA' | 'JURIDICO',
  datos: {
    aseguradora?: Parameters<typeof abrirExpedienteAseguradora>[0];
    juridico?: Partial<Parameters<typeof prepararExpedienteJuridico>[0]>;
    conceptosJuridicos?: ModuloImporteJuridico[];
    motivo?: string;
    forzar?: boolean;
  },
  ctx: ContextoCaso,
): Promise<{ ok: boolean; errores: string[]; bloqueos: string[]; expediente?: ExpedienteMorosidad }> {
  const expediente = await ctx.repositorio.leerExpediente(expedienteId);
  if (!expediente) return { ok: false, errores: ['expediente_no_encontrado'], bloqueos: [] };
  const politicas = await ctx.repositorio.listarPoliticas().catch(() => [] as PoliticaMorosidad[]);
  const { politica } = resolverPolitica(politicas, expediente.propietarioId, fechaHoyISO(hoyDe(ctx)));
  const compromisos = await ctx.repositorio.listarCompromisos(expedienteId).catch(() => [] as CompromisoPago[]);
  const veredicto = evaluarEscalado(politica, {
    piezasAbiertas: expediente.piezasDeuda,
    fechaReferencia: hoyDe(ctx),
    requerimientoFehacienteExiste: expediente.requerimientoFehacienteExiste,
    mascDeclarado:
      expediente.juridico?.requisitoProcedibilidad === 'CUMPLIDO_EVIDENCIA' ||
      expediente.juridico?.requisitoProcedibilidad === 'IMPOSIBILIDAD_DECLARADA',
    compromisoVigente: !!expediente.compromisoVigenteId && compromisos.some((c) => c.estado === 'VIGENTE'),
  });
  if (!datos.forzar && veredicto.bloqueos.length > 0) {
    return {
      ok: false,
      errores: ['escalado_bloqueado_por_politica'],
      bloqueos: veredicto.bloqueos,
      expediente,
    };
  }

  if (destino === 'ASEGURADORA') {
    if (!datos.aseguradora) return { ok: false, errores: ['datos_aseguradora_requeridos'], bloqueos: [] };
    const r = abrirExpedienteAseguradora({
      ...datos.aseguradora,
      expedienteId,
      importeReclamado: datos.aseguradora.importeReclamado ?? redondear2(expediente.saldoPendiente),
    });
    if (!r.ok || !r.aseguradora) return { ok: false, errores: r.errores, bloqueos: [] };
    const t = aplicarTransicionEnExpediente(expediente, 'ESCALADA', 'ESCALADO_ASEGURADORA', {
      actor: ctx.actor as UsuarioApp,
      observaciones: datos.motivo || `Expediente preparado para ${r.aseguradora.aseguradoraNombre} (canal: ${r.aseguradora.canalUso}).`,
      forzarSinEvidencia: !!datos.forzar,
      exigeMascParaJuridica: false,
    } as never);
    if (!t.ok) return { ok: false, errores: t.errores, bloqueos: t.advertencias };
    let actualizado = { ...(t.expediente as ExpedienteMorosidad), aseguradora: r.aseguradora };
    const tot = totalConceptosJuridicos(datos.conceptosJuridicos, { incluirEstimados: !!ctx.incluirEstimadosEnReclamacion });
    actualizado = {
      ...actualizado,
      importeInteresesReclamados: tot.intereses,
      importeGastosReclamables: redondear2(tot.gastos + tot.otros),
      importeTotalReclamado: redondear2(actualizado.saldoPendiente + tot.total),
    };
    await ctx.repositorio.guardarExpediente(actualizado);
    if (t.transicion) await appendSeguro(ctx, t.transicion);
    await ctx.repositorio
      .auditar('MOROSIDAD_ESCALADO_ASEGURADORA', `Expediente ${expedienteId} preparado para aseguradora (${r.aseguradora.aseguradoraNombre}).`, {
        expedienteId,
        estado: r.aseguradora.estado,
        canalUso: r.aseguradora.canalUso,
      })
      .catch(() => undefined);
    await emitirEvento(actualizado, undefined, 'escalado.aseguradora', ctx).catch(() => undefined);
    return { ok: true, errores: [], bloqueos: veredicto.bloqueos, expediente: actualizado };
  }

  if (!datos.juridico) return { ok: false, errores: ['datos_juridicos_requeridos'], bloqueos: [] };
  const r = prepararExpedienteJuridico({
    ...(datos.juridico as object),
    expedienteId,
    importeReclamado: datos.juridico.importeReclamado ?? redondear2(expediente.saldoPendiente),
    documentacionIds: datos.juridico.documentacionIds?.length
      ? datos.juridico.documentacionIds
      : (expediente.piezasDeuda || []).map((p) => p.id),
  });
  if (!r.ok || !r.juridico) return { ok: false, errores: r.errores, bloqueos: [] };
  // El requisito de procedibilidad se declara EN la misma acción (el letrado/usuario
  // indica si hubo MASC o su imposibilidad): se valida contra el expediente prospectivo.
  const prospecto: ExpedienteMorosidad = { ...expediente, juridico: r.juridico };
  const t = aplicarTransicionEnExpediente(prospecto, 'JURIDICA', 'ESCALADO_JURIDICO', {
    actor: ctx.actor as UsuarioApp,
    observaciones: datos.motivo || 'Derivación preparada (sin presentación real: el ERP no se comunica con órganos judiciales).',
    forzarSinEvidencia: !!datos.forzar,
    exigeMascParaJuridica: politica.escalado?.requiereMascDeclaradoParaJuridica !== false,
  } as never);
  if (!t.ok) return { ok: false, errores: [...t.errores, ...r.advertencias], bloqueos: veredicto.bloqueos };
  const actualizado = { ...(t.expediente as ExpedienteMorosidad), juridico: r.juridico };
  await ctx.repositorio.guardarExpediente(actualizado);
  if (t.transicion) await appendSeguro(ctx, t.transicion);
  await ctx.repositorio
    .auditar('MOROSIDAD_DERIVADO_JURIDICO', `Expediente ${expedienteId} preparado para derivación jurídica.`, {
      expedienteId,
      requisitoProcedibilidad: r.juridico.requisitoProcedibilidad,
      importes: { saldo: actualizado.saldoPendiente },
    })
    .catch(() => undefined);
  await emitirEvento(actualizado, undefined, 'escalado.juridico', ctx).catch(() => undefined);
  return { ok: true, errores: [...r.advertencias.map((a) => `aviso:${a}`)], bloqueos: veredicto.bloqueos, expediente: actualizado };
}

export async function cambiarEstado(
  expedienteId: string,
  estadoNuevo: ExpedienteMorosidad['estado'],
  motivo: MotivoTransicion | undefined,
  opts: { observaciones?: string; evidenciaId?: string; confirmarCierreConSaldo?: boolean; forzarSinEvidencia?: boolean },
  ctx: ContextoCaso,
): Promise<{ ok: boolean; errores: string[]; advertencias: string[]; expediente?: ExpedienteMorosidad; transicion?: TransicionExpediente }> {
  const expediente = await ctx.repositorio.leerExpediente(expedienteId);
  if (!expediente) return { ok: false, errores: ['expediente_no_encontrado'], advertencias: [] };
  const politicas = await ctx.repositorio.listarPoliticas().catch(() => [] as PoliticaMorosidad[]);
  const { politica } = resolverPolitica(politicas, expediente.propietarioId, fechaHoyISO(hoyDe(ctx)));
  const t = aplicarTransicionEnExpediente(expediente, estadoNuevo, motivo, {
    actor: ctx.actor as UsuarioApp,
    observaciones: opts.observaciones,
    evidenciaId: opts.evidenciaId,
    confirmarCierreConSaldo: opts.confirmarCierreConSaldo,
    forzarSinEvidencia: opts.forzarSinEvidencia,
    exigeMascParaJuridica: politica.escalado?.requiereMascDeclaradoParaJuridica !== false,
  });
  if (!t.ok || !t.expediente) return { ok: false, errores: t.errores, advertencias: t.advertencias };
  await ctx.repositorio.guardarExpediente(t.expediente);
  if (t.transicion) await appendSeguro(ctx, t.transicion);
  await ctx.repositorio
    .auditar('MOROSIDAD_ESTADO_CAMBIADO', `${expedienteId}: ${expediente.estado} → ${estadoNuevo} (${motivo || 'sin_motivo'}).`, {
      expedienteId,
      estadoAnterior: expediente.estado,
      estadoNuevo,
      motivo,
      saldo: t.expediente.saldoPendiente,
    })
    .catch(() => undefined);
  if (estadoNuevo === 'PAGADA') {
    await emitirEvento(t.expediente, undefined, 'expediente.cerrado_pago', ctx).catch(() => undefined);
    await cerrarCompromisosSiPagado(t.expediente, ctx, t.transicion?.id || 'na');
  }
  return { ok: true, errores: [], advertencias: t.advertencias, expediente: t.expediente, transicion: t.transicion };
}

/** Recalcula los intereses SOLO con parámetros aportados por el usuario. */
export async function recalcularConceptosJuridicos(
  expedienteId: string,
  datos: { desdeFecha: string; hastaFecha: string; parametros: Parameters<typeof construirConceptoIntereses>[0]['parametros']; requerimientoExiste: boolean },
  ctx: ContextoCaso,
): Promise<{ ok: boolean; errores: string[]; advertencias: string[]; total: number; concepto?: ModuloImporteJuridico }> {
  const expediente = await ctx.repositorio.leerExpediente(expedienteId);
  if (!expediente) return { ok: false, errores: ['expediente_no_encontrado'], advertencias: [], total: 0 };
  const r = construirConceptoIntereses({
    expedienteId,
    piezas: expediente.piezasDeuda,
    desdeFecha: datos.desdeFecha,
    hastaFecha: datos.hastaFecha,
    parametros: datos.parametros,
    requerimientoExiste: datos.requerimientoExiste || expediente.requerimientoFehacienteExiste,
    actor: ctx.actor,
  });
  if (!r.ok) return { ok: false, errores: r.errores, advertencias: r.advertencias, total: 0 };
  const tot = totalConceptosJuridicos(r.concepto ? [r.concepto] : [], { incluirEstimados: !!ctx.incluirEstimadosEnReclamacion });
  const actualizado: ExpedienteMorosidad = {
    ...expediente,
    importeInteresesReclamados: tot.intereses,
    importeTotalReclamado: redondear2(expediente.saldoPendiente + tot.total),
    actualizadoEn: new Date().toISOString(),
  };
  await ctx.repositorio.guardarExpediente(actualizado);
  await ctx.repositorio
    .auditar('MOROSIDAD_CONCEPTOS_JURIDICOS', `Conceptos jurídicos recalculados en ${expedienteId}: ${redondear2(tot.total)} € (estado ${r.concepto?.estado}).`, {
      expedienteId,
      estado: r.concepto?.estado,
      fuente: r.concepto?.parametros?.fuente,
    })
    .catch(() => undefined);
  return { ok: true, errores: [], advertencias: r.advertencias, total: tot.total, concepto: r.concepto };
}

// ---------------------------------------------------------------------------
// Tipos de función expuestos para la UI (el UI llama a estos, no a los motores)
// ---------------------------------------------------------------------------

export type CambiarEstadoFn = typeof cambiarEstado;
export type RegistrarComunicacionFn = typeof registrarComunicacion;
export type RegistrarCompromisoFn = typeof registrarCompromiso;
export type RegistrarPagoFn = typeof registrarPago;
export type EscalarFn = typeof escalar;
export type RecalcularJuridicoFn = typeof recalcularConceptosJuridicos;

/** Revisión periódica de compromisos (vencimientos) sobre todos los expedientes. */
export async function revisarCompromisosVigentes(
  ctx: ContextoCaso,
  compromisos: CompromisoPago[],
  cobrosPorContrato: Record<string, CobroPeriodo[]>,
): Promise<{ actualizados: CompromisoPago[]; incumplidos: string[] }> {
  const actualizados: CompromisoPago[] = [];
  const incumplidos: string[] = [];
  for (const cmp of compromisos.filter((c) => c.estado === 'VIGENTE')) {
    const cobros = cobrosPorContrato[cmp.contratoId] || [];
    const aplic = aplicarCobrosAlCompromiso(cmp, cobros, { fechaReferencia: hoyDe(ctx), actor: ctx.actor });
    const revisado = revisarVencimientos(aplic.compromiso, hoyDe(ctx));
    if (revisado.importeCubierto !== cmp.importeCubierto || revisado.estado !== cmp.estado) {
      await ctx.repositorio.guardarCompromiso(revisado);
      actualizados.push(revisado);
      if (revisado.estado === 'INCUMPLIDO') {
        incumplidos.push(revisado.id);
        // El incumplimiento del calendario es un HECHO del expediente: se registra
        // como transición (append-only) y se emite el evento de recobro por GAP 1.
        const expediente = await ctx.repositorio.leerExpediente(revisado.expedienteId);
        if (expediente && expediente.estado === 'COMPROMISO_PAGO') {
          const t = aplicarTransicionEnExpediente(
            expediente,
            'COMPROMISO_INCUMPLIDO',
            'COMPROMISO_INCUMPLIDO',
            {
              actor: ctx.actor as UsuarioApp,
              fecha: fechaHoyISO(hoyDe(ctx)),
              observaciones: `Calendario ${revisado.id}: cuota vencida sin cobertura en la fuente canónica de cobros.`,
              exigeMascParaJuridica: false,
            } as never,
          );
          if (t.ok && t.expediente && t.transicion) {
            await ctx.repositorio.guardarExpediente(t.expediente);
            await appendSeguro(ctx, t.transicion);
          }
          await ctx.repositorio
            .auditar('MOROSIDAD_COMPROMISO_INCUMPLIDO', `Compromiso ${revisado.id} incumplido en ${revisado.expedienteId}.`, {
              expedienteId: revisado.expedienteId,
              compromisoId: revisado.id,
              saldo: expediente.saldoPendiente,
            })
            .catch(() => undefined);
          await emitirEvento(t.expediente || expediente, undefined, 'compromiso.incumplido', ctx).catch(() => undefined);
        }
      }
    }
  }
  return { actualizados, incumplidos };
}
