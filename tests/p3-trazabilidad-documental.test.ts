/**
 * P3 — TRAZABILIDAD DOCUMENTAL (pruebas LOCALES, sin emulador).
 * ---------------------------------------------------------------------------
 * Clasificación explícita de cada sección (P3 §6 / §9.5):
 *  A · UNITARIA PURA: núcleo `documentosProfesionales.ts` (sin Firebase).
 *  B · UNITARIA CON DOBLES (MOCKS IDENTIFICADOS): orquestación del adaptador
 *      `documentosProfesionalesFirebase.ts` con Firestore/Storage en memoria.
 *      Prueba la LÓGICA (no hay éxito ficticio, estados, auditoría); NO
 *      certifica almacenamiento ni autorización real.
 *  C · AUTORIZACIÓN DOCUMENTAL DEL SERVIDOR (AG-03.2: la decisión ya no vive
 *      en storage.rules, que sólo puede leer la base `(default)`; se evalúa el
 *      autorizador real `server/documentos/autorizacionDocumental.ts` con el
 *      harness tests/helpers/autorizacionDocumentalHarness.ts).
 *  D · REGLAS DE FIRESTORE con el intérprete local (tests/harness/
 *      firestoreRulesEval.ts) sobre el TEXTO REAL de firestore.rules.
 * La certificación con los emuladores oficiales (Auth + Firestore + Storage)
 * está en tests/emulador/documentos-p3.emulador.test.ts.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// B · DOBLES de firebase/firestore y del motor de almacén mediado por el
//     servidor (`custodiaDocumental/almacenServidor`, AG-03.2) — sólo sección B.
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => ({
  firestore: new Map<string, Record<string, unknown>>(),
  storage: new Map<string, { bytes: Uint8Array; contentType?: string; customMetadata?: Record<string, string> }>(),
  storageCaido: false,
}));

vi.mock('firebase/firestore', () => {
  const path = (...segments: string[]) => segments.filter(Boolean).join('/');
  const BORRAR = { __borrar: true };
  const snap = (key: string) => {
    const value = mem.firestore.get(key);
    return { id: key.split('/').at(-1), exists: () => Boolean(value), data: () => (value ? structuredClone(value) : undefined) };
  };
  return {
    collection: (_db: unknown, ...parts: string[]) => ({ path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ path: path(...parts) }),
    getDoc: async (ref: { path: string }) => snap(ref.path),
    onSnapshot: () => () => undefined,
    query: (ref: { path: string }) => ref,
    where: (...args: unknown[]) => args,
    deleteField: () => BORRAR,
    runTransaction: async (_db: unknown, action: (tx: unknown) => Promise<unknown>) => action({
      get: async (ref: { path: string }) => snap(ref.path),
      set: (ref: { path: string }, data: Record<string, unknown>) => { mem.firestore.set(ref.path, structuredClone(data)); },
    }),
    updateDoc: async (ref: { path: string }, changes: Record<string, unknown>) => {
      const current = mem.firestore.get(ref.path);
      if (!current) throw new Error('not-found');
      const next: Record<string, unknown> = { ...current };
      for (const [k, v] of Object.entries(changes)) {
        if (v && typeof v === 'object' && (v as { __borrar?: boolean }).__borrar) delete next[k];
        else next[k] = v;
      }
      mem.firestore.set(ref.path, next);
    },
  };
});

vi.mock('../src/lib/custodiaDocumental/almacenServidor', () => ({
  ref: (_s: unknown, path: string) => ({ path, fullPath: path }),
  uploadBytes: async (r: { path: string }, bytes: Uint8Array, meta: { contentType?: string; customMetadata?: Record<string, string> }) => {
    if (mem.storageCaido) throw Object.assign(new Error('Storage no disponible'), { code: 'storage/retry-limit-exceeded' });
    mem.storage.set(r.path, { bytes: new Uint8Array(bytes), contentType: meta.contentType, customMetadata: meta.customMetadata });
    return { ref: r, metadata: { fullPath: r.path, size: bytes.byteLength, contentType: meta.contentType, customMetadata: meta.customMetadata || {} }, yaExistia: false };
  },
  getMetadata: async (r: { path: string }) => {
    const obj = mem.storage.get(r.path);
    if (!obj) throw Object.assign(new Error('not-found'), { code: 'storage/object-not-found' });
    return { fullPath: r.path, size: obj.bytes.byteLength, contentType: obj.contentType, customMetadata: obj.customMetadata || {} };
  },
  getBytes: async (r: { path: string }) => {
    const obj = mem.storage.get(r.path);
    if (!obj) throw Object.assign(new Error('not-found'), { code: 'storage/object-not-found' });
    return obj.bytes.slice().buffer;
  },
  deleteObject: async (r: { path: string }) => {
    if (!mem.storage.delete(r.path)) throw Object.assign(new Error('not-found'), { code: 'storage/object-not-found' });
  },
}));

import {
  clasificarDocumentoProfesionalHeredado,
  crearDocumentoProfesional,
  evaluarIntegridad,
  generarIdDocumentoProfesional,
  presentarEstadoDocumentoProfesional,
  rutaStorageDocumentoProfesional,
  validarTransicionDocumentoProfesional,
} from '../src/lib/expedienteDocumental/documentosProfesionales';
import { crearAdaptadorDocumentosProfesionales } from '../src/lib/expedienteDocumental/documentosProfesionalesFirebase';
import { EMAIL_MASTER } from '../server/titularidades/backendTitulares';
import { permiteServidor, type PeticionServidor, type RecursoEntrante, type Verbo } from './helpers/autorizacionDocumentalHarness';
/** Verbos de reglas Firestore (misma forma que los del autorizador documental). */
type Metodo = Verbo;
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';

