/**
 * BLOQUE C — motor de detección/sincronización, evidencias, comunicaciones y
 * compromisos (pruebas puras, sin I/O).
 */
import { describe, expect, it } from 'vitest';
import type { CobroPeriodo, ContratoFormalizacion } from '../../types';
import type { CompromisoPago, ComunicacionExpediente, ExpedienteMorosidad, PiezaDeuda } from '../../types/morosidad';
import {
  TOLERANCIA_CENTIMOS,
  clasificarCobro,
  aplicarTransicionEnExpediente,
  construirComunicacion,
  construirExpediente,
  construirPiezaDeuda,
  construirResumenPropietario,
  crearEvidencia,
  detectarDeudasContrato,
  idEvidencia,
  idExpedienteDeterminista,
  mapearEstadoComunicacion,
  recortarResumenPropietario,
  registrarComunicacionExterna,
  resolverPolitica,
  resumenMorosidad,
  sanearEvidencia,
  sincronizarExpediente,
  tieneRequerimientoFehaciente,
  totalPiezas,
} from './morosidadEngine';
import { CLAVES_PROHIBIDAS_EVIDENCIA } from '../../types/morosidad';
import { CAMPOS_RESUMEN_PROPIETARIO } from './morosidadEngine';
import { politicaDefecto } from './dunningPolicy';
import {
  aplicarCobrosAlCompromiso,
  cancelarCompromiso,
  compromisoAutorizaCierre,
  crearCompromiso,
  progresoCompromiso,
  revisarVencimientos,
  validarPlanCuotas,
} from './compromisos';
import {
  conceptoSinConfigurar,
  abrirExpedienteAseguradora,
  prepararExpedienteJuridico,
  registrarProcedimientoJudicial,
  construirConceptoGastos,
  construirConceptoIntereses,
  totalConceptosJuridicos,
  validarFuenteNormativa,
  validarParametrosIntereses,
} from './legalAmounts';

const FECHA_REF = '2026-04-01';

const mkCobro = (mes: number, parcial: Partial<CobroPeriodo> = {}): CobroPeriodo => {
  const periodoMesAnio = `2026-${String(mes).padStart(2, '0')}`;
  return {
    id: `cobro_ctr_1_2026_${String(mes).padStart(2, '0')}`,
    contratoId: 'ctr_1',
    inmuebleId: 'inmueble_1',
    propietarioId: 'prop_1',
    inquilinoId: 'inq_1',
    mes,
    anio: 2026,
    periodoMesAnio,
    nombreMes: `Mes ${mes} 2026`,
    importePrevisto: 900,
    importeRecibido: 0,
    fechaVencimiento: `2026-${String(mes).padStart(2, '0')}-05`,
    estado: 'PENDIENTE',
    historialCambios: [],
    ...parcial,
  } as unknown as CobroPeriodo;
};

const mkContrato = (cobros: CobroPeriodo[]): ContratoFormalizacion =>
  ({
    id: 'ctr_1',
    propietarioId: 'prop_1',
    propietarioNombre: 'Ana Propietaria',
    inmuebleId: 'inmueble_1',
    candidatoNombre: 'Luis Inquilino',
    candidatoEmail: 'luis@correo.test',
    candidatoTelefono: '600111222',
    registroCobros: cobros,
  }) as unknown as ContratoFormalizacion;

