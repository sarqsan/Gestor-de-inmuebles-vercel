/**
 * F3 — ALTA / SELECCIÓN SEGURA DE TITULARES (LÓGICA DE SERVICIO)
 * ===============================================================
 * Endpoint de servidor que permite localizar una ficha de propietario ya
 * existente para añadirla como titular de un inmueble.
 *
 * Garantías (todas comprobables en tests):
 *  · AUTENTICADO: el ID token se verifica (firma, algoritmo, audiencia,
 *    emisor y caducidad) contra los certificados de Google.
 *  · AUTORIZADO SOBRE ESE INMUEBLE: se comprueba que el llamador puede
 *    gestionarlo (admin/master, titular canónico o cotitular por
 *    `titularidadesIds`). Sin ese derecho: 403.
 *  · MÍNIMO 3 CARACTERES y MÁXIMO 10 RESULTADOS.
 *  · RESPUESTA `{ id, nombre }` Y NADA MÁS: ni NIF, ni email, ni IBAN, ni
 *    datos fiscales. La proyección es una lista blanca.
 *  · SIN ENUMERACIÓN GLOBAL: la consulta es por prefijo y está limitada.
 *  · SIN SEGUNDO SISTEMA DE IDENTIDAD: se buscan `propietarios` existentes.
 *    Crear una titularidad NO crea ninguna cuenta de acceso.
 *  · SIN CREDENCIALES EN EL CLIENTE: la credencial de servicio sólo existe en
 *    el entorno del servidor.
 *
 * El cliente nunca decide la autorización: manda su token y el inmueble, y el
 * servidor deriva el derecho del espejo de identidad (`usuarios_auth` +
 * `usuarios`), replicando `perfilActualVeraz()` de las reglas.
 */
import type { CuentaServicio, IdentidadVerificada } from './googleBackend';
import {
  ClienteFirestoreRest,
  leerCuentaServicio,
  verificarIdToken,
} from './googleBackend';
import {
  LIMITE_LECTURA,
  MAXIMO_RESULTADOS,
  MINIMO_CARACTERES,
  normalizarTermino,
  proyectarResultados,
  seleccionarCoincidencias,
  terminoValido,
} from '../../src/titularidades/busquedaTitulares';
import type { CandidatoTitular } from '../../src/types';

/** Correo del master (paridad con `isMasterAdmin()` de firestore.rules). */
export const EMAIL_MASTER = process.env.MASTER_ADMIN_EMAIL || 'sarqsan2@gmail.com';

export type MotivoDenegacion =
  | 'peticion_invalida'
  | 'termino_corto'
  | 'no_autenticado'
  | 'sin_autorizacion'
  | 'servidor_sin_configurar'
  | 'error_interno';

export interface ResultadoBusquedaTitulares {
  ok: boolean;
  codigo: 200 | 400 | 401 | 403 | 500 | 503;
  motivo?: MotivoDenegacion;
  /** Detalle ACCIONABLE para quien integra/despliega; nunca un volcado técnico. */
  detalle?: string;
  resultados?: CandidatoTitular[];
}

export interface EntradaBusquedaTitulares {
  /** ID token de Firebase del usuario (sin el prefijo «Bearer »). */
  idToken?: string;
  inmuebleId?: string;
  termino?: string;
}

export type TipoPerfilServidor = 'ADMINISTRADOR' | 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO' | 'MASTER' | string;

export interface PerfilResuelto {
  uid: string;
  tipoPerfil: TipoPerfilServidor;
  propietarioId?: string;
  email?: string;
  esMaster: boolean;
}

export interface DocumentoServidor {
  id: string;
  datos: Record<string, unknown>;
}

export interface EventoAuditoria {
  tipo: 'BUSQUEDA_TITULARES' | 'BUSQUEDA_TITULARES_DENEGADA';
  fecha: string;
  uid?: string;
  inmuebleId?: string;
  /** Término normalizado (nunca el dato consultado tal cual). */
  terminoNormalizado?: string;
  resultados?: number;
  motivo?: MotivoDenegacion;
}

export interface DependenciasBackendTitulares {
  /** Credencial de servicio; `null` ⇒ el servidor no está configurado (503). */
  leerCredencial?: () => CuentaServicio | null;
  /** Verificación del ID token. `null` ⇒ no autenticado (401). */
  verificarToken?: (token: string) => Promise<IdentidadVerificada | null>;
  /** Lectura de un documento por ruta `coleccion/id`. */
  leerDocumento?: (ruta: string) => Promise<Record<string, unknown> | null>;
  /** Consulta por prefijo (acotada y limitada). */
  consultarPrefijo?: (
    coleccion: string,
    campo: string,
    prefijo: string,
    limite: number,
  ) => Promise<DocumentoServidor[]>;
  /** Registro de auditoría (inyectable; por defecto, log estructurado). */
  auditar?: (evento: EventoAuditoria) => void;
  ahora?: () => Date;
}

