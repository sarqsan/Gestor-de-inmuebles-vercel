/**
 * @vitest-environment jsdom
 *
 * J.5 — Recorrido inicial del Portal Propietario.
 *
 * Hasta J.4 el botón «Primeros pasos como propietario» aparecía en la ayuda
 * contextual pero estaba DESHABILITADO (el portal no cableaba
 * `onIniciarTutorial`) y, además, sus pasos llevaban a secciones globales del
 * ERP con selectores del Sidebar: era inservible desde el portal.
 *
 * Aquí se verifica que el recorrido:
 *  · se inicia MANUALMENTE (nunca solo),
 *  · usa rutas y selectores que existen REALMENTE en el portal,
 *  · no abandona el Portal Propietario,
 *  · avanza y finaliza correctamente.
 *
 * Se mockea únicamente la persistencia de progreso (Firestore), igual que
 * hacen los tests del portal del inquilino: J.5 no toca datos.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inmueble, Propietario, UsuarioApp } from '../../types';

vi.mock('../../lib/progresoTutorialesFirestore', () => ({
  servicioProgresoTutoriales: {
    getTutorialProgress: () => Promise.resolve({ ok: true, data: null }),
    saveTutorialProgress: () => Promise.resolve({ ok: true }),
  },
}));

import { PropietarioPortalSection } from './PropietarioPortalSection';
import { RECORRIDO_PROPIETARIO_PRIMEROS_PASOS } from '../../experiencia/tutoriales';

const USUARIO: UsuarioApp = {
  id: 'u-1',
  nombre: 'Ana Propietaria',
  email: 'ana@correo.test',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO_ESTANDAR'],
  permisos: [],
  propietarioId: 'P1',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const PROPIETARIOS: Propietario[] = [
  {
    id: 'P1',
    nombre: 'Ana Propietaria',
    email: 'ana@correo.test',
    telefono: '600000000',
    documento: '12345678Z',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  } as unknown as Propietario,
];

const VIVIENDA = {
  id: 'inm-1',
  direccion: 'Calle Mayor 1',
  ciudad: 'Alicante',
  tipo: 'piso',
  habitaciones: 3,
  banos: 1,
  superficie: 90,
  precio: 800,
  estado: 'alquilado',
  propietarioId: 'P1',
} as unknown as Inmueble;

function renderPortal() {
  return render(
    <PropietarioPortalSection
      currentUser={USUARIO}
      inmuebles={[VIVIENDA]}
      profesionales={[]}
      contratos={[]}
      especialidades={[]}
      propietarios={PROPIETARIOS}
      gastos={[]}
      incidencias={[]}
      onOpenCrearProfesionalModal={() => undefined}
      onSaveProfesional={() => Promise.resolve()}
    />,
  );
}

/** Abre la ayuda contextual y despliega la entrada que ofrece el recorrido. */
function abrirBotonDelRecorrido(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /^Ayuda:/i }));
  const panel = screen.getByRole('dialog');
  // La ficha ampliada es la que expone `relatedTutorials`.
  // En «Mis Viviendas» el contexto de ayuda es `inmuebles`; la entrada que
  // declara `relatedTutorials` es «Titularidad de un inmueble».
  const entradas = within(panel).getAllByRole('button');
  const ampliar = entradas.find((b) => /Titularidad de un inmueble/i.test(b.textContent || ''));
  expect(ampliar, 'no se encontró la entrada de ayuda que ofrece el recorrido').toBeTruthy();
  fireEvent.click(ampliar as HTMLElement);
  return screen.getByRole('button', { name: /Tutorial:/i });
}

/** Panel del reproductor del recorrido (acotado por su nombre accesible). */
function panelTour(): HTMLElement {
  return screen.getByRole('dialog', { name: /Tutorial: Primeros pasos como propietario/i });
}

