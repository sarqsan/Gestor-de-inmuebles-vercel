/**
 * @vitest-environment jsdom
 *
 * J.6 — Estados vacíos del Portal Propietario.
 *
 * Sólo se cubren las tres secciones que la auditoría detectó como
 * problemáticas; el resto ya tenía un estado vacío correcto y no se tocó.
 *
 *  · Contratos: el título decía «No hay contratos activos», pero los datos
 *    que usa (`misContratos`) no filtran por estado.
 *  · Morosidad: no distinguía «no hay casos» de «hay casos, todos saldados».
 *  · Profesionales: el catálogo vacío no pintaba NADA (parecía un error).
 *
 * No se añaden consultas ni datos nuevos: todos los casos se construyen con
 * las props que el componente ya recibe.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Inmueble, Propietario, UsuarioApp } from '../../types';
import { PropietarioPortalSection } from './PropietarioPortalSection';

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

/** Profesional privado: hace que la pestaña exista aun sin viviendas. */
const PROF_PRIVADO = {
  id: 'pro-1',
  nombreComercial: 'Fontanería Pérez',
  especialidades: ['Fontanería'],
  activo: true,
  esPrivado: true,
  creadoPorPropietarioId: 'P1',
} as any;

function renderPortal(
  opts: {
    inmuebles?: Inmueble[];
    contratos?: any[];
    profesionales?: any[];
    resumenMorosidad?: any[];
  } = {},
) {
  return render(
    <PropietarioPortalSection
      currentUser={USUARIO}
      inmuebles={opts.inmuebles ?? []}
      profesionales={opts.profesionales ?? []}
      contratos={opts.contratos ?? []}
      especialidades={[]}
      propietarios={PROPIETARIOS}
      gastos={[]}
      incidencias={[]}
      resumenMorosidad={opts.resumenMorosidad}
      onOpenCrearProfesionalModal={() => undefined}
      onSaveProfesional={() => Promise.resolve()}
    />,
  );
}

const irA = (sub: string) =>
  fireEvent.click(document.querySelector(`[data-tour="portal-prop-tab-${sub}"]`) as HTMLElement);

// ---------------------------------------------------------------------------
// B · Sin contratos
// ---------------------------------------------------------------------------
describe('J.6 — Contratos vacío', () => {
  afterEach(() => cleanup());

  it('no afirma «no hay contratos activos»: los datos no filtran por estado', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irA('contratos');
    const vacio = screen.getByTestId('portal-vacio-contratos');
    expect(vacio.textContent).toMatch(/Todavía no tienes contratos/);
    expect(vacio.textContent).not.toMatch(/contratos activos/);
  });

  it('con viviendas explica que aún no se ha formalizado ninguno y NO ofrece CTA', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irA('contratos');
    expect(screen.getByTestId('portal-vacio-contratos').textContent).toMatch(
      /no se ha formalizado ningún contrato/i,
    );
    expect(screen.queryByTestId('portal-vacio-contratos-cta')).toBeNull();
  });

  it('sin viviendas explica la causa real y ofrece ir a «Mis Viviendas»', () => {
    // Sin viviendas la pestaña existe porque hay un profesional privado.
    renderPortal({ inmuebles: [], profesionales: [PROF_PRIVADO] });
    irA('contratos');
    expect(screen.getByTestId('portal-vacio-contratos').textContent).toMatch(
      /cuando tienes una vivienda vinculada/i,
    );
    const cta = screen.getByTestId('portal-vacio-contratos-cta');
    fireEvent.click(cta);
    // El CTA usa una pestaña REAL ya existente del portal.
    expect(
      document.querySelector('[data-tour="portal-prop-tab-viviendas"]')?.getAttribute('aria-current'),
    ).toBe('page');
  });
});

