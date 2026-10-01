/**
 * BLOQUE 10 · UX-2 — CANAL DE INCIDENCIAS DE DATOS.
 *
 * Punto único (app-level, sin Firebase) donde la capa de datos informa de:
 *  - fallos de **lectura** (suscripciones)  → se traducen en estado ERROR de pantalla;
 *  - fallos de **guardado** (escrituras)    → se traducen en aviso visible no bloqueante.
 *
 * Reglas:
 *  - NO conoce Firestore/Storage: sólo recibe el error ya capturado y un origen.
 *  - NO cambia el control de flujo de quien informa: es un observador.
 *  - Conserva siempre el registro técnico (quien reporta sigue haciendo su `console.error`).
 *  - El mensaje de usuario **nunca** expone detalles técnicos del SDK (UX-2 §10).
 *
 * ALCANCE (2026-10-01 · Carteras) — `alcance: 'DATOS' | 'CAPACIDAD'`:
 *  - `DATOS`: lectura PRIMARIA del Portal. Su fallo es un error de carga de datos.
 *  - `CAPACIDAD`: lectura ADICIONAL (hoy, `gestiones_cartera` = carteras y
 *    delegaciones). Su fallo **se registra igual** (código, mensaje, traza), pero
 *    NO se resume en el aviso global «No se han podido leer algunos datos», NO
 *    entra en el estado de pantalla y NO deja la aplicación inutilizable: se
 *    avisa en un mensaje específico con su propio «Reintentar lectura».
 *    Ver `ORIGENES_CAPACIDAD_ADICIONAL` y `reportarErrorLectura`.
 */
import type { SectionType } from '../types';

export type TipoIncidenciaDatos = 'LECTURA' | 'GUARDADO';

/**
 * Alcance de una incidencia de datos:
 *  - `DATOS`: forma parte de la carga de datos del Portal (fallo = ERROR de pantalla).
 *  - `CAPACIDAD`: capacidad adicional (opcional); su fallo se registra y se avisa
 *    aparte, sin bloquear el resto del Portal.
 */
export type AlcanceIncidencia = 'DATOS' | 'CAPACIDAD';

/**
 * Lecturas tratadas como CAPACIDAD ADICIONAL.
 *
 * `gestiones_cartera` (ROADMAP-04) son las carteras/delegaciones donde la persona
 * es gestora: amplía el ámbito de inmuebles del gestor, pero un propietario sin
 * cartera no necesita nada de ella (`[]`). Por eso su denegación no puede
 * convertirse en un error de carga de los datos del Portal.
 */
export const ORIGENES_CAPACIDAD_ADICIONAL: readonly OrigenDatos[] = ['gestiones_cartera'];

/** ¿La lectura de este origen es una capacidad adicional (no bloquea el Portal)? */
export function esCapacidadAdicional(origen: OrigenDatos): boolean {
  return ORIGENES_CAPACIDAD_ADICIONAL.includes(origen);
}

/** Orígenes conocidos (colección o ámbito funcional). Se admiten claves libres. */
export const ORIGENES_CONOCIDOS = [
  'inmuebles',
  'candidatos',
  'propietarios',
  'solicitudes',
  'solicitudes_documentacion',
  'contratos',
  'invitaciones',
  'slots_visita',
  'gastos',
  'gastos_recurrentes',
  'prestamos',
  'expedientes_recomercializacion',
  'inmobiliarias',
  'propuestas_inmobiliaria',
  'leads_inmobiliarios',
  'incidencias',
  'tareas_mantenimiento',
  'garantias_reparacion',
  'necesidades_reforma',
  'proyectos_reforma',
  'polizas',
  'siniestros',
  'trabajos_profesionales',
  'presupuestos_profesionales',
  'valoraciones_profesionales',
  'tesoreria',
  'liquidaciones',
  'ordenes_pago',
  'tesoreria_gastos',
  'ficheros_sepa',
  'mandatos_sepa',
  'config_liquidacion',
  'morosidad',
  'actas',
  'suministros',
  'inventario',
  'inventario_historial',
  'habitaciones',
  'financiaciones',
  'facturas',
  'registros_facturacion',
  'envios_verifactu',
  'series_facturacion',
  'facturas_b2b',
  'aseguradoras',
  'solicitudes_seguro',
  'gmail_config',
  'usuarios',
  'profesionales',
  'enlaces_registro',
  'especialidades',
  'audit_logs',
  'modulos_config',
  'gestiones_cartera',
  'titularidades',
  'inversion',
  'sindicacion',
] as const;

