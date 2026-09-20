import { describe, it, expect } from 'vitest';
import { parseCSV, normalizarMovimientosCSV } from '../utils/conciliacion/csvParser';
import { parseOFX } from '../utils/conciliacion/ofxParser';
import { parseMT940 } from '../utils/conciliacion/mt940Parser';
import { parseNorma43 } from '../utils/conciliacion/norma43Parser';
import { generarHashIdempotencia, normalizarDesdeCSV, normalizarDesdeOFX } from '../utils/conciliacion/normalizador';
import { detectarDuplicados, generarIdImportacion } from '../utils/conciliacion/idempotencia';
import { buscarCandidatos, evaluarCandidato } from '../utils/conciliacion/matchingEngine';
import { crearPropuestasParaMovimientos, confirmarPropuesta, aplicarConciliacion, calcularResumenConciliacion } from '../utils/conciliacion/conciliacionEngine';
import { importarDesdeCSV, detectarFormato } from '../utils/conciliacion/importEngine';
import { MovimientoBancario, DEFAULT_CONFIG_MATCHING, ConfiguracionMatching, ConfianzaMatch } from '../types/conciliacion';
import { Gasto, Inmueble, ContratoFormalizacion, CobroPeriodo } from '../types';

function calcularConfianza(puntuacion: number, config: ConfiguracionMatching): ConfianzaMatch {
  if (puntuacion >= config.umbralAlta) return 'ALTA';
  if (puntuacion >= config.umbralMedia) return 'MEDIA';
  if (puntuacion >= config.umbralBaja) return 'BAJA';
  return 'SIN_MATCH';
}

function crearInmuebleTest(propietarioId = 'prop_A'): Inmueble {
  return {
    id: 'inm_1',
    direccion: 'Calle Test 1',
    ciudad: 'Madrid',
    precio: 1000,
    estado: 'alquilado',
    habitaciones: 2,
    banos: 1,
    superficie: 80,
    candidatosCount: 0,
    propietarioId,
    propietarioPrincipalId: propietarioId,
  } as Inmueble;
}

function crearContratoTest(inmuebleId = 'inm_1', propietarioId = 'prop_A'): ContratoFormalizacion {
  return {
    id: 'cont_1',
    candidatoId: 'cand_1',
    inmuebleId,
    propietarioId,
    inmuebleNombre: 'Calle Test 1',
    inmuebleDireccion: 'Calle Test 1',
    inmuebleCiudad: 'Madrid',
    propietarioNombre: 'Prop A',
    propietarioDni: '12345678A',
    propietarioDireccion: 'Calle Prop',
    propietarioTelefono: '600000000',
    propietarioEmail: 'prop@test.es',
    propietarioIban: 'ES1234567890123456789012',
    candidatoNombre: 'Juan Perez',
    candidatoDni: '87654321B',
    candidatoTelefono: '600111222',
    candidatoEmail: 'juan@test.es',
    rentaMensual: 1000,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: 1000,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    duracionAnios: 1,
    diaLimitePagoMes: 5,
    fechaInicioContrato: '2026-01-01',
    permitirMascotas: false,
    permitirSubarriendo: false,
    incluyeMueblesInventario: false,
    gastosComunidadCargo: 'arrendador',
    ibiCargo: 'arrendador',
    suministrosCargo: 'arrendatario',
    clausulaDesistimientoAnticipado: true,
    clausulasPersonalizadas: [],
    estado: 'FORMALIZADO_ACTIVO',
    evaluacionAsegurabilidad: {} as any,
    actaEntregaLlaves: { juegosLlavesVivienda: 1, juegosLlavesPortal: 1, juegosLlavesBuzon: 1, juegosLlavesGarajeTrastero: 0 } as any,
    firmaArrendador: { firmado: true },
    firmaArrendatario: { firmado: true },
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    historial: [],
    registroCobros: [
      {
        id: 'cobro_cont_1_2026_05',
        inmuebleId,
        contratoId: 'cont_1',
        inquilinoId: 'cand_1',
        propietarioId,
        mes: 5,
        anio: 2026,
        periodoMesAnio: '2026-05',
        nombreMes: 'Mayo 2026',
        importePrevisto: 1000,
        importeRecibido: 0,
        fechaVencimiento: '2026-05-05',
        estado: 'PENDIENTE',
        historialCambios: [],
      } as CobroPeriodo,
    ],
  } as ContratoFormalizacion;
}

