/**
 * GESTIONES-CARTERA — Servicio (núcleo sobre puertos + orquestación).
 *
 * Cierre operativo del modelo D1R: alta, consulta acotada, transiciones
 * (modificación de permisos/ámbito, cesión, devolución, suspensión,
 * reactivación) y revocación de `gestiones_cartera`, con sincronización del
 * espejo (`usuarios_auth/{uid}` carterasL/E) y auditoría GESTION_* (F.7).
 *
 * Patrón de casa (igual que `patrimonialPersistencia.ts`): núcleo SIN Firebase
 * + puertos inyectables. Los tests usan dobles fieles en memoria; el adaptador
 * real está en `gestionesCarteraServicioFirebase.ts` (ÚNICO fichero del bloque
 * que importa Firebase). `src/lib/firebase.ts` NO se modifica: solo se
 * reutilizan sus exports (`db`, `registrarAuditoriaFirestore`).
 *
 * Reglas de honestidad del servicio:
 *  · Toda escritura de `gestiones_cartera`/espejo exige SESIÓN MASTER (lo
 *    imponen las reglas: D3/C4 y D2b/D). El servicio NO autentica: el contexto
 *    master lo aporta el llamante (futura UI de administración).
 *  · Las transiciones se confirman con lectura-modificación-escritura ATÓMICA
 *    (`aplicarTransicion` del puerto; en Firestore, transacción): el histórico
 *    `eventos[]` es append-only y jamás pierde eventos por concurrencia.
 *  · La auditoría es best-effort DEGRADADA EXPLÍCITA (mismo contrato que el
 *    núcleo patrimonial): si falla, la mutación informa `advertencias` y nunca
 *    finge una auditoría que no se escribió. La pista primaria es `eventos[]`
 *    dentro del propio documento (atómica con la transición); `audit_logs` es
 *    la pista secundaria de forense.
 *  · Si el espejo falla tras confirmar el documento, la mutación SIGUE siendo
 *    `ok:true` (el documento manda) pero con advertencia `ESPEJO_PENDIENTE` que
 *    el llamante DEBE surfear: la efectividad del acceso depende del espejo y
 *    se repara reejecutando `sincronizarEspejoGestor` (idempotente).
 *  · El servicio NUNCA lista la colección completa ni toca inmuebles,
 *    propietarios (solo lectura de existencia) ni cuentas: sin acceso
 *    transversal entre carteras y sin alterar titularidad.
 */
import {
  crearGestion,
  registrarEvento,
  type EstadoGestionCartera,
  type GestionCartera,
  type PermisoGestion,
  type TipoEventoGestion,
  type TipoGestor,
} from './gestionesCartera';
import { proyectarCarterasGestionadas } from './carterasGestion';
import {
  construirAuditoriaEventoGestion,
  especificarGestionesDeGestor,
  especificarGestionesDePropietario,
  generarIdGestion,
  validarAltaGestion,
  validarCoherenciaActor,
  type ActorAuditoriaGestion,
  type GestorValidable,
} from './accesoGestores';
import type { AuditLog } from '../types';

export const COLECCION_GESTIONES_CARTERA = 'gestiones_cartera';
export const COLECCION_USUARIOS = 'usuarios';
export const COLECCION_PROPIETARIOS = 'propietarios';
export const COLECCION_ESPEJOS_AUTH = 'usuarios_auth';

// ---------------------------------------------------------------------------
// Puertos
// ---------------------------------------------------------------------------
export interface PuertoGestionesCartera {
  obtenerGestion(id: string): Promise<GestionCartera | null>;
  /** Creación ESTRICTA: lanza si el documento ya existe (nunca sobrescribe). */
  crearGestion(gestion: GestionCartera): Promise<void>;
  /**
   * Aplica `aplicar` sobre el documento ACTUAL con lectura-modificación-
   * escritura atómica (transacción en Firestore) y devuelve el documento
   * confirmado. Si `aplicar` lanza (transición incompatible con el estado
   * fresco), NO se escribe nada y la excepción propaga.
   */
  aplicarTransicion(
    id: string,
    aplicar: (actual: GestionCartera) => GestionCartera
  ): Promise<GestionCartera>;
  listarPorPropietario(
    propietarioId: string,
    estado?: EstadoGestionCartera
  ): Promise<GestionCartera[]>;
  listarPorGestor(
    gestorUsuarioId: string,
    estado?: EstadoGestionCartera
  ): Promise<GestionCartera[]>;
  // NOTA: no existe listar-todas: el servicio jamás enumera la colección.
}

export interface PuertoPropietariosGestiones {
  /** Solo existencia (la gestión referencia la ficha; no la modifica). */
  existePropietario(id: string): Promise<boolean>;
}

/** Subconjunto de `UsuarioApp` para resolución gestor/titular (incluye Auth). */
export interface UsuarioGestionable extends GestorValidable {
  authUid?: string;
}

