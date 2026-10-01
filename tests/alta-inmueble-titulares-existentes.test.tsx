/**
 * @vitest-environment jsdom
 *
 * ALTA DE INMUEBLE CON TITULARES EXISTENTES (N-TITULARES)
 * ========================================================
 * Se monta el `InmueblesSection` REAL. El alta ya NO incluye el flujo
 * «Nuevo inmueble → crear segundo propietario → crear titular dentro del alta»
 * (diseño descartado): trabaja siempre con titulares que YA EXISTEN.
 *
 *  D · seleccionar un titular existente en el alta
 *  E · N titulares A/B/C (no binario) y persistencia de sus titularidades
 *  F · el alta no depende de ningún flujo de creación de propietario secundario
 *  G · aislamiento entre titulares (A → 1,2,3 · B → 1,4; sin personas duplicadas)
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { InmueblesSection } from '../src/components/sections/InmueblesSection';
import { PropietarioPortalSection } from '../src/components/sections/PropietarioPortalSection';
import { subscribeTitularidadesEscopo } from '../src/lib/titularidadesFirestore';
import {
  MENSAJE_TITULAR_INEXISTENTE,
  asignarTitularesAlta,
  fiscalDesdePropietario,
  resolverTitularesAlta,
} from '../src/lib/altaInmuebleTitulares';
import { clavesTitularidadesIndexadas } from '../src/utils/titularidadesEngine';
import type { Inmueble, Propietario, UsuarioApp } from '../src/types';
import type { TitularesAltaInmueble } from '../src/lib/altaInmuebleTitulares';

vi.mock('../src/lib/titularidadesFirestore', () => ({
  subscribeTitularidadesEscopo: vi.fn((_alcance: unknown, cb: (t: unknown[]) => void) => {
    cb([]);
    return vi.fn();
  }),
  guardarTitularidad: vi.fn(async () => true),
  cerrarTitularidad: vi.fn(async () => true),
}));

const raiz = (rel: string) => resolve(process.cwd(), rel);

function propietario(id: string, extra: Partial<Propietario> = {}): Propietario {
  return {
    id,
    nombre: `Titular ${id}`,
    nifCif: `NIF-${id}`,
    tipoPropietario: 'persona_fisica',
    telefono: `600-${id}`,
    email: `${id.toLowerCase()}@correo.test`,
    direccion: `Calle ${id}`,
    ciudad: 'Madrid',
    codigoPostal: '28001',
    cuentasBancarias: [{ id: `cta-${id}`, alias: 'Principal', iban: `ES00${id}`, esPrincipal: true }],
    fechaCreacion: '2026-01-01',
    fechaActualizacion: '2026-01-01',
    ...extra,
  };
}

const A = propietario('A');
const B = propietario('B');
const C = propietario('C');
const D = propietario('D');

type OnAdd = (inmueble: Inmueble, titulares?: TitularesAltaInmueble) => void;

function montarAlta(opts: { propietarios: Propietario[]; onAdd: OnAdd; usuario?: UsuarioApp }) {
  return render(
    <InmueblesSection
      inmuebles={[]}
      candidatos={[]}
      propietarios={opts.propietarios}
      onSelectCandidate={() => undefined}
      onAddInmueble={opts.onAdd}
      currentUser={opts.usuario}
    />,
  );
}

function usuarioPropietario(propietarioId: string): UsuarioApp {
  return {
    id: `u-${propietarioId}`,
    nombre: `Usuario ${propietarioId}`,
    email: `${propietarioId.toLowerCase()}@correo.test`,
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    roles: ['PROPIETARIO_ESTANDAR'],
    permisos: [],
    propietarioId,
    inmuebleIds: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  } as UsuarioApp;
}

const abrirAlta = () => fireEvent.click(screen.getByRole('button', { name: /Nuevo Inmueble/ }));
const irAFiscal = () => fireEvent.click(screen.getByRole('button', { name: /Apartado Fiscal/ }));
const irAGeneral = () => fireEvent.click(screen.getByRole('button', { name: /Datos Generales y Vivienda/ }));
const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar Inmueble' }));

function rellenarMinimo(direccion = 'Calle Mayor 1') {
  fireEvent.change(screen.getByPlaceholderText('Ej. Calle Gran Vía 42, 3ºB'), { target: { value: direccion } });
  fireEvent.change(screen.getByPlaceholderText('Ej. Madrid'), { target: { value: 'Sevilla' } });
}

function selectorPrincipal(): HTMLSelectElement {
  // ORDEN 4: el alta sólo ofrece TITULARES EXISTENTES (nunca «Asignación manual»),
  // así que el selector se localiza por su nombre accesible estable.
  const el = screen.getAllByRole('combobox').find((nodo) =>
    Array.from((nodo as HTMLSelectElement).options).some((o) =>
      o.textContent?.includes('Selecciona un titular existente'),
    ),
  );
  if (!el) throw new Error('No está el selector del titular principal');
  return el as HTMLSelectElement;
}

const casilla = (nombre: string) => screen.getByRole('checkbox', { name: new RegExp(nombre) }) as HTMLInputElement;

/** Alta de principal (+ adicionales por orden de elección) y guardado. */
function altaConTitulares(principal: string, adicionales: string[] = [], direccion = 'Calle Mayor 1') {
  abrirAlta();
  irAFiscal();
  fireEvent.change(selectorPrincipal(), { target: { value: principal } });
  for (const id of adicionales) fireEvent.click(casilla(`Titular ${id}`));
  irAGeneral();
  rellenarMinimo(direccion);
  guardar();
}