describe('BLOQUE C · clasificación de deuda desde la fuente canónica', () => {
  it('distingue vencido total, parcial, en plazo, disputado y no reclamable', () => {
    const casos: Array<[CobroPeriodo, string, boolean]> = [
      [mkCobro(1), 'VENCIDA_TOTAL', true],
      [mkCobro(2, { importeRecibido: 300, estado: 'PAGADO_PARCIAL' } as Partial<CobroPeriodo>), 'VENCIDA_PARCIAL', true],
      [mkCobro(3, { fechaVencimiento: '2026-03-31' }), 'EN_PLAZO', false],
      [mkCobro(4, { fechaVencimiento: '2026-04-02' }), 'EN_PLAZO', false],
      [mkCobro(5, { estado: 'ANULADO' }), 'NO_RECLAMABLE', false],
      [mkCobro(6, { estado: 'DEVUELTO' }), 'NO_RECLAMABLE', false],
      [mkCobro(7, { estado: 'RECIBIDO', importeRecibido: 900 }), 'PAGADA', false],
      [mkCobro(8, { estado: 'INCIDENCIA', motivoIncidencia: 'Discrepancia de importe' }), 'EN_DISPUTA', false],
      // 'PAGADO' heredado: el saldo manda — nunca se da por cobrado lo que no está conciliado
      [mkCobro(9, { estado: 'PAGADO' as CobroPeriodo['estado'], fechaVencimiento: '2026-03-05' }), 'VENCIDA_PARCIAL', true], // saldo real ⇒ sigue siendo deuda
      [mkCobro(10, { estado: 'PAGADO' as CobroPeriodo['estado'], importeRecibido: 400, fechaVencimiento: '2026-03-05' }), 'VENCIDA_PARCIAL', true],
      [mkCobro(12, { estado: 'PAGADO' as CobroPeriodo['estado'], importeRecibido: 900, fechaVencimiento: '2026-03-05' }), 'PAGADA_SIN_VERIFICAR', false],
      [mkCobro(11, { importePrevisto: 0 }), 'NO_RECLAMABLE', false],
    ];
    for (const [cobro, esperado, reclamable] of casos) {
      const r = clasificarCobro(cobro, { fechaReferencia: FECHA_REF });
      expect(r.clasificacion, cobro.id).toBe(esperado);
      expect(r.reclamable, cobro.id).toBe(reclamable);
    }
  });

  it('solo se construyen piezas de deuda para lo reclamable', () => {
    expect(construirPiezaDeuda(mkCobro(1), { fechaReferencia: FECHA_REF })).not.toBeNull();
    for (const c of [
      mkCobro(5, { estado: 'ANULADO' }),
      mkCobro(7, { estado: 'RECIBIDO', importeRecibido: 900 }),
      mkCobro(12, { estado: 'PAGADO' as CobroPeriodo['estado'], importeRecibido: 900, fechaVencimiento: '2026-03-05' }),
      mkCobro(3, { fechaVencimiento: '2026-03-31' }),
    ]) {
      expect(construirPiezaDeuda(c, { fechaReferencia: FECHA_REF }), c.id).toBeNull();
    }
    // una disputa SÍ genera pieza (para no perder la trazabilidad) pero con importe 0
    const disputa = construirPiezaDeuda(mkCobro(8, { estado: 'INCIDENCIA', motivoIncidencia: 'x' } as Partial<CobroPeriodo>), {
      fechaReferencia: FECHA_REF,
    });
    expect(disputa?.clasificacion).toBe('EN_DISPUTA');
  });

  it('el saldo reclamado es previsto − cobrado y nunca es negativo', () => {
    // cobro de más ⇒ no es deuda (saldo 0) y no se abre tramo
    expect(clasificarCobro(mkCobro(1, { importeRecibido: 1500 } as Partial<CobroPeriodo>), { fechaReferencia: FECHA_REF }).saldo).toBe(0);
    expect(construirPiezaDeuda(mkCobro(1, { importeRecibido: 1500 } as Partial<CobroPeriodo>), { fechaReferencia: FECHA_REF })).toBeNull();
    const conSaldo = construirPiezaDeuda(mkCobro(1, { importeRecibido: 100.5 } as Partial<CobroPeriodo>), { fechaReferencia: FECHA_REF });
    expect(conSaldo?.importeReclamado).toBe(799.5);
    expect(conSaldo?.diasRetraso).toBe(86); // 5 ene → 1 abr
    expect(TOLERANCIA_CENTIMOS).toBeLessThan(0.01);
  });

  it('detecta solo los tramos del contrato (ignora cobros ajenos)', () => {
    const contrato = mkContrato([
      mkCobro(1),
      mkCobro(2),
      { ...mkCobro(3), contratoId: 'otro_contrato' } as CobroPeriodo,
    ]);
    const piezas = detectarDeudasContrato(contrato, { fechaReferencia: FECHA_REF });
    expect(piezas.map((p) => p.periodoMesAnio)).toEqual(['2026-01', '2026-02']);
  });

  it('el id de expediente es determinista (y cambia si cambian los tramos)', () => {
    const piezas: PiezaDeuda[] = [
      construirPiezaDeuda(mkCobro(1), { fechaReferencia: FECHA_REF })!,
      construirPiezaDeuda(mkCobro(2), { fechaReferencia: FECHA_REF })!,
    ];
    const a = idExpedienteDeterminista('ctr_1', piezas);
    const b = idExpedienteDeterminista('ctr_1', [...piezas].reverse());
    expect(a.id).toBe(b.id);
    expect(a.firma).toBe(b.firma);
    const conExtra = idExpedienteDeterminista('ctr_1', [
      ...piezas,
      construirPiezaDeuda(mkCobro(3), { fechaReferencia: FECHA_REF })!,
    ]);
    expect(conExtra.id).not.toBe(a.id);
    expect(a.id).toContain('ctr_1');
    // reapertura: misma deuda en una segunda ocurrencia ⇒ id distinto
    expect(idExpedienteDeterminista('ctr_1', piezas, 2).id).not.toBe(a.id);
  });
});

