import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolverDestinoFirebase, resolverAccesoFirebase } from '../server/titularidades/configuracionFirebase';
import * as googleOriginal from '../server/titularidades/googleBackend';
import { crearDependenciasReales } from '../server/titularidades/backendTitulares';
import { crearDependenciasNucleoIA, resolverConfiguracionIA } from '../server/ia/configuracionIA';
import { leerCuentaServicio } from '../server/titularidades/googleBackend';
import { OPERACIONES_IA } from '../src/ia/catalogoOperacionesIA';
import { construirPoliticaIACompleta } from '../src/ia/gobiernoIAContrato';

const config = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const crudoCanonico = JSON.stringify(config);
// Clave efímera de prueba, sin identidad Google; nunca sale a la red.
const privada = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const cuenta = { project_id: config.projectId, client_email: 'prueba@proyecto.invalid', private_key: privada };
const raw = JSON.stringify(cuenta);
const fetchHttp = globalThis.fetch;

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('resolver de destino sin fallback', () => {
  it.each(['null', '[]', '"texto"', '42', '{', '{}', JSON.stringify({ projectId: 3 })])('rechaza estructura/JSON %s', (json) => {
    expect(resolverDestinoFirebase({}, () => json).errorConfiguracion).toBe('FIREBASE_CONFIGURACION_INVALIDA');
  });
  it.each([undefined, null, ''])('bloquea base obligatoria ausente: %s, incluso con override canónico', (base) => {
    const leer = () => JSON.stringify({ projectId: config.projectId, firestoreDatabaseId: base });
    for (const env of [{}, { FIRESTORE_DATABASE_ID: config.firestoreDatabaseId }]) {
      expect(resolverDestinoFirebase(env, leer)).toMatchObject({ baseDatosId: null, errorConfiguracion: 'FIREBASE_BASE_DATOS_AUSENTE' });
    }
  });
  it.each(['(default)', 'otra/base', 3, [], ' base '])('rechaza identificador estructuralmente inválido: %s', (base) => {
    expect(resolverDestinoFirebase({}, () => JSON.stringify({ projectId: config.projectId, firestoreDatabaseId: base })).errorConfiguracion).toBe('FIREBASE_CONFIGURACION_INVALIDA');
  });
  it.each(['ENOENT', 'EACCES', 'EIO'])('identifica error de archivo %s sin inventar un destino', (code) => {
    const resultado = resolverDestinoFirebase({ FIREBASE_PROJECT_ID: config.projectId }, () => { throw Object.assign(new Error('no exponer ruta'), { code }); });
    expect(resultado).toEqual({ proyectoId: null, baseDatosId: null, errorConfiguracion: code === 'ENOENT' ? 'FIREBASE_CONFIGURACION_AUSENTE' : 'FIREBASE_CONFIGURACION_ILEGIBLE' });
  });
  it('acepta únicamente overrides confirmatorios, incluidas sus combinaciones', () => {
    for (const proyecto of [undefined, config.projectId, ` ${config.projectId} `, 'otro-proyecto', '']) {
      for (const base of [undefined, config.firestoreDatabaseId, ` ${config.firestoreDatabaseId} `, 'otra-base', '(default)', '']) {
        const env = { ...(proyecto === undefined ? {} : { FIREBASE_PROJECT_ID: proyecto }), ...(base === undefined ? {} : { FIRESTORE_DATABASE_ID: base }) };
        const permitido = (proyecto === undefined || proyecto.trim() === config.projectId) && (base === undefined || base.trim() === config.firestoreDatabaseId);
        const destino = resolverDestinoFirebase(env, () => crudoCanonico);
        if (permitido) expect(destino).toEqual({ proyectoId: config.projectId, baseDatosId: config.firestoreDatabaseId });
        else expect(destino).toEqual({ proyectoId: null, baseDatosId: null, errorConfiguracion: 'FIREBASE_OVERRIDE_INCOMPATIBLE' });
      }
    }
  });
});

