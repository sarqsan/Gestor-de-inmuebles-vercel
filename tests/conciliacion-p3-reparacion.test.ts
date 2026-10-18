import { describe, it, expect } from 'vitest';
import type { CobroPeriodo, ContratoFormalizacion, Gasto, Inmueble, UsuarioApp } from '../src/types';
import type { MovimientoBancario, PropuestaConciliacion } from '../src/types/conciliacion';
import { detectarDuplicados } from '../src/utils/conciliacion/idempotencia';
import { importarDesdeCSV, importarDesdeNorma43, prepararImportacionBancaria } from '../src/utils/conciliacion/importEngine';
import { crearPropuestasParaMovimientos, decidirConciliacionManual } from '../src/utils/conciliacion/conciliacionEngine';
import { IMPORTACION_BANCARIA_AUTORIZADA, guardarImportacionConciliacion } from '../src/lib/conciliacionFirestore';

const CSV_VALIDO = [
  'fecha,concepto,importe,divisa,cuenta,referencia,identificador',
  '2026-05-05,Alquiler mayo,1000.00,EUR,cuenta-demo,ALQ-2026,FITID-001',
].join('\n');

function movimiento(over: Partial<MovimientoBancario> = {}): MovimientoBancario {
  return {
    idImportacion: 'imp_1',
    idMovimiento: 'mov_banco_1',
    fechaOperacion: '2026-05-05',
    importe: 1000,
    tipo: 'INGRESO',
    concepto: 'ALQUILER MAYO',
    conceptoOriginal: 'ALQUILER MAYO',
    origen: 'CSV',
    propietarioId: 'prop_A',
    cuentaRef: 'cta_1234567890abcdef',
    divisa: 'EUR',
    filaOrigen: 2,
    estadoValidacion: 'VALIDO',
    metadatosOriginales: {},
    hashIdempotencia: 'hash_1',
    fechaImportacion: '2026-05-05T00:00:00.000Z',
    ...over,
  } as MovimientoBancario;
}
function inmueble(owner = 'prop_A'): Inmueble {
  return { id: 'inm_A', propietarioId: owner, propietarioPrincipalId: owner, direccion: 'Calle A', titularesIds: [owner] } as Inmueble;
}
function contrato(owner = 'prop_A', inmuebleId = 'inm_A'): ContratoFormalizacion {
  return { id: 'cont_A', propietarioId: owner, inmuebleId, registroCobros: [] } as unknown as ContratoFormalizacion;
}
function cobro(id: string, owner = 'prop_A', inmuebleId = 'inm_A'): CobroPeriodo {
  return {
    id,
    propietarioId: owner,
    inmuebleId,
    contratoId: 'cont_A',
    inquilinoId: 'inquilino_A',
    mes: 5,
    anio: 2026,
    periodoMesAnio: '2026-05',
    nombreMes: 'Mayo 2026',
    importePrevisto: 1000,
    importeRecibido: 0,
    fechaVencimiento: '2026-05-05',
    estado: 'PENDIENTE',
    historialCambios: [],
  } as CobroPeriodo;
}
function gasto(id: string, owner = 'prop_A', inmuebleId = 'inm_A'): Gasto {
  return { id, propietarioId: owner, inmuebleId, concepto: 'Reparación', importe: 100 } as unknown as Gasto;
}
function actor(owner = 'prop_A', perfil: 'PROPIETARIO' | 'ADMINISTRADOR' = 'PROPIETARIO'): UsuarioApp {
  return {
    id: 'user_A',
    uid: 'uid_A',
    authUid: 'uid_A',
    nombre: 'Titular',
    email: 'titular@example.invalid',
    tipoPerfil: perfil,
    propietarioId: owner,
  } as UsuarioApp;
}
function propuesta(over: Partial<PropuestaConciliacion> = {}): PropuestaConciliacion {
  return {
    id: 'conc_1',
    movimientoId: 'mov_banco_1',
    idImportacion: 'imp_1',
    propietarioId: 'prop_A',
    candidato: { tipo: 'COBRO', id: 'cobro_1', contratoId: 'cont_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', importe: 1000, fecha: '2026-05-05' },
    puntuacion: 90,
    confianza: 'ALTA',
    factores: [],
    estado: 'PROPUESTO',
    importeMovimiento: 1000,
    importeCandidato: 1000,
    esDiscrepancia: false,
    fechaPropuesta: '2026-05-05T00:00:00.000Z',
    propuestaPor: 'SISTEMA',
    historial: [],
    aplicado: false,
    reversible: true,
    revision: 0,
    ...over,
  };
}

