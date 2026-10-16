/**
 * FASE 6 — SEGUIMIENTO Y TRAZABILIDAD DE INCIDENCIAS (servidor)
 * ============================================================
 * Servicio autoritativo del ciclo de vida de una incidencia. El servidor NO se
 * fía de lo que el cliente diga que ha cambiado:
 *
 *   1. AUTENTICA con el ID token verificado (el uid entra por parámetro desde la
 *      ruta, nunca del cuerpo).
 *   2. AUTORIZA contra las fuentes (`usuarios_auth` + `usuarios` + la propia
 *      incidencia): inquilino vinculado al contrato, propietario del inmueble,
 *      profesional asignado o administración. Cualquier otro caso ⇒ 403.
 *   3. OBSERVA la incidencia en Firestore y la compara con la última instantánea
 *      del hilo (`incidencias_seguimiento/{incidenciaId}`): sólo un cambio REAL
 *      produce eventos; un guardado idéntico no escribe ni notifica nada.
 *   4. PERSISTE los eventos (append-only, ids deterministas ⇒ idempotente) y
 *      AVISA por el dispatcher canónico (GAP 1) anotando el estado REAL de
 *      entrega: nunca se declara «enviado» sin proveedor.
 *   5. REINTENTA de forma segura los avisos pendientes sin duplicar: la clave de
 *      idempotencia es la del evento, así que el reintento no genera dos avisos.
 *
 * No guarda texto libre (ni descripciones, ni nombres, ni importes), no expone
 * datos de otros usuarios y no modifica la incidencia: sólo deja traza.
 */
import {
  COLECCION_SEGUIMIENTO_INCIDENCIAS,
  derivarEventosSeguimiento,
  eventosPendientesDeEntrega,
  hiloConEventos,
  hiloInicial,
  instantaneaIncidenciaSeguimiento,
  type ActorSeguimientoIncidencia,
  type ContextoSeguimientoIncidencia,
  type DestinoAvisoIncidencia,
  type EntregaEventoSeguimiento,
  type EventoSeguimientoIncidencia,
  type HiloSeguimientoIncidencia,
  type InstantaneaIncidenciaSeguimiento,
} from '../../src/seguimiento/incidencias.js';
import { incidenciaVisibleParaContratosIA } from '../ia/asistenteIncidenciasInquilino.js';

export const MAX_INTENTOS_CAS_SEGUIMIENTO = 2;

export type CodigoRechazoIncidenciaSeguimiento =
  | 'PERFIL_NO_VALIDO'
  | 'PERFIL_NO_ACTIVO'
  | 'INCIDENCIA_NO_ENCONTRADA'
  | 'INCIDENCIA_NO_AUTORIZADA'
  | 'INCIDENCIA_INCOMPLETA'
  | 'FUENTE_NO_DISPONIBLE'
  | 'CONFLICTO_SEGUIMIENTO';

/** Datos de contacto resueltos en servidor SÓLO para entregar el aviso. */
export interface ContactosAvisoIncidencia {
  inquilino: { email?: string; nombre?: string; usuarioId?: string };
  propietario: { email?: string; nombre?: string; usuarioId?: string };
  profesional: { email?: string; nombre?: string; usuarioId?: string };
}

export interface AvisoSeguimientoIncidencia {
  evento: EventoSeguimientoIncidencia;
  /** Datos de plantilla (lista blanca, sin datos internos ni de terceros). */
  datos: Record<string, string | number | boolean | null>;
  /** Destinos autorizados para este suceso (el canal elige el primero resoluble). */
  destinos: DestinoAvisoIncidencia[];
  contactos: ContactosAvisoIncidencia;
  instantanea: InstantaneaIncidenciaSeguimiento;
  contexto: ContextoSeguimientoIncidencia;
}

export type NotificadorSeguimientoIncidencia = (
  aviso: AvisoSeguimientoIncidencia,
) => Promise<EntregaEventoSeguimiento>;

