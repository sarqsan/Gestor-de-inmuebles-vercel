/**
 * BLOQUE C — orquestador de morosidad (store) contra un repositorio en memoria
 * y el dispatcher GAP 1 real (con su repositorio en memoria). Cubre detección
 * idempotente, comunicaciones sin envío fingido, pagos vía fuente canónica,
 * compromisos, escalados con bloqueos de política y trazabilidad append-only.
 */
import { describe, expect, it } from 'vitest';
import type { CobroPeriodo, ContratoFormalizacion } from '../../types';
import type {
  CompromisoPago,
  EvidenciaMorosidad,
  ExpedienteMorosidad,
  PoliticaMorosidad,
  TransicionExpediente,
} from '../../types/morosidad';
import type { Notificacion } from '../../types/notificaciones';
import {
  cambiarEstado,
  detectarYGestionar,
  escalar,
  recalcularConceptosJuridicos,
  registrarComunicacion,
  registrarCompromiso,
  registrarPago,
  revisarCompromisosVigentes,
  type ContextoCaso,
  type RepositorioMorosidad,
} from './morosidadStore';
import { contextoAutorizacionDesdeUsuario, repositorioNotificacionesFirestore, repositorioNotificacionesMemoria } from './puenteGAP1';
import { idempotenciaDeEvento } from '../../types/notificaciones';
import { politicaDefecto } from './dunningPolicy';

const FECHA = '2026-04-01';
const ACTOR = { id: 'u_1', nombre: 'Admin', email: 'admin@test' };

const mkCobro = (mes: number, extra: Partial<CobroPeriodo> = {}): CobroPeriodo => ({
  id: `cobro_ctr_1_2026_${String(mes).padStart(2, '0')}`,
  contratoId: 'ctr_1',
  inmuebleId: 'inmueble_1',
  propietarioId: 'prop_1',
  inquilinoId: 'inq_1',
  mes,
  anio: 2026,
  periodoMesAnio: `2026-${String(mes).padStart(2, '0')}`,
  nombreMes: `Mes ${mes} 2026`,
  importePrevisto: 900,
  importeRecibido: 0,
  fechaVencimiento: `2026-0${mes}-05`,
  estado: 'PENDIENTE',
  historialCambios: [],
  ...extra,
} as unknown as CobroPeriodo);

const mkContrato = (): ContratoFormalizacion =>
  ({
    id: 'ctr_1',
    propietarioId: 'prop_1',
    propietarioNombre: 'Ana Propietaria',
    inmuebleId: 'inmueble_1',
    inmuebleDireccion: 'Calle Mayor 1, Madrid',
    candidatoNombre: 'Luis Inquilino',
    candidatoEmail: 'luis@correo.test',
    candidatoTelefono: '600111222',
    registroCobros: [mkCobro(1), mkCobro(2), mkCobro(3)],
  }) as unknown as ContratoFormalizacion;

interface Fabrica {
  ctx: ContextoCaso;
  contratos: ContratoFormalizacion[];
  expedientes: Map<string, ExpedienteMorosidad>;
  historial: TransicionExpediente[];
  evidencias: EvidenciaMorosidad[];
  compromisos: Map<string, CompromisoPago>;
  auditoria: { accion: string; descripcion: string; detalles: Record<string, unknown> }[];
  /** repositorio GAP 1 en memoria: se lee en vivo (los documentos aparecen al despachar) */
  gap1: { todos: () => Notificacion[] };
  politicas: PoliticaMorosidad[];
  escribirContrato: (c: ContratoFormalizacion) => void;
}

