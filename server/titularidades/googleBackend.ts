/**
 * BACKEND GOOGLE SIN SDK DE ADMINISTRACIÓN
 * ========================================
 * Integración de servidor con Firebase (Firestore + verificación de identidad)
 * usando ÚNICAMENTE la biblioteca estándar de Node (`node:crypto`) y las API
 * REST públicas de Google.
 *
 * ¿Por qué sin `firebase-admin`?
 * ------------------------------
 * `main` tiene una prueba GUARDARRAÍL explícita (tests/baja-usuarios.test.ts:
 * «sin Firebase Admin SDK (ni dependencia ni import)») que prohíbe el SDK de
 * administración en las dependencias del proyecto: su presencia abriría una vía
 * de borrado de identidades (deleteUser) incompatible con la arquitectura de
 * espejo de identidad. Esa prueba NO se toca. Por tanto, la integración de
 * servidor se construye sobre las API REST:
 *
 *   · autenticación de servicio → JWT RS256 firmado con `node:crypto`
 *     (intercambio OAuth2 `urn:ietf:params:oauth:grant-type:jwt-bearer`);
 *   · verificación del ID token del usuario → certificados públicos x509 de
 *     Google (comprueba algoritmo, `kid`, firma, `aud`, `iss` y `exp`);
 *   · lectura de Firestore → REST v1 (`get` y `runQuery`).
 *
 * No es funcionalidad "opcional": es la implementación completa. El único
 * requisito de despliegue es la credencial de servicio (variable de entorno).
 * Esta identidad de servidor es independiente de las llaves IA por titular:
 * `GEMINI_API_KEY` global no autoriza Firestore ni se usa como llave compartida
 * de proveedor. Sin credencial de Google la ruta protegida falla cerrada con
 * instrucciones de configuración; nunca degrada en silencio hacia "sin autenticar".
 */
import {
  createPrivateKey,
  createSign,
  createVerify,
  randomUUID,
  type KeyObject,
} from 'node:crypto';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CuentaServicio {
  project_id: string;
  client_email: string;
  private_key: string;
  private_key_id?: string;
  token_uri?: string;
}

export type ImplementacionFetch = (url: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string>; arrayBuffer?: () => Promise<ArrayBuffer>; headers?: { get(n: string): string | null } }>;

const TOKEN_URI_DEFECTO = 'https://oauth2.googleapis.com/token';
const CERTIFICADOS_URI =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const ALCANCES = ['https://www.googleapis.com/auth/datastore', 'https://www.googleapis.com/auth/cloud-platform'];
const MS_ANTELACION = 60_000;
const MS_TIMEOUT = 10_000;

