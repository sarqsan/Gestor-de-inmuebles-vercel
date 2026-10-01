/**
 * CARTERAS COMO CAPACIDAD ADICIONAL — cierre de la incidencia «Lectura · Carteras»
 * ===============================================================================
 * Qué fija este test (los 9 criterios de cierre de la intervención):
 *
 *  1. Carteras autorizadas → los datos llegan y se usan (delegación parcial).
 *  2. Sin carteras → lista vacía, sin aviso.
 *  3. `permission-denied` → la aplicación CONTINÚA: incidencia registrada con
 *     `alcance: 'CAPACIDAD'` y diagnóstico técnico, sin error fatal.
 *  4. `permission-denied` → no se pierde el resto del estado del Portal (ni lo ya
 *     leído de Carteras, ni los datos primarios, ni el estado de pantalla).
 *  5. «Reintentar lectura» → vuelve a ejecutar SÓLO la lectura de Carteras.
 *  6. Un gestor no puede leer la cartera de otro (evaluado contra
 *     `firestore.rules` real).
 *  7. Un propietario sin cartera no queda bloqueado: entra y ve su Portal.
 *  8. Las reglas mantienen el aislamiento (condición específica, sin `if true`).
 *  9. La delegación válida sigue funcionando (ámbito parcial de inmuebles).
 *
 * El host de prueba reproduce el cableado REAL de `App.tsx` con los módulos
 * reales (`useEstadoLecturas`, `useGestionesCarteraGestor`,
 * `AvisoIncidenciasDatos`, `PuertaEstadoDatos`, `PropietarioPortalSection`). Sólo
 * se sustituye la frontera de datos: la suscripción de Carteras (igual que el
 * resto de tests de host) y la suscripción de titularidades del Portal.
 *
 * @vitest-environment jsdom
 */
import React, { useEffect } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AvisoIncidenciasDatos } from '../src/components/estado-datos/AvisoIncidenciasDatos';
import { PuertaEstadoDatos } from '../src/components/estado-datos/EstadoDatosPantalla';
import { PropietarioPortalSection } from '../src/components/sections/PropietarioPortalSection';
import { useEstadoLecturas } from '../src/estadoDatos/useEstadoLecturas';
import {
  useGestionesCarteraGestor,
  type SuscribirGestionesCartera,
} from '../src/estadoDatos/useGestionesCarteraGestor';
import {
  calcularEstadoDatosPantalla,
  incidenciasDatos,
  origenesActivosDePerfil,
  origenesDePantalla,
  reiniciarCanalIncidencias,
  reportarErrorLectura,
} from '../src/estadoDatos/canalIncidencias';
import {
  ambitosInmueblesParcialesActivosDe,
  inmueblesParcialesActivosDe,
} from '../src/lib/carterasGestion';
import type { GestionCartera } from '../src/lib/gestionesCartera';
import type { Inmueble, Propietario, UsuarioApp } from '../src/types';
import { crearEvaluadorReglas } from './harness/firestoreRulesEval';

vi.mock('../src/lib/titularidadesFirestore', () => ({
  subscribeTitularidadesEscopo: vi.fn((_alcance: unknown, cb: (t: unknown[]) => void) => {
    cb([]);
    return () => undefined;
  }),
  guardarTitularidad: vi.fn(async () => true),
  cerrarTitularidad: vi.fn(async () => true),
}));

// ─────────────────────────────────────────────────────────── datos de prueba
const RAIZ = resolve(__dirname, '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const APP = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf8');
const FIREBASE = readFileSync(resolve(RAIZ, 'src/lib/firebase.ts'), 'utf8');

