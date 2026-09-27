/**
 * ORDEN 2 — Servicio `gestiones_cartera`: orquestación sobre puertos dobles.
 *
 * Sin Firebase real: se verifica el contrato con dobles fieles en memoria
 * (clonado en lectura/escritura como Firestore, creación estricta que lanza
 * si el documento existe, transición atómica get→aplicar→set).
 *
 * Cubre del mínimo: alta/consulta/modificación-permisos/revocación,
 * aislamiento por ámbito, resolución propietario/gestor, propietarios sin
 * cuenta, múltiples propietarios/carteras, trazabilidad, anti-acceso-cruzado.
 */
import { describe, expect, it } from 'vitest';
import {
  altaGestionCartera,
  aplicarEventoGestionCartera,
  listarGestionesDeGestor,
  listarGestionesDePropietario,
  obtenerGestion,
  revocarGestionCartera,
  sincronizarEspejoGestor,
  type DependenciasGestionesCartera,
  type EntradaAuditoriaGestiones,
  type ProyeccionEspejo,
  type UsuarioGestionable,
} from '../src/lib/gestionesCarteraServicio';
import type { GestionCartera } from '../src/lib/gestionesCartera';

const T0 = '2026-09-01T10:00:00.000Z';
const T1 = '2026-09-02T10:00:00.000Z';
const T2 = '2026-09-03T10:00:00.000Z';
const ACTOR = { id: 'master_1', email: 'master@erp.es', nombre: 'Master' };

// ---------------------------------------------------------------------------
// Dobles fieles
// ---------------------------------------------------------------------------
interface Dobles extends DependenciasGestionesCartera {
  gestionesDoc: Map<string, GestionCartera>;
  espejoDoc: Map<string, ProyeccionEspejo>;
  auditoriaDoc: EntradaAuditoriaGestiones[];
  propietariosDoc: Set<string>;
  usuariosDoc: Map<string, UsuarioGestionable>;
  fallos: { auditoria: boolean; espejo: boolean };
  llamadas: { existePropietario: number };
}

function crearDobles(): Dobles {
  const d = {} as Dobles;
  d.gestionesDoc = new Map();
  d.espejoDoc = new Map();
  d.auditoriaDoc = [];
  d.propietariosDoc = new Set(['prop_santiago', 'prop_yolanda', 'prop_propia']);
  d.usuariosDoc = new Map<string, UsuarioGestionable>([
    ['usr_gestor', { id: 'usr_gestor', estado: 'ACTIVO', authUid: 'uid_gestor' }],
    ['usr_gprop', { id: 'usr_gprop', estado: 'ACTIVO', propietarioId: 'prop_propia', authUid: 'uid_gprop' }],
    ['usr_titular', { id: 'usr_titular', estado: 'ACTIVO', propietarioId: 'prop_santiago', authUid: 'uid_titular' }],
    ['usr_pend', { id: 'usr_pend', estado: 'PENDIENTE' }],
    ['usr_sinuid', { id: 'usr_sinuid', estado: 'ACTIVO' }],
  ]);
  d.fallos = { auditoria: false, espejo: false };
  d.llamadas = { existePropietario: 0 };
  d.gestiones = {
    async obtenerGestion(id) {
      const g = d.gestionesDoc.get(id);
      return g ? structuredClone(g) : null;
    },
    async crearGestion(g) {
      if (d.gestionesDoc.has(g.id)) throw new Error(`El documento gestiones_cartera/${g.id} ya existe.`);
      d.gestionesDoc.set(g.id, structuredClone(g));
    },
    async aplicarTransicion(id, aplicar) {
      const actual = d.gestionesDoc.get(id);
      if (!actual) throw new Error(`La gestión ${id} no existe.`);
      const confirmada = aplicar(structuredClone(actual));
      d.gestionesDoc.set(id, structuredClone(confirmada));
      return structuredClone(confirmada);
    },
    async listarPorPropietario(pid, estado) {
      return [...d.gestionesDoc.values()]
        .filter((g) => g.propietarioId === pid && (estado === undefined || g.estado === estado))
        .map((g) => structuredClone(g));
    },
    async listarPorGestor(gid, estado) {
      return [...d.gestionesDoc.values()]
        .filter((g) => g.gestorUsuarioId === gid && (estado === undefined || g.estado === estado))
        .map((g) => structuredClone(g));
    },
  };
  d.propietarios = {
    async existePropietario(id) {
      d.llamadas.existePropietario++;
      return d.propietariosDoc.has(id);
    },
  };
  d.usuarios = {
    async obtenerUsuario(id) {
      const u = d.usuariosDoc.get(id);
      return u ? { ...u } : null;
    },
    async buscarUsuarioPorPropietario(pid) {
      for (const u of d.usuariosDoc.values()) {
        if (u.propietarioId === pid) return { ...u };
      }
      return null;
    },
  };
  d.espejo = {
    async leerProyeccion(uid) {
      const p = d.espejoDoc.get(uid);
      return p ? structuredClone(p) : null;
    },
    async escribirProyeccion(uid, proyeccion) {
      if (d.fallos.espejo) throw new Error('espejo caído (inyectado)');
      d.espejoDoc.set(uid, structuredClone(proyeccion));
    },
  };
  d.auditoria = {
    async registrar(entrada) {
      if (d.fallos.auditoria) throw new Error('audit_logs caído (inyectado)');
      d.auditoriaDoc.push(structuredClone(entrada));
    },
  };
  return d;
}

