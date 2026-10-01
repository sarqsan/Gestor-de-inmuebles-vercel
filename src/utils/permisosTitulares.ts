/**
 * PERMISOS DE «PROPIETARIOS / TITULARES» — ESPEJO CLIENTE DE LAS RULES
 * ====================================================================
 * Decide QUÉ ofrece la sección de titulares a cada perfil, reproduciendo las
 * condiciones de `firestore.rules` → `match /propietarios/{propietarioId}`:
 *
 *   · `create`: el Administrador Principal (master, con auditoría) o el PROPIETARIO
 *     para (a) su propia ficha (`propietarioId == myPropId()`) y (b) CUALQUIER NÚMERO de
 *     fichas de titular dentro de SU ámbito (`ambitoPropietarioId == myPropId()`, id
 *     reservado `tit_<token>`). NO existe contador, tope ni cuota: la cantidad nunca es
 *     parte de la condición.
 *   · `update`: el master (todas), el PROPIETARIO sobre su ficha y sobre las fichas que ya
 *     están en su ámbito (ámbito e id inmutables) y el gestor con cartera de ESCRITURA
 *     solo sobre `fichaPatrimonial` (otra pantalla; no edita titulares).
 *   · `get`/`list`: master (todas) o fichas con SU ámbito (+ la propia). `delete`: nunca.
 *
 * ILIMITADO ≠ GLOBAL. Lo único que acota es la AUTORIZACIÓN: el ámbito. Un PROPIETARIO no ve ni
 * edita fichas de otro ámbito, ni lista `propietarios` entero.
 *
 * NO es un sistema de permisos nuevo ni la autoridad: la autoridad siguen siendo las
 * Rules, que revalidan cada escritura. Es la proyección que evita ofrecer una acción que
 * Firestore va a denegar y, a la vez, evita esconder la sección a quien sí puede gestionarla
 * (el fallo original: el PROPIETARIO no tenía ninguna entrada hacia Propietarios/Titulares).
 *
 * Módulo PURO: sin Firebase, sin E/S.
 */
import type { Propietario } from '../types';
import { fichaEnAmbito } from '../lib/titularesModelo';

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
  /**
   * Puede crear fichas NUEVAS. Para el PROPIETARIO es SIEMPRE `true` mientras tenga ámbito: no
   * depende de cuántas fichas haya creado ya (no hay contador ni tope en ninguna capa).
   */
  puedeCrear: boolean;
  /**
   * PROPIETARIO: ámbito de las fichas que crea (su `propietarioId`). Va en el campo
   * `ambitoPropietarioId` de cada ficha nueva; las Rules lo comparan con el espejo.
   */
  ambitoPropietarioId?: string;
  /** Fichas que puede editar. `undefined` = todas (master). */
  fichasEditablesIds?: string[];
  /** Id de la ficha PROPIA del titular (solo PROPIETARIO). Una alta propia usa ESTE id. */
  idFichaPropia?: string;
  /** Su ficha propia ya existe entre las fichas visibles (solo PROPIETARIO). */
  fichaPropiaExiste: boolean;
  /**
   * PROPIETARIO que todavía no tiene su ficha propia: puede crearla además de las de otros
   * titulares (el alta de inmueble exige que el titular económico sea su ficha propia).
   */
  puedeCrearFichaPropia: boolean;
}

const limpio = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

export function permisosTitulares(
  usuario: UsuarioParaTitulares | null | undefined,
  propietarios: readonly Pick<Propietario, 'id' | 'ambitoPropietarioId'>[],
  emailMaster: string,
): PermisosTitulares {
  const sinPermisos: PermisosTitulares = {
    esMaster: false,
    puedeGestionar: false,
    puedeCrear: false,
    fichaPropiaExiste: false,
    puedeCrearFichaPropia: false,
  };
  if (!usuario) return sinPermisos;

  // 1. Administrador Principal: administra todas las fichas.
  if (limpio(usuario.email).toLowerCase() === limpio(emailMaster).toLowerCase() && limpio(emailMaster) !== '') {
    return { esMaster: true, puedeGestionar: true, puedeCrear: true, fichaPropiaExiste: false, puedeCrearFichaPropia: false };
  }

  // 2. PROPIETARIO: su ficha + TODAS las fichas de titular de su ámbito, sin tope.
  if (usuario.tipoPerfil === 'PROPIETARIO') {
    const propio = limpio(usuario.propietarioId);
    if (!propio) return sinPermisos; // sin ámbito (propietarioId del espejo) no hay nada que gestionar
    const fichaPropiaExiste = propietarios.some((p) => p.id === propio);
    return {
      esMaster: false,
      puedeGestionar: true,
      // SIEMPRE: crear otro titular no depende de cuántos haya. Solo falta el ámbito (arriba).
      puedeCrear: true,
      ambitoPropietarioId: propio,
      fichasEditablesIds: [propio, ...propietarios.filter((p) => p.id !== propio && fichaEnAmbito(p, propio)).map((p) => p.id)],
      idFichaPropia: propio,
      fichaPropiaExiste,
      puedeCrearFichaPropia: !fichaPropiaExiste,
    };
  }

  // 3. Resto (ADMINISTRADOR no master, PROFESIONAL/gestor…): consulta.
  return sinPermisos;
}
