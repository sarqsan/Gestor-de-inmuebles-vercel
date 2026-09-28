/**
 * BLOQUE 10 · UX-2 — HOOK DE ESTADO DE LECTURAS + PUERTA DE PANTALLA.
 *
 * Reproduce el cableado REAL del host (`App.tsx`): suscripciones creadas en un
 * efecto que depende del contador de reintento, callbacks que marcan la lectura
 * como LISTO y fallos de lectura que llegan por el canal.
 *
 * Comprueba la regla fundamental de UX-2: CARGANDO / VACÍO / ERROR nunca se
 * confunden y un ERROR jamás se traduce en una lista vacía mostrada como vacío.
 *
 * @vitest-environment jsdom
 */
import React, { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PuertaEstadoDatos } from '../components/estado-datos/EstadoDatosPantalla';
import { AvisoIncidenciasDatos } from '../components/estado-datos/AvisoIncidenciasDatos';
import { reportarErrorLectura, reportarResultadoGuardado, reiniciarCanalIncidencias } from './canalIncidencias';
import type { OrigenDatos } from './canalIncidencias';
import { useEstadoLecturas } from './useEstadoLecturas';

afterEach(() => cleanup());
beforeEach(() => reiniciarCanalIncidencias());

/** Doble de la capa de datos: registra las suscripciones reales que se crean. */
class FuenteFalsa {
  readonly suscripciones: OrigenDatos[] = [];
  private emisores = new Map<string, (data: unknown) => void>();

  suscribir(origen: OrigenDatos, callback: (data: unknown) => void): () => void {
    this.suscripciones.push(origen);
    this.emisores.set(origen, callback);
    return () => {
      this.emisores.delete(origen);
    };
  }

  emitir(origen: OrigenDatos, data: unknown): void {
    this.emisores.get(origen)?.(data);
  }

  veces(origen: OrigenDatos): number {
    return this.suscripciones.filter((o) => o === origen).length;
  }
}

const ORIGENES: readonly OrigenDatos[] = ['inmuebles', 'propietarios', 'contratos'];

/**
 * Mini-host equivalente a `App.tsx`: mismo contrato (loading → data/empty/error),
 * mismo reintento por contador y misma ausencia de recarga de página.
 */
function HostDePrueba({ fuente }: { fuente: FuenteFalsa }) {
  const [datos, setDatos] = useState<Record<string, unknown[]>>({});
  const {
    intento,
    marcarListo,
    iniciarLecturas,
    reintentar,
    estadoDePantalla,
    incidencias,
    descartarIncidencia,
    descartarIncidencias,
  } = useEstadoLecturas(ORIGENES);

  useEffect(() => {
    iniciarLecturas();
    const bajas = ORIGENES.map((origen) =>
      fuente.suscribir(origen, (data) => {
        setDatos((prev) => ({ ...prev, [origen]: Array.isArray(data) ? data : [] }));
        marcarListo(origen);
      })
    );
    return () => bajas.forEach((baja) => baja());
    // El contador de reintento vuelve a crear las suscripciones (lectura real).
  }, [intento, fuente, iniciarLecturas, marcarListo]);

  const total = Object.keys(datos).reduce((suma, clave) => suma + datos[clave].length, 0);

  return (
    <div>
      <AvisoIncidenciasDatos
        incidencias={incidencias}
        onReintentar={reintentar}
        onDescartar={descartarIncidencia}
        onDescartarTodas={descartarIncidencias}
      />
      <PuertaEstadoDatos estado={estadoDePantalla('inmuebles')} onReintentar={reintentar}>
        <p data-testid="contenido">registros: {total}</p>
        <p data-testid="vacio">Sin datos todavía</p>
      </PuertaEstadoDatos>
    </div>
  );
}

function montar() {
  const fuente = new FuenteFalsa();
  const util = render(<HostDePrueba fuente={fuente} />);
  return { fuente, ...util };
}

