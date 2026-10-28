/**
 * AG-02 — PORTALES PÚBLICOS POR TOKEN (servicio de servidor)
 * ==========================================================
 * Los enlaces que se envían a candidatos (`/visita/:token`,
 * `/cuestionario/:token`, `/documentacion/:token`) ya no pueden depender de
 * lecturas/escrituras anónimas: `firestore.rules` las deniega desde el cierre
 * de 2026-10-14 y la ruta de servidor que los comentarios de las reglas
 * presuponían no existía. Este módulo la implementa con la credencial de
 * servicio y el token como capacidad:
 *
 *   · El token se resuelve contra el documento real (`invitaciones.token`,
 *     `candidatos.cuestionarioToken`, `solicitudes_documentacion.token`) en la
 *     base Firestore CON NOMBRE. No hay enumeración: sin token válido, 404.
 *   · Las respuestas son listas blancas cerradas: nunca se devuelven notas
 *     privadas, scores internos, historiales del propietario, análisis de IA ni
 *     datos de otros candidatos.
 *   · Las escrituras son atómicas y condicionadas a la versión leída
 *     (`updateTime`). Una reserva concurrente pierde la carrera y recibe error,
 *     no una confirmación falsa.
 *   · Sin Firestore real el servicio no se construye (la ruta responde 503):
 *     no se degrada a memoria ni se finge persistencia.
 *
 * No se tocan las reglas: el anónimo sigue sin poder leer/escribir el funnel.
 * La autorización por token vive aquí y se aplica a cada operación.
 */
import { randomBytes } from 'node:crypto';

// H-06 — fuente única del formato del token de solicitud (cliente y servidor).
import {
  FECHA_CORTE_ENLACES_LEGADOS,
  analizarTokenSolicitud,
  verificarTokenContraPropiedad,
} from '../../src/lib/tokenSolicitudPublica.js';

import type {
  DocumentoLeido,
  EscrituraDocumentoFirestoreAtomica,
  PrecondicionEscrituraFirestore,
} from '../titularidades/googleBackend.js';

// ---------------------------------------------------------------------------
// Puerto (lo cumple `ClienteFirestoreRest`; en pruebas se inyecta un doble)
// ---------------------------------------------------------------------------

export interface ConsultaPortalPublico {
  igualdades?: Array<[campo: string, valor: string]>;
  orden?: { campo: string; direccion: 'ASCENDING' | 'DESCENDING' };
  limite: number;
  offset?: number;
}

export interface PuertoPortalPublico {
  leerDocumento(ruta: string): Promise<DocumentoLeido | null>;
  consultarIgualdadesOrden(coleccion: string, consulta: ConsultaPortalPublico): Promise<DocumentoLeido[]>;
  escribirAtomico(escrituras: readonly EscrituraDocumentoFirestoreAtomica[]): Promise<'COMMIT' | 'CONFLICTO'>;
}

export type CodigoErrorPortalPublico =
  | 'ENLACE_NO_VALIDO'
  | 'HORARIO_NO_DISPONIBLE'
  | 'YA_RESERVADO'
  | 'CANDIDATO_NO_ENCONTRADO'
  | 'PETICION_INVALIDA'
  | 'FUENTE_NO_DISPONIBLE'
  | 'CONFLICTO';

export class ErrorPortalPublico extends Error {
  constructor(
    readonly codigo: CodigoErrorPortalPublico,
    readonly status: number,
    readonly motivo?: string
  ) {
    super(codigo);
    this.name = 'ErrorPortalPublico';
  }
}

// ---------------------------------------------------------------------------
// Entradas / salidas
// ---------------------------------------------------------------------------

export interface DatosVisitaPublica {
  invitacion: Record<string, unknown>;
  slots: Array<Record<string, unknown>>;
  inmuebleId: string;
}

export interface EntradaReservaVisita {
  slotId: string;
  notas?: string;
}

export interface EntradaCuestionarioPublico {
  datos: Record<string, unknown>;
  respuestas: unknown;
  informacionAdicional?: string;
}

export interface EntradaSolicitudPublica {
  solicitud: Record<string, unknown>;
  candidato?: Record<string, unknown>;
}

export interface ResultadoSolicitudPublica {
  solicitud: Record<string, unknown>;
  candidatoId: string;
}

export interface EntradaDocumentacionPublica {
  documentos: unknown;
  final: boolean;
}

export interface DependenciasPortalPublico {
  puerto: PuertoPortalPublico;
  /** Reloj inyectable para pruebas deterministas. */
  ahora?: () => Date;
}

const PATRON_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,199}$/;
const MAX_SLOTS_VISITA = 100;
const MAX_DOCUMENTOS = 40;
const MAX_ARCHIVOS_POR_ITEM = 10;
const MAX_BYTES_ARCHIVO = 15 * 1024 * 1024;
const MAX_HISTORIAL = 200;
const HOSTS_STORAGE = new Set(['firebasestorage.googleapis.com', 'storage.googleapis.com']);

const TIPOS_EMPLEO = new Set(['cuenta_ajena', 'autonomo', 'funcionario', 'pensionista', 'estudiante_otro']);
const TIPOS_CONTRATO = new Set(['indefinido', 'temporal', 'practicas', 'fijo_discontinuo', 'no_aplica']);

// ---------------------------------------------------------------------------
// Validación / saneado
// ---------------------------------------------------------------------------

function exigirToken(token: unknown): string {
  if (typeof token !== 'string' || !PATRON_TOKEN.test(token)) {
    throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'TOKEN_INVALIDO');
  }
  return token;
}

function texto(valor: unknown, campo: string, max: number, obligatorio = true): string {
  if (typeof valor !== 'string') {
    if (!obligatorio && (valor === undefined || valor === null)) return '';
    throw new ErrorPortalPublico('PETICION_INVALIDA', 400, `CAMPO_${campo}`);
  }
  const limpio = valor.trim();
  if (obligatorio && limpio.length === 0) {
    throw new ErrorPortalPublico('PETICION_INVALIDA', 400, `CAMPO_${campo}`);
  }
  if (limpio.length > max) {
    throw new ErrorPortalPublico('PETICION_INVALIDA', 400, `CAMPO_${campo}_LARGO`);
  }
  return limpio;
}

function numero(valor: unknown, campo: string, min: number, max: number): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < min || valor > max) {
    throw new ErrorPortalPublico('PETICION_INVALIDA', 400, `CAMPO_${campo}`);
  }
  return valor;
}

function entero(valor: unknown, campo: string, min: number, max: number): number {
  const n = numero(valor, campo, min, max);
  if (!Number.isInteger(n)) throw new ErrorPortalPublico('PETICION_INVALIDA', 400, `CAMPO_${campo}`);
  return n;
}

