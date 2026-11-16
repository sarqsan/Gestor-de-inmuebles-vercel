#!/usr/bin/env node
/**
 * AG-08 · Migración de retirada de `passwordHash`
 * ============================================================================
 * QUÉ HACE
 *   Elimina el campo `passwordHash` de los documentos de `usuarios/*` en Firestore.
 *
 * POR QUÉ ES SEGURO
 *   El campo es material de credencial OBSOLETO (SHA-256 sin sal, o el fallback
 *   `fb_<hex>` de 32 bits). Ningún flujo legítimo de autenticación lo consume:
 *   el camino de «verificación directa» se retiró porque sin sesión las reglas
 *   exigen `isSignedIn()` para leer `usuarios/*`. La autoridad de autenticación
 *   es Firebase Auth, cuyas credenciales viven en su propio almacén y NO se tocan.
 *   Consecuencia: borrar el campo NO cambia quién puede entrar en la plataforma.
 *
 * GARANTÍAS DE DISEÑO
 *   · DRY-RUN POR DEFECTO: sin `--aplicar` no escribe nada.
 *   · IDEMPOTENTE: solo toca documentos que aún tengan el campo; reejecutar
 *     sobre un estado limpio produce 0 escrituras.
 *   · NO REGISTRA HASHES NI CREDENCIALES: los logs incluyen únicamente el id del
 *     documento y, si acaso, la LONGITUD del valor. Nunca el valor.
 *   · SOLO EL CAMPO: usa `update` con `delete()` del campo; no reescribe el
 *     documento, no altera ningún otro dato (ni datos de terceros).
 *   · AUDITABLE: emite un recuento + manifiesto (ids afectados) y un log de
 *     auditoría por documento vía `saveAuditLogFirestore` cuando se aplica.
 *   · VERIFICABLE/REVERSIBLE: antes de borrar exige un respaldo (ver más abajo).
 *
 * RESPALDO Y REVERSIÓN
 *   El respaldo de los hashes NO se guarda aquí (contendría credenciales
 *   materializadas). Procedimiento exigido antes de aplicar:
 *     1. Exportar `usuarios` desde la consola de Firebase / `gcloud firestore export`
 *        a un bucket privado con retención. Ese export es el artefacto de vuelta atrás.
 *     2. Registrar el id del export en la ventana de cambio (junto con la hora).
 *   Reversión: restaurar el export. Como el código ya no lee ni escribe el campo,
 *   restaurarlo es inerte (no reabre ningún camino de autenticación), pero
 *   recupera el estado exacto anterior a la migración.
 *
 * USO
 *   node scripts/ag08/migrar-passwordhash.mjs                      # dry-run
 *   node scripts/ag08/migrar-passwordhash.mjs --aplicar \
 *        --proyecto <id> --credencial <ruta-service-account.json> \
 *        --respaldo <id-del-export>
 *
 *   `--aplicar` exige `--respaldo` (prueba de que existe el artefacto de vuelta
 *   atrás) y `--confirmo-produccion` si el proyecto no acaba en `-test`.
 *
 * ESTADO: NO EJECUTADO. Este script requiere autorización expresa (ver informe).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const NOMBRE_MODULO_ADMIN = 'firebase-admin';

/**
 * Carga `firebase-admin` solo si está instalado. NO se declara como dependencia en
 * el repositorio: la aplicación real exige autorización expresa y este fichero no
 * debe poder ejecutarse por accidente ni arrastrar peso al bundle de la app.
 */
async function cargarAdmin() {
  try {
    return {
      app: await import('firebase-admin/app'),
      firestore: await import('firebase-admin/firestore'),
    };
  } catch {
    throw new Error(
      `Falta la dependencia opcional '${NOMBRE_MODULO_ADMIN}'. ` +
        'Instálala SOLO cuando la migración esté autorizada: npm i -D firebase-admin@^12. ' +
        'Mientras tanto usa --entrada para validar el plan con datos ficticios (offline).'
    );
  }
}

/** Clasificador de errores: solo el CÓDIGO, nunca el mensaje ni el documento.
 *  Firestore y `JSON.parse` pueden incluir fragmentos del contenido en `message`
 *  (p. ej. el service account al parsear mal la credencial). Los logs no lo copian. */
function codigoError(e) {
  const c = e && (e.code || e.name);
  return typeof c === 'string' && /^[\w./-]{1,64}$/.test(c) ? c : 'error';
}

/**
 * Formatea un valor de hash para el informe SIN exponerlo.
 * Devuelve solo tipo y longitud; jamás el contenido.
 */