// ---------------------------------------------------------------------------
// I · Sin morosidad / sin morosidad pendiente
// ---------------------------------------------------------------------------
describe('J.6 — Morosidad: ausencia de casos vs ausencia de pendientes', () => {
  afterEach(() => cleanup());

  it('sin ningún caso registrado NO habla de «pendientes de cobro»', () => {
    renderPortal({ inmuebles: [VIVIENDA], resumenMorosidad: [] });
    irA('morosidad');
    const vacio = screen.getByTestId('portal-vacio-morosidad');
    expect(vacio.textContent).toMatch(/Sin impagos registrados/);
    expect(vacio.textContent).toMatch(/No consta ningún caso de impago/);
    expect(screen.queryByTestId('portal-morosidad-al-corriente')).toBeNull();
  });

  it('con casos ya saldados avisa de que no hay nada pendiente (antes: «0,00 €» sin explicación)', () => {
    renderPortal({
      inmuebles: [VIVIENDA],
      resumenMorosidad: [
        {
          id: 'mor-1',
          propietarioId: 'P1',
          inmuebleId: 'inm-1',
          inmuebleDireccion: 'Calle Mayor 1',
          saldoPendiente: 0,
          numPeriodosImpagados: 0,
          periodoDesde: '2026-01',
          periodoHasta: '2026-02',
        },
      ],
    });
    irA('morosidad');
    expect(screen.queryByTestId('portal-vacio-morosidad')).toBeNull();
    const aviso = screen.getByTestId('portal-morosidad-al-corriente');
    expect(aviso.textContent).toMatch(/No tienes impagos pendientes/);
  });

  it('con saldo vivo NO muestra el aviso de «al corriente»', () => {
    renderPortal({
      inmuebles: [VIVIENDA],
      resumenMorosidad: [
        {
          id: 'mor-2',
          propietarioId: 'P1',
          inmuebleId: 'inm-1',
          inmuebleDireccion: 'Calle Mayor 1',
          saldoPendiente: 450,
          numPeriodosImpagados: 1,
          periodoDesde: '2026-01',
          periodoHasta: '2026-01',
        },
      ],
    });
    irA('morosidad');
    expect(screen.queryByTestId('portal-morosidad-al-corriente')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D · Sin profesionales
// ---------------------------------------------------------------------------
describe('J.6 — Profesionales: el catálogo vacío ya no se queda en blanco', () => {
  afterEach(() => cleanup());

  it('catálogo sin profesionales públicos muestra una explicación', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irA('profesionales');
    const vacio = screen.getByTestId('portal-vacio-profesionales');
    expect(vacio.textContent).toMatch(/Todavía no hay profesionales en el catálogo/);
  });

  it('una búsqueda sin coincidencias se explica como filtro, no como ausencia', () => {
    renderPortal({
      inmuebles: [VIVIENDA],
      profesionales: [
        { ...PROF_PRIVADO, id: 'pub-1', esPrivado: false, creadoPorPropietarioId: undefined },
      ],
    });
    irA('profesionales');
    // Sin filtros, el profesional público aparece y no hay estado vacío.
    expect(screen.queryByTestId('portal-vacio-profesionales')).toBeNull();

    const buscador = document.querySelector(
      'input[placeholder*="uscar"]',
    ) as HTMLInputElement;
    fireEvent.change(buscador, { target: { value: 'zzzz-no-existe' } });

    const vacio = screen.getByTestId('portal-vacio-profesionales');
    expect(vacio.textContent).toMatch(/Ningún profesional coincide con tu búsqueda/);
  });
});

// ---------------------------------------------------------------------------
// Secciones NO tocadas: siguen teniendo su estado vacío correcto
// ---------------------------------------------------------------------------
describe('J.6 — las secciones ya correctas conservan su estado vacío', () => {
  afterEach(() => cleanup());

  it('Liquidaciones distingue «aún no tienes» sin inventar estados económicos', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irA('liquidaciones');
    expect(screen.getByText(/Aún no tienes liquidaciones/)).toBeTruthy();
  });

  it('Cobros no presenta la ausencia como un error', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irA('cobros');
    expect(screen.getByText(/No hay mensualidades generadas/)).toBeTruthy();
  });

  it('Incidencias mantiene su lectura positiva', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irA('incidencias');
    expect(screen.getByText(/No hay incidencias registradas/)).toBeTruthy();
  });

  it('Perfil NUNCA se presenta como vacío: es una ficha de datos', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irA('perfil');
    expect(screen.getByText(/Datos de Tu Cuenta/)).toBeTruthy();
    expect(screen.getByText(USUARIO.email)).toBeTruthy();
  });

  it('Viviendas conserva su CTA de alta cuando existe la acción real', () => {
    render(
      <PropietarioPortalSection
        currentUser={USUARIO}
        inmuebles={[]}
        profesionales={[]}
        contratos={[]}
        especialidades={[]}
        propietarios={PROPIETARIOS}
        gastos={[]}
        incidencias={[]}
        onOpenCrearProfesionalModal={() => undefined}
        onSaveProfesional={() => Promise.resolve()}
        onCrearInmueble={() => undefined}
      />,
    );
    expect(screen.getByText(/Dar de alta mi primera vivienda/)).toBeTruthy();
  });
});
