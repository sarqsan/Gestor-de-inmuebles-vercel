/**
 * PREFLIGHT DE IDENTIDAD de la promoción (antes de cualquier escritura).
 *
 * Función pura: no lee Firestore ni muestra datos personales. Compara:
 *   · la identidad CANÓNICA de la sesión (espejo `usuarios_auth/{uid}` + perfil,
 *     proyectada con `proyectarIdentidad`, la misma autoridad que usa la app);
 *   · la ficha de usuario cargada en el panel;
 *   · los titulares de destino del plan.
 *
 * Bloquea (sin escribir nada) si:
 *   1. no hay identidad canónica (sin espejo o no ACTIVO);
 *   2. la ficha y el espejo no son el mismo usuario;
 *   3. la ficha dice ADMINISTRADOR pero la sesión no es master;
 *   4. un destino no es el propio titular NI una cartera de ESCRITURA confirmada.
 *
 * El selector de titular o de cartera NO otorga permisos: sólo cuenta el espejo
 * canónico (`carterasE`, o `master`). Los motivos no incluyen identificadores de
 * personas: sólo cuentan los destinos afectados.
 */
import { permitido, type IdentidadCanonica } from '../../features/operaciones/persistence/authorization';

export interface FichaPreflight {
  readonly id: string;
  readonly tipoPerfil?: string;
  readonly propietarioId?: string;
}

export interface ResultadoPreflight {
  readonly pasa: boolean;
  readonly motivos: readonly string[];
}

export function evaluarPreflightIdentidadImport(entrada: {
  identidad: IdentidadCanonica | null;
  ficha: FichaPreflight | null;
  destinos: readonly string[];
}): ResultadoPreflight {
  const { identidad, ficha } = entrada;
  if (!identidad) {
    return { pasa: false, motivos: ['identidad no verificable: sin espejo usuarios_auth activo para esta sesión'] };
  }
  if (!ficha) {
    return { pasa: false, motivos: ['sin ficha de usuario para esta sesión'] };
  }
  const motivos: string[] = [];
  if (identidad.usuarioId !== ficha.id) {
    motivos.push('la ficha de sesión no coincide con el espejo de identidad');
  }
  if (ficha.propietarioId && identidad.propietarioId && ficha.propietarioId !== identidad.propietarioId) {
    motivos.push('el titular de la ficha no coincide con el titular del espejo de identidad');
  }
  if (ficha.tipoPerfil === 'ADMINISTRADOR' && !identidad.master) {
    motivos.push('administrador sin master: no puede promocionar importaciones');
  }
  const destinosUnicos = [...new Set(entrada.destinos)];
  const fueraDeEscritura = destinosUnicos.filter((d) => !permitido(identidad, d, true));
  if (fueraDeEscritura.length > 0) {
    motivos.push(`${fueraDeEscritura.length} destino(s) fuera del titular propio y de las carteras de escritura confirmadas`);
  }
  return { pasa: motivos.length === 0, motivos };
}
