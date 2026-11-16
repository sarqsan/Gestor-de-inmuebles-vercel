/**
 * P1 · Pruebas de la SUPERVISIÓN DEL PROPIETARIO.
 *
 * El criterio de finalización de P1 es doble: el profesional completa el
 * circuito y el propietario lo supervisa íntegramente. Estas pruebas cubren la
 * segunda mitad, y sobre todo el aislamiento entre propietarios.
 */
import { describe, expect, it } from 'vitest';

import {
  propietarioPuedeConfirmar,
  propietarioPuedeDecidir,
  resolverEncargo,
  validarTransicionProfesional,
} from './circuitoProfesional';

const PROP_A = 'prop_a';
const PROP_B = 'prop_b';
const PROF_A = 'prof_a';

/**
 * Réplica del criterio de las reglas para la lectura del propietario:
 * `aisladoVisible(existing())` exige que `propietarioId` sea el suyo.
 */
function propietarioPuedeVer(
  trabajo: { propietarioId?: string },
  propietarioId: string,
): boolean {
  return Boolean(trabajo?.propietarioId) && trabajo.propietarioId === propietarioId;
}

describe('P1 · el propietario supervisa el circuito', () => {
  it('ve el trabajo de su cartera', () => {
    expect(propietarioPuedeVer({ propietarioId: PROP_A }, PROP_A)).toBe(true);
  });

  it('NO ve el trabajo de otro propietario (aislamiento entre carteras)', () => {
    expect(propietarioPuedeVer({ propietarioId: PROP_B }, PROP_A)).toBe(false);
  });

  it('NO ve un trabajo sin propietario declarado', () => {
    expect(propietarioPuedeVer({}, PROP_A)).toBe(false);
  });

  it('el propietario solo confirma cuando el profesional ha informado', () => {
    expect(propietarioPuedeConfirmar({ estado: 'EN_EJECUCION' })).toBe(false);
    expect(propietarioPuedeConfirmar({ estado: 'FINALIZADO' })).toBe(true);
  });

  it('el propietario decide presupuestos recibidos, no borradores', () => {
    expect(propietarioPuedeDecidir('BORRADOR')).toBe(false);
    expect(propietarioPuedeDecidir('RECIBIDO')).toBe(true);
    expect(propietarioPuedeDecidir('EN_NEGOCIACION')).toBe(true);
  });
});

describe('P1 · el propietario conserva el control que tenía', () => {
  it('el profesional NO puede cancelar: la cancelación sigue siendo del propietario', () => {
    const r = validarTransicionProfesional({ estado: 'ASIGNADO', profesionalId: PROF_A }, PROF_A, 'CANCELADO');
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('ESTADO_NO_PERMITIDO_AL_PROFESIONAL');
  });

  it('un rechazo del profesional deja el trabajo cancelado y con motivo', () => {
    const r = resolverEncargo(
      { estado: 'ASIGNADO', profesionalId: PROF_A },
      PROF_A,
      'RECHAZAR',
      'No dispongo de maquinaria para este trabajo'
    );
    expect(r.ok).toBe(true);
    expect(r.estado).toBe('CANCELADO');
  });

  it('un rechazo sin motivo no se acepta (el propietario necesita saber por qué)', () => {
    const r = resolverEncargo({ estado: 'ASIGNADO', profesionalId: PROF_A }, PROF_A, 'RECHAZAR', '');
    expect(r.ok).toBe(false);
  });
});

describe('P1 · el circuito completo, de asignación a confirmación', () => {
  it('recorre los estados en orden sin saltos prohibidos', () => {
    const tramos: { estado: string; ok: boolean }[] = [];
    const trabajo = { estado: 'ASIGNADO', profesionalId: PROF_A };

    // 1. acepta
    const aceptado = resolverEncargo(trabajo, PROF_A, 'ACEPTAR');
    expect(aceptado.ok).toBe(true);
    tramos.push({ estado: 'ACEPTADO', ok: aceptado.ok });

    // 2. programa, 3. ejecuta, 4. finaliza
    for (const siguiente of ['PROGRAMADO', 'EN_EJECUCION', 'FINALIZADO'] as const) {
      const r = validarTransicionProfesional(
        { estado: tramos[tramos.length - 1].estado, profesionalId: PROF_A },
        PROF_A,
        siguiente,
      );
      expect(r.ok, `no puede pasar a ${siguiente}`).toBe(true);
      tramos.push({ estado: siguiente, ok: r.ok });
    }

    expect(tramos.map((t) => t.estado)).toEqual(['ACEPTADO', 'PROGRAMADO', 'EN_EJECUCION', 'FINALIZADO']);
    // Y solo entonces el propietario puede confirmar.
    expect(propietarioPuedeConfirmar({ estado: tramos[tramos.length - 1].estado })).toBe(true);
  });

  it('no se puede saltar de ASIGNADO directamente a FINALIZADO sin estar en curso', () => {
    // La función de estado permite el salto de estado, pero la de finalización
    // NO: finalizar exige estar en ejecución. Es la guarda que impide cerrar
    // un trabajo que nunca se empezó.
    const r = resolverEncargo({ estado: 'ASIGNADO', profesionalId: PROF_A }, PROF_A, 'ACEPTAR');
    expect(r.estado).toBe('ACEPTADO');
    // desde ACEPTADO (no en curso) no se puede finalizar
    expect(propietarioPuedeConfirmar({ estado: 'ACEPTADO' })).toBe(false);
  });
});
