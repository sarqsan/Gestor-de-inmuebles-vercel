/**
 * EMULADOR OFICIAL DE FIRESTORE — reglas de `inmuebles` y relaciones de titularidad.
 * -----------------------------------------------------------------------------
 * Ejecuta el motor real de reglas de Firebase (`firebase emulators:exec --only firestore`)
 * contra `firestore.rules` del repositorio, mediante `@firebase/rules-unit-testing`.
 * No es un simulador: no hay evaluador propio aquí. Las comprobaciones de lectura
 * administrativa (`withSecurityRulesDisabled`) sólo sirven para verificar el estado
 * persistido, nunca para autorizar nada.
 *
 * Ejecución (CI: .github/workflows/emulador-reglas.yml):
 *   firebase emulators:exec --only firestore --project demo-gestor-reglas \
 *     "npx vitest run --config vitest.emulador.config.ts"
 * Sin `FIRESTORE_EMULATOR_HOST` la suite FALLA: nunca se omite en silencio.
 *
 * Datos: sintéticos (ver ./mundoSintetico.ts). Ningún dato real de producción.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  GESTOR_G,
  LECTOR_L,
  TITULAR_A,
  TITULAR_B,
  mundoSintetico,
  revocarGestionSintetica,
  type SesionSintetica,
} from './mundoSintetico';

const RAIZ = resolve(__dirname, '../..');
const REGLAS = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const PROYECTO = 'demo-gestor-reglas';

type Doc = Record<string, unknown>;

let env: RulesTestEnvironment;

beforeAll(async () => {
  const emulador = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulador) {
    throw new Error('FIRESTORE_EMULATOR_HOST no definido: esta suite exige el emulador oficial de Firestore (no se omite).');
  }
  const [host, puerto] = emulador.split(':');
  env = await initializeTestEnvironment({
    projectId: PROYECTO,
    firestore: { rules: REGLAS, host, port: Number(puerto) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

/** Escritura administrativa (sin reglas) de los documentos indicados, sin borrar el resto. */
async function escribirAdmin(datos: Record<string, Doc>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const [ruta, valor] of Object.entries(datos)) {
      await db.doc(ruta).set(valor);
    }
  });
}

/** Reinicia el estado y siembra el mundo sintético (escritura administrativa). */
async function sembrar(datos: Record<string, Doc>): Promise<void> {
  await env.clearFirestore();
  await escribirAdmin(datos);
}

/** Estado persistido real (lectura administrativa). Sólo para verificar, nunca para autorizar. */
async function leerAdmin(ruta: string): Promise<Doc | undefined> {
  let salida: Doc | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(ruta).get();
    salida = snap.exists ? (snap.data() as Doc) : undefined;
  });
  return salida;
}

/** Firestore del usuario indicado (o anónimo si `null`). */
function dbDe(sesion: SesionSintetica | null) {
  return sesion
    ? env.authenticatedContext(sesion.uid, { email: sesion.email, email_verified: true }).firestore()
    : env.unauthenticatedContext().firestore();
}

/** ¿Acepta Rules la operación? `permission-denied` = no; cualquier otro error se propaga. */
async function permite(op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === 'permission-denied') return false;
    throw e;
  }
}

const ALTA_MINIMA = (id: string, propietarioId: string): Doc => ({ id, propietarioId });

beforeEach(async () => {
  await sembrar(mundoSintetico());
});

