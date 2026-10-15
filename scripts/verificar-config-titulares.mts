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
import { resolverAccesoFirebase } from '../server/titularidades/configuracionFirebase.js';

// Solo validación local, sin red; no imprime valores de credenciales.
const acceso = resolverAccesoFirebase(process.env);
if (acceso.errorConfiguracion) {
  console.error(`Configuración Firebase bloqueada: ${acceso.errorConfiguracion}`);
  process.exitCode = 1;
} else {
  console.log('Configuración local de titulares coherente con el ERP. Permisos y conectividad pendientes de prueba autorizada.');
}
