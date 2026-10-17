/**
 * IA · FASE 2 — PANEL DE ADMINISTRACIÓN (jsdom, sin red)
 * ======================================================
 * El panel se prueba con `fetchImpl` y `obtenerToken` inyectados: consulta el
 * resumen con la política (y su estado PENDIENTE DE APROBACIÓN), busca la
 * cuenta de un uid y ejecuta bloqueo y movimiento de saldo con su
 * `Idempotency-Key`. El panel nunca decide permisos: sólo muestra lo que el
 * servidor autoriza.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PanelGobiernoIA } from './PanelGobiernoIA';
import { CABECERA_IDEMPOTENCIA_IA } from '../../ia/catalogoOperacionesIA';

afterEach(() => cleanup());

const RESUMEN = {
  gobierno: { modo: 'FIRESTORE' },
  politica: {
    version: 1,
    origen: 'POR_DEFECTO',
    // FASE 7 · sin política declarada: nada completo, cuotas finitas de referencia y
    // ningún perfil con permisos (el comodín ya no existe).
    pendienteAprobacionComercial: true,
    politicaCompleta: false,
    cuotas: { operacionesPorDia: 20, operacionesPorMes: 200 },
    costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 0 },
    perfilesPorOperacion: { REDACTAR_CLAUSULA: [] },
  },
  operacionesRecientes: [
    {
      id: 'iaop_1', uid: 'uid-ana', uidTitular: 'owner-ana', propietarioId: 'prop-ana', operacion: 'REDACTAR_CLAUSULA', estado: 'COMPLETADA',
      codigoHttp: 200, origenRespuesta: 'PROVEEDOR', iniciadaEn: '2026-10-15T10:00:00.000Z',
      tokensTotales: 120, costeCreditos: 0,
    },
  ],
};

const CUENTA = {
  uid: 'uid-ana',
  cuenta: {
    version: 1, uid: 'uid-ana', saldoCreditos: 25, bloqueada: false,
    ventanaDiaClave: '2026-10-15', ventanaDiaUsos: 2, ventanaMesClave: '2026-10', ventanaMesUsos: 7,
    totalOperaciones: 7, totalCreditosConsumidos: 0, actualizadoEn: '2026-10-15T10:00:00.000Z',
  },
  operaciones: RESUMEN.operacionesRecientes,
  ajustes: [{ id: 'iaadj_1', tipo: 'CREDITO', uidDestino: 'uid-ana', uidAdmin: 'uid-admin', creditos: 25, motivo: 'pack inicial', estado: 'APLICADO', creadoEn: '2026-10-14T09:00:00.000Z' }],
};

function fetchDoble(rutas: Record<string, (url: string, init?: RequestInit) => unknown>) {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    llamadas.push({ url, init });
    for (const [prefijo, responder] of Object.entries(rutas)) {
      if (url.includes(prefijo)) {
        const cuerpo = responder(url, init);
        const ok = !((cuerpo as { status?: number }).status && (cuerpo as { status: number }).status >= 400);
        return {
          ok,
          status: (cuerpo as { status?: number }).status ?? 200,
          json: async () => cuerpo,
        };
      }
    }
    return { ok: false, status: 404, json: async () => ({ error: 'no', codigo: 'NO' }) };
  }) as unknown as typeof fetch;
  return { fetchImpl, llamadas };
}

const opciones = (fetchImpl: typeof fetch): { fetchImpl: typeof fetch; obtenerToken: () => Promise<string> } => ({
  fetchImpl,
  obtenerToken: async () => 'token-admin',
});

describe('PanelGobiernoIA · consulta', () => {
  it('muestra el resumen con la política, el aviso de tarifas pendientes y las operaciones recientes', async () => {
    const { fetchImpl } = fetchDoble({ '/api/ia/admin/resumen': () => RESUMEN });
    render(<PanelGobiernoIA opciones={opciones(fetchImpl)} />);
    await waitFor(() => expect(screen.getByTestId('panel-gobierno-ia')).toBeTruthy());
    expect(await screen.findByText(/gobierno: FIRESTORE/)).toBeTruthy();
    expect(screen.getByTestId('badge-pendiente').textContent).toContain('Política INCOMPLETA');
    expect(screen.queryByTestId('badge-completa')).toBeNull();
    // FASE 7 · cuotas FINITAS a la vista: nunca «sin límite».
    expect(screen.getByText('20 / 200')).toBeTruthy();
    expect(screen.getByText(/0 de 4/)).toBeTruthy();
    expect(screen.queryByText(/sin límite/)).toBeNull();
    expect(screen.getByText(/uid-ana/)).toBeTruthy();
    expect(screen.getByText('Actor UID')).toBeTruthy();
    expect(screen.getByText('Titular UID')).toBeTruthy();
    expect(screen.getByText('owner-ana')).toBeTruthy();
    expect(screen.getByText('REDACTAR_CLAUSULA')).toBeTruthy();
  });

  it('FASE 7 · con política declarada y completa el panel lo certifica (sin badge de pendiente)', async () => {
    const completa = {
      ...RESUMEN,
      politica: {
        ...RESUMEN.politica,
        origen: 'ENTORNO',
        pendienteAprobacionComercial: false,
        politicaCompleta: true,
        costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2, ASISTENTE_INCIDENCIAS_INQUILINO: 2 },
        perfilesPorOperacion: {
          REDACTAR_CLAUSULA: ['ADMINISTRADOR'],
          ASISTENTE_INCIDENCIAS_INQUILINO: ['INQUILINO'],
        },
      },
    };
    const { fetchImpl } = fetchDoble({ '/api/ia/admin/resumen': () => completa });
    render(<PanelGobiernoIA opciones={opciones(fetchImpl)} />);
    await waitFor(() => expect(screen.getByTestId('badge-completa')).toBeTruthy());
    expect(screen.queryByTestId('badge-pendiente')).toBeNull();
    expect(screen.getByTestId('badge-completa').textContent).toContain('permisos explícitos');
    expect(screen.getByText(/2 de 4/)).toBeTruthy();
  });

  it('sin permiso (403) muestra el error del servidor y no inventa datos', async () => {
    const { fetchImpl } = fetchDoble({ '/api/ia/admin/resumen': () => ({ status: 403, error: 'Esta consulta requiere un perfil ADMINISTRADOR.', codigo: 'NO_ADMINISTRADOR' }) });
    render(<PanelGobiernoIA opciones={opciones(fetchImpl)} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('ADMINISTRADOR'));
  });
});

describe('PanelGobiernoIA · cuenta y acciones', () => {
  async function montarConCuenta() {
    let bloqueada = false;
    let saldo = 25;
    const { fetchImpl, llamadas } = fetchDoble({
      '/api/ia/admin/resumen': () => RESUMEN,
      '/api/ia/admin/cuenta/uid-ana': () => ({
        ...CUENTA,
        cuenta: { ...CUENTA.cuenta, saldoCreditos: saldo, bloqueada: bloqueada, motivoBloqueo: bloqueada ? 'abuso' : undefined },
      }),
      '/bloqueo': () => { bloqueada = true; return { estado: 'APLICADO', uid: 'uid-ana' }; },
      '/credito': (_url: string, init?: RequestInit) => {
        const cuerpo = JSON.parse(String(init?.body)) as { creditos: number };
        saldo += cuerpo.creditos;
        return { estado: 'APLICADO', uid: 'uid-ana', creditos: cuerpo.creditos };
      },
    });
    render(<PanelGobiernoIA opciones={opciones(fetchImpl)} />);
    fireEvent.change(await screen.findByTestId('entrada-uid'), { target: { value: 'uid-ana' } });
    fireEvent.click(screen.getByTestId('boton-buscar'));
    await waitFor(() => expect(screen.getByTestId('cuenta-usuario')).toBeTruthy());
    return { llamadas };
  }

  it('consulta la cuenta de un uid y muestra saldo, uso y ajustes', async () => {
    await montarConCuenta();
    const bloque = within(screen.getByTestId('cuenta-usuario'));
    expect(bloque.getByText('25')).toBeTruthy();
    expect(bloque.getByText(/7 ops · 0 créditos/)).toBeTruthy();
    expect(screen.getByText(/pack inicial/)).toBeTruthy();
  });

  it('bloquear envía la acción con Idempotency-Key y motivo, y refresca la cuenta', async () => {
    const { llamadas } = await montarConCuenta();
    fireEvent.change(screen.getByTestId('entrada-uid'), { target: { value: 'uid-ana' } }); // ya consultada
    fireEvent.click(screen.getByTestId('boton-bloquear'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('bloqueada'));
    const postBloqueo = llamadas.find((l) => l.url.includes('/bloqueo'));
    expect(postBloqueo).toBeTruthy();
    const cabeceras = postBloqueo!.init?.headers as Record<string, string>;
    expect(cabeceras[CABECERA_IDEMPOTENCIA_IA]).toMatch(/^[A-Za-z0-9_\-:.]{8,128}$/);
    expect(cabeceras.Authorization).toBe('Bearer token-admin');
    expect(JSON.parse(String(postBloqueo!.init?.body))).toMatchObject({ bloqueado: true });
  });

  it('mover saldo valida el importe en el panel y envía el crédito explícito', async () => {
    const { llamadas } = await montarConCuenta();
    fireEvent.change(screen.getByTestId('entrada-creditos'), { target: { value: '-5' } });
    fireEvent.click(screen.getByTestId('boton-credito'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('5'));
    const postCredito = llamadas.find((l) => l.url.includes('/credito'));
    expect(JSON.parse(String(postCredito!.init?.body))).toMatchObject({ creditos: -5 });
  });

  it('un importe no entero no sale del panel', async () => {
    await montarConCuenta();
    fireEvent.change(screen.getByTestId('entrada-creditos'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByTestId('boton-credito'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('entero'));
  });
});
