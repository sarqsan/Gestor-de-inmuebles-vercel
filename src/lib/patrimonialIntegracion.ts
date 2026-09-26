/**
 * PUENTE Arena C ↔ D1R/D2b/D3 — integración arquitectónica de la base
 * patrimonial (commit 7657eea de Arena C) con el modelo canónico de esta
 * rama. Vive FUERA de `src/features/patrimonial/` a propósito: el módulo C
 * es deliberadamente puro y aislado (sus propios tests de aislamiento
 * prohíben que importe nada exterior, incluida esta rama); el puente es el
 * ÚNICO punto de acoplamiento y no duplica nada:
 *
 *  · NO crea una segunda fuente de verdad: reutiliza los contratos de C
 *    (`ModalidadUso`, `ContextoDestinoImportacion`, …) y el dominio D1R
 *    (`gestionesCartera`) tal cual.
 *  · NO crea ninguna colección paralela de individuos, ni un segundo modelo de propietario, ni
 *    un segundo sistema de carteras: la modalidad de C se ENCAJA en el
 *    `TipoGestor` canónico de D1R y el ámbito de D2b (`propietariosGestionados`).
 *  · NO concede acceso: `contextoDestinoDesdeAmbito` produce un snapshot de
 *    PLANIFICACIÓN para el dry-run de C; la autorización efectiva sigue
 *    estando en las Firestore Rules (carterasL/carterasE, titularidad,
 *    inmuebleIds). Ningún cliente puede elevar privilegios por esta vía.
 *
 * Módulo PURO: cero imports de Firebase.
 */
import type {
  ContextoDestinoImportacion,
  ModalidadUso,
  ReferenciaPropietario,
} from '../features/patrimonial/contracts.ts';
import { ROL_GESTOR_PATRIMONIAL, type TipoGestor } from './gestionesCartera';

// ---------------------------------------------------------------------------
// Encaje de modalidades (C) en el modelo canónico D1R
// ---------------------------------------------------------------------------

export interface EncajeModalidadD1R {
  readonly modalidad: ModalidadUso;
  /** `TipoGestor` canónico de D1R; null para PROPIETARIO (titular, no gestor). */
  readonly tipoGestor: TipoGestor | null;
  /** Rol canónico de gestión; null para PROPIETARIO. el rol operativo de inmuebles existente no se modifica. */
  readonly rolGestor: typeof ROL_GESTOR_PATRIMONIAL | null;
  /**
   * S3: crear propietario ≠ crear cuenta ≠ conceder acceso. Las tres
   * modalidades exigen cuenta propia antes de cualquier acceso; la modalidad
   * nunca lo concede por sí misma.
   */
  readonly requiereCuentaParaAcceso: true;
}

/**
 * Traduce la modalidad de onboarding de C al vocabulario canónico D1R.
 * Nota de consolidación: C denomina `GESTOR_PROPIETARIO` a lo que D1R
 * canonicaliza como `PROPIETARIO_GESTOR` (gestor que además es propietario);
 * el puente es el único lugar donde conviven ambos nombres.
 */
export function encajarModalidadEnD1R(modalidad: ModalidadUso): EncajeModalidadD1R {
  switch (modalidad) {
    case 'PROPIETARIO':
      return { modalidad, tipoGestor: null, rolGestor: null, requiereCuentaParaAcceso: true };
    case 'GESTOR_PROPIETARIO':
      return {
        modalidad,
        tipoGestor: 'PROPIETARIO_GESTOR',
        rolGestor: ROL_GESTOR_PATRIMONIAL,
        requiereCuentaParaAcceso: true,
      };
    case 'GESTOR_PROFESIONAL':
      return {
        modalidad,
        tipoGestor: 'GESTOR_PROFESIONAL',
        rolGestor: ROL_GESTOR_PATRIMONIAL,
        requiereCuentaParaAcceso: true,
      };
  }
}

/** Inversa del encaje para las dos modalidades de gestión (D1R -> C). */
export function tipoGestorD1RAModalidad(tipo: TipoGestor): Exclude<ModalidadUso, 'PROPIETARIO'> {
  return tipo === 'PROPIETARIO_GESTOR' ? 'GESTOR_PROPIETARIO' : 'GESTOR_PROFESIONAL';
}

// ---------------------------------------------------------------------------
// Ámbito D2b -> contexto de planificación de C (destino explícito de importación)
// ---------------------------------------------------------------------------

/**
 * Construye el `ContextoDestinoImportacion` que consumen
 * `resolverDestinoImportacion`/`previsualizarImportacion` de C a partir del
 * ámbito del usuario (titularidad propia ∪ carteras gestionadas D2b).
 *
 * Garantías:
 *  · No añade destinatarios implícitos: sólo el propietario propio (si
 *    existe) y los `propietariosGestionados` recibidos (proyección D1R que
 *    únicamente el master escribe en el espejo `usuarios_auth/{uid}`).
 *  · No deduce destino: con ámbito vacío, `propietariosPermitidosIds` queda
 *    vacío y C resolverá cualquier selección como NO_PERMITIDO/AUSENTE.
 *  · Es un snapshot de planificación: la autorización efectiva (lectura y
 *    escritura) sigue rigiéndose por las Firestore Rules de D2a/D2b.
 */
export function contextoDestinoDesdeAmbito(
  propietarios: readonly Pick<ReferenciaPropietario, 'id' | 'nombre'>[],
  ambito: {
    readonly propietarioId?: string;
    readonly propietariosGestionados?: readonly string[];
  }
): ContextoDestinoImportacion {
  const permitidos = Array.from(
    new Set([
      ...(typeof ambito.propietarioId === 'string' && ambito.propietarioId.trim()
        ? [ambito.propietarioId]
        : []),
      ...(ambito.propietariosGestionados ?? []).filter(
        (id) => typeof id === 'string' && id.trim().length > 0
      ),
    ])
  );
  return { propietarios, propietariosPermitidosIds: permitidos };
}
