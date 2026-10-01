/**
 * Diagnóstico «Lectura · Carteras» — el evaluador del cliente REPRODUCE la regla.
 * ---------------------------------------------------------------------------
 * El veredicto de `src/lib/diagnosticoCarteras.ts` solo vale si dice lo mismo que
 * `firestore.rules`. Este test lo comprueba de dos maneras independientes:
 *
 *  1. EQUIVALENCIA EXHAUSTIVA: para las 1024 combinaciones de estado de sesión,
 *     espejo, ficha y valor de la consulta, el evaluador del cliente (con lo que
 *     observaría leyendo SUS dos documentos) coincide con lo que decide el texto
 *     real de la regla para `list` de `gestiones_cartera` (evaluador del repo).
 *  2. PINES DE FUENTE: si cambia el texto de `perfilActualVeraz`,
 *     `gestionInvolucraAMi` o el `allow list`, este test falla y obliga a revisar
 *     el diagnóstico antes de fiarse de él.
 *
 * Limitación declarada: el evaluador del repo trabaja documento a documento; no es
 * el planificador de consultas de Google (no hay emulador en este entorno).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ayudaUsuarioDeCausa,
  causaDeDenegacion,
  construirInformeCarteras,
  EXPLICACION_CAUSA,
  type CausaCarteras,
  esIdValido,
  evaluarComprobacionesCarteras,
  reglaDelGestorSeCumple,
  resumenEspejo,
  resumenPerfil,
  type LecturaDocumento,
  type ObservacionDocumentos,
} from '../src/lib/diagnosticoCarteras';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';

const RULES = readFileSync(resolve(__dirname, '..', 'firestore.rules'), 'utf8');
const EVAL = crearEvaluadorReglas(RULES);
const { permite } = EVAL;
const norm = (t: string) => t.replace(/\s+/g, ' ').trim();

type Doc = Record<string, unknown>;

// ---------------------------------------------------------------------------
// 1 · EQUIVALENCIA EXHAUSTIVA
// ---------------------------------------------------------------------------
const UID = 'uid_p';
const PERFIL = 'usr_p';
const OTRO = 'usr_otro';

interface Variante {
  sesion: boolean;
  /** `sin_doc`: no hay espejo; `sin_usuarioId`: espejo sin id de perfil; `perfil`/`otro`: a qué ficha apunta. */
  espejo: 'sin_doc' | 'sin_usuarioId' | 'perfil' | 'otro';
  estadoEspejo: 'ACTIVO' | 'INACTIVO';
  fichaExiste: boolean;
  /** `ausente_con_invitacion`: ficha sin enlazar pero legible por su invitación activa (alta por invitación). */
  authUidFicha: 'uid' | 'otro' | 'ausente' | 'ausente_con_invitacion';
  estadoFicha: 'ACTIVO' | 'PENDIENTE';
  tipoIgual: boolean;
  consulta: 'perfil' | 'otro';
}

function construir(v: Variante): { db: Record<string, Doc>; valorConsulta: string } {
  const db: Record<string, Doc> = {};
  const idEspejo = v.espejo === 'perfil' ? PERFIL : v.espejo === 'otro' ? OTRO : undefined;
  if (v.espejo !== 'sin_doc') {
    db[`usuarios_auth/${UID}`] = {
      uid: UID, email: 'p@test.local', tipoPerfil: 'PROPIETARIO', estado: v.estadoEspejo, roles: [],
      propietarioId: 'prop_1', profesionalId: '', inmuebleIds: [],
      ...(idEspejo ? { usuarioId: idEspejo } : {}),
    };
  }
  // La ficha vive donde apunte el espejo (o en PERFIL si el espejo no apunta a ninguna).
  const idFicha = idEspejo ?? PERFIL;
  if (v.fichaExiste) {
    db[`usuarios/${idFicha}`] = {
      id: idFicha, email: 'p@test.local', estado: v.estadoFicha, roles: [],
      tipoPerfil: v.tipoIgual ? 'PROPIETARIO' : 'PROFESIONAL',
      ...(v.authUidFicha === 'uid' ? { authUid: UID } : v.authUidFicha === 'otro' ? { authUid: 'uid_de_otra_persona' } : {}),
      ...(v.authUidFicha === 'ausente_con_invitacion' ? { enlaceRegistroId: 'enl_1' } : {}),
    };
    if (v.authUidFicha === 'ausente_con_invitacion') {
      db['enlaces_registro/enl_1'] = { id: 'enl_1', usuarioIdVinculado: idFicha, emailInvitado: 'p@test.local', activo: true };
    }
  }
  return { db, valorConsulta: v.consulta === 'perfil' ? PERFIL : OTRO };
}

