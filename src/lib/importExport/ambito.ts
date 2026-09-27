/**
 * Ámbito autorizado del importador/exportador. Capa PURA (sin I/O).
 *
 * Deriva `AmbitoAutorizado` desde `UsuarioApp` + gestiones reutilizando la
 * ÚNICA derivación autorizada D3 (`proyectarCarterasGestionadas`).
 * El cliente solo acota consultas: la autorización efectiva está en Rules.
 */
import type { UsuarioApp } from '../../types';
import type { GestionCartera } from '../gestionesCartera';
import { proyectarCarterasGestionadas } from '../carterasGestion';
import type { AmbitoAutorizado } from './contrato';

export function ambitoAutorizadoDesdeUsuario(
  usuario: UsuarioApp | null | undefined,
  gestiones: readonly GestionCartera[],
): AmbitoAutorizado {
  if (!usuario) return { propietarioIdsLegibles: [], propietarioIdsEscribibles: [], esMaster: false };
  if (usuario.tipoPerfil === 'ADMINISTRADOR') {
    return { propietarioIdsLegibles: null, propietarioIdsEscribibles: null, esMaster: true };
  }
  const espejoL = usuario.carterasL ?? [];
  const espejoE = usuario.carterasE ?? [];
  const proyectadas = proyectarCarterasGestionadas(gestiones, usuario.id);
  const legibles = new Set([...espejoL, ...proyectadas.carterasL]);
  const escribibles = new Set([...espejoE, ...proyectadas.carterasE]);
  if (usuario.propietarioId) {
    legibles.add(usuario.propietarioId);
    escribibles.add(usuario.propietarioId);
  }
  return {
    propietarioIdsLegibles: [...legibles].sort(),
    propietarioIdsEscribibles: [...escribibles].sort(),
    esMaster: false,
  };
}
