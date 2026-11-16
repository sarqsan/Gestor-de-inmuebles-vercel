import { describe, expect, it, vi } from 'vitest';
import {
  crearGestorGuardadoContratos,
  huellaContrato,
  type ObservadorEstadoGuardado,
} from './guardadoContratoAutomatico';

/**
 * AG-10 · Guardado automático del contrato.
 *
 * Datos sintéticos. Ninguna escritura real: la persistencia se inyecta.
 */

const CONTRATO = 'contrato-sintetico-a';

function entorno(guardar: () => Promise<void>) {
  const estados: ObservadorEstadoGuardado[] = [];
  const errores: unknown[] = [];
  const esperas: number[] = [];
  const gestor = crearGestorGuardadoContratos();
  return {
    gestor,
    estados,
    errores,
    esperas,
    opciones: (extra: Partial<Parameters<typeof gestor.guardar>[2]> = {}) => ({
      puedeEscribir: true,
      guardar,
      reportarError: (e: unknown) => errores.push(e),
      alCambiarEstado: (e: ObservadorEstadoGuardado) => estados.push(e),
      reintentos: 2,
      esperaMs: 10,
      esperar: async (ms: number) => {
        esperas.push(ms);
      },
      ...extra,
    }),
  };
}

describe('AG-10 · guardado correcto', () => {
  it('guarda, confirma el estado y notifica GUARDADO', async () => {
    const guardar = vi.fn(async () => {});
    const { gestor, estados, opciones } = entorno(guardar);

    const resultado = await gestor.guardar(CONTRATO, 'h1', opciones());

    expect(resultado).toBe('GUARDADO');
    expect(guardar).toHaveBeenCalledTimes(1);
    expect(gestor.estadoDe(CONTRATO)).toBe('GUARDADO');
    expect(estados.map((e) => e.estado)).toContain('GUARDANDO');
    expect(estados.at(-1)?.estado).toBe('GUARDADO');
  });

  it('sin permiso de escritura NO se intenta guardar', async () => {
    const guardar = vi.fn(async () => {});
    const { gestor, opciones } = entorno(guardar);

    const resultado = await gestor.guardar(CONTRATO, 'h1', opciones({ puedeEscribir: false }));

    expect(resultado).toBe('OBSOLETO');
    expect(guardar).not.toHaveBeenCalled();
  });
});

describe('AG-10 · errores de conexión y reintentos', () => {
  it('reintenta tras un fallo y termina guardando', async () => {
    let llamadas = 0;
    const guardar = vi.fn(async () => {
      llamadas += 1;
      if (llamadas === 1) throw new Error('red caída (sintético)');
    });
    const { gestor, opciones, esperas, errores } = entorno(guardar);

    const resultado = await gestor.guardar(CONTRATO, 'h1', opciones());

    expect(resultado).toBe('GUARDADO');
    expect(guardar).toHaveBeenCalledTimes(2);
    // El error del primer intento se reporta al canal, no se traga.
    expect(errores).toHaveLength(1);
    expect(esperas).toHaveLength(1);
  });

  it('agota los reintentos y deja ERROR visible, sin declarar guardado', async () => {
    const guardar = vi.fn(async () => {
      throw new Error('permiso denegado (sintético)');
    });
    const { gestor, opciones, estados, errores } = entorno(guardar);

    const resultado = await gestor.guardar(CONTRATO, 'h1', opciones({ reintentos: 2 }));

    expect(resultado).toBe('ERROR');
    expect(guardar).toHaveBeenCalledTimes(3); // intento inicial + 2 reintentos
    expect(gestor.estadoDe(CONTRATO)).toBe('ERROR');
    expect(estados.at(-1)?.estado).toBe('ERROR');
    expect(errores).toHaveLength(3);
    // Nunca se notifica GUARDADO si la persistencia no confirmó.
    expect(estados.some((e) => e.estado === 'GUARDADO')).toBe(false);
  });

  it('la espera crece entre reintentos', async () => {
    const guardar = vi.fn(async () => {
      throw new Error('fallo (sintético)');
    });
    const { gestor, opciones, esperas } = entorno(guardar);

    await gestor.guardar(CONTRATO, 'h1', opciones({ reintentos: 3, esperaMs: 100 }));

    expect(esperas).toEqual([100, 200, 300]);
  });
});

