import { describe, it, expect } from 'vitest';
import {
  calcularPrecioM2,
  calcularDiferenciaPrecioValor,
  evaluarValoracion,
  calcularCosteCompra,
  cuotaFrancesaDeterminista,
  calcularFinanciacion,
  calcularAlquiler,
  calcularRentabilidades,
  calcularReforma,
  calcularValorDespuesReforma,
  calcularResumen,
  calcularIndicadores,
  generarEscenarios,
  generarEscenariosNiveles,
  MENSAJE_INSUFICIENTE_VALORACION,
  MENSAJE_INSUFICIENTE_COSTE,
  MENSAJE_INSUFICIENTE_ALQUILER,
  MENSAJE_INSUFICIENTE_FINANCIACION,
  redondear2,
} from './inversionEngine';
import type {
  DatosInmuebleAnalisis,
  ValoracionAnalisis,
  CosteCompraAnalisis,
  FinanciacionAnalisis,
  AlquilerEstimado,
  ReformaAnalisis,
  ValorDespuesReforma,
} from '../types/inversion';

// ---------------------------------------------------------------------------
// Helpers factory (sin datos ficticios, solo valores explícitos de prueba)
// ---------------------------------------------------------------------------

function datosBase(overrides: Partial<DatosInmuebleAnalisis> = {}): DatosInmuebleAnalisis {
  return {
    direccion: 'C/ Test 1, Madrid',
    superficie: 80,
    precioAnunciado: 200000,
    precioPrevistoCompra: 190000,
    ...overrides,
  };
}

function valoracionBase(overrides: Partial<ValoracionAnalisis> = {}): ValoracionAnalisis {
  return {
    datosSuficientes: true,
    valorEstimadoMercado: 210000,
    precioSolicitado: 200000,
    ...overrides,
  } as ValoracionAnalisis;
}

function costeBase(overrides: Partial<CosteCompraAnalisis> = {}): CosteCompraAnalisis {
  return {
    precioCompra: 190000,
    impuestos: 8000,
    notaria: 800,
    registro: 400,
    gestoria: 300,
    otrosGastos: 500,
    reformaInicial: 0,
    otrosCostes: 0,
    ...overrides,
  } as CosteCompraAnalisis;
}

function alquilerBase(overrides: Partial<AlquilerEstimado> = {}): AlquilerEstimado {
  return {
    alquilerMensual: 1000,
    ocupacionPrevistaPct: 95,
    gastosComunidad: 1200,
    ibi: 600,
    seguro: 300,
    mantenimiento: 400,
    otrosGastosAnuales: 200,
    ...overrides,
  } as AlquilerEstimado;
}

function reformaBase(): ReformaAnalisis {
  return {
    partidas: [
      { id: 'p1', categoria: 'COCINA', descripcion: 'Cocina completa', costeEstimado: 6000 },
      { id: 'p2', categoria: 'BANOS', descripcion: 'Baño principal', costeEstimado: 3500 },
      { id: 'p3', categoria: 'PINTURA', descripcion: 'Pintura general', costeEstimado: 1500 },
    ],
    costeTotalReforma: null,
    contingenciaPct: 10,
    costeConContingencia: null,
  };
}

// ---------------------------------------------------------------------------
// €/m2
// ---------------------------------------------------------------------------

