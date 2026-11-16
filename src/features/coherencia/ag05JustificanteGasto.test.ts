/**
 * AG-05 · El justificante del gasto tiene DOS vías y cada módulo miraba una.
 *
 * Estas pruebas fijan el contrato del selector canónico y, sobre todo, los dos
 * defectos concretos que AG-05 describía:
 *
 *   1. `recopilarDocumentacionFiscal` usaba `gasto.fecha`, campo que NO existe
 *      en el modelo → `Invalid Date` y orden arbitrario.
 *   2. Un gasto con `justificanteUrl` (alta manual u OCR) se contaba como «sin
 *      justificante» y quedaba fuera del paquete del asesor.
 */
import { describe, expect, it } from 'vitest';

import {
  fechaCanonicaGasto,
  gastoTieneJustificante,
  justificanteDeGasto,
} from '../../utils/gastosEngine';
import { recopilarDocumentacionFiscal } from '../../utils/fiscalEngine';
import type { Gasto } from '../../types';
import type { GastosEjercicio, IngresosEjercicio } from '../../utils/fiscalEngine';

/** Gasto sintético mínimo. Sin datos reales. */
const gastoBase = (extra: Partial<Gasto> = {}): Gasto => ({
  id: 'g_1',
  inmuebleId: 'inm_1',
  propietarioId: 'prop_a',
  tipo: 'EXPLOTACION',
  categoria: 'REPARACION',
  concepto: 'Concepto sintético',
  importe: 100,
  estado: 'PAGADO',
  aCargoDe: 'arrendador',
  fechaDevengo: '2026-03-15',
  periodoMesAnio: '2026-03',
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  ...extra,
});

const gastosEjercicio = (gastos: Gasto[]): GastosEjercicio => ({
  ejercicio: 2026,
  total: gastos.reduce((n, g) => n + g.importe, 0),
  totalDeducible: 0,
  totalNoDeducible: 0,
  countTotal: gastos.length,
  countDeducible: 0,
  countNoDeducible: 0,
  gastos,
  porCategoria: {} as GastosEjercicio['porCategoria'],
  porCategoriaDeducible: {} as GastosEjercicio['porCategoriaDeducible'],
  porCategoriaNoDeducible: {} as GastosEjercicio['porCategoriaNoDeducible'],
  gastosConJustificante: 0,
  gastosSinJustificante: 0,
  gastosVinculadosOT: 0,
  gastosVinculadosSeguro: 0,
});

describe('AG-05 · selector canónico del justificante', () => {
  it('reconoce el justificante CUSTODIADO (documento)', () => {
    const g = gastoBase({
      documento: { id: 'doc1', nombre: 'factura.pdf', url: 'https://p.invalid/f.pdf', storagePath: 'gastos_facturas/prop_a/f.pdf' },
    });
    const j = justificanteDeGasto(g);
    expect(j).not.toBeNull();
    expect(j!.origen).toBe('CUSTODIA');
    expect(j!.noCustodiado).toBe(false);
    expect(j!.nombre).toBe('factura.pdf');
  });

  it('reconoce el justificante MANUAL (justificanteUrl) — el que antes se perdía', () => {
    const g = gastoBase({ justificanteUrl: 'https://privado.invalid/ticket.jpg' });
    const j = justificanteDeGasto(g);
    expect(j).not.toBeNull();
    expect(j!.origen).toBe('JUSTIFICANTE_MANUAL');
    expect(j!.noCustodiado).toBe(true); // no está en P3: hay que declararlo
  });

  it('reconoce el justificante por storagePath sin URL', () => {
    const j = justificanteDeGasto(gastoBase({ justificantePath: 'gastos_facturas/prop_a/x.pdf' }));
    expect(j).not.toBeNull();
    expect(j!.storagePath).toBe('gastos_facturas/prop_a/x.pdf');
    expect(j!.nombre).toBe('x.pdf');
  });

  it('da precedencia a la custodia: un gasto con ambas vías NO se cuenta dos veces', () => {
    const g = gastoBase({
      documento: { id: 'doc1', nombre: 'custodiada.pdf', url: 'https://p.invalid/a.pdf' },
      justificanteUrl: 'https://privado.invalid/b.jpg',
    });
    const j = justificanteDeGasto(g);
    expect(j!.origen).toBe('CUSTODIA');
    expect(j!.nombre).toBe('custodiada.pdf');
  });

  it('devuelve null si no hay ninguna vía', () => {
    expect(justificanteDeGasto(gastoBase())).toBeNull();
    expect(justificanteDeGasto(null)).toBeNull();
    expect(gastoTieneJustificante(gastoBase())).toBe(false);
  });

  it('no se inventa una URL cuando el documento solo tiene storagePath', () => {
    const j = justificanteDeGasto(gastoBase({ documento: { id: 'd', nombre: 'n', url: '', storagePath: 'p/x' } }));
    expect(j!.url).toBeUndefined();
    expect(j!.storagePath).toBe('p/x');
  });
});

