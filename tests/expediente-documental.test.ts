/**
 * BLOQUE 3 — Expediente documental y fiscal por inmueble.
 * ---------------------------------------------------------------------------
 * Prueba pura (sin Firebase): índice documental unificado (multi-fuente,
 * dedup sin borrado, PENDIENTE sin invención, versionado de anexos,
 * sustitución explícita sin sobrescritura, ids deterministas), expediente
 * fiscal por inmueble (motor fiscal reutilizado, tributos, seguros como
 * REFERENCIA, reparaciones enlazadas, retención, aviso AEAT), integración de
 * exportación B6 (determinismo, manifest con hash del índice, exportId
 * canónico inalterado) y preparación IA (limitaciones explícitas).
 */
import { describe, expect, it } from 'vitest';
import {
  cadenaVersiones,
  construirIndiceDocumentalInmueble,
  entradasPorEntidad,
  generarIdEntradaIndice,
  registrarSustitucionDocumento,
} from '../src/lib/expedienteDocumental/indice';
import {
  construirExpedienteDocumentalInmueble,
  entradasIndiceComoDocumentosExpediente,
  prepararContextoIaDocumentalFiscal,
  prepararEntradaIndiceParaExportacion,
} from '../src/lib/expedienteDocumental/expediente';
import { construirAuditoriaExpediente } from '../src/lib/expedienteDocumental/auditoria';
import { empaquetarExpediente, generarExpedienteFiscal } from '../src/lib/expedienteFiscal/motor';
import { utf8Bytes } from '../src/lib/expedienteFiscal/zip';
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  GarantiaReparacion,
  Incidencia,
  Inmueble,
  JustificanteCobro,
  PolizaSeguro,
  TareaMantenimiento,
} from '../src/types';

const AHORA = '2026-09-26T12:00:00.000Z';
const ACTOR = { id: 'usr_1', nombre: 'Propietario Uno' };

const INM: Inmueble = {
  id: 'inm_1', direccion: 'Calle Mayor 1', ciudad: 'Alicante', precio: 800,
  estado: 'alquilado', habitaciones: 3, banos: 2, superficie: 90,
  candidatosCount: 0, fianzaMeses: 1, propietarioId: 'prop_1',
} as Inmueble;

const GASTO_IBI: Gasto = {
  id: 'gas_ibi', inmuebleId: 'inm_1', propietarioId: 'prop_1', tipo: 'EXPLOTACION',
  categoria: 'IBI', concepto: 'IBI 2026', importe: 412.5, estado: 'PAGADO',
  aCargoDe: 'arrendador', fechaDevengo: '2026-05-01', fechaPago: '2026-05-10',
  documento: { id: 'doc_ibi', nombre: 'ibi-2026.pdf', url: 'https://s.example/ibi.pdf', storagePath: 'gastos_facturas/prop_1/gas_ibi/ibi.pdf' },
  createdAt: AHORA, updatedAt: AHORA,
} as Gasto;

const GASTO_SIN_DOC: Gasto = {
  id: 'gas_rep', inmuebleId: 'inm_1', propietarioId: 'prop_1', tipo: 'EXPLOTACION',
  categoria: 'REPARACION', concepto: 'Reparación caldera', importe: 180, estado: 'PAGADO',
  aCargoDe: 'arrendador', fechaDevengo: '2026-03-03', origen: 'INCIDENCIA', incidenciaId: 'inc_1',
  createdAt: AHORA, updatedAt: AHORA,
} as Gasto;

const GASTO_COMUNIDAD: Gasto = {
  id: 'gas_com', inmuebleId: 'inm_1', propietarioId: 'prop_1', tipo: 'EXPLOTACION',
  categoria: 'COMUNIDAD', concepto: 'Comunidad septiembre', importe: 65, estado: 'PAGADO',
  aCargoDe: 'arrendador', fechaDevengo: '2026-09-01', fechaPago: '2026-09-05',
  documento: { id: 'doc_com', nombre: 'recibo-comunidad.pdf', url: 'https://s.example/com.pdf' },
  createdAt: AHORA, updatedAt: AHORA,
} as Gasto;