describe('alta (create): mínimos y ámbito de escritura', () => {
  it('titular propio crea con campos mínimos (id + titular propio)', async () => {
    await assertSucceeds(dbDe(TITULAR_A).doc('inmuebles/inm-min-1').set(ALTA_MINIMA('inm-min-1', 'prop-a')));
    expect(await leerAdmin('inmuebles/inm-min-1')).toMatchObject({ id: 'inm-min-1', propietarioId: 'prop-a' });
  });

  it('titular propio crea con opcionales ausentes (sin ciudad, estado ni precio) y renta declarada', async () => {
    const datos = { id: 'inm-min-2', propietarioId: 'prop-a', direccion: 'Calle Sintetica 9', rentaMensualDeclarada: 650 };
    await assertSucceeds(dbDe(TITULAR_A).doc('inmuebles/inm-min-2').set(datos));
    const persistido = await leerAdmin('inmuebles/inm-min-2');
    expect(persistido).toMatchObject(datos);
    expect(persistido).not.toHaveProperty('precio');
    expect(persistido).not.toHaveProperty('ciudad');
  });

  it('titular NO crea un inmueble de un titular ajeno', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-x-b').set(ALTA_MINIMA('inm-x-b', 'prop-b')));
    expect(await leerAdmin('inmuebles/inm-x-b')).toBeUndefined();
  });

  it('titular NO asigna como principal a un titular ajeno al crear', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-x-p').set({ id: 'inm-x-p', propietarioId: 'prop-a', propietarioPrincipalId: 'prop-b' }));
    expect(await leerAdmin('inmuebles/inm-x-p')).toBeUndefined();
  });

  it('gestor con LECTURA_ESCRITURA crea en la cartera gestionada', async () => {
    await assertSucceeds(dbDe(GESTOR_G).doc('inmuebles/inm-gb-1').set(ALTA_MINIMA('inm-gb-1', 'prop-b')));
    expect(await leerAdmin('inmuebles/inm-gb-1')).toMatchObject({ propietarioId: 'prop-b' });
  });

  it('gestor NO crea fuera de su cartera', async () => {
    await assertFails(dbDe(GESTOR_G).doc('inmuebles/inm-ga-1').set(ALTA_MINIMA('inm-ga-1', 'prop-a')));
    expect(await leerAdmin('inmuebles/inm-ga-1')).toBeUndefined();
  });

  it('lector (sólo LECTURA) NO crea, aunque sí lee', async () => {
    await assertFails(dbDe(LECTOR_L).doc('inmuebles/inm-la-1').set(ALTA_MINIMA('inm-la-1', 'prop-a')));
    await assertSucceeds(dbDe(LECTOR_L).doc('inmuebles/inm-a1').get());
  });

  it('anónimo no crea', async () => {
    await assertFails(dbDe(null).doc('inmuebles/inm-anon').set(ALTA_MINIMA('inm-anon', 'prop-a')));
  });
});

describe('mínimos inválidos: rechazo sin escritura', () => {
  it('sin propietarioId no se crea', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-sin-titular').set({ id: 'inm-sin-titular', direccion: 'Calle Sintetica 5' }));
    expect(await leerAdmin('inmuebles/inm-sin-titular')).toBeUndefined();
  });

  it('propietarioId vacío no se crea', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-vacio').set({ id: 'inm-vacio', propietarioId: '' }));
  });

  it('gestor sin propietarioId no se crea', async () => {
    await assertFails(dbDe(GESTOR_G).doc('inmuebles/inm-g-sin').set({ id: 'inm-g-sin' }));
  });
});

describe('éxito parcial: un registro rechazado no impide los demás', () => {
  it('el alta válida persiste y la rechazada no deja rastro', async () => {
    await assertSucceeds(dbDe(TITULAR_A).doc('inmuebles/inm-parcial-ok').set(ALTA_MINIMA('inm-parcial-ok', 'prop-a')));
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-parcial-b').set(ALTA_MINIMA('inm-parcial-b', 'prop-b')));
    expect(await leerAdmin('inmuebles/inm-parcial-ok')).toMatchObject({ propietarioId: 'prop-a' });
    expect(await leerAdmin('inmuebles/inm-parcial-b')).toBeUndefined();
  });
});

describe('lectura denegada: no prueba inexistencia ni autoriza escritura', () => {
  it('titular no puede leer un id inexistente (denegación ≠ inexistencia) y el documento sigue sin existir', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-fantasma').get());
    expect(await leerAdmin('inmuebles/inm-fantasma')).toBeUndefined();
  });

  it('titular no puede leer ni sobrescribir un inmueble ajeno existente', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-b1').get());
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-b1').set({ id: 'inm-b1', propietarioId: 'prop-a', direccion: 'SOBRESCRITO' }));
    expect(await leerAdmin('inmuebles/inm-b1')).toMatchObject({ propietarioId: 'prop-b', direccion: 'Calle Sintetica 2' });
  });

  it('denegar la lectura de un id ajeno no autoriza crearlo con otro titular', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-fantasma-b').set(ALTA_MINIMA('inm-fantasma-b', 'prop-b')));
  });
});

