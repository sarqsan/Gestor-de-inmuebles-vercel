import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gasto } from '../src/types';

/**
 * P5.2-A · Persistencia verificada con Firestore DOBLADO en memoria.
 * Demuestra el contrato de errores/verificación de los adaptadores; NO
 * demuestra persistencia real en Firebase (eso requiere emulador/proyecto
 * real con credenciales, fuera del alcance de P5.2).
 */

const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  fallos: { set: false, delete: false, deleteNoop: false, read: false },
  alGuardar: null as null | ((data: Record<string, unknown>) => Record<string, unknown>),
}));

vi.mock('../src/lib/firebase', () => ({
  db: { testDb: true },
  sanitizeObjectForFirestore: (obj: Record<string, unknown>) => JSON.parse(JSON.stringify(obj)) as Record<string, unknown>,
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    if (mocks.fallos.set) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const actual = mocks.alGuardar ? mocks.alGuardar(structuredClone(data)) : data;
    mocks.store.set(ref.path, { ...(mocks.store.get(ref.path) || {}), ...structuredClone(actual) });
  },
  getDocFromServer: async (ref: { path: string }) => {
    if (mocks.fallos.read) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    const valor = mocks.store.get(ref.path);
    return { exists: () => Boolean(valor), data: () => valor };
  },
  deleteDoc: async (ref: { path: string }) => {
    if (mocks.fallos.delete) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    if (!mocks.fallos.deleteNoop) mocks.store.delete(ref.path);
  },
}));

import {
  ErrorPersistenciaGasto,
  eliminarGastoVerificado,
  guardarGastoVerificado,
} from '../src/lib/gastosPersistenciaVerificada';

const gasto: Gasto = {
  id: 'gas_ocr_test', inmuebleId: 'inm-a', propietarioId: 'prop-1', tipo: 'EXPLOTACION', categoria: 'REPARACION',
  concepto: 'Reparación', importe: 121, estado: 'PENDIENTE', aCargoDe: 'arrendador', deducible: false,
  createdAt: '2026-03-14T00:00:00.000Z', updatedAt: '2026-03-14T00:00:00.000Z',
  facturaOcr: { version: 1, sha256Documento: 'c'.repeat(64), claveDeduplicacion: 'k', procesadoEl: '2026-03-14', confianzaOcr: 90, camposReconocidos: {}, camposConfirmados: {} },
};

beforeEach(() => {
  mocks.store.clear();
  mocks.fallos = { set: false, delete: false, deleteNoop: false, read: false };
  mocks.alGuardar = null;
});

describe('P5.2-A · guardarGastoVerificado', () => {
  it('guarda y verifica contra el (doble de) servidor', async () => {
    await expect(guardarGastoVerificado(gasto)).resolves.toBe(gasto);
    expect(mocks.store.get('gastos/gas_ocr_test')?.estado).toBe('PENDIENTE');
  });

  it('si Firestore deniega la escritura, lanza ESCRITURA (no éxito silencioso)', async () => {
    mocks.fallos.set = true;
    const error = await guardarGastoVerificado(gasto).catch((e: unknown) => e);
    expect(error).toMatchObject({ name: 'ErrorPersistenciaGasto', etapa: 'ESCRITURA' });
    // P5.3: el motivo mostrado no filtra el mensaje interno de Firebase.
    expect((error as Error).message).toMatch(/no tiene permiso/);
    expect((error as Error).message).not.toMatch(/Missing or insufficient/i);
  });

  it('si el enlace documental no quedó persistido, lanza VERIFICACION', async () => {
    const enlazado: Gasto = {
      ...gasto,
      documento: { id: 'doc_9', nombre: 'f.pdf', url: '' },
      facturaOcr: { ...gasto.facturaOcr!, documentoId: 'doc_9' },
    };
    // Simula una persistencia que pierde el enlace (la relectura lo detecta).
    mocks.alGuardar = (data) => {
      const copia = { ...data } as { facturaOcr?: Record<string, unknown>; documento?: unknown };
      if (copia.facturaOcr) delete copia.facturaOcr.documentoId;
      delete copia.documento;
      return copia as Record<string, unknown>;
    };
    await expect(guardarGastoVerificado(enlazado)).rejects.toMatchObject({
      name: 'ErrorPersistenciaGasto', etapa: 'VERIFICACION',
    });
  });

  it('si la relectura no es posible, lanza VERIFICACION sin afirmar que no se guardó', async () => {
    mocks.fallos.read = true;
    const error = await guardarGastoVerificado(gasto).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorPersistenciaGasto);
    expect((error as ErrorPersistenciaGasto).etapa).toBe('VERIFICACION');
    expect((error as Error).message).toMatch(/pudo haber llegado/);
  });
});

describe('P5.2-A · eliminarGastoVerificado', () => {
  it('borra y confirma la ausencia', async () => {
    mocks.store.set('gastos/gas_ocr_test', { id: 'gas_ocr_test' });
    await expect(eliminarGastoVerificado('gas_ocr_test')).resolves.toBeUndefined();
    expect(mocks.store.has('gastos/gas_ocr_test')).toBe(false);
  });

  it('si el borrado es denegado (p. ej. gestor sin delete), lanza BORRADO', async () => {
    mocks.store.set('gastos/gas_ocr_test', { id: 'gas_ocr_test' });
    mocks.fallos.delete = true;
    await expect(eliminarGastoVerificado('gas_ocr_test')).rejects.toMatchObject({
      name: 'ErrorPersistenciaGasto', etapa: 'BORRADO',
    });
    expect(mocks.store.has('gastos/gas_ocr_test')).toBe(true);
  });

  it('si tras «borrar» el documento sigue existiendo, lanza VERIFICACION_BORRADO', async () => {
    mocks.store.set('gastos/gas_ocr_test', { id: 'gas_ocr_test' });
    mocks.fallos.deleteNoop = true;
    await expect(eliminarGastoVerificado('gas_ocr_test')).rejects.toMatchObject({
      name: 'ErrorPersistenciaGasto', etapa: 'VERIFICACION_BORRADO',
    });
  });
});
