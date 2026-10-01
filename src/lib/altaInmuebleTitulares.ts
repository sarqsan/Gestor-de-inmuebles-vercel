/**
 * ALTA DE INMUEBLE CON TITULARES EXISTENTES (N-TITULARES)
 * ========================================================
 * El alta de un inmueble NO crea propietarios ni titulares: trabaja siempre con
 * titulares que YA EXISTEN como entidad independiente (`propietarios/{id}`).
 *
 *  · Un titular puede estar en N inmuebles y un inmueble tener N titulares
 *    (A → inmuebles 1, 2, 3; B → 1, 4): la relación vive en
 *    `titularidades/{inmuebleId}__{propietarioId}` + el índice
 *    `inmuebles.titularesIds[]`, nunca duplicando a la persona.
 *  · Si el titular no existe, el alta NO abre ningún subproceso: indica que se
 *    cree primero (Propietarios/Titulares) y que después se asigne al inmueble.
 *  · Los porcentajes NO se tocan ni se inventan: la titularidad nace PENDIENTE
 *    (`null`) y se declara después en el panel de titularidades.
 *
 * Módulo PURO: no importa Firebase. La persistencia se inyecta (`guardar`),
 * de modo que App usa `guardarTitularidad` (lote atómico titularidad + índice) y
 * las pruebas usan un doble.
 */
import type { Propietario, PropietarioFiscal } from '../types';
import type { AltaTitularidad } from '../utils/titularidadesEngine';

/** Aviso exacto que muestra el alta cuando el titular que se busca no existe. */
export const MENSAJE_TITULAR_INEXISTENTE =
  'Este titular todavía no existe. Créalo desde Propietarios/Titulares y después asígnalo a este inmueble.';

/** Titulares elegidos en el alta (todos existentes). El principal va primero. */
export interface TitularesAltaInmueble {
  /** Principal primero; después el resto en el orden en que se eligieron. Sin duplicados. */
  titularesIds: string[];
}

/**
 * Resuelve los titulares del alta a partir de lo elegido en el formulario.
 *
 * Reglas:
 *  · sólo cuentan titulares que EXISTEN en `existentes` (un id obsoleto o
 *    inventado se descarta: el alta no crea a nadie);
 *  · sin titular principal no hay titulares adicionales (la titularidad
 *    económica siempre tiene un principal);
 *  · el principal nunca se repite como adicional;
 *  · sin principal válido devuelve `undefined` (alta sin titularidad N-TITULARES,
 *    como hasta ahora cuando se asigna a mano).
 */
export function resolverTitularesAlta(entrada: {
  principalId?: string;
  adicionalesIds?: readonly string[];
  existentes: readonly Pick<Propietario, 'id'>[];
}): TitularesAltaInmueble | undefined {
  const existen = new Set((entrada.existentes || []).map((p) => p.id));
  const principal = (entrada.principalId || '').trim();
  if (!principal || !existen.has(principal)) return undefined;

  const ids: string[] = [principal];
  for (const bruto of entrada.adicionalesIds || []) {
    const id = (bruto || '').trim();
    if (!id || !existen.has(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  return { titularesIds: ids };
}

/** Tipos de propietario que se tratan como persona jurídica (mismo criterio que `contratoEngine`). */
export function esPersonaJuridicaPropietario(propietario: Pick<Propietario, 'tipoPropietario'>): boolean {
  return propietario.tipoPropietario === 'persona_juridica' || propietario.tipoPropietario === 'comunidad_bienes';
}

/**
 * Instantánea fiscal de un titular EXISTENTE, para los campos heredados
 * (`datosFiscales.segundoPropietario`) que aún consumen contratos e informes
 * cuando el propietario no ve a los demás titulares. Se DERIVA de la entidad
 * (nunca se teclea): no inventa ni duplica datos fiscales por su cuenta.
 */
export function fiscalDesdePropietario(propietario: Propietario): PropietarioFiscal {
  return {
    nombre: propietario.nombre,
    nifDni: propietario.nifCif,
    direccion: `${propietario.direccion}${propietario.ciudad ? `, ${propietario.ciudad}` : ''}`,
    telefono: propietario.telefono || undefined,
    email: propietario.email || undefined,
    esPersonaJuridica: esPersonaJuridicaPropietario(propietario),
    propietarioId: propietario.id,
  };
}

export interface ResultadoAsignacionTitulares {
  /** Titulares cuya titularidad (y su índice) quedó persistida. */
  asignados: string[];
  /** Titulares cuya persistencia NO se confirmó (no se presentan como asignados). */
  fallidos: string[];
}

/**
 * Persiste la titularidad de cada titular elegido sobre el inmueble RECIÉN
 * CREADO. Debe llamarse DESPUÉS de que el inmueble exista en Firestore: las
 * Rules de `titularidades` comprueban el ámbito sobre el inmueble ya guardado.
 *
 * Cada alta es ATÓMICA (titularidad + índice `titularesIds` en un mismo lote), de
 * modo que el índice nunca apunta a una titularidad inexistente. Un fallo en un
 * titular no impide intentar los demás y queda reflejado en `fallidos`; la capa
 * de datos ya informa del error por el canal de incidencias.
 */
export async function asignarTitularesAlta(entrada: {
  inmuebleId: string;
  titularesIds: readonly string[];
  nombres?: Readonly<Record<string, string>>;
  actor?: { id?: string; nombre?: string };
  guardar: (alta: AltaTitularidad) => Promise<boolean>;
}): Promise<ResultadoAsignacionTitulares> {
  const resultado: ResultadoAsignacionTitulares = { asignados: [], fallidos: [] };
  const vistos = new Set<string>();
  for (const propietarioId of entrada.titularesIds) {
    if (!propietarioId || vistos.has(propietarioId)) continue;
    vistos.add(propietarioId);
    let ok = false;
    try {
      ok = await entrada.guardar({
        inmuebleId: entrada.inmuebleId,
        propietarioId,
        propietarioNombre: entrada.nombres?.[propietarioId],
        // PENDIENTE: nunca se asume un porcentaje (ni 100 ni 50/50) en el alta.
        porcentaje: null,
        actor: entrada.actor,
      });
    } catch {
      ok = false;
    }
    (ok ? resultado.asignados : resultado.fallidos).push(propietarioId);
  }
  return resultado;
}
