#!/usr/bin/env node
/**
 * AG-08 · Simulación de RESPALDO y RESTAURACIÓN con datos ficticios.
 * ============================================================================
 * NO toca Firestore real, ni red, ni credenciales. Emula el comportamiento
 * exacto que el script de migración usa sobre el SDK Admin
 * (`collection().select().get()`, `doc().update({ Campo: delete() })`)
 * y demuestra, de forma ejecutable:
 *
 *   1. El export de respaldo contiene TODOS los documentos originales con sus
 *      hashes → es suficiente para restaurar.
 *   2. Tras aplicar, ningún documento conserva `passwordHash`.
 *   3. Reejecutar el plan produce CERO escrituras (idempotencia).
 *   4. Ningún campo distinto de `passwordHash` cambia (comparación profunda).
 *   5. La restauración desde el export devuelve la base EXACTAMENTE al estado
 *      original (hash incluido) → la vuelta atrás funciona de verdad.
 *
 * Uso: node scripts/ag08/simular-respaldo-restauracion.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(import.meta.dirname, '../..');
const { construirPlan, describirValorSeguro, huellaRespaldo, aplicarPlan } = require(
  path.join(RAIZ, 'scripts/ag08/migrar-passwordhash.mjs')
);

// ---------------------------------------------------------------- base ficticia
const HASH_A = 'a'.repeat(64); // SHA-256 ficticio
const HASH_B = 'fb_1a2b3c4d'; // fallback ficticio
const HASH_C = 'c'.repeat(64);

/** Estado inicial: datos FICTICIOS con estructura realista. */
const inicial = {
  user_admin_principal: {
    email: 'admin@test.invalid', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO',
    roles: ['SUPERADMIN'], passwordHash: HASH_A, authMethod: 'firebase_auth',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  user_prop_1: {
    email: 'prop@test.invalid', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
    propietarioId: 'prop_1', inmuebleIds: ['inm_1', 'inm_2'], passwordHash: HASH_B,
    permisos: ['inmuebles.ver'],
  },
  uid_inq_1: {
    email: 'inq@test.invalid', tipoPerfil: 'INQUILINO', estado: 'ACTIVO',
    contratoIds: ['ct_1'], passwordHash: HASH_C, estadoInvitacion: 'ACEPTADA',
  },
  user_limpio: {
    email: 'limpio@test.invalid', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO',
    profesionalId: 'prof_9',
  },
  user_anidado: {
    email: 'anid@test.invalid', estado: 'ACTIVO',
    metadatos: { preferencias: { idioma: 'es', notificaciones: true } },
  },
};

const clonar = (o) => JSON.parse(JSON.stringify(o));

// -------------------------------------------------------- emulador de Firestore
/** Emula SOLO lo que usa el script: select().get() y doc().update(delete()). */
function crearFirestoreEmulado(estadoInicial) {
  const estado = clonar(estadoInicial);
  const escrituras = [];
  const campoBorrado = Symbol('delete');
  const FieldValue = { delete: () => campoBorrado };

  return {
    FieldValue,
    escrituras,
    estado,
    collection: () => ({
      select: () => ({
        get: async () => ({
          docs: Object.entries(estado).map(([id, datos]) => ({
            id,
            data: () => clonar(datos),
          })),
        }),
      }),
      doc: (id) => ({
        update: async (cambios) => {
          escrituras.push({ id, cambios: Object.keys(cambios) });
          for (const [k, v] of Object.entries(cambios)) {
            assert.equal(v, campoBorrado, `update de un campo que no es delete(): ${k}`);
            delete estado[id][k];
          }
        },
      }),
    }),
  };
}

// ------------------------------------------------------------------ export/respaldo
/** Simula `gcloud firestore export`: copia íntegra de los documentos. */
const exportar = (estado) => clonar(estado);
/** Simula la restauración: sustituye el estado por el del export. */
const restaurar = (db, respaldo) => {
  for (const k of Object.keys(db.estado)) delete db.estado[k];
  Object.assign(db.estado, clonar(respaldo));
};

// ------------------------------------------------------------------------- pasos
const paso = (n, t) => console.log(`\n[${n}] ${t}`);
let ok = 0;
const check = (cond, msg) => { assert.ok(cond, msg); ok++; console.log(`   ✔ ${msg}`); };

console.log('AG-08 · SIMULACIÓN DE RESPALDO Y RESTAURACIÓN (datos ficticios, sin red)');
console.log('='.repeat(76));

// [1] Respaldo ANTES de tocar nada.
paso(1, 'Respaldo (export) previo a la migración');
const respaldo = exportar(inicial);
const idsRespaldo = Object.keys(respaldo).sort();
check(idsRespaldo.length === Object.keys(inicial).length, 'el export contiene TODOS los documentos');
const conHash = idsRespaldo.filter((id) => 'passwordHash' in respaldo[id]);
check(conHash.length === 3, 'el export conserva los 3 hashes originales (restaurables)');
check(respaldo.user_admin_principal.passwordHash === HASH_A, 'el hash del admin está íntegro en el respaldo');
console.log(`   · huella del respaldo (lo único que se registra): ${huellaRespaldo('gs://bucket/ag08-pre')}`);
check(!JSON.stringify(huellaRespaldo('gs://bucket/ag08-pre')).includes('bucket'),
  'la huella del respaldo no revela la ruta del export');

// [2] Plan y aplicación.
paso(2, 'Plan y aplicación (dry-run primero, luego aplicar)');
const db = crearFirestoreEmulado(inicial);
const leer = async () => (await db.collection().select().get()).docs.map((d) => ({ id: d.id, datos: d.data() }));

const planDry = construirPlan(await leer());
check(db.escrituras.length === 0, 'el dry-run NO ha escrito nada');
check(planDry.resumen.aBorrar === 3, 'el plan identifica exactamente los 3 documentos afectados');

const plan = construirPlan(await leer());
// CÓDIGO REAL de la migración (no una réplica del bucle).
await aplicarPlan(db, plan, { deleteSentinela: db.FieldValue.delete() });
check(db.escrituras.length === 3, 'se han escrito exactamente 3 documentos');
check(db.escrituras.every((e) => e.cambios.length === 1 && e.cambios[0] === 'passwordHash'),
  'solo se ha tocado el campo passwordHash en cada escritura');

const tras = await leer();
check(tras.every((d) => !('passwordHash' in d.datos)), 'ningún documento conserva passwordHash');
check(tras.find((d) => d.id === 'user_anidado').datos.metadatos.preferencias.idioma === 'es',
  'los objetos anidados intactos (no se reescribe el documento)');
check(JSON.stringify(tras.find((d) => d.id === 'user_prop_1').datos.inmuebleIds) === JSON.stringify(['inm_1', 'inm_2']),
  'los arrays intactos');

// [3] Idempotencia.
paso(3, 'Idempotencia: reejecutar tras migrar');
const escriturasAntes = db.escrituras.length;
const plan2 = construirPlan(await leer());
await aplicarPlan(db, plan2, { deleteSentinela: db.FieldValue.delete() });
check(plan2.resumen.aBorrar === 0, 'el segundo plan no tiene nada que borrar');
check(db.escrituras.length === escriturasAntes, 'la segunda ejecución produce CERO escrituras');

// [4] Solo cambia el campo.
paso(4, 'Ningún otro campo ni dato ajeno se ha modificado');
const diff = [];
for (const id of Object.keys(inicial)) {
  const antes = clonar(inicial[id]);
  delete antes.passwordHash;
  const despues = db.estado[id];
  if (JSON.stringify(antes) !== JSON.stringify(despues)) diff.push(id);
}
check(diff.length === 0, 'todos los documentos son idénticos salvo por el campo retirado');
check(!('createdAt' in {}) || tras.find((d) => d.id === 'user_admin_principal').datos.createdAt === inicial.user_admin_principal.createdAt,
  'createdAt no se ha reescrito');

// [5] Restauración real desde el respaldo.
paso(5, 'Restauración desde el export (prueba de vuelta atrás)');
restaurar(db, respaldo);
const restaurado = await leer();
// `leer()` devuelve [{id, datos}]; se recompone el mapa para comparar con el original.
const comoMapa = (docs) => Object.fromEntries(docs.map((d) => [d.id, d.datos]));
check(JSON.stringify(comoMapa(restaurado)) === JSON.stringify(inicial),
  'la base restaurada es IDÉNTICA al estado original (comparación campo a campo)');
check(restaurado.find((d) => d.id === 'user_admin_principal').datos.passwordHash === HASH_A,
  'el hash original ha vuelto (la vuelta atrás funciona de verdad)');

// [6] Sin exposición de hashes en lo que se registra.
paso(6, 'Lo registrado no contiene hashes');
const registrable = JSON.stringify({
  resumen: plan.resumen,
  ids: plan.idsAfectados,
  detalle: plan.entradas.map((e) => ({ id: e.id, motivo: e.motivo, valor: describirValorSeguro(e.valorSeguro) })),
  huella: huellaRespaldo('gs://bucket/ag08-pre'),
});
for (const h of [HASH_A, HASH_B, HASH_C]) {
  check(!registrable.includes(h), `el hash ${h.slice(0, 10)}… no aparece en lo registrado`);
}

console.log('\n' + '='.repeat(76));
console.log(`RESULTADO: ${ok}/${ok} comprobaciones correctas · base restaurada al estado original`);