/** Guardarraíl para los transportes locales de aceptación P2; nunca resuelve destinos por defecto. */
export function validarDestinoEmuladorP2(
  producto: 'firestore' | 'storage',
  proyectoId: string,
  entorno: NodeJS.ProcessEnv = process.env,
): string {
  const variable = producto === 'firestore' ? 'FIRESTORE_EMULATOR_HOST' : 'FIREBASE_STORAGE_EMULATOR_HOST';
  const puerto = producto === 'firestore' ? '8080' : '9199';
  const fuentesCredenciales = ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_B64',
    'FIREBASE_SERVICE_ACCOUNT_PATH', 'GOOGLE_APPLICATION_CREDENTIALS'];
  const host = entorno[variable];
  if (entorno.NODE_ENV !== 'test' || entorno.VERCEL || entorno.VERCEL_ENV
    || !proyectoId.startsWith('demo-') || entorno.GCLOUD_PROJECT !== proyectoId
    || fuentesCredenciales.some((fuente) => entorno[fuente] !== undefined)
    || typeof host !== 'string' || !/^(?:127\.0\.0\.1|localhost):\d+$/.test(host)
    || host.slice(host.lastIndexOf(':') + 1) !== puerto) {
    throw new Error('P2_EMULADOR_DESTINO_NO_SEGURO');
  }
  return `http://${host}`;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function b64url(texto: string | Buffer): string {
  return Buffer.from(texto).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlJson(valor: unknown): string {
  return b64url(JSON.stringify(valor));
}

function decodificarB64url(segmento: string): string {
  return decodificarB64urlBuffer(segmento).toString('utf8');
}

/**
 * Decodificación en BYTES. Imprescindible para la firma: pasarla por UTF-8
 * corrompería los bytes y TODO token parecería inválido (fallo que, por
 * suerte, es cerrado: nunca abre la puerta).
 */
function decodificarB64urlBuffer(segmento: string): Buffer {
  const normalizado = segmento.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = normalizado.length % 4 === 0 ? '' : '='.repeat(4 - (normalizado.length % 4));
  return Buffer.from(normalizado + relleno, 'base64');
}

function normalizarClavePrivada(clave: string): string {
  return (clave || '').replace(/\\n/g, '\n').trim();
}

export type CodigoErrorCredencial = 'FIREBASE_CREDENCIAL_MALFORMADA' | 'FIREBASE_CREDENCIAL_ILEGIBLE' | 'FIREBASE_CREDENCIAL_CONTRADICTORIA';

/** Solo códigos seguros: nunca adjuntar el JSON, la ruta o el error de OpenSSL. */
export class ErrorCredencialServicio extends Error {
  constructor(readonly codigo: CodigoErrorCredencial) { super(codigo); }
}

/** null significa AUSENCIA real. Una fuente explícita inválida nunca se ignora. */
export function leerCuentaServicio(entorno: NodeJS.ProcessEnv = process.env): CuentaServicio | null {
  const fuentes = ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_B64',
    'FIREBASE_SERVICE_ACCOUNT_PATH', 'GOOGLE_APPLICATION_CREDENTIALS'] as const;
  let elegida: CuentaServicio | null = null;
  for (const fuente of fuentes) {
    const valor = entorno[fuente];
    if (valor === undefined) continue;
    if (!valor.trim()) throw new ErrorCredencialServicio('FIREBASE_CREDENCIAL_MALFORMADA');
    let crudo = valor;
    if (fuente === 'FIREBASE_SERVICE_ACCOUNT_B64') {
      const b64 = valor.replace(/\s/g, '');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length % 4 === 1
        || Buffer.from(b64, 'base64').toString('base64').replace(/=+$/, '') !== b64.replace(/=+$/, '')) {
        throw new ErrorCredencialServicio('FIREBASE_CREDENCIAL_MALFORMADA');
      }
      crudo = Buffer.from(b64, 'base64').toString('utf8');
    } else if (fuente.endsWith('_PATH') || fuente === 'GOOGLE_APPLICATION_CREDENTIALS') {
      try { crudo = readFileSync(valor, 'utf8'); }
      catch { throw new ErrorCredencialServicio('FIREBASE_CREDENCIAL_ILEGIBLE'); }
    }
    const cuenta = parsearCuentaServicio(crudo);
    if (!cuenta) throw new ErrorCredencialServicio('FIREBASE_CREDENCIAL_MALFORMADA');
    if (elegida && (elegida.project_id !== cuenta.project_id || elegida.client_email !== cuenta.client_email
      || elegida.private_key !== cuenta.private_key || elegida.private_key_id !== cuenta.private_key_id)) {
      throw new ErrorCredencialServicio('FIREBASE_CREDENCIAL_CONTRADICTORIA');
    }
    elegida = cuenta;
  }
  return elegida;
}

export function parsearCuentaServicio(crudo: string): CuentaServicio | null {
  if (!crudo) return null;
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(crudo) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
  const projectId = typeof datos.project_id === 'string' ? datos.project_id : '';
  const clientEmail = typeof datos.client_email === 'string' ? datos.client_email : '';
  const privateKey = typeof datos.private_key === 'string' ? normalizarClavePrivada(datos.private_key) : '';
  if (!projectId || !clientEmail || !privateKey || !/^[a-z][a-z0-9-]+$/.test(projectId)
    || !/^[^\s@]+@[^\s@]+$/.test(clientEmail)) return null;
  if (datos.token_uri !== undefined && datos.token_uri !== TOKEN_URI_DEFECTO) return null;
  try {
    if (createPrivateKey(privateKey).asymmetricKeyType !== 'rsa') return null;
  } catch { return null; }

  return {
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
    private_key_id: typeof datos.private_key_id === 'string' ? datos.private_key_id : undefined,
    token_uri: typeof datos.token_uri === 'string' ? datos.token_uri : undefined,
  };
}

