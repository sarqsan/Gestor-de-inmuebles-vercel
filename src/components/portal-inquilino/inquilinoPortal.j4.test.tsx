/**
 * @vitest-environment jsdom
 *
 * J.4 — Portal Inquilino CON contrato: ayuda contextual, tutorial y asistente.
 * Verifica que la capa de ayuda YA EXISTENTE sigue accesible y que el
 * contexto que recibe corresponde a la pantalla activa del portal.
 * J.4 no crea infraestructura: sólo comprueba que la que hay está bien
 * conectada y que no bloquea el uso del portal.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContratoFormalizacion, Inmueble, UsuarioApp } from '../../types';

const CONTRATO = {
  id: 'c-1',
  candidatoId: 'cand-1',
  inmuebleId: 'inm-1',
  inmuebleNombre: 'Piso centro',
  inmuebleDireccion: 'Calle Mayor 1',
  inmuebleCiudad: 'Sevilla',
  propietarioNombre: 'Ana',
  propietarioDni: '12345678Z',
  propietarioDireccion: 'Calle Real 5',
  propietarioTelefono: '600000000',
  propietarioEmail: 'ana@correo.test',
  propietarioIban: 'ES0000000000000000000000',
  candidatoNombre: 'Marta García',
  candidatoDni: '87654321X',
  candidatoTelefono: '600111222',
  candidatoEmail: 'marta@correo.test',
  rentaMensual: 750,
  fianzaLegalMeses: 1,
  fianzaLegalImporte: 750,
  garantiaAdicionalMeses: 0,
  garantiaAdicionalImporte: 0,
  fechaInicioContrato: '2026-01-01',
  duracionAnios: 1,
  diaLimitePagoMes: 5,
  permitirMascotas: false,
  permitirSubarriendo: false,
  incluyeMueblesInventario: false,
  gastosComunidadCargo: 'arrendador',
  ibiCargo: 'arrendador',
  suministrosCargo: 'arrendatario',
  clausulaDesistimientoAnticipado: false,
  clausulasPersonalizadas: [],
  estado: 'FIRMADO',
  esVigente: true,
} as unknown as ContratoFormalizacion;

const INMUEBLE = {
  id: 'inm-1',
  direccion: 'Calle Mayor 1',
  ciudad: 'Sevilla',
  tipo: 'piso',
  habitaciones: 2,
  banos: 1,
  superficie: 80,
  precio: 750,
  estado: 'alquilado',
} as unknown as Inmueble;

vi.mock('./usePortalInquilino', () => ({
  usePortalInquilino: () => ({
    contratos: [CONTRATO],
    inmuebles: [INMUEBLE],
    incidencias: [],
    mensajes: [],
    suministros: [],
    lecturas: [],
    cambios: [],
    actas: [],
    loading: false,
    error: null,
    recargar: () => Promise.resolve(),
  }),
}));

vi.mock('../../lib/progresoTutorialesFirestore', () => ({
  servicioProgresoTutoriales: {
    cargar: () => Promise.resolve(null),
    guardar: () => Promise.resolve(),
    guardarPaso: () => Promise.resolve(),
    finalizar: () => Promise.resolve(),
  },
}));

import { InquilinoPortalShell } from './InquilinoPortalShell';

const USUARIO: UsuarioApp = {
  id: 'u-iq-1',
  nombre: 'Marta',
  apellidos: 'García López',
  email: 'marta@correo.test',
  tipoPerfil: 'INQUILINO',
  estado: 'ACTIVO',
  roles: ['INQUILINO'],
  permisos: [],
  contratoIds: ['c-1'],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as UsuarioApp;

describe('J.4 — Portal Inquilino: la ayuda existente está bien conectada', () => {
  afterEach(() => cleanup());

  const montar = () =>
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);

  const botonAyuda = () => screen.getByRole('button', { name: /^Ayuda:/i });

  /** Pestaña de la navegación inferior del portal (selector estable del tour). */
  const irA = (tab: string) =>
    document.querySelector(`[data-tour="portal-tab-${tab}"]`) as HTMLElement;

  it('la ayuda contextual es accesible desde la portada', () => {
    montar();
    expect(botonAyuda()).toBeTruthy();
  });

  it('el contexto de ayuda SIGUE a la pantalla activa (inicio → recibos → incidencias)', () => {
    montar();
    expect(botonAyuda().getAttribute('aria-label')).toMatch(/Tu portal/i);

    fireEvent.click(irA('recibos'));
    expect(botonAyuda().getAttribute('aria-label')).toMatch(/Recibos y pagos/i);

    fireEvent.click(irA('incidencias'));
    expect(botonAyuda().getAttribute('aria-label')).toMatch(/Aver.as e incidencias/i);

    fireEvent.click(irA('suministros'));
    expect(botonAyuda().getAttribute('aria-label')).toMatch(/Suministros/i);
  });

  it('el recorrido guiado se puede lanzar desde la ayuda (no se auto-arranca)', () => {
    montar();
    // §10: nada de tutoriales automáticos al entrar.
    expect(screen.queryByTestId('tutorial-player')).toBeNull();
    expect(screen.queryByRole('dialog', { name: /recorrido/i })).toBeNull();

    // Pero el recorrido SÍ está disponible bajo demanda.
    fireEvent.click(botonAyuda());
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('el asistente IA sigue disponible en la cabecera', () => {
    montar();
    expect(screen.getByRole('button', { name: /asistente/i })).toBeTruthy();
  });

  it('la ayuda NO bloquea la navegación: se abre, se navega y se cierra', () => {
    montar();
    fireEvent.click(botonAyuda());
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Con el panel abierto, la navegación inferior sigue operativa.
    fireEvent.click(irA('recibos'));
    expect(botonAyuda().getAttribute('aria-label')).toMatch(/Recibos y pagos/i);

    fireEvent.click(botonAyuda());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('no hay ayuda duplicada: un único punto de entrada', () => {
    montar();
    expect(screen.queryAllByRole('button', { name: /^Ayuda:/i }).length).toBe(1);
  });
});
