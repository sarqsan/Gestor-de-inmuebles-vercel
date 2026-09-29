/**
 * BLOQUE 12 · A-04 — Guardia de integridad del repositorio (SOLO LECTURA).
 * ---------------------------------------------------------------------------
 * Comprueba, sin escribir absolutamente nada (ni refs, ni índice, ni ficheros),
 * que el checkout es el esperado y avisa de los síntomas del incidente de
 * custodia observado 7 veces en este proyecto ("HEAD→main + muchos ficheros
 * modificados tras un snapshot").
 *
 * Salida inequívoca: una línea final `A-04: OK` | `A-04: WARNING` | `A-04: BLOCKED`
 * (código de salida 0 / 1 / 2 respectivamente).
 *
 * Uso:
 *   npx tsx scripts/guardia-a04-repositorio.mts
 *   npx tsx scripts/guardia-a04-repositorio.mts --rama arena/01a0e939-gestor-de-inmuebles-vercel
 *
 * NO recupera nada automáticamente: si detecta una anomalía imprime el protocolo
 * manual (docs/BLOQUE-12-REPARACION-INTEGRAL-CIERRE.md §D) y termina sin tocar
 * el repositorio.
 */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAMA_POR_DEFECTO = 'arena/01a0e939-gestor-de-inmuebles-vercel';

/** Referencias conocidas y su valor esperado (se sobreescriben con --esperado). */
const MAIN_ESPERADO = 'c0c82245d1adccf752903765ea554cb3544f1072';

type Nivel = 'OK' | 'WARNING' | 'BLOCKED';
type Hallazgo = { nivel: Nivel; codigo: string; detalle: string };

const args = process.argv.slice(2);
const arg = (nombre: string, porDefecto: string): string => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
const RAMA = arg('rama', RAMA_POR_DEFECTO);
const MAIN = arg('main', MAIN_ESPERADO);

function git(...comando: string[]): string {
  return execFileSync('git', comando, { cwd: RAIZ, encoding: 'utf8' }).trim();
}
function gitSuave(...comando: string[]): { ok: boolean; salida: string } {
  try {
    return { ok: true, salida: git(...comando) };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, salida: `${e.stdout ?? ''}${e.stderr ?? ''}`.trim() };
  }
}

const hallazgos: Hallazgo[] = [];
const anota = (nivel: Nivel, codigo: string, detalle: string): void => {
  hallazgos.push({ nivel, codigo, detalle });
};

// 1 · ¿Estamos dentro de un repositorio git con .git real?
const top = gitSuave('rev-parse', '--show-toplevel');
if (!top.ok) {
  anota('BLOCKED', 'sin-repositorio', 'git rev-parse --show-toplevel ha fallado: no hay repositorio utilizable');
} else if (resolve(top.salida) !== resolve(RAIZ)) {
  anota('BLOCKED', 'raiz-distinta', `la raíz git (${top.salida}) no es el proyecto (${RAIZ})`);
}

// 2 · Rama actual
const ramaActual = gitSuave('rev-parse', '--abbrev-ref', 'HEAD');
if (ramaActual.ok) {
  if (ramaActual.salida === 'HEAD') {
    anota('BLOCKED', 'detached-head', 'HEAD está desacoplado (no apunta a una rama): síntoma del incidente de custodia');
  } else if (ramaActual.salida !== RAMA) {
    anota('WARNING', 'rama-distinta', `rama actual «${ramaActual.salida}» ≠ esperada «${RAMA}»`);
  }
} else {
  anota('BLOCKED', 'sin-rama', `no se puede leer la rama: ${ramaActual.salida}`);
}

// 3 · HEAD y su relación con main (el síntoma central del incidente)
const head = gitSuave('rev-parse', 'HEAD');
const rama = gitSuave('rev-parse', '--verify', `refs/heads/${RAMA}`);
const main = gitSuave('rev-parse', '--verify', `refs/heads/main`);
if (!head.ok) anota('BLOCKED', 'sin-head', 'no se puede resolver HEAD');
if (!rama.ok) anota('BLOCKED', 'rama-ausente', `la rama «${RAMA}» no existe como ref local`);
if (!main.ok) anota('WARNING', 'main-ausente', 'no existe la ref local main');
if (head.ok && main.ok && head.salida === main.salida) {
  anota('BLOCKED', 'head-en-main', 'HEAD apunta al mismo commit que main: síntoma «HEAD→main tras snapshot»');
}
if (head.ok && rama.ok && head.salida !== rama.salida) {
  anota('BLOCKED', 'head-fuera-de-rama', `HEAD (${head.salida.slice(0, 8)}) ≠ punta de ${RAMA} (${rama.salida.slice(0, 8)})`);
}
if (main.ok && main.salida !== MAIN) {
  anota('WARNING', 'main-movido', `main (${main.salida.slice(0, 8)}) ≠ esperado (${MAIN.slice(0, 8)}): NO debe tocarse main en este bloque`);
}

