/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Tests de integración UI (jsdom): ayuda contextual,
 * Centro de Ayuda, reproductor de tutorial y entrada de navegación.
 *
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ContextualHelp } from './ContextualHelp';
import { TutorialPlayer } from './TutorialPlayer';
import { CentroAyudaSection } from '../sections/CentroAyudaSection';
import { Sidebar } from '../Sidebar';
import { MobileNav } from '../MobileNav';
import { Header } from '../Header';
import { ROLES_PREDEFINIDOS, type SectionType, type UsuarioApp, type UserProfile } from '../../types';
import { TUTORIAL_LIQUIDACION, contextoDesdeUsuario, iniciarTutorial, type SesionTutorial } from '../../experiencia';

afterEach(() => cleanup());

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const base = { id: 'uid_TEST_X', authUid: 'uid_TEST_X', email: 'x@test.local', nombre: 'Usuario Test', activo: true, fechaCreacion: '2026-01-01' } as unknown as UsuarioApp;
const admin: UsuarioApp = { ...base, tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos };
const gestor: UsuarioApp = { ...base, tipoPerfil: 'ADMINISTRADOR', roles: ['GESTOR_INMUEBLES'], permisos: rol('GESTOR_INMUEBLES').permisos };
const propietario: UsuarioApp = { ...base, tipoPerfil: 'PROPIETARIO', roles: ['PROPIETARIO_ESTANDAR'], permisos: rol('PROPIETARIO_ESTANDAR').permisos, propietarioId: 'prop_TEST' };
const userProfile = { nombre: 'Perfil', email: 'p@test.local' } as unknown as UserProfile;

