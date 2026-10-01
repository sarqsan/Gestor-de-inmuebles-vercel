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
 *      de firestore.rules): master crea y edita todas; el PROPIETARIO crea y mantiene la SUYA y
 *      TANTAS fichas de titular como necesite dentro de su ÁMBITO (sin tope: la cantidad no es parte
 *      de ninguna condición); nadie más crea. Nada de «Crear titular» que Firestore vaya a denegar.
 *   C. SECCIÓN: «Crear titular» visible para quien puede (también el PROPIETARIO, siempre), ficha
 *      completa (personal + contacto + fiscal + IBAN) en un solo formulario; sin ningún mensaje que
 *      remita a un administrador.
 *   D. ALTA DE INMUEBLE: el botón/atajo hacia Propietarios/Titulares existe y navega.
 *   E. CABLEADO de App.tsx: la ruta `titulares`, el route guard y el uso del helper de permisos.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { Sidebar } from '../src/components/Sidebar';
import { MobileNav } from '../src/components/MobileNav';
import { PropietariosSection } from '../src/components/sections/PropietariosSection';
import { InmueblesSection } from '../src/components/sections/InmueblesSection';
import { permisosTitulares } from '../src/utils/permisosTitulares';
import { seccionesDePerfil, gruposDePerfil } from '../src/navegacion/navegacion';
import { ADMIN_MASTER_EMAIL } from '../src/lib/authService';
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

  it('B2 · PROPIETARIO con ficha propia: SIGUE pudiendo crear titulares (sin tope) y edita la suya', () => {
    const p = permisosTitulares(propietario, [ficha('prop_1')], ADMIN_MASTER_EMAIL);
    expect(p).toMatchObject({
      esMaster: false, puedeGestionar: true, puedeCrear: true, puedeCrearFichaPropia: false,
      ambitoPropietarioId: 'prop_1', idFichaPropia: 'prop_1', fichaPropiaExiste: true,
    });
    expect(p.fichasEditablesIds).toEqual(['prop_1']);
  });

  it('B2b · con fichas de su ámbito: edita la suya y TODAS las de su ámbito (cualquier número), ninguna ajena', () => {
    const delAmbito = Array.from({ length: 60 }, (_, i) => ficha(`tit_ambito${String(i).padStart(3, '0')}`, { ambitoPropietarioId: 'prop_1' }));
    const ajenas = [ficha('prop_9'), ficha('tit_ajena0001', { ambitoPropietarioId: 'prop_2' })];
    const p = permisosTitulares(propietario, [ficha('prop_1'), ...delAmbito, ...ajenas], ADMIN_MASTER_EMAIL);
    // `puedeCrear` NO depende de cuántas haya: con 60 sigue siendo true.
    expect(p.puedeCrear).toBe(true);
    expect(p.fichasEditablesIds).toEqual(['prop_1', ...delAmbito.map((f) => f.id)]);
    expect(p.fichasEditablesIds).not.toContain('prop_9');
    expect(p.fichasEditablesIds).not.toContain('tit_ajena0001');
  });

  it('B3 · PROPIETARIO sin ficha propia todavía: puede crear titulares Y su ficha propia (id fijado por las Rules)', () => {
    const p = permisosTitulares(propietario, [], ADMIN_MASTER_EMAIL);
    expect(p).toMatchObject({
      puedeGestionar: true, puedeCrear: true, puedeCrearFichaPropia: true, idFichaPropia: 'prop_1', fichaPropiaExiste: false,
    });
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
    it('…y TANTAS fichas de titular como necesite en SU ámbito (id `tit_…` + ámbito propio): por eso la UI le ofrece «Crear titular»', () => {
      const titular = (id: string) => ({ ...nueva(id), ambitoPropietarioId: 'prop_1' });
      expect(permite('propietarios', 'create', peticion('tit_conyuge0001', null, titular('tit_conyuge0001')))).toBe(true);
      expect(permite('propietarios', 'create', peticion('tit_sociedad001', null, titular('tit_sociedad001')))).toBe(true);
    });
    it('…pero NO fichas fuera de su ámbito ni en el id de otra ficha de cuenta: la UI nunca las ofrece', () => {
      // sin ámbito (o con un ámbito ajeno) y/o con un id de cuenta ajeno
      expect(permite('propietarios', 'create', peticion('prop-nuevo', null, nueva('prop-nuevo')))).toBe(false);
      expect(permite('propietarios', 'create', peticion('prop_2', null, nueva('prop_2')))).toBe(false);
      expect(permite('propietarios', 'create', peticion('prop_2', null, { ...nueva('prop_2'), ambitoPropietarioId: 'prop_1' }))).toBe(false);
      expect(permite('propietarios', 'create', peticion('tit_ajeno000001', null, { ...nueva('tit_ajeno000001'), ambitoPropietarioId: 'prop_2' }))).toBe(false);
    });
    it('edita la suya y la de su ámbito, no la ajena', () => {
      const editada = { ...(db['propietarios/prop_1'] as object), telefono: '600000000' };
      expect(permite('propietarios', 'update', peticion('prop_1', db['propietarios/prop_1'], editada))).toBe(true);
      const delAmbito = { ...nueva('tit_conyuge0001'), ambitoPropietarioId: 'prop_1' };
      expect(permite('propietarios', 'update', peticion('tit_conyuge0001', delAmbito, { ...delAmbito, telefono: '611111111' }))).toBe(true);
      const ajena = { ...(db['propietarios/prop_2'] as object), telefono: '600000000' };
      expect(permite('propietarios', 'update', peticion('prop_2', db['propietarios/prop_2'], ajena))).toBe(false);
    });
    it('la ficha jurídica nunca se borra y `list` es del master o de la consulta por ámbito propio (la UI no ofrece «Eliminar»)', () => {
      expect(permite('propietarios', 'delete', peticion('prop_1', db['propietarios/prop_1'], null))).toBe(false);
      // una ficha SIN ámbito no es listable por el PROPIETARIO…
      expect(permite('propietarios', 'list', peticion('prop_1', db['propietarios/prop_1'], null))).toBe(false);
      // …y una de SU ámbito sí; una de otro ámbito, no.
      const propia = { ...nueva('tit_conyuge0001'), ambitoPropietarioId: 'prop_1' };
      const ajena = { ...nueva('tit_ajeno000001'), ambitoPropietarioId: 'prop_2' };
      expect(permite('propietarios', 'list', peticion('tit_conyuge0001', propia, null))).toBe(true);
      expect(permite('propietarios', 'list', peticion('tit_ajeno000001', ajena, null))).toBe(false);
    });
    it('los pines de fuente del helper siguen vigentes en las Rules', () => {
      const bloque = RULES.slice(RULES.indexOf('match /propietarios/{propietarioId}'), RULES.indexOf('match /inmuebles/{inmuebleId}'));
      expect(bloque).toContain('allow list: if isMasterAdmin() || titularEnMiAmbito(resource.data);');
      expect(bloque).toContain('&& propietarioId == myPropId()');
      expect(bloque).toContain("d.ambitoPropietarioId == myPropId()");
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
        puedeCrearFichaPropia={permisos.puedeCrearFichaPropia}
        ambitoPropietarioId={permisos.ambitoPropietarioId}
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

  it('C2 · MASTER: guardar una ficha completa llama a `onSavePropietario` con datos personales, de contacto y fiscales', async () => {
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

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const guardado = onSave.mock.calls[0][0] as Propietario;
    // Ficha PERSONAL + CONTACTO + FISCAL en una sola alta.
    expect(guardado).toMatchObject({
      nombre: 'Ana García López', nifCif: '12345678Z', tipoPropietario: 'persona_fisica',
      telefono: '600111222', email: 'ana@correo.test', direccion: 'Calle Mayor 1',
    });
    expect(guardado.id).toMatch(/^prop-\d+$/);
    // El master NO crea fichas «de ámbito»: no lleva `ambitoPropietarioId`.
    expect(guardado.ambitoPropietarioId).toBeUndefined();
    expect(Array.isArray(guardado.cuentasBancarias)).toBe(true);
  });

  it('C3 · PROPIETARIO con ficha propia: «Crear titular» SIGUE visible, edita su ficha, sin «Eliminar» y SIN remitir a un administrador', () => {
    const onSave = vi.fn();
    montar(permisosTitulares(propietario, [ficha('prop_1')], ADMIN_MASTER_EMAIL), [ficha('prop_1')], onSave);

    // «Crear titular» está SIEMPRE: tener ya una ficha no lo oculta.
    expect(screen.getByTestId('boton-crear-titular').textContent).toContain('Crear titular');
    // Con su ficha propia ya creada no hay «Crear mi ficha» (sería duplicarla).
    expect(screen.queryByTestId('boton-crear-mi-ficha')).toBeNull();
    expect(screen.getByText('Titular prop_1')).toBeTruthy();
    expect(screen.getByTitle('Editar titular')).toBeTruthy();
    expect(screen.queryByTitle('Eliminar titular')).toBeNull();
    // Ningún aviso de «acude a la administración» y no es el modo «solo consulta».
    expect(screen.queryByTestId('titulares-alta-administracion')).toBeNull();
    expect(screen.queryByTestId('propietarios-solo-consulta')).toBeNull();
    expect(document.body.textContent).not.toMatch(/corresponde (a|al) (la )?administra/i);
    expect(document.body.textContent).not.toMatch(/administrador principal/i);
    // La guía es la de crear titulares (también para él).
    expect(screen.getByTestId('aviso-titular-inexistente-propietarios')).toBeTruthy();
    expect(screen.getByText('1. Crea el titular')).toBeTruthy();
    expect(screen.getByTestId('titulares-ambito-ayuda').textContent).toMatch(/tantos titulares como necesites/);
  });

  it('C4 · PROPIETARIO: editar su ficha conserva su id (la regla `update` exige id == propietarioId)', async () => {
    const onSave = vi.fn();
    const suya = ficha('prop_1', { nifCif: '12345678Z' }); // NIF válido: el formulario valida antes de guardar
    montar(permisosTitulares(propietario, [suya], ADMIN_MASTER_EMAIL), [suya], onSave);
    fireEvent.click(screen.getByTitle('Editar titular'));
    fireEvent.change(screen.getByPlaceholderText('Ej: +34 600 000 000'), { target: { value: '699999999' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0][0] as Propietario).id).toBe('prop_1');
    expect((onSave.mock.calls[0][0] as Propietario).telefono).toBe('699999999');
  });

  it('C5 · PROPIETARIO sin ficha propia: «Crear titular» Y «Crear mi ficha de titular» (esta la crea con SU id, sin ámbito)', async () => {
    const onSave = vi.fn();
    montar(permisosTitulares(propietario, [], ADMIN_MASTER_EMAIL), [], onSave);
    expect(screen.getByTestId('boton-crear-titular').textContent).toContain('Crear titular');
    const crearMia = screen.getByTestId('boton-crear-mi-ficha');
    expect(crearMia.textContent).toContain('Crear mi ficha de titular');
    expect(screen.getByTestId('titulares-ficha-propia-pendiente')).toBeTruthy();
    fireEvent.click(crearMia);
    fireEvent.change(screen.getByPlaceholderText('Ej: Manuel Gómez Rodríguez'), { target: { value: 'Pedro Ruiz' } });
    fireEvent.change(screen.getByPlaceholderText('Ej: 12345678Z o B-12345678'), { target: { value: '12345678z' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Propietario/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const guardada = onSave.mock.calls[0][0] as Propietario;
    expect(guardada.id).toBe('prop_1'); // las Rules solo permiten la ficha propia con id == propietarioId
    expect(guardada.nifCif).toBe('12345678Z');
    expect(guardada.ambitoPropietarioId).toBeUndefined(); // la ficha propia no entra en ningún ámbito
  });

  it('C6 · una ficha AJENA visible (p. ej. por una cartera gestionada) no ofrece editar, eliminar ni añadir IBAN; las de SU ámbito sí', () => {
    const delAmbito = ficha('tit_conyuge0001', { ambitoPropietarioId: 'prop_1' });
    const visibles = [ficha('prop_1'), delAmbito, ficha('prop_9')];
    montar(permisosTitulares(propietario, visibles, ADMIN_MASTER_EMAIL), visibles);
    // Editables: la propia y la de su ámbito. `prop_9` (ajena) no tiene ninguna acción.
    expect(screen.getAllByTitle('Editar titular')).toHaveLength(2);
    expect(screen.getAllByText('Añadir IBAN')).toHaveLength(2);
    expect(screen.getByTestId('insignia-ficha-propia-prop_1')).toBeTruthy();
    expect(screen.getByTestId('insignia-titular-ambito-tit_conyuge0001')).toBeTruthy();
    expect(screen.queryByTestId('insignia-titular-ambito-prop_9')).toBeNull();
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

  it('D2 · el botón de cabecera es «Crear titular en Propietarios/Titulares» para TODOS los que crean titulares (también el PROPIETARIO)', () => {
    for (const usuario of [master, propietario]) {
      const alNavegar = vi.fn();
      abrirAlta(usuario, alNavegar);
      expect(screen.queryByRole('button', { name: /Ir a Propietarios\/Titulares/ })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: /Crear titular en Propietarios\/Titulares/ }));
      expect(alNavegar).toHaveBeenCalledTimes(1);
      cleanup();
    }
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
    // El helper se alimenta de `titularesVisibles` (ficha propia + titulares de su ámbito), no de la lista
    // «solo propia» `scopedPropietarios`, que sigue siendo la de Tesorería/Facturación.
    expect(APP).toContain('const permisos = permisosTitulares(currentUser, titularesVisibles, ADMIN_MASTER_EMAIL);');
    expect(APP).toContain('propietarios={titularesVisibles}');
    expect(APP).toContain('puedeCrear={permisos.puedeCrear}');
    expect(APP).toContain('puedeCrearFichaPropia={permisos.puedeCrearFichaPropia}');
    expect(APP).toContain('ambitoPropietarioId={permisos.ambitoPropietarioId}');
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