/** Puerto de datos: lo cumple `ClienteFirestoreRest` del servidor. */
export interface PuertoSeguimientoIncidencias {
  leerDocumento(ruta: string): Promise<{ datos: Record<string, unknown>; updateTime?: string } | null>;
  crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarCamposSiVersion(
    coleccion: string,
    id: string,
    datos: Record<string, unknown>,
    updateTimeEsperado: string,
  ): Promise<boolean>;
}

export type ResultadoSincronizacionSeguimiento =
  | { estado: 'OK'; hilo: HiloSeguimientoIncidencia; eventos: EventoSeguimientoIncidencia[]; reintentos: number }
  | { estado: 'SIN_CAMBIOS'; hilo: HiloSeguimientoIncidencia; reintentos: number }
  | { estado: 'RECHAZADO'; codigo: CodigoRechazoIncidenciaSeguimiento; codigoHttp: number };

export type ResultadoLecturaSeguimiento =
  | { estado: 'OK'; hilo: HiloSeguimientoIncidencia | null; autorizadoComo: ActorSeguimientoIncidencia }
  | { estado: 'RECHAZADO'; codigo: CodigoRechazoIncidenciaSeguimiento; codigoHttp: number };

export interface EventoLogSeguimiento {
  evento: 'SEGUIMIENTO_SINCRONIZADO' | 'SEGUIMIENTO_RECHAZADO' | 'SEGUIMIENTO_CONFLICTO' | 'SEGUIMIENTO_ENTREGA' | 'SEGUIMIENTO_TRAZA_NO_ACTUALIZADA';
  incidenciaId?: string;
  uid?: string;
  codigo?: string;
  eventos?: number;
  destino?: DestinoAvisoIncidencia;
  estadoEntrega?: EntregaEventoSeguimiento['estado'];
}

export interface DependenciasSeguimientoIncidencias {
  puerto: PuertoSeguimientoIncidencias;
  /** Sin notificador configurado los eventos se persisten pero no se avisa. */
  notificar?: NotificadorSeguimientoIncidencia | null;
  ahora?: () => Date;
  log?: (evento: EventoLogSeguimiento) => void;
}

export interface EntradaSincronizacion {
  uid: string;
  incidenciaId: string;
  /** El inquilino pidió derivación desde el asistente (Fase 5). */
  derivacionSolicitada?: boolean;
}

export interface ServicioSeguimientoIncidencias {
  sincronizar(entrada: EntradaSincronizacion): Promise<ResultadoSincronizacionSeguimiento>;
  leer(entrada: { uid: string; incidenciaId: string }): Promise<ResultadoLecturaSeguimiento>;
}

function texto(valor: unknown, max = 120): string | undefined {
  if (typeof valor !== 'string') return undefined;
  const limpio = valor.trim();
  if (limpio === '') return undefined;
  return limpio.length > max ? limpio.slice(0, max) : limpio;
}

function listaTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === 'string');
}

function idDeTrabajo(datos: Record<string, unknown>): string | undefined {
  const trabajo = datos.trabajoProfesional;
  if (typeof trabajo !== 'object' || trabajo === null) return undefined;
  return texto((trabajo as Record<string, unknown>).profesionalId, 120);
}

interface AutorizacionIncidencia {
  actorTipo: ActorSeguimientoIncidencia;
  contexto: ContextoSeguimientoIncidencia;
  instantanea: InstantaneaIncidenciaSeguimiento;
  contactos: ContactosAvisoIncidencia;
  /** Datos de plantilla del aviso (título, categoría, dirección visible...). */
  datosAviso: Record<string, string | number | boolean | null>;
}

type ResultadoAutorizacion =
  | { estado: 'AUTORIZADO'; datos: AutorizacionIncidencia }
  | { estado: 'RECHAZADO'; codigo: CodigoRechazoIncidenciaSeguimiento; codigoHttp: number };

