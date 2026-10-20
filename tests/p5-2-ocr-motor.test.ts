import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P5.2-D · Motor OCR: plazo máximo, cancelación, indisponibilidad y
 * recursos con versión fijada. `tesseract.js` se dobla (el WASM real y la
 * CDN no se ejercitan en CI): estas pruebas NO demuestran el OCR real en
 * un navegador, solo la gestión segura de tiempo/cancelación/fallos.
 */

const mocks = vi.hoisted(() => ({
  recognize: vi.fn(),
  terminate: vi.fn(async () => undefined),
  createWorker: vi.fn(),
}));

vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => mocks.createWorker(...args),
}));

import {
  CODIGO_OCR_CANCELADO,
  CODIGO_OCR_TIEMPO_AGOTADO,
  MOTOR_OCR,
  esErrorOcrCancelado,
  esErrorOcrTiempoAgotado,
  reconocerDocumentoLocal,
} from '../src/lib/ocrFactura';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const archivoPng = () => new File([PNG], 'factura.png', { type: 'image/png' });
const nuncaResuelve = () => new Promise(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.terminate.mockResolvedValue(undefined);
  mocks.createWorker.mockResolvedValue({ recognize: mocks.recognize, terminate: mocks.terminate });
});

describe('P5.2-D · reconocerDocumentoLocal', () => {
  it('éxito: reconoce, termina el worker y usa las rutas fijadas del motor', async () => {
    mocks.recognize.mockResolvedValue({ data: { text: 'Factura con texto suficiente', confidence: 87 } });
    const resultado = await reconocerDocumentoLocal(archivoPng());
    expect(resultado.texto).toContain('Factura');
    expect(resultado.confianza).toBe(87);
    expect(mocks.terminate).toHaveBeenCalledTimes(1);
    const opciones = mocks.createWorker.mock.calls[0]?.[2] as Record<string, string>;
    expect(opciones.workerPath).toBe(MOTOR_OCR.workerPath);
    expect(opciones.corePath).toBe(MOTOR_OCR.corePath);
    expect(opciones.langPath).toBe(MOTOR_OCR.langPath);
  });

  it('tiempo agotado: detiene el reconocimiento, termina el worker y avisa sin guardar', async () => {
    mocks.recognize.mockImplementation(nuncaResuelve);
    const promesa = reconocerDocumentoLocal(archivoPng(), undefined, { plazoMs: 40 });
    await expect(promesa).rejects.toMatchObject({ codigo: CODIGO_OCR_TIEMPO_AGOTADO });
    await expect(promesa.catch((e: unknown) => e)).resolves.toSatisfy((e: unknown) => esErrorOcrTiempoAgotado(e));
    expect(mocks.terminate).toHaveBeenCalled();
  });

  it('cancelación por señal: rechaza como cancelado y termina el worker', async () => {
    mocks.recognize.mockImplementation(nuncaResuelve);
    const controlador = new AbortController();
    const promesa = reconocerDocumentoLocal(archivoPng(), undefined, { senal: controlador.signal, plazoMs: 0 });
    setTimeout(() => controlador.abort(), 10);
    await expect(promesa).rejects.toMatchObject({ codigo: CODIGO_OCR_CANCELADO });
    await expect(promesa.catch((e: unknown) => e)).resolves.toSatisfy((e: unknown) => esErrorOcrCancelado(e));
    expect(mocks.terminate).toHaveBeenCalled();
  });

  it('P5.3: si el worker nace tras agotarse el plazo, se termina y no queda huérfano', async () => {
    mocks.createWorker.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 70));
      return { recognize: mocks.recognize, terminate: mocks.terminate };
    });
    await expect(reconocerDocumentoLocal(archivoPng(), undefined, { plazoMs: 25 }))
      .rejects.toMatchObject({ codigo: CODIGO_OCR_TIEMPO_AGOTADO });
    await new Promise((resolve) => setTimeout(resolve, 90));
    expect(mocks.terminate).toHaveBeenCalled();
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it('motor no disponible (CDN/red): error claro de inicio, sin éxito ficticio', async () => {
    mocks.createWorker.mockRejectedValue(new Error('Failed to fetch dynamically'));
    await expect(reconocerDocumentoLocal(archivoPng())).rejects.toThrow(/No se pudo iniciar el motor OCR local/);
  });

  it('los recursos del motor llevan versión fijada (sin etiquetas flotantes)', () => {
    expect(MOTOR_OCR.workerPath).toContain('tesseract.js@7.0.0');
    expect(MOTOR_OCR.corePath).toContain('tesseract.js-core@7.0.0');
    expect(MOTOR_OCR.langPath).toContain('4.0.0');
    for (const ruta of [MOTOR_OCR.workerPath, MOTOR_OCR.corePath, MOTOR_OCR.langPath]) {
      expect(ruta).not.toMatch(/latest|@\^|@~/);
      expect(ruta.startsWith('https://')).toBe(true);
    }
  });
});