function booleano(valor: unknown, campo: string): boolean {
  if (typeof valor !== 'boolean') throw new ErrorPortalPublico('PETICION_INVALIDA', 400, `CAMPO_${campo}`);
  return valor;
}

function unoDe<T extends string>(valor: unknown, permitidos: Set<string>, campo: string, defecto?: T): T {
  if (valor === undefined && defecto !== undefined) return defecto;
  if (typeof valor !== 'string' || !permitidos.has(valor)) {
    throw new ErrorPortalPublico('PETICION_INVALIDA', 400, `CAMPO_${campo}`);
  }
  return valor as T;
}

function objeto(valor: unknown, campo: string): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new ErrorPortalPublico('PETICION_INVALIDA', 400, `CAMPO_${campo}`);
  }
  return valor as Record<string, unknown>;
}

function copiar(datos: Record<string, unknown>, claves: readonly string[]): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const clave of claves) {
    if (datos[clave] !== undefined) salida[clave] = datos[clave];
  }
  return salida;
}

function esIso(valor: unknown): boolean {
  return typeof valor === 'string' && !Number.isNaN(Date.parse(valor));
}

function urlStorageValida(valor: unknown): boolean {
  if (typeof valor !== 'string') return false;
  try {
    const url = new URL(valor);
    return url.protocol === 'https:' && HOSTS_STORAGE.has(url.hostname);
  } catch {
    return false;
  }
}

function rutaStorageValida(valor: unknown, solicitudId: string): boolean {
  if (typeof valor !== 'string' || valor.includes('..') || valor.startsWith('/') || valor.includes('//')) return false;
  return valor.startsWith(`documentos_solicitados/${solicitudId}/`) && valor.length <= 500;
}

// ---------------------------------------------------------------------------
// Listas blancas de lectura
// ---------------------------------------------------------------------------

const CAMPOS_INVITACION = [
  'candidateId',
  'candidateNombre',
  'candidateTelefono',
  'candidateEmail',
  'inmuebleId',
  'habitacionId',
  'inmuebleNombre',
  'inmueblePrecio',
  'inmuebleCiudad',
  'status',
  'fechaPreseleccion',
  'createdAt',
  'sentAt',
  'openedAt',
  'bookedAt',
  'canceledAt',
  'reserva',
] as const;

const CAMPOS_RESERVA = ['slotId', 'fecha', 'horaInicio', 'horaFin', 'direccionCompleta', 'notasCandidato'] as const;

function sanearInvitacion(doc: DocumentoLeido): Record<string, unknown> {
  const base = copiar(doc.datos, CAMPOS_INVITACION);
  const reserva = doc.datos.reserva;
  if (reserva && typeof reserva === 'object' && !Array.isArray(reserva)) {
    base.reserva = copiar(reserva as Record<string, unknown>, CAMPOS_RESERVA);
  } else {
    delete base.reserva;
  }
  return { id: doc.id, token: doc.datos.token, ...base };
}

function sanearSlot(doc: DocumentoLeido): Record<string, unknown> {
  const d = doc.datos;
  return {
    id: doc.id,
    inmuebleId: typeof d.inmuebleId === 'string' ? d.inmuebleId : '',
    ...(typeof d.habitacionId === 'string' ? { habitacionId: d.habitacionId } : {}),
    fecha: typeof d.fecha === 'string' ? d.fecha : '',
    horaInicio: typeof d.horaInicio === 'string' ? d.horaInicio : '',
    horaFin: typeof d.horaFin === 'string' ? d.horaFin : '',
    // Un slot bloqueado por el propietario no se ofrece aunque `disponible`
    // haya quedado obsoleto en el documento.
    disponible: d.disponible === true && d.bloqueadoPorPropietario !== true,
    ...(d.bloqueadoPorPropietario === true ? { bloqueadoPorPropietario: true } : {}),
  };
}

const CAMPOS_CANDIDATO_PUBLICO = [
  'nombre',
  'telefono',
  'email',
  'inmuebleId',
  'inmuebleNombre',
  'numPersonas',
  'ingresosNetos',
  'tipoEmpleo',
  'tipoContrato',
  'antiguedadLaboral',
  'otrosIngresos',
  'descripcionOtrosIngresos',
  'avalista',
  'observaciones',
  'estado',
  'fechaCreacion',
  'numTitularesContrato',
] as const;

const CAMPOS_COTITULAR = [
  'nombre',
  'telefono',
  'email',
  'tipoEmpleo',
  'empresa',
  'tipoContrato',
  'antiguedadLaboral',
  'ingresosNetos',
  'otrosIngresos',
  'descripcionOtrosIngresos',
] as const;

function sanearCuestionario(valor: unknown): Record<string, unknown> | undefined {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return undefined;
  const c = valor as Record<string, unknown>;
  const respuestas = Array.isArray(c.respuestas)
    ? c.respuestas.filter((r) => r && typeof r === 'object' && !Array.isArray(r)).slice(0, 20)
    : [];
  const salida: Record<string, unknown> = {
    completado: c.completado === true,
    numRespuestas: typeof c.numRespuestas === 'number' ? c.numRespuestas : respuestas.length,
    totalPreguntas: typeof c.totalPreguntas === 'number' ? c.totalPreguntas : 12,
    respuestas: respuestas.map((r) => {
      const item = r as Record<string, unknown>;
      return copiar(item, [
        'preguntaId',
        'preguntaTitulo',
        'preguntaTexto',
        'opcionSeleccionadaId',
        'opcionSeleccionadaTexto',
        'respuestaTextoLibre',
        'esAbierta',
      ]);
    }),
  };
  if (esIso(c.fechaCompletado)) salida.fechaCompletado = c.fechaCompletado;
  if (typeof c.informacionAdicional === 'string') salida.informacionAdicional = c.informacionAdicional.slice(0, 4000);
  return salida;
}

function sanearCandidatoPublico(doc: DocumentoLeido): Record<string, unknown> {
  const d = doc.datos;
  const salida = copiar(d, CAMPOS_CANDIDATO_PUBLICO);
  const cuestionario = sanearCuestionario(d.cuestionarioIncidencias);
  if (cuestionario) salida.cuestionarioIncidencias = cuestionario;
  if (d.cotitular && typeof d.cotitular === 'object' && !Array.isArray(d.cotitular)) {
    salida.cotitular = copiar(d.cotitular as Record<string, unknown>, CAMPOS_COTITULAR);
  }
  return { id: doc.id, ...salida };
}

const CAMPOS_SOLICITUD_DOC = [
  'token',
  'candidatoId',
  'candidatoNombre',
  'candidatoTelefono',
  'inmuebleId',
  'inmuebleNombre',
  'inmuebleDireccion',
  'inmuebleCiudad',
  'fechaVisita',
  'estado',
  'mensajePropietario',
  'fechaCreacion',
  'fechaSolicitud',
  'fechaEnvioCandidato',
] as const;

