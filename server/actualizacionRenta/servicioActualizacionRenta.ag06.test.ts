import { describe, expect, it } from 'vitest';
import type { ContratoFormalizacion } from '../../src/types';
import type { PreviewActualizacionRenta } from '../../src/utils/actualizacionRentaEngine';
import {
  crearServicioActualizacionRenta,
  type EscrituraP4Atomica,
} from './servicioActualizacionRenta';

/**
 * AG-06 · Integración renta → recibos contra el servicio server-side.
 *
 * Se reutiliza el mismo arnés que las pruebas P4 (Firestore en memoria con
 * precondiciones de versión reales), de modo que estos casos ejercitan el
 * commit atómico y no un doble simplificado.
 *
 * Todas las escrituras ocurren en memoria: no hay ninguna escritura real.
 * Datos sintéticos; ningún identificador corresponde a un inmueble real.
 */

class FirestoreMemoriaAg06 {
  readonly documentos = new Map<string, Record<string, unknown>>();
  readonly versiones = new Map<string, number>();

  sembrar(ruta: string, datos: Record<string, unknown>): void {
    this.documentos.set(ruta, structuredClone(datos));
    this.versiones.set(ruta, (this.versiones.get(ruta) || 0) + 1);
  }

  async leerDocumento(ruta: string) {
    const datos = this.documentos.get(ruta);
    return datos
      ? { id: ruta.split('/').pop() || '', datos: structuredClone(datos), updateTime: String(this.versiones.get(ruta)) }
      : null;
  }

  async escribirAtomico(escrituras: readonly EscrituraP4Atomica[]): Promise<'COMMIT' | 'CONFLICTO'> {
    const conflicto = escrituras.some((e) => (e.precondicion.tipo === 'NO_EXISTE'
      ? this.documentos.has(`${e.coleccion}/${e.id}`)
      : String(this.versiones.get(`${e.coleccion}/${e.id}`)) !== e.precondicion.updateTime));
    if (conflicto) return 'CONFLICTO';
    for (const escritura of escrituras) {
      const ruta = `${escritura.coleccion}/${escritura.id}`;
      this.sembrar(ruta, escritura.camposActualizar
        ? { ...this.documentos.get(ruta), ...escritura.datos }
        : escritura.datos);
    }
    return 'COMMIT';
  }
}

const UID_PROPIETARIO_A = 'uid-prop-ag06-a';
const UID_PROPIETARIO_B = 'uid-prop-ag06-b';
const EVIDENCIA = { fecha: '2026-09-20', referenciaDocumental: 'fixture-ag06-no-real.pdf', declaradaPorActor: true as const };

const RENTA_ANTERIOR = 1_200;
const RENTA_NUEVA = 1_224;
/** `fechaEfectividadDesdeComunicacion` fija la efectividad al día 1 del mes siguiente. */
const FECHA_EFECTIVA = '2026-10-01';

function previewAutorizada(contrato: ContratoFormalizacion): PreviewActualizacionRenta {
  return {
    estado: 'CALCULABLE',
    contratoId: contrato.id,
    propietarioId: contrato.propietarioId,
    modalidad: 'VIVIENDA_HABITUAL',
    finalidadUso: 'Vivienda habitual',
    referenciaContrato: 'fixture-sintetico:no-es-evidencia-real',
    evidenciaClausula: { estado: 'ACREDITADA', textoExtracto: 'fixture', referenciaDocumental: 'fixture', mecanismo: 'IRAV' },
    fechaCelebracion: contrato.fechaCelebracionContrato,
    fechaInicioContrato: contrato.fechaInicioContrato,
    fechaAniversario: '2026-10-01',
    fechaEfectividad: null,
    rentaActual: RENTA_ANTERIOR,
    porcentajeAplicado: 2,
    importeIncremento: 24,
    rentaFutura: RENTA_NUEVA,
    indice: {
      serie: 'IRAV1', periodo: '2026M09', estado: 'DEFINITIVO', valorPct: 2.54,
      publicadoEn: '2026-10-14', consultadoEn: '2026-10-17',
      urlSerie: 'https://www.ine.es/consul/serie.do?d=true&s=IRAV1',
      urlCalendario: 'https://www.ine.es/dynt3/Calendario/calenHTML.htm',
    },
    topes: { iravPct: 2.54, aplicable: ['fixture sintético'] },
    baseLegal: ['https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-20823'],
    fuentesOficiales: [],
    comunicado: 'NO_COMUNICADO',
    estadoAviso: 'NO_PROGRAMADO',
  };
}

