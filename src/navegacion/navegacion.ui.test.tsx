/**
 * BLOQUE 10 · UX-1 — Tests UI (jsdom) del menú real: `Sidebar` (escritorio) y
 * `MobileNav` (móvil) consumiendo la MISMA fuente única de navegación.
 *
 * Cubre los puntos B, C, D, E, F, G y H del encargo de UX-1 desde el render real:
 *  - paridad escritorio ↔ móvil por perfil (incluida la corrección de `incidencias`);
 *  - grupos visibles, en orden, no interactivos;
 *  - `data-tour` conservado en todos los destinos (tutoriales §6);
 *  - accesibilidad mínima del desplegable móvil y del elemento activo;
 *  - fail-closed (`inversion` no aparece al PROFESIONAL);
 *  - nav ⊆ acceso (invariante comprobada también sobre el render).
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { Sidebar } from '../components/Sidebar';
import { MobileNav } from '../components/MobileNav';
import { GRUPOS_NAVEGACION, seccionesDePerfil } from './navegacion';
import type { PerfilNavegacion } from './navegacion';
import type { SectionType, UsuarioApp } from '../types';

afterEach(() => cleanup());

const APP = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');

const base = {
  id: 'u_ux1',
  authUid: 'u_ux1',
  email: 'ux1@test.invalid',
  nombre: 'Usuario UX1',
  estado: 'ACTIVO',
  activo: true,
  permisos: [],
} as unknown as UsuarioApp;

const admin: UsuarioApp = { ...base, tipoPerfil: 'ADMINISTRADOR', roles: ['ADMINISTRADOR'] };
const propietario: UsuarioApp = { ...base, tipoPerfil: 'PROPIETARIO', roles: ['PROPIETARIO_ESTANDAR'], propietarioId: 'prop_1' };
const profesional: UsuarioApp = { ...base, tipoPerfil: 'PROFESIONAL', roles: ['PROFESIONAL_MANTENIMIENTO'] };
const profesionalGestor: UsuarioApp = { ...base, tipoPerfil: 'PROFESIONAL', roles: ['PROFESIONAL_MANTENIMIENTO', 'GESTOR_PATRIMONIAL'] };

/** Secciones realmente pintadas, en orden de DOM, leídas de `data-tour="nav-*"`. */
function seccionesPintadas(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-tour^="nav-"]')).map((el) =>
    (el.getAttribute('data-tour') || '').replace(/^nav-/, '')
  );
}

function etiquetasBoton(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => (b.textContent || '').trim());
}

function renderSidebar(usuario: UsuarioApp, activeSection: SectionType = 'inmuebles') {
  return render(
    <Sidebar activeSection={activeSection} onSelectSection={() => undefined} candidatos={[]} inmueblesCount={0} currentUser={usuario} />
  );
}

function renderMobileNav(usuario: UsuarioApp, props: Partial<React.ComponentProps<typeof MobileNav>> = {}) {
  const r = render(
    <MobileNav activeSection="inmuebles" onSelectSection={() => undefined} candidatos={[]} currentUser={usuario} {...props} />
  );
  fireEvent.click(r.container.querySelector('button')!); // el primer botón es el desplegable
  return r;
}

