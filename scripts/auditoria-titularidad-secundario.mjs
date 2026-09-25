#!/usr/bin/env node
/**
 * ============================================================================
 * AUDITORÍA DE SOLO LECTURA — DERIVA DE TITULARIDAD SECUNDARIA (`inmuebles`)
 * ============================================================================
 *
 * ¿QUÉ HACE?
 *   1. Lee la colección completa `inmuebles` UNA SOLA VEZ con `getDocs`
 *      (la paginación interna del SDK recorre la colección completa).
 *   2. Clasifica cada documento según el patrón de deriva:
 *        datosFiscales.tieneSegundoPropietario === false
 *        (+ residuos: propietarioSecundarioId y/o datosFiscales.segundoPropietario)
 *   3. Cruza la consistencia entre `propietarioSecundarioId` y
 *      `datosFiscales.segundoPropietario.propietarioId`.
 *   4. Imprime el resumen por consola y genera UN INFORME JSON LOCAL en la
 *      máquina que ejecuta el script (auditoria-titularidad-secundario-*.json).
 *
 * GARANTÍA DE NO ESCRITURA (auditable en los imports de abajo):
 *   - Única función de datos de Firestore importada: `getDocs` (lectura).
 *   - NO importa ni invoca: setDoc, updateDoc, deleteDoc, deleteField,
 *     writeBatch, runTransaction, onSnapshot (mutación), ni ninguna API de
 *     Storage. `writeFileSync` se usa SOLO para el informe JSON local.
 *   - Ningún dato sale de la máquina salvo la lectura autorizada por reglas.
 *   - El NIF y el nombre del segundo titular se enmascaran en el informe.
 *
 * AUTENTICACIÓN (sin credenciales incrustadas; nunca se piden en pantalla):
 *   Por `firestore.rules`, listar `inmuebles` exige sesión de personal
 *   (`isStaff()`). Si las variables de entorno AUDITORIA_EMAIL / AUDITORIA_PASS
 *   están definidas, el script inicia sesión con esa cuenta staff y lee.
 *   Si no están, intenta la lectura sin sesión y, ante denegación, explica
 *   qué falta. El script NUNCA imprime ni persiste la contraseña.
 *
 * USO:
 *   node scripts/auditoria-titularidad-secundario.mjs
 *   AUDITORIA_EMAIL=... AUDITORIA_PASS=... node scripts/auditoria-titularidad-secundario.mjs
 *
 * SALIDA:
 *   Resumen por consola + archivo `auditoria-titularidad-secundario-<fecha>.json`.
 *
 * ÁMBITO: solo la colección `inmuebles`. Los contratos (`contratos_formalizacion`)
 * conservan una copia denormalizada (segundoPropietarioNombre, etc.) que se
 * congela al crear el borrador: se cubren cualitativamente en el informe y NO
 * se leen aquí.
 * ============================================================================
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { getApps, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, getFirestore } from 'firebase/firestore';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..');

// ---------------------------------------------------------------------------
// Config pública de la app (idéntica a la que usa src/lib/firebase.ts).
// No contiene secretos: es la web-config estándar de Firebase.
// ---------------------------------------------------------------------------
const firebaseConfig = JSON.parse(readFileSync(path.join(raiz, 'firebase-applet-config.json'), 'utf8'));
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const dbId = firebaseConfig.firestoreDatabaseId;
const db = dbId ? getFirestore(app, dbId) : getFirestore(app);

// ---------------------------------------------------------------------------
// Clasificación pura (sin acceso a Firestore). Exportada para reutilizarla
// en tests futuros del backfill (FASE 9 del encargo).
// ---------------------------------------------------------------------------

export const CATEGORIAS = Object.freeze({
  LIMPIO: 'LIMPIO',
  ACTIVO: 'ACTIVO',
  DERIVA_CLARA: 'DERIVA_CLARA',
  DERIVA_PARCIAL: 'DERIVA_PARCIAL',
  AMBIGUO: 'AMBIGUO',
  OTROS: 'OTROS',
});

export function enmascararTexto(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const partes = valor.trim().split(/\s+/);
  if (partes.length === 1) return `${partes[0].slice(0, 2)}***`;
  return `${partes[0]} ${partes.slice(1).map((p) => p[0] + '*').join(' ')}`;
}

export function enmascararNif(valor) {
  if (typeof valor !== 'string' || valor.trim() === '') return null;
  const v = valor.trim();
  return v.length <= 5 ? `${v.slice(0, 2)}***` : `${v.slice(0, 3)}***${v.slice(-2)}`;
}

function esTextoNoVacio(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Clases de patrón (definición cerrada; ver informe de auditoría):
 *  LIMPIO          — sin residuos de segundo titular.
 *  ACTIVO          — bandera true y tiene titular secundario real (legítimo).
 *  DERIVA_CLARA    — bandera EXPLÍCITAMENTE false + ambos residuos (id y
 *                    snapshot) presentes: firma exacta del bug pre-fix.
 *  DERIVA_PARCIAL  — bandera false + solo uno de los residuos, o snapshot
 *                    incompleto (sin nombre o sin NIF).
 *  AMBIGUO         — bandera ausente + residuos presentes: no se puede
 *                    determinar la intención (documento legado).
 *  OTROS           — estructuras inesperadas: campos planos históricos a
 *                    nivel de documento, bandera true sin datos, etc.
 */
