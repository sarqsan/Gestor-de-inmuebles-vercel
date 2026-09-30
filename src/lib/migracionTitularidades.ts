/**
 * MIGRACIÓN A N TITULARES — PLANIFICADOR EN SECO (DRY-RUN)
 * =========================================================
 * NO ESCRIBE NADA. Sólo calcula QUÉ habría que crear para poblar
 * `inmuebles.titularidadesIds[]` y la colección `titularidades` a partir de la
 * titularidad que ya existe en los inmuebles (`propietarioId`,
 * `propietarioPrincipalId` y la ficha fiscal).
 *
 * Reglas:
 *  · idempotente: si la titularidad ya existe (y coincide en propietarioId y
 *    porcentaje), NO se propone nada (`sustancialmenteIgual`);
 *  · conservador: si no hay porcentaje fiable, se propone `null` (PENDIENTE).
 *    Nunca inventa un 50/50 ni un 33/33/34;
 *  · con un ÚNICO titular conocido, el porcentaje es 100 (es el único valor
 *    que no requiere suposición).
 */
import type { Inmueble, Titularidad } from '../types';
import { idTitularidad, titularidadesVigentes } from '../utils/titularidadesEngine';

export interface AltaTitularidadPropuesta {
  inmuebleId: string;
  propietarioId: string;
  /** `null` = PENDIENTE (no se inventa). */
  porcentaje: number | null;
  origen: OrigenTitular;
  clave: string;
}

export type OrigenTitular =
  | 'propietarioId'
  | 'propietarioPrincipalId'
  | 'fichaFiscalPrincipal'
  | 'fichaFiscalSegundo'
  | 'yaExistente';

export interface PropuestaInmueble {
  inmuebleId: string;
  direccion: string;
  /** Índice resultante (todos los titulares, incluidos los ya existentes). */
  titularesIds: string[];
  /** Titularidades que HABRÍA que crear (no las existentes). */
  altas: AltaTitularidadPropuesta[];
  /** `true` si el índice del inmueble ya coincide con lo calculado. */
  indiceActualizado: boolean;
}

export interface InformeMigracion {
  propuestas: PropuestaInmueble[];
  inmueblesAnalizados: number;
  inmueblesConCambios: number;
  altasPropuestas: number;
  /** Avisos: nunca bloquean, pero hay que revisarlos antes de ejecutar. */
  advertencias: string[];
}

/** ¿La titularidad existente cubre ya esta propuesta? (idempotencia real). */
export function sustancialmenteIgual(existente: Titularidad, propuesta: AltaTitularidadPropuesta): boolean {
  if (!existente || !propuesta) return false;
  if (existente.propietarioId !== propuesta.propietarioId) return false;
  const pctExistente = existente.porcentajeTitularidad ?? null;
  const pctPropuesto = propuesta.porcentaje ?? null;
  if (pctExistente === null || pctPropuesto === null) return pctExistente === pctPropuesto;
  return Math.abs(pctExistente - pctPropuesto) < 0.01;
}

/** Titulares deducidos del inmueble (sin datos inventados). */
export function titularesDeducidos(
  inmueble: Inmueble,
): Array<{ propietarioId: string; origen: OrigenTitular }> {
  const salida: Array<{ propietarioId: string; origen: OrigenTitular }> = [];
  const vistos = new Set<string>();
  const anadir = (id: string | undefined, origen: OrigenTitular) => {
    if (!id || vistos.has(id)) return;
    vistos.add(id);
    salida.push({ propietarioId: id, origen });
  };

  anadir(inmueble.propietarioId, 'propietarioId');
  anadir(inmueble.propietarioPrincipalId, 'propietarioPrincipalId');
  anadir(inmueble.datosFiscales?.propietarioPrincipal?.propietarioId, 'fichaFiscalPrincipal');
  if (inmueble.datosFiscales?.tieneSegundoPropietario) {
    anadir(inmueble.datosFiscales?.segundoPropietario?.propietarioId, 'fichaFiscalSegundo');
  }
  return salida;
}

/**
 * Calcula el plan COMPLETO. No ejecuta nada: el resultado es un informe para
 * revisión humana. La ejecución real (cuando se decida) se hará con la misma
 * función, lote a lote y con auditoría.
 */
export function planificarMigracion(entrada: {
  inmuebles: readonly Inmueble[];
  titularidades?: readonly Titularidad[];
}): InformeMigracion {
  const advertencias: string[] = [];
  const propuestas: PropuestaInmueble[] = [];
  let altasPropuestas = 0;
  let inmueblesConCambios = 0;

  for (const inmueble of entrada.inmuebles || []) {
    if (!inmueble?.id) continue;
    const deducidos = titularesDeducidos(inmueble);
    const existentes = titularidadesVigentes(entrada.titularidades || [], inmueble.id);
    const existentesPorId = new Map(existentes.map((t) => [t.propietarioId, t]));

    const titularesIds = new Set<string>([...deducidos.map((d) => d.propietarioId), ...existentes.map((t) => t.propietarioId)]);
    // Un único titular conocido ⇒ 100 % sin suponer nada. Con más de uno, el
    // porcentaje queda PENDIENTE salvo que ya conste en la titularidad.
    const porcentajePorDefecto = titularesIds.size === 1 ? 100 : null;

    const altas: AltaTitularidadPropuesta[] = [];
    for (const d of deducidos) {
      const existente = existentesPorId.get(d.propietarioId);
      // El porcentaje propuesto es siempre el DEDUCIDO (nunca el existente):
      // así se detecta la divergencia en vez de aceptarla en silencio.
      const propuesta: AltaTitularidadPropuesta = {
        inmuebleId: inmueble.id,
        propietarioId: d.propietarioId,
        porcentaje: porcentajePorDefecto,
        origen: existente ? 'yaExistente' : d.origen,
        clave: idTitularidad(inmueble.id, d.propietarioId),
      };
      if (existente && sustancialmenteIgual(existente, propuesta)) continue;
      if (existente) {
        advertencias.push(
          `${inmueble.id}: la titularidad de ${d.propietarioId} existe con un porcentaje distinto (${existente.porcentajeTitularidad ?? 'pendiente'}). Revisión manual.`,
        );
        continue;
      }
      altas.push(propuesta);
    }

    if (titularesIds.size > 1 && altas.length > 0) {
      advertencias.push(
        `${inmueble.id}: ${titularesIds.size} titulares y sin porcentaje fiable → quedan PENDIENTES (no se inventa el reparto).`,
      );
    }

    const indiceActual = inmueble.titularesIds || [];
    const indiceCalculado = Array.from(titularesIds).sort();
    const indiceActualizado =
      indiceActual.length === indiceCalculado.length &&
      indiceCalculado.every((id, i) => indiceActual.slice().sort()[i] === id);

    if (altas.length > 0 || !indiceActualizado) inmueblesConCambios += 1;
    altasPropuestas += altas.length;

    propuestas.push({
      inmuebleId: inmueble.id,
      direccion: inmueble.direccion || inmueble.alias || inmueble.id,
      titularesIds: indiceCalculado,
      altas,
      indiceActualizado,
    });
  }

  return {
    propuestas,
    inmueblesAnalizados: (entrada.inmuebles || []).filter((i) => !!i?.id).length,
    inmueblesConCambios,
    altasPropuestas,
    advertencias,
  };
}
