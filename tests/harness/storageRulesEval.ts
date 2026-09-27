/**
 * D3 (ORDEN 4 §7/§14) — Evaluador de `storage.rules` sobre el motor del
 * harness Firestore (`firestoreRulesEval.ts`: parsear/evaluar/permisosDe/
 * funcionesDe). Misma metodología fail-loud: lo que no cubre, lanza.
 *
 * Traducciones Storage → motor Firestore:
 *  · `firestore.get(` → `get(` y `firestore.exists(` → `exists(` (la
 *    mini-base `db` HACE de Firestore; los `get()` internos son directos,
 *    igual que en el motor real, que no aplica las Firestore rules a los
 *    `firestore.get()` de Storage).
 *  · `match` por path con `{var}` (un segmento) y `{var=**}` (resto). Si
 *    varios matches encajan, se combinan en OR (semántica Firebase).
 *  · `request.resource` = metadata del objeto entrante (`size`,
 *    `contentType`, `name`) via `requestResource`; `resource` (existente)
 *    no lo usa ninguna condición D3 (solo path-vars + `firestore.get`).
 *  · `read`/`write` se expanden (lo hace `permisosDe`).
 *
 * Límites declarados: no modela `list` con prefijos/delimitadores (se
 * evalúa la condición del `allow list` sin paginación) ni `request.time`;
 * `**` vacía se acepta (los tests usan paths canónicos completos).
 */
import { crearEvaluadorReglas, type Peticion } from './firestoreRulesEval';

export interface PeticionStorage {
  auth: Peticion['auth'];
  /** Mini-base Firestore sintética (`usuarios_auth/uid`, `inmuebles/id`, …). */
  db: Peticion['db'];
  /** Ruta del objeto SIN bucket (p. ej. `gastos_facturas/prop_A/g1/f.pdf`). */
  path: string;
  /** Metadata entrante para create/update (`size`, `contentType`, `name`). */
  metadata?: Record<string, unknown> | null;
}

type Motor = ReturnType<typeof crearEvaluadorReglas>;

interface MatchStorage {
  patron: string;
  segmentos: string[];
  cuerpo: string;
}

function extraerMatches(fuenteSinComentarios: string): MatchStorage[] {
  const salida: MatchStorage[] = [];
  const re = /^[ \t]*match[ \t]+(\/\S+?)[ \t]*\{[ \t]*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fuenteSinComentarios))) {
    if (m[1].startsWith('/b/')) continue; // contenedor del bucket, no regla
    let nivel = 1;
    let i = m.index + m[0].length;
    for (; i < fuenteSinComentarios.length && nivel > 0; i++) {
      if (fuenteSinComentarios[i] === '{') nivel++;
      else if (fuenteSinComentarios[i] === '}') nivel--;
    }
    if (nivel !== 0) throw new Error(`HARNESS STORAGE: match sin cerrar (${m[1]})`);
    const patron = m[1].startsWith('/') ? m[1].slice(1) : m[1];
    salida.push({ patron, segmentos: patron.split('/'), cuerpo: fuenteSinComentarios.slice(m.index, i) });
  }
  return salida;
}

/** Encaje patrón→path con captura de `{var}` y `{var=**}` (resto, ≥0). */
function encajar(segmentos: string[], path: string[]): Map<string, string> | null {
  const vars = new Map<string, string>();
  let i = 0;
  for (let s = 0; s < segmentos.length; s++) {
    const seg = segmentos[s];
    const mm = seg.match(/^\{([A-Za-z_][A-Za-z0-9_]*)(=\*\*)?\}$/);
    if (mm && mm[2]) {
      vars.set(mm[1], path.slice(i).join('/'));
      i = path.length;
      break;
    }
    if (i >= path.length) return null;
    if (mm) vars.set(mm[1], path[i]);
    else if (seg !== path[i]) return null;
    i++;
  }
  return i === path.length ? vars : null;
}

export function crearEvaluadorStorage(storageRules: string, firestoreRules: string) {
  const motor: Motor = crearEvaluadorReglas(firestoreRules);
  const traducido = storageRules
    .split('firestore.get(').join('get(')
    .split('firestore.exists(').join('exists(')
    // Storage escribe el literal `(default)`; el motor espera `$(database)`.
    .split('/databases/(default)/documents/').join('/databases/$(database)/documents/');
  const plano = motor.SIN_COMENTARIOS(traducido);
  const funciones = motor.funcionesDe(plano);
  const matches = extraerMatches(plano);
  if (matches.length === 0) throw new Error('HARNESS STORAGE: sin matches en storage.rules');

  function permiteStorage(
    verbo: 'get' | 'list' | 'create' | 'update' | 'delete',
    pet: PeticionStorage
  ): boolean {
    const segs = pet.path.split('/').filter((s) => s.length > 0);
    const encajes = matches
      .map((mt) => ({ mt, vars: encajar(mt.segmentos, segs) }))
      .filter((e) => e.vars !== null);
    if (encajes.length === 0) return false; // deny-by-default (además del catch-all)
    for (const { mt, vars } of encajes) {
      const permisos = motor.permisosDe(mt.cuerpo);
      const entrada = permisos.get(verbo);
      if (!entrada) continue; // este match no decide el verbo: sigue probando
      const req: Peticion = {
        auth: pet.auth,
        db: pet.db,
        resource: null,
        requestResource: (pet.metadata ?? null) as Peticion['requestResource'],
        docId: segs[segs.length - 1] ?? '',
      };
      const frame = new Map<string, unknown>(vars as Map<string, string>);
      const decision = motor.evaluar(motor.parsear(entrada.condicion), req, funciones, frame);
      if (decision === true) return true;
    }
    return false;
  }

  function bloqueStorageDe(patronParcial: string): string {
    const mt = matches.find((x) => x.patron.includes(patronParcial));
    if (!mt) throw new Error(`HARNESS STORAGE: sin match para ${patronParcial}`);
    return mt.cuerpo;
  }

  return { permiteStorage, bloqueStorageDe, matches: matches.map((x) => x.patron) };
}
