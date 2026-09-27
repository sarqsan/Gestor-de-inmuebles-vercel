/**
 * FASE 3 — Invitaciones y candidatos (deltas de Arena C).
 * ---------------------------------------------------------------------------
 * Fuente C: commit a6ac280, `App.tsx / handleSaveInvitacion` (transición
 * `nuevo → preseleccionado`) y `App.tsx / handleAddCandidato` (defensa contra
 * duplicados por id + contador seguro ante valor inexistente/null).
 *
 * Adaptación B: lógica pura en `src/lib/invitacionesCandidatos.ts`, cableada
 * en `App.tsx` con persistencia best-effort (`persistirMejorEsfuerzo`). Estas
 * defensas son de ESTADO LOCAL: no son idempotencia transaccional ni alteran
 * el modelo de persistencia canónico.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Candidato, Inmueble, InvitacionVisita } from '../src/types';
import {
  agregarCandidatoSinDuplicados,
  incrementarContadorCandidatos,
  persistirMejorEsfuerzo,
  planificarAltaCandidato,
  planificarGuardadoInvitacion,
  transicionPreseleccionPorInvitacion,
  upsertInvitacionLocal,
} from '../src/lib/invitacionesCandidatos';

const RAIZ = resolve(__dirname, '..');

function candidato(extra: Partial<Candidato> = {}): Candidato {
  return {
    id: 'cand-1',
    nombre: 'Candidata Uno',
    telefono: '600111222',
    email: 'una@test.local',
    inmuebleId: 'inm-1',
    estado: 'nuevo',
    ...extra,
  } as unknown as Candidato;
}

function invitacion(extra: Partial<InvitacionVisita> = {}): InvitacionVisita {
  return {
    id: 'inv-1',
    token: 'vst-1',
    candidateId: 'cand-1',
    candidateNombre: 'Candidata Uno',
    candidateTelefono: '600111222',
    inmuebleId: 'inm-1',
    inmuebleNombre: 'Piso Test',
    inmueblePrecio: 900,
    status: 'PENDIENTE DE ENVIAR',
    fechaPreseleccion: '2026-09-27',
    createdAt: '2026-09-27T00:00:00.000Z',
    ...extra,
  } as unknown as InvitacionVisita;
}

function inmueble(extra: Partial<Inmueble> = {}): Inmueble {
  return { id: 'inm-1', candidatosCount: 2, ...extra } as unknown as Inmueble;
}

describe('guardado de invitación · transición nuevo → preseleccionado', () => {
  it('candidato nuevo + invitación → candidato preseleccionado y marcado para persistir', () => {
    const plan = planificarGuardadoInvitacion([], [candidato()], invitacion());
    expect(plan.invitaciones).toHaveLength(1);
    expect(plan.invitaciones[0].id).toBe('inv-1');
    expect(plan.candidatos[0].estado).toBe('preseleccionado');
    expect(plan.candidatoAPersistir).not.toBeNull();
    expect(plan.candidatoAPersistir?.id).toBe('cand-1');
    expect(plan.candidatoAPersistir?.estado).toBe('preseleccionado');
  });

  it('candidato ya preseleccionado → se guarda la invitación sin transición', () => {
    const plan = planificarGuardadoInvitacion(
      [],
      [candidato({ estado: 'preseleccionado' })],
      invitacion()
    );
    expect(plan.invitaciones).toHaveLength(1);
    expect(plan.candidatos[0].estado).toBe('preseleccionado');
    expect(plan.candidatoAPersistir).toBeNull();
  });

  it('candidato en otro estado (visita_reservada) → se respeta, sin transición de negocio', () => {
    const plan = planificarGuardadoInvitacion(
      [],
      [candidato({ estado: 'visita_reservada' })],
      invitacion()
    );
    expect(plan.candidatos[0].estado).toBe('visita_reservada');
    expect(plan.candidatoAPersistir).toBeNull();
  });

  it('candidato inexistente → sin transición y sin error', () => {
    const plan = planificarGuardadoInvitacion([], [], invitacion());
    expect(plan.invitaciones).toHaveLength(1);
    expect(plan.candidatos).toHaveLength(0);
    expect(plan.candidatoAPersistir).toBeNull();
  });

  it('actualizar una invitación existente la sustituye in situ y conserva el orden', () => {
    const previas = [invitacion({ id: 'inv-a' }), invitacion({ id: 'inv-1' }), invitacion({ id: 'inv-z' })];
    const next = upsertInvitacionLocal(previas, invitacion({ status: 'ENVIADO' }));
    expect(next.map((i) => i.id)).toEqual(['inv-a', 'inv-1', 'inv-z']);
    expect(next[1].status).toBe('ENVIADO');
  });

  it('la transición es idempotente a nivel local (segundo guardado no cambia nada)', () => {
    const primero = transicionPreseleccionPorInvitacion([candidato()], invitacion());
    expect(primero.actualizado?.estado).toBe('preseleccionado');
    const segundo = transicionPreseleccionPorInvitacion(primero.candidatos, invitacion());
    expect(segundo.actualizado).toBeNull();
  });
});

describe('alta de candidato · duplicados y contador', () => {
  it('candidato duplicado por id → una sola entrada, el nuevo primero', () => {
    const prev = [candidato({ nombre: 'Antigua' }), candidato({ id: 'cand-2', nombre: 'Otra' })];
    const next = agregarCandidatoSinDuplicados(prev, candidato({ nombre: 'Nueva' }));
    expect(next.map((c) => c.id)).toEqual(['cand-1', 'cand-2']);
    expect(next[0].nombre).toBe('Nueva');
  });

  it('contador inexistente (undefined) → 1', () => {
    const sinContador = { id: 'inm-1' } as unknown as Inmueble;
    const { inmuebles, actualizado } = incrementarContadorCandidatos([sinContador], 'inm-1');
    expect(actualizado?.candidatosCount).toBe(1);
    expect(inmuebles[0].candidatosCount).toBe(1);
  });

  it('contador null → 1', () => {
    const nulo = { id: 'inm-1', candidatosCount: null } as unknown as Inmueble;
    const { actualizado } = incrementarContadorCandidatos([nulo], 'inm-1');
    expect(actualizado?.candidatosCount).toBe(1);
  });

  it('contador existente → +1', () => {
    const { actualizado } = incrementarContadorCandidatos([inmueble({ candidatosCount: 4 })], 'inm-1');
    expect(actualizado?.candidatosCount).toBe(5);
  });

  it('inmueble inexistente → lista intacta y nada que persistir', () => {
    const plan = planificarAltaCandidato([], [inmueble()], candidato({ inmuebleId: 'inm-otro' }));
    expect(plan.candidatos).toHaveLength(1);
    expect(plan.inmuebles[0].candidatosCount).toBe(2);
    expect(plan.inmuebleAPersistir).toBeNull();
  });

  it('plan completo: alta + contador + inmueble a persistir', () => {
    const plan = planificarAltaCandidato([candidato({ id: 'cand-0' })], [inmueble()], candidato());
    expect(plan.candidatos.map((c) => c.id)).toEqual(['cand-1', 'cand-0']);
    expect(plan.inmuebles[0].candidatosCount).toBe(3);
    expect(plan.inmuebleAPersistir?.candidatosCount).toBe(3);
  });
});

describe('persistencia · best-effort explícito (no transaccional)', () => {
  it('error de persistencia → se captura, se intentan todas las tareas y no se lanza', async () => {
    const llamadas: string[] = [];
    const fallo = new Error('Firestore no disponible');
    const { errores } = await persistirMejorEsfuerzo([
      () => {
        llamadas.push('invitacion');
      },
      () => {
        llamadas.push('candidato');
        throw fallo;
      },
      async () => {
        llamadas.push('tercera');
      },
    ]);
    expect(llamadas).toEqual(['invitacion', 'candidato', 'tercera']);
    expect(errores).toEqual([fallo]);
  });

  it('rechazo asíncrono → también se captura', async () => {
    const { errores } = await persistirMejorEsfuerzo([() => Promise.reject(new Error('denegado'))]);
    expect(errores).toHaveLength(1);
    expect(String(errores[0])).toContain('denegado');
  });

  it('sin fallos → lista de errores vacía', async () => {
    const { errores } = await persistirMejorEsfuerzo([() => undefined, async () => undefined]);
    expect(errores).toEqual([]);
  });

  it('el plan local es independiente del resultado de persistencia (documenta el contrato)', () => {
    // El plan se calcula antes de persistir: un fallo posterior de Firestore
    // NO revierte la transición local (coherencia local best-effort, sin
    // rollback transaccional). La convergencia llega con la próxima
    // sincronización/guardado.
    const plan = planificarGuardadoInvitacion([], [candidato()], invitacion());
    expect(plan.candidatos[0].estado).toBe('preseleccionado');
    expect(plan.candidatoAPersistir?.estado).toBe('preseleccionado');
  });
});

describe('cableado en App.tsx', () => {
  it('los manejadores usan los planes locales y la persistencia best-effort', () => {
    const src = readFileSync(resolve(RAIZ, 'src/App.tsx'), 'utf-8');
    expect(src).toContain("from './lib/invitacionesCandidatos'");
    expect(src).toContain('planificarGuardadoInvitacion(invitaciones, candidatos, inv)');
    expect(src).toContain('planificarAltaCandidato(candidatos, inmuebles, newCand)');
    expect(src).toContain('persistirMejorEsfuerzo(tareas)');
    // Sin aritmética insegura del contador en el manejador.
    expect(src).not.toContain('candidatosCount: inm.candidatosCount + 1');
  });
});
