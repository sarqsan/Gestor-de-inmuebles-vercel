#!/usr/bin/env node
/**
 * P0.1 — `npm run doctor`: diagnóstico EJECUTABLE, de SOLO LECTURA.
 * ===========================================================================
 * Dos niveles, ambos sin escribir nada:
 *
 *  1. ESTÁTICO (siempre): paridad del correo maestro entre `masterAdmin.ts` y
 *     `firestore.rules`; ausencia de literales maestros dispersos; banderas de
 *     semillas/demo desactivadas por defecto; documentación de las 27 variables
 *     en `.env.example` y `docs/CONFIGURACION-VERIFICABLE.md`; ningún valor
 *     activo en `.env.example`; scripts `doctor` y `test` en `package.json`.
 *  2. EN VIVO (solo con --url / --live): GET /api/health e impresión del mapa
 *     de capacidades con vocabulario cerrado. NUNCA presenta SIMULACION,
 *     NO_CONFIGURADO o BLOQUEADO como verde.
 *
 * SEGURIDAD: rechaza explícitamente cualquier destino que no sea local o el
 * proxy del sandbox. Un host de producción (Vercel/Firebase/Cloud Run o el
 * projectId de producción) termina con código 2 sin hacer ninguna petición.
 *
 * Uso:
 *   node scripts/doctor.mjs
 *   node scripts/doctor.mjs --url http://127.0.0.1:3000/api/health
 *   node scripts/doctor.mjs --url ... --strict
 *   node scripts/doctor.mjs --json
 *   node scripts/doctor.mjs --url ... --permitir-host mi-staging.interno
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Capacidades núcleo que el plan P0.1 exige verificar (8). */
export const CAPACIDADES_NUCLEO = Object.freeze([
  'autenticacion',
  'firestore',
  'portalesPublicos',
  'custodia',
  'actualizacionRenta',
  'seguimiento',
  'modoEmail',
  'cron',
]);

/** Variables de aplicación documentadas (24 heredadas + 2 nuevas de P0.1). */
export const VARIABLES_DOCUMENTADAS = Object.freeze([
  'GEMINI_API_KEY', 'APP_URL', 'CRON_SECRET', 'EMAIL_PROVEEDOR', 'ENABLE_EMAIL',
  'SMTP_URL', 'RESEND_API_KEY', 'SENDGRID_API_KEY', 'EMAIL_FROM',
  'EMAIL_DESPACHO_NOMBRE', 'EMAIL_REPLY_TO', 'IA_POLITICA_JSON',
  'IA_LLAVES_CLAVE_MAESTRA', 'IA_LLAVES_SIN_LLAVE', 'IA_LLAVES_VERIFICACION',
  'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_B64',
  'FIREBASE_SERVICE_ACCOUNT_PATH', 'GOOGLE_APPLICATION_CREDENTIALS',
  'FIREBASE_PROJECT_ID', 'FIRESTORE_DATABASE_ID', 'MASTER_ADMIN_EMAIL',
  'SEGUIMIENTO_ADMIN_USUARIO_ID', 'TZ', 'VITE_SEEDS_ENABLED', 'VITE_DEMO_DATA',
  'VITE_MODALIDAD_SISTEMA_FACTURACION',
]);

export const ESTADOS_NO_REALES = Object.freeze(['NO_CONFIGURADO', 'SIMULACION', 'BLOQUEADO']);

const HOST_LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i;
const HOST_SANDBOX = /\.e2b\.app$/i;
const HOST_PRODUCCION = [
  /gestor-inmuebles-produccion/i,
  /ai-studio-gestordeinmueble/i,
  /(^|\.)(vercel\.app|web\.app|firebaseapp\.com|firebaseio\.com|appspot\.com|netlify\.app|onrender\.com|herokuapp\.com|run\.app)$/i,
];

/**
 * Clasifica un host. Devuelve 'LOCAL', 'SANDBOX', 'PRODUCCION' o 'EXTERNO'.
 * Exportada para los tests: es la guardia que impide tocar producción.
 */
export function clasificarHost(host) {
  const limpio = String(host || '').trim().toLowerCase().replace(/\.$/, '');
  if (!limpio) return 'EXTERNO';
  if (HOST_PRODUCCION.some((r) => r.test(limpio))) return 'PRODUCCION';
  if (HOST_LOCAL.test(limpio)) return 'LOCAL';
  if (HOST_SANDBOX.test(limpio)) return 'SANDBOX';
  return 'EXTERNO';
}