export function crearServicioSeguimientoIncidencias(
  deps: DependenciasSeguimientoIncidencias,
): ServicioSeguimientoIncidencias {
  const ahora = deps.ahora ?? (() => new Date());
  const log = deps.log ?? (() => undefined);

  /** Perfil veraz del actor + autorización sobre ESTA incidencia. */
  async function autorizar(uid: string, incidenciaId: string): Promise<ResultadoAutorizacion> {
    let datosIncidencia: Record<string, unknown>;
    try {
      const espejo = await deps.puerto.leerDocumento(`usuarios_auth/${uid}`);
      if (!espejo) return { estado: 'RECHAZADO', codigo: 'PERFIL_NO_VALIDO', codigoHttp: 403 };
      const espejoDatos = espejo.datos;
      if (espejoDatos.estado !== 'ACTIVO') return { estado: 'RECHAZADO', codigo: 'PERFIL_NO_ACTIVO', codigoHttp: 403 };
      const tipoPerfil = texto(espejoDatos.tipoPerfil, 40);
      const usuarioId = texto(espejoDatos.usuarioId, 120);
      if (!tipoPerfil || !usuarioId) return { estado: 'RECHAZADO', codigo: 'PERFIL_NO_VALIDO', codigoHttp: 403 };
      const ficha = await deps.puerto.leerDocumento(`usuarios/${usuarioId}`);
      if (!ficha || ficha.datos.authUid !== uid || ficha.datos.estado !== 'ACTIVO') {
        return { estado: 'RECHAZADO', codigo: 'PERFIL_NO_VALIDO', codigoHttp: 403 };
      }

      const docIncidencia = await deps.puerto.leerDocumento(`incidencias/${incidenciaId}`);
      if (!docIncidencia) return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_ENCONTRADA', codigoHttp: 404 };
      datosIncidencia = docIncidencia.datos;

      const inmuebleId = texto(datosIncidencia.inmuebleId, 120);
      const propietarioId = texto(datosIncidencia.propietarioId, 120);
      if (!inmuebleId || !propietarioId) {
        return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_INCOMPLETA', codigoHttp: 422 };
      }

      let actorTipo: ActorSeguimientoIncidencia;
      if (tipoPerfil === 'INQUILINO') {
        const contratoIds = [...new Set(listaTextos(ficha.datos.contratoIds))];
        if (contratoIds.length === 0 || !incidenciaVisibleParaContratosIA(datosIncidencia, contratoIds)) {
          return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA', codigoHttp: 403 };
        }
        actorTipo = 'INQUILINO';
      } else if (tipoPerfil === 'PROPIETARIO') {
        if (texto(ficha.datos.propietarioId, 120) !== propietarioId) {
          return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA', codigoHttp: 403 };
        }
        actorTipo = 'PROPIETARIO';
      } else if (tipoPerfil === 'PROFESIONAL') {
        const profesionalId = texto(ficha.datos.profesionalId, 120);
        const asignados = [texto(datosIncidencia.profesionalId, 120), texto(datosIncidencia.profesionalAsignadoId, 120), idDeTrabajo(datosIncidencia)];
        if (!profesionalId || !asignados.includes(profesionalId)) {
          return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_AUTORIZADA', codigoHttp: 403 };
        }
        actorTipo = 'PROFESIONAL';
      } else if (tipoPerfil === 'ADMINISTRADOR') {
        actorTipo = 'ADMINISTRACION';
      } else {
        return { estado: 'RECHAZADO', codigo: 'PERFIL_NO_VALIDO', codigoHttp: 403 };
      }

      // Contexto y contactos: del contrato y del propietario (fuentes autorizadas).
      const contratoId = texto(datosIncidencia.contratoId, 120) ?? listaTextos(datosIncidencia.contratoIdsVisibles)[0];
      let contactos: ContactosAvisoIncidencia = {
        inquilino: {},
        propietario: {},
        profesional: {},
      };
      if (contratoId) {
        const contrato = await deps.puerto.leerDocumento(`contratos_formalizacion/${contratoId}`);
        if (contrato) {
          contactos = {
            ...contactos,
            inquilino: {
              ...(texto(contrato.datos.candidatoEmail, 160) ? { email: texto(contrato.datos.candidatoEmail, 160) } : {}),
              ...(texto(contrato.datos.candidatoNombre, 120) ? { nombre: texto(contrato.datos.candidatoNombre, 120) } : {}),
              ...(texto(contrato.datos.inquilinoId ?? contrato.datos.candidatoId, 120)
                ? { usuarioId: texto(contrato.datos.inquilinoId ?? contrato.datos.candidatoId, 120) }
                : {}),
            },
          };
        }
      }
      const propietario = await deps.puerto.leerDocumento(`propietarios/${propietarioId}`);
      if (propietario) {
        contactos = {
          ...contactos,
          propietario: {
            ...(texto(propietario.datos.email, 160) ? { email: texto(propietario.datos.email, 160) } : {}),
            ...(texto(propietario.datos.nombre, 120) ? { nombre: texto(propietario.datos.nombre, 120) } : {}),
          },
        };
      }
      const profesionalAsignadoId = texto(datosIncidencia.profesionalAsignadoId, 120) ?? idDeTrabajo(datosIncidencia);
      if (profesionalAsignadoId) {
        const profesional = await deps.puerto.leerDocumento(`profesionales/${profesionalAsignadoId}`);
        if (profesional) {
          contactos = {
            ...contactos,
            profesional: {
              ...(texto(profesional.datos.email, 160) ? { email: texto(profesional.datos.email, 160) } : {}),
              ...(texto(profesional.datos.nombre, 120) ? { nombre: texto(profesional.datos.nombre, 120) } : {}),
            },
          };
        }
      }

      const instantanea = instantaneaIncidenciaSeguimiento(datosIncidencia, ahora());
      const contexto: ContextoSeguimientoIncidencia = {
        incidenciaId,
        inmuebleId,
        propietarioId,
        ...(contratoId ? { contratoId } : {}),
      };
      // Datos de plantilla: sólo los campos que el destinatario ya puede ver.
      const datosAviso: Record<string, string | number | boolean | null> = {
        prioridad: instantanea.prioridad,
        estado: instantanea.estado,
      };
      const titulo = texto(datosIncidencia.titulo, 160);
      if (titulo) datosAviso.titulo = titulo;
      const categoria = texto(datosIncidencia.categoria, 40);
      if (categoria) datosAviso.categoria = categoria;
      const direccion = texto(datosIncidencia.inmuebleDireccion, 200);
      if (direccion) datosAviso.inmuebleDireccion = direccion;
      return { estado: 'AUTORIZADO', datos: { actorTipo, contexto, instantanea, contactos, datosAviso } };
    } catch {
      // Fallo cerrado: sin fuente autorizada no se escribe ni se notifica nada.
      return { estado: 'RECHAZADO', codigo: 'FUENTE_NO_DISPONIBLE', codigoHttp: 503 };
    }
  }

  async function leerHilo(
    incidenciaId: string,
  ): Promise<{ hilo: HiloSeguimientoIncidencia | null; updateTime?: string }> {
    const doc = await deps.puerto.leerDocumento(`${COLECCION_SEGUIMIENTO_INCIDENCIAS}/${incidenciaId}`);
    if (!doc) return { hilo: null };
    const datos = doc.datos as unknown as HiloSeguimientoIncidencia;
    if (!datos || !Array.isArray(datos.eventos) || !datos.ultima) return { hilo: null, ...(doc.updateTime ? { updateTime: doc.updateTime } : {}) };
    return { hilo: datos, ...(doc.updateTime ? { updateTime: doc.updateTime } : {}) };
  }

  async function entregar(
    eventos: readonly EventoSeguimientoIncidencia[],
    datos: AutorizacionIncidencia,
  ): Promise<EventoSeguimientoIncidencia[]> {
    const notificar = deps.notificar;
    if (!notificar) return [...eventos];
    const salida: EventoSeguimientoIncidencia[] = [];
    for (const evento of eventos) {
      if (evento.avisarA.length === 0) {
        salida.push(evento);
        continue;
      }
      let entrega: EntregaEventoSeguimiento;
      try {
        entrega = await notificar({
          evento,
          datos: { ...datos.datosAviso },
          destinos: [...evento.avisarA],
          contactos: datos.contactos,
          instantanea: datos.instantanea,
          contexto: datos.contexto,
        });
      } catch (err) {
        entrega = {
          canal: null,
          estado: 'PENDIENTE',
          intentos: 1,
          motivo: err instanceof Error ? err.message : 'error_notificacion',
          actualizadoEn: ahora().toISOString(),
        };
      }
      log({
        evento: 'SEGUIMIENTO_ENTREGA',
        incidenciaId: evento.incidenciaId,
        eventos: 1,
        estadoEntrega: entrega.estado,
      });
      salida.push({ ...evento, entrega });
    }
    return salida;
  }

  async function persistirEntrega(
    incidenciaId: string,
    eventos: readonly EventoSeguimientoIncidencia[],
  ): Promise<void> {
    for (let intento = 0; intento < MAX_INTENTOS_CAS_SEGUIMIENTO; intento += 1) {
      const { hilo, updateTime } = await leerHilo(incidenciaId);
      if (!hilo || !updateTime) return;
      const porId = new Map(eventos.map((e) => [e.id, e]));
      const actualizados = hilo.eventos.map((e) => (porId.has(e.id) ? { ...e, entrega: porId.get(e.id)?.entrega } : e));
      const ok = await deps.puerto.actualizarCamposSiVersion(
        COLECCION_SEGUIMIENTO_INCIDENCIAS,
        incidenciaId,
        { eventos: actualizados, actualizadoEn: ahora().toISOString() },
        updateTime,
      );
      if (ok) return;
    }
    log({ evento: 'SEGUIMIENTO_TRAZA_NO_ACTUALIZADA', incidenciaId, codigo: 'CAS_PERDIDO' });
  }

  /** Reintento seguro: misma clave de idempotencia ⇒ nunca duplica el aviso. */
  async function reintentarPendientes(
    hilo: HiloSeguimientoIncidencia,
    datos: AutorizacionIncidencia,
  ): Promise<number> {
    const pendientes = eventosPendientesDeEntrega(hilo);
    if (pendientes.length === 0 || !deps.notificar) return 0;
    const conEntrega = await entregar(pendientes, datos);
    await persistirEntrega(hilo.incidenciaId, conEntrega);
    return conEntrega.length;
  }

  return {
    async sincronizar(entrada) {
      if (!texto(entrada.incidenciaId, 200) || !texto(entrada.uid, 200)) {
        return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_ENCONTRADA', codigoHttp: 400 };
      }
      const incidenciaId = entrada.incidenciaId.trim();
      const autorizacion = await autorizar(entrada.uid, incidenciaId);
      if (autorizacion.estado === 'RECHAZADO') {
        log({
          evento: 'SEGUIMIENTO_RECHAZADO',
          incidenciaId,
          uid: entrada.uid,
          codigo: autorizacion.codigo,
        });
        return autorizacion;
      }
      const datos = autorizacion.datos;

      for (let intento = 0; intento < MAX_INTENTOS_CAS_SEGUIMIENTO; intento += 1) {
        const { hilo, updateTime } = await leerHilo(incidenciaId);
        const idsExistentes = new Set((hilo?.eventos ?? []).map((e) => e.id));
        const nuevos = derivarEventosSeguimiento({
          contexto: datos.contexto,
          anterior: hilo?.ultima ?? null,
          actual: datos.instantanea,
          actorTipo: datos.actorTipo,
          ahora: ahora(),
          idsExistentes,
          ...(entrada.derivacionSolicitada === true ? { derivacionSolicitada: true } : {}),
        });

        if (nuevos.length === 0) {
          // Nada real ha cambiado: no se escribe, no se avisa; sólo se revisan
          // avisos que ya estaban pendientes (reintento seguro).
          const reintentos = hilo ? await reintentarPendientes(hilo, datos) : 0;
          const hiloFinal = reintentos > 0 ? (await leerHilo(incidenciaId)).hilo ?? hilo : hilo;
          if (!hiloFinal) {
            // Incidencia sin hilo y sin cambios: se crea el hilo con la
            // instantánea (el evento de registro no es un cambio nuevo).
            const inicial = hiloInicial(datos.contexto, datos.instantanea, [], ahora());
            const creado = await deps.puerto.crearDocumento(COLECCION_SEGUIMIENTO_INCIDENCIAS, incidenciaId, { ...inicial });
            if (creado === 'CREADO') {
              log({ evento: 'SEGUIMIENTO_SINCRONIZADO', incidenciaId, uid: entrada.uid, eventos: 0 });
              return { estado: 'SIN_CAMBIOS', hilo: inicial, reintentos };
            }
            continue;
          }
          log({ evento: 'SEGUIMIENTO_SINCRONIZADO', incidenciaId, uid: entrada.uid, eventos: 0 });
          return { estado: 'SIN_CAMBIOS', hilo: hiloFinal, reintentos };
        }

        const conEntrega = await entregar(nuevos, datos);
        const hiloNuevo = hilo
          ? hiloConEventos(hilo, datos.instantanea, conEntrega, ahora())
          : hiloInicial(datos.contexto, datos.instantanea, conEntrega, ahora());

        if (!hilo) {
          const creado = await deps.puerto.crearDocumento(COLECCION_SEGUIMIENTO_INCIDENCIAS, incidenciaId, { ...hiloNuevo });
          if (creado === 'CREADO') {
            log({ evento: 'SEGUIMIENTO_SINCRONIZADO', incidenciaId, uid: entrada.uid, eventos: conEntrega.length });
            return { estado: 'OK', hilo: hiloNuevo, eventos: conEntrega, reintentos: 0 };
          }
          continue; // Otro escritor creó el hilo: se relee y se recalcula.
        }

        if (!updateTime) {
          log({ evento: 'SEGUIMIENTO_CONFLICTO', incidenciaId, uid: entrada.uid, codigo: 'SIN_VERSION' });
          return { estado: 'RECHAZADO', codigo: 'CONFLICTO_SEGUIMIENTO', codigoHttp: 409 };
        }
        const escritura = await deps.puerto.actualizarCamposSiVersion(
          COLECCION_SEGUIMIENTO_INCIDENCIAS,
          incidenciaId,
          {
            ultima: hiloNuevo.ultima,
            eventos: hiloNuevo.eventos,
            actualizadoEn: hiloNuevo.actualizadoEn,
          },
          updateTime,
        );
        if (escritura) {
          log({ evento: 'SEGUIMIENTO_SINCRONIZADO', incidenciaId, uid: entrada.uid, eventos: conEntrega.length });
          return { estado: 'OK', hilo: hiloNuevo, eventos: conEntrega, reintentos: 0 };
        }
        log({ evento: 'SEGUIMIENTO_CONFLICTO', incidenciaId, uid: entrada.uid, codigo: 'CAS' });
      }

      return { estado: 'RECHAZADO', codigo: 'CONFLICTO_SEGUIMIENTO', codigoHttp: 409 };
    },

    async leer(entrada) {
      if (!texto(entrada.incidenciaId, 200)) {
        return { estado: 'RECHAZADO', codigo: 'INCIDENCIA_NO_ENCONTRADA', codigoHttp: 400 };
      }
      const incidenciaId = entrada.incidenciaId.trim();
      const autorizacion = await autorizar(entrada.uid, incidenciaId);
      if (autorizacion.estado === 'RECHAZADO') {
        log({ evento: 'SEGUIMIENTO_RECHAZADO', incidenciaId, uid: entrada.uid, codigo: autorizacion.codigo });
        return autorizacion;
      }
      const { hilo } = await leerHilo(incidenciaId);
      return { estado: 'OK', hilo, autorizadoComo: autorizacion.datos.actorTipo };
    },
  };
}