// 4 · Árbol de trabajo: ¿los «modificados» son un árbol ajeno al commit?
const estado = gitSuave('status', '--porcelain=v1');
if (estado.ok) {
  const lineas = estado.salida ? estado.salida.split('\n') : [];
  const borrados = lineas.filter((l) => l.startsWith(' D') || l.startsWith('D '));
  const modificados = lineas.filter((l) => l.trim().length > 0).length;
  if (modificados > 150) {
    anota('BLOCKED', 'arbol-masivo', `${modificados} entradas en «git status»: síntoma de árbol ≠ commit tras snapshot`);
  } else if (borrados.length > 0) {
    anota('WARNING', 'archivos-borrados', `${borrados.length} fichero(s) ausentes del árbol: ${borrados.slice(0, 3).join(', ')}`);
  }
} else {
  anota('BLOCKED', 'sin-status', 'git status ha fallado');
}

// 5 · Índice inconsistente frente a HEAD
const diffIndex = gitSuave('diff', '--cached', '--name-only');
if (!diffIndex.ok) anota('WARNING', 'indice-ilegible', 'no se puede comparar el índice con HEAD');
else if (diffIndex.salida.length > 0) {
  const n = diffIndex.salida.split('\n').length;
  anota('WARNING', 'indice-con-cambios', `${n} fichero(s) en el índice que no están en HEAD (revisar «git diff --cached»)`);
}

// 6 · Divergencia con el remoto (si la ref existe)
const remoto = gitSuave('rev-parse', '--verify', `refs/remotes/origin/${RAMA}`);
if (!remoto.ok) {
  anota('WARNING', 'origin-ausente', `no existe refs/remotes/origin/${RAMA} (puede faltar tras un snapshot)`);
} else if (head.ok && remoto.salida !== head.salida) {
  anota('WARNING', 'divergencia-origin', `HEAD (${head.salida.slice(0, 8)}) ≠ origin/${RAMA} (${remoto.salida.slice(0, 8)})`);
}
const remotoMain = gitSuave('rev-parse', '--verify', 'refs/remotes/origin/main');
if (remotoMain.ok && main.ok && remotoMain.salida !== main.salida) {
  anota('WARNING', 'main-divergente', 'main local ≠ origin/main');
}

// 7 · Objetos referenciados: ¿el commit de HEAD está completo?
if (head.ok) {
  const integridad = gitSuave('rev-list', '--objects', '--missing=print', `${head.salida}^{commit}`);
  if (!integridad.ok) {
    anota('BLOCKED', 'objetos-ausentes', `no se puede recorrer el grafo de objetos de HEAD: ${integridad.salida.slice(0, 200)}`);
  } else if (integridad.salida.includes('?')) {
    const faltan = integridad.salida.split('\n').filter((l) => l.startsWith('?')).length;
    anota('BLOCKED', 'objetos-ausentes', `${faltan} objeto(s) referenciados por HEAD no están en el repositorio (snapshot incompleto)`);
  }
}

// ------------------------------------------------------------------ informe
const nivel: Nivel = hallazgos.some((h) => h.nivel === 'BLOCKED')
  ? 'BLOCKED'
  : hallazgos.some((h) => h.nivel === 'WARNING')
    ? 'WARNING'
    : 'OK';

console.log('=== A-04 · guardia de repositorio (solo lectura) ===');
console.log(`rama esperada : ${RAMA}`);
console.log(`HEAD          : ${head.ok ? head.salida.slice(0, 12) : '??'}`);
console.log(`punta de rama : ${rama.ok ? rama.salida.slice(0, 12) : 'AUSENTE'}`);
console.log(`main          : ${main.ok ? main.salida.slice(0, 12) : 'AUSENTE'} (esperado ${MAIN.slice(0, 12)})`);
console.log(`origin/${RAMA}: ${remoto.ok ? remoto.salida.slice(0, 12) : 'AUSENTE'}`);
console.log(`entradas status: ${estado.ok ? (estado.salida ? estado.salida.split('\n').length : 0) : '??'}`);
for (const h of hallazgos) console.log(`  [${h.nivel}] ${h.codigo}: ${h.detalle}`);
if (nivel !== 'OK') {
  console.log('');
  console.log('Protocolo manual (NO destructivo) — ver docs/BLOQUE-12-REPARACION-INTEGRAL-CIERRE.md §D:');
  console.log('  1. NO ejecutar reset --hard, clean -fd, borrados ni checkout destructivo.');
  console.log('  2. git fetch origin <sha-esperado>            # sólo trae objetos');
  console.log('  3. Verificar blobs: git ls-tree -r <sha> | while read m t s f; do git hash-object "$f"; done');
  console.log('  4. Restaurar refs: git update-ref refs/heads/<rama> <sha>; git update-ref refs/remotes/origin/<rama> <sha>; git update-ref refs/heads/main <sha-main>; git update-ref refs/remotes/origin/main <sha-main>');
  console.log('  5. git reset -q HEAD   (re-sincroniza el índice; NO toca el árbol de trabajo)');
  console.log('  6. Re-ejecutar esta guardia hasta obtener «A-04: OK».');
}
console.log(`A-04: ${nivel}`);
process.exitCode = nivel === 'OK' ? 0 : nivel === 'WARNING' ? 1 : 2;
