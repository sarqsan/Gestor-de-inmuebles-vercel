/**
 * CAPA TRANSVERSAL §6 — FASE 3 · Tests del servicio de progreso de tutoriales.
 *
 * - Parte pura (`src/experiencia/progreso.ts`): validación, conversión sesión ⇄ progreso.
 * - Servicio Firestore (`src/lib/progresoTutorialesFirestore.ts`) sobre el arnés en memoria
 *   del BLOQUE E (Firestore/Auth simulados; sin Firebase real).
 * - Seguridad: comprobación ESTÁTICA de `firestore.rules` (el sandbox no puede ejecutar el
 *   emulador de reglas → validación contra Firebase real = NV, documentado en el MAPA).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { authSintetico, resetEntornoE } from '../test/e/setupE';
import { memoria } from '../test/e/firestoreMemoria';
import {
  RECORRIDO_INVITAR_INQUILINO,
  RECORRIDO_PORTAL_INQUILINO,
  TUTORIAL_LIQUIDACION,
  avanzar,
  cancelar,
  esProgresoValido,
  finalizar,
  idProgreso,
  iniciarTutorial,
  progresoDesdeSesion,
  rutaProgreso,
  saltar,
  sesionDesdeProgreso,
  type TutorialProgress,
} from './index';
import { clearTutorialProgress, getTutorialProgress, saveTutorialProgress, servicioProgresoTutoriales } from '../lib/progresoTutorialesFirestore';

const UID_A = 'uid_TEST_F3_A';
const UID_B = 'uid_TEST_F3_B';
const RUTA_A = rutaProgreso(UID_A, 'ERP', TUTORIAL_LIQUIDACION.id);
const RUTA_B = rutaProgreso(UID_B, 'ERP', TUTORIAL_LIQUIDACION.id);
const colB = `usuarios_auth/${UID_B}/progreso_tutoriales`;

const entrar = (uid: string) => {
  authSintetico.usuarioActual = { uid, email: `${uid}@test.local` };
};

const progresoBase = (extra: Partial<TutorialProgress> = {}): TutorialProgress => ({
  tutorialId: TUTORIAL_LIQUIDACION.id,
  host: 'ERP',
  currentStep: 2,
  stepCount: 5,
  completed: false,
  skippedSteps: [],
  startedAt: '2026-09-21T10:00:00.000Z',
  updatedAt: '2026-09-21T10:05:00.000Z',
  ...extra,
});

beforeEach(() => resetEntornoE());
afterEach(() => resetEntornoE());

// ===========================================================================
// 1. Modelo puro
// ===========================================================================
describe('§6 F3 · modelo de progreso (puro)', () => {
  it('id/ruta por host y tutorial (sin colisiones entre ERP y Portal)', () => {
    expect(idProgreso('ERP', 'x')).toBe('ERP__x');
    expect(idProgreso('PORTAL_INQUILINO', 'x')).not.toBe(idProgreso('ERP', 'x'));
    expect(RUTA_A).toBe(`usuarios_auth/${UID_A}/progreso_tutoriales/ERP__${TUTORIAL_LIQUIDACION.id}`);
  });

  it('esProgresoValido: acepta el modelo mínimo y rechaza claves extra, tipos, rangos y hosts inválidos', () => {
    expect(esProgresoValido(progresoBase())).toBe(true);
    expect(esProgresoValido(progresoBase({ completedAt: '2026-09-21T10:06:00.000Z', completed: true }))).toBe(true);
    const invalidos: unknown[] = [
      null,
      [],
      { ...progresoBase(), contenido: 'html arbitrario' },
      { ...progresoBase(), steps: [{ title: 'inyectado' }] },
      progresoBase({ host: 'OTRO' as 'ERP' }),
      progresoBase({ currentStep: -1 }),
      progresoBase({ currentStep: 1.5 }),
      progresoBase({ currentStep: 100 }),
      progresoBase({ stepCount: 0 }),
      progresoBase({ completed: 'si' as unknown as boolean }),
      progresoBase({ skippedSteps: 'a' as unknown as string[] }),
      progresoBase({ skippedSteps: [1] as unknown as string[] }),
      progresoBase({ startedAt: 'ayer' }),
      progresoBase({ updatedAt: '' }),
      progresoBase({ tutorialId: '' }),
      progresoBase({ tutorialId: 'x'.repeat(129) }),
      progresoBase({ completedAt: 'nunca' }),
    ];
    for (const d of invalidos) expect(esProgresoValido(d)).toBe(false);
  });

  it('progresoDesdeSesion: refleja paso/saltados; completed es pegajoso y conserva startedAt/completedAt previos', () => {
    let s = iniciarTutorial(TUTORIAL_LIQUIDACION, () => '2026-09-21T10:00:00.000Z');
    s = avanzar(s, TUTORIAL_LIQUIDACION);
    s = saltar(s, TUTORIAL_LIQUIDACION);
    const p = progresoDesdeSesion(s, TUTORIAL_LIQUIDACION, null, () => '2026-09-21T10:01:00.000Z');
    expect(p).toEqual({
      tutorialId: TUTORIAL_LIQUIDACION.id,
      host: 'ERP',
      currentStep: 2,
      stepCount: 5,
      completed: false,
      skippedSteps: [TUTORIAL_LIQUIDACION.steps[1].id],
      startedAt: '2026-09-21T10:00:00.000Z',
      updatedAt: '2026-09-21T10:01:00.000Z',
    });
    expect(esProgresoValido(p)).toBe(true);
    // completar
    let f = s;
    while (f.indice < 4) f = avanzar(f, TUTORIAL_LIQUIDACION);
    f = finalizar(f, TUTORIAL_LIQUIDACION, () => '2026-09-21T10:02:00.000Z');
    const pc = progresoDesdeSesion(f, TUTORIAL_LIQUIDACION, p, () => '2026-09-21T10:02:00.000Z');
    expect(pc.completed).toBe(true);
    expect(pc.completedAt).toBe('2026-09-21T10:02:00.000Z');
    expect(pc.startedAt).toBe('2026-09-21T10:00:00.000Z');
    // repetir tras completar: sigue completed y conserva completedAt
    const pr = progresoDesdeSesion(iniciarTutorial(TUTORIAL_LIQUIDACION, () => '2026-09-22T09:00:00.000Z'), TUTORIAL_LIQUIDACION, pc, () => '2026-09-22T09:00:00.000Z');
    expect(pr.completed).toBe(true);
    expect(pr.completedAt).toBe('2026-09-21T10:02:00.000Z');
    expect(pr.startedAt).toBe('2026-09-21T10:00:00.000Z');
    expect(pr.currentStep).toBe(0);
  });

  it('sesionDesdeProgreso: reanuda en curso; no reanuda si completado, paso 0 sin saltos, otra versión, otro tutorial/host o paso fuera de rango', () => {
    const r = sesionDesdeProgreso(progresoBase({ skippedSteps: [TUTORIAL_LIQUIDACION.steps[1].id, 'paso-que-ya-no-existe'] }), TUTORIAL_LIQUIDACION);
    expect(r).toEqual({ tutorialId: TUTORIAL_LIQUIDACION.id, indice: 2, estado: 'EN_CURSO', iniciadoEn: '2026-09-21T10:00:00.000Z', saltados: [TUTORIAL_LIQUIDACION.steps[1].id] });
    expect(sesionDesdeProgreso(null, TUTORIAL_LIQUIDACION)).toBeNull();
    expect(sesionDesdeProgreso(progresoBase({ completed: true }), TUTORIAL_LIQUIDACION)).toBeNull();
    expect(sesionDesdeProgreso(progresoBase({ currentStep: 0 }), TUTORIAL_LIQUIDACION)).toBeNull();
    expect(sesionDesdeProgreso(progresoBase({ stepCount: 6 }), TUTORIAL_LIQUIDACION)).toBeNull();
    expect(sesionDesdeProgreso(progresoBase({ currentStep: 7, stepCount: 8 }), TUTORIAL_LIQUIDACION)).toBeNull();
    expect(sesionDesdeProgreso(progresoBase(), RECORRIDO_INVITAR_INQUILINO)).toBeNull();
    expect(sesionDesdeProgreso(progresoBase({ host: 'PORTAL_INQUILINO' }), TUTORIAL_LIQUIDACION)).toBeNull();
    expect(sesionDesdeProgreso({ ...progresoBase(), extra: 1 } as unknown as TutorialProgress, TUTORIAL_LIQUIDACION)).toBeNull();
  });
});

// ===========================================================================
// 2. Servicio Firestore (arnés en memoria)
// ===========================================================================
describe('§6 F3 · servicio de progreso (Firestore simulado)', () => {
  it('usuario no autenticado → NO_AUTENTICADO en get/save/clear, sin tocar Firestore', async () => {
    expect(await getTutorialProgress(TUTORIAL_LIQUIDACION.id)).toEqual({ ok: false, motivo: 'NO_AUTENTICADO' });
    expect(await saveTutorialProgress(iniciarTutorial(TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION)).toEqual({ ok: false, motivo: 'NO_AUTENTICADO' });
    expect(await clearTutorialProgress(TUTORIAL_LIQUIDACION.id)).toEqual({ ok: false, motivo: 'NO_AUTENTICADO' });
    expect(memoria.accesos).toEqual([]);
  });

  it('usuario sin progreso → ok/null; guardar crea el documento propio; leer lo devuelve; actualizar sobrescribe', async () => {
    entrar(UID_A);
    expect(await getTutorialProgress(TUTORIAL_LIQUIDACION.id)).toEqual({ ok: true, data: null });
    let s = iniciarTutorial(TUTORIAL_LIQUIDACION);
    const r1 = await saveTutorialProgress(s, TUTORIAL_LIQUIDACION);
    expect(r1.ok).toBe(true);
    expect(memoria.rutasEscritas()).toEqual([RUTA_A]);
    const leido = await getTutorialProgress(TUTORIAL_LIQUIDACION.id);
    expect(leido.ok && leido.data?.currentStep).toBe(0);
    s = avanzar(avanzar(s, TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION);
    const r2 = await saveTutorialProgress(s, TUTORIAL_LIQUIDACION);
    expect(r2.ok && r2.data.currentStep).toBe(2);
    const doc = memoria.leer<TutorialProgress>(`usuarios_auth/${UID_A}/progreso_tutoriales`, idProgreso('ERP', TUTORIAL_LIQUIDACION.id));
    expect(doc?.currentStep).toBe(2);
    expect(doc && esProgresoValido(doc)).toBe(true);
    expect(Object.keys(doc!).sort()).toEqual(['completed', 'currentStep', 'host', 'skippedSteps', 'startedAt', 'stepCount', 'tutorialId', 'updatedAt']);
  });

  it('cancelar guarda el paso actual; completar marca completed/completedAt; borrar deja ok/null', async () => {
    entrar(UID_A);
    let s = avanzar(iniciarTutorial(TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION);
    await saveTutorialProgress(cancelar(s), TUTORIAL_LIQUIDACION);
    let g = await getTutorialProgress(TUTORIAL_LIQUIDACION.id);
    expect(g.ok && g.data).toMatchObject({ currentStep: 1, completed: false });
    while (s.indice < 4) s = avanzar(s, TUTORIAL_LIQUIDACION);
    const rf = await saveTutorialProgress(finalizar(s, TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION);
    expect(rf.ok && rf.data).toMatchObject({ currentStep: 4, completed: true });
    expect(rf.ok && typeof rf.data.completedAt).toBe('string');
    g = await getTutorialProgress(TUTORIAL_LIQUIDACION.id);
    expect(g.ok && g.data?.completed).toBe(true);
    expect(await clearTutorialProgress(TUTORIAL_LIQUIDACION.id)).toEqual({ ok: true, data: null });
    expect(await getTutorialProgress(TUTORIAL_LIQUIDACION.id)).toEqual({ ok: true, data: null });
    expect(await clearTutorialProgress(TUTORIAL_LIQUIDACION.id)).toEqual({ ok: true, data: null }); // idempotente
  });

  it('tutorialId desconocido, host incoherente o sesión de otro tutorial → TUTORIAL_DESCONOCIDO sin escribir', async () => {
    entrar(UID_A);
    expect(await getTutorialProgress('tutorial.inventado')).toEqual({ ok: false, motivo: 'TUTORIAL_DESCONOCIDO' });
    expect(await getTutorialProgress(TUTORIAL_LIQUIDACION.id, 'PORTAL_INQUILINO')).toEqual({ ok: false, motivo: 'TUTORIAL_DESCONOCIDO' });
    expect(await clearTutorialProgress('../usuarios')).toEqual({ ok: false, motivo: 'TUTORIAL_DESCONOCIDO' });
    const falso = { ...TUTORIAL_LIQUIDACION, id: 'tutorial.falso' };
    expect(await saveTutorialProgress(iniciarTutorial(falso), falso)).toEqual({ ok: false, motivo: 'TUTORIAL_DESCONOCIDO' });
    expect(await saveTutorialProgress(iniciarTutorial(RECORRIDO_PORTAL_INQUILINO), TUTORIAL_LIQUIDACION)).toEqual({ ok: false, motivo: 'TUTORIAL_DESCONOCIDO' });
    expect(memoria.rutasEscritas()).toEqual([]);
  });

  it('error de Firestore → ERROR_FIRESTORE con detalle, sin lanzar; documento corrupto al leer → null', async () => {
    entrar(UID_A);
    memoria.fallar('get', RUTA_A, 'unavailable (simulado)');
    const g = await getTutorialProgress(TUTORIAL_LIQUIDACION.id);
    expect(g).toEqual({ ok: false, motivo: 'ERROR_FIRESTORE', detalle: 'unavailable (simulado)' });
    const sv = await saveTutorialProgress(iniciarTutorial(TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION);
    expect(sv.ok).toBe(false);
    memoria.reset();
    entrar(UID_A);
    memoria.fallar('set', RUTA_A, 'permission-denied (simulado)');
    expect((await saveTutorialProgress(iniciarTutorial(TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION)).ok).toBe(false);
    memoria.fallar('delete', RUTA_A);
    expect((await clearTutorialProgress(TUTORIAL_LIQUIDACION.id)).ok).toBe(false);
    memoria.reset();
    entrar(UID_A);
    memoria.sembrar(`usuarios_auth/${UID_A}/progreso_tutoriales`, idProgreso('ERP', TUTORIAL_LIQUIDACION.id), { ...progresoBase(), currentStep: 999 });
    expect(await getTutorialProgress(TUTORIAL_LIQUIDACION.id)).toEqual({ ok: true, data: null });
  });

  it('ERP y Portal comparten el servicio: mismo usuario, dos hosts, documentos distintos', async () => {
    entrar(UID_A);
    await saveTutorialProgress(avanzar(iniciarTutorial(TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION);
    await servicioProgresoTutoriales.saveTutorialProgress(avanzar(iniciarTutorial(RECORRIDO_PORTAL_INQUILINO), RECORRIDO_PORTAL_INQUILINO), RECORRIDO_PORTAL_INQUILINO);
    expect(memoria.idsDe(`usuarios_auth/${UID_A}/progreso_tutoriales`).sort()).toEqual(
      [idProgreso('ERP', TUTORIAL_LIQUIDACION.id), idProgreso('PORTAL_INQUILINO', RECORRIDO_PORTAL_INQUILINO.id)].sort()
    );
  });
});

// ===========================================================================
// 3. Seguridad
// ===========================================================================
describe('§6 F3 · seguridad del progreso', () => {
  it('el servicio solo toca la subcolección del UID autenticado: A nunca lee ni escribe el progreso de B', async () => {
    entrar(UID_B);
    await saveTutorialProgress(avanzar(avanzar(iniciarTutorial(TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION);
    expect(memoria.existe(colB, idProgreso('ERP', TUTORIAL_LIQUIDACION.id))).toBe(true);
    memoria.accesos = [];
    entrar(UID_A);
    expect(await getTutorialProgress(TUTORIAL_LIQUIDACION.id)).toEqual({ ok: true, data: null }); // no ve el de B
    await saveTutorialProgress(iniciarTutorial(TUTORIAL_LIQUIDACION), TUTORIAL_LIQUIDACION);
    await clearTutorialProgress(TUTORIAL_LIQUIDACION.id);
    const rutas = memoria.accesos.map((a) => a.ruta);
    expect(rutas.length).toBeGreaterThan(0);
    expect(rutas.every((r) => r.startsWith(`usuarios_auth/${UID_A}/progreso_tutoriales/`))).toBe(true);
    expect(rutas.some((r) => r.includes(UID_B))).toBe(false);
    // el progreso de B sigue intacto
    expect(memoria.leer<TutorialProgress>(colB, idProgreso('ERP', TUTORIAL_LIQUIDACION.id))?.currentStep).toBe(2);
    // el servicio no ofrece ningún parámetro de UID: la identidad viene solo de auth
    expect(getTutorialProgress.length).toBeLessThanOrEqual(2);
    expect(saveTutorialProgress.length).toBe(2);
  });

  it('firestore.rules (comprobación estática — NV contra Firebase real): subcolección bajo usuarios_auth/{uid}, solo el propio uid, sin list, modelo cerrado', () => {
    const reglas = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8');
    const ini = reglas.indexOf('match /usuarios_auth/{uid}');
    const bloque = reglas.slice(ini, reglas.indexOf('// E.0. BLOQUE E', ini));
    expect(ini).toBeGreaterThan(0);
    expect(bloque).toContain('match /progreso_tutoriales/{progresoId}');
    const sub = bloque.slice(bloque.indexOf('match /progreso_tutoriales/{progresoId}'));
    expect(sub).toMatch(/allow get: if isSignedIn\(\) && request\.auth\.uid == uid;/);
    expect(sub).toMatch(/allow list: if false;/);
    expect(sub).toMatch(/allow create, update: if isSignedIn\(\)\s*&& request\.auth\.uid == uid\s*&& isValidId\(progresoId\)\s*&& esProgresoTutorialValido\(incoming\(\), progresoId\);/);
    expect(sub).toMatch(/allow delete: if isSignedIn\(\) && request\.auth\.uid == uid;/);
    expect(sub).not.toMatch(/isMasterAdmin|isStaff|allow read, write: if true/);
    // función de validación: claves cerradas, host, id coherente, rangos
    const fn = bloque.slice(bloque.indexOf('function esProgresoTutorialValido'), bloque.indexOf('match /progreso_tutoriales'));
    expect(fn).toContain("hasOnly(['tutorialId', 'host', 'currentStep', 'stepCount', 'completed', 'skippedSteps', 'startedAt', 'updatedAt', 'completedAt'])");
    expect(fn).toContain("d.host in ['ERP', 'PORTAL_INQUILINO']");
    expect(fn).toContain("docId == d.host + '__' + d.tutorialId");
    expect(fn).toContain('d.currentStep < d.stepCount');
    expect(fn).toContain('d.completed is bool');
    // la denegación global sigue al final y las reglas del espejo usuarios_auth no se relajaron
    expect(reglas.trimEnd().endsWith('match /{document=**} {\n      allow read, write: if false;\n    }\n  }\n}')).toBe(true);
    expect(bloque).toContain("allow read: if isMasterAdmin() || (isSignedIn() && request.auth.uid == uid);");
  });

  it('el progreso nunca contiene contenido de tutorial ni permisos: solo el modelo mínimo', async () => {
    entrar(UID_A);
    const r = await saveTutorialProgress(avanzar(iniciarTutorial(RECORRIDO_INVITAR_INQUILINO), RECORRIDO_INVITAR_INQUILINO), RECORRIDO_INVITAR_INQUILINO);
    expect(r.ok).toBe(true);
    const json = JSON.stringify(r.ok && r.data);
    expect(json).not.toMatch(/steps|title|description|permis|inquilinos\.gestionar|roles/);
  });
});
