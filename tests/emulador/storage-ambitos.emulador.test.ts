/**
 * Storage + Firestore oficiales, solo proyecto demo-gestor-reglas.
 *
 * Esta matriz prueba las rutas que consultan Firestore usando `(default)`;
 * NO acredita que esas mismas lecturas funcionen con la base CON NOMBRE
 * declarada para la app en firebase.json. Esa discrepancia permanece abierta.
 * Sin FIREBASE_STORAGE_EMULATOR_HOST y FIRESTORE_EMULATOR_HOST se falla en voz
 * alta; ningún mock ni red de producción sustituye al motor de reglas.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { mundoSintetico, TITULAR_A, TITULAR_B, type SesionSintetica } from './mundoSintetico';

const RAIZ = resolve(__dirname, '../..');
const FIRESTORE = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const STORAGE = readFileSync(resolve(RAIZ, 'storage.rules'), 'utf8');
const PROYECTO = 'demo-gestor-reglas';
const BASE_NOMBRADA = (JSON.parse(readFileSync(resolve(RAIZ, 'firebase.json'), 'utf8')) as {
  firestore: { database: string }[];
}).firestore[0].database;
const BYTES = new Uint8Array([37, 80, 68, 70, 45, 49]);
let env: RulesTestEnvironment;

function hostYPort(envVar: 'FIRESTORE_EMULATOR_HOST' | 'FIREBASE_STORAGE_EMULATOR_HOST') {
  const value = process.env[envVar];
  if (!value) throw new Error(`${envVar} ausente: requiere el emulador oficial, no se omite`);
  const [host, puerto] = value.split(':');
  if (!host || !Number(puerto)) throw new Error(`${envVar} debe ser host:puerto`);
  return { host, port: Number(puerto) };
}

const storage = (sesion?: SesionSintetica) => sesion
  ? env.authenticatedContext(sesion.uid, { email: sesion.email, email_verified: true }).storage()
  : env.unauthenticatedContext().storage();
const archivo = (ruta: string, sesion?: SesionSintetica) => storage(sesion).ref(ruta);
const subir = (ruta: string, sesion?: SesionSintetica, contentType = 'application/pdf') =>
  Promise.resolve(archivo(ruta, sesion).put(BYTES, { contentType }));

beforeAll(async () => {
  const firestore = hostYPort('FIRESTORE_EMULATOR_HOST');
  const storage = hostYPort('FIREBASE_STORAGE_EMULATOR_HOST');
  env = await initializeTestEnvironment({
    projectId: PROYECTO,
    firestore: { rules: FIRESTORE, ...firestore },
    storage: { rules: STORAGE, ...storage },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearStorage();
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [ruta, datos] of Object.entries(mundoSintetico())) {
      await ctx.firestore().doc(ruta).set(datos);
    }
  });
});

describe('Storage oficial · ámbitos y rutas (Firestore (default) sintético)', () => {
  it('factura privada: titular autorizado sí; ajeno y anónimo ni leen ni crean', async () => {
    const ruta = 'gastos_facturas/prop-a/gasto-1/justificante.pdf';
    await assertFails(subir(ruta, TITULAR_B));
    await assertFails(subir(ruta));
    await assertSucceeds(subir(ruta, TITULAR_A));
    expect((await assertSucceeds(archivo(ruta, TITULAR_A).getMetadata())).size).toBe(BYTES.length);
    await assertFails(archivo(ruta, TITULAR_B).getMetadata());
    await assertFails(archivo(ruta).getMetadata());
  });

  it('revocación del espejo y permisos L/E: lector no escribe; escritura solo para titular o cartera E', async () => {
    const ruta = 'gastos_facturas/prop-a/gasto-2/justificante.pdf';
    const lector = { uid: 'delegado-l', email: 'delegado-l@sintetico.invalid' };
    const gestor = { uid: 'delegado-e', email: 'delegado-e@sintetico.invalid' };
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const [sesion, cartera] of [[lector, 'carterasL'], [gestor, 'carterasE']] as const) {
        await db.doc(`usuarios/${sesion.uid}`).set({ authUid: sesion.uid, estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL' });
        await db.doc(`usuarios_auth/${sesion.uid}`).set({
          usuarioId: sesion.uid, tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO',
          propietarioId: 'prop-z', [cartera]: ['prop-a'],
        });
      }
    });
    await assertFails(subir(ruta, lector));
    await assertSucceeds(subir(ruta, gestor));
    await assertSucceeds(archivo(ruta, lector).getMetadata());
    await assertFails(archivo(ruta, TITULAR_B).getMetadata());
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`usuarios_auth/${TITULAR_A.uid}`).update({ estado: 'BLOQUEADO' });
    });
    await assertFails(archivo(ruta, TITULAR_A).getMetadata());
    await assertSucceeds(archivo(ruta, gestor).getMetadata());
  });

  it('la foto de catálogo es pública; el inventario no lo es aunque se conozca su ruta', async () => {
    const foto = 'inmuebles/inm-a1/portada.jpg';
    const privado = 'inmuebles/inm-a1/inventario/mueble.jpg';
    await assertFails(subir(foto, TITULAR_B, 'image/jpeg'));
    await assertSucceeds(subir(foto, TITULAR_A, 'image/jpeg'));
    await assertSucceeds(archivo(foto).getMetadata());
    await assertSucceeds(subir(privado, TITULAR_A, 'image/jpeg'));
    await assertFails(archivo(privado).getMetadata());
    await assertFails(archivo(privado, TITULAR_B).getMetadata());
    await assertSucceeds(archivo(privado, TITULAR_A).getMetadata());
  });

  it('documentación: create anónimo limitado a PDF/imagen y sin lectura anónima', async () => {
    const ruta = 'documentos_solicitados/sol-1/dni.pdf';
    await assertFails(subir(ruta, undefined, 'text/plain'));
    await assertSucceeds(subir(ruta));
    await assertFails(archivo(ruta).getMetadata());
    const master = { uid: 'admin-sintetico', email: 'sarqsan2@gmail.com' };
    await assertSucceeds(archivo(ruta, master).getMetadata());
    await assertFails(subir('documentos_solicitados/sol-1/nested/dni.pdf'));
  });

  it('la ruta sin regla no se abre por autenticar al usuario (R-5)', async () => {
    await assertFails(subir('presupuestos/pres-1/factura.pdf', TITULAR_A));
    await assertFails(subir('trabajos/trab-1/factura.pdf', TITULAR_A));
  });

  it('no confunde documentos solo en la base con nombre con el espejo en (default)', async () => {
    // REST del emulador, proyecto demo exclusivo. Authorization: owner es el
    // marcador administrativo del emulador, NO una credencial de producción.
    // Crear la ficha en la base nombrada y quitarla de (default) reproduce la
    // topología configurada sin afirmar que los datos productivos sean iguales.
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
    if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('Se exige un emulador local para la base con nombre');
    expect(BASE_NOMBRADA).not.toBe('(default)');
    const url = `http://${host}:${port}/v1/projects/${PROYECTO}/databases/${BASE_NOMBRADA}/documents/usuarios_auth/${TITULAR_A.uid}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {
        estado: { stringValue: 'ACTIVO' }, propietarioId: { stringValue: 'prop-a' },
        tipoPerfil: { stringValue: 'PROPIETARIO' },
      } }),
    });
    if (!response.ok) throw new Error(`El emulador no aceptó la base con nombre: HTTP ${response.status}`);
    const documento = await response.json() as { name: string };
    expect(documento.name).toContain(`/databases/${BASE_NOMBRADA}/documents/usuarios_auth/${TITULAR_A.uid}`);
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`usuarios_auth/${TITULAR_A.uid}`).delete();
    });
    // La ruta pide /(default)/: los documentos sembrados SOLO en la base con
    // nombre no deben hacer que una petición obtenga permisos por accidente.
    const ruta = 'gastos_facturas/prop-a/gasto-n/justificante.pdf';
    await assertFails(subir(ruta, TITULAR_A));

    // Sonda DIAGNÓSTICA solo del emulador: una regla alternativa con base
    // nombrada puede pasar aquí y NO estar admitida por Firebase publicado.
    // Jamás autoriza sustituir las rutas productivas sin una prueba autorizada
    // en entorno de aceptación y una decisión sobre los datos ya existentes.
    // No se escribe la regla alternativa en storage.rules del repositorio.
    const alterna = STORAGE.replaceAll('/databases/(default)/documents/', `/databases/${BASE_NOMBRADA}/documents/`);
    expect(alterna).not.toBe(STORAGE);
    const envNombrado = await initializeTestEnvironment({
      projectId: PROYECTO,
      firestore: { rules: FIRESTORE, ...hostYPort('FIRESTORE_EMULATOR_HOST') },
      storage: { rules: alterna, ...hostYPort('FIREBASE_STORAGE_EMULATOR_HOST') },
    });
    try {
      const cliente = envNombrado.authenticatedContext(TITULAR_A.uid, {
        email: TITULAR_A.email, email_verified: true,
      }).storage();
      await assertSucceeds(Promise.resolve(cliente.ref(ruta).put(BYTES, { contentType: 'application/pdf' })));
    } finally {
      await envNombrado.cleanup();
    }
  });
});