// ── C. Paridad escritorio ↔ móvil ────────────────────────────────────────────
describe('UX-1 · C — Paridad escritorio ↔ móvil', () => {
  const casos: { nombre: string; usuario: UsuarioApp; perfil: PerfilNavegacion; opciones: { gestorPatrimonial?: boolean } }[] = [
    { nombre: 'ADMINISTRADOR', usuario: admin, perfil: 'ADMINISTRADOR', opciones: {} },
    { nombre: 'PROPIETARIO', usuario: propietario, perfil: 'PROPIETARIO', opciones: {} },
    { nombre: 'PROFESIONAL', usuario: profesional, perfil: 'PROFESIONAL', opciones: {} },
    { nombre: 'PROFESIONAL+GESTOR_PATRIMONIAL', usuario: profesionalGestor, perfil: 'PROFESIONAL', opciones: { gestorPatrimonial: true } },
  ];

  it.each(casos)('$nombre: el menú móvil ofrece exactamente los mismos destinos, en el mismo orden', ({ usuario, perfil, opciones }) => {
    const esperado = [...seccionesDePerfil(perfil, opciones)];
    const escritorio = renderSidebar(usuario);
    const enEscritorio = seccionesPintadas(escritorio.container);
    escritorio.unmount();

    const movil = renderMobileNav(usuario);
    const enMovil = seccionesPintadas(movil.container);

    expect(enEscritorio).toEqual(esperado);
    expect(enMovil).toEqual(esperado);
  });

  it('las diferencias de etiqueta por perfil son explícitas (no arbitrarias por plataforma)', () => {
    const r1 = renderSidebar(propietario);
    const etiquetasPropietario = etiquetasBoton(r1.container);
    r1.unmount();
    const r2 = renderMobileNav(propietario);
    const etiquetasMovil = etiquetasBoton(r2.container);

    for (const etiqueta of ['Mis Viviendas', 'Mi Portal Propietario', 'Mis Cobros', 'Mis Liquidaciones', 'Mis Gastos', 'Mis Contratos']) {
      expect(etiquetasPropietario.some((e) => e === etiqueta)).toBe(true);
      expect(etiquetasMovil.some((e) => e.startsWith(etiqueta))).toBe(true); // el móvil añade descripción
    }
  });
});

// ── Corrección N4: `incidencias` en ambas plataformas ────────────────────────
describe('UX-1 · Corrección de paridad `incidencias`', () => {
  it.each([
    { nombre: 'ADMINISTRADOR', usuario: admin },
    { nombre: 'PROPIETARIO', usuario: propietario },
  ])('$nombre: `incidencias` está disponible en escritorio y en móvil', ({ usuario }) => {
    const escritorio = renderSidebar(usuario);
    expect(seccionesPintadas(escritorio.container)).toContain('incidencias');
    escritorio.unmount();

    const movil = renderMobileNav(usuario);
    expect(seccionesPintadas(movil.container)).toContain('incidencias');
  });

  it('el route guard sigue permitiendo `incidencias` a ambos perfiles (no se tocó para esta corrección)', () => {
    const inicio = APP.indexOf('const SECCIONES_PROPIETARIO');
    const guardPropietario = APP.slice(inicio, APP.indexOf('];', inicio));
    expect(guardPropietario).toContain("'incidencias'");
    const suministros = APP.slice(APP.indexOf("activeSection === 'incidencias'"), APP.indexOf("activeSection === 'operaciones'"));
    expect(suministros).toContain('<IncidenciasSection');
  });
});

// ── E. Grupos ────────────────────────────────────────────────────────────────
describe('UX-1 · E — Grupos en el menú', () => {
  it('escritorio: encabezados de grupo con los nombres exactos y en orden', () => {
    const { container } = renderSidebar(admin);
    const titulos = Array.from(container.querySelectorAll('nav h3')).map((h) => (h.textContent || '').trim());
    expect(titulos).toEqual(GRUPOS_NAVEGACION.map((g) => g.nombre));
  });

  it('móvil: encabezados de grupo con los nombres exactos y en orden', () => {
    const { container } = renderMobileNav(admin);
    const titulos = Array.from(container.querySelectorAll('nav h3')).map((h) => (h.textContent || '').trim());
    expect(titulos).toEqual(GRUPOS_NAVEGACION.map((g) => g.nombre));
  });

  it('los encabezados de grupo son elementos no interactivos (no botones, no destinos)', () => {
    const { container } = renderSidebar(admin);
    for (const grupo of GRUPOS_NAVEGACION) {
      expect(container.querySelector(`button[data-tour="nav-"]`)).toBeNull();
      const titulo = Array.from(container.querySelectorAll('h3')).find((h) => h.textContent?.trim() === grupo.nombre)!;
      expect(titulo).toBeTruthy();
      expect(titulo.closest('button')).toBeNull();
      expect(titulo.hasAttribute('onclick')).toBe(false);
    }
    // Los destinos siguen siendo botones reales
    for (const boton of Array.from(container.querySelectorAll('[data-tour^="nav-"]'))) {
      expect(boton.tagName).toBe('BUTTON');
    }
  });

  it('sólo se pintan grupos con contenido (el PROFESIONAL no ve «Económico» sin rol delegado)', () => {
    const { container } = renderSidebar(profesional);
    const titulos = Array.from(container.querySelectorAll('nav h3')).map((h) => (h.textContent || '').trim());
    expect(titulos).toEqual(['Inicio y control', 'Cartera y propiedad', 'Sistema']);
    cleanup();
    const conRol = renderSidebar(profesionalGestor);
    const titulosGestor = Array.from(conRol.container.querySelectorAll('nav h3')).map((h) => (h.textContent || '').trim());
    expect(titulosGestor).toEqual(['Inicio y control', 'Cartera y propiedad', 'Económico', 'Comercial y alquiler', 'Sistema']);
  });
});