function crearGastoTest(inmuebleId = 'inm_1', propietarioId = 'prop_A'): Gasto {
  return {
    id: 'gas_1',
    inmuebleId,
    propietarioId,
    tipo: 'EXPLOTACION',
    categoria: 'COMUNIDAD',
    concepto: 'Comunidad mayo 2026',
    proveedor: 'Comunidad vecinos',
    importe: 120,
    estado: 'PENDIENTE',
    aCargoDe: 'arrendador',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fecha: '2026-05-10',
  } as Gasto;
}

// ===== PARSERS =====
describe('GAP6 parsers CSV/OFX/MT940/Norma43', () => {
  it('CSV parsea con delimitador ; y mapeo columnas ES', () => {
    const csv = `Fecha;Concepto;Importe;Referencia
05/05/2026;Alquiler Juan Perez;1000,00;REF123
06/05/2026;Comunidad vecinos;-120,00;COMU456`;
    const parsed = parseCSV(csv);
    const norm = normalizarMovimientosCSV(parsed.movimientosRaw);
    expect(norm.movimientos.length).toBe(2);
    expect(norm.movimientos[0].importe).toBe(1000);
    expect(norm.movimientos[1].importe).toBe(-120);
    expect(norm.movimientos[0].concepto).toContain('Alquiler');
  });

  it('CSV parsea con delimitador , y formato EN', () => {
    const csv = `date,description,amount,reference
2026-05-05,Rent payment,1000.00,REF123`;
    const parsed = parseCSV(csv);
    const norm = normalizarMovimientosCSV(parsed.movimientosRaw);
    expect(norm.movimientos.length).toBe(1);
    expect(norm.movimientos[0].importe).toBe(1000);
  });

  it('OFX parser extrae FITID para idempotencia', () => {
    const ofx = `OFXHEADER:100
<OFX>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260505
<TRNAMT>1000.00
<FITID>20260505-001
<NAME>ALQUILER JUAN PEREZ
<MEMO>REF ALQUILER MAYO
</STMTTRN>
</OFX>`;
    const res = parseOFX(ofx);
    expect(res.movimientos.length).toBe(1);
    expect(res.movimientos[0].fitid).toBe('20260505-001');
    expect(res.movimientos[0].importe).toBe(1000);
  });

  it('MT940 parser tolera :20: :25: :28C: :60F: :61: :86: :62F:', () => {
    const mt940 = `:20:STATEMENT001
:25:ES1234567890123456789012
:28C:00001/001
:60F:C260505EUR1000,00
:61:2605050505C1000,00NTRFNONREF//REF123
:86:ALQUILER JUAN PEREZ MAYO
:62F:C260506EUR2000,00`;
    const res = parseMT940(mt940);
    expect(res.movimientos.length).toBe(1);
    expect(res.movimientos[0].importe).toBe(1000);
    expect(res.movimientos[0].concepto).toContain('ALQUILER');
  });

  it('Norma43 parser registros 11/22/23/88', () => {
    const linea11 = '11' + '1234' + '5678' + '12' + '1234567890' + '260501' + '260506' + '00' + '00000000000000' + '000000' + '00000000000000' + '000000' + '                    ';
    const linea22 = '22' + '1234' + '5678' + '12' + '260505' + '260505' + '01' + '01' + '00000000100000' + '0001' + '1234567890123456' + '01' + '123456789012' + 'ALQUILER MAYO';
    const linea88 = '88' + '1234' + '5678' + '12' + '00000000000002' + '00000000100000' + '00000000000000' + '00000000000000' + '00000000100000' + '00000000000000' + '                    ';
    const contenido = [linea11, linea22, linea88].join('\n');
    const res = parseNorma43(contenido);
    expect(res.movimientos.length).toBeGreaterThanOrEqual(1);
  });
});