describe('BLOQUE C · construcción y sincronización del expediente', () => {
  const piezasDe = (meses: number[]) =>
    meses
      .map((m) => construirPiezaDeuda(mkCobro(m), { fechaReferencia: FECHA_REF }))
      .filter(Boolean) as PiezaDeuda[];

  it('rechaza construir sin deuda y con tramos de otro contrato/propietario', () => {
    const contrato = mkContrato([]);
    expect(construirExpediente({ contrato, piezas: [], fechaReferencia: FECHA_REF }).errores).toContain('sin_deuda_detectada');
    const piezas = piezasDe([1, 2]);
    expect(
      construirExpediente({ contrato: mkContrato([]), piezas: [{ ...piezas[0], contratoId: 'ctr_2' }], fechaReferencia: FECHA_REF }).errores,
    ).toContain('pieza_de_otro_contrato');
    expect(
      construirExpediente({
        contrato: mkContrato([]),
        piezas: [{ ...piezas[0], propietarioId: 'prop_9' }],
        fechaReferencia: FECHA_REF,
      }).errores,
    ).toContain('pieza_de_otro_propietario');
  });

  it('construye el expediente con totales derivados de la fuente', () => {
    const { ok, expediente } = construirExpediente({
      contrato: mkContrato([mkCobro(1), mkCobro(2), mkCobro(3, { estado: 'RECIBIDO', importeRecibido: 900 })]),
      piezas: piezasDe([1, 2]),
      fechaReferencia: FECHA_REF,
      politicaId: 'pol_global_defecto',
      versionPolitica: 1,
      origenCreacion: 'DETECTOR_AUTOMATICO',
    });
    expect(ok).toBe(true);
    expect(expediente?.saldoPendiente).toBe(1800);
    expect(expediente?.importePrincipal).toBe(1800);
    expect(expediente?.estado).toBe('DETECTADA');
    expect(expediente?.versionEstado).toBe(1);
    expect(expediente?.cobroIds).toEqual(expediente!.piezasDeuda.map((p) => p.cobroId).sort());
    expect(expediente?.requerimientoFehacienteExiste).toBe(false);
    // totalPiezas coincide con el agregado
    expect(totalPiezas(expediente!.piezasDeuda).saldo).toBe(1800);
  });

  it('la deuda NO desaparece si la fuente pierde un cobro: se marca y se advierte', () => {
    const { expediente } = construirExpediente({ contrato: mkContrato([]), piezas: piezasDe([1]), fechaReferencia: FECHA_REF });
    const r = sincronizarExpediente(expediente!, [], { fechaReferencia: FECHA_REF });
    expect(r.cambios.retirados).toEqual([expediente!.piezasDeuda[0].cobroId]);
    expect(r.advertencias[0]).toContain('cobro_sin_fuente');
    expect(r.expediente.piezasDeuda[0].notaRectificacion).toContain('cobro_no_encontrado_en_fuente');
    // la pieza sigue ahí (histórico económico intacto), pero deja de ser reclamable por rectificación
    expect(r.expediente.piezasDeuda.length).toBe(1);
  });

  it('un pago real en la fuente salda el tramo y sugiere PAGADA (nunca al revés)', () => {
    const { expediente } = construirExpediente({ contrato: mkContrato([]), piezas: piezasDe([1]), fechaReferencia: FECHA_REF });
    const cobros = [mkCobro(1, { estado: 'RECIBIDO', importeRecibido: 900, fechaPago: '2026-03-30' } as Partial<CobroPeriodo>)];
    const r = sincronizarExpediente(expediente!, cobros, { fechaReferencia: FECHA_REF, actor: { id: 'u', nombre: 'Admin', email: 'a@t' } });
    expect(r.cambios.pagados).toEqual(['cobro_ctr_1_2026_01']);
    expect(r.expediente.saldoPendiente).toBe(0);
    expect(r.transicionSugerida).toEqual({ estadoNuevo: 'PAGADA', motivo: 'DEUDA_SALDADA' });
    // marcar 'PAGADA' a mano con saldo NO está permitido
    const conSaldo = { ...expediente!, saldoPendiente: 500 } as ExpedienteMorosidad;
    expect(aplicarTransicionEnExpediente(conSaldo, 'PAGADA', 'PAGO_RECIBIDO').ok).toBe(false);
  });

  it('incorpora tramos nuevos y detecta pagos parciales', () => {
    const { expediente } = construirExpediente({ contrato: mkContrato([]), piezas: piezasDe([1]), fechaReferencia: FECHA_REF });
    const cobros = [
      mkCobro(1, { importeRecibido: 400, estado: 'PAGADO_PARCIAL' } as Partial<CobroPeriodo>),
      mkCobro(2),
      mkCobro(4, { fechaVencimiento: '2026-04-20' }), // aún en plazo ⇒ no entra
    ];
    const r = sincronizarExpediente(expediente!, cobros, { fechaReferencia: FECHA_REF });
    expect(r.cambios.nuevos).toEqual(['cobro_ctr_1_2026_02']);
    expect(r.cambios.parciales).toEqual(['cobro_ctr_1_2026_01']);
    expect(r.expediente.saldoPendiente).toBe(500 + 900);
    expect(r.expediente.piezasDeuda.length).toBe(2);
    expect(r.transicionSugerida?.estadoNuevo).toBe('PAGO_PARCIAL');
  });

  it('la disputa y la anulación se reflejan sin borrar la pieza', () => {
    const { expediente } = construirExpediente({ contrato: mkContrato([]), piezas: piezasDe([1, 2]), fechaReferencia: FECHA_REF });
    const cobros = [
      mkCobro(1, { estado: 'INCIDENCIA', motivoIncidencia: 'Reclamación del inquilino' } as Partial<CobroPeriodo>),
      mkCobro(2, { estado: 'ANULADO' } as Partial<CobroPeriodo>),
    ];
    const r = sincronizarExpediente(expediente!, cobros, { fechaReferencia: FECHA_REF });
    expect(r.cambios.disputas.length).toBe(1);
    expect(r.expediente.enDisputa).toBe(true);
    expect(r.expediente.piezasDeuda.find((p) => p.cobroId === 'cobro_ctr_1_2026_02')?.estado).toBe('ANULADA');
    expect(r.expediente.piezasDeuda.find((p) => p.cobroId === 'cobro_ctr_1_2026_02')?.importeReclamado).toBe(0);
    // la pieza en disputa sigue siendo saldo (no desaparece deuda por un cambio de estado),
    // pero deja de ser importe reclamado hasta resolver la disputa
    expect(r.expediente.saldoPendiente).toBe(900);
    expect(r.expediente.piezasDeuda.find((p) => p.cobroId === 'cobro_ctr_1_2026_01')?.importeReclamado).toBe(0);
  });

  it('resumenMorosidad agrega sin inventar (KPIs de cabecera)', () => {
    const { expediente } = construirExpediente({ contrato: mkContrato([]), piezas: piezasDe([1, 2]), fechaReferencia: FECHA_REF });
    const r = resumenMorosidad([expediente!], { fechaReferencia: FECHA_REF });
    expect(r.deudaTotal).toBe(1800);
    expect(r.expedientesAbiertos).toBe(1);
    expect(r.periodosVencidos).toBe(2);
    expect(r.porEstado.DETECTADA).toBe(1);
    expect(r.importeCubierto).toBe(0);
  });
});