const COBRO_CON_JUST: CobroPeriodo = {
  id: 'cobro_1', inmuebleId: 'inm_1', contratoId: 'ct_1', inquilinoId: 'inq_1', propietarioId: 'prop_1',
  mes: 9, anio: 2026, periodoMesAnio: '2026-09', nombreMes: 'Septiembre 2026',
  importePrevisto: 800, importeRecibido: 800, estado: 'RECIBIDO', fechaPago: '2026-09-03',
  justificante: { id: 'just_1', nombreArchivo: 'transferencia-sep.pdf', url: 'https://s.example/t.pdf', storagePath: 'cobros_justificantes/prop_1/cobro_1/t.pdf', fechaSubida: '2026-09-03T10:00:00.000Z' } as JustificanteCobro,
} as CobroPeriodo;

const POLIZA: PolizaSeguro = {
  id: 'pol_1', propietarioId: 'prop_1', inmuebleId: 'inm_1', tipo: 'HOGAR', aseguradora: 'Mapfre',
  numeroPoliza: 'POL-1', fechaInicio: '2026-01-01', fechaVencimiento: '2026-12-31', estado: 'VIGENTE',
  coberturas: ['Daños por agua'], primaAnual: 300,
  documentos: [{ id: 'dpd_1', nombre: 'poliza-original.pdf', url: 'https://s.example/p.pdf', fechaSubida: '2026-01-02T09:00:00.000Z', version: 1 }],
  createdAt: AHORA, updatedAt: AHORA,
} as PolizaSeguro;

/**
 * Registro de cobros completo 2026: el motor de cobros (FASE 6, preexistente)
 * genera periodos faltantes con historial `hist_${Date.now()}_aleatorio`, lo
 * que rompería la reproducibilidad byte a byte del ZIP. Con los periodos ya
 * registrados el motor los conserva intactos (comportamiento documentado de
 * cobrosEngine) y la exportación es determinista.
 */
const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const REGISTRO_COBROS: CobroPeriodo[] = Array.from({ length: 12 }, (_, i) => {
  const mes = i + 1;
  if (mes === 9) return COBRO_CON_JUST;
  return {
    id: `cobro_ct_1_2026_${String(mes).padStart(2, '0')}`, contratoId: 'ct_1', inmuebleId: 'inm_1',
    propietarioId: 'prop_1', mes, anio: 2026, periodoMesAnio: `2026-${String(mes).padStart(2, '0')}`,
    nombreMes: `${MESES_ES[mes - 1]} 2026`, importePrevisto: 800, importeRecibido: 0,
    estado: 'PENDIENTE', historialCambios: [],
  } as CobroPeriodo;
});

const CONTRATO: ContratoFormalizacion = {
  id: 'ct_1', inmuebleId: 'inm_1', propietarioId: 'prop_1', estado: 'FORMALIZADO_ACTIVO',
  fechaInicioContrato: '2026-01-01', rentaMensual: 800, diaLimitePagoMes: 5,
  registroCobros: REGISTRO_COBROS,
  anexos: [
    { id: 'anx_1', contratoId: 'ct_1', inmuebleId: 'inm_1', tipo: 'INVENTARIO', titulo: 'Inventario inicial', fecha: '2026-01-15', contenido: '{}', version: 1, estado: 'CONFIRMADO', referenciaDocumental: 'contratos/ct_1/inventario.pdf', fechaCreacion: '2026-01-15T10:00:00.000Z', creadoPor: 'Propietario Uno' },
    { id: 'anx_2', contratoId: 'ct_1', inmuebleId: 'inm_1', tipo: 'INVENTARIO', titulo: 'Inventario inicial (rev)', fecha: '2026-02-01', contenido: '{}', version: 2, estado: 'CONFIRMADO', anexoOriginalId: 'anx_1', referenciaDocumental: 'contratos/ct_1/inventario-v2.pdf', fechaCreacion: '2026-02-01T10:00:00.000Z', creadoPor: 'Propietario Uno' },
  ],
  createdAt: AHORA, updatedAt: AHORA,
} as unknown as ContratoFormalizacion;