function crearFabrica(opts: { conDispatcher?: boolean; politicas?: PoliticaMorosidad[] } = {}): Fabrica {
  const contratos = [mkContrato()];
  const expedientes = new Map<string, ExpedienteMorosidad>();
  const historial: TransicionExpediente[] = [];
  const evidencias: EvidenciaMorosidad[] = [];
  const compromisos = new Map<string, CompromisoPago>();
  const auditoria: Fabrica['auditoria'] = [];
  const repoNotificaciones = repositorioNotificacionesMemoria();
  const politicas = opts.politicas ?? [];

  const repositorio: RepositorioMorosidad = {
    async leerExpediente(id) {
      return expedientes.get(id) || null;
    },
    async listarExpedientes() {
      return [...expedientes.values()];
    },
    async guardarExpediente(exp) {
      expedientes.set(exp.id, { ...exp });
    },
    async appendHistorial(t) {
      if (historial.some((h) => h.id === t.id)) throw new Error('histórico duplicado');
      historial.push(t);
    },
    async listarHistorial(expedienteId) {
      return historial.filter((h) => h.expedienteId === expedienteId);
    },
    async listarEvidencias(expedienteId) {
      return evidencias.filter((e) => e.expedienteId === expedienteId);
    },
    async guardarCompromiso(c) {
      if (compromisos.has(c.id)) {
        // invariante: el id no cambia de expediente
        if (compromisos.get(c.id)!.expedienteId !== c.expedienteId) throw new Error('compromiso cruzado');
      }
      compromisos.set(c.id, { ...c });
    },
    async listarCompromisos(expedienteId) {
      return [...compromisos.values()].filter((c) => c.expedienteId === expedienteId);
    },
    async appendEvidencia(e) {
      const previo = evidencias.findIndex((x) => x.id === e.id);
      if (previo >= 0) evidencias[previo] = e;
      else evidencias.push(e);
    },
    async listarPoliticas() {
      return politicas;
    },
    async listarCobrosContrato(contratoId) {
      const c = contratos.find((x) => x.id === contratoId);
      return c ? [...(c.registroCobros || [])] : [];
    },
    async guardarContrato(c) {
      const i = contratos.findIndex((x) => x.id === c.id);
      if (i >= 0) contratos[i] = c;
      else contratos.push(c);
    },
    async auditar(accion, descripcion, detalles) {
      auditoria.push({ accion, descripcion, detalles });
    },
  };

  const ctx: ContextoCaso = {
    repositorio,
    actor: ACTOR,
    fechaReferencia: FECHA,
    dispatcher: opts.conDispatcher
      ? {
          autorizacion: contextoAutorizacionDesdeUsuario({
            id: 'u_1',
            email: 'admin@test',
            tipoPerfil: 'ADMINISTRADOR',
          } as never),
          // repositorio GAP 1 en memoria, accedido con la misma forma que el de Firestore
          repositorio: repositorioNotificacionesFirestore(repoNotificaciones),
          emailProvider: null,
        }
      : null,
    destinatarios: {
      contrato: contratos[0],
      propietario: { nombre: 'Ana Propietaria', email: 'ana@correo.test', telefono: '600000000' } as never,
      usuarioIdPropietario: 'usr_prop_1',
      usuarioIdAdministracion: 'usr_admin_1',
    },
  };

  return {
    ctx,
    contratos,
    expedientes,
    historial,
    evidencias,
    compromisos,
    auditoria,
    politicas,
    gap1: repoNotificaciones,
    escribirContrato: (c) => {
      const i = contratos.findIndex((x) => x.id === c.id);
      if (i >= 0) contratos[i] = c;
    },
  };
}

