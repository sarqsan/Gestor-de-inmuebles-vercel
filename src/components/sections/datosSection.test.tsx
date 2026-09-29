/**
 * @vitest-environment jsdom
 *
 * AUDITORÍA UX PROPIETARIO (2026-09-29) — Sección «Importar / Exportar»:
 * es una sección VISIBLE que monta el MISMO motor canónico (ImportExportPanel)
 * que existe en Configuración — sin duplicar importadores/exportadores — y
 * explica antes de tocar datos: vista previa obligatoria, vínculos fiscales,
 * y que el informe fiscal vive en «Informes & Export».
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inmueble, UsuarioApp } from '../../types';

// El test verifica el CONTRATO de la sección (props y mensajes), no el motor:
// sustituimos el panel canónico y constatamos que la sección lo usa tal cual.
const panelMock = vi.fn((_props: { inmuebles: Inmueble[]; usuario?: UsuarioApp }) => null);
vi.mock('./ImportExportPanel', () => ({
  ImportExportPanel: (props: { inmuebles: Inmueble[]; usuario?: UsuarioApp }) => {
    panelMock(props);
    return <div data-testid="motor-importexport">MOTOR_CANONICO</div>;
  },
}));

import { DatosSection } from './DatosSection';

const USUARIO: UsuarioApp = {
  id: 'u-1',
  nombre: 'Ana Propietaria',
  email: 'ana@correo.test',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO_ESTANDAR'],
  permisos: [],
  propietarioId: 'P1',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const INMUEBLES = [{ id: 'inm-1', direccion: 'Calle Mayor 1' } as Inmueble];

describe('sección «datos» (Importar / Exportar) — auditoría UX propietario', () => {
  afterEach(() => {
    cleanup();
    panelMock.mockClear();
  });

  it('monta el motor canónico con los inmuebles y el usuario del ámbito (sin motor paralelo)', () => {
    render(<DatosSection inmuebles={INMUEBLES} usuario={USUARIO} />);

    expect(screen.getByTestId('motor-importexport')).toBeTruthy();
    expect(panelMock).toHaveBeenCalledTimes(1);
    const props = panelMock.mock.calls[0][0];
    expect(props.inmuebles).toBe(INMUEBLES);
    expect(props.usuario).toBe(USUARIO);
  });

  it('explica las garantías de seguridad antes de escribir (vista previa, vínculos fiscales, fiscal → Informes)', () => {
    render(<DatosSection inmuebles={INMUEBLES} usuario={USUARIO} />);

    expect(screen.getByRole('heading', { name: /Importar o exportar tus datos/i })).toBeTruthy();
    expect(screen.getByText(/no se escribe nada hasta que tú lo confirmes/i)).toBeTruthy();
    // «vista previa» aparece en la explicación y en los chips de garantía
    expect(screen.getAllByText(/vista previa/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/ámbito de propietario/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Informes & Export/)).toBeTruthy();
  });

  it('expone el hito data-tour para el recorrido guiado', () => {
    const { container } = render(<DatosSection inmuebles={INMUEBLES} usuario={USUARIO} />);
    expect(container.querySelector('[data-tour="datos-panel"]')).toBeTruthy();
  });

  it('sin usuario (sesión anónima) sigue montando el motor sin romper', () => {
    render(<DatosSection inmuebles={[]} />);
    expect(screen.getByTestId('motor-importexport')).toBeTruthy();
  });
});
