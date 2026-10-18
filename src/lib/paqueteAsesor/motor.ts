/**
 * FASE F — Motor puro del paquete contable del asesor (ver `tipos.ts`).
 *
 * Reutiliza, sin modificar ninguna pieza existente:
 *  · `analizarDeducibilidad` (fuente única de deducibilidad del ERP),
 *  · `COLUMNAS_CSV` del exportador canónico (GASTO/COBRO: una sola definición),
 *  · `crearZip` determinista del expediente fiscal B6,
 *  · `sha256Hex` isomórfico y `jsonEstable` (serialización canónica).
 *
 * añade (lo que el plan §4.3/§5 declara ausente en v1):
 *  · paquete multi-entidad en un solo ZIP (hoy: una entidad por operación),
 *  · entidades FACTURA / LIQUIDACIÓN / PÓLIZA en el paquete,
 *  · filtro temporal de CONTRATO por vigencia («vigentes en el ejercicio N»)
 *    y filtro mensual `YYYY-MM` (intersección con los ejercicios, fail-closed),
 *  · duplicados de movimientos y discrepancias fiscales/documentales
 *    identificados (nunca fusionados ni corregidos en silencio),
 *  · libro de ingresos y gastos por fecha con cuadre verificado.
 *
 * Determinismo: mismo input + mismo `generatedAt` ⇒ mismo ZIP byte a byte
 * (entradas ordenadas, fecha DOS fija del escritor B6, JSON estable).
 * El orden de llegada de los registros no afecta al resultado.
 */
import type { CobroPeriodo, ContratoFormalizacion, Gasto } from '../../types';
import { analizarDeducibilidad } from '../../utils/deducibilidadEngine';
import { sha256Hex } from '../importacion/hash';
import { COLUMNAS_CSV } from '../importExport/exportador';
import type { AmbitoAutorizado } from '../importExport/contrato';
import { jsonEstable } from '../migracion/motor';
import { crearZip, utf8Bytes, type EntradaZip } from '../expedienteFiscal/zip';
import {
  PAQUETE_ASESOR_SCHEMA,
  type EntradaPaqueteAsesor,
  type IncidenciaPaqueteAsesor,
  type LineaLibroAsesor,
  type PaqueteAsesorGenerado,
  type ResultadoEmpaquetadoAsesor,
  type SolicitudPaqueteAsesor,
  type TotalesEjercicioAsesor,
  type TotalesMesAsesor,
  type TotalesPaqueteAsesor,
  type VeredictoAmbitoPaquete,
  type VerificacionCuadre,
} from './tipos';

// ---------------------------------------------------------------------------
// Columnas del paquete (GASTO/COBRO reutilizan la definición canónica v1)
// ---------------------------------------------------------------------------

export const COLUMNAS_INMUEBLE_PAQUETE = [
  'id', 'direccion', 'ciudad', 'referenciaCatastral',
  'propietarioId', 'propietarioPrincipalId', 'estado', 'tipoInmueble',
] as const;

/**
 * Contrato con los nombres del modelo canónico (`fechaInicioContrato`…).
 * Nota honesta: `COLUMNAS_CSV.CONTRATO` de v1 usa `fechaInicio`/`fechaFin`,
 * que no son campos de `ContratoFormalizacion`; aquí no se repite ese
 * desajuste (la unificación de v1 queda para la integración, no se toca).
 * Sin DNI/teléfono/email/IBAN del arrendador ni del arrendatario.
 */
export const COLUMNAS_CONTRATO_PAQUETE = [
  'id', 'inmuebleId', 'propietarioId', 'candidatoId', 'candidatoNombre',
  'fechaInicioContrato', 'fechaFinContrato', 'rentaMensual', 'estado',
  'inmuebleDireccion',
] as const;

export const COLUMNAS_FACTURA_PAQUETE = [
  'id', 'propietarioId', 'inmuebleId', 'contratoId', 'gastoId', 'clase',
  'tipo', 'serie', 'numero', 'ejercicio', 'fechaExpedicion', 'fechaOperacion',
  'emisorNombre', 'emisorNif', 'receptorNombre', 'receptorNif',
  'baseImponible', 'cuotaIva', 'cuotaRetencion', 'importeTotal', 'estado',
] as const;

/** Liquidación SIN IBAN de abono ni referencia bancaria de pago (minimización). */
export const COLUMNAS_LIQUIDACION_PAQUETE = [
  'id', 'propietarioId', 'propietarioNombre', 'periodo', 'anio', 'mes',
  'totalBrutoCobrado', 'totalHonorarios', 'totalIvaHonorarios', 'totalGastos',
  'totalRetenciones', 'totalAjustes', 'totalDeducciones', 'netoPropietario',
  'estado', 'fechaGeneracion', 'fechaPago',
] as const;

export const COLUMNAS_POLIZA_PAQUETE = [
  'id', 'propietarioId', 'inmuebleId', 'aseguradora', 'numeroPoliza', 'tipo',
  'fechaInicio', 'fechaVencimiento', 'estado', 'primaAnual',
] as const;

export const COLUMNAS_LIBRO = [
  'fecha', 'ejercicio', 'tipo', 'concepto', 'inmuebleId',
  'inmuebleDireccion', 'contraparte', 'base', 'iva', 'retencion', 'total',
  'categoria', 'deducible', 'origenDeducibilidad', 'fuenteTipo', 'fuenteId',
  'documentoNombre', 'desgloseFiscal',
] as const;

// ---------------------------------------------------------------------------
// Utilidades puras (fechas estrictas sin zona horaria, dinero a céntimos)
// ---------------------------------------------------------------------------

