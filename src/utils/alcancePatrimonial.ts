/**
 * ÁMBITO PATRIMONIAL — TITULARIDAD Y AISLAMIENTO
 * ==============================================
 * BLOQUE 1 — Portal Propietario: aislamiento de carteras y alta con titular conocido.
 *
 * Reglas de negocio que implementa:
 *
 *   1.5 · Un titular A sólo ve los inmuebles en los que participa (principal,
 *        cotitular o delegación explícita). B no ve los de A y viceversa.
 *   1.4 · Cuando el alta la hace un PROPIETARIO, el sistema identifica
 *        automáticamente al titular a partir de su cuenta. No se le exige que se
 *        "busque a sí mismo" en un desplegable, y NO se permite guardar un
 *        inmueble sin ámbito patrimonial válido (evita el riesgo de que acabe
 *        existiendo "sólo en localStorage").
 *
 * Funciones PURAS: no tocan Firestore, ni React, ni localStorage ⇒ testeables.
 */

import type { Inmueble, Propietario, UsuarioApp } from '../types';

/**
 * PROYECCIÓN del índice de titulares (`titularesIds`) a partir de los campos
 * escalares de titularidad. Es una función PURA:
 *
 *   · No inventa información: sólo recoge los IDs ya presentes.
 *   · No asume porcentajes ni orden de prelación.
 *   · Es idempotente (proyectar(proyectar(x)) == proyectar(x)).
 *   · Es reversible: el índice se puede reconstruir desde los campos de origen.
 *
 * Se usa en `saveInmuebleFirestore` como write-through, de modo que las reglas
 * de Firestore dispongan de un array sobre el que hacer `array-contains`.
 *
 * En el BLOQUE 2 la fuente de verdad pasará a ser la colección `titularidades`
 * (N titulares con porcentaje y vigencia); esta función pasará a proyectar
 * desde ahí, sin cambiar de firma ni de criterio.
 */
export function proyectarTitularesIds(
  inmueble: Partial<Inmueble> | null | undefined
): string[] {
  if (!inmueble) return [];
  const grupos = [
    inmueble.titularesIds,
    [inmueble.propietarioId, inmueble.propietarioPrincipalId, inmueble.propietarioSecundarioId],
  ];

  const salida: string[] = [];
  for (const grupo of grupos) {
    if (!Array.isArray(grupo)) continue;
    for (const id of grupo) {
      if (typeof id === 'string' && id.trim().length > 0 && !salida.includes(id)) salida.push(id);
    }
  }
  return salida;
}

/**
 * IDs de titulares que participan en un inmueble según el modelo ACTUAL
 * (campos escalares + índice proyectado `titularesIds`).
 *
 * En el BLOQUE 2 la fuente de verdad pasará a ser la colección `titularidades`
 * (N titulares con porcentaje y vigencia). Esta función es el punto único que
 * habrá que sustituir entonces, y su firma no cambiará.
 */
export function idsTitularesInmueble(inmueble: Partial<Inmueble> | null | undefined): string[] {
  return proyectarTitularesIds(inmueble);
}

/** ¿Participa `propietarioId` en la titularidad del inmueble? */
export function esTitularDelInmueble(
  inmueble: Partial<Inmueble> | null | undefined,
  propietarioId?: string | null
): boolean {
  if (!propietarioId) return false;
  return idsTitularesInmueble(inmueble).includes(propietarioId);
}

/**
 * Filtra los inmuebles visibles para un usuario.
 *
 * · ADMINISTRADOR: todo (sin cambios respecto al comportamiento previo).
 * · PROPIETARIO: sólo donde participa como titular + delegaciones explícitas
 *   (`inmuebleIds` de la cuenta).
 * · Resto de perfiles: sólo delegaciones explícitas.
 */
export function filtrarInmueblesPorTitularidad<T extends Pick<Inmueble, 'id'>>(
  inmuebles: T[],
  usuario: Pick<UsuarioApp, 'tipoPerfil' | 'propietarioId' | 'inmuebleIds'> | null | undefined
): T[] {
  if (!usuario) return [];
  if (usuario.tipoPerfil === 'ADMINISTRADOR') return inmuebles;

  const pid = usuario.propietarioId;
  const delegados = new Set(usuario.inmuebleIds || []);

  return inmuebles.filter((inm) => {
    if (pid && esTitularDelInmueble(inm, pid)) return true;
    return delegados.has(inm.id);
  });
}

/* ------------------------------------------------------------------ */
/* Vinculación cuenta de usuario ↔ titular (colección `propietarios`)   */
/* ------------------------------------------------------------------ */

/**
 * NOTA: se usa un discriminante de TEXTO (`estado`) en lugar de un booleano
 * porque el proyecto NO compila con `strict`, y sin `strictNullChecks` los
 * literales `true`/`false` no estrechan uniones discriminadas en TypeScript.
 */
export interface VinculoTitular {
  estado: 'OK' | 'KO';
  propietarioId?: string;
  propietario?: Propietario;
  /** Motivo cuando no se pudo resolver la vinculación (listo para mostrar). */
  motivo?: string;
}

/**
 * Resuelve el titular (documento de `propietarios`) al que pertenece la cuenta.
 *
 * Orden de resolución (no destructivo, sin escritura):
 *   1. `usuario.propietarioId` explícito y existente en la colección.
 *   2. Coincidencia de email (normalizado) con `Propietario.email`.
 *
 * Si hay ambigüedad (varios titulares con el mismo email) NO se inventa:
 * se devuelve `estado:'KO'` con el motivo para que la UI lo muestre.
 */
