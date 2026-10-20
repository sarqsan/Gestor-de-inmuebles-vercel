import type {
  ContratoFormalizacion,
  EvidenciaClausulaActualizacionRenta,
  EvidenciaUsoActualizacionRenta,
  ModalidadContractual,
} from '../types';

/** Snapshot oficial utilizado como techo en la fecha de corte de esta revisión. */
export interface DatoIRAVOficial {
  serie: 'IRAV1';
  periodo: string;
  variacionAnualPct: number;
  estado: 'PROVISIONAL' | 'DEFINITIVO';
  publicadoEn: string;
  consultadoEn: string;
  urlSerie: string;
  urlCalendario: string;
}

export interface FuenteOficialP4 {
  organismo: 'BOE' | 'INE';
  identificador: string;
  url: string;
  fechaPublicacion?: string;
  fechaEntradaVigor?: string;
  fechaConsulta: string;
  estadoFuente?: 'VIGENTE' | 'DEROGADA' | 'CONSOLIDACION_INFORMATIVA' | 'AMBITO_DISTINTO';
  nota?: string;
  serie?: 'IRAV1';
  periodo?: string;
  valorPct?: number;
}

/** Fuentes primarias oficiales y su estado a la fecha de corte; sin inferir su alcance contractual. */
export const FUENTES_NORMATIVAS_P4: readonly FuenteOficialP4[] = [
  {
    organismo: 'BOE', identificador: 'LAU consolidada a 2026-10-07 · BOE-A-1994-26003',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1994-26003&p=20261007&tn=0',
    fechaPublicacion: '2026-10-07', fechaConsulta: '2026-10-17', estadoFuente: 'CONSOLIDACION_INFORMATIVA',
    nota: 'El BOE advierte que el texto consolidado es informativo y carece de valor jurídico; cotejado con RDL 29/2026.',
  },
  {
    organismo: 'BOE', identificador: 'RDL 29/2026 · texto original · BOE-A-2026-20823',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20823',
    fechaPublicacion: '2026-10-07', fechaEntradaVigor: '2026-10-08', fechaConsulta: '2026-10-17', estadoFuente: 'VIGENTE',
    nota: 'DF 6.ª verificada directamente: para vivienda LAU con anualidad 2026-10-08 a 2027-12-31, renta superior al máximo individual aplicable ⇒ sin incremento; en los demás casos, nuevo pacto y, a falta de este, máximo 2 %. La interacción con art. 18.1, DA 11.ª y cláusula existente queda en revisión.',
  },
  {
    organismo: 'BOE', identificador: 'RDL 26/2026 · texto original · BOE-A-2026-20266',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20266',
    fechaPublicacion: '2026-09-30', fechaEntradaVigor: '2026-10-01', fechaConsulta: '2026-10-17', estadoFuente: 'DEROGADA',
    nota: 'Derogado por Resolución del Congreso de 2026-10-02, BOE-A-2026-20526; sus cambios no se tratan como vigentes.',
  },
  {
    organismo: 'BOE', identificador: 'Resolución de derogación del RDL 26/2026 · BOE-A-2026-20526',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20526',
    fechaPublicacion: '2026-10-02', fechaConsulta: '2026-10-17', estadoFuente: 'VIGENTE',
    nota: 'Publica el acuerdo del Congreso que deroga el RDL 26/2026 y deja sin efecto las modificaciones allí enumeradas.',
  },
  {
    organismo: 'BOE', identificador: 'RDL 28/2026 · texto original · BOE-A-2026-20822',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20822',
    fechaPublicacion: '2026-10-07', fechaEntradaVigor: '2026-10-08', fechaConsulta: '2026-10-17', estadoFuente: 'AMBITO_DISTINTO',
    nota: 'Su modificación del artículo 10 LAU produce efectos desde 2026-11-15; no es una regla de actualización de renta.',
  },
  {
    organismo: 'BOE', identificador: 'Resolución INE que define IRAV · BOE-A-2024-26685',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-26685',
    fechaPublicacion: '2024-12-20', fechaEntradaVigor: '2025-01-01', fechaConsulta: '2026-10-17', estadoFuente: 'VIGENTE',
  },
] as const;

export const FUENTES_IRAV_OFICIALES: readonly DatoIRAVOficial[] = [
  {
    serie: 'IRAV1', periodo: '2026M08', variacionAnualPct: 2.47, estado: 'DEFINITIVO', publicadoEn: '2026-09-15', consultadoEn: '2026-10-17',
    urlSerie: 'https://www.ine.es/consul/serie.do?d=true&s=IRAV1&c=2&nult=100',
    urlCalendario: 'https://www.ine.es/dynt3/Calendario/calenHTML.htm',
  },
  {
    serie: 'IRAV1', periodo: '2026M09', variacionAnualPct: 2.54, estado: 'DEFINITIVO', publicadoEn: '2026-10-14', consultadoEn: '2026-10-17',
    urlSerie: 'https://www.ine.es/consul/serie.do?d=true&s=IRAV1&c=2&nult=100',
    urlCalendario: 'https://www.ine.es/uc/oC7D0Ncd',
  },
] as const;