/** Clave de origen: las conocidas están tipadas; se admite cualquier clave dinámica (p. ej. `${etiqueta}`). */
export type OrigenDatos = (typeof ORIGENES_CONOCIDOS)[number] | (string & {});

export interface IncidenciaDatos {
  readonly id: string;
  readonly origen: OrigenDatos;
  readonly tipo: TipoIncidenciaDatos;
  /** `DATOS` = carga del Portal · `CAPACIDAD` = capacidad adicional (no bloquea). */
  readonly alcance: AlcanceIncidencia;
  readonly codigo: string;
  readonly etiqueta: string;
  readonly mensaje: string;
  readonly ocurridoEn: number;
}

/**
 * Separa las incidencias por alcance: las que son carga de datos del Portal y las
 * de capacidades adicionales. La interfaz usa esta partición para no mezclar el
 * aviso global con el aviso específico de una capacidad.
 */
export function partirIncidenciasPorAlcance(incidencias: readonly IncidenciaDatos[]): {
  datos: readonly IncidenciaDatos[];
  capacidades: readonly IncidenciaDatos[];
} {
  return {
    datos: incidencias.filter((i) => i.alcance !== 'CAPACIDAD'),
    capacidades: incidencias.filter((i) => i.alcance === 'CAPACIDAD'),
  };
}

const ETIQUETAS_ORIGEN: Record<string, string> = {
  inmuebles: 'Inmuebles',
  candidatos: 'Candidatos',
  propietarios: 'Propietarios',
  solicitudes: 'Solicitudes',
  solicitudes_documentacion: 'Documentación de candidatos',
  contratos: 'Contratos',
  invitaciones: 'Invitaciones',
  slots_visita: 'Agenda de visitas',
  gastos: 'Gastos',
  gastos_recurrentes: 'Gastos recurrentes',
  prestamos: 'Préstamos',
  expedientes_recomercializacion: 'Recomercialización',
  inmobiliarias: 'Inmobiliarias',
  propuestas_inmobiliaria: 'Propuestas de inmobiliarias',
  leads_inmobiliarios: 'Leads',
  incidencias: 'Incidencias',
  tareas_mantenimiento: 'Mantenimiento',
  garantias_reparacion: 'Garantías',
  necesidades_reforma: 'Reformas',
  proyectos_reforma: 'Proyectos de reforma',
  polizas: 'Pólizas',
  siniestros: 'Siniestros',
  trabajos_profesionales: 'Trabajos de profesionales',
  presupuestos_profesionales: 'Presupuestos',
  valoraciones_profesionales: 'Valoraciones',
  tesoreria: 'Tesorería y liquidaciones',
  liquidaciones: 'Liquidaciones a propietarios',
  ordenes_pago: 'Órdenes de pago',
  tesoreria_gastos: 'Gastos de tesorería',
  ficheros_sepa: 'Ficheros SEPA',
  mandatos_sepa: 'Mandatos SEPA',
  config_liquidacion: 'Configuración de liquidación',
  morosidad: 'Morosidad',
  actas: 'Actas',
  suministros: 'Suministros',
  inventario: 'Inventario',
  inventario_historial: 'Historial de inventario',
  habitaciones: 'Habitaciones',
  financiaciones: 'Financiación',
  facturas: 'Facturación',
  registros_facturacion: 'Registro de facturación',
  envios_verifactu: 'Envíos VERI*FACTU',
  series_facturacion: 'Series de facturación',
  facturas_b2b: 'Factura electrónica B2B',
  aseguradoras: 'Aseguradoras',
  solicitudes_seguro: 'Seguro de impago',
  gmail_config: 'Conexión con Gmail',
  usuarios: 'Usuarios',
  profesionales: 'Profesionales',
  enlaces_registro: 'Enlaces de registro',
  especialidades: 'Especialidades',
  audit_logs: 'Auditoría',
  modulos_config: 'Módulos',
  gestiones_cartera: 'Carteras',
  titularidades: 'Titularidades',
  inversion: 'Inversión y valoración',
  sindicacion: 'Sindicación',
};

