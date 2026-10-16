/**
 * GAP 1 / FASE A — FUENTE DE PERFIL VERAZ PARA EL ENDPOINT DE NOTIFICACIONES
 * ==========================================================================
 * Cierra el cableado del hallazgo A16-03: el endpoint
 * `/api/notificaciones/enviar` deja de resolver la autorización con
 * dependencias `undefined` y pasa a:
 *
 *   1. verificar el ID token de Firebase (proyecto de la app) en el servidor; y
 *   2. resolver el perfil REAL del usuario desde `usuarios/{...}` por `authUid`,
 *      exigiendo `estado == 'ACTIVO'` (deny-by-default).
 *
 * El servidor NUNCA confía en `perfil`, `propietarioId` ni `inmuebleIds`
 * enviados por el cliente: se derivan aquí a partir del UID verificado.
 */
import type { FuentePerfilUsuario, InfoUsuarioResuelta } from '../../src/notificaciones/autorizacion.js';

/** Puerto de lectura mínimo (lo cumple `ClienteFirestoreRest`). */
export interface PuertoLecturaUsuarios {
  consultarIgualdadesOrden(
    coleccion: string,
    consulta: {
      igualdades?: Array<[campo: string, valor: string]>;
      orden?: { campo: string; direccion: 'ASCENDING' | 'DESCENDING' };
      limite: number;
    },
  ): Promise<Array<{ id: string; datos: Record<string, unknown> }>>;
}

export const COLECCION_USUARIOS = 'usuarios';

/** Perfiles que pueden disparar notificaciones (el inquilino no: deny-by-default). */
export function perfilDeTipoPerfil(tipoPerfil: unknown): InfoUsuarioResuelta['perfil'] {
  const tipo = String(tipoPerfil || '').trim().toUpperCase();
  if (tipo === 'ADMINISTRADOR') return 'ADMINISTRADOR';
  if (tipo === 'PROPIETARIO') return 'PROPIETARIO';
  if (tipo === 'PROFESIONAL') return 'PROFESIONAL';
  return null;
}

export function crearFuentePerfilFirestore(puerto: PuertoLecturaUsuarios): FuentePerfilUsuario {
  return {
    async resolver(uid: string): Promise<InfoUsuarioResuelta | null> {
      const filas = await puerto.consultarIgualdadesOrden(COLECCION_USUARIOS, {
        igualdades: [['authUid', uid]],
        limite: 2,
      });
      const activo = filas.find((fila) => String(fila.datos?.estado || '').toUpperCase() === 'ACTIVO');
      if (!activo) return null;
      const perfil = perfilDeTipoPerfil(activo.datos?.tipoPerfil);
      if (!perfil) return null;

      const propietarioId = typeof activo.datos?.propietarioId === 'string' && activo.datos.propietarioId
        ? activo.datos.propietarioId
        : undefined;
      const profesionalId = typeof activo.datos?.profesionalId === 'string' && activo.datos.profesionalId
        ? activo.datos.profesionalId
        : undefined;
      const inmuebleIds = Array.isArray(activo.datos?.inmuebleIds)
        ? (activo.datos.inmuebleIds as unknown[]).filter((v): v is string => typeof v === 'string' && v.length > 0)
        : [];

      return {
        uid,
        perfil,
        ...(propietarioId ? { propietarioId } : {}),
        ...(profesionalId ? { profesionalId } : {}),
        ...(inmuebleIds.length ? { inmuebleIds } : {}),
      };
    },
  };
}
