/**
 * TESTS REPORTING - GAP 3
 * Obligatorios: cartera (varios/sin/aislamiento), inmueble (individual/con/sin habitaciones), economía, fechas, contratos, fiscal, exportación, seguridad, PDF, no duplicación
 */

import {
  generarInformeCartera,
  generarInformeInmueble,
  generarInformeRentabilidad,
  generarInformeFiscal,
  generarExportacionFiscal,
  exportarCSV,
  exportarJSON,
  crearRangoMensual,
  crearRangoTrimestral,
  crearRangoAnual,
  crearRangoPersonalizado,
  validarNoDuplicacion,
  canAccessInformeCartera,
  canAccessInmueble,
  validarFiltrosNoApropiacion,
} from '../utils/reportingEngine';
import {
  generarContenidoPdfCartera,
  generarContenidoPdfInmueble,
  generarContenidoPdfFiscal,
  validarPdfContenido,
} from '../utils/pdfExportEngine';
import { Inmueble, ContratoFormalizacion, Gasto, UsuarioApp, RangoFechas } from '../types';

type TestResult = { name: string; passed: boolean; error?: string };

const results: TestResult[] = [];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log(`✅ PASS: ${name}`);
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message });
    console.log(`❌ FAIL: ${name} - ${e.message}`);
  }
}

// Mock data
const propietarioA = 'prop_A';
const propietarioB = 'prop_B';

const inmueble1: Inmueble = {
  id: 'inm_1',
  titulo: 'Piso Centro',
  direccion: 'Calle Mayor 1',
  ciudad: 'Madrid',
  provincia: 'Madrid',
  codigoPostal: '28001',
  tipoInmueble: 'piso',
  superficie: 80,
  habitaciones: 3,
  banos: 1,
  precioAlquiler: 1000,
  estado: 'alquilado',
  propietarioId: propietarioA,
  propietarioPrincipalId: propietarioA,
  valorAdquisicion: 150000,
  fechaAdquisicion: '2020-01-01',
  modalidadAlquiler: 'completo',
} as any;

const inmueble2: Inmueble = {
  id: 'inm_2',
  titulo: 'Piso 2',
  direccion: 'Calle Mayor 2',
  ciudad: 'Madrid',
  provincia: 'Madrid',
  codigoPostal: '28002',
  tipoInmueble: 'piso',
  superficie: 60,
  habitaciones: 2,
  banos: 1,
  precioAlquiler: 800,
  estado: 'disponible',
  propietarioId: propietarioA,
  propietarioPrincipalId: propietarioA,
  valorAdquisicion: 120000,
  fechaAdquisicion: '2021-06-01',
  modalidadAlquiler: 'completo',
} as any;

const inmuebleHab: Inmueble = {
  id: 'inm_hab',
  titulo: 'Piso Habitaciones',
  direccion: 'Calle Habitaciones 3',
  ciudad: 'Madrid',
  provincia: 'Madrid',
  codigoPostal: '28003',
  tipoInmueble: 'piso',
  superficie: 100,
  habitaciones: 4,
  banos: 2,
  precioAlquiler: 1500,
  estado: 'alquilado',
  propietarioId: propietarioA,
  propietarioPrincipalId: propietarioA,
  valorAdquisicion: 180000,
  modalidadAlquiler: 'habitaciones',
} as any;

const inmuebleB: Inmueble = {
  id: 'inm_B',
  titulo: 'Piso B',
  direccion: 'Calle B 1',
  ciudad: 'Barcelona',
  provincia: 'Barcelona',
  codigoPostal: '08001',
  tipoInmueble: 'piso',
  superficie: 70,
  habitaciones: 2,
  banos: 1,
  precioAlquiler: 900,
  estado: 'alquilado',
  propietarioId: propietarioB,
  propietarioPrincipalId: propietarioB,
  valorAdquisicion: 130000,
  modalidadAlquiler: 'completo',
} as any;