describe('lector real de credenciales', () => {
  it('distingue ausencia de formato inválido, incluido null que antes lanzaba TypeError', () => {
    expect(leerCuentaServicio({})).toBeNull();
    for (const json of ['null', '{}', '[]', '"texto"', '42', '{', '', ' ']) {
      expect(() => leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: json })).toThrow('FIREBASE_CREDENCIAL_MALFORMADA');
    }
  });
  it.each(['FIREBASE_SERVICE_ACCOUNT_PATH', 'GOOGLE_APPLICATION_CREDENTIALS'])('clasifica archivo ilegible en %s', (fuente) => {
    expect(() => leerCuentaServicio({ [fuente]: '/ruta-inexistente-prueba-fase1/no-existe.json' })).toThrow('FIREBASE_CREDENCIAL_ILEGIBLE');
  });
  it('no ignora una fuente inválida aunque haya otra válida', () => {
    expect(() => leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: '{', FIREBASE_SERVICE_ACCOUNT_B64: Buffer.from(raw).toString('base64') })).toThrow('FIREBASE_CREDENCIAL_MALFORMADA');
    expect(() => leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: raw, GOOGLE_APPLICATION_CREDENTIALS: '/ruta-inexistente-prueba-fase1/no-existe.json' })).toThrow('FIREBASE_CREDENCIAL_ILEGIBLE');
    expect(() => leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: raw, FIREBASE_SERVICE_ACCOUNT_B64: '%%%' })).toThrow('FIREBASE_CREDENCIAL_MALFORMADA');
  });
  it('conserva base64 válido con y sin relleno y con saltos de línea', () => {
    const b64 = Buffer.from(raw).toString('base64');
    for (const valor of [b64, b64.replace(/=+$/, ''), b64.match(/.{1,60}/g)!.join('\n')]) {
      expect(leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT_B64: valor })?.project_id).toBe(config.projectId);
    }
  });
  it('detecta fuentes contradictorias, pero permite fuentes equivalentes', () => {
    const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString('base64');
    expect(leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: raw, FIREBASE_SERVICE_ACCOUNT_B64: b64(cuenta) })?.project_id).toBe(config.projectId);
    expect(() => leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: raw, FIREBASE_SERVICE_ACCOUNT_B64: b64({ ...cuenta, project_id: 'otro-proyecto' }) })).toThrow('FIREBASE_CREDENCIAL_CONTRADICTORIA');
  });
  it('rechaza material privado inválido y endpoint OAuth alternativo sin red', () => {
    expect(() => leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ ...cuenta, private_key: 'no-es-clave' }) })).toThrow('FIREBASE_CREDENCIAL_MALFORMADA');
    expect(() => leerCuentaServicio({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ ...cuenta, token_uri: 'https://no-autorizado.invalid/token' }) })).toThrow('FIREBASE_CREDENCIAL_MALFORMADA');
  });
});

