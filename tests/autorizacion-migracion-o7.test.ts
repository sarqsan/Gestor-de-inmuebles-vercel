/**
 * ORDEN 7 — Autorización independiente y preparación de la migración.
 *
 * NOTA: los lotes usados aquí son FIXTURES sintéticos para ejercitar la
 * lógica de autorización. NO existe fichero canónico A/B custodiado en el
 * repositorio (ver informe Orden 7): ningún fixture se presenta como lote
 * canónico real. Ningún test ejecuta escrituras reales: el ejecutor permanece
 * desactivado por diseño y así se prueba (T15).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  autorizarMigracion,
  autorizacionVigente,
  derivarPlan,
  derivarTokenEjecucion,
  ejecutarDryRun,
  ejecutarMigracion,
  evaluarElegibilidad,
  generarInforme,
  planificarEjecucion,
  reconciliarCapas,
  responderPreguntas,
  verificarBarrera,
  type CatalogosMigracion,
  type DryRunResult,
  type LoteCanonica,
  type RegistroHistorico,
} from '../src/lib/migracion';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function catalogoBase(): CatalogosMigracion {
  return {
    propietarios: [
      { id: 'prop_A', nombre: 'Titular A', nifCif: '11111111A', email: 'a@test.local', estadoAcceso: 'ACTIVO', cuentaId: 'uid_A' },
      { id: 'prop_B', nombre: 'Titular B', estadoAcceso: 'SIN_CUENTA', cuentaId: null },
    ],
    inmuebles: [
      {
        id: 'inm_A', direccion: 'Calle Sol 1', ciudad: 'Alicante', referenciaCatastral: 'CAT001',
        propietarioId: 'prop_A', idsOrigen: ['RENTASYNC:prop_ext_1'],
      },
      { id: 'inm_B', direccion: 'Calle Luna 2', ciudad: 'Alicante', propietarioId: 'prop_B' },
    ],
    contratos: [{ id: 'ct_A', inmuebleId: 'inm_A', propietarioId: 'prop_A' }],
    mapeos: [
      { alcance: 'INMUEBLE', origen: 'RENTASYNC:prop_ext_1', destino: 'inm_A' },
      { alcance: 'CONTRATO', origen: 'RENTASYNC:rent_1', destino: 'ct_A' },
    ],
    existentes: [],
    propietariosPermitidosIds: ['prop_A', 'prop_B'],
  };
}

const prov = (sourceId: string, source = 'RENTASYNC') => ({
  source, sourceFile: 'fixture-o7.json', sourceId, sourceVersion: 'rentasync-v1',
});

function gastoCompleto(sourceId: string, datos: Record<string, unknown> = {}): RegistroHistorico {
  return {
    entidad: 'GASTO',
    proveniencia: prov(sourceId),
    datos: {
      propertyId: 'prop_ext_1', importe: 120.5, fechaDevengo: '2026-03-15',
      categoria: 'Comunidad', concepto: 'Cuota comunidad marzo', ...datos,
    },
  };
}

/** Lote-mixto de 9 registros (distribución Orden 6: 1/3/3/1/1). */
function lote9(): RegistroHistorico[] {
  return [
    gastoCompleto('exp_O7auto', { fechaDevengo: '2026-05-15', concepto: 'Cuota comunidad mayo' }),
    gastoCompleto('exp_O7revA', { fechaDevengo: '2026-03-10' }),
    gastoCompleto('exp_O7revB', { fechaDevengo: '2026-03-20' }),
    gastoCompleto('exp_O7inc', { propertyId: 'prop_sin_mapeo' }),
    gastoCompleto('exp_O7bloq', { fechaDevengo: '2026-06-15', concepto: 'Cuota comunidad junio' }),
    gastoCompleto('exp_O7bloq', { fechaDevengo: '2026-06-15', concepto: 'Cuota comunidad junio' }),
    { entidad: 'CANDIDATO', proveniencia: prov('cand_O7'), datos: {} },
    {
      entidad: 'DOCUMENTO', proveniencia: prov('doc_O7'),
      datos: { nombreOriginal: 'x.pdf', rutaOriginal: 'https://origen.test/x.pdf', propietarioId: 'prop_A' },
    },
    {
      entidad: 'LEGACY_STORAGE',
      proveniencia: { source: 'LEGACY_STORAGE', sourceCollection: 'cobros_justificantes', sourceId: '2024-03/h.pdf' },
      datos: { rutaOrigen: 'cobros_justificantes/2024-03/h.pdf' },
    },
  ];
}