export interface PuertoUsuariosGestiones {
  obtenerUsuario(id: string): Promise<UsuarioGestionable | null>;
  /** Resuelve la cuenta vinculada a un titular (o null: propietario sin cuenta). */
  buscarUsuarioPorPropietario(propietarioId: string): Promise<UsuarioGestionable | null>;
}

export interface ProyeccionEspejo {
  carterasL: string[];
  carterasE: string[];
}

export interface PuertoEspejoCarteras {
  leerProyeccion(uid: string): Promise<ProyeccionEspejo | null>;
  escribirProyeccion(uid: string, proyeccion: ProyeccionEspejo): Promise<void>;
}

export type EntradaAuditoriaGestiones = Omit<AuditLog, 'id' | 'fechaHora'> & {
  fechaHora: string;
};

export interface PuertoAuditoriaGestiones {
  registrar(entrada: EntradaAuditoriaGestiones): Promise<void>;
}

export interface DependenciasGestionesCartera {
  gestiones: PuertoGestionesCartera;
  propietarios: PuertoPropietariosGestiones;
  usuarios: PuertoUsuariosGestiones;
  espejo: PuertoEspejoCarteras;
  auditoria: PuertoAuditoriaGestiones;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
export interface ExitoMutacionGestion {
  ok: true;
  gestion: GestionCartera;
  /**
   * Degradaciones EXPLÍCITAS (auditoría/espejo). Vacío = todo confirmado.
   * El llamante debe surfearlas: nunca son silenciosas.
   */
  advertencias: string[];
}

export interface FalloMutacionGestion {
  ok: false;
  error: string;
  fase: 'VALIDACION' | 'DOMINIO' | 'PERSISTENCIA';
}

export type ResultadoMutacionGestion = ExitoMutacionGestion | FalloMutacionGestion;

export type ResultadoConsultaGestiones =
  | { ok: true; gestiones: GestionCartera[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------
export interface ParametrosAltaGestion {
  id?: string;
  propietarioId: string;
  gestorUsuarioId: string;
  tipoGestor: TipoGestor;
  permiso?: PermisoGestion;
  inmuebleIds?: string[];
  /** ISO aportada por el llamante (el servicio no usa reloj propio). */
  fecha: string;
  /** Ejecutor master (trazabilidad del QUIÉN en auditoría). */
  actor: ActorAuditoriaGestion;
  /** actorId del evento ALTA (por defecto, el ejecutor). */
  actorIdDominio?: string;
  actorRol?: string;
  /** Determinismo en tests cuando `id` no se aporta. */
  azar?: () => number;
  ahoraMs?: number;
}

export async function altaGestionCartera(
  deps: DependenciasGestionesCartera,
  p: ParametrosAltaGestion
): Promise<ResultadoMutacionGestion> {
  const gestorId = (p.gestorUsuarioId || '').trim();
  if (!gestorId) {
    return { ok: false, fase: 'VALIDACION', error: 'gestorUsuarioId obligatorio.' };
  }
  const [gestor, existentes, propietarioExiste, titularUsuario] = await Promise.all([
    deps.usuarios.obtenerUsuario(gestorId),
    deps.gestiones.listarPorGestor(gestorId),
    deps.propietarios.existePropietario((p.propietarioId || '').trim()),
    deps.usuarios.buscarUsuarioPorPropietario((p.propietarioId || '').trim()),
  ]);
  const validacion = validarAltaGestion({
    propietarioId: p.propietarioId,
    gestor,
    tipoGestor: p.tipoGestor,
    propietarioExiste,
    gestionesExistentesDelGestor: existentes,
  });
  if (validacion.ok === false) {
    return { ok: false, fase: 'VALIDACION', error: validacion.errores.join('; ') };
  }
  // S4: "tiene cuenta" = existe usuario vinculado con Auth (authUid). Un
  // PENDIENTE sin Auth o un titular sin ficha de usuario NO tienen cuenta:
  // la preparación administrativa no se bloquea (requiereAceptacion=false).
  const propietarioTieneCuenta = !!titularUsuario && !!titularUsuario.authUid;
  const creado = crearGestion({
    id: p.id || generarIdGestion(p.azar, p.ahoraMs),
    propietarioId: (p.propietarioId || '').trim(),
    gestorUsuarioId: gestorId,
    tipoGestor: p.tipoGestor,
    propietarioTieneCuenta,
    permiso: p.permiso,
    inmuebleIds: p.inmuebleIds,
    fecha: p.fecha,
    actorId: p.actorIdDominio || p.actor.id,
    actorRol: p.actorRol,
  });
  if (creado.ok === false) return { ok: false, fase: 'DOMINIO', error: creado.error };
  try {
    await deps.gestiones.crearGestion(creado.gestion);
  } catch (e) {
    return {
      ok: false,
      fase: 'PERSISTENCIA',
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const advertencias: string[] = [];
  await auditarBestEffort(deps, advertencias, creado.gestion, 0, p.actor);
  await sincronizarEspejoBestEffort(deps, advertencias, gestorId);
  return { ok: true, gestion: creado.gestion, advertencias };
}

// ---------------------------------------------------------------------------
// Transiciones (modificación de permisos/ámbito, cesión, devolución,
// suspensión, reactivación, activación, aceptación, invitación)
// ---------------------------------------------------------------------------
export interface ParametrosEventoGestion {
  gestionId: string;
  tipo: TipoEventoGestion;
  fecha: string;
  motivo?: string;
  permiso?: PermisoGestion;
  conservarLecturaHistorica?: boolean;
  actor: ActorAuditoriaGestion;
  actorIdDominio?: string;
  actorRol?: string;
  /**
   * Si se aporta, se valida coherencia de PARTE del actor (no-master). Con
   * `esMaster:true` la coherencia pasa (la autorización master la impone el
   * servidor). Si se omite, no se valida actor (el servidor sigue mandando).
   */
  coherenciaActor?: { esMaster: boolean };
}

export async function aplicarEventoGestionCartera(
  deps: DependenciasGestionesCartera,
  p: ParametrosEventoGestion
): Promise<ResultadoMutacionGestion> {
  const actual = await deps.gestiones.obtenerGestion(p.gestionId);
  if (!actual) {
    return { ok: false, fase: 'VALIDACION', error: `La gestión ${p.gestionId} no existe.` };
  }
  const actorIdDominio = p.actorIdDominio || p.actor.id;
  if (p.coherenciaActor) {
    let titularUsuarioId: string | null = null;
    if (!p.coherenciaActor.esMaster) {
      const titular = await deps.usuarios.buscarUsuarioPorPropietario(actual.propietarioId);
      titularUsuarioId = titular && titular.authUid ? titular.id : null;
    }
    const coherencia = validarCoherenciaActor({
      gestion: actual,
      tipo: p.tipo,
      actorId: actorIdDominio,
      titularUsuarioId,
      esMaster: p.coherenciaActor.esMaster,
    });
    if (coherencia.ok === false) {
      return { ok: false, fase: 'VALIDACION', error: coherencia.errores.join('; ') };
    }
  }
  const paramsEvento = {
    tipo: p.tipo,
    actorId: actorIdDominio,
    actorRol: p.actorRol,
    fecha: p.fecha,
    motivo: p.motivo,
    permiso: p.permiso,
    conservarLecturaHistorica: p.conservarLecturaHistorica,
  };
  // Vista previa sobre la lectura (valida máquina de estados + S4/S7).
  const previo = registrarEvento(actual, paramsEvento);
  if (previo.ok === false) return { ok: false, fase: 'DOMINIO', error: previo.error };
  // Confirmación atómica sobre el documento FRESCO (re-ejecuta la transición
  // pura; si el estado cambió bajo nuestros pies, el dominio la rechaza y NO
  // se escribe nada).
  let confirmada: GestionCartera;
  try {
    confirmada = await deps.gestiones.aplicarTransicion(p.gestionId, (fresco) => {
      const r = registrarEvento(fresco, paramsEvento);
      if (r.ok === false) throw new Error(r.error);
      return r.gestion;
    });
  } catch (e) {
    return {
      ok: false,
      fase: 'PERSISTENCIA',
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const advertencias: string[] = [];
  await auditarBestEffort(deps, advertencias, confirmada, confirmada.eventos.length - 1, p.actor);
  await sincronizarEspejoBestEffort(deps, advertencias, confirmada.gestorUsuarioId);
  return { ok: true, gestion: confirmada, advertencias };
}

// ---------------------------------------------------------------------------
// Revocación (inmediata; S7 exige decisión EXPLÍCITA de lectura histórica)
// ---------------------------------------------------------------------------
export interface ParametrosRevocacionGestion extends Omit<ParametrosEventoGestion, 'tipo' | 'permiso'> {
  /** OBLIGATORIO (sin default): conservar LECTURA histórica tras revocar. */
  conservarLecturaHistorica: boolean;
}

export async function revocarGestionCartera(
  deps: DependenciasGestionesCartera,
  p: ParametrosRevocacionGestion
): Promise<ResultadoMutacionGestion> {
  if (typeof p.conservarLecturaHistorica !== 'boolean') {
    return {
      ok: false,
      fase: 'VALIDACION',
      error:
        'S7: conservarLecturaHistorica explícito obligatorio (true/false) al revocar: la lectura histórica nunca se concede ni se retira por defecto.',
    };
  }
  return aplicarEventoGestionCartera(deps, { ...p, tipo: 'REVOCACION' });
}

// ---------------------------------------------------------------------------
// Espejo (recomputo idempotente; re-ejecutable para reparar ESPEJO_PENDIENTE)
// ---------------------------------------------------------------------------
export type ResultadoSincronizarEspejo =
  | { ok: true; proyeccion: ProyeccionEspejo; omitidoSinCuenta: boolean }
  | { ok: false; error: string };

export async function sincronizarEspejoGestor(
  deps: DependenciasGestionesCartera,
  gestorUsuarioId: string
): Promise<ResultadoSincronizarEspejo> {
  const usuario = await deps.usuarios.obtenerUsuario(gestorUsuarioId);
  if (!usuario) return { ok: false, error: `El usuario gestor ${gestorUsuarioId} no existe.` };
  if (!usuario.authUid) {
    // Sin Auth no hay espejo que escribir (fail-soft EXPLÍCITO, no silencioso).
    return { ok: true, proyeccion: { carterasL: [], carterasE: [] }, omitidoSinCuenta: true };
  }
  const gestiones = await deps.gestiones.listarPorGestor(gestorUsuarioId);
  const proyeccion = proyectarCarterasGestionadas(gestiones, gestorUsuarioId);
  try {
    await deps.espejo.escribirProyeccion(usuario.authUid, proyeccion);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true, proyeccion, omitidoSinCuenta: false };
}

// ---------------------------------------------------------------------------
// Consulta (SOLO acotada: por cartera o por gestor; jamás global)
// ---------------------------------------------------------------------------
export async function listarGestionesDePropietario(
  deps: Pick<DependenciasGestionesCartera, 'gestiones'>,
  propietarioId: string,
  estado?: EstadoGestionCartera
): Promise<ResultadoConsultaGestiones> {
  const spec = especificarGestionesDePropietario(propietarioId, estado);
  if (spec.ok === false) return { ok: false, error: spec.error };
  return { ok: true, gestiones: await deps.gestiones.listarPorPropietario(propietarioId, estado) };
}

export async function listarGestionesDeGestor(
  deps: Pick<DependenciasGestionesCartera, 'gestiones'>,
  gestorUsuarioId: string,
  estado?: EstadoGestionCartera
): Promise<ResultadoConsultaGestiones> {
  const spec = especificarGestionesDeGestor(gestorUsuarioId, estado);
  if (spec.ok === false) return { ok: false, error: spec.error };
  return { ok: true, gestiones: await deps.gestiones.listarPorGestor(gestorUsuarioId, estado) };
}

/** Lectura directa por id (la visibilidad la acotan reglas + `filtrarGestionesVisibles`). */
export async function obtenerGestion(
  deps: Pick<DependenciasGestionesCartera, 'gestiones'>,
  id: string
): Promise<GestionCartera | null> {
  if (!id) return null;
  return deps.gestiones.obtenerGestion(id);
}

// ---------------------------------------------------------------------------
// Best-effort explícito (auditoría y espejo tras confirmar el documento)
// ---------------------------------------------------------------------------
async function auditarBestEffort(
  deps: DependenciasGestionesCartera,
  advertencias: string[],
  gestion: GestionCartera,
  indiceEvento: number,
  actor: ActorAuditoriaGestion
): Promise<void> {
  const evento = gestion.eventos[indiceEvento];
  if (!evento) {
    advertencias.push('AUDITORIA_DEGRADADA: evento no encontrado en el documento confirmado.');
    return;
  }
  try {
    await deps.auditoria.registrar(
      construirAuditoriaEventoGestion({ evento, gestion, actor, resultado: 'EXITO' })
    );
  } catch (e) {
    advertencias.push(
      `AUDITORIA_DEGRADADA: no se escribió audit_logs (${e instanceof Error ? e.message : String(e)}). La pista primaria (eventos[] del documento) sí quedó confirmada.`
    );
  }
}

async function sincronizarEspejoBestEffort(
  deps: DependenciasGestionesCartera,
  advertencias: string[],
  gestorUsuarioId: string
): Promise<void> {
  try {
    const r = await sincronizarEspejoGestor(deps, gestorUsuarioId);
    if (r.ok === false) {
      advertencias.push(
        `ESPEJO_PENDIENTE: ${r.error} Reejecute sincronizarEspejoGestor(${gestorUsuarioId}): la efectividad del acceso depende del espejo.`
      );
    } else if (r.omitidoSinCuenta) {
      advertencias.push(
        `ESPEJO_OMITIDO: el gestor ${gestorUsuarioId} no tiene Auth vinculada (sin espejo que sincronizar).`
      );
    }
  } catch (e) {
    advertencias.push(
      `ESPEJO_PENDIENTE: ${e instanceof Error ? e.message : String(e)} Reejecute sincronizarEspejoGestor(${gestorUsuarioId}).`
    );
  }
}
