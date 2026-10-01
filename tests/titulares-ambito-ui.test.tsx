/**
 * @vitest-environment jsdom
 *
 * TITULARES EN EL ÁMBITO DEL PROPIETARIO — INTERFAZ REAL (PR #19, 2026-10-01)
 * ===========================================================================
 * Modelo funcional: PROPIETARIO → Propietarios/Titulares → «Crear titular» → TANTOS como necesite →
 * cada ficha completa e independiente → después asignable a sus inmuebles. Sin límite numérico,
 * sin pasar por ningún administrador.
 *
 * Aquí se monta la interfaz REAL (`PropietariosSection`, `InmueblesSection`, `TitularidadesPanel`,
 * `PropietarioPortalSection`) con un anfitrión que conserva el estado, como hace `App.tsx`:
 *
 *   A · «Crear titular» se puede pulsar tantas veces como haga falta (1, 2, 3 … 12 altas seguidas),
 *       no desaparece al guardar, y no hay ningún mensaje de «acude al administrador».
 *   B · cada ficha conserva SUS datos fiscales: el formulario nace vacío y nada se copia de otra.
 *   C · un guardado rechazado deja el formulario abierto con lo escrito y el motivo visible.
 *   D · se asignan después a inmuebles propios: N-TITULARES (más de dos) en el alta y en el panel.
 *   E · NO se reintroduce el formulario de «segundo propietario».
 */
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { PropietariosSection } from '../src/components/sections/PropietariosSection';
import { InmueblesSection } from '../src/components/sections/InmueblesSection';
import { TitularidadesPanel } from '../src/components/titularidades/TitularidadesPanel';
import { PropietarioPortalSection } from '../src/components/sections/PropietarioPortalSection';
import { permisosTitulares } from '../src/utils/permisosTitulares';
import { esIdDeTitularDeAmbito, fichasVisiblesDelPropietario } from '../src/lib/titularesModelo';
import { asignarTitularesAlta } from '../src/lib/altaInmuebleTitulares';
import { ADMIN_MASTER_EMAIL } from '../src/lib/authService';
import { guardarTitularidad, subscribeTitularidadesEscopo } from '../src/lib/titularidadesFirestore';
import type { Inmueble, Propietario, UsuarioApp } from '../src/types';
import type { TitularesAltaInmueble } from '../src/lib/altaInmuebleTitulares';

vi.mock('../src/lib/titularidadesFirestore', () => ({
  subscribeTitularidadesEscopo: vi.fn((_a: unknown, cb: (t: unknown[]) => void) => { cb([]); return vi.fn(); }),
  guardarTitularidad: vi.fn(async () => true),
  cerrarTitularidad: vi.fn(async () => true),
  actualizarPorcentajeTitularidad: vi.fn(async () => true),
  marcarTitularPrincipal: vi.fn(async () => true),
}));
vi.mock('../src/feedback/confirmacion', async () => {
  const real = await vi.importActual<typeof import('../src/feedback/confirmacion')>('../src/feedback/confirmacion');
  return { ...real, confirmar: vi.fn(async () => ({ confirmado: true, texto: 'ok' })) };
});

