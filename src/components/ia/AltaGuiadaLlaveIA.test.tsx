/**
 * IA · FASE 9 — ALTA GUIADA DE LA LLAVE PROPIA (jsdom, sin red)
 * =============================================================
 * La pantalla se prueba con `fetchImpl` y `obtenerToken` inyectados y el PDF
 * sustituido por dobles. Comprueba que: muestra el estado sin secretos; valida
 * la FORMA antes de enviar; envía la clave con `Idempotency-Key` y la vacía del
 * campo; refleja alta, SIN_CAMBIOS, revocación (con confirmación) y la
 * comprobación con el proveedor; degrada con claridad cuando el servidor
 * responde 503 (sin clave maestra); y nunca pinta el valor de la clave.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AltaGuiadaLlaveIA } from './AltaGuiadaLlaveIA';
import { CABECERA_IDEMPOTENCIA_IA } from '../../ia/catalogoOperacionesIA';
import { RUTA_LLAVE_USUARIO_IA, RUTA_VERIFICAR_LLAVE_USUARIO_IA, resumenLlaveAusente } from '../../ia/llavesUsuarioContrato';

// Sin `opciones` el componente usa el token real: se sustituye para no tocar Firebase en jsdom.
vi.mock('../../lib/busquedaTitularesServidor', () => ({ tokenUsuarioActual: async () => null }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LLAVE = 'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'; // 39 caracteres, forma válida
const SUBSISTEMA = { modo: 'USUARIO', sinLlave: 'RESPALDO', verificacion: 'DESACTIVADA' };
const REGISTRADA = {
  proveedor: 'GEMINI', estado: 'REGISTRADA', sufijo: LLAVE.slice(-4), registradaEn: '2026-10-16T10:00:00.000Z',
  verificadaEn: null, revocadaEn: null, ultimaVerificacion: null, sustituciones: 0,
};

type Respondedor = (url: string, init?: RequestInit) => { status?: number } & Record<string, unknown>;

function fetchDoble(rutas: Array<[metodo: string, ruta: string, responder: Respondedor]>) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    llamadas.push({ url, init });
    const metodo = init?.method ?? 'GET';
    for (const [m, ruta, responder] of rutas) {
      if (m === metodo && url === ruta) {
        const cuerpo = responder(url, init);
        const status = cuerpo.status ?? 200;
        return { ok: status < 400, status, json: async () => cuerpo };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: 'no', codigo: 'NO' }) };
  }) as unknown as typeof fetch;
  return { fetchImpl, llamadas };
}

const opciones = (fetchImpl: typeof fetch) => ({ fetchImpl, obtenerToken: async () => 'token-ana' });
const cabecera = (init: RequestInit | undefined, nombre: string) => (init?.headers as Record<string, string>)[nombre];

describe('AltaGuiadaLlaveIA · montaje por defecto (sin props)', () => {
  it('con el fetch real fallando, consulta UNA sola vez y muestra el error (sin bucle de renderizado)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('sin red'));
    render(<AltaGuiadaLlaveIA />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se ha podido consultar'));
    await new Promise((resolver) => setTimeout(resolver, 60));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(RUTA_LLAVE_USUARIO_IA);
  });
});

describe('AltaGuiadaLlaveIA · estado y tutorial', () => {
  it('muestra AUSENTE, el estado del subsistema y los pasos; los botones del tutorial llaman al PDF', async () => {
    const { fetchImpl, llamadas } = fetchDoble([
      ['GET', RUTA_LLAVE_USUARIO_IA, () => ({ llaves: SUBSISTEMA, llave: resumenLlaveAusente(), altaGuiada: [] })],
    ]);
    const descargarPdf = vi.fn();
    const imprimirPdf = vi.fn(() => true);
    render(<AltaGuiadaLlaveIA opciones={opciones(fetchImpl)} descargarPdf={descargarPdf} imprimirPdf={imprimirPdf} />);
    await waitFor(() => expect(screen.getByTestId('estado-llave').textContent).toContain('AUSENTE'));
    expect(cabecera(llamadas[0].init, 'Authorization')).toBe('Bearer token-ana');
    expect(screen.getByText(/modo básico/)).toBeTruthy();
    expect(screen.getByLabelText(/Tu clave de API/)).toBeTruthy();
    expect(screen.queryByText('Revocar')).toBeNull();
    fireEvent.click(screen.getByText('Descargar tutorial en PDF'));
    fireEvent.click(screen.getByText('Imprimir'));
    expect(descargarPdf).toHaveBeenCalledTimes(1);
    expect(imprimirPdf).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Abrir Google AI Studio').closest('a')?.getAttribute('href')).toBe('https://aistudio.google.com/app/apikey');
    expect(screen.getByText('Pasos del alta guiada')).toBeTruthy();
    expect(screen.getByText(/Crear la clave en Google AI Studio/)).toBeTruthy();
  });

  it('con 503 (sin clave maestra) explica que no está disponible y mantiene el tutorial', async () => {
    const { fetchImpl } = fetchDoble([
      ['GET', RUTA_LLAVE_USUARIO_IA, () => ({ status: 503, error: 'El alta de llaves propias de IA no está disponible en este entorno.', codigo: 'LLAVES_NO_CONFIGURADAS', llaves: 'NO_CONFIGURADO' })],
    ]);
    render(<AltaGuiadaLlaveIA opciones={opciones(fetchImpl)} descargarPdf={() => {}} imprimirPdf={() => true} />);
    await waitFor(() => expect(screen.getByText('El alta de llaves propias no está disponible en este entorno.')).toBeTruthy());
    expect(screen.getByText(/LLAVES_NO_CONFIGURADAS/)).toBeTruthy();
    expect(screen.queryByLabelText(/Tu clave de API/)).toBeNull();
    expect(screen.getByText('Descargar tutorial en PDF')).toBeTruthy();
  });
});

describe('AltaGuiadaLlaveIA · alta', () => {
  it.each([
    ['sk-no-es-de-google-1234567890123456', /«AIza» o «AQ\.»/],
    ['AQ.corta', /incompleta/],
    ['AQ.' + 'a'.repeat(40) + '!', /caracteres no admitidos/],
  ])('rechaza en local una clave con mala forma sin llamar al servidor (%#)', async (llave, mensaje) => {
    const { fetchImpl, llamadas } = fetchDoble([
      ['GET', RUTA_LLAVE_USUARIO_IA, () => ({ llaves: SUBSISTEMA, llave: resumenLlaveAusente(), altaGuiada: [] })],
    ]);
    render(<AltaGuiadaLlaveIA opciones={opciones(fetchImpl)} descargarPdf={() => {}} imprimirPdf={() => true} />);
    await waitFor(() => screen.getByLabelText(/Tu clave de API/));
    fireEvent.change(screen.getByLabelText(/Tu clave de API/), { target: { value: llave } });
    fireEvent.click(screen.getByText('Guardar clave'));
    expect((await screen.findByRole('alert')).textContent).toMatch(mensaje);
    expect(llamadas.filter((l) => l.init?.method === 'PUT')).toHaveLength(0);
  });

  it.each([LLAVE, 'AQ.' + 'aB9_-'.repeat(20)])('envía el formato admitido con autenticación, vacía el campo y no lo muestra (%#)', async (llave) => {
    const { fetchImpl, llamadas } = fetchDoble([
      ['GET', RUTA_LLAVE_USUARIO_IA, () => ({ llaves: SUBSISTEMA, llave: resumenLlaveAusente(), altaGuiada: [] })],
      ['PUT', RUTA_LLAVE_USUARIO_IA, () => ({ estado: 'REGISTRADA', llave: { ...REGISTRADA, sufijo: llave.slice(-4) }, llaves: SUBSISTEMA })],
    ]);
    const { container } = render(<AltaGuiadaLlaveIA opciones={opciones(fetchImpl)} descargarPdf={() => {}} imprimirPdf={() => true} />);
    const campo = await screen.findByLabelText(/Tu clave de API/);
    expect(campo?.getAttribute('type')).toBe('password');
    fireEvent.change(campo, { target: { value: ` "${llave}" ` } });
    fireEvent.click(screen.getByText('Guardar clave'));
    await waitFor(() => expect(screen.getByTestId('estado-llave').textContent).toContain('REGISTRADA'));
    const put = llamadas.find((l) => l.init?.method === 'PUT')!;
    expect(JSON.parse(String(put.init?.body))).toEqual({ llave }); // normalizada en local (comillas/espacios fuera)
    expect(cabecera(put.init, CABECERA_IDEMPOTENCIA_IA)).toMatch(/^[A-Za-z0-9_\-:.]{8,128}$/);
    expect(cabecera(put.init, 'Authorization')).toBe('Bearer token-ana');
    expect((screen.getByLabelText(/Sustituir por otra clave/) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(`…${llave.slice(-4)}`)).toBeTruthy();
    expect(screen.getByText(/Clave guardada cifrada/)).toBeTruthy();
    expect(container.textContent).not.toContain(llave);
    expect(screen.getByText('Revocar')).toBeTruthy();
  });

  it('SIN_CAMBIOS y errores del servidor (422 formato, 409 duplicada) se muestran sin romper', async () => {
    let respuesta: Record<string, unknown> = { estado: 'SIN_CAMBIOS', llave: REGISTRADA, llaves: SUBSISTEMA };
    const { fetchImpl } = fetchDoble([
      ['GET', RUTA_LLAVE_USUARIO_IA, () => ({ llaves: SUBSISTEMA, llave: REGISTRADA, altaGuiada: [] })],
      ['PUT', RUTA_LLAVE_USUARIO_IA, () => respuesta],
    ]);
    render(<AltaGuiadaLlaveIA opciones={opciones(fetchImpl)} descargarPdf={() => {}} imprimirPdf={() => true} />);
    const campo = await screen.findByLabelText(/Sustituir por otra clave/);
    fireEvent.change(campo, { target: { value: LLAVE } });
    fireEvent.click(screen.getByText('Guardar clave'));
    expect(await screen.findByText(/ya estaba registrada/)).toBeTruthy();
    respuesta = { status: 409, error: 'Esta acción ya se aplicó con la misma clave de idempotencia.', codigo: 'LLAVE_ACCION_DUPLICADA' };
    fireEvent.change(campo, { target: { value: LLAVE } });
    fireEvent.click(screen.getByText('Guardar clave'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/ya se aplicó/);
    expect(screen.getByTestId('estado-llave').textContent).toContain('REGISTRADA');
  });
});

describe('AltaGuiadaLlaveIA · revocación y comprobación', () => {
  it('revocar pide confirmación, llama a DELETE con Idempotency-Key y muestra REVOCADA', async () => {
    const { fetchImpl, llamadas } = fetchDoble([
      ['GET', RUTA_LLAVE_USUARIO_IA, () => ({ llaves: SUBSISTEMA, llave: REGISTRADA, altaGuiada: [] })],
      ['DELETE', RUTA_LLAVE_USUARIO_IA, () => ({ estado: 'REVOCADA', llave: { ...REGISTRADA, estado: 'REVOCADA', sufijo: null, revocadaEn: '2026-10-16T11:00:00.000Z' }, llaves: SUBSISTEMA })],
    ]);
    render(<AltaGuiadaLlaveIA opciones={opciones(fetchImpl)} descargarPdf={() => {}} imprimirPdf={() => true} />);
    fireEvent.click(await screen.findByText('Revocar'));
    expect(llamadas.filter((l) => l.init?.method === 'DELETE')).toHaveLength(0);
    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.click(screen.getByText('Revocar'));
    fireEvent.click(screen.getByText('Sí, revocar'));
    await waitFor(() => expect(screen.getByTestId('estado-llave').textContent).toContain('REVOCADA'));
    const del = llamadas.find((l) => l.init?.method === 'DELETE')!;
    expect(cabecera(del.init, CABECERA_IDEMPOTENCIA_IA)).toBeTruthy();
    expect(screen.getByText(/Clave revocada/)).toBeTruthy();
    expect(screen.queryByText('Revocar')).toBeNull();
    expect(screen.getByLabelText(/Tu clave de API/)).toBeTruthy(); // se puede volver a dar de alta
  });

  it('la comprobación está deshabilitada si el entorno la desactiva y, si está activa, refleja VERIFICADA o el rechazo', async () => {
    const desactivada = fetchDoble([
      ['GET', RUTA_LLAVE_USUARIO_IA, () => ({ llaves: SUBSISTEMA, llave: REGISTRADA, altaGuiada: [] })],
    ]);
    const primera = render(<AltaGuiadaLlaveIA opciones={opciones(desactivada.fetchImpl)} descargarPdf={() => {}} imprimirPdf={() => true} />);
    expect((await screen.findByText('Comprobar con el proveedor') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/está desactivada en este entorno/)).toBeTruthy();
    primera.unmount();

    let veredicto: Record<string, unknown> = { status: 422, error: 'El proveedor ha rechazado la llave.', codigo: 'LLAVE_RECHAZADA_POR_PROVEEDOR', llave: { ...REGISTRADA, ultimaVerificacion: 'FALLIDA' } };
    const activa = fetchDoble([
      ['GET', RUTA_LLAVE_USUARIO_IA, () => ({ llaves: { ...SUBSISTEMA, verificacion: 'PROVEEDOR' }, llave: REGISTRADA, altaGuiada: [] })],
      ['POST', RUTA_VERIFICAR_LLAVE_USUARIO_IA, () => veredicto],
    ]);
    render(<AltaGuiadaLlaveIA opciones={opciones(activa.fetchImpl)} descargarPdf={() => {}} imprimirPdf={() => true} />);
    const boton = await screen.findByText('Comprobar con el proveedor');
    expect((boton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(boton);
    expect((await screen.findByRole('alert')).textContent).toMatch(/rechazado la llave/);
    expect(screen.getByText(/última comprobación fallida/)).toBeTruthy();
    veredicto = { estado: 'VERIFICADA', llave: { ...REGISTRADA, estado: 'VERIFICADA', ultimaVerificacion: 'OK', verificadaEn: '2026-10-16T12:00:00.000Z' }, llaves: SUBSISTEMA };
    fireEvent.click(screen.getByText('Comprobar con el proveedor'));
    await waitFor(() => expect(screen.getByTestId('estado-llave').textContent).toContain('VERIFICADA'));
    const post = activa.llamadas.find((l) => l.init?.method === 'POST')!;
    expect(cabecera(post.init, CABECERA_IDEMPOTENCIA_IA)).toBeTruthy();
  });
});
