/**
 * IA · FASE 5 — PANEL DEL ASISTENTE EN EL PORTAL DEL INQUILINO (jsdom, sin red)
 * ============================================================================
 * Se prueba el COMPONENTE REAL con el CLIENTE REAL (`analizarIncidenciaInquilino`
 * → `solicitarIA`): sólo se sustituyen el token de sesión y `fetch`, sin red.
 * El panel no decide permisos ni seguridad: pinta lo que devuelve el servidor,
 * separa los tres planos, muestra la incertidumbre y los límites, y la
 * derivación sólo se envía cuando el inquilino pulsa el botón.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// El token de sesión no se pide a Firebase en pruebas (mismo contrato que en producción).
vi.mock('../../lib/busquedaTitularesServidor', () => ({
  tokenUsuarioActual: async () => 'token-de-prueba',
}));

import { AsistenteIncidenciaAsistida } from './AsistenteIncidenciaAsistida';
import { CABECERA_IDEMPOTENCIA_IA, PATRON_CLAVE_IDEMPOTENCIA_IA } from '../../ia/catalogoOperacionesIA';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function diagnostico(extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    naturaleza: 'ASISTENCIAL_ORIENTATIVO',
    categoria: 'FONTANERIA',
    urgencia: 'ALTA',
    senales: [],
    preguntas: [{ id: 'corte_agua_posible', pregunta: '¿Puedes cerrar la llave de paso?', motivo: 'Limita daños.' }],
    hipotesisTecnica: [
      { codigo: 'fuga', descripcion: 'Fuga localizada en un punto de la instalación.', indicios: ['Relato: gotea'], confirmada: false },
    ],
    medidasPreventivas: [{ codigo: 'cerrar', medida: 'Cierra la llave de paso si puedes hacerlo sin riesgo.', inmediata: true }],
    medidasProhibidas: [{ codigo: 'no_desmontar', advertencia: 'No desmontes tuberías ni sifones.' }],
    interpretacionClausulas: [
      {
        referencia: 'suministrosCargo',
        textoAutorizado: 'El contrato atribuye al arrendatario los suministros.',
        interpretacionOrientativa: 'Sirve como contexto, no decide la responsabilidad.',
      },
    ],
    decisionEconomica: {
      decide: 'PROPIETARIO_O_ADMINISTRACION',
      requiereAutorizacionPrevia: true,
      importeEstimadoPorLaIA: null,
      aviso: 'La decisión de autorizar la reparación corresponde a la propiedad o administración.',
    },
    incertidumbre: { nivel: 'MEDIA', motivos: ['No hay fotografías de la incidencia.'], requiereConfirmacionHumana: true },
    derivacion: { recomendada: true, destinos: ['PROFESIONAL', 'PROPIETARIO'], motivo: 'La valoración técnica corresponde a gestión.', urgente: false },
    limites: ['Es un análisis asistencial orientativo.', 'No atribuye responsabilidad legal ni contractual.'],
    ...extra,
  };
}

function respuestaOk(origen: 'DETERMINISTA' | 'PROVEEDOR' = 'PROVEEDOR', avisos: string[] = []) {
  return {
    ok: true,
    origenRespuesta: origen,
    avisos,
    alcance: { contratoId: 'contrato-1', inmuebleId: 'inm-1', incidenciaId: null },
    diagnostico: diagnostico(),
  };
}

function fetchDoble(cuerpo: unknown, status = 200, cabecerasExtra: Record<string, string> = {}) {
  const llamadas: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...cabecerasExtra } });
  }) as unknown as typeof fetch;
  return { llamadas, fetchImpl };
}

const DESCRIPCION = 'Gotea la tubería bajo el lavabo del baño desde ayer por la tarde.';

function pedirDiagnostico() {
  fireEvent.click(screen.getByRole('button', { name: /diagnóstico asistido/i }));
  fireEvent.change(screen.getByLabelText(/cuéntame qué ocurre/i), { target: { value: DESCRIPCION } });
  fireEvent.click(screen.getByRole('button', { name: /analizar incidencia/i }));
}

describe('Fase 5 · panel del asistente de incidencias', () => {
  it('envía el contrato, el token de sesión y una clave de idempotencia válida, y muestra los tres planos separados', async () => {
    const { llamadas, fetchImpl } = fetchDoble(respuestaOk());
    vi.stubGlobal('fetch', fetchImpl);

    render(<AsistenteIncidenciaAsistida contratoId="contrato-1" />);
    pedirDiagnostico();

    await waitFor(() => expect(screen.getByTestId('diagnostico-incidencia')).toBeTruthy());
    const [{ url, init }] = llamadas;
    expect(url).toBe('/api/asistente/incidencias-inquilino');
    expect(init.method).toBe('POST');
    const cabeceras = init.headers as Record<string, string>;
    expect(cabeceras.Authorization).toBe('Bearer token-de-prueba');
    expect(PATRON_CLAVE_IDEMPOTENCIA_IA.test(cabeceras[CABECERA_IDEMPOTENCIA_IA])).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({ contratoId: 'contrato-1', descripcion: DESCRIPCION });

    // Tres planos separados + incertidumbre + límites, tal como los devolvió el servidor.
    expect(screen.getByText(/hipótesis técnica \(a comprobar\)/i)).toBeTruthy();
    expect(screen.getByText(/lectura orientativa de tu contrato/i)).toBeTruthy();
    expect(screen.getByText(/quién decide/i)).toBeTruthy();
    expect(screen.getByText(/qué no sabe este análisis/i)).toBeTruthy();
    expect(screen.getByText(/no atribuye responsabilidad legal ni contractual/i)).toBeTruthy();
    expect(screen.getByText(/este asistente no estima importes/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /analizar con estas respuestas/i })).toBeTruthy();
    expect(screen.getByTestId('diagnostico-incidencia').getAttribute('data-origen')).toBe('PROVEEDOR');
  });

  it('el rechazo del servidor se explica en lenguaje de usuario y no muestra ningún diagnóstico', async () => {
    const { fetchImpl } = fetchDoble({ codigo: 'CUOTA_DIA_EXCEDIDA', error: 'límite superado' }, 429);
    vi.stubGlobal('fetch', fetchImpl);

    render(<AsistenteIncidenciaAsistida contratoId="contrato-1" />);
    pedirDiagnostico();

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/límite diario/i);
    // El código interno y el texto crudo del servidor no se muestran.
    expect(alerta.textContent).not.toContain('CUOTA_DIA_EXCEDIDA');
    expect(alerta.textContent).not.toContain('límite superado');
    expect(screen.queryByTestId('diagnostico-incidencia')).toBeNull();
  });

  it('sin llave propia registrada, el resultado avisa de que es análisis sin IA (sin pedir al inquilino que registre llave)', async () => {
    const { fetchImpl } = fetchDoble(respuestaOk('DETERMINISTA'), 200, { 'X-IA-Llave-Usuario': 'ausente' });
    vi.stubGlobal('fetch', fetchImpl);

    render(<AsistenteIncidenciaAsistida contratoId="contrato-1" />);
    pedirDiagnostico();

    const aviso = await screen.findByTestId('aviso-ia-no-conectada');
    expect(aviso.textContent).toMatch(/sin inteligencia artificial/i);
    expect(aviso.textContent).toMatch(/análisis por reglas/i);
    // El inquilino no registra llave: el aviso no le pide hacerlo.
    expect(aviso.textContent).not.toMatch(/llave|google ai studio|configuración/i);
    expect(screen.getByTestId('diagnostico-incidencia').getAttribute('data-origen')).toBe('DETERMINISTA');
  });

  it('con llave propia activa no aparece el aviso de IA no conectada', async () => {
    const { fetchImpl } = fetchDoble(respuestaOk('PROVEEDOR'), 200, { 'X-IA-Llave-Usuario': 'activa' });
    vi.stubGlobal('fetch', fetchImpl);

    render(<AsistenteIncidenciaAsistida contratoId="contrato-1" />);
    pedirDiagnostico();

    await waitFor(() => expect(screen.getByTestId('diagnostico-incidencia')).toBeTruthy());
    expect(screen.queryByTestId('aviso-ia-no-conectada')).toBeNull();
  });

  it('si el proveedor cae, se muestra el análisis determinista con su aviso (la pantalla no se rompe)', async () => {
    const { fetchImpl } = fetchDoble(
      respuestaOk('DETERMINISTA', ['El servicio de análisis avanzado no ha respondido: se aplica el análisis determinista del asistente.']),
    );
    vi.stubGlobal('fetch', fetchImpl);

    render(<AsistenteIncidenciaAsistida contratoId="contrato-1" />);
    pedirDiagnostico();

    const panel = await screen.findByTestId('diagnostico-incidencia');
    expect(panel.getAttribute('data-origen')).toBe('DETERMINISTA');
    expect(screen.getByText('Análisis determinista del asistente')).toBeTruthy();
    expect(screen.getByText(/no ha respondido/i)).toBeTruthy();
  });

  it('las respuestas aclaratorias se reenvían y la derivación sólo se solicita al pulsar el botón', async () => {
    const { llamadas, fetchImpl } = fetchDoble(respuestaOk());
    vi.stubGlobal('fetch', fetchImpl);
    const derivaciones: string[][] = [];

    render(
      <AsistenteIncidenciaAsistida
        contratoId="contrato-1"
        onSolicitarDerivacion={(destinos) => {
          derivaciones.push(destinos);
        }}
      />,
    );
    pedirDiagnostico();
    await screen.findByTestId('diagnostico-incidencia');

    // Reanálisis con la respuesta aclaratoria (misma operación, nueva clave).
    fireEvent.change(screen.getByLabelText(/¿puedes cerrar la llave de paso\?/i), { target: { value: 'Sí, la cerré anoche.' } });
    fireEvent.click(screen.getByRole('button', { name: /analizar con estas respuestas/i }));
    await waitFor(() => expect(llamadas).toHaveLength(2));
    expect(JSON.parse(String(llamadas[1].init.body))).toEqual({
      contratoId: 'contrato-1',
      descripcion: DESCRIPCION,
      respuestas: [{ preguntaId: 'corte_agua_posible', respuesta: 'Sí, la cerré anoche.' }],
    });
    expect(llamadas[1].init.headers as Record<string, string>).not.toEqual(llamadas[0].init.headers);

    // Nada se ha derivado por sí solo.
    expect(derivaciones).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: /derivar a gestión/i }));
    await waitFor(() => expect(derivaciones).toEqual([['PROFESIONAL', 'PROPIETARIO']]));
    await waitFor(() => expect(screen.getByRole('button', { name: /derivación solicitada/i })).toBeTruthy());
  });

  it('una descripción demasiado corta no permite lanzar el análisis (no gasta cuota)', () => {
    render(<AsistenteIncidenciaAsistida contratoId="contrato-1" />);
    fireEvent.click(screen.getByRole('button', { name: /diagnóstico asistido/i }));
    fireEvent.change(screen.getByLabelText(/cuéntame qué ocurre/i), { target: { value: 'Gotea' } });
    expect((screen.getByRole('button', { name: /analizar incidencia/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
