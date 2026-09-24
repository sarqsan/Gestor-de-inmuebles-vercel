/**
 * BLOQUE E — Persistencia de suministros, lecturas, cambios de titular y
 * mensajes del portal + índices de capacidad + invitaciones de inquilino.
 *
 * Notas de diseño:
 * - Las lecturas son INMUTABLES: solo se expone creación (las reglas niegan
 *   update/delete). No existe `updateLectura`.
 * - El inquilino no lista colecciones (reglas): descubre IDs hijo mediante
 *   los índices del contrato/suministro y lee por get() directo.
 * - Subidas a Storage SIEMPRE directas y privadas (nunca base64, nunca el
 *   endpoint efímero /api/documents).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  query,
  where,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, saveAuditLogFirestore } from './firebase';
import type {
  Suministro,
  LecturaSuministro,
  CambioTitularSuministro,
  MensajePortal,
  ContratoFormalizacion,
  Inmueble,
  Incidencia,
  EnlaceRegistro,
  TipoSuministro,
  ModoRepartoSuministro,
  TramoRepartoSuministro,
} from '../types';

export const SUMINISTROS_COL = collection(db, 'suministros');
export const LECTURAS_COL = collection(db, 'lecturas_suministro');
export const CAMBIOS_COL = collection(db, 'cambios_titular');
export const MENSAJES_COL = collection(db, 'mensajes_portal');

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ahoraIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Lectura por get() directo (descubrimiento por índices)
// ---------------------------------------------------------------------------

async function getById<T>(coleccion: string, id: string): Promise<T | null> {
  try {
    const snap = await getDoc(doc(db, coleccion, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as T;
  } catch {
    return null;
  }
}

export const getContratoById = (id: string) => getById<ContratoFormalizacion>('contratos_formalizacion', id);
export const getInmuebleById = (id: string) => getById<Inmueble>('inmuebles', id);
export const getIncidenciaById = (id: string) => getById<Incidencia>('incidencias', id);
export const getSuministroById = (id: string) => getById<Suministro>('suministros', id);
export const getLecturaById = (id: string) => getById<LecturaSuministro>('lecturas_suministro', id);
export const getCambioById = (id: string) => getById<CambioTitularSuministro>('cambios_titular', id);
export const getMensajeById = (id: string) => getById<MensajePortal>('mensajes_portal', id);
export const getEnlaceById = (id: string) => getById<EnlaceRegistro>('enlaces_registro', id);

async function getByIds<T>(coleccion: string, ids: string[] | undefined | null): Promise<T[]> {
  if (!ids || ids.length === 0) return [];
  const unicos = Array.from(new Set(ids));
  const resultados = await Promise.all(unicos.map((id) => getById<T>(coleccion, id)));
  return resultados.filter((r: T | null): r is T => r !== null);
}

export const getIncidenciasByIds = (ids: string[]) => getByIds<Incidencia>('incidencias', ids);
export const getMensajesByIds = (ids: string[]) => getByIds<MensajePortal>('mensajes_portal', ids);
export const getSuministrosByIds = (ids: string[]) => getByIds<Suministro>('suministros', ids);
export const getLecturasByIds = (ids: string[]) => getByIds<LecturaSuministro>('lecturas_suministro', ids);
export const getCambiosByIds = (ids: string[]) => getByIds<CambioTitularSuministro>('cambios_titular', ids);

// ---------------------------------------------------------------------------
// Suscripciones de gestión (personal; el inquilino usa get por índices)
// ---------------------------------------------------------------------------

function subscribeCol<T>(coleccion: string, cb: (items: T[]) => void): Unsubscribe {
  return onSnapshot(
    collection(db, coleccion),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
    () => cb([])
  );
}

export const subscribeSuministros = (cb: (items: Suministro[]) => void) => subscribeCol<Suministro>('suministros', cb);
export const subscribeLecturas = (cb: (items: LecturaSuministro[]) => void) => subscribeCol<LecturaSuministro>('lecturas_suministro', cb);
export const subscribeCambiosTitular = (cb: (items: CambioTitularSuministro[]) => void) => subscribeCol<CambioTitularSuministro>('cambios_titular', cb);
export const subscribeMensajesPortal = (cb: (items: MensajePortal[]) => void) => subscribeCol<MensajePortal>('mensajes_portal', cb);

export function subscribeMensajesByContrato(contratoId: string, cb: (items: MensajePortal[]) => void): Unsubscribe {
  const q = query(MENSAJES_COL, where('contratoId', '==', contratoId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MensajePortal);
      items.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
      cb(items);
    },
    () => cb([])
  );
}

export function subscribeLecturasBySuministro(suministroId: string, cb: (items: LecturaSuministro[]) => void): Unsubscribe {
  const q = query(LECTURAS_COL, where('suministroId', '==', suministroId));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as LecturaSuministro);
      items.sort((a, b) => (a.fechaLectura < b.fechaLectura ? -1 : a.fechaLectura > b.fechaLectura ? 1 : 0));
      cb(items);
    },
    () => cb([])
  );
}

// ---------------------------------------------------------------------------
// Suministros (alta y mantenimiento: personal)
// ---------------------------------------------------------------------------

export interface DatosNuevoSuministro {
  inmuebleId: string;
  tipo: TipoSuministro;
  cups?: string;
  numeroContador?: string;
  titularNombre?: string;
  titularNif?: string;
  comercializadora?: string;
  tarifa?: string;
  potenciaContratadaKw?: number;
  modoReparto?: ModoRepartoSuministro;
  reparto?: TramoRepartoSuministro[];
  observaciones?: string;
  createdByUid?: string;
  createdByEmail?: string;
}

export async function crearSuministro(d: DatosNuevoSuministro): Promise<Suministro> {
  const ahora = ahoraIso();
  const suministro: Suministro = {
    id: uid('sum'),
    inmuebleId: d.inmuebleId,
    tipo: d.tipo,
    cups: d.cups?.trim() || undefined,
    numeroContador: d.numeroContador?.trim() || undefined,
    titularNombre: d.titularNombre?.trim() || undefined,
    titularNif: d.titularNif?.trim() || undefined,
    comercializadora: d.comercializadora?.trim() || undefined,
    tarifa: d.tarifa?.trim() || undefined,
    potenciaContratadaKw: d.potenciaContratadaKw,
    modoReparto: d.modoReparto || 'SIN_REPARTO',
    reparto: d.reparto,
    activo: true,
    lecturaIds: [],
    cambioTitularIds: [],
    observaciones: d.observaciones?.trim() || undefined,
    createdByUid: d.createdByUid,
    createdByEmail: d.createdByEmail,
    fechaAlta: ahora,
    fechaActualizacion: ahora,
  };
  await setDoc(doc(db, 'suministros', suministro.id), suministro);
  // Índice en el inmueble (autodescubrimiento)
  await updateDoc(doc(db, 'inmuebles', d.inmuebleId), {
    suministroIds: arrayUnion(suministro.id),
  });
  return suministro;
}

export async function actualizarSuministro(
  id: string,
  cambios: Partial<Suministro>
): Promise<void> {
  const { id: _omit, ...resto } = cambios;
  await updateDoc(doc(db, 'suministros', id), {
    ...resto,
    fechaActualizacion: ahoraIso(),
  });
}

export async function eliminarSuministro(id: string, inmuebleId: string): Promise<void> {
  await deleteDoc(doc(db, 'suministros', id));
  await updateDoc(doc(db, 'inmuebles', inmuebleId), {
    suministroIds: arrayRemove(id),
  });
}

// ---------------------------------------------------------------------------
// Lecturas (INMUTABLES: creación + índice; sin update/delete)
// ---------------------------------------------------------------------------

export interface DatosNuevaLectura {
  /** ID prefijado (para subir la foto antes de crear la lectura inmutable). */
  id?: string;
  suministroId: string;
  inmuebleId: string;
  contratoId?: string; // visible para el inquilino de ese contrato
  valor: number;
  unidad: string;
  fechaLectura: string;
  origen: LecturaSuministro['origen'];
  registradoPorUid?: string;
  registradoPorEmail?: string;
  registradoPorNombre?: string;
  fotoStoragePath?: string;
  corrigeLecturaId?: string;
  observaciones?: string;
}

