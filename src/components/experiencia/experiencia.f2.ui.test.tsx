/**
 * CAPA TRANSVERSAL §6 — FASE 2 · Tests UI (jsdom): ayuda contextual en el Portal del Inquilino real,
 * resaltado de targets en el TutorialPlayer y recorridos guiados de extremo a extremo.
 *
 * El portal se monta con el arnés del BLOQUE E (Firestore/Auth/Storage en memoria).
 *
 * @vitest-environment jsdom
 */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { resetEntornoE } from '../../test/e/setupE';
import { memoria } from '../../test/e/firestoreMemoria';
import { sembrarUniverso, usuarioInquilinoTest } from '../../test/e/fixturesE';
import { InquilinoPortalShell } from '../portal-inquilino/InquilinoPortalShell';
import { TutorialPlayer } from './TutorialPlayer';
import { InquilinosSection } from '../sections/InquilinosSection';
import { Sidebar } from '../Sidebar';
import { ROLES_PREDEFINIDOS, type SectionType, type UsuarioApp } from '../../types';
import {
  ATRIBUTO_TOUR,
  ID_OVERLAY_RESALTADO,
  RECORRIDO_INVITAR_INQUILINO,
  RECORRIDO_PORTAL_INQUILINO,
  TUTORIAL_LIQUIDACION,
  contextoDesdeUsuario,
  hayResaltadoActivo,
  iniciarTutorial,
  type SesionTutorial,
  type Tutorial,
} from '../../experiencia';

