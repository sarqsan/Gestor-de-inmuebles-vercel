/**
 * FASE F — Tests del núcleo del paquete contable del asesor.
 * Fixtures sintéticas; módulo puro (sin Firebase, sin red, sin reloj).
 * Criterios trazados desde docs/PLAN-CAPACIDADES-DECISIONES-2026-10-16.md §5F:
 * multi-entidad en un ZIP · FACTURA/LIQUIDACIÓN/PÓLIZA · contratos vigentes
 * en el ejercicio · libro por fecha · índice con hashes · cuadre de totales.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ContratoFormalizacion, Gasto, Inmueble, PolizaSeguro,
} from '../../types';
import type { Factura } from '../../types/facturacion';
import type { LiquidacionPropietario } from '../../tesoreria/tipos';
import { sha256Hex } from '../importacion/hash';
import {
  contratoVigenteEnEjercicios,
  empaquetarPaqueteAsesor,
  esFechaIsoValida,
  filasACsv,
  generarPaqueteAsesor,
  libroACsv,
  validarAmbitoPaquete,
} from './motor';
import type { AmbitoAutorizado, EntradaPaqueteAsesor } from './tipos';

const GENERADO_EN = '2026-10-18T08:00:00.000Z';
const IBAN_SECRETO = 'ES9121000418450200051332';
const DNI_SECRETO = '12345678Z';

const AUT_P1: AmbitoAutorizado = {
  propietarioIdsLegibles: ['p1'], propietarioIdsEscribibles: ['p1'], esMaster: false,
};
const AUT_MASTER: AmbitoAutorizado = {
  propietarioIdsLegibles: null, propietarioIdsEscribibles: null, esMaster: true,
};

const inmuebles = [
  { id: 'i1', direccion: 'Calle Mayor 1', ciudad: 'Alicante', propietarioId: 'p1', referenciaCatastral: 'REF1', estado: 'alquilado' },
  { id: 'i2', direccion: 'Calle Sol 2', ciudad: 'Madrid', propietarioId: 'p1', estado: 'disponible' },
  { id: 'i9', direccion: 'Ajena 9', ciudad: 'Valencia', propietarioId: 'p2', estado: 'alquilado' },
] as unknown as Inmueble[];

function cobro(over: Record<string, unknown>) {
  return {
    id: 'cob_x', contratoId: 'c1', inmuebleId: 'i1', propietarioId: 'p1',
    inquilinoId: 'inq1', inquilinoNombre: 'Laura Inquilina', inquilinoDni: DNI_SECRETO,
    mes: 1, anio: 2024, periodoMesAnio: '2024-01', nombreMes: 'Enero 2024',
    importePrevisto: 600, importeRecibido: 600,
    fechaVencimiento: '2024-01-05', fechaPago: '2024-01-03', estado: 'RECIBIDO',
    metodoPago: 'transferencia',
    ...over,
  };
}

const contratos = [
  {
    id: 'c1', inmuebleId: 'i1', propietarioId: 'p1', candidatoId: 'cand1',
    candidatoNombre: 'Laura Inquilina', candidatoDni: DNI_SECRETO,
    propietarioIban: IBAN_SECRETO,
    fechaInicioContrato: '2023-06-01', fechaFinContrato: '2025-05-31',
    rentaMensual: 600, estado: 'FIRMADO', inmuebleDireccion: 'Calle Mayor 1',
    registroCobros: [
      cobro({ id: 'cob1' }),
      cobro({ id: 'cob2', mes: 2, periodoMesAnio: '2024-02', nombreMes: 'Febrero 2024', estado: 'IMPAGADO', importeRecibido: 0, fechaVencimiento: '2024-02-05', fechaPago: undefined }),
      cobro({ id: 'cob3', mes: 1, anio: 2025, periodoMesAnio: '2025-01', nombreMes: 'Enero 2025', importePrevisto: 615, importeRecibido: 615, fechaVencimiento: '2025-01-05', fechaPago: '2025-01-04' }),
      cobro({ id: 'cob4', mes: 3, periodoMesAnio: '2024-03', nombreMes: 'Marzo 2024', estado: 'ANULADO' }),
    ],
  },
  {
    id: 'c2', inmuebleId: 'i2', propietarioId: 'p1', candidatoId: 'cand2',
    candidatoNombre: 'Contrato corto', fechaInicioContrato: '2022-01-01',
    fechaFinContrato: '2022-12-31', rentaMensual: 400, estado: 'FINALIZADO',
    inmuebleDireccion: 'Calle Sol 2', registroCobros: [],
  },
  {
    id: 'c9', inmuebleId: 'i9', propietarioId: 'p2', candidatoId: 'cand9',
    candidatoNombre: 'Ajena', fechaInicioContrato: '2024-01-01',
    rentaMensual: 999, estado: 'FIRMADO', registroCobros: [
      cobro({ id: 'cob9', contratoId: 'c9', inmuebleId: 'i9', propietarioId: 'p2', importePrevisto: 999, importeRecibido: 999 }),
    ],
  },
] as unknown as ContratoFormalizacion[];

function gasto(over: Record<string, unknown>): Gasto {
  return {
    id: 'g_x', inmuebleId: 'i1', propietarioId: 'p1', tipo: 'EXPLOTACION',
    categoria: 'OTRO', concepto: 'Concepto', proveedor: 'Proveedor SA',
    importe: 10, estado: 'PAGADO', aCargoDe: 'arrendador',
    fechaDevengo: '2024-06-01', ejercicioFiscal: 2024,
    createdAt: '2024-06-01T00:00:00Z', updatedAt: '2024-06-01T00:00:00Z',
    ...over,
  } as unknown as Gasto;
}

const gastos: Gasto[] = [
  gasto({ id: 'g1', categoria: 'IBI', concepto: 'IBI 2024', importe: 300.10, documento: { id: 'docg1', nombre: 'Recibo IBI.pdf', url: '', storagePath: 'x' } }),
  gasto({ id: 'g2', categoria: 'REPARACION', concepto: 'Fontanería, cocina', importe: 121, fechaDevengo: '2024-07-10', facturaId: 'fac1' }),
  gasto({ id: 'g3', categoria: 'CUOTA_HIPOTECARIA', tipo: 'FINANCIACION', concepto: 'Cuota hipoteca', importe: 450, fechaDevengo: '2024-06-05' }),
  gasto({ id: 'g4', categoria: 'COMUNIDAD', concepto: 'Comunidad 2025', importe: 50, fechaDevengo: '2025-01-10', ejercicioFiscal: 2025 }),
  gasto({ id: 'g5', concepto: 'Anulado', estado: 'ANULADO', importe: 77 }),
  gasto({ id: 'g6', concepto: 'Ajeno', propietarioId: 'p2', inmuebleId: 'i9', importe: 888 }),
  gasto({ id: 'g7', concepto: 'Sin fecha', fechaDevengo: undefined, fechaPago: undefined, fecha: undefined, ejercicioFiscal: 2024, importe: 20 }),
  gasto({ id: 'g8', concepto: 'No deducible explícito', categoria: 'IBI', deducible: false, importe: 10, fechaDevengo: '2024-06-02' }),
];

const facturas = [
  {
    id: 'fac1', propietarioId: 'p1', inmuebleId: 'i1', gastoId: 'g2',
    clase: 'RECIBIDA', tipo: 'F1', serie: 'REC', numero: 7, ejercicio: 2024,
    fechaExpedicion: '10-07-2024', emisor: { nombre: 'Fontanería SL', nif: 'B12345678' },
    receptor: { nombre: 'Propietaria Uno', nif: '11111111A' },
    baseImponible: 100, cuotaIva: 21, cuotaRetencion: 0, importeTotal: 121, estado: 'ACEPTADA',
  },
  {
    id: 'fac2', propietarioId: 'p1', inmuebleId: 'i1',
    clase: 'EMITIDA', tipo: 'F1', serie: 'ALQ', numero: 1,
    // sin `ejercicio`: debe derivarse de fechaExpedicion dd-mm-aaaa
    fechaExpedicion: '03-01-2025', emisor: { nombre: 'Propietaria Uno', nif: '11111111A' },
    receptor: { nombre: 'Laura Inquilina', nif: '22222222B' },
    baseImponible: 615, cuotaIva: 0, importeTotal: 615, estado: 'EMITIDA',
  },
  {
    id: 'fac9', propietarioId: 'p2', inmuebleId: 'i9', clase: 'RECIBIDA', tipo: 'F1',
    serie: 'REC', numero: 9, ejercicio: 2024, fechaExpedicion: '01-06-2024',
    emisor: { nombre: 'Ajena SL', nif: 'B999' }, baseImponible: 1, cuotaIva: 0,
    importeTotal: 1, estado: 'ACEPTADA',
  },
] as unknown as Factura[];

const liquidaciones = [
  {
    id: 'liq1', propietarioId: 'p1', propietarioNombre: 'Propietaria Uno',
    periodo: '2024-01', anio: 2024, mes: 1, inmuebleIds: ['i1'],
    totalBrutoCobrado: 600, totalHonorarios: 0, totalIvaHonorarios: 0,
    totalGastos: 0, totalRetenciones: 0, totalAjustes: 0, totalDeducciones: 0,
    netoPropietario: 600, estado: 'PAGADA', fechaGeneracion: '2024-02-01T00:00:00Z',
    fechaPago: '2024-02-03', cuentaAbonoIban: IBAN_SECRETO,
  },
] as unknown as LiquidacionPropietario[];

const polizas = [
  {
    id: 'pol1', propietarioId: 'p1', inmuebleId: 'i1', aseguradora: 'Seguros X',
    numeroPoliza: 'PX-1', tipo: 'HOGAR', fechaInicio: '2024-01-01',
    fechaVencimiento: '2024-12-31', estado: 'ACTIVA', primaAnual: 240,
  },
  {
    id: 'pol2', propietarioId: 'p1', inmuebleId: 'i1', aseguradora: 'Seguros X',
    numeroPoliza: 'PX-2', tipo: 'HOGAR', fechaInicio: '2020-01-01',
    fechaVencimiento: '2020-12-31', estado: 'VENCIDA', primaAnual: 200,
  },
] as unknown as PolizaSeguro[];

const entrada: EntradaPaqueteAsesor = { inmuebles, contratos, gastos, facturas, liquidaciones, polizas };

function generar2024() {
  return generarPaqueteAsesor(
    entrada,
    { propietarioIds: ['p1'], ejercicios: [2024] },
    AUT_P1,
    { generatedAt: GENERADO_EN, generatedBy: 'test-actor' },
  );
}

describe('Fase F · fechas y vigencia de contratos', () => {
  it('esFechaIsoValida rechaza fechas imposibles y formatos ajenos', () => {
    expect(esFechaIsoValida('2024-02-29')).toBe(true); // bisiesto
    expect(esFechaIsoValida('2024-02-31')).toBe(false);
    expect(esFechaIsoValida('29-02-2024')).toBe(false);
    expect(esFechaIsoValida('2024/02/29')).toBe(false);
    expect(esFechaIsoValida(20240229)).toBe(false);
    expect(esFechaIsoValida(undefined)).toBe(false);
  });

  it('vigencia por solape: bordes inclusivos y fin abierto', () => {
    const c = (fi: string, ff?: string) =>
      ({ fechaInicioContrato: fi, fechaFinContrato: ff } as ContratoFormalizacion);
    expect(contratoVigenteEnEjercicios(c('2023-01-01', '2024-01-01'), [2024])).toBe(true);
    expect(contratoVigenteEnEjercicios(c('2022-01-01', '2023-12-31'), [2024])).toBe(false);
    expect(contratoVigenteEnEjercicios(c('2024-12-31'), [2024])).toBe(true);
    expect(contratoVigenteEnEjercicios(c('2025-01-01'), [2024])).toBe(false);
    expect(contratoVigenteEnEjercicios(c('2020-01-01'), [2024, 2025])).toBe(true); // abierto
    expect(contratoVigenteEnEjercicios(c(''), [2024])).toBe(false); // sin acreditar
    expect(contratoVigenteEnEjercicios(c('2024-01-01'), [])).toBe(true); // sin filtro
  });
});

describe('Fase F · ámbito fail-closed', () => {
  it('deniega propietario fuera de lo legible e inmueble desconocido/ajeno', () => {
    expect(validarAmbitoPaquete({ propietarioIds: ['p2'] }, AUT_P1, inmuebles).ok).toBe(false);
    expect(validarAmbitoPaquete(
      { propietarioIds: ['p1'], inmuebleIds: ['nope'] }, AUT_P1, inmuebles,
    ).ok).toBe(false);
    expect(validarAmbitoPaquete(
      { propietarioIds: ['p1'], inmuebleIds: ['i9'] }, AUT_P1, inmuebles,
    ).ok).toBe(false);
  });

  it('master debe declarar propietarios (sin volcado global implícito)', () => {
    expect(validarAmbitoPaquete({ propietarioIds: [] }, AUT_MASTER, inmuebles).ok).toBe(false);
    expect(validarAmbitoPaquete({ propietarioIds: ['p1'] }, AUT_MASTER, inmuebles).ok).toBe(true);
  });

  it('sin propietarios = todos los legibles (no master); ejercicios inválidos deniegan', () => {
    const v = validarAmbitoPaquete({ propietarioIds: [] }, AUT_P1, inmuebles);
    expect(v.ok).toBe(true);
    expect(v.propietariosEfectivos).toEqual(['p1']);
    const malo = validarAmbitoPaquete(
      { propietarioIds: ['p1'], ejercicios: [2024, 2024] }, AUT_P1, inmuebles,
    );
    expect(malo.ok).toBe(false);
  });

  it('generar con ámbito inválido lanza y sin generatedAt también', () => {
    expect(() => generarPaqueteAsesor(
      entrada, { propietarioIds: ['p2'] }, AUT_P1, { generatedAt: GENERADO_EN },
    )).toThrow(/denegado/);
    expect(() => generarPaqueteAsesor(
      entrada, { propietarioIds: ['p1'] }, AUT_P1, { generatedAt: '' },
    )).toThrow(/generatedAt/);
  });
});

describe('Fase F · contenido multi-entidad y aislamiento', () => {
  const paquete = generar2024();

  it('solo incluye el ámbito p1/2024 (nunca datos de p2)', () => {
    expect(paquete.filas.inmuebles.map((r) => r['id']).sort()).toEqual(['i1', 'i2']);
    expect(paquete.filas.contratos.map((r) => r['id'])).toEqual(['c1']); // c2 no vigente
    expect(paquete.filas.cobros.map((r) => r['id']).sort()).toEqual(['cob1', 'cob2', 'cob4']); // sin cob3 (2025)
    expect(paquete.filas.facturas.map((r) => r['id'])).toEqual(['fac1']); // fac2 es 2025, fac9 ajena
    expect(paquete.filas.polizas.map((r) => r['id'])).toEqual(['pol1']);
    expect(paquete.filas.liquidaciones.map((r) => r['id'])).toEqual(['liq1']);
    const todo = JSON.stringify(paquete);
    expect(todo).not.toContain('cob9');
    expect(todo).not.toContain('fac9');
  });

  it('minimización: el ZIP no contiene IBAN ni DNI de inquilino', () => {
    const { zip } = empaquetarPaqueteAsesor(paquete);
    const textoZip = new TextDecoder('utf-8', { fatal: false }).decode(zip);
    expect(textoZip).not.toContain(IBAN_SECRETO);
    expect(textoZip).not.toContain(DNI_SECRETO);
  });

  it('factura sin ejercicio deriva el año de fechaExpedicion dd-mm-aaaa', () => {
    const p2025 = generarPaqueteAsesor(
      entrada, { propietarioIds: ['p1'], ejercicios: [2025] }, AUT_P1, { generatedAt: GENERADO_EN },
    );
    expect(p2025.filas.facturas.map((r) => r['id'])).toEqual(['fac2']);
    expect(p2025.filas.contratos.map((r) => r['id'])).toEqual(['c1']); // vigente hasta 2025-05-31
    expect(p2025.filas.cobros.map((r) => r['id'])).toEqual(['cob3']);
  });

  it('sin ejercicios incluye todo el ámbito y lo avisa', () => {
    const todo = generarPaqueteAsesor(
      entrada, { propietarioIds: ['p1'] }, AUT_P1, { generatedAt: GENERADO_EN },
    );
    expect(todo.manifest.ejerciciosEfectivos).toBeNull();
    expect(todo.manifest.avisos.some((a) => a.includes('sin filtro temporal'))).toBe(true);
    expect(todo.filas.contratos.map((r) => r['id']).sort()).toEqual(['c1', 'c2']);
  });
});

describe('Fase F · libro de ingresos y gastos', () => {
  const paquete = generar2024();

  it('incluye cobro recibido; excluye impagado y anulado; gastos auditados', () => {
    const ingresos = paquete.libro.filter((l) => l.tipo === 'INGRESO');
    expect(ingresos.map((l) => l.fuenteId)).toEqual(['cob1']);
    expect(ingresos[0]).toMatchObject({
      fecha: '2024-01-03', total: 600, contraparte: 'Laura Inquilina',
      base: null, iva: null, deducible: null, desgloseFiscal: 'SIN_DESGLOSE_EN_ORIGEN',
    });
    const idsGasto = paquete.libro.filter((l) => l.tipo === 'GASTO').map((l) => l.fuenteId).sort();
    expect(idsGasto).toEqual(['g1', 'g2', 'g3', 'g8']); // g4=2025, g5 anulado, g7 sin fecha
    expect(paquete.incidencias.some((i) => i.codigo === 'COBRO_IMPAGADO' && i.id === 'cob2')).toBe(true);
    expect(paquete.incidencias.some((i) => i.codigo === 'GASTO_SIN_FECHA' && i.id === 'g7')).toBe(true);
  });

  it('deducibilidad reutiliza la fuente única (categoría / explícito / financiación)', () => {
    const porId = new Map(paquete.libro.map((l) => [l.fuenteId, l]));
    expect(porId.get('g1')).toMatchObject({ deducible: true, origenDeducibilidad: 'CATEGORIA' }); // IBI
    expect(porId.get('g3')).toMatchObject({ deducible: false, origenDeducibilidad: 'NO_INFERIBLE' }); // hipoteca
    expect(porId.get('g8')).toMatchObject({ deducible: false, origenDeducibilidad: 'DEDUCIBLE' }); // explícito false manda
  });

  it('base/IVA solo con factura vinculada; sin factura quedan null (no se inventan)', () => {
    const porId = new Map(paquete.libro.map((l) => [l.fuenteId, l]));
    expect(porId.get('g2')).toMatchObject({
      base: 100, iva: 21, retencion: 0, total: 121, desgloseFiscal: 'FACTURA_VINCULADA',
    });
    expect(porId.get('g1')).toMatchObject({
      base: null, iva: null, documentoNombre: 'Recibo IBI.pdf',
      desgloseFiscal: 'SIN_DESGLOSE_EN_ORIGEN',
    });
  });

  it('sin doble contabilidad: facturas y liquidaciones no son líneas del libro', () => {
    expect(paquete.libro.every((l) => l.fuenteTipo === 'COBRO' || l.fuenteTipo === 'GASTO')).toBe(true);
    expect(paquete.libro.some((l) => l.fuenteId === 'fac1')).toBe(false);
    expect(paquete.libro.some((l) => l.fuenteId === 'liq1')).toBe(false);
  });

  it('cuadre: verificaciones en verde y totales a céntimos', () => {
    expect(paquete.manifest.verificaciones.every((v) => v.ok)).toBe(true);
    // ingresos 600; gastos 300.10 + 121 + 450 + 10 = 881.10; deducibles g1+g2=421.10
    expect(paquete.manifest.totales.totalIngresos).toBe(600);
    expect(paquete.manifest.totales.totalGastos).toBe(881.1);
    expect(paquete.manifest.totales.totalGastosDeducibles).toBe(421.1);
    expect(paquete.manifest.totales.totalGastosNoDeducibles).toBe(460);
    expect(paquete.manifest.totales.resultado).toBe(-281.1);
    expect(paquete.manifest.totales.porEjercicio).toHaveLength(1);
    expect(paquete.manifest.totales.totalNetoLiquidacionesIncluidas).toBe(600);
  });

  it('el libro va ordenado por fecha (puerta del asesor)', () => {
    const fechas = paquete.libro.map((l) => l.fecha);
    expect([...fechas].sort()).toEqual(fechas);
    const csv = libroACsv(paquete.libro);
    expect(csv.split('\n')[0]).toContain('fecha,ejercicio,tipo,concepto');
    expect(csv).toContain('"Fontanería, cocina"'); // escape CSV con coma
  });
});

describe('Fase F · empaquetado ZIP determinista con hashes', () => {
  it('entradas esperadas, manifest con hash de cada entrada y ZIP reproducible', () => {
    const a = generar2024();
    const ea = empaquetarPaqueteAsesor(a);
    const rutas = ea.entradas.map((e) => e.ruta).sort();
    expect(rutas).toEqual([
      'datos/cobros.csv', 'datos/contratos.csv', 'datos/facturas.csv',
      'datos/gastos.csv', 'datos/inmuebles.csv', 'datos/liquidaciones.csv',
      'datos/polizas.csv', 'incidencias.json', 'informe.txt',
      'libro-ingresos-gastos.csv', 'manifest.json', 'totales.json',
    ].sort());
    for (const e of ea.entradas) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.bytes).toBeGreaterThan(0);
    }
    // El índice (manifest.json, STORE sin compresión) declara el hash de cada
    // entrada salvo de sí mismo (compromiso heredado del expediente B6).
    const textoZip = new TextDecoder('utf-8', { fatal: false }).decode(ea.zip);
    for (const e of ea.entradas.filter((x) => x.ruta !== 'manifest.json')) {
      expect(textoZip).toContain(e.sha256);
      expect(textoZip).toContain(e.ruta);
    }
    // Mismo input barajado + mismo generatedAt ⇒ mismo ZIP y mismo paqueteId.
    const barajada: EntradaPaqueteAsesor = {
      inmuebles: [...inmuebles].reverse(),
      contratos: [...contratos].reverse().map((c) => ({
        ...c, registroCobros: [...(c.registroCobros ?? [])].reverse(),
      })) as unknown as ContratoFormalizacion[],
      gastos: [...gastos].reverse(),
      facturas: [...facturas].reverse(),
      liquidaciones: [...liquidaciones].reverse(),
      polizas: [...polizas].reverse(),
    };
    const b = generarPaqueteAsesor(
      barajada, { propietarioIds: ['p1'], ejercicios: [2024] }, AUT_P1,
      { generatedAt: GENERADO_EN, generatedBy: 'test-actor' },
    );
    const eb = empaquetarPaqueteAsesor(b);
    expect(b.manifest.paqueteId).toBe(a.manifest.paqueteId);
    expect(sha256Hex(eb.zip)).toBe(sha256Hex(ea.zip));
    // generatedAt distinto: mismo contenido (paqueteId), ZIP distinto (manifest).
    const ctro = generarPaqueteAsesor(
      entrada, { propietarioIds: ['p1'], ejercicios: [2024] }, AUT_P1,
      { generatedAt: '2026-10-19T08:00:00.000Z', generatedBy: 'test-actor' },
    );
    expect(ctro.manifest.paqueteId).toBe(a.manifest.paqueteId);
    expect(sha256Hex(empaquetarPaqueteAsesor(ctro).zip)).not.toBe(sha256Hex(ea.zip));
  });

  it('paquete vacío válido: libro vacío, cuadre 0 y advertencia', () => {
    const vacio = generarPaqueteAsesor(
      entrada, { propietarioIds: ['p1'], ejercicios: [1999] }, AUT_P1,
      { generatedAt: GENERADO_EN },
    );
    expect(vacio.libro).toEqual([]);
    expect(vacio.manifest.totales.resultado).toBe(0);
    expect(vacio.manifest.verificaciones.every((v) => v.ok)).toBe(true);
    expect(vacio.manifest.advertencias.some((a) => a.includes('no contiene líneas'))).toBe(true);
  });

  it('sin facturas aportadas lo declara (FACTURAS_NO_APORTADAS), no finge desglose', () => {
    const sinFac = generarPaqueteAsesor(
      { inmuebles, contratos, gastos },
      { propietarioIds: ['p1'], ejercicios: [2024] },
      AUT_P1, { generatedAt: GENERADO_EN },
    );
    expect(sinFac.incidencias.some((i) => i.codigo === 'FACTURAS_NO_APORTADAS')).toBe(true);
    expect(sinFac.libro.find((l) => l.fuenteId === 'g2')).toMatchObject({
      base: null, iva: null, desgloseFiscal: 'SIN_DESGLOSE_EN_ORIGEN',
    });
    expect(sinFac.incidencias.some((i) => i.codigo === 'GASTO_FACTURA_NO_EN_PAQUETE')).toBe(true);
  });
});

describe('Fase F · aislamiento del núcleo (guardia de frontera)', () => {
  it('el módulo no importa Firebase, red ni PSD2 y no usa reloj/aleatorio', () => {
    const dir = join(process.cwd(), 'src/lib/paqueteAsesor');
    const fuentes = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    expect(fuentes).not.toMatch(/from\s+['"][^'"]*firebase/);
    expect(fuentes).not.toMatch(/\bfetch\(|XMLHttpRequest/);
    expect(fuentes).not.toMatch(/Date\.now\(|Math\.random\(|new Date\(\)/);
  });

  it('filasACsv escapa comillas, saltos y formatea decimales a 2', () => {
    const csv = filasACsv(['a', 'b', 'c'], [
      { a: 'con "comillas"', b: 1.5, c: 'salto\naqui' },
      { a: 'entero', b: 2, c: null },
    ]);
    expect(csv).toContain('"con ""comillas""",1.50,"salto\naqui"');
    expect(csv).toContain('entero,2,');
  });
});
