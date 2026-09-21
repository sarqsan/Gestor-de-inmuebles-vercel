/**
 * GAP3 — Suite DESGLOSADA del motor de reporting (`reportingEngine`) y
 * exportación fiscal/PDF (`pdfExportEngine`).
 *
 * GAP-R4 (ORDEN 16-R): antes de R4, esta suite era **1 test que envolvía
 * 40 checks** del harness `src/tests/tests_reporting.ts` (visible a nivel de
 * pipeline, opaco a nivel de trazabilidad: un fallo no indicaba qué check).
 *
 * Esta versión DESGLOSA los 40 checks en tests con nombre propio, zona por
 * zona (cartera, inmueble, economía, fechas, contratos, fiscal, exportación,
 * seguridad/RBAC, PDF, no duplicación, rentabilidad, evolución, acceso),
 * conservando las mismas premisas y fixtures del harness original para que el
 * comportamiento verificado sea idéntico. El harness legacy se conserva en
 * `src/tests/tests_reporting.ts` para ejecución manual; no se duplica aquí.
 *
 * Añade además la cobertura del invariante documentado de GAP3 (§3 MAPA):
 * naturaleza de SOLO LECTURA — los informes no escriben ni mutan cobros,
 * gastos, contratos ni la exportación de origen.
 *
 * Los cálculos económicos subyacentes NO se duplican: viven y se prueban en
 * las suites propias de `cobrosEngine` / `fiscalEngine` / `gastosEngine`
 * (añadidas en esta misma orden R4).
 */
import { describe, expect, it } from 'vitest';
import {
  canAccessInmueble,
  canAccessInformeCartera,
  crearRangoAnual,
  crearRangoMensual,
  crearRangoPersonalizado,
  crearRangoTrimestral,
  exportarCSV,
  exportarJSON,
  generarExportacionFiscal,
  generarInformeCartera,
  generarInformeFiscal,
  generarInformeInmueble,
  generarInformeRentabilidad,
  validarFiltrosNoApropiacion,
  validarNoDuplicacion,
} from '../src/utils/reportingEngine';
import {
  generarContenidoPdfCartera,
  generarContenidoPdfFiscal,
  generarContenidoPdfInmueble,
  validarPdfContenido,
} from '../src/utils/pdfExportEngine';
import type {
  ContratoFormalizacion,
  Gasto,
  Inmueble,
  UsuarioApp,
} from '../src/types';

// ---------- Fixtures (idénticos al harness legacy tests_reporting.ts) ----------

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
  fechaAdquisicion: '2023-01-01',
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

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    for (const k of Object.getOwnPropertyNames(o)) deepFreeze((o as Record<string, unknown>)[k]);
    Object.freeze(o);
  }
  return o;
}

// ---------- CARTERA ----------

describe('GAP3 · cartera', () => {
  it('Cartera - varios inmuebles', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1, inmueble2, inmuebleHab], [contratoActivo, contratoFinalizado], [gasto1, gasto2], [], [], [], [], rango, undefined);
    expect(informe).not.toBeNull();
    expect(informe!.patrimonio.numeroInmuebles).toBe(3);
    expect(informe!.economia.ingresosTotales).toBeGreaterThanOrEqual(0);
  });

  it('Cartera - sin inmuebles', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [], [], [], [], [], [], [], rango, undefined);
    expect(informe).not.toBeNull();
    expect(informe!.patrimonio.numeroInmuebles).toBe(0);
  });

  it('Cartera - aislamiento propietario A no ve B', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1, inmuebleB], [], [], [], [], [], [], rango, userPropA);
    expect(informe!.patrimonio.numeroInmuebles).toBe(1);
    expect(informe!.patrimonio.numeroInmuebles).not.toBe(2);
  });
});

// ---------- INMUEBLE ----------

describe('GAP3 · inmueble', () => {
  it('Inmueble - individual', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1, inmueble2], [contratoActivo], [gasto1], [], [], rango, undefined);
    expect(informe).not.toBeNull();
    expect(informe!.inmuebleId).toBe('inm_1');
    expect(informe!.contratos).toHaveLength(1);
  });

  it('Inmueble - con habitaciones', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_hab', [inmuebleHab], [contratoHabitacion], [], [], [], rango, undefined);
    expect(informe).not.toBeNull();
    expect(informe!.habitaciones).toBeDefined();
    expect(informe!.habitaciones!).toHaveLength(1);
  });

  it('Inmueble - sin habitaciones vivienda completa', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1], [contratoActivo], [], [], [], rango, undefined);
    expect(informe!.modalidadAlquiler).toBe('completo');
  });
});

// ---------- ECONOMÍA ----------

