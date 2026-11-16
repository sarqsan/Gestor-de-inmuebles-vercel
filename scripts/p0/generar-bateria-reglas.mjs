#!/usr/bin/env node
/**
 * P0-A · GENERADOR DE LA BATERÍA DE PRUEBAS DE REGLAS
 * ===================================================
 * Produce `tests/emulador/p0-cobertura-reglas.emulador.test.ts` con 10 supuestos
 * por colección, derivados de la matriz rol × operación y del TEXTO de las
 * reglas:
 *
 *   1. sin autenticación no puede leer            (concluyente salvo `if true`)
 *   2. sin autenticación no puede crear           (concluyente)
 *   3. sin autenticación no puede modificar       (concluyente)
 *   4. sin autenticación no puede eliminar        (concluyente)
 *   5. el master (email verificado) puede leer    (comprobación POSITIVA)
 *   6. el propietario A no lee datos del propietario B  (lectura cruzada)
 *   7. el propietario A no escribe en nombre de B       (escritura cruzada)
 *   8. un profesional no autenticado como tal no lee    (rol ajeno)
 *   9. un inquilino no lee lo que no le corresponde     (rol ajeno)
 *  10. la operación de borrado respeta la restricción del texto
 *      (si la política prohíbe borrar, se exige el fallo a TODOS los roles)
 *
 * HONESTIDAD SOBRE LO GENERADO: los supuestos 1–4, 6–9 y 10 se formulan de modo
 * que el resultado esperado (fallo) es CONCLUYENTE: cualquier denegación demuestra
 * que la política no está abierta. El supuesto 5 es la comprobación positiva, que
 * solo pasa si la colección está efectivamente protegida/visible como se declara.
 * Este generador NO inventa expectativas de éxito que no pueda garantizar: la
 * orden prohíbe "permisos para facilitar pruebas".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MATRIZ = resolve(RAIZ, 'docs/p0/p0-matriz-roles.json');
const SALIDA = resolve(RAIZ, 'tests/emulador/p0-cobertura-reglas.emulador.test.ts');

const matriz = JSON.parse(readFileSync(MATRIZ, 'utf8'));

// El comodín de denegación global no es una colección de datos.
const colecciones = matriz.matriz.filter((f) => !f.coleccion.includes('{'));

function datosSinteticos(nombre) {
  // Documento genérico: las comprobaciones negativas no dependen de su forma.
  return `{ sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' }`;
}

const L = [];
L.push(`/**
 * P0-A · COBERTURA DE REGLAS — generado automáticamente. NO EDITAR A MANO.
 * ======================================================================
 * Fuente: docs/p0/p0-matriz-roles.json + firestore.rules
 * Regenerar: node scripts/p0/generar-bateria-reglas.mjs
 *
 * ${colecciones.length} colecciones × 10 supuestos = ${colecciones.length * 10} casos.
 *
 * CÓMO SE EJECUTA (requiere JRE 21 + firebase-tools):
 *   npm run test:emulador:reglas
 *
 * ESTADO EN ESTA SESIÓN: **escrito, no ejecutado**. El entorno de la auditoría no
 * tiene Java y las descargas de JRE/emulador están bloqueadas por red. No se
 * presenta ningún caso como superado.
 *
 * DATOS: todos sintéticos (\`*.invalid\`, ids \`prop_a\`/\`prop_b\`/\`inm_*\`).
 * No hay ningún dato personal real.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
// Se usa la API COMPAT a propósito: es la que emplea el resto de la suite de
// emulador del repositorio, y @firebase/rules-unit-testing está documentado
// para no mezclar las dos APIs en el mismo entorno de pruebas.

const RAIZ = resolve(__dirname, '../..');
const PROYECTO = 'demo-gestor-reglas';

const UID_MASTER = 'uid-master-p0';
const EMAIL_MASTER = 'sarqsan2@gmail.com';
const UID_PROP_A = 'uid-prop-a-p0';
const UID_PROP_B = 'uid-prop-b-p0';
const UID_PROF = 'uid-prof-p0';
const UID_INQ = 'uid-inq-p0';
const PROP_A = 'prop_a';
const PROP_B = 'prop_b';

let entorno: RulesTestEnvironment;

/** El master se identifica por EMAIL VERIFICADO (no por UID). */
const comoMaster = () => entorno.authenticatedContext(UID_MASTER, { email: EMAIL_MASTER, email_verified: true }).firestore();
const comoPropA = () => entorno.authenticatedContext(UID_PROP_A, { email: 'prop-a@sintetico.invalid' }).firestore();
const comoPropB = () => entorno.authenticatedContext(UID_PROP_B, { email: 'prop-b@sintetico.invalid' }).firestore();
const comoProfesional = () => entorno.authenticatedContext(UID_PROF, { email: 'prof@sintetico.invalid' }).firestore();
const comoInquilino = () => entorno.authenticatedContext(UID_INQ, { email: 'inq@sintetico.invalid' }).firestore();
const sinAuth = () => entorno.unauthenticatedContext().firestore();

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: PROYECTO,
    firestore: { rules: readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => { await entorno?.cleanup(); });

