/**
 * F3 — BACKEND DE GOOGLE SIN SDK DE ADMINISTRACIÓN
 * =================================================
 * Pruebas reales (no simuladas) de la integración de servidor:
 *  · firma JWT RS256 con claves generadas en la propia prueba;
 *  · intercambio OAuth2 con caché;
 *  · verificación de ID token contra certificados x509 (firma, alg, kid,
 *    audiencia, emisor y caducidad);
 *  · códec y consultas del REST de Firestore.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateKeyPairSync,
  createSign,
  type KeyObject,
} from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ClienteFirestoreRest,
  codificarValor,
  decodificarCampos,
  decodificarValor,
  firmarJwtCuentaServicio,
  leerCuentaServicio,
  obtenerCertificados,
  obtenerTokenAcceso,
  parsearCuentaServicio,
  reiniciarCacheCertificados,
  reiniciarCacheTokens,
  verificarIdToken,
  type CuentaServicio,
} from '../server/titularidades/googleBackend';

// --- utilidades -------------------------------------------------------------

function b64url(texto: string | Buffer): string {
  return Buffer.from(texto).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privadaPem = par.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicaPem = par.publicKey.export({ type: 'spki', format: 'pem' }).toString();

const CUENTA: CuentaServicio = {
  project_id: 'proyecto-demo',
  client_email: 'sa@proyecto-demo.iam.gserviceaccount.com',
  private_key: privadaPem,
  private_key_id: 'kid-demo',
};

function respuesta(datos: unknown, opciones: { status?: number; headers?: Record<string, string> } = {}) {
  const status = opciones.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => datos,
    text: async () => (typeof datos === 'string' ? datos : JSON.stringify(datos)),
    headers: { get: (n: string) => opciones.headers?.[n.toLowerCase()] ?? null },
  };
}

/** Crea un ID token firmado con la clave de prueba. */
function idToken(claims: Record<string, unknown>, opciones: { alg?: string; kid?: string; clave?: KeyObject } = {}): string {
  const cabecera = { alg: opciones.alg ?? 'RS256', typ: 'JWT', kid: opciones.kid ?? 'kid-demo' };
  const cuerpo = { aud: 'proyecto-demo', iss: 'https://securetoken.google.com/proyecto-demo', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, sub: 'uid-1', ...claims };
  const firmable = `${b64url(JSON.stringify(cabecera))}.${b64url(JSON.stringify(cuerpo))}`;
  const firma = createSign('RSA-SHA256').update(firmable).sign(opciones.clave ?? par.privateKey);
  return `${firmable}.${b64url(firma)}`;
}

type FetchMock = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<unknown>;

/** Adapta el doble de fetch al tipo de la implementación sin perder seguridad. */
function comoFetch(fn: FetchMock) {
  return fn as never;
}

function fetchCertificados(certificados: Record<string, string>) {
  return vi.fn(async (url: string) => {
    if (String(url).includes('securetoken@system')) {
      return respuesta(certificados, { headers: { 'cache-control': 'public, max-age=3600' } });
    }
    throw new Error(`URL inesperada: ${url}`);
  }) as never;
}

beforeEach(() => {
  reiniciarCacheTokens();
  reiniciarCacheCertificados();
});

afterEach(() => {
  vi.restoreAllMocks();
  reiniciarCacheTokens();
  reiniciarCacheCertificados();
});

describe('credencial de servicio', () => {
  it('lee FIREBASE_SERVICE_ACCOUNT (JSON directo)', () => {
    const cuenta = leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CUENTA) });
    expect(cuenta?.project_id).toBe('proyecto-demo');
    expect(cuenta?.private_key).toContain('PRIVATE KEY');
  });

  it('lee FIREBASE_SERVICE_ACCOUNT_B64', () => {
    const b64 = Buffer.from(JSON.stringify(CUENTA)).toString('base64');
    expect(leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT_B64: b64 })?.client_email).toBe(CUENTA.client_email);
  });

  it('lee GOOGLE_APPLICATION_CREDENTIALS (ruta a fichero)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-'));
    const ruta = join(dir, 'sa.json');
    writeFileSync(ruta, JSON.stringify(CUENTA), 'utf8');
    expect(leerCuentaServicio({ GOOGLE_APPLICATION_CREDENTIALS: ruta })?.project_id).toBe('proyecto-demo');
  });

  it('sin credencial ⇒ null (y por tanto 503 accionable, nunca degradación)', () => {
    expect(leerCuentaServicio({})).toBeNull();
    expect(leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: '{no es json' })).toBeNull();
  });

  it('parsearCuentaServicio exige project_id, client_email y private_key', () => {
    expect(parsearCuentaServicio('{}')).toBeNull();
    expect(parsearCuentaServicio(JSON.stringify({ project_id: 'p', client_email: 'c' }))).toBeNull();
    expect(parsearCuentaServicio('basura')).toBeNull();
  });

  it('admite claves privadas con \n escapados', () => {
    const escapada = { ...CUENTA, private_key: privadaPem.replace(/\n/g, '\\n') };
    expect(parsearCuentaServicio(JSON.stringify(escapada))?.private_key).toContain('PRIVATE KEY');
  });
});

