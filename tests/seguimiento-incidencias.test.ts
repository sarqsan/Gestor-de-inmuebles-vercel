/**
 * FASE 6 — SEGUIMIENTO Y TRAZABILIDAD DE INCIDENCIAS
 * =================================================
 * Sin red y sin Firebase: puertos en memoria que imitan la semántica del
 * cliente REST real (creación atómica con ALREADY_EXISTS y CAS por versión).
 *
 * Se comprueba lo que la fase promete:
 *   · sólo un cambio REAL escribe/avisa (un guardado idéntico no hace nada);
 *   · autorización por rol sobre la incidencia (inquilino/propietario/
 *     profesional/administración) y aislamiento entre usuarios;
 *   · idempotencia: reintentar la misma sincronización NO duplica eventos ni
 *     avisos;
 *   · escalado determinista (urgente sin asignar / plazo vencido) una sola vez;
 *   · estado de entrega REAL: sin destinatario no se llama al dispatcher y sin
 *     proveedor no se declara «enviado»;
 *   · reintento seguro de avisos pendientes sin duplicar;
 *   · la traza no guarda texto libre ni datos de otros usuarios.
 */
import { describe, expect, it } from 'vitest';
import {
  COLECCION_SEGUIMIENTO_INCIDENCIAS,
  derivarEventosSeguimiento,
  eventosPendientesDeEntrega,
  instantaneaIncidenciaSeguimiento,
  motivoEscalado,
  pasosEvolucionIncidencia,
  type EntregaEventoSeguimiento,
  type EventoSeguimientoIncidencia,
  type HiloSeguimientoIncidencia,
  type InstantaneaIncidenciaSeguimiento,
} from '../src/seguimiento/incidencias';
import { DispatcherNotificaciones } from '../src/notificaciones/dispatcher';
import type { Notificacion } from '../src/types/notificaciones';
import {
  crearServicioSeguimientoIncidencias,
  type AvisoSeguimientoIncidencia,
  type DependenciasSeguimientoIncidencias,
  type PuertoSeguimientoIncidencias,
} from '../server/seguimiento/seguimientoIncidencias';
import { crearNotificadorIncidencias } from '../server/seguimiento/notificadorIncidencias';
import {
  crearRegistroEntregasNotificaciones,
  crearRepositorioNotificacionesFirestore,
  idDeIntentoEntrega,
  type PuertoNotificacionesFirestore,
} from '../server/notificaciones/repositorioNotificacionesFirestore';

const AHORA = new Date('2026-10-16T10:00:00.000Z');

// ---------------------------------------------------------------------------
// Puertos en memoria (misma semántica que el cliente REST del servidor)
// ---------------------------------------------------------------------------

interface DocumentoMemoria {
  datos: Record<string, unknown>;
  updateTime: string;
  version: number;
}

function puertoFalso(documentos: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, DocumentoMemoria>();
  let reloj = 0;
  for (const [ruta, datos] of Object.entries(documentos)) {
    store.set(ruta, { datos, updateTime: `t-${++reloj}`, version: reloj });
  }
  const escritos: Array<{ coleccion: string; id: string; datos: Record<string, unknown> }> = [];
  const puerto: PuertoSeguimientoIncidencias = {
    async leerDocumento(ruta) {
      const doc = store.get(ruta);
      return doc ? { datos: { ...doc.datos }, updateTime: doc.updateTime } : null;
    },
    async crearDocumento(coleccion, id, datos) {
      const ruta = `${coleccion}/${id}`;
      if (store.has(ruta)) return 'YA_EXISTE';
      store.set(ruta, { datos: { ...datos }, updateTime: `t-${++reloj}`, version: reloj });
      escritos.push({ coleccion, id, datos: { ...datos } });
      return 'CREADO';
    },
    async actualizarCamposSiVersion(coleccion, id, datos, updateTimeEsperado) {
      const ruta = `${coleccion}/${id}`;
      const doc = store.get(ruta);
      if (!doc || doc.updateTime !== updateTimeEsperado) return false;
      doc.datos = { ...doc.datos, ...datos };
      doc.updateTime = `t-${++reloj}`;
      doc.version = reloj;
      escritos.push({ coleccion, id, datos: { ...datos } });
      return true;
    },
  };
  return { puerto, store, escritos };
}

