/**
 * @vitest-environment jsdom
 *
 * AUDITORÍA UX PROPIETARIO (2026-09-29) — Portal del propietario:
 * las tarjetas de vivienda muestran datos reales (precio/superficie y
 * titularidad) y el alta de vivienda es accesible desde «Mis Viviendas»
 * (cabecera y estado vacío) sin pasar por menús secundarios.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inmueble, Propietario, UsuarioApp } from '../../types';
import { PropietarioPortalSection } from './PropietarioPortalSection';

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

const PROPIETARIOS: Propietario[] = [
  {
    id: 'P1',
    nombre: 'Ana Propietaria',
    nifCif: '12345678Z',
    tipoPropietario: 'persona_fisica',
    telefono: '600000000',
    email: 'ana@correo.test',
    direccion: 'Calle Real 5',
    ciudad: 'Sevilla',
    codigoPostal: '41001',
    cuentasBancarias: [],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
  },
];

const VIVIENDA: Inmueble = {
  id: 'inm-1',
  direccion: 'Calle Mayor 1',
  ciudad: 'Sevilla',
  tipo: 'piso',
  habitaciones: 2,
  banos: 1,
  superficie: 80,
  precio: 750,
  estado: 'alquilado',
  imagen: 'https://example.com/casa.jpg',
  descripcion: '',
  candidatosCount: 0,
  fianzaMeses: 1,
  propietarioId: 'P1',
  propietarioPrincipalId: 'P1',
  fechaCreacion: '2026-01-01',
  datosFiscales: {
    propietarioPrincipal: {
      nombre: 'Ana',
      nifDni: '12345678Z',
      direccion: 'Calle Real 5, Sevilla',
      propietarioId: 'P1',
    },
    tieneSegundoPropietario: true,
    segundoPropietario: {
      nombre: 'Luis',
      nifDni: '87654321X',
      direccion: 'Calle Otra 9, Sevilla',
    },
  },
} as Inmueble;

function renderPortal(opts: { inmuebles?: Inmueble[]; onCrearInmueble?: () => void } = {}) {
  return render(
    <PropietarioPortalSection
      currentUser={USUARIO}
      inmuebles={opts.inmuebles ?? []}
      profesionales={[]}
      contratos={[]}
      especialidades={[]}
      propietarios={PROPIETARIOS}
      gastos={[]}
      incidencias={[]}
      onOpenCrearProfesionalModal={() => undefined}
      onSaveProfesional={() => Promise.resolve()}
      onCrearInmueble={opts.onCrearInmueble}
    />,
  );
}

function irAViviendas() {
  fireEvent.click(screen.getByRole('button', { name: /Mis Viviendas/i }));
}

describe('portal del propietario — tarjetas de vivienda (auditoría 2026-09-29)', () => {
  afterEach(() => cleanup());

  it('la lista de viviendas muestra precio real, superficie real y titularidad (y no campos inexistentes)', () => {
    renderPortal({ inmuebles: [VIVIENDA] });
    irAViviendas();

    // Precio real formateado (bug detectado: antes usaba campos inexistentes → undefined)
    expect(screen.queryByText(/undefined/)).toBeNull();
    expect(screen.getByText(/750\s*€\/mes/)).toBeTruthy();
    expect(screen.getByText(/80\s*m²/)).toBeTruthy();

    // Titularidad visible: titular + aviso de cotitular (no cuenta de acceso)
    expect(screen.getByText(/Titular:/)).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText(/\(\+1 cotitular\)/)).toBeTruthy();
  });

  it('la cabecera ofrece «Añadir vivienda» y lo conecta con el alta del ERP', () => {
    const onCrearInmueble = vi.fn();
    renderPortal({ inmuebles: [VIVIENDA], onCrearInmueble });
    irAViviendas();

    const boton = screen.getByRole('button', { name: /Añadir vivienda/i });
    expect(boton).toBeTruthy();
    fireEvent.click(boton);
    expect(onCrearInmueble).toHaveBeenCalledTimes(1);
  });

  it('el estado vacío explica la situación y ofrece el alta directamente', () => {
    const onCrearInmueble = vi.fn();
    renderPortal({ inmuebles: [], onCrearInmueble });
    irAViviendas();

    expect(screen.getByText(/No tienes viviendas asignadas/)).toBeTruthy();
    const cta = screen.getByRole('button', { name: /Dar de alta mi primera vivienda/i });
    fireEvent.click(cta);
    expect(onCrearInmueble).toHaveBeenCalledTimes(1);
  });

  it('sin onCrearInmueble los CTAs de alta no aparecen (montaje defensivo)', () => {
    renderPortal({ inmuebles: [] });
    irAViviendas();
    expect(screen.queryByRole('button', { name: /Dar de alta mi primera vivienda/i })).toBeNull();
  });
});
