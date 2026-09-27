import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { conReintentoAcotado, esErrorRecuperableDatabaseClosing } from './reintentoAcotado';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];

const provider = new GoogleAuthProvider();
GMAIL_SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;

/**
 * Initialize auth listener.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * DELTA-C (auth): reintento acotado ante `Database is closing` (ver
 * `src/lib/reintentoAcotado.ts`). Máximo DOS intentos en total con espera de
 * 600 ms; el resto del flujo (popup, isSigningIn, scopes, caché de token)
 * queda intacto.
 */
export const MAX_INTENTOS_GOOGLE_SIGNIN = 2;
export const ESPERA_REINTENTO_GOOGLE_MS = 600;

/**
 * Trigger Google Sign-in popup with Gmail scopes.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    return await conReintentoAcotado(
      async () => {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (!credential?.accessToken) {
          throw new Error('No se pudo obtener el token de acceso de Google');
        }

        cachedAccessToken = credential.accessToken;
        return { user: result.user, accessToken: cachedAccessToken };
      },
      esErrorRecuperableDatabaseClosing,
      { maxIntentos: MAX_INTENTOS_GOOGLE_SIGNIN, esperaMs: ESPERA_REINTENTO_GOOGLE_MS }
    );
  } catch (error: any) {
    console.error('Error en autenticación Google Gmail:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Returns the in-memory cached OAuth access token.
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Signs out from Firebase Auth and clears the cached token.
 */
export const logoutGoogle = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};