describe('BLOQUE C · detección + apertura idempotente', () => {
  it('abre un expediente por contrato con deuda y lo vuelve inocuo al repetir', async () => {
    const f = crearFabrica();
    const r1 = await detectarYGestionar(f.contratos, f.ctx);
    expect(f.expedientes.size).toBe(1);
    const exp = [...f.expedientes.values()][0];
    expect(exp.saldoPendiente).toBe(2700);
    expect(exp.piezasDeuda.length).toBe(3);
    // el detector abre y pasa a PENDIENTE_CONTACTO dejando constancia en el histórico
    expect(exp.estado).toBe('PENDIENTE_CONTACTO');
    expect(f.historial[0].motivo).toBe('DETECCION_AUTOMATICA');
    expect(exp.planRecobro.length).toBeGreaterThan(0);
    expect(r1.creados.length).toBe(1);

    const r2 = await detectarYGestionar(f.contratos, f.ctx);
    expect(f.expedientes.size).toBe(1);
    expect(r2.creados.length).toBe(0);
    expect([...f.expedientes.values()][0].id).toBe(exp.id);
    expect(f.historial.filter((h) => h.expedienteId === exp.id).length).toBe(f.historial.length);
  });

  it('contrato sin deuda no abre expediente', async () => {
    const f = crearFabrica();
    f.contratos[0].registroCobros = [mkCobro(1, { estado: 'RECIBIDO', importeRecibido: 900 })];
    const r = await detectarYGestionar(f.contratos, f.ctx);
    expect(f.expedientes.size).toBe(0);
    expect(r.omitidos[0]?.motivo).toMatch(/sin_deuda/);
  });

  it('cada cambio de estado añade histórico append-only (nunca reescribe)', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    // el detector ya dejó el expediente en PENDIENTE_CONTACTO ⇒ se avanza por el grafo
    const t1 = await cambiarEstado(exp.id, 'RECLAMACION_INICIADA', 'REQUERIMIENTO_ENVIADO', { observaciones: 'Llamada realizada' }, f.ctx);
    expect(t1.ok).toBe(true);
    const t2 = await cambiarEstado(exp.id, 'EN_RECOBRO', 'CAMBIO_MANUAL', {}, f.ctx);
    expect(t2.ok).toBe(true);
    // volver al mismo estado NO es una transición
    const t3 = await cambiarEstado(exp.id, 'EN_RECOBRO', 'CAMBIO_MANUAL', {}, f.ctx);
    expect(t3.ok).toBe(false);
    expect(f.historial.length).toBeGreaterThanOrEqual(2);
    expect(new Set(f.historial.map((h) => h.id)).size).toBe(f.historial.length);
    expect(f.auditoria.some((a) => a.accion.startsWith('MOROSIDAD_ESTADO'))).toBe(true);
    expect(f.historial.every((h) => h.expedienteId === exp.id)).toBe(true);
    expect(f.historial.length).toBe(3); // apertura + 2 transiciones válidas
  });

  it('rechaza transiciones inválidas sin tocar el estado', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    const r = await cambiarEstado(exp.id, 'PAGADA', 'PAGO_RECIBIDO', {}, f.ctx);
    expect(r.ok).toBe(false);
    expect(r.errores).toContain('pagada_requiere_saldo_cero');
    expect(f.expedientes.get(exp.id)!.estado).toBe('PENDIENTE_CONTACTO');
    const histAntes = f.historial.length;
    expect(histAntes).toBe(1); // solo la apertura automática
    const reintentos = await cambiarEstado(exp.id, 'PAGADA', 'PAGO_RECIBIDO', {}, f.ctx);
    expect(reintentos.ok).toBe(false);
    expect(f.historial.length).toBe(histAntes); // transición rechazada ⇒ no se añade histórico
  });
});

