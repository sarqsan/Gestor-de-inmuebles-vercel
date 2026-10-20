/**
 * ORDEN 1 · AG-04 — CUSTODIA DOCUMENTAL FAIL-CLOSED (sin almacén efímero)
 * ORDEN AG-03.2 — mismo contrato sobre el motor MEDIADO POR EL SERVIDOR
 * =========================================================================
 * Qué demuestra (sin red, sin Firebase real, con dobles explícitos):
 *  A. `subirBinarioDuradero`: sólo devuelve éxito cuando el servidor ha
 *     confirmado el objeto y se dispone de su URL; denegación, sesión caducada,
 *     red o plazo agotado producen `ErrorCustodiaDocumento` con código estable
 *     y mensaje apto para la persona usuaria; el plazo CANCELA el envío.
 *  B. Los tres `upload*` legados de `src/lib/firebase.ts` (facturas de gasto,
 *     justificantes de cobro, documentos aportados) recorren el motor REAL
 *     `almacenServidor.ts` contra un servidor sintético de `/api/documentos/*`
 *     y un Cloud Storage sintético: inicio → PUT directo → confirmación. Nunca
 *     llaman a `/api/upload-document`, no devuelven `server_*`/`local_*` ni
 *     base64 y fallan de forma explícita sin titular o cuando el servidor deniega.
 *  C. La parte pura del adjunto de póliza (`evaluarAdjuntoInlinePoliza`).
 *  D. Invariantes de código: ningún cliente vuelve a usar el almacén retirado
 *     ni el SDK de Storage para subir/leer/borrar documentos.
 *
 * Qué NO demuestra: la autorización real del servidor con cuentas del proyecto
 * (eso lo cubre `server/documentos/*.test.ts` con dobles y queda como V en el
 * proyecto real) ni la política CORS de la URI de sesión de Cloud Storage.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Dobles de Firebase para poder importar `src/lib/firebase.ts` sin red.
// ---------------------------------------------------------------------------
vi.mock('firebase/storage', () => ({ getStorage: () => ({ __storage: true }) }));

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, col: string) => ({ __col: col }),
  doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
  getDoc: async () => ({ exists: () => false, data: () => undefined }),
  setDoc: vi.fn(async () => undefined),
  updateDoc: async () => undefined,
  deleteDoc: async () => undefined,
  deleteField: () => ({}),
  onSnapshot: () => () => undefined,
  query: (...args: unknown[]) => ({ __q: args }),
  where: () => ({}),
  getDocs: async () => ({ empty: true, docs: [] }),
  writeBatch: () => ({ set: () => undefined, update: () => undefined, delete: () => undefined, commit: async () => undefined }),
  runTransaction: async () => { throw new Error('runTransaction sin mock'); },
}));

vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('../src/lib/authService', () => ({ ADMIN_MASTER_EMAIL: 'master@test.local' }));

import {
  ErrorCustodiaDocumento,
  LIMITES_PREFIJO,
  MENSAJES_CUSTODIA,
  PLAZO_SUBIDA_MS,
  clasificarErrorStorage,
  esReferenciaSinCustodia,
  exigirTitular,
  subirBinarioDuradero,
  validarPrevio,
  type MotorStorage,
} from '../src/lib/custodiaDocumental/subidaDirecta';
import {
  ErrorAlmacenServidor,
  PLAZO_ENVIO_BYTES_MS,
  configurarAlmacenServidor,
  type ConfiguracionAlmacenServidor,
} from '../src/lib/custodiaDocumental/almacenServidor';
import {
  TAMANO_MAX_ADJUNTO_POLIZA_BYTES,
  bytesDataUrlEstimados,
  evaluarAdjuntoInlinePoliza,
} from '../src/lib/custodiaDocumental/adjuntoInlinePoliza';
import { esMensajeTecnico, mensajeDeErrorUsuario } from '../src/feedback/mensajes';
import {
  sanearAdjuntoParaFirestore,
  sanitizeDocForFirestore,
  saveCandidatoFirestore,
  uploadDocumentoAportadoFile,
  uploadFacturaGasto,
  uploadIncidenciaAdjuntoStorage,
  uploadInventarioAdjuntoStorage,
  uploadInmuebleImageToStorage,
  uploadJustificanteCobro,
  uploadPresupuestoDocumentoStorage,
  uploadReformaAdjuntoStorage,
  uploadTrabajoAdjuntoStorage,
} from '../src/lib/firebase';
import { setDoc } from 'firebase/firestore';

const RAIZ = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

const pdf = (bytes = 1200, nombre = 'factura.pdf') => new File([new Uint8Array(bytes)], nombre, { type: 'application/pdf' });

// ---------------------------------------------------------------------------
// Servidor sintético de /api/documentos/* + Cloud Storage sintético (sesión).
// Reproduce el CONTRATO del servidor real (server/documentos/rutasDocumentos.ts).
// ---------------------------------------------------------------------------
type Modo = 'ok' | 'denegada' | 'sin-sesion' | 'colgada' | 'red' | 'incompleta' | 'sin-url';

const SESION_BASE = 'https://storage.googleapis.com/upload/storage/v1/b/bucket-test/o?upload_id=';

const estado = {
  modo: 'ok' as Modo,
  token: 'id-token-prueba' as string | null,
  /** Peticiones JSON al servidor, en orden. */
  llamadas: [] as Array<{ ruta: string; cuerpo: Record<string, unknown>; autorizado: boolean }>,
  /** PUTs a la URI de sesión. */
  envios: [] as Array<{ sesionUri: string; contentType: string; bytes: number; abortado: boolean }>,
  /** Objetos materializados tras el PUT. */
  objetos: new Map<string, { contentType: string; size: number }>(),
  sesiones: new Map<string, { storagePath: string; contentType: string; tamanoBytes: number }>(),
  contador: 0,
  reset() {
    this.modo = 'ok'; this.token = 'id-token-prueba'; this.llamadas.length = 0; this.envios.length = 0;
    this.objetos.clear(); this.sesiones.clear(); this.contador = 0;
  },
};

