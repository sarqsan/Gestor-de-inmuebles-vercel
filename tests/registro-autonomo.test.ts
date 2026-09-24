/**
 * REGISTRO AUTÓNOMO — Núcleo de altas sin invitación (PROPIETARIO/PROFESIONAL).
 * Suite auto-contenida (Firestore/Auth/auditoría mockeados, mismo patrón que
 * acceso-propietarios.test.ts):
 *  - Alta válida de propietario (Auth UID, tipoPerfil, ACTIVO, rol exacto,
 *    permisos vacíos, propietarioId nuevo, datos reales, espejo, auditoría).
 *  - Alta válida de profesional (análoga + ficha real con catálogos).
 *  - Seguridad/errores: perfil no permitido, email duplicado, obligatorios
 *    ausentes, IDs existentes no reutilizados, sin roles/permisos admin.
 *  - Fallo parcial (§7): error técnico controlado + auditoría ERROR.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks Firestore / Auth / lib (+ localStorage en memoria)
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const setCalls: Array<{ col: string; id: string }> = [];
  const failCols: string[] = [];
  return { store, setCalls, failCols };
});

const authm = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'duplicado' | 'deshabilitado',
  createCalls: 0,
  displayNames: [] as Array<string | undefined>,
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
  collection: (_db: unknown, col: string) => ({ __col: col }),
  getDoc: async (r: { __col: string; __id: string }) => {
    const v = mem.store.get(`${r.__col}/${r.__id}`);
    return { exists: () => v !== undefined, data: () => v, id: r.__id };
  },
  setDoc: async (r: { __col: string; __id: string }, data: unknown) => {
    if (mem.failCols.includes(r.__col)) throw { code: 'permission-denied' };
    mem.setCalls.push({ col: r.__col, id: r.__id });
    mem.store.set(`${r.__col}/${r.__id}`, data);
  },
  updateDoc: async () => {},
  deleteDoc: async () => {},
  query: (...args: unknown[]) => ({ __q: args }),
  where: (f: string, op: string, v: unknown) => ({ f, op, v }),
  getDocs: async () => ({ empty: true, docs: [] }),
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: async (_a: unknown, email: string) => {
    authm.createCalls += 1;
    if (authm.mode === 'duplicado') throw { code: 'auth/email-already-in-use' };
    if (authm.mode === 'deshabilitado') throw { code: 'auth/operation-not-allowed' };
    return { user: { uid: `uid_auto_${authm.createCalls}`, email } };
  },
  signInWithEmailAndPassword: async () => {
    throw new Error('login no cubierto en esta suite');
  },
  signOut: async () => {},
  onAuthStateChanged: () => () => {},
  updateProfile: async (_u: unknown, p: { displayName?: string }) => {
    authm.displayNames.push(p?.displayName);
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

import { registerAutonomo } from '../src/lib/authService';
import type {
  RegisterAutonomoProfesionalParams,
  RegisterAutonomoPropietarioParams,
} from '../src/lib/authService';
import type { Profesional, Propietario, UsuarioApp } from '../src/types';

// localStorage en memoria (el entorno de tests es node).
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

beforeEach(() => {
  mem.store.clear();
  mem.setCalls.length = 0;
  mem.failCols.length = 0;
  libm.audits.length = 0;
  authm.mode = 'ok';
  authm.createCalls = 0;
  authm.displayNames.length = 0;
  lsStore.clear();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PARAM_PROP: RegisterAutonomoPropietarioParams = {
  tipoPerfil: 'PROPIETARIO',
  email: 'Nuevo.Prop@TEST.es',
  password: 'Secreta123',
  nombre: 'Carmen',
  apellidos: 'Ruiz Sanz',
  telefono: '+34600111222',
  nifCif: '12345678Z',
  direccion: 'Calle Mayor 1, 2B',
  ciudad: 'Almería',
  codigoPostal: '04001',
  provincia: 'Almería',
};

const PARAM_PROF: RegisterAutonomoProfesionalParams = {
  tipoPerfil: 'PROFESIONAL',
  email: 'fontanero@test.es',
  password: 'Secreta123',
  nombre: 'Luis',
  apellidos: 'García',
  telefono: '+34600333444',
  nombreComercial: 'Fontanería García SL',
  cifNif: 'B04123456',
  especialidades: ['Fontanería', 'Climatización'],
  provincia: 'Almería',
  municipio: 'Roquetas de Mar',
  tipo: 'EMPRESA',
};

function docGuardado<T>(col: string, id: string): T {
  const v = mem.store.get(`${col}/${id}`);
  expect(v, `existe ${col}/${id}`).not.toBeUndefined();
  return v as T;
}

// ---------------------------------------------------------------------------
// Alta autónoma de PROPIETARIO
// ---------------------------------------------------------------------------
describe('alta autónoma de PROPIETARIO', () => {
  it('crea Auth + usuario ACTIVO + ficha real + espejo + auditoría + sesión', async () => {
    const { firebaseUser, usuarioApp } = await registerAutonomo({ ...PARAM_PROP });

    // Auth UID utilizado correctamente + email normalizado.
    expect(firebaseUser.uid).toBe('uid_auto_1');
    expect(usuarioApp.authUid).toBe('uid_auto_1');
    expect(usuarioApp.email).toBe('nuevo.prop@test.es');

    // Usuario autoritativo: perfil, estado, rol exacto, sin permisos, vínculo nuevo.
    expect(usuarioApp.tipoPerfil).toBe('PROPIETARIO');
    expect(usuarioApp.estado).toBe('ACTIVO');
    expect(usuarioApp.roles).toEqual(['PROPIETARIO_ESTANDAR']);
    expect(usuarioApp.permisos).toEqual([]);
    expect(usuarioApp.propietarioId).toMatch(/^prop_/);
    expect(usuarioApp.profesionalId).toBeUndefined();

    const guardado = docGuardado<UsuarioApp>('usuarios', usuarioApp.id);
    expect(guardado).toEqual(usuarioApp);

    // Ficha con datos reales (sin marcadores ficticios).
    const ficha = docGuardado<Propietario>('propietarios', usuarioApp.propietarioId as string);
    expect(ficha.nombre).toBe('Carmen Ruiz Sanz');
    expect(ficha.nifCif).toBe('12345678Z');
    expect(ficha.email).toBe('nuevo.prop@test.es');
    expect(ficha.telefono).toBe('+34600111222');
    expect(ficha.direccion).toBe('Calle Mayor 1, 2B');
    expect(ficha.ciudad).toBe('Almería');
    expect(ficha.codigoPostal).toBe('04001');
    expect(ficha.provincia).toBe('Almería');
    expect(ficha.tipoPropietario).toBe('persona_fisica');
    expect(ficha.cuentasBancarias).toEqual([]);
    expect(JSON.stringify(ficha)).not.toMatch(/NO_INDICADO|Pendiente|00000/);

    // Espejo de identidad para las reglas.
    const espejo = docGuardado<Record<string, unknown>>('usuarios_auth', 'uid_auto_1');
    expect(espejo.usuarioId).toBe(usuarioApp.id);
    expect(espejo.propietarioId).toBe(usuarioApp.propietarioId);
    expect(espejo.tipoPerfil).toBe('PROPIETARIO');

    // Auditoría del alta + sesión para continuar el login.
    expect(libm.audits).toHaveLength(1);
    expect(libm.audits[0].accion).toBe('REGISTRO_AUTONOMO');
    expect(libm.audits[0].resultado).toBe('EXITO');
    expect(libm.audits[0].entidadAfectada).toBe('usuario');
    expect(JSON.parse(lsStore.get('rentselect_active_session') as string).id).toBe(usuarioApp.id);
    expect(lsStore.get('rentselect_current_user_id')).toBe(usuarioApp.id);
    expect(authm.displayNames).toEqual(['Carmen Ruiz Sanz']);
  });

  it('rechaza el alta si falta un dato obligatorio de la ficha', async () => {
    await expect(registerAutonomo({ ...PARAM_PROP, nifCif: '  ' })).rejects.toThrow(/obligatorio/);
    expect(authm.createCalls).toBe(0);
    expect(mem.store.size).toBe(0);
    expect(libm.audits).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Alta autónoma de PROFESIONAL
// ---------------------------------------------------------------------------
describe('alta autónoma de PROFESIONAL', () => {
  it('crea Auth + usuario ACTIVO + ficha real + espejo + auditoría + sesión', async () => {
    const { firebaseUser, usuarioApp } = await registerAutonomo({ ...PARAM_PROF });

    expect(firebaseUser.uid).toBe('uid_auto_1');
    expect(usuarioApp.authUid).toBe('uid_auto_1');
    expect(usuarioApp.tipoPerfil).toBe('PROFESIONAL');
    expect(usuarioApp.estado).toBe('ACTIVO');
    expect(usuarioApp.roles).toEqual(['PROFESIONAL_MANTENIMIENTO']);
    expect(usuarioApp.permisos).toEqual([]);
    expect(usuarioApp.profesionalId).toMatch(/^prof_/);
    expect(usuarioApp.propietarioId).toBeUndefined();

    expect(docGuardado<UsuarioApp>('usuarios', usuarioApp.id)).toEqual(usuarioApp);

    const ficha = docGuardado<Profesional>('profesionales', usuarioApp.profesionalId as string);
    expect(ficha.usuarioId).toBe(usuarioApp.id);
    expect(ficha.tipo).toBe('EMPRESA');
    expect(ficha.nombreComercial).toBe('Fontanería García SL');
    expect(ficha.contactoNombre).toBe('Luis García');
    expect(ficha.cifNif).toBe('B04123456');
    expect(ficha.email).toBe('fontanero@test.es');
    expect(ficha.telefono).toBe('+34600333444');
    expect(ficha.especialidades).toEqual(['Fontanería', 'Climatización']);
    expect(ficha.zonasServicio).toEqual([
      { id: 'z1', provincia: 'Almería', municipio: 'Roquetas de Mar' },
    ]);
    expect(ficha.inmuebleIdsAsignados).toEqual([]);
    expect(ficha.activo).toBe(true);

    const espejo = docGuardado<Record<string, unknown>>('usuarios_auth', 'uid_auto_1');
    expect(espejo.usuarioId).toBe(usuarioApp.id);
    expect(espejo.profesionalId).toBe(usuarioApp.profesionalId);

    expect(libm.audits).toHaveLength(1);
    expect(libm.audits[0].accion).toBe('REGISTRO_AUTONOMO');
    expect(libm.audits[0].resultado).toBe('EXITO');
    expect(JSON.parse(lsStore.get('rentselect_active_session') as string).id).toBe(usuarioApp.id);
  });

  it('rechaza sin nombre comercial, sin especialidades o sin provincia', async () => {
    await expect(registerAutonomo({ ...PARAM_PROF, nombreComercial: '' })).rejects.toThrow(
      /obligatorio/
    );
    await expect(registerAutonomo({ ...PARAM_PROF, especialidades: [] })).rejects.toThrow(
      /especialidad/
    );
    await expect(registerAutonomo({ ...PARAM_PROF, provincia: '' })).rejects.toThrow(/obligatorio/);
    expect(authm.createCalls).toBe(0);
    expect(mem.store.size).toBe(0);
  });

  it('aplica AUTONOMO por defecto si no se indica tipo', async () => {
    const sinTipo: RegisterAutonomoProfesionalParams = { ...PARAM_PROF };
    delete sinTipo.tipo;
    const { usuarioApp } = await registerAutonomo(sinTipo);
    const ficha = docGuardado<Profesional>('profesionales', usuarioApp.profesionalId as string);
    expect(ficha.tipo).toBe('AUTONOMO');
  });

  it('profesional con zonas adicionales → ficha con todas las zonas', async () => {
    const { usuarioApp } = await registerAutonomo({
      ...PARAM_PROF,
      zonasAdicionales: [{ provincia: 'Granada', municipio: 'Motril' }, { provincia: 'Murcia' }],
    });
    const ficha = docGuardado<Profesional>('profesionales', usuarioApp.profesionalId as string);
    expect(ficha.zonasServicio).toEqual([
      { id: 'z1', provincia: 'Almería', municipio: 'Roquetas de Mar' },
      { id: 'z2', provincia: 'Granada', municipio: 'Motril' },
      { id: 'z3', provincia: 'Murcia' },
    ]);
  });

  it('zona adicional sin provincia → rechazo previo a Auth', async () => {
    await expect(
      registerAutonomo({ ...PARAM_PROF, zonasAdicionales: [{ provincia: '  ' }] })
    ).rejects.toThrow(/obligatorio/);
    expect(authm.createCalls).toBe(0);
    expect(mem.store.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Seguridad y errores
// ---------------------------------------------------------------------------
describe('seguridad y errores', () => {
  it('rechaza perfiles no permitidos (ADMINISTRADOR, INQUILINO, otros)', async () => {
    await expect(
      registerAutonomo({ ...PARAM_PROP, tipoPerfil: 'ADMINISTRADOR' } as any)
    ).rejects.toThrow(/solo admite/);
    await expect(
      registerAutonomo({ ...PARAM_PROF, tipoPerfil: 'INQUILINO' } as any)
    ).rejects.toThrow(/solo admite/);
    await expect(registerAutonomo({ ...PARAM_PROP, tipoPerfil: 'GESTOR' } as any)).rejects.toThrow(
      /solo admite/
    );
    expect(authm.createCalls).toBe(0);
    expect(mem.store.size).toBe(0);
  });

  it('rechaza inyección de roles o permisos en los parámetros', async () => {
    await expect(
      registerAutonomo({ ...PARAM_PROP, roles: ['SUPERADMIN'] } as any)
    ).rejects.toThrow(/roles ni permisos/);
    await expect(
      registerAutonomo({ ...PARAM_PROF, permisos: ['administracion.total'] } as any)
    ).rejects.toThrow(/roles ni permisos/);
    expect(authm.createCalls).toBe(0);
    expect(mem.store.size).toBe(0);
  });

  it('email duplicado → error controlado sin escribir nada ni tocar la cuenta', async () => {
    authm.mode = 'duplicado';
    await expect(registerAutonomo({ ...PARAM_PROP })).rejects.toThrow(/ya tiene una cuenta/);
    expect(authm.createCalls).toBe(1);
    expect(mem.store.size).toBe(0);
    expect(mem.setCalls).toHaveLength(0);
    expect(libm.audits).toHaveLength(0);
    expect(lsStore.size).toBe(0);
  });

  it('proveedor deshabilitado → error técnico controlado', async () => {
    authm.mode = 'deshabilitado';
    await expect(registerAutonomo({ ...PARAM_PROF })).rejects.toThrow(/no disponible|habilitado/);
    expect(mem.store.size).toBe(0);
  });

  it('email inválido, password corta o nombre vacío → rechazo previo a Auth', async () => {
    await expect(registerAutonomo({ ...PARAM_PROP, email: 'sin-arroba' })).rejects.toThrow(/válido/);
    await expect(registerAutonomo({ ...PARAM_PROP, password: '123' })).rejects.toThrow(
      /6 caracteres/
    );
    await expect(registerAutonomo({ ...PARAM_PROP, nombre: '' })).rejects.toThrow(/obligatorio/);
    expect(authm.createCalls).toBe(0);
    expect(mem.store.size).toBe(0);
  });

  it('nunca reutiliza IDs existentes y genera IDs únicos', async () => {
    const fichaVieja = { id: 'prop_EXISTE', nombre: 'Antiguo', nifCif: 'X' };
    const userViejo = { id: 'user_viejo', propietarioId: 'prop_EXISTE' };
    const profViejo = { id: 'prof_EXISTE', nombreComercial: 'Viejo' };
    mem.store.set('propietarios/prop_EXISTE', fichaVieja);
    mem.store.set('usuarios/user_viejo', userViejo);
    mem.store.set('profesionales/prof_EXISTE', profViejo);

    const alta1 = await registerAutonomo({ ...PARAM_PROP, email: 'uno@test.es' });
    const alta2 = await registerAutonomo({ ...PARAM_PROP, email: 'dos@test.es' });
    const alta3 = await registerAutonomo({ ...PARAM_PROF, email: 'tres@test.es' });

    expect(alta1.usuarioApp.propietarioId).not.toBe('prop_EXISTE');
    expect(alta3.usuarioApp.profesionalId).not.toBe('prof_EXISTE');
    expect(alta1.usuarioApp.propietarioId).not.toBe(alta2.usuarioApp.propietarioId);
    expect(alta1.usuarioApp.id).not.toBe(alta2.usuarioApp.id);
    // Documentos previos intactos (sin sobrescritura).
    expect(mem.store.get('propietarios/prop_EXISTE')).toBe(fichaVieja);
    expect(mem.store.get('usuarios/user_viejo')).toBe(userViejo);
    expect(mem.store.get('profesionales/prof_EXISTE')).toBe(profViejo);
  });

  it('no crea roles ni asigna permisos administrativos', async () => {
    const prop = await registerAutonomo({ ...PARAM_PROP });
    const prof = await registerAutonomo({ ...PARAM_PROF });
    for (const u of [prop.usuarioApp, prof.usuarioApp]) {
      expect(u.roles).toHaveLength(1);
      expect(u.roles[0]).not.toMatch(/ADMIN|SUPER|GESTOR/);
      expect(u.permisos).toEqual([]);
      const espejo = docGuardado<Record<string, unknown>>('usuarios_auth', u.authUid as string);
      expect(espejo.roles).toEqual(u.roles);
    }
    expect(prop.usuarioApp.roles).toEqual(['PROPIETARIO_ESTANDAR']);
    expect(prof.usuarioApp.roles).toEqual(['PROFESIONAL_MANTENIMIENTO']);
  });
});

// ---------------------------------------------------------------------------
// Fallo parcial (§7)
// ---------------------------------------------------------------------------
describe('fallo parcial (§7)', () => {
  it('ficha denegada → error técnico controlado + auditoría ERROR + sin sesión', async () => {
    mem.failCols.push('propietarios');
    await expect(registerAutonomo({ ...PARAM_PROP })).rejects.toThrow(/Alta incompleta/);
    expect(authm.createCalls).toBe(1);
    // El usuario autoritativo sí se escribió; la ficha no.
    expect(mem.setCalls.filter((c) => c.col === 'usuarios')).toHaveLength(1);
    expect(mem.setCalls.filter((c) => c.col === 'propietarios')).toHaveLength(0);
    expect(libm.audits).toHaveLength(1);
    expect(libm.audits[0].accion).toBe('REGISTRO_AUTONOMO');
    expect(libm.audits[0].resultado).toBe('ERROR');
    expect(String(libm.audits[0].descripcion)).toMatch(/nuevo.prop@test.es/);
    expect(lsStore.size).toBe(0);
  });

  it('usuario denegado → error técnico controlado sin perfil válido', async () => {
    mem.failCols.push('usuarios');
    await expect(registerAutonomo({ ...PARAM_PROF })).rejects.toThrow(/Alta incompleta/);
    expect([...mem.store.keys()].filter((k) => k.startsWith('usuarios/'))).toHaveLength(0);
    expect(libm.audits).toHaveLength(1);
    expect(libm.audits[0].resultado).toBe('ERROR');
    expect(lsStore.size).toBe(0);
  });
});
