/**
 * BLOQUE C — Intereses, penalizaciones, gastos y conceptos jurídicos (FASE 11).
 * Motor PURO. Regla absoluta: **no se inventan porcentajes ni se presenta ninguna
 * cantidad jurídica como definitiva sin fuente verificada.**
 *
 * Fundamento verificado (2026-09-20 — ver `docs/BLOQUE-C-NORMATIVA.md`):
 *  - LAU (Ley 29/1994) no fija un tipo de interés de demora para la renta;
 *  - en defecto de pacto, el interés moratorio es el «legal del dinero» con el
 *    límite histórico del art. 1108 CC, y la mora exige requerimiento
 *    (judicial o extrajudicial) conforme al art. 1100 CC;
 *  - el tipo de «interés legal del dinero» se fija cada año en la Ley de
 *    Presupuestos Generales del Estado (regla de revisión en la Ley 36/2006):
 *    el ERP NO lo hardcodea porque exigiría verificación PGE a PGE;
 *  - las cláusulas de penalización/gastos de recobro frente a un arrendatario
 *    persona física pueden ser objeto de control de abusividad (RDLeg 1/2007):
 *    por eso el ERP solo admite conceptos con `fuente` y estado explícito.
 *
 * Consecuencia práctica de diseño: por defecto todo concepto está
 * `NO_CONFIGURADO` / `NO_CALCULABLE` y su importe es 0. El usuario puede aportar
 * parámetros → `ESTIMADO` (con aviso permanente). `VERIFICADO` exige norma +
 * artículo + fecha de consulta + ámbito, y AÚN ASÍ el aviso acompaña al documento.
 */

import type {
  ExpedienteAseguradora,
  ExpedienteJuridico,
  ModuloImporteJuridico,
  NaturalezaConceptoJuridico,
  ParametrosIntereses,
  PiezaDeuda,
} from '../../types/morosidad';
import { redondear2, simpleHash } from './morosidadEstados';
import { TOLERANCIA_CENTIMOS } from './morosidadEngine';

export const AVISO_PERMANENTE =
  'Importe orientativo generado por el ERP a partir de parámetros aportados por el usuario. No es una liquidación judicial ni asesoramiento jurídico: verifique norma, artículo, fecha de consulta y ámbito antes de reclamarlo o presentarlo ante tercero.';

export function idConceptoJuridico(expedienteId: string, naturaleza: NaturalezaConceptoJuridico): string {
  return `jur_${normalizar(expedienteId)}_${normalizar(naturaleza)}`;
}

function normalizar(t: string): string {
  return (t || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_');
}

/** Concepto vacío por defecto (NO_CALCULABLE, importe 0). */
export function conceptoSinConfigurar(
  expedienteId: string,
  naturaleza: NaturalezaConceptoJuridico,
  fechaISO: string,
): ModuloImporteJuridico {
  return {
    id: idConceptoJuridico(expedienteId, naturaleza),
    expedienteId,
    naturaleza,
    estado: 'NO_CONFIGURADO',
    importe: 0,
    principalBase: 0,
    intereses: 0,
    gastos: 0,
    otros: 0,
    piezaDeudaIds: [],
    aviso: AVISO_PERMANENTE,
    actualizadoEn: fechaISO,
    motivoBloqueo: 'parametros_no_definidos',
  };
}

export interface ValidacionFuente {
  valida: boolean;
  errores: string[];
  /** `VERIFICADO` solo si norma + artículo + fecha consulta + ámbito. */
  permiteVerificado: boolean;
}

export function validarFuenteNormativa(fuente?: string, fechaConsulta?: string, ambito?: string): ValidacionFuente {
  const errores: string[] = [];
  if (!fuente || !fuente.trim()) errores.push('fuente_requerida');
  if (!/\b(art[Ií]culo|art\.?)\s*\d+/i.test(fuente || '')) {
    errores.push('fuente_debe_citar_articulo');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaConsulta || '')) errores.push('fecha_consulta_invalida');
  if (!ambito || ambito.trim().length < 8) errores.push('ambito_requerido');
  return { valida: errores.length === 0, errores, permiteVerificado: errores.length === 0 };
}

export interface ParametrosInteresesValidacion {
  valida: boolean;
  errores: string[];
  advertencias: string[];
}