// ---------------------------------------------------------------------------
// Autorización de servicio: JWT RS256 → token OAuth2
// ---------------------------------------------------------------------------

/** Construye el JWT de assert de la cuenta de servicio (sin firmar dependencias). */
export function firmarJwtCuentaServicio(
  cuenta: CuentaServicio,
  opciones: { alcances?: string[]; ahora?: Date; jti?: string } = {},
): string {
  const ahora = Math.floor(((opciones.ahora?.getTime?.()) ?? Date.now()) / 1000);
  const cabecera = { alg: 'RS256', typ: 'JWT', ...(cuenta.private_key_id ? { kid: cuenta.private_key_id } : {}) };
  const cuerpo = {
    iss: cuenta.client_email,
    sub: cuenta.client_email,
    scope: (opciones.alcances || ALCANCES).join(' '),
    aud: cuenta.token_uri || TOKEN_URI_DEFECTO,
    iat: ahora,
    exp: ahora + 3600,
    jti: opciones.jti || randomUUID(),
  };
  const firmable = `${b64urlJson(cabecera)}.${b64urlJson(cuerpo)}`;
  // Sin codificación: `sign` devuelve el Buffer de la firma y `b64url` lo
  // transforma a base64url. (Codificarlo antes a base64 y pasar esa CADENA a
  // `b64url` corrompería la firma.)
  const firma = createSign('RSA-SHA256').update(firmable).sign(cuenta.private_key);
  return `${firmable}.${b64url(firma)}`;
}

interface TokenCacheado {
  token: string;
  expiraEn: number;
}

const cacheTokens = new Map<string, TokenCacheado>();

/** Vacía la caché de tokens (producción: no usar; pruebas: sí). */
export function reiniciarCacheTokens(): void {
  cacheTokens.clear();
}

function fetchPorDefecto(): ImplementacionFetch {
  return fetch as unknown as ImplementacionFetch;
}

/**
 * Ejecuta una petición con señal de aborto real: sin ella, una API de Google
 * que no respondiera dejaría la petición HTTP colgada hasta el límite del
 * runtime serverless.
 */
async function withTimeout<T>(fabricante: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), MS_TIMEOUT);
  try {
    return await fabricante(controlador.signal);
  } finally {
    clearTimeout(temporizador);
  }
}

export async function obtenerTokenAcceso(
  cuenta: CuentaServicio,
  opciones: { alcances?: string[]; fetchImpl?: ImplementacionFetch; ahora?: Date } = {},
): Promise<string> {
  const alcances = opciones.alcances || ALCANCES;
  const claveCache = `${cuenta.client_email}|${alcances.join(' ')}`;
  const ahoraMs = (opciones.ahora?.getTime?.()) ?? Date.now();
  const cacheado = cacheTokens.get(claveCache);
  if (cacheado && cacheado.expiraEn - MS_ANTELACION > ahoraMs) return cacheado.token;

  const asercion = firmarJwtCuentaServicio(cuenta, { alcances, ahora: opciones.ahora });
  const ejecutar = opciones.fetchImpl || fetchPorDefecto();
  const respuesta = await withTimeout((signal) =>
    ejecutar(cuenta.token_uri || TOKEN_URI_DEFECTO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: asercion,
      }).toString(),
      signal,
    }) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
  );

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    throw new Error(`No se ha podido autorizar la cuenta de servicio (HTTP ${respuesta.status}). ${detalle}`.trim());
  }
  const datos = (await respuesta.json()) as { access_token?: string; expires_in?: number };
  if (!datos.access_token) throw new Error('La respuesta de autorización no incluye access_token.');
  cacheTokens.set(claveCache, {
    token: datos.access_token,
    expiraEn: ahoraMs + Math.max(60, Number(datos.expires_in) || 3600) * 1000,
  });
  return datos.access_token;
}

// ---------------------------------------------------------------------------
// Verificación del ID token del usuario
// ---------------------------------------------------------------------------

export interface IdentidadVerificada {
  uid: string;
  email?: string;
}

interface CertificadosCacheados {
  certificados: Record<string, string>;
  expiraEn: number;
}

let cacheCertificados: CertificadosCacheados | null = null;

/** Vacía la caché de certificados (producción: no usar; pruebas: sí). */
export function reiniciarCacheCertificados(): void {
  cacheCertificados = null;
}