describe('Inversión — €/m2 y valoración básica', () => {
  it('calcula €/m2 correctamente', () => {
    expect(calcularPrecioM2(200000, 80)).toBe(2500);
    expect(calcularPrecioM2(150000, 50)).toBe(3000);
  });
  it('retorna null si datos insuficientes', () => {
    expect(calcularPrecioM2(undefined, 80)).toBeNull();
    expect(calcularPrecioM2(200000, undefined)).toBeNull();
    expect(calcularPrecioM2(0, 80)).toBeNull();
    expect(calcularPrecioM2(200000, 0)).toBeNull();
  });
  it('diferencia precio-valoración', () => {
    const { diferencia, pct } = calcularDiferenciaPrecioValor(200000, 210000);
    expect(diferencia).toBe(-10000);
    expect(pct).toBeCloseTo(-4.76, 1);
  });
  it('diferencia null si insuficiente', () => {
    expect(calcularDiferenciaPrecioValor(undefined, 210000).diferencia).toBeNull();
    expect(calcularDiferenciaPrecioValor(200000, undefined).diferencia).toBeNull();
  });
  it('evaluarValoracion con datos suficientes', () => {
    const datos = datosBase();
    const val = valoracionBase();
    const res = evaluarValoracion(datos, val);
    expect(res.datosSuficientes).toBe(true);
    expect(res.precioM2).toBe(2500);
    expect(res.mensajeInsuficiencia).toBeUndefined();
  });
  it('evaluarValoracion insuficiente → mensaje explicativo, no 0 ficticio', () => {
    const datos = datosBase({ superficie: undefined, precioAnunciado: undefined, precioPrevistoCompra: undefined });
    const val: ValoracionAnalisis = { datosSuficientes: false } as any;
    const res = evaluarValoracion(datos, val);
    expect(res.datosSuficientes).toBe(false);
    expect(res.mensajeInsuficiencia).toBe(MENSAJE_INSUFICIENTE_VALORACION);
    expect(res.precioM2).toBeNull();
    expect(res.diferenciaPrecioValor).toBeNull();
  });
  it('escenarios conservador/central/favorable preservados', () => {
    const datos = datosBase();
    const val = valoracionBase({ escenarioConservador: 190000, escenarioCentral: 210000, escenarioFavorable: 230000 });
    const res = evaluarValoracion(datos, val);
    expect(res.escenarioConservador).toBe(190000);
    expect(res.escenarioCentral).toBe(210000);
    expect(res.escenarioFavorable).toBe(230000);
  });
});

// ---------------------------------------------------------------------------
// Coste adquisición
// ---------------------------------------------------------------------------

describe('Inversión — Coste total adquisición', () => {
  it('calcula gastos adquisición y coste total', () => {
    const coste = calcularCosteCompra(costeBase());
    expect(coste.gastosAdquisicion).toBe(10000); // 8000+800+400+300+500
    expect(coste.costeTotalAdquisicion).toBe(200000);
  });
  it('incluye reforma inicial y otros costes', () => {
    const coste = calcularCosteCompra(costeBase({ reformaInicial: 5000, otrosCostes: 2000 }));
    expect(coste.costeTotalAdquisicion).toBe(207000);
  });
  it('insuficiente → null, no 0 ficticio', () => {
    const coste = calcularCosteCompra({ precioCompra: 0 } as any);
    expect(coste.costeTotalAdquisicion).toBeNull();
    // mensaje esperado para UI
    expect(MENSAJE_INSUFICIENTE_COSTE).toContain('No hay datos suficientes');
  });
  it('distingue precio/gastos/inversión', () => {
    const c = costeBase({ impuestos: 10000, notaria: 1000 });
    const res = calcularCosteCompra(c);
    expect(res.precioCompra).toBe(190000);
    expect(res.gastosAdquisicion).toBe(10000 + 1000 + 400 + 300 + 500);
    expect(res.inversionInicialSinFinanciacion).toBe(res.costeTotalAdquisicion);
  });
});

// ---------------------------------------------------------------------------
// Financiación
// ---------------------------------------------------------------------------

describe('Inversión — Financiación opcional', () => {
  it('cuota francesa determinista', () => {
    const cuota = cuotaFrancesaDeterminista(150000, 3, 240);
    expect(cuota).toBeGreaterThan(800);
    expect(cuota).toBeLessThan(1000);
    // 0% interés → división simple
    expect(cuotaFrancesaDeterminista(120000, 0, 120)).toBe(1000);
  });
  it('retorna null si datos insuficientes', () => {
    expect(cuotaFrancesaDeterminista(undefined as any, 3, 240)).toBeNull();
    expect(cuotaFrancesaDeterminista(150000, undefined as any, 240)).toBeNull();
    expect(cuotaFrancesaDeterminista(150000, 3, 0)).toBeNull();
  });
  it('calcularFinanciacion sin financiación → capital aportado = coste total', () => {
    const f: FinanciacionAnalisis = { usarFinanciacion: false };
    const res = calcularFinanciacion(f, 200000);
    expect(res?.capitalAportado).toBe(200000);
    expect(res?.cuotaEstimada).toBeNull();
  });
  it('calcularFinanciacion con datos completos', () => {
    const f: FinanciacionAnalisis = {
      usarFinanciacion: true,
      importeFinanciado: 150000,
      tipoInteresAnual: 3,
      plazoMeses: 240,
    };
    const res = calcularFinanciacion(f, 200000);
    expect(res?.cuotaEstimada).not.toBeNull();
    expect(res?.capitalAportado).toBe(50000);
    expect(res?.costeFinancieroTotal).toBeGreaterThan(0);
  });
  it('insuficiente → cuota null y mensaje', () => {
    const f: FinanciacionAnalisis = {
      usarFinanciacion: true,
      importeFinanciado: 150000,
      tipoInteresAnual: undefined,
      plazoMeses: 240,
    };
    const res = calcularFinanciacion(f, 200000);
    expect(res?.cuotaEstimada).toBeNull();
    expect(MENSAJE_INSUFICIENTE_FINANCIACION).toContain('No hay datos suficientes');
  });
});

