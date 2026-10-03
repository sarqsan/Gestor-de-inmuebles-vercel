/**
 * OBSERVABILIDAD PERSISTENTE — «Lectura · Inmuebles: No tienes permisos…»
 * ---------------------------------------------------------------------------
 * PROBLEMA QUE RESUELVE
 *  `subscribeInmuebles` abre hasta CINCO lecturas distintas de `inmuebles` y todas
 *  desembocan en el MISMO origen del canal (`reportarErrorLectura`, ver `firebase.ts`),
 *  así que el aviso «Lectura · Inmuebles: No tienes permisos…» no dice cuál falló.
 *  El diagnóstico en memoria de `diagnosticoInmuebles.ts` ya sabe CUÁL y POR QUÉ,
 *  pero solo vive en la sesión que lo sufre (consola técnica y panel de la vista
 *  previa). Si la persona cierra la pestaña, la evidencia desaparece y el incidente
 *  vuelve a ser anónimo.
 *
 * QUÉ HACE ESTE MÓDULO
 *  Convierte cada informe de denegación en UNA incidencia mínima y duradera:
 *    · la escribe en el libro de auditoría YA EXISTENTE (`audit_logs`, ver
 *      `firebase.ts`: `allow create: if isSignedIn()`, `allow read: if isMasterAdmin()`,
 *      sin update ni delete), sin colecciones nuevas ni cambios de reglas;
 *    · mantiene SIEMPRE una copia local (fallback) para que nada se pierda si la
 *      escritura remota falla;
 *    · deduplica por contexto: la PRIMERA incidencia de cada contexto se conserva
 *      siempre y las repeticiones dentro de la ventana solo incrementan un contador
 *      (el error diario no puede generar ruido ilimitado);
 *    · etiqueta cada registro con `environment` (`production` = sesión real;
 *      `development` = vista previa/Arena) para que nunca se mezclen;
 *    · minimiza los datos: identificadores en forma `prefijo + huella`, nunca
 *      correos, tokens, credenciales, contenido documental ni datos patrimoniales.
 *
 * QUÉ NO HACE (límites deliberados)
 *  · No modifica consultas, reglas, permisos, modelo ni datos: es OBSERVACIÓN.
 *  · No llama al canal de incidencias ni a ningún registro desde su fallo: si la
 *    escritura falla, NO puede provocar otro aviso ni un bucle (FASE 5).
 *  · No lanza nunca: todas sus funciones públicas son tolerantes a fallos.
 *  · No decide ni concede accesos: las Firestore Rules siguen siendo la autoridad.
 *
 * Módulo PURO: cero imports de Firebase. El transporte remoto entra por inyección
 * (`enviarRemoto`), y el único módulo que habla con Firestore es `firebase.ts`.
 */
import {
  type CausaInmuebles,
  type InformeInmuebles,
  type OrigenLecturaInmuebles,
} from './diagnosticoInmuebles';

/** Marca de la incidencia dentro del libro de auditoría. Es el único valor que la identifica. */
export const ACCION_DIAGNOSTICO_INMUEBLES = 'DIAGNOSTICO_LECTURA_INMUEBLES';

/** Clave del búfer local (una por navegador/dispositivo). */
export const CLAVE_ALMACEN_INMUEBLES = 'rentselect_diagnosticos_lectura_inmuebles';

/** Repeticiones del MISMO contexto dentro de esta ventana no generan un registro nuevo. */
export const VENTANA_DEDUPLICACION_MS = 5 * 60 * 1000;

/** Tope del búfer local (los más recientes). */
export const MAXIMO_INCIDENCIAS_LOCALES = 20;

/** Tope de escrituras remotas por sesión: más allá, solo búfer local. */
export const MAXIMO_ENVIOS_REMOTOS_POR_SESION = 20;

/** Recorte del mensaje de error: los mensajes del SDK son cortos por diseño. */
export const MAXIMO_MENSAJE_ERROR = 300;