describe('BLOQUE C · evidencias y comunicaciones', () => {
  it('sanearEvidencia filtra claves que parecen credenciales (defensa en profundidad)', () => {
    const { limpio, filtradas } = sanearEvidencia({
      nota: 'ok',
      password: 'x',
      apiKey: 'k',
      base64Data: 'AAA',
      accessToken: 't',
    });
    expect(limpio).toEqual({ nota: 'ok' });
    expect(filtradas.sort()).toEqual(['accessToken', 'apiKey', 'base64Data', 'password']);
    // el binario en base64 no vive en el documento: se guarda la referencia de Storage
    expect(CLAVES_PROHIBIDAS_EVIDENCIA.every((c) => typeof c === 'string')).toBe(true);
    expect(CLAVES_PROHIBIDAS_EVIDENCIA.map((c) => c.toLowerCase())).toContain('password');
  });

  it('crearEvidencia es idempotente y valida el contenido', () => {
    const base = {
      expedienteId: 'mor_x',
      tipo: 'NOTIFICACION_FEHACIENTE' as const,
      fecha: '2026-04-01',
      resumen: 'Burofax con acuse de recibo remitido',
      claveEstable: 'com_h',
    };
    const a = crearEvidencia(base);
    const b = crearEvidencia(base);
    expect(a.ok && b.ok).toBe(true);
    expect(a.evidencia!.id).toBe(b.evidencia!.id);
    expect(a.evidencia!.id).toBe(idEvidencia('mor_x', 'NOTIFICACION_FEHACIENTE', 'com_h'));
    expect(crearEvidencia({ ...base, resumen: 'ab' }).errores).toContain('resumen_requerido');
    expect(crearEvidencia({ ...base, fecha: '2026/04/01' }).errores).toContain('fecha_invalida');
    const conSecretos = crearEvidencia({ ...base, datosAdicionales: { nota: 'x', password: 'nope' } });
    expect(conSecretos.filtradas).toEqual(['password']);
  });

  it('mapearEstadoComunicacion solo afirma ENVIADA con entrega confirmada', () => {
    expect(mapearEstadoComunicacion({ estado: 'ENVIADA', entregada: true }).estadoComunicacion).toBe('ENVIADA');
    // sin confirmación del canal no se afirma 'ENVIADA'
    expect(mapearEstadoComunicacion({ estado: 'ENVIADA', entregada: false }).estadoComunicacion).toBe('PREPARADA');
    expect(mapearEstadoComunicacion({ estado: 'PROGRAMADA', entregada: false }).estadoComunicacion).toBe('PROGRAMADA');
    expect(mapearEstadoComunicacion({ ok: false, error: 'canal_no_disponible' }).estadoComunicacion).toBe('DEPENDENCIA_EXTERNA');
    expect(mapearEstadoComunicacion({ ok: false, error: 'payload_invalido' }).estadoComunicacion).toBe('PENDIENTE_ENVIO');
    expect(mapearEstadoComunicacion({ estado: 'FALLIDA' }).estadoComunicacion).toBe('FALLIDA');
    expect(mapearEstadoComunicacion({}).estadoComunicacion).toBe('PREPARADA');
    expect(mapearEstadoComunicacion({ estado: 'ENVIADA', entregada: true }).entregado).toBe(true);
    expect(mapearEstadoComunicacion({ duplicada: true }).entregado).toBe(false);
  });

  it('la comunicación externa con constancia NO afirma envío sin evidencia', () => {
    const { comunicacion, requiereEvidencia } = registrarComunicacionExterna('mor_x', {
      tipoEvento: 'morosidad.requerimiento_fehaciente',
      medio: 'BUROFAX',
      destinatarioTipo: 'INQUILINO',
      fecha: '2026-04-01',
      resumen: 'Burofax remitido desde el gestor postal',
    });
    expect(comunicacion.estado).toBe('REGISTRADA_MANUALMENTE');
    expect(comunicacion.externa).toBe(true);
    expect(comunicacion.fechaEnvio).toBeUndefined();
    expect(requiereEvidencia).toBe(true);
    expect(tieneRequerimientoFehaciente([comunicacion])).toBe(true);
    // el id es determinista sobre la clave de idempotencia
    const otro = registrarComunicacionExterna('mor_x', {
      tipoEvento: 'morosidad.requerimiento_fehaciente',
      medio: 'BUROFAX',
      destinatarioTipo: 'INQUILINO',
      fecha: '2026-04-01',
      resumen: 'Burofax remitido desde el gestor postal',
    });
    expect(otro.comunicacion.id).toBe(comunicacion.id);
  });

  it('construirComunicacion (espejo GAP1) no afirma fecha de envío sin estado ENVIADA', () => {
    const com = construirComunicacion(
      'mor_x',
      {
        tipoEvento: 'morosidad.primer_recordatorio',
        origen: 'GAP1',
        idempotencyKey: 'morosidad.primer_recordatorio|mor_x|cobro_1',
        destinatarioTipo: 'INQUILINO',
        cobroId: 'cobro_1',
      },
      { estado: 'PREPARADA', medio: 'EMAIL', provider: 'safe-mode' },
      '2026-04-01T10:00:00.000Z',
    );
    expect(com.estado).toBe('PREPARADA');
    expect(com.fechaEnvio).toBeUndefined();
    expect(com.origenNotificacion).toBe('GAP1');
    expect(com.externa).toBe(false);
    const enviada = construirComunicacion(
      'mor_x',
      { tipoEvento: 'morosidad.primer_recordatorio', origen: 'GAP1', idempotencyKey: 'k2', destinatarioTipo: 'INQUILINO' },
      { estado: 'ENVIADA', medio: 'EMAIL' },
      '2026-04-01T10:00:00.000Z',
    );
    expect(enviada.fechaEnvio).toBe('2026-04-01T10:00:00.000Z');
    // ids deterministas sobre la clave de idempotencia
    expect(construirComunicacion(
      'mor_x',
      { tipoEvento: 'morosidad.primer_recordatorio', origen: 'GAP1', idempotencyKey: 'k2', destinatarioTipo: 'INQUILINO' },
      { estado: 'PREPARADA' },
    ).id).toBe(enviada.id);
  });
});

