import { describe, expect, it } from 'vitest';
import type { ContratoFormalizacion } from '../../src/types';
import type { PreviewActualizacionRenta } from '../../src/utils/actualizacionRentaEngine';
import {
  crearServicioActualizacionRenta,
  ErrorActualizacionRenta,
  type EscrituraP4Atomica,
} from './servicioActualizacionRenta';

class FirestoreMemoriaP4 {
  readonly documentos = new Map<string, Record<string, unknown>>();
  fallarLectura = false;
  readonly versiones = new Map<string, number>();

  sembrar(ruta: string, datos: Record<string, unknown>): void {
    this.documentos.set(ruta, structuredClone(datos));
    this.versiones.set(ruta, (this.versiones.get(ruta) || 0) + 1);
  }

  async leerDocumento(ruta: string) {
    if (this.fallarLectura) throw new Error('fallo sintético; no representa Firestore real');
    const datos = this.documentos.get(ruta);
    return datos ? { id: ruta.split('/').pop() || '', datos: structuredClone(datos), updateTime: String(this.versiones.get(ruta)) } : null;
  }

  async escribirAtomico(escrituras: readonly EscrituraP4Atomica[]): Promise<'COMMIT' | 'CONFLICTO'> {
    if (escrituras.some((e) => e.precondicion.tipo === 'NO_EXISTE'
      ? this.documentos.has(`${e.coleccion}/${e.id}`)
      : String(this.versiones.get(`${e.coleccion}/${e.id}`)) !== e.precondicion.updateTime)) return 'CONFLICTO';
    for (const escritura of escrituras) {
      const ruta = `${escritura.coleccion}/${escritura.id}`;
      this.sembrar(ruta, escritura.camposActualizar ? { ...this.documentos.get(ruta), ...escritura.datos } : escritura.datos);
    }
    return 'COMMIT';
  }
}

const evidencia = { fecha: '2026-09-20', referenciaDocumental: 'fixture-comunicacion-no-real.pdf', declaradaPorActor: true as const };

const UID_PROPIETARIO_A = 'uid-propietario-a';
const UID_PROPIETARIO_B = 'uid-propietario-b';
const UID_INQUILINO_A = 'uid-inquilino-a';
const UID_GESTOR_A = 'uid-gestor-a';

