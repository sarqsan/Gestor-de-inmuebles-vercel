/**
 * Evaluador SEMÁNTICO de `storage.rules` para tests sin emulador.
 * ---------------------------------------------------------------------------
 * LIMITACIÓN DECLARADA: en este entorno no existe `firebase-tools` ni Java, de
 * modo que el motor real de reglas de Google no se ejecuta. Este módulo NO es
 * el emulador: es un intérprete del subconjunto del lenguaje de reglas que usa
 * `storage.rules` (funciones, `allow`, comodines `{x}` / `{x=**}`, `&&`, `||`,
 * `!`, `==`, `!=`, `<`, `<=`, `in`, `is`, `matches`, `size`, `firestore.get` /
 * `firestore.exists`, literales de ruta con `$(…)`). Interpreta el TEXTO REAL
 * del fichero contra un contexto sintético (auth, documentos de Firestore,
 * recurso subido) y devuelve la decisión permitido/denegado por método.
 *
 * Semántica reproducida (documentación oficial de Firebase Security Rules):
 *  · versión 2: `{x=**}` casa con cero o más segmentos; `{x}` con exactamente uno.
 *  · las reglas no cascadan; si varios `match` casan, el resultado es el OR de
 *    todas las `allow` aplicables.
 *  · `read` = get+list; `write` = create+update+delete.
 *  · un error de evaluación (p. ej. `get` de un documento inexistente, acceso a
 *    `request.resource` en una lectura) deniega esa `allow`.
 *  · `&&` / `||` cortocircuitan.
 *  · `String.matches(re)` compara la CADENA COMPLETA (RE2 → aquí RegExp anclado).
 *
 * Cualquier construcción no soportada lanza: el test falla en vez de dar un
 * verde falso.
 */

export type Metodo = 'get' | 'list' | 'create' | 'update' | 'delete';

export interface AuthSintetica {
  uid: string;
  token: Record<string, unknown>;
}

export interface RecursoSubido {
  /** Nombre COMPLETO del objeto (ruta), como `request.resource.name`. */
  name: string;
  size: number;
  contentType: string;
}