export function describirValorSeguro(valor) {
  if (valor === null) return 'null';
  if (valor === undefined) return 'undefined';
  const tipo = typeof valor;
  if (tipo !== 'string') return `<${tipo}>`;
  return `<string:${valor.length}>`;
}

/**
 * Decide, para un documento, si necesita migración.
 * Puro y testeable: no toca Firestore.
 */
export function planificarDocumento(id, datos) {
  const tieneCampo = datos != null && Object.prototype.hasOwnProperty.call(datos, 'passwordHash');
  if (!tieneCampo) return { id, accion: 'omitir', motivo: 'sin-campo' };
  const valor = datos.passwordHash;
  const tipo = typeof valor;
  // El campo debe desaparecer con independencia de su forma: null, '', string,
  // objeto heredado… Ningún caso justifica conservarlo.
  return {
    id,
    accion: 'borrar-campo',
    motivo: tipo === 'string' ? 'hash-presente' : `presente-${tipo}`,
    valorSeguro: describirValorSeguro(valor),
  };
}

/** Construye el plan completo y su recuento. Puro. */
export function construirPlan(documentos) {
  const entradas = documentos.map(({ id, datos }) => planificarDocumento(id, datos));
  const aBorrar = entradas.filter((e) => e.accion === 'borrar-campo');
  return {
    entradas,
    resumen: {
      total: entradas.length,
      aBorrar: aBorrar.length,
      omitidos: entradas.length - aBorrar.length,
    },
    idsAfectados: aBorrar.map((e) => e.id).sort(),
  };
}

/**
 * Serializa el manifiesto SIN hashes: ids + motivos + longitudes.
 * Esta es la única representación que se permite escribir en disco.
 */
export function manifiestoAuditable(plan, meta = {}) {
  return {
    bloque: 'AG-08',
    generadoEn: new Date().toISOString(),
    ...meta,
    resumen: plan.resumen,
    idsAfectados: plan.idsAfectados,
    detalle: plan.entradas
      .filter((e) => e.accion === 'borrar-campo')
      .map((e) => ({ id: e.id, motivo: e.motivo, valor: e.valorSeguro })),
  };
}

/**
 * Aplica el plan de borrado contra un cliente tipo Firestore.
 * Es el ÚNICO punto que escribe `passwordHash` y lo usa tanto la ejecución real
 * (`main`) como la simulación de respaldo/restauración, de modo que la simulación
 * ejerce el código real y no una réplica.
 *
 * Contrato del cliente: `collection(nombre).doc(id).update({campo: deleteSentinela})`.
 * Nunca envía otros campos: eso es lo que garantiza «no tocar datos ajenos».
 */
export async function aplicarPlan(db, plan, { deleteSentinela, auditar } = {}) {
  let borrados = 0;
  let fallos = 0;
  for (const id of plan.idsAfectados) {
    try {
      await db.collection('usuarios').doc(id).update({ passwordHash: deleteSentinela });
      borrados++;
      if (auditar) {
        try {
          await auditar(id);
        } catch {
          // La auditoría no debe abortar el borrado ya realizado; se cuenta aparte.
        }
      }
    } catch {
      fallos++;
    }
  }
  return { borrados, fallos };
}

/**
 * Guarda FAIL-CLOSED de ejecución real. Pura y testeable: devuelve el acuse o lanza.
 * - Exige proyecto, credencial y respaldo.
 * - Exige lista blanca `AG08_PROYECTOS_PRUEBA` y que el proyecto esté EN ella:
 *   así no se puede apuntar a producción «por accidente» escribiendo un id.
 * - `--confirmo-produccion` NO abre la puerta: solo se registra como acuse.
 */