/** Nombre legible del origen (fallback: la propia clave). */
export function etiquetaOrigen(origen: OrigenDatos): string {
  return ETIQUETAS_ORIGEN[origen] ?? origen;
}

/** Código técnico del error, si lo trae (FirebaseError u otros). */
export function codigoDeError(error: unknown): string {
  if (!error) return 'desconocido';
  const candidato = (error as { code?: unknown }).code;
  if (typeof candidato === 'string' && candidato.length > 0) return candidato;
  const mensaje = (error as { message?: unknown }).message;
  if (typeof mensaje === 'string') {
    const m = mensaje.match(
      /(permission[-_ ]denied|unauthenticated|unavailable|deadline[-_ ]exceeded|failed[-_ ]precondition|not[-_ ]found|resource[-_ ]exhausted|internal|network[-_ ]request[-_ ]failed|storage\/(unauthorized|unauthenticated|canceled|retry-limit-exceeded))/i
    );
    if (m) return normalizarCodigo(m[1]);
  }
  return 'desconocido';
}

/** `PERMISSION_DENIED` / `permission denied` → `permission-denied` (forma canónica del SDK). */
export function normalizarCodigo(codigo: string): string {
  if (codigo.startsWith('storage/')) return codigo.toLowerCase();
  return codigo.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

/**
 * Mensaje para la persona usuaria. Deliberadamente sin detalles técnicos del SDK
 * (UX-2 §10): sólo qué ha pasado y qué puede hacer.
 */
export function mensajeLegible(codigo: string, tipo: TipoIncidenciaDatos): string {
  const accion = tipo === 'LECTURA' ? 'cargar' : 'guardar';
  switch (codigo) {
    case 'permission-denied':
      return tipo === 'LECTURA'
        ? 'No tienes permisos para consultar estos datos. Si crees que es un error, avisa a un administrador.'
        : 'No tienes permisos para guardar estos cambios. Si crees que es un error, avisa a un administrador.';
    case 'unauthenticated':
      return 'Tu sesión ya no es válida. Vuelve a iniciar sesión para continuar.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return `No hay conexión con el servidor de datos, así que no se pudieron ${accion} los datos. Inténtalo de nuevo en unos segundos.`;
    case 'failed-precondition':
      return 'La consulta necesita una configuración pendiente en la base de datos. Avisa a un administrador.';
    case 'resource-exhausted':
      return 'El servicio está limitando las peticiones en este momento. Inténtalo de nuevo en unos minutos.';
    default:
      return tipo === 'LECTURA'
        ? 'No se han podido cargar los datos.'
        : 'No se han podido guardar los cambios.';
  }
}

// ────────────────────────────────────────────────────────────── canal (observable)

const MAXIMO_INCIDENCIAS = 20;

let incidencias: IncidenciaDatos[] = [];
const oyentes = new Set<() => void>();
let secuencia = 0;

function notificar(): void {
  for (const oyente of Array.from(oyentes)) {
    try {
      oyente();
    } catch {
      // Un oyente defectuoso no puede romper el canal.
    }
  }
}

export function suscribirIncidenciasDatos(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

export function incidenciasDatos(): readonly IncidenciaDatos[] {
  return incidencias;
}

export function incidenciasPendientes(tipo?: TipoIncidenciaDatos): readonly IncidenciaDatos[] {
  return tipo ? incidencias.filter((i) => i.tipo === tipo) : incidencias;
}

function registrar(
  origen: OrigenDatos,
  tipo: TipoIncidenciaDatos,
  error: unknown,
  alcance: AlcanceIncidencia = esCapacidadAdicional(origen) ? 'CAPACIDAD' : 'DATOS'
): IncidenciaDatos {
  const codigo = codigoDeError(error);
  const incidencia: IncidenciaDatos = {
    id: `inc-${++secuencia}`,
    origen,
    tipo,
    alcance,
    codigo,
    etiqueta: etiquetaOrigen(origen),
    mensaje: mensajeLegible(codigo, tipo),
    ocurridoEn: Date.now(),
  };
  // Una sola incidencia vigente por origen+tipo (se sustituye, sin duplicar el aviso).
  incidencias = [incidencia, ...incidencias.filter((i) => !(i.origen === origen && i.tipo === tipo))].slice(0, MAXIMO_INCIDENCIAS);
  notificar();
  return incidencia;
}

/**
 * Informa de un fallo de LECTURA. Conserva el registro técnico llamando a `console.error`
 * con la misma etiqueta que usaba la capa de datos (si se aporta).
 *
 * `opciones.alcance` distingue una lectura PRIMARIA del Portal de una CAPACIDAD
 * ADICIONAL. Por defecto, el origen decide (`esCapacidadAdicional`): una capacidad
 * adicional se registra igual —el diagnóstico no se oculta— pero la interfaz la
 * presenta aparte y nunca como error de carga de los datos del Portal.
 */
export function reportarErrorLectura(
  origen: OrigenDatos,
  error: unknown,
  logTecnico?: string,
  opciones?: { alcance?: AlcanceIncidencia }
): void {
  console.error(logTecnico ?? `Firestore ${origen} snapshot error:`, error);
  registrar(origen, 'LECTURA', error, opciones?.alcance);
}

/**
 * Informa de un fallo de GUARDADO. Conserva el registro técnico con la misma etiqueta
 * que usaba la capa de datos (si se aporta). No cambia el valor de retorno de la escritura.
 */
export function reportarErrorGuardado(origen: OrigenDatos, error: unknown, logTecnico?: string): void {
  console.error(logTecnico ?? `Error saving ${origen} to Firestore:`, error);
  registrar(origen, 'GUARDADO', error);
}

/**
 * Informa del RESULTADO de un guardado cuyo contrato ya devuelve un booleano
 * (B5: `save*Firestore` → `Promise<boolean>`). Un `false` significa que la
 * persistencia NO confirmó el cambio: la interfaz no puede seguir presentándolo
 * como guardado (UX-2 §6). No modifica el control de flujo de quien informa.
 */
export function reportarResultadoGuardado(origen: OrigenDatos, ok: boolean, error?: unknown): void {
  if (ok) return;
  if (error) {
    registrar(origen, 'GUARDADO', error);
    return;
  }
  // El motivo técnico ya lo registró la capa de escritura; aquí se deja traza del
  // resultado negativo para poder diagnosticar el aviso de la interfaz.
  console.warn(`[UX-2] La persistencia no confirmó el cambio en ${origen}.`);
  registrar(origen, 'GUARDADO', { code: 'escritura-rechazada' });
}

export function descartarIncidencia(id: string): void {
  const siguiente = incidencias.filter((i) => i.id !== id);
  if (siguiente.length === incidencias.length) return;
  incidencias = siguiente;
  notificar();
}

export function descartarIncidencias(): void {
  if (incidencias.length === 0) return;
  incidencias = [];
  notificar();
}

/**
 * Limpia las incidencias de uno o varios orígenes. Al reintentar una LECTURA se
 * limpian sólo las de ese tipo: un fallo de guardado sigue vigente hasta que se
 * resuelva o se descarte expresamente (no se oculta por recargar datos).
 */
export function limpiarIncidenciasDe(origen: OrigenDatos | readonly OrigenDatos[], tipo?: TipoIncidenciaDatos): void {
  const origenes = typeof origen === 'string' ? [origen] : origen;
  const siguiente = incidencias.filter(
    (i) => !(origenes.includes(i.origen) && (!tipo || i.tipo === tipo))
  );
  if (siguiente.length === incidencias.length) return;
  incidencias = siguiente;
  notificar();
}

/** Última incidencia de un origen (o de un origen+tipo). */
export function ultimaIncidenciaDe(origen: OrigenDatos, tipo?: TipoIncidenciaDatos): IncidenciaDatos | undefined {
  return incidencias.find((i) => i.origen === origen && (!tipo || i.tipo === tipo));
}

/** Sólo para pruebas: reinicia el canal. */
export function reiniciarCanalIncidencias(): void {
  incidencias = [];
  notificar();
}

// ────────────────────────────────────────────────────────────── estado de lectura

export type EstadoLectura = 'CARGANDO' | 'LISTO' | 'ERROR';

export interface EstadoDatosPantalla {
  /** Estado agregado de las lecturas que necesita la pantalla. */
  readonly estado: EstadoLectura;
  /** Orígenes aún pendientes (si `estado === 'CARGANDO'`). */
  readonly pendientes: readonly OrigenDatos[];
  /** Orígenes en error (si `estado === 'ERROR'`). */
  readonly conError: readonly OrigenDatos[];
}

/** Orígenes activos → estado por origen; cualquiera no declarado se considera `LISTO`. */
export type MapaEstadosLectura = Readonly<Record<string, EstadoLectura>>;

export function estadoDeLectura(mapa: MapaEstadosLectura, origen: OrigenDatos): EstadoLectura {
  return mapa[origen] ?? 'LISTO';
}

/**
 * Agrega el estado de una pantalla: ERROR gana a CARGANDO (si algo falló, se dice);
 * CARGANDO gana a LISTO. Cero orígenes requeridos → LISTO.
 */
export function calcularEstadoDatosPantalla(
  origenes: readonly OrigenDatos[],
  mapa: MapaEstadosLectura
): EstadoDatosPantalla {
  const pendientes = origenes.filter((o) => estadoDeLectura(mapa, o) === 'CARGANDO');
  const conError = origenes.filter((o) => estadoDeLectura(mapa, o) === 'ERROR');
  if (conError.length > 0) return { estado: 'ERROR', pendientes, conError };
  if (pendientes.length > 0) return { estado: 'CARGANDO', pendientes, conError };
  return { estado: 'LISTO', pendientes, conError };
}

export function sembrarEstados(origenes: readonly OrigenDatos[], estado: EstadoLectura = 'CARGANDO'): MapaEstadosLectura {
  const mapa: Record<string, EstadoLectura> = {};
  for (const origen of origenes) mapa[origen] = estado;
  return mapa;
}

// ────────────────────────────────────────────────────────────── dependencias de pantalla

/**
 * Lecturas del host que necesita cada pantalla para poder afirmar «no hay datos».
 *
 * Regla de diseño (documentada en la inspección): se declaran las lecturas **primarias**
 * de la pantalla. Las lecturas secundarias (paneles internos) siguen reportando por el
 * canal —y por tanto se ven en el aviso— pero **no bloquean** la pantalla completa.
 * Las secciones que se suscriben por su cuenta no se bloquean aquí.
 */
const DEPENDENCIAS_PANTALLA: Partial<Record<SectionType, readonly OrigenDatos[]>> = {
  dashboard: ['inmuebles', 'contratos', 'gastos', 'candidatos', 'propietarios'],
  inicio: ['candidatos', 'inmuebles'],
  inmuebles: ['inmuebles', 'propietarios', 'contratos'],
  propietarios: ['propietarios', 'inmuebles'],
  inversion: ['inmuebles'],
  inquilinos: ['contratos', 'usuarios'],
  suministros: ['inmuebles'],
  cobros: ['contratos', 'inmuebles', 'propietarios'],
  tesoreria: ['liquidaciones', 'ordenes_pago', 'tesoreria_gastos', 'contratos', 'inmuebles', 'propietarios'],
  gastos: ['gastos', 'gastos_recurrentes', 'prestamos', 'inmuebles'],
  conciliacion: ['contratos', 'gastos', 'inmuebles'],
  morosidad: ['morosidad', 'contratos', 'inmuebles'],
  facturacion: ['contratos', 'inmuebles', 'propietarios'],
  fiscal: ['contratos', 'gastos', 'inmuebles'],
  informes: ['inmuebles', 'contratos', 'gastos', 'propietarios'],
  polizas: ['inmuebles', 'propietarios'],
  actas: ['contratos', 'inmuebles'],
  candidatos: ['candidatos', 'inmuebles'],
  preseleccionados: ['candidatos', 'inmuebles', 'invitaciones', 'slots_visita'],
  seguro_impago: ['solicitudes_seguro', 'inmuebles', 'propietarios'],
  formalizacion: ['contratos', 'candidatos', 'inmuebles', 'propietarios'],
  recomercializacion: ['expedientes_recomercializacion', 'inmuebles', 'inmobiliarias'],
  incidencias: ['incidencias', 'inmuebles', 'propietarios', 'contratos'],
  operaciones: ['inmuebles', 'propietarios', 'gastos'],
  analisis: ['candidatos', 'inmuebles'],
  administracion: ['usuarios', 'profesionales', 'enlaces_registro', 'especialidades', 'audit_logs'],
  configuracion: ['aseguradoras', 'gmail_config'],
};

export function origenesDePantalla(section: SectionType): readonly OrigenDatos[] {
  return DEPENDENCIAS_PANTALLA[section] ?? [];
}

/**
 * Lecturas que el host mantiene activas según el perfil (espejo exacto de las
 * condiciones de suscripción de `App.tsx`). Cualquier origen no declarado aquí
 * no puede dejar una pantalla en carga.
 */
const ORIGENES_COMUNES: readonly OrigenDatos[] = [
  'inmuebles',
  'candidatos',
  'propietarios',
  'contratos',
  'gastos',
  'gastos_recurrentes',
  'prestamos',
  'expedientes_recomercializacion',
  'incidencias',
  'inmobiliarias',
  'profesionales',
  'solicitudes_seguro',
  'invitaciones',
  'slots_visita',
  'enlaces_registro',
  'especialidades',
  'liquidaciones',
  'ordenes_pago',
  'tesoreria_gastos',
];

/**
 * Lecturas que el host mantiene activas según el perfil. Espejo exacto de las
 * condiciones de suscripción de `App.tsx`: cualquier origen ausente aquí no
 * puede dejar una pantalla en carga (el agregador lo trata como `LISTO`), y
 * cualquier origen presente DEBE tener siempre un camino a `LISTO` o a `ERROR`
 * (suscripción con callback de datos y callback de error instrumentado).
 */
export function origenesActivosDePerfil(
  tipoPerfil?: string | null,
  propietarioId?: string | null
): readonly OrigenDatos[] {
  if (tipoPerfil === 'ADMINISTRADOR') {
    return [...ORIGENES_COMUNES, 'morosidad', 'aseguradoras', 'gmail_config', 'usuarios', 'audit_logs'];
  }
  if (tipoPerfil === 'PROPIETARIO') {
    // El espejo de morosidad sólo se suscribe con propietarioId resuelto.
    return propietarioId ? [...ORIGENES_COMUNES, 'morosidad'] : ORIGENES_COMUNES;
  }
  return ORIGENES_COMUNES;
}