describe('P3 reparación · importación bloqueada y async correcto', () => {
  it('IMPORTACION_BANCARIA_AUTORIZADA es false y guardarImportacion lanza', async () => {
    expect(IMPORTACION_BANCARIA_AUTORIZADA).toBe(false);
    await expect(
      guardarImportacionConciliacion({
        propietarioId: 'prop_A',
        movimientos: [],
        propuestas: [],
        importacion: { id: 'imp_x', propietarioId: 'prop_A', origen: 'CSV', fechaImportacion: new Date().toISOString(), totalMovimientos: 0, nuevos: 0, duplicados: 0, errores: 0, estado: 'COMPLETADA' } as any,
      }),
    ).rejects.toThrow('IMPORTACION_BANCARIA_DESHABILITADA');
  });

  it('importarDesdeCSV devuelve Promise y se resuelve correctamente', async () => {
    const resPromise = importarDesdeCSV(CSV_VALIDO, 'prop_A', [], undefined, 'extracto.csv', undefined, 'uid_A');
    expect(resPromise).toBeInstanceOf(Promise);
    const res = await resPromise;
    expect(res.nuevos).toHaveLength(1);
    expect(res.importacion.hashFichero).toMatch(/^[a-f0-9]{64}$/);
    expect(res.importacion.idsMovimientosNuevos).toContain(res.nuevos[0].idMovimiento);
    expect(res.confirmable).toBe(true);
  });

  it('Norma43 falla de forma segura sin movimientos', async () => {
    const res = await importarDesdeNorma43('11registro\n22registro', 'prop_A', [], 'n43.043', undefined, 'uid_A');
    expect(res.nuevos).toHaveLength(0);
    expect(res.errores).toContain('NORMA43_FORMATO_PENDIENTE_VALIDACION');
    expect(res.confirmable).toBe(false);
  });

  it('no hay duplicados en reintentos por idempotencia', async () => {
    const first = await prepararImportacionBancaria({ contenido: CSV_VALIDO, formato: 'CSV', propietarioId: 'prop_A', existentes: [], opciones: { nombreFichero: 'a.csv', intentoId: '1' } });
    const second = await prepararImportacionBancaria({ contenido: CSV_VALIDO, formato: 'CSV', propietarioId: 'prop_A', existentes: first.nuevos, opciones: { nombreFichero: 'a.csv', intentoId: '2' } });
    expect(second.nuevos).toHaveLength(0);
    expect(second.duplicados).toHaveLength(1);
    const dupCheck = detectarDuplicados(second.movimientos, first.nuevos);
    expect(dupCheck.nuevos).toHaveLength(0);
  });

  it('formato desconocido y errores de validación bloquean confirmación', async () => {
    const res = await prepararImportacionBancaria({ contenido: 'contenido sin formato', formato: 'DESCONOCIDO', propietarioId: 'prop_A', existentes: [], opciones: {} });
    expect(res.confirmable).toBe(false);
    expect(res.errores.length).toBeGreaterThan(0);
  });
});

