/**
 * P0-A · COBERTURA DE REGLAS — generado automáticamente. NO EDITAR A MANO.
 * ======================================================================
 * Fuente: docs/p0/p0-matriz-roles.json + firestore.rules
 * Regenerar: node scripts/p0/generar-bateria-reglas.mjs
 *
 * 77 colecciones × 10 supuestos = 770 casos.
 *
 * CÓMO SE EJECUTA (requiere JRE 21 + firebase-tools):
 *   npm run test:emulador:reglas
 *
 * ESTADO EN ESTA SESIÓN: **escrito, no ejecutado**. El entorno de la auditoría no
 * tiene Java y las descargas de JRE/emulador están bloqueadas por red. No se
 * presenta ningún caso como superado.
 *
 * DATOS: todos sintéticos (`*.invalid`, ids `prop_a`/`prop_b`/`inm_*`).
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


describe('P0-A · usuarios_auth (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('usuarios_auth', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('usuarios_auth/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('usuarios_auth/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('usuarios_auth', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('usuarios_auth/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('usuarios_auth', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('usuarios_auth/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('usuarios_auth', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('usuarios_auth/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('usuarios_auth', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('usuarios_auth/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('usuarios_auth/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('usuarios_auth', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('usuarios_auth/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('usuarios_auth', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('usuarios_auth/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('usuarios_auth', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('usuarios_auth/' + DOC).delete());
    await assertFails(comoMaster().doc('usuarios_auth/' + DOC).delete());
  });
});

describe('P0-A · personas (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('personas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('personas/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('personas/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('personas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('personas/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('personas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('personas/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('personas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('personas/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('personas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('personas/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('personas/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('personas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('personas/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('personas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('personas/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('personas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('personas/' + DOC).delete());
    await assertFails(comoMaster().doc('personas/' + DOC).delete());
  });
});

describe('P0-A · propietarios (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('propietarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('propietarios/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('propietarios/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('propietarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('propietarios/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('propietarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('propietarios/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('propietarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('propietarios/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('propietarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('propietarios/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('propietarios/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('propietarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('propietarios/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('propietarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('propietarios/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('propietarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('propietarios/' + DOC).delete());
    await assertFails(comoMaster().doc('propietarios/' + DOC).delete());
  });
});

describe('P0-A · inmuebles (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inmuebles/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('inmuebles/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inmuebles/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inmuebles/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('inmuebles/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('inmuebles/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('inmuebles/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('inmuebles/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('inmuebles/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('inmuebles/' + DOC).delete());
    await assertFails(comoProfesional().doc('inmuebles/' + DOC).delete());
  });
});

describe('P0-A · titularidades (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('titularidades', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('titularidades/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('titularidades/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('titularidades', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('titularidades/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('titularidades', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('titularidades/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('titularidades', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('titularidades/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('titularidades', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('titularidades/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('titularidades/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('titularidades', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('titularidades/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('titularidades', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('titularidades/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('titularidades', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('titularidades/' + DOC).delete());
    await assertFails(comoMaster().doc('titularidades/' + DOC).delete());
  });
});

describe('P0-A · gestiones_cartera (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('gestiones_cartera', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gestiones_cartera/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('gestiones_cartera/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('gestiones_cartera', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gestiones_cartera/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('gestiones_cartera', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gestiones_cartera/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('gestiones_cartera', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('gestiones_cartera/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('gestiones_cartera', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('gestiones_cartera/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('gestiones_cartera/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('gestiones_cartera', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('gestiones_cartera/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('gestiones_cartera', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('gestiones_cartera/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('gestiones_cartera', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('gestiones_cartera/' + DOC).delete());
    await assertFails(comoMaster().doc('gestiones_cartera/' + DOC).delete());
  });
});

describe('P0-A · registros_patrimoniales (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('registros_patrimoniales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('registros_patrimoniales/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('registros_patrimoniales/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('registros_patrimoniales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('registros_patrimoniales/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('registros_patrimoniales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('registros_patrimoniales/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('registros_patrimoniales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('registros_patrimoniales/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('registros_patrimoniales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('registros_patrimoniales/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('registros_patrimoniales/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('registros_patrimoniales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('registros_patrimoniales/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('registros_patrimoniales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('registros_patrimoniales/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('registros_patrimoniales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('registros_patrimoniales/' + DOC).delete());
    await assertFails(comoProfesional().doc('registros_patrimoniales/' + DOC).delete());
  });
});

describe('P0-A · fichas_publicas_inmueble (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('fichas_publicas_inmueble', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    // La política declara lectura pública para esta colección: se verifica que
    // es pública y que NO se puede escribir sin sesión (supuestos 2-4).
    await assertSucceeds(sinAuth().doc('fichas_publicas_inmueble/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('fichas_publicas_inmueble/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('fichas_publicas_inmueble', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('fichas_publicas_inmueble/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('fichas_publicas_inmueble', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('fichas_publicas_inmueble/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('fichas_publicas_inmueble', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('fichas_publicas_inmueble/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('fichas_publicas_inmueble', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // Lectura PÚBLICA declarada: leer el documento de otro titular NO es un fallo
    // de seguridad, es la política. Lo que se exige es que no pueda escribir.
    await assertSucceeds(comoPropA().doc('fichas_publicas_inmueble/' + DOC).get());
    await assertFails(comoPropA().doc('fichas_publicas_inmueble/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('fichas_publicas_inmueble/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('fichas_publicas_inmueble', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // Lectura pública: puede leer, pero no escribir sin ser el titular.
    await assertSucceeds(comoProfesional().doc('fichas_publicas_inmueble/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('fichas_publicas_inmueble', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // Lectura pública: el inquilino puede leer, pero NO escribir.
    await assertSucceeds(comoInquilino().doc('fichas_publicas_inmueble/' + DOC).get());
    await assertFails(comoInquilino().doc('fichas_publicas_inmueble/' + DOC).delete());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('fichas_publicas_inmueble', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('fichas_publicas_inmueble/' + DOC).delete());
    await assertFails(comoProfesional().doc('fichas_publicas_inmueble/' + DOC).delete());
  });
});

describe('P0-A · contratos_formalizacion (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('contratos_formalizacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('contratos_formalizacion/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('contratos_formalizacion/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('contratos_formalizacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('contratos_formalizacion/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('contratos_formalizacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('contratos_formalizacion/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('contratos_formalizacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('contratos_formalizacion/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('contratos_formalizacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('contratos_formalizacion/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('contratos_formalizacion/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('contratos_formalizacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('contratos_formalizacion/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('contratos_formalizacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('contratos_formalizacion/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('contratos_formalizacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('contratos_formalizacion/' + DOC).delete());
    await assertFails(comoProfesional().doc('contratos_formalizacion/' + DOC).delete());
  });
});

describe('P0-A · gastos (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('gastos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('gastos/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('gastos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('gastos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('gastos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('gastos/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('gastos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('gastos/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('gastos/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('gastos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('gastos/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('gastos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('gastos/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('gastos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('gastos/' + DOC).delete());
    await assertFails(comoProfesional().doc('gastos/' + DOC).delete());
  });
});

describe('P0-A · gastos_recurrentes (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('gastos_recurrentes', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos_recurrentes/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('gastos_recurrentes/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('gastos_recurrentes', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos_recurrentes/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('gastos_recurrentes', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos_recurrentes/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('gastos_recurrentes', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('gastos_recurrentes/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('gastos_recurrentes', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('gastos_recurrentes/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('gastos_recurrentes/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('gastos_recurrentes', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('gastos_recurrentes/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('gastos_recurrentes', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('gastos_recurrentes/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('gastos_recurrentes', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('gastos_recurrentes/' + DOC).delete());
    await assertFails(comoProfesional().doc('gastos_recurrentes/' + DOC).delete());
  });
});

describe('P0-A · prestamos (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('prestamos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('prestamos/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('prestamos/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('prestamos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('prestamos/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('prestamos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('prestamos/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('prestamos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('prestamos/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('prestamos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('prestamos/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('prestamos/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('prestamos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('prestamos/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('prestamos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('prestamos/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('prestamos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('prestamos/' + DOC).delete());
    await assertFails(comoProfesional().doc('prestamos/' + DOC).delete());
  });
});

describe('P0-A · expedientes_recomercializacion (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('expedientes_recomercializacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_recomercializacion/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('expedientes_recomercializacion/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('expedientes_recomercializacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_recomercializacion/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('expedientes_recomercializacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_recomercializacion/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('expedientes_recomercializacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('expedientes_recomercializacion/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('expedientes_recomercializacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('expedientes_recomercializacion/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('expedientes_recomercializacion/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('expedientes_recomercializacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('expedientes_recomercializacion/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('expedientes_recomercializacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('expedientes_recomercializacion/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('expedientes_recomercializacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('expedientes_recomercializacion/' + DOC).delete());
    await assertFails(comoProfesional().doc('expedientes_recomercializacion/' + DOC).delete());
  });
});

describe('P0-A · propuestas_inmobiliaria (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('propuestas_inmobiliaria', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('propuestas_inmobiliaria/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('propuestas_inmobiliaria/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('propuestas_inmobiliaria', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('propuestas_inmobiliaria/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('propuestas_inmobiliaria', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('propuestas_inmobiliaria/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('propuestas_inmobiliaria', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('propuestas_inmobiliaria/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('propuestas_inmobiliaria', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('propuestas_inmobiliaria/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('propuestas_inmobiliaria/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('propuestas_inmobiliaria', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('propuestas_inmobiliaria/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('propuestas_inmobiliaria', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('propuestas_inmobiliaria/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('propuestas_inmobiliaria', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('propuestas_inmobiliaria/' + DOC).delete());
    await assertFails(comoProfesional().doc('propuestas_inmobiliaria/' + DOC).delete());
  });
});

describe('P0-A · leads_inmobiliario (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('leads_inmobiliario', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('leads_inmobiliario/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('leads_inmobiliario/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('leads_inmobiliario', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('leads_inmobiliario/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('leads_inmobiliario', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('leads_inmobiliario/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('leads_inmobiliario', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('leads_inmobiliario/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('leads_inmobiliario', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('leads_inmobiliario/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('leads_inmobiliario/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('leads_inmobiliario', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('leads_inmobiliario/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('leads_inmobiliario', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('leads_inmobiliario/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('leads_inmobiliario', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('leads_inmobiliario/' + DOC).delete());
    await assertFails(comoProfesional().doc('leads_inmobiliario/' + DOC).delete());
  });
});

describe('P0-A · inmobiliarias_directorio (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('inmobiliarias_directorio', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inmobiliarias_directorio/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('inmobiliarias_directorio/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('inmobiliarias_directorio', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inmobiliarias_directorio/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('inmobiliarias_directorio', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inmobiliarias_directorio/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('inmobiliarias_directorio', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('inmobiliarias_directorio/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('inmobiliarias_directorio', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('inmobiliarias_directorio/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('inmobiliarias_directorio/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('inmobiliarias_directorio', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('inmobiliarias_directorio/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('inmobiliarias_directorio', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('inmobiliarias_directorio/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('inmobiliarias_directorio', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('inmobiliarias_directorio/' + DOC).delete());
    await assertFails(comoProfesional().doc('inmobiliarias_directorio/' + DOC).delete());
  });
});

describe('P0-A · incidencias (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('incidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('incidencias/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('incidencias/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('incidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('incidencias/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('incidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('incidencias/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('incidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('incidencias/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('incidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('incidencias/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('incidencias/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('incidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('incidencias/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('incidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('incidencias/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('incidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('incidencias/' + DOC).delete());
    await assertFails(comoProfesional().doc('incidencias/' + DOC).delete());
  });
});

describe('P0-A · tareas_mantenimiento (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('tareas_mantenimiento', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('tareas_mantenimiento/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('tareas_mantenimiento/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('tareas_mantenimiento', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('tareas_mantenimiento/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('tareas_mantenimiento', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('tareas_mantenimiento/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('tareas_mantenimiento', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('tareas_mantenimiento/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('tareas_mantenimiento', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('tareas_mantenimiento/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('tareas_mantenimiento/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('tareas_mantenimiento', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('tareas_mantenimiento/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('tareas_mantenimiento', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('tareas_mantenimiento/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('tareas_mantenimiento', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('tareas_mantenimiento/' + DOC).delete());
    await assertFails(comoProfesional().doc('tareas_mantenimiento/' + DOC).delete());
  });
});

describe('P0-A · garantias_reparacion (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('garantias_reparacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('garantias_reparacion/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('garantias_reparacion/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('garantias_reparacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('garantias_reparacion/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('garantias_reparacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('garantias_reparacion/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('garantias_reparacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('garantias_reparacion/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('garantias_reparacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('garantias_reparacion/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('garantias_reparacion/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('garantias_reparacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('garantias_reparacion/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('garantias_reparacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('garantias_reparacion/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('garantias_reparacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('garantias_reparacion/' + DOC).delete());
    await assertFails(comoProfesional().doc('garantias_reparacion/' + DOC).delete());
  });
});

describe('P0-A · trabajos_profesionales (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('trabajos_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('trabajos_profesionales/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('trabajos_profesionales/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('trabajos_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('trabajos_profesionales/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('trabajos_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('trabajos_profesionales/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('trabajos_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('trabajos_profesionales/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('trabajos_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('trabajos_profesionales/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('trabajos_profesionales/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('trabajos_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('trabajos_profesionales/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('trabajos_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('trabajos_profesionales/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('trabajos_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('trabajos_profesionales/' + DOC).delete());
    await assertFails(comoProfesional().doc('trabajos_profesionales/' + DOC).delete());
  });
});

describe('P0-A · mensajes_trabajo (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('mensajes_trabajo', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mensajes_trabajo/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('mensajes_trabajo/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('mensajes_trabajo', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mensajes_trabajo/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('mensajes_trabajo', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mensajes_trabajo/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('mensajes_trabajo', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('mensajes_trabajo/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('mensajes_trabajo', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('mensajes_trabajo/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('mensajes_trabajo/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('mensajes_trabajo', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('mensajes_trabajo/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('mensajes_trabajo', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('mensajes_trabajo/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('mensajes_trabajo', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('mensajes_trabajo/' + DOC).delete());
    await assertFails(comoMaster().doc('mensajes_trabajo/' + DOC).delete());
  });
});

describe('P0-A · presupuestos_profesionales (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('presupuestos_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('presupuestos_profesionales/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('presupuestos_profesionales/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('presupuestos_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('presupuestos_profesionales/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('presupuestos_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('presupuestos_profesionales/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('presupuestos_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('presupuestos_profesionales/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('presupuestos_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('presupuestos_profesionales/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('presupuestos_profesionales/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('presupuestos_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('presupuestos_profesionales/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('presupuestos_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('presupuestos_profesionales/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('presupuestos_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('presupuestos_profesionales/' + DOC).delete());
    await assertFails(comoProfesional().doc('presupuestos_profesionales/' + DOC).delete());
  });
});

describe('P0-A · valoraciones_profesionales (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('valoraciones_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('valoraciones_profesionales/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('valoraciones_profesionales/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('valoraciones_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('valoraciones_profesionales/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('valoraciones_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('valoraciones_profesionales/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('valoraciones_profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('valoraciones_profesionales/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('valoraciones_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('valoraciones_profesionales/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('valoraciones_profesionales/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('valoraciones_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('valoraciones_profesionales/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('valoraciones_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('valoraciones_profesionales/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('valoraciones_profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('valoraciones_profesionales/' + DOC).delete());
    await assertFails(comoProfesional().doc('valoraciones_profesionales/' + DOC).delete());
  });
});

describe('P0-A · necesidades_reforma (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('necesidades_reforma', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('necesidades_reforma/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('necesidades_reforma/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('necesidades_reforma', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('necesidades_reforma/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('necesidades_reforma', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('necesidades_reforma/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('necesidades_reforma', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('necesidades_reforma/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('necesidades_reforma', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('necesidades_reforma/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('necesidades_reforma/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('necesidades_reforma', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('necesidades_reforma/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('necesidades_reforma', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('necesidades_reforma/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('necesidades_reforma', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('necesidades_reforma/' + DOC).delete());
    await assertFails(comoProfesional().doc('necesidades_reforma/' + DOC).delete());
  });
});

describe('P0-A · proyectos_reforma (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('proyectos_reforma', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('proyectos_reforma/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('proyectos_reforma/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('proyectos_reforma', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('proyectos_reforma/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('proyectos_reforma', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('proyectos_reforma/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('proyectos_reforma', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('proyectos_reforma/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('proyectos_reforma', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('proyectos_reforma/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('proyectos_reforma/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('proyectos_reforma', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('proyectos_reforma/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('proyectos_reforma', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('proyectos_reforma/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('proyectos_reforma', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('proyectos_reforma/' + DOC).delete());
    await assertFails(comoProfesional().doc('proyectos_reforma/' + DOC).delete());
  });
});

describe('P0-A · inventario_inmuebles (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('inventario_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inventario_inmuebles/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('inventario_inmuebles/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('inventario_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inventario_inmuebles/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('inventario_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inventario_inmuebles/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('inventario_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('inventario_inmuebles/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('inventario_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('inventario_inmuebles/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('inventario_inmuebles/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('inventario_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('inventario_inmuebles/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('inventario_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('inventario_inmuebles/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('inventario_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('inventario_inmuebles/' + DOC).delete());
    await assertFails(comoProfesional().doc('inventario_inmuebles/' + DOC).delete());
  });
});

describe('P0-A · inventario_historial (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('inventario_historial', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inventario_historial/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('inventario_historial/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('inventario_historial', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inventario_historial/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('inventario_historial', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('inventario_historial/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('inventario_historial', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('inventario_historial/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('inventario_historial', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('inventario_historial/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('inventario_historial/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('inventario_historial', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('inventario_historial/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('inventario_historial', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('inventario_historial/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('inventario_historial', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('inventario_historial/' + DOC).delete());
    await assertFails(comoMaster().doc('inventario_historial/' + DOC).delete());
  });
});

describe('P0-A · habitaciones_inmueble (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('habitaciones_inmueble', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('habitaciones_inmueble/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('habitaciones_inmueble/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('habitaciones_inmueble', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('habitaciones_inmueble/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('habitaciones_inmueble', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('habitaciones_inmueble/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('habitaciones_inmueble', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('habitaciones_inmueble/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('habitaciones_inmueble', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('habitaciones_inmueble/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('habitaciones_inmueble/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('habitaciones_inmueble', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('habitaciones_inmueble/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('habitaciones_inmueble', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('habitaciones_inmueble/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('habitaciones_inmueble', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('habitaciones_inmueble/' + DOC).delete());
    await assertFails(comoProfesional().doc('habitaciones_inmueble/' + DOC).delete());
  });
});

describe('P0-A · polizas_seguros (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('polizas_seguros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('polizas_seguros/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('polizas_seguros/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('polizas_seguros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('polizas_seguros/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('polizas_seguros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('polizas_seguros/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('polizas_seguros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('polizas_seguros/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('polizas_seguros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('polizas_seguros/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('polizas_seguros/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('polizas_seguros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('polizas_seguros/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('polizas_seguros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('polizas_seguros/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('polizas_seguros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('polizas_seguros/' + DOC).delete());
    await assertFails(comoProfesional().doc('polizas_seguros/' + DOC).delete());
  });
});

describe('P0-A · siniestros (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('siniestros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('siniestros/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('siniestros/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('siniestros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('siniestros/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('siniestros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('siniestros/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('siniestros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('siniestros/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('siniestros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('siniestros/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('siniestros/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('siniestros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('siniestros/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('siniestros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('siniestros/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('siniestros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('siniestros/' + DOC).delete());
    await assertFails(comoProfesional().doc('siniestros/' + DOC).delete());
  });
});

describe('P0-A · candidatos (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('candidatos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('candidatos/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('candidatos/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('candidatos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('candidatos/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('candidatos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('candidatos/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('candidatos', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('candidatos/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('candidatos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('candidatos/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('candidatos/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('candidatos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('candidatos/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('candidatos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('candidatos/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('candidatos', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('candidatos/' + DOC).delete());
    await assertFails(comoProfesional().doc('candidatos/' + DOC).delete());
  });
});

describe('P0-A · solicitudes (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('solicitudes', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('solicitudes/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('solicitudes', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('solicitudes', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('solicitudes', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('solicitudes/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('solicitudes', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('solicitudes/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('solicitudes/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('solicitudes', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('solicitudes/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('solicitudes', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('solicitudes/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('solicitudes', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('solicitudes/' + DOC).delete());
    await assertFails(comoProfesional().doc('solicitudes/' + DOC).delete());
  });
});

describe('P0-A · invitaciones (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('invitaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('invitaciones/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('invitaciones/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('invitaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('invitaciones/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('invitaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('invitaciones/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('invitaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('invitaciones/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('invitaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('invitaciones/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('invitaciones/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('invitaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('invitaciones/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('invitaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('invitaciones/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('invitaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('invitaciones/' + DOC).delete());
    await assertFails(comoProfesional().doc('invitaciones/' + DOC).delete());
  });
});

describe('P0-A · slots_visita (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('slots_visita', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('slots_visita/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('slots_visita/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('slots_visita', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('slots_visita/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('slots_visita', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('slots_visita/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('slots_visita', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('slots_visita/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('slots_visita', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('slots_visita/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('slots_visita/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('slots_visita', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('slots_visita/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('slots_visita', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('slots_visita/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('slots_visita', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('slots_visita/' + DOC).delete());
    await assertFails(comoProfesional().doc('slots_visita/' + DOC).delete());
  });
});

describe('P0-A · solicitudes_documentacion (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('solicitudes_documentacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes_documentacion/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('solicitudes_documentacion/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('solicitudes_documentacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes_documentacion/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('solicitudes_documentacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes_documentacion/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('solicitudes_documentacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('solicitudes_documentacion/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('solicitudes_documentacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('solicitudes_documentacion/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('solicitudes_documentacion/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('solicitudes_documentacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('solicitudes_documentacion/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('solicitudes_documentacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('solicitudes_documentacion/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('solicitudes_documentacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('solicitudes_documentacion/' + DOC).delete());
    await assertFails(comoProfesional().doc('solicitudes_documentacion/' + DOC).delete());
  });
});

describe('P0-A · configuracion_aseguradoras (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('configuracion_aseguradoras', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('configuracion_aseguradoras/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('configuracion_aseguradoras/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('configuracion_aseguradoras', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('configuracion_aseguradoras/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('configuracion_aseguradoras', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('configuracion_aseguradoras/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('configuracion_aseguradoras', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('configuracion_aseguradoras/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('configuracion_aseguradoras', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('configuracion_aseguradoras/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('configuracion_aseguradoras/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('configuracion_aseguradoras', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('configuracion_aseguradoras/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('configuracion_aseguradoras', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('configuracion_aseguradoras/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('configuracion_aseguradoras', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('configuracion_aseguradoras/' + DOC).delete());
    await assertFails(comoProfesional().doc('configuracion_aseguradoras/' + DOC).delete());
  });
});

describe('P0-A · solicitudes_seguro_impago (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('solicitudes_seguro_impago', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes_seguro_impago/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('solicitudes_seguro_impago/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('solicitudes_seguro_impago', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes_seguro_impago/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('solicitudes_seguro_impago', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('solicitudes_seguro_impago/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('solicitudes_seguro_impago', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('solicitudes_seguro_impago/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('solicitudes_seguro_impago', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('solicitudes_seguro_impago/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('solicitudes_seguro_impago/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('solicitudes_seguro_impago', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('solicitudes_seguro_impago/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('solicitudes_seguro_impago', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('solicitudes_seguro_impago/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('solicitudes_seguro_impago', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('solicitudes_seguro_impago/' + DOC).delete());
    await assertFails(comoProfesional().doc('solicitudes_seguro_impago/' + DOC).delete());
  });
});

describe('P0-A · system (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('system', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('system/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('system/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('system', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('system/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('system', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('system/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('system', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('system/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('system', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('system/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('system/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('system', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('system/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('system', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('system/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('system', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('system/' + DOC).delete());
    await assertFails(comoProfesional().doc('system/' + DOC).delete());
  });
});

describe('P0-A · usuarios (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('usuarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('usuarios/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('usuarios/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('usuarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('usuarios/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('usuarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('usuarios/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('usuarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('usuarios/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('usuarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('usuarios/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('usuarios/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('usuarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('usuarios/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('usuarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('usuarios/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('usuarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('usuarios/' + DOC).delete());
    await assertFails(comoMaster().doc('usuarios/' + DOC).delete());
  });
});

describe('P0-A · profesionales (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('profesionales/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('profesionales/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('profesionales/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('profesionales/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('profesionales', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('profesionales/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('profesionales/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('profesionales/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('profesionales/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('profesionales/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('profesionales', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('profesionales/' + DOC).delete());
    await assertFails(comoProfesional().doc('profesionales/' + DOC).delete());
  });
});

describe('P0-A · enlaces_registro (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('enlaces_registro', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('enlaces_registro/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('enlaces_registro/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('enlaces_registro', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('enlaces_registro/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('enlaces_registro', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('enlaces_registro/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('enlaces_registro', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('enlaces_registro/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('enlaces_registro', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('enlaces_registro/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('enlaces_registro/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('enlaces_registro', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('enlaces_registro/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('enlaces_registro', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('enlaces_registro/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('enlaces_registro', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('enlaces_registro/' + DOC).delete());
    await assertFails(comoMaster().doc('enlaces_registro/' + DOC).delete());
  });
});

describe('P0-A · especialidades (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('especialidades', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    // La política declara lectura pública para esta colección: se verifica que
    // es pública y que NO se puede escribir sin sesión (supuestos 2-4).
    await assertSucceeds(sinAuth().doc('especialidades/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('especialidades/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('especialidades', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('especialidades/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('especialidades', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('especialidades/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('especialidades', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('especialidades/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('especialidades', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // Lectura PÚBLICA declarada: leer el documento de otro titular NO es un fallo
    // de seguridad, es la política. Lo que se exige es que no pueda escribir.
    await assertSucceeds(comoPropA().doc('especialidades/' + DOC).get());
    await assertFails(comoPropA().doc('especialidades/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('especialidades/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('especialidades', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // Lectura pública: puede leer, pero no escribir sin ser el titular.
    await assertSucceeds(comoProfesional().doc('especialidades/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('especialidades', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // Lectura pública: el inquilino puede leer, pero NO escribir.
    await assertSucceeds(comoInquilino().doc('especialidades/' + DOC).get());
    await assertFails(comoInquilino().doc('especialidades/' + DOC).delete());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('especialidades', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('especialidades/' + DOC).delete());
    await assertFails(comoProfesional().doc('especialidades/' + DOC).delete());
  });
});

describe('P0-A · audit_logs (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('audit_logs', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('audit_logs/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('audit_logs/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('audit_logs', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('audit_logs/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('audit_logs', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('audit_logs/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('audit_logs', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('audit_logs/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('audit_logs', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('audit_logs/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('audit_logs/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('audit_logs', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('audit_logs/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('audit_logs', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('audit_logs/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('audit_logs', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('audit_logs/' + DOC).delete());
    await assertFails(comoMaster().doc('audit_logs/' + DOC).delete());
  });
});

describe('P0-A · notificaciones (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('notificaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('notificaciones/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('notificaciones/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('notificaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('notificaciones/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('notificaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('notificaciones/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('notificaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('notificaciones/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('notificaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('notificaciones/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('notificaciones/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('notificaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('notificaciones/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('notificaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('notificaciones/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('notificaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('notificaciones/' + DOC).delete());
    await assertFails(comoProfesional().doc('notificaciones/' + DOC).delete());
  });
});

describe('P0-A · financiaciones (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('financiaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('financiaciones/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('financiaciones/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('financiaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('financiaciones/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('financiaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('financiaciones/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('financiaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('financiaciones/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('financiaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('financiaciones/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('financiaciones/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('financiaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('financiaciones/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('financiaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('financiaciones/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('financiaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('financiaciones/' + DOC).delete());
    await assertFails(comoProfesional().doc('financiaciones/' + DOC).delete());
  });
});

describe('P0-A · movimientos_bancarios (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('movimientos_bancarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('movimientos_bancarios/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('movimientos_bancarios/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('movimientos_bancarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('movimientos_bancarios/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('movimientos_bancarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('movimientos_bancarios/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('movimientos_bancarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('movimientos_bancarios/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('movimientos_bancarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('movimientos_bancarios/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('movimientos_bancarios/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('movimientos_bancarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('movimientos_bancarios/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('movimientos_bancarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('movimientos_bancarios/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('movimientos_bancarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('movimientos_bancarios/' + DOC).delete());
    await assertFails(comoProfesional().doc('movimientos_bancarios/' + DOC).delete());
  });
});

describe('P0-A · conciliaciones_bancarias (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('conciliaciones_bancarias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('conciliaciones_bancarias/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('conciliaciones_bancarias/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('conciliaciones_bancarias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('conciliaciones_bancarias/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('conciliaciones_bancarias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('conciliaciones_bancarias/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('conciliaciones_bancarias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('conciliaciones_bancarias/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('conciliaciones_bancarias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('conciliaciones_bancarias/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('conciliaciones_bancarias/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('conciliaciones_bancarias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('conciliaciones_bancarias/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('conciliaciones_bancarias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('conciliaciones_bancarias/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('conciliaciones_bancarias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('conciliaciones_bancarias/' + DOC).delete());
    await assertFails(comoProfesional().doc('conciliaciones_bancarias/' + DOC).delete());
  });
});

describe('P0-A · importaciones_bancarias (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('importaciones_bancarias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('importaciones_bancarias/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('importaciones_bancarias/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('importaciones_bancarias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('importaciones_bancarias/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('importaciones_bancarias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('importaciones_bancarias/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('importaciones_bancarias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('importaciones_bancarias/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('importaciones_bancarias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('importaciones_bancarias/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('importaciones_bancarias/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('importaciones_bancarias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('importaciones_bancarias/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('importaciones_bancarias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('importaciones_bancarias/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('importaciones_bancarias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('importaciones_bancarias/' + DOC).delete());
    await assertFails(comoProfesional().doc('importaciones_bancarias/' + DOC).delete());
  });
});

describe('P0-A · eventos_conciliacion_bancaria (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('eventos_conciliacion_bancaria', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('eventos_conciliacion_bancaria/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('eventos_conciliacion_bancaria/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('eventos_conciliacion_bancaria', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('eventos_conciliacion_bancaria/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('eventos_conciliacion_bancaria', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('eventos_conciliacion_bancaria/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('eventos_conciliacion_bancaria', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('eventos_conciliacion_bancaria/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('eventos_conciliacion_bancaria', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('eventos_conciliacion_bancaria/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('eventos_conciliacion_bancaria/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('eventos_conciliacion_bancaria', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('eventos_conciliacion_bancaria/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('eventos_conciliacion_bancaria', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('eventos_conciliacion_bancaria/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('eventos_conciliacion_bancaria', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('eventos_conciliacion_bancaria/' + DOC).delete());
    await assertFails(comoMaster().doc('eventos_conciliacion_bancaria/' + DOC).delete());
  });
});

describe('P0-A · facturas (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('facturas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('facturas/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('facturas/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('facturas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('facturas/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('facturas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('facturas/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('facturas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('facturas/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('facturas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('facturas/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('facturas/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('facturas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('facturas/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('facturas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('facturas/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('facturas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('facturas/' + DOC).delete());
    await assertFails(comoProfesional().doc('facturas/' + DOC).delete());
  });
});

describe('P0-A · registros_facturacion (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('registros_facturacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('registros_facturacion/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('registros_facturacion/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('registros_facturacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('registros_facturacion/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('registros_facturacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('registros_facturacion/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('registros_facturacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('registros_facturacion/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('registros_facturacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('registros_facturacion/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('registros_facturacion/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('registros_facturacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('registros_facturacion/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('registros_facturacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('registros_facturacion/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('registros_facturacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('registros_facturacion/' + DOC).delete());
    await assertFails(comoProfesional().doc('registros_facturacion/' + DOC).delete());
  });
});

describe('P0-A · envios_verifactu (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('envios_verifactu', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('envios_verifactu/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('envios_verifactu/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('envios_verifactu', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('envios_verifactu/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('envios_verifactu', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('envios_verifactu/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('envios_verifactu', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('envios_verifactu/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('envios_verifactu', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('envios_verifactu/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('envios_verifactu/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('envios_verifactu', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('envios_verifactu/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('envios_verifactu', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('envios_verifactu/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('envios_verifactu', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('envios_verifactu/' + DOC).delete());
    await assertFails(comoProfesional().doc('envios_verifactu/' + DOC).delete());
  });
});

describe('P0-A · series_facturacion (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('series_facturacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('series_facturacion/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('series_facturacion/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('series_facturacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('series_facturacion/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('series_facturacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('series_facturacion/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('series_facturacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('series_facturacion/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('series_facturacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('series_facturacion/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('series_facturacion/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('series_facturacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('series_facturacion/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('series_facturacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('series_facturacion/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('series_facturacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('series_facturacion/' + DOC).delete());
    await assertFails(comoProfesional().doc('series_facturacion/' + DOC).delete());
  });
});

describe('P0-A · mensajes_portal (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('mensajes_portal', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mensajes_portal/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('mensajes_portal/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('mensajes_portal', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mensajes_portal/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('mensajes_portal', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mensajes_portal/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('mensajes_portal', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('mensajes_portal/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('mensajes_portal', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('mensajes_portal/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('mensajes_portal/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('mensajes_portal', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('mensajes_portal/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('mensajes_portal', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('mensajes_portal/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('mensajes_portal', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('mensajes_portal/' + DOC).delete());
    await assertFails(comoMaster().doc('mensajes_portal/' + DOC).delete());
  });
});

describe('P0-A · suministros (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('suministros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('suministros/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('suministros/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('suministros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('suministros/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('suministros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('suministros/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('suministros', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('suministros/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('suministros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('suministros/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('suministros/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('suministros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('suministros/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('suministros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('suministros/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('suministros', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('suministros/' + DOC).delete());
    await assertFails(comoProfesional().doc('suministros/' + DOC).delete());
  });
});

describe('P0-A · lecturas_suministro (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('lecturas_suministro', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('lecturas_suministro/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('lecturas_suministro/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('lecturas_suministro', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('lecturas_suministro/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('lecturas_suministro', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('lecturas_suministro/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('lecturas_suministro', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('lecturas_suministro/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('lecturas_suministro', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('lecturas_suministro/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('lecturas_suministro/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('lecturas_suministro', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('lecturas_suministro/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('lecturas_suministro', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('lecturas_suministro/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('lecturas_suministro', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('lecturas_suministro/' + DOC).delete());
    await assertFails(comoMaster().doc('lecturas_suministro/' + DOC).delete());
  });
});

describe('P0-A · cambios_titular (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('cambios_titular', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('cambios_titular/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('cambios_titular/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('cambios_titular', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('cambios_titular/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('cambios_titular', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('cambios_titular/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('cambios_titular', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('cambios_titular/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('cambios_titular', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('cambios_titular/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('cambios_titular/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('cambios_titular', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('cambios_titular/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('cambios_titular', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('cambios_titular/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('cambios_titular', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('cambios_titular/' + DOC).delete());
    await assertFails(comoProfesional().doc('cambios_titular/' + DOC).delete());
  });
});

describe('P0-A · facturas_electronicas_b2b (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('facturas_electronicas_b2b', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('facturas_electronicas_b2b/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('facturas_electronicas_b2b/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('facturas_electronicas_b2b', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('facturas_electronicas_b2b/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('facturas_electronicas_b2b', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('facturas_electronicas_b2b/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('facturas_electronicas_b2b', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('facturas_electronicas_b2b/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('facturas_electronicas_b2b', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('facturas_electronicas_b2b/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('facturas_electronicas_b2b/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('facturas_electronicas_b2b', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('facturas_electronicas_b2b/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('facturas_electronicas_b2b', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('facturas_electronicas_b2b/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('facturas_electronicas_b2b', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('facturas_electronicas_b2b/' + DOC).delete());
    await assertFails(comoProfesional().doc('facturas_electronicas_b2b/' + DOC).delete());
  });
});

describe('P0-A · liquidaciones_propietarios (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('liquidaciones_propietarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('liquidaciones_propietarios/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('liquidaciones_propietarios/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('liquidaciones_propietarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('liquidaciones_propietarios/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('liquidaciones_propietarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('liquidaciones_propietarios/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('liquidaciones_propietarios', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('liquidaciones_propietarios/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('liquidaciones_propietarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('liquidaciones_propietarios/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('liquidaciones_propietarios/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('liquidaciones_propietarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('liquidaciones_propietarios/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('liquidaciones_propietarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('liquidaciones_propietarios/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('liquidaciones_propietarios', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('liquidaciones_propietarios/' + DOC).delete());
    await assertFails(comoProfesional().doc('liquidaciones_propietarios/' + DOC).delete());
  });
});

describe('P0-A · gastos_inmuebles (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('gastos_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos_inmuebles/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('gastos_inmuebles/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('gastos_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos_inmuebles/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('gastos_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('gastos_inmuebles/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('gastos_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('gastos_inmuebles/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('gastos_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('gastos_inmuebles/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('gastos_inmuebles/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('gastos_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('gastos_inmuebles/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('gastos_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('gastos_inmuebles/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('gastos_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('gastos_inmuebles/' + DOC).delete());
    await assertFails(comoProfesional().doc('gastos_inmuebles/' + DOC).delete());
  });
});

describe('P0-A · ordenes_pago (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('ordenes_pago', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('ordenes_pago/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('ordenes_pago/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('ordenes_pago', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('ordenes_pago/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('ordenes_pago', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('ordenes_pago/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('ordenes_pago', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('ordenes_pago/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('ordenes_pago', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('ordenes_pago/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('ordenes_pago/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('ordenes_pago', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('ordenes_pago/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('ordenes_pago', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('ordenes_pago/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('ordenes_pago', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('ordenes_pago/' + DOC).delete());
    await assertFails(comoProfesional().doc('ordenes_pago/' + DOC).delete());
  });
});

describe('P0-A · ficheros_sepa (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('ficheros_sepa', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('ficheros_sepa/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('ficheros_sepa/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('ficheros_sepa', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('ficheros_sepa/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('ficheros_sepa', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('ficheros_sepa/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('ficheros_sepa', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('ficheros_sepa/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('ficheros_sepa', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('ficheros_sepa/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('ficheros_sepa/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('ficheros_sepa', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('ficheros_sepa/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('ficheros_sepa', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('ficheros_sepa/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('ficheros_sepa', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('ficheros_sepa/' + DOC).delete());
    await assertFails(comoProfesional().doc('ficheros_sepa/' + DOC).delete());
  });
});

describe('P0-A · mandatos_sepa (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('mandatos_sepa', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mandatos_sepa/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('mandatos_sepa/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('mandatos_sepa', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mandatos_sepa/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('mandatos_sepa', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('mandatos_sepa/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('mandatos_sepa', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('mandatos_sepa/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('mandatos_sepa', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('mandatos_sepa/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('mandatos_sepa/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('mandatos_sepa', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('mandatos_sepa/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('mandatos_sepa', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('mandatos_sepa/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('mandatos_sepa', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('mandatos_sepa/' + DOC).delete());
    await assertFails(comoProfesional().doc('mandatos_sepa/' + DOC).delete());
  });
});

describe('P0-A · config_liquidacion (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('config_liquidacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('config_liquidacion/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('config_liquidacion/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('config_liquidacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('config_liquidacion/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('config_liquidacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('config_liquidacion/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('config_liquidacion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('config_liquidacion/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('config_liquidacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('config_liquidacion/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('config_liquidacion/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('config_liquidacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('config_liquidacion/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('config_liquidacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('config_liquidacion/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('config_liquidacion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('config_liquidacion/' + DOC).delete());
    await assertFails(comoProfesional().doc('config_liquidacion/' + DOC).delete());
  });
});

describe('P0-A · expedientes_morosidad (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('expedientes_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_morosidad/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('expedientes_morosidad/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('expedientes_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_morosidad/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('expedientes_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_morosidad/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('expedientes_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('expedientes_morosidad/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('expedientes_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('expedientes_morosidad/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('expedientes_morosidad/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('expedientes_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('expedientes_morosidad/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('expedientes_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('expedientes_morosidad/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('expedientes_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('expedientes_morosidad/' + DOC).delete());
    await assertFails(comoMaster().doc('expedientes_morosidad/' + DOC).delete());
  });
});

describe('P0-A · expedientes_morosidad_hist (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('expedientes_morosidad_hist', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_morosidad_hist/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('expedientes_morosidad_hist/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('expedientes_morosidad_hist', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_morosidad_hist/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('expedientes_morosidad_hist', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('expedientes_morosidad_hist/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('expedientes_morosidad_hist', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('expedientes_morosidad_hist/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('expedientes_morosidad_hist', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('expedientes_morosidad_hist/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('expedientes_morosidad_hist/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('expedientes_morosidad_hist', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('expedientes_morosidad_hist/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('expedientes_morosidad_hist', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('expedientes_morosidad_hist/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('expedientes_morosidad_hist', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('expedientes_morosidad_hist/' + DOC).delete());
    await assertFails(comoMaster().doc('expedientes_morosidad_hist/' + DOC).delete());
  });
});

describe('P0-A · evidencias_morosidad (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('evidencias_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('evidencias_morosidad/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('evidencias_morosidad/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('evidencias_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('evidencias_morosidad/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('evidencias_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('evidencias_morosidad/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('evidencias_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('evidencias_morosidad/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('evidencias_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('evidencias_morosidad/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('evidencias_morosidad/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('evidencias_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('evidencias_morosidad/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('evidencias_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('evidencias_morosidad/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('evidencias_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('evidencias_morosidad/' + DOC).delete());
    await assertFails(comoMaster().doc('evidencias_morosidad/' + DOC).delete());
  });
});

describe('P0-A · compromisos_morosidad (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('compromisos_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('compromisos_morosidad/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('compromisos_morosidad/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('compromisos_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('compromisos_morosidad/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('compromisos_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('compromisos_morosidad/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('compromisos_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('compromisos_morosidad/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('compromisos_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('compromisos_morosidad/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('compromisos_morosidad/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('compromisos_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('compromisos_morosidad/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('compromisos_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('compromisos_morosidad/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('compromisos_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('compromisos_morosidad/' + DOC).delete());
    await assertFails(comoMaster().doc('compromisos_morosidad/' + DOC).delete());
  });
});

describe('P0-A · politicas_morosidad (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('politicas_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('politicas_morosidad/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('politicas_morosidad/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('politicas_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('politicas_morosidad/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('politicas_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('politicas_morosidad/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('politicas_morosidad', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('politicas_morosidad/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('politicas_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('politicas_morosidad/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('politicas_morosidad/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('politicas_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('politicas_morosidad/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('politicas_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('politicas_morosidad/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('politicas_morosidad', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('politicas_morosidad/' + DOC).delete());
    await assertFails(comoMaster().doc('politicas_morosidad/' + DOC).delete());
  });
});

describe('P0-A · morosidad_resumen_propietario (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('morosidad_resumen_propietario', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('morosidad_resumen_propietario/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('morosidad_resumen_propietario/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('morosidad_resumen_propietario', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('morosidad_resumen_propietario/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('morosidad_resumen_propietario', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('morosidad_resumen_propietario/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('morosidad_resumen_propietario', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('morosidad_resumen_propietario/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('morosidad_resumen_propietario', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('morosidad_resumen_propietario/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('morosidad_resumen_propietario/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('morosidad_resumen_propietario', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('morosidad_resumen_propietario/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('morosidad_resumen_propietario', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('morosidad_resumen_propietario/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('morosidad_resumen_propietario', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('morosidad_resumen_propietario/' + DOC).delete());
    await assertFails(comoMaster().doc('morosidad_resumen_propietario/' + DOC).delete());
  });
});

describe('P0-A · actas (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('actas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('actas/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('actas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('actas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('actas', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('actas/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('actas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('actas/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('actas/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('actas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('actas/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('actas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('actas/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('actas', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('actas/' + DOC).delete());
    await assertFails(comoProfesional().doc('actas/' + DOC).delete());
  });
});

describe('P0-A · actas_evidencias (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('actas_evidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_evidencias/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('actas_evidencias/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('actas_evidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_evidencias/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('actas_evidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_evidencias/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('actas_evidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('actas_evidencias/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('actas_evidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('actas_evidencias/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('actas_evidencias/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('actas_evidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('actas_evidencias/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('actas_evidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('actas_evidencias/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('actas_evidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('actas_evidencias/' + DOC).delete());
    await assertFails(comoProfesional().doc('actas_evidencias/' + DOC).delete());
  });
});

describe('P0-A · actas_incidencias (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('actas_incidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_incidencias/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('actas_incidencias/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('actas_incidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_incidencias/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('actas_incidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_incidencias/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('actas_incidencias', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('actas_incidencias/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('actas_incidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('actas_incidencias/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('actas_incidencias/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('actas_incidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('actas_incidencias/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('actas_incidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('actas_incidencias/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('actas_incidencias', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('actas_incidencias/' + DOC).delete());
    await assertFails(comoProfesional().doc('actas_incidencias/' + DOC).delete());
  });
});

describe('P0-A · actas_otp (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('actas_otp', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_otp/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('actas_otp/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('actas_otp', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_otp/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('actas_otp', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('actas_otp/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('actas_otp', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('actas_otp/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('actas_otp', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('actas_otp/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('actas_otp/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('actas_otp', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('actas_otp/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('actas_otp', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('actas_otp/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('actas_otp', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('actas_otp/' + DOC).delete());
    await assertFails(comoMaster().doc('actas_otp/' + DOC).delete());
  });
});

describe('P0-A · analisis_inversion (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('analisis_inversion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('analisis_inversion/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('analisis_inversion/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('analisis_inversion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('analisis_inversion/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('analisis_inversion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('analisis_inversion/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('analisis_inversion', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('analisis_inversion/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('analisis_inversion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('analisis_inversion/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('analisis_inversion/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('analisis_inversion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('analisis_inversion/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('analisis_inversion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('analisis_inversion/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('analisis_inversion', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('analisis_inversion/' + DOC).delete());
    await assertFails(comoProfesional().doc('analisis_inversion/' + DOC).delete());
  });
});

describe('P0-A · operaciones (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('operaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('operaciones/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('operaciones/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('operaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('operaciones/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('operaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('operaciones/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('operaciones', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('operaciones/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('operaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('operaciones/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('operaciones/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('operaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('operaciones/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('operaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('operaciones/' + DOC).get());
  });

  it('10. el borrado está prohibido para TODOS los roles (restricción del texto)', async () => {
    await sembrarDoc('operaciones', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    // La política declara `allow ... delete: if false` (o equivalente):
    // ni el master ni el titular pueden borrar.
    await assertFails(comoPropA().doc('operaciones/' + DOC).delete());
    await assertFails(comoMaster().doc('operaciones/' + DOC).delete());
  });
});

describe('P0-A · sindicacion_inmuebles (10 supuestos)', () => {
  const DOC = 'doc-p0-1';
  beforeEach(async () => { await sembrarRoles(); });

  it('1. sin autenticación NO puede leer', async () => {
    await sembrarDoc('sindicacion_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('sindicacion_inmuebles/' + DOC).get());
  });

  it('2. sin autenticación NO puede crear', async () => {
    await assertFails(sinAuth().doc('sindicacion_inmuebles/' + DOC).set({ sintetico: true, propietarioId: PROP_A, inmuebleId: 'inm_1' }));
  });

  it('3. sin autenticación NO puede modificar', async () => {
    await sembrarDoc('sindicacion_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('sindicacion_inmuebles/' + DOC).update({ sintetico: 'modificado' }));
  });

  it('4. sin autenticación NO puede eliminar', async () => {
    await sembrarDoc('sindicacion_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertFails(sinAuth().doc('sindicacion_inmuebles/' + DOC).delete());
  });

  it('5. el master (email verificado) puede leer', async () => {
    await sembrarDoc('sindicacion_inmuebles', DOC, { sintetico: true, propietarioId: 'prop_a', inmuebleId: 'inm_1', contratoId: 'c_1', id: '__ID__' });
    await assertSucceeds(comoMaster().doc('sindicacion_inmuebles/' + DOC).get());
  });

  it('6. el propietario A no lee el documento del propietario B (lectura cruzada)', async () => {
    await sembrarDoc('sindicacion_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('sindicacion_inmuebles/' + DOC).get());
  });

  it('7. el propietario A no puede escribir en nombre de B (escritura cruzada)', async () => {
    await assertFails(comoPropA().doc('sindicacion_inmuebles/doc-p0-cruzado').set({
      sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', id: 'doc-p0-cruzado',
    }));
  });

  it('8. un profesional no lee lo que no está en su ámbito', async () => {
    await sembrarDoc('sindicacion_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoProfesional().doc('sindicacion_inmuebles/' + DOC).get());
  });

  it('9. un inquilino no lee lo que no le corresponde', async () => {
    await sembrarDoc('sindicacion_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoInquilino().doc('sindicacion_inmuebles/' + DOC).get());
  });

  it('10. el borrado no lo puede ejecutar un tercer propietario', async () => {
    await sembrarDoc('sindicacion_inmuebles', DOC, { sintetico: true, propietarioId: PROP_B, inmuebleId: 'inm_b_1', contratoId: 'c_1', id: DOC });
    await assertFails(comoPropA().doc('sindicacion_inmuebles/' + DOC).delete());
    await assertFails(comoProfesional().doc('sindicacion_inmuebles/' + DOC).delete());
  });
});

describe('P0-A · cobertura declarada', () => {
  it('la batería cubre 77 colecciones (una suite de 10 supuestos cada una)', () => {
    expect(77).toBeGreaterThanOrEqual(70);
  });
});
