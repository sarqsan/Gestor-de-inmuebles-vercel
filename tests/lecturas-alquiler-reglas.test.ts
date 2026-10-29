/** Evalúa predicados de reglas sobre datos sintéticos; no sustituye al emulador oficial. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const { permite } = crearEvaluadorReglas(readFileSync('firestore.rules', 'utf8'));
const auth = { uid: 'u1', token: { email: 'prop@example.invalid', email_verified: true } };
const db = {
  'usuarios_auth/u1': { uid: 'u1', usuarioId: 'user1', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'p1', inmuebleIds: [] },
  'usuarios/user1': { authUid: 'u1', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'p1' },
  'inmuebles/propio': { propietarioId: 'p1', titularesIds: ['p1'] },
  'inmuebles/compartido': { propietarioId: 'p2', titularesIds: ['p1', 'p2'] },
  'inmuebles/ajeno': { propietarioId: 'p2', titularesIds: ['p2'] },
};
const peticion = (inmuebleId: string | null, sesion = auth): Peticion => ({
  auth: sesion, db, resource: inmuebleId ? { inmuebleId } : {}, requestResource: null, docId: 'x',
});

describe('reglas de alquiler sobre inmueble real (evaluador local)', () => {
  for (const col of ['solicitudes', 'candidatos', 'solicitudes_documentacion', 'invitaciones', 'slots_visita']) {
    it(`${col}: autoriza propio y compartido, rechaza ajeno o sin inmueble`, () => {
      expect(permite(col, 'list', peticion('propio'))).toBe(true);
      expect(permite(col, 'list', peticion('compartido'))).toBe(true);
      expect(permite(col, 'list', peticion('ajeno'))).toBe(false);
      expect(permite(col, 'list', peticion(null))).toBe(false);
    });
  }
  it('un propietarioId falsificado no da acceso al inmueble ajeno', () => {
    const p = { ...peticion('ajeno'), resource: { inmuebleId: 'ajeno', propietarioId: 'p1' } };
    for (const col of ['solicitudes', 'candidatos', 'solicitudes_documentacion', 'invitaciones', 'slots_visita']) {
      expect(permite(col, 'list', p)).toBe(false);
      expect(permite(col, 'get', p)).toBe(false);
    }
  });
  it('no autoriza a un usuario anónimo o bloqueado', () => {
    for (const col of ['solicitudes', 'candidatos', 'solicitudes_documentacion', 'invitaciones', 'slots_visita']) {
      expect(permite(col, 'list', { ...peticion('propio'), auth: null })).toBe(false);
      expect(permite(col, 'list', { ...peticion('propio'), db: { ...db, 'usuarios/user1': { ...db['usuarios/user1'], estado: 'BLOQUEADO' } } })).toBe(false);
    }
  });

});