const RAIZ = resolve(__dirname, '..');
const FIRESTORE_RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const sha = (texto: string | Uint8Array) => createHash('sha256').update(texto).digest('hex');

// ===========================================================================
// A · UNITARIA PURA
// ===========================================================================
describe('A · núcleo puro de documentos profesionales (unitaria, sin Firebase)', () => {
  const H = 'a'.repeat(64);
  const base = () => ({
    id: generarIdDocumentoProfesional('prof_1', H, 'SEGURO_RC'),
    profesionalId: 'prof_1', tipo: 'SEGURO_RC', nombre: 'Póliza RC 2026.pdf', mimeType: 'application/pdf',
    tamanoBytes: 10, sha256: H, fechaIncorporacion: '2026-10-19T00:00:00.000Z', actorId: 'uid_1', actorNombre: 'Ana',
  });

  it('ID determinista ligado a profesional + huella + tipo (+ versión sustituida)', () => {
    const id = generarIdDocumentoProfesional('prof_1', H, 'SEGURO_RC');
    expect(id).toMatch(/^dpr_[a-f0-9]{64}$/);
    expect(generarIdDocumentoProfesional('prof_1', H.toUpperCase(), 'SEGURO_RC')).toBe(id);
    expect(generarIdDocumentoProfesional('prof_2', H, 'SEGURO_RC')).not.toBe(id);
    expect(generarIdDocumentoProfesional('prof_1', H, 'ALTA_IAE')).not.toBe(id);
    expect(generarIdDocumentoProfesional('prof_1', H, 'SEGURO_RC', id)).not.toBe(id);
  });

  it('crea metadatos PENDIENTE_STORAGE con ruta canónica y sin URL ni Base64', () => {
    const d = crearDocumentoProfesional(base());
    expect(d.estado).toBe('PENDIENTE_STORAGE');
    expect(d.storagePath).toBe(rutaStorageDocumentoProfesional('prof_1', d.id, 'Poliza_RC_2026.pdf'));
    expect(JSON.stringify(d)).not.toMatch(/data:|base64|downloadUrl|https?:/i);
  });

  it('rechaza MIME vacío/no permitido, tipo desconocido, ID incoherente y profesional inválido', () => {
    expect(() => crearDocumentoProfesional({ ...base(), mimeType: '' })).toThrow(/PDF/);
    expect(() => crearDocumentoProfesional({ ...base(), mimeType: 'text/html' })).toThrow(/PDF/);
    expect(() => crearDocumentoProfesional({ ...base(), tipo: 'MALWARE' })).toThrow(/Tipo/);
    expect(() => crearDocumentoProfesional({ ...base(), id: generarIdDocumentoProfesional('prof_2', H, 'SEGURO_RC') })).toThrow(/identificador/);
    expect(() => crearDocumentoProfesional({ ...base(), profesionalId: '../x' })).toThrow(/profesional/);
  });

  it('ciclo de vida: la pérdida detectada (DISPONIBLE→ERROR_STORAGE) existe; no hay vuelta atrás silenciosa', () => {
    expect(() => validarTransicionDocumentoProfesional('DISPONIBLE', 'ERROR_STORAGE')).not.toThrow();
    expect(() => validarTransicionDocumentoProfesional('ERROR_STORAGE', 'PENDIENTE_STORAGE')).not.toThrow();
    expect(() => validarTransicionDocumentoProfesional('ERROR_STORAGE', 'DISPONIBLE')).toThrow();
    expect(() => validarTransicionDocumentoProfesional('ELIMINADO', 'DISPONIBLE')).toThrow();
  });

  it('integridad: coincide sólo con la misma huella y tamaño', () => {
    expect(evaluarIntegridad({ sha256: H, tamanoBytes: 3 }, { sha256: H, tamanoBytes: 3 }).estado).toBe('VERIFICADO');
    expect(evaluarIntegridad({ sha256: H, tamanoBytes: 3 }, { sha256: 'b'.repeat(64), tamanoBytes: 3 }).estado).toBe('INTEGRIDAD_DISCREPANTE');
    expect(evaluarIntegridad({ sha256: H, tamanoBytes: 3 }, { sha256: H, tamanoBytes: 4 }).estado).toBe('INTEGRIDAD_DISCREPANTE');
  });

  it('presentación: sólo DISPONIBLE es descargable; las entradas heredadas data:/Base64 se marcan NO almacenadas', () => {
    expect(presentarEstadoDocumentoProfesional({ estado: 'DISPONIBLE' }).descargable).toBe(true);
    for (const estado of ['PENDIENTE_STORAGE', 'ERROR_STORAGE', 'PENDIENTE_ELIMINACION', 'ELIMINADO'] as const) {
      expect(presentarEstadoDocumentoProfesional({ estado }).descargable).toBe(false);
    }
    expect(presentarEstadoDocumentoProfesional({ estado: 'ERROR_STORAGE', motivoError: 'OBJETO_AUSENTE' }).etiqueta).toMatch(/no existe/);
    expect(clasificarDocumentoProfesionalHeredado({ downloadUrl: 'data:application/pdf;base64,JVBER' })).toBe('NO_ALMACENADO');
    expect(clasificarDocumentoProfesionalHeredado({ downloadUrl: '' })).toBe('NO_ALMACENADO');
    expect(clasificarDocumentoProfesionalHeredado({ downloadUrl: 'https://firebasestorage.googleapis.com/x' })).toBe('REFERENCIA_NO_VERIFICADA');
  });
});

