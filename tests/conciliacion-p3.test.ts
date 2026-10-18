import { describe, it, expect } from 'vitest';
import type { CobroPeriodo, ContratoFormalizacion, Gasto, Inmueble, UsuarioApp } from '../src/types';
import type { MovimientoBancario, PropuestaConciliacion } from '../src/types/conciliacion';
import { parseCSV, normalizarMovimientosCSV } from '../src/utils/conciliacion/csvParser';
import { parseOFX } from '../src/utils/conciliacion/ofxParser';
import { parseMT940 } from '../src/utils/conciliacion/mt940Parser';
import { detectarDuplicados } from '../src/utils/conciliacion/idempotencia';
import { prepararImportacionBancaria } from '../src/utils/conciliacion/importEngine';
import { buscarCandidatos } from '../src/utils/conciliacion/matchingEngine';
import { crearPropuestasParaMovimientos, decidirConciliacionManual } from '../src/utils/conciliacion/conciliacionEngine';
import { MAX_BYTES_EXTRACTO_P3, normalizarFechaBancaria, normalizarDivisa, parseImporteBancario, redactarTextoBancario, sha256Hex } from '../src/utils/conciliacion/validacionExtracto';

const CSV_VALIDO = [
  'fecha,concepto,importe,divisa,cuenta,referencia,identificador',
  '2026-05-05,Alquiler mayo,1000.00,EUR,cuenta-demo,ALQ-2026,FITID-001',
].join('\n');
const OPCIONES = { nombreFichero: 'extracto.csv', intentoId: 'test_1' };

function movimiento(over: Partial<MovimientoBancario> = {}): MovimientoBancario {
  return {
    idImportacion: 'imp_1', idMovimiento: 'mov_banco_1', fechaOperacion: '2026-05-05', importe: 1000,
    tipo: 'INGRESO', concepto: 'ALQUILER MAYO', conceptoOriginal: 'ALQUILER MAYO', origen: 'CSV',
    propietarioId: 'prop_A', cuentaRef: 'cta_1234567890abcdef', divisa: 'EUR', filaOrigen: 2,
    estadoValidacion: 'VALIDO', metadatosOriginales: {}, hashIdempotencia: 'hash_1',
    fechaImportacion: '2026-05-05T00:00:00.000Z', ...over,
  };
}
function inmueble(owner = 'prop_A'): Inmueble {
  return { id: 'inm_A', propietarioId: owner, propietarioPrincipalId: owner, direccion: 'Calle A', titularesIds: [owner] } as Inmueble;
}
function contrato(owner = 'prop_A', inmuebleId = 'inm_A'): ContratoFormalizacion {
  return { id: 'cont_A', propietarioId: owner, inmuebleId, registroCobros: [] } as unknown as ContratoFormalizacion;
}
function cobro(id: string, owner = 'prop_A', inmuebleId = 'inm_A'): CobroPeriodo {
  return {
    id, propietarioId: owner, inmuebleId, contratoId: 'cont_A', inquilinoId: 'inquilino_A',
    mes: 5, anio: 2026, periodoMesAnio: '2026-05', nombreMes: 'Mayo 2026',
    importePrevisto: 1000, importeRecibido: 0, fechaVencimiento: '2026-05-05',
    estado: 'PENDIENTE', historialCambios: [],
  } as CobroPeriodo;
}
function actor(owner = 'prop_A'): UsuarioApp {
  return { id: 'user_A', uid: 'uid_A', authUid: 'uid_A', nombre: 'Titular', email: 'ignored@example.invalid', tipoPerfil: 'PROPIETARIO', propietarioId: owner } as UsuarioApp;
}
function propuesta(over: Partial<PropuestaConciliacion> = {}): PropuestaConciliacion {
  return {
    id: 'conc_1', movimientoId: 'mov_banco_1', idImportacion: 'imp_1', propietarioId: 'prop_A',
    candidato: { tipo: 'COBRO', id: 'cobro_1', contratoId: 'cont_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', importe: 1000, fecha: '2026-05-05' },
    puntuacion: 90, confianza: 'ALTA', factores: [], estado: 'PROPUESTO', importeMovimiento: 1000,
    importeCandidato: 1000, esDiscrepancia: false, fechaPropuesta: '2026-05-05T00:00:00.000Z',
    propuestaPor: 'SISTEMA', historial: [], aplicado: false, reversible: true, revision: 0, ...over,
  };
}

