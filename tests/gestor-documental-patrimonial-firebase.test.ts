import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  firestore: new Map<string, Record<string, unknown>>(),
  storage: new Map<string, { blob: Blob; metadata: Record<string, unknown> }>(),
  auditoria: [] as Record<string, unknown>[],
  auth: { currentUser: { uid: 'usr_1', email: 'duena@example.test', displayName: 'Titular' } as null | { uid: string; email: string; displayName: string } },
}));

vi.mock('../src/lib/firebase', () => ({
  auth: mocks.auth,
  db: { testDb: true },
  storage: { testStorage: true },
  registrarAuditoriaFirestore: vi.fn(async (payload: Record<string, unknown>) => { mocks.auditoria.push(payload); }),
}));

vi.mock('firebase/firestore', () => {
  const path = (...segments: string[]) => segments.filter(Boolean).join('/');
  const snap = (key: string) => {
    const value = mocks.firestore.get(key);
    return { id: key.split('/').at(-1), exists: () => Boolean(value), data: () => value };
  };
  return {
    collection: (_db: unknown, ...parts: string[]) => ({ path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ path: path(...parts) }),
    getDoc: async (ref: { path: string }) => snap(ref.path),
    getDocs: async (q: { path: string; filters?: unknown[] }) => {
      const docs = [...mocks.firestore.entries()]
        .filter(([key]) => key.startsWith(`${q.path}/`))
        .map(([key]) => ({ ...snap(key), id: key.split('/').at(-1) }));
      return { docs };
    },
    onSnapshot: () => () => undefined,
    query: (ref: { path: string }, ...filters: unknown[]) => ({ ...ref, filters }),
    where: (...args: unknown[]) => args,
    runTransaction: async (_db: unknown, action: (tx: { get: (ref: { path: string }) => Promise<unknown>; set: (ref: { path: string }, data: Record<string, unknown>) => void }) => Promise<unknown>) => action({
      get: async (ref) => snap(ref.path),
      set: (ref, data) => { mocks.firestore.set(ref.path, structuredClone(data)); },
    }),
    updateDoc: async (ref: { path: string }, changes: Record<string, unknown>) => {
      const current = mocks.firestore.get(ref.path);
      if (!current) throw new Error('not-found');
      mocks.firestore.set(ref.path, { ...current, ...structuredClone(changes) });
    },
    setDoc: async (ref: { path: string }, data: Record<string, unknown>) => { mocks.firestore.set(ref.path, structuredClone(data)); },
  };
});

vi.mock('firebase/storage', () => {
  const ref = (_storage: unknown, path: string) => ({ path });
  return {
    ref,
    uploadBytes: async (storageRef: { path: string }, blob: Blob, metadata: Record<string, unknown>) => {
      mocks.storage.set(storageRef.path, {
        blob,
        metadata: { size: blob.size, contentType: metadata.contentType, customMetadata: metadata.customMetadata },
      });
      return {};
    },
    getMetadata: async (storageRef: { path: string }) => {
      const stored = mocks.storage.get(storageRef.path);
      if (!stored) throw Object.assign(new Error('not-found'), { code: 'storage/object-not-found' });
      return stored.metadata;
    },
    getBlob: async (storageRef: { path: string }) => {
      const stored = mocks.storage.get(storageRef.path);
      if (!stored) throw Object.assign(new Error('not-found'), { code: 'storage/object-not-found' });
      return stored.blob;
    },
    deleteObject: async (storageRef: { path: string }) => {
      if (!mocks.storage.delete(storageRef.path)) throw Object.assign(new Error('not-found'), { code: 'storage/object-not-found' });
    },
  };
});

import {
  actualizarMetadatosDocumentoPatrimonial,
  descargarDocumentoPatrimonial,
  eliminarDocumentoPatrimonial,
  subirDocumentoPatrimonial,
} from '../src/lib/expedienteDocumental/gestorFirebase';

const pdf = () => new Blob(['%PDF-1.7\ncontenido de prueba'], { type: 'application/pdf' });
const propertyRef = 'inmuebles/inm_42';
const gastoRef = 'gastos/gas_1';