const contratoActivo: ContratoFormalizacion = {
  id: 'cont_act',
  candidatoId: 'cand_1',
  candidatoNombre: 'Juan Pérez',
  inmuebleId: 'inm_1',
  propietarioId: propietarioA,
  estado: 'FORMALIZADO_ACTIVO',
  modalidadAlquiler: 'completo',
  fechaInicioContrato: '2024-01-01',
  fechaFinContrato: '2025-12-31',
  rentaMensual: 1000,
  esVigente: true,
  registroCobros: [
    { id: 'cob_1', contratoId: 'cont_act', inmuebleId: 'inm_1', propietarioId: propietarioA, inquilinoNombre: 'Juan Pérez', periodoMesAnio: '2024-01', anio: 2024, mes: 1, nombreMes: 'Enero', fechaVencimiento: '2024-01-05', importePrevisto: 1000, importeRecibido: 1000, estado: 'PAGADO', formaPago: 'TRANSFERENCIA' } as any,
    { id: 'cob_2', contratoId: 'cont_act', inmuebleId: 'inm_1', propietarioId: propietarioA, inquilinoNombre: 'Juan Pérez', periodoMesAnio: '2024-02', anio: 2024, mes: 2, nombreMes: 'Febrero', fechaVencimiento: '2024-02-05', importePrevisto: 1000, importeRecibido: 0, estado: 'PENDIENTE', formaPago: 'TRANSFERENCIA' } as any,
  ],
} as any;

const contratoFinalizado: ContratoFormalizacion = {
  id: 'cont_fin',
  candidatoId: 'cand_2',
  candidatoNombre: 'Ana López',
  inmuebleId: 'inm_2',
  propietarioId: propietarioA,
  estado: 'FINALIZADO',
  modalidadAlquiler: 'completo',
  fechaInicioContrato: '2023-01-01',
  fechaFinContrato: '2023-12-31',
  rentaMensual: 800,
  esVigente: false,
} as any;

const contratoRescindido: ContratoFormalizacion = {
  id: 'cont_res',
  candidatoId: 'cand_3',
  candidatoNombre: 'Carlos Ruiz',
  inmuebleId: 'inm_1',
  propietarioId: propietarioA,
  estado: 'CANCELADO',
  modalidadAlquiler: 'completo',
  fechaInicioContrato: '2023-06-01',
  fechaFinContrato: '2024-06-01',
  rentaMensual: 1000,
  esVigente: false,
} as any;

const contratoHabitacion: ContratoFormalizacion = {
  id: 'cont_hab_1',
  candidatoId: 'cand_hab',
  candidatoNombre: 'Luis García',
  inmuebleId: 'inm_hab',
  propietarioId: propietarioA,
  estado: 'FORMALIZADO_ACTIVO',
  modalidadAlquiler: 'habitaciones',
  habitacionIdentificador: 'HAB_1',
  fechaInicioContrato: '2024-01-01',
  fechaFinContrato: '2024-12-31',
  rentaMensual: 400,
  esVigente: true,
} as any;

const contratoTemporada: ContratoFormalizacion = {
  id: 'cont_temp',
  candidatoId: 'cand_temp',
  candidatoNombre: 'Temp Inquilino',
  inmuebleId: 'inm_2',
  propietarioId: propietarioA,
  estado: 'FORMALIZADO_ACTIVO',
  modalidadAlquiler: 'temporada',
  fechaInicioContrato: '2024-06-01',
  fechaFinContrato: '2024-08-31',
  rentaMensual: 1200,
  esVigente: true,
} as any;

const gasto1: Gasto = {
  id: 'gasto_1',
  inmuebleId: 'inm_1',
  propietarioId: propietarioA,
  fecha: '2024-01-15',
  concepto: 'IBI 2024',
  importe: 300,
  categoria: 'IMPUESTOS',
  esDeducible: true,
} as any;

const gasto2: Gasto = {
  id: 'gasto_2',
  inmuebleId: 'inm_2',
  propietarioId: propietarioA,
  fecha: '2024-02-20',
  concepto: 'Comunidad',
  importe: 100,
  categoria: 'COMUNIDAD',
  esDeducible: true,
} as any;

const userPropA: UsuarioApp = {
  id: 'user_A',
  email: 'a@test.com',
  nombre: 'Propietario A',
  tipoPerfil: 'PROPIETARIO',
  propietarioId: propietarioA,
  estado: 'ACTIVO',
  createdAt: '',
  updatedAt: '',
} as any;

const userPropB: UsuarioApp = {
  id: 'user_B',
  email: 'b@test.com',
  nombre: 'Propietario B',
  tipoPerfil: 'PROPIETARIO',
  propietarioId: propietarioB,
  estado: 'ACTIVO',
  createdAt: '',
  updatedAt: '',
} as any;

const userProf: UsuarioApp = {
  id: 'user_prof',
  email: 'prof@test.com',
  nombre: 'Profesional',
  tipoPerfil: 'PROFESIONAL',
  estado: 'ACTIVO',
  createdAt: '',
  updatedAt: '',
} as any;

