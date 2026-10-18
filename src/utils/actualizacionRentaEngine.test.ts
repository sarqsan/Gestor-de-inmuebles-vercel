import { describe, expect, it } from 'vitest';
import type { ContratoFormalizacion } from '../types';
import {
  FUENTES_IRAV_OFICIALES,
  calcularPreviewActualizacionRenta,
  calcularRentaAplicandoPorcentaje,
  obtenerSiguienteAniversario,
  fechaEfectividadDesdeComunicacion,
  programarAvisoActualizacionRenta,
  seleccionarIndiceIRAVPublicado,
  type DatoIRAVOficial,
  type PreviewActualizacionRenta,
} from './actualizacionRentaEngine';

const clausulaIRAV = {
  estado: 'ACREDITADA' as const,
  textoExtracto: 'La renta podrá actualizarse anualmente conforme al índice pactado.',
  referenciaDocumental: 'contratos/c-1/clausula-actualizacion.pdf#page=4',
  mecanismo: 'SIN_DETALLAR' as const,
};

function contrato(overrides: Partial<ContratoFormalizacion> = {}): ContratoFormalizacion {
  return {
    id: 'contrato-1',
    inmuebleId: 'inmueble-1',
    propietarioId: 'propietario-1',
    fechaCelebracionContrato: '2026-10-08',
    fechaInicioContrato: '2025-10-17',
    rentaMensual: 1_250.01,
    esVigente: true,
    modalidadContractual: 'VIVIENDA_HABITUAL',
    finalidadUso: 'Vivienda habitual',
    referenciaContratoActualizacionRenta: 'contratos/c-1/contrato.pdf',
    evidenciaClausulaActualizacionRenta: clausulaIRAV,
    ...overrides,
  } as unknown as ContratoFormalizacion;
}

const limiteServidor = {
  importeMensual: 1_500,
  consultadoEn: '2026-10-17',
  referenciaOficial: 'consulta-servidor:test-1',
  verificadoServidor: true as const,
};

function serieMock2027(): readonly DatoIRAVOficial[] {
  return [
    ...FUENTES_IRAV_OFICIALES,
    {
      serie: 'IRAV1', periodo: '2027M09', variacionAnualPct: 2.61, estado: 'DEFINITIVO',
      publicadoEn: '2027-10-14', consultadoEn: '2027-10-17',
      urlSerie: 'https://ine.test/serie/IRAV1',
      urlCalendario: 'https://ine.test/calendario',
    },
  ];
}