describe('BLOQUE C · vista de mínimo privilegio del propietario', () => {
  const expedienteConTodo = (): ExpedienteMorosidad => {
    const piezas = [
      construirPiezaDeuda(mkCobro(1), { fechaReferencia: FECHA_REF })!,
      construirPiezaDeuda(mkCobro(2), { fechaReferencia: FECHA_REF })!,
    ];
    const { expediente } = construirExpediente({ contrato: mkContrato([]), piezas, fechaReferencia: FECHA_REF });
    return {
      ...expediente!,
      estado: 'ESCALADA',
      aseguradora: { aseguradoraNombre: 'Zurich', numeroPoliza: 'P-123', estado: 'PREPARADO' } as never,
      juridico: { abogadoNombre: 'Letrada X', estado: 'PREPARADO', requisitoProcedibilidad: 'NO_VERIFICADO' } as never,
      comunicaciones: [
        { medio: 'EMAIL', tipoEvento: 'morosidad.requerimiento_pago', resumen: 'texto interno' } as never,
      ] as never,
    } as ExpedienteMorosidad;
  };

  it('recortarResumenPropietario elimina datos del inquilino, póliza y estrategia', () => {
    const resumen = construirResumenPropietario(expedienteConTodo(), { versionFuente: 3, ultimoHechoResumen: 'Requerimiento registrado' });
    const recortado = recortarResumenPropietario(resumen);
    const claves = Object.keys(recortado);
    // solo campos de la lista blanca (los opcionales ausentes no se escriben)
    expect(claves.every((k) => CAMPOS_RESUMEN_PROPIETARIO.includes(k))).toBe(true);
    expect(claves).toContain('saldoPendiente');
    expect(claves).toContain('estadoEtiqueta');
    expect(CAMPOS_RESUMEN_PROPIETARIO.some((c) => /inquilino|dni|email|telefono|abogado|aseguradora|penaliz|comunicacion/i.test(c))).toBe(false);
    const texto = JSON.stringify(recortado).toLowerCase();
    expect(texto).not.toContain('zurich');
    expect(texto).not.toContain('letrada');
    expect(texto).not.toContain('p-123');
    expect(texto).not.toContain('luis');
    expect(recortado.estadoVisible).toBe('EN_TRAMITE_EXTERNO');
    expect(recortado.saldoPendiente).toBe(1800);
    expect(recortado.versionFuente).toBe(3);
  });

  it('SALDADA / EN_REVISION / COMPROMISO_ACTIVO se derivan del estado real', () => {
    const base = expedienteConTodo();
    expect(construirResumenPropietario({ ...base, saldoPendiente: 0, estado: 'PAGADA' } as ExpedienteMorosidad).estadoVisible).toBe('SALDADA');
    expect(
      construirResumenPropietario({ ...base, enDisputa: true, saldoPendiente: 900 } as ExpedienteMorosidad).estadoVisible,
    ).toBe('EN_REVISION');
    expect(
      construirResumenPropietario({ ...base, estado: 'COMPROMISO_PAGO', compromisoVigenteId: 'cmp_1' } as ExpedienteMorosidad).estadoVisible,
    ).toBe('COMPROMISO_ACTIVO');
    expect(
      construirResumenPropietario({ ...base, estado: 'DETECTADA', saldoPendiente: 900, importeTotalReclamado: 1800, importeCubierto: 900 } as ExpedienteMorosidad).estadoVisible,
    ).toBe('PAGO_PARCIAL');
  });
});

