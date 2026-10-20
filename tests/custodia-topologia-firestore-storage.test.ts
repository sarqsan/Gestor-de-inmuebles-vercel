/**
 * ORDEN 1 · AG-03 — TOPOLOGÍA REAL: BASE FIRESTORE CON NOMBRE vs `storage.rules` SOBRE `(default)`
 * ==============================================================================================
 * Hechos que este test fija SIN red ni credenciales (leyendo la configuración y
 * el código que de verdad se despliegan):
 *  1. La aplicación (cliente) y el servidor hablan con la MISMA base Firestore
 *     con nombre declarada en `firebase-applet-config.json`; `firebase.json`
 *     publica `firestore.rules` en esa base.
 *  2. `storage.rules` resuelve TODO el ámbito (espejo `usuarios_auth`, ficha
 *     `usuarios`, inmuebles, contratos, carteras…) con `firestore.get/exists`
 *     sobre `/databases/(default)/documents/…` y en ninguna otra base.
 *  3. Según la documentación de Firebase, las reglas de Storage SÓLO pueden
 *     consultar la base por defecto cuando el proyecto tiene varias bases: la
 *     base con nombre de la app es invisible para `storage.rules`.
 *  4. Consecuencia mecánica (harness sobre el texto real de las reglas): si el
 *     espejo NO está en la base que lee Storage, el titular legítimo queda
 *     denegado en `gastos_facturas/`, `cobros_justificantes/` y
 *     `documentos_patrimoniales/`; con el espejo presente, se le permite. El
 *     master (por correo) pasa en ambos casos: por eso el problema no se ve
 *     desde la cuenta maestra.
 *  5. La app deja constancia de la discrepancia (`custodiaStorageDependeDeBaseDistinta`).
 *
 * Lo que NO fija: si la base `(default)` del proyecto real existe y qué
 * contiene — eso es V (pendiente de verificación autorizada en consola).
 * No se modifica ninguna regla: la decisión (replicar espejo, migrar base o
 * reformular reglas) requiere autorización y verificación real.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Peticion } from './harness/firestoreRulesEval';
import { crearEvaluadorStorage, type PeticionStorage } from './harness/storageRulesEval';
import {
  BASE_DATOS_ACCESIBLE_DESDE_STORAGE_RULES,
  FIREBASE_BASE_DATOS_ID,
  avisoTopologiaCustodia,
  custodiaStorageDependeDeBaseDistinta,
} from '../src/lib/entornoFirebase';
import { esMensajeTecnico } from '../src/feedback/mensajes';

const RAIZ = resolve(__dirname, '..');
const leer = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');
const CONFIG = JSON.parse(leer('firebase-applet-config.json')) as { projectId: string; firestoreDatabaseId?: string };
const FIREBASE_JSON = JSON.parse(leer('firebase.json')) as { firestore?: Array<{ database?: string; rules?: string }>; storage?: { rules?: string } };
const STORAGE = leer('storage.rules');
const FIRESTORE = leer('firestore.rules');

describe('1 · cliente y servidor operan sobre la misma base Firestore con nombre', () => {
  it('la configuración declara una base con nombre (no `(default)`) y la app la pasa a getFirestore', () => {
    expect(typeof CONFIG.firestoreDatabaseId).toBe('string');
    expect(CONFIG.firestoreDatabaseId).not.toBe('(default)');
    expect(CONFIG.firestoreDatabaseId).toMatch(/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/);
    const cliente = leer('src/lib/firebase.ts');
    expect(cliente).toMatch(/const firestoreDbId = \(firebaseConfig as \{ firestoreDatabaseId\?: string \}\)\.firestoreDatabaseId;/);
    expect(cliente).toMatch(/getFirestore\(app, firestoreDbId\)/);
    expect(FIREBASE_BASE_DATOS_ID).toBe(CONFIG.firestoreDatabaseId);
  });

  it('el servidor (REST con cuenta de servicio) usa el mismo `firestoreDatabaseId` y exige coherencia con el entorno', () => {
    const cfgServidor = leer('server/titularidades/configuracionFirebase.ts');
    expect(cfgServidor).toContain('firestoreDatabaseId');
    expect(cfgServidor).toContain('FIRESTORE_DATABASE_ID');
    const rest = leer('server/titularidades/googleBackend.ts');
    expect(rest).toMatch(/databases\/\$\{baseDatos\}\/documents/);
  });

  it('`firebase.json` publica firestore.rules en esa base y storage.rules en el bucket (sin selector de base)', () => {
    expect(FIREBASE_JSON.firestore?.[0]?.database).toBe(CONFIG.firestoreDatabaseId);
    expect(FIREBASE_JSON.firestore?.[0]?.rules).toBe('firestore.rules');
    expect(FIREBASE_JSON.storage?.rules).toBe('storage.rules');
  });
});

describe('2 · storage.rules sólo consulta `/databases/(default)/documents`', () => {
  const referencias = STORAGE.match(/\/databases\/[^/]+\/documents\//g) ?? [];
  it('hay consultas cross-service y TODAS apuntan a `(default)`', () => {
    expect(referencias.length).toBeGreaterThan(0);
    const bases = new Set(referencias.map((r) => r.split('/')[2]));
    expect([...bases]).toEqual(['(default)']);
    expect(STORAGE).not.toContain(CONFIG.firestoreDatabaseId as string);
  });
  it('las funciones de ámbito que gobiernan facturas, justificantes y documentos patrimoniales dependen de esas consultas', () => {
    for (const fn of ['espejoExiste', 'espejo', 'adminStorage', 'pidDeInmueble', 'pidDeContrato']) {
      const cuerpo = STORAGE.match(new RegExp(`function ${fn}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}`))?.[1] ?? '';
      expect(cuerpo, fn).toMatch(/firestore\.(get|exists)\(\/databases\/\(default\)\/documents\//);
    }
    for (const prefijo of ['cobros_justificantes/{propietarioId}', 'gastos_facturas/{propietarioId}', 'inmuebles/{inmuebleId}/documentos_patrimoniales/{documentoId}']) {
      expect(STORAGE, prefijo).toContain(`match /${prefijo}/`);
    }
  });
});

describe('3 · la app deja constancia de la discrepancia (diagnóstico sin red)', () => {
  it('BASE_DATOS_ACCESIBLE_DESDE_STORAGE_RULES es `(default)` y el diagnóstico es verdadero con la configuración real', () => {
    expect(BASE_DATOS_ACCESIBLE_DESDE_STORAGE_RULES).toBe('(default)');
    expect(custodiaStorageDependeDeBaseDistinta()).toBe(true);
    const aviso = avisoTopologiaCustodia();
    expect(aviso).toBeTruthy();
    expect(aviso).toContain(CONFIG.firestoreDatabaseId as string);
    expect(aviso).toContain('pendiente de verificación');
    expect(esMensajeTecnico(aviso as string)).toBe(aviso!.length > 240); // largo, pero sin jerga de SDK
    expect(aviso).not.toMatch(/firestore\.get|storage\/|permission/i);
  });
  it('la pantalla de Configuración muestra la base de datos activa y el aviso', () => {
    const pantalla = leer('src/components/sections/ConfiguracionSection.tsx');
    expect(pantalla).toContain('data-testid="base-datos-firebase-activa"');
    expect(pantalla).toContain('data-testid="aviso-topologia-custodia"');
    expect(pantalla).toContain('avisoTopologiaCustodia()');
  });
});

// ---------------------------------------------------------------------------
// 4 · Mecanismo de AG-03 reproducido con el texto REAL de las reglas
// ---------------------------------------------------------------------------
describe('4 · harness: con el espejo fuera de la base que lee Storage, el titular legítimo queda denegado', () => {
  const EVAL = crearEvaluadorStorage(STORAGE, FIRESTORE);
  const EMAIL_MASTER = (STORAGE.match(/request\.auth\.token\.email\s*==\s*'([^'@\s]+@[^'\s]+)'/) || [])[1];
  if (!EMAIL_MASTER) throw new Error('storage.rules sin email master literal: fichero equivocado');

  const AUTH_TITULAR = { uid: 'uid_propA', token: { email: 'prop-a@test.local' } };
  const AUTH_GESTOR_E = { uid: 'uid_gestorE', token: { email: 'gestor-e@test.local' } };
  const AUTH_MASTER = { uid: 'uid_master', token: { email: EMAIL_MASTER } };

  /** Lo que la app escribe en su base CON NOMBRE (espejo + inmueble). */
  const BASE_CON_ESPEJO: Peticion['db'] = {
    'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', profesionalId: '', inmuebleIds: [] },
    'usuarios_auth/uid_gestorE': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: '', profesionalId: '', inmuebleIds: [], carterasL: ['prop_A'], carterasE: ['prop_A'] },
    'inmuebles/inm_A': { propietarioId: 'prop_A' },
    'inmuebles/inm_A/documentos_patrimoniales/docpat_A': {
      id: 'docpat_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', estado: 'PENDIENTE_STORAGE',
      storagePath: 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf', nombreStorage: 'escritura.pdf',
      mimeType: 'application/pdf', tamanoBytes: 1000, sha256: 'a'.repeat(64),
    },
  };
  /** Lo que ve `storage.rules` si `(default)` no contiene el espejo: nada. */
  const BASE_SIN_ESPEJO: Peticion['db'] = {};

  const RUTAS = [
    'gastos_facturas/prop_A/g1/1699_factura.pdf',
    'cobros_justificantes/prop_A/cob1/1699_justificante.pdf',
  ];
  const md = (path: string) => ({ size: 1000, contentType: 'application/pdf', name: path });
  const op = (verbo: 'get' | 'create', auth: PeticionStorage['auth'], db: Peticion['db'], path: string) =>
    EVAL.permiteStorage(verbo, { auth, db, path, metadata: verbo === 'create' ? md(path) : null });

  it('4a · con el espejo visible, titular y cartera E suben/leen lo suyo (control positivo)', () => {
    for (const ruta of RUTAS) {
      expect(op('create', AUTH_TITULAR, BASE_CON_ESPEJO, ruta), ruta).toBe(true);
      expect(op('get', AUTH_TITULAR, BASE_CON_ESPEJO, ruta), ruta).toBe(true);
      expect(op('create', AUTH_GESTOR_E, BASE_CON_ESPEJO, ruta), ruta).toBe(true);
    }
  });

  it('4b · con el espejo fuera del alcance de Storage, el MISMO titular queda denegado en todo (mecanismo AG-03)', () => {
    for (const ruta of RUTAS) {
      expect(op('create', AUTH_TITULAR, BASE_SIN_ESPEJO, ruta), ruta).toBe(false);
      expect(op('get', AUTH_TITULAR, BASE_SIN_ESPEJO, ruta), ruta).toBe(false);
      expect(op('create', AUTH_GESTOR_E, BASE_SIN_ESPEJO, ruta), ruta).toBe(false);
    }
  });

  it('4c · el master pasa en ambos escenarios: desde la cuenta maestra el fallo es invisible', () => {
    for (const ruta of RUTAS) {
      expect(op('create', AUTH_MASTER, BASE_CON_ESPEJO, ruta)).toBe(true);
      expect(op('create', AUTH_MASTER, BASE_SIN_ESPEJO, ruta)).toBe(true);
    }
  });

  it('4d · documentos patrimoniales (P3/P5) dependen además del documento de metadatos: sin base visible, denegado', () => {
    const ruta = 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf';
    const meta = {
      size: 1000, contentType: 'application/pdf', name: ruta,
      metadata: { documentoId: 'docpat_A', inmuebleId: 'inm_A', sha256: 'a'.repeat(64) },
    };
    expect(EVAL.permiteStorage('create', { auth: AUTH_TITULAR, db: BASE_CON_ESPEJO, path: ruta, metadata: meta })).toBe(true);
    expect(EVAL.permiteStorage('create', { auth: AUTH_TITULAR, db: BASE_SIN_ESPEJO, path: ruta, metadata: meta })).toBe(false);
  });

  it('4e · `sin_asignar` nunca es carpeta válida: ni con espejo (por eso el cliente exige titular antes de subir)', () => {
    const ruta = 'gastos_facturas/sin_asignar/g1/1699_factura.pdf';
    expect(op('create', AUTH_TITULAR, BASE_CON_ESPEJO, ruta)).toBe(false);
    expect(op('create', AUTH_GESTOR_E, BASE_CON_ESPEJO, ruta)).toBe(false);
  });
});