describe('AG-05 · fecha canónica (el campo `gasto.fecha` no existe)', () => {
  it('usa fechaDevengo cuando existe', () => {
    expect(fechaCanonicaGasto(gastoBase())).toBe('2026-03-15');
  });

  it('cae a fechaPago si no hay devengo', () => {
    expect(fechaCanonicaGasto(gastoBase({ fechaDevengo: undefined, fechaPago: '2026-04-01' }))).toBe('2026-04-01');
  });

  it('cae al primer día del periodo si no hay ninguna fecha', () => {
    expect(fechaCanonicaGasto(gastoBase({ fechaDevengo: undefined, fechaPago: undefined }))).toBe('2026-03-01');
  });

  it('devuelve undefined si no hay ninguna referencia temporal', () => {
    expect(fechaCanonicaGasto(gastoBase({ fechaDevengo: undefined, fechaPago: undefined, periodoMesAnio: undefined }))).toBeUndefined();
  });
});

describe('AG-05 · documentación fiscal del ejercicio', () => {
  const ingresosVacios: IngresosEjercicio = { ejercicio: 2026, cobros: [] } as unknown as IngresosEjercicio;

  it('un gasto con justificante MANUAL entra en la documentación fiscal', () => {
    // ESTE era el defecto: antes no aparecía.
    const docs = recopilarDocumentacionFiscal(
      ingresosVacios,
      gastosEjercicio([gastoBase({ id: 'g_manual', justificanteUrl: 'https://privado.invalid/f.jpg' })]),
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].tipo).toBe('GASTO');
    expect(docs[0].referenciaId).toBe('g_manual');
  });

  it('la fecha es REAL y ordenable, no Invalid Date', () => {
    const docs = recopilarDocumentacionFiscal(
      ingresosVacios,
      gastosEjercicio([gastoBase({ justificanteUrl: 'https://privado.invalid/f.jpg' })]),
    );
    expect(docs[0].fecha).toBe('2026-03-15');
    expect(Number.isNaN(new Date(docs[0].fecha).getTime())).toBe(false);
  });

  it('ordena de más reciente a más antigua sin NaN', () => {
    const docs = recopilarDocumentacionFiscal(
      ingresosVacios,
      gastosEjercicio([
        gastoBase({ id: 'ene', fechaDevengo: '2026-01-10', justificanteUrl: 'https://p.invalid/a.jpg' }),
        gastoBase({ id: 'mar', fechaDevengo: '2026-03-20', justificanteUrl: 'https://p.invalid/b.jpg' }),
        gastoBase({ id: 'feb', fechaDevengo: '2026-02-05', justificanteUrl: 'https://p.invalid/c.jpg' }),
      ]),
    );
    expect(docs.map((d) => d.referenciaId)).toEqual(['mar', 'feb', 'ene']);
  });

  it('no duplica un gasto que ya está en custodia', () => {
    const docs = recopilarDocumentacionFiscal(
      ingresosVacios,
      gastosEjercicio([
        gastoBase({
          documento: { id: 'doc1', nombre: 'f.pdf', url: 'https://p.invalid/f.pdf' },
          justificanteUrl: 'https://privado.invalid/f.jpg',
        }),
      ]),
    );
    expect(docs).toHaveLength(1);
  });

  it('excluye los gastos anulados y los que no tienen justificante', () => {
    const docs = recopilarDocumentacionFiscal(
      ingresosVacios,
      gastosEjercicio([
        gastoBase({ id: 'anulado', estado: 'ANULADO', justificanteUrl: 'https://p.invalid/a.jpg' }),
        gastoBase({ id: 'sin_doc' }),
      ]),
    );
    expect(docs).toHaveLength(0);
  });

  it('un justificante custodiado sigue entrando igual que antes (sin regresión)', () => {
    const docs = recopilarDocumentacionFiscal(
      ingresosVacios,
      gastosEjercicio([
        gastoBase({ documento: { id: 'doc9', nombre: 'factura.pdf', url: 'https://p.invalid/f.pdf', storagePath: 'sp/f.pdf' } }),
      ]),
    );
    expect(docs).toHaveLength(1);
    expect(docs[0].nombreArchivo).toBe('factura.pdf');
    expect(docs[0].storagePath).toBe('sp/f.pdf');
  });
});