// =====================
// TESTS
// =====================

export function runTestsReporting(): TestResult[] {
  console.log('=== GAP 3 REPORTING TESTS ===');

  // CARTERA
  test('Cartera - varios inmuebles', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1, inmueble2, inmuebleHab], [contratoActivo, contratoFinalizado], [gasto1, gasto2], [], [], [], [], rango, undefined);
    assert(informe !== null, 'Informe nulo');
    assert(informe!.patrimonio.numeroInmuebles === 3, `Esperado 3 inmuebles, got ${informe!.patrimonio.numeroInmuebles}`);
    assert(informe!.economia.ingresosTotales >= 0, 'Ingresos negativos');
  });

  test('Cartera - sin inmuebles', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [], [], [], [], [], [], [], rango, undefined);
    assert(informe !== null, 'Informe nulo sin inmuebles');
    assert(informe!.patrimonio.numeroInmuebles === 0, 'Debe ser 0 inmuebles');
  });

  test('Cartera - aislamiento propietario A no ve B', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1, inmuebleB], [], [], [], [], [], [], rango, userPropA);
    assert(informe!.patrimonio.numeroInmuebles === 1, `Aislamiento fallido, A ve ${informe!.patrimonio.numeroInmuebles} inmuebles`);
    assert(informe!.patrimonio.numeroInmuebles !== 2, 'A no debe ver inmueble B');
  });

  // INMUEBLE
  test('Inmueble - individual', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1, inmueble2], [contratoActivo], [gasto1], [], [], rango, undefined);
    assert(informe !== null, 'Informe inmueble nulo');
    assert(informe!.inmuebleId === 'inm_1', 'Id mismatch');
    assert(informe!.contratos.length === 1, 'Contratos count mismatch');
  });

  test('Inmueble - con habitaciones', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_hab', [inmuebleHab], [contratoHabitacion], [], [], [], rango, undefined);
    assert(informe !== null, 'Informe hab nulo');
    assert(informe!.habitaciones !== undefined, 'Debe tener habitaciones');
    assert(informe!.habitaciones!.length === 1, 'Debe tener 1 habitacion');
  });

  test('Inmueble - sin habitaciones vivienda completa', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1], [contratoActivo], [], [], [], rango, undefined);
    assert(informe!.modalidadAlquiler === 'completo', 'Debe ser completo');
  });

  // ECONOMÍA
  test('Economía - ingresos gastos resultado rentabilidad pendientes', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1], [contratoActivo], [gasto1], [], [], [], [], rango, undefined);
    assert(informe!.economia.ingresosTotales === 1000, `Ingresos debe ser 1000, got ${informe!.economia.ingresosTotales}`);
    assert(informe!.economia.gastosTotales === 300, `Gastos debe ser 300`);
    assert(informe!.economia.resultado === 700, `Resultado debe ser 700`);
    assert(informe!.economia.cobrosRealizados === 1, 'Cobros realizados 1');
    assert(informe!.economia.cobrosPendientes === 1, 'Pendientes 1');
  });

  // FECHAS
  test('Fechas - mensual', () => {
    const rango = crearRangoMensual(2024, 2);
    assert(rango.fechaInicio === '2024-02-01', `Inicio mensual fail ${rango.fechaInicio}`);
    assert(rango.fechaFin === '2024-02-29', `Fin mensual 2024 bisiesto debe ser 29, got ${rango.fechaFin}`);
  });

  test('Fechas - trimestral', () => {
    const rango = crearRangoTrimestral(2024, 1);
    assert(rango.fechaInicio === '2024-01-01', 'Inicio trim fail');
    assert(rango.fechaFin === '2024-03-31', 'Fin trim fail');
  });

  test('Fechas - anual cambio año', () => {
    const rango2023 = crearRangoAnual(2023);
    const rango2024 = crearRangoAnual(2024);
    assert(rango2023.fechaInicio === '2023-01-01' && rango2023.fechaFin === '2023-12-31', 'Anual 2023 fail');
    assert(rango2024.fechaInicio === '2024-01-01', 'Anual 2024 inicio fail');
  });

  test('Fechas - personalizado', () => {
    const rango = crearRangoPersonalizado('2024-02-28', '2024-03-01');
    assert(rango.fechaInicio === '2024-02-28', 'Personalizado inicio fail');
    assert(rango.fechaFin === '2024-03-01', 'Personalizado fin fail');
  });

  test('Fechas - mes 28/29/30/31 días', () => {
    const feb2023 = crearRangoMensual(2023, 2);
    assert(feb2023.fechaFin === '2023-02-28', `Feb 2023 debe ser 28, got ${feb2023.fechaFin}`);
    const abr = crearRangoMensual(2024, 4);
    assert(abr.fechaFin === '2024-04-30', `Abril debe ser 30`);
    const ene = crearRangoMensual(2024, 1);
    assert(ene.fechaFin === '2024-01-31', `Enero debe ser 31`);
  });

  // CONTRATOS
  test('Contratos - vivienda habitual', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1], [contratoActivo], [], [], [], rango, undefined);
    assert(informe!.contratos[0].modalidad === 'completo', 'Modalidad debe ser completo');
  });

  test('Contratos - temporada', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_2', [inmueble2], [contratoTemporada], [], [], [], rango, undefined);
    assert(informe!.contratos[0].modalidad === 'temporada', 'Debe ser temporada');
  });

  test('Contratos - habitación', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_hab', [inmuebleHab], [contratoHabitacion], [], [], [], rango, undefined);
    assert(informe!.contratos[0].modalidad === 'habitaciones', 'Debe ser habitaciones');
    assert(informe!.contratos[0].habitacionId === 'HAB_1', 'HabitacionId fail');
  });

  test('Contratos - finalizado', () => {
    const rango = crearRangoAnual(2023);
    const informe = generarInformeInmueble('inm_2', [inmueble2], [contratoFinalizado], [], [], [], rango, undefined);
    assert(informe!.contratos[0].estado === 'FINALIZADO', 'Debe ser FINALIZADO');
  });

  test('Contratos - rescindido', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1], [contratoRescindido], [], [], [], rango, undefined);
    assert(informe!.contratos[0].estado === 'CANCELADO', 'Debe ser CANCELADO');
  });

  test('Contratos - próximo finalizar', () => {
    const hoy = new Date();
    const finProximo = new Date();
    finProximo.setDate(hoy.getDate() + 30);
    const contratoProx: ContratoFormalizacion = {
      ...contratoActivo,
      id: 'cont_prox',
      fechaFinContrato: finProximo.toISOString().split('T')[0],
    } as any;
    const rango = crearRangoAnual(hoy.getFullYear());
    const informe = generarInformeInmueble('inm_1', [inmueble1], [contratoProx], [], [], [], rango, undefined);
    assert(informe!.contratos[0].esProximoFinalizar === true, 'Debe ser próximo finalizar');
  });

  // FISCAL
  test('Fiscal - agrupación ejercicio categorías ingresos gastos resultado', () => {
    const rango = crearRangoAnual(2024);
    const fiscal = generarInformeFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    assert(fiscal.ejercicio === 2024, 'Ejercicio fail');
    assert(fiscal.totalIngresos >= 0, 'Ingresos fiscal fail');
    assert(fiscal.totalGastos >= 0, 'Gastos fiscal fail');
    assert(fiscal.categoriasFiscalesConservadas === true, 'Categorias conservadas fail');
    assert(fiscal.notaAEAT.includes('Exportación fiscal estructurada'), 'Nota AEAT fail');
  });

  // EXPORTACIÓN
  test('Exportación - CSV válido', () => {
    const rango = crearRangoAnual(2024);
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined, 'CSV');
    const csv = exportarCSV(exp);
    assert(csv.includes('propietarioId,inmuebleId'), 'CSV header fail');
    assert(csv.includes('inm_1'), 'CSV debe incluir inmueble');
    assert(csv.split('\n').length >= 2, 'CSV debe tener al menos header + 1 fila');
  });

  test('Exportación - JSON válido', () => {
    const rango = crearRangoAnual(2024);
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined, 'JSON');
    const jsonStr = exportarJSON(exp);
    const parsed = JSON.parse(jsonStr);
    assert(parsed.items.length > 0, 'JSON items vacío');
    assert(parsed.items[0].propietarioId === propietarioA, 'JSON propietario fail');
  });

  test('Exportación - campos obligatorios', () => {
    const rango = crearRangoAnual(2024);
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    const item = exp.items[0];
    assert(!!item.propietarioId, 'Falta propietarioId');
    assert(!!item.inmuebleId, 'Falta inmuebleId');
    assert(!!item.ejercicio, 'Falta ejercicio');
    assert(!!item.periodo, 'Falta periodo');
    assert(!!item.concepto, 'Falta concepto');
    assert(!!item.fecha, 'Falta fecha');
    assert(item.importe !== undefined, 'Falta importe');
    assert(!!item.categoria, 'Falta categoria');
    assert(!!item.referenciaId, 'Falta referencia');
    assert(!!item.origen, 'Falta origen');
  });

  test('Exportación - importes fechas referencias', () => {
    const rango = crearRangoAnual(2024);
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    assert(exp.totalIngresos === 1000, `Total ingresos debe ser 1000, got ${exp.totalIngresos}`);
    assert(exp.totalGastos === 300, `Total gastos debe ser 300`);
    assert(exp.items.every(i => !isNaN(new Date(i.fecha).getTime())), 'Fecha inválida en exportación');
  });

  // SEGURIDAD
  test('Seguridad - A no ve B', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1, inmuebleB], [], [], [], [], [], [], rango, userPropA);
    assert(informe!.patrimonio.numeroInmuebles === 1, 'A ve inmuebles de B');
  });

  test('Seguridad - inmueble A no en B', () => {
    const rango = crearRangoAnual(2024);
    try {
      generarInformeInmueble('inm_B', [inmuebleB], [], [], [], [], rango, userPropA);
      assert(false, 'Debe lanzar error acceso denegado');
    } catch (e: any) {
      assert(e.message.includes('Acceso denegado'), 'Debe denegar acceso');
    }
  });

  test('Seguridad - export RBAC', () => {
    const rango = crearRangoAnual(2024);
    try {
      generarExportacionFiscal(propietarioB, [inmuebleB], [], [], rango, userPropA, 'CSV');
      assert(false, 'Debe denegar exportación');
    } catch (e: any) {
      assert(e.message.includes('Acceso denegado') || e.message.includes('manipulado'), 'Debe denegar');
    }
  });

  test('Seguridad - manipulación IDs rechazada', () => {
    const valid = validarFiltrosNoApropiacion({ propietarioId: propietarioB, rango: crearRangoAnual(2024) }, userPropA);
    assert(valid.valido === false, 'Debe rechazar manipulación propietarioId');
  });

  test('Seguridad - profesional no autorizado', () => {
    const valid = validarFiltrosNoApropiacion({ propietarioId: propietarioA, rango: crearRangoAnual(2024) }, userProf);
    assert(valid.valido === false, 'Profesional no debe acceder a informes fiscales');
  });

  // PDF
  test('PDF - generación correcta contenido mínimo', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1], [contratoActivo], [gasto1], [], [], [], [], rango, undefined)!;
    const contenido = generarContenidoPdfCartera(informe);
    const valid = validarPdfContenido(contenido);
    assert(valid.valido, `PDF inválido: ${valid.errores.join(',')}`);
    assert(contenido.secciones.length >= 3, 'PDF debe tener al menos 3 secciones');
  });

  test('PDF - sin datos ajenos', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1], [], [], [], [], [], [], rango, userPropA)!;
    const contenido = generarContenidoPdfCartera(informe);
    const texto = JSON.stringify(contenido);
    assert(!texto.includes(propietarioB), 'PDF no debe incluir datos de B');
    assert(!texto.includes('inm_B'), 'PDF no debe incluir inmueble B');
  });

  test('PDF - inmueble individual sin otros propietarios', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1, inmuebleB], [contratoActivo], [gasto1], [], [], rango, undefined)!;
    const contenido = generarContenidoPdfInmueble(informe);
    assert(!JSON.stringify(contenido).includes('inm_B'), 'PDF inmueble no debe incluir otros');
  });

  test('PDF - fiscal resumen estructurado legible', () => {
    const rango = crearRangoAnual(2024);
    const fiscal = generarInformeFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    const contenido = generarContenidoPdfFiscal(fiscal);
    assert(contenido.secciones.length >= 2, 'Fiscal PDF debe tener resumen y detalle');
  });

  // NO DUPLICACIÓN
  test('No duplicación - renta no doble', () => {
    const contratoDuplicado: ContratoFormalizacion = {
      ...contratoActivo,
      id: 'cont_dup',
      registroCobros: [
        { id: 'cob_dup_1', contratoId: 'cont_act', periodoMesAnio: '2024-01', anio: 2024, mes: 1 } as any,
        { id: 'cob_dup_2', contratoId: 'cont_act', periodoMesAnio: '2024-01', anio: 2024, mes: 1 } as any,
      ],
    } as any;
    const res = validarNoDuplicacion([inmueble1], [contratoDuplicado], []);
    assert(res.valido === false, 'Debe detectar cobro duplicado');
  });

  test('No duplicación - habitación no duplica inmueble completo', () => {
    const res = validarNoDuplicacion([inmuebleHab], [contratoActivo, contratoHabitacion], []);
    // contratoActivo es de inm_1, no hab, así que no debe detectar, pero probamos solapamiento en mismo inmueble
    const contratoCompletoHab: ContratoFormalizacion = {
      ...contratoActivo,
      id: 'cont_comp_hab',
      inmuebleId: 'inm_hab',
      modalidadAlquiler: 'completo',
    } as any;
    const res2 = validarNoDuplicacion([inmuebleHab], [contratoCompletoHab, contratoHabitacion], []);
    assert(res2.valido === false, 'Debe detectar posible duplicación completo vs habitaciones');
  });

  test('No duplicación - gasto no doble', () => {
    const res = validarNoDuplicacion([inmueble1], [], [gasto1, gasto1]);
    assert(res.valido === false, 'Debe detectar gasto duplicado');
  });

  test('No duplicación - periodo no doble (merge)', () => {
    const rango = crearRangoAnual(2024);
    const contratoSolapado1: ContratoFormalizacion = {
      ...contratoActivo,
      id: 'cont_sol_1',
      fechaInicioContrato: '2024-01-01',
      fechaFinContrato: '2024-06-30',
    } as any;
    const contratoSolapado2: ContratoFormalizacion = {
      ...contratoActivo,
      id: 'cont_sol_2',
      fechaInicioContrato: '2024-03-01',
      fechaFinContrato: '2024-09-30',
    } as any;
    const informe = generarInformeCartera(propietarioA, [inmueble1], [contratoSolapado1, contratoSolapado2], [], [], [], [], [], rango, undefined)!;
    // Días alquilados sin duplicar debe ser menor que suma simple
    assert(informe.ocupacion.diasAlquilados <= 365, 'Días alquilados no debe exceder rango');
  });

  // RENTABILIDAD
  test('Rentabilidad - agregador reutiliza definición existente', () => {
    const rango = crearRangoAnual(2024);
    const rent = generarInformeRentabilidad(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    assert(!!rent.formula, 'Debe tener fórmula');
    assert(rent.ingresos === 1000, 'Ingresos rentabilidad fail');
  });

  // EVOLUCIÓN TEMPORAL
  test('Evolución - mensual/trimestral/anual con fechas explícitas', () => {
    const rangoMensual = crearRangoMensual(2024, 1);
    const informeMensual = generarInformeCartera(propietarioA, [inmueble1], [contratoActivo], [gasto1], [], [], [], [], rangoMensual, undefined)!;
    assert(informeMensual.evolucion.length >= 1, 'Evolución mensual vacía');
    assert(!!informeMensual.evolucion[0].fechaInicio && !!informeMensual.evolucion[0].fechaFin, 'Falta fechaInicio/Fin en evolución');

    const rangoAnual = crearRangoAnual(2024);
    const informeAnual = generarInformeCartera(propietarioA, [inmueble1], [contratoActivo], [gasto1], [], [], [], [], rangoAnual, undefined)!;
    assert(informeAnual.evolucion.length >= 1, 'Evolución anual vacía');
  });

  // SEGURIDAD canAccess
  test('Seguridad - canAccessInformeCartera', () => {
    assert(canAccessInformeCartera(propietarioA, userPropA) === true, 'A debe acceder a su cartera');
    assert(canAccessInformeCartera(propietarioB, userPropA) === false, 'A no debe acceder a cartera B');
  });

  test('Seguridad - canAccessInmueble', () => {
    assert(canAccessInmueble(inmueble1, userPropA) === true, 'A debe acceder a inmueble1');
    assert(canAccessInmueble(inmuebleB, userPropA) === false, 'A no debe acceder a inmuebleB');
  });

  console.log(`\n=== RESULTADOS: ${results.filter(r=>r.passed).length} PASS / ${results.filter(r=>!r.passed).length} FAIL ===`);
  return results;
}

// Auto-run si se importa directamente
if (typeof window !== 'undefined') {
  (window as any).runTestsReporting = runTestsReporting;
}