export async function registrarLectura(d: DatosNuevaLectura): Promise<LecturaSuministro> {
  const lectura: LecturaSuministro = {
    id: d.id || uid('lec'),
    suministroId: d.suministroId,
    inmuebleId: d.inmuebleId,
    contratoId: d.contratoId,
    valor: d.valor,
    unidad: d.unidad,
    fechaLectura: d.fechaLectura,
    origen: d.origen,
    registradoPorUid: d.registradoPorUid,
    registradoPorEmail: d.registradoPorEmail,
    registradoPorNombre: d.registradoPorNombre,
    fotoStoragePath: d.fotoStoragePath,
    corrigeLecturaId: d.corrigeLecturaId,
    observaciones: d.observaciones?.trim() || undefined,
    createdAt: ahoraIso(),
  };
  await setDoc(doc(db, 'lecturas_suministro', lectura.id), lectura);
  await vincularLecturaASuministro(d.suministroId, lectura.id);
  return lectura;
}

/** Añade la lectura al índice del suministro (única escritura permitida al inquilino). */
export async function vincularLecturaASuministro(suministroId: string, lecturaId: string): Promise<void> {
  await updateDoc(doc(db, 'suministros', suministroId), {
    lecturaIds: arrayUnion(lecturaId),
    fechaActualizacion: ahoraIso(),
  });
}

