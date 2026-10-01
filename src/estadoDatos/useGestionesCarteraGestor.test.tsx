// @vitest-environment jsdom
/**
 * Escucha de gestiones donde esta persona es gestora (ROADMAP-04).
 * ---------------------------------------------------------------------------
 * Fija el comportamiento del efecto que antes vivía inline en `App.tsx`:
 *  · quién consulta (PROPIETARIO y PROFESIONAL; nadie más) y con QUÉ id;
 *  · «Reintentar lectura» (contador `intento`) REABRE la escucha — antes no lo hacía,
 *    así que una escucha denegada (Firestore la cierra y no la reabre sola) no tenía
 *    forma de reintentarse y el aviso «Lectura · Carteras» quedaba fijo;
 *  · cambio de persona, cambio a un perfil que no consulta y desmontaje cierran la
 *    escucha anterior (ningún listener huérfano).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PERFILES_QUE_CONSULTAN_CARTERAS,
  useGestionesCarteraGestor,
  type SuscribirGestionesCartera,
} from './useGestionesCarteraGestor';

type U = { id: string; tipoPerfil: any; roles: string[] };
const prop: U = { id: 'usr_p', tipoPerfil: 'PROPIETARIO', roles: [] };
const gestor: U = { id: 'usr_g', tipoPerfil: 'PROFESIONAL', roles: ['GESTOR_PATRIMONIAL'] };

function doble() {
  const bajas: Array<ReturnType<typeof vi.fn>> = [];
  const entregas: Array<(g: any[]) => void> = [];
  const suscribir = vi.fn<SuscribirGestionesCartera>((cb, _id, _ctx) => {
    entregas.push(cb);
    const baja = vi.fn();
    bajas.push(baja);
    return baja;
  });
  return { suscribir, bajas, entregas };
}

function montar(usuario: U | null, intento = 0) {
  const d = doble();
  const vista = renderHook(
    ({ u, i }: { u: U | null; i: number }) => useGestionesCarteraGestor(u, i, d.suscribir),
    { initialProps: { u: usuario, i: intento } }
  );
  return { ...d, ...vista };
}

describe('useGestionesCarteraGestor — quién consulta y con qué', () => {
  it('PROPIETARIO: abre UNA escucha con su id de perfil y el contexto (perfil, roles, intento 0)', () => {
    const { suscribir } = montar(prop);
    expect(suscribir).toHaveBeenCalledTimes(1);
    expect(suscribir).toHaveBeenCalledWith(expect.any(Function), 'usr_p', { tipoPerfil: 'PROPIETARIO', roles: [], intento: 0 });
  });

  it('PROFESIONAL gestor: abre la escucha con su id y sus roles', () => {
    const { suscribir } = montar(gestor);
    expect(suscribir).toHaveBeenCalledWith(expect.any(Function), 'usr_g', {
      tipoPerfil: 'PROFESIONAL', roles: ['GESTOR_PATRIMONIAL'], intento: 0,
    });
  });

  it.each(['ADMINISTRADOR', 'INQUILINO', 'OTRO', undefined])('perfil %s: NO abre ninguna consulta y devuelve vacío', (tipoPerfil) => {
    const { suscribir, result } = montar({ id: 'u', tipoPerfil, roles: [] });
    expect(suscribir).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('sin sesión: no consulta', () => {
    const { suscribir, result } = montar(null);
    expect(suscribir).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('los perfiles que consultan son exactamente PROPIETARIO y PROFESIONAL (un propietario puede ser además gestor)', () => {
    expect([...PERFILES_QUE_CONSULTAN_CARTERAS]).toEqual(['PROPIETARIO', 'PROFESIONAL']);
  });

  it('lo que entrega la escucha pasa al estado devuelto', () => {
    const { entregas, result } = montar(gestor);
    act(() => entregas[0]([{ id: 'g1' }, { id: 'g2' }]));
    expect(result.current.map((g: any) => g.id)).toEqual(['g1', 'g2']);
  });
});

describe('useGestionesCarteraGestor — «Reintentar lectura» reabre la escucha', () => {
  it('al subir el contador de reintento cierra la escucha anterior y abre otra marcada como reintento', () => {
    const { suscribir, bajas, rerender } = montar(prop, 0);
    expect(suscribir).toHaveBeenCalledTimes(1);

    rerender({ u: prop, i: 1 });
    expect(bajas[0]).toHaveBeenCalledTimes(1);
    expect(suscribir).toHaveBeenCalledTimes(2);
    expect(suscribir).toHaveBeenLastCalledWith(expect.any(Function), 'usr_p', { tipoPerfil: 'PROPIETARIO', roles: [], intento: 1 });

    rerender({ u: prop, i: 2 });
    expect(bajas[1]).toHaveBeenCalledTimes(1);
    expect(suscribir).toHaveBeenCalledTimes(3);
  });

  it('un re-render SIN cambio de persona ni de contador NO reabre la escucha', () => {
    const { suscribir, bajas, rerender } = montar(prop, 0);
    rerender({ u: { ...prop }, i: 0 }); // objeto nuevo, mismos id/perfil (p. ej. refresco de la ficha)
    rerender({ u: { ...prop, roles: ['X'] }, i: 0 }); // los roles solo alimentan la traza
    expect(suscribir).toHaveBeenCalledTimes(1);
    expect(bajas[0]).not.toHaveBeenCalled();
  });
});

describe('useGestionesCarteraGestor — cambio de persona y desmontaje', () => {
  it('otra persona ⇒ cierra la escucha anterior y consulta con SU id', () => {
    const { suscribir, bajas, rerender } = montar(prop);
    rerender({ u: gestor, i: 0 });
    expect(bajas[0]).toHaveBeenCalledTimes(1);
    expect(suscribir).toHaveBeenLastCalledWith(expect.any(Function), 'usr_g', expect.objectContaining({ tipoPerfil: 'PROFESIONAL' }));
  });

  it('pasar a un perfil que no consulta (p. ej. cierre de sesión) cierra la escucha y vacía el estado', () => {
    const { suscribir, bajas, entregas, result, rerender } = montar(gestor);
    act(() => entregas[0]([{ id: 'g1' }]));
    expect(result.current).toHaveLength(1);

    rerender({ u: null, i: 0 });
    expect(bajas[0]).toHaveBeenCalledTimes(1);
    expect(suscribir).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual([]);
  });

  it('el desmontaje cierra la escucha', () => {
    const { bajas, unmount } = montar(prop);
    unmount();
    expect(bajas[0]).toHaveBeenCalledTimes(1);
  });
});

describe('App.tsx — cableado del reintento', () => {
  const APP = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

  it('App abre la escucha con el contador PROPIO de la capacidad y la suscripción real', () => {
    expect(APP).toContain("const intentoCarteras = intentoDeCapacidad('gestiones_cartera');");
    expect(APP).toContain(
      'const gestionesCarteraGestor = useGestionesCarteraGestor(currentUser, intentoCarteras, subscribeGestionesCarteraGestor);'
    );
  });

  it('ya no queda la escucha inline sin contador de reintento', () => {
    expect(APP).not.toContain('subscribeGestionesCarteraGestor(setGestionesCarteraGestor');
    expect(APP).not.toContain('setGestionesCarteraGestor');
  });

  it('los contadores están SEPARADOS: datos (`intentoLecturas`) y Carteras (`intentoDeCapacidad`)', () => {
    expect(APP).toMatch(/intento: intentoLecturas,[\s\S]{0,200}reintentar: reintentarLecturas,/);
    expect(APP).toContain('onReintentar={reintentarLecturas}');
    // «Reintentar lectura» del aviso específico de Carteras usa el reintento dirigido.
    expect(APP).toContain('onReintentarCapacidad={reintentarCapacidad}');
    // El reintento de los datos no puede volver a re-suscribir Carteras (ni al revés).
    expect(APP).not.toMatch(/useGestionesCarteraGestor\(currentUser, intentoLecturas/);
  });
});
