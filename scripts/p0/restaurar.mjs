#!/usr/bin/env node
/**
 * P0-B · RESTAURACIÓN DE UN SNAPSHOT (con guardas anti-producción)
 * ===============================================================
 * Restaura Firestore + Storage de un `snapshotId` en un proyecto AISLADO.
 *
 * Guardas (todas fallan cerradas):
 *   1. El proyecto destino debe estar en la lista blanca
 *      (`P0_PROYECTOS_RESTAURACION`, separada por comas).
 *   2. Se rechaza explícitamente cualquier proyecto de producción, aunque esté
 *      en la lista blanca.
 *   3. Se rechaza `(default)` como base.
 *   4. Se exige el PAR completo (firestore + storage) del MISMO snapshotId.
 *   5. Sin `--confirmar` no se ejecuta: solo muestra el plan.
 *
 * Este script es el ÚNICO que escribe en un destino, y solo puede hacerlo en
 * proyectos de la lista blanca. Nunca apunta a producción.
 *
 * Uso:
 *   # 1) ver el plan (no escribe nada)
 *   node scripts/p0/restaurar.mjs --snapshot 20261115T030000Z-s1 \
 *     --destino gestor-inmuebles-restore-test \
 *     --base-datos ai-studio-gestordeinmueble-... \
 *     --bucket gestor-inmuebles-backups --origen gestor-inmuebles-produccion
 *
 *   # 2) ejecutar de verdad (solo en proyecto aislado)
 *   node scripts/p0/restaurar.mjs ... --confirmar
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validarDestinoBackup,
  validarRestauracionSegura,
  exigirParCompleto,
  crearEventoBackup,
} from '../../src/lib/backup/nucleoBackup.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOG = resolve(RAIZ, 'docs/p0/backup-log.jsonl');

function arg(n) {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const tieneFlag = (n) => process.argv.includes(`--${n}`);

function fallar(codigo, mensaje) {
  console.error(`\n❌ ${codigo}: ${mensaje}\n`);
  process.exit(1);
}

const snapshotId = arg('snapshot');
const proyectoDestino = arg('destino');
const baseDestino = arg('base-datos');
const bucket = arg('bucket');
const proyectoOrigen = arg('origen');

if (!snapshotId) fallar('SNAPSHOT_AUSENTE', 'Falta --snapshot.');
if (!proyectoDestino) fallar('DESTINO_AUSENTE', 'Falta --destino.');
if (!proyectoOrigen) fallar('ORIGEN_AUSENTE', 'Falta --origen (proyecto del que se copió).');

// Lista blanca: por variable de entorno, nunca por valor por defecto permisivo.
const permitidos = (process.env.P0_PROYECTOS_RESTAURACION || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

if (!permitidos.length) {
  fallar('LISTA_BLANCA_VACIA',
    'P0_PROYECTOS_RESTAURACION no está definida. La restauración exige una lista blanca explícita: sin ella no se sabe si el destino es seguro.');
}

// El origen es producción por definición, pero se valida como destino de backup.
const destinoOrigen = (() => {
  try {
    return validarDestinoBackup({ proyecto: proyectoOrigen, baseDatos: baseDestino || baseDestino, bucket });
  } catch (e) {
    fallar(e.codigo || 'ORIGEN_INVALIDO', e.message);
  }
})();

let destinoRestauracion;
try {
  destinoRestauracion = validarDestinoBackup({
    proyecto: proyectoDestino,
    baseDatos: baseDestino || destinoOrigen.baseDatos,
    bucket,
  });
  validarRestauracionSegura(
    { proyecto: destinoRestauracion.proyecto, baseDatos: destinoRestauracion.baseDatos },
    { produccion: [proyectoOrigen], permitidos },
  );
} catch (e) {
  fallar(e.codigo || 'DESTINO_INSEGURO', e.message);
}

// Par completo del mismo snapshot.
const prefijo = `gs://${bucket}/${proyectoOrigen}/${snapshotId}`;
const partes = { firestore: { snapshotId }, storage: { snapshotId } };
try {
  exigirParCompleto(snapshotId, partes);
} catch (e) {
  fallar(e.codigo || 'SNAPSHOT_INCOMPLETO', e.message);
}

const importFirestore = [
  'gcloud', 'firestore', 'import',
  `${prefijo}/firestore/${snapshotId}.overall_export_metadata`,
  `--project=${destinoRestauracion.proyecto}`,
  `--database=${destinoRestauracion.baseDatos}`,
];

const copiaStorage = [
  'gcloud', 'storage', 'rsync',
  `${prefijo}/storage`,
  `gs://${destinoRestauracion.proyecto}.firebasestorage.app`,
  '--recursive',
];

console.log('='.repeat(78));
console.log('  P0-B · RESTAURACIÓN');
console.log('='.repeat(78));
console.log(`  snapshotId       : ${snapshotId}`);
console.log(`  Origen           : ${proyectoOrigen} (NO se modifica)`);
console.log(`  Destino          : ${destinoRestauracion.proyecto}`);
console.log(`  Base destino     : ${destinoRestauracion.baseDatos}`);
console.log(`  Lista blanca     : ${permitidos.join(', ')}`);
console.log(`  Prefijo snapshot : ${prefijo}/`);
console.log('');
console.log('  1) Importación de Firestore:');
console.log(`     ${importFirestore.join(' \\\n       ')}`);
console.log('');
console.log('  2) Copia de Storage:');
console.log(`     ${copiaStorage.join(' \\\n       ')}`);
console.log('');
console.log('  3) Verificación posterior (obligatoria):');
console.log('     node scripts/p0/verificar-coherencia.mjs --referencias <refs> --objetos <objs>');
console.log('');

if (!tieneFlag('confirmar')) {
  console.log('MODO SIMULACIÓN — no se ha escrito nada. Añade --confirmar para ejecutar.');
  console.log('Recuerda: solo en un proyecto aislado de la lista blanca.');
  process.exit(0);
}

function registrar(e) {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, JSON.stringify(e) + '\n', 'utf8');
  } catch { /* el log no debe romper la operación */ }
}

registrar(crearEventoBackup({
  tipo: 'RESTAURACION_INICIADA', snapshotId,
  destino: destinoRestauracion, resultado: 'EN_CURSO',
  detalle: { origen: proyectoOrigen },
}));

function ejecutar(cmd, etiqueta) {
  console.log(`\n▶ ${etiqueta}`);
  const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    registrar(crearEventoBackup({
      tipo: 'RESTAURACION_FALLIDA', snapshotId, destino: destinoRestauracion, resultado: 'ERROR',
      detalle: { etapa: etiqueta, stderr: (r.stderr || '').slice(0, 2000) },
    }));
    fallar('RESTAURACION_FALLIDA', `Falló «${etiqueta}».`);
  }
  return r.stdout;
}

ejecutar(importFirestore, 'Importación de Firestore');
ejecutar(copiaStorage, 'Copia de Storage');

registrar(crearEventoBackup({
  tipo: 'RESTAURACION_COMPLETADA', snapshotId,
  destino: destinoRestauracion, resultado: 'OK',
  detalle: { origen: proyectoOrigen },
}));

console.log('\n✅ Restauración completada en el proyecto aislado.');
console.log('   Falta la verificación de coherencia y la comprobación de apertura de archivos.');
