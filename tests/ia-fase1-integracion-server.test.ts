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

describe('D · arranque ESM nativo de Vercel (api/index.ts) y matriz funcional de los 11 endpoints reales', () => {
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

  const documentosFirestore = new Map<string, { fields: Record<string, unknown> }>();
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
        // POST .../documents/ia_operaciones?documentId=...
        if (metodo === 'POST' && u.pathname.endsWith('/documents/ia_operaciones')) {
          const docId = u.searchParams.get('documentId') || '';
          const clave = `ia_operaciones/${docId}`;
          if (documentosFirestore.has(clave)) {
            return new Response(JSON.stringify({ error: { status: 'ALREADY_EXISTS' } }), { status: 409 });
          }
          const body = JSON.parse(String(init?.body || '{}')) as { fields?: Record<string, unknown> };
          documentosFirestore.set(clave, { fields: { ...(body.fields || {}) } });
          return new Response(JSON.stringify({ name: clave, fields: body.fields || {} }), { status: 200 });
        }
        // PATCH .../documents/ia_operaciones/<id>
        const mPatch = /\/documents\/(ia_operaciones\/[^/?]+)$/.exec(u.pathname);
        if (metodo === 'PATCH' && mPatch) {
          const clave = decodeURIComponent(mPatch[1]);
          const actual = documentosFirestore.get(clave);
          if (!actual) {
            return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
          }
          const body = JSON.parse(String(init?.body || '{}')) as { fields?: Record<string, unknown> };
          const mascaras = u.searchParams.getAll('updateMask.fieldPaths');
          const nuevos = body.fields || {};
          for (const campo of mascaras) {
            if (campo in nuevos) actual.fields[campo] = nuevos[campo];
          }
          return new Response(JSON.stringify({ name: clave, fields: actual.fields }), { status: 200 });
        }
        // GET .../documents/ia_operaciones/<id>
        if (metodo === 'GET' && mPatch) {
          const clave = decodeURIComponent(mPatch[1]);
          const actual = documentosFirestore.get(clave);
          if (!actual) return new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 });
          return new Response(JSON.stringify({ name: clave, fields: actual.fields }), { status: 200 });
        }
      }
      return fetchReal(input, init);
    }) as typeof fetch;

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
      'server/titularidades/googleBackend.ts',
      'src/titularidades/busquedaTitulares.ts',
      'server/ia/nucleoIA.ts',
      'server/ia/configuracionIA.ts',
      'server/ia/registroOperacionesIA.ts',
      'src/ia/catalogoOperacionesIA.ts',
    ];

    for (const rel of archivosServidor) {
      const codigo = readFileSync(join(RAIZ, rel), 'utf8');
      const js = ts.transpileModule(codigo, { compilerOptions: cfg.compilerOptions, fileName: rel }).outputText;
      const destino = join(tmpDir, rel.replace(/\.tsx?$/, '.js'));
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, js);
    }

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
      ia: { registro: 'FIRESTORE', autenticacion: 'TOKEN_FIREBASE', operaciones: 11 },
    });
  });

  for (const { id, ruta } of OPERACIONES_IA) {
    it(`${ruta} (${id}) cumple los 9 casos funcionales y concurrencia sobre la app real`, async () => {
      const { decodificarCampos } = await import('../server/titularidades/googleBackend');
      const { CAMPOS_REGISTRO_IA } = await import('../server/ia/registroOperacionesIA');
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
      const tokenValidoAna = firmarToken({ sub: 'uid-ana', email: 'ana.privado@example.com' });
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
        uid: 'uid-ana',
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

      // 7) Aislamiento entre usuarios: misma clave de idempotencia con otro usuario (uid-luis) -> 200 e id distinto
      const tokenLuis = firmarToken({ sub: 'uid-luis', email: 'luis.privado@example.com' });
      const rLuis = await fetchReal(`${baseVercel}${ruta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenLuis}`,
          'Idempotency-Key': claveOk,
        },
        body: JSON.stringify(cuerpoBase),
      });
      expect(rLuis.status).toBe(200);
      const opIdLuis = rLuis.headers.get('x-ia-operacion-id');
      expect(opIdLuis).toMatch(/^iaop_[0-9a-f]{40}$/);
      expect(opIdLuis).not.toBe(opIdAna);
      const datosLuis = decodificarCampos((documentosFirestore.get(`ia_operaciones/${opIdLuis}`)?.fields || {}) as never);
      expect(datosLuis).toMatchObject({ id: opIdLuis, uid: 'uid-luis', operacion: id, estado: 'COMPLETADA' });

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
        expect(await rFalloReg.json()).toMatchObject({ codigo: 'REGISTRO_NO_DISPONIBLE' });
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

