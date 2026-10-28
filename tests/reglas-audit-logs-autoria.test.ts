/**
 * P0.2.8 — `audit_logs.create` ya no permite suplantar la autoría.
 * Se evalúa el TEXTO REAL de `firestore.rules` con el harness compartido;
 * el emulador oficial sigue siendo la verificación pendiente en CI.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RULES = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
const { permite } = crearEvaluadorReglas(RULES);
const MASTER = 'sarqsan2@gmail.com';

function peticion(email: string | null, datos: Record<string, unknown>, esMaster = false): Peticion {
  return {
    auth: email === null ? null : {
      uid: esMaster ? 'uid-master' : 'uid-normal',
      token: { email, email_verified: true },
    },
    db: {},
    resource: null,
    requestResource: { id: 'a1', accion: 'PRUEBA', ...datos },
    docId: 'a1',
  };
}

const crear = (p: Peticion) => permite('audit_logs', 'create', p);

describe('audit_logs · autoría verificada', () => {
  it('el anónimo NO crea registros de auditoría', () => {
    expect(crear(peticion(null, { usuarioEmail: '' }))).toBe(false);
  });

  it('un usuario SÍ crea un registro con su propio correo', () => {
    expect(crear(peticion('prop@erp.test', { usuarioEmail: 'prop@erp.test' }))).toBe(true);
  });

  it('un usuario NO puede atribuir el registro a otro correo', () => {
    expect(crear(peticion('prop@erp.test', { usuarioEmail: 'otro@erp.test' }))).toBe(false);
  });

  it('los registros automáticos sin autor (vacío o ausente) siguen admitiéndose', () => {
    expect(crear(peticion('prop@erp.test', { usuarioEmail: '' }))).toBe(true);
    expect(crear(peticion('prop@erp.test', {}))).toBe(true);
  });

  it('el master puede auditar operaciones del sistema con cualquier autor', () => {
    expect(crear(peticion(MASTER, { usuarioEmail: 'system@erp.test' }, true))).toBe(true);
  });

  it('los registros siguen siendo inmutables', () => {
    const p = peticion('prop@erp.test', { usuarioEmail: 'prop@erp.test' });
    expect(permite('audit_logs', 'update', { ...p, resource: p.requestResource })).toBe(false);
    expect(permite('audit_logs', 'delete', { ...p, resource: p.requestResource })).toBe(false);
  });
});