describe('Gestor Firebase documental — orquestación de Storage, metadatos y auditoría (harness con dobles; no Emulator)', () => {
  beforeEach(() => {
    mocks.firestore.clear(); mocks.storage.clear(); mocks.auditoria.length = 0;
    mocks.auth.currentUser = { uid: 'usr_1', email: 'duena@example.test', displayName: 'Titular' };
    mocks.firestore.set(propertyRef, { propietarioId: 'prop_7' });
    mocks.firestore.set(gastoRef, { inmuebleId: 'inm_42', propietarioId: 'prop_7', concepto: 'Reparación' });
  });

  it('da de alta un documento del gasto, deduplica reintentos y audita sin guardar URLs ni importes', async () => {
    const input = {
      inmuebleId: 'inm_42', tipo: 'FACTURA_GASTO' as const, archivo: pdf(), nombre: 'factura.pdf',
      relaciones: { gastoId: 'gas_1', movimientoId: 'GASTO:gas_1' }, actorNombre: 'Titular',
    };
    const primera = await subirDocumentoPatrimonial(input);
    expect(primera.documento.estado).toBe('DISPONIBLE');
    expect(primera.documento.gastoId).toBe('gas_1');
    expect(primera.documento.storagePath).toContain('documentos_patrimoniales');
    expect(primera.documento).not.toHaveProperty('url');
    expect(primera.documento).not.toHaveProperty('importe');
    expect(mocks.storage.size).toBe(1);
    expect(mocks.auditoria.at(-1)).toMatchObject({ accion: 'EXPEDIENTE_DOCUMENTO_INCORPORADO', resultado: 'EXITO' });

    const duplicada = await subirDocumentoPatrimonial(input);
    expect(duplicada.duplicado).toBe(true);
    expect(duplicada.documento.id).toBe(primera.documento.id);
    expect(mocks.storage.size).toBe(1);
  });

  it('rechaza referencias rotas o de otro inmueble antes de crear metadata/binarios', async () => {
    mocks.firestore.set('gastos/gas_ajeno', { inmuebleId: 'inm_otro', propietarioId: 'prop_otro' });
    await expect(subirDocumentoPatrimonial({
      inmuebleId: 'inm_42', tipo: 'FACTURA_GASTO', archivo: pdf(), nombre: 'ajena.pdf',
      relaciones: { gastoId: 'gas_ajeno' }, actorNombre: 'Titular',
    })).rejects.toMatchObject({ codigo: 'RELACION_INVALIDA' });
    expect(mocks.storage.size).toBe(0);
    expect([...mocks.firestore.keys()].filter((key) => key.includes('documentos_patrimoniales'))).toHaveLength(0);
  });

  it('edita sólo metadatos, recupera el binario sin token-URL y audita consulta/edición', async () => {
    const alta = await subirDocumentoPatrimonial({ inmuebleId: 'inm_42', tipo: 'OTRO', archivo: pdf(), nombre: 'anexo.pdf', actorNombre: 'Titular' });
    await actualizarMetadatosDocumentoPatrimonial('inm_42', alta.documento.id, {
      tipo: 'DOCUMENTO_INCIDENCIA', nombre: 'anexo técnico.pdf', fechaDocumental: '2026-09-20', referencia: 'EXP-12', observaciones: 'Revisado',
    }, 'Titular');
    const recuperado = await descargarDocumentoPatrimonial('inm_42', alta.documento.id);
    expect(await recuperado.blob.text()).toContain('%PDF-1.7');
    expect(recuperado.nombre).toBe('anexo técnico.pdf'); // etiqueta actualizada; la ruta física no se sobrescribe
    expect(mocks.auditoria.map((x) => x.accion)).toContain('EXPEDIENTE_DOCUMENTO_MODIFICADO');
    expect(mocks.auditoria.map((x) => x.accion)).toContain('EXPEDIENTE_DOCUMENTO_DESCARGADO');
  });

  it('sustituye explícitamente creando otra versión y conserva recuperables el binario y metadatos anteriores', async () => {
    const anterior = await subirDocumentoPatrimonial({ inmuebleId: 'inm_42', tipo: 'CONTRATO', archivo: pdf(), nombre: 'contrato-v1.pdf', actorNombre: 'Titular' });
    const siguiente = await subirDocumentoPatrimonial({
      inmuebleId: 'inm_42', tipo: 'ANEXO_CONTRATO', archivo: new Blob(['%PDF-1.7\nversion dos'], { type: 'application/pdf' }),
      nombre: 'contrato-v2.pdf', sustituyeA: anterior.documento.id, actorNombre: 'Titular',
    });
    expect(siguiente.documento.version).toBe(2);
    expect(siguiente.documento.sustituyeA).toBe(anterior.documento.id);
    expect(mocks.storage.has(anterior.documento.storagePath)).toBe(true);
    expect(mocks.firestore.get(`${propertyRef}/documentos_patrimoniales/${anterior.documento.id}`)?.estado).toBe('DISPONIBLE');
  });

  it('elimina el binario pero conserva tombstone; el segundo paso es reintentable', async () => {
    const alta = await subirDocumentoPatrimonial({ inmuebleId: 'inm_42', tipo: 'OTRO', archivo: pdf(), nombre: 'archivo.pdf', actorNombre: 'Titular' });
    await eliminarDocumentoPatrimonial('inm_42', alta.documento.id, 'Titular');
    const metadata = mocks.firestore.get(`${propertyRef}/documentos_patrimoniales/${alta.documento.id}`);
    expect(metadata?.estado).toBe('ELIMINADO');
    expect(metadata?.eliminadoEl).toBeTypeOf('string');
    expect(mocks.storage.size).toBe(0);
    expect(mocks.auditoria.at(-1)).toMatchObject({ accion: 'EXPEDIENTE_DOCUMENTO_ELIMINADO', resultado: 'EXITO' });
  });
});