// ---------------------------------------------------------------------------
// Cambios de titular (solicita inquilino/personal; resuelve personal)
// ---------------------------------------------------------------------------

export interface DatosNuevoCambio {
  suministroId: string;
  inmuebleId: string;
  contratoId?: string;
  titularAnteriorNombre?: string;
  titularNuevoNombre: string;
  titularNuevoNif?: string;
  titularNuevoTelefono?: string;
  titularNuevoEmail?: string;
  fechaEfecto: string;
  solicitadoPorUid?: string;
  solicitadoPorEmail?: string;
}

export async function solicitarCambioTitular(d: DatosNuevoCambio): Promise<CambioTitularSuministro> {
  const ahora = ahoraIso();
  const cambio: CambioTitularSuministro = {
    id: uid('ctit'),
    suministroId: d.suministroId,
    inmuebleId: d.inmuebleId,
    contratoId: d.contratoId,
    titularAnteriorNombre: d.titularAnteriorNombre,
    titularNuevoNombre: d.titularNuevoNombre.trim(),
    titularNuevoNif: d.titularNuevoNif?.trim() || undefined,
    titularNuevoTelefono: d.titularNuevoTelefono?.trim() || undefined,
    titularNuevoEmail: d.titularNuevoEmail?.trim().toLowerCase() || undefined,
    fechaEfecto: d.fechaEfecto,
    estado: 'SOLICITADO',
    solicitadoPorUid: d.solicitadoPorUid,
    solicitadoPorEmail: d.solicitadoPorEmail,
    createdAt: ahora,
    fechaActualizacion: ahora,
  };
  await setDoc(doc(db, 'cambios_titular', cambio.id), cambio);
  await vincularCambioASuministro(d.suministroId, cambio.id);
  return cambio;
}

export async function vincularCambioASuministro(suministroId: string, cambioId: string): Promise<void> {
  await updateDoc(doc(db, 'suministros', suministroId), {
    cambioTitularIds: arrayUnion(cambioId),
    fechaActualizacion: ahoraIso(),
  });
}

/** Resolución por parte de gestión (confirmar/rechazar). Solo personal (reglas). */
export async function resolverCambioTitular(
  cambioId: string,
  decision: 'CONFIRMADO' | 'RECHAZADO',
  gestionadoPorUid: string,
  motivoRechazo?: string
): Promise<void> {
  await updateDoc(doc(db, 'cambios_titular', cambioId), {
    estado: decision,
    motivoRechazo: decision === 'RECHAZADO' ? motivoRechazo?.trim() || 'Sin motivo indicado' : null,
    gestionadoPorUid,
    fechaActualizacion: ahoraIso(),
  });
}

// ---------------------------------------------------------------------------
// Mensajes del portal (hilo por contrato, sin borrado)
// ---------------------------------------------------------------------------

export interface DatosNuevoMensaje {
  contratoId: string;
  inmuebleId: string;
  remitenteUid: string;
  remitenteNombre: string;
  remitenteRol: MensajePortal['remitenteRol'];
  texto: string;
}

