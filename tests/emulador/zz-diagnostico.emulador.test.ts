// DIAGNÓSTICO TEMPORAL (se elimina tras leer el resultado). Operaciones aisladas con su código exacto.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { GESTOR_G, LECTOR_L, TITULAR_A, mundoSintetico, type SesionSintetica } from './mundoSintetico';

const REGLAS = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
let env: RulesTestEnvironment;
beforeAll(async () => {
  const [host, puerto] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({ projectId: 'demo-gestor-diagnostico', firestore: { rules: REGLAS, host, port: Number(puerto) } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [ruta, valor] of Object.entries(mundoSintetico())) await db.doc(ruta).set(valor);
  });
});
const db = (s: SesionSintetica) => env.authenticatedContext(s.uid, { email: s.email, email_verified: true }).firestore();
async function r(op: () => Promise<unknown>): Promise<string> {
  try { await op(); return 'OK'; } catch (e) { const x = e as { code?: string; message?: string }; return `ERR[${x.code}] ${(x.message ?? '').slice(0, 60)}`; }
}
describe('diagnóstico', () => {
  it('operaciones aisladas', async () => {
    const out: Record<string, string> = {};
    out.A_get_inm_a1 = await r(() => db(TITULAR_A).doc('inmuebles/inm-a1').get());
    out.A_update_inm_a1 = await r(() => db(TITULAR_A).doc('inmuebles/inm-a1').update({ ciudad: 'X' }));
    out.A_update_inm_c1 = await r(() => db(TITULAR_A).doc('inmuebles/inm-c1').update({ ciudad: 'X' }));
    out.G_get_inm_b1 = await r(() => db(GESTOR_G).doc('inmuebles/inm-b1').get());
    out.G_update_inm_b1 = await r(() => db(GESTOR_G).doc('inmuebles/inm-b1').update({ ciudad: 'X' }));
    out.G_create_prop_b = await r(() => db(GESTOR_G).doc('inmuebles/inm-gb-9').set({ id: 'inm-gb-9', propietarioId: 'prop-b' }));
    out.L_get_inm_a1 = await r(() => db(LECTOR_L).doc('inmuebles/inm-a1').get());
    out.A_create_min = await r(() => db(TITULAR_A).doc('inmuebles/inm-min-9').set({ id: 'inm-min-9', propietarioId: 'prop-a' }));
    out.A_get_created = await r(() => db(TITULAR_A).doc('inmuebles/inm-min-9').get());
    out.A_update_created = await r(() => db(TITULAR_A).doc('inmuebles/inm-min-9').update({ ciudad: 'X' }));
    out.A_get_titularidad = await r(() => db(TITULAR_A).doc('titularidades/inm-a1__prop-a').get());
    expect(JSON.stringify(out, null, 1)).toBe('{}');
  });
});
