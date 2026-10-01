/**
 * BAJA PATRIMONIAL DEL INMUEBLE — ADAPTADOR FIRESTORE
 * ===================================================
 * Sustituye al antiguo borrado físico (`deleteInmuebleFirestore` →
 * `deleteDoc(doc(db, 'inmuebles', id))`, eliminado de `src/lib/firebase.ts`).
 *
 * Contrato de la operación (el que hace imposible el bug de producción):
 *  1. El inmueble se ACTUALIZA (`updateDoc`), nunca se borra: el parche lo
 *     calcula el motor existente `darDeBajaInmueble()` (`VENDIDO`/`BAJA`,
 *     `SIN_EXPLOTACION`, registro `bajaPatrimonial` e `historialBajas`).
 *  2. Si el `update` falla (p. ej. `permission-denied`), se devuelve `ok: false`
 *     SIN tocar nada más: es el llamador quien conserva el inmueble en la UI.
 *  3. Sólo tras persistir la baja se retira la publicación: los registros de
 *     `sindicacion_inmuebles` del inmueble pasan a `DESPUBLICADO` mediante la
 *     vía canónica del dominio de sindicación (`actualizarEstadoSindicacion`),
 *     que CONSERVA el registro, su versión y su huella (`retirar ≠ borrar`).
 *  4. La ficha pública (`fichas_publicas_inmueble`) NO se borra: se conserva
 *     como espejo del inmueble, conforme al modelo patrimonial.
 *
 * La autorización es la ya existente: la baja es un `update` y las Rules
 * revalidan al usuario (master, titular, cartera con escritura, delegación
 * parcial con escritura). NO se amplía `allow delete` de `/inmuebles`.
 *
 * Las dependencias de E/S son inyectables para poder probar el contrato sin
 * red ni emulador (mismo patrón que `patrimonialPersistenciaFirebase`).
 */
import { doc, updateDoc } from 'firebase/firestore';
import { db, deepCleanForFirestore } from './firebase';
import { propietarioEfectivoInmueble } from './fichaPublicaInmueble';
import { crearRepositorioEstadoSindicacionFirestore } from './sindicacionFirestore';
import { actualizarEstadoSindicacion, type RegistroEstadoSindicacion } from '../sindicacion/estadoRepositorio';
import { reportarErrorGuardado } from '../estadoDatos/canalIncidencias';
import { normalizarErrorFirestore, mensajeErrorOperacion } from '../utils/erroresFirestore';
import { darDeBajaInmueble, type SolicitudBaja } from '../utils/cicloPatrimonialEngine';
import { registrosARetirarPorBaja } from '../utils/bajaPatrimonialInmueble';
import type { Inmueble, PortalInmobiliario } from '../types';

export interface ActorBajaPatrimonial {
  id?: string;
  nombre?: string;
  email?: string;
}

/** Puertos de E/S de la baja (inyectables en tests). */
export interface DepsBajaPatrimonialInmueble {
  /** Persiste el parche en `inmuebles/{id}`. En producción: `updateDoc`. */
  actualizarInmueble(inmuebleId: string, parche: Partial<Inmueble>): Promise<void>;
  /** Estados de publicación del inmueble (`sindicacion_inmuebles`). */
  listarPublicaciones(inmuebleId: string): Promise<RegistroEstadoSindicacion[]>;
  /** Retira UNA publicación dejando el registro con su histórico (`DESPUBLICADO`). */
  retirarPublicacion(args: { inmuebleId: string; registro: RegistroEstadoSindicacion; fecha: string }): Promise<void>;
}

export interface PublicacionRetiradaInfo {
  /** true ⇒ al menos una publicación pasó a `DESPUBLICADO`. */
  retirada: boolean;
  portales: PortalInmobiliario[];
  /** Motivo legible cuando la retirada no se pudo completar (la baja sí). */
  aviso: string | null;
}

export interface ResultadoBajaInmuebleFirestore {
  ok: boolean;
  errores: string[];
  /**
   * Parche EXACTAMENTE como se persistió (sin `undefined`). Es lo único que la
   * UI puede aplicar al estado: lo que se ve es lo que quedó en Firestore.
   */
  parche?: Partial<Inmueble>;
  publicacion: PublicacionRetiradaInfo;
  /** `true` cuando el rechazo es de permisos (reglas), para el mensaje al usuario. */
  errorPermisos?: boolean;
  error?: unknown;
}

const SIN_PUBLICACION: PublicacionRetiradaInfo = { retirada: false, portales: [], aviso: null };

