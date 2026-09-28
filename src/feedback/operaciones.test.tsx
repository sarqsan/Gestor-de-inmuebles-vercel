/**
 * BLOQUE 10 · UX-3 — RESULTADO REAL DE LAS OPERACIONES (comportamiento).
 *
 * Regla de la orden (§6): una acción no muestra éxito hasta que el resultado real lo
 * confirma. Nunca hay éxito si la acción lanza o si el contrato booleano B5 devuelve
 * `false` o si la persistencia registró un fallo. El doble envío se bloquea.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { avisosOperacion, reiniciarAvisosOperacion } from './canalFeedback';
import { ejecutarOperacion, useOperacionEnCurso } from './operaciones';
import {
  reiniciarCanalIncidencias,
  reportarErrorGuardado,
} from '../estadoDatos/canalIncidencias';

beforeEach(() => {
  reiniciarAvisosOperacion();
  reiniciarCanalIncidencias();
});
afterEach(() => cleanup());

const mensajes = (tipo: 'exito' | 'error') =>
  avisosOperacion()
    .filter((a) => a.tipo === tipo)
    .map((a) => a.mensaje);

describe('UX-3 · ejecutarOperacion', () => {
  it('acción correcta: éxito y aviso visible', async () => {
    const resultado = await ejecutarOperacion({
      accion: async () => 'ok',
      mensajeExito: 'Inmueble guardado correctamente.',
      mensajeError: 'No se ha podido guardar el inmueble.',
      origenesDatos: ['inmuebles'],
    });

    expect(resultado.ok).toBe(true);
    expect(mensajes('exito')).toEqual(['Inmueble guardado correctamente.']);
    expect(mensajes('error')).toEqual([]);
  });

  it('excepción: nunca éxito y el error queda visible', async () => {
    const onFallo = vi.fn();
    const resultado = await ejecutarOperacion({
      accion: async () => {
        throw new Error('permission-denied: Missing or insufficient permissions.');
      },
      mensajeExito: 'Inmueble guardado correctamente.',
      mensajeError: 'No se ha podido guardar el inmueble.',
      origenesDatos: ['inmuebles'],
      onFallo,
    });

    expect(resultado.ok).toBe(false);
    expect(mensajes('exito')).toEqual([]);
    expect(mensajes('error')).toEqual(['No se ha podido guardar el inmueble.']);
    expect(onFallo).toHaveBeenCalledTimes(1);
  });

  it('contrato B5: un `false` es fallo aunque la promesa se resuelva', async () => {
    const resultado = await ejecutarOperacion({
      accion: async () => false,
      mensajeExito: 'Cambios guardados correctamente.',
      mensajeError: 'No se han podido guardar los cambios.',
      origenesDatos: ['inmuebles'],
    });

    expect(resultado).toEqual({ ok: false, motivo: 'persistencia' });
    expect(mensajes('exito')).toEqual([]);
    expect(mensajes('error')).toEqual(['No se han podido guardar los cambios.']);
  });

  it('una incidencia de guardado durante la operación impide el éxito', async () => {
    const resultado = await ejecutarOperacion({
      accion: async () => {
        reportarErrorGuardado('polizas', new Error('unavailable'));
      },
      mensajeExito: 'Póliza guardada correctamente.',
      mensajeError: 'No se ha podido guardar la póliza.',
      origenesDatos: ['polizas'],
    });

    expect(resultado).toEqual({ ok: false, motivo: 'persistencia' });
    expect(mensajes('exito')).toEqual([]);
  });

  it('una incidencia anterior (ya resuelta antes de la operación) no bloquea un guardado correcto', async () => {
    reportarErrorGuardado('polizas', new Error('fallo previo'));
    const resultado = await ejecutarOperacion({
      accion: async () => true,
      mensajeExito: 'Póliza guardada correctamente.',
      mensajeError: 'No se ha podido guardar la póliza.',
      origenesDatos: ['polizas'],
    });

    expect(resultado.ok).toBe(true);
    expect(mensajes('exito')).toEqual(['Póliza guardada correctamente.']);
  });

  it('las operaciones silenciosas pueden no anunciar éxito', async () => {
    const resultado = await ejecutarOperacion({
      accion: async () => true,
      mensajeError: 'No se ha podido actualizar.',
      avisarExito: false,
    });
    expect(resultado.ok).toBe(true);
    expect(avisosOperacion()).toHaveLength(0);
  });

  it('el fallo llega al efecto de recuperación para restaurar el control', async () => {
    const onExito = vi.fn();
    const resultado = await ejecutarOperacion({
      accion: async () => {
        throw new Error('boom');
      },
      mensajeError: 'No se ha podido eliminar el expediente.',
      onExito,
    });
    expect(onExito).not.toHaveBeenCalled();
    expect(resultado.ok).toBe(false);
  });
});

describe('UX-3 · doble envío', () => {
  it('una segunda pulsación mientras corre la operación no se ejecuta', async () => {
    let resolver: (() => void) | null = null;
    const accion = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolver = () => r();
        })
    );
    const { result } = renderHook(() => useOperacionEnCurso());

    let primera: Promise<unknown> | undefined;
    await act(async () => {
      primera = result.current.ejecutar({
        accion,
        mensajeExito: 'Gasto registrado correctamente.',
        mensajeError: 'No se ha podido guardar el gasto.',
      });
    });

    expect(result.current.ejecutando).toBe(true);

    let segunda: { ok: boolean; motivo?: string } | undefined;
    await act(async () => {
      segunda = await result.current.ejecutar({
        accion,
        mensajeError: 'No se ha podido guardar el gasto.',
      });
    });

    expect(segunda).toEqual({ ok: false, motivo: 'duplicada' });
    expect(accion).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolver?.();
      await primera;
    });

    await waitFor(() => expect(result.current.ejecutando).toBe(false));
    // El control se restaura: se puede volver a ejecutar tras completarse.
    const accionPosterior = vi.fn(async () => true);
    let tercera: { ok: boolean } | undefined;
    await act(async () => {
      tercera = await result.current.ejecutar({
        accion: accionPosterior,
        mensajeExito: 'Gasto registrado correctamente.',
        mensajeError: 'No se ha podido guardar el gasto.',
      });
    });
    expect(tercera?.ok).toBe(true);
    expect(accionPosterior).toHaveBeenCalledTimes(1);
  });
});