describe('actualización (update): ámbito propio, cartera y titularidad protegida', () => {
  it('titular propio actualiza campos sin tocar la titularidad, y conserva el resto', async () => {
    await assertSucceeds(dbDe(TITULAR_A).doc('inmuebles/inm-a1').update({ ciudad: 'Alicante' }));
    expect(await leerAdmin('inmuebles/inm-a1')).toMatchObject({
      ciudad: 'Alicante', propietarioId: 'prop-a', direccion: 'Calle Sintetica 1', rentaMensualDeclarada: 650,
    });
  });

  it('titular NO cambia su propietarioId canónico', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-a1').update({ propietarioId: 'prop-b' }));
    expect((await leerAdmin('inmuebles/inm-a1'))?.propietarioId).toBe('prop-a');
  });

  it('titular canónico NO asigna como principal a un titular ajeno', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-a1').update({ propietarioPrincipalId: 'prop-b' }));
    expect((await leerAdmin('inmuebles/inm-a1'))?.propietarioPrincipalId).toBe('prop-a');
  });

  it('principal NO canónico edita campos, pero no transmite la titularidad', async () => {
    await assertSucceeds(dbDe(TITULAR_A).doc('inmuebles/inm-c1').update({ ciudad: 'Valencia' }));
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-c1').update({ propietarioPrincipalId: 'prop-z' }));
    expect(await leerAdmin('inmuebles/inm-c1')).toMatchObject({ propietarioId: 'prop-b', propietarioPrincipalId: 'prop-a', ciudad: 'Valencia' });
  });

  it('titular NO escribe en un inmueble de otro titular', async () => {
    await assertFails(dbDe(TITULAR_A).doc('inmuebles/inm-b1').update({ ciudad: 'Madrid' }));
  });

  it('gestor con LECTURA_ESCRITURA actualiza campos de su cartera', async () => {
    await assertSucceeds(dbDe(GESTOR_G).doc('inmuebles/inm-b1').update({ ciudad: 'Alicante' }));
    expect((await leerAdmin('inmuebles/inm-b1'))?.ciudad).toBe('Alicante');
  });

  it('gestor NO transmite ni reasigna la titularidad de la cartera (gestionar ≠ transmitir)', async () => {
    await assertFails(dbDe(GESTOR_G).doc('inmuebles/inm-b1').update({ propietarioId: 'prop-g' }));
    await assertFails(dbDe(GESTOR_G).doc('inmuebles/inm-b1').update({ propietarioPrincipalId: 'prop-g' }));
    expect(await leerAdmin('inmuebles/inm-b1')).toMatchObject({ propietarioId: 'prop-b', propietarioPrincipalId: 'prop-b' });
  });

  it('gestor NO escribe en un inmueble fuera de su cartera', async () => {
    await assertFails(dbDe(GESTOR_G).doc('inmuebles/inm-a1').update({ ciudad: 'Madrid' }));
  });

  it('lector (LECTURA) lee pero NO escribe en la cartera', async () => {
    await assertSucceeds(dbDe(LECTOR_L).doc('inmuebles/inm-a1').get());
    await assertFails(dbDe(LECTOR_L).doc('inmuebles/inm-a1').update({ ciudad: 'Madrid' }));
    expect((await leerAdmin('inmuebles/inm-a1'))?.ciudad).toBeUndefined();
  });

  it('titular ajeno sin cartera no lee el inmueble', async () => {
    await assertFails(dbDe(TITULAR_B).doc('inmuebles/inm-a1').get());
  });
});

describe('revocación: la denegación se aplica en cuanto cambia el espejo', () => {
  it('tras revocar la gestión, el gestor pierde escritura y lectura de la cartera', async () => {
    await assertSucceeds(dbDe(GESTOR_G).doc('inmuebles/inm-b1').update({ ciudad: 'Alicante' }));
    const revocado = revocarGestionSintetica(mundoSintetico());
    await escribirAdmin({
      'gestiones_cartera/ges-b-g': revocado['gestiones_cartera/ges-b-g']!,
      [`usuarios_auth/${GESTOR_G.uid}`]: revocado[`usuarios_auth/${GESTOR_G.uid}`]!,
    });
    await assertFails(dbDe(GESTOR_G).doc('inmuebles/inm-b1').update({ ciudad: 'Valencia' }));
    await assertFails(dbDe(GESTOR_G).doc('inmuebles/inm-b1').get());
    await assertFails(dbDe(GESTOR_G).doc('inmuebles/inm-revocada').set(ALTA_MINIMA('inm-revocada', 'prop-b')));
    expect((await leerAdmin('inmuebles/inm-b1'))?.ciudad).toBe('Alicante');
  });
});