function auditoriaPorDefecto(evento: EventoAuditoria): void {
  // Log estructurado: el drenaje de logs de la plataforma es el libro de
  // auditoría de servidor (no hay credenciales ni datos personales en él).
  console.info(`[titulares] ${JSON.stringify(evento)}`);
}

function ahoraIso(deps: DependenciasBackendTitulares): string {
  return ((deps.ahora?.()) ?? new Date()).toISOString();
}

/** Construye las dependencias REALES a partir del entorno del servidor. */
export function crearDependenciasReales(
  cuenta?: CuentaServicio | null,
  forzarNuevo = false,
): DependenciasBackendTitulares {
  let cacheada: CuentaServicio | null | undefined = cuenta === undefined ? undefined : cuenta;
  let cliente: ClienteFirestoreRest | null = null;

  const obtenerCliente = (): ClienteFirestoreRest | null => {
    if (cacheada === undefined || forzarNuevo) cacheada = cuenta !== undefined ? cuenta : leerCuentaServicio();
    if (!cacheada) return null;
    if (!cliente) cliente = new ClienteFirestoreRest({ cuenta: cacheada });
    return cliente;
  };

  return {
    leerCredencial: () => {
      if (cacheada === undefined || forzarNuevo) cacheada = cuenta !== undefined ? cuenta : leerCuentaServicio();
      return cacheada;
    },
    verificarToken: (token: string) => {
      const c = cacheada ?? (cuenta !== undefined ? cuenta : leerCuentaServicio());
      if (!c) return Promise.resolve(null);
      return verificarIdToken(token, c.project_id);
    },
    leerDocumento: async (ruta: string) => {
      const c = obtenerCliente();
      if (!c) return null;
      const doc = await c.leerDocumento(ruta);
      return doc?.datos ?? null;
    },
    consultarPrefijo: async (coleccion, campo, prefijo, limite) => {
      const c = obtenerCliente();
      if (!c) return [];
      return c.consultarPrefijo(coleccion, campo, prefijo, limite);
    },
  };
}

/**
 * Resuelve el perfil del llamador replicando `perfilActualVeraz()` de las
 * reglas: el espejo (`usuarios_auth`) por sí solo NO basta; debe concordar con
 * la ficha autoritativa (`usuarios`) en `authUid`, `estado` y `tipoPerfil`.
 */
export async function resolverPerfilLlamador(
  identidad: IdentidadVerificada,
  deps: DependenciasBackendTitulares,
): Promise<PerfilResuelto | null> {
  if (!deps.leerDocumento) return null;
  const espejo = await deps.leerDocumento(`usuarios_auth/${encodeURIComponent(identidad.uid)}`);
  if (!espejo) return null;
  if (espejo.estado !== 'ACTIVO') return null;
  if (typeof espejo.authUid === 'string' && espejo.authUid && espejo.authUid !== identidad.uid) return null;

  const usuarioId = typeof espejo.usuarioId === 'string' ? espejo.usuarioId : '';
  if (!usuarioId) return null;
  const ficha = await deps.leerDocumento(`usuarios/${encodeURIComponent(usuarioId)}`);
  if (!ficha) return null;
  if (ficha.authUid !== identidad.uid) return null;
  if (ficha.estado !== 'ACTIVO') return null;
  if (ficha.tipoPerfil !== espejo.tipoPerfil) return null;

  const esMaster = (identidad.email || '').toLowerCase() === EMAIL_MASTER.toLowerCase();
  return {
    uid: identidad.uid,
    tipoPerfil: String(espejo.tipoPerfil || ''),
    propietarioId: typeof espejo.propietarioId === 'string' ? espejo.propietarioId : undefined,
    email: identidad.email,
    esMaster,
  };
}

/** ¿Puede este perfil gestionar las titularidades del inmueble? */
export function puedeGestionarInmueble(
  perfil: PerfilResuelto,
  inmueble: Record<string, unknown>,
): boolean {
  if (perfil.esMaster) return true;
  if (perfil.tipoPerfil === 'ADMINISTRADOR') return true;
  const pid = perfil.propietarioId;
  if (!pid) return false;
  if (inmueble.propietarioId === pid) return true;
  if (inmueble.propietarioPrincipalId === pid) return true;
  const indice = inmueble.titularesIds;
  return Array.isArray(indice) && indice.includes(pid);
}