// ===========================================================================
// B · ADAPTADOR CON DOBLES (mocks identificados)
// ===========================================================================
describe('B · adaptador de documentos profesionales con DOBLES en memoria (lógica, no certificación)', () => {
  const auditoria: Record<string, unknown>[] = [];
  const adaptador = crearAdaptadorDocumentosProfesionales({
    db: {} as never,
    storage: {} as never,
    auth: { currentUser: { uid: 'uid_titular', email: 'titular@sintetico.invalid', displayName: 'Titular' } },
    auditar: async (p) => { auditoria.push(p as unknown as Record<string, unknown>); },
  });
  const PDF = () => new Blob(['%PDF-1.7\nseguro RC sintético'], { type: 'application/pdf' });
  const metaKey = (id: string) => `profesionales/prof_1/documentos_profesionales/${id}`;

  beforeEach(() => {
    mem.firestore.clear(); mem.storage.clear(); mem.storageCaido = false; auditoria.length = 0;
  });

  it('subida correcta: bytes en Storage con huella; metadato DISPONIBLE; auditoría EXITO; sin URL de descarga', async () => {
    const { documento, duplicado } = await adaptador.subir({ profesionalId: 'prof_1', tipo: 'SEGURO_RC', archivo: PDF(), nombre: 'rc.pdf' });
    expect(duplicado).toBe(false);
    expect(documento.estado).toBe('DISPONIBLE');
    const obj = mem.storage.get(documento.storagePath)!;
    expect(sha(obj.bytes)).toBe(documento.sha256);
    expect(obj.customMetadata).toEqual({ documentoId: documento.id, profesionalId: 'prof_1', sha256: documento.sha256 });
    expect(JSON.stringify(mem.firestore.get(metaKey(documento.id)))).not.toMatch(/data:|base64|https?:/i);
    expect(auditoria.at(-1)).toMatchObject({ accion: 'EXPEDIENTE_DOCUMENTO_INCORPORADO', resultado: 'EXITO', entidadAfectada: 'profesional' });
    const repetido = await adaptador.subir({ profesionalId: 'prof_1', tipo: 'SEGURO_RC', archivo: PDF(), nombre: 'rc.pdf' });
    expect(repetido.duplicado).toBe(true);
    expect(mem.storage.size).toBe(1);
  });

  it('Storage caído: rechaza STORAGE_NO_DISPONIBLE, metadato ERROR_STORAGE, sin objeto ni data-URL; reintento recupera', async () => {
    mem.storageCaido = true;
    await expect(adaptador.subir({ profesionalId: 'prof_1', tipo: 'ALTA_IAE', archivo: PDF(), nombre: 'iae.pdf' }))
      .rejects.toMatchObject({ codigo: 'STORAGE_NO_DISPONIBLE' });
    expect(mem.storage.size).toBe(0);
    const [clave, meta] = [...mem.firestore.entries()][0];
    expect(meta).toMatchObject({ estado: 'ERROR_STORAGE', motivoError: 'SUBIDA_FALLIDA' });
    expect(JSON.stringify(meta)).not.toMatch(/data:|base64/i);
    expect(auditoria.at(-1)).toMatchObject({ accion: 'EXPEDIENTE_INCIDENCIA', resultado: 'ERROR' });
    mem.storageCaido = false;
    const rec = await adaptador.subir({ profesionalId: 'prof_1', tipo: 'ALTA_IAE', archivo: PDF(), nombre: 'iae.pdf' });
    expect(rec.documento.estado).toBe('DISPONIBLE');
    expect(mem.firestore.get(clave)).not.toHaveProperty('motivoError');
  });

  it('descarga: entrega bytes sólo con huella verificada; alterado o ausente → ERROR_STORAGE y error', async () => {
    const { documento } = await adaptador.subir({ profesionalId: 'prof_1', tipo: 'SEGURO_RC', archivo: PDF(), nombre: 'rc.pdf' });
    const ok = await adaptador.descargar('prof_1', documento.id);
    expect(sha(ok.bytes)).toBe(documento.sha256);
    mem.storage.set(documento.storagePath, { bytes: new TextEncoder().encode('%PDF-1.7\nALTERADO') });
    expect(await adaptador.verificar('prof_1', documento.id)).toEqual({ estado: 'INTEGRIDAD_DISCREPANTE' });
    expect(mem.firestore.get(metaKey(documento.id))).toMatchObject({ estado: 'ERROR_STORAGE', motivoError: 'INTEGRIDAD_DISCREPANTE' });
    await expect(adaptador.descargar('prof_1', documento.id)).rejects.toMatchObject({ codigo: 'DOCUMENTO_NO_DISPONIBLE' });
  });

  it('sustitución explícita: versión +1, la anterior se conserva; referencia a otro profesional rechazada', async () => {
    const v1 = await adaptador.subir({ profesionalId: 'prof_1', tipo: 'SEGURO_RC', archivo: PDF(), nombre: 'rc.pdf' });
    const v2 = await adaptador.subir({
      profesionalId: 'prof_1', tipo: 'SEGURO_RC', nombre: 'rc-2027.pdf', sustituyeA: v1.documento.id,
      archivo: new Blob(['%PDF-1.7\nRC 2027'], { type: 'application/pdf' }),
    });
    expect(v2.documento).toMatchObject({ version: 2, sustituyeA: v1.documento.id });
    expect(mem.storage.has(v1.documento.storagePath)).toBe(true);
    expect(auditoria.at(-1)).toMatchObject({ accion: 'EXPEDIENTE_DOCUMENTO_SUSTITUIDO' });
    await expect(adaptador.descargar('prof_2', v1.documento.id)).rejects.toMatchObject({ codigo: 'DOCUMENTO_INEXISTENTE' });
  });

  it('sin sesión no opera (identidad obligatoria)', async () => {
    const anonimo = crearAdaptadorDocumentosProfesionales({ db: {} as never, storage: {} as never, auth: { currentUser: null }, auditar: async () => undefined });
    await expect(anonimo.subir({ profesionalId: 'prof_1', tipo: 'OTRO', archivo: PDF() })).rejects.toMatchObject({ codigo: 'NO_AUTENTICADO' });
  });
});

