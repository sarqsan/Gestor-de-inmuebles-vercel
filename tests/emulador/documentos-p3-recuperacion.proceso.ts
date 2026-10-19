/**
 * P3 — Recuperación ENTRE PROCESOS de un documento profesional.
 * ---------------------------------------------------------------------------
 * Proceso Node independiente (lanzado con spawnSync desde
 * documentos-p3.emulador.test.ts): no comparte memoria, caché del SDK ni sesión
 * con el proceso que subió el archivo. Inicia sesión en el Auth Emulator con
 * credenciales sintéticas, crea instancias NUEVAS de Firestore/Storage apuntadas
 * a los emuladores locales y usa el MISMO adaptador de la app para descargar y
 * verificar la huella. Escribe un JSON en stdout.
 *
 * Fail-closed: `validarEntornoP2()` exige NODE_ENV=test, proyecto demo y hosts
 * 127.0.0.1 exactos, sin credenciales de servicio. No importa src/lib/firebase.ts.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { crearAdaptadorDocumentosProfesionales, sha256DeBytes } from '../../src/lib/expedienteDocumental/documentosProfesionalesFirebase';
import { validarEntornoP2, PROYECTO_P2, BUCKET_P2 } from './justificantes-cobro.emulador-util';

async function main(): Promise<void> {
  validarEntornoP2();
  const [email, clave, profesionalId, documentoId] = process.argv.slice(2);
  if (!email?.endsWith('.invalid') || !clave || !profesionalId || !/^dpr_[a-f0-9]{64}$/.test(documentoId || '')) {
    throw new Error('P3_ARGUMENTOS_RECUPERACION_INVALIDOS');
  }
  const app = initializeApp({ projectId: PROYECTO_P2, apiKey: 'p3-demo-api-key', storageBucket: BUCKET_P2 }, 'p3-recuperacion');
  try {
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const db = getFirestore(app);
    const [fsHost, fsPort] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
    connectFirestoreEmulator(db, fsHost, Number(fsPort));
    const storage = getStorage(app);
    const [stHost, stPort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST!.split(':');
    connectStorageEmulator(storage, stHost, Number(stPort));
    await signInWithEmailAndPassword(auth, email, clave);

    const adaptador = crearAdaptadorDocumentosProfesionales({ db, storage, auth, auditar: async () => undefined });
    try {
      const descarga = await adaptador.descargar(profesionalId, documentoId);
      process.stdout.write(JSON.stringify({
        ok: true,
        pid: process.pid,
        sha256: await sha256DeBytes(descarga.bytes),
        size: descarga.bytes.byteLength,
        verificacion: descarga.verificacion.estado,
      }));
    } catch (error) {
      process.stdout.write(JSON.stringify({
        ok: false,
        pid: process.pid,
        codigo: (error as { codigo?: string; code?: string }).codigo || (error as { code?: string }).code || 'desconocido',
      }));
      process.exitCode = 2;
    }
  } finally {
    await deleteApp(app);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(error instanceof Error ? error.message : 'P3_RECUPERACION_FALLIDA');
  process.exitCode = 1;
});
