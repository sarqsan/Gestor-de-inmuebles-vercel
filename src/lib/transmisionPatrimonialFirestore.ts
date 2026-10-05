/**
 * PERSISTENCIA ATÓMICA DE LA TRANSMISIÓN PATRIMONIAL (K.2-B2 · H1)
 * ================================================================
 * Una ÚNICA `runTransaction` coordina todas las escrituras de la transmisión.
 * No se reutilizan `cerrarTitularidad()` ni `guardarTitularidad()` porque cada
 * una hace su propio commit y dejarían estados parciales; sí se reutilizan los
 * motores PUROS (`cerrarTitularidadEnMemoria`, `construirTitularidad`) a través
 * de `planificarTransmision`.
 *
 * POR QUÉ TRANSACCIÓN Y NO `writeBatch`
 * -------------------------------------
 *  1. `titularesIds` exige leer-componer-escribir: Firestore no admite
 *     `arrayRemove` + `arrayUnion` sobre el MISMO campo en una sola escritura,
 *     y componer desde una lectura externa reintroduce el lost-update.
 *  2. Las Rules de `titularidades` resuelven el ámbito con el `propietarioId`
 *     CANÓNICO del inmueble. Si se cambiara el canónico en una escritura previa
 *     e independiente, las escrituras siguientes sobre las titularidades se
 *     denegarían. Evaluadas como conjunto, el ámbito sigue siendo el de A.
 *
 * ORDEN OBLIGATORIO dentro de la transacción: TODAS las lecturas y después
 * todas las escrituras (requisito del SDK de Firestore).
 *
 * La auditoría se registra FUERA y DESPUÉS, sólo si la transacción confirmó.
 */
import { doc, runTransaction } from 'firebase/firestore';
import { db, registrarAuditoriaFirestore } from './firebase';
import { reportarErrorGuardado } from '../estadoDatos/canalIncidencias';
import type { Inmueble, Propietario, Titularidad } from '../types';
import { idTitularidad } from '../utils/titularidadesEngine';
import {
  detalleAuditoriaTransmision,
  planificarTransmision,
  type EntradaTransmision,
  type PlanTransmision,
} from './transmisionPatrimonial';

export const COLECCION_TITULARIDADES = 'titularidades';
export const COLECCION_INMUEBLES = 'inmuebles';
export const COLECCION_PROPIETARIOS = 'propietarios';

/** Datos mínimos que necesita la operación; `undefined` = el documento no existe. */
export interface ContextoTransmision {
  leerInmueble: (inmuebleId: string) => Promise<Inmueble | null>;
  leerPropietario: (propietarioId: string) => Promise<Propietario | null>;
  /** Titularidad concreta por su clave determinista. */
  leerTitularidad: (titularidadId: string) => Promise<Titularidad | null>;
  escribirInmueble: (inmuebleId: string, cambios: Record<string, unknown>) => void;
  escribirTitularidad: (titularidad: Titularidad) => void;
}

export interface PeticionTransmision {
  inmuebleId: string;
  /** Ficha del adquirente; debe EXISTIR. La transmisión no crea propietarios. */
  adquirenteId: string;
  motivo: EntradaTransmision['motivo'];
  detalle?: string;
  actor?: { id?: string; nombre?: string };
  /** ISO; por defecto el instante de la operación. */
  fecha?: string;
}

export interface ResultadoTransmision {
  ok: boolean;
  /** Mensaje exacto del motivo de rechazo o fallo (vacío si `ok`). */
  motivoFallo?: string;
  /** Plan efectivamente aplicado (sólo cuando `ok`). */
  plan?: PlanTransmision;
}

/** Firestore rechaza `undefined`: se omiten las claves sin valor. */
function sinUndefined(objeto: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    if (valor === undefined) continue;
    salida[clave] = valor;
  }
  return salida;
}

/**
 * NÚCLEO de la transmisión, independiente del SDK: recibe el contexto de
 * lecturas/escrituras de UNA transacción ya abierta. Lanza si alguna
 * precondición falla, de modo que la transacción aborta ANTES de escribir y el
 * estado previo queda íntegro.
 *
 * Secuencia: 3 lecturas → planificación pura → 2 ó 3 escrituras.
 */