// ===========================================================================
// AG-05 · Paquete del asesor: los justificantes manuales se DECLARAN
// ===========================================================================
import { construirIndiceDocumentos } from '../../lib/paqueteAsesor/documentos';

const contextoVacio = {
  inmueblesEfectivos: new Set<string>(['inm_1']),
  propietariosEfectivos: new Set<string>(['prop_a']),
  registrosIncluidos: {},
  rango: null,
  ejercicios: [2026],
  meses: null,
  documentosPatrimoniales: [],
};

describe('AG-05 · paquete del asesor declara lo que no está custodiado', () => {
  it('sin gastos no se añade ningún aviso (compatibilidad)', () => {
    const r = construirIndiceDocumentos(contextoVacio);
    expect(r.avisos).toEqual([]);
  });

  it('un gasto con justificante manual genera un aviso explícito', () => {
    const r = construirIndiceDocumentos({
      ...contextoVacio,
      gastos: [gastoBase({ id: 'g_manual', justificanteUrl: 'https://privado.invalid/f.jpg' })],
    });
    expect(r.avisos.join(' ')).toContain('NO están custodiados');
    expect(r.avisos.join(' ')).toContain('g_manual');
  });

  it('un gasto custodiado NO genera aviso (se incluye por la vía P3)', () => {
    const r = construirIndiceDocumentos({
      ...contextoVacio,
      gastos: [gastoBase({
        documento: { id: 'd1', nombre: 'f.pdf', url: 'https://p.invalid/f.pdf', storagePath: 'sp/f.pdf' },
      })],
    });
    expect(r.avisos.join(' ')).not.toContain('NO están custodiados');
  });

  it('los gastos anulados no cuentan', () => {
    const r = construirIndiceDocumentos({
      ...contextoVacio,
      gastos: [gastoBase({ id: 'x', estado: 'ANULADO', justificanteUrl: 'https://p.invalid/f.jpg' })],
    });
    expect(r.avisos.join(' ')).not.toContain('NO están custodiados');
  });

  it('resume el recuento correcto cuando hay varios', () => {
    const r = construirIndiceDocumentos({
      ...contextoVacio,
      gastos: [
        gastoBase({ id: 'a', justificanteUrl: 'https://p.invalid/a.jpg' }),
        gastoBase({ id: 'b', justificanteUrl: 'https://p.invalid/b.jpg' }),
        gastoBase({ id: 'c' }),
      ],
    });
    expect(r.avisos.join(' ')).toContain('2 justificante(s)');
  });
});
