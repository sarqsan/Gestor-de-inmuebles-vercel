/**
 * GAP 5 · Persistencia Firestore del ESTADO DE SINDICACIÓN (adaptador real, aditivo).
 * ---------------------------------------------------------------------------------
 * Implementa el puerto `PuertoEstadoSindicacion` de `src/sindicacion/estadoRepositorio.ts`
 * siguiendo el patrón del ERP (ver `src/lib/morosidadFirestore.ts`): la lógica vive en
 * el dominio; aquí sólo hay lectura/escritura.
 *
 * Colecciones:
 *  · `sindicacion_inmuebles/{externalId}` — estado ACTUAL de (inmueble, portal).
 *      - El id del documento ES el `externalId` determinista que produce el núcleo
 *        (`identidadPublicacionPortal`): no se puede crear un segundo estado actual
 *        para el mismo par ni por accidente.
 *      - Escritura IDEMPOTENTE: si la huella del estado no cambió, no se escribe
 *        (eso lo decide el dominio; aquí se verifica de nuevo el id y las
 *        invariantes antes de tocar Firestore).
 *  · Historial: se usa el canal canónico del ERP, `audit_logs` (append-only,
 *      `create: if isSignedIn()`, `update/delete: if false`), con el id determinista
 *      del evento. NO se crea una colección de auditoría paralela.
 *
 * Seguridad aplicada por el adaptador (además de las reglas):
 *  - invariantes de identidad antes de escribir (`verificarInvariantesDelRegistro`);
 *  - ninguna clave de credencial puede entrar en el documento (se reutiliza la lista
 *    de la Fase 1, `CLAVES_CREDENCIAL_PROHIBIDAS`: una sola barrera, no dos);
 *  - `propietarioId` obligatorio en toda escritura (campo de aislamiento);
 *  - `esquema` versionado, para poder migrar sin sorpresas;
 *  - cero `update` de documentos de auditoría.
 *
 * REGLAS (acoplamiento que hay que respetar en los dos sentidos):
 *  · `firestore.rules` §38 es quien habilita la colección; sin ese bloque todo cae en el
 *    catch-all `allow read, write: if false` y este módulo no puede hacer nada.
 *  · El §38 permite el `list` de un propietario SOLO si la consulta va filtrada por
 *    `propietarioId` (es la única condición demostrable para una consulta). Por eso
 *    `crearRepositorioEstadoSindicacionFirestore` acepta `propietarioId` y lo mete en el
 *    `where`: sin alcance, la lectura es la de la administración (filtro por `inmuebleId`).
 *  · Las escrituras no pueden cambiar la identidad estructural (id/externalId/clave/
 *    inmuebleId/portal/propietarioId): el dominio ya lo garantiza y la regla lo exige.
 *  · Ninguna consulta de este módulo usa `orderBy` ni rangos, así que NO hacen falta
 *    índices compuestos (dos equality los resuelven los índices simples automáticos).
 *    Si alguien añade `orderBy('actualizadoEn')`, hay que desplegar su índice compuesto.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db, registrarAuditoriaFirestore, sanitizeObjectForFirestore } from './firebase';
import type { PortalInmobiliario } from '../types';
import { CLAVES_CREDENCIAL_PROHIBIDAS } from '../sindicacion/adaptadores';
import {
  COLECCION_ESTADO_SINDICACION,
  ESQUEMA_ESTADO_SINDICACION,
  huellaDeEstado,
  verificarInvariantesDelRegistro,
  type EventoSindicacion,
  type PuertoEstadoSindicacion,
  type RegistroEstadoSindicacion,
} from '../sindicacion/estadoRepositorio';
import type { RegistroTrazabilidadPublicacion } from '../types';

export const ESTADO_SINDICACION_COL = collection(db, COLECCION_ESTADO_SINDICACION);

export interface OpcionesRepositorioSindicacion {
  actor?: { id?: string; nombre?: string; email?: string } | null;
  /** false ⇒ no se emite nada a `audit_logs` (modo sin auditoría, p. ej. importación). */
  auditoria?: boolean;
  /** false ⇒ el repositorio no ofrece listener (hidratación por lectura simple). */
  suscripcion?: boolean;
  /**
   * Propietario en cuyo nombre se lee. NO es un dato de negocio: es lo que hace que la
   * consulta sea legal. `firestore.rules` §38 sólo puede demostrar un `list` filtrado
   * por `propietarioId`, así que sin este campo las lecturas de un propietario se
   * deniegan (y se ve el panel sin estados, nunca los de otro). Sin `propietarioId`
   * la lectura va por `inmuebleId`, que es la forma que usa la administración.
   */
  propietarioId?: string;
}