describe('contrato de acceso antes de crear clientes', () => {
  it('cruza overrides y credenciales: solo la combinación canónica puede habilitar Firestore', async () => {
    const red = vi.fn(async () => { throw new Error('Red prohibida'); });
    vi.stubGlobal('fetch', red);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const proyectos = [undefined, config.projectId, 'otro-proyecto', ''];
    const bases = [undefined, config.firestoreDatabaseId, 'otra-base', '(default)', ''];
    const credenciales = [undefined, raw, JSON.stringify({ ...cuenta, project_id: 'otro-proyecto' }), 'null', '{', ''];
    let combinaciones = 0;
    for (const proyecto of proyectos) for (const base of bases) for (const credencial of credenciales) {
      const env = { VERCEL: '1', ...(proyecto === undefined ? {} : { FIREBASE_PROJECT_ID: proyecto }),
        ...(base === undefined ? {} : { FIRESTORE_DATABASE_ID: base }),
        ...(credencial === undefined ? {} : { FIREBASE_SERVICE_ACCOUNT: credencial }) };
      const permitido = (proyecto === undefined || proyecto === config.projectId)
        && (base === undefined || base === config.firestoreDatabaseId) && credencial === raw;
      const acceso = resolverAccesoFirebase(env);
      const ia = crearDependenciasNucleoIA(env);
      const titulares = crearDependenciasReales(undefined, false, env);
      if (permitido) {
        expect(acceso.errorConfiguracion).toBeUndefined();
        expect(acceso.proyectoId).toBe(config.projectId);
        expect(acceso.baseDatosId).toBe(config.firestoreDatabaseId);
        expect(ia.registro?.tipo).toBe('FIRESTORE');
        expect(titulares.errorConfiguracion!()).toBeUndefined();
      } else {
        expect(acceso.errorConfiguracion).toBeDefined();
        expect(acceso.cuenta).toBeNull();
        expect(ia.registro).toBeNull();
        expect(ia.crearClienteProveedor()).toBeNull();
        expect(await ia.verificarToken('no-usado')).toBeNull();
        expect(titulares.errorConfiguracion!()).toBeDefined();
        expect(titulares.leerCredencial!()).toBeNull();
        expect(await titulares.verificarToken!('no-usado')).toBeNull();
        expect(await titulares.leerDocumento!('inmuebles/prueba')).toBeNull();
        expect(await titulares.consultarPrefijo!('propietarios', 'nombre', 'prueba', 10)).toEqual([]);
      }
      combinaciones++;
    }
    expect(combinaciones).toBe(120);
    expect(red).not.toHaveBeenCalled();
  });

  it('solo la ausencia real en desarrollo explícito conserva memoria; un error no', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dev = { NODE_ENV: 'development' };
    expect(resolverAccesoFirebase(dev).errorConfiguracion).toBe('FIREBASE_CREDENCIAL_AUSENTE');
    expect(crearDependenciasNucleoIA(dev).registro?.tipo).toBe('MEMORIA');
    expect(resolverConfiguracionIA({}).errorConfiguracion).toBe('FIREBASE_CREDENCIAL_AUSENTE');
    expect(resolverConfiguracionIA({ NODE_ENV: 'production' }).errorConfiguracion).toBe('FIREBASE_CREDENCIAL_AUSENTE');
    for (const env of [{ ...dev, FIREBASE_SERVICE_ACCOUNT: 'null' }, { ...dev, FIREBASE_PROJECT_ID: 'otro-proyecto' }]) {
      const deps = crearDependenciasNucleoIA(env);
      expect(deps.registro).toBeNull();
      expect(deps.errorConfiguracion).toBeDefined();
      expect(deps.crearClienteProveedor()).toBeNull();
    }
  });

  it('no oculta excepciones ajenas al contrato del lector', () => {
    vi.spyOn(googleOriginal, 'leerCuentaServicio').mockImplementation(() => { throw new Error('fallo-programacion-prueba'); });
    expect(() => resolverAccesoFirebase({})).toThrow('fallo-programacion-prueba');
  });
});