function segundosDeCacheControl(valor: string | null | undefined): number {
  if (!valor) return 3600;
  const coincide = /max-age=(\d+)/i.exec(valor);
  return coincide ? Math.max(60, Number(coincide[1]) || 3600) : 3600;
}

export async function obtenerCertificados(
  opciones: { fetchImpl?: ImplementacionFetch; ahora?: Date } = {},
): Promise<Record<string, string>> {
  const ahoraMs = (opciones.ahora?.getTime?.()) ?? Date.now();
  if (cacheCertificados && cacheCertificados.expiraEn > ahoraMs) return cacheCertificados.certificados;

  const ejecutar = opciones.fetchImpl || fetchPorDefecto();
  const respuesta = await withTimeout((signal) =>
    ejecutar(CERTIFICADOS_URI, { signal }) as Promise<{
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
      headers?: { get(n: string): string | null };
    }>,
  );
  if (!respuesta.ok) throw new Error(`No se han podido obtener los certificados de Google (HTTP ${respuesta.status}).`);
  const certificados = (await respuesta.json()) as Record<string, string>;
  if (!certificados || Object.keys(certificados).length === 0) {
    throw new Error('Google no ha devuelto certificados de firma.');
  }
  cacheCertificados = {
    certificados,
    expiraEn: ahoraMs + segundosDeCacheControl(respuesta.headers?.get?.('cache-control')) * 1000,
  };
  return certificados;
}

/**
 * Verifica un ID token de Firebase: algoritmo, `kid`, firma, audiencia,
 * emisor y caducidad. Devuelve `null` si cualquier comprobación falla.
 */
export async function verificarIdToken(
  token: string,
  projectId: string,
  opciones: { fetchImpl?: ImplementacionFetch; ahora?: Date } = {},
): Promise<IdentidadVerificada | null> {
  if (!token || !projectId) return null;
  const partes = String(token).split('.');
  if (partes.length !== 3) return null;

  let cabecera: { alg?: string; kid?: string };
  let cuerpo: { aud?: string; iss?: string; exp?: number; iat?: number; sub?: string; email?: string };
  try {
    cabecera = JSON.parse(decodificarB64url(partes[0]));
    cuerpo = JSON.parse(decodificarB64url(partes[1]));
  } catch {
    return null;
  }

  // Sólo RS256: aceptar `none` o algoritmos simétricos sería un fallo grave.
  if (cabecera?.alg !== 'RS256' || !cabecera.kid) return null;

  let certificados: Record<string, string>;
  try {
    certificados = await obtenerCertificados(opciones);
  } catch {
    // Sin certificados no se puede verificar: se DENIEGA (nunca se falla
    // abierto). El motivo se queda en el log del servidor.
    return null;
  }
  const certificado = certificados[cabecera.kid];
  if (!certificado) return null;

  const firmable = `${partes[0]}.${partes[1]}`;
  const firma = decodificarB64urlBuffer(partes[2]);
  let firmaValida = false;
  try {
    firmaValida = createVerify('RSA-SHA256').update(firmable).verify(certificado as unknown as KeyObject, firma);
  } catch {
    return null;
  }
  if (!firmaValida) return null;

  const ahoraSegundos = Math.floor((((opciones.ahora?.getTime?.()) ?? Date.now())) / 1000);
  if (typeof cuerpo.exp !== 'number' || cuerpo.exp <= ahoraSegundos) return null;
  if (typeof cuerpo.iat === 'number' && cuerpo.iat - ahoraSegundos > 300) return null;
  if (cuerpo.aud !== projectId) return null;
  if (cuerpo.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!cuerpo.sub) return null;

  return { uid: cuerpo.sub, email: cuerpo.email };
}

// ---------------------------------------------------------------------------
// Firestore REST
// ---------------------------------------------------------------------------

export type ValorFirestore =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: ValorFirestore[] } }
  | { mapValue: { fields?: Record<string, ValorFirestore> } };

export interface DocumentoFirestore {
  name?: string;
  fields?: Record<string, ValorFirestore>;
  createTime?: string;
  updateTime?: string;
}

