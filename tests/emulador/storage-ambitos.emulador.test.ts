/**
 * Storage OFICIAL (emulador) · `storage.rules` de AG-03.2 — sólo proyecto demo-gestor-reglas.
 *
 * Desde ORDEN AG-03.2 las reglas de Cloud Storage NO consultan Firestore
 * (ninguna base: ni `(default)` ni la base con nombre). Toda la autorización
 * documental la resuelve el servidor (`server/documentos/*`) contra la base
 * Firestore con nombre; las reglas sólo conceden la lectura pública del
 * catálogo de fotos (`inmuebles/{inmuebleId}/{fileName}`) y niegan todo lo demás
 * al SDK de cliente, sea quien sea (titular, cartera, master, anónimo).
 *
 * Esta matriz certifica, con el MOTOR REAL de reglas del emulador:
 *  · ningún prefijo documental privado es accesible por el SDK de cliente;
 *  · la foto de catálogo se lee sin sesión pero no se escribe ni se enumera;
 *  · el resultado NO depende de lo que haya en Firestore (con o sin espejo).
 * Sin FIREBASE_STORAGE_EMULATOR_HOST y FIRESTORE_EMULATOR_HOST falla en voz
 * alta; ningún mock ni red de producción sustituye al motor de reglas.
 *
 * Estado: reescrita en AG-03.2 sin emulador disponible en el entorno de
 * desarrollo (V — pendiente de ejecución con `npm run test:emulador:reglas`).
 * El flujo mediado por el servidor se cubre en `documentos-servidor.emulador.test.ts`.
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
const BYTES = new Uint8Array([37, 80, 68, 70, 45, 49]);
const MASTER: SesionSintetica = { uid: 'admin-sintetico', email: 'sarqsan2@gmail.com' };
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
/** Siembra un objeto SIN reglas (como lo haría el servidor con la cuenta de servicio). */
async function sembrarObjeto(ruta: string, contentType = 'application/pdf'): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(ruta).put(BYTES, { contentType });
  });
}

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
  // El espejo y las fichas EXISTEN en Firestore: las reglas ya no los miran, y
  // el resultado debe ser idéntico al del caso sin espejo (ver última prueba).
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (const [ruta, datos] of Object.entries(mundoSintetico())) {
      await ctx.firestore().doc(ruta).set(datos);
    }
  });
});

const PRIVADAS = [
  'gastos_facturas/prop-a/gasto-1/justificante.pdf',
  'cobros_justificantes/prop-a/cobro-1/justificante.pdf',
  'recibos/contrato-a/cobro-1/recibo.pdf',
  'contratos/contrato-a/anexo.pdf',
  'inmuebles/inm-a1/documentos_patrimoniales/doc-1/escritura.pdf',
  'inmuebles/inm-a1/inventario/mueble.jpg',
  'profesionales/pro-1/documentos/doc-1/seguro.pdf',
  'documentos_solicitados/sol-1/dni.pdf',
  'morosidad_evidencias/prop-a/contrato-a/evidencia.pdf',
  'incidencias/inc-1/evidencias/foto.jpg',
  'suministros/sum-1/lecturas/lectura.jpg',
  'presupuestos/pres-1/factura.pdf',
];

describe('Storage oficial · reglas AG-03.2 (sin consultas a Firestore)', () => {
  it('ningún prefijo privado se crea desde el SDK de cliente: ni titular, ni ajeno, ni master, ni anónimo', async () => {
    for (const ruta of PRIVADAS) {
      for (const sesion of [TITULAR_A, TITULAR_B, MASTER, undefined]) {
        await assertFails(subir(ruta, sesion, ruta.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf'));
      }
    }
  });

  it('ningún prefijo privado se lee, enumera ni borra desde el SDK de cliente aunque el objeto exista y se conozca la ruta (R-5)', async () => {
    for (const ruta of PRIVADAS) {
      await sembrarObjeto(ruta, ruta.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf');
      for (const sesion of [TITULAR_A, TITULAR_B, MASTER, undefined]) {
        await assertFails(archivo(ruta, sesion).getMetadata());
        await assertFails(archivo(ruta, sesion).getDownloadURL());
        await assertFails(archivo(ruta, sesion).delete());
      }
      const carpeta = ruta.slice(0, ruta.lastIndexOf('/'));
      await assertFails(storage(TITULAR_A).ref(carpeta).listAll());
      await assertFails(storage(MASTER).ref(carpeta).listAll());
    }
  });

  it('la foto de catálogo se lee sin sesión; no se crea, sobrescribe, borra ni enumera desde el cliente', async () => {
    const foto = 'inmuebles/inm-a1/portada.jpg';
    await sembrarObjeto(foto, 'image/jpeg');
    expect((await assertSucceeds(archivo(foto).getMetadata())).size).toBe(BYTES.length);
    await assertSucceeds(archivo(foto, TITULAR_B).getMetadata());
    await assertFails(subir('inmuebles/inm-a1/otra.jpg', TITULAR_A, 'image/jpeg'));
    await assertFails(subir(foto, TITULAR_A, 'image/jpeg'));
    await assertFails(subir(foto, MASTER, 'image/jpeg'));
    await assertFails(archivo(foto, TITULAR_A).delete());
    await assertFails(storage().ref('inmuebles/inm-a1').listAll());
    await assertFails(storage(TITULAR_A).ref('inmuebles/inm-a1').listAll());
    // El inventario cuelga de `inmuebles/{id}/…` pero NO es el catálogo: privado.
    const privado = 'inmuebles/inm-a1/inventario/mueble.jpg';
    await sembrarObjeto(privado, 'image/jpeg');
    await assertFails(archivo(privado).getMetadata());
    await assertFails(archivo(privado, TITULAR_A).getMetadata());
  });

  it('el portal de candidatos ya no sube de forma anónima por reglas: la vía es el servidor con el token de la solicitud', async () => {
    await assertFails(subir('documentos_solicitados/sol-1/dni.pdf'));
    await assertFails(subir('documentos_solicitados/sol-1/dni.pdf', undefined, 'image/jpeg'));
    await assertFails(subir('documentos_solicitados/sol-1/nested/dni.pdf'));
  });

  it('las decisiones no dependen de Firestore: con la base vacía el resultado es el mismo', async () => {
    await env.clearFirestore();
    const foto = 'inmuebles/inm-a1/portada.jpg';
    await sembrarObjeto(foto, 'image/jpeg');
    await assertSucceeds(archivo(foto).getMetadata());
    const privada = PRIVADAS[0];
    await sembrarObjeto(privada);
    await assertFails(subir(privada, TITULAR_A));
    await assertFails(archivo(privada, TITULAR_A).getMetadata());
    await assertFails(archivo(privada, MASTER).getMetadata());
  });
});