export function validarParametrosIntereses(p: Partial<ParametrosIntereses> | undefined): ParametrosInteresesValidacion {
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!p) return { valida: false, errores: ['parametros_ausentes'], advertencias };
  if (typeof p.tipoAnualPct !== 'number' || !Number.isFinite(p.tipoAnualPct)) {
    errores.push('tipo_anual_requerido');
  } else if (p.tipoAnualPct < 0) {
    errores.push('tipo_anual_negativo');
  } else if (p.tipoAnualPct > 20) {
    // Umbral operativo de control, NO un límite legal (el control de abusividad
    // corresponde a la autoridad judicial/consumo, no al ERP).
    errores.push('tipo_anual_fuera_de_rango_operativo');
  }
  if (p.baseCalculo && p.baseCalculo !== 'SOLO_CAPITAL') errores.push('anatocismo_no_admitido');
  if (p.diasAnio !== 365 && p.diasAnio !== 360) errores.push('dias_anio_invalido');
  if (p.inicioMoraRequiereRequerimiento === false) {
    errores.push('mora_exige_requerimiento_art1100_CC');
  }
  const f = validarFuenteNormativa(p.fuente, p.fechaConsultaFuente, p.ambitoAplicacion);
  if (!f.valida) {
    advertencias.push(...f.errores.map((e) => `fuente:${e}`));
  }
  if (!advertencias.length && !p.redondeoDecimales) advertencias.push('redondeo_por_defecto_2');
  return { valida: errores.length === 0, errores, advertencias };
}

export function idInteresesDesdeFechas(expedienteId: string, desdeFecha: string): string {
  return `int_${simpleHash(`${expedienteId}|${desdeFecha}`).toString(16).padStart(10, '0')}`;
}

/** Interés simple anual sobre capital, prorrateo por días. Redondeo a céntimos. */
export function calcularInteresesSimples(params: {
  capital: number;
  tipoAnualPct: number;
  dias: number;
  diasAnio: 365 | 360;
  redondeoDecimales?: number;
}): { importe: number; dias: number; capital: number; tipoAnualPct: number; formula: string } {
  const capital = Math.max(0, Number(params.capital || 0));
  const tipo = Math.max(0, Number(params.tipoAnualPct || 0));
  const dias = Math.max(0, Math.floor(Number(params.dias || 0)));
  const base = params.diasAnio === 360 ? 360 : 365;
  const bruto = (capital * (tipo / 100) * dias) / base;
  const importe = redondear2(bruto);
  return {
    importe,
    dias,
    capital: redondear2(capital),
    tipoAnualPct: tipo,
    formula: `${capital.toFixed(2)} € × ${tipo}% × ${dias}/${base} = ${importe.toFixed(2)} €`,
  };
}

/**
 * Construye el concepto de intereses de mora del expediente.
 * Exige: (a) parámetros válidos aportados por el usuario, (b) fecha de constitución
 * en mora respaldada por una comunicación con constancia (requerimiento), y
 * (c) saldo real pendiente en la fuente canónica.
 */
