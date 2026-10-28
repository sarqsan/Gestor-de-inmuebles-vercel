/**
 * P0.1 — Pruebas REALES del diagnóstico ejecutable `scripts/doctor.mjs`.
 * No hay servidor de por medio: se inyecta un `fetchImpl` doble para
 * verificar el contrato de `/api/health` sin tocar ningún entorno externo.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  clasificarHost,
  validarDestino,
  diagnosticosEstaticos,
  ejecutarDoctor,
  CAPACIDADES_NUCLEO,
  VARIABLES_DOCUMENTADAS,
  ESTADOS_NO_REALES,
} from '../scripts/doctor.mjs';
import { CAPACIDADES_SALUD, respuestaSalud } from './helpers/capacidadesSalud';

function fetchSalud(capacidades: Record<string, unknown> = CAPACIDADES_SALUD) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => respuestaSalud(capacidades),
  }));
}

describe('doctor · guardia de destino (nunca producción)', () => {
  it('clasifica hosts locales, sandbox, externos y de producción', () => {
    expect(clasificarHost('localhost')).toBe('LOCAL');
    expect(clasificarHost('127.0.0.1')).toBe('LOCAL');
    expect(clasificarHost('0.0.0.0')).toBe('LOCAL');
    expect(clasificarHost('[::1]')).toBe('LOCAL');
    expect(clasificarHost('3000-abc.e2b.app')).toBe('SANDBOX');
    expect(clasificarHost('ejemplo.com')).toBe('EXTERNO');
  });

  it.each([
    'gestor-inmuebles-produccion.vercel.app',
    'gestor-inmuebles-produccion.web.app',
    'gestor-inmuebles-produccion.firebaseapp.com',
    'cualquier-cosa.vercel.app',
    'app.run.app',
    'ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51.firebaseio.com',
  ])('rechaza explícitamente el host de producción %s', (host) => {
    expect(clasificarHost(host)).toBe('PRODUCCION');
    expect(() => validarDestino(`https://${host}/api/health`)).toThrow(/RECHAZADO/);
  });

  it('acepta localhost y rechaza externos salvo autorización explícita', () => {
    expect(validarDestino('http://127.0.0.1:3000/api/health').hostname).toBe('127.0.0.1');
    expect(() => validarDestino('https://staging.ejemplo.com/api/health')).toThrow(/no permitido/);
    expect(validarDestino('https://staging.ejemplo.com/api/health', 'staging.ejemplo.com').hostname)
      .toBe('staging.ejemplo.com');
  });

  it('no envía ninguna petición cuando el destino es producción (código 2)', async () => {
    const fetchImpl = fetchSalud();
    const lineas: string[] = [];
    const codigo = await ejecutarDoctor(
      ['--url', 'https://gestor-inmuebles-produccion.vercel.app/api/health'],
      { fetchImpl, log: (l: string) => lineas.push(l) },
    );
    expect(codigo).toBe(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lineas.join('\n')).toContain('RECHAZADO');
  });
});

describe('doctor · comprobaciones estáticas del repositorio', () => {
  it('las 6 comprobaciones estáticas están en verde y las 27 variables están documentadas', () => {
    const diagnosticos = diagnosticosEstaticos();
    expect(diagnosticos.length).toBeGreaterThanOrEqual(6);
    expect(diagnosticos.filter((d: { estado: string }) => d.estado === 'ERROR')).toEqual([]);
    expect(VARIABLES_DOCUMENTADAS).toHaveLength(27);
    expect(new Set(VARIABLES_DOCUMENTADAS).size).toBe(27);
  });

  it('sin servidor no afirma que las capacidades en vivo son reales', async () => {
    const lineas: string[] = [];
    const codigo = await ejecutarDoctor([], { log: (l: string) => lineas.push(l) });
    const texto = lineas.join('\n');
    expect(codigo).toBe(0);
    expect(texto).toContain('NO VERIFICADO EN VIVO');
    expect(texto).toContain('NINGUNA capacidad en vivo');
    expect(texto).not.toContain('8/8');
  });
});

describe('doctor · contrato de /api/health', () => {
  it('con las 8 capacidades OK informa 8/8 y sale 0 (incluido --strict)', async () => {
    const fetchImpl = fetchSalud();
    const lineas: string[] = [];
    const codigo = await ejecutarDoctor(
      ['--url', 'http://127.0.0.1:3000/api/health', '--strict'],
      { fetchImpl, log: (l: string) => lineas.push(l) },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(codigo).toBe(0);
    expect(lineas.join('\n')).toContain('Capacidades REALES verificadas: 8/8');
  });

  it('NO reporta verde si faltan secretos: NO_CONFIGURADO ⇒ código 1', async () => {
    const rotas = { ...CAPACIDADES_SALUD, firestore: { estado: 'NO_CONFIGURADO', detalle: 'sin credencial' } };
    const lineas: string[] = [];
    const codigo = await ejecutarDoctor(
      ['--url', 'http://127.0.0.1:3000/api/health'],
      { fetchImpl: fetchSalud(rotas), log: (l: string) => lineas.push(l) },
    );
    expect(codigo).toBe(1);
    expect(lineas.join('\n')).toContain('Faltan secretos/configuración');
    expect(lineas.join('\n')).toContain('firestore');
  });

  it('una SIMULACIÓN no se presenta como prueba real superada', async () => {
    const simulada = { ...CAPACIDADES_SALUD, modoEmail: { estado: 'SIMULACION', detalle: 'MODO_SEGURO' } };
    const lineas: string[] = [];
    expect(await ejecutarDoctor(
      ['--url', 'http://127.0.0.1:3000/api/health'],
      { fetchImpl: fetchSalud(simulada), log: (l: string) => lineas.push(l) },
    )).toBe(0);
    expect(lineas.join('\n')).toContain('NO son reales');
    expect(lineas.join('\n')).toContain('7/8');
    expect(await ejecutarDoctor(
      ['--url', 'http://127.0.0.1:3000/api/health', '--strict'],
      { fetchImpl: fetchSalud(simulada), log: () => {} },
    )).toBe(1);
    expect(ESTADOS_NO_REALES).toContain('SIMULACION');
  });

  it('rechaza respuestas sin el esquema P0.1 o con error HTTP', async () => {
    const sinEsquema = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok' }) }));
    const caido = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    expect(await ejecutarDoctor(['--url', 'http://127.0.0.1:3000/api/health'], { fetchImpl: sinEsquema, log: () => {} })).toBe(1);
    expect(await ejecutarDoctor(['--url', 'http://127.0.0.1:3000/api/health'], { fetchImpl: caido, log: () => {} })).toBe(1);
  });

  it('--json produce un objeto machine-readable con las 8 capacidades', async () => {
    const lineas: string[] = [];
    const codigo = await ejecutarDoctor(
      ['--url', 'http://127.0.0.1:3000/api/health', '--json'],
      { fetchImpl: fetchSalud(), log: (l: string) => lineas.push(l) },
    );
    const dato = JSON.parse(lineas.join('\n'));
    expect(codigo).toBe(0);
    expect(dato.reales).toBe(8);
    expect(dato.total).toBe(8);
    expect(dato.nucleo.map((c: { nombre: string }) => c.nombre)).toEqual([...CAPACIDADES_NUCLEO]);
  });
});
