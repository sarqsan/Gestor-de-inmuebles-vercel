/**
 * UX-1A · Los recorridos salen en el Centro de Ayuda y sus targets existen en la UI real.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { UsuarioApp } from '../../types';
import { ROLES_PREDEFINIDOS } from '../../types';
import { CentroAyudaSection } from '../sections/CentroAyudaSection';
import { PropietarioPortalSection } from '../sections/PropietarioPortalSection';
import { ProfesionalPortalSection } from '../sections/ProfesionalPortalSection';
import { InmueblesSection } from '../sections/InmueblesSection';
import { AdminControlCenter } from '../admin/AdminControlCenter';
import { Header } from '../Header';
import { Sidebar } from '../Sidebar';
import {
  RECORRIDO_ADMIN_CENTRO,
  RECORRIDO_PROFESIONAL_PORTAL,
  RECORRIDO_PROPIETARIO_PORTAL,
  selectorTour,
} from '../../experiencia';

vi.mock('../../lib/firebase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/firebase')>();
  return {
    ...actual,
    subscribeTrabajosProfesionales: () => () => undefined,
    subscribeIncidencias: () => () => undefined,
    saveTrabajoProfesionalFirestore: async () => undefined,
    saveIncidenciaFirestore: async () => undefined,
  };
});

afterEach(() => cleanup());

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
function usuario(tipo: UsuarioApp['tipoPerfil'], extra: Partial<UsuarioApp> = {}): UsuarioApp {
  return {
    id: 'u-ux1a',
    nombre: 'Usuario UX',
    email: 'ux@test.local',
    tipoPerfil: tipo,
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...extra,
  };
}
const admin = usuario('ADMINISTRADOR', { roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos });
const propietario = usuario('PROPIETARIO', { roles: ['PROPIETARIO_ESTANDAR'], permisos: rol('PROPIETARIO_ESTANDAR').permisos, propietarioId: 'prop-1' });
const profesional = usuario('PROFESIONAL', { roles: ['PROFESIONAL_MANTENIMIENTO'], permisos: rol('PROFESIONAL_MANTENIMIENTO').permisos });

function idsDe(tutorial: { steps: { target?: string }[] }): string[] {
  return tutorial.steps.map((p) => p.target!.match(/data-tour="([^"]+)"/)![1]);
}

describe('UX-1A · Centro de Ayuda', () => {
  it('cada perfil ve su recorrido nuevo y no los de los otros', () => {
    const iniciar = vi.fn();
    render(<CentroAyudaSection usuario={admin} onIniciarTutorial={iniciar} />);
    const tut = screen.getByLabelText('Tutoriales');
    expect(within(tut).getByText('Conoce el Centro de Control')).toBeTruthy();
    expect(within(tut).queryByText('Conoce tu portal profesional')).toBeNull();
    fireEvent.click(within(tut).getAllByRole('button', { name: 'Comenzar' })[0]);
    // El primero del registro sigue siendo el de liquidaciones: no se reordena el centro.
    expect(iniciar).toHaveBeenCalledWith('tutorial.tesoreria.liquidacion');
    cleanup();

    render(<CentroAyudaSection usuario={propietario} onIniciarTutorial={iniciar} accessibleSections={['propietarios', 'inmuebles', 'actas', 'ayuda']} />);
    expect(screen.getByText('Conoce tu portal', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Conoce el Centro de Control')).toBeNull();
    expect(screen.queryByText('Conoce tu portal profesional')).toBeNull();
    cleanup();

    render(<CentroAyudaSection usuario={profesional} onIniciarTutorial={iniciar} accessibleSections={['administracion', 'inmuebles', 'ayuda']} />);
    expect(screen.getByText('Conoce tu portal profesional')).toBeTruthy();
    expect(screen.queryByText('Conoce tu portal', { exact: true })).toBeNull();
  });
});

describe('UX-1A · targets reales', () => {
  it('el Centro de Control, el menú y el asistente tienen los targets del recorrido de administrador', () => {
    render(
      <AdminControlCenter
        currentUser={admin}
        usuarios={[]}
        inmuebles={[]}
        propietarios={[]}
        profesionales={[]}
        contratos={[]}
        auditLogs={[]}
        enlacesRegistro={[]}
        especialidades={[]}
        onLogout={() => undefined}
        onSaveUsuario={async () => undefined}
        onDeleteUsuario={async () => undefined}
        onSaveEnlaceRegistro={async () => undefined}
        onDeleteEnlaceRegistro={async () => undefined}
        onSaveEspecialidad={async () => undefined}
        onDeleteEspecialidad={async () => undefined}
        onOpenCrearUsuarioModal={() => undefined}
        onOpenCrearEnlaceModal={() => undefined}
      />,
    );
    expect(document.querySelector(selectorTour('admin-centro-marca'))).toBeTruthy();
    expect(document.querySelector(selectorTour('admin-kpis'))).toBeTruthy();
    cleanup();

    render(<Sidebar activeSection="administracion" onSelectSection={() => undefined} candidatos={[]} inmueblesCount={0} currentUser={admin} />);
    expect(document.querySelector(selectorTour('nav-inmuebles'))).toBeTruthy();
    expect(document.querySelector(selectorTour('nav-ayuda'))).toBeTruthy();
    cleanup();

    render(
      <Header
        activeSection="administracion"
        userProfile={{ nombre: 'Perfil', email: 'p@test.local' } as never}
        onSelectSection={() => undefined}
        currentUser={admin}
        onAccionAsistente={() => undefined}
      />,
    );
    expect(document.querySelector(selectorTour('asistente-erp'))).toBeTruthy();
    for (const id of idsDe(RECORRIDO_ADMIN_CENTRO)) {
      expect(['admin-centro-marca', 'admin-kpis', 'nav-inmuebles', 'nav-ayuda', 'asistente-erp']).toContain(id);
    }
  });

  it('el portal del propietario expone los targets de su recorrido, sin tocar el CTA de alta', () => {
    render(
      <PropietarioPortalSection
        currentUser={propietario}
        inmuebles={[]}
        profesionales={[]}
        contratos={[]}
        especialidades={[]}
        propietarios={[]}
        onOpenCrearProfesionalModal={() => undefined}
        onSaveProfesional={async () => undefined}
        onCrearInmueble={() => undefined}
      />,
    );
    for (const id of ['propietario-portal-cabecera', 'propietario-tab-viviendas', 'propietario-tab-liquidaciones', 'propietario-tab-contratos', 'propietario-tab-perfil']) {
      expect(document.querySelector(selectorTour(id)), id).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Nuevo inmueble' })).toBeTruthy();
    expect(idsDe(RECORRIDO_PROPIETARIO_PORTAL)).toEqual(
      expect.arrayContaining(['propietario-portal-cabecera', 'propietario-tab-viviendas', 'propietario-tab-liquidaciones', 'propietario-tab-contratos', 'propietario-tab-perfil', 'nav-actas', 'nav-ayuda', 'asistente-erp']),
    );
  });

  it('el portal profesional expone cabecera, órdenes, viviendas asignadas y ficha', () => {
    render(
      <ProfesionalPortalSection
        currentUser={profesional}
        profesional={null}
        inmuebles={[]}
        especialidades={[]}
        onSaveProfesional={async () => undefined}
      />,
    );
    for (const id of ['profesional-portal-cabecera', 'profesional-tab-incidencias', 'profesional-tab-asignaciones', 'profesional-tab-ficha']) {
      expect(document.querySelector(selectorTour(id)), id).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /Mi Ficha y Datos/ })).toBeTruthy();
    expect(idsDe(RECORRIDO_PROFESIONAL_PORTAL)).toEqual(
      expect.arrayContaining(['profesional-portal-cabecera', 'profesional-tab-incidencias', 'profesional-tab-asignaciones', 'profesional-tab-ficha', 'nav-inmuebles', 'nav-ayuda', 'asistente-erp']),
    );
  });
});

describe('UX-1A · alta de inmueble', () => {
  it('el alta sigue abriendo el mismo formulario: pestañas, selector editable y Guardar Inmueble', () => {
    const onAdd = vi.fn();
    render(
      <InmueblesSection
        inmuebles={[]}
        candidatos={[]}
        propietarios={[]}
        onSelectCandidate={() => undefined}
        onAddInmueble={onAdd}
        currentUser={admin}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    expect(document.querySelector(selectorTour('inmuebles-alta-general'))).toBeTruthy();
    expect(document.querySelector(selectorTour('inmuebles-alta-fiscal'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Apartado Fiscal/ }));
    const selector = document.querySelector(selectorTour('inmuebles-alta-propietario')) as HTMLSelectElement;
    expect(selector).toBeTruthy();
    expect(selector.value).toBe('');
    expect(screen.getByRole('button', { name: 'Guardar Inmueble' })).toBeTruthy();
    expect(document.querySelector(selectorTour('inmuebles-alta-guardar'))).toBeTruthy();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
