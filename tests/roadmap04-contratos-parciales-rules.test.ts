import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RULES = readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8');
const { permite } = crearEvaluadorReglas(RULES);
const AUTH = { uid: 'uid-gestor', token: { email: 'gestor@test.local' } };
const gestion = (overrides: Record<string, unknown> = {}) => ({
  id: 'g-partial', propietarioId: 'prop-a', gestorUsuarioId: 'gestor-app',
  inmuebleIds: ['inm-a'], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
  estado: 'ACTIVA', resolucionInvitacion: 'ACEPTADA', ...overrides,
});
const espejo = (overrides: Record<string, unknown> = {}) => ({
  uid: AUTH.uid, usuarioId: 'gestor-app', email: 'gestor@test.local', tipoPerfil: 'PROFESIONAL',
  estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof-1', inmuebleIds: [],
  carterasL: [], carterasE: [], gestionesPorPropietario: { 'prop-a': 'g-partial' }, ...overrides,
});
const baseDb = (g = gestion(), mirror = espejo()): Peticion['db'] => ({
  'usuarios/gestor-app': { id: 'gestor-app', authUid: AUTH.uid, email: 'gestor@test.local', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', roles: [], propietarioId: '', profesionalId: 'prof-1', inmuebleIds: [] },
  [`usuarios_auth/${AUTH.uid}`]: mirror,
  'gestiones_cartera/g-partial': g,
  'inmuebles/inm-a': { id: 'inm-a', propietarioId: 'prop-a' },
  'inmuebles/inm-b': { id: 'inm-b', propietarioId: 'prop-b' },
});
const CT_A = { id: 'ct-a', propietarioId: 'prop-a', inmuebleId: 'inm-a', candidatoId: 'cand-a', estado: 'FIRMADO' };
function req(db: Peticion['db'], operation: 'get' | 'list' | 'create' | 'update' | 'delete', resource: Record<string, unknown> | null, incoming: Record<string, unknown> | null = null, docId = 'ct-a'): Peticion {
  return { auth: AUTH, db, resource, requestResource: incoming, docId };
}

describe('ROADMAP-04 · Firestore Rules para contratos delegados parcialmente', () => {
  it('permite lectura de contrato únicamente con relación activa y propiedad coherente', () => {
    const db = { ...baseDb(), 'contratos_formalizacion/ct-a': CT_A };
    expect(permite('contratos_formalizacion', 'get', req(db, 'get', CT_A))).toBe(true);
    expect(permite('contratos_formalizacion', 'list', req(db, 'list', CT_A))).toBe(true);
    const fueraAmbito = { ...CT_A, inmuebleId: 'inm-b', propietarioId: 'prop-b' };
    expect(permite('contratos_formalizacion', 'get', req(db, 'get', fueraAmbito))).toBe(false);
    expect(permite('contratos_formalizacion', 'list', req(db, 'list', fueraAmbito))).toBe(false);
  });

  it('concede escrituras solo con permiso LECTURA_ESCRITURA y conserva inmueble/titular al actualizar', () => {
    const db = { ...baseDb(), 'contratos_formalizacion/ct-a': CT_A };
    expect(permite('contratos_formalizacion', 'create', req(db, 'create', null, { ...CT_A, id: 'ct-new' }))).toBe(true);
    expect(permite('contratos_formalizacion', 'update', req(db, 'update', CT_A, { ...CT_A, estado: 'FINALIZADO' }))).toBe(true);
    expect(permite('contratos_formalizacion', 'update', req(db, 'update', CT_A, { ...CT_A, inmuebleId: 'inm-b', propietarioId: 'prop-b' }))).toBe(false);
    expect(permite('contratos_formalizacion', 'create', req(db, 'create', null, { ...CT_A, inmuebleId: 'inm-b', propietarioId: 'prop-b' }))).toBe(false);

    const soloLectura = baseDb(gestion({ permiso: 'LECTURA', responsableActual: 'TITULAR' }));
    expect(permite('contratos_formalizacion', 'get', req(soloLectura, 'get', CT_A))).toBe(true);
    expect(permite('contratos_formalizacion', 'create', req(soloLectura, 'create', null, { ...CT_A, id: 'ct-new' }))).toBe(false);
    expect(permite('contratos_formalizacion', 'update', req(soloLectura, 'update', CT_A, { ...CT_A, estado: 'FINALIZADO' }))).toBe(false);
  });

  it('aplica el mismo ámbito titular/inmueble a habitaciones y solo permite escribir con permiso', () => {
    const room = { id: 'hab-a', propietarioId: 'prop-a', inmuebleId: 'inm-a', nombre: 'Habitación', estado: 'OCUPADA', contratoId: 'ct-a' };
    const db = { ...baseDb(), 'habitaciones_inmueble/hab-a': room };
    expect(permite('habitaciones_inmueble', 'get', req(db, 'get', room, null, 'hab-a'))).toBe(true);
    expect(permite('habitaciones_inmueble', 'list', req(db, 'list', room, null, 'hab-a'))).toBe(true);
    expect(permite('habitaciones_inmueble', 'update', req(db, 'update', room, { ...room, estado: 'DISPONIBLE', contratoId: undefined }, 'hab-a'))).toBe(true);
    expect(permite('habitaciones_inmueble', 'update', req(db, 'update', room, { ...room, propietarioId: 'prop-b' }, 'hab-a'))).toBe(false);
    const fueraAmbito = { ...room, inmuebleId: 'inm-b', propietarioId: 'prop-b' };
    expect(permite('habitaciones_inmueble', 'get', req(db, 'get', fueraAmbito, null, 'hab-a'))).toBe(false);
    const lectura = baseDb(gestion({ permiso: 'LECTURA', responsableActual: 'TITULAR' }));
    expect(permite('habitaciones_inmueble', 'get', req({ ...lectura, 'habitaciones_inmueble/hab-a': room }, 'get', room, null, 'hab-a'))).toBe(true);
    expect(permite('habitaciones_inmueble', 'update', req({ ...lectura, 'habitaciones_inmueble/hab-a': room }, 'update', room, { ...room, estado: 'DISPONIBLE' }, 'hab-a'))).toBe(false);
  });

  it('falla cerrado para relación revocada, relación ajena, PID incoherente e inmuebleId conocido', () => {
    const revocada = baseDb(gestion({ estado: 'REVOCADA' }));
    expect(permite('contratos_formalizacion', 'get', req(revocada, 'get', CT_A))).toBe(false);
    const otroGestor = baseDb(gestion({ gestorUsuarioId: 'otro' }));
    expect(permite('contratos_formalizacion', 'get', req(otroGestor, 'get', CT_A))).toBe(false);
    const pidIncoherente = { ...CT_A, propietarioId: 'prop-b' };
    expect(permite('contratos_formalizacion', 'get', req(baseDb(), 'get', pidIncoherente))).toBe(false);
    expect(permite('contratos_formalizacion', 'get', req(baseDb(), 'get', { ...CT_A, inmuebleId: 'inm-b', propietarioId: 'prop-a' }))).toBe(false);
  });
});
