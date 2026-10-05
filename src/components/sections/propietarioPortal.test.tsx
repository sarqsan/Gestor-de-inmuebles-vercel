/**
 * @vitest-environment jsdom
 *
 * AUDITORÍA UX PROPIETARIO (2026-09-29) — Portal del propietario:
 * las tarjetas de vivienda muestran datos reales (precio/superficie y
 * titularidad) y el alta de vivienda es accesible desde «Mis Viviendas»
 * (cabecera y estado vacío) sin pasar por menús secundarios.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    nifCif: '12345678Z',
    tipoPropietario: 'persona_fisica',
    telefono: '600000000',
    email: 'ana@correo.test',
    direccion: 'Calle Real 5',
    ciudad: 'Sevilla',
    codigoPostal: '41001',
    cuentasBancarias: [],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
  },
];

const VIVIENDA: Inmueble = {
  id: 'inm-1',
  direccion: 'Calle Mayor 1',
  ciudad: 'Sevilla',
  tipo: 'piso',
  habitaciones: 2,
  banos: 1,
  superficie: 80,
  precio: 750,
  estado: 'alquilado',
  imagen: 'https://example.com/casa.jpg',
  descripcion: '',
  candidatosCount: 0,
  fianzaMeses: 1,
  propietarioId: 'P1',
  propietarioPrincipalId: 'P1',
  fechaCreacion: '2026-01-01',
  datosFiscales: {
    propietarioPrincipal: {
      nombre: 'Ana',
      nifDni: '12345678Z',
      direccion: 'Calle Real 5, Sevilla',
      propietarioId: 'P1',
    },
    tieneSegundoPropietario: true,
    segundoPropietario: {
      nombre: 'Luis',
      nifDni: '87654321X',
      direccion: 'Calle Otra 9, Sevilla',
    },
  },
} as Inmueble;

function renderPortal(
  opts: {
    inmuebles?: Inmueble[];
    onCrearInmueble?: () => void;
    incidencias?: any[];
    resumenMorosidad?: any[];
    liquidaciones?: any[];
  } = {},
) {
  return render(
    <PropietarioPortalSection
      currentUser={USUARIO}
      inmuebles={opts.inmuebles ?? []}
      profesionales={[]}
      contratos={[]}
      especialidades={[]}
      propietarios={PROPIETARIOS}
      gastos={[]}
      incidencias={opts.incidencias ?? []}
      resumenMorosidad={opts.resumenMorosidad}
      liquidaciones={opts.liquidaciones}
      onOpenCrearProfesionalModal={() => undefined}
      onSaveProfesional={() => Promise.resolve()}
      onCrearInmueble={opts.onCrearInmueble}
    />,
  );
}

/** Incidencia abierta del propietario, dentro de su cartera (J.2 — pendientes). */
const INCIDENCIA_ABIERTA = {
  id: 'inc-1',
  propietarioId: 'P1',
  inmuebleId: 'inm-1',
  titulo: 'Fuga en el baño',
  descripcion: 'Gotea el lavabo',
  categoria: 'FONTANERIA',
  prioridad: 'ALTA',
  estado: 'ABIERTA',
  origen: 'PROPIETARIO',
  fechaCreacion: '2026-02-01',
} as any;

/** Expediente de morosidad con saldo (espejo recortado del propietario). */
const MOROSIDAD_CON_SALDO = {
  id: 'exp-1',
  expedienteId: 'exp-1',
  propietarioId: 'P1',
  inmuebleId: 'inm-1',
  inmuebleDireccion: 'Calle Mayor 1',
  contratoId: 'c-1',
  periodoDesde: '2026-01',
  periodoHasta: '2026-02',
  numPeriodosImpagados: 2,
  importeTotalReclamado: 1500,
  importeCubierto: 0,
  saldoPendiente: 1500,
  estadoVisible: 'EN_GESTION',
  estadoEtiqueta: 'En gestión',
} as any;

function irAViviendas() {
  fireEvent.click(screen.getByRole('button', { name: /Mis Viviendas/i }));
}