export async function enviarMensajePortal(d: DatosNuevoMensaje): Promise<MensajePortal> {
  const mensaje: MensajePortal = {
    id: uid('msg'),
    contratoId: d.contratoId,
    inmuebleId: d.inmuebleId,
    remitenteUid: d.remitenteUid,
    remitenteNombre: d.remitenteNombre,
    remitenteRol: d.remitenteRol,
    texto: d.texto.trim(),
    leidoPorGestion: d.remitenteRol === 'GESTION' ? true : false,
    leidoPorInquilino: d.remitenteRol === 'INQUILINO' ? true : false,
    createdAt: ahoraIso(),
  };
  await setDoc(doc(db, 'mensajes_portal', mensaje.id), mensaje);
  await vincularMensajeAContrato(d.contratoId, mensaje.id);
  return mensaje;
}

export async function vincularMensajeAContrato(contratoId: string, mensajeId: string): Promise<void> {
  await updateDoc(doc(db, 'contratos_formalizacion', contratoId), {
    mensajeIds: arrayUnion(mensajeId),
    fechaActualizacion: ahoraIso(),
  });
}

export async function vincularIncidenciaAContrato(contratoId: string, incidenciaId: string): Promise<void> {
  await updateDoc(doc(db, 'contratos_formalizacion', contratoId), {
    incidenciaIds: arrayUnion(incidenciaId),
    fechaActualizacion: ahoraIso(),
  });
}

/** Acuse de lectura del inquilino (único update permitido al inquilino en mensajes). */
export async function marcarMensajeLeidoPorInquilino(mensajeId: string): Promise<void> {
  await updateDoc(doc(db, 'mensajes_portal', mensajeId), { leidoPorInquilino: true });
}

/** Acuse de lectura de gestión. Solo personal (reglas). */
export async function marcarMensajeLeidoPorGestion(mensajeId: string): Promise<void> {
  await updateDoc(doc(db, 'mensajes_portal', mensajeId), { leidoPorGestion: true });
}

// ---------------------------------------------------------------------------
// Concesión / revocación de alcance (personal; en invitar/revocar inquilino)
// ---------------------------------------------------------------------------

/** Concede a un contrato la lectura del inmueble y sus suministros. */
export async function concederAccesoContrato(contratoId: string, inmuebleId: string): Promise<void> {
  await updateDoc(doc(db, 'inmuebles', inmuebleId), {
    contratoIdsAutorizados: arrayUnion(contratoId),
  });
  const inmueble = await getInmuebleById(inmuebleId);
  const suministroIds = inmueble?.suministroIds || [];
  await Promise.all(
    suministroIds.map((sid) =>
      updateDoc(doc(db, 'suministros', sid), {
        contratoIdsAutorizados: arrayUnion(contratoId),
      }).catch(() => undefined)
    )
  );
}

/** Revoca la lectura del inmueble y sus suministros a un contrato. */
export async function revocarAccesoContrato(contratoId: string, inmuebleId: string): Promise<void> {
  await updateDoc(doc(db, 'inmuebles', inmuebleId), {
    contratoIdsAutorizados: arrayRemove(contratoId),
  });
  const inmueble = await getInmuebleById(inmuebleId);
  const suministroIds = inmueble?.suministroIds || [];
  await Promise.all(
    suministroIds.map((sid) =>
      updateDoc(doc(db, 'suministros', sid), {
        contratoIdsAutorizados: arrayRemove(contratoId),
      }).catch(() => undefined)
    )
  );
}

// ---------------------------------------------------------------------------
// Invitaciones de inquilino (personal)
// ---------------------------------------------------------------------------

export interface DatosInvitacionInquilino {
  contratoId: string;
  inmuebleId: string;
  textoVisible?: string;
  descripcion?: string;
  fechaCaducidad?: string;
  usosMaximos?: number;
  creadoPor: string;
}

/**
 * Crea la invitación de un inquilino y concede el alcance de lectura
 * (inmueble + suministros) al contrato vinculado.
 * El ID del enlace es el secreto: el registro público lo lee por get() directo.
 */
