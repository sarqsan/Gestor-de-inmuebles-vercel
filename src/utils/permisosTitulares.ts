/**
 * PERMISOS DE «PROPIETARIOS / TITULARES» — ESPEJO CLIENTE DE LAS RULES
 * ====================================================================
 * Decide QUÉ ofrece la sección de titulares a cada perfil, reproduciendo las
 * condiciones de `firestore.rules` → `match /propietarios/{propietarioId}`:
 *
 *   · `create`: el Administrador Principal (master, con auditoría) o el PROPIETARIO
 *     **solo para su propia ficha** (`propietarioId == myPropId()`). Nadie más: ni el
 *     perfil ADMINISTRADOR no master, ni el gestor (S3), ni un PROPIETARIO para un
 *     tercero (p. ej. un cotitular).
 *   · `update`: el master (todas), el PROPIETARIO sobre su ficha y el gestor con cartera
 *     de ESCRITURA solo sobre `fichaPatrimonial` (otra pantalla; no edita titulares).
 *   · `list`: solo master. `delete`: nunca.
 *
 * NO es un sistema de permisos nuevo ni la autoridad: la autoridad siguen siendo las
 * Rules, que revalidan cada escritura. Es la proyección que evita ofrecer una acción que
 * Firestore va a denegar —por eso un PROPIETARIO ve «Crear titular» solo si todavía no
 * tiene ficha propia— y, a la vez, evita esconder la sección a quien sí puede gestionarla
 * (el fallo original: el PROPIETARIO no tenía ninguna entrada hacia Propietarios/Titulares).
 *
 * Módulo PURO: sin Firebase, sin E/S.
 */
import type { Propietario } from '../types';

export interface UsuarioParaTitulares {
  tipoPerfil?: string | null;
  email?: string | null;
  propietarioId?: string | null;
}

export interface PermisosTitulares {
  /** Es el Administrador Principal (mismo criterio que `isMasterAdmin()`: email). */
  esMaster: boolean;
  /** Puede crear o editar ALGUNA ficha (si no, la sección queda en consulta). */
  puedeGestionar: boolean;
  /** Puede crear fichas NUEVAS. */
  puedeCrear: boolean;
  /** Fichas que puede editar. `undefined` = todas (master). */
  fichasEditablesIds?: string[];
  /** Id de la ficha PROPIA del titular (solo PROPIETARIO). Una alta propia usa ESTE id. */
  idFichaPropia?: string;
  /** Su ficha propia ya existe entre las fichas visibles (solo PROPIETARIO). */
  fichaPropiaExiste: boolean;
}

const limpio = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

export function permisosTitulares(
  usuario: UsuarioParaTitulares | null | undefined,
  propietarios: readonly Pick<Propietario, 'id'>[],
  emailMaster: string,
): PermisosTitulares {
  const sinPermisos: PermisosTitulares = {
    esMaster: false,
    puedeGestionar: false,
    puedeCrear: false,
    fichaPropiaExiste: false,
  };
  if (!usuario) return sinPermisos;

  // 1. Administrador Principal: administra todas las fichas.
  if (limpio(usuario.email).toLowerCase() === limpio(emailMaster).toLowerCase() && limpio(emailMaster) !== '') {
    return { esMaster: true, puedeGestionar: true, puedeCrear: true, fichaPropiaExiste: false };
  }

  // 2. PROPIETARIO: crea/edita SOLO su ficha (id == propietarioId del espejo).
  if (usuario.tipoPerfil === 'PROPIETARIO') {
    const propio = limpio(usuario.propietarioId);
    if (!propio) return sinPermisos; // sin ficha vinculada no hay nada que gestionar
    const fichaPropiaExiste = propietarios.some((p) => p.id === propio);
    return {
      esMaster: false,
      puedeGestionar: true,
      // Solo puede CREAR su propia ficha si todavía no existe; nunca la de un tercero.
      puedeCrear: !fichaPropiaExiste,
      fichasEditablesIds: [propio],
      idFichaPropia: propio,
      fichaPropiaExiste,
    };
  }

  // 3. Resto (ADMINISTRADOR no master, PROFESIONAL/gestor…): consulta.
  return sinPermisos;
}