function cobro(extra: Record<string, unknown>) {
  return {
    inmuebleId: 'inm-ag06-a',
    contratoId: 'contrato-ag06-a',
    propietarioId: 'prop-ag06-a',
    mes: 1, anio: 2026, periodoMesAnio: '2026-01', nombreMes: 'Enero 2026',
    importePrevisto: RENTA_ANTERIOR,
    importeRecibido: 0,
    fechaVencimiento: '2026-01-05',
    estado: 'PENDIENTE',
    historialCambios: [] as unknown[],
    ...extra,
    id: String(extra.id),
  };
}

function crearEntorno() {
  const puerto = new FirestoreMemoriaAg06();
  const reloj = { fecha: '2026-10-17T12:00:00.000Z' };

  const perfil = (uid: string, usuarioId: string, tipoPerfil: string, campos: Record<string, unknown> = {}) => {
    puerto.sembrar(`usuarios_auth/${uid}`, { estado: 'ACTIVO', authUid: uid, usuarioId, tipoPerfil, ...campos });
    puerto.sembrar(`usuarios/${usuarioId}`, { estado: 'ACTIVO', authUid: uid, tipoPerfil, ...campos });
  };
  perfil(UID_PROPIETARIO_A, 'user-ag06-prop-a', 'PROPIETARIO', {
    propietarioId: 'prop-ag06-a', nombre: 'Titular A sintético', email: 'titular-a@example.invalid',
  });
  perfil(UID_PROPIETARIO_B, 'user-ag06-prop-b', 'PROPIETARIO', { propietarioId: 'prop-ag06-b' });

  puerto.sembrar('contratos_formalizacion/contrato-ag06-a', {
    id: 'contrato-ag06-a', propietarioId: 'prop-ag06-a', inmuebleId: 'inm-ag06-a',
    modalidadContractual: 'VIVIENDA_HABITUAL', finalidadUso: 'Vivienda habitual',
    fechaCelebracionContrato: '2026-10-07', fechaInicioContrato: '2025-10-17',
    rentaMensual: RENTA_ANTERIOR, esVigente: true,
    referenciaContratoActualizacionRenta: 'contratos/contrato-ag06-a/original.pdf',
    evidenciaClausulaActualizacionRenta: {
      estado: 'ACREDITADA', textoExtracto: 'Cláusula sintética de actualización.',
      referenciaDocumental: 'contratos/contrato-ag06-a/original.pdf#5', mecanismo: 'SIN_DETALLAR',
    },
    registroCobros: [
      // Ya cobrado: nunca se toca.
      cobro({ id: 'cobro-2026-08', periodoMesAnio: '2026-08', mes: 8, estado: 'RECIBIDO', importeRecibido: RENTA_ANTERIOR }),
      // Parcial: nunca se toca.
      cobro({ id: 'cobro-2026-09', periodoMesAnio: '2026-09', mes: 9, estado: 'PAGADO_PARCIAL', importeRecibido: 400 }),
      // El mes de la efectividad ya está iniciado: se conserva.
      cobro({ id: 'cobro-2026-10', periodoMesAnio: '2026-10', mes: 10 }),
      // Futuros pendientes: sí se actualizan.
      cobro({ id: 'cobro-2026-11', periodoMesAnio: '2026-11', mes: 11 }),
      cobro({ id: 'cobro-2026-12', periodoMesAnio: '2026-12', mes: 12 }),
      // Vencido e impagado: es una deuda ya reclamada, no se toca.
      cobro({ id: 'cobro-2027-01', periodoMesAnio: '2027-01', mes: 1, anio: 2027, estado: 'RETRASADO' }),
    ],
  });

  // Contrato de otro titular: no debe verse afectado.
  puerto.sembrar('contratos_formalizacion/contrato-ag06-b', {
    id: 'contrato-ag06-b', propietarioId: 'prop-ag06-b', inmuebleId: 'inm-ag06-b',
    modalidadContractual: 'VIVIENDA_HABITUAL', finalidadUso: 'Vivienda habitual',
    fechaCelebracionContrato: '2026-10-07', fechaInicioContrato: '2025-10-17',
    rentaMensual: 900, esVigente: true,
    registroCobros: [cobro({ id: 'cobro-b-2026-11', periodoMesAnio: '2026-11', mes: 11, contratoId: 'contrato-ag06-b', importePrevisto: 900 })],
  });

  const servicio = crearServicioActualizacionRenta({
    puerto,
    ahora: () => new Date(reloj.fecha),
    calcularPreview: previewAutorizada,
  });

  const entradaConfirmacion = (vista: { huellaPreview: string }, idempotencyKey: string) => ({
    uid: UID_PROPIETARIO_A,
    contratoId: 'contrato-ag06-a',
    huellaPreview: vista.huellaPreview,
    idempotencyKey,
    fechaProgramadaAviso: '2026-10-20',
    confirmacionExplicita: true,
    evidenciaComunicacion: EVIDENCIA,
  });

  return { puerto, servicio, reloj, entradaConfirmacion };
}

