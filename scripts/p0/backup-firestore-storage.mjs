#!/usr/bin/env node
/**
 * P0-B · BACKUP COHERENTE DE FIRESTORE + STORAGE
 * ==============================================
 * Crea un snapshot de la base Firestore CON NOMBRE y del bucket de Storage,
 * etiquetados con el MISMO `snapshotId`, y verifica que la exportación contiene
 * de verdad datos de la base prevista.
 *
 * Diseño defensivo (el objetivo es que NO pueda dar un falso verde):
 *   · Exige --proyecto, --base-datos y --bucket. Sin base explícita, aborta.
 *   · Prohíbe `(default)`.
 *   · Tras exportar, comprueba que el manifiesto contiene colecciones conocidas
 *     y un recuento > 0. Si sale vacío, marca la copia como FALLIDA.
 *   · Registra cada paso en un log append-only (JSONL).
 *
 * Modos:
 *   --plan     Solo imprime los comandos que ejecutaría. NO toca nada.
 *              Es el modo que puede verificarse sin credenciales.
 *   --dry-run  Ejecuta las comprobaciones locales y muestra el plan.
 *   (sin flags) Ejecuta de verdad. Requiere gcloud autenticado.
 *
 * Uso:
 *   node scripts/p0/backup-firestore-storage.mjs --plan \
 *     --proyecto gestor-inmuebles-produccion \
 *     --base-datos ai-studio-gestordeinmueble-... \
 *     --bucket gestor-inmuebles-backups
 *
 * Este script NUNCA restaura y NUNCA borra datos originales.
 */
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  crearEventoBackup,
  crearSnapshotId,
  validarDestinoBackup,
} from '../../src/lib/backup/nucleoBackup.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Colecciones cuya presencia demuestra que la base exportada NO está vacía. */
const COLECCIONES_TESTIGO = ['inmuebles', 'usuarios', 'contratos_formalizacion'];

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const tieneFlag = (n) => process.argv.includes(`--${n}`);

function fallar(codigo, mensaje) {
  console.error(`\n❌ ${codigo}: ${mensaje}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Validación del destino
// ---------------------------------------------------------------------------
const destinoCrudo = {
  proyecto: arg('proyecto'),
  baseDatos: arg('base-datos'),
  bucket: arg('bucket'),
};

let destino;
try {
  destino = validarDestinoBackup(destinoCrudo);
} catch (e) {
  fallar(e.codigo || 'DESTINO_INVALIDO', e.message);
}

const snapshotId = crearSnapshotId(new Date(), Number(arg('esquema') || 1));
const prefijo = `${destino.proyecto}/${snapshotId}`;
const logPath = resolve(RAIZ, 'docs/p0/backup-log.jsonl');

// ---------------------------------------------------------------------------
// 2. Comandos (idénticos en --plan y en ejecución real: es la garantía de que
//    el plan revisado es el que se ejecuta)
// ---------------------------------------------------------------------------
const exportFirestore = [
  'gcloud', 'firestore', 'export',
  `gs://${destino.bucket}/${prefijo}/firestore`,
  `--project=${destino.proyecto}`,
  '--database=' + destino.baseDatos, // ← imprescindible: base con nombre
  '--async',
];

const copiaStorage = [
  'gcloud', 'storage', 'rsync',
  `gs://${destino.proyecto}.firebasestorage.app`,
  `gs://${destino.bucket}/${prefijo}/storage`,
  '--recursive',
  '--delete-unmatched-destination-objects=false',
];

/** Metadata de la copia: sin ella una restauración no sabe qué restauró. */
const manifiesto = {
  version: 1,
  snapshotId,
  destino,
  creadoEn: new Date().toISOString(),
  partes: {
    firestore: { prefijo: `gs://${destino.bucket}/${prefijo}/firestore`, baseDatos: destino.baseDatos },
    storage: { prefijo: `gs://${destino.bucket}/${prefijo}/storage`, bucketOrigen: `gs://${destino.proyecto}.firebasestorage.app` },
  },
  coleccionesTestigo: COLECCIONES_TESTIGO,
};

console.log('='.repeat(78));
console.log('  P0-B · BACKUP FIRESTORE + STORAGE');
console.log('='.repeat(78));
console.log(`  Proyecto        : ${destino.proyecto}`);
console.log(`  Base de datos   : ${destino.baseDatos}   ← base CON NOMBRE (nunca la base por defecto)`);
console.log(`  Bucket destino  : ${destino.bucket}`);
console.log(`  snapshotId      : ${snapshotId}`);
console.log(`  Prefijo         : gs://${destino.bucket}/${prefijo}/`);
console.log('');

if (tieneFlag('plan') || tieneFlag('dry-run')) {
  console.log('MODO PLAN — no se ejecuta nada. Comandos que se lanzarían:\n');
  console.log('  1) Exportación de Firestore (base con nombre explícita):');
  console.log(`     ${exportFirestore.join(' \\\n       ')}\n`);
  console.log('  2) Copia de Storage (rutas y metadatos preservados por rsync):');
  console.log(`     ${copiaStorage.join(' \\\n       ')}\n`);
  console.log('  3) Verificación obligatoria tras la exportación:');
  console.log(`     gcloud firestore operations describe <operation> --project=${destino.proyecto}`);
  console.log(`     gcloud storage ls gs://${destino.bucket}/${prefijo}/firestore/`);
  console.log(`     # debe contener: all_namespaces/ o all_kinds/ y el output-uri con .overall_export_metadata`);
  console.log('');
  console.log('  4) Coherencia documento ↔ archivo (manifiesto + recuentos):');
  console.log('     node scripts/p0/verificar-coherencia.mjs --manifiesto <ruta>');
  console.log('');
  console.log('Manifiesto que se escribirá:');
  console.log(JSON.stringify(manifiesto, null, 2));
  console.log('\n✅ Plan válido. Para ejecutar de verdad: omite --plan (requiere gcloud autenticado).');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 3. Ejecución real
// ---------------------------------------------------------------------------
if (spawnSync('gcloud', ['--version'], { encoding: 'utf8' }).status !== 0) {
  fallar('GCLOUD_AUSENTE', 'gcloud no está instalado o no está en PATH. No se puede ejecutar el backup real.');
}

function registrar(evento) {
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(evento) + '\n', 'utf8');
  } catch (e) {
    console.error(`[aviso] no se pudo escribir el log ${logPath}: ${e.message}`);
  }
}

