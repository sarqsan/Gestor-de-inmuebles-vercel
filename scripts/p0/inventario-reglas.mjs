#!/usr/bin/env node
/**
 * P0-A · INVENTARIO REPRODUCIBLE DE REGLAS (Firestore + Storage)
 * =============================================================
 * Extrae, sin interpretarlas, las políticas declaradas en `firestore.rules` y
 * `storage.rules` para que el inventario del informe sea VERIFICABLE y no una
 * transcripción manual.
 *
 * Qué hace:
 *   1. Enumera cada bloque `match` de primer nivel (colección) y los anidados.
 *   2. Extrae cada sentencia `allow <ops>: if <cond>` con su condición literal.
 *   3. Extrae las funciones locales declaradas dentro de cada bloque.
 *   4. Extrae las rutas y reglas de `storage.rules`.
 *   5. Emite JSON (para pruebas y comparaciones) y una tabla Markdown.
 *
 * Qué NO hace:
 *   · No evalúa condiciones ni decide si una política es correcta.
 *   · No sustituye al motor de reglas: es un inventario, no una certificación.
 *
 * Uso:
 *   node scripts/p0/inventario-reglas.mjs            # JSON por stdout
 *   node scripts/p0/inventario-reglas.mjs --md       # tabla Markdown
 *   node scripts/p0/inventario-reglas.mjs --json-out docs/.../p0-inventario.json
 *
 * Solo lectura: no escribe nada salvo el fichero que se pida con --json-out.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Elimina comentarios de línea y de bloque conservando los saltos de línea. */
