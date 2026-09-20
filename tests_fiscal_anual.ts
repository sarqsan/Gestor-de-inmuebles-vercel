/**
 * ARENA D - TESTS FISCAL ANUAL REAL
 * 15 casos mínimos obligatorios:
 * 1 inmueble sin datos, 2 ingresos ejercicio, 3 gastos ejercicio, 4 resultado neto, 5 deducible/no deducible,
 * 6 dos inquilinos mismo ejercicio, 7 sucesión contratos sin sobrescribir, 8 meses impagados,
 * 9 pago parcial, 10 justificante vinculado, 11 gasto vinculado OT, 12 sin actividad,
 * 13 aislamiento propietario A/B, 14 histórico 2024/2025/2026, 15 cambio ejercicio sin contaminación
 */

import {
  generarResumenFiscalAnual,
  generarHistoricoFiscalInmueble,
  calcularIngresosEjercicio,
  calcularGastosEjercicio,
  esGastoDeducible,
  calcularPeriodosSinAlquiler,
  canAccessResumenFiscal,
} from './src/utils/fiscalEngine';
import { ContratoFormalizacion, Gasto, Inmueble, UsuarioApp, CobroPeriodo } from './src/types';

// Helpers
function makeInmueble(id: string, propietarioId: string, direccion = 'Calle Test 1'): Inmueble {
  return {
    id,
    direccion,
    ciudad: 'Madrid',
    precio: 1000,
    estado: 'alquilado',
    habitaciones: 2,
    banos: 1,
    superficie: 80,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId,
    propietarioPrincipalId: propietarioId,
  } as any;
}

function makeContrato(id: string, inmuebleId: string, propietarioId: string, candidatoId: string, nombre: string, inicio: string, fin: string | undefined, renta: number, registroCobros: CobroPeriodo[]): ContratoFormalizacion {
  return {
    id,
    inmuebleId,
    propietarioId,
    candidatoId,
    inmuebleNombre: 'Test',
    inmuebleDireccion: 'Calle Test 1',
    inmuebleCiudad: 'Madrid',
    propietarioNombre: 'Propietario',
    propietarioDni: '12345678A',
    propietarioDireccion: 'Calle',
    propietarioTelefono: '600',
    propietarioEmail: 'a@a.com',
    propietarioIban: 'ES00',
    candidatoNombre: nombre,
    candidatoDni: '87654321B',
    candidatoTelefono: '600',
    candidatoEmail: 'b@b.com',
    rentaMensual: renta,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: renta,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    fechaInicioContrato: inicio,
    fechaFinContrato: fin,
    esVigente: !fin,
    duracionAnios: 1,
    diaLimitePagoMes: 5,
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
    actaEntregaLlaves: { fechaEntrega: inicio, juegosLlavesVivienda: 1, juegosLlavesPortal: 1, juegosLlavesBuzon: 1, juegosLlavesGarajeTrastero: 0 } as any,
    firmaArrendador: { firmado: true },
    firmaArrendatario: { firmado: true },
    fechaCreacion: inicio,
    fechaActualizacion: inicio,
    historial: [],
    registroCobros,
  };
}

function makeCobro(id: string, contratoId: string, inmuebleId: string, propietarioId: string, inquilinoId: string, anio: number, mes: number, previsto: number, recibido: number, estado: any, justificante?: any): CobroPeriodo {
  const nombreMes = `${mes}/${anio}`;
  return {
    id,
    inmuebleId,
    contratoId,
    inquilinoId,
    propietarioId,
    inmuebleDireccion: 'Calle Test 1',
    inquilinoNombre: 'Inquilino ' + inquilinoId,
    mes,
    anio,
    periodoMesAnio: `${anio}-${String(mes).padStart(2, '0')}`,
    nombreMes,
    importePrevisto: previsto,
    importeRecibido: recibido,
    fechaVencimiento: `${anio}-${String(mes).padStart(2, '0')}-05`,
    fechaPago: recibido > 0 ? `${anio}-${String(mes).padStart(2, '0')}-03` : undefined,
    estado,
    justificante,
    historialCambios: [],
  };
}