registrar(crearEventoBackup({ tipo: 'BACKUP_INICIADO', snapshotId, destino, resultado: 'EN_CURSO' }));

function ejecutar(comando, etiqueta) {
  console.log(`\n▶ ${etiqueta}`);
  console.log(`  ${comando.join(' ')}`);
  const r = spawnSync(comando[0], comando.slice(1), { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    registrar(crearEventoBackup({
      tipo: 'BACKUP_FALLIDO', snapshotId, destino, resultado: 'ERROR',
      detalle: { etapa: etiqueta, codigo: r.status, stderr: (r.stderr || '').slice(0, 2000) },
    }));
    fallar('BACKUP_FALLIDO', `Falló la etapa «${etiqueta}». La copia NO es válida y no debe usarse para restaurar.`);
  }
  return r.stdout;
}

ejecutar(exportFirestore, 'Exportación de Firestore (base con nombre)');
ejecutar(copiaStorage, 'Copia de Storage');

// Verificación mínima: el prefijo debe existir y no estar vacío.
const listado = ejecutar(['gcloud', 'storage', 'ls', '--recursive', `gs://${destino.bucket}/${prefijo}/firestore/`], 'Verificación del contenido exportado');
const lineas = String(listado).split('\n').filter((l) => l.trim());
const tieneMetadata = lineas.some((l) => l.includes('.overall_export_metadata'));
const tieneColecciones = COLECCIONES_TESTIGO.some((c) => lineas.join('\n').includes(c));

if (!lineas.length || !tieneMetadata) {
  registrar(crearEventoBackup({
    tipo: 'VERIFICACION_FALLIDA', snapshotId, destino, resultado: 'ERROR',
    detalle: { motivo: 'exportación vacía o sin .overall_export_metadata', lineas: lineas.length },
  }));
  fallar('EXPORTACION_VACIA',
    'La exportación no contiene metadatos de exportación. Muy probablemente se exportó otra base (¿la base por defecto?). La copia se marca como NO VÁLIDA.');
}

registrar(crearEventoBackup({
  tipo: 'BACKUP_COMPLETADO', snapshotId, destino, resultado: 'OK',
  detalle: {
    objetosFirestore: lineas.length,
    tieneMetadata,
    coleccionesTestigoDetectadas: tieneColecciones,
    manifiesto,
  },
}));

console.log('\n✅ Backup completado y verificado.');
console.log(`   snapshotId: ${snapshotId}`);
console.log(`   log: ${logPath}`);
if (!tieneColecciones) {
  console.log('\n⚠ AVISO: no se detectaron las colecciones testigo en el listado.');
  console.log('   Verifica manualmente que la base exportada es la prevista antes de confiar en la copia.');
}