describe('§6 · ContextualHelp', () => {
  it('pantalla con ayuda: botón accesible → panel con título/resumen → «Leer más» amplía → tutorial relacionado → Centro de Ayuda', () => {
    const abrirCentro = vi.fn();
    const iniciar = vi.fn();
    render(<ContextualHelp usuario={admin} section="tesoreria" onAbrirCentro={abrirCentro} onIniciarTutorial={iniciar} />);
    const boton = screen.getByRole('button', { name: /Ayuda: Liquidaciones a propietarios/ });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText(/Cómo se genera, aprueba y paga/)).toBeTruthy();
    fireEvent.click(within(panel).getByText('Leer más'));
    expect(within(panel).getByText(/BORRADOR \(generada, editable\)/)).toBeTruthy();
    fireEvent.click(within(panel).getByText(/Tutorial: Liquidar a un propietario/));
    expect(iniciar).toHaveBeenCalledWith(TUTORIAL_LIQUIDACION.id);
    fireEvent.click(within(panel).getByText('Abrir Centro de Ayuda'));
    expect(abrirCentro).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull(); // se cierra al ir al centro
  });

  it('Escape y botón «Cerrar ayuda» cierran el panel', () => {
    render(<ContextualHelp usuario={admin} section="inicio" />);
    fireEvent.click(screen.getByRole('button', { name: /Ayuda: Panel de inicio/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ayuda: Panel de inicio/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar ayuda' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pantalla sin ayuda registrada o usuario sin permiso → no renderiza nada (no rompe la pantalla)', () => {
    const { container: c1 } = render(<ContextualHelp usuario={admin} section="candidatos" />);
    expect(c1.innerHTML).toBe('');
    const { container: c2 } = render(<ContextualHelp usuario={gestor} section="tesoreria" />);
    expect(c2.innerHTML).toBe('');
    const { container: c3 } = render(<ContextualHelp usuario={null} section="inquilinos" />);
    expect(c3.innerHTML).toBe('');
  });

  it('el propietario en Tesorería ve «Mis liquidaciones», nunca la ayuda de gestión ni el tutorial de admin', () => {
    render(<ContextualHelp usuario={propietario} section="tesoreria" onIniciarTutorial={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Ayuda: Mis liquidaciones/ }));
    fireEvent.click(screen.getByText('Leer más'));
    expect(screen.getByText(/No puedes generar ni aprobar liquidaciones/)).toBeTruthy();
    expect(screen.queryByText(/Tutorial:/)).toBeNull();
    expect(document.body.textContent).not.toContain('tesoreria.liquidar');
  });
});

describe('§6 · Centro de Ayuda', () => {
  it('lista, filtra por módulo, busca, abre contenido y vuelve; el propietario no ve módulos de gestión', () => {
    const iniciar = vi.fn();
    const nav = vi.fn();
    render(<CentroAyudaSection usuario={admin} onIniciarTutorial={iniciar} onSelectSection={nav} />);
    expect(screen.getByText('Centro de Ayuda')).toBeTruthy();
    const contenidos = screen.getByLabelText('Contenidos de ayuda');
    expect(within(contenidos).getAllByRole('button').length).toBeGreaterThanOrEqual(8);
    // filtro por módulo
    fireEvent.click(screen.getByRole('button', { name: 'Morosidad' }));
    expect(within(contenidos).getAllByRole('button')).toHaveLength(2);
    expect(within(contenidos).getByText('Morosidad y recobro')).toBeTruthy();
    expect(within(contenidos).getByText('Estados de un expediente de morosidad')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
    // búsqueda
    fireEvent.change(screen.getByPlaceholderText(/Buscar ayuda/), { target: { value: 'invitación' } });
    expect(within(contenidos).getByText(/Portal de inquilinos: accesos e invitaciones/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Buscar ayuda/), { target: { value: 'zzqqxx' } });
    expect(screen.getByText(/No hay ayuda que coincida/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Buscar ayuda/), { target: { value: '' } });
    // abrir contenido → tutorial relacionado + ir a la pantalla → volver
    fireEvent.click(within(contenidos).getByText('Liquidaciones a propietarios (Tesorería)'));
    expect(screen.getByText(/nunca se ejecuta ningún cargo automáticamente/)).toBeTruthy();
    fireEvent.click(screen.getByText('Liquidar a un propietario paso a paso'));
    expect(iniciar).toHaveBeenCalledWith(TUTORIAL_LIQUIDACION.id);
    fireEvent.click(screen.getByText('Ir a la pantalla →'));
    expect(nav).toHaveBeenCalledWith('tesoreria');
    fireEvent.click(screen.getByText('Volver al listado'));
    expect(screen.getByLabelText('Contenidos de ayuda')).toBeTruthy();
    cleanup();

    render(<CentroAyudaSection usuario={propietario} onIniciarTutorial={iniciar} accessibleSections={['tesoreria', 'ayuda'] as SectionType[]} />);
    expect(screen.queryByRole('button', { name: 'Morosidad' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Portal de inquilinos' })).toBeNull();
    expect(screen.getByText('Conoce tu portal', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Conoce el Centro de Control')).toBeNull();
  });

  it('lista de tutoriales: admin total sin bloqueos; gestor ve el aviso de pasos que requieren otro permiso; «Iniciar» delega en el host', () => {
    const iniciar = vi.fn();
    render(<CentroAyudaSection usuario={admin} onIniciarTutorial={iniciar} />);
    const tut = screen.getByLabelText('Tutoriales');
    expect(within(tut).getByText('Liquidar a un propietario paso a paso')).toBeTruthy();
    expect(within(tut).queryByText(/requieren otro permiso/)).toBeNull();
    expect(within(tut).getByText('Dar acceso a un inquilino a su portal')).toBeTruthy();
    fireEvent.click(within(tut).getAllByText('Iniciar')[0]);
    expect(iniciar).toHaveBeenCalledWith(TUTORIAL_LIQUIDACION.id);
    cleanup();
    render(<CentroAyudaSection usuario={gestor} onIniciarTutorial={iniciar} />);
    const tutG = screen.getByLabelText('Tutoriales');
    expect(within(tutG).getByText(/5 paso\(s\) requieren otro permiso/)).toBeTruthy(); // liquidaciones
    expect(within(tutG).getAllByText(/requieren otro permiso/)).toHaveLength(1); // invitar inquilinos: el gestor sí puede
  });
});

/** Host mínimo que mantiene la sesión en memoria como hace App.tsx. */
function HostTutorial({ usuario, seccionInicial = 'inicio', accesibles }: { usuario: UsuarioApp; seccionInicial?: SectionType; accesibles?: SectionType[] }) {
  const [seccion, setSeccion] = useState<SectionType>(seccionInicial);
  const [sesion, setSesion] = useState<SesionTutorial | null>(() => iniciarTutorial(TUTORIAL_LIQUIDACION));
  return (
    <div>
      <p data-testid="seccion">{seccion}</p>
      <p data-testid="estado">{sesion?.estado ?? 'SIN_SESION'}</p>
      {sesion && (
        <TutorialPlayer
          tutorial={TUTORIAL_LIQUIDACION}
          sesion={sesion}
          contexto={contextoDesdeUsuario(usuario, seccion, { accessibleSections: accesibles })}
          onCambio={setSesion}
          onNavegar={setSeccion}
          onCerrar={() => setSesion(null)}
        />
      )}
    </div>
  );
}

describe('§6 · TutorialPlayer (tutorial real de liquidaciones)', () => {
  it('inicio → navegación a la pantalla del paso → siguiente/anterior → finalización → cierre', () => {
    render(<HostTutorial usuario={admin} />);
    const dialogo = screen.getByRole('dialog', { name: /Tutorial: Liquidar a un propietario/ });
    expect(within(dialogo).getByText('Paso 1 de 5')).toBeTruthy();
    expect(within(dialogo).getByText('Abre Tesorería & SEPA')).toBeTruthy();
    // No estamos en 'tesoreria' → botón de ir a la pantalla; respeta la navegación del host
    fireEvent.click(within(dialogo).getByText('Ir a la pantalla de este paso'));
    expect(screen.getByTestId('seccion').textContent).toBe('tesoreria');
    expect(within(dialogo).queryByText('Ir a la pantalla de este paso')).toBeNull();
    // Anterior deshabilitado en el primer paso
    expect((within(dialogo).getByText('Anterior').closest('button') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    expect(within(dialogo).getByText('Paso 2 de 5')).toBeTruthy();
    expect(within(dialogo).getByText('Genera el borrador del mes')).toBeTruthy();
    expect(within(dialogo).queryByRole('note')).toBeNull(); // admin total: sin bloqueos
    fireEvent.click(within(dialogo).getByText('Anterior'));
    expect(within(dialogo).getByText('Paso 1 de 5')).toBeTruthy();
    for (let i = 0; i < 4; i++) fireEvent.click(within(dialogo).getByText('Siguiente'));
    expect(within(dialogo).getByText('Paso 5 de 5')).toBeTruthy();
    expect(within(dialogo).queryByText('Siguiente')).toBeNull();
    fireEvent.click(within(dialogo).getByText('Finalizar'));
    expect(screen.getByTestId('estado').textContent).toBe('COMPLETADO');
    expect(within(dialogo).getByText('Tutorial completado')).toBeTruthy();
    fireEvent.click(within(dialogo).getByText('Cerrar'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('estado').textContent).toBe('SIN_SESION');
  });

  it('salida/cancelación desde cualquier paso cierra el reproductor y deja la sesión CANCELADA', () => {
    render(<HostTutorial usuario={admin} seccionInicial="tesoreria" />);
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    fireEvent.click(within(dialogo).getByText('Salir'));
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    render(<HostTutorial usuario={admin} seccionInicial="tesoreria" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar tutorial' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('permiso insuficiente: el gestor lee el paso pero ve el aviso RBAC; la capa no habilita nada', () => {
    render(<HostTutorial usuario={gestor} seccionInicial="tesoreria" />);
    const dialogo = screen.getByRole('dialog');
    const nota = within(dialogo).getByRole('note');
    expect(nota.textContent).toContain('tesoreria.ver');
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    expect(within(dialogo).getByRole('note').textContent).toContain('tesoreria.liquidar');
    expect(gestor.permisos).not.toContain('tesoreria.liquidar'); // intacto
  });

  it('ruta inaccesible para el perfil: el propietario no recibe botón de navegación y se le explica', () => {
    render(<HostTutorial usuario={propietario} seccionInicial="inicio" accesibles={['inicio', 'propietarios', 'ayuda'] as SectionType[]} />);
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).queryByText('Ir a la pantalla de este paso')).toBeNull();
    expect(within(dialogo).getByRole('note').textContent).toMatch(/no tiene acceso a la pantalla/);
    expect(screen.getByTestId('seccion').textContent).toBe('inicio');
  });
});

describe('§6 · Integración en la navegación existente (sin menú paralelo)', () => {
  it('Sidebar: «Ayuda» aparece una sola vez para ADMINISTRADOR, PROPIETARIO y PROFESIONAL y navega a la sección ayuda', () => {
    for (const u of [admin, propietario, { ...base, tipoPerfil: 'PROFESIONAL', roles: ['PROFESIONAL_MANTENIMIENTO'], permisos: ['profesionales.ver'] } as UsuarioApp]) {
      const sel: SectionType[] = [];
      render(<Sidebar activeSection="inicio" onSelectSection={(s) => sel.push(s)} candidatos={[]} inmueblesCount={0} currentUser={u} />);
      const botonesAyuda = screen.getAllByRole('button').filter((b) => (b.textContent || '').trim() === 'Ayuda');
      expect(botonesAyuda).toHaveLength(1);
      fireEvent.click(botonesAyuda[0]);
      expect(sel).toEqual(['ayuda']);
      cleanup();
    }
  });

  it('MobileNav: la entrada «Ayuda» existe una sola vez por perfil', () => {
    for (const u of [admin, propietario]) {
      render(<MobileNav activeSection="inicio" onSelectSection={() => undefined} candidatos={[]} currentUser={u} />);
      fireEvent.click(document.querySelector('button')!);
      expect(screen.getAllByRole('button').filter((b) => (b.textContent || '').startsWith('Ayuda'))).toHaveLength(1);
      cleanup();
    }
  });

  it('Header: título de la sección ayuda y ayuda contextual junto al título de la pantalla activa', () => {
    const nav = vi.fn();
    render(<Header activeSection="ayuda" userProfile={userProfile} currentUser={admin} onSelectSection={nav} />);
    expect(screen.getByText('Centro de Ayuda')).toBeTruthy();
    cleanup();
    render(<Header activeSection="tesoreria" userProfile={userProfile} currentUser={admin} onSelectSection={nav} />);
    fireEvent.click(screen.getByRole('button', { name: /Ayuda: Liquidaciones a propietarios/ }));
    fireEvent.click(screen.getByText('Abrir Centro de Ayuda'));
    expect(nav).toHaveBeenCalledWith('ayuda');
    cleanup();
    // Pantalla sin ayuda: el header sigue funcionando y no aparece el botón
    render(<Header activeSection="candidatos" userProfile={userProfile} currentUser={admin} onSelectSection={nav} />);
    expect(screen.queryByRole('button', { name: /^Ayuda:/ })).toBeNull();
  });
});
