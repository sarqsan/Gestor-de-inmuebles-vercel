/**
 * B4 — DRY-RUN DE MIGRACIÓN HISTÓRICA (ORDEN 5).
 *
 * METODOLOGÍA: se ejecuta el CÓDIGO REAL de `src/lib/migracion/` (motor puro,
 * sin Firebase, sin I/O, sin reloj) contra catálogos sintéticos inyectados y
 * contra el anexo real `docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json` (leído aquí
 * como fixture; el módulo jamás lee ficheros).
 *
 * El dry-run es de SOLO LECTURA: la sección H (`NO-ESCRITURA`) falla si el
 * módulo (o cualquiera de sus dependencias internas) contiene símbolos de
 * escritura, y demuestra que la entrada queda intacta (freeze profundo).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  adaptarInmuebleRentasync,
  adaptarMovimientoRentasync,
  ejecutarDryRun,
  derivarPlan,
  generarInforme,
  jsonEstable,
  responderPreguntas,
  PREGUNTAS_CANONICAS,
  resolverInmueble,
  resolverPropietario,
  type CatalogosMigracion,
  type DryRunResult,
  type LineaDryRun,
  type RegistroHistorico,
} from '../src/lib/migracion';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Fixtures: catálogos sintéticos (snapshots inyectados, no lectura viva)
// ---------------------------------------------------------------------------

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
      { alcance: 'INMUEBLE', origen: 'RENTASYNC:prop_ext_1', destino: 'inm_A', nota: 'mapeo documentado de prueba' },
      { alcance: 'CONTRATO', origen: 'RENTASYNC:rent_1', destino: 'ct_A' },
    ],
    existentes: [],
    propietariosPermitidosIds: ['prop_A', 'prop_B'],
  };
}

const prov = (sourceId: string, source = 'RENTASYNC', extra: Record<string, unknown> = {}) => ({
  source, sourceFile: 'fixture-b4.json', sourceId, sourceVersion: 'rentasync-v1', ...extra,
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

const lineaDe = (lineas: readonly LineaDryRun[], sourceId: string): LineaDryRun => {
  const l = lineas.find((x) => x.proveniencia.sourceId === sourceId);
  if (!l) throw new Error(`sin línea para ${sourceId}`);
  return l;
};

// ---------------------------------------------------------------------------
// A · Propietarios (§7)
// ---------------------------------------------------------------------------
describe('B4 · A — Resolución de propietario', () => {
  it('A1 · propietario inequívoco (id explícito válido)', () => {
    const r = resolverPropietario({ entidad: 'GASTO', datos: { propietarioId: 'prop_A' }, catalogos: catalogoBase() });
    expect(r).toMatchObject({ id: 'prop_A', estado: 'RESUELTO' });
    expect(r.evidencia).toContain('cuenta ACTIVA');
  });
  it('A2 · propietario inexistente (no se inventa)', () => {
    const r = resolverPropietario({ entidad: 'GASTO', datos: { propietarioId: 'prop_X' }, catalogos: catalogoBase() });
    expect(r).toMatchObject({ id: null, estado: 'INCOMPLETO' });
    expect(r.evidencia).toContain('NO_ENCONTRADO');
  });
  it('A3 · propietario ambiguo (mapeo contradictorio)', () => {
    const cat = catalogoBase();
    const r = resolverPropietario({
      entidad: 'GASTO', datos: {}, claveOrigen: 'RENTASYNC:owner_dup', catalogos: {
        ...cat,
        mapeos: [
          ...cat.mapeos,
          { alcance: 'PROPIETARIO', origen: 'RENTASYNC:owner_dup', destino: 'prop_A' },
          { alcance: 'PROPIETARIO', origen: 'RENTASYNC:owner_dup', destino: 'prop_B' },
        ],
      },
    });
    expect(r.estado).toBe('BLOQUEADO');
    expect(r.candidatos).toEqual(['prop_A', 'prop_B']);
  });
  it('A4 · propietario sin cuenta (se resuelve; la migración no crea cuentas)', () => {
    const r = resolverPropietario({ entidad: 'GASTO', datos: { propietarioId: 'prop_B' }, catalogos: catalogoBase() });
    expect(r).toMatchObject({ id: 'prop_B', estado: 'RESUELTO' });
    expect(r.evidencia).toContain('sin cuenta');
  });
  it('A5 · el gestor importador JAMÁS es destino implícito', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_g1')],
      catalogos: { ...catalogoBase(), importador: { uid: 'uid_gestor', modalidad: 'GESTOR_PROFESIONAL' } },
    });
    const l = lineaDe(res.lineas, 'exp_g1');
    expect(l.propietarioDestinoId).toBe('prop_A'); // titular del inmueble, no el importador
    expect(l.propietarioDestinoId).not.toBe('uid_gestor');
    expect(l.decision).toBe('AUTO');
  });
  it('A6 · destino distinto del importador (el importador no interviene)', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'GASTO',
        proveniencia: prov('exp_g2'),
        datos: { inmuebleId: 'inm_B', importe: 50, fechaDevengo: '2026-04-01', categoria: 'IBI', concepto: 'IBI 2026' },
      }],
      catalogos: { ...catalogoBase(), importador: { uid: 'uid_A', modalidad: 'PROPIETARIO' } },
    });
    const l = lineaDe(res.lineas, 'exp_g2');
    expect(l.propietarioDestinoId).toBe('prop_B');
    expect(l.decision).toBe('AUTO');
  });
});

// ---------------------------------------------------------------------------
// B · Inmuebles (§8)
// ---------------------------------------------------------------------------
describe('B4 · B — Resolución de inmueble', () => {
  it('B1 · match inequívoco (mapeo documentado)', () => {
    const r = resolverInmueble({ datos: {}, clavePropertyId: 'RENTASYNC:prop_ext_1', catalogos: catalogoBase() });
    expect(r).toMatchObject({ id: 'inm_A', estado: 'RESUELTO', via: 'MAPEO' });
  });
  it('B2 · match ambiguo (mismo origen en dos fichas)', () => {
    const cat = catalogoBase();
    const r = resolverInmueble({
      datos: {}, clavePropertyId: 'RENTASYNC:prop_dup', catalogos: {
        ...cat,
        inmuebles: [
          ...cat.inmuebles,
          { id: 'inm_X1', direccion: 'D1', idsOrigen: ['RENTASYNC:prop_dup'] },
          { id: 'inm_X2', direccion: 'D2', idsOrigen: ['RENTASYNC:prop_dup'] },
        ],
      },
    });
    expect(r.estado).toBe('BLOQUEADO');
    expect(r.candidatos).toEqual(['inm_X1', 'inm_X2']);
  });
  it('B3 · inmueble inexistente', () => {
    const r = resolverInmueble({ datos: { inmuebleId: 'inm_X' }, catalogos: catalogoBase() });
    expect(r).toMatchObject({ id: null, estado: 'INCOMPLETO' });
    expect(r.evidencia).toContain('inexistente');
  });
  it('B4 · inmueble duplicado (dirección+ciudad repetida)', () => {
    const cat = catalogoBase();
    const r = resolverInmueble({
      datos: { direccion: 'Calle Sol 1', ciudad: 'Alicante' }, catalogos: {
        ...cat,
        inmuebles: [...cat.inmuebles, { id: 'inm_A2', direccion: 'Calle Sol 1', ciudad: 'Alicante' }],
      },
    });
    expect(r.estado).toBe('BLOQUEADO');
    expect(r.candidatos).toEqual(['inm_A', 'inm_A2']);
  });
});

// ---------------------------------------------------------------------------
// C · Relaciones (§9/§11)
// ---------------------------------------------------------------------------
describe('B4 · C — Relaciones y huérfanos', () => {
  it('C1 · padre resuelto (gasto → inmueble) ⇒ AUTO', () => {
    const res = ejecutarDryRun({ registros: [gastoCompleto('exp_c1')], catalogos: catalogoBase() });
    const l = lineaDe(res.lineas, 'exp_c1');
    expect(l.relaciones).toMatchObject({ padre: 'inm_A', padreResuelto: true });
    expect(l.huerfano.es).toBe(false);
    expect(l.estado).toBe('COMPLETO');
    expect(l.decision).toBe('AUTO');
    expect(l.destinoPropuesto).toMatchObject({ coleccion: 'gastos', destinoId: 'gas_inm_A_exp_c1', operacion: 'CREAR' });
  });
  it('C2 · padre no resuelto (gasto → inmueble desconocido) ⇒ INCOMPLETO, no similitud', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_c2', { propertyId: 'prop_sin_mapeo' })],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'exp_c2');
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.huerfano.es).toBe(true);
    expect(l.inmuebleDestinoId).toBeNull();
  });
  it('C3 · huérfano (cobro sin contrato) ⇒ INCOMPLETO con motivo', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'COBRO',
        proveniencia: prov('exp_c3'),
        datos: { propertyId: 'prop_ext_1', importe: 600, mes: 7, anio: 2026, concepto: 'Alquiler julio' },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'exp_c3');
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.huerfano.es).toBe(true);
    expect(l.huerfano.motivo).toContain('contrato');
  });
  it('C4 · cobro con contrato mapeado ⇒ AUTO (embebido)', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'COBRO',
        proveniencia: { ...prov('rent_1'), sourceId: 'rent_1' },
        datos: { propertyId: 'prop_ext_1', importe: 600, mes: 7, anio: 2026, concepto: 'Alquiler julio', inquilinoId: 'inq_1' },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'rent_1');
    expect(l.relaciones).toMatchObject({ padre: 'ct_A', padreResuelto: true });
    expect(l.decision).toBe('AUTO');
    expect(l.destinoPropuesto?.destinoId).toBe('cobro_ct_A_2026_7');
  });
  it('C4b · cobro sin inquilino ⇒ REVISIÓN (obligatorio en destino; heredable del contrato)', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'COBRO',
        proveniencia: { ...prov('rent_1'), sourceId: 'rent_1' },
        datos: { propertyId: 'prop_ext_1', importe: 600, mes: 7, anio: 2026, concepto: 'Alquiler julio' },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'rent_1');
    expect(l.decision).toBe('REVISION');
    expect(l.motivo).toContain('inquilinoId');
  });
});

// ---------------------------------------------------------------------------
// D · Duplicados (§10)
// ---------------------------------------------------------------------------
describe('B4 · D — Duplicados (clasificar, nunca eliminar)', () => {
  it('D1 · exacto (distinto origen, mismo contenido) ⇒ 1º AUTO, 2º BLOQUEADO', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_d1a'), gastoCompleto('exp_d1b')],
      catalogos: catalogoBase(),
    });
    const autos = res.lineas.filter((x) => x.decision === 'AUTO');
    const bloq = res.lineas.filter((x) => x.decision === 'BLOQUEADO');
    expect(autos).toHaveLength(1);
    expect(bloq).toHaveLength(1);
    expect(bloq[0].duplicado.tipo).toBe('EXACTO');
    expect(res.lineas).toHaveLength(2); // no se elimina ninguno
  });
  it('D2 · probable (misma huella fuerte, mismo mes) ⇒ REVISIÓN', () => {
    const res = ejecutarDryRun({
      registros: [
        gastoCompleto('exp_d2a', { fechaDevengo: '2026-03-10' }),
        gastoCompleto('exp_d2b', { fechaDevengo: '2026-03-20' }),
      ],
      catalogos: catalogoBase(),
    });
    const rev = res.lineas.filter((x) => x.decision === 'REVISION');
    expect(rev).toHaveLength(1);
    expect(rev[0].duplicado.tipo).toBe('PROBABLE');
  });
  it('D3 · legítimo (recurrencia mensual, distinto mes) ⇒ ambos AUTO', () => {
    const res = ejecutarDryRun({
      registros: [
        gastoCompleto('exp_d3a', { fechaDevengo: '2026-03-15', concepto: 'Cuota comunidad' }),
        gastoCompleto('exp_d3b', { fechaDevengo: '2026-04-15', concepto: 'Cuota comunidad' }),
      ],
      catalogos: catalogoBase(),
    });
    expect(res.lineas.every((x) => x.decision === 'AUTO')).toBe(true);
    expect(res.lineas.filter((x) => x.duplicado.tipo === 'LEGITIMO')).toHaveLength(1);
  });
  it('D4 · ya existente en destino ⇒ BLOQUEADO (no re-migrar)', () => {
    const cat = catalogoBase();
    const previo = ejecutarDryRun({ registros: [gastoCompleto('exp_d4')], catalogos: cat });
    expect(lineaDe(previo.lineas, 'exp_d4').decision).toBe('AUTO');
    // Simula destino ya migrado: mismo origenId pero contenido distinto ⇒ INCOMPATIBLE ⇒ BLOQUEADO.
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_d4')],
      catalogos: {
        ...cat,
        existentes: [{
          claveOrigen: 'RENTASYNC:exp_d4',
          huellaExacta: 'contenido-distinto-a-proposito',
          destinoId: 'gas_inm_A_exp_d4',
          entidad: 'GASTO',
        }],
      },
    });
    const l = lineaDe(res.lineas, 'exp_d4');
    expect(l.decision).toBe('BLOQUEADO');
    expect(l.motivo).toContain('contenido distinto');
  });
});

// ---------------------------------------------------------------------------
// E · Documentos y legacy (§13/§14)
// ---------------------------------------------------------------------------
describe('B4 · E — Documentos y legacy Storage', () => {
  it('E1 · documento correctamente asociado ⇒ AUTO', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'DOCUMENTO',
        proveniencia: prov('doc_e1'),
        datos: {
          nombreOriginal: 'factura_luz.pdf', rutaOriginal: 'https://origen.test/factura_luz.pdf',
          entidadRef: 'GASTO', entidadId: 'exp_c1', propietarioId: 'prop_A', tipo: 'application/pdf',
        },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'doc_e1');
    expect(l.decision).toBe('AUTO');
    expect(l.destinoPropuesto?.destinoId).toBe('gastos_facturas/prop_A/doc-historico/factura_luz.pdf');
  });
  it('E2 · documento sin entidad ⇒ INCOMPLETO (no se asocia por filename)', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'DOCUMENTO',
        proveniencia: prov('doc_e2'),
        datos: { nombreOriginal: 'Calle Sol 1.pdf', rutaOriginal: 'https://origen.test/x.pdf', propietarioId: 'prop_A' },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'doc_e2');
    // B4 no parsea filenames: sin entidad declarada no hay asociación (§14).
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.huerfano.es).toBe(true);
    expect(l.inmuebleDestinoId).toBeNull();
  });
  it('E2b · documento con dirección declarada (texto) ⇒ REVISIÓN, nunca AUTO', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'DOCUMENTO',
        proveniencia: prov('doc_e2b'),
        datos: {
          nombreOriginal: 'factura.pdf', rutaOriginal: 'https://origen.test/factura.pdf',
          entidadRef: 'GASTO', entidadId: 'exp_c1',
          propietarioId: 'prop_A', direccion: 'Calle Sol 1', ciudad: 'Alicante',
        },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'doc_e2b');
    expect(l.decision).toBe('REVISION');
    expect(l.inmuebleDestinoId).toBe('inm_A');
    expect(l.motivo).toContain('no determinista');
  });
  it('E3 · legacy con pid ⇒ AUTO + propuesta de ruta nueva', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'LEGACY_STORAGE',
        proveniencia: { source: 'LEGACY_STORAGE', sourceCollection: 'cobros_justificantes', sourceId: '2024-01/f.pdf' },
        datos: { rutaOrigen: 'cobros_justificantes/2024-01/f.pdf', propietarioId: 'prop_A' },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, '2024-01/f.pdf');
    expect(l.decision).toBe('AUTO');
    expect(l.legacyStorage).toMatchObject({
      rutaOrigen: 'cobros_justificantes/2024-01/f.pdf',
      destinoPropuesto: 'cobros_justificantes/prop_A/2024-01/f.pdf',
      estado: 'RESUELTO',
    });
  });
  it('E4 · legacy sin pid ⇒ INCOMPLETO (propuesta pendiente, sin migrar)', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'LEGACY_STORAGE',
        proveniencia: { source: 'LEGACY_STORAGE', sourceCollection: 'cobros_justificantes', sourceId: '2024-02/g.pdf' },
        datos: { rutaOrigen: 'cobros_justificantes/2024-02/g.pdf' },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, '2024-02/g.pdf');
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.legacyStorage?.destinoPropuesto).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F · Estados (§4/§17)
// ---------------------------------------------------------------------------
describe('B4 · F — Estados canónicos y decisiones', () => {
  it('F1 · COMPLETO/AUTO (resolución inequívoca)', () => {
    const res = ejecutarDryRun({ registros: [gastoCompleto('exp_f1')], catalogos: catalogoBase() });
    expect(lineaDe(res.lineas, 'exp_f1')).toMatchObject({ estado: 'COMPLETO', decision: 'AUTO', confianza: 'ALTA' });
  });
  it('F2 · INCOMPLETO (campo necesario ausente, sin conflicto)', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_f2', { importe: undefined })],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'exp_f2');
    expect(l).toMatchObject({ estado: 'INCOMPLETO', decision: 'INCOMPLETO' });
    expect(l.motivo).toContain('importe');
  });
  it('F3 · BLOQUEADO (mapeo contradictorio)', () => {
    const cat = catalogoBase();
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_f3')],
      catalogos: {
        ...cat,
        mapeos: [...cat.mapeos, { alcance: 'INMUEBLE', origen: 'RENTASYNC:prop_ext_1', destino: 'inm_B' }],
      },
    });
    const l = lineaDe(res.lineas, 'exp_f3');
    expect(l).toMatchObject({ estado: 'BLOQUEADO', decision: 'BLOQUEADO' });
    expect(l.motivo).toContain('contradictorio');
  });
  it('F4 · REVISIÓN (vía catastral no determinista)', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'GASTO',
        proveniencia: prov('exp_f4'),
        datos: {
          referenciaCatastral: 'CAT001', importe: 80, fechaDevengo: '2026-05-01',
          categoria: 'Seguro', concepto: 'Seguro hogar',
        },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'exp_f4');
    expect(l).toMatchObject({ estado: 'REVISION', decision: 'REVISION' });
    expect(l.inmuebleDestinoId).toBe('inm_A');
    expect(l.propietarioDestinoId).toBe('prop_A');
  });
  it('F5 · NO_MIGRABLE (entidad sin canal)', () => {
    const res = ejecutarDryRun({
      registros: [{ entidad: 'CANDIDATO', proveniencia: prov('cand_1'), datos: { nombre: 'X' } }],
      catalogos: catalogoBase(),
    });
    expect(lineaDe(res.lineas, 'cand_1')).toMatchObject({ estado: 'NO_MIGRABLE', decision: 'NO_MIGRABLE' });
  });
  it('F6 · ningún INCOMPLETO/BLOQUEADO/REVISIÓN termina en AUTO', () => {
    const res = ejecutarDryRun({
      registros: [
        gastoCompleto('exp_f6a'),
        gastoCompleto('exp_f6b', { propertyId: 'prop_sin_mapeo' }),
        gastoCompleto('exp_f6c', { importe: undefined }),
        { entidad: 'CANDIDATO', proveniencia: prov('cand_f6'), datos: {} },
      ],
      catalogos: catalogoBase(),
    });
    for (const l of res.lineas) {
      if (l.estado !== 'COMPLETO') expect(l.decision).not.toBe('AUTO');
      if (l.decision === 'AUTO') expect(l.estado).toBe('COMPLETO');
    }
    expect(res.resumen.auto).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// G · Idempotencia (§16)
// ---------------------------------------------------------------------------
describe('B4 · G — Idempotencia', () => {
  const lote = () => [
    gastoCompleto('exp_gA', { concepto: 'A' }),
    gastoCompleto('exp_gB', { concepto: 'B' }),
    { entidad: 'CANDIDATO', proveniencia: prov('cand_g'), datos: {} },
  ];
  it('G1 · mismo lote en distinto orden ⇒ mismo resultado', () => {
    const r1 = ejecutarDryRun({ registros: lote(), catalogos: catalogoBase() });
    const r2 = ejecutarDryRun({ registros: [...lote()].reverse(), catalogos: catalogoBase() });
    expect(r2.loteSha256).toBe(r1.loteSha256);
    expect(r2.lineas).toEqual(r1.lineas);
    expect(r2.resumen).toEqual(r1.resumen);
  });
  it('G2 · migrationKey estable y única por registro', () => {
    const r1 = ejecutarDryRun({ registros: lote(), catalogos: catalogoBase() });
    const r2 = ejecutarDryRun({ registros: lote(), catalogos: catalogoBase() });
    expect(r1.lineas.map((x) => x.migrationKey)).toEqual(r2.lineas.map((x) => x.migrationKey));
    expect(new Set(r1.lineas.map((x) => x.migrationKey)).size).toBe(3);
    for (const l of r1.lineas) expect(l.migrationKey).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// H · NO-ESCRITURA (§19/§21): garantía testeada
// ---------------------------------------------------------------------------
describe('B4 · H — NO-ESCRITURA (garantía testeada)', () => {
  const SIMBOLOS_PROHIBIDOS = [
    'setDoc', 'addDoc', 'updateDoc', 'deleteDoc', 'writeBatch', 'runTransaction',
    'uploadBytes', 'uploadString', 'deleteObject', 'setCustomUserClaims',
    'getFirestore', 'getStorage', 'firebase/firestore', 'firebase/storage',
    "from '../firebase'", 'from "./firebase"', "from '../../lib/firebase'",
    // (`AuditLog` como TIPO no se prohíbe: solo indicios de escritura/lectura viva.)
    'audit_logs', 'collection(db', 'doc(db',
  ];
  function ficherosAlcanzables(inicio: string, vistos = new Set<string>()): string[] {
    if (vistos.has(inicio)) return [];
    vistos.add(inicio);
    const src = readFileSync(inicio, 'utf8');
    const out = [inicio];
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      let rel = m[1];
      if (!rel.endsWith('.ts')) rel += '.ts';
      out.push(...ficherosAlcanzables(resolve(dirname(inicio), rel), vistos));
    }
    return out;
  }
  it('H1 · el módulo y sus dependencias internas no contienen símbolos de escritura', () => {
    const dir = resolve(RAIZ, 'src/lib/migracion');
    const entradas = readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => resolve(dir, f));
    const alcanzables = [...new Set(entradas.flatMap((e) => ficherosAlcanzables(e)))].sort();
    expect(alcanzables.length).toBeGreaterThan(5); // cubre importacion/* + patrimonial/*
    const hallazgos: string[] = [];
    for (const f of alcanzables) {
      const src = readFileSync(f, 'utf8');
      for (const s of SIMBOLOS_PROHIBIDOS) {
        if (src.includes(s)) hallazgos.push(`${f.split('/src/')[1]}: ${s}`);
      }
    }
    expect(hallazgos).toEqual([]);
  });
  it('H2 · la entrada congelada no se muta y el resultado es solo-lectura', () => {
    const registros = [gastoCompleto('exp_h2')];
    const catalogos = catalogoBase();
    const antes = JSON.stringify({ registros, catalogos });
    const congelar = (v: unknown): void => {
      if (v && typeof v === 'object') {
        Object.freeze(v);
        for (const k of Object.keys(v as Record<string, unknown>)) congelar((v as Record<string, unknown>)[k]);
      }
    };
    congelar(registros);
    congelar(catalogos);
    const res = ejecutarDryRun({ registros, catalogos });
    expect(JSON.stringify({ registros, catalogos })).toBe(antes);
    expect(res.soloLectura).toBe(true);
    const plan = derivarPlan(res);
    expect(plan.soloLectura).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// I · Resumen, plan, fiscalidad, proveniencia (§15/§18/§22)
// ---------------------------------------------------------------------------
describe('B4 · I — Resumen, plan futuro, fiscalidad y proveniencia', () => {
  it('I1 · resumen estructurado con totales y categorías', () => {
    const res = ejecutarDryRun({
      registros: [
        gastoCompleto('exp_i1'),
        gastoCompleto('exp_i2', { propertyId: 'prop_sin_mapeo' }),
        { entidad: 'CANDIDATO', proveniencia: prov('cand_i'), datos: {} },
      ],
      catalogos: catalogoBase(),
    });
    expect(res.resumen).toMatchObject({
      totalRegistros: 3, auto: 1, revision: 0, incompleto: 1, bloqueado: 0, noMigrable: 1,
      huerfanos: 1, conflictos: 0,
    });
    expect(res.resumen.porCategoria.AUTO.ejemplos).toEqual(['RENTASYNC:exp_i1']);
    expect(res.resumen.porCategoria.AUTO.fuentes).toEqual(['RENTASYNC']);
    // Sin PII: ni nombres ni emails en el resumen.
    expect(JSON.stringify(res.resumen)).not.toContain('Titular');
    expect(JSON.stringify(res.resumen)).not.toContain('@');
  });
  it('I2 · el plan futuro solo incluye AUTO (informativo, no ejecutable)', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_p1'), gastoCompleto('exp_p2', { propertyId: 'prop_sin_mapeo' })],
      catalogos: catalogoBase(),
    });
    const plan = derivarPlan(res);
    expect(plan.operaciones).toHaveLength(1);
    expect(plan.operaciones[0]).toMatchObject({
      sourceId: 'exp_p1', destinationId: 'gas_inm_A_exp_p1', decision: 'AUTO', coleccion: 'gastos', operacion: 'CREAR',
    });
    expect(plan.excluidas).toBe(1);
    expect(plan.nota).toContain('INFORMATIVO');
  });
  it('I3 · fiscalidad: conserva original, NO recalcula deducibilidad', () => {
    const res = ejecutarDryRun({ registros: [gastoCompleto('exp_fis')], catalogos: catalogoBase() });
    const l = lineaDe(res.lineas, 'exp_fis');
    expect(l.fiscal?.original).toMatchObject({ importe: 120.5 });
    expect(l.fiscal?.deducible).toBeNull();
    expect(l.fiscal?.motivo).toContain('no calcula');
  });
  it('I4 · proveniencia íntegra: hash, cadena, origen nunca sobrescrito', () => {
    const res = ejecutarDryRun({ registros: [gastoCompleto('exp_pr')], catalogos: catalogoBase() });
    const l = lineaDe(res.lineas, 'exp_pr');
    expect(l.proveniencia.sourceId).toBe('exp_pr');
    expect(l.proveniencia.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(l.datoOriginal).toMatchObject({ propertyId: 'prop_ext_1', importe: 120.5 });
  });
});

// ---------------------------------------------------------------------------
// J · Adaptador Rentasync + anexo real FASE2
// ---------------------------------------------------------------------------
describe('B4 · J — Adaptador Rentasync y anexo FASE2 real', () => {
  const CTX = { loteId: 'lote-fixture', fuente: 'fixture', sourceFile: 'docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json' };
  it('J1 · el adaptador conserva normalizado B1 + proveniencia', () => {
    const r = adaptarMovimientoRentasync(
      { id: 'exp_1', type: 'gasto', category: 'community', amount: 100, propertyId: 'prop_ext_1', date: '2026-03-15', description: 'Cuota' },
      CTX,
    );
    expect(r.entidad).toBe('GASTO');
    expect(r.proveniencia).toMatchObject({ source: 'RENTASYNC', sourceId: 'exp_1', sourceVersion: 'rentasync-v1' });
    expect(r.normalizado?.destino).toMatchObject({ importe: 100 });
  });
  it('J2 · truncado ⇒ NO_MIGRABLE (evidencia conservada)', () => {
    const r = adaptarMovimientoRentasync({ __TRUNCADO__: 'registro 27' } as never, CTX);
    expect(r.entidad).toBe('TRUNCADO');
    const res = ejecutarDryRun({ registros: [r], catalogos: catalogoBase() });
    expect(res.lineas[0]).toMatchObject({ estado: 'NO_MIGRABLE', decision: 'NO_MIGRABLE' });
    expect(res.lineas[0].datoOriginal).toMatchObject({ __TRUNCADO__: 'registro 27' });
  });
  it('J3 · anexo FASE2 real (52 registros): sin catálogos NO hay AUTO', () => {
    const anexo = JSON.parse(readFileSync(resolve(RAIZ, 'docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json'), 'utf8'));
    const regs = (anexo.gastos_ingresos_registros as unknown[]).map((x, i) =>
      adaptarMovimientoRentasync(x as never, CTX, i));
    expect(regs).toHaveLength(52);
    const vacios: CatalogosMigracion = { propietarios: [], inmuebles: [], contratos: [], mapeos: [], existentes: [] };
    const res = ejecutarDryRun({ registros: regs, catalogos: vacios });
    expect(res.resumen.totalRegistros).toBe(52);
    expect(res.resumen.auto).toBe(0);
    expect(res.resumen.incompleto + res.resumen.bloqueado + res.resumen.noMigrable + res.resumen.revision).toBe(52);
  });
  it('J4 · inmueble del anexo por adaptador (conserva campos)', () => {
    const r = adaptarInmuebleRentasync(
      { id: 'prop_1', address: 'Calle Sol 1 ', cadastralReference: 'CAT001' },
      CTX,
    );
    expect(r.entidad).toBe('INMUEBLE');
    expect(r.normalizado?.destino).toMatchObject({ direccion: 'Calle Sol 1', referenciaCatastral: 'CAT001' });
  });
});

// ---------------------------------------------------------------------------
// K · Autocorrección (§24): VINCULAR y duplicados intra-lote
// ---------------------------------------------------------------------------
describe('B4 · K — Vinculación con existente y duplicados de lote', () => {
  it('K1 · INMUEBLE con id canónico ⇒ AUTO/VINCULAR (sin falsos negativos)', () => {
    const res = ejecutarDryRun({
      registros: [{ entidad: 'INMUEBLE', proveniencia: prov('inm_A'), datos: { id: 'inm_A' } }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'inm_A');
    expect(l).toMatchObject({ estado: 'COMPLETO', decision: 'AUTO' });
    expect(l.destinoPropuesto).toMatchObject({ coleccion: 'inmuebles', destinoId: 'inm_A', operacion: 'VINCULAR' });
    expect(l.propietarioDestinoId).toBe('prop_A');
  });
  it('K2 · PROPIETARIO con nif exacto único ⇒ AUTO/VINCULAR', () => {
    const res = ejecutarDryRun({
      registros: [{ entidad: 'PROPIETARIO', proveniencia: prov('owner_1'), datos: { nombre: 'Titular A', nifCif: '11111111A' } }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'owner_1');
    expect(l).toMatchObject({ estado: 'COMPLETO', decision: 'AUTO' });
    expect(l.destinoPropuesto).toMatchObject({ destinoId: 'prop_A', operacion: 'VINCULAR' });
  });
  it('K3 · CONTRATO con id canónico ⇒ AUTO/VINCULAR', () => {
    const res = ejecutarDryRun({
      registros: [{ entidad: 'CONTRATO', proveniencia: prov('ct_A'), datos: { id: 'ct_A', inmuebleId: 'inm_A' } }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'ct_A');
    expect(l).toMatchObject({ estado: 'COMPLETO', decision: 'AUTO' });
    expect(l.destinoPropuesto).toMatchObject({ destinoId: 'ct_A', operacion: 'VINCULAR' });
  });
  it('K4 · sourceId repetido en lote ⇒ 2ª BLOQUEADO/EXACTO (sin eliminar)', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_dup'), gastoCompleto('exp_dup')],
      catalogos: catalogoBase(),
    });
    expect(res.lineas).toHaveLength(2);
    expect(res.lineas.filter((x) => x.decision === 'BLOQUEADO')).toHaveLength(1);
    expect(res.lineas.find((x) => x.decision === 'BLOQUEADO')?.duplicado.tipo).toBe('EXACTO');
  });
  it('K5 · mismo destino VINCULAR desde 2 orígenes ⇒ 2ª REVISIÓN', () => {
    const res = ejecutarDryRun({
      registros: [
        { entidad: 'INMUEBLE', proveniencia: prov('origen_1'), datos: { id: 'inm_A', direccion: 'Calle Sol 1', ciudad: 'Alicante' } },
        { entidad: 'INMUEBLE', proveniencia: prov('origen_2'), datos: { id: 'inm_A', direccion: 'Calle Sol 1', ciudad: 'Alicante' } },
      ],
      catalogos: catalogoBase(),
    });
    expect(res.lineas.filter((x) => x.decision === 'AUTO')).toHaveLength(1);
    expect(res.lineas.filter((x) => x.decision === 'REVISION')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// L · Interfaz de auditoría: 14 preguntas + informe exacto (interpretación
// canónica documentada; ver nota en src/lib/migracion/informe.ts)
// ---------------------------------------------------------------------------
describe('B4 · L — 14 preguntas canónicas e informe exacto', () => {
  const TEXTOS_ESPERADOS = [
    '¿Cuántos registros históricos se han analizado?',
    '¿De qué fuentes/orígenes proceden los registros analizados?',
    '¿Cuántos registros tienen una procedencia completa y trazable?',
    '¿Cuántos registros tienen propietario destino resuelto inequívocamente?',
    '¿Cuántos registros tienen inmueble destino resuelto inequívocamente?',
    '¿Cuántos registros tienen relaciones necesarias completamente resueltas?',
    '¿Cuántos registros quedan clasificados como AUTO y, por tanto, serían potencialmente migrables sin decisión humana adicional?',
    '¿Cuántos registros requieren REVISIÓN humana?',
    '¿Cuántos registros están INCOMPLETOS?',
    '¿Cuántos registros están BLOQUEADOS o presentan conflictos que impiden una migración segura?',
    '¿Cuántos registros están clasificados como NO_MIGRABLE?',
    '¿Cuántos duplicados, posibles duplicados y registros huérfanos se han detectado?',
    '¿Qué incidencias afectan a documentos, Storage o información fiscal que deban conservarse sin pérdida de procedencia?',
    '¿El dry-run es reproducible e idempotente y se ha confirmado que no ejecuta ninguna escritura real?',
  ];
  const vacio = (): DryRunResult => ejecutarDryRun({ registros: [], catalogos: catalogoBase() });
  const mixto = (): DryRunResult => ejecutarDryRun({
    registros: [
      gastoCompleto('exp_Lauto', { fechaDevengo: '2026-05-15', concepto: 'Cuota comunidad mayo' }),
      gastoCompleto('exp_LrevA', { fechaDevengo: '2026-03-10' }),
      gastoCompleto('exp_LrevB', { fechaDevengo: '2026-03-20' }),
      gastoCompleto('exp_Linc', { propertyId: 'prop_sin_mapeo' }),
      gastoCompleto('exp_Lbloq', { fechaDevengo: '2026-06-15', concepto: 'Cuota comunidad junio' }),
      gastoCompleto('exp_Lbloq', { fechaDevengo: '2026-06-15', concepto: 'Cuota comunidad junio' }),
      { entidad: 'CANDIDATO', proveniencia: prov('cand_L'), datos: {} },
      {
        entidad: 'DOCUMENTO', proveniencia: prov('doc_L'),
        datos: { nombreOriginal: 'x.pdf', rutaOriginal: 'https://origen.test/x.pdf', propietarioId: 'prop_A' },
      },
      {
        entidad: 'LEGACY_STORAGE',
        proveniencia: { source: 'LEGACY_STORAGE', sourceCollection: 'cobros_justificantes', sourceId: '2024-03/h.pdf' },
        datos: { rutaOrigen: 'cobros_justificantes/2024-03/h.pdf' },
      },
    ],
    catalogos: catalogoBase(),
  });

  it('L1 · exactamente 14 preguntas, orden y textos exactos, sin adicionales', () => {
    expect(PREGUNTAS_CANONICAS).toEqual(TEXTOS_ESPERADOS);
    const ps = responderPreguntas(mixto());
    expect(ps).toHaveLength(14);
    expect(ps.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(ps.map((p) => p.pregunta)).toEqual(TEXTOS_ESPERADOS);
    for (const p of ps) expect(p.respuesta.length).toBeGreaterThan(0);
  });
  it('L2 · resultado vacío: ceros demostrados, sin NO DETERMINADO espurio', () => {
    const ps = responderPreguntas(vacio());
    expect(ps).toHaveLength(14);
    expect(ps[0].respuesta).toContain('0 registros históricos analizados (lote vacío');
    expect(ps[1].respuesta).toBe('Ninguna: lote vacío sin registros analizados.');
    expect(ps[6].respuesta).toContain('0 registro(s) AUTO');
    expect(ps[11].respuesta).toContain('Duplicados exactos: 0; probables: 0; huérfanos: 0.');
    expect(ps[13].respuesta).toContain('Idempotencia: PASS');
    expect(ps[13].respuesta).toContain('No-escritura: PASS');
    for (const p of ps) expect(p.respuesta).not.toContain('NO DETERMINADO');
  });
  it('L3 · mezcla completa: conteos de respuestas = modelo canónico', () => {
    const res = mixto();
    const r = res.resumen;
    expect(new Set(res.lineas.map((x) => x.decision))).toEqual(
      new Set(['AUTO', 'REVISION', 'INCOMPLETO', 'BLOQUEADO', 'NO_MIGRABLE']),
    );
    const ps = responderPreguntas(res);
    const propOk = res.lineas.filter((x) => x.estadoPropietario === 'RESUELTO' && x.propietarioDestinoId !== null).length;
    const inmbOk = res.lineas.filter((x) => x.estadoInmueble === 'RESUELTO' && x.inmuebleDestinoId !== null).length;
    const relOk = res.lineas.filter((x) => x.relaciones.padreResuelto).length;
    const ex = res.lineas.filter((x) => x.duplicado.tipo === 'EXACTO').length;
    const pr = res.lineas.filter((x) => x.duplicado.tipo === 'PROBABLE').length;
    expect(ex).toBeGreaterThanOrEqual(1);
    expect(pr).toBeGreaterThanOrEqual(1);
    expect(r.huerfanos).toBeGreaterThanOrEqual(1);
    expect(ps[0].respuesta).toContain(`${r.totalRegistros} registro(s) histórico(s) analizados`);
    expect(ps[1].respuesta).toContain('2 fuente(s) analizada(s): LEGACY_STORAGE, RENTASYNC.');
    expect(ps[2].respuesta).toContain(`${r.totalRegistros} de ${r.totalRegistros} con procedencia completa`);
    expect(ps[3].respuesta).toContain(`${propOk} registro(s) con propietario destino resuelto`);
    expect(ps[4].respuesta).toContain(`${inmbOk} registro(s) con inmueble destino resuelto`);
    expect(ps[5].respuesta).toContain(`${relOk} de ${r.totalRegistros} con relaciones necesarias completamente resueltas`);
    expect(ps[6].respuesta).toContain(`${r.auto} registro(s) AUTO`);
    expect(ps[7].respuesta).toContain(`${r.revision} registro(s) requieren REVISIÓN humana`);
    expect(ps[8].respuesta).toContain(`${r.incompleto} registro(s) INCOMPLETOS`);
    expect(ps[9].respuesta).toContain(`${r.bloqueado} registro(s) BLOQUEADOS; ${r.conflictos} línea(s) con conflicto`);
    expect(ps[10].respuesta).toContain(`${r.noMigrable} registro(s) NO_MIGRABLES`);
    expect(ps[11].respuesta).toContain(`Duplicados exactos: ${ex}; probables: ${pr}; huérfanos: ${r.huerfanos}.`);
    expect(ps[12].respuesta).toContain('Documentos: 1 analizados (0 completos, 1 con incidencia).');
    expect(ps[12].respuesta).toContain('Objetos legacy pendientes: 1.');
    expect(ps[12].respuesta).toContain('Registros fiscales: 6 analizados (6 con incidencia).');
    expect(ps[12].respuesta).toContain('RENTASYNC:doc_L');
    expect(ps[13].respuesta).toContain('Idempotencia: PASS');
    expect(ps[13].respuesta).toContain('No-escritura: PASS');
  });
  it('L4 · informe vacío: estructura completa exacta', () => {
    expect(generarInforme(vacio())).toBe(`ORDEN 5 — B4 DRY-RUN DE MIGRACIÓN
==================================

1. RESUMEN
-----------
Registros analizados: 0
AUTO: 0
REVISIÓN: 0
INCOMPLETO: 0
BLOQUEADO: 0
NO_MIGRABLE: 0

2. PROVENIENCIA
---------------
Fuentes analizadas: 0
Registros con procedencia completa: 0
Registros con procedencia incompleta: 0

3. RESOLUCIÓN
-------------
Propietario resuelto: 0
Inmueble resuelto: 0
Relaciones completas: 0

4. INTEGRIDAD
-------------
Duplicados exactos: 0
Duplicados probables: 0
Huérfanos: 0
Conflictos: 0

5. DOCUMENTOS Y STORAGE
-----------------------
Documentos completos: 0
Documentos con incidencia: 0
Objetos legacy pendientes: 0

6. FISCALIDAD
-------------
Registros fiscales analizados: 0
Registros fiscales con incidencia: 0

7. IDEMPOTENCIA Y SEGURIDAD
---------------------------
Idempotencia: PASS
No-escritura: PASS

8. 14 PREGUNTAS CANÓNICAS
-------------------------
1. ¿Cuántos registros históricos se han analizado?
   0 registros históricos analizados (lote vacío: cero demostrado por el modelo).

2. ¿De qué fuentes/orígenes proceden los registros analizados?
   Ninguna: lote vacío sin registros analizados.

3. ¿Cuántos registros tienen una procedencia completa y trazable?
   0 de 0 con procedencia completa y trazable (0 con procedencia incompleta).

4. ¿Cuántos registros tienen propietario destino resuelto inequívocamente?
   0 registro(s) con propietario destino resuelto inequívocamente (estado RESUELTO con id destino único).

5. ¿Cuántos registros tienen inmueble destino resuelto inequívocamente?
   0 registro(s) con inmueble destino resuelto inequívocamente (estado RESUELTO con id destino único).

6. ¿Cuántos registros tienen relaciones necesarias completamente resueltas?
   0 de 0 con relaciones necesarias completamente resueltas (padreResuelto).

7. ¿Cuántos registros quedan clasificados como AUTO y, por tanto, serían potencialmente migrables sin decisión humana adicional?
   0 registro(s) AUTO (potencialmente migrables sin decisión humana adicional).

8. ¿Cuántos registros requieren REVISIÓN humana?
   0 registro(s) requieren REVISIÓN humana.

9. ¿Cuántos registros están INCOMPLETOS?
   0 registro(s) INCOMPLETOS.

10. ¿Cuántos registros están BLOQUEADOS o presentan conflictos que impiden una migración segura?
    0 registro(s) BLOQUEADOS; 0 línea(s) con conflicto registrado.

11. ¿Cuántos registros están clasificados como NO_MIGRABLE?
    0 registro(s) NO_MIGRABLES.

12. ¿Cuántos duplicados, posibles duplicados y registros huérfanos se han detectado?
    Duplicados exactos: 0; probables: 0; huérfanos: 0.

13. ¿Qué incidencias afectan a documentos, Storage o información fiscal que deban conservarse sin pérdida de procedencia?
    Documentos: 0 analizados (0 completos, 0 con incidencia). Objetos legacy pendientes: 0. Registros fiscales: 0 analizados (0 con incidencia).
    Sin incidencias: nada que conservar.

14. ¿El dry-run es reproducible e idempotente y se ha confirmado que no ejecuta ninguna escritura real?
    Idempotencia: PASS — loteSha256 verificado por recomputación sobre 0 migrationKey(s) ordenadas; el orden de entrada no influye (el motor ordena por migrationKey).
    No-escritura: PASS — soloLectura=true; B4 no ejecuta escrituras reales (garantía testeada).

9. DECISIÓN DE MIGRACIÓN
------------------------
Migración real ejecutada: NO
Escrituras históricas ejecutadas: NO
Registros potencialmente migrables: 0
Registros que requieren revisión/autorización: 0

10. PENDIENTES
-------------
(lote vacío: sin registros analizados)

FIN DEL INFORME
===============
`);
  });
  it('L5 · informe mixto: estructura completa exacta (comparación íntegra)', () => {
    const res = ejecutarDryRun({
      registros: [
        gastoCompleto('exp_L5'),
        { entidad: 'CANDIDATO', proveniencia: prov('cand_L5'), datos: {} },
      ],
      catalogos: catalogoBase(),
    });
    expect(generarInforme(res)).toBe(`ORDEN 5 — B4 DRY-RUN DE MIGRACIÓN
==================================

1. RESUMEN
-----------
Registros analizados: 2
AUTO: 1
REVISIÓN: 0
INCOMPLETO: 0
BLOQUEADO: 0
NO_MIGRABLE: 1

2. PROVENIENCIA
---------------
Fuentes analizadas: 1
Registros con procedencia completa: 2
Registros con procedencia incompleta: 0

3. RESOLUCIÓN
-------------
Propietario resuelto: 1
Inmueble resuelto: 1
Relaciones completas: 1

4. INTEGRIDAD
-------------
Duplicados exactos: 0
Duplicados probables: 0
Huérfanos: 0
Conflictos: 0

5. DOCUMENTOS Y STORAGE
-----------------------
Documentos completos: 0
Documentos con incidencia: 0
Objetos legacy pendientes: 0

6. FISCALIDAD
-------------
Registros fiscales analizados: 1
Registros fiscales con incidencia: 1

7. IDEMPOTENCIA Y SEGURIDAD
---------------------------
Idempotencia: PASS
No-escritura: PASS

8. 14 PREGUNTAS CANÓNICAS
-------------------------
1. ¿Cuántos registros históricos se han analizado?
   2 registro(s) histórico(s) analizados (lote a09cf21ed123…, esquema b4-dryrun-v1).

2. ¿De qué fuentes/orígenes proceden los registros analizados?
   1 fuente(s) analizada(s): RENTASYNC.
   RENTASYNC: total 2 (AUTO 1, REVISIÓN 0, INCOMPLETO 0, BLOQUEADO 0, NO_MIGRABLE 1)

3. ¿Cuántos registros tienen una procedencia completa y trazable?
   2 de 2 con procedencia completa y trazable (0 con procedencia incompleta).

4. ¿Cuántos registros tienen propietario destino resuelto inequívocamente?
   1 registro(s) con propietario destino resuelto inequívocamente (estado RESUELTO con id destino único).
   Resto: INCOMPLETO 1, BLOQUEADO 0, NO_MIGRABLE 0.

5. ¿Cuántos registros tienen inmueble destino resuelto inequívocamente?
   1 registro(s) con inmueble destino resuelto inequívocamente (estado RESUELTO con id destino único).
   Resto: INCOMPLETO 1, BLOQUEADO 0, NO_MIGRABLE 0.

6. ¿Cuántos registros tienen relaciones necesarias completamente resueltas?
   1 de 2 con relaciones necesarias completamente resueltas (padreResuelto). Incidencias: ×1 entidad 'CANDIDATO' sin mapeo a modelo destino (no se inventa canal).

7. ¿Cuántos registros quedan clasificados como AUTO y, por tanto, serían potencialmente migrables sin decisión humana adicional?
   1 registro(s) AUTO (potencialmente migrables sin decisión humana adicional).
   Evidencia (migrationKey): 88fec3ce2970.

8. ¿Cuántos registros requieren REVISIÓN humana?
   0 registro(s) requieren REVISIÓN humana.

9. ¿Cuántos registros están INCOMPLETOS?
   0 registro(s) INCOMPLETOS.

10. ¿Cuántos registros están BLOQUEADOS o presentan conflictos que impiden una migración segura?
    0 registro(s) BLOQUEADOS; 0 línea(s) con conflicto registrado.

11. ¿Cuántos registros están clasificados como NO_MIGRABLE?
    1 registro(s) NO_MIGRABLES. Motivos: ×1 entidad 'CANDIDATO' sin mapeo a modelo destino (no se inventa canal).

12. ¿Cuántos duplicados, posibles duplicados y registros huérfanos se han detectado?
    Duplicados exactos: 0; probables: 0; huérfanos: 0.

13. ¿Qué incidencias afectan a documentos, Storage o información fiscal que deban conservarse sin pérdida de procedencia?
    Documentos: 0 analizados (0 completos, 0 con incidencia). Objetos legacy pendientes: 0. Registros fiscales: 1 analizados (1 con incidencia).
    Incidencias (procedencia conservada):
    88fec3ce2970 FISCAL [RENTASYNC:exp_L5]: B4 no calcula deducibilidad histórica (sin transformador puro validado; la migración no destruye el original)

14. ¿El dry-run es reproducible e idempotente y se ha confirmado que no ejecuta ninguna escritura real?
    Idempotencia: PASS — loteSha256 verificado por recomputación sobre 2 migrationKey(s) ordenadas; el orden de entrada no influye (el motor ordena por migrationKey).
    No-escritura: PASS — soloLectura=true; B4 no ejecuta escrituras reales (garantía testeada).

9. DECISIÓN DE MIGRACIÓN
------------------------
Migración real ejecutada: NO
Escrituras históricas ejecutadas: NO
Registros potencialmente migrables: 1
Registros que requieren revisión/autorización: 1

10. PENDIENTES
-------------
- 923b13e9767d CANDIDATO [RENTASYNC:cand_L5] → NO_MIGRABLE: entidad 'CANDIDATO' sin mapeo a modelo destino (no se inventa canal)

FIN DEL INFORME
===============
`);
  });
  it('L6 · determinismo: misma entrada (cualquier orden) ⇒ mismo informe', () => {
    const base = mixto();
    const registros = [...base.lineas.map((l) => ({
      entidad: l.entidad,
      proveniencia: { ...l.proveniencia },
      datos: { ...l.datoOriginal },
    }))].reverse() as RegistroHistorico[];
    const re = ejecutarDryRun({ registros, catalogos: catalogoBase() });
    expect(generarInforme(re)).toBe(generarInforme(base));
    expect(responderPreguntas(re)).toEqual(responderPreguntas(base));
    expect(generarInforme(base)).toBe(generarInforme(base));
  });
  it('L7 · la verificación es real: lote manipulado ⇒ FAIL (no PASS hardcoded)', () => {
    const res = mixto();
    const corrupto: DryRunResult = { ...res, loteSha256: '0'.repeat(64) };
    expect(responderPreguntas(corrupto)[13].respuesta).toContain('Idempotencia: FAIL');
    expect(responderPreguntas(corrupto)[13].respuesta).toContain('NO DETERMINADO');
    expect(generarInforme(corrupto)).toContain('Idempotencia: FAIL');
    const sinLectura = { ...res, soloLectura: false as unknown as true };
    expect(responderPreguntas(sinLectura)[13].respuesta).toContain('No-escritura: FAIL');
    expect(generarInforme(sinLectura)).toContain('No-escritura: FAIL');
  });
});

// ---------------------------------------------------------------------------
// M · ORDEN 6 — Revisión adversa: 17 casos + invariantes + coherencia informe
// ---------------------------------------------------------------------------
describe('B4 · M — Revisión adversa ORDEN 6 (casos 1–17 + invariantes)', () => {
  const mixtoRevision = () => ejecutarDryRun({
    registros: [
      gastoCompleto('exp_Mauto', { fechaDevengo: '2026-05-15', concepto: 'Cuota comunidad mayo' }),
      gastoCompleto('exp_MrevA', { fechaDevengo: '2026-03-10' }),
      gastoCompleto('exp_MrevB', { fechaDevengo: '2026-03-20' }),
      gastoCompleto('exp_Minc', { propertyId: 'prop_sin_mapeo' }),
      gastoCompleto('exp_Mbloq', { fechaDevengo: '2026-06-15', concepto: 'Cuota comunidad junio' }),
      gastoCompleto('exp_Mbloq', { fechaDevengo: '2026-06-15', concepto: 'Cuota comunidad junio' }),
      { entidad: 'CANDIDATO', proveniencia: prov('cand_M'), datos: {} },
      {
        entidad: 'DOCUMENTO', proveniencia: prov('doc_M'),
        datos: { nombreOriginal: 'x.pdf', rutaOriginal: 'https://origen.test/x.pdf', propietarioId: 'prop_A' },
      },
      {
        entidad: 'LEGACY_STORAGE',
        proveniencia: { source: 'LEGACY_STORAGE', sourceCollection: 'cobros_justificantes', sourceId: '2024-03/h.pdf' },
        datos: { rutaOrigen: 'cobros_justificantes/2024-03/h.pdf' },
      },
    ],
    catalogos: catalogoBase(),
  });

  it('M1 · caso 1: propietario ambiguo (nif duplicado) ⇒ BLOQUEADO', () => {
    const cat = catalogoBase();
    const res = ejecutarDryRun({
      registros: [{ entidad: 'PROPIETARIO', proveniencia: prov('owner_M1'), datos: { nombre: 'X', nifCif: '11111111A' } }],
      catalogos: { ...cat, propietarios: [...cat.propietarios, { id: 'prop_X', nombre: 'Duplicado', nifCif: '11111111A' }] },
    });
    const l = lineaDe(res.lineas, 'owner_M1');
    expect(l.decision).toBe('BLOQUEADO');
    expect(l.motivo).toContain('nifCif duplicado');
  });
  it('M2 · caso 2: inmueble ambiguo (catastral duplicada) ⇒ BLOQUEADO', () => {
    const cat = catalogoBase();
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_M2', { propertyId: undefined, referenciaCatastral: 'CAT001' })],
      catalogos: { ...cat, inmuebles: [...cat.inmuebles, { id: 'inm_X', direccion: 'Otra 9', referenciaCatastral: 'CAT001' }] },
    });
    const l = lineaDe(res.lineas, 'exp_M2');
    expect(l.decision).toBe('BLOQUEADO');
    expect(l.motivo).toContain('catastral duplicada');
  });
  it('M3 · caso 3: propietario inexistente ⇒ INCOMPLETO (no huérfano si hay padre)', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_M3', { propietarioId: 'prop_X' })],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'exp_M3');
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.motivo).toContain('NO_ENCONTRADO');
    expect(l.huerfano.es).toBe(false);
    expect(l.relaciones.padreResuelto).toBe(true);
  });
  it('M4 · caso 4: inmueble inexistente ⇒ INCOMPLETO + huérfano', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_M4', { propertyId: undefined, inmuebleId: 'inm_X' })],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'exp_M4');
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.motivo).toContain('sin inmueble');
    expect(l.evidenciaInmueble).toContain('inexistente');
    expect(l.huerfano.es).toBe(true);
  });
  it('M5 · caso 5: duplicado probable ⇒ REVISIÓN sin eliminar ni fusionar', () => {
    const res = ejecutarDryRun({
      registros: [
        gastoCompleto('exp_M5a', { fechaDevengo: '2026-03-10' }),
        gastoCompleto('exp_M5b', { fechaDevengo: '2026-03-20' }),
      ],
      catalogos: catalogoBase(),
    });
    expect(res.lineas).toHaveLength(2);
    const rev = res.lineas.filter((x) => x.decision === 'REVISION');
    expect(rev).toHaveLength(1);
    expect(rev[0].duplicado.tipo).toBe('PROBABLE');
    expect(rev[0].motivo).toContain('probable');
  });
  it('M6 · caso 6: duplicado exacto intra-lote ⇒ BLOQUEADO/EXACTO (ambos conservados)', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_M6'), gastoCompleto('exp_M6')],
      catalogos: catalogoBase(),
    });
    expect(res.lineas).toHaveLength(2);
    const bloq = res.lineas.filter((x) => x.decision === 'BLOQUEADO');
    expect(bloq).toHaveLength(1);
    expect(bloq[0].duplicado.tipo).toBe('EXACTO');
  });
  it('M7 · caso 7: huérfano (gasto sin inmueble) ⇒ INCOMPLETO, nunca AUTO', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_M7', { propertyId: undefined })],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'exp_M7');
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.huerfano.es).toBe(true);
    expect(l.decision).not.toBe('AUTO');
  });
  it('M8 · caso 8: conflicto de titularidad ⇒ BLOQUEADO (corrección ORDEN 6)', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_M8', { propietarioId: 'prop_B' })],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'exp_M8');
    expect(l.decision).toBe('BLOQUEADO');
    expect(l.motivo).toContain('titularidad');
    expect(l.motivo).toContain('prop_B');
  });
  it('M8b · incoherencia contrato↔inmueble ⇒ BLOQUEADO (corrección ORDEN 6)', () => {
    const res = ejecutarDryRun({
      registros: [{ entidad: 'CONTRATO', proveniencia: prov('ct_M8b'), datos: { id: 'ct_A', inmuebleId: 'inm_B' } }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'ct_M8b');
    expect(l.decision).toBe('BLOQUEADO');
    expect(l.motivo).toContain('contrato↔inmueble');
  });
  it('M9 · caso 9: conflicto de cartera (destino no permitido) ⇒ BLOQUEADO', () => {
    const cat = catalogoBase();
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_M9')],
      catalogos: { ...cat, propietariosPermitidosIds: ['prop_B'] },
    });
    const l = lineaDe(res.lineas, 'exp_M9');
    expect(l.decision).toBe('BLOQUEADO');
    expect(l.motivo).toContain('NO_PERMITIDO');
  });
  it('M10 · caso 10: documento legacy sin pid ⇒ INCOMPLETO, ruta conservada, sin destino inventado', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'LEGACY_STORAGE',
        proveniencia: { source: 'LEGACY_STORAGE', sourceCollection: 'cobros_justificantes', sourceId: '2024-05/k.pdf' },
        datos: { rutaOrigen: 'cobros_justificantes/2024-05/k.pdf' },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, '2024-05/k.pdf');
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.legacyStorage?.rutaOrigen).toBe('cobros_justificantes/2024-05/k.pdf');
    expect(l.datoOriginal['rutaOrigen']).toBe('cobros_justificantes/2024-05/k.pdf');
    expect(l.destinoPropuesto).toBeNull();
    expect(l.legacyStorage?.destinoPropuesto).toBeNull();
  });
  it('M11 · caso 11: fiscalidad incompleta ⇒ INCOMPLETO; sin deducible ⇒ incidencia sin bloquear AUTO', () => {
    const sinCat = ejecutarDryRun({
      registros: [gastoCompleto('exp_M11a', { categoria: undefined })],
      catalogos: catalogoBase(),
    });
    const li = lineaDe(sinCat.lineas, 'exp_M11a');
    expect(li.decision).toBe('INCOMPLETO');
    expect(li.motivo).toContain('categoria');
    const ok = ejecutarDryRun({ registros: [gastoCompleto('exp_M11b')], catalogos: catalogoBase() });
    const la = lineaDe(ok.lineas, 'exp_M11b');
    expect(la.decision).toBe('AUTO');
    expect(la.fiscal?.deducible).toBeNull();
    expect(generarInforme(ok)).toContain('Registros fiscales con incidencia: 1');
  });
  it('M12 · caso 12: padre inexistente (cobro→contrato ct_X) ⇒ INCOMPLETO + huérfano', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'COBRO', proveniencia: prov('cob_M12'),
        datos: { propertyId: 'prop_ext_1', contratoId: 'ct_X', importe: 600, mes: 7, anio: 2026, concepto: 'Alquiler' },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, 'cob_M12');
    expect(l.decision).toBe('INCOMPLETO');
    expect(l.huerfano.es).toBe(true);
    expect(l.huerfano.motivo).toContain('contrato');
  });
  it('M13 · caso 13: A,B,C vs C,B,A ⇒ mismo resultado e informe', () => {
    const a = gastoCompleto('exp_M13a');
    const b = { entidad: 'CANDIDATO', proveniencia: prov('cand_M13'), datos: {} } as RegistroHistorico;
    const c = gastoCompleto('exp_M13c', { fechaDevengo: '2026-04-15', concepto: 'Cuota comunidad abril' });
    const r1 = ejecutarDryRun({ registros: [a, b, c], catalogos: catalogoBase() });
    const r2 = ejecutarDryRun({ registros: [c, b, a], catalogos: catalogoBase() });
    expect(r2.lineas).toEqual(r1.lineas);
    expect(r2.resumen).toEqual(r1.resumen);
    expect(generarInforme(r2)).toBe(generarInforme(r1));
    expect(derivarPlan(r2)).toEqual(derivarPlan(r1));
  });
  it('M14 · caso 14: triple ejecución idéntica ⇒ mismo resultado, plan e informe', () => {
    const lote = () => mixtoRevision().lineas.map((l) => ({
      entidad: l.entidad, proveniencia: { ...l.proveniencia }, datos: { ...l.datoOriginal },
    })) as RegistroHistorico[];
    const r1 = ejecutarDryRun({ registros: lote(), catalogos: catalogoBase() });
    const r2 = ejecutarDryRun({ registros: lote(), catalogos: catalogoBase() });
    const r3 = ejecutarDryRun({ registros: lote(), catalogos: catalogoBase() });
    expect(jsonEstable(r2)).toBe(jsonEstable(r1));
    expect(jsonEstable(r3)).toBe(jsonEstable(r1));
    expect(derivarPlan(r2)).toEqual(derivarPlan(r1));
    expect(generarInforme(r3)).toBe(generarInforme(r1));
  });
  it('M15 · caso 15: el gestor que ejecuta NO se convierte en propietario destino', () => {
    for (const modalidad of ['GESTOR_PROFESIONAL', 'GESTOR_PROPIETARIO'] as const) {
      const cat = catalogoBase();
      // Incluso si el uid del importador coincide textualmente con un id de
      // catálogo, jamás se lee como destino: sin datos, INCOMPLETO.
      const sinDatos = ejecutarDryRun({
        registros: [gastoCompleto('exp_M15', { propertyId: undefined })],
        catalogos: { ...cat, importador: { uid: 'prop_A', modalidad } },
      });
      const l = lineaDe(sinDatos.lineas, 'exp_M15');
      expect(l.propietarioDestinoId).toBeNull();
      expect(l.estadoPropietario).toBe('INCOMPLETO');
      const conDatos = ejecutarDryRun({
        registros: [gastoCompleto('exp_M15b')],
        catalogos: { ...cat, importador: { uid: 'uid_gestor_x', modalidad } },
      });
      expect(lineaDe(conDatos.lineas, 'exp_M15b').propietarioDestinoId).toBe('prop_A');
    }
  });
  it('M16 · caso 16: registro completamente migrable ⇒ AUTO inequívoco', () => {
    const res = ejecutarDryRun({ registros: [gastoCompleto('exp_M16')], catalogos: catalogoBase() });
    const l = lineaDe(res.lineas, 'exp_M16');
    expect(l).toMatchObject({
      estado: 'COMPLETO', decision: 'AUTO', confianza: 'ALTA',
      propietarioDestinoId: 'prop_A', inmuebleDestinoId: 'inm_A',
    });
    expect(l.destinoPropuesto?.destinoId).toMatch(/^gas_inm_A_exp_M16/);
    expect(l.huerfano.es).toBe(false);
    expect(l.relaciones.padreResuelto).toBe(true);
    expect(l.evidencias.length).toBeGreaterThan(0);
  });
  it('M17 · caso 17: registros no migrables (TRUNCADO + entidad rara) ⇒ NO_MIGRABLE', () => {
    const res = ejecutarDryRun({
      registros: [
        {
          entidad: 'GASTO', proveniencia: prov('tru_M17'), datos: { resto: 'ilegible' },
          normalizado: {
            entidad: 'TRUNCADO', destino: {}, transformaciones: [],
            incidencias: [], camposRequierenValidacion: [], bloqueado: true,
            motivoBloqueo: 'truncado en origen',
          },
        },
        { entidad: 'SISTEMA_DESCONOCIDO_X', proveniencia: prov('raro_M17'), datos: { a: 1 } },
      ],
      catalogos: catalogoBase(),
    });
    expect(res.lineas.map((x) => x.decision)).toEqual(['NO_MIGRABLE', 'NO_MIGRABLE']);
    expect(lineaDe(res.lineas, 'tru_M17').motivo).toContain('truncado');
  });
  it('M18 · invariante: toda línea AUTO ⇒ sin orfandad, padre resuelto, ALTA, destino computable', () => {
    const res = mixtoRevision();
    const autos = res.lineas.filter((x) => x.decision === 'AUTO');
    expect(autos.length).toBeGreaterThan(0);
    for (const l of autos) {
      expect(l.huerfano.es).toBe(false);
      expect(l.relaciones.padreResuelto).toBe(true);
      expect(l.confianza).toBe('ALTA');
      expect(l.destinoPropuesto?.destinoId).not.toBeNull();
    }
  });
  it('M19 · coherencia DryRunResult → preguntas → informe (recomputación independiente)', () => {
    const res = mixtoRevision();
    const informe = generarInforme(res);
    const LS = res.lineas;
    const cuenta = (d: string): number => LS.filter((x) => x.decision === d).length;
    const num = (etiqueta: string): number => {
      const m = informe.match(new RegExp(`^${etiqueta}: (\\d+)$`, 'm'));
      if (!m) throw new Error(`etiqueta ausente en informe: ${etiqueta}`);
      return Number(m[1]);
    };
    const procOk = (l: (typeof LS)[number]): boolean =>
      l.proveniencia.source.trim() !== '' && l.proveniencia.sourceId.trim() !== ''
      && !l.proveniencia.sourceId.startsWith('__ID_NO_RECUPERADO_');
    expect(num('Registros analizados')).toBe(LS.length);
    expect(num('AUTO')).toBe(cuenta('AUTO'));
    expect(num('REVISIÓN')).toBe(cuenta('REVISION'));
    expect(num('INCOMPLETO')).toBe(cuenta('INCOMPLETO'));
    expect(num('BLOQUEADO')).toBe(cuenta('BLOQUEADO'));
    expect(num('NO_MIGRABLE')).toBe(cuenta('NO_MIGRABLE'));
    expect(num('Fuentes analizadas')).toBe(new Set(LS.map((x) => x.proveniencia.source)).size);
    expect(num('Registros con procedencia completa')).toBe(LS.filter(procOk).length);
    expect(num('Registros con procedencia incompleta')).toBe(LS.filter((x) => !procOk(x)).length);
    expect(num('Propietario resuelto')).toBe(LS.filter((x) => x.estadoPropietario === 'RESUELTO' && x.propietarioDestinoId !== null).length);
    expect(num('Inmueble resuelto')).toBe(LS.filter((x) => x.estadoInmueble === 'RESUELTO' && x.inmuebleDestinoId !== null).length);
    expect(num('Relaciones completas')).toBe(LS.filter((x) => x.relaciones.padreResuelto).length);
    expect(num('Duplicados exactos')).toBe(LS.filter((x) => x.duplicado.tipo === 'EXACTO').length);
    expect(num('Duplicados probables')).toBe(LS.filter((x) => x.duplicado.tipo === 'PROBABLE').length);
    expect(num('Huérfanos')).toBe(LS.filter((x) => x.huerfano.es).length);
    expect(num('Conflictos')).toBe(cuenta('BLOQUEADO'));
    expect(num('Documentos completos')).toBe(LS.filter((x) => x.entidad === 'DOCUMENTO' && x.decision === 'AUTO').length);
    expect(num('Documentos con incidencia')).toBe(LS.filter((x) => x.entidad === 'DOCUMENTO' && x.decision !== 'AUTO').length);
    expect(num('Objetos legacy pendientes')).toBe(LS.filter((x) => x.entidad === 'LEGACY_STORAGE' && x.legacyStorage?.estado !== 'RESUELTO').length);
    expect(num('Registros fiscales analizados')).toBe(LS.filter((x) => x.fiscal !== undefined).length);
    expect(num('Registros fiscales con incidencia')).toBe(LS.filter((x) => x.fiscal !== undefined && (x.fiscal.deducible === null || x.fiscal.clasificacion === 'SIN_CLASIFICAR')).length);
    expect(num('Registros potencialmente migrables')).toBe(cuenta('AUTO'));
    expect(num('Registros que requieren revisión/autorización')).toBe(LS.length - cuenta('AUTO'));
    // Las preguntas reflejan los mismos conteos.
    const ps = responderPreguntas(res);
    expect(ps).toHaveLength(14);
    expect(ps[6].respuesta).toContain(`${cuenta('AUTO')} registro(s) AUTO`);
    expect(ps[9].respuesta).toContain(`${cuenta('BLOQUEADO')} registro(s) BLOQUEADOS`);
  });
  it('M20 · alias `fecha` alimenta la huella: solo difieren en fecha ⇒ NO EXACTO', () => {
    const res = ejecutarDryRun({
      registros: [
        gastoCompleto('exp_M20a', { fechaDevengo: undefined, fecha: '2026-03-10' }),
        gastoCompleto('exp_M20b', { fechaDevengo: undefined, fecha: '2026-03-20' }),
      ],
      catalogos: catalogoBase(),
    });
    expect(res.lineas.filter((x) => x.duplicado.tipo === 'EXACTO')).toHaveLength(0);
    expect(res.lineas.filter((x) => x.decision === 'BLOQUEADO')).toHaveLength(0);
    // Mismo concepto+mes ⇒ el segundo es PROBABLE (tope REVISIÓN), no exacto.
    expect(res.lineas.filter((x) => x.duplicado.tipo === 'PROBABLE')).toHaveLength(1);
  });
  it('M21 · proveniencia sin sourceId recuperable ⇒ REVISIÓN, nunca AUTO', () => {
    const res = ejecutarDryRun({
      registros: [{
        entidad: 'GASTO',
        proveniencia: { source: 'RENTASYNC', sourceFile: 'f.json', sourceId: '__ID_NO_RECUPERADO_9' },
        datos: {
          propertyId: 'prop_ext_1', importe: 120.5, fechaDevengo: '2026-03-15',
          categoria: 'Comunidad', concepto: 'Cuota comunidad marzo',
        },
      }],
      catalogos: catalogoBase(),
    });
    const l = lineaDe(res.lineas, '__ID_NO_RECUPERADO_9');
    expect(l.decision).toBe('REVISION');
    expect(l.motivo).toContain('proveniencia');
  });
  it('M22 · titularidad coherente explícita ⇒ AUTO (sin falso positivo de M8)', () => {
    const res = ejecutarDryRun({
      registros: [gastoCompleto('exp_M22', { propietarioId: 'prop_A' })],
      catalogos: catalogoBase(),
    });
    expect(lineaDe(res.lineas, 'exp_M22').decision).toBe('AUTO');
  });
});