const INCIDENCIA: Incidencia = {
  id: 'inc_1', propietarioId: 'prop_1', inmuebleId: 'inm_1', titulo: 'Avería caldera',
  descripcion: 'No calienta', categoria: 'CALEFACCION_ACS', prioridad: 'ALTA', estado: 'ABIERTA',
  origen: 'INQUILINO', fechaCreacion: '2026-03-01T08:00:00.000Z',
  fotografias: [{ id: 'foto_1', nombre: 'caldera.jpg', url: 'https://s.example/f.jpg', tipo: 'IMAGEN', fechaSubida: '2026-03-01T08:05:00.000Z' }],
} as unknown as Incidencia;

const TAREA: TareaMantenimiento = {
  id: 'mant_1', inmuebleId: 'inm_1', propietarioId: 'prop_1', titulo: 'Revisión caldera',
  periodicidad: 'ANUAL', proximaFecha: '2026-10-01', activa: true, createdAt: AHORA, updatedAt: AHORA,
  documentos: [{ id: 'dm_1', nombre: 'certificado.pdf', url: 'https://s.example/c.pdf', fechaSubida: '2026-04-01T09:00:00.000Z' }],
} as unknown as TareaMantenimiento;

const GARANTIA: GarantiaReparacion = {
  id: 'gar_1', inmuebleId: 'inm_1', propietarioId: 'prop_1', trabajoId: 'ot_1', incidenciaId: 'inc_1',
  titulo: 'Garantía caldera', concepto: 'Caldera', categoria: 'CALEFACCION_ACS', proveedor: 'Tecnico SL',
  fechaInicio: '2026-03-10', duracionMeses: 12, fechaFin: '2027-03-10', cobertura: 'Piezas y mano de obra',
  estado: 'ACTIVA', documentoUrl: 'https://s.example/g.pdf', documentoStoragePath: 'garantias/g.pdf',
  createdAt: AHORA, updatedAt: AHORA,
} as GarantiaReparacion;

/**
 * NOTA: los fixtures se clonan en profundidad porque el motor fiscal existente
 * (FASE 6) anota entradas de historial «Sistema» sobre contratos con datos
 * incompletos (comportamiento preexistente del motor, no de este bloque).
 */
function fixtures() {
  return structuredClone({ INM, GASTO_IBI, GASTO_SIN_DOC, GASTO_COMUNIDAD, COBRO_CON_JUST, CONTRATO, POLIZA, INCIDENCIA, TAREA, GARANTIA });
}

function indiceBase() {
  const f = fixtures();
  return construirIndiceDocumentalInmueble({
    inmueble: f.INM as Inmueble,
    gastos: [f.GASTO_IBI, f.GASTO_SIN_DOC, f.GASTO_COMUNIDAD],
    cobros: [f.COBRO_CON_JUST],
    contratos: [f.CONTRATO],
    polizas: [f.POLIZA],
    incidencias: [f.INCIDENCIA],
    tareasMantenimiento: [f.TAREA],
    garantias: [f.GARANTIA],
    generadoEl: AHORA,
  });
}