export async function aplicarTransmisionEnTransaccion(
  peticion: PeticionTransmision,
  ctx: ContextoTransmision,
): Promise<PlanTransmision> {
  const inmuebleId = (peticion.inmuebleId || '').trim();
  const adquirenteId = (peticion.adquirenteId || '').trim();
  if (!inmuebleId) throw new Error('El inmueble no existe o no tiene identificador.');
  if (!adquirenteId) {
    throw new Error('El adquirente no existe: la transmisión no crea fichas de propietario.');
  }

  // ---------------------------- LECTURAS -----------------------------------
  const inmueble = await ctx.leerInmueble(inmuebleId);
  if (!inmueble) throw new Error('El inmueble no existe o no tiene identificador.');

  const adquirente = await ctx.leerPropietario(adquirenteId);
  if (!adquirente) {
    throw new Error('El adquirente no existe: la transmisión no crea fichas de propietario.');
  }

  const transmitenteId = (inmueble.propietarioId || '').trim();
  // La titularidad del transmitente se lee por su clave determinista. Sólo se
  // consulta si hay canónico: sin él, `planificarTransmision` ya rechaza.
  const titularidadTransmitente = transmitenteId
    ? await ctx.leerTitularidad(idTitularidad(inmuebleId, transmitenteId))
    : null;

  // -------------------------- PLANIFICACIÓN PURA ---------------------------
  // Valida precondiciones (incluido A === B y motivo admitido) y compone el
  // índice final. Lanza antes de cualquier escritura si algo no cuadra.
  const plan = planificarTransmision({
    inmueble,
    adquirente,
    titularidades: titularidadTransmitente ? [titularidadTransmitente] : [],
    motivo: peticion.motivo,
    detalle: peticion.detalle,
    actor: peticion.actor,
    fecha: peticion.fecha,
  });

  // ---------------------------- ESCRITURAS ---------------------------------
  // 1. Inmueble: canónico, principal fiscal, índice compuesto y snapshot fiscal.
  ctx.escribirInmueble(inmuebleId, sinUndefined({ ...plan.cambiosInmueble }));
  // 2. Titularidad del transmitente → CERRADA (nunca se borra). Sólo si existía.
  if (plan.titularidadCerrada) ctx.escribirTitularidad(plan.titularidadCerrada);
  // 3. Titularidad del adquirente → VIGENTE con porcentaje `null`.
  ctx.escribirTitularidad(plan.titularidadAdquirente);

  return plan;
}

/**
 * Transmite un inmueble del titular canónico actual al adquirente, de forma
 * ATÓMICA y con el histórico intacto.
 *
 * No conecta ninguna UI: es la operación de dominio. La auditoría
 * `INMUEBLE_TITULARIDAD_CAMBIO` (categoría ya existente, no se inventa otra) se
 * registra únicamente DESPUÉS de que la transacción haya confirmado.
 */
export async function transmitirInmuebleFirestore(
  peticion: PeticionTransmision,
  autor?: { usuarioId?: string; usuarioEmail?: string; usuarioNombre?: string },
): Promise<ResultadoTransmision> {
  try {
    const plan = await runTransaction(db, async (tx) => {
      const ctx: ContextoTransmision = {
        leerInmueble: async (id) => {
          const snap = await tx.get(doc(db, COLECCION_INMUEBLES, id));
          return snap.exists() ? ({ ...(snap.data() as Inmueble), id: snap.id }) : null;
        },
        leerPropietario: async (id) => {
          const snap = await tx.get(doc(db, COLECCION_PROPIETARIOS, id));
          return snap.exists() ? ({ ...(snap.data() as Propietario), id: snap.id }) : null;
        },
        leerTitularidad: async (id) => {
          const snap = await tx.get(doc(db, COLECCION_TITULARIDADES, id));
          return snap.exists() ? ({ ...(snap.data() as Titularidad), id: snap.id }) : null;
        },
        escribirInmueble: (id, cambios) => {
          tx.set(doc(db, COLECCION_INMUEBLES, id), cambios, { merge: true });
        },
        escribirTitularidad: (titularidad) => {
          tx.set(
            doc(db, COLECCION_TITULARIDADES, titularidad.id),
            sinUndefined({ ...titularidad }),
            { merge: true },
          );
        },
      };
      return aplicarTransmisionEnTransaccion(peticion, ctx);
    });

    // Auditoría SÓLO tras el commit: una transmisión fallida no se registra.
    void registrarAuditoriaFirestore({
      usuarioId: autor?.usuarioId || peticion.actor?.id || 'system',
      usuarioEmail: autor?.usuarioEmail || 'sistema',
      usuarioNombre: autor?.usuarioNombre || peticion.actor?.nombre || 'sistema',
      accion: 'INMUEBLE_TITULARIDAD_CAMBIO',
      descripcion: `Transmisión patrimonial del inmueble ${peticion.inmuebleId}: ${plan.transmitenteId} → ${plan.adquirenteId} (${peticion.motivo})`,
      entidadAfectada: 'inmueble',
      idAfectado: peticion.inmuebleId,
      resultado: 'EXITO',
      detalles: detalleAuditoriaTransmision(plan, peticion.motivo),
    });

    return { ok: true, plan };
  } catch (err) {
    reportarErrorGuardado('titularidades', err, 'Error transmitiendo el inmueble:');
    return { ok: false, motivoFallo: err instanceof Error ? err.message : 'Transmisión no completada.' };
  }
}
