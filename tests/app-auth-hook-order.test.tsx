// @vitest-environment jsdom
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useDialogoAccesible } from '../src/accesibilidad/dialogo';

/**
 * Reproduce la transición de estados que provocaba el fallo de App. El hook real
 * del diálogo se ejecuta siempre, antes de las salidas de carga y sesión anónima.
 */
function TransicionAuth() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const dialogo = useDialogoAccesible(
    { abierto, onCerrar: () => setAbierto(false) },
    'Registrar nuevo candidato'
  );

  if (authLoading) {
    return <button onClick={() => setAuthLoading(false)}>Resolver sesión</button>;
  }
  if (!currentUser) {
    return <button onClick={() => setCurrentUser({ id: 'usuario-prueba' })}>Iniciar sesión</button>;
  }
  return (
    <div>
      <span>Aplicación autenticada</span>
      <button onClick={() => setAbierto(true)}>Abrir diálogo</button>
      {abierto && <div ref={dialogo.refDialogo} {...dialogo.propsDialogo}>Nuevo candidato</div>}
    </div>
  );
}

describe('regresión: orden de hooks durante la transición de autenticación', () => {
  it('mantiene useDialogoAccesible antes de los guards de auth reales de App', () => {
    const appPath = resolve(process.cwd(), 'src/App.tsx');
    const source = readFileSync(appPath, 'utf8');
    const hook = source.indexOf('const dialogoNuevoCandidato = useDialogoAccesible(');
    const guardCarga = source.indexOf('if (authLoading) {');
    const guardAnonimo = source.indexOf('if (!currentUser) {', guardCarga);

    expect(hook).toBeGreaterThan(-1);
    expect(hook).toBeLessThan(guardCarga);
    expect(hook).toBeLessThan(guardAnonimo);
  });

  it('transita de carga a anónimo y autenticado sin cambiar el número de hooks', () => {
    render(<TransicionAuth />);

    fireEvent.click(screen.getByRole('button', { name: 'Resolver sesión' }));
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Aplicación autenticada')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir diálogo' }));
    expect(screen.getByRole('dialog', { name: 'Registrar nuevo candidato' })).toBeTruthy();
  });
});