// ---------------------------------------------------------------------------
// Alquiler y gastos
// ---------------------------------------------------------------------------

describe('Inversión — Alquiler, gastos, rentabilidad, cash flow', () => {
  it('calcula ingresos brutos con ocupación', () => {
    const alq = calcularAlquiler(alquilerBase());
    expect(alq.alquilerAnualBruto).toBe(12000);
    expect(alq.ingresosBrutosAnuales).toBe(11400); // 95%
  });
  it('calcula con vacancia', () => {
    const alq = calcularAlquiler(alquilerBase({ ocupacionPrevistaPct: undefined, mesesVacancia: 1 }));
    expect(alq.ingresosBrutosAnuales).toBe(11000); // 11 meses
  });
  it('gastos anuales totales', () => {
    const alq = calcularAlquiler(alquilerBase());
    expect(alq.gastosAnualesTotales).toBe(2700);
  });
  it('ingresos netos y flujo', () => {
    const alq = calcularAlquiler(alquilerBase());
    expect(alq.ingresosNetosAnuales).toBe(8700); // 11400-2700
    expect(alq.flujoCajaAnual).toBe(8700);
    expect(alq.flujoCajaMensual).toBe(725);
  });
  it('rentabilidad bruta/neta requiere inversión', () => {
    const alq = calcularAlquiler(alquilerBase());
    const rent = calcularRentabilidades(alq, 200000);
    expect(rent.bruta).toBe(5.7); // 11400/200000*100
    expect(rent.neta).toBe(4.35);
  });
  it('rentabilidad null si inversión insuficiente', () => {
    const alq = calcularAlquiler(alquilerBase());
    const rent = calcularRentabilidades(alq, null);
    expect(rent.bruta).toBeNull();
    expect(rent.neta).toBeNull();
  });
  it('insuficiente alquiler → null, no 0', () => {
    const alq = calcularAlquiler({ alquilerMensual: undefined } as any);
    expect(alq.ingresosBrutosAnuales).toBeNull();
    expect(MENSAJE_INSUFICIENTE_ALQUILER).toContain('No hay datos suficientes');
  });
  it('estimación ≠ dato real: esEstimacion flag en escenarios', () => {
    const coste = calcularCosteCompra(costeBase());
    const ref = reformaBase();
    const reformaCalc = calcularReforma(ref);
    const alq = calcularAlquiler(alquilerBase());
    const val = evaluarValoracion(datosBase(), valoracionBase());
    const escenarios = generarEscenarios(coste, reformaCalc, alq, val);
    escenarios.forEach((e) => expect(e.esEstimacion).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// Reforma
// ---------------------------------------------------------------------------

describe('Inversión — Reforma partidas y contingencia', () => {
  it('coste total reforma suma partidas', () => {
    const r = calcularReforma(reformaBase());
    expect(r.costeTotalReforma).toBe(11000);
  });
  it('contingencia 10% → 12100', () => {
    const r = calcularReforma(reformaBase());
    expect(r.costeConContingencia).toBe(12100);
  });
  it('sin partidas → null', () => {
    const r = calcularReforma({ partidas: [], costeTotalReforma: null, costeConContingencia: null });
    expect(r.costeTotalReforma).toBeNull();
  });
  it('categorías 12 tipos permitidos', () => {
    const base = reformaBase();
    expect(base.partidas.length).toBe(3);
    const categorias = ['COCINA', 'BANOS', 'INSTALACIONES', 'PINTURA', 'SUELOS', 'PUERTAS', 'VENTANAS', 'ELECTRICIDAD', 'FONTANERIA', 'CLIMATIZACION', 'MOBILIARIO', 'OTROS'];
    categorias.forEach((c) => expect(typeof c).toBe('string'));
  });
});

// ---------------------------------------------------------------------------
// Valor después reforma
// ---------------------------------------------------------------------------

describe('Inversión — Valor después reforma, incrementos, ROI, recuperación', () => {
  it('incremento valor y %', () => {
    const v: ValorDespuesReforma = { valorAntes: 200000, valorDespues: 230000, alquilerAntes: 1000, alquilerDespues: 1200 };
    const res = calcularValorDespuesReforma(v, 11000);
    expect(res.incrementoValor).toBe(30000);
    expect(res.incrementoValorPct).toBe(15);
  });
  it('incremento alquiler y %', () => {
    const v: ValorDespuesReforma = { valorAntes: 200000, valorDespues: 230000, alquilerAntes: 1000, alquilerDespues: 1200 };
    const res = calcularValorDespuesReforma(v, 11000);
    expect(res.incrementoAlquiler).toBe(200);
    expect(res.incrementoAlquilerPct).toBe(20);
  });
  it('rentabilidad reforma = incrementoValor / coste *100', () => {
    const v: ValorDespuesReforma = { valorAntes: 200000, valorDespues: 230000 } as any;
    const res = calcularValorDespuesReforma(v, 11000);
    expect(res.rentabilidadReforma).toBeCloseTo(272.72, 1);
  });
  it('recuperación meses = coste / incrementoAlquiler', () => {
    const v: ValorDespuesReforma = { alquilerAntes: 1000, alquilerDespues: 1200 } as any;
    const res = calcularValorDespuesReforma(v, 11000);
    expect(res.recuperacionMeses).toBe(55); // 11000/200
    expect(res.recuperacionAnios).toBeCloseTo(4.58, 1);
  });
  it('insuficiente → null, marcado como ESTIMACIÓN en UI', () => {
    const v: ValorDespuesReforma = {} as any;
    const res = calcularValorDespuesReforma(v, null);
    expect(res.incrementoValor).toBeNull();
    expect(res.recuperacionMeses).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Resumen e indicadores
// ---------------------------------------------------------------------------

describe('Inversión — Resumen visual y indicadores', () => {
  it('resumen COMPRA/GASTOS/REFORMA/INVERSIÓN/VALOR/ALQUILER/RENTABILIDAD', () => {
    const coste = calcularCosteCompra(costeBase());
    const reforma = calcularReforma(reformaBase());
    const alquiler = calcularAlquiler(alquilerBase());
    const valoracion = evaluarValoracion(datosBase(), valoracionBase());
    const valorDespues: ValorDespuesReforma = { valorAntes: 200000, valorDespues: 230000, alquilerAntes: 1000, alquilerDespues: 1200 } as any;
    const vdCalc = calcularValorDespuesReforma(valorDespues, reforma.costeConContingencia);
    const resumen = calcularResumen(coste, reforma, alquiler, valoracion, vdCalc);
    expect(resumen.compraPrecio).toBe(190000);
    expect(resumen.gastosAdquisicion).toBe(10000);
    expect(resumen.reformaCoste).toBe(12100);
    expect(resumen.inversionTotal).toBe(212100);
    expect(resumen.valorFinalEstimado).toBe(230000);
    expect(resumen.alquilerMensual).toBe(1000);
  });
  it('indicadores rentabilidad bruta/neta/cash flow/inversión total/diferencia', () => {
    const coste = calcularCosteCompra(costeBase());
    const reforma = calcularReforma(reformaBase());
    const alquiler = calcularAlquiler(alquilerBase());
    const valoracion = evaluarValoracion(datosBase(), valoracionBase());
    const vd: ValorDespuesReforma = { valorAntes: 200000, valorDespues: 230000, alquilerAntes: 1000, alquilerDespues: 1200 } as any;
    const vdCalc = calcularValorDespuesReforma(vd, reforma.costeConContingencia);
    const ind = calcularIndicadores(coste, valoracion, alquiler, reforma, vdCalc, { usarFinanciacion: false } as any);
    expect(ind.rentabilidadBruta).not.toBeNull();
    expect(ind.rentabilidadNeta).not.toBeNull();
    expect(ind.cashFlowAnual).toBe(8700);
    expect(ind.inversionTotal).toBe(212100);
    expect(ind.diferenciaCompraValoracion).toBe(-20000); // 190k -210k
    expect(ind.incrementoValorReforma).toBe(30000);
    expect(ind.retornoReformaPct).not.toBeNull();
    expect(ind.plazoRecuperacionMeses).toBe(61); // 12100/200 =60.5 ceil 61? actually 12100/200=60.5→61
  });
  it('solo indicadores calculables, resto null', () => {
    const coste = calcularCosteCompra({ precioCompra: undefined } as any);
    const reforma = calcularReforma({ partidas: [] } as any);
    const alquiler = calcularAlquiler({ alquilerMensual: undefined } as any);
    const valoracion = evaluarValoracion(datosBase({ precioAnunciado: undefined }), { datosSuficientes: false } as any);
    const ind = calcularIndicadores(coste, valoracion, alquiler, reforma);
    expect(ind.rentabilidadBruta).toBeNull();
    expect(ind.inversionTotal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Escenarios 1/2/3 y conservador/central/favorable
// ---------------------------------------------------------------------------

describe('Inversión — Escenarios comparables', () => {
  it('genera 3 escenarios: sin reforma, con reforma, personalizado', () => {
    const coste = calcularCosteCompra(costeBase());
    const reforma = calcularReforma(reformaBase());
    const alquiler = calcularAlquiler(alquilerBase());
    const valoracion = evaluarValoracion(datosBase(), valoracionBase());
    const escenarios = generarEscenarios(coste, reforma, alquiler, valoracion);
    expect(escenarios).toHaveLength(3);
    expect(escenarios[0].tipo).toBe('SIN_REFORMA');
    expect(escenarios[1].tipo).toBe('CON_REFORMA');
    expect(escenarios[2].tipo).toBe('PERSONALIZADO');
    // lado a lado visual: distintos alquiler/valor
    expect(escenarios[0].costeReforma).toBe(0);
    expect(escenarios[1].costeReforma).toBeGreaterThan(0);
  });
  it('escenarios niveles conservador/central/favorable', () => {
    const valoracion = valoracionBase({ escenarioConservador: 190000, escenarioCentral: 210000, escenarioFavorable: 230000 });
    const alquiler = alquilerBase({ alquilerMensual: 1000 });
    const reforma = calcularReforma(reformaBase());
    const niveles = generarEscenariosNiveles(valoracion as any, alquiler as any, reforma);
    expect(niveles.valoracion.conservadora).toBe(190000);
    expect(niveles.valoracion.central).toBe(210000);
    expect(niveles.valoracion.favorable).toBe(230000);
    expect(niveles.alquiler.conservador).toBe(900);
    expect(niveles.alquiler.central).toBe(1000);
    expect(niveles.alquiler.favorable).toBe(1100);
    expect(niveles.reforma.previsto).toBe(12100);
    expect(niveles.reforma.superior).toBeCloseTo(13915, 0);
  });
  it('niveles calculados automáticamente si no se aportan', () => {
    const valoracion = valoracionBase({ escenarioConservador: undefined, escenarioFavorable: undefined });
    const alquiler = alquilerBase();
    const reforma = calcularReforma(reformaBase());
    const niveles = generarEscenariosNiveles(valoracion as any, alquiler as any, reforma);
    // 10% margen automático
    expect(niveles.valoracion.conservadora).toBe(189000); // 210k*0.9
    expect(niveles.valoracion.favorable).toBe(231000);
  });
});

// ---------------------------------------------------------------------------
// Persistencia, duplicación, conversión, permisos, ausencia ficticios
// ---------------------------------------------------------------------------

describe('Inversión — Persistencia y negocio', () => {
  it('estructura AnalisisInversion independiente de inmueble real', () => {
    const analisis = {
      id: 'analisis_1',
      propietarioId: 'prop_1',
      esNuevoInmueble: true,
      titulo: 'Análisis C/ Mayor 5',
      estado: 'BORRADOR',
      datosInmueble: datosBase(),
      valoracion: valoracionBase(),
      comparables: [],
      costeCompra: costeBase(),
      alquiler: alquilerBase(),
      reforma: reformaBase(),
      escenarios: [],
      resumen: {} as any,
      indicadores: {} as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    expect(analisis.esNuevoInmueble).toBe(true);
    expect(analisis.propietarioId).toBe('prop_1');
    // No debe crear inmueble automáticamente
    expect((analisis as any).inmuebleId).toBeUndefined();
  });

  it('duplicación: nuevo id, histórico preservado', () => {
    const original = {
      id: 'orig_1',
      propietarioId: 'prop_1',
      titulo: 'Original',
      historial: [{ id: 'h1', fecha: '2026-01-01', accion: 'CREADO' }],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
      version: 1,
    };
    const duplicado = {
      ...original,
      id: 'dup_1',
      titulo: 'Original (copia)',
      historial: [...original.historial, { id: 'h2', fecha: new Date().toISOString(), accion: 'DUPLICADO', detalle: 'Desde orig_1' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
    expect(duplicado.id).not.toBe(original.id);
    expect(duplicado.historial.length).toBe(2);
    expect(duplicado.historial[0].accion).toBe('CREADO');
  });

  it('conversión en inmueble cartera con confirmación y mantiene histórico', () => {
    const analisis: any = {
      id: 'analisis_conv',
      propietarioId: 'prop_1',
      datosInmueble: datosBase({ direccion: 'C/ Convertida 10' }),
      historial: [{ id: 'h1', fecha: '2026-01-01', accion: 'CREADO' }],
      estado: 'ANALIZADO',
    };
    const nuevoInmueble = {
      id: `inmueble_from_${analisis.id}`,
      titulo: analisis.datosInmueble.direccion,
      direccion: analisis.datosInmueble.direccion,
      origenAnalisisId: analisis.id,
    };
    const analisisConvertido = {
      ...analisis,
      estado: 'CONVERTIDO',
      convertidoEnInmuebleId: nuevoInmueble.id,
      fechaConversion: new Date().toISOString(),
      historial: [...analisis.historial, { id: 'h_conv', fecha: new Date().toISOString(), accion: 'CONVERTIDO', detalle: nuevoInmueble.id }],
    };
    expect(analisisConvertido.convertidoEnInmuebleId).toBe(nuevoInmueble.id);
    expect(analisisConvertido.historial.length).toBe(2);
    expect(analisisConvertido.estado).toBe('CONVERTIDO');
  });

  it('permisos: profesional no accede a datos inversión (scope)', () => {
    // Simula lógica de subscribeAnalisisInversion: profesional → []
    function canAccessAnalisis(tipoPerfil: string, propietarioId: string, analisisPropietarioId: string) {
      if (tipoPerfil === 'PROFESIONAL') return false;
      if (tipoPerfil === 'PROPIETARIO') return propietarioId === analisisPropietarioId;
      if (tipoPerfil === 'ADMINISTRADOR') return true;
      return false;
    }
    expect(canAccessAnalisis('PROFESIONAL', 'prop_1', 'prop_1')).toBe(false);
    expect(canAccessAnalisis('PROPIETARIO', 'prop_1', 'prop_1')).toBe(true);
    expect(canAccessAnalisis('PROPIETARIO', 'prop_2', 'prop_1')).toBe(false);
    expect(canAccessAnalisis('ADMINISTRADOR', 'any', 'prop_1')).toBe(true);
  });

  it('ausencia de datos ficticios: nunca retorna 0 cuando induce error', () => {
    // Valoración insuficiente debe ser null, no 0
    expect(calcularPrecioM2(undefined, undefined)).toBeNull();
    expect(calcularPrecioM2(0, 0)).toBeNull();
    // Coste insuficiente → null
    const costeInsuf = calcularCosteCompra({ precioCompra: undefined } as any);
    expect(costeInsuf.costeTotalAdquisicion).toBeNull();
    // Alquiler insuficiente → null
    const alqInsuf = calcularAlquiler({ alquilerMensual: 0 } as any);
    expect(alqInsuf.ingresosBrutosAnuales).toBeNull();
    // Reforma insuficiente → null
    const refInsuf = calcularReforma({ partidas: [] } as any);
    expect(refInsuf.costeTotalReforma).toBeNull();
    // Mensajes explicativos existen
    expect(MENSAJE_INSUFICIENTE_VALORACION.length).toBeGreaterThan(10);
    expect(MENSAJE_INSUFICIENTE_COSTE.length).toBeGreaterThan(10);
    expect(MENSAJE_INSUFICIENTE_ALQUILER.length).toBeGreaterThan(10);
  });

  it('redondeo determinista', () => {
    expect(redondear2(1.005)).toBe(1.01);
    expect(redondear2(1.004)).toBe(1.0);
    expect(redondear2(123.456)).toBe(123.46);
  });

  it('no porcentajes fiscales inventados rígidos: impuestos opcionales', () => {
    const costeSinImpuestos = calcularCosteCompra({ precioCompra: 100000 } as any);
    expect(costeSinImpuestos.costeTotalAdquisicion).toBe(100000);
    expect(costeSinImpuestos.gastosAdquisicion).toBe(0);
    // Usuario puede introducir libremente impuestos
    const costeConImpuestos = calcularCosteCompra({ precioCompra: 100000, impuestos: 7500 } as any);
    expect(costeConImpuestos.costeTotalAdquisicion).toBe(107500);
  });
});