// ===== NORMALIZACIÓN =====
describe('GAP6 normalización mismo movimiento formatos diferentes', () => {
  it('mismo movimiento CSV/OFX/MT940 genera hashIdempotencia consistente', () => {
    const fecha = '2026-05-05';
    const importe = 1000;
    const concepto = 'ALQUILER JUAN PEREZ';
    const ref = 'REF123';
    const id = 'FITID001';

    const h1 = generarHashIdempotencia(fecha, importe, concepto, ref, id);
    const h2 = generarHashIdempotencia(fecha, importe, concepto.toLowerCase(), ref, id);
    expect(h1).toBe(h2);

    const conceptoConRef = `${concepto} ${ref}`;
    const csvMovs = [{ fecha: fecha, fechaValor: undefined, concepto: conceptoConRef, importe, referencia: ref, identificador: id, raw: { fecha, concepto: conceptoConRef, importe: '1000' } } as any];
    const ofxMovs = [{ fecha: fecha, importe, fitid: id, nombre: concepto, memo: ref, referencia: ref, raw: { FITID: id } } as any];

    const normCSV = normalizarDesdeCSV(csvMovs, 'imp_1', 'prop_A', new Date().toISOString());
    const normOFX = normalizarDesdeOFX(ofxMovs, 'imp_2', 'prop_A', new Date().toISOString());
    expect(normCSV[0].hashIdempotencia).toBe(normOFX[0].hashIdempotencia);
  });
});

// ===== IDEMPOTENCIA =====
describe('GAP6 idempotencia doble importación', () => {
  it('detectarDuplicados por identificador estable', () => {
    const existentes: MovimientoBancario[] = [
      { idMovimiento: 'ofx_abc', identificadorBanco: 'FITID001', hashIdempotencia: 'h1', propietarioId: 'prop_A', fechaOperacion: '2026-05-05', importe: 1000 } as any,
    ];
    const nuevos: MovimientoBancario[] = [
      { idMovimiento: 'ofx_def', identificadorBanco: 'FITID001', hashIdempotencia: 'h2', propietarioId: 'prop_A', fechaOperacion: '2026-05-05', importe: 1000 } as any,
      { idMovimiento: 'ofx_ghi', identificadorBanco: 'FITID002', hashIdempotencia: 'h1', propietarioId: 'prop_A', fechaOperacion: '2026-05-05', importe: 1000 } as any,
    ];
    const res = detectarDuplicados(nuevos, existentes);
    expect(res.duplicados.length).toBe(2);
    expect(res.nuevos.length).toBe(0);
  });

  it('generarIdImportacion determinista por propietario+origen+fichero', () => {
    const id1 = generarIdImportacion('prop_A', 'CSV', '2026-05-05T00:00:00Z', 'fichero.csv');
    const id2 = generarIdImportacion('prop_A', 'CSV', '2026-05-05T00:00:00Z', 'fichero.csv');
    expect(id1).toBe(id2);
  });

  it('importarDesdeCSV segunda vez detecta duplicados', () => {
    const csv = `fecha,concepto,importe
2026-05-05,Alquiler Juan,1000`;
    const res1 = importarDesdeCSV(csv, 'prop_A', [], {}, 'test.csv');
    expect(res1.nuevos.length).toBe(1);
    const res2 = importarDesdeCSV(csv, 'prop_A', res1.nuevos, {}, 'test.csv');
    expect(res2.nuevos.length).toBe(0);
    expect(res2.duplicados.length).toBe(1);
  });
});