export function sinComentarios(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

/**
 * Devuelve el índice del cierre de llave que equilibra la apertura en `desde`.
 * Ignora llaves dentro de cadenas.
 */
function cierreDeLlave(texto, desde) {
  let nivel = 0;
  let enCadena = null;
  for (let i = desde; i < texto.length; i += 1) {
    const c = texto[i];
    if (enCadena) {
      if (c === '\\') { i += 1; continue; }
      if (c === enCadena) enCadena = null;
      continue;
    }
    if (c === '"' || c === "'") { enCadena = c; continue; }
    if (c === '{') nivel += 1;
    else if (c === '}') {
      nivel -= 1;
      if (nivel === 0) return i;
    }
  }
  return -1;
}

/** Extrae los bloques `match /ruta/{param} { ... }` de un texto de reglas. */
export function extraerBloques(texto, { soloPrimerNivel = true } = {}) {
  const limpio = sinComentarios(texto);
  const bloques = [];
  // La ruta puede contener `{param}`: se captura completa y la llave que abre el
  // cuerpo es la que sigue al espacio posterior a la ruta.
  const re = /(^|\n)([ \t]*)match\s+(\/[^\s]+)\s*\{/g;
  let m;
  while ((m = re.exec(limpio)) !== null) {
    const indentacion = m[2].length;
    if (soloPrimerNivel && indentacion !== 4) continue;
    if (!soloPrimerNivel && indentacion < 4) continue;
    // `m[0]` termina en la `{` que abre el cuerpo del bloque.
    const apertura = m.index + m[0].length - 1;
    const cierre = cierreDeLlave(limpio, apertura);
    if (cierre < 0) continue;
    const cuerpo = limpio.slice(apertura + 1, cierre);
    bloques.push({
      ruta: m[3],
      indentacion,
      linea: limpio.slice(0, m.index + m[0].length).split('\n').length,
      cuerpo,
    });
    // No avanzar: permite encontrar bloques anidados dentro.
  }
  return bloques;
}

/**
 * Devuelve el cuerpo del bloque SIN sus sub-bloques `match` anidados.
 *
 * Motivo (defecto detectado al validar este extractor): un bloque puede contener
 * `match` hijos con sus propios `allow`. Si no se excluyen, las reglas del hijo
 * se atribuyen al padre y el inventario MIENTE. Ejemplo real: `usuarios_auth`
 * declara `allow delete: if false` y tiene el sub-bloque `progreso_tutoriales`
 * con `allow delete: if request.auth.uid == uid`; sin excluir el hijo, el
 * inventario mostraba un borrado permitido que no existe.
 */
export function cuerpoPropio(cuerpo) {
  let resultado = '';
  let i = 0;
  const re = /match\s+\/[^\s]+\s*\{/g;
  while (i < cuerpo.length) {
    re.lastIndex = i;
    const m = re.exec(cuerpo);
    if (!m) { resultado += cuerpo.slice(i); break; }
    resultado += cuerpo.slice(i, m.index);
    const apertura = m.index + m[0].length - 1;
    const cierre = cierreDeLlave(cuerpo, apertura);
    if (cierre < 0) { resultado += cuerpo.slice(m.index); break; }
    // Se sustituye el sub-bloque por espacios conservando los saltos de línea.
    resultado += cuerpo.slice(m.index, cierre + 1).replace(/[^\n]/g, ' ');
    i = cierre + 1;
  }
  return resultado;
}

/**
 * Sentencias `allow <ops>: if <condición>;` del cuerpo PROPIO del bloque
 * (sin sub-bloques). Soporta condiciones multi-línea, que en estas reglas son
 * la mayoría.
 */
export function extraerAllows(cuerpo) {
  const propio = cuerpoPropio(cuerpo);
  const allows = [];
  const re = /allow\s+([a-z,\s]+?)\s*:\s*if\s+([\s\S]*?);/g;
  let m;
  while ((m = re.exec(propio)) !== null) {
    allows.push({
      operaciones: m[1].split(',').map((o) => o.trim()).filter(Boolean),
      condicion: m[2].replace(/\s+/g, ' ').trim(),
    });
  }
  return allows;
}

/** Funciones locales declaradas dentro de un bloque. */
export function extraerFuncionesLocales(cuerpo) {
  const nombres = [];
  const re = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = re.exec(cuerpo)) !== null) nombres.push(m[1]);
  return [...new Set(nombres)];
}

/** Nombres de colecciones ajenas referenciadas en una condición (`get(`/`exists(`). */
export function coleccionesReferenciadas(condicion) {
  const refs = new Set();
  const re = /(?:get|exists|getAfter|existsAfter)\(\s*\/databases\/\$\(database\)\/documents\/([A-Za-z_]+)/g;
  let m;
  while ((m = re.exec(condicion)) !== null) refs.add(m[1]);
  return [...refs];
}

export function inventariarFirestore(rutaFichero) {
  const texto = readFileSync(rutaFichero, 'utf8');
  const primerNivel = extraerBloques(texto, { soloPrimerNivel: true });
  const anidados = extraerBloques(texto, { soloPrimerNivel: false }).filter((b) => b.indentacion > 4);
  const colecciones = primerNivel.map((b) => {
    // Los `allow` propios del bloque están a indentación+2 respecto al `match`.
    const allows = extraerAllows(b.cuerpo);
    return {
      coleccion: b.ruta.replace(/^\/|\/\{.*$/g, ''),
      linea: b.linea,
      permite: Object.fromEntries(allows.map((a) => [a.operaciones.join(','), a.condicion])),
      sentenciasAllow: allows.length,
      funcionesLocales: extraerFuncionesLocales(b.cuerpo),
      referenciasCruzadas: [...new Set(allows.flatMap((a) => coleccionesReferenciadas(a.condicion)))],
      lineasBloque: b.cuerpo.split('\n').length,
    };
  });
  return {
    fichero: 'firestore.rules',
    lineasTotales: texto.split('\n').length,
    totalColecciones: colecciones.length,
    subcolecciones: anidados.map((b) => ({ ruta: b.ruta, linea: b.linea, sentenciasAllow: extraerAllows(b.cuerpo).length })),
    coleccionesOrdenadas: colecciones.map((c) => c.coleccion).sort(),
    colecciones,
  };
}

export function inventariarStorage(rutaFichero) {
  const texto = readFileSync(rutaFichero, 'utf8');
  const bloques = extraerBloques(texto, { soloPrimerNivel: true });
  return {
    fichero: 'storage.rules',
    lineasTotales: texto.split('\n').length,
    rutas: bloques.map((b) => ({
      ruta: b.ruta,
      linea: b.linea,
      permite: extraerAllows(b.cuerpo),
    })),
    // Autorización documental delegada en servidor: se inventaría aparte.
    delegaEnServidor: /server\/documentos/.test(texto),
  };
}

/** Destinos documentales autorizados en servidor (P3/P5). */
export function inventariarDestinosServidor(rutaFichero) {
  const texto = readFileSync(rutaFichero, 'utf8');
  const destinos = [];
  const re = /clave:\s*'([A-Z_]+)'[\s\S]*?patron:\s*new RegExp\(`([^`]+)`\)/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    destinos.push({ clave: m[1], patron: m[2] });
  }
  return destinos;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function tablaMarkdown(inv) {
  const filas = [];
  filas.push('| # | Colección | Línea | GET | LIST | CREATE | UPDATE | DELETE | Nº allows |');
  filas.push('|---|---|---:|:-:|:-:|:-:|:-:|:-:|---:|');
  inv.colecciones.forEach((c, i) => {
    const marca = (op) => (c.permite[op] !== undefined ? '✅' : '—');
    const ops = Object.keys(c.permite).join(',');
    filas.push(
      `| ${i + 1} | \`${c.coleccion}\` | ${c.linea} | ${marca('get')} | ${marca('list')} | ${marca('create')} | ${marca('update')} | ${marca('delete')} | ${c.sentenciasAllow}${ops ? '' : ' ⚠' } |`,
    );
  });
  return filas.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argMd = process.argv.includes('--md');
  const idxOut = process.argv.indexOf('--json-out');
  const salidaJson = idxOut > -1 ? process.argv[idxOut + 1] : null;

  const fs = inventariarFirestore(resolve(RAIZ, 'firestore.rules'));
  const st = inventariarStorage(resolve(RAIZ, 'storage.rules'));
  const destinos = inventariarDestinosServidor(resolve(RAIZ, 'server/documentos/autorizacionDocumental.ts'));

  const inventario = {
    generadoEn: new Date().toISOString(),
    commit: process.env.GIT_COMMIT || null,
    firestore: fs,
    storage: st,
    destinosDocumentalesServidor: destinos,
  };

  if (salidaJson) {
    mkdirSync(dirname(salidaJson), { recursive: true });
    writeFileSync(salidaJson, JSON.stringify(inventario, null, 2), 'utf8');
    console.error(`[p0] inventario escrito en ${salidaJson}`);
  }

  if (argMd) {
    console.log(`### Firestore — ${fs.totalColecciones} colecciones con bloque de primer nivel\n`);
    console.log(tablaMarkdown(fs));
    console.log(`\n### Storage — ${st.rutas.length} rutas\n`);
    for (const r of st.rutas) {
      const permisos = r.permite.map((p) => `${p.operaciones.join('/')}`).join(', ') || 'sin allow';
      console.log(`- \`${r.ruta}\` (línea ${r.linea}) → ${permisos}`);
    }
    console.log(`\n### Destinos documentales autorizados en servidor — ${destinos.length}\n`);
    for (const d of destinos) console.log(`- \`${d.clave}\` → \`${d.patron}\``);
    console.log(`\n### Subcolecciones — ${st && fs.subcolecciones.length}\n`);
    for (const s of fs.subcolecciones) console.log(`- \`${s.ruta}\` (línea ${s.linea}) → ${s.sentenciasAllow} allow`);
  } else {
    console.log(JSON.stringify(inventario, null, 2));
  }
}
