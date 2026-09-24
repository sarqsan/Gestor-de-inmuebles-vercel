/**
 * ADMINISTRACIÓN DE USUARIOS Y PERMISOS.
 * Suite auto-contenida (Firestore/Auth mockeados; lógica y vistas reales):
 *  - Consulta: el master carga usuarios (subscribeUsuarios cableado + reglas
 *    list solo-master); la tabla muestra email/perfil/estado/fecha.
 *  - Edición: persiste sobre el documento existente (merge conserva vínculos).
 *  - Seguridad: validador puro (estados, SUPERADMIN, master, autoedición,
 *    identidad/vínculos inmutables) + tripwires de firestore.rules (sin cambios).
 *  - Auditoría: diff de campos sin secretos.
 *  - UI: CrearUsuarioModal distingue crear/editar y bloquea según protecciones;
 *    AdminControlCenter expone Editar y filtros/badges completos.
 *  - Regresión: alta nominal PENDIENTE (prefill) intacta; catálogo con
 *    duplicados documentados (tesorería) sin limpiar.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks Firestore / Auth / Storage / authService (memoria)
// ---------------------------------------------------------------------------
const mem = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  return { store };
});

type Ref = { __col: string; __id?: string };

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  collection: (_db: unknown, col: string) => ({ __col: col }),
  doc: (_db: unknown, col: string, id: string) => ({ __col: col, __id: id }),
  getDoc: async (r: Ref) => {
    const v = mem.store.get(`${r.__col}/${r.__id}`);
    return { exists: () => v !== undefined, data: () => v, id: r.__id };
  },
  setDoc: async (r: Ref, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
    const k = `${r.__col}/${r.__id}`;
    if (opts?.merge) {
      const prev = (mem.store.get(k) as Record<string, unknown>) || {};
      mem.store.set(k, { ...prev, ...(data as object) });
    } else {
      mem.store.set(k, data);
    }
  },
  updateDoc: async () => {},
  deleteDoc: async (r: Ref) => {
    mem.store.delete(`${r.__col}/${r.__id}`);
  },
  deleteField: () => ({ __deleteField: true }),
  onSnapshot: (ref: Ref, ok: (s: unknown) => void) => {
    const docs: Array<{ id: string; data: () => unknown }> = [];
    for (const [k, v] of mem.store.entries()) {
      if (k.startsWith(`${ref.__col}/`)) {
        docs.push({ id: k.slice(ref.__col.length + 1), data: () => v });
      }
    }
    ok({
      empty: docs.length === 0,
      size: docs.length,
      docs,
      forEach: (cb: (d: { id: string; data: () => unknown }) => void) => docs.forEach(cb),
    });
    return () => {};
  },
  query: (...args: unknown[]) => ({ __q: args }),
  where: (f: string, op: string, v: unknown) => ({ f, op, v }),
  getDocs: async () => ({ empty: true, docs: [] }),
  writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
  runTransaction: async () => {
    throw new Error('runTransaction sin mock');
  },
}));

vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
}));

vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
  ref: () => ({}),
  uploadBytes: async () => ({}),
  getDownloadURL: async () => '',
  deleteObject: async () => {},
}));

vi.mock('../src/lib/authService', () => ({
  ADMIN_MASTER_EMAIL: 'sarqsan2@gmail.com',
}));

import { doc, getDoc } from 'firebase/firestore';
import { subscribeUsuarios, saveUsuarioFirestore } from '../src/lib/firebase';
import {
  esUsuarioMaster,
  validarEdicionAdmin,
  resumenCambiosUsuario,
  camposModificadosUsuario,
  MASTER_USER_ID,
} from '../src/lib/adminUsuarios';
import { CrearUsuarioModal } from '../src/components/modals/CrearUsuarioModal';
import { AdminControlCenter } from '../src/components/admin/AdminControlCenter';
import {
  PERMISOS_SISTEMA,
  ROLES_PREDEFINIDOS,
  type UsuarioApp,
} from '../src/types';

const root = (p: string) => resolve(process.cwd(), p);
const reglasUsuarios = (): string => {
  const rules = readFileSync(root('firestore.rules'), 'utf-8');
  const ini = rules.indexOf('match /usuarios/{usuarioId}');
  const fin = rules.indexOf('match /profesionales/{profesionalId}');
  return rules.slice(ini, fin);
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const AHORA = '2026-09-24T10:00:00.000Z';

const mkUsuario = (over: Partial<UsuarioApp> = {}): UsuarioApp => ({
  id: 'u_carlos',
  nombre: 'Carlos',
  apellidos: 'Ruiz',
  email: 'carlos@test.es',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO_ESTANDAR'],
  permisos: ['inmuebles.ver'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...over,
});

const mkMaster = (): UsuarioApp =>
  mkUsuario({
    id: MASTER_USER_ID,
    nombre: 'Master',
    apellidos: '',
    email: 'sarqsan2@gmail.com',
    tipoPerfil: 'ADMINISTRADOR',
    roles: ['SUPERADMIN'],
    permisos: ['inmuebles.ver', 'contratos.ver'],
  });

const OP_MASTER = { id: MASTER_USER_ID, email: 'sarqsan2@gmail.com' };
const OP_OTRO = { id: 'u_admin2', email: 'admin2@test.es' };

const renderModal = (props: Record<string, unknown>): string =>
  renderToStaticMarkup(
    React.createElement(CrearUsuarioModal, {
      inmuebles: [],
      propietarios: [],
      onSave: async () => {},
      onClose: () => {},
      ...props,
    } as never)
  );

const PROPS_CENTER = {
  inmuebles: [],
  propietarios: [],
  profesionales: [],
  contratos: [],
  auditLogs: [],
  enlacesRegistro: [],
  especialidades: [],
  onLogout: () => {},
  onSaveUsuario: async () => {},
  onDeleteUsuario: async () => {},
  onSaveEnlaceRegistro: async () => {},
  onDeleteEnlaceRegistro: async () => {},
  onSaveEspecialidad: async () => {},
  onDeleteEspecialidad: async () => {},
  onOpenCrearUsuarioModal: () => {},
  onOpenCrearEnlaceModal: () => {},
};

const renderCenterUsuarios = (usuarios: UsuarioApp[]): string =>
  renderToStaticMarkup(
    React.createElement(AdminControlCenter, {
      ...PROPS_CENTER,
      currentUser: mkMaster(),
      usuarios,
      seccionInicial: 'usuarios',
    } as never)
  );

beforeEach(() => {
  mem.store.clear();
});

// ---------------------------------------------------------------------------
// 1. CONSULTA: carga de usuarios (master)
// ---------------------------------------------------------------------------
describe('Admin usuarios — consulta (carga de la lista)', () => {
  it('subscribeUsuarios entrega la lista de usuarios de Firestore', async () => {
    await saveUsuarioFirestore(mkUsuario({ id: 'u_1' }));
    await saveUsuarioFirestore(mkUsuario({ id: 'u_2', email: 'otro@test.es' }));
    const recibidos = await new Promise<UsuarioApp[]>((resolveP) => {
      subscribeUsuarios((data) => resolveP(data));
    });
    expect(recibidos.map((u) => u.id).sort()).toEqual(['u_1', 'u_2']);
    expect(recibidos[0]).toHaveProperty('email');
  });

  it('reglas: el listado de usuarios es solo-master (tripwire)', () => {
    const bloque = reglasUsuarios();
    expect(bloque).toContain('allow list: if isMasterAdmin();');
    expect(bloque.match(/allow list:/g)?.length).toBe(1);
  });

  it('reglas: master = email único sarqsan2@gmail.com (tripwire)', () => {
    const rules = readFileSync(root('firestore.rules'), 'utf-8');
    expect(rules).toContain("authEmail() == 'sarqsan2@gmail.com'");
  });
});

// ---------------------------------------------------------------------------
// 2. EDICIÓN: persiste sobre el documento existente (merge)
// ---------------------------------------------------------------------------
describe('Admin usuarios — edición persiste sobre el documento existente', () => {
  it('guardar sin contratoIds conserva los vínculos y actualiza el resto (merge)', async () => {
    const base = mkUsuario({ id: 'u_merge', contratoIds: ['c1'], estado: 'ACTIVO' });
    await saveUsuarioFirestore(base);
    const { contratoIds: _omit, ...sinVínculos } = base;
    expect(_omit).toEqual(['c1']);
    await saveUsuarioFirestore({ ...sinVínculos, estado: 'BLOQUEADO' });
    const snap = await getDoc(doc(null as never, 'usuarios', 'u_merge'));
    const data = snap.data() as UsuarioApp;
    expect(data.estado).toBe('BLOQUEADO');
    expect(data.contratoIds).toEqual(['c1']);
    expect(data.nombre).toBe('Carlos');
  });

  it('no crea un segundo documento al editar (mismo id)', async () => {
    await saveUsuarioFirestore(mkUsuario({ id: 'u_mismo' }));
    await saveUsuarioFirestore(mkUsuario({ id: 'u_mismo', telefono: '+34600000000' }));
    const snap = await getDoc(doc(null as never, 'usuarios', 'u_mismo'));
    expect((snap.data() as UsuarioApp).telefono).toBe('+34600000000');
    expect(mem.store.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. esUsuarioMaster
// ---------------------------------------------------------------------------
describe('esUsuarioMaster', () => {
  it('detecta por id reservado', () => {
    expect(esUsuarioMaster({ id: MASTER_USER_ID, email: 'x@y.es' })).toBe(true);
  });

  it('detecta por email maestro (insensible a mayúsculas)', () => {
    expect(esUsuarioMaster({ id: 'u_otro', email: 'SARQSAN2@GMAIL.COM' })).toBe(true);
  });

  it('rechaza usuarios normales y nulos', () => {
    expect(esUsuarioMaster({ id: 'u_x', email: 'x@y.es' })).toBe(false);
    expect(esUsuarioMaster(null)).toBe(false);
    expect(esUsuarioMaster(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. VALIDADOR DE EDICIÓN
// ---------------------------------------------------------------------------
describe('validarEdicionAdmin — ediciones aceptadas', () => {
  it('acepta cambio de estado ACTIVO→BLOQUEADO a un tercero', () => {
    const o = mkUsuario();
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, estado: 'BLOQUEADO' } })
    ).toBeNull();
  });

  it('acepta ACTIVO→INACTIVO y BLOQUEADO→ACTIVO', () => {
    const o = mkUsuario();
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, estado: 'INACTIVO' } })
    ).toBeNull();
    const b = mkUsuario({ estado: 'BLOQUEADO' });
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: b, editado: { ...b, estado: 'ACTIVO' } })
    ).toBeNull();
  });

  it('acepta cambios de roles (no-super) y permisos a un tercero', () => {
    const o = mkUsuario();
    expect(
      validarEdicionAdmin({
        operador: OP_MASTER,
        original: o,
        editado: { ...o, roles: ['PROPIETARIO_ESTANDAR', 'GESTOR_COBROS'], permisos: ['inmuebles.ver', 'cobros.ver'] },
      })
    ).toBeNull();
  });

  it('acepta cambios de nombre/apellidos/teléfono (incluida autoedición de contacto)', () => {
    const o = mkUsuario();
    const self = { id: o.id, email: o.email };
    expect(
      validarEdicionAdmin({
        operador: self,
        original: o,
        editado: { ...o, nombre: 'Carlos Luis', telefono: '+34600000001' },
      })
    ).toBeNull();
  });
});

describe('validarEdicionAdmin — rechazos de integridad', () => {
  it('rechaza sin operador y con id distinto', () => {
    const o = mkUsuario();
    expect(validarEdicionAdmin({ operador: null, original: o, editado: o })).toMatch(/operador/);
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, id: 'u_otro' } })
    ).toMatch(/identificador/);
  });

  it('rechaza nombre vacío', () => {
    const o = mkUsuario();
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, nombre: '  ' } })
    ).toMatch(/nombre/);
  });
});

describe('validarEdicionAdmin — estados e invitaciones', () => {
  it('rechaza crear PENDIENTE manual (ACTIVO→PENDIENTE)', () => {
    const o = mkUsuario();
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, estado: 'PENDIENTE' } })
    ).toMatch(/pendiente/);
  });

  it('rechaza activar una invitación manualmente (PENDIENTE→ACTIVO)', () => {
    const o = mkUsuario({ estado: 'PENDIENTE' });
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, estado: 'ACTIVO' } })
    ).toMatch(/invitación/);
  });

  it('rechaza PENDIENTE→BLOQUEADO (el pendiente lo gestiona la invitación)', () => {
    const o = mkUsuario({ estado: 'PENDIENTE' });
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, estado: 'BLOQUEADO' } })
    ).toMatch(/invitación/);
  });
});

describe('validarEdicionAdmin — identidad y vínculos inmutables', () => {
  it('rechaza cambiar authUid y uid', () => {
    const o = mkUsuario({ authUid: 'uid_1', uid: 'uid_1' });
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, authUid: 'uid_2' } })
    ).toMatch(/authUid/);
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, uid: 'uid_2' } })
    ).toMatch(/uid/);
  });

  it('rechaza cambiar email y tipoPerfil', () => {
    const o = mkUsuario();
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, email: 'nuevo@test.es' } })
    ).toMatch(/email/);
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, tipoPerfil: 'PROFESIONAL' } })
    ).toMatch(/perfil/);
  });

  it('rechaza cambiar vínculos (fichas, contratos, viviendas, invitación)', () => {
    const casos: Array<[string, Partial<UsuarioApp>]> = [
      ['propietarioId', { propietarioId: 'p9' }],
      ['profesionalId', { profesionalId: 'f9' }],
      ['contratoIds', { contratoIds: ['c9'] }],
      ['inmuebleIds', { inmuebleIds: ['i9'] }],
      ['enlaceRegistroId', { enlaceRegistroId: 'e9' }],
    ];
    for (const [campo, cambio] of casos) {
      const o = mkUsuario();
      expect(
        validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, ...cambio } }),
        campo
      ).toMatch(/vínculos/);
    }
  });
});

describe('validarEdicionAdmin — SUPERADMIN y master', () => {
  it('rechaza asignar SUPERADMIN a un tercero', () => {
    const o = mkUsuario();
    expect(
      validarEdicionAdmin({
        operador: OP_MASTER,
        original: o,
        editado: { ...o, roles: [...o.roles, 'SUPERADMIN'] },
      })
    ).toMatch(/SUPERADMIN/);
  });

  it('rechaza modificar roles de un SUPERADMIN existente', () => {
    const o = mkUsuario({ roles: ['SUPERADMIN'] });
    expect(
      validarEdicionAdmin({ operador: OP_MASTER, original: o, editado: { ...o, roles: [] } })
    ).toMatch(/SUPERADMIN/);
  });

  it('protege a la cuenta maestra: estado, roles y permisos inmutables', () => {
    const m = mkMaster();
    expect(
      validarEdicionAdmin({ operador: OP_OTRO, original: m, editado: { ...m, estado: 'BLOQUEADO' } })
    ).toMatch(/maestra/);
    expect(
      validarEdicionAdmin({ operador: OP_OTRO, original: m, editado: { ...m, roles: [] } })
    ).toMatch(/maestra/);
    expect(
      validarEdicionAdmin({ operador: OP_OTRO, original: m, editado: { ...m, permisos: [] } })
    ).toMatch(/maestra/);
  });

  it('permite a la maestra cambiar su propio nombre/teléfono', () => {
    const m = mkMaster();
    expect(
      validarEdicionAdmin({
        operador: OP_MASTER,
        original: m,
        editado: { ...m, nombre: 'Master Nuevo', telefono: '+34600000000' },
      })
    ).toBeNull();
  });
});

describe('validarEdicionAdmin — autoedición', () => {
  it('rechaza modificar los propios roles y permisos', () => {
    const o = mkUsuario({ id: 'u_self' });
    const self = { id: 'u_self', email: o.email };
    expect(
      validarEdicionAdmin({ operador: self, original: o, editado: { ...o, roles: ['OTRO_ROL'] } })
    ).toMatch(/propios roles/);
    expect(
      validarEdicionAdmin({ operador: self, original: o, editado: { ...o, permisos: [] } })
    ).toMatch(/propios permisos/);
  });

  it('rechaza autobloqueo y autodesactivación', () => {
    const o = mkUsuario({ id: 'u_self' });
    const self = { id: 'u_self', email: o.email };
    expect(
      validarEdicionAdmin({ operador: self, original: o, editado: { ...o, estado: 'BLOQUEADO' } })
    ).toMatch(/propia cuenta/);
    expect(
      validarEdicionAdmin({ operador: self, original: o, editado: { ...o, estado: 'INACTIVO' } })
    ).toMatch(/propia cuenta/);
  });
});

// ---------------------------------------------------------------------------
// 5. AUDITORÍA: diff de campos
// ---------------------------------------------------------------------------
describe('Auditoría — resumenCambiosUsuario', () => {
  it('describe escalares con formato antes→después', () => {
    const o = mkUsuario();
    const r = resumenCambiosUsuario(o, { ...o, estado: 'BLOQUEADO', telefono: '+341' });
    expect(r).toContain('estado: ACTIVO→BLOQUEADO');
    expect(r).toContain('teléfono: —→+341');
  });

  it('describe arrays como delta +añadido/-retirado', () => {
    const o = mkUsuario({ permisos: ['inmuebles.ver', 'cobros.ver'] });
    const r = resumenCambiosUsuario(o, { ...o, permisos: ['cobros.ver', 'contratos.ver'] });
    expect(r).toContain('permisos: +contratos.ver, -inmuebles.ver');
  });

  it('ignora metadatos (updatedAt/createdAt/lastLoginAt)', () => {
    const o = mkUsuario();
    const r = resumenCambiosUsuario(o, {
      ...o,
      updatedAt: AHORA,
      createdAt: AHORA,
      lastLoginAt: AHORA,
    });
    expect(r).toBe('sin cambios administrativos');
  });

  it('lista exactamente los campos tocados y nunca secretos', () => {
    const o = mkUsuario();
    const editado = { ...o, estado: 'INACTIVO' as const };
    expect(camposModificadosUsuario(o, editado)).toEqual(['estado']);
    expect(resumenCambiosUsuario(o, editado)).not.toMatch(/password|secret|token/i);
  });

  it('App audita la edición como MODIFICAR_USUARIO con diff (tripwire)', () => {
    const app = readFileSync(root('src/App.tsx'), 'utf-8');
    expect(app).toContain("'MODIFICAR_USUARIO'");
    expect(app).toContain('resumenCambiosUsuario(previo, user)');
    expect(app).toContain('operador={currentUser');
  });
});

// ---------------------------------------------------------------------------
// 6. CrearUsuarioModal — modo edición
// ---------------------------------------------------------------------------
describe('CrearUsuarioModal — edición', () => {
  it('identifica al usuario editado (nombre, email, perfil)', () => {
    const html = renderModal({ usuarioParaEditar: mkUsuario(), operador: OP_MASTER });
    expect(html).toContain('Modificar Usuario y Permisos');
    expect(html).toContain('Carlos');
    expect(html).toContain('carlos@test.es');
    expect(html).toContain('PROPIETARIO');
  });

  it('bloquea email y perfil (sin select de perfil)', () => {
    const html = renderModal({ usuarioParaEditar: mkUsuario(), operador: OP_MASTER });
    expect(html).toMatch(/readOnly/i);
    expect(html).toContain('data-testid="perfil-badge"');
    expect(html).not.toContain('Acceso Completo');
  });

  it('no ofrece PENDIENTE al editar un usuario ACTIVO', () => {
    const html = renderModal({ usuarioParaEditar: mkUsuario(), operador: OP_MASTER });
    expect(html).not.toContain('value="PENDIENTE"');
    expect(html).toContain('value="BLOQUEADO"');
    expect(html).toContain('value="INACTIVO"');
  });

  it('conserva PENDIENTE bloqueado al editar un pendiente (invitación)', () => {
    const html = renderModal({
      usuarioParaEditar: mkUsuario({ estado: 'PENDIENTE', contratoIds: ['c1', 'c2'] }),
      operador: OP_MASTER,
    });
    expect(html).toContain('value="PENDIENTE"');
    expect(html).toContain('disabled="" data-testid="estado-select"');
    expect(html).toContain('2 contrato(s) preservado(s)');
  });

  it('oculta SUPERADMIN al editar un usuario normal', () => {
    const html = renderModal({ usuarioParaEditar: mkUsuario(), operador: OP_MASTER });
    expect(html).not.toContain('SUPERADMIN');
  });

  it('protege a la maestra: aviso + roles/permisos/estado bloqueados', () => {
    const html = renderModal({ usuarioParaEditar: mkMaster(), operador: OP_MASTER });
    expect(html).toContain('data-testid="aviso-master"');
    expect(html).toContain('Cuenta maestra protegida');
    expect(html).toContain('Roles bloqueados en esta cuenta.');
    expect(html).toContain('Permisos bloqueados en esta cuenta.');
    expect(html).toContain('disabled="" data-testid="estado-select"');
    expect(html).toContain('No gestionable desde este editor');
  });

  it('avisa en autoedición (sin aviso de master)', () => {
    const self = mkUsuario({ id: 'u_self' });
    const html = renderModal({
      usuarioParaEditar: self,
      operador: { id: 'u_self', email: self.email },
    });
    expect(html).toContain('data-testid="aviso-self"');
    expect(html).not.toContain('data-testid="aviso-master"');
  });

  it('edición a terceros: sin avisos y con guardar/cancelar', () => {
    const html = renderModal({ usuarioParaEditar: mkUsuario(), operador: OP_MASTER });
    expect(html).not.toContain('data-testid="aviso-self"');
    expect(html).not.toContain('data-testid="aviso-master"');
    expect(html).toContain('Actualizar Usuario');
    expect(html).toContain('Cancelar');
  });

  it('muestra info de cuenta de acceso y vínculos preservados', () => {
    const html = renderModal({
      usuarioParaEditar: mkUsuario({ authUid: 'uid_1' }),
      operador: OP_MASTER,
    });
    expect(html).toContain('data-testid="auth-info"');
    expect(html).toContain('vinculada');
    expect(html).toContain('Fichas y vínculos preservados.');
  });
});

describe('CrearUsuarioModal — creación intacta', () => {
  it('alta normal: sin PENDIENTE manual y con select de perfil', () => {
    const html = renderModal({ operador: OP_MASTER });
    expect(html).toContain('Dar de Alta Nuevo Usuario');
    expect(html).not.toContain('value="PENDIENTE"');
    expect(html).toContain('Administrador (Acceso Completo)');
    expect(html).not.toContain('data-testid="auth-info"');
    expect(html).not.toContain('data-testid="perfil-badge"');
  });

  it('un objeto sin id (p. ej. evento) abre creación, no edición', () => {
    const html = renderModal({ usuarioParaEditar: {} as unknown as UsuarioApp, operador: OP_MASTER });
    expect(html).toContain('Dar de Alta Nuevo Usuario');
    expect(html).not.toContain('Modificar Usuario y Permisos');
  });

  it('prefill nominal: alta PENDIENTE bloqueada (flujo invitación intacto)', () => {
    const html = renderModal({
      usuarioParaEditar: { nombre: 'Nominal', email: 'nom@test.es', estado: 'PENDIENTE' } as UsuarioApp,
      operador: OP_MASTER,
    });
    expect(html).toContain('Dar de Alta Nuevo Usuario');
    expect(html).toContain('value="PENDIENTE"');
    expect(html).toContain('disabled="" data-testid="estado-select"');
  });
});

// ---------------------------------------------------------------------------
// 7. AdminControlCenter — consulta y entrada de edición
// ---------------------------------------------------------------------------
describe('AdminControlCenter — tabla de usuarios', () => {
  const USUARIOS: UsuarioApp[] = [
    mkMaster(),
    mkUsuario({ id: 'u_owner', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }),
    mkUsuario({ id: 'u_inq', nombre: 'Inquilino', email: 'inq@test.es', tipoPerfil: 'INQUILINO', estado: 'PENDIENTE' }),
    mkUsuario({ id: 'u_prof', nombre: 'Prof', email: 'prof@test.es', tipoPerfil: 'PROFESIONAL', estado: 'INACTIVO' }),
    mkUsuario({ id: 'u_bloq', nombre: 'Bloq', email: 'bloq@test.es', estado: 'BLOQUEADO' }),
  ];

  it('muestra un botón Editar por fila (incluida la propia)', () => {
    const html = renderCenterUsuarios(USUARIOS);
    const n = (html.match(/data-testid="editar-usuario-/g) || []).length;
    expect(n).toBe(5);
    expect(html).toContain('title="Editar usuario"');
  });

  it('muestra email, perfil y fecha de cada usuario', () => {
    const html = renderCenterUsuarios(USUARIOS);
    expect(html).toContain('carlos@test.es');
    expect(html).toContain('inq@test.es');
    expect(html).toContain('INQUILINO');
  });

  it('distingue los cuatro estados con badge propio', () => {
    const html = renderCenterUsuarios(USUARIOS);
    expect(html).toContain('>Activo<');
    expect(html).toContain('>Bloqueado<');
    expect(html).toContain('>Inactivo<');
    expect(html).toContain('>Pendiente<');
  });

  it('filtros completos: INQUILINO + PENDIENTE/INACTIVO', () => {
    const html = renderCenterUsuarios(USUARIOS);
    expect(html).toContain('value="INQUILINO"');
    expect(html).toContain('>Pendientes<');
    expect(html).toContain('>Inactivos<');
  });
});

// ---------------------------------------------------------------------------
// 8. Reglas: vía segura existente para update (SIN cambios)
// ---------------------------------------------------------------------------
describe('firestore.rules — update de usuarios reutiliza la vía segura', () => {
  it('bypass master + tipoPerfil/roles inmutables para el resto', () => {
    const bloque = reglasUsuarios();
    expect(bloque).toContain('allow update: if isMasterAdmin() || (');
    expect(bloque).toContain('incoming().tipoPerfil == existing().tipoPerfil');
    expect(bloque).toContain('incoming().roles == existing().roles');
  });

  it('estado inmutable salvo activación nominal PENDIENTE→ACTIVO', () => {
    const bloque = reglasUsuarios();
    expect(bloque).toContain('incoming().estado == existing().estado');
    expect(bloque).toContain("existing().estado == 'PENDIENTE'");
    expect(bloque).toContain("incoming().estado == 'ACTIVO'");
  });

  it('veta identidad, permisos y vínculos al no-master', () => {
    const bloque = reglasUsuarios();
    for (const clave of [
      "'permisos'",
      "'propietarioId'",
      "'profesionalId'",
      "'inmuebleIds'",
      "'email'",
      "'contratoIds'",
      "'authUid'",
    ]) {
      expect(bloque, clave).toContain(clave);
    }
  });

  it('borrado solo-master (sin cambios)', () => {
    expect(reglasUsuarios()).toContain('allow delete: if isMasterAdmin();');
  });
});

// ---------------------------------------------------------------------------
// 9. Regresión: catálogo de permisos/roles
// ---------------------------------------------------------------------------
describe('Catálogo — regresión (sin inventar ni limpiar)', () => {
  it('duplicados de tesorería documentados (se reportan, no se limpian)', () => {
    for (const codigo of ['tesoreria.ver', 'tesoreria.sepa', 'tesoreria.liquidar']) {
      const n = PERMISOS_SISTEMA.filter((p) => p.codigo === codigo).length;
      expect(n, codigo).toBe(2);
    }
  });

  it('roles predefinidos íntegros (SUPERADMIN + alta clásica)', () => {
    const ids = ROLES_PREDEFINIDOS.map((r) => r.id);
    expect(ids).toContain('SUPERADMIN');
    expect(ids).toContain('PROPIETARIO_ESTANDAR');
    expect(ids).toContain('PROFESIONAL_MANTENIMIENTO');
  });
});
