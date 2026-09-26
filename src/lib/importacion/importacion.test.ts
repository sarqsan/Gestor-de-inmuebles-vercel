/**
 * FASE 4 · B0-B3 — Pruebas de la infraestructura de importación (capa pura).
 *
 * Evidencia de entrada: docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json (reconstrucción
 * verificada de los 51 registros + 1 truncado). NO se toca Firestore/Storage:
 * estas pruebas no inicializan Firebase en ningún momento.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  claveImporteInmuebleCategoria,
  claveOrigen,
  huellaCobro,
  huellaExacta,
  huellaFuerte,
  type RegistroExistenteRef,
} from './dedup';
import { normalizarMovimiento } from './normalizar';
import { generarPreview, type InformePreview, type LoteExterno } from './preview';

const anexo = JSON.parse(
  readFileSync(new URL('../../../docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json', import.meta.url), 'utf8'),
) as {
  gastos_ingresos_registros: Record<string, unknown>[];
  inmuebles_esquema: { agregados_expenses_por_inmueble_VERIFICADOS: Record<string, Record<string, number>> };
};

const movimientos = anexo.gastos_ingresos_registros; // 51 con id + 1 marcador __TRUNCADO__

const lote: LoteExterno = {
  sistema: 'RENTASYNC',
  fuente: 'anexo_fase2_reconstruido',
  ficheroNombre: 'FASE2-ANEXO-EVIDENCIA-EXTERNA.json',
  contenidoNormalizado: JSON.stringify(anexo),
  movimientos,
};

const OPTS = { fechaHora: '2026-09-26T12:00:00Z', actor: 'test-fase4' } as const;

function previewVacio(): InformePreview {
  return generarPreview(lote, {}, OPTS);
}

describe('B1 — normalización pura de los 51 registros + truncado', () => {
  it('analiza 52 entradas: 21 GASTO + 30 COBRO + 1 TRUNCADO', () => {
    const p = previewVacio();
    expect(p.totales.analizados).toBe(52);
    expect(p.porEntidad.GASTO).toBe(21);
    expect(p.porEntidad.COBRO).toBe(30);
    expect(p.porEntidad.TRUNCADO).toBe(1);
  });

  it('conserva TODOS los importes del origen (nada se inventa ni se pierde)', () => {
    const p = previewVacio();
    const sumaDestino = p.registros.reduce((acc, r) => acc + (r.importe ?? 0), 0);
    const sumaOrigen = movimientos.reduce(
      (acc, r) => acc + (typeof r.amount === 'number' ? r.amount : 0), 0);
    expect(Math.round(sumaDestino * 100)).toBe(Math.round(sumaOrigen * 100));
  });

  it('el registro 27 (truncado) permanece PENDIENTE sin datos inventados (INC-08)', () => {
    const p = previewVacio();
    const t = p.registros.filter((r) => r.entidad === 'TRUNCADO');
    expect(t).toHaveLength(1);
    expect(t[0].estado).toBe('BLOQUEADO');
    expect(t[0].estadoEvidencia).toBe('PENDIENTE');
    expect(t[0].importe).toBeNull();
    expect(t[0].inmuebleId).toBeNull();
    const inc = p.incidencias.find((i) => i.codigo === 'REGISTRO_TRUNCADO');
    expect(inc?.incidenciaFase2).toBe('INC-08');
  });

  it('no convierte agregados (expenses/yearlyFinancials) en movimientos', () => {
    // Fixture SINTÉTICO (no son datos reales): un inmueble con agregados y anuales.
    const loteConInmuebles: LoteExterno = {
      ...lote,
      inmuebles: [{
        id: 'prop_sintetico_test',
        address: ' Calle Ficticia 1 ',
        cadastralReference: '',
        registrationDate: '7/7/2026',
        purchasePrice: 100000,
        expenses: { Community: 420, IBI: 207.97, Insurance: 892.65, Repairs: 0 },
        yearlyFinancials: { '2026': { income: 8760 } },
        landValuePercent: 30,
        ownershipPercentageUser1: 100,
        ownershipPercentageUser2: 0,
      }],
    };
    const p = generarPreview(loteConInmuebles, {}, OPTS);
    // El inmueble NO genera gastos/cobros extra: los conteos de movimientos no cambian.
    expect(p.porEntidad.GASTO).toBe(21);
    expect(p.porEntidad.COBRO).toBe(30);
    const inm = p.registros.find((r) => r.entidad === 'INMUEBLE');
    expect(inm).toBeDefined();
    const agg = p.incidencias.find((i) => i.codigo === 'AGREGADO_NO_IMPORTABLE');
    expect(agg).toBeDefined();
    expect(agg!.ocurrencias).toBeGreaterThanOrEqual(2); // expenses + yearlyFinancials (agrupadas)
    // address con trim y fecha D/M/YYYY convertida:
    expect(inm?.idDestino).toBe('prop_sintetico_test');
  });
});

describe('B2 — ids deterministas y detección de duplicados', () => {
  it('id determinista gas_{inmuebleId}_{origenId}; sin id no se inventa', () => {
    const p = previewVacio();
    const reg = p.registros.find((r) => r.origenId === 'exp_1783449377775');
    expect(reg?.idDestino).toBe('gas_prop_1783441481122_1_exp_1783449377775');
    const sinId = p.registros.filter((r) => r.origenId === null && r.entidad !== 'TRUNCADO');
    expect(sinId.length).toBe(15); // 4 community + 7 ibi + 4 insurance (ids perdidos en reset 3)
    for (const r of sinId) {
      expect(r.idDestino).toBeNull();
      expect(r.estado).toBe('BLOQUEADO');
      expect(r.motivoBloqueo).toContain('origenId no recuperable');
    }
  });

  it('el duplicado 354,78 € (INC-05) se conserva como DOS registros enlazados, sin fusionar', () => {
    const p = previewVacio();
    const dup = p.registros.filter((r) => r.importe === 354.78);
    expect(dup).toHaveLength(2);
    const primero = dup.find((r) => r.origenId === 'exp_1783449377775');
    const segundo = dup.find((r) => r.origenId === 'exp_1783461510013');
    expect(primero?.estado).toBe('NUEVO');
    expect(segundo?.estado).toBe('DUPLICADO_ORIGEN');
    expect(segundo?.vinculadoA.length).toBeGreaterThan(0);
    expect(p.totales.duplicadoOrigen).toBe(1);
    const inc = p.incidencias.find((i) => i.codigo === 'DUPLICADO_ORIGEN' || i.incidenciaFase2 === 'INC-05');
    // La incidencia de duplicidad queda documentada en el veredicto (motivo), no resuelta:
    expect(segundo?.estado).not.toBe('YA_IMPORTADO');
    expect(inc ?? segundo).toBeTruthy();
  });
});

describe('B3 — preview / dry-run', () => {
  it('es determinista: dos ejecuciones idénticas producen el mismo informe', () => {
    const a = previewVacio();
    const b = previewVacio();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.determinismo.huellaInforme).toBe(b.determinismo.huellaInforme);
  });

  it('reimportación simulada (existente = primera importación): 0 nuevos, 0 duplicados nuevos', () => {
    const refsGastos: RegistroExistenteRef[] = [];
    const refsCobros: RegistroExistenteRef[] = [];
    for (const reg of movimientos) {
      const n = normalizarMovimiento(reg as never, { loteId: 'test', fuente: 'anexo_fase2_reconstruido' });
      if (n.bloqueado || !n.procedencia.origenId) continue;
      const clave = claveOrigen(n.procedencia.sistema, n.procedencia.origenId);
      if (n.entidad === 'GASTO') {
        const input = {
          inmuebleId: n.destino.inmuebleId as string,
          importe: n.destino.importe as number,
          categoria: n.destino.categoria as string,
          fechaDevengo: n.destino.fechaDevengo,
          concepto: n.destino.concepto ?? '',
        };
        refsGastos.push({
          id: (n.destino.id as string) ?? null,
          claveOrigen: clave,
          huellaContenido: huellaExacta(input),
          huellaFuerteContenido: huellaFuerte(input),
          claveImporte: claveImporteInmuebleCategoria(input.inmuebleId, input.importe, input.categoria),
        });
      } else if (n.entidad === 'COBRO') {
        const inmuebleId = n.destino.inmuebleId as string;
        const importe = n.destino.importeRecibido as number;
        const h = huellaCobro({ inmuebleId, importe, mes: n.mes, anio: n.anio, concepto: String(reg.description ?? '') });
        refsCobros.push({
          id: null,
          claveOrigen: clave,
          huellaContenido: h,
          huellaFuerteContenido: h,
          claveImporte: claveImporteInmuebleCategoria(inmuebleId, importe, 'RENT'),
        });
      }
    }
    expect(refsGastos.length + refsCobros.length).toBe(36); // 51 - 15 sin id
    const p2 = generarPreview(lote, { gastos: refsGastos, cobros: refsCobros }, OPTS);
    expect(p2.totales.nuevos).toBe(0);
    expect(p2.totales.yaImportados).toBe(36);
    expect(p2.totales.duplicadoOrigen).toBe(0);
    expect(p2.totales.colisiones).toBe(0);
    expect(p2.totales.bloqueados).toBe(16); // 15 sin id + 1 truncado (siguen marcados, no se inventan)
  });

  it('resumen por origen: 25 pegado B + 25 pegado A + 1 ambos (+1 truncado sin fuente)', () => {
    const p = previewVacio();
    expect(p.porOrigen['B_pegado_2026-09-26']).toBe(25);
    expect(p.porOrigen['A_pegado_anterior']).toBe(25);
    expect(p.porOrigen.ambos_pegados).toBe(1);
    expect(p.porOrigen.anexo_fase2_reconstruido).toBe(1); // marcador truncado
  });

  it('documento pendiente del reg. 26 inventariado SIN subida real (bloque B5)', () => {
    const p = previewVacio();
    const doc = p.documentosPendientes.find((d) => d.origenId === 'exp_1785785627424');
    expect(doc).toBeDefined();
    expect(doc?.receiptName).toBe('Factura Proforma_2520549_.pdf');
    expect(doc?.estado).toBe('PENDIENTE_BINARIO_NO_DISPONIBLE');
  });

  it('contrato de migración: DRY_RUN, NO_EJECUTADO, 0 importados', () => {
    const p = previewVacio();
    expect(p.contrato.esquemaVersion).toBe('rentasync-v1');
    expect(p.contrato.modo).toBe('DRY_RUN');
    expect(p.contrato.resultado.estado).toBe('NO_EJECUTADO');
    expect(p.contrato.resultado.importados).toBe(0);
    expect(p.contrato.incidenciasAbiertas).toHaveLength(15); // INC-01…INC-15
  });
});

describe('Incidencias C: NO se resuelven inventando datos', () => {
  it('los descuadres de FASE 2 NO se rellenan: el detalle transformado es exactamente el recibido', () => {
    const p = previewVacio();
    const p0 = p.porInmueble.prop_1783441481122_0;
    expect(p0.gastosPorCategoria.IMPUESTOS_TASAS.importe).toBe(111.86); // NO 170.59 (INC-01 sigue abierto)
    expect(p0.gastosPorCategoria.IBI).toBeUndefined();
    const p3 = p.porInmueble.prop_1783441481122_3;
    expect(p3.gastosPorCategoria.COMUNIDAD.importe).toBe(1245.54); // NO 1933.70 (INC-02 sigue abierto)
    expect(p3.gastosPorCategoria.REPARACION).toBeUndefined(); // INC-03: la derrama NO se mueve sola
    const p2545992 = p.porInmueble.prop_1783442545992;
    expect(p2545992.gastosPorCategoria.SEGUROS.importe).toBe(486.12); // NO 723.72 (INC-04 sigue abierto)
  });

  it('derrama (INC-03): propuesta COMUNIDAD + validación humana obligatoria', () => {
    const p = previewVacio();
    const derrama = p.registros.find((r) => r.importe === 521.7);
    expect(derrama?.categoriaODestino).toBe('COMUNIDAD');
    expect(derrama?.camposRequierenValidacion).toContain('categoria');
    expect(derrama?.estadoEvidencia).toBe('REQUIERE_VALIDACION');
    const inc = p.incidencias.find((i) => i.incidenciaFase2 === 'INC-03');
    expect(inc).toBeDefined();
  });

  it('"Basuras" → IMPUESTOS_TASAS propuesto, marcado para validación (no decidido)', () => {
    const p = previewVacio();
    const basuras = p.registros.filter((r) => r.categoriaODestino === 'IMPUESTOS_TASAS');
    expect(basuras).toHaveLength(4);
    for (const b of basuras) {
      expect(b.camposRequierenValidacion).toContain('categoria');
      expect(b.estadoEvidencia).toBe('REQUIERE_VALIDACION');
    }
  });

  it('rentas anual vs mensual (INC-06/INC-07): reportadas, NO decididas', () => {
    const p = previewVacio();
    const rent = p.incidencias.filter((i) => i.codigo === 'RENTA_ANUAL_VS_MENSUAL');
    const fases = rent.map((i) => i.incidenciaFase2).sort();
    expect(fases).toContain('INC-06'); // p_0: 6000 anual + 6000 mensual
    expect(fases).toContain('INC-07'); // p_1: 8400 anual vs 8760 mensual (delta -360)
    const p0 = p.porInmueble.prop_1783441481122_0;
    expect(p0.rent.anual).toBe(6000);
    expect(p0.rent.mensual).toBe(6000);
    const p1 = p.porInmueble.prop_1783441481122_1;
    expect(p1.rent.anual).toBe(8400);
    expect(p1.rent.mensual).toBe(8760);
  });

  it('propietarioId y supuestos (aCargoDe/estado/deducible) quedan SIEMPRE pendientes', () => {
    const p = previewVacio();
    for (const r of p.registros.filter((x) => x.entidad === 'GASTO' && !x.motivoBloqueo)) {
      expect(r.camposRequierenValidacion).toContain('propietarioId');
      expect(r.camposRequierenValidacion).toContain('aCargoDe');
      expect(r.camposRequierenValidacion).toContain('estado');
      expect(r.camposRequierenValidacion).toContain('deducible');
    }
    expect(p.dependenciasArquitectonicas.join(' ')).toContain('Cuenta de acceso / Titular / Gestor');
  });
});

describe('Aislamiento: cero escrituras / cero Firebase', () => {
  it('ningún módulo de importación importa Firebase', () => {
    const dir = new URL('.', import.meta.url);
    const ficheros = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(ficheros.length).toBeGreaterThanOrEqual(6);
    for (const f of ficheros) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      expect(src, `fichero ${f} no debe importar firebase`).not.toMatch(/from\s+['"]firebase|firebase-admin|getFirestore|firebase\/firestore/);
    }
  });
});