const DENEGACION: Record<MotivoDenegacion, { codigo: 400 | 401 | 403 | 500 | 503; detalle: string }> = {
  peticion_invalida: { codigo: 400, detalle: 'Falta el inmueble (inmuebleId) o el término de búsqueda (termino).' },
  termino_corto: { codigo: 400, detalle: `El término de búsqueda debe tener al menos ${MINIMO_CARACTERES} caracteres.` },
  no_autenticado: { codigo: 401, detalle: 'Sesión no válida o caducada. Vuelve a iniciar sesión.' },
  sin_autorizacion: { codigo: 403, detalle: 'No tienes autorización sobre este inmueble.' },
  servidor_sin_configurar: {
    codigo: 503,
    detalle:
      'El servidor no tiene credencial de servicio configurada. Defina FIREBASE_SERVICE_ACCOUNT (JSON de la cuenta de servicio), FIREBASE_SERVICE_ACCOUNT_B64 (el mismo JSON en base64) o GOOGLE_APPLICATION_CREDENTIALS (ruta al fichero) en el entorno del servidor.',
  },
  error_interno: { codigo: 500, detalle: 'Error interno del servidor.' },
};

function denegar(
  motivo: MotivoDenegacion,
  deps: DependenciasBackendTitulares,
  extra: Partial<EventoAuditoria> = {},
): ResultadoBusquedaTitulares {
  const info = DENEGACION[motivo];
  (deps.auditar ?? auditoriaPorDefecto)({
    tipo: 'BUSQUEDA_TITULARES_DENEGADA',
    fecha: ahoraIso(deps),
    motivo,
    ...extra,
  });
  return { ok: false, codigo: info.codigo, motivo, detalle: info.detalle };
}

export async function buscarTitulares(
  entrada: EntradaBusquedaTitulares,
  deps: DependenciasBackendTitulares = {},
): Promise<ResultadoBusquedaTitulares> {
  const inmuebleId = typeof entrada?.inmuebleId === 'string' ? entrada.inmuebleId.trim() : '';
  const termino = typeof entrada?.termino === 'string' ? entrada.termino : '';

  if (!inmuebleId || !termino) return denegar('peticion_invalida', deps, { inmuebleId });
  if (!terminoValido(termino)) return denegar('termino_corto', deps, { inmuebleId });

  const terminoNormalizado = normalizarTermino(termino);

  // 1) Configuración del servidor (la credencial NUNCA viaja al cliente).
  const cuenta = deps.leerCredencial ? deps.leerCredencial() : leerCuentaServicio();
  if (!cuenta) return denegar('servidor_sin_configurar', deps, { inmuebleId, terminoNormalizado });

  // 2) Autenticación.
  const token = (entrada.idToken || '').trim();
  if (!token) return denegar('no_autenticado', deps, { inmuebleId, terminoNormalizado });
  let identidad: IdentidadVerificada | null = null;
  try {
    identidad = deps.verificarToken
      ? await deps.verificarToken(token)
      : await verificarIdToken(token, cuenta.project_id);
  } catch {
    identidad = null;
  }
  if (!identidad?.uid) return denegar('no_autenticado', deps, { inmuebleId, terminoNormalizado });

  try {
    // 3) Perfil + autorización sobre ESE inmueble.
    const perfil = await resolverPerfilLlamador(identidad, deps);
    if (!perfil) return denegar('no_autenticado', deps, { uid: identidad.uid, inmuebleId, terminoNormalizado });

    const inmueble = deps.leerDocumento
      ? await deps.leerDocumento(`inmuebles/${encodeURIComponent(inmuebleId)}`)
      : null;
    // Misma respuesta si no existe que si no es suyo: no se revela la existencia.
    if (!inmueble || !puedeGestionarInmueble(perfil, inmueble)) {
      return denegar('sin_autorizacion', deps, { uid: perfil.uid, inmuebleId, terminoNormalizado });
    }

    // 4) Búsqueda PREFIJO acotada (sin enumeración global).
    const crudo = deps.consultarPrefijo
      ? await deps.consultarPrefijo('propietarios', 'nombre', terminoNormalizado, LIMITE_LECTURA)
      : [];
    const candidatos = crudo
      .map((d) => ({ id: d.id, nombre: typeof d.datos?.nombre === 'string' ? d.datos.nombre : '' }))
      .filter((c) => c.id && c.nombre);

    const seleccion = seleccionarCoincidencias(candidatos, terminoNormalizado).slice(0, MAXIMO_RESULTADOS);
    // LISTA BLANCA: sólo `id` y `nombre`. Nada de NIF, email, IBAN ni fiscal.
    const resultados = proyectarResultados(seleccion);

    (deps.auditar ?? auditoriaPorDefecto)({
      tipo: 'BUSQUEDA_TITULARES',
      fecha: ahoraIso(deps),
      uid: perfil.uid,
      inmuebleId,
      terminoNormalizado,
      resultados: resultados.length,
    });

    return { ok: true, codigo: 200, resultados };
  } catch (error) {
    console.error('[titulares] Error en la búsqueda de titulares:', error);
    return denegar('error_interno', deps, { uid: identidad.uid, inmuebleId, terminoNormalizado });
  }
}