// ── F. Etiquetas confirmadas ─────────────────────────────────────────────────
describe('UX-1 · F — Nomenclatura en el menú', () => {
  it('`dashboard` se muestra como «Centro de Control» y `administracion` como «Administración y Seguridad»', () => {
    const { container } = renderSidebar(admin);
    const etiquetas = etiquetasBoton(container);
    expect(etiquetas).toContain('Centro de Control');
    expect(etiquetas).toContain('Administración y Seguridad');
    // Ya no coexisten los dos nombres ambiguos anteriores
    expect(etiquetas).not.toContain('Centro Control Ejecutivo');
    expect(etiquetas).not.toContain('Centro de Control Ejecutivo');
  });

  it('no hay etiquetas repetidas entre destinos del mismo perfil (escritorio)', () => {
    for (const usuario of [admin, propietario, profesional, profesionalGestor]) {
      const { container } = renderSidebar(usuario);
      const etiquetas = etiquetasBoton(container);
      expect(new Set(etiquetas).size).toBe(etiquetas.length);
      cleanup();
    }
  });
});

// ── G. data-tour (tutoriales §6) ─────────────────────────────────────────────
describe('UX-1 · G — data-tour conservado', () => {
  it('todos los destinos de ambas plataformas llevan `data-tour="nav-<seccion>"`', () => {
    const escritorio = renderSidebar(admin);
    expect(seccionesPintadas(escritorio.container)).toEqual([...seccionesDePerfil('ADMINISTRADOR')]);
    escritorio.unmount();

    const movil = renderMobileNav(admin);
    expect(seccionesPintadas(movil.container)).toEqual([...seccionesDePerfil('ADMINISTRADOR')]);
  });

  it('los selectores usados por los tutoriales siguen existiendo', () => {
    const { container } = renderSidebar(admin);
    expect(container.querySelector('[data-tour="nav-inquilinos"]')).toBeTruthy(); // RECORRIDO_INVITAR_INQUILINO
    expect(container.querySelector('[data-tour="nav-tesoreria"]')).toBeTruthy();  // TUTORIAL_LIQUIDACION
  });

  it('el tutorial real §6 sigue encontrando su target en el Sidebar real', () => {
    const { container } = renderSidebar(admin);
    expect(container.querySelectorAll('[data-tour="nav-inquilinos"]').length).toBe(1);
    expect(screen.getByText('Portal Inquilinos')).toBeTruthy();
  });
});

