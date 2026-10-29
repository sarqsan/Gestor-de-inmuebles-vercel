/**
 * ORDEN AG-03.2 — TOPOLOGÍA DEFINITIVA: UNA SOLA BASE FIRESTORE (CON NOMBRE) Y STORAGE SIN DEPENDER DE `(default)`
 * ===================================================================================================================
 * Hechos que este test fija SIN red ni credenciales (leyendo la configuración y
 * el código que de verdad se despliegan, y ejecutando el autorizador real):
 *  1. Cliente y servidor seleccionan la MISMA base Firestore con nombre declarada
 *     en `firebase-applet-config.json`; ninguna rama de arranque elige otra base:
 *     sin identificador con nombre el cliente lanza `FIREBASE_BASE_DATOS_AUSENTE`
 *     y el cliente REST del servidor `FIRESTORE_BASE_DATOS_REQUERIDA`.
 *  2. `storage.rules` ya NO consulta Firestore (ninguna base): cero
 *     `firestore.get/exists`, cero rutas `/databases/...`. Su única concesión es
 *     la lectura del catálogo público de fotos; el resto es denegación cerrada.
 *  3. La autorización documental la resuelve el servidor contra la base con
 *     nombre (`server/documentos/autorizacionDocumental.ts`), con el mismo
 *     puerto de lectura que el resto del servidor (`ClienteFirestoreRest`).
 *  4. Mecanismo de AG-03 reproducido con el autorizador real: con el espejo en
 *     la base con nombre, titular y cartera E operan sobre lo suyo; sin ficha de
 *     ámbito (lo que antes «veía» Storage al mirar `(default)`) quedan denegados;
 *     el master pasa en ambos casos (por eso el fallo era invisible desde la
 *     cuenta maestra). La diferencia respecto a ORDEN 1: la fuente que lee el
 *     servidor ES la base con nombre, así que el escenario real es el primero.
 *  5. `entornoFirebase.ts` no ofrece ningún identificador de respaldo y la
 *     pantalla de Configuración muestra la base activa.
 *
 * Qué NO fija: la publicación de `storage.rules`, la política CORS del bucket ni
 * la autorización con cuentas reales del proyecto (pasos de aceptación, V).
 * Historial: hasta ORDEN 1 este fichero demostraba el mecanismo del fallo sobre
 * el texto de unas reglas con 46 `firestore.get()` a `(default)`; esas reglas ya
 * no existen en el repositorio (véase `docs/AG-03.1-DIAGNOSTICO-…`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIREBASE_BASE_DATOS_CONFIGURADA,
  FIREBASE_BASE_DATOS_ID,
  FIREBASE_PROYECTO_ID,
  avisoTopologiaCustodia,
  custodiaStorageDependeDeBaseDistinta,
  esBaseDatosConNombre,
} from '../src/lib/entornoFirebase';
import { destinoFirebaseRequerido, resolverDestinoClienteFirebase } from '../src/lib/destinoFirebase';
import { ClienteFirestoreRest, esBaseDatosConNombre as esBaseDatosConNombreServidor } from '../server/titularidades/googleBackend';
import { EMAIL_MASTER } from '../server/titularidades/backendTitulares';
import { permiteServidor, type PeticionServidor } from './helpers/autorizacionDocumentalHarness';

const RAIZ = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');
const sinComentarios = (texto: string) => texto.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const CONFIG = JSON.parse(leer('firebase-applet-config.json')) as { projectId: string; firestoreDatabaseId?: string };
const FIREBASE_JSON = JSON.parse(leer('firebase.json')) as { firestore?: Array<{ database?: string; rules?: string }>; storage?: { rules?: string } };
const STORAGE = leer('storage.rules');

const CUENTA_FALSA = {
  type: 'service_account', project_id: 'proyecto-prueba', private_key_id: 'k', private_key: 'x',
  client_email: 'svc@proyecto-prueba.iam.gserviceaccount.com', client_id: '1', token_uri: 'https://oauth2.googleapis.com/token',
} as unknown as ConstructorParameters<typeof ClienteFirestoreRest>[0]['cuenta'];

describe('1 · cliente y servidor seleccionan la MISMA base Firestore con nombre; ninguna rama elige otra', () => {
  it('la configuración versionada declara una base con nombre válida (no `(default)`)', () => {
    expect(typeof CONFIG.firestoreDatabaseId).toBe('string');
    expect(CONFIG.firestoreDatabaseId).not.toBe('(default)');
    expect(esBaseDatosConNombre(CONFIG.firestoreDatabaseId)).toBe(true);
    expect(esBaseDatosConNombreServidor(CONFIG.firestoreDatabaseId)).toBe(true);
    expect(FIREBASE_BASE_DATOS_CONFIGURADA).toBe(true);
    expect(FIREBASE_BASE_DATOS_ID).toBe(CONFIG.firestoreDatabaseId);
    expect(FIREBASE_PROYECTO_ID).toBe(CONFIG.projectId);
  });

  it('el cliente inicializa Firestore SÓLO con esa base y falla de forma explícita si falta (sin respaldo a otra base)', () => {
    // P-08 — el destino se resuelve en `destinoFirebase.ts` (producción o staging).
    // La propiedad que este caso protege NO cambia: el cliente usa la base con
    // nombre del destino resuelto y NO cae a `getFirestore(app)` ni a `(default)`.
    const cliente = leer('src/lib/firebase.ts');
    expect(cliente).toContain('destinoFirebaseRequerido()');
    expect(cliente).toContain('const firestoreDbId = configuracionFirebase.firestoreDatabaseId;');
    expect(cliente).toMatch(/export const db = getFirestore\(app, firestoreDbId\);/);
    expect(cliente).not.toMatch(/getFirestore\(app\)\s*;/);
    expect(sinComentarios(cliente)).not.toContain('(default)');
    expect(sinComentarios(leer('src/lib/entornoFirebase.ts'))).not.toContain('(default)');
    expect(leer('src/lib/entornoFirebase.ts')).not.toContain('BASE_DATOS_ACCESIBLE_DESDE_STORAGE_RULES');

    // Y ahora la parte que antes solo se podía leer: el comportamiento REAL del
    // resolvedor cuando la configuración no declara base con nombre. Un grep
    // sobre `firebase.ts` no demuestra que se lance el error; esto sí.
    for (const invalida of [undefined, '', '(default)', 'Base Mal', 'ab']) {
      const resultado = resolverDestinoClienteFirebase({}, {
        projectId: CONFIG.projectId,
        firestoreDatabaseId: invalida,
      });
      expect(resultado.estado, String(invalida)).toBe('ERROR');
      if (resultado.estado === 'ERROR') {
        expect(resultado.codigo, String(invalida)).toBe('FIREBASE_BASE_DATOS_AUSENTE');
      }
      // El mensaje de arranque conserva el código histórico que ya documenta la
      // auditoría: quien despliegue ve el mismo identificador que antes.
      expect(() => destinoFirebaseRequerido(resultado), String(invalida))
        .toThrowError(/FIREBASE_BASE_DATOS_AUSENTE/);
    }
  });

  it('el servidor (REST con cuenta de servicio) exige `baseDatosId` con nombre: sin él no construye cliente alguno', () => {
    const cfgServidor = leer('server/titularidades/configuracionFirebase.ts');
    expect(cfgServidor).toContain('firestoreDatabaseId');
    expect(cfgServidor).toContain('FIRESTORE_DATABASE_ID');
    const rest = leer('server/titularidades/googleBackend.ts');
    expect(rest).toMatch(/databases\/\$\{baseDatos\}\/documents/);
    expect(rest).toContain("throw new Error('FIRESTORE_BASE_DATOS_REQUERIDA')");
    expect(sinComentarios(rest)).not.toContain('(default)');
    for (const invalida of [undefined, '', '(default)', 'Base Mal', 'ab']) {
      expect(() => new ClienteFirestoreRest({ cuenta: CUENTA_FALSA, baseDatosId: invalida as unknown as string }), String(invalida))
        .toThrowError('FIRESTORE_BASE_DATOS_REQUERIDA');
    }
    const cliente = new ClienteFirestoreRest({ cuenta: CUENTA_FALSA, baseDatosId: CONFIG.firestoreDatabaseId as string });
    expect(cliente.baseDatosId).toBe(CONFIG.firestoreDatabaseId);
  });

  it('todas las construcciones de `ClienteFirestoreRest` del servidor parten de la configuración única (sin literal de base)', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const salida = execSync("grep -rn 'new ClienteFirestoreRest(' server server.ts --include=*.ts || true", { cwd: RAIZ, encoding: 'utf8' });
    const sitios = salida.split('\n').filter((l) => l && !/\.test\.ts:/.test(l));
    expect(sitios.length).toBeGreaterThan(0);
    for (const sitio of sitios) {
      expect(sitio).toMatch(/baseDatosId:\s*(configuracion|actual)\.baseDatosId/);
      expect(sitio).not.toMatch(/baseDatosId:\s*['"`]/);
    }
    // El servicio documental usa el MISMO puerto Firestore que el resto del servidor.
    const servidor = leer('server.ts');
    expect(servidor).toMatch(/crearServicioDocumentos\(\{ puerto: dependenciasIA\.firestore, almacen: dependenciasIA\.storage \}\)/);
    expect(servidor).toMatch(/montarRutasDocumentos\(app, \{/);
  });

  it('`firebase.json` publica firestore.rules en esa base y storage.rules en el bucket (sin selector de base)', () => {
    expect(FIREBASE_JSON.firestore).toHaveLength(1);
    expect(FIREBASE_JSON.firestore?.[0]?.database).toBe(CONFIG.firestoreDatabaseId);
    expect(FIREBASE_JSON.firestore?.[0]?.rules).toBe('firestore.rules');
    expect(FIREBASE_JSON.storage?.rules).toBe('storage.rules');
  });

  it('ninguna fuente ejecutable de la app (src/, server/, scripts/) selecciona `(default)` ni llama a getFirestore sin base', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const ocurrencias = execSync(
      "grep -rn '(default)' src server server.ts scripts --include=*.ts --include=*.tsx --include=*.mts --include=*.mjs --include=*.js 2>/dev/null || true",
      { cwd: RAIZ, encoding: 'utf8' },
    ).split('\n').filter(Boolean);
    const ejecutables = ocurrencias.filter((l) => {
      const [fichero, , ...resto] = l.split(':');
      const codigo = resto.join(':');
      if (/\.test\.tsx?:|\/tests?\//.test(`${fichero}:`)) return false; // dobles y pruebas (incl. emulador aislado)
      return !/^\s*(\/\/|\*|\/\*)/.test(codigo) && !/\/\/.*\(default\)|\/\*.*\(default\)|\*.*\(default\)/.test(codigo);
    });
    expect(ejecutables, ejecutables.join('\n')).toEqual([]);
    const getFirestoreSinBase = execSync(
      "grep -rn 'getFirestore(' src server --include=*.ts --include=*.tsx | grep -v '\\.test\\.' | grep -v '/tests/' || true",
      { cwd: RAIZ, encoding: 'utf8' },
    ).split('\n').filter(Boolean);
    expect(getFirestoreSinBase).toHaveLength(1);
    expect(getFirestoreSinBase[0]).toContain('getFirestore(app, firestoreDbId)');
  });
});

describe('2 · storage.rules no consulta Firestore (ninguna base) y sólo concede el catálogo público', () => {
  const reglas = sinComentarios(STORAGE);
  it('cero `firestore.get/exists`, cero `/databases/`, sin el identificador de la base con nombre ni `(default)` fuera de comentarios', () => {
    expect(reglas).not.toMatch(/firestore\.(get|exists)\s*\(/);
    expect(reglas).not.toContain('/databases/');
    expect(reglas).not.toContain(CONFIG.firestoreDatabaseId as string);
    expect(reglas).not.toContain('(default)');
    expect(STORAGE).toMatch(/^rules_version = '2';/m);
    expect(STORAGE).toMatch(/service firebase\.storage \{/);
  });
  it('la única concesión es `allow get` en `inmuebles/{inmuebleId}/{fileName}` (catálogo de fotos); todo lo demás denegado y el comodín final cierra', () => {
    const allows = [...reglas.matchAll(/allow\s+([a-z, ]+?)\s*:\s*if\s+([^;]+);/g)].map((m) => ({ verbos: m[1].replace(/\s/g, ''), condicion: m[2].trim() }));
    const concesiones = allows.filter((a) => a.condicion !== 'false');
    expect(concesiones).toEqual([{ verbos: 'get', condicion: 'true' }]);
    const bloqueCatalogo = reglas.match(/match \/inmuebles\/\{inmuebleId\}\/\{fileName\}\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
    expect(bloqueCatalogo).toMatch(/allow get: if true;/);
    expect(bloqueCatalogo).toMatch(/allow list: if false;/);
    expect(bloqueCatalogo).toMatch(/allow create, update, delete: if false;/);
    const bloques = [...reglas.matchAll(/match \/(\S+)\s*\{/g)].map((m) => m[1]);
    expect(bloques).toEqual(['b/{bucket}/o', 'inmuebles/{inmuebleId}/{fileName}', '{allPaths=**}']);
    const comodin = reglas.slice(reglas.lastIndexOf('match /{allPaths=**}'));
    expect(comodin).toMatch(/allow read, write: if false;/);
    expect(reglas).not.toMatch(/request\.auth\s*!=\s*null/); // ni «cualquier autenticado»
    expect(reglas).not.toMatch(/token\.email/); // ni listas de correos como permiso
  });
  it('ningún prefijo documental privado tiene regla propia: facturas, justificantes, patrimoniales, contratos… sólo son accesibles por el servidor', () => {
    for (const prefijo of ['gastos_facturas', 'cobros_justificantes', 'documentos_patrimoniales', 'contratos', 'recibos', 'documentos_solicitados', 'morosidad_evidencias', 'incidencias', 'suministros']) {
      expect(reglas, prefijo).not.toContain(`match /${prefijo}`);
    }
  });
});

describe('3 · la app no deja ningún «respaldo» de base y la pantalla de Configuración muestra la base activa', () => {
  it('con la configuración real no hay discrepancia que avisar; sin base con nombre el aviso lo dice sin jerga', () => {
    expect(custodiaStorageDependeDeBaseDistinta()).toBe(false);
    expect(avisoTopologiaCustodia()).toBeNull();
    const fuente = leer('src/lib/entornoFirebase.ts');
    expect(fuente).toContain('firestoreDatabaseId');
    expect(fuente).toMatch(/\(sin base de datos con nombre: configuración incompleta\)/);
    expect(fuente).not.toMatch(/\?\?\s*['"`]\(default\)['"`]/);
  });
  it('la pantalla de Configuración muestra la base de datos activa y el aviso (condicional)', () => {
    const pantalla = leer('src/components/sections/ConfiguracionSection.tsx');
    expect(pantalla).toContain('data-testid="base-datos-firebase-activa"');
    expect(pantalla).toContain('data-testid="aviso-topologia-custodia"');
    expect(pantalla).toContain('avisoTopologiaCustodia()');
    expect(pantalla).toContain('FIREBASE_BASE_DATOS_ID');
  });
});

// ---------------------------------------------------------------------------
// 4 · Mecanismo de AG-03 reproducido con el AUTORIZADOR REAL del servidor
// ---------------------------------------------------------------------------
describe('4 · autorizador del servidor: el ámbito se resuelve en la base con nombre (la que la app escribe)', () => {
  const AUTH_TITULAR = { uid: 'uid_propA', token: { email: 'prop-a@test.local' } };
  const AUTH_GESTOR_E = { uid: 'uid_gestorE', token: { email: 'gestor-e@test.local' } };
  const AUTH_MASTER = { uid: 'uid_master', token: { email: EMAIL_MASTER } };

  /** Lo que la app escribe en su base CON NOMBRE (espejo + ficha + inmueble + metadatos P3). */
  const BASE_CON_ESPEJO: PeticionServidor['db'] = {
    'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [], usuarioId: 'uid_propA' },
    'usuarios/uid_propA': { estado: 'ACTIVO', authUid: 'uid_propA', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A' },
    'usuarios_auth/uid_gestorE': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: '', profesionalId: '', inmuebleIds: [], carterasL: ['prop_A'], carterasE: ['prop_A'], usuarioId: 'uid_gestorE' },
    'usuarios/uid_gestorE': { estado: 'ACTIVO', authUid: 'uid_gestorE', tipoPerfil: 'PROPIETARIO', carterasL: ['prop_A'], carterasE: ['prop_A'] },
    'inmuebles/inm_A': { propietarioId: 'prop_A' },
    'inmuebles/inm_A/documentos_patrimoniales/docpat_A': {
      id: 'docpat_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', estado: 'PENDIENTE_STORAGE',
      storagePath: 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf', nombreStorage: 'escritura.pdf',
      mimeType: 'application/pdf', tamanoBytes: 1000, sha256: 'a'.repeat(64),
    },
  };
  /** Lo que «veía» storage.rules al mirar `(default)`: nada. Hoy equivale a una cuenta sin ficha de ámbito. */
  const BASE_SIN_ESPEJO: PeticionServidor['db'] = {};
  /** Revocación: la ficha existe pero ya no está activa. */
  const BASE_REVOCADA: PeticionServidor['db'] = {
    ...BASE_CON_ESPEJO,
    'usuarios_auth/uid_propA': { ...BASE_CON_ESPEJO['usuarios_auth/uid_propA'], estado: 'REVOCADO' },
    'usuarios/uid_propA': { ...BASE_CON_ESPEJO['usuarios/uid_propA'], estado: 'REVOCADO' },
  };

  const RUTAS = [
    'gastos_facturas/prop_A/g1/1699_factura.pdf',
    'cobros_justificantes/prop_A/cob1/1699_justificante.pdf',
  ];
  const md = (path: string) => ({ size: 1000, contentType: 'application/pdf', name: path });
  const op = (verbo: 'get' | 'create', auth: PeticionServidor['auth'], db: PeticionServidor['db'], path: string) =>
    permiteServidor(verbo, { auth, db, path, metadata: verbo === 'create' ? md(path) : null });

  it('4a · con el espejo en la base con nombre, titular y cartera E suben/leen lo suyo (control positivo)', async () => {
    for (const ruta of RUTAS) {
      expect(await op('create', AUTH_TITULAR, BASE_CON_ESPEJO, ruta), ruta).toBe(true);
      expect(await op('get', AUTH_TITULAR, BASE_CON_ESPEJO, ruta), ruta).toBe(true);
      expect(await op('create', AUTH_GESTOR_E, BASE_CON_ESPEJO, ruta), ruta).toBe(true);
      expect(await op('get', AUTH_GESTOR_E, BASE_CON_ESPEJO, ruta), ruta).toBe(true);
    }
  });

  it('4b · sin ficha de ámbito en la fuente que lee el servidor, el MISMO titular queda denegado en todo (mecanismo AG-03)', async () => {
    for (const ruta of RUTAS) {
      expect(await op('create', AUTH_TITULAR, BASE_SIN_ESPEJO, ruta), ruta).toBe(false);
      expect(await op('get', AUTH_TITULAR, BASE_SIN_ESPEJO, ruta), ruta).toBe(false);
      expect(await op('create', AUTH_GESTOR_E, BASE_SIN_ESPEJO, ruta), ruta).toBe(false);
    }
  });

  it('4c · el master pasa en ambos escenarios: desde la cuenta maestra el fallo era invisible (por eso se exige validar con cuenta normal)', async () => {
    for (const ruta of RUTAS) {
      expect(await op('create', AUTH_MASTER, BASE_CON_ESPEJO, ruta)).toBe(true);
      expect(await op('create', AUTH_MASTER, BASE_SIN_ESPEJO, ruta)).toBe(true);
    }
  });

  it('4d · documentos patrimoniales (P3/P5) dependen además del documento de metadatos en la base con nombre', async () => {
    const ruta = 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf';
    const meta = {
      size: 1000, contentType: 'application/pdf', name: ruta,
      metadata: { documentoId: 'docpat_A', inmuebleId: 'inm_A', sha256: 'a'.repeat(64) },
    };
    expect(await permiteServidor('create', { auth: AUTH_TITULAR, db: BASE_CON_ESPEJO, path: ruta, metadata: meta })).toBe(true);
    expect(await permiteServidor('create', { auth: AUTH_TITULAR, db: BASE_SIN_ESPEJO, path: ruta, metadata: meta })).toBe(false);
    const sinMetadatos = { ...BASE_CON_ESPEJO };
    delete sinMetadatos['inmuebles/inm_A/documentos_patrimoniales/docpat_A'];
    expect(await permiteServidor('create', { auth: AUTH_TITULAR, db: sinMetadatos, path: ruta, metadata: meta })).toBe(false);
  });

  it('4e · la revocación se lee fresca en cada decisión: ficha revocada ⇒ denegado aunque el objeto exista', async () => {
    for (const ruta of RUTAS) {
      expect(await op('get', AUTH_TITULAR, BASE_REVOCADA, ruta), ruta).toBe(false);
      expect(await op('create', AUTH_TITULAR, BASE_REVOCADA, ruta), ruta).toBe(false);
    }
  });

  it('4f · `sin_asignar` nunca es carpeta válida (ni para el master): por eso el cliente exige titular antes de subir', async () => {
    const ruta = 'gastos_facturas/sin_asignar/g1/1699_factura.pdf';
    expect(await op('create', AUTH_TITULAR, BASE_CON_ESPEJO, ruta)).toBe(false);
    expect(await op('create', AUTH_GESTOR_E, BASE_CON_ESPEJO, ruta)).toBe(false);
    expect(await op('create', AUTH_MASTER, BASE_CON_ESPEJO, ruta)).toBe(false);
  });

  it('4g · sin sesión no hay acceso a ningún prefijo privado (ni lectura ni escritura)', async () => {
    for (const ruta of RUTAS) {
      expect(await op('get', null, BASE_CON_ESPEJO, ruta), ruta).toBe(false);
      expect(await op('create', null, BASE_CON_ESPEJO, ruta), ruta).toBe(false);
    }
  });
});
