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
  notasInternas?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Campos patrimoniales que se copian tal cual cuando la fila los declara. */
export const CAMPOS_PATRIMONIALES_ALTA = [
  'ciudad', 'codigoPostal', 'referenciaCatastral', 'tipoInmueble',
  'valorAdquisicion', 'valoracionEstimada', 'fechaAdquisicion',
  'superficie', 'habitaciones',
] as const;

const CAMPOS_NUMERICOS_PATRIMONIALES = new Set(['valorAdquisicion', 'valoracionEstimada', 'superficie', 'habitaciones']);

/**
 * Campos de ALQUILER / PUBLICACIÓN que el alta deliberadamente NO escribe.
 * Se declaran con motivo (nunca en silencio) cuando la fila los trae.
 */
export const CAMPOS_ALQUILER_NO_ESCRITOS_EN_ALTA: ReadonlyArray<{ campo: string; motivo: string }> = [
  { campo: 'precio', motivo: 'RENTA (dato de explotación, no del activo): el alta crea el inmueble patrimonial sin precio; se declara en el panel del inmueble (no se inventa una renta)' },
  { campo: 'rentaMensual', motivo: 'RENTA (dato de explotación, no del activo): el alta crea el inmueble patrimonial sin renta; se declara en el panel del inmueble (no se inventa una renta)' },
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
  ctx: { fechaHora: string },
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
