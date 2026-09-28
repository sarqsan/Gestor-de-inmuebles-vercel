/**
 * BLOQUE 5 — OPERACIONES → FISCALIDAD (batería de cierre, vitest).
 * ---------------------------------------------------------------------------
 * Cierra y prueba el circuito:
 *
 *   INMUEBLE → INCIDENCIA → REPARACIÓN → (OT) → PROVEEDOR → PRESUPUESTO →
 *   FACTURA → GASTO → DEDUCIBILIDAD → DOCUMENTO → INFORME FISCAL
 *
 * No crea datos paralelos: el escenario operativo sale del módulo REAL de
 * Operaciones (`demo/recorrido.mjs`, `tests/support.mjs`, `demo/fixtures.ts`) y
 * los modelos de mantenimiento/suministro/lectura/seguro de `src/types.ts`.
 * Los motores de gasto, fiscal, deducibilidad y reporting son los de producción.
 */
import { describe, expect, it } from 'vitest';
import type {
  Gasto,
  Inmueble,
  LecturaSuministro,
  PolizaSeguro,
  Suministro,
  TareaMantenimiento,
  UsuarioApp,
} from '../types';
import { CONTEXTO_FICTICIO } from '../features/operaciones/demo/fixtures.ts';
import { ejecutarRecorridoFicticio } from '../features/operaciones/demo/recorrido.mjs';
import { base, enCurso } from '../features/operaciones/tests/support.mjs';
import { analizarDeducibilidad, clasificarGastosDeducibilidad, esGastoDeducible } from './deducibilidadEngine';
import {
  calcularGastosEjercicio,
  esGastoDeducible as esGastoDeducibleFiscal,
  generarResumenFiscalAnual,
} from './fiscalEngine';
import { calcularTotalesGastos } from './gastosEngine';
import {
  buscarGastoDeOperacion,
  CATEGORIA_POR_TIPO,
  documentosDeLecturaSuministro,
  documentosDePolizaSeguro,
  entidadesDelInmueble,
  esGastoDeOperacion,
  gastoIdDeActuacion,
  generarGastoDesdeOperacion,
  generarInformeFiscalOperaciones,
  idGastoDeOperacion,
  operacionDesdeFacturaOperativa,
  operacionDesdeReparacionOperativa,
  operacionDesdeTareaMantenimiento,
  ORIGEN_POR_TIPO,
  puedeGenerarGastoDesdeOperacion,
  reconstruirTrazabilidadGasto,
} from './operacionGastoEngine';
import { exportarCSV, exportarJSON, generarExportacionFiscal } from './reportingEngine';

// ---------------------------------------------------------------------------
// Escenario: módulo de Operaciones real (recorrido ficticio cerrado completo)
// ---------------------------------------------------------------------------

const PROPIETARIO_A = 'prop-demo-a';
const PROPIETARIO_B = 'prop-demo-b';
const AHORA = '2026-09-27T12:00:00.000Z';

/** Solo se aportan los campos que el circuito consulta (fixture de prueba). */
const INMUEBLE_A = {
  id: 'inm-demo-1',
  direccion: 'Calle ficticia 1',
  propietarioId: PROPIETARIO_A,
  propietarioPrincipalId: PROPIETARIO_A,
} as Inmueble;
const INMUEBLE_B = {
  id: 'inm-demo-3',
  direccion: 'Calle ficticia 3',
  propietarioId: PROPIETARIO_B,
} as Inmueble;
const INMUEBLES = [INMUEBLE_A, INMUEBLE_B];

const USUARIO: UsuarioApp = {
  id: 'usuario-demo',
  nombre: 'Gestora ficticia',
  email: 'gestora@example.invalid',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
} as UsuarioApp;

/** Estado operativo cerrado del recorrido real (incidencia → … → factura + documento). */
function recorrido() {
  return ejecutarRecorridoFicticio().estado;
}

function tareaMantenimiento(overrides: Partial<TareaMantenimiento> = {}): TareaMantenimiento {
  return {
    id: 'mant_1',
    inmuebleId: 'inm-demo-1',
    propietarioId: PROPIETARIO_A,
    titulo: 'Revisión anual de la caldera',
    periodicidad: 'ANUAL',
    activa: true,
    proximaFecha: '2027-03-01',
    createdAt: '2025-03-01T00:00:00.000Z',
    updatedAt: '2025-03-01T00:00:00.000Z',
    ...overrides,
  };
}

const SUMINISTRO: Suministro = {
  id: 'sum-luz-1',
  inmuebleId: 'inm-demo-1',
  tipo: 'LUZ',
  cups: 'ES0000000000000000XX',
  comercializadora: 'Comercializadora ficticia',
  modoReparto: 'SIN_REPARTO',
  activo: true,
  fechaAlta: '2025-01-01',
  fechaActualizacion: '2026-09-01',
};

const LECTURA: LecturaSuministro = {
  id: 'lect-1',
  suministroId: 'sum-luz-1',
  inmuebleId: 'inm-demo-1',
  contratoId: 'contrato-demo',
  valor: 2134,
  unidad: 'kWh',
  fechaLectura: '2026-09-20',
  origen: 'ADMIN',
  fotoStoragePath: 'inmuebles/inm-demo-1/suministros/lect-1.jpg',
  createdAt: '2026-09-20T09:00:00.000Z',
};