function makeGasto(id: string, inmuebleId: string, propietarioId: string, fecha: string, importe: number, categoria: any, esDeducible?: boolean, trabajoId?: string): Gasto {
  return {
    id,
    inmuebleId,
    propietarioId,
    tipo: 'EXPLOTACION',
    aCargoDe: 'arrendador',
    fecha,
    concepto: `Gasto ${id}`,
    categoria,
    importe,
    estado: 'PAGADO',
    createdAt: fecha,
    updatedAt: fecha,
    trabajoId,
    esDeducible,
  };
}

// Setup
const propietarioA = 'prop_A';
const propietarioB = 'prop_B';
const inmueble1 = makeInmueble('inm_1', propietarioA, 'Calle A 1');
const inmueble2 = makeInmueble('inm_2', propietarioB, 'Calle B 2');

const userA: UsuarioApp = {
  id: 'userA',
  nombre: 'Prop A',
  email: 'a@test.com',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId: propietarioA,
  inmuebleIds: ['inm_1'],
  createdAt: '',
  updatedAt: '',
} as any;

const userB: UsuarioApp = {
  id: 'userB',
  nombre: 'Prop B',
  email: 'b@test.com',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId: propietarioB,
  inmuebleIds: ['inm_2'],
  createdAt: '',
  updatedAt: '',
} as any;

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`✅ ${msg}`);
  } else {
    failed++;
    console.error(`❌ FAIL: ${msg}`);
  }
}

console.log('=== TESTS FISCAL ANUAL ARENA D - 15 grupos ===\n');

// 1. Inmueble sin datos (ingresos 0 gastos 0 neto 0)
{
  const resumen = generarResumenFiscalAnual('inm_1', 2025, [inmueble1], [], [], userA);
  assert(resumen !== null, '1. Resumen generado aunque sin datos');
  assert(resumen!.ingresos.totalCobrado === 0, '1. Ingresos cobrados 0 sin datos');
  assert(resumen!.gastos.total === 0, '1. Gastos 0 sin datos');
  assert(resumen!.resultadoNetoOperativo === 0, '1. Resultado neto 0 sin datos');
}

// 2. Ingresos ejercicio
{
  const cobros = [
    makeCobro('c1', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 1, 1000, 1000, 'PAGADO'),
    makeCobro('c2', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 2, 1000, 1000, 'PAGADO'),
    makeCobro('c3', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 3, 1000, 0, 'PENDIENTE'),
  ];
  const ingresos = calcularIngresosEjercicio(cobros, 2025);
  assert(ingresos.totalPrevisto === 3000, '2. Ingresos previstos 3000');
  assert(ingresos.totalCobrado === 2000, '2. Ingresos cobrados 2000');
  assert(ingresos.totalPendiente === 1000, '2. Pendientes 1000');
}

// 3. Gastos ejercicio
{
  const gastos = [
    makeGasto('g1', 'inm_1', propietarioA, '2025-02-10', 500, 'MANTENIMIENTO'),
    makeGasto('g2', 'inm_1', propietarioA, '2025-03-15', 300, 'SEGUROS'),
    makeGasto('g3', 'inm_1', propietarioA, '2025-04-20', 200, 'OTRO', false),
  ];
  const gastosEj = calcularGastosEjercicio(gastos, 2025);
  assert(gastosEj.total === 1000, '3. Gastos totales 1000');
  assert(gastosEj.totalDeducible === 800, '3. Deducibles 800 (mantenimiento+seguros)');
  assert(gastosEj.totalNoDeducible === 200, '3. No deducibles 200');
}

// 4. Resultado neto cobrado - deducible
{
  const cobros = [
    makeCobro('c1', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 1, 1000, 1000, 'PAGADO'),
    makeCobro('c2', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 2, 1000, 1000, 'PAGADO'),
  ];
  const contrato = makeContrato('cont1', 'inm_1', propietarioA, 'inq1', 'Inquilino A', '2025-01-01', undefined, 1000, cobros);
  const gastos = [
    makeGasto('g1', 'inm_1', propietarioA, '2025-02-10', 500, 'MANTENIMIENTO'),
  ];
  const resumen = generarResumenFiscalAnual('inm_1', 2025, [inmueble1], [contrato], gastos, userA);
  assert(resumen!.resultadoNetoOperativo === 1500, '4. Resultado neto 2000 cobrado - 500 deducible = 1500');
  assert(resumen!.resultadoBruto === 1500, '4. Resultado bruto igual si solo deducible');
}