export async function crearInvitacionInquilino(d: DatosInvitacionInquilino): Promise<EnlaceRegistro> {
  const id = `enl_inq_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  const enlace: EnlaceRegistro = {
    id,
    token: id,
    tipoPerfil: 'INQUILINO',
    textoVisible: d.textoVisible?.trim() || 'Accede a tu portal de inquilino',
    descripcion: d.descripcion?.trim() || 'Crea tu cuenta para ver tu vivienda, contrato, recibos e incidencias.',
    activo: true,
    contratoIdVinculado: d.contratoId,
    inmuebleIdVinculado: d.inmuebleId,
    fechaCaducidad: d.fechaCaducidad,
    usosMaximos: d.usosMaximos ?? 1,
    usosActuales: 0,
    creadoPor: d.creadoPor,
    createdAt: ahoraIso(),
  };
  await setDoc(doc(db, 'enlaces_registro', id), enlace);
  await concederAccesoContrato(d.contratoId, d.inmuebleId);
  return enlace;
}

/**
 * Revoca una invitación: desactiva el enlace y retira el alcance de lectura.
 * (El bloqueo de la cuenta de usuario, si existe, se gestiona en usuarios.)
 */
export async function revocarInvitacionInquilino(enlace: EnlaceRegistro): Promise<void> {
  await updateDoc(doc(db, 'enlaces_registro', enlace.id), { activo: false });
  if (enlace.contratoIdVinculado && enlace.inmuebleIdVinculado) {
    await revocarAccesoContrato(enlace.contratoIdVinculado, enlace.inmuebleIdVinculado);
  }
}

/** Consume una invitación (incremento de usos en +1; único update permitido al inquilino). */
export async function consumirInvitacion(enlaceId: string, usosActuales: number): Promise<void> {
  await updateDoc(doc(db, 'enlaces_registro', enlaceId), { usosActuales: usosActuales + 1 });
}

// ---------------------------------------------------------------------------
// Storage privado (evidencias; rutas de la sección E de storage.rules)
// ---------------------------------------------------------------------------

function nombreSeguro(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'evidencia';
}

function validarEvidencia(blob: Blob): void {
  const tipos = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!tipos.includes(blob.type)) {
    throw new Error('Formato no permitido. Sube un PDF o una imagen (JPG, PNG o WebP).');
  }
  if (blob.size >= 10 * 1024 * 1024) {
    throw new Error('El archivo supera el límite de 10 MB.');
  }
}

/** Sube una evidencia de incidencia. Falla si Storage no está disponible (sin base64). */
export async function subirEvidenciaIncidencia(
  incidenciaId: string,
  blob: Blob,
  fileName: string
): Promise<{ storagePath: string; downloadURL: string }> {
  validarEvidencia(blob);
  const storagePath = `incidencias/${incidenciaId}/${uid('ev')}_${nombreSeguro(fileName)}`;
  const refArchivo = ref(storage, storagePath);
  await uploadBytes(refArchivo, blob, { contentType: blob.type });
  const downloadURL = await getDownloadURL(refArchivo);
  return { storagePath, downloadURL };
}

/** Sube la foto de una lectura de contador (la lectura debe existir antes). */
export async function subirFotoLectura(
  suministroId: string,
  lecturaId: string,
  blob: Blob,
  fileName: string
): Promise<{ storagePath: string; downloadURL: string }> {
  validarEvidencia(blob);
  const storagePath = `suministros/${suministroId}/lecturas/${lecturaId}/${uid('foto')}_${nombreSeguro(fileName)}`;
  const refArchivo = ref(storage, storagePath);
  await uploadBytes(refArchivo, blob, { contentType: blob.type });
  const downloadURL = await getDownloadURL(refArchivo);
  return { storagePath, downloadURL };
}

export async function obtenerUrlDescarga(storagePath: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath));
}

export async function eliminarArchivoStorage(storagePath: string): Promise<void> {
  await deleteObject(ref(storage, storagePath));
}

// ---------------------------------------------------------------------------
// Auditoría reutilizada (sistema canónico; el portal escribe, no lee)
// ---------------------------------------------------------------------------

export async function auditarAccionPortal(params: {
  usuarioId: string;
  usuarioEmail: string;
  usuarioNombre: string;
  accion: string;
  descripcion: string;
  entidadAfectada: 'contrato' | 'incidencia' | 'suministro' | 'mensaje' | 'enlace' | 'usuario';
  idAfectado: string;
}): Promise<void> {
  await saveAuditLogFirestore({ ...params, resultado: 'EXITO' });
}
