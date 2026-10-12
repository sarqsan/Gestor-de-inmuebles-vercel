/**
 * MUNDO SINTÉTICO para las pruebas de reglas (emulador oficial y validación local).
 * -----------------------------------------------------------------------------
 * Sólo datos ficticios: identificadores `prop-*`, `usr-*`, `uid-*` y correos
 * `*.sintetico.invalid`. Sin datos personales. Este módulo no importa Firebase:
 * es datos puros, así que puede usarse tanto con el emulador oficial como con el
 * evaluador local de `tests/harness/firestoreRulesEval.ts`.
 *
 * Identidades (cada una con su cadena completa: `usuarios` ACTIVO ↔ espejo
 * `usuarios_auth/{uid}`; sin ellas las reglas deniegan por diseño):
 *  · titular A  — propietario canónico de `inm-a1`; principal no canónico de `inm-c1`.
 *  · titular B  — propietario canónico de `inm-b1` y `inm-c1`.
 *  · gestor G   — gestión ACTIVA + LECTURA_ESCRITURA + GESTOR sobre la cartera de B.
 *  · lector L   — gestión ACTIVA + LECTURA sobre la cartera de A (sólo lectura).
 */

export interface SesionSintetica {
  readonly uid: string;
  readonly email: string;
}

export const TITULAR_A: SesionSintetica = { uid: 'uid-titular-a', email: 'titular-a@sintetico.invalid' };
export const TITULAR_B: SesionSintetica = { uid: 'uid-titular-b', email: 'titular-b@sintetico.invalid' };
export const GESTOR_G: SesionSintetica = { uid: 'uid-gestor', email: 'gestor@sintetico.invalid' };
export const LECTOR_L: SesionSintetica = { uid: 'uid-lector', email: 'lector@sintetico.invalid' };

type Doc = Record<string, unknown>;

/** Espejo de identidad + perfil ACTIVO, con la proyección de carteras indicada. */
export function identidadSintetica(
  s: SesionSintetica,
  usuarioId: string,
  propietarioId: string,
  gestionesPorPropietario?: Record<string, string>,
): Record<string, Doc> {
  const salida: Record<string, Doc> = {
    [`usuarios/${usuarioId}`]: { id: usuarioId, authUid: s.uid, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId },
    [`usuarios_auth/${s.uid}`]: {
      usuarioId, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId, profesionalId: '', inmuebleIds: [],
      ...(gestionesPorPropietario ? { gestionesPorPropietario } : {}),
    },
  };
  return salida;
}

/** Gestión de cartera (`gestiones_cartera`) ACTIVA y ACEPTADA, sin delegación parcial. */
export function gestionSintetica(id: string, propietarioId: string, gestorUsuarioId: string, permiso: 'LECTURA' | 'LECTURA_ESCRITURA'): Doc {
  return {
    id, propietarioId, gestorUsuarioId, estado: 'ACTIVA', inmuebleIds: [],
    resolucionInvitacion: 'ACEPTADA', permiso, responsableActual: 'GESTOR',
  };
}

/** Estado inicial completo (identidades, carteras, inmuebles y una titularidad). */
export function mundoSintetico(): Record<string, Doc> {
  return {
    ...identidadSintetica(TITULAR_A, 'usr-a', 'prop-a'),
    ...identidadSintetica(TITULAR_B, 'usr-b', 'prop-b'),
    ...identidadSintetica(GESTOR_G, 'usr-g', 'prop-g', { 'prop-b': 'ges-b-g' }),
    ...identidadSintetica(LECTOR_L, 'usr-l', 'prop-l', { 'prop-a': 'ges-a-l' }),
    'gestiones_cartera/ges-b-g': gestionSintetica('ges-b-g', 'prop-b', 'usr-g', 'LECTURA_ESCRITURA'),
    'gestiones_cartera/ges-a-l': gestionSintetica('ges-a-l', 'prop-a', 'usr-l', 'LECTURA'),
    // Inmueble de A (titular canónico A).
    'inmuebles/inm-a1': {
      id: 'inm-a1', propietarioId: 'prop-a', propietarioPrincipalId: 'prop-a',
      direccion: 'Calle Sintetica 1', rentaMensualDeclarada: 650,
    },
    // Inmueble de B (titular canónico B).
    'inmuebles/inm-b1': {
      id: 'inm-b1', propietarioId: 'prop-b', propietarioPrincipalId: 'prop-b',
      direccion: 'Calle Sintetica 2',
    },
    // Inmueble de B en el que A es principal NO canónico (cotitularidad fiscal).
    'inmuebles/inm-c1': {
      id: 'inm-c1', propietarioId: 'prop-b', propietarioPrincipalId: 'prop-a',
      direccion: 'Calle Sintetica 3',
    },
    'titularidades/inm-a1__prop-a': {
      id: 'inm-a1__prop-a', inmuebleId: 'inm-a1', propietarioId: 'prop-a',
      porcentajeTitularidad: null, estado: 'VIGENTE', fechaInicio: '2026-10-01T00:00:00.000Z',
    },
  };
}

/** Gestión revocada: el espejo deja de proyectar la cartera de B (lo hace el master). */
export function revocarGestionSintetica(datos: Record<string, Doc>): Record<string, Doc> {
  return {
    ...datos,
    'gestiones_cartera/ges-b-g': { ...datos['gestiones_cartera/ges-b-g'], estado: 'REVOCADA' },
    ...identidadSintetica(GESTOR_G, 'usr-g', 'prop-g', {}),
  };
}