afterEach(() => cleanup());

describe('D · seleccionar un titular EXISTENTE en el alta', () => {
  it('el titular elegido de la lista queda como principal y el alta no crea ninguna persona', () => {
    const onAdd = vi.fn<OnAdd>();
    const propietarios = [A, B];
    montarAlta({ propietarios, onAdd });

    altaConTitulares('A');

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [creado, titulares] = onAdd.mock.calls[0];
    expect(creado.propietarioId).toBe('A');
    expect(creado.propietarioPrincipalId).toBe('A');
    // Referencia a la entidad existente (no una persona nueva tecleada).
    expect(creado.datosFiscales?.propietarioPrincipal.propietarioId).toBe('A');
    expect(creado.datosFiscales?.propietarioPrincipal.nombre).toBe('Titular A');
    expect(creado.datosFiscales?.propietarioPrincipal.nifDni).toBe('NIF-A');
    expect(titulares).toEqual({ titularesIds: ['A'] });
    // Ningún propietario nuevo: la lista de entidades sigue siendo la misma.
    expect(propietarios.map((p) => p.id)).toEqual(['A', 'B']);
  });

  it('muestra el aviso claro cuando el titular no existe, sin abrir ningún subproceso de creación', () => {
    montarAlta({ propietarios: [A], onAdd: vi.fn<OnAdd>() });
    abrirAlta();
    irAFiscal();

    const aviso = screen.getByTestId('aviso-titular-inexistente');
    expect(aviso.textContent).toBe(
      'Este titular todavía no existe. Créalo desde Propietarios/Titulares y después asígnalo a este inmueble.',
    );
    expect(aviso.textContent).toBe(MENSAJE_TITULAR_INEXISTENTE);
    // Sin subproceso: ningún botón/diálogo de «crear titular/propietario» dentro del alta.
    expect(screen.queryByRole('button', { name: /crear (titular|propietario)/i })).toBeNull();
    expect(screen.queryByRole('dialog', { name: /(nuevo|crear) (titular|propietario)/i })).toBeNull();
  });

  it('sin otros titulares registrados lo dice y el alta sigue siendo posible con el principal', () => {
    const onAdd = vi.fn<OnAdd>();
    montarAlta({ propietarios: [A], onAdd });
    abrirAlta();
    irAFiscal();
    // Mientras no hay principal, los demás titulares no se pueden marcar.
    expect(casilla('Titular A').disabled).toBe(true);
    expect(screen.getByText(/Selecciona primero el titular principal/)).toBeTruthy();
    // Con A como principal no queda nadie más que asignar.
    fireEvent.change(selectorPrincipal(), { target: { value: 'A' } });
    expect(screen.getByText(/No hay otros titulares registrados/)).toBeTruthy();
    irAGeneral();
    rellenarMinimo();
    guardar();
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][1]).toEqual({ titularesIds: ['A'] });
  });
});