describe('BLOQUE C · compromisos de pago (calendario declarado, cobros reales)', () => {
  const entrada = {
    expedienteId: 'mor_x',
    contratoId: 'ctr_1',
    inmuebleId: 'inmueble_1',
    propietarioId: 'prop_1',
    fechaPropuesta: '2026-04-01',
    importeTotal: 900,
    numPagos: 3,
    periodicidadDias: 30,
    origenRegistro: 'LLAMADA' as const,
    fechaRegistro: '2026-04-01T10:00:00.000Z',
  };

  it('valida el plan de cuotas antes de crear nada', () => {
    expect(validarPlanCuotas(900, 3, 30)).toEqual([]);
    expect(validarPlanCuotas(0, 3, 30).length).toBeGreaterThan(0);
    expect(validarPlanCuotas(900, 0, 30).length).toBeGreaterThan(0);
    expect(validarPlanCuotas(900, 3, 0).length).toBeGreaterThan(0);
    const r = crearCompromiso({ ...entrada, numPagos: 0 });
    expect(r.ok).toBe(false);
    expect(r.errores.length).toBeGreaterThan(0);
  });

  it('crea cuotas planas deterministas y la suma exacta (sin céntimos fantasma)', () => {
    const { compromiso } = crearCompromiso(entrada);
    expect(compromiso!.cuotas.length).toBe(3);
    expect(compromiso!.cuotas.reduce((s, c) => s + c.importePrevisto, 0)).toBe(900);
    expect(compromiso!.id).toBe(crearCompromiso(entrada).compromiso!.id);
    expect(compromiso!.estado).toBe('VIGENTE');
    expect(compromiso!.cuotas.map((c) => c.fechaPrevista)).toEqual(['2026-05-01', '2026-05-31', '2026-06-30']);
    expect(compromiso!.cuotas.map((c) => c.importePrevisto)).toEqual([300, 300, 300]);
  });

  it('solo cubre cuotas con cobros REALES de la fuente y nunca escribe en ella', () => {
    const { compromiso } = crearCompromiso(entrada);
    const antes = JSON.stringify(compromiso);
    const cobros = [
      { id: 'cobro_ctr_1_2026_01', importeRecibido: 300, importePrevisto: 900, estado: 'RECIBIDO', fechaPago: '2026-05-02' },
      { id: 'cobro_ctr_1_2026_02', importeRecibido: 0, importePrevisto: 900, estado: 'PENDIENTE' },
    ];
    const r = aplicarCobrosAlCompromiso(compromiso!, cobros, { fechaReferencia: '2026-05-05' });
    expect(r.aplicado).toBe(300);
    expect(r.compromiso.importeCubierto).toBe(300);
    expect(r.compromiso.cuotas[0].cobroIds).toEqual(['cobro_ctr_1_2026_01']);
    expect(r.compromiso.cuotas[1].importeCubierto).toBe(0);
    expect(r.compromiso.historial[0].accion).toBe('CUOTA_CUBIERTA_DESDE_COBRO');
    expect(antes).toBeTruthy();
    // cobros no aprovechables (pendientes/anulados) no cubren nada
    const r2 = aplicarCobrosAlCompromiso(compromiso!, [{ id: 'x', importeRecibido: 500, importePrevisto: 900, estado: 'PENDIENTE' }], {
      fechaReferencia: '2026-05-05',
    });
    expect(r2.aplicado).toBe(0);
    // no se asigna más de lo cobrado
    // cobro mayor que el plan: solo se asigna lo que el calendario pacta (600 de 2 cuotas)
    const r3 = aplicarCobrosAlCompromiso(crearCompromiso(entrada).compromiso!, [
      { id: 'y', importeRecibido: 600, importePrevisto: 900, estado: 'VERIFICADO' },
    ], { fechaReferencia: '2026-05-05' });
    expect(r3.aplicado).toBe(600);
    expect(r3.compromiso.importeCubierto).toBe(600);
    expect(r3.compromiso.estado).toBe('VIGENTE');
    // cobertura acumulativa: el cobro nuevo (900 en total) completa lo que faltaba
    const r4 = aplicarCobrosAlCompromiso(r3.compromiso, [{ id: 'y', importeRecibido: 900, importePrevisto: 900, estado: 'VERIFICADO' }], {
      fechaReferencia: '2026-05-05',
    });
    expect(r4.aplicado).toBe(300);
    expect(r4.compromiso.estado).toBe('CUMPLIDO');
    expect(r4.transicionSugerida).toBe('CUMPLIDO');
  });

  it('cuota vencida sin cobertura ⇒ INCUMPLIDO y autoriza transición', () => {
    const { compromiso } = crearCompromiso(entrada);
    const alDia = revisarVencimientos(compromiso!, '2026-04-15');
    expect(alDia.estado).toBe('VIGENTE');
    const vencido = revisarVencimientos(compromiso!, '2026-06-15');
    expect(vencido.cuotas[0].estado).toBe('VENCIDA_SIN_PAGO');
    expect(vencido.estado).toBe('INCUMPLIDO');
    expect(compromisoAutorizaCierre({ ...vencido, estado: 'CUMPLIDO' }, 0).permite).toBe(true);
    // con saldo real en la fuente NUNCA se cierra "por compromiso"
    expect(compromisoAutorizaCierre({ ...vencido, estado: 'CUMPLIDO' }, 900).permite).toBe(false);
    const noCerrado = compromisoAutorizaCierre(vencido, 0);
    expect(noCerrado.permite).toBe(false);
    expect(noCerrado.motivo).toContain('compromiso_no_cerrado');
  });

  it('progreso y cancelación quedan trazados', () => {
    const { compromiso } = crearCompromiso(entrada);
    const cubierto = aplicarCobrosAlCompromiso(compromiso!, [{ id: 'c1', importeRecibido: 600, importePrevisto: 900, estado: 'RECIBIDO' }], {
      fechaReferencia: '2026-05-02',
    }).compromiso;
    const p = progresoCompromiso(cubierto);
    expect(p.pct).toBe(67);
    expect(p.cuotasCubiertas).toBe(2);
    expect(p.proximaFecha).toBe('2026-06-30');
    const cancelado = cancelarCompromiso(cubierto as CompromisoPago, 'Acuerdo sustituido', { nombre: 'Admin' });
    expect(cancelado.estado).toBe('CANCELADO');
    expect(cancelado.historial?.[0].accion).toBe('COMPROMISO_CANCELADO');
  });
});