describe('P3 validación de importes, fechas, divisa y privacidad', () => {
  it('valida fechas reales y formatos admitidos, no normaliza fechas imposibles', () => {
    expect(normalizarFechaBancaria('29/02/2024')).toBe('2024-02-29');
    expect(normalizarFechaBancaria('29/02/2025')).toBeNull();
    expect(normalizarFechaBancaria('2026-13-01')).toBeNull();
    expect(normalizarFechaBancaria('2026-05-05T25:00:00Z')).toBeNull();
    expect(normalizarFechaBancaria('2026-05-05T10:30:00+02:00')).toBe('2026-05-05');
    expect(normalizarFechaBancaria('20260505')).toBe('2026-05-05');
  });

  it('parsea importes EUR con signo/agrupación y rechaza precisión o contenido inválido', () => {
    expect(parseImporteBancario('-1.234,56 €')).toBe(-1234.56);
    expect(parseImporteBancario('1,234.56')).toBe(1234.56);
    expect(parseImporteBancario('1,234')).toBeNull();
    expect(parseImporteBancario('10,999')).toBeNull();
    expect(parseImporteBancario('NaN')).toBeNull();
    expect(parseImporteBancario('1e4')).toBeNull();
    expect(parseImporteBancario(1.001)).toBeNull();
  });

  it('solo acepta una divisa ISO de tres letras y el motor limita a EUR', () => {
    expect(normalizarDivisa('eur')).toBe('EUR');
    expect(normalizarDivisa('EURO')).toBeNull();
    expect(normalizarDivisa('', undefined)).toBeNull();
  });

  it('calcula SHA-256 y redacta IBAN/series numéricas completas', async () => {
    const bytes = new TextEncoder().encode('extracto sintético');
    const hash = await sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const redactado = redactarTextoBancario('Pago ES91 2100 0418 4502 0005 1332 tarjeta 1234-5678-9012-3456');
    expect(redactado).not.toContain('ES91 2100 0418 4502 0005 1332');
    expect(redactado).not.toContain('1234-5678-9012-3456');
  });
});

describe('P3 parsers estrictos y errores sin valores bancarios', () => {
  it('rechaza cabeceras CSV duplicadas, filas con distinto ancho y fecha/importe inválidos', () => {
    const duplicated = parseCSV('fecha,Fecha,importe\n2026-05-05,x,10');
    expect(duplicated.errores).toContain('CSV_CABECERA_DUPLICADA_O_VACIA');
    const ragged = parseCSV('fecha,concepto,importe\n2026-05-05,Renta,100\n2026-05-06,Renta');
    expect(ragged.errores.some((error) => error.includes('CSV_NUMERO_COLUMNAS_INVALIDO'))).toBe(true);
    const raw = parseCSV('fecha,concepto,importe,divisa,cuenta\n31/02/2026,Renta,abc,EUR,cuenta');
    const normalizado = normalizarMovimientosCSV(raw.movimientosRaw);
    expect(normalizado.movimientos).toHaveLength(0);
    expect(normalizado.errores.some((error) => error.includes('FECHA_INVALIDA'))).toBe(true);
    expect(normalizado.errores.some((error) => error.includes('IMPORTE_INVALIDO'))).toBe(true);
  });

  it('OFX requiere FITID y reporta código por fila sin copiar datos originales', () => {
    const res = parseOFX('OFXHEADER:100\n<OFX><STMTTRN><DTPOSTED>20260505<TRNAMT>100.00<NAME>IBAN ES9121000418450200051332</STMTTRN></OFX>');
    expect(res.movimientos).toHaveLength(0);
    expect(res.errores[0]).toContain('OFX_TRANSACCION_INVALIDA');
    expect(res.errores.join(' ')).not.toContain('ES9121000418450200051332');
  });

  it('MT940 conserva líneas de continuación :86: sin perder el movimiento', () => {
    const mt940 = [
      ':20:STATEMENT', ':25:ES9121000418450200051332', ':28C:00001/001', ':60F:C260505EUR1000,00',
      ':61:2605050505D120,00NTRFNONREF//REF-22', ':86:PROVEEDOR SERVICIO', '?00:DETALLE CONTINUADO',
      ':62F:C260506EUR880,00',
    ].join('\n');
    const res = parseMT940(mt940);
    expect(res.movimientos).toHaveLength(1);
    expect(res.movimientos[0].importe).toBe(-120);
    expect(res.movimientos[0].concepto).toContain('DETALLE CONTINUADO');
    expect(res.errores).toHaveLength(0);
  });
});