describe('E · N titulares A/B/C (no binario)', () => {
  it('A principal + B, C y D: los N titulares viajan al host, principal primero y en orden de elección', () => {
    const onAdd = vi.fn<OnAdd>();
    montarAlta({ propietarios: [A, B, C, D], onAdd });

    altaConTitulares('A', ['C', 'B', 'D']);

    const [creado, titulares] = onAdd.mock.calls[0];
    expect(titulares).toEqual({ titularesIds: ['A', 'C', 'B', 'D'] });
    expect(creado.propietarioId).toBe('A');
    // Campo heredado (modelo binario aún consumido por contratos): el primer adicional.
    expect(creado.propietarioSecundarioId).toBe('C');
    expect(creado.datosFiscales?.tieneSegundoPropietario).toBe(true);
    expect(creado.datosFiscales?.segundoPropietario?.propietarioId).toBe('C');
    expect(creado.datosFiscales?.segundoPropietario?.nifDni).toBe('NIF-C');
    // El modelo no limita a «principal + secundario»: hay más de dos titulares.
    expect(titulares?.titularesIds.length).toBeGreaterThan(2);
  });

  it('resume quién es principal, secundario y otros mientras se elige', () => {
    montarAlta({ propietarios: [A, B, C], onAdd: vi.fn<OnAdd>() });
    abrirAlta();
    irAFiscal();
    fireEvent.change(selectorPrincipal(), { target: { value: 'A' } });
    fireEvent.click(casilla('Titular B'));
    fireEvent.click(casilla('Titular C'));
    const resumen = screen.getByTestId('alta-resumen-titulares').textContent ?? '';
    expect(resumen).toContain('principal Titular A');
    expect(resumen).toContain('secundario Titular B');
    expect(resumen).toContain('otros: Titular C');
  });

  it('cambiar el principal a alguien ya marcado como adicional lo saca de los adicionales (sin duplicar)', () => {
    const onAdd = vi.fn<OnAdd>();
    montarAlta({ propietarios: [A, B, C], onAdd });
    abrirAlta();
    irAFiscal();
    fireEvent.change(selectorPrincipal(), { target: { value: 'A' } });
    fireEvent.click(casilla('Titular B'));
    fireEvent.change(selectorPrincipal(), { target: { value: 'B' } });
    irAGeneral();
    rellenarMinimo();
    guardar();
    const [, titulares] = onAdd.mock.calls[0];
    expect(titulares).toEqual({ titularesIds: ['B'] });
  });

  it('los adicionales no se arrastran al siguiente alta', () => {
    const onAdd = vi.fn<OnAdd>();
    montarAlta({ propietarios: [A, B, C], onAdd });
    altaConTitulares('A', ['B', 'C']);
    expect(onAdd.mock.calls[0][1]).toEqual({ titularesIds: ['A', 'B', 'C'] });

    abrirAlta();
    irAFiscal();
    fireEvent.change(selectorPrincipal(), { target: { value: 'A' } });
    expect(casilla('Titular B').checked).toBe(false);
    expect(casilla('Titular C').checked).toBe(false);
  });

  it('persistencia: cada titular existente recibe su titularidad PENDIENTE (sin inventar porcentajes) y sin duplicar', async () => {
    const guardado: Array<{ inmuebleId: string; propietarioId: string; porcentaje?: number | null; nombre?: string }> = [];
    const resultado = await asignarTitularesAlta({
      inmuebleId: 'inm-1',
      titularesIds: ['A', 'B', 'C', 'B'],
      nombres: { A: 'Titular A', B: 'Titular B', C: 'Titular C' },
      actor: { id: 'u-1', nombre: 'Ana' },
      guardar: async (alta) => {
        guardado.push({
          inmuebleId: alta.inmuebleId,
          propietarioId: alta.propietarioId,
          porcentaje: alta.porcentaje,
          nombre: alta.propietarioNombre,
        });
        return true;
      },
    });
    expect(resultado).toEqual({ asignados: ['A', 'B', 'C'], fallidos: [] });
    expect(guardado.map((g) => g.propietarioId)).toEqual(['A', 'B', 'C']);
    // PENDIENTE: ni 100, ni 50/50, ni 33/33/34.
    expect(guardado.every((g) => g.porcentaje === null)).toBe(true);
    expect(guardado.every((g) => g.inmuebleId === 'inm-1')).toBe(true);
    expect(guardado[0].nombre).toBe('Titular A');
  });

  it('un fallo de persistencia de un titular se informa y no impide intentar los demás', async () => {
    const intentos: string[] = [];
    const resultado = await asignarTitularesAlta({
      inmuebleId: 'inm-1',
      titularesIds: ['A', 'B', 'C'],
      guardar: async (alta) => {
        intentos.push(alta.propietarioId);
        if (alta.propietarioId === 'B') throw new Error('permission-denied');
        return alta.propietarioId !== 'C';
      },
    });
    expect(intentos).toEqual(['A', 'B', 'C']);
    expect(resultado.asignados).toEqual(['A']);
    expect(resultado.fallidos).toEqual(['B', 'C']);
  });

  it('las titularidades se escriben DESPUÉS de que el inmueble exista (orden exigido por las Rules)', async () => {
    // Doble que replica la restricción de `titularidades.create`: el ámbito se
    // comprueba con `get(inmuebles/{id})`, es decir, sobre el inmueble ya guardado.
    const inmueblesGuardados = new Set<string>();
    const guardar = async (alta: { inmuebleId: string }) => inmueblesGuardados.has(alta.inmuebleId);

    const antes = await asignarTitularesAlta({ inmuebleId: 'inm-1', titularesIds: ['A', 'B'], guardar });
    expect(antes.fallidos).toEqual(['A', 'B']);

    inmueblesGuardados.add('inm-1');
    const despues = await asignarTitularesAlta({ inmuebleId: 'inm-1', titularesIds: ['A', 'B'], guardar });
    expect(despues.asignados).toEqual(['A', 'B']);

    // …y App.tsx respeta ese orden: asigna sólo tras confirmarse el guardado del inmueble.
    const app = readFileSync(raiz('src/App.tsx'), 'utf8');
    const manejador = app.slice(app.indexOf('const handleAddInmueble'), app.indexOf('// Update inmueble handler'));
    expect(manejador).toMatch(/saveInmuebleFirestore\(newInmueble\)\.then\(async \(ok\) =>/);
    expect(manejador.indexOf('if (!ok ||')).toBeGreaterThan(-1);
    expect(manejador.indexOf('asignarTitularesAlta')).toBeGreaterThan(manejador.indexOf('if (!ok ||'));
    expect(manejador).toContain('guardar: guardarTitularidad');
  });
});

describe('F · el alta no depende de un flujo de creación de propietario secundario', () => {
  it('no existe «Segundo Propietario / Co-Arrendador», ni campos del 2º propietario, ni selector «2º propietario»', () => {
    montarAlta({ propietarios: [A, B], onAdd: vi.fn<OnAdd>() });
    abrirAlta();
    irAFiscal();
    expect(screen.queryByRole('checkbox', { name: /Segundo Propietario/i })).toBeNull();
    expect(screen.queryByText(/Co-Arrendador/i)).toBeNull();
    expect(screen.queryByText(/Nombre Completo 2º Propietario/i)).toBeNull();
    expect(screen.queryByText(/NIF \/ DNI 2º Propietario/i)).toBeNull();
    expect(screen.queryByText(/Seleccionar 2º Propietario/i)).toBeNull();
    expect(screen.queryByText(/Introducir datos manualmente o sin vincular/i)).toBeNull();
  });

  it('el alta se completa sin tocar ningún control de titulares: no inventa secundario ni titulares', () => {
    const onAdd = vi.fn<OnAdd>();
    montarAlta({ propietarios: [A, B], onAdd });
    abrirAlta();
    rellenarMinimo();
    guardar();

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [creado, titulares] = onAdd.mock.calls[0];
    expect(titulares).toBeUndefined();
    expect(creado.propietarioId).toBeUndefined();
    expect(creado.propietarioSecundarioId).toBeUndefined();
    expect(creado.datosFiscales?.tieneSegundoPropietario).toBe(false);
    expect(creado.datosFiscales?.segundoPropietario).toBeUndefined();
  });

  it('la fuente del alta ya no contiene el estado ni el manejador del segundo propietario tecleado', () => {
    const fuente = readFileSync(raiz('src/components/sections/InmueblesSection.tsx'), 'utf8');
    expect(fuente).not.toMatch(/newTieneSegundoProp|newProp2|newSelectedProp2Id|handleSelectNewProp2/);
    // El alta tampoco puede crear propietarios: el componente no recibe ni usa ningún guardado de propietario.
    expect(fuente).not.toMatch(/onSavePropietario|onCrearPropietario|crearTitular\(/);
  });

  it('un id de titular que no existe se descarta: el alta nunca asigna (ni crea) a alguien inexistente', () => {
    expect(
      resolverTitularesAlta({ principalId: 'A', adicionalesIds: ['Z', 'B', 'A', ''], existentes: [A, B] }),
    ).toEqual({ titularesIds: ['A', 'B'] });
    // Sin principal existente no hay titulares: no se promociona a ningún adicional.
    expect(resolverTitularesAlta({ principalId: 'Z', adicionalesIds: ['B'], existentes: [A, B] })).toBeUndefined();
    expect(resolverTitularesAlta({ adicionalesIds: ['B'], existentes: [A, B] })).toBeUndefined();
  });

  it('los datos heredados del «segundo» se derivan de la entidad existente, no se inventan', () => {
    const juridica = propietario('J', { tipoPropietario: 'persona_juridica', nombre: 'Inversiones SL' });
    expect(fiscalDesdePropietario(juridica)).toEqual({
      nombre: 'Inversiones SL',
      nifDni: 'NIF-J',
      direccion: 'Calle J, Madrid',
      telefono: '600-J',
      email: 'j@correo.test',
      esPersonaJuridica: true,
      propietarioId: 'J',
    });
    expect(fiscalDesdePropietario(A).esPersonaJuridica).toBe(false);
  });
});

describe('G · aislamiento entre titulares (A → inmuebles 1,2,3 · B → 1,4)', () => {
  const inmueble = (id: string, extra: Partial<Inmueble>): Inmueble =>
    ({
      id,
      direccion: `Inmueble ${id}`,
      ciudad: 'Sevilla',
      precio: 700,
      estado: 'alquilado',
      habitaciones: 2,
      banos: 1,
      superficie: 70,
      candidatosCount: 0,
      fianzaMeses: 1,
      ...extra,
    }) as Inmueble;

  // Un único registro por persona; los inmuebles sólo REFERENCIAN a su titular.
  const i1 = inmueble('1', { propietarioId: 'A', propietarioPrincipalId: 'A', titularesIds: ['A', 'B'] });
  const i2 = inmueble('2', { propietarioId: 'A', propietarioPrincipalId: 'A', titularesIds: ['A'] });
  const i3 = inmueble('3', { propietarioId: 'A', propietarioPrincipalId: 'A', titularesIds: ['A'] });
  const i4 = inmueble('4', { propietarioId: 'B', propietarioPrincipalId: 'B', titularesIds: ['B'] });
  const todos = [i1, i2, i3, i4];

  function montarPortal(propietarioId: 'A' | 'B') {
    return render(
      <PropietarioPortalSection
        currentUser={usuarioPropietario(propietarioId)}
        // El host entrega TODO el conjunto: el aislamiento no depende sólo del host.
        inmuebles={todos}
        profesionales={[]}
        contratos={[]}
        especialidades={[]}
        propietarios={[A, B]}
        gastos={[]}
        incidencias={[]}
        onOpenCrearProfesionalModal={() => undefined}
        onSaveProfesional={() => Promise.resolve()}
      />,
    );
  }

  const direccionesVisibles = () =>
    screen
      .queryAllByText(/^Inmueble [1-4]$/)
      .map((n) => n.textContent)
      .sort();

  beforeEach(() => {
    vi.mocked(subscribeTitularidadesEscopo).mockClear();
  });

  it('A ve 1, 2 y 3 (y su contador es 3); nunca el 4', () => {
    montarPortal('A');
    expect(screen.getByText('Viviendas en cartera').nextElementSibling?.textContent).toBe('3');
    expect(direccionesVisibles()).toEqual(['Inmueble 1', 'Inmueble 2', 'Inmueble 3']);
  });

  it('B ve sólo 1 y 4 (su contador es 2); nunca el 2 ni el 3', () => {
    montarPortal('B');
    expect(screen.getByText('Viviendas en cartera').nextElementSibling?.textContent).toBe('2');
    expect(direccionesVisibles()).toEqual(['Inmueble 1', 'Inmueble 4']);
  });

  it('el inmueble compartido (1) lo ven los dos titulares: una sola entidad por inmueble, sin duplicados', () => {
    expect(todos.filter((i) => i.titularesIds?.includes('A') && i.titularesIds?.includes('B')).map((i) => i.id)).toEqual(['1']);
    expect(new Set(todos.map((i) => i.id)).size).toBe(todos.length);
    // Una sola persona A y una sola persona B (los inmuebles sólo las referencian).
    expect([A, B].map((p) => p.id)).toEqual(['A', 'B']);
  });

  it('las lecturas de titularidades de B no incluyen nunca los inmuebles 2 y 3 (y las de A, nunca el 4)', () => {
    montarPortal('B');
    const alcanceB = vi.mocked(subscribeTitularidadesEscopo).mock.calls[0][0];
    const clavesB = clavesTitularidadesIndexadas(alcanceB.inmuebles).map((c) => c.clave);
    expect(clavesB).toEqual(['1__A', '1__B', '4__B']);
    expect(clavesB.some((c) => c.startsWith('2__') || c.startsWith('3__'))).toBe(false);

    cleanup();
    vi.mocked(subscribeTitularidadesEscopo).mockClear();
    montarPortal('A');
    const alcanceA = vi.mocked(subscribeTitularidadesEscopo).mock.calls[0][0];
    const clavesA = clavesTitularidadesIndexadas(alcanceA.inmuebles).map((c) => c.clave);
    expect(clavesA).toEqual(['1__A', '1__B', '2__A', '3__A']);
    expect(clavesA.some((c) => c.startsWith('4__'))).toBe(false);
  });

  it('en el alta, un propietario sólo puede asignar titulares que ve: B no puede asignar a A (no existe para B)', () => {
    const onAdd = vi.fn<OnAdd>();
    // El host acota los propietarios del perfil PROPIETARIO a su propia ficha.
    montarAlta({ propietarios: [B], onAdd, usuario: usuarioPropietario('B') });
    abrirAlta();
    irAFiscal();
    expect(screen.queryByRole('checkbox', { name: /Titular A/ })).toBeNull();
    expect(screen.getByText(/No hay otros titulares registrados/)).toBeTruthy();
    expect(screen.getByTestId('aviso-titular-inexistente')).toBeTruthy();
    irAGeneral();
    rellenarMinimo('Inmueble 4');
    guardar();
    const [creado, titulares] = onAdd.mock.calls[0];
    expect(creado.propietarioId).toBe('B');
    expect(titulares).toEqual({ titularesIds: ['B'] });
  });

  it('el mismo titular A puede quedar como principal en varios inmuebles sin crear otra persona', () => {
    const onAdd = vi.fn<OnAdd>();
    montarAlta({ propietarios: [A, B], onAdd });
    altaConTitulares('A', [], 'Inmueble 1');
    altaConTitulares('A', [], 'Inmueble 2');
    altaConTitulares('A', [], 'Inmueble 3');
    const creados = onAdd.mock.calls.map(([inm]) => inm);
    expect(creados).toHaveLength(3);
    expect(creados.every((inm) => inm.datosFiscales?.propietarioPrincipal.propietarioId === 'A')).toBe(true);
    expect(new Set(creados.map((inm) => inm.id)).size).toBe(3);
    // Referencias al mismo titular: nunca una persona nueva por inmueble.
    expect(new Set(creados.map((inm) => inm.datosFiscales?.propietarioPrincipal.nifDni))).toEqual(new Set(['NIF-A']));
  });
});
