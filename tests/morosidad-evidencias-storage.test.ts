/**
 * R2 — Persistencia real en Firebase Storage de evidencias de morosidad.
 * Suite auto-contenida:
 *  - lógica cliente con el motor de almacén mediado por el servidor
 *    (`custodiaDocumental/almacenServidor`, AG-03.2) mockeado (sin red);
 *  - invariantes de autorización del destino `morosidad_evidencias` sobre el
 *    autorizador REAL del servidor (AG-03.2: la decisión ya no vive en
 *    `storage.rules`, que sólo puede leer la base `(default)`); si alguien
 *    relaja la regla R2 (master-only, append-only, 10 MB, PDF/imagen), el
 *    test falla.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EMAIL_MASTER } from '../server/titularidades/backendTitulares';
import { DESTINOS, validarContenido } from '../server/documentos/autorizacionDocumental';
import { permiteServidor, type PeticionServidor } from './helpers/autorizacionDocumentalHarness';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => {
  const calls = { uploadBytes: 0, getDownloadURL: 0 };
  let failUpload: Error | null = null;
  let neverResolve = false;
  return { calls, failUpload, neverResolve };
});

const refMock = vi.hoisted(() =>
  vi.fn((_storageObj: unknown, path: string) => ({ __path: path })),
);
const uploadBytesMock = vi.hoisted(() =>
  vi.fn(async (r: { __path: string }, _file: unknown, _meta?: unknown) => {
    void r;
    if (mem.neverResolve) return new Promise<never>(() => undefined);
    if (mem.failUpload) throw mem.failUpload;
    return { ref: r };
  }),
);
const getDownloadURLMock = vi.hoisted(() =>
  vi.fn(async (r: { __path: string }) => `https://descarga.test/${r.__path}`),
);

vi.mock('../src/lib/custodiaDocumental/almacenServidor', () => ({
  ref: refMock,
  uploadBytes: uploadBytesMock,
  getDownloadURL: getDownloadURLMock,
}));

vi.mock('../src/lib/firebase', () => ({ storage: {} }));

import {
  MOROSIDAD_EVIDENCIAS_RAIZ,
  TAMANO_MAX_EVIDENCIA_BYTES,
  TIPOS_MIME_PERMITIDOS_EVIDENCIA,
  TIMEOUT_SUBIDA_EVIDENCIA_MS,
  construirRutaEvidenciaMorosidad,
  obtenerUrlEvidenciaMorosidad,
  sanearSegmentoRuta,
  subirEvidenciaMorosidadStorage,
  validarArchivoEvidencia,
} from '../src/lib/morosidadEvidenciasStorage';

const MB = 1024 * 1024;
const pdf = (over: { size?: number; type?: string; name?: string } = {}) =>
  ({
    size: over.size ?? 1024,
    type: over.type ?? 'application/pdf',
    name: over.name ?? 'burofax.pdf',
  }) as unknown as File;

beforeEach(() => {
  mem.calls.uploadBytes = 0;
  mem.calls.getDownloadURL = 0;
  mem.failUpload = null;
  mem.neverResolve = false;
  refMock.mockClear();
  uploadBytesMock.mockClear();
  getDownloadURLMock.mockClear();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Rutas y validación (puro, sin red)
// ---------------------------------------------------------------------------
describe('R2 rutas deterministas y saneadas', () => {
  it('sanearSegmentoRuta conserva [A-Za-z0-9._-] y aplica fallback', () => {
    expect(sanearSegmentoRuta('prop_1.2-3', 'x')).toBe('prop_1.2-3');
    expect(sanearSegmentoRuta('a/b\\c d', 'x')).toBe('a_b_c_d');
    expect(sanearSegmentoRuta('../..', 'x')).toBe('.._..'); // puntos OK: sin / sigue siendo un solo segmento
    expect(sanearSegmentoRuta('', 'x')).toBe('x');
    expect(sanearSegmentoRuta('   ', 'x')).toBe('x');
  });

  it('construirRutaEvidenciaMorosidad genera morosidad_evidencias/{prop}/{exp}/{ts}_{rand}_{fich}', () => {
    const ruta = construirRutaEvidenciaMorosidad('prop_A', 'mor_c1_ab12', 'burofax 1.PDF', {
      ahora: 1720000000000,
      aleatorio: 'q7z2',
    });
    expect(ruta).toBe('morosidad_evidencias/prop_A/mor_c1_ab12/1720000000000_q7z2_burofax_1.PDF');
  });

  it('sanea segmentos hostiles (sin / ni .. en la ruta final)', () => {
    const ruta = construirRutaEvidenciaMorosidad('../../x', 'e/p', 'a/b.pdf', { ahora: 1, aleatorio: 'r' });
    expect(ruta).not.toContain('//');
    expect(ruta.split('/')).toHaveLength(4);
    expect(ruta.startsWith(`${MOROSIDAD_EVIDENCIAS_RAIZ}/`)).toBe(true);
  });

  it('lanza sin propietarioId o expedienteId (sin aislamiento no hay subida)', () => {
    expect(() => construirRutaEvidenciaMorosidad('', 'exp', 'a.pdf')).toThrow('propietarioId');
    expect(() => construirRutaEvidenciaMorosidad('  ', 'exp', 'a.pdf')).toThrow('propietarioId');
    expect(() => construirRutaEvidenciaMorosidad('prop', '', 'a.pdf')).toThrow('expedienteId');
  });

  it('por defecto usa timestamp + aleatorio (unicidad por subida)', () => {
    const a = construirRutaEvidenciaMorosidad('p', 'e', 'a.pdf');
    const b = construirRutaEvidenciaMorosidad('p', 'e', 'a.pdf');
    expect(a).toMatch(/^morosidad_evidencias\/p\/e\/\d+_[a-z0-9]+_a\.pdf$/);
    expect(a).not.toBe(b);
  });
});

describe('R2 validarArchivoEvidencia (cliente estricto)', () => {
  it('acepta PDF e imágenes dentro del límite', () => {
    for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
      expect(validarArchivoEvidencia(pdf({ type })).ok).toBe(true);
    }
  });

  it('rechaza ausencia, vacío, exceso de tamaño y tipos no permitidos', () => {
    expect(validarArchivoEvidencia(null)).toEqual({ ok: false, errores: ['archivo_requerido'] });
    expect(validarArchivoEvidencia(pdf({ size: 0 })).ok).toBe(false);
    expect(validarArchivoEvidencia(pdf({ size: 0 })).errores).toContain('archivo_vacio');
    expect(validarArchivoEvidencia(pdf({ size: 10 * MB + 1 })).errores).toContain('tamano_excedido_10MB');
    expect(validarArchivoEvidencia(pdf({ size: 10 * MB })).ok).toBe(true);
    expect(validarArchivoEvidencia(pdf({ type: 'text/plain' })).errores).toContain('tipo_no_permitido');
    expect(validarArchivoEvidencia(pdf({ type: '' })).errores).toContain('tipo_no_permitido');
  });
});

// ---------------------------------------------------------------------------
// Subida y recuperación (Storage mockeado)
// ---------------------------------------------------------------------------
describe('R2 subirEvidenciaMorosidadStorage', () => {
  it('sube con contentType y devuelve url efímera + path persistente + metadatos', async () => {
    const r = await subirEvidenciaMorosidadStorage('prop_A', 'mor_1', pdf({ size: 2048, name: 'req.pdf' }));
    expect(uploadBytesMock).toHaveBeenCalledTimes(1);
    const [referencia, _fichero, meta] = uploadBytesMock.mock.calls[0];
    expect(meta).toEqual({ contentType: 'application/pdf' });
    expect(r.storagePath).toMatch(/^morosidad_evidencias\/prop_A\/mor_1\/\d+_[a-z0-9]+_req\.pdf$/);
    expect(referencia.__path).toBe(r.storagePath);
    expect(r.url).toBe(`https://descarga.test/${r.storagePath}`);
    expect(r.nombreArchivo).toBe('req.pdf');
    expect(r.tipoMime).toBe('application/pdf');
    expect(r.tamanoBytes).toBe(2048);
  });

  it('no toca la red si el archivo es inválido', async () => {
    await expect(subirEvidenciaMorosidadStorage('prop_A', 'mor_1', pdf({ type: 'video/mp4' }))).rejects.toThrow(
      'tipo_no_permitido',
    );
    expect(uploadBytesMock).not.toHaveBeenCalled();
    expect(getDownloadURLMock).not.toHaveBeenCalled();
  });

  it('no toca la red sin propietario/expediente', async () => {
    await expect(subirEvidenciaMorosidadStorage('', 'mor_1', pdf())).rejects.toThrow('propietarioId');
    expect(uploadBytesMock).not.toHaveBeenCalled();
  });

  it('propaga el error de Storage (nunca silencia ni fabrica base64)', async () => {
    mem.failUpload = new Error('storage/unauthorized');
    await expect(subirEvidenciaMorosidadStorage('prop_A', 'mor_1', pdf())).rejects.toThrow(
      'storage/unauthorized',
    );
  });

  it('aborta con timeout si la subida se cuelga (sin fallback a data-URL)', async () => {
    vi.useFakeTimers();
    try {
      mem.neverResolve = true;
      const promesa = subirEvidenciaMorosidadStorage('prop_A', 'mor_1', pdf());
      const asercion = expect(promesa).rejects.toThrow('tardado demasiado');
      await vi.advanceTimersByTimeAsync(TIMEOUT_SUBIDA_EVIDENCIA_MS + 1);
      await asercion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('R2 obtenerUrlEvidenciaMorosidad', () => {
  it('resuelve un path propio a URL de descarga', async () => {
    const url = await obtenerUrlEvidenciaMorosidad('morosidad_evidencias/prop_A/mor_1/1_ab_x.pdf');
    expect(url).toBe('https://descarga.test/morosidad_evidencias/prop_A/mor_1/1_ab_x.pdf');
    expect(getDownloadURLMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza vacío, URLs, data-URLs y rutas de otras colecciones (sin llamar a Storage)', async () => {
    for (const ruta of ['', '   ', 'https://x.test/a.pdf', 'data:application/pdf;base64,xx', 'actas_fotos/p/a/f.jpg', 'morosidad_evidencias']) {
      await expect(obtenerUrlEvidenciaMorosidad(ruta)).rejects.toThrow();
    }
    expect(getDownloadURLMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Invariantes de autorización del destino morosidad_evidencias (red de seguridad R2)
// ---------------------------------------------------------------------------
const RULES_SRC = readFileSync(resolve(__dirname, '../storage.rules'), 'utf8');

describe('R2 autorización del servidor: destino morosidad_evidencias', () => {
  const RUTA = 'morosidad_evidencias/prop_A/mor_1/1700000000000_ab12_req.pdf';
  const DB: PeticionServidor['db'] = {
    'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A' },
    'usuarios_auth/uid_gestorE': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', carterasE: ['prop_A'] },
    'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  };
  const AUTH = {
    master: { uid: 'uid_master', token: { email: EMAIL_MASTER } },
    admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
    propA: { uid: 'uid_propA', token: { email: 'a@test.local' } },
    gestorE: { uid: 'uid_gestorE', token: { email: 'g@test.local' } },
    anon: null,
  };
  const pdf = (size = 1024, contentType = 'application/pdf') => ({ size, contentType, name: RUTA });
  const op = (verbo: 'get' | 'list' | 'create' | 'update' | 'delete', quien: keyof typeof AUTH, metadata?: ReturnType<typeof pdf>) =>
    permiteServidor(verbo, { auth: AUTH[quien], db: DB, path: RUTA, metadata: metadata ?? null });

  it('existe el destino con segmentos propietario + expediente + fichero', () => {
    const destino = DESTINOS.find((d) => d.clave === 'MOROSIDAD_EVIDENCIA')!;
    expect(destino).toBeDefined();
    expect(destino.patron.test(RUTA)).toBe(true);
    expect(destino.patron.test('morosidad_evidencias/prop_A/req.pdf')).toBe(false);
    expect(destino.patron.test('morosidad_evidencias/prop_A/mor_1/sub/req.pdf')).toBe(false);
    expect(destino.sobrescribible).toBe(false);
  });

  it('solo la administración maestra lee y crea (ni el titular, ni cartera E, ni el perfil ADMINISTRADOR)', async () => {
    expect(await op('get', 'master')).toBe(true);
    expect(await op('create', 'master', pdf())).toBe(true);
    for (const quien of ['admin', 'propA', 'gestorE', 'anon'] as const) {
      expect(await op('get', quien), quien).toBe(false);
      expect(await op('create', quien, pdf()), quien).toBe(false);
    }
  });

  it('append-only: sin update ni delete (tampoco el master)', async () => {
    expect(await op('update', 'master', pdf())).toBe(false);
    expect(await op('delete', 'master')).toBe(false);
    expect(await op('list', 'master')).toBe(false);
  });

  it('storage.rules ya no decide: no consulta Firestore y el catch-all deny sigue siendo el último', () => {
    const sinComentarios = RULES_SRC.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(sinComentarios).not.toMatch(/firestore\.(get|exists)\(/);
    expect(sinComentarios).not.toContain('morosidad_evidencias');
    const catchAll = RULES_SRC.indexOf('match /{allPaths=**}');
    expect(catchAll).toBeGreaterThan(0);
    expect(RULES_SRC.slice(catchAll)).toContain('allow read, write: if false;');
    expect(RULES_SRC.indexOf('match /', catchAll + 10)).toBe(-1);
  });

  it('el fichero está balanceado', () => {
    const abre = (RULES_SRC.match(/{/g) || []).length;
    const cierra = (RULES_SRC.match(/}/g) || []).length;
    expect(abre).toBe(cierra);
  });

  it('paridad cliente↔servidor: 10 MB y los mismos MIME que esEvidenciaValida()', async () => {
    expect(TAMANO_MAX_EVIDENCIA_BYTES).toBe(10 * 1024 * 1024);
    const destino = DESTINOS.find((d) => d.clave === 'MOROSIDAD_EVIDENCIA')!;
    expect(destino.contenido?.maxBytes).toBe(10 * 1024 * 1024);
    expect(validarContenido(destino, 'application/pdf', 10 * 1024 * 1024).permitido).toBe(false); // estricto (<)
    expect(validarContenido(destino, 'application/pdf', 10 * 1024 * 1024 - 1).permitido).toBe(true);
    for (const mime of TIPOS_MIME_PERMITIDOS_EVIDENCIA) {
      expect(validarContenido(destino, mime, 1024).permitido, mime).toBe(true);
    }
    for (const mime of ['image/gif', 'image/svg+xml', 'text/plain', 'application/octet-stream', 'video/mp4']) {
      expect(validarContenido(destino, mime, 1024).permitido, mime).toBe(false);
    }
    expect(await op('create', 'master', pdf(10 * 1024 * 1024))).toBe(false);
    expect(await op('create', 'master', pdf(1024, 'image/gif'))).toBe(false);
  });
});