const peticion = (db: Record<string, Doc>, sesion: boolean, resource: Doc | null, docId: string): Peticion => ({
  auth: sesion ? { uid: UID, token: { email: 'p@test.local', email_verified: true } } : null,
  db, resource, requestResource: null, docId,
});

/** Lo que el cliente observaría leyendo SUS dos documentos (con las reglas reales del `get`). */
function observar(db: Record<string, Doc>, sesion: boolean): ObservacionDocumentos {
  const leer = (coleccion: string, id: string): LecturaDocumento => {
    const d = db[`${coleccion}/${id}`] ?? null;
    let permitido = false;
    try { permitido = permite(coleccion, 'get', peticion(db, sesion, d, id)); } catch { permitido = false; }
    if (!permitido) return { estado: 'DENEGADA' };
    return d ? { estado: 'EXISTE', datos: d } : { estado: 'NO_EXISTE' };
  };
  const espejo = sesion ? leer('usuarios_auth', UID) : null;
  const idEspejo = espejo && espejo.estado === 'EXISTE' ? espejo.datos.usuarioId : undefined;
  const perfil = esIdValido(idEspejo) ? leer('usuarios', idEspejo) : null;
  return { espejo, perfil };
}

function* variantes(): Generator<Variante> {
  for (const sesion of [true, false])
    for (const espejo of ['sin_doc', 'sin_usuarioId', 'perfil', 'otro'] as const)
      for (const estadoEspejo of ['ACTIVO', 'INACTIVO'] as const)
        for (const fichaExiste of [true, false])
          for (const authUidFicha of ['uid', 'otro', 'ausente', 'ausente_con_invitacion'] as const)
            for (const estadoFicha of ['ACTIVO', 'PENDIENTE'] as const)
              for (const tipoIgual of [true, false])
                for (const consulta of ['perfil', 'otro'] as const)
                  yield { sesion, espejo, estadoEspejo, fichaExiste, authUidFicha, estadoFicha, tipoIgual, consulta };
}