/** Puertos de notificaciones en memoria (documento canónico + entregas). */
function puertoNotificacionesFalso() {
  const store = new Map<string, { fields: Record<string, unknown>; updateTime?: string }>();
  const puerto: PuertoNotificacionesFirestore = {
    async leerDocumento(ruta) {
      const doc = store.get(ruta);
      return doc ? { datos: { ...doc.fields }, ...(doc.updateTime ? { updateTime: doc.updateTime } : {}) } : null;
    },
    async crearDocumento(coleccion, id, datos) {
      const ruta = `${coleccion}/${id}`;
      if (store.has(ruta)) return 'YA_EXISTE';
      store.set(ruta, { fields: { ...datos }, updateTime: `n-${store.size + 1}` });
      return 'CREADO';
    },
    async actualizarCampos(coleccion, id, datos) {
      const ruta = `${coleccion}/${id}`;
      const doc = store.get(ruta);
      if (!doc) throw new Error('NOT_FOUND');
      doc.fields = { ...doc.fields, ...datos };
      doc.updateTime = `n-${store.size + 1}-${Date.now()}`;
    },
  };
  return { puerto, store };
}

// ---------------------------------------------------------------------------
// Documentos base: inquilina, contrato, inmueble, propietaria, profesional
// ---------------------------------------------------------------------------

