/**
 * AUTORIZACIÓN DE ESCRITURA POR INMUEBLE — ESPEJO CLIENTE DE LAS RULES
 * ====================================================================
 * La baja patrimonial es un `update` de `inmuebles/{id}` (nunca un `delete`),
 * así que sólo puede ofrecerse a quien las reglas ya autorizan a ESCRIBIR ese
 * inmueble. Este módulo reproduce, rama por rama, las condiciones de escritura
 * de `firestore.rules` (§1 `match /inmuebles/{inmuebleId}`, `allow update`):
 *
 *   1. `isMasterAdmin()`               → email verificado del Administrador Principal;
 *   2. titular: `soyTitularActual()`    → `propietarioId` / `propietarioPrincipalId`;
 *   3. `canReachInmuebleId()`           → `inmuebleIds` del espejo (autorización explícita);
 *   4. `inmuebleEnCarteraEscritura()`   → carterasE (ACTIVA + LECTURA_ESCRITURA + responsableActual GESTOR);
 *   5. `inmuebleParcialIndexado(…,true)`→ delegación parcial ACTIVA con escritura.
 *
 * NO es un sistema de permisos nuevo ni la autoridad: la autoridad siguen siendo
 * las Rules, que revalidan en cada escritura. Es la proyección que evita ofrecer
 * una acción imposible (el fallo original: la UI mostraba "Eliminar" a usuarios
 * sin ninguna autorización de escritura). Un usuario de SÓLO LECTURA no puede
 * dar de baja: aquí devuelve `false` y en Firestore el `update` se deniega.
 *
 * Módulo PURO: sin Firebase, sin E/S.
 */
import type { Inmueble } from '../types';
import { inmuebleDadoDeBaja } from './cicloPatrimonialEngine';

export interface AmbitoEscrituraInmuebles {
  /** `tipoPerfil` del usuario autenticado, tal y como lo aporta el espejo de identidad. */
  tipoPerfil?: string | null;
  /** Administrador Principal: mismo criterio que `isMasterAdmin()` (email del token). */
  esMaster: boolean;
  /** `propietarioId` del espejo de identidad. */
  propietarioId?: string | null;
  /** `inmuebleIds` del espejo: autorización explícita (`canReachInmuebleId`). */
  inmuebleIdsAutorizados?: readonly string[];
  /** Propietarios con cartera de ESCRITURA (`carterasE`). */
  propietariosGestionadosEscritura?: readonly string[];
  /** Inmuebles con delegación parcial ACTIVA y permiso de escritura. */
  inmueblesParcialesEscritura?: readonly string[];
}

const limpio = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

/** ¿El usuario tiene autorización de escritura vigente sobre este inmueble? */
export function tieneEscrituraInmueble(
  ambito: AmbitoEscrituraInmuebles | null | undefined,
  inmueble: Inmueble | null | undefined,
): boolean {
  if (!ambito || !inmueble?.id) return false;
  // 1. Administrador Principal (sólo el master; el perfil ADMINISTRADOR es de
  //    lectura sobre inmuebles por decisión D2a/D3 — no se amplía aquí).
  if (ambito.esMaster) return true;

  const esPropietario = ambito.tipoPerfil === 'PROPIETARIO';
  const propietario = limpio(inmueble.propietarioId);
  const principal = limpio(inmueble.propietarioPrincipalId);
  const mio = limpio(ambito.propietarioId);

  // 2. Titularidad jurídica (titular o copropietario principal).
  if (esPropietario && mio && (propietario === mio || principal === mio)) return true;

  // 3. Autorización explícita por `inmuebleIds` del espejo.
  if (esPropietario && (ambito.inmuebleIdsAutorizados || []).includes(inmueble.id)) return true;

  // 4. Cartera gestionada con permiso de escritura (proyección D1R).
  if (propietario && (ambito.propietariosGestionadosEscritura || []).includes(propietario)) return true;

  // 5. Delegación parcial ACTIVA con escritura.
  if ((ambito.inmueblesParcialesEscritura || []).includes(inmueble.id)) return true;

  return false;
}

/**
 * ¿Puede este usuario dar de baja el inmueble?
 * Exige autorización de escritura y que el inmueble siga operativo: repetir la
 * baja de un inmueble ya vendido/dado de baja no aporta nada (su histórico y su
 * registro de baja ya están conservados).
 */
export function puedeDarDeBajaInmueble(
  ambito: AmbitoEscrituraInmuebles | null | undefined,
  inmueble: Inmueble | null | undefined,
): boolean {
  if (!inmueble || inmuebleDadoDeBaja(inmueble)) return false;
  return tieneEscrituraInmueble(ambito, inmueble);
}