export interface ContextoPeticion {
  auth: AuthSintetica | null;
  /** Documentos Firestore por ruta `coleccion/id` → data. */
  firestore: Record<string, Record<string, unknown>>;
  /** Presente sólo en escrituras. */
  resource?: RecursoSubido;
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

const OPS = ['&&', '||', '==', '!=', '<=', '>=', '(', ')', '{', '}', '[', ']', ',', '.', ';', ':', '!', '<', '>', '*', '+', '-', '/', '='];

function tokenizar(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const esperaOperando = () => {
    const prev = out[out.length - 1];
    return !prev || (prev.t === 'op' && ['(', ',', '&&', '||', '!', '==', '!=', '<', '<=', '>', '>=', ':'].includes(prev.v)) || (prev.t === 'id' && prev.v === 'return');
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    const prev = out[out.length - 1];
    if (prev && prev.t === 'id' && prev.v === 'match') {
      // patrón de ruta en crudo hasta el `{` de apertura del cuerpo (precedido de espacio)
      let j = i;
      while (j < src.length && !(src[j] === '{' && /\s/.test(src[j - 1]))) j++;
      out.push({ t: 'path', v: src.slice(i, j).trim() });
      i = j; continue;
    }
    if (c === '/' && esperaOperando()) {
      // literal de ruta: /databases/(default)/documents/x/$(expr)
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
    if (!op) throw new Error(`Carácter no soportado en storage.rules: «${c}» (pos ${i})`);
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
  | { k: 'call'; callee: Expr; args: Expr[] }
  | { k: 'unary'; op: '!' | '-'; e: Expr }
  | { k: 'bin'; op: string; l: Expr; r: Expr }
  | { k: 'is'; e: Expr; tipo: string };

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

  expr(): Expr { return this.or(); }
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
  private mul(): Expr { let l = this.unary(); while (this.esOp('*') || this.esOp('/')) { const op = (this.next() as { v: string }).v; l = { k: 'bin', op, l, r: this.unary() }; } return l; }
  private unary(): Expr {
    if (this.esOp('!')) { this.next(); return { k: 'unary', op: '!', e: this.unary() }; }
    if (this.esOp('-')) { this.next(); return { k: 'unary', op: '-', e: this.unary() }; }
    return this.postfix();
  }
  private postfix(): Expr {
    let e = this.primary();
    for (;;) {
      if (this.esOp('.')) { this.next(); e = { k: 'member', obj: e, prop: this.expectId() }; continue; }
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

export interface FuncionRegla { nombre: string; params: string[]; cuerpo: Expr }
export interface Permiso { metodos: Metodo[]; condicion: Expr; texto: string }
export interface BloqueMatch { patron: string; segmentos: string[]; permisos: Permiso[] }
export interface ReglasStorage { funciones: Map<string, FuncionRegla>; bloques: BloqueMatch[] }

const EXPANDIR: Record<string, Metodo[]> = { read: ['get', 'list'], write: ['create', 'update', 'delete'] };

export function parsearReglas(fuente: string): ReglasStorage {
  const funciones = new Map<string, FuncionRegla>();
  const bloques: BloqueMatch[] = [];
  const sinVersion = fuente.replace(/rules_version\s*=\s*'2'\s*;/, '');
  if (sinVersion === fuente) throw new Error("storage.rules debe declarar rules_version = '2'");
  const q = new Parser(tokenizar(sinVersion));
  if (q.expectId() !== 'service') throw new Error('Se esperaba service');
  if (q.expectId() !== 'firebase') throw new Error('Se esperaba firebase.storage');
  q.expectOp('.');
  if (q.expectId() !== 'storage') throw new Error('Se esperaba firebase.storage');
  q.expectOp('{');
  if (!q.esId('match')) throw new Error('Se esperaba match /b/{bucket}/o');
  q.next();
  const raiz = leerPatron(q);
  if (raiz !== '/b/{bucket}/o') throw new Error(`Raíz inesperada ${raiz}`);
  q.expectOp('{');
  while (!q.esOp('}')) {
    if (q.esId('function')) { const f = leerFuncion(q); funciones.set(f.nombre, f); continue; }
    if (q.esId('match')) { q.next(); const patron = leerPatron(q); q.expectOp('{'); bloques.push(leerBloque(q, patron)); continue; }
    throw new Error(`Construcción no soportada en raíz: «${(q.peek() as { v: unknown } | undefined)?.v}»`);
  }
  q.expectOp('}'); q.expectOp('}');
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
    if (!p.esId('return')) throw new Error(`La función ${nombre} debe empezar por return (let no soportado)`);
    p.next();
    const cuerpo = p.expr();
    p.expectOp(';'); p.expectOp('}');
    return { nombre, params, cuerpo };
  }

  function leerBloque(p: Parser, patron: string): BloqueMatch {
    const permisos: Permiso[] = [];
    while (!p.esOp('}')) {
      if (p.esId('match')) throw new Error(`match anidado bajo ${patron}: no soportado por el evaluador`);
      if (!p.esId('allow')) throw new Error(`Se esperaba allow en ${patron}`);
      p.next();
      const metodos: Metodo[] = [];
      const add = (m: string) => { for (const x of EXPANDIR[m] || [m as Metodo]) if (!metodos.includes(x)) metodos.push(x); };
      add(p.expectId());
      while (p.esOp(',')) { p.next(); add(p.expectId()); }
      let condicion: Expr = { k: 'lit', v: true };
      if (p.esOp(':')) { p.next(); if (!p.esId('if')) throw new Error('Se esperaba if'); p.next(); condicion = p.expr(); }
      p.expectOp(';');
      permisos.push({ metodos, condicion, texto: metodos.join(',') });
    }
    p.expectOp('}');
    return { patron, segmentos: patron.replace(/^\//, '').split('/'), permisos };
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
      return true; // cero o más segmentos
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
// Evaluación
// ---------------------------------------------------------------------------

class ErrorEvaluacion extends Error {}

interface Ambito { vars: Record<string, unknown>; ctx: ContextoPeticion; reglas: ReglasStorage; profundidad: number }

function evaluar(e: Expr, a: Ambito): unknown {
  switch (e.k) {
    case 'lit': return e.v;
    case 'path': return resolverRuta(e.v, a);
    case 'var': {
      if (e.name in a.vars) return a.vars[e.name];
      if (e.name === 'request') return { auth: a.ctx.auth, resource: a.ctx.resource === undefined ? undefined : { ...a.ctx.resource } };
      if (e.name === 'firestore') return { __firestore: true };
      if (e.name === 'resource') return a.ctx.resource; // no usado por las reglas actuales
      if (a.reglas.funciones.has(e.name)) return { __fn: e.name };
      throw new ErrorEvaluacion(`Variable desconocida ${e.name}`);
    }
    case 'member': {
      const obj = evaluar(e.obj, a) as Record<string, unknown> | null | undefined;
      if (obj === null || obj === undefined) throw new ErrorEvaluacion(`Acceso a .${e.prop} de ${obj}`);
      if (typeof obj === 'string') {
        if (e.prop === 'matches' || e.prop === 'size' || e.prop === 'split' || e.prop === 'lower') return { __strfn: e.prop, s: obj };
        throw new ErrorEvaluacion(`Método de string no soportado ${e.prop}`);
      }
      if ((obj as { __firestore?: boolean }).__firestore) return { __fsfn: e.prop };
      if (!(e.prop in obj)) throw new ErrorEvaluacion(`Propiedad inexistente ${e.prop}`);
      return obj[e.prop];
    }
    case 'call': {
      if (e.callee.k === 'var' && e.callee.name === '__list') return e.args.map((x) => evaluar(x, a));
      const callee = evaluar(e.callee, a) as Record<string, unknown>;
      const args = e.args.map((x) => evaluar(x, a));
      if (callee && callee.__fn) return llamarFuncion(callee.__fn as string, args, a);
      if (callee && callee.__strfn) {
        const s = callee.s as string;
        if (callee.__strfn === 'matches') return new RegExp(`^(?:${args[0] as string})$`).test(s); // RE2: `.` no casa con salto de línea
        if (callee.__strfn === 'size') return s.length;
        if (callee.__strfn === 'split') return s.split(new RegExp(args[0] as string));
        if (callee.__strfn === 'lower') return s.toLowerCase();
      }
      if (callee && callee.__fsfn) {
        const ruta = args[0] as string;
        const clave = ruta.replace(/^\/databases\/\(default\)\/documents\//, '');
        const doc = a.ctx.firestore[clave];
        if (callee.__fsfn === 'exists') return doc !== undefined;
        if (callee.__fsfn === 'get') { if (doc === undefined) throw new ErrorEvaluacion(`get de documento inexistente ${clave}`); return { data: doc, id: clave.split('/').pop() }; }
      }
      throw new ErrorEvaluacion('Llamada no soportada');
    }
    case 'unary': {
      const v = evaluar(e.e, a);
      if (e.op === '!') { if (typeof v !== 'boolean') throw new ErrorEvaluacion('! sobre no booleano'); return !v; }
      return -(v as number);
    }
    case 'is': {
      const v = evaluar(e.e, a);
      if (e.tipo === 'string') return typeof v === 'string';
      if (e.tipo === 'list') return Array.isArray(v);
      if (e.tipo === 'map') return typeof v === 'object' && v !== null && !Array.isArray(v);
      throw new ErrorEvaluacion(`is ${e.tipo} no soportado`);
    }
    case 'bin': {
      if (e.op === '&&') { const l = evaluar(e.l, a); if (typeof l !== 'boolean') throw new ErrorEvaluacion('&& no booleano'); return l ? bool(evaluar(e.r, a)) : false; }
      if (e.op === '||') { const l = evaluar(e.l, a); if (typeof l !== 'boolean') throw new ErrorEvaluacion('|| no booleano'); return l ? true : bool(evaluar(e.r, a)); }
      const l = evaluar(e.l, a); const r = evaluar(e.r, a);
      switch (e.op) {
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return (l as number) < (r as number);
        case '<=': return (l as number) <= (r as number);
        case '>': return (l as number) > (r as number);
        case '>=': return (l as number) >= (r as number);
        case '*': return (l as number) * (r as number);
        case '+': return (l as number) + (r as number);
        case '-': return (l as number) - (r as number);
        case '/': return (l as number) / (r as number);
        case 'in': {
          if (Array.isArray(r)) return r.includes(l);
          if (r && typeof r === 'object') return typeof l === 'string' && l in (r as Record<string, unknown>);
          throw new ErrorEvaluacion('in sobre tipo no soportado');
        }
      }
      throw new ErrorEvaluacion(`Operador ${e.op}`);
    }
  }
}

function bool(v: unknown): boolean { if (typeof v !== 'boolean') throw new ErrorEvaluacion('Condición no booleana'); return v; }

function resolverRuta(raw: string, a: Ambito): string {
  return raw.replace(/\$\(([^()]*(?:\([^()]*\))*[^()]*)\)/g, (_m, inner: string) => {
    const v = evaluar(new Parser(tokenizar(inner)).expr(), a);
    if (typeof v !== 'string') throw new ErrorEvaluacion('Segmento de ruta no string');
    return v;
  });
}

function llamarFuncion(nombre: string, args: unknown[], a: Ambito): unknown {
  const f = a.reglas.funciones.get(nombre);
  if (!f) throw new ErrorEvaluacion(`Función ${nombre} inexistente`);
  if (a.profundidad > 20) throw new ErrorEvaluacion('Pila de funciones > 20');
  const vars: Record<string, unknown> = { ...a.vars };
  f.params.forEach((p, i) => { vars[p] = args[i]; });
  return evaluar(f.cuerpo, { ...a, vars, profundidad: a.profundidad + 1 });
}

export interface Decision {
  permitido: boolean;
  /** Patrones de bloque que han concedido el permiso. */
  concedidoPor: string[];
  /** Patrones que casan con la ruta (aunque denieguen). */
  casan: string[];
}

export function decidir(reglas: ReglasStorage, ruta: string, metodo: Metodo, ctx: ContextoPeticion): Decision {
  if (['create', 'update'].includes(metodo) && !ctx.resource) throw new Error(`La operación ${metodo} necesita ctx.resource`);
  if (ctx.resource && ctx.resource.name !== ruta) throw new Error('ctx.resource.name debe coincidir con la ruta');
  const concedidoPor: string[] = [];
  const casan: string[] = [];
  for (const b of reglas.bloques) {
    const vars = casarPatron(b.segmentos, ruta);
    if (!vars) continue;
    casan.push(b.patron);
    for (const p of b.permisos) {
      if (!p.metodos.includes(metodo)) continue;
      let ok = false;
      try {
        const v = evaluar(p.condicion, { vars, ctx: metodo === 'delete' || metodo === 'get' || metodo === 'list' ? { ...ctx, resource: metodo === 'delete' ? ctx.resource : undefined } : ctx, reglas, profundidad: 0 });
        ok = v === true;
      } catch (err) {
        if (!(err instanceof ErrorEvaluacion)) throw err;
        ok = false;
      }
      if (ok) { concedidoPor.push(b.patron); break; }
    }
  }
  return { permitido: concedidoPor.length > 0, concedidoPor, casan };
}

export function permitido(reglas: ReglasStorage, ruta: string, metodo: Metodo, ctx: ContextoPeticion): boolean {
  return decidir(reglas, ruta, metodo, ctx).permitido;
}
