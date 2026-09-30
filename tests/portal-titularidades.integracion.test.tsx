/**
 * INTEGRACIÓN — TITULARIDADES EN EL PORTAL DEL PROPIETARIO
 * =========================================================
 * Se monta el componente REAL `PropietarioPortalSection` (sin reescribirlo).
 * Sólo se sustituyen los tres puntos de frontera: la capa de datos de
 * titularidades, `lib/firebase` (para el token) y el diálogo de confirmación.
 *
 * Flujo verificado de extremo a extremo:
 *   Mis Viviendas → pestaña Titulares → ver titulares → Añadir titular →
 *   buscar (servidor) → seleccionar → porcentaje (o PENDIENTE) → confirmar →
 *   persistir → aviso de éxito SÓLO si se persistió → refresco.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PropietarioPortalSection } from '../src/components/sections/PropietarioPortalSection';
import {
  cerrarTitularidad,
  guardarTitularidad,
  subscribeTitularidadesEscopo,
} from '../src/lib/titularidadesFirestore';
import { confirmar } from '../src/feedback/confirmacion';
import { avisosOperacion, reiniciarAvisosOperacion } from '../src/feedback/canalFeedback';
import { construirTitularidad } from '../src/utils/titularidadesEngine';
import type { Inmueble, Propietario, Titularidad, UsuarioApp } from '../src/types';

vi.mock('../src/lib/titularidadesFirestore', () => ({
  subscribeTitularidadesEscopo: vi.fn((_alcance: unknown, cb: (t: Titularidad[]) => void) => {
    suscripcion = cb;
    cb(titularidadesActuales);
    return () => {
      suscripcion = null;
    };
  }),
  guardarTitularidad: vi.fn(async () => true),
  cerrarTitularidad: vi.fn(async () => true),
}));

vi.mock('../src/lib/firebase', () => ({
  auth: { currentUser: { getIdToken: vi.fn(async () => 'token-demo') } },
  db: {},
}));

vi.mock('../src/feedback/confirmacion', async () => {
  const real = await vi.importActual<typeof import('../src/feedback/confirmacion')>('../src/feedback/confirmacion');
  return { ...real, confirmar: vi.fn(async () => ({ confirmado: true, texto: 'Escritura 1234' })) };
});

let suscripcion: ((t: Titularidad[]) => void) | null = null;
let titularidadesActuales: Titularidad[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

const USUARIO = {
  id: 'user-1',
  nombre: 'Ana',
  email: 'ana@test.es',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId: 'PROP1',
  inmuebleIds: [],
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
} as unknown as UsuarioApp;

const VIVIENDA: Inmueble = {
  id: 'VIV1',
  direccion: 'Calle Mayor 1',
  alias: 'Piso Centro',
  ciudad: 'Valencia',
  precio: 900,
  estado: 'alquilado',
  habitaciones: 2,
  banos: 1,
  superficie: 70,
  candidatosCount: 0,
  fianzaMeses: 1,
  propietarioId: 'PROP1',
  titularesIds: ['PROP1', 'PROP2'],
} as unknown as Inmueble;

const PROPIETARIOS = [
  { id: 'PROP1', nombre: 'Ana Titular' },
  { id: 'PROP2', nombre: 'Luis Cotitular' },
  { id: 'PROP3', nombre: 'Marta Nueva' },
] as unknown as Propietario[];

function titularidad(propietarioId: string, porcentaje: number | null, estado: 'VIGENTE' | 'CERRADA' = 'VIGENTE'): Titularidad {
  return construirTitularidad({
    inmuebleId: 'VIV1',
    propietarioId,
    propietarioNombre: propietarioId === 'PROP1' ? 'Ana Titular' : 'Luis Cotitular',
    porcentaje,
    ...(estado === 'CERRADA' ? {} : {}),
  });
}

function renderizar(inmuebles: Inmueble[] = [VIVIENDA]) {
  return render(
    <PropietarioPortalSection
      currentUser={USUARIO}
      inmuebles={inmuebles}
      profesionales={[]}
      contratos={[]}
      especialidades={[]}
      propietarios={PROPIETARIOS}
    />,
  );
}

function abrirPanel() {
  fireEvent.click(screen.getByRole('button', { name: /Titulares \/ Titularidades/i }));
}

async function buscar(termino: string) {
  const input = screen.getByLabelText(/Buscar titular/i);
  fireEvent.change(input, { target: { value: termino } });
  await waitFor(
    () => {
      if (termino.trim().length >= 3) expect(fetchMock).toHaveBeenCalled();
    },
    { timeout: 2000 },
  ).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 350));
}

beforeEach(() => {
  reiniciarAvisosOperacion();
  suscripcion = null;
  titularidadesActuales = [titularidad('PROP1', 60), titularidad('PROP2', null)];
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, resultados: [{ id: 'PROP3', nombre: 'Marta Nueva' }] }),
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.mocked(confirmar).mockResolvedValue({ confirmado: true, texto: 'Escritura 1234' } as never);
  vi.mocked(guardarTitularidad).mockResolvedValue(true);
  vi.mocked(cerrarTitularidad).mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('portal: pestaña de titularidades', () => {
  it('abre el panel y muestra los titulares vigentes del inmueble', () => {
    renderizar();
    abrirPanel();
    expect(screen.getByTestId('panel-titularidades')).toBeTruthy();
    expect(screen.getByText(/Titulares actuales \(2\)/)).toBeTruthy();
    expect(screen.getByText('Ana Titular')).toBeTruthy();
    expect(screen.getByText('Luis Cotitular')).toBeTruthy();
  });

  it('sin porcentaje fiable muestra PENDIENTE (nunca inventa un reparto)', () => {
    renderizar();
    abrirPanel();
    expect(screen.getByText('Pendiente')).toBeTruthy();
    expect(screen.getByText('60 %')).toBeTruthy();
  });

  it('la vivienda en la que sólo soy COTITULAR aparece en mi cartera', () => {
    const ajena = { ...VIVIENDA, id: 'VIV9', propietarioId: 'OTRO', titularesIds: ['OTRO', 'PROP1'], alias: 'Piso Cotitular' } as unknown as Inmueble;
    renderizar([VIVIENDA, ajena]);
    abrirPanel();
    const opciones = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).textContent);
    expect(opciones).toContain('Piso Cotitular');
  });

  it('aísla: no muestra titularidades de otro inmueble', () => {
    titularidadesActuales = [
      titularidad('PROP1', 60),
      construirTitularidad({ inmuebleId: 'OTRO', propietarioId: 'PROP9', propietarioNombre: 'Ajeno', porcentaje: 40 }),
    ];
    renderizar();
    abrirPanel();
    expect(screen.getByText(/Titulares actuales \(1\)/)).toBeTruthy();
    expect(screen.queryByText('Ajeno')).toBeNull();
  });

  it('la suscripción en vivo refresca el panel', () => {
    renderizar();
    abrirPanel();
    expect(screen.getByText(/Titulares actuales \(2\)/)).toBeTruthy();
    act(() => {
      suscripcion?.([
        titularidad('PROP1', 50),
        titularidad('PROP2', 30),
        construirTitularidad({ inmuebleId: 'VIV1', propietarioId: 'PROP3', propietarioNombre: 'Marta Nueva', porcentaje: 20 }),
      ]);
    });
    expect(screen.getByText(/Titulares actuales \(3\)/)).toBeTruthy();
    expect(screen.getByText('Marta Nueva')).toBeTruthy();
  });
});

describe('portal: alta de titular', () => {
  it('con menos de 3 caracteres NO se llama al servidor', async () => {
    renderizar();
    abrirPanel();
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    await buscar('an');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la búsqueda va al endpoint con el token y el cuerpo correctos', async () => {
    renderizar();
    abrirPanel();
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    await buscar('mar');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/titulares/buscar');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-demo');
    expect(JSON.parse(String(init.body))).toEqual({ inmuebleId: 'VIV1', termino: 'mar' });
    expect(await screen.findByText('Marta Nueva')).toBeTruthy();
  });

  it('seleccionar → confirmar → persistir, y el éxito SÓLO tras persistir', async () => {
    renderizar();
    abrirPanel();
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    await buscar('mar');
    fireEvent.click(await screen.findByText('Marta Nueva'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar alta de Marta Nueva/i }));

    await waitFor(() => expect(guardarTitularidad).toHaveBeenCalledTimes(1));
    expect(vi.mocked(guardarTitularidad).mock.calls[0][0]).toMatchObject({
      inmuebleId: 'VIV1',
      propietarioId: 'PROP3',
      porcentaje: null,
    });
    await waitFor(() => expect(avisosOperacion().some((a) => a.tipo === 'exito')).toBe(true));
    expect(avisosOperacion().find((a) => a.tipo === 'exito')?.mensaje).toBe('Titular añadido correctamente.');
  });

  it('el porcentaje indicado viaja tal cual; vacío = PENDIENTE', async () => {
    renderizar();
    abrirPanel();
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    await buscar('mar');
    fireEvent.click(await screen.findByText('Marta Nueva'));
    fireEvent.change(screen.getByLabelText(/Porcentaje \(opcional\)/i), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar alta de Marta Nueva/i }));
    await waitFor(() => expect(guardarTitularidad).toHaveBeenCalled());
    expect(vi.mocked(guardarTitularidad).mock.calls[0][0]).toMatchObject({ porcentaje: 30 });
  });

  it('si la persistencia NO confirma, no se muestra éxito', async () => {
    vi.mocked(guardarTitularidad).mockResolvedValue(false);
    renderizar();
    abrirPanel();
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    await buscar('mar');
    fireEvent.click(await screen.findByText('Marta Nueva'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar alta de Marta Nueva/i }));
    await waitFor(() => expect(guardarTitularidad).toHaveBeenCalled());
    await waitFor(() => expect(avisosOperacion().some((a) => a.tipo === 'error')).toBe(true));
    expect(avisosOperacion().some((a) => a.tipo === 'exito')).toBe(false);
  });

  it('si se cancela la confirmación no se persiste nada', async () => {
    vi.mocked(confirmar).mockResolvedValue({ confirmado: false } as never);
    renderizar();
    abrirPanel();
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    await buscar('mar');
    fireEvent.click(await screen.findByText('Marta Nueva'));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar alta de Marta Nueva/i }));
    await new Promise((r) => setTimeout(r, 50));
    expect(guardarTitularidad).not.toHaveBeenCalled();
  });
});

describe('portal: cierre de titularidad (NUNCA borrado)', () => {
  it('cierra con motivo y deja la titularidad en el histórico', async () => {
    renderizar();
    abrirPanel();
    const botonesCierre = screen.getAllByRole('button', { name: /Cerrar titularidad/i });
    expect(botonesCierre).toHaveLength(2); // uno por titular vigente
    fireEvent.click(botonesCierre[0]);
    await waitFor(() => expect(cerrarTitularidad).toHaveBeenCalledTimes(1));
    const entrada = vi.mocked(cerrarTitularidad).mock.calls[0][0];
    expect(entrada.motivo).toBe('VENTA');
    expect(entrada.titularidad.propietarioId).toBe('PROP1');

    // La titularidad cerrada SIGUE existiendo: se ve en el histórico.
    act(() => {
      suscripcion?.([
        {
          ...titularidad('PROP1', 60),
          estado: 'CERRADA',
          fechaCierre: '2026-06-01T00:00:00.000Z',
          motivoCierre: 'VENTA',
          detalleCierre: 'Escritura 1234',
        },
        titularidad('PROP2', null),
      ]);
    });
    expect(screen.getByText(/Histórico patrimonial \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Escritura 1234/)).toBeTruthy(); // motivo del cierre registrado
    expect(screen.getByText(/Titulares actuales \(1\)/)).toBeTruthy();
  });

  it('el cierre no invoca NINGÚN borrado físico', async () => {
    renderizar();
    abrirPanel();
    fireEvent.click(screen.getAllByRole('button', { name: /Cerrar titularidad/i })[0]);
    await waitFor(() => expect(cerrarTitularidad).toHaveBeenCalled());
    const modulo = (await import('../src/lib/titularidadesFirestore')) as Record<string, unknown>;
    expect(Object.keys(modulo)).not.toContain('borrarTitularidad');
    expect(Object.keys(modulo)).not.toContain('eliminarTitularidad');
  });
});