/** Valida la URL destino. Lanza Error con mensaje explícito si es producción. */
export function validarDestino(url, permitirHost = null) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`URL de diagnóstico inválida: ${url}`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    throw new Error(`Protocolo no admitido (${u.protocol}): solo http/https`);
  }
  const clase = clasificarHost(u.hostname);
  if (clase === 'PRODUCCION') {
    throw new Error(
      `DESTINO DE PRODUCCIÓN RECHAZADO (${u.hostname}). ` +
      'El doctor solo consulta entornos locales o de sandbox; no se ha enviado ninguna petición.'
    );
  }
  if (clase === 'EXTERNO' && permitirHost !== u.hostname.toLowerCase()) {
    throw new Error(
      `Destino externo no permitido (${u.hostname}). ` +
      `Usa --permitir-host ${u.hostname} solo si es un entorno de staging verificado; no se ha enviado ninguna petición.`
    );
  }
  return u;
}

function leer(ruta) {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

function ficherosFuente(directorio, acumulado = []) {
  for (const nombre of readdirSync(join(RAIZ, directorio))) {
    const ruta = join(directorio, nombre);
    const abs = join(RAIZ, ruta);
    if (statSync(abs).isDirectory()) {
      ficherosFuente(ruta, acumulado);
    } else if (/\.(ts|tsx|mts|js|mjs)$/.test(nombre) && !/\.(test|spec)\./.test(nombre)) {
      acumulado.push(ruta);
    }
  }
  return acumulado;
}

/**
 * Comprobaciones estáticas. Devuelve un array de
 * `{ id, estado: 'OK'|'ERROR'|'AVISO', detalle }`.
 */
export function diagnosticosEstaticos() {
  const salida = [];
  const anadir = (id, estado, detalle) => salida.push({ id, estado, detalle });

  // 1. Paridad del correo maestro: fuente única ↔ literal de las reglas.
  const fuente = leer('src/lib/masterAdmin.ts');
  const reglas = leer('firestore.rules');
  const mFuente = /MASTER_ADMIN_EMAIL_POR_DEFECTO\s*=\s*'([^']+)'/.exec(fuente);
  const mReglas = /function\s+isMasterAdmin\s*\(\s*\)\s*\{[^}]*?authEmail\(\)\s*==\s*'([^']+)'/s.exec(reglas)
    || /authEmail\(\)\s*==\s*'([^']+)'/.exec(reglas);
  if (!mFuente || !mReglas) {
    anadir('master.paridad', 'ERROR', 'No se pudo leer el maestro en masterAdmin.ts o en firestore.rules');
  } else if (mFuente[1].toLowerCase() !== mReglas[1].toLowerCase()) {
    anadir('master.paridad', 'ERROR', `DIVERGENCIA: fuente=${mFuente[1]} reglas=${mReglas[1]}`);
  } else {
    anadir('master.paridad', 'OK', `Único literal, coincide con las reglas (${mReglas[1]})`);
  }

  // 2. Ningún literal maestro disperso en código de producto.
  const maestro = (mReglas?.[1] || 'sarqsan2@gmail.com').toLowerCase();
  const permitidos = new Set(['src/lib/masterAdmin.ts']);
  const dispersos = [...ficherosFuente('src'), ...ficherosFuente('server')]
    .filter((ruta) => !permitidos.has(ruta.replace(/\\/g, '/')))
    .filter((ruta) => leer(ruta).toLowerCase().includes(maestro));
  if (dispersos.length) {
    anadir('master.literales', 'ERROR', `Literales maestros sin centralizar: ${dispersos.join(', ')}`);
  } else {
    anadir('master.literales', 'OK', 'Cero literales maestros fuera de la fuente única');
  }

  // 3. Semillas y datos demo: desactivados salvo bandera explícita.
  const firebase = leer('src/lib/firebase.ts');
  const inicial = leer('src/data/estadoInicial.ts');
  const app = leer('src/App.tsx');
  const guardias = firebase.includes('semillasHabilitadas()') && firebase.includes('seedInitialDataIfEmpty');
  const iniciales = inicial.includes('datosDemoHabilitados()') && !app.includes('INITIAL_ASEGURADORAS');
  const sinEscrituraEnLectura = /if \(!hasSeag && semillasHabilitadas\(\)\)/.test(firebase);
  if (guardias && iniciales && sinEscrituraEnLectura) {
    anadir('semillas', 'OK', 'Siembra opt-in, estados iniciales vacíos y lectura sin escritura demo');
  } else {
    anadir('semillas', 'ERROR',
      `Guardias incompletas (guardias=${guardias}, iniciales=${iniciales}, lectura=${sinEscrituraEnLectura})`);
  }

  // 4. `.env.example`: sin valores activos y con las 27 variables.
  const ejemplo = leer('.env.example');
  const activas = ejemplo.split(/\r?\n/).filter((l) => /^[A-Z][A-Z0-9_]*\s*=/.test(l));
  if (activas.length) {
    anadir('entorno.sin_secretos', 'ERROR', `.env.example tiene ${activas.length} asignaciones activas`);
  } else {
    anadir('entorno.sin_secretos', 'OK', 'Ninguna asignación activa en .env.example');
  }

  // 5. Documentación de las 27 variables en AMBOS sitios.
  let doc;
  try {
    doc = leer('docs/CONFIGURACION-VERIFICABLE.md');
  } catch {
    doc = '';
  }
  const faltaEjemplo = VARIABLES_DOCUMENTADAS.filter((v) => !new RegExp(`\\b${v}\\b`).test(ejemplo));
  const faltaDoc = VARIABLES_DOCUMENTADAS.filter((v) => !new RegExp(`\\b${v}\\b`).test(doc));
  if (faltaEjemplo.length || faltaDoc.length) {
    anadir('configuracion.documentada', 'ERROR',
      `Faltan variables: .env.example=[${faltaEjemplo}] documento=[${faltaDoc}]`);
  } else {
    anadir('configuracion.documentada', 'OK',
      `${VARIABLES_DOCUMENTADAS.length}/${VARIABLES_DOCUMENTADAS.length} variables documentadas`);
  }

  // 6. Scripts de verificación disponibles.
  const pkg = JSON.parse(leer('package.json'));
  const scripts = pkg.scripts || {};
  if (scripts.doctor && scripts.test) {
    anadir('scripts', 'OK', 'npm run doctor y npm test disponibles');
  } else {
    anadir('scripts', 'ERROR', `Faltan scripts (doctor=${!!scripts.doctor}, test=${!!scripts.test})`);
  }

  return salida;
}

