/**
 * IA · FASE 1 — INTEGRACIÓN EN server.ts
 * ======================================
 *  A. Cableado estático: los 11 endpoints del catálogo están montados con
 *     `nucleoIA.operacion('<ID>')`, ningún manejador usa IA sin el núcleo y el
 *     SDK del proveedor sólo se instancia/llama dentro de `server/ia/`.
 *  B. App REAL de server.ts (importada como en Vercel, sin `listen` propio):
 *     sin token o con token inválido, los 11 endpoints responden 401 sin
 *     ejecutar nada; `/api/health` expone el estado del núcleo sin secretos.
 *  C. Configuración: proyecto/base de datos de la aplicación y modos del
 *     registro (FIRESTORE / MEMORIA / NO_CONFIGURADO) según el entorno.
 */
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPERACIONES_IA } from '../src/ia/catalogoOperacionesIA';
import { crearDependenciasNucleoIA, resolverConfiguracionIA } from '../server/ia/configuracionIA';

const RAIZ = resolve(__dirname, '..');
const SERVER = readFileSync(join(RAIZ, 'server.ts'), 'utf8');

function ficherosTs(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...ficherosTs(ruta));
    else if (/\.(ts|tsx|mts)$/.test(nombre) && !/\.test\.(ts|tsx)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
}