const POLIZA: PolizaSeguro = {
  id: 'pol-1',
  aseguradora: 'Aseguradora ficticia',
  numeroPoliza: 'POL-DEMO-1',
  tipo: 'HOGAR',
  propietarioId: PROPIETARIO_A,
  inmuebleId: 'inm-demo-1',
  fechaInicio: '2026-01-01',
  fechaVencimiento: '2027-01-01',
  estado: 'VIGENTE',
  coberturas: ['Continente'],
  primaAnual: 285.5,
  documentos: [{
    id: 'doc-pol-1',
    nombre: 'condiciones-particulares.pdf',
    url: '',
    storagePath: 'inmuebles/inm-demo-1/polizas/pol-1/condiciones.pdf',
    fechaSubida: '2026-01-01T00:00:00.000Z',
  }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Gasto del recorrido: factura vinculada del módulo de Operaciones. */
function gastoDeFacturaDelRecorrido() {
  const estado = recorrido();
  const operacion = operacionDesdeFacturaOperativa(estado.entidades, 'factura-demo', PROPIETARIO_A);
  if (!operacion) throw new Error('La factura del recorrido debe convertirse en operación');
  const resultado = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA, usuarioId: USUARIO.id });
  if (!resultado.gasto) throw new Error(`No se generó el gasto: ${resultado.error}`);
  return { estado, operacion, gasto: resultado.gasto };
}

// ---------------------------------------------------------------------------
// OPERACIONES
// ---------------------------------------------------------------------------