// ===========================================================================
// C · AUTORIZACIÓN DEL SERVIDOR (autorizador real con mini-base en memoria)
// ===========================================================================
describe('C · autorización del servidor — profesionales/{id}/documentos/{docId}/{fichero}', () => {
  const H = 'c'.repeat(64);
  const DOC_P = `dpr_${'1'.repeat(64)}`; // PENDIENTE_STORAGE
  const DOC_D = `dpr_${'2'.repeat(64)}`; // DISPONIBLE
  const DOC_E = `dpr_${'3'.repeat(64)}`; // PENDIENTE_ELIMINACION
  const DOC_CAT = `dpr_${'4'.repeat(64)}`; // profesional de catálogo (sin cartera)
  const ruta = (prof: string, doc: string) => `profesionales/${prof}/documentos/${doc}/rc.pdf`;
  const meta = (prof: string, id: string, estado: string) => ({
    id, profesionalId: prof, estado, nombreStorage: 'rc.pdf', storagePath: ruta(prof, id),
    mimeType: 'application/pdf', tamanoBytes: 2048, sha256: H,
  });
  const FS: Record<string, Record<string, unknown>> = {
    'usuarios_auth/uid_a': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'PROP_A', profesionalId: '' },
    'usuarios_auth/uid_b': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'PROP_B', profesionalId: '' },
    'usuarios_auth/uid_l': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'G_L', carterasL: ['PROP_A'] },
    'usuarios_auth/uid_e': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'G_E', carterasE: ['PROP_A'] },
    'usuarios_auth/uid_p1': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'PRO_1' },
    'usuarios_auth/uid_p2': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'PRO_2' },
    'usuarios_auth/uid_bloq': { tipoPerfil: 'PROPIETARIO', estado: 'BLOQUEADO', propietarioId: 'PROP_A', profesionalId: '' },
    'profesionales/PRO_1': { creadoPorPropietarioId: 'PROP_A', esPrivado: true },
    'profesionales/PRO_2': { creadoPorPropietarioId: 'PROP_B', esPrivado: true },
    'profesionales/PRO_CAT': { esPrivado: false },
    [`profesionales/PRO_1/documentos_profesionales/${DOC_P}`]: meta('PRO_1', DOC_P, 'PENDIENTE_STORAGE'),
    [`profesionales/PRO_1/documentos_profesionales/${DOC_D}`]: meta('PRO_1', DOC_D, 'DISPONIBLE'),
    [`profesionales/PRO_1/documentos_profesionales/${DOC_E}`]: meta('PRO_1', DOC_E, 'PENDIENTE_ELIMINACION'),
    [`profesionales/PRO_CAT/documentos_profesionales/${DOC_CAT}`]: meta('PRO_CAT', DOC_CAT, 'DISPONIBLE'),
  };
  const AUTH: Record<string, PeticionServidor['auth']> = {
    anonimo: null,
    admin: { uid: 'uid_admin', token: { email: EMAIL_MASTER, email_verified: true } },
    titularA: { uid: 'uid_a', token: {} }, titularB: { uid: 'uid_b', token: {} },
    gestorL: { uid: 'uid_l', token: {} }, gestorE: { uid: 'uid_e', token: {} },
    prof1: { uid: 'uid_p1', token: {} }, prof2: { uid: 'uid_p2', token: {} },
    bloqueado: { uid: 'uid_bloq', token: {} }, sinEspejo: { uid: 'uid_x', token: {} },
  };
  const puede = (actor: string, metodo: Verbo, r: string, resource?: RecursoEntrante) =>
    permiteServidor(metodo, { auth: AUTH[actor], db: FS, path: r, metadata: resource ?? null });
  const carga = (prof: string, id: string, extra: Partial<RecursoEntrante> = {}): RecursoEntrante => ({
    name: ruta(prof, id), size: 2048, contentType: 'application/pdf',
    metadata: { documentoId: id, profesionalId: prof, sha256: H }, ...extra,
  });

  it('subida PERMITIDA: titular de la cartera, gestor E, el propio profesional y administración', async () => {
    for (const actor of ['titularA', 'gestorE', 'prof1', 'admin']) expect(await puede(actor, 'create', ruta('PRO_1', DOC_P), carga('PRO_1', DOC_P)), actor).toBe(true);
  });

  it('subida DENEGADA: otra cartera, lector L, otro profesional, bloqueado, sin espejo, anónimo', async () => {
    for (const actor of ['titularB', 'gestorL', 'prof2', 'bloqueado', 'sinEspejo', 'anonimo']) {
      expect(await puede(actor, 'create', ruta('PRO_1', DOC_P), carga('PRO_1', DOC_P)), actor).toBe(false);
    }
  });

  it('subida DENEGADA si el objeto no coincide con su metadato (huella, tamaño, MIME, vínculo, estado, ruta)', async () => {
    const r = ruta('PRO_1', DOC_P);
    expect(await puede('titularA', 'create', r, carga('PRO_1', DOC_P, { size: 2049 }))).toBe(false);
    expect(await puede('titularA', 'create', r, carga('PRO_1', DOC_P, { contentType: 'image/png' }))).toBe(false);
    expect(await puede('titularA', 'create', r, carga('PRO_1', DOC_P, { metadata: { documentoId: DOC_P, profesionalId: 'PRO_1', sha256: 'd'.repeat(64) } }))).toBe(false);
    expect(await puede('titularA', 'create', r, carga('PRO_1', DOC_P, { metadata: { documentoId: DOC_P, profesionalId: 'PRO_2', sha256: H } }))).toBe(false);
    // sustitución del binario de un documento ya DISPONIBLE: denegada
    expect(await puede('titularA', 'create', ruta('PRO_1', DOC_D), carga('PRO_1', DOC_D))).toBe(false);
    // vincular el archivo bajo OTRO profesional reutilizando el metadato: denegado
    expect(await puede('titularA', 'create', ruta('PRO_2', DOC_P), carga('PRO_2', DOC_P))).toBe(false);
    // otro nombre de fichero bajo el mismo documento: denegado
    expect(await puede('titularA', 'create', `profesionales/PRO_1/documentos/${DOC_P}/otro.pdf`, carga('PRO_1', DOC_P, { name: `profesionales/PRO_1/documentos/${DOC_P}/otro.pdf` }))).toBe(false);
  });

  it('lectura/descarga: titular, L, E, el profesional y admin sí; otra cartera, otro profesional y anónimo no; nunca si no está DISPONIBLE', async () => {
    for (const actor of ['titularA', 'gestorL', 'gestorE', 'prof1', 'admin']) expect(await puede(actor, 'get', ruta('PRO_1', DOC_D)), actor).toBe(true);
    for (const actor of ['titularB', 'prof2', 'bloqueado', 'sinEspejo', 'anonimo']) expect(await puede(actor, 'get', ruta('PRO_1', DOC_D)), actor).toBe(false);
    expect(await puede('titularA', 'get', ruta('PRO_1', DOC_P))).toBe(false);
    expect(await puede('admin', 'get', ruta('PRO_1', DOC_E))).toBe(false);
    for (const actor of ['titularA', 'admin']) expect(await puede(actor, 'list', ruta('PRO_1', DOC_D)), actor).toBe(false);
  });

  it('profesional de catálogo (sin cartera): sólo él y administración leen; ningún titular', async () => {
    expect(await puede('admin', 'get', ruta('PRO_CAT', DOC_CAT))).toBe(true);
    for (const actor of ['titularA', 'titularB', 'gestorE', 'prof1']) expect(await puede(actor, 'get', ruta('PRO_CAT', DOC_CAT)), actor).toBe(false);
  });

  it('update siempre denegado; borrado sólo titular/admin y sólo PENDIENTE_ELIMINACION', async () => {
    for (const actor of ['titularA', 'admin', 'prof1']) expect(await puede(actor, 'update', ruta('PRO_1', DOC_D), carga('PRO_1', DOC_D)), actor).toBe(false);
    expect(await puede('titularA', 'delete', ruta('PRO_1', DOC_E))).toBe(true);
    expect(await puede('admin', 'delete', ruta('PRO_1', DOC_E))).toBe(true);
    for (const actor of ['gestorE', 'prof1', 'titularB', 'anonimo']) expect(await puede(actor, 'delete', ruta('PRO_1', DOC_E)), actor).toBe(false);
    expect(await puede('titularA', 'delete', ruta('PRO_1', DOC_D))).toBe(false);
  });

  it('la ruta plana heredada sigue en la denegación por defecto', async () => {
    for (const actor of Object.keys(AUTH)) {
      expect(await puede(actor, 'create', 'profesionales/PRO_1/documentos/1_rc.pdf', { name: 'profesionales/PRO_1/documentos/1_rc.pdf', size: 10, contentType: 'application/pdf' }), actor).toBe(false);
    }
  });
});