describe('portal del propietario — tarjetas de vivienda (auditoría 2026-09-29)', () => {
  afterEach(() => cleanup());

  it('la lista de viviendas muestra precio real, superficie real y titularidad (y no campos inexistentes)', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irAViviendas();

    // Precio real formateado (bug detectado: antes usaba campos inexistentes → undefined)
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.getByText(/750\s*€\/mes/)).toBeTruthy();
    expect(screen.getByText(/80\s*m²/)).toBeTruthy();

    // H11 — la tarjeta nombra la FUENTE del dato: es la ficha fiscal, no una
    // titularidad registrada (antes decía «Titular:» y «(+1 cotitular)», que
    // afirmaban una cotitularidad patrimonial que el modelo no acredita).
    expect(screen.getByText(/Titular \(datos fiscales\):/)).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText(/\(\+1 en datos fiscales\)/)).toBeTruthy();
    expect(screen.queryByText(/\(\+1 cotitular\)/)).toBeNull();
  });

  it('la cabecera ofrece «Añadir vivienda» y lo conecta con el alta del ERP', () => {
    const onCrearInmueble = vi.fn();
    renderPortal({ inmuebles: [VIVIENDA], onCrearInmueble });
    irAViviendas();

    const boton = screen.getByRole('button', { name: /Añadir vivienda/i });
    expect(boton).toBeTruthy();
    fireEvent.click(boton);
    expect(onCrearInmueble).toHaveBeenCalledTimes(1);
  });

  it('el estado vacío explica la situación y ofrece el alta directamente', () => {
    const onCrearInmueble = vi.fn();
    renderPortal({ inmuebles: [], onCrearInmueble });
    irAViviendas();

    expect(screen.getByText(/No tienes viviendas asignadas/)).toBeTruthy();
    const cta = screen.getByRole('button', { name: /Dar de alta mi primera vivienda/i });
    fireEvent.click(cta);
    expect(onCrearInmueble).toHaveBeenCalledTimes(1);
  });

  it('sin onCrearInmueble los CTAs de alta no aparecen (montaje defensivo)', () => {
    renderPortal({ inmuebles: [] });
    irAViviendas();
    expect(screen.queryByRole('button', { name: /Dar de alta mi primera vivienda/i })).toBeNull();
  });
});

/**
 * F4b — disponibilidad dinámica de sub-tabs y panel de estado del Portal
 * Propietario. NO modifica el modelo: solo presentación. Las Rules y los
 * hooks `canAccess*` siguen siendo la autoridad.
 */
describe('F4b — Portal Propietario: sub-tabs según cartera', () => {
  afterEach(() => cleanup());

  it('sin cartera ni viviendas (Caso A) solo muestra Viviendas, Profesionales y Mi Perfil', () => {
    renderPortal({ inmuebles: [] });
    expect(
      screen.getByRole('button', { name: /^Mis Viviendas/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^Mis Profesionales/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^Mi Perfil/i }),
    ).toBeTruthy();
    // sub-tabs patrimoniales: NO presentes
    expect(
      screen.queryByRole('button', { name: /^Titulares/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Mis Contratos/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Mis Liquidaciones/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Morosidad/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Gastos/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Cobros/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /^Incidencias/i }),
    ).toBeNull();
    // El panel de estado explica la situación y ofrece CTA de alta
    expect(screen.getByTestId('portal-estado-patrimonial')).toBeTruthy();
    expect(screen.getByText(/Aún no tienes viviendas ni cartera/)).toBeTruthy();
  });

  it('con vivienda (Caso C) ya aparece Titulares / Titularidades', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    expect(
      screen.getByRole('button', { name: /^Titulares/i }),
    ).toBeTruthy();
    expect(screen.getByText(/Tienes una cartera patrimonial activa/)).toBeTruthy();
  });

  it('los paneles patrimoniales (cobros, gastos, liquidaciones, incidencias, morosidad, contratos) sólo se con cartera real', () => {
    const nombresPatrimoniales = ['Cobros', 'Gastos', 'Mis Liquidaciones', 'Incidencias', 'Morosidad', 'Mis Contratos'];
    // Caso A: sin cartera, no aparecen
    renderPortal({ inmuebles: [] });
    for (const n of nombresPatrimoniales) {
      expect(
        screen.queryByRole('button', { name: new RegExp('^' + n, 'i') }),
      ).toBeNull();
    }
    // Caso C: con vivienda, ya están todos
    cleanup();
    renderPortal({ inmuebles: [VIVIENDA] });
    for (const n of nombresPatrimoniales) {
      expect(
        screen.getByRole('button', { name: new RegExp('^' + n, 'i') }),
      ).toBeTruthy();
    }
  });
});

/**
 * J.1 — Portada del Portal Propietario.
 * La cabecera debe identificar el portal como espacio del propietario
 * ("Tu espacio patrimonial") y ofrecer un acceso único a la ayuda
 * contextual existente (capa §6). No modifica F4b ni las sub-tabs.
 */
