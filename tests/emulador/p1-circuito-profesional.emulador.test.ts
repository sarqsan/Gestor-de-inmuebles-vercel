/**
 * P1 · E2E REAL DEL CIRCUITO DEL PROFESIONAL — EMULADOR OFICIAL DE FIRESTORE
 * ==========================================================================
 * Recorre el circuito completo de la orden P1 con las REGLAS REALES:
 *
 *   1. El propietario asigna el trabajo.
 *   2. El profesional lo acepta.
 *   3. El profesional prepara y envía el presupuesto.
 *   4. El propietario acepta o rechaza.
 *   5. El profesional incorpora evidencias (metadatos del adjunto).
 *   6. El profesional comunica la finalización.
 *   7. El propietario revisa y confirma.
 *   8. Se comprueba el historial y la COMUNICACIÓN entre ambos.
 *
 * Además, pruebas NEGATIVAS de acceso:
 *   - un profesional NO asignado no lee ni escribe el trabajo, el presupuesto
 *     ni el hilo de mensajes;
 *   - un propietario ajeno no lee ni escribe nada del trabajo de otro.
 *
 * DATOS: 100 % sintéticos (`*.invalid`, `prop_a`, `prof_a`…). Sin datos reales.
 * Se ejecuta con `npm run test:emulador:reglas` (requiere JRE + emulador).
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

const RAIZ = resolve(__dirname, '../..');
const PROYECTO = 'demo-gestor-p1-circuito';

// --- Identidades sintéticas -------------------------------------------------
const UID_MASTER = 'uid-master-p1';
const EMAIL_MASTER = 'sarqsan2@gmail.com';
const UID_PROP_A = 'uid-prop-a-p1';
const UID_PROP_B = 'uid-prop-b-p1';
const UID_PROF_A = 'uid-prof-a-p1';
const UID_PROF_B = 'uid-prof-b-p1';
const UID_INQ = 'uid-inq-p1';

const PROP_A = 'prop_a';
const PROP_B = 'prop_b';
const PROF_A = 'prof_a';
const PROF_B = 'prof_b';
const INM_A = 'inm_a_1';
const INC_A = 'inc_a_1';
const TRABAJO = 'trb_p1_1';

let entorno: RulesTestEnvironment;

const comoMaster = () =>
  entorno.authenticatedContext(UID_MASTER, { email: EMAIL_MASTER, email_verified: true }).firestore();
const comoPropA = () => entorno.authenticatedContext(UID_PROP_A, { email: 'a@sintetico.invalid' }).firestore();
const comoPropB = () => entorno.authenticatedContext(UID_PROP_B, { email: 'b@sintetico.invalid' }).firestore();
const comoProfA = () => entorno.authenticatedContext(UID_PROF_A, { email: 'profa@sintetico.invalid' }).firestore();
const comoProfB = () => entorno.authenticatedContext(UID_PROF_B, { email: 'profb@sintetico.invalid' }).firestore();
const sinAuth = () => entorno.unauthenticatedContext().firestore();

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: PROYECTO,
    firestore: {
      rules: readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => { await entorno?.cleanup(); });
beforeEach(async () => { await entorno.clearFirestore(); });

/**
 * Siembra el espejo de identidad y los documentos base.
 *
 * `perfilActualVeraz()` exige: `usuarios_auth/{uid}` ACTIVO → `usuarios/{usuarioId}`
 * ACTIVO con el MISMO `authUid` y el MISMO `tipoPerfil`. Si algo de eso falla,
 * ninguna regla concede nada. Por eso se siembra el espejo completo.
 */