const USUARIO = {
  id: 'user-1',
  nombre: 'Ana Propietaria',
  email: 'ana@test.es',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
  propietarioId: 'P1',
  inmuebleIds: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as unknown as UsuarioApp;

const PROPIETARIOS = [{ id: 'P1', nombre: 'Ana Propietaria', nifCif: '12345678Z' }] as unknown as Propietario[];

const VIVIENDA = {
  id: 'inm-1',
  direccion: 'Calle Mayor 1',
  ciudad: 'Sevilla',
  precio: 700,
  estado: 'alquilado',
  habitaciones: 2,
  banos: 1,
  superficie: 70,
  candidatosCount: 0,
  fianzaMeses: 1,
  propietarioId: 'P1',
  propietarioPrincipalId: 'P1',
} as unknown as Inmueble;

/** Delegación parcial VÁLIDA (ACTIVA + aceptada) del gestor de prueba sobre un tercero. */
const GESTION_PARCIAL: GestionCartera = {
  id: 'prop-X~user-1',
  propietarioId: 'prop-X',
  gestorUsuarioId: 'user-1',
  tipoGestor: 'GESTOR_PROFESIONAL',
  inmuebleIds: ['inm-9'],
  permiso: 'LECTURA',
  responsableActual: 'GESTOR',
  estado: 'ACTIVA',
  requiereAceptacion: true,
  resolucionInvitacion: 'ACEPTADA',
  fechaAlta: '2026-09-01T00:00:00.000Z',
  eventos: [],
  creadoPor: 'master',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

// ─────────────────────────────────────────────────────── doble de suscripción
interface DobleCarteras {
  suscribir: SuscribirGestionesCartera;
  llamadas: Array<{ id: string; intento: number }>;
  entregar: (gestiones: GestionCartera[]) => void;
  denegar: (codigo?: string) => void;
  bajas: () => number;
}

function crearDobleCarteras(): DobleCarteras {
  const llamadas: Array<{ id: string; intento: number }> = [];
  const entregas: Array<(g: GestionCartera[]) => void> = [];
  let bajas = 0;
  const suscribir: SuscribirGestionesCartera = (cb, id, contexto) => {
    llamadas.push({ id, intento: contexto?.intento ?? 0 });
    entregas.push(cb);
    return () => {
      bajas += 1;
    };
  };
  return {
    suscribir,
    llamadas,
    entregar: (gestiones) => act(() => entregas[entregas.length - 1](gestiones)),
    // El error se reporta con el MISMO contrato que `subscribeGestionesCarteraGestor`:
    // el texto de ese cableado queda fijado más abajo (pin de fuente).
    denegar: (codigo = 'permission-denied') =>
      act(() => {
        reportarErrorLectura(
          'gestiones_cartera',
          { code: codigo },
          'Firestore gestiones_cartera snapshot error:',
          { alcance: 'CAPACIDAD' }
        );
      }),
    bajas: () => bajas,
  };
}

// ─────────────────────────────────────────────────────────────── host de prueba
/**
 * Mini-host equivalente a `App.tsx`: mismas lecturas primarias (inmuebles y
 * propietarios, ya LISTO = datos cargados), misma escucha de Carteras por
 * contador propio, mismo aviso y misma puerta de pantalla. El Portal real se
 * monta dentro de la puerta cuando `conPortal`.
 */
function HostCarteras({
  suscribirCarteras,
  conPortal = false,
  usuario = USUARIO,
}: {
  suscribirCarteras: SuscribirGestionesCartera;
  conPortal?: boolean;
  usuario?: UsuarioApp | null;
}) {
  const {
    intento,
    marcarListo,
    iniciarLecturas,
    reintentar,
    reintentarCapacidad,
    intentoDeCapacidad,
    estadoDePantalla,
    incidencias,
    descartarIncidencia,
    descartarIncidencias,
  } = useEstadoLecturas(['inmuebles', 'propietarios']);

  useEffect(() => {
    iniciarLecturas();
    marcarListo('inmuebles');
    marcarListo('propietarios');
  }, [intento, iniciarLecturas, marcarListo]);

  const gestiones = useGestionesCarteraGestor(usuario, intentoDeCapacidad('gestiones_cartera'), suscribirCarteras);
  const parciales = inmueblesParcialesActivosDe(gestiones, USUARIO.id).join(',');

  return (
    <div>
      <AvisoIncidenciasDatos
        incidencias={incidencias}
        onReintentar={reintentar}
        onReintentarCapacidad={reintentarCapacidad}
        onDescartar={descartarIncidencia}
        onDescartarTodas={descartarIncidencias}
      />
      <p data-testid="parciales">{parciales}</p>
      <PuertaEstadoDatos estado={estadoDePantalla('propietarios')} onReintentar={reintentar}>
        {conPortal ? (
          <PropietarioPortalSection
            currentUser={USUARIO}
            inmuebles={[VIVIENDA]}
            profesionales={[]}
            contratos={[]}
            especialidades={[]}
            propietarios={PROPIETARIOS}
            gastos={[]}
            incidencias={[]}
            onOpenCrearProfesionalModal={() => undefined}
            onSaveProfesional={() => Promise.resolve()}
          />
        ) : (
          <p data-testid="datos-portal">datos del Portal</p>
        )}
      </PuertaEstadoDatos>
    </div>
  );
}

function incidenciaCarteras() {
  return incidenciasDatos().find((i) => i.origen === 'gestiones_cartera');
}

afterEach(() => cleanup());
beforeEach(() => reiniciarCanalIncidencias());

// ===========================================================================
// 1–2 · Autorizada con datos / sin ninguna cartera
// ===========================================================================
describe('1–2 · la lectura de Carteras entrega lo suyo o una lista vacía', () => {
  it('1 · gestor autorizado: las carteras llegan y su delegación parcial acota los inmuebles', () => {
    const doble = crearDobleCarteras();
    render(<HostCarteras suscribirCarteras={doble.suscribir} />);

    // La escucha se abrió con el id de PERFIL y sin reintento previo.
    expect(doble.llamadas).toEqual([{ id: USUARIO.id, intento: 0 }]);
    expect(screen.getByTestId('parciales').textContent).toBe('');

    doble.entregar([GESTION_PARCIAL]);

    expect(screen.getByTestId('parciales').textContent).toBe('inm-9');
    expect(ambitosInmueblesParcialesActivosDe([GESTION_PARCIAL], USUARIO.id)).toEqual([
      { propietarioId: 'prop-X', inmuebleId: 'inm-9' },
    ]);
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
    expect(screen.queryByTestId('aviso-capacidad-adicional')).toBeNull();
    expect(incidenciaCarteras()).toBeUndefined();
  });

  it('2 · sin ninguna cartera: lista vacía y ningún aviso (ni global ni específico)', () => {
    const doble = crearDobleCarteras();
    render(<HostCarteras suscribirCarteras={doble.suscribir} />);
    doble.entregar([]);

    expect(screen.getByTestId('parciales').textContent).toBe('');
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
    expect(screen.queryByTestId('aviso-capacidad-adicional')).toBeNull();
    expect(incidenciasDatos()).toEqual([]);
  });
});

// ===========================================================================
// 3–4 · permission-denied: la aplicación continúa y no se pierde nada
// ===========================================================================
describe('3–4 · permission-denied: se registra el diagnóstico y el Portal sigue vivo', () => {
  it('3 · la denegación queda registrada como CAPACIDAD y NO produce el aviso global', () => {
    const doble = crearDobleCarteras();
    render(<HostCarteras suscribirCarteras={doble.suscribir} conPortal />);

    doble.denegar();

    // Registro técnico completo: el fallo NO se oculta.
    expect(incidenciaCarteras()).toMatchObject({
      origen: 'gestiones_cartera',
      tipo: 'LECTURA',
      alcance: 'CAPACIDAD',
      codigo: 'permission-denied',
      etiqueta: 'Carteras',
    });
    // Aviso ESPECÍFICO y accionable…
    const aviso = screen.getByTestId('aviso-capacidad-adicional');
    expect(aviso.getAttribute('data-origen')).toBe('gestiones_cartera');
    expect(screen.getByText(/Carteras: no se han podido leer tus carteras ni delegaciones/)).toBeTruthy();
    expect(screen.getByText(/capacidad adicional/i)).toBeTruthy();
    expect(screen.getByText(/Reintentar lectura/)).toBeTruthy();
    // …y NUNCA el mensaje genérico de carga de datos, ni el error de pantalla.
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
    expect(screen.queryByText(/No se han podido leer algunos datos/)).toBeNull();
    expect(screen.queryByTestId('estado-error')).toBeNull();
    expect(screen.queryByText(/No se han podido cargar los datos/)).toBeNull();
    // El Portal renderiza sus datos con normalidad.
    expect(screen.getByText('Calle Mayor 1')).toBeTruthy();
  });

  it('3b · una pantalla no puede quedar en ERROR por Carteras: el origen no es dependencia de ninguna', () => {
    // Aunque el mapa de estados marcase Carteras en ERROR, ninguna sección la declara.
    const pantallas = ['propietarios', 'inmuebles', 'tesoreria', 'dashboard', 'configuracion'] as const;
    for (const pantalla of pantallas) {
      expect(origenesDePantalla(pantalla)).not.toContain('gestiones_cartera');
      expect(calcularEstadoDatosPantalla(origenesDePantalla(pantalla), { gestiones_cartera: 'ERROR' }).estado).toBe('LISTO');
    }
    // Y el host no la declara como lectura activa: no puede dejar nada «CARGANDO».
    expect(origenesActivosDePerfil('PROPIETARIO', 'P1')).not.toContain('gestiones_cartera');
    expect(origenesActivosDePerfil('PROFESIONAL', null)).not.toContain('gestiones_cartera');
  });

  it('4 · denegación tras una lectura correcta: NO se pierde lo leído ni el resto del Portal', () => {
    const doble = crearDobleCarteras();
    render(<HostCarteras suscribirCarteras={doble.suscribir} conPortal />);

    doble.entregar([GESTION_PARCIAL]);
    expect(screen.getByTestId('parciales').textContent).toBe('inm-9');

    doble.denegar();

    // Lo ya leído se conserva (la escucha cerrada no vacía el estado)…
    expect(screen.getByTestId('parciales').textContent).toBe('inm-9');
    // …y el Portal sigue con sus datos, contador y navegación.
    expect(screen.getByText('Calle Mayor 1')).toBeTruthy();
    expect(screen.getByText('Viviendas en cartera').nextElementSibling?.textContent?.trim()).toBe('1');
    expect(screen.getByRole('button', { name: /Mis Viviendas/ })).toBeTruthy();
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
  });
});

// ===========================================================================
// 5 · «Reintentar lectura» de Carteras
// ===========================================================================
describe('5 · «Reintentar lectura» vuelve a ejecutar SÓLO la lectura de Carteras', () => {
  it('reabre la escucha con el contador propio y limpia el aviso específico', () => {
    const doble = crearDobleCarteras();
    render(<HostCarteras suscribirCarteras={doble.suscribir} conPortal />);

    doble.denegar();
    expect(doble.llamadas).toEqual([{ id: USUARIO.id, intento: 0 }]);
    expect(screen.getByTestId('aviso-capacidad-adicional')).toBeTruthy();

    fireEvent.click(screen.getByText('Reintentar lectura'));

    // La escucha anterior se cerró y se abrió OTRA marcada como reintento.
    expect(doble.bajas()).toBe(1);
    expect(doble.llamadas).toEqual([
      { id: USUARIO.id, intento: 0 },
      { id: USUARIO.id, intento: 1 },
    ]);
    // El aviso anterior se sustituye por el resultado del nuevo intento.
    expect(screen.queryByTestId('aviso-capacidad-adicional')).toBeNull();

    // Si el reintento se autoriza, los datos llegan.
    doble.entregar([GESTION_PARCIAL]);
    expect(screen.getByTestId('parciales').textContent).toBe('inm-9');
    expect(screen.queryByTestId('aviso-capacidad-adicional')).toBeNull();
  });

  it('si el reintento sigue denegado, el aviso aparece UNA sola vez (sin duplicar)', () => {
    const doble = crearDobleCarteras();
    render(<HostCarteras suscribirCarteras={doble.suscribir} />);

    doble.denegar();
    fireEvent.click(screen.getByText('Reintentar lectura'));
    doble.denegar();

    expect(screen.getAllByTestId('aviso-capacidad-adicional')).toHaveLength(1);
    expect(incidenciasDatos().filter((i) => i.origen === 'gestiones_cartera')).toHaveLength(1);
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
  });
});

// ===========================================================================
// 6 y 8 · Aislamiento de las reglas
// ===========================================================================
describe('6 y 8 · las reglas autorizan sólo la cartera propia y mantienen el aislamiento', () => {
  const evaluador = crearEvaluadorReglas(RULES);
  const UID = 'uid_prop';
  const PERFIL = 'usr_prop';

  function peticion(resource: Record<string, unknown> | null) {
    return {
      auth: { uid: UID, token: { email: 'prop@test.local', email_verified: true } },
      db: {
        [`usuarios_auth/${UID}`]: {
          uid: UID,
          usuarioId: PERFIL,
          email: 'prop@test.local',
          tipoPerfil: 'PROPIETARIO',
          estado: 'ACTIVO',
          roles: [],
          propietarioId: 'prop_1',
          profesionalId: '',
          inmuebleIds: [],
        },
        [`usuarios/${PERFIL}`]: {
          id: PERFIL,
          authUid: UID,
          email: 'prop@test.local',
          tipoPerfil: 'PROPIETARIO',
          estado: 'ACTIVO',
          roles: [],
          propietarioId: 'prop_1',
        },
        'gestiones_cartera/prop_X~usr_otro': { gestorUsuarioId: 'usr_otro', propietarioId: 'prop_X' },
      },
      resource,
      requestResource: null,
      docId: 'x',
    };
  }

  it('6 · la consulta con el id propio se autoriza y con el de OTRO gestor se deniega', () => {
    // Es exactamente la consulta de la escucha: `where('gestorUsuarioId','==', …)`;
    // el documento representante sólo conoce los campos que fija la consulta.
    expect(evaluador.permite('gestiones_cartera', 'list', peticion({ gestorUsuarioId: PERFIL }))).toBe(true);
    expect(evaluador.permite('gestiones_cartera', 'list', peticion({ gestorUsuarioId: 'usr_otro' }))).toBe(false);
    // La cartera ajena existe en la colección y sigue siendo inalcanzable.
    expect(evaluador.permite('gestiones_cartera', 'list', peticion(null))).toBe(false);
  });

  it('8 · la regla del repositorio es específica (nunca `if true`) y sigue acotada al titular', () => {
    const bloque = RULES.match(/match \/gestiones_cartera\/\{gestionId\} \{[\s\S]*?\n    \}/)?.[0] ?? '';
    expect(bloque).toContain('allow list: if esAdminInmuebles() || gestionInvolucraAMi(resource.data);');
    expect(bloque).not.toMatch(/allow (read|list|get)[^;]*:\s*if\s+true/);
    // La rama del titular sigue vigente (su cartera propia, no la de otros).
    expect(evaluador.permite('gestiones_cartera', 'list', peticion({ propietarioId: 'prop_1' }))).toBe(true);
    expect(evaluador.permite('gestiones_cartera', 'list', peticion({ propietarioId: 'prop_X' }))).toBe(false);
  });
});

// ===========================================================================
// 7 · Propietario sin cartera
// ===========================================================================
describe('7 · un propietario sin cartera entra normalmente al Portal', () => {
  it('renderiza el Portal completo con la lista vacía de carteras y sin avisos', () => {
    const doble = crearDobleCarteras();
    render(<HostCarteras suscribirCarteras={doble.suscribir} conPortal />);
    doble.entregar([]);

    expect(screen.getByText('Calle Mayor 1')).toBeTruthy();
    expect(screen.getByText('Viviendas en cartera').nextElementSibling?.textContent?.trim()).toBe('1');
    expect(screen.getByRole('button', { name: /Mis Viviendas/ })).toBeTruthy();
    expect(screen.queryByTestId('aviso-capacidad-adicional')).toBeNull();
    expect(screen.queryByTestId('aviso-incidencias-datos')).toBeNull();
  });

  it('aunque la lectura se deniegue, el Portal entra y navega (no queda bloqueado)', () => {
    const doble = crearDobleCarteras();
    render(<HostCarteras suscribirCarteras={doble.suscribir} conPortal />);
    doble.denegar();

    expect(screen.getByText('Calle Mayor 1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Mi Perfil/ }));
    expect(screen.getByText('1 viviendas')).toBeTruthy();
  });
});

// ===========================================================================
// 9 · La delegación válida sigue funcionando
// ===========================================================================
describe('9 · la delegación válida no se rompe', () => {
  it('una delegación ACTIVA + aceptada mantiene su ámbito; una no aceptada no lo abre', () => {
    expect(inmueblesParcialesActivosDe([GESTION_PARCIAL], USUARIO.id)).toEqual(['inm-9']);
    const pendiente: GestionCartera = { ...GESTION_PARCIAL, id: 'g2', estado: 'PENDIENTE_ACEPTACION' };
    expect(inmueblesParcialesActivosDe([pendiente], USUARIO.id)).toEqual([]);
    const deOtro: GestionCartera = { ...GESTION_PARCIAL, id: 'g3', gestorUsuarioId: 'usr_otro' };
    expect(inmueblesParcialesActivosDe([deOtro], USUARIO.id)).toEqual([]);
  });
});

// ===========================================================================
// Cableado real: el host no puede volver a convertir Carteras en error global
// ===========================================================================
describe('cableado real (App.tsx / firebase.ts)', () => {
  it('la escucha se abre con el contador PROPIO de la capacidad, no con el de los datos', () => {
    expect(APP).toContain("const intentoCarteras = intentoDeCapacidad('gestiones_cartera');");
    expect(APP).toContain(
      'const gestionesCarteraGestor = useGestionesCarteraGestor(currentUser, intentoCarteras, subscribeGestionesCarteraGestor);'
    );
    expect(APP).toContain('onReintentarCapacidad={reintentarCapacidad}');
  });

  it('la capa de datos reporta la denegación como CAPACIDAD (registro conservado, sin error fatal)', () => {
    expect(FIREBASE).toMatch(/reportarErrorLectura\(\s*'gestiones_cartera',[\s\S]{0,300}\{ alcance: 'CAPACIDAD' \}/);
    expect(FIREBASE).toContain("{ alcance: 'CAPACIDAD' }");
    // Sigue existiendo diagnóstico técnico tras la denegación (no se oculta el fallo).
    expect(FIREBASE).toContain('diagnosticarDenegacionCarteras');
    // Y el manejador de error NO traduce el fallo a una lista vacía (no se disfraza).
    const marcaAlcance = FIREBASE.indexOf("{ alcance: 'CAPACIDAD' }");
    expect(marcaAlcance).toBeGreaterThan(0);
    expect(FIREBASE.slice(marcaAlcance - 300, marcaAlcance + 300)).not.toContain('callback([])');
  });
});
