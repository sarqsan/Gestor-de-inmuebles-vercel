/**
 * Evaluador SEMÁNTICO de `firestore.rules` para tests sin emulador.
 * ---------------------------------------------------------------------------
 * LIMITACIÓN DECLARADA: en este entorno no existe `firebase-tools` ni Java, de
 * modo que el motor real de reglas de Google no se ejecuta. Este módulo NO es
 * el emulador: es un intérprete del subconjunto del lenguaje de reglas que usa
 * `firestore.rules` (funciones con `let`, `allow`, `match` anidados, comodines
 * `{x}` / `{x=**}`, ternario, `&&`, `||`, `!`, comparaciones, `in`, `is`,
 * `get()` / `exists()`, `request.auth`, `resource.data`,
 * `request.resource.data`, métodos de lista/mapa/string más habituales).
 * Interpreta el TEXTO REAL del fichero contra un contexto sintético (auth,
 * documentos de Firestore, documento entrante) y decide permitido/denegado.
 *
 * Semántica reproducida (documentación oficial de Firebase Security Rules):
 *  · versión 2; los `match` anidados concatenan rutas relativas; si varios
 *    `match` casan, el resultado es el OR de todas las `allow` aplicables.
 *  · `read` = get+list; `write` = create+update+delete.
 *  · ERROR como tercer valor booleano (tabla oficial de la referencia):
 *      error && true  => error      error || true  => true
 *      error && false => false      error || false => error
 *    y cortocircuito: `true || x` y `false && x` no evalúan `x`.
 *    Un `allow` cuyo resultado es error DENIEGA (solo `true` concede).
 *    Errores típicos: `get()` de documento inexistente, acceso a clave
 *    inexistente, `.data` de `resource` nulo, tipos incorrectos.
 *  · `resource` es null cuando el documento no existe (create).
 *
 * Cualquier construcción no soportada lanza: el test falla en vez de dar un
 * verde falso.
 */

export type Metodo = 'get' | 'list' | 'create' | 'update' | 'delete';

export interface AuthSintetica {
  uid: string;
  token: Record<string, unknown>;
}

export interface ContextoPeticion {
  auth: AuthSintetica | null;
  /** Documentos Firestore por ruta `coleccion/id` → data. */
  firestore: Record<string, Record<string, unknown>>;
  /** Documento existente en la ruta evaluada (null si no existe). */
  existente: Record<string, unknown> | null;
  /** Documento entrante (solo create/update). */
  entrante?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tokenizador
// ---------------------------------------------------------------------------

type Token =
  | { t: 'id'; v: string }
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'path'; v: string }
  | { t: 'op'; v: string };

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '(', ')', '{', '}', '[', ']', ',', '.', ';', ':', '?', '!', '<', '>', '*', '+', '-', '/', '%', '='];

function tokenizar(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const esperaOperando = () => {
    const prev = out[out.length - 1];
    return !prev || (prev.t === 'op' && ['(', ',', '&&', '||', '!', '==', '!=', '<', '<=', '>', '>=', ':', '?', '=', '['].includes(prev.v)) || (prev.t === 'id' && prev.v === 'return');
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    const prev = out[out.length - 1];
    if (prev && prev.t === 'id' && prev.v === 'match') {
      let j = i;
      while (j < src.length && !(src[j] === '{' && /\s/.test(src[j - 1]))) j++;
      out.push({ t: 'path', v: src.slice(i, j).trim() });
      i = j; continue;
    }
    if (c === '/' && esperaOperando()) {
      let j = i; let depth = 0;
      while (j < src.length) {
        const ch = src[j];
        if (ch === '(') depth++;
        else if (ch === ')') { if (depth === 0) break; depth--; }
        else if (depth === 0 && (ch === ',' || ch === ';' || /\s/.test(ch))) break;
        j++;
      }
      out.push({ t: 'path', v: src.slice(i, j) });
      i = j; continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1; let s = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1]; j += 2; } else { s += src[j]; j++; } }
      out.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c)) { let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++; out.push({ t: 'num', v: Number(src.slice(i, j)) }); i = j; continue; }
    if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++; out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue; }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Error(`Carácter no soportado en firestore.rules: «${c}» (pos ${i})`);
    out.push({ t: 'op', v: op }); i += op.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// AST de expresiones