const CAMPOS_ARCHIVO = ['id', 'nombreArchivo', 'mimeType', 'url', 'storagePath', 'tamañoBytes', 'fechaSubida'] as const;

function sanearArchivo(archivo: Record<string, unknown>): Record<string, unknown> {
  const salida = copiar(archivo, CAMPOS_ARCHIVO);
  // Nunca se persiste ni se devuelve una copia base64: el binario vive en Storage.
  delete salida.base64Data;
  return salida;
}

const CAMPOS_ITEM_DOC = [
  'id',
  'tipo',
  'nombre',
  'descripcion',
  'obligatorio',
  'titular',
  'estado',
  'motivoCorreccion',
  'fechaSubida',
  'fechaValidacion',
] as const;

function sanearItemDocumento(item: Record<string, unknown>): Record<string, unknown> {
  const salida = copiar(item, CAMPOS_ITEM_DOC);
  const archivos = Array.isArray(item.archivos) ? item.archivos : [];
  salida.archivos = archivos
    .filter((a) => a && typeof a === 'object' && !Array.isArray(a))
    .slice(0, MAX_ARCHIVOS_POR_ITEM)
    .map((a) => sanearArchivo(a as Record<string, unknown>));
  return salida;
}

function sanearSolicitudDocumentacion(doc: DocumentoLeido): Record<string, unknown> {
  const salida = copiar(doc.datos, CAMPOS_SOLICITUD_DOC);
  const documentos = Array.isArray(doc.datos.documentos) ? doc.datos.documentos : [];
  salida.documentos = documentos
    .filter((d) => d && typeof d === 'object' && !Array.isArray(d))
    .slice(0, MAX_DOCUMENTOS)
    .map((d) => sanearItemDocumento(d as Record<string, unknown>));
  return { id: doc.id, ...salida };
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

export function crearServicioPortalPublico(deps: DependenciasPortalPublico) {
  const ahora = deps.ahora || (() => new Date());

  function isoAhora(): string {
    return ahora().toISOString();
  }

  async function localizarPorToken(
    coleccion: string,
    campo: string,
    token: string
  ): Promise<DocumentoLeido | null> {
    const filas = await deps.puerto.consultarIgualdadesOrden(coleccion, {
      igualdades: [[campo, token]],
      limite: 2,
    });
    if (filas.length > 1) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 409, 'TOKEN_AMBIGUO');
    if (filas.length === 1) return filas[0];
    // Compatibilidad SOLO con documentos heredados sin token: si el documento
    // ya tiene un token emitido, el id no es una capacidad válida. Sin esta
    // condición, conocer el id (p. ej. `cand-1`) bastaría para saltarse el
    // enlace y leer datos personales del candidato.
    const heredado = await deps.puerto.leerDocumento(`${coleccion}/${encodeURIComponent(token)}`);
    if (!heredado) return null;
    const tokenGuardado = heredado.datos[campo];
    if (typeof tokenGuardado === 'string' && tokenGuardado.trim() !== '') return null;
    return heredado;
  }

  function escritura(
    doc: DocumentoLeido,
    coleccion: string,
    datos: Record<string, unknown>
  ): EscrituraDocumentoFirestoreAtomica {
    if (!doc.updateTime) throw new ErrorPortalPublico('FUENTE_NO_DISPONIBLE', 503, 'SIN_VERSION');
    const precondicion: PrecondicionEscrituraFirestore = { tipo: 'VERSION', updateTime: doc.updateTime };
    return {
      coleccion,
      id: doc.id,
      datos,
      precondicion,
      camposActualizar: Object.keys(datos),
    };
  }

  async function leerFichaPublica(inmuebleId: string): Promise<Record<string, unknown> | null> {
    if (!inmuebleId) return null;
    try {
      const ficha = await deps.puerto.leerDocumento(
        `fichas_publicas_inmueble/${encodeURIComponent(inmuebleId)}`
      );
      return ficha ? ficha.datos : null;
    } catch {
      // La dirección es un dato de presentación: si la fuente no responde, se
      // usa el nombre del inmueble ya presente en la invitación.
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Visita
  // -------------------------------------------------------------------------

  async function obtenerVisita(tokenEntrada: string): Promise<DatosVisitaPublica> {
    const token = exigirToken(tokenEntrada);
    const invitacionDoc = await localizarPorToken('invitaciones', 'token', token);
    if (!invitacionDoc) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'INVITACION_NO_ENCONTRADA');

    const invitacion = sanearInvitacion(invitacionDoc);
    const inmuebleId = typeof invitacion.inmuebleId === 'string' ? invitacion.inmuebleId : '';

    const slotsDocs = inmuebleId
      ? await deps.puerto.consultarIgualdadesOrden('slots_visita', {
          igualdades: [['inmuebleId', inmuebleId]],
          limite: MAX_SLOTS_VISITA,
        })
      : [];
    const slots = slotsDocs
      .map(sanearSlot)
      .sort((a, b) => {
        const fecha = String(a.fecha).localeCompare(String(b.fecha));
        return fecha !== 0 ? fecha : String(a.horaInicio).localeCompare(String(b.horaInicio));
      });

    // ABIERTO: misma semántica que el efecto de montaje anterior, pero en el
    // servidor (el anónimo ya no escribe). Un conflicto no impide la lectura.
    const estado = String(invitacion.status || '');
    if (['ENVIADO', 'ENLACE GENERADO', 'PENDIENTE DE ENVIAR'].includes(estado)) {
      const abierta = isoAhora();
      try {
        const resultado = await deps.puerto.escribirAtomico([
          escritura(invitacionDoc, 'invitaciones', { status: 'ABIERTO', openedAt: abierta }),
        ]);
        // Si la versión cambió (otra pestaña/el propietario), la respuesta NO
        // debe anunciar un estado que no se ha persistido.
        if (resultado === 'COMMIT') {
          invitacion.status = 'ABIERTO';
          invitacion.openedAt = abierta;
        }
      } catch (error) {
        if (error instanceof ErrorPortalPublico) throw error;
        // Sin versión/commit no se bloquea el enlace público.
      }
    }

    return { invitacion, slots, inmuebleId };
  }

  async function reservarVisita(tokenEntrada: string, entrada: EntradaReservaVisita) {
    const token = exigirToken(tokenEntrada);
    const slotId = texto(entrada?.slotId, 'slotId', 200);
    const notas = entrada?.notas === undefined ? '' : texto(entrada.notas, 'notas', 1000, false);

    const invitacionDoc = await localizarPorToken('invitaciones', 'token', token);
    if (!invitacionDoc) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'INVITACION_NO_ENCONTRADA');
    const invitacion = sanearInvitacion(invitacionDoc);

    const reservaActual = invitacion.reserva as Record<string, unknown> | undefined;
    if (reservaActual && reservaActual.slotId === slotId && invitacion.status === 'HORARIO RESERVADO') {
      // Reintento idempotente del mismo enlace: no se reescribe nada.
      const slot = await deps.puerto.leerDocumento(`slots_visita/${encodeURIComponent(slotId)}`);
      return {
        invitacion,
        slot: slot ? sanearSlot(slot) : null,
        candidatoEstado: 'visita_reservada',
      };
    }
    if (invitacion.status === 'HORARIO RESERVADO' || reservaActual) {
      throw new ErrorPortalPublico('YA_RESERVADO', 409, 'INVITACION_YA_RESERVADA');
    }

    const slotDoc = await deps.puerto.leerDocumento(`slots_visita/${encodeURIComponent(slotId)}`);
    if (!slotDoc) throw new ErrorPortalPublico('HORARIO_NO_DISPONIBLE', 409, 'SLOT_NO_ENCONTRADO');
    if (slotDoc.datos.inmuebleId !== invitacion.inmuebleId) {
      throw new ErrorPortalPublico('HORARIO_NO_DISPONIBLE', 409, 'SLOT_DE_OTRO_INMUEBLE');
    }
    if (slotDoc.datos.disponible !== true || slotDoc.datos.bloqueadoPorPropietario === true
      || slotDoc.datos.reservaCandidateId) {
      throw new ErrorPortalPublico('HORARIO_NO_DISPONIBLE', 409, 'SLOT_OCUPADO');
    }

    const candidateId = String(invitacion.candidateId || '');
    if (!candidateId) throw new ErrorPortalPublico('CANDIDATO_NO_ENCONTRADO', 409, 'SIN_CANDIDATO');
    const candidatoDoc = await deps.puerto.leerDocumento(`candidatos/${encodeURIComponent(candidateId)}`);
    if (!candidatoDoc) throw new ErrorPortalPublico('CANDIDATO_NO_ENCONTRADO', 409, 'CANDIDATO_INEXISTENTE');

    const ficha = await leerFichaPublica(String(invitacion.inmuebleId || ''));
    const direccion = ficha && typeof ficha.direccion === 'string' && ficha.direccion.trim()
      ? `${ficha.direccion}${typeof ficha.ciudad === 'string' && ficha.ciudad.trim() ? `, ${ficha.ciudad}` : ''}`
      : String(invitacion.inmuebleNombre || '');

    const reservadoEn = isoAhora();
    const reserva = {
      slotId,
      fecha: String(slotDoc.datos.fecha || ''),
      horaInicio: String(slotDoc.datos.horaInicio || ''),
      horaFin: String(slotDoc.datos.horaFin || ''),
      direccionCompleta: direccion,
      notasCandidato: notas,
    };

    const resultado = await deps.puerto.escribirAtomico([
      escritura(slotDoc, 'slots_visita', {
        disponible: false,
        reservaCandidateId: candidateId,
        reservaCandidateNombre: String(invitacion.candidateNombre || ''),
        reservaInvitationId: String(invitacionDoc.id),
        ...(typeof slotDoc.datos.habitacionId === 'string' ? { habitacionId: slotDoc.datos.habitacionId } : {}),
      }),
      escritura(invitacionDoc, 'invitaciones', {
        status: 'HORARIO RESERVADO',
        bookedAt: reservadoEn,
        reserva,
      }),
      escritura(candidatoDoc, 'candidatos', { estado: 'visita_reservada' }),
    ]);
    if (resultado === 'CONFLICTO') {
      throw new ErrorPortalPublico('HORARIO_NO_DISPONIBLE', 409, 'CARRERA_PERDIDA');
    }

    return {
      invitacion: {
        ...invitacion,
        status: 'HORARIO RESERVADO',
        bookedAt: reservadoEn,
        reserva,
      },
      slot: { ...sanearSlot(slotDoc), disponible: false },
      candidatoEstado: 'visita_reservada',
    };
  }

  async function cancelarVisita(tokenEntrada: string) {
    const token = exigirToken(tokenEntrada);
    const invitacionDoc = await localizarPorToken('invitaciones', 'token', token);
    if (!invitacionDoc) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'INVITACION_NO_ENCONTRADA');
    const invitacion = sanearInvitacion(invitacionDoc);
    const reserva = invitacion.reserva as Record<string, unknown> | undefined;
    const slotId = reserva && typeof reserva.slotId === 'string' ? reserva.slotId : '';
    if (!slotId) {
      // Cancelar un enlace sin reserva es idempotente: no hay nada que liberar.
      return { invitacion, slot: null, candidatoEstado: null };
    }

    const slotDoc = await deps.puerto.leerDocumento(`slots_visita/${encodeURIComponent(slotId)}`);
    const canceladaEn = isoAhora();
    const escrituras: EscrituraDocumentoFirestoreAtomica[] = [
      escritura(invitacionDoc, 'invitaciones', {
        status: 'ABIERTO',
        reserva: null,
        canceledAt: canceladaEn,
      }),
    ];
    // Solo se libera el slot si sigue vinculado a ESTA invitación/candidato.
    // Si el propietario lo reasignó mientras tanto, cancelar el enlace no debe
    // liberar la reserva de otra persona.
    const slotVinculado = !!slotDoc && (
      slotDoc.datos.reservaInvitationId === invitacionDoc.id ||
      (!!invitacion.candidateId && slotDoc.datos.reservaCandidateId === invitacion.candidateId)
    );
    if (slotDoc && slotVinculado) {
      escrituras.unshift(
        escritura(slotDoc, 'slots_visita', {
          disponible: true,
          reservaCandidateId: null,
          reservaCandidateNombre: null,
          reservaInvitationId: null,
        })
      );
    }

    const candidateId = String(invitacion.candidateId || '');
    let candidatoDoc: DocumentoLeido | null = null;
    if (candidateId) {
      candidatoDoc = await deps.puerto.leerDocumento(`candidatos/${encodeURIComponent(candidateId)}`);
      if (candidatoDoc) {
        escrituras.push(escritura(candidatoDoc, 'candidatos', { estado: 'preseleccionado' }));
      }
    }

    const resultado = await deps.puerto.escribirAtomico(escrituras);
    if (resultado === 'CONFLICTO') {
      throw new ErrorPortalPublico('CONFLICTO', 409, 'CANCELACION_CONFLICTO');
    }

    return {
      invitacion: { ...invitacion, status: 'ABIERTO', canceledAt: canceladaEn, reserva: undefined },
      slot: slotDoc ? { ...sanearSlot(slotDoc), ...(slotVinculado ? { disponible: true } : {}) } : null,
      candidatoEstado: candidatoDoc ? 'preseleccionado' : null,
    };
  }

  // -------------------------------------------------------------------------
  // Cuestionario
  // -------------------------------------------------------------------------

  async function localizarCandidato(token: string): Promise<DocumentoLeido | null> {
    return localizarPorToken('candidatos', 'cuestionarioToken', token);
  }

  async function obtenerCuestionario(tokenEntrada: string) {
    const token = exigirToken(tokenEntrada);
    const candidatoDoc = await localizarCandidato(token);
    if (!candidatoDoc) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'CANDIDATO_NO_ENCONTRADO');
    return { candidato: sanearCandidatoPublico(candidatoDoc) };
  }

  function validarCotitular(valor: unknown): Record<string, unknown> | undefined {
    if (valor === undefined || valor === null) return undefined;
    if (typeof valor !== 'object' || Array.isArray(valor)) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_cotitular');
    }
    const c = valor as Record<string, unknown>;
    const salida: Record<string, unknown> = {
      nombre: texto(c.nombre, 'cotitular.nombre', 200),
    };
    if (c.telefono !== undefined) salida.telefono = texto(c.telefono, 'cotitular.telefono', 40, false);
    if (c.email !== undefined) salida.email = texto(c.email, 'cotitular.email', 200, false);
    if (c.tipoEmpleo !== undefined) salida.tipoEmpleo = unoDe(c.tipoEmpleo, TIPOS_EMPLEO, 'cotitular.tipoEmpleo');
    if (c.empresa !== undefined) salida.empresa = texto(c.empresa, 'cotitular.empresa', 200, false);
    if (c.tipoContrato !== undefined) salida.tipoContrato = unoDe(c.tipoContrato, TIPOS_CONTRATO, 'cotitular.tipoContrato');
    if (c.antiguedadLaboral !== undefined) {
      salida.antiguedadLaboral = texto(c.antiguedadLaboral, 'cotitular.antiguedadLaboral', 120);
    }
    if (c.ingresosNetos !== undefined) salida.ingresosNetos = numero(c.ingresosNetos, 'cotitular.ingresosNetos', 0, 10_000_000);
    if (c.otrosIngresos !== undefined) salida.otrosIngresos = numero(c.otrosIngresos, 'cotitular.otrosIngresos', 0, 10_000_000);
    if (c.descripcionOtrosIngresos !== undefined) {
      salida.descripcionOtrosIngresos = texto(c.descripcionOtrosIngresos, 'cotitular.descripcionOtrosIngresos', 500, false);
    }
    return salida;
  }

  function validarDatosCandidato(datosEntrada: unknown): Record<string, unknown> {
    const d = objeto(datosEntrada, 'datos');
    const salida: Record<string, unknown> = {
      nombre: texto(d.nombre, 'nombre', 200),
      telefono: texto(d.telefono, 'telefono', 40, false),
      email: texto(d.email, 'email', 200, false),
      tipoEmpleo: unoDe(d.tipoEmpleo, TIPOS_EMPLEO, 'tipoEmpleo', 'cuenta_ajena'),
      tipoContrato: unoDe(d.tipoContrato, TIPOS_CONTRATO, 'tipoContrato', 'indefinido'),
      antiguedadLaboral: texto(d.antiguedadLaboral, 'antiguedadLaboral', 120, false) || 'No especificada',
      numPersonas: entero(d.numPersonas, 'numPersonas', 1, 50),
      ingresosNetos: numero(d.ingresosNetos, 'ingresosNetos', 0, 10_000_000),
      otrosIngresos: d.otrosIngresos === undefined ? 0 : numero(d.otrosIngresos, 'otrosIngresos', 0, 10_000_000),
      descripcionOtrosIngresos: texto(d.descripcionOtrosIngresos, 'descripcionOtrosIngresos', 500, false),
      avalista: booleano(d.avalista, 'avalista'),
    };
    if (d.numTitularesContrato !== undefined) {
      salida.numTitularesContrato = entero(d.numTitularesContrato, 'numTitularesContrato', 1, 2);
    }
    const cotitular = validarCotitular(d.cotitular);
    if (cotitular) salida.cotitular = cotitular;
    return salida;
  }

  function validarRespuestas(valor: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(valor) || valor.length === 0 || valor.length > 20) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_respuestas');
    }
    return valor.map((r, indice) => {
      const item = objeto(r, `respuestas[${indice}]`);
      const salida: Record<string, unknown> = {
        preguntaId: texto(item.preguntaId, `respuestas[${indice}].preguntaId`, 60),
        preguntaTitulo: texto(item.preguntaTitulo, `respuestas[${indice}].preguntaTitulo`, 200, false),
        preguntaTexto: texto(item.preguntaTexto, `respuestas[${indice}].preguntaTexto`, 400, false),
      };
      if (item.opcionSeleccionadaId !== undefined) {
        salida.opcionSeleccionadaId = unoDe(item.opcionSeleccionadaId, new Set(['A', 'B', 'C', 'D']), 'opcionSeleccionadaId');
      }
      if (item.opcionSeleccionadaTexto !== undefined) {
        salida.opcionSeleccionadaTexto = texto(item.opcionSeleccionadaTexto, 'opcionSeleccionadaTexto', 300, false);
      }
      if (item.respuestaTextoLibre !== undefined) {
        salida.respuestaTextoLibre = texto(item.respuestaTextoLibre, 'respuestaTextoLibre', 2000, false);
      }
      if (item.esAbierta !== undefined) salida.esAbierta = booleano(item.esAbierta, 'esAbierta');
      return salida;
    });
  }

  async function guardarCuestionario(tokenEntrada: string, entrada: EntradaCuestionarioPublico) {
    const token = exigirToken(tokenEntrada);
    const candidatoDoc = await localizarCandidato(token);
    if (!candidatoDoc) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'CANDIDATO_NO_ENCONTRADO');

    const datos = validarDatosCandidato(entrada?.datos);
    const respuestas = validarRespuestas(entrada?.respuestas);
    const informacionAdicional = texto(entrada?.informacionAdicional, 'informacionAdicional', 4000, false);

    const previo = candidatoDoc.datos.cuestionarioIncidencias;
    const previoObjeto = previo && typeof previo === 'object' && !Array.isArray(previo)
      ? (previo as Record<string, unknown>)
      : {};
    const cuestionario: Record<string, unknown> = {
      ...previoObjeto,
      completado: true,
      fechaCompletado: isoAhora(),
      numRespuestas: respuestas.length,
      totalPreguntas: 12,
      respuestas,
      informacionAdicional,
    };
    // El análisis de IA existente no se destruye con un reenvío del formulario.
    delete cuestionario.analisisIa;
    if (previoObjeto.analisisIa !== undefined) cuestionario.analisisIa = previoObjeto.analisisIa;

    const actualizacion = { ...datos, estado: 'analizado', cuestionarioIncidencias: cuestionario };
    const resultado = await deps.puerto.escribirAtomico([
      escritura(candidatoDoc, 'candidatos', actualizacion),
    ]);
    if (resultado === 'CONFLICTO') {
      throw new ErrorPortalPublico('CONFLICTO', 409, 'CUESTIONARIO_CONFLICTO');
    }

    return {
      candidato: sanearCandidatoPublico({
        ...candidatoDoc,
        datos: { ...candidatoDoc.datos, ...actualizacion },
      }),
    };
  }

  // -------------------------------------------------------------------------
  // Documentación post-visita
  // -------------------------------------------------------------------------

  async function localizarSolicitudDoc(token: string): Promise<DocumentoLeido | null> {
    return localizarPorToken('solicitudes_documentacion', 'token', token);
  }

  async function obtenerDocumentacion(tokenEntrada: string) {
    const token = exigirToken(tokenEntrada);
    const solicitudDoc = await localizarSolicitudDoc(token);
    if (!solicitudDoc) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'SOLICITUD_NO_ENCONTRADA');
    return { solicitud: sanearSolicitudDocumentacion(solicitudDoc) };
  }

  function sanearArchivoEntrante(valor: unknown, solicitudId: string): Record<string, unknown> {
    const a = objeto(valor, 'archivo');
    const id = texto(a.id, 'archivo.id', 200);
    const nombreArchivo = texto(a.nombreArchivo, 'archivo.nombreArchivo', 255);
    const mimeType = texto(a.mimeType, 'archivo.mimeType', 150);
    const url = texto(a.url, 'archivo.url', 1000);
    const storagePath = texto(a.storagePath, 'archivo.storagePath', 500);
    if (!urlStorageValida(url)) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_archivo.url');
    }
    if (!rutaStorageValida(storagePath, solicitudId)) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_archivo.storagePath');
    }
    if (a.base64Data !== undefined) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_archivo.base64Data');
    }
    const tamañoBytes = entero(a.tamañoBytes, 'archivo.tamañoBytes', 1, MAX_BYTES_ARCHIVO);
    return { id, nombreArchivo, mimeType, url, storagePath, tamañoBytes, fechaSubida: isoAhora() };
  }

  function mismoConjuntoDeArchivos(actuales: unknown, entrantes: unknown): boolean {
    const ids = (valor: unknown) => (Array.isArray(valor)
      ? valor.map((a) => (a && typeof a === 'object' ? String((a as Record<string, unknown>).id || '') : '')).sort().join('|')
      : '');
    return ids(actuales) === ids(entrantes);
  }

  function calcularEstadoSolicitud(
    documentos: Array<Record<string, unknown>>,
    estadoActual: unknown,
    final: boolean
  ): string {
    const allUploaded = documentos.every(
      (d) => (Array.isArray(d.archivos) && d.archivos.length > 0) || d.obligatorio !== true
    );
    if (final) return allUploaded ? 'COMPLETADA' : 'PARCIALMENTE_APORTADA';
    if (estadoActual === 'BORRADOR' || estadoActual === 'SOLICITADA' || estadoActual === undefined) {
      return 'PARCIALMENTE_APORTADA';
    }
    return String(estadoActual);
  }

  async function actualizarDocumentacion(tokenEntrada: string, entrada: EntradaDocumentacionPublica) {
    const token = exigirToken(tokenEntrada);
    const solicitudDoc = await localizarSolicitudDoc(token);
    if (!solicitudDoc) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'SOLICITUD_NO_ENCONTRADA');

    const final = booleano(entrada?.final, 'final');
    if (!Array.isArray(entrada?.documentos) || entrada.documentos.length > MAX_DOCUMENTOS) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_documentos');
    }

    const existentes = Array.isArray(solicitudDoc.datos.documentos)
      ? solicitudDoc.datos.documentos.filter((d) => d && typeof d === 'object' && !Array.isArray(d)) as Array<Record<string, unknown>>
      : [];
    const entrantesPorId = new Map<string, Record<string, unknown>>();
    for (const bruto of entrada.documentos) {
      const item = objeto(bruto, 'documento');
      const id = texto(item.id, 'documento.id', 200);
      if (!entrantesPorId.has(id)) entrantesPorId.set(id, item);
    }

    // Solo se actualizan los items que la solicitud ya define; el candidato no
    // puede inventar documentación ni cambiar su nombre, tipo u obligatoriedad.
    const documentos = existentes.slice(0, MAX_DOCUMENTOS).map((existente) => {
      const entrante = entrantesPorId.get(String(existente.id));
      if (!entrante) return sanearItemDocumento(existente);
      if (mismoConjuntoDeArchivos(existente.archivos, entrante.archivos)) {
        return sanearItemDocumento(existente);
      }
      if (!Array.isArray(entrante.archivos) || entrante.archivos.length > MAX_ARCHIVOS_POR_ITEM) {
        throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_archivos');
      }
      const archivos = entrante.archivos.map((a) => sanearArchivoEntrante(a, solicitudDoc.id));
      const item = sanearItemDocumento(existente);
      item.archivos = archivos;
      item.estado = archivos.length > 0 ? 'subido' : 'pendiente';
      item.fechaSubida = isoAhora();
      delete item.motivoCorreccion;
      return item;
    });

    const estado = calcularEstadoSolicitud(documentos, solicitudDoc.datos.estado, final);
    const historialPrevio = Array.isArray(solicitudDoc.datos.historial)
      ? solicitudDoc.datos.historial.filter((h) => h && typeof h === 'object' && !Array.isArray(h))
      : [];
    const historial = [
      ...historialPrevio,
      {
        id: `h-${ahora().getTime()}-${Math.random().toString(36).substring(2, 8)}`,
        fecha: ahora().toLocaleString('es-ES'),
        autor: 'candidato',
        accion: final ? 'Documentación enviada' : 'Documentos actualizados',
        detalle: final
          ? 'El candidato finalizó y envió la documentación para su revisión'
          : 'El candidato aportó o modificó archivos adjuntos',
      },
    ].slice(-MAX_HISTORIAL);

    const actualizacion: Record<string, unknown> = {
      documentos,
      estado,
      historial,
      fechaUltimaActividad: isoAhora(),
    };
    if (final) actualizacion.fechaEnvioCandidato = isoAhora();

    const resultado = await deps.puerto.escribirAtomico([
      escritura(solicitudDoc, 'solicitudes_documentacion', actualizacion),
    ]);
    if (resultado === 'CONFLICTO') {
      throw new ErrorPortalPublico('CONFLICTO', 409, 'DOCUMENTACION_CONFLICTO');
    }

    return {
      solicitud: sanearSolicitudDocumentacion({
        ...solicitudDoc,
        datos: { ...solicitudDoc.datos, ...actualizacion },
      }),
    };
  }


  // -------------------------------------------------------------------------
  // P0.2.1 — ALTA PÚBLICA DE SOLICITUD (por token, SOLO en servidor)
  // -------------------------------------------------------------------------
  // El anónimo YA NO escribe en `solicitudes` ni en `candidatos`: las reglas
  // se lo deniegan (P0.2.2) y aquí se construye el documento con valores
  // controlados por el servidor. El cliente solo aporta el formulario.
  // -------------------------------------------------------------------------

  /** Copia recursiva con límites: evita payloads profundos o gigantes. */
  function jsonSeguro(valor: unknown, profundidad = 0, estadoNodos = { n: 0 }): unknown {
    if (profundidad > 6 || estadoNodos.n > 800) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CUERPO_DEMASIADO_COMPLEJO');
    }
    estadoNodos.n += 1;
    if (valor === null || typeof valor === 'boolean') return valor;
    if (typeof valor === 'number') {
      if (!Number.isFinite(valor)) throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'NUMERO_INVALIDO');
      return valor;
    }
    if (typeof valor === 'string') return valor.slice(0, 2000);
    if (Array.isArray(valor)) {
      if (valor.length > 60) throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'ARRAY_LARGO');
      return valor.map((v) => jsonSeguro(v, profundidad + 1, estadoNodos));
    }
    if (valor && typeof valor === 'object') {
      const claves = Object.keys(valor as Record<string, unknown>).slice(0, 60);
      const salida: Record<string, unknown> = {};
      for (const clave of claves) {
        if (clave.startsWith('$') || clave.includes('.')) continue;
        salida[clave] = jsonSeguro((valor as Record<string, unknown>)[clave], profundidad + 1, estadoNodos);
      }
      return salida;
    }
    return undefined;
  }

  /**
   * H-06 — Resolución del enlace de solicitud CON verificación de capacidad.
   * ---------------------------------------------------------------------------
   * Antes bastaba con que existiera `fichas_publicas_inmueble/<id>`: el token
   * era el id del inmueble, así que conocerlo (o adivinarlo) daba derecho a dar
   * de alta solicitudes y candidatos en esa cartera sin haber recibido enlace.
   *
   * Ahora el token `sol-<id>-t<secreto>` se contrasta con
   * `inmuebles/<id>.tokenSolicitud`, un documento privado que solo se lee con la
   * credencial de servicio (el navegador no puede consultarlo). Los enlaces
   * heredados `sol-<id>` dejan de valer tras la ventana de compatibilidad
   * declarada en el módulo compartido.
   *
   * Todos los fallos responden lo mismo (404 ENLACE_DESCONOCIDO) salvo el
   * caducado, que se distingue para poder avisar al candidato: así no se filtra
   * si un inmueble existe, está disponible o simplemente no autoriza.
   */
  async function resolverFichaParaSolicitud(token: string): Promise<Record<string, unknown>> {
    const analizado = analizarTokenSolicitud(token);
    if (!analizado) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'TOKEN_INVALIDO');

    const propiedad = await deps.puerto.leerDocumento(
      `inmuebles/${encodeURIComponent(analizado.inmuebleId)}`
    );
    if (!propiedad) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'ENLACE_DESCONOCIDO');

    const veredicto = verificarTokenContraPropiedad(
      token,
      propiedad.datos,
      isoAhora(),
      FECHA_CORTE_ENLACES_LEGADOS
    );
    if (veredicto === 'LEGADO_CADUCADO') {
      throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'ENLACE_CADUCADO');
    }
    if (veredicto !== 'OK') {
      throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'ENLACE_DESCONOCIDO');
    }

    const ficha = await leerFichaPublica(analizado.inmuebleId);
    if (!ficha) throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'ENLACE_DESCONOCIDO');
    if (typeof ficha.inmuebleId !== 'string' || ficha.inmuebleId.trim() === '') {
      throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'ENLACE_DESCONOCIDO');
    }
    // Solo se admiten altas sobre fichas publicadas como disponibles.
    if (ficha.estado !== undefined && ficha.estado !== 'disponible') {
      throw new ErrorPortalPublico('ENLACE_NO_VALIDO', 404, 'INMUEBLE_NO_DISPONIBLE');
    }
    return ficha;
  }

  async function crearSolicitud(
    tokenEntrada: string,
    entrada: EntradaSolicitudPublica
  ): Promise<ResultadoSolicitudPublica> {
    const token = exigirToken(tokenEntrada);
    const ficha = await resolverFichaParaSolicitud(token);
    const fuente = objeto(entrada.solicitud, 'solicitud');

    // Identidad: siempre del formulario, nunca de caminos alternativos.
    const nombre = texto(fuente.candidatoNombre, 'NOMBRE', 120);
    const email = texto(fuente.candidatoEmail, 'EMAIL', 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_EMAIL_FORMATO');
    }
    const telefono = texto(fuente.candidatoTelefono, 'TELEFONO', 30);
    if (!booleano(fuente.consentimientoAceptado ?? false, 'CONSENTIMIENTO')) {
      throw new ErrorPortalPublico('PETICION_INVALIDA', 400, 'CAMPO_CONSENTIMIENTO');
    }

    const inmuebleId = String(ficha.inmuebleId);
    const ahoraIso = isoAhora();
    const sufijo = randomBytes(12).toString('hex');
    const solicitudId = `sol-${ahora().getTime()}-${sufijo}`;
    const candidatoId = `cand-${ahora().getTime()}-${sufijo}`;
    const cuestionarioCompletado = fuente.cuestionarioCompletado === true;
    const documentosCompletados = fuente.documentosCompletados === true;

    const solDoc: Record<string, unknown> = {
      // Campos controlados por el SERVIDOR.
      id: solicitudId,
      token: `sol-${inmuebleId}-${sufijo.slice(0, 8)}`,
      inmuebleId,
      inmuebleNombre: typeof ficha.direccion === 'string' ? ficha.direccion.slice(0, 200) : inmuebleId,
      inmueblePrecio: typeof ficha.precio === 'number' ? ficha.precio : 0,
      inmuebleCiudad: typeof ficha.ciudad === 'string' ? ficha.ciudad.slice(0, 120) : '',
      propietarioId: typeof ficha.propietarioId === 'string' ? ficha.propietarioId : '',
      ownerId: typeof ficha.propietarioId === 'string' ? ficha.propietarioId : '',
      candidatoId,
      estado: cuestionarioCompletado ? 'CUESTIONARIO COMPLETADO' : 'NUEVA',
      fechaCreacion: ahoraIso.slice(0, 10),
      fechaActualizacion: ahoraIso,
      fechaConsentimiento: ahoraIso,
      // Alias canónicos exigidos históricamente por las reglas (paridad AG-01).
      nombre,
      email,
      telefono,
      candidatoNombre: nombre,
      candidatoEmail: email,
      candidatoTelefono: telefono,
      consentimientoAceptado: true,
      cuestionarioCompletado,
      documentosCompletados,
      historial: [{
        id: `h-${sufijo}`,
        fecha: ahoraIso,
        accion: 'Solicitud recibida',
        detalle: 'Alta pública verificada por el servidor mediante enlace de capacidad.',
      }],
    };

    const escalaresTexto = [
      'fechaEntradaAproximada', 'duracionPrevista', 'detallesMascotas', 'empresa', 'puesto',
      'antiguedadLaboral', 'descripcionOtrosIngresos', 'detallesAvalista',
    ] as const;
    for (const campo of escalaresTexto) {
      if (fuente[campo] !== undefined) {
        solDoc[campo] = typeof fuente[campo] === 'string'
          ? texto(fuente[campo], campo.toUpperCase(), 400, false)
          : jsonSeguro(fuente[campo]);
      }
    }
    for (const campo of ['situacionLaboral', 'tipoContrato'] as const) {
      if (typeof fuente[campo] === 'string' && fuente[campo].length <= 60) solDoc[campo] = fuente[campo];
    }
    for (const campo of [
      'numAdultos', 'numMenores', 'numTotalPersonas', 'ingresosNetosMensuales',
      'otrosIngresos', 'scoreSolvencia', 'perfilOperativo',
    ] as const) {
      if (fuente[campo] !== undefined) solDoc[campo] = numero(fuente[campo], campo.toUpperCase(), 0, 1_000_000);
    }
    for (const campo of ['tieneMascotas', 'esFumador', 'tieneAvalista'] as const) {
      if (fuente[campo] !== undefined) solDoc[campo] = booleano(fuente[campo], campo.toUpperCase());
    }
    for (const campo of ['cuestionarioData', 'documentos'] as const) {
      if (fuente[campo] !== undefined) solDoc[campo] = jsonSeguro(fuente[campo]);
    }

    const candDoc: Record<string, unknown> = {
      id: candidatoId,
      nombre,
      email,
      telefono,
      inmuebleId,
      inmuebleNombre: solDoc.inmuebleNombre,
      propietarioId: solDoc.propietarioId,
      estado: 'nuevo',
      fechaCreacion: ahoraIso.slice(0, 10),
      numPersonas: solDoc.numTotalPersonas ?? 1,
      ingresosNetos: solDoc.ingresosNetosMensuales ?? 0,
      tipoEmpleo: solDoc.situacionLaboral ?? 'cuenta_ajena',
      tipoContrato: solDoc.tipoContrato ?? 'no_aplica',
      antiguedadLaboral: solDoc.antiguedadLaboral ?? '',
      otrosIngresos: solDoc.otrosIngresos ?? 0,
      avalista: solDoc.tieneAvalista ?? false,
      observaciones: '',
      documentos: solDoc.documentos ?? [],
      // Token de capacidad para el cuestionario; 128 bits, no deducible del id.
      cuestionarioToken: `q-${randomBytes(16).toString('hex')}`,
    };

    const resultado = await deps.puerto.escribirAtomico([
      { coleccion: 'solicitudes', id: solicitudId, datos: solDoc, precondicion: { tipo: 'NO_EXISTE' } },
      { coleccion: 'candidatos', id: candidatoId, datos: candDoc, precondicion: { tipo: 'NO_EXISTE' } },
    ]);
    if (resultado === 'CONFLICTO') {
      throw new ErrorPortalPublico('CONFLICTO', 409, 'SOLICITUD_DUPLICADA');
    }
    // La respuesta NO devuelve el expediente completo: solo un acuse mínimo.
    return {
      candidatoId,
      solicitud: {
        id: solicitudId,
        token: solDoc.token,
        estado: solDoc.estado,
        inmuebleId,
        inmuebleNombre: solDoc.inmuebleNombre,
        candidatoNombre: nombre,
        candidatoEmail: email,
        candidatoTelefono: telefono,
        candidatoId,
        nombre,
        email,
        telefono,
        fechaCreacion: solDoc.fechaCreacion,
        fechaActualizacion: solDoc.fechaActualizacion,
        fechaConsentimiento: solDoc.fechaConsentimiento,
        consentimientoAceptado: true,
        cuestionarioCompletado,
        documentosCompletados,
        historial: solDoc.historial,
        ...(solDoc.numAdultos !== undefined ? { numAdultos: solDoc.numAdultos } : {}),
        ...(solDoc.numMenores !== undefined ? { numMenores: solDoc.numMenores } : {}),
        ...(solDoc.numTotalPersonas !== undefined ? { numTotalPersonas: solDoc.numTotalPersonas } : {}),
        ...(solDoc.fechaEntradaAproximada !== undefined ? { fechaEntradaAproximada: solDoc.fechaEntradaAproximada } : {}),
        ...(solDoc.duracionPrevista !== undefined ? { duracionPrevista: solDoc.duracionPrevista } : {}),
        ...(solDoc.situacionLaboral !== undefined ? { situacionLaboral: solDoc.situacionLaboral } : {}),
        ...(solDoc.tipoContrato !== undefined ? { tipoContrato: solDoc.tipoContrato } : {}),
        ...(solDoc.antiguedadLaboral !== undefined ? { antiguedadLaboral: solDoc.antiguedadLaboral } : {}),
        ...(solDoc.ingresosNetosMensuales !== undefined ? { ingresosNetosMensuales: solDoc.ingresosNetosMensuales } : {}),
        ...(solDoc.otrosIngresos !== undefined ? { otrosIngresos: solDoc.otrosIngresos } : {}),
        ...(solDoc.tieneMascotas !== undefined ? { tieneMascotas: solDoc.tieneMascotas } : {}),
        ...(solDoc.esFumador !== undefined ? { esFumador: solDoc.esFumador } : {}),
        ...(solDoc.tieneAvalista !== undefined ? { tieneAvalista: solDoc.tieneAvalista } : {}),
        ...(solDoc.cuestionarioData !== undefined ? { cuestionarioData: solDoc.cuestionarioData } : {}),
        ...(solDoc.documentos !== undefined ? { documentos: solDoc.documentos } : {}),
        ...(solDoc.scoreSolvencia !== undefined ? { scoreSolvencia: solDoc.scoreSolvencia } : {}),
      },
    };
  }

  return {
    obtenerVisita,
    reservarVisita,
    cancelarVisita,
    obtenerCuestionario,
    guardarCuestionario,
    obtenerDocumentacion,
    actualizarDocumentacion,
    crearSolicitud,
  };
}

export type ServicioPortalPublico = ReturnType<typeof crearServicioPortalPublico>;