const RE_FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true solo para `YYYY-MM-DD` que además es fecha real (rechaza 2024-02-31). */
export function esFechaIsoValida(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const m = RE_FECHA_ISO.exec(valor);
  if (!m) return false;
  const anio = Number(m[1]); const mes = Number(m[2]); const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function anioDeFechaIso(fecha: string): number {
  return Number(fecha.slice(0, 4));
}

const RE_MES = /^(\d{4})-(\d{2})$/;

/** true solo para `YYYY-MM` con año plausible (1900–9999) y mes 01–12. */
export function esMesValido(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false;
  const m = RE_MES.exec(valor);
  if (!m) return false;
  const anio = Number(m[1]); const mes = Number(m[2]);
  return anio >= 1900 && anio <= 9999 && mes >= 1 && mes <= 12;
}

/** Último día (ISO) de un mes `YYYY-MM` válido, sin zona horaria local. */
export function ultimoDiaDeMes(mes: string): string {
  const anio = Number(mes.slice(0, 4));
  const numMes = Number(mes.slice(5, 7));
  // Día 0 del mes siguiente = último día de este mes (UTC, bisiestos incluidos).
  const dia = new Date(Date.UTC(anio, numMes, 0)).getUTCDate();
  return `${mes}-${String(dia).padStart(2, '0')}`;
}

function mesDeFechaIso(fecha: string): string {
  return fecha.slice(0, 7);
}

/** `YYYY-MM` de una factura desde su fecha declarada (nunca del solo ejercicio). */
function mesDeFactura(f: {
  fechaExpedicion?: unknown; fechaExpedicionUtc?: unknown;
}): string | null {
  if (typeof f.fechaExpedicion === 'string') {
    const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(f.fechaExpedicion);
    if (dmy) {
      const iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      return esFechaIsoValida(iso) ? `${dmy[3]}-${dmy[2]}` : null;
    }
    if (esFechaIsoValida(f.fechaExpedicion)) return mesDeFechaIso(f.fechaExpedicion);
  }
  if (typeof f.fechaExpedicionUtc === 'string' && esFechaIsoValida(f.fechaExpedicionUtc.slice(0, 10))) {
    return f.fechaExpedicionUtc.slice(0, 7);
  }
  return null;
}

/**
 * Mes contable de un cobro: `periodoMesAnio` válido manda (semántica del
 * exportador canónico); si falta o es ilegible se deriva de `anio`+`mes`.
 */
function mesDeCobro(c: CobroPeriodo): string | null {
  if (esMesValido(c.periodoMesAnio)) return c.periodoMesAnio;
  if (typeof c.anio === 'number' && Number.isInteger(c.anio)
    && typeof c.mes === 'number' && Number.isInteger(c.mes) && c.mes >= 1 && c.mes <= 12) {
    const candidato = `${c.anio}-${String(c.mes).padStart(2, '0')}`;
    return esMesValido(candidato) ? candidato : null;
  }
  return null;
}

/** Mes contable de un gasto: `periodoMesAnio` válido, o el de su fecha. */
function mesDeGasto(g: Gasto): string | null {
  if (esMesValido(g.periodoMesAnio)) return g.periodoMesAnio;
  const fecha = fechaGasto(g);
  return fecha ? mesDeFechaIso(fecha) : null;
}

/** Mes de una liquidación: `periodo` (`YYYY-MM` por contrato), o `anio`+`mes`. */
function mesDeLiquidacion(l: { periodo?: unknown; anio?: unknown; mes?: unknown }): string | null {
  if (esMesValido(l.periodo)) return l.periodo;
  if (typeof l.anio === 'number' && Number.isInteger(l.anio)
    && typeof l.mes === 'number' && Number.isInteger(l.mes) && l.mes >= 1 && l.mes <= 12) {
    const candidato = `${l.anio}-${String(l.mes).padStart(2, '0')}`;
    return esMesValido(candidato) ? candidato : null;
  }
  return null;
}

/**
 * Ejercicio de una factura: campo `ejercicio` si es entero plausible; si no,
 * se deriva de `fechaExpedicion` en su formato declarado `dd-mm-aaaa` (o ISO)
 * o de `fechaExpedicionUtc`. Nada de esto inventa una fecha: sin fuente
 * legible devuelve null y la factura queda fuera con incidencia.
 */
function ejercicioDeFactura(f: {
  ejercicio?: unknown; fechaExpedicion?: unknown; fechaExpedicionUtc?: unknown;
}): number | null {
  if (typeof f.ejercicio === 'number' && Number.isInteger(f.ejercicio)
    && f.ejercicio >= 1900 && f.ejercicio <= 9999) return f.ejercicio;
  if (typeof f.fechaExpedicion === 'string') {
    const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(f.fechaExpedicion);
    if (dmy) {
      const iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      if (esFechaIsoValida(iso)) return Number(dmy[3]);
      return null;
    }
    if (esFechaIsoValida(f.fechaExpedicion)) return anioDeFechaIso(f.fechaExpedicion);
  }
  if (typeof f.fechaExpedicionUtc === 'string' && esFechaIsoValida(f.fechaExpedicionUtc.slice(0, 10))) {
    return Number(f.fechaExpedicionUtc.slice(0, 4));
  }
  return null;
}

function fechaGasto(g: Gasto): string {
  // Primera fecha VÁLIDA (devengo → pago → alias): un devengo imposible no
  // debe bloquear una fechaPago acreditada, igual que ya hace el cobro.
  for (const candidata of [g.fechaDevengo, g.fechaPago, g.fecha]) {
    if (esFechaIsoValida(candidata)) return candidata;
  }
  return '';
}

function ejercicioDeGasto(g: Gasto): number | null {
  if (typeof g.ejercicioFiscal === 'number' && Number.isInteger(g.ejercicioFiscal)) {
    return g.ejercicioFiscal;
  }
  const fecha = fechaGasto(g);
  return fecha ? anioDeFechaIso(fecha) : null;
}

/** Redondeo a céntimos (los importes del ERP son floats; el cuadre es en €). */
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function importeValido(n: unknown): n is number {
  // Además de finito y no negativo, el importe debe ser representable en
  // céntimos enteros seguros: más allá de MAX_SAFE_INTEGER céntimos el
  // cuadre en coma flotante dejaría de ser exacto y se falsearía en silencio.
  return typeof n === 'number' && Number.isFinite(n) && n >= 0
    && Number.isSafeInteger(Math.round(n * 100));
}

/** true si el importe es representable en céntimos exactos (sin subcéntimo). */
function esImporteEnCentimosExactos(n: number): boolean {
  const centimos = Math.round(n * 100);
  // Tolerancia solo para el error binario de representar euros con dos
  // decimales (p. ej. 1234567.89): sigue muy por debajo de un subcéntimo.
  const tolerancia = Math.min(0.001, Math.max(1e-9, Math.abs(centimos) * Number.EPSILON * 8));
  return Math.abs(n * 100 - centimos) <= tolerancia;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
}

function compararPorIdYContenido<T extends { id?: unknown }>(a: T, b: T): number {
  return texto(a.id).localeCompare(texto(b.id))
    || jsonEstable(a).localeCompare(jsonEstable(b));
}

function ordenarPorId<T extends { id?: unknown }>(arr: readonly T[]): T[] {
  // Desempate por contenido canónico: con ids duplicados, el orden de
  // llegada tampoco debe cambiar el paquete (determinismo también ahí).
  return [...arr].sort(compararPorIdYContenido);
}

/**
 * Agrupa por `id` conservando el orden ya ordenado. Solo devuelve grupos con
 * más de una aparición (los duplicados se identifican; nunca se fusionan).
 */
function gruposDuplicadosPorId<T extends { id?: unknown }>(
  arr: readonly T[],
): { id: string; elementos: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const el of arr) {
    const id = texto(el.id);
    if (id === '') continue;
    const grupo = grupos.get(id) ?? [];
    grupo.push(el);
    grupos.set(id, grupo);
  }
  return [...grupos.entries()]
    .filter(([, elementos]) => elementos.length > 1)
    .map(([id, elementos]) => ({ id, elementos }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Solape de un intervalo [inicio, fin|∞) con alguno de los ejercicios. */
function solapaEjercicios(inicio: string, fin: string | null, ejercicios: readonly number[]): boolean {
  return ejercicios.some((ej) => {
    const desde = `${ej}-01-01`;
    const hasta = `${ej}-12-31`;
    return inicio <= hasta && (fin === null || fin >= desde);
  });
}

/** Solape de un intervalo [inicio, fin|∞) con alguno de los meses `YYYY-MM`. */
function solapaMeses(inicio: string, fin: string | null, meses: readonly string[]): boolean {
  return meses.some((mes) => {
    const desde = `${mes}-01`;
    const hasta = ultimoDiaDeMes(mes);
    return inicio <= hasta && (fin === null || fin >= desde);
  });
}

/**
 * ¿Estuvo vigente el contrato en alguno de los ejercicios dados?
 * Vigencia = [fechaInicioContrato, fechaFinContrato] (fin ausente = abierto).
 * Sin fecha de inicio válida NO se considera vigente (nunca se infiere).
 */
export function contratoVigenteEnEjercicios(
  contrato: Pick<ContratoFormalizacion, 'fechaInicioContrato' | 'fechaFinContrato'>,
  ejercicios: readonly number[],
): boolean {
  if (ejercicios.length === 0) return true;
  if (!esFechaIsoValida(contrato.fechaInicioContrato)) return false;
  const fin = contrato.fechaFinContrato;
  if (fin !== undefined && fin !== null && fin !== '' && !esFechaIsoValida(fin)) return false;
  return solapaEjercicios(
    contrato.fechaInicioContrato,
    fin && esFechaIsoValida(fin) ? fin : null,
    ejercicios,
  );
}

/** Igual que por ejercicios, con meses `YYYY-MM` (bordes inclusivos). */
export function contratoVigenteEnMeses(
  contrato: Pick<ContratoFormalizacion, 'fechaInicioContrato' | 'fechaFinContrato'>,
  meses: readonly string[],
): boolean {
  if (meses.length === 0) return true;
  if (!esFechaIsoValida(contrato.fechaInicioContrato)) return false;
  const fin = contrato.fechaFinContrato;
  if (fin !== undefined && fin !== null && fin !== '' && !esFechaIsoValida(fin)) return false;
  return solapaMeses(
    contrato.fechaInicioContrato,
    fin && esFechaIsoValida(fin) ? fin : null,
    meses,
  );
}

// ---------------------------------------------------------------------------
// Ámbito (mismas reglas que el exportador v1, versión multi-entidad)
// ---------------------------------------------------------------------------

/**
 * Valida el ámbito del paquete contra lo autorizado.
 * Espejo deliberado de `validarAmbitoExportacion` (v1 valida una sola
 * entidad y rechaza las nuevas); la unificación en un contrato v2 es trabajo
 * de la integración posterior — aquí no se modifica el exportador.
 */
export function validarAmbitoPaquete(
  solicitado: SolicitudPaqueteAsesor,
  autorizado: AmbitoAutorizado,
  catalogoInmuebles: ReadonlyArray<{ id: string; propietarioId?: string; propietarioPrincipalId?: string }>,
): VeredictoAmbitoPaquete {
  const avisos: string[] = [];
  const denegar = (error: string): VeredictoAmbitoPaquete => ({
    ok: false, error, propietariosEfectivos: [], inmueblesEfectivos: [],
    ejerciciosEfectivos: null, mesesEfectivos: null, avisos,
  });

  const ejercicios = [...new Set((solicitado.ejercicios ?? []).filter(
    (e) => Number.isInteger(e) && e >= 1900 && e <= 9999,
  ))].sort((a, b) => a - b);
  if ((solicitado.ejercicios?.length ?? 0) !== ejercicios.length) {
    return denegar('ejercicios inválidos (se esperaban años enteros sin duplicados)');
  }

  const meses = [...new Set((solicitado.meses ?? []).filter((m) => esMesValido(m)))]
    .sort((a, b) => a.localeCompare(b));
  if ((solicitado.meses?.length ?? 0) !== meses.length) {
    return denegar("meses inválidos (se esperaban valores 'YYYY-MM' sin duplicados)");
  }
  if (ejercicios.length > 0 && meses.length > 0) {
    const fuera = meses.filter((m) => !ejercicios.includes(Number(m.slice(0, 4))));
    if (fuera.length > 0) {
      return denegar(`meses fuera de los ejercicios solicitados: ${fuera.join(', ')} (solicitud contradictoria)`);
    }
  }

  if (solicitado.propietarioIds.some((p) => typeof p !== 'string' || p.trim() === '')) {
    return denegar('propietarioIds contiene un identificador vacío o no textual');
  }
  const legibles = autorizado.propietarioIdsLegibles; // null = master
  let propietariosEfectivos: string[];
  if (solicitado.propietarioIds.length === 0) {
    if (legibles === null) {
      return denegar('master debe indicar propietarioIds explícitos (sin volcado global implícito)');
    }
    propietariosEfectivos = [...new Set(legibles)];
    avisos.push('sin propietarioIds: se incluyen todos los legibles');
  } else {
    if (legibles !== null) {
      const fuera = solicitado.propietarioIds.filter((p) => !legibles.includes(p));
      if (fuera.length > 0) return denegar(`fuera de ámbito: ${fuera.join(', ')} (no legible)`);
    }
    propietariosEfectivos = [...new Set(solicitado.propietarioIds)];
  }
  if (propietariosEfectivos.length === 0
    || propietariosEfectivos.some((p) => typeof p !== 'string' || p.trim() === '')) {
    return denegar('sin propietarios efectivos: paquete denegado (fail-closed)');
  }

  const efectivos = new Set(propietariosEfectivos);
  let inmueblesEfectivos: string[] | null = null;
  if (solicitado.inmuebleIds && solicitado.inmuebleIds.length > 0) {
    for (const id of solicitado.inmuebleIds) {
      const ficha = catalogoInmuebles.find((c) => c.id === id);
      if (!ficha) return denegar(`inmueble '${id}' no encontrado en catálogo`);
      const titulares = [ficha.propietarioId, ficha.propietarioPrincipalId]
        .filter((t): t is string => typeof t === 'string' && t.trim() !== '');
      // También para master: pedir p1 + un inmueble cuyos titulares
      // acreditados son otros es una solicitud contradictoria, no un permiso.
      if (titulares.length === 0 ? legibles !== null : !titulares.some((t) => efectivos.has(t))) {
        return denegar(`inmueble '${id}' fuera de ámbito (titular '${titulares.join('/') || '?'}' no autorizado)`);
      }
    }
    inmueblesEfectivos = [...new Set(solicitado.inmuebleIds)];
  }
  const ejerciciosEfectivos = ejercicios.length > 0 ? ejercicios : null;
  const mesesEfectivos = meses.length > 0 ? meses : null;
  if (ejerciciosEfectivos === null && mesesEfectivos === null) {
    avisos.push('sin ejercicios ni meses: paquete sin filtro temporal');
  }
  return {
    ok: true, propietariosEfectivos, inmueblesEfectivos, ejerciciosEfectivos, mesesEfectivos, avisos,
  };
}

// ---------------------------------------------------------------------------
// Generación del paquete
// ---------------------------------------------------------------------------

export interface OpcionesPaqueteAsesor {
  /** ISO explícito obligatorio (reproducibilidad; sin reloj implícito). */
  generatedAt: string;
  generatedBy?: string | null;
}

export function generarPaqueteAsesor(
  entrada: EntradaPaqueteAsesor,
  solicitado: SolicitudPaqueteAsesor,
  autorizado: AmbitoAutorizado,
  opciones: OpcionesPaqueteAsesor,
): PaqueteAsesorGenerado {
  if (!opciones.generatedAt || typeof opciones.generatedAt !== 'string') {
    throw new Error('paquete del asesor: generatedAt explícito obligatorio');
  }
  const veredicto = validarAmbitoPaquete(solicitado, autorizado, entrada.inmuebles);
  if (!veredicto.ok) throw new Error(`paquete denegado: ${veredicto.error}`);

  const props = new Set(veredicto.propietariosEfectivos);
  const inms = veredicto.inmueblesEfectivos ? new Set(veredicto.inmueblesEfectivos) : null;
  const ejercicios = veredicto.ejerciciosEfectivos; // null = sin filtro anual
  const meses = veredicto.mesesEfectivos; // null = sin filtro mensual
  const hayFiltroTemporal = ejercicios !== null || meses !== null;
  const enEjercicios = (anio: number | null): boolean =>
    ejercicios === null || (anio !== null && ejercicios.includes(anio));
  const enMeses = (mes: string | null): boolean =>
    meses === null || (mes !== null && meses.includes(mes));

  const incidencias: IncidenciaPaqueteAsesor[] = [];
  const incidencia = (i: IncidenciaPaqueteAsesor) => { incidencias.push(i); };

  const titularesDeFicha = (f: { propietarioId?: unknown; propietarioPrincipalId?: unknown }): string[] =>
    [...new Set([f.propietarioId, f.propietarioPrincipalId]
      .filter((t): t is string => typeof t === 'string' && t.trim() !== ''))];
  const titularDeInmueble = new Map<string, string | null>();
  const titularesPorInmueble = new Map<string, Set<string>>();
  for (const inm of ordenarPorId(entrada.inmuebles)) {
    const titulares = titularesDeFicha(inm);
    // Mapa singular (compatibilidad): primer titular en orden canónico.
    if (!titularDeInmueble.has(texto(inm.id))) {
      titularDeInmueble.set(texto(inm.id), titulares[0] ?? null);
    }
    const conjunto = titularesPorInmueble.get(texto(inm.id)) ?? new Set<string>();
    for (const t of titulares) conjunto.add(t);
    titularesPorInmueble.set(texto(inm.id), conjunto);
  }
  /** true si el inmueble es conocido y NINGÚN titular acreditado es `propietarioId`. */
  const inmuebleDeOtroPropietario = (inmuebleId: unknown, propietarioId: unknown): boolean => {
    if (typeof inmuebleId !== 'string' || inmuebleId === '') return false;
    const titulares = titularesPorInmueble.get(inmuebleId);
    return titulares !== undefined && titulares.size > 0
      && !(typeof propietarioId === 'string' && titulares.has(propietarioId));
  };
  const inmuebleEnAmbito = (inmuebleId: unknown): boolean =>
    inms === null || (typeof inmuebleId === 'string' && inms.has(inmuebleId));
  /** Único titular acreditado del inmueble que está en el ámbito; null si 0 o varios. */
  const titularUnicoEnAmbito = (inmuebleId: unknown): string | null => {
    if (typeof inmuebleId !== 'string') return null;
    const enAmbito = [...(titularesPorInmueble.get(inmuebleId) ?? [])]
      .filter((t) => props.has(t));
    return enAmbito.length === 1 ? enAmbito[0] : null;
  };
  const idValido = (id: unknown): boolean => typeof id === 'string' && id.trim() !== '';

  // -- Inmuebles (contexto del paquete) -------------------------------------
  const inmueblesIncluidos = ordenarPorId(entrada.inmuebles.filter((inm) => {
    const titularesPropios = titularesDeFicha(inm);
    if (!idValido(inm.id)) {
      if (titularesPropios.some((t) => props.has(t))) {
        incidencia({
          codigo: 'INMUEBLE_SIN_ID', severidad: 'CRITICA',
          descripcion: 'Inmueble sin identificador: excluido del paquete (no es referenciable)',
          entidad: 'inmueble',
        });
      }
      return false;
    }
    // La fila se juzga por SUS titulares, nunca por los de otra fila con el
    // mismo id (un id repetido entre propietarios no arrastra la fila ajena).
    return titularesPropios.some((t) => props.has(t)) && inmuebleEnAmbito(inm.id);
  }));
  for (const grupo of gruposDuplicadosPorId(entrada.inmuebles.filter((i) => inmuebleEnAmbito(i.id)))) {
    if (inmueblesIncluidos.some((i) => texto(i.id) === grupo.id)) {
      incidencia({
        codigo: 'INMUEBLE_DUPLICADO', severidad: 'CRITICA',
        descripcion: `El inmueble ${grupo.id} aparece ${grupo.elementos.length} veces en la entrada: solo entran las filas cuyos titulares están en el ámbito; la ambigüedad queda identificada`,
        entidad: 'inmueble', id: grupo.id,
      });
    }
  }
  // Direcciones SOLO de inmuebles incluidos (jamás del catálogo completo:
  // una referencia cruzada no debe filtrar la dirección de otro propietario).
  // Si un mismo id incluido trae direcciones distintas, no se elige una.
  const direccionDeInmueble = new Map<string, string>();
  for (const inm of inmueblesIncluidos) {
    const previa = direccionDeInmueble.get(inm.id);
    const actual = inm.direccion ?? '';
    direccionDeInmueble.set(inm.id, previa !== undefined && previa !== actual ? '' : actual);
  }

  // -- Contratos vigentes en el ejercicio (novedad §4.3.3) ------------------
  const contratosAmbito: ContratoFormalizacion[] = [];
  /** Propietario efectivo acreditado por contrato (para cruzar con sus cobros). */
  const propietarioDeContrato = new Map<string, string>();
  for (const c of ordenarPorId(entrada.contratos)) {
    const pid = c.propietarioId ?? titularUnicoEnAmbito(c.inmuebleId)
      ?? titularDeInmueble.get(c.inmuebleId) ?? null;
    if (!idValido(c.id) && pid !== null && props.has(pid)) {
      incidencia({
        codigo: 'CONTRATO_SIN_ID', severidad: 'CRITICA',
        descripcion: 'Contrato sin identificador: excluido del paquete (no es referenciable por sus cobros)',
        entidad: 'contrato',
      });
      continue;
    }
    if (pid !== null && props.has(pid) && inmuebleDeOtroPropietario(c.inmuebleId, pid)) {
      incidencia({
        codigo: 'CONTRATO_INMUEBLE_PROPIETARIO_DISTINTO', severidad: 'CRITICA',
        descripcion: `Contrato ${c.id} atribuido a ${pid} sobre el inmueble ${texto(c.inmuebleId)}, que acredita otro titular: excluido (ambigüedad de propietario)`,
        entidad: 'contrato', id: c.id,
      });
      continue;
    }
    if (!pid || !props.has(pid)) {
      if (pid === null) {
        incidencia({
          codigo: 'CONTRATO_SIN_AMBITO', severidad: 'AVISO',
          descripcion: `Contrato ${c.id} sin propietario acreditable (ni propio ni del inmueble): excluido`,
          entidad: 'contrato', id: c.id,
        });
      }
      continue;
    }
    if (!inmuebleEnAmbito(c.inmuebleId)) continue;
    contratosAmbito.push(c);
    propietarioDeContrato.set(c.id, pid);
  }
  for (const grupo of gruposDuplicadosPorId(contratosAmbito)) {
    incidencia({
      codigo: 'CONTRATO_DUPLICADO', severidad: 'CRITICA',
      descripcion: `El contrato ${grupo.id} aparece ${grupo.elementos.length} veces en el ámbito: sus cobros quedan sujetos a las reglas de duplicado de movimientos; la ambigüedad queda identificada`,
      entidad: 'contrato', id: grupo.id,
    });
  }
  const contratosIncluidos: ContratoFormalizacion[] = [];
  for (const c of contratosAmbito) {
    if (hayFiltroTemporal) {
      if (!esFechaIsoValida(c.fechaInicioContrato)) {
        incidencia({
          codigo: 'CONTRATO_SIN_FECHA_INICIO', severidad: 'CRITICA',
          descripcion: `Contrato ${c.id} sin fechaInicioContrato válida: no se puede acreditar vigencia; excluido de contratos.csv (sus cobros se filtran por su propio año/mes)`,
          entidad: 'contrato', id: c.id,
        });
        continue;
      }
      const fin = c.fechaFinContrato;
      if (fin !== undefined && fin !== null && fin !== '' && !esFechaIsoValida(fin)) {
        incidencia({
          codigo: 'CONTRATO_FECHA_INVALIDA', severidad: 'CRITICA',
          descripcion: `Contrato ${c.id} con fechaFinContrato ilegible (${texto(fin)}): excluido de contratos.csv`,
          entidad: 'contrato', id: c.id,
        });
        continue;
      }
      if (ejercicios !== null && !contratoVigenteEnEjercicios(c, ejercicios)) continue;
      if (meses !== null && !contratoVigenteEnMeses(c, meses)) continue;
    }
    contratosIncluidos.push(c);
  }
  const nombreInquilinoPorContrato = new Map(
    contratosAmbito.map((c) => [c.id, c.candidatoNombre ?? '']),
  );

  // -- Cobros (aplanados; filtrados por su propio año y mes contables) -------
  const cobrosIncluidos: CobroPeriodo[] = [];
  for (const c of contratosAmbito) {
    const pidContrato = propietarioDeContrato.get(c.id);
    for (const cobro of ordenarPorId(c.registroCobros ?? [])) {
      if (!props.has(cobro.propietarioId)) continue;
      if (!idValido(cobro.id)) {
        incidencia({
          codigo: 'COBRO_SIN_ID', severidad: 'CRITICA',
          descripcion: `Cobro sin identificador en el contrato ${c.id}: excluido (no es referenciable)`,
          entidad: 'cobro',
        });
        continue;
      }
      if (!inmuebleEnAmbito(cobro.inmuebleId)) continue;
      // Consistencia contrato↔cobro: una discrepancia no se silencia ni se
      // atribuye al ámbito equivocado; el cobro queda fuera e identificado.
      if (pidContrato !== undefined && cobro.propietarioId !== pidContrato) {
        incidencia({
          codigo: 'COBRO_PROPIETARIO_DISTINTO_CONTRATO', severidad: 'CRITICA',
          descripcion: `Cobro ${cobro.id} declara propietario ${texto(cobro.propietarioId)} pero su contrato ${c.id} acredita ${pidContrato}: excluido`,
          entidad: 'cobro', id: cobro.id,
        });
        continue;
      }
      if (texto(cobro.inmuebleId) !== '' && texto(c.inmuebleId) !== ''
        && cobro.inmuebleId !== c.inmuebleId) {
        incidencia({
          codigo: 'COBRO_INMUEBLE_DISTINTO_CONTRATO', severidad: 'CRITICA',
          descripcion: `Cobro ${cobro.id} declara inmueble ${texto(cobro.inmuebleId)} pero está anidado en el contrato ${c.id} del inmueble ${texto(c.inmuebleId)}: excluido`,
          entidad: 'cobro', id: cobro.id,
        });
        continue;
      }
      if (!enEjercicios(typeof cobro.anio === 'number' ? cobro.anio : null)) continue;
      if (meses !== null) {
        const mes = mesDeCobro(cobro);
        if (mes === null) {
          incidencia({
            codigo: 'COBRO_SIN_MES', severidad: 'AVISO',
            descripcion: `Cobro ${cobro.id} sin periodoMesAnio válido ni anio/mes legibles: excluido del paquete por meses`,
            entidad: 'cobro', id: cobro.id,
          });
          continue;
        }
        // periodoMesAnio manda; si contradice anio+mes, no se adivina cuál vale.
        if (esMesValido(cobro.periodoMesAnio)
          && typeof cobro.anio === 'number' && typeof cobro.mes === 'number'
          && esMesValido(`${cobro.anio}-${String(cobro.mes).padStart(2, '0')}`)
          && cobro.periodoMesAnio !== `${cobro.anio}-${String(cobro.mes).padStart(2, '0')}`) {
          incidencia({
            codigo: 'COBRO_PERIODO_INCONSISTENTE', severidad: 'CRITICA',
            descripcion: `Cobro ${cobro.id} con periodoMesAnio ${cobro.periodoMesAnio} contradictorio con anio/mes ${cobro.anio}/${cobro.mes}: excluido del paquete por meses`,
            entidad: 'cobro', id: cobro.id,
          });
          continue;
        }
        if (!enMeses(mes)) continue;
      }
      cobrosIncluidos.push(cobro);
    }
  }
  cobrosIncluidos.sort(compararPorIdYContenido);

  // -- Gastos ----------------------------------------------------------------
  const gastosIncluidos: Gasto[] = [];
  for (const g of ordenarPorId(entrada.gastos)) {
    if (!props.has(g.propietarioId)) continue;
    if (!idValido(g.id)) {
      incidencia({
        codigo: 'GASTO_SIN_ID', severidad: 'CRITICA',
        descripcion: 'Gasto sin identificador: excluido del paquete y del libro (no es referenciable)',
        entidad: 'gasto',
      });
      continue;
    }
    if (!inmuebleEnAmbito(g.inmuebleId)) continue;
    if (inmuebleDeOtroPropietario(g.inmuebleId, g.propietarioId)) {
      incidencia({
        codigo: 'GASTO_INMUEBLE_PROPIETARIO_DISTINTO', severidad: 'CRITICA',
        descripcion: `Gasto ${g.id} de ${texto(g.propietarioId)} asignado al inmueble ${texto(g.inmuebleId)}, que acredita otro titular: excluido`,
        entidad: 'gasto', id: g.id,
      });
      continue;
    }
    if (ejercicios !== null) {
      const ej = ejercicioDeGasto(g);
      if (ej === null) {
        incidencia({
          codigo: 'GASTO_SIN_EJERCICIO', severidad: 'AVISO',
          descripcion: `Gasto ${g.id} sin ejercicioFiscal ni fecha legible: excluido del paquete por ejercicios`,
          entidad: 'gasto', id: g.id,
        });
        continue;
      }
      if (!ejercicios.includes(ej)) continue;
    }
    if (meses !== null) {
      const mes = mesDeGasto(g);
      if (mes === null) {
        incidencia({
          codigo: 'GASTO_SIN_MES', severidad: 'AVISO',
          descripcion: `Gasto ${g.id} sin periodoMesAnio válido ni fecha legible: excluido del paquete por meses`,
          entidad: 'gasto', id: g.id,
        });
        continue;
      }
      if (!enMeses(mes)) continue;
    }
    gastosIncluidos.push(g);
  }

  // -- Facturas (documentación de contraste; nunca segunda línea del libro) -
  const incluirFacturas = solicitado.incluirFacturas !== false;
  const facturasEntrada = incluirFacturas ? (entrada.facturas ?? []) : [];
  if (incluirFacturas && entrada.facturas === undefined) {
    incidencia({
      codigo: 'FACTURAS_NO_APORTADAS', severidad: 'AVISO',
      descripcion: 'El llamante no aportó facturas: facturas.csv viaja vacío y el libro queda sin desglose base/IVA',
      entidad: 'factura',
    });
  }
  const facturasIncluidas: { factura: (typeof facturasEntrada)[number]; ejercicio: number }[] = [];
  for (const f of ordenarPorId(facturasEntrada)) {
    if (!props.has(f.propietarioId)) continue;
    if (!idValido(f.id)) {
      incidencia({
        codigo: 'FACTURA_SIN_ID', severidad: 'CRITICA',
        descripcion: 'Factura sin identificador: excluida del paquete (ningún gasto puede vincularla)',
        entidad: 'factura',
      });
      continue;
    }
    if (inmuebleDeOtroPropietario(f.inmuebleId, f.propietarioId)) {
      incidencia({
        codigo: 'FACTURA_INMUEBLE_PROPIETARIO_DISTINTO', severidad: 'CRITICA',
        descripcion: `Factura ${f.id} de ${texto(f.propietarioId)} asignada al inmueble ${texto(f.inmuebleId)}, que acredita otro titular: excluida`,
        entidad: 'factura', id: f.id,
      });
      continue;
    }
    if (f.inmuebleId !== undefined && f.inmuebleId !== null && f.inmuebleId !== ''
      && !inmuebleEnAmbito(f.inmuebleId)) continue;
    if ((f.inmuebleId === undefined || f.inmuebleId === null || f.inmuebleId === '') && inms !== null) {
      continue; // con filtro de inmuebles, lo no atribuible no entra (fail-closed)
    }
    const ej = ejercicioDeFactura(f);
    if (ej === null) {
      incidencia({
        codigo: 'FACTURA_SIN_EJERCICIO', severidad: 'AVISO',
        descripcion: `Factura ${f.id} sin ejercicio ni fecha de expedición legible: excluida`,
        entidad: 'factura', id: f.id,
      });
      continue;
    }
    if (!enEjercicios(ej)) continue;
    if (meses !== null) {
      const mes = mesDeFactura(f);
      if (mes === null) {
        incidencia({
          codigo: 'FACTURA_SIN_MES', severidad: 'AVISO',
          descripcion: `Factura ${f.id} sin fecha de expedición legible para atribuirle un mes: excluida del paquete por meses`,
          entidad: 'factura', id: f.id,
        });
        continue;
      }
      if (!enMeses(mes)) continue;
    }
    facturasIncluidas.push({ factura: f, ejercicio: ej });
  }
  const facturaPorId = new Map(facturasIncluidas.map(({ factura }) => [factura.id, factura]));

  // Discrepancia fiscal interna de cada factura incluida (se identifica, no
  // se corrige): fórmula del propio motor de facturación del ERP
  // (`importeTotal = baseImponible + cuotaIva - cuotaRetencion`, a céntimos).
  const facturasDesgloseInconsistente = new Set<string>();
  for (const { factura: f } of facturasIncluidas) {
    const base = f.baseImponible;
    const iva = f.cuotaIva;
    const total = f.importeTotal;
    if (typeof base === 'number' && Number.isFinite(base)
      && typeof iva === 'number' && Number.isFinite(iva)
      && typeof total === 'number' && Number.isFinite(total)) {
      const retencion = typeof f.cuotaRetencion === 'number' && Number.isFinite(f.cuotaRetencion)
        ? f.cuotaRetencion : 0;
      const esperado = redondear2(base + iva - retencion);
      if (esperado !== redondear2(total)) {
        facturasDesgloseInconsistente.add(f.id);
        incidencia({
          codigo: 'FACTURA_DESGLOSE_NO_COINCIDE', severidad: 'AVISO',
          descripcion: `Factura ${f.id}: base ${base} + IVA ${iva} - retención ${retencion} = ${esperado}, pero importeTotal declara ${total}: se conserva tal cual y su desglose no alimenta el libro`,
          entidad: 'factura', id: f.id,
        });
      }
    }
  }
  for (const grupo of gruposDuplicadosPorId(facturasIncluidas.map(({ factura }) => factura))) {
    facturasDesgloseInconsistente.add(grupo.id);
    incidencia({
      codigo: 'FACTURA_DUPLICADA', severidad: 'CRITICA',
      descripcion: `La factura ${grupo.id} aparece ${grupo.elementos.length} veces en la entrada: datos/facturas.csv las conserva todas y ningún gasto usa su desglose (vínculo ambiguo)`,
      entidad: 'factura', id: grupo.id,
    });
  }

  // -- Liquidaciones (agregaciones; contraste, no libro) --------------------
  const incluirLiquidaciones = solicitado.incluirLiquidaciones !== false;
  const liquidacionesIncluidas = ordenarPorId(
    incluirLiquidaciones ? (entrada.liquidaciones ?? []) : [],
  ).filter((liq) => {
    if (!props.has(liq.propietarioId)) return false;
    if (!idValido(liq.id)) {
      incidencia({
        codigo: 'LIQUIDACION_SIN_ID', severidad: 'CRITICA',
        descripcion: 'Liquidación sin identificador: excluida del paquete (no es referenciable)',
        entidad: 'liquidacion',
      });
      return false;
    }
    const cruzado = (liq.inmuebleIds ?? []).find(
      (id) => inmuebleDeOtroPropietario(id, liq.propietarioId),
    );
    if (cruzado !== undefined) {
      incidencia({
        codigo: 'LIQUIDACION_INMUEBLE_PROPIETARIO_DISTINTO', severidad: 'CRITICA',
        descripcion: `Liquidación ${liq.id} de ${texto(liq.propietarioId)} incluye el inmueble ${texto(cruzado)}, que acredita otro titular: excluida como agregación`,
        entidad: 'liquidacion', id: liq.id,
      });
      return false;
    }
    if (!enEjercicios(typeof liq.anio === 'number' ? liq.anio : null)) return false;
    if (meses !== null) {
      const mes = mesDeLiquidacion(liq);
      if (mes === null) {
        incidencia({
          codigo: 'LIQUIDACION_SIN_MES', severidad: 'AVISO',
          descripcion: `Liquidación ${liq.id} sin periodo 'YYYY-MM' ni anio/mes legibles: excluida del paquete por meses`,
          entidad: 'liquidacion', id: liq.id,
        });
        return false;
      }
      if (!enMeses(mes)) return false;
    }
    if (inms !== null && !(liq.inmuebleIds ?? []).some((id) => inms.has(id))) return false;
    return true;
  });

  // -- Pólizas vigentes en el periodo (si procede) ---------------------------
  const incluirPolizas = solicitado.incluirPolizas !== false;
  const polizasIncluidas = ordenarPorId(
    incluirPolizas ? (entrada.polizas ?? []) : [],
  ).filter((p) => {
    if (!props.has(p.propietarioId)) return false;
    if (!idValido(p.id)) {
      incidencia({
        codigo: 'POLIZA_SIN_ID', severidad: 'CRITICA',
        descripcion: 'Póliza sin identificador: excluida del paquete (no es referenciable)',
        entidad: 'poliza',
      });
      return false;
    }
    if (inmuebleDeOtroPropietario(p.inmuebleId, p.propietarioId)) {
      incidencia({
        codigo: 'POLIZA_INMUEBLE_PROPIETARIO_DISTINTO', severidad: 'CRITICA',
        descripcion: `Póliza ${p.id} de ${texto(p.propietarioId)} asignada al inmueble ${texto(p.inmuebleId)}, que acredita otro titular: excluida`,
        entidad: 'poliza', id: p.id,
      });
      return false;
    }
    if (p.inmuebleId && !inmuebleEnAmbito(p.inmuebleId)) return false;
    if (!p.inmuebleId && inms !== null) return false;
    if (!hayFiltroTemporal) return true;
    if (!esFechaIsoValida(p.fechaInicio) || !esFechaIsoValida(p.fechaVencimiento)) {
      incidencia({
        codigo: 'POLIZA_FECHA_INVALIDA', severidad: 'AVISO',
        descripcion: `Póliza ${p.id} con vigencia ilegible: excluida del paquete por filtro temporal`,
        entidad: 'poliza', id: p.id,
      });
      return false;
    }
    if (ejercicios !== null && !solapaEjercicios(p.fechaInicio, p.fechaVencimiento, ejercicios)) return false;
    if (meses !== null && !solapaMeses(p.fechaInicio, p.fechaVencimiento, meses)) return false;
    return true;
  });

  for (const grupo of gruposDuplicadosPorId(liquidacionesIncluidas)) {
    incidencia({
      codigo: 'LIQUIDACION_DUPLICADA', severidad: 'CRITICA',
      descripcion: `La liquidación ${grupo.id} aparece ${grupo.elementos.length} veces: datos/liquidaciones.csv las conserva todas y el neto informativo suma las filas tal cual; la duplicidad queda identificada`,
      entidad: 'liquidacion', id: grupo.id,
    });
  }
  for (const grupo of gruposDuplicadosPorId(polizasIncluidas)) {
    incidencia({
      codigo: 'POLIZA_DUPLICADA', severidad: 'CRITICA',
      descripcion: `La póliza ${grupo.id} aparece ${grupo.elementos.length} veces en el paquete: se conservan las filas y la duplicidad queda identificada`,
      entidad: 'poliza', id: grupo.id,
    });
  }

  // -- Duplicados de movimientos (se identifican; el libro no dobla) ---------
  // datos/*.csv conserva TODAS las filas fuente. En el libro:
  //  · réplicas exactas del mismo id computan UNA vez (réplica = mismo
  //    movimiento leído dos veces; contarlo dos veces falsearía el total);
  //  · mismo id con datos distintos = conflicto irresoluble: no computa
  //    ninguna copia (no se elige una «verdadera» en silencio);
  //  · posibles duplicados de negocio con ids distintos se conservan y se
  //    señalan (precedente DUP_ORIGEN del expediente B6).
  // La huella de «réplica exacta» cubre TODO campo que alimenta el CSV o el
  // libro: si difiere la contraparte, la deducibilidad, el proveedor o el
  // documento, no son la misma operación y el id es conflictivo.
  const huellaCobro = (c: CobroPeriodo): string => jsonEstable({
    contratoId: c.contratoId, inmuebleId: c.inmuebleId, propietarioId: c.propietarioId,
    inquilinoId: c.inquilinoId ?? null, inquilinoNombre: c.inquilinoNombre ?? null,
    inmuebleDireccion: c.inmuebleDireccion ?? null,
    anio: c.anio, mes: c.mes, periodoMesAnio: c.periodoMesAnio, nombreMes: c.nombreMes,
    importePrevisto: c.importePrevisto, importeRecibido: c.importeRecibido,
    estado: c.estado, fechaPago: c.fechaPago ?? null, fechaVencimiento: c.fechaVencimiento,
    metodoPago: c.metodoPago ?? null, observaciones: c.observaciones ?? null,
    documentoNombre: c.justificante?.nombreArchivo ?? null,
  });
  const huellaGasto = (g: Gasto): string => jsonEstable({
    inmuebleId: g.inmuebleId, propietarioId: g.propietarioId, contratoId: g.contratoId ?? null,
    tipo: g.tipo, proveedor: g.proveedor ?? null, aCargoDe: g.aCargoDe,
    importe: g.importe, estado: g.estado, categoria: g.categoria, concepto: g.concepto,
    fechaDevengo: g.fechaDevengo ?? null, fechaPago: g.fechaPago ?? null, fecha: g.fecha ?? null,
    ejercicioFiscal: g.ejercicioFiscal ?? null, periodoMesAnio: g.periodoMesAnio ?? null,
    deducible: g.deducible ?? null, esDeducible: g.esDeducible ?? null,
    tipoDeducible: g.tipoDeducible ?? null, metodoPago: g.metodoPago ?? null,
    inmuebleDireccion: g.inmuebleDireccion ?? null,
    facturaId: g.facturaId ?? null, origen: g.origen ?? null, origenId: g.origenId ?? null,
    documentoNombre: g.documento?.nombre ?? null,
    documentosNombres: (g.documentos ?? []).map((d) => d?.nombre ?? null),
  });
  const cobrosDuplicadosExactos = new Set<string>();
  const cobrosIdConflictivo = new Set<string>();
  for (const grupo of gruposDuplicadosPorId(cobrosIncluidos)) {
    const exactos = new Set(grupo.elementos.map(huellaCobro)).size === 1;
    if (exactos) {
      cobrosDuplicadosExactos.add(grupo.id);
      incidencia({
        codigo: 'COBRO_DUPLICADO_EXACTO', severidad: 'CRITICA',
        descripcion: `Cobro ${grupo.id} aparece ${grupo.elementos.length} veces idéntico: datos/cobros.csv conserva todas y el libro computa solo una`,
        entidad: 'cobro', id: grupo.id,
      });
    } else {
      cobrosIdConflictivo.add(grupo.id);
      incidencia({
        codigo: 'COBRO_ID_CONFLICTIVO', severidad: 'CRITICA',
        descripcion: `Cobro ${grupo.id} aparece ${grupo.elementos.length} veces con datos distintos: ninguna copia computa en el libro (no se elige una en silencio)`,
        entidad: 'cobro', id: grupo.id,
      });
    }
  }
  const gastosDuplicadosExactos = new Set<string>();
  const gastosIdConflictivo = new Set<string>();
  for (const grupo of gruposDuplicadosPorId(gastosIncluidos)) {
    const exactos = new Set(grupo.elementos.map(huellaGasto)).size === 1;
    if (exactos) {
      gastosDuplicadosExactos.add(grupo.id);
      incidencia({
        codigo: 'GASTO_DUPLICADO_EXACTO', severidad: 'CRITICA',
        descripcion: `Gasto ${grupo.id} aparece ${grupo.elementos.length} veces idéntico: datos/gastos.csv conserva todas y el libro computa solo una`,
        entidad: 'gasto', id: grupo.id,
      });
    } else {
      gastosIdConflictivo.add(grupo.id);
      incidencia({
        codigo: 'GASTO_ID_CONFLICTIVO', severidad: 'CRITICA',
        descripcion: `Gasto ${grupo.id} aparece ${grupo.elementos.length} veces con datos distintos: ninguna copia computa en el libro (no se elige una en silencio)`,
        entidad: 'gasto', id: grupo.id,
      });
    }
  }
  // Posibles duplicados de negocio (ids distintos): se conservan y se señalan.
  const cobrosPorPeriodo = new Map<string, string[]>();
  for (const c of cobrosIncluidos) {
    if (cobrosIdConflictivo.has(c.id)) continue;
    const mes = mesDeCobro(c);
    if (mes === null) continue;
    const clave = `${c.contratoId}|${mes}`;
    const ids = cobrosPorPeriodo.get(clave) ?? [];
    if (!ids.includes(c.id)) ids.push(c.id);
    cobrosPorPeriodo.set(clave, ids);
  }
  for (const [clave, ids] of [...cobrosPorPeriodo.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ids.length > 1) {
      incidencia({
        codigo: 'COBRO_PERIODO_DUPLICADO', severidad: 'AVISO',
        descripcion: `Cobros distintos comparten contrato y periodo (${clave}): ${ids.join(', ')}; se conservan todos para revisión humana`,
        entidad: 'cobro', id: ids[ids.length - 1],
      });
    }
  }
  const gastosPorOrigen = new Map<string, string[]>();
  for (const g of gastosIncluidos) {
    if (gastosIdConflictivo.has(g.id)) continue;
    if (!g.origenId) continue;
    const clave = `${texto(g.origen)}|${g.origenId}|${texto(g.concepto)}|${redondear2(typeof g.importe === 'number' ? g.importe : Number.NaN)}`;
    const ids = gastosPorOrigen.get(clave) ?? [];
    if (!ids.includes(g.id)) ids.push(g.id);
    gastosPorOrigen.set(clave, ids);
  }
  for (const [clave, ids] of [...gastosPorOrigen.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ids.length > 1) {
      incidencia({
        codigo: 'GASTO_POSIBLE_DUPLICADO_ORIGEN', severidad: 'AVISO',
        descripcion: `Gastos distintos comparten origen/concepto/importe (${clave}): ${ids.join(', ')}; se conservan todos para revisión humana`,
        entidad: 'gasto', id: ids[ids.length - 1],
      });
    }
  }

  // -- Libro de ingresos y gastos --------------------------------------------
  const libro: LineaLibroAsesor[] = [];
  let sumaIngresosComputables = 0;
  let sumaGastosComputables = 0;
  let numIngresosComputables = 0;
  let numGastosComputables = 0;

  const cobrosYaComputados = new Set<string>();
  for (const cobro of cobrosIncluidos) {
    if (cobrosIdConflictivo.has(cobro.id)) continue;
    if (cobrosDuplicadosExactos.has(cobro.id)) {
      if (cobrosYaComputados.has(cobro.id)) continue;
      cobrosYaComputados.add(cobro.id);
    }
    // Mismo criterio que el expediente fiscal B6 (precedente del ERP).
    if (cobro.estado === 'ANULADO') continue;
    if (cobro.estado === 'IMPAGADO') {
      incidencia({
        codigo: 'COBRO_IMPAGADO', severidad: 'AVISO',
        descripcion: `Cobro ${cobro.id} IMPAGADO en ${texto(cobro.anio)}: no genera ingreso en el libro`,
        entidad: 'cobro', id: cobro.id,
      });
      continue;
    }
    if (!importeValido(cobro.importeRecibido)) {
      incidencia({
        codigo: 'COBRO_IMPORTE_INVALIDO', severidad: 'CRITICA',
        descripcion: `Cobro ${cobro.id} con importeRecibido inválido: excluido del libro`,
        entidad: 'cobro', id: cobro.id,
      });
      continue;
    }
    if (cobro.importeRecibido <= 0) continue;
    if (!esImporteEnCentimosExactos(cobro.importeRecibido)) {
      incidencia({
        codigo: 'IMPORTE_CON_SUBCENTIMO', severidad: 'AVISO',
        descripcion: `Cobro ${cobro.id} con importeRecibido ${cobro.importeRecibido} no representable en céntimos exactos: se conserva sin redondear en origen, pero el CSV/libro solo expresan céntimos y su cuadre no es plenamente verificable`,
        entidad: 'cobro', id: cobro.id,
      });
    }
    const fecha = esFechaIsoValida(cobro.fechaPago)
      ? cobro.fechaPago
      : esFechaIsoValida(cobro.fechaVencimiento) ? cobro.fechaVencimiento : '';
    if (!fecha) {
      incidencia({
        codigo: 'COBRO_SIN_FECHA', severidad: 'CRITICA',
        descripcion: `Cobro ${cobro.id} cobrado (${cobro.importeRecibido}) sin fechaPago/fechaVencimiento: excluido del libro y del cuadre`,
        entidad: 'cobro', id: cobro.id,
      });
      continue;
    }
    const documentoCobroNombre = cobro.justificante?.nombreArchivo ?? '';
    if (cobro.justificante && !documentoCobroNombre) {
      incidencia({
        codigo: 'DOCUMENTO_SIN_NOMBRE', severidad: 'AVISO',
        descripcion: `Cobro ${cobro.id} referencia un justificante sin nombre de fichero: no hay referencia documental utilizable`,
        entidad: 'cobro', id: cobro.id,
      });
    } else if (documentoCobroNombre) {
      incidencia({
        codigo: 'DOCUMENTO_SIN_BINARIO_VERIFICABLE', severidad: 'AVISO',
        descripcion: `Cobro ${cobro.id} referencia «${documentoCobroNombre}» solo por nombre: el paquete no incluye ni verifica el binario y la referencia no prueba que el original esté disponible`,
        entidad: 'cobro', id: cobro.id,
      });
    }
    libro.push({
      fecha,
      ejercicio: anioDeFechaIso(fecha),
      tipo: 'INGRESO',
      concepto: `Alquiler ${cobro.nombreMes || cobro.periodoMesAnio || ''}`.trim(),
      inmuebleId: cobro.inmuebleId,
      inmuebleDireccion: cobro.inmuebleDireccion || direccionDeInmueble.get(cobro.inmuebleId) || '',
      contraparte: cobro.inquilinoNombre || nombreInquilinoPorContrato.get(cobro.contratoId) || '',
      base: null, iva: null, retencion: null, // el cobro no guarda desglose
      total: cobro.importeRecibido,
      categoria: 'ARRENDAMIENTO',
      deducible: null,
      origenDeducibilidad: '',
      fuenteTipo: 'COBRO',
      fuenteId: cobro.id,
      documentoNombre: documentoCobroNombre,
      desgloseFiscal: 'SIN_DESGLOSE_EN_ORIGEN',
    });
    sumaIngresosComputables += cobro.importeRecibido;
    numIngresosComputables += 1;
  }

  const gastosYaComputados = new Set<string>();
  for (const g of gastosIncluidos) {
    if (gastosIdConflictivo.has(g.id)) continue;
    if (gastosDuplicadosExactos.has(g.id)) {
      if (gastosYaComputados.has(g.id)) continue;
      gastosYaComputados.add(g.id);
    }
    if (g.estado === 'ANULADO') continue;
    if (!importeValido(g.importe)) {
      incidencia({
        codigo: 'GASTO_IMPORTE_INVALIDO', severidad: 'CRITICA',
        descripcion: `Gasto ${g.id} con importe inválido: excluido del libro`,
        entidad: 'gasto', id: g.id,
      });
      continue;
    }
    if (!esImporteEnCentimosExactos(g.importe)) {
      incidencia({
        codigo: 'IMPORTE_CON_SUBCENTIMO', severidad: 'AVISO',
        descripcion: `Gasto ${g.id} con importe ${g.importe} no representable en céntimos exactos: se conserva sin redondear en origen, pero el CSV/libro solo expresan céntimos y su cuadre no es plenamente verificable`,
        entidad: 'gasto', id: g.id,
      });
    }
    const fecha = fechaGasto(g);
    if (!fecha) {
      incidencia({
        codigo: 'GASTO_SIN_FECHA', severidad: 'CRITICA',
        descripcion: `Gasto ${g.id} sin fecha (devengo/pago/alias): excluido del libro y del cuadre`,
        entidad: 'gasto', id: g.id,
      });
      continue;
    }
    const { deducible, origenDecision } = analizarDeducibilidad(g);
    let base: number | null = null;
    let iva: number | null = null;
    let retencion: number | null = null;
    let desgloseFiscal: LineaLibroAsesor['desgloseFiscal'] = 'SIN_DESGLOSE_EN_ORIGEN';
    if (g.facturaId) {
      const factura = facturaPorId.get(g.facturaId);
      if (!factura) {
        incidencia({
          codigo: 'GASTO_FACTURA_NO_EN_PAQUETE', severidad: 'AVISO',
          descripcion: `Gasto ${g.id} referencia la factura ${g.facturaId}, que no está en el paquete (fuera de ámbito/no aportada): sin desglose`,
          entidad: 'gasto', id: g.id,
        });
      } else if (facturasDesgloseInconsistente.has(factura.id)) {
        desgloseFiscal = 'FACTURA_INCONSISTENTE';
        incidencia({
          codigo: 'GASTO_FACTURA_INCONSISTENTE', severidad: 'AVISO',
          descripcion: `Gasto ${g.id} vinculado a la factura ${factura.id}, cuyo desglose ya quedó identificado como inconsistente/duplicado: no alimenta el libro`,
          entidad: 'gasto', id: g.id,
        });
      } else if (factura.propietarioId !== g.propietarioId) {
        desgloseFiscal = 'FACTURA_INCONSISTENTE';
        incidencia({
          codigo: 'GASTO_FACTURA_PROPIETARIO_DISTINTO', severidad: 'CRITICA',
          descripcion: `Gasto ${g.id} (propietario ${g.propietarioId}) vinculado a la factura ${factura.id} de ${texto(factura.propietarioId)}: sin desglose`,
          entidad: 'gasto', id: g.id,
        });
      } else if (factura.inmuebleId !== undefined && factura.inmuebleId !== null && factura.inmuebleId !== ''
        && factura.inmuebleId !== g.inmuebleId) {
        desgloseFiscal = 'FACTURA_INCONSISTENTE';
        incidencia({
          codigo: 'GASTO_FACTURA_INMUEBLE_DISTINTO', severidad: 'CRITICA',
          descripcion: `Gasto ${g.id} (inmueble ${texto(g.inmuebleId)}) vinculado a la factura ${factura.id} del inmueble ${factura.inmuebleId}: sin desglose`,
          entidad: 'gasto', id: g.id,
        });
      } else if (factura.gastoId !== undefined && factura.gastoId !== null && factura.gastoId !== ''
        && factura.gastoId !== g.id) {
        desgloseFiscal = 'FACTURA_INCONSISTENTE';
        incidencia({
          codigo: 'GASTO_FACTURA_VINCULO_CRUZADO', severidad: 'CRITICA',
          descripcion: `Gasto ${g.id} reclama la factura ${factura.id}, pero esta declara pertenecer al gasto ${factura.gastoId}: sin desglose`,
          entidad: 'gasto', id: g.id,
        });
      } else if (factura.estado === 'ANULADA' || factura.estado === 'BORRADOR') {
        desgloseFiscal = 'FACTURA_INCONSISTENTE';
        incidencia({
          codigo: 'GASTO_FACTURA_ESTADO_NO_FINAL', severidad: 'AVISO',
          descripcion: `Gasto ${g.id} vinculado a la factura ${factura.id} en estado ${factura.estado}: no aporta desglose fiscal`,
          entidad: 'gasto', id: g.id,
        });
      } else {
        const baseFinita = typeof factura.baseImponible === 'number' && Number.isFinite(factura.baseImponible);
        const ivaFinita = typeof factura.cuotaIva === 'number' && Number.isFinite(factura.cuotaIva);
        const retencionFinita = factura.cuotaRetencion === undefined
          || (typeof factura.cuotaRetencion === 'number' && Number.isFinite(factura.cuotaRetencion));
        if (!baseFinita || !ivaFinita || !retencionFinita) {
          desgloseFiscal = 'FACTURA_INCONSISTENTE';
          incidencia({
            codigo: 'GASTO_FACTURA_DESGLOSE_INVALIDO', severidad: 'AVISO',
            descripcion: `Gasto ${g.id} vinculado a la factura ${factura.id} con base/IVA/retención no finitos: sin desglose`,
            entidad: 'gasto', id: g.id,
          });
        } else {
          base = factura.baseImponible;
          iva = factura.cuotaIva;
          retencion = typeof factura.cuotaRetencion === 'number' ? factura.cuotaRetencion : null;
          desgloseFiscal = 'FACTURA_VINCULADA';
          if (typeof factura.importeTotal === 'number' && Number.isFinite(factura.importeTotal)
            && redondear2(factura.importeTotal) !== redondear2(g.importe)) {
            incidencia({
              codigo: 'GASTO_FACTURA_IMPORTE_NO_COINCIDE', severidad: 'AVISO',
              descripcion: `Gasto ${g.id} (${g.importe}) no coincide con su factura ${factura.id} (${factura.importeTotal}): se conservan ambos importes, sin corregir ninguno`,
              entidad: 'gasto', id: g.id,
            });
          }
        }
      }
    }
    const docRef = g.documento || (g.documentos && g.documentos[0]);
    const documentoGastoNombre = docRef?.nombre ?? '';
    if (docRef && !documentoGastoNombre) {
      incidencia({
        codigo: 'DOCUMENTO_SIN_NOMBRE', severidad: 'AVISO',
        descripcion: `Gasto ${g.id} referencia un documento sin nombre de fichero: no hay referencia documental utilizable`,
        entidad: 'gasto', id: g.id,
      });
    } else if (documentoGastoNombre) {
      incidencia({
        codigo: 'DOCUMENTO_SIN_BINARIO_VERIFICABLE', severidad: 'AVISO',
        descripcion: `Gasto ${g.id} referencia «${documentoGastoNombre}» solo por nombre (sin URL: la ruta interna no viaja): el paquete no incluye ni verifica el binario y la referencia no prueba que el original esté disponible`,
        entidad: 'gasto', id: g.id,
      });
    }
    libro.push({
      fecha,
      ejercicio: anioDeFechaIso(fecha),
      tipo: 'GASTO',
      concepto: g.concepto ?? '',
      inmuebleId: g.inmuebleId,
      inmuebleDireccion: g.inmuebleDireccion || direccionDeInmueble.get(g.inmuebleId) || '',
      contraparte: g.proveedor ?? '',
      base, iva, retencion,
      total: g.importe,
      categoria: texto(g.categoria),
      deducible,
      origenDeducibilidad: origenDecision,
      fuenteTipo: 'GASTO',
      fuenteId: g.id,
      documentoNombre: documentoGastoNombre,
      desgloseFiscal,
    });
    sumaGastosComputables += g.importe;
    numGastosComputables += 1;
  }

  libro.sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
    || a.tipo.localeCompare(b.tipo)
    || a.fuenteId.localeCompare(b.fuenteId));

  // -- Totales y cuadre --------------------------------------------------------
  const porEjercicioMapa = new Map<number, TotalesEjercicioAsesor>();
  const filaEjercicio = (ej: number): TotalesEjercicioAsesor => {
    const existente = porEjercicioMapa.get(ej);
    if (existente) return existente;
    const nueva: TotalesEjercicioAsesor = {
      ejercicio: ej, numIngresos: 0, numGastos: 0,
      totalIngresos: 0, totalGastos: 0,
      totalGastosDeducibles: 0, totalGastosNoDeducibles: 0, resultado: 0,
    };
    porEjercicioMapa.set(ej, nueva);
    return nueva;
  };
  for (const linea of libro) {
    const f = filaEjercicio(linea.ejercicio);
    if (linea.tipo === 'INGRESO') {
      f.numIngresos += 1; f.totalIngresos += linea.total;
    } else {
      f.numGastos += 1; f.totalGastos += linea.total;
      if (linea.deducible === true) f.totalGastosDeducibles += linea.total;
      else f.totalGastosNoDeducibles += linea.total;
    }
  }
  const porEjercicio = [...porEjercicioMapa.values()]
    .sort((a, b) => a.ejercicio - b.ejercicio)
    .map((f) => ({
      ...f,
      totalIngresos: redondear2(f.totalIngresos),
      totalGastos: redondear2(f.totalGastos),
      totalGastosDeducibles: redondear2(f.totalGastosDeducibles),
      totalGastosNoDeducibles: redondear2(f.totalGastosNoDeducibles),
      resultado: redondear2(f.totalIngresos - f.totalGastos),
    }));
  const porMesMapa = new Map<string, TotalesMesAsesor>();
  const filaMes = (mes: string): TotalesMesAsesor => {
    const existente = porMesMapa.get(mes);
    if (existente) return existente;
    const nueva: TotalesMesAsesor = {
      mes, numIngresos: 0, numGastos: 0,
      totalIngresos: 0, totalGastos: 0,
      totalGastosDeducibles: 0, totalGastosNoDeducibles: 0, resultado: 0,
    };
    porMesMapa.set(mes, nueva);
    return nueva;
  };
  for (const linea of libro) {
    // El mes de la línea es el de su FECHA en el libro (devengo/pago según la
    // regla de construcción), no una re-derivación distinta: verificable.
    const f = filaMes(linea.fecha.slice(0, 7));
    if (linea.tipo === 'INGRESO') {
      f.numIngresos += 1; f.totalIngresos += linea.total;
    } else {
      f.numGastos += 1; f.totalGastos += linea.total;
      if (linea.deducible === true) f.totalGastosDeducibles += linea.total;
      else f.totalGastosNoDeducibles += linea.total;
    }
  }
  const porMes = [...porMesMapa.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((f) => ({
      ...f,
      totalIngresos: redondear2(f.totalIngresos),
      totalGastos: redondear2(f.totalGastos),
      totalGastosDeducibles: redondear2(f.totalGastosDeducibles),
      totalGastosNoDeducibles: redondear2(f.totalGastosNoDeducibles),
      resultado: redondear2(f.totalIngresos - f.totalGastos),
    }));
  const totalIngresos = redondear2(libro.filter((l) => l.tipo === 'INGRESO').reduce((s, l) => s + l.total, 0));
  const totalGastos = redondear2(libro.filter((l) => l.tipo === 'GASTO').reduce((s, l) => s + l.total, 0));
  const totales: TotalesPaqueteAsesor = {
    totalIngresos,
    totalGastos,
    totalGastosDeducibles: redondear2(libro.filter((l) => l.tipo === 'GASTO' && l.deducible === true).reduce((s, l) => s + l.total, 0)),
    totalGastosNoDeducibles: redondear2(libro.filter((l) => l.tipo === 'GASTO' && l.deducible !== true).reduce((s, l) => s + l.total, 0)),
    resultado: redondear2(totalIngresos - totalGastos),
    porEjercicio,
    porMes,
    totalNetoLiquidacionesIncluidas: redondear2(
      liquidacionesIncluidas.reduce((s, l) => s + (typeof l.netoPropietario === 'number' ? l.netoPropietario : 0), 0),
    ),
  };
  const sumaIngresosLibro = redondear2(libro.filter((l) => l.tipo === 'INGRESO').reduce((s, l) => s + l.total, 0));
  const sumaGastosLibro = redondear2(libro.filter((l) => l.tipo === 'GASTO').reduce((s, l) => s + l.total, 0));
  const verificaciones: VerificacionCuadre[] = [
    {
      nombre: 'libro:ingresos == cobros incluidos computables',
      esperado: redondear2(sumaIngresosComputables), obtenido: sumaIngresosLibro,
      ok: redondear2(sumaIngresosComputables) === sumaIngresosLibro,
    },
    {
      nombre: 'libro:gastos == gastos incluidos computables',
      esperado: redondear2(sumaGastosComputables), obtenido: sumaGastosLibro,
      ok: redondear2(sumaGastosComputables) === sumaGastosLibro,
    },
    {
      nombre: 'libro:lineas == cobros+gastos computables',
      esperado: numIngresosComputables + numGastosComputables, obtenido: libro.length,
      ok: numIngresosComputables + numGastosComputables === libro.length,
    },
    {
      nombre: 'totales:resultado == ingresos - gastos',
      esperado: redondear2(totalIngresos - totalGastos), obtenido: totales.resultado,
      ok: redondear2(totalIngresos - totalGastos) === totales.resultado,
    },
    {
      nombre: 'totales:deducible+no deducible == gastos',
      esperado: totalGastos,
      obtenido: redondear2(totales.totalGastosDeducibles + totales.totalGastosNoDeducibles),
      ok: totalGastos === redondear2(totales.totalGastosDeducibles + totales.totalGastosNoDeducibles),
    },
  ];

  // -- Proyecciones CSV (sin datos minimizados; ver cabecera de columnas) -----
  const filasInmuebles = inmueblesIncluidos.map((i) => ({
    id: i.id, direccion: i.direccion ?? '', ciudad: i.ciudad ?? '',
    referenciaCatastral: i.referenciaCatastral ?? '',
    propietarioId: i.propietarioId ?? '', propietarioPrincipalId: i.propietarioPrincipalId ?? '',
    estado: texto(i.estado), tipoInmueble: i.tipoInmueble ?? '',
  }));
  const filasContratos = contratosIncluidos.map((c) => ({
    id: c.id, inmuebleId: c.inmuebleId,
    propietarioId: c.propietarioId ?? propietarioDeContrato.get(c.id)
      ?? titularUnicoEnAmbito(c.inmuebleId) ?? titularDeInmueble.get(c.inmuebleId) ?? '',
    candidatoId: c.candidatoId ?? '', candidatoNombre: c.candidatoNombre ?? '',
    fechaInicioContrato: c.fechaInicioContrato ?? '',
    fechaFinContrato: c.fechaFinContrato ?? '',
    rentaMensual: c.rentaMensual ?? '', estado: texto(c.estado),
    inmuebleDireccion: c.inmuebleDireccion ?? '',
  }));
  // Proyección estricta a las columnas del CSV (como en gastos): el paquete
  // estructurado tampoco debe retener DNI/teléfono/email/referencia bancaria
  // del registro completo; la minimización no es solo cosa del ZIP final.
  const filasCobros = cobrosIncluidos.map((cb) => {
    const fila: Record<string, unknown> = {};
    for (const col of COLUMNAS_CSV['COBRO']) fila[col] = (cb as unknown as Record<string, unknown>)[col] ?? '';
    return fila;
  });
  const filasGastos = gastosIncluidos.map((g) => {
    const fila: Record<string, unknown> = {};
    for (const col of COLUMNAS_CSV['GASTO']) fila[col] = (g as unknown as Record<string, unknown>)[col] ?? '';
    return fila;
  });
  const filasFacturas = facturasIncluidas.map(({ factura: f }) => ({
    id: f.id, propietarioId: f.propietarioId, inmuebleId: f.inmuebleId ?? '',
    contratoId: f.contratoId ?? '', gastoId: f.gastoId ?? '',
    clase: texto(f.clase), tipo: texto(f.tipo), serie: texto(f.serie),
    numero: f.numero ?? '', ejercicio: f.ejercicio ?? '',
    fechaExpedicion: texto(f.fechaExpedicion), fechaOperacion: texto(f.fechaOperacion),
    emisorNombre: f.emisor?.nombre ?? '', emisorNif: f.emisor?.nif ?? '',
    receptorNombre: f.receptor?.nombre ?? '', receptorNif: f.receptor?.nif ?? '',
    baseImponible: f.baseImponible ?? '', cuotaIva: f.cuotaIva ?? '',
    cuotaRetencion: f.cuotaRetencion ?? '', importeTotal: f.importeTotal ?? '',
    estado: texto(f.estado),
  }));
  const filasLiquidaciones = liquidacionesIncluidas.map((l) => ({
    id: l.id, propietarioId: l.propietarioId, propietarioNombre: l.propietarioNombre ?? '',
    periodo: l.periodo ?? '', anio: l.anio ?? '', mes: l.mes ?? '',
    totalBrutoCobrado: l.totalBrutoCobrado ?? '', totalHonorarios: l.totalHonorarios ?? '',
    totalIvaHonorarios: l.totalIvaHonorarios ?? '', totalGastos: l.totalGastos ?? '',
    totalRetenciones: l.totalRetenciones ?? '', totalAjustes: l.totalAjustes ?? '',
    totalDeducciones: l.totalDeducciones ?? '', netoPropietario: l.netoPropietario ?? '',
    estado: texto(l.estado), fechaGeneracion: texto(l.fechaGeneracion),
    fechaPago: texto(l.fechaPago),
  }));
  const filasPolizas = polizasIncluidas.map((p) => ({
    id: p.id, propietarioId: p.propietarioId, inmuebleId: p.inmuebleId ?? '',
    aseguradora: p.aseguradora ?? '', numeroPoliza: p.numeroPoliza ?? '',
    tipo: texto(p.tipo), fechaInicio: texto(p.fechaInicio),
    fechaVencimiento: texto(p.fechaVencimiento), estado: texto(p.estado),
    primaAnual: p.primaAnual ?? '',
  }));

  incidencias.sort((a, b) =>
    a.codigo.localeCompare(b.codigo) || (a.id || '').localeCompare(b.id || ''));

  const conteos: Record<string, number> = {
    inmuebles: filasInmuebles.length,
    contratos: filasContratos.length,
    cobros: filasCobros.length,
    gastos: filasGastos.length,
    facturas: filasFacturas.length,
    liquidaciones: filasLiquidaciones.length,
    polizas: filasPolizas.length,
    lineasLibro: libro.length,
  };

  const advertencias: string[] = [
    'Paquete interno para el asesor. NO es un formato oficial de presentación AEAT.',
    'Sin binarios documentales en v1: las referencias viajan por nombre de fichero.',
    'Factura emitida no equivale a cobro; liquidaciones = agregación. Ninguna de las dos duplica líneas en el libro.',
    'Base/IVA solo donde hay factura vinculada al gasto; en el resto queda SIN_DESGLOSE_EN_ORIGEN (no se inventa).',
    'Sin IBAN, DNI de inquilino, teléfonos ni correos (minimización).',
  ];
  if (libro.length === 0) advertencias.push('El ámbito seleccionado no contiene líneas de libro.');

  // Identificador reproducible del CONTENIDO (sin generatedAt ni generatedBy).
  // `meses` solo forma parte de la huella cuando hay filtro mensual, para no
  // cambiar la identidad de paquetes sin filtro mensual generados antes.
  const paqueteId = sha256Hex(jsonEstable({
    schema: PAQUETE_ASESOR_SCHEMA,
    propietarios: veredicto.propietariosEfectivos,
    inmuebles: veredicto.inmueblesEfectivos,
    ejercicios: veredicto.ejerciciosEfectivos,
    ...(veredicto.mesesEfectivos !== null ? { meses: veredicto.mesesEfectivos } : {}),
    conteos,
    libro,
    filas: {
      inmuebles: filasInmuebles, contratos: filasContratos, cobros: filasCobros,
      gastos: filasGastos, facturas: filasFacturas,
      liquidaciones: filasLiquidaciones, polizas: filasPolizas,
    },
    incidencias,
  }));

  return {
    manifest: {
      paqueteId,
      schemaVersion: PAQUETE_ASESOR_SCHEMA,
      generatedAt: opciones.generatedAt,
      generatedBy: opciones.generatedBy ?? null,
      propietariosEfectivos: veredicto.propietariosEfectivos,
      inmueblesEfectivos: veredicto.inmueblesEfectivos,
      ejerciciosEfectivos: veredicto.ejerciciosEfectivos,
      mesesEfectivos: veredicto.mesesEfectivos,
      conteos,
      totales,
      verificaciones,
      hashes: {},
      numIncidencias: incidencias.length,
      avisos: [...veredicto.avisos],
      advertencias,
      formatoOficialAEAT: false,
      incluyeBinariosDocumentales: false,
      escrituras: 0,
    },
    libro,
    filas: {
      inmuebles: filasInmuebles,
      contratos: filasContratos,
      cobros: filasCobros as (CobroPeriodo & Record<string, unknown>)[],
      gastos: filasGastos,
      facturas: filasFacturas,
      liquidaciones: filasLiquidaciones,
      polizas: filasPolizas,
    },
    incidencias,
  };
}

// ---------------------------------------------------------------------------
// Serialización y empaquetado ZIP
// ---------------------------------------------------------------------------

function escaparCsvPaquete(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' && Number.isFinite(v)
    ? (Number.isInteger(v) ? String(v) : v.toFixed(2))
    : typeof v === 'boolean' ? String(v)
    : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV con cabecera de columnas declaradas; filas ya ordenadas por el motor. */
export function filasACsv(
  columnas: readonly string[],
  filas: ReadonlyArray<Record<string, unknown>>,
): string {
  const cuerpo = filas.map((r) => columnas.map((c) => escaparCsvPaquete(r[c])).join(','));
  return [columnas.join(','), ...cuerpo].join('\n');
}

export function libroACsv(libro: readonly LineaLibroAsesor[]): string {
  return filasACsv(COLUMNAS_LIBRO, libro as unknown as Record<string, unknown>[]);
}

function informeTxt(paquete: PaqueteAsesorGenerado): string {
  const m = paquete.manifest;
  const lineas: string[] = [
    'PAQUETE CONTABLE DEL ASESOR — ERP Gestor de Inmuebles',
    `Esquema: ${m.schemaVersion}`,
    `Paquete (hash de contenido): ${m.paqueteId}`,
    `Generado: ${m.generatedAt}${m.generatedBy ? ` por ${m.generatedBy}` : ''}`,
    '',
    'ÁMBITO',
    `  Propietarios: ${m.propietariosEfectivos.join(', ')}`,
    `  Inmuebles: ${m.inmueblesEfectivos ? m.inmueblesEfectivos.join(', ') : '(todos los de los propietarios)'}`,
    `  Ejercicios: ${m.ejerciciosEfectivos ? m.ejerciciosEfectivos.join(', ') : '(sin filtro anual)'}`,
    `  Meses: ${m.mesesEfectivos ? m.mesesEfectivos.join(', ') : '(sin filtro mensual)'}`,
    '',
    'CONTENIDO',
    ...Object.entries(m.conteos).map(([k, v]) => `  ${k}: ${v}`),
    `  Incidencias: ${m.numIncidencias} (ver incidencias.json)`,
    '',
    'TOTALES DEL LIBRO (EUR)',
    `  Ingresos: ${m.totales.totalIngresos.toFixed(2)}`,
    `  Gastos: ${m.totales.totalGastos.toFixed(2)} (deducibles ${m.totales.totalGastosDeducibles.toFixed(2)} / no deducibles ${m.totales.totalGastosNoDeducibles.toFixed(2)})`,
    `  Resultado (ingresos - gastos): ${m.totales.resultado.toFixed(2)}`,
    ...m.totales.porEjercicio.map((f) => `  ${f.ejercicio}: ingresos ${f.totalIngresos.toFixed(2)} · gastos ${f.totalGastos.toFixed(2)} · resultado ${f.resultado.toFixed(2)}`),
    `  Neto de liquidaciones incluidas (informativo, no sumado): ${m.totales.totalNetoLiquidacionesIncluidas.toFixed(2)}`,
    '',
    'CUADRE',
    ...m.verificaciones.map((v) => `  [${v.ok ? 'OK' : 'FALLO'}] ${v.nombre}: esperado ${v.esperado} / obtenido ${v.obtenido}`),
    '',
    'ADVERTENCIAS',
    ...m.advertencias.map((a) => `  - ${a}`),
    ...(m.avisos.length > 0 ? ['', 'AVISOS DE ÁMBITO', ...m.avisos.map((a) => `  - ${a}`)] : []),
    '',
    'FICHEROS: manifest.json (índice con hashes SHA-256), libro-ingresos-gastos.csv,',
    'totales.json, incidencias.json y datos/*.csv por entidad.',
  ];
  return lineas.join('\n');
}

/**
 * Empaqueta el paquete en un ZIP determinista con índice de hashes.
 * El `manifest.json` registra el SHA-256 de cada entrada excepto de sí mismo
 * (mismo compromiso que el expediente fiscal B6); el hash del manifest y del
 * ZIP completo viajan en el resultado para que el llamante los registre.
 */
export function empaquetarPaqueteAsesor(
  paquete: PaqueteAsesorGenerado,
): ResultadoEmpaquetadoAsesor {
  const entradasTexto: EntradaZip[] = [
    { ruta: 'informe.txt', contenido: utf8Bytes(informeTxt(paquete)) },
    { ruta: 'libro-ingresos-gastos.csv', contenido: utf8Bytes(libroACsv(paquete.libro)) },
    {
      ruta: 'totales.json',
      contenido: utf8Bytes(jsonEstable({
        totales: paquete.manifest.totales,
        verificaciones: paquete.manifest.verificaciones,
      })),
    },
    { ruta: 'incidencias.json', contenido: utf8Bytes(jsonEstable(paquete.incidencias)) },
    { ruta: 'datos/inmuebles.csv', contenido: utf8Bytes(filasACsv(COLUMNAS_INMUEBLE_PAQUETE, paquete.filas.inmuebles)) },
    { ruta: 'datos/contratos.csv', contenido: utf8Bytes(filasACsv(COLUMNAS_CONTRATO_PAQUETE, paquete.filas.contratos)) },
    { ruta: 'datos/cobros.csv', contenido: utf8Bytes(filasACsv(COLUMNAS_CSV['COBRO'], paquete.filas.cobros)) },
    { ruta: 'datos/gastos.csv', contenido: utf8Bytes(filasACsv(COLUMNAS_CSV['GASTO'], paquete.filas.gastos)) },
    { ruta: 'datos/facturas.csv', contenido: utf8Bytes(filasACsv(COLUMNAS_FACTURA_PAQUETE, paquete.filas.facturas)) },
    { ruta: 'datos/liquidaciones.csv', contenido: utf8Bytes(filasACsv(COLUMNAS_LIQUIDACION_PAQUETE, paquete.filas.liquidaciones)) },
    { ruta: 'datos/polizas.csv', contenido: utf8Bytes(filasACsv(COLUMNAS_POLIZA_PAQUETE, paquete.filas.polizas)) },
  ];

  const hashes: Record<string, string> = {};
  for (const e of entradasTexto) hashes[e.ruta] = sha256Hex(e.contenido);
  const manifest = { ...paquete.manifest, hashes };
  const manifestBytes = utf8Bytes(jsonEstable(manifest));
  const entradas: EntradaZip[] = [
    { ruta: 'manifest.json', contenido: manifestBytes },
    ...entradasTexto,
  ];
  const zip = crearZip(entradas);
  return {
    zip,
    sha256Zip: sha256Hex(zip),
    entradas: entradas.map((e) => ({
      ruta: e.ruta,
      sha256: sha256Hex(e.contenido),
      bytes: e.contenido.length,
    })),
  };
}
