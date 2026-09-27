/**
 * B4 — DRY-RUN DE MIGRACIÓN HISTÓRICA · Vocabulario canónico.
 *
 * Capa PURA: sin persistencia, sin Firebase, sin I/O, sin reloj, sin azar.
 * Todo lo que este módulo decide proviene de sus parámetros (fuentes +
 * catálogos inyectados). Nada de lo definido aquí escribe en Firestore,
 * Storage, auditoría ni ningún otro sistema.
 *
 * Reutiliza (no duplica): estados de datos patrimonial
 * (`COMPLETO/INCOMPLETO/BLOQUEADO`), modalidades de uso y estados de acceso.
 * B4 añade `NO_MIGRABLE` y `REVISION` como estados, y las decisiones
 * `AUTO/REVISION/INCOMPLETO/BLOQUEADO/NO_MIGRABLE`.
 */

/** Estados canónicos del registro (§4). */
export type EstadoMigracion = 'COMPLETO' | 'INCOMPLETO' | 'BLOQUEADO' | 'NO_MIGRABLE' | 'REVISION';

/** Nivel de decisión por registro (§17). */
export type DecisionMigracion = 'AUTO' | 'REVISION' | 'INCOMPLETO' | 'BLOQUEADO' | 'NO_MIGRABLE';

/** Confianza de la propuesta. `AUTO` exige `ALTA`. */
export type ConfianzaPropuesta = 'ALTA' | 'MEDIA' | 'BAJA';

/** Entidades que B4 sabe clasificar. Cualquier otra ⇒ `NO_MIGRABLE`. */
export type EntidadMigrable =
  | 'PROPIETARIO'
  | 'INMUEBLE'
  | 'CONTRATO'
  | 'GASTO'
  | 'COBRO'
  | 'DOCUMENTO'
  | 'LEGACY_STORAGE';

export const ENTIDADES_MIGRABLES: readonly EntidadMigrable[] = [
  'PROPIETARIO', 'INMUEBLE', 'CONTRATO', 'GASTO', 'COBRO', 'DOCUMENTO', 'LEGACY_STORAGE',
];

/** Regla de proveniencia (§6): referencia inequívoca al origen. Nunca se sobrescribe. */
export interface Proveniencia {
  /** Sistema origen: 'RENTASYNC' | 'LEGACY_STORAGE' | 'FIRESTORE_HISTORICO' | … */
  source: string;
  /** Colección origen (cuando el origen es documental/Firestore). */
  sourceCollection?: string;
  /** Fichero origen (cuando el origen es un fichero/exportación). */
  sourceFile?: string;
  /** Identificador original. `__ID_NO_RECUPERADO_*` si no es recuperable. */
  sourceId: string;
  /** Versión de esquema del origen, si existe. */
  sourceVersion?: string;
  /** sha256 del registro crudo, si es computable. */
  sourceHash?: string;
  /** Cadena de transformaciones previas (p. ej. 'FASE2:pegado_B', 'B1:normalizarMovimiento'). */
  cadena?: readonly string[];
}

/** Entrada uniforme al motor: un registro histórico con proveniencia. */
export interface RegistroHistorico {
  /** Entidad declarada en origen (puede no ser migrable → se clasifica). */
  entidad: string;
  proveniencia: Proveniencia;
  /** Payload crudo tal cual llegó (se clona; nunca se muta). */
  datos: Record<string, unknown>;
  /** Normalizado B1 cuando el adaptador Rentasync ya lo produjo (opcional). */
  normalizado?: {
    entidad: string;
    destino: Record<string, unknown>;
    transformaciones: ReadonlyArray<{ campo: string; regla: string; clasificacion: string }>;
    incidencias: ReadonlyArray<{ codigo: string; detalle: string; severidad: string; incidenciaFase2?: string }>;
    camposRequierenValidacion: readonly string[];
    bloqueado: boolean;
    motivoBloqueo?: string;
  };
}

