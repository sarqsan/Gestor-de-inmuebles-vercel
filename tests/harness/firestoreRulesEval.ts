/**
 * Evaluador de `firestore.rules` — INFRA COMPARTIDA por los tests de reglas (GAP 5 §38 y
 * FASE 1.4 espejo de identidad). NACE del test de GAP 5 y se extrae aquí para que haya UN
 * solo criterio de evaluación; no es una segunda implementación de nada: lee el fichero
 * real y evalúa SUS funciones y SUS `allow`.
 *
 * Metodología (por qué existe esto y qué NO es):
 *  · No hay emulador de Firebase en este entorno (sin `firebase-tools`, sin JRE y sin
 *    acceso al drop de los emuladores), así que el motor de Google no ejecuta las reglas.
 *  · Se lee el fichero real y se evalúa el subconjunto del lenguaje que usan los bloques
 *    bajo prueba: `&& || ! == != <> in matches is + - ?:`, `size() keys() values() get()
 *    hasAny() diff().affectedKeys()`, rutas de plantilla `$( … )`, `let`/`return` dentro de
 *    las `function`, y `request.auth` / `resource` / `request.resource`.
 *  · Es EXPRESIVO por diseño: ante cualquier construcción no cubierta LANZA
 *    (`HARNESS NO CUBRE`) en vez de devolver `true`. Imposible que una regla nueva se cuele
 *    como "permitida" o se valide en falso por omisión.
 *  · Fija la SEMÁNTICA del fichero que se despliega; no sustituye la prueba contra
 *    `firebase emulators:exec`, que sigue pendiente en un entorno con red y Java.
 */

/** Petición simulada: auth, documentos de la mini-base, recurso existente y entrante. */
export interface Peticion {
  auth: { uid: string; token?: { email?: string } } | null;
  db: Record<string, Record<string, unknown>>;
  resource: Record<string, unknown> | null;
  requestResource: Record<string, unknown> | null;
  docId: string;
}