function json(status: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchSintetico: typeof fetch = async (entrada, init) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  const metodo = init?.method || 'GET';

  // --- Cloud Storage: PUT de un solo tramo a la URI de sesión -------------
  if (url.startsWith(SESION_BASE) && metodo === 'PUT') {
    const sesion = estado.sesiones.get(url);
    const contentType = String((init?.headers as Record<string, string>)?.['Content-Type'] || '');
    const bytes = init?.body instanceof Blob ? init.body.size : 0;
    const registro = { sesionUri: url, contentType, bytes, abortado: false };
    estado.envios.push(registro);
    if (estado.modo === 'colgada') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          registro.abortado = true;
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        });
      });
    }
    if (estado.modo === 'red') throw new TypeError('Failed to fetch');
    if (!sesion) return new Response('', { status: 404 });
    if (estado.modo === 'incompleta') return new Response('', { status: 308 });
    estado.objetos.set(sesion.storagePath, { contentType, size: bytes });
    return json(200, { name: sesion.storagePath, size: String(bytes) });
  }

  if (url.startsWith('/api/upload-document') || url.startsWith('/api/documents/')) {
    throw new Error(`fetch a ${url}: el almacén temporal está retirado y NO debe usarse`);
  }
  if (!url.startsWith('/api/documentos/')) throw new Error(`fetch inesperado: ${metodo} ${url}`);

  const cuerpo = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
  const autorizado = String((init?.headers as Record<string, string>)?.Authorization || '').startsWith('Bearer ');
  estado.llamadas.push({ ruta: url, cuerpo, autorizado });
  const publico = url.startsWith('/api/documentos/publico/');
  if (!publico && !autorizado) return json(401, { ok: false, codigo: 'NO_AUTENTICADO', error: 'Inicia sesión para continuar.' });
  if (publico && !cuerpo.token) return json(400, { ok: false, codigo: 'PETICION_INVALIDA', error: 'Falta el token.' });
  if (estado.modo === 'denegada') return json(403, { ok: false, codigo: 'SIN_PERMISO', error: 'Sin permiso.', motivo: 'AMBITO_PROPIETARIO_ESCRITURA' });
  if (estado.modo === 'sin-sesion') return json(401, { ok: false, codigo: 'NO_AUTENTICADO', error: 'Sesión caducada.' });

  const storagePath = String(cuerpo.storagePath || '');
  if (url.endsWith('/subidas')) {
    const sesionUri = `${SESION_BASE}${++estado.contador}`;
    estado.sesiones.set(sesionUri, { storagePath, contentType: String(cuerpo.contentType), tamanoBytes: Number(cuerpo.tamanoBytes) });
    return json(200, { ok: true, estado: 'SESION', sesionUri, storagePath });
  }
  if (url.endsWith('/confirmar')) {
    const objeto = estado.objetos.get(storagePath);
    if (!objeto) return json(409, { ok: false, codigo: 'OBJETO_INCOMPLETO', error: 'El archivo no llegó completo.' });
    const metadatos = { storagePath, tamanoBytes: objeto.size, contentType: objeto.contentType, generation: '1', customMetadata: {} };
    if (estado.modo === 'sin-url') return json(200, { ok: true, storagePath, metadatos });
    return json(200, { ok: true, storagePath, metadatos, url: `https://firebasestorage.googleapis.com/v0/b/bucket-test/o/${encodeURIComponent(storagePath)}?alt=media&token=t` });
  }
  if (url.endsWith('/acceso')) {
    if (estado.modo === 'sin-url') return json(403, { ok: false, codigo: 'SIN_PERMISO', error: 'Sin permiso.' });
    return json(200, { ok: true, storagePath, url: `https://firebasestorage.googleapis.com/v0/b/bucket-test/o/${encodeURIComponent(storagePath)}?alt=media&token=t`, metadatos: {} });
  }
  return json(404, { ok: false, codigo: 'NO_ENCONTRADO' });
};

let configuracionPrevia: ConfiguracionAlmacenServidor;
let fetchGlobalEspia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  estado.reset();
  configuracionPrevia = configurarAlmacenServidor({ fetchImpl: fetchSintetico, obtenerToken: async () => estado.token });
  // Nada debe usar el `fetch` global: ni el almacén retirado ni atajos.
  fetchGlobalEspia = vi.fn(async () => { throw new Error('fetch global no debe usarse'); });
  vi.stubGlobal('fetch', fetchGlobalEspia);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  configurarAlmacenServidor(configuracionPrevia);
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function capturar(promesa: Promise<unknown>): Promise<ErrorCustodiaDocumento> {
  try {
    await promesa;
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorCustodiaDocumento);
    return e as ErrorCustodiaDocumento;
  }
  throw new Error('se esperaba un ErrorCustodiaDocumento y la promesa resolvió');
}