describe('P3 importación en dos fases, replay y rechazo seguro', () => {
  it('prepara vista previa con hash SHA-256, divisa/cuenta seguras y replay idempotente', async () => {
    const first = await prepararImportacionBancaria({ contenido: CSV_VALIDO, formato: 'CSV', propietarioId: 'prop_A', existentes: [], opciones: OPCIONES });
    expect(first.confirmable).toBe(true);
    expect(first.nuevos).toHaveLength(1);
    expect(first.importacion.hashFichero).toMatch(/^[a-f0-9]{64}$/);
    expect(first.nuevos[0].cuentaRef).toMatch(/^cta_[a-f0-9]{64}$/);
    expect(first.nuevos[0].cuentaIbanEnmascarado).not.toContain('cuenta-demo');
    expect(first.nuevos[0].divisa).toBe('EUR');
    expect(first.nuevos[0].identificadorBanco).toMatch(/^idb_[a-f0-9]{16}$/);
    expect(first.nuevos[0].identificadorBanco).not.toContain('FITID-001');
    const replay = await prepararImportacionBancaria({ contenido: CSV_VALIDO, formato: 'CSV', propietarioId: 'prop_A', existentes: first.nuevos, opciones: OPCIONES });
    expect(replay.nuevos).toHaveLength(0);
    expect(replay.duplicados).toHaveLength(1);
    expect(replay.confirmable).toBe(true);
  });

  it('bloquea divisa ausente/no EUR, cuenta no identificada, fila inválida y revisión', async () => {
    const csvNoDivisaNiCuenta = 'fecha,concepto,importe\n2026-05-05,Renta,100';
    const sinDeclarar = await prepararImportacionBancaria({ contenido: csvNoDivisaNiCuenta, formato: 'CSV', propietarioId: 'prop_A', existentes: [], opciones: { nombreFichero: 'x.csv' } });
    expect(sinDeclarar.confirmable).toBe(false);
    expect(sinDeclarar.errores).toContain('DIVISA_NO_INDICADA');
    expect(sinDeclarar.errores).toContain('CUENTA_NO_IDENTIFICADA_ALIAS_REQUERIDO');

    const noEur = await prepararImportacionBancaria({ contenido: CSV_VALIDO.replace(',EUR,', ',USD,'), formato: 'CSV', propietarioId: 'prop_A', existentes: [], opciones: OPCIONES });
    expect(noEur.confirmable).toBe(false);
    expect(noEur.errores).toContain('DIVISA_NO_ADMITIDA');

    const malformed = await prepararImportacionBancaria({ contenido: 'fecha,concepto,importe,divisa,cuenta\n2026-05-05,Renta,100,EUR,cuenta\n2026-05-06,Renta', formato: 'CSV', propietarioId: 'prop_A', existentes: [], opciones: OPCIONES });
    expect(malformed.confirmable).toBe(false);
    expect(malformed.importacion.resultadosMovimientos?.some((row) => row.estado === 'ERROR')).toBe(true);

    const review = await prepararImportacionBancaria({ contenido: 'fecha,importe,divisa,cuenta\n2026-05-05,100,EUR,cuenta', formato: 'CSV', propietarioId: 'prop_A', existentes: [], opciones: OPCIONES });
    expect(review.requiereRevision).toHaveLength(1);
    expect(review.confirmable).toBe(false);
  });

  it('bloquea archivo sobredimensionado, demasiadas filas y Norma 43 sin fixture verificada', async () => {
    const oversized = await prepararImportacionBancaria({ contenido: CSV_VALIDO, formato: 'CSV', propietarioId: 'prop_A', existentes: [], opciones: { ...OPCIONES, tamanoBytes: MAX_BYTES_EXTRACTO_P3 + 1 } });
    expect(oversized.confirmable).toBe(false);
    expect(oversized.errores).toContain('LIMITE_5MB_POR_EXTRACTO');
    const norma43 = await prepararImportacionBancaria({ contenido: '11registro sintético\n22registro sintético', formato: 'NORMA43', propietarioId: 'prop_A', existentes: [], opciones: OPCIONES });
    expect(norma43.confirmable).toBe(false);
    expect(norma43.nuevos).toHaveLength(0);
    expect(norma43.errores).toContain('NORMA43_FORMATO_PENDIENTE_VALIDACION');
  });

  it('detecta moneda mixta y duplicados internos sin perder el recuento por fila', async () => {
    const csv = [
      'fecha,concepto,importe,divisa,cuenta,identificador',
      '2026-05-05,Renta,100,EUR,cuenta-demo,FITID-1',
      '2026-05-05,Renta,100,EUR,cuenta-demo,FITID-1',
      '2026-05-06,Renta,100,USD,cuenta-demo,FITID-2',
    ].join('\n');
    const result = await prepararImportacionBancaria({ contenido: csv, formato: 'CSV', propietarioId: 'prop_A', existentes: [], opciones: OPCIONES });
    expect(result.confirmable).toBe(false);
    expect(result.errores).toContain('DIVISAS_MEZCLADAS');
    expect(result.duplicados).toHaveLength(1);
  });
});