export function resolverTitularDeCuenta(
  usuario: Pick<UsuarioApp, 'tipoPerfil' | 'propietarioId' | 'email'> | null | undefined,
  propietarios: Propietario[] = []
): VinculoTitular {
  if (!usuario) {
    return { estado: 'KO', motivo: 'No hay sesión activa.' };
  }

  const lista = Array.isArray(propietarios) ? propietarios : [];

  // 1) Vinculación explícita de la cuenta.
  if (usuario.propietarioId) {
    const directo = lista.find((p) => p.id === usuario.propietarioId);
    if (directo) return { estado: 'OK', propietarioId: directo.id, propietario: directo };
    // La cuenta apunta a un titular que ya no existe: NO inventamos, avisamos.
    return {
      estado: 'KO',
      motivo:
        'Tu cuenta está vinculada a un titular que no consta en el sistema. ' +
        'Contacta con la administración para restablecer la vinculación.',
    };
  }

  // 2) Coincidencia por email.
  const email = (usuario.email || '').trim().toLowerCase();
  if (email) {
    const porEmail = lista.filter((p) => (p.email || '').trim().toLowerCase() === email);
    if (porEmail.length === 1) {
      return { estado: 'OK', propietarioId: porEmail[0].id, propietario: porEmail[0] };
    }
    if (porEmail.length > 1) {
      return {
        estado: 'KO',
        motivo:
          'Existe más de un titular registrado con tu correo electrónico. ' +
          'No se puede determinar automáticamente a quién pertenece el inmueble: ' +
          'contacta con la administración.',
      };
    }
  }

  return {
    estado: 'KO',
    motivo:
      'Tu cuenta de propietario no está vinculada a ningún titular registrado. ' +
      'Sin esa vinculación no se puede garantizar a quién pertenece el inmueble ni quién podrá verlo.',
  };
}

/* ------------------------------------------------------------------ */
/* Alta / edición de inmuebles con ámbito patrimonial garantizado       */
/* ------------------------------------------------------------------ */

export type ResultadoAlcance =
  | { estado: 'OK'; inmueble: Inmueble; propietarioId: string; autovinculado: boolean }
  | { estado: 'KO'; motivo: string; codigo: CodigoAlcance };

export type CodigoAlcance =
  | 'SIN_SESION'
  | 'TITULAR_NO_RESUELTO'
  | 'CONFLICTO_TITULAR';

/**
 * Normaliza el ámbito patrimonial de un inmueble antes de persistirlo.
 *
 * · ADMINISTRADOR: respeta el titular indicado en el formulario, pero exige que
 *   exista (un inmueble sin titular no tiene cartera y no se puede aislar).
 * · PROPIETARIO: auto-identifica al titular (1.4). Si el formulario traía otro,
 *   manda la cuenta del usuario: un propietario nunca puede dar de alta un
 *   inmueble a nombre de un tercero desde su portal.
 *
 * No muta el objeto de entrada: devuelve uno nuevo.
 */
export interface OpcionesAlcance {
  /**
   * Titular ya almacenado en el documento (cuando se está EDITANDO).
   * Permite que una edición realizada por administración no bloquee un inmueble
   * que históricamente no tiene titular asignado: se conserva la situación
   * anterior en lugar de forzar una decisión que podría perder información.
   */
  titularPreexistente?: string | null;
}

export function prepararAlcancePatrimonial(
  inmueble: Inmueble,
  usuario: Pick<UsuarioApp, 'tipoPerfil' | 'propietarioId' | 'email'> | null | undefined,
  propietarios: Propietario[] = [],
  opciones?: OpcionesAlcance
): ResultadoAlcance {
  if (!usuario) {
    return {
      estado: 'KO',
      codigo: 'SIN_SESION',
      motivo: 'No hay sesión activa. Vuelve a iniciar sesión antes de guardar el inmueble.',
    };
  }

  const esAdmin = usuario.tipoPerfil === 'ADMINISTRADOR';

  if (esAdmin) {
    const indicado =
      inmueble.propietarioId ||
      inmueble.propietarioPrincipalId ||
      opciones?.titularPreexistente ||
      null;
    if (indicado) {
      const normalizado: Inmueble = {
        ...inmueble,
        propietarioId: indicado,
        propietarioPrincipalId: inmueble.propietarioPrincipalId || indicado,
      };
      return { estado: 'OK', inmueble: normalizado, propietarioId: indicado, autovinculado: false };
    }
    return {
      estado: 'KO',
      codigo: 'TITULAR_NO_RESUELTO',
      motivo:
        'Debes indicar el titular del inmueble. Sin titular no se puede determinar a qué cartera pertenece ni quién puede verlo.',
    };
  }

  // Perfil PROPIETARIO (1.4): auto-identificación del titular.
  const vinculo = resolverTitularDeCuenta(usuario, propietarios);
  if (vinculo.estado !== 'OK' || !vinculo.propietarioId) {
    return {
      estado: 'KO',
      codigo: 'TITULAR_NO_RESUELTO',
      motivo:
        vinculo.motivo ||
        'No se ha podido determinar el titular del inmueble a partir de tu cuenta.',
    };
  }

  const formularioIndicaOtro =
    (inmueble.propietarioId && inmueble.propietarioId !== vinculo.propietarioId) ||
    (inmueble.propietarioPrincipalId &&
      inmueble.propietarioPrincipalId !== vinculo.propietarioId);

  const normalizado: Inmueble = {
    ...inmueble,
    propietarioId: vinculo.propietarioId,
    propietarioPrincipalId: vinculo.propietarioId,
    titularesIds: idsTitularesInmueble({
      ...inmueble,
      propietarioId: vinculo.propietarioId,
      propietarioPrincipalId: vinculo.propietarioId,
    }),
  };

  return {
    estado: 'OK',
    inmueble: normalizado,
    propietarioId: vinculo.propietarioId,
    autovinculado: !inmueble.propietarioId || Boolean(formularioIndicaOtro),
  };
}