function documentosBase(incidencia: Record<string, unknown> = {}) {
  return {
    'usuarios_auth/uid-ines': { usuarioId: 'usuario-ines', estado: 'ACTIVO', tipoPerfil: 'INQUILINO' },
    'usuarios/usuario-ines': { authUid: 'uid-ines', estado: 'ACTIVO', tipoPerfil: 'INQUILINO', contratoIds: ['contrato-ines'] },
    'usuarios_auth/uid-pedro': { usuarioId: 'usuario-pedro', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' },
    'usuarios/usuario-pedro': { authUid: 'uid-pedro', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-1' },
    'usuarios_auth/uid-prof': { usuarioId: 'usuario-prof', estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL' },
    'usuarios/usuario-prof': { authUid: 'uid-prof', estado: 'ACTIVO', tipoPerfil: 'PROFESIONAL', profesionalId: 'prof-1' },
    'usuarios_auth/uid-admin': { usuarioId: 'usuario-admin', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' },
    'usuarios/usuario-admin': { authUid: 'uid-admin', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' },
    'usuarios_auth/uid-marta': { usuarioId: 'usuario-marta', estado: 'ACTIVO', tipoPerfil: 'INQUILINO' },
    'usuarios/usuario-marta': { authUid: 'uid-marta', estado: 'ACTIVO', tipoPerfil: 'INQUILINO', contratoIds: ['contrato-marta'] },
    'contratos_formalizacion/contrato-ines': {
      id: 'contrato-ines',
      candidatoEmail: 'ines.privada@example.com',
      candidatoNombre: 'Inés Privada',
      inquilinoId: 'usuario-ines',
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      estado: 'ACTIVO',
    },
    'propietarios/prop-1': { id: 'prop-1', nombre: 'Propietaria Uno', email: 'propietaria@example.com' },
    'profesionales/prof-1': { id: 'prof-1', nombre: 'Fontanería Sana', email: 'profesional@example.com' },
    'incidencias/inc-1': {
      id: 'inc-1',
      titulo: 'Fuga bajo el lavabo',
      descripcion: 'Gotea la tubería desde ayer',
      categoria: 'FONTANERIA',
      prioridad: 'NORMAL',
      estado: 'ABIERTA',
      contratoId: 'contrato-ines',
      contratoIdsVisibles: ['contrato-ines'],
      inmuebleId: 'inm-1',
      inmuebleDireccion: 'Calle Mayor 1',
      propietarioId: 'prop-1',
      inquilinoId: 'usuario-ines',
      notasInternas: 'NOTA INTERNA CONFIDENCIAL: el portero dice que ya pasó antes',
      fechaCreacion: '2026-10-15T08:00:00.000Z',
      fechaActualizacion: '2026-10-15T08:00:00.000Z',
      fotografias: [],
      historial: [],
      ...incidencia,
    },
  };
}

function instantanea(extra: Partial<InstantaneaIncidenciaSeguimiento> = {}): InstantaneaIncidenciaSeguimiento {
  return {
    estado: 'ABIERTA',
    prioridad: 'NORMAL',
    tieneTrabajoAsignado: false,
    fotografias: 0,
    adjuntos: 0,
    creadaEn: '2026-10-15T08:00:00.000Z',
    actualizadaEn: '2026-10-15T08:00:00.000Z',
    ...extra,
  };
}

const CONTEXTO = { incidenciaId: 'inc-1', inmuebleId: 'inm-1', propietarioId: 'prop-1', contratoId: 'contrato-ines' };

// ===========================================================================
// 1 · Motor puro: sólo cambios reales, ids deterministas y escalado
// ===========================================================================

describe('Fase 6 · motor de seguimiento (puro)', () => {
  it('el primer registro produce el evento de creación con la clave canónica de GAP 1', () => {
    const eventos = derivarEventosSeguimiento({
      contexto: CONTEXTO,
      anterior: null,
      actual: instantanea(),
      actorTipo: 'INQUILINO',
      ahora: AHORA,
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      tipo: 'INCIDENCIA_CREADA',
      incidenciaId: 'inc-1',
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      actorTipo: 'INQUILINO',
      requiereAtencion: true,
      avisarA: ['PROPIETARIO', 'ADMINISTRACION'],
    });
    // Clave canónica de GAP 1 (misma que usa `eventoNuevaIncidencia`).
    expect(eventos[0].claveIdempotencia).toBe('ev:incidencia:nueva:inc-1');
    expect(eventos[0].id).toBe('seg_ev_incidencia_nueva_inc-1');
  });

  it('un guardado idéntico NO produce eventos (ni escritura ni aviso)', () => {
    const eventos = derivarEventosSeguimiento({
      contexto: CONTEXTO,
      anterior: instantanea(),
      actual: instantanea(),
      actorTipo: 'PROPIETARIO',
      ahora: AHORA,
    });
    expect(eventos).toEqual([]);
  });

  it('el cambio de estado y el añadido de evidencias son eventos independientes y avisan al inquilino', () => {
    const eventos = derivarEventosSeguimiento({
      contexto: CONTEXTO,
      anterior: instantanea(),
      actual: instantanea({ estado: 'EN_REPARACION', fotografias: 2, tieneTrabajoAsignado: true, actualizadaEn: '2026-10-16T09:00:00.000Z' }),
      actorTipo: 'PROPIETARIO',
      ahora: AHORA,
    });
    expect(eventos.map((e) => e.tipo)).toEqual(['INCIDENCIA_ESTADO_CAMBIADO', 'INCIDENCIA_ACTUALIZADA']);
    for (const evento of eventos) expect(evento.avisarA).toEqual(['INQUILINO']);
    expect(eventos[0]).toMatchObject({ estadoAnterior: 'ABIERTA', estado: 'EN_REPARACION', campos: ['estado'] });
    expect(eventos[1].campos).toEqual(['fotografias', 'trabajoProfesional']);
  });

  it('resolver la incidencia emite el evento canónico `resuelta` (misma clave que el adaptador GAP 1)', () => {
    const eventos = derivarEventosSeguimiento({
      contexto: CONTEXTO,
      anterior: instantanea({ estado: 'EN_REPARACION', tieneTrabajoAsignado: true }),
      actual: instantanea({ estado: 'RESUELTA', tieneTrabajoAsignado: true }),
      actorTipo: 'PROPIETARIO',
      ahora: AHORA,
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].tipo).toBe('INCIDENCIA_RESUELTA');
    expect(eventos[0].claveIdempotencia).toBe('ev:incidencia:resuelta:inc-1');
  });

  it('escala una incidencia urgente sin profesional UNA sola vez', () => {
    const urgente = instantanea({ prioridad: 'URGENTE' });
    expect(motivoEscalado(urgente, AHORA)).toBe('URGENTE_SIN_ASIGNAR');
    const primera = derivarEventosSeguimiento({
      contexto: CONTEXTO, anterior: instantanea(), actual: urgente, actorTipo: 'PROPIETARIO', ahora: AHORA,
    });
    const escalada = primera.find((e) => e.tipo === 'INCIDENCIA_ESCALADA');
    expect(escalada).toMatchObject({ requiereAtencion: true, avisarA: ['PROPIETARIO', 'ADMINISTRACION'], detalleCodigo: 'URGENTE_SIN_ASIGNAR' });
    // Segunda sincronización con el hilo ya escalado: no se repite.
    const segunda = derivarEventosSeguimiento({
      contexto: CONTEXTO,
      anterior: instantanea({ prioridad: 'URGENTE', escaladaPor: 'URGENTE_SIN_ASIGNAR' }),
      actual: urgente,
      actorTipo: 'PROPIETARIO',
      ahora: AHORA,
      idsExistentes: new Set(escalada ? [escalada.id] : []),
    });
    expect(segunda).toEqual([]);
  });

  it('escala por plazo vencido según prioridad y no escala lo ya resuelto ni lo asignado', () => {
    const vencida = instantanea({ prioridad: 'ALTA', creadaEn: '2026-10-14T00:00:00.000Z' });
    expect(motivoEscalado(vencida, AHORA)).toBe('PLAZO_SIN_ASIGNAR');
    expect(motivoEscalado(instantanea({ prioridad: 'ALTA', creadaEn: '2026-10-16T06:00:00.000Z' }), AHORA)).toBeNull();
    expect(motivoEscalado(instantanea({ prioridad: 'URGENTE', tieneTrabajoAsignado: true }), AHORA)).toBeNull();
    expect(motivoEscalado(instantanea({ prioridad: 'URGENTE', estado: 'RESUELTA' }), AHORA)).toBeNull();
  });

  it('la instantánea no arrastra texto libre ni notas internas de la incidencia', () => {
    const snap = instantaneaIncidenciaSeguimiento(documentosBase()['incidencias/inc-1'], AHORA);
    const serializado = JSON.stringify(snap);
    expect(serializado).not.toContain('CONFIDENCIAL');
    expect(serializado).not.toContain('notasInternas');
    expect(serializado).not.toContain('Gotea');
    expect(Object.keys(snap).sort()).toEqual([
      'actualizadaEn', 'adjuntos', 'creadaEn', 'estado', 'fotografias', 'prioridad', 'tieneTrabajoAsignado',
    ]);
  });

  it('los pasos de evolución son legibles y marcan los avisos entregados', () => {
    const evento: EventoSeguimientoIncidencia = {
      id: 'seg_ev_incidencia_cambio_estado_abierta_en_reparacion_inc_1',
      incidenciaId: 'inc-1',
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      tipo: 'INCIDENCIA_ESTADO_CAMBIADO',
      actorTipo: 'PROPIETARIO',
      estadoAnterior: 'ABIERTA',
      estado: 'EN_REPARACION',
      campos: ['estado'],
      requiereAtencion: false,
      avisarA: ['INQUILINO'],
      claveIdempotencia: 'ev:incidencia:cambio_estado:abierta:en_reparacion:inc_1',
      creadoEn: '2026-10-16T09:00:00.000Z',
      entrega: { canal: 'INAPP', estado: 'ENVIADA', intentos: 1, actualizadoEn: '2026-10-16T09:00:01.000Z' },
    };
    const hilo: HiloSeguimientoIncidencia = {
      version: 1,
      incidenciaId: 'inc-1',
      ultima: instantanea({ estado: 'EN_REPARACION' }),
      eventos: [evento],
      actualizadoEn: '2026-10-16T09:00:01.000Z',
    };
    const pasos = pasosEvolucionIncidencia(hilo);
    expect(pasos).toHaveLength(1);
    expect(pasos[0]).toMatchObject({
      etiqueta: 'Cambio de estado',
      detalle: 'ABIERTA → EN_REPARACION',
      notificacion: 'Aviso entregado',
    });
    expect(pasosEvolucionIncidencia(null)).toEqual([]);
  });
});

// ===========================================================================
// 2 · Servicio en servidor: autorización, observación y traza
// ===========================================================================

describe('Fase 6 · servicio de seguimiento (autorización y observación)', () => {
  function servicio(
    puerto: PuertoSeguimientoIncidencias,
    extras: Omit<Partial<DependenciasSeguimientoIncidencias>, 'puerto'> = {},
  ) {
    return crearServicioSeguimientoIncidencias({ puerto, ahora: () => AHORA, ...extras });
  }

  it('el inquilino del contrato registra el hilo de su incidencia con un sólo documento', async () => {
    const { puerto, escritos } = puertoFalso(documentosBase());
    const resultado = await servicio(puerto).sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') throw new Error('sin resultado');
    expect(resultado.eventos).toHaveLength(1);
    expect(escritos).toHaveLength(1);
    expect(escritos[0].coleccion).toBe(COLECCION_SEGUIMIENTO_INCIDENCIAS);
    expect(escritos[0].id).toBe('inc-1');
    const serializado = JSON.stringify(escritos[0].datos);
    expect(serializado).not.toContain('CONFIDENCIAL');
    expect(serializado).not.toContain('example.com');
    expect(serializado).not.toContain('Gotea');
  });

  it('repetir la misma sincronización es idempotente: SIN_CAMBIOS, sin escrituras y sin avisos', async () => {
    const { puerto, escritos } = puertoFalso(documentosBase());
    const avisos: AvisoSeguimientoIncidencia[] = [];
    const s = servicio(puerto, {
      notificar: async (aviso) => {
        avisos.push(aviso);
        return { canal: 'INAPP', estado: 'ENVIADA', intentos: 1, actualizadoEn: AHORA.toISOString() };
      },
    });
    const primera = await s.sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(primera.estado).toBe('OK');
    const escritosTrasPrimera = escritos.length;
    const avisosTrasPrimera = avisos.length;
    const segunda = await s.sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(segunda.estado).toBe('SIN_CAMBIOS');
    expect(escritos.length).toBe(escritosTrasPrimera);
    expect(avisos.length).toBe(avisosTrasPrimera);
  });

  it('un cambio de estado real añade un evento, avisa al inquilino y guarda la entrega', async () => {
    const docs = documentosBase();
    const { puerto, store } = puertoFalso(docs);
    const avisos: AvisoSeguimientoIncidencia[] = [];
    const s = servicio(puerto, {
      notificar: async (aviso) => {
        avisos.push(aviso);
        return { canal: 'EMAIL', estado: 'NO_ENVIADA', intentos: 1, motivo: 'smtp_desactivado', actualizadoEn: AHORA.toISOString() };
      },
    });
    await s.sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    // La gestión cambia el estado y asigna profesional en Firestore (la fuente
    // autorizada): dos cambios REALES ⇒ dos eventos y dos avisos.
    const doc = store.get('incidencias/inc-1');
    if (!doc) throw new Error('sin incidencia');
    doc.datos = {
      ...doc.datos,
      estado: 'EN_REPARACION',
      fechaActualizacion: '2026-10-16T09:30:00.000Z',
      fotografias: [{ id: 'f1' }],
      trabajoProfesional: { profesionalId: 'prof-1', profesionalNombre: 'Fontanería Sana', estadoTrabajo: 'ASIGNADO' },
    };
    doc.updateTime = 't-999';

    // Sólo interesan los avisos del segundo cambio: el primero ya está entregado.
    avisos.length = 0;
    const resultado = await s.sincronizar({ uid: 'uid-pedro', incidenciaId: 'inc-1' });
    expect(resultado.estado).toBe('OK');
    if (resultado.estado !== 'OK') throw new Error('sin resultado');
    expect(resultado.eventos.map((e) => e.tipo)).toEqual(['INCIDENCIA_ESTADO_CAMBIADO', 'INCIDENCIA_ACTUALIZADA']);
    expect(avisos).toHaveLength(2);
    for (const aviso of avisos) {
      expect(aviso.destinos).toEqual(['INQUILINO']);
      expect(aviso.contactos.inquilino.email).toBe('ines.privada@example.com');
      expect(aviso.datos.titulo).toBe('Fuga bajo el lavabo');
      expect(aviso.datos.inmuebleDireccion).toBe('Calle Mayor 1');
    }
    // El hilo guarda el estado REAL de cada entrega (no se declara enviada).
    const hilo = store.get('incidencias_seguimiento/inc-1')?.datos as unknown as HiloSeguimientoIncidencia;
    expect(hilo.eventos).toHaveLength(3);
    expect(hilo.eventos.map((e) => e.tipo)).toEqual(['INCIDENCIA_CREADA', 'INCIDENCIA_ESTADO_CAMBIADO', 'INCIDENCIA_ACTUALIZADA']);
    const ultimo = hilo.eventos.find((e) => e.tipo === 'INCIDENCIA_ESTADO_CAMBIADO');
    expect(ultimo?.entrega).toMatchObject({ estado: 'NO_ENVIADA', canal: 'EMAIL', intentos: 1 });
    expect(hilo.ultima.estado).toBe('EN_REPARACION');
  });

  it('rechaza a quien no es parte de la incidencia y no escribe nada', async () => {
    const { puerto, escritos } = puertoFalso(documentosBase());
    const s = servicio(puerto);
    const inquilinaAjena = await s.sincronizar({ uid: 'uid-marta', incidenciaId: 'inc-1' });
    expect(inquilinaAjena).toMatchObject({ estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA', codigoHttp: 403 });
    const sinEspejo = await s.sincronizar({ uid: 'uid-desconocido', incidenciaId: 'inc-1' });
    expect(sinEspejo).toMatchObject({ estado: 'RECHAZADO', codigo: 'PERFIL_NO_VALIDO', codigoHttp: 403 });
    expect(escritos).toEqual([]);
  });

  it('el profesional SÓLO accede si está asignado; el propietario, sólo a su inmueble; administración sí', async () => {
    const docs = documentosBase();
    const { puerto } = puertoFalso(docs);
    const s = servicio(puerto);
    const profesionalNoAsignado = await s.sincronizar({ uid: 'uid-prof', incidenciaId: 'inc-1' });
    expect(profesionalNoAsignado).toMatchObject({ estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA' });

    const docs2 = documentosBase({ profesionalAsignadoId: 'prof-1' });
    const { puerto: puerto2 } = puertoFalso(docs2);
    const asignado = await servicio(puerto2).sincronizar({ uid: 'uid-prof', incidenciaId: 'inc-1' });
    expect(asignado.estado).toBe('OK');

    const docs3 = documentosBase({ propietarioId: 'prop-9' });
    const { puerto: puerto3 } = puertoFalso(docs3);
    const propietarioAjeno = await servicio(puerto3).sincronizar({ uid: 'uid-pedro', incidenciaId: 'inc-1' });
    expect(propietarioAjeno).toMatchObject({ estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA' });

    const administracion = await s.sincronizar({ uid: 'uid-admin', incidenciaId: 'inc-1' });
    expect(administracion.estado).toBe('OK');
  });

  it('sin fuente autorizada falla cerrado (503) y no inventa nada', async () => {
    const puertoRoto: PuertoSeguimientoIncidencias = {
      async leerDocumento() {
        throw new Error('503 Firestore caído');
      },
      async crearDocumento() {
        throw new Error('503 Firestore caído');
      },
      async actualizarCamposSiVersion() {
        throw new Error('503 Firestore caído');
      },
    };
    const resultado = await servicio(puertoRoto).sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(resultado).toMatchObject({ estado: 'RECHAZADO', codigo: 'FUENTE_NO_DISPONIBLE', codigoHttp: 503 });
  });

  it('la lectura del hilo se autoriza igual y nunca devuelve datos de otras incidencias', async () => {
    const { puerto } = puertoFalso(documentosBase());
    const s = servicio(puerto);
    await s.sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    const lectura = await s.leer({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(lectura.estado).toBe('OK');
    if (lectura.estado !== 'OK') throw new Error('sin lectura');
    expect(lectura.autorizadoComo).toBe('INQUILINO');
    const serializado = JSON.stringify(lectura.hilo);
    expect(serializado).not.toContain('ines.privada@example.com');
    expect(serializado).not.toContain('CONFIDENCIAL');
    expect(serializado).not.toContain('Bearer');

    const ajena = await s.leer({ uid: 'uid-marta', incidenciaId: 'inc-1' });
    expect(ajena).toMatchObject({ estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA' });
    const inexistente = await s.leer({ uid: 'uid-ines', incidenciaId: 'inc-999' });
    expect(inexistente).toMatchObject({ estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_ENCONTRADA', codigoHttp: 404 });
  });

  it('los avisos pendientes se reintentan sin duplicar (misma clave de idempotencia)', async () => {
    const { puerto, store } = puertoFalso(documentosBase());
    let fallos = 1;
    const claves: string[] = [];
    const s = servicio(puerto, {
      notificar: async (aviso) => {
        claves.push(aviso.evento.claveIdempotencia);
        if (fallos > 0) {
          fallos -= 1;
          return { canal: 'EMAIL', estado: 'PENDIENTE', intentos: 1, motivo: 'timeout', actualizadoEn: AHORA.toISOString() };
        }
        return { canal: 'INAPP', estado: 'ENVIADA', intentos: 2, actualizadoEn: AHORA.toISOString() };
      },
    });
    const primera = await s.sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(primera.estado).toBe('OK');
    const hilo1 = store.get('incidencias_seguimiento/inc-1')?.datos as unknown as HiloSeguimientoIncidencia;
    expect(eventosPendientesDeEntrega(hilo1)).toHaveLength(1);
    expect(hilo1.eventos[0].entrega?.estado).toBe('PENDIENTE');

    const segunda = await s.sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(segunda.estado).toBe('SIN_CAMBIOS');
    if (segunda.estado !== 'SIN_CAMBIOS') throw new Error('sin resultado');
    expect(segunda.reintentos).toBe(1);
    const hilo2 = store.get('incidencias_seguimiento/inc-1')?.datos as unknown as HiloSeguimientoIncidencia;
    expect(hilo2.eventos).toHaveLength(1); // el reintento NO crea eventos nuevos
    expect(hilo2.eventos[0].entrega).toMatchObject({ estado: 'ENVIADA', canal: 'INAPP', intentos: 2 });
    // La clave de idempotencia es la MISMA en los dos intentos: nada duplicado.
    expect(claves).toHaveLength(2);
    expect(new Set(claves).size).toBe(1);
  });

  it('una carrera perdida del CAS se reintenta y termina escribiendo el hilo correcto', async () => {
    const { puerto, store } = puertoFalso(documentosBase());
    let sabotear = 0;
    const puertoConCarrera: PuertoSeguimientoIncidencias = {
      leerDocumento: puerto.leerDocumento,
      crearDocumento: puerto.crearDocumento,
      async actualizarCamposSiVersion(coleccion, id, datos, esperado) {
        if (sabotear === 0) {
          sabotear += 1;
          const doc = store.get(`${coleccion}/${id}`);
          if (doc) doc.updateTime = 'otra-version';
          return false;
        }
        return puerto.actualizarCamposSiVersion(coleccion, id, datos, esperado);
      },
    };
    const s = servicio(puertoConCarrera);
    const primera = await s.sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(primera.estado).toBe('OK');
    const doc = store.get('incidencias/inc-1');
    if (!doc) throw new Error('sin incidencia');
    doc.datos = { ...doc.datos, estado: 'EN_REPARACION' };
    doc.updateTime = 't-778';
    sabotear = 0;
    const segunda = await s.sincronizar({ uid: 'uid-ines', incidenciaId: 'inc-1' });
    expect(segunda.estado).toBe('OK');
    const hilo = store.get('incidencias_seguimiento/inc-1')?.datos as unknown as HiloSeguimientoIncidencia;
    expect(hilo.eventos.map((e) => e.tipo)).toContain('INCIDENCIA_ESTADO_CAMBIADO');
  });
});

// ===========================================================================
// 3 · Notificador GAP 1 y repositorio duradero de notificaciones
// ===========================================================================

describe('Fase 6 · avisos por el dispatcher canónico', () => {
  function eventoIncidencia(extra: Partial<EventoSeguimientoIncidencia> = {}): EventoSeguimientoIncidencia {
    return {
      id: 'seg_ev_incidencia_nueva_inc_1',
      incidenciaId: 'inc-1',
      inmuebleId: 'inm-1',
      propietarioId: 'prop-1',
      tipo: 'INCIDENCIA_CREADA',
      actorTipo: 'INQUILINO',
      campos: ['estado', 'prioridad'],
      requiereAtencion: true,
      avisarA: ['PROPIETARIO', 'ADMINISTRACION'],
      claveIdempotencia: 'ev:incidencia:nueva:inc_1',
      creadoEn: AHORA.toISOString(),
      ...extra,
    };
  }

  function aviso(extra: Partial<AvisoSeguimientoIncidencia> = {}): AvisoSeguimientoIncidencia {
    return {
      evento: eventoIncidencia(),
      datos: { titulo: 'Fuga bajo el lavabo', categoria: 'FONTANERIA', prioridad: 'NORMAL', estado: 'ABIERTA', inmuebleDireccion: 'Calle Mayor 1' },
      destinos: ['PROPIETARIO', 'ADMINISTRACION'],
      contactos: {
        inquilino: { email: 'ines.privada@example.com', nombre: 'Inés Privada', usuarioId: 'usuario-ines' },
        propietario: { email: 'propietaria@example.com', nombre: 'Propietaria Uno' },
        profesional: {},
      },
      instantanea: instantanea(),
      contexto: CONTEXTO,
      ...extra,
    };
  }

  it('sin destinatario autorizado NO se llama al dispatcher y el estado es SIN_DESTINATARIO', async () => {
    let llamadas = 0;
    const notificador = crearNotificadorIncidencias({
      crearDispatcher: () => {
        llamadas += 1;
        throw new Error('no debería llamarse');
      },
    });
    const entrega = await notificador(
      aviso({ destinos: ['ADMINISTRACION'], contactos: { inquilino: {}, propietario: {}, profesional: {} } }),
    );
    expect(entrega).toMatchObject({ estado: 'SIN_DESTINATARIO', canal: null, motivo: 'sin_destinatario_autorizado' });
    expect(llamadas).toBe(0);
  });

  it('la bandeja interna se prefiere cuando hay usuario de plataforma y se usa la plantilla del evento', async () => {
    const { puerto, store } = puertoNotificacionesFalso();
    const repo = crearRepositorioNotificacionesFirestore(puerto);
    const notificador = crearNotificadorIncidencias({
      crearDispatcher: (autorizacion) => {
        expect(autorizacion.perfil).toBe('ADMINISTRADOR');
        return new DispatcherNotificaciones({
          autorizacion,
          repositorio: repo,
          canales: {
            INAPP: { canal: 'INAPP', async enviar() { return { ok: true, provider: 'inapp', externalId: 'msg-1', enviadoEn: AHORA.toISOString() }; } },
            EMAIL: null,
            WEBHOOK: null,
            WHATSAPP: null,
          },
        });
      },
    });
    const entrega = await notificador(aviso({ destinos: ['INQUILINO'], contactos: { inquilino: { usuarioId: 'usuario-ines', nombre: 'Inés Privada' }, propietario: {}, profesional: {} } }));
    expect(entrega).toMatchObject({ estado: 'ENVIADA', canal: 'INAPP', provider: 'inapp', externalId: 'msg-1' });
    // Documento canónico persistido con su estado real + registro de entrega.
    const doc = store.get('notificaciones/not_ev_incidencia_nueva_inc_1')?.fields;
    expect(doc).toMatchObject({ id: 'not_ev_incidencia_nueva_inc_1', tipo: 'incidencia.nueva', entidadId: 'inc-1', estado: 'ENVIADA' });
    // Registro de entregas: un asiento por INTENTO real (ENVIANDO → ENVIADA).
    const entregas = [...store.keys()].filter((k) => k.startsWith('notificaciones_entregas/')).sort();
    expect(entregas).toEqual([
      'notificaciones_entregas/not_ev_incidencia_nueva_inc_1__1__enviada',
      'notificaciones_entregas/not_ev_incidencia_nueva_inc_1__1__enviando',
    ]);
  });

  it('el mismo evento dos veces es idempotente: el segundo dispatch no vuelve a enviar', async () => {
    const { puerto } = puertoNotificacionesFalso();
    const repo = crearRepositorioNotificacionesFirestore(puerto);
    let envios = 0;
    const crearDispatcher = (autorizacion: { perfil: 'ADMINISTRADOR' }) =>
      new DispatcherNotificaciones({
        autorizacion,
        repositorio: repo,
        canales: {
          INAPP: { canal: 'INAPP', async enviar() { envios += 1; return { ok: true, provider: 'inapp', externalId: `msg-${envios}`, enviadoEn: AHORA.toISOString() }; } },
          EMAIL: null,
          WEBHOOK: null,
          WHATSAPP: null,
        },
      });
    const notificador = crearNotificadorIncidencias({ crearDispatcher });
    const uno = await notificador(aviso({ destinos: ['INQUILINO'], contactos: { inquilino: { usuarioId: 'usuario-ines' }, propietario: {}, profesional: {} } }));
    const dos = await notificador(aviso({ destinos: ['INQUILINO'], contactos: { inquilino: { usuarioId: 'usuario-ines' }, propietario: {}, profesional: {} } }));
    expect(uno.estado).toBe('ENVIADA');
    // El segundo intento NO reenvía: misma notificación y estado DUPLICADA.
    expect(dos).toMatchObject({ estado: 'DUPLICADA', notificacionId: uno.notificacionId });
    expect(envios).toBe(1);
  });

  it('sin canal disponible el aviso queda NO_ENVIADA con su motivo (nunca «enviado»)', async () => {
    const { puerto } = puertoNotificacionesFalso();
    const repo = crearRepositorioNotificacionesFirestore(puerto);
    const notificador = crearNotificadorIncidencias({
      crearDispatcher: (autorizacion) =>
        new DispatcherNotificaciones({ autorizacion, repositorio: repo, canales: { INAPP: null, EMAIL: null, WEBHOOK: null, WHATSAPP: null } }),
    });
    const entrega = await notificador(aviso({ destinos: ['INQUILINO'], contactos: { inquilino: { usuarioId: 'usuario-ines' }, propietario: {}, profesional: {} } }));
    expect(entrega.estado).toBe('NO_ENVIADA');
    expect(entrega.motivo).toBeTruthy();
    expect(entrega.intentos).toBe(0);
  });

  it('el registro de entregas usa id determinista por intento (sin duplicar filas)', async () => {
    const { puerto, store } = puertoNotificacionesFalso();
    const registro = crearRegistroEntregasNotificaciones(puerto);
    const notificacion: Notificacion = {
      id: 'not_ev_incidencia_nueva_inc_1',
      idempotencyKey: 'ev:incidencia:nueva:inc_1',
      tipo: 'incidencia.nueva',
      origen: 'INCIDENCIA',
      canal: 'INAPP',
      destinatario: { usuarioId: 'usuario-ines' },
      asunto: 'Incidencia registrada',
      plantilla: 'incidencia.nueva',
      datos: {},
      entidadId: 'inc-1',
      fechaCreacion: AHORA.toISOString(),
      estado: 'ENVIADA',
      intentos: 1,
      provider: 'inapp',
      audit: { eventos: [] },
    };
    await registro.registrar(notificacion, { estado: 'ENVIADA', intentos: 1 });
    await registro.registrar(notificacion, { estado: 'ENVIADA', intentos: 1 });
    const filas = [...store.keys()].filter((k) => k.startsWith('notificaciones_entregas/'));
    expect(filas).toHaveLength(1);
    expect(idDeIntentoEntrega(notificacion)).toBe('not_ev_incidencia_nueva_inc_1__1__enviada');
  });

  it('la escalada usa su plantilla y su motivo en el aviso a gestión', async () => {
    const { puerto } = puertoNotificacionesFalso();
    const repo = crearRepositorioNotificacionesFirestore(puerto);
    const enviados: Array<{ asunto: string; motivo: string }> = [];
    const notificador = crearNotificadorIncidencias({
      usuarioIdAdministracion: 'usuario-admin',
      crearDispatcher: (autorizacion) =>
        new DispatcherNotificaciones({
          autorizacion,
          repositorio: repo,
          canales: {
            INAPP: {
              canal: 'INAPP',
              async enviar(notificacion) {
                enviados.push({ asunto: notificacion.asunto, motivo: String(notificacion.datos.motivo ?? '') });
                return { ok: true, provider: 'inapp', enviadoEn: AHORA.toISOString() };
              },
            },
            EMAIL: null,
            WEBHOOK: null,
            WHATSAPP: null,
          },
        }),
    });
    const entrega = await notificador(
      aviso({
        evento: eventoIncidencia({ tipo: 'INCIDENCIA_ESCALADA', detalleCodigo: 'URGENTE_SIN_ASIGNAR', avisarA: ['PROPIETARIO', 'ADMINISTRACION'] }),
        destinos: ['ADMINISTRACION'],
        contactos: { inquilino: {}, propietario: {}, profesional: {} },
      }),
    );
    expect(entrega.estado).toBe('ENVIADA');
    expect(entrega.canal).toBe('INAPP');
    expect(enviados).toHaveLength(1);
    expect(enviados[0].asunto).toContain('Incidencia escalada');
    expect(enviados[0].motivo).toBe('prioridad urgente sin profesional asignado');
  });
});