export function construirConceptoIntereses(params: {
  expedienteId: string;
  piezas: PiezaDeuda[];
  desdeFecha: string; // YYYY-MM-DD (fecha del requerimiento fehaciente)
  hastaFecha: string; // YYYY-MM-DD
  parametros: ParametrosIntereses;
  requerimientoExiste: boolean;
  actor?: { id?: string; nombre?: string; email?: string } | null;
  fechaCalculo?: string; // ISO
}): {
  ok: boolean;
  errores: string[];
  advertencias: string[];
  concepto?: ModuloImporteJuridico;
} {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const validacion = validarParametrosIntereses(params.parametros);
  if (!validacion.valida) errores.push(...validacion.errores);
  if (!params.requerimientoExiste && params.parametros.inicioMoraRequiereRequerimiento !== false) {
    errores.push('requerimiento_fehaciente_registrado_requerido');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.desdeFecha || '')) errores.push('fecha_inicio_invalida');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.hastaFecha || '')) errores.push('fecha_fin_invalida');
  if (params.desdeFecha > params.hastaFecha) errores.push('rango_fecha_invertido');

  const capital = redondear2(
    (params.piezas || [])
      .filter((p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA')
      .reduce((s, p) => s + Math.max(0, Number(p.importePrevisto) - Number(p.importeRecibido)), 0),
  );
  if (capital <= TOLERANCIA_CENTIMOS) errores.push('sin_saldo_pendiente');

  const dias = diasEntreFechas(params.desdeFecha, params.hastaFecha);
  if (dias < 0) errores.push('dias_negativos');

  const f = validarFuenteNormativa(params.parametros.fuente, params.parametros.fechaConsultaFuente, params.parametros.ambitoAplicacion);
  const estado: ModuloImporteJuridico['estado'] = !validacion.valida || errores.length > 0
    ? 'BLOQUEADO'
    : f.permiteVerificado
      ? 'VERIFICADO'
      : 'ESTIMADO';
  if (!f.permiteVerificado && errores.length === 0) {
    advertencias.push('importe_estimado_sin_fuente_completa_no_presentable_como_definitivo');
  }
  if (errores.length > 0) {
    return { ok: false, errores, advertencias };
  }

  const calculo = calcularInteresesSimples({
    capital,
    tipoAnualPct: params.parametros.tipoAnualPct as number,
    dias,
    diasAnio: params.parametros.diasAnio || 365,
    redondeoDecimales: params.parametros.redondeoDecimales || 2,
  });
  const hoy = params.fechaCalculo || new Date().toISOString();
  const concepto: ModuloImporteJuridico = {
    id: idConceptoJuridico(params.expedienteId, 'INTERESES_MORA'),
    expedienteId: params.expedienteId,
    naturaleza: 'INTERESES_MORA',
    estado,
    importe: calculo.importe,
    principalBase: capital,
    intereses: calculo.importe,
    gastos: 0,
    otros: 0,
    piezaDeudaIds: (params.piezas || [])
      .filter((p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA')
      .map((p) => p.id),
    parametros: { ...params.parametros },
    aviso: `${AVISO_PERMANENTE} Cálculo: ${calculo.formula}. Inicio de mora ${params.desdeFecha} (requerimiento registrado).`,
    fechaCalculo: hoy,
    actorId: params.actor?.id,
    actorNombre: params.actor?.nombre || params.actor?.email,
    actualizadoEn: hoy,
  };
  return { ok: true, errores: [], advertencias, concepto };
}

export function diasEntreFechas(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86_400_000);
}

/**
 * Gastos de reclamación (costes reales soportados): se admiten SOLO como importes
 * introducidos por el usuario con su justificante referenciado. No se calculan.
 */
export function construirConceptoGastos(params: {
  expedienteId: string;
  naturaleza: Extract<NaturalezaConceptoJuridico, 'GASTOS_RECLAMACION' | 'HONORARIOS_LETRADOS' | 'COSTAS_PROCESALES' | 'CLAUSULA_PENALIZACION' | 'OTRO_CONFIGURABLE'>;
  importe: number;
  evidenciaIds: string[];
  actor?: { id?: string; nombre?: string; email?: string } | null;
  notas?: string;
  fechaCalculo?: string;
}): { ok: boolean; errores: string[]; concepto?: ModuloImporteJuridico } {
  const errores: string[] = [];
  const importe = redondear2(Number(params.importe || 0));
  if (!(importe >= 0)) errores.push('importe_invalido');
  if (importe > 0 && (!Array.isArray(params.evidenciaIds) || params.evidenciaIds.length === 0)) {
    errores.push('gasto_requiere_justificante_evidencia');
  }
  if (params.naturaleza === 'COSTAS_PROCESALES') {
    errores.push('costas_no_liquidables_por_el_ERP_requiere_tasacion_judicial');
  }
  if (errores.length > 0) return { ok: false, errores };
  const hoy = params.fechaCalculo || new Date().toISOString();
  const concepto: ModuloImporteJuridico = {
    id: idConceptoJuridico(params.expedienteId, params.naturaleza),
    expedienteId: params.expedienteId,
    naturaleza: params.naturaleza,
    estado: 'ESTIMADO',
    importe,
    principalBase: 0,
    intereses: 0,
    gastos: importe,
    otros: 0,
    piezaDeudaIds: [],
    aviso: `${AVISO_PERMANENTE} Importe declarado por el usuario con ${params.evidenciaIds.length} justificante(s) referenciado(s).`,
    fechaCalculo: hoy,
    actorId: params.actor?.id,
    actorNombre: params.actor?.nombre || params.actor?.email,
    actualizadoEn: hoy,
    notas: params.notas,
  };
  return { ok: true, errores: [], concepto };
}

/** Total jurídico reclamado = solo conceptos con estado admitido en la UI. */
export function totalConceptosJuridicos(
  conceptos: ModuloImporteJuridico[] | undefined,
  opts: { incluirEstimados: boolean },
): { intereses: number; gastos: number; otros: number; total: number; excluidos: string[] } {
  let intereses = 0;
  let gastos = 0;
  let otros = 0;
  const excluidos: string[] = [];
  for (const c of conceptos || []) {
    const admitido = c.estado === 'VERIFICADO' || (opts.incluirEstimados && c.estado === 'ESTIMADO');
    if (!admitido) {
      excluidos.push(`${c.id}:${c.estado}`);
      continue;
    }
    intereses += Number(c.intereses || 0);
    gastos += Number(c.gastos || 0);
    otros += Number(c.otros || 0);
  }
  return {
    intereses: redondear2(intereses),
    gastos: redondear2(gastos),
    otros: redondear2(otros),
    total: redondear2(intereses + gastos + otros),
    excluidos,
  };
}

// ==========================================================================
// ASEGURADORA Y JURÍDICO — transiciones de estado SIN integración inventada
// ==========================================================================

export const ESTADOS_ASEGURADORA_SIN_ENVIO_REAL: ExpedienteAseguradora['estado'][] = [
  'SIN_POLIZA',
  'PREPARADO',
  'ENVIADO_MANUALMENTE',
];

/**
 * Abre el expediente de aseguradora. `ENVIADO_MANUALMENTE` SOLO puede afirmarse
 * con una evidencia adjunta (comprobante del usuario): el ERP no tiene API de
 * aseguradora y por tanto no puede verificar ningún envío.
 */
export function abrirExpedienteAseguradora(params: {
  expedienteId: string;
  polizaId?: string;
  aseguradoraNombre: string;
  aseguradoraEmail?: string;
  numeroPoliza?: string;
  importeReclamado: number;
  fechaApertura: string;
  canalUso: ExpedienteAseguradora['canalUso'];
  estadoDeseado?: ExpedienteAseguradora['estado'];
  evidenciaEnvioId?: string;
  franquicia?: number;
  notas?: string;
}): { ok: boolean; errores: string[]; aseguradora?: ExpedienteAseguradora } {
  const errores: string[] = [];
  if (!params.aseguradoraNombre || !params.aseguradoraNombre.trim()) errores.push('aseguradora_requerida');
  if (!(Number(params.importeReclamado) > 0)) errores.push('importe_reclamado_debe_ser_positivo');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.fechaApertura || '')) errores.push('fecha_apertura_invalida');
  const estado = params.estadoDeseado || 'PREPARADO';
  if (estado === 'ENVIADO_MANUALMENTE' && !params.evidenciaEnvioId) {
    errores.push('envio_manual_requiere_evidencia_del_comprobante');
  }
  if (['ADMITIDA', 'INDEMNIZACION_PROPUESTA', 'INDEMNIZACION_ACEPTADA', 'INDEMNIZACION_PAGADA', 'RECHAZADA'].includes(estado)) {
    errores.push(`estado_respuesta_aseguradora_requiere_registro_con_evidencia:${estado}`);
  }
  if (errores.length > 0) return { ok: false, errores };
  const hoy = new Date().toISOString();
  return {
    ok: true,
    errores: [],
    aseguradora: {
      expedienteId: params.expedienteId,
      polizaId: params.polizaId,
      aseguradoraNombre: params.aseguradoraNombre.trim(),
      aseguradoraEmail: params.aseguradoraEmail,
      numeroPoliza: params.numeroPoliza,
      referenciaSiniestro: `SEG-${params.expedienteId.slice(-12)}`,
      fechaApertura: params.fechaApertura,
      fechaUltimaActualizacion: hoy,
      importeReclamado: redondear2(params.importeReclamado),
      estado,
      canalUso: params.canalUso,
      franquicia: typeof params.franquicia === 'number' ? redondear2(params.franquicia) : undefined,
      documentacionEnviadaIds: params.evidenciaEnvioId ? [params.evidenciaEnvioId] : [],
      respuestas: [],
      notas: params.notas,
      avisoCondicionesPoliza:
        'Coberturas, franquicia y plazos de pago dependen de las condiciones particulares de la póliza: el ERP no las interpreta ni las valida.',
    },
  };
}

