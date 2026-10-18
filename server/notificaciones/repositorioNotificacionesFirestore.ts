/**
 * GAP 1 (FASE 6) — REPOSITORIO DURADERO DE NOTIFICACIONES EN FIRESTORE
 * ====================================================================
 * Sustituye al `Map` en memoria del servidor: la notificación deja de perderse
 * al reiniciar el proceso y el ESTADO REAL DE ENTREGA (estado, intentos,
 * proveedor, id externo y error) queda registrado de forma duradera.
 *
 * Colecciones (SOLO servidor: no hay reglas de cliente que las expongan):
 *   · `notificaciones/{idDeterminista}`        — documento canónico GAP 1.
 *   · `notificaciones_entregas/{idDeIntento}`  — registro append-only por
 *     intento de entrega (id determinista ⇒ repetir el mismo intento no duplica).
 *
 * El id determinista (`idDeNotificacion(idempotencyKey)`) es lo que hace que la
 * búsqueda por idempotencia no necesite consultas: mismo evento ⇒ mismo id.
 */
import type { Notificacion } from '../../src/types/notificaciones.js';
import { idDeNotificacion } from '../../src/types/notificaciones.js';
import type { RepositorioNotificaciones } from '../../src/notificaciones/dispatcher.js';

export const COLECCION_NOTIFICACIONES = 'notificaciones';
export const COLECCION_ENTREGAS_NOTIFICACIONES = 'notificaciones_entregas';

export interface PuertoNotificacionesFirestore {
  leerDocumento(ruta: string): Promise<{ datos: Record<string, unknown>; updateTime?: string } | null>;
  crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarCampos(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void>;
}

export interface RegistroEntregasNotificaciones {
  registrar(notificacion: Notificacion, detalle: { estado: string; intentos: number }): Promise<void>;
}

/** Id determinista del intento: repetir el mismo intento no duplica la fila. */
export function idDeIntentoEntrega(notificacion: Notificacion): string {
  const sufijo = notificacion.intentos > 0 ? String(notificacion.intentos) : 'inicial';
  return `${notificacion.id}__${sufijo}__${notificacion.estado.toLowerCase()}`;
}

export function crearRegistroEntregasNotificaciones(
  puerto: PuertoNotificacionesFirestore,
): RegistroEntregasNotificaciones {
  return {
    async registrar(notificacion, detalle) {
      await puerto.crearDocumento(COLECCION_ENTREGAS_NOTIFICACIONES, idDeIntentoEntrega(notificacion), {
        notificacionId: notificacion.id,
        idempotencyKey: notificacion.idempotencyKey,
        origen: notificacion.origen,
        tipo: notificacion.tipo,
        entidadId: notificacion.entidadId,
        canal: notificacion.canal,
        estado: detalle.estado,
        intentos: detalle.intentos,
        ...(notificacion.provider ? { provider: notificacion.provider } : {}),
        ...(notificacion.externalId ? { externalId: notificacion.externalId } : {}),
        ...(notificacion.error ? { error: notificacion.error.slice(0, 200) } : {}),
        registradoEn: new Date().toISOString(),
      });
    },
  };
}

/**
 * Repositorio canónico. `buscarPorIdempotencia` se resuelve por id determinista:
 * la misma clave de evento apunta SIEMPRE al mismo documento, así que el
 * anti-duplicado del dispatcher funciona sin consultas ni índices.
 */
export function crearRepositorioNotificacionesFirestore(
  puerto: PuertoNotificacionesFirestore,
  registro: RegistroEntregasNotificaciones = crearRegistroEntregasNotificaciones(puerto),
): RepositorioNotificaciones {
  async function leerNotificacion(id: string): Promise<Notificacion | null> {
    const doc = await puerto.leerDocumento(`${COLECCION_NOTIFICACIONES}/${id}`);
    if (!doc) return null;
    const datos = doc.datos as unknown as Notificacion;
    return datos && typeof datos.id === 'string' ? datos : null;
  }

  return {
    async buscarPorId(id) {
      return leerNotificacion(id);
    },

    async buscarPorIdempotencia(idempotencyKey) {
      return leerNotificacion(idDeNotificacion(idempotencyKey));
    },

    async reclamarIntento(notificacion) {
      const creado = await puerto.crearDocumento(
        COLECCION_ENTREGAS_NOTIFICACIONES,
        idDeIntentoEntrega(notificacion),
        {
          notificacionId: notificacion.id,
          idempotencyKey: notificacion.idempotencyKey,
          origen: notificacion.origen,
          tipo: notificacion.tipo,
          entidadId: notificacion.entidadId,
          canal: notificacion.canal,
          estado: 'ENVIANDO',
          intentos: notificacion.intentos,
          registradoEn: new Date().toISOString(),
        },
      );
      return creado === 'CREADO';
    },

    async guardar(notificacion) {
      const creado = await puerto.crearDocumento(COLECCION_NOTIFICACIONES, notificacion.id, { ...notificacion });
      if (creado === 'YA_EXISTE') {
        await puerto.actualizarCampos(COLECCION_NOTIFICACIONES, notificacion.id, {
          estado: notificacion.estado,
          intentos: notificacion.intentos,
          audit: notificacion.audit,
          ...(notificacion.enviadoEn ? { enviadoEn: notificacion.enviadoEn } : {}),
          ...(notificacion.provider ? { provider: notificacion.provider } : {}),
          ...(notificacion.externalId ? { externalId: notificacion.externalId } : {}),
          ...(notificacion.error ? { error: notificacion.error.slice(0, 200) } : {}),
        });
      }
      await registro.registrar(notificacion, { estado: notificacion.estado, intentos: notificacion.intentos });
    },
  };
}