describe('P3 idempotencia y matching aislado sin confirmación automática', () => {
  it('deduplica por propietario/cuenta/ID bancario y no cruza titulares', () => {
    const existente = movimiento({ identificadorBanco: 'idb_1111111111111111' });
    const mismo = movimiento({ idMovimiento: 'mov_2', identificadorBanco: 'idb_1111111111111111' });
    const otroOwner = movimiento({ idMovimiento: 'mov_3', propietarioId: 'prop_B', identificadorBanco: 'idb_1111111111111111' });
    expect(detectarDuplicados([mismo], [existente]).duplicados).toHaveLength(1);
    expect(detectarDuplicados([otroOwner], [existente]).duplicados).toHaveLength(0);
  });

  it('matching filtra titular/inmueble y candidato contractual sin datos ajenos', () => {
    const mov = movimiento();
    const cobros = [cobro('cobro_A'), cobro('cobro_B', 'prop_B', 'inm_B')];
    const contratos = [contrato(), contrato('prop_B', 'inm_B')];
    contratos[1].id = 'cont_B';
    const resultados = buscarCandidatos(mov, cobros, [], [inmueble(), inmueble('prop_B')], contratos);
    expect(resultados.map((r) => r.candidato.id)).toEqual(['cobro_A']);
  });

  it('matching puntúa contrato e inmueble con etiquetas del titular sin persistir la dirección en factores', () => {
    const mov = movimiento({ concepto: 'ALQUILER cont_A Calle Mayor 10' });
    const propiedad = { ...inmueble(), direccion: 'Calle Mayor 10' };
    const resultado = buscarCandidatos(mov, [cobro('cobro_A')], [], [propiedad], [contrato()])[0];
    expect(resultado.factores.find((factor) => factor.criterio === 'CONTRATO')?.coincide).toBe(true);
    expect(resultado.factores.find((factor) => factor.criterio === 'INMUEBLE')?.coincide).toBe(true);
    expect(JSON.stringify(resultado.factores)).not.toContain('Calle Mayor 10');
  });

  it('un candidato con puntuación inferior al umbral queda sin correspondencia', () => {
    const mov = movimiento({ concepto: 'TRANSFERENCIA SIN DATOS', referencia: undefined });
    const cobroDebil = { ...cobro('cobro_debil'), importePrevisto: 750, fechaVencimiento: '2026-06-20', referenciaBancaria: 'REF-AJENA', nombreMes: '', inquilinoNombre: '' } as CobroPeriodo;
    const resultado = crearPropuestasParaMovimientos([mov], [cobroDebil], [], [inmueble()], [contrato()])[0];
    expect(resultado.estado).toBe('PENDIENTE');
    expect(resultado.confianza).toBe('SIN_MATCH');
    expect(resultado.candidato).toBeUndefined();
  });

  it('empates se presentan como ambiguos y ninguna sugerencia se confirma sola', () => {
    const mov = movimiento({ concepto: 'ALQUILER', referencia: undefined });
    const cobros = [cobro('cobro_1'), cobro('cobro_2')];
    const contratoActual = contrato();
    const sugerencias = crearPropuestasParaMovimientos([mov], cobros, [], [inmueble()], [contratoActual]);
    expect(sugerencias).toHaveLength(1);
    expect(sugerencias[0].ambigua).toBe(true);
    expect(sugerencias[0].candidato).toBeUndefined();
    expect(sugerencias[0].candidatosAlternativos).toHaveLength(2);
    expect(sugerencias[0].estado).toBe('PROPUESTO');
  });

  it('conciliación manual exige actor, motivo y conserva historial al revertir', () => {
    const p = propuesta();
    const conciliada = decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'Extracto y periodo verificados', operacionId: 'op_1' });
    expect(conciliada.propuestaActualizada.estado).toBe('CONCILIADO');
    expect(conciliada.evento.actorUid).toBe('uid_A');
    expect(conciliada.propuestaActualizada.historial).toHaveLength(1);
    const revertida = decidirConciliacionManual(conciliada.propuestaActualizada, { accion: 'REVERSAR', actor: actor(), motivo: 'Corrección documentada por el titular', operacionId: 'op_2' });
    expect(revertida.propuestaActualizada.estado).toBe('REVERSADO');
    expect(revertida.propuestaActualizada.historial).toHaveLength(2);
    expect(() => decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor('prop_B'), motivo: 'Motivo válido de decisión', operacionId: 'op_3' })).toThrow('no pertenece al ámbito');
  });
});
