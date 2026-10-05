/**
 * @vitest-environment jsdom
 *
 * J.1 — Portada del Portal Inquilino.
 * Cubre el caso "inquilino sin contrato" (F-1 crítico de la auditoría):
 * el `<main>` NO debe quedar en null. Debe renderizar una tarjeta de
 * bienvenida con saludo y un CTA que lleve a la sección de mensajes.
 *
 * No toca `usePortalInquilino` real (ni Firestore): lo mockeamos para
 * poder renderizar el Shell de forma aislada.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsuarioApp } from '../../types';

// Mock del hook de datos del portal. J.1 no modifica la lógica del hook; sólo
// queremos validar la presentación de la portada sin tocar Firestore.
vi.mock('./usePortalInquilino', () => ({
  usePortalInquilino: () => ({
    contratos: [],
    inmuebles: [],
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

// Mock del servicio de progreso de tutoriales (referenciado por el Shell
// para `servicioProgresoTutoriales`). J.1 no abre tutoriales automáticos,
// pero el Shell lo importa y no debe fallar al renderizar.
vi.mock('../../lib/progresoTutorialesFirestore', () => ({
  servicioProgresoTutoriales: {
    cargar: () => Promise.resolve(null),
    guardar: () => Promise.resolve(),
    guardarPaso: () => Promise.resolve(),
    finalizar: () => Promise.resolve(),
  },
}));

// Importamos el Shell DESPUÉS de los mocks para que se apliquen.
import { InquilinoPortalShell } from './InquilinoPortalShell';

const USUARIO: UsuarioApp = {
  id: 'u-iq-1',
  nombre: 'Marta',
  apellidos: 'García López',
  email: 'marta@correo.test',
  telefono: '600000000',
  tipoPerfil: 'INQUILINO',
  estado: 'ACTIVO',
  roles: ['INQUILINO'],
  permisos: [],
  contratoIds: [], // sin contratos vinculados
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as UsuarioApp;

describe('J.1 — Portal Inquilino: portada sin contrato', () => {
  afterEach(() => cleanup());

  it('NO renderiza un <main> vacío: muestra la tarjeta de bienvenida con saludo y CTA', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    const tarjeta = screen.getByTestId('portal-inquilino-sin-contrato');
    expect(tarjeta).toBeTruthy();
    // Saludo personalizado con el primer nombre
    expect(tarjeta.textContent).toMatch(/Hola, Marta/);
  });

  it('explica la situación sin tecnicismos (sin "null", sin IDs, sin términos de Firestore)', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    const tarjeta = screen.getByTestId('portal-inquilino-sin-contrato');
    const texto = tarjeta.textContent || '';
    expect(texto).not.toMatch(/null/);
    expect(texto).not.toMatch(/undefined/);
    expect(texto).not.toMatch(/Firestore/);
    expect(texto).not.toMatch(/contratoId|inmuebleId|getDoc|onSnapshot/);
    // Sí debe explicar la situación
    expect(texto).toMatch(/todav\u00eda no tienes una vivienda/);
  });

  it('ofrece un CTA principal real ("Ver mis datos de acceso") que sí puede ejecutarse sin contrato', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    const cta = screen.getByRole('button', { name: /Ver mis datos de acceso/i });
    expect(cta).toBeTruthy();
    fireEvent.click(cta);
    // «Mi cuenta» no depende de contrato: debe renderizarse de verdad.
    expect(screen.getAllByText(/marta@correo\.test/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Contratos vinculados/i).length).toBeGreaterThan(0);
  });

  it('NO ofrece acciones que no puede cumplir: sin contrato no hay CTA de mensajería', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    // PortalMensajes exige `contrato`; un CTA de mensajes sería una promesa falsa.
    expect(screen.queryByRole('button', { name: /Hablar con gesti\u00f3n/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Enviar mensaje/i })).toBeNull();
  });

  it('da orientación concreta sobre el siguiente paso sin inventar funcionalidad', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    const tarjeta = screen.getByTestId('portal-inquilino-sin-contrato');
    expect(tarjeta.textContent).toMatch(/\u00bfQu\u00e9 puedes hacer ahora\?/);
    expect(tarjeta.textContent).toMatch(/la persona que te invit\u00f3/);
  });

  it('mantiene la cabecera del portal (gradiente indigo→violet) y la navegación inferior', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    // Cabecera con identidad "Portal del inquilino"
    expect(screen.getByText(/Portal del inquilino/i)).toBeTruthy();
    // Bottom-nav con 5 tabs (regex más flexible porque el botón incluye el icono SVG)
    expect(screen.getByRole('button', { name: /Inicio/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recibos/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aver\u00edas/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Luz\/Agua/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /M\u00e1s/ })).toBeTruthy();
  });

  it('cuando el nombre del usuario está vacío, muestra un saludo genérico sin romper', () => {
    const sinNombre = { ...USUARIO, nombre: '' };
    render(<InquilinoPortalShell usuario={sinNombre} onLogout={() => undefined} />);
    const tarjeta = screen.getByTestId('portal-inquilino-sin-contrato');
    expect(tarjeta.textContent).toMatch(/Hola,\s*inquilino/);
  });

  it('no muestra NADA del ERP administrativo (sin Sidebar ni Header de gestión)', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    // El portal del inquilino está aislado: no debe aparecer navegación del ERP
    expect(screen.queryByText(/^Inmuebles$/)).toBeNull();
    expect(screen.queryByText(/^Propietarios$/)).toBeNull();
    expect(screen.queryByText(/^Tesorer\u00eda$/i)).toBeNull();
    expect(screen.queryByText(/^Morosidad$/i)).toBeNull();
    expect(screen.queryByText(/Centro de Control/i)).toBeNull();
    expect(document.querySelector('#propietario-portal-section')).toBeNull();
  });
});

/**
 * J.4 — Inquilino SIN contrato: orientación mínima.
 * J.1 hizo alcanzable «Mi cuenta» sin contrato, pero la ayuda contextual
 * seguía condicionada a tener contrato activo, así que ese usuario se
 * quedaba sin ninguna explicación. `ayuda.portal.cuenta` no depende del
 * contrato y es justo la que aclara de dónde viene su acceso.
 */
