/**
 * CAPA TRANSVERSAL §6 — FASE 3 · Tests UI (jsdom): TutorialPlayer + persistencia del progreso.
 *
 * Usa el servicio Firestore real del proyecto sobre el arnés en memoria del BLOQUE E
 * (Auth/Firestore simulados). Sin Firebase real, sin localStorage.
 *
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { authSintetico, resetEntornoE } from '../../test/e/setupE';
import { memoria } from '../../test/e/firestoreMemoria';
import { IDS, sembrarUniverso, usuarioInquilinoTest } from '../../test/e/fixturesE';
import { InquilinoPortalShell } from '../portal-inquilino/InquilinoPortalShell';
import { TutorialPlayer } from './TutorialPlayer';
import { ROLES_PREDEFINIDOS, type UsuarioApp } from '../../types';
import {
  RECORRIDO_PORTAL_INQUILINO,
  TUTORIAL_LIQUIDACION,
  contextoDesdeUsuario,
  idProgreso,
  iniciarTutorial,
  rutaProgreso,
  type SesionTutorial,
  type Tutorial,
  type TutorialProgress,
} from '../../experiencia';
import { servicioProgresoTutoriales } from '../../lib/progresoTutorialesFirestore';

const UID = 'uid_TEST_F3_UI';
const COL = `usuarios_auth/${UID}/progreso_tutoriales`;
const DOC_LIQ = idProgreso('ERP', TUTORIAL_LIQUIDACION.id);
const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const admin = { id: UID, authUid: UID, email: 'x@test.local', nombre: 'Admin', tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos } as unknown as UsuarioApp;

const entrar = (uid: string) => {
  authSintetico.usuarioActual = { uid, email: `${uid}@test.local` };
};
const leerDoc = () => memoria.leer<TutorialProgress>(COL, DOC_LIQ);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetEntornoE();
  window.scrollTo = () => undefined;
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

/** Host mínimo: misma integración que App.tsx / InquilinoPortalShell (sesión en memoria + servicio). */
function Host({ tutorial, sinServicio = false }: { tutorial: Tutorial; sinServicio?: boolean }) {
  const [seccion, setSeccion] = useState('tesoreria');
  const [sesion, setSesion] = useState<SesionTutorial | null>(() => iniciarTutorial(tutorial));
  return (
    <div>
      <p data-testid="estado">{sesion ? `${sesion.estado}:${sesion.indice}` : 'SIN_SESION'}</p>
      {!sesion && (
        <button type="button" onClick={() => setSesion(iniciarTutorial(tutorial))}>
          Reabrir
        </button>
      )}
      {sesion && (
        <TutorialPlayer
          tutorial={tutorial}
          sesion={sesion}
          contexto={contextoDesdeUsuario(admin, seccion)}
          onCambio={setSesion}
          onNavegar={setSeccion}
          onCerrar={() => setSesion(null)}
          servicio={sinServicio ? undefined : servicioProgresoTutoriales}
        />
      )}
    </div>
  );
}

