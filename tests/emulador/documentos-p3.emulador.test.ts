/**
 * P3 — TRAZABILIDAD DOCUMENTAL contra los EMULADORES OFICIALES (Auth + Firestore + Storage).
 * -----------------------------------------------------------------------------
 * Qué certifica (con el motor real de reglas de `firestore.rules` y `storage.rules`):
 *  A · almacenamiento y recuperación de un documento profesional ficticio
 *      (bytes → huella SHA-256 → metadatos → relación con profesional/ámbito)
 *      y el comportamiento con Storage NO disponible (sin éxito ficticio).
 *  B · aislamiento: permitidos y denegados por cartera, gestor L/E, profesional,
 *      otro titular, referencias alteradas y binarios fuera de ámbito.
 *  C · expediente patrimonial y actas: referencias, huellas, coherencia
 *      estado ↔ disponibilidad real (pérdida y alteración del objeto), y
 *      trazabilidad en `audit_logs`.
 *  R · recuperación en OTRO PROCESO Node (spawnSync) con sesión e instancias nuevas.
 *
 * Código bajo prueba: el MISMO de la app. El adaptador de profesionales se
 * instancia con clientes apuntados a los emuladores (fábrica con dependencias).
 * Para `gestorFirebase` (expediente) y `firebaseActas` se sustituye SÓLO el
 * módulo `src/lib/firebase` por instancias del emulador (sin cargar la app
 * productiva) y `registrarAuditoriaFirestore` escribe en `audit_logs` DEL
 * EMULADOR bajo reglas. No hay mocks de Storage ni de reglas.
 *
 * Fail-closed: `validarEntornoP2()` antes de cualquier escritura (NODE_ENV=test,
 * proyecto `demo-gestor-reglas`, hosts 127.0.0.1 exactos, sin credenciales de
 * servicio). Datos 100 % sintéticos (`*.invalid`).
 *
 * ESTADO AG-03.2 (2026-10-20) — SUITE SUPERSEDIDA, PENDIENTE DE RE-ADAPTACIÓN.
 * Esta suite se escribió cuando el cliente subía/leía con el SDK de Storage y
 * `storage.rules` consultaba Firestore `(default)`. Desde AG-03.2:
 *  · el código de la app (adaptador de profesionales, expediente, actas) ya no
 *    usa el SDK: pasa por el motor mediado por el servidor (`/api/documentos/*`),
 *    que autoriza contra la base Firestore CON NOMBRE;
 *  · `storage.rules` ya no concede acceso directo a ningún prefijo privado, por
 *    lo que las expectativas «SDK del titular permitido / ajeno denegado» de
 *    esta suite dejaron de describir la arquitectura.
 * El flujo mediado se certifica en `documentos-servidor.emulador.test.ts` y las
 * reglas en `storage-ambitos.emulador.test.ts`.
 *
 * AG-03.3: la suite queda OMITIDA de forma explícita y visible (vitest la
 * lista como «skipped» con este motivo en el nombre), no fallida: un fallo de
 * módulo hacía rojo el job de emuladores aunque las suites vigentes pasaran y
 * ocultaba sus resultados. La re-adaptación sigue PENDIENTE y, además, los
 * destinos con token rotatorio (P3/P5) no pueden ejercitarse en el emulador
 * v15.33.0 (sin `PATCH` bajo `/storage/v1/`). `P3_EMULADOR_FORZAR=1` la
 * ejecuta igualmente (fallará: describe la arquitectura anterior).
 */
const P3_SUPERSEDIDA = !process.env.P3_EMULADOR_FORZAR;
const MOTIVO_P3 = 'P3_EMULADOR_SUPERSEDIDA_AG03_2: custodia por SDK anterior a AG-03.2; pendiente de re-adaptación al flujo mediado por el servidor '
  + '(cubierto por documentos-servidor.emulador.test.ts, storage-ambitos.emulador.test.ts y tests/integracion-custodia-documental-extremo-a-extremo.test.ts)';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, deleteObject, getBytes, getMetadata, getStorage, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { crearAdaptadorDocumentosProfesionales, type AdaptadorDocumentosProfesionales } from '../../src/lib/expedienteDocumental/documentosProfesionalesFirebase';
import { generarIdDocumentoProfesional } from '../../src/lib/expedienteDocumental/documentosProfesionales';
import { BUCKET_P2, PROYECTO_P2, fetchSoloEmuladores, validarEntornoP2 } from './justificantes-cobro.emulador-util';

