/**
 * BLOQUE 10 · UX-2 — COMPONENTES DE ESTADO DE DATOS Y `loadingMain` (C4).
 *
 * · `PuertaEstadoDatos`: carga / error accionable / contenido, sin confundirlos.
 * · `AvisoIncidenciasDatos`: fallos de lectura y de guardado visibles y descartables.
 * · `DashboardEjecutivoSection`: `loadingMain` (antes nunca alimentado por el host)
 *   muestra el esqueleto de carga en lugar del mensaje de «sin datos».
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { agruparIncidencias, AvisoIncidenciasDatos } from './AvisoIncidenciasDatos';
import { PuertaEstadoDatos } from './EstadoDatosPantalla';
import { DashboardEjecutivoSection } from '../sections/DashboardEjecutivoSection';
import {
  incidenciasDatos,
  reiniciarCanalIncidencias,
  reportarErrorGuardado,
  reportarErrorLectura,
} from '../../estadoDatos/canalIncidencias';

afterEach(() => cleanup());
beforeEach(() => reiniciarCanalIncidencias());

const SIN_DATOS = { estado: 'LISTO' as const, pendientes: [], conError: [] };

describe('UX-2 · PuertaEstadoDatos', () => {
  it('LISTO: muestra la sección real', () => {
    render(
      <PuertaEstadoDatos estado={SIN_DATOS} onReintentar={() => undefined}>
        <p data-testid="seccion">contenido real</p>
      </PuertaEstadoDatos>
    );
    expect(screen.getByTestId('seccion')).toBeTruthy();
    expect(screen.queryByTestId('estado-cargando')).toBeNull();
    expect(screen.queryByTestId('estado-error')).toBeNull();
  });

  it('CARGANDO: no renderiza la sección ni ningún mensaje de vacío', () => {
    render(
      <PuertaEstadoDatos
        estado={{ estado: 'CARGANDO', pendientes: ['inmuebles'], conError: [] }}
        onReintentar={() => undefined}
      >
        <p data-testid="seccion">contenido real</p>
      </PuertaEstadoDatos>
    );
    expect(screen.getByTestId('estado-cargando')).toBeTruthy();
    expect(screen.queryByTestId('seccion')).toBeNull();
    expect(screen.queryByText(/sin datos/i)).toBeNull();
  });

  it('ERROR: mensaje accionable con Reintentar y sin exponer la sección', () => {
    const reintentar = vi.fn();
    render(
      <PuertaEstadoDatos
        estado={{ estado: 'ERROR', pendientes: [], conError: ['inmuebles', 'contratos'] }}
        onReintentar={reintentar}
      >
        <p data-testid="seccion">contenido real</p>
      </PuertaEstadoDatos>
    );

    expect(screen.getByText('No se han podido cargar los datos')).toBeTruthy();
    expect(screen.getByText(/Afecta a: Inmuebles, Contratos/)).toBeTruthy();
    expect(screen.queryByTestId('seccion')).toBeNull();

    fireEvent.click(screen.getByText('Reintentar'));
    expect(reintentar).toHaveBeenCalledTimes(1);
  });

  it('ERROR: usa el mensaje de la incidencia (sin detalles técnicos)', () => {
    reportarErrorLectura('inmuebles', { code: 'permission-denied' });
    render(
      <PuertaEstadoDatos
        estado={{ estado: 'ERROR', pendientes: [], conError: ['inmuebles'] }}
        onReintentar={() => undefined}
      >
        <p>contenido</p>
      </PuertaEstadoDatos>
    );

    expect(screen.getByText(/No tienes permisos para consultar estos datos/i)).toBeTruthy();
    expect(screen.queryByText(/permission-denied|firestore/i)).toBeNull();
  });
});

describe('UX-2 · AvisoIncidenciasDatos', () => {
  it('sin incidencias no se muestra nada', () => {
    render(
      <AvisoIncidenciasDatos incidencias={[]} onDescartar={() => undefined} onDescartarTodas={() => undefined} />
    );
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
  });

  it('un fallo de guardado avisa de que hay cambios sin guardar', () => {
    reportarErrorGuardado('gastos', { code: 'unavailable' });
    const incidencias = Array.from(incidenciasDatos());

    render(
      <AvisoIncidenciasDatos
        incidencias={incidencias}
        onDescartar={() => undefined}
        onDescartarTodas={() => undefined}
      />
    );

    expect(screen.getByText(/Hay cambios que no se han podido guardar/)).toBeTruthy();
    expect(screen.getAllByText(/Gastos/).length).toBeGreaterThan(0);
    // Sin fallo de lectura no se ofrece reintentar la lectura.
    expect(screen.queryByText('Reintentar lectura')).toBeNull();
  });

  it('un fallo de lectura ofrece Reintentar lectura y descartar el aviso', () => {
    const reintentar = vi.fn();
    const descartar = vi.fn();
    reportarErrorLectura('contratos', { code: 'unavailable' });
    const incidencias = Array.from(incidenciasDatos());

    render(
      <AvisoIncidenciasDatos
        incidencias={incidencias}
        onReintentar={reintentar}
        onDescartar={descartar}
        onDescartarTodas={() => undefined}
      />
    );

    expect(screen.getByText(/No se han podido leer algunos datos/)).toBeTruthy();
    fireEvent.click(screen.getByText('Reintentar lectura'));
    expect(reintentar).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Descartar aviso de Contratos'));
    expect(descartar).toHaveBeenCalledWith(incidencias[0].id);
  });

  it('lectura y guardado a la vez se resumen en un único aviso', () => {
    reportarErrorLectura('inmuebles', { code: 'unavailable' });
    reportarErrorGuardado('gastos', { code: 'unavailable' });
    const incidencias = Array.from(incidenciasDatos());

    render(
      <AvisoIncidenciasDatos
        incidencias={incidencias}
        onReintentar={() => undefined}
        onDescartar={() => undefined}
        onDescartarTodas={() => undefined}
      />
    );

    expect(screen.getByText(/Hay cambios sin guardar y datos que no se pudieron leer/)).toBeTruthy();
    expect(screen.getByText(/Falló la lectura de: Inmuebles\./)).toBeTruthy();
    expect(screen.getByText(/Vuelve a intentar la operación/)).toBeTruthy();
  });
});

describe('2026-10-01 · AvisoIncidenciasDatos — capacidades adicionales (Carteras)', () => {
  const props = {
    onReintentar: () => undefined,
    onDescartar: () => undefined,
    onDescartarTodas: () => undefined,
  };

  it('el fallo de Carteras se avisa APARTE: nunca como error de carga de los datos', () => {
    const reintentarCapacidad = vi.fn();
    reportarErrorLectura('gestiones_cartera', { code: 'permission-denied' });
    const incidencias = Array.from(incidenciasDatos());

    // El agrupador lo clasifica como capacidad, no como lectura de datos.
    const grupos = agruparIncidencias(incidencias);
    expect(grupos.capacidad.map((i) => i.origen)).toEqual(['gestiones_cartera']);
    expect(grupos.lectura).toEqual([]);

    render(
      <AvisoIncidenciasDatos
        incidencias={incidencias}
        {...props}
        onReintentarCapacidad={reintentarCapacidad}
      />
    );

    expect(screen.getByTestId('aviso-capacidad-adicional')).toBeTruthy();
    expect(screen.getByText(/Carteras: no se han podido leer tus carteras ni delegaciones/)).toBeTruthy();
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
    expect(screen.queryByText(/No se han podido leer algunos datos/)).toBeNull();

    fireEvent.click(screen.getByText('Reintentar lectura'));
    expect(reintentarCapacidad).toHaveBeenCalledWith('gestiones_cartera');
  });

  it('si además falla un dato primario, cada aviso habla de lo suyo', () => {
    reportarErrorLectura('inmuebles', { code: 'unavailable' });
    reportarErrorLectura('gestiones_cartera', { code: 'permission-denied' });
    const incidencias = Array.from(incidenciasDatos());

    render(<AvisoIncidenciasDatos incidencias={incidencias} {...props} onReintentarCapacidad={() => undefined} />);

    // El aviso global sólo menciona los datos del Portal…
    expect(screen.getByText(/No se han podido leer algunos datos/)).toBeTruthy();
    expect(screen.getByText(/Falló la lectura de: Inmuebles\./)).toBeTruthy();
    expect(screen.queryByText(/Falló la lectura de:.*Carteras/)).toBeNull();
    // …y Carteras mantiene su mensaje específico.
    expect(screen.getAllByTestId('aviso-capacidad-adicional')).toHaveLength(1);
    expect(screen.getByText(/capacidad adicional/i)).toBeTruthy();
  });

  it('sin el reintento dirigido, el aviso de Carteras no ofrece un botón que no puede cumplir', () => {
    reportarErrorLectura('gestiones_cartera', { code: 'permission-denied' });
    render(<AvisoIncidenciasDatos incidencias={Array.from(incidenciasDatos())} {...props} />);

    expect(screen.getByTestId('aviso-capacidad-adicional')).toBeTruthy();
    expect(screen.queryByText('Reintentar lectura')).toBeNull();
  });
});

describe('UX-2 · C4 — loadingMain del Centro de Control (antes nunca alimentado)', () => {
  type PropsDashboard = React.ComponentProps<typeof DashboardEjecutivoSection>;
  // Props mínimas: el test sólo ejercita los estados globales de carga/vacío.
  const propsBase = {
    inmuebles: [],
    contratos: [],
    cobros: [],
    gastos: [],
    candidatos: [],
    propietarios: [],
    currentUser: null,
    onSelectSection: () => undefined,
  } as unknown as PropsDashboard;

  it('con loadingMain la pantalla muestra esqueleto de carga y NO «sin datos»', async () => {
    render(<DashboardEjecutivoSection {...propsBase} loadingMain />);

    // El esqueleto de los KPIs está presente y el mensaje de vacío no aparece:
    // mientras la lectura externa está pendiente no se afirma que no haya datos.
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sin datos suficientes/)).toBeNull();
  });

  it('sin loadingMain y sin datos se muestra el vacío explícito (no un cero sustituto)', async () => {
    render(<DashboardEjecutivoSection {...propsBase} />);

    expect(await screen.findByText(/Sin datos suficientes para el centro de control/)).toBeTruthy();
    expect(document.querySelectorAll('.animate-pulse').length).toBe(0);
  });

  it('el componente respeta el prop y el host lo alimenta con el estado real', () => {
    const componente = fs.readFileSync(
      path.resolve(__dirname, '../sections/DashboardEjecutivoSection.tsx'),
      'utf-8'
    );
    expect(componente).toContain('loadingMain = false');
    expect(componente).toContain('loadingMain || loadingOps');

    const host = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf-8');
    expect(host).toContain("loadingMain={estadoDePantalla('dashboard').estado === 'CARGANDO'}");
  });
});