describe('J.1 — Portal Propietario: portada y orientación', () => {
  afterEach(() => cleanup());

  it('muestra el subtítulo "Tu espacio patrimonial" derivado de los datos ya disponibles', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    const subtitulo = screen.getByTestId('portal-portada-subtitulo');
    expect(subtitulo).toBeTruthy();
    expect(subtitulo.textContent).toMatch(/Tu espacio patrimonial/);
    expect(subtitulo.textContent).toMatch(/1\s*vivienda/);
  });

  it('la cabecera incluye un acceso real a la ayuda contextual existente (ContextualHelp)', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    // El ContextualHelp se oculta solo si no hay entradas para el contexto.
    // Exigimos que SÍ aparezca: de lo contrario J.1 §9 sería un no-op silencioso.
    const botonAyuda = screen.getByRole('button', { name: /^Ayuda:/i });
    expect(botonAyuda).toBeTruthy();
    expect(botonAyuda.getAttribute('title')).toMatch(/Ayuda de esta pantalla/i);
  });

  it('el acceso a la ayuda abre el panel de la capa §6 ya existente (no un sistema nuevo)', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    const botonAyuda = screen.getByRole('button', { name: /^Ayuda:/i });
    expect(botonAyuda.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(botonAyuda);
    expect(botonAyuda.getAttribute('aria-expanded')).toBe('true');
    // El panel es el `role="dialog"` que ya implementa ContextualHelp.
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('el subtítulo se adapta al singular cuando hay una sola vivienda y a plural con varias', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    expect(screen.getByTestId('portal-portada-subtitulo').textContent).toMatch(/1\s*vivienda\b/);
    cleanup();
    const VIVIENDA_2 = { ...VIVIENDA, id: 'inm-2' };
    renderPortal({ inmuebles: [VIVIENDA, VIVIENDA_2] });
    expect(screen.getByTestId('portal-portada-subtitulo').textContent).toMatch(/2\s*viviendas/);
  });

  it('la portada no duplica la cabecera: el bloque F4b (panel-estado-patrimonial) sigue presente', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    // F4b intacto
    expect(screen.getByTestId('portal-estado-patrimonial')).toBeTruthy();
    expect(screen.getByText(/Tienes una cartera patrimonial activa/)).toBeTruthy();
  });
});

/**
 * J.2 — Portada patrimonial y navegación principal del Portal Propietario.
 * Verifica los cuatro niveles de la portada (identidad, resumen, pendientes,
 * acciones) y la agrupación conceptual de la navegación, sin tocar F4b.
 */