describe('GAP3 · economía', () => {
  it('Economía - ingresos gastos resultado rentabilidad pendientes', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1], [contratoActivo], [gasto1], [], [], [], [], rango, undefined);
    expect(informe!.economia.ingresosTotales).toBe(1000);
    expect(informe!.economia.gastosTotales).toBe(300);
    expect(informe!.economia.resultado).toBe(700);
    expect(informe!.economia.cobrosRealizados).toBe(1);
    expect(informe!.economia.cobrosPendientes).toBe(1);
  });
});

// ---------- FECHAS ----------

describe('GAP3 · rangos de fechas', () => {
  it('Fechas - mensual', () => {
    const rango = crearRangoMensual(2024, 2);
    expect(rango.fechaInicio).toBe('2024-02-01');
    expect(rango.fechaFin).toBe('2024-02-29'); // 2024 es bisiesto
  });

  it('Fechas - trimestral', () => {
    const rango = crearRangoTrimestral(2024, 1);
    expect(rango.fechaInicio).toBe('2024-01-01');
    expect(rango.fechaFin).toBe('2024-03-31');
  });

  it('Fechas - anual cambio año', () => {
    const rango2023 = crearRangoAnual(2023);
    const rango2024 = crearRangoAnual(2024);
    expect(rango2023.fechaInicio).toBe('2023-01-01');
    expect(rango2023.fechaFin).toBe('2023-12-31');
    expect(rango2024.fechaInicio).toBe('2024-01-01');
  });

  it('Fechas - personalizado', () => {
    const rango = crearRangoPersonalizado('2024-02-28', '2024-03-01');
    expect(rango.fechaInicio).toBe('2024-02-28');
    expect(rango.fechaFin).toBe('2024-03-01');
  });

  it('Fechas - mes 28/29/30/31 días', () => {
    const feb2023 = crearRangoMensual(2023, 2);
    expect(feb2023.fechaFin).toBe('2023-02-28');
    const abr = crearRangoMensual(2024, 4);
    expect(abr.fechaFin).toBe('2024-04-30');
    const ene = crearRangoMensual(2024, 1);
    expect(ene.fechaFin).toBe('2024-01-31');
  });
});

// ---------- CONTRATOS ----------

describe('GAP3 · contratos en el informe', () => {
  it('Contratos - vivienda habitual', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1], [contratoActivo], [], [], [], rango, undefined);
    expect(informe!.contratos[0].modalidad).toBe('completo');
  });

  it('Contratos - temporada', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_2', [inmueble2], [contratoTemporada], [], [], [], rango, undefined);
    expect(informe!.contratos[0].modalidad).toBe('temporada');
  });

  it('Contratos - habitación', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_hab', [inmuebleHab], [contratoHabitacion], [], [], [], rango, undefined);
    expect(informe!.contratos[0].modalidad).toBe('habitaciones');
    expect(informe!.contratos[0].habitacionId).toBe('HAB_1');
  });

  it('Contratos - finalizado', () => {
    const rango = crearRangoAnual(2023);
    const informe = generarInformeInmueble('inm_2', [inmueble2], [contratoFinalizado], [], [], [], rango, undefined);
    expect(informe!.contratos[0].estado).toBe('FINALIZADO');
  });

  it('Contratos - rescindido', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1], [contratoRescindido], [], [], [], rango, undefined);
    expect(informe!.contratos[0].estado).toBe('CANCELADO');
  });

  it('Contratos - próximo finalizar', () => {
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
    expect(informe!.contratos[0].esProximoFinalizar).toBe(true);
  });
});

// ---------- FISCAL ----------

describe('GAP3 · fiscal', () => {
  it('Fiscal - agrupación ejercicio categorías ingresos gastos resultado', () => {
    const rango = crearRangoAnual(2024);
    const fiscal = generarInformeFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    expect(fiscal.ejercicio).toBe(2024);
    expect(fiscal.totalIngresos).toBeGreaterThanOrEqual(0);
    expect(fiscal.totalGastos).toBeGreaterThanOrEqual(0);
    expect(fiscal.categoriasFiscalesConservadas).toBe(true);
    expect(fiscal.notaAEAT).toContain('Exportación fiscal estructurada');
  });
});

// ---------- EXPORTACIÓN ----------