function altaBase(over: Partial<Parameters<typeof altaGestionCartera>[1]> = {}) {
  return {
    id: 'gc_1', propietarioId: 'prop_santiago', gestorUsuarioId: 'usr_gestor',
    tipoGestor: 'GESTOR_PROFESIONAL' as const, fecha: T0, actor: ACTOR, ...over,
  };
}

function okAlta(r: Awaited<ReturnType<typeof altaGestionCartera>>): GestionCartera {
  if (r.ok === false) throw new Error(`esperado ok (${r.fase}): ${r.error}`);
  return r.gestion;
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------
describe('gestiones-cartera · servicio — alta', () => {
  it('T1 · propietario SIN cuenta: alta no bloqueada, espejo y auditoría', async () => {
    const d = crearDobles();
    const g = okAlta(await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda' })));
    expect(g.estado).toBe('PENDIENTE_ACEPTACION');
    expect(g.requiereAceptacion).toBe(false);
    expect(g.permiso).toBe('LECTURA'); // escritura nunca automática (S7)
    expect(d.auditoriaDoc).toHaveLength(1);
    expect(d.auditoriaDoc[0]).toMatchObject({
      accion: 'GESTION_ALTA', entidadAfectada: 'gestion_cartera', idAfectado: 'gc_1', resultado: 'EXITO',
    });
  });
  it('T2 · propietario CON cuenta: requiere aceptación; ciclo aceptación→ACTIVA', async () => {
    const d = crearDobles();
    const g = okAlta(await altaGestionCartera(d, altaBase()));
    expect(g.requiereAceptacion).toBe(true);
    const sinAceptar = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'ACTIVACION', fecha: T1, actor: ACTOR,
    });
    expect(sinAceptar.ok).toBe(false);
    const aceptada = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'ACEPTACION', fecha: T1, actor: ACTOR,
      coherenciaActor: { esMaster: false }, actorIdDominio: 'usr_titular',
    });
    if (aceptada.ok === false) throw new Error(aceptada.error);
    expect(aceptada.gestion.estado).toBe('ACTIVA');
    expect(aceptada.gestion.aceptada?.por).toBe('usr_titular');
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: ['prop_santiago'], carterasE: [] });
  });
  it('T3 · gestor propietario coherente ok; incoherente rechazado (asignación)', async () => {
    const d = crearDobles();
    const ok = await altaGestionCartera(
      d, altaBase({ id: 'gc_gp', gestorUsuarioId: 'usr_gprop', tipoGestor: 'PROPIETARIO_GESTOR', propietarioId: 'prop_yolanda' })
    );
    expect(ok.ok).toBe(true);
    const ko = await altaGestionCartera(
      d, altaBase({ id: 'gc_gp2', gestorUsuarioId: 'usr_gestor', tipoGestor: 'PROPIETARIO_GESTOR', propietarioId: 'prop_yolanda' })
    );
    expect(ko.ok).toBe(false);
    if (ko.ok === false) expect(ko.fase).toBe('VALIDACION');
  });
  it('T4 · gestor profesional coherente ok; con propietarioId rechazado', async () => {
    const d = crearDobles();
    const ko = await altaGestionCartera(
      d, altaBase({ id: 'gc_x', gestorUsuarioId: 'usr_gprop', tipoGestor: 'GESTOR_PROFESIONAL', propietarioId: 'prop_yolanda' })
    );
    expect(ko.ok).toBe(false);
  });
  it('T5 · autogestión rechazada', async () => {
    const d = crearDobles();
    const r = await altaGestionCartera(
      d, altaBase({ gestorUsuarioId: 'usr_gprop', tipoGestor: 'PROPIETARIO_GESTOR', propietarioId: 'prop_propia' })
    );
    expect(r.ok).toBe(false);
  });
  it('T6 · par duplicado rechazado; tras REVOCADA se permite nueva (múltiples en el tiempo)', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase()));
    const dup = await altaGestionCartera(d, altaBase({ id: 'gc_2' }));
    expect(dup.ok).toBe(false);
    const rev = await revocarGestionCartera(d, {
      gestionId: 'gc_1', fecha: T1, actor: ACTOR, conservarLecturaHistorica: false,
      coherenciaActor: { esMaster: true },
    });
    if (rev.ok === false) throw new Error(rev.error);
    expect(rev.gestion.estado).toBe('REVOCADA');
    okAlta(await altaGestionCartera(d, altaBase({ id: 'gc_2' })));
  });
  it('T7 · gestor inexistente o no ACTIVO rechazado', async () => {
    const d = crearDobles();
    expect((await altaGestionCartera(d, altaBase({ gestorUsuarioId: 'nope' }))).ok).toBe(false);
    expect((await altaGestionCartera(d, altaBase({ gestorUsuarioId: 'usr_pend' }))).ok).toBe(false);
  });
  it('T8 · destino vacío o inexistente rechazado (nunca deducido)', async () => {
    const d = crearDobles();
    expect((await altaGestionCartera(d, altaBase({ propietarioId: '' }))).ok).toBe(false);
    expect((await altaGestionCartera(d, altaBase({ propietarioId: 'prop_fantasma' }))).ok).toBe(false);
  });
  it('T9 · id duplicado: creación estricta falla en PERSISTENCIA (sin sobrescribir)', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase()));
    const r = await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda' }));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.fase).toBe('PERSISTENCIA');
    expect((await obtenerGestion(d, 'gc_1'))?.propietarioId).toBe('prop_santiago');
  });
  it('T10 · fecha inválida rechazada en DOMINIO', async () => {
    const d = crearDobles();
    const r = await altaGestionCartera(d, altaBase({ fecha: 'no-fecha' }));
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.fase).toBe('DOMINIO');
  });
});

