/**
 * UX-1B · Tarjeta de bienvenida y etiquetas del Centro de Ayuda.
 *
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ROLES_PREDEFINIDOS, type UsuarioApp } from '../../types';
import type { ServicioProgresoTutoriales, SesionTutorial, TutorialProgress } from '../../experiencia';
import {
  RECORRIDO_ADMIN_CENTRO,
  RECORRIDO_PROFESIONAL_PORTAL,
  RECORRIDO_PROPIETARIO_PORTAL,
  RECORRIDO_PORTAL_INQUILINO,
  iniciarTutorial,
  obtenerTutorial,
  progresoDesdeSesion,
  type Tutorial,
} from '../../experiencia';
import { BienvenidaHost } from './BienvenidaRecorrido';
import { CentroAyudaSection } from '../sections/CentroAyudaSection';

afterEach(() => cleanup());

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
function usuario(tipo: UsuarioApp['tipoPerfil'], extra: Partial<UsuarioApp> = {}): UsuarioApp {
  return {
    id: `u-${tipo}`,
    nombre: 'Usuario',
    email: 'u@test.local',
    tipoPerfil: tipo,
    estado: 'ACTIVO',
    roles: [],
    permisos: tipo === 'ADMINISTRADOR' ? rol('SUPERADMIN').permisos : [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...extra,
  };
}

type Guardar = (s: SesionTutorial, t: Tutorial) => Promise<{ ok: true; data: TutorialProgress }>;

function servicioCon(inicial: TutorialProgress | null, guardar: Guardar = async (s, t) => ({ ok: true, data: progresoDesdeSesion(s, t) })): ServicioProgresoTutoriales {
  return {
    getTutorialProgress: async () => ({ ok: true, data: inicial }),
    saveTutorialProgress: guardar,
    clearTutorialProgress: async () => ({ ok: true, data: null }),
  };
}

function Host({
  usuario: u,
  progreso,
  host = 'ERP' as const,
  habilitada = true,
  guardar,
}: {
  usuario: UsuarioApp;
  progreso: TutorialProgress | null;
  host?: 'ERP' | 'PORTAL_INQUILINO';
  habilitada?: boolean;
  guardar?: Guardar;
}) {
  const save: Guardar = guardar ?? (async (s, t) => ({ ok: true, data: progresoDesdeSesion(s, t) }));
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <div>
      <p data-testid="player">{abierto ?? 'cerrado'}</p>
      <BienvenidaHost
        usuario={u}
        host={host}
        servicio={servicioCon(progreso, save)}
        reproductorAbierto={!!abierto}
        habilitada={habilitada}
        onIniciar={(id) => {
          const t = obtenerTutorial(id);
          if (t) setAbierto(iniciarTutorial(t).tutorialId);
        }}
      />
    </div>
  );
}

describe('UX-1B · primera entrada', () => {
  it('administrador, propietario, profesional e inquilino ven su propia bienvenida', async () => {
    const casos = [
      { u: usuario('ADMINISTRADOR'), host: 'ERP' as const, titulo: 'Bienvenido al Centro de Control', id: RECORRIDO_ADMIN_CENTRO.id },
      { u: usuario('PROPIETARIO'), host: 'ERP' as const, titulo: 'Bienvenido a tu portal', id: RECORRIDO_PROPIETARIO_PORTAL.id },
      { u: usuario('PROFESIONAL'), host: 'ERP' as const, titulo: 'Bienvenido a tu portal profesional', id: RECORRIDO_PROFESIONAL_PORTAL.id },
      { u: usuario('INQUILINO'), host: 'PORTAL_INQUILINO' as const, titulo: 'Bienvenido a tu portal', id: RECORRIDO_PORTAL_INQUILINO.id },
    ];
    for (const c of casos) {
      const iniciar = vi.fn();
      render(
        <BienvenidaHost
          usuario={c.u}
          host={c.host}
          servicio={servicioCon(null)}
          reproductorAbierto={false}
          onIniciar={iniciar}
        />,
      );
      const dialogo = await screen.findByRole('dialog', { name: c.titulo });
      expect(within(dialogo).getByRole('button', { name: 'Ver recorrido' })).toBeTruthy();
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Ver recorrido' }));
      expect(iniciar).toHaveBeenCalledWith(c.id);
      expect(iniciar).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it('un perfil no ve el recorrido de otro', async () => {
    render(<Host usuario={usuario('PROPIETARIO')} progreso={null} />);
    expect(await screen.findByRole('dialog', { name: 'Bienvenido a tu portal' })).toBeTruthy();
    expect(screen.queryByText('Bienvenido al Centro de Control')).toBeNull();
    expect(screen.queryByText('Bienvenido a tu portal profesional')).toBeNull();
    cleanup();
    render(<Host usuario={usuario('PROFESIONAL')} progreso={null} />);
    expect(await screen.findByText('Bienvenido a tu portal profesional')).toBeTruthy();
    expect(screen.queryByText('Centro de Control')).toBeNull();
    cleanup();
    render(<Host usuario={usuario('INQUILINO')} progreso={null} host="ERP" />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('«Ahora no» cierra la tarjeta, no llama a iniciar y no marca completed', async () => {
    const guardar = vi.fn<Guardar>(async (s, t) => ({ ok: true, data: progresoDesdeSesion(s, t) }));
    render(<Host usuario={usuario('ADMINISTRADOR')} progreso={null} guardar={guardar} />);
    const dialogo = await screen.findByRole('dialog', { name: 'Bienvenido al Centro de Control' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Ahora no' }));
    await waitFor(() => expect(guardar).toHaveBeenCalledTimes(1));
    const [sesion, tutorial] = guardar.mock.calls[0];
    expect(sesion.estado).toBe('CANCELADO');
    expect(progresoDesdeSesion(sesion, tutorial).completed).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('player').textContent).toBe('cerrado');
  });

  it('un recorrido a medias ofrece continuar sin arrancarlo solo ni pisar el progreso', async () => {
    const guardar = vi.fn<Guardar>(async (s, t) => ({ ok: true, data: progresoDesdeSesion(s, t) }));
    const aMedias: TutorialProgress = {
      tutorialId: RECORRIDO_PROPIETARIO_PORTAL.id,
      host: 'ERP',
      currentStep: 2,
      stepCount: RECORRIDO_PROPIETARIO_PORTAL.steps.length,
      completed: false,
      skippedSteps: [],
      startedAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };
    render(<Host usuario={usuario('PROPIETARIO')} progreso={aMedias} guardar={guardar} />);
    const dialogo = await screen.findByRole('dialog', { name: 'Recorrido a medias' });
    expect(screen.getByTestId('player').textContent).toBe('cerrado');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Ahora no' }));
    expect(guardar).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();

    render(<Host usuario={usuario('PROPIETARIO')} progreso={aMedias} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar recorrido' }));
    expect(screen.getByTestId('player').textContent).toBe(RECORRIDO_PROPIETARIO_PORTAL.id);
  });

  it('completado o descartado no vuelve a mostrar la bienvenida', async () => {
    const hecho: TutorialProgress = {
      tutorialId: RECORRIDO_PROFESIONAL_PORTAL.id,
      host: 'ERP',
      currentStep: 0,
      stepCount: RECORRIDO_PROFESIONAL_PORTAL.steps.length,
      completed: true,
      completedAt: '2026-09-25T10:00:00.000Z',
      skippedSteps: [],
      startedAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
    };
    render(<Host usuario={usuario('PROFESIONAL')} progreso={hecho} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    cleanup();
    const descartado: TutorialProgress = { ...hecho, tutorialId: RECORRIDO_ADMIN_CENTRO.id, completed: false, completedAt: undefined, stepCount: RECORRIDO_ADMIN_CENTRO.steps.length };
    render(<Host usuario={usuario('ADMINISTRADOR')} progreso={descartado} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('el inquilino sin contrato no ve la bienvenida', async () => {
    render(<Host usuario={usuario('INQUILINO')} progreso={null} host="PORTAL_INQUILINO" habilitada={false} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('UX-1B · Centro de Ayuda', () => {
  it('muestra Comenzar, Continuar recorrido y Volver a realizar según el progreso real', async () => {
    const admin = usuario('ADMINISTRADOR');
    const porId: Record<string, TutorialProgress | null> = {
      'tutorial.tesoreria.liquidacion': null,
      'recorrido.inquilinos.invitar': {
        tutorialId: 'recorrido.inquilinos.invitar',
        host: 'ERP',
        currentStep: 2,
        stepCount: 5,
        completed: false,
        skippedSteps: [],
        startedAt: '2026-09-25T10:00:00.000Z',
        updatedAt: '2026-09-25T10:00:00.000Z',
      },
      'recorrido.admin.centro-control': {
        tutorialId: 'recorrido.admin.centro-control',
        host: 'ERP',
        currentStep: 4,
        stepCount: RECORRIDO_ADMIN_CENTRO.steps.length,
        completed: true,
        completedAt: '2026-09-25T11:00:00.000Z',
        skippedSteps: [],
        startedAt: '2026-09-25T10:00:00.000Z',
        updatedAt: '2026-09-25T11:00:00.000Z',
      },
    };
    const servicio: ServicioProgresoTutoriales = {
      getTutorialProgress: async (id) => ({ ok: true, data: porId[id] ?? null }),
      saveTutorialProgress: async (s, t) => ({ ok: true, data: progresoDesdeSesion(s, t) }),
      clearTutorialProgress: async () => ({ ok: true, data: null }),
    };
    const iniciar = vi.fn();
    render(<CentroAyudaSection usuario={admin} onIniciarTutorial={iniciar} servicio={servicio} />);
    const tut = screen.getByLabelText('Tutoriales');
    await waitFor(() => expect(within(tut).getByRole('button', { name: 'Continuar recorrido' })).toBeTruthy());
    expect(within(tut).getAllByRole('button', { name: 'Comenzar' }).length).toBeGreaterThan(0);
    expect(within(tut).getByRole('button', { name: 'Volver a realizar' })).toBeTruthy();
    fireEvent.click(within(tut).getByRole('button', { name: 'Continuar recorrido' }));
    expect(iniciar).toHaveBeenCalledWith('recorrido.inquilinos.invitar');
  });
});
