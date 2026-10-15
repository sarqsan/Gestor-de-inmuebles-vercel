/**
 * ALTA DE INMUEBLE PATRIMONIAL POR IMPORTACIÓN (proyección del registro).
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EXISTE ESTE MÓDULO
 * ---------------------------------------------------------------------------
 * El modelo `Inmueble` mezcla dos familias de campos:
 *
 *  · PATRIMONIALES — describen el activo: dirección, ciudad, código postal,
 *    referencia catastral, tipo, valor de adquisición, valoración estimada,
 *    fecha de adquisición, superficie, habitaciones.
 *  · DE ALQUILER / PUBLICACIÓN — describen su explotación o su anuncio:
 *    `precio`/`rentaMensual` (renta), `estado` ('disponible' | 'alquilado'),
 *    `inquilinoActualNombre`, `fianzaMeses`, `banos`, `candidatosCount`,
 *    `descripcion`, imágenes.
 *
 * Una fila de la plantilla patrimonial describe el ACTIVO. El alta escribe por
 * tanto la proyección patrimonial de lo que la fila declara y NO escribe los
 * campos de alquiler/publicación, que se completan en el panel del inmueble.
 * Así el inmueble nace patrimonial y no como un anuncio a medio formar.
 *
 * ---------------------------------------------------------------------------
 * REGLA INNEGOCIABLE: NADA SE INVENTA
 * ---------------------------------------------------------------------------
 * Un campo ausente NO se rellena con 0, 1, '' ni ningún valor por defecto: se
 * OMITE, que es la única representación honesta de «no consta». El modelo ya
 * trata así la ausencia (`estadoPatrimonialDe` ⇒ 'ACTIVO'; la suscripción de
 * inmuebles no normaliza ni inventa campos al leer), de modo que omitir es
 * además lo que hace el alta de la propia aplicación.
 *
 * En particular NO se escriben `precio`, `estado`, `fianzaMeses`, `banos` ni
 * `candidatosCount`: son los campos obligatorios del modelo de alquiler y no
 * existe un valor verdadero que poner cuando la fila no lo declara.
 *
 * Los campos de alquiler que la fila SÍ declare no se pierden en silencio: se
 * conservan en la evidencia del registro (`datoOriginal`) y se avisan uno a uno
 * con su motivo (`avisosAlquilerNoEscritosEnAlta`), para que «no escrito en el
 * alta» nunca se confunda con «no leído».
 */
import type {
  DatoImportadoDeclarado,
  DatosImportadosHistoricosInmueble,
  GastosAnualesDeclaradosInmueble,
  InquilinoDeclaradoInmueble,
  TitularidadDeclaradaInmueble,
} from '../../types';
import type { ImportRecord } from './contrato';