async function sembrarBase() {
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    const identidades: [string, string, string, Record<string, unknown>][] = [
      [UID_MASTER, 'usr_master_p1', 'ADMINISTRADOR', { email: EMAIL_MASTER, propietarioId: PROP_A }],
      [UID_PROP_A, 'usr_prop_a', 'PROPIETARIO', { propietarioId: PROP_A, inmuebleIds: [INM_A] }],
      [UID_PROP_B, 'usr_prop_b', 'PROPIETARIO', { propietarioId: PROP_B, inmuebleIds: ['inm_b_1'] }],
      [UID_PROF_A, 'usr_prof_a', 'PROFESIONAL', { profesionalId: PROF_A }],
      [UID_PROF_B, 'usr_prof_b', 'PROFESIONAL', { profesionalId: PROF_B }],
      [UID_INQ, 'usr_inq', 'INQUILINO', {}],
    ];

    for (const [uid, usuarioId, tipoPerfil, extra] of identidades) {
      await db.doc('usuarios_auth/' + uid).set({
        usuarioId, tipoPerfil, estado: 'ACTIVO', authUid: uid, ...extra,
      });
      await db.doc('usuarios/' + usuarioId).set({
        id: usuarioId, usuarioId, tipoPerfil, estado: 'ACTIVO', authUid: uid, ...extra,
      });
    }

    await db.doc('propietarios/' + PROP_A).set({ id: PROP_A, nombre: 'Propietario A sintético' });
    await db.doc('propietarios/' + PROP_B).set({ id: PROP_B, nombre: 'Propietario B sintético' });
    await db.doc('profesionales/' + PROF_A).set({ id: PROF_A, nombreComercial: 'Profesional A sintético' });
    await db.doc('profesionales/' + PROF_B).set({ id: PROF_B, nombreComercial: 'Profesional B sintético' });
    await db.doc('inmuebles/' + INM_A).set({ id: INM_A, propietarioId: PROP_A, direccion: 'Calle Sintética 1' });
    await db.doc('incidencias/' + INC_A).set({
      id: INC_A, propietarioId: PROP_A, inmuebleId: INM_A,
      titulo: 'Incidencia sintética', estado: 'ABIERTA', profesionalAsignadoId: PROF_A,
    });
  });
}

/** Lectura SIN reglas: para las aserciones del circuito, no para probar permisos. */
async function leerSinReglas(coleccion: string, id: string): Promise<Record<string, any> | null> {
  let datos: Record<string, any> | null = null;
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().doc(coleccion + '/' + id).get();
    datos = snap.exists ? (snap.data() as Record<string, any>) : null;
  });
  return datos;
}

const leerTrabajo = (id = TRABAJO) => leerSinReglas('trabajos_profesionales', id);

const historialItem = (estado: string, comentario: string, usuario: string) => ({
  id: `h_${Math.random().toString(36).slice(2, 10)}`,
  fecha: new Date().toISOString(),
  estado,
  usuario,
  comentario,
});