/** Alcance de una lectura: `propietarioId` estrecha la consulta a lo que la regla permite demostrar. */
export interface AlcanceLecturaSindicacion {
  propietarioId?: string;
}

function mapaSnap<T>(snap: { forEach(cb: (d: { id: string; data(): unknown }) => void): void }): T[] {
  const items: T[] = [];
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() as object) } as T));
  return items;
}

/** Ningún secreto entra en Firestore: misma lista que rechaza el contexto del adaptador. */
export function documentoSinCredenciales(obj: Record<string, unknown>): { ok: boolean; claves: string[] } {
  const claves = Object.keys(obj || {}).filter((k) => (CLAVES_CREDENCIAL_PROHIBIDAS as readonly string[]).includes(k));
  return { ok: claves.length === 0, claves };
}

// ---------------------------------------------------------------------------
// LECTURA
// ---------------------------------------------------------------------------

/**
 * Dos equality `==` no necesitan índice compuesto: Firestore los resuelve
 * mezclando los índices simples automáticos (zigzag merge join), así que este
 * adaptador NO añade `orderBy` ni rangos y no exige desplegar índices.
 */
function consultaEstadosSindicacion(inmuebleId: string, alcance?: AlcanceLecturaSindicacion) {
  const filtros = [where('inmuebleId', '==', inmuebleId)];
  // Con alcance de propietario se añade el filtro que la regla §38 puede demostrar.
  if (alcance?.propietarioId) filtros.push(where('propietarioId', '==', alcance.propietarioId));
  return query(ESTADO_SINDICACION_COL, ...filtros);
}

export async function leerEstadoSindicacionFirestore(
  inmuebleId: string,
  portal: PortalInmobiliario,
  alcance?: AlcanceLecturaSindicacion,
): Promise<RegistroEstadoSindicacion | null> {
  const estados = await listarEstadosSindicacionFirestore(inmuebleId, alcance);
  return estados.find((e) => e.portal === portal) || null;
}

export async function listarEstadosSindicacionFirestore(
  inmuebleId: string,
  alcance?: AlcanceLecturaSindicacion,
): Promise<RegistroEstadoSindicacion[]> {
  const snap = await getDocs(consultaEstadosSindicacion(inmuebleId, alcance));
  return mapaSnap<RegistroEstadoSindicacion>(snap)
    .filter((r) => r.inmuebleId === inmuebleId)
    .filter((r) => !alcance?.propietarioId || r.propietarioId === alcance.propietarioId)
    .sort((a, b) => (a.portal < b.portal ? -1 : a.portal > b.portal ? 1 : 0));
}

/** Devuelve el `unsubscribe`. Tras llamarlo no se emite: el listener real se cierra. */
export function subscribeEstadosSindicacionFirestore(
  inmuebleId: string,
  callback: (items: RegistroEstadoSindicacion[]) => void,
  alcance?: AlcanceLecturaSindicacion,
): () => void {
  let cerrado = false;
  const unsub = onSnapshot(
    consultaEstadosSindicacion(inmuebleId, alcance),
    (snap) => {
      if (cerrado) return;
      callback(mapaSnap<RegistroEstadoSindicacion>(snap));
    },
    (err) => {
      if (cerrado) return;
      console.error('Firestore sindicacion_inmuebles snapshot error:', err);
    },
  );
  return () => {
    cerrado = true;
    unsub && unsub();
  };
}

// ---------------------------------------------------------------------------
// ESCRITURA (idempotente) Y AUDITORÍA (append-only)
// ---------------------------------------------------------------------------

/**
 * Escribe el estado en `registro.id` (= externalId determinista).
 * Devuelve 'CREADO' | 'ACTUALIZADO'; si el documento ya contenía exactamente la misma
 * huella de estado, NO escribe y devuelve 'ACTUALIZADO' con `sinCambio: true`.
 */