describe('BLOQUE 5 · OPERACIONES (incidencia, reparación, proveedor, presupuesto, mantenimiento, suministro, lectura, seguro)', () => {
  it('incidencia: genera el gasto de reparación conservando la incidencia como origen', () => {
    const operacion = {
      tipo: 'INCIDENCIA' as const,
      operacionId: 'incidencia-demo',
      inmuebleId: 'inm-demo-1',
      propietarioId: PROPIETARIO_A,
      fecha: '2026-09-26',
      importe: 75.4,
      descripcion: 'Avería de fontanería',
      proveedor: 'Taller ficticio',
      estado: 'PAGADO' as const,
    };
    expect(puedeGenerarGastoDesdeOperacion(operacion, INMUEBLES).valido).toBe(true);
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.categoria).toBe('REPARACION');
    expect(gasto?.tipo).toBe('EXPLOTACION');
    expect(gasto?.origen).toBe(ORIGEN_POR_TIPO.INCIDENCIA);
    expect(gasto?.origenId).toBe('incidencia-demo');
    expect(gasto?.incidenciaId).toBe('incidencia-demo');
    expect(gasto?.inmuebleId).toBe('inm-demo-1');
    expect(gasto?.propietarioId).toBe(PROPIETARIO_A);
    expect(gasto?.importe).toBe(75.4);
    expect(esGastoDeOperacion(gasto!)).toBe(true);
    expect(esGastoDeducible(gasto!)).toBe(true);
  });

  it('reparación: exige actuación FINALIZADA y coste real; el gasto conserva la cadena', () => {
    const s = base();
    // Reparación finalizada SIN coste real (contrato existente: 0 es explícito, no ausencia).
    enCurso(s);
    s.modificar('reparacion', { fechaFin: '2026-09-27', costeCentimos: 0, resultado: 'Sin coste', materiales: [] });
    s.cambiar('reparacion', 'FINALIZADA');
    expect(operacionDesdeReparacionOperativa(s.estado.entidades, 'reparacion-demo', PROPIETARIO_A)).toBeNull();

    // Reparación finalizada CON coste real.
    const s2 = base();
    enCurso(s2);
    s2.modificar('reparacion', {
      fechaFin: '2026-09-27',
      costeCentimos: 21150,
      resultado: 'Bomba sustituida',
      materiales: [{ descripcion: 'Bomba', cantidad: 1 }],
    });
    s2.cambiar('reparacion', 'FINALIZADA');
    const operacion = operacionDesdeReparacionOperativa(s2.estado.entidades, 'reparacion-demo', PROPIETARIO_A);
    expect(operacion).not.toBeNull();
    expect(operacion!.importe).toBe(211.5);
    expect(operacion!.proveedorId).toBe('proveedor-demo');
    expect(operacion!.reparacionId).toBe('reparacion-demo');
    expect(operacion!.incidenciaId).toBe('incidencia-demo');
    expect(operacion!.fecha).toBe('2026-09-27');

    const { gasto } = generarGastoDesdeOperacion({ operacion: operacion!, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.reparacionId).toBe('reparacion-demo');
    expect(gasto?.incidenciaId).toBe('incidencia-demo');
    expect(gasto?.importe).toBe(211.5);
    expect(reconstruirTrazabilidadGasto(gasto!).presencia.reparacion).toBe(true);
  });

  it('proveedor: el gasto conserva el proveedor catalogado y su nombre, sin inventarlo', () => {
    const estado = recorrido();
    const operacion = operacionDesdeFacturaOperativa(estado.entidades, 'factura-demo', PROPIETARIO_A)!;
    expect(operacion.proveedorId).toBe('proveedor-demo');
    expect(operacion.proveedor).toBe('Taller ficticio');
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.proveedorId).toBe('proveedor-demo');
    expect(gasto?.proveedor).toBe('Taller ficticio');
    expect(reconstruirTrazabilidadGasto(gasto!).eslabones.some((e) => e.eslabon === 'PROVEEDOR' && e.id === 'proveedor-demo')).toBe(true);
  });

  it('presupuesto: el gasto de la factura conserva el presupuesto aprobado que la autorizó', () => {
    const { gasto, estado } = gastoDeFacturaDelRecorrido();
    const presupuesto = estado.entidades.find((e) => e.tipo === 'presupuesto');
    expect(presupuesto?.estado).toBe('APROBADO');
    expect(gasto.presupuestoId).toBe('presupuesto-demo');
    expect(reconstruirTrazabilidadGasto(gasto).presencia.presupuesto).toBe(true);
  });

  it('mantenimiento: la actuación del plan genera gasto con tarea, OT e incidencia de origen', () => {
    const tarea = tareaMantenimiento({
      ultimaOrdenTrabajoId: 'ot-1',
      ultimaIncidenciaId: 'incidencia-demo',
      profesionalPreferidoId: 'proveedor-demo',
      documentos: [{
        id: 'doc-mant-1', nombre: 'parte-caldera.pdf', url: 'https://example.invalid/parte.pdf',
        storagePath: 'inmuebles/inm-demo-1/mantenimiento/parte.pdf', fechaSubida: '2026-03-01T00:00:00.000Z',
      }],
    });
    const operacion = operacionDesdeTareaMantenimiento(tarea, {
      fechaRealizacion: '2026-03-02',
      costeReal: 120,
      profesionalNombre: 'Taller ficticio',
      numFactura: 'FRA-2026-001',
      observaciones: 'Revisión correcta',
    })!;
    expect(operacion.categoria).toBe(CATEGORIA_POR_TIPO.MANTENIMIENTO);
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.categoria).toBe('MANTENIMIENTO');
    expect(gasto?.origen).toBe('MANTENIMIENTO_PREVENTIVO');
    expect(gasto?.origenId).toBe('mant_1');
    expect(gasto?.ordenTrabajoId).toBe('ot-1');
    expect(gasto?.incidenciaId).toBe('incidencia-demo');
    expect(gasto?.concepto).toBe('Mantenimiento: Revisión anual de la caldera (Taller ficticio)');
    expect(gasto?.notas).toContain('FRA-2026-001');
    expect(gasto?.documentos?.[0]?.storagePath).toBe('inmuebles/inm-demo-1/mantenimiento/parte.pdf');
    expect(esGastoDeducible(gasto!)).toBe(true);
  });

  it('suministro: la factura del suministro genera gasto SUMINISTROS con la lectura y su documento', () => {
    const operacion = {
      tipo: 'SUMINISTRO' as const,
      operacionId: 'sum-luz-1',
      inmuebleId: SUMINISTRO.inmuebleId,
      propietarioId: PROPIETARIO_A,
      contratoId: LECTURA.contratoId,
      fecha: '2026-09-25',
      importe: 78.45,
      categoria: CATEGORIA_POR_TIPO.SUMINISTRO!,
      descripcion: 'Factura de luz del periodo 08/2026',
      proveedor: 'Comercializadora ficticia',
      suministroId: SUMINISTRO.id,
      lecturaId: LECTURA.id,
      documentos: documentosDeLecturaSuministro(LECTURA),
    };
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.categoria).toBe('SUMINISTROS');
    expect(gasto?.origen).toBe(ORIGEN_POR_TIPO.SUMINISTRO);
    expect(gasto?.origenId).toBe('sum-luz-1');
    expect(gasto?.suministroId).toBe('sum-luz-1');
    expect(gasto?.lecturaId).toBe('lect-1');
    expect(gasto?.contratoId).toBe('contrato-demo');
    expect(gasto?.documentos?.[0]?.storagePath).toBe('inmuebles/inm-demo-1/suministros/lect-1.jpg');
    expect(esGastoDeducible(gasto!)).toBe(true);
    const eslabones = reconstruirTrazabilidadGasto(gasto!).eslabones.map((e) => e.eslabon);
    expect(eslabones).toEqual(['INMUEBLE', 'PROVEEDOR', 'SUMINISTRO', 'LECTURA', 'GASTO', 'DEDUCIBILIDAD', 'DOCUMENTO']);
  });

  it('lectura: aporta la referencia documental real, pero nunca el importe (no hay gasto sin importe)', () => {
    const documentos = documentosDeLecturaSuministro(LECTURA);
    expect(documentos).toEqual([{
      id: 'lect-1',
      nombre: 'Lectura de contador 2026-09-20',
      url: '',
      storagePath: 'inmuebles/inm-demo-1/suministros/lect-1.jpg',
    }]);
    // Una lectura sin factura no tiene importe: la operación no puede generar gasto.
    const check = puedeGenerarGastoDesdeOperacion({
      tipo: 'SUMINISTRO', operacionId: LECTURA.id, inmuebleId: LECTURA.inmuebleId,
      propietarioId: PROPIETARIO_A, fecha: LECTURA.fechaLectura, importe: 0,
    }, INMUEBLES);
    expect(check.valido).toBe(false);
    expect(check.motivo).toContain('mayor que cero');
  });

  it('seguro: la prima de la póliza genera gasto SEGUROS con la póliza y sus documentos reales', () => {
    const operacion = {
      tipo: 'SEGURO' as const,
      operacionId: POLIZA.id,
      inmuebleId: POLIZA.inmuebleId!,
      propietarioId: POLIZA.propietarioId,
      fecha: '2026-01-01',
      importe: POLIZA.primaAnual!,
      categoria: CATEGORIA_POR_TIPO.SEGURO!,
      descripcion: `Prima ${POLIZA.aseguradora}`,
      proveedor: POLIZA.aseguradora,
      polizaId: POLIZA.id,
      documentos: documentosDePolizaSeguro(POLIZA),
    };
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.categoria).toBe('SEGUROS');
    expect(gasto?.origen).toBe(ORIGEN_POR_TIPO.SEGURO);
    expect(gasto?.polizaId).toBe('pol-1');
    expect(gasto?.importe).toBe(285.5);
    expect(gasto?.documentos?.[0]?.id).toBe('doc-pol-1');
    expect(esGastoDeducible(gasto!)).toBe(true);
    expect(reconstruirTrazabilidadGasto(gasto!).eslabones.map((e) => e.eslabon))
      .toEqual(['INMUEBLE', 'PROVEEDOR', 'SEGURO', 'GASTO', 'DEDUCIBILIDAD', 'DOCUMENTO']);
  });
});

// ---------------------------------------------------------------------------
// FACTURACIÓN
// ---------------------------------------------------------------------------

