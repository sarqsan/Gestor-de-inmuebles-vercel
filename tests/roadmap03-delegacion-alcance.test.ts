import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';
import { crearEvaluadorStorage } from './harness/storageRulesEval';

const root = resolve(__dirname, '..');
const firestoreRules = readFileSync(resolve(root, 'firestore.rules'), 'utf8');
const storageRules = readFileSync(resolve(root, 'storage.rules'), 'utf8');
const { permite } = crearEvaluadorReglas(firestoreRules);
const { permiteStorage } = crearEvaluadorStorage(storageRules, firestoreRules);

const gestion = {
  id: 'gestion_parcial_X', propietarioId: 'titular_X', gestorUsuarioId: 'usuario_gestor',
  estado: 'ACTIVA', resolucionInvitacion: 'ACEPTADA', permiso: 'LECTURA_ESCRITURA',
  responsableActual: 'GESTOR', inmuebleIds: ['inmueble_X1'],
};
const db: Peticion['db'] = {
  'usuarios_auth/uid_gestor': {
    uid: 'uid_gestor', usuarioId: 'usuario_gestor', estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL',
    propietarioId: '', carterasL: [], carterasE: [], gestionesPorPropietario: { titular_X: gestion.id },
  },
  'inmuebles/inmueble_X1': { propietarioId: 'titular_X' },
  'inmuebles/inmueble_X2': { propietarioId: 'titular_X' },
  'inmuebles/inmueble_Y1': { propietarioId: 'titular_Y' },
  'usuarios_auth/uid_titular': { uid: 'uid_titular', usuarioId: 'usuario_titular', estado: 'ACTIVO',
    tipoPerfil: 'PROPIETARIO', propietarioId: 'titular_X', carterasL: [], carterasE: [] },
  'usuarios_auth/uid_sin_relacion': { uid: 'uid_sin_relacion', usuarioId: 'usuario_sin_relacion', estado: 'ACTIVO',
    tipoPerfil: 'PROFESIONAL', propietarioId: '', carterasL: [], carterasE: [] },
  [`gestiones_cartera/${gestion.id}`]: gestion,
};
completarPerfilesSinteticos(db as Record<string, Record<string, unknown>>);
const auth: NonNullable<Peticion['auth']> = { uid: 'uid_gestor', token: { email: 'gestor@test.invalid' } };
const titularAuth: NonNullable<Peticion['auth']> = { uid: 'uid_titular', token: { email: 'titular@test.invalid' } };
const sinRelacionAuth: NonNullable<Peticion['auth']> = { uid: 'uid_sin_relacion', token: { email: 'sin-relacion@test.invalid' } };

function firestore(verbo: 'get' | 'list' | 'update', id: string, data: Record<string, unknown>, actor = auth) {
  const peticion: Peticion = {
    auth: actor, db, resource: data, requestResource: { ...data, descripcion: 'actualizado' }, docId: id,
  };
  return permite('inmuebles', verbo, peticion);
}
function firestoreSuministro(verbo: 'get' | 'update', inmuebleId: string, actor = auth) {
  const resource = { inmuebleId, propietarioId: 'titular_X' };
  return permite('suministros', verbo, {
    auth: actor, db, resource, requestResource: { ...resource, actualizado: true }, docId: `suministro_${inmuebleId}`,
  });
}
function storage(verbo: 'get' | 'create', inmuebleId: string, actor = auth) {
  return permiteStorage(verbo, {
    auth: actor, db, path: `inmuebles/${inmuebleId}/inventario/evidencia.jpg`,
    metadata: { size: 2000, contentType: 'image/jpeg', name: `inmuebles/${inmuebleId}/inventario/evidencia.jpg` },
  });
}

