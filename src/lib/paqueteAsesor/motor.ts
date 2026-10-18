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
 *  · filtro temporal de CONTRATO por vigencia («vigentes en el ejercicio N»),
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
  const candidata = g.fechaDevengo || g.fechaPago || g.fecha || '';
  return esFechaIsoValida(candidata) ? candidata : '';
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
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function texto(v: unknown): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v);
}

function ordenarPorId<T extends { id?: unknown }>(arr: readonly T[]): T[] {
  return [...arr].sort((a, b) => texto(a.id).localeCompare(texto(b.id)));
}

/** Solape de un intervalo [inicio, fin|∞) con alguno de los ejercicios. */
function solapaEjercicios(inicio: string, fin: string | null, ejercicios: readonly number[]): boolean {
  return ejercicios.some((ej) => {
    const desde = `${ej}-01-01`;
    const hasta = `${ej}-12-31`;
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
    ok: false, error, propietariosEfectivos: [], inmueblesEfectivos: [], ejerciciosEfectivos: null, avisos,
  });

  const ejercicios = [...new Set((solicitado.ejercicios ?? []).filter(
    (e) => Number.isInteger(e) && e >= 1900 && e <= 9999,
  ))].sort((a, b) => a - b);
  if ((solicitado.ejercicios?.length ?? 0) !== ejercicios.length) {
    return denegar('ejercicios inválidos (se esperaban años enteros sin duplicados)');
  }

  const legibles = autorizado.propietarioIdsLegibles; // null = master
  let propietariosEfectivos: string[];
  if (solicitado.propietarioIds.length === 0) {
    if (legibles === null) {
      return denegar('master debe indicar propietarioIds explícitos (sin volcado global implícito)');
    }
    propietariosEfectivos = [...legibles];
    avisos.push('sin propietarioIds: se incluyen todos los legibles');
  } else {
    if (legibles !== null) {
      const fuera = solicitado.propietarioIds.filter((p) => !legibles.includes(p));
      if (fuera.length > 0) return denegar(`fuera de ámbito: ${fuera.join(', ')} (no legible)`);
    }
    propietariosEfectivos = [...solicitado.propietarioIds];
  }
  if (propietariosEfectivos.length === 0) {
    return denegar('sin propietarios efectivos: paquete denegado (fail-closed)');
  }

  const efectivos = new Set(propietariosEfectivos);
  let inmueblesEfectivos: string[] | null = null;
  if (solicitado.inmuebleIds && solicitado.inmuebleIds.length > 0) {
    for (const id of solicitado.inmuebleIds) {
      const ficha = catalogoInmuebles.find((c) => c.id === id);
      if (!ficha) return denegar(`inmueble '${id}' no encontrado en catálogo`);
      const titular = ficha.propietarioId ?? ficha.propietarioPrincipalId ?? null;
      if (legibles !== null && (!titular || !efectivos.has(titular))) {
        return denegar(`inmueble '${id}' fuera de ámbito (titular '${titular ?? '?'}' no autorizado)`);
      }
    }
    inmueblesEfectivos = [...solicitado.inmuebleIds];
  }
  const ejerciciosEfectivos = ejercicios.length > 0 ? ejercicios : null;
  if (ejerciciosEfectivos === null) avisos.push('sin ejercicios: paquete sin filtro temporal');
  return { ok: true, propietariosEfectivos, inmueblesEfectivos, ejerciciosEfectivos, avisos };
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
  const ejercicios = veredicto.ejerciciosEfectivos; // null = sin filtro
  const enEjercicios = (anio: number | null): boolean =>
    ejercicios === null || (anio !== null && ejercicios.includes(anio));

  const incidencias: IncidenciaPaqueteAsesor[] = [];
  const incidencia = (i: IncidenciaPaqueteAsesor) => { incidencias.push(i); };

  const titularDeInmueble = new Map<string, string | null>();
  for (const inm of entrada.inmuebles) {
    titularDeInmueble.set(inm.id, inm.propietarioId ?? inm.propietarioPrincipalId ?? null);
  }
  const inmuebleEnAmbito = (inmuebleId: unknown): boolean =>
    inms === null || (typeof inmuebleId === 'string' && inms.has(inmuebleId));

  // -- Inmuebles (contexto del paquete) -------------------------------------
  const inmueblesIncluidos = ordenarPorId(entrada.inmuebles.filter((inm) => {
    const titular = titularDeInmueble.get(inm.id) ?? null;
    return titular !== null && props.has(titular) && inmuebleEnAmbito(inm.id);
  }));
  const direccionDeInmueble = new Map(inmueblesIncluidos.map((i) => [i.id, i.direccion ?? '']));
  // Si un inmueble del paquete no trae dirección en la selección, se busca en
  // el catálogo completo SOLO como etiqueta (el dato ya pasó el filtro).
  for (const inm of entrada.inmuebles) {
    if (!direccionDeInmueble.has(inm.id)) direccionDeInmueble.set(inm.id, inm.direccion ?? '');
  }

  // -- Contratos vigentes en el ejercicio (novedad §4.3.3) ------------------
  const contratosAmbito: ContratoFormalizacion[] = [];
  for (const c of ordenarPorId(entrada.contratos)) {
    const pid = c.propietarioId ?? titularDeInmueble.get(c.inmuebleId) ?? null;
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
  }
  const contratosIncluidos: ContratoFormalizacion[] = [];
  for (const c of contratosAmbito) {
    if (ejercicios !== null) {
      if (!esFechaIsoValida(c.fechaInicioContrato)) {
        incidencia({
          codigo: 'CONTRATO_SIN_FECHA_INICIO', severidad: 'CRITICA',
          descripcion: `Contrato ${c.id} sin fechaInicioContrato válida: no se puede acreditar vigencia; excluido de contratos.csv (sus cobros se filtran por su propio año)`,
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
      if (!contratoVigenteEnEjercicios(c, ejercicios)) continue;
    }
    contratosIncluidos.push(c);
  }
  const nombreInquilinoPorContrato = new Map(
    contratosAmbito.map((c) => [c.id, c.candidatoNombre ?? '']),
  );

  // -- Cobros (aplanados desde los contratos, filtrados por su propio año) --
  const cobrosIncluidos: CobroPeriodo[] = [];
  for (const c of contratosAmbito) {
    for (const cobro of ordenarPorId(c.registroCobros ?? [])) {
      if (!props.has(cobro.propietarioId)) continue;
      if (!inmuebleEnAmbito(cobro.inmuebleId)) continue;
      if (!enEjercicios(typeof cobro.anio === 'number' ? cobro.anio : null)) continue;
      cobrosIncluidos.push(cobro);
    }
  }
  cobrosIncluidos.sort((a, b) => texto(a.id).localeCompare(texto(b.id)));

  // -- Gastos ----------------------------------------------------------------
  const gastosIncluidos: Gasto[] = [];
  for (const g of ordenarPorId(entrada.gastos)) {
    if (!props.has(g.propietarioId)) continue;
    if (!inmuebleEnAmbito(g.inmuebleId)) continue;
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
    facturasIncluidas.push({ factura: f, ejercicio: ej });
  }
  const facturaPorId = new Map(facturasIncluidas.map(({ factura }) => [factura.id, factura]));

  // -- Liquidaciones (agregaciones; contraste, no libro) --------------------
  const incluirLiquidaciones = solicitado.incluirLiquidaciones !== false;
  const liquidacionesIncluidas = ordenarPorId(
    incluirLiquidaciones ? (entrada.liquidaciones ?? []) : [],
  ).filter((liq) => {
    if (!props.has(liq.propietarioId)) return false;
    if (!enEjercicios(typeof liq.anio === 'number' ? liq.anio : null)) return false;
    if (inms !== null && !(liq.inmuebleIds ?? []).some((id) => inms.has(id))) return false;
    return true;
  });

  // -- Pólizas vigentes en el periodo (si procede) ---------------------------
  const incluirPolizas = solicitado.incluirPolizas !== false;
  const polizasIncluidas = ordenarPorId(
    incluirPolizas ? (entrada.polizas ?? []) : [],
  ).filter((p) => {
    if (!props.has(p.propietarioId)) return false;
    if (p.inmuebleId && !inmuebleEnAmbito(p.inmuebleId)) return false;
    if (!p.inmuebleId && inms !== null) return false;
    if (ejercicios === null) return true;
    if (!esFechaIsoValida(p.fechaInicio) || !esFechaIsoValida(p.fechaVencimiento)) {
      incidencia({
        codigo: 'POLIZA_FECHA_INVALIDA', severidad: 'AVISO',
        descripcion: `Póliza ${p.id} con vigencia ilegible: excluida del paquete por ejercicios`,
        entidad: 'poliza', id: p.id,
      });
      return false;
    }
    return solapaEjercicios(p.fechaInicio, p.fechaVencimiento, ejercicios);
  });

  // -- Libro de ingresos y gastos --------------------------------------------
  const libro: LineaLibroAsesor[] = [];
  let sumaIngresosComputables = 0;
  let sumaGastosComputables = 0;
  let numIngresosComputables = 0;
  let numGastosComputables = 0;

  for (const cobro of cobrosIncluidos) {
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
      documentoNombre: cobro.justificante?.nombreArchivo ?? '',
      desgloseFiscal: 'SIN_DESGLOSE_EN_ORIGEN',
    });
    sumaIngresosComputables += cobro.importeRecibido;
    numIngresosComputables += 1;
  }

  for (const g of gastosIncluidos) {
    if (g.estado === 'ANULADO') continue;
    if (!importeValido(g.importe)) {
      incidencia({
        codigo: 'GASTO_IMPORTE_INVALIDO', severidad: 'CRITICA',
        descripcion: `Gasto ${g.id} con importe inválido: excluido del libro`,
        entidad: 'gasto', id: g.id,
      });
      continue;
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
      } else {
        base = typeof factura.baseImponible === 'number' ? factura.baseImponible : null;
        iva = typeof factura.cuotaIva === 'number' ? factura.cuotaIva : null;
        retencion = typeof factura.cuotaRetencion === 'number' ? factura.cuotaRetencion : null;
        desgloseFiscal = 'FACTURA_VINCULADA';
        if (typeof factura.importeTotal === 'number'
          && redondear2(factura.importeTotal) !== redondear2(g.importe)) {
          incidencia({
            codigo: 'GASTO_FACTURA_IMPORTE_NO_COINCIDE', severidad: 'AVISO',
            descripcion: `Gasto ${g.id} (${g.importe}) no coincide con su factura ${factura.id} (${factura.importeTotal}): se conservan ambos importes, sin corregir ninguno`,
            entidad: 'gasto', id: g.id,
          });
        }
      }
    }
    const docRef = g.documento || (g.documentos && g.documentos[0]);
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
      documentoNombre: docRef?.nombre ?? '',
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
  const totalIngresos = redondear2(libro.filter((l) => l.tipo === 'INGRESO').reduce((s, l) => s + l.total, 0));
  const totalGastos = redondear2(libro.filter((l) => l.tipo === 'GASTO').reduce((s, l) => s + l.total, 0));
  const totales: TotalesPaqueteAsesor = {
    totalIngresos,
    totalGastos,
    totalGastosDeducibles: redondear2(libro.filter((l) => l.tipo === 'GASTO' && l.deducible === true).reduce((s, l) => s + l.total, 0)),
    totalGastosNoDeducibles: redondear2(libro.filter((l) => l.tipo === 'GASTO' && l.deducible !== true).reduce((s, l) => s + l.total, 0)),
    resultado: redondear2(totalIngresos - totalGastos),
    porEjercicio,
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
    propietarioId: c.propietarioId ?? titularDeInmueble.get(c.inmuebleId) ?? '',
    candidatoId: c.candidatoId ?? '', candidatoNombre: c.candidatoNombre ?? '',
    fechaInicioContrato: c.fechaInicioContrato ?? '',
    fechaFinContrato: c.fechaFinContrato ?? '',
    rentaMensual: c.rentaMensual ?? '', estado: texto(c.estado),
    inmuebleDireccion: c.inmuebleDireccion ?? '',
  }));
  const filasCobros = cobrosIncluidos.map((cb) => ({ ...(cb as unknown as Record<string, unknown>) }));
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
  const paqueteId = sha256Hex(jsonEstable({
    schema: PAQUETE_ASESOR_SCHEMA,
    propietarios: veredicto.propietariosEfectivos,
    inmuebles: veredicto.inmueblesEfectivos,
    ejercicios: veredicto.ejerciciosEfectivos,
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
    `  Ejercicios: ${m.ejerciciosEfectivos ? m.ejerciciosEfectivos.join(', ') : '(sin filtro temporal)'}`,
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