describe('autorización de servicio (JWT RS256 → OAuth2)', () => {
  it('el JWT lleva cabecera RS256 y las claims correctas', () => {
    const jwt = firmarJwtCuentaServicio(CUENTA, { jti: 'fijo' });
    const [h, p, firma] = jwt.split('.');
    expect(h && p && firma).toBeTruthy();
    const cabecera = JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
    const cuerpo = JSON.parse(Buffer.from(p, 'base64').toString('utf8'));
    expect(cabecera.alg).toBe('RS256');
    expect(cabecera.kid).toBe('kid-demo');
    expect(cuerpo.iss).toBe(CUENTA.client_email);
    expect(cuerpo.scope).toContain('datastore');
    expect(cuerpo.aud).toBe('https://oauth2.googleapis.com/token');
    expect(cuerpo.exp - cuerpo.iat).toBe(3600);
    expect(cuerpo.jti).toBe('fijo');
  });

  it('intercambia el JWT por un access_token y lo cachea', async () => {
    const fetchImpl = vi.fn(async () => respuesta({ access_token: 'tok-1', expires_in: 3600 })) as never;
    const token = await obtenerTokenAcceso(CUENTA, { fetchImpl });
    expect(token).toBe('tok-1');
    const segundo = await obtenerTokenAcceso(CUENTA, { fetchImpl });
    expect(segundo).toBe('tok-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1); // caché
  });

  it('renueva el token cuando la caché ha caducado', async () => {
    const fetchImpl = vi.fn(async () => respuesta({ access_token: 'tok-x', expires_in: 1 })) as never;
    await obtenerTokenAcceso(CUENTA, { fetchImpl, ahora: new Date('2026-01-01T00:00:00Z') });
    await obtenerTokenAcceso(CUENTA, { fetchImpl, ahora: new Date('2026-01-01T01:00:00Z') });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('un error de autorización se propaga (sin degradación silenciosa)', async () => {
    const fetchImpl = vi.fn(async () => respuesta('sin permisos', { status: 403 })) as never;
    await expect(obtenerTokenAcceso(CUENTA, { fetchImpl })).rejects.toThrow(/403/);
  });
});

describe('verificación del ID token del usuario', () => {
  const certificados = { 'kid-demo': publicaPem };

  it('token correcto ⇒ uid', async () => {
    const token = idToken({ sub: 'uid-abc', email: 'a@b.com' });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toEqual({
      uid: 'uid-abc',
      email: 'a@b.com',
    });
  });

  it('rechaza algoritmo distinto de RS256', async () => {
    const token = idToken({ sub: 'uid-1' }, { alg: 'none' });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
  });

  it('rechaza un kid desconocido', async () => {
    const token = idToken({ sub: 'uid-1' }, { kid: 'otro-kid' });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
  });

  it('rechaza una firma falsa', async () => {
    const otroPar = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = idToken({ sub: 'uid-1' }, { clave: otroPar.privateKey });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
  });

  it('rechaza audiencia incorrecta', async () => {
    const token = idToken({ sub: 'uid-1', aud: 'otro-proyecto' });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
  });

  it('rechaza emisor incorrecto', async () => {
    const token = idToken({ sub: 'uid-1', iss: 'https://securetoken.google.com/otro' });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
  });

  it('rechaza un token caducado', async () => {
    const token = idToken({ sub: 'uid-1', exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
  });

  it('rechaza un token emitido en el futuro', async () => {
    const token = idToken({ sub: 'uid-1', iat: Math.floor(Date.now() / 1000) + 600 });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
  });

  it('rechaza basura y tokens mal formados', async () => {
    await expect(verificarIdToken('', 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
    await expect(verificarIdToken('a.b', 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
    await expect(verificarIdToken('a.b.c', 'proyecto-demo', { fetchImpl: fetchCertificados(certificados) })).resolves.toBeNull();
  });

  it('sin certificados disponibles ⇒ null', async () => {
    const token = idToken({ sub: 'uid-1' });
    await expect(verificarIdToken(token, 'proyecto-demo', { fetchImpl: fetchCertificados({}) })).resolves.toBeNull();
  });

  it('cachea los certificados y los refresca al reiniciar la caché', async () => {
    const fetchImpl = fetchCertificados(certificados);
    await obtenerCertificados({ fetchImpl });
    await obtenerCertificados({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    reiniciarCacheCertificados();
    await obtenerCertificados({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('Firestore REST', () => {
  const fetchToken = vi.fn(async () => respuesta({ access_token: 'tok', expires_in: 3600 })) as never;

  it('lee un documento y decodifica los campos', async () => {
    const cliente = new ClienteFirestoreRest({ cuenta: CUENTA, fetchImpl: comoFetch(async (url: string, init?: { signal?: AbortSignal }) => {
      if (String(url).includes('oauth2')) return respuesta({ access_token: 'tok', expires_in: 3600 });
      if (String(url).endsWith('/inmuebles/inm-1')) {
        return respuesta({
          name: 'projects/p/databases/(default)/documents/inmuebles/inm-1',
          fields: { propietarioId: { stringValue: 'p1' }, titularesIds: { arrayValue: { values: [{ stringValue: 'p1' }, { stringValue: 'p2' }] } } },
        });
      }
      return respuesta('no encontrado', { status: 404 });
    }) });
    const doc = await cliente.leer('inmuebles', 'inm-1');
    expect(doc?.id).toBe('inm-1');
    expect(doc?.datos).toEqual({ propietarioId: 'p1', titularesIds: ['p1', 'p2'] });
    expect(await cliente.leer('inmuebles', 'no-existe')).toBeNull();
  });

  it('la consulta por prefijo va LIMITADA y acotada por el término', async () => {
    let cuerpoEnviado = '';
    const cliente = new ClienteFirestoreRest({ cuenta: CUENTA, fetchImpl: comoFetch(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('oauth2')) return respuesta({ access_token: 'tok', expires_in: 3600 });
      cuerpoEnviado = init?.body || '';
      return respuesta([{ document: { name: 'projects/p/databases/(default)/documents/propietarios/p1', fields: { nombre: { stringValue: 'Ana' } } } }]);
    }) });
    const filas = await cliente.consultarPrefijo('propietarios', 'nombre', 'ana', 25);
    expect(filas).toEqual([{ id: 'p1', datos: { nombre: 'Ana' } }]);
    const consulta = JSON.parse(cuerpoEnviado).structuredQuery;
    expect(consulta.limit).toBe(25);
    expect(consulta.where.compositeFilter.filters[0].fieldFilter.op).toBe('GREATER_THAN_OR_EQUAL');
    expect(consulta.where.compositeFilter.filters[1].fieldFilter.op).toBe('LESS_THAN_OR_EQUAL');
  });

  it('sin prefijo no se consulta nada (sin enumeración global)', async () => {
    const cliente = new ClienteFirestoreRest({ cuenta: CUENTA, fetchImpl: fetchToken });
    await expect(cliente.consultarPrefijo('propietarios', 'nombre', '', 25)).resolves.toEqual([]);
  });

  it('propaga los errores de Firestore', async () => {
    const cliente = new ClienteFirestoreRest({ cuenta: CUENTA, fetchImpl: async () => respuesta('denegado', { status: 403 }) } as never);
    await expect(cliente.leer('inmuebles', 'x')).rejects.toThrow(/403/);
  });

  it('el códec cubre todos los tipos de Firestore', () => {
    const original = {
      texto: 'hola',
      entero: 7,
      decimal: 1.5,
      si: true,
      nada: null,
      lista: ['a', 1],
      mapa: { dentro: 'x', numero: 2 },
    };
    const codificado = Object.fromEntries(
      Object.entries(original).map(([k, v]) => [k, codificarValor(v)]),
    ) as Record<string, never>;
    expect(decodificarCampos(codificado)).toEqual({ ...original, nada: null });
    expect(decodificarValor({ stringValue: 'x' })).toBe('x');
    expect(decodificarValor({ integerValue: '3' })).toBe(3);
    expect(decodificarValor({ doubleValue: 2.5 })).toBe(2.5);
    expect(decodificarValor({ booleanValue: false })).toBe(false);
    expect(decodificarValor({ nullValue: null })).toBeNull();
  });
});