export async function guardarEstadoSindicacionFirestore(
  registro: RegistroEstadoSindicacion,
): Promise<{ escritura: 'CREADO' | 'ACTUALIZADO'; sinCambio: boolean; huella: string }> {
  const invariantes = verificarInvariantesDelRegistro(registro);
  if (!invariantes.ok) {
    throw new Error(`Estado de sindicación rechazado: ${invariantes.errores.join(' | ')}`);
  }
  const plano = registro as unknown as Record<string, unknown>;
  const credenciales = documentoSinCredenciales(plano);
  if (!credenciales.ok) {
    throw new Error(`El estado de sindicación no puede contener credenciales (${credenciales.claves.join(', ')}).`);
  }
  if (!registro.propietarioId) {
    throw new Error('El estado de sindicación requiere propietarioId (campo de aislamiento).');
  }
  const ruta = doc(db, COLECCION_ESTADO_SINDICACION, registro.id);
  const actual = await getDoc(ruta);
  const huella = huellaDeEstado(registro);
  if (actual.exists()) {
    const previo = { id: actual.id, ...(actual.data() as object) } as RegistroEstadoSindicacion;
    if (previo.esquema === ESQUEMA_ESTADO_SINDICACION && huellaDeEstado(previo) === huella) {
      return { escritura: 'ACTUALIZADO', sinCambio: true, huella };
    }
    await setDoc(ruta, sanitizeObjectForFirestore({ ...registro, creadoEn: previo.creadoEn || registro.creadoEn }), { merge: true });
    return { escritura: 'ACTUALIZADO', sinCambio: false, huella };
  }
  await setDoc(ruta, sanitizeObjectForFirestore(registro), { merge: false });
  return { escritura: 'CREADO', sinCambio: false, huella };
}

/** Emite el evento al canal de auditoría canónico (`audit_logs`), con id determinista. */
export async function appendEventoSindicacionFirestore(
  evento: EventoSindicacion,
  trazabilidad: RegistroTrazabilidadPublicacion | null,
  actor?: { id?: string; nombre?: string; email?: string } | null,
): Promise<void> {
  const accion = `SINDICACION_${(evento.operacion || 'SIN_ENVIO').toUpperCase()}`;
  const descripcion =
    `[${evento.portal}] ${evento.inmuebleId}: ${evento.estadoAnterior || '—'} → ${evento.estado}` +
    `${evento.version !== undefined ? ` (v${evento.version})` : ''} · ${evento.resultado}`;
  await registrarAuditoriaFirestore({
    id: evento.id,
    fechaHora: evento.fecha,
    usuarioId: actor?.id || 'sindicacion',
    usuarioEmail: actor?.email || 'sindicacion@erp',
    usuarioNombre: actor?.nombre || 'Sindicación GAP 5',
    accion,
    descripcion,
    entidadAfectada: 'inmueble',
    idAfectado: evento.inmuebleId,
    resultado: evento.resultado === 'ERROR' ? 'ERROR' : 'EXITO',
    detalles: {
      clave: `${evento.portal}:${evento.inmuebleId}`,
      externalId: evento.externalId,
      operacion: evento.operacion,
      accionSindicacion: evento.accion,
      version: evento.version ?? null,
      etiquetaVersion: evento.etiquetaVersion ?? null,
      hashContenido: evento.hashContenido ?? null,
      pasosAplicados: evento.pasosAplicados,
      errores: evento.errores,
      advertencias: evento.advertencias,
      mensaje: evento.mensaje ?? null,
      trazabilidad,
    },
  });
}

/** Borrado reservado a la administración (fuera del flujo ordinario: retirar no borra). */
export async function borrarEstadoSindicacionFirestore(externalId: string): Promise<void> {
  await deleteDoc(doc(db, COLECCION_ESTADO_SINDICACION, externalId));
}

/** Implementación Firestore del puerto de persistencia del estado de sindicación. */
export function crearRepositorioEstadoSindicacionFirestore(opts: OpcionesRepositorioSindicacion = {}): PuertoEstadoSindicacion {
  const auditoria = opts.auditoria !== false;
  const alcance: AlcanceLecturaSindicacion = opts.propietarioId ? { propietarioId: opts.propietarioId } : {};
  return {
    leerEstado: (inmuebleId, portal) => leerEstadoSindicacionFirestore(inmuebleId, portal, alcance),
    listarEstados: (inmuebleId) => listarEstadosSindicacionFirestore(inmuebleId, alcance),
    ...(opts.suscripcion === false
      ? {}
      : { suscribirEstados: (inmuebleId: string, callback: (estados: RegistroEstadoSindicacion[]) => void) => subscribeEstadosSindicacionFirestore(inmuebleId, callback, alcance) }),
    async escribirEstado(registro) {
      const r = await guardarEstadoSindicacionFirestore(registro);
      return r.escritura;
    },
    async registrarEvento(evento, trazabilidad) {
      if (!auditoria) return;
      await appendEventoSindicacionFirestore(evento, trazabilidad, opts.actor);
    },
  };
}