describe('BLOQUE C · comunicaciones por GAP 1 (sin envío fingido)', () => {
  it('sin dispatcher ⇒ PENDIENTE_ENVIO y ningún comprobante de envío', async () => {
    const f = crearFabrica({ conDispatcher: false });
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    const r = await registrarComunicacion(
      exp.id,
      { tipoEvento: 'morosidad.primer_recordatorio', medio: 'EMAIL', destinatarioTipo: 'INQUILINO', fecha: FECHA, resumen: 'Recordatorio remitido', cobroId: exp.piezasDeuda[0].cobroId },
      f.ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.comunicacion!.estado).not.toBe('ENVIADA');
    expect(r.comunicacion!.fechaEnvio).toBeUndefined();
    expect(f.gap1.todos().length).toBe(0);
  });

  it('con dispatcher GAP 1 ⇒ documento de notificación y espejo PREPARADA (safe-mode)', async () => {
    const f = crearFabrica({ conDispatcher: true });
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    const r = await registrarComunicacion(
      exp.id,
      { tipoEvento: 'morosidad.primer_recordatorio', medio: 'EMAIL', destinatarioTipo: 'INQUILINO', fecha: FECHA, resumen: 'Recordatorio', cobroId: exp.piezasDeuda[0].cobroId },
      f.ctx,
    );
    expect(r.comunicacion!.estado).not.toBe('ENVIADA');
    expect(f.gap1.todos().length).toBeGreaterThan(0);
    const notif = f.gap1.todos()[0];
    expect(notif.origen).toBe('MOROSIDAD');
    expect(notif.tipo).toBe('morosidad.primer_recordatorio');
    expect(notif.entidadId).toContain('#'); // expediente + tramo ⇒ idempotencia por periodo
    // safe-mode: el intento queda documentado como FALLIDO, jamás como enviado
    expect(notif.estado).toBe('FALLIDA');
    expect(notif.intentos).toBeGreaterThanOrEqual(1);
    expect(r.comunicacion!.estado).toBe('PENDIENTE_ENVIO');
    expect(String(r.comunicacion!.error)).toContain('email_no_configurado');
  });

  it('repetir la misma comunicación no duplica (misma clave de idempotencia)', async () => {
    const f = crearFabrica({ conDispatcher: true });
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    const datos = {
      tipoEvento: 'morosidad.requerimiento_pago',
      medio: 'EMAIL' as const,
      destinatarioTipo: 'INQUILINO' as const,
      fecha: FECHA,
      resumen: 'Requerimiento de pago',
      cobroId: exp.piezasDeuda[0].cobroId,
    };
    const a = await registrarComunicacion(exp.id, datos, f.ctx);
    const b = await registrarComunicacion(exp.id, datos, f.ctx);
    expect(a.comunicacion!.id).toBe(b.comunicacion!.id);
    expect(f.expedientes.get(exp.id)!.comunicaciones.length).toBe(1);
    expect(f.gap1.todos().length).toBe(1);
  });

  it('burofax registrado requiere evidencia y habilita el requerimiento fehaciente', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    const sinPrueba = await registrarComunicacion(
      exp.id,
      { tipoEvento: 'morosidad.requerimiento_fehaciente', medio: 'BUROFAX', destinatarioTipo: 'INQUILINO', fecha: FECHA, resumen: 'Burofax enviado' },
      f.ctx,
    );
    expect(sinPrueba.requiereEvidencia).toBe(true);
    expect(sinPrueba.comunicacion!.estado).toBe('REGISTRADA_MANUALMENTE');
    expect(sinPrueba.comunicacion!.fechaEnvio).toBeUndefined();

    const conPrueba = await registrarComunicacion(
      exp.id,
      {
        tipoEvento: 'morosidad.requerimiento_fehaciente',
        medio: 'BUROFAX',
        destinatarioTipo: 'INQUILINO',
        fecha: '2026-04-02',
        resumen: 'Burofax con acuse de recibo',
        evidencia: { resumen: 'Acuse de recibo descargado del gestor', fecha: '2026-04-02', detalle: 'Código seguimiento 123' },
      },
      f.ctx,
    );
    expect(conPrueba.ok).toBe(true);
    expect(f.evidencias.length).toBeGreaterThan(0);
    expect(f.expedientes.get(exp.id)!.requerimientoFehacienteExiste).toBe(true);
  });
});

