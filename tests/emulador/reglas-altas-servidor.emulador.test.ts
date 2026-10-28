/**
 * H-15 — EMULADOR OFICIAL: altas que ahora son EXCLUSIVAS DEL SERVIDOR.
 * =====================================================================
 * Cubre los huecos que la auditoría señaló en la suite de emulador (cero casos
 * para `actas_otp`, `solicitudes.create` y `audit_logs.create`):
 *
 *  · `solicitudes` no admite alta anónima (P0.2.2): el formulario público pasa
 *    por `POST /api/solicitud/:token`, con token, honeypot y límite.
 *  · `audit_logs` es append-only y no permite atribuir un registro al correo de
 *    otra persona (P0.2.8).
 *
 * Se ejecuta con el motor real de reglas
 * (`npm run test:emulador:reglas`). **No ejecutado** en este entorno por falta
 * de Java 21 y de `firebase-tools`: se presenta como pendiente de CI/staging,
 * nunca como prueba superada.
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

const RAIZ = resolve(__dirname, '../..');
const REGLAS = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const PROYECTO = 'demo-gestor-reglas';

const UID_PROPIETARIO = 'uid-prop-altas';
const UID_MASTER = 'uid-master-altas';
const EMAIL_PROPIETARIO = 'prop-altas@example.invalid';
const EMAIL_MASTER = 'sarqsan2@gmail.com';
const PROPIETARIO_ID = 'prop_altas_A';
const INMUEBLE_ID = 'inm_altas_1';

type Doc = Record<string, unknown>;

let env: RulesTestEnvironment;

beforeAll(async () => {
  const emulador = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulador) {
    throw new Error('FIRESTORE_EMULATOR_HOST no definido: esta suite exige el emulador oficial de Firestore (no se omite).');
  }
  const [host, puerto] = emulador.split(':');
  env = await initializeTestEnvironment({
    projectId: PROYECTO,
    firestore: { rules: REGLAS, host, port: Number(puerto) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

async function escribirAdmin(datos: Record<string, Doc>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [ruta, valor] of Object.entries(datos)) {
      await db.doc(ruta).set(valor);
    }
  });
}

beforeEach(async () => {
  await env.clearFirestore();
  await escribirAdmin({
    [`usuarios_auth/${UID_PROPIETARIO}`]: {
      tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', usuarioId: 'u_prop_altas',
      authUid: UID_PROPIETARIO, propietarioId: PROPIETARIO_ID, inmuebleIds: [INMUEBLE_ID],
    },
    'usuarios/u_prop_altas': {
      authUid: UID_PROPIETARIO, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO',
      propietarioId: PROPIETARIO_ID, inmuebleIds: [INMUEBLE_ID],
    },
    [`inmuebles/${INMUEBLE_ID}`]: {
      id: INMUEBLE_ID, propietarioId: PROPIETARIO_ID, direccion: 'Calle Sintética 1',
    },
  });
});

const propietario = () => env.authenticatedContext(UID_PROPIETARIO, {
  email: EMAIL_PROPIETARIO, email_verified: true,
}).firestore();
const master = () => env.authenticatedContext(UID_MASTER, {
  email: EMAIL_MASTER, email_verified: true,
}).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

const SOLICITUD = {
  inmuebleId: INMUEBLE_ID,
  propietarioId: PROPIETARIO_ID,
  nombre: 'Candidato Sintético',
  email: 'candidato@example.invalid',
  origen: 'PORTAL_PUBLICO',
  fecha: '2026-10-01T10:00:00.000Z',
};

describe('solicitudes · el alta pública la escribe solo el servidor', () => {
  it('un anónimo NO puede crear, modificar ni borrar solicitudes', async () => {
    await assertFails(anonimo().doc('solicitudes/sol_anonima').set(SOLICITUD));
    await assertFails(anonimo().doc('solicitudes/sol_anonima').update({ nombre: 'otro' }));
    await assertFails(anonimo().doc('solicitudes/sol_anonima').delete());
  });

  it('un anónimo tampoco puede leer solicitudes sueltas', async () => {
    await escribirAdmin({ 'solicitudes/sol_existente': SOLICITUD });
    await assertFails(anonimo().doc('solicitudes/sol_existente').get());
  });

  it('el personal interno (master) sí puede crear', async () => {
    await assertSucceeds(master().doc('solicitudes/sol_master').set(SOLICITUD));
  });
});

describe('audit_logs · append-only sin suplantación de autor', () => {
  it('un usuario puede registrar su propio correo', async () => {
    await assertSucceeds(propietario().doc('audit_logs/aud_propio').set({
      usuarioId: UID_PROPIETARIO,
      usuarioEmail: EMAIL_PROPIETARIO,
      accion: 'LOGIN',
      resultado: 'EXITO',
    }));
  });

  it('un usuario NO puede atribuir un registro a otro correo', async () => {
    await assertFails(propietario().doc('audit_logs/aud_ajeno').set({
      usuarioId: UID_PROPIETARIO,
      usuarioEmail: 'otra-persona@example.invalid',
      accion: 'LOGIN',
      resultado: 'EXITO',
    }));
  });

  it('un anónimo no escribe auditoría y nadie puede modificarla', async () => {
    await assertFails(anonimo().doc('audit_logs/aud_anonimo').set({
      accion: 'LOGIN', resultado: 'EXITO',
    }));
    await escribirAdmin({
      'audit_logs/aud_existente': { usuarioId: UID_PROPIETARIO, usuarioEmail: EMAIL_PROPIETARIO, accion: 'LOGIN' },
    });
    await assertFails(propietario().doc('audit_logs/aud_existente').update({ accion: 'OTRA' }));
    await assertFails(propietario().doc('audit_logs/aud_existente').delete());
  });

  it('solo el master lee la auditoría', async () => {
    await escribirAdmin({
      'audit_logs/aud_lectura': { usuarioId: UID_PROPIETARIO, usuarioEmail: EMAIL_PROPIETARIO, accion: 'LOGIN' },
    });
    await assertFails(propietario().doc('audit_logs/aud_lectura').get());
    await assertSucceeds(master().doc('audit_logs/aud_lectura').get());
  });
});