// ─────────────────────────────────────────────────────────────────────────── fixtures
const base = { id: 'u1', authUid: 'uid_1', nombre: 'Usuario', estado: 'ACTIVO', activo: true, permisos: [] } as unknown as UsuarioApp;
const propietario: UsuarioApp = {
  ...base, email: 'prop1@correo.test', tipoPerfil: 'PROPIETARIO', roles: ['PROPIETARIO_ESTANDAR'], propietarioId: 'prop_1', inmuebleIds: [],
};
const master: UsuarioApp = { ...base, email: ADMIN_MASTER_EMAIL, tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'] };

function ficha(id: string, extra: Partial<Propietario> = {}): Propietario {
  return {
    id,
    nombre: `Titular ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: `600-${id}`,
    email: `${id.toLowerCase()}@correo.test`,
    direccion: `Calle ${id} 1`,
    ciudad: 'Alicante',
    codigoPostal: '03001',
    cuentasBancarias: [{ id: `cta-${id}`, alias: 'Principal', iban: `ES00 ${id}`, esPrincipal: true }],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
    ...extra,
  };
}
const idAmbito = (n: number) => `tit_${n.toString(36).padStart(10, '0')}`;
const delAmbito = (n: number, extra: Partial<Propietario> = {}) =>
  ficha(idAmbito(n), { nombre: `Cotitular ${n}`, nifCif: `${30000000 + n}Z`, ambitoPropietarioId: 'prop_1', ...extra });

interface DatosTitular { nombre: string; nif: string; telefono: string; email: string; direccion: string; cp: string; iban: string }
const datosDe = (n: number): DatosTitular => ({
  nombre: `Persona Número ${n}`,
  nif: `${20000000 + n}A`,
  telefono: `600${String(n).padStart(6, '0')}`,
  email: `persona${n}@correo.test`,
  direccion: `Calle Fiscal ${n}, ${n}º B`,
  cp: `0300${n % 10}`,
  iban: `ES91 2100 0418 4502 0005 ${String(1000 + n)}`,
});

/** Anfitrión con estado, como `App.tsx`: guarda en una lista y alimenta la sección con lo que ve el propietario. */
function Anfitrion(props: {
  usuario?: UsuarioApp;
  inicial?: Propietario[];
  inmuebles?: Inmueble[];
  onCrearInmueble?: (propietarioId: string) => void;
  onGuardar?: (p: Propietario) => Promise<void> | void;
}) {
  const usuario = props.usuario ?? propietario;
  const [guardadas, setGuardadas] = useState<Propietario[]>(props.inicial ?? []);
  const esMaster = usuario.email === ADMIN_MASTER_EMAIL;
  const visibles = esMaster ? guardadas : fichasVisiblesDelPropietario(guardadas, usuario);
  const permisos = permisosTitulares(usuario, visibles, ADMIN_MASTER_EMAIL);
  return (
    <PropietariosSection
      propietarios={visibles}
      inmuebles={props.inmuebles ?? []}
      onCrearInmueble={props.onCrearInmueble}
      puedeGestionar={permisos.puedeGestionar}
      puedeCrear={permisos.puedeCrear}
      puedeCrearFichaPropia={permisos.puedeCrearFichaPropia}
      ambitoPropietarioId={permisos.ambitoPropietarioId}
      fichasEditablesIds={permisos.fichasEditablesIds}
      idFichaPropia={permisos.idFichaPropia}
      onSavePropietario={async (p) => {
        await props.onGuardar?.(p);
        setGuardadas((previas) => (previas.some((x) => x.id === p.id) ? previas.map((x) => (x.id === p.id ? p : x)) : [p, ...previas]));
      }}
      onDeletePropietario={() => undefined}
    />
  );
}

async function crearTitularPorUI(datos: DatosTitular) {
  fireEvent.click(screen.getByTestId('boton-crear-titular'));
  const dialogo = await screen.findByRole('dialog', { name: 'Nuevo propietario' });
  const d = within(dialogo);
  fireEvent.change(d.getByPlaceholderText('Ej: Manuel Gómez Rodríguez'), { target: { value: datos.nombre } });
  fireEvent.change(d.getByPlaceholderText('Ej: 12345678Z o B-12345678'), { target: { value: datos.nif } });
  fireEvent.change(d.getByPlaceholderText('Ej: +34 600 000 000'), { target: { value: datos.telefono } });
  fireEvent.change(d.getByPlaceholderText('Ej: arrendador@email.com'), { target: { value: datos.email } });
  fireEvent.click(d.getByRole('button', { name: /2\. Domicilio/ }));
  fireEvent.change(d.getByPlaceholderText('Ej: Calle Gran Vía 28, 4º B'), { target: { value: datos.direccion } });
  fireEvent.change(d.getByPlaceholderText('28013'), { target: { value: datos.cp } });
  fireEvent.click(d.getByRole('button', { name: /4\. Cuentas IBAN/ }));
  fireEvent.click(d.getByRole('button', { name: /Añadir Cuenta/ }));
  fireEvent.change(d.getByPlaceholderText('Ej: BBVA Principal Alquileres'), { target: { value: `Cuenta de ${datos.nombre}` } });
  fireEvent.change(d.getByPlaceholderText('ES21 0182 1234 5678 9012 3456'), { target: { value: datos.iban } });
  fireEvent.click(d.getByRole('button', { name: 'Guardar Cuenta' }));
  fireEvent.click(d.getByRole('button', { name: /Crear Propietario/ }));
}
const dialogoAbierto = () => screen.queryByRole('dialog', { name: 'Nuevo propietario' });
const sinAlta = () => waitFor(() => expect(dialogoAbierto()).toBeNull());

const sinRemitirAAdministracion = () => {
  const texto = document.body.textContent || '';
  expect(texto).not.toMatch(/administrador/i);
  expect(texto).not.toMatch(/administraci[oó]n/i);
  expect(screen.queryByTestId('titulares-alta-administracion')).toBeNull();
};

beforeEach(() => vi.mocked(guardarTitularidad).mockClear());
afterEach(() => cleanup());

// ═════════════════════════════════════════════════════════════════════════════
// A · «Crear titular»: tantas veces como haga falta
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · A — «Crear titular» es reutilizable, sin límite y sin administrador', () => {
  it('A1 · 12 altas SEGUIDAS: el botón no desaparece, cada ficha lleva su ámbito y un id único', async () => {
    const guardadas: Propietario[] = [];
    render(<Anfitrion inicial={[ficha('prop_1')]} onGuardar={(p) => { guardadas.push(p); }} />);

    for (let n = 1; n <= 12; n++) {
      // El botón existe ANTES de cada alta (también tras guardar la anterior)…
      expect(screen.getByTestId('boton-crear-titular').textContent).toContain('Crear titular');
      expect((screen.getByTestId('boton-crear-titular') as HTMLButtonElement).disabled).toBe(false);
      await crearTitularPorUI(datosDe(n));
      await sinAlta();
      // …se confirma lo guardado y se invita a crear OTRO, sin ningún mensaje de administración…
      expect(screen.getByTestId('titular-guardado-aviso').textContent).toMatch(/crear otro titular/i);
      expect(guardadas).toHaveLength(n);
      sinRemitirAAdministracion();
    }

    expect(guardadas).toHaveLength(12);
    // Cada ficha: id reservado y ÚNICO, ámbito del propietario, sin ser su ficha de cuenta
    const ids = guardadas.map((p) => p.id);
    expect(new Set(ids).size).toBe(12);
    for (const p of guardadas) {
      expect(esIdDeTitularDeAmbito(p.id)).toBe(true);
      expect(p.id).not.toBe('prop_1');
      expect(p.ambitoPropietarioId).toBe('prop_1');
    }
    // y las 12 (más la propia) están en pantalla: ningún tope visible ni oculto
    for (let n = 1; n <= 12; n++) expect(screen.getByText(`Persona Número ${n}`)).toBeTruthy();
    expect(screen.getAllByTitle('Editar titular')).toHaveLength(13);
    expect(screen.getByTestId('boton-crear-titular')).toBeTruthy();
  }, 60_000);

  it('A2 · sin ninguna ficha propia ni de ámbito: «Crear titular» está igualmente, y «Crear primer titular» en el vacío', async () => {
    render(<Anfitrion />);
    expect(screen.getByTestId('boton-crear-titular')).toBeTruthy();
    expect(screen.getByTestId('boton-crear-primer-titular')).toBeTruthy();
    sinRemitirAAdministracion();
    fireEvent.click(screen.getByTestId('boton-crear-primer-titular'));
    expect(await screen.findByRole('dialog', { name: 'Nuevo propietario' })).toBeTruthy();
  });

  it('A3 · el aviso de la guía habla de crear tantos titulares como haga falta (cónyuge, copropietario, sociedad…)', () => {
    render(<Anfitrion inicial={[ficha('prop_1')]} />);
    const ayuda = screen.getByTestId('titulares-ambito-ayuda').textContent || '';
    expect(ayuda).toMatch(/tantos titulares como necesites/);
    expect(ayuda).toMatch(/cónyuge, copropietario, familiar, sociedad/);
    expect(ayuda).toMatch(/propios datos fiscales/);
    // ningún número en la guía ni en el botón
    expect(screen.getByTestId('boton-crear-titular').textContent).not.toMatch(/\d/);
  });

  it('A4 · el MASTER no cambia: crea la ficha de siempre (`prop-<fecha>`), sin ámbito', async () => {
    const guardadas: Propietario[] = [];
    render(<Anfitrion usuario={master} onGuardar={(p) => { guardadas.push(p); }} />);
    await crearTitularPorUI(datosDe(1));
    await sinAlta();
    expect(guardadas).toHaveLength(1);
    expect(guardadas[0].id).toMatch(/^prop-\d+$/);
    expect(guardadas[0].ambitoPropietarioId).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B · cada ficha conserva SUS datos fiscales
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · B — cada ficha es completa e independiente', () => {
  it('B1 · la segunda ficha NO es copia de la primera: el formulario nace vacío y cada una guarda lo suyo', async () => {
    const guardadas: Propietario[] = [];
    render(<Anfitrion inicial={[ficha('prop_1', { telefono: '699111111', direccion: 'Calle de la propia' })]} onGuardar={(p) => { guardadas.push(p); }} />);

    await crearTitularPorUI(datosDe(1));
    await sinAlta();

    // Reabrir: NINGÚN campo viene precargado con los datos de la ficha anterior ni de la propia.
    fireEvent.click(screen.getByTestId('boton-crear-titular'));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo propietario' });
    const d = within(dialogo);
    expect((d.getByPlaceholderText('Ej: Manuel Gómez Rodríguez') as HTMLInputElement).value).toBe('');
    expect((d.getByPlaceholderText('Ej: 12345678Z o B-12345678') as HTMLInputElement).value).toBe('');
    expect((d.getByPlaceholderText('Ej: +34 600 000 000') as HTMLInputElement).value).toBe('');
    expect((d.getByPlaceholderText('Ej: arrendador@email.com') as HTMLInputElement).value).toBe('');
    fireEvent.click(d.getByRole('button', { name: /2\. Domicilio/ }));
    expect((d.getByPlaceholderText('Ej: Calle Gran Vía 28, 4º B') as HTMLInputElement).value).toBe('');
    fireEvent.click(d.getByRole('button', { name: /4\. Cuentas IBAN \(0\)/ }));
    cleanup();

    // Alta completa de una segunda y una tercera, con datos DISTINTOS
    render(<Anfitrion inicial={[ficha('prop_1'), ...guardadas]} onGuardar={(p) => { guardadas.push(p); }} />);
    await crearTitularPorUI(datosDe(2));
    await sinAlta();
    await crearTitularPorUI(datosDe(3));
    await sinAlta();

    const [t1, t2, t3] = guardadas;
    for (const [t, n] of [[t1, 1], [t2, 2], [t3, 3]] as const) {
      const esperado = datosDe(n);
      expect(t.nombre).toBe(esperado.nombre);
      expect(t.nifCif).toBe(esperado.nif);
      expect(t.telefono).toBe(esperado.telefono);
      expect(t.email).toBe(esperado.email);
      expect(t.direccion).toBe(esperado.direccion);
      expect(t.codigoPostal).toBe(esperado.cp);
      expect(t.cuentasBancarias).toHaveLength(1);
      expect(t.cuentasBancarias[0].iban.replace(/\s/g, '')).toBe(esperado.iban.replace(/\s/g, ''));
    }
    // Ningún dato fiscal compartido entre fichas (NIF, IBAN, domicilio, teléfono) ni con la propia
    for (const campo of ['nifCif', 'telefono', 'direccion', 'email'] as const) {
      expect(new Set([t1[campo], t2[campo], t3[campo]]).size).toBe(3);
    }
    expect(new Set([t1, t2, t3].map((t) => t.cuentasBancarias[0].iban)).size).toBe(3);
    expect(new Set([t1, t2, t3].map((t) => t.cuentasBancarias[0].id)).size).toBe(3);
    for (const t of [t1, t2, t3]) {
      expect(t.nifCif).not.toBe('NIF-prop_1');
      expect(t.direccion).not.toBe('Calle de la propia');
    }
  }, 60_000);

  it('B2 · editar una ficha NO toca a las demás, y conserva su id y su ámbito', async () => {
    const t1 = delAmbito(1, { nifCif: '30000001Z' });
    const t2 = delAmbito(2, { nifCif: '30000002Z' });
    const guardadas: Propietario[] = [];
    render(<Anfitrion inicial={[ficha('prop_1'), t1, t2]} onGuardar={(p) => { guardadas.push(p); }} />);

    // la tarjeta del segundo (las acciones de edición van en su propia tarjeta)
    const tarjetas = screen.getAllByTitle('Editar titular');
    expect(tarjetas).toHaveLength(3);
    const tarjetaDe = (nombre: string) => screen.getByText(nombre).closest('div.bg-white.rounded-2xl') as HTMLElement;
    fireEvent.click(within(tarjetaDe('Cotitular 2')).getByTitle('Editar titular'));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar propietario' });
    fireEvent.change(within(dialogo).getByPlaceholderText('Ej: +34 600 000 000'), { target: { value: '688888888' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Guardar Cambios/ }));
    await waitFor(() => expect(guardadas).toHaveLength(1));

    expect(guardadas[0]).toMatchObject({ id: t2.id, ambitoPropietarioId: 'prop_1', telefono: '688888888', nifCif: '30000002Z' });
    // la otra ficha ni se guardó ni cambió
    expect(guardadas.some((p) => p.id === t1.id)).toBe(false);
    expect(screen.getByText('Cotitular 1')).toBeTruthy();
  });

  it('B4 · un titular asignado por N-TITULARES figura con SUS inmuebles; «Crear inmueble» solo cuelga de la ficha propia', () => {
    const inmuebles = [
      { id: 'inm-1', direccion: 'Calle Mayor 1', propietarioId: 'prop_1', titularesIds: ['prop_1', idAmbito(1)] },
      { id: 'inm-2', direccion: 'Calle Sol 2', propietarioId: 'prop_1', titularesIds: ['prop_1', idAmbito(1), idAmbito(3)] },
      { id: 'inm-3', direccion: 'Calle Luna 3', propietarioId: 'prop_1', titularesIds: ['prop_1'] },
    ] as unknown as Inmueble[];
    const alCrear = vi.fn();
    render(
      <Anfitrion
        inicial={[ficha('prop_1'), delAmbito(1), delAmbito(2), delAmbito(3)]}
        inmuebles={inmuebles}
        onCrearInmueble={alCrear}
      />,
    );
    const tarjeta = (nombre: string) => screen.getByText(nombre).closest('div.bg-white.rounded-2xl') as HTMLElement;
    expect(within(tarjeta('Cotitular 1')).getByText('Inmuebles Asignados (2)')).toBeTruthy();
    expect(within(tarjeta('Cotitular 2')).getByText('Inmuebles Asignados (0)')).toBeTruthy();
    expect(within(tarjeta('Cotitular 3')).getByText('Inmuebles Asignados (1)')).toBeTruthy();
    expect(within(tarjeta('Titular prop_1')).getByText('Inmuebles Asignados (3)')).toBeTruthy();
    // el alta de inmueble cuelga SOLO de la ficha propia (las Rules de `inmuebles` exigen su propietarioId)
    expect(screen.getAllByText('Crear inmueble')).toHaveLength(1);
    fireEvent.click(within(tarjeta('Titular prop_1')).getByText('Crear inmueble'));
    expect(alCrear).toHaveBeenCalledWith('prop_1');
  });

  it('B5 · el master conserva «Crear inmueble» sobre cualquier ficha', () => {
    render(<Anfitrion usuario={master} inicial={[ficha('prop-a'), ficha('prop-b')]} onCrearInmueble={() => undefined} />);
    expect(screen.getAllByText('Crear inmueble')).toHaveLength(2);
  });

  it('B3 · «Añadir IBAN» sobre un titular de su ámbito conserva el ámbito (la regla de edición lo exige)', async () => {
    const t1 = delAmbito(1);
    const guardadas: Propietario[] = [];
    render(<Anfitrion inicial={[ficha('prop_1'), t1]} onGuardar={(p) => { guardadas.push(p); }} />);
    const tarjeta = screen.getByText('Cotitular 1').closest('div.bg-white.rounded-2xl') as HTMLElement;
    fireEvent.click(within(tarjeta).getByText('Añadir IBAN'));
    const dialogo = await screen.findByRole('dialog', { name: 'Añadir cuenta bancaria (IBAN)' });
    fireEvent.change(within(dialogo).getByPlaceholderText('ES21 0182 1234 5678 9012 3456'), { target: { value: 'ES7620770024003102575766' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar IBAN' }));
    await waitFor(() => expect(guardadas).toHaveLength(1));
    expect(guardadas[0].id).toBe(t1.id);
    expect(guardadas[0].ambitoPropietarioId).toBe('prop_1');
    expect(guardadas[0].cuentasBancarias).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C · un guardado rechazado no se pierde ni se disfraza
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · C — el fallo de guardado es visible y no cierra el formulario', () => {
  it('C1 · permisos rechazados: el formulario sigue abierto con lo escrito, el motivo se ve y NO remite a un administrador; se puede reintentar', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let intentos = 0;
    render(
      <Anfitrion
        inicial={[ficha('prop_1')]}
        onGuardar={async () => {
          intentos++;
          if (intentos === 1) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
        }}
      />,
    );
    await crearTitularPorUI(datosDe(1));
    const error = await screen.findByTestId('titular-error-guardado');
    // sigue abierto, con lo escrito
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo propietario' });
    fireEvent.click(within(dialogo).getByRole('button', { name: /1\. Datos Fiscales/ }));
    expect((within(dialogo).getByPlaceholderText('Ej: Manuel Gómez Rodríguez') as HTMLInputElement).value).toBe('Persona Número 1');
    // el motivo es legible, sin detalles del SDK y sin mandar a nadie
    expect(error.textContent).toMatch(/rechazado el guardado/i);
    expect(error.textContent).toMatch(/puedes volver a intentarlo/i);
    expect(error.textContent).not.toMatch(/administrador|administraci[oó]n|Missing or insufficient/i);
    expect((within(dialogo).getByRole('button', { name: /Crear Propietario/ }) as HTMLButtonElement).disabled).toBe(false);
    // no hay confirmación de «creado» mientras no se guardó
    expect(screen.queryByTestId('titular-guardado-aviso')).toBeNull();

    // reintento correcto: se cierra y se confirma
    fireEvent.click(within(dialogo).getByRole('button', { name: /Crear Propietario/ }));
    await sinAlta();
    expect(screen.getByTestId('titular-guardado-aviso')).toBeTruthy();
    expect(intentos).toBe(2);
    consola.mockRestore();
  }, 30_000);

  it('C2 · un doble envío mientras se guarda NO crea dos fichas (el botón se bloquea)', async () => {
    let liberar: () => void = () => undefined;
    const guardar = vi.fn(() => new Promise<void>((resolver) => { liberar = resolver; }));
    render(<Anfitrion inicial={[ficha('prop_1')]} onGuardar={guardar} />);
    await crearTitularPorUI(datosDe(1));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo propietario' });
    const boton = await within(dialogo).findByRole('button', { name: /Guardando/ });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(boton);
    fireEvent.submit(dialogo.querySelector('form') as HTMLFormElement);
    expect(guardar).toHaveBeenCalledTimes(1);
    liberar();
    await sinAlta();
    expect(guardar).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('C3 · duplicado por NIF dentro del ámbito: no se crea una segunda ficha para la misma persona', async () => {
    const guardar = vi.fn();
    render(<Anfitrion inicial={[ficha('prop_1'), delAmbito(1, { nifCif: `${20000001}A` })]} onGuardar={guardar} />);
    await crearTitularPorUI(datosDe(1)); // mismo NIF que `delAmbito(1)`
    // (el aviso sale al teclear el NIF y otra vez como error del campo al intentar guardar)
    expect((await screen.findAllByText(/Ya existe un titular con este NIF/i)).length).toBeGreaterThanOrEqual(2);
    expect(guardar).not.toHaveBeenCalled();
    expect(dialogoAbierto()).not.toBeNull();
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// «Crear mi ficha» es secundaria y solo si falta la propia
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · ficha propia — «Crear mi ficha de titular» solo si falta, «Crear titular» siempre', () => {
  it('sin ficha propia: ambos botones; la propia se crea con SU id y sin ámbito; después solo queda «Crear titular»', async () => {
    const guardadas: Propietario[] = [];
    render(<Anfitrion onGuardar={(p) => { guardadas.push(p); }} />);
    expect(screen.getByTestId('boton-crear-titular')).toBeTruthy();
    expect(screen.getByTestId('boton-crear-mi-ficha').textContent).toContain('Crear mi ficha de titular');

    fireEvent.click(screen.getByTestId('boton-crear-mi-ficha'));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo propietario' });
    expect(within(dialogo).getByText('Mi ficha de titular')).toBeTruthy();
    fireEvent.change(within(dialogo).getByPlaceholderText('Ej: Manuel Gómez Rodríguez'), { target: { value: 'Yo Mismo' } });
    fireEvent.change(within(dialogo).getByPlaceholderText('Ej: 12345678Z o B-12345678'), { target: { value: '12345678Z' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Crear Propietario/ }));
    await sinAlta();

    expect(guardadas[0]).toMatchObject({ id: 'prop_1', nifCif: '12345678Z' });
    expect(guardadas[0].ambitoPropietarioId).toBeUndefined();
    expect(screen.queryByTestId('boton-crear-mi-ficha')).toBeNull();
    expect(screen.getByTestId('boton-crear-titular')).toBeTruthy();
    expect(screen.getByTestId('insignia-ficha-propia-prop_1')).toBeTruthy();

    // y a partir de aquí cada «Crear titular» es una ficha NUEVA de ámbito
    await crearTitularPorUI(datosDe(2));
    await sinAlta();
    expect(guardadas[1].ambitoPropietarioId).toBe('prop_1');
    expect(guardadas[1].id).not.toBe('prop_1');
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// D · se asignan después a inmuebles propios — N-TITULARES (más de dos)
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · D — asignación a inmuebles autorizados con N titulares', () => {
  const titularesAmbito = Array.from({ length: 6 }, (_, i) => delAmbito(i + 1));
  const propia = ficha('prop_1', { nombre: 'Titular propia', nifCif: '12345678Z' });

  function altaPropietario(onAdd: (i: Inmueble, t?: TitularesAltaInmueble) => void) {
    render(
      <InmueblesSection
        inmuebles={[]}
        candidatos={[]}
        propietarios={[propia, ...titularesAmbito]}
        onSelectCandidate={() => undefined}
        onAddInmueble={onAdd}
        onNavigateToPropietarios={() => undefined}
        currentUser={propietario}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apartado Fiscal/ }));
  }

  it('D1 · en el alta: el principal es SU ficha y los titulares de su ámbito se marcan como «otros» (5 en total, sin límite binario)', () => {
    const onAdd = vi.fn<(i: Inmueble, t?: TitularesAltaInmueble) => void>();
    altaPropietario(onAdd);

    // El principal ofrecido es solo la ficha propia (las Rules de `inmuebles` lo exigen)
    const selector = screen.getAllByRole('combobox').find((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.textContent?.includes('Selecciona un titular existente')),
    ) as HTMLSelectElement;
    const opciones = Array.from(selector.options).map((o) => o.textContent || '');
    expect(opciones.filter((o) => o.includes('Cotitular'))).toHaveLength(0);
    expect(opciones.some((o) => o.includes('Titular propia'))).toBe(true);

    // Los 6 titulares de su ámbito están disponibles como «otros titulares»…
    const lista = screen.getByRole('list', { name: 'Otros titulares registrados' });
    expect(within(lista).getAllByRole('checkbox')).toHaveLength(6);
    // …se marcan 4 (principal + 4 = 5 titulares)
    for (const n of [1, 2, 3, 4]) fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`Cotitular ${n} `) }));
    expect(screen.getByTestId('alta-resumen-titulares').textContent).toMatch(/principal Titular propia/);
    expect(screen.getByTestId('alta-resumen-titulares').textContent).toMatch(/otros: .*Cotitular 2.*Cotitular 3.*Cotitular 4/);

    fireEvent.click(screen.getByRole('button', { name: /Datos Generales y Vivienda/ }));
    fireEvent.change(screen.getByPlaceholderText('Ej. Calle Gran Vía 42, 3ºB'), { target: { value: 'Calle Mayor 1' } });
    fireEvent.change(screen.getByPlaceholderText('Ej. Madrid'), { target: { value: 'Alicante' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [inmueble, titulares] = onAdd.mock.calls[0];
    expect(inmueble.propietarioId).toBe('prop_1'); // titular económico: la ficha propia
    expect(titulares?.titularesIds).toEqual(['prop_1', idAmbito(1), idAmbito(2), idAmbito(3), idAmbito(4)]);
  });

  it('D2 · tras guardar el inmueble se persiste UNA titularidad por titular (6, PENDIENTES, sin inventar porcentajes)', async () => {
    const guardar = vi.fn(async () => true);
    const ids = ['prop_1', ...titularesAmbito.map((t) => t.id)];
    const resultado = await asignarTitularesAlta({
      inmuebleId: 'inm-1',
      titularesIds: ids,
      nombres: Object.fromEntries([propia, ...titularesAmbito].map((p) => [p.id, p.nombre])),
      guardar,
    });
    expect(resultado.asignados).toEqual(ids);
    expect(guardar).toHaveBeenCalledTimes(7);
    for (const [alta] of guardar.mock.calls as unknown as Array<[{ propietarioId: string; porcentaje: number | null }]>) {
      expect(alta.porcentaje).toBeNull();
    }
    expect(new Set((guardar.mock.calls as unknown as Array<[{ propietarioId: string }]>).map(([a]) => a.propietarioId)).size).toBe(7);
  });

  it('D3 · en una vivienda ya creada: «Añadir titular» ofrece TODOS sus titulares (30) sin servidor, con el porcentaje conocido o PENDIENTE', async () => {
    const treinta = Array.from({ length: 30 }, (_, i) => ({ id: idAmbito(i + 1), nombre: `Cotitular ${i + 1}` }));
    const alAnadir = vi.fn(async () => undefined);
    const alBuscar = vi.fn(async () => []);
    const inmueble = { id: 'inm-1', direccion: 'Calle Mayor 1', propietarioId: 'prop_1', titularesIds: ['prop_1'] } as unknown as Inmueble;
    render(
      <TitularidadesPanel
        inmueble={inmueble}
        titularidades={[]}
        puedeGestionar
        onAnadirTitular={alAnadir}
        onBuscarTitulares={alBuscar}
        candidatosLocales={treinta}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    const lista = screen.getByTestId('titulares-locales');
    // TODOS, sin tope: 30 titulares ofrecidos
    expect(within(lista).getAllByRole('button')).toHaveLength(30);
    expect(lista.textContent).toContain('Tus titulares (30)');
    // el cuadro de búsqueda también los filtra, localmente
    fireEvent.change(screen.getByLabelText(/Buscar titular/i), { target: { value: 'Cotitular 3' } });
    expect(within(screen.getByTestId('titulares-locales')).getAllByRole('button').length).toBeGreaterThanOrEqual(1);
    fireEvent.change(screen.getByLabelText(/Buscar titular/i), { target: { value: '' } });

    // se elige uno y se confirma con porcentaje conocido
    fireEvent.click(screen.getByTestId(`titular-local-${idAmbito(7)}`));
    fireEvent.change(screen.getByLabelText(/Porcentaje \(opcional\)/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar alta de Cotitular 7/i }));
    await waitFor(() => expect(alAnadir).toHaveBeenCalledWith('inm-1', idAmbito(7), 25));
    // y otro SIN porcentaje = PENDIENTE (nunca 50/50)
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    fireEvent.click(screen.getByTestId(`titular-local-${idAmbito(8)}`));
    fireEvent.click(screen.getByRole('button', { name: /Confirmar alta de Cotitular 8/i }));
    await waitFor(() => expect(alAnadir).toHaveBeenCalledWith('inm-1', idAmbito(8), null));
    // no se ha usado el servidor para nada de esto (el término < 3 caracteres ni lo consulta)
    expect(alBuscar).not.toHaveBeenCalled();
  }, 30_000);

  it('D4 · quien ya es titular figura «Ya es titular» y no se puede añadir dos veces', () => {
    const inmueble = { id: 'inm-1', direccion: 'Calle Mayor 1', propietarioId: 'prop_1', titularesIds: ['prop_1', idAmbito(1)] } as unknown as Inmueble;
    render(
      <TitularidadesPanel
        inmueble={inmueble}
        titularidades={[{ id: `inm-1__${idAmbito(1)}`, inmuebleId: 'inm-1', propietarioId: idAmbito(1), estado: 'VIGENTE', porcentajeTitularidad: null } as never]}
        puedeGestionar
        onAnadirTitular={async () => undefined}
        candidatosLocales={[{ id: idAmbito(1), nombre: 'Cotitular 1' }, { id: idAmbito(2), nombre: 'Cotitular 2' }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
    expect((screen.getByTestId(`titular-local-${idAmbito(1)}`) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByTestId('titulares-locales')).getByText('Ya es titular')).toBeTruthy();
    expect((screen.getByTestId(`titular-local-${idAmbito(2)}`) as HTMLButtonElement).disabled).toBe(false);
  });

  it('D5 · Portal del propietario: añade 3 titulares seguidos a su vivienda sin tocar el servidor de búsqueda', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const vivienda = {
      id: 'VIV1', direccion: 'Calle Mayor 1', alias: 'Piso Centro', ciudad: 'Alicante', precio: 900, estado: 'alquilado',
      habitaciones: 2, banos: 1, superficie: 70, candidatosCount: 0, fianzaMeses: 1, propietarioId: 'prop_1', titularesIds: ['prop_1'],
    } as unknown as Inmueble;
    render(
      <PropietarioPortalSection
        currentUser={propietario}
        inmuebles={[vivienda]}
        profesionales={[]}
        contratos={[]}
        especialidades={[]}
        propietarios={[propia]}
        titularesDisponibles={[propia, ...titularesAmbito]}
      />,
    );
    expect(subscribeTitularidadesEscopo).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Titulares \/ Titularidades/i }));
    for (const n of [1, 2, 3]) {
      fireEvent.click(screen.getByRole('button', { name: /Añadir titular/i }));
      fireEvent.click(screen.getByTestId(`titular-local-${idAmbito(n)}`));
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Confirmar alta de Cotitular ${n}`, 'i') }));
      await waitFor(() => expect(guardarTitularidad).toHaveBeenCalledTimes(n));
    }
    const llamadas = vi.mocked(guardarTitularidad).mock.calls.map(([alta]) => alta);
    expect(llamadas.map((a) => a.propietarioId)).toEqual([idAmbito(1), idAmbito(2), idAmbito(3)]);
    expect(llamadas.every((a) => a.inmuebleId === 'VIV1' && a.porcentaje === null)).toBe(true);
    // el nombre del titular viaja con la titularidad (se conoce por la lista de su ámbito)
    expect(llamadas.map((a) => a.propietarioNombre)).toEqual(['Cotitular 1', 'Cotitular 2', 'Cotitular 3']);
    expect(fetchMock).not.toHaveBeenCalled();
  }, 30_000);
});