describe('ROADMAP-03 · enforcement de delegación parcial por inmueble', () => {
  it('permite titularidad propia y mantiene la delegación parcial acotada', () => {
    expect(firestore('get', 'inmueble_X1', db['inmuebles/inmueble_X1']!)).toBe(true);
    expect(firestore('update', 'inmueble_X1', db['inmuebles/inmueble_X1']!)).toBe(true);
    expect(firestoreSuministro('get', 'inmueble_X1')).toBe(true);
    expect(firestoreSuministro('update', 'inmueble_X1')).toBe(true);
    expect(storage('get', 'inmueble_X1')).toBe(true);
    expect(storage('create', 'inmueble_X1')).toBe(true);
  });

  it('el titular accede a su cartera propia sin heredar la de terceros', () => {
    expect(firestore('get', 'inmueble_X1', db['inmuebles/inmueble_X1']!, titularAuth)).toBe(true);
    expect(firestore('get', 'inmueble_X2', db['inmuebles/inmueble_X2']!, titularAuth)).toBe(true);
    expect(firestore('get', 'inmueble_Y1', db['inmuebles/inmueble_Y1']!, titularAuth)).toBe(false);
  });

  it('conserva la cartera completa y limita escritura al permiso y responsable vigentes', () => {
    db[`gestiones_cartera/${gestion.id}`] = { ...gestion, inmuebleIds: [] };
    expect(firestore('get', 'inmueble_X2', db['inmuebles/inmueble_X2']!)).toBe(true);
    expect(storage('get', 'inmueble_X2')).toBe(true);
    expect(storage('create', 'inmueble_X2')).toBe(true);
    db[`gestiones_cartera/${gestion.id}`] = { ...gestion, permiso: 'LECTURA', inmuebleIds: ['inmueble_X1'] };
    expect(firestore('get', 'inmueble_X1', db['inmuebles/inmueble_X1']!)).toBe(true);
    expect(firestore('update', 'inmueble_X1', db['inmuebles/inmueble_X1']!)).toBe(false);
    expect(storage('get', 'inmueble_X1')).toBe(true);
    expect(storage('create', 'inmueble_X1')).toBe(false);
    db[`gestiones_cartera/${gestion.id}`] = gestion;
  });

  it('niega un inmueble del mismo titular pero fuera de inmuebleIds aunque se conozcan los IDs', () => {
    expect(firestore('get', 'inmueble_X2', db['inmuebles/inmueble_X2']!)).toBe(false);
    expect(firestore('update', 'inmueble_X2', db['inmuebles/inmueble_X2']!)).toBe(false);
    expect(firestoreSuministro('get', 'inmueble_X2')).toBe(false);
    expect(firestoreSuministro('update', 'inmueble_X2')).toBe(false);
    expect(storage('get', 'inmueble_X2')).toBe(false);
    expect(storage('create', 'inmueble_X2')).toBe(false);
  });

  it('niega sin relación vigente y niega acceso a otro titular/listado global por conocer IDs', () => {
    expect(firestore('get', 'inmueble_X1', db['inmuebles/inmueble_X1']!, sinRelacionAuth)).toBe(false);
    expect(firestore('get', 'inmueble_Y1', db['inmuebles/inmueble_Y1']!)).toBe(false);
    expect(firestore('list', 'inmueble_X1', db['inmuebles/inmueble_X1']!)).toBe(false);
  });

  it.each([
    ['revocada', { ...gestion, estado: 'REVOCADA' }],
    ['suspendida', { ...gestion, estado: 'SUSPENDIDA' }],
    ['no aceptada', { ...gestion, resolucionInvitacion: 'PENDIENTE_ACEPTACION' }],
    ['otro gestor', { ...gestion, gestorUsuarioId: 'usuario_ajeno' }],
    ['titular incoherente', { ...gestion, propietarioId: 'titular_Y' }],
    ['inmueble retirado del alcance parcial', { ...gestion, inmuebleIds: ['inmueble_X2'] }],
  ])('deniega con relación %s', (_caso, relacion) => {
    db[`gestiones_cartera/${gestion.id}`] = relacion;
    expect(firestore('get', 'inmueble_X1', db['inmuebles/inmueble_X1']!)).toBe(false);
    expect(storage('get', 'inmueble_X1')).toBe(false);
    db[`gestiones_cartera/${gestion.id}`] = gestion;
  });

  it('deniega con índice ausente o referencia manipulada', () => {
    const mirror = db['usuarios_auth/uid_gestor']!;
    delete mirror.gestionesPorPropietario;
    expect(firestore('get', 'inmueble_X1', db['inmuebles/inmueble_X1']!)).toBe(false);
    mirror.gestionesPorPropietario = { titular_X: 'gestion_ajena' };
    expect(firestore('get', 'inmueble_X1', db['inmuebles/inmueble_X1']!)).toBe(false);
    mirror.gestionesPorPropietario = { titular_X: gestion.id };
  });
});