// ---------------------------------------------------------------------------
// Transiciones, permisos, revocación, espejo
// ---------------------------------------------------------------------------
describe('gestiones-cartera · servicio — transiciones y espejo', () => {
  it('T11 · cambio de permisos L→L/E actualiza espejo E + audita', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda' })));
    const act = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'ACTIVACION', fecha: T1, actor: ACTOR, coherenciaActor: { esMaster: true },
    });
    if (act.ok === false) throw new Error(act.error);
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: ['prop_yolanda'], carterasE: [] });
    const perm = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'CAMBIO_PERMISOS', permiso: 'LECTURA_ESCRITURA', fecha: T2,
      actor: ACTOR, coherenciaActor: { esMaster: true },
    });
    if (perm.ok === false) throw new Error(perm.error);
    expect(perm.gestion.permiso).toBe('LECTURA_ESCRITURA');
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: ['prop_yolanda'], carterasE: ['prop_yolanda'] });
    expect(d.auditoriaDoc.map((a) => a.accion)).toContain('GESTION_PERMISO_MODIFICADO');
  });
  it('T12 · suspensión vacía espejo; reactivación restaura (S5)', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda', permiso: 'LECTURA_ESCRITURA' })));
    await aplicarEventoGestionCartera(d, { gestionId: 'gc_1', tipo: 'ACTIVACION', fecha: T1, actor: ACTOR });
    await aplicarEventoGestionCartera(d, { gestionId: 'gc_1', tipo: 'SUSPENSION', fecha: T2, actor: ACTOR });
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: [], carterasE: [] });
    const re = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'REACTIVACION', fecha: '2026-09-04T10:00:00.000Z', actor: ACTOR,
    });
    if (re.ok === false) throw new Error(re.error);
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: ['prop_yolanda'], carterasE: ['prop_yolanda'] });
  });
  it('T13 · revocación S7: sin conservar vacía; conservando deja solo L; terminal', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda', permiso: 'LECTURA_ESCRITURA' })));
    await aplicarEventoGestionCartera(d, { gestionId: 'gc_1', tipo: 'ACTIVACION', fecha: T1, actor: ACTOR });
    const rev = await revocarGestionCartera(d, {
      gestionId: 'gc_1', fecha: T2, actor: ACTOR, conservarLecturaHistorica: true,
      coherenciaActor: { esMaster: true },
    });
    if (rev.ok === false) throw new Error(rev.error);
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: ['prop_yolanda'], carterasE: [] });
    expect(d.auditoriaDoc.map((a) => a.accion)).toContain('GESTION_REVOCADA');
    const post = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'REACTIVACION', fecha: '2026-09-05T10:00:00.000Z', actor: ACTOR,
    });
    expect(post.ok).toBe(false);
  });
  it('T14 · revocar exige conservarLecturaHistorica explícito', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda' })));
    const r = await revocarGestionCartera(d, {
      gestionId: 'gc_1', fecha: T1, actor: ACTOR,
      conservarLecturaHistorica: undefined as unknown as boolean,
    });
    expect(r.ok).toBe(false);
  });
  it('T15 · cesión por gestor / devolución por titular; ajeno rechazado', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ permiso: 'LECTURA_ESCRITURA' })));
    await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'ACEPTACION', fecha: T1, actor: ACTOR,
      coherenciaActor: { esMaster: false }, actorIdDominio: 'usr_titular',
    });
    const ces = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'CESION', fecha: T2, actor: ACTOR,
      coherenciaActor: { esMaster: false }, actorIdDominio: 'usr_gestor',
    });
    if (ces.ok === false) throw new Error(ces.error);
    expect(ces.gestion.responsableActual).toBe('TITULAR');
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: ['prop_santiago'], carterasE: [] });
    const ajena = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'DEVOLUCION', fecha: '2026-09-04T10:00:00.000Z', actor: ACTOR,
      coherenciaActor: { esMaster: false }, actorIdDominio: 'usr_gestor',
    });
    expect(ajena.ok).toBe(false);
    const dev = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'DEVOLUCION', fecha: '2026-09-04T10:00:00.000Z', actor: ACTOR,
      coherenciaActor: { esMaster: false }, actorIdDominio: 'usr_titular',
    });
    if (dev.ok === false) throw new Error(dev.error);
    expect(dev.gestion.responsableActual).toBe('GESTOR');
  });
  it('T16 · aceptación por NO titular rechazada (coherencia S4)', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase()));
    const r = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'ACEPTACION', fecha: T1, actor: ACTOR,
      coherenciaActor: { esMaster: false }, actorIdDominio: 'usr_gestor',
    });
    expect(r.ok).toBe(false);
  });
  it('T17 · fallo de persistencia en transición: PERSISTENCIA, doc intacto, sin auditoría de éxito', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda' })));
    const rotas: DependenciasGestionesCartera = {
      ...d,
      gestiones: {
        ...d.gestiones,
        async aplicarTransicion() {
          throw new Error('transacción abortada (inyectado)');
        },
      },
    };
    const antes = d.auditoriaDoc.length;
    const r2 = await aplicarEventoGestionCartera(rotas, {
      gestionId: 'gc_1', tipo: 'ACTIVACION', fecha: T1, actor: ACTOR,
    });
    expect(r2.ok).toBe(false);
    if (r2.ok === false) expect(r2.fase).toBe('PERSISTENCIA');
    expect((await obtenerGestion(d, 'gc_1'))?.estado).toBe('PENDIENTE_ACEPTACION');
    expect(d.auditoriaDoc.length).toBe(antes); // sin éxito tras fallo
  });
  it('T18 · fallo de auditoría degrada explícito (ok + advertencia)', async () => {
    const d = crearDobles();
    d.fallos.auditoria = true;
    const r = await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda' }));
    if (r.ok === false) throw new Error(r.error);
    expect(r.advertencias.join(' ')).toMatch(/AUDITORIA_DEGRADADA/);
    expect(d.auditoriaDoc).toHaveLength(0);
  });
  it('T19 · espejo: gestor sin Auth se omite explícito; fallo de espejo → ESPEJO_PENDIENTE', async () => {
    const d = crearDobles();
    // Gestor ACTIVO sin authUid: documento confirmado + advertencia explícita.
    d.usuariosDoc.set('usr_gestor', { id: 'usr_gestor', estado: 'ACTIVO' });
    const r1 = await altaGestionCartera(d, altaBase({ propietarioId: 'prop_yolanda' }));
    if (r1.ok === false) throw new Error(r1.error);
    expect(r1.advertencias.join(' ')).toMatch(/ESPEJO_OMITIDO/);
    // Fallo de escritura del espejo: ok + ESPEJO_PENDIENTE (reparable).
    d.usuariosDoc.set('usr_gestor', { id: 'usr_gestor', estado: 'ACTIVO', authUid: 'uid_gestor' });
    d.fallos.espejo = true;
    const r2 = await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'ACTIVACION', fecha: T1, actor: ACTOR,
    });
    if (r2.ok === false) throw new Error(r2.error);
    expect(r2.advertencias.join(' ')).toMatch(/ESPEJO_PENDIENTE/);
    d.fallos.espejo = false;
    const rep = await sincronizarEspejoGestor(d, 'usr_gestor');
    expect(rep.ok).toBe(true);
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: ['prop_yolanda'], carterasE: [] });
  });
  it('T20 · sync recomputa desde TODAS las gestiones (múltiples carteras) e idempotente', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ id: 'gc_a', propietarioId: 'prop_yolanda', permiso: 'LECTURA_ESCRITURA' })));
    okAlta(await altaGestionCartera(d, altaBase({ id: 'gc_b', permiso: 'LECTURA_ESCRITURA' })));
    await aplicarEventoGestionCartera(d, { gestionId: 'gc_a', tipo: 'ACTIVACION', fecha: T1, actor: ACTOR });
    await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_b', tipo: 'ACEPTACION', fecha: T1, actor: ACTOR,
      coherenciaActor: { esMaster: false }, actorIdDominio: 'usr_titular',
    });
    const r = await sincronizarEspejoGestor(d, 'usr_gestor');
    if (r.ok === false) throw new Error(r.error);
    expect([...r.proyeccion.carterasL].sort()).toEqual(['prop_santiago', 'prop_yolanda']);
    expect([...r.proyeccion.carterasE].sort()).toEqual(['prop_santiago', 'prop_yolanda']);
    const r2 = await sincronizarEspejoGestor(d, 'usr_gestor');
    expect(r2).toEqual(r);
    // Revocar una cartera la saca del espejo sin tocar la otra (aislamiento).
    await revocarGestionCartera(d, {
      gestionId: 'gc_a', fecha: T2, actor: ACTOR, conservarLecturaHistorica: false,
    });
    expect(d.espejoDoc.get('uid_gestor')).toEqual({ carterasL: ['prop_santiago'], carterasE: ['prop_santiago'] });
  });
});