describe('BLOQUE 5 · FACTURACIÓN (factura vinculada, gasto, importe, ejercicio y trazabilidad)', () => {
  it('factura vinculada del módulo de Operaciones: importe en euros, categoría y ejercicio correctos', () => {
    const { gasto, operacion } = gastoDeFacturaDelRecorrido();
    expect(operacion.importe).toBe(120); // 12000 céntimos de la factura ficticia
    expect(gasto.id).toBe('gop_factura_factura-demo');
    expect(gasto.importe).toBe(120);
    expect(gasto.facturaId).toBe('factura-demo');
    expect(gasto.categoria).toBe('REPARACION');
    expect(gasto.fechaDevengo).toBe('2026-09-26');
    expect(gasto.periodoMesAnio).toBe('2026-09');
    expect(gasto.estado).toBe('PAGADO');
    expect(gasto.fechaPago).toBe('2026-09-26');
    expect(gasto.ejercicioFiscal).toBeUndefined(); // el ejercicio lo decide el motor fiscal
    expect(calcularGastosEjercicio([gasto], 2026).total).toBe(120);
    expect(calcularGastosEjercicio([gasto], 2025).total).toBe(0);
  });

  it('el gasto ya generado se localiza y no se vuelve a crear (relación factura → gasto)', () => {
    const { gasto, operacion, estado } = gastoDeFacturaDelRecorrido();
    const operacionDeNuevo = operacionDesdeFacturaOperativa(estado.entidades, 'factura-demo', PROPIETARIO_A)!;
    expect(buscarGastoDeOperacion([gasto], operacionDeNuevo)).toBe(gasto);
    const segundo = generarGastoDesdeOperacion({
      operacion: operacionDeNuevo, inmuebles: INMUEBLES, gastosExistentes: [gasto], ahora: AHORA,
    });
    expect(segundo.yaExiste).toBe(true);
    expect(segundo.gasto?.id).toBe(gasto.id);
    expect(idGastoDeOperacion(operacion)).toBe(gasto.id);
  });

  it('factura ANULADA: no se convierte en gasto (conserva su documento original)', () => {
    const s = base();
    expect(operacionDesdeFacturaOperativa(s.estado.entidades, 'factura-demo', PROPIETARIO_A)).not.toBeNull();
    s.cambiar('factura', 'ANULADA');
    expect(operacionDesdeFacturaOperativa(s.estado.entidades, 'factura-demo', PROPIETARIO_A)).toBeNull();
  });

  it('la trazabilidad del gasto llega hasta el origen documental de la factura', () => {
    const { gasto } = gastoDeFacturaDelRecorrido();
    const trazabilidad = reconstruirTrazabilidadGasto(gasto);
    expect(trazabilidad.eslabones.map((e) => e.eslabon)).toEqual([
      'INMUEBLE', 'INCIDENCIA', 'REPARACION', 'PROVEEDOR', 'PRESUPUESTO', 'FACTURA',
      'GASTO', 'DEDUCIBILIDAD', 'DOCUMENTO',
    ]);
    expect(trazabilidad.presencia).toEqual({
      incidencia: true, reparacion: true, ordenTrabajo: false, proveedor: true, presupuesto: true,
      factura: true, suministro: false, lectura: false, seguro: false, documento: true,
    });
    expect(trazabilidad.avisos).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FISCALIDAD
// ---------------------------------------------------------------------------

describe('BLOQUE 5 · FISCALIDAD (deducible, no deducible, cambio de clasificación, informes y ANULADO)', () => {
  it('gasto deducible: entra en el informe fiscal del ejercicio con su importe y su origen', () => {
    const { gasto } = gastoDeFacturaDelRecorrido();
    const informe = generarInformeFiscalOperaciones({ gastos: [gasto], ejercicio: 2026 });
    expect(informe.filas).toHaveLength(1);
    expect(informe.filas[0]).toMatchObject({
      gastoId: gasto.id,
      inmuebleId: 'inm-demo-1',
      importe: 120,
      deducible: true,
      origenDecision: 'DEDUCIBLE',
      procedenciaOperativa: true,
      origen: 'FACTURA',
      origenId: 'factura-demo',
      facturaId: 'factura-demo',
      presupuestoId: 'presupuesto-demo',
      proveedorId: 'proveedor-demo',
      documentoIds: ['archivo-demo'],
    });
    expect(informe.totales).toMatchObject({
      total: 120, totalDeducible: 120, totalNoDeducible: 0, count: 1, countDeducible: 1, countNoDeducible: 0,
    });
    expect(informe.incidencias).toEqual([]);
  });

  it('gasto no deducible: no computa como deducible y el informe lo clasifica aparte', () => {
    const operacion = {
      tipo: 'SUMINISTRO' as const,
      operacionId: 'sum-gas-1',
      inmuebleId: 'inm-demo-1',
      propietarioId: PROPIETARIO_A,
      fecha: '2026-05-10',
      importe: 40,
      // Financiación: el catálogo de gastos la marca NO deducible por defecto.
      categoria: 'OTRO_FINANCIACION' as const,
      descripcion: 'Cuota no deducible ficticia',
      documentos: [{ id: 'doc-cuota-1', nombre: 'recibo-cuota.pdf', url: '' }],
    };
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.tipo).toBe('FINANCIACION');
    expect(gasto?.deducible).toBe(false);
    expect(analizarDeducibilidad(gasto!).origenDecision).toBe('DEDUCIBLE');
    expect(esGastoDeducible(gasto!)).toBe(false);
    const informe = generarInformeFiscalOperaciones({ gastos: [gasto!], ejercicio: 2026 });
    expect(informe.totales.totalDeducible).toBe(0);
    expect(informe.totales.totalNoDeducible).toBe(40);
    expect(informe.incidencias).toEqual([]);

    // Sin ninguna decisión marcada y con categoría fuera de la lista cerrada, la
    // deducibilidad NO es inferible: el circuito lo declara en lugar de inventarla.
    const sinDecision: Gasto = { ...gasto!, categoria: 'OTRO', deducible: undefined };
    expect(analizarDeducibilidad(sinDecision).origenDecision).toBe('NO_INFERIBLE');
    expect(esGastoDeducible(sinDecision)).toBe(false);
    const informeSinDecision = generarInformeFiscalOperaciones({ gastos: [sinDecision], ejercicio: 2026 });
    expect(informeSinDecision.totales.totalNoDeducible).toBe(40);
    expect(informeSinDecision.incidencias.map((i) => i.codigo)).toEqual(['DEDUCIBILIDAD_NO_INFERIBLE']);
  });

  it('cambio de clasificación: la decisión explícita manda y se refleja en todos los consumidores', () => {
    const { gasto } = gastoDeFacturaDelRecorrido();
    const noDeducible: Gasto = { ...gasto, deducible: false };
    expect(analizarDeducibilidad(noDeducible).origenDecision).toBe('DEDUCIBLE');
    expect(esGastoDeducible(noDeducible)).toBe(false);
    expect(generarInformeFiscalOperaciones({ gastos: [noDeducible], ejercicio: 2026 }).totales).toMatchObject({
      totalDeducible: 0, totalNoDeducible: 120,
    });
    // Y el resto de consumidores ven lo mismo (fuente única, sin lógica paralela).
    expect(calcularTotalesGastos([noDeducible]).totalDeducible).toBe(0);
    expect(clasificarGastosDeducibilidad([noDeducible]).totalNoDeducible).toBe(120);

    // Reclasificación inversa: alias fiscal explícito sobre categoría no inferible.
    const reclasificado: Gasto = { ...gasto, categoria: 'OTRO', deducible: undefined, esDeducible: true };
    expect(analizarDeducibilidad(reclasificado).origenDecision).toBe('ES_DEDUCIBLE');
    expect(esGastoDeducible(reclasificado)).toBe(true);
    expect(generarInformeFiscalOperaciones({ gastos: [reclasificado], ejercicio: 2026 }).totales.totalDeducible).toBe(120);
  });

  it('inclusión/exclusión del informe: el ejercicio del motor fiscal decide, no el informe', () => {
    const { gasto } = gastoDeFacturaDelRecorrido();
    expect(generarInformeFiscalOperaciones({ gastos: [gasto], ejercicio: 2026 }).filas).toHaveLength(1);
    expect(generarInformeFiscalOperaciones({ gastos: [gasto], ejercicio: 2025 }).filas).toHaveLength(0);
    const conEjercicioForzado: Gasto = { ...gasto, ejercicioFiscal: 2025 };
    expect(generarInformeFiscalOperaciones({ gastos: [conEjercicioForzado], ejercicio: 2026 }).filas).toHaveLength(0);
    expect(generarInformeFiscalOperaciones({ gastos: [conEjercicioForzado], ejercicio: 2025 }).filas).toHaveLength(1);
  });

  it('ANULADO: no genera gasto nuevo, no computa en el informe y no rompe la trazabilidad', () => {
    const operacion = operacionDesdeFacturaOperativa(base().estado.entidades, 'factura-demo', PROPIETARIO_A)!;
    const anulada = { ...operacion, estado: 'ANULADO' as const };
    expect(puedeGenerarGastoDesdeOperacion(anulada, INMUEBLES)).toEqual({
      valido: false, motivo: 'Una operación anulada no genera gasto; conserva el documento original',
    });
    const intento = generarGastoDesdeOperacion({ operacion: anulada, inmuebles: INMUEBLES, ahora: AHORA });
    expect(intento.gasto).toBeUndefined();
    expect(intento.error).toContain('anulada');

    // Gasto anulado ya persistido: no computa, se informa aparte y sigue siendo auditable.
    const { gasto } = gastoDeFacturaDelRecorrido();
    const gastoAnulado: Gasto = { ...gasto, estado: 'ANULADO', fechaPago: undefined };
    const informe = generarInformeFiscalOperaciones({ gastos: [gastoAnulado], ejercicio: 2026 });
    expect(informe.filas).toHaveLength(0);
    expect(informe.totales).toEqual({
      total: 0, totalDeducible: 0, totalNoDeducible: 0, count: 0, countDeducible: 0, countNoDeducible: 0,
    });
    expect(informe.incidencias.map((i) => i.codigo)).toEqual(['GASTO_ANULADO']);
    // Coherencia con la fiscalidad existente: los agregados fiscales ya lo ignoraban.
    expect(clasificarGastosDeducibilidad([gastoAnulado])).toMatchObject({ totalDeducible: 0, totalNoDeducible: 0 });
    expect(calcularGastosEjercicio([gastoAnulado], 2026).total).toBe(0);
    // La trazabilidad del documento anulado se conserva (no se borra la historia).
    expect(reconstruirTrazabilidadGasto(gastoAnulado).eslabones.map((e) => e.eslabon)).toEqual([
      'INMUEBLE', 'INCIDENCIA', 'REPARACION', 'PROVEEDOR', 'PRESUPUESTO', 'FACTURA',
      'GASTO', 'DEDUCIBILIDAD', 'DOCUMENTO',
    ]);
  });
});

// ---------------------------------------------------------------------------
// TRAZABILIDAD
// ---------------------------------------------------------------------------

describe('BLOQUE 5 · TRAZABILIDAD (cadena reconstruible desde el propio gasto)', () => {
  it('incidencia → reparación → proveedor → presupuesto → factura → gasto → deducibilidad → documento', () => {
    const { gasto } = gastoDeFacturaDelRecorrido();
    const trazabilidad = reconstruirTrazabilidadGasto(gasto);
    expect(trazabilidad.eslabones).toEqual([
      { eslabon: 'INMUEBLE', id: 'inm-demo-1' },
      { eslabon: 'INCIDENCIA', id: 'incidencia-demo' },
      { eslabon: 'REPARACION', id: 'reparacion-demo' },
      { eslabon: 'PROVEEDOR', id: 'proveedor-demo', detalle: 'Taller ficticio' },
      { eslabon: 'PRESUPUESTO', id: 'presupuesto-demo' },
      { eslabon: 'FACTURA', id: 'factura-demo' },
      { eslabon: 'GASTO', id: gasto.id },
      { eslabon: 'DEDUCIBILIDAD', detalle: 'DEDUCIBLE (DEDUCIBLE)' },
      { eslabon: 'DOCUMENTO', id: 'archivo-demo', detalle: 'parte-ficticio.pdf' },
    ]);
  });

  it('cadena completa: inmueble → incidencia → reparación → OT → proveedor → presupuesto → factura → gasto → deducibilidad → documento', () => {
    const estado = recorrido();
    // La factura del proveedor se ejecutó dentro de una orden de trabajo (modelo
    // patrimonial existente: `TrabajoProfesional` → `ordenTrabajoId`), así que la
    // cadena completa incluye los diez eslabones a la vez.
    const operacion = {
      ...operacionDesdeFacturaOperativa(estado.entidades, 'factura-demo', PROPIETARIO_A)!,
      ordenTrabajoId: 'ot-1',
    };
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    const trazabilidad = reconstruirTrazabilidadGasto(gasto!);
    expect(trazabilidad.eslabones.map((e) => e.eslabon)).toEqual([
      'INMUEBLE', 'INCIDENCIA', 'REPARACION', 'ORDEN_TRABAJO', 'PROVEEDOR', 'PRESUPUESTO',
      'FACTURA', 'GASTO', 'DEDUCIBILIDAD', 'DOCUMENTO',
    ]);
    expect(trazabilidad.eslabones.find((e) => e.eslabon === 'ORDEN_TRABAJO')?.id).toBe('ot-1');
    expect(trazabilidad.avisos).toEqual([]);
    // Y el informe fiscal del ejercicio lista ese mismo gasto con su origen.
    const informe = generarInformeFiscalOperaciones({ gastos: [gasto!], ejercicio: 2026, soloOperaciones: true });
    expect(informe.filas).toHaveLength(1);
    expect(informe.filas[0].trazabilidad.eslabones).toEqual(trazabilidad.eslabones);
  });

  it('mantenimiento: la cadena incluye OT y presupuesto/factura solo si existen de verdad', () => {
    const tarea = tareaMantenimiento({ ultimaOrdenTrabajoId: 'ot-1', ultimaIncidenciaId: 'incidencia-demo' });
    const operacion = operacionDesdeTareaMantenimiento(tarea, { fechaRealizacion: '2026-03-02', costeReal: 90 })!;
    const { gasto } = generarGastoDesdeOperacion({
      operacion, inmuebles: INMUEBLES, ahora: AHORA,
      usuarioNombre: 'Gestora ficticia', usuarioId: USUARIO.id,
    });
    const trazabilidad = reconstruirTrazabilidadGasto(gasto!);
    expect(trazabilidad.eslabones.map((e) => e.eslabon))
      .toEqual(['INMUEBLE', 'INCIDENCIA', 'ORDEN_TRABAJO', 'PROVEEDOR', 'GASTO', 'DEDUCIBILIDAD']);
    // Sin documento aportado, el aviso es real (no se inventa justificante).
    expect(trazabilidad.presencia.documento).toBe(false);
    expect(trazabilidad.avisos).toEqual(['SIN_DOCUMENTO: no hay factura/comprobante asociado al gasto']);
  });

  it('un gasto ajeno al circuito declara su falta de operación sin romper la reconstrucción', () => {
    const manual: Gasto = {
      id: 'gas_manual_1', inmuebleId: 'inm-demo-1', propietarioId: PROPIETARIO_A, tipo: 'EXPLOTACION',
      categoria: 'COMUNIDAD', concepto: 'Cuota de comunidad', importe: 60, estado: 'PAGADO',
      fechaDevengo: '2026-02-01', periodoMesAnio: '2026-02', aCargoDe: 'arrendador', deducible: true,
      createdAt: AHORA, updatedAt: AHORA,
    };
    const trazabilidad = reconstruirTrazabilidadGasto(manual);
    expect(esGastoDeOperacion(manual)).toBe(false);
    expect(trazabilidad.avisos).toContain('SIN_OPERACION: el gasto no declara operación de origen (origen+origenId)');
    expect(generarInformeFiscalOperaciones({ gastos: [manual], ejercicio: 2026, soloOperaciones: true }).filas).toHaveLength(0);
    expect(generarInformeFiscalOperaciones({ gastos: [manual], ejercicio: 2026 }).filas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// IDEMPOTENCIA
// ---------------------------------------------------------------------------

describe('BLOQUE 5 · IDEMPOTENCIA (la misma operación no genera dos gastos)', () => {
  it('mantenimiento: repetir la misma actuación reescribe el mismo gasto; otra actuación es otro gasto', () => {
    const tarea = tareaMantenimiento();
    const primera = operacionDesdeTareaMantenimiento(tarea, { fechaRealizacion: '2026-03-02', costeReal: 120 })!;
    const reintento = operacionDesdeTareaMantenimiento(tarea, { fechaRealizacion: '2026-03-02', costeReal: 120 })!;
    expect(idGastoDeOperacion(primera)).toBe('gop_mantenimiento_mant_1_2026-03-02');
    expect(idGastoDeOperacion(reintento)).toBe(idGastoDeOperacion(primera));

    const { gasto } = generarGastoDesdeOperacion({ operacion: primera, inmuebles: INMUEBLES, ahora: AHORA });
    const segundo = generarGastoDesdeOperacion({
      operacion: reintento, inmuebles: INMUEBLES, gastosExistentes: [gasto!], ahora: AHORA,
    });
    expect(segundo.yaExiste).toBe(true);
    expect(segundo.gasto?.id).toBe(gasto!.id);
    // Localizable por la operación/tarea, no solo por el ID del documento.
    expect(buscarGastoDeOperacion([gasto!], { tipo: 'MANTENIMIENTO', operacionId: 'mant_1' })).toBe(gasto);
    expect(gasto!.origenId).toBe('mant_1');

    // La siguiente actuación del plan periódico es un hecho económico distinto.
    const siguiente = operacionDesdeTareaMantenimiento(tarea, { fechaRealizacion: '2027-03-02', costeReal: 130 })!;
    expect(idGastoDeOperacion(siguiente)).toBe('gop_mantenimiento_mant_1_2027-03-02');
    expect(idGastoDeOperacion(siguiente)).not.toBe(idGastoDeOperacion(primera));
    expect(siguiente.operacionId).toBe(primera.operacionId);
  });

  it('mantenimiento: una actuación ya registrada antes del puente reutiliza su gasto, no crea otro', () => {
    const tarea = tareaMantenimiento({
      ultimaFechaRealizada: '2026-03-02',
      ultimoGastoId: 'gasto_mant_mant_1_1699999999999',
      historialActuaciones: [{
        id: 'act_1', fecha: '2026-03-02T10:00:00.000Z', fechaRealizacion: '2026-03-02',
        gastoId: 'gasto_mant_mant_1_1699999999999', observaciones: 'Actuación previa', realizadoPor: 'Gestora ficticia',
      }],
    });
    expect(gastoIdDeActuacion(tarea, '2026-03-02')).toBe('gasto_mant_mant_1_1699999999999');
    expect(gastoIdDeActuacion(tarea, '2026-03-02T00:00:00.000Z')).toBe('gasto_mant_mant_1_1699999999999');
    expect(gastoIdDeActuacion(tarea, '2027-03-02')).toBeUndefined();

    const operacion = operacionDesdeTareaMantenimiento(tarea, {
      fechaRealizacion: '2026-03-02', costeReal: 120, gastoIdExistente: gastoIdDeActuacion(tarea, '2026-03-02'),
    })!;
    expect(idGastoDeOperacion(operacion)).toBe('gasto_mant_mant_1_1699999999999');
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.id).toBe('gasto_mant_mant_1_1699999999999');
    // Y sigue siendo localizable por la operación.
    expect(buscarGastoDeOperacion([gasto!], { tipo: 'MANTENIMIENTO', operacionId: 'mant_1' })).toBe(gasto);
  });

  it('reparación y factura: identidad determinista por operación y reintento sin duplicar', () => {
    const s = base();
    enCurso(s);
    s.modificar('reparacion', { fechaFin: '2026-09-27', costeCentimos: 5000, resultado: 'Reparada', materiales: [] });
    s.cambiar('reparacion', 'FINALIZADA');
    const operacionReparacion = operacionDesdeReparacionOperativa(s.estado.entidades, 'reparacion-demo', PROPIETARIO_A)!;
    expect(idGastoDeOperacion(operacionReparacion)).toBe('gop_reparacion_reparacion-demo');
    const { gasto } = generarGastoDesdeOperacion({ operacion: operacionReparacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.id).toBe('gop_reparacion_reparacion-demo');
    const repetida = generarGastoDesdeOperacion({
      operacion: operacionReparacion, inmuebles: INMUEBLES, gastosExistentes: [gasto!], ahora: AHORA,
    });
    expect(repetida.yaExiste).toBe(true);
    expect(repetida.gasto?.id).toBe(gasto!.id);

    const operacionFactura = operacionDesdeFacturaOperativa(recorrido().entidades, 'factura-demo', PROPIETARIO_A)!;
    expect(idGastoDeOperacion(operacionFactura)).toBe('gop_factura_factura-demo');
  });

  it('el ID del documento es estable y seguro (sin reloj ni aleatoriedad implícitos)', () => {
    const operacion = { tipo: 'FACTURA' as const, operacionId: 'factura con espacios/raros#1' };
    const id = idGastoDeOperacion(operacion);
    expect(id).toBe(idGastoDeOperacion({ ...operacion }));
    expect(id).toMatch(/^gop_factura_factura_con_espacios_raros_1$/);
    expect(id).not.toMatch(/\d{13}/); // sin Date.now()
  });
});

// ---------------------------------------------------------------------------
// AISLAMIENTO
// ---------------------------------------------------------------------------

describe('BLOQUE 5 · AISLAMIENTO (ni otro inmueble ni otro titular)', () => {
  it('una operación no puede generar un gasto en un inmueble de otro titular', () => {
    const check = puedeGenerarGastoDesdeOperacion({
      tipo: 'INCIDENCIA', operacionId: 'incidencia-demo', inmuebleId: 'inm-demo-3',
      propietarioId: PROPIETARIO_A, fecha: '2026-09-26', importe: 100,
    }, INMUEBLES);
    expect(check.valido).toBe(false);
    expect(check.motivo).toContain('aislamiento por inmueble');

    const inexistente = puedeGenerarGastoDesdeOperacion({
      tipo: 'INCIDENCIA', operacionId: 'incidencia-demo', inmuebleId: 'inm-inexistente',
      propietarioId: PROPIETARIO_A, fecha: '2026-09-26', importe: 100,
    }, INMUEBLES);
    expect(inexistente.motivo).toContain('no existe');
  });

  it('la operación válida de otro titular se registra en SU inmueble y no en el ajeno', () => {
    const operacion = {
      tipo: 'INCIDENCIA' as const, operacionId: 'incidencia-b', inmuebleId: 'inm-demo-3',
      propietarioId: PROPIETARIO_B, fecha: '2026-09-26', importe: 100, descripcion: 'Aviso ficticio',
    };
    const { gasto } = generarGastoDesdeOperacion({ operacion, inmuebles: INMUEBLES, ahora: AHORA });
    expect(gasto?.inmuebleId).toBe('inm-demo-3');
    expect(gasto?.propietarioId).toBe(PROPIETARIO_B);
    // No aparece en el informe del otro inmueble.
    const { gasto: gastoA } = gastoDeFacturaDelRecorrido();
    const informe = generarInformeFiscalOperaciones({ gastos: [gastoA, gasto!], ejercicio: 2026, inmuebleId: 'inm-demo-1' });
    expect(informe.filas.map((f) => f.gastoId)).toEqual([gastoA.id]);
    const informeB = generarInformeFiscalOperaciones({ gastos: [gastoA, gasto!], ejercicio: 2026, propietarioId: PROPIETARIO_B });
    expect(informeB.filas.map((f) => f.gastoId)).toEqual([gasto!.id]);
    // Y el gasto de cada inmueble se localiza solo por su propia operación.
    expect(buscarGastoDeOperacion([gastoA], { tipo: 'INCIDENCIA', operacionId: 'incidencia-b' })).toBeUndefined();
  });

  it('las entidades del inmueble no se mezclan entre inmuebles ni entre propietarios', () => {
    const estado = recorrido();
    const deA = entidadesDelInmueble(estado.entidades, PROPIETARIO_A, 'inm-demo-1');
    expect(deA.length).toBe(estado.entidades.length); // todo el recorrido es del inmueble ficticio 1
    expect(deA.every((e) => e.tipo === 'proveedor'
      ? e.propietarioId === PROPIETARIO_A
      : e.ambito.inmuebleId === 'inm-demo-1' && e.ambito.propietarioId === PROPIETARIO_A)).toBe(true);
    // El catálogo de proveedores vive por propietario (no por inmueble), igual que
    // en el módulo de Operaciones; ninguna entidad de inmueble se cuela en otro.
    const deOtroInmueble = entidadesDelInmueble(estado.entidades, PROPIETARIO_A, 'inm-demo-2');
    expect(deOtroInmueble.map((e) => e.tipo)).toEqual(['proveedor']);
    expect(entidadesDelInmueble(estado.entidades, PROPIETARIO_B, 'inm-demo-1')).toEqual([]);
    expect(entidadesDelInmueble(estado.entidades, PROPIETARIO_B, 'inm-demo-3')).toEqual([]);
  });

  it('el ámbito del recorrido real sigue siendo el inmueble del contexto (no se amplía por el bloque)', () => {
    const estado = recorrido();
    for (const entidad of estado.entidades) {
      if (entidad.tipo === 'proveedor') continue;
      expect(entidad.ambito).toEqual({ propietarioId: PROPIETARIO_A, inmuebleId: 'inm-demo-1' });
    }
    expect(CONTEXTO_FICTICIO.ambito).toEqual({ propietarioId: PROPIETARIO_A, inmuebleId: 'inm-demo-1' });
  });
});

// ---------------------------------------------------------------------------
// REGRESIÓN (contratos existentes)
// ---------------------------------------------------------------------------

describe('BLOQUE 5 · REGRESIÓN (deducibilidad, fiscalidad, exportaciones y motores existentes)', () => {
  it('la deducibilidad la decide una única fuente: fiscalEngine reexporta la misma función', () => {
    expect(esGastoDeducibleFiscal).toBe(esGastoDeducible);
  });

  it('fiscalidad anual: el gasto del circuito entra en el resumen del ejercicio con el mismo importe', () => {
    const { gasto } = gastoDeFacturaDelRecorrido();
    const resumen = generarResumenFiscalAnual('inm-demo-1', 2026, [INMUEBLE_A], [], [gasto], USUARIO, 'Gestora ficticia');
    expect(resumen).not.toBeNull();
    expect(resumen!.gastos.totalDeducible).toBe(120);
    expect(resumen!.gastos.gastosConJustificante).toBe(1);
    expect(resumen!.gastos.gastosVinculadosOT).toBe(1); // la incidencia/OT vinculada se cuenta igual que antes
  });

  it('gastos: el total deducible usa la fuente única (un gasto sin campo marcado ya computa por categoría)', () => {
    const sinCampo: Gasto = {
      id: 'gas_sin_campo', inmuebleId: 'inm-demo-1', propietarioId: PROPIETARIO_A, tipo: 'EXPLOTACION',
      categoria: 'REPARACION', concepto: 'Reparación sin campo deducible', importe: 90, estado: 'PAGADO',
      fechaDevengo: '2026-04-01', periodoMesAnio: '2026-04', aCargoDe: 'arrendador', createdAt: AHORA, updatedAt: AHORA,
    };
    expect(calcularTotalesGastos([sinCampo]).totalDeducible).toBe(90);
    const financiacion: Gasto = { ...sinCampo, id: 'gas_fin', categoria: 'CUOTA_HIPOTECARIA', tipo: 'FINANCIACION', importe: 500 };
    expect(calcularTotalesGastos([financiacion]).totalDeducible).toBe(0);
    expect(calcularTotalesGastos([sinCampo, financiacion])).toMatchObject({ totalDeducible: 90, totalPagado: 590 });
  });

  it('exportación fiscal: conserva los campos históricos y añade el origen de la operación y el documento', () => {
    const { gasto } = gastoDeFacturaDelRecorrido();
    const exportacion = generarExportacionFiscal(
      PROPIETARIO_A, [INMUEBLE_A], [], [gasto],
      { fechaInicio: '2026-01-01', fechaFin: '2026-12-31', periodo: 'ANUAL', ejercicio: 2026 }, USUARIO, 'JSON',
    );
    const item = exportacion.items.find((i) => i.referenciaId === gasto.id)!;
    expect(item).toMatchObject({
      tipo: 'GASTO',
      origen: 'GASTO', // el contrato histórico no cambia
      importe: 120,
      esDeducible: true,
      categoria: 'REPARACION',
      origenOperacion: 'FACTURA',
      origenOperacionId: 'factura-demo',
      documentoId: 'archivo-demo',
    });
    const csv = exportarCSV(exportacion);
    expect(csv.split('\n')[0]).toContain('origenOperacion,origenOperacionId,documentoId');
    expect(csv).toContain('FACTURA,factura-demo,archivo-demo');
    const json = JSON.parse(exportarJSON(exportacion));
    const itemJSON = json.items.find((i: { referenciaId: string }) => i.referenciaId === gasto.id);
    expect(itemJSON.origenOperacionId).toBe('factura-demo');
    expect(itemJSON.documentoId).toBe('archivo-demo');
    // El gasto anulado sigue sin aportar importe deducible al informe del ejercicio.
    expect(calcularGastosEjercicio([{ ...gasto, estado: 'ANULADO' }], 2026).totalDeducible).toBe(0);
  });
});