// 5. Deducible / no deducible separación
{
  const gDed = makeGasto('g1', 'inm_1', propietarioA, '2025-01-10', 100, 'MANTENIMIENTO', true);
  const gNoDed = makeGasto('g2', 'inm_1', propietarioA, '2025-01-11', 100, 'OTRO', false);
  assert(esGastoDeducible(gDed) === true, '5. Gasto con esDeducible true es deducible');
  assert(esGastoDeducible(gNoDed) === false, '5. Gasto con esDeducible false no deducible');
  const gInfDed = makeGasto('g3', 'inm_1', propietarioA, '2025-01-12', 100, 'COMUNIDAD');
  const gInfNoDed = makeGasto('g4', 'inm_1', propietarioA, '2025-01-13', 100, 'OTRO');
  assert(esGastoDeducible(gInfDed) === true, '5. COMUNIDAD inferida deducible');
  assert(esGastoDeducible(gInfNoDed) === false, '5. OTRO sin flag inferido no deducible');
}

// 6. Dos inquilinos mismo ejercicio
{
  const cobrosA = [
    makeCobro('cA1', 'contA', 'inm_1', propietarioA, 'inqA', 2025, 1, 1000, 1000, 'PAGADO'),
    makeCobro('cA2', 'contA', 'inm_1', propietarioA, 'inqA', 2025, 2, 1000, 1000, 'PAGADO'),
  ];
  const cobrosB = [
    makeCobro('cB1', 'contB', 'inm_1', propietarioA, 'inqB', 2025, 7, 1100, 1100, 'PAGADO'),
    makeCobro('cB2', 'contB', 'inm_1', propietarioA, 'inqB', 2025, 8, 1100, 1100, 'PAGADO'),
  ];
  const contA = makeContrato('contA', 'inm_1', propietarioA, 'inqA', 'Inquilino A', '2025-01-01', '2025-06-30', 1000, cobrosA);
  const contB = makeContrato('contB', 'inm_1', propietarioA, 'inqB', 'Inquilino B', '2025-07-01', '2025-12-31', 1100, cobrosB);
  const resumen = generarResumenFiscalAnual('inm_1', 2025, [inmueble1], [contA, contB], [], userA);
  assert(resumen!.numContratos === 2, '6. Dos contratos mismo ejercicio');
  assert(resumen!.numInquilinos === 2, '6. Dos inquilinos únicos');
  assert(resumen!.periodosOcupacion.length === 2, '6. Dos periodos ocupación');
  assert(resumen!.ingresos.totalCobrado === 4200, '6. Ingresos cobrados suman ambos inquilinos');
}

// 7. Sucesión contratos sin sobrescribir histórico
{
  const cobros2024 = [makeCobro('c24', 'cont2024', 'inm_1', propietarioA, 'inqOld', 2024, 12, 900, 900, 'PAGADO')];
  const cobros2025 = [makeCobro('c25', 'cont2025', 'inm_1', propietarioA, 'inqNew', 2025, 1, 1000, 1000, 'PAGADO')];
  const cont2024 = makeContrato('cont2024', 'inm_1', propietarioA, 'inqOld', 'Inquilino Old', '2024-01-01', '2024-12-31', 900, cobros2024);
  const cont2025 = makeContrato('cont2025', 'inm_1', propietarioA, 'inqNew', 'Inquilino New', '2025-01-01', undefined, 1000, cobros2025);
  const resumen2024 = generarResumenFiscalAnual('inm_1', 2024, [inmueble1], [cont2024, cont2025], [], userA);
  const resumen2025 = generarResumenFiscalAnual('inm_1', 2025, [inmueble1], [cont2024, cont2025], [], userA);
  assert(resumen2024!.contratos.some(c => c.id === 'cont2024'), '7. Histórico 2024 conserva contrato 2024');
  assert(resumen2025!.contratos.some(c => c.id === 'cont2025'), '7. Histórico 2025 conserva contrato 2025');
  assert(!resumen2024!.contratos.some(c => c.id === 'cont2025'), '7. 2024 no incluye contrato futuro 2025');
  assert(resumen2024!.ingresos.totalCobrado === 900, '7. Ingresos 2024 solo 900, no sobrescrito por 2025');
  assert(resumen2025!.ingresos.totalCobrado === 1000, '7. Ingresos 2025 solo 1000');
}