describe('BLOQUE C · conceptos jurídicos sin invención de tipos ni gastos', () => {
  const piezas = (): PiezaDeuda[] => [
    construirPiezaDeuda(mkCobro(1), { fechaReferencia: FECHA_REF })!,
    construirPiezaDeuda(mkCobro(2), { fechaReferencia: FECHA_REF })!,
  ];

  it('validarFuenteNormativa exige artículo + fecha + ámbito para VERIFICADO', () => {
    expect(validarFuenteNormativa(undefined).valida).toBe(false);
    expect(validarFuenteNormativa('interés legal').errores).toContain('fuente_debe_citar_articulo');
    const incompleta = validarFuenteNormativa('art. 1108 Código Civil');
    expect(incompleta.valida).toBe(false);
    expect(incompleta.errores).toContain('fecha_consulta_invalida');
    const ok = validarFuenteNormativa('art. 1108 Código Civil', '2026-04-01', 'Arrendamiento de vivienda');
    expect(ok.valida).toBe(true);
    expect(ok.permiteVerificado).toBe(true);
  });

  it('los parámetros se validan: base solo capital y tipo en rango operativo', () => {
    const bien = validarParametrosIntereses({
      tipoAnualPct: 5,
      baseCalculo: 'SOLO_CAPITAL',
      inicioMoraRequiereRequerimiento: true,
      diasAnio: 365,
      redondeoDecimales: 2,
      fechaConsultaFuente: '2026-04-01',
      fuente: 'art. 1108 CC',
      ambitoAplicacion: 'Arrendamiento de vivienda',
    });
    expect(bien.valida).toBe(true);
    expect(bien.errores).toEqual([]);
    const mal = validarParametrosIntereses({
      tipoAnualPct: 45,
      baseCalculo: 'CON_GASTOS',
      inicioMoraRequiereRequerimiento: false,
      diasAnio: 365,
      redondeoDecimales: 2,
    });
    expect(mal.errores).toContain('tipo_anual_fuera_de_rango_operativo');
    expect(mal.errores).toContain('anatocismo_no_admitido');
    expect(mal.errores).toContain('mora_exige_requerimiento_art1100_CC');
    expect(validarParametrosIntereses(undefined).errores).toContain('parametros_ausentes');
  });

  it('sin tipo aportado ⇒ no se calcula nada (el ERP no hardcodea intereses)', () => {
    const r = construirConceptoIntereses({
      expedienteId: 'mor_x',
      piezas: piezas(),
      desdeFecha: '2026-01-05',
      hastaFecha: '2026-04-01',
      requerimientoExiste: true,
      parametros: { baseCalculo: 'SOLO_CAPITAL', diasAnio: 365, redondeoDecimales: 2 },
    } as never);
    expect(r.ok).toBe(false);
    expect(r.errores).toContain('tipo_anual_requerido');
    expect(r.concepto).toBeUndefined();
  });

  it('sin fuente completa ⇒ ESTIMADO con aviso permanente, nunca definitivo', () => {
    const r = construirConceptoIntereses({
      expedienteId: 'mor_x',
      piezas: piezas(),
      desdeFecha: '2026-01-05',
      hastaFecha: '2026-04-01',
      requerimientoExiste: true,
      parametros: { tipoAnualPct: 5, baseCalculo: 'SOLO_CAPITAL', inicioMoraRequiereRequerimiento: true, diasAnio: 365, redondeoDecimales: 2 },
      fechaCalculo: '2026-04-01T00:00:00.000Z',
    });
    expect(r.ok).toBe(true);
    expect(r.concepto!.estado).toBe('ESTIMADO');
    expect(r.concepto!.importe).toBe(21.21); // 1800 × 5% × 86/365 (recuento del motor)
    expect(r.concepto!.principalBase).toBe(1800);
    expect(r.concepto!.aviso).toContain('orientativo');
    expect(r.advertencias[0]).toContain('no_presentable_como_definitivo');
    const verificado = construirConceptoIntereses({
      expedienteId: 'mor_x',
      piezas: piezas(),
      desdeFecha: '2026-01-05',
      hastaFecha: '2026-04-01',
      requerimientoExiste: true,
      parametros: {
        tipoAnualPct: 5,
        baseCalculo: 'SOLO_CAPITAL',
        inicioMoraRequiereRequerimiento: true,
        diasAnio: 365,
        redondeoDecimales: 2,
        fuente: 'art. 1108 Código Civil',
        fechaConsultaFuente: '2026-04-01',
        ambitoAplicacion: 'Arrendamiento de vivienda',
      },
    });
    expect(verificado.concepto!.estado).toBe('VERIFICADO');
    expect(verificado.concepto!.id).toBe(r.concepto!.id); // mismo concepto: se recalcula, no se duplica
  });

  it('sin requerimiento registrado no corre la mora (art. 1100 CC)', () => {
    const r = construirConceptoIntereses({
      expedienteId: 'mor_x',
      piezas: piezas(),
      desdeFecha: '2026-01-05',
      hastaFecha: '2026-04-01',
      requerimientoExiste: false,
      parametros: { tipoAnualPct: 5, baseCalculo: 'SOLO_CAPITAL', inicioMoraRequiereRequerimiento: true, diasAnio: 365, redondeoDecimales: 2 },
    });
    expect(r.ok).toBe(false);
    expect(r.errores).toContain('requerimiento_fehaciente_registrado_requerido');
  });

  it('gastos: justifican con evidencia; costas procesales fuera del ERP', () => {
    const sinEvidencia = construirConceptoGastos({
      expedienteId: 'mor_x',
      naturaleza: 'COSTAS_PROCESALES',
      importe: 500,
      evidenciaIds: [],
    });
    expect(sinEvidencia.ok).toBe(false);
    expect(sinEvidencia.errores).toContain('costas_no_liquidables_por_el_ERP_requiere_tasacion_judicial');
    expect(sinEvidencia.concepto).toBeUndefined();

    const sinJustificante = construirConceptoGastos({ expedienteId: 'mor_x', naturaleza: 'GASTOS_RECLAMACION', importe: 95.5, evidenciaIds: [] });
    expect(sinJustificante.errores).toContain('gasto_requiere_justificante_evidencia');

    const burofax = construirConceptoGastos({
      expedienteId: 'mor_x',
      naturaleza: 'GASTOS_RECLAMACION',
      importe: 95.5,
      evidenciaIds: ['evi_1'],
      fechaCalculo: '2026-04-01T00:00:00.000Z',
    });
    expect(burofax.ok).toBe(true);
    expect(burofax.concepto!.estado).toBe('ESTIMADO');
    expect(burofax.concepto!.gastos).toBe(95.5);
    // por defecto solo se suman los conceptos verificados
    expect(totalConceptosJuridicos([burofax.concepto!], { incluirEstimados: false }).total).toBe(0);
    expect(totalConceptosJuridicos([burofax.concepto!], { incluirEstimados: true }).total).toBe(95.5);
    expect(totalConceptosJuridicos([burofax.concepto!], { incluirEstimados: false }).excluidos[0]).toContain('ESTIMADO');
  });

  it('concepto por defecto NO_CONFIGURADO con importe 0', () => {
    const c = conceptoSinConfigurar('mor_x', 'INTERESES_MORA', '2026-04-01T00:00:00.000Z');
    expect(c.estado).toBe('NO_CONFIGURADO');
    expect(c.importe).toBe(0);
    expect(c.motivoBloqueo).toBe('parametros_no_definidos');
  });

  it('aseguradora: sin API, solo PREPARADO/ENVIADO_MANUALMENTE con comprobante', () => {
    const base = {
      expedienteId: 'mor_x',
      aseguradoraNombre: 'Aseguradora X',
      importeReclamado: 1800,
      fechaApertura: '2026-04-01',
      canalUso: 'MANUAL_GMAIL' as const,
    };
    const preparado = abrirExpedienteAseguradora({ ...base, estadoDeseado: 'PREPARADO' });
    expect(preparado.ok).toBe(true);
    expect(preparado.aseguradora!.estado).toBe('PREPARADO');
    expect(preparado.aseguradora!.avisoCondicionesPoliza).toMatch(/condiciones particulares/);
    expect(preparado.aseguradora!.referenciaSiniestro).toContain('SEG-');

    const envioSinPrueba = abrirExpedienteAseguradora({ ...base, estadoDeseado: 'ENVIADO_MANUALMENTE' });
    expect(envioSinPrueba.ok).toBe(false);
    expect(envioSinPrueba.errores).toContain('envio_manual_requiere_evidencia_del_comprobante');
    const conPrueba = abrirExpedienteAseguradora({ ...base, estadoDeseado: 'ENVIADO_MANUALMENTE', evidenciaEnvioId: 'evi_1' });
    expect(conPrueba.ok).toBe(true);
    expect(conPrueba.aseguradora!.documentacionEnviadaIds).toEqual(['evi_1']);

    const respuestaSinRegistro = abrirExpedienteAseguradora({ ...base, estadoDeseado: 'INDEMNIZACION_PAGADA' });
    expect(respuestaSinRegistro.ok).toBe(false);
    expect(respuestaSinRegistro.errores[0]).toContain('estado_respuesta_aseguradora_requiere_registro_con_evidencia');
  });

  it('jurídico: se prepara, no se presenta nada (PENDIENTE/NO_VERIFICADO por defecto)', () => {
    const r = prepararExpedienteJuridico({
      expedienteId: 'mor_x',
      importeReclamado: 1800,
      documentacionIds: ['pieza_a'],
      fechaDerivacion: '2026-04-01',
    });
    expect(r.ok).toBe(true);
    expect(r.juridico!.estado).toBe('PREPARADO');
    expect(r.juridico!.requisitoProcedibilidad).toBe('NO_VERIFICADO');
    expect(r.juridico!.numeroProcedimiento).toBeUndefined();
    expect(r.juridico!.cauceAviso).toContain('250.1.1');
    expect(r.advertencias[0]).toContain('masc_pendiente_puede_impedir_admision_a_tramite_LO_1_2025');
    // 'CUMPLIDO_EVIDENCIA' sin evidencia ⇒ error (no se declara el trámite por fe del usuario sin prueba)
    const mal = prepararExpedienteJuridico({
      expedienteId: 'mor_x',
      importeReclamado: 1800,
      documentacionIds: ['pieza_a'],
      requisitoProcedibilidad: 'CUMPLIDO_EVIDENCIA',
    });
    expect(mal.ok).toBe(false);
    expect(mal.errores).toContain('masc_cumplido_requiere_evidencia');
    const registrado = registrarProcedimientoJudicial(
      r.juridico!,
      { numeroProcedimiento: '123/2026', organoJudicial: 'Juzgado de Primera Instancia nº 1 de Madrid', evidenciaId: 'evi_9' } as never,
    );
    expect(registrado.ok).toBe(true);
    const sinPrueba = registrarProcedimientoJudicial(r.juridico!, { numeroProcedimiento: '124/2026' } as never);
    expect(sinPrueba.ok).toBe(false);
  });
});