// ── D + H. Guard y fail-closed sobre el render ───────────────────────────────
describe('UX-1 · D/H — Navegación ⊆ acceso y fail-closed', () => {
  it('`inversion` no aparece al PROFESIONAL en ninguna plataforma', () => {
    const escritorio = renderSidebar(profesionalGestor);
    expect(seccionesPintadas(escritorio.container)).not.toContain('inversion');
    escritorio.unmount();
    const movil = renderMobileNav(profesionalGestor);
    expect(seccionesPintadas(movil.container)).not.toContain('inversion');
  });

  it('el PROPIETARIO no ve destinos de gestión interna en ninguna plataforma', () => {
    const prohibidas = ['inquilinos', 'morosidad', 'candidatos', 'preseleccionados', 'seguro_impago', 'analisis', 'administracion'];
    const escritorio = renderSidebar(propietario);
    const enEscritorio = seccionesPintadas(escritorio.container);
    escritorio.unmount();
    const movil = renderMobileNav(propietario);
    const enMovil = seccionesPintadas(movil.container);
    for (const s of prohibidas) {
      expect(enEscritorio).not.toContain(s);
      expect(enMovil).not.toContain(s);
    }
    expect(enEscritorio).toContain('suministros');
    expect(enMovil).toContain('suministros');
  });
});

// ── Navegación real y accesibilidad mínima ───────────────────────────────────
describe('UX-1 · Navegación y accesibilidad mínima', () => {
  it('al pulsar un destino se navega a esa sección (escritorio y móvil)', () => {
    const selEscritorio: SectionType[] = [];
    const r1 = render(
      <Sidebar activeSection="inmuebles" onSelectSection={(s) => selEscritorio.push(s)} candidatos={[]} inmueblesCount={0} currentUser={admin} />
    );
    fireEvent.click(r1.container.querySelector('[data-tour="nav-tesoreria"]')!);
    expect(selEscritorio).toEqual(['tesoreria']);
    r1.unmount();

    const selMovil: SectionType[] = [];
    const r2 = render(
      <MobileNav activeSection="inmuebles" onSelectSection={(s) => selMovil.push(s)} candidatos={[]} currentUser={admin} />
    );
    fireEvent.click(r2.container.querySelector('button')!);
    fireEvent.click(r2.container.querySelector('[data-tour="nav-tesoreria"]')!);
    expect(selMovil).toEqual(['tesoreria']);
  });

  it('el destino activo se expone con `aria-current="page"` y sólo uno por menú', () => {
    const { container } = renderSidebar(admin, 'cobros');
    const activos = Array.from(container.querySelectorAll('[aria-current="page"]'));
    expect(activos).toHaveLength(1);
    expect(activos[0].getAttribute('data-tour')).toBe('nav-cobros');
    cleanup();

    const movil = renderMobileNav(admin, { activeSection: 'cobros' } as never);
    const activosMovil = Array.from(movil.container.querySelectorAll('[aria-current="page"]'));
    expect(activosMovil).toHaveLength(1);
    expect(activosMovil[0].getAttribute('data-tour')).toBe('nav-cobros');
  });

  it('el desplegable móvil anuncia su estado y controla el panel', () => {
    const { container } = render(
      <MobileNav activeSection="inmuebles" onSelectSection={() => undefined} candidatos={[]} currentUser={admin} />
    );
    const toggle = container.querySelector('button')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panelId = toggle.getAttribute('aria-controls')!;
    expect(panelId).toBeTruthy();
    const panel = container.querySelector(`#${CSS.escape(panelId)}`)!;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('aria-label')).toBe('Navegación del ERP');
  });

  it('el menú de escritorio es una región de navegación etiquetada', () => {
    renderSidebar(admin);
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
  });

  it('se conservan los badges existentes en ambas plataformas', () => {
    const r1 = render(
      <Sidebar activeSection="inmuebles" onSelectSection={() => undefined} candidatos={[]} inmueblesCount={0} cobrosPendientesCount={3} currentUser={admin} />
    );
    expect(r1.container.querySelector('[data-tour="nav-cobros"]')!.textContent).toContain('3');
    r1.unmount();

    const r2 = render(
      <MobileNav activeSection="inmuebles" onSelectSection={() => undefined} candidatos={[]} currentUser={admin} cobrosPendientesCount={3} />
    );
    fireEvent.click(r2.container.querySelector('button')!);
    expect(r2.container.querySelector('[data-tour="nav-cobros"]')!.textContent).toContain('3');
  });
});
