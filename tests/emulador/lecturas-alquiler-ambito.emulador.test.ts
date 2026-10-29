/** Contrato de consultas de alquiler con las reglas reales. Requiere emulador oficial. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';

let env: RulesTestEnvironment;
beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '').split(':');
  if (!host || !port) throw new Error('Se requiere FIRESTORE_EMULATOR_HOST');
  env = await initializeTestEnvironment({ projectId: 'demo-gestor-reglas', firestore: {
    rules: readFileSync(resolve('firestore.rules'), 'utf8'), host, port: Number(port),
  } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('usuarios_auth/uid-prop').set({ tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', usuarioId: 'u-prop', authUid: 'uid-prop', propietarioId: 'p1', inmuebleIds: [] });
    await db.doc('usuarios/u-prop').set({ tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', authUid: 'uid-prop', propietarioId: 'p1', inmuebleIds: [] });
    await db.doc('inmuebles/i1').set({ propietarioId: 'p1', titularesIds: ['p1'] });
    await db.doc('inmuebles/i2').set({ propietarioId: 'p2', titularesIds: ['p2'] });
    await db.doc('inmuebles/compartido').set({ propietarioId: 'p2', titularesIds: ['p1', 'p2'] });
    for (const col of ['candidatos', 'invitaciones', 'slots_visita', 'solicitudes_documentacion', 'solicitudes']) {
      await db.doc(`${col}/propio`).set({ propietarioId: 'p1', inmuebleId: 'i1' });
      await db.doc(`${col}/antiguo`).set({ inmuebleId: 'i1' });
      await db.doc(`${col}/compartido`).set({ propietarioId: 'p2', inmuebleId: 'compartido' });
      await db.doc(`${col}/ajeno`).set({ propietarioId: 'p2', inmuebleId: 'i2' });
    }
    await db.doc('profesionales/publico').set({ esPrivado: false, creadoPorPropietarioId: 'p2' });
    await db.doc('profesionales/privado').set({ esPrivado: true, creadoPorPropietarioId: 'p1' });
    await db.doc('profesionales/ajeno').set({ esPrivado: true, creadoPorPropietarioId: 'p2' });
  });
});
const titular = () => env.authenticatedContext('uid-prop', { email: 'prop@example.invalid', email_verified: true }).firestore();

describe('consultas del titular', () => {
  for (const col of ['candidatos', 'invitaciones', 'slots_visita', 'solicitudes_documentacion', 'solicitudes']) {
    it(`${col}: propio, histórico y cotitular; deniega global y ajeno`, async () => {
      const propio = await assertSucceeds(titular().collection(col).where('inmuebleId', '==', 'i1').get());
      expect(propio.docs.map((d) => d.id).sort()).toEqual(['antiguo', 'propio']);
      const compartido = await assertSucceeds(titular().collection(col).where('inmuebleId', '==', 'compartido').get());
      expect(compartido.docs.map((d) => d.id)).toEqual(['compartido']);
      await assertFails(titular().collection(col).get());
      await assertFails(titular().collection(col).where('inmuebleId', '==', 'i2').get());
      await assertFails(titular().collection(col).where('inmuebleId', '==', 'desconocido').get());
      await assertFails(env.unauthenticatedContext().firestore().collection(col).where('inmuebleId', '==', 'i1').get());
      await assertSucceeds(env.authenticatedContext('master', { email: 'sarqsan2@gmail.com', email_verified: true }).firestore().collection(col).get());
    });
  }
  it('profesionales: permite públicos y privados propios, no los ajenos', async () => {
    const col = titular().collection('profesionales');
    await assertSucceeds(col.where('esPrivado', '==', false).get());
    await assertSucceeds(col.where('creadoPorPropietarioId', '==', 'p1').get());
    await assertFails(col.get());
    await assertFails(col.where('creadoPorPropietarioId', '==', 'p2').get());
  });
});