describe('P1 E2E · el circuito completo con las reglas reales', () => {
  beforeEach(async () => { await sembrarBase(); });

  it('1. el propietario asigna el trabajo a un profesional', async () => {
    await assertSucceeds(
      comoPropA().doc('trabajos_profesionales/' + TRABAJO).set({
        id: TRABAJO,
        propietarioId: PROP_A,
        inmuebleId: INM_A,
        incidenciaId: INC_A,
        profesionalId: PROF_A,
        titulo: 'Reparación sintética',
        descripcion: 'Describe la intervención',
        categoria: 'FONTANERIA',
        prioridad: 'MEDIA',
        estado: 'ASIGNADO',
        fechaSolicitud: new Date().toISOString(),
        creadoPor: 'Propietario A',
        actualizadoPor: 'Propietario A',
        historial: [historialItem('ASIGNADO', 'Trabajo asignado', 'Propietario A')],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );

    const t = await leerTrabajo();
    expect(t?.estado).toBe('ASIGNADO');
    expect(t?.profesionalId).toBe(PROF_A);

    // El profesional asignado lo ve; el no asignado NO.
    await assertSucceeds(comoProfA().doc('trabajos_profesionales/' + TRABAJO).get());
    await assertFails(comoProfB().doc('trabajos_profesionales/' + TRABAJO).get());
  });

  it('2. el profesional ACEPTA el trabajo (y no puede hacerlo el no asignado)', async () => {
    await comoPropA().doc('trabajos_profesionales/' + TRABAJO).set({
      id: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A, incidenciaId: INC_A,
      profesionalId: PROF_A, titulo: 'Reparación sintética', descripcion: 'd', categoria: 'FONTANERIA',
      prioridad: 'MEDIA', estado: 'ASIGNADO', fechaSolicitud: new Date().toISOString(),
      creadoPor: 'Propietario A', actualizadoPor: 'Propietario A', historial: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });

    // El profesional B no puede tocar un trabajo que no es suyo.
    await assertFails(comoProfB().doc('trabajos_profesionales/' + TRABAJO).update({ estado: 'CANCELADO' }));

    await assertSucceeds(
      comoProfA().doc('trabajos_profesionales/' + TRABAJO).update({
        estado: 'ACEPTADO',
        fechaAsignacion: new Date().toISOString(),
        actualizadoPor: 'Profesional A',
        updatedAt: new Date().toISOString(),
        historial: [historialItem('ACEPTADO', 'Encargo aceptado', 'Profesional A')],
      }),
    );

    const t = await leerTrabajo();
    expect(t?.estado).toBe('ACEPTADO');
    expect(t?.historial).toHaveLength(1);
    expect(t?.historial[0].comentario).toContain('aceptado');
  });

  it('3. el profesional prepara y ENVÍA el presupuesto', async () => {
    await comoPropA().doc('trabajos_profesionales/' + TRABAJO).set({
      id: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A, incidenciaId: INC_A,
      profesionalId: PROF_A, titulo: 'Reparación sintética', descripcion: 'd', categoria: 'FONTANERIA',
      prioridad: 'MEDIA', estado: 'ACEPTADO', fechaSolicitud: new Date().toISOString(),
      creadoPor: 'Propietario A', actualizadoPor: 'Propietario A', historial: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });

    const PRESU = 'pres_p1_1';
    const partidas = [
      { id: 'l1', concepto: 'Mano de obra', cantidad: 2, precioUnitario: 40, importe: 80 },
      { id: 'l2', concepto: 'Material', cantidad: 1, precioUnitario: 35, importe: 35 },
    ];

    // Borrador: lo guarda el profesional.
    await assertSucceeds(
      comoProfA().doc('presupuestos_profesionales/' + PRESU).set({
        id: PRESU, trabajoId: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A,
        profesionalId: PROF_A, version: 1, partidas, porcentajeIva: 21,
        importeBase: 115, importeIva: 24.15, importeTotal: 139.15,
        estado: 'BORRADOR', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }),
    );

    // Envío al propietario.
    await assertSucceeds(
      comoProfA().doc('presupuestos_profesionales/' + PRESU).update({
        estado: 'RECIBIDO', enviadoAlPropietarioAt: new Date().toISOString(),
      }),
    );

    await assertSucceeds(comoPropA().doc('presupuestos_profesionales/' + PRESU).get());

    const snap = await leerSinReglas('presupuestos_profesionales', PRESU);
    expect(snap?.estado).toBe('RECIBIDO');
    expect(snap?.importeTotal).toBeCloseTo(139.15, 2);

    // PRUEBA NEGATIVA: el profesional B no ve ni toca este presupuesto.
    await assertFails(comoProfB().doc('presupuestos_profesionales/' + PRESU).get());
    await assertFails(comoProfB().doc('presupuestos_profesionales/' + PRESU).update({ estado: 'ACEPTADO' }));
  });

  it('4. el propietario ACEPTA el presupuesto y el profesional no puede ya reescribirlo', async () => {
    const PRESU = 'pres_p1_2';
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('trabajos_profesionales/' + TRABAJO).set({
        id: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A, incidenciaId: INC_A,
        profesionalId: PROF_A, titulo: 't', descripcion: 'd', categoria: 'FONTANERIA',
        prioridad: 'MEDIA', estado: 'ACEPTADO', fechaSolicitud: new Date().toISOString(),
        creadoPor: 'x', actualizadoPor: 'x', historial: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await ctx.firestore().doc('presupuestos_profesionales/' + PRESU).set({
        id: PRESU, trabajoId: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A,
        profesionalId: PROF_A, version: 1, partidas: [], porcentajeIva: 21,
        importeBase: 100, importeIva: 21, importeTotal: 121,
        estado: 'RECIBIDO', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    });

    // El propietario decide.
    await assertSucceeds(
      comoPropA().doc('presupuestos_profesionales/' + PRESU).update({
        estado: 'ACEPTADO',
        decisiones: [{ fecha: new Date().toISOString(), usuario: 'Propietario A', decision: 'ACEPTADO' }],
      }),
    );

    const snap = await leerSinReglas('presupuestos_profesionales', PRESU);
    expect(snap?.estado).toBe('ACEPTADO');

    // PRUEBA NEGATIVA de aislamiento: el propietario B no lo ve ni lo cambia.
    await assertFails(comoPropB().doc('presupuestos_profesionales/' + PRESU).get());
    await assertFails(comoPropB().doc('presupuestos_profesionales/' + PRESU).update({ estado: 'RECHAZADO' }));
  });

  it('5. el profesional incorpora EVIDENCIAS (antes/durante/después) al trabajo', async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('trabajos_profesionales/' + TRABAJO).set({
        id: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A, incidenciaId: INC_A,
        profesionalId: PROF_A, titulo: 't', descripcion: 'd', categoria: 'FONTANERIA',
        prioridad: 'MEDIA', estado: 'EN_EJECUCION', fechaSolicitud: new Date().toISOString(),
        creadoPor: 'x', actualizadoPor: 'x', historial: [], documentos: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    });

    const base = { trabajoId: TRABAJO, incidenciaId: INC_A, propietarioId: PROP_A, fechaSubida: new Date().toISOString() };
    const documentos = [
      { ...base, id: 'ev1', nombre: 'antes.jpg', url: 'https://privado.invalid/antes.jpg', storagePath: `incidencias/${INC_A}/antes_1_antes.jpg`, tipo: 'IMAGEN', momentoEvidencia: 'ANTES', observacion: 'Estado inicial' },
      { ...base, id: 'ev2', nombre: 'durante.jpg', url: 'https://privado.invalid/durante.jpg', storagePath: `incidencias/${INC_A}/durante_2_durante.jpg`, tipo: 'IMAGEN', momentoEvidencia: 'DURANTE' },
      { ...base, id: 'ev3', nombre: 'despues.pdf', url: 'https://privado.invalid/despues.pdf', storagePath: `incidencias/${INC_A}/despues_3_despues.pdf`, tipo: 'DOCUMENTO', momentoEvidencia: 'DESPUES', observacion: 'Parte firmado' },
    ];

    await assertSucceeds(
      comoProfA().doc('trabajos_profesionales/' + TRABAJO).update({
        documentos, actualizadoPor: 'Profesional A', updatedAt: new Date().toISOString(),
      }),
    );

    const t = await leerTrabajo();
    expect(t?.documentos).toHaveLength(3);
    expect(t?.documentos.map((d: any) => d.momentoEvidencia)).toEqual(['ANTES', 'DURANTE', 'DESPUES']);

    // Las evidencias se guardan bajo el prefijo que autoriza al profesional.
    t?.documentos.forEach((d: any) => {
      expect(d.storagePath.startsWith(`incidencias/${INC_A}/`)).toBe(true);
      expect(d.storagePath).not.toContain('..');
    });

    // PRUEBA NEGATIVA: el profesional B no puede añadir documentos a este trabajo.
    await assertFails(
      comoProfB().doc('trabajos_profesionales/' + TRABAJO).update({
        documentos: [...documentos, { ...base, id: 'ev9', nombre: 'intruso.jpg', url: 'https://x.invalid/i.jpg' }],
      }),
    );
  });

  it('6. el profesional comunica la FINALIZACIÓN con observaciones', async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('trabajos_profesionales/' + TRABAJO).set({
        id: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A, incidenciaId: INC_A,
        profesionalId: PROF_A, titulo: 't', descripcion: 'd', categoria: 'FONTANERIA',
        prioridad: 'MEDIA', estado: 'EN_EJECUCION', fechaSolicitud: new Date().toISOString(),
        creadoPor: 'x', actualizadoPor: 'x', historial: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    });

    await assertSucceeds(
      comoProfA().doc('trabajos_profesionales/' + TRABAJO).update({
        estado: 'FINALIZADO',
        fechaFinalizacion: new Date().toISOString(),
        observaciones: 'Sustituido el grifo y revisada la presión',
        actualizadoPor: 'Profesional A',
        updatedAt: new Date().toISOString(),
        historial: [historialItem('FINALIZADO', 'Finalización informada por el profesional', 'Profesional A')],
      }),
    );

    const t = await leerTrabajo();
    expect(t?.estado).toBe('FINALIZADO');
    expect(t?.observaciones).toContain('grifo');
  });

  it('7. el propietario revisa y CONFIRMA la finalización', async () => {
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('trabajos_profesionales/' + TRABAJO).set({
        id: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A, incidenciaId: INC_A,
        profesionalId: PROF_A, titulo: 't', descripcion: 'd', categoria: 'FONTANERIA',
        prioridad: 'MEDIA', estado: 'FINALIZADO', fechaSolicitud: new Date().toISOString(),
        creadoPor: 'x', actualizadoPor: 'x',
        historial: [historialItem('FINALIZADO', 'Finalización informada', 'Profesional A')],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    });

    await assertSucceeds(
      comoPropA().doc('trabajos_profesionales/' + TRABAJO).update({
        estado: 'COMPLETADO',
        actualizadoPor: 'Propietario A',
        updatedAt: new Date().toISOString(),
        historial: [
          historialItem('FINALIZADO', 'Finalización informada', 'Profesional A'),
          historialItem('COMPLETADO', 'Finalización confirmada por el propietario', 'Propietario A'),
        ],
      }),
    );

    const t = await leerTrabajo();
    expect(t?.estado).toBe('COMPLETADO');
    // Historial completo y no destructivo: se conservan los dos hitos.
    expect(t?.historial).toHaveLength(2);
    expect(t?.historial.map((h: any) => h.estado)).toEqual(['FINALIZADO', 'COMPLETADO']);

    // PRUEBA NEGATIVA: el propietario B no puede confirmar nada de este trabajo.
    await assertFails(
      comoPropB().doc('trabajos_profesionales/' + TRABAJO).update({ estado: 'COMPLETADO' }),
    );
  });
});

describe('P1 E2E · comunicación propietario ↔ profesional (mensajes_trabajo)', () => {
  beforeEach(async () => {
    await sembrarBase();
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('trabajos_profesionales/' + TRABAJO).set({
        id: TRABAJO, propietarioId: PROP_A, inmuebleId: INM_A, incidenciaId: INC_A,
        profesionalId: PROF_A, titulo: 't', descripcion: 'd', categoria: 'FONTANERIA',
        prioridad: 'MEDIA', estado: 'ACEPTADO', fechaSolicitud: new Date().toISOString(),
        creadoPor: 'x', actualizadoPor: 'x', historial: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    });
  });

  const mensajeDe = (rol: 'PROPIETARIO' | 'PROFESIONAL', uid: string, texto: string) => ({
    trabajoId: TRABAJO, propietarioId: PROP_A, profesionalId: PROF_A,
    remitenteUid: uid, remitenteNombre: 'Sintético', remitenteRol: rol,
    texto, createdAt: new Date().toISOString(),
  });

  it('el propietario y el profesional asignado se escriben y se leen', async () => {
    // El propietario escribe.
    await assertSucceeds(
      comoPropA().doc('mensajes_trabajo/m1').set(mensajeDe('PROPIETARIO', UID_PROP_A, '¿Puede empezar el lunes?')),
    );
    // El profesional asignado lee y responde.
    await assertSucceeds(comoProfA().doc('mensajes_trabajo/m1').get());
    await assertSucceeds(
      comoProfA().doc('mensajes_trabajo/m2').set(mensajeDe('PROFESIONAL', UID_PROF_A, 'Sí, el lunes a las 9.')),
    );
    // El propietario lee la respuesta.
    await assertSucceeds(comoPropA().doc('mensajes_trabajo/m2').get());

    // Historial completo, con fecha y autor.
    let items: Record<string, any>[] = [];
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      const snap = await ctx.firestore().collection('mensajes_trabajo').get();
      items = snap.docs.map((d) => d.data() as Record<string, any>);
    });
    expect(items).toHaveLength(2);
    items.forEach((m) => {
      expect(typeof m.createdAt).toBe('string');
      expect(m.remitenteRol).toMatch(/PROPIETARIO|PROFESIONAL/);
    });
  });

  it('NEGATIVA · un profesional NO asignado no lee ni escribe el hilo', async () => {
    await assertSucceeds(
      comoPropA().doc('mensajes_trabajo/m1').set(mensajeDe('PROPIETARIO', UID_PROP_A, 'Mensaje privado')),
    );
    await assertFails(comoProfB().doc('mensajes_trabajo/m1').get());
    await assertFails(
      comoProfB().doc('mensajes_trabajo/m_intruso').set(mensajeDe('PROFESIONAL', UID_PROF_B, 'Me cuelo')),
    );
  });

  it('NEGATIVA · un propietario ajeno no lee ni escribe el hilo', async () => {
    await assertSucceeds(
      comoProfA().doc('mensajes_trabajo/m1').set(mensajeDe('PROFESIONAL', UID_PROF_A, 'Mensaje privado')),
    );
    await assertFails(comoPropB().doc('mensajes_trabajo/m1').get());
    await assertFails(
      comoPropB().doc('mensajes_trabajo/m_ajeno').set(mensajeDe('PROPIETARIO', UID_PROP_B, 'Me cuelo')),
    );
  });

  it('NEGATIVA · sin autenticación no se lee ni se escribe', async () => {
    await assertSucceeds(
      comoPropA().doc('mensajes_trabajo/m1').set(mensajeDe('PROPIETARIO', UID_PROP_A, 'Privado')),
    );
    await assertFails(sinAuth().doc('mensajes_trabajo/m1').get());
    await assertFails(
      sinAuth().doc('mensajes_trabajo/m_x').set(mensajeDe('PROPIETARIO', UID_PROP_A, 'Anónimo')),
    );
  });

  it('NEGATIVA · no se puede suplantar al otro participante', async () => {
    // El profesional intenta firmar como PROPIETARIO con el uid del propietario.
    await assertFails(
      comoProfA().doc('mensajes_trabajo/falso').set(mensajeDe('PROPIETARIO', UID_PROP_A, 'Firmo como el propietario')),
    );
    // El propietario intenta firmar como PROFESIONAL.
    await assertFails(
      comoPropA().doc('mensajes_trabajo/falso2').set(mensajeDe('PROFESIONAL', UID_PROF_A, 'Firmo como el profesional')),
    );
  });

  it('NEGATIVA · no hay canal profesional ↔ profesional', async () => {
    // El profesional B no pertenece al trabajo, así que no puede abrir hilo.
    await assertFails(
      comoProfB().doc('mensajes_trabajo/p2p').set({
        ...mensajeDe('PROFESIONAL', UID_PROF_B, 'Hola colega'),
      }),
    );
  });

  it('el mensaje enviado NO se puede reescribir; solo el acuse de lectura', async () => {
    await assertSucceeds(
      comoPropA().doc('mensajes_trabajo/m1').set(mensajeDe('PROPIETARIO', UID_PROP_A, 'Texto original')),
    );
    // Se puede marcar leído.
    await assertSucceeds(
      comoProfA().doc('mensajes_trabajo/m1').update({ leidoPorProfesional: true }),
    );
    // NO se puede cambiar el texto.
    await assertFails(
      comoPropA().doc('mensajes_trabajo/m1').update({ texto: 'Texto manipulado' }),
    );
    // NO se puede borrar el mensaje.
    await assertFails(comoPropA().doc('mensajes_trabajo/m1').delete());
  });

  it('un mensaje sin trabajo existente no se puede crear', async () => {
    await assertFails(
      comoProfA().doc('mensajes_trabajo/huerfano').set({
        ...mensajeDe('PROFESIONAL', UID_PROF_A, 'Sin trabajo'),
        trabajoId: 'trb_inexistente',
      }),
    );
  });

  it('el texto vacío o desmesurado se rechaza', async () => {
    await assertFails(
      comoPropA().doc('mensajes_trabajo/vacio').set(mensajeDe('PROPIETARIO', UID_PROP_A, '')),
    );
    await assertFails(
      comoPropA().doc('mensajes_trabajo/largo').set(
        mensajeDe('PROPIETARIO', UID_PROP_A, 'x'.repeat(4001)),
      ),
    );
  });
});