export function crearEvaluadorReglas(RULES: string) {
  // ===========================================================================
  // 1) LECTURA DEL FICHERO: funciones y `allow` del bloque de la colección
  // ===========================================================================

  /** Cuerpo completo de `match /{coleccion}/{param} { … }`, con llaves anidadas (incluye sub-matches). */
  function bloqueCompletoDe(coleccion: string): string {
    const inicio = RULES.indexOf(`match /${coleccion}/`);
    if (inicio < 0) throw new Error(`No existe el bloque de ${coleccion} en firestore.rules`);
    let nivel = 0;
    // la línea es `match /coleccion/{param} {`: se abre en la última llave de esa línea
    for (let i = RULES.indexOf('{\n', inicio); i < RULES.length; i++) {
      if (RULES[i] === '{') nivel++;
      else if (RULES[i] === '}') {
        nivel--;
        if (nivel === 0) return RULES.slice(inicio, i + 1);
      }
    }
    throw new Error(`Bloque de ${coleccion} sin cerrar`);
  }

  /**
   * Bloque PROPIO de la colección: el `match /{coleccion}/{param} { … }` SIN los `match`
   * anidados (subcolecciones). En las reglas de Firestore un `allow` de un sub-match solo
   * rige la subcolección (p. ej. `usuarios_auth/{uid}/progreso_tutoriales/{id}`), nunca el
   * documento padre; si se leyeran planos se mezclarían con los `allow` del espejo de
   * identidad y se evaluaría una regla que no es la de `usuarios_auth/{uid}`. Cada
   * sub-match se sustituye por un comentario (misma longitud de líneas irrelevante: los
   * consumidores trabajan sobre texto sin comentarios). Para bloques sin sub-matches el
   * resultado es idéntico al bloque completo.
   */
  function bloqueDe(coleccion: string): string {
    const completo = bloqueCompletoDe(coleccion);
    const cabeceraFin = completo.indexOf('{\n') + 1;
    let cuerpo = completo.slice(cabeceraFin);
    // la cabecera es `match /ruta/{param} {` — el bloque se abre en la ÚLTIMA llave de la
    // línea (las llaves de `{param}` son parte de la ruta, no del cuerpo)
    const reMatchAnidado = /^[ \t]*match\s+\/[^\n]*\{[ \t]*$/m;
    let m: RegExpMatchArray | null;
    while ((m = cuerpo.match(reMatchAnidado))) {
      const ini = m.index as number;
      let nivel = 0;
      let fin = -1;
      for (let i = ini + m[0].lastIndexOf('{'); i < cuerpo.length; i++) {
        if (cuerpo[i] === '{') nivel++;
        else if (cuerpo[i] === '}') {
          nivel--;
          if (nivel === 0) { fin = i + 1; break; }
        }
      }
      if (fin < 0) throw new Error(`Sub-match anidado sin cerrar dentro de ${coleccion}`);
      const ruta = m[0].trim().replace(/\s*\{$/, '');
      cuerpo = `${cuerpo.slice(0, ini)}/* [harness] sub-match anidado omitido: ${ruta} */${cuerpo.slice(fin)}`;
    }
    return completo.slice(0, cabeceraFin) + cuerpo;
  }

  /** Cuerpo del `match /databases/{database}/documents` (donde viven las funciones globales). */
  function cuerpoRaiz(): string {
    const inicio = RULES.indexOf('match /databases/{database}/documents');
    let nivel = 0;
    for (let i = RULES.indexOf('{\n', inicio); i < RULES.length; i++) {
      if (RULES[i] === '{') nivel++;
      else if (RULES[i] === '}') {
        nivel--;
        if (nivel === 0) return RULES.slice(inicio, i + 1);
      }
    }
    throw new Error('Bloque raíz sin cerrar');
  }

  const SIN_COMENTARIOS = (src: string): string =>
    src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  /** Todas las `function nombre(params) { return expr; }` visibles en el ámbito dado. */
  function funcionesDe(src: string): Map<string, { params: string[]; cuerpo: string }> {
    const plano = SIN_COMENTARIOS(src);
    const salida = new Map<string, { params: string[]; cuerpo: string }>();
    const re = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(plano))) {
      let nivel = 1;
      let i = m.index + m[0].length;
      for (; i < plano.length && nivel > 0; i++) {
        if (plano[i] === '{') nivel++;
        else if (plano[i] === '}') nivel--;
      }
      // el cuerpo se guarda ENTERO (con sus `let`): `indexIsTruthful()` de la FASE 1.4
      // encadena tres asignaciones locales antes del `return`
      const cuerpo = plano.slice(m.index + m[0].length, i - 1);
      salida.set(m[1], {
        params: m[2].split(',').map((p) => p.trim()).filter(Boolean),
        cuerpo: /\breturn\b/.test(cuerpo) ? cuerpo.trim() : 'false',
      });
    }
    return salida;
  }

  /** Sentencias de un cuerpo separadas por `;` a profundidad 0 (respetando comillas y llaves). */
  function sentencias(cuerpo: string): string[] {
    const salida: string[] = [];
    let nivel = 0, actual = '', dentroDeComilla: string | null = null;
    for (let i = 0; i < cuerpo.length; i++) {
      const c = cuerpo[i];
      if (dentroDeComilla) {
        actual += c;
        if (c === dentroDeComilla && cuerpo[i - 1] !== '\\') dentroDeComilla = null;
        continue;
      }
      if (c === "'" || c === '"') { dentroDeComilla = c; actual += c; continue; }
      if (c === '(' || c === '[' || c === '{') nivel++;
      else if (c === ')' || c === ']' || c === '}') nivel--;
      if (c === ';' && nivel === 0) { salida.push(actual.trim()); actual = ''; continue; }
      actual += c;
    }
    if (actual.trim()) salida.push(actual.trim());
    return salida.filter(Boolean);
  }

  /** Ejecuta el cuerpo de una `function` del fichero: `let x = …;` … `return …;`. */
  function evaluarCuerpo(cuerpo: string, req: Peticion, funciones: Funciones, frame: Map<string, unknown>): unknown {
    const local = new Map(frame);
    for (const stmt of sentencias(cuerpo)) {
      const asign = stmt.match(/^let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
      if (asign) { local.set(asign[1], evaluar(parsear(asign[2]), req, funciones, local)); continue; }
      const ret = stmt.match(/^return\s+([\s\S]+)$/);
      if (ret) return evaluar(parsear(ret[1]), req, funciones, local);
      throw new Error(`HARNESS NO CUBRE: sentencia de función (${stmt.slice(0, 48)}…)`);
    }
    throw new Error('HARNESS NO CUBRE: función sin return');
  }

  /** `allow get/list/create/update/delete: if <cond>;` del bloque (condiciones multilínea incluidas). */
  function permisosDe(bloque: string): Map<string, { verbos: string[]; condicion: string }> {
    const plano = SIN_COMENTARIOS(bloque);
    const salida = new Map<string, { verbos: string[]; condicion: string }>();
    const re = /allow\s+([a-z,\s]+?):\s*if\s+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(plano))) {
      const verbos = m[1].split(',').map((v) => v.trim()).filter(Boolean);
      let i = m.index + m[0].length;
      let nivel = 0;
      const inicio = i;
      for (; i < plano.length; i++) {
        const c = plano[i];
        if (c === '(' || c === '[') nivel++;
        else if (c === ')' || c === ']') nivel--;
        else if (c === ';' && nivel === 0) break;
      }
      // alias de Firestore: `read` = get|list, `write` = create|update|delete
      const efectivos = verbos.flatMap((v) => (v === 'read' ? ['get', 'list'] : v === 'write' ? ['create', 'update', 'delete'] : [v]));
      const condicion = plano.slice(inicio, i).trim();
      for (const v of verbos) salida.set(v, { verbos, condicion });
      for (const v of efectivos) if (!salida.has(v)) salida.set(v, { verbos, condicion });
    }
    return salida;
  }

  // ===========================================================================
  // 2) EVALUADOR DE SUBCONJUNTO (fail-loud: lo que no conoce, lanza)
  // ===========================================================================

  type Nodo =
    | { k: 'lit'; v: unknown }
    | { k: 'list'; items: Nodo[] }
    | { k: 'path'; partes: (string | Nodo)[] }
    | { k: 'ident'; nombre: string }
    | { k: 'field'; obj: Nodo; nombre: string }
    | { k: 'index'; obj: Nodo; idx: Nodo }
    | { k: 'call'; obj: Nodo | null; nombre: string; args: Nodo[] }
    | { k: 'bin'; op: string; l: Nodo; r: Nodo }
    | { k: 'not'; e: Nodo }
    | { k: 'is'; e: Nodo; tipo: string }
    | { k: 'ternario'; c: Nodo; a: Nodo; b: Nodo }
    | { k: 'size' /* marcador interno, nunca usado directamente */ };

  const MISSING = Symbol('missing');
  /** Envoltorio de documento (`resource`, `request.resource`, `get(...)`): permite `.data`/`.id`. */
  const DOC = (mapa: Record<string, unknown> | null) => ({ __doc: mapa });
  const esDoc = (v: unknown): v is { __doc: Record<string, unknown> | null } =>
    Boolean(v) && typeof v === 'object' && '__doc' in (v as object);

  function lex(src: string): string[] {
    const toks: string[] = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '`') {
        const fin = src.indexOf('`', i + 1);
        if (fin < 0) throw new Error('path template sin cerrar');
        toks.push(src.slice(i, fin + 1));
        i = fin + 1;
        continue;
      }
      // plantilla de ruta sin comillas: /databases/$(database)/documents/x/$(y)
      if (c === '/' && /[A-Za-z_]/.test(src[i + 1] || '')) {
        let j = i + 1;
        let nivel = 0; // los $() de la plantilla llevan paréntesis propios
        while (j < src.length) {
          const d = src[j];
          if (d === '(') nivel++;
          else if (d === ')') { if (nivel === 0) break; nivel--; }
          else if (/\s/.test(d) || (d === ',' && nivel === 0)) break;
          j++;
        }
        toks.push('\u0001' + src.slice(i, j));
        i = j;
        continue;
      }
      if (c === "'" || c === '"') {
        let j = i + 1;
        while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
        toks.push(src.slice(i, j + 1));
        i = j + 1;
        continue;
      }
      const ops = ['&&', '||', '==', '!=', '>=', '<=', '<', '>', '!', '(', ')', '[', ']', ',', '.', '+', '-', ':', '?'];
      const op = ops.find((o) => src.startsWith(o, i));
      if (op) { toks.push(op); i += op.length; continue; }
      const m = /^[A-Za-z_$][A-Za-z0-9_]*/.exec(src.slice(i)) || /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new Error(`HARNESS NO CUBRE: carácter ${JSON.stringify(c)} en ${JSON.stringify(src.slice(i, i + 30))}`);
      toks.push(m[0]);
      i += m[0].length;
    }
    return toks;
  }

  function parsear(src: string): Nodo {
    const toks = lex(src);
    let p = 0;
    const peek = () => toks[p];
    const eat = (t: string) => {
      if (toks[p] !== t) throw new Error(`HARNESS NO CUBRE: se esperaba ${t}, hay ${JSON.stringify(toks[p])}`);
      p++;
    };

    function primario(): Nodo {
      const t = peek();
      if (t === '(') { p++; const e = expr(); eat(')'); return e; }
      if (t === '!') { p++; return { k: 'not', e: primario() }; }
      if (t === '[') {
        p++; const items: Nodo[] = [];
        if (peek() !== ']') { for (;;) { items.push(expr()); if (peek() === ',') { p++; continue; } break; } }
        eat(']');
        return { k: 'list', items };
      }
      if (t && (t.startsWith('`') || t.startsWith('\u0001'))) {
        p++;
        const bruto = t.startsWith('`') ? t.slice(1, -1) : t.slice(1);
        const partes: (string | Nodo)[] = [];
        // `$( … )` admite llamadas anidadas: se balancean paréntesis en vez de cortar en el primer `)`.
        let ult = 0;
        for (;;) {
          const k = bruto.indexOf('$(', ult);
          if (k < 0) break;
          let nivel = 0;
          let f = k + 1;
          for (; f < bruto.length; f++) {
            const ch = bruto[f];
            if (ch === '(') nivel++;
            else if (ch === ')') { nivel--; if (nivel === 0) break; }
          }
          if (nivel !== 0) throw new Error('HARNESS NO CUBRE: interpolation $( sin cerrar en el path');
          if (k > ult) partes.push(bruto.slice(ult, k));
          partes.push(parsear(bruto.slice(k + 2, f)));
          ult = f + 1;
        }
        if (ult < bruto.length) partes.push(bruto.slice(ult));
        return { k: 'path', partes };
      }
      if (t && /^'/.test(t)) { p++; return { k: 'lit', v: t.slice(1, -1) }; }
      if (t && /^[0-9]/.test(t)) { p++; return { k: 'lit', v: Number(t) }; }
      if (t === 'true' || t === 'false') { p++; return { k: 'lit', v: t === 'true' }; }
      if (!t || !/^[A-Za-z_$]/.test(t)) throw new Error(`HARNESS NO CUBRE: token ${JSON.stringify(t)}`);
      p++;
      let nodo: Nodo = { k: 'ident', nombre: t };
      for (;;) {
        if (peek() === '.') {
          p++;
          const nombre = toks[p++];
          if (!nombre || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(nombre)) throw new Error(`HARNESS NO CUBRE: acceso tras punto (${JSON.stringify(nombre)})`);
          if (peek() === '(') { p++; const args = argumentos(); nodo = { k: 'call', obj: nodo, nombre, args }; }
          else nodo = { k: 'field', obj: nodo, nombre };
          continue;
        }
        if (peek() === '(') { p++; const args = argumentos(); nodo = { k: 'call', obj: null, nombre: t, args }; continue; }
        // acceso dinámico por índice: `existing()[nombre]` (usado por
        // `campoListaActual` y compañía). Sigue el mismo criterio fail-loud.
        if (peek() === '[') {
          p++;
          const idx = expr();
          eat(']');
          nodo = { k: 'index', obj: nodo, idx };
          continue;
        }
        break;
      }
      return nodo;
    }

    function argumentos(): Nodo[] {
      const args: Nodo[] = [];
      if (peek() === ')') { p++; return args; }
      for (;;) {
        args.push(expr());
        if (peek() === ',') { p++; continue; }
        eat(')');
        return args;
      }
    }

    function aditivo(): Nodo {
      let l = primario();
      while (peek() === '+' || peek() === '-') {
        const op = toks[p++];
        l = { k: 'bin', op, l, r: primario() };
      }
      return l;
    }

    function comparacion(): Nodo {
      let l = aditivo();
      const t = peek();
      if (t === '==') { p++; return { k: 'bin', op: '==', l, r: aditivo() }; }
      if (t === '!=') { p++; return { k: 'bin', op: '!=', l, r: aditivo() }; }
      if (t === '>' || t === '<' || t === '>=' || t === '<=') { p++; return { k: 'bin', op: t, l, r: aditivo() }; }
      if (t === 'in') { p++; return { k: 'bin', op: 'in', l, r: aditivo() }; }
      if (t === 'matches') { p++; return { k: 'bin', op: 'matches', l, r: aditivo() }; }
      if (t === 'is') { p++; const tipo = toks[p++]; if (!peek() || peek() === '&&' || peek() === '||' || peek() === ')' || peek() === '?' || peek() === ',' || peek() === ']' || peek() === ':') return { k: 'is', e: l, tipo }; throw new Error(`HARNESS NO CUBRE: tras is ${tipo}: ${JSON.stringify(peek())}`); }
      return l;
    }

    function or(): Nodo {
      let l = and();
      while (peek() === '||') { p++; l = { k: 'bin', op: '||', l, r: and() }; }
      return l;
    }

    // el ternario es el operador de menor precedencia del lenguaje de reglas
    function expr(): Nodo {
      const c = or();
      if (peek() === '?') {
        p++;
        const a = expr();
        eat(':');
        const b = expr();
        return { k: 'ternario', c, a, b };
      }
      return c;
    }

    function and(): Nodo {
      let l = comparacion();
      while (peek() === '&&') { p++; l = { k: 'bin', op: '&&', l, r: comparacion() }; }
      return l;
    }

    const out = expr();
    if (p < toks.length) throw new Error(`HARNESS NO CUBRE: sobran tokens ${JSON.stringify(toks.slice(p, p + 6))}`);
    return out;
  }



  type Funciones = Map<string, { params: string[]; cuerpo: string }>;

  function evaluar(nodo: Nodo, req: Peticion, funciones: Funciones, frame: Map<string, unknown>): unknown {
    switch (nodo.k) {
      case 'lit': return nodo.v;
      case 'list': return nodo.items.map((x) => evaluar(x, req, funciones, frame));
      case 'path': {
        // las partes literales ya traen sus barras: se pegan tal cual
        const segs = nodo.partes.map((x) => (typeof x === 'string' ? x : String(evaluar(x, req, funciones, frame))));
        return `db:${segs.join('')}`;
      }
      case 'ident': {
        if (frame.has(nodo.nombre)) return frame.get(nodo.nombre);
        if (nodo.nombre === 'request') return { __req: true };
        if (nodo.nombre === 'resource') return DOC(req.resource);
        if (nodo.nombre === 'docId') return req.docId;
        if (nodo.nombre === 'database') return '(db)';
        // literales: otras versiones del fichero escriben `isMasterAdmin()` comparando contra
        // `request.auth.token.email` y `!= null` en vez de `isSignedIn()`; el evaluador tiene
        // que poder con las dos formas, si no, no podría validar un corte del fichero.
        if (nodo.nombre === 'null') return null;
        if (nodo.nombre === 'true') return true;
        if (nodo.nombre === 'false') return false;
        throw new Error(`HARNESS NO CUBRE: identificador ${nodo.nombre}`);
      }
      case 'field': {
        const base = evaluar(nodo.obj, req, funciones, frame);
        if (base === MISSING || base === undefined || base === null) return MISSING;
        if (esDoc(base)) {
          if (nodo.nombre === 'data') return base.__doc === null ? MISSING : base.__doc;
          if (nodo.nombre === 'id') return req.docId;
          if (base.__doc && nodo.nombre in base.__doc) return (base.__doc as Record<string, unknown>)[nodo.nombre];
          return MISSING;
        }
        if (typeof base === 'object' && '__req' in (base as object)) {
          if (nodo.nombre === 'auth') return req.auth;
          if (nodo.nombre === 'resource') return DOC(req.requestResource);
          throw new Error(`HARNESS NO CUBRE: request.${nodo.nombre}`);
        }
        if (typeof base === 'string' && base.startsWith('db:')) {
          // `get(/databases/…)` sin envoltorio: se trata como documento de la mini-base
          const mapa = req.db[base.slice('db:/databases/(db)/documents/'.length)];
          if (!mapa) return MISSING;
          return nodo.nombre === 'data' ? mapa : (nodo.nombre in mapa ? (mapa as Record<string, unknown>)[nodo.nombre] : MISSING);
        }
        if (typeof base === 'object' && nodo.nombre in (base as object)) return (base as Record<string, unknown>)[nodo.nombre];
        return MISSING;
      }
      case 'index': {
        // Acceso dinámico `base[índice]` (p. ej. `existing()[nombre]`):
        // mismo criterio que `field` — base ausente ⇒ MISSING (fail-closed).
        const base = evaluar(nodo.obj, req, funciones, frame);
        if (base === MISSING || base === undefined || base === null) return MISSING;
        const idx = evaluar(nodo.idx, req, funciones, frame);
        if (idx === MISSING || idx === undefined || idx === null) return MISSING;
        if (esDoc(base)) {
          const mapa = base.__doc;
          return mapa && String(idx) in mapa ? (mapa as Record<string, unknown>)[String(idx)] : MISSING;
        }
        if (Array.isArray(base)) {
          const n = Number(idx);
          return Number.isInteger(n) && n >= 0 && n < base.length ? base[n] : MISSING;
        }
        if (typeof base === 'object' && String(idx) in (base as object)) {
          return (base as Record<string, unknown>)[String(idx)];
        }
        return MISSING;
      }
      case 'call': {
        const nombre = nodo.nombre;
        // sin obj: funciones del fichero o builtins
        if (!nodo.obj) {
          if (nombre === 'isSignedIn') return Boolean(req.auth);
          if (nombre === 'get') {
            const ruta = evaluar(nodo.args[0], req, funciones, frame) as string;
            const clave = ruta.replace('db:/databases/(db)/documents/', '');
            return DOC(req.db[clave] === undefined ? null : req.db[clave]);
          }
          if (nombre === 'exists') {
            const ruta = evaluar(nodo.args[0], req, funciones, frame) as string;
            const clave = ruta.replace('db:/databases/(db)/documents/', '');
            return req.db[clave] !== undefined;
          }
          if (nombre === 'incoming') return req.requestResource;
          if (nombre === 'existing') return req.resource;
          const fn = funciones.get(nombre);
          if (!fn) throw new Error(`HARNESS NO CUBRE: función ${nombre}()`);
          if (nodo.args.length !== fn.params.length) throw new Error(`HARNESS NO CUBRE: aridad de ${nombre}()`);
          // el frame anida: una función llamada dentro de otra ve sus parámetros y los del
          // llamador (las funciones del fichero no son recursivas, sí comparten ámbito)
          const nuevoFrame = new Map(frame);
          fn.params.forEach((prm, idx) => nuevoFrame.set(prm, evaluar(nodo.args[idx], req, funciones, frame)));
          return evaluarCuerpo(fn.cuerpo, req, funciones, nuevoFrame);
        }
        const base = evaluar(nodo.obj, req, funciones, frame);
        if (nombre === 'diff') {
          // `incoming().diff(existing()).affectedKeys()`: claves cuyo valor cambia entre los
          // dos mapas (Firestore incluye también las que aparecen o desaparecen).
          if (nodo.args.length !== 1) throw new Error('HARNESS NO CUBRE: aridad de diff()');
          return { __diff: [base, evaluar(nodo.args[0], req, funciones, frame)] };
        }
        if (nombre === 'affectedKeys') {
          const par = (base as { __diff?: [unknown, unknown] })?.__diff;
          if (!par) throw new Error('HARNESS NO CUBRE: affectedKeys() sin diff() delante');
          const plano = (v: unknown): Record<string, unknown> =>
            v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
          const [antes, despues] = [plano(par[0]), plano(par[1])];
          return [...new Set([...Object.keys(antes), ...Object.keys(despues)])].filter(
            (k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]),
          );
        }
        if (nombre === 'size') {
          if (base === MISSING) return MISSING;
          if (typeof base === 'string') return base.length;
          if (Array.isArray(base)) return base.length;
          if (base && typeof base === 'object') return Object.keys(base).length;
          return MISSING;
        }
        if (nombre === 'hasAny') {
          const otros = evaluar(nodo.args[0], req, funciones, frame) as unknown[];
          if (base === MISSING || !Array.isArray(base)) return false;
          return otros.some((x) => base.includes(x));
        }
        // INC-06 — cobertura de `hasOnly` (semántica Firestore: todo elemento
        // del conjunto está en la lista; duplicados irrelevantes). Lo usan
        // clavesFichaPublicaOk, progreso_tutoriales y las reglas INC-06.
        if (nombre === 'hasOnly') {
          const permitidos = evaluar(nodo.args[0], req, funciones, frame) as unknown[];
          if (base === MISSING || !Array.isArray(base)) return false;
          return base.every((x) => permitidos.includes(x));
        }
        if (nombre === 'hasAll') {
          const requeridos = evaluar(nodo.args[0], req, funciones, frame) as unknown[];
          if (base === MISSING || !Array.isArray(base)) return false;
          return requeridos.every((x) => base.includes(x));
        }
        if (nombre === 'keys') {
          if (base === MISSING || !base || typeof base !== 'object') return MISSING;
          return Object.keys(base as object);
        }
        if (nombre === 'matches') {
          // forma método `x.matches('re')`: misma semántica que el infijo `x matches 're'`
          // (es la sintaxis que entiende el evaluador propio de A, tests/helpers)
          if (nodo.args.length !== 1) throw new Error('HARNESS NO CUBRE: aridad de matches()');
          const re = evaluar(nodo.args[0], req, funciones, frame);
          if (typeof base !== 'string' || typeof re !== 'string') return false;
          return new RegExp(re).test(base);
        }
        throw new Error(`HARNESS NO CUBRE: método .${nombre}()`);
      }
      case 'ternario': {
        const condicion = evaluar(nodo.c, req, funciones, frame);
        return Boolean(condicion) && condicion !== MISSING
          ? evaluar(nodo.a, req, funciones, frame)
          : evaluar(nodo.b, req, funciones, frame);
      }
      case 'not': {
        const v = evaluar(nodo.e, req, funciones, frame);
        return !v;
      }
      case 'is': {
        const v = evaluar(nodo.e, req, funciones, frame);
        if (v === MISSING) return false;
        if (nodo.tipo === 'string') return typeof v === 'string';
        if (nodo.tipo === 'number') return typeof v === 'number';
        if (nodo.tipo === 'int') return typeof v === 'number' && Number.isInteger(v);
        if (nodo.tipo === 'list') return Array.isArray(v);
        if (nodo.tipo === 'map') return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
        if (nodo.tipo === 'bool') return typeof v === 'boolean';
        throw new Error(`HARNESS NO CUBRE: is ${nodo.tipo}`);
      }
      case 'bin': {
        const { op } = nodo;
        if (op === '&&') return evaluar(nodo.l, req, funciones, frame) ? evaluar(nodo.r, req, funciones, frame) : false;
        if (op === '||') return evaluar(nodo.l, req, funciones, frame) ? true : evaluar(nodo.r, req, funciones, frame);
        const l = evaluar(nodo.l, req, funciones, frame);
        const r = evaluar(nodo.r, req, funciones, frame);
        const lv: unknown = l;
        const rv: unknown = r;
        const falta = (v: unknown): boolean => v === (MISSING as unknown);
        if (op === '==') {
          // eslint-disable-next-line no-console
          return !falta(lv) && !falta(rv) && JSON.stringify(lv) === JSON.stringify(rv);
        }
        if (op === '!=') return !(!falta(lv) && !falta(rv) && JSON.stringify(lv) === JSON.stringify(rv));
        if (op === 'in') {
          if (Array.isArray(rv)) return rv.includes(lv);
          if (rv && typeof rv === 'object') return !falta(lv) && String(lv) in (rv as object);
          return false;
        }
        if (op === 'matches') {
          if (typeof lv !== 'string') return false;
          // Las reglas anclan con ^…$; aquí se exige coincidencia total (más estricto,
          // así que un falso "permitido" por este lado es imposible).
          return new RegExp(String(rv)).test(lv);
        }
        if (op === '+' || op === '-') {
          if (typeof lv === 'number' && typeof rv === 'number') return op === '+' ? lv + rv : lv - rv;
          throw new Error(`HARNESS NO CUBRE: ${op} sobre ${typeof lv}/${typeof rv}`);
        }
        if (op === '>' || op === '<' || op === '>=' || op === '<=') {
          if (typeof lv !== 'number' || typeof rv !== 'number') return false;
          return op === '>' ? lv > rv : op === '<' ? lv < rv : op === '>=' ? lv >= rv : lv <= rv;
        }
        throw new Error(`HARNESS NO CUBRE: operador ${op}`);
      }
      default:
        throw new Error(`HARNESS NO CUBRE: nodo ${(nodo as { k: string }).k}`);
    }
  }

  /** Evalúa el `allow <verbo>` del bloque de una colección para una petición simulada. */
  function permite(coleccion: string, verbo: 'get' | 'list' | 'create' | 'update' | 'delete', req: Peticion): boolean {
    const bloque = bloqueDe(coleccion);
    const permisos = permisosDe(bloque);
    const entrada = permisos.get(verbo);
    if (!entrada) throw new Error(`El bloque ${coleccion} no declara allow ${verbo}`);
    const funciones = new Map([...funcionesDe(cuerpoRaiz()), ...funcionesDe(bloque)]);
    const nodo = parsear(entrada.condicion);
    // los parámetros de la ruta (`match /usuarios_auth/{uid}`, `match /usuarios/{usuarioId}`,
    // `match /sindicacion_inmuebles/{docId}`) quedan ligados al id de la petición: `permite`
    // evalúa la condición en el ámbito real de ese `match`
    const cabecera = bloque.slice(0, bloque.indexOf('\n'));
    const frame = new Map<string, unknown>();
    for (const m of cabecera.matchAll(/\{(\w+)\}/g)) frame.set(m[1], req.docId);
    // RL_DEBUG=1 vitest run → vuelca cláusula a cláusula del `allow` con su valor. Es la única
    // forma práctica de depurar por qué el evaluador niega un permiso (el emulador de Google
    // no está disponible en este entorno: sin Java y sin salida de red a storage.googleapis.com).
    if (process.env.RL_DEBUG) {
      let nivel = 0; const partes: string[] = []; let actual = '';
      for (let i = 0; i < entrada.condicion.length; i++) {
        const c = entrada.condicion[i];
        if (c === '(' || c === '[') nivel++;
        if (c === ')' || c === ']') nivel--;
        if (nivel === 0 && c === '&' && entrada.condicion[i + 1] === '&') { partes.push(actual); actual = ''; i++; continue; }
        actual += c;
      }
      partes.push(actual);
      for (const pte of partes) {
        const t = pte.trim();
        let r: unknown;
        try { r = evaluar(parsear(t), req, funciones, new Map(frame)); } catch (e) { r = `ERR ${(e as Error).message}`; }
        console.log('CLAUSULA', verbo, '=>', JSON.stringify(r), '||', t.replace(/\s+/g, ' ').slice(0, 90));
      }
    }
    const v = evaluar(nodo, req, funciones, new Map(frame));
    if (typeof v !== 'boolean') throw new Error(`${coleccion}.${verbo} no devuelve un booleano (${String(v)})`);
    return v;
  }

  return { RULES, SIN_COMENTARIOS, bloqueDe, cuerpoRaiz, funcionesDe, permisosDe, parsear, evaluar, evaluarCuerpo, sentencias, permite };
}