const dryRun9 = (): DryRunResult => ejecutarDryRun({ registros: lote9(), catalogos: catalogoBase() });

/** Fixture de identidad de lote (NO canónico real; ver nota superior). */
function loteFixture(n: number, sha = 'a'.repeat(64)): LoteCanonica {
  return {
    id: 'FIXTURE-o7-no-canonico', fuente: 'RENTASYNC',
    ficheros: ['docs/evidencia/FIXTURE-lote-o7.json'],
    numRegistros: n, tamanoBytes: 1024, sha256: sha,
    generadoEn: '2026-09-27T00:00:00Z', esquemaVersion: 'rentasync-v1',
    motorB4Version: 'b4-dryrun-v1', commitDryRun: '819f1cb',
  };
}

/** Gasto AUTO sin incidencia fiscal (deducible explícito vía normalizado). */
function gastoElegible(sourceId: string): RegistroHistorico {
  return {
    entidad: 'GASTO',
    proveniencia: prov(sourceId),
    datos: {
      propertyId: 'prop_ext_1', importe: 120.5, fechaDevengo: '2026-03-15',
      categoria: 'Comunidad', concepto: 'Cuota comunidad marzo',
    },
    normalizado: {
      entidad: 'GASTO',
      destino: { deducible: true, categoria: 'Comunidad', importe: 120.5, fechaDevengo: '2026-03-15' },
      transformaciones: [], incidencias: [], camposRequierenValidacion: [], bloqueado: false,
    },
  };
}