// ---------------------------------------------------------------------------
// Definición del recorrido (contrato con el motor de tutoriales)
// ---------------------------------------------------------------------------
describe('J.5 — definición del recorrido del propietario', () => {
  const t = RECORRIDO_PROPIETARIO_PRIMEROS_PASOS;

  it('sigue siendo exclusivo del rol PROPIETARIO (no afecta a ADMINISTRADOR)', () => {
    expect(t.roles).toEqual(['PROPIETARIO']);
  });

  it('NINGÚN paso navega a secciones globales del ERP ajenas al portal', () => {
    const prohibidas = ['datos', 'ayuda', 'configuracion', 'administracion', 'dashboard', 'informes'];
    const rutas = t.steps.map((p) => p.route);
    for (const r of rutas) expect(prohibidas).not.toContain(r);
  });

  it('NINGÚN paso apunta a selectores del Sidebar global (nav-*)', () => {
    for (const p of t.steps) {
      expect(p.target ?? '').not.toMatch(/nav-/);
    }
  });

  it('todos los pasos con target usan el mecanismo data-tour del portal', () => {
    const conTarget = t.steps.filter((p) => p.target);
    expect(conTarget.length).toBe(t.steps.length);
    for (const p of conTarget) expect(p.target).toMatch(/^\[data-tour="portal-prop-/);
  });

  it('cubre el recorrido funcional pedido: resumen, viviendas, contratos, dinero, incidencias, perfil', () => {
    expect(t.steps.map((p) => p.id)).toEqual([
      'resumen',
      'viviendas',
      'contratos',
      'liquidaciones',
      'incidencias',
      'perfil',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Selectores reales en el DOM del portal
// ---------------------------------------------------------------------------
describe('J.5 — los selectores del recorrido existen en el Portal Propietario', () => {
  afterEach(() => cleanup());

  it('cada `target` del recorrido localiza un elemento real del portal', () => {
    renderPortal();
    for (const paso of RECORRIDO_PROPIETARIO_PRIMEROS_PASOS.steps) {
      const el = document.querySelector(paso.target as string);
      expect(el, `El paso «${paso.id}» apunta a ${paso.target} y no existe en el portal`).not.toBeNull();
    }
  });

  it('los anclajes son las propias sub-pestañas del portal, no elementos externos', () => {
    renderPortal();
    for (const sub of ['viviendas', 'contratos', 'liquidaciones', 'incidencias', 'perfil']) {
      const el = document.querySelector(`[data-tour="portal-prop-tab-${sub}"]`);
      expect(el, `falta ancla de la sub-pestaña ${sub}`).not.toBeNull();
      expect(el?.tagName).toBe('BUTTON');
    }
  });
});

// ---------------------------------------------------------------------------
// Interacción: manual, navegable, finalizable
// ---------------------------------------------------------------------------
describe('J.5 — el recorrido se inicia a mano y funciona dentro del portal', () => {
  afterEach(() => cleanup());

  it('NO hay autoarranque: al entrar en el portal no aparece ningún reproductor', () => {
    renderPortal();
    expect(screen.queryByText(/Primeros pasos como propietario/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Siguiente/i })).toBeNull();
  });

  it('el botón del recorrido está HABILITADO (ya no es inerte)', () => {
    renderPortal();
    const boton = abrirBotonDelRecorrido();
    expect(boton).toBeTruthy();
    expect((boton as HTMLButtonElement).disabled).toBe(false);
  });

  it('al pulsarlo arranca el recorrido y muestra el primer paso', () => {
    renderPortal();
    fireEvent.click(abrirBotonDelRecorrido());
    const tour = panelTour();
    expect(within(tour).getByText(/Tu espacio patrimonial/i)).toBeTruthy();
    expect(within(tour).getByText(/Paso 1 de 6/i)).toBeTruthy();
  });

  it('avanza por los pasos y el portal sigue siendo el Portal Propietario', () => {
    renderPortal();
    fireEvent.click(abrirBotonDelRecorrido());

    fireEvent.click(within(panelTour()).getByRole('button', { name: /Siguiente/i }));
    expect(within(panelTour()).getByText(/Paso 2 de 6/i)).toBeTruthy();
    expect(within(panelTour()).getByText(/Mis Viviendas/i)).toBeTruthy();
    // El portal no ha sido sustituido ni se ha navegado fuera.
    expect(screen.getByTestId('portal-estado-patrimonial')).toBeTruthy();
  });

  it('«Ir a la pantalla de este paso» cambia de sub-pestaña SIN salir del portal', () => {
    renderPortal();
    fireEvent.click(abrirBotonDelRecorrido());
    fireEvent.click(within(panelTour()).getByRole('button', { name: /Siguiente/i })); // paso «viviendas»

    const ir = within(panelTour()).queryByRole('button', { name: /Ir a la pantalla de este paso/i });
    if (ir) fireEvent.click(ir);

    const tab = document.querySelector('[data-tour="portal-prop-tab-viviendas"]');
    expect(tab?.getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('portal-estado-patrimonial')).toBeTruthy();
  });

  it('puede recorrerse entero y finalizar correctamente', () => {
    renderPortal();
    fireEvent.click(abrirBotonDelRecorrido());

    const total = RECORRIDO_PROPIETARIO_PRIMEROS_PASOS.steps.length;
    for (let i = 0; i < total - 1; i++) {
      fireEvent.click(within(panelTour()).getByRole('button', { name: /Siguiente/i }));
    }
    expect(within(panelTour()).getByText(new RegExp(`Paso ${total} de ${total}`, 'i'))).toBeTruthy();
    // En el último paso ya no hay «Siguiente», sino el cierre del recorrido.
    expect(within(panelTour()).queryByRole('button', { name: /Siguiente/i })).toBeNull();
    fireEvent.click(within(panelTour()).getByRole('button', { name: /Finalizar/i }));
    // El portal sigue en pie tras finalizar.
    expect(screen.getByTestId('portal-estado-patrimonial')).toBeTruthy();
  });

  it('el recorrido no bloquea el portal: se puede navegar con él abierto', () => {
    renderPortal();
    fireEvent.click(abrirBotonDelRecorrido());
    expect(within(panelTour()).getByText(/Tu espacio patrimonial/i)).toBeTruthy();

    const tabPerfil = document.querySelector('[data-tour="portal-prop-tab-perfil"]') as HTMLElement;
    fireEvent.click(tabPerfil);
    expect(tabPerfil.getAttribute('aria-current')).toBe('page');
  });
});
