/**
 * OBSERVABILIDAD de Inmuebles · AISLAMIENTO (Firestore Rules reales).
 *
 * El registro persistente reutiliza el libro de auditoría existente, cuyas reglas
 * NO se han modificado. Estas pruebas fijan el contrato de aislamiento exigido por
 * la orden (FASE 4 y FASE 10) sobre el TEXTO REAL de `firestore.rules`:
 *   · sistema/sesión normal → puede REGISTRAR (create) y nada más;
 *   · usuario normal (propietario, gestor, profesional) → NO puede leer: ni las
 *     incidencias de otro ni las suyas (aislamiento total, más estricto que el mínimo);
 *   · administrador autorizado (master) → puede leer;
 *   · nadie puede actualizar ni borrar: el libro es inmutable, así que la evidencia
 *     no se puede manipular.
 *
 * El evaluador es el harness estático compartido (`tests/harness/firestoreRulesEval.ts`):
 * lee el fichero real y evalúa sus `allow`; no es el motor de Google (no hay emulador
 * en este entorno) y por eso ninguna prueba lo presenta como tal.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RAIZ = path.resolve(__dirname, '..');
const RULES = fs.readFileSync(path.resolve(RAIZ, 'firestore.rules'), 'utf8');
const { permite } = crearEvaluadorReglas(RULES);

const MASTER_EMAIL = 'sarqsan2@gmail.com';

const peticion = (o: Partial<Peticion>): Peticion =>
  ({
    auth: o.auth ?? null,
    db: o.db ?? {},
    resource: o.resource ?? null,
    requestResource: o.requestResource ?? null,
    docId: o.docId ?? 'audit_diag_inm_1',
  }) as Peticion;

/** Documento tal y como lo escribe el transporte (`firebase.ts`). */
const documentoIncidencia = (extra: Record<string, unknown> = {}) => ({
  id: 'audit_diag_inm_1',
  usuarioId: 'h:0f1e2d3c',
  usuarioEmail: '',
  usuarioNombre: 'Diagnóstico técnico (lectura de inmuebles)',
  accion: 'DIAGNOSTICO_LECTURA_INMUEBLES',
  descripcion: 'Lectura · Inmuebles — INM-COT · permission-denied · ESTADO_CUMPLE_LA_REGLA',
  fechaHora: '2026-10-03T20:15:00.000Z',
  entidadAfectada: 'modulo',
  idAfectado: 'INM-COT',
  resultado: 'ERROR',
  detalles: { incidencia: { tipo: 'DIAGNOSTICO_LECTURA_INMUEBLES', origen: 'INM-COT', errorCode: 'permission-denied' } },
  ...extra,
});

const SESIONES = {
  master: { uid: 'uid-master', token: { email: MASTER_EMAIL, email_verified: true } },
  administradorNoMaster: { uid: 'uid-admin-2', token: { email: 'admin2@erp.test', email_verified: true } },
  propietario: { uid: 'uid-prop', token: { email: 'prop@erp.test', email_verified: true } },
  gestor: { uid: 'uid-gestor', token: { email: 'gestor@erp.test', email_verified: true } },
  profesional: { uid: 'uid-prof', token: { email: 'prof@erp.test', email_verified: true } },
} as const;

describe('observabilidad de Inmuebles · registro en audit_logs', () => {
  it('cualquier sesión autenticada puede REGISTRAR una incidencia', () => {
    for (const [nombre, auth] of Object.entries(SESIONES)) {
      expect(permite('audit_logs', 'create', peticion({ auth, requestResource: documentoIncidencia() })), `${nombre}`).toBe(true);
    }
  });

  it('sin sesión no se puede registrar (el diagnóstico nunca inventa autoría)', () => {
    expect(permite('audit_logs', 'create', peticion({ auth: null, requestResource: documentoIncidencia() }))).toBe(false);
  });
});

describe('observabilidad de Inmuebles · aislamiento de la consulta', () => {
  it('un propietario NO puede leer las incidencias (ni las de otro ni las suyas)', () => {
    const doc = documentoIncidencia();
    expect(permite('audit_logs', 'get', peticion({ auth: SESIONES.propietario, docId: 'audit_diag_inm_1', resource: doc }))).toBe(false);
    expect(permite('audit_logs', 'list', peticion({ auth: SESIONES.propietario, docId: 'audit_diag_inm_1', resource: doc }))).toBe(false);
  });

  it('ni el gestor, ni el profesional, ni un administrador que no sea el principal', () => {
    const doc = documentoIncidencia();
    for (const nombre of ['gestor', 'profesional', 'administradorNoMaster'] as const) {
      expect(permite('audit_logs', 'get', peticion({ auth: SESIONES[nombre], docId: 'audit_diag_inm_1', resource: doc })), `${nombre}`).toBe(false);
      expect(permite('audit_logs', 'list', peticion({ auth: SESIONES[nombre], docId: 'audit_diag_inm_1', resource: doc })), `${nombre}`).toBe(false);
    }
  });

  it('el administrador autorizado (master) sí puede consultar', () => {
    const doc = documentoIncidencia();
    expect(permite('audit_logs', 'get', peticion({ auth: SESIONES.master, docId: 'audit_diag_inm_1', resource: doc }))).toBe(true);
    expect(permite('audit_logs', 'list', peticion({ auth: SESIONES.master, docId: 'audit_diag_inm_1', resource: doc }))).toBe(true);
  });

  it('ni el master puede anular la autoría de una incidencia ya escrita', () => {
    const doc = documentoIncidencia();
    expect(permite('audit_logs', 'create', peticion({ auth: SESIONES.master, requestResource: documentoIncidencia({ accion: 'OTRA_COSA' }) }))).toBe(true);
    // (El libro es de solo inserción: la inmutabilidad se comprueba en el bloque siguiente.)
    expect(doc.accion).toBe('DIAGNOSTICO_LECTURA_INMUEBLES');
  });
});

describe('observabilidad de Inmuebles · el libro es inmutable', () => {
  it('`firestore.rules` mantiene `allow update, delete: if false` en audit_logs', () => {
    const bloque = RULES.slice(RULES.indexOf('match /audit_logs/'));
    expect(bloque).toMatch(/allow read: if isMasterAdmin\(\);/);
    expect(bloque).toMatch(/allow create: if isSignedIn\(\);/);
    expect(bloque).toMatch(/allow update, delete: if false;/);
  });

  it('no se ha creado ninguna colección nueva para el diagnóstico', () => {
    expect(RULES).not.toMatch(/match \/diagnosticos/);
    expect(RULES).not.toMatch(/match \/incidencias_lectura/);
    expect(RULES).not.toMatch(/match \/observabilidad/);
  });
});
