import { describe, expect, it, vi } from 'vitest';
import {
  cuerpoGrande,
  evaluarCodigo,
  evaluarSalud,
  validarDestinoProduccion,
  verificar,
} from '../scripts/verificar-produccion.mjs';

// La verificación de producción es de SOLO LECTURA y no usa secretos. Estos tests
// fijan las dos propiedades que la hacen segura: (1) rechaza destinos que darían
// un falso verde (localhost, http, dominios ajenos) y (2) falla si producción
// responde algo distinto de lo esperado en rutas que DEBEN ser rechazadas.

describe('verificación de producción · destino', () => {
  it('acepta un despliegue https de Vercel', () => {
    const u = validarDestinoProduccion('https://gestor-de-inmuebles-vercel-abc123-sarqsan2-4111s-projects.vercel.app/api/health');
    expect(u.hostname).toBe('gestor-de-inmuebles-vercel-abc123-sarqsan2-4111s-projects.vercel.app');
  });

  it('rechaza http, localhost y dominios ajenos', () => {
    expect(() => validarDestinoProduccion('http://x.vercel.app')).toThrow(/https/);
    expect(() => validarDestinoProduccion('https://localhost:3000')).toThrow(/local/);
    expect(() => validarDestinoProduccion('https://127.0.0.1')).toThrow(/local/);
    expect(() => validarDestinoProduccion('https://example.com')).toThrow(/no admitido/);
    expect(() => validarDestinoProduccion('no-es-una-url')).toThrow(/inválida/);
  });

  it('exige el host esperado cuando se indica', () => {
    expect(() =>
      validarDestinoProduccion('https://otro.vercel.app', 'gestor-de-inmuebles-vercel.vercel.app'),
    ).toThrow(/no es el esperado/);
  });
});

describe('verificación de producción · criterios', () => {
  it('la salud exige status ok, esquema 1 y mapa de capacidades', () => {
    expect(evaluarSalud({ status: 'ok', esquemaDiagnostico: 1, capacidades: {}, ia: { autenticacion: 'TOKEN_FIREBASE' } })).toEqual([]);
    expect(evaluarSalud({ status: 'degradado', esquemaDiagnostico: 1, capacidades: {} }).join(' ')).toMatch(/status/);
    expect(evaluarSalud({ status: 'ok', esquemaDiagnostico: 2, capacidades: {} }).join(' ')).toMatch(/esquemaDiagnostico/);
    expect(evaluarSalud({ status: 'ok', esquemaDiagnostico: 1 }).join(' ')).toMatch(/capacidades/);
    expect(evaluarSalud(null)).not.toEqual([]);
  });

  it('un 2xx donde se espera un rechazo es FALLO', () => {
    expect(evaluarCodigo('x', 410, 410).estado).toBe('OK');
    expect(evaluarCodigo('x', 410, 200, { codigo: 'OK' })).toEqual({
      nombre: 'x',
      estado: 'FALLO',
      detalle: 'HTTP 200, se esperaba 410 (codigo=OK)',
    });
  });
});

describe('verificación de producción · humo completo', () => {
  const respuesta = (estado, cuerpo) => ({ status: estado, json: async () => cuerpo });

  it('informa OK cuando producción responde lo esperado', async () => {
    const fetchImpl = vi.fn(async (url, opciones) => {
      if (url.endsWith('/api/health')) {
        return respuesta(200, { status: 'ok', esquemaDiagnostico: 1, capacidades: { firestore: { estado: 'OK' } }, ia: { autenticacion: 'TOKEN_FIREBASE' } });
      }
      if (url.endsWith('/api/actas/otp/entregar')) return respuesta(410, { codigo: 'RUTA_RETIRADA' });
      if (url.endsWith('/api/actas/otp/solicitar')) return respuesta(401, { codigo: 'NO_AUTENTICADO' });
      if (url.endsWith('/api/solicitud')) {
        expect(opciones.method).toBe('POST');
        return respuesta(413, { codigo: 'PETICION_INVALIDA' });
      }
      throw new Error(`URL inesperada: ${url}`);
    });
    const { ok, comprobaciones } = await verificar('https://demo.vercel.app', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(ok).toBe(true);
    expect(comprobaciones.map((c) => c.nombre)).toEqual([
      'salud',
      'otp-entregar-retirada',
      'otp-solicitar-sin-sesion',
      'limite-cuerpo-fragmentado',
    ]);
  });

  it('falla si la ruta retirada volviera a existir (relé de correo reabierto)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith('/api/health')) {
        return respuesta(200, { status: 'ok', esquemaDiagnostico: 1, capacidades: {}, ia: { autenticacion: 'X' } });
      }
      if (url.endsWith('/api/actas/otp/entregar')) return respuesta(200, { ok: true });
      return respuesta(401, { codigo: 'NO_AUTENTICADO' });
    });
    const { ok, comprobaciones } = await verificar('https://demo.vercel.app', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(ok).toBe(false);
    expect(comprobaciones.find((c) => c.nombre === 'otp-entregar-retirada').estado).toBe('FALLO');
  });

  it('el cuerpo de prueba es grande de verdad', () => {
    expect(cuerpoGrande().length).toBeGreaterThan(300 * 1024);
  });
});
