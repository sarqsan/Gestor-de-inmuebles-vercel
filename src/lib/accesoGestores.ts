/**
 * ACCESO-GESTORES — Validación, ámbito y trazabilidad de `gestiones_cartera`.
 *
 * D1R §20.5 (docs/D1-REVISADA-MODELO-CUENTAS-PROPIETARIOS-GESTORES.md): módulo
 * puro par de `accesoPropietarios.ts`. Complementa al dominio D1R
 * (`gestionesCartera.ts`, máquina de estados) con lo que el dominio NO puede
 * decidir solo (necesita documentos ya leídos: usuario gestor, titular):
 *
 *  · `validarAltaGestion` — destino explícito, gestor existente y ACTIVO,
 *    coherencia tipoGestor↔perfil (D1R §24.5/6), anti-autogestión (D1R §18),
 *    unicidad de par no-REVOCADA (D1R §18, delega en el dominio).
 *  · `validarCoherenciaActor` — coherencia de PARTE del actor de un evento
 *    (titular/gestor); el master NO pasa por aquí (lo autoriza el servidor:
 *    escritura de `gestiones_cartera` SOLO master por reglas).
 *  · `ambitoConsultaDesdeEspejo` — resolución propietario/gestor para acotar
 *    consultas cliente (propio ∪ carterasL ∪ carterasE).
 *  · Especificaciones de consulta — descriptores puros de las ÚNICAS consultas
 *    acotadas legítimas (por propietarioId o por gestorUsuarioId, con estado
 *    opcional); jamás un listado global (anti-acceso-cruzado).
 *  · `filtrarGestionesVisibles` — defensa en profundidad sobre datos ya
 *    leídos (la autorización efectiva está en las reglas).
 *  · `construirAuditoriaEventoGestion` — payload `AuditLog` determinista para
 *    las transiciones auditadas de F.7 (el transporte lo aporta el llamante).
 *
 * Módulo 100% PURO (sin Firebase, sin reloj): testeable. No crea cuentas, no
 * crea propietarios, no toca inmuebles: la gestión NO modifica titularidad.
 */
import { hayGestionActivaPorPar } from './gestionesCartera';
import type {
  EstadoGestionCartera,
  EventoGestionCartera,
  GestionCartera,
  TipoEventoGestion,
  TipoGestor,
} from './gestionesCartera';
import { propietariosGestionadosDe } from './carterasGestion';
import type { AuditLog, UsuarioApp } from '../types';

export interface ResultadoValidacionGestion {
  ok: boolean;
  errores: string[];
}

function resultado(errores: string[]): ResultadoValidacionGestion {
  return { ok: errores.length === 0, errores };
}

/** Subconjunto de `UsuarioApp` que necesita la validación de parte gestora. */
export type GestorValidable = Pick<UsuarioApp, 'id' | 'estado' | 'propietarioId'>;

// ---------------------------------------------------------------------------
// Alta de gestión (el servicio aporta los documentos ya leídos)
// ---------------------------------------------------------------------------
export interface ParametrosValidarAltaGestion {
  /** Titular destino: SIEMPRE explícito (F.5: nunca deducido de la cuenta ejecutora). */
  propietarioId: string;
  gestor: GestorValidable | null | undefined;
  tipoGestor: TipoGestor;
  /** El propietario destino debe existir (la gestión referencia `propietarios/{id}`). */
  propietarioExiste: boolean;
  /** Gestiones del gestor (todos los estados) para la unicidad de par. */
  gestionesExistentesDelGestor: readonly GestionCartera[];
}

