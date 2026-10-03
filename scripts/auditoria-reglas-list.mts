/**
 * AUDITORÍA ESTÁTICA — compatibilidad `allow list` ↔ consulta SIN filtro.
 * =====================================================================
 * Por qué existe (auditoría de permisos 2026-10-03, FASE 6 y FASE 10).
 *
 * Las Firestore Rules **no son filtros**: una consulta se evalúa contra su
 * conjunto potencial de resultados, no contra los documentos reales. Por eso
 * una regla `list` que exige CUALQUIER condición sobre el contenido del
 * documento (`resource.data`) sólo es demostrable si la consulta incorpora el
 * filtro que la satisface. Una consulta **sin** `where` sobre la colección —
 * exactamente la que abre el cliente para el ámbito administrativo — se
 * deniega siempre que la regla no tenga una rama evaluable SIN conocer el
 * documento (p. ej. `esAdminInmuebles()`, `isMasterAdmin()`).
 *
 * El defecto que motivó este auditor es de ORDEN DE GUARDAS: cinco colecciones
 * escribían
 *
 *     allow list: if '<campo>' in resource.data && ambitoPor<X>Lectura(...);
 *
 * cuando `ambitoPor<X>Lectura()` ya empieza por `esAdminInmuebles()`. Al estar
 * el short-circuit administrativo DETRÁS de la demanda de contenido, la rama
 * nunca se alcanzaba en una consulta sin filtro y el administrador recibía
 * `permission-denied` igual que un usuario sin ámbito.
 *
 * QUÉ HACE: recorre `firestore.rules`, aísla cada `allow list`, la divide en
 * disyuntos de primer nivel (`||`) y decide si ALGUNO es demostrable sin
 * conocer el documento. Después cruza el resultado con las colecciones que el
 * cliente consulta SIN filtro para el ámbito administrativo.
 *
 * QUÉ NO HACE: no interpreta reglas, no sustituye al emulador ni al motor real
 * de Firestore, no lee ni escribe datos y no modifica nada. Es análisis
 * estático del texto de las reglas y del código del cliente.
 *
 * Salida: tabla legible + JSON. Código de salida 1 si hay incompatibilidades.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_RULES = resolve(RAIZ, 'firestore.rules');
const RUTA_FIREBASE = resolve(RAIZ, 'src/lib/firebase.ts');

/** Predicados administrativos que NO dependen del documento consultado. */
const ADMINISTRATIVO = /(?:^|[^A-Za-z0-9_])(?:esAdminInmuebles|isMasterAdmin|isStaff)\s*\(\s*\)/;
/** Cualquier demanda sobre el contenido del documento en una regla `list`. */
const DEMANDA_CONTENIDO = /resource\.data/;

