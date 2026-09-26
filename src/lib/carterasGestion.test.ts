/**
 * D3 (parcial) — Proyección `gestiones_cartera -> { carterasL, carterasE }`.
 *
 * Se construyen gestiones REALES con el dominio D1R (`crearGestion` +
 * `registrarEvento`): ninguna proyección se prueba sobre estados inventados a
 * mano. La semántica esperada es la aprobada en S5/S7:
 *  · ACTIVA + LECTURA                          -> L
 *  · ACTIVA + LECTURA_ESCRITURA + resp. GESTOR -> L + E
 *  · ACTIVA + LECTURA_ESCRITURA + resp. TITULAR-> L (la escritura NO existe
 *    por el mero hecho de existir la gestión)
 *  · SUSPENDIDA                                -> nada (sin acceso operativo)
 *  · REVOCADA + conservarLecturaHistorica      -> L (historia ≠ activa)
 *  · REVOCADA sin conservación / PENDIENTE     -> nada
 */
import { describe, expect, it } from 'vitest';
import {
  crearGestion,
  registrarEvento,
  type GestionCartera,
  type ParametrosCrearGestion,
  type TipoEventoGestion,
} from './gestionesCartera';
import { proyectarCarterasGestionadas, propietariosGestionadosDe } from './carterasGestion';

const F = '2026-09-26T10:00:00.000Z';
const F2 = '2026-09-27T10:00:00.000Z';
const GESTOR = 'usr_gestor_1';
const OTRO = 'usr_gestor_2';

function alta(over: Partial<ParametrosCrearGestion> = {}): GestionCartera {
  const r = crearGestion({
    id: 'g_1',
    propietarioId: 'prop_X',
    gestorUsuarioId: GESTOR,
    tipoGestor: 'GESTOR_PROFESIONAL',
    propietarioTieneCuenta: false,
    fecha: F,
    actorId: 'uid_master',
    actorRol: 'MASTER',
    ...over,
  });
  if (!('gestion' in r)) throw new Error(r.error);
  return r.gestion;
}

function ev(g: GestionCartera, tipo: TipoEventoGestion, extra: Record<string, unknown> = {}): GestionCartera {
  const r = registrarEvento(g, { tipo, actorId: 'uid_master', fecha: F2, ...extra });
  if (!('gestion' in r)) throw new Error(r.error);
  return r.gestion;
}

describe('D3 · proyección de carteras gestionadas', () => {
  it('P1 · PENDIENTE_ACEPTACION no proyecta acceso (ni L ni E)', () => {
    const g = alta();
    expect(g.estado).toBe('PENDIENTE_ACEPTACION');
    expect(proyectarCarterasGestionadas([g], GESTOR)).toEqual({ carterasL: [], carterasE: [] });
  });

  it('P2 · ACTIVA + LECTURA proyecta sólo carterasL', () => {
    const g = ev(alta(), 'ACTIVACION');
    expect(g.estado).toBe('ACTIVA');
    expect(proyectarCarterasGestionadas([g], GESTOR)).toEqual({ carterasL: ['prop_X'], carterasE: [] });
  });

  it('P3 · ACTIVA + LECTURA_ESCRITURA + responsable GESTOR proyecta L y E', () => {
    const g = ev(alta({ permiso: 'LECTURA_ESCRITURA' }), 'ACTIVACION');
    expect(g.responsableActual).toBe('GESTOR');
    expect(proyectarCarterasGestionadas([g], GESTOR)).toEqual({ carterasL: ['prop_X'], carterasE: ['prop_X'] });
  });

  it('P4 · S7: ACTIVA + L/E pero responsable TITULAR (CESION) proyecta sólo L', () => {
    // CESION: el titular asume la gestión (responsableActual -> TITULAR).
    const g = ev(ev(alta({ permiso: 'LECTURA_ESCRITURA' }), 'ACTIVACION'), 'CESION');
    expect(g.responsableActual).toBe('TITULAR');
    expect(proyectarCarterasGestionadas([g], GESTOR)).toEqual({ carterasL: ['prop_X'], carterasE: [] });
    // DEVOLUCION: el titular devuelve la gestión al gestor -> vuelve E.
    const g2 = ev(g, 'DEVOLUCION');
    expect(g2.responsableActual).toBe('GESTOR');
    expect(proyectarCarterasGestionadas([g2], GESTOR)).toEqual({ carterasL: ['prop_X'], carterasE: ['prop_X'] });
  });

  it('P5 · SUSPENSION elimina todo acceso operativo (ni L ni E)', () => {
    const g = ev(ev(alta({ permiso: 'LECTURA_ESCRITURA' }), 'ACTIVACION'), 'SUSPENSION');
    expect(g.estado).toBe('SUSPENDIDA');
    expect(proyectarCarterasGestionadas([g], GESTOR)).toEqual({ carterasL: [], carterasE: [] });
  });

  it('P6 · REACTIVACION restaura la proyección según permiso/responsable', () => {
    const g = ev(ev(ev(alta({ permiso: 'LECTURA_ESCRITURA' }), 'ACTIVACION'), 'SUSPENSION'), 'REACTIVACION');
    expect(g.estado).toBe('ACTIVA');
    expect(proyectarCarterasGestionadas([g], GESTOR)).toEqual({ carterasL: ['prop_X'], carterasE: ['prop_X'] });
  });

  it('P7 · S7: REVOCADA con conservarLecturaHistorica proyecta sólo L (historia ≠ activa)', () => {
    const g = ev(ev(alta({ permiso: 'LECTURA_ESCRITURA' }), 'ACTIVACION'), 'REVOCACION', {
      conservarLecturaHistorica: true,
    });
    expect(g.estado).toBe('REVOCADA');
    expect(proyectarCarterasGestionadas([g], GESTOR)).toEqual({ carterasL: ['prop_X'], carterasE: [] });
  });

  it('P8 · REVOCADA sin conservación elimina todo acceso', () => {
    const g = ev(ev(alta({ permiso: 'LECTURA_ESCRITURA' }), 'ACTIVACION'), 'REVOCACION');
    expect(proyectarCarterasGestionadas([g], GESTOR)).toEqual({ carterasL: [], carterasE: [] });
  });

  it('P9 · la proyección es por gestor: otro usuario no hereda carteras', () => {
    const g = ev(alta(), 'ACTIVACION');
    expect(proyectarCarterasGestionadas([g], OTRO)).toEqual({ carterasL: [], carterasE: [] });
  });

  it('P10 · varias carteras: deduplicadas y en orden; L ∪ E para el ámbito de consulta', () => {
    const g1 = ev(alta(), 'ACTIVACION'); // prop_X, L
    const g2 = ev(alta({ id: 'g_2', propietarioId: 'prop_Y', permiso: 'LECTURA_ESCRITURA' }), 'ACTIVACION'); // prop_Y, L+E
    const g3 = ev(alta({ id: 'g_3', propietarioId: 'prop_X' }), 'ACTIVACION'); // prop_X duplicado
    const p = proyectarCarterasGestionadas([g1, g2, g3], GESTOR);
    expect(p).toEqual({ carterasL: ['prop_X', 'prop_Y'], carterasE: ['prop_Y'] });
    expect(propietariosGestionadosDe(p)).toEqual(['prop_X', 'prop_Y']);
  });
});
