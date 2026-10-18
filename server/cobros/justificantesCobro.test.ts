import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  COLECCION_AUDITORIA_JUSTIFICANTES_COBRO,
  COLECCION_JUSTIFICANTES_COBRO,
  crearServicioJustificantesCobro,
  ErrorJustificanteCobro,
  MAX_BYTES_JUSTIFICANTE_COBRO,
  type EntradaPresentarJustificante,
  type PuertoJustificantesCobro,
} from './justificantesCobro';
import type { AlmacenJustificantes } from './almacenGoogleStorage';
import { montarRutasJustificantesCobro } from './rutasJustificantesCobro';

interface DocMemoria {
  datos: Record<string, unknown>;
  updateTime: string;
}

class FirestoreMemoria implements PuertoJustificantesCobro {
  readonly documentos = new Map<string, DocMemoria>();
  private secuencia = 0;
  fallarAuditoriaUnaVez = false;
  fallarCASDeEstado?: string;

  sembrar(ruta: string, datos: Record<string, unknown>): void {
    this.documentos.set(ruta, { datos: structuredClone(datos), updateTime: `t${++this.secuencia}` });
  }

  async leerDocumento(ruta: string) {
    const doc = this.documentos.get(ruta);
    return doc ? { id: ruta.split('/').pop()!, datos: structuredClone(doc.datos), updateTime: doc.updateTime } : null;
  }

  async crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'> {
    const ruta = `${coleccion}/${id}`;
    if (coleccion === COLECCION_AUDITORIA_JUSTIFICANTES_COBRO && this.fallarAuditoriaUnaVez) {
      this.fallarAuditoriaUnaVez = false;
      throw new Error('error sintético de Firestore');
    }
    if (this.documentos.has(ruta)) return 'YA_EXISTE';
    this.documentos.set(ruta, { datos: structuredClone(datos), updateTime: `t${++this.secuencia}` });
    return 'CREADO';
  }

  async actualizarCamposSiVersion(coleccion: string, id: string, datos: Record<string, unknown>, expected: string): Promise<boolean> {
    const ruta = `${coleccion}/${id}`;
    const doc = this.documentos.get(ruta);
    if (!doc || doc.updateTime !== expected) return false;
    if (this.fallarCASDeEstado && datos.estado === this.fallarCASDeEstado) {
      this.fallarCASDeEstado = undefined;
      return false;
    }
    this.documentos.set(ruta, {
      datos: { ...doc.datos, ...structuredClone(datos) },
      updateTime: `t${++this.secuencia}`,
    });
    return true;
  }

  async consultarIgualdadesOrden(
    coleccion: string,
    consulta: { igualdades?: Array<[string, string]>; limite: number; offset?: number },
  ) {
    const prefijo = `${coleccion}/`;
    const filas = [...this.documentos.entries()]
      .filter(([ruta, doc]) => ruta.startsWith(prefijo)
        && (consulta.igualdades || []).every(([campo, valor]) => doc.datos[campo] === valor))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(consulta.offset || 0, (consulta.offset || 0) + consulta.limite);
    return filas.map(([ruta, doc]) => ({ id: ruta.split('/').pop()!, datos: structuredClone(doc.datos), updateTime: doc.updateTime }));
  }
}

class StorageMemoria implements AlmacenJustificantes {
  readonly objetos = new Map<string, Uint8Array>();
  llamadasGuardar = 0;
  fallarAntes = false;
  fallarDespuesDeGuardar = false;

  async guardar(path: string, bytes: Uint8Array): Promise<'CREADO' | 'YA_EXISTE'> {
    this.llamadasGuardar += 1;
    if (this.fallarAntes) {
      this.fallarAntes = false;
      throw new Error('fallo sintético antes de persistir');
    }
    if (this.objetos.has(path)) return 'YA_EXISTE';
    this.objetos.set(path, new Uint8Array(bytes));
    if (this.fallarDespuesDeGuardar) {
      this.fallarDespuesDeGuardar = false;
      throw new Error('respuesta perdida después de guardar');
    }
    return 'CREADO';
  }

  async leer(path: string): Promise<Uint8Array | null> {
    const bytes = this.objetos.get(path);
    return bytes ? new Uint8Array(bytes) : null;
  }
}