export function clasificarInmueble(docId, docData) {
  const df = docData?.datosFiscales && typeof docData.datosFiscales === 'object' ? docData.datosFiscales : null;
  const flag = df ? df.tieneSegundoPropietario : undefined;

  const idResidual = esTextoNoVacio(docData?.propietarioSecundarioId) ? docData.propietarioSecundarioId.trim() : null;
  const snap = df && typeof df.segundoPropietario === 'object' && df.segundoPropietario !== null ? df.segundoPropietario : null;

  // Variantes históricas que NO deberían existir en un documento de `inmuebles`
  // (pertenecen a la copia denormalizada de `contratos_formalizacion`).
  const variantesHistoricas = Object.keys(docData ?? {})
    .filter((k) => k.startsWith('segundoPropietario'))
    .sort();
  const banderaEnLugarExtraño = 'tieneSegundoPropietario' in (docData ?? {});

  const residuoId = Boolean(idResidual);
  const residuoSnap = Boolean(snap);
  const tieneResiduo = residuoId || residuoSnap;

  const snapId = snap && esTextoNoVacio(snap.propietarioId) ? snap.propietarioId.trim() : null;
  const snapNif = snap && esTextoNoVacio(snap.nifDni) ? snap.nifDni.trim() : null;
  const snapNombre = snap && esTextoNoVacio(snap.nombre) ? snap.nombre.trim() : null;
  const snapshotCompleto = residuoSnap && Boolean(snapNombre) && Boolean(snapNif);

  // Cruce de consistencia id residual vs snapshot (solo para casos sospechosos)
  let consistencia = 'SIN_RESIDUO';
  if (residuoId && residuoSnap) {
    consistencia = snapId ? (snapId === idResidual ? 'COINCIDEN' : 'NO_COINCIDEN') : 'SIN_ID_EN_SNAPSHOT';
  } else if (residuoId) {
    consistencia = 'SOLO_ID_RESIDUAL';
  } else if (residuoSnap) {
    consistencia = 'SOLO_SNAPSHOT';
  }

  let categoria;
  let confianza;
  const detalles = [];

  if (variantesHistoricas.length > 0 || banderaEnLugarExtraño) {
    categoria = CATEGORIAS.OTROS;
    confianza = 'ambiguo';
    if (variantesHistoricas.length > 0) detalles.push(`campos planos históricos en el documento: ${variantesHistoricas.join(', ')}`);
    if (banderaEnLugarExtraño) detalles.push('bandera tieneSegundoPropietario a nivel raíz (fuera de datosFiscales)');
  } else if (flag === true) {
    if (tieneResiduo) {
      categoria = CATEGORIAS.ACTIVO;
      confianza = 'activo';
    } else {
      // Bandera true pero sin id ni snapshot: el motor de contratos la trata
      // como "sin segundo" (exige nombre), pero el modelo la espera con datos.
      categoria = CATEGORIAS.OTROS;
      confianza = 'ambiguo';
      detalles.push('bandera true sin propietarioSecundarioId ni snapshot fiscal');
    }
  } else if (!tieneResiduo) {
    categoria = CATEGORIAS.LIMPIO;
    confianza = 'limpio';
  } else if (flag === false) {
    if (residuoId && residuoSnap && snapshotCompleto) {
      categoria = CATEGORIAS.DERIVA_CLARA;
      confianza = 'claro';
    } else {
      categoria = CATEGORIAS.DERIVA_PARCIAL;
      confianza = 'parcial';
      if (residuoId && residuoSnap && !snapshotCompleto) detalles.push('snapshot fiscal incompleto (sin nombre o sin NIF)');
      if (residuoId && !residuoSnap) detalles.push('solo queda propietarioSecundarioId');
      if (!residuoId && residuoSnap) detalles.push('solo queda el snapshot fiscal');
    }
  } else {
    // flag === undefined (bandera ausente) + residuos presentes.
    categoria = CATEGORIAS.AMBIGUO;
    confianza = 'ambiguo';
    detalles.push('bandera tieneSegundoPropietario ausente con residuos presentes');
  }

  const sospechoso = categoria === CATEGORIAS.DERIVA_CLARA ||
    categoria === CATEGORIAS.DERIVA_PARCIAL ||
    categoria === CATEGORIAS.AMBIGUO ||
    categoria === CATEGORIAS.OTROS;

  return {
    inmuebleId: docId,
    categoria,
    confianza,
    // Datos mínimos de diagnóstico (NIF y nombre enmascarados).
    residuoId: idResidual,
    snapshot: residuoSnap
      ? {
          propietarioId: snapId,
          nifDni: enmascararNif(snapNif),
          nombre: enmascararTexto(snapNombre),
          completo: snapshotCompleto,
        }
      : null,
    consistencia,
    variantesHistoricas,
    detalles,
    sospechoso,
  };
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

async function main() {
  const email = process.env.AUDITORIA_EMAIL;
  const pass = process.env.AUDITORIA_PASS;

  if (email && pass) {
    try {
      await signInWithEmailAndPassword(getAuth(app), email, pass);
      console.log(`Sesión iniciada con una cuenta staff (${email}).`);
    } catch (err) {
      console.error(`NO se pudo iniciar sesión con la cuenta indicada: ${err?.code ?? err?.message ?? err}`);
      console.error('El script no reintentará ni pedirá credenciales. Verifica AUDITORIA_EMAIL/AUDITORIA_PASS.');
      process.exit(3);
    }
  } else {
    console.log('Sin AUDITORIA_EMAIL/AUDITORIA_PASS: intento de lectura sin sesión (las reglas exigirán staff).');
  }

  let snapshotDocs;
  try {
    snapshotDocs = await getDocs(collection(db, 'inmuebles'));
  } catch (err) {
    console.error('\nLECTURA DENEGADA por Firestore.');
    console.error(`Código: ${err?.code ?? 'sin código'} — ${err?.message ?? err}`);
    if (String(err?.code ?? '').includes('permission-denied')) {
      console.error('Las reglas de `inmuebles` exigen una sesión de personal (isStaff) para listar.');
      console.error('Vuelve a ejecutar el script con AUDITORIA_EMAIL/AUDITORIA_PASS de una cuenta staff.');
    }
    process.exit(2);
  }

  const total = snapshotDocs.size;
  const resultados = [];
  snapshotDocs.forEach((d) => resultados.push(clasificarInmueble(d.id, d.data())));

  const contar = (c) => resultados.filter((r) => r.categoria === c).length;
  const resumen = {
    totalInmuebles: total,
    limpio: contar(CATEGORIAS.LIMPIO),
    activo: contar(CATEGORIAS.ACTIVO),
    derivaClara: contar(CATEGORIAS.DERIVA_CLARA),
    derivaParcial: contar(CATEGORIAS.DERIVA_PARCIAL),
    ambiguo: contar(CATEGORIAS.AMBIGUO),
    otros: contar(CATEGORIAS.OTROS),
  };
  const sospechosos = resultados.filter((r) => r.sospechoso);

  console.log('\n=== AUDITORÍA DE SOLO LECTURA — TITULARIDAD SECUNDARIA ===');
  console.log(`Total inmuebles examinados : ${resumen.totalInmuebles}`);
  console.log(`Limpio                     : ${resumen.limpio}`);
  console.log(`Activo (titular vigente)   : ${resumen.activo}`);
  console.log(`DERIVA CLARA               : ${resumen.derivaClara}`);
  console.log(`DERIVA PARCIAL             : ${resumen.derivaParcial}`);
  console.log(`Ambiguo                    : ${resumen.ambiguo}`);
  console.log(`Otros patrones             : ${resumen.otros}`);

  if (sospechosos.length > 0) {
    console.log('\n--- Casos sospechosos (NIF y nombre enmascarados) ---');
    for (const r of sospechosos) {
      const snapTxt = r.snapshot
        ? `snapshot{propietarioId=${r.snapshot.propietarioId ?? '—'}, nif=${r.snapshot.nifDni ?? '—'}, nombre=${r.snapshot.nombre ?? '—'}, completo=${r.snapshot.completo}}`
        : 'snapshot=null';
      console.log(
        `[${r.categoria}/${r.confianza}] ${r.inmuebleId} | id=${r.residuoId ?? '—'} | ${snapTxt} | consistencia=${r.consistencia}`
      );
      if (r.detalles.length) console.log(`    detalle: ${r.detalles.join('; ')}`);
    }
  }

  const fecha = new Date().toISOString().replace(/[:.]/g, '-');
  const informe = {
    herramienta: 'auditoria-titularidad-secundario',
    modo: 'SOLO LECTURA (getDocs; sin escrituras en Firestore)',
    generadaEl: new Date().toISOString(),
    coleccion: 'inmuebles',
    resumen,
    casosSospechosos: sospechosos,
    nota: 'Informe generado localmente. El script no escribió ninguna colección de Firestore.',
  };
  const archivo = path.join(raiz, `auditoria-titularidad-secundario-${fecha}.json`);
  writeFileSync(archivo, JSON.stringify(informe, null, 2), 'utf8');
  console.log(`\nInforme local guardado en: ${path.relative(raiz, archivo)}`);
}

// Solo ejecuta la lectura si se lanza directamente (no al importarse en tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Error inesperado en la auditoría (lectura):', err);
    process.exit(1);
  });
}