// ---------------------------------------------------------------------------

type Expr =
  | { k: 'lit'; v: unknown }
  | { k: 'path'; v: string }
  | { k: 'var'; name: string }
  | { k: 'member'; obj: Expr; prop: string }
  | { k: 'index'; obj: Expr; idx: Expr }
  | { k: 'call'; callee: Expr; args: Expr[] }
  | { k: 'unary'; op: '!' | '-'; e: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'is'; e: Expr; tipo: string }
  | { k: 'tern'; c: Expr; a: Expr; b: Expr };

class Parser {
  private p = 0;
  constructor(private toks: Token[]) {}
  fin(): boolean { return this.p >= this.toks.length; }
  peek(): Token | undefined { return this.toks[this.p]; }
  next(): Token { const t = this.toks[this.p++]; if (!t) throw new Error('Fin inesperado'); return t; }
  esOp(v: string): boolean { const t = this.peek(); return !!t && t.t === 'op' && t.v === v; }
  esId(v: string): boolean { const t = this.peek(); return !!t && t.t === 'id' && t.v === v; }
  expectOp(v: string): void { const t = this.next(); if (t.t !== 'op' || t.v !== v) throw new Error(`Se esperaba «${v}», llegó «${(t as { v: unknown }).v}»`); }
  expectId(): string { const t = this.next(); if (t.t !== 'id') throw new Error(`Se esperaba identificador, llegó «${(t as { v: unknown }).v}»`); return t.v; }

  expr(): Expr { return this.tern(); }
  private tern(): Expr {
    const c = this.or();
    if (this.esOp('?')) { this.next(); const a = this.tern(); this.expectOp(':'); const b = this.tern(); return { k: 'tern', c, a, b }; }
    return c;
  }
  private or(): Expr { let l = this.and(); while (this.esOp('||')) { this.next(); l = { k: 'bin', op: '||', l, r: this.and() }; } return l; }
  private and(): Expr { let l = this.cmp(); while (this.esOp('&&')) { this.next(); l = { k: 'bin', op: '&&', l, r: this.cmp() }; } return l; }
  private cmp(): Expr {
    let l = this.add();
    for (;;) {
      const t = this.peek();
      if (t && t.t === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(t.v)) { this.next(); l = { k: 'bin', op: t.v, l, r: this.add() }; continue; }
      if (t && t.t === 'id' && t.v === 'in') { this.next(); l = { k: 'bin', op: 'in', l, r: this.add() }; continue; }
      if (t && t.t === 'id' && t.v === 'is') { this.next(); l = { k: 'is', e: l, tipo: this.expectId() }; continue; }
      return l;
    }
  }
  private add(): Expr { let l = this.mul(); while (this.esOp('+') || this.esOp('-')) { const op = (this.next() as { v: string }).v; l = { k: 'bin', op, l, r: this.mul() }; } return l; }
  private mul(): Expr { let l = this.unary(); while (this.esOp('*') || this.esOp('/') || this.esOp('%')) { const op = (this.next() as { v: string }).v; l = { k: 'bin', op, l, r: this.unary() }; } return l; }
  private unary(): Expr {
    if (this.esOp('!')) { this.next(); return { k: 'unary', op: '!', e: this.unary() }; }
    if (this.esOp('-')) { this.next(); return { k: 'unary', op: '-', e: this.unary() }; }
    return this.postfix();
  }
  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      if (this.esOp('.')) { this.next(); e = { k: 'member', obj: e, prop: this.expectId() }; continue; }
      if (this.esOp('[')) { this.next(); const idx = this.expr(); this.expectOp(']'); e = { k: 'index', obj: e, idx }; continue; }
      if (this.esOp('(')) {
        this.next(); const args: Expr[] = [];
        if (!this.esOp(')')) { args.push(this.expr()); while (this.esOp(',')) { this.next(); args.push(this.expr()); } }
        this.expectOp(')'); e = { k: 'call', callee: e, args }; continue;
      }
      return e;
    }
  }
  private primary(): Expr {
    const t = this.next();
    if (t.t === 'num') return { k: 'lit', v: t.v };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'path') return { k: 'path', v: t.v };
    if (t.t === 'op' && t.v === '(') { const e = this.expr(); this.expectOp(')'); return e; }
    if (t.t === 'op' && t.v === '[') {
      const items: Expr[] = [];
      if (!this.esOp(']')) { items.push(this.expr()); while (this.esOp(',')) { this.next(); items.push(this.expr()); } }
      this.expectOp(']'); return { k: 'call', callee: { k: 'var', name: '__list' }, args: items };
    }
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      return { k: 'var', name: t.v };
    }
    throw new Error(`Token inesperado «${(t as { v: unknown }).v}»`);
  }
}

