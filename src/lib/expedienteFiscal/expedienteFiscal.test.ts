/**
 * B6.10 — Tests obligatorios del motor de expediente fiscal.
 * Fixtures sintéticas (no datos reales): el módulo es puro, sin Firebase.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ContratoFormalizacion, Gasto, Inmueble } from '../../types';
import { sha256Hex } from '../importacion/hash';
import { generarExpedienteFiscal, empaquetarExpediente, stringifyDeterminista } from './motor';
import type { AmbitoExportacion } from './tipos';

const GENERADO_EN = '2026-09-26T12:00:00.000Z';
const CTX = { actor: 'test-actor' };

const inmuebles = [
  { id: 'i1', direccion: 'Calle Mayor 1', ciudad: 'Alicante', propietarioId: 'p1' },
  { id: 'i2', direccion: 'Calle Sol 2', ciudad: 'Madrid', propietarioId: 'p2' },
] as unknown as Inmueble[];

function cobro(over: Record<string, unknown>) {
  return {
    id: 'cob_x', contratoId: 'c1', inmuebleId: 'i1', propietarioId: 'p1',
    inquilinoId: 'inq1', mes: 1, anio: 2024, periodoMesAnio: '2024-01',
    nombreMes: 'Enero 2024', importePrevisto: 500, importeRecibido: 500,
    fechaVencimiento: '2024-01-05', fechaPago: '2024-01-03', estado: 'COBRADO',
    ...over,
  };
}

const contratos = [
  {
    id: 'c1', inmuebleId: 'i1', propietarioId: 'p1',
    fechaInicioContrato: '2024-01-01', fechaFinContrato: null,
    registroCobros: [
      cobro({ id: 'cob1', justificante: { id: 'jus1', nombreArchivo: 'Justificante Enero.pdf', storagePath: 'cobros_justificantes/p1/cob1/j.pdf', fechaSubida: '2024-01-03' } }),
      cobro({ id: 'cob2', mes: 2, periodoMesAnio: '2024-02', nombreMes: 'Febrero 2024', estado: 'IMPAGADO', importeRecibido: 0, fechaVencimiento: '2024-02-05', fechaPago: undefined }),
      cobro({ id: 'cob3', mes: 1, anio: 2025, periodoMesAnio: '2025-01', nombreMes: 'Enero 2025', importePrevisto: 550, importeRecibido: 550, fechaVencimiento: '2025-01-05', fechaPago: '2025-01-04' }),
    ],
  },
] as unknown as ContratoFormalizacion[];

function gasto(over: Record<string, unknown>): Gasto {
  return {
    id: 'g_x', inmuebleId: 'i1', propietarioId: 'p1', tipo: 'EXPLOTACION',
    categoria: 'OTRO', concepto: 'Concepto', importe: 10, estado: 'PAGADO',
    aCargoDe: 'arrendador', fechaDevengo: '2024-06-01', createdAt: '2024-06-01T00:00:00Z',
    ...over,
  } as unknown as Gasto;
}

const gastos = [
  gasto({ id: 'g1', categoria: 'IBI', concepto: 'IBI 2024', importe: 100, documento: { id: 'docg1', nombre: 'Recibo IBI.pdf', url: '', storagePath: 'gastos_facturas/p1/g1/recibo.pdf' } }),
  gasto({ id: 'g2', categoria: 'COMUNIDAD', concepto: 'Comunidad enero', importe: 50, fechaDevengo: '2025-01-10', createdAt: '2025-01-10T00:00:00Z', origen: 'RECURRENTE', origenId: 'rec_1' }),
  gasto({ id: 'g3', categoria: 'SEGUROS', concepto: 'Seguro hogar', importe: 80, fechaDevengo: '2024-03-01', createdAt: '2024-03-01T00:00:00Z' }),
  // Duplicados de origen (mismo origen/concepto/importe, distinta fecha): se conservan.
  gasto({ id: 'g4a', categoria: 'SEGUROS', concepto: 'Seguro impago', importe: 354.78, fechaDevengo: '2024-07-07', createdAt: '2024-07-07T00:00:00Z', origen: 'SEGURO', origenId: 'seg_9' }),
  gasto({ id: 'g4b', categoria: 'SEGUROS', concepto: 'Seguro impago', importe: 354.78, fechaDevengo: '2024-08-07', createdAt: '2024-08-07T00:00:00Z', origen: 'SEGURO', origenId: 'seg_9' }),
  // Financiación con desgloses calculados (noAcumulable).
  gasto({ id: 'g5', tipo: 'FINANCIACION', categoria: 'CUOTA_HIPOTECARIA', concepto: 'Cuota hipoteca', importe: 300, intereses: 150, capitalAmortizado: 150, fechaDevengo: '2024-05-01', createdAt: '2024-05-01T00:00:00Z' }),
  // Patologías para validaciones.
  gasto({ id: 'g6', concepto: 'Sin fecha', fechaDevengo: undefined, fechaPago: undefined, fecha: undefined, createdAt: undefined }),
  gasto({ id: 'g7', concepto: 'Importe negativo', importe: -5 }),
  gasto({ id: 'g8', concepto: 'Categoría rara', categoria: 'CATEGORIA_INVENTADA' as never }),
  gasto({ id: 'g10', inmuebleId: '', concepto: 'Sin inmueble' }),
] as Gasto[];

const ambitoI1_2024: AmbitoExportacion = { seleccion: 'UN_INMUEBLE', inmuebleId: 'i1', periodo: { tipo: 'ANIO', anio: 2024 } };

async function gen(ambito: AmbitoExportacion, ctx = CTX) {
  return generarExpedienteFiscal({ inmuebles, contratos, gastos }, ambito, ctx, { generatedAt: GENERADO_EN });
}

describe('B6 — expediente fiscal', () => {
  it('1. inmueble + año: solo movimientos de ese inmueble/año', async () => {
    const exp = await gen(ambitoI1_2024);
    expect(exp.movimientos.length).toBeGreaterThan(0);
    expect(exp.movimientos.every((m) => m.inmuebleId === 'i1' && m.ejercicio === 2024)).toBe(true);
    expect(exp.resumenFiscal).toHaveLength(1);
    expect(exp.manifest.inmueblesIncluidos).toEqual([{ inmuebleId: 'i1', direccion: 'Calle Mayor 1' }]);
  });

  it('2. inmueble + rango: varios ejercicios', async () => {
    const exp = await gen({ seleccion: 'UN_INMUEBLE', inmuebleId: 'i1', periodo: { tipo: 'RANGO', desde: 2024, hasta: 2025 } });
    expect(exp.manifest.periodo.ejercicios).toEqual([2024, 2025]);
    expect(exp.movimientos.some((m) => m.ejercicio === 2025 && m.movimientoId === 'INGRESO:cob3')).toBe(true);
  });

  it('3. todos + año', async () => {
    const exp = await gen({ seleccion: 'TODOS', periodo: { tipo: 'ANIO', anio: 2024 } });
    expect(exp.manifest.inmueblesIncluidos.map((i) => i.inmuebleId)).toEqual(['i1', 'i2']);
    expect(exp.movimientos.every((m) => m.ejercicio === 2024)).toBe(true);
  });

  it('4. todos + rango', async () => {
    const exp = await gen({ seleccion: 'TODOS', periodo: { tipo: 'RANGO', desde: 2023, hasta: 2025 } });
    expect(exp.manifest.periodo.ejercicios).toEqual([2023, 2024, 2025]);
  });

  it('5. últimos 5 años determinista desde año de referencia explícito', async () => {
    const exp = await gen({ seleccion: 'UN_INMUEBLE', inmuebleId: 'i1', periodo: { tipo: 'ULTIMOS_5', anioReferencia: 2026 } });
    expect(exp.manifest.periodo.ejercicios).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it('6. ningún movimiento: exportación válida con advertencia', async () => {
    const exp = await gen({ seleccion: 'UN_INMUEBLE', inmuebleId: 'i2', periodo: { tipo: 'ANIO', anio: 2020 } });
    expect(exp.movimientos).toEqual([]);
    expect(exp.manifest.numMovimientos).toBe(0);
    expect(exp.manifest.advertencias.some((a) => a.includes('no contiene movimientos'))).toBe(true);
  });

  it('7. documento existente: DISPONIBLE + hash + entra en el ZIP', async () => {
    const exp = await gen(ambitoI1_2024);
    const bytes = new TextEncoder().encode('PDF-DE-PRUEBA');
    const emp = await empaquetarExpediente(exp, (d) => (d.documentoId === 'doc_docg1' ? bytes : undefined));
    const doc = exp.documentos.find((d) => d.documentoId === 'doc_docg1')!;
    expect(doc.estado).toBe('DISPONIBLE');
    expect(doc.hash).toBe(await sha256Hex(bytes));
    expect(emp.entradas.some((e) => e.ruta === doc.rutaLogica)).toBe(true);
  });

  it('8. documento pendiente: PENDIENTE + incidencia, no se inventa', async () => {
    const exp = await gen(ambitoI1_2024);
    const emp = await empaquetarExpediente(exp, () => undefined);
    const cobDoc = exp.documentos.find((d) => d.documentoId === 'doc_jus1')!;
    expect(cobDoc.estado).toBe('PENDIENTE');
    expect(cobDoc.hash).toBeUndefined();
    expect(exp.incidencias.some((i) => i.codigo === 'DOC_FALTANTE' && i.id === 'doc_jus1')).toBe(true);
    expect(emp.entradas.some((e) => e.ruta === cobDoc.rutaLogica)).toBe(false);
  });

  it('9. movimiento con origen: conserva origen y origenId', async () => {
    const exp = await gen({ seleccion: 'UN_INMUEBLE', inmuebleId: 'i1', periodo: { tipo: 'ANIO', anio: 2025 } });
    const m = exp.movimientos.find((x) => x.movimientoId === 'GASTO:g2')!;
    expect(m.origen).toBe('RECURRENTE');
    expect(m.origenId).toBe('rec_1');
  });

  it('10. movimiento sin origen: origen por defecto GASTO, origenId propio', async () => {
    const exp = await gen(ambitoI1_2024);
    const m = exp.movimientos.find((x) => x.movimientoId === 'GASTO:g3')!;
    expect(m.origen).toBe('GASTO');
    expect(m.origenId).toBe('g3');
  });

  it('11. duplicado conservado: dos movimientos + incidencia DUP_ORIGEN', async () => {
    const exp = await gen(ambitoI1_2024);
    expect(exp.movimientos.filter((m) => m.movimientoId === 'GASTO:g4a' || m.movimientoId === 'GASTO:g4b')).toHaveLength(2);
    expect(exp.incidencias.some((i) => i.codigo === 'DUP_ORIGEN' && i.id === 'g4b')).toBe(true);
  });

  it('12. incidencia fiscal: cobro IMPAGADO registrado y sin ingreso', async () => {
    const exp = await gen(ambitoI1_2024);
    expect(exp.incidencias.some((i) => i.codigo === 'INCIDENCIA_FISCAL' && i.id === 'cob2')).toBe(true);
    expect(exp.movimientos.some((m) => m.movimientoId === 'INGRESO:cob2')).toBe(false);
  });

  it('13. determinismo del manifest (mismo input ⇒ mismo exportId y hashes)', async () => {
    const a = await gen(ambitoI1_2024);
    const b = await gen(ambitoI1_2024);
    expect(a.manifest.exportId).toBe(b.manifest.exportId);
    const ea = await empaquetarExpediente(a, () => undefined);
    const eb = await empaquetarExpediente(b, () => undefined);
    expect(stringifyDeterminista({ ...a.manifest, hashes: ea.entradas })).toBe(stringifyDeterminista({ ...b.manifest, hashes: eb.entradas }));
    expect(ea.zip).toEqual(eb.zip);
  });

  it('14. determinismo de movimientos (orden de entrada irrelevante)', async () => {
    const original = await gen(ambitoI1_2024);
    const entradaBarajada = { inmuebles: [...inmuebles].reverse(), contratos, gastos: [...gastos].reverse() };
    const barajado = await generarExpedienteFiscal(entradaBarajada, ambitoI1_2024, CTX, { generatedAt: GENERADO_EN });
    expect(stringifyDeterminista(barajado.movimientos)).toBe(stringifyDeterminista(original.movimientos));
    expect(barajado.manifest.exportId).toBe(original.manifest.exportId);
  });

  it('15. hash documental = sha256 real del binario', async () => {
    const exp = await gen(ambitoI1_2024);
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await empaquetarExpediente(exp, (d) => (d.documentoId === 'doc_docg1' ? bytes : undefined));
    const doc = exp.documentos.find((d) => d.documentoId === 'doc_docg1')!;
    expect(doc.hash).toBe(await sha256Hex(bytes));
    const mov = exp.movimientos.find((m) => m.movimientoId === 'GASTO:g1')!;
    expect(mov.hashDocumento).toBe(doc.hash);
  });

  it('16. agregados NO generan movimientos; desgloses son noAcumulable', async () => {
    const exp = await gen(ambitoI1_2024);
    expect(exp.agregadosOrigen.registros).toEqual([]);
    expect(exp.movimientos.some((m) => /expenses|yearlyFinancials/i.test(m.origen) || /expenses|yearly/i.test(m.fuente))).toBe(false);
    const desgloses = exp.movimientos.filter((m) => m.tipo === 'INTERES' || m.tipo === 'AMORTIZACION');
    expect(desgloses).toHaveLength(2); // intereses 150 + capital 150 del gasto g5
    expect(desgloses.every((m) => m.noAcumulable === true && m.clasificacion === 'CALCULADO')).toBe(true);
    const acumulado = exp.movimientos.filter((m) => !m.noAcumulable && m.ejercicio === 2024);
    // g1(100) + g3(80) + g4a + g4b(354.78×2) + g5(300) + g8(10) + ingreso cob1(500)
    const total = acumulado.reduce((s, m) => s + (m.tipo === 'INGRESO' ? m.importe : -m.importe), 0);
    expect(Math.round(total * 100) / 100).toBe(500 - (100 + 80 + 354.78 + 354.78 + 300 + 10));
  });

  it('17. CERO dependencias de Firebase/Storage en el módulo (estático)', () => {
    const dir = join(__dirname);
    const ficheros = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'));
    expect(ficheros.length).toBeGreaterThanOrEqual(4);
    for (const f of ficheros) {
      const src = readFileSync(join(dir, f), 'utf-8');
      expect(src, `${f} no debe importar firebase`).not.toMatch(/from ['"]firebase|from ['"]@firebase|firebase-admin/);
    }
  });

  it('extra. validaciones: MOV_SIN_FECHA, IMPORTE_INVALIDO, CATEGORIA_DESCONOCIDA, MOV_SIN_INMUEBLE', async () => {
    const exp = await gen(ambitoI1_2024);
    const codigos = exp.incidencias.map((i) => `${i.codigo}:${i.id}`);
    expect(codigos).toContain('MOV_SIN_FECHA:g6');
    expect(codigos).toContain('IMPORTE_INVALIDO:g7');
    expect(codigos).toContain('CATEGORIA_DESCONOCIDA:g8');
    expect(codigos).toContain('MOV_SIN_INMUEBLE:g10');
    // g7 (negativo) no emite movimiento; g8 (categoría rara) SÍ se conserva.
    expect(exp.movimientos.some((m) => m.movimientoId === 'GASTO:g7')).toBe(false);
    expect(exp.movimientos.some((m) => m.movimientoId === 'GASTO:g8')).toBe(true);
  });

  it('extra. ZIP válido: magic PK y contiene manifest.json', async () => {
    const exp = await gen(ambitoI1_2024);
    const emp = await empaquetarExpediente(exp);
    expect(emp.zip[0]).toBe(0x50); // 'P'
    expect(emp.zip[1]).toBe(0x4b); // 'K'
    expect(emp.zip[2]).toBe(0x03);
    expect(emp.zip[3]).toBe(0x04);
    expect(emp.entradas.map((e) => e.ruta)).toContain('manifest.json');
    expect(emp.entradas.map((e) => e.ruta)).toContain('movimientos.csv');
    expect(emp.entradas.map((e) => e.ruta)).toContain('auditoria/procedencia.json');
  });
});
