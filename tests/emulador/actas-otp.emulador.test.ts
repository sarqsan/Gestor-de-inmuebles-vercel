/**
 * H-03/H-07/H-15 — EMULADOR OFICIAL: las reglas nuevas de `actas` y `actas_otp`.
 * ==============================================================================
 * Ejecuta el motor REAL de reglas de Firebase contra `firestore.rules`
 * (`firebase emulators:exec --only firestore`), igual que el resto de la suite
 * de emulador. No hay evaluador propio aquí.
 *
 * Qué demuestra:
 *  · el navegador no puede crear/actualizar/borrar `actas_otp` (ni el master);
 *  · el propietario no puede reescribir `firmas`, `estadoFirma` ni `fechaFirma`
 *    del acta, ni declararla FIRMADA, ni nacer con firmas;
 *  · una edición administrativa normal sigue permitida;
 *  · el master conserva lectura de diagnóstico de `actas_otp`, nunca escritura.
 *
 * ESTADO DE EJECUCIÓN: **no ejecutado** en el entorno de esta sesión (no hay
 * Java 21 ni `firebase-tools`). Se ejecutará en CI
 * (.github/workflows/emulador-reglas.yml) y en staging. No se presenta como
 * prueba superada.
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

const UID_PROPIETARIO = 'uid-prop-actas';
const UID_MASTER = 'uid-master-actas';
const EMAIL_MASTER = 'sarqsan2@gmail.com';
const PROPIETARIO_ID = 'prop_actas_A';

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

function acta(sobrescribir: Doc = {}): Doc {
  return {
    id: 'acta_reglas_1',
    ownerId: PROPIETARIO_ID,
    propertyId: 'inm_reglas_1',
    tipo: 'ENTRADA',
    estado: 'BORRADOR',
    version: 1,
    fechaCreacion: '2026-10-01T10:00:00.000Z',
    fechaActualizacion: '2026-10-01T10:00:00.000Z',
    fechaActo: '2026-10-01',
    participantes: [{ id: 'part_inq', nombre: 'Inquilino Sintético', rol: 'ARRENDATARIO', firmaRequerida: true, haFirmado: false }],
    inventario: [],
    lecturasContadores: [],
    evidenciaIds: [],
    incidenciaIds: [],
    firmas: [],
    estadoFirma: 'PENDIENTE',
    historial: [{ id: 'hist_1', fecha: '2026-10-01T10:00:00.000Z', usuario: 'Propietario', accion: 'CREADA', version: 1 }],
    creadoPor: 'Propietario',
    ...sobrescribir,
  };
}

const FIRMA_FALSIFICADA = {
  id: 'firma_falsa',
  actaId: 'acta_reglas_1',
  versionActa: 1,
  firmanteId: 'part_inq',
  firmanteNombre: 'Inquilino Sintético',
  firmanteRol: 'ARRENDATARIO',
  estado: 'FIRMADA',
  metodo: 'OTP',
  fechaFirma: '2026-10-02T10:00:00.000Z',
};

const OTP = {
  id: 'otp_reglas_1',
  actaId: 'acta_reglas_1',
  firmaId: 'firma_falsificada',
  ownerId: PROPIETARIO_ID,
  codigoHash: 'a'.repeat(64),
  codigoSalt: 'b'.repeat(32),
  algoritmoHash: 'SHA-256_SALTED',
  fechaCreacion: '2026-10-01T10:00:00.000Z',
  fechaExpiracion: '2026-10-01T10:15:00.000Z',
  intentos: 0,
  maxIntentos: 5,
  usado: false,
  estado: 'ACTIVO',
  transporteRealizado: true,
};

beforeEach(async () => {
  await env.clearFirestore();
  await escribirAdmin({
    [`usuarios_auth/${UID_PROPIETARIO}`]: {
      tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', usuarioId: 'u_prop_actas',
      authUid: UID_PROPIETARIO, propietarioId: PROPIETARIO_ID, inmuebleIds: ['inm_reglas_1'],
    },
    'usuarios/u_prop_actas': {
      authUid: UID_PROPIETARIO, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO',
      propietarioId: PROPIETARIO_ID, inmuebleIds: ['inm_reglas_1'],
    },
    [`usuarios_auth/${UID_MASTER}`]: { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', usuarioId: 'u_master_actas', authUid: UID_MASTER },
    'usuarios/u_master_actas': { authUid: UID_MASTER, estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' },
    'actas/acta_reglas_1': acta(),
    'actas_otp/otp_reglas_1': OTP,
  });
});

const propietario = () => env.authenticatedContext(UID_PROPIETARIO, {
  email: 'prop-actas@example.invalid',
  email_verified: true,
}).firestore();

const master = () => env.authenticatedContext(UID_MASTER, {
  email: EMAIL_MASTER,
  email_verified: true,
}).firestore();

const anonimo = () => env.unauthenticatedContext().firestore();

describe('actas_otp · material del servidor', () => {
  it('el propietario NO puede crear, actualizar ni borrar un OTP', async () => {
    await assertFails(propietario().doc('actas_otp/otp_nuevo').set({ ...OTP, id: 'otp_nuevo' }));
    await assertFails(propietario().doc('actas_otp/otp_reglas_1').update({ usado: true, estado: 'USADO' }));
    await assertFails(propietario().doc('actas_otp/otp_reglas_1').delete());
  });

  it('el propietario NO puede leer el hash ni listar la colección', async () => {
    await assertFails(propietario().doc('actas_otp/otp_reglas_1').get());
  });

  it('el master puede leer para diagnóstico y sigue sin poder escribir', async () => {
    await assertSucceeds(master().doc('actas_otp/otp_reglas_1').get());
    await assertFails(master().doc('actas_otp/otp_reglas_1').update({ usado: true }));
    await assertFails(master().doc('actas_otp/otp_reglas_1').delete());
  });

  it('un anónimo no puede leer ni escribir actas_otp', async () => {
    await assertFails(anonimo().doc('actas_otp/otp_reglas_1').get());
    await assertFails(anonimo().doc('actas_otp/otp_anonimo').set(OTP));
  });
});

describe('actas · la evidencia de firma sólo la escribe el servidor', () => {
  it('el propietario NO puede añadir una firma firmada', async () => {
    await assertFails(propietario().doc('actas/acta_reglas_1').update({
      firmas: [FIRMA_FALSIFICADA],
      version: 2,
    }));
  });

  it('el propietario NO puede cambiar estadoFirma ni fechaFirma', async () => {
    await assertFails(propietario().doc('actas/acta_reglas_1').update({ estadoFirma: 'FIRMADA', version: 2 }));
    await assertFails(propietario().doc('actas/acta_reglas_1').update({
      fechaFirma: '2026-10-02T10:00:00.000Z',
      version: 2,
    }));
  });

  it('el propietario NO puede declarar el acta FIRMADA', async () => {
    await assertFails(propietario().doc('actas/acta_reglas_1').update({ estado: 'FIRMADA', version: 2 }));
  });

  it('el propietario SÍ puede editar observaciones y subir versión', async () => {
    await assertSucceeds(propietario().doc('actas/acta_reglas_1').update({
      observaciones: 'Revisado con las partes',
      version: 2,
      fechaActualizacion: '2026-10-02T10:00:00.000Z',
    }));
  });

  it('no se puede crear un acta con firmas ni con estado de firma cerrado', async () => {
    await assertFails(propietario().doc('actas/acta_nueva').set(acta({
      id: 'acta_nueva',
      firmas: [FIRMA_FALSIFICADA],
    })));
    await assertFails(propietario().doc('actas/acta_nueva').set(acta({
      id: 'acta_nueva',
      estadoFirma: 'FIRMADA',
    })));
    await assertSucceeds(propietario().doc('actas/acta_nueva').set(acta({ id: 'acta_nueva' })));
  });

  it('un anónimo no puede leer ni escribir actas', async () => {
    await assertFails(anonimo().doc('actas/acta_reglas_1').get());
    await assertFails(anonimo().doc('actas/acta_anonima').set(acta({ id: 'acta_anonima' })));
  });
});