/** Documento patrimonial mínimo que el alta escribe. Sólo campos declarados. */
export interface InmueblePatrimonialNuevo {
  id: string;
  direccion: string;
  propietarioId: string;
  ciudad?: string;
  codigoPostal?: string;
  referenciaCatastral?: string;
  tipoInmueble?: string;
  valorAdquisicion?: number;
  valoracionEstimada?: number;
  fechaAdquisicion?: string;
  superficie?: number;
  habitaciones?: number;
  propietarioPrincipalId?: string;
  // Datos DECLARADOS por el archivo con campo propio verificable (equivalen a
  // landValuePercent / amortizationAmount / expenses* / registrationDate /
  // monthlyRent / tenant* del Gestor Patrimonial de referencia).
  porcentajeSueloCatastral?: number;
  fechaRegistroPatrimonial?: string;
  amortizacionAnualDeclarada?: number;
  rentaMensualDeclarada?: number;
  gastosAnualesDeclarados?: GastosAnualesDeclaradosInmueble;
  inquilinoDeclarado?: InquilinoDeclaradoInmueble;
  titularidadDeclarada?: TitularidadDeclaradaInmueble;
  datosImportadosHistoricos?: DatosImportadosHistoricosInmueble;
  notasInternas?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Campos patrimoniales que se copian tal cual cuando la fila los declara. El
 * bloque declarado refleja 1:1 las columnas de la plantilla de referencia.
 */
export const CAMPOS_PATRIMONIALES_ALTA = [
  'ciudad', 'codigoPostal', 'referenciaCatastral', 'tipoInmueble',
  'valorAdquisicion', 'valoracionEstimada', 'fechaAdquisicion',
  'superficie', 'habitaciones',
] as const;

/** Campos DECLARADOS (número) que se escriben sólo si la fila los declara. */
export const CAMPOS_DECLARADOS_NUMERICOS_ALTA = [
  'porcentajeSueloCatastral', 'amortizacionAnualDeclarada', 'rentaMensualDeclarada',
] as const;

const CAMPOS_NUMERICOS_PATRIMONIALES = new Set(['valorAdquisicion', 'valoracionEstimada', 'superficie', 'habitaciones']);

/**
 * Campos de ALQUILER / PUBLICACIÓN que el alta deliberadamente NO escribe.
 * Se declaran con motivo (nunca en silencio) cuando la fila los trae.
 */
export const CAMPOS_ALQUILER_NO_ESCRITOS_EN_ALTA: ReadonlyArray<{ campo: string; motivo: string }> = [
  { campo: 'estado', motivo: "ESTADO DE PUBLICACIÓN ('disponible'/'alquilado'): no se deduce del archivo; el alta no publica el inmueble (no se inventa un estado)" },
  { campo: 'inquilinoActualNombre', motivo: 'INQUILINO: exige contrato/candidato documentado; el alta no crea arrendamiento (no se inventa un inquilino)' },
];

/** Numérico finito y no negativo (los valores del archivo nunca se «corrigen»). */
function esNumeroPatrimonialDeclarado(campo: string, v: unknown): boolean {
  return CAMPOS_NUMERICOS_PATRIMONIALES.has(campo) && typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Proyección patrimonial del registro. Lanza si falta algo imprescindible: un
 * alta sin id asignado, sin titular o sin dirección no es un inmueble válido y
 * no se completa «a ojo».
 */
export function construirInmueblePatrimonialDestino(
  r: ImportRecord,
  ctx: { fechaHora: string; actor?: string | null },
): InmueblePatrimonialNuevo {
  const c = r.canonicalData;
  const id = r.destinationId;
  const propietarioId = r.propietarioDestinoId;
  const direccion = typeof c['direccion'] === 'string' ? c['direccion'].trim() : '';
  if (!id) throw new Error('alta de inmueble sin id interno asignado (no se inventa)');
  if (!propietarioId) throw new Error('alta de inmueble sin titular destino (las Rules exigen propietarioId del propio titular)');
  if (!direccion) throw new Error('alta de inmueble sin dirección (campo obligatorio del modelo; no se inventa)');

  const destino: Record<string, unknown> = { id, direccion, propietarioId };
  for (const campo of CAMPOS_PATRIMONIALES_ALTA) {
    const v = c[campo];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t !== '') destino[campo] = t;
      continue;
    }
    if (esNumeroPatrimonialDeclarado(campo, v)) destino[campo] = v;
  }
  // ---- Datos DECLARADOS por el archivo: campo propio, persistente y releible.
  for (const campo of CAMPOS_DECLARADOS_NUMERICOS_ALTA) {
    const v = c[campo];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      // Validación del porcentaje de suelo: fuera de rango nunca se escribe
      // (el original queda en el bloque histórico con su motivo).
      if (campo === 'porcentajeSueloCatastral' && v > 100) continue;
      destino[campo] = v;
    }
  }
  // CUOTA DE ALQUILER DECLARADA. Si el archivo trae una cuota con su nombre de
  // plantilla (`rentaMensualDeclarada`) se usa ésta; si sólo trae la clave del
  // modelo (`precio`, p. ej. una exportación propia) o `rentaMensual`, esa cifra
  // se guarda TAMBIÉN como renta declarada. Nunca se escribe `precio` ni
  // `rentaMensual`: alimentan la ficha pública y la renta vigente (explotación),
  // y la cuota del archivo no es una publicación ni un contrato.
  if (destino['rentaMensualDeclarada'] === undefined) {
    for (const origen of ['precio', 'rentaMensual'] as const) {
      const v = c[origen];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
        destino['rentaMensualDeclarada'] = v;
        break;
      }
    }
  }
  if (typeof c['fechaRegistroPatrimonial'] === 'string' && c['fechaRegistroPatrimonial'].trim() !== '') {
    destino['fechaRegistroPatrimonial'] = c['fechaRegistroPatrimonial'].trim();
  }
  const anual = c['gastosAnualesDeclarados'];
  if (anual !== null && typeof anual === 'object' && !Array.isArray(anual)) {
    const limpio: GastosAnualesDeclaradosInmueble = {};
    for (const k of ['comunidad', 'ibi', 'reparaciones', 'seguro'] as const) {
      const v = (anual as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) limpio[k] = v;
    }
    const ejercicio = (anual as Record<string, unknown>)['ejercicio'];
    if (typeof ejercicio === 'number' && Number.isInteger(ejercicio)) limpio.ejercicio = ejercicio;
    else limpio.ejercicio = null;
    if (Object.keys(limpio).some((k) => k !== 'ejercicio')) destino['gastosAnualesDeclarados'] = limpio;
  }
  // Titularidad e inquilino DECLARADOS: se persisten como declaración (nunca
  // como titularidad real ni como arrendamiento), con marca de resolución.
  const titularidad = construirTitularidadDeclarada(r);
  if (titularidad) destino['titularidadDeclarada'] = titularidad;
  const inquilino = construirInquilinoDeclarado(r);
  if (inquilino) destino['inquilinoDeclarado'] = inquilino;
  const historicos = construirDatosImportadosHistoricos(r, ctx);
  if (historicos) destino['datosImportadosHistoricos'] = historicos;
  // Titular fiscal principal: se copia SÓLO si es el mismo titular validado
  // como destino (nunca introduce un segundo titular sin resolver).
  if (typeof c['propietarioPrincipalId'] === 'string' && c['propietarioPrincipalId'].trim() === propietarioId) {
    destino['propietarioPrincipalId'] = propietarioId;
  }
  // Trazabilidad del origen dentro del propio documento (misma convención que gastos).
  destino['notasInternas'] = `Alta por importación · origen ${r.provenance.source}:${r.sourceRecordId} · run ${r.provenance.importRunId}`;
  destino['createdAt'] = ctx.fechaHora;
  destino['updatedAt'] = ctx.fechaHora;
  return destino as unknown as InmueblePatrimonialNuevo;
}