describe('J.2 — Portal Propietario: portada patrimonial', () => {
  afterEach(() => cleanup());

  it('sin viviendas NO muestra la portada patrimonial (evita contadores a cero)', () => {
    renderPortal({ inmuebles: [], onCrearInmueble: () => undefined });
    expect(screen.queryByTestId('portal-portada-patrimonial')).toBeNull();
    // El estado vacío de F4b sigue siendo la única llamada a la acción
    expect(screen.getByTestId('portal-estado-patrimonial')).toBeTruthy();
    expect(screen.getByTestId('portal-estado-vacio-cta')).toBeTruthy();
    expect(screen.getByText(/Aún no tienes viviendas ni cartera/)).toBeTruthy();
  });

  it('con viviendas muestra la portada con los cuatro indicadores reales', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    expect(screen.getByTestId('portal-portada-patrimonial')).toBeTruthy();
    // 1 vivienda, 0 contratos, 0 cobros por revisar, 0 incidencias abiertas
    expect(screen.getByTestId('portada-indicador-viviendas').textContent).toMatch(/1/);
    expect(screen.getByTestId('portada-indicador-contratos').textContent).toMatch(/0/);
    expect(screen.getByTestId('portada-indicador-cobros')).toBeTruthy();
    expect(screen.getByTestId('portada-indicador-incidencias')).toBeTruthy();
  });

  it('el indicador de viviendas refleja el número real y navega a Mis Viviendas', () => {
    const V2 = { ...VIVIENDA, id: 'inm-2' };
    renderPortal({ inmuebles: [VIVIENDA, V2] });
    const indicador = screen.getByTestId('portada-indicador-viviendas');
    expect(indicador.textContent).toMatch(/2/);
    expect(indicador.getAttribute('aria-label')).toMatch(/Ir a viviendas \(2\)/);
    fireEvent.click(indicador);
    // Al navegar, se ve el encabezado de la sub-vista de viviendas
    expect(screen.getByText(/Viviendas Asignadas a Tu Cuenta \(2\)/)).toBeTruthy();
  });

  it('sin nada pendiente muestra un estado positivo y NO una alerta vacía', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    expect(screen.getByTestId('portada-sin-pendientes')).toBeTruthy();
    expect(screen.getByText(/Todo al día/)).toBeTruthy();
    expect(screen.queryByTestId('portada-pendientes')).toBeNull();
  });

  it('con una incidencia abierta aparece en pendientes con dato real (no inventado)', () => {
    renderPortal({ inmuebles: [VIVIENDA], incidencias: [INCIDENCIA_ABIERTA] });
    expect(screen.queryByTestId('portada-sin-pendientes')).toBeNull();
    const pendiente = screen.getByTestId('portada-pendiente-incidencias');
    expect(pendiente.textContent).toMatch(/1 incidencia abierta/);
    // El indicador superior coincide con el pendiente (misma fuente de datos)
    expect(screen.getByTestId('portada-indicador-incidencias').textContent).toMatch(/1/);
  });

  it('un pendiente de morosidad aparece como alerta y navega a su sección', () => {
    renderPortal({ inmuebles: [VIVIENDA], resumenMorosidad: [MOROSIDAD_CON_SALDO] });
    const pendiente = screen.getByTestId('portada-pendiente-morosidad');
    expect(pendiente.textContent).toMatch(/1 expediente de impago con saldo pendiente/);
    fireEvent.click(pendiente);
    expect(screen.getByRole('button', { name: /^Morosidad/i }).getAttribute('aria-current')).toBe('page');
  });

  it('la portada no muestra IDs, nombres de colecciones ni estados internos', () => {
    renderPortal({
      inmuebles: [VIVIENDA],
      incidencias: [INCIDENCIA_ABIERTA],
      resumenMorosidad: [MOROSIDAD_CON_SALDO],
    });
    const portada = screen.getByTestId('portal-portada-patrimonial');
    const texto = portada.textContent || '';
    expect(texto).not.toMatch(/inm-1|exp-1|inc-1|P1|c-1/);
    expect(texto).not.toMatch(/EN_GESTION|ABIERTA|FONTANERIA|propietarioId|inmuebleId/);
    expect(texto).not.toMatch(/undefined|null|NaN/);
  });

  it('ofrece pocas acciones principales y no duplica la navegación completa', () => {
    renderPortal({ inmuebles: [VIVIENDA], onCrearInmueble: () => undefined });
    const acciones = screen.getByTestId('portada-acciones');
    const botones = acciones.querySelectorAll('button');
    expect(botones.length).toBeLessThanOrEqual(4);
    expect(screen.getByRole('button', { name: /Ver viviendas/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Consultar contratos/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Revisar liquidaciones/i })).toBeTruthy();
  });
});

describe('J.2 — Portal Propietario: navegación agrupada', () => {
  afterEach(() => cleanup());

  it('agrupa la navegación por áreas del propietario, no por módulos del ERP', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    expect(screen.getByTestId('portal-grupo-patrimonio').textContent).toMatch(/Mi patrimonio/);
    expect(screen.getByTestId('portal-grupo-gestion').textContent).toMatch(/Mi gestión/);
    expect(screen.getByTestId('portal-grupo-seguimiento').textContent).toMatch(/Seguimiento/);
    expect(screen.getByTestId('portal-grupo-cuenta').textContent).toMatch(/Mi cuenta/);
  });

  it('conserva las 10 pestañas de F4b: no se elimina ninguna capacidad', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    for (const n of [
      'Mis Viviendas',
      'Titulares / Titularidades',
      'Mis Contratos',
      'Mis Liquidaciones',
      'Cobros',
      'Gastos',
      'Incidencias',
      'Mis Profesionales',
      'Morosidad',
      'Mi Perfil',
    ]) {
      expect(
        screen.getByRole('button', { name: new RegExp('^' + n.replace(/[/]/g, '\\/'), 'i') }),
      ).toBeTruthy();
    }
  });

  it('sin cartera sólo quedan los grupos con pestañas disponibles (F4b intacto)', () => {
    renderPortal({ inmuebles: [] });
    // Viviendas (patrimonio), Profesionales (seguimiento) y Perfil (cuenta)
    expect(screen.getByTestId('portal-grupo-patrimonio')).toBeTruthy();
    expect(screen.getByTestId('portal-grupo-seguimiento')).toBeTruthy();
    expect(screen.getByTestId('portal-grupo-cuenta')).toBeTruthy();
    // «Mi gestión» no tiene ninguna pestaña disponible → no se pinta el grupo
    expect(screen.queryByTestId('portal-grupo-gestion')).toBeNull();
  });

  it('marca la pestaña activa con aria-current para lectores de pantalla', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    const viviendas = screen.getByRole('button', { name: /^Mis Viviendas/i });
    expect(viviendas.getAttribute('aria-current')).toBe('page');
    const contratos = screen.getByRole('button', { name: /^Mis Contratos/i });
    expect(contratos.getAttribute('aria-current')).toBeNull();
    fireEvent.click(contratos);
    expect(contratos.getAttribute('aria-current')).toBe('page');
  });
});