const FUENTES_DATOS_IRAV_P4: readonly FuenteOficialP4[] = FUENTES_IRAV_OFICIALES.map((dato) => ({
  organismo: 'INE', identificador: `${dato.serie} · ${dato.periodo}`,
  url: dato.urlSerie, fechaPublicacion: dato.publicadoEn, fechaConsulta: dato.consultadoEn,
  estadoFuente: 'VIGENTE', serie: dato.serie, periodo: dato.periodo, valorPct: dato.variacionAnualPct,
  nota: `${dato.estado}; difusión oficial; calendario: ${dato.urlCalendario}`,
}));

export const FECHA_ENTRADA_RDL_29_2026 = '2026-10-08';
export const FIN_LIMITE_EXTRAORDINARIO_RDL_29_2026 = '2027-12-31';
export const FIN_LIMITE_EXTRAORDINARIO_PCT = 2;
export const FECHA_LEY_VIVIENDA_2023 = '2023-05-26';
/** Guard técnico: no calcular con un snapshot de la serie sin refresco reciente. */
export const MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV = 45;

export type EvidenciaClausulaActualizacion = EvidenciaClausulaActualizacionRenta;
export type EvidenciaUsoActualizacion = EvidenciaUsoActualizacionRenta;

/** Límite individual verificado en el sistema oficial de precios, no dato de usuario. */
export interface LimitePrecioReferenciaVerificado {
  importeMensual: number;
  consultadoEn: string;
  referenciaOficial: string;
  verificadoServidor: true;
}

export interface EntradaCalculoActualizacionRenta {
  fechaCelebracion?: string;
  evidenciaContrato?: string;
  clausula?: EvidenciaClausulaActualizacion;
  evidenciaUso?: EvidenciaUsoActualizacion;
  limitePrecioReferencia?: LimitePrecioReferenciaVerificado;
  /** En la ausencia de un nuevo pacto bilateral se aplica el límite legal supletorio. */
  nuevoPactoBilateral?: { porcentaje: number; referenciaDocumental: string };
}

export type CodigoRevisionActualizacionRenta =
  | 'FECHA_CELEBRACION_NO_ACREDITADA'
  | 'FECHA_CELEBRACION_INVALIDA'
  | 'FECHA_INICIO_NO_ACREDITADA'
  | 'MODALIDAD_NO_ACREDITADA'
  | 'USO_NO_ACREDITADO'
  | 'COHORTE_ANTERIOR_2023_REQUIERE_REVISION'
  | 'COHORTE_PRE_RDL29_REQUIERE_REVISION'
  | 'COHORTE_EXTRAORDINARIA_REQUIERE_REVISION'
  | 'TEMPORADA_PRE_RDL29_REQUIERE_REVISION'
  | 'TEMPORADA_NUEVA_SIN_CAUSA_ACREDITADA'
  | 'TEMPORADA_REGIMEN_REQUIERE_REVISION'
  | 'HABITACION_SIN_USO_ACREDITADO'
  | 'HABITACION_REGIMEN_REQUIERE_REVISION'
  | 'CONTRATO_NO_VIGENTE'
  | 'RENTA_NO_VALIDA'
  | 'CLAUSULA_NO_ACREDITADA'
  | 'CLAUSULA_AUSENTE_CONFIRMADA'
  | 'CLAUSULA_SIN_REFERENCIA'
  | 'INDICE_CONTRACTUAL_NO_DISPONIBLE'
  | 'IRAV_NO_PUBLICADO_EN_FECHA'
  | 'FUENTE_IRAV_DESACTUALIZADA'
  | 'LIMITE_PRECIO_REFERENCIA_NO_VERIFICADO'
  | 'NUEVO_PACTO_BILATERAL_SIN_EVIDENCIA'
  | 'NUEVO_PACTO_BILATERAL_INVALIDO'
  | 'ANIVERSARIO_BISESTO_REQUIERE_REVISION'
  | 'FECHA_ACTUALIZACION_FUERA_COHORTE_REVISADA';

export interface PreviewActualizacionRenta {
  estado: 'CALCULABLE' | 'SIN_ACTUALIZACION' | 'REQUIERE_REVISION';
  contratoId: string;
  propietarioId?: string;
  modalidad?: ModalidadContractual;
  finalidadUso?: string;
  referenciaContrato?: string;
  evidenciaClausula?: EvidenciaClausulaActualizacion;
  evidenciaUso?: EvidenciaUsoActualizacion;
  fechaCelebracion?: string;
  fechaInicioContrato?: string;
  fechaAniversario?: string;
  fechaEfectividad: string | null;
  versionCalculo?: string;
  evidenciaComunicacion?: { fecha: string; referenciaDocumental: string; declaradaPorActor: true };
  rentaActual?: number;
  porcentajeAplicado?: number;
  importeIncremento?: number;
  rentaFutura?: number;
  indice?: {
    serie: 'IRAV1'; periodo: string; estado: 'PROVISIONAL' | 'DEFINITIVO'; valorPct: number; publicadoEn: string; consultadoEn: string;
    urlSerie: string; urlCalendario: string;
  };
  topes?: { iravPct?: number; limiteExtraordinarioPct?: number; limitePrecioReferencia?: number; aplicable: string[] };
  baseLegal?: string[];
  fuentesOficiales?: readonly FuenteOficialP4[];
  fuenteNormativa?: string[];
  codigo?: CodigoRevisionActualizacionRenta;
  motivo?: string;
  comunicado: 'NO_COMUNICADO';
  estadoAviso: 'NO_PROGRAMADO';
}

