/**
 * LOGIN ÚNICO + RECUPERACIÓN + ACCESO DE INVITACIONES.
 * Suite auto-contenida (Firestore/Auth/auditoría mockeados; vistas reales vía
 * `renderToStaticMarkup`; cableado vía tripwires textuales):
 *  - Login único: resolución por perfil (admin/propietario/profesional/
 *    inquilino), sin selección manual de rol, destinos correctos.
 *  - Recuperación: validación, llamada a sendPasswordResetEmail, mensaje
 *    neutral anti-enumeración, sin consultas Firestore.
 *  - Estados: ACTIVO accede; PENDIENTE/BLOQUEADO/INACTIVO no acceden
 *    (login, listener y revalidación de sesión).
 *  - Invitaciones: registroInq (servicio), registroProp (nominal intacto),
 *    registro genérico por token o ID directo, prioridad de rutas.
 *  - Sesión/logout: limpieza completa y cableado por perfil.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks Firestore / Auth / lib (+ localStorage en memoria)
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const setCalls: Array<{ col: string; id: string }> = [];
  return { store, setCalls, getDocCalls: 0, getDocsCalls: 0 };
});

const authm = vi.hoisted(() => ({
  signInMode: 'ok' as 'ok' | 'bad',
  signInUid: '',
  signInEmail: '',
  signOutCalls: 0,
  listener: null as null | ((u: unknown) => Promise<void>),
  resetMode: 'ok' as 'ok' | 'user-not-found' | 'invalid-email' | 'network',
  resetCalls: [] as string[],
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
  collection: (_db: unknown, col: string) => ({ __col: col }),
  getDoc: async (r: { __col: string; __id: string }) => {
    mem.getDocCalls += 1;
    const v = mem.store.get(`${r.__col}/${r.__id}`);
    return { exists: () => v !== undefined, data: () => v, id: r.__id };
  },
  // Nota: el mock sustituye (ignora {merge}); sirve para probar escrituras.
  setDoc: async (r: { __col: string; __id: string }, data: unknown) => {
    mem.setCalls.push({ col: r.__col, id: r.__id });
    mem.store.set(`${r.__col}/${r.__id}`, data);
  },
  updateDoc: async () => {},
  deleteDoc: async () => {},
  query: (...args: unknown[]) => ({ __q: args }),
  where: (f: string, op: string, v: unknown) => ({ f, op, v }),
  getDocs: async () => {
    mem.getDocsCalls += 1;
    return { empty: true, docs: [] };
  },
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: async (_a: unknown, email: string) => {
    if (authm.signInMode === 'bad') throw { code: 'auth/invalid-credential' };
    return { user: { uid: authm.signInUid, email } };
  },
  createUserWithEmailAndPassword: async (_a: unknown, email: string) => ({
    user: { uid: 'uid_inq_1', email },
  }),
  signOut: async () => {
    authm.signOutCalls += 1;
  },
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => Promise<void>) => {
    authm.listener = cb;
    return () => {};
  },
  updateProfile: async () => {},
  sendPasswordResetEmail: async (_a: unknown, email: string) => {
    authm.resetCalls.push(email);
    if (authm.resetMode === 'user-not-found') throw { code: 'auth/user-not-found' };
    if (authm.resetMode === 'invalid-email') throw { code: 'auth/invalid-email' };
    if (authm.resetMode === 'network') throw { code: 'auth/network-request-failed' };
  },
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

vi.mock('../src/lib/suministrosFirestore', () => ({
  getEnlaceById: async () => null,
}));

import {
  enviarRecuperacionPassword,
  loginWithEmail,
  logoutUser,
  registerWithInvitationLink,
  subscribeAuthState,
} from '../src/lib/authService';
import { LoginView, MENSAJE_RECUPERACION_GENERICO, MENSAJE_RECUPERACION_NEUTRAL } from '../src/components/LoginView';
import { PortalRegistroView } from '../src/components/PortalRegistroView';
import type { EnlaceRegistro, UsuarioApp } from '../src/types';
import type { User as FirebaseUser } from 'firebase/auth';

const lsStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (lsStore.has(k) ? (lsStore.get(k) as string) : null),
  setItem: (k: string, v: string) => {
    lsStore.set(k, v);
  },
  removeItem: (k: string) => {
    lsStore.delete(k);
  },
  clear: () => lsStore.clear(),
});

const noop = () => {};
const root = (p: string) => resolve(process.cwd(), p);
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  mem.store.clear();
  mem.setCalls.length = 0;
  mem.getDocCalls = 0;
  mem.getDocsCalls = 0;
  libm.audits.length = 0;
  authm.signInMode = 'ok';
  authm.signInUid = '';
  authm.signInEmail = '';
  authm.signOutCalls = 0;
  authm.listener = null;
  authm.resetMode = 'ok';
  authm.resetCalls.length = 0;
  lsStore.clear();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function perfil(
  id: string,
  tipoPerfil: UsuarioApp['tipoPerfil'],
  estado: UsuarioApp['estado'],
  extra: Record<string, unknown> = {}
): UsuarioApp {
  const roles: Record<string, string[]> = {
    ADMINISTRADOR: ['SUPERADMIN'],
    PROPIETARIO: ['PROPIETARIO_ESTANDAR'],
    PROFESIONAL: ['PROFESIONAL_MANTENIMIENTO'],
    INQUILINO: ['INQUILINO_PORTAL'],
  };
  return {
    id,
    authUid: `uid_${id}`,
    nombre: `Nombre ${id}`,
    email: `${id}@test.es`,
    tipoPerfil,
    estado,
    roles: roles[tipoPerfil],
    permisos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  } as UsuarioApp;
}

function sembrarSesion(uid: string, usuario: UsuarioApp) {
  mem.store.set(`usuarios_auth/${uid}`, { usuarioId: usuario.id });
  mem.store.set(`usuarios/${usuario.id}`, { ...usuario });
}

const ENLACE_GENERICO: EnlaceRegistro = {
  id: 'enlace_9',
  token: 'tok_abc',
  tipoPerfil: 'PROPIETARIO',
  textoVisible: 'Alta de propietario',
  descripcion: 'Enlace genérico de prueba',
  activo: true,
  usosActuales: 0,
  creadoPor: 'admin',
  createdAt: '2026-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Login único: resolución por perfil
// ---------------------------------------------------------------------------
describe('login único por perfil', () => {
  const CASOS_LOGIN: Array<[UsuarioApp['tipoPerfil'], Record<string, unknown>]> = [
    ['ADMINISTRADOR', { roles: ['SUPERADMIN'] }],
    ['PROPIETARIO', { propietarioId: 'prop_1' }],
    ['PROFESIONAL', { profesionalId: 'prof_1' }],
    ['INQUILINO', { contratoIds: ['cont_1'] }],
  ];
  it.each(CASOS_LOGIN)(
    '%s ACTIVO → resuelve su perfil, sesión y auditoría',
    async (tipo, extra) => {
      const usuario = perfil('user_x', tipo, 'ACTIVO', extra);
      sembrarSesion('uid_x', usuario);
      authm.signInUid = 'uid_x';

      const { firebaseUser, usuarioApp } = await loginWithEmail('user_x@test.es', 'Secreta123');

      expect(firebaseUser?.uid).toBe('uid_x');
      expect(usuarioApp.tipoPerfil).toBe(tipo);
      expect(usuarioApp.estado).toBe('ACTIVO');
      // Sin consultas globales: resolución por espejo + gets directos.
      expect(mem.getDocsCalls).toBe(0);
      // Sesión persistida + último acceso + auditoría, sin signOut.
      expect(JSON.parse(lsStore.get('rentselect_active_session') as string).id).toBe('user_x');
      expect(lsStore.get('rentselect_current_user_id')).toBe('user_x');
      expect(mem.store.get('usuarios/user_x') as Record<string, unknown>).toHaveProperty(
        'lastLoginAt'
      );
      expect(libm.audits.map((a) => a.accion)).toContain('LOGIN_EXITOSO');
      expect(authm.signOutCalls).toBe(0);
    }
  );

  it('sin perfil en Firestore → denegado con signOut y sin sesión', async () => {
    authm.signInUid = 'uid_fantasma';
    await expect(loginWithEmail('nadie@test.es', 'Secreta123')).rejects.toThrow(/Acceso denegado/);
    expect(authm.signOutCalls).toBe(1);
    expect(lsStore.size).toBe(0);
  });

  it('sin selección manual de rol (una sola puerta email+contraseña)', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginView, { onLoginSuccess: noop })
    );
    expect(html).not.toContain('<select');
    expect(html).toContain('Iniciar Sesión');
    const src = readFileSync(root('src/components/LoginView.tsx'), 'utf-8');
    expect(src).not.toContain('selectRol');
    expect(src).not.toContain('setRol');
  });

  it('cada perfil tiene su destino (tripwire de routing)', () => {
    const src = readFileSync(root('src/App.tsx'), 'utf-8');
    expect(src).toContain(`if (usuario.tipoPerfil === 'ADMINISTRADOR') {
            setActiveSection('administracion');
          } else if (usuario.tipoPerfil === 'PROPIETARIO') {
            setActiveSection('propietarios');
          } else if (usuario.tipoPerfil === 'PROFESIONAL') {
            setActiveSection('administracion');
          }`);
    expect(src).toContain("if (currentUser?.tipoPerfil === 'INQUILINO')");
    expect(src).toContain('<InquilinoPortalShell');
  });
});

// ---------------------------------------------------------------------------
// Recuperación de contraseña
// ---------------------------------------------------------------------------
describe('recuperación de contraseña', () => {
  it('email vacío → validación previa sin llamar a Firebase', async () => {
    await expect(enviarRecuperacionPassword('   ')).rejects.toThrow(/válido/);
    expect(authm.resetCalls).toHaveLength(0);
  });

  it('email inválido → validación previa sin llamar a Firebase', async () => {
    await expect(enviarRecuperacionPassword('sin-arroba')).rejects.toThrow(/válido/);
    expect(authm.resetCalls).toHaveLength(0);
  });

  it('email válido → llama a sendPasswordResetEmail normalizado', async () => {
    await enviarRecuperacionPassword('  User@TEST.es  ');
    expect(authm.resetCalls).toEqual(['user@test.es']);
  });

  it('usuario inexistente → éxito neutral (anti-enumeración)', async () => {
    authm.resetMode = 'user-not-found';
    await expect(enviarRecuperacionPassword('nadie@test.es')).resolves.toBeUndefined();
    expect(authm.resetCalls).toHaveLength(1);
  });

  it('email rechazado por Firebase → éxito neutral', async () => {
    authm.resetMode = 'invalid-email';
    await expect(enviarRecuperacionPassword('a@test.es')).resolves.toBeUndefined();
  });

  it('error técnico → se propaga (la UI muestra genérico)', async () => {
    authm.resetMode = 'network';
    await expect(enviarRecuperacionPassword('a@test.es')).rejects.toMatchObject({
      code: 'auth/network-request-failed',
    });
  });

  it('no toca Firestore (cero lecturas/escrituras/consultas)', async () => {
    await enviarRecuperacionPassword('a@test.es');
    authm.resetMode = 'user-not-found';
    await enviarRecuperacionPassword('b@test.es');
    expect(mem.getDocCalls).toBe(0);
    expect(mem.getDocsCalls).toBe(0);
    expect(mem.setCalls).toHaveLength(0);
  });

  it('LoginView ofrece recuperación con formulario y vuelta al login', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginView, { onLoginSuccess: noop })
    );
    expect(html).toContain('¿Has olvidado tu contraseña?');

    const rec = renderToStaticMarkup(
      React.createElement(LoginView, { onLoginSuccess: noop, vistaInicial: 'recuperacion' })
    );
    expect(rec).toContain('Enviar instrucciones');
    expect(rec).toContain('Correo Electrónico');
    expect(rec).toContain('Volver al inicio de sesión');
    expect(rec).not.toContain('Iniciar Sesión');
  });

  it('mensajes neutral/genérico definidos y cableados', () => {
    expect(MENSAJE_RECUPERACION_NEUTRAL).toContain('Si existe una cuenta asociada');
    expect(MENSAJE_RECUPERACION_GENERICO).not.toContain('existe una cuenta');
    const src = readFileSync(root('src/components/LoginView.tsx'), 'utf-8');
    expect(src).toContain('recuperacionEnviada');
    expect(src).toContain('{MENSAJE_RECUPERACION_NEUTRAL}');
    expect(src).toContain('MENSAJE_RECUPERACION_GENERICO');
  });
});

// ---------------------------------------------------------------------------
// Estados de usuario
// ---------------------------------------------------------------------------
describe('estados tras el login', () => {
  const CASOS_BLOQUEO: Array<[UsuarioApp['estado'], RegExp]> = [
    ['BLOQUEADO', /bloqueada/],
    ['PENDIENTE', /pendiente/],
    ['INACTIVO', /desactivada/],
  ];
  it.each(CASOS_BLOQUEO)('%s → bloqueo con signOut y sin sesión', async (estado, rx) => {
    const usuario = perfil('user_x', 'PROPIETARIO', estado, { propietarioId: 'prop_1' });
    sembrarSesion('uid_x', usuario);
    authm.signInUid = 'uid_x';

    await expect(loginWithEmail('user_x@test.es', 'Secreta123')).rejects.toThrow(rx);
    expect(authm.signOutCalls).toBe(1);
    expect(lsStore.size).toBe(0);
    // Sin escritura de último acceso ni auditoría de login.
    expect(mem.store.get('usuarios/user_x')).toEqual(usuario);
    expect(libm.audits.map((a) => a.accion)).not.toContain('LOGIN_EXITOSO');
  });

  it('listener: estados no activos → null + signOut + sesión eliminada', async () => {
    for (const estado of ['BLOQUEADO', 'PENDIENTE', 'INACTIVO'] as const) {
      mem.store.clear();
      libm.audits.length = 0;
      authm.signOutCalls = 0;
      lsStore.clear();
      lsStore.set('rentselect_active_session', JSON.stringify(perfil('user_x', 'PROPIETARIO', estado)));
      sembrarSesion('uid_x', perfil('user_x', 'PROPIETARIO', estado));
      const cbs: Array<{ u: unknown; p: unknown; l: boolean }> = [];
      subscribeAuthState(((u: FirebaseUser | null, p: UsuarioApp | null, l: boolean) => {
        cbs.push({ u, p, l });
      }) as (fbUser: FirebaseUser | null, usuarioApp: UsuarioApp | null, loading: boolean) => void);
      await flush();
      await authm.listener!({ uid: 'uid_x', email: 'user_x@test.es' });

      expect(cbs[cbs.length - 1]).toEqual({ u: null, p: null, l: false });
      expect(authm.signOutCalls).toBe(1);
      expect(lsStore.has('rentselect_active_session')).toBe(false);
    }
  });

  it('listener: ACTIVO → entrega el perfil y persiste sesión', async () => {
    sembrarSesion('uid_x', perfil('user_x', 'PROFESIONAL', 'ACTIVO', { profesionalId: 'prof_1' }));
    const cbs: Array<{ u: unknown; p: unknown; l: boolean }> = [];
    subscribeAuthState(((u: FirebaseUser | null, p: UsuarioApp | null, l: boolean) => {
      cbs.push({ u, p, l });
    }) as (fbUser: FirebaseUser | null, usuarioApp: UsuarioApp | null, loading: boolean) => void);
    await flush();
    await authm.listener!({ uid: 'uid_x', email: 'user_x@test.es' });

    const ultimo = cbs[cbs.length - 1];
    expect((ultimo.p as UsuarioApp).tipoPerfil).toBe('PROFESIONAL');
    expect(authm.signOutCalls).toBe(0);
    expect(lsStore.has('rentselect_active_session')).toBe(true);
  });

  it('sesión almacenada PENDIENTE → rechazada en la revalidación', async () => {
    const pendiente = perfil('user_p', 'PROPIETARIO', 'PENDIENTE', { propietarioId: 'prop_9' });
    lsStore.set('rentselect_active_session', JSON.stringify(pendiente));
    mem.store.set('usuarios/user_p', { ...pendiente });
    const cbs: Array<{ u: unknown; p: unknown; l: boolean }> = [];
    subscribeAuthState(((u: FirebaseUser | null, p: UsuarioApp | null, l: boolean) => {
      cbs.push({ u, p, l });
    }) as (fbUser: FirebaseUser | null, usuarioApp: UsuarioApp | null, loading: boolean) => void);
    await flush();

    expect(lsStore.has('rentselect_active_session')).toBe(false);
    expect(cbs[cbs.length - 1]).toEqual({ u: null, p: null, l: false });
  });
});

// ---------------------------------------------------------------------------
// Invitaciones: registro, registroProp, registroInq
// ---------------------------------------------------------------------------
describe('acceso por invitaciones', () => {
  const vistaProps = (token: string) => ({
    token,
    enlaces: [ENLACE_GENERICO],
    profesionales: [],
    especialidades: [],
    onCompleteRegistro: async () => {},
    onCancel: noop,
  });

  it('?registro= con token → formulario genérico (mecanismo actual)', () => {
    const html = renderToStaticMarkup(React.createElement(PortalRegistroView, vistaProps('tok_abc')));
    expect(html).toContain('Completar Registro y Acceder');
    expect(html).not.toContain('No Válido');
  });

  it('?registro= con ID directo → mismo formulario (sin listar)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PortalRegistroView, vistaProps('enlace_9'))
    );
    expect(html).toContain('Completar Registro y Acceder');
    expect(html).not.toContain('No Válido');
  });

  it('valor desconocido → pantalla de enlace no válido (regresión)', () => {
    const html = renderToStaticMarkup(React.createElement(PortalRegistroView, vistaProps('zzz')));
    expect(html).toContain('No Válido');
  });

  it('registroInq: el servicio crea al inquilino vinculado a su contrato', async () => {
    const enlace: EnlaceRegistro = {
      id: 'enlace_inq_1',
      token: 'tok_inq',
      tipoPerfil: 'INQUILINO',
      textoVisible: 'Alta inquilino',
      activo: true,
      contratoIdVinculado: 'cont_1',
      inmuebleIdVinculado: 'inm_1',
      usosActuales: 0,
      creadoPor: 'admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const { usuarioApp } = await registerWithInvitationLink({
      enlace,
      email: 'inq@test.es',
      password: 'Secreta123',
      nombre: 'Inés',
    });

    expect(usuarioApp.id).toBe('uid_inq_1');
    expect(usuarioApp.authUid).toBe('uid_inq_1');
    expect(usuarioApp.tipoPerfil).toBe('INQUILINO');
    expect(usuarioApp.estado).toBe('ACTIVO');
    expect(usuarioApp.roles).toEqual(['INQUILINO_PORTAL']);
    expect(usuarioApp.contratoIds).toEqual(['cont_1']);
    expect(usuarioApp.enlaceRegistroId).toBe('enlace_inq_1');
    const guardado = mem.store.get('usuarios/uid_inq_1') as Record<string, unknown>;
    expect(guardado.contratoIds).toEqual(['cont_1']);
    expect(mem.store.get('enlaces_registro/enlace_inq_1')).toEqual({ usosActuales: 1 });
    expect(libm.audits.map((a) => a.accion)).toContain('REGISTRO_USUARIO_INVITACION');
  });

  it('registroInq: la vista usa get directo + flujo canónico (tripwire)', () => {
    const src = readFileSync(
      root('src/components/portal-inquilino/RegistroInquilinoView.tsx'),
      'utf-8'
    );
    for (const s of ['getEnlaceById', 'registerWithInvitationLink', 'onComplete', 'portal del inquilino']) {
      expect(src, s).toContain(s);
    }
  });

  it('registroProp: nominal intacto (tripwire)', () => {
    const vista = readFileSync(root('src/components/PortalRegistroView.tsx'), 'utf-8');
    expect(vista).toContain('handleSubmitNominal');
    expect(vista).toContain('validarInvitacionPropietario');
    const app = readFileSync(root('src/App.tsx'), 'utf-8');
    expect(app).toContain('registroProp');
    expect(app).toContain('enlaceId={activePublicRegistroPropId}');
    expect(app).not.toContain('registerAutonomo(usuario');
  });

  it('prioridad de rutas: inq > prop > genérico > públicas > login (tripwire)', () => {
    const src = readFileSync(root('src/App.tsx'), 'utf-8');
    // Ramas de render (ancladas a inicio de línea: hay menciones anidadas previas).
    const at = (cond: string) => {
      const m = new RegExp(`^  if \\(${cond}\\) \\{$`, 'm').exec(src);
      expect(m, cond).not.toBeNull();
      return (m as RegExpExecArray).index;
    };
    const orden = [
      at('activePublicRegistroInqId'),
      at('activePublicRegistroPropId'),
      at('activePublicRegistroToken'),
      at('activePublicVisitaToken'),
      at('!currentUser'),
    ];
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
  });

  it('resolución directa por ID cableada (tripwire)', () => {
    const app = readFileSync(root('src/App.tsx'), 'utf-8');
    expect(app).toContain("startsWith('enlace_')");
    expect(app).toContain('getEnlaceById(activePublicRegistroToken)');
    expect(app).toContain('enlaceDirectoRegistro');
    const vista = readFileSync(root('src/components/PortalRegistroView.tsx'), 'utf-8');
    expect(vista).toContain('e.id === token');
  });

  it('rutas públicas intactas (tripwire)', () => {
    const src = readFileSync(root('src/App.tsx'), 'utf-8');
    for (const s of [
      'activePublicVisitaToken',
      'activePublicSolicitudToken',
      'activePublicQuestionnaireToken',
      'activePublicDocToken',
    ]) {
      expect(src, s).toContain(s);
    }
  });
});

// ---------------------------------------------------------------------------
// Sesión y logout
// ---------------------------------------------------------------------------
describe('sesión y logout', () => {
  it('logoutUser limpia localStorage y cierra Firebase Auth', async () => {
    lsStore.set('rentselect_active_session', JSON.stringify(perfil('user_x', 'PROPIETARIO', 'ACTIVO')));
    lsStore.set('rentselect_current_user_id', 'user_x');
    lsStore.set('rentselect_propietarios', '[]');
    await logoutUser();
    expect(lsStore.size).toBe(0);
    expect(authm.signOutCalls).toBe(1);
  });

  it('App + shell cablean el mismo logout (tripwire)', () => {
    const app = readFileSync(root('src/App.tsx'), 'utf-8');
    expect(app).toContain('await logoutUser()');
    expect(app).toContain('setCurrentUser(null)');
    const shell = readFileSync(root('src/components/portal-inquilino/InquilinoPortalShell.tsx'), 'utf-8');
    expect(shell).toContain('onLogout');
    expect(shell).toContain('Cerrar sesión');
  });

  it('el registro autónomo solo existe sin sesión (tripwire §9)', () => {
    const src = readFileSync(root('src/App.tsx'), 'utf-8');
    const iLogin = src.indexOf('if (!currentUser)');
    const iAuto = src.indexOf('showRegistroAutonomo');
    const iView = src.indexOf('<LoginView');
    expect(iLogin).toBeGreaterThan(-1);
    expect(iAuto).toBeGreaterThan(iLogin);
    expect(iView).toBeGreaterThan(iAuto);
  });
});
