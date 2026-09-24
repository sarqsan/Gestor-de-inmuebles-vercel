/**
 * ACCESO-PROPIETARIOS — Alta nominal de propietarios (11 casos).
 * Suite auto-contenida:
 *  1-7. Validador puro de la invitación nominal (un solo uso, caducidad,
 *       perfil, vínculos, email invitado).
 *  8. Builders puros (prefill del alta + invitación nominal).
 *  9. Rama vinculada de `registerWithInvitationLink` (Firestore/Auth
 *     mockeados): activa el pendiente, sin crear usuario ni propietario,
 *     consume la invitación y crea el espejo de identidad.
 * 10. `getUsuarioByAuthUid` resuelve vía `usuarios_auth` sin consultas
 *     globales (denegadas por reglas a no-administradores).
 * 11. Tripwires textuales de `firestore.rules` (activación PENDIENTE→ACTIVO
 *     con binding de email; vetos y Bloque E intactos).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks Firestore / Auth / lib (mínimo para authService)
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const docCalls: Array<{ col: string; id: string }> = [];
  const setCalls: Array<{ col: string; id: string }> = [];
  const updateCalls: Array<{ col: string; id: string; data: unknown }> = [];
  return { store, docCalls, setCalls, updateCalls, getDocsCalls: 0, denyQueries: false };
});

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => {
    mem.docCalls.push({ col, id });
    return { __col: col, __id: id };
  },
  collection: (_db: unknown, col: string) => ({ __col: col }),
  getDoc: async (r: { __col: string; __id: string }) => {
    const v = mem.store.get(`${r.__col}/${r.__id}`);
    return {
      exists: () => v !== undefined,
      data: () => v,
      id: r.__id,
    };
  },
  setDoc: async (r: { __col: string; __id: string }, data: unknown) => {
    mem.setCalls.push({ col: r.__col, id: r.__id });
    mem.store.set(`${r.__col}/${r.__id}`, data);
  },
  updateDoc: async (r: { __col: string; __id: string }, data: Record<string, unknown>) => {
    mem.updateCalls.push({ col: r.__col, id: r.__id, data });
    const prev = (mem.store.get(`${r.__col}/${r.__id}`) as Record<string, unknown>) || {};
    mem.store.set(`${r.__col}/${r.__id}`, { ...prev, ...data });
  },
  deleteDoc: async () => {},
  query: (...args: unknown[]) => ({ __q: args }),
  where: (f: string, op: string, v: unknown) => ({ f, op, v }),
  getDocs: async () => {
    mem.getDocsCalls += 1;
    if (mem.denyQueries) throw new Error('permission-denied');
    return { empty: true, docs: [] };
  },
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: async (_a: unknown, email: string) => ({
    user: { uid: 'uid_nuevo_1', email },
  }),
  signInWithEmailAndPassword: async () => {
    throw new Error('login no cubierto en esta suite');
  },
  signOut: async () => {},
  onAuthStateChanged: () => () => {},
  updateProfile: async () => {},
}));

const libm = vi.hoisted(() => ({ audits: [] as Array<Record<string, unknown>> }));

vi.mock('../src/lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  USUARIOS_COL: { __col: 'usuarios' },
  ENLACES_REGISTRO_COL: { __col: 'enlaces_registro' },
  saveAuditLogFirestore: async (a: Record<string, unknown>) => {
    libm.audits.push(a);
  },
}));

import {
  buildInvitacionNominalPropietario,
  buildPrefillUsuarioDesdePropietario,
  esInvitacionNominalPropietario,
  validarActivacionPendiente,
  validarInvitacionPropietario,
} from '../src/lib/accesoPropietarios';
import { getUsuarioByAuthUid, registerWithInvitationLink } from '../src/lib/authService';
import type { EnlaceRegistro, Propietario, UsuarioApp } from '../src/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PENDIENTE: UsuarioApp = {
  id: 'user_pend_1',
  nombre: 'Carmen Ruiz',
  email: 'prop@test.es',
  telefono: '+34600000000',
  tipoPerfil: 'PROPIETARIO',
  estado: 'PENDIENTE',
  roles: ['PROPIETARIO_ESTANDAR'],
  permisos: ['ver_inmuebles'],
  inmuebleIds: ['inm_1'],
  propietarioId: 'prop_1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const FICHA_REAL: Propietario = {
  id: 'prop_1',
  nombre: 'Carmen Ruiz',
  nifCif: '12345678Z',
  email: 'prop@test.es',
  telefono: '+34600000000',
  direccion: 'Calle Real 10',
  ciudad: 'Almería',
  codigoPostal: '04001',
  tipoPropietario: 'persona_fisica',
  cuentasBancarias: [],
  fechaCreacion: '2026-09-01T00:00:00.000Z',
  fechaActualizacion: '2026-09-01T00:00:00.000Z',
};

const NOMINAL: EnlaceRegistro = {
  id: 'enl_1',
  token: 'prop_ab12cd34',
  tipoPerfil: 'PROPIETARIO',
  textoVisible: '🔑 Activa tu cuenta de propietario',
  activo: true,
  fechaCaducidad: '2026-12-31T00:00:00.000Z',
  usosMaximos: 1,
  usosActuales: 0,
  creadoPor: 'admin',
  createdAt: '2026-09-20T00:00:00.000Z',
  propietarioIdVinculado: 'prop_1',
  usuarioIdVinculado: 'user_pend_1',
  emailInvitado: 'prop@test.es',
};

const AHORA = '2026-09-24T12:00:00.000Z';

function sembrarFlujoNominal() {
  mem.store.set('usuarios/user_pend_1', { ...PENDIENTE });
  mem.store.set('propietarios/prop_1', { ...FICHA_REAL });
  mem.store.set('enlaces_registro/enl_1', { ...NOMINAL });
}

beforeEach(() => {
  mem.store.clear();
  mem.docCalls.length = 0;
  mem.setCalls.length = 0;
  mem.updateCalls.length = 0;
  mem.getDocsCalls = 0;
  mem.denyQueries = false;
  libm.audits.length = 0;
});

// ---------------------------------------------------------------------------
// 1-7. Validador puro de la invitación nominal
// ---------------------------------------------------------------------------
describe('validarInvitacionPropietario', () => {
  it('1. acepta la invitación nominal válida', () => {
    expect(esInvitacionNominalPropietario(NOMINAL)).toBe(true);
    const v = validarInvitacionPropietario(NOMINAL, 'prop@test.es', AHORA);
    expect(v.ok).toBe(true);
    expect(v.errores).toEqual([]);
  });

  it('2. rechaza la invitación desactivada', () => {
    const v = validarInvitacionPropietario({ ...NOMINAL, activo: false }, 'prop@test.es', AHORA);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/desactivada/);
  });

  it('3. rechaza la invitación caducada', () => {
    const v = validarInvitacionPropietario(
      { ...NOMINAL, fechaCaducidad: '2026-09-01T00:00:00.000Z' },
      'prop@test.es',
      AHORA
    );
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/caducad/);
  });

  it('4. rechaza la invitación de un solo uso ya consumida', () => {
    const v = validarInvitacionPropietario({ ...NOMINAL, usosActuales: 1 }, 'prop@test.es', AHORA);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/solo uso|utilizada/);
  });

  it('5. rechaza invitaciones de otro perfil', () => {
    const v = validarInvitacionPropietario(
      { ...NOMINAL, tipoPerfil: 'PROFESIONAL' },
      'prop@test.es',
      AHORA
    );
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/propietario/);
  });

  it('6. rechaza invitaciones sin vínculos nominales', () => {
    const sinUsuario = validarInvitacionPropietario(
      { ...NOMINAL, usuarioIdVinculado: undefined },
      'prop@test.es',
      AHORA
    );
    expect(sinUsuario.ok).toBe(false);
    const sinProp = validarInvitacionPropietario(
      { ...NOMINAL, propietarioIdVinculado: undefined },
      'prop@test.es',
      AHORA
    );
    expect(sinProp.ok).toBe(false);
    expect(esInvitacionNominalPropietario({ ...NOMINAL, usuarioIdVinculado: undefined })).toBe(false);
  });

  it('7. rechaza un email distinto al invitado', () => {
    const v = validarInvitacionPropietario(NOMINAL, 'otro@test.es', AHORA);
    expect(v.ok).toBe(false);
    expect(v.errores.join(' ')).toMatch(/invitad/);
    const vp = validarActivacionPendiente({ ...PENDIENTE }, NOMINAL, 'otro@test.es');
    expect(vp.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 8. Builders puros
// ---------------------------------------------------------------------------
describe('builders del flujo nominal', () => {
  it('8. el prefill conserva el propietario y la invitación es de un solo uso', () => {
    const prefill = buildPrefillUsuarioDesdePropietario(FICHA_REAL);
    expect(prefill.propietarioId).toBe('prop_1');
    expect(prefill.tipoPerfil).toBe('PROPIETARIO');
    expect(prefill.estado).toBe('PENDIENTE');
    expect(prefill.email).toBe('prop@test.es');

    const inv = buildInvitacionNominalPropietario({
      usuario: PENDIENTE,
      diasCaducidad: 14,
      ahoraIso: AHORA,
      azar: () => 0.123456789,
    });
    expect(inv.usosMaximos).toBe(1);
    expect(inv.usosActuales).toBe(0);
    expect(inv.usuarioIdVinculado).toBe('user_pend_1');
    expect(inv.propietarioIdVinculado).toBe('prop_1');
    expect(inv.emailInvitado).toBe('prop@test.es');
    expect(inv.token.startsWith('prop_')).toBe(true);
    expect(inv.fechaCaducidad).toBe(
      new Date(new Date(AHORA).getTime() + 14 * 86400000).toISOString()
    );
  });
});

// ---------------------------------------------------------------------------
// 9. Rama vinculada del servicio canónico (Firestore/Auth mockeados)
// ---------------------------------------------------------------------------
describe('registerWithInvitationLink nominal', () => {
  it('9. activa el pendiente sin crear usuario ni propietario, consume y espeja', async () => {
    sembrarFlujoNominal();

    const { firebaseUser, usuarioApp } = await registerWithInvitationLink({
      enlace: { ...NOMINAL },
      email: 'prop@test.es',
      password: 'secreta1',
      nombre: 'Carmen Ruiz',
      telefono: '+34600000000',
    });

    expect(firebaseUser?.uid).toBe('uid_nuevo_1');
    expect(usuarioApp.id).toBe('user_pend_1');
    expect(usuarioApp.estado).toBe('ACTIVO');
    expect(usuarioApp.authUid).toBe('uid_nuevo_1');
    expect(usuarioApp.enlaceRegistroId).toBe('enl_1');

    // La ficha pendiente conserva identidad, rol, permisos y vínculos.
    const ficha = mem.store.get('usuarios/user_pend_1') as Record<string, unknown>;
    expect(ficha.estado).toBe('ACTIVO');
    expect(ficha.authUid).toBe('uid_nuevo_1');
    expect(ficha.email).toBe('prop@test.es');
    expect(ficha.roles).toEqual(['PROPIETARIO_ESTANDAR']);
    expect(ficha.permisos).toEqual(['ver_inmuebles']);
    expect(ficha.propietarioId).toBe('prop_1');
    expect(ficha.inmuebleIds).toEqual(['inm_1']);
    expect('passwordHash' in ficha).toBe(false);

    // Sin segundo usuario: solo update sobre el pendiente, ningún set nuevo.
    const setsUsuarios = mem.setCalls.filter((c) => c.col === 'usuarios');
    expect(setsUsuarios).toEqual([]);
    expect(mem.updateCalls.filter((c) => c.col === 'usuarios')).toHaveLength(1);
    const clavesUpdate = Object.keys(
      mem.updateCalls.find((c) => c.col === 'usuarios')?.data as object
    );
    expect(clavesUpdate).not.toContain('email');
    expect(clavesUpdate).not.toContain('roles');
    expect(clavesUpdate).not.toContain('permisos');
    expect(clavesUpdate).not.toContain('propietarioId');
    expect(clavesUpdate).not.toContain('passwordHash');

    // Sin segunda ficha: la ficha real queda intacta (ninguna escritura).
    expect(mem.store.get('propietarios/prop_1')).toEqual(FICHA_REAL);
    expect(
      [...mem.setCalls, ...mem.updateCalls].filter((c) => c.col === 'propietarios')
    ).toEqual([]);

    // Invitación consumida (un solo uso) + espejo de identidad veraz.
    const enlace = mem.store.get('enlaces_registro/enl_1') as Record<string, unknown>;
    expect(enlace.usosActuales).toBe(1);
    const espejo = mem.store.get('usuarios_auth/uid_nuevo_1') as Record<string, unknown>;
    expect(espejo.usuarioId).toBe('user_pend_1');
    expect(espejo.estado).toBe('ACTIVO');
    expect(espejo.tipoPerfil).toBe('PROPIETARIO');
    expect(espejo.email).toBe('prop@test.es');
    expect(espejo.propietarioId).toBe('prop_1');

    // Trazabilidad.
    expect(libm.audits.map((a) => a.accion)).toContain('ACTIVACION_USUARIO_INVITACION');
  });
});

// ---------------------------------------------------------------------------
// 10. Resolución por espejo (sin consultas globales)
// ---------------------------------------------------------------------------
describe('getUsuarioByAuthUid', () => {
  it('10. resuelve vía usuarios_auth/{uid} aunque las queries estén denegadas', async () => {
    mem.store.set('usuarios_auth/uid_x', {
      uid: 'uid_x',
      usuarioId: 'user_pend_1',
      email: 'prop@test.es',
      tipoPerfil: 'PROPIETARIO',
      estado: 'ACTIVO',
    });
    mem.store.set('usuarios/user_pend_1', {
      ...PENDIENTE,
      estado: 'ACTIVO',
      authUid: 'uid_x',
    });
    mem.denyQueries = true; // las reglas solo permiten listar al master

    const u = await getUsuarioByAuthUid('uid_x', 'prop@test.es');

    expect(u?.id).toBe('user_pend_1');
    expect(u?.authUid).toBe('uid_x');
    expect(mem.getDocsCalls).toBe(0);
    expect(mem.docCalls).toContainEqual({ col: 'usuarios_auth', id: 'uid_x' });
    expect(mem.docCalls).toContainEqual({ col: 'usuarios', id: 'user_pend_1' });
  });
});

// ---------------------------------------------------------------------------
// 11. Tripwires de firestore.rules
// ---------------------------------------------------------------------------
describe('firestore.rules del flujo nominal', () => {
  it('11. activación PENDIENTE→ACTIVO con email; vetos y Bloque E intactos', () => {
    const rules = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');

    // Cláusula mínima de activación nominal.
    expect(rules).toContain("existing().estado == 'PENDIENTE'");
    expect(rules).toContain("incoming().estado == 'ACTIVO'");
    expect(rules).toContain('request.auth.token.email == existing().email');
    expect(rules).toContain('ACCESO-PROPIETARIOS');

    // Vetos intactos: sin escalada ni re-vinculación.
    expect(rules).toContain('incoming().tipoPerfil == existing().tipoPerfil');
    expect(rules).toContain('incoming().roles == existing().roles');
    expect(rules).toContain("'permisos',");
    expect(rules).toContain("'propietarioId',");
    expect(rules).toContain("'email',");
    expect(rules).toContain("'passwordHash',");
    expect(rules).toContain("'contratoIds'");
    expect(rules).toContain('allow list: if isMasterAdmin();');

    // Bloque E intacto (inquilinos por invitación con contrato).
    expect(rules).toContain('enlaceInquilinoValido');
    expect(rules).toContain("incoming().tipoPerfil == 'INQUILINO'");
  });
});
