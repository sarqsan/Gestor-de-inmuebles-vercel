/**
 * BLOQUE E — Batería automatizada (ORDEN 8) · NAVEGACIÓN Y ENRUTADO
 *
 *  - Sidebar / MobileNav reales: entradas E por perfil, sin duplicidades.
 *  - Enrutado de entrada de App.tsx (verificación estática del código real):
 *    INQUILINO → solo portal; `?registroInq=` → registro; secciones E.
 *  - Persistencia del contexto en recarga: el portal depende únicamente del
 *    usuario autenticado (Firebase Auth) y de `?registroInq=` en la URL.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sidebar } from '../../components/Sidebar';
import { MobileNav } from '../../components/MobileNav';
import { usuarioStaffTest, usuarioInquilinoTest } from './fixturesE';
import type { SectionType, UsuarioApp } from '../../types';
import { PERMISOS_SISTEMA, ROLES_PREDEFINIDOS } from '../../types';

afterEach(() => cleanup());

const APP = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');

const propietario: UsuarioApp = {
  ...usuarioStaffTest(),
  id: 'uid_TEST_PROP',
  authUid: 'uid_TEST_PROP',
  tipoPerfil: 'PROPIETARIO',
  roles: ['PROPIETARIO_ESTANDAR'],
  propietarioId: 'prop_TEST_A',
};

function etiquetasVisibles(): string[] {
  return Array.from(document.querySelectorAll('button'))
    .map((b) => (b.textContent || '').trim())
    .filter(Boolean);
}

describe('E · Navegación canónica (Sidebar / MobileNav)', () => {
  it('Sidebar ADMINISTRADOR: incluye «Portal Inquilinos» y «Suministros» una sola vez y navega a ellas', () => {
    const seleccion: SectionType[] = [];
    render(
      <Sidebar activeSection="inmuebles" onSelectSection={(s) => seleccion.push(s)} candidatos={[]} inmueblesCount={0} currentUser={usuarioStaffTest()} />
    );
    const etiquetas = etiquetasVisibles();
    expect(etiquetas.filter((e) => e.includes('Portal Inquilinos')).length).toBe(1);
    expect(etiquetas.filter((e) => e.includes('Suministros')).length).toBe(1);
    // Sin duplicidades en ninguna entrada
    const repetidas = etiquetas.filter((e, i) => etiquetas.indexOf(e) !== i);
    expect(repetidas).toEqual([]);
    fireEvent.click(screen.getByText('Portal Inquilinos').closest('button')!);
    fireEvent.click(screen.getByText('Suministros').closest('button')!);
    expect(seleccion).toEqual(['inquilinos', 'suministros']);
  });

  it('Sidebar PROPIETARIO: ve «Suministros» pero NO «Portal Inquilinos» (gestión de accesos = staff)', () => {
    render(<Sidebar activeSection="inmuebles" onSelectSection={() => undefined} candidatos={[]} inmueblesCount={0} currentUser={propietario} />);
    const etiquetas = etiquetasVisibles();
    expect(etiquetas.some((e) => e.includes('Suministros'))).toBe(true);
    expect(etiquetas.some((e) => e.includes('Portal Inquilinos'))).toBe(false);
    // Las entradas canónicas previas siguen presentes (sin regresión de navegación)
    for (const l of ['Mis Viviendas', 'Mis Contratos', 'Mis Cobros', 'Mis Liquidaciones', 'Actas Entrada/Salida', 'Incidencias']) {
      expect(etiquetas.some((e) => e.includes(l))).toBe(true);
    }
  });

  it('MobileNav ADMINISTRADOR y PROPIETARIO: mismas entradas E que el Sidebar, sin duplicidades', () => {
    const abrirMenu = () => fireEvent.click(document.querySelector('button')!); // desplegable plegado por defecto
    const r1 = render(<MobileNav activeSection="inmuebles" onSelectSection={() => undefined} candidatos={[]} currentUser={usuarioStaffTest()} />);
    abrirMenu();
    let etiquetas = etiquetasVisibles();
    expect(etiquetas.filter((e) => e.startsWith('Portal Inquilinos')).length).toBe(1);
    expect(etiquetas.filter((e) => e.startsWith('Suministros')).length).toBe(1);
    r1.unmount();
    render(<MobileNav activeSection="inmuebles" onSelectSection={() => undefined} candidatos={[]} currentUser={propietario} />);
    abrirMenu();
    etiquetas = etiquetasVisibles();
    expect(etiquetas.filter((e) => e.startsWith('Suministros')).length).toBe(1);
    expect(etiquetas.some((e) => e.startsWith('Portal Inquilinos'))).toBe(false);
  });
});

describe('E · Enrutado de entrada (App.tsx real, verificación estática)', () => {
  it('el perfil INQUILINO se enruta al portal ANTES de cualquier vista del ERP y nunca recibe Sidebar/MobileNav', () => {
    const iPortal = APP.indexOf("if (currentUser?.tipoPerfil === 'INQUILINO') {");
    const iShell = APP.indexOf('<InquilinoPortalShell usuario={currentUser} onLogout={handleLogout} />');
    const iSidebar = APP.indexOf('<Sidebar');
    const iMobile = APP.indexOf('<MobileNav');
    const iLogin = APP.indexOf('<LoginView');
    expect(iPortal).toBeGreaterThan(0);
    expect(iShell).toBeGreaterThan(iPortal);
    expect(iShell - iPortal).toBeLessThan(200); // return inmediato
    expect(iPortal).toBeLessThan(iSidebar);
    expect(iPortal).toBeLessThan(iMobile);
    expect(iPortal).toBeLessThan(iLogin);
    // El shell solo se monta una vez (sin ruta alternativa que muestre el ERP a un inquilino)
    expect(APP.split('<InquilinoPortalShell').length - 1).toBe(1);
  });

  it('`?registroInq=` abre el registro de inquilino a pantalla completa y limpia la URL al terminar/cancelar', () => {
    expect(APP).toContain("params.get('registroInq')");
    expect(APP).toContain('<RegistroInquilinoView');
    expect(APP).toContain("window.history.pushState({}, '', window.location.pathname)");
    expect(APP).toContain('const handleCompleteInquilinoRegistration = (usuario: UsuarioApp) => {');
    // Tras el registro se establece el usuario → siguiente render cae en el enrutado INQUILINO
    const bloque = APP.slice(APP.indexOf('const handleCompleteInquilinoRegistration'), APP.indexOf('const handleLogout'));
    expect(bloque).toContain('setCurrentUser(usuario)');
  });

  it('secciones E en el ERP: «inquilinos» solo ADMINISTRADOR; «suministros» admin (todo) y propietario (alcance)', () => {
    expect(APP).toContain("activeSection === 'inquilinos' && currentUser.tipoPerfil === 'ADMINISTRADOR'");
    const sum = APP.slice(APP.indexOf("activeSection === 'suministros'"), APP.indexOf("activeSection === 'incidencias'"));
    expect(sum).toContain("currentUser.tipoPerfil === 'ADMINISTRADOR' ? (");
    expect(sum).toContain('<SuministrosSection currentUser={currentUser} inmuebles={inmuebles} />');
    expect(sum).toContain("currentUser.tipoPerfil === 'PROPIETARIO' ? (");
    expect(sum).toContain('<SuministrosSection currentUser={currentUser} inmuebles={scopedInmuebles} />');
    // El propietario tiene 'suministros' en su lista de secciones permitidas, pero no 'inquilinos'
    const allowed = APP.slice(APP.indexOf('const allowedSections'), APP.indexOf('if (!allowedSections.includes(activeSection))'));
    expect(allowed).toContain("'suministros'");
    expect(allowed).not.toContain("'inquilinos'");
    // Sin duplicidad del bloque de tesorería (exclusión aplicada en la integración)
    expect(APP.split("activeSection === 'tesoreria'").length - 1).toBe(1);
  });

  it('recarga directa: el portal no depende de rutas de path (fallback SPA) ni de estado local; el contexto es el usuario autenticado', () => {
    // El portal se decide por `currentUser.tipoPerfil` (Firebase Auth → usuarios/{uid}), no por URL
    expect(APP).not.toMatch(/pathname\.includes\(['"]\/portal/);
    // No hay persistencia de contexto de inquilino en localStorage (solo cachés canónicas preexistentes)
    const clavesLocal = Array.from(APP.matchAll(/localStorage\.(get|set)Item\('([^']+)'/g)).map((m) => m[2]);
    expect(clavesLocal.every((k) => k.startsWith('rentselect_'))).toBe(true);
    expect(clavesLocal.some((k) => /inquilino|tenant|registroInq/i.test(k))).toBe(false);
  });
});

describe('E · RBAC canónico ampliado', () => {
  it('rol INQUILINO_PORTAL: solo lectura de inmuebles/contratos; sin permisos de gestión', () => {
    const rol = ROLES_PREDEFINIDOS.find((r) => r.id === 'INQUILINO_PORTAL')!;
    expect(rol).toBeTruthy();
    expect(rol.esSistema).toBe(true);
    expect(rol.permisos).toEqual(['inmuebles.ver', 'contratos.ver']);
    expect(rol.permisos.some((p) => /gestionar|crear|eliminar|editar|aprobar|administracion/.test(p))).toBe(false);
  });

  it('permisos nuevos (inquilinos.*, suministros.*) definidos una sola vez; sin duplicar tesoreria.*', () => {
    const codigos = PERMISOS_SISTEMA.map((p) => p.codigo);
    for (const c of ['inquilinos.ver', 'inquilinos.gestionar', 'suministros.ver', 'suministros.gestionar']) {
      expect(codigos.filter((x) => x === c).length).toBe(1);
    }
    const dup = codigos.filter((c, i) => codigos.indexOf(c) !== i);
    expect(dup).toEqual([]);
    const inq = usuarioInquilinoTest('A');
    expect(inq.permisos.some((p) => p.startsWith('inquilinos.') || p.startsWith('suministros.'))).toBe(false);
  });
});
