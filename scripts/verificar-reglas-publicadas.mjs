#!/usr/bin/env node
/**
 * VERIFICA QUE LO PUBLICADO EN LA CONSOLA ES EL FICHERO DEL REPOSITORIO
 * ====================================================================
 * Problema que resuelve: el emulador de CI prueba el **comportamiento** de
 * `firestore.rules`, pero no puede saber qué hay publicado en el proyecto de
 * Firebase. El simulador de la consola prueba el comportamiento de lo publicado,
 * pero hay que rellenar seis formularios a mano y es fácil equivocarse.
 *
 * Camino corto: si el texto publicado es **idéntico** al del fichero, y el
 * fichero ya está probado en el emulador, entonces lo publicado se comporta como
 * el fichero. Eso es una cadena de dos eslabones verificables, no una suposición.
 *
 * Uso (sin alias en `package.json`: ese fichero está custodiado por
 * `src/features/operaciones/tests/integration-boundaries.test.mjs`, y añadir un
 * script lo cambiaría sin manifiesto revisado; la invocación directa basta):
 *   1. En la consola → Firestore → Reglas: clic dentro del editor, Ctrl+A, Ctrl+C.
 *   2. Pegar en un fichero, p. ej. `reglas-consola.txt`.
 *   3. `node scripts/verificar-reglas-publicadas.mjs reglas-consola.txt`
 *
 * Solo lectura: no toca la consola ni el repositorio.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FICHERO_REPO = 'firestore.rules';

/**
 * Normaliza para comparar sin falsos negativos por formato:
 *  - finales de línea Windows → Unix
 *  - espacios/sangría al FINAL de cada línea
 *  - líneas vacías al final
 * No toca la indentación interna ni el contenido: `if false` sigue siendo
 * `if false` y `allow` sigue siendo `allow`.
 */
export function normalizarReglas(texto) {
  return String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((linea) => linea.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '\n');
}

export function huellaReglas(texto) {
  return createHash('sha256').update(normalizarReglas(texto), 'utf8').digest('hex');
}

export function contarLineas(texto) {
  const normalizado = normalizarReglas(texto);
  if (normalizado === '') return 0;
  return normalizado.replace(/\n$/, '').split('\n').length;
}

/** Primera línea distinta entre dos textos normalizados (1-based), o 0. */
export function primeraDiferencia(a, b) {
  const la = normalizarReglas(a).replace(/\n$/, '').split('\n');
  const lb = normalizarReglas(b).replace(/\n$/, '').split('\n');
  const total = Math.max(la.length, lb.length);
  for (let i = 0; i < total; i += 1) {
    if (la[i] !== lb[i]) return i + 1;
  }
  return 0;
}

/** Compara el texto pegado de la consola con el fichero del repo. */
export function compararConRepo(textoConsola, textoRepo) {
  const igual = huellaReglas(textoConsola) === huellaReglas(textoRepo);
  const linea = igual ? 0 : primeraDiferencia(textoConsola, textoRepo);
  const lineasConsola = contarLineas(textoConsola);
  const lineasRepo = contarLineas(textoRepo);
  let motivo = null;
  if (!igual) {
    if (lineasConsola !== lineasRepo) {
      motivo =
        `el texto publicado tiene ${lineasConsola} líneas y el del repositorio ${lineasRepo}. ` +
        'No es el mismo fichero.';
    } else {
      motivo =
        `mismo número de líneas (${lineasRepo}) pero contenido distinto: ` +
        `la primera diferencia está en la línea ${linea}.`;
    }
  }
  return {
    igual,
    linea,
    lineasConsola,
    lineasRepo,
    huellaConsola: huellaReglas(textoConsola),
    huellaRepo: huellaReglas(textoRepo),
    motivo,
  };
}

function main(argv) {
  const ruta = argv[2];
  if (!ruta || ruta === '--help' || ruta === '-h') {
    console.log('Uso: node scripts/verificar-reglas-publicadas.mjs <fichero-con-el-texto-de-la-consola>');
    console.log('');
    console.log('  1. Consola → Firestore → Reglas → clic en el editor → Ctrl+A → Ctrl+C');
    console.log('  2. Pegar en un fichero (p. ej. reglas-consola.txt)');
    console.log('  3. node scripts/verificar-reglas-publicadas.mjs reglas-consola.txt');
    return ruta ? 0 : 2;
  }

  const rutaAbs = resolve(process.cwd(), ruta);
  if (!existsSync(rutaAbs)) {
    console.error(`✗ No existe el fichero «${ruta}».`);
    console.error('  Crea un fichero de texto y pega ahí lo que has copiado de la consola.');
    return 2;
  }
  const rutaRepo = resolve(process.cwd(), FICHERO_REPO);
  if (!existsSync(rutaRepo)) {
    console.error(`✗ No encuentro ${FICHERO_REPO}. Ejecuta esto desde la raíz del repositorio.`);
    return 2;
  }

  const textoConsola = readFileSync(rutaAbs, 'utf8');
  const textoRepo = readFileSync(rutaRepo, 'utf8');
  const r = compararConRepo(textoConsola, textoRepo);

  console.log('');
  console.log(`  publicado en la consola : ${r.lineasConsola} líneas · sha256 ${r.huellaConsola.slice(0, 16)}…`);
  console.log(`  ${FICHERO_REPO.padEnd(23)}: ${r.lineasRepo} líneas · sha256 ${r.huellaRepo.slice(0, 16)}…`);
  console.log('');

  if (r.igual) {
    console.log('✓ OK — lo publicado en la consola es EXACTAMENTE el fichero del repositorio.');
    console.log('');
    console.log('  Qué demuestra esto:');
    console.log('   · este texto es el mismo que el emulador de CI prueba en cada PR');
    console.log('     (allí se ejecuta la batería de reglas sobre este fichero);');
    console.log('   · por tanto lo publicado se comporta como lo probado.');
    console.log('');
    console.log('  Qué NO demuestra: que los datos de producción estén sanos. Eso es otra cosa.');
    return 0;
  }

  console.log('✗ DISTINTO — lo publicado NO es el fichero del repositorio.');
  console.log(`  ${r.motivo}`);
  console.log('');
  console.log('  Qué hacer:');
  console.log('   · NO revertir ni publicar nada todavía;');
  console.log('   · vuelve a copiar el texto completo (Ctrl+A dentro del editor) y repite;');
  console.log('   · si sigue igual, guarda el fichero y avísame: hay que ver qué versión');
  console.log('     hay publicada antes de tocar nada.');
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv);
}

export { main };