// ---------------------------------------------------------------------------
// Catálogos inyectados (snapshots; el motor NUNCA lee Firestore en vivo)
// ---------------------------------------------------------------------------

/** Modalidades de uso patrimonial (D1/D1R): quién opera, NO destino automático. */
export type ModalidadUsoB4 = 'PROPIETARIO' | 'GESTOR_PROPIETARIO' | 'GESTOR_PROFESIONAL';

/** Referencia mínima de propietario destino conocido. */
export interface PropietarioCatalogo {
  id: string;
  nombre: string;
  nifCif?: string;
  email?: string;
  /** SIN_CUENTA = propietario sin cuenta; INVITADO; ACTIVO. */
  estadoAcceso?: 'SIN_CUENTA' | 'INVITADO' | 'ACTIVO';
  cuentaId?: string | null;
  /** Inmuebles que ya titulariza en destino (para coherencia, no para inferir). */
  inmuebleIds?: readonly string[];
}

/** Referencia mínima de inmueble destino conocido. */
export interface InmuebleCatalogo {
  id: string;
  direccion: string;
  ciudad?: string;
  referenciaCatastral?: string;
  propietarioId?: string;
  /** Identificadores históricos documentados ('SISTEMA:idOrigen'). */
  idsOrigen?: readonly string[];
}

/** Referencia mínima de contrato destino conocido (los cobros van embebidos). */
export interface ContratoCatalogo {
  id: string;
  inmuebleId: string;
  propietarioId?: string;
  idsOrigen?: readonly string[];
}

/** Mapeo documentado origen→destino (inyectado; jamás inferido por similitud). */
export interface MapeoDocumentado {
  alcance: 'PROPIETARIO' | 'INMUEBLE' | 'CONTRATO';
  /** Clave de origen con sistema: 'RENTASYNC:prop_…' / 'RENTASYNC:exp_…'. */
  origen: string;
  /** Id canónico de destino. */
  destino: string;
  nota?: string;
}

/** Registro ya existente en destino (para dedup contra destino). */
export interface ExistenteDestino {
  claveOrigen?: string;
  huellaExacta?: string;
  huellaFuerte?: string;
  claveImporteInmuebleCategoria?: string;
  destinoId: string;
  entidad: 'GASTO' | 'COBRO';
}

/** Todo el contexto de resolución, inyectado por el llamante. */
export interface CatalogosMigracion {
  propietarios: readonly PropietarioCatalogo[];
  inmuebles: readonly InmuebleCatalogo[];
  contratos: readonly ContratoCatalogo[];
  mapeos: readonly MapeoDocumentado[];
  existentes: readonly ExistenteDestino[];
  /** Destinos permitidos para planificar (patrimonial; no es autorización). */
  propietariosPermitidosIds?: readonly string[];
  /** Quién lanza el dry-run (solo informativo; JAMÁS destino implícito). */
  importador?: { uid: string; modalidad: ModalidadUsoB4 };
}

// ---------------------------------------------------------------------------
// Resoluciones (§7/§8)
// ---------------------------------------------------------------------------

export type EstadoResolucion = 'RESUELTO' | 'INCOMPLETO' | 'BLOQUEADO' | 'NO_MIGRABLE';

export interface ResolucionDestino {
  /** Id canónico destino, o null si no pudo determinarse. */
  id: string | null;
  estado: EstadoResolucion;
  /** Evidencia legible: regla aplicada, candidatos, motivo. Sin PII. */
  evidencia: string;
  /** Candidatos empatados (solo cuando hay ambigüedad). */
  candidatos?: readonly string[];
}

// ---------------------------------------------------------------------------
// Línea de dry-run (§3: conservar todo; nunca inferencia = dato)
// ---------------------------------------------------------------------------

export type TipoDuplicado = 'NINGUNO' | 'EXACTO' | 'PROBABLE' | 'LEGITIMO';

export interface ClasificacionDuplicado {
  tipo: TipoDuplicado;
  /** migrationKeys/claves con las que colisiona (sin PII). */
  con: readonly string[];
  motivo: string;
}