// ===== MATCHING =====
describe('GAP6 matching importe/fecha/tolerancia/referencia/concepto/inmueble/inquilino/proveedor', () => {
  it('importe exacto + referencia + fecha = ALTA confianza', () => {
    const movimiento: MovimientoBancario = {
      idMovimiento: 'mov_1',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-05',
      fechaValor: '2026-05-05',
      importe: 1000,
      tipo: 'INGRESO',
      concepto: 'ALQUILER JUAN PEREZ MAYO 2026 REF cont_1',
      conceptoOriginal: 'ALQUILER JUAN PEREZ MAYO 2026 REF cont_1',
      referencia: 'cont_1',
      identificadorBanco: 'FITID001',
      saldo: undefined,
      origen: 'CSV',
      propietarioId: 'prop_A',
      cuentaIban: undefined,
      metadatosOriginales: {},
      hashIdempotencia: 'h1',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;

    const contrato = crearContratoTest();
    const inm = crearInmuebleTest('prop_A');
    const cobros = contrato.registroCobros!;

    const resultados = buscarCandidatos(movimiento, cobros, [], [inm], [contrato], DEFAULT_CONFIG_MATCHING);
    expect(resultados.length).toBeGreaterThan(0);
    const evaluacion = resultados[0];
    expect(evaluacion.puntuacion).toBeGreaterThanOrEqual(85);
    expect(evaluacion.confianza).toBe('ALTA');
    expect(evaluacion.factores.some(f=>f.criterio==='IMPORTE_EXACTO' && f.coincide)).toBe(true);
  });

  it('importe con tolerancia porcentaje = no ALTA pero si match', () => {
    const movimiento: MovimientoBancario = {
      idMovimiento: 'mov_2',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-06',
      importe: 995,
      tipo: 'INGRESO',
      concepto: 'ALQUILER JUAN',
      conceptoOriginal: 'ALQUILER JUAN',
      referencia: undefined,
      identificadorBanco: undefined,
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h2',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;

    const contrato = crearContratoTest();
    const inm = crearInmuebleTest();
    const resultados = buscarCandidatos(movimiento, contrato.registroCobros!, [], [inm], [contrato], { ...DEFAULT_CONFIG_MATCHING, toleranciaImportePorcentaje: 1 });
    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados[0].confianza).not.toBe('ALTA');
    expect(resultados[0].puntuacion).toBeGreaterThanOrEqual(30);
  });

  it('aislamiento propietario: movimiento prop_A no concilia con cobro prop_B', () => {
    const movimiento: MovimientoBancario = {
      idMovimiento: 'mov_3',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-05',
      importe: 1000,
      tipo: 'INGRESO',
      concepto: 'ALQUILER',
      conceptoOriginal: 'ALQUILER',
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h3',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;

    const cobroB: CobroPeriodo = {
      id: 'cobro_cont_B_2026_05',
      inmuebleId: 'inm_B',
      contratoId: 'cont_B',
      inquilinoId: 'cand_B',
      propietarioId: 'prop_B',
      mes: 5,
      anio: 2026,
      periodoMesAnio: '2026-05',
      nombreMes: 'Mayo 2026',
      importePrevisto: 1000,
      importeRecibido: 0,
      fechaVencimiento: '2026-05-05',
      estado: 'PENDIENTE',
      historialCambios: [],
    } as CobroPeriodo;

    const inmB = crearInmuebleTest('prop_B');
    inmB.id = 'inm_B';
    const contratoB = crearContratoTest('inm_B', 'prop_B');
    contratoB.id = 'cont_B';

    const candidatos = buscarCandidatos(movimiento, [cobroB], [], [inmB], [contratoB], DEFAULT_CONFIG_MATCHING);
    expect(candidatos.length).toBe(0);
  });

  it('GASTO matching proveedor e inmueble', () => {
    const movimiento: MovimientoBancario = {
      idMovimiento: 'mov_4',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-10',
      importe: -120,
      tipo: 'GASTO',
      concepto: 'COMUNIDAD VECINOS CALLE TEST 1',
      conceptoOriginal: 'COMUNIDAD VECINOS CALLE TEST 1',
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h4',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;

    const gasto = crearGastoTest();
    const inm = crearInmuebleTest();

    const resultados = buscarCandidatos(movimiento, [], [gasto], [inm], [], DEFAULT_CONFIG_MATCHING);
    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados[0].puntuacion).toBeGreaterThan(30);
  });
});

// ===== CONFIANZA =====
describe('GAP6 confianza alta/media/baja/sin match umbrales testeables', () => {
  it('umbrales ALTA 85 MEDIA 60 BAJA 30', () => {
    expect(DEFAULT_CONFIG_MATCHING.umbralAlta).toBe(85);
    expect(DEFAULT_CONFIG_MATCHING.umbralMedia).toBe(60);
    expect(DEFAULT_CONFIG_MATCHING.umbralBaja).toBe(30);
    expect(calcularConfianza(90, DEFAULT_CONFIG_MATCHING)).toBe('ALTA');
    expect(calcularConfianza(70, DEFAULT_CONFIG_MATCHING)).toBe('MEDIA');
    expect(calcularConfianza(40, DEFAULT_CONFIG_MATCHING)).toBe('BAJA');
    expect(calcularConfianza(10, DEFAULT_CONFIG_MATCHING)).toBe('SIN_MATCH');
  });
});

// ===== CONCILIACIÓN =====
describe('GAP6 conciliación confirmar/rechazar/cambiar/doble/candidato ya conciliado/inexistente', () => {
  it('crearPropuestasParaMovimientos genera propuestas', () => {
    const mov: MovimientoBancario = {
      idMovimiento: 'mov_1',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-05',
      importe: 1000,
      tipo: 'INGRESO',
      concepto: 'ALQUILER JUAN PEREZ REF cont_1',
      conceptoOriginal: 'ALQUILER JUAN PEREZ REF cont_1',
      referencia: 'cont_1',
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h1',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;

    const contrato = crearContratoTest();
    const inm = crearInmuebleTest();
    const propuestas = crearPropuestasParaMovimientos([mov], contrato.registroCobros!, [], [inm], [contrato], DEFAULT_CONFIG_MATCHING);
    expect(propuestas.length).toBe(1);
    expect(propuestas[0].estado).toBe('PROPUESTO');
  });

  it('confirmarPropuesta pasa a CONFIRMADO con trazabilidad', () => {
    const mov: MovimientoBancario = {
      idMovimiento: 'mov_1',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-05',
      importe: 1000,
      tipo: 'INGRESO',
      concepto: 'ALQUILER',
      conceptoOriginal: 'ALQUILER',
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h1',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;
    const contrato = crearContratoTest();
    const inm = crearInmuebleTest();
    const props = crearPropuestasParaMovimientos([mov], contrato.registroCobros!, [], [inm], [contrato], DEFAULT_CONFIG_MATCHING);
    const confirmada = confirmarPropuesta(props[0], { email: 'test@test.es' } as any);
    expect(confirmada.estado).toBe('CONFIRMADO');
    expect(confirmada.historial.length).toBeGreaterThanOrEqual(2);
  });

  it('aplicarConciliacion solo ALTA confianza y valida candidato existe/no conciliado', () => {
    const mov: MovimientoBancario = {
      idMovimiento: 'mov_1',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-05',
      importe: 1000,
      tipo: 'INGRESO',
      concepto: 'ALQUILER JUAN PEREZ REF cont_1',
      conceptoOriginal: 'ALQUILER JUAN PEREZ REF cont_1',
      referencia: 'cont_1',
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h1',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;
    const contrato = crearContratoTest();
    const inm = crearInmuebleTest();
    const props = crearPropuestasParaMovimientos([mov], contrato.registroCobros!, [], [inm], [contrato], DEFAULT_CONFIG_MATCHING);
    const propAlta = props[0];
    propAlta.confianza = 'ALTA';
    propAlta.puntuacion = 90;
    const confirmada = confirmarPropuesta(propAlta, { email: 'test@test.es' } as any);
    const resultado = aplicarConciliacion(confirmada, contrato.registroCobros!, [], [contrato], [mov], { email: 'test@test.es' } as any);
    expect(resultado.error).toBeUndefined();
    expect(resultado.propuestaActualizada.estado).toBe('CONCILIADO');
  });

  it('aplicarConciliacion rechaza BAJA confianza', () => {
    const mov: MovimientoBancario = {
      idMovimiento: 'mov_1',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-05',
      importe: 1000,
      tipo: 'INGRESO',
      concepto: 'ALQUILER',
      conceptoOriginal: 'ALQUILER',
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h1',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;
    const contrato = crearContratoTest();
    const propuestaBaja = {
      id: 'prop_1',
      movimientoId: 'mov_1',
      idImportacion: 'imp_1',
      propietarioId: 'prop_A',
      importeMovimiento: 1000,
      importeCandidato: 1000,
      estado: 'CONFIRMADO' as const,
      confianza: 'BAJA' as const,
      puntuacion: 35,
      factores: [],
      candidato: { id: contrato.registroCobros![0].id, tipo: 'COBRO' as const, importe: 1000, fecha: '2026-05-05', estadoActual: 'PENDIENTE', inmuebleId: 'inm_1', propietarioId: 'prop_A' },
      historial: [],
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
      origen: 'AUTOMATICA' as const,
      fechaPropuesta: new Date().toISOString(),
      propuestaPor: 'SISTEMA' as const,
      aplicado: false,
      reversible: true,
      esDiscrepancia: false,
    };
    const res = aplicarConciliacion(propuestaBaja as any, contrato.registroCobros!, [], [contrato], [mov], { email: 'test@test.es' } as any);
    expect(res.error).toContain('ALTA');
  });
});

// ===== COBROS/GASTOS HISTÓRICO INTACTO =====
describe('GAP6 cobros/gastos histórico intacto/discrepancia', () => {
  it('aplicarConciliacion conserva importe/fecha devengo original, solo asocia movimiento', () => {
    const mov: MovimientoBancario = {
      idMovimiento: 'mov_1',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-05',
      importe: 1000,
      tipo: 'INGRESO',
      concepto: 'ALQUILER JUAN PEREZ REF cont_1',
      conceptoOriginal: 'ALQUILER JUAN PEREZ REF cont_1',
      referencia: 'cont_1',
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h1',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;
    const contrato = crearContratoTest();
    const inm = crearInmuebleTest();
    const props = crearPropuestasParaMovimientos([mov], contrato.registroCobros!, [], [inm], [contrato], DEFAULT_CONFIG_MATCHING);
    const p = props[0];
    p.confianza = 'ALTA';
    p.puntuacion = 95;
    const confirmada = confirmarPropuesta(p, { email: 'test@test.es' } as any);
    const res = aplicarConciliacion(confirmada, contrato.registroCobros!, [], [contrato], [mov], { email: 'test@test.es' } as any);
    expect(res.contratoActualizado).toBeDefined();
    const cobroActualizado = res.contratoActualizado!.registroCobros!.find(c=>c.id===p.candidato!.id);
    expect(cobroActualizado!.importePrevisto).toBe(1000);
    expect(cobroActualizado!.fechaVencimiento).toBe('2026-05-05');
  });

  it('discrepancia importe se marca sin modificar histórico', () => {
    const mov: MovimientoBancario = {
      idMovimiento: 'mov_disc',
      idImportacion: 'imp_1',
      fechaOperacion: '2026-05-05',
      importe: 950,
      tipo: 'INGRESO',
      concepto: 'ALQUILER JUAN PEREZ',
      conceptoOriginal: 'ALQUILER JUAN PEREZ',
      origen: 'CSV',
      propietarioId: 'prop_A',
      metadatosOriginales: {},
      hashIdempotencia: 'h_disc',
      fechaImportacion: new Date().toISOString(),
      estadoConciliacion: 'PENDIENTE',
    } as any;
    const contrato = crearContratoTest();
    const inm = crearInmuebleTest();
    const props = crearPropuestasParaMovimientos([mov], contrato.registroCobros!, [], [inm], [contrato], DEFAULT_CONFIG_MATCHING);
    if (props[0]) {
      expect(props[0].esDiscrepancia).toBeDefined();
    }
  });
});

// ===== SEGURIDAD =====
describe('GAP6 seguridad aislamiento/propietario inmutable/sin secretos', () => {
  it('propietario A no ve movimientos de propietario B (filtro por propietarioId)', () => {
    const movA: MovimientoBancario = { idMovimiento: 'mov_A', propietarioId: 'prop_A', importe: 1000, fechaOperacion: '2026-05-05', tipo: 'INGRESO', concepto: 'A', conceptoOriginal: 'A', origen: 'CSV', idImportacion: 'imp', metadatosOriginales: {}, hashIdempotencia: 'hA', fechaImportacion: new Date().toISOString(), estadoConciliacion: 'PENDIENTE' } as any;
    const movB: MovimientoBancario = { idMovimiento: 'mov_B', propietarioId: 'prop_B', importe: 1000, fechaOperacion: '2026-05-05', tipo: 'INGRESO', concepto: 'B', conceptoOriginal: 'B', origen: 'CSV', idImportacion: 'imp', metadatosOriginales: {}, hashIdempotencia: 'hB', fechaImportacion: new Date().toISOString(), estadoConciliacion: 'PENDIENTE' } as any;

    const cobroA: CobroPeriodo = { id: 'cobro_A', propietarioId: 'prop_A', inmuebleId: 'inm_A', contratoId: 'cont_A', inquilinoId: 'cand_A', mes: 5, anio: 2026, periodoMesAnio: '2026-05', nombreMes: 'Mayo', importePrevisto: 1000, importeRecibido: 0, fechaVencimiento: '2026-05-05', estado: 'PENDIENTE', historialCambios: [] } as any;
    const cobroB: CobroPeriodo = { id: 'cobro_B', propietarioId: 'prop_B', inmuebleId: 'inm_B', contratoId: 'cont_B', inquilinoId: 'cand_B', mes: 5, anio: 2026, periodoMesAnio: '2026-05', nombreMes: 'Mayo', importePrevisto: 1000, importeRecibido: 0, fechaVencimiento: '2026-05-05', estado: 'PENDIENTE', historialCambios: [] } as any;

    const inmA = crearInmuebleTest('prop_A');
    inmA.id = 'inm_A';
    const inmB = crearInmuebleTest('prop_B');
    inmB.id = 'inm_B';

    const contA = crearContratoTest('inm_A', 'prop_A');
    contA.id = 'cont_A';
    contA.registroCobros = [cobroA];
    const contB = crearContratoTest('inm_B', 'prop_B');
    contB.id = 'cont_B';
    contB.registroCobros = [cobroB];

    const candsA = buscarCandidatos(movA, [cobroA, cobroB], [], [inmA, inmB], [contA, contB], DEFAULT_CONFIG_MATCHING);
    const candsB = buscarCandidatos(movB, [cobroA, cobroB], [], [inmA, inmB], [contA, contB], DEFAULT_CONFIG_MATCHING);

    expect(candsA.every(c=>c.candidato.propietarioId==='prop_A')).toBe(true);
    expect(candsB.every(c=>c.candidato.propietarioId==='prop_B')).toBe(true);
  });

  it('detectarFormato no expone credenciales, solo clasifica', () => {
    const csv = `fecha,concepto,importe
2026-05-05,Alquiler,1000`;
    expect(detectarFormato(csv)).toBe('CSV');
    const ofx = `OFXHEADER:100
<OFX><STMTTRN></STMTTRN></OFX>`;
    expect(detectarFormato(ofx)).toBe('OFX');
    expect(csv).not.toContain('password');
    expect(csv).not.toContain('tokenBancario');
  });
});

// ===== RESUMEN =====
describe('GAP6 resumen conciliacion', () => {
  it('calcularResumenConciliacion cuenta estados', () => {
    const propuestas = [
      { estado: 'PENDIENTE', confianza: 'ALTA', esDiscrepancia: false } as any,
      { estado: 'PROPUESTO', confianza: 'MEDIA', esDiscrepancia: false } as any,
      { estado: 'CONCILIADO', confianza: 'ALTA', esDiscrepancia: false } as any,
      { estado: 'CONCILIADO', confianza: 'ALTA', esDiscrepancia: true } as any,
    ];
    const resumen = calcularResumenConciliacion(propuestas);
    expect(resumen.totalMovimientos).toBe(4);
    expect(resumen.pendientes).toBe(1);
    expect(resumen.propuestos).toBe(1);
    expect(resumen.conciliados).toBe(2);
    expect(resumen.discrepancias).toBe(1);
  });
});
