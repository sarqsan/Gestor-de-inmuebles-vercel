/**
 * CAPA TRANSVERSAL §6 — FASE 4 · Tests UI (jsdom) del asistente transversal.
 * Sin proveedor real: mocks de `ProveedorIA` y resolutor local.
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { resetEntornoE } from '../../test/e/setupE';
import { memoria } from '../../test/e/firestoreMemoria';
import { sembrarUniverso, usuarioInquilinoTest } from '../../test/e/fixturesE';
import { InquilinoPortalShell } from '../portal-inquilino/InquilinoPortalShell';
import { AsistentePanel } from './AsistentePanel';
import { Header } from '../Header';
import { MobileNav } from '../MobileNav';
import { ROLES_PREDEFINIDOS, type SectionType, type UsuarioApp, type UserProfile } from '../../types';
import { RECORRIDO_INVITAR_INQUILINO, type AccionHost, type ProveedorIA, type PropuestaIA } from '../../experiencia';

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const base = { id: 'u1', authUid: 'u1', email: 'x@test.local', nombre: 'Test', activo: true } as unknown as UsuarioApp;
const admin: UsuarioApp = { ...base, tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos };
const gestor: UsuarioApp = { ...base, tipoPerfil: 'ADMINISTRADOR', roles: ['GESTOR_INMUEBLES'], permisos: rol('GESTOR_INMUEBLES').permisos };
const perfil = { id: 'u1', nombre: 'Test', rol: 'ADMINISTRADOR' } as unknown as UserProfile;

const mock = (p: PropuestaIA | (() => Promise<PropuestaIA>)): ProveedorIA => ({ nombre: 'mock', interpretar: typeof p === 'function' ? p : async () => p });

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: 'Asistente' }));
  return screen.getByRole('dialog', { name: 'Asistente' });
}
function pedir(d: HTMLElement, texto: string) {
  fireEvent.change(within(d).getByLabelText('¿Qué necesitas?'), { target: { value: texto } });
  fireEvent.click(within(d).getByRole('button', { name: 'Enviar petición' }));
}
const resolucion = () => screen.getByTestId('asistente-resolucion');

beforeEach(() => {
  resetEntornoE();
  window.scrollTo = () => undefined;
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('§6 F4 · AsistentePanel (ERP)', () => {
  it('visible en el Header y en MobileNav cuando hay usuario y host lo conecta; accesible (aria-expanded/controls, label, Escape cierra)', () => {
    const onAccion = vi.fn();
    render(<Header activeSection="inicio" userProfile={perfil} currentUser={admin} onSelectSection={() => undefined} onAccionAsistente={onAccion} />);
    const boton = screen.getByRole('button', { name: 'Asistente' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    const d = abrir();
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(boton.getAttribute('aria-controls')).toBe(d.id);
    expect(within(d).getByLabelText('¿Qué necesitas?')).toBe(document.activeElement);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Asistente' })).toBeNull();
    cleanup();
    render(<MobileNav activeSection="inicio" onSelectSection={() => undefined} candidatos={[]} currentUser={admin} onAccionAsistente={onAccion} />);
    expect(screen.getByRole('button', { name: 'Asistente' })).toBeTruthy();
    cleanup();
    // Sin onAccion (host no conectado) o sin usuario → no se muestra
    render(<Header activeSection="inicio" userProfile={perfil} currentUser={admin} onSelectSection={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Asistente' })).toBeNull();
  });

  it('navegación: resultado directo → el host recibe NAVEGAR y el panel se cierra; contexto de sección correcto', async () => {
    const onAccion = vi.fn();
    render(<AsistentePanel usuario={admin} section="inicio" onAccion={onAccion} />);
    const d = abrir();
    pedir(d, 'ir a tesorería');
    await waitFor(() => expect(onAccion).toHaveBeenCalledWith({ tipo: 'NAVEGAR', route: 'tesoreria', capabilityId: 'cap.tesoreria.consultar' }));
    expect(screen.queryByRole('dialog', { name: 'Asistente' })).toBeNull();
  });

  it('loading: mientras el proveedor responde se muestra el estado y el envío queda deshabilitado; después la interpretación (explicación con contenido)', async () => {
    let liberar: (p: PropuestaIA) => void = () => undefined;
    const prov = mock(() => new Promise<PropuestaIA>((r) => (liberar = r)));
    render(<AsistentePanel usuario={admin} section="inicio" proveedor={prov} onAccion={vi.fn()} />);
    const d = abrir();
    pedir(d, '¿qué es una liquidación?');
    expect(within(d).getByRole('status').textContent).toContain('Interpretando');
    expect((within(d).getByRole('button', { name: 'Enviar petición' }) as HTMLButtonElement).disabled).toBe(true);
    liberar({ intencion: 'EXPLICAR', capabilityId: 'cap.ayuda.explicar', parametros: { helpEntryId: 'ayuda.tesoreria.liquidaciones' }, confianza: 0.9, explicacion: 'Te explico las liquidaciones.' });
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('RESUELTA'));
    expect(within(d).getByText('Te explico las liquidaciones.')).toBeTruthy();
    expect(within(d).getByText(/Liquidaciones a propietarios/)).toBeTruthy(); // contenido real de la ayuda
    expect(within(d).queryByText('Ir a la pantalla')).toBeNull(); // explicar no navega
  });

  it('ambigüedad: se ofrecen alternativas permitidas; elegir una resuelve y ejecuta', async () => {
    const onAccion = vi.fn();
    render(<AsistentePanel usuario={admin} section="inicio" onAccion={onAccion} />);
    const d = abrir();
    pedir(d, 'lecturas y recibos');
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('AMBIGUA'));
    const grupo = within(d).getByRole('group', { name: 'Elige una opción' });
    fireEvent.click(within(grupo).getByText('Consultar cobros de alquiler y su estado'));
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('RESUELTA'));
    fireEvent.click(within(d).getByText('Ir a la pantalla'));
    expect(onAccion).toHaveBeenCalledWith({ tipo: 'NAVEGAR', route: 'cobros', capabilityId: 'cap.cobros.consultar' });
  });

  it('confirmación: escritura → pregunta; Cancelar → nada; «Sí, continuar» → solo entonces el host navega a la pantalla real', async () => {
    const onAccion = vi.fn();
    render(<AsistentePanel usuario={admin} section="inicio" onAccion={onAccion} />);
    const d = abrir();
    pedir(d, 'quiero registrar este pago');
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('REQUIERE_CONFIRMACION'));
    expect(within(d).getByText(/Registrar pagos.*¿Quieres continuar\?/)).toBeTruthy();
    expect(onAccion).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByText('Cancelar'));
    expect(screen.queryByTestId('asistente-resolucion')).toBeNull();
    expect(onAccion).not.toHaveBeenCalled();
    pedir(d, 'registrar pago');
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('REQUIERE_CONFIRMACION'));
    fireEvent.click(within(d).getByText('Sí, continuar'));
    expect(onAccion).toHaveBeenCalledTimes(1);
    expect(onAccion).toHaveBeenCalledWith({ tipo: 'NAVEGAR', route: 'tesoreria', capabilityId: 'cap.tesoreria.pagar' });
    expect(memoria.rutasEscritas()).toEqual([]); // el asistente no escribe nada
  });

  it('errores claros: sin permiso, no soportada y proveedor caído (modo local con aviso); tutorial → el host lo inicia', async () => {
    const onAccion = vi.fn();
    const { rerender } = render(<AsistentePanel usuario={gestor} section="inicio" onAccion={onAccion} />);
    let d = abrir();
    pedir(d, 'quiero ver la tesorería');
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('SIN_PERMISO'));
    expect(within(d).getByText('Sin permiso')).toBeTruthy();
    expect(within(d).getByText(/requiere un permiso o perfil/)).toBeTruthy();
    expect(d.textContent).not.toMatch(/pain\.008|liquidaci/i);
    pedir(d, 'xyzqwv plim');
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('NO_SOPORTADA'));
    rerender(<AsistentePanel usuario={admin} section="inicio" proveedor={mock(async () => { throw new Error('ECONNREFUSED'); })} onAccion={onAccion} />);
    d = screen.getByRole('dialog', { name: 'Asistente' });
    pedir(d, 'cómo invito a un inquilino');
    await waitFor(() => expect(onAccion).toHaveBeenCalledWith({ tipo: 'TUTORIAL', tutorialId: RECORRIDO_INVITAR_INQUILINO.id, capabilityId: 'cap.ayuda.tutorial' }));
    pedir(abrir(), '¿qué es una liquidación?'); // el tutorial cerró el panel
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('RESUELTA'));
    expect(screen.getByText(/modo local/)).toBeTruthy();
    expect(screen.getByText(/Asistente IA no disponible \(ECONNREFUSED\)/)).toBeTruthy();
  });
});

describe('§6 F4 · Asistente en el Portal del Inquilino (host PORTAL_INQUILINO)', () => {
  it('con contrato: el asistente navega por el portal real y nunca ofrece capacidades del ERP; sin contrato no aparece', async () => {
    sembrarUniverso();
    render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A')} onLogout={() => undefined} />);
    await waitFor(() => expect(screen.queryByText('Cargando tu portal…')).toBeNull());
    const d = abrir();
    expect(within(d).getByText(/Asistente del portal/)).toBeTruthy();
    pedir(d, 'quiero ver mis recibos');
    await waitFor(() => expect(document.querySelector('header h1')?.textContent).toBe('Recibos y pagos'));
    expect(screen.queryByRole('dialog', { name: 'Asistente' })).toBeNull();
    // Petición hacia el ERP: sin permiso / no soportada, nunca navega ni expone
    const d2 = abrir();
    pedir(d2, 'ver la tesorería y las liquidaciones');
    await waitFor(() => expect(screen.getByTestId('asistente-resolucion')).toBeTruthy());
    expect(resolucion().getAttribute('data-estado')).toBe('NO_SOPORTADA');
    expect(within(d2).getByText(/no está disponible en el portal/)).toBeTruthy();
    expect(document.querySelector('header h1')?.textContent).toBe('Recibos y pagos');
    expect(document.body.textContent).not.toMatch(/pain\.008|Generar y aprobar liquidaciones/);
    pedir(d2, 'tengo una avería en la caldera');
    await waitFor(() => expect(document.querySelector('header h1')?.textContent).toBe('Incidencias'));
    expect(document.body.textContent).not.toContain('Calle Test B');
    cleanup();
    render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A', { contratoIds: [] })} onLogout={() => undefined} />);
    await waitFor(() => expect(screen.queryByText('Cargando tu portal…')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Asistente' })).toBeNull();
  });

  it('el recorrido del portal se inicia desde el asistente y las peticiones de explicación muestran la ayuda del portal', async () => {
    sembrarUniverso();
    render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A')} onLogout={() => undefined} />);
    await waitFor(() => expect(screen.queryByText('Cargando tu portal…')).toBeNull());
    const d = abrir();
    pedir(d, 'hazme el recorrido del portal');
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Tutorial: Conoce tu portal/ })).toBeTruthy());
    const d2 = abrir();
    pedir(d2, '¿qué significa un recibo pendiente?');
    await waitFor(() => expect(resolucion().getAttribute('data-estado')).toBe('RESUELTA'));
    expect(within(d2).getByText('Recibos y pagos')).toBeTruthy();
  });
});

/** Host mínimo para comprobar que la acción llega al host y este decide (route guard propio). */
function HostGuard() {
  const [seccion, setSeccion] = useState<SectionType>('inicio');
  const permitidas: SectionType[] = ['inicio', 'inmuebles', 'ayuda'];
  const onAccion = (a: Exclude<AccionHost, { tipo: 'NINGUNA' }>) => {
    if (a.tipo === 'NAVEGAR' && permitidas.includes(a.route as SectionType)) setSeccion(a.route as SectionType);
  };
  return (
    <div>
      <p data-testid="seccion">{seccion}</p>
      <AsistentePanel usuario={admin} section={seccion} accessibleSections={permitidas} onAccion={onAccion} />
    </div>
  );
}

describe('§6 F4 · el host conserva la última palabra', () => {
  it('con accessibleSections del host, el asistente no propone rutas fuera de él; y aunque lo hiciera, el host no navega', async () => {
    render(<HostGuard />);
    const d = abrir();
    pedir(d, 'ir a tesorería');
    await waitFor(() => expect(screen.getByTestId('asistente-resolucion')).toBeTruthy());
    expect(['ERROR', 'SIN_PERMISO', 'NO_SOPORTADA']).toContain(resolucion().getAttribute('data-estado'));
    expect(screen.getByTestId('seccion').textContent).toBe('inicio');
    pedir(d, 'abre inmuebles');
    await waitFor(() => expect(screen.getByTestId('seccion').textContent).toBe('inmuebles'));
  });
});