describe('GAP3 · exportación fiscal', () => {
  it('Exportación - CSV válido', () => {
    const rango = crearRangoAnual(2024);
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined, 'CSV');
    const csv = exportarCSV(exp);
    expect(csv).toContain('propietarioId,inmuebleId');
    expect(csv).toContain('inm_1');
    expect(csv.split('\n').length).toBeGreaterThanOrEqual(2);
  });

  it('Exportación - JSON válido', () => {
    const rango = crearRangoAnual(2024);
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined, 'JSON');
    const parsed = JSON.parse(exportarJSON(exp));
    expect(parsed.items.length).toBeGreaterThan(0);
    expect(parsed.items[0].propietarioId).toBe(propietarioA);
  });

  it('Exportación - campos obligatorios', () => {
    const rango = crearRangoAnual(2024);
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    const item = exp.items[0];
    expect(item.propietarioId).toBeTruthy();
    expect(item.inmuebleId).toBeTruthy();
    expect(item.ejercicio).toBeTruthy();
    expect(item.periodo).toBeTruthy();
    expect(item.concepto).toBeTruthy();
    expect(item.fecha).toBeTruthy();
    expect(item.importe).not.toBeUndefined();
    expect(item.categoria).toBeTruthy();
    expect(item.referenciaId).toBeTruthy();
    expect(item.origen).toBeTruthy();
  });

  it('Exportación - importes fechas referencias', () => {
    const rango = crearRangoAnual(2024);
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    expect(exp.totalIngresos).toBe(1000);
    expect(exp.totalGastos).toBe(300);
    expect(exp.items.every((i) => !isNaN(new Date(i.fecha).getTime()))).toBe(true);
  });
});

// ---------- SEGURIDAD ----------

describe('GAP3 · seguridad / RBAC', () => {
  it('Seguridad - A no ve B', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1, inmuebleB], [], [], [], [], [], [], rango, userPropA);
    expect(informe!.patrimonio.numeroInmuebles).toBe(1);
  });

  it('Seguridad - inmueble A no en B', () => {
    const rango = crearRangoAnual(2024);
    expect(() =>
      generarInformeInmueble('inm_B', [inmuebleB], [], [], [], [], rango, userPropA)
    ).toThrowError(/Acceso denegado/);
  });

  it('Seguridad - export RBAC', () => {
    const rango = crearRangoAnual(2024);
    expect(() =>
      generarExportacionFiscal(propietarioB, [inmuebleB], [], [], rango, userPropA, 'CSV')
    ).toThrowError(/Acceso denegado|manipulado/);
  });

  it('Seguridad - manipulación IDs rechazada', () => {
    const valid = validarFiltrosNoApropiacion({ propietarioId: propietarioB, rango: crearRangoAnual(2024) }, userPropA);
    expect(valid.valido).toBe(false);
  });

  it('Seguridad - profesional no autorizado', () => {
    const valid = validarFiltrosNoApropiacion({ propietarioId: propietarioA, rango: crearRangoAnual(2024) }, userProf);
    expect(valid.valido).toBe(false);
  });

  it('Seguridad - canAccessInformeCartera', () => {
    expect(canAccessInformeCartera(propietarioA, userPropA)).toBe(true);
    expect(canAccessInformeCartera(propietarioB, userPropA)).toBe(false);
  });

  it('Seguridad - canAccessInmueble', () => {
    expect(canAccessInmueble(inmueble1, userPropA)).toBe(true);
    expect(canAccessInmueble(inmuebleB, userPropA)).toBe(false);
  });
});

// ---------- PDF ----------