// 8. Meses impagados
{
  const cobros = [
    makeCobro('c1', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 1, 1000, 0, 'IMPAGADO'),
    makeCobro('c2', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 2, 1000, 0, 'IMPAGADO'),
    makeCobro('c3', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 3, 1000, 1000, 'PAGADO'),
  ];
  const ingresos = calcularIngresosEjercicio(cobros, 2025);
  assert(ingresos.totalImpagado === 2000, '8. Impagados 2000');
  assert(ingresos.mesesImpagados.length === 2, '8. Dos meses impagados identificables');
  assert(ingresos.mesesImpagados.includes(1) && ingresos.mesesImpagados.includes(2), '8. Meses 1 y 2 impagados');
}

// 9. Pago parcial
{
  const cobros = [
    makeCobro('c1', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 1, 1000, 600, 'PAGADO_PARCIAL'),
  ];
  const ingresos = calcularIngresosEjercicio(cobros, 2025);
  assert(ingresos.totalCobrado === 600, '9. Parcial cobrado 600');
  assert(ingresos.totalParcial === 400, '9. Parcial pendiente 400');
  assert(ingresos.mesesParciales.includes(1), '9. Mes parcial identificable');
}

// 10. Justificante vinculado cobro
{
  const cobros = [
    makeCobro('c1', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 1, 1000, 1000, 'PAGADO', {
      id: 'just1',
      nombreArchivo: 'justificante_enero.pdf',
      storagePath: 'cobros/cont1/justificante_enero.pdf',
      downloadURL: 'https://storage/cobros/cont1/justificante.pdf',
      url: 'https://storage/cobros/cont1/justificante.pdf',
    }),
  ];
  const contrato = makeContrato('cont1', 'inm_1', propietarioA, 'inq1', 'Inquilino A', '2025-01-01', undefined, 1000, cobros);
  const resumen = generarResumenFiscalAnual('inm_1', 2025, [inmueble1], [contrato], [], userA);
  assert(resumen!.documentacion.length === 1, '10. Documentación incluye justificante cobro');
  assert(resumen!.documentacion[0].storagePath === 'cobros/cont1/justificante_enero.pdf', '10. storagePath reutilizado');
  assert(resumen!.documentacion[0].tipo === 'INGRESO', '10. Tipo INGRESO');
}

// 11. Gasto vinculado OT / trabajoId conserva relación
{
  const gastoOT = makeGasto('gOT', 'inm_1', propietarioA, '2025-05-10', 250, 'REPARACION', true, 'trabajo_123');
  (gastoOT as any).incidenciaId = 'inc_456';
  const resumen = generarResumenFiscalAnual('inm_1', 2025, [inmueble1], [], [gastoOT], userA);
  assert(resumen!.gastos.gastos[0].trabajoId === 'trabajo_123', '11. Gasto conserva trabajoId OT');
  assert((resumen!.gastos.gastos[0] as any).incidenciaId === 'inc_456', '11. Gasto conserva incidenciaId');
  assert(resumen!.gastos.gastosVinculadosOT === 1, '11. Contador vinculados OT incrementado');
}

// 12. Inmueble sin actividad
{
  const resumen = generarResumenFiscalAnual('inm_1', 2025, [inmueble1], [], [], userA);
  assert(resumen!.ingresos.countTotal === 0, '12. Sin actividad ingresos 0');
  assert(resumen!.gastos.countTotal === 0, '12. Sin actividad gastos 0');
  assert(resumen!.numContratos === 0, '12. Sin contratos');
  assert(resumen!.diasAlquilados === 0, '12. Días alquilados 0');
}

// 13. Aislamiento propietario A/B
{
  const cobrosA = [makeCobro('cA', 'contA', 'inm_1', propietarioA, 'inqA', 2025, 1, 1000, 1000, 'PAGADO')];
  const contA = makeContrato('contA', 'inm_1', propietarioA, 'inqA', 'Inquilino A', '2025-01-01', undefined, 1000, cobrosA);
  const cobrosB = [makeCobro('cB', 'contB', 'inm_2', propietarioB, 'inqB', 2025, 1, 2000, 2000, 'PAGADO')];
  const contB = makeContrato('contB', 'inm_2', propietarioB, 'inqB', 'Inquilino B', '2025-01-01', undefined, 2000, cobrosB);

  const resumenA = generarResumenFiscalAnual('inm_1', 2025, [inmueble1, inmueble2], [contA, contB], [], userA);
  const resumenB = generarResumenFiscalAnual('inm_2', 2025, [inmueble1, inmueble2], [contA, contB], [], userB);

  assert(canAccessResumenFiscal(resumenA!, userA) === true, '13. A puede acceder a su resumen');
  assert(canAccessResumenFiscal(resumenA!, userB) === false, '13. B no puede acceder a resumen de A');
  assert(canAccessResumenFiscal(resumenB!, userB) === true, '13. B puede acceder a su resumen');
  assert(canAccessResumenFiscal(resumenB!, userA) === false, '13. A no puede acceder a resumen de B');
}

