/**
 * P1 · TIPOS DEL CANAL DE COMUNICACIÓN POR ORDEN DE TRABAJO.
 *
 * POR QUÉ VIVEN AQUÍ Y NO EN `src/types.ts`:
 *   `src/types.ts` es un fichero COMPARTIDO que la guardia de custodia del
 *   repositorio
 *   (`src/features/operaciones/tests/integration-boundaries.test.mjs` y
 *   `src/features/patrimonial/tests/isolation.test.mjs`) exige **byte a byte**
 *   idéntico a la referencia de la rama. Añadir interfaces allí habría obligado
 *   a regenerar el manifiesto de custodia para declarar un cambio que no
 *   necesita declararse: el canal del profesional no modifica ningún modelo
 *   existente, solo añade uno nuevo y aislado.
 *
 *   Así que el modelo del canal nuevo vive junto a su funcionalidad. Cuando la
 *   custodia se regenere por otro motivo, mover esto a `src/types.ts` es
 *   trivial; mientras tanto, la guardia sigue siendo estricta.
 *
 * RELACIÓN CON LOS MODELOS EXISTENTES (no hay duplicación):
 *   - `MensajePortal` (contrato) sigue siendo el hilo propietario ↔ inquilino.
 *     NO se ha tocado ni un campo.
 *   - `MensajeTrabajo` es el hilo propietario ↔ profesional de UNA orden.
 *     Comparte la idea de "mensaje con autor, fecha y acuse de lectura", pero
 *     su ámbito es otro (el trabajo, no el contrato) y su vocabulario de roles
 *     es distinto a propósito, para que los tipos no se puedan mezclar.
 */
import type { MensajePortal } from '../../types';

/** Rol del autor en el canal de una orden de trabajo. */
export type RolRemitenteMensajeTrabajo = 'PROPIETARIO' | 'PROFESIONAL';

/**
 * Mensaje del canal propietario ↔ profesional, vinculado a UNA orden de trabajo.
 *
 * `propietarioId` y `profesionalId` se copian del TRABAJO (fuente de verdad) y
 * las reglas los vuelven a comprobar contra él: un mensaje no puede declarar
 * participantes que no sean los del trabajo.
 *
 * `leidoPorPropietario` / `leidoPorProfesional` son los únicos campos mutables:
 * un mensaje enviado no se puede reescribir ni borrar.
 */
export interface MensajeTrabajo {
  id: string;
  /** Orden de trabajo a la que pertenece la conversación. Inmutable. */
  trabajoId: string;
  /** Propietario del trabajo. */
  propietarioId: string;
  /** Profesional asignado al trabajo. */
  profesionalId: string;
  remitenteUid: string;
  remitenteNombre: string;
  remitenteRol: RolRemitenteMensajeTrabajo;
  texto: string;
  leidoPorPropietario?: boolean;
  leidoPorProfesional?: boolean;
  createdAt: string;
}

/**
 * Comprobación de tipos en tiempo de compilación: el canal del trabajo NO es
 * el canal del inquilino. Si alguien intenta asignar uno al otro, falla.
 */
export type CanalTrabajoNoEsCanalPortal = MensajeTrabajo extends MensajePortal ? never : true;