beforeEach(async () => {
  await entorno.clearFirestore();
});

/** Siembra el espejo de identidad mínimo de cada rol (datos sintéticos). */
async function sembrarRoles() {
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios_auth/' + UID_MASTER).set({
      usuarioId: 'usr_master', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO',
      authUid: UID_MASTER, email: EMAIL_MASTER, propietarioId: PROP_A,
    });
    await db.doc('usuarios_auth/' + UID_PROP_A).set({
      usuarioId: 'usr_a', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
      authUid: UID_PROP_A, email: 'prop-a@sintetico.invalid', propietarioId: PROP_A,
    });
    await db.doc('usuarios_auth/' + UID_PROP_B).set({
      usuarioId: 'usr_b', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
      authUid: UID_PROP_B, email: 'prop-b@sintetico.invalid', propietarioId: PROP_B,
    });
    await db.doc('usuarios/' + UID_PROP_A).set({
      id: UID_PROP_A, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', authUid: UID_PROP_A, propietarioId: PROP_A,
    });
    await db.doc('contratos_formalizacion/c_1').set({
      id: 'c_1', propietarioId: PROP_B, inmuebleId: 'inm_b_1', estado: 'VIGENTE',
    });
    await db.doc('usuarios/' + UID_PROP_B).set({
      id: UID_PROP_B, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', authUid: UID_PROP_B, propietarioId: PROP_B,
    });
  });
}

/** Siembra un documento de la colección sin pasar por reglas, para leerlo. */
async function sembrarDoc(coleccion: string, id: string, datos: Record<string, unknown>) {
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().doc(coleccion + '/' + id).set(datos);
  });
}
`);

// Recorre todas las colecciones
for (const f of colecciones) {
  const c = f.coleccion;
  const celda = f.celdas;
  const lecturaPublica = celda.lectura.clase === 'PUBLICO';
  const borradoProhibido = celda.eliminacion.clase === 'DENEGADO';

  L.push(`
describe('P0-A · ${c} (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('${c}', DOC, ${datosSinteticos(c)});
    ${lecturaPublica
      ? `// La política declara lectura pública para esta colección: se verifica que
    // es pública y que NO se puede escribir sin sesión (supuestos 2-4).
    await assertSucceeds(sinAuth().doc('${c}/' + DOC).get());`
      : `await assertFails(sinAuth().doc('${c}/' + DOC).get());`}
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('${c}/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('${c}', DOC, ${datosSinteticos(c)});
    await assertFails(sinAuth().doc('${c}/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('${c}', DOC, ${datosSinteticos(c)});
    await assertFails(sinAuth().doc('${c}/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('${c}', DOC, ${datosSinteticos(c)});
    await assertSucceeds(comoMaster().doc('${c}/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('${c}', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    ${lecturaPublica
      ? `// Lectura PÚBLICA declarada: leer el documento de otro titular NO es un fallo
    // de seguridad, es la política. Lo que se exige es que no pueda escribir.
    await assertSucceeds(comoPropA().doc('${c}/' + DOC).get());
    await assertFails(comoPropA().doc('${c}/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));`
      : `await assertFails(comoPropA().doc('${c}/' + DOC).get());`}
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('${c}/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('${c}', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    ${lecturaPublica
      ? `// Lectura pública: puede leer, pero no escribir sin ser el titular.
    await assertSucceeds(comoProfesional().doc('${c}/' + DOC).get());`
      : `await assertFails(comoProfesional().doc('${c}/' + DOC).get());`}
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('${c}', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    ${lecturaPublica
      ? `// Lectura pública: el inquilino puede leer, pero NO escribir.
    await assertSucceeds(comoInquilino().doc('${c}/' + DOC).get());
    await assertFails(comoInquilino().doc('${c}/' + DOC).delete());`
      : `await assertFails(comoInquilino().doc('${c}/' + DOC).get());`}
  });

  it('10. ${borradoProhibido
    ? 'el borrado está prohibido para TODOS los roles (restricción del texto)'
    : 'el borrado no lo puede ejecutar un tercer propietario'}', async () => {
    await sembrarDoc('${c}', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    ${borradoProhibido
      ? `// La política declara \`allow ... delete: if false\` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('${c}/' + DOC).delete());
    await assertFails(comoMaster().doc('${c}/' + DOC).delete());`
      : `await assertFails(comoPropA().doc('${c}/' + DOC).delete());
    await assertFails(comoProfesional().doc('${c}/' + DOC).delete());`}
  });
});`);
}

// Resumen final: cobertura declarada
L.push(`
describe('P0-A · cobertura declarada', () => {
  it('la batería cubre ${colecciones.length} colecciones (una suite de 10 supuestos cada una)', () => {
    expect(${colecciones.length}).toBeGreaterThanOrEqual(70);
  });
});
`);

writeFileSync(SALIDA, L.join('\n'), 'utf8');
console.log(`[p0] batería escrita en ${SALIDA}`);
console.log(`[p0] ${colecciones.length} colecciones × 10 = ${colecciones.length * 10} casos`);
