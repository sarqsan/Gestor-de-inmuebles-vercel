import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Peticion } from './harness/firestoreRulesEval';
import { crearEvaluadorStorage, type PeticionStorage } from './harness/storageRulesEval';

const STORAGE = readFileSync(resolve(__dirname, '..', 'storage.rules'), 'utf8');
const FIRESTORE = readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8');
const { permiteStorage } = crearEvaluadorStorage(STORAGE, FIRESTORE);
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
});
function op(db: Peticion['db'], verb: 'get' | 'create' | 'update' | 'delete', path: string): boolean {
  const request: PeticionStorage = { auth: gestorAuth, db, path, metadata: verb === 'create' ? { size: 1024, contentType: 'application/pdf', name: path } : null };
  return permiteStorage(verb, request);
}

describe('ROADMAP-04 · documentos y recibos por contrato parcial', () => {
  it('permite documentos del contrato solo cuando relación e inmueble coinciden', () => {
    const db = dbFor();
    for (const path of ['contratos/ct-a/contrato.pdf', 'recibos/ct-a/cobro-2026-01/recibo.pdf']) {
      expect(op(db, 'get', path)).toBe(true);
      expect(op(db, 'create', path)).toBe(true);
      expect(op(db, 'delete', path)).toBe(false); // el gestor no borra archivos del histórico
    }
    expect(op(db, 'get', 'contratos/ct-b/contrato.pdf')).toBe(false);
    expect(op(db, 'create', 'recibos/ct-b/cobro-1/recibo.pdf')).toBe(false);
  });

  it('LECTURA concede descarga, pero no subida; revocación y titular incoherente deniegan', () => {
    const soloLectura = dbFor(gestion({ permiso: 'LECTURA', responsableActual: 'TITULAR' }));
    expect(op(soloLectura, 'get', 'contratos/ct-a/contrato.pdf')).toBe(true);
    expect(op(soloLectura, 'create', 'recibos/ct-a/cobro-1/recibo.pdf')).toBe(false);
    expect(op(dbFor(gestion({ estado: 'REVOCADA' })), 'get', 'contratos/ct-a/contrato.pdf')).toBe(false);
    const malVinculada = dbFor();
    malVinculada['contratos_formalizacion/ct-a'] = { id: 'ct-a', propietarioId: 'prop-b', inmuebleId: 'inm-a' };
    expect(op(malVinculada, 'get', 'contratos/ct-a/contrato.pdf')).toBe(false);
  });
});
