/** ROADMAP-02: pure workflow orchestration around existing identity/access services.
 * Authentication and Firestore are not atomic; errors preserve Auth and expose a
 * retry path that is safe because the invitation consumption is idempotent by UID.
 */
import type { EnlaceRegistro, UsuarioApp } from '../types';
import { validarActivacionPendiente, validarInvitacionPropietario } from './accesoPropietarios';
import { estadoAccesoPersona, type Persona } from './personas';
import { proyectarCarterasGestionadas } from './carterasGestion';
import type { GestionCartera } from './gestionesCartera';

export type PasoOnboarding = 'CUENTA' | 'PERSONA' | 'PROPIETARIO' | 'INVITACION' | 'ACCESO';
export interface EstadoOnboardingR02 {
  pasos: Record<PasoOnboarding, 'PENDIENTE' | 'COMPLETO' | 'RECUPERABLE'>;
  siguiente: PasoOnboarding | 'FINALIZADO';
  authUid?: string;
  personaId?: string;
  propietarioIds: string[];
  aviso?: string;
}

/** Resume hechos persistidos sin inferir permisos desde rol o modalidad. */
export function resumirOnboardingR02(p: {
  usuario?: UsuarioApp | null;
  persona?: Persona | null;
  propietarios?: { id: string; personaId?: string }[];
  enlace?: EnlaceRegistro | null;
  gestiones?: GestionCartera[];
  errorFirestore?: string;
}): EstadoOnboardingR02 {
  const ownerIds = (p.persona?.propietarioIds ?? []).filter(id =>
    p.propietarios?.some(o => o.id === id && o.personaId === p.persona?.id));
  const proy = p.usuario?.id ? proyectarCarterasGestionadas(p.gestiones ?? [], p.usuario.id) : { carterasL: [], carterasE: [] };
  const pasos: EstadoOnboardingR02['pasos'] = {
    CUENTA: p.usuario?.authUid ? 'COMPLETO' : p.errorFirestore && p.usuario ? 'RECUPERABLE' : 'PENDIENTE',
    PERSONA: p.persona && p.usuario?.personaId === p.persona.id ? 'COMPLETO' : 'PENDIENTE',
    PROPIETARIO: ownerIds.length ? 'COMPLETO' : 'PENDIENTE',
    INVITACION: p.enlace?.estadoInvitacion === 'ACEPTADA' && p.enlace.usosActuales === 1 ? 'COMPLETO' : p.errorFirestore ? 'RECUPERABLE' : 'PENDIENTE',
    ACCESO: proy.carterasL.length ? 'COMPLETO' : 'PENDIENTE',
  };
  const siguiente = (['CUENTA', 'PERSONA', 'PROPIETARIO', 'INVITACION', 'ACCESO'] as PasoOnboarding[]).find(x => pasos[x] !== 'COMPLETO') ?? 'FINALIZADO';
  return { pasos, siguiente, authUid: p.usuario?.authUid, personaId: p.persona?.id, propietarioIds: ownerIds,
    aviso: p.errorFirestore ? `Autenticación conservada; Firestore pendiente de reintento: ${p.errorFirestore}` : undefined };
}

export function validarConsumoOnboardingR02(enlace: EnlaceRegistro, usuario: UsuarioApp, email: string, ahoraIso: string) {
  const invitacion = validarInvitacionPropietario(enlace, email, ahoraIso);
  const cuenta = validarActivacionPendiente(usuario, enlace, email);
  return { ok: invitacion.ok && cuenta.ok, errores: [...invitacion.errores, ...cuenta.errores] };
}

export function estadoPersonaParaOnboarding(persona: Persona, usuario?: UsuarioApp | null) {
  return estadoAccesoPersona(persona, usuario);
}

export function invitacionTerminalR02(enlace: EnlaceRegistro, ahoraMs: number): boolean {
  return enlace.estadoInvitacion === 'ACEPTADA' || enlace.estadoInvitacion === 'RECHAZADA' ||
    enlace.estadoInvitacion === 'REVOCADA' || (enlace.usosMaximos !== undefined && enlace.usosActuales >= enlace.usosMaximos) ||
    (typeof enlace.fechaCaducidadMs === 'number' && enlace.fechaCaducidadMs <= ahoraMs);
}