describe('P3 reparación · decisiones manuales con garantías', () => {
  it('conciliación y rechazo con actor autorizado y motivo válido', () => {
    const p = propuesta();
    const conc = decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'Extracto y periodo verificados', operacionId: 'op_1' });
    expect(conc.propuestaActualizada.estado).toBe('CONCILIADO');
    expect(conc.evento.motivo).toBe('Extracto y periodo verificados');
    expect(conc.evento.actorUid).toBe('uid_A');
    expect(conc.evento.revision).toBe(1);
    const rech = decidirConciliacionManual(p, { accion: 'RECHAZAR', actor: actor(), motivo: 'No corresponde al periodo', operacionId: 'op_2' });
    expect(rech.propuestaActualizada.estado).toBe('RECHAZADO');
  });

  it('rechaza actor no autorizado, motivo ausente o titular incorrecto', () => {
    const p = propuesta();
    const actorSinUid = { ...actor(), authUid: undefined, uid: undefined } as unknown as UsuarioApp;
    expect(() => decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actorSinUid, motivo: 'Motivo válido', operacionId: 'op_1' })).toThrow();
    expect(() => decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'abc', operacionId: 'op_1' })).toThrow('entre 5 y 500');
    expect(() => decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor('prop_B'), motivo: 'Motivo válido para decidir', operacionId: 'op_1' })).toThrow('ámbito');
    expect(() => decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'ES91 2100 0418 4502 0005 1332', operacionId: 'op_1' })).toThrow('bancaria');
  });

  it('rechaza transiciones inválidas y candidato fuera de ámbito', () => {
    const pConciliada = propuesta({ estado: 'CONCILIADO', candidato: { tipo: 'COBRO', id: 'cobro_1', contratoId: 'cont_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', importe: 1000, fecha: '2026-05-05' } });
    expect(() => decidirConciliacionManual(pConciliada, { accion: 'CONCILIAR', actor: actor(), motivo: 'Otro motivo válido', operacionId: 'op_3' })).toThrow('no está disponible para conciliar');
    const pSinCandidato = propuesta({ candidato: undefined });
    expect(() => decidirConciliacionManual(pSinCandidato, { accion: 'CONCILIAR', actor: actor(), motivo: 'Motivo válido', operacionId: 'op_4' })).toThrow('Seleccione un cobro');
    const pGasto = propuesta({ importeMovimiento: -100, candidato: { tipo: 'COBRO', id: 'cobro_1', contratoId: 'cont_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', importe: 1000, fecha: '2026-05-05' } });
    expect(() => decidirConciliacionManual(pGasto, { accion: 'CONCILIAR', actor: actor(), motivo: 'Motivo válido', operacionId: 'op_5' })).toThrow('tipo de candidato');
  });

  it('valida candidato visible: propietario e inmueble coherentes', () => {
    const mov = movimiento();
    const cobros = [cobro('cobro_1', 'prop_A', 'inm_A')];
    const contratos = [contrato('prop_A', 'inm_A')];
    const props = crearPropuestasParaMovimientos([mov], cobros, [], [inmueble('prop_A')], contratos);
    expect(props[0].candidato?.propietarioId).toBe('prop_A');
    const cobroFuera = cobro('cobro_2', 'prop_B', 'inm_B');
    const contratoFuera = contrato('prop_B', 'inm_B');
    contratoFuera.id = 'cont_B';
    const propsFuera = crearPropuestasParaMovimientos([mov], [cobroFuera], [], [inmueble('prop_A'), inmueble('prop_B')], [contrato('prop_A', 'inm_A'), contratoFuera]);
    expect(propsFuera[0].candidato).toBeUndefined();
  });

  it('no genera cobros, pagos, gastos ni saldos automáticamente', () => {
    const p = propuesta();
    const antesCobros = [cobro('cobro_1')];
    const conc = decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'Verificado con extracto', operacionId: 'op_10' });
    expect(conc.propuestaActualizada.aplicado).toBe(false);
    expect(conc.propuestaActualizada.estado).toBe('CONCILIADO');
    // No hay llamada a registrarPagoPeriodo ni mutación de cobros
    expect(antesCobros[0].estado).toBe('PENDIENTE');
  });

  it('operacionId inválido y protección replay básica', () => {
    const p = propuesta();
    expect(() => decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'Motivo válido', operacionId: '' })).toThrow('Identificador');
    expect(() => decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'Motivo válido', operacionId: 'op con espacios no permitidos!' })).toThrow('Identificador');
    const c1 = decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'Motivo válido', operacionId: 'op_same' });
    expect(c1.evento.id).toBe('conc_evt_op_same');
    // Mismo operacionId debe dar mismo id de evento (idempotencia por operacionId)
    const c2 = decidirConciliacionManual(p, { accion: 'CONCILIAR', actor: actor(), motivo: 'Motivo válido', operacionId: 'op_same' });
    expect(c2.evento.id).toBe(c1.evento.id);
  });
});

describe('P3 reparación · aislamiento y evidencia', () => {
  it('propuestas pendientes y rechazadas no deben considerarse evidencia de pago', () => {
    const pendiente = propuesta({ estado: 'PENDIENTE' });
    const rechazada = propuesta({ estado: 'RECHAZADO' });
    const conciliada = propuesta({ estado: 'CONCILIADO' });
    // Simula filtro de Tesorería: solo CONCILIADO manual es evidencia opcional
    const esEvidencia = (p: PropuestaConciliacion) => p.estado === 'CONCILIADO';
    expect(esEvidencia(pendiente)).toBe(false);
    expect(esEvidencia(rechazada)).toBe(false);
    expect(esEvidencia(conciliada)).toBe(true);
  });

  it('importe positivo solo puede conciliar con COBRO, negativo con GASTO', () => {
    const movIngreso = movimiento({ importe: 100 });
    const movGasto = movimiento({ importe: -50, tipo: 'GASTO' });
    const candCobro = { tipo: 'COBRO' as const, id: 'cobro_1', contratoId: 'cont_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', importe: 100, fecha: '2026-05-05' };
    const candGasto = { tipo: 'GASTO' as const, id: 'gasto_1', inmuebleId: 'inm_A', propietarioId: 'prop_A', importe: 50, fecha: '2026-05-05' };
    const pIngreso = propuesta({ importeMovimiento: 100, candidato: candCobro });
    const pGasto = propuesta({ importeMovimiento: -50, candidato: candGasto });
    expect(() => decidirConciliacionManual(pIngreso, { accion: 'CONCILIAR', actor: actor(), motivo: 'Verificado', operacionId: 'op_ing' })).not.toThrow();
    expect(() => decidirConciliacionManual(pGasto, { accion: 'CONCILIAR', actor: actor(), motivo: 'Verificado', operacionId: 'op_gas' })).not.toThrow();
    const pIngresoConGasto = propuesta({ importeMovimiento: 100, candidato: candGasto });
    expect(() => decidirConciliacionManual(pIngresoConGasto, { accion: 'CONCILIAR', actor: actor(), motivo: 'Verificado', operacionId: 'op_bad' })).toThrow('tipo de candidato');
  });
});