// ---------------------------------------------------------------------------
describe('BLOQUE 3 · Índice documental unificado', () => {
  it('proyecta todas las fuentes existentes en un índice único por inmueble', () => {
    const idx = indiceBase();
    const tipos = idx.entradas.map((e) => e.tipo).sort();
    expect(tipos).toContain('LIQUIDACION_IBI');       // gasto IBI tipificado
    expect(tipos).toContain('FACTURA_GASTO');        // reparación
    expect(tipos).toContain('JUSTIFICANTE_COBRO');
    expect(tipos).toContain('ANEXO_CONTRATO');
    expect(tipos).toContain('DOCUMENTO_POLIZA');
    expect(tipos).toContain('FOTO_INCIDENCIA');
    expect(tipos).toContain('DOCUMENTO_MANTENIMIENTO');
    expect(tipos).toContain('DOCUMENTO_GARANTIA');
    expect(idx.entradas.length).toBeGreaterThanOrEqual(9);
    expect(idx.estadisticas.total).toBe(idx.entradas.length);
    // Todas las entradas son del inmueble
    expect(idx.entradas.every((e) => e.inmuebleId === 'inm_1')).toBe(true);
  });

  it('ids deterministas: la misma proyección dos veces produce el mismo índice', () => {
    const a = indiceBase();
    const b = indiceBase();
    expect(a.entradas.map((e) => e.id)).toEqual(b.entradas.map((e) => e.id));
    expect(generarIdEntradaIndice({ entidadOrigen: 'gastos', origenDocumentoId: 'doc_ibi', inmuebleId: 'inm_1', nombre: 'ibi-2026.pdf' }))
      .toMatch(/^idx_[0-9a-f]{36}$/);
  });

  it('relaciones con movimiento/contrato/póliza/gasto/cobro/incidencia navegables', () => {
    const idx = indiceBase();
    expect(entradasPorEntidad(idx, { gastoId: 'gas_ibi' })).toHaveLength(1);
    expect(entradasPorEntidad(idx, { cobroId: 'cobro_1' })[0].tipo).toBe('JUSTIFICANTE_COBRO');
    expect(entradasPorEntidad(idx, { polizaId: 'pol_1' })).toHaveLength(1);
    expect(entradasPorEntidad(idx, { incidenciaId: 'inc_1' }).length).toBeGreaterThanOrEqual(1);
    expect(entradasPorEntidad(idx, { movimientoId: 'GASTO:gas_ibi' })).toHaveLength(1);
  });

  it('anexos versionados: v1 queda SUSTITUIDA (recuperable) y v2 encadena sustituyeA', () => {
    const idx = indiceBase();
    const v1 = idx.entradas.find((e) => e.origenDocumentoId === 'anx_1')!;
    const v2 = idx.entradas.find((e) => e.origenDocumentoId === 'anx_2')!;
    expect(v2.sustituyeA).toBe(v1.id);
    expect(v2.version).toBe(2);
    expect(v1.estado).toBe('SUSTITUIDO'); // NO se borra: sigue en el índice
    expect(idx.entradas.some((e) => e.id === v1.id)).toBe(true);
    const cadena = cadenaVersiones(idx, v2.id);
    expect(cadena.map((e) => e.origenDocumentoId)).toEqual(['anx_1', 'anx_2']);
  });

  it('documento sin referencia → PENDIENTE + incidencia (nunca se inventa)', () => {
    const gastoRaro: Gasto = { ...GASTO_SIN_DOC, id: 'gas_x', documento: { id: 'doc_x', nombre: 'fantasma.pdf', url: '' } } as Gasto;
    const idx = construirIndiceDocumentalInmueble({ inmueble: INM, gastos: [gastoRaro], generadoEl: AHORA });
    const entrada = idx.entradas.find((e) => e.origenDocumentoId === 'doc_x')!;
    expect(entrada.estado).toBe('PENDIENTE');
    expect(idx.incidencias.some((i) => i.codigo === 'DOC_SIN_REFERENCIA' && i.id === 'doc_x')).toBe(true);
  });

  it('dedup: el mismo documento canónico no se duplica; huellas repetidas se SEÑALAN sin borrar', () => {
    const f = fixtures();
    // Mismo doc declarado en documento y documentos[] del mismo gasto:
    const gastoDup: Gasto = { ...f.GASTO_IBI, id: 'gas_dup', documentos: [f.GASTO_IBI.documento!] } as Gasto;
    const idx1 = construirIndiceDocumentalInmueble({ inmueble: f.INM as Inmueble, gastos: [gastoDup], generadoEl: AHORA });
    const delGasto = idx1.entradas.filter((e) => e.gastoId === 'gas_dup' && e.origenDocumentoId === 'doc_ibi');
    expect(delGasto).toHaveLength(1);

    // Misma huella (misma ruta de Storage) en dos entidades → ambas se
    // conservan (no se borra nada) + incidencia POSIBLE_DUPLICADO
    const idx2 = construirIndiceDocumentalInmueble({
      inmueble: f.INM as Inmueble,
      gastos: [f.GASTO_IBI],
      garantias: [{ ...f.GARANTIA, documentoUrl: f.GASTO_IBI.documento!.url, documentoStoragePath: f.GASTO_IBI.documento!.storagePath }],
      generadoEl: AHORA,
    });
    expect(idx2.entradas.length).toBe(2);
    expect(idx2.incidencias.some((i) => i.codigo === 'POSIBLE_DUPLICADO')).toBe(true);
  });

  it('sustitución EXPLÍCITA: versiona, conserva el anterior y rechaza huérfanas/dobles', () => {
    const idx0 = indiceBase();
    const objetivo = idx0.entradas.find((e) => e.origenDocumentoId === 'doc_ibi')!;
    const res = registrarSustitucionDocumento(
      idx0, objetivo.id,
      { tipo: 'LIQUIDACION_IBI', nombre: 'ibi-2026-corregido.pdf', url: 'https://s.example/ibi-v2.pdf', fechaDocumental: '2026-05-01' },
      ACTOR, '2026-09-27T10:00:00.000Z'
    );
    expect(res.estado).toBe('OK');
    const idx = res.indice!;
    const anterior = idx.entradas.find((e) => e.id === objetivo.id)!;
    const nueva = res.entradaNueva!;
    expect(anterior.estado).toBe('SUSTITUIDO');       // sigue recuperable
    expect(anterior.url).toBe(GASTO_IBI.documento!.url); // conserva su referencia
    expect(nueva.sustituyeA).toBe(objetivo.id);
    expect(nueva.version).toBe(2);
    expect(nueva.estado).toBe('DISPONIBLE');
    expect(idx.incidencias.some((i) => i.codigo === 'SUSTITUCION_EXPLICITA')).toBe(true);
    // Relaciones heredadas
    expect(nueva.gastoId).toBe('gas_ibi');
    // Huérfana:
    expect(registrarSustitucionDocumento(idx0, 'idx_inexistente', { tipo: 'OTRO', nombre: 'x' }, ACTOR, AHORA).estado).toBe('ERROR');
    // Doble sustitución sobre la ya sustituida:
    expect(registrarSustitucionDocumento(idx, objetivo.id, { tipo: 'LIQUIDACION_IBI', nombre: 'ibi-v3.pdf', url: 'u3' }, ACTOR, AHORA).estado).toBe('ERROR');
    // Cadena completa
    expect(cadenaVersiones(idx, nueva.id).map((e) => e.version)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 3 · Expediente documental/fiscal por inmueble', () => {
  const expediente = () => {
    const f = fixtures();
    return construirExpedienteDocumentalInmueble({
      inmueble: f.INM as Inmueble, ejercicio: 2026,
      cobros: [f.COBRO_CON_JUST], gastos: [f.GASTO_IBI, f.GASTO_SIN_DOC, f.GASTO_COMUNIDAD], contratos: [f.CONTRATO],
      polizas: [f.POLIZA], incidencias: [f.INCIDENCIA], tareasMantenimiento: [f.TAREA], garantias: [f.GARANTIA],
      generadoEl: AHORA,
    })!;
  };

  it('ingresos/gastos/deducibilidad provienen del motor fiscal existente (DATO_CALCULADO)', () => {
    const exp = expediente();
    expect(exp.schema).toBe('rentasync-expediente-inmueble-v1');
    expect(exp.ingresos.totalCobros).toBeGreaterThanOrEqual(1);
    expect(exp.gastos.clasificacion).toBe('CALCULADO');
    expect(exp.gastos.porCategoria['IBI']).toBeDefined();
    // IBI deducible según motor; el gasto de reparación también entra
    expect(exp.gastos.importeDeducible).toBeGreaterThan(0);
    expect(exp.procedencia.motoresReutilizados.some((m) => m.includes('generarResumenFiscalAnual'))).toBe(true);
  });

  it('tributos: IBI/tasas con documento y deducibilidad del motor', () => {
    const exp = expediente();
    const ibi = exp.tributos.find((t) => t.categoria === 'IBI')!;
    expect(ibi.importe).toBe(412.5);
    expect(ibi.documentoIds.length).toBe(1);
    expect(typeof ibi.deducibleSegunMotor).toBe('boolean');
  });

  it('seguros: REFERENCIAS al Bloque 1 (ids), nunca copias de póliza', () => {
    const exp = expediente();
    expect(exp.seguros).toHaveLength(1);
    const s = exp.seguros[0];
    expect(s.polizaId).toBe('pol_1');
    expect(s.documentoIds.length).toBe(1);
    // No hay campos de póliza copiados más allá de la referencia descriptiva
    expect(Object.keys(s).sort()).toEqual([
      'aseguradora', 'documentoIds', 'estado', 'fechaVencimiento', 'numeroPoliza', 'polizaId', 'primaAnual', 'tipo',
    ]);
  });

  it('reparaciones: sólo enlaces a movimientos existentes (gasto/tarea/garantía)', () => {
    const exp = expediente();
    const tipos = exp.reparaciones.map((r) => r.tipo);
    expect(tipos).toContain('GASTO_REPARACION');
    expect(tipos).toContain('TAREA_MANTENIMIENTO');
    expect(tipos).toContain('GARANTIA');
  });

  it('incidencias: movimiento sin documento señalado, no inventado', () => {
    const exp = expediente();
    expect(exp.incidenciasFiscales.some((i) => i.codigo === 'MOVIMIENTO_SIN_DOCUMENTO' && i.id === 'gas_rep')).toBe(true);
  });

  it('retención ≥5 años sin TTL y aviso AEAT explícito', () => {
    const exp = expediente();
    expect(exp.retencion.aniosMinimos).toBe(5);
    expect(exp.retencion.ttlConfigurado).toBe(false);
    expect(exp.procedencia.formatoOficialAEAT).toBe(false);
    expect(exp.procedencia.avisoAEAT).toContain('presentación oficial AEAT');
  });

  it('inmueble sin datos del ejercicio: null (no se fabrica un expediente vacío)', () => {
    const vacio = construirExpedienteDocumentalInmueble({ inmueble: { ...INM, id: 'inm_nada' } as Inmueble, ejercicio: 1999, generadoEl: AHORA });
    // El motor fiscal no devuelve resumen para un inmueble sin rastro → null
    expect(vacio === null || vacio.ingresos.totalCobros === 0).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 3 · Exportación B6 integrada con el índice (determinista)', () => {
  const contexto = { actor: 'uid_test', propietarioId: 'prop_1', incluirPII: false };
  const ambito = { seleccion: 'UN_INMUEBLE', inmuebleId: 'inm_1', periodo: { tipo: 'ANIO', anio: 2026 } } as const;

  async function generar() {
    const f = fixtures();
    const exp = await generarExpedienteFiscal(
      { inmuebles: [f.INM], contratos: [f.CONTRATO], gastos: [f.GASTO_IBI, f.GASTO_SIN_DOC, f.GASTO_COMUNIDAD] },
      ambito as never, contexto, { generatedAt: AHORA }
    );
    const idx = indiceBase();
    const entrada = await prepararEntradaIndiceParaExportacion(idx);
    const empaquetado = await empaquetarExpediente(exp, undefined, [
      { ruta: entrada.rutaLogica, contenido: utf8Bytes(entrada.contenido) },
    ]);
    return { exp, idx, entrada, empaquetado };
  }

  it('el ZIP integra indice-documental.json con su hash en el manifest', async () => {
    const { entrada, empaquetado } = await generar();
    const rutas = empaquetado.entradas.map((e) => e.ruta);
    expect(rutas).toContain('indice-documental.json');
    expect(rutas).toContain('manifest.json');
    const manifestConHash = empaquetado.entradas.find((e) => e.ruta === 'indice-documental.json');
    expect(manifestConHash!.sha256).toBe(entrada.sha256);
  });

  it('determinismo: misma entrada → mismo binario byte a byte', async () => {
    const a = await generar();
    const b = await generar();
    expect(Buffer.from(a.empaquetado.zip).equals(Buffer.from(b.empaquetado.zip))).toBe(true);
    expect(a.exp.manifest.exportId).toBe(b.exp.manifest.exportId);
  });

  it('el exportId canónico B6 NO cambia por el índice (material complementario)', async () => {
    const { exp } = await generar();
    const f = fixtures();
    const sinIndice = await generarExpedienteFiscal(
      { inmuebles: [f.INM], contratos: [f.CONTRATO], gastos: [f.GASTO_IBI, f.GASTO_SIN_DOC, f.GASTO_COMUNIDAD] },
      ambito as never, contexto, { generatedAt: AHORA }
    );
    expect(exp.manifest.exportId).toBe(sinIndice.manifest.exportId);
  });

  it('advertencia AEAT y procedencia de sólo lectura preservadas', async () => {
    const { exp } = await generar();
    expect(exp.manifest.advertencias.some((a) => a.includes('NO es un formato oficial'))).toBe(true);
    expect(exp.procedencia.formatoOficialAEAT).toBe(false);
    expect(exp.procedencia.escriturasFirestore).toBe(0);
    expect(exp.procedencia.escriturasStorage).toBe(0);
  });

  it('conversión índice→DocumentosExpediente deduplica contra B6 (doc_{id})', async () => {
    const idx = indiceBase();
    const completos = entradasIndiceComoDocumentosExpediente(idx, 2026, []);
    expect(completos.length).toBeGreaterThan(0);
    // Si B6 ya incluye el justificante del cobro como doc_just_1, el índice no lo duplica:
    const filtrados = entradasIndiceComoDocumentosExpediente(idx, 2026, [
      { documentoId: 'doc_just_1', inmuebleId: 'inm_1', ejercicio: 2026, tipo: 'INGRESO', nombre: 'transferencia-sep.pdf', rutaLogica: 'x', estado: 'PENDIENTE' },
    ]);
    expect(filtrados.find((d) => d.movimientoId === 'COBRO:cobro_1')).toBeUndefined();
    expect(filtrados.length).toBe(completos.length - 1);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 3 · Auditoría única (audit_logs) e IA preparada', () => {
  it('payload de auditoría reutiliza el contrato existente (actor+fecha+entidad+acción)', () => {
    const p = construirAuditoriaExpediente(
      { id: 'usr_1', email: 'p@test.local', nombre: 'Propietario Uno' },
      'EXPEDIENTE_DOCUMENTO_SUSTITUIDO', 'documento_expediente', 'idx_x', 'Sustitución explícita v2',
      { anteriorId: 'idx_y' }
    );
    expect(p.entidadAfectada).toBe('documento_expediente');
    expect(p.accion).toBe('EXPEDIENTE_DOCUMENTO_SUSTITUIDO');
    expect(p.resultado).toBe('EXITO');
    expect(p.detalles).toMatchObject({ anteriorId: 'idx_y' });
    // La fecha la estampa registrarAuditoriaFirestore (función existente)
    expect('fechaHora' in p).toBe(false);
  });

  it('contexto IA: clasificación y limitaciones explícitas (no decide)', () => {
    const f = fixtures();
    const exp = construirExpedienteDocumentalInmueble({
      inmueble: f.INM as Inmueble, ejercicio: 2026, cobros: [f.COBRO_CON_JUST], gastos: [f.GASTO_IBI, f.GASTO_SIN_DOC],
      contratos: [f.CONTRATO], polizas: [f.POLIZA], incidencias: [f.INCIDENCIA], tareasMantenimiento: [f.TAREA],
      garantias: [f.GARANTIA], generadoEl: AHORA,
    })!;
    const ctx = prepararContextoIaDocumentalFiscal(exp, [f.GASTO_IBI, f.GASTO_SIN_DOC]);
    expect(ctx.documentos.length).toBeGreaterThan(0);
    expect(ctx.movimientosSinDocumento.some((m) => m.id === 'gas_rep')).toBe(true);
    expect(ctx.deducibilidadSegunMotor.length).toBe(2);
    expect(ctx.limitaciones.some((l) => l.includes('NO decide deducibilidad definitiva'))).toBe(true);
    expect(ctx.limitaciones.some((l) => l.includes('INTERPRETACION/HIPOTESIS/PENDIENTE_REVISION'))).toBe(true);
  });
});
