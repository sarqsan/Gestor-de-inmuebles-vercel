/**
 * REGISTRO AUTÓNOMO — UI (selector + formularios propietario/profesional).
 * Sin dependencias DOM (entorno node): marcado vía `renderToStaticMarkup`,
 * lógica vía el módulo puro `registroAutonomoForm` (orquestador inyectable)
 * y tripwires textuales de cableado (vista, App, LoginView, servicio).
 *  - UI propietario: formulario, obligatorios, llamada a registerAutonomo,
 *    sin registerWithInvitationLink, errores, éxito → portal (onComplete).
 *  - UI profesional: formulario, catálogo existente, llamada al servicio,
 *    sin token, errores, éxito → portal profesional.
 *  - Regresión textual: invitaciones, login, setup admin intactos.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock del servicio (la vista lo importa como valor; el orquestador lo inyecta)
// ---------------------------------------------------------------------------
const authMock = vi.hoisted(() => ({
  registerAutonomo: vi.fn(),
  loginWithEmail: vi.fn(),
  initFirstAdminAccount: vi.fn(),
}));

vi.mock('../src/lib/authService', () => ({
  registerAutonomo: authMock.registerAutonomo,
  loginWithEmail: authMock.loginWithEmail,
  initFirstAdminAccount: authMock.initFirstAdminAccount,
  ADMIN_MASTER_EMAIL: 'admin@test.es',
}));

import { RegistroAutonomoView } from '../src/components/RegistroAutonomoView';
import { LoginView } from '../src/components/LoginView';
import {
  enviarRegistroAutonomo,
  esEmailRegistroValido,
  mapearErrorRegistroAutonomo,
  validarFormularioPropietario,
} from '../src/lib/registroAutonomoForm';
import type {
  ValoresRegistroProfesional,
  ValoresRegistroPropietario,
} from '../src/lib/registroAutonomoForm';
import type { Especialidad, UsuarioApp } from '../src/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ESPS: Especialidad[] = [
  { id: 'e1', nombre: 'Fontanería', activa: true, orden: 1 },
  { id: 'e2', nombre: 'Electricidad', activa: true, orden: 2 },
];
const CATALOGO = ESPS.map((e) => e.nombre);

const VAL_PROP: ValoresRegistroPropietario = {
  nombre: 'Carmen',
  apellidos: 'Ruiz Sanz',
  email: '  carmen@test.es  ',
  telefono: '+34600111222',
  nifCif: '12345678Z',
  direccion: 'Calle Mayor 1, 2B',
  ciudad: 'Almería',
  codigoPostal: '04001',
  provincia: ' Almería ',
  tipoPropietario: 'persona_fisica',
  password: 'Secreta123',
  confirmPassword: 'Secreta123',
};

const VAL_PROF: ValoresRegistroProfesional = {
  nombre: 'Luis',
  apellidos: '',
  email: 'luis@test.es',
  telefono: '',
  nombreComercial: 'Fontanería Luis',
  cifNif: '',
  tipo: 'EMPRESA',
  especialidades: ['Fontanería'],
  provincia: 'Almería',
  municipio: '',
  zonasAdicionales: [
    { provincia: 'Granada', municipio: 'Motril' },
    { provincia: 'Murcia', municipio: '' },
  ],
  password: 'Secreta123',
  confirmPassword: 'Secreta123',
};

const FAKE_USER = {
  id: 'user_x',
  authUid: 'uid_x',
  nombre: 'Carmen',
  email: 'carmen@test.es',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO_ESTANDAR'],
  permisos: [],
  createdAt: '2026-09-24T00:00:00.000Z',
  updatedAt: '2026-09-24T00:00:00.000Z',
} as unknown as UsuarioApp;

const noop = () => {};
const root = (p: string) => resolve(process.cwd(), p);

beforeEach(() => {
  vi.clearAllMocks();
  authMock.registerAutonomo.mockResolvedValue({ usuarioApp: FAKE_USER });
});

// ---------------------------------------------------------------------------
// UI propietario
// ---------------------------------------------------------------------------
describe('UI registro de propietario', () => {
  it('selector: ofrece Propietario/Profesional, sin opción de inquilino', () => {
    const html = renderToStaticMarkup(
      React.createElement(RegistroAutonomoView, {
        especialidades: ESPS,
        onComplete: noop,
        onCancel: noop,
      })
    );
    expect(html).toContain('Crear cuenta');
    expect(html).toContain('data-testid="opcion-propietario"');
    expect(html).toContain('data-testid="opcion-profesional"');
    expect(html).toContain('Soy Propietario');
    expect(html).toContain('Soy Profesional');
    expect(html).not.toContain('opcion-inquilino');
    // Nota informativa (el inquilino sigue por invitación).
    expect(html).toContain('¿Eres inquilino?');
    expect(html).toContain('data-testid="volver-login"');
    expect(html).toContain('Volver a Iniciar sesión');
  });

  it('muestra el formulario con campos obligatorios y vuelta al login', () => {
    const html = renderToStaticMarkup(
      React.createElement(RegistroAutonomoView, {
        especialidades: ESPS,
        onComplete: noop,
        onCancel: noop,
        pasoInicial: 'propietario',
      })
    );
    expect(html).toContain('data-testid="form-propietario"');
    for (const label of [
      'Nombre',
      'Apellidos',
      'Email de Acceso',
      'Teléfono',
      'NIF / CIF',
      'Dirección Fiscal',
      'Ciudad',
      'Código Postal',
      'Tipo de Propietario',
      'Contraseña',
      'Confirmar Contraseña',
    ]) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain('Persona Física');
    expect(html).toContain('Sociedad / S.L. / S.A.');
    expect(html).toContain('Comunidad Bienes');
    // Marcados como obligatorios en el marcado.
    expect(html.match(/required/g)?.length || 0).toBeGreaterThanOrEqual(10);
    // Sin rastro de invitaciones/tokens/fichas previas.
    expect(html.toLowerCase()).not.toContain('token');
    expect(html).toContain('data-testid="volver-login"');
    expect(html).toContain('data-testid="submit-registro"');
  });

  it('llama a registerAutonomo con los parámetros exactos y devuelve el perfil', async () => {
    const usuario = await enviarRegistroAutonomo(
      { tipo: 'propietario', valores: { ...VAL_PROP } },
      { registerAutonomo: authMock.registerAutonomo }
    );
    expect(usuario).toBe(FAKE_USER);
    expect(authMock.registerAutonomo).toHaveBeenCalledTimes(1);
    expect(authMock.registerAutonomo).toHaveBeenCalledWith({
      tipoPerfil: 'PROPIETARIO',
      email: 'carmen@test.es',
      password: 'Secreta123',
      nombre: 'Carmen',
      apellidos: 'Ruiz Sanz',
      telefono: '+34600111222',
      nifCif: '12345678Z',
      direccion: 'Calle Mayor 1, 2B',
      ciudad: 'Almería',
      codigoPostal: '04001',
      tipoPropietario: 'persona_fisica',
      provincia: 'Almería',
    });
  });

  it('dato obligatorio ausente → error visible y sin llamada al servicio', async () => {
    await expect(
      enviarRegistroAutonomo(
        { tipo: 'propietario', valores: { ...VAL_PROP, nombre: '  ' } },
        { registerAutonomo: authMock.registerAutonomo }
      )
    ).rejects.toThrow(/nombre/);
    await expect(
      enviarRegistroAutonomo(
        { tipo: 'propietario', valores: { ...VAL_PROP, email: 'sin-arroba' } },
        { registerAutonomo: authMock.registerAutonomo }
      )
    ).rejects.toThrow(/válido/);
    expect(authMock.registerAutonomo).not.toHaveBeenCalled();
  });

  it('contraseñas distintas → error y sin llamada', async () => {
    await expect(
      enviarRegistroAutonomo(
        { tipo: 'propietario', valores: { ...VAL_PROP, confirmPassword: 'Otra123' } },
        { registerAutonomo: authMock.registerAutonomo }
      )
    ).rejects.toThrow(/coinciden/);
    expect(authMock.registerAutonomo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UI profesional
// ---------------------------------------------------------------------------
describe('UI registro de profesional', () => {
  it('muestra el catálogo existente, tipos y zonas (sin token)', () => {
    const html = renderToStaticMarkup(
      React.createElement(RegistroAutonomoView, {
        especialidades: ESPS,
        onComplete: noop,
        onCancel: noop,
        pasoInicial: 'profesional',
      })
    );
    expect(html).toContain('data-testid="form-profesional"');
    // Catálogo reutilizado (viene por props, sin escritura libre).
    expect(html).toContain('Fontanería');
    expect(html).toContain('Electricidad');
    expect(html).toContain('Nombre Comercial');
    expect(html).toContain('Autónomo / Profesional');
    expect(html).toContain('Empresa / Sociedad');
    expect(html).toContain('Manitas Particular');
    expect(html).toContain('Provincia Principal');
    expect(html).toContain('Municipio Principal');
    expect(html).toContain('Zonas Adicionales');
    expect(html).toContain('Confirmar Contraseña');
    expect(html.toLowerCase()).not.toContain('token');
    expect(html).toContain('data-testid="volver-login"');
  });

  it('sin catálogo → aviso y alta bloqueada', () => {
    const html = renderToStaticMarkup(
      React.createElement(RegistroAutonomoView, {
        especialidades: [],
        onComplete: noop,
        onCancel: noop,
        pasoInicial: 'profesional',
      })
    );
    expect(html).toContain('No se pudo cargar el catálogo de especialidades');
    expect(html).toContain('disabled');
  });

  it('llama a registerAutonomo con ficha exacta (zonas adicionales mapeadas)', async () => {
    const usuario = await enviarRegistroAutonomo(
      {
        tipo: 'profesional',
        valores: { ...VAL_PROF },
        catalogoEspecialidades: CATALOGO,
      },
      { registerAutonomo: authMock.registerAutonomo }
    );
    expect(usuario).toBe(FAKE_USER);
    expect(authMock.registerAutonomo).toHaveBeenCalledTimes(1);
    const params = authMock.registerAutonomo.mock.calls[0][0] as Record<string, unknown>;
    expect(params).toEqual({
      tipoPerfil: 'PROFESIONAL',
      email: 'luis@test.es',
      password: 'Secreta123',
      nombre: 'Luis',
      nombreComercial: 'Fontanería Luis',
      tipo: 'EMPRESA',
      especialidades: ['Fontanería'],
      provincia: 'Almería',
      zonasAdicionales: [
        { provincia: 'Granada', municipio: 'Motril' },
        { provincia: 'Murcia' },
      ],
    });
    // Sin token, sin invitación, sin IDs de fichas previas.
    expect(params).not.toHaveProperty('tokenInvitacion');
    expect(params).not.toHaveProperty('profesionalId');
    expect(params).not.toHaveProperty('propietarioId');
    expect(params).not.toHaveProperty('enlaceRegistroId');
  });

  it('especialidad fuera de catálogo → error sin llamada', async () => {
    await expect(
      enviarRegistroAutonomo(
        {
          tipo: 'profesional',
          valores: { ...VAL_PROF, especialidades: ['Inventada'] },
          catalogoEspecialidades: CATALOGO,
        },
        { registerAutonomo: authMock.registerAutonomo }
      )
    ).rejects.toThrow(/catálogo/);
    await expect(
      enviarRegistroAutonomo(
        {
          tipo: 'profesional',
          valores: { ...VAL_PROF, especialidades: [] },
          catalogoEspecialidades: CATALOGO,
        },
        { registerAutonomo: authMock.registerAutonomo }
      )
    ).rejects.toThrow(/especialidad/);
    expect(authMock.registerAutonomo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Errores del servicio → mensajes seguros
// ---------------------------------------------------------------------------
describe('errores del alta autónoma', () => {
  it('email duplicado → mensaje claro, una sola llamada, sin sondas', async () => {
    authMock.registerAutonomo.mockRejectedValueOnce(
      new Error('Este correo electrónico ya tiene una cuenta. Inicia sesión con tu contraseña.')
    );
    await expect(
      enviarRegistroAutonomo(
        { tipo: 'propietario', valores: { ...VAL_PROP } },
        { registerAutonomo: authMock.registerAutonomo }
      )
    ).rejects.toThrow(/ya tiene una cuenta/);
    expect(authMock.registerAutonomo).toHaveBeenCalledTimes(1);
  });

  it('fallo parcial → mensaje sin internos (sin códigos ni IDs)', async () => {
    authMock.registerAutonomo.mockRejectedValueOnce(
      new Error(
        'Alta incompleta: tu cuenta de acceso (a@test.es) se creó pero no se pudo completar el perfil. Detalle técnico: permission-denied'
      )
    );
    let mensaje = '';
    try {
      await enviarRegistroAutonomo(
        { tipo: 'profesional', valores: { ...VAL_PROF }, catalogoEspecialidades: CATALOGO },
        { registerAutonomo: authMock.registerAutonomo }
      );
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toMatch(/soporte/);
    expect(mensaje).not.toMatch(/permission-denied|Alta incompleta|uid_|user_|prop_|prof_/);
  });

  it('error inesperado → mensaje genérico', async () => {
    for (const raro of [
      new Error('permission-denied'),
      new Error('auth/internal-error'),
      new Error(''),
      {},
    ]) {
      authMock.registerAutonomo.mockRejectedValueOnce(raro);
      await expect(
        enviarRegistroAutonomo(
          { tipo: 'propietario', valores: { ...VAL_PROP } },
          { registerAutonomo: authMock.registerAutonomo }
        )
      ).rejects.toThrow(/No se pudo completar el registro/);
    }
  });

  it('validaciones del servicio pasan tal cual (ya son amistosas)', () => {
    expect(mapearErrorRegistroAutonomo(new Error("Registro autónomo: el campo 'nifCif' es obligatorio."))).toContain(
      'es obligatorio'
    );
    expect(mapearErrorRegistroAutonomo(new Error('x'))).toContain(
      'No se pudo completar el registro'
    );
  });
});

// ---------------------------------------------------------------------------
// Validación pura
// ---------------------------------------------------------------------------
describe('validadores del formulario', () => {
  it('email válido / inválido', () => {
    expect(esEmailRegistroValido('a@b.es')).toBe(true);
    expect(esEmailRegistroValido('  a@b.es  ')).toBe(true);
    expect(esEmailRegistroValido('sin-arroba')).toBe(false);
    expect(esEmailRegistroValido('a@b')).toBe(false);
    expect(esEmailRegistroValido('')).toBe(false);
  });

  it('propietario: primer error en orden visual', () => {
    expect(validarFormularioPropietario({ ...VAL_PROP, nombre: '' })).toMatch(/nombre/);
    expect(validarFormularioPropietario({ ...VAL_PROP, apellidos: '' })).toMatch(/apellidos/);
    expect(validarFormularioPropietario({ ...VAL_PROP, telefono: '' })).toMatch(/teléfono/);
    expect(validarFormularioPropietario({ ...VAL_PROP })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Login + tripwires de cableado y regresión
// ---------------------------------------------------------------------------
describe('login y regresión de flujos', () => {
  it('LoginView ofrece Regístrate y conserva invitación + setup admin', () => {
    const html = renderToStaticMarkup(
      React.createElement(LoginView, { onLoginSuccess: noop, onOpenRegistroAutonomo: noop })
    );
    expect(html).toContain('Iniciar Sesión');
    expect(html).toContain('¿No tienes cuenta? Regístrate');
    expect(html).toContain('enlace de invitación');
    expect(html).toContain('Configurar Administrador Principal');

    const sinProp = renderToStaticMarkup(
      React.createElement(LoginView, { onLoginSuccess: noop })
    );
    expect(sinProp).not.toContain('¿No tienes cuenta? Regístrate');
    expect(sinProp).toContain('enlace de invitación');
  });

  it('la vista autónoma no usa invitaciones ni Auth/Firestore directos', () => {
    const src = readFileSync(root('src/components/RegistroAutonomoView.tsx'), 'utf-8');
    for (const prohibido of [
      'registerWithInvitationLink',
      'tokenInvitacion',
      'enlaces_registro',
      'createUserWithEmailAndPassword',
      'firebase/firestore',
      'firebase/auth',
    ]) {
      expect(src, prohibido).not.toContain(prohibido);
    }
    expect(src).toContain('enviarRegistroAutonomo');
    expect(src).toContain('registerAutonomo');
    expect(src).not.toContain('opcion-inquilino');
  });

  it('el módulo puro no depende de invitaciones', () => {
    const src = readFileSync(root('src/lib/registroAutonomoForm.ts'), 'utf-8');
    expect(src).not.toContain('registerWithInvitationLink');
    expect(src).not.toContain('token');
  });

  it('App cablea el alta autónoma y conserva invitaciones', () => {
    const src = readFileSync(root('src/App.tsx'), 'utf-8');
    // Nuevo cableado.
    for (const esperado of [
      'RegistroAutonomoView',
      'handleCompleteRegistroAutonomo',
      'showRegistroAutonomo',
      'onOpenRegistroAutonomo',
      'handleCompleteSelfRegistration(usuario)',
      "setActiveSection('propietarios')",
      "setActiveSection('administracion')",
    ]) {
      expect(src, esperado).toContain(esperado);
    }
    // Invitaciones intactas (?registro, ?registroProp, ?registroInq).
    for (const intacto of [
      'activePublicRegistroToken',
      'activePublicRegistroPropId',
      'activePublicRegistroInqId',
      'RegistroInquilinoView',
      'handleCompleteInquilinoRegistration',
      'PortalRegistroView',
    ]) {
      expect(src, intacto).toContain(intacto);
    }
  });

  it('el servicio conserva ambas altas (invitación + autónoma)', () => {
    const src = readFileSync(root('src/lib/authService.ts'), 'utf-8');
    expect(src).toContain('export async function registerWithInvitationLink');
    expect(src).toContain('export async function registerAutonomo');
  });
});