// 14. Consulta histórico 2024/2025/2026 independiente
{
  const cobros24 = [makeCobro('c24', 'cont24', 'inm_1', propietarioA, 'inq', 2024, 6, 900, 900, 'PAGADO')];
  const cobros25 = [makeCobro('c25', 'cont25', 'inm_1', propietarioA, 'inq', 2025, 6, 1000, 1000, 'PAGADO')];
  const cobros26 = [makeCobro('c26', 'cont26', 'inm_1', propietarioA, 'inq', 2026, 6, 1100, 1100, 'PAGADO')];
  const cont24 = makeContrato('cont24', 'inm_1', propietarioA, 'inq', 'Inq', '2024-01-01', '2024-12-31', 900, cobros24);
  const cont25 = makeContrato('cont25', 'inm_1', propietarioA, 'inq', 'Inq', '2025-01-01', '2025-12-31', 1000, cobros25);
  const cont26 = makeContrato('cont26', 'inm_1', propietarioA, 'inq', 'Inq', '2026-01-01', '2026-12-31', 1100, cobros26);

  const historico = generarHistoricoFiscalInmueble('inm_1', [2024, 2025, 2026], [inmueble1], [cont24, cont25, cont26], [], userA);
  assert(historico.length === 3, '14. Histórico 3 ejercicios');
  const h24 = historico.find(h => h.ejercicio === 2024);
  const h25 = historico.find(h => h.ejercicio === 2025);
  const h26 = historico.find(h => h.ejercicio === 2026);
  assert(h24!.ingresos.totalCobrado === 900, '14. 2024 cobrado 900');
  assert(h25!.ingresos.totalCobrado === 1000, '14. 2025 cobrado 1000');
  assert(h26!.ingresos.totalCobrado === 1100, '14. 2026 cobrado 1100');
  assert(h24!.ingresos.totalCobrado !== h25!.ingresos.totalCobrado, '14. Histórico independiente, no contaminación');
}

// 15. Cambio ejercicio sin contaminación
{
  const cobros = [
    makeCobro('c1', 'cont1', 'inm_1', propietarioA, 'inq1', 2025, 1, 1000, 1000, 'PAGADO'),
    makeCobro('c2', 'cont1', 'inm_1', propietarioA, 'inq1', 2024, 1, 900, 900, 'PAGADO'),
  ];
  const contrato = makeContrato('cont1', 'inm_1', propietarioA, 'inq1', 'Inquilino', '2024-01-01', undefined, 1000, cobros);
  const gastos = [
    makeGasto('g2025', 'inm_1', propietarioA, '2025-02-01', 500, 'MANTENIMIENTO'),
    makeGasto('g2024', 'inm_1', propietarioA, '2024-02-01', 400, 'MANTENIMIENTO'),
  ];
  const resumen2025 = generarResumenFiscalAnual('inm_1', 2025, [inmueble1], [contrato], gastos, userA);
  const resumen2024 = generarResumenFiscalAnual('inm_1', 2024, [inmueble1], [contrato], gastos, userA);
  assert(resumen2025!.ingresos.totalCobrado === 1000 && resumen2025!.gastos.total === 500, '15. 2025 solo datos 2025');
  assert(resumen2024!.ingresos.totalCobrado === 900 && resumen2024!.gastos.total === 400, '15. 2024 solo datos 2024, sin contaminación');
  assert(resumen2025!.resultadoNetoOperativo === 500, '15. Neto 2025 1000-500=500');
  assert(resumen2024!.resultadoNetoOperativo === 500, '15. Neto 2024 900-400=500');
}

console.log(`\n=== RESULTADO: ${passed} PASS, ${failed} FAIL ===`);
if (failed > 0) process.exit(1);
else console.log('Todos los tests fiscales anuales PASS');