/** Entrega de datos (lectura exitosa) con el mismo act que usa la capa real. */
function entregar(fuente: FuenteFalsa, valor: unknown = []): void {
  act(() => {
    ORIGENES.forEach((origen) => fuente.emitir(origen, valor));
  });
}

function fallarEnLectura(origen: OrigenDatos, error: unknown): void {
  act(() => {
    reportarErrorLectura(origen, error);
  });
}

describe('UX-2 · CARGANDO: nunca se afirma «sin datos» mientras la lectura está pendiente', () => {
  it('con la lectura pendiente se muestra carga y NO el vacío ni el contenido', () => {
    montar();

    expect(screen.getByTestId('estado-cargando')).toBeTruthy();
    expect(screen.queryByTestId('contenido')).toBeNull();
    expect(screen.queryByTestId('vacio')).toBeNull();
    expect(screen.queryByText(/^Sin datos/)).toBeNull();
    // El estado de datos del host sigue siendo la lista inicial, pero la pantalla
    // no lo interpreta como «vacío»: eso es exactamente el falso vacío corregido.
    expect(screen.getByText(/Todavía no podemos confirmar/i)).toBeTruthy();
  });

  it('cada lectura pendiente se anuncia por su etiqueta legible', () => {
    montar();
    expect(screen.getByText(/Consultando Inmuebles, Propietarios, Contratos\./)).toBeTruthy();
  });
});

describe('UX-2 · VACÍO: solo después de una lectura terminada con cero elementos', () => {
  it('con las tres lecturas resueltas y cero registros se muestra el vacío legítimo', () => {
    const { fuente } = montar();
    // Antes de terminar no hay vacío.
    expect(screen.queryByTestId('vacio')).toBeNull();

    entregar(fuente, []);

    expect(screen.queryByTestId('estado-cargando')).toBeNull();
    expect(screen.getByTestId('contenido').textContent).toBe('registros: 0');
    expect(screen.getByTestId('vacio')).toBeTruthy();
  });

  it('con datos reales se muestra el contenido (success) sin mensajes de vacío', () => {
    const { fuente } = montar();
    act(() => {
      fuente.emitir('inmuebles', [{ id: 'i1' }, { id: 'i2' }]);
      fuente.emitir('propietarios', [{ id: 'p1' }]);
      fuente.emitir('contratos', []);
    });

    expect(screen.getByTestId('contenido').textContent).toBe('registros: 3');
    expect(screen.queryByTestId('estado-cargando')).toBeNull();
  });
});

describe('UX-2 · ERROR: nunca se convierte en [] silencioso', () => {
  it('si la lectura falla antes de entregar datos se muestra el error, no el vacío', () => {
    montar();
    fallarEnLectura('inmuebles', { code: 'permission-denied' });

    expect(screen.getByTestId('estado-error')).toBeTruthy();
    expect(screen.getByText('No se han podido cargar los datos')).toBeTruthy();
    expect(screen.getByText(/Afecta a: Inmuebles/)).toBeTruthy();
    // Nunca «sin datos» con un error de lectura.
    expect(screen.queryByTestId('vacio')).toBeNull();
    expect(screen.queryByTestId('contenido')).toBeNull();
    // Y el aviso del canal informa del fallo (antes sólo había consola).
    expect(screen.getByTestId('aviso-incidencias-datos')).toBeTruthy();
    expect(screen.getByText(/No se han podido leer algunos datos/)).toBeTruthy();
  });

  it('el mensaje de la incidencia explica la causa sin detalles técnicos del SDK', () => {
    montar();
    fallarEnLectura('inmuebles', { code: 'permission-denied' });

    // Aparece tanto en la pantalla de error como en el aviso; en ningún caso con
    // el código técnico delante de la persona usuaria.
    expect(screen.getAllByText(/No tienes permisos para consultar estos datos/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/permission-denied|PERMISSION_DENIED|firebase|firestore/i)).toBeNull();
  });

  it('preserva los datos ya leídos si el fallo llega después (no se oculta la pantalla)', () => {
    const { fuente } = montar();
    entregar(fuente, [{ id: 'x' }]);
    expect(screen.getByTestId('contenido').textContent).toBe('registros: 3');

    fallarEnLectura('contratos', { code: 'unavailable' });

    expect(screen.getByTestId('contenido').textContent).toBe('registros: 3');
    expect(screen.queryByTestId('estado-error')).toBeNull();
    // El fallo no desaparece: queda visible en el aviso.
    expect(screen.getByText(/No se han podido leer algunos datos/)).toBeTruthy();
  });
});