/**
 * Avisos, uno por campo, de los datos de alquiler/publicación que la fila trae
 * y que el alta NO escribe (con su motivo). Es el reverso explícito de la
 * proyección: garantiza que ninguna columna reconocida desaparezca en silencio.
 */
export function avisosAlquilerNoEscritosEnAlta(canonicalData: Record<string, unknown>): string[] {
  const avisos: string[] = [];
  for (const { campo, motivo } of CAMPOS_ALQUILER_NO_ESCRITOS_EN_ALTA) {
    const v = canonicalData[campo];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    const legible = typeof v === 'string' ? v.trim() : String(v);
    avisos.push(`alta patrimonial: '${campo}' = «${legible}» NO se escribe en el inmueble nuevo — ${motivo}`);
  }
  return avisos;
}

/**
 * Titularidad DECLARADA por la fila: texto y porcentajes tal cual vienen, más
 * la marca (y el detalle) de si una persona los resolvió a titulares existentes.
 *
 * Nunca se deriva nada: un porcentaje que el archivo no declara queda ausente
 * (no se asume 100 % ni 50/50) y un porcentaje ilegible se guarda en
 * `porcentajesNoInterpretables` con su motivo. La titularidad REAL del inmueble
 * vive en `titularesIds` + `titularidades` (se crea por el flujo autorizado).
 */