export function validarAltaGestion(p: ParametrosValidarAltaGestion): ResultadoValidacionGestion {
  const errores: string[] = [];
  const propietarioId = (p.propietarioId || '').trim();
  if (!propietarioId) {
    errores.push(
      'propietarioId destino explícito obligatorio (F.5: nunca se deduce de la cuenta que ejecuta el alta).'
    );
  }
  if (!p.propietarioExiste) {
    errores.push('El propietario destino no existe: la gestión referencia una ficha `propietarios/{id}` real.');
  }
  const gestor = p.gestor;
  if (!gestor || !gestor.id) {
    errores.push('El usuario gestor no existe.');
    return resultado(errores);
  }
  // Fail-closed coherente con las reglas: el espejo solo autoriza carteras a
  // usuarios ACTIVO (`activeUser()`), así que una gestión para un gestor no
  // activo nacería inoperativa y confusa. El master la crea cuando se active.
  if (gestor.estado !== 'ACTIVO') {
    errores.push(
      `El usuario gestor no está ACTIVO (estado=${gestor.estado || '¿?'}): el alta se rechaza en fail-closed.`
    );
  }
  const propietarioPropio = (gestor.propietarioId || '').trim();
  // D1R §24.5/6: el tipo de gestor es coherente con el perfil, no decorativo.
  if (p.tipoGestor === 'PROPIETARIO_GESTOR' && !propietarioPropio) {
    errores.push(
      'Tipo PROPIETARIO_GESTOR incoherente: el usuario gestor no tiene propietarioId propio (D1R §24.5).'
    );
  }
  if (p.tipoGestor === 'GESTOR_PROFESIONAL' && propietarioPropio) {
    errores.push(
      'Tipo GESTOR_PROFESIONAL incoherente: el usuario gestor tiene propietarioId propio (D1R §24.6).'
    );
  }
  // D1R §18: prohibida la autogestión (gestionar la cartera propia es redundante
  // con el ámbito de titular y confunde ámbitos: caso 12, "se suman, no se confunden").
  if (propietarioId && propietarioPropio && propietarioPropio === propietarioId) {
    errores.push(
      'Autogestión prohibida (D1R §18): el gestor no puede gestionar su propia cartera (ya la cubre su ámbito de titular).'
    );
  }
  // D1R §18: máximo una gestión no-REVOCADA por par (titular, gestor).
  if (
    propietarioId &&
    hayGestionActivaPorPar([...p.gestionesExistentesDelGestor], propietarioId, gestor.id)
  ) {
    errores.push(
      'Ya existe una gestión no-REVOCADA para este par (titular, gestor): revoque la vigente antes de crear otra (D1R §18).'
    );
  }
  return resultado(errores);
}

// ---------------------------------------------------------------------------
// Coherencia de PARTE del actor de un evento
// ---------------------------------------------------------------------------
export interface ParametrosValidarActor {
  gestion: Pick<GestionCartera, 'id' | 'propietarioId' | 'gestorUsuarioId'>;
  tipo: TipoEventoGestion;
  actorId: string;
  /**
   * Cuenta (`usuarios/{id}`) del titular si tiene; null si el titular no tiene
   * cuenta (resuelta por el servicio). Sin cuenta, el titular no puede actuar
   * directamente: solo el gestor de su parte, o el master.
   */
  titularUsuarioId: string | null;
  /**
   * true = ejecutado en sesión master. La autorización del master la impone el
   * servidor (reglas: escritura SOLO master); esta coherencia de parte no le
   * aplica y siempre pasa. NO significa "cualquiera puede".
   */
  esMaster: boolean;
}

export function validarCoherenciaActor(p: ParametrosValidarActor): ResultadoValidacionGestion {
  if (p.esMaster) return resultado([]);
  const errores: string[] = [];
  const actorId = (p.actorId || '').trim();
  if (!actorId) {
    return resultado(['actorId obligatorio: todo evento registra quién lo ejecuta (F.7).']);
  }
  const esGestor = actorId === p.gestion.gestorUsuarioId;
  const esTitular = p.titularUsuarioId !== null && actorId === p.titularUsuarioId;
  // S4: la aceptación es el consentimiento formal DEL TITULAR con cuenta.
  if (p.tipo === 'ACEPTACION') {
    if (p.titularUsuarioId === null) {
      errores.push(
        'ACEPTACION incoherente: el titular no tiene cuenta (el dominio la rechaza; S4: sin cuenta no hay aceptación formal).'
      );
    } else if (!esTitular) {
      errores.push('ACEPTACION incoherente: solo la cuenta del titular puede aceptar (S4).');
    }
    return resultado(errores);
  }
  // Cesión = el gestor cede al titular; devolución = el titular devuelve al gestor.
  if (p.tipo === 'CESION' && !esGestor) {
    errores.push('CESION incoherente: solo el gestor designado puede ceder la gestión al titular.');
    return resultado(errores);
  }
  if (p.tipo === 'DEVOLUCION') {
    if (p.titularUsuarioId === null) {
      errores.push(
        'DEVOLUCION incoherente: el titular no tiene cuenta para devolver (solo el master puede registrarla).'
      );
    } else if (!esTitular) {
      errores.push('DEVOLUCION incoherente: solo la cuenta del titular puede devolver la gestión al gestor.');
    }
    return resultado(errores);
  }
  // Resto de eventos (ALTA/INVITACION/ACTIVACION/SUSPENSION/REACTIVACION/
  // CAMBIO_PERMISOS/REVOCACION): el actor no-master debe ser una de las partes.
  if (!esGestor && !esTitular) {
    errores.push(
      `Actor ajeno a la gestión: ${p.tipo} solo la registra una de las partes (gestor o titular con cuenta) o el master.`
    );
  }
  return resultado(errores);
}