// ═════════════════════════════════════════════════════════════════════════════
// E · NO se reintroduce «segundo propietario»
// ═════════════════════════════════════════════════════════════════════════════
describe('Titulares de ámbito · E — no hay formulario de «segundo propietario»', () => {
  it('E1 · el alta de inmueble del propietario solo asigna titulares EXISTENTES: ningún campo ni casilla de segundo propietario', () => {
    render(
      <InmueblesSection
        inmuebles={[]}
        candidatos={[]}
        propietarios={[ficha('prop_1'), delAmbito(1), delAmbito(2)]}
        onSelectCandidate={() => undefined}
        onAddInmueble={() => undefined}
        onNavigateToPropietarios={() => undefined}
        currentUser={propietario}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
    fireEvent.click(screen.getByRole('button', { name: /Apartado Fiscal/ }));
    expect(screen.queryByText(/segundo propietario/i)).toBeNull();
    expect(screen.queryByText(/2º propietario/i)).toBeNull();
    expect(screen.queryByLabelText(/segundo propietario/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/segundo propietario/i)).toBeNull();
    expect(screen.getByTestId('alta-titulares-adicionales').textContent).toContain('Otros titulares del inmueble');
    // el botón de cabecera lleva a CREAR titulares (Propietarios/Titulares), no a pedírselos a nadie
    expect(screen.getByRole('button', { name: /Crear titular en Propietarios\/Titulares/ })).toBeTruthy();
  });

  it('E2 · la sección de titulares no contiene campos de segundo propietario', () => {
    render(<Anfitrion inicial={[ficha('prop_1'), delAmbito(1)]} />);
    fireEvent.click(screen.getByTestId('boton-crear-titular'));
    expect(document.body.textContent).not.toMatch(/segundo propietario|2º propietario/i);
  });
});