function argumentos(argv) {
  const op = { url: null, strict: false, json: false, live: false, permitirHost: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url') op.url = argv[++i];
    else if (a.startsWith('--url=')) op.url = a.slice(6);
    else if (a === '--permitir-host') op.permitirHost = String(argv[++i] || '').toLowerCase();
    else if (a === '--strict' || a === '--estricto') op.strict = true;
    else if (a === '--json') op.json = true;
    else if (a === '--live') op.live = true;
    else if (a === '--help' || a === '-h') op.help = true;
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return op;
}

const COLOR = { OK: '\x1b[32m', AVISO: '\x1b[33m', ERROR: '\x1b[31m' };
const RESET = '\x1b[0m';
function pintar(estado) {
  return `${COLOR[estado] || ''}${estado.padEnd(16)}${RESET}`;
}

/** Punto de entrada. Devuelve el código de salida (no llama a process.exit). */
export async function ejecutarDoctor(argv = [], opciones = {}) {
  const leerLinea = opciones.log || console.log;
  const fetchImpl = opciones.fetchImpl || fetch;
  let op;
  try {
    op = argumentos(argv);
  } catch (error) {
    leerLinea(`ERROR: ${error.message}`);
    return 1;
  }
  if (op.help) {
    leerLinea('Uso: npm run doctor -- [--url URL] [--strict] [--json] [--live] [--permitir-host HOST]');
    leerLinea('Diagnóstico de SOLO LECTURA. Rechaza destinos de producción.');
    return 0;
  }

  const estaticos = diagnosticosEstaticos();
  const erroresEstaticos = estaticos.filter((d) => d.estado === 'ERROR');

  // --- destino en vivo ---
  let url = op.url || (op.live ? (opciones.healthUrl || 'http://127.0.0.1:3000/api/health') : null);
  let capacidades = null;
  let errorVivo = null;
  let rechazoProduccion = false;
  if (url) {
    try {
      const destino = validarDestino(url, op.permitirHost);
      if (destino.pathname !== '/api/health') {
        throw new Error(`La ruta debe ser /api/health (recibido ${destino.pathname})`);
      }
      const respuesta = await fetchImpl(destino.href, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' },
      });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const cuerpo = await respuesta.json();
      if (cuerpo.esquemaDiagnostico !== 1 || !cuerpo.capacidades) {
        throw new Error('El servidor no publica el esquema de capacidades P0.1');
      }
      capacidades = cuerpo.capacidades;
    } catch (error) {
      errorVivo = error.message;
      rechazoProduccion = /RECHAZADO|Destino externo no permitido/.test(error.message);
    }
  }

  const nucleo = CAPACIDADES_NUCLEO.map((nombre) => {
    const c = capacidades?.[nombre];
    return {
      nombre,
      estado: c?.estado || 'NO_VERIFICADO',
      detalle: c?.detalle || (url ? 'Capacidad no publicada por /api/health' : 'Servidor no consultado'),
    };
  });
  const noReales = nucleo.filter((c) => ESTADOS_NO_REALES.includes(c.estado));
  const noConfigurado = url
    ? nucleo.filter((c) => c.estado === 'NO_CONFIGURADO' || c.estado === 'NO_VERIFICADO')
    : [];
  const reales = nucleo.filter((c) => c.estado === 'OK').length;

  if (op.json) {
    leerLinea(JSON.stringify({
      esquemaDiagnostico: 1,
      estaticos,
      urlConsultada: url || null,
      errorVivo,
      nucleo,
      capacidadesCompletas: capacidades,
      reales,
      total: nucleo.length,
      estricto: op.strict,
    }, null, 2));
  } else {
    leerLinea('\n=== DOCTOR P0.1 — diagnóstico de solo lectura ===\n');
    leerLinea('COMPROBACIONES ESTÁTICAS');
    for (const d of estaticos) leerLinea(`  ${pintar(d.estado)} ${d.id.padEnd(26)} ${d.detalle}`);
    leerLinea('\nCAPACIDADES NÚCLEO (8)');
    leerLinea(`  Destino: ${url || 'NO CONSULTADO (usa --url o --live)'}`);
    if (errorVivo) leerLinea(`  ${pintar('ERROR')} ${errorVivo}`);
    for (const c of nucleo) {
      const tono = c.estado === 'OK' ? 'OK'
        : (ESTADOS_NO_REALES.includes(c.estado) || c.estado === 'NO_VERIFICADO') ? 'AVISO' : 'ERROR';
      leerLinea(`  ${pintar(tono)} ${c.nombre.padEnd(24)} ${c.estado.padEnd(16)} ${c.detalle}`);
    }
    leerLinea(`\n  Capacidades REALES verificadas: ${reales}/8${url ? '' : ' (sin servidor: NO VERIFICADO EN VIVO)'}`);
    if (noReales.length) {
      leerLinea(`  AVISO: ${noReales.length} capacidades NO son reales (SIMULACION / NO_CONFIGURADO / BLOQUEADO). No se presentan como pruebas superadas.`);
    }
    if (noConfigurado.length) {
      leerLinea(`  Faltan secretos/configuración: ${noConfigurado.map((c) => c.nombre).join(', ')}.`);
    }
    if (!url) {
      leerLinea('  El diagnóstico estático es correcto, pero NINGUNA capacidad en vivo se ha verificado. Usa --url o --live.');
    }
    if (capacidades) {
      const extras = Object.keys(capacidades).filter((k) => !CAPACIDADES_NUCLEO.includes(k));
      leerLinea(`\nCAPACIDADES COMPLEMENTARIAS (${extras.length})`);
      for (const k of extras) {
        const c = capacidades[k];
        leerLinea(`  ${k.padEnd(24)} ${String(c?.estado || '?').padEnd(16)} ${c?.detalle || ''}`);
      }
    }
  }

  if (rechazoProduccion) return 2;
  if (erroresEstaticos.length) return 1;
  if (errorVivo) return 1;
  if (op.strict && (noReales.length || noConfigurado.length)) return 1;
  if (url && noConfigurado.length) return 1;
  return 0;
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (esPrincipal) {
  ejecutarDoctor(process.argv.slice(2), { healthUrl: process.env.HEALTH_URL })
    .then((codigo) => {
      if (!process.argv.includes('--json')) {
        console.log(codigo === 2
          ? '\nRESULTADO: destino RECHAZADO por seguridad; no se ha realizado ninguna petición.'
          : codigo === 0
            ? '\nRESULTADO: sin inconsistencias estáticas. Las capacidades en vivo solo son REALES si se consultó /api/health y todas figuran OK.'
            : `\nRESULTADO: diagnóstico NO conforme (código ${codigo}).`);
      }
      process.exitCode = codigo;
    })
    .catch((error) => {
      console.error(`ERROR inesperado: ${error?.stack || error}`);
      process.exitCode = 2;
    });
}
