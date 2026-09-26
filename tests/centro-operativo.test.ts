/**
 * BLOQUE 1 — Centro operativo del inmueble + base de seguros (dominio).
 * ---------------------------------------------------------------------------
 * Prueba `src/utils/segurosCentro.ts` (puro, sin Firebase): pólizas múltiples
 * por inmueble, documentos 1→N append-only sin reemplazo silencioso,
 * histórico, renovaciones encadenadas con evolución de prima, cambios de
 * compañía, cancelación lógica, ventanas de renovación, clasificación de
 * evidencia de cobertura (nunca decisión automática), ids deterministas e
 * idempotencia, y el agregador del resumen operativo.
 */
import { describe, expect, it } from 'vitest';
import {
  adjuntarDocumentoPoliza,
  cancelarPoliza,
  clasificarEvidenciaCobertura,
  construirResumenOperativoInmueble,
  crearPolizaSeguro,
  detectarRenovacionesInmueble,
  evaluarVentanaRenovacion,
  generarIdDocumentoPoliza,
  generarIdPolizaDeterminista,
  modificarPolizaTrazable,
  polizasDelInmueble,
  prepararContextoIaCobertura,
  registrarRenovacionPoliza,
  type ActorSeguros,
} from '../src/utils/segurosCentro';
import { evaluarCoberturaPolizas } from '../src/utils/segurosEngine';
import type { CobroPeriodo, GarantiaReparacion, Incidencia, Inmueble, PolizaSeguro, TareaMantenimiento } from '../src/types';

const ACTOR: ActorSeguros = { id: 'usr_1', nombre: 'Propietario Uno' };
const OTRO_ACTOR: ActorSeguros = { id: 'usr_2', nombre: 'Gestora Dos' };
const AHORA = '2026-09-26T10:00:00.000Z';
const HOY = '2026-09-26T00:00:00.000Z';

const INM: Inmueble = {
  id: 'inm_1', direccion: 'Calle Mayor 1', ciudad: 'Alicante', precio: 800,
  estado: 'alquilado', habitaciones: 3, banos: 2, superficie: 90,
  candidatosCount: 0, fianzaMeses: 1,
  propietarioId: 'prop_1', inquilinoActualNombre: 'Inquilino Test', contratoActivoId: 'ct_1',
} as Inmueble;

const INM_AJENO: Inmueble = { ...INM, id: 'inm_2', direccion: 'Otra 2', propietarioId: 'prop_2' } as Inmueble;

function datosPoliza(over: Partial<Parameters<typeof crearPolizaSeguro>[0]> = {}) {
  return {
    propietarioId: 'prop_1',
    inmuebleId: 'inm_1',
    inmuebleDireccion: 'Calle Mayor 1',
    tipo: 'HOGAR' as const,
    aseguradora: 'Mapfre',
    numeroPoliza: 'POL-0001',
    fechaInicio: '2026-01-01',
    fechaVencimiento: '2026-12-31',
    coberturas: ['Daños por agua', 'Responsabilidad Civil'],
    ...over,
  };
}

