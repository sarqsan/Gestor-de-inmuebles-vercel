#!/usr/bin/env node
/**
 * P0-B · VERIFICACIÓN DE COHERENCIA REGISTRO ↔ ARCHIVO
 * ====================================================
 * Comprueba que el respaldo no ha perdido la RELACIÓN entre cada documento y su
 * archivo. Una copia puede ser "correcta" y aun así dejar el expediente
 * inválido: eso es lo que este script detecta.
 *
 * Detecta:
 *   · referencias rotas  (el registro apunta a un archivo que no está)
 *   · objetos huérfanos  (archivo sin ningún registro que lo cite)
 *   · rutas duplicadas   (el mismo objeto citado por varios registros)
 *   · manifiesto incompleto (recuentos u hashes que no cuadran)
 *
 * Entrada: dos inventarios en JSON. Se generan con `gcloud` (ver más abajo) o
 * con cualquier extractor que respete la forma. El script es puro: no habla con
 * Google Cloud, para poder probarse con fixtures sintéticos.
 *
 * Forma esperada:
 *   referencias.json  → { "referencias": [ { "ruta": "...", "origen": "..." } ] }
 *   objetos.json      → { "objetos": [ "ruta/1", "ruta/2" ] }
 *   manifiesto.json   → { "snapshotId": "...", "objetos": [...], "recuentoColecciones": {...} }
 *
 * Uso:
 *   node scripts/p0/verificar-coherencia.mjs \
 *     --referencias refs.json --objetos objetos.json [--manifiesto man.json] [--json]
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  verificarCoherencia,
  verificarManifiesto,
  esRutaAlmacenValida,
} from '../../src/lib/backup/nucleoBackup.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function arg(n) {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const tieneFlag = (n) => process.argv.includes(`--${n}`);

function leerJson(ruta, etiqueta) {
  if (!ruta) {
    console.error(`❌ Falta --${etiqueta}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(resolve(ruta), 'utf8'));
  } catch (e) {
    console.error(`❌ No se pudo leer ${ruta}: ${e.message}`);
    process.exit(1);
  }
}

const refs = leerJson(arg('referencias'), 'referencias');
const objs = leerJson(arg('objetos'), 'objetos');
const manifiesto = arg('manifiesto') ? leerJson(arg('manifiesto'), 'manifiesto') : null;

const referencias = Array.isArray(refs) ? refs : (refs.referencias || []);
const objetosPresentes = Array.isArray(objs) ? objs : (objs.objetos || []);

// Validación de forma de las rutas (paridad con el servidor documental).
const rutasInvalidas = referencias
  .map((r) => r?.ruta)
  .filter((r) => r && !esRutaAlmacenValida(r));

const coherencia = verificarCoherencia({ referencias, objetosPresentes });

let verificacionManifiesto = null;
if (manifiesto) {
  verificacionManifiesto = verificarManifiesto(manifiesto, {
    objetos: objetosPresentes.map((ruta) => {
      const m = (manifiesto.objetos || []).find((o) => o.ruta === ruta);
      return { ruta, bytes: m?.bytes, sha256: m?.sha256 };
    }),
    recuentoColecciones: manifiesto.recuentoColecciones,
  });
}

const ok = coherencia.ok && rutasInvalidas.length === 0 && (verificacionManifiesto?.ok ?? true);

const resultado = {
  ok,
  totalReferencias: referencias.length,
  totalObjetos: objetosPresentes.length,
  rutasInvalidas,
  ...coherencia,
  manifiesto: verificacionManifiesto,
};

if (tieneFlag('json')) {
  console.log(JSON.stringify(resultado, null, 2));
} else {
  console.log('='.repeat(78));
  console.log('  P0-B · COHERENCIA REGISTRO ↔ ARCHIVO');
  console.log('='.repeat(78));
  console.log(`  Referencias documentales : ${referencias.length}`);
  console.log(`  Objetos en Storage       : ${objetosPresentes.length}`);
  console.log(`  Referencias rotas        : ${coherencia.referenciasRotas.length}`);
  console.log(`  Objetos huérfanos        : ${coherencia.objetosHuerfanos.length}`);
  console.log(`  Rutas duplicadas         : ${coherencia.duplicados.length}`);
  console.log(`  Rutas con forma inválida : ${rutasInvalidas.length}`);
  if (verificacionManifiesto) {
    console.log(`  Manifiesto               : ${verificacionManifiesto.ok ? 'OK' : `${verificacionManifiesto.incidencias.length} incidencia(s)`}`);
  }

  if (coherencia.referenciasRotas.length) {
    console.log('\n  REFERENCIAS ROTAS (el registro apunta a un archivo que no existe):');
    coherencia.referenciasRotas.slice(0, 20).forEach((r) => console.log(`   · ${r.ruta}   ← ${r.origen}`));
    if (coherencia.referenciasRotas.length > 20) console.log(`   … y ${coherencia.referenciasRotas.length - 20} más`);
  }
  if (coherencia.objetosHuerfanos.length) {
    console.log('\n  OBJETOS HUÉRFANOS (archivo sin registro que lo cite):');
    coherencia.objetosHuerfanos.slice(0, 20).forEach((r) => console.log(`   · ${r}`));
    if (coherencia.objetosHuerfanos.length > 20) console.log(`   … y ${coherencia.objetosHuerfanos.length - 20} más`);
  }
  if (coherencia.duplicados.length) {
    console.log('\n  RUTAS DUPLICADAS (mismo objeto citado por varios registros):');
    coherencia.duplicados.slice(0, 20).forEach((d) => console.log(`   · ${d.ruta} (${d.referencias} referencias)`));
  }
  if (rutasInvalidas.length) {
    console.log('\n  RUTAS CON FORMA INVÁLIDA:');
    rutasInvalidas.slice(0, 20).forEach((r) => console.log(`   · ${r}`));
  }
  if (verificacionManifiesto && !verificacionManifiesto.ok) {
    console.log('\n  INCIDENCIAS DEL MANIFIESTO:');
    verificacionManifiesto.incidencias.slice(0, 20).forEach((i) => console.log(`   · ${JSON.stringify(i)}`));
  }

  console.log(ok
    ? '\n✅ Coherencia correcta: todo registro tiene su archivo y todo archivo su registro.\n'
    : '\n❌ Coherencia INCORRECTA. El expediente no es recuperable tal cual: revisa las listas anteriores.\n');
}

process.exit(ok ? 0 : 1);