const URL_LAU_CONSOLIDADA = 'https://www.boe.es/buscar/act.php?id=BOE-A-1994-26003&p=20261007&tn=0';
const URL_RDL_29_2026 = 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20823';
const URL_RESOLUCION_IRAV = 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-26685';

function esFechaISO(valor: string | undefined): valor is string {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

function fechaUTC(valor: string): Date {
  const [y, m, d] = valor.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoUTC(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Art. 18.2 LAU: sin prueba de comunicación no se fija efectividad. */
export function fechaEfectividadDesdeComunicacion(fechaComunicacion: string): string | null {
  if (!esFechaISO(fechaComunicacion)) return null;
  const [anio, mes] = fechaComunicacion.split('-').map(Number);
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAnio = mes === 12 ? anio + 1 : anio;
  return `${proximoAnio}-${String(proximoMes).padStart(2, '0')}-01`;
}

function diasEntre(inicio: string, fin: string): number {
  return Math.round((fechaUTC(fin).getTime() - fechaUTC(inicio).getTime()) / 86_400_000);
}

function esBisiesto(anio: number): boolean {
  return anio % 4 === 0 && (anio % 100 !== 0 || anio % 400 === 0);
}

function fechaAniversario(inicio: string, anio: number): string | null {
  const [, mes, dia] = inicio.split('-').map(Number);
  if (mes === 2 && dia === 29 && !esBisiesto(anio)) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function obtenerSiguienteAniversario(fechaInicio: string, hoy: string):
  | { estado: 'OK'; fecha: string }
  | { estado: 'REVISION'; codigo: 'FECHA_INICIO_NO_ACREDITADA' | 'ANIVERSARIO_BISESTO_REQUIERE_REVISION' } {
  if (!esFechaISO(fechaInicio) || !esFechaISO(hoy)) return { estado: 'REVISION', codigo: 'FECHA_INICIO_NO_ACREDITADA' };
  if (fechaInicio > hoy) return { estado: 'REVISION', codigo: 'FECHA_INICIO_NO_ACREDITADA' };
  const anioHoy = Number(hoy.slice(0, 4));
  const primerAnioAniversario = Number(fechaInicio.slice(0, 4)) + 1;
  let anioCandidato = Math.max(primerAnioAniversario, anioHoy);
  let candidata = fechaAniversario(fechaInicio, anioCandidato);
  if (!candidata) return { estado: 'REVISION', codigo: 'ANIVERSARIO_BISESTO_REQUIERE_REVISION' };
  if (candidata < hoy) {
    anioCandidato += 1;
    candidata = fechaAniversario(fechaInicio, anioCandidato);
    if (!candidata) return { estado: 'REVISION', codigo: 'ANIVERSARIO_BISESTO_REQUIERE_REVISION' };
  }
  return { estado: 'OK', fecha: candidata };
}

function periodoIndice(dato: DatoIRAVOficial): number {
  const match = /^(\d{4})M(\d{2})$/.exec(dato.periodo);
  if (!match) return -1;
  const anio = Number(match[1]);
  const mes = Number(match[2]);
  return anio > 0 && mes >= 1 && mes <= 12 ? anio * 100 + mes : -1;
}

export function seleccionarIndiceIRAVPublicado(fecha: string, serie: readonly DatoIRAVOficial[] = FUENTES_IRAV_OFICIALES): DatoIRAVOficial | undefined {
  return [...serie]
    .filter((dato) => dato.serie === 'IRAV1'
      && dato.estado === 'DEFINITIVO'
      && periodoIndice(dato) > 0
      && Number.isFinite(dato.variacionAnualPct)
      && dato.variacionAnualPct >= 0
      && dato.variacionAnualPct <= 100
      && esFechaISO(dato.publicadoEn)
      && esFechaISO(dato.consultadoEn)
      && dato.publicadoEn < fecha
      && dato.urlSerie.startsWith('https://')
      && dato.urlCalendario.startsWith('https://'))
    .sort((a, b) => b.publicadoEn.localeCompare(a.publicadoEn) || periodoIndice(b) - periodoIndice(a))[0];
}

function consultaMasRecienteIRAV(serie: readonly DatoIRAVOficial[]): string | undefined {
  return [...serie]
    .filter((dato) => dato.serie === 'IRAV1' && dato.estado === 'DEFINITIVO' && esFechaISO(dato.consultadoEn))
    .sort((a, b) => b.consultadoEn.localeCompare(a.consultadoEn))[0]?.consultadoEn;
}

function esImporteEnCentimos(valor: number): boolean {
  if (!Number.isFinite(valor)) return false;
  const centimos = valor * 100;
  const toleranciaBinaria = Number.EPSILON * Math.max(1, Math.abs(centimos)) * 4;
  return Math.abs(centimos - Math.round(centimos)) <= toleranciaBinaria;
}

function redondearCentimosMitadArriba(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) return NaN;
  return Math.floor(valor * 100 + 0.5 + Number.EPSILON) / 100;
}

/** Aritmética monetaria reproducible; no decide si el porcentaje es jurídicamente aplicable. */
export function calcularRentaAplicandoPorcentaje(renta: number, porcentaje: number): number {
  if (!Number.isFinite(renta) || renta <= 0 || !esImporteEnCentimos(renta)
    || !Number.isFinite(porcentaje) || porcentaje < 0 || !esImporteEnCentimos(porcentaje)) return NaN;
  const centimos = Math.round(renta * 100);
  const puntosBase = Math.round(porcentaje * 100); // 2,54 % → 254 puntos base
  const numerador = centimos * (10_000 + puntosBase);
  if (!Number.isSafeInteger(numerador)) return NaN;
  const centimosFuturos = Math.floor((numerador + 5_000) / 10_000);
  return centimosFuturos / 100;
}

function revision(
  contrato: ContratoFormalizacion,
  codigo: CodigoRevisionActualizacionRenta,
  motivo: string,
  fechaCelebracion?: string,
  aniversario?: string,
): PreviewActualizacionRenta {
  const indiceDisponible = aniversario ? seleccionarIndiceIRAVPublicado(aniversario) : undefined;
  const anualidadExtraordinaria = Boolean(aniversario
    && aniversario >= FECHA_ENTRADA_RDL_29_2026
    && aniversario <= FIN_LIMITE_EXTRAORDINARIO_RDL_29_2026);
  const topes = aniversario ? {
    ...(indiceDisponible ? { iravPct: indiceDisponible.variacionAnualPct } : {}),
    ...(anualidadExtraordinaria ? { limiteExtraordinarioPct: FIN_LIMITE_EXTRAORDINARIO_PCT } : {}),
    aplicable: anualidadExtraordinaria
      ? [
          'RDL 29/2026 DF 6.ª: si supera el máximo oficial individual, no hay incremento; el dato debe verificarse en servidor.',
          'RDL 29/2026 DF 6.ª: nuevo pacto; sin nuevo pacto, máximo 2 %.',
          'LAU art. 18.1: tope IRAV general; interacción con DF 6.ª pendiente de revisión.',
        ]
      : ['LAU art. 18.1: límite IRAV y mecanismo contractual por validar.'],
  } : undefined;
  const fuentesNormativa = [
    'LAU art. 18.1: anualidad y pacto expreso; IRAV suple mecanismo no detallado y limita el incremento.',
    'LAU art. 18.2: exige comunicación escrita y hace exigible la renta desde el mes siguiente al aviso acreditado.',
    ...(anualidadExtraordinaria ? ['RDL 29/2026 DF 6.ª: régimen temporal de anualidades hasta 2027-12-31; la aplicación requiere datos del límite oficial y del pacto.'] : []),
  ];
  return {
    estado: 'REQUIERE_REVISION', contratoId: contrato.id, propietarioId: contrato.propietarioId,
    modalidad: contrato.modalidadContractual, finalidadUso: contrato.finalidadUso,
    referenciaContrato: contrato.referenciaContratoActualizacionRenta,
    evidenciaClausula: contrato.evidenciaClausulaActualizacionRenta,
    evidenciaUso: contrato.evidenciaUsoActualizacionRenta,
    ...(fechaCelebracion ? { fechaCelebracion } : {}),
    fechaInicioContrato: contrato.fechaInicioContrato,
    ...(aniversario ? { fechaAniversario: aniversario } : {}),
    fechaEfectividad: null, rentaActual: Number.isFinite(contrato.rentaMensual) ? contrato.rentaMensual : undefined,
    ...(topes ? { topes } : {}),
    baseLegal: FUENTES_NORMATIVAS_P4.map((fuente) => fuente.url),
    fuentesOficiales: [...FUENTES_NORMATIVAS_P4, ...FUENTES_DATOS_IRAV_P4],
    fuenteNormativa: fuentesNormativa,
    codigo, motivo, comunicado: 'NO_COMUNICADO', estadoAviso: 'NO_PROGRAMADO',
  };
}

/**
 * Calculadora determinista de P4. No deduce modalidad, cláusula, serie ni tope.
 * `hoy` y `serie` se inyectan para que las pruebas sean reproducibles; la
 * producción solo debe suministrar observaciones oficiales verificadas.
 */
export function calcularPreviewActualizacionRenta(
  contrato: ContratoFormalizacion,
  entrada: EntradaCalculoActualizacionRenta,
  opciones: { hoy: string; serie?: readonly DatoIRAVOficial[] },
): PreviewActualizacionRenta {
  const hoy = opciones.hoy;
  const serie = opciones.serie ?? FUENTES_IRAV_OFICIALES;
  const celebracion = entrada.fechaCelebracion ?? contrato.fechaCelebracionContrato;
  const clausula = entrada.clausula ?? contrato.evidenciaClausulaActualizacionRenta;
  const evidenciaUso = entrada.evidenciaUso ?? contrato.evidenciaUsoActualizacionRenta;
  const evidenciaContrato = entrada.evidenciaContrato ?? contrato.referenciaContratoActualizacionRenta;
  if (!celebracion) return revision(contrato, 'FECHA_CELEBRACION_NO_ACREDITADA', 'Falta una fecha de celebración acreditada; no se confunde con la fecha de inicio.');
  if (!esFechaISO(celebracion)) return revision(contrato, 'FECHA_CELEBRACION_INVALIDA', 'La fecha de celebración no tiene una fecha ISO válida.', celebracion);
  if (!esFechaISO(contrato.fechaInicioContrato)) return revision(contrato, 'FECHA_INICIO_NO_ACREDITADA', 'La fecha de inicio no es válida o no está acreditada.', celebracion);
  if (!contrato.modalidadContractual) return revision(contrato, 'MODALIDAD_NO_ACREDITADA', 'La modalidad jurídica debe constar expresamente en el contrato.', celebracion);
  if (contrato.estado === 'FINALIZADO' || contrato.estado === 'RESCINDIDO' || contrato.estado === 'CANCELADO'
    || contrato.esVigente === false) {
    return revision(contrato, 'CONTRATO_NO_VIGENTE', 'El contrato figura finalizado, rescindido, cancelado o no vigente.', celebracion);
  }
  if (!Number.isFinite(contrato.rentaMensual) || contrato.rentaMensual <= 0
    || !esImporteEnCentimos(contrato.rentaMensual)) {
    return revision(contrato, 'RENTA_NO_VALIDA', 'La renta mensual debe ser positiva, estar acreditada y expresarse en céntimos exactos.', celebracion);
  }

  if (contrato.modalidadContractual === 'LOCAL_USO_DISTINTO') {
    return revision(contrato, 'MODALIDAD_NO_ACREDITADA', 'Los arrendamientos de uso distinto requieren revisión de su régimen contractual; este motor no extrapola el art. 18 LAU.', celebracion);
  }
  if (contrato.modalidadContractual !== 'VIVIENDA_HABITUAL'
    && contrato.modalidadContractual !== 'TEMPORADA'
    && contrato.modalidadContractual !== 'HABITACION') {
    return revision(contrato, 'MODALIDAD_NO_ACREDITADA', 'Modalidad fuera del alcance del motor P4.', celebracion);
  }
  if (!contrato.finalidadUso?.trim() || !evidenciaContrato?.trim()) {
    return revision(contrato, 'USO_NO_ACREDITADO', 'Falta finalidad/uso y referencia al documento que lo acredita.', celebracion);
  }
  if (contrato.modalidadContractual === 'TEMPORADA') {
    if (!contrato.motivoTemporalidad?.trim() || !evidenciaUso?.referenciaDocumental?.trim()) {
      return revision(contrato, celebracion < FECHA_ENTRADA_RDL_29_2026
        ? 'TEMPORADA_PRE_RDL29_REQUIERE_REVISION' : 'TEMPORADA_NUEVA_SIN_CAUSA_ACREDITADA',
      'La causa temporal y el uso deben acreditarse; la modalidad temporal no se trata como vivienda habitual.', celebracion);
    }
    return revision(contrato, celebracion < FECHA_ENTRADA_RDL_29_2026
      ? 'TEMPORADA_PRE_RDL29_REQUIERE_REVISION' : 'TEMPORADA_REGIMEN_REQUIERE_REVISION',
    celebracion < FECHA_ENTRADA_RDL_29_2026
      ? 'LAU DT 8.ª: el contrato temporal anterior sigue como uso distinto bajo su régimen hasta el vencimiento pactado, sin prórroga; una renovación tras la entrada en vigor sigue el nuevo régimen temporal. Requiere revisión.'
      : 'LAU arts. 7, 9 bis y 17.8 diferencian causa, duración y contratos temporales sucesivos con límite IRAV; no se extrapola el art. 18 sin revisión.',
    celebracion);
  }
  if (contrato.modalidadContractual === 'HABITACION') {
    if (!evidenciaUso?.usoHabitacion || !evidenciaUso.referenciaDocumental?.trim()) {
      return revision(contrato, 'HABITACION_SIN_USO_ACREDITADO', 'Una habitación puede responder a uso habitual o temporal; se exige evidencia y no se infiere el régimen.', celebracion);
    }
    return revision(contrato, 'HABITACION_REGIMEN_REQUIERE_REVISION', 'LAU art. 17.9 regula el límite agregado de contratos parciales y, según uso/modalidad, pueden intervenir los apartados 6–8; el régimen de actualización de esta habitación requiere revisión, sin extrapolar el art. 18.', celebracion);
  }
  if (contrato.modalidadContractual !== 'VIVIENDA_HABITUAL') {
    return revision(contrato, 'MODALIDAD_NO_ACREDITADA', 'La modalidad requiere revisión.', celebracion);
  }
  const siguiente = obtenerSiguienteAniversario(contrato.fechaInicioContrato, hoy);
  if (siguiente.estado !== 'OK') return revision(contrato, siguiente.codigo, 'No se puede resolver el aniversario sin adoptar una convención de fechas no acreditada.', celebracion);
  const aniversario = siguiente.fecha;
  const enPeriodoExtraordinario = aniversario >= FECHA_ENTRADA_RDL_29_2026
    && aniversario <= FIN_LIMITE_EXTRAORDINARIO_RDL_29_2026;
  const contratoAnteriorLeyVivienda = celebracion < FECHA_LEY_VIVIENDA_2023;
  const contratoAnteriorRDL29 = celebracion < FECHA_ENTRADA_RDL_29_2026;
  if (aniversario > FIN_LIMITE_EXTRAORDINARIO_RDL_29_2026) {
    return revision(contrato, 'FECHA_ACTUALIZACION_FUERA_COHORTE_REVISADA', 'La anualidad queda fuera del horizonte normativo revisado; se debe validar la norma vigente antes de calcular.', celebracion, aniversario);
  }
  if (aniversario > hoy) {
    return revision(contrato, 'IRAV_NO_PUBLICADO_EN_FECHA', 'La anualidad es futura; no se anticipa qué observación oficial estará publicada en esa fecha.', celebracion, aniversario);
  }
  if (!clausula || clausula.estado === 'NO_ACREDITADA') {
    return revision(contrato, 'CLAUSULA_NO_ACREDITADA', 'No se infiere la existencia ni el contenido de una cláusula de actualización.', celebracion, aniversario);
  }
  if (clausula.estado === 'AUSENTE_CONFIRMADA') {
    if (enPeriodoExtraordinario) {
      return revision(contrato, 'COHORTE_EXTRAORDINARIA_REQUIERE_REVISION', 'La anualidad cae dentro de la DF 6.ª del RDL 29/2026. El art. 18 exige pacto expreso, pero no se infiere si en este contrato concurre la condición de que la renta «deba ser actualizada».', celebracion, aniversario);
    }
    if (contratoAnteriorLeyVivienda) {
      return revision(contrato, 'COHORTE_ANTERIOR_2023_REQUIERE_REVISION', 'La DT 4.ª de la Ley 12/2023, modificada por el RDL 29/2026 art. 4, remite al límite de la DA 11.ª y al art. 18.1 actual, mientras otros aspectos conservan el régimen de celebración; no se concluye aquí la ausencia de actualización.', celebracion, aniversario);
    }
    if (contratoAnteriorRDL29) {
      return revision(contrato, 'COHORTE_PRE_RDL29_REQUIERE_REVISION', 'El contrato es anterior al RDL 29/2026 y la interacción temporal entre su cláusula/régimen de celebración y el art. 18.1 vigente requiere revisión.', celebracion, aniversario);
    }
    return {
      estado: 'SIN_ACTUALIZACION', contratoId: contrato.id, propietarioId: contrato.propietarioId,
      modalidad: contrato.modalidadContractual, finalidadUso: contrato.finalidadUso,
      referenciaContrato: contrato.referenciaContratoActualizacionRenta,
      evidenciaClausula: clausula, evidenciaUso,
      fechaCelebracion: celebracion, fechaInicioContrato: contrato.fechaInicioContrato,
      fechaAniversario: aniversario,
      fechaEfectividad: null, rentaActual: contrato.rentaMensual,
      baseLegal: [URL_LAU_CONSOLIDADA, URL_RDL_29_2026],
      fuentesOficiales: [...FUENTES_NORMATIVAS_P4, ...FUENTES_DATOS_IRAV_P4],
      fuenteNormativa: ['LAU art. 18.1: en defecto de pacto expreso no se aplica actualización.'],
      comunicado: 'NO_COMUNICADO', estadoAviso: 'NO_PROGRAMADO',
    };
  }
  if (!clausula.textoExtracto?.trim() || !clausula.referenciaDocumental?.trim()) {
    return revision(contrato, 'CLAUSULA_SIN_REFERENCIA', 'La cláusula acreditada necesita extracto y referencia localizable al original.', celebracion, aniversario);
  }
  if (!clausula.mecanismo) return revision(contrato, 'INDICE_CONTRACTUAL_NO_DISPONIBLE', 'No se identifica el mecanismo pactado.', celebracion, aniversario);
  if (clausula.mecanismo !== 'IRAV' && clausula.mecanismo !== 'SIN_DETALLAR') {
    return revision(contrato, 'INDICE_CONTRACTUAL_NO_DISPONIBLE', 'El mecanismo indicado no está cubierto por una serie oficial verificada en esta versión; no se sustituye por IRAV.', celebracion, aniversario);
  }
  if (!enPeriodoExtraordinario && contratoAnteriorLeyVivienda) {
    return revision(contrato, 'COHORTE_ANTERIOR_2023_REQUIERE_REVISION', 'La DT 4.ª de la Ley 12/2023, modificada por el RDL 29/2026 art. 4, remite al límite de la DA 11.ª y al art. 18.1 actual, mientras otros aspectos conservan el régimen de celebración.', celebracion, aniversario);
  }
  if (!enPeriodoExtraordinario && contratoAnteriorRDL29) {
    return revision(contrato, 'COHORTE_PRE_RDL29_REQUIERE_REVISION', 'El contrato es anterior al RDL 29/2026; hay que cotejar el régimen/cláusula de celebración, la DA 11.ª y el art. 18.1 vigente antes de calcular.', celebracion, aniversario);
  }

  const indice = seleccionarIndiceIRAVPublicado(aniversario, serie);
  if (!indice) return revision(contrato, 'IRAV_NO_PUBLICADO_EN_FECHA', 'No hay un dato IRAV publicado antes de la fecha de actualización; no se anticipa ni se reutiliza otra serie.', celebracion, aniversario);
  const consultadoEn = consultaMasRecienteIRAV(serie);
  if (!consultadoEn || consultadoEn > hoy || diasEntre(consultadoEn, hoy) > MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV) {
    return revision(contrato, 'FUENTE_IRAV_DESACTUALIZADA', 'El snapshot IRAV no tiene verificación reciente respecto a la fecha de cálculo.', celebracion, aniversario);
  }

  if (enPeriodoExtraordinario) {
    const limite = entrada.limitePrecioReferencia;
    if (!limite || limite.verificadoServidor !== true || !Number.isFinite(limite.importeMensual)
      || limite.importeMensual <= 0 || !esFechaISO(limite.consultadoEn) || limite.consultadoEn > aniversario
      || !limite.referenciaOficial.trim()) {
      return revision(contrato, 'LIMITE_PRECIO_REFERENCIA_NO_VERIFICADO', 'El máximo de precios debe obtenerse y validarse en el servidor contra el sistema oficial; el dato del cliente no es confiable.', celebracion, aniversario);
    }
    if (entrada.nuevoPactoBilateral) {
      if (!entrada.nuevoPactoBilateral.referenciaDocumental?.trim()) {
        return revision(contrato, 'NUEVO_PACTO_BILATERAL_SIN_EVIDENCIA', 'El nuevo pacto bilateral necesita referencia documental verificable.', celebracion, aniversario);
      }
      if (!Number.isFinite(entrada.nuevoPactoBilateral.porcentaje) || entrada.nuevoPactoBilateral.porcentaje < 0) {
        return revision(contrato, 'NUEVO_PACTO_BILATERAL_INVALIDO', 'El porcentaje del nuevo pacto no es válido.', celebracion, aniversario);
      }
    }
    const resultado = revision(contrato, 'COHORTE_EXTRAORDINARIA_REQUIERE_REVISION', 'RDL 29/2026 DF 6.ª: el límite individual ya está verificado, pero falta cerrar su interacción con el art. 18.1 LAU, la DA 11.ª, la cláusula acreditada y, en su caso, el nuevo pacto. No se determina importe ni ausencia de aumento.', celebracion, aniversario);
    return {
      ...resultado,
      topes: {
        ...(resultado.topes || { aplicable: [] }),
        limitePrecioReferencia: limite.importeMensual,
        aplicable: [...(resultado.topes?.aplicable || []), `Máximo del sistema de referencia verificado en servidor: ${limite.importeMensual.toFixed(2)} €/mes.`],
      },
    };
  }

  const porcentaje = indice.variacionAnualPct;
  if (!Number.isFinite(porcentaje) || porcentaje < 0) {
    return revision(contrato, 'INDICE_CONTRACTUAL_NO_DISPONIBLE', 'El índice produce una variación negativa o no válida; requiere revisión contractual y legal.', celebracion, aniversario);
  }
  const rentaBase = redondearCentimosMitadArriba(contrato.rentaMensual);
  const nuevaRenta = calcularRentaAplicandoPorcentaje(rentaBase, porcentaje);
  if (!Number.isFinite(nuevaRenta)) return revision(contrato, 'RENTA_NO_VALIDA', 'El cálculo excede el rango monetario reproducible.', celebracion, aniversario);
  const importeIncremento = redondearCentimosMitadArriba(nuevaRenta - rentaBase);
  return {
    estado: 'CALCULABLE', contratoId: contrato.id, propietarioId: contrato.propietarioId,
    modalidad: contrato.modalidadContractual, finalidadUso: contrato.finalidadUso,
    referenciaContrato: contrato.referenciaContratoActualizacionRenta,
    evidenciaClausula: clausula, evidenciaUso,
    fechaCelebracion: celebracion, fechaInicioContrato: contrato.fechaInicioContrato,
    fechaAniversario: aniversario,
    // LAU art. 18.2: la renta se exige desde el mes posterior al aviso escrito.
    // Este preview no acredita una comunicación, por eso no fija efectividad.
    fechaEfectividad: null, rentaActual: rentaBase,
    porcentajeAplicado: porcentaje, importeIncremento,
    rentaFutura: nuevaRenta,
    indice: {
      serie: 'IRAV1', periodo: indice.periodo, estado: indice.estado, valorPct: indice.variacionAnualPct,
      publicadoEn: indice.publicadoEn, consultadoEn: indice.consultadoEn,
      urlSerie: indice.urlSerie, urlCalendario: indice.urlCalendario,
    },
    topes: { iravPct: indice.variacionAnualPct, aplicable: ['IRAV (LAU art. 18.1)'] },
    baseLegal: [URL_LAU_CONSOLIDADA, URL_RDL_29_2026, URL_RESOLUCION_IRAV],
    fuentesOficiales: [
      ...FUENTES_NORMATIVAS_P4,
      {
        organismo: 'INE', identificador: `IRAV1 · ${indice.periodo}`,
        url: indice.urlSerie, fechaPublicacion: indice.publicadoEn,
        fechaConsulta: indice.consultadoEn, serie: indice.serie,
        estadoFuente: 'VIGENTE', nota: indice.estado,
        periodo: indice.periodo, valorPct: indice.variacionAnualPct,
      },
    ],
    fuenteNormativa: [
      'LAU art. 18.1: actualización en cada anualidad, en los términos pactados; sin pacto expreso no hay actualización; pacto sin índice/metodología detallados remite al IRAV, que además actúa como tope general.',
      'LAU art. 18.2: aviso escrito con el porcentaje aplicado; la renta solo es exigible desde el mes siguiente a la comunicación acreditada.',
      'RDL 29/2026 art. 4 modifica la DT 4.ª de la Ley 12/2023: contratos anteriores a esa ley actualizan bajo el límite de la DA 11.ª y el art. 18.1 vigente; el resto conserva el régimen de su celebración.',
      'RDL 29/2026, DF 6.ª (texto original consultado directamente el 2026-10-17): vivienda sujeta a LAU cuya anualidad cae entre 2026-10-08 y 2027-12-31; si la renta supera el máximo individual aplicable no procede incremento; en los demás casos rige el nuevo pacto y, en su ausencia, el aumento no puede superar 2 %. Falta resolver su encaje con art. 18.1, DA 11.ª, régimen/cohorte del contrato y cláusula existente; no se calcula importe automáticamente.',
      'RDL 26/2026 consta derogado por Resolución del Congreso de 2026-10-02; RDL 28/2026 modifica duración/prórroga del art. 10, no el cálculo del art. 18.',
    ],
    comunicado: 'NO_COMUNICADO', estadoAviso: 'NO_PROGRAMADO',
  };
}

/**
 * Constructor puro del borrador de aviso. La fecha la elige expresamente el
 * actor; no se inventa un preaviso legal de 30 días. Esta función no persiste,
 * no crea cron y no equivale a envío o recepción.
 */
export function programarAvisoActualizacionRenta(
  preview: PreviewActualizacionRenta,
  entrada: {
    actorUid: string;
    actorUsuarioId: string;
    idempotencyKeyHash: string;
    confirmadoEn: string;
    fechaProgramadaAviso: string;
  },
): {
  id: string; contratoId: string; fechaAniversario: string; fechaProgramadaAviso: string;
  estado: 'PENDIENTE_ENVIO'; comunicado: 'NO_COMUNICADO';
  actorUid: string; actorUsuarioId: string; confirmadoEn: string;
  idempotencyKeyHash: string; montoPropuesto: number; rentaFutura: number;
  fechaEfectividad: null; version: number;
} | null {
  const confirmadoMs = Date.parse(entrada.confirmadoEn);
  if (preview.estado !== 'CALCULABLE' || !preview.contratoId
    || !esFechaISO(preview.fechaAniversario) || !esFechaISO(entrada.fechaProgramadaAviso)
    || preview.rentaFutura === undefined || !Number.isFinite(preview.rentaFutura) || preview.rentaFutura <= 0
    || preview.porcentajeAplicado === undefined || !Number.isFinite(preview.porcentajeAplicado)
    || preview.importeIncremento === undefined || !Number.isFinite(preview.importeIncremento) || preview.importeIncremento < 0
    || preview.comunicado !== 'NO_COMUNICADO' || preview.estadoAviso !== 'NO_PROGRAMADO'
    || !entrada.actorUid || !entrada.actorUsuarioId || !/^[a-f0-9]{64}$/.test(entrada.idempotencyKeyHash)
    || !Number.isFinite(confirmadoMs) || new Date(confirmadoMs).toISOString() !== entrada.confirmadoEn) return null;
  return {
    id: `act-renta-${preview.contratoId}-${preview.fechaAniversario}-${entrada.idempotencyKeyHash.slice(0, 20)}`,
    contratoId: preview.contratoId,
    fechaAniversario: preview.fechaAniversario,
    fechaProgramadaAviso: entrada.fechaProgramadaAviso,
    estado: 'PENDIENTE_ENVIO', comunicado: 'NO_COMUNICADO',
    actorUid: entrada.actorUid, actorUsuarioId: entrada.actorUsuarioId,
    confirmadoEn: entrada.confirmadoEn,
    idempotencyKeyHash: entrada.idempotencyKeyHash,
    montoPropuesto: preview.importeIncremento,
    rentaFutura: preview.rentaFutura,
    fechaEfectividad: null,
    version: 1,
  };
}