type Caso = { nombre: string; error?: string; json?: string; io?: string; env?: NodeJS.ProcessEnv };
const casos: Caso[] = [
  { nombre: 'credencial ausente', error: 'FIREBASE_CREDENCIAL_AUSENTE', env: { FIREBASE_SERVICE_ACCOUNT: undefined } },
  { nombre: 'credencial null', error: 'FIREBASE_CREDENCIAL_MALFORMADA', env: { FIREBASE_SERVICE_ACCOUNT: 'null' } },
  { nombre: 'credencial JSON roto', error: 'FIREBASE_CREDENCIAL_MALFORMADA', env: { FIREBASE_SERVICE_ACCOUNT: '{' } },
  { nombre: 'credencial ilegible', error: 'FIREBASE_CREDENCIAL_ILEGIBLE', env: { FIREBASE_SERVICE_ACCOUNT: undefined, FIREBASE_SERVICE_ACCOUNT_PATH: '/ruta-inexistente-prueba-fase1/no-existe.json' } },
  { nombre: 'credencial vacía explícita', error: 'FIREBASE_CREDENCIAL_MALFORMADA', env: { FIREBASE_SERVICE_ACCOUNT: '' } },
  { nombre: 'proyecto de cuenta ajeno', error: 'FIREBASE_PROYECTO_INCOMPATIBLE', env: { FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ ...cuenta, project_id: 'proyecto-ajeno' }) } },
  { nombre: 'JSON ausente', error: 'FIREBASE_CONFIGURACION_AUSENTE', io: 'ENOENT' },
  { nombre: 'JSON ilegible', error: 'FIREBASE_CONFIGURACION_ILEGIBLE', io: 'EACCES' },
  { nombre: 'JSON roto', error: 'FIREBASE_CONFIGURACION_INVALIDA', json: '{' },
  { nombre: 'JSON null', error: 'FIREBASE_CONFIGURACION_INVALIDA', json: 'null' },
  { nombre: 'base ausente', error: 'FIREBASE_BASE_DATOS_AUSENTE', json: JSON.stringify({ projectId: config.projectId }) },
  { nombre: 'proyecto del JSON ajeno', error: 'FIREBASE_PROYECTO_INCOMPATIBLE', json: JSON.stringify({ ...config, projectId: 'proyecto-ajeno' }) },
  { nombre: 'override de proyecto', error: 'FIREBASE_OVERRIDE_INCOMPATIBLE', env: { FIREBASE_PROJECT_ID: 'otro-proyecto' } },
  { nombre: 'override de base', error: 'FIREBASE_OVERRIDE_INCOMPATIBLE', env: { FIRESTORE_DATABASE_ID: '(default)' } },
  { nombre: 'override y cuenta ajenos coincidentes', error: 'FIREBASE_OVERRIDE_INCOMPATIBLE', env: { FIREBASE_PROJECT_ID: 'otro-proyecto', FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ ...cuenta, project_id: 'otro-proyecto' }) } },
  { nombre: 'fuentes contradictorias', error: 'FIREBASE_CREDENCIAL_CONTRADICTORIA', env: { FIREBASE_SERVICE_ACCOUNT_B64: Buffer.from(JSON.stringify({ ...cuenta, project_id: 'otro-proyecto' })).toString('base64') } },
  { nombre: 'válida' },
  { nombre: 'válida con overrides confirmatorios', env: { FIREBASE_PROJECT_ID: config.projectId, FIRESTORE_DATABASE_ID: config.firestoreDatabaseId } },
];