/**
 * Implementación Firestore de los puertos: `updateDoc` del inmueble y la vía
 * canónica de sindicación para retirar la publicación.
 */
export function crearDepsBajaPatrimonialFirestore(
  inmueble: Inmueble,
  actor?: ActorBajaPatrimonial | null,
): DepsBajaPatrimonialInmueble {
  const puertoSindicacion = (fecha?: string) => {
    const repo = crearRepositorioEstadoSindicacionFirestore({
      propietarioId: propietarioEfectivoInmueble(inmueble) || undefined,
      actor: actor || null,
      suscripcion: false,
    });
    return { repo, ctx: { puerto: repo, fecha: fecha || new Date().toISOString(), actor: actor || null } };
  };
  return {
    async actualizarInmueble(inmuebleId, parche) {
      await updateDoc(doc(db, 'inmuebles', inmuebleId), parche);
    },
    async listarPublicaciones(inmuebleId) {
      return puertoSindicacion().repo.listarEstados(inmuebleId);
    },
    async retirarPublicacion({ inmuebleId, registro, fecha }) {
      const { ctx } = puertoSindicacion(fecha);
      // Retirada LOCAL del estado de publicación (sin envío a portal): el
      // registro permanece con su versión/huella y `ultimaOperacion: 'retirar'`.
      await actualizarEstadoSindicacion(
        {
          inmuebleId,
          portal: registro.portal,
          estado: 'DESPUBLICADO',
          operacion: 'retirar',
          resultado: 'OK',
        },
        ctx,
      );
    },
  };
}

/**
 * Da de baja un inmueble: cambio de estado patrimonial + retirada de la
 * publicación. NO borra el inmueble ni su ficha pública ni las titularidades.
 */
export async function darDeBajaInmuebleFirestore(
  inmueble: Inmueble,
  solicitud: SolicitudBaja,
  opciones: { deps?: DepsBajaPatrimonialInmueble; actor?: ActorBajaPatrimonial | null } = {},
): Promise<ResultadoBajaInmuebleFirestore> {
  // 1. Motor patrimonial existente (puro): valida y calcula el parche. Si no es
  //    válido, no se escribe NADA.
  const plan = darDeBajaInmueble(inmueble, solicitud);
  if (!plan.ok || !plan.parche) {
    return { ok: false, errores: plan.errores.length > 0 ? plan.errores : ['No se pudo calcular la baja.'], publicacion: SIN_PUBLICACION };
  }

  const parche = deepCleanForFirestore({ ...plan.parche }) as Partial<Inmueble>;
  const deps = opciones.deps ?? crearDepsBajaPatrimonialFirestore(inmueble, opciones.actor);

  // 2. Persistencia del cambio de estado (update, jamás delete).
  try {
    await deps.actualizarInmueble(inmueble.id, parche);
  } catch (error) {
    reportarErrorGuardado('inmuebles', error, 'Error dando de baja el inmueble en Firestore:');
    const normalizado = normalizarErrorFirestore(error);
    return {
      ok: false,
      errores: [mensajeErrorOperacion(error, 'No se pudo dar de baja el inmueble.')],
      publicacion: SIN_PUBLICACION,
      errorPermisos: normalizado.esPermisos,
      error,
    };
  }

  // 3. Retirada de la publicación (mejor esfuerzo: la baja ya está persistida y
  //    jamás se deshace por un fallo al retirar la publicación).
  return { ok: true, errores: [], parche, publicacion: await retirarPublicaciones(deps, inmueble, solicitud) };
}

async function retirarPublicaciones(
  deps: DepsBajaPatrimonialInmueble,
  inmueble: Inmueble,
  solicitud: SolicitudBaja,
): Promise<PublicacionRetiradaInfo> {
  const portales: PortalInmobiliario[] = [];
  try {
    const registros = await deps.listarPublicaciones(inmueble.id);
    for (const registro of registrosARetirarPorBaja(registros, inmueble.id)) {
      await deps.retirarPublicacion({ inmuebleId: inmueble.id, registro, fecha: solicitud.fecha });
      portales.push(registro.portal);
    }
    return { retirada: portales.length > 0, portales, aviso: null };
  } catch (error) {
    console.warn('La baja se registró, pero no se pudo retirar la publicación:', error);
    return {
      retirada: portales.length > 0,
      portales,
      aviso:
        'La baja quedó registrada, pero la retirada de la publicación no se pudo completar. Revísala en «Publicación».',
    };
  }
}
