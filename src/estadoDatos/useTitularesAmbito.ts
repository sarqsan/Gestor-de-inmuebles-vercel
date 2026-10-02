/**
 * FICHAS DE TITULAR DEL ÁMBITO DEL PROPIETARIO — escucha del host (PR #19).
 * ---------------------------------------------------------------------------
 * Un PROPIETARIO crea y mantiene tantas fichas de titular como necesite; cada una lleva
 * `ambitoPropietarioId == su propietarioId`. Este hook abre UNA escucha por igualdad de ese
 * campo (`subscribeTitularesAmbito`) y entrega la lista completa: sin tope, sin paginar, sin
 * contar. Lo único que la acota es el ámbito.
 *
 * Mismo patrón que `useGestionesCarteraGestor` (CAPACIDAD ADICIONAL):
 *  · la suscripción llega inyectada (`suscribir`): este módulo no importa Firebase;
 *  · quien suscribe informa del error por el canal de incidencias con `alcance: 'CAPACIDAD'`
 *    y origen `titulares_ambito`: un rechazo NO vacía el estado (se conserva lo último
 *    entregado), no marca error de carga del Portal ni bloquea la ficha propia;
 *  · «Reintentar lectura» del aviso propio incrementa `intento` y VUELVE A ABRIR esta escucha
 *    (el host lo aporta desde `useEstadoLecturas.intentoDeCapacidad('titulares_ambito')`).
 *
 * Solo el perfil PROPIETARIO tiene ámbito de titulares: el ADMINISTRADOR ya lee `propietarios`
 * completo por `subscribePropietarios` y el PROFESIONAL no accede a fichas de titular.
 */
import { useEffect, useState } from 'react';
import type { Propietario, UsuarioApp } from '../types';

export const PERFILES_CON_AMBITO_DE_TITULARES: readonly string[] = ['PROPIETARIO'];

export type SuscribirTitularesAmbito = (
  callback: (titulares: Propietario[]) => void,
  propietarioId?: string
) => () => void;

export function useTitularesAmbito(
  usuario: Pick<UsuarioApp, 'tipoPerfil' | 'propietarioId'> | null | undefined,
  intento: number,
  suscribir: SuscribirTitularesAmbito
): Propietario[] {
  const [titulares, setTitulares] = useState<Propietario[]>([]);
  const propietarioId = usuario?.propietarioId;
  const tipoPerfil = usuario?.tipoPerfil;

  useEffect(() => {
    if (!propietarioId || !tipoPerfil || !PERFILES_CON_AMBITO_DE_TITULARES.includes(tipoPerfil)) {
      setTitulares([]);
      return;
    }
    return suscribir(setTitulares, propietarioId);
    // `suscribir` es una referencia estable (función de módulo); solo el ámbito y el intento
    // de «Reintentar lectura» deben reabrir la escucha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propietarioId, tipoPerfil, intento]);

  return titulares;
}