/** Entorno en el que se generó la incidencia. Nunca se mezclan en la pantalla. */
export type EntornoIncidencia = 'development' | 'production';

/** Identificador minimizado: prefijo legible + huella estable e irreversible. */
export interface IdentificadorMinimizado {
  /** Primeros caracteres, para reconocerlo a simple vista sin exponerlo. */
  readonly prefijo: string;
  /** Huella FNV-1a de 32 bits en hexadecimal: permite correlacionar sin revelar el valor. */
  readonly huella: string;
}

/** Contexto de la consulta que falló (solo TAMAÑOS: nunca la lista de ids). */
export interface AmbitoIncidencia {
  readonly inmuebleIds: number;
  readonly parciales: number;
  readonly carteras: number;
  readonly inmuebleIdEnEspejo?: boolean;
  readonly inmuebleIdParcial?: boolean;
}

/** Registro persistido: es lo que se escribe en `audit_logs` y lo que se guarda en local. */
export interface IncidenciaLecturaInmuebles {
  readonly tipo: typeof ACCION_DIAGNOSTICO_INMUEBLES;
  readonly version: 1;
  readonly environment: EntornoIncidencia;
  /** ISO de la última vez que se observó este contexto. */
  readonly fechaHora: string;
  /** ISO de la primera vez (la evidencia original nunca se pierde). */
  readonly primerFechaHora: string;
  readonly origen: OrigenLecturaInmuebles;
  readonly causa: CausaInmuebles;
  readonly errorCode: string;
  readonly errorMessage: string;
  /** Consulta literal que falló, sin datos personales. */
  readonly query: string;
  readonly scope: AmbitoIncidencia;
  readonly rol: string | null;
  readonly uid: IdentificadorMinimizado | null;
  readonly usuario: IdentificadorMinimizado | null;
  readonly propietarioId: IdentificadorMinimizado | null;
  readonly propietarioIdCliente: IdentificadorMinimizado | null;
  readonly mirrorPropietarioId: IdentificadorMinimizado | null;
  readonly profilePropietarioId: IdentificadorMinimizado | null;
  readonly inmuebleId: IdentificadorMinimizado | null;
  readonly failingTerm: string | null;
  readonly proyecto: string;
  readonly baseDeDatos: string;
  /** Repeticiones agregadas (1 = solo se observó una vez). */
  readonly contador: number;
  /** Clave de contexto: agrupa las repeticiones que la deduplicación absorbe. */
  readonly clave: string;
}

/** Búfer local inyectable (los tests no tocan `localStorage`). */
export interface AlmacenIncidencias {
  leer(): readonly IncidenciaLecturaInmuebles[];
  escribir(registros: readonly IncidenciaLecturaInmuebles[]): void;
}

export interface DependenciasObservabilidad {
  /** Reloj inyectable. */
  ahora?: () => Date;
  /** Búfer local inyectable. */
  almacen?: AlmacenIncidencias;
  /** Transporte remoto (en producción: `audit_logs`). Si falta, solo hay búfer local. */
  enviarRemoto?: (registro: IncidenciaLecturaInmuebles) => Promise<void>;
  /** Entorno de ejecución; por defecto, el que determine `entornoEjecucion`. */
  entorno?: EntornoIncidencia;
  /** Tope de escrituras remotas (inyectable para pruebas). */
  maximoEnviosRemotos?: number;
}

/** Resultado de intentar registrar: nunca lanza, siempre dice qué pasó. */
export interface ResultadoRegistroIncidencia {
  /** `escrita` = registro nuevo; `agregada` = repetición absorbida por la ventana; `omitida` = no se pudo. */
  readonly accion: 'escrita' | 'agregada' | 'omitida';
  readonly registro: IncidenciaLecturaInmuebles;
  readonly enviadoRemoto: boolean;
  readonly motivo: 'ok' | 'sin-transporte' | 'envio-fallido' | 'limite-envios' | 'datos-sensibles' | 'agregada-en-ventana';
  /** Campos que harían insegura la escritura remota (vacío = ninguno). */
  readonly violaciones: readonly string[];
}

