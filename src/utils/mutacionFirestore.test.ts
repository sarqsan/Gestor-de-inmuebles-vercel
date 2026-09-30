import { describe, it, expect, vi } from 'vitest';
import { ejecutarMutacion, ejecutarMutacionConfirmada } from './mutacionFirestore';
import { esErrorFirestore } from './erroresFirestore';

/**
 * BLOQUE 1 — Orquestador de mutaciones.
 *
 * Criterios cubiertos:
 *   1.1  Toda operación se espera (await) y se comprueba.
 *   1.2  Si falla: rollback completo, sin tarjeta desaparecida ni falso aviso.
 *   1.3  Una operación principal fallida NO ejecuta efectos secundarios.
 *   1.6  La UI sólo se actualiza tras la confirmación de Firestore.
 *
 * Antipatrón real que se reproduce en el test "flujo de borrado":
 *   setInmuebles(filter); deleteInmuebleFirestore(id);  // sin await
 *   setCandidatos(...);                                 // efectos SIEMPRE
 */
describe('BLOQUE 1 · Orquestador de mutaciones Firestore', () => {
  const rechazoPermisos = () => {
    const e = new Error('Missing or insufficient permissions.');
    (e as unknown as { code: string }).code = 'permission-denied';
    return e;
  };

  it('1.1 · en éxito persiste, ejecuta efectos y confirma (en ese orden)', async () => {
    const orden: string[] = [];

    const res = await ejecutarMutacionConfirmada({
      operacion: 'alta de inmueble',
      persistir: async () => {
        orden.push('persistir');
      },
      efectos: async () => {
        orden.push('efectos');
      },
      alConfirmar: () => {
        orden.push('confirmar');
      },
    });

    expect(res.estado).toBe('OK');
    expect(orden).toEqual(['persistir', 'efectos', 'confirmar']);
  });

  it('1.2 · si Firestore rechaza: revierte el optimismo y NO confirma', async () => {
    const estado = { tarjetas: 3 };
    const aplicar = vi.fn(() => {
      estado.tarjetas = 2;
    });
    const revertir = vi.fn(() => {
      estado.tarjetas = 3;
    });
    const alConfirmar = vi.fn();

    const res = await ejecutarMutacionConfirmada({
      operacion: 'eliminación del inmueble',
      aplicarOptimista: aplicar,
      revertir,
      persistir: async () => {
        throw rechazoPermisos();
      },
      alConfirmar,
    });

    expect(res.estado).toBe('KO');
    if (res.estado === 'KO') {
      expect(esErrorFirestore(res.error)).toBe(true);
      expect(res.error.codigo).toBe('PERMISOS');
      expect(res.error.mensajeUsuario.length).toBeGreaterThan(20);
      expect(res.revertido).toBe(true);
    }
    // La tarjeta NO desaparece.
    expect(estado.tarjetas).toBe(3);
    expect(revertir).toHaveBeenCalledTimes(1);
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it('1.3 · una operación principal fallida NO ejecuta efectos secundarios', async () => {
    const efectos = vi.fn(async () => {});
    const desvincularCandidatos = vi.fn(async () => {});

    const res = await ejecutarMutacion({
      operacion: 'eliminación del inmueble',
      persistir: async () => {
        throw rechazoPermisos();
      },
      efectos: async () => {
        efectos();
        await desvincularCandidatos();
      },
    });

    expect(res.estado).toBe('KO');
    expect(efectos).not.toHaveBeenCalled();
    expect(desvincularCandidatos).not.toHaveBeenCalled();
  });

  it('1.3 (bis) · flujo real de borrado: el candidato NO se toca si Firestore rechaza', async () => {
    // Reproduce la composición exacta de App.handleDeleteInmueble.
    let inmueblesEnPantalla = ['inm-1', 'inm-2'];
    let candidatosMutados = 0;

    const res = await ejecutarMutacionConfirmada({
      operacion: 'eliminación del inmueble',
      persistir: async () => {
        throw rechazoPermisos();
      },
      efectos: async () => {
        candidatosMutados += 1;
      },
      alConfirmar: () => {
        inmueblesEnPantalla = inmueblesEnPantalla.filter((id) => id !== 'inm-1');
      },
    });

    expect(res.estado).toBe('KO');
    expect(inmueblesEnPantalla).toEqual(['inm-1', 'inm-2']);
    expect(candidatosMutados).toBe(0);
  });

  it('1.6 · la UI sólo se refresca DESPUÉS de la confirmación', async () => {
    const orden: string[] = [];
    await ejecutarMutacionConfirmada({
      operacion: 'guardado de cambios',
      persistir: async () => {
        await Promise.resolve();
        orden.push('firestore');
      },
      alConfirmar: () => {
        orden.push('ui');
      },
    });
    expect(orden).toEqual(['firestore', 'ui']);
  });

  it('el aviso de error al usuario es el normalizado y no una excepción', async () => {
    const alError = vi.fn();
    const res = await ejecutarMutacion({
      operacion: 'alta de inmueble',
      persistir: async () => {
        throw rechazoPermisos();
      },
      alError,
      avisoFallo: 'El inmueble NO se ha guardado.',
    });

    expect(res.estado).toBe('KO');
    expect(alError).toHaveBeenCalledTimes(1);
    const err = alError.mock.calls[0][0];
    expect(err.mensajeUsuario).toContain('NO se ha guardado');
  });

  it('si el efecto secundario falla, la principal YA confirmada no se revierte', async () => {
    const res = await ejecutarMutacion({
      operacion: 'eliminación del inmueble',
      persistir: async () => {},
      efectos: async () => {
        throw new Error('candidato bloqueado');
      },
    });

    expect(res.estado).toBe('OK');
    if (res.estado === 'OK') {
      expect(res.efectosEjecutados).toBe(false);
      expect(res.errorEfectos).toBeDefined();
      expect(res.errorEfectos?.mensajeUsuario).toMatch(/principal SÍ se ha guardado/i);
    }
  });

  it('un fallo al revertir no enmascara el error original', async () => {
    const res = await ejecutarMutacion({
      operacion: 'operación con rollback roto',
      aplicarOptimista: () => {},
      revertir: () => {
        throw new Error('rollback roto');
      },
      persistir: async () => {
        throw rechazoPermisos();
      },
    });

    expect(res.estado).toBe('KO');
    if (res.estado === 'KO') expect(res.error.codigo).toBe('PERMISOS');
  });

  it('nunca lanza: siempre devuelve un resultado', async () => {
    const res = await ejecutarMutacion({
      operacion: 'op',
      persistir: async () => {
        throw new Error('cualquier cosa');
      },
    });
    expect(res).toHaveProperty('estado', 'KO');
  });
});
