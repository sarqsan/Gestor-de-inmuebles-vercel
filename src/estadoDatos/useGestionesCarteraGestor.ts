/**
 * ROADMAP-04 — escucha de las gestiones donde ESTA persona es gestora.
 * ---------------------------------------------------------------------------
 * Extraído de `App.tsx` sin cambiar QUÉ se consulta (la consulta sigue siendo
 * `gestiones_cartera where gestorUsuarioId == <id de perfil>`) ni PARA QUIÉN
 * (PROPIETARIO y PROFESIONAL: un propietario puede ser además gestor, caso E del
 * modelo D1R). Se extrae para poder fijar con tests el único comportamiento que
 * se corrige aquí:
 *
 *  · «Reintentar lectura» (UX-2) vuelve a abrir ESTA escucha. Antes el contador
 *    de reintento no figuraba en sus dependencias: una escucha denegada (Firestore
 *    la cierra y no la reabre sola) no se podía reintentar, y el aviso
 *    «Lectura · Carteras» quedaba fijo aunque se pulsara el botón del propio aviso.
 *
 * La suscripción llega inyectada (`suscribir`): este módulo no importa Firebase.
 * Quien suscribe es responsable de informar del error por el canal de incidencias
 * y de la instrumentación (ver `subscribeGestionesCarteraGestor`).
 *
 * CAPACIDAD ADICIONAL (2026-10-01): este hook es el único consumidor de la
 * escucha de Carteras, una capacidad que AMPLÍA el ámbito del gestor pero que no
 * es carga de datos del Portal. Si la lectura se deniega, el estado NO se vacía
 * ni se degrada el resto de la aplicación: se conserva lo último entregado (si
 * lo hubo), la incidencia se registra con `alcance: 'CAPACIDAD'` y el aviso
 * específico ofrece reintentarla (el contador `intento` que recibe lo aporta el
 * host desde `useEstadoLecturas.intentoDeCapacidad`).
 */
import { useEffect, useState } from 'react';
import type { ContextoSuscripcionCarteras } from '../lib/diagnosticoCarteras';
import type { GestionCartera } from '../lib/gestionesCartera';
import type { UsuarioApp } from '../types';

/** Perfiles que pueden actuar como gestor (el administrador no consulta por esta vía). */
export const PERFILES_QUE_CONSULTAN_CARTERAS: readonly string[] = ['PROPIETARIO', 'PROFESIONAL'];

export type SuscribirGestionesCartera = (
  callback: (gestiones: GestionCartera[]) => void,
  gestorUsuarioId: string,
  contexto?: ContextoSuscripcionCarteras
) => () => void;

export function useGestionesCarteraGestor(
  usuario: Pick<UsuarioApp, 'id' | 'tipoPerfil' | 'roles'> | null | undefined,
  intento: number,
  suscribir: SuscribirGestionesCartera
): GestionCartera[] {
  const [gestiones, setGestiones] = useState<GestionCartera[]>([]);
  const id = usuario?.id;
  const tipoPerfil = usuario?.tipoPerfil;
  const roles = usuario?.roles;

  useEffect(() => {
    if (!id || !tipoPerfil || !PERFILES_QUE_CONSULTAN_CARTERAS.includes(tipoPerfil)) {
      setGestiones([]);
      return;
    }
    return suscribir(setGestiones, id, { tipoPerfil, roles: roles ?? [], intento });
    // `suscribir` es una referencia estable (función de módulo) y `roles` solo
    // alimenta la traza: ni uno ni otro deben reabrir la escucha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tipoPerfil, intento]);

  return gestiones;
}