describe('AG-06 · recibos futuros al confirmar la actualización de renta', () => {
  it('actualiza los recibos futuros pendientes y devuelve cuáles cambió', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    const resultado = await servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0001'));

    expect(resultado.estado).toBe('CREADA');
    expect(resultado.recibosActualizados).toEqual([
      { reciboId: 'cobro-2026-11', periodoMesAnio: '2026-11', importeAnterior: RENTA_ANTERIOR, importeNuevo: RENTA_NUEVA },
      { reciboId: 'cobro-2026-12', periodoMesAnio: '2026-12', importeAnterior: RENTA_ANTERIOR, importeNuevo: RENTA_NUEVA },
    ]);

    const contrato = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!;
    const recibos = contrato.registroCobros as Array<Record<string, unknown>>;
    const porId = Object.fromEntries(recibos.map((r) => [r.id, r]));

    expect(porId['cobro-2026-11'].importePrevisto).toBe(RENTA_NUEVA);
    expect(porId['cobro-2026-12'].importePrevisto).toBe(RENTA_NUEVA);
    // La renta del contrato también queda actualizada.
    expect(contrato.rentaMensual).toBe(RENTA_NUEVA);
  });

  it('conserva cobrados, parciales, el mes iniciado y el retrasado', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    await servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0002'));

    const contrato = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!;
    const porId = Object.fromEntries(
      (contrato.registroCobros as Array<Record<string, unknown>>).map((r) => [r.id, r]),
    );

    expect(porId['cobro-2026-08']).toMatchObject({ importePrevisto: RENTA_ANTERIOR, importeRecibido: RENTA_ANTERIOR, estado: 'RECIBIDO' });
    expect(porId['cobro-2026-09']).toMatchObject({ importePrevisto: RENTA_ANTERIOR, importeRecibido: 400, estado: 'PAGADO_PARCIAL' });
    expect(porId['cobro-2026-10']).toMatchObject({ importePrevisto: RENTA_ANTERIOR, estado: 'PENDIENTE' });
    expect(porId['cobro-2027-01']).toMatchObject({ importePrevisto: RENTA_ANTERIOR, estado: 'RETRASADO' });
  });

  it('el mes de la fecha efectiva se conserva: la subida empieza en el periodo siguiente', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    const resultado = await servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0003'));

    expect(resultado.fechaEfectividad).toBe(FECHA_EFECTIVA);
    const contrato = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!;
    const octubre = (contrato.registroCobros as Array<Record<string, unknown>>)
      .find((r) => r.periodoMesAnio === '2026-10')!;
    expect(octubre.importePrevisto).toBe(RENTA_ANTERIOR);
    expect(resultado.recibosActualizados?.some((r) => r.periodoMesAnio === '2026-10')).toBe(false);
  });

  it('deja traza en el historial de cada recibo actualizado', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    await servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0004'));

    const contrato = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!;
    const noviembre = (contrato.registroCobros as Array<Record<string, unknown>>)
      .find((r) => r.periodoMesAnio === '2026-11')!;
    const historial = noviembre.historialCambios as Array<Record<string, unknown>>;

    expect(historial).toHaveLength(1);
    expect(historial[0]).toMatchObject({
      accion: 'ACTUALIZACION_RENTA_IMPORTE_PREVISTO',
      importeAnterior: RENTA_ANTERIOR,
      importeNuevo: RENTA_NUEVA,
      usuarioId: 'user-ag06-prop-a',
      usuarioNombre: 'Titular A sintético',
    });
    // Los recibos que no se tocan no reciben traza.
    const octubre = (contrato.registroCobros as Array<Record<string, unknown>>)
      .find((r) => r.periodoMesAnio === '2026-10')!;
    expect(octubre.historialCambios).toEqual([]);
  });

  it('registra la operación en audit_logs con los importes de cada recibo', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    const resultado = await servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0005'));

    const auditorias = [...puerto.documentos.entries()].filter(([ruta]) => ruta.startsWith('audit_logs/'));
    expect(auditorias).toHaveLength(1);

    const [, datos] = auditorias[0];
    expect(datos).toMatchObject({
      accion: 'ACTUALIZACION_RENTA_IMPORTES_PREVISTOS',
      entidadAfectada: 'contrato',
      idAfectado: 'contrato-ag06-a',
      usuarioId: 'user-ag06-prop-a',
      usuarioEmail: 'titular-a@example.invalid',
      resultado: 'EXITO',
    });
    expect((datos.detalles as Record<string, unknown>).recibosActualizados).toHaveLength(2);
    expect((datos.detalles as Record<string, unknown>).anexoId).toBe(resultado.anexoId);
    expect((datos.detalles as Record<string, unknown>).fechaEfectividad).toBe(FECHA_EFECTIVA);
  });

  it('un reintento no duplica ni los cambios ni la auditoría', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    const entrada = entradaConfirmacion(vista, 'ag06-idempotency-key-0006');

    const primera = await servicio.confirmar(entrada);
    const recibosTrasPrimera = structuredClone(
      puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!.registroCobros,
    );
    const totalDocumentos = puerto.documentos.size;

    const segunda = await servicio.confirmar(entrada);

    expect(segunda.estado).toBe('REPETIDA');
    expect(puerto.documentos.size).toBe(totalDocumentos);
    expect(puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!.registroCobros)
      .toEqual(recibosTrasPrimera);
    expect(segunda.recibosActualizados).toEqual(primera.recibosActualizados);
    expect([...puerto.documentos.keys()].filter((r) => r.startsWith('audit_logs/'))).toHaveLength(1);
  });

  it('no toca los recibos de otro contrato', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const contratoBAntes = structuredClone(puerto.documentos.get('contratos_formalizacion/contrato-ag06-b'));
    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    await servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0007'));

    expect(puerto.documentos.get('contratos_formalizacion/contrato-ag06-b')).toEqual(contratoBAntes);
  });

  it('conserva el historial económico previo de los recibos actualizados', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const contrato = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!;
    const recibos = contrato.registroCobros as Array<Record<string, unknown>>;
    const noviembre = recibos.find((r) => r.id === 'cobro-2026-11')!;
    noviembre.historialCambios = [{ id: 'hist-previo', fecha: '2026-09-01T00:00:00.000Z', accion: 'ALTA', importeNuevo: RENTA_ANTERIOR }];
    puerto.sembrar('contratos_formalizacion/contrato-ag06-a', contrato);

    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    await servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0008'));

    const actualizado = (puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!.registroCobros as Array<Record<string, unknown>>)
      .find((r) => r.id === 'cobro-2026-11')!;
    const historial = actualizado.historialCambios as Array<Record<string, unknown>>;
    expect(historial).toHaveLength(2);
    expect(historial[0]).toMatchObject({ id: 'hist-previo', accion: 'ALTA', importeNuevo: RENTA_ANTERIOR });
    expect(historial[1]).toMatchObject({ accion: 'ACTUALIZACION_RENTA_IMPORTE_PREVISTO', importeNuevo: RENTA_NUEVA });
  });

  it('un contrato sin recibos materializados se actualiza sin escribir registroCobros', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const contrato = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!;
    delete contrato.registroCobros;
    puerto.sembrar('contratos_formalizacion/contrato-ag06-a', contrato);

    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    const resultado = await servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0009'));

    expect(resultado.recibosActualizados).toEqual([]);
    const despues = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!;
    expect(despues.rentaMensual).toBe(RENTA_NUEVA);
    expect(despues.registroCobros).toBeUndefined();
    // Aun sin recibos, la operación queda auditada.
    expect([...puerto.documentos.keys()].filter((r) => r.startsWith('audit_logs/'))).toHaveLength(1);
  });

  it('si la precondición de versión falla no se escribe ni renta ni recibos', async () => {
    const { puerto, servicio, entradaConfirmacion } = crearEntorno();
    const vista = await servicio.previsualizar({
      uid: UID_PROPIETARIO_A, contratoId: 'contrato-ag06-a', evidenciaComunicacion: EVIDENCIA,
    });
    const recibosAntes = structuredClone(puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!.registroCobros);
    const rentaAntes = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!.rentaMensual;

    // Escritura concurrente: cambia la versión del contrato entre preview y commit.
    const contrato = puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!;
    puerto.sembrar('contratos_formalizacion/contrato-ag06-a', { ...contrato, notasPrivadas: 'cambio concurrente sintético' });

    await expect(servicio.confirmar(entradaConfirmacion(vista, 'ag06-idempotency-key-0010'))).rejects.toMatchObject({
      codigo: expect.stringMatching(/PREVIEW_DESACTUALIZADO|ACTUALIZACION_YA_CONFIRMADA|FUENTE_NO_DISPONIBLE/),
    });

    expect(puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!.registroCobros).toEqual(recibosAntes);
    expect(puerto.documentos.get('contratos_formalizacion/contrato-ag06-a')!.rentaMensual).toBe(rentaAntes);
  });
});