export function codificarValor(valor: unknown): ValorFirestore {
  if (valor === null || valor === undefined) return { nullValue: null };
  if (typeof valor === 'string') return { stringValue: valor };
  if (typeof valor === 'boolean') return { booleanValue: valor };
  if (typeof valor === 'number') {
    return Number.isInteger(valor) ? { integerValue: String(valor) } : { doubleValue: valor };
  }
  if (Array.isArray(valor)) return { arrayValue: { values: valor.map(codificarValor) } };
  // Fechas como `timestamp` nativo de Firestore (ordenables y consultables por rango).
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? { nullValue: null } : { timestampValue: valor.toISOString() };
  }
  if (typeof valor === 'object') {
    const fields: Record<string, ValorFirestore> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (v === undefined) continue;
      fields[k] = codificarValor(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(valor) };
}

export function decodificarValor(valor: ValorFirestore | undefined): unknown {
  if (!valor) return null;
  if ('stringValue' in valor) return valor.stringValue;
  if ('integerValue' in valor) return Number(valor.integerValue);
  if ('doubleValue' in valor) return valor.doubleValue;
  if ('booleanValue' in valor) return valor.booleanValue;
  if ('nullValue' in valor) return null;
  if ('timestampValue' in valor) return valor.timestampValue;
  if ('arrayValue' in valor) return (valor.arrayValue.values || []).map(decodificarValor);
  if ('mapValue' in valor) return decodificarCampos(valor.mapValue.fields || {});
  return null;
}

export function decodificarCampos(fields: Record<string, ValorFirestore>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields || {})) salida[k] = decodificarValor(v);
  return salida;
}

export interface DocumentoLeido {
  id: string;
  datos: Record<string, unknown>;
  /** Versión del documento (updateTime de Firestore). Ausente en documentos recién creados sin lectura posterior. */
  updateTime?: string;
}

export type PrecondicionEscrituraFirestore =
  | { tipo: 'NO_EXISTE' }
  | { tipo: 'VERSION'; updateTime: string };

export interface EscrituraDocumentoFirestoreAtomica {
  /** Parche de campos explícitos; evita recodificar campos ajenos al actualizar renta P4. */
  camposActualizar?: readonly string[];
  coleccion: string;
  id: string;
  datos: Record<string, unknown>;
  precondicion: PrecondicionEscrituraFirestore;
}

export interface ClienteFirestoreOpciones {
  cuenta: CuentaServicio;
  fetchImpl?: ImplementacionFetch;
  ahora?: Date;
  /**
   * Base de datos Firestore. Por defecto `(default)` (comportamiento histórico,
   * el que usa la búsqueda de titulares). El núcleo de IA pasa la base con
   * nombre en la que vive la aplicación (`firebase-applet-config.json`).
   */
  baseDatosId?: string;
  /** Opt-in exclusivo de aceptación P2 con demo project y emulador local validado. */
  usarEmuladorFirebase?: boolean;
}