const rutasLlamadas = () => estado.llamadas.map((l) => l.ruta);

// ---------------------------------------------------------------------------
// A · Núcleo: subirBinarioDuradero (motor real contra el servidor sintético)
// ---------------------------------------------------------------------------
describe('A · subirBinarioDuradero — éxito sólo con objeto confirmado + URL; fallos explícitos', () => {
  const storage = { __storage: true } as never;

  it('A1 · éxito: inicio → PUT directo a la sesión → confirmación; devuelve URL y ruta real; nunca el almacén retirado', async () => {
    const r = await subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/1_f.pdf',
      datos: pdf(),
      contentType: 'application/pdf',
      limite: LIMITES_PREFIJO.gastos_facturas,
    });
    expect(r.storagePath).toBe('gastos_facturas/prop_A/g1/1_f.pdf');
    expect(r.url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\//);
    expect(r.bytes).toBe(1200);
    expect(rutasLlamadas()).toEqual(['/api/documentos/subidas', '/api/documentos/subidas/confirmar']);
    expect(estado.llamadas[0].cuerpo).toMatchObject({ storagePath: 'gastos_facturas/prop_A/g1/1_f.pdf', contentType: 'application/pdf', tamanoBytes: 1200 });
    expect(estado.envios).toHaveLength(1);
    expect(estado.envios[0].contentType).toBe('application/pdf');
    expect(fetchGlobalEspia).not.toHaveBeenCalled();
  });

  it('A2 · denegación del servidor → SIN_PERMISO con mensaje de negocio (sin «storage/», sin «Firebase»); sin PUT', async () => {
    estado.modo = 'denegada';
    const e = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/1_f.pdf', datos: pdf(), contentType: 'application/pdf',
    }));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(e.storagePath).toBe('gastos_facturas/prop_A/g1/1_f.pdf');
    expect(esMensajeTecnico(e.message)).toBe(false);
    expect(mensajeDeErrorUsuario(e, 'contexto')).toBe(MENSAJES_CUSTODIA.SIN_PERMISO);
    expect((e.causa as ErrorAlmacenServidor).code).toBe('storage/unauthorized');
    expect((e.causa as ErrorAlmacenServidor).codigoServidor).toBe('SIN_PERMISO');
    expect(estado.envios).toHaveLength(0);
  });

  it('A3 · sin sesión (token nulo) y sesión caducada (401) → NO_AUTENTICADO; red caída → RED', async () => {
    estado.token = null;
    const sinToken = await capturar(subirBinarioDuradero(storage, { storagePath: 'gastos_facturas/prop_A/g1/x.pdf', datos: pdf(), contentType: 'application/pdf' }));
    expect(sinToken.codigo).toBe('NO_AUTENTICADO');
    expect(estado.llamadas).toHaveLength(0); // ni siquiera se llama al servidor sin sesión
    estado.token = 'id-token-prueba';
    estado.modo = 'sin-sesion';
    const caducada = await capturar(subirBinarioDuradero(storage, { storagePath: 'gastos_facturas/prop_A/g1/x.pdf', datos: pdf(), contentType: 'application/pdf' }));
    expect(caducada.codigo).toBe('NO_AUTENTICADO');
    estado.modo = 'red';
    const red = await capturar(subirBinarioDuradero(storage, { storagePath: 'gastos_facturas/prop_A/g1/x.pdf', datos: pdf(), contentType: 'application/pdf' }));
    expect(red.codigo).toBe('RED');
  });

  it('A4 · plazo agotado: el envío se CANCELA (AbortSignal) sin confirmar y el error es TIEMPO_AGOTADO', async () => {
    vi.useFakeTimers();
    estado.modo = 'colgada';
    const promesa = subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/colgada.pdf', datos: pdf(), contentType: 'application/pdf', plazoMs: 5_000,
    });
    const captura = capturar(promesa);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(estado.envios[0]?.abortado ?? false).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const e = await captura;
    expect(e.codigo).toBe('TIEMPO_AGOTADO');
    expect(estado.envios[0].abortado).toBe(true);
    expect(rutasLlamadas()).toEqual(['/api/documentos/subidas']); // sin confirmación ⇒ sin éxito
  });

  it('A5 · el plazo por defecto es generoso (facturas de varios MB en móvil) pero finito, y coincide con el del motor', () => {
    expect(PLAZO_SUBIDA_MS).toBeGreaterThanOrEqual(60_000);
    expect(PLAZO_SUBIDA_MS).toBeLessThanOrEqual(180_000);
    expect(PLAZO_ENVIO_BYTES_MS).toBe(PLAZO_SUBIDA_MS);
  });

  it('A6 · si el objeto se subió pero no se obtiene URL, NO se declara éxito; si el almacén no recibió todo (308), tampoco', async () => {
    estado.modo = 'sin-url';
    const sinUrl = await capturar(subirBinarioDuradero(storage, { storagePath: 'gastos_facturas/prop_A/g1/x.pdf', datos: pdf(), contentType: 'application/pdf' }));
    expect(sinUrl.codigo).toBe('SIN_PERMISO');
    estado.modo = 'incompleta';
    const incompleta = await capturar(subirBinarioDuradero(storage, { storagePath: 'gastos_facturas/prop_A/g1/y.pdf', datos: pdf(), contentType: 'application/pdf' }));
    expect(incompleta.codigo).toBe('RED');
    expect(rutasLlamadas().filter((r) => r.endsWith('/confirmar'))).toHaveLength(1); // sólo el caso sin-url llegó a confirmar
  });

  it('A7 · validación previa con los límites de la regla: tamaño/tipo fuera de rango no toca la red', async () => {
    const grande = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/1_f.pdf',
      datos: new File([new Uint8Array(12 * 1024 * 1024)], 'f.pdf', { type: 'application/pdf' }),
      contentType: 'application/pdf',
      limite: LIMITES_PREFIJO.gastos_facturas,
    }));
    expect(grande.codigo).toBe('TIPO_O_TAMANO');
    const texto = await capturar(subirBinarioDuradero(storage, {
      storagePath: 'gastos_facturas/prop_A/g1/1_f.txt',
      datos: new File(['hola'], 'f.txt', { type: 'text/plain' }),
      contentType: 'text/plain',
      limite: LIMITES_PREFIJO.gastos_facturas,
    }));
    expect(texto.codigo).toBe('TIPO_O_TAMANO');
    expect(estado.llamadas).toHaveLength(0);
    expect(() => validarPrevio(new File([new Uint8Array(1)], 'a.pdf'), 'application/pdf', LIMITES_PREFIJO.documentos_solicitados, 'x')).not.toThrow();
  });

  it('A8 · sin titular no hay carpeta de custodia: SIN_TITULAR antes de intentar nada', () => {
    for (const malo of [undefined, null, '', '   ', 'sin_asignar']) {
      expect(() => exigirTitular(malo as string | undefined)).toThrowError(ErrorCustodiaDocumento);
      try { exigirTitular(malo as string | undefined); } catch (e) { expect((e as ErrorCustodiaDocumento).codigo).toBe('SIN_TITULAR'); }
    }
    expect(exigirTitular(' prop_A ')).toBe('prop_A');
  });

  it('A9 · clasificación de errores y mensajes: todos pasan el filtro UX-3', () => {
    const errorMotor = (code: ConstructorParameters<typeof ErrorAlmacenServidor>[0], motivo?: string) => new ErrorAlmacenServidor(code, 'x', { motivo });
    expect(clasificarErrorStorage(errorMotor('storage/canceled')).codigo).toBe('CANCELADO');
    expect(clasificarErrorStorage(errorMotor('storage/canceled', 'PLAZO')).codigo).toBe('TIEMPO_AGOTADO');
    expect(clasificarErrorStorage(errorMotor('storage/invalid-argument')).codigo).toBe('TIPO_O_TAMANO');
    expect(clasificarErrorStorage(errorMotor('storage/server-file-wrong-size')).codigo).toBe('RED');
    expect(clasificarErrorStorage(errorMotor('storage/retry-limit-exceeded')).codigo).toBe('RED');
    expect(clasificarErrorStorage(new Error('cualquier cosa')).codigo).toBe('DESCONOCIDO');
    expect(clasificarErrorStorage(null).codigo).toBe('DESCONOCIDO');
    const propio = new ErrorCustodiaDocumento('SIN_TITULAR');
    expect(clasificarErrorStorage(propio)).toBe(propio);
    for (const [codigo, mensaje] of Object.entries(MENSAJES_CUSTODIA)) {
      expect(esMensajeTecnico(mensaje), codigo).toBe(false);
      expect(mensaje.length, codigo).toBeLessThanOrEqual(240);
      expect(mensaje).toMatch(/no se ha guardado|no se ha adjuntado/);
    }
    expect(esReferenciaSinCustodia('server_abc')).toBe(true);
    expect(esReferenciaSinCustodia('local_1')).toBe(true);
    expect(esReferenciaSinCustodia('gastos_facturas/p/g/f.pdf')).toBe(false);
    expect(esReferenciaSinCustodia(undefined)).toBe(false);
  });

  it('A10 · reintento tras una subida completada: el servidor reconoce el mismo contenido (YA_EXISTE) y no se re-envía', async () => {
    const motor: MotorStorage = {
      uploadBytes: async (referencia) => ({
        ref: referencia, yaExistia: true, url: 'https://firebasestorage.googleapis.com/v0/b/b/o/x?alt=media&token=t',
        metadata: { fullPath: referencia.fullPath, name: referencia.name, size: 1200, contentType: 'application/pdf', generation: '1', customMetadata: {} },
      }),
      getDownloadURL: async () => { throw new Error('no debe pedirse: la respuesta ya trae URL'); },
      subirDocumentoPublico: async () => { throw new Error('no aplica'); },
    };
    const r = await subirBinarioDuradero(storage, { storagePath: 'gastos_facturas/prop_A/g1/1_f.pdf', datos: pdf(), contentType: 'application/pdf' }, motor);
    expect(r.url).toContain('token=t');
    expect(estado.envios).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B · Los tres upload* legados de src/lib/firebase.ts
// ---------------------------------------------------------------------------
describe('B · upload* legados — servidor + Storage o error; nunca servidor efímero, server_*, local_* ni base64', () => {
  it('B1 · uploadFacturaGasto: éxito sólo con la ruta real por titular; sesión Bearer; sin almacén retirado', async () => {
    const r = await uploadFacturaGasto('g1', pdf(), 'Factura luz.pdf', 'prop_A');
    expect(r.storagePath).toMatch(/^gastos_facturas\/prop_A\/g1\/\d+_Factura_luz\.pdf$/);
    expect(r.url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\//);
    expect(rutasLlamadas()).toEqual(['/api/documentos/subidas', '/api/documentos/subidas/confirmar']);
    expect(estado.llamadas.every((l) => l.autorizado)).toBe(true);
    expect(estado.envios).toHaveLength(1);
    expect(estado.envios[0].contentType).toBe('application/pdf');
    expect(fetchGlobalEspia).not.toHaveBeenCalled();
  });

  it('B2 · uploadFacturaGasto sin propietarioId: SIN_TITULAR, sin tocar servidor ni Storage', async () => {
    const e = await capturar(uploadFacturaGasto('g1', pdf(), 'f.pdf', undefined));
    expect(e.codigo).toBe('SIN_TITULAR');
    expect(estado.llamadas).toHaveLength(0);
    expect(estado.envios).toHaveLength(0);
  });

  it('B3 · uploadFacturaGasto denegado por el servidor (ámbito de la base con nombre): error explícito, sin respaldo', async () => {
    estado.modo = 'denegada';
    const e = await capturar(uploadFacturaGasto('g1', pdf(), 'f.pdf', 'prop_A'));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(estado.envios).toHaveLength(0);
    expect(rutasLlamadas()).toEqual(['/api/documentos/subidas']);
  });

  it('B4 · uploadJustificanteCobro: por contrato → recibos/…; por titular → cobros_justificantes/…; sin ninguno → SIN_TITULAR', async () => {
    const porContrato = await uploadJustificanteCobro('cob1', pdf(), 'just.pdf', 'prop_A', 'ct_A');
    expect(porContrato.storagePath).toMatch(/^recibos\/ct_A\/cob1\/\d+_just\.pdf$/);
    const porTitular = await uploadJustificanteCobro('cob1', pdf(), 'just.pdf', 'prop_A');
    expect(porTitular.storagePath).toMatch(/^cobros_justificantes\/prop_A\/cob1\/\d+_just\.pdf$/);
    const e = await capturar(uploadJustificanteCobro('cob1', pdf(), 'just.pdf'));
    expect(e.codigo).toBe('SIN_TITULAR');
    expect([...estado.objetos.keys()].some((p) => p.includes('sin_asignar'))).toBe(false);
    expect(estado.envios).toHaveLength(2);
    expect(fetchGlobalEspia).not.toHaveBeenCalled();
  });

  it('B5 · uploadJustificanteCobro con Storage colgado: TIEMPO_AGOTADO y envío cancelado (antes: respaldo efímero a los 8 s)', async () => {
    vi.useFakeTimers();
    estado.modo = 'colgada';
    const captura = capturar(uploadJustificanteCobro('cob1', pdf(), 'just.pdf', 'prop_A'));
    await vi.advanceTimersByTimeAsync(PLAZO_SUBIDA_MS + 1);
    const e = await captura;
    expect(e.codigo).toBe('TIEMPO_AGOTADO');
    expect(estado.envios[0].abortado).toBe(true);
    expect(rutasLlamadas()).toEqual(['/api/documentos/subidas']);
  });

  it('B6 · uploadDocumentoAportadoFile (portal con token): ruta PLANA, vía pública con el token de la solicitud, sin base64 ni local_', async () => {
    estado.token = null; // el candidato no tiene sesión
    const r = await uploadDocumentoAportadoFile('sol-1', 'item-dni', pdf(2000, 'DNI frontal.pdf'), 'DNI frontal.pdf', 'tok-sol-1-abcdef');
    expect(r.storagePath).toMatch(/^documentos_solicitados\/sol-1\/item-dni_\d+_DNI_frontal\.pdf$/);
    expect(r.storagePath.split('/')).toHaveLength(3);
    expect(r.downloadURL).toMatch(/^https:\/\//);
    expect((r as Record<string, unknown>).base64Data).toBeUndefined();
    expect(rutasLlamadas()).toEqual(['/api/documentos/publico/subidas', '/api/documentos/publico/subidas/confirmar']);
    expect(estado.llamadas[0].cuerpo).toMatchObject({ solicitudDocId: 'sol-1', token: 'tok-sol-1-abcdef' });
    expect(estado.llamadas.every((l) => !l.autorizado)).toBe(true);
  });

  it('B6b · uploadDocumentoAportadoFile con sesión y sin token: vía ordinaria (ámbito de la cuenta)', async () => {
    const r = await uploadDocumentoAportadoFile('sol-1', 'item-dni', pdf(), 'dni.pdf');
    expect(r.storagePath).toMatch(/^documentos_solicitados\/sol-1\//);
    expect(rutasLlamadas()).toEqual(['/api/documentos/subidas', '/api/documentos/subidas/confirmar']);
  });

  it('B7 · uploadDocumentoAportadoFile con el servidor denegando: error explícito (antes: data-URL con éxito aparente)', async () => {
    estado.modo = 'denegada';
    const e = await capturar(uploadDocumentoAportadoFile('sol-1', 'item-dni', pdf(), 'dni.pdf', 'tok-sol-1-abcdef'));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(esMensajeTecnico(e.message)).toBe(false);
    expect(estado.envios).toHaveLength(0);
  });

  it('B8 · sin sesión y sin token (portal puramente anónimo): NO_AUTENTICADO sin llamar al servidor', async () => {
    estado.token = null;
    const e = await capturar(uploadDocumentoAportadoFile('sol-1', 'item-dni', pdf(), 'dni.pdf'));
    expect(e.codigo).toBe('NO_AUTENTICADO');
    expect(estado.llamadas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C · Adjuntos de póliza en la ficha (parte pura)
// ---------------------------------------------------------------------------
describe('C · evaluarAdjuntoInlinePoliza — cabe o se rechaza con motivo claro', () => {
  const poliza = { id: 'pol1', numeroPoliza: 'X', documentosRenovacion: [] as unknown[] };
  it('C1 · PDF pequeño cabe; tipo no admitido y archivo grande se rechazan antes de leer', () => {
    expect(evaluarAdjuntoInlinePoliza(poliza, { size: 100_000, type: 'application/pdf', name: 'p.pdf' }).ok).toBe(true);
    const tipo = evaluarAdjuntoInlinePoliza(poliza, { size: 1000, type: 'text/html', name: 'p.html' });
    expect(tipo.ok).toBe(false);
    if (tipo.ok === false) { expect(tipo.motivo).toBe('TIPO_NO_ADMITIDO'); expect(esMensajeTecnico(tipo.mensaje)).toBe(false); }
    const grande = evaluarAdjuntoInlinePoliza(poliza, { size: TAMANO_MAX_ADJUNTO_POLIZA_BYTES + 1, type: 'application/pdf' });
    expect(grande.ok).toBe(false);
    if (grande.ok === false) { expect(grande.motivo).toBe('ARCHIVO_DEMASIADO_GRANDE'); expect(esMensajeTecnico(grande.mensaje)).toBe(false); }
  });
  it('C2 · si la ficha ya está casi llena, se rechaza aunque el archivo sea válido (límite de 1 MiB por documento)', () => {
    const llena = { ...poliza, documentosRenovacion: [{ url: `data:application/pdf;base64,${'A'.repeat(700_000)}` }] };
    const r = evaluarAdjuntoInlinePoliza(llena, { size: 300_000, type: 'application/pdf' });
    expect(r.ok).toBe(false);
    if (r.ok === false) { expect(r.motivo).toBe('FICHA_SIN_ESPACIO'); expect(esMensajeTecnico(r.mensaje)).toBe(false); }
    expect(bytesDataUrlEstimados(300_000, 'application/pdf')).toBe(400_000 + 'data:application/pdf;base64,'.length);
  });
});

// ---------------------------------------------------------------------------
// D · Invariantes de código: ningún consumidor vuelve al almacén retirado ni al SDK
// ---------------------------------------------------------------------------
describe('D · ningún flujo cliente usa ya el almacén temporal, el SDK de Storage ni fabrica referencias sin custodia', () => {
  const FICHEROS = [
    'src/lib/firebase.ts',
    'src/components/modals/GastoModal.tsx',
    'src/components/sections/CobrosSection.tsx',
    'src/components/PortalDocumentacionPublicaView.tsx',
    'src/components/modals/DetallePolizaModal.tsx',
  ];
  const sinComentarios = (f: string) => leer(f).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

  it('D1 · ninguna llamada a /api/upload-document fuera de comentarios; sin `server_${` ni `local_${itemId}`', () => {
    for (const f of FICHEROS) {
      const codigo = sinComentarios(f);
      expect(codigo, f).not.toMatch(/fetch\((['"`])\/api\/upload-document/);
      expect(codigo, f).not.toContain('server_${');
      expect(codigo, f).not.toContain('local_${itemId}');
    }
  });
  it('D2 · src/lib/documentosServidor.ts ya no existe y server.ts no lo importa', () => {
    expect(() => readFileSync(resolve(RAIZ, 'src/lib/documentosServidor.ts'))).toThrow();
    expect(leer('server.ts')).not.toContain('documentosServidor');
  });
  it('D3 · CobrosSection avisa con tipo error (no «éxito») cuando el justificante no se custodia', () => {
    const src = leer('src/components/sections/CobrosSection.tsx');
    expect(src).not.toMatch(/tipo:\s*'exito',\s*mensaje:\s*mensajeDeErrorUsuario\(upErr/);
    expect(src).toMatch(/tipo:\s*'error',\s*\n?\s*mensaje:\s*`\$\{mensajeDeErrorUsuario\(upErr/);
  });
  it('D4 · AG-03.2: en src/ sólo `getStorage` procede de firebase/storage; subidas, lecturas y borrados van por el motor del servidor', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const salida = execSync("grep -rn \"from 'firebase/storage'\" src --include=*.ts --include=*.tsx || true", { cwd: RAIZ, encoding: 'utf8' });
    const lineas = salida.split('\n').filter((l) => l && !/\.test\.tsx?:|\/test\//.test(l) && !/import type /.test(l));
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatch(/src\/lib\/firebase\.ts:\d+:import \{ getStorage \} from 'firebase\/storage';/);
    const motor = sinComentarios('src/lib/custodiaDocumental/almacenServidor.ts');
    for (const ruta of ['/api/documentos/subidas', '/api/documentos/subidas/confirmar', '/api/documentos/acceso', '/api/documentos/borrar', '/api/documentos/publico/subidas']) {
      expect(motor).toContain(`'${ruta}'`);
    }
    expect(motor).not.toMatch(/['"`]data:|base64|localStorage|sessionStorage/);
  });
  it('D5 · AG-04.1: src/lib/firebase.ts no fabrica referencias sin custodia (sin data-URL, local_*, server_* ni /api/documents/ inventadas)', () => {
    const codigo = sinComentarios('src/lib/firebase.ts');
    expect(codigo).not.toContain('readAsDataURL');
    expect(codigo).not.toContain('createObjectURL');
    expect(codigo).not.toContain('local_${');
    expect(codigo).not.toContain('server_${');
    expect(codigo).not.toContain('/api/documents/${');
  });
});

// ---------------------------------------------------------------------------
// E · AG-04.1: el resto de `upload*` de src/lib/firebase.ts también es
// fail-closed (motor real contra el servidor sintético): éxito sólo con
// objeto confirmado + URL; denegación o plazo agotado lanzan
// `ErrorCustodiaDocumento` y nunca resuelven con data-URL, `blob:` ni `local_*`.
// ---------------------------------------------------------------------------
describe('E · upload* restantes — Storage confirmado o error explícito; nunca éxito aparente', () => {
  const foto = () => new File([new Uint8Array(500)], 'foto.jpg', { type: 'image/jpeg' });

  it('E1 · uploadIncidenciaAdjuntoStorage: éxito → URL https del objeto; denegado → SIN_PERMISO', async () => {
    const url = await uploadIncidenciaAdjuntoStorage('inc_A', pdf(), 'parte.pdf', 'documento');
    expect(url).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\//);
    expect(url.startsWith('data:')).toBe(false);
    estado.modo = 'denegada';
    const e = await capturar(uploadIncidenciaAdjuntoStorage('inc_A', pdf(), 'parte.pdf', 'documento'));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(e.storagePath).toMatch(/^incidencias\/inc_A\//);
  });

  it('E2 · uploadPresupuestoDocumentoStorage denegado → SIN_PERMISO (nunca resuelve con data-URL y ruta real)', async () => {
    estado.modo = 'denegada';
    const e = await capturar(uploadPresupuestoDocumentoStorage('pres_A', pdf(), 'pres.pdf'));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(e.storagePath).toMatch(/^presupuestos\/pres_A\//);
  });

  it('E3 · uploadTrabajoAdjuntoStorage denegado → SIN_PERMISO (nunca resuelve con data-URL)', async () => {
    estado.modo = 'denegada';
    const e = await capturar(uploadTrabajoAdjuntoStorage('trab_A', pdf(), 'adj.pdf'));
    expect(e.codigo).toBe('SIN_PERMISO');
    expect(e.storagePath).toMatch(/^trabajos\/trab_A\//);
  });

  it('E4 · uploadInventarioAdjuntoStorage: éxito → ruta real + URL https; denegado → SIN_PERMISO', async () => {
    const r = await uploadInventarioAdjuntoStorage('inm_A', 'inv_A', foto(), 'foto.jpg');
    expect(r.storagePath).toMatch(/^inmuebles\/inm_A\/inventario\/inv_A\/\d+_foto\.jpg$/);
    expect(r.downloadURL).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\//);
    estado.modo = 'denegada';
    const e = await capturar(uploadInventarioAdjuntoStorage('inm_A', 'inv_A', foto(), 'foto.jpg'));
    expect(e.codigo).toBe('SIN_PERMISO');
  });

  it('E5 · uploadInmuebleImageToStorage: éxito → ruta del catálogo (sin local_*) + URL https; denegado → SIN_PERMISO', async () => {
    const r = await uploadInmuebleImageToStorage('inm_A', 'img_1', foto(), 'foto.jpg');
    expect(r.storagePath).toBe('inmuebles/inm_A/img_1_foto.jpg');
    expect(r.storagePath.startsWith('local_')).toBe(false);
    expect(r.downloadURL).toMatch(/^https:\/\//);
    expect(r.downloadURL.startsWith('data:')).toBe(false);
    expect(r.downloadURL.startsWith('blob:')).toBe(false);
    estado.modo = 'denegada';
    const e = await capturar(uploadInmuebleImageToStorage('inm_A', 'img_1', foto(), 'foto.jpg'));
    expect(e.codigo).toBe('SIN_PERMISO');
  });

  it('E6 · uploadInmuebleImageToStorage con el almacén colgado: TIEMPO_AGOTADO a los 2 s (antes: data-URL con éxito aparente)', async () => {
    vi.useFakeTimers();
    estado.modo = 'colgada';
    const captura = capturar(uploadInmuebleImageToStorage('inm_A', 'img_1', foto(), 'foto.jpg'));
    await vi.advanceTimersByTimeAsync(2_001);
    const e = await captura;
    expect(e.codigo).toBe('TIEMPO_AGOTADO');
    expect(e.storagePath).toBe('inmuebles/inm_A/img_1_foto.jpg');
  });

  it('E7 · uploadReformaAdjuntoStorage: denegado → SIN_PERMISO; colgado → TIEMPO_AGOTADO a los 8 s', async () => {
    estado.modo = 'denegada';
    const denegado = await capturar(uploadReformaAdjuntoStorage('proy_A', pdf(), 'plano.pdf', 'prop_A'));
    expect(denegado.codigo).toBe('SIN_PERMISO');
    vi.useFakeTimers();
    estado.modo = 'colgada';
    const captura = capturar(uploadReformaAdjuntoStorage('proy_A', pdf(), 'plano.pdf', 'prop_A'));
    await vi.advanceTimersByTimeAsync(8_001);
    const agotado = await captura;
    expect(agotado.codigo).toBe('TIEMPO_AGOTADO');
  });
});

// ---------------------------------------------------------------------------
// F · AG-04.1: el saneado previo a Firestore nunca inventa `/api/documents/*`
// ni trata sus referencias muertas como custodia.
// ---------------------------------------------------------------------------
describe('F · sanearAdjuntoParaFirestore — sin URL inventadas ni referencias muertas', () => {
  const base64Grande = `data:application/pdf;base64,${'A'.repeat(30_000)}`;
  const base64Pequeno = `data:application/pdf;base64,${'A'.repeat(100)}`;

  it('F1 · URL durable (https) + base64 grande → desprende la copia y conserva la URL', () => {
    const r = sanearAdjuntoParaFirestore({ id: 'a1', url: 'https://firebasestorage.googleapis.com/v0/b/x/o/y', base64Data: base64Grande, nombre: 'f.pdf' });
    expect(r).toEqual({ id: 'a1', url: 'https://firebasestorage.googleapis.com/v0/b/x/o/y', nombre: 'f.pdf' });
  });

  it('F2 · base64 grande sin URL → desprende el binario SIN inventar `/api/documents/*`', () => {
    const r = sanearAdjuntoParaFirestore({ id: 'a2', base64Data: base64Grande, nombre: 'f.pdf' });
    expect(r).toEqual({ id: 'a2', nombre: 'f.pdf' });
    expect('url' in r).toBe(false);
  });

  it('F3 · URL muerta `/api/documents/*` + base64 grande → elimina ambos, conserva los metadatos', () => {
    const r = sanearAdjuntoParaFirestore({ id: 'a3', url: '/api/documents/a3', base64Data: base64Grande, nombre: 'f.pdf' });
    expect(r).toEqual({ id: 'a3', nombre: 'f.pdf' });
  });

  it('F4 · URL muerta `/api/documents/*` + base64 pequeño → elimina la URL y conserva la copia', () => {
    const r = sanearAdjuntoParaFirestore({ id: 'a4', url: '/api/documents/a4', base64Data: base64Pequeno, nombre: 'f.pdf' });
    expect(r).toEqual({ id: 'a4', base64Data: base64Pequeno, nombre: 'f.pdf' });
  });

  it('F5 · base64 pequeño sin URL → intacto', () => {
    const entrada = { id: 'a5', base64Data: base64Pequeno, nombre: 'f.pdf' };
    expect(sanearAdjuntoParaFirestore(entrada)).toEqual(entrada);
  });

  it('F6 · sanitizeDocForFirestore: ningún archivo sale con `/api/documents/*` ni base64 voluminoso', () => {
    const salida = sanitizeDocForFirestore({
      id: 'sol-1',
      documentos: [{
        nombre: 'DNI', archivos: [
          { id: 'nuevo', base64Data: base64Grande, nombre: 'dni.pdf' },
          { id: 'heredado', url: '/api/documents/heredado', base64Data: base64Grande, nombre: 'viejo.pdf' },
          { id: 'nube', url: 'https://firebasestorage.googleapis.com/v0/b/x/o/y', base64Data: base64Grande, nombre: 'ok.pdf' },
        ],
      }],
    });
    const archivos = (salida.documentos as Array<{ archivos: Array<Record<string, unknown>> }>)[0].archivos;
    expect(JSON.stringify(archivos)).not.toContain('/api/documents/');
    expect(JSON.stringify(archivos)).not.toContain('AAAA');
    expect(archivos[0]).toEqual({ id: 'nuevo', nombre: 'dni.pdf' });
    expect(archivos[1]).toEqual({ id: 'heredado', nombre: 'viejo.pdf' });
    expect(archivos[2]).toEqual({ id: 'nube', url: 'https://firebasestorage.googleapis.com/v0/b/x/o/y', nombre: 'ok.pdf' });
  });

  it('F7 · saveCandidatoFirestore persiste los documentos saneados (sin base64 grande ni URL inventadas)', async () => {
    vi.mocked(setDoc).mockClear();
    await saveCandidatoFirestore({
      id: 'cand-1',
      documentosAnalizados: [
        { id: 'd1', base64Data: base64Grande, nombreArchivo: 'nomina.pdf' },
        { id: 'd2', url: '/api/documents/d2', base64Data: base64Pequeno, nombreArchivo: 'dni.pdf' },
      ],
    } as never);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const guardado = vi.mocked(setDoc).mock.calls[0][1] as { documentosAnalizados: Array<Record<string, unknown>> };
    expect(JSON.stringify(guardado.documentosAnalizados)).not.toContain('/api/documents/');
    expect(JSON.stringify(guardado.documentosAnalizados)).not.toContain('A'.repeat(10_000));
    expect(guardado.documentosAnalizados[0]).toEqual({ id: 'd1', nombreArchivo: 'nomina.pdf' });
    expect(guardado.documentosAnalizados[1]).toEqual({ id: 'd2', base64Data: base64Pequeno, nombreArchivo: 'dni.pdf' });
  });
});
