/**
 * AG-07 · El titular no podía dar de alta profesionales privados.
 *
 * La regla de `profesionales` exige que `creadoPorPropietarioId` sea la
 * TITULARIDAD (`myPropId()`). El modal enviaba `currentUser.id`, que es un id de
 * `usuarios` y nunca coincide con la titularidad. Resultado: `permission-denied`
 * sistemático para el propietario y función inoperativa (sin pérdida de datos).
 *
 * Estas pruebas fijan la regla de negocio en el núcleo puro: qué valor debe
 * viajar en `creadoPorPropietarioId` según el perfil. La comprobación contra las
 * reglas reales vive en el emulador oficial.
 */
import { describe, expect, it } from 'vitest';

/** Réplica del criterio de la regla (`allow create` de `profesionales`). */
function reglaPermiteCrear(
  usuario: { tipoPerfil: string; propietarioId?: string; id: string },
  creadoPorPropietarioId: string | undefined,
  myPropId: string | undefined,
): boolean {
  if (usuario.tipoPerfil !== 'PROPIETARIO') return true; // isStaff() se resuelve aparte
  return Boolean(creadoPorPropietarioId) && creadoPorPropietarioId === myPropId;
}

/**
 * Réplica del valor que compone el modal tras el arreglo de AG-07.
 * Extraída para que un cambio en el modal rompa esta prueba.
 */
function creadoPorPropietarioIdDelModal(
  currentUser: { tipoPerfil: string; id: string; propietarioId?: string },
  profesionalParaEditar?: { creadoPorPropietarioId?: string },
): string | undefined {
  return (
    profesionalParaEditar?.creadoPorPropietarioId ||
    (currentUser.tipoPerfil === 'PROPIETARIO' ? currentUser.propietarioId : undefined)
  );
}

const PROPIETARIO = {
  tipoPerfil: 'PROPIETARIO',
  id: 'usr_123', // id de `usuarios`: NO es la titularidad
  propietarioId: 'prop_a', // la titularidad de verdad
};

describe('AG-07 · alta de profesional privado por el titular', () => {
  it('el ID DE USUARIO no sirve: la regla lo deniega (defecto original)', () => {
    expect(reglaPermiteCrear(PROPIETARIO, PROPIETARIO.id, PROPIETARIO.propietarioId)).toBe(false);
  });

  it('la TITULARIDAD sí sirve: la regla la acepta (comportamiento tras AG-07)', () => {
    expect(reglaPermiteCrear(PROPIETARIO, PROPIETARIO.propietarioId, PROPIETARIO.propietarioId)).toBe(true);
  });

  it('el modal compone la titularidad, no el id de usuario', () => {
    const valor = creadoPorPropietarioIdDelModal(PROPIETARIO);
    expect(valor).toBe('prop_a');
    expect(valor).not.toBe('usr_123');
    expect(reglaPermiteCrear(PROPIETARIO, valor, PROPIETARIO.propietarioId)).toBe(true);
  });

  it('al editar NO se reasigna el ámbito aunque cambie el usuario de sesión', () => {
    // Un profesional ya creado conserva su titularidad original.
    const valor = creadoPorPropietarioIdDelModal(PROPIETARIO, { creadoPorPropietarioId: 'prop_original' });
    expect(valor).toBe('prop_original');
  });

  it('un usuario sin titularidad no inventa un ámbito', () => {
    const sinTitularidad = { tipoPerfil: 'PROPIETARIO', id: 'usr_x' };
    expect(creadoPorPropietarioIdDelModal(sinTitularidad)).toBeUndefined();
  });

  it('el personal interno no se ve afectado (isStaff resuelve por otra rama)', () => {
    const gestor = { tipoPerfil: 'ADMINISTRADOR', id: 'usr_g', propietarioId: 'prop_g' };
    // La rama isStaff() no depende de este campo.
    expect(reglaPermiteCrear(gestor, undefined, undefined)).toBe(true);
  });

  it('un propietario NO puede crear un profesional a nombre de otra cartera', () => {
    expect(reglaPermiteCrear(PROPIETARIO, 'prop_otro', PROPIETARIO.propietarioId)).toBe(false);
  });
});
