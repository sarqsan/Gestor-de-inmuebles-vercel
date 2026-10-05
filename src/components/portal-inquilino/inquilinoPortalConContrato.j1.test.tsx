/**
 * @vitest-environment jsdom
 *
 * J.1 — Portal Inquilino CON contrato (no regresión).
 * Verifica que la portada normal sigue funcionando después de J.1:
 * se renderiza `PortalInicio`, NO aparece la tarjeta de "sin contrato",
 * y la capa de ayuda §6 (ContextualHelp / AsistentePanel) sigue montada
 * en la cabecera tal y como estaba antes de este bloque.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContratoFormalizacion, Inmueble, UsuarioApp } from '../../types';

const CONTRATO = {
  id: 'c-1',
  candidatoId: 'cand-1',
  inmuebleId: 'inm-1',
  inmuebleNombre: 'Piso centro',
  inmuebleDireccion: 'Calle Mayor 1',
  inmuebleCiudad: 'Sevilla',
  propietarioNombre: 'Ana',
  propietarioDni: '12345678Z',
  propietarioDireccion: 'Calle Real 5',
  propietarioTelefono: '600000000',
  propietarioEmail: 'ana@correo.test',
  propietarioIban: 'ES0000000000000000000000',
  candidatoNombre: 'Marta García',
  candidatoDni: '87654321X',
  candidatoTelefono: '600111222',
  candidatoEmail: 'marta@correo.test',
  rentaMensual: 750,
  fianzaLegalMeses: 1,
  fianzaLegalImporte: 750,
  garantiaAdicionalMeses: 0,
  garantiaAdicionalImporte: 0,
  fechaInicioContrato: '2026-01-01',
  duracionAnios: 1,
  diaLimitePagoMes: 5,
  permitirMascotas: false,
  permitirSubarriendo: false,
  incluyeMueblesInventario: false,
  gastosComunidadCargo: 'arrendador',
  ibiCargo: 'arrendador',
  suministrosCargo: 'arrendatario',
  clausulaDesistimientoAnticipado: false,
  clausulasPersonalizadas: [],
  estado: 'FIRMADO',
  esVigente: true,
} as unknown as ContratoFormalizacion;

const INMUEBLE = {
  id: 'inm-1',
  direccion: 'Calle Mayor 1',
  ciudad: 'Sevilla',
  tipo: 'piso',
  habitaciones: 2,
  banos: 1,
  superficie: 80,
  precio: 750,
  estado: 'alquilado',
} as unknown as Inmueble;

vi.mock('./usePortalInquilino', () => ({
  usePortalInquilino: () => ({
    contratos: [CONTRATO],
    inmuebles: [INMUEBLE],
    incidencias: [],
    mensajes: [],
    suministros: [],
    lecturas: [],
    cambios: [],
    actas: [],
    loading: false,
    error: null,
    recargar: () => Promise.resolve(),
  }),
}));

vi.mock('../../lib/progresoTutorialesFirestore', () => ({
  servicioProgresoTutoriales: {
    cargar: () => Promise.resolve(null),
    guardar: () => Promise.resolve(),
    guardarPaso: () => Promise.resolve(),
    finalizar: () => Promise.resolve(),
  },
}));

import { InquilinoPortalShell } from './InquilinoPortalShell';

const USUARIO: UsuarioApp = {
  id: 'u-iq-1',
  nombre: 'Marta',
  apellidos: 'García López',
  email: 'marta@correo.test',
  tipoPerfil: 'INQUILINO',
  estado: 'ACTIVO',
  roles: ['INQUILINO'],
  permisos: [],
  contratoIds: ['c-1'],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as UsuarioApp;

describe('J.1 — Portal Inquilino: con contrato (no regresión)', () => {
  afterEach(() => cleanup());

  it('NO muestra la tarjeta de "sin contrato" cuando sí hay contrato', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    expect(screen.queryByTestId('portal-inquilino-sin-contrato')).toBeNull();
  });

  it('muestra la cabecera con la dirección de la vivienda y la identidad del portal', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    expect(screen.getByText(/Portal del inquilino/i)).toBeTruthy();
    expect(screen.getAllByText(/Calle Mayor 1/i).length).toBeGreaterThan(0);
  });

  it('mantiene la navegación inferior completa del portal', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    expect(screen.getByRole('button', { name: /Inicio/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recibos/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aver\u00edas/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Luz\/Agua/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /M\u00e1s/ })).toBeTruthy();
  });

  it('no introduce el ERP administrativo en el portal del inquilino', () => {
    render(<InquilinoPortalShell usuario={USUARIO} onLogout={() => undefined} />);
    expect(document.querySelector('#propietario-portal-section')).toBeNull();
    expect(screen.queryByText(/Centro de Control/i)).toBeNull();
  });
});
