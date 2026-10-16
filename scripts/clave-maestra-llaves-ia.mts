#!/usr/bin/env tsx
/**
 * IA · FASE 9 — CLAVE MAESTRA DE LAS LLAVES DE USUARIO (operador)
 * ================================================================
 *   npm run ia:llaves:clave-maestra              → genera una clave maestra NUEVA
 *                                                   (32 bytes, base64) para guardarla
 *                                                   como secreto IA_LLAVES_CLAVE_MAESTRA.
 *   npm run ia:llaves:clave-maestra -- --verificar → comprueba la variable configurada
 *                                                   en el entorno SIN imprimirla.
 *
 * No escribe ficheros ni toca Firestore. La clave generada se imprime UNA vez
 * por la salida estándar para que el operador la copie al gestor de secretos;
 * nunca se registra en logs del servidor.
 */
import { generarClaveMaestraLlaves, resolverClaveMaestraLlaves } from '../server/ia/cifradoLlavesIA.js';
import { VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES } from '../src/ia/llavesUsuarioContrato.js';

const args = process.argv.slice(2);

if (args.includes('--verificar')) {
  const resolucion = resolverClaveMaestraLlaves(process.env);
  if (resolucion.estado === 'VALIDA') {
    console.log(`${VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES}: VÁLIDA (32 bytes). Las llaves de usuario pueden custodiarse.`);
    process.exit(0);
  }
  if (resolucion.estado === 'AUSENTE') {
    console.log(`${VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES}: AUSENTE. El subsistema de llaves queda NO_CONFIGURADO (nadie puede registrar llaves; no se crea el cliente del proveedor).`);
    process.exit(1);
  }
  console.log(`${VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES}: INVÁLIDA — ${resolucion.error}. El servidor bloquea las operaciones de IA (fallo cerrado).`);
  process.exit(1);
}

const clave = generarClaveMaestraLlaves();
console.log('Clave maestra nueva (guárdala como secreto del servidor y NO la commitees):');
console.log('');
console.log(`${VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES}=${clave}`);
console.log('');
console.log('Aviso: cambiar la clave maestra invalida las llaves ya cifradas; los usuarios tendrían que registrarlas de nuevo.');