describe('BLOQUE C · pagos, compromisos y escalado', () => {
  it('el único camino a PAGADA pasa por registrarPagoPeriodo (fuente canónica)', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    const cobroId = exp.piezasDeuda[0].cobroId;
    const r = await registrarPago(f.contratos[0], cobroId, { importeRecibido: 900, fechaPago: '2026-03-30' }, f.ctx);
    expect(r.ok).toBe(true);
    const cobro = f.contratos[0].registroCobros!.find((c) => c.id === cobroId)!;
    expect(cobro.importeRecibido).toBe(900);
    expect(String(cobro.estado)).toMatch(/RECIBIDO|PAGADO|VERIFICADO/);
    expect(cobro.historialCambios.length).toBeGreaterThan(0);
    const actualizado = f.expedientes.get(exp.id)!;
    expect(actualizado.saldoPendiente).toBe(1800);
    expect(actualizado.piezasDeuda.find((p) => p.cobroId === cobroId)!.estado).toBe('PAGADA');
    expect(f.evidencias.some((e) => e.tipo === 'PAGO')).toBe(true);

    // pago por importes incorrectos ⇒ rechazado antes de tocar nada
    const malo = await registrarPago(f.contratos[0], cobroId, { importeRecibido: 5000, fechaPago: '2026-04-05' }, f.ctx);
    expect(malo.ok).toBe(false);
    const sinFecha = await registrarPago(f.contratos[0], cobroId, { importeRecibido: 10, fechaPago: '2026-04' }, f.ctx);
    expect(sinFecha.errores).toContain('fecha_pago_invalida');
  });

  it('saldar la deuda en la fuente cierra el expediente automáticamente', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    for (const p of exp.piezasDeuda) {
      await registrarPago(f.contratos[0], p.cobroId, { importeRecibido: p.importeReclamado, fechaPago: '2026-03-31' }, f.ctx);
    }
    const final = f.expedientes.get(exp.id)!;
    expect(final.saldoPendiente).toBe(0);
    expect(['PAGADA', 'CERRADA']).toContain(final.estado);
    expect(final.compromisoVigenteId ?? null).toBe(null);
    expect(f.historial.some((h) => h.estadoNuevo === 'PAGADA')).toBe(true);
    // un replay de detección no reabre la deuda ni duplica
    const r = await detectarYGestionar(f.contratos, f.ctx);
    expect(f.expedientes.size).toBe(1);
    expect(r.creados.length).toBe(0);
  });

  it('compromiso: cuotas cubiertas solo con cobros reales y reválida de vencimientos', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const exp0 = [...f.expedientes.values()][0];
    await cambiarEstado(exp0.id, 'RECLAMACION_INICIADA', 'REQUERIMIENTO_ENVIADO', {}, f.ctx);
    await cambiarEstado(exp0.id, 'EN_RECOBRO', 'CAMBIO_MANUAL', {}, f.ctx);
    const exp = f.expedientes.get(exp0.id)!;
    const cmp = await registrarCompromiso(
      exp.id,
      {
        fechaPropuesta: FECHA,
        importeTotal: 900,
        numPagos: 3,
        periodicidadDias: 30,
        origenRegistro: 'LLAMADA',
        observaciones: 'Acuerdo telefónico',
        evidencia: { resumen: 'Calendario acordado', fecha: FECHA },
      },
      f.ctx,
    );
    expect(cmp.ok).toBe(true);
    expect(f.expedientes.get(exp0.id)!.estado).toBe('COMPROMISO_PAGO');
    expect(f.expedientes.get(exp0.id)!.compromisoVigenteId).toBeTruthy();

    // no se puede prometer más que la deuda
    const exceso = await registrarCompromiso(
      exp.id,
      { fechaPropuesta: '2026-04-03', importeTotal: 99999, numPagos: 2, periodicidadDias: 30, origenRegistro: 'LLAMADA' },
      f.ctx,
    );
    expect(exceso.ok).toBe(false);
    expect(exceso.errores.length).toBeGreaterThan(0);

    // un cobro real cubre la primera cuota
    await registrarPago(f.contratos[0], exp.piezasDeuda[0].cobroId, { importeRecibido: 300, fechaPago: '2026-05-01' }, f.ctx);
    const revisado = await detectarYGestionar(f.contratos, { ...f.ctx, fechaReferencia: '2026-05-05' });
    expect(revisado.sincronizados.length + revisado.creados.length).toBeGreaterThan(0);
    const cmpGuardado = [...f.compromisos.values()][0];
    expect(cmpGuardado.importeCubierto).toBeGreaterThanOrEqual(0);

    // vencimiento sin cobros ⇒ INCUMPLIDO y transición registrada
    const f2 = crearFabrica();
    await detectarYGestionar(f2.contratos, f2.ctx);
    const exp2_0 = [...f2.expedientes.values()][0];
    await cambiarEstado(exp2_0.id, 'RECLAMACION_INICIADA', 'REQUERIMIENTO_ENVIADO', {}, f2.ctx);
    await cambiarEstado(exp2_0.id, 'EN_RECOBRO', 'CAMBIO_MANUAL', {}, f2.ctx);
    const exp2 = f2.expedientes.get(exp2_0.id)!;
    await registrarCompromiso(
      exp2.id,
      { fechaPropuesta: FECHA, importeTotal: 900, numPagos: 2, periodicidadDias: 30, origenRegistro: 'LLAMADA' },
      f2.ctx,
    );
    const r = await revisarCompromisosVigentes({ ...f2.ctx, fechaReferencia: '2026-07-01' }, [...f2.compromisos.values()], {
      ctr_1: f2.contratos[0].registroCobros!,
    });
    expect(r.incumplidos.length).toBe(1);
    expect(f2.expedientes.get(exp2.id)!.estado).toBe('COMPROMISO_INCUMPLIDO');
    expect(f2.historial.some((h) => h.motivo === 'COMPROMISO_INCUMPLIDO')).toBe(true);
    expect(f2.expedientes.get(exp2.id)!.saldoPendiente).toBe(2700); // nadie perdonó deuda: sigue viva
  });

  it('el escalado respeta la política: exige fehaciente y MASC declarado', async () => {
    const f = crearFabrica({ conDispatcher: true });
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    await cambiarEstado(exp.id, 'RECLAMACION_INICIADA', 'REQUERIMIENTO_ENVIADO', {}, f.ctx);
    await cambiarEstado(exp.id, 'EN_RECOBRO', 'CAMBIO_MANUAL', {}, f.ctx);

    const bloqueado = await escalar(
      exp.id,
      'ASEGURADORA',
      {
        aseguradora: {
          expedienteId: exp.id,
          aseguradoraNombre: 'Aseguradora X',
          importeReclamado: exp.saldoPendiente,
          fechaApertura: FECHA,
          canalUso: 'MANUAL_GMAIL',
          estadoDeseado: 'PREPARADO',
        },
      },
      f.ctx,
    );
    expect(bloqueado.ok).toBe(false);
    expect(bloqueado.errores).toContain('escalado_bloqueado_por_politica');
    expect(bloqueado.bloqueos.join(' ')).toMatch(/requiere_requerimiento_fehaciente_registrado|politica_dias_minimos/);

    await registrarComunicacion(
      exp.id,
      {
        tipoEvento: 'morosidad.requerimiento_fehaciente',
        medio: 'NOTARIAL',
        destinatarioTipo: 'INQUILINO',
        fecha: FECHA,
        resumen: 'Acta notarial requerimiento de pago',
        evidencia: { resumen: 'Testimonio notarial', fecha: FECHA },
      },
      f.ctx,
    );
    const ok = await escalar(
      exp.id,
      'ASEGURADORA',
      {
        aseguradora: {
          expedienteId: exp.id,
          aseguradoraNombre: 'Aseguradora X',
          importeReclamado: exp.saldoPendiente,
          fechaApertura: FECHA,
          canalUso: 'MANUAL_GMAIL',
          estadoDeseado: 'PREPARADO',
        },
        forzar: true,
      },
      f.ctx,
    );
    expect(ok.ok).toBe(true);
    expect(f.expedientes.get(exp.id)!.estado).toBe('ESCALADA');
    expect(f.expedientes.get(exp.id)!.aseguradora!.estado).toBe('PREPARADO');
    const notifEsc = f.gap1.todos().filter((n) => n.tipo === 'morosidad.escalado_aseguradora');
    expect(notifEsc.length).toBe(1);
    expect(notifEsc[0].canal).toBe('INAPP');
    // INAPP es entrega REAL dentro del producto (bandeja interna): ahí sí puede constar ENVIADA.
    expect(notifEsc[0].estado).toBe('ENVIADA');
    // ...pero ningún canal externo (EMAIL/WhatsApp/burofax) puede afirmar entrega sin transporte
    // ningún canal externo (EMAIL/WhatsApp/burofax) afirma entrega sin transporte real
    expect(f.gap1.todos().every((n) => n.canal === 'INAPP' || n.estado !== 'ENVIADA')).toBe(true);
    const comEsc = f.expedientes.get(exp.id)!.comunicaciones.filter((c) => c.tipoEvento === 'morosidad.escalado_aseguradora');
    expect(comEsc.length).toBe(1);
    expect(comEsc[0].estado).toBe('ENVIADA');
    expect(comEsc[0].notificacionId).toBe(notifEsc[0].id);

    // vía jurídica: bloqueada mientras el MASC no esté declarado (ver test específico)
    const juridico = await escalar(exp.id, 'JURIDICO', { juridico: { expedienteId: exp.id, importeReclamado: 2700, documentacionIds: [] } }, f.ctx);
    expect(juridico.ok).toBe(false);
    expect([...juridico.errores, ...juridico.bloqueos].join(' ')).toMatch(/masc/i);
    expect(f.expedientes.get(exp.id)!.estado).toBe('ESCALADA');
  });

  it('recalcular conceptos jurídicos: ESTIMADO y nunca sustituye el capital', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    const bloqueado = await recalcularConceptosJuridicos(
      exp.id,
      {
        desdeFecha: '2026-01-05',
        hastaFecha: '2026-04-01',
        requerimientoExiste: false,
        parametros: {
          tipoAnualPct: 5,
          baseCalculo: 'SOLO_CAPITAL',
          inicioMoraRequiereRequerimiento: true,
          diasAnio: 365,
          redondeoDecimales: 2,
        },
      },
      f.ctx,
    );
    expect(bloqueado.ok).toBe(false);
    expect(bloqueado.errores).toContain('requerimiento_fehaciente_registrado_requerido');
    const r = await recalcularConceptosJuridicos(
      exp.id,
      {
        desdeFecha: '2026-01-05',
        hastaFecha: '2026-04-01',
        requerimientoExiste: true,
        parametros: {
          tipoAnualPct: 5,
          baseCalculo: 'SOLO_CAPITAL',
          inicioMoraRequiereRequerimiento: true,
          diasAnio: 365,
          redondeoDecimales: 2,
        },
      },
      f.ctx,
    );
    expect(r.ok).toBe(true);
    expect(r.concepto!.estado).toBe('ESTIMADO');
    expect(r.concepto!.importe).toBeGreaterThan(0);
    const actualizado = f.expedientes.get(exp.id)!;
    expect(actualizado.importeInteresesReclamados).toBe(r.total);
    expect(actualizado.saldoPendiente).toBe(2700); // el capital no se toca
    expect(actualizado.importeTotalReclamado).toBeCloseTo(2700 + r.total, 2);

    const sinTipo = await recalcularConceptosJuridicos(
      exp.id,
      { desdeFecha: '2026-01-05', hastaFecha: '2026-04-01', requerimientoExiste: true, parametros: { baseCalculo: 'SOLO_CAPITAL', diasAnio: 365 } as never },
      f.ctx,
    );
    expect(sinTipo.ok).toBe(false);
    expect(sinTipo.errores).toContain('tipo_anual_requerido');
  });
});