export function construirTitularidadDeclarada(r: ImportRecord): TitularidadDeclaradaInmueble | null {
  const texto = (r.declarados ?? [])
    .filter((d) => d.clave === 'titularidadDeclarada.texto')
    .map((d) => (typeof d.valor === 'string' ? d.valor.trim() : ''))
    .find((v) => v !== '');
  const porRanura = new Map<1 | 2, { porcentaje: number | null; valorOriginal: unknown; motivo?: string }>();
  for (const d of r.declarados ?? []) {
    if (d.clase !== 'RELACION_PENDIENTE' || d.ranura === undefined) continue;
    if (d.clave !== 'titularidadDeclarada.propietario1' && d.clave !== 'titularidadDeclarada.propietario2') continue;
    porRanura.set(d.ranura, {
      porcentaje: typeof d.valor === 'number' ? d.valor : null,
      valorOriginal: d.valorOriginal,
      ...(typeof d.valor === 'number' ? {} : { motivo: d.motivo }),
    });
  }
  const resueltas = r.titularidadResuelta ?? [];
  if (!texto && porRanura.size === 0 && resueltas.length === 0) return null;
  const declarada: TitularidadDeclaradaInmueble = {};
  if (texto) declarada.texto = texto;
  const p1 = porRanura.get(1);
  const p2 = porRanura.get(2);
  if (p1?.porcentaje !== null && p1 !== undefined) declarada.porcentajePropietario1 = p1.porcentaje;
  if (p2?.porcentaje !== null && p2 !== undefined) declarada.porcentajePropietario2 = p2.porcentaje;
  const noInterpretables: Array<{ ranura: 1 | 2; valorOriginal: unknown; motivo: string }> = [];
  for (const [ranura, v] of porRanura) {
    if (v.porcentaje === null) noInterpretables.push({ ranura, valorOriginal: v.valorOriginal, motivo: v.motivo ?? 'porcentaje declarado no interpretable' });
  }
  if (noInterpretables.length > 0) declarada.porcentajesNoInterpretables = noInterpretables;
  if (resueltas.length > 0) {
    declarada.resuelta = true;
    declarada.titularidadResuelta = resueltas.map((x) => ({ ranura: x.ranura, propietarioId: x.propietarioId }));
  } else {
    declarada.resuelta = false;
  }
  return declarada;
}

/** Inquilino DECLARADO por la fila (nombre y/o DNI). No acredita arrendamiento. */
export function construirInquilinoDeclarado(r: ImportRecord): InquilinoDeclaradoInmueble | null {
  const buscar = (clave: string): string | undefined => {
    const v = (r.declarados ?? []).find((d) => d.clave === clave)?.valor;
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  const nombre = buscar('inquilinoDeclarado.nombre');
  const dni = buscar('inquilinoDeclarado.dni');
  if (!nombre && !dni) return null;
  return { ...(nombre ? { nombre } : {}), ...(dni ? { dni } : {}) };
}

/**
 * Evidencia persistida de la importación: TODOS los datos declarados con su
 * valor original, su estado y su motivo, más la procedencia exacta. Es lo que
 * hace verificable que ninguna columna reconocida se pierde y que todo lo que
 * queda pendiente dice exactamente qué falta.
 */
export function construirDatosImportadosHistoricos(
  r: ImportRecord,
  ctx: { fechaHora: string; actor?: string | null },
): DatosImportadosHistoricosInmueble | null {
  const declarados = r.declarados ?? [];
  const pendientes = r.relacionesPendientes ?? [];
  if (declarados.length === 0 && pendientes.length === 0) return null;
  const datosDeclarados: DatoImportadoDeclarado[] = declarados.map((d) => ({
    campoOrigen: d.campoOrigen,
    clave: d.clave,
    clase: d.clase,
    valor: d.valor,
    valorOriginal: d.valorOriginal,
    ejercicio: d.ejercicio,
    ...(d.categoria ? { categoria: d.categoria } : {}),
    estado: d.estado,
    motivo: d.motivo,
  }));
  for (const p of pendientes) {
    datosDeclarados.push({
      campoOrigen: p.campoOrigen,
      clave: p.clave,
      clase: 'RELACION_PENDIENTE',
      valor: null,
      valorOriginal: p.valorOriginal,
      ejercicio: null,
      estado: 'PENDIENTE_RESOLUCION',
      motivo: p.motivo,
    });
  }
  const agregados = datosDeclarados.filter((d) => d.clase === 'AGREGADO_ANUAL');
  const ejercicios = new Set(agregados.map((d) => d.ejercicio).filter((x): x is number => typeof x === 'number'));
  const total = agregados.length > 0 && ejercicios.size <= 1
    ? agregados.reduce((acc, d) => acc + (typeof d.valor === 'number' ? d.valor : 0), 0)
    : undefined;
  return {
    schemaVersion: 1,
    importRunId: r.provenance.importRunId,
    sourceFile: r.provenance.sourceFile,
    sourceRecordId: r.sourceRecordId,
    importadoEn: ctx.fechaHora,
    importadoPor: ctx.actor ?? null,
    datosDeclarados,
    ...(total !== undefined ? { totalAgregadosAnualesDeclarados: redondear2Import(total) } : {}),
  };
}

function redondear2Import(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