const UID_INQUILINO = 'uid-inquilino-a';
const UID_PROPIETARIO = 'uid-propietario-a';
const UID_GESTOR = 'uid-gestor-e';
const UID_GESTOR_LECTURA = 'uid-gestor-l';
const CONTRATO_A = 'contrato-a';
const CONTRATO_B = 'contrato-b';
const COBRO_A = 'cobro_contrato-a_2026_10';
const PDF = new Uint8Array(Buffer.from('%PDF-1.7\nrecibo sintético\n', 'ascii'));
const CLAVE_1 = 'request_key_0000000001';
const CLAVE_2 = 'request_key_0000000002';

function cobro(contratoId: string, propietarioId: string, inmuebleId: string, inquilinoId: string, id: string) {
  return {
    id, contratoId, propietarioId, inmuebleId, inquilinoId,
    periodoMesAnio: '2026-10', nombreMes: 'Octubre 2026', importePrevisto: 950,
    importeRecibido: 0, fechaVencimiento: '2026-10-05', estado: 'PENDIENTE',
    historialCambios: [],
  };
}

function nuevoEntorno() {
  const puerto = new FirestoreMemoria();
  const almacen = new StorageMemoria();
  const contratoA = {
    id: CONTRATO_A, candidatoId: 'candidato-a', propietarioId: 'prop-a', inmuebleId: 'inm-a',
    inmuebleDireccion: 'Dirección sintética A', registroCobros: [cobro(CONTRATO_A, 'prop-a', 'inm-a', 'candidato-a', COBRO_A)],
  };
  const contratoB = {
    id: CONTRATO_B, candidatoId: 'candidato-b', propietarioId: 'prop-b', inmuebleId: 'inm-b',
    registroCobros: [cobro(CONTRATO_B, 'prop-b', 'inm-b', 'candidato-b', 'cobro_contrato-b_2026_10')],
  };
  puerto.sembrar(`usuarios_auth/${UID_INQUILINO}`, { usuarioId: 'usuario-inquilino-a', estado: 'ACTIVO', tipoPerfil: 'INQUILINO' });
  puerto.sembrar('usuarios/usuario-inquilino-a', {
    authUid: UID_INQUILINO, estado: 'ACTIVO', tipoPerfil: 'INQUILINO', contratoIds: [CONTRATO_A],
  });
  puerto.sembrar(`usuarios_auth/${UID_PROPIETARIO}`, { usuarioId: 'usuario-prop-a', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' });
  puerto.sembrar('usuarios/usuario-prop-a', {
    authUid: UID_PROPIETARIO, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-a',
  });
  puerto.sembrar(`usuarios_auth/${UID_GESTOR}`, {
    usuarioId: 'usuario-gestor-e', estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL',
    gestionesPorPropietario: { 'prop-a': 'gestion-a' },
  });
  puerto.sembrar('usuarios/usuario-gestor-e', { authUid: UID_GESTOR, estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL' });
  puerto.sembrar('gestiones_cartera/gestion-a', {
    propietarioId: 'prop-a', gestorUsuarioId: 'usuario-gestor-e', estado: 'ACTIVA',
    resolucionInvitacion: 'ACEPTADA', inmuebleIds: ['inm-a'], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
  });
  puerto.sembrar(`usuarios_auth/${UID_GESTOR_LECTURA}`, {
    usuarioId: 'usuario-gestor-l', estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL',
    gestionesPorPropietario: { 'prop-a': 'gestion-a-lectura' },
  });
  puerto.sembrar('usuarios/usuario-gestor-l', { authUid: UID_GESTOR_LECTURA, estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL' });
  puerto.sembrar('gestiones_cartera/gestion-a-lectura', {
    propietarioId: 'prop-a', gestorUsuarioId: 'usuario-gestor-l', estado: 'ACTIVA',
    resolucionInvitacion: 'ACEPTADA', inmuebleIds: ['inm-a'], permiso: 'LECTURA', responsableActual: 'TITULAR',
  });
  puerto.sembrar(`contratos_formalizacion/${CONTRATO_A}`, contratoA);
  puerto.sembrar(`contratos_formalizacion/${CONTRATO_B}`, contratoB);
  const ahora = () => new Date('2026-10-17T10:00:00.000Z');
  const servicio = crearServicioJustificantesCobro({ puerto, almacen, ahora });
  const entrada = (overrides: Partial<EntradaPresentarJustificante> = {}): EntradaPresentarJustificante => ({
    uid: UID_INQUILINO,
    contratoId: CONTRATO_A,
    cobroPeriodoId: COBRO_A,
    claveIdempotencia: CLAVE_1,
    nombreArchivo: 'comprobante.pdf',
    tipoMime: 'application/pdf',
    importeDeclarado: 950,
    fechaPagoDeclarada: '2026-10-03',
    metodoPagoDeclarado: 'transferencia',
    bytes: PDF,
    ...overrides,
  });
  return { puerto, almacen, servicio, entrada, contratoA };
}

let servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servidores = [];
});

describe('P2 · justificantes de cobro: autorización, persistencia, estados y auditoría', () => {
  it('valida el contrato, el cobro y el rol INQUILINO en servidor; no confía en propietarioId recibido', async () => {
    const { servicio, entrada, puerto, almacen } = nuevoEntorno();
    await expect(servicio.presentar(entrada({ contratoId: CONTRATO_B, cobroPeriodoId: 'cobro_contrato-b_2026_10' })))
      .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
    await expect(servicio.presentar(entrada({ cobroPeriodoId: 'cobro_ajeno' })))
      .rejects.toMatchObject({ codigo: 'COBRO_NO_VALIDO', status: 422 });
    const datosContrato = structuredClone(puerto.documentos.get(`contratos_formalizacion/${CONTRATO_A}`)!.datos);
    (datosContrato.registroCobros as Array<Record<string, unknown>>)[0].inquilinoId = 'inquilino-distinto';
    puerto.sembrar(`contratos_formalizacion/${CONTRATO_A}`, datosContrato);
    await expect(servicio.presentar(entrada())).rejects.toMatchObject({ codigo: 'COBRO_NO_VALIDO', status: 422 });
    await expect(servicio.presentar(entrada({ uid: UID_PROPIETARIO })))
      .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 403 });
    expect(almacen.llamadasGuardar).toBe(0);
    expect([...puerto.documentos.keys()].filter((ruta) => ruta.startsWith(`${COLECCION_JUSTIFICANTES_COBRO}/`))).toHaveLength(0);
  });

  it('valida MIME real, tamaño, importe, fecha, método y clave de idempotencia antes de Storage', async () => {
    const { servicio, entrada, almacen } = nuevoEntorno();
    await expect(servicio.presentar(entrada({ tipoMime: 'image/png' }))).rejects.toMatchObject({ codigo: 'ARCHIVO_INVALIDO' });
    await expect(servicio.presentar(entrada({ bytes: new Uint8Array(MAX_BYTES_JUSTIFICANTE_COBRO + 1) } as never)))
      .rejects.toMatchObject({ codigo: 'ARCHIVO_DEMASIADO_GRANDE' });
    await expect(servicio.presentar(entrada({ importeDeclarado: 0 }))).rejects.toMatchObject({ codigo: 'IMPORTE_INVALIDO' });
    await expect(servicio.presentar(entrada({ fechaPagoDeclarada: '2026-02-30' }))).rejects.toMatchObject({ codigo: 'FECHA_INVALIDA' });
    await expect(servicio.presentar(entrada({ metodoPagoDeclarado: 'inventado' as never }))).rejects.toMatchObject({ codigo: 'PETICION_INVALIDA' });
    await expect(servicio.presentar(entrada({ claveIdempotencia: 'short' }))).rejects.toMatchObject({ codigo: 'PETICION_INVALIDA' });
    expect(almacen.llamadasGuardar).toBe(0);
  });

  it('recibe el binario privado; listar/descargar lo recupera y no toca el cobro ni su contabilidad', async () => {
    const { servicio, entrada, puerto, almacen } = nuevoEntorno();
    const contratoAntes = structuredClone(puerto.documentos.get(`contratos_formalizacion/${CONTRATO_A}`)!.datos);
    const presentado = await servicio.presentar(entrada());
    expect(presentado.justificante.estado).toBe('PENDIENTE_REVISION');
    expect(presentado.justificante.importeDeclarado).toBe(950);
    expect(presentado.justificante.cobroPeriodoId).toBe(COBRO_A);
    const almacenado = puerto.documentos.get(`${COLECCION_JUSTIFICANTES_COBRO}/${presentado.justificante.id}`)!.datos;
    expect(almacenado.storagePath).toMatch(/^cobros_justificantes\/prop-a\/contrato-a\/cobro_contrato-a_2026_10\//);
    expect(almacenado).not.toHaveProperty('url');
    expect(puerto.documentos.get(`contratos_formalizacion/${CONTRATO_A}`)!.datos).toEqual(contratoAntes);

    const lista = await servicio.listar({ uid: UID_PROPIETARIO, contratoIds: [CONTRATO_A] });
    expect(lista.items).toHaveLength(1);
    expect(lista.items[0].estado).toBe('PENDIENTE_REVISION');
    const archivo = await servicio.descargar({ uid: UID_PROPIETARIO, justificanteId: presentado.justificante.id });
    expect(Buffer.from(archivo.bytes)).toEqual(Buffer.from(PDF));
    expect(archivo.tipoMime).toBe('application/pdf');

    // La revisión humana no muta importeRecibido, fechaPago, estado, ni crea un asiento.
    const aceptado = await servicio.decidir({
      uid: UID_PROPIETARIO, justificanteId: presentado.justificante.id,
      claveIdempotencia: 'review_key_0000000001', accion: 'ACEPTAR',
    });
    expect(aceptado.justificante.estado).toBe('ACEPTADO');
    const reintentoAceptacion = await servicio.decidir({
      uid: UID_PROPIETARIO, justificanteId: presentado.justificante.id,
      claveIdempotencia: 'review_key_0000000001', accion: 'ACEPTAR',
    });
    expect(reintentoAceptacion.duplicada).toBe(true);
    await expect(servicio.decidir({
      uid: UID_PROPIETARIO, justificanteId: presentado.justificante.id,
      claveIdempotencia: 'review_key_0000000001', accion: 'RECHAZAR', motivo: 'Clave reutilizada con otra decisión.',
    })).rejects.toMatchObject({ codigo: 'CLAVE_IDEMPOTENCIA_REUTILIZADA', status: 409 });
    expect(puerto.documentos.get(`contratos_formalizacion/${CONTRATO_A}`)!.datos).toEqual(contratoAntes);
    const eventos = await servicio.auditoria({ uid: UID_PROPIETARIO, justificanteId: presentado.justificante.id });
    expect(eventos.eventos.map((e) => e.accion)).toEqual(['SUBIDA_INICIADA', 'PRESENTADO', 'ACEPTADO']);
    expect(almacen.objetos.size).toBe(1);
  });

  it('es idempotente ante reintentos; una segunda clave no crea duplicado mientras hay revisión pendiente', async () => {
    const { servicio, entrada, puerto, almacen } = nuevoEntorno();
    const primera = await servicio.presentar(entrada());
    const reintento = await servicio.presentar(entrada());
    expect(reintento.duplicada).toBe(true);
    expect(almacen.llamadasGuardar).toBe(1);
    await expect(servicio.presentar(entrada({ claveIdempotencia: CLAVE_2 })))
      .rejects.toMatchObject({ codigo: 'JUSTIFICANTE_EN_CURSO', status: 409 });
    const audit = [...puerto.documentos.keys()].filter((ruta) => ruta.startsWith(`${COLECCION_AUDITORIA_JUSTIFICANTES_COBRO}/`));
    expect(audit).toHaveLength(2);
    expect(primera.justificante.id).toBe(reintento.justificante.id);
  });

  it('serializa dos envíos concurrentes, tanto con la misma clave como con claves distintas', async () => {
    const mismo = nuevoEntorno();
    const resultadosMismos = await Promise.all([
      mismo.servicio.presentar(mismo.entrada()),
      mismo.servicio.presentar(mismo.entrada()),
    ]);
    expect(resultadosMismos.map((r) => r.justificante.estado)).toEqual(['PENDIENTE_REVISION', 'PENDIENTE_REVISION']);
    expect([...mismo.puerto.documentos.keys()].filter((ruta) => ruta.startsWith(`${COLECCION_AUDITORIA_JUSTIFICANTES_COBRO}/`) && mismo.puerto.documentos.get(ruta)?.datos.accion === 'PRESENTADO')).toHaveLength(1);

    const distintas = nuevoEntorno();
    const concurrencia = await Promise.allSettled([
      distintas.servicio.presentar(distintas.entrada({ claveIdempotencia: CLAVE_1 })),
      distintas.servicio.presentar(distintas.entrada({ claveIdempotencia: CLAVE_2 })),
    ]);
    expect(concurrencia.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(concurrencia.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const rechazada = concurrencia.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazada.reason).toMatchObject({ codigo: 'JUSTIFICANTE_EN_CURSO', status: 409 });
  });

  it('decisiones concurrentes con la misma clave convergen en una sola transición y un evento', async () => {
    const { servicio, entrada, puerto } = nuevoEntorno();
    const registro = await servicio.presentar(entrada());
    const decision = {
      uid: UID_PROPIETARIO,
      justificanteId: registro.justificante.id,
      claveIdempotencia: 'review_key_concurrent_0001',
      accion: 'ACEPTAR' as const,
    };
    const resultados = await Promise.all([servicio.decidir(decision), servicio.decidir(decision)]);
    expect(resultados.map((r) => r.justificante.estado)).toEqual(['ACEPTADO', 'ACEPTADO']);
    expect(resultados.filter((r) => r.duplicada)).toHaveLength(1);
    const eventosAceptacion = [...puerto.documentos.entries()].filter(([ruta, doc]) =>
      ruta.startsWith(`${COLECCION_AUDITORIA_JUSTIFICANTES_COBRO}/`) && doc.datos.accion === 'ACEPTADO');
    expect(eventosAceptacion).toHaveLength(1);
  });

  it('rechaza con motivo obligatorio y permite rectificar con una nueva traza sin borrar las anteriores', async () => {
    const { servicio, entrada, puerto } = nuevoEntorno();
    const documento = await servicio.presentar(entrada());
    await expect(servicio.decidir({
      uid: UID_PROPIETARIO, justificanteId: documento.justificante.id,
      claveIdempotencia: 'review_key_0000000002', accion: 'RECHAZAR', motivo: 'no',
    })).rejects.toMatchObject({ codigo: 'PETICION_INVALIDA' });
    const rechazado = await servicio.decidir({
      uid: UID_PROPIETARIO, justificanteId: documento.justificante.id,
      claveIdempotencia: 'review_key_0000000003', accion: 'RECHAZAR', motivo: 'El documento no permite leer la fecha.',
    });
    expect(rechazado.justificante.estado).toBe('RECHAZADO');
    const rectificado = await servicio.decidir({
      uid: UID_PROPIETARIO, justificanteId: documento.justificante.id,
      claveIdempotencia: 'review_key_0000000004', accion: 'RECTIFICAR',
      estadoCorregido: 'ACEPTADO', motivo: 'Revisión posterior: la fecha sí es legible.',
    });
    expect(rectificado.justificante.estado).toBe('ACEPTADO');
    const eventos = await servicio.auditoria({ uid: UID_PROPIETARIO, justificanteId: documento.justificante.id });
    expect(eventos.eventos.map((e) => e.accion)).toEqual(['SUBIDA_INICIADA', 'PRESENTADO', 'RECHAZADO', 'RECTIFICADO']);
    expect(eventos.eventos[2].motivo).toContain('no permite leer');
    expect(eventos.eventos[3].estadoAnterior).toBe('RECHAZADO');
    expect(eventos.eventos[3].estadoNuevo).toBe('ACEPTADO');
    expect(puerto.documentos.get(`contratos_formalizacion/${CONTRATO_A}`)!.datos.registroCobros).toEqual(nuevoEntorno().contratoA.registroCobros);
    expect([...puerto.documentos.keys()].filter((ruta) => ruta.startsWith(`${COLECCION_AUDITORIA_JUSTIFICANTES_COBRO}/`))).toHaveLength(4);
  });

  it('una nueva presentación tras rechazo crea otro intento; conserva y permite recuperar el binario histórico', async () => {
    const { servicio, entrada, puerto } = nuevoEntorno();
    const primerArchivo = await servicio.presentar(entrada());
    await servicio.decidir({
      uid: UID_PROPIETARIO, justificanteId: primerArchivo.justificante.id,
      claveIdempotencia: 'review_key_0000000101', accion: 'RECHAZAR', motivo: 'El comprobante no muestra el periodo.',
    });
    const segundoBinario = new Uint8Array(Buffer.from('%PDF-1.7\\nversión corregida sintética\\n', 'ascii'));
    const segundo = await servicio.presentar(entrada({
      claveIdempotencia: CLAVE_2,
      nombreArchivo: 'comprobante corregido.pdf',
      bytes: segundoBinario,
    }));
    expect(segundo.justificante.estado).toBe('PENDIENTE_REVISION');
    expect(segundo.justificante.intento).toBe(2);
    const eventos = await servicio.auditoria({ uid: UID_PROPIETARIO, justificanteId: primerArchivo.justificante.id });
    expect(eventos.eventos.map((e) => e.accion)).toEqual(['SUBIDA_INICIADA', 'PRESENTADO', 'RECHAZADO', 'SUBIDA_INICIADA', 'PRESENTADO']);
    const eventoRechazo = eventos.eventos.find((e) => e.accion === 'RECHAZADO')!;
    const archivoAntiguo = await servicio.descargar({ uid: UID_PROPIETARIO, justificanteId: primerArchivo.justificante.id, eventoId: eventoRechazo.id });
    expect(Buffer.from(archivoAntiguo.bytes)).toEqual(Buffer.from(PDF));
    const rutas = [...puerto.documentos.values()]
      .filter((doc) => doc.datos.justificanteId === primerArchivo.justificante.id && doc.datos.archivoDisponible === true)
      .map((doc) => doc.datos.storagePath);
    expect(new Set(rutas).size).toBe(2);
  });

  it('autoriza lectura a gestor delegado vigente; limita decisión a lectura-escritura y responsable gestor', async () => {
    const { servicio, entrada } = nuevoEntorno();
    const registro = await servicio.presentar(entrada());
    await expect(servicio.listar({ uid: UID_GESTOR_LECTURA, contratoIds: [CONTRATO_A] })).resolves.toMatchObject({ items: [{ id: registro.justificante.id }] });
    await expect(servicio.descargar({ uid: UID_GESTOR_LECTURA, justificanteId: registro.justificante.id })).resolves.toMatchObject({ tipoMime: 'application/pdf' });
    await expect(servicio.decidir({
      uid: UID_GESTOR_LECTURA, justificanteId: registro.justificante.id,
      claveIdempotencia: 'review_key_0000000005', accion: 'ACEPTAR',
    })).rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO', status: 404 });
    const aceptado = await servicio.decidir({
      uid: UID_GESTOR, justificanteId: registro.justificante.id,
      claveIdempotencia: 'review_key_0000000006', accion: 'ACEPTAR',
    });
    expect(aceptado.justificante.estado).toBe('ACEPTADO');
  });

  it('deniega ámbito de lectura delegado a otro inmueble, revocado o con espejo/perfil incoherentes', async () => {
    const { servicio, entrada, puerto } = nuevoEntorno();
    const registro = await servicio.presentar(entrada());
    const otraRelacion = { ...puerto.documentos.get('gestiones_cartera/gestion-a-lectura')!.datos, inmuebleIds: ['inm-ajeno'] };
    puerto.sembrar('gestiones_cartera/gestion-a-lectura', otraRelacion);
    await expect(servicio.listar({ uid: UID_GESTOR_LECTURA, contratoIds: [CONTRATO_A] }))
      .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO' });
    puerto.sembrar(`usuarios/usuario-prop-a`, { authUid: UID_PROPIETARIO, estado: 'ACTIVO', tipoPerfil: 'INQUILINO', propietarioId: 'prop-a' });
    await expect(servicio.listar({ uid: UID_PROPIETARIO, contratoIds: [CONTRATO_A] }))
      .rejects.toMatchObject({ codigo: 'PERFIL_NO_VALIDO' });
    expect(registro.justificante.id).toMatch(/^jc_[a-f0-9]{48}$/);
  });

  it('falla cerrado si el ámbito del gestor falta o está corrupto; solo [] explícito significa cartera completa', async () => {
    const { servicio, entrada, puerto } = nuevoEntorno();
    await servicio.presentar(entrada());
    const rutaRelacion = 'gestiones_cartera/gestion-a';
    const base = structuredClone(puerto.documentos.get(rutaRelacion)!.datos);
    const sinAmbito = { ...base };
    delete sinAmbito.inmuebleIds;
    for (const relacion of [
      sinAmbito,
      { ...base, inmuebleIds: 'inm-a' },
      { ...base, inmuebleIds: ['inm-a', 17] },
    ]) {
      puerto.sembrar(rutaRelacion, relacion);
      await expect(servicio.listar({ uid: UID_GESTOR, contratoIds: [CONTRATO_A] }))
        .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO' });
    }
    puerto.sembrar(rutaRelacion, { ...base, inmuebleIds: [] });
    await expect(servicio.listar({ uid: UID_GESTOR, contratoIds: [CONTRATO_A] }))
      .resolves.toMatchObject({ items: [{ contratoId: CONTRATO_A }] });
  });

  it('rechaza la aportación al servidor en cobros ya recibidos/cerrados, como hace la interfaz', async () => {
    for (const estado of ['RECIBIDO', 'VERIFICADO', 'PAGADO', 'ANULADO', 'DEVUELTO']) {
      const { servicio, entrada, puerto, almacen } = nuevoEntorno();
      const contrato = structuredClone(puerto.documentos.get(`contratos_formalizacion/${CONTRATO_A}`)!.datos);
      const registroCobros = contrato.registroCobros as Array<Record<string, unknown>>;
      registroCobros[0].estado = estado;
      puerto.sembrar(`contratos_formalizacion/${CONTRATO_A}`, contrato);
      await expect(servicio.presentar(entrada())).rejects.toMatchObject({ codigo: 'COBRO_NO_VALIDO', status: 409 });
      expect(almacen.llamadasGuardar).toBe(0);
    }
    const parcial = nuevoEntorno();
    const contrato = structuredClone(parcial.puerto.documentos.get(`contratos_formalizacion/${CONTRATO_A}`)!.datos);
    const registroCobros = contrato.registroCobros as Array<Record<string, unknown>>;
    registroCobros[0].estado = 'PAGADO_PARCIAL';
    registroCobros[0].importeRecibido = 300;
    parcial.puerto.sembrar(`contratos_formalizacion/${CONTRATO_A}`, contrato);
    await expect(parcial.servicio.presentar(parcial.entrada())).resolves.toMatchObject({ justificante: { estado: 'PENDIENTE_REVISION' } });
  });

  it('acepta reintentos tras fallos parciales de Storage y recupera el binario con una instancia nueva', async () => {
    const { servicio, entrada, puerto, almacen } = nuevoEntorno();
    almacen.fallarDespuesDeGuardar = true;
    await expect(servicio.presentar(entrada())).rejects.toMatchObject({ codigo: 'ALMACEN_NO_DISPONIBLE', status: 503 });
    let actual = puerto.documentos.get(`${COLECCION_JUSTIFICANTES_COBRO}/${(await servicio.listar({ uid: UID_PROPIETARIO, contratoIds: [CONTRATO_A] })).items[0].id}`)?.datos;
    expect(actual?.estado).toBe('ERROR_SUBIDA');

    const recuperado = await servicio.presentar(entrada());
    expect(recuperado.justificante.estado).toBe('PENDIENTE_REVISION');
    const instanciaNueva = crearServicioJustificantesCobro({ puerto, almacen, ahora: () => new Date('2026-10-17T10:05:00.000Z') });
    const binario = await instanciaNueva.descargar({ uid: UID_PROPIETARIO, justificanteId: recuperado.justificante.id });
    expect(Buffer.from(binario.bytes)).toEqual(Buffer.from(PDF));
    const audit = await instanciaNueva.auditoria({ uid: UID_PROPIETARIO, justificanteId: recuperado.justificante.id });
    expect(audit.eventos.map((e) => e.accion)).toContain('REINTENTO_SUBIDA');
    expect(audit.eventos.map((e) => e.accion)).toContain('PRESENTADO');
  });

  it('repara una auditoría pendiente tras una caída y reintenta CAS sin perder la transición', async () => {
    const primer = nuevoEntorno();
    primer.puerto.fallarAuditoriaUnaVez = true;
    await expect(primer.servicio.presentar(primer.entrada())).rejects.toMatchObject({ codigo: 'AUDITORIA_NO_DISPONIBLE', status: 503 });
    expect(primer.almacen.llamadasGuardar).toBe(0);
    primer.puerto.fallarCASDeEstado = 'PENDIENTE_REVISION';
    const resultado = await primer.servicio.presentar(primer.entrada());
    expect(resultado.justificante.estado).toBe('PENDIENTE_REVISION');
    const auditoria = await primer.servicio.auditoria({ uid: UID_PROPIETARIO, justificanteId: resultado.justificante.id });
    expect(auditoria.eventos.map((e) => e.accion)).toEqual(['SUBIDA_INICIADA', 'PRESENTADO']);
  });

  it('no expone documentos ni decisiones a cuentas cruzadas aunque conozcan el id', async () => {
    const { servicio, entrada } = nuevoEntorno();
    const registro = await servicio.presentar(entrada());
    await expect(servicio.listar({ uid: 'uid-desconocido', contratoIds: [CONTRATO_A] }))
      .rejects.toMatchObject({ codigo: 'PERFIL_NO_VALIDO' });
    await expect(servicio.descargar({ uid: 'uid-desconocido', justificanteId: registro.justificante.id }))
      .rejects.toMatchObject({ codigo: 'PERFIL_NO_VALIDO' });
    await expect(servicio.decidir({
      uid: UID_INQUILINO, justificanteId: registro.justificante.id,
      claveIdempotencia: 'tenant_action_0001', accion: 'ACEPTAR',
    })).rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO' });
    await expect(servicio.listar({ uid: UID_PROPIETARIO, contratoIds: [CONTRATO_B] }))
      .rejects.toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO' });
  });
});

describe('P2 · rutas HTTP bearer y binario raw', () => {
  it('exige bearer verificado y devuelve 503 si el almacenamiento durable no está configurado', async () => {
    const app = express();
    app.use(express.json());
    montarRutasJustificantesCobro(app, { verificarToken: async () => null, servicio: null });
    const server = createServer(app);
    servidores.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No se inició el servidor sintético');
    const base = `http://127.0.0.1:${address.port}`;
    const sinServicio = await fetch(`${base}/api/cobros/justificantes/consultar`, { method: 'POST' });
    expect(sinServicio.status).toBe(503);

    const { servicio } = nuevoEntorno();
    const appConAuth = express();
    appConAuth.use(express.json());
    montarRutasJustificantesCobro(appConAuth, {
      servicio,
      verificarToken: async (token) => token === 'token-tenant' ? { uid: UID_INQUILINO } : null,
    });
    const serverAutorizado = createServer(appConAuth);
    servidores.push(serverAutorizado);
    await new Promise<void>((resolve) => serverAutorizado.listen(0, '127.0.0.1', resolve));
    const addressAuth = serverAutorizado.address();
    if (!addressAuth || typeof addressAuth === 'string') throw new Error('No se inició el servidor sintético');
    const baseAuth = `http://127.0.0.1:${addressAuth.port}`;
    const sinToken = await fetch(`${baseAuth}/api/cobros/justificantes/consultar`, { method: 'POST' });
    expect(sinToken.status).toBe(401);
    const tokenMalo = await fetch(`${baseAuth}/api/cobros/justificantes/consultar`, {
      method: 'POST', headers: { Authorization: 'Bearer token-malo', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contratoIds: [CONTRATO_A] }),
    });
    expect(tokenMalo.status).toBe(401);
  });

  it('presenta el binario raw sin admitir ids de propietario del cliente y bloquea acceso cruzado', async () => {
    const { servicio } = nuevoEntorno();
    const app = express();
    app.use(express.json());
    montarRutasJustificantesCobro(app, {
      servicio,
      verificarToken: async (token) => token === 'token-tenant' ? { uid: UID_INQUILINO }
        : token === 'token-owner' ? { uid: UID_PROPIETARIO } : null,
    });
    const server = createServer(app);
    servidores.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No se inició el servidor sintético');
    const base = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${base}/api/cobros/justificantes/subir`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token-tenant',
        'Content-Type': 'application/pdf',
        'Idempotency-Key': CLAVE_1,
        'X-Contrato-Id': CONTRATO_A,
        'X-Cobro-Periodo-Id': COBRO_A,
        'X-Importe-Declarado': '950',
        'X-Fecha-Pago-Declarada': '2026-10-03',
        'X-Metodo-Pago-Declarado': 'transferencia',
        'X-Nombre-Archivo': encodeURIComponent('comprobante.pdf'),
        // No existe ni se consume un propietarioId confiado desde el navegador.
      },
      body: PDF,
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { justificante: { estado: string; propietarioId: string } };
    expect(body.justificante.estado).toBe('PENDIENTE_REVISION');
    expect(body.justificante.propietarioId).toBe('prop-a');

    const cruce = await fetch(`${base}/api/cobros/justificantes/consultar`, {
      method: 'POST', headers: { Authorization: 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contratoIds: [CONTRATO_B] }),
    });
    expect(cruce.status).toBe(404);
    const tamper = await fetch(`${base}/api/cobros/justificantes/consultar`, {
      method: 'POST', headers: { Authorization: 'Bearer token-tenant', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contratoIds: [CONTRATO_A], propietarioId: 'prop-b' }),
    });
    expect(tamper.status).toBe(400);
  });
});