describe('GAP3 · PDF (contenido)', () => {
  it('PDF - generación correcta contenido mínimo', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1], [contratoActivo], [gasto1], [], [], [], [], rango, undefined)!;
    const contenido = generarContenidoPdfCartera(informe);
    const valid = validarPdfContenido(contenido);
    expect(valid.valido).toBe(true);
    expect(contenido.secciones.length).toBeGreaterThanOrEqual(3);
  });

  it('PDF - sin datos ajenos', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeCartera(propietarioA, [inmueble1], [], [], [], [], [], [], rango, userPropA)!;
    const contenido = generarContenidoPdfCartera(informe);
    const texto = JSON.stringify(contenido);
    expect(texto).not.toContain(propietarioB);
    expect(texto).not.toContain('inm_B');
  });

  it('PDF - inmueble individual sin otros propietarios', () => {
    const rango = crearRangoAnual(2024);
    const informe = generarInformeInmueble('inm_1', [inmueble1, inmuebleB], [contratoActivo], [gasto1], [], [], rango, undefined)!;
    const contenido = generarContenidoPdfInmueble(informe);
    expect(JSON.stringify(contenido)).not.toContain('inm_B');
  });

  it('PDF - fiscal resumen estructurado legible', () => {
    const rango = crearRangoAnual(2024);
    const fiscal = generarInformeFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    const contenido = generarContenidoPdfFiscal(fiscal);
    expect(contenido.secciones.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------- NO DUPLICACIÓN ----------

describe('GAP3 · no duplicación', () => {
  it('No duplicación - renta no doble', () => {
    const contratoDuplicado: ContratoFormalizacion = {
      ...contratoActivo,
      id: 'cont_dup',
      registroCobros: [
        { id: 'cob_dup_1', contratoId: 'cont_act', periodoMesAnio: '2024-01', anio: 2024, mes: 1 } as any,
        { id: 'cob_dup_2', contratoId: 'cont_act', periodoMesAnio: '2024-01', anio: 2024, mes: 1 } as any,
      ],
    } as any;
    const res = validarNoDuplicacion([inmueble1], [contratoDuplicado], []);
    expect(res.valido).toBe(false);
  });

  it('No duplicación - habitación no duplica inmueble completo', () => {
    const res = validarNoDuplicacion([inmuebleHab], [contratoActivo, contratoHabitacion], []);
    // contratoActivo es de inm_1 (otro inmueble): no aplica a inm_hab…
    expect(res).toHaveProperty('valido');
    // …pero sí aplica el solapamiento completo vs habitaciones en el mismo inmueble.
    const contratoCompletoHab: ContratoFormalizacion = {
      ...contratoActivo,
      id: 'cont_comp_hab',
      inmuebleId: 'inm_hab',
      modalidadAlquiler: 'completo',
    } as any;
    const res2 = validarNoDuplicacion([inmuebleHab], [contratoCompletoHab, contratoHabitacion], []);
    expect(res2.valido).toBe(false);
  });

  it('No duplicación - gasto no doble', () => {
    const res = validarNoDuplicacion([inmueble1], [], [gasto1, gasto1]);
    expect(res.valido).toBe(false);
  });

  it('No duplicación - periodo no doble (merge)', () => {
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
    expect(informe.ocupacion.diasAlquilados).toBeLessThanOrEqual(365);
  });
});

// ---------- RENTABILIDAD / EVOLUCIÓN ----------

describe('GAP3 · rentabilidad y evolución', () => {
  it('Rentabilidad - agregador reutiliza definición existente', () => {
    const rango = crearRangoAnual(2024);
    const rent = generarInformeRentabilidad(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    expect(rent.formula).toBeTruthy();
    expect(rent.ingresos).toBe(1000);
  });

  it('Evolución - mensual/trimestral/anual con fechas explícitas', () => {
    const rangoMensual = crearRangoMensual(2024, 1);
    const informeMensual = generarInformeCartera(propietarioA, [inmueble1], [contratoActivo], [gasto1], [], [], [], [], rangoMensual, undefined)!;
    expect(informeMensual.evolucion.length).toBeGreaterThanOrEqual(1);
    expect(informeMensual.evolucion[0].fechaInicio).toBeTruthy();
    expect(informeMensual.evolucion[0].fechaFin).toBeTruthy();

    const rangoAnual = crearRangoAnual(2024);
    const informeAnual = generarInformeCartera(propietarioA, [inmueble1], [contratoActivo], [gasto1], [], [], [], [], rangoAnual, undefined)!;
    expect(informeAnual.evolucion.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------- SOLO LECTURA (invariante documentado de GAP3) ----------

describe('GAP3 · solo lectura (invariante)', () => {
  it('los informes no mutan las entradas (cobros, gastos y contratos quedan intactos)', () => {
    const rango = crearRangoAnual(2024);
    const inm = deepFreeze(inmueble1);
    const cont = deepFreeze(contratoActivo);
    const gas = deepFreeze(gasto1);
    const user = deepFreeze(userPropA);
    const snapshot = JSON.stringify({ inm, cont, gas });

    // Si el motor escribiera en las entradas, Object.freeze lanzaría.
    expect(() => generarInformeCartera(propietarioA, [inm], [cont], [gas], [], [], [], [], rango, user)).not.toThrow();
    expect(() => generarInformeInmueble('inm_1', [inm], [cont], [gas], [], [], rango, user)).not.toThrow();
    expect(() => generarInformeFiscal(propietarioA, [inm], [cont], [gas], rango, user)).not.toThrow();
    expect(() => generarExportacionFiscal(propietarioA, [inm], [cont], [gas], rango, user, 'JSON')).not.toThrow();

    // Ni una sola mutación: snapshot byte a byte (capturado antes de generar).
    expect(JSON.stringify({ inm, cont, gas })).toBe(snapshot);
    expect(cont.registroCobros).toHaveLength(2);
    expect(cont.registroCobros[0].importeRecibido).toBe(1000);
  });

  it('la exportación derivada no altera la fuente ni duplica apuntes', () => {
    const rango = crearRangoAnual(2024);
    const antes = JSON.stringify({ contratos: [contratoActivo], gastos: [gasto1] });
    const exp = generarExportacionFiscal(propietarioA, [inmueble1], [contratoActivo], [gasto1], rango, undefined);
    const csv = exportarCSV(exp);
    const json = JSON.parse(exportarJSON(exp));
    // La fuente no cambia tras exportar.
    expect(JSON.stringify({ contratos: [contratoActivo], gastos: [gasto1] })).toBe(antes);
    // Exportación coherente: el mismo set de items en CSV y JSON.
    expect(json.items.length).toBeGreaterThan(0);
    expect(csv.split('\n').length).toBe(json.items.length + 1); // header + items
  });
});