/** Divide una condición por `||` de primer nivel (respetando paréntesis). */
export function dividirDisyuntos(condicion: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let actual = '';
  for (let i = 0; i < condicion.length; i += 1) {
    const c = condicion[i];
    if (c === '(') nivel += 1;
    if (c === ')') nivel -= 1;
    if (c === '|' && condicion[i + 1] === '|' && nivel === 0) {
      partes.push(actual.trim());
      actual = '';
      i += 1;
      continue;
    }
    actual += c;
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

export interface ReglaList {
  coleccion: string;
  linea: number;
  condicion: string;
  /** ¿Algún disyunto es demostrable sin conocer el documento? */
  demostrableSinFiltro: boolean;
  /** Rama que lo hace demostrable (para el informe). */
  ramaDemostrable?: string;
}

/** Extrae todas las reglas `allow list` del fichero de reglas. */
export function extraerReglasList(rules: string): ReglaList[] {
  const lineas = rules.split('\n');
  const salida: ReglaList[] = [];
  let coleccion = '(raíz)';

  for (let i = 0; i < lineas.length; i += 1) {
    const matchCol = lineas[i].match(/^\s*match\s+\/(\w+)\//);
    if (matchCol) coleccion = matchCol[1];

    if (!/^\s*allow\s+list\s*:/.test(lineas[i])) continue;

    // La sentencia puede ocupar varias líneas: se acumula hasta el `;`.
    let stmt = lineas[i].trim();
    let j = i;
    while (!stmt.includes(';') && j + 1 < lineas.length) {
      j += 1;
      stmt += ` ${lineas[j].trim()}`;
    }
    // `allow list: if <expr>;` → se conserva sólo la expresión booleana.
    const condicion = stmt
      .slice(stmt.indexOf(':') + 1)
      .replace(/;\s*$/, '')
      .trim()
      .replace(/^if\s+/, '');

    // Las subfunciones declaradas dentro del bloque (`function ...`) no son
    // parte de la condición; se recortan por claridad del informe.
    const disyuntos = dividirDisyuntos(condicion);
    const demostrable = disyuntos.find((d) => !DEMANDA_CONTENIDO.test(d));

    salida.push({
      coleccion,
      linea: i + 1,
      condicion,
      demostrableSinFiltro: Boolean(demostrable),
      ...(demostrable ? { ramaDemostrable: demostrable } : {}),
    });
    i = j;
  }
  return salida;
}

/**
 * Colecciones que el cliente consulta SIN ningún `where` cuando el perfil es
 * administrativo (o no hay ámbito).
 *
 * Se deriva del código REAL de la aplicación, no de una lista escrita a mano:
 * se recorre todo `src/` buscando llamadas a `subscribeColeccionPorAmbito`
 * (directas o a través de `subscribeColeccionPropietario`). En las dos rutas
 * administrativas de esa función la consulta es la colección COMPLETA:
 *
 *   · `campo === 'inmuebleId' | 'contratoId'` → `coleccionCompleta` y sin ids
 *     ⇒ `onSnapshot(col, mapear, onError)`;
 *   · resto de casos ⇒ `if (!scope || perfil === 'ADMINISTRADOR' || !perfil)
 *     return onSnapshot(col, mapear, onError);`
 *
 * Si el cliente cambia, este conjunto cambia solo.
 */
export function coleccionesConsultaSinFiltroAdmin(fuentes: Array<{ archivo: string; codigo: string }>): Set<string> {
  const halladas = new Set<string>();
  // Primera argumento: `collection(db, 'nombre')` (con comas internas) o un identificador.
  const PRIMER_ARG = /subscribeColeccion(?:PorAmbito|Propietario)(?:<[^>]*>)?\(\s*(collection\(\s*db\s*,\s*'([^']+)'\s*\)|(\w+))\s*,/g;

  for (const { codigo } of fuentes) {
    // Se descartan las DEFINICIONES de las fábricas: sólo interesan las llamadas.
    const sinDefiniciones = codigo.replace(/^\s*(?:export\s+)?function\s+subscribeColeccion(?:PorAmbito|Propietario)\b/gm, '// def');
    for (const m of sinDefiniciones.matchAll(PRIMER_ARG)) {
      if (m[2]) halladas.add(m[2]);
      else if (m[3]) halladas.add(`CONST:${m[3]}`);
    }
  }
  return halladas;
}

/** Resolución de los nombres de colección a partir de `collection(db, 'x')`. */
export function mapaColecciones(codigo: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of codigo.matchAll(/const\s+(\w+)\s*=\s*collection\(\s*db\s*,\s*'([^']+)'\s*\)/g)) {
    mapa.set(m[1], m[2]);
  }
  return mapa;
}

/** Lee recursivamente los `.ts`/`.tsx` de un directorio. */
export function leerFuentes(dir: string): Array<{ archivo: string; codigo: string }> {
  const salida: Array<{ archivo: string; codigo: string }> = [];
  const visitar = (d: string) => {
    for (const entrada of readdirSync(d)) {
      const ruta = join(d, entrada);
      if (statSync(ruta).isDirectory()) {
        if (entrada !== 'node_modules' && entrada !== '__pycache__') visitar(ruta);
        continue;
      }
      if (/\.tsx?$/.test(entrada) && !entrada.endsWith('.d.ts')) {
        salida.push({ archivo: ruta, codigo: readFileSync(ruta, 'utf8') });
      }
    }
  };
  visitar(dir);
  return salida;
}

export interface Informe {
  reglas: ReglaList[];
  incompatibles: ReglaList[];
  consultadasSinFiltro: string[];
  bloqueantes: Array<{ coleccion: string; linea: number }>;
  sinResolver: string[];
}

export function auditar(rules: string, fuentes: Array<{ archivo: string; codigo: string }>): Informe {
  const reglas = extraerReglasList(rules);
  const incompatibles = reglas.filter((r) => !r.demostrableSinFiltro);

  // Constantes de colección definidas en cualquier fichero de `src/`.
  const mapa = new Map<string, string>();
  for (const { codigo } of fuentes) for (const [k, v] of mapaColecciones(codigo)) mapa.set(k, v);

  const crudas = coleccionesConsultaSinFiltroAdmin(fuentes);
  const sinResolver: string[] = [];
  const consultadasSinFiltro: string[] = [];
  for (const c of crudas) {
    if (!c.startsWith('CONST:')) {
      consultadasSinFiltro.push(c);
      continue;
    }
    const nombre = c.slice(6);
    const resuelto = mapa.get(nombre);
    // `col`/`callback` son parámetros de las fábricas, no constantes de colección.
    if (resuelto) consultadasSinFiltro.push(resuelto);
    else if (!/^(col|callback|scope|etiqueta|opciones)$/.test(nombre)) sinResolver.push(nombre);
  }
  consultadasSinFiltro.sort();

  const porColeccion = new Map<string, ReglaList>();
  for (const r of incompatibles) if (!porColeccion.has(r.coleccion)) porColeccion.set(r.coleccion, r);

  const bloqueantes = consultadasSinFiltro
    .filter((c) => porColeccion.has(c))
    .map((c) => ({ coleccion: c, linea: porColeccion.get(c)!.linea }));

  return { reglas, incompatibles, consultadasSinFiltro, bloqueantes, sinResolver };
}

// ---------------------------------------------------------------------------
// Ejecución directa
// ---------------------------------------------------------------------------
function principal(): void {
  // `--contra <fichero>` audita otro ruleset (p. ej. el de antes de una
  // corrección) sin tocar el del repositorio. Útil para demostrar que el
  // auditor DETECTA el defecto y no sólo que hoy no aparece.
  const flagContra = process.argv.indexOf('--contra');
  const rutaRules = flagContra > -1 ? resolve(process.argv[flagContra + 1]) : RUTA_RULES;
  const rules = readFileSync(rutaRules, 'utf8');
  const fuentes = leerFuentes(resolve(RAIZ, 'src'));
  const informe = auditar(rules, fuentes);
  console.log(`Reglas auditadas: ${rutaRules}\n`);

  const ancho = Math.max(...informe.reglas.map((r) => r.coleccion.length), 20);
  console.log('=== AUDITORÍA `allow list` ↔ consulta sin filtro ===\n');
  console.log(`Reglas \`allow list\` analizadas:        ${informe.reglas.length}`);
  console.log(`No demostrables sin filtro:           ${informe.incompatibles.length}`);
  console.log(`Consultadas sin filtro por el admin:  ${informe.consultadasSinFiltro.length}`);
  console.log(`  ${informe.consultadasSinFiltro.join(', ') || '(ninguna)'}`);
  if (informe.sinResolver.length > 0) {
    console.log(`  AVISO: sin resolver -> ${informe.sinResolver.join(', ')}`);
  }
  console.log('');

  if (informe.incompatibles.length > 0) {
    console.log('Colecciones cuya regla `list` NO es demostrable sin un `where`:');
    for (const r of informe.incompatibles) {
      console.log(`  · ${r.coleccion.padEnd(ancho)} (línea ${r.linea})`);
    }
    console.log('');
  }

  if (informe.bloqueantes.length > 0) {
    console.error('INCOMPATIBILIDAD BLOQUEANTE — el cliente pide la colección completa y la regla no la autoriza:');
    for (const b of informe.bloqueantes) {
      console.error(`  ✗ ${b.coleccion} (firestore.rules:${b.linea})`);
    }
    console.error('\nCausa: la regla exige contenido del documento en TODAS sus ramas.');
    console.error('Como las reglas no son filtros, una consulta sin `where` se deniega siempre.');
    process.exit(1);
  }

  console.log('OK — ninguna colección consultada sin filtro por el ámbito administrativo');
  console.log('     tiene una regla `list` indemostrable.\n');

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(informe, null, 2));
  }
}

const esPrincipal = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (esPrincipal) principal();
