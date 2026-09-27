/**
 * FASE 5 — Reintento acotado (núcleo puro del delta de Arena C `googleAuth`).
 * ---------------------------------------------------------------------------
 * Fuente C: commit e7798d3, `src/lib/googleAuth.ts` (reintento ante
 * `Database is closing`). La integración con el popup vive en
 * `src/lib/googleAuth.ts` (ver tests/google-auth-reintento.test.ts); aquí se
 * fija el contrato del helper `src/lib/reintentoAcotado.ts`:
 * máximo 2 intentos, espera parametrizada (600 ms en producción) y sólo para
 * el error concreto recuperable.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  conReintentoAcotado,
  ERROR_DATABASE_CLOSING,
  esErrorRecuperableDatabaseClosing,
} from '../src/lib/reintentoAcotado';

const RECUPERABLE = new Error('Firebase: Database is closing (auth/...)');
const RECUPERABLE_HIDDEN = new Error('Database is closing/hidden');
const NO_RECUPERABLE = new Error('auth/popup-closed-by-user');

describe('detector del error recuperable', () => {
  it('detecta Error con el mensaje concreto', () => {
    expect(esErrorRecuperableDatabaseClosing(RECUPERABLE)).toBe(true);
  });

  it('cubre la variante `/hidden` por inclusión', () => {
    expect(esErrorRecuperableDatabaseClosing(RECUPERABLE_HIDDEN)).toBe(true);
    expect(ERROR_DATABASE_CLOSING).toBe('Database is closing');
  });

  it('acepta string y objetos con message', () => {
    expect(esErrorRecuperableDatabaseClosing('Database is closing')).toBe(true);
    expect(esErrorRecuperableDatabaseClosing({ message: 'x Database is closing y' })).toBe(true);
  });

  it('rechaza errores no relacionados, nulos y vacíos', () => {
    expect(esErrorRecuperableDatabaseClosing(NO_RECUPERABLE)).toBe(false);
    expect(esErrorRecuperableDatabaseClosing(new Error('Database is open'))).toBe(false);
    expect(esErrorRecuperableDatabaseClosing(null)).toBe(false);
    expect(esErrorRecuperableDatabaseClosing(undefined)).toBe(false);
    expect(esErrorRecuperableDatabaseClosing('')).toBe(false);
  });
});

describe('conReintentoAcotado', () => {
  it('primer intento correcto → una llamada, sin espera', async () => {
    const operacion = vi.fn(async () => 'ok');
    const esperar = vi.fn(async () => undefined);
    await expect(
      conReintentoAcotado(operacion, esErrorRecuperableDatabaseClosing, {
        maxIntentos: 2,
        esperaMs: 600,
        esperar,
      })
    ).resolves.toBe('ok');
    expect(operacion).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('primer fallo recuperable + segundo correcto → 2 llamadas y 1 espera exacta', async () => {
    const operacion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(RECUPERABLE)
      .mockResolvedValueOnce('ok');
    const esperar = vi.fn(async () => undefined);
    await expect(
      conReintentoAcotado(operacion, esErrorRecuperableDatabaseClosing, {
        maxIntentos: 2,
        esperaMs: 600,
        esperar,
      })
    ).resolves.toBe('ok');
    expect(operacion).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledTimes(1);
    expect(esperar).toHaveBeenCalledWith(600);
  });

  it('dos fallos recuperables → se agotan los intentos y propaga el último error', async () => {
    const segundo = new Error('Database is closing (segundo)');
    const operacion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(RECUPERABLE)
      .mockRejectedValueOnce(segundo);
    const esperar = vi.fn(async () => undefined);
    await expect(
      conReintentoAcotado(operacion, esErrorRecuperableDatabaseClosing, {
        maxIntentos: 2,
        esperaMs: 600,
        esperar,
      })
    ).rejects.toBe(segundo);
    expect(operacion).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledTimes(1);
  });

  it('error no recuperable → se propaga inmediatamente (1 llamada, sin espera)', async () => {
    const operacion = vi.fn(async () => {
      throw NO_RECUPERABLE;
    });
    const esperar = vi.fn(async () => undefined);
    await expect(
      conReintentoAcotado(operacion, esErrorRecuperableDatabaseClosing, {
        maxIntentos: 2,
        esperaMs: 600,
        esperar,
      })
    ).rejects.toBe(NO_RECUPERABLE);
    expect(operacion).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('fallo recuperable seguido de no recuperable → el segundo corta el reintento', async () => {
    const operacion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(RECUPERABLE)
      .mockRejectedValueOnce(NO_RECUPERABLE);
    const esperar = vi.fn(async () => undefined);
    await expect(
      conReintentoAcotado(operacion, esErrorRecuperableDatabaseClosing, {
        maxIntentos: 5,
        esperaMs: 600,
        esperar,
      })
    ).rejects.toBe(NO_RECUPERABLE);
    expect(operacion).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledTimes(1);
  });
});