function calculadoraSinteticaAutorizada(
  contrato: ContratoFormalizacion,
): PreviewActualizacionRenta {
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
    rentaActual: contrato.rentaMensual,
    porcentajeAplicado: 2,
    importeIncremento: 24,
    rentaFutura: contrato.rentaMensual + 24,
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

function crearEntorno(calcularPreview?: Parameters<typeof crearServicioActualizacionRenta>[0]['calcularPreview']) {
  const puerto = new FirestoreMemoriaP4();
  const reloj = { fecha: '2026-10-17T12:00:00.000Z' };
  const perfil = (uid: string, usuarioId: string, tipoPerfil: string, campos: Record<string, unknown> = {}) => {
    puerto.sembrar(`usuarios_auth/${uid}`, {
      estado: 'ACTIVO', authUid: uid, usuarioId, tipoPerfil,
      ...campos,
    });
    puerto.sembrar(`usuarios/${usuarioId}`, {
      estado: 'ACTIVO', authUid: uid, tipoPerfil,
      ...campos,
    });
  };
  perfil(UID_PROPIETARIO_A, 'user-prop-a', 'PROPIETARIO', { propietarioId: 'prop-a' });
  perfil(UID_PROPIETARIO_B, 'user-prop-b', 'PROPIETARIO', { propietarioId: 'prop-b' });
  perfil(UID_INQUILINO_A, 'user-inq-a', 'INQUILINO', { contratoIds: ['contrato-a'] });
  perfil(UID_GESTOR_A, 'user-gestor-a', 'ADMINISTRADOR', { gestionesPorPropietario: { 'prop-a': 'rel-a' } });

  puerto.sembrar('contratos_formalizacion/contrato-a', {
    id: 'contrato-a', propietarioId: 'prop-a', inmuebleId: 'inm-a',
    modalidadContractual: 'VIVIENDA_HABITUAL', finalidadUso: 'Vivienda habitual',
    fechaCelebracionContrato: '2026-10-07', fechaInicioContrato: '2025-10-17',
    rentaMensual: 1_200, esVigente: true,
    referenciaContratoActualizacionRenta: 'contratos/contrato-a/original.pdf',
    evidenciaClausulaActualizacionRenta: {
      estado: 'ACREDITADA', textoExtracto: 'Cláusula sintética de actualización.',
      referenciaDocumental: 'contratos/contrato-a/original.pdf#5', mecanismo: 'SIN_DETALLAR',
    },
  });
  puerto.sembrar('contratos_formalizacion/contrato-b', {
    id: 'contrato-b', propietarioId: 'prop-b', inmuebleId: 'inm-b',
    modalidadContractual: 'VIVIENDA_HABITUAL', finalidadUso: 'Vivienda habitual',
    fechaCelebracionContrato: '2026-10-07', fechaInicioContrato: '2025-10-17',
    rentaMensual: 900, esVigente: true,
  });
  puerto.sembrar('gestiones_cartera/rel-a', {
    propietarioId: 'prop-a', gestorUsuarioId: 'user-gestor-a',
    estado: 'ACTIVA', resolucionInvitacion: 'ACEPTADA',
    permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR', inmuebleIds: ['inm-a'],
  });

  const servicioReal = crearServicioActualizacionRenta({
    puerto,
    ahora: () => new Date(reloj.fecha),
    ...(calcularPreview ? { calcularPreview } : {}),
  });
  // Evidencia explícita por defecto para pruebas del servicio; los casos de ausencia la sobrescriben.
  const servicio = {
    previsualizar: (entrada: Parameters<typeof servicioReal.previsualizar>[0]) => servicioReal.previsualizar({ evidenciaComunicacion: evidencia, ...entrada }),
    confirmar: (entrada: Parameters<typeof servicioReal.confirmar>[0]) => servicioReal.confirmar({ evidenciaComunicacion: evidencia, ...entrada }),
  };
  return { puerto, servicio, reloj };
}

describe('P4 · servicio server-side de previsualización y autorización de cartera', () => {
  it('resuelve el propietario desde el contrato en Firestore y devuelve solo el preview fail-closed', async () => {
    const { servicio } = crearEntorno();
    const { preview, huellaPreview } = await servicio.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' });
    expect(preview.contratoId).toBe('contrato-a');
    expect(preview.propietarioId).toBe('prop-a');
    expect(preview.estado).toBe('REQUIERE_REVISION');
    expect(preview.codigo).toBe('LIMITE_PRECIO_REFERENCIA_NO_VERIFICADO');
    expect(preview.rentaFutura).toBeUndefined();
    expect(preview.evidenciaClausula?.textoExtracto).toBe('Cláusula sintética de actualización.');
    expect(preview.referenciaContrato).toBe('contratos/contrato-a/original.pdf');
    expect(preview.comunicado).toBe('NO_COMUNICADO');
    expect(preview.estadoAviso).toBe('NO_PROGRAMADO');
    expect(huellaPreview).toMatch(/^[a-f0-9]{64}$/);
  });

  it('aisla dos titulares y no permite que el propietario B lea el contrato A', async () => {
    const { servicio } = crearEntorno();
    const previewB = await servicio.previsualizar({ uid: UID_PROPIETARIO_B, contratoId: 'contrato-b' });
    expect(previewB.preview.propietarioId).toBe('prop-b');
    await expect(servicio.previsualizar({ uid: UID_PROPIETARIO_B, contratoId: 'contrato-a' }))
      .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
  });

  it('deniega a un inquilino incluso si figura vinculado al contrato', async () => {
    const { servicio } = crearEntorno();
    await expect(servicio.previsualizar({ uid: UID_INQUILINO_A, contratoId: 'contrato-a' }))
      .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
  });

  it('autoriza a un gestor solo con relación aceptada, activa, de escritura, responsable y dentro de inmueble', async () => {
    const { servicio } = crearEntorno();
    const preview = await servicio.previsualizar({ uid: UID_GESTOR_A, contratoId: 'contrato-a' });
    expect(preview.preview.estado).toBe('REQUIERE_REVISION');

    const { puerto: puertoFuera, servicio: servicioFuera } = crearEntorno();
    puertoFuera.sembrar('gestiones_cartera/rel-a', {
      propietarioId: 'prop-a', gestorUsuarioId: 'user-gestor-a',
      estado: 'ACTIVA', resolucionInvitacion: 'ACEPTADA',
      permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR', inmuebleIds: ['otro-inmueble'],
    });
    await expect(servicioFuera.previsualizar({ uid: UID_GESTOR_A, contratoId: 'contrato-a' }))
      .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
  });

  it('no amplía el ámbito si falta o está corrupta la lista; [] solo significa cartera completa cuando se declara expresamente', async () => {
    const base = {
      propietarioId: 'prop-a', gestorUsuarioId: 'user-gestor-a', estado: 'ACTIVA',
      resolucionInvitacion: 'ACEPTADA', permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
    };
    for (const ambito of [undefined, ['inm-a', 17]]) {
      const { puerto, servicio } = crearEntorno();
      puerto.sembrar('gestiones_cartera/rel-a', {
        ...base,
        ...(ambito === undefined ? {} : { inmuebleIds: ambito }),
      });
      await expect(servicio.previsualizar({ uid: UID_GESTOR_A, contratoId: 'contrato-a' }))
        .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
    }

    const { puerto, servicio } = crearEntorno();
    puerto.sembrar('gestiones_cartera/rel-a', { ...base, inmuebleIds: [] });
    await expect(servicio.previsualizar({ uid: UID_GESTOR_A, contratoId: 'contrato-a' }))
      .resolves.toMatchObject({ preview: { propietarioId: 'prop-a' } });
  });

  it('deniega relación de cartera sin aceptar, lectura sola o transferida al propietario', async () => {
    const casos = [
      { resolucionInvitacion: 'PENDIENTE', permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR' },
      { resolucionInvitacion: 'ACEPTADA', permiso: 'LECTURA', responsableActual: 'GESTOR' },
      { resolucionInvitacion: 'ACEPTADA', permiso: 'LECTURA_ESCRITURA', responsableActual: 'PROPIETARIO' },
    ];
    for (const cambios of casos) {
      const { puerto, servicio } = crearEntorno();
      puerto.sembrar('gestiones_cartera/rel-a', {
        propietarioId: 'prop-a', gestorUsuarioId: 'user-gestor-a', estado: 'ACTIVA',
        inmuebleIds: [], ...cambios,
      });
      await expect(servicio.previsualizar({ uid: UID_GESTOR_A, contratoId: 'contrato-a' }))
        .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
    }
  });

  it('falla cerrado ante perfiles cruzados, contrato inexistente, ID inválido y fuente no disponible', async () => {
    const { puerto, servicio } = crearEntorno();
    puerto.sembrar(`usuarios/user-prop-a`, { authUid: 'uid-de-otra-cuenta', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-a' });
    await expect(servicio.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' }))
      .rejects.toMatchObject({ codigo: 'PERFIL_NO_VALIDO', status: 403 });
    const { servicio: servicioInexistente } = crearEntorno();
    await expect(servicioInexistente.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: 'no-existe' }))
      .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
    await expect(servicioInexistente.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: '../contrato-a' }))
      .rejects.toBeInstanceOf(ErrorActualizacionRenta);

    const { puerto: puertoCaido, servicio: servicioCaido } = crearEntorno();
    puertoCaido.fallarLectura = true;
    await expect(servicioCaido.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' }))
      .rejects.toMatchObject({ codigo: 'FUENTE_NO_DISPONIBLE', status: 503 });
  });

  it('no confirma ni persiste si falta el clic explícito, la evidencia cambió o el motor devuelve revisión', async () => {
    const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const cantidadInicial = puerto.documentos.size;
    const vista = await servicio.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' });
    const base = {
      uid: UID_PROPIETARIO_A,
      contratoId: 'contrato-a',
      huellaPreview: vista.huellaPreview,
      idempotencyKey: 'idempotency-key-0001',
      fechaProgramadaAviso: '2026-10-20',
    };
    await expect(servicio.confirmar({ ...base, confirmacionExplicita: false }))
      .rejects.toMatchObject({ codigo: 'CONFIRMACION_EXPLICITA_REQUERIDA', status: 400 });
    await expect(servicio.confirmar({ ...base, huellaPreview: 'f'.repeat(64), confirmacionExplicita: true }))
      .rejects.toMatchObject({ codigo: 'PREVIEW_DESACTUALIZADO', status: 409 });
    expect(puerto.documentos.size).toBe(cantidadInicial);

    const { puerto: puertoRevision, servicio: servicioRevision } = crearEntorno();
    const previewRevision = await servicioRevision.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' });
    await expect(servicioRevision.confirmar({
      ...base, huellaPreview: previewRevision.huellaPreview, confirmacionExplicita: true,
    })).rejects.toMatchObject({ codigo: 'PREVIEW_REQUIERE_REVISION', status: 409 });
    expect([...puertoRevision.documentos.keys()].some((ruta) => ruta.startsWith('anexos_actualizacion_renta/'))).toBe(false);
    expect([...puertoRevision.documentos.keys()].some((ruta) => ruta.startsWith('avisos_actualizacion_renta/'))).toBe(false);
  });

  it('persiste en un único commit un anexo v1 inmutable, auditoría y aviso PENDIENTE_ENVIO; reintentos son idempotentes', async () => {
    const { puerto, servicio, reloj } = crearEntorno(calculadoraSinteticaAutorizada);
    puerto.sembrar('recibos/recibo-pasado', { estado: 'PAGADO', renta: 1_200, fechaPago: '2026-09-05' });
    puerto.sembrar('cobros/cobro-pasado', { estado: 'CONFIRMADO', importe: 1_200 });
    const reciboAntes = structuredClone(puerto.documentos.get('recibos/recibo-pasado'));
    const cobroAntes = structuredClone(puerto.documentos.get('cobros/cobro-pasado'));
    const vista = await servicio.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' });
    const entrada = {
      uid: UID_PROPIETARIO_A,
      contratoId: 'contrato-a',
      huellaPreview: vista.huellaPreview,
      idempotencyKey: 'idempotency-key-0001',
      fechaProgramadaAviso: '2026-10-20',
      confirmacionExplicita: true,
    };

    const creada = await servicio.confirmar(entrada);
    expect(creada).toMatchObject({
      estado: 'CREADA', version: 1, fechaAniversario: '2026-10-01',
      fechaProgramadaAviso: '2026-10-20', estadoAviso: 'PENDIENTE_ENVIO',
      comunicado: 'NO_COMUNICADO', fechaEfectividad: '2026-10-01', estadoActualizacion: 'EFECTIVA', rentaVigente: 1224,
    });
    const anexo = puerto.documentos.get(`anexos_actualizacion_renta/${creada.anexoId}`)!;
    const aviso = puerto.documentos.get(`avisos_actualizacion_renta/${creada.avisoId}`)!;
    expect(anexo).toMatchObject({ version: 1, estado: 'ACTUALIZACION_EFECTIVA_NO_FIRMADO', inmutable: true, rentaPropuesta: 1_224 });
    expect(aviso).toMatchObject({ estado: 'PENDIENTE_ENVIO', comunicado: 'NO_COMUNICADO', fechaEfectividad: '2026-10-01' });
    expect(aviso.canales).toMatchObject({
      EMAIL: { estado: 'PENDIENTE_VALIDACION', confirmadoSMTP: false },
      BANDEJA_INTERNA: { estado: 'PENDIENTE_VALIDACION', confirmadoPorCanal: false },
    });
    expect([...puerto.documentos.keys()].filter((ruta) => ruta.startsWith('auditoria_actualizacion_renta/'))).toHaveLength(1);

    expect(puerto.documentos.get('contratos_formalizacion/contrato-a')).toMatchObject({
      rentaMensual: 1224, inmuebleId: 'inm-a', propietarioId: 'prop-a', actualizacionRentaVigente: { fechaEfectividad: '2026-10-01', anexoId: creada.anexoId },
    });
    expect(anexo).toMatchObject({ rentaAnterior: 1200, rentaPropuesta: 1224, fechaEfectividad: creada.fechaEfectividad,
      versionCalculo: 'P4-IRAV1-v1', evidenciaComunicacion: { ...evidencia, actorUid: UID_PROPIETARIO_A } });
    expect(aviso).toMatchObject({ rentaPropuesta: creada.rentaVigente, contratoId: creada.contratoId, fechaEfectividad: creada.fechaEfectividad });
    const cantidadDocumentos = puerto.documentos.size;
    reloj.fecha = '2026-10-21T12:00:00.000Z'; // la fecha programada original ya quedó atrás
    const repetida = await servicio.confirmar(entrada);
    expect(repetida).toMatchObject({ estado: 'REPETIDA', anexoId: creada.anexoId, avisoId: creada.avisoId });
    expect(puerto.documentos.size).toBe(cantidadDocumentos);
    await expect(servicio.confirmar({ ...entrada, fechaProgramadaAviso: '2026-10-22' }))
      .rejects.toMatchObject({ codigo: 'IDEMPOTENCY_KEY_REUTILIZADA', status: 409 });
    await expect(servicio.confirmar({ ...entrada, idempotencyKey: 'idempotency-key-0002', fechaProgramadaAviso: '2026-10-21' }))
      .rejects.toMatchObject({ codigo: 'ACTUALIZACION_YA_CONFIRMADA', status: 409 });
    expect(puerto.documentos.get('recibos/recibo-pasado')).toEqual(reciboAntes);
    expect(puerto.documentos.get('cobros/cobro-pasado')).toEqual(cobroAntes);
    expect(puerto.documentos.size).toBe(cantidadDocumentos);
  });

  it('autoriza la mutación al propietario de su contrato y al gestor de escritura dentro de su cartera, nunca a otro titular/inquilino', async () => {
    const { servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const vistaGestor = await servicio.previsualizar({ uid: UID_GESTOR_A, contratoId: 'contrato-a' });
    const confirmacion = {
      uid: UID_GESTOR_A, contratoId: 'contrato-a', huellaPreview: vistaGestor.huellaPreview,
      idempotencyKey: 'idempotency-key-manager-01', fechaProgramadaAviso: '2026-10-20', confirmacionExplicita: true,
    };
    await expect(servicio.confirmar(confirmacion)).resolves.toMatchObject({ estado: 'CREADA' });

    const { servicio: servicioAislado } = crearEntorno(calculadoraSinteticaAutorizada);
    const vistaPropietarioA = await servicioAislado.previsualizar({ uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' });
    await expect(servicioAislado.confirmar({
      ...confirmacion, uid: UID_PROPIETARIO_B, huellaPreview: vistaPropietarioA.huellaPreview,
      idempotencyKey: 'idempotency-key-owner-b-01',
    })).rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
    await expect(servicioAislado.confirmar({
      ...confirmacion, uid: UID_INQUILINO_A, huellaPreview: vistaPropietarioA.huellaPreview,
      idempotencyKey: 'idempotency-key-tenant-01',
    })).rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
  });

  it('rechaza un fallo de escritura sin éxito ni documentos parciales (puerto simulado)', async () => {
    const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const entradaPreview = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' };
    const antes = structuredClone([...puerto.documentos]);
    const { huellaPreview } = await servicio.previsualizar(entradaPreview);
    expect([...puerto.documentos]).toEqual(antes);
    puerto.escribirAtomico = async () => { throw new Error('fallo de escritura simulado'); };
    await expect(servicio.confirmar({
      ...entradaPreview, huellaPreview, idempotencyKey: 'fallo-escritura-p4-01',
      fechaProgramadaAviso: '2026-10-20', confirmacionExplicita: true,
    })).rejects.toMatchObject({ codigo: 'FUENTE_NO_DISPONIBLE', status: 503 });
    expect([...puerto.documentos]).toEqual(antes);
  });

  it('serializa dos confirmaciones concurrentes de la anualidad sin duplicar (puerto simulado)', async () => {
    const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const identidad = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' };
    const { huellaPreview } = await servicio.previsualizar(identidad);
    const entrada = { ...identidad, huellaPreview, fechaProgramadaAviso: '2026-10-20', confirmacionExplicita: true };
    const resultados = await Promise.allSettled([
      servicio.confirmar({ ...entrada, idempotencyKey: 'concurrencia-p4-clave-a' }),
      servicio.confirmar({ ...entrada, idempotencyKey: 'concurrencia-p4-clave-b' }),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { codigo: 'ACTUALIZACION_YA_CONFIRMADA' },
    });
    expect([...puerto.documentos.keys()].filter((r) => r.startsWith('anexos_actualizacion_renta/'))).toHaveLength(1);
    expect([...puerto.documentos.keys()].filter((r) => r.startsWith('auditoria_actualizacion_renta/'))).toHaveLength(1);
  });

  it('recupera por la misma clave un commit cuya respuesta se perdió, sin duplicarlo (puerto simulado)', async () => {
    const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const identidad = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' };
    const { huellaPreview } = await servicio.previsualizar(identidad);
    const entrada = { ...identidad, huellaPreview, fechaProgramadaAviso: '2026-10-20',
      confirmacionExplicita: true, idempotencyKey: 'respuesta-perdida-p4-01' };
    const escribir = puerto.escribirAtomico.bind(puerto);
    puerto.escribirAtomico = async (escrituras) => {
      await escribir(escrituras);
      throw new Error('respuesta perdida tras commit simulado');
    };
    await expect(servicio.confirmar(entrada)).rejects.toMatchObject({ codigo: 'FUENTE_NO_DISPONIBLE' });
    const persistido = structuredClone([...puerto.documentos]);
    await expect(servicio.confirmar(entrada)).resolves.toMatchObject({ estado: 'REPETIDA' });
    expect([...puerto.documentos]).toEqual(persistido);
  });


  it('rechaza renta o versión cambiada entre preview y confirmación sin escrituras P4', async () => {
    for (const cambios of [{ rentaMensual: 1300 }, { inmuebleId: 'otro-inmueble' }]) {
      const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
      const identidad = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' };
      const { huellaPreview } = await servicio.previsualizar(identidad);
      puerto.sembrar('contratos_formalizacion/contrato-a', { ...puerto.documentos.get('contratos_formalizacion/contrato-a'), ...cambios });
      const antes = structuredClone([...puerto.documentos]);
      await expect(servicio.confirmar({ ...identidad, huellaPreview, fechaProgramadaAviso: '2026-10-20',
        confirmacionExplicita: true, idempotencyKey: 'contrato-cambiado-p4-01' }))
        .rejects.toMatchObject({ codigo: 'PREVIEW_DESACTUALIZADO' });
      expect([...puerto.documentos]).toEqual(antes);
    }
  });

  it('el CAS rechaza un cambio posterior a la última lectura sin guardar historial parcial', async () => {
    const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const identidad = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' };
    const { huellaPreview } = await servicio.previsualizar(identidad);
    const escribir = puerto.escribirAtomico.bind(puerto);
    puerto.escribirAtomico = async (escrituras) => {
      puerto.sembrar('contratos_formalizacion/contrato-a', { ...puerto.documentos.get('contratos_formalizacion/contrato-a'), rentaMensual: 1350 });
      return escribir(escrituras);
    };
    await expect(servicio.confirmar({ ...identidad, huellaPreview, fechaProgramadaAviso: '2026-10-20',
      confirmacionExplicita: true, idempotencyKey: 'cas-contrato-cambiado-p4' }))
      .rejects.toMatchObject({ codigo: 'PREVIEW_DESACTUALIZADO' });
    expect(puerto.documentos.get('contratos_formalizacion/contrato-a')?.rentaMensual).toBe(1350);
    expect([...puerto.documentos.keys()].filter((r) => /actualizacion_renta/.test(r))).toEqual([]);
  });

  it('no aplica sin evidencia, con fecha futura ni con efectividad anterior a la anualidad', async () => {
    for (const dato of [undefined, { ...evidencia, fecha: '2026-10-17' }, { ...evidencia, fecha: '2026-08-20' }]) {
      const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
      const identidad = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a', evidenciaComunicacion: dato };
      const antes = structuredClone([...puerto.documentos]);
      const { huellaPreview } = await servicio.previsualizar(identidad);
      await expect(servicio.confirmar({ ...identidad, huellaPreview, fechaProgramadaAviso: '2026-10-20',
        confirmacionExplicita: true, idempotencyKey: 'evidencia-fecha-p4-01' }))
        .rejects.toMatchObject({ codigo: dato ? 'FECHA_EFECTIVIDAD_NO_APLICABLE' : 'EVIDENCIA_COMUNICACION_REQUERIDA' });
      expect([...puerto.documentos]).toEqual(antes);
    }
  });

  it('bloquea evidencia inválida y no permite sustituirla después del preview', async () => {
    const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const identidad = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' };
    for (const dato of [{ ...evidencia, fecha: '2026-02-30' }, { ...evidencia, referenciaDocumental: ' ' }, { ...evidencia, fecha: '2027-01-01' }]) {
      await expect(servicio.previsualizar({ ...identidad, evidenciaComunicacion: dato })).rejects.toMatchObject({ codigo: 'EVIDENCIA_COMUNICACION_REQUERIDA' });
    }
    const { huellaPreview } = await servicio.previsualizar(identidad);
    const antes = structuredClone([...puerto.documentos]);
    await expect(servicio.confirmar({ ...identidad, huellaPreview, fechaProgramadaAviso: '2026-10-20',
      evidenciaComunicacion: { ...evidencia, referenciaDocumental: 'otra.pdf' },
      confirmacionExplicita: true, idempotencyKey: 'cambio-evidencia-p4-01' })).rejects.toMatchObject({ codigo: 'PREVIEW_DESACTUALIZADO' });
    expect([...puerto.documentos]).toEqual(antes);
  });

  it('concurrentes con la misma clave recuperan un único resultado efectivo', async () => {
    const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const identidad = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' };
    const { huellaPreview } = await servicio.previsualizar(identidad);
    const entrada = { ...identidad, huellaPreview, fechaProgramadaAviso: '2026-10-20', confirmacionExplicita: true, idempotencyKey: 'concurrencia-misma-p4' };
    const resultados = await Promise.all([servicio.confirmar(entrada), servicio.confirmar(entrada)]);
    expect(resultados.map((r) => r.estado).sort()).toEqual(['CREADA', 'REPETIDA']);
    expect(puerto.documentos.get('contratos_formalizacion/contrato-a')?.rentaMensual).toBe(1224);
    expect([...puerto.documentos.keys()].filter((r) => r.startsWith('anexos_actualizacion_renta/'))).toHaveLength(1);
  });

  it('preserva anexos históricos y deniega cuando no dispone de versión para el CAS', async () => {
    const { puerto, servicio } = crearEntorno(calculadoraSinteticaAutorizada);
    const identidad = { uid: UID_PROPIETARIO_A, contratoId: 'contrato-a' };
    puerto.sembrar('anexos_actualizacion_renta/anterior', { rentaAnterior: 1100, rentaPropuesta: 1200, version: 1 });
    const { huellaPreview } = await servicio.previsualizar(identidad);
    await servicio.confirmar({ ...identidad, huellaPreview, fechaProgramadaAviso: '2026-10-20', confirmacionExplicita: true, idempotencyKey: 'historial-anterior-p4' });
    expect(puerto.documentos.get('anexos_actualizacion_renta/anterior')).toEqual({ rentaAnterior: 1100, rentaPropuesta: 1200, version: 1 });
    const otro = crearEntorno(calculadoraSinteticaAutorizada);
    const leer = otro.puerto.leerDocumento.bind(otro.puerto);
    otro.puerto.leerDocumento = async (ruta) => {
      const documento = await leer(ruta);
      return documento ? { ...documento, updateTime: undefined } : null;
    };
    const vista = await otro.servicio.previsualizar(identidad);
    await expect(otro.servicio.confirmar({ ...identidad, huellaPreview: vista.huellaPreview, fechaProgramadaAviso: '2026-10-20',
      confirmacionExplicita: true, idempotencyKey: 'sin-version-p4-01' })).rejects.toMatchObject({ codigo: 'FUENTE_NO_DISPONIBLE' });
    expect(otro.puerto.documentos.get('contratos_formalizacion/contrato-a')?.rentaMensual).toBe(1200);
  });

});
