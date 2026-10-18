import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RULES = crearEvaluadorReglas(readFileSync('firestore.rules', 'utf8')).permite;
const UID = 'uid_A';
const OWNER = 'prop_A';
const MOV_ID = 'mov_a1b2c3d4e5f60718';
const IMP_ID = 'imp_0011223344556677';
const PROP_ID = `conc_${MOV_ID}`;
const IMPORT_DOC = `${OWNER}_${IMP_ID}`;
const MOV_DOC = `${OWNER}_${MOV_ID}`;
const PROP_DOC = `${OWNER}_${PROP_ID}`;
const EVENT_ID = 'conc_evt_op_1';
const EVENT_DOC = `${OWNER}_${EVENT_ID}`;

const auth = { uid: UID, token: { email: 'titular@example.invalid' } } as Peticion['auth'];
const authOther = { uid: 'uid_B', token: { email: 'other@example.invalid' } } as Peticion['auth'];
const authAdmin = { uid: 'uid_admin', token: { email: 'sarqsan2@gmail.com' } } as Peticion['auth'];

const perfil = {
  usuarioId: 'user_A',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  propietarioId: OWNER,
  inmuebleIds: [],
};
const perfilOther = {
  usuarioId: 'user_B',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  propietarioId: 'prop_B',
  inmuebleIds: [],
};
const baseDb: Peticion['db'] = {
  'usuarios_auth/uid_A': perfil,
  'usuarios/user_A': { id: 'user_A', authUid: UID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' },
  'usuarios_auth/uid_B': perfilOther,
  'usuarios/user_B': { id: 'user_B', authUid: 'uid_B', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' },
  'usuarios_auth/uid_admin': { usuarioId: 'user_admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', propietarioId: '' },
  'usuarios/user_admin': { id: 'user_admin', authUid: 'uid_admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO' },
};

const importacion = {
  id: IMP_ID,
  propietarioId: OWNER,
  origen: 'CSV',
  fechaImportacion: '2026-05-05T12:00:00.000Z',
  importadoPor: UID,
  nombreFichero: 'extracto.csv',
  totalMovimientos: 1,
  nuevos: 1,
  duplicados: 0,
  errores: 0,
  requiereRevision: 0,
  hashFichero: 'a'.repeat(64),
  divisa: 'EUR',
  cuentaRef: `cta_${'b'.repeat(64)}`,
  cuentaIbanEnmascarado: '•••• 1234',
  idsMovimientosNuevos: [MOV_ID],
  resultadosMovimientos: [{ fila: 2, estado: 'NUEVO', idMovimiento: MOV_ID }],
  estado: 'COMPLETADA',
};
const movimiento = {
  idImportacion: IMP_ID,
  idMovimiento: MOV_ID,
  fechaOperacion: '2026-05-05',
  importe: 100,
  tipo: 'INGRESO',
  concepto: 'ALQUILER MAYO',
  conceptoOriginal: 'ALQUILER MAYO',
  origen: 'CSV',
  propietarioId: OWNER,
  cuentaRef: `cta_${'b'.repeat(64)}`,
  cuentaIbanEnmascarado: '•••• 1234',
  divisa: 'EUR',
  metadatosOriginales: { filaOrigen: 2, divisa: 'EUR' },
  hashIdempotencia: 'a1b2c3d4e5f60718',
  fechaImportacion: '2026-05-05T12:00:00.000Z',
  importadoPor: UID,
};
const candidato = {
  tipo: 'COBRO',
  id: 'cobro_cont_2026_05',
  contratoId: 'cont_A',
  inmuebleId: 'inm_A',
  propietarioId: OWNER,
  importe: 100,
  fecha: '2026-05-05',
  estadoActual: 'PENDIENTE',
  yaConciliado: false,
};
const historial = [{ id: 'hist_1', fecha: '2026-05-05T12:01:00.000Z', accion: 'PROPUESTA', actorUid: UID, motivo: 'Inicial' }];
const propuesta = {
  id: PROP_ID,
  movimientoId: MOV_ID,
  idImportacion: IMP_ID,
  propietarioId: OWNER,
  candidato,
  candidatosAlternativos: [],
  puntuacion: 90,
  confianza: 'ALTA',
  factores: [],
  estado: 'PROPUESTO',
  importeMovimiento: 100,
  importeCandidato: 100,
  diferenciaImporte: 0,
  esDiscrepancia: false,
  toleranciaAplicada: 0.01,
  ventanaDias: 5,
  fechaPropuesta: '2026-05-05T12:01:00.000Z',
  propuestaPor: 'SISTEMA',
  historial,
  aplicado: false,
  reversible: true,
  revision: 0,
};
const evento = {
  id: EVENT_ID,
  propietarioId: OWNER,
  propuestaId: PROP_ID,
  movimientoId: MOV_ID,
  accion: 'CONCILIAR',
  fecha: '2026-05-06T09:00:00.000Z',
  actorUid: UID,
  actorUsuarioId: 'user_A',
  motivo: 'Extracto y periodo verificados con documentación',
  estadoAnterior: 'PROPUESTO',
  estadoNuevo: 'CONCILIADO',
  candidatoAnteriorId: `COBRO:${candidato.id}`,
  candidatoNuevoId: `COBRO:${candidato.id}`,
  operacionId: 'op_1',
  revision: 1,
  evidenciaImportacionId: IMP_ID,
  evidenciaHashFichero: 'a'.repeat(64),
  movimientoDocId: MOV_DOC,
};
const historialDecision = {
  id: EVENT_ID,
  fecha: evento.fecha,
  accion: 'APLICADA',
  usuario: 'Titular',
  actorUid: UID,
  motivo: evento.motivo,
  estadoAnterior: 'PROPUESTO',
  estadoNuevo: 'CONCILIADO',
  candidatoAnteriorId: `COBRO:${candidato.id}`,
  candidatoNuevoId: `COBRO:${candidato.id}`,
};
const propuestaActualizada = {
  ...propuesta,
  estado: 'CONCILIADO',
  revision: 1,
  ultimoEventoId: EVENT_ID,
  historial: [...historial, historialDecision],
  motivoDecision: evento.motivo,
  ambigua: false,
  fechaConfirmacion: evento.fecha,
  confirmadoPor: UID,
  candidato,
};

function op(
  collection: string,
  docId: string,
  verb: 'get' | 'list' | 'create' | 'update' | 'delete',
  opts: { db?: Peticion['db']; after?: Peticion['after']; existing?: Record<string, unknown> | null; incoming?: Record<string, unknown> | null; who?: Peticion['auth'] } = {},
): boolean {
  return RULES(collection, verb, {
    auth: opts.who === undefined ? auth : opts.who,
    db: opts.db || baseDb,
    after: opts.after,
    docId,
    resource: (opts.existing ?? null) as Peticion['resource'],
    requestResource: (opts.incoming ?? null) as Peticion['requestResource'],
  });
}

describe('P3 Rules reparación · importación cerrada y eventos append-only', () => {
  it('bloquea creación y actualización de movimientos e importaciones desde cliente', () => {
    const after = { [`importaciones_bancarias/${IMPORT_DOC}`]: importacion };
    expect(op('movimientos_bancarios', MOV_DOC, 'create', { after, incoming: movimiento })).toBe(false);
    expect(op('movimientos_bancarios', MOV_DOC, 'update', { existing: movimiento, incoming: movimiento })).toBe(false);
    expect(op('importaciones_bancarias', IMPORT_DOC, 'create', { incoming: importacion })).toBe(false);
    expect(op('importaciones_bancarias', IMPORT_DOC, 'update', { existing: importacion, incoming: importacion })).toBe(false);
  });

  it('bloquea creación de propuestas; solo permite update con evento válido', () => {
    const afterImport = { [`importaciones_bancarias/${IMPORT_DOC}`]: importacion };
    expect(op('conciliaciones_bancarias', PROP_DOC, 'create', { after: afterImport, incoming: propuesta })).toBe(false);
    // Sin evento, update denegado
    expect(op('conciliaciones_bancarias', PROP_DOC, 'update', { existing: propuesta, incoming: propuestaActualizada, after: {} })).toBe(false);
    // Con evento válido, update permitido
    const afterDecision = {
      [`eventos_conciliacion_bancaria/${EVENT_DOC}`]: evento,
      [`conciliaciones_bancarias/${PROP_DOC}`]: propuestaActualizada,
      [`importaciones_bancarias/${IMPORT_DOC}`]: importacion,
      [`movimientos_bancarios/${MOV_DOC}`]: movimiento,
    };
    expect(op('conciliaciones_bancarias', PROP_DOC, 'update', { existing: propuesta, incoming: propuestaActualizada, after: afterDecision })).toBe(true);
  });

  it('evento requiere actor autenticado, evidencia hash y movimiento vinculado', () => {
    const afterOk = {
      [`conciliaciones_bancarias/${PROP_DOC}`]: propuestaActualizada,
      [`importaciones_bancarias/${IMPORT_DOC}`]: importacion,
      [`movimientos_bancarios/${MOV_DOC}`]: movimiento,
    };
    const dbConPropuesta = {
      ...baseDb,
      [`conciliaciones_bancarias/${PROP_DOC}`]: propuesta,
      [`importaciones_bancarias/${IMPORT_DOC}`]: importacion,
      [`movimientos_bancarios/${MOV_DOC}`]: movimiento,
    };
    // Actor correcto
    expect(op('eventos_conciliacion_bancaria', EVENT_DOC, 'create', { db: dbConPropuesta, after: afterOk, incoming: evento })).toBe(true);
    // Actor distinto
    expect(op('eventos_conciliacion_bancaria', EVENT_DOC, 'create', { db: dbConPropuesta, after: afterOk, incoming: { ...evento, actorUid: 'uid_B' } })).toBe(false);
    // Hash no coincide
    expect(
      op('eventos_conciliacion_bancaria', EVENT_DOC, 'create', {
        db: { ...dbConPropuesta, [`importaciones_bancarias/${IMPORT_DOC}`]: { ...importacion, hashFichero: 'b'.repeat(64) } },
        after: { ...afterOk, [`importaciones_bancarias/${IMPORT_DOC}`]: { ...importacion, hashFichero: 'b'.repeat(64) } },
        incoming: evento,
      }),
    ).toBe(false);
    // Movimiento doc no existe
    expect(
      op('eventos_conciliacion_bancaria', EVENT_DOC, 'create', {
        db: { ...dbConPropuesta, [`movimientos_bancarios/${MOV_DOC}`]: undefined as any },
        after: { [`conciliaciones_bancarias/${PROP_DOC}`]: propuestaActualizada, [`importaciones_bancarias/${IMPORT_DOC}`]: importacion },
        incoming: evento,
      }),
    ).toBe(false);
    // Motivo demasiado corto
    expect(op('eventos_conciliacion_bancaria', EVENT_DOC, 'create', { db: dbConPropuesta, after: afterOk, incoming: { ...evento, motivo: 'abc' } })).toBe(false);
  });

  it('eventos son inmutables y no se pueden borrar ni editar', () => {
    expect(op('eventos_conciliacion_bancaria', EVENT_DOC, 'update', { existing: evento, incoming: evento })).toBe(false);
    expect(op('eventos_conciliacion_bancaria', EVENT_DOC, 'delete', { existing: evento })).toBe(false);
  });

  it('aislamiento: propietario B no lee ni modifica datos de A', () => {
    expect(op('conciliaciones_bancarias', PROP_DOC, 'get', { existing: propuesta, who: authOther })).toBe(false);
    expect(op('eventos_conciliacion_bancaria', EVENT_DOC, 'get', { existing: evento, who: authOther })).toBe(false);
    expect(op('movimientos_bancarios', MOV_DOC, 'get', { existing: movimiento, who: authOther })).toBe(false);
    expect(op('importaciones_bancarias', IMPORT_DOC, 'get', { existing: importacion, who: authOther })).toBe(false);
  });

  it('transiciones inválidas denegadas por reglas', () => {
    const propuestaConciliada = { ...propuesta, estado: 'CONCILIADO', revision: 1, historial: [...historial, historialDecision], ultimoEventoId: EVENT_ID };
    const eventoReconciliarMismoEstado = {
      ...evento,
      id: 'conc_evt_op_2',
      estadoAnterior: 'CONCILIADO',
      estadoNuevo: 'CONCILIADO',
      accion: 'CONCILIAR',
      revision: 2,
      operacionId: 'op_2',
    };
    const propuestaReconciliada = {
      ...propuestaConciliada,
      estado: 'CONCILIADO',
      revision: 2,
      ultimoEventoId: eventoReconciliarMismoEstado.id,
      historial: [...propuestaConciliada.historial, { id: eventoReconciliarMismoEstado.id, fecha: eventoReconciliarMismoEstado.fecha, accion: 'APLICADA', actorUid: UID, motivo: eventoReconciliarMismoEstado.motivo, estadoAnterior: 'CONCILIADO', estadoNuevo: 'CONCILIADO' }],
    };
    // Re-conciliar desde CONCILIADO no está permitido (solo REVERSAR/CORREGIR)
    const afterBad = {
      [`eventos_conciliacion_bancaria/${OWNER}_${eventoReconciliarMismoEstado.id}`]: eventoReconciliarMismoEstado,
      [`conciliaciones_bancarias/${PROP_DOC}`]: propuestaReconciliada,
      [`importaciones_bancarias/${IMPORT_DOC}`]: importacion,
      [`movimientos_bancarios/${MOV_DOC}`]: movimiento,
    };
    const dbCon = {
      ...baseDb,
      [`conciliaciones_bancarias/${PROP_DOC}`]: propuestaConciliada,
      [`importaciones_bancarias/${IMPORT_DOC}`]: importacion,
      [`movimientos_bancarios/${MOV_DOC}`]: movimiento,
    };
    expect(op('conciliaciones_bancarias', PROP_DOC, 'update', { existing: propuestaConciliada, incoming: propuestaReconciliada, after: afterBad, db: dbCon })).toBe(false);
  });
});