describe('matriz HTTP: servidor real con lectores reales, sin red externa', () => {
  it.each(casos)('$nombre', async (caso) => {
    vi.resetModules();
    for (const nombre of ['FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_SERVICE_ACCOUNT_B64', 'FIREBASE_SERVICE_ACCOUNT_PATH', 'GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_PROJECT_ID', 'FIRESTORE_DATABASE_ID']) vi.stubEnv(nombre, undefined);
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GEMINI_API_KEY', '');
    // Esta suite prueba la STRICTUD de la configuración Firebase (503 por credencial
    // inválida; 401 con credencial válida y sin sesión), no la política comercial:
    // se fija una política APROBADA para que el bloqueo preventivo de aprobación
    // pendiente no enmascare el 401 esperado en los casos válidos.
    vi.stubEnv('IA_POLITICA_JSON', JSON.stringify(construirPoliticaIACompleta()));
    vi.stubEnv('FIREBASE_SERVICE_ACCOUNT', raw);
    for (const [k, v] of Object.entries(caso.env ?? {})) vi.stubEnv(k, v);
    // Intercepta solo el archivo de configuración. El lector de credenciales es real.
    vi.doMock('node:fs', async () => {
      const real = await vi.importActual<typeof import('node:fs')>('node:fs');
      return { ...real, readFileSync: (archivo: unknown, ...args: unknown[]) => {
        if (String(archivo).endsWith('firebase-applet-config.json')) {
          if (caso.io) throw Object.assign(new Error('ruta sensible no debe exponerse'), { code: caso.io });
          return caso.json ?? crudoCanonico;
        }
        return (real.readFileSync as any)(archivo, ...args);
      } };
    });
    let servidor: import('node:http').Server | undefined;
    try {
      const google = await import('../server/titularidades/googleBackend');
      const prohibido = vi.fn(() => { throw new Error('Puerto Firebase no debe invocarse'); });
      vi.spyOn(google, 'verificarIdToken').mockImplementation(prohibido);
      for (const metodo of ['leerDocumento', 'leer', 'consultarPrefijo', 'crearDocumento', 'actualizarCampos'] as const) vi.spyOn(google.ClienteFirestoreRest.prototype, metodo).mockImplementation(prohibido);
      const red = vi.fn(async () => { throw new Error('Red externa prohibida'); });
      vi.stubGlobal('fetch', red);
      const logs: unknown[][] = [];
      for (const metodo of ['warn', 'info', 'error'] as const) vi.spyOn(console, metodo).mockImplementation((...args) => { logs.push(args); });
      const { default: app } = await import('../server');
      servidor = app.listen(0, '127.0.0.1');
      await once(servidor, 'listening');
      const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
      const salud = await fetchHttp(`${base}/api/health`);
      expect(salud.status).toBe(200);
      const json = await salud.json();
      expect(json.ia.errorConfiguracion).toBe(caso.error);
      expect(json.ia.registro).toBe(caso.error ? 'NO_CONFIGURADO' : 'FIRESTORE');
      for (const operacion of OPERACIONES_IA) {
        const res = await fetchHttp(`${base}${operacion.ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(caso.error ? { Authorization: 'Bearer no-usado', 'Idempotency-Key': 'prueba-config-0001' } : {}) }, body: '{}' });
        expect(res.status, operacion.ruta).toBe(caso.error ? 503 : 401);
        expect((await res.json()).codigo).toBe(caso.error ?? 'NO_AUTENTICADO');
      }
      const titulares = await fetchHttp(`${base}/api/titulares/buscar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inmuebleId: 'prueba', termino: 'prueba' }) });
      expect(titulares.status).toBe(caso.error ? 503 : 401);
      expect((await titulares.json()).codigoConfiguracion).toBe(caso.error);
      // AG-04 (2026-10-20): el almacén temporal de documentos está retirado en
      // cualquier configuración: nunca se acepta ni se sirve un binario desde RAM.
      const carga = await fetchHttp(`${base}/api/upload-document`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'prueba.txt', mimeType: 'text/plain', fileBase64: Buffer.from('solo memoria local').toString('base64') }) });
      expect(carga.status).toBe(410);
      expect((await carga.json()).codigo).toBe('ALMACEN_TEMPORAL_RETIRADO');
      const descarga = await fetchHttp(`${base}/api/documents/doc_00000000000000000000000000000000`);
      expect(descarga.status).toBe(410);
      expect(prohibido).not.toHaveBeenCalled();
      expect(red).not.toHaveBeenCalled();
      for (const secreto of [privada, cuenta.client_email, 'ruta sensible', 'proyecto-ajeno']) {
        expect(JSON.stringify(json)).not.toContain(secreto);
        expect(JSON.stringify(logs)).not.toContain(secreto);
      }
      const deps = (await import('../server/ia/configuracionIA')).crearDependenciasNucleoIA();
      if (caso.error) {
        expect(deps.registro).toBeNull();
        expect(deps.crearClienteProveedor()).toBeNull();
        expect(await deps.verificarToken('no-usado')).toBeNull();
      }
    } finally {
      if (servidor) await new Promise<void>((r) => servidor!.close(() => r()));
      vi.doUnmock('node:fs');
    }
  }, 60_000);
});