export interface ClasificacionHuerfano {
  es: boolean;
  motivo?: string;
}

export interface RelacionesLinea {
  /** migrationKey del padre propuesto, o null. */
  padre: string | null;
  padreResuelto: boolean;
  motivo?: string;
}

export interface FiscalLinea {
  /** Importe/categoría originales (intactos). */
  original: Record<string, unknown>;
  /** Valores transformados por B1 (intactos; B4 no recalcula). */
  transformado: Record<string, unknown>;
  /** Deducibilidad: solo se conserva si venía explícita; B4 NO la calcula. */
  deducible: boolean | null;
  clasificacion: string;
  motivo: string;
}

export interface DestinoPropuesto {
  coleccion: string;
  /** Id destino determinista cuando es computable; null si lo asigna la confirmación. */
  destinoId: string | null;
  /** VINCULAR = el destino ya existe; CREAR = propuesta de creación futura. */
  operacion: 'VINCULAR' | 'CREAR';
}

export interface LineaDryRun {
  /** Clave idempotente: sha256(sistema|colección/fichero|sourceId|entidad). */
  migrationKey: string;
  proveniencia: Proveniencia;
  entidad: string;
  /** Clon del crudo (campos desconocidos incluidos). */
  datoOriginal: Record<string, unknown>;
  /** Qué transformación se aplicó (B1/adaptador) o 'NINGUNA'. */
  transformacion: string;
  destinoPropuesto: DestinoPropuesto | null;
  propietarioDestinoId: string | null;
  estadoPropietario: EstadoResolucion;
  evidenciaPropietario: string;
  inmuebleDestinoId: string | null;
  estadoInmueble: EstadoResolucion;
  evidenciaInmueble: string;
  estado: EstadoMigracion;
  decision: DecisionMigracion;
  motivo: string;
  evidencias: readonly string[];
  confianza: ConfianzaPropuesta;
  duplicado: ClasificacionDuplicado;
  huerfano: ClasificacionHuerfano;
  relaciones: RelacionesLinea;
  fiscal?: FiscalLinea;
  legacyStorage?: {
    rutaOrigen: string;
    destinoPropuesto: string | null;
    estado: EstadoResolucion;
    motivo: string;
  };
}

// ---------------------------------------------------------------------------
// Resultado + plan futuro + resumen (§18/§22)
// ---------------------------------------------------------------------------

export interface ResumenCategoria {
  numero: number;
  fuentes: readonly string[];
  /** migrationKeys/sourceIds de ejemplo (acotado, sin PII). */
  ejemplos: readonly string[];
  motivo: string;
}

export interface ResumenDryRun {
  totalRegistros: number;
  auto: number;
  revision: number;
  incompleto: number;
  bloqueado: number;
  noMigrable: number;
  duplicados: number;
  huerfanos: number;
  conflictos: number;
  porCategoria: Record<string, ResumenCategoria>;
  porFuente: Record<string, { total: number; auto: number; revision: number; incompleto: number; bloqueado: number; noMigrable: number }>;
}

export interface DryRunResult {
  soloLectura: true;
  loteSha256: string;
  esquemaVersion: string;
  importadorVersion: string;
  /** Fecha/actor INYECTADOS por el llamante (opacos; no intervienen en decisiones). */
  fechaHora: string | null;
  actor: string | null;
  lineas: readonly LineaDryRun[];
  resumen: ResumenDryRun;
}

/** Operación potencial futura (§16/§18). Informativa: NO ejecutable por B4. */
export interface OperacionPotencial {
  migrationKey: string;
  sourceId: string;
  destinationId: string;
  decision: 'AUTO';
  reason: string;
  coleccion: string;
  operacion: 'VINCULAR' | 'CREAR';
}

export interface MigrationPlan {
  soloLectura: true;
  /** Solo AUTO entra en el plan; el resto queda fuera con su motivo en el dry-run. */
  operaciones: readonly OperacionPotencial[];
  excluidas: number;
  nota: string;
}