describe('UX-2 · REINTENTAR: re-ejecuta la lectura real sin recargar la página', () => {
  it('al pulsar Reintentar se vuelven a crear las suscripciones y se relee de verdad', () => {
    const { fuente } = montar();
    expect(fuente.veces('inmuebles')).toBe(1);

    fallarEnLectura('inmuebles', { code: 'unavailable' });
    expect(screen.getByTestId('estado-error')).toBeTruthy();

    fireEvent.click(screen.getByText('Reintentar'));

    // Segunda lectura real del mismo origen (nuevas suscripciones). Sin recarga de
    // página: el reintento es un contador de estado que rehace las suscripciones.
    expect(fuente.veces('inmuebles')).toBe(2);
    expect(fuente.veces('contratos')).toBe(2);
    // Vuelve a CARGANDO y deja de mostrar el error: no se presenta el error como vacío.
    expect(screen.queryByTestId('estado-error')).toBeNull();
    expect(screen.getByTestId('estado-cargando')).toBeTruthy();
    expect(screen.queryByTestId('vacio')).toBeNull();

    entregar(fuente, []);
    expect(screen.getByTestId('contenido').textContent).toBe('registros: 0');
    expect(screen.queryByTestId('estado-error')).toBeNull();
  });

  it('el aviso de lectura también permite reintentar desde el propio aviso', () => {
    const { fuente } = montar();
    fallarEnLectura('inmuebles', { code: 'unavailable' });

    fireEvent.click(screen.getByText('Reintentar lectura'));

    expect(fuente.veces('inmuebles')).toBe(2);
    expect(screen.queryByText(/No se han podido leer algunos datos/)).toBeNull();
  });

  it('las incidencias de lectura desaparecen cuando el reintento termina bien', () => {
    const { fuente } = montar();
    fallarEnLectura('inmuebles', { code: 'unavailable' });
    fireEvent.click(screen.getByText('Reintentar'));

    entregar(fuente, [{ id: 'ok' }]);

    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
    expect(screen.getByTestId('contenido').textContent).toBe('registros: 3');
  });
});

describe('UX-2 · GUARDADO: un fallo de persistencia no se presenta como éxito', () => {
  it('un fallo de guardado se muestra al usuario y no se limpia al reintentar la lectura', () => {
    const { fuente } = montar();
    entregar(fuente, []);

    // Resultado real de un guardado que la persistencia no confirmó (contrato B5 → false).
    act(() => {
      reportarResultadoGuardado('inmuebles', false);
    });

    expect(screen.getByText(/Hay cambios que no se han podido guardar/)).toBeTruthy();
    expect(screen.getByText(/Vuelve a intentar la operación/)).toBeTruthy();
    expect(screen.getByText(/No se han podido guardar los cambios\./)).toBeTruthy();

    // El reintento de LECTURA limpia los fallos de lectura, nunca los de guardado.
    act(() => {
      fuente.emitir('contratos', [{ id: 'x' }]);
    });
    expect(screen.getByText(/Hay cambios que no se han podido guardar/)).toBeTruthy();

    fireEvent.click(screen.getByText('Descartar avisos'));
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
  });

  it('un guardado correcto no genera ningún aviso (no todo se presenta como error)', () => {
    const { fuente } = montar();
    entregar(fuente, []);

    act(() => {
      reportarResultadoGuardado('inmuebles', true);
    });

    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
  });
});
