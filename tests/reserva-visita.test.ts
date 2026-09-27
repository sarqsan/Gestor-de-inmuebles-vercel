/**
 * FASE 4 — Reserva pública (delta de Arena C corregido).
 * ---------------------------------------------------------------------------
 * Fuente C: `PortalVisitaPublicaView.tsx` + `bookSlotTransaction`. Se recupera
 * la actualización local inmediata DESPUÉS de una reserva confirmada con la
 * secuencia: remoto → comprobar → (éxito: local + éxito | fallo: error, sin
 * confirmación local y sin éxito).
 *
 * Lo que NO se porta: el éxito incondicional de C tras fallo de persistencia
 * (try/catch vacío + actualización siempre) ni el fallback-en-catch anterior
 * de main. La actualización optimista NUNCA se presenta como confirmación.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, type Mock } from 'vitest';
import type { InvitacionVisita, VisitSlot } from '../src/types';
import {
  confirmarReservaVisita,
  construirActualizacionReservaLocal,
  MENSAJE_RESERVA_CONFIRMADA,
  MENSAJE_RESERVA_FALLIDA,
  type DependenciasReservaVisita,
} from '../src/lib/reservaVisita';

const RAIZ = resolve(__dirname, '..');
const AHORA = '2026-09-27T12:00:00.000Z';

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
    status: 'ABIERTO',
    fechaPreseleccion: '2026-09-27',
    createdAt: AHORA,
    ...extra,
  } as unknown as InvitacionVisita;
}

function slot(extra: Partial<VisitSlot> = {}): VisitSlot {
  return {
    id: 'slot-1',
    inmuebleId: 'inm-1',
    fecha: '2026-09-30',
    horaInicio: '10:00',
    horaFin: '10:30',
    disponible: true,
    ...extra,
  } as unknown as VisitSlot;
}

type DepsMock = DependenciasReservaVisita & {
  reservarRemoto: Mock;
  alConfirmarSlot: Mock;
  alConfirmarInvitacion: Mock;
  alConfirmarCandidato: Mock;
  alExito: Mock;
  alError: Mock;
};

function deps(over: Partial<DependenciasReservaVisita> = {}): DepsMock {
  return {
    reservarRemoto: vi.fn(async () => ({ ok: true })),
    alConfirmarSlot: vi.fn(),
    alConfirmarInvitacion: vi.fn(),
    alConfirmarCandidato: vi.fn(),
    alExito: vi.fn(),
    alError: vi.fn(),
    relojAhoraIso: () => AHORA,
    ...over,
  } as DepsMock;
}

const args = () => ({
  invitacion: invitacion(),
  slot: slot(),
  direccionCompleta: 'Calle Test 1, Madrid',
  notas: 'Llevo nóminas',
});

describe('reserva correcta', () => {
  it('remoto OK → local actualizado (slot/invitación/candidato) + éxito', async () => {
    const d = deps();
    const resultado = await confirmarReservaVisita(d, args());
    expect(resultado).toEqual({ confirmada: true });

    expect(d.reservarRemoto).toHaveBeenCalledTimes(1);
    expect(d.alConfirmarSlot).toHaveBeenCalledTimes(1);
    expect(d.alConfirmarInvitacion).toHaveBeenCalledTimes(1);
    expect(d.alConfirmarCandidato).toHaveBeenCalledWith('cand-1', 'visita_reservada');
    expect(d.alExito).toHaveBeenCalledWith(MENSAJE_RESERVA_CONFIRMADA);
    expect(d.alError).not.toHaveBeenCalled();

    const slotLocal = d.alConfirmarSlot.mock.calls[0][0] as VisitSlot;
    expect(slotLocal.disponible).toBe(false);
    expect(slotLocal.reservaCandidateId).toBe('cand-1');
    expect(slotLocal.reservaInvitationId).toBe('inv-1');
    const invLocal = d.alConfirmarInvitacion.mock.calls[0][0] as InvitacionVisita;
    expect(invLocal.status).toBe('HORARIO RESERVADO');
    expect(invLocal.bookedAt).toBe(AHORA);
    expect(invLocal.reserva?.slotId).toBe('slot-1');
  });

  it('la actualización local es POSTERIOR a la confirmación remota (orden estricto)', async () => {
    const orden: string[] = [];
    const d = deps({
      reservarRemoto: vi.fn(async () => {
        orden.push('remoto-inicio');
        await Promise.resolve();
        orden.push('remoto-fin');
      }),
      alConfirmarSlot: vi.fn(() => orden.push('slot')),
      alConfirmarInvitacion: vi.fn(() => orden.push('invitacion')),
      alConfirmarCandidato: vi.fn(() => orden.push('candidato')),
      alExito: vi.fn(() => orden.push('exito')),
    });
    await confirmarReservaVisita(d, args());
    expect(orden).toEqual(['remoto-inicio', 'remoto-fin', 'slot', 'invitacion', 'candidato', 'exito']);
  });
});

describe('error de transacción', () => {
  it('remoto falla → error conservado, cero confirmación local, cero éxito', async () => {
    const d = deps({
      reservarRemoto: vi.fn(async () => {
        throw new Error('Lo sentimos, este horario acaba de ser reservado.');
      }),
    });
    const resultado = await confirmarReservaVisita(d, args());
    expect(resultado).toEqual({ confirmada: false });

    expect(d.alError).toHaveBeenCalledWith('Lo sentimos, este horario acaba de ser reservado.');
    expect(d.alConfirmarSlot).not.toHaveBeenCalled();
    expect(d.alConfirmarInvitacion).not.toHaveBeenCalled();
    expect(d.alConfirmarCandidato).not.toHaveBeenCalled();
    expect(d.alExito).not.toHaveBeenCalled();
  });

  it('fallo sin mensaje útil → mensaje genérico (nunca éxito vacío)', async () => {
    for (const fallo of [new Error('   '), undefined, null, 42]) {
      const d = deps({
        reservarRemoto: vi.fn(async () => {
          throw fallo;
        }),
      });
      const resultado = await confirmarReservaVisita(d, args());
      expect(resultado.confirmada).toBe(false);
      expect(d.alError).toHaveBeenCalledWith(MENSAJE_RESERVA_FALLIDA);
      expect(d.alExito).not.toHaveBeenCalled();
    }
  });
});

describe('candidato existente / inexistente', () => {
  it('candidato existente → se ordena su transición a visita_reservada', async () => {
    const d = deps();
    await confirmarReservaVisita(d, args());
    expect(d.alConfirmarCandidato).toHaveBeenCalledWith('cand-1', 'visita_reservada');
  });

  it('candidato inexistente en local → el constructor no lo necesita (id opaco)', () => {
    // El reductor (`handleUpdateStatus`) ignora ids desconocidos sin errores;
    // aquí se fija que construir la actualización no exige resolverlo.
    const act = construirActualizacionReservaLocal({
      ...args(),
      invitacion: invitacion({ candidateId: 'cand-fantasma' }),
      ahoraIso: AHORA,
    });
    expect(act.candidatoId).toBe('cand-fantasma');
    expect(act.nuevoEstadoCandidato).toBe('visita_reservada');
    expect(act.slot.reservaCandidateId).toBe('cand-fantasma');
  });

  it('sin callback de candidato (opcional) → la confirmación sigue completa', async () => {
    const d = deps({ alConfirmarCandidato: undefined });
    const resultado = await confirmarReservaVisita(d, args());
    expect(resultado.confirmada).toBe(true);
    expect(d.alConfirmarSlot).toHaveBeenCalledTimes(1);
    expect(d.alConfirmarInvitacion).toHaveBeenCalledTimes(1);
    expect(d.alExito).toHaveBeenCalledTimes(1);
  });
});

describe('constructor local puro', () => {
  it('notas vacías → cadena vacía (nunca undefined)', () => {
    const act = construirActualizacionReservaLocal({ ...args(), notas: '', ahoraIso: AHORA });
    expect(act.invitacion.reserva?.notasCandidato).toBe('');
  });

  it('conserva los campos del slot/invitación no relacionados', () => {
    const act = construirActualizacionReservaLocal({
      ...args(),
      slot: slot({ habitacionId: 'hab-3' }),
      ahoraIso: AHORA,
    });
    expect(act.slot.habitacionId).toBe('hab-3');
    expect(act.slot.fecha).toBe('2026-09-30');
    expect(act.invitacion.token).toBe('vst-1');
  });
});

describe('cableado en PortalVisitaPublicaView', () => {
  it('usa el orquestador, muestra el error y no anuncia éxito incondicional', () => {
    const src = readFileSync(resolve(RAIZ, 'src/components/PortalVisitaPublicaView.tsx'), 'utf-8');
    expect(src).toContain("from '../lib/reservaVisita'");
    expect(src).toContain('confirmarReservaVisita(');
    expect(src).toContain('alError: (mensaje) => setErrorMessage(mensaje)');
    // El error tiene representación visible (antes el estado existía pero
    // nunca se mostraba ni se fijaba con contenido).
    expect(src).toContain('{errorMessage && (');
    // Sin éxito en finally ni fallback local en catch.
    expect(src).not.toContain('Firestore transaction fallback');
    expect(src).not.toMatch(/finally\s*\{[^}]*setSuccessMessage/s);
  });
});