/** Estado «preparado para derivación jurídica» (no afirma presentación alguna). */
export function prepararExpedienteJuridico(params: {
  expedienteId: string;
  importeReclamado: number;
  referenciaInterna?: string;
  abogadoNombre?: string;
  abogadoProfesionalId?: string;
  fechaDerivacion?: string;
  documentacionIds: string[];
  requisitoProcedibilidad?: ExpedienteJuridico['requisitoProcedibilidad'];
  requisitoEvidenciaId?: string;
  notas?: string;
}): { ok: boolean; errores: string[]; advertencias: string[]; juridico?: ExpedienteJuridico } {
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!(Number(params.importeReclamado) > 0)) errores.push('importe_reclamado_debe_ser_positivo');
  if (!Array.isArray(params.documentacionIds) || params.documentacionIds.length === 0) {
    errores.push('documentacion_minima_requerida');
  }
  const req = params.requisitoProcedibilidad || 'NO_VERIFICADO';
  if (req === 'CUMPLIDO_EVIDENCIA' && !params.requisitoEvidenciaId) {
    errores.push('masc_cumplido_requiere_evidencia');
  }
  if (req === 'NO_VERIFICADO' || req === 'PENDIENTE') {
    // LO 1/2025 art. 5.2 (vigente desde 03/04/2025): actividad negociadora previa
    // como requisito de procedibilidad. Sin ella la demanda puede ser inadmitida.
    advertencias.push('masc_pendiente_puede_impedir_admision_a_tramite_LO_1_2025');
  }
  if (errores.length > 0) return { ok: false, errores, advertencias };
  const hoy = new Date().toISOString();
  return {
    ok: true,
    errores: [],
    advertencias,
    juridico: {
      expedienteId: params.expedienteId,
      referenciaInterna: params.referenciaInterna,
      estado: 'PREPARADO',
      fechaDerivacion: params.fechaDerivacion,
      abogadoNombre: params.abogadoNombre,
      abogadoProfesionalId: params.abogadoProfesionalId,
      importeReclamado: redondear2(params.importeReclamado),
      conceptosAdicionalesIds: [],
      documentacionIds: [...params.documentacionIds],
      requisitoProcedibilidad: req,
      requisitoProcedibilidadEvidenciaId: params.requisitoEvidenciaId,
      requisitoProcedibilidadNota:
        'El ERP no puede verificar la realización de un MASC: registra lo declarado por el usuario y su evidencia.',
      fechasRelevantes: params.fechaDerivacion ? [{ id: `fr_${simpleHash(`deriv|${params.expedienteId}`).toString(16).padStart(8, '0')}`, fecha: params.fechaDerivacion, concepto: 'Derivación a letrado' }] : [],
      actuaciones: [],
      fechaUltimaActualizacion: hoy,
      notas: params.notas,
      cauceAviso:
        'CAUCE A VERIFICAR POR EL LETRADO: el impago de rentas se reclama normalmente por juicio verbal (art. 250.1.1º LEC) con acumulación de rentas (art. 437.4.3º LEC); el monitorio (art. 812 LEC) es admisible según los arts. 812.1.º y 813 LEC en rentas periódicas. El ERP no decide el cauce.',
    },
  };
}

