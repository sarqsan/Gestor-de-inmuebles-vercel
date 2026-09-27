/**
 * FASE 5 — Integración del reintento en `googleSignIn` (delta de C e7798d3).
 * ---------------------------------------------------------------------------
 * Se mockea `firebase/auth` (popup programable); el resto (`firebase/app`,
 * config real, helper de reintento) es el código de producción. Se fija:
 *  · constantes: máximo 2 intentos, espera 600 ms (equivalente a C);
 *  · éxito al primer intento / tras un fallo recuperable / agotamiento;
 *  · error no recuperable sin reintento;
 *  · `isSigningIn` permanece activo durante la espera del reintento y se
 *    libera al terminar (observable vía `initAuth`: un usuario sin token en
 *    caché NO dispara `onAuthFailure` mientras se está firmando).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ signOut: vi.fn(async () => undefined) })),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: class {
    static credentialFromResult = vi.fn();
    addScope = vi.fn();
  },
  onAuthStateChanged: vi.fn(),
}));

import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import {
  ESPERA_REINTENTO_GOOGLE_MS,
  googleSignIn,
  initAuth,
  logoutGoogle,
  MAX_INTENTOS_GOOGLE_SIGNIN,
} from '../src/lib/googleAuth';

const popup = vi.mocked(signInWithPopup);
const credencial = vi.mocked(GoogleAuthProvider.credentialFromResult);
const observador = vi.mocked(onAuthStateChanged);

const USUARIO = { uid: 'uid-1' } as never;

function exitoPopup(token = 'token-1') {
  popup.mockResolvedValueOnce({ user: USUARIO } as never);
  credencial.mockReturnValueOnce({ accessToken: token } as never);
}

beforeEach(async () => {
  // Colas `*Once` limpias (clear no basta: las pendientes sobreviven) y caché
  // de token del módulo vacía para aislar cada caso.
  vi.resetAllMocks();
  await logoutGoogle();
});

describe('constantes del reintento', () => {
  it('máximo dos intentos y espera equivalente a C (600 ms)', () => {
    expect(MAX_INTENTOS_GOOGLE_SIGNIN).toBe(2);
    expect(ESPERA_REINTENTO_GOOGLE_MS).toBe(600);
  });
});

describe('googleSignIn con reintento', () => {
  it('primer intento correcto → devuelve usuario y token (1 popup)', async () => {
    exitoPopup();
    const resultado = await googleSignIn();
    expect(resultado).toEqual({ user: USUARIO, accessToken: 'token-1' });
    expect(popup).toHaveBeenCalledTimes(1);
  });

  it('fallo recuperable + éxito → reintenta una vez y devuelve el resultado', async () => {
    popup.mockRejectedValueOnce(new Error('Database is closing'));
    exitoPopup('token-2');
    const resultado = await googleSignIn();
    expect(resultado).toEqual({ user: USUARIO, accessToken: 'token-2' });
    expect(popup).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('dos fallos recuperables → propaga el error tras 2 intentos', async () => {
    const primero = new Error('Database is closing/hidden');
    const segundo = new Error('Database is closing');
    popup.mockRejectedValueOnce(primero).mockRejectedValueOnce(segundo);
    await expect(googleSignIn()).rejects.toBe(segundo);
    expect(popup).toHaveBeenCalledTimes(2);
  }, 10_000);

  it('error no recuperable → 1 popup y propagación inmediata', async () => {
    const err = new Error('auth/popup-closed-by-user');
    popup.mockRejectedValueOnce(err);
    const inicio = Date.now();
    await expect(googleSignIn()).rejects.toBe(err);
    expect(popup).toHaveBeenCalledTimes(1);
    // Sin espera de reintento (margen amplio anti-flaky).
    expect(Date.now() - inicio).toBeLessThan(500);
  });

  it('sin accessToken → error no recuperable (sin reintento)', async () => {
    popup.mockResolvedValueOnce({ user: USUARIO } as never);
    credencial.mockReturnValueOnce(null as never);
    await expect(googleSignIn()).rejects.toThrow('No se pudo obtener el token de acceso');
    expect(popup).toHaveBeenCalledTimes(1);
  });
});

describe('isSigningIn durante el reintento', () => {
  it('un usuario sin token NO dispara onAuthFailure mientras se reintenta', async () => {
    popup.mockRejectedValueOnce(new Error('Database is closing'));
    exitoPopup('token-reintento');

    const promesa = googleSignIn();
    try {
      // Dentro de la espera de 600 ms: isSigningIn sigue activo.
      await new Promise((r) => setTimeout(r, 150));
      const alExito = vi.fn();
      const alFallo = vi.fn();
      initAuth(alExito, alFallo);
      const callback = observador.mock.calls[0][1] as (u: unknown) => void;
      callback({ uid: 'uid-otro' });
      expect(alFallo).not.toHaveBeenCalled();
      expect(alExito).not.toHaveBeenCalled();
    } finally {
      // La promesa en vuelo siempre se salda (higiene anti-interferencia).
      await promesa;
    }
    // Tras el éxito, el token queda en caché y el oyente lo sirve.
    const alExitoFinal = vi.fn();
    initAuth(alExitoFinal, vi.fn());
    const callbackFinal = observador.mock.calls[1][1] as (u: unknown) => void;
    callbackFinal(USUARIO);
    expect(alExitoFinal).toHaveBeenCalledWith(USUARIO, 'token-reintento');
  }, 10_000);

  it('tras agotar los intentos, isSigningIn se libera (el fallo sí se notifica)', async () => {
    popup
      .mockRejectedValueOnce(new Error('Database is closing'))
      .mockRejectedValueOnce(new Error('Database is closing'));
    await expect(googleSignIn()).rejects.toThrow('Database is closing');
    const alExito = vi.fn();
    const alFallo = vi.fn();
    initAuth(alExito, alFallo);
    const callback = observador.mock.calls[0][1] as (u: unknown) => void;
    // Sin token en caché e isSigningIn liberado → onAuthFailure.
    callback({ uid: 'uid-otro' });
    expect(alFallo).toHaveBeenCalledTimes(1);
    expect(alExito).not.toHaveBeenCalled();
  }, 10_000);
});