describe('§6 F3 · TutorialPlayer con persistencia', () => {
  it('sin progreso guardado inicia en el paso 1, registra el inicio y guarda al avanzar/retroceder/saltar', async () => {
    entrar(UID);
    render(<Host tutorial={TUTORIAL_LIQUIDACION} />);
    const d = screen.getByRole('dialog');
    expect(within(d).getByText('Paso 1 de 5')).toBeTruthy();
    expect(screen.queryByTestId('tutorial-reanudado')).toBeNull();
    await waitFor(() => expect(leerDoc()?.currentStep).toBe(0));
    fireEvent.click(within(d).getByText('Siguiente'));
    await waitFor(() => expect(leerDoc()?.currentStep).toBe(1));
    fireEvent.click(within(d).getByText('Siguiente'));
    await waitFor(() => expect(leerDoc()?.currentStep).toBe(2));
    fireEvent.click(within(d).getByText('Anterior'));
    await waitFor(() => expect(leerDoc()?.currentStep).toBe(1));
    fireEvent.click(within(d).getByRole('button', { name: 'Saltar paso' }));
    await waitFor(() => expect(leerDoc()).toMatchObject({ currentStep: 2, skippedSteps: [TUTORIAL_LIQUIDACION.steps[1].id], completed: false }));
    expect(screen.queryByTestId('tutorial-persistencia')).toBeNull();
    // Todo lo escrito cuelga del UID autenticado
    expect(memoria.rutasEscritas().every((r) => r === rutaProgreso(UID, 'ERP', TUTORIAL_LIQUIDACION.id))).toBe(true);
  });

  it('guarda al salir (cancelar) y, al volver, reanuda desde el paso guardado indicándolo', async () => {
    entrar(UID);
    const { unmount } = render(<Host tutorial={TUTORIAL_LIQUIDACION} />);
    let d = screen.getByRole('dialog');
    await waitFor(() => expect(leerDoc()?.currentStep).toBe(0));
    fireEvent.click(within(d).getByText('Siguiente'));
    fireEvent.click(within(d).getByText('Siguiente'));
    fireEvent.click(within(d).getByText('Salir')); // abandonar
    await waitFor(() => expect(leerDoc()).toMatchObject({ currentStep: 2, completed: false }));
    expect(screen.getByTestId('estado').textContent).toBe('SIN_SESION');
    unmount();

    // Vuelve más tarde (nueva instancia del host: memoria vacía, Firestore con el progreso)
    render(<Host tutorial={TUTORIAL_LIQUIDACION} />);
    d = screen.getByRole('dialog');
    await waitFor(() => expect(within(d).getByText('Paso 3 de 5')).toBeTruthy());
    expect(screen.getByTestId('tutorial-reanudado').textContent).toContain('Reanudado desde el paso 3');
    expect(within(d).getByText(TUTORIAL_LIQUIDACION.steps[2].title)).toBeTruthy();
    // Al avanzar, el aviso de reanudación desaparece y sigue guardando
    fireEvent.click(within(d).getByText('Siguiente'));
    expect(screen.queryByTestId('tutorial-reanudado')).toBeNull();
    await waitFor(() => expect(leerDoc()?.currentStep).toBe(3));
  });

  it('finalizar marca completed=true; si se vuelve a abrir, empieza de nuevo y completed se conserva', async () => {
    entrar(UID);
    render(<Host tutorial={TUTORIAL_LIQUIDACION} />);
    const d = screen.getByRole('dialog');
    await waitFor(() => expect(leerDoc()).toBeTruthy());
    for (let i = 0; i < 4; i++) fireEvent.click(within(d).getByText('Siguiente'));
    fireEvent.click(within(d).getByText('Finalizar'));
    expect(within(d).getByText('Tutorial completado')).toBeTruthy();
    await waitFor(() => expect(leerDoc()).toMatchObject({ currentStep: 4, completed: true }));
    expect(typeof leerDoc()?.completedAt).toBe('string');
    fireEvent.click(within(d).getByText('Cerrar'));
    fireEvent.click(screen.getByText('Reabrir'));
    const d2 = screen.getByRole('dialog');
    await flush();
    expect(within(d2).getByText('Paso 1 de 5')).toBeTruthy();
    expect(screen.queryByTestId('tutorial-reanudado')).toBeNull();
    await waitFor(() => expect(leerDoc()).toMatchObject({ currentStep: 0, completed: true }));
  });

  it('error de Firestore: el tutorial sigue en memoria, avisa sin bloquear y «Reintentar» guarda cuando vuelve el servicio', async () => {
    entrar(UID);
    memoria.fallar('*', rutaProgreso(UID, 'ERP', TUTORIAL_LIQUIDACION.id), 'unavailable (simulado)');
    render(<Host tutorial={TUTORIAL_LIQUIDACION} />);
    const d = screen.getByRole('dialog');
    await waitFor(() => expect(screen.getByTestId('tutorial-persistencia').textContent).toContain('No se pudo guardar el progreso'));
    fireEvent.click(within(d).getByText('Siguiente'));
    fireEvent.click(within(d).getByText('Siguiente'));
    expect(within(d).getByText('Paso 3 de 5')).toBeTruthy(); // la UX no se rompe
    expect(memoria.idsDe(COL)).toEqual([]);
    // El servicio vuelve
    memoria.reset();
    entrar(UID);
    fireEvent.click(screen.getByText('Reintentar'));
    await waitFor(() => expect(leerDoc()?.currentStep).toBe(2));
    await waitFor(() => expect(screen.queryByTestId('tutorial-persistencia')).toBeNull());
    expect(window.localStorage.length).toBe(0);
  });

  it('usuario sin sesión de Auth: el tutorial funciona en memoria, informa y no escribe nada; sin servicio, nada se persiste', async () => {
    render(<Host tutorial={TUTORIAL_LIQUIDACION} />);
    const d = screen.getByRole('dialog');
    await waitFor(() => expect(screen.getByTestId('tutorial-persistencia').textContent).toContain('sin sesión iniciada'));
    fireEvent.click(within(d).getByText('Siguiente'));
    expect(within(d).getByText('Paso 2 de 5')).toBeTruthy();
    expect(memoria.accesos).toEqual([]);
    cleanup();
    await flush(); // el guardado diferido al desmontar también responde NO_AUTENTICADO
    expect(memoria.accesos).toEqual([]);
    resetEntornoE();
    entrar(UID);
    render(<Host tutorial={TUTORIAL_LIQUIDACION} sinServicio />);
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Siguiente'));
    await flush();
    expect(memoria.accesos).toEqual([]);
    expect(screen.queryByTestId('tutorial-persistencia')).toBeNull();
  });

  it('progreso guardado de otra versión del tutorial (nº de pasos distinto) → empieza desde 0 sin reanudar', async () => {
    entrar(UID);
    memoria.sembrar(COL, DOC_LIQ, { tutorialId: TUTORIAL_LIQUIDACION.id, host: 'ERP', currentStep: 3, stepCount: 9, completed: false, skippedSteps: [], startedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
    render(<Host tutorial={TUTORIAL_LIQUIDACION} />);
    await flush();
    expect(within(screen.getByRole('dialog')).getByText('Paso 1 de 5')).toBeTruthy();
    expect(screen.queryByTestId('tutorial-reanudado')).toBeNull();
    await waitFor(() => expect(leerDoc()).toMatchObject({ currentStep: 0, stepCount: 5 }));
  });
});

describe('§6 F3 · Portal del Inquilino real: abandonar y volver', () => {
  it('el inquilino avanza en su recorrido, sale del portal y al volver se reanuda desde su paso; el progreso cuelga de su UID', async () => {
    sembrarUniverso();
    entrar(IDS.A.uid);
    const abrir = () => render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A')} onLogout={() => undefined} />);
    const cargado = () => waitFor(() => expect(screen.queryByText('Cargando tu portal…')).toBeNull());
    const iniciar = () => {
      fireEvent.click(within(document.querySelector('header') as HTMLElement).getByRole('button', { name: 'Ayuda: Tu portal' }));
      fireEvent.click(screen.getByText('Leer más'));
      fireEvent.click(screen.getByText(/Conoce tu portal/));
    };
    const { unmount } = abrir();
    await cargado();
    iniciar();
    let d = await screen.findByRole('dialog', { name: /Tutorial: Conoce tu portal/ });
    fireEvent.click(within(d).getByText('Siguiente'));
    fireEvent.click(within(d).getByText('Siguiente'));
    fireEvent.click(within(d).getByText('Salir'));
    const col = `usuarios_auth/${IDS.A.uid}/progreso_tutoriales`;
    const id = idProgreso('PORTAL_INQUILINO', RECORRIDO_PORTAL_INQUILINO.id);
    await waitFor(() => expect(memoria.leer<TutorialProgress>(col, id)).toMatchObject({ currentStep: 2, completed: false, host: 'PORTAL_INQUILINO' }));
    unmount();

    abrir();
    await cargado();
    iniciar();
    d = await screen.findByRole('dialog', { name: /Tutorial: Conoce tu portal/ });
    await waitFor(() => expect(within(d).getByText('Paso 3 de 5')).toBeTruthy());
    expect(screen.getByTestId('tutorial-reanudado').textContent).toContain('Reanudado desde el paso 3');
    // Solo se escribió bajo el UID del inquilino A y nunca en colecciones de negocio
    const escritas = memoria.rutasEscritas();
    expect(escritas.length).toBeGreaterThan(0);
    expect(escritas.every((r) => r.startsWith(col + '/'))).toBe(true);
    expect(escritas.some((r) => r.includes(IDS.B.uid))).toBe(false);
  });
});
