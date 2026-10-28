/**
 * P0.2.4 — `/api/catastro/consultar` deja de ser un proxy abierto.
 * Pruebas reales de la autorización pura y una petición HTTP real contra la
 * app Express (sin red externa: la denegación ocurre ANTES del fetch).
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { autorizarConsultaCatastro, tokenBearer } from '../server/catastro/autorizacionCatastro';
import { crearLimitadorVentana } from '../server/shared/rateLimit';

function peticion(token?: string) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Parameters<typeof autorizarConsultaCatastro>[0];
}

const Verificador = {
  async verificarToken(token: string) {
    return token === 'token-valido' ? { uid: 'uid-1' } : null;
  },
};

describe('autorizarConsultaCatastro · unidad', () => {
  it('extrae el Bearer y rechaza cabeceras malformadas', () => {
    expect(tokenBearer({ headers: { authorization: 'Bearer abc.def' } } as never)).toBe('abc.def');
    expect(tokenBearer({ headers: {} } as never)).toBe('');
  });

  it('sin token ⇒ 401 NO_AUTENTICADO', async () => {
    const r = await autorizarConsultaCatastro(peticion(), Verificador);
    expect(r).toMatchObject({ ok: false, status: 401, codigo: 'NO_AUTENTICADO' });
  });

  it('token inválido ⇒ 401 TOKEN_INVALIDO', async () => {
    const r = await autorizarConsultaCatastro(peticion('basura'), Verificador);
    expect(r).toMatchObject({ ok: false, status: 401, codigo: 'TOKEN_INVALIDO' });
  });

  it('token válido ⇒ autorizado; tras 20 consultas/min ⇒ 429 con reintento', async () => {
    const limitador = crearLimitadorVentana({ limite: 20, ventanaMs: 60_000, ahora: () => 1000 });
    let bloqueo: Awaited<ReturnType<typeof autorizarConsultaCatastro>> | null = null;
    for (let i = 0; i < 25; i += 1) {
      const r = await autorizarConsultaCatastro(peticion('token-valido'), { ...Verificador, limitador });
      if (!r.ok) { bloqueo = r; break; }
      expect(r.uid).toBe('uid-1');
    }
    expect(bloqueo).toMatchObject({ ok: false, status: 429, codigo: 'DEMASIADAS_PETICIONES' });
    expect((bloqueo as { reintentarEnSegundos?: number } | null)?.reintentarEnSegundos).toBeGreaterThan(0);
  });
});

vi.stubEnv('VERCEL', '1');
vi.stubEnv('NODE_ENV', 'test');

describe('POST /api/catastro/consultar · HTTP real', () => {
  let servidor: Server;
  let base = '';

  afterAll(async () => {
    if (servidor) await new Promise<void>((r) => servidor.close(() => r()));
    vi.unstubAllEnvs();
  });

  it('sin sesión responde 401 y NO contacta con el Catastro', async () => {
    const { default: app } = await import('../server');
    servidor = createServer(app as unknown as (req: unknown, res: unknown) => void);
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    const fetchExterno = vi.spyOn(globalThis, 'fetch');
    const antes = fetchExterno.mock.calls.length;
    const respuesta = await fetch(`${base}/api/catastro/consultar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ referenciaCatastral: '12345678901234567890' }),
    });
    expect(respuesta.status).toBe(401);
    expect(await respuesta.json()).toMatchObject({ ok: false, codigo: 'NO_AUTENTICADO' });
    // Solo la llamada de este test, nunca una salida al servicio del Catastro.
    expect(fetchExterno.mock.calls.length - antes).toBe(1);
    fetchExterno.mockRestore();
  }, 60000);
});