/**
 * Un número de procedimiento/órgano judicial SOLO puede registrarse con
 * referencia a una evidencia aportada por el usuario (nunca se genera).
 */
export function registrarProcedimientoJudicial(
  juridico: ExpedienteJuridico,
  datos: {
    numeroProcedimiento: string;
    organoJudicial: string;
    tipoProcedimiento?: ExpedienteJuridico['tipoProcedimiento'];
    evidenciaId?: string;
    fechaAdmision?: string;
  },
): { ok: boolean; errores: string[]; juridico?: ExpedienteJuridico } {
  const errores: string[] = [];
  if (!datos.numeroProcedimiento || !datos.numeroProcedimiento.trim()) errores.push('numero_procedimiento_requerido');
  if (!datos.organoJudicial || !datos.organoJudicial.trim()) errores.push('organo_judicial_requerido');
  if (!datos.evidenciaId) errores.push('requiere_evidencia_del_letrado_o_procurador');
  if (errores.length > 0) return { ok: false, errores };
  const hoy = new Date().toISOString();
  const actuaciones = [
    {
      id: `act_${simpleHash(`${juridico.expedienteId}|admision|${datos.numeroProcedimiento}`).toString(16).padStart(8, '0')}`,
      fecha: datos.fechaAdmision || hoy.slice(0, 10),
      resumen: `Procedimiento ${datos.numeroProcedimiento.trim()} ante ${datos.organoJudicial.trim()} registrado por el usuario (evidencia ${datos.evidenciaId}).`,
      evidenciaId: datos.evidenciaId,
    },
    ...(juridico.actuaciones || []),
  ];
  return {
    ok: true,
    errores: [],
    juridico: {
      ...juridico,
      estado: 'PROCEDIMIENTO_EN_CURSO',
      numeroProcedimiento: datos.numeroProcedimiento.trim(),
      organoJudicial: datos.organoJudicial.trim(),
      tipoProcedimiento: datos.tipoProcedimiento || juridico.tipoProcedimiento,
      actuaciones,
      fechaUltimaActualizacion: hoy,
    },
  };
}