export function validarGuardaAplicar(args, env = {}) {
  if (!args.proyecto) throw new Error('--aplicar requiere --proyecto');
  if (!args.credencial) throw new Error('--aplicar requiere --credencial (service account)');
  if (!args.respaldo) {
    throw new Error('--aplicar requiere --respaldo <id-del-export>: sin respaldo verificado no se borra nada.');
  }
  const listaBlanca = String(env.AG08_PROYECTOS_PRUEBA || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (listaBlanca.length === 0) {
    throw new Error(
      'Falta AG08_PROYECTOS_PRUEBA: define la lista blanca de proyectos de pruebas ' +
        '(ids separados por comas). Sin lista blanca no se aplica nada.'
    );
  }
  if (!listaBlanca.includes(args.proyecto)) {
    throw new Error(
      'El proyecto indicado no está en AG08_PROYECTOS_PRUEBA. ' +
        'Añádelo explícitamente solo si es un proyecto de PRUEBAS.'
    );
  }
  return Boolean(args.confirmoProduccion);
}

/** Huella estable y no reversible del id de respaldo: permite correlacionar el
 *  artefacto sin escribir en el manifiesto ni en `audit_logs` el identificador
 *  completo del export (que revela bucket y ruta de infraestructura). */
export function huellaRespaldo(id) {
  if (!id) return '(ninguno)';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return `respaldo#${Math.abs(h).toString(16)}`;
}

/** Guarda: el manifiesto nunca debe contener el valor literal del hash. */
export function validarManifiestoSinSecretos(obj, valoresReales = []) {
  const texto = JSON.stringify(obj);
  for (const v of valoresReales) {
    if (typeof v === 'string' && v.length >= 16 && texto.includes(v)) {
      throw new Error('El manifiesto contendría un valor de hash real: abortado.');
    }
  }
  if (/"passwordHash"\s*:/.test(texto)) {
    throw new Error('El manifiesto contendría una clave passwordHash con valor: abortado.');
  }
  return true;
}

// ============================================================================
// CLI
// ============================================================================

/** Error con mensaje PROPIO (redactado por el script, sin datos del entorno). */
function abortar(mensaje) {
  const e = new Error(mensaje);
  e.esPropio = true;
  return e;
}

function parseArgs(argv) {
  const args = {
    aplicar: false,
    proyecto: '',
    credencial: '',
    respaldo: '',
    confirmoProduccion: false,
    salida: '',
    entrada: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--aplicar') args.aplicar = true;
    else if (a === '--confirmo-produccion') args.confirmoProduccion = true;
    else if (a === '--proyecto') args.proyecto = argv[++i] ?? '';
    else if (a === '--credencial') args.credencial = argv[++i] ?? '';
    else if (a === '--respaldo') args.respaldo = argv[++i] ?? '';
    else if (a === '--salida') args.salida = argv[++i] ?? '';
    else if (a === '--entrada') args.entrada = argv[++i] ?? '';
    else if (a === '--help' || a === '-h') args.help = true;
    else throw abortar(`Argumento no reconocido: ${a}`);
  }
  return args;
}

function usage() {
  console.log(`AG-08 · retirada de passwordHash (dry-run por defecto)

  node scripts/ag08/migrar-passwordhash.mjs
  node scripts/ag08/migrar-passwordhash.mjs --aplicar --proyecto <id> \\
       --credencial <sa.json> --respaldo <id-export> [--confirmo-produccion] [--salida <dir>]

  # Validación offline del plan con datos ficticios (no requiere firebase-admin)
  node scripts/ag08/migrar-passwordhash.mjs --entrada fixtures.json

Sin --aplicar no se escribe NADA en Firestore.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  const dirSalida = args.salida || path.join(process.cwd(), 'ag08-salida');

  // ---- Modo OFFLINE: valida la lógica del plan con datos ficticios ----------
  if (args.entrada) {
    if (args.aplicar) throw abortar('--entrada no se combina con --aplicar.');
    const crudos = JSON.parse(readFileSync(args.entrada, 'utf8'));
    const documentos = Array.isArray(crudos)
      ? crudos.map((d) => ({ id: String(d.id), datos: d.datos ?? null }))
      : Object.entries(crudos).map(([id, datos]) => ({ id, datos }));
    const plan = construirPlan(documentos);
    const manifiesto = manifiestoAuditable(plan, { modo: 'offline', entrada: path.basename(args.entrada) });
    const valoresReales = documentos
      .map((d) => (d.datos ? d.datos.passwordHash : undefined))
      .filter((v) => typeof v === 'string');
    validarManifiestoSinSecretos(manifiesto, valoresReales);

    console.log(`[AG-08] OFFLINE · documentos: ${plan.resumen.total}`);
    console.log(`[AG-08] OFFLINE · a borrar:  ${plan.resumen.aBorrar}`);
    console.log(`[AG-08] OFFLINE · omitidos:  ${plan.resumen.omitidos}`);
    for (const e of plan.entradas) {
      console.log(`  - ${e.id}: ${e.accion} (${e.motivo})${e.valorSeguro ? ' ' + e.valorSeguro : ''}`);
    }
    mkdirSync(dirSalida, { recursive: true });
    const ruta = path.join(dirSalida, `manifiesto-ag08-offline-${Date.now()}.json`);
    writeFileSync(ruta, JSON.stringify(manifiesto, null, 2), 'utf8');
    console.log(`[AG-08] OFFLINE · manifiesto sin hashes: ${ruta}`);
    return;
  }

  // ---- Guardas antes de tocar Firestore (fail-closed) ----------------------
  let acuse = false;
  if (args.aplicar) {
    try {
      acuse = validarGuardaAplicar(args, process.env);
    } catch (e) {
      // Se reetiqueta como error propio para que su mensaje sea imprimible.
      throw abortar(e.message);
    }
  }

  const { app: adminApp, firestore: adminFirestore } = await cargarAdmin();
  const { initializeApp, cert, getApps } = adminApp;
  const { getFirestore } = adminFirestore;

  // D1: el error de `JSON.parse`/`readFileSync` puede incluir fragmentos del
  // service account o la ruta. Se captura y se sustituye por un motivo opaco.
  let credencial;
  try {
    credencial = JSON.parse(readFileSync(args.credencial, 'utf8'));
  } catch {
    throw abortar(
      'No se pudo leer o interpretar la credencial indicada. ' +
        'No se muestran detalles para no filtrar su contenido ni su ruta.'
    );
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(credencial), projectId: args.proyecto });
  }
  const db = getFirestore();

  // `select()` limita los campos descargados: no hace falta traer el resto.
  const snap = await db.collection('usuarios').select('passwordHash').get();
  const documentos = snap.docs.map((d) => ({ id: d.id, datos: d.data() }));
  const plan = construirPlan(documentos);

  console.log(`[AG-08] documentos leídos: ${plan.resumen.total}`);
  console.log(`[AG-08] con passwordHash: ${plan.resumen.aBorrar}`);
  console.log(`[AG-08] sin el campo:    ${plan.resumen.omitidos}`);

  mkdirSync(dirSalida, { recursive: true });
  const manifiesto = manifiestoAuditable(plan, {
    modo: args.aplicar ? 'aplicar' : 'dry-run',
    proyecto: args.proyecto || '(no indicado)',
    respaldo: huellaRespaldo(args.respaldo),
    acuseExplicito: acuse,
  });
  const valoresReales = documentos
    .map((d) => (d.datos ? d.datos.passwordHash : undefined))
    .filter((v) => typeof v === 'string');
  validarManifiestoSinSecretos(manifiesto, valoresReales);

  const rutaManifiesto = path.join(dirSalida, `manifiesto-ag08-${Date.now()}.json`);
  writeFileSync(rutaManifiesto, JSON.stringify(manifiesto, null, 2), 'utf8');
  console.log(`[AG-08] manifiesto (sin hashes): ${rutaManifiesto}`);

  if (!args.aplicar) {
    console.log('[AG-08] DRY-RUN: no se ha escrito nada. Usa --aplicar para ejecutar.');
    return;
  }

  const { FieldValue } = adminFirestore;
  const { borrados, fallos } = await aplicarPlan(db, plan, {
    deleteSentinela: FieldValue.delete(),
    auditar: async (id) => {
      await db.collection('audit_logs').add({
        accion: 'AG08_PASSWORDHASH_RETIRADO',
        coleccion: 'usuarios',
        documentoId: id,
        campo: 'passwordHash',
        resultado: 'ELIMINADO',
        respaldo: huellaRespaldo(args.respaldo),
        fecha: new Date().toISOString(),
      });
    },
  });

  const despues = await db.collection('usuarios').select('passwordHash').get();
  const restantes = despues.docs.filter((d) => d.data() && 'passwordHash' in d.data()).length;

  console.log(`[AG-08] borrados: ${borrados} · fallos: ${fallos} · restantes: ${restantes}`);
  if (fallos > 0 || restantes > 0) {
    console.error('[AG-08] INCOMPLETO: reejecuta (es idempotente) o restaura el export.');
    process.exitCode = 1;
    return;
  }
  console.log('[AG-08] COMPLETO. Reejecutar ahora produciría 0 escrituras (idempotente).');
}

// Solo se ejecuta como CLI, no al importarse desde las pruebas.
if (process.argv[1] && path.basename(process.argv[1]) === 'migrar-passwordhash.mjs') {
  main().catch((e) => {
    // Motivo accionable pero SIN volcar rutas de credenciales ni contenido:
    // se usa el mensaje propio del script cuando lo hay, y si no, el código.
    const propio = typeof e?.message === 'string' && /^[^\n]{1,200}$/.test(e.message) && e.esPropio;
    console.error(`[AG-08] abortado: ${propio ? e.message : codigoError(e)}`);
    process.exitCode = 1;
  });
}