// ---------------------------------------------------------------------------
// Ámbito de consulta (resolución propietario/gestor desde el espejo leído)
// ---------------------------------------------------------------------------
export interface AmbitoConsultaCarteras {
  /** propietarioId propio del lector (titular), o null si no es titular. */
  propietarioPropio: string | null;
  /** Carteras con lectura (espejo `carterasL`, saneadas). */
  carterasL: string[];
  /** Carteras con lectura+escritura (espejo `carterasE`, saneadas). */
  carterasE: string[];
  /** L ∪ E: ámbito de CONSULTA (`propietariosGestionados`). */
  gestionadas: string[];
}

function sanearIds(ids: readonly string[] | undefined): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const id of ids || []) {
    if (typeof id === 'string' && id.length > 0 && !vistos.has(id)) {
      vistos.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Resuelve el ámbito de consulta de un usuario desde su espejo YA LEÍDO
 * (`UsuarioApp.carterasL/carterasE`, que solo el master escribe). No autoriza:
 * solo acota consultas cliente; la autorización efectiva está en las reglas.
 */
export function ambitoConsultaDesdeEspejo(
  usuario: Pick<UsuarioApp, 'propietarioId' | 'carterasL' | 'carterasE'>
): AmbitoConsultaCarteras {
  const propio =
    typeof usuario.propietarioId === 'string' && usuario.propietarioId.length > 0
      ? usuario.propietarioId
      : null;
  const carterasL = sanearIds(usuario.carterasL);
  const carterasE = sanearIds(usuario.carterasE);
  return {
    propietarioPropio: propio,
    carterasL,
    carterasE,
    gestionadas: propietariosGestionadosDe({ carterasL, carterasE }),
  };
}

// ---------------------------------------------------------------------------
// Especificaciones de consulta (únicas consultas acotadas legítimas)
// ---------------------------------------------------------------------------
export interface FiltroGestiones {
  campo: 'propietarioId' | 'gestorUsuarioId' | 'estado';
  op: '==';
  valor: string;
}

export interface EspecificacionConsultaGestiones {
  coleccion: 'gestiones_cartera';
  filtros: FiltroGestiones[];
}

export type ResultadoEspecificacion =
  | { ok: true; spec: EspecificacionConsultaGestiones }
  | { ok: false; error: string };

const ESTADOS_GESTION: readonly EstadoGestionCartera[] = [
  'PENDIENTE_ACEPTACION',
  'ACTIVA',
  'SUSPENDIDA',
  'REVOCADA',
];

function especificar(
  campo: 'propietarioId' | 'gestorUsuarioId',
  id: string,
  estado?: EstadoGestionCartera
): ResultadoEspecificacion {
  const limpio = (id || '').trim();
  if (!limpio) {
    return {
      ok: false,
      error: `Consulta de gestiones sin ámbito (${campo} vacío): denegada en fail-closed (jamás listado global).`,
    };
  }
  const filtros: FiltroGestiones[] = [{ campo, op: '==', valor: limpio }];
  if (estado !== undefined) {
    if (!ESTADOS_GESTION.includes(estado)) {
      return { ok: false, error: `Estado de gestión inválido: ${estado}.` };
    }
    // Con filtro de estado la consulta exige índice compuesto
    // (`firestore.indexes.json`: (propietarioId,estado) y (gestorUsuarioId,estado)).
    filtros.push({ campo: 'estado', op: '==', valor: estado });
  }
  return { ok: true, spec: { coleccion: 'gestiones_cartera', filtros } };
}

/** Gestiones de una cartera (titular): `where(propietarioId==)` [+ estado]. */
export function especificarGestionesDePropietario(
  propietarioId: string,
  estado?: EstadoGestionCartera
): ResultadoEspecificacion {
  return especificar('propietarioId', propietarioId, estado);
}

/** Gestiones designadas a un gestor: `where(gestorUsuarioId==)` [+ estado]. */
export function especificarGestionesDeGestor(
  gestorUsuarioId: string,
  estado?: EstadoGestionCartera
): ResultadoEspecificacion {
  return especificar('gestorUsuarioId', gestorUsuarioId, estado);
}

// ---------------------------------------------------------------------------
// Visibilidad (defensa en profundidad sobre datos ya leídos)
// ---------------------------------------------------------------------------
export interface ContextoVisibilidadGestiones {
  /** Ámbito administrativo legítimo (master/admin de perfil: reglas D4). */
  esAdmin: boolean;
  /** `usuarios/{id}` del lector, o null si anónimo. */
  usuarioId: string | null;
  /** propietarioId propio del lector si es titular, o null. */
  propietarioId: string | null;
}

/** ¿Puede este contexto VER esta gestión? (Reglas D1/D2/D4, lado cliente.) */
export function gestionVisiblePara(
  gestion: Pick<GestionCartera, 'propietarioId' | 'gestorUsuarioId'>,
  ctx: ContextoVisibilidadGestiones
): boolean {
  if (ctx.esAdmin) return true;
  if (!ctx.usuarioId) return false;
  if (ctx.propietarioId !== null && ctx.propietarioId === gestion.propietarioId) return true;
  return ctx.usuarioId === gestion.gestorUsuarioId;
}

export function filtrarGestionesVisibles(
  gestiones: readonly GestionCartera[],
  ctx: ContextoVisibilidadGestiones
): GestionCartera[] {
  return gestiones.filter((g) => gestionVisiblePara(g, ctx));
}

// ---------------------------------------------------------------------------
// Trazabilidad F.7 — payload AuditLog determinista por evento
// ---------------------------------------------------------------------------
/** Vocabulario cerrado de auditoría (un `accion` por tipo de evento D1R). */
export const ACCION_AUDITORIA_POR_EVENTO: Record<TipoEventoGestion, string> = {
  ALTA: 'GESTION_ALTA',
  INVITACION: 'GESTION_INVITACION',
  ACEPTACION: 'GESTION_ACEPTADA',
  ACTIVACION: 'GESTION_ACTIVADA',
  SUSPENSION: 'GESTION_SUSPENDIDA',
  REACTIVACION: 'GESTION_REACTIVADA',
  CESION: 'GESTION_CEDIDA_TITULAR',
  DEVOLUCION: 'GESTION_DEVUELTA_GESTOR',
  CAMBIO_PERMISOS: 'GESTION_PERMISO_MODIFICADO',
  REVOCACION: 'GESTION_REVOCADA',
};

export interface ActorAuditoriaGestion {
  id: string;
  email: string;
  nombre: string;
}

export interface ParametrosAuditoriaEventoGestion {
  evento: Pick<
    EventoGestionCartera,
    'tipo' | 'gestionId' | 'actorId' | 'fecha' | 'motivo' | 'estadoAnterior' | 'estadoNuevo' | 'permiso'
  >;
  gestion: Pick<GestionCartera, 'id' | 'propietarioId' | 'gestorUsuarioId' | 'tipoGestor'>;
  /** Ejecutor de la mutación (sesión master): trazabilidad del QUIÉN. */
  actor: ActorAuditoriaGestion;
  resultado: 'EXITO' | 'ERROR';
  descripcion?: string;
}

/**
 * Construye la entrada de auditoría de un evento de gestión. Determinista: la
 * `fechaHora` es la del evento (no el reloj del escritor). El transporte
 * (`audit_logs`, append-only por reglas) lo aporta el llamante.
 */
export function construirAuditoriaEventoGestion(
  p: ParametrosAuditoriaEventoGestion
): Omit<AuditLog, 'id' | 'fechaHora'> & { fechaHora: string } {
  const detalles: Record<string, unknown> = {
    gestionId: p.gestion.id,
    propietarioId: p.gestion.propietarioId,
    gestorUsuarioId: p.gestion.gestorUsuarioId,
    tipoGestor: p.gestion.tipoGestor,
    evento: p.evento.tipo,
    actorEvento: p.evento.actorId,
    estadoAnterior: p.evento.estadoAnterior,
    estadoNuevo: p.evento.estadoNuevo,
    permiso: p.evento.permiso,
  };
  if (p.evento.motivo !== undefined) detalles['motivo'] = p.evento.motivo;
  return {
    usuarioId: p.actor.id,
    usuarioEmail: p.actor.email,
    usuarioNombre: p.actor.nombre,
    accion: ACCION_AUDITORIA_POR_EVENTO[p.evento.tipo],
    descripcion:
      p.descripcion ||
      `Gestión ${p.gestion.id}: ${p.evento.tipo} ${p.evento.estadoAnterior}→${p.evento.estadoNuevo}`,
    entidadAfectada: 'gestion_cartera',
    idAfectado: p.gestion.id,
    resultado: p.resultado,
    fechaHora: p.evento.fecha,
    detalles,
  };
}

// ---------------------------------------------------------------------------
// Identificadores (inyectables en tests)
// ---------------------------------------------------------------------------
export function generarIdGestion(azar?: () => number, ahoraMs?: number): string {
  const r = (azar || Math.random)().toString(36).substring(2, 8);
  return `gc_${ahoraMs ?? Date.now()}_${r}`;
}