describe('J.4 — Portal Inquilino sin contrato: ayuda en «Mi cuenta»', () => {
  afterEach(() => cleanup());

  const montar = () =>
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);

  const irA = (tab: string) =>
    document.querySelector(`[data-tour="portal-tab-${tab}"]`) as HTMLElement;

  it('la portada sin contrato NO muestra ayuda que hable de un contrato inexistente', () => {
    montar();
    expect(screen.queryByRole('button', { name: /^Ayuda:/i })).toBeNull();
  });

  it('en «Mi cuenta» sí ofrece la ayuda que explica cómo se obtiene el acceso', () => {
    montar();
    // Recorrido real del usuario sin contrato: el CTA de la portada J.1.
    fireEvent.click(screen.getByRole('button', { name: /Ver mis datos de acceso/i }));
    const ayuda = screen.getByRole('button', { name: /^Ayuda:/i });
    expect(ayuda.getAttribute('aria-label')).toMatch(/Mi cuenta/i);
  });

  it('esa ayuda no bloquea el regreso a la portada', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Ver mis datos de acceso/i }));
    expect(screen.getByRole('button', { name: /^Ayuda:/i })).toBeTruthy();
    fireEvent.click(irA('inicio'));
    expect(screen.getByTestId('portal-inquilino-sin-contrato')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Ayuda:/i })).toBeNull();
  });

  it('la tarjeta de bienvenida y su CTA siguen intactos (no se sustituyen por ayuda)', () => {
    montar();
    expect(screen.getByTestId('portal-inquilino-sin-contrato')).toBeTruthy();
  });
});
