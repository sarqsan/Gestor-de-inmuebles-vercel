/**
 * VERIFICADOR DE CONFIGURACIÓN — F3 (búsqueda de titulares)
 * ==========================================================
 * Uso:  npx tsx scripts/verificar-config-titulares.mts
 *
 * La búsqueda de titulares se ejecuta en SERVIDOR: necesita una credencial de
 * servicio de Firebase para leer Firestore y verificar el ID token del usuario.
 * Ninguna de esas credenciales debe existir nunca en el cliente.
 *
 * Este script NO escribe nada en Firestore: sólo comprueba que el entorno
 * está configurado y explica exactamente qué falta.
 */
import { leerCuentaServicio } from '../server/titularidades/googleBackend';

const FUENTES = [
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_SERVICE_ACCOUNT_B64',
  'FIREBASE_SERVICE_ACCOUNT_PATH',
  'GOOGLE_APPLICATION_CREDENTIALS',
];

function main(): void {
  console.log('Verificación de configuración — F3 · búsqueda segura de titulares');
  console.log('----------------------------------------------------------------');
  const presentes = FUENTES.filter((nombre) => Boolean(process.env[nombre]));
  console.log(`Fuentes de credencial configuradas: ${presentes.length ? presentes.join(', ') : 'ninguna'}`);

  const cuenta = leerCuentaServicio(process.env);
  if (!cuenta) {
    console.error('\n✗ El servidor NO tiene credencial de servicio: /api/titulares/buscar responderá 503.');
    console.error('  Defina una de estas variables en el entorno del servidor (nunca en el cliente):');
    console.error('   · FIREBASE_SERVICE_ACCOUNT          → JSON completo de la cuenta de servicio');
    console.error('   · FIREBASE_SERVICE_ACCOUNT_B64      → el mismo JSON codificado en base64');
    console.error('   · FIREBASE_SERVICE_ACCOUNT_PATH     → ruta al fichero JSON');
    console.error('   · GOOGLE_APPLICATION_CREDENTIALS    → ruta al fichero JSON (estándar de Google)');
    console.error('\n  La cuenta necesita, como mínimo, permiso de LECTURA sobre:');
    console.error('   · propietarios   (sólo se devuelven id y nombre)');
    console.error('   · inmuebles      (para comprobar la autorización del llamador)');
    console.error('   · usuarios_auth y usuarios (para resolver el perfil del llamador)');
    process.exit(1);
  }

  console.log(`✓ Credencial válida para el proyecto: ${cuenta.project_id}`);
  console.log(`✓ Cuenta de servicio: ${cuenta.client_email}`);
  console.log('\nEl endpoint /api/titulares/buscar queda operativo (requiere ID token del usuario).');
}

main();