// ===========================================================================
// Minimización de datos (privacidad)
// ===========================================================================

/** Huella estable FNV-1a de 32 bits: permite correlacionar sin poder reconstruir el valor. */
export function huellaEstable(valor: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < valor.length; i++) {
    h ^= valor.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Identificador en forma minimizada; `null` si no hay valor utilizable. */
export function minimizarIdentificador(valor: unknown): IdentificadorMinimizado | null {
  if (typeof valor !== 'string' || valor.length === 0) return null;
  return { prefijo: valor.slice(0, 6), huella: huellaEstable(valor) };
}

const PATRONES_SENSIBLES: ReadonlyArray<{ nombre: string; patron: RegExp }> = [
  { nombre: 'email', patron: /[\w.+-]+@[\w-]+\.[\w.-]+/g },
  { nombre: 'credencial', patron: /(bearer|basic)\s+\S+/gi },
  { nombre: 'token-largo', patron: /\b[A-Za-z0-9_-]{32,}\b/g },
  { nombre: 'clave-sensible', patron: /"(password|apiKey|refreshToken|idToken|accessToken)"\s*:/gi },
  { nombre: 'telefono', patron: /\+?\d{9,}/g },
];

/**
 * Mensaje del SDK saneado: sin correos, credenciales ni cadenas largas, y recortado.
 * El mensaje de Firestore es corto por diseño («Missing or insufficient permissions.»),
 * así que este paso no destruye información útil.
 */
export function sanearMensajeError(mensaje: string): string {
  let limpio = String(mensaje ?? '').replace(/\s+/g, ' ').trim();
  for (const { patron } of PATRONES_SENSIBLES) limpio = limpio.replace(patron, '[omitido]');
  return limpio.length > MAXIMO_MENSAJE_ERROR ? `${limpio.slice(0, MAXIMO_MENSAJE_ERROR)}…` : limpio;
}

/** Sustituye valores sensibles conocidos (ids de la sesión) por su forma minimizada. */
export function ocultarValoresConocidos(texto: string, valores: ReadonlyArray<string | null | undefined>): string {
  let resultado = texto;
  for (const valor of valores) {
    if (typeof valor !== 'string' || valor.length < 6) continue;
    const minimizado = minimizarIdentificador(valor);
    if (!minimizado) continue;
    resultado = resultado.split(valor).join(`${minimizado.prefijo}…[${minimizado.huella}]`);
  }
  return resultado;
}

/**
 * Campos sensibles hallados en el registro (vacío = seguro de escribir en el libro
 * remoto). Se inspeccionan SOLO los campos que pueden contener texto ajeno al
 * mecanismo (`errorMessage`, `failingTerm`, `query`, `rol`): los nombres de proyecto
 * y base de datos son constantes técnicas de este repositorio y una huella no es un
 * secreto. Además, cualquier correo en CUALQUIER campo invalida la escritura remota.
 */
export function camposSensiblesEnIncidencia(registro: IncidenciaLecturaInmuebles): string[] {
  const hallazgos = new Set<string>();
  const textosLibres = [registro.errorMessage, registro.failingTerm ?? '', registro.query, registro.rol ?? ''];
  for (const { nombre, patron } of PATRONES_SENSIBLES) {
    for (const texto of textosLibres) {
      patron.lastIndex = 0;
      if (patron.test(texto)) hallazgos.add(nombre);
    }
  }
  const serializado = JSON.stringify(registro);
  for (const { nombre, patron } of PATRONES_SENSIBLES) {
    if (nombre === 'email' || nombre === 'credencial') {
      patron.lastIndex = 0;
      if (patron.test(serializado)) hallazgos.add(nombre);
    }
  }
  return Array.from(hallazgos);
}

// ===========================================================================
// Construcción del registro
// ===========================================================================

function propietarioDeResumen(resumen: Record<string, unknown> | null): string | null {
  if (!resumen) return null;
  const valor = resumen.propietarioId;
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

function usuarioIdDeResumen(resumen: Record<string, unknown> | null): string | null {
  if (!resumen) return null;
  const valor = resumen.usuarioId;
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

/** Clave de contexto: agrupa exactamente las repeticiones que la ventana absorbe. */
export function claveDeduplicacion(registro: IncidenciaLecturaInmuebles): string {
  return [
    registro.origen,
    registro.errorCode,
    registro.causa,
    registro.query,
    registro.uid?.huella ?? 'sin-uid',
    registro.propietarioId?.huella ?? 'sin-pid',
    registro.inmuebleId?.huella ?? 'sin-inmueble',
  ].join('|');
}

/**
 * Construye el registro minimizado a partir del informe que ya produce la
 * instrumentación. No lee nada: solo transforma y minimiza.
 */
export function construirIncidenciaLecturaInmuebles(
  informe: InformeInmuebles,
  opciones: { entorno: EntornoIncidencia; momento?: string }
): IncidenciaLecturaInmuebles {
  const momento = opciones.momento ?? informe.momento ?? new Date().toISOString();
  const fallo = informe.comprobaciones.find((c) => c.ok === false) ?? null;
  const valoresSesion = [
    informe.authUid,
    usuarioIdDeResumen(informe.espejo),
    informe.pid,
    informe.propietarioIdCliente,
    propietarioDeResumen(informe.espejo),
    propietarioDeResumen(informe.perfil),
    informe.inmuebleId,
  ];
  const termino = fallo ? `${fallo.id} → ${fallo.observado}` : null;
  const registro: IncidenciaLecturaInmuebles = {
    tipo: ACCION_DIAGNOSTICO_INMUEBLES,
    version: 1,
    environment: opciones.entorno,
    fechaHora: momento,
    primerFechaHora: momento,
    origen: informe.origen,
    causa: informe.causa,
    errorCode: informe.errorFirebase.codigo,
    errorMessage: sanearMensajeError(informe.errorFirebase.mensaje),
    query: informe.consulta,
    scope: {
      inmuebleIds: informe.ambito.inmuebleIds,
      parciales: informe.ambito.inmueblesParciales,
      carteras: informe.ambito.carterasGestionadas,
      ...(informe.ambito.inmuebleIdEnEspejo === undefined ? {} : { inmuebleIdEnEspejo: informe.ambito.inmuebleIdEnEspejo }),
      ...(informe.ambito.inmuebleIdParcial === undefined ? {} : { inmuebleIdParcial: informe.ambito.inmuebleIdParcial }),
    },
    rol: informe.tipoPerfil,
    uid: minimizarIdentificador(informe.authUid),
    usuario: minimizarIdentificador(usuarioIdDeResumen(informe.espejo)),
    propietarioId: minimizarIdentificador(informe.pid),
    propietarioIdCliente: minimizarIdentificador(informe.propietarioIdCliente),
    mirrorPropietarioId: minimizarIdentificador(propietarioDeResumen(informe.espejo)),
    profilePropietarioId: minimizarIdentificador(propietarioDeResumen(informe.perfil)),
    inmuebleId: minimizarIdentificador(informe.inmuebleId),
    failingTerm: termino ? sanearMensajeError(ocultarValoresConocidos(termino, valoresSesion)) : null,
    proyecto: informe.proyecto,
    baseDeDatos: informe.baseDeDatos,
    contador: 1,
    clave: '',
  };
  return { ...registro, clave: claveDeduplicacion(registro) };
}

// ===========================================================================
// Búfer local (fallback y evidencia de este dispositivo)
// ===========================================================================

function esIncidenciaValida(valor: unknown): valor is IncidenciaLecturaInmuebles {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Partial<IncidenciaLecturaInmuebles>;
  return v.tipo === ACCION_DIAGNOSTICO_INMUEBLES && typeof v.fechaHora === 'string' && typeof v.origen === 'string';
}

/** Búfer por defecto: `localStorage` cuando existe; si no (o si falla), memoria del proceso. */
export function almacenIncidenciasPorDefecto(): AlmacenIncidencias {
  let memoria: readonly IncidenciaLecturaInmuebles[] = [];
  const hayLocalStorage = (() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch {
      return false;
    }
  })();
  if (!hayLocalStorage) {
    return { leer: () => memoria, escribir: (registros) => { memoria = [...registros]; } };
  }
  return {
    leer: () => {
      try {
        const bruto = localStorage.getItem(CLAVE_ALMACEN_INMUEBLES);
        if (!bruto) return [];
        const parseado: unknown = JSON.parse(bruto);
        return Array.isArray(parseado) ? parseado.filter(esIncidenciaValida) : [];
      } catch {
        return [];
      }
    },
    escribir: (registros) => {
      try {
        localStorage.setItem(CLAVE_ALMACEN_INMUEBLES, JSON.stringify(registros));
      } catch {
        // Cuota llena o almacenamiento bloqueado: se conserva en memoria y se sigue.
        memoria = [...registros];
      }
    },
  };
}

function leerLocal(almacen: AlmacenIncidencias): readonly IncidenciaLecturaInmuebles[] {
  try {
    return almacen.leer().filter(esIncidenciaValida);
  } catch {
    return [];
  }
}

function escribirLocal(almacen: AlmacenIncidencias, registros: readonly IncidenciaLecturaInmuebles[]): void {
  try {
    almacen.escribir(registros.slice(-MAXIMO_INCIDENCIAS_LOCALES));
  } catch {
    // El búfer local NUNCA puede romper la lectura que se está diagnosticando.
  }
}

/** Upsert por `clave`: la repetición agrega el contador del registro existente. */
function fusionarLocal(
  almacen: AlmacenIncidencias,
  registro: IncidenciaLecturaInmuebles
): readonly IncidenciaLecturaInmuebles[] {
  const actuales = leerLocal(almacen);
  const indice = actuales.findIndex((r) => r.clave === registro.clave);
  const resultado =
    indice < 0 ? [...actuales, registro] : [...actuales.slice(0, indice), registro, ...actuales.slice(indice + 1)];
  escribirLocal(almacen, resultado);
  return resultado.slice(-MAXIMO_INCIDENCIAS_LOCALES);
}

/** Incidencias guardadas en este dispositivo (más antigua primero). */
export function incidenciasLecturaInmueblesLocales(
  almacen: AlmacenIncidencias = almacenIncidenciasPorDefecto()
): readonly IncidenciaLecturaInmuebles[] {
  return leerLocal(almacen);
}

/** Borra SOLO el búfer local de este dispositivo (el libro remoto es inmutable por diseño). */
export function limpiarIncidenciasLecturaInmueblesLocales(
  almacen: AlmacenIncidencias = almacenIncidenciasPorDefecto()
): void {
  escribirLocal(almacen, []);
  notificarLocales();
}

const oyentesLocales = new Set<() => void>();

function notificarLocales(): void {
  for (const oyente of Array.from(oyentesLocales)) {
    try {
      oyente();
    } catch {
      // Un oyente defectuoso no puede romper la observabilidad.
    }
  }
}

/** Notifica los cambios del búfer local producidos en este proceso. */
export function suscribirIncidenciasLecturaInmuebles(oyente: () => void): () => void {
  oyentesLocales.add(oyente);
  return () => {
    oyentesLocales.delete(oyente);
  };
}

// ===========================================================================
// Registro (deduplicación + fallback + transporte)
// ===========================================================================

/** Estado de deduplicación por contexto (vive en el proceso, no se persiste). */
interface EstadoDeduplicacion {
  readonly registro: IncidenciaLecturaInmuebles;
  /** Última vez (ms) que se observó este contexto: define la ventana de deduplicación. */
  readonly ultimaVistaMs: number;
}

const estadoPorClave = new Map<string, EstadoDeduplicacion>();
const enviosEnCurso = new Set<string>();
let enviosRemotosSesion = 0;

/** Solo para pruebas: reinicia el estado de sesión (deduplicación y contador de envíos). */
export function _reiniciarEstadoObservabilidadParaPruebas(): void {
  estadoPorClave.clear();
  enviosEnCurso.clear();
  enviosRemotosSesion = 0;
  oyentesLocales.clear();
}

/**
 * Registra la incidencia de forma persistente, tolerante a fallos y sin bucle.
 * SIEMPRE devuelve un resultado; nunca lanza y nunca escribe dos veces el mismo contexto
 * dentro de la ventana de deduplicación.
 */
export async function registrarIncidenciaLecturaInmuebles(
  informe: InformeInmuebles,
  deps: DependenciasObservabilidad = {}
): Promise<ResultadoRegistroIncidencia> {
  const ahora = (deps.ahora ?? (() => new Date()))();
  const almacen = deps.almacen ?? almacenIncidenciasPorDefecto();
  const entorno = deps.entorno ?? 'development';
  const maximoEnvios = deps.maximoEnviosRemotos ?? MAXIMO_ENVIOS_REMOTOS_POR_SESION;

  let candidato: IncidenciaLecturaInmuebles;
  try {
    candidato = construirIncidenciaLecturaInmuebles(informe, { entorno, momento: ahora.toISOString() });
  } catch {
    // Si ni siquiera se puede construir, se abandona sin tocar nada: la lectura sigue.
    const vacio = construirIncidenciaVacia(entorno, ahora.toISOString());
    return { accion: 'omitida', registro: vacio, enviadoRemoto: false, motivo: 'datos-sensibles', violaciones: ['construccion'] };
  }

  const ahoraMs = ahora.getTime();
  const previa = estadoPorClave.get(candidato.clave);
  const dentroDeVentana = !!previa && ahoraMs - previa.ultimaVistaMs <= VENTANA_DEDUPLICACION_MS;

  if (previa && dentroDeVentana) {
    // Repetición: se agrega el contador (local + memoria) y NO se escribe de nuevo.
    const agregada: IncidenciaLecturaInmuebles = {
      ...previa.registro,
      fechaHora: candidato.fechaHora,
      contador: previa.registro.contador + 1,
    };
    estadoPorClave.set(agregada.clave, { registro: agregada, ultimaVistaMs: ahoraMs });
    fusionarLocal(almacen, agregada);
    notificarLocales();
    return { accion: 'agregada', registro: agregada, enviadoRemoto: false, motivo: 'agregada-en-ventana', violaciones: [] };
  }

  // Registro NUEVO: la primera incidencia de cada contexto se conserva siempre.
  const violaciones = camposSensiblesEnIncidencia(candidato);
  estadoPorClave.set(candidato.clave, { registro: candidato, ultimaVistaMs: ahoraMs });
  fusionarLocal(almacen, candidato);
  notificarLocales();

  if (violaciones.length > 0) {
    return { accion: 'escrita', registro: candidato, enviadoRemoto: false, motivo: 'datos-sensibles', violaciones };
  }
  if (!deps.enviarRemoto) {
    return { accion: 'escrita', registro: candidato, enviadoRemoto: false, motivo: 'sin-transporte', violaciones };
  }
  if (enviosRemotosSesion >= maximoEnvios) {
    return { accion: 'escrita', registro: candidato, enviadoRemoto: false, motivo: 'limite-envios', violaciones };
  }
  if (enviosEnCurso.has(candidato.clave)) {
    // Ya hay una escritura idéntica en vuelo: no se duplica ni se espera.
    return { accion: 'escrita', registro: candidato, enviadoRemoto: false, motivo: 'ok', violaciones };
  }

  enviosEnCurso.add(candidato.clave);
  try {
    await deps.enviarRemoto(candidato);
    enviosRemotosSesion += 1;
    return { accion: 'escrita', registro: candidato, enviadoRemoto: true, motivo: 'ok', violaciones };
  } catch {
    // El fallo del transporte remoto NO puede reabrir el diagnóstico ni producir otro
    // aviso: se anota el fallo, queda el búfer local y se termina.
    return { accion: 'escrita', registro: candidato, enviadoRemoto: false, motivo: 'envio-fallido', violaciones };
  } finally {
    enviosEnCurso.delete(candidato.clave);
  }
}

/** Registro de relleno para un fallo de construcción (nunca se escribe). */
function construirIncidenciaVacia(entorno: EntornoIncidencia, momento: string): IncidenciaLecturaInmuebles {
  const base: IncidenciaLecturaInmuebles = {
    tipo: ACCION_DIAGNOSTICO_INMUEBLES,
    version: 1,
    environment: entorno,
    fechaHora: momento,
    primerFechaHora: momento,
    origen: 'INM-OWN',
    causa: 'INCONCLUSA',
    errorCode: 'inconcluso',
    errorMessage: '',
    query: '',
    scope: { inmuebleIds: 0, parciales: 0, carteras: 0 },
    rol: null,
    uid: null,
    usuario: null,
    propietarioId: null,
    propietarioIdCliente: null,
    mirrorPropietarioId: null,
    profilePropietarioId: null,
    inmuebleId: null,
    failingTerm: null,
    proyecto: '',
    baseDeDatos: '',
    contador: 0,
    clave: '',
  };
  return { ...base, clave: 'inconclusa' };
}

// ===========================================================================
// Lectura del libro remoto (para la pantalla de administración)
// ===========================================================================

/**
 * Sobre documental que el transporte escribe en el libro de auditoría. Es la ÚNICA
 * definición de esa forma: el transporte (`firebase.ts`) la usa tal cual y las pruebas
 * pueden verificar el documento real sin reimplementarlo.
 *
 * Privacidad: `usuarioEmail` va vacío y `usuarioId` es la huella del UID (nunca el UID).
 * La incidencia completa viaja en `detalles.incidencia`, ya minimizada.
 */
export function documentoAuditoriaIncidencia(
  registro: IncidenciaLecturaInmuebles,
  id: string
): Record<string, unknown> {
  return {
    id,
    usuarioId: registro.uid ? `h:${registro.uid.huella}` : 'sin-sesion',
    usuarioEmail: '',
    usuarioNombre: 'Diagnóstico técnico (lectura de inmuebles)',
    accion: ACCION_DIAGNOSTICO_INMUEBLES,
    descripcion: `Lectura · Inmuebles — ${registro.origen} · ${registro.errorCode} · ${registro.causa}`,
    fechaHora: registro.fechaHora,
    entidadAfectada: 'modulo',
    idAfectado: registro.origen,
    resultado: 'ERROR',
    detalles: { incidencia: registro },
  };
}

/** Forma mínima de un `audit_logs` que nos interesa (evita acoplar la UI al tipo completo). */
export interface RegistroAuditoriaMinimo {
  readonly id: string;
  readonly accion?: string;
  readonly fechaHora?: string;
  readonly usuarioNombre?: string;
  readonly resultado?: string;
  readonly detalles?: Record<string, unknown>;
}

/**
 * Decodifica las incidencias que este mismo mecanismo escribió en `audit_logs`.
 * Ignora cualquier registro ajeno y cualquier registro incompleto.
 */
export function incidenciasDesdeAuditLogs(
  registros: readonly RegistroAuditoriaMinimo[] | null | undefined
): readonly IncidenciaLecturaInmuebles[] {
  if (!Array.isArray(registros)) return [];
  const salida: IncidenciaLecturaInmuebles[] = [];
  for (const registro of registros) {
    if (!registro || registro.accion !== ACCION_DIAGNOSTICO_INMUEBLES) continue;
    const candidato = (registro.detalles ?? {}).incidencia;
    if (!esIncidenciaValida(candidato)) continue;
    salida.push(candidato);
  }
  return salida;
}