describe('AG-10 · duplicados y sobrescrituras', () => {
  it('el mismo contenido en vuelo no lanza una segunda escritura', async () => {
    let resolver: () => void = () => {};
    const guardar = vi.fn(
      () => new Promise<void>((resolve) => {
        resolver = resolve;
      })
    );
    const { gestor, opciones } = entorno(guardar);

    const primera = gestor.guardar(CONTRATO, 'misma', opciones());
    // Segunda llamada idéntica mientras la primera está en vuelo.
    const segunda = gestor.guardar(CONTRATO, 'misma', opciones());

    expect(guardar).toHaveBeenCalledTimes(1);
    resolver();
    await primera;
    await segunda;
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it('un contenido más reciente en vuelo descarta el antiguo como OBSOLETO', async () => {
    let resolver: () => void = () => {};
    const guardar = vi.fn(
      () => new Promise<void>((resolve) => {
        resolver = resolve;
      })
    );
    const { gestor, opciones } = entorno(guardar);

    const antigua = gestor.guardar(CONTRATO, 'vieja', opciones());
    const nueva = gestor.guardar(CONTRATO, 'nueva', opciones());

    // La segunda no compite: se descarta sin escribir.
    expect(await nueva).toBe('OBSOLETO');
    resolver();
    await antigua;
    expect(guardar).toHaveBeenCalledTimes(1);
  });

  it('cambios rápidos consecutivos: el último contenido es el que persiste', async () => {
    const escritos: string[] = [];
    let contenido = 'v1';
    const guardar = vi.fn(async () => {
      escritos.push(contenido);
    });
    const { gestor, opciones } = entorno(guardar);

    await gestor.guardar(CONTRATO, 'v1', opciones());
    contenido = 'v2';
    await gestor.guardar(CONTRATO, 'v2', opciones());
    contenido = 'v3';
    await gestor.guardar(CONTRATO, 'v3', opciones());

    expect(escritos).toEqual(['v1', 'v2', 'v3']);
    expect(gestor.estadoDe(CONTRATO)).toBe('GUARDADO');
  });

  it('dos contratos distintos no se bloquean entre sí', async () => {
    const guardar = vi.fn(async () => {});
    const { gestor, opciones } = entorno(guardar);

    const [a, b] = await Promise.all([
      gestor.guardar('contrato-a', 'h', opciones()),
      gestor.guardar('contrato-b', 'h', opciones()),
    ]);

    expect([a, b]).toEqual(['GUARDADO', 'GUARDADO']);
    expect(guardar).toHaveBeenCalledTimes(2);
  });

  it('expone qué contratos siguen pendientes o en error', async () => {
    const guardar = vi.fn(async () => {
      throw new Error('fallo (sintético)');
    });
    const { gestor, opciones } = entorno(guardar);

    await gestor.guardar('contrato-x', 'h', opciones({ reintentos: 0 }));
    expect(gestor.contratosPendientes()).toContain('contrato-x');

    gestor.olvidar('contrato-x');
    expect(gestor.contratosPendientes()).not.toContain('contrato-x');
  });
});

describe('AG-10 · huella del contrato', () => {
  it('es estable ante el orden de las claves', () => {
    expect(huellaContrato({ a: 1, b: 2 })).toBe(huellaContrato({ b: 2, a: 1 }));
  });

  it('cambia cuando cambia el contenido económico', () => {
    const base = { id: 'c', registroCobros: [{ periodoMesAnio: '2026-12', importePrevisto: 900 }] };
    const otro = { id: 'c', registroCobros: [{ periodoMesAnio: '2026-12', importePrevisto: 950 }] };
    expect(huellaContrato(base)).not.toBe(huellaContrato(otro));
  });

  it('ignora las propiedades indefinidas', () => {
    expect(huellaContrato({ a: 1, b: undefined })).toBe(huellaContrato({ a: 1 }));
  });

  it('dos cálculos idénticos producen la misma huella (permite deduplicar)', () => {
    const contrato = { id: 'c', registroCobros: [{ id: 'p', estado: 'PENDIENTE' }] };
    expect(huellaContrato(contrato)).toBe(huellaContrato(structuredClone(contrato)));
  });
});