// Sustitución controlada del módulo de instancias de la app (sólo esta suite).
const estado = vi.hoisted(() => ({ db: null as unknown, auth: null as unknown, storage: null as unknown }));
vi.mock('../../src/lib/firebase', async () => {
  const fs = await import('firebase/firestore');
  const limpiar = (o: unknown) => JSON.parse(JSON.stringify(o));
  return {
    get db() { return estado.db; },
    get auth() { return estado.auth; },
    get storage() { return estado.storage; },
    sanitizeObjectForFirestore: limpiar,
    registrarAuditoriaFirestore: async (log: Record<string, unknown>) => {
      const id = `audit_p3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await fs.setDoc(fs.doc(estado.db as Firestore, 'audit_logs', id), limpiar({ id, fechaHora: new Date().toISOString(), ...log }));
    },
  };
});

const RAIZ = resolve(__dirname, '../..');
const CLAVE = 'Solo-emulador-42!p3';
const RUN = randomUUID().slice(0, 8);
const PDF = new TextEncoder().encode(`%PDF-1.7\n% P3 documento profesional sintetico ${RUN}\n%%EOF`);
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

type Clave = 'titularA' | 'titularB' | 'gestorL' | 'gestorE' | 'prof1' | 'prof2';
const ID: Record<Clave, { email: string; usuarioId: string; tipoPerfil: string; propietarioId: string; profesionalId: string; extra?: Record<string, unknown> }> = {
  titularA: { email: `p3-titular-a-${RUN}@sintetico.invalid`, usuarioId: `usr-p3-a-${RUN}`, tipoPerfil: 'PROPIETARIO', propietarioId: `prop-p3-a-${RUN}`, profesionalId: '' },
  titularB: { email: `p3-titular-b-${RUN}@sintetico.invalid`, usuarioId: `usr-p3-b-${RUN}`, tipoPerfil: 'PROPIETARIO', propietarioId: `prop-p3-b-${RUN}`, profesionalId: '' },
  gestorL: { email: `p3-gestor-l-${RUN}@sintetico.invalid`, usuarioId: `usr-p3-l-${RUN}`, tipoPerfil: 'PROFESIONAL', propietarioId: '', profesionalId: `gl-${RUN}` },
  gestorE: { email: `p3-gestor-e-${RUN}@sintetico.invalid`, usuarioId: `usr-p3-e-${RUN}`, tipoPerfil: 'PROFESIONAL', propietarioId: '', profesionalId: `ge-${RUN}` },
  prof1: { email: `p3-prof-1-${RUN}@sintetico.invalid`, usuarioId: `usr-p3-p1-${RUN}`, tipoPerfil: 'PROFESIONAL', propietarioId: '', profesionalId: `pro1-${RUN}` },
  prof2: { email: `p3-prof-2-${RUN}@sintetico.invalid`, usuarioId: `usr-p3-p2-${RUN}`, tipoPerfil: 'PROFESIONAL', propietarioId: '', profesionalId: `pro2-${RUN}` },
};
ID.gestorL.extra = { carterasL: [ID.titularA.propietarioId] };
ID.gestorE.extra = { carterasE: [ID.titularA.propietarioId] };
const PRO_1 = ID.prof1.profesionalId; // creado por la cartera de A
const PRO_2 = ID.prof2.profesionalId; // creado por la cartera de B
const INM_A = `inm-p3-a-${RUN}`;
const INM_B = `inm-p3-b-${RUN}`;
const ACTA_A = `acta-p3-a-${RUN}`;

let env: RulesTestEnvironment;
const uids = new Map<Clave, string>();
const apps: FirebaseApp[] = [];
let contador = 0;

interface Sesion { auth: Auth; db: Firestore; storage: FirebaseStorage; uid: string; docs: AdaptadorDocumentosProfesionales }

function hostPuerto(variable: 'FIRESTORE_EMULATOR_HOST' | 'FIREBASE_STORAGE_EMULATOR_HOST' | 'FIREBASE_AUTH_EMULATOR_HOST') {
  const [host, puerto] = process.env[variable]!.split(':');
  return { host, port: Number(puerto) };
}

function auditarEn(db: Firestore) {
  return async (payload: object) => {
    const id = `audit_p3_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await setDoc(doc(db, 'audit_logs', id), JSON.parse(JSON.stringify({ id, fechaHora: new Date().toISOString(), ...payload })));
  };
}

async function abrirSesion(clave: Clave, opciones: { storageCaido?: boolean; crear?: boolean } = {}): Promise<Sesion> {
  const app = initializeApp({ projectId: PROYECTO_P2, apiKey: 'p3-demo-api-key', storageBucket: BUCKET_P2 }, `p3-${++contador}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const fsHp = hostPuerto('FIRESTORE_EMULATOR_HOST');
  connectFirestoreEmulator(db, fsHp.host, fsHp.port);
  const storage = getStorage(app);
  if (opciones.storageCaido) {
    // Puerto local sin servicio: Storage NO disponible (sin salir de 127.0.0.1).
    connectStorageEmulator(storage, '127.0.0.1', 9);
    storage.maxUploadRetryTime = 1500;
    storage.maxOperationRetryTime = 1500;
  } else {
    const stHp = hostPuerto('FIREBASE_STORAGE_EMULATOR_HOST');
    connectStorageEmulator(storage, stHp.host, stHp.port);
  }
  const cred = opciones.crear
    ? await createUserWithEmailAndPassword(auth, ID[clave].email, CLAVE)
    : await signInWithEmailAndPassword(auth, ID[clave].email, CLAVE);
  return { auth, db, storage, uid: cred.user.uid, docs: crearAdaptadorDocumentosProfesionales({ db, storage, auth, auditar: auditarEn(db) }) };
}

async function leerAdmin(ruta: string): Promise<Record<string, unknown> | undefined> {
  let salida: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(ruta).get();
    salida = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
  });
  return salida;
}

async function auditoriasDe(idAfectado: string): Promise<Record<string, unknown>[]> {
  let salida: Record<string, unknown>[] = [];
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().collection('audit_logs').where('idAfectado', '==', idAfectado).get();
    salida = snap.docs.map((d) => d.data() as Record<string, unknown>);
  });
  return salida;
}

/** Acceso ADMINISTRATIVO del emulador (Bearer owner, sólo 127.0.0.1) para simular pérdida/alteración. */
async function objetoAdmin(metodo: 'GET' | 'DELETE' | 'PUT', path: string, bytes?: Uint8Array): Promise<Uint8Array | null> {
  const base = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`;
  if (metodo === 'PUT') {
    const url = `${base}/upload/storage/v1/b/${encodeURIComponent(BUCKET_P2)}/o?uploadType=media&name=${encodeURIComponent(path)}`;
    const r = await fetchSoloEmuladores(url, { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/pdf' }, body: bytes });
    if (!r.ok) throw new Error(`P3_ADMIN_PUT_HTTP_${r.status}`);
    return null;
  }
  const url = `${base}/storage/v1/b/${encodeURIComponent(BUCKET_P2)}/o/${encodeURIComponent(path)}${metodo === 'GET' ? '?alt=media' : ''}`;
  const r = await fetchSoloEmuladores(url, { method: metodo, headers: { Authorization: 'Bearer owner' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`P3_ADMIN_${metodo}_HTTP_${r.status}`);
  return metodo === 'GET' ? new Uint8Array(await r.arrayBuffer!()) : null;
}

const rechazo = async (p: Promise<unknown>): Promise<string> => {
  try { await p; return 'PERMITIDO'; } catch (e) { return (e as { codigo?: string; code?: string }).codigo || (e as { code?: string }).code || 'ERROR'; }
};

const describeP3 = P3_SUPERSEDIDA ? describe.skip : describe;
if (P3_SUPERSEDIDA) {
  describe.skip(`P3 · SUITE OMITIDA — ${MOTIVO_P3}`, () => {
    it('pendiente de re-adaptación (V — pendiente de verificación en emulador)', () => undefined);
  });
}

beforeAll(async () => {
  if (P3_SUPERSEDIDA) return;
  // Guardia ANTES de cualquier escritura: aborta ante destinos productivos o ambiguos.
  validarEntornoP2();
  const fsHp = hostPuerto('FIRESTORE_EMULATOR_HOST');
  const stHp = hostPuerto('FIREBASE_STORAGE_EMULATOR_HOST');
  env = await initializeTestEnvironment({
    projectId: PROYECTO_P2,
    firestore: { rules: readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8'), ...fsHp },
    storage: { rules: readFileSync(resolve(RAIZ, 'storage.rules'), 'utf8'), ...stHp },
  });
  await env.clearFirestore();
  await env.clearStorage();
  for (const clave of Object.keys(ID) as Clave[]) {
    const s = await abrirSesion(clave, { crear: true });
    uids.set(clave, s.uid);
  }
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const clave of Object.keys(ID) as Clave[]) {
      const i = ID[clave];
      const uid = uids.get(clave)!;
      await db.doc(`usuarios/${i.usuarioId}`).set({ id: i.usuarioId, authUid: uid, email: i.email, estado: 'ACTIVO', tipoPerfil: i.tipoPerfil, propietarioId: i.propietarioId, profesionalId: i.profesionalId });
      await db.doc(`usuarios_auth/${uid}`).set({ usuarioId: i.usuarioId, tipoPerfil: i.tipoPerfil, estado: 'ACTIVO', propietarioId: i.propietarioId, profesionalId: i.profesionalId, inmuebleIds: [], ...(i.extra || {}) });
    }
    await db.doc(`profesionales/${PRO_1}`).set({ id: PRO_1, nombreComercial: 'Fontanería Sintética', creadoPorPropietarioId: ID.titularA.propietarioId, esPrivado: true });
    await db.doc(`profesionales/${PRO_2}`).set({ id: PRO_2, nombreComercial: 'Electricidad Sintética', creadoPorPropietarioId: ID.titularB.propietarioId, esPrivado: true });
    await db.doc(`inmuebles/${INM_A}`).set({ id: INM_A, propietarioId: ID.titularA.propietarioId, propietarioPrincipalId: ID.titularA.propietarioId, direccion: 'Calle Sintetica P3 1' });
    await db.doc(`inmuebles/${INM_B}`).set({ id: INM_B, propietarioId: ID.titularB.propietarioId, propietarioPrincipalId: ID.titularB.propietarioId, direccion: 'Calle Sintetica P3 2' });
    await db.doc(`actas/${ACTA_A}`).set({ id: ACTA_A, ownerId: ID.titularA.propietarioId, propertyId: INM_A, tipo: 'ENTRADA', estado: 'BORRADOR', version: 1 });
  });
}, 180_000);

afterAll(async () => {
  if (P3_SUPERSEDIDA) return;
  for (const app of apps) await deleteApp(app).catch(() => undefined);
  if (env) {
    await env.clearFirestore();
    await env.clearStorage();
    await env.cleanup();
  }
}, 120_000);

describeP3('P3 · entorno', () => {
  it('la guardia falla cerrada ante un proyecto o host no demo', () => {
    const previo = process.env.GCLOUD_PROJECT;
    process.env.GCLOUD_PROJECT = 'proyecto-productivo-ficticio';
    try { expect(() => validarEntornoP2()).toThrow(/P2_ACEPTACION_REQUIERE_EMULADORES_LOCALES_DEMO/); }
    finally { process.env.GCLOUD_PROJECT = previo; }
    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = 'storage.googleapis.com:443';
    try { expect(() => validarEntornoP2()).toThrow(); }
    finally { process.env.FIREBASE_STORAGE_EMULATOR_HOST = host; }
    expect(() => validarEntornoP2()).not.toThrow();
  });
});

let docAlmacenadoId = '';
let docAlmacenadoPath = '';

describeP3('P3 · A · almacenamiento, recuperación y fallo de Storage (emulador oficial)', () => {
  it('sube un documento profesional, recupera sus bytes, coincide la huella y los metadatos lo atan al profesional', async () => {
    const a = await abrirSesion('titularA');
    const { documento, duplicado } = await a.docs.subir({
      profesionalId: PRO_1, tipo: 'SEGURO_RC', nombre: 'Seguro RC sintetico.pdf',
      archivo: new Blob([PDF], { type: 'application/pdf' }), actorNombre: 'Titular A',
    });
    expect(duplicado).toBe(false);
    expect(documento.estado).toBe('DISPONIBLE');
    docAlmacenadoId = documento.id;
    docAlmacenadoPath = documento.storagePath;
    expect(documento.id).toBe(generarIdDocumentoProfesional(PRO_1, sha(PDF), 'SEGURO_RC'));
    expect(documento.storagePath).toBe(`profesionales/${PRO_1}/documentos/${documento.id}/Seguro_RC_sintetico.pdf`);

    // Bytes reales en Storage (lectura administrativa independiente del SDK que subió).
    const bytesAdmin = await objetoAdmin('GET', documento.storagePath);
    expect(bytesAdmin).not.toBeNull();
    expect(sha(bytesAdmin!)).toBe(sha(PDF));
    // Metadatos persistidos en Firestore (lectura administrativa).
    const meta = await leerAdmin(`profesionales/${PRO_1}/documentos_profesionales/${documento.id}`);
    expect(meta).toMatchObject({
      id: documento.id, profesionalId: PRO_1, estado: 'DISPONIBLE', sha256: sha(PDF), tamanoBytes: PDF.byteLength,
      mimeType: 'application/pdf', storagePath: documento.storagePath, actorId: a.uid,
    });
    expect(JSON.stringify(meta)).not.toMatch(/data:|base64|downloadUrl|token=/i);
    // Metadatos del objeto: atados a documento, profesional y huella.
    const om = await getMetadata(ref(a.storage, documento.storagePath));
    expect(om.customMetadata).toEqual({ documentoId: documento.id, profesionalId: PRO_1, sha256: sha(PDF) });
    // Recuperación por el adaptador (reglas de Storage + verificación de huella).
    const descarga = await a.docs.descargar(PRO_1, documento.id);
    expect(sha(descarga.bytes)).toBe(sha(PDF));
    expect(descarga.verificacion.estado).toBe('VERIFICADO');
    // Idempotencia: misma subida no duplica.
    const otra = await a.docs.subir({ profesionalId: PRO_1, tipo: 'SEGURO_RC', nombre: 'Seguro RC sintetico.pdf', archivo: new Blob([PDF], { type: 'application/pdf' }) });
    expect(otra.duplicado).toBe(true);
  });

  it('con Storage NO disponible: error explícito, metadato ERROR_STORAGE, ningún objeto y nunca DISPONIBLE; el reintento recupera', async () => {
    const caido = await abrirSesion('titularA', { storageCaido: true });
    const contenido = new TextEncoder().encode(`%PDF-1.7\n% P3 IAE ${RUN}\n%%EOF`);
    const resultado = await rechazo(caido.docs.subir({ profesionalId: PRO_1, tipo: 'ALTA_IAE', nombre: 'iae.pdf', archivo: new Blob([contenido], { type: 'application/pdf' }) }));
    expect(resultado).toBe('STORAGE_NO_DISPONIBLE');
    const id = generarIdDocumentoProfesional(PRO_1, sha(contenido), 'ALTA_IAE');
    const meta = await leerAdmin(`profesionales/${PRO_1}/documentos_profesionales/${id}`);
    expect(meta).toMatchObject({ estado: 'ERROR_STORAGE', motivoError: 'SUBIDA_FALLIDA' });
    expect(await objetoAdmin('GET', String(meta!.storagePath))).toBeNull();
    // Una descarga NO es posible: no se presenta como almacenado.
    const sano = await abrirSesion('titularA');
    expect(await rechazo(sano.docs.descargar(PRO_1, id))).toBe('DOCUMENTO_NO_DISPONIBLE');
    // Sin bytes: denegado por reglas (no DISPONIBLE) o inexistente, según el orden de evaluación del emulador.
    expect(['storage/unauthorized', 'storage/object-not-found']).toContain(await rechazo(getBytes(ref(sano.storage, String(meta!.storagePath)))));
    const errores = (await auditoriasDe(PRO_1)).filter((x) => x.resultado === 'ERROR' && (x.detalles as { documentoId?: string })?.documentoId === id);
    expect(errores.length).toBeGreaterThan(0);
    // Reintento con Storage disponible: mismo ID, ahora DISPONIBLE y verificable.
    const rec = await sano.docs.subir({ profesionalId: PRO_1, tipo: 'ALTA_IAE', nombre: 'iae.pdf', archivo: new Blob([contenido], { type: 'application/pdf' }) });
    expect(rec.documento.id).toBe(id);
    expect(rec.documento.estado).toBe('DISPONIBLE');
    expect((await sano.docs.verificar(PRO_1, id)).estado).toBe('VERIFICADO');
    expect(await leerAdmin(`profesionales/${PRO_1}/documentos_profesionales/${id}`)).not.toHaveProperty('motivoError');
  });
});

describeP3('P3 · B · aislamiento y permisos (permitidos y denegados)', () => {
  it('lectura/descarga: titular, gestor L, gestor E y el propio profesional sí; otro titular y otro profesional no', async () => {
    for (const clave of ['gestorL', 'gestorE', 'prof1'] as Clave[]) {
      const s = await abrirSesion(clave);
      const d = await s.docs.descargar(PRO_1, docAlmacenadoId);
      expect(sha(d.bytes), clave).toBe(sha(PDF));
    }
    for (const clave of ['titularB', 'prof2'] as Clave[]) {
      const s = await abrirSesion(clave);
      expect(await rechazo(s.docs.descargar(PRO_1, docAlmacenadoId)), clave).toBe('permission-denied');
      expect(await rechazo(getBytes(ref(s.storage, docAlmacenadoPath))), clave).toBe('storage/unauthorized');
    }
  });

  it('escritura: gestor E y el propio profesional suben; lector L, otro titular y otro profesional no (ni metadato ni binario)', async () => {
    const subir = (s: Sesion, texto: string) => s.docs.subir({
      profesionalId: PRO_1, tipo: 'OTRO', nombre: `${texto}.pdf`,
      archivo: new Blob([new TextEncoder().encode(`%PDF-1.7\n${texto} ${RUN}`)], { type: 'application/pdf' }),
    });
    expect((await subir(await abrirSesion('gestorE'), 'gestor-e')).documento.estado).toBe('DISPONIBLE');
    expect((await subir(await abrirSesion('prof1'), 'propio')).documento.estado).toBe('DISPONIBLE');
    for (const clave of ['gestorL', 'titularB', 'prof2'] as Clave[]) {
      const texto = `denegado-${clave}`;
      expect(await rechazo(subir(await abrirSesion(clave), texto)), clave).toBe('permission-denied');
      const id = generarIdDocumentoProfesional(PRO_1, sha(new TextEncoder().encode(`%PDF-1.7\n${texto} ${RUN}`)), 'OTRO');
      expect(await leerAdmin(`profesionales/${PRO_1}/documentos_profesionales/${id}`), clave).toBeUndefined();
    }
  });

  it('sustitución, eliminación y escritura directa del binario fuera de ámbito: denegadas', async () => {
    const b = await abrirSesion('titularB');
    // sobrescribir el binario DISPONIBLE de otro titular con metadatos "correctos"
    expect(await rechazo(uploadBytes(ref(b.storage, docAlmacenadoPath), new TextEncoder().encode('%PDF-1.7\nfalso'), {
      contentType: 'application/pdf', customMetadata: { documentoId: docAlmacenadoId, profesionalId: PRO_1, sha256: sha(PDF) },
    }))).toBe('storage/unauthorized');
    expect(await rechazo(deleteObject(ref(b.storage, docAlmacenadoPath)))).toBe('storage/unauthorized');
    expect(await rechazo(b.docs.eliminar(PRO_1, docAlmacenadoId))).toBe('permission-denied');
    // ni siquiera el propio titular puede reescribir el binario de un documento DISPONIBLE
    const a = await abrirSesion('titularA');
    expect(await rechazo(uploadBytes(ref(a.storage, docAlmacenadoPath), new TextEncoder().encode('%PDF-1.7\notro'), {
      contentType: 'application/pdf', customMetadata: { documentoId: docAlmacenadoId, profesionalId: PRO_1, sha256: sha(PDF) },
    }))).toBe('storage/unauthorized');
    // el gestor E escribe pero no elimina
    expect(await rechazo((await abrirSesion('gestorE')).docs.eliminar(PRO_1, docAlmacenadoId))).toBe('permission-denied');
    expect((await objetoAdmin('GET', docAlmacenadoPath)) && sha((await objetoAdmin('GET', docAlmacenadoPath))!)).toBe(sha(PDF));
  });

  it('alterar referencias para vincular archivos a expedientes ajenos: denegado', async () => {
    const a = await abrirSesion('titularA');
    // metadato bajo el profesional de OTRA cartera
    expect(await rechazo(a.docs.subir({ profesionalId: PRO_2, tipo: 'OTRO', nombre: 'ajeno.pdf', archivo: new Blob([PDF], { type: 'application/pdf' }) }))).toBe('permission-denied');
    // redirigir la ruta del metadato a otro profesional / cambiar la huella
    const metaRef = doc(a.db, 'profesionales', PRO_1, 'documentos_profesionales', docAlmacenadoId);
    expect(await rechazo(updateDoc(metaRef, { storagePath: `profesionales/${PRO_2}/documentos/${docAlmacenadoId}/x.pdf` }))).toBe('permission-denied');
    expect(await rechazo(updateDoc(metaRef, { sha256: 'f'.repeat(64) }))).toBe('permission-denied');
    expect(await rechazo(updateDoc(metaRef, { profesionalId: PRO_2 }))).toBe('permission-denied');
    // crear un metadato que declare un actor distinto del autenticado
    const idFalso = generarIdDocumentoProfesional(PRO_1, 'a'.repeat(64), 'OTRO');
    expect(await rechazo(setDoc(doc(a.db, 'profesionales', PRO_1, 'documentos_profesionales', idFalso), {
      id: idFalso, profesionalId: PRO_1, tipo: 'OTRO', nombre: 'x.pdf', nombreStorage: 'x.pdf', mimeType: 'application/pdf',
      tamanoBytes: 10, sha256: 'a'.repeat(64), storagePath: `profesionales/${PRO_1}/documentos/${idFalso}/x.pdf`,
      fechaIncorporacion: '2026-10-19T00:00:00.000Z', actorId: 'otro-uid', actorNombre: 'Suplantado', version: 1, estado: 'PENDIENTE_STORAGE',
    }))).toBe('permission-denied');
    // un PROFESIONAL (personal) no reasigna la cartera de una ficha
    const p2 = await abrirSesion('prof2');
    expect(await rechazo(updateDoc(doc(p2.db, 'profesionales', PRO_1), { creadoPorPropietarioId: ID.titularB.propietarioId }))).toBe('permission-denied');
    expect((await leerAdmin(`profesionales/${PRO_1}`))?.creadoPorPropietarioId).toBe(ID.titularA.propietarioId);
  });
});

describeP3('P3 · C · expediente patrimonial y actas: referencias, huellas, disponibilidad real y trazabilidad', () => {
  it('expediente: alta → descarga verificada → pérdida detectada (ERROR_STORAGE) → recuperación → alteración detectada', async () => {
    const a = await abrirSesion('titularA');
    estado.db = a.db; estado.auth = a.auth; estado.storage = a.storage;
    const gestor = await import('../../src/lib/expedienteDocumental/gestorFirebase');
    const contenido = new TextEncoder().encode(`%PDF-1.7\n% P3 factura ${RUN}\n%%EOF`);
    const alta = await gestor.subirDocumentoPatrimonial({ inmuebleId: INM_A, tipo: 'OTRO', archivo: new Blob([contenido], { type: 'application/pdf' }), nombre: 'factura.pdf', actorNombre: 'Titular A' });
    expect(alta.documento.estado).toBe('DISPONIBLE');
    expect(alta.documento.sha256).toBe(sha(contenido));
    expect(sha((await objetoAdmin('GET', alta.documento.storagePath))!)).toBe(sha(contenido));
    const ok = await gestor.descargarDocumentoPatrimonial(INM_A, alta.documento.id);
    expect(ok.verificacion.estado).toBe('VERIFICADO');

    // Otro titular no lee la referencia ni el binario del expediente ajeno.
    const b = await abrirSesion('titularB');
    expect(await rechazo(getDoc(doc(b.db, 'inmuebles', INM_A, 'documentos_patrimoniales', alta.documento.id)))).toBe('permission-denied');
    expect(await rechazo(getBytes(ref(b.storage, alta.documento.storagePath)))).toBe('storage/unauthorized');

    // Pérdida del objeto: la verificación NO la oculta tras los metadatos.
    await objetoAdmin('DELETE', alta.documento.storagePath);
    expect(await gestor.verificarDocumentoPatrimonial(INM_A, alta.documento.id)).toEqual({ estado: 'OBJETO_AUSENTE' });
    expect((await leerAdmin(`inmuebles/${INM_A}/documentos_patrimoniales/${alta.documento.id}`))?.estado).toBe('ERROR_STORAGE');
    // Recuperación: re-subir el MISMO archivo (create atado a la huella).
    const rec = await gestor.subirDocumentoPatrimonial({ inmuebleId: INM_A, tipo: 'OTRO', archivo: new Blob([contenido], { type: 'application/pdf' }), nombre: 'factura.pdf', actorNombre: 'Titular A' });
    expect(rec.documento).toMatchObject({ id: alta.documento.id, estado: 'DISPONIBLE' });
    expect((await gestor.verificarDocumentoPatrimonial(INM_A, alta.documento.id)).estado).toBe('VERIFICADO');
    // Alteración del objeto: detectada y no entregada.
    await objetoAdmin('PUT', alta.documento.storagePath, new TextEncoder().encode('%PDF-1.7\nALTERADO'));
    expect((await gestor.verificarDocumentoPatrimonial(INM_A, alta.documento.id)).estado).toBe('INTEGRIDAD_DISCREPANTE');
    expect((await leerAdmin(`inmuebles/${INM_A}/documentos_patrimoniales/${alta.documento.id}`))?.estado).toBe('ERROR_STORAGE');

    const trazas = await auditoriasDe(alta.documento.id);
    const acciones = trazas.map((t) => `${t.accion}:${t.resultado}`);
    expect(acciones).toContain('EXPEDIENTE_DOCUMENTO_INCORPORADO:EXITO');
    expect(acciones).toContain('EXPEDIENTE_DOCUMENTO_DESCARGADO:EXITO');
    expect(acciones).toContain('EXPEDIENTE_DOCUMENTO_DESCARGADO:ERROR');
  });

  it('actas: evidencia con huella en Storage privado; referencia vinculada a SU acta; ruta ajena denegada', async () => {
    const a = await abrirSesion('titularA');
    estado.db = a.db; estado.auth = a.auth; estado.storage = a.storage;
    const actas = await import('../../src/lib/firebaseActas');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode(RUN)]);
    const subida = await actas.uploadEvidenciaActaStorage(ID.titularA.propietarioId, ACTA_A, new Blob([png], { type: 'image/png' }), 'salon.png');
    expect(subida.sha256).toBe(sha(png));
    expect(subida.storagePath.startsWith(`actas_fotos/${ID.titularA.propietarioId}/${ACTA_A}/`)).toBe(true);
    const base = {
      id: `ev-p3-${RUN}`, actaId: ACTA_A, ownerId: ID.titularA.propietarioId, propertyId: INM_A, tipo: 'FOTO' as const,
      storagePath: subida.storagePath, downloadURL: subida.url, orden: 1, fechaHora: new Date().toISOString(),
      mimeType: 'image/png', tamanoBytes: subida.tamanoBytes, sha256: subida.sha256,
    };
    await actas.saveEvidenciaActaFirestore(base);
    expect((await leerAdmin(`actas_evidencias/${base.id}`))?.sha256).toBe(sha(png));
    expect(await actas.verificarArchivoActaStorage(subida.storagePath, { sha256: subida.sha256, tamanoBytes: subida.tamanoBytes })).toMatchObject({ estado: 'VERIFICADO' });
    // Referencia que apunta a un objeto de otro titular / otra acta: denegada.
    expect(await rechazo(actas.saveEvidenciaActaFirestore({ ...base, id: `ev-p3-x-${RUN}`, storagePath: `actas_fotos/${ID.titularB.propietarioId}/${ACTA_A}/x.png` }))).toBe('permission-denied');
    expect(await rechazo(actas.saveEvidenciaActaFirestore({ ...base, id: `ev-p3-y-${RUN}`, actaId: `acta-inexistente-${RUN}`, storagePath: `actas_fotos/${ID.titularA.propietarioId}/acta-inexistente-${RUN}/x.png` }))).toBe('permission-denied');
    // Otro titular no lee la evidencia en Storage.
    const b = await abrirSesion('titularB');
    expect(await rechazo(getBytes(ref(b.storage, subida.storagePath)))).toBe('storage/unauthorized');
    // Pérdida del objeto de acta: verificación lo reporta.
    await objetoAdmin('DELETE', subida.storagePath);
    expect(await actas.verificarArchivoActaStorage(subida.storagePath, { sha256: subida.sha256 })).toEqual({ estado: 'OBJETO_AUSENTE' });
  });

  it('trazabilidad del documento profesional: alta, descarga, error y recuperación quedan en audit_logs', async () => {
    const trazas = await auditoriasDe(PRO_1);
    const acciones = new Set(trazas.map((t) => `${t.accion}:${t.resultado}`));
    expect(acciones.has('EXPEDIENTE_DOCUMENTO_INCORPORADO:EXITO')).toBe(true);
    expect(acciones.has('EXPEDIENTE_DOCUMENTO_DESCARGADO:EXITO')).toBe(true);
    expect(acciones.has('EXPEDIENTE_INCIDENCIA:ERROR')).toBe(true);
    for (const t of trazas) {
      expect(t.entidadAfectada).toBe('profesional');
      expect(typeof t.usuarioId).toBe('string');
      expect(JSON.stringify(t)).not.toMatch(/data:|base64/i);
    }
  });
});

describeP3('P3 · R · recuperación en OTRO proceso Node (sesión e instancias nuevas)', () => {
  it('un proceso independiente descarga y verifica la huella; otro titular sigue denegado', () => {
    const ejecutar = (clave: Clave) => spawnSync(process.execPath, [
      '--import', 'tsx', 'tests/emulador/documentos-p3-recuperacion.proceso.ts',
      ID[clave].email, CLAVE, PRO_1, docAlmacenadoId,
    ], { cwd: RAIZ, env: process.env, encoding: 'utf8', timeout: 90_000 });
    const ok = ejecutar('titularA');
    expect(ok.status, ok.stderr).toBe(0);
    const salida = JSON.parse(ok.stdout) as { ok: boolean; pid: number; sha256: string; size: number; verificacion: string };
    expect(salida).toMatchObject({ ok: true, sha256: sha(PDF), size: PDF.byteLength, verificacion: 'VERIFICADO' });
    expect(salida.pid).not.toBe(process.pid);
    const denegado = ejecutar('titularB');
    expect(denegado.status).toBe(2);
    expect(JSON.parse(denegado.stdout)).toMatchObject({ ok: false, codigo: 'permission-denied' });
  }, 180_000);
});
