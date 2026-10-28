// Helper compartido por las guardias de custodia (node:test).
// ---------------------------------------------------------------------------
// Estas guardias comparan el árbol de trabajo con la base de la rama. Antes la
// base estaba escrita a mano con un ancestro remoto (f782e53), que ya no era el
// punto de partida: la comparación no podía cumplirse con historial completo y
// el test se omitía —un falso verde silencioso—. Aquí la base se calcula:
//
//   1. `git merge-base HEAD origin/main` (o `main` si no hay remoto),
//   2. el SHA fijado en el manifiesto si el anterior no resuelve,
//   3. error explícito (el test FALLA, nunca se omite) si no hay ninguna base.
//
// Con la base correcta, el manifiesto de custodia se aplica en modo ESTRICTO:
// igualdad byte a byte contra el parche revisado. Si la base ya no es la del
// manifiesto (por ejemplo, en otra rama posterior), se degrada a modo
// INVARIANTE: solo se afirman propiedades que no dependen del punto de partida
// (dependencias intactas, scripts no reescritos, reglas sin cambios…).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function existeCommit(sha, repo) {
  try {
    execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repo, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Base real de la rama. Lanza si no se puede determinar: no se omite nada. */
export function baseDeRama(repo, manifiesto) {
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  let motivo = '';
  for (const ref of ['origin/main', 'main']) {
    try {
      const sha = git('merge-base', 'HEAD', ref);
      if (sha && existeCommit(sha, repo)) return { sha, modo: 'merge-base', ref, estricto: sha === manifiesto.base };
    } catch (error) {
      motivo += ` ${ref}: ${String(error.message).split('\n')[0]}`;
    }
  }
  if (existeCommit(manifiesto.base, repo)) {
    return { sha: manifiesto.base, modo: 'sha-manifiesto', ref: manifiesto.base, estricto: true };
  }
  throw new Error(
    `CUSTODIA: no hay base verificable (merge-base con main ni el SHA del manifiesto ${manifiesto.base}).${motivo}`,
  );
}

/** Texto del fichero `path` en el commit `sha`, con el parche revisado aplicado. */
export function ficheroConParche(manifiesto, sha, path, repo) {
  const entradas = (manifiesto.parches ?? manifiesto.ficheros)?.[path];
  if (!entradas) throw new Error(`CUSTODIA: sin parche revisado para ${path}`);
  if (sha !== manifiesto.base) {
    throw new Error(`CUSTODIA: el parche de ${path} solo es válido sobre la base ${manifiesto.base}`);
  }
  let esperado = execFileSync('git', ['show', `${sha}:${path}`], { cwd: repo, encoding: 'utf8' });
  for (const { viejo, nuevo } of entradas) {
    const apariciones = esperado.split(viejo).length - 1;
    if (apariciones !== 1) {
      throw new Error(`CUSTODIA: el ancla del parche de ${path} aparece ${apariciones} veces (se exige exactamente 1)`);
    }
    esperado = esperado.replace(viejo, nuevo);
  }
  return esperado;
}

export function leerManifiesto(url) {
  return JSON.parse(readFileSync(url, 'utf8'));
}
