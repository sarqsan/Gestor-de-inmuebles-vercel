/**
 * UX-0B: títulos de cabecera y destino de «Mi Cuenta».
 *
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SectionType, UsuarioApp, UserProfile } from '../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { PropietarioPortalSection } from './sections/PropietarioPortalSection';
import { ProfesionalPortalSection } from './sections/ProfesionalPortalSection';

vi.mock('../lib/firebase', () => ({
  subscribeTrabajosProfesionales: () => () => undefined,
  subscribeIncidencias: () => () => undefined,
  saveTrabajoProfesionalFirestore: async () => undefined,
  saveIncidenciaFirestore: async () => undefined,
}));

afterEach(() => cleanup());

const perfil = { nombre: 'Perfil', email: 'p@test.local' } as unknown as UserProfile;

function usuario(tipo: UsuarioApp['tipoPerfil'], extra: Partial<UsuarioApp> = {}): UsuarioApp {
  return {
    id: 'u1',
    nombre: 'Usuario',
    email: 'u@test.local',
    tipoPerfil: tipo,
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...extra,
  };
}

const admin = usuario('ADMINISTRADOR');
const propietario = usuario('PROPIETARIO', { propietarioId: 'P1' });
const profesional = usuario('PROFESIONAL', { profesionalId: 'PROF1' });

function titulo(section: SectionType, user?: UsuarioApp) {
  render(
    <Header activeSection={section} userProfile={perfil} currentUser={user} onSelectSection={() => undefined} />,
  );
  return screen.getByRole('heading', { level: 2 }).textContent;
}

describe('UX-0B · títulos', () => {
  it('las secciones que caían en el fallback muestran el título de su pantalla', () => {
    const casos: Array<[SectionType, string]> = [
      ['cobros', 'Cobros'],
      ['tesoreria', 'Tesorería y Liquidaciones'],
      ['gastos', 'Gestión de Gastos'],
      ['conciliacion', 'Conciliación Bancaria Automática'],
      ['morosidad', 'Morosidad, recobro y expediente'],
      ['facturacion', 'Facturación'],
      ['fiscal', 'Fiscalidad Anual de Alquileres'],
      ['informes', 'Informes Ejecutivos, Rentabilidad y Exportación'],
      ['polizas', 'Gestión de Pólizas de Seguro'],
      ['inquilinos', 'Portal de inquilinos'],
      ['suministros', 'Suministros'],
      ['recomercializacion', 'Recomercialización'],
      ['incidencias', 'Incidencias, Mantenimiento & Seguros'],
    ];
    for (const [section, esperado] of casos) {
      expect(titulo(section, admin)).toBe(esperado);
      expect(screen.queryByText('Preselección de candidatos')).toBeNull();
      cleanup();
    }
  });

  it('el mismo id de sección cambia de título según el perfil, e inversión no cambia', () => {
    expect(titulo('propietarios', propietario)).toBe('Portal del Propietario');
    cleanup();
    expect(titulo('tesoreria', propietario)).toBe('Portal del Propietario');
    cleanup();
    expect(titulo('propietarios', admin)).toBe('Gestión de Propietarios e IBAN');
    cleanup();
    expect(titulo('administracion', admin)).toBe('Administración Global & Seguridad');
    cleanup();
    expect(titulo('administracion', profesional)).toBe('Portal de Servicios y Mantenimiento');
    cleanup();
    expect(titulo('inversion', admin)).toBe('Inversión y Valoración');
    cleanup();
    expect(titulo('inversion', propietario)).toBe('Inversión y Valoración');
  });
});

describe('UX-0B · Mi Cuenta', () => {
  it('el administrador sigue abriendo configuración y no tiene la etiqueta Mi Cuenta', () => {
    const nav = vi.fn();
    const cuenta = vi.fn();
    render(
      <Sidebar activeSection="inicio" onSelectSection={nav} candidatos={[]} inmueblesCount={0} currentUser={admin} onAbrirMiCuenta={cuenta} />,
    );
    expect(screen.queryByRole('button', { name: 'Mi Cuenta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Configuración' }));
    expect(nav).toHaveBeenCalledWith('configuracion');
    expect(cuenta).not.toHaveBeenCalled();
  });

  it('el propietario abre el portal en Mi Perfil desde el menú de escritorio y el móvil', () => {
    const nav = vi.fn();
    const cuenta = vi.fn();
    render(
      <Sidebar activeSection="inicio" onSelectSection={nav} candidatos={[]} inmueblesCount={0} currentUser={propietario} onAbrirMiCuenta={cuenta} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mi Cuenta' }));
    expect(cuenta).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
    cleanup();

    const navMovil = vi.fn();
    const cuentaMovil = vi.fn();
    render(
      <MobileNav activeSection="inicio" onSelectSection={navMovil} candidatos={[]} currentUser={propietario} onAbrirMiCuenta={cuentaMovil} />,
    );
    fireEvent.click(document.querySelector('button')!);
    fireEvent.click(screen.getByRole('button', { name: /^Mi Cuenta/ }));
    expect(cuentaMovil).toHaveBeenCalledTimes(1);
    expect(navMovil).not.toHaveBeenCalled();
  });

  it('el profesional abre su ficha desde Mi Cuenta en escritorio y móvil', () => {
    const nav = vi.fn();
    const cuenta = vi.fn();
    render(
      <Sidebar activeSection="inicio" onSelectSection={nav} candidatos={[]} inmueblesCount={0} currentUser={profesional} onAbrirMiCuenta={cuenta} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mi Cuenta' }));
    expect(cuenta).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveBeenCalled();
    cleanup();

    const navMovil = vi.fn();
    const cuentaMovil = vi.fn();
    render(
      <MobileNav activeSection="inicio" onSelectSection={navMovil} candidatos={[]} currentUser={profesional} onAbrirMiCuenta={cuentaMovil} />,
    );
    fireEvent.click(document.querySelector('button')!);
    fireEvent.click(screen.getByRole('button', { name: /^Mi Cuenta/ }));
    expect(cuentaMovil).toHaveBeenCalledTimes(1);
    expect(navMovil).not.toHaveBeenCalled();
  });

  it('el cableado de Mi Cuenta muestra la pestaña de perfil del propietario y la ficha del profesional', () => {
    function Harness() {
      const [seccion, setSeccion] = useState<SectionType>('inicio');
      const [pestanaProp, setPestanaProp] = useState<'perfil' | null>(null);
      const [pestanaProf, setPestanaProf] = useState<'ficha' | null>(null);
      const [perfilActivo, setPerfilActivo] = useState(propietario);
      const abrir = () => {
        if (perfilActivo.tipoPerfil === 'PROPIETARIO') {
          setPestanaProp('perfil');
          setSeccion('propietarios');
          return;
        }
        setPestanaProf('ficha');
        setSeccion('administracion');
      };
      return (
        <>
          <button type="button" onClick={() => { setPerfilActivo(propietario); setSeccion('inicio'); }}>
            usar propietario
          </button>
          <button type="button" onClick={() => { setPerfilActivo(profesional); setSeccion('inicio'); }}>
            usar profesional
          </button>
          <Sidebar
            activeSection={seccion}
            onSelectSection={setSeccion}
            candidatos={[]}
            inmueblesCount={0}
            currentUser={perfilActivo}
            onAbrirMiCuenta={abrir}
          />
          {seccion === 'propietarios' && (
            <PropietarioPortalSection
              currentUser={propietario}
              inmuebles={[]}
              profesionales={[]}
              contratos={[]}
              especialidades={[]}
              propietarios={[]}
              onOpenCrearProfesionalModal={() => undefined}
              onSaveProfesional={async () => undefined}
              pestanaInicial={pestanaProp}
              onPestanaInicialConsumida={() => setPestanaProp(null)}
            />
          )}
          {seccion === 'administracion' && (
            <ProfesionalPortalSection
              currentUser={profesional}
              profesional={null}
              inmuebles={[]}
              especialidades={[]}
              onSaveProfesional={async () => undefined}
              pestanaInicial={pestanaProf}
              onPestanaInicialConsumida={() => setPestanaProf(null)}
            />
          )}
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Mi Cuenta' }));
    expect(screen.getByRole('heading', { name: 'Datos de Tu Cuenta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuevo inmueble' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'usar profesional' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mi Cuenta' }));
    expect(screen.getByText('Datos Comerciales y de Facturación')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mi Ficha y Datos/ })).toBeTruthy();
  });
});
