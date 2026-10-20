import { afterEach, describe, expect, it, vi } from 'vitest';
import { GmailApiError, sendGmailMessage } from './gmailClient';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respuestaGmail(status: number, body: unknown, ok = status >= 200 && status < 300): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('sendGmailMessage · confirmación verificable y resultado incierto', () => {
  it('acepta solo una respuesta 2xx que incluya id y threadId', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaGmail(200, { id: 'm-1', threadId: 't-1' })));

    await expect(sendGmailMessage('token-sintético', 'mime-sintético')).resolves.toEqual({ id: 'm-1', threadId: 't-1' });
  });

  it('clasifica fallo de transporte como incierto sin propagar detalles crudos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('token privado y contenido del mensaje')));

    const error = await sendGmailMessage('token-sintético', 'mime-sintético').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GmailApiError);
    expect(error).toMatchObject({ status: null, resultadoEnvio: 'INCIERTO' });
    expect((error as Error).message).not.toContain('token privado');
  });

  it('distingue rechazo HTTP de error servidor posiblemente incierto sin leer el body', async () => {
    const body = { error: { message: 'contenido sensible del proveedor' } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respuestaGmail(403, body, false))
      .mockResolvedValueOnce(respuestaGmail(503, body, false));
    vi.stubGlobal('fetch', fetchMock);

    const rechazado = await sendGmailMessage('token-sintético', 'mime-sintético').catch((e: unknown) => e);
    const incierto = await sendGmailMessage('token-sintético', 'mime-sintético').catch((e: unknown) => e);

    expect(rechazado).toMatchObject({ status: 403, resultadoEnvio: 'RECHAZADO' });
    expect(incierto).toMatchObject({ status: 503, resultadoEnvio: 'INCIERTO' });
    expect((rechazado as Error).message).not.toContain('contenido sensible');
    expect((incierto as Error).message).not.toContain('contenido sensible');
    expect(fetchMock.mock.results[0].value).toBeDefined();
  });

  it.each([
    ['id ausente', { threadId: 't-1' }],
    ['threadId ausente', { id: 'm-1' }],
    ['campos vacíos', { id: ' ', threadId: 't-1' }],
  ])('considera respuesta 2xx sin identificadores completos como incierta (%s)', async (_caso, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuestaGmail(200, body)));

    const error = await sendGmailMessage('token-sintético', 'mime-sintético').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 200, resultadoEnvio: 'INCIERTO' });
  });

  it('considera incierta una respuesta 2xx cuyo JSON no se puede leer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error('respuesta privada')),
    }));

    const error = await sendGmailMessage('token-sintético', 'mime-sintético').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 200, resultadoEnvio: 'INCIERTO' });
  });
});