/**
 * J.4 — Ayuda contextual del Portal Propietario.
 * La ayuda debe seguir al área activa (no quedarse fija en 'propietarios') y
 * reutilizar el registro existente sin crear una segunda infraestructura.
 */
describe('J.4 — Portal Propietario: ayuda contextual por área', () => {
  afterEach(() => cleanup());

  /** Título de la ayuda principal expuesto por ContextualHelp en su aria-label. */
  function tituloAyuda(): string {
    const boton = screen.getByRole('button', { name: /^Ayuda:/i });
    return boton.getAttribute('aria-label') || '';
  }

  it('en «Mis Viviendas» la ayuda es la del inmueble, no la genérica de titulares', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    fireEvent.click(screen.getByRole('button', { name: /^Mis Viviendas/i }));
    expect(tituloAyuda()).toMatch(/Ficha del inmueble/i);
  });

  it('en «Mis Liquidaciones» ofrece la ayuda propia del propietario', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    fireEvent.click(screen.getByRole('button', { name: /^Mis Liquidaciones/i }));
    expect(tituloAyuda()).toMatch(/Mis liquidaciones/i);
  });

  it('en «Mis Contratos» ofrece la ayuda de formalización', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    fireEvent.click(screen.getByRole('button', { name: /^Mis Contratos/i }));
    expect(tituloAyuda()).toMatch(/Formalizaci/i);
  });

  it('en «Cobros» e «Incidencias» la ayuda cambia con el área', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    fireEvent.click(screen.getByRole('button', { name: /^Cobros/i }));
    expect(tituloAyuda()).toMatch(/cobros/i);
    fireEvent.click(screen.getByRole('button', { name: /^Incidencias/i }));
    expect(tituloAyuda()).toMatch(/incidencia/i);
  });

  it('en «Titulares / Titularidades» usa la ayuda específica del propietario', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    fireEvent.click(screen.getByRole('button', { name: /^Titulares/i }));
    expect(tituloAyuda()).toMatch(/tus fichas de titular/i);
  });

  it('en áreas sin ayuda propia (Gastos) recurre a la general sin desaparecer', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    fireEvent.click(screen.getByRole('button', { name: /^Gastos/i }));
    // Morosidad/Gastos no tienen ayuda visible para PROPIETARIO: se usa la general
    expect(screen.getByRole('button', { name: /^Ayuda:/i })).toBeTruthy();
    expect(tituloAyuda()).toMatch(/Titulares|Carteras/i);
  });

  it('la ayuda no bloquea la navegación: se abre, se cierra y las pestañas siguen activas', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    const boton = screen.getByRole('button', { name: /^Ayuda:/i });
    fireEvent.click(boton);
    expect(screen.getByRole('dialog')).toBeTruthy();
    // Con el panel abierto se puede seguir navegando
    fireEvent.click(screen.getByRole('button', { name: /^Mis Contratos/i }));
    expect(
      screen.getByRole('button', { name: /^Mis Contratos/i }).getAttribute('aria-current'),
    ).toBe('page');
    // Y se puede cerrar
    fireEvent.click(screen.getByRole('button', { name: /^Ayuda:/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hay un ÚNICO punto de ayuda: no se ha creado una segunda infraestructura', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    expect(screen.queryAllByRole('button', { name: /^Ayuda:/i }).length).toBe(1);
  });

  it('sin viviendas la ayuda convive con el CTA de alta sin desplazarlo', () => {
    renderPortal({ inmuebles: [], onCrearInmueble: () => undefined });
    expect(screen.getByRole('button', { name: /^Ayuda:/i })).toBeTruthy();
    expect(screen.getByTestId('portal-estado-vacio-cta')).toBeTruthy();
    expect(screen.getByText(/Aún no tienes viviendas ni cartera/)).toBeTruthy();
  });
});
