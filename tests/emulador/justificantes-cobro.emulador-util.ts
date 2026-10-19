import type { ImplementacionFetch, CuentaServicio } from '../../server/titularidades/googleBackend';
import { ClienteFirestoreRest } from '../../server/titularidades/googleBackend';
import { ClienteGoogleStorageRest } from '../../server/cobros/almacenGoogleStorage';
import type { IdentidadVerificada } from '../../server/titularidades/googleBackend';

export const PROYECTO_P2 = 'demo-gestor-reglas';
export const BASE_DATOS_P2 = 'ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51';
export const BUCKET_P2 = `${PROYECTO_P2}.appspot.com`;

const CREDENCIALES = [
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_SERVICE_ACCOUNT_B64',
  'FIREBASE_SERVICE_ACCOUNT_PATH',
  'GOOGLE_APPLICATION_CREDENTIALS',
] as const;

function hostsEmulador(): Set<string> {
  validarEntornoP2();
  return new Set([
    process.env.FIRESTORE_EMULATOR_HOST!,
    process.env.FIREBASE_STORAGE_EMULATOR_HOST!,
    process.env.FIREBASE_AUTH_EMULATOR_HOST!,
  ]);
}

export function validarEntornoP2(): void {
  if (process.env.NODE_ENV !== 'test' || process.env.VERCEL || process.env.VERCEL_ENV
    || process.env.GCLOUD_PROJECT !== PROYECTO_P2
    || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199'
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
    || CREDENCIALES.some((variable) => process.env[variable] !== undefined)) {
    throw new Error('P2_ACEPTACION_REQUIERE_EMULADORES_LOCALES_DEMO');
  }
}

/** Fetch cerrado: ningún request de estas pruebas puede salir a un host externo. */
export const fetchSoloEmuladores: ImplementacionFetch = async (url, init) => {
  const destino = new URL(url);
  if (destino.protocol !== 'http:' || !hostsEmulador().has(destino.host)) {
    throw new Error('P2_ACEPTACION_BLOQUEO_RED_EXTERNA');
  }
  return await fetch(url, init as RequestInit) as unknown as Awaited<ReturnType<ImplementacionFetch>>;
};

export function cuentaSinteticaEmulador(): CuentaServicio {
  validarEntornoP2();
  return {
    project_id: PROYECTO_P2,
    client_email: 'p2-aceptacion@demo-gestor-reglas.invalid',
    private_key: 'no-se-utiliza-en-el-emulador',
  };
}

export function crearFirestoreP2(): ClienteFirestoreRest {
  return new ClienteFirestoreRest({
    cuenta: cuentaSinteticaEmulador(),
    baseDatosId: BASE_DATOS_P2,
    fetchImpl: fetchSoloEmuladores,
    usarEmuladorFirebase: true,
  });
}

export function crearStorageP2(fetchImpl: ImplementacionFetch = fetchSoloEmuladores): ClienteGoogleStorageRest {
  return new ClienteGoogleStorageRest({
    cuenta: cuentaSinteticaEmulador(),
    bucket: BUCKET_P2,
    fetchImpl,
    usarEmuladorFirebase: true,
  });
}

function authUrl(path: string): string {
  validarEntornoP2();
  return `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/${path}`;
}

export interface CuentaAuthEmulador {
  uid: string;
  idToken: string;
  email: string;
}

export async function crearCuentaAuthEmulador(email: string): Promise<CuentaAuthEmulador> {
  const response = await fetchSoloEmuladores(
    `${authUrl('accounts:signUp')}?key=p2-demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Solo-emulador-42!p2', returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new Error(`P2_AUTH_EMULATOR_SIGNUP_HTTP_${response.status}`);
  const data = await response.json() as { localId?: unknown; idToken?: unknown };
  if (typeof data.localId !== 'string' || typeof data.idToken !== 'string') {
    throw new Error('P2_AUTH_EMULATOR_SIGNUP_INVALIDO');
  }
  return { uid: data.localId, idToken: data.idToken, email };
}

export async function borrarCuentaAuthEmulador(idToken: string): Promise<void> {
  const response = await fetchSoloEmuladores(
    `${authUrl('accounts:delete')}?key=p2-demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok && response.status !== 400) {
    throw new Error(`P2_AUTH_EMULATOR_DELETE_HTTP_${response.status}`);
  }
}

export async function verificarTokenAuthEmulador(token: string): Promise<IdentidadVerificada | null> {
  const response = await fetchSoloEmuladores(
    `${authUrl('accounts:lookup')}?key=p2-demo-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    },
  );
  if (!response.ok) return null;
  const data = await response.json() as { users?: Array<{ localId?: unknown; email?: unknown }> };
  const user = data.users?.[0];
  if (!user || typeof user.localId !== 'string') return null;
  return { uid: user.localId, ...(typeof user.email === 'string' ? { email: user.email } : {}) };
}
