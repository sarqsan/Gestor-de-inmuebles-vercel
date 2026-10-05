/**
 * H8 — AUTORIZACIÓN OPERATIVA DE TITULARIDAD
 * ===========================================
 *
 * Esta batería separa dos validaciones:
 *  1. el predicado central del cliente (`esTitularOperativo`), y
 *  2. el texto real desplegable de `firestore.rules`, evaluado con el harness
 *     compartido del repositorio para la regla de lectura del inmueble.
 *
 * La prueba contra el motor oficial de Firebase Emulator / Rules Unit Testing
 * no está disponible en este entorno (sin firebase-tools, emulador ni JRE).
 * Este fichero no la simula: el resultado de esta batería es estático/mecánico
 * y la validación real queda bloqueada hasta ejecutar el runner del emulador.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { esTitularOperativo } from '../src/features/operaciones/persistence/authorization';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from './harness/perfilesSinteticos';

const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const CLIENTE_FIREBASE = readFileSync(resolve(RAIZ, 'src/features/operaciones/persistence/firebase.ts'), 'utf8');
const EVAL = crearEvaluadorReglas(RULES);
const USUARIO = 'prop_A';
const AUTH: Peticion['auth'] = { uid: 'uid_prop_A', token: { email: 'prop-a@test.local' } };

function inmueble(extra: Record<string, unknown>): Record<string, unknown> {
  return { id: 'inm_H8', propietarioId: 'prop_B', propietarioPrincipalId: 'prop_B', titularesIds: ['prop_B'], ...extra };
}

function baseFirestore(inm: Record<string, unknown>, historico?: Record<string, unknown>): Peticion['db'] {
  const db: Peticion['db'] = {
    'usuarios_auth/uid_prop_A': {
      usuarioId: 'usuario_prop_A', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: USUARIO,
      inmuebleIds: [], carterasL: [], carterasE: [],
    },
    'inmuebles/inm_H8': inm,
    ...(historico ? { 'titularidades/inm_H8__prop_A': historico } : {}),
  };
  completarPerfilesSinteticos(db);
  return db;
}

function permiteLecturaRules(inm: Record<string, unknown>, historico?: Record<string, unknown>): boolean {
  const db = baseFirestore(inm, historico);
  return EVAL.permite('inmuebles', 'get', {
    auth: AUTH,
    db,
    resource: inm,
    requestResource: null,
    docId: 'inm_H8',
  });
}

const CASOS: readonly { nombre: string; inmueble: Record<string, unknown>; historico?: Record<string, unknown>; permitido: boolean }[] = [
  {
    nombre: 'propietarioId coincide',
    inmueble: inmueble({ propietarioId: USUARIO }),
    permitido: true,
  },
  {
    nombre: 'propietarioPrincipalId coincide',
    inmueble: inmueble({ propietarioPrincipalId: USUARIO }),
    permitido: true,
  },
  {
    nombre: 'usuario está en titularesIds',
    inmueble: inmueble({ titularesIds: ['prop_B', USUARIO] }),
    permitido: true,
  },
  {
    nombre: 'solo propietarioSecundarioId coincide',
    inmueble: inmueble({ propietarioSecundarioId: USUARIO }),
    permitido: false,
  },
  {
    nombre: 'solo snapshot fiscal coincide',
    inmueble: inmueble({
      datosFiscales: { propietarioPrincipal: { id: USUARIO, nifCif: 'FISCAL-ONLY' } },
      snapshotFiscal: { propietarioId: USUARIO },
    }),
    permitido: false,
  },
  {
    nombre: 'solo relación histórica cerrada',
    inmueble: inmueble({}),
    historico: { inmuebleId: 'inm_H8', propietarioId: USUARIO, estado: 'CERRADA', fechaFin: '2026-01-01' },
    permitido: false,
  },
  {
    nombre: 'usuario sin relación',
    inmueble: inmueble({}),
    permitido: false,
  },
];

describe('H8 · cliente y Rules comparten exactamente la titularidad operativa', () => {
  it.each(CASOS)('$nombre', ({ inmueble: ficha, historico, permitido }) => {
    expect(esTitularOperativo(ficha, USUARIO)).toBe(permitido);
    expect(permiteLecturaRules(ficha, historico)).toBe(permitido);
  });

  it('el guard real del adaptador usa el predicado central y no el campo legacy', () => {
    expect(CLIENTE_FIREBASE).toContain("import { esTitularOperativo, proyectarIdentidad } from './authorization.ts';");
    expect(CLIENTE_FIREBASE).toContain('esTitularOperativo(s.data(), a.propietarioId)');
    expect(CLIENTE_FIREBASE).not.toContain('propietarioSecundarioId].includes');

    const fuente = esTitularOperativo.toString();
    expect(fuente).not.toContain('propietarioSecundarioId');
    expect(fuente).not.toContain('datosFiscales');
    expect(fuente).not.toContain('porcentaje');
  });

  it('la entrada operativa de Rules usa solo los tres mecanismos H8', () => {
    const inicio = RULES.indexOf('function opActual(');
    const fin = RULES.indexOf('function opEntidad(', inicio);
    expect(inicio).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(inicio);
    const fuente = RULES.slice(inicio, fin);

    expect(fuente).toContain("inmueble.get('propietarioId', '') == p");
    expect(fuente).toContain("inmueble.get('propietarioPrincipalId', '') == p");
    expect(fuente).toContain("inmueble.get('titularesIds', [])");
    expect(fuente).not.toContain('propietarioSecundarioId');
    expect(fuente).not.toContain('datosFiscales');
    expect(fuente).not.toContain('snapshotFiscal');
    expect(fuente).not.toContain('titularidades');
    expect(RULES).toContain('&& opActual(p,data.idAfectado)');
  });
});