describe('A · cableado estático del núcleo de IA', () => {
  it('cada operación del catálogo está montada UNA vez en server.ts con su middleware del núcleo', () => {
    expect(OPERACIONES_IA).toHaveLength(11);
    for (const { id, ruta } of OPERACIONES_IA) {
      const montaje = `app.post('${ruta}', nucleoIA.operacion('${id}'), async (req, res) => {`;
      expect(SERVER.split(montaje).length - 1, montaje).toBe(1);
    }
    expect(SERVER.match(/app\.post\('[^']+', nucleoIA\.operacion\('/g)).toHaveLength(OPERACIONES_IA.length);
  });

  it('ningún manejador de server.ts obtiene el cliente de IA sin pasar por el núcleo', () => {
    // Cada bloque = desde `app.<verbo>(` hasta su `});` de cierre (sin el código suelto posterior).
    const rutas = SERVER.split(/\n(?=app\.(?:get|post|put|patch|delete|all)\()/)
      .slice(1)
      .map((trozo) => trozo.slice(0, trozo.indexOf('\n});') + 4));
    expect(rutas.length).toBeGreaterThan(OPERACIONES_IA.length);
    let conIA = 0;
    for (const bloque of rutas) {
      const cabecera = bloque.slice(0, bloque.indexOf('\n'));
      if (/clienteIA\(|generateGeminiWithRetry\(/.test(bloque)) {
        conIA += 1;
        expect(cabecera, cabecera).toMatch(/nucleoIA\.operacion\('/);
      }
    }
    expect(conIA).toBe(OPERACIONES_IA.length);
    expect(SERVER.match(/const ai = clienteIA\(res\);/g)).toHaveLength(OPERACIONES_IA.length);
  });

  it('server.ts ya no crea clientes del proveedor por su cuenta', () => {
    expect(SERVER).not.toMatch(/getGeminiClient/);
    expect(SERVER).not.toMatch(/new GoogleGenAI/);
    expect(SERVER).not.toMatch(/from '@google\/genai'/);
    expect(SERVER).not.toMatch(/\.generateContent\(/);
  });

  it('en todo el código de aplicación, el SDK del proveedor sólo se instancia y se llama en server/ia/nucleoIA.ts', () => {
    const ficheros = [join(RAIZ, 'server.ts'), ...ficherosTs(join(RAIZ, 'server')), ...ficherosTs(join(RAIZ, 'api')), ...ficherosTs(join(RAIZ, 'src'))];
    const instancian = ficheros.filter((f) => /new GoogleGenAI\(/.test(readFileSync(f, 'utf8'))).map((f) => relative(RAIZ, f));
    const llaman = ficheros.filter((f) => /\.generateContent\(/.test(readFileSync(f, 'utf8'))).map((f) => relative(RAIZ, f));
    expect(instancian).toEqual(['server/ia/nucleoIA.ts']);
    expect(llaman).toEqual(['server/ia/nucleoIA.ts']);
  });
});

describe('B · app REAL de server.ts: los 11 endpoints exigen usuario autenticado', () => {
  const VARIABLES = ['VERCEL', 'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_B64', 'FIREBASE_SERVICE_ACCOUNT_PATH', 'GOOGLE_APPLICATION_CREDENTIALS', 'GEMINI_API_KEY'] as const;
  const previas: Record<string, string | undefined> = {};
  let servidor: Server;
  let base = '';

  beforeAll(async () => {
    for (const v of VARIABLES) previas[v] = process.env[v];
    // Como en Vercel: sin `app.listen` propio; sin credencial ni clave (sin red, sin datos).
    process.env.VERCEL = '1';
    for (const v of VARIABLES.slice(1)) delete process.env[v];
    const { default: app } = await import('../server');
    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((r) => (servidor ? servidor.close(() => r()) : r()));
    for (const v of VARIABLES) {
      if (previas[v] === undefined) delete process.env[v];
      else process.env[v] = previas[v];
    }
  });

  for (const { id, ruta } of OPERACIONES_IA) {
    it(`${ruta} (${id}) → 401 sin token y con token inválido`, async () => {
      const cuerpo = JSON.stringify({ prompt: 'x', input: 'ir a tesorería', capabilities: [], uid: 'uid-suplantado' });
      const sinToken = await fetch(`${base}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'clave-0001-aaaa' }, body: cuerpo });
      expect(sinToken.status).toBe(401);
      expect(await sinToken.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
      // Tokens mal formados: el verificador real los rechaza sin salir a la red.
      for (const token of ['abc', 'a.b.c']) {
        const invalido = await fetch(`${base}${ruta}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': 'clave-0001-aaaa' },
          body: cuerpo,
        });
        expect(invalido.status, token).toBe(401);
        expect(invalido.headers.get('x-ia-operacion-id')).toBeNull();
      }
    });
  }

  it('/api/health expone el estado del núcleo (modo de registro y nº de operaciones) sin secretos', async () => {
    const r = await fetch(`${base}/api/health`);
    expect(r.status).toBe(200);
    const salud = await r.json();
    expect(salud.ia).toEqual({ registro: 'NO_CONFIGURADO', autenticacion: 'TOKEN_FIREBASE', operaciones: 11 });
    expect(JSON.stringify(salud)).not.toMatch(/private_key|client_email|apiKey|BEGIN/i);
  });
});

describe('C · configuración del núcleo según el entorno', () => {
  const aplicacion = JSON.parse(readFileSync(join(RAIZ, 'firebase-applet-config.json'), 'utf8')) as { projectId: string; firestoreDatabaseId: string };
  const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cuentaJson = JSON.stringify({
    project_id: aplicacion.projectId,
    client_email: `sa@${aplicacion.projectId}.iam.gserviceaccount.com`,
    private_key: par.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });

  it('sin credencial: autentica contra el proyecto de la aplicación; producción → NO_CONFIGURADO, desarrollo → MEMORIA', () => {
    const prod = resolverConfiguracionIA({ VERCEL: '1' }, null);
    expect(prod).toEqual({ proyectoId: aplicacion.projectId, baseDatosId: aplicacion.firestoreDatabaseId, produccion: true, modoRegistro: 'NO_CONFIGURADO' });
    expect(resolverConfiguracionIA({ NODE_ENV: 'production' }, null).modoRegistro).toBe('NO_CONFIGURADO');
    expect(resolverConfiguracionIA({ NODE_ENV: 'development' }, null).modoRegistro).toBe('MEMORIA');
  });

  it('con credencial: registro FIRESTORE en la base de datos con nombre de la aplicación (o la indicada por entorno)', () => {
    const deps = crearDependenciasNucleoIA({ VERCEL: '1', FIREBASE_SERVICE_ACCOUNT: cuentaJson });
    expect(deps.registro?.tipo).toBe('FIRESTORE');
    expect(deps.configuracion).toMatchObject({ modoRegistro: 'FIRESTORE', baseDatosId: aplicacion.firestoreDatabaseId, proyectoId: aplicacion.projectId });
    const otra = resolverConfiguracionIA({ FIREBASE_PROJECT_ID: 'otro-proyecto', FIRESTORE_DATABASE_ID: 'otra-bd' }, null);
    expect(otra).toMatchObject({ proyectoId: 'otro-proyecto', baseDatosId: 'otra-bd' });
  });

  it('producción sin credencial: dependencias sin registro (el núcleo no llamará al proveedor) y sin cliente sin clave', () => {
    const deps = crearDependenciasNucleoIA({ VERCEL: '1' });
    expect(deps.registro).toBeNull();
    expect(deps.crearClienteProveedor()).toBeNull();
    expect(crearDependenciasNucleoIA({ VERCEL: '1', GEMINI_API_KEY: 'MY_GEMINI_API_KEY' }).crearClienteProveedor()).toBeNull();
  });

  it('el verificador rechaza tokens mal formados sin red', async () => {
    const deps = crearDependenciasNucleoIA({ VERCEL: '1' });
    await expect(deps.verificarToken('no-es-un-jwt')).resolves.toBeNull();
  });
});
