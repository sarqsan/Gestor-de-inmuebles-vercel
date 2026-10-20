import { describe, expect, it } from 'vitest';
// AG-03.2: la autorización documental se ejecuta en el servidor contra la base
// con nombre (no en `storage.rules`). Misma matriz, autorizador real.
import { permiteServidor, type PeticionServidor } from './helpers/autorizacionDocumentalHarness';

type Peticion = { db: PeticionServidor['db'] };
const gestorAuth = { uid: 'uid-gestor', token: { email: 'gestor@test.local' } };
const gestion = (overrides: Record<string, unknown> = {}) => ({
  id: 'g-partial', propietarioId: 'prop-a', gestorUsuarioId: 'gestor-app',
  inmuebleIds: ['inm-a'], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
  estado: 'ACTIVA', resolucionInvitacion: 'ACEPTADA', ...overrides,
});
const mirror = (overrides: Record<string, unknown> = {}) => ({
  uid: gestorAuth.uid, usuarioId: 'gestor-app', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO',
  propietarioId: '', profesionalId: 'prof-1', inmuebleIds: [], carterasL: [], carterasE: [],
  gestionesPorPropietario: { 'prop-a': 'g-partial' }, ...overrides,
});
const dbFor = (rel = gestion()): Peticion['db'] => ({
  [`usuarios_auth/${gestorAuth.uid}`]: mirror(),
  'gestiones_cartera/g-partial': rel,
  'inmuebles/inm-a': { id: 'inm-a', propietarioId: 'prop-a' },
  'inmuebles/inm-b': { id: 'inm-b', propietarioId: 'prop-b' },
  'contratos_formalizacion/ct-a': { id: 'ct-a', propietarioId: 'prop-a', inmuebleId: 'inm-a' },
  'contratos_formalizacion/ct-b': { id: 'ct-b', propietarioId: 'prop-b', inmuebleId: 'inm-b' },
  'inmuebles/inm-a/documentos_patrimoniales/doc-a': {
    id: 'doc-a', inmuebleId: 'inm-a', propietarioId: 'prop-a', estado: 'PENDIENTE_STORAGE',
    storagePath: 'inmuebles/inm-a/documentos_patrimoniales/doc-a/documento.pdf',
    nombreStorage: 'documento.pdf', mimeType: 'application/pdf', tamanoBytes: 1024, sha256: 'a'.repeat(64),
  },
  'inmuebles/inm-b/documentos_patrimoniales/doc-b': {
    id: 'doc-b', inmuebleId: 'inm-b', propietarioId: 'prop-b', estado: 'PENDIENTE_STORAGE',
    storagePath: 'inmuebles/inm-b/documentos_patrimoniales/doc-b/documento.pdf',
    nombreStorage: 'documento.pdf', mimeType: 'application/pdf', tamanoBytes: 1024, sha256: 'b'.repeat(64),
  },
});
function op(db: Peticion['db'], verb: 'get' | 'create' | 'update' | 'delete', path: string, metadata?: Record<string, unknown>): Promise<boolean> {
  const request: PeticionServidor = {
    auth: gestorAuth,
    db,
    path,
    metadata: verb === 'create'
      ? { size: 1024, contentType: 'application/pdf', name: path, metadata: { documentoId: 'doc-a', inmuebleId: 'inm-a', sha256: 'a'.repeat(64) }, ...metadata }
      : null,
  };
  return permiteServidor(verb, request);
}

describe('ROADMAP-04 · documentos y recibos por contrato parcial', () => {
  it('permite documentos del contrato solo cuando relación e inmueble coinciden', async () => {
    const db = dbFor();
    for (const path of ['contratos/ct-a/contrato.pdf', 'recibos/ct-a/cobro-2026-01/recibo.pdf']) {
      expect(await op(db, 'get', path)).toBe(true);
      expect(await op(db, 'create', path)).toBe(true);
      expect(await op(db, 'delete', path)).toBe(false); // el gestor no borra archivos del histórico
    }
    expect(await op(db, 'get', 'contratos/ct-b/contrato.pdf')).toBe(false);
    expect(await op(db, 'create', 'recibos/ct-b/cobro-1/recibo.pdf')).toBe(false);
  });

  it('BLOQUE 6 · autoriza subida documental sólo en los inmuebles enumerados por la delegación parcial vigente', async () => {
    const pathA = 'inmuebles/inm-a/documentos_patrimoniales/doc-a/documento.pdf';
    const pathB = 'inmuebles/inm-b/documentos_patrimoniales/doc-b/documento.pdf';
    expect(await op(dbFor(), 'create', pathA)).toBe(true);
    expect(await op(dbFor(), 'create', pathB, {
      metadata: { documentoId: 'doc-b', inmuebleId: 'inm-b', sha256: 'b'.repeat(64) },
    })).toBe(false);
    expect(await op(dbFor(gestion({ estado: 'REVOCADA' })), 'create', pathA)).toBe(false);
    expect(await op(dbFor(gestion({ responsableActual: 'TITULAR' })), 'create', pathA)).toBe(false);
  });

  it('LECTURA concede descarga, pero no subida; revocación y titular incoherente deniegan', async () => {
    const soloLectura = dbFor(gestion({ permiso: 'LECTURA', responsableActual: 'TITULAR' }));
    expect(await op(soloLectura, 'get', 'contratos/ct-a/contrato.pdf')).toBe(true);
    expect(await op(soloLectura, 'create', 'recibos/ct-a/cobro-1/recibo.pdf')).toBe(false);
    expect(await op(dbFor(gestion({ estado: 'REVOCADA' })), 'get', 'contratos/ct-a/contrato.pdf')).toBe(false);
    const malVinculada = dbFor();
    malVinculada['contratos_formalizacion/ct-a'] = { id: 'ct-a', propietarioId: 'prop-b', inmuebleId: 'inm-a' };
    expect(await op(malVinculada, 'get', 'contratos/ct-a/contrato.pdf')).toBe(false);
  });
});
