/**
 * BORRADO SEGURO — BAJA DE ACCESO (sin borrado patrimonial).
 * El borrado FÍSICO no es seguro con la arquitectura actual (sin vía de
 * borrado Auth; espejo rancio + isStaff() dejarían acceso residual), por lo
 * que NO se implementa: la operación segura es la BAJA (INACTIVO + espejo
 * sincronizado + auditoría BAJA_USUARIO), sin estados nuevos y sin reglas.
 * Suite:
 *  - Seguridad: master/self/SUPERADMIN/pendiente/inactivo protegidos;
 *    ejecución restringida (validador + reglas por tripwire).
 *  - Integridad: la baja solo cambia el estado; fichas, contratos, inmuebles,
 *    documentos y auditoría intactos; sin cascadas (tripwires).
 *  - Auth: sin vía de borrado (no deleteUser, no firebase-admin); el espejo
 *    se re-sincroniza en cada login (auto-reparación documentada).
 *  - UI: acción "Dar de baja" diferenciada + confirmación explícita.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

vi.mock('../src/lib/authService', () => ({
  ADMIN_MASTER_EMAIL: 'sarqsan2@gmail.com',
}));

import {
  esUsuarioMaster,
  validarBajaUsuario,
  aplicarBajaUsuario,
  detalleBajaUsuario,
  MASTER_USER_ID,
} from '../src/lib/adminUsuarios';
import {
  AdminControlCenter,
  BajaUsuarioConfirmacion,
} from '../src/components/admin/AdminControlCenter';
import type { UsuarioApp } from '../src/types';

const root = (p: string) => resolve(process.cwd(), p);
const bloqueRules = (inicio: string): string => {
  const rules = readFileSync(root('firestore.rules'), 'utf-8');
  const ini = rules.indexOf(inicio);
  const fin = rules.indexOf('\n    match /', ini + inicio.length);
  return rules.slice(ini, fin);
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
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
  });

const OP_MASTER = { id: MASTER_USER_ID, email: 'sarqsan2@gmail.com' };

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
  onBajaUsuario: async () => {},
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

// ---------------------------------------------------------------------------
// 1. SEGURIDAD — validador de baja
// ---------------------------------------------------------------------------
describe('validarBajaUsuario', () => {
  it('acepta la baja de ACTIVO y de BLOQUEADO por el master', () => {
    expect(validarBajaUsuario({ operador: OP_MASTER, objetivo: mkUsuario() })).toBeNull();
    expect(
      validarBajaUsuario({
        operador: OP_MASTER,
        objetivo: mkUsuario({ estado: 'BLOQUEADO' }),
      })
    ).toBeNull();
  });

  it('rechaza sin operador o sin objetivo', () => {
    expect(validarBajaUsuario({ operador: null, objetivo: mkUsuario() })).toMatch(/operador/);
    expect(
      validarBajaUsuario({ operador: OP_MASTER, objetivo: null as unknown as UsuarioApp })
    ).toMatch(/objetivo/);
  });

  it('rechaza la auto-baja', () => {
    const o = mkUsuario({ id: 'u_self' });
    expect(
      validarBajaUsuario({ operador: { id: 'u_self', email: o.email }, objetivo: o })
    ).toMatch(/propia cuenta/);
  });

  it('rechaza dar de baja a la cuenta maestra (por id y por email)', () => {
    const otro = { id: 'u_admin2', email: 'admin2@test.es' };
    expect(validarBajaUsuario({ operador: otro, objetivo: mkMaster() })).toMatch(/maestra/);
    expect(
      validarBajaUsuario({
        operador: OP_MASTER,
        objetivo: mkUsuario({ id: 'u_x', email: 'sarqsan2@gmail.com' }),
      })
    ).toMatch(/maestra/);
    expect(esUsuarioMaster(mkMaster())).toBe(true);
  });

  it('rechaza dar de baja a otro SUPERADMIN', () => {
    const o = mkUsuario({ id: 'u_super2', roles: ['SUPERADMIN'] });
    expect(validarBajaUsuario({ operador: OP_MASTER, objetivo: o })).toMatch(/SUPERADMIN/);
  });

  it('rechaza pendientes (invitación) e inactivos (ya de baja)', () => {
    expect(
      validarBajaUsuario({
        operador: OP_MASTER,
        objetivo: mkUsuario({ estado: 'PENDIENTE' }),
      })
    ).toMatch(/invitación/);
    expect(
      validarBajaUsuario({ operador: OP_MASTER, objetivo: mkUsuario({ estado: 'INACTIVO' }) })
    ).toMatch(/ya está de baja/);
  });
});

// ---------------------------------------------------------------------------
// 2. INTEGRIDAD — la baja solo cambia el estado
// ---------------------------------------------------------------------------
describe('aplicarBajaUsuario', () => {
  it('pasa a INACTIVO preservando identidad, authUid y metadatos', () => {
    const o = mkUsuario({ estado: 'BLOQUEADO', authUid: 'uid_1', uid: 'uid_1' });
    const b = aplicarBajaUsuario(o);
    expect(b.estado).toBe('INACTIVO');
    expect(b.id).toBe(o.id);
    expect(b.authUid).toBe('uid_1');
    expect(b.uid).toBe('uid_1');
    expect(b.email).toBe(o.email);
    expect(b.tipoPerfil).toBe(o.tipoPerfil);
    expect(b.createdAt).toBe(o.createdAt);
  });

  it('preserva vínculos, contratos, roles y permisos (sin cascadas)', () => {
    const o = mkUsuario({
      propietarioId: 'p1',
      profesionalId: 'f1',
      contratoIds: ['c1', 'c2'],
      inmuebleIds: ['i1'],
      enlaceRegistroId: 'e1',
      roles: ['PROPIETARIO_ESTANDAR'],
      permisos: ['inmuebles.ver', 'cobros.ver'],
    });
    const b = aplicarBajaUsuario(o);
    expect(b.propietarioId).toBe('p1');
    expect(b.profesionalId).toBe('f1');
    expect(b.contratoIds).toEqual(['c1', 'c2']);
    expect(b.inmuebleIds).toEqual(['i1']);
    expect(b.enlaceRegistroId).toBe('e1');
    expect(b.roles).toEqual(['PROPIETARIO_ESTANDAR']);
    expect(b.permisos).toEqual(['inmuebles.ver', 'cobros.ver']);
  });
});

describe('detalleBajaUsuario', () => {
  it('registra transición, conservación y motivo', () => {
    const d = detalleBajaUsuario(mkUsuario(), 'Fin de contrato', 'ACTIVO');
    expect(d).toContain('ACTIVO→INACTIVO');
    expect(d).toContain('carlos@test.es');
    expect(d).toContain('Se conserva ficha patrimonial, inmuebles, contratos, documentos, históricos y auditoría.');
    expect(d).toContain('Motivo: Fin de contrato');
  });

  it('sin motivo no inventa texto y nunca incluye secretos', () => {
    const d = detalleBajaUsuario(mkUsuario(), undefined, 'BLOQUEADO');
    expect(d).toContain('BLOQUEADO→INACTIVO');
    expect(d).not.toContain('Motivo:');
    expect(d).not.toMatch(/password|secret|token/i);
  });
});

// ---------------------------------------------------------------------------
// 3. UI — confirmación explícita diferenciada
// ---------------------------------------------------------------------------
describe('BajaUsuarioConfirmacion', () => {
  const renderConf = (over: Record<string, unknown> = {}): string =>
    renderToStaticMarkup(
      React.createElement(BajaUsuarioConfirmacion, {
        usuario: mkUsuario(),
        motivo: '',
        onMotivoChange: () => {},
        error: '',
        guardando: false,
        onConfirm: () => {},
        onCancel: () => {},
        ...over,
      })
    );

  it('identifica al afectado y declara qué se conserva (sin ambigüedad)', () => {
    const html = renderConf();
    expect(html).toContain('data-testid="baja-confirmacion"');
    expect(html).toContain('Dar de baja de acceso');
    expect(html).toContain('Carlos');
    expect(html).toContain('carlos@test.es');
    expect(html).toContain('retirará el acceso del usuario (pasará a INACTIVO)');
    expect(html).toContain('No se elimina ningún dato patrimonial.');
  });

  it('pide motivo opcional y ofrece Confirmar baja / Cancelar', () => {
    const html = renderConf();
    expect(html).toContain('data-testid="baja-motivo"');
    expect(html).toContain('Motivo (opcional)');
    expect(html).toContain('data-testid="baja-confirmar"');
    expect(html).toContain('Confirmar baja');
    expect(html).toContain('Cancelar');
  });

  it('muestra errores de validación y estado de guardado', () => {
    expect(renderConf({ error: 'No puedes dar de baja tu propia cuenta.' })).toContain(
      'data-testid="baja-error"'
    );
    expect(renderConf({ guardando: true })).toContain('Tramitando baja');
  });
});

describe('AdminControlCenter — visibilidad de Dar de baja', () => {
  const USUARIOS: UsuarioApp[] = [
    mkMaster(),
    mkUsuario({ id: 'u_owner', estado: 'ACTIVO' }),
    mkUsuario({ id: 'u_bloq', nombre: 'Bloq', email: 'bloq@test.es', estado: 'BLOQUEADO' }),
    mkUsuario({ id: 'u_admin2', nombre: 'Admin2', email: 'admin2@test.es', tipoPerfil: 'ADMINISTRADOR', roles: ['ADMIN_EMPRESA'], estado: 'ACTIVO' }),
    mkUsuario({ id: 'u_super2', nombre: 'Super2', email: 'super2@test.es', roles: ['SUPERADMIN'], estado: 'ACTIVO' }),
    mkUsuario({ id: 'u_inq', nombre: 'Inq', email: 'inq@test.es', tipoPerfil: 'INQUILINO', estado: 'PENDIENTE' }),
    mkUsuario({ id: 'u_old', nombre: 'Old', email: 'old@test.es', estado: 'INACTIVO' }),
  ];

  it('visible solo en ACTIVO/BLOQUEADO no protegidos', () => {
    const html = renderCenterUsuarios(USUARIOS);
    expect(html).toContain('data-testid="baja-usuario-u_owner"');
    expect(html).toContain('data-testid="baja-usuario-u_bloq"');
    expect(html).toContain('data-testid="baja-usuario-u_admin2"');
    const n = (html.match(/data-testid="baja-usuario-/g) || []).length;
    expect(n).toBe(3);
  });

  it('oculta en master, SUPERADMIN, pendiente e inactivo', () => {
    const html = renderCenterUsuarios(USUARIOS);
    expect(html).not.toContain(`baja-usuario-${MASTER_USER_ID}`);
    expect(html).not.toContain('baja-usuario-u_super2');
    expect(html).not.toContain('baja-usuario-u_inq');
    expect(html).not.toContain('baja-usuario-u_old');
  });

  it('sin botones ambiguos de borrado en la tabla', () => {
    const html = renderCenterUsuarios(USUARIOS);
    expect(html).toContain('title="Dar de baja de acceso (conserva datos patrimoniales)"');
    expect(html).not.toContain('Eliminar');
  });
});

// ---------------------------------------------------------------------------
// 4. CABLEADO App — actualización controlada (tripwires)
// ---------------------------------------------------------------------------
describe('App — handleBajaUsuario (tripwires)', () => {
  const handlerSrc = (): string => {
    const app = readFileSync(root('src/App.tsx'), 'utf-8');
    const ini = app.indexOf('const handleBajaUsuario');
    const fin = app.indexOf('\n  };', ini);
    return app.slice(ini, fin);
  };

  it('valida, aplica, guarda por merge, sincroniza espejo y audita BAJA_USUARIO', () => {
    const h = handlerSrc();
    expect(h).toContain('validarBajaUsuario');
    expect(h).toContain('aplicarBajaUsuario');
    expect(h).toContain('saveUsuarioFirestore(deBaja)');
    expect(h).toContain('syncAuthIndex');
    expect(h).toContain("'BAJA_USUARIO'");
    expect(h).toContain('detalleBajaUsuario');
  });

  it('NO usa borrado físico ni toca Auth', () => {
    const h = handlerSrc();
    expect(h).not.toContain('deleteDoc');
    expect(h).not.toContain('deleteUsuarioFirestore');
    expect(h).not.toContain('deleteUser');
  });

  it('el centro recibe onBajaUsuario', () => {
    expect(readFileSync(root('src/App.tsx'), 'utf-8')).toContain('onBajaUsuario={handleBajaUsuario}');
  });
});

// ---------------------------------------------------------------------------
// 5. REGLAS — ejecución restringida y auditoría append-only (tripwires)
// ---------------------------------------------------------------------------
describe('firestore.rules — baja por actualización controlada (tripwires)', () => {
  it('update usuarios: bypass master + estado inmutable para no-master', () => {
    const b = bloqueRules('match /usuarios/{usuarioId}');
    expect(b).toContain('allow update: if isMasterAdmin() || (');
    expect(b).toContain('incoming().estado == existing().estado');
  });

  it('espejo: solo master o uid propio veraz (un normal no toca espejos ajenos)', () => {
    const b = bloqueRules('match /usuarios_auth/{uid}');
    expect(b).toContain('allow update: if isMasterAdmin() || (');
    expect(b).toContain('request.auth.uid == uid');
    expect(b).toContain('indexIsTruthful()');
  });

  it('auditoría append-only: sin update ni delete', () => {
    expect(bloqueRules('match /audit_logs/{auditId}')).toContain('allow update, delete: if false');
  });

  it('usuarios delete sigue master-only preexistente (el panel no lo usa)', () => {
    expect(bloqueRules('match /usuarios/{usuarioId}')).toContain('allow delete: if isMasterAdmin();');
  });
});

// ---------------------------------------------------------------------------
// 6. AUTH — sin vía de borrado desde frontend
// ---------------------------------------------------------------------------
describe('Auth — borrado fuera del bloque (tripwires)', () => {
  it('no existe deleteUser en authService, firebase ni App', () => {
    for (const f of ['src/lib/authService.ts', 'src/lib/firebase.ts', 'src/App.tsx']) {
      expect(readFileSync(root(f), 'utf-8'), f).not.toContain('deleteUser');
    }
  });

  it('sin Firebase Admin SDK (ni dependencia ni import)', () => {
    expect(readFileSync(root('package.json'), 'utf-8')).not.toContain('firebase-admin');
    expect(readFileSync(root('src/lib/authService.ts'), 'utf-8')).not.toContain('firebase-admin');
  });

  it('el espejo se re-sincroniza en cada login (auto-reparación documentada)', () => {
    expect(readFileSync(root('src/lib/authService.ts'), 'utf-8')).toContain('syncAuthIndex(usuario');
  });
});

// ---------------------------------------------------------------------------
// 7. REGRESIÓN — sin estados nuevos; borrado físico inalcanzable en vivo
// ---------------------------------------------------------------------------
describe('Regresión', () => {
  it('no se inventa un estado BAJA (INACTIVO reutilizado)', () => {
    const types = readFileSync(root('src/types.ts'), 'utf-8');
    expect(types).toContain(
      "export type EstadoUsuario = 'ACTIVO' | 'PENDIENTE' | 'BLOQUEADO' | 'INACTIVO';"
    );
  });

  it('el borrado físico sigue inalcanzable: el centro nunca invoca onDeleteUsuario', () => {
    const center = readFileSync(root('src/components/admin/AdminControlCenter.tsx'), 'utf-8');
    expect(center.match(/onDeleteUsuario/g)?.length).toBe(2); // prop + destructure, sin llamada
    const dead = readFileSync(root('src/components/sections/AdministracionSection.tsx'), 'utf-8');
    expect(dead).toContain('onDeleteUsuario(usr.id)'); // única llamada: código muerto documentado
  });
});