describe('Carteras · diagnóstico — equivalencia con firestore.rules', () => {
  it('el evaluador del cliente decide EXACTAMENTE lo que decide la regla `list` de gestiones_cartera (1024 combinaciones)', () => {
    let total = 0;
    let autorizadas = 0;
    const discrepancias: string[] = [];
    for (const v of variantes()) {
      total++;
      const { db, valorConsulta } = construir(v);
      // Documento representante: solo lo que fija la consulta (`gestorUsuarioId == valor`).
      const regla = permite('gestiones_cartera', 'list', peticion(db, v.sesion, { gestorUsuarioId: valorConsulta }, 'x'));
      const cliente = reglaDelGestorSeCumple(
        evaluarComprobacionesCarteras({ authUid: v.sesion ? UID : null, gestorUsuarioId: valorConsulta }, observar(db, v.sesion))
      );
      if (regla) autorizadas++;
      if (regla !== cliente) discrepancias.push(`${JSON.stringify(v)} → regla=${regla} cliente=${cliente}`);
    }
    expect(total).toBe(1024);
    expect(discrepancias).toEqual([]);
    // Sanity: la matriz no es un test vacío. Solo los 2 estados PLENAMENTE coherentes
    // (espejo y ficha apuntándose entre sí, activos, del mismo tipo, y la consulta pidiendo
    // el usuarioId del espejo) autorizan la consulta; los otros 1022 se deniegan.
    expect(autorizadas).toBe(2);
  }, 120_000);

  it('con la ficha en `usuarios/{authUid}` (id de perfil = UID de Auth) también coinciden', () => {
    const db: Record<string, Doc> = {
      [`usuarios_auth/${UID}`]: { uid: UID, usuarioId: UID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', roles: [], propietarioId: 'p', profesionalId: '', inmuebleIds: [] },
      [`usuarios/${UID}`]: { id: UID, authUid: UID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', roles: [] },
    };
    for (const consulta of [UID, 'otro']) {
      const regla = permite('gestiones_cartera', 'list', peticion(db, true, { gestorUsuarioId: consulta }, 'x'));
      const cliente = reglaDelGestorSeCumple(evaluarComprobacionesCarteras({ authUid: UID, gestorUsuarioId: consulta }, observar(db, true)));
      expect(cliente).toBe(regla);
      expect(regla).toBe(consulta === UID);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 · PINES DE FUENTE: si la regla cambia, el diagnóstico debe revisarse
// ---------------------------------------------------------------------------
describe('Carteras · diagnóstico — pines sobre el texto de firestore.rules', () => {
  const funciones = EVAL.funcionesDe(EVAL.cuerpoRaiz());
  const cuerpo = (nombre: string) => norm(funciones.get(nombre)?.cuerpo ?? '');

  it('perfilActualVeraz() exige exactamente los términos que reproduce el diagnóstico', () => {
    const c = cuerpo('perfilActualVeraz');
    for (const termino of [
      'isSignedIn()',
      'exists(/databases/$(database)/documents/usuarios_auth/$(request.auth.uid))',
      'isValidId(me().usuarioId)',
      'exists(/databases/$(database)/documents/usuarios/$(me().usuarioId))',
      "me().estado == 'ACTIVO'",
      'get(/databases/$(database)/documents/usuarios/$(me().usuarioId)).data.authUid == request.auth.uid',
      "get(/databases/$(database)/documents/usuarios/$(me().usuarioId)).data.estado == 'ACTIVO'",
      'get(/databases/$(database)/documents/usuarios/$(me().usuarioId)).data.tipoPerfil == me().tipoPerfil',
    ]) {
      expect(c, `perfilActualVeraz ya no contiene: ${termino}`).toContain(termino);
    }
    // Y nada más: ocho términos, ocho comprobaciones.
    expect(c.split('&&').length).toBe(8);
  });

  it("gestionInvolucraAMi() autoriza al gestor por `gestorUsuarioId == me().usuarioId` y al titular por `propietarioId`", () => {
    const c = cuerpo('gestionInvolucraAMi');
    expect(c).toContain("('gestorUsuarioId' in d && 'usuarioId' in me() && d.gestorUsuarioId == me().usuarioId)");
    expect(c).toContain("(isPropietarioRole() && 'propietarioId' in d && d.propietarioId == myPropId())");
    expect(c.startsWith('return activeUser() &&')).toBe(true);
  });

  it('activeUser() ES perfilActualVeraz() y `me()` es el espejo del propio UID', () => {
    expect(cuerpo('activeUser')).toContain('return perfilActualVeraz();');
    expect(cuerpo('me')).toBe('return get(/databases/$(database)/documents/usuarios_auth/$(request.auth.uid)).data;');
  });

  it('el espejo lo lee su titular y la regla `list` de gestiones no se ha ampliado', () => {
    const espejo = norm(EVAL.bloqueDe('usuarios_auth'));
    expect(espejo).toContain('allow read: if isMasterAdmin() || (isSignedIn() && request.auth.uid == uid);');
    const gestiones = norm(EVAL.bloqueDe('gestiones_cartera'));
    expect(gestiones).toContain('allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);');
    expect(gestiones).toContain('allow create: if isMasterAdmin()');
    expect(gestiones).toContain('allow delete: if false;');
  });
});

// ---------------------------------------------------------------------------
// 3 · LÓGICA PURA DEL VEREDICTO
// ---------------------------------------------------------------------------
const espejoOk = (extra: Doc = {}): LecturaDocumento => ({
  estado: 'EXISTE',
  datos: { usuarioId: PERFIL, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', email: 'secreto@test.local', ...extra },
});
const perfilOk = (extra: Doc = {}): LecturaDocumento => ({
  estado: 'EXISTE',
  datos: { authUid: UID, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', email: 'secreto@test.local', nombre: 'Nombre Secreto', ...extra },
});

describe('Carteras · diagnóstico — veredicto', () => {
  const ctx = { authUid: UID, gestorUsuarioId: PERFIL };

  it('estado completo y coherente ⇒ todas las comprobaciones OK', () => {
    const c = evaluarComprobacionesCarteras(ctx, { espejo: espejoOk(), perfil: perfilOk() });
    expect(c.map((x) => x.ok)).toEqual(Array(c.length).fill(true));
    expect(reglaDelGestorSeCumple(c)).toBe(true);
  });

  it('se señala el PRIMER término que falla, en el orden de la regla', () => {
    const sinEspejo = evaluarComprobacionesCarteras(ctx, { espejo: { estado: 'NO_EXISTE' }, perfil: null });
    expect(causaDeDenegacion(sinEspejo, 'DENEGADO')).toBe('ESPEJO_AUSENTE');
    // Los términos dependientes quedan «no evaluables» (null), no falsamente «fallidos».
    expect(sinEspejo.filter((c) => c.ok === null).length).toBeGreaterThan(0);

    const variasFallas = evaluarComprobacionesCarteras(ctx, {
      espejo: espejoOk({ estado: 'INACTIVO' }),
      perfil: perfilOk({ estado: 'PENDIENTE' }),
    });
    expect(causaDeDenegacion(variasFallas, 'DENEGADO')).toBe('ESPEJO_NO_ACTIVO');
  });

  it('un reintento autorizado manda sobre cualquier otro indicio (TRANSITORIA)', () => {
    const c = evaluarComprobacionesCarteras(ctx, { espejo: { estado: 'NO_EXISTE' }, perfil: null });
    expect(causaDeDenegacion(c, 'OK')).toBe('TRANSITORIA');
  });

  it('todo cumplido + reintento denegado ⇒ el cliente NO afirma causa: reglas publicadas o planificador', () => {
    const c = evaluarComprobacionesCarteras(ctx, { espejo: espejoOk(), perfil: perfilOk() });
    expect(causaDeDenegacion(c, 'DENEGADO')).toBe('REGLAS_PUBLICADAS_O_PLANIFICADOR');
  });

  it('un error que no es de permisos deja el veredicto INCONCLUSO (no inventa causa)', () => {
    const conErrorDeRed = evaluarComprobacionesCarteras(ctx, { espejo: { estado: 'ERROR', codigo: 'unavailable' }, perfil: null });
    expect(causaDeDenegacion(conErrorDeRed, 'ERROR:unavailable')).toBe('INCONCLUSA');
    const todoBienPeroReintentoCaido = evaluarComprobacionesCarteras(ctx, { espejo: espejoOk(), perfil: perfilOk() });
    expect(causaDeDenegacion(todoBienPeroReintentoCaido, 'ERROR:unavailable')).toBe('INCONCLUSA');
  });

  it('isValidId reproduce la regla: cadena de 1 a 128 caracteres', () => {
    expect(esIdValido('a')).toBe(true);
    expect(esIdValido('x'.repeat(128))).toBe(true);
    expect(esIdValido('x'.repeat(129))).toBe(false);
    expect(esIdValido('')).toBe(false);
    expect(esIdValido(undefined)).toBe(false);
    expect(esIdValido(42)).toBe(false);
  });

  it('los resúmenes del espejo y de la ficha NO incluyen correo, nombre ni otros campos', () => {
    const e = JSON.stringify(resumenEspejo(espejoOk({ gestionesPorPropietario: { p1: 'g1', p2: 'g2' }, carterasL: ['a'], carterasE: [] })));
    const p = JSON.stringify(resumenPerfil(perfilOk()));
    for (const crudo of [e, p]) {
      expect(crudo).not.toContain('secreto@test.local');
      expect(crudo).not.toContain('Nombre Secreto');
    }
    expect(JSON.parse(e)).toMatchObject({ entradasIndiceGestiones: 2, carterasL: 1, carterasE: 0, usuarioId: PERFIL });
    expect(JSON.parse(p)).toEqual({ lectura: 'EXISTE', authUid: UID, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' });
  });

  it('el informe completo es serializable y lleva consulta, causa y lectura en español', () => {
    const informe = construirInformeCarteras({
      ctx: {
        authUid: UID, gestorUsuarioId: PERFIL, tipoPerfil: 'PROPIETARIO', roles: [], motivo: 'inicio',
        proyecto: 'proyecto-x', baseDeDatos: 'base-x',
      },
      codigoError: 'permission-denied',
      observacion: { espejo: espejoOk(), perfil: perfilOk() },
      reintento: 'DENEGADO',
      momento: '2026-10-01T12:00:00.000Z',
    });
    expect(() => JSON.stringify(informe)).not.toThrow();
    expect(informe.consulta).toBe(`gestiones_cartera where gestorUsuarioId == '${PERFIL}'`);
    expect(informe.causa).toBe('REGLAS_PUBLICADAS_O_PLANIFICADOR');
    expect(informe.lectura).toMatch(/Siguiente paso: comparar las reglas publicadas/);
    expect(informe.comprobaciones.length).toBe(10);
    // Dice DÓNDE comparar las reglas publicadas: el proyecto y la base REALES de esta compilación.
    expect(informe).toMatchObject({ proyecto: 'proyecto-x', baseDeDatos: 'base-x' });
    expect(informe.dondeComprobarReglas).toContain('proyecto «proyecto-x»');
    expect(informe.dondeComprobarReglas).toContain('base de datos «base-x»');
  });
});

// ---------------------------------------------------------------------------
// 4 · DESTINO DE LA PUBLICACIÓN DE LAS REGLAS
// ---------------------------------------------------------------------------
describe('Carteras · diagnóstico — a qué base de datos publica `firebase.json` las reglas', () => {
  const RAIZ = resolve(__dirname, '..');
  const firebaseJson = JSON.parse(readFileSync(resolve(RAIZ, 'firebase.json'), 'utf8'));
  const config = JSON.parse(readFileSync(resolve(RAIZ, 'firebase-applet-config.json'), 'utf8'));

  it('`firebase.json` publica `firestore.rules` en la MISMA base de datos que usa la aplicación', () => {
    const destinos = Array.isArray(firebaseJson.firestore) ? firebaseJson.firestore : [firebaseJson.firestore];
    const destino = destinos.find((d: { rules?: string }) => d.rules === 'firestore.rules');
    expect(destino, 'firebase.json no publica firestore.rules').toBeTruthy();
    expect(destino.database).toBe(config.firestoreDatabaseId);
  });

  it('el entorno que muestra y registra la aplicación sale de esa misma configuración', async () => {
    const { FIREBASE_PROYECTO_ID, FIREBASE_BASE_DATOS_ID } = await import('../src/lib/entornoFirebase');
    expect(FIREBASE_PROYECTO_ID).toBe(config.projectId);
    expect(FIREBASE_BASE_DATOS_ID).toBe(config.firestoreDatabaseId);
  });
});

// ---------------------------------------------------------------------------
// 4 · Qué le dice el aviso a la PERSONA cuando la denegación es real
// ---------------------------------------------------------------------------
describe('Carteras · diagnóstico — ayuda para la persona (aviso)', () => {
  const todas = Object.keys(EXPLICACION_CAUSA) as CausaCarteras[];

  it('toda causa REAL tiene una ayuda con su código; las que se recuperan solas o se resuelven leyendo por relación, ninguna', () => {
    const sinAviso: CausaCarteras[] = ['TRANSITORIA', 'SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA'];
    for (const causa of todas) {
      const ayuda = ayudaUsuarioDeCausa(causa);
      if (sinAviso.includes(causa)) {
        expect(ayuda, causa).toBeUndefined();
      } else {
        expect(ayuda, causa).toBeTruthy();
        expect(ayuda).toContain(`Código de diagnóstico: ${causa}.`);
      }
    }
  });

  it('el consejo se corresponde con la causa: sesión, perfil desincronizado o reglas publicadas', () => {
    expect(ayudaUsuarioDeCausa('SIN_SESION_FIREBASE')).toMatch(/Cierra sesión y vuelve a entrar/);
    for (const c of ['ESPEJO_AUSENTE', 'ESPEJO_NO_ACTIVO', 'PERFIL_AUTHUID_DISTINTO', 'PERFIL_NO_ACTIVO', 'CONSULTA_DISTINTA_DEL_ESPEJO'] as CausaCarteras[]) {
      expect(ayudaUsuarioDeCausa(c), c).toMatch(/no están sincronizados/);
    }
    for (const c of ['REGLAS_PUBLICADAS_O_PLANIFICADOR', 'ESPEJO_ILEGIBLE_POR_SU_TITULAR'] as CausaCarteras[]) {
      expect(ayudaUsuarioDeCausa(c), c).toMatch(/reglas de seguridad publicadas en Firebase/);
    }
    expect(ayudaUsuarioDeCausa('INCONCLUSA')).toMatch(/Reintenta/);
  });

  it('las ayudas no llevan correo, nombre ni identificadores: son textos fijos', () => {
    for (const causa of todas) {
      const ayuda = ayudaUsuarioDeCausa(causa) ?? '';
      expect(ayuda).not.toMatch(/@|usr_|uid_|prop_/);
    }
  });
});