describe('P4 · motor determinista de preview de actualización de renta', () => {
  it('selecciona IRAV1 por fecha de publicación y no por el periodo más reciente conocido después', () => {
    expect(seleccionarIndiceIRAVPublicado('2026-10-14')?.periodo).toBe('2026M08');
    expect(seleccionarIndiceIRAVPublicado('2026-10-15')?.periodo).toBe('2026M09');
  });

  it('no selecciona un IRAV provisional aunque tenga periodo y fecha de publicación posteriores', () => {
    const provisional: DatoIRAVOficial = {
      ...FUENTES_IRAV_OFICIALES[1],
      periodo: '2026M10', variacionAnualPct: 9.99, estado: 'PROVISIONAL',
      publicadoEn: '2026-10-18', consultadoEn: '2026-10-19',
    };
    expect(seleccionarIndiceIRAVPublicado('2026-10-19', [provisional])).toBeUndefined();
    expect(seleccionarIndiceIRAVPublicado('2026-10-19', [...FUENTES_IRAV_OFICIALES, provisional])?.periodo).toBe('2026M09');
    expect(FUENTES_IRAV_OFICIALES.every((dato) => dato.estado === 'DEFINITIVO')).toBe(true);
  });

  it('rechaza filas IRAV con fechas, periodo o fuente no verificables', () => {
    const corrupta: DatoIRAVOficial = {
      ...FUENTES_IRAV_OFICIALES[1],
      periodo: '2026M13',
      publicadoEn: '2026-02-30',
      urlSerie: 'http://ines.test/serie',
    };
    expect(seleccionarIndiceIRAVPublicado('2026-10-17', [corrupta])).toBeUndefined();
    const mesInvalido = { ...FUENTES_IRAV_OFICIALES[1], periodo: '2026M13' };
    expect(seleccionarIndiceIRAVPublicado('2026-10-17', [mesInvalido])).toBeUndefined();
  });

  it('distingue fecha de celebración y fecha de inicio; calcula el aniversario desde el inicio', () => {
    const result = calcularPreviewActualizacionRenta(contrato(), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, {
      hoy: '2026-10-17',
    });
    expect(result.estado).toBe('REQUIERE_REVISION');
    expect(result.fechaCelebracion).toBe('2026-10-08');
    expect(result.fechaInicioContrato).toBe('2025-10-17');
    expect(result.fechaAniversario).toBe('2026-10-17');
    expect('fechaAvisoLimite' in result).toBe(false);
    expect(result.estadoAviso).toBe('NO_PROGRAMADO');
    expect(result.fechaEfectividad).toBeNull();
  });

  it('distingue aniversario inicial del día de inicio y no cuenta como aniversario el mismo día de firma/inicio', () => {
    expect(obtenerSiguienteAniversario('2026-10-17', '2026-10-17')).toEqual({ estado: 'OK', fecha: '2027-10-17' });
    expect(obtenerSiguienteAniversario('2025-12-31', '2026-10-17')).toEqual({ estado: 'OK', fecha: '2026-12-31' });
    expect(obtenerSiguienteAniversario('2025-10-17', '2026-10-18')).toEqual({ estado: 'OK', fecha: '2027-10-17' });
  });

  it('separa aniversario de efectividad: la renta solo sería exigible desde el mes siguiente al aviso escrito', () => {
    expect(fechaEfectividadDesdeComunicacion('2026-10-17')).toBe('2026-11-01');
    expect(fechaEfectividadDesdeComunicacion('2026-12-31')).toBe('2027-01-01');
    expect(fechaEfectividadDesdeComunicacion('2026-02-30')).toBeNull();
  });

  it('envía a revisión el aniversario bisiesto ambiguo en vez de normalizarlo a otro día', () => {
    expect(obtenerSiguienteAniversario('2024-02-29', '2025-03-01')).toEqual({
      estado: 'REVISION', codigo: 'ANIVERSARIO_BISESTO_REQUIERE_REVISION',
    });
  });

  it('no infiere fecha de celebración ni acepta fechas inválidas', () => {
    const faltante = calcularPreviewActualizacionRenta(contrato({ fechaCelebracionContrato: undefined }), {}, { hoy: '2026-10-17' });
    const invalida = calcularPreviewActualizacionRenta(contrato({ fechaCelebracionContrato: '2025-02-30' }), {}, { hoy: '2026-10-17' });
    expect(faltante.codigo).toBe('FECHA_CELEBRACION_NO_ACREDITADA');
    expect(invalida.codigo).toBe('FECHA_CELEBRACION_INVALIDA');
    expect(faltante.rentaFutura).toBeUndefined();
    expect(invalida.rentaFutura).toBeUndefined();
  });

  it('evalúa primero la cohorte de anualidad extraordinaria aunque la celebración sea anterior al RDL 29', () => {
    const result = calcularPreviewActualizacionRenta(contrato({ fechaCelebracionContrato: '2026-10-07' }), {
      evidenciaContrato: 'contratos/c-1/contrato.pdf',
    }, { hoy: '2026-10-17' });
    expect(result.codigo).toBe('LIMITE_PRECIO_REFERENCIA_NO_VERIFICADO');
    expect(result.rentaFutura).toBeUndefined();
  });

  it('mantiene en revisión la cohorte pre-RDL cuando la anualidad cae antes de su entrada en vigor', () => {
    const serieAFecha = [{ ...FUENTES_IRAV_OFICIALES[0], consultadoEn: '2026-10-01' }];
    const result = calcularPreviewActualizacionRenta(contrato({
      fechaCelebracionContrato: '2025-09-30', fechaInicioContrato: '2025-10-01',
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-01', serie: serieAFecha });
    expect(result.codigo).toBe('COHORTE_PRE_RDL29_REQUIERE_REVISION');
    expect(result.rentaFutura).toBeUndefined();
  });

  it('conserva REQUIERE_REVISION para la cohorte anterior a Ley 12/2023 conforme a su disposición transitoria', () => {
    const serieAFecha = [{ ...FUENTES_IRAV_OFICIALES[0], consultadoEn: '2026-10-01' }];
    const result = calcularPreviewActualizacionRenta(contrato({
      fechaCelebracionContrato: '2023-05-25', fechaInicioContrato: '2025-10-01',
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-01', serie: serieAFecha });
    expect(result.codigo).toBe('COHORTE_ANTERIOR_2023_REQUIERE_REVISION');
    expect(result.rentaFutura).toBeUndefined();
  });

  it('exige modalidad, causa temporal y prueba de uso; no aplica la regla de vivienda habitual a TEMPORADA', () => {
    const result = calcularPreviewActualizacionRenta(contrato({
      modalidadContractual: 'TEMPORADA',
      motivoTemporalidad: undefined,
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-17' });
    expect(result.codigo).toBe('TEMPORADA_NUEVA_SIN_CAUSA_ACREDITADA');
    expect(result.rentaFutura).toBeUndefined();

    const conCausa = calcularPreviewActualizacionRenta(contrato({
      modalidadContractual: 'TEMPORADA',
      motivoTemporalidad: 'Estudios acreditados',
      evidenciaUsoActualizacionRenta: { referenciaDocumental: 'contratos/c-1/matricula.pdf' },
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-17' });
    expect(conCausa.codigo).toBe('TEMPORADA_REGIMEN_REQUIERE_REVISION');
  });

  it('exige uso documentado para HABITACION y mantiene su régimen en revisión', () => {
    const sinUso = calcularPreviewActualizacionRenta(contrato({ modalidadContractual: 'HABITACION' }), {
      evidenciaContrato: 'contratos/c-1/contrato.pdf',
    }, { hoy: '2026-10-17' });
    const conUso = calcularPreviewActualizacionRenta(contrato({
      modalidadContractual: 'HABITACION',
      evidenciaUsoActualizacionRenta: { usoHabitacion: 'VIVIENDA_HABITUAL', referenciaDocumental: 'contratos/c-1/uso.pdf' },
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-17' });
    expect(sinUso.codigo).toBe('HABITACION_SIN_USO_ACREDITADO');
    expect(conUso.codigo).toBe('HABITACION_REGIMEN_REQUIERE_REVISION');
    expect(conUso.rentaFutura).toBeUndefined();
  });

  it('no calcula anualidades futuras con un índice que todavía podría cambiar', () => {
    const result = calcularPreviewActualizacionRenta(contrato({
      fechaInicioContrato: '2026-10-17',
      fechaCelebracionContrato: '2026-10-08',
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-17' });
    expect(result.codigo).toBe('IRAV_NO_PUBLICADO_EN_FECHA');
    expect(result.fechaAniversario).toBe('2027-10-17');
    expect(result.rentaFutura).toBeUndefined();
  });

  it('no permite importe ni actualización automática en cohorte extraordinaria sin límite obtenido por servidor', () => {
    const result = calcularPreviewActualizacionRenta(contrato(), {
      evidenciaContrato: 'contratos/c-1/contrato.pdf',
    }, { hoy: '2026-10-17' });
    expect(result.codigo).toBe('LIMITE_PRECIO_REFERENCIA_NO_VERIFICADO');
    expect(result.rentaFutura).toBeUndefined();
    expect(result.porcentajeAplicado).toBeUndefined();
    expect(result.topes).toMatchObject({ iravPct: 2.54, limiteExtraordinarioPct: 2 });
    expect(result.topes?.aplicable.join(' ')).toContain('máximo oficial individual');
  });

  it('mantiene REQUIERE_REVISION incluso con un límite de prueba y una renta superior; no confía en el flag del cliente', () => {
    const result = calcularPreviewActualizacionRenta(contrato({ rentaMensual: 1_600 }), {
      evidenciaContrato: 'contratos/c-1/contrato.pdf',
      limitePrecioReferencia: limiteServidor,
    }, { hoy: '2026-10-17' });
    expect(result.codigo).toBe('COHORTE_EXTRAORDINARIA_REQUIERE_REVISION');
    expect(result.rentaFutura).toBeUndefined();
    expect(result.estado).toBe('REQUIERE_REVISION');
    expect(result.topes).toMatchObject({ limitePrecioReferencia: 1_500, limiteExtraordinarioPct: 2 });
    expect(result.fechaEfectividad).toBeNull();
  });

  it('no convierte una cláusula ausente confirmada en un resultado automático dentro de la regla extraordinaria', () => {
    const result = calcularPreviewActualizacionRenta(contrato({
      evidenciaClausulaActualizacionRenta: { estado: 'AUSENTE_CONFIRMADA' },
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-17' });
    expect(result.codigo).toBe('COHORTE_EXTRAORDINARIA_REQUIERE_REVISION');
    expect(result.estado).toBe('REQUIERE_REVISION');
    expect(result.rentaFutura).toBeUndefined();
  });

  it('requiere referencia de cláusula y no sustituye IPC/IGC por IRAV', () => {
    const sinReferencia = calcularPreviewActualizacionRenta(contrato({
      evidenciaClausulaActualizacionRenta: { estado: 'ACREDITADA', mecanismo: 'IRAV' },
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-17' });
    const ipc = calcularPreviewActualizacionRenta(contrato({
      evidenciaClausulaActualizacionRenta: { ...clausulaIRAV, mecanismo: 'IPC' },
    }), { evidenciaContrato: 'contratos/c-1/contrato.pdf' }, { hoy: '2026-10-17' });
    expect(sinReferencia.codigo).toBe('CLAUSULA_SIN_REFERENCIA');
    expect(ipc.codigo).toBe('INDICE_CONTRACTUAL_NO_DISPONIBLE');
    expect(ipc.rentaFutura).toBeUndefined();
  });

  it('conserva procedencia de BOE/INE y registra consulta, publicación, serie y periodo', () => {
    const result = calcularPreviewActualizacionRenta(contrato({ fechaCelebracionContrato: '2026-10-07' }), {}, { hoy: '2026-10-17' });
    expect(result.fuentesOficiales?.some((fuente) => fuente.identificador.includes('BOE-A-2026-20823'))).toBe(true);
    expect(FUENTES_IRAV_OFICIALES).toEqual(expect.arrayContaining([
      expect.objectContaining({ serie: 'IRAV1', periodo: '2026M09', variacionAnualPct: 2.54, estado: 'DEFINITIVO', publicadoEn: '2026-10-14', consultadoEn: '2026-10-17' }),
    ]));
  });

  it('realiza redondeo aritmético a céntimos sin definir la regla jurídica aplicable', () => {
    expect(calcularRentaAplicandoPorcentaje(1_250.01, 2.47)).toBe(1_280.89);
    expect(calcularRentaAplicandoPorcentaje(0.01, 50)).toBe(0.02);
    expect(Number.isNaN(calcularRentaAplicandoPorcentaje(1.005, 2.54))).toBe(true);
    expect(Number.isNaN(calcularRentaAplicandoPorcentaje(1_000, -1))).toBe(true);
  });

  it('prepara solo el borrador de aviso con fecha elegida y nunca afirma envío o efectividad', () => {
    const preview: PreviewActualizacionRenta = {
      estado: 'CALCULABLE', contratoId: 'contrato-1', fechaAniversario: '2028-10-17',
      fechaEfectividad: null, rentaActual: 1_000,
      porcentajeAplicado: 2, importeIncremento: 20, rentaFutura: 1_020,
      comunicado: 'NO_COMUNICADO', estadoAviso: 'NO_PROGRAMADO',
    };
    const orden = programarAvisoActualizacionRenta(preview, {
      actorUid: 'uid-owner-1', actorUsuarioId: 'user-owner-1',
      idempotencyKeyHash: 'a'.repeat(64), confirmadoEn: '2028-09-17T10:00:00.000Z',
      fechaProgramadaAviso: '2028-09-17',
    });
    expect(orden?.estado).toBe('PENDIENTE_ENVIO');
    expect(orden?.fechaProgramadaAviso).toBe('2028-09-17');
    expect(orden?.comunicado).toBe('NO_COMUNICADO');
    expect(orden?.fechaEfectividad).toBeNull();
    expect(orden?.version).toBe(1);
    expect(programarAvisoActualizacionRenta({ ...preview, estado: 'REQUIERE_REVISION' }, {
      actorUid: 'uid-owner-1', actorUsuarioId: 'user-owner-1',
      idempotencyKeyHash: 'a'.repeat(64), confirmadoEn: '2028-09-17T10:00:00.000Z',
      fechaProgramadaAviso: '2028-09-17',
    })).toBeNull();
    expect(programarAvisoActualizacionRenta(preview, {
      actorUid: 'uid-owner-1', actorUsuarioId: 'user-owner-1',
      idempotencyKeyHash: 'not-a-hash', confirmadoEn: '2028-09-17T10:00:00.000Z',
      fechaProgramadaAviso: '2028-09-17',
    })).toBeNull();
  });

  it('marca un snapshot antiguo como no apto y exige refrescar la fuente oficial', () => {
    const datos = {
      evidenciaContrato: 'contratos/c-1/contrato.pdf',
      limitePrecioReferencia: { ...limiteServidor, consultadoEn: '2027-10-17' },
    };
    const contratoAnual = contrato({
      fechaCelebracionContrato: '2026-10-08',
      fechaInicioContrato: '2025-10-17',
    });
    const antiguo = calcularPreviewActualizacionRenta(contratoAnual, datos, {
      hoy: '2027-10-17', serie: FUENTES_IRAV_OFICIALES,
    });
    expect(antiguo.codigo).toBe('FUENTE_IRAV_DESACTUALIZADA');
    expect(antiguo.rentaFutura).toBeUndefined();

    const refrescado = calcularPreviewActualizacionRenta(contratoAnual, datos, {
      hoy: '2027-10-17', serie: serieMock2027(),
    });
    expect(refrescado.codigo).toBe('COHORTE_EXTRAORDINARIA_REQUIERE_REVISION');
    expect(refrescado.rentaFutura).toBeUndefined();
  });
});