function polizaBase(over: Partial<Parameters<typeof crearPolizaSeguro>[0]> = {}): PolizaSeguro {
  const res = crearPolizaSeguro(datosPoliza(over), ACTOR, AHORA);
  if (res.estado !== 'OK' || !res.poliza) throw new Error(`polizaBase inválida: ${res.error}`);
  return res.poliza;
}

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · Pólizas: creación, tipos, estados, ids deterministas', () => {
  it('crea una póliza válida con historial de CREACIÓN, procedencia y actor', () => {
    const p = polizaBase();
    expect(p.estado).toBe('VIGENTE');
    expect(p.estadoRenovacion).toBe('VIGENTE');
    expect(p.historial?.[0]?.accion).toBe('CREACION');
    expect(p.procedencia?.origen).toBe('MANUAL');
    expect(p.creadoPor).toBe('Propietario Uno');
    expect(p.id).toMatch(/^pol_[0-9a-f]{36}$/);
  });

  it('rechaza datos inválidos sin crear nada (fechas, titular obligatorio)', () => {
    expect(crearPolizaSeguro(datosPoliza({ propietarioId: '' }), ACTOR, AHORA).estado).toBe('ERROR');
    expect(crearPolizaSeguro(datosPoliza({ fechaInicio: '2026-12-31', fechaVencimiento: '2026-01-01' }), ACTOR, AHORA).estado).toBe('ERROR');
    expect(crearPolizaSeguro(datosPoliza({ fechaInicio: '01/01/2026' }), ACTOR, AHORA).estado).toBe('ERROR');
  });

  it('ids deterministas: mismos datos → mismo id; datos distintos → id distinto (idempotencia de alta)', () => {
    const a = polizaBase();
    const b = polizaBase();
    expect(a.id).toBe(b.id);
    const c = polizaBase({ numeroPoliza: 'POL-0002' });
    expect(c.id).not.toBe(a.id);
    expect(generarIdPolizaDeterminista({ propietarioId: 'prop_1', numeroPoliza: 'POL-0001', aseguradora: 'Mapfre', fechaInicio: '2026-01-01' })).toBe(a.id);
  });

  it('un inmueble admite múltiples pólizas de tipos distintos (1 → N)', () => {
    const hogar = polizaBase();
    const impago = polizaBase({ tipo: 'IMPAGO_ALQUILER', numeroPoliza: 'IMP-9', aseguradora: 'Caser' });
    const equipos = polizaBase({ tipo: 'ELECTRODOMESTICOS', numeroPoliza: 'ELE-3', aseguradora: 'Zurich' });
    const rc = polizaBase({ tipo: 'RESPONSABILIDAD_CIVIL', numeroPoliza: 'RC-7' });
    const otras = polizaBase({ tipo: 'OTRO', numeroPoliza: 'OT-1' });
    const todas = polizasDelInmueble([hogar, impago, equipos, rc, otras], INM);
    expect(todas).toHaveLength(5);
    expect(new Set(todas.map((p) => p.id)).size).toBe(5);
  });

  it('polizasDelInmueble aísla por inmueble (no mezcla con otros inmuebles/propietarios)', () => {
    const mia = polizaBase();
    const ajena = polizaBase({ propietarioId: 'prop_2', inmuebleId: 'inm_2', numeroPoliza: 'X-1' });
    expect(polizasDelInmueble([mia, ajena], INM).map((p) => p.id)).toEqual([mia.id]);
    expect(polizasDelInmueble([mia, ajena], INM_AJENO).map((p) => p.id)).toEqual([ajena.id]);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · Documentos: 1 póliza → N documentos, sin reemplazo silencioso', () => {
  const DOC = { nombre: 'poliza-original.pdf', url: 'https://s.example/poliza-original.pdf', categoria: 'POLIZA_ORIGINAL' as const, storagePath: 'polizas/pol_1/original.pdf' };

  it('adjunta múltiples documentos y NINGUNO elimina al anterior', () => {
    let p = polizaBase();
    const r1 = adjuntarDocumentoPoliza(p, DOC, ACTOR, AHORA);
    expect(r1.estado).toBe('OK');
    p = r1.poliza!;
    const r2 = adjuntarDocumentoPoliza(p, { ...DOC, nombre: 'condiciones-generales.pdf', url: 'https://s.example/cg.pdf', categoria: 'CONDICIONES_GENERALES' }, OTRO_ACTOR, '2026-09-26T11:00:00.000Z');
    p = r2.poliza!;
    const r3 = adjuntarDocumentoPoliza(p, { ...DOC, nombre: 'anexo-1.pdf', url: 'https://s.example/anexo.pdf', categoria: 'ANEXO' }, ACTOR, '2026-09-26T12:00:00.000Z');
    p = r3.poliza!;
    expect(p.documentos).toHaveLength(3);
    expect(p.documentos!.map((d) => d.nombre)).toEqual(['poliza-original.pdf', 'condiciones-generales.pdf', 'anexo-1.pdf']);
  });

  it('conserva metadata completa: versión, fecha, origen, actor, referencia', () => {
    const p0 = polizaBase();
    const r = adjuntarDocumentoPoliza(p0, { ...DOC, origen: 'Email compañía', referencia: 'REF-2026-01' }, OTRO_ACTOR, AHORA);
    const doc = r.poliza!.documentos![0];
    expect(doc.version).toBe(1);
    expect(doc.fechaSubida).toBe(AHORA);
    expect(doc.origen).toBe('Email compañía');
    expect(doc.subidoPor).toBe('Gestora Dos');
    expect(doc.subidoPorId).toBe('usr_2');
    expect(doc.referencia).toBe('REF-2026-01');
    expect(doc.categoria).toBe('POLIZA_ORIGINAL');
  });

  it('versiona por categoría: un documento nuevo NO sobrescribe, incrementa versión', () => {
    let p = polizaBase();
    p = adjuntarDocumentoPoliza(p, DOC, ACTOR, AHORA).poliza!;
    const r = adjuntarDocumentoPoliza(
      p,
      { ...DOC, nombre: 'poliza-renovada-2027.pdf', url: 'https://s.example/v2.pdf', reemplazaA: p.documentos![0].id },
      ACTOR,
      '2027-01-01T09:00:00.000Z'
    );
    p = r.poliza!;
    expect(p.documentos).toHaveLength(2); // el anterior SIGUE recuperable
    const viejo = p.documentos!.find((d) => d.nombre === 'poliza-original.pdf');
    const nuevo = p.documentos!.find((d) => d.nombre === 'poliza-renovada-2027.pdf');
    expect(viejo).toBeDefined();
    expect(nuevo!.version).toBe(2);
    expect(nuevo!.reemplazaA).toBe(viejo!.id);
  });

  it('idempotencia: readjuntar el mismo documento es SIN_CAMBIOS (no duplica)', () => {
    const p0 = polizaBase();
    const id = generarIdDocumentoPoliza({ polizaId: p0.id, nombre: DOC.nombre, categoria: DOC.categoria, fechaDocumento: AHORA });
    const p1 = adjuntarDocumentoPoliza(p0, { ...DOC, id }, ACTOR, AHORA).poliza!;
    const r = adjuntarDocumentoPoliza(p1, { ...DOC, id }, ACTOR, AHORA);
    expect(r.estado).toBe('SIN_CAMBIOS');
    expect(r.poliza!.documentos).toHaveLength(1);
  });

  it('mismo id con contenido distinto → ERROR explícito (nunca sobrescritura silenciosa)', () => {
    const p0 = polizaBase();
    const id = generarIdDocumentoPoliza({ polizaId: p0.id, nombre: DOC.nombre, categoria: DOC.categoria, fechaDocumento: AHORA });
    const p1 = adjuntarDocumentoPoliza(p0, { ...DOC, id }, ACTOR, AHORA).poliza!;
    const r = adjuntarDocumentoPoliza(p1, { ...DOC, id, url: 'https://s.example/OTRO-CONTENIDO.pdf' }, ACTOR, AHORA);
    expect(r.estado).toBe('ERROR');
    expect(r.error).toContain('no se sobrescribe');
    expect(p1.documentos![0].url).toBe(DOC.url);
  });

  it('cada adjunto queda registrado en el historial (append-only)', () => {
    let p = polizaBase();
    const antes = p.historial!.length;
    p = adjuntarDocumentoPoliza(p, DOC, ACTOR, AHORA).poliza!;
    p = adjuntarDocumentoPoliza(p, { ...DOC, nombre: 'recibo.pdf', url: 'https://s.example/r.pdf', categoria: 'RECIBO_PRIMA' }, ACTOR, '2026-09-26T11:00:00.000Z').poliza!;
    expect(p.historial!.length).toBe(antes + 2);
    expect(p.historial!.filter((h) => h.accion === 'DOCUMENTO_ADJUNTADO')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · Modificación trazable y evolución de prima', () => {
  it('cambio de prima: guarda primaAnterior y datos anteriores/nuevos en el historial', () => {
    const p0 = polizaBase({ primaAnual: 300 });
    const r = modificarPolizaTrazable(p0, { primaAnual: 340 }, ACTOR, AHORA);
    const p = r.poliza!;
    expect(p.primaAnual).toBe(340);
    expect(p.primaAnterior).toBe(300);
    const h = p.historial!.find((x) => x.accion === 'MODIFICACION')!;
    expect(h.datosAnteriores).toMatchObject({ primaAnual: 300 });
    expect(h.datosNuevos).toMatchObject({ primaAnual: 340 });
  });

  it('cambio sin diferencias → SIN_CAMBIOS; documentos/historial intactos', () => {
    const p0 = polizaBase({ primaAnual: 300 });
    expect(modificarPolizaTrazable(p0, { primaAnual: 300 }, ACTOR, AHORA).estado).toBe('SIN_CAMBIOS');
  });

  it('cambio de compañía queda registrado como MODIFICACIÓN con ambos valores', () => {
    const p0 = polizaBase();
    const p = modificarPolizaTrazable(p0, { aseguradora: 'Allianz' }, ACTOR, AHORA).poliza!;
    expect(p.aseguradora).toBe('Allianz');
    const historiales = p.historial!.filter((h) => h.accion === 'MODIFICACION');
    expect(historiales.length).toBeGreaterThanOrEqual(2);
    expect(historiales.some((h) => (h.detalle || '').includes('Mapfre → Allianz'))).toBe(true);
  });

  it('no permite editar documentos ni historial por esta vía (campos fuera de la lista blanca)', () => {
    const p0 = polizaBase();
    const r = modificarPolizaTrazable(p0, { documentos: [] } as never, ACTOR, AHORA);
    expect(r.estado).toBe('SIN_CAMBIOS');
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · Renovaciones: cadena de pólizas sin perder historia', () => {
  it('renovación: nueva póliza encadenada; la anterior conserva documentos e historial', () => {
    let anterior = polizaBase({ primaAnual: 300 });
    anterior = adjuntarDocumentoPoliza(anterior, { nombre: 'original.pdf', url: 'u1', categoria: 'POLIZA_ORIGINAL' }, ACTOR, AHORA).poliza!;
    const historialAntes = anterior.historial!.length;

    const r = registrarRenovacionPoliza(
      anterior,
      { fechaInicio: '2027-01-01', fechaVencimiento: '2027-12-31', primaAnual: 330 },
      ACTOR,
      '2026-12-01T10:00:00.000Z'
    );
    expect(r.estado).toBe('OK');
    const { poliza: anteriorUpd, polizaNueva: nueva, comparacion } = r;

    // Cadena trazable en ambos sentidos
    expect(nueva!.polizaAnteriorId).toBe(anterior.id);
    expect(anteriorUpd!.polizaSiguienteId).toBe(nueva!.id);
    expect(anteriorUpd!.estadoRenovacion).toBe('RENOVADA');
    expect(nueva!.estado).toBe('VIGENTE');

    // Evolución de prima
    expect(nueva!.primaAnterior).toBe(300);
    expect(nueva!.primaAnual).toBe(330);
    expect(comparacion!.aumentoPrima).toBe(true);
    expect(nueva!.comparacionesHistorial).toHaveLength(1);

    // La anterior NO pierde nada histórico
    expect(anteriorUpd!.documentos).toHaveLength(1);
    expect(anteriorUpd!.historial!.length).toBe(historialAntes + 1);
    expect(anteriorUpd!.primaAnual).toBe(300);

    // La nueva arranca sin documentos propios (los históricos siguen en la anterior)
    expect(nueva!.documentos).toHaveLength(0);
  });

  it('cambio de compañía en renovación → SUSTITUIDA en la anterior', () => {
    const anterior = polizaBase();
    const r = registrarRenovacionPoliza(
      anterior,
      { fechaInicio: '2027-01-01', fechaVencimiento: '2027-12-31', aseguradora: 'Línea Directa' },
      ACTOR,
      '2026-12-01T10:00:00.000Z'
    );
    expect(r.poliza!.estadoRenovacion).toBe('SUSTITUIDA');
    expect(r.polizaNueva!.aseguradora).toBe('Línea Directa');
    expect(r.poliza!.historial!.some((h) => h.accion === 'SUSTITUCION')).toBe(true);
  });

  it('no encadena dos veces la misma póliza (idempotencia estructural)', () => {
    const anterior = polizaBase();
    const r1 = registrarRenovacionPoliza(anterior, { fechaInicio: '2027-01-01', fechaVencimiento: '2027-12-31' }, ACTOR, AHORA);
    const r2 = registrarRenovacionPoliza(r1.poliza!, { fechaInicio: '2027-01-01', fechaVencimiento: '2027-12-31' }, ACTOR, AHORA);
    expect(r2.estado).toBe('ERROR');
    expect(r2.error).toContain('ya tiene sucesora');
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · Cancelación lógica y ventanas de renovación', () => {
  it('cancelación: conserva documentos e historial; repetirla es SIN_CAMBIOS', () => {
    let p = polizaBase();
    p = adjuntarDocumentoPoliza(p, { nombre: 'original.pdf', url: 'u1', categoria: 'POLIZA_ORIGINAL' }, ACTOR, AHORA).poliza!;
    const r = cancelarPoliza(p, 'Baja del inmueble', ACTOR, AHORA);
    expect(r.poliza!.estado).toBe('CANCELADA');
    expect(r.poliza!.estadoRenovacion).toBe('CANCELADA');
    expect(r.poliza!.documentos).toHaveLength(1);
    expect(r.poliza!.historial!.some((h) => h.accion === 'CANCELACION')).toBe(true);
    expect(cancelarPoliza(r.poliza!, 'otra vez', ACTOR, AHORA).estado).toBe('SIN_CAMBIOS');
  });

  it('ventana estándar: a 20 días del vencimiento está en ventana (intervalo 30)', () => {
    const p = polizaBase({ fechaVencimiento: '2026-10-16' });
    const v = evaluarVentanaRenovacion(p, HOY);
    expect(v.diasRestantes).toBe(20);
    expect(v.enVentana).toBe(true);
    expect(v.vencida).toBe(false);
  });

  it('ventana propia (avisoRenovacionDias) respeta la configuración de la póliza', () => {
    const p = polizaBase({ fechaVencimiento: '2026-12-31', avisoRenovacionDias: 120 });
    expect(evaluarVentanaRenovacion(p, HOY).enVentana).toBe(true); // 96 días < 120 propios
    const sinPersonalizar = polizaBase({ fechaVencimiento: '2026-12-31', numeroPoliza: 'POL-SIN' });
    expect(evaluarVentanaRenovacion(sinPersonalizar, HOY).enVentana).toBe(false); // 96 > 60 estándar
  });

  it('vencida y cancelada', () => {
    const vencida = polizaBase({ fechaVencimiento: '2026-09-01' });
    expect(evaluarVentanaRenovacion(vencida, HOY).vencida).toBe(true);
    const cancelada = cancelarPoliza(polizaBase(), 'x', ACTOR, AHORA).poliza!;
    expect(evaluarVentanaRenovacion(cancelada, HOY).enVentana).toBe(false);
  });

  it('detectarRenovacionesInmueble ordena por proximidad y excluye canceladas', () => {
    const a = polizaBase({ fechaVencimiento: '2026-10-05', numeroPoliza: 'A' });
    const b = polizaBase({ fechaVencimiento: '2026-10-01', numeroPoliza: 'B' });
    const c = cancelarPoliza(polizaBase({ fechaVencimiento: '2026-09-28', numeroPoliza: 'C' }), 'x', ACTOR, AHORA).poliza!;
    const lejos = polizaBase({ fechaVencimiento: '2027-06-01', numeroPoliza: 'D' });
    const ren = detectarRenovacionesInmueble([a, b, c, lejos], HOY);
    expect(ren.map((r) => r.poliza.numeroPoliza)).toEqual(['B', 'A']);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · Seguro ↔ avería: evidencia clasificada, nunca decisión automática', () => {
  const incidencia: Incidencia = {
    id: 'inc_1', propietarioId: 'prop_1', inmuebleId: 'inm_1', titulo: 'Fuga de agua en baño',
    descripcion: 'Se ha producido una fuga de agua por rotura de tubería', categoria: 'FONTANERIA',
    prioridad: 'ALTA', estado: 'ABIERTA', origen: 'INQUILINO',
  } as Incidencia;

  it('clasifica en las 4 categorías y nunca es vinculante', () => {
    const p = polizaBase({ exclusiones: ['Daños por falta de mantenimiento'], franquicia: 150 });
    const evaluacion = evaluarCoberturaPolizas(incidencia, [p]);
    const analisis = clasificarEvidenciaCobertura(incidencia, evaluacion);

    expect(analisis.vinculante).toBe(false);
    const categorias = new Set(analisis.evidencia.map((e) => e.categoria));
    expect(categorias.has('DATO_DOCUMENTAL')).toBe(true);
    expect(categorias.has('CONCLUSION_PENDIENTE_REVISION')).toBe(true);
    expect(analisis.aviso).toContain('no afirma automáticamente');

    const documentales = analisis.evidencia.filter((e) => e.categoria === 'DATO_DOCUMENTAL').map((e) => e.texto);
    expect(documentales.some((t) => t.includes('Daños por agua'))).toBe(true);
    expect(documentales.some((t) => t.includes('Exclusión registrada'))).toBe(true);
    expect(documentales.some((t) => t.includes('Franquicia registrada') && t.includes('150'))).toBe(true);
  });

  it('con coincidencia de cobertura emite HIPÓTESIS (no afirmación) y lista documentación disponible', () => {
    const p = adjuntarDocumentoPoliza(polizaBase(), { nombre: 'condiciones.pdf', url: 'u', categoria: 'CONDICIONES_PARTICULARES' }, ACTOR, AHORA).poliza!;
    const evaluacion = evaluarCoberturaPolizas(incidencia, [p]);
    expect(evaluacion.estado).toBe('POSIBLE_COBERTURA');
    const analisis = clasificarEvidenciaCobertura(incidencia, evaluacion);
    const hipotesis = analisis.evidencia.filter((e) => e.categoria === 'HIPOTESIS');
    expect(hipotesis.length).toBeGreaterThan(0);
    expect(hipotesis[0].texto).toContain('PODRÍA');
    expect(analisis.documentacionDisponible.map((d) => d.nombre)).toContain('condiciones.pdf');
    expect(analisis.polizasPotencialmenteRelacionadas.map((x) => x.id)).toContain(p.id);
  });

  it('contexto IA preparado: incluye limitaciones explícitas (preparación, no decisión)', () => {
    const ctx = prepararContextoIaCobertura(incidencia, [polizaBase()]);
    expect(ctx.polizas).toHaveLength(1);
    expect(ctx.limitaciones.some((l) => l.includes('NO afirmar cobertura'))).toBe(true);
    expect(ctx.limitaciones.some((l) => l.includes('NO sustituir el documento original'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('BLOQUE 1 · Resumen operativo del inmueble (agregador puro)', () => {
  const cobro = (over: Partial<CobroPeriodo>): CobroPeriodo =>
    ({ id: 'cobro_1', inmuebleId: 'inm_1', contratoId: 'ct_1', inquilinoId: 'inq_1', propietarioId: 'prop_1', mes: 9, anio: 2026, periodoMesAnio: '2026-09', nombreMes: 'Septiembre 2026', importePrevisto: 800, importeRecibido: 0, estado: 'PENDIENTE', ...over } as CobroPeriodo);

  it('filtra por inmueble y agrega situación, cobros, incidencias, mantenimientos y garantías', () => {
    const p = polizaBase({ fechaVencimiento: '2026-10-10' });
    const resumen = construirResumenOperativoInmueble({
      inmueble: INM,
      cobros: [
        cobro({ estado: 'RECIBIDO', importeRecibido: 800, periodoMesAnio: '2026-08', nombreMes: 'Agosto 2026' }),
        cobro({ id: 'cobro_2', estado: 'RETRASADO' }),
        cobro({ id: 'cobro_3', inmuebleId: 'inm_AJENO' }),
      ],
      incidencias: [
        { id: 'i1', inmuebleId: 'inm_1', titulo: 'Fuga', categoria: 'FONTANERIA', estado: 'ABIERTA', prioridad: 'ALTA' } as Incidencia,
        { id: 'i2', inmuebleId: 'inm_1', titulo: 'Cerrada', categoria: 'OTROS', estado: 'CERRADA', prioridad: 'BAJA' } as Incidencia,
        { id: 'i3', inmuebleId: 'inm_AJENO', titulo: 'Ajena', categoria: 'OTROS', estado: 'ABIERTA', prioridad: 'BAJA' } as Incidencia,
      ],
      tareasMantenimiento: [
        { id: 't1', inmuebleId: 'inm_1', propietarioId: 'prop_1', titulo: 'Revisión caldera', periodicidad: 'ANUAL', proximaFecha: '2026-10-05', activa: true, createdAt: AHORA, updatedAt: AHORA } as TareaMantenimiento,
      ],
      garantias: [
        { id: 'g1', inmuebleId: 'inm_1', propietarioId: 'prop_1', trabajoId: 'ot_1', titulo: 'Reparación termo', concepto: 'Termo', categoria: 'FONTANERIA', proveedor: 'Fontanero SL', fechaInicio: '2026-04-01', duracionMeses: 6, fechaFin: '2026-10-01', cobertura: 'Piezas', estado: 'ACTIVA', createdAt: AHORA, updatedAt: AHORA } as GarantiaReparacion,
      ],
      polizas: [p],
      hoyISO: HOY,
    });

    expect(resumen.inmuebleId).toBe('inm_1');
    expect(resumen.situacion.contratoActivoId).toBe('ct_1');
    expect(resumen.cobros.totalPeriodos).toBe(2); // el de inm_AJENO no cuenta
    expect(resumen.cobros.cobrados).toBe(1);
    expect(resumen.cobros.retrasados).toBe(1);
    expect(resumen.incidenciasAbiertas.map((i) => i.id)).toEqual(['i1']);
    expect(resumen.mantenimientosPendientes.map((t) => t.id)).toEqual(['t1']);
    expect(resumen.garantiasProximas.map((g) => g.id)).toEqual(['g1']);
    expect(resumen.polizas.activas).toHaveLength(1);
    expect(resumen.renovacionesProximas).toHaveLength(1); // 2026-10-10 → 14 días
    // Alertas generadas
    const tipos = resumen.alertas.map((a) => a.tipo);
    expect(tipos).toContain('RENOVACION_POLIZA');
    expect(tipos).toContain('COBRO_RETRASADO');
    expect(tipos).toContain('INCIDENCIA_ABIERTA');
    expect(tipos).toContain('GARANTIA_VENCIMIENTO');
    expect(tipos).toContain('MANTENIMIENTO_PROGRAMADO');
  });

  it('inmueble sin datos: resumen vacío pero estructurado (sin inventar nada)', () => {
    const resumen = construirResumenOperativoInmueble({ inmueble: INM, hoyISO: HOY });
    expect(resumen.polizas.total).toBe(0);
    expect(resumen.alertas).toHaveLength(0);
    expect(resumen.cobros.totalPeriodos).toBe(0);
  });
});
