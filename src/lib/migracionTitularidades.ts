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
 *  · conservador: si no hay porcentaje ACREDITADO, se propone `null`
 *    (PENDIENTE). Nunca inventa un 50/50, un 33/33/34… ni un 100.
 *
 * H10 — IDENTIDAD ≠ PORCENTAJE.
 * Saber QUIÉN es titular no dice CUÁNTO posee. El planificador deduce
 * identidad de los campos de titularidad del inmueble, pero el porcentaje sólo
 * puede salir de una fuente explícita. En este modelo la ÚNICA fuente explícita
 * es `titularidades/{inmuebleId}__{propietarioId}.porcentajeTitularidad`:
 * ni `propietarioId`, ni `propietarioPrincipalId`, ni `propietarioSecundarioId`,
 * ni `titularesIds`, ni la ficha fiscal (`PropietarioFiscal` no tiene ningún
 * campo de cuota) acreditan participación alguna.
 *
 * En particular, que sólo se conozca UN titular NO acredita que posea el 100 %:
 * puede haber cotitulares aún no registrados. La cardinalidad del índice no es
 * evidencia patrimonial, y por descarte no se fabrica un 100.
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

/**
 * H10 §15 — ¿es un porcentaje EXPLÍCITO y utilizable? Sólo un número finito
 * dentro de [0, 100]. Rechaza `null`/`undefined` (pendiente), `NaN`,
 * `Infinity`, negativos, mayores de 100 y cualquier valor no numérico
 * (p. ej. la cadena `'100'` llegada de un documento antiguo). No normaliza:
 * un dato ilegible es un dato ausente.
 */
export function porcentajeExplicitoValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor <= 100;
}

/** Evidencia admisible para resolver un porcentaje de titularidad. */
export interface EvidenciaPorcentaje {
  /** Titularidad ya registrada para ese par (inmueble, propietario), si existe. */
  existente?: Titularidad | null;
}

/**
 * H10 §14 — Resuelve el porcentaje a partir de la EVIDENCIA, nunca del número
 * de titulares. Función pura: sin Firestore, sin red, sin efectos.
 *
 *   porcentaje explícito y válido → ese porcentaje
 *   ausencia, pendiente o dato inválido → null
 *
 * No completa el reparto restante: si A = 60 y de B no consta nada, B sigue
 * siendo `null` (no se deduce 40).
 */
export function resolverPorcentajeTitularidad(evidencia: EvidenciaPorcentaje): number | null {
  const declarado = evidencia.existente?.porcentajeTitularidad;
  return porcentajeExplicitoValido(declarado) ? declarado : null;
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

    const altas: AltaTitularidadPropuesta[] = [];
    for (const d of deducidos) {
      const existente = existentesPorId.get(d.propietarioId);
      // H10 — el porcentaje se RESUELVE por evidencia, no por cardinalidad.
      // Si la titularidad ya existe, manda su porcentaje acreditado; si no
      // existe, no hay evidencia posible y queda PENDIENTE (`null`).
      const declarado = existente?.porcentajeTitularidad;
      if (declarado !== undefined && declarado !== null && !porcentajeExplicitoValido(declarado)) {
        advertencias.push(
          `${inmueble.id}: la titularidad de ${d.propietarioId} guarda un porcentaje inválido (${String(declarado)}); se deja PENDIENTE y requiere revisión manual.`,
        );
      }
      const propuesta: AltaTitularidadPropuesta = {
        inmuebleId: inmueble.id,
        propietarioId: d.propietarioId,
        porcentaje: resolverPorcentajeTitularidad({ existente }),
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

    // H10 — se avisa SIEMPRE que un alta quede sin porcentaje acreditado,
    // también con un único titular: la identidad no acredita la cuota.
    const sinAcreditar = altas.filter((a) => a.porcentaje === null).length;
    if (sinAcreditar > 0) {
      advertencias.push(
        `${inmueble.id}: ${sinAcreditar} titularidad(es) sin porcentaje acreditado → quedan PENDIENTES (no se inventa el reparto).`,
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
