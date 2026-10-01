/**
 * @vitest-environment jsdom
 *
 * PROPIETARIOS / TITULARES — ACCESO REAL DESDE LA INTERFAZ (2026-10-01)
 * =====================================================================
 * Tras el PR #18 la sección existía en el código (`PropietariosSection`) pero la persona
 * que gestiona titulares no podía llegar a ella:
 *
 *  · el PROPIETARIO veía «Mi Portal Propietario» (que monta el portal, no la sección) y NINGUNA
 *    entrada hacia Propietarios/Titulares; el aviso del alta de inmueble («Créalo desde
 *    Propietarios/Titulares») y su botón llevaban de vuelta al portal: sin salida;
 *  · para el ADMINISTRADOR la entrada se llamaba «Propietarios & IBAN» (nadie la reconocía como
 *    «Titulares») y para el perfil ADMINISTRADOR no master quedaba en consulta sin explicarlo.
 *
 * Qué fija este test, desde el render real (Sidebar, MobileNav, sección y alta de inmueble):
 *
 *   A. MENÚ: cada perfil que gestiona titulares tiene una entrada VISIBLE «Propietarios / Titulares»
 *      que navega a la sección correcta (escritorio y móvil); el PROFESIONAL no la tiene.
 *   B. PERMISOS: `permisosTitulares` reproduce `allow create/update` de `propietarios` (texto REAL
 *      de firestore.rules): master crea y edita todas; el PROPIETARIO edita la SUYA y solo la crea
 *      si no existe; nadie más crea. Nada de «Crear titular» que Firestore vaya a denegar.
 *   C. SECCIÓN: «Crear titular» visible para quien puede, ficha completa (personal + contacto +
 *      fiscal + IBAN) en un solo formulario; el PROPIETARIO mantiene su ficha y se le explica cómo
 *      se da de alta a otro titular.
 *   D. ALTA DE INMUEBLE: el botón/atajo hacia Propietarios/Titulares existe y navega.
 *   E. CABLEADO de App.tsx: la ruta `titulares`, el route guard y el uso del helper de permisos.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { Sidebar } from '../src/components/Sidebar';
import { MobileNav } from '../src/components/MobileNav';
import { PropietariosSection } from '../src/components/sections/PropietariosSection';
import { InmueblesSection } from '../src/components/sections/InmueblesSection';
import { permisosTitulares } from '../src/utils/permisosTitulares';
import { seccionesDePerfil, gruposDePerfil } from '../src/navegacion/navegacion';
import { ADMIN_MASTER_EMAIL } from '../src/lib/authService';
import { MENSAJE_ALTA_TITULAR_ADMINISTRACION } from '../src/lib/titularesModelo';
import { crearEvaluadorReglas, type Peticion } from './harness/firestoreRulesEval';
import type { Inmueble, Propietario, SectionType, UsuarioApp } from '../src/types';

vi.mock('../src/lib/titularidadesFirestore', () => ({
  subscribeTitularidadesEscopo: vi.fn((_a: unknown, cb: (t: unknown[]) => void) => { cb([]); return vi.fn(); }),
  guardarTitularidad: vi.fn(async () => true),
  cerrarTitularidad: vi.fn(async () => true),
}));

afterEach(() => cleanup());

const RAIZ = resolve(__dirname, '..');
const APP = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const base = {
  id: 'u1', authUid: 'uid_1', nombre: 'Usuario', estado: 'ACTIVO', activo: true, permisos: [],
} as unknown as UsuarioApp;
const master: UsuarioApp = { ...base, email: ADMIN_MASTER_EMAIL, tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'] };
const adminNoMaster: UsuarioApp = { ...base, email: 'admin@agencia.test', tipoPerfil: 'ADMINISTRADOR', roles: ['ADMINISTRADOR'] };
const propietario: UsuarioApp = {
  ...base, email: 'prop1@correo.test', tipoPerfil: 'PROPIETARIO', roles: ['PROPIETARIO_ESTANDAR'], propietarioId: 'prop_1',
};
const profesional: UsuarioApp = { ...base, email: 'pro@correo.test', tipoPerfil: 'PROFESIONAL', roles: ['PROFESIONAL_MANTENIMIENTO'] };

function ficha(id: string, extra: Partial<Propietario> = {}): Propietario {
  return {
    id,
    nombre: `Titular ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: `600-${id}`,
    email: `${id.toLowerCase()}@correo.test`,
    direccion: `Calle ${id} 1`,
    ciudad: 'Madrid',
    codigoPostal: '28001',
    cuentasBancarias: [{ id: `cta-${id}`, alias: 'Principal', iban: `ES00${id}`, esPrincipal: true }],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
    ...extra,
  };
}

const seccionesPintadas = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('[data-tour^="nav-"]')).map((el) => (el.getAttribute('data-tour') || '').replace(/^nav-/, ''));

function botonesDeMenu(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-tour^="nav-"]'));
}

// ===========================================================================
// A · MENÚ: la entrada existe, se ve y navega
// ===========================================================================
describe('Titulares · A — el menú real ofrece «Propietarios / Titulares» a quien lo gestiona', () => {
  it('A1 · ADMINISTRADOR (master y no master): «Propietarios / Titulares» → `propietarios` (antes «Propietarios & IBAN»)', () => {
    for (const usuario of [master, adminNoMaster]) {
      const alNavegar = vi.fn();
      const r = render(
        <Sidebar activeSection="inicio" onSelectSection={alNavegar} candidatos={[]} inmueblesCount={0} currentUser={usuario} />,
      );
      const boton = botonesDeMenu(r.container).find((b) => (b.textContent || '').includes('Propietarios / Titulares'));
      expect(boton, `entrada visible para ${usuario.email}`).toBeTruthy();
      expect(boton!.getAttribute('data-tour')).toBe('nav-propietarios');
      expect(screen.queryByText('Propietarios & IBAN')).toBeNull();
      fireEvent.click(boton!);
      expect(alNavegar).toHaveBeenCalledWith('propietarios');
      cleanup();
    }
  });

  it('A2 · PROPIETARIO: conserva «Mi Portal Propietario» Y tiene su propia entrada «Propietarios / Titulares» → `titulares`', () => {
    const alNavegar = vi.fn();
    const r = render(
      <Sidebar activeSection="propietarios" onSelectSection={alNavegar} candidatos={[]} inmueblesCount={0} currentUser={propietario} />,
    );
    const etiquetas = botonesDeMenu(r.container).map((b) => (b.textContent || '').trim());
    expect(etiquetas.some((e) => e.includes('Mi Portal Propietario'))).toBe(true);
    const boton = botonesDeMenu(r.container).find((b) => (b.textContent || '').includes('Propietarios / Titulares'));
    expect(boton).toBeTruthy();
    expect(boton!.getAttribute('data-tour')).toBe('nav-titulares');
    fireEvent.click(boton!);
    expect(alNavegar).toHaveBeenCalledWith('titulares');
  });

  it('A3 · el menú MÓVIL del PROPIETARIO ofrece la misma entrada y navega igual (paridad escritorio ↔ móvil)', () => {
    const alNavegar = vi.fn();
    const r = render(
      <MobileNav activeSection="inicio" onSelectSection={alNavegar} candidatos={[]} currentUser={propietario} />,
    );
    fireEvent.click(r.container.querySelector('button')!); // el primer botón es el desplegable
    expect(seccionesPintadas(r.container)).toContain('titulares');
    const boton = botonesDeMenu(r.container).find((b) => b.getAttribute('data-tour') === 'nav-titulares');
    expect(boton).toBeTruthy();
    expect((boton!.textContent || '')).toContain('Propietarios / Titulares');
    fireEvent.click(boton!);
    expect(alNavegar).toHaveBeenCalledWith('titulares');
  });

  it('A4 · el PROFESIONAL (gestor incluido) NO la tiene: el gestor no crea ni lista titulares (S3)', () => {
    for (const opciones of [{}, { gestorPatrimonial: true }]) {
      const secciones = seccionesDePerfil('PROFESIONAL', opciones);
      expect(secciones).not.toContain('titulares');
      expect(secciones).not.toContain('propietarios');
    }
    const r = render(
      <Sidebar activeSection="inicio" onSelectSection={() => undefined} candidatos={[]} inmueblesCount={0} currentUser={profesional} />,
    );
    expect(screen.queryByText('Propietarios / Titulares')).toBeNull();
    r.unmount();
  });

  it('A5 · catálogo: `titulares` solo para PROPIETARIO, en «Cartera y propiedad» junto a sus viviendas', () => {
    expect(seccionesDePerfil('ADMINISTRADOR')).not.toContain('titulares');
    const grupos = gruposDePerfil('PROPIETARIO');
    const cartera = grupos.find((g) => g.id === 'CARTERA')!;
    expect(cartera.items.map((i) => i.id)).toEqual(['propietarios', 'inmuebles', 'titulares', 'datos', 'inversion', 'suministros']);
    expect(cartera.items.find((i) => i.id === 'titulares')!.etiqueta).toBe('Propietarios / Titulares');
  });
});

// ===========================================================================
// B · PERMISOS: espejo de las Rules (texto REAL)
// ===========================================================================
describe('Titulares · B — permisos: la UI solo ofrece lo que las Rules permiten', () => {
  it('B1 · master: crea y edita TODAS las fichas (email normalizado, como `isMasterAdmin`)', () => {
    const p = permisosTitulares(master, [ficha('prop_1'), ficha('prop_2')], ADMIN_MASTER_EMAIL);
    expect(p).toMatchObject({ esMaster: true, puedeGestionar: true, puedeCrear: true });
    expect(p.fichasEditablesIds).toBeUndefined();
    const conMayusculas = permisosTitulares({ ...master, email: `  ${ADMIN_MASTER_EMAIL.toUpperCase()} ` }, [], ADMIN_MASTER_EMAIL);
    expect(conMayusculas.esMaster).toBe(true);
  });

  it('B2 · PROPIETARIO con ficha propia: edita SOLO la suya y no crea otras', () => {
    const p = permisosTitulares(propietario, [ficha('prop_1')], ADMIN_MASTER_EMAIL);
    expect(p).toMatchObject({
      esMaster: false, puedeGestionar: true, puedeCrear: false, idFichaPropia: 'prop_1', fichaPropiaExiste: true,
    });
    expect(p.fichasEditablesIds).toEqual(['prop_1']);
  });

  it('B3 · PROPIETARIO sin ficha propia todavía: puede crear LA SUYA (id fijado por las Rules)', () => {
    const p = permisosTitulares(propietario, [], ADMIN_MASTER_EMAIL);
    expect(p).toMatchObject({ puedeGestionar: true, puedeCrear: true, idFichaPropia: 'prop_1', fichaPropiaExiste: false });
  });

  it('B4 · sin propietarioId, ADMINISTRADOR no master, PROFESIONAL o sin sesión: consulta (nada que crear ni editar)', () => {
    const sinNada = { esMaster: false, puedeGestionar: false, puedeCrear: false };
    expect(permisosTitulares({ ...propietario, propietarioId: undefined }, [], ADMIN_MASTER_EMAIL)).toMatchObject(sinNada);
    expect(permisosTitulares(adminNoMaster, [ficha('prop_1')], ADMIN_MASTER_EMAIL)).toMatchObject(sinNada);
    expect(permisosTitulares(profesional, [], ADMIN_MASTER_EMAIL)).toMatchObject(sinNada);
    expect(permisosTitulares(null, [], ADMIN_MASTER_EMAIL)).toMatchObject(sinNada);
    // Un email master vacío NUNCA convierte a alguien sin email en master.
    expect(permisosTitulares({ ...adminNoMaster, email: '' }, [], '')).toMatchObject(sinNada);
  });

  describe('B5 · el helper coincide con `firestore.rules` (evaluador del repo sobre el TEXTO real)', () => {
    const { permite } = crearEvaluadorReglas(RULES);
    const uid = 'uid_prop';
    const db = {
      [`usuarios_auth/${uid}`]: {
        uid, usuarioId: 'usr_prop', email: 'prop1@correo.test', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
        roles: ['PROPIETARIO_ESTANDAR'], propietarioId: 'prop_1', profesionalId: '', inmuebleIds: [],
      },
      'usuarios/usr_prop': {
        id: 'usr_prop', authUid: uid, email: 'prop1@correo.test', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
        roles: ['PROPIETARIO_ESTANDAR'], propietarioId: 'prop_1',
      },
      'propietarios/prop_1': { id: 'prop_1', nombre: 'Titular prop_1', nifCif: 'NIF-prop_1' },
      'propietarios/prop_2': { id: 'prop_2', nombre: 'Titular prop_2', nifCif: 'NIF-prop_2' },
    } as Record<string, Record<string, unknown>>;
    const auth = { uid, token: { email: 'prop1@correo.test', email_verified: true } };
    const peticion = (docId: string, resource: Record<string, unknown> | null, requestResource: Record<string, unknown> | null): Peticion => ({
      auth, db, resource, requestResource, docId,
    });
    const nueva = (id: string) => ({ id, nombre: `Titular ${id}`, nifCif: `NIF-${id}`, email: 'x@correo.test', cuentasBancarias: [] });

    it('el PROPIETARIO crea SU ficha (id == propietarioId)…', () => {
      expect(permite('propietarios', 'create', peticion('prop_1', null, nueva('prop_1')))).toBe(true);
    });
    it('…pero NO la de un tercero (p. ej. un cotitular): por eso la UI no le ofrece «Crear titular»', () => {
      expect(permite('propietarios', 'create', peticion('prop-nuevo', null, nueva('prop-nuevo')))).toBe(false);
      expect(permite('propietarios', 'create', peticion('prop_2', null, nueva('prop_2')))).toBe(false);
    });
    it('edita la suya y no la ajena', () => {
      const editada = { ...(db['propietarios/prop_1'] as object), telefono: '600000000' };
      expect(permite('propietarios', 'update', peticion('prop_1', db['propietarios/prop_1'], editada))).toBe(true);
      const ajena = { ...(db['propietarios/prop_2'] as object), telefono: '600000000' };
      expect(permite('propietarios', 'update', peticion('prop_2', db['propietarios/prop_2'], ajena))).toBe(false);
    });
    it('la ficha jurídica nunca se borra y `list` es solo del master (la UI no ofrece «Eliminar» al PROPIETARIO)', () => {
      expect(permite('propietarios', 'delete', peticion('prop_1', db['propietarios/prop_1'], null))).toBe(false);
      expect(permite('propietarios', 'list', peticion('prop_1', db['propietarios/prop_1'], null))).toBe(false);
    });
    it('los pines de fuente del helper siguen vigentes en las Rules', () => {
      const bloque = RULES.slice(RULES.indexOf('match /propietarios/{propietarioId}'), RULES.indexOf('match /inmuebles/{inmuebleId}'));
      expect(bloque).toContain('allow list: if isMasterAdmin();');
      expect(bloque).toContain('&& propietarioId == myPropId()');
      expect(bloque).toContain('allow delete: if false;');
    });
  });
});

// ===========================================================================
// C · SECCIÓN: «Crear titular» visible para quien puede; «mi ficha» para el PROPIETARIO
// ===========================================================================
describe('Titulares · C — la sección real según el perfil', () => {
  const montar = (permisos: ReturnType<typeof permisosTitulares>, propietarios: Propietario[], onSave = vi.fn()) =>
    render(
      <PropietariosSection
        propietarios={propietarios}
        inmuebles={[]}
        puedeGestionar={permisos.puedeGestionar}
        puedeCrear={permisos.puedeCrear}
        fichasEditablesIds={permisos.fichasEditablesIds}
        idFichaPropia={permisos.idFichaPropia}
        onSavePropietario={onSave}
        onDeletePropietario={() => undefined}
      />,
    );

  it('C1 · MASTER: ve «Crear titular»; la ficha se crea completa en un solo formulario y se guarda con id propio', () => {
    const onSave = vi.fn();
    montar(permisosTitulares(master, [], ADMIN_MASTER_EMAIL), [], onSave);
    expect(screen.getByTestId('boton-crear-titular').textContent).toContain('Crear titular');
    fireEvent.click(screen.getByTestId('boton-crear-titular'));

    const dialogo = screen.getByRole('dialog', { name: 'Nuevo propietario' });
    // Los cinco bloques de la ficha viven en el MISMO formulario (nada de «titular básico»).
    for (const pestana of [/1\. Datos Fiscales/, /2\. Domicilio/, /3\. Representante/, /4\. Cuentas IBAN/, /5\. Notas/]) {
      expect(within(dialogo).getByRole('button', { name: pestana })).toBeTruthy();
    }
    expect(screen.queryByTestId('titulares-alta-administracion')).toBeNull();
    // Quien SÍ puede crear lee la guía de siempre: «Crea el titular → guarda la ficha → asígnala».
    expect(screen.getByText('1. Crea el titular')).toBeTruthy();
    expect(screen.getByTestId('aviso-titular-inexistente-propietarios').textContent).toContain('Créalo desde Propietarios/Titulares');
    cleanup();
  });

  it('C2 · MASTER: guardar una ficha completa llama a `onSavePropietario` con datos personales, de contacto y fiscales', () => {
    const onSave = vi.fn();
    montar(permisosTitulares(master, [], ADMIN_MASTER_EMAIL), [], onSave);
    fireEvent.click(screen.getByTestId('boton-crear-titular'));

    fireEvent.change(screen.getByPlaceholderText('Ej: Manuel Gómez Rodríguez'), { target: { value: 'Ana García López' } });
    fireEvent.change(screen.getByPlaceholderText('Ej: 12345678Z o B-12345678'), { target: { value: '12345678z' } });
    fireEvent.change(screen.getByPlaceholderText('Ej: +34 600 000 000'), { target: { value: '600111222' } });
    fireEvent.change(screen.getByPlaceholderText('Ej: arrendador@email.com'), { target: { value: 'ana@correo.test' } });
    fireEvent.click(screen.getByRole('button', { name: /2\. Domicilio/ }));
    fireEvent.change(screen.getByPlaceholderText('Ej: Calle Gran Vía 28, 4º B'), { target: { value: 'Calle Mayor 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Propietario/ }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const guardado = onSave.mock.calls[0][0] as Propietario;
    // Ficha PERSONAL + CONTACTO + FISCAL en una sola alta.
    expect(guardado).toMatchObject({
      nombre: 'Ana García López', nifCif: '12345678Z', tipoPropietario: 'persona_fisica',
      telefono: '600111222', email: 'ana@correo.test', direccion: 'Calle Mayor 1',
    });
    expect(guardado.id).toMatch(/^prop-\d+$/);
    expect(Array.isArray(guardado.cuentasBancarias)).toBe(true);
  });

  it('C3 · PROPIETARIO con ficha propia: ve su ficha y puede editarla, SIN «Crear titular» ni «Eliminar»; se le explica el alta de otros titulares', () => {
    const onSave = vi.fn();
    montar(permisosTitulares(propietario, [ficha('prop_1')], ADMIN_MASTER_EMAIL), [ficha('prop_1')], onSave);

    expect(screen.queryByTestId('boton-crear-titular')).toBeNull();
    expect(screen.queryByText('Crear primer titular')).toBeNull();
    expect(screen.getByText('Titular prop_1')).toBeTruthy();
    expect(screen.getByTitle('Editar titular')).toBeTruthy();
    expect(screen.queryByTitle('Eliminar titular')).toBeNull();
    const aviso = screen.getByTestId('titulares-alta-administracion');
    expect(aviso.textContent).toContain(MENSAJE_ALTA_TITULAR_ADMINISTRACION);
    // No es el modo «solo consulta»: esa persona SÍ puede mantener su ficha.
    expect(screen.queryByTestId('propietarios-solo-consulta')).toBeNull();
    // Y no se le dice «créalo aquí» (Firestore lo denegaría): la guía habla de SU ficha y el aviso
    // remite a quién da de alta a otros titulares.
    expect(screen.queryByTestId('aviso-titular-inexistente-propietarios')).toBeNull();
    expect(screen.getByText('1. Completa tu ficha')).toBeTruthy();
  });

  it('C4 · PROPIETARIO: editar su ficha conserva su id (la regla `update` exige id == propietarioId)', () => {
    const onSave = vi.fn();
    const suya = ficha('prop_1', { nifCif: '12345678Z' }); // NIF válido: el formulario valida antes de guardar
    montar(permisosTitulares(propietario, [suya], ADMIN_MASTER_EMAIL), [suya], onSave);
    fireEvent.click(screen.getByTitle('Editar titular'));
    fireEvent.change(screen.getByPlaceholderText('Ej: +34 600 000 000'), { target: { value: '699999999' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0][0] as Propietario).id).toBe('prop_1');
    expect((onSave.mock.calls[0][0] as Propietario).telefono).toBe('699999999');
  });

  it('C5 · PROPIETARIO sin ficha propia: «Crear mi ficha de titular» la crea con SU id (no `prop-<fecha>`)', () => {
    const onSave = vi.fn();
    montar(permisosTitulares(propietario, [], ADMIN_MASTER_EMAIL), [], onSave);
    const crear = screen.getByTestId('boton-crear-titular');
    expect(crear.textContent).toContain('Crear mi ficha de titular');
    fireEvent.click(crear);
    fireEvent.change(screen.getByPlaceholderText('Ej: Manuel Gómez Rodríguez'), { target: { value: 'Pedro Ruiz' } });
    fireEvent.change(screen.getByPlaceholderText('Ej: 12345678Z o B-12345678'), { target: { value: '12345678z' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Propietario/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((onSave.mock.calls[0][0] as Propietario).id).toBe('prop_1');
    expect((onSave.mock.calls[0][0] as Propietario).nifCif).toBe('12345678Z');
  });

  it('C6 · una ficha AJENA visible (p. ej. por una cartera gestionada) no ofrece editar, eliminar ni añadir IBAN', () => {
    montar(permisosTitulares(propietario, [ficha('prop_1'), ficha('prop_9')], ADMIN_MASTER_EMAIL), [ficha('prop_1'), ficha('prop_9')]);
    // Solo la ficha propia tiene acción de edición.
    expect(screen.getAllByTitle('Editar titular')).toHaveLength(1);
    expect(screen.getAllByText('Añadir IBAN')).toHaveLength(1);
  });

  it('C7 · ADMINISTRADOR no master / gestor (consulta): ninguna acción de escritura y lo explica', () => {
    montar(permisosTitulares(adminNoMaster, [ficha('prop_1')], ADMIN_MASTER_EMAIL), [ficha('prop_1')]);
    expect(screen.queryByTestId('boton-crear-titular')).toBeNull();
    expect(screen.queryByTitle('Editar titular')).toBeNull();
    expect(screen.queryByText('Añadir IBAN')).toBeNull();
    expect(screen.getByTestId('propietarios-solo-consulta')).toBeTruthy();
    expect(screen.queryByTestId('titulares-alta-administracion')).toBeNull();
  });

  it('C8 · sin permisos nuevos (uso previo del componente) el comportamiento es el de siempre: crea y edita', () => {
    render(
      <PropietariosSection
        propietarios={[ficha('A')]}
        inmuebles={[]}
        onSavePropietario={() => undefined}
        onDeletePropietario={() => undefined}
      />,
    );
    expect(screen.getByTestId('boton-crear-titular').textContent).toContain('Crear titular');
    expect(screen.getByTitle('Editar titular')).toBeTruthy();
    expect(screen.getByTitle('Eliminar titular')).toBeTruthy();
  });
});

// ===========================================================================
// D · ALTA DE INMUEBLE: el aviso ya no es un callejón sin salida
// ===========================================================================
describe('Titulares · D — desde el alta de inmueble se llega a Propietarios/Titulares', () => {
  const inmuebleVacio: Inmueble[] = [];

  function abrirAlta(usuario: UsuarioApp, alNavegar: () => void) {
    render(
      <InmueblesSection
        inmuebles={inmuebleVacio}
        candidatos={[]}
        propietarios={usuario.tipoPerfil === 'PROPIETARIO' ? [ficha('prop_1')] : [ficha('prop_1'), ficha('prop_2')]}
        onSelectCandidate={() => undefined}
        onAddInmueble={() => undefined}
        onNavigateToPropietarios={alNavegar}
        currentUser={usuario}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apartado Fiscal/ }));
  }

  it('D1 · el aviso «Este titular todavía no existe…» trae un botón que navega a Propietarios/Titulares', () => {
    const alNavegar = vi.fn();
    abrirAlta(master, alNavegar);
    expect(screen.getByTestId('aviso-titular-inexistente').textContent).toContain('Créalo desde Propietarios/Titulares');
    fireEvent.click(screen.getByTestId('ir-a-titulares-desde-aviso'));
    expect(alNavegar).toHaveBeenCalledTimes(1);
  });

  it('D2 · el botón de cabecera cambia de texto según quién pueda crear: master «Crear titular…»; PROPIETARIO «Ir a…»', () => {
    abrirAlta(master, vi.fn());
    expect(screen.getByRole('button', { name: /Crear titular en Propietarios\/Titulares/ })).toBeTruthy();
    cleanup();
    const alNavegar = vi.fn();
    abrirAlta(propietario, alNavegar);
    expect(screen.queryByRole('button', { name: /Crear titular en Propietarios\/Titulares/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ir a Propietarios\/Titulares/ }));
    expect(alNavegar).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// E · CABLEADO de App.tsx (no se monta App completo: pines sobre el fuente real)
// ===========================================================================
describe('Titulares · E — cableado en App.tsx', () => {
  const guard = (nombre: string) => {
    const ini = APP.indexOf(`const ${nombre}`);
    return APP.slice(ini, APP.indexOf('];', ini));
  };

  it('E1 · el route guard del PROPIETARIO incluye `titulares` (menú ⊆ acceso) y el del PROFESIONAL no', () => {
    expect(guard('SECCIONES_PROPIETARIO: SectionType[]')).toContain("'titulares'");
    expect(guard('SECCIONES_PROFESIONAL: SectionType[]')).not.toContain("'titulares'");
    expect(seccionesDePerfil('PROPIETARIO').every((s: SectionType) => guard('SECCIONES_PROPIETARIO: SectionType[]').includes(`'${s}'`))).toBe(true);
  });

  it('E2 · `titulares` se monta con la MISMA sección y el helper de permisos; el PROPIETARIO ya no recibe permisos «por defecto»', () => {
    expect(APP).toContain("{activeSection === 'titulares' && renderPropietariosTitulares()}");
    expect(APP).toContain('const permisos = permisosTitulares(currentUser, scopedPropietarios, ADMIN_MASTER_EMAIL);');
    expect(APP).toContain('puedeCrear={permisos.puedeCrear}');
    expect(APP).toContain('fichasEditablesIds={permisos.fichasEditablesIds}');
    expect(APP).toContain('idFichaPropia={permisos.idFichaPropia}');
    // `propietarios` sigue montando el portal para el PROPIETARIO y la sección para el resto.
    const ini = APP.indexOf("{activeSection === 'propietarios' && (");
    const bloque = APP.slice(ini, ini + 2600);
    expect(bloque).toContain("currentUser.tipoPerfil === 'PROPIETARIO' ? (");
    expect(bloque).toContain('<PropietarioPortalSection');
    expect(bloque).toContain('renderPropietariosTitulares()');
  });

  it('E3 · el atajo del alta lleva al PROPIETARIO a `titulares` (su `propietarios` es el portal) y al resto a `propietarios`', () => {
    expect(APP).toContain("setActiveSection(currentUser.tipoPerfil === 'PROPIETARIO' ? 'titulares' : 'propietarios')");
  });

  it('E4 · la ruta de inicio del PROPIETARIO sigue siendo su portal (`propietarios`), no la ficha', () => {
    expect(APP).toMatch(/if \(usuarioApp\.tipoPerfil === 'PROPIETARIO'\) \{\s*return 'propietarios';/);
  });
});