describe('invariante: update no concede más que get (matriz sujeto × documento)', () => {
  const SUJETOS: Array<[string, SesionSintetica | null]> = [
    ['titular A', TITULAR_A],
    ['titular B', TITULAR_B],
    ['gestor G', GESTOR_G],
    ['lector L', LECTOR_L],
    ['anónimo', null],
  ];
  const DOCUMENTOS = ['inm-a1', 'inm-b1', 'inm-c1', 'inm-no-existe'];

  for (const [etiqueta, sesion] of SUJETOS) {
    for (const id of DOCUMENTOS) {
      it(`${etiqueta} · inmuebles/${id}: si puede escribir, puede leer`, async () => {
        const ref = () => dbDe(sesion).doc(`inmuebles/${id}`);
        const puedeLeer = await permite(() => ref().get());
        const puedeEscribir = await permite(() => ref().update({ ciudad: 'Sintetica' }));
        if (puedeEscribir) expect(puedeLeer).toBe(true);
      });
    }
  }
});

describe('relaciones inmueble–titular (titularidades)', () => {
  it('titular canónico ajusta el porcentaje de su propia relación sin cambiar de titular', async () => {
    await assertSucceeds(dbDe(TITULAR_A).doc('titularidades/inm-a1__prop-a').update({ porcentajeTitularidad: 50 }));
    expect(await leerAdmin('titularidades/inm-a1__prop-a')).toMatchObject({ propietarioId: 'prop-a', porcentajeTitularidad: 50 });
  });

  it('titular NO vincula a un propietario ajeno como titular de su inmueble', async () => {
    await assertFails(dbDe(TITULAR_A).doc('titularidades/inm-a1__prop-b').set({
      id: 'inm-a1__prop-b', inmuebleId: 'inm-a1', propietarioId: 'prop-b',
      porcentajeTitularidad: null, estado: 'VIGENTE', fechaInicio: '2026-10-12T00:00:00.000Z',
    }));
    expect(await leerAdmin('titularidades/inm-a1__prop-b')).toBeUndefined();
  });

  it('gestor NO crea relaciones sobre un inmueble de su cartera con un titular fuera de ella', async () => {
    await assertFails(dbDe(GESTOR_G).doc('titularidades/inm-b1__prop-a').set({
      id: 'inm-b1__prop-a', inmuebleId: 'inm-b1', propietarioId: 'prop-a',
      porcentajeTitularidad: null, estado: 'VIGENTE', fechaInicio: '2026-10-12T00:00:00.000Z',
    }));
  });

  it('titular ajeno NO crea relaciones sobre un inmueble que no es suyo', async () => {
    await assertFails(dbDe(TITULAR_A).doc('titularidades/inm-b1__prop-a').set({
      id: 'inm-b1__prop-a', inmuebleId: 'inm-b1', propietarioId: 'prop-a',
      porcentajeTitularidad: null, estado: 'VIGENTE', fechaInicio: '2026-10-12T00:00:00.000Z',
    }));
  });

  it('la clave del documento debe coincidir con inmueble + titular', async () => {
    await assertFails(dbDe(TITULAR_A).doc('titularidades/clave-incoherente').set({
      id: 'clave-incoherente', inmuebleId: 'inm-a1', propietarioId: 'prop-a',
      porcentajeTitularidad: null, estado: 'VIGENTE', fechaInicio: '2026-10-12T00:00:00.000Z',
    }));
  });

  it('la relación existente no cambia de titular (campos inmutables)', async () => {
    await assertFails(dbDe(TITULAR_A).doc('titularidades/inm-a1__prop-a').update({ propietarioId: 'prop-b' }));
    expect((await leerAdmin('titularidades/inm-a1__prop-a'))?.propietarioId).toBe('prop-a');
  });
});

describe('alta sobre un inmueble existente de otro titular', () => {
  it('reenviar un alta con otro titular sobre un inmueble existente no lo reasigna', async () => {
    await permite(() => dbDe(TITULAR_A).doc('inmuebles/inm-a1').set({ id: 'inm-a1', propietarioId: 'prop-b' }));
    expect((await leerAdmin('inmuebles/inm-a1'))?.propietarioId).toBe('prop-a');
  });
});
