import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { crearEvaluadorReglas } from './harness/firestoreRulesEval';
import { crearEvaluadorStorage } from './harness/storageRulesEval';

// Real service callbacks + optimistic transaction retry + actual Rules text.
// This is NOT the Firebase Emulator: lookup budgets still need the official engine.
const m = vi.hoisted(() => ({
  db: {} as Record<string, any>, seq: 0, version: 0, failure: false, retries: 0,
  actor: { currentUser: { uid: 'master', email: 'sarqsan2.com', emailVerified: true } as any },
  authorize: null as null | ((before: Record<string, any>, after: Record<string, any>, writes: string[]) => void),
}));
vi.mock('../src/lib/firebase', () => ({ auth: m.actor, db: {}, sanitizeObjectForFirestore: (v: unknown) => JSON.parse(JSON.stringify(v)) }));
vi.mock('../src/lib/authService', () => ({ syncAuthIndex: vi.fn() }));
const fb = vi.hoisted(() => ({ signIn: vi.fn(), create: vi.fn(), verify: vi.fn() }));
vi.mock('firebase/auth', () => ({ signInWithEmailAndPassword: fb.signIn, createUserWithEmailAndPassword: fb.create, sendEmailVerification: fb.verify }));
vi.mock('firebase/firestore', () => {
  const snap = (path: string, db = m.db) => ({ id: path.split('/').at(-1)!, exists: () => !!db[path], data: () => db[path] });
  return {
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (...args: any[]) => { const path = args.length === 1 ? `${args[0].path}/a${++m.seq}` : `${args[1]}/${args[2]}`; return { path, id: path.split('/').at(-1) }; },
    where: (field: string, _op: string, val: any) => ({ field, val }),
    query: (col: any, ...filters: any[]) => ({ ...col, filters }),
    getDoc: async (ref: any) => snap(ref.path),
    getDocs: async (ref: any) => {
      const docs = Object.keys(m.db).filter(p => p.startsWith(ref.path + '/') && (ref.filters || []).every((f: any) => m.db[p][f.field] === f.val)).map(p => snap(p));
      return { docs, empty: docs.length === 0 };
    },
    runTransaction: async (_db: unknown, fn: any) => {
      for (let retry = 0; retry < 20; retry++) {
        const version = m.version, before = structuredClone(m.db), after = structuredClone(m.db), writes: string[] = [];
        let writing = false;
        const result = await fn({
          get: async (ref: any) => { if (writing) throw Error('Read after write'); return snap(ref.path, before); },
          set: (ref: any, data: any) => { writing = true; after[ref.path] = data; writes.push(ref.path); },
          update: (ref: any, data: any) => { writing = true; if (!before[ref.path]) throw Error('Missing update'); after[ref.path] = { ...before[ref.path], ...data }; writes.push(ref.path); },
        });
        await new Promise(resolve => setTimeout(resolve, 1));
        if (version !== m.version) { m.retries++; continue; }
        if (m.failure) { m.failure = false; throw Error('Injected network failure'); }
        m.authorize?.(before, after, writes);
        if (writes.length) { m.db = after; m.version++; }
        return result;
      }
      throw Error('Retry limit');
    },
  };
});
import { aceptarOnboardingConCredenciales, invitarCarteraFirestore, prepararOnboardingPropietarioFirestore, resolverInvitacionCarteraFirestore } from '../src/lib/onboardingCarterasFirebase';
import { crearGestion } from '../src/lib/gestionesCartera';
import { proyectarCarterasGestionadas } from '../src/lib/carterasGestion';
const rules = readFileSync('firestore.rules', 'utf8'), storage = readFileSync('storage.rules', 'utf8');
const evaluator = crearEvaluadorReglas(rules).permite;
const storageEval = crearEvaluadorStorage(storage, rules).permiteStorage;
const actorAuth = () => ({ uid: m.actor.currentUser.uid, token: { email: m.actor.currentUser.email, email_verified: m.actor.currentUser.emailVerified } });
const master = () => { m.actor.currentUser = { uid: 'master', email: 'sarqsan2@gmail.com', emailVerified: true }; };
const recipient = () => { m.actor.currentUser = { uid: 'auth-owner', email: 'ana@example.es', emailVerified: true, reload: vi.fn(), getIdToken: vi.fn() }; };
const gestor = () => { m.actor.currentUser = { uid: 'auth-gestor', email: 'gestor@example.es', emailVerified: true }; };
const auditCount = () => Object.keys(m.db).filter(p => p.startsWith('audit_logs/')).length;
const alta = () => prepararOnboardingPropietarioFirestore({ propietarioId: 'o', nombre: 'Ana', email: 'ana@example.es' });
const preparar = async (scope = ['i']) => {
  const r = await alta();
  m.db['usuarios/g'] = { id: 'g', estado: 'ACTIVO', authUid: 'auth-gestor', tipoPerfil: 'PROPIETARIO', roles: ['GESTOR_PATRIMONIAL'], email: 'gestor@example.es' };
  m.db['usuarios_auth/auth-gestor'] = { uid: 'auth-gestor', usuarioId: 'g', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', roles: ['GESTOR_PATRIMONIAL'], email: 'gestor@example.es', propietarioId: '', profesionalId: '', inmuebleIds: [] };
  m.db['inmuebles/i'] = { id: 'i', propietarioId: 'o', descripcion: 'Casa' };
  m.db['inmuebles/otro'] = { id: 'otro', propietarioId: 'o', descripcion: 'Privado' };
  const enlace = await invitarCarteraFirestore({ enlaceId: 'e', propietarioId: 'o', usuarioId: r.usuarioId!, gestorUsuarioId: 'g', inmuebleIds: scope, permiso: 'LECTURA_ESCRITURA' });
  return { r, enlace };
};
const can = (col: string, op: 'get'|'list'|'create'|'update'|'delete', id: string, requestResource: any = null, after = m.db) => evaluator(col, op, {
  auth: actorAuth(), db: m.db, after, timeMs: Date.now(), docId: id, resource: m.db[`${col}/${id}`] || null, requestResource,
});
beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://test.local' } });
  m.db = {}; m.seq = 0; m.version = 0; m.failure = false; m.retries = 0; master(); vi.clearAllMocks();
  m.authorize = (db, after, writes) => {
    for (const path of writes) {
      const [col, docId] = path.split('/');
      const ok = evaluator(col, db[path] ? 'update' : 'create', { auth: actorAuth(), db, after, timeMs: Date.now(), docId, resource: db[path] || null, requestResource: after[path] });
      if (!ok) throw new Error(`Rules denied ${path}`);
    }
  };
});
describe('ROADMAP-02 · onboarding y transacciones verificadas con Rules locales', () => {
  it('alta nueva atómica, Persona inversa, cuenta pending; reintento no duplica ni audita dos veces', async () => {
    const a = await alta(); const n = auditCount();
    expect(await alta()).toEqual(a); expect(auditCount()).toBe(n);
    expect(m.db[`usuarios/${a.usuarioId}`]).toMatchObject({ personaId: a.personaId, estado: 'PENDIENTE', propietarioId: 'o' });
    expect(m.db[`personas/${a.personaId}`]).toMatchObject({ usuarioId: a.usuarioId, propietarioIds: ['o'] });
    expect(m.db[`usuarios/${a.usuarioId}`].authUid).toBeUndefined();
  });
  it('propietario sin cuenta: no Auth/perfil; vinculación posterior reutiliza Persona', async () => {
    const a = await prepararOnboardingPropietarioFirestore({ propietarioId: 'o', nombre: 'Ana', sinCuenta: true });
    expect(Object.keys(m.db).some(p => p.startsWith('usuarios/'))).toBe(false);
    const b = await alta(); expect(b.personaId).toBe(a.personaId);
  });
  it('Persona/cuenta existentes conservan UID y titularidad; otra identidad se rechaza', async () => {
    const a = await alta(); m.db[`usuarios/${a.usuarioId}`].authUid = 'auth-owner'; m.db[`usuarios/${a.usuarioId}`].estado = 'ACTIVO';
    const b = await prepararOnboardingPropietarioFirestore({ propietarioId: 'o', personaId: a.personaId, usuarioId: a.usuarioId, email: 'ana@example.es', nombre: 'No reemplazar' });
    expect(b).toEqual(a); expect(m.db['propietarios/o'].nombre).toBe('Ana');
    await expect(prepararOnboardingPropietarioFirestore({ propietarioId: 'otro', nombre: 'Ana', email: 'ana@example.es' })).rejects.toThrow(/identidad/);
  });
  it('doble alta concurrente serializa identidad por email/owner', async () => {
    const [a, b] = await Promise.all([alta(), alta()]); expect(a).toEqual(b); expect(auditCount()).toBe(1); expect(m.retries).toBeGreaterThan(0);
  });
  it('fallo Firestore deja cero huérfanos y se recupera con los mismos IDs', async () => {
    m.failure = true; await expect(alta()).rejects.toThrow(/network/); expect(m.db).toEqual({}); await alta(); expect(auditCount()).toBe(1);
  });
  it('emisión idempotente y alcance persistido; mismo ID con otro payload no sobrescribe', async () => {
    const { r, enlace } = await preparar(); const n = auditCount();
    const p = { enlaceId: 'e', propietarioId: 'o', usuarioId: r.usuarioId!, gestorUsuarioId: 'g', inmuebleIds: ['i'], permiso: 'LECTURA_ESCRITURA' as const };
    expect((await invitarCarteraFirestore(p)).id).toBe(enlace.id); expect(auditCount()).toBe(n);
    await expect(invitarCarteraFirestore({ ...p, inmuebleIds: [] })).rejects.toThrow(/contenido/);
    await expect(invitarCarteraFirestore({ ...p, enlaceId: 'otra' })).rejects.toThrow(/pendiente/);
  });
  it('reutiliza relación preexistente sin duplicarla ni perder ALTA', async () => {
    const a = await alta();
    const g = crearGestion({ id: 'legacy', propietarioId: 'o', gestorUsuarioId: 'g', tipoGestor: 'GESTOR_PROFESIONAL', propietarioTieneCuenta: true, fecha: new Date().toISOString(), actorId: 'master', permiso: 'LECTURA_ESCRITURA', inmuebleIds: ['i'] });
    if (g.ok === false) throw Error(g.error); m.db['gestiones_cartera/legacy'] = g.gestion;
    await preparar(); expect(m.db['enlaces_registro/e'].gestionId).toBe('legacy');
    expect(Object.keys(m.db).filter(p => p.startsWith('gestiones_cartera/'))).toHaveLength(1);
    expect(m.db['gestiones_cartera/legacy'].eventos.map((e: any) => e.tipo)).toEqual(['ALTA', 'INVITACION']); expect(a.usuarioId).toBeTruthy();
  });
  it('acepta en una transacción: usuario, enlace, relación y auditoría; doble consumo es no-op', async () => {
    const { r } = await preparar(); recipient(); await resolverInvitacionCarteraFirestore('e', 'ACEPTADA');
    expect(m.db[`usuarios/${r.usuarioId}`]).toMatchObject({ estado: 'ACTIVO', authUid: 'auth-owner' });
    expect(m.db['enlaces_registro/e']).toMatchObject({ estadoInvitacion: 'ACEPTADA', usosActuales: 1, activo: false });
    expect(m.db['gestiones_cartera/o~g'].estado).toBe('ACTIVA');
    const n = auditCount(); await resolverInvitacionCarteraFirestore('e', 'ACEPTADA'); expect(auditCount()).toBe(n);
  });
  it('aceptación concurrente consume una vez y conserva todo el histórico', async () => {
    await preparar(); recipient(); const n = auditCount();
    await Promise.all([resolverInvitacionCarteraFirestore('e', 'ACEPTADA'), resolverInvitacionCarteraFirestore('e', 'ACEPTADA')]);
    expect(auditCount()).toBe(n + 1); expect(m.db['gestiones_cartera/o~g'].eventos.map((e: any) => e.tipo)).toEqual(['ALTA', 'INVITACION', 'ACEPTACION']);
  });
  it.each(['RECHAZADA', 'REVOCADA', 'EXPIRADA'] as const)('%s persiste sin acceso, rechaza aceptación posterior; reemisión reutiliza relación', async decision => {
    const { r } = await preparar();
    if (decision === 'EXPIRADA') m.db['enlaces_registro/e'].fechaCaducidadMs = Date.now() - 1;
    if (decision === 'RECHAZADA') recipient();
    await resolverInvitacionCarteraFirestore('e', decision); const n = auditCount();
    await resolverInvitacionCarteraFirestore('e', decision); expect(auditCount()).toBe(n);
    recipient(); await expect(resolverInvitacionCarteraFirestore('e', 'ACEPTADA')).rejects.toThrow(/resuelta/);
    expect(m.db['gestiones_cartera/o~g'].estado).toBe('PENDIENTE_ACEPTACION');
    master(); await invitarCarteraFirestore({ enlaceId: 'e2', usuarioId: r.usuarioId!, propietarioId: 'o', gestorUsuarioId: 'g', inmuebleIds: ['i'], permiso: 'LECTURA_ESCRITURA' });
    expect(m.db['gestiones_cartera/o~g'].enlaceRegistroId).toBe('e2');
  });
  it('carrera aceptación/rechazo: un único estado terminal', async () => {
    await preparar(); recipient(); // master cannot accept as recipient; simulate rejection race (same authenticated actor)
    const result = await Promise.allSettled([resolverInvitacionCarteraFirestore('e', 'ACEPTADA'), resolverInvitacionCarteraFirestore('e', 'RECHAZADA')]);
    expect(result.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(m.db['enlaces_registro/e'].usosActuales).toBe(m.db['enlaces_registro/e'].estadoInvitacion === 'ACEPTADA' ? 1 : 0);
  });
  it('caducidad real deniega aceptar aunque estado siga pending; no expira antes de fecha', async () => {
    await preparar(); await expect(resolverInvitacionCarteraFirestore('e', 'EXPIRADA')).rejects.toThrow(/Caducidad/);
    m.db['enlaces_registro/e'].fechaCaducidadMs = Date.now() - 1; recipient();
    await expect(resolverInvitacionCarteraFirestore('e', 'ACEPTADA')).rejects.toThrow(/Caducidad/);
  });
  it('cuenta ya activa acepta sin cambiar UID/permisos ni reactivar perfil', async () => {
    const { r } = await preparar(); m.db[`usuarios/${r.usuarioId}`].authUid = 'auth-owner'; m.db[`usuarios/${r.usuarioId}`].estado = 'ACTIVO';
    const old = structuredClone(m.db[`usuarios/${r.usuarioId}`]); recipient();
    await resolverInvitacionCarteraFirestore('e', 'ACEPTADA'); expect(m.db[`usuarios/${r.usuarioId}`]).toEqual(old);
  });
  it('Auth creado, Firestore falla: reintentar conserva Auth y completa una sola vez', async () => {
    const { r } = await preparar(); recipient(); const auth = m.actor.currentUser; m.failure = true;
    await expect(aceptarOnboardingConCredenciales('e', 'ana@example.es', 'secret')).rejects.toThrow(/network/);
    expect(m.actor.currentUser).toBe(auth); expect(m.db[`usuarios/${r.usuarioId}`].estado).toBe('PENDIENTE');
    await aceptarOnboardingConCredenciales('e', 'ana@example.es', 'secret'); expect(fb.create).not.toHaveBeenCalled();
    expect(m.db['enlaces_registro/e'].usosActuales).toBe(1);
  });
  it('nuevo Auth exige verificación antes de conceder acceso', async () => {
    await preparar(); m.actor.currentUser = null;
    fb.signIn.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    fb.create.mockImplementationOnce(async () => { recipient(); m.actor.currentUser.emailVerified = false; });
    await expect(aceptarOnboardingConCredenciales('e', 'ana@example.es', 'secret')).rejects.toThrow(/Verifica/);
    expect(fb.verify).toHaveBeenCalledOnce(); expect(m.db['enlaces_registro/e'].usosActuales).toBe(0);
    m.actor.currentUser.emailVerified = true; await aceptarOnboardingConCredenciales('e', 'ana@example.es', 'secret');
    expect(fb.create).toHaveBeenCalledOnce();
  });
  it('email o UID ajenos y correo no verificado no aceptan ni reintentan', async () => {
    const { r } = await preparar(); gestor(); await expect(resolverInvitacionCarteraFirestore('e', 'ACEPTADA')).rejects.toThrow(/Destinatario/);
    recipient(); m.actor.currentUser.emailVerified = false; await expect(resolverInvitacionCarteraFirestore('e', 'ACEPTADA')).rejects.toThrow();
    m.actor.currentUser.emailVerified = true; m.db[`usuarios/${r.usuarioId}`].authUid = 'otro';
    await expect(resolverInvitacionCarteraFirestore('e', 'ACEPTADA')).rejects.toThrow(/UID/);
  });
  it('delegación parcial da get de inmueble, no lista/cartera/otro inmueble ni cambio de titularidad', async () => {
    await preparar(); recipient(); await resolverInvitacionCarteraFirestore('e', 'ACEPTADA'); gestor();
    expect(can('inmuebles', 'get', 'i')).toBe(true); expect(can('inmuebles', 'get', 'otro')).toBe(false);
    expect(can('inmuebles', 'list', 'i')).toBe(false); expect(can('propietarios', 'get', 'o')).toBe(false);
    expect(can('inmuebles', 'update', 'i', { ...m.db['inmuebles/i'], descripcion: 'Nueva' })).toBe(true);
    for (const key of ['propietarioId', 'propietarioPrincipalId', 'contratoActivoId']) expect(can('inmuebles', 'update', 'i', { ...m.db['inmuebles/i'], [key]: 'ajeno' })).toBe(false);
    expect(proyectarCarterasGestionadas([m.db['gestiones_cartera/o~g']], 'g')).toEqual({ carterasL: [], carterasE: [] });
  });
  it.each(['PENDIENTE_ACEPTACION', 'SUSPENDIDA', 'REVOCADA'])('%s anula acceso aunque espejo conserve carteras legacy', async estado => {
    await preparar([]); m.db['gestiones_cartera/o~g'].estado = estado; gestor();
    Object.assign(m.db['usuarios_auth/auth-gestor'], { carterasL: ['o'], carterasE: ['o'] });
    expect(can('inmuebles', 'get', 'i')).toBe(false); expect(can('propietarios', 'get', 'o')).toBe(false);
  });
  it('cartera completa activa permite lectura global; Storage parcial siempre deniega', async () => {
    await preparar([]); recipient(); await resolverInvitacionCarteraFirestore('e', 'ACEPTADA'); gestor();
    expect(can('inmuebles', 'list', 'i')).toBe(true); expect(can('propietarios', 'get', 'o')).toBe(true);
    m.db['gestiones_cartera/o~g'].inmuebleIds = ['i'];
    expect(storageEval('get', { path: 'documentos_propietarios/o/f.pdf', auth: actorAuth(), db: m.db })).toBe(false);
  });
});


describe('ROADMAP-02 · payload adversarial y auditoría', () => {
  it.each(['personaId', 'propietarioId', 'roles', 'isStaff', 'isTenant', 'gestionesPorPropietario', 'carterasL'])('cliente no altera %s', async campo => {
    const { r } = await preparar(); recipient(); await resolverInvitacionCarteraFirestore('e', 'ACEPTADA');
    const u = m.db[`usuarios/${r.usuarioId}`];
    expect(can('usuarios', 'update', r.usuarioId!, { ...u, [campo]: campo === 'roles' || campo === 'carterasL' ? ['ADMINISTRADOR'] : 'ajena' })).toBe(false);
  });
  it('índice de relación no se autoasigna en espejo', async () => {
    await preparar(); gestor(); const before = m.db['usuarios_auth/auth-gestor'];
    expect(can('usuarios_auth', 'update', 'auth-gestor', { ...before, gestionesPorPropietario: { o: 'otra' } })).toBe(false);
  });
  it('sin auditoría atómica no confirma ninguna escritura; actor falso tampoco', async () => {
    await preparar(); recipient(); const db = structuredClone(m.db); await resolverInvitacionCarteraFirestore('e', 'ACEPTADA');
    const after = m.db; m.db = db;
    const aid = after['enlaces_registro/e'].roadmap01AuditId;
    const noAudit = { ...after }; delete noAudit[`audit_logs/${aid}`];
    expect(can('enlaces_registro', 'update', 'e', after['enlaces_registro/e'], noAudit)).toBe(false);
    after[`audit_logs/${aid}`].detalles.actorUid = 'forjado';
    expect(can('enlaces_registro', 'update', 'e', after['enlaces_registro/e'], after)).toBe(false);
  });
  it('consumir enlace sin relación, cambiar ámbito o editar eventos anteriores no pasa Rules', async () => {
    await preparar(); recipient(); const db = structuredClone(m.db); await resolverInvitacionCarteraFirestore('e', 'ACEPTADA');
    const after = structuredClone(m.db); m.db = db;
    expect(can('enlaces_registro', 'update', 'e', after['enlaces_registro/e'], { ...after, 'gestiones_cartera/o~g': db['gestiones_cartera/o~g'] })).toBe(false);
    const g = after['gestiones_cartera/o~g'];
    expect(can('gestiones_cartera', 'update', 'o~g', { ...g, inmuebleIds: [] }, after)).toBe(false);
    const malicious = structuredClone(g); malicious.eventos[0].tipo = 'ACEPTACION';
    expect(can('gestiones_cartera', 'update', 'o~g', malicious, after)).toBe(false);
  });
});