// ===========================================================================
// D · FIRESTORE RULES (intérprete local sobre el texto real)
// ===========================================================================
describe('D · firestore.rules — metadatos documentales del profesional (intérprete local)', () => {
  const EVAL = crearEvaluadorReglas(FIRESTORE_RULES);
  const bloque = EVAL.bloqueDe('documentos_profesionales');
  const permisos = EVAL.permisosDe(bloque);
  const funciones = new Map([...EVAL.funcionesDe(EVAL.cuerpoRaiz()), ...EVAL.funcionesDe(bloque)]);
  const H = 'e'.repeat(64);
  const DB: Peticion['db'] = {
    'usuarios_auth/uid_a': { usuarioId: 'usr_a', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'PROP_A', profesionalId: '', inmuebleIds: [] },
    'usuarios_auth/uid_b': { usuarioId: 'usr_b', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'PROP_B', profesionalId: '', inmuebleIds: [] },
    'usuarios_auth/uid_l': { usuarioId: 'usr_l', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'G_L', inmuebleIds: [], carterasL: ['PROP_A'] },
    'usuarios_auth/uid_e': { usuarioId: 'usr_e', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'G_E', inmuebleIds: [], carterasE: ['PROP_A'] },
    'usuarios_auth/uid_p1': { usuarioId: 'usr_p1', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'PRO_1', inmuebleIds: [] },
    'usuarios_auth/uid_p2': { usuarioId: 'usr_p2', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'PRO_2', inmuebleIds: [] },
    'profesionales/PRO_1': { creadoPorPropietarioId: 'PROP_A', esPrivado: true },
    'profesionales/PRO_2': { creadoPorPropietarioId: 'PROP_B', esPrivado: true },
  };
  completarPerfilesSinteticos(DB);
  const AUTH: Record<string, Peticion['auth']> = {
    anonimo: null,
    admin: { uid: 'uid_admin', token: { email: 'sarqsan2@gmail.com', email_verified: true } },
    titularA: { uid: 'uid_a', token: {} }, titularB: { uid: 'uid_b', token: {} },
    gestorL: { uid: 'uid_l', token: {} }, gestorE: { uid: 'uid_e', token: {} },
    prof1: { uid: 'uid_p1', token: {} }, prof2: { uid: 'uid_p2', token: {} },
  };
  const id = generarIdDocumentoProfesional('PRO_1', H, 'SEGURO_RC');
  const docBase = (actorId: string) => crearDocumentoProfesional({
    id, profesionalId: 'PRO_1', tipo: 'SEGURO_RC', nombre: 'rc.pdf', mimeType: 'application/pdf', tamanoBytes: 100,
    sha256: H, fechaIncorporacion: '2026-10-19T00:00:00.000Z', actorId, actorNombre: 'Actor',
  }) as unknown as Record<string, unknown>;
  function permite(verbo: Metodo, actor: string, opciones: { resource?: Record<string, unknown> | null; entrante?: Record<string, unknown> | null; profesionalId?: string; docId?: string }) {
    const entrada = permisos.get(verbo);
    if (!entrada) throw new Error(`sin allow ${verbo}`);
    const frame = new Map<string, unknown>([['profesionalId', opciones.profesionalId ?? 'PRO_1'], ['documentoId', opciones.docId ?? id]]);
    const req: Peticion = { auth: AUTH[actor], db: DB, resource: opciones.resource ?? null, requestResource: opciones.entrante ?? null, docId: opciones.docId ?? id };
    try { return EVAL.evaluar(EVAL.parsear(entrada.condicion), req, funciones, frame) === true; } catch (e) { if (process.env.P3_DEBUG) console.log("ERR", verbo, actor, (e as Error).message); return false; }
  }

  it('create PERMITIDO a titular, gestor E, el propio profesional y admin con actorId = su uid', () => {
    expect(permite('create', 'titularA', { entrante: docBase('uid_a') })).toBe(true);
    expect(permite('create', 'gestorE', { entrante: docBase('uid_e') })).toBe(true);
    expect(permite('create', 'prof1', { entrante: docBase('uid_p1') })).toBe(true);
    expect(permite('create', 'admin', { entrante: docBase('uid_admin') })).toBe(true);
  });

  it('create DENEGADO: otra cartera, lector L, otro profesional, anónimo, actor suplantado, estado o ruta manipulados', () => {
    expect(permite('create', 'titularB', { entrante: docBase('uid_b') })).toBe(false);
    expect(permite('create', 'gestorL', { entrante: docBase('uid_l') })).toBe(false);
    expect(permite('create', 'prof2', { entrante: docBase('uid_p2') })).toBe(false);
    expect(permite('create', 'anonimo', { entrante: docBase('x') })).toBe(false);
    expect(permite('create', 'titularA', { entrante: docBase('uid_otro') })).toBe(false);
    expect(permite('create', 'titularA', { entrante: { ...docBase('uid_a'), estado: 'DISPONIBLE' } })).toBe(false);
    expect(permite('create', 'titularA', { entrante: { ...docBase('uid_a'), storagePath: `profesionales/PRO_2/documentos/${id}/rc.pdf` } })).toBe(false);
    expect(permite('create', 'titularA', { entrante: { ...docBase('uid_a'), profesionalId: 'PRO_2' } })).toBe(false);
    expect(permite('create', 'titularA', { entrante: { ...docBase('uid_a'), downloadUrl: 'data:application/pdf;base64,AAA' } })).toBe(false);
    // vincular el documento a OTRO profesional por la ruta del documento
    expect(permite('create', 'titularA', { profesionalId: 'PRO_2', entrante: { ...docBase('uid_a') } })).toBe(false);
  });

  it('get: titular/L/E/profesional/admin sí; otra cartera, otro profesional y anónimo no', () => {
    const existente = { ...docBase('uid_a'), estado: 'DISPONIBLE' };
    for (const actor of ['titularA', 'gestorL', 'gestorE', 'prof1', 'admin']) expect(permite('get', actor, { resource: existente }), actor).toBe(true);
    for (const actor of ['titularB', 'prof2', 'anonimo']) expect(permite('get', actor, { resource: existente }), actor).toBe(false);
  });

  it('update: transiciones de carga y de pérdida permitidas; no se pueden alterar huella/ruta ni «resucitar» un error', () => {
    const pendiente = docBase('uid_a');
    const disponible = { ...pendiente, estado: 'DISPONIBLE' };
    expect(permite('update', 'titularA', { resource: pendiente, entrante: { ...pendiente, estado: 'DISPONIBLE', actualizadoEl: 'x' } })).toBe(true);
    expect(permite('update', 'titularA', { resource: disponible, entrante: { ...disponible, estado: 'ERROR_STORAGE', motivoError: 'OBJETO_AUSENTE', actualizadoEl: 'x' } })).toBe(true);
    expect(permite('update', 'titularA', { resource: disponible, entrante: { ...disponible, estado: 'ERROR_STORAGE', actualizadoEl: 'x' } })).toBe(false);
    expect(permite('update', 'titularA', { resource: disponible, entrante: { ...disponible, sha256: 'f'.repeat(64) } })).toBe(false);
    expect(permite('update', 'titularA', { resource: disponible, entrante: { ...disponible, storagePath: 'profesionales/PRO_2/documentos/x/rc.pdf' } })).toBe(false);
    expect(permite('update', 'titularB', { resource: pendiente, entrante: { ...pendiente, estado: 'DISPONIBLE' } })).toBe(false);
    expect(permite('update', 'gestorL', { resource: disponible, entrante: { ...disponible, estado: 'ERROR_STORAGE', motivoError: 'OBJETO_AUSENTE' } })).toBe(false);
  });

  it('borrado lógico: sólo titular/admin pasan a PENDIENTE_ELIMINACION; el delete físico del metadato nunca', () => {
    const disponible = { ...docBase('uid_a'), estado: 'DISPONIBLE' };
    expect(permite('update', 'titularA', { resource: disponible, entrante: { ...disponible, estado: 'PENDIENTE_ELIMINACION', actualizadoEl: 'x' } })).toBe(true);
    expect(permite('update', 'gestorE', { resource: disponible, entrante: { ...disponible, estado: 'PENDIENTE_ELIMINACION', actualizadoEl: 'x' } })).toBe(false);
    expect(permite('update', 'prof1', { resource: disponible, entrante: { ...disponible, estado: 'PENDIENTE_ELIMINACION', actualizadoEl: 'x' } })).toBe(false);
    for (const actor of ['admin', 'titularA']) expect(permite('delete', actor, { resource: disponible }), actor).toBe(false);
  });

  it('la ficha del profesional: un PROFESIONAL no administrativo no puede reasignar su cartera (creadoPorPropietarioId)', () => {
    const ficha = { id: 'PRO_1', creadoPorPropietarioId: 'PROP_A', esPrivado: true, nombreComercial: 'Fontanería' };
    const req = (actor: string, entrante: Record<string, unknown>): Peticion => ({ auth: AUTH[actor], db: DB, resource: ficha, requestResource: entrante, docId: 'PRO_1' });
    expect(EVAL.permite('profesionales', 'update', req('prof2', { ...ficha, nombreComercial: 'Otra' }))).toBe(true);
    expect(EVAL.permite('profesionales', 'update', req('prof2', { ...ficha, creadoPorPropietarioId: 'PROP_B' }))).toBe(false);
    expect(EVAL.permite('profesionales', 'update', req('admin', { ...ficha, creadoPorPropietarioId: 'PROP_B' }))).toBe(true);
  });
});
