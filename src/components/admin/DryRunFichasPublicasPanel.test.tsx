/**
 * Tests UI (jsdom) del panel de DRY-RUN de fichas públicas.
 * Sin Firestore: la ejecución se inyecta; además se mockea `firebase/firestore`
 * para que cualquier escritura accidental haga fallar el test.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UsuarioApp } from '../../types';

const escrituras = vi.hoisted(() => [] as string[]);

vi.mock('firebase/firestore', () => {
  const prohibida = (n: string) => async () => {
    escrituras.push(n);
    throw new Error(`ESCRITURA PROHIBIDA: ${n}`);
  };
  return {
    collection: () => ({}),
    doc: () => ({}),
    getDocs: async () => ({ forEach: () => undefined }),
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    setDoc: prohibida('setDoc'),
    updateDoc: prohibida('updateDoc'),
    deleteDoc: prohibida('deleteDoc'),
    addDoc: prohibida('addDoc'),
    writeBatch: prohibida('writeBatch'),
  };
});
vi.mock('../../lib/firebase', () => ({ db: {}, auth: { currentUser: { email: 'sarqsan2@gmail.com' } } }));
vi.mock('../../lib/authService', () => ({ ADMIN_MASTER_EMAIL: 'sarqsan2@gmail.com' }));

import { DryRunFichasPublicasPanel } from './DryRunFichasPublicasPanel';
import type { InformeDryRunFichasPublicas } from '../../lib/dryRunFichasPublicas';

const master: UsuarioApp = {
  id: 'u-master',
  nombre: 'Master',
  email: 'sarqsan2@gmail.com',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};
const otroAdmin: UsuarioApp = { ...master, id: 'u-2', email: 'otro@example.com' };
const propietario: UsuarioApp = { ...master, id: 'u-3', tipoPerfil: 'PROPIETARIO' };

const informeFake: InformeDryRunFichasPublicas = {
  modo: 'DRY_RUN',
  generadoEn: '2026-09-23T10:00:00.000Z',
  ejecutadoPor: 'sarqsan2@gmail.com',
  resumen: {
    N: 5,
    aCrear: 2,
    aActualizar: 1,
    alDia: 1,
    noAptos: 0,
    errores: 1,
    ids: { CREAR: ['INM-1', 'INM-2'], ACTUALIZAR: ['INM-3'], AL_DIA: ['INM-4'], SIN_FICHA_POSIBLE: [], ERROR: ['INM-5'] },
  },
  informe: {
    modo: 'DRY_RUN',
    autorizado: false,
    inmueblesLeidos: 5,
    aptos: 4,
    noAptos: 0,
    fichasExistentes: 2,
    aCrear: 2,
    aActualizar: 1,
    alDia: 1,
    escrituras: 0,
    errores: [{ inmuebleId: 'INM-5', estado: 'ERROR', motivo: 'lectura_ficha_fallo', error: 'Missing or insufficient permissions.' }],
    items: [],
    resumen: '[DRY_RUN] inmuebles leídos=5 · escrituras=0',
  },
};

afterEach(() => {
  cleanup();
  expect(escrituras).toEqual([]);
});

describe('DryRunFichasPublicasPanel', () => {
  it('no renderiza nada para un usuario que no es el master', () => {
    const ejecutar = vi.fn();
    const { container: c1 } = render(<DryRunFichasPublicasPanel currentUser={otroAdmin} emailSesion="otro@example.com" ejecutar={ejecutar} />);
    expect(c1.innerHTML).toBe('');
    const { container: c2 } = render(<DryRunFichasPublicasPanel currentUser={propietario} emailSesion="sarqsan2@gmail.com" ejecutar={ejecutar} />);
    expect(c2.innerHTML).toBe('');
    // Perfil master pero sesión Auth de otra cuenta.
    const { container: c3 } = render(<DryRunFichasPublicasPanel currentUser={master} emailSesion="otro@example.com" ejecutar={ejecutar} />);
    expect(c3.innerHTML).toBe('');
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('para el master muestra un único botón de DRY-RUN (solo lectura) y ningún control de ejecución', () => {
    render(<DryRunFichasPublicasPanel currentUser={master} emailSesion="sarqsan2@gmail.com" ejecutar={vi.fn()} />);
    const botones = screen.getAllByRole('button');
    expect(botones).toHaveLength(1);
    expect(botones[0].textContent).toMatch(/DRY-RUN \(solo lectura\)/);
    expect(screen.queryByText(/materializar|ejecutar backfill/i)).toBeNull();
  });

  it('al pulsar invoca solo el análisis (usuario + emailSesion, sin flag) y muestra contadores, ids y errores', async () => {
    const ejecutar = vi.fn(async () => informeFake);
    render(<DryRunFichasPublicasPanel currentUser={master} emailSesion="sarqsan2@gmail.com" ejecutar={ejecutar} />);
    fireEvent.click(screen.getByText(/Ejecutar DRY-RUN/));
    await waitFor(() => expect(screen.getByTestId('dry-run-N').textContent).toBe('5'));
    expect(ejecutar).toHaveBeenCalledTimes(1);
    const [usuarioArg, opcionesArg] = ejecutar.mock.calls[0] as unknown as [UsuarioApp, Record<string, unknown>];
    expect(usuarioArg).toBe(master);
    expect(opcionesArg).toEqual({ emailSesion: 'sarqsan2@gmail.com' });
    expect('ejecutar' in opcionesArg).toBe(false);

    expect(screen.getByTestId('dry-run-aCrear').textContent).toBe('2');
    expect(screen.getByTestId('dry-run-aActualizar').textContent).toBe('1');
    expect(screen.getByTestId('dry-run-alDia').textContent).toBe('1');
    expect(screen.getByTestId('dry-run-noAptos').textContent).toBe('0');
    expect(screen.getByTestId('dry-run-errores').textContent).toBe('1');
    expect(screen.getByTestId('dry-run-ids-CREAR').textContent).toContain('INM-1');
    expect(screen.getByTestId('dry-run-ids-CREAR').textContent).toContain('INM-2');
    expect(screen.getByTestId('dry-run-ids-ACTUALIZAR').textContent).toContain('INM-3');
    expect(screen.getByTestId('dry-run-ids-ERROR').textContent).toContain('INM-5');
    expect(screen.getByText(/lectura_ficha_fallo/).textContent).toContain('insufficient permissions');
    expect(screen.getByText('Descargar informe JSON')).toBeTruthy();
  });

  it('un error de la ejecución (p. ej. no autorizado o permisos) se muestra y no rompe el panel', async () => {
    const ejecutar = vi.fn(async () => {
      throw new Error('DRY_RUN_NO_AUTORIZADO: solo el administrador principal');
    });
    render(<DryRunFichasPublicasPanel currentUser={master} emailSesion="sarqsan2@gmail.com" ejecutar={ejecutar} />);
    fireEvent.click(screen.getByText(/Ejecutar DRY-RUN/));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('DRY_RUN_NO_AUTORIZADO'));
    expect(screen.queryByTestId('dry-run-N')).toBeNull();
  });
});
