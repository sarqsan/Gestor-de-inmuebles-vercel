#!/usr/bin/env node
/**
 * AG-08 · Simulación END-TO-END de respaldo, migración y restauración.
 * ============================================================================
 * NO toca Firestore real, ni red, ni credenciales. Emula únicamente el contrato
 * del SDK Admin que usa la migración (`select().get()` y
 * `doc().update({campo: delete()})`) y ejecuta **el mismo núcleo** que la
 * ejecución real:
 *
 *   construirPlan · crearManifiestoRespaldo · verificarRespaldo ·
 *   aplicarPlanConDiario · verificarSoloCambioElCampo · huellaDocumento
 *
 * Escenarios (todos ejecutables y repetibles):
 *   [1] Respaldo: manifiesto de huellas que certifica el export (sin hashes).
 *   [2] Dry-run: no escribe nada.
 *   [3] Verificación del respaldo: cubre el conjunto y la base no ha cambiado.
 *   [4] Aplicación: solo `passwordHash`, resto de campos intacto.
 *   [5] Idempotencia: reejecutar produce 0 escrituras.
 *   [6] Interrupción a mitad + REANUDACIÓN: los fallidos no se dan por hechos.
 *   [7] Respaldo manipulado / incompleto / obsoleto ⇒ aborta sin escribir.
 *   [8] RESTAURACIÓN: la base vuelve a ser idéntica al original.
 *   [9] Nada sensible (hashes, ids) aparece en los artefactos generados.
 *
 * Uso: node scripts/ag08/simular-respaldo-restauracion.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(import.meta.dirname, '../..');
const {
  construirPlan,
  crearManifiestoRespaldo,
  verificarRespaldo,
  aplicarPlanConDiario,
  verificarSoloCambioElCampo,
  crearDiario,
  huellaDocumento,
  huellaRespaldo,
} = require(path.join(RAIZ, 'scripts/ag08/migrar-passwordhash.mjs'));

// ---------------------------------------------------------------- datos ficticios
const HASH_A = 'a'.repeat(64); // SHA-256 ficticio
const HASH_B = 'fb_1a2b3c4d'; // fallback ficticio
const HASH_C = 'c'.repeat(64);

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
function crearFirestoreEmulado(estadoInicial, opciones = {}) {
  const estado = clonar(estadoInicial);
  const escrituras = [];
  const fallarEn = new Set(opciones.fallarEn || []);
  const fallarLectura = Boolean(opciones.fallarLectura);
  const campoBorrado = Symbol('delete');

  return {
    FieldValue: { delete: () => campoBorrado },
    escrituras,
    estado,
    collection: () => ({
      select: () => ({
        get: async () => {
          if (fallarLectura) throw Object.assign(new Error('lectura'), { code: 'permission-denied' });
          return {
            docs: Object.entries(estado).map(([id, datos]) => ({ id, data: () => clonar(datos) })),
          };
        },
      }),
      doc: (id) => ({
        update: async (cambios) => {
          if (fallarEn.has(id)) throw Object.assign(new Error('escritura'), { code: 'unavailable' });
          escrituras.push({ id, campos: Object.keys(cambios) });
          for (const [k, v] of Object.entries(cambios)) {
            assert.equal(v, campoBorrado, `update de un campo que no es delete(): ${k}`);
            delete estado[id][k];
          }
        },
      }),
    }),
  };
}

// ------------------------------------------------------------------- utilidades
const exportar = (estado) => clonar(estado);
const restaurarDesde = (db, respaldo) => {
  for (const k of Object.keys(db.estado)) delete db.estado[k];
  Object.assign(db.estado, clonar(respaldo));
};
const leer = async (db) => (await db.collection().select().get()).docs.map((d) => ({ id: d.id, datos: d.data() }));
const comoMapa = (docs) => Object.fromEntries(docs.map((d) => [d.id, d.datos]));

const paso = (n, t) => console.log(`\n[${n}] ${t}`);
let ok = 0;
const check = (cond, msg) => {
  assert.ok(cond, msg);
  ok++;
  console.log(`   ✔ ${msg}`);
};

console.log('AG-08 · SIMULACIÓN END-TO-END (datos ficticios · sin red · sin Firestore real)');
console.log('='.repeat(78));

// ---------------------------------------------------------------- [1] respaldo
paso(1, 'Respaldo: manifiesto de huellas que certifica el export');
const db = crearFirestoreEmulado(inicial);
const antes = await leer(db);
const respaldoDatos = exportar(db.estado); // simula `gcloud firestore export`
const manifiesto = crearManifiestoRespaldo(antes, { modo: 'simulacion' });
check(manifiesto.total === 5, 'el manifiesto cubre los 5 documentos');
check(manifiesto.documentos.filter((d) => d.tieneHash).length === 3, 'registra que 3 tenían el campo');
check(Object.values(respaldoDatos).filter((d) => 'passwordHash' in d).length === 3,
  'el export de datos conserva los 3 hashes (restaurables)');
const textoManifiesto = JSON.stringify(manifiesto);
check(![HASH_A, HASH_B, HASH_C].some((h) => textoManifiesto.includes(h)), 'el manifiesto NO contiene ningún hash');
check(!textoManifiesto.includes('passwordHash'), 'el manifiesto ni siquiera nombra el campo');
check(manifiesto.documentos.every((d) => /^[0-9a-f]{64}$/.test(d.huella)), 'cada documento tiene huella sha256 (sin el campo)');

// ------------------------------------------------------------------ [2] dry-run
paso(2, 'Dry-run: el plan no escribe nada');
const plan0 = construirPlan(antes);
check(db.escrituras.length === 0, 'ninguna escritura durante la lectura/planificación');
check(plan0.resumen.aBorrar === 3, 'el plan identifica exactamente 3 documentos');

// -------------------------------------------------------- [3] verificación previa
paso(3, 'Verificación del respaldo ANTES de escribir');
const v1 = verificarRespaldo(manifiesto, antes, { idsAfectados: plan0.idsAfectados });
check(v1.ok, 'el respaldo cubre el conjunto actual y coincide (no obsoleto)');
const manipulado = clonar(manifiesto);
manipulado.documentos[0].huella = 'f'.repeat(64);
check(!verificarRespaldo(manipulado, antes, { idsAfectados: plan0.idsAfectados }).ok,
  'un respaldo MANIPULADO se rechaza (huella global no cuadra)');
const incompleto = clonar(manifiesto);
incompleto.documentos = incompleto.documentos.filter((d) => d.id !== 'user_prop_1');
check(!verificarRespaldo(incompleto, antes, { idsAfectados: plan0.idsAfectados }).ok,
  'un respaldo INCOMPLETO (le falta un documento a modificar) se rechaza');
const baseCambiada = antes.map((d) =>
  d.id === 'user_limpio' ? { ...d, datos: { ...d.datos, estado: 'BLOQUEADO' } } : d
);
check(!verificarRespaldo(manifiesto, baseCambiada, { idsAfectados: plan0.idsAfectados }).ok,
  'si la base cambió desde el respaldo, se rechaza (respaldo obsoleto)');

// ------------------------------------------------------------- [4] aplicación
paso(4, 'Aplicación con el núcleo real (aplicarPlanConDiario)');
const diario = crearDiario({ simulado: true });
const r4 = await aplicarPlanConDiario(db, plan0, {
  deleteSentinela: db.FieldValue.delete(),
  diario,
});
const tras = await leer(db);
check(r4.borrados === 3 && r4.fallos === 0, '3 documentos migrados, 0 fallos');
check(db.escrituras.every((e) => e.campos.length === 1 && e.campos[0] === 'passwordHash'),
  'cada escritura toca SOLO el campo passwordHash');
check(tras.every((d) => !('passwordHash' in d.datos)), 'ningún documento conserva el campo');
const solo = verificarSoloCambioElCampo(antes, tras);
check(solo.ok, 'verificación posterior: NINGÚN otro campo ha cambiado');
check(diario.estado === 'COMPLETO', 'el diario queda COMPLETO');
check(diario.hechos.length === 3, 'el diario registra los 3 ids efectivamente hechos');
check(tras.find((d) => d.id === 'user_anidado').datos.metadatos.preferencias.idioma === 'es',
  'objetos anidados intactos');

// ------------------------------------------------------------ [5] idempotencia
paso(5, 'Idempotencia: reejecutar tras migrar');
const escriturasAntes = db.escrituras.length;
const plan1 = construirPlan(tras);
const r5 = await aplicarPlanConDiario(db, plan1, {
  deleteSentinela: db.FieldValue.delete(),
  diario: crearDiario({ simulado: true }),
});
check(plan1.resumen.aBorrar === 0 && r5.borrados === 0, 'segundo plan: nada que borrar');
check(db.escrituras.length === escriturasAntes, 'la segunda ejecución produce CERO escrituras');

// --------------------------------------------- [6] interrupción y reanudación
paso(6, 'Interrupción a mitad y REANUDACIÓN (sin dar por hecho lo fallido)');
const dbInt = crearFirestoreEmulado(inicial, { fallarEn: ['uid_inq_1'] });
const antesInt = await leer(dbInt);
const planInt = construirPlan(antesInt);
const diarioInt = crearDiario({ simulado: true });
const rInt = await aplicarPlanConDiario(dbInt, planInt, {
  deleteSentinela: dbInt.FieldValue.delete(),
  diario: diarioInt,
});
check(rInt.borrados === 2 && rInt.fallos === 1, '2 migrados, 1 fallido (el que falló NO se cuenta como hecho)');
check(diarioInt.estado === 'INCOMPLETO', 'el diario queda INCOMPLETO, no COMPLETO');
check(diarioInt.fallidos.includes('uid_inq_1'), 'el fallido queda registrado en el diario');
check(!diarioInt.hechos.includes('uid_inq_1'), 'el fallido NO figura entre los hechos');
const trasInt = await leer(dbInt);
check('passwordHash' in trasInt.find((d) => d.id === 'uid_inq_1').datos,
  'el documento fallido conserva el campo (no se finge éxito)');

// reanudación: se arregla la causa y se reejecuta con el MISMO diario
const dbInt2 = crearFirestoreEmulado(comoMapa(trasInt)); // estado parcial, ya sin los 2 migrados
const diarioReanudado = clonar(diarioInt);
const planRe = construirPlan(await leer(dbInt2));
// La reanudación recibe el plan de lo que QUEDA (el documento fallido). Es el
// uso correcto: el diario aporta idempotencia y trazabilidad, y el plan se
// recalcula sobre la base parcial para no reintentar lo ya confirmado.
const planRePendiente = construirPlan(
  (await leer(dbInt2)).filter((d) => diarioInt.fallidos.includes(d.id))
);
check(planRePendiente.idsAfectados.length === 1, 'el plan de reanudación contiene solo el pendiente');
const rRe = await aplicarPlanConDiario(dbInt2, planRePendiente, {
  deleteSentinela: dbInt2.FieldValue.delete(),
  diario: diarioReanudado,
});
check(rRe.borrados === 1, 'la reanudación migra exactamente el pendiente');
check(diarioReanudado.estado === 'COMPLETO', 'el diario pasa a COMPLETO tras reanudar');
check((await leer(dbInt2)).every((d) => !('passwordHash' in d.datos)), 'estado final sin el campo');

// ----------------------------------------------------------- [7] restauración
paso(7, 'RESTAURACIÓN desde el export y verificación contra el manifiesto');
restaurarDesde(db, respaldoDatos);
const restaurado = await leer(db);
check(JSON.stringify(comoMapa(restaurado)) === JSON.stringify(inicial),
  'la base restaurada es IDÉNTICA al estado original (campo a campo)');
check(restaurado.find((d) => d.id === 'user_admin_principal').datos.passwordHash === HASH_A,
  'el hash original ha vuelto (la vuelta atrás funciona)');
// La restauración se puede CERTIFICAR con el manifiesto (huellas sin el campo).
const vRestaurado = verificarRespaldo(manifiesto, restaurado, { exigirCobertura: false });
check(vRestaurado.ok, 'el manifiesto de respaldo certifica la restauración (huellas coinciden)');
check(vRestaurado.motivos.length === 0, 'sin motivos de rechazo tras restaurar');

// ------------------------------------------------- [8] nada sensible en artefactos
paso(8, 'Nada sensible en lo generado');
const artefactos = JSON.stringify({ manifiesto, diario: diarioInt, huella: huellaRespaldo('gs://b/p') });
for (const h of [HASH_A, HASH_B, HASH_C]) {
  check(!artefactos.includes(h), `el hash ${h.slice(0, 8)}… no aparece`);
}
check(!artefactos.includes('gs://'), 'no aparece la ruta del bucket de respaldo');
check(!artefactos.includes('passwordHash'), 'los artefactos ni siquiera nombran el campo');

console.log('\n' + '='.repeat(78));
console.log(`RESULTADO: ${ok}/${ok} comprobaciones correctas · base restaurada al estado original`);
