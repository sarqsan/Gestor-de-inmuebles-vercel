import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  crearDocumentoPatrimonial,
  generarIdDocumentoPatrimonial,
  sanearNombreDocumento,
  validarArchivoDocumento,
  validarRelacionesDocumento,
  validarTransicionDocumento,
} from '../src/lib/expedienteDocumental/gestor';
import { construirIndiceDocumentalInmueble } from '../src/lib/expedienteDocumental/indice';
import type { DocumentoPatrimonial } from '../src/lib/expedienteDocumental/tipos';
import type { Inmueble } from '../src/types';

const HASH = 'a'.repeat(64);
const INMUEBLE = { id: 'inm_42', propietarioId: 'prop_7', direccion: 'Calle Mayor 1' } as Inmueble;
const GASTO = { id: 'gas_1', inmuebleId: 'inm_42', propietarioId: 'prop_7' };

function crear(estado: DocumentoPatrimonial['estado'] = 'DISPONIBLE', overrides: Partial<DocumentoPatrimonial> = {}): DocumentoPatrimonial {
  return {
    id: generarIdDocumentoPatrimonial('inm_42', HASH, { gastoId: 'gas_1', movimientoId: 'GASTO:gas_1' }),
    inmuebleId: 'inm_42', propietarioId: 'prop_7', tipo: 'FACTURA_GASTO', nombre: 'Factura 2026.pdf',
    nombreStorage: 'Factura_2026.pdf', mimeType: 'application/pdf', tamanoBytes: 1024, sha256: HASH,
    storagePath: `inmuebles/inm_42/documentos_patrimoniales/${generarIdDocumentoPatrimonial('inm_42', HASH, { gastoId: 'gas_1', movimientoId: 'GASTO:gas_1' })}/Factura_2026.pdf`,
    fechaDocumental: '2026-03-10', fechaIncorporacion: '2026-03-11T10:00:00.000Z', actorId: 'usr_3', actorNombre: 'Gestor',
    version: 1, estado, gastoId: 'gas_1', movimientoId: 'GASTO:gas_1', ...overrides,
  };
}