// ---------------------------------------------------------------------------
// Estructura del fichero
// ---------------------------------------------------------------------------

export interface FuncionRegla { nombre: string; params: string[]; lets: { nombre: string; e: Expr }[]; cuerpo: Expr }
export interface Permiso { metodos: Metodo[]; condicion: Expr }
/** Cada bloque conserva su cadena de ámbitos de funciones (raíz → ... → propio). */
export interface BloqueMatch { patron: string; segmentos: string[]; permisos: Permiso[]; ambitos: Map<string, FuncionRegla>[] }
export interface ReglasFirestore { funciones: Map<string, FuncionRegla>; bloques: BloqueMatch[] }

const EXPANDIR: Record<string, Metodo[]> = { read: ['get', 'list'], write: ['create', 'update', 'delete'] };

export function parsearReglas(fuente: string): ReglasFirestore {
  const funciones = new Map<string, FuncionRegla>();
  const bloques: BloqueMatch[] = [];
  const sinVersion = fuente.replace(/rules_version\s*=\s*'2'\s*;/, '');
  if (sinVersion === fuente) throw new Error("firestore.rules debe declarar rules_version = '2'");
  const q = new Parser(tokenizar(sinVersion));
  if (q.expectId() !== 'service') throw new Error('Se esperaba service');
  if (q.expectId() !== 'cloud') throw new Error('Se esperaba cloud.firestore');
  q.expectOp('.');
  if (q.expectId() !== 'firestore') throw new Error('Se esperaba cloud.firestore');
  q.expectOp('{');
  if (!q.esId('match')) throw new Error('Se esperaba match /databases/{database}/documents');
  q.next();
  const raiz = leerPatron(q);
  if (raiz !== '/databases/{database}/documents') throw new Error(`Raíz inesperada ${raiz}`);
  q.expectOp('{');
  leerCuerpo(q, raiz.replace(/^\//, '').split('/'), [funciones]);
  q.expectOp('}'); // cierre del match raíz
  q.expectOp('}'); // cierre de service
  if (!q.fin()) throw new Error('Texto sobrante tras el cierre del servicio');
  return { funciones, bloques };

  function leerPatron(p: Parser): string {
    const t = p.next();
    if (t.t !== 'path') throw new Error(`Se esperaba patrón de ruta tras match, llegó «${(t as { v: unknown }).v}»`);
    return t.v;
  }

  function leerFuncion(p: Parser): FuncionRegla {
    p.next(); // function
    const nombre = p.expectId();
    p.expectOp('(');
    const params: string[] = [];
    if (!p.esOp(')')) { params.push(p.expectId()); while (p.esOp(',')) { p.next(); params.push(p.expectId()); } }
    p.expectOp(')'); p.expectOp('{');
    const lets: { nombre: string; e: Expr }[] = [];
    while (p.esId('let')) {
      p.next(); const n = p.expectId(); p.expectOp('='); const e = p.expr(); p.expectOp(';');
      lets.push({ nombre: n, e });
    }
    if (lets.length > 10) throw new Error(`La función ${nombre} supera 10 let`);
    if (!p.esId('return')) throw new Error(`La función ${nombre} debe terminar en return`);
    p.next();
    const cuerpo = p.expr();
    p.expectOp(';'); p.expectOp('}');
    return { nombre, params, lets, cuerpo };
  }

  /**
   * Cuerpo de un match: funciones (ámbito léxico del bloque), matches anidados
   * (ruta relativa) y allows. `ambitos` = cadena raíz → ... → bloque actual.
   */
  function leerCuerpo(p: Parser, prefijo: string[], ambitos: Map<string, FuncionRegla>[]): Permiso[] {
    const permisos: Permiso[] = [];
    const propio = ambitos[ambitos.length - 1];
    while (!p.esOp('}')) {
      if (p.esId('function')) {
        const f = leerFuncion(p);
        if (propio.has(f.nombre)) throw new Error(`Función duplicada ${f.nombre} en el mismo ámbito`);
        propio.set(f.nombre, f);
        continue;
      }
      if (p.esId('match')) {
        p.next();
        const patron = leerPatron(p);
        p.expectOp('{');
        const segmentos = [...prefijo, ...patron.replace(/^\//, '').split('/')];
        const ambitosHijo = [...ambitos, new Map<string, FuncionRegla>()];
        const hijos = leerCuerpo(p, segmentos, ambitosHijo);
        p.expectOp('}');
        if (hijos.length > 0) bloques.push({ patron: '/' + segmentos.join('/'), segmentos, permisos: hijos, ambitos: ambitosHijo });
        continue;
      }
      if (!p.esId('allow')) throw new Error(`Construcción no soportada: «${(p.peek() as { v: unknown } | undefined)?.v}»`);
      p.next();
      const metodos: Metodo[] = [];
      const add = (m: string) => { for (const x of EXPANDIR[m] || [m as Metodo]) if (!metodos.includes(x)) metodos.push(x); };
      add(p.expectId());
      while (p.esOp(',')) { p.next(); add(p.expectId()); }
      let condicion: Expr = { k: 'lit', v: true };
      if (p.esOp(':')) { p.next(); if (!p.esId('if')) throw new Error('Se esperaba if'); p.next(); condicion = p.expr(); }
      p.expectOp(';');
      permisos.push({ metodos, condicion });
    }
    return permisos;
  }
}

// ---------------------------------------------------------------------------
// Casado de rutas (versión 2)
// ---------------------------------------------------------------------------

export function casarPatron(segmentosPatron: string[], ruta: string): Record<string, string> | null {
  const partes = ruta.split('/');
  const vars: Record<string, string> = {};
  const rec = (i: number, j: number): boolean => {
    if (i === segmentosPatron.length) return j === partes.length;
    const seg = segmentosPatron[i];
    const multi = seg.match(/^\{(\w+)=\*\*\}$/);
    if (multi) {
      if (i !== segmentosPatron.length - 1) throw new Error('Comodín recursivo no final: no soportado');
      vars[multi[1]] = partes.slice(j).join('/');
      return true;
    }
    if (j >= partes.length) return false;
    const single = seg.match(/^\{(\w+)\}$/);
    if (single) { if (partes[j].length === 0) return false; vars[single[1]] = partes[j]; return rec(i + 1, j + 1); }
    if (seg !== partes[j]) return false;
    return rec(i + 1, j + 1);
  };
  return rec(0, 0) ? vars : null;
}

// ---------------------------------------------------------------------------
// Evaluación (con ERROR como tercer valor booleano)
// ---------------------------------------------------------------------------

class ErrorEvaluacion extends Error {}

interface Ambito { vars: Record<string, unknown>; ctx: ContextoPeticion; funciones: Map<string, FuncionRegla>[]; profundidad: number }

function buscarFuncion(a: Ambito, nombre: string): FuncionRegla | undefined {
  for (let i = a.funciones.length - 1; i >= 0; i--) { const f = a.funciones[i].get(nombre); if (f) return f; }
  return undefined;
}

class Conjunto { constructor(public items: unknown[]) {} }
class MapDiff { constructor(public a: Record<string, unknown>, public b: Record<string, unknown>) {} }

function esMapa(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Conjunto) && !(v instanceof MapDiff);
}

function iguales(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => iguales(x, b[i]));
  if (esMapa(a) && esMapa(b)) {
    const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
    return iguales(ka, kb) && ka.every((k) => iguales(a[k], b[k]));
  }
  return a === b;
}

/** Evalúa y devuelve el valor o lanza ErrorEvaluacion. */
function evaluar(e: Expr, a: Ambito): unknown {
  switch (e.k) {
    case 'lit': return e.v;
    case 'path': return resolverRuta(e.v, a);
    case 'var': {
      if (e.name in a.vars) return a.vars[e.name];
      if (e.name === 'request') {
        return {
          auth: a.ctx.auth,
          resource: a.ctx.entrante === undefined ? null : { data: a.ctx.entrante },
        };
      }
      if (e.name === 'resource') return a.ctx.existente === null ? null : { data: a.ctx.existente };
      if (e.name === 'get' || e.name === 'exists') return { __builtin: e.name };
      if (buscarFuncion(a, e.name)) return { __fn: e.name };
      throw new ErrorEvaluacion(`Variable desconocida ${e.name}`);
    }
    case 'member': {
      const obj = evaluar(e.obj, a);
      if (obj === null || obj === undefined) throw new ErrorEvaluacion(`Acceso a .${e.prop} de ${obj}`);
      if (typeof obj === 'string') {
        if (['matches', 'size', 'split', 'lower', 'upper', 'trim'].includes(e.prop)) return { __strfn: e.prop, s: obj };
        throw new ErrorEvaluacion(`Método de string no soportado ${e.prop}`);
      }
      if (Array.isArray(obj)) {
        if (['hasAny', 'hasAll', 'hasOnly', 'size', 'toSet', 'join'].includes(e.prop)) return { __listfn: e.prop, l: obj };
        throw new ErrorEvaluacion(`Método de lista no soportado ${e.prop}`);
      }
      if (obj instanceof Conjunto) {
        if (['hasAny', 'hasAll', 'hasOnly', 'size', 'difference', 'intersection', 'union'].includes(e.prop)) return { __setfn: e.prop, s: obj };
        throw new ErrorEvaluacion(`Método de set no soportado ${e.prop}`);
      }
      if (obj instanceof MapDiff) {
        if (['affectedKeys', 'addedKeys', 'removedKeys', 'changedKeys'].includes(e.prop)) return { __difffn: e.prop, d: obj };
        throw new ErrorEvaluacion(`Método de MapDiff no soportado ${e.prop}`);
      }
      if (esMapa(obj)) {
        if (e.prop === 'keys' || e.prop === 'diff' || e.prop === 'size' || e.prop === 'values') return { __mapfn: e.prop, m: obj };
        if (!(e.prop in obj)) throw new ErrorEvaluacion(`Propiedad inexistente ${e.prop}`);
        return obj[e.prop];
      }
      throw new ErrorEvaluacion(`Acceso a .${e.prop} sobre tipo no soportado`);
    }
    case 'index': {
      const obj = evaluar(e.obj, a);
      const idx = evaluar(e.idx, a);
      if (Array.isArray(obj)) {
        if (typeof idx !== 'number' || idx < 0 || idx >= obj.length) throw new ErrorEvaluacion('Índice de lista fuera de rango');
        return obj[idx];
      }
      if (esMapa(obj)) {
        if (typeof idx !== 'string' || !(idx in obj)) throw new ErrorEvaluacion(`Clave inexistente ${String(idx)}`);
        return obj[idx];
      }
      throw new ErrorEvaluacion('Indexación sobre tipo no soportado');
    }
    case 'call': {
      if (e.callee.k === 'var' && e.callee.name === '__list') return e.args.map((x) => evaluar(x, a));
      const callee = evaluar(e.callee, a) as Record<string, unknown>;
      const args = e.args.map((x) => evaluar(x, a));
      if (callee && callee.__fn) return llamarFuncion(callee.__fn as string, args, a);
      if (callee && callee.__builtin) {
        const ruta = args[0] as string;
        const clave = ruta.replace(/^\/databases\/[^/]+\/documents\//, '');
        const doc = a.ctx.firestore[clave];
        if (callee.__builtin === 'exists') return doc !== undefined;
        if (doc === undefined) throw new ErrorEvaluacion(`get de documento inexistente ${clave}`);
        return { data: doc, id: clave.split('/').pop() };
      }
      if (callee && callee.__strfn) {
        const s = callee.s as string;
        switch (callee.__strfn) {
          case 'matches': return new RegExp(`^(?:${args[0] as string})$`).test(s);
          case 'size': return s.length;
          case 'split': return s.split(new RegExp(args[0] as string));
          case 'lower': return s.toLowerCase();
          case 'upper': return s.toUpperCase();
          case 'trim': return s.trim();
        }
      }
      if (callee && callee.__listfn) {
        const l = callee.l as unknown[];
        const otro = () => { const o = args[0]; if (Array.isArray(o)) return o; if (o instanceof Conjunto) return o.items; throw new ErrorEvaluacion('Argumento de lista no es lista'); };
        switch (callee.__listfn) {
          case 'size': return l.length;
          case 'hasAny': return otro().some((x) => l.some((y) => iguales(x, y)));
          case 'hasAll': return otro().every((x) => l.some((y) => iguales(x, y)));
          case 'hasOnly': return l.every((y) => otro().some((x) => iguales(x, y)));
          case 'toSet': return new Conjunto(l.filter((x, i) => l.findIndex((y) => iguales(x, y)) === i));
          case 'join': return l.map(String).join(args[0] as string);
        }
      }
      if (callee && callee.__setfn) {
        const s = (callee.s as Conjunto).items;
        const otro = () => { const o = args[0]; if (Array.isArray(o)) return o; if (o instanceof Conjunto) return o.items; throw new ErrorEvaluacion('Argumento de set no es lista/set'); };
        switch (callee.__setfn) {
          case 'size': return s.length;
          case 'hasAny': return otro().some((x) => s.some((y) => iguales(x, y)));
          case 'hasAll': return otro().every((x) => s.some((y) => iguales(x, y)));
          case 'hasOnly': return s.every((y) => otro().some((x) => iguales(x, y)));
          case 'difference': return new Conjunto(s.filter((y) => !otro().some((x) => iguales(x, y))));
          case 'intersection': return new Conjunto(s.filter((y) => otro().some((x) => iguales(x, y))));
          case 'union': { const u = [...s]; for (const x of otro()) if (!u.some((y) => iguales(x, y))) u.push(x); return new Conjunto(u); }
        }
      }
      if (callee && callee.__mapfn) {
        const m = callee.m as Record<string, unknown>;
        switch (callee.__mapfn) {
          case 'keys': return Object.keys(m);
          case 'values': return Object.values(m);
          case 'size': return Object.keys(m).length;
          case 'diff': { const o = args[0]; if (!esMapa(o)) throw new ErrorEvaluacion('diff() requiere un mapa'); return new MapDiff(m, o); }
        }
      }
      if (callee && callee.__difffn) {
        const d = callee.d as MapDiff;
        const ka = Object.keys(d.a); const kb = Object.keys(d.b);
        const added = ka.filter((k) => !(k in d.b));
        const removed = kb.filter((k) => !(k in d.a));
        const changed = ka.filter((k) => k in d.b && !iguales(d.a[k], d.b[k]));
        switch (callee.__difffn) {
          case 'addedKeys': return new Conjunto(added);
          case 'removedKeys': return new Conjunto(removed);
          case 'changedKeys': return new Conjunto(changed);
          case 'affectedKeys': return new Conjunto([...added, ...removed, ...changed]);
        }
      }
      throw new ErrorEvaluacion('Llamada no soportada');
    }
    case 'unary': {
      const v = evaluar(e.e, a);
      if (e.op === '!') { if (typeof v !== 'boolean') throw new ErrorEvaluacion('! sobre no booleano'); return !v; }
      if (typeof v !== 'number') throw new ErrorEvaluacion('- sobre no numérico');
      return -v;
    }
    case 'is': {
      const v = evaluar(e.e, a);
      switch (e.tipo) {
        case 'string': return typeof v === 'string';
        case 'bool': return typeof v === 'boolean';
        case 'int': return typeof v === 'number' && Number.isInteger(v);
        case 'float': return typeof v === 'number' && !Number.isInteger(v);
        case 'number': return typeof v === 'number';
        case 'list': return Array.isArray(v);
        case 'map': return esMapa(v);
      }
      throw new ErrorEvaluacion(`is ${e.tipo} no soportado`);
    }
    case 'tern': {
      const c = evaluar(e.c, a);
      if (typeof c !== 'boolean') throw new ErrorEvaluacion('Condición ternaria no booleana');
      return c ? evaluar(e.a, a) : evaluar(e.b, a);
    }
    case 'bin': {
      if (e.op === '&&') {
        // Tabla oficial: error && true => error; error && false => false; cortocircuito en false.
        let l: boolean | 'error';
        try { const v = evaluar(e.l, a); if (typeof v !== 'boolean') throw new ErrorEvaluacion('&& no booleano'); l = v; } catch (err) { if (!(err instanceof ErrorEvaluacion)) throw err; l = 'error'; }
        if (l === false) return false;
        let r: boolean | 'error';
        try { const v = evaluar(e.r, a); if (typeof v !== 'boolean') throw new ErrorEvaluacion('&& no booleano'); r = v; } catch (err) { if (!(err instanceof ErrorEvaluacion)) throw err; r = 'error'; }
        if (r === false) return false;
        if (l === 'error' || r === 'error') throw new ErrorEvaluacion('error && true');
        return true;
      }
      if (e.op === '||') {
        // Tabla oficial: error || true => true; error || false => error; cortocircuito en true.
        let l: boolean | 'error';
        try { const v = evaluar(e.l, a); if (typeof v !== 'boolean') throw new ErrorEvaluacion('|| no booleano'); l = v; } catch (err) { if (!(err instanceof ErrorEvaluacion)) throw err; l = 'error'; }
        if (l === true) return true;
        let r: boolean | 'error';
        try { const v = evaluar(e.r, a); if (typeof v !== 'boolean') throw new ErrorEvaluacion('|| no booleano'); r = v; } catch (err) { if (!(err instanceof ErrorEvaluacion)) throw err; r = 'error'; }
        if (r === true) return true;
        if (l === 'error' || r === 'error') throw new ErrorEvaluacion('error || false');
        return false;
      }
      const l = evaluar(e.l, a); const r = evaluar(e.r, a);
      switch (e.op) {
        case '==': return iguales(l, r);
        case '!=': return !iguales(l, r);
        case '<': case '<=': case '>': case '>=': {
          if (!((typeof l === 'number' && typeof r === 'number') || (typeof l === 'string' && typeof r === 'string'))) throw new ErrorEvaluacion('Comparación relacional de tipos incompatibles');
          if (e.op === '<') return l < r; if (e.op === '<=') return l <= r; if (e.op === '>') return l > r; return l >= r;
        }
        case '+': {
          if (typeof l === 'string' && typeof r === 'string') return l + r;
          if (typeof l === 'number' && typeof r === 'number') return l + r;
          if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
          throw new ErrorEvaluacion('+ de tipos incompatibles');
        }
        case '-': case '*': case '/': case '%': {
          if (typeof l !== 'number' || typeof r !== 'number') throw new ErrorEvaluacion('Aritmética sobre no numéricos');
          if ((e.op === '/' || e.op === '%') && r === 0) throw new ErrorEvaluacion('División por cero');
          if (e.op === '-') return l - r; if (e.op === '*') return l * r; if (e.op === '/') return l / r; return l % r;
        }
        case 'in': {
          if (Array.isArray(r)) return r.some((x) => iguales(x, l));
          if (r instanceof Conjunto) return r.items.some((x) => iguales(x, l));
          if (esMapa(r)) { if (typeof l !== 'string') throw new ErrorEvaluacion('in sobre mapa con clave no string'); return l in r; }
          throw new ErrorEvaluacion('in sobre tipo no soportado');
        }
      }
      throw new ErrorEvaluacion(`Operador ${e.op}`);
    }
  }
}

function resolverRuta(raw: string, a: Ambito): string {
  return raw.replace(/\$\(([^()]*(?:\([^()]*\))*[^()]*)\)/g, (_m, inner: string) => {
    const v = evaluar(new Parser(tokenizar(inner)).expr(), a);
    if (typeof v !== 'string') throw new ErrorEvaluacion('Segmento de ruta no string');
    return v;
  });
}

function llamarFuncion(nombre: string, args: unknown[], a: Ambito): unknown {
  const f = buscarFuncion(a, nombre);
  if (!f) throw new ErrorEvaluacion(`Función ${nombre} inexistente`);
  if (a.profundidad > 20) throw new ErrorEvaluacion('Pila de funciones > 20');
  if (args.length !== f.params.length) throw new ErrorEvaluacion(`Aridad incorrecta en ${nombre}`);
  const vars: Record<string, unknown> = { ...a.vars };
  f.params.forEach((p, i) => { vars[p] = args[i]; });
  const amb: Ambito = { ...a, vars, profundidad: a.profundidad + 1 };
  for (const l of f.lets) vars[l.nombre] = evaluar(l.e, amb);
  return evaluar(f.cuerpo, amb);
}

export interface Decision {
  permitido: boolean;
  /** Patrones de bloque que han concedido el permiso. */
  concedidoPor: string[];
  /** Patrones que casan con la ruta (aunque denieguen). */
  casan: string[];
  /** Resultado por permiso evaluado (para diagnóstico): true / false / 'error'. */
  detalle: { patron: string; resultado: boolean | 'error' }[];
}

/**
 * Decide una operación sobre `ruta` (relativa a `/databases/{db}/documents`,
 * p. ej. `contratos_formalizacion/ct_A`).
 */
export function decidir(reglas: ReglasFirestore, ruta: string, metodo: Metodo, ctx: ContextoPeticion, database = '(default)'): Decision {
  if (['create', 'update'].includes(metodo) && ctx.entrante === undefined) throw new Error(`La operación ${metodo} necesita ctx.entrante`);
  if (metodo === 'create' && ctx.existente !== null) throw new Error('create exige ctx.existente === null');
  const ctxOp: ContextoPeticion = ['get', 'list', 'delete'].includes(metodo) ? { ...ctx, entrante: undefined } : ctx;
  const concedidoPor: string[] = [];
  const casan: string[] = [];
  const detalle: Decision['detalle'] = [];
  const rutaCompleta = `databases/${database}/documents/${ruta}`;
  for (const b of reglas.bloques) {
    const vars = casarPatron(b.segmentos, rutaCompleta);
    if (!vars) continue;
    casan.push(b.patron);
    for (const p of b.permisos) {
      if (!p.metodos.includes(metodo)) continue;
      let resultado: boolean | 'error';
      try {
        const v = evaluar(p.condicion, { vars, ctx: ctxOp, funciones: b.ambitos, profundidad: 0 });
        if (typeof v !== 'boolean') throw new ErrorEvaluacion('Condición no booleana');
        resultado = v;
      } catch (err) {
        if (!(err instanceof ErrorEvaluacion)) throw err;
        resultado = 'error';
      }
      detalle.push({ patron: b.patron, resultado });
      if (resultado === true && !concedidoPor.includes(b.patron)) concedidoPor.push(b.patron);
    }
  }
  return { permitido: concedidoPor.length > 0, concedidoPor, casan, detalle };
}

export function permitido(reglas: ReglasFirestore, ruta: string, metodo: Metodo, ctx: ContextoPeticion): boolean {
  return decidir(reglas, ruta, metodo, ctx).permitido;
}