beforeEach(() => {
  resetEntornoE();
  sembrarUniverso();
  window.scrollTo = () => undefined;
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

const rol = (id: string) => ROLES_PREDEFINIDOS.find((r) => r.id === id)!;
const base = { id: 'uid_TEST_X', authUid: 'uid_TEST_X', email: 'x@test.local', nombre: 'Usuario Test', activo: true, fechaCreacion: '2026-01-01' } as unknown as UsuarioApp;
const admin: UsuarioApp = { ...base, tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'], permisos: rol('SUPERADMIN').permisos };
const gestor: UsuarioApp = { ...base, tipoPerfil: 'ADMINISTRADOR', roles: ['GESTOR_INMUEBLES'], permisos: rol('GESTOR_INMUEBLES').permisos };

const overlay = () => document.getElementById(ID_OVERLAY_RESALTADO);
const tabPortal = (nombre: string) => within(document.querySelector('nav.fixed') as HTMLElement).getByText(nombre).closest('button') as HTMLButtonElement;
const esperarCargado = () => waitFor(() => expect(screen.queryByText('Cargando tu portal…')).toBeNull());

// ===========================================================================
// 1. PORTAL DEL INQUILINO · ayuda contextual
// ===========================================================================
describe('§6 F2 · Portal del Inquilino · ayuda contextual', () => {
  it('cada pantalla del portal tiene su ayuda; el botón cambia con la pantalla y el panel muestra contenido del inquilino', async () => {
    render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A')} onLogout={() => undefined} />);
    await esperarCargado();
    const header = document.querySelector('header') as HTMLElement;
    expect(within(header).getByRole('button', { name: 'Ayuda: Tu portal' })).toBeTruthy();

    fireEvent.click(tabPortal('Recibos'));
    fireEvent.click(within(header).getByRole('button', { name: 'Ayuda: Recibos y pagos' }));
    const panel = screen.getByRole('dialog', { name: /Ayuda contextual/ });
    expect(within(panel).getByText(/Cada mes con su estado/)).toBeTruthy();
    fireEvent.click(within(panel).getByText('Leer más'));
    expect(within(panel).getByText(/desde el portal no se marcan pagos/)).toBeTruthy();
    // Sin enlace al Centro de Ayuda del ERP (el inquilino no navega al ERP)
    expect(within(panel).queryByText('Abrir Centro de Ayuda')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Cerrar ayuda' }));

    const esperadas: Array<[string, string]> = [
      ['Averías', 'Ayuda: Averías e incidencias'],
      ['Luz/Agua', 'Ayuda: Suministros, lecturas y cambio de titular'],
    ];
    for (const [t, aria] of esperadas) {
      fireEvent.click(tabPortal(t));
      expect(within(header).getByRole('button', { name: aria })).toBeTruthy();
    }
    // «Más» es solo un menú: no tiene ayuda propia y el botón no se muestra
    fireEvent.click(tabPortal('Más'));
    expect(within(header).queryByRole('button', { name: /^Ayuda:/ })).toBeNull();
    // Subvistas de «Más»
    const main = document.querySelector('main') as HTMLElement;
    for (const [sub, aria] of [
      ['Mi contrato', 'Ayuda: Mi contrato'],
      ['Mensajes', 'Ayuda: Mensajes con gestión'],
      ['Documentos', 'Ayuda: Documentos'],
      ['Historial', 'Ayuda: Historial'],
      ['Mi cuenta', 'Ayuda: Mi cuenta'],
    ] as const) {
      fireEvent.click(tabPortal('Más'));
      fireEvent.click(within(main).getByText(sub).closest('button')!);
      expect(within(header).getByRole('button', { name: aria })).toBeTruthy();
    }
  });

  it('nunca muestra al inquilino contenido de gestión (tesorería/morosidad/invitaciones) ni datos ajenos', async () => {
    render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A')} onLogout={() => undefined} />);
    await esperarCargado();
    const header = document.querySelector('header') as HTMLElement;
    fireEvent.click(tabPortal('Luz/Agua'));
    fireEvent.click(within(header).getByRole('button', { name: /^Ayuda:/ }));
    fireEvent.click(screen.getByText('Leer más'));
    const texto = document.body.textContent || '';
    expect(texto).not.toMatch(/tesoreria\.|inquilinos\.gestionar|Crear invitación|pain\.008|expediente de morosidad/i);
    expect(texto).not.toContain('Calle Test B');
  });

  it('no aparece cuando no hay contexto de contrato (inquilino sin vínculos o error) y no rompe la pantalla', async () => {
    render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A', { contratoIds: [] })} onLogout={() => undefined} />);
    await esperarCargado();
    expect(screen.getByText(/no tiene contratos vinculados/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Ayuda:/ })).toBeNull();
    expect(document.querySelector('header h1')?.textContent).toBe('Mi hogar');
    cleanup();
    render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A', { contratoIds: ['ct_TEST_INEXISTENTE'] })} onLogout={() => undefined} />);
    await esperarCargado();
    expect(screen.queryByRole('button', { name: /^Ayuda:/ })).toBeNull();
  });

  it('el recorrido del portal se inicia desde la ayuda de «Inicio» y navega por las pantallas reales resaltando targets', async () => {
    render(<InquilinoPortalShell usuario={usuarioInquilinoTest('A')} onLogout={() => undefined} />);
    await esperarCargado();
    const header = document.querySelector('header') as HTMLElement;
    fireEvent.click(within(header).getByRole('button', { name: 'Ayuda: Tu portal' }));
    fireEvent.click(screen.getByText('Leer más'));
    fireEvent.click(screen.getByText(/Recorrido: Conoce tu portal|Tutorial: Conoce tu portal/));
    const dialogo = await screen.findByRole('dialog', { name: /Tutorial: Conoce tu portal/ });
    expect(within(dialogo).getByText('Paso 1 de 5')).toBeTruthy();
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('portal-tab-inicio'));

    // Paso 2: recibos → estamos en 'inicio', el panel ofrece ir; al ir, resalta la pestaña
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    fireEvent.click(within(dialogo).getByText('Ir a la pantalla de este paso'));
    expect(document.querySelector('header h1')?.textContent).toBe('Recibos y pagos');
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('portal-tab-recibos'));

    // Paso 3: averías → el FAB real «Notificar avería» es el target
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    fireEvent.click(within(dialogo).getByText('Ir a la pantalla de este paso'));
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('portal-nueva-averia'));
    expect(screen.getByRole('button', { name: 'Notificar avería' }).getAttribute(ATRIBUTO_TOUR)).toBe('portal-nueva-averia');

    // Paso 4 (lecturas) se salta → paso 5 (mensajes en «Más»)
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    expect(within(dialogo).getByText(/Paso 4 de 5/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Saltar paso' }));
    expect(within(dialogo).getByText(/Paso 5 de 5/)).toBeTruthy();
    expect(within(dialogo).getByText(/1 saltado/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByText('Ir a la pantalla de este paso'));
    expect(document.querySelector('header h1')?.textContent).toBe('Más opciones');
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('portal-mas-mensajes'));

    fireEvent.click(within(dialogo).getByText('Finalizar'));
    expect(within(dialogo).getByText('Tutorial completado')).toBeTruthy();
    await waitFor(() => expect(hayResaltadoActivo()).toBe(false)); // limpieza al finalizar
    fireEvent.click(within(dialogo).getByText('Cerrar'));
    expect(screen.queryByRole('dialog', { name: /Tutorial/ })).toBeNull();
    // El portal sigue operativo y sin datos ajenos
    expect(document.body.textContent).not.toContain('Calle Test B');
  });
});

// ===========================================================================
// 2. TutorialPlayer · ciclo de vida del resaltado
// ===========================================================================
function Host({ usuario, tutorial, seccionInicial, accesibles, pantalla }: { usuario: UsuarioApp; tutorial: Tutorial; seccionInicial: string; accesibles?: string[]; pantalla?: (s: string) => React.ReactNode }) {
  const [seccion, setSeccion] = useState(seccionInicial);
  const [sesion, setSesion] = useState<SesionTutorial | null>(() => iniciarTutorial(tutorial));
  return (
    <div>
      <p data-testid="seccion">{seccion}</p>
      <p data-testid="estado">{sesion?.estado ?? 'SIN_SESION'}</p>
      {pantalla?.(seccion)}
      {sesion && (
        <TutorialPlayer
          tutorial={tutorial}
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

describe('§6 F2 · TutorialPlayer · resaltado de targets', () => {
  const pantallaERP = (s: string) => (
    <div>
      <button data-tour="nav-inquilinos">Portal Inquilinos</button>
      {s === 'inquilinos' && (
        <div>
          <button data-tour="inquilinos-tab-accesos">Accesos</button>
          <button data-tour="inquilinos-tab-invitaciones">Invitaciones</button>
          <button data-tour="inquilinos-tab-mensajes">Mensajes</button>
        </div>
      )}
    </div>
  );

  it('target visible → overlay; siguiente/anterior cambian el target; cambio de sección lo hace aparecer; cancelar limpia', async () => {
    render(<Host usuario={admin} tutorial={RECORRIDO_INVITAR_INQUILINO} seccionInicial="inicio" pantalla={pantallaERP} />);
    const dialogo = screen.getByRole('dialog');
    // Paso 1: ruta 'inquilinos' pero estamos en 'inicio' → no se resalta hasta llegar a la ruta
    expect(overlay()).toBeNull();
    fireEvent.click(within(dialogo).getByText('Ir a la pantalla de este paso'));
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('nav-inquilinos'));
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('inquilinos-tab-invitaciones'));
    fireEvent.click(within(dialogo).getByText('Anterior'));
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('nav-inquilinos'));
    expect(document.querySelectorAll(`#${ID_OVERLAY_RESALTADO}`)).toHaveLength(1);
    fireEvent.click(within(dialogo).getByText('Salir'));
    expect(hayResaltadoActivo()).toBe(false);
    expect(screen.getByTestId('estado').textContent).toBe('SIN_SESION');
  });

  it('paso sin target → sin overlay ni aviso; target inexistente en la pantalla → aviso y sin overlay; finalizar limpia', async () => {
    render(<Host usuario={admin} tutorial={RECORRIDO_INVITAR_INQUILINO} seccionInicial="inquilinos" pantalla={() => <button data-tour="nav-inquilinos">x</button>} />);
    const dialogo = screen.getByRole('dialog');
    await waitFor(() => expect(overlay()).toBeTruthy());
    fireEvent.click(within(dialogo).getByText('Siguiente')); // tab invitaciones: no está en esta pantalla simulada
    await waitFor(() => expect(within(dialogo).getByRole('note').textContent).toMatch(/no está visible en pantalla/));
    expect(overlay()).toBeNull();
    fireEvent.click(within(dialogo).getByText('Siguiente')); // compartir enlace: sin target
    expect(within(dialogo).queryByRole('note')).toBeNull();
    expect(overlay()).toBeNull();
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    fireEvent.click(within(dialogo).getByText('Finalizar'));
    await waitFor(() => expect(hayResaltadoActivo()).toBe(false));
  });

  it('permiso insuficiente: el paso se explica y no se ofrece como ejecutable; los permisos del usuario no cambian', async () => {
    const antes = JSON.stringify(gestor.permisos);
    render(<Host usuario={gestor} tutorial={TUTORIAL_LIQUIDACION} seccionInicial="tesoreria" pantalla={() => <button data-tour="nav-tesoreria">T</button>} />);
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByRole('note').textContent).toContain('tesoreria.ver');
    await waitFor(() => expect(overlay()).toBeTruthy()); // se puede ver dónde está, pero no ejecutar
    expect(JSON.stringify(gestor.permisos)).toBe(antes);
  });

  it('desmontar el reproductor limpia el resaltado', async () => {
    const { unmount } = render(<Host usuario={admin} tutorial={RECORRIDO_INVITAR_INQUILINO} seccionInicial="inquilinos" pantalla={pantallaERP} />);
    await waitFor(() => expect(overlay()).toBeTruthy());
    unmount();
    expect(hayResaltadoActivo()).toBe(false);
  });
});

// ===========================================================================
// 3. Recorrido ERP real con los componentes reales (Sidebar + InquilinosSection)
// ===========================================================================
describe('§6 F2 · Recorrido ERP «invitar inquilino» sobre componentes reales', () => {
  function HostERP() {
    const [seccion, setSeccion] = useState<string>('inicio');
    const [sesion, setSesion] = useState<SesionTutorial | null>(() => iniciarTutorial(RECORRIDO_INVITAR_INQUILINO));
    return (
      <div>
        <Sidebar activeSection={seccion as SectionType} onSelectSection={(s) => setSeccion(s)} candidatos={[]} inmueblesCount={0} currentUser={admin} />
        <main>{seccion === 'inquilinos' && <InquilinosSection currentUser={admin} contratos={[]} inmuebles={[]} usuarios={[]} />}</main>
        {sesion && (
          <TutorialPlayer
            tutorial={RECORRIDO_INVITAR_INQUILINO}
            sesion={sesion}
            contexto={contextoDesdeUsuario(admin, seccion)}
            onCambio={setSesion}
            onNavegar={setSeccion}
            onCerrar={() => setSesion(null)}
          />
        )}
      </div>
    );
  }

  it('los targets reales existen: entrada del menú, pestañas Invitaciones/Accesos/Mensajes; el recorrido se completa', async () => {
    render(<HostERP />);
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByText('Ir a la pantalla de este paso'));
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('nav-inquilinos'));
    expect(screen.getByText('Portal de inquilinos')).toBeTruthy(); // InquilinosSection real montada
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('inquilinos-tab-invitaciones'));
    fireEvent.click(within(dialogo).getByText('Siguiente')); // compartir enlace (sin target)
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('inquilinos-tab-accesos'));
    fireEvent.click(within(dialogo).getByText('Siguiente'));
    await waitFor(() => expect(overlay()?.getAttribute('data-target')).toBe('inquilinos-tab-mensajes'));
    // El recorrido no ejecuta nada por sí mismo: la pestaña activa sigue siendo la inicial (Accesos) y no hay invitaciones creadas
    expect(memoria.idsDe('enlaces_registro').filter((id) => !id.includes('TEST'))).toEqual([]);
    fireEvent.click(within(dialogo).getByText('Finalizar'));
    await waitFor(() => expect(hayResaltadoActivo()).toBe(false));
  });
});