describe('BLOQUE 6 — gestor documental patrimonial', () => {
  it('sanea nombres de archivo y rechaza traversal/nombres vacíos', () => {
    expect(sanearNombreDocumento('../../Factura á 1.pdf')).toBe('Factura_a_1.pdf');
    expect(() => sanearNombreDocumento('...')).toThrow(/nombre/i);
  });

  it('admite sólo PDF e imágenes permitidas con tamaños acotados y hash SHA-256', () => {
    expect(validarArchivoDocumento({ nombre: 'a.pdf', mimeType: 'application/pdf', tamanoBytes: 1, sha256: HASH })).toBe('application/pdf');
    expect(() => validarArchivoDocumento({ nombre: 'a.pdf', mimeType: 'application/octet-stream', tamanoBytes: 1, sha256: HASH })).toThrow(/PDF/);
    expect(() => validarArchivoDocumento({ nombre: 'a.pdf', mimeType: 'application/pdf', tamanoBytes: 20 * 1024 * 1024 + 1, sha256: HASH })).toThrow(/20 MB/);
    expect(() => validarArchivoDocumento({ nombre: 'a.pdf', mimeType: 'application/pdf', tamanoBytes: 4, sha256: 'bad' })).toThrow(/SHA-256/);
  });

  it('genera identidad determinista por inmueble, huella y relación; persiste sólo referencias privadas', () => {
    const relaciones = { gastoId: 'gas_1', movimientoId: 'GASTO:gas_1' };
    expect(generarIdDocumentoPatrimonial('inm_42', HASH, relaciones)).toBe(generarIdDocumentoPatrimonial('inm_42', HASH, relaciones));
    expect(generarIdDocumentoPatrimonial('inm_42', HASH, relaciones)).not.toBe(generarIdDocumentoPatrimonial('inm_42', HASH, { gastoId: 'gas_2' }));
    const documento = crearDocumentoPatrimonial({
      id: generarIdDocumentoPatrimonial('inm_42', HASH, relaciones), inmuebleId: 'inm_42', propietarioId: 'prop_7',
      tipo: 'FACTURA_GASTO', nombre: 'Factura 2026.pdf', mimeType: 'application/pdf', tamanoBytes: 1024, sha256: HASH,
      fechaIncorporacion: '2026-03-11T10:00:00.000Z', actorId: 'usr_3', actorNombre: 'Gestor', relaciones,
    });
    expect(documento.estado).toBe('PENDIENTE_STORAGE');
    expect(documento.storagePath).toContain('inmuebles/inm_42/documentos_patrimoniales/');
    expect(documento).not.toHaveProperty('url');
    expect(documento).not.toHaveProperty('importe');
  });

  it('valida titularidad y relaciones con entidades del mismo inmueble', () => {
    expect(() => validarRelacionesDocumento(INMUEBLE, 'prop_7', { gastoId: 'gas_1' }, { gastoId: GASTO })).not.toThrow();
    expect(() => validarRelacionesDocumento(INMUEBLE, 'prop_7', { gastoId: 'gas_otro' }, { gastoId: GASTO })).toThrow(/relación/i);
    expect(() => validarRelacionesDocumento(INMUEBLE, 'prop_7', { gastoId: 'gas_1' }, { gastoId: { ...GASTO, inmuebleId: 'inm_otro' } })).toThrow(/relación/i);
    expect(() => validarRelacionesDocumento(INMUEBLE, 'prop_otro', {}, {})).toThrow(/titular/i);
    expect(() => validarRelacionesDocumento(INMUEBLE, 'prop_7', { movimientoId: 'GASTO:gas_2' }, {})).toThrow(/operación/i);
    expect(() => validarRelacionesDocumento(
      INMUEBLE, 'prop_7', { gastoId: 'gas_1', contratoId: 'ct_other' },
      { gastoId: { ...GASTO, contratoId: 'ct_1' }, contratoId: { id: 'ct_other', inmuebleId: 'inm_42', propietarioId: 'prop_7' } }
    )).toThrow(/contrato/i);
    expect(() => validarRelacionesDocumento(
      INMUEBLE, 'prop_7', { gastoId: 'gas_1', facturaId: 'fac_1' },
      { gastoId: GASTO, facturaId: { id: 'fac_1', inmuebleId: 'inm_42', propietarioId: 'prop_7', gastoId: 'gas_1' } }
    )).not.toThrow();
    expect(() => validarRelacionesDocumento(
      INMUEBLE, 'prop_7', { gastoId: 'gas_1', facturaId: 'fac_1' },
      { gastoId: GASTO, facturaId: { id: 'fac_1', inmuebleId: 'inm_42', propietarioId: 'prop_7', gastoId: 'gas_other' } }
    )).toThrow(/factura/i);
  });

  it('aplica ciclo de vida sin sobrescritura ni borrado físico silenciosos', () => {
    expect(() => validarTransicionDocumento('PENDIENTE_STORAGE', 'DISPONIBLE')).not.toThrow();
    expect(() => validarTransicionDocumento('DISPONIBLE', 'PENDIENTE_ELIMINACION')).not.toThrow();
    expect(() => validarTransicionDocumento('PENDIENTE_ELIMINACION', 'ELIMINADO')).not.toThrow();
    expect(() => validarTransicionDocumento('DISPONIBLE', 'PENDIENTE_STORAGE')).toThrow(/No se permite/);
    expect(() => validarTransicionDocumento('ELIMINADO', 'DISPONIBLE')).toThrow(/No se permite/);
  });

  it('proyecta los documentos nuevos al índice y oculta tombstones, sin duplicar la fuente económica', () => {
    const disponible = crear('DISPONIBLE');
    const pendiente = crear('PENDIENTE_STORAGE', { id: 'doc_pending_123', sha256: 'b'.repeat(64), storagePath: 'inmuebles/inm_42/documentos_patrimoniales/doc_pending_123/pending.pdf' });
    const eliminado = crear('ELIMINADO', { id: 'doc_deleted_123', sha256: 'c'.repeat(64) });
    const nuevaVersion = crear('DISPONIBLE', {
      id: 'doc_new_version_123', sha256: 'd'.repeat(64), version: 2, sustituyeA: disponible.id,
      storagePath: 'inmuebles/inm_42/documentos_patrimoniales/doc_new_version_123/v2.pdf',
    });
    const index = construirIndiceDocumentalInmueble({
      inmueble: INMUEBLE,
      documentosPatrimoniales: [disponible, pendiente, eliminado, nuevaVersion],
      generadoEl: '2026-09-28T10:00:00.000Z',
    });
    expect(index.entradas).toHaveLength(3);
    expect(index.entradas.find((x) => x.origenDocumentoId === disponible.id)).toMatchObject({
      entidadOrigen: 'inmuebles', tipo: 'FACTURA_GASTO', gastoId: 'gas_1', mimeType: 'application/pdf', tamanoBytes: 1024,
    });
    expect(index.entradas.find((x) => x.origenDocumentoId === pendiente.id)?.estado).toBe('PENDIENTE');
    expect(index.entradas.find((x) => x.origenDocumentoId === disponible.id)?.estado).toBe('SUSTITUIDO');
    expect(index.entradas.find((x) => x.origenDocumentoId === nuevaVersion.id)?.sustituyeA)
      .toBe(index.entradas.find((x) => x.origenDocumentoId === disponible.id)?.id);
    expect(index.estadisticas.disponibles).toBe(1);
  });

  it('las reglas exigen metadata contextual y estado para descargar/subir/borrar (comprobación estática; no Emulator)', () => {
    const storageRules = readFileSync('storage.rules', 'utf8');
    const firestoreRules = readFileSync('firestore.rules', 'utf8');
    expect(storageRules).toMatch(/match \/inmuebles\/\{inmuebleId\}\/documentos_patrimoniales\/\{documentoId\}\/\{fileName\}/);
    expect(storageRules).toMatch(/allow get: if ambitoInmuebleLectura\(inmuebleId\)[\s\S]*?estado == 'DISPONIBLE'/);
    expect(storageRules).toMatch(/allow create: if ambitoInmuebleEscritura\(inmuebleId\)[\s\S]*?estado == 'PENDIENTE_STORAGE'/);
    expect(storageRules).toMatch(/allow delete: if ambitoInmuebleBorrado\(inmuebleId\)[\s\S]*?estado == 'PENDIENTE_ELIMINACION'/);
    expect(firestoreRules).toMatch(/match \/documentos_patrimoniales\/\{documentoId\}/);
    expect(firestoreRules).toMatch(/function relacionesDocumentoValidas\(d\)/);
    expect(firestoreRules).toMatch(/function facturaEnInmueble\(d\)/);
    expect(firestoreRules).toMatch(/function sustitucionDocumentoValida\(d\)/);
    expect(firestoreRules).toMatch(/inmuebleEsMio\(inmuebleDoc\(\)\) \|\| inmuebleEnCarteraEscritura/);
    expect(firestoreRules).toMatch(/inmuebleParcialIndexado\(inmuebleDoc\(\)\.propietarioId, inmuebleId, true\)/);
    expect(firestoreRules).toMatch(/allow delete: if false; \/\/ tombstone/);
  });
});