/** Ruta de campo para `updateMask`: identificadores simples tal cual; el resto, entre comillas invertidas. */
function rutaCampo(campo: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(campo)) return campo;
  return '`' + campo.replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`';
}

export class ClienteFirestoreRest {
  private readonly base: string;

  constructor(private readonly opciones: ClienteFirestoreOpciones) {
    const baseDatos = encodeURIComponent(opciones.baseDatosId || '(default)');
    const baseApi = opciones.usarEmuladorFirebase
      ? validarDestinoEmuladorP2('firestore', opciones.cuenta.project_id)
      : 'https://firestore.googleapis.com';
    this.base = `${baseApi}/v1/projects/${opciones.cuenta.project_id}/databases/${baseDatos}/documents`;
  }

  get projectId(): string {
    return this.opciones.cuenta.project_id;
  }

  get baseDatosId(): string {
    return this.opciones.baseDatosId || '(default)';
  }

  private async cabeceras(): Promise<Record<string, string>> {
    // Firestore Emulator acepta el token de propietario para el transporte REST.
    // Este camino sólo se habilita con el guardarraíl P2 demo+loopback.
    if (this.opciones.usarEmuladorFirebase) {
      return { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
    }
    const token = await obtenerTokenAcceso(this.opciones.cuenta, {
      fetchImpl: this.opciones.fetchImpl,
      ahora: this.opciones.ahora,
    });
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  /** `get` de un documento por su ruta completa. `null` si no existe. */
  async leerDocumento(ruta: string): Promise<DocumentoLeido | null> {
    const ejecutar = this.opciones.fetchImpl || fetchPorDefecto();
    const respuesta = await withTimeout(async (signal) =>
      ejecutar(`${this.base}/${ruta}`, {
        method: 'GET',
        headers: await this.cabeceras(),
        signal,
      }) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
    );
    if (respuesta.status === 404) return null;
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Firestore ha rechazado la lectura de ${ruta} (HTTP ${respuesta.status}). ${detalle}`.trim());
    }
    const documento = (await respuesta.json()) as DocumentoFirestore;
    return {
      id: String(documento.name || ruta).split('/').pop() || ruta,
      datos: decodificarCampos(documento.fields || {}),
      ...(documento.updateTime ? { updateTime: documento.updateTime } : {}),
    };
  }

  async leer(coleccion: string, id: string): Promise<DocumentoLeido | null> {
    return this.leerDocumento(`${coleccion}/${encodeURIComponent(id)}`);
  }

  /**
   * CREA un documento con id fijo (`createDocument` + `documentId`). Si ya
   * existe, Firestore responde 409 y se devuelve `YA_EXISTE` SIN modificarlo:
   * es la primitiva atómica de idempotencia (dos peticiones simultáneas con el
   * mismo id → sólo una crea).
   */
  async crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'> {
    const ejecutar = this.opciones.fetchImpl || fetchPorDefecto();
    const campos = (codificarValor(datos) as { mapValue: { fields?: Record<string, ValorFirestore> } }).mapValue.fields || {};
    const respuesta = await withTimeout(async (signal) =>
      ejecutar(`${this.base}/${coleccion}?documentId=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: await this.cabeceras(),
        body: JSON.stringify({ fields: campos }),
        signal,
      }) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
    );
    if (respuesta.status === 409) return 'YA_EXISTE';
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Firestore ha rechazado la creación en ${coleccion} (HTTP ${respuesta.status}). ${detalle}`.trim());
    }
    return 'CREADO';
  }

  /**
   * Commit atómico con precondición en cada documento. Se usa para P4: anexo,
   * aviso pendiente, auditoría, operación idempotente y control anual se crean
   * juntos o ninguno queda persistido. `false` indica colisión/precondición.
   */
  async escribirAtomico(escrituras: readonly EscrituraDocumentoFirestoreAtomica[]): Promise<'COMMIT' | 'CONFLICTO'> {
    if (!Array.isArray(escrituras) || escrituras.length === 0 || escrituras.length > 500) {
      throw new Error('El commit Firestore requiere entre 1 y 500 escrituras.');
    }
    const rutas = new Set<string>();
    const writes = escrituras.map((escritura) => {
      if (!/^[A-Za-z0-9_-][A-Za-z0-9_-]{0,149}$/.test(escritura.coleccion)
        || !escritura.id || escritura.id.includes('/') || escritura.id.length > 1500
        || !escritura.datos || typeof escritura.datos !== 'object' || Array.isArray(escritura.datos)) {
        throw new Error('Ruta o contenido no válido en commit Firestore.');
      }
      const ruta = `${escritura.coleccion}/${escritura.id}`;
      if (rutas.has(ruta)) throw new Error('Un commit no puede escribir dos veces el mismo documento.');
      rutas.add(ruta);
      const campos = (codificarValor(escritura.datos) as { mapValue: { fields?: Record<string, ValorFirestore> } }).mapValue.fields || {};
      const currentDocument = escritura.precondicion.tipo === 'NO_EXISTE'
        ? { exists: false }
        : escritura.precondicion.tipo === 'VERSION' && escritura.precondicion.updateTime
          ? { updateTime: escritura.precondicion.updateTime }
          : null;
      if (!currentDocument) throw new Error('Precondición de escritura Firestore no válida.');
      const mascara = escritura.camposActualizar;
      if (mascara && (escritura.precondicion.tipo !== 'VERSION' || mascara.length === 0
        || new Set(mascara).size !== mascara.length
        || mascara.some((campo) => typeof campo !== 'string' || !campo || !Object.hasOwn(campos, campo))
        || Object.keys(campos).some((campo) => !mascara.includes(campo)))) {
        throw new Error('Máscara de actualización atómica no válida.');
      }
      return {
        update: { name: `${this.base}/${escritura.coleccion}/${encodeURIComponent(escritura.id)}`, fields: campos },
        currentDocument,
        ...(mascara ? { updateMask: { fieldPaths: mascara.map(rutaCampo) } } : {}),
      };
    });
    const ejecutar = this.opciones.fetchImpl || fetchPorDefecto();
    const respuesta = await withTimeout(async (signal) =>
      ejecutar(`${this.base}:commit`, {
        method: 'POST',
        headers: await this.cabeceras(),
        body: JSON.stringify({ writes }),
        signal,
      }) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
    );
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      if (respuesta.status === 409 || (respuesta.status === 400 && /ALREADY_EXISTS|FAILED_PRECONDITION|ABORTED/i.test(detalle))) {
        return 'CONFLICTO';
      }
      throw new Error(`Firestore ha rechazado el commit atómico (HTTP ${respuesta.status}). ${detalle}`.trim());
    }
    return 'COMMIT';
  }

  /**
   * Actualiza SOLO los campos indicados (`updateMask`) de un documento que debe
   * existir (`currentDocument.exists=true`): nunca crea documentos por la puerta
   * de atrás ni borra campos no enviados.
   */
  async actualizarCampos(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void> {
    const ejecutar = this.opciones.fetchImpl || fetchPorDefecto();
    const campos = (codificarValor(datos) as { mapValue: { fields?: Record<string, ValorFirestore> } }).mapValue.fields || {};
    const nombres = Object.keys(campos);
    if (nombres.length === 0) return;
    const parametros = new URLSearchParams();
    for (const nombre of nombres) parametros.append('updateMask.fieldPaths', rutaCampo(nombre));
    parametros.append('currentDocument.exists', 'true');
    const respuesta = await withTimeout(async (signal) =>
      ejecutar(`${this.base}/${coleccion}/${encodeURIComponent(id)}?${parametros.toString()}`, {
        method: 'PATCH',
        headers: await this.cabeceras(),
        body: JSON.stringify({ fields: campos }),
        signal,
      }) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
    );
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Firestore ha rechazado la actualización de ${coleccion}/${id} (HTTP ${respuesta.status}). ${detalle}`.trim());
    }
  }

  /**
   * Actualiza SOLO los campos indicados si el documento sigue en la versión
   * (`updateTime`) que leyó el llamador (compare-and-swap). Devuelve `false`
   * si otro escritor ganó la carrera (409): el llamador debe releer y
   * reintentar. Nunca crea documentos (`currentDocument.exists=true`).
   */
  async actualizarCamposSiVersion(
    coleccion: string,
    id: string,
    datos: Record<string, unknown>,
    updateTimeEsperado: string,
  ): Promise<boolean> {
    const ejecutar = this.opciones.fetchImpl || fetchPorDefecto();
    const campos = (codificarValor(datos) as { mapValue: { fields?: Record<string, ValorFirestore> } }).mapValue.fields || {};
    const nombres = Object.keys(campos);
    if (nombres.length === 0) return true;
    const parametros = new URLSearchParams();
    for (const nombre of nombres) parametros.append('updateMask.fieldPaths', rutaCampo(nombre));
    parametros.append('currentDocument.exists', 'true');
    parametros.append('currentDocument.updateTime', updateTimeEsperado);
    const respuesta = await withTimeout(async (signal) =>
      ejecutar(`${this.base}/${coleccion}/${encodeURIComponent(id)}?${parametros.toString()}`, {
        method: 'PATCH',
        headers: await this.cabeceras(),
        body: JSON.stringify({ fields: campos }),
        signal,
      }) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
    );
    if (respuesta.status === 409 || respuesta.status === 400) {
      // Precondición no satisfecha (versión cambiada) o documento en estado distinto:
      // no es un error del llamador, es una carrera perdida.
      const detalle = await respuesta.text().catch(() => '');
      if (respuesta.status === 409 || /PRECONDITION|ABORTED/i.test(detalle)) return false;
    }
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Firestore ha rechazado la actualización condicional de ${coleccion}/${id} (HTTP ${respuesta.status}). ${detalle}`.trim());
    }
    return true;
  }

  /**
   * Consulta ACOTADA por igualdades (AND) con orden por un campo y límite duro
   * (1..100). Es la única forma de consulta que necesita el gobierno de IA
   * (operaciones de un uid, ajustes de un uid, últimas operaciones globales):
   * sin enumeraciones sin filtro.
   */
  async consultarIgualdadesOrden(
    coleccion: string,
    consulta: {
      igualdades?: Array<[campo: string, valor: string]>;
      orden?: { campo: string; direccion: 'ASCENDING' | 'DESCENDING' };
      limite: number;
      /** `runQuery` offset para continuar consultas acotadas y paginables. */
      offset?: number;
    },
  ): Promise<DocumentoLeido[]> {
    const ejecutar = this.opciones.fetchImpl || fetchPorDefecto();
    const filtros = (consulta.igualdades || []).map(([campo, valor]) => ({
      fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } },
    }));
    const cuerpo = {
      structuredQuery: {
        from: [{ collectionId: coleccion }],
        ...(filtros.length
          ? { where: filtros.length === 1 ? filtros[0] : { compositeFilter: { op: 'AND', filters: filtros } } }
          : {}),
        ...(consulta.orden ? { orderBy: [{ field: { fieldPath: consulta.orden.campo }, direction: consulta.orden.direccion }] } : {}),
        limit: Math.max(1, Math.min(100, consulta.limite)),
        ...(Number.isInteger(consulta.offset) && (consulta.offset || 0) > 0
          ? { offset: Math.min(5000, consulta.offset as number) }
          : {}),
      },
    };
    const respuesta = await withTimeout(async (signal) =>
      ejecutar(`${this.base}:runQuery`, {
        method: 'POST',
        headers: await this.cabeceras(),
        body: JSON.stringify(cuerpo),
        signal,
      }) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
    );
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Firestore ha rechazado la consulta sobre ${coleccion} (HTTP ${respuesta.status}). ${detalle}`.trim());
    }
    const crudo = (await respuesta.json()) as unknown;
    const filas: unknown[] = Array.isArray(crudo) ? crudo : [];
    const salida: DocumentoLeido[] = [];
    for (const fila of filas) {
      const documento = (fila as { document?: DocumentoFirestore }).document;
      if (!documento?.fields) continue;
      salida.push({
        id: String(documento.name || '').split('/').pop() || '',
        datos: decodificarCampos(documento.fields),
        ...(documento.updateTime ? { updateTime: documento.updateTime } : {}),
      });
    }
    return salida;
  }

  /**
   * Consulta PREFIJO acotada sobre un campo de texto (`>= termino` y
   * `<= termino + SUFIJO_PREFIJO`), con límite duro de lectura.
   * NO es una enumeración: sin término no hay consulta.
   */
  async consultarPrefijo(
    coleccion: string,
    campo: string,
    prefijo: string,
    limite: number,
    sufijo = '￿',
  ): Promise<DocumentoLeido[]> {
    if (!prefijo) return [];
    const ejecutar = this.opciones.fetchImpl || fetchPorDefecto();
    const cuerpo = {
      structuredQuery: {
        from: [{ collectionId: coleccion }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: campo },
                  op: 'GREATER_THAN_OR_EQUAL',
                  value: { stringValue: prefijo },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: campo },
                  op: 'LESS_THAN_OR_EQUAL',
                  value: { stringValue: `${prefijo}${sufijo}` },
                },
              },
            ],
          },
        },
        orderBy: [{ field: { fieldPath: campo }, direction: 'ASCENDING' }],
        limit: Math.max(1, Math.min(100, limite)),
      },
    };
    const respuesta = await withTimeout(async (signal) =>
      ejecutar(`${this.base}:runQuery`, {
        method: 'POST',
        headers: await this.cabeceras(),
        body: JSON.stringify(cuerpo),
        signal,
      }) as Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>,
    );
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Firestore ha rechazado la consulta sobre ${coleccion} (HTTP ${respuesta.status}). ${detalle}`.trim());
    }
    const crudo = (await respuesta.json()) as unknown;
    const filas: unknown[] = Array.isArray(crudo) ? crudo : [];
    const salida: DocumentoLeido[] = [];
    for (const fila of filas) {
      const documento = (fila as { document?: DocumentoFirestore }).document;
      if (!documento?.fields) continue;
      salida.push({
        id: String(documento.name || '').split('/').pop() || '',
        datos: decodificarCampos(documento.fields),
      });
    }
    return salida;
  }
}