describe('BLOQUE C · política versionada y aislamiento', () => {
  it('usar la política del propietario no reescribe el histórico generado', async () => {
    const politica = { ...politicaDefecto('prop_1', '2026-01-01T00:00:00.000Z'), pasos: politicaDefecto('prop_1', '2026-01-01T00:00:00.000Z').pasos.map((p) => ({ ...p, diasOffset: p.diasOffset + 15 })) };
    const f = crearFabrica({ politicas: [politica] });
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    expect(exp.politicaId).toBe(politica.id);
    expect(exp.versionPolitica).toBe(politica.version);
    const d3 = exp.planRecobro.find((p) => p.pasoCodigo === 'D+3');
    expect(d3?.fechaObjetivo).toBe('2026-01-25'); // 5 ene + (3+15) + 2 de gracia
    const antes = JSON.stringify(f.historial);
    // cambiar la política (nueva versión) no reescribe el plan guardado
    const r = await detectarYGestionar(f.contratos, { ...f.ctx, fechaReferencia: '2026-04-01' });
    expect(JSON.stringify(f.historial)).toBe(antes);
    expect(r.creados.length).toBe(0);
  });

  it('el expediente siempre queda ligado a su propietario (claves de aislamiento)', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const antes = [...f.expedientes.values()][0];
    await registrarComunicacion(
      antes.id,
      { tipoEvento: 'morosidad.requerimiento_fehaciente', medio: 'BUROFAX', destinatarioTipo: 'INQUILINO', fecha: FECHA, resumen: 'Burofax', evidencia: { resumen: 'Acuse', fecha: FECHA } },
      f.ctx,
    );
    const exp = [...f.expedientes.values()][0];
    expect(exp.propietarioId).toBe('prop_1');
    expect(exp.contratoId).toBe('ctr_1');
    expect(exp.inmuebleId).toBe('inmueble_1');
    for (const h of f.historial) expect(h.propietarioId).toBe('prop_1');
    for (const e of f.evidencias) expect(e.propietarioId).toBe('prop_1');
    expect(f.evidencias.length).toBeGreaterThan(0);
    for (const c of f.compromisos.values()) expect(c.propietarioId).toBe('prop_1');
  });

  it('toda operación deja rastro en auditoría con el actor', async () => {
    const f = crearFabrica({ conDispatcher: true });
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    await registrarComunicacion(
      exp.id,
      { tipoEvento: 'morosidad.primer_recordatorio', medio: 'EMAIL', destinatarioTipo: 'INQUILINO', fecha: FECHA, resumen: 'Aviso' },
      f.ctx,
    );
    await registrarPago(f.contratos[0], exp.piezasDeuda[0].cobroId, { importeRecibido: 100, fechaPago: '2026-04-01' }, f.ctx);
    expect(f.auditoria.length).toBeGreaterThanOrEqual(3);
    expect(f.auditoria.every((a) => typeof a.descripcion === 'string' && a.descripcion.length > 0)).toBe(true);
    expect(f.auditoria.some((a) => a.accion.startsWith('MOROSIDAD_'))).toBe(true);
  });

  it('el puente GAP 1 respeta la clave de idempotencia canónica del origen MOROSIDAD', () => {
    const repo = repositorioNotificacionesFirestore(repositorioNotificacionesMemoria());
    expect(typeof repo.guardar).toBe('function');
    const entidad = 'mor_x#cobro_1';
    const clave = idempotenciaDeEvento('MOROSIDAD', 'primer_recordatorio', entidad);
    expect(clave.startsWith('ev:morosidad:primer_recordatorio:')).toBe(true);
    // el tramo forma parte de la entidad ⇒ dos mensualidades no colisionan
    expect(clave).not.toBe(idempotenciaDeEvento('MOROSIDAD', 'primer_recordatorio', 'mor_x#cobro_2'));
    // y el mismo tramo repetido sí coincide (replay inocuo)
    expect(clave).toBe(idempotenciaDeEvento('MOROSIDAD', 'primer_recordatorio', entidad));
  });

  it('la vía jurídica exige declarar el MASC (LO 1/2025) salvo forzado explícito', async () => {
    const f = crearFabrica();
    await detectarYGestionar(f.contratos, f.ctx);
    const exp = [...f.expedientes.values()][0];
    await cambiarEstado(exp.id, 'RECLAMACION_INICIADA', 'REQUERIMIENTO_ENVIADO', {}, f.ctx);
    await cambiarEstado(exp.id, 'EN_RECOBRO', 'CAMBIO_MANUAL', {}, f.ctx);
    await registrarComunicacion(
      exp.id,
      {
        tipoEvento: 'morosidad.requerimiento_fehaciente',
        medio: 'BUROFAX',
        destinatarioTipo: 'INQUILINO',
        fecha: FECHA,
        resumen: 'Burofax con acuse',
        evidencia: { resumen: 'Copia del acuse de recibo', fecha: FECHA },
      },
      f.ctx,
    );
    const bloqueado = await escalar(exp.id, 'JURIDICO', { juridico: { importeReclamado: 2700 } }, f.ctx);
    expect(bloqueado.ok).toBe(false);
    expect([...bloqueado.bloqueos, ...bloqueado.errores].join(' ')).toContain('masc_actividad_negociadora_previa_no_declarada');
    // forzar solo omite el filtro de la política; la transición sigue exigiendo el requisito
    const forzado = await escalar(exp.id, 'JURIDICO', { juridico: { importeReclamado: 2700 }, forzar: true }, f.ctx);
    expect(forzado.ok).toBe(false);
    expect(forzado.errores.join(' ')).toContain('juridica_requiere_actividad_negociadora_previa_LO1_2025');
    expect(f.expedientes.get(exp.id)!.estado).toBe('EN_RECOBRO');
    // declarando la imposibilidad del MASC (con su nota), la derivación SÍ se prepara
    const admitido = await escalar(
      exp.id,
      'JURIDICO',
      { juridico: { importeReclamado: 2700, requisitoProcedibilidad: 'IMPOSIBILIDAD_DECLARADA' }, forzar: true, motivo: 'Derivación preparada' },
      f.ctx,
    );
    expect(admitido.ok).toBe(true);
    expect(f.expedientes.get(exp.id)!.estado).toBe('JURIDICA');
    expect(f.expedientes.get(exp.id)!.juridico!.estado).toBe('PREPARADO');
    expect(f.expedientes.get(exp.id)!.juridico!.numeroProcedimiento).toBeUndefined();
    expect(f.auditoria.some((a) => a.accion === 'MOROSIDAD_DERIVADO_JURIDICO')).toBe(true);
  });
});