// ---------------------------------------------------------------------------
// Consulta acotada y aislamiento
// ---------------------------------------------------------------------------
describe('gestiones-cartera · servicio — consulta', () => {
  it('T21 · listados acotados por cartera/gestor (+ estado); sin ámbito rechazados', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ id: 'gc_a', propietarioId: 'prop_yolanda' })));
    okAlta(await altaGestionCartera(d, altaBase({ id: 'gc_b', propietarioId: 'prop_santiago' })));
    const porCartera = await listarGestionesDePropietario(d, 'prop_yolanda');
    if (porCartera.ok === false) throw new Error(porCartera.error);
    expect(porCartera.gestiones.map((g) => g.id)).toEqual(['gc_a']);
    const porGestor = await listarGestionesDeGestor(d, 'usr_gestor', 'PENDIENTE_ACEPTACION');
    if (porGestor.ok === false) throw new Error(porGestor.error);
    expect(porGestor.gestiones).toHaveLength(2);
    expect((await listarGestionesDePropietario(d, '')).ok).toBe(false);
    expect((await listarGestionesDeGestor(d, '')).ok).toBe(false);
  });
  it('T22 · anti-acceso-cruzado: cada cartera solo ve lo suyo', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase({ id: 'gc_a', propietarioId: 'prop_yolanda' })));
    const ajena = await listarGestionesDePropietario(d, 'prop_santiago');
    if (ajena.ok === false) throw new Error(ajena.error);
    expect(ajena.gestiones).toHaveLength(0);
    const gestorAjeno = await listarGestionesDeGestor(d, 'usr_gprop');
    if (gestorAjeno.ok === false) throw new Error(gestorAjeno.error);
    expect(gestorAjeno.gestiones).toHaveLength(0);
  });
  it('T23 · el servicio no escribe propietarios ni inmuebles (titularidad intacta)', async () => {
    const d = crearDobles();
    okAlta(await altaGestionCartera(d, altaBase()));
    await aplicarEventoGestionCartera(d, {
      gestionId: 'gc_1', tipo: 'ACEPTACION', fecha: T1, actor: ACTOR,
      coherenciaActor: { esMaster: false }, actorIdDominio: 'usr_titular',
    });
    // El puerto de propietarios SOLO expone lectura de existencia (estructural).
    expect(Object.keys(d.propietarios).sort()).toEqual(['existePropietario']);
    expect(d.llamadas.existePropietario).toBeGreaterThan(0);
    expect('inmuebles' in d).toBe(false);
  });
});
