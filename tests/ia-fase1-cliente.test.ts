/**
 * IA · FASE 1 — CLIENTE ÚNICO DE IA (src/lib/clienteIA.ts)
 * ========================================================
 *  · Cada petición de IA lleva el ID token de la sesión (si la hay) y una
 *    `Idempotency-Key` nueva y válida para el servidor; el cuerpo no cambia.
 *  · El proveedor remoto del asistente, con `crearFetchIA`, envía identidad.
 *  · Guardas estáticas: ninguna pantalla llama a un endpoint de IA con `fetch`
 *    directo; todas pasan por `solicitarIA`/`fetchIA`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cabecerasIA, crearFetchIA, nuevaClaveIdempotencia, solicitarIA } from '../src/lib/clienteIA';
import { OPERACIONES_IA, PATRON_CLAVE_IDEMPOTENCIA_IA } from '../src/ia/catalogoOperacionesIA';
import { crearProveedorGeminiRemoto } from '../src/experiencia/proveedorGemini';

const RAIZ = resolve(__dirname, '..');

function capturador() {
  const peticiones: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    peticiones.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ disponible: true, proveedor: 'gemini', propuesta: { intencion: 'NAVEGAR', capabilityId: 'cap.portal.recibos', confianza: 0.9 } }), { status: 200 });
  }) as typeof fetch;
  return { peticiones, fetchImpl };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('IA Fase 1 · solicitarIA', () => {
  it('POST JSON con Bearer del usuario, Idempotency-Key válida y el MISMO cuerpo', async () => {
    const { peticiones, fetchImpl } = capturador();
    const cuerpo = { candidatoNombre: 'Ana', respuestas: [{ id: 1, valor: 'sí' }], informacionAdicional: '' };
    await solicitarIA('/api/analizar-cuestionario', cuerpo, { fetchImpl, obtenerToken: async () => 'id-token-ana' });
    const [{ url, init }] = peticiones;
    const cabeceras = init.headers as Record<string, string>;
    expect(url).toBe('/api/analizar-cuestionario');
    expect(init.method).toBe('POST');
    expect(cabeceras['Content-Type']).toBe('application/json');
    expect(cabeceras.Authorization).toBe('Bearer id-token-ana');
    expect(PATRON_CLAVE_IDEMPOTENCIA_IA.test(cabeceras['Idempotency-Key'])).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual(cuerpo);
  });

  it('una clave de idempotencia NUEVA por operación (dos llamadas = dos operaciones)', async () => {
    const { peticiones, fetchImpl } = capturador();
    const opciones = { fetchImpl, obtenerToken: async () => 'id-token-ana' };
    await solicitarIA('/api/estimar-pricing', { base: {} }, opciones);
    await solicitarIA('/api/estimar-pricing', { base: {} }, opciones);
    const claves = peticiones.map((p) => (p.init.headers as Record<string, string>)['Idempotency-Key']);
    expect(new Set(claves).size).toBe(2);
  });

  it('sin sesión NO inventa identidad: va sin Authorization y el servidor responde 401', async () => {
    const { peticiones, fetchImpl } = capturador();
    await solicitarIA('/api/redactar-clausula', { prompt: 'x' }, { fetchImpl, obtenerToken: async () => null });
    const cabeceras = peticiones[0].init.headers as Record<string, string>;
    expect(cabeceras).not.toHaveProperty('Authorization');
    expect(cabeceras['Idempotency-Key']).toBeTruthy();
  });

  it('por defecto usa el token de la sesión de Firebase (tokenUsuarioActual) y el fetch global', async () => {
    vi.resetModules();
    vi.doMock('../src/lib/busquedaTitularesServidor', () => ({ tokenUsuarioActual: async () => 'token-de-sesion' }));
    const { peticiones, fetchImpl } = capturador();
    vi.stubGlobal('fetch', fetchImpl);
    const { solicitarIA: solicitarConSesion } = await import('../src/lib/clienteIA');
    await solicitarConSesion('/api/proponer-mejoras', { fotos: [] });
    expect((peticiones[0].init.headers as Record<string, string>).Authorization).toBe('Bearer token-de-sesion');
    vi.doUnmock('../src/lib/busquedaTitularesServidor');
  });
});

describe('IA Fase 1 · fetchIA y proveedor remoto del asistente', () => {
  it('crearFetchIA conserva cabeceras y cuerpo del adaptador y añade identidad + idempotencia', async () => {
    const { peticiones, fetchImpl } = capturador();
    const proveedor = crearProveedorGeminiRemoto(crearFetchIA({ fetchImpl, obtenerToken: async () => 'id-token-inquilino' }));
    const propuesta = await proveedor.interpretar({
      input: 'ver recibos', host: 'PORTAL_INQUILINO', capabilities: [], helpEntries: [], tutorials: [], routes: [],
    } as never);
    expect(propuesta).toMatchObject({ capabilityId: 'cap.portal.recibos' });
    const [{ url, init }] = peticiones;
    const cabeceras = init.headers as Record<string, string>;
    expect(url).toBe('/api/asistente/interpretar');
    expect(cabeceras['Content-Type']).toBe('application/json');
    expect(cabeceras.Authorization).toBe('Bearer id-token-inquilino');
    expect(PATRON_CLAVE_IDEMPOTENCIA_IA.test(cabeceras['Idempotency-Key'])).toBe(true);
    expect(JSON.parse(String(init.body))).toMatchObject({ input: 'ver recibos', host: 'PORTAL_INQUILINO' });
  });

  it('cabecerasIA acepta Headers y pares, sin duplicar Content-Type', async () => {
    const desdeHeaders = await cabecerasIA(new Headers({ 'content-type': 'application/json', 'X-Extra': '1' }), { obtenerToken: async () => null, claveIdempotencia: 'clave-fija-0001' });
    expect(desdeHeaders).toEqual({ 'content-type': 'application/json', 'x-extra': '1', 'Idempotency-Key': 'clave-fija-0001' });
    const desdePares = await cabecerasIA([['X-Extra', '2']], { obtenerToken: async () => 't', claveIdempotencia: 'clave-fija-0002' });
    expect(desdePares).toEqual({ 'X-Extra': '2', 'Content-Type': 'application/json', Authorization: 'Bearer t', 'Idempotency-Key': 'clave-fija-0002' });
  });

  it('clave de idempotencia: UUID cuando existe randomUUID y 128 bits en hex como alternativa', () => {
    expect(nuevaClaveIdempotencia()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => b.fill(171) });
    const alternativa = nuevaClaveIdempotencia();
    expect(alternativa).toBe('ab'.repeat(16));
    expect(PATRON_CLAVE_IDEMPOTENCIA_IA.test(alternativa)).toBe(true);
    vi.stubGlobal('crypto', undefined);
    expect(() => nuevaClaveIdempotencia()).toThrow(/criptográfico/);
  });
});

describe('IA Fase 1 · guardas estáticas del cliente', () => {
  function ficheros(dir: string): string[] {
    const salida: string[] = [];
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta));
      else if (/\.(ts|tsx)$/.test(nombre) && !/\.test\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
    }
    return salida;
  }
  const FUENTES = ficheros(join(RAIZ, 'src')).map((f) => ({ fichero: relative(RAIZ, f).replace(/\\/g, '/'), codigo: readFileSync(f, 'utf8') }));
  const RUTAS = OPERACIONES_IA.map((o) => o.ruta);

  it('ninguna pantalla llama a un endpoint de IA con fetch directo', () => {
    const patron = new RegExp(`fetch\\(\\s*['"\`](${RUTAS.map((r) => r.replace(/[/-]/g, '\\$&')).join('|')})`);
    const infractores = FUENTES.filter((f) => patron.test(f.codigo)).map((f) => f.fichero);
    expect(infractores).toEqual([]);
  });

  it('las rutas de IA sólo aparecen en el catálogo, en el adaptador del asistente o como destino de solicitarIA', () => {
    const permitidos = new Set(['src/ia/catalogoOperacionesIA.ts', 'src/experiencia/proveedorGemini.ts']);
    const usos: string[] = [];
    for (const { fichero, codigo } of FUENTES) {
      if (permitidos.has(fichero)) continue;
      for (const ruta of RUTAS) {
        for (const m of codigo.matchAll(new RegExp(`['"\`]${ruta.replace(/[/-]/g, '\\$&')}['"\`]`, 'g'))) {
          const previo = codigo.slice(Math.max(0, (m.index ?? 0) - 'solicitarIA('.length), m.index);
          if (previo !== 'solicitarIA(') usos.push(`${fichero}: ${ruta}`);
        }
      }
    }
    expect(usos).toEqual([]);
    // Las 14 llamadas de las pantallas cubren 11 de las 12 operaciones; el asistente va por fetchIA.
    const llamadas = FUENTES.flatMap((f) => [...f.codigo.matchAll(/solicitarIA\('([^']+)'/g)].map((m) => m[1]));
    expect(llamadas).toHaveLength(14);
    expect(new Set(llamadas)).toEqual(new Set(RUTAS.filter((r) => r !== '/api/asistente/interpretar')));
  });

  it('las instancias del proveedor remoto del asistente en la app usan fetchIA (identidad + idempotencia)', () => {
    const instancias = FUENTES.flatMap((f) => [...f.codigo.matchAll(/crearProveedorGeminiRemoto\(([^)]*)\)/g)].map((m) => ({ fichero: f.fichero, args: m[1] })))
      .filter((i) => !i.fichero.endsWith('proveedorGemini.ts') && !i.fichero.endsWith('index.ts'));
    expect(instancias.map((i) => i.fichero).sort()).toEqual(['src/App.tsx', 'src/components/portal-inquilino/InquilinoPortalShell.tsx']);
    for (const i of instancias) expect(i.args, i.fichero).toBe('fetchIA');
  });
});
