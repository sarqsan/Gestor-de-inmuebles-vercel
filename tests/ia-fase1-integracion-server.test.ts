/**
 * IA · FASE 1 — INTEGRACIÓN EN server.ts
 * ======================================
 *  A. Cableado estático: los 12 endpoints del catálogo están montados con
 *     `nucleoIA.operacion('<ID>')`, ningún manejador usa IA sin el núcleo y el
 *     SDK del proveedor sólo se instancia/llama dentro de `server/ia/`.
 *  B. App REAL de server.ts (importada como en Vercel, sin `listen` propio):
 *     sin credencial de producción, los 12 endpoints responden 503 sin
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
import { construirPoliticaIACompleta, OPERACIONES_IA_IDS } from '../src/ia/gobiernoIAContrato';
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
    expect(OPERACIONES_IA).toHaveLength(12);
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

  it('todas las importaciones relativas de ejecución del grafo de api/index.ts llevan extensión .js (requerido por ESM nativo en Vercel)', async () => {
    const ts = await import('typescript');
    const { dirname } = await import('node:path');
    const cfg = ts.readConfigFile(join(RAIZ, 'tsconfig.json'), ts.sys.readFile).config;
    const visitados = new Set<string>();
    const sinExtension: string[] = [];

    function recorrer(rutaAbs: string): void {
      if (visitados.has(rutaAbs)) return;
      visitados.add(rutaAbs);
      const codigo = readFileSync(rutaAbs, 'utf8');
      const js = ts.transpileModule(codigo, { compilerOptions: cfg.compilerOptions, fileName: rutaAbs }).outputText;
      const re = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(js))) {
        const especificador = m[1];
        if (!especificador.endsWith('.js')) {
          sinExtension.push(`${relative(RAIZ, rutaAbs)} -> ${especificador}`);
        }
        const base = resolve(dirname(rutaAbs), especificador.replace(/\.js$/, ''));
        for (const cand of [`${base}.ts`, `${base}.tsx`]) {
          try {
            if (statSync(cand).isFile()) {
              recorrer(cand);
              break;
            }
          } catch {
            // sigue buscando
          }
        }
      }
    }

    recorrer(join(RAIZ, 'api/index.ts'));
    expect(visitados.size).toBeGreaterThanOrEqual(15);
    expect(sinExtension).toEqual([]);
  });
});

describe('B · app REAL de server.ts: sin credencial bloquea antes de autenticar', () => {
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
    it(`${ruta} (${id}) → 503 antes de autenticar cuando falta la credencial de producción`, async () => {
      const cuerpo = JSON.stringify({ prompt: 'x', input: 'ir a tesorería', capabilities: [], uid: 'uid-suplantado' });
      const sinToken = await fetch(`${base}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'clave-0001-aaaa' }, body: cuerpo });
      expect(sinToken.status).toBe(503);
      expect(await sinToken.json()).toMatchObject({ codigo: 'FIREBASE_CREDENCIAL_AUSENTE' });
      // La configuración incompleta bloquea antes de verificar cualquier token.
      for (const token of ['abc', 'a.b.c']) {
        const invalido = await fetch(`${base}${ruta}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': 'clave-0001-aaaa' },
          body: cuerpo,
        });
        expect(invalido.status, token).toBe(503);
        expect(invalido.headers.get('x-ia-operacion-id')).toBeNull();
      }
    });
  }

  it('/api/health expone el estado del núcleo (modo de registro y nº de operaciones) sin secretos', async () => {
    const r = await fetch(`${base}/api/health`);
    expect(r.status).toBe(200);
    const salud = await r.json();
    expect(salud.ia).toEqual({ registro: 'NO_CONFIGURADO', gobierno: 'NO_CONFIGURADO', llaves: 'NO_CONFIGURADO', autenticacion: 'TOKEN_FIREBASE', operaciones: 12, errorConfiguracion: 'FIREBASE_CREDENCIAL_AUSENTE' });
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

  it('sin credencial: producción bloqueada; solo desarrollo explícito permite MEMORIA', () => {
    const prod = resolverConfiguracionIA({ VERCEL: '1' }, null);
    expect(prod).toEqual({ proyectoId: aplicacion.projectId, baseDatosId: aplicacion.firestoreDatabaseId, produccion: true, modoRegistro: 'NO_CONFIGURADO', errorConfiguracion: 'FIREBASE_CREDENCIAL_AUSENTE' });
    expect(resolverConfiguracionIA({ NODE_ENV: 'production' }, null).modoRegistro).toBe('NO_CONFIGURADO');
    expect(resolverConfiguracionIA({ NODE_ENV: 'development' }, null).modoRegistro).toBe('MEMORIA');
  });

  it('con credencial: registro FIRESTORE canónico; overrides contradictorios bloquean', () => {
    const deps = crearDependenciasNucleoIA({ VERCEL: '1', FIREBASE_SERVICE_ACCOUNT: cuentaJson });
    expect(deps.registro?.tipo).toBe('FIRESTORE');
    expect(deps.configuracion).toMatchObject({ modoRegistro: 'FIRESTORE', baseDatosId: aplicacion.firestoreDatabaseId, proyectoId: aplicacion.projectId });
    const otra = resolverConfiguracionIA({ FIREBASE_PROJECT_ID: 'otro-proyecto', FIRESTORE_DATABASE_ID: 'otra-bd' }, null);
    expect(otra).toMatchObject({ proyectoId: null, baseDatosId: null, errorConfiguracion: 'FIREBASE_OVERRIDE_INCOMPATIBLE' });
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

describe('D · arranque ESM nativo de Vercel (api/index.ts) y matriz funcional de los 12 endpoints reales', () => {
  const aplicacion = JSON.parse(readFileSync(join(RAIZ, 'firebase-applet-config.json'), 'utf8')) as {
    projectId: string;
    firestoreDatabaseId: string;
  };
  const parUsuario = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const parOtro = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const parCuenta = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const KID = 'kid-fase1-verificacion';
  const publicPemUsuario = parUsuario.publicKey.export({ type: 'spki', format: 'pem' }).toString();

  function b64url(entrada: Buffer | string): string {
    const buf = typeof entrada === 'string' ? Buffer.from(entrada, 'utf8') : entrada;
    return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function firmarToken(
    claims: Record<string, unknown>,
    opciones: { kid?: string; alg?: string; clavePrivada?: ReturnType<typeof generateKeyPairSync>['privateKey'] } = {},
  ): string {
    const { createSign } = require('node:crypto') as typeof import('node:crypto');
    const ahora = Math.floor(Date.now() / 1000);
    const header = { alg: opciones.alg ?? 'RS256', typ: 'JWT', kid: opciones.kid ?? KID };
    const payload = {
      iss: `https://securetoken.google.com/${aplicacion.projectId}`,
      aud: aplicacion.projectId,
      sub: 'uid-ana',
      email: 'ana.privado@example.com',
      iat: ahora - 30,
      exp: ahora + 3600,
      ...claims,
    };
    const firmable = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    if (header.alg === 'none') return `${firmable}.`;
    const clave = opciones.clavePrivada ?? parUsuario.privateKey;
    const firma = createSign('RSA-SHA256').update(firmable).sign(clave);
    return `${firmable}.${b64url(firma)}`;
  }

  const documentosFirestore = new Map<string, { fields: Record<string, unknown>; updateTime?: string }>();
    let relojDocumentos = 0;
    const updateTimeNuevo = () => `2026-10-15T10:00:${String(++relojDocumentos).padStart(2, '0')}.000000Z`;
  let falloFirestoreRest = false;
  let tmpDir = '';
  let servidorVercel: Server;
  let baseVercel = '';
  const fetchReal = globalThis.fetch;
  const VARIABLES = [
    'VERCEL',
    'FIREBASE_SERVICE_ACCOUNT',
    'FIREBASE_SERVICE_ACCOUNT_B64',
    'FIREBASE_SERVICE_ACCOUNT_PATH',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GEMINI_API_KEY',
    'IA_POLITICA_JSON',
  ] as const;
  const previas: Record<string, string | undefined> = {};

  beforeAll(async () => {
    const ts = await import('typescript');
    const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { dirname } = await import('node:path');
    const { createServer } = await import('node:http');
    const { pathToFileURL } = await import('node:url');
    const { reiniciarCacheCertificados, reiniciarCacheTokens } = await import('../server/titularidades/googleBackend');

    for (const v of VARIABLES) previas[v] = process.env[v];
    process.env.VERCEL = '1';
    delete process.env.GEMINI_API_KEY;
    // FASE 7 · política APROBADA y COMPLETA: los cuatro perfiles declarados con
    // las 12 operaciones (explícitas, sin comodines), la tarifa de las 12 (coste 1
    // sólo en ESTIMAR_PRICING, como antes; el resto coste 0 declarado) y cuotas
    // finitas holgadas para que la matriz (≈5 llamadas por operación y usuario) no
    // choque con ellas. Sin política completa el bloqueo preventivo rechazaría todo.
    process.env.IA_POLITICA_JSON = JSON.stringify(
      construirPoliticaIACompleta({
        permisos: {
          PROPIETARIO: OPERACIONES_IA_IDS,
          PROFESIONAL: OPERACIONES_IA_IDS,
          INQUILINO: OPERACIONES_IA_IDS,
          ADMINISTRADOR: OPERACIONES_IA_IDS,
        },
        costeCreditosPorOperacion: Object.fromEntries(
          OPERACIONES_IA_IDS.map((id) => [id, id === 'ESTIMAR_PRICING' ? 1 : 0]),
        ),
        cuotas: { operacionesPorDia: 500, operacionesPorMes: 5000 },
      }),
    );
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: aplicacion.projectId,
      client_email: `sa@${aplicacion.projectId}.iam.gserviceaccount.com`,
      private_key: parCuenta.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    });

    reiniciarCacheCertificados();
    reiniciarCacheTokens();

    // Intercepta únicamente las llamadas salientes a Google (certificados, OAuth2, Firestore REST)
    // y deja pasar las llamadas locales al servidor HTTP de pruebas.
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ [KID]: publicPemUsuario }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'oauth2-test-token', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('firestore.googleapis.com/v1/')) {
        if (falloFirestoreRest) {
          return new Response(JSON.stringify({ error: { message: 'Firestore unavailable' } }), { status: 503 });
        }
        const u = new URL(url);
        const metodo = (init?.method || 'GET').toUpperCase();
        // Mini-Firestore genérico (Fase 2): documentos REST-codificados en `documentosFirestore`
        // con `updateTime` monotónico; POST ?documentId= atómico; PATCH con precondición CAS
        // `currentDocument.updateTime` (409 ABORTED) o `currentDocument.exists` (Fase 1).
        const mDocumento = /\/documents\/([^/?]+)\/([^/?]+)$/.exec(u.pathname);
        const mColeccion = /\/documents\/([^/?]+)$/.exec(u.pathname);
        // POST .../documents/<coleccion>?documentId=<id>
        if (metodo === 'POST' && mColeccion && u.searchParams.has('documentId')) {
          const clave = `${mColeccion[1]}/${decodeURIComponent(u.searchParams.get('documentId') || '')}`;
          if (documentosFirestore.has(clave)) {
            return new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 409 });
          }
          const body = JSON.parse(String(init?.body || '{}')) as { fields?: Record<string, unknown> };
          const updateTime = updateTimeNuevo();
          documentosFirestore.set(clave, { fields: { ...(body.fields || {}) }, updateTime });
          return new Response(JSON.stringify({ name: clave, fields: body.fields || {}, updateTime }), { status: 200 });
        }
        // PATCH .../documents/<coleccion>/<id>
        if (metodo === 'PATCH' && mDocumento) {
          const clave = decodeURIComponent(mDocumento[0].split('/documents/')[1]);
          const actual = documentosFirestore.get(clave);
          if (!actual) {
            return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
          }
          const casEsperado = u.searchParams.get('currentDocument.updateTime');
          if (casEsperado && casEsperado !== actual.updateTime) {
            return new Response(JSON.stringify({ error: { code: 409, status: 'ABORTED' } }), { status: 409 });
          }
          const body = JSON.parse(String(init?.body || '{}')) as { fields?: Record<string, unknown> };
          const mascaras = u.searchParams.getAll('updateMask.fieldPaths');
          const nuevos = body.fields || {};
          for (const campo of mascaras) {
            if (campo in nuevos) actual.fields[campo] = nuevos[campo];
          }
          actual.updateTime = updateTimeNuevo();
          return new Response(JSON.stringify({ name: clave, fields: actual.fields, updateTime: actual.updateTime }), { status: 200 });
        }
        // GET .../documents/<coleccion>/<id>
        if (metodo === 'GET' && mDocumento) {
          const clave = decodeURIComponent(mDocumento[0].split('/documents/')[1]);
          const actual = documentosFirestore.get(clave);
          if (!actual) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
          return new Response(JSON.stringify({ name: clave, fields: actual.fields, updateTime: actual.updateTime }), { status: 200 });
        }
      }
      return fetchReal(input, init);
    }) as typeof fetch;

    // FASE 2 · espejos de identidad veraces de los usuarios de prueba (uid-ana, uid-luis),
    // tal como los mantiene la sincronización `usuarios_auth` ↔ `usuarios`.
    const { codificarValor } = await import('../server/titularidades/googleBackend');
    const campos = (datos: Record<string, unknown>) =>
      (codificarValor(datos) as { mapValue: { fields: Record<string, unknown> } }).mapValue.fields;
    const sembrarVeraz = (uid: string, usuarioId: string, tipoPerfil: string, extra: Record<string, unknown> = {}) => {
      documentosFirestore.set(`usuarios_auth/${uid}`, { fields: campos({ usuarioId, estado: 'ACTIVO', tipoPerfil }) });
      documentosFirestore.set(`usuarios/${usuarioId}`, { fields: campos({ authUid: uid, estado: 'ACTIVO', tipoPerfil, ...extra }) });
    };
    sembrarVeraz('uid-ana', 'usuario-ana', 'PROPIETARIO');
    sembrarVeraz('uid-luis', 'usuario-luis', 'PROPIETARIO');
    // FASE 5 · dos inquilinos con contrato propio y autorizado: el asistente de
    // incidencias exige perfil INQUILINO y resuelve el alcance SÓLO desde estas
    // fuentes (los contratos del cuerpo de la petición se ignoran).
    sembrarVeraz('uid-ines', 'usuario-ines', 'INQUILINO', { contratoIds: ['contrato-ines'] });
    sembrarVeraz('uid-marta', 'usuario-marta', 'INQUILINO', { contratoIds: ['contrato-marta'] });
    const sembrarContratoInquilino = (contratoId: string, inmuebleId: string, propietarioId: string) => {
      documentosFirestore.set(`contratos_formalizacion/${contratoId}`, {
        fields: campos({
          id: contratoId,
          inquilinoId: `usuario-${contratoId.split('-')[1]}`,
          inmuebleId,
          propietarioId,
          estado: 'ACTIVO',
          esVigente: true,
          fechaInicioContrato: '2026-01-01',
          suministrosCargo: 'arrendatario',
          gastosComunidadCargo: 'arrendador',
          ibiCargo: 'arrendador',
          permitirMascotas: true,
        }),
      });
      documentosFirestore.set(`inmuebles/${inmuebleId}`, { fields: campos({ id: inmuebleId, direccion: 'Calle Mayor 1', ciudad: 'Madrid' }) });
      documentosFirestore.set(`propietarios/${propietarioId}`, { fields: campos({ id: propietarioId, nombre: 'Propietaria Uno' }) });
    };
    sembrarContratoInquilino('contrato-ines', 'inmueble-ines', 'propietario-ines');
    sembrarContratoInquilino('contrato-marta', 'inmueble-marta', 'propietario-marta');
    // FASE 2 · cuentas de créditos con saldo para la matriz (la política aprobada
    // fija coste 1 en ESTIMAR_PRICING; el resto de operaciones son coste 0).
    const hoy = new Date();
    const sembrarCuenta = (uid: string, saldo: number) => {
      documentosFirestore.set(`ia_cuentas/${uid}`, {
        updateTime: updateTimeNuevo(), // el CAS de la reserva exige updateTime en el documento
        fields: campos({
          version: 1,
          saldoCreditos: saldo,
          bloqueada: false,
          ventanaDiaClave: hoy.toISOString().slice(0, 10),
          ventanaDiaUsos: 0,
          ventanaMesClave: hoy.toISOString().slice(0, 7),
          ventanaMesUsos: 0,
          totalOperaciones: 0,
          totalCreditosConsumidos: 0,
          actualizadoEn: hoy.toISOString(),
        }),
      });
    };
    sembrarCuenta('uid-ana', 100);
    sembrarCuenta('uid-luis', 100);
    sembrarCuenta('uid-ines', 100);
    sembrarCuenta('uid-marta', 100);

    // Compila cada fichero TS de servidor a ESM suelto (sin bundler), igual que @vercel/node
    const cfg = ts.readConfigFile(join(RAIZ, 'tsconfig.json'), ts.sys.readFile).config;
    tmpDir = mkdtempSync(join(tmpdir(), 'vercel-esm-fase1-'));
    writeFileSync(join(tmpDir, 'package.json'), readFileSync(join(RAIZ, 'package.json')));
    writeFileSync(join(tmpDir, 'firebase-applet-config.json'), readFileSync(join(RAIZ, 'firebase-applet-config.json')));
    symlinkSync(join(RAIZ, 'node_modules'), join(tmpDir, 'node_modules'));

    const archivosServidor = [
      'api/index.ts',
      'server.ts',
      'src/notificaciones/dispatcher.ts',
      'src/notificaciones/resolucion.ts',
      'src/notificaciones/plantillas.ts',
      'src/notificaciones/canales.ts',
      'src/notificaciones/autorizacion.ts',
      'src/types/notificaciones.ts',
      'src/lib/documentosServidor.ts',
      'src/experiencia/proveedorGemini.ts',
      'src/experiencia/limites.ts',
      'src/experiencia/tipos.ts',
      'src/types.ts',
      'server/titularidades/manejadorBuscarTitulares.ts',
      'server/titularidades/backendTitulares.ts',
      'server/titularidades/configuracionFirebase.ts',
      'server/titularidades/googleBackend.ts',
      'src/titularidades/busquedaTitulares.ts',
      'server/ia/nucleoIA.ts',
      'server/ia/configuracionIA.ts',
      'server/ia/registroOperacionesIA.ts',
      'server/ia/gobiernoIA.ts',
      'server/ia/adminIA.ts',
      'src/ia/catalogoOperacionesIA.ts',
      'src/ia/gobiernoIAContrato.ts',
      // FASE 5 · asistente de incidencias del inquilino (motor + servidor).
      'src/ia/asistenteIncidenciasIA.ts',
      'server/ia/asistenteIncidenciasInquilino.ts',
      // FASE 6 · seguimiento de incidencias y notificaciones duraderas.
      'src/seguimiento/incidencias.ts',
      'server/seguimiento/seguimientoIncidencias.ts',
      'server/seguimiento/notificadorIncidencias.ts',
      'server/seguimiento/rutasSeguimientoIncidencias.ts',
      'server/notificaciones/repositorioNotificacionesFirestore.ts',
      // FASE A · avisos reales: transporte de correo, perfil veraz, reloj y cron.
      'server/notificaciones/proveedoresEmail.ts',
      'server/notificaciones/proveedorSmtp.ts',
      'server/notificaciones/perfilUsuarioFirestore.ts',
      'server/notificaciones/relojAvisos.ts',
      'server/notificaciones/rutasCronAvisos.ts',
      'server/notificaciones/rutaPruebaSmtp.ts',
      'src/utils/cobrosEngine.ts',
      // FASE 9 · llaves de usuario (Vía 2): contrato + tutorial puros, cifrado, servicio y rutas.
      'src/ia/llavesUsuarioContrato.ts',
      'src/ia/tutorialLlaveUsuarioIA.ts',
      'server/ia/cifradoLlavesIA.ts',
      'server/ia/llavesUsuarioIA.ts',
      'server/ia/rutasLlavesIA.ts',
    ];

    for (const rel of archivosServidor) {
      const codigo = readFileSync(join(RAIZ, rel), 'utf8');
      const js = ts.transpileModule(codigo, { compilerOptions: cfg.compilerOptions, fileName: rel }).outputText;
      const destino = join(tmpDir, rel.replace(/\.tsx?$/, '.js'));
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, js);
    }

    // El runtime de prueba debe llevar la misma configuración explícita que el ERP.
    writeFileSync(join(tmpDir, 'firebase-applet-config.json'), readFileSync(join(RAIZ, 'firebase-applet-config.json')));
    const moduloApi = (await import(pathToFileURL(join(tmpDir, 'api/index.js')).href)) as {
      default: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => unknown;
    };
    servidorVercel = createServer((req, res) => {
      moduloApi.default(req, res);
    }).listen(0, '127.0.0.1');
    await once(servidorVercel, 'listening');
    baseVercel = `http://127.0.0.1:${(servidorVercel.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    globalThis.fetch = fetchReal;
    await new Promise<void>((r) => (servidorVercel ? servidorVercel.close(() => r()) : r()));
    if (tmpDir) {
      const { rmSync } = await import('node:fs');
      rmSync(tmpDir, { recursive: true, force: true });
    }
    for (const v of VARIABLES) {
      if (previas[v] === undefined) delete process.env[v];
      else process.env[v] = previas[v];
    }
  });

  const CUERPOS_VALIDOS: Record<string, Record<string, unknown>> = {
    ANALIZAR_DOCUMENTO: {
      documentBase64: Buffer.from('Nomina privada 2100 EUR secreto-doc').toString('base64'),
      mimeType: 'application/pdf',
      filename: 'nomina-secreta.pdf',
      tipoHint: 'nomina',
      candidatoManualData: { nombre: 'Secreto Candidato', ingresosNetos: 2100 },
    },
    GENERAR_CORREO_ASEGURADORA: {
      solicitudSeguro: {
        referenciaUnica: 'REF-SECRETA-01',
        inmuebleNombre: 'Piso Secreto',
        inmuebleDireccion: 'Calle Privada 99',
        rentaMensual: 950,
        ratioEsfuerzoCalculado: 30,
        numeroCandidatoInmueble: 1,
        titular1: { nombre: 'Secreto Candidato', ingresosNetosMensuales: 2800 },
      },
      aseguradora: { nombre: 'Arag' },
    },
    ANALIZAR_RESPUESTA_ASEGURADORA: {
      emailTexto: 'Texto secreto aseguradora: operación aprobada favorable.',
      emailAsunto: 'Re: [REF-SECRETA-01]',
      aseguradoraNombre: 'Arag',
      rentaMensual: 950,
    },
    ASISTENTE_INTERPRETAR: {
      input: 'Prompt secreto del asistente para ir a inmuebles',
      host: 'ERP',
      capabilities: [{ id: 'nav.inmuebles', title: 'Inmuebles', kind: 'NAVIGATION' }],
    },
    ANALIZAR_CUESTIONARIO: {
      candidatoNombre: 'Secreto Candidato',
      respuestas: [
        {
          preguntaId: 1,
          preguntaTitulo: 'Fuga de agua',
          opcionSeleccionadaId: 'A',
          opcionSeleccionadaTexto: 'Cerrar llave de paso y avisar',
          esAbierta: false,
        },
      ],
      informacionAdicional: 'Texto libre secreto del cuestionario',
    },
    REDACTAR_CLAUSULA: {
      promptUsuario: 'Prompt secreto redactar cláusula sobre mascotas en Calle Privada 99',
      tipoInmueble: 'Vivienda habitual',
      renta: 950,
    },
    ANALIZAR_INSPECCION: {
      fotos: [
        {
          id: 'foto-secreta-1',
          estancia: 'cocina',
          imageBase64: Buffer.from('imagen-secreta-binaria').toString('base64'),
          mimeType: 'image/jpeg',
        },
      ],
      contexto: { direccion: 'Calle Privada 99', destino: 'Alquiler' },
    },
    PROPONER_MEJORAS: {
      rentaAnterior: 850,
      destino: 'Alquiler tradicional',
      ciudad: 'Madrid',
      codigoPostal: '28001',
      fotos: [{ estancia: 'cocina', observaciones: ['Observación secreta pintura'], sugerenciasMejora: ['Pintar'] }],
      sugerencias: ['Sugerencia secreta reforma'],
    },
    ESTIMAR_PRICING: {
      ciudad: 'Madrid',
      codigoPostal: '28001',
      superficie: 75,
      habitaciones: 2,
      banos: 1,
      tipoInmueble: 'Piso',
      destino: 'Alquiler tradicional',
      rentaAnterior: 850,
      base: { escenarioConservador: 880, escenarioRecomendado: 920, escenarioMaximo: 960, precioM2Alquiler: 12.2 },
    },
    GENERAR_KIT_PUBLICACION: {
      tipoInmueble: 'Piso',
      ciudad: 'Madrid',
      codigoPostal: '28001',
      superficie: 75,
      habitaciones: 2,
      banos: 1,
      destino: 'Alquiler tradicional',
      precioRecomendado: 920,
      mejoras: ['Pintura neutra'],
      hechosAdicionales: ['Hecho secreto terraza privada'],
    },
    ASISTENTE_INCIDENCIAS_INQUILINO: {
      contratoId: 'contrato-ines',
      descripcion: 'Gotea la tubería bajo el lavabo del baño desde ayer por la tarde.',
    },
    ANALIZAR_INCIDENCIA: {
      incidencia: {
        titulo: 'Incidencia secreta fontanería',
        descripcion: 'Fuga secreta en baño principal de Calle Privada 99',
        categoria: 'FONTANERIA',
        prioridad: 'ALTA',
        inmuebleDireccion: 'Calle Privada 99',
      },
      polizas: [{ aseguradora: 'Mapfre', tipo: 'Hogar', coberturas: ['Daños por agua'] }],
    },
  };

  it('api/index.ts arranca en un proceso Node ESM nativo real (sin el resolvedor de Vite/Vitest) y /api/health informa registro FIRESTORE', async () => {
    const { execFileSync } = await import('node:child_process');
    const { pathToFileURL } = await import('node:url');
    const urlModulo = pathToFileURL(join(tmpDir, 'api/index.js')).href;
    const salida = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        [
          `import { createServer } from 'node:http';`,
          `const mod = await import(${JSON.stringify(urlModulo)});`,
          `if (typeof mod.default !== 'function') process.exit(1);`,
          `const srv = createServer((req, res) => mod.default(req, res)).listen(0, '127.0.0.1');`,
          `await new Promise((r) => srv.once('listening', r));`,
          `const port = srv.address().port;`,
          `const rSalud = await fetch('http://127.0.0.1:' + port + '/api/health');`,
          `const jSalud = await rSalud.json();`,
          `const rIa = await fetch('http://127.0.0.1:' + port + '/api/redactar-clausula', { method: 'POST' });`,
          `srv.close();`,
          `console.log(JSON.stringify({ ok: rSalud.status === 200 && rIa.status === 401, ia: jSalud.ia }));`,
        ].join(' '),
      ],
      { cwd: tmpDir, env: { ...process.env, VERCEL: '1' }, encoding: 'utf8' },
    );
    expect(salida).toContain('"ok":true');
    expect(salida).toContain('"registro":"FIRESTORE"');

    const r = await fetchReal(`${baseVercel}/api/health`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({
      status: 'ok',
      geminiKeyConfigured: false,
      // FASE 9 · sin IA_LLAVES_CLAVE_MAESTRA el subsistema de llaves de usuario queda NO_CONFIGURADO.
      ia: { registro: 'FIRESTORE', gobierno: 'FIRESTORE', llaves: 'NO_CONFIGURADO', autenticacion: 'TOKEN_FIREBASE', operaciones: 12 },
      // FASE A · sin proveedor de correo ni CRON_SECRET el canal queda en modo
      // seguro y el reloj cerrado; el health lo publica sin secretos.
      notificaciones: { email: { modo: 'MODO_SEGURO', proveedor: null }, cron: { configurado: false } },
    });
  });

  /**
   * FASE 5 · Identidad de cada operación en la matriz. Por defecto Ana (perfil
   * PROPIETARIO); el asistente de incidencias del inquilino exige perfil
   * INQUILINO, así que trabaja con Inés (y con Marta en el caso de aislamiento
   * entre usuarios). El resto de la matriz (9 casos) es idéntico para todas.
   */
  const IDENTIDADES_MATRIZ: Record<
    string,
    { uid: string; email: string; uidPar: string; emailPar: string; cuerpoPar?: Record<string, unknown> }
  > = {
    ASISTENTE_INCIDENCIAS_INQUILINO: {
      uid: 'uid-ines',
      email: 'ines.privado@example.com',
      uidPar: 'uid-marta',
      emailPar: 'marta.privado@example.com',
      // El alcance del asistente es por contrato autorizado: el par necesita el SUYO.
      cuerpoPar: { contratoId: 'contrato-marta' },
    },
  };
  const identidadDeLaOperacion = (id: string) =>
    IDENTIDADES_MATRIZ[id] ?? {
      uid: 'uid-ana',
      email: 'ana.privado@example.com',
      uidPar: 'uid-luis',
      emailPar: 'luis.privado@example.com',
    };

  for (const { id, ruta } of OPERACIONES_IA) {
    it(`${ruta} (${id}) cumple los 9 casos funcionales y concurrencia sobre la app real`, async () => {
      const { decodificarCampos } = await import('../server/titularidades/googleBackend');
      const { CAMPOS_REGISTRO_IA } = await import('../server/ia/registroOperacionesIA');
      const identidad = identidadDeLaOperacion(id);
      const cuerpoBase = {
        ...CUERPOS_VALIDOS[id],
        uid: 'uid-atacante-body',
        usuarioId: 'uid-atacante-body',
        propietarioId: 'prop-atacante-body',
      };
      const claveBase = `key-${id.toLowerCase().replace(/_/g, '-')}`;

      // 1) Sin token válido -> 401 y no registra nada
      const tamAntes = documentosFirestore.size;
      const rSinToken = await fetchReal(`${baseVercel}${ruta}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `${claveBase}-sin-token` },
        body: JSON.stringify(cuerpoBase),
      });
      expect(rSinToken.status).toBe(401);
      expect(await rSinToken.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
      expect(documentosFirestore.size).toBe(tamAntes);

      // 2) Con token inválido o manipulado (firma otra clave, payload alterado, caducado, otro proyecto, alg none) -> 401
      const tokenValidoAna = firmarToken({ sub: identidad.uid, email: identidad.email });
      const [h, p, s] = tokenValidoAna.split('.');
      const payloadManipulado = b64url(
        JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString('utf8')), sub: 'uid-admin' }),
      );
      const tokensInvalidos = [
        firmarToken({ sub: 'uid-ana' }, { clavePrivada: parOtro.privateKey }),
        `${h}.${payloadManipulado}.${s}`,
        firmarToken({ sub: 'uid-ana', exp: Math.floor(Date.now() / 1000) - 60 }),
        firmarToken({ sub: 'uid-ana', aud: 'otro-proyecto-distinto' }),
        firmarToken({ sub: 'uid-ana' }, { alg: 'none' }),
      ];
      for (const tok of tokensInvalidos) {
        const rInv = await fetchReal(`${baseVercel}${ruta}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tok}`,
            'Idempotency-Key': `${claveBase}-tok-inv`,
          },
          body: JSON.stringify(cuerpoBase),
        });
        expect(rInv.status).toBe(401);
        expect(await rInv.json()).toMatchObject({ codigo: 'NO_AUTENTICADO' });
      }
      expect(documentosFirestore.size).toBe(tamAntes);

      // 3, 4, 8, 9) Token válido: uid sale siempre del token (nunca del body), pasa por el núcleo,
      // registra COMPLETADA en Firestore y no guarda datos sensibles.
      const claveOk = `${claveBase}-ok-ana-01`;
      const rOk = await fetchReal(`${baseVercel}${ruta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenValidoAna}`,
          'Idempotency-Key': claveOk,
        },
        body: JSON.stringify(cuerpoBase),
      });
      expect(rOk.status).toBe(200);
      const opIdAna = rOk.headers.get('x-ia-operacion-id');
      expect(opIdAna).toMatch(/^iaop_[0-9a-f]{40}$/);
      const docGuardado = documentosFirestore.get(`ia_operaciones/${opIdAna}`);
      expect(docGuardado).toBeDefined();
      const datosReg = decodificarCampos((docGuardado?.fields || {}) as never);
      expect(datosReg).toMatchObject({
        id: opIdAna,
        uid: identidad.uid,
        operacion: id,
        ruta,
        estado: 'COMPLETADA',
        codigoHttp: 200,
        origenRespuesta: 'RESPALDO',
        llamadasProveedor: 0,
      });
      expect(datosReg.uid).not.toBe('uid-atacante-body');
      // 8) Privacidad del registro: sólo campos permitidos y ningún dato sensible
      for (const k of Object.keys(datosReg)) {
        expect(CAMPOS_REGISTRO_IA).toContain(k);
      }
      const serializado = JSON.stringify(docGuardado);
      expect(serializado).not.toMatch(
        /Secreto|secreta|secreto|Calle Privada|ana\.privado@example\.com|uid-atacante-body|Bearer/i,
      );
      expect(serializado).not.toContain(claveOk);

      // 6) Idempotencia por usuario (secuencial): misma clave + mismo usuario -> 409 sin re-ejecutar
      const rDup = await fetchReal(`${baseVercel}${ruta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenValidoAna}`,
          'Idempotency-Key': claveOk,
        },
        body: JSON.stringify(cuerpoBase),
      });
      expect(rDup.status).toBe(409);
      expect(await rDup.json()).toMatchObject({
        codigo: 'OPERACION_DUPLICADA',
        operacionId: opIdAna,
      });

      // 6b) Idempotencia concurrente: 4 peticiones simultáneas con misma clave y mismo usuario -> 1x 200 y 3x 409
      const claveConc = `${claveBase}-conc-01`;
      const respuestasConc = await Promise.all(
        [1, 2, 3, 4].map(() =>
          fetchReal(`${baseVercel}${ruta}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokenValidoAna}`,
              'Idempotency-Key': claveConc,
            },
            body: JSON.stringify(cuerpoBase),
          }),
        ),
      );
      const codigosConc = respuestasConc.map((r) => r.status).sort();
      expect(codigosConc).toEqual([200, 409, 409, 409]);

      // 7) Aislamiento entre usuarios: misma clave de idempotencia con otro usuario -> 200 e id distinto
      const tokenLuis = firmarToken({ sub: identidad.uidPar, email: identidad.emailPar });
      const cuerpoPar = { ...cuerpoBase, ...(identidad.cuerpoPar ?? {}) };
      if (identidad.cuerpoPar) {
        // El cuerpo del otro usuario no autoriza nada: si apunta a un contrato que
        // no es suyo, se rechaza (403) y NO se ejecuta ni se registra operación.
        const tamAjeno = documentosFirestore.size;
        const rAjeno = await fetchReal(`${baseVercel}${ruta}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenLuis}`,
            'Idempotency-Key': `${claveBase}-ajeno-01`,
          },
          body: JSON.stringify(cuerpoBase),
        });
        expect(rAjeno.status).toBe(403);
        expect(await rAjeno.json()).toMatchObject({ codigo: 'CONTRATO_NO_AUTORIZADO' });
        // El intento SÍ queda trazado por el núcleo (FALLIDA, 403) pero NO genera
        // traza de incidencia: la operación no llegó a analizar nada.
        const opIdAjeno = rAjeno.headers.get('x-ia-operacion-id') ?? '';
        expect(opIdAjeno).toMatch(/^iaop_[0-9a-f]{40}$/);
        expect(documentosFirestore.has(`ia_incidencias_trazas/${opIdAjeno}`)).toBe(false);
        expect(documentosFirestore.size).toBe(tamAjeno + 1);
      }
      const rLuis = await fetchReal(`${baseVercel}${ruta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenLuis}`,
          'Idempotency-Key': claveOk,
        },
        body: JSON.stringify(cuerpoPar),
      });
      expect(rLuis.status).toBe(200);
      const opIdLuis = rLuis.headers.get('x-ia-operacion-id');
      expect(opIdLuis).toMatch(/^iaop_[0-9a-f]{40}$/);
      expect(opIdLuis).not.toBe(opIdAna);
      const datosLuis = decodificarCampos((documentosFirestore.get(`ia_operaciones/${opIdLuis}`)?.fields || {}) as never);
      expect(datosLuis).toMatchObject({ id: opIdLuis, uid: identidad.uidPar, operacion: id, estado: 'COMPLETADA' });

      // 5) Fallo de registro obligatorio -> 503 REGISTRO_NO_DISPONIBLE y no ejecuta la operación
      falloFirestoreRest = true;
      try {
        const rFalloReg = await fetchReal(`${baseVercel}${ruta}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenValidoAna}`,
            'Idempotency-Key': `${claveBase}-fallo-503`,
          },
          body: JSON.stringify(cuerpoBase),
        });
        expect(rFalloReg.status).toBe(503);
        // FASE 2 · con Firestore caído, la PRIMERA puerta en fallar es el gobierno de uso
        // (perfilVeraz precede al registro): sigue siendo fallo cerrado 503 y no se ejecuta.
        expect(await rFalloReg.json()).toMatchObject({ codigo: 'GOBIERNO_NO_DISPONIBLE' });
      } finally {
        falloFirestoreRest = false;
      }

      // 9) Coherencia de errores: sin Idempotency-Key -> 400 IDEMPOTENCIA_REQUERIDA
      const rSinClave = await fetchReal(`${baseVercel}${ruta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenValidoAna}`,
        },
        body: JSON.stringify(cuerpoBase),
      });
      expect(rSinClave.status).toBe(400);
      expect(await rSinClave.json()).toMatchObject({ codigo: 'IDEMPOTENCIA_REQUERIDA' });
    });
  }
});