// ---------------------------------------------------------------------------
// R · Reconciliación 1:1 entre capas (§4)
// ---------------------------------------------------------------------------
describe('O7 · R — Reconciliación lote→dry-run→preguntas→informe→plan', () => {
  it('R1 · capas reales reconcilian 1:1 (ok, sin fallos)', () => {
    const dryRun = dryRun9();
    expect(dryRun.resumen).toMatchObject({ totalRegistros: 9, auto: 1, revision: 3, incompleto: 3, bloqueado: 1, noMigrable: 1 });
    const v = reconciliarCapas({
      dryRun,
      preguntas: responderPreguntas(dryRun),
      informe: generarInforme(dryRun),
      plan: derivarPlan(dryRun),
    });
    expect(v).toEqual({ ok: true, fallos: [] });
  });
  it('R2 · informe manipulado ⇒ reconciliación FAIL (detecta la invención)', () => {
    const dryRun = dryRun9();
    const informe = generarInforme(dryRun).replace('AUTO: 1', 'AUTO: 9');
    const v = reconciliarCapas({ dryRun, preguntas: responderPreguntas(dryRun), informe, plan: derivarPlan(dryRun) });
    expect(v.ok).toBe(false);
    expect(v.fallos.some((f) => f.includes('AUTO') && f.includes('9'))).toBe(true);
  });
  it('R3 · plan manipulado (operación extra) ⇒ FAIL', () => {
    const dryRun = dryRun9();
    const plan = derivarPlan(dryRun);
    const v = reconciliarCapas({
      dryRun,
      preguntas: responderPreguntas(dryRun),
      informe: generarInforme(dryRun),
      plan: { ...plan, operaciones: [...plan.operaciones, ...plan.operaciones] },
    });
    expect(v.ok).toBe(false);
  });
  it('R4 · preguntas truncadas ⇒ FAIL', () => {
    const dryRun = dryRun9();
    const v = reconciliarCapas({
      dryRun,
      preguntas: responderPreguntas(dryRun).slice(0, 13),
      informe: generarInforme(dryRun),
      plan: derivarPlan(dryRun),
    });
    expect(v.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T · 15 tests de autorización (§15)
// ---------------------------------------------------------------------------
describe('O7 · T — Autorización independiente (15 tests)', () => {
  it('T1 · sin lote canónico (sin ficheros/sha) ⇒ NO AUTORIZA', () => {
    const aut = autorizarMigracion({
      lote: { ...loteFixture(9), ficheros: [], sha256: null },
      dryRun: dryRun9(), autorizador: 'operador-test', fechaHora: '2026-09-27T00:00:00Z',
    });
    expect(aut.decision).toBe('BLOQUEADA');
    expect(aut.motivo).toContain('SHA-256 pendiente');
    expect(aut.resultado).toBe('AUTORIZACIÓN PREVIA (migración no ejecutada)');
  });
  it('T2 · SHA incorrecto (no 64-hex) ⇒ NO AUTORIZA', () => {
    const aut = autorizarMigracion({
      lote: { ...loteFixture(9), sha256: 'xyz-no-es-sha' },
      dryRun: dryRun9(),
    });
    expect(aut.decision).toBe('BLOQUEADA');
    expect(aut.motivo).toContain('SHA-256 canónico inválido');
  });
  it('T3 · lote cambiado (nº registros ≠ dry-run) ⇒ NO AUTORIZA', () => {
    const aut = autorizarMigracion({ lote: loteFixture(7), dryRun: dryRun9() });
    expect(aut.decision).toBe('BLOQUEADA');
    expect(aut.motivo).toContain('lote cambiado');
  });
  it('T4 · AUTO válido (7 puertas + fiscal OK) ⇒ puede quedar autorizado + ficha', () => {
    const dryRun = ejecutarDryRun({ registros: [gastoElegible('exp_O7ok')], catalogos: catalogoBase() });
    expect(dryRun.lineas[0].decision).toBe('AUTO');
    expect(evaluarElegibilidad(dryRun.lineas[0])).toEqual({ elegible: true, motivoExclusion: null });
    const aut = autorizarMigracion({
      lote: loteFixture(1), dryRun, autorizador: 'operador-test', fechaHora: '2026-09-27T00:00:00Z',
    });
    expect(aut.decision).toBe('CONCEDIDA');
    expect(aut.incluidos).toHaveLength(1);
    // Ficha §7: reconstruible el porqué del AUTO.
    expect(aut.incluidos[0]).toMatchObject({
      source: 'RENTASYNC', sourceId: 'exp_O7ok', entidad: 'GASTO',
      propietarioDestinoId: 'prop_A', inmuebleDestinoId: 'inm_A', decision: 'AUTO',
    });
    expect(aut.incluidos[0].relaciones).toMatchObject({ padreResuelto: true });
    expect(aut.incluidos[0].evidencia).toContain('propietario:');
    expect(aut.incluidos[0].evidencia).toContain('destino:');
  });
  it.each([
    ['T5 · REVISIÓN no entra automáticamente', 'REVISION'],
    ['T6 · INCOMPLETO no entra', 'INCOMPLETO'],
    ['T7 · BLOQUEADO no entra', 'BLOQUEADO'],
    ['T8 · NO_MIGRABLE no entra', 'NO_MIGRABLE'],
  ])('%s', (_nombre, decision) => {
    const aut = autorizarMigracion({ lote: loteFixture(9), dryRun: dryRun9() });
    const excl = aut.excluidos.filter((e) => e.clasificacion === decision);
    expect(excl.length).toBeGreaterThan(0);
    for (const e of excl) {
      expect(e.accionNecesaria.length).toBeGreaterThan(0);
      expect(e.datoFaltanteOConflicto.length).toBeGreaterThan(0);
    }
    // Ningún no-AUTO entre los incluidos.
    expect(aut.incluidos).toHaveLength(0); // el único AUTO cae por fiscal (T10)
  });
  it('T9 · entidadRef documental no verificable ⇒ no entra', () => {
    const dryRun = ejecutarDryRun({
      registros: [{
        entidad: 'DOCUMENTO', proveniencia: prov('doc_O7ref'),
        datos: {
          nombreOriginal: 'factura.pdf', rutaOriginal: 'https://origen.test/f.pdf',
          entidadRef: 'GASTO', entidadId: 'exp_x', propietarioId: 'prop_A', tipo: 'application/pdf',
        },
      }],
      catalogos: catalogoBase(),
    });
    expect(dryRun.lineas[0].decision).toBe('AUTO'); // B4 lo ve AUTO…
    const v = evaluarElegibilidad(dryRun.lineas[0]);
    expect(v.elegible).toBe(false); // …pero autorización lo excluye (§8).
    expect(v.motivoExclusion).toContain('entidadRef');
    const aut = autorizarMigracion({ lote: loteFixture(1), dryRun });
    expect(aut.decision).toBe('CONDICIONADA');
    expect(aut.excluidos[0].accionNecesaria).toContain('entidadRef');
  });
  it('T10 · incidencia fiscal que requiera decisión ⇒ no entra', () => {
    const dryRun = ejecutarDryRun({ registros: [gastoCompleto('exp_O7fisc')], catalogos: catalogoBase() });
    expect(dryRun.lineas[0].decision).toBe('AUTO');
    const v = evaluarElegibilidad(dryRun.lineas[0]);
    expect(v.elegible).toBe(false);
    expect(v.motivoExclusion).toContain('fiscal');
    const aut = autorizarMigracion({ lote: loteFixture(1), dryRun });
    expect(aut.decision).toBe('CONDICIONADA');
    expect(aut.incluidos).toHaveLength(0);
  });
  it('T11 · segunda ejecución del mismo lote ⇒ bloqueada (idempotencia)', () => {
    const sha = 'b'.repeat(64);
    const dryRun = ejecutarDryRun({ registros: [gastoElegible('exp_O7idem')], catalogos: catalogoBase() });
    const primera = autorizarMigracion({ lote: loteFixture(1, sha), dryRun });
    expect(primera.decision).toBe('CONCEDIDA');
    const segunda = autorizarMigracion({ lote: loteFixture(1, sha), dryRun, ejecucionesPrevias: [sha] });
    expect(segunda.decision).toBe('BLOQUEADA');
    expect(segunda.motivo).toContain('ya ejecutado');
  });
  it('T12 · ausencia de token explícito ⇒ barrera bloqueada', () => {
    const dryRun = ejecutarDryRun({ registros: [gastoElegible('exp_O7tok')], catalogos: catalogoBase() });
    const aut = autorizarMigracion({ lote: loteFixture(1), dryRun });
    const v = verificarBarrera({ autorizacion: aut, canonicalBatchSha256: 'a'.repeat(64), explicitExecutionToken: null });
    expect(v.pasa).toBe(false);
    expect(v.motivos.some((m) => m.includes('token explícito'))).toBe(true);
  });
  it('T13 · autorización del lote A no sirve para el lote B', () => {
    const dryRun = ejecutarDryRun({ registros: [gastoElegible('exp_O7ab')], catalogos: catalogoBase() });
    const autA = autorizarMigracion({ lote: loteFixture(1, 'a'.repeat(64)), dryRun });
    expect(autA.decision).toBe('CONCEDIDA');
    const v = verificarBarrera({
      autorizacion: autA,
      canonicalBatchSha256: 'c'.repeat(64),
      explicitExecutionToken: derivarTokenEjecucion('c'.repeat(64)),
    });
    expect(v.pasa).toBe(false);
    expect(v.motivos.some((m) => m.includes('otro lote'))).toBe(true);
  });
  it('T14 · modificar el lote tras autorizar invalida la autorización', () => {
    const dryRun = ejecutarDryRun({ registros: [gastoElegible('exp_O7mod')], catalogos: catalogoBase() });
    const aut = autorizarMigracion({ lote: loteFixture(1), dryRun });
    expect(aut.decision).toBe('CONCEDIDA');
    expect(autorizacionVigente(aut, dryRun)).toBe(true);
    const manipulado: DryRunResult = {
      ...dryRun,
      lineas: dryRun.lineas.map((l) => ({ ...l, datoOriginal: { ...l.datoOriginal, importe: 99999 } })),
    };
    expect(autorizacionVigente(aut, manipulado)).toBe(false);
    const v = verificarBarrera({
      autorizacion: aut,
      canonicalBatchSha256: 'a'.repeat(64),
      explicitExecutionToken: derivarTokenEjecucion('a'.repeat(64)),
      dryRunActual: manipulado,
    });
    expect(v.pasa).toBe(false);
    expect(() => planificarEjecucion({ autorizacion: aut, dryRun: manipulado })).toThrow('invalidada');
  });
  it('T15 · ningún test ejecuta escrituras reales (barrera + scan + plan no ejecutable)', () => {
    const SIMBOLOS = [
      'setDoc', 'addDoc', 'updateDoc', 'deleteDoc', 'writeBatch', 'runTransaction',
      'uploadBytes', 'uploadString', 'deleteObject', 'setCustomUserClaims',
      'getFirestore', 'getStorage', 'firebase/firestore', 'firebase/storage', 'audit_logs',
    ];
    const dir = resolve(RAIZ, 'src/lib/migracion');
    const hallazgos: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const src = readFileSync(resolve(dir, f), 'utf8');
      for (const s of SIMBOLOS) if (src.includes(s)) hallazgos.push(`${f}: ${s}`);
    }
    expect(hallazgos).toEqual([]);
    // El ejecutor rechaza incluso con barrera válida.
    const dryRun = ejecutarDryRun({ registros: [gastoElegible('exp_O7exec')], catalogos: catalogoBase() });
    const aut = autorizarMigracion({ lote: loteFixture(1), dryRun });
    const barrera = verificarBarrera({
      autorizacion: aut,
      canonicalBatchSha256: 'a'.repeat(64),
      explicitExecutionToken: derivarTokenEjecucion('a'.repeat(64)),
      dryRunActual: dryRun,
    });
    expect(barrera).toEqual({ pasa: true, motivos: [] });
    expect(() => ejecutarMigracion({
      autorizacion: aut,
      canonicalBatchSha256: 'a'.repeat(64),
      explicitExecutionToken: derivarTokenEjecucion('a'.repeat(64)),
    })).toThrow('EJECUCION_BLOQUEADA');
    // El plan es dato no ejecutable.
    expect(planificarEjecucion({ autorizacion: aut, dryRun }).ejecutable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P · Plan reversible: staging → validación → promoción + rollback (§11/§12)
// ---------------------------------------------------------------------------
describe('O7 · P — Plan de ejecución reversible (dato, no ejecución)', () => {
  it('P1 · plan 1:1 con incluidos, rollback completo, runId estable', () => {
    const dryRun = ejecutarDryRun({
      registros: [gastoElegible('exp_O7p1'), gastoElegible('exp_O7p2')],
      catalogos: catalogoBase(),
    });
    // Dos gastos idénticos salvo sourceId ⇒ segundo EXACTO: solo 1 elegible.
    const aut = autorizarMigracion({ lote: loteFixture(2), dryRun });
    expect(aut.decision).toBe('CONCEDIDA');
    expect(aut.incluidos).toHaveLength(1);
    const plan = planificarEjecucion({ autorizacion: aut, dryRun });
    expect(plan.fases).toEqual(['STAGING', 'VALIDACION', 'PROMOCION']);
    expect(plan.staging).toHaveLength(1);
    expect(plan.migrationRunId).toMatch(/^mig_[0-9a-f]{12}$/);
    // Rollback cubre cada operación, identificado por runId (sin borrado ciego).
    expect(plan.rollback).toHaveLength(plan.staging.length);
    for (const rb of plan.rollback) {
      expect(rb.via).toBe('migrationRunId');
      expect(rb.migrationRunId).toBe(plan.migrationRunId);
    }
    // Determinista: mismo plan ⇒ mismo runId.
    expect(planificarEjecucion({ autorizacion: aut, dryRun }).migrationRunId).toBe(plan.migrationRunId);
    expect(plan.condicionesAborto.length).toBeGreaterThan(0);
    expect(plan.validaciones.length).toBeGreaterThan(0);
  });
  it('P2 · sin CONCEDIDA no hay plan (BLOQUEADA/CONDICIONADA ⇒ throw)', () => {
    const dryRun = dryRun9();
    const bloq = autorizarMigracion({ lote: { ...loteFixture(9), sha256: null, ficheros: [] }, dryRun });
    expect(() => planificarEjecucion({ autorizacion: bloq, dryRun })).toThrow('no planificable');
    const cond = autorizarMigracion({ lote: loteFixture(9), dryRun });
    expect(cond.decision).toBe('CONDICIONADA');
    expect(() => planificarEjecucion({ autorizacion: cond, dryRun })).toThrow('no planificable');
  });
});

// ---------------------------------------------------------------------------
// D · Decisiones humanas individualizadas (§6)
// ---------------------------------------------------------------------------
describe('O7 · D — Decisiones humanas individualizadas', () => {
  it('D1 · cada excluido trae los 10 campos + acción (lote 9: 9 excluidos)', () => {
    const aut = autorizarMigracion({ lote: loteFixture(9), dryRun: dryRun9() });
    // 8 no-AUTO + 1 AUTO excluido por fiscal ⇒ 9 excluidos, 0 incluidos.
    expect(aut.incluidos).toHaveLength(0);
    expect(aut.excluidos).toHaveLength(9);
    for (const e of aut.excluidos) {
      for (const k of ['source', 'sourceId', 'entidad', 'clasificacion', 'motivo', 'evidencia', 'datoFaltanteOConflicto', 'accionNecesaria'] as const) {
        expect(typeof e[k]).toBe('string');
        expect(e[k].length).toBeGreaterThan(0);
      }
    }
    expect(new Set(aut.excluidos.map((e) => e.clasificacion))).toEqual(
      new Set(['AUTO', 'REVISION', 'INCOMPLETO', 'BLOQUEADO', 'NO_MIGRABLE']),
    );
  });
});
