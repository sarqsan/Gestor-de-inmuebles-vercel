/** P0.2.7 — Conversión explícita solicitud → candidato, con traza y fallo visible. */
import { describe, it, expect } from 'vitest';
import { planificarConversionSolicitud, marcarConversionFallida } from '../src/lib/conversionSolicitud';
import { solicitudFixture } from './helpers/solicitudFixture';

const AHORA = () => new Date('2026-10-27T12:00:00.000Z');

describe('planificarConversionSolicitud', () => {
  it('construye candidato y marca la solicitud con traza append-only', () => {
    const solicitud = solicitudFixture({ historial: [{ id: 'h-0', fecha: 'x', accion: 'Alta' }] as never });
    const r = planificarConversionSolicitud(solicitud, [], { ahora: AHORA, candidatoId: 'cand-nuevo' });
    expect(r.procede).toBe(true);
    expect(r.candidato).toMatchObject({ id: 'cand-nuevo', email: 'sintetica@example.test', estado: 'nuevo' });
    expect(r.solicitud?.candidatoId).toBe('cand-nuevo');
    expect(r.solicitud?.estado).toBe('EN ANÁLISIS');
    expect(r.solicitud?.historial?.[0].accion).toBe('Conversión a candidato');
    expect(r.solicitud?.historial?.length).toBe(2);
  });

  it('es PURA: no muta la solicitud de entrada', () => {
    const solicitud = solicitudFixture();
    const copia = JSON.stringify(solicitud);
    planificarConversionSolicitud(solicitud, [], { ahora: AHORA });
    expect(JSON.stringify(solicitud)).toBe(copia);
  });

  it('sin correo válido ⇒ CONVERSION_PENDIENTE y la solicitud sigue visible', () => {
    const r = planificarConversionSolicitud(solicitudFixture({ candidatoEmail: 'no-valido' }), [], { ahora: AHORA });
    expect(r.procede).toBe(false);
    expect(r.solicitud?.observacionesOwner).toContain('CONVERSION_PENDIENTE');
    expect(r.solicitud?.historial?.[0].accion).toBe('Conversión pendiente');
  });

  it('candidato ya existente para ese inmueble ⇒ no duplica, vincula', () => {
    const existente = { id: 'cand-existente', email: 'SINTETICA@example.test', inmuebleId: 'inm-1' } as never;
    const r = planificarConversionSolicitud(solicitudFixture(), [existente], { ahora: AHORA });
    expect(r.procede).toBe(false);
    expect(r.candidato).toBeUndefined();
    expect(r.solicitud?.observacionesOwner).toContain('cand-existente');
  });

  it('solicitud cancelada ⇒ no procede', () => {
    const r = planificarConversionSolicitud(solicitudFixture({ estado: 'CANCELADA' }), [], { ahora: AHORA });
    expect(r.procede).toBe(false);
    expect(r.motivo).toContain('cancelada');
  });

  it('marcarConversionFallida conserva el motivo y no descarta la solicitud', () => {
    const marcada = marcarConversionFallida(solicitudFixture(), new Error('permission-denied'), '2026-10-27T12:00:00.000Z');
    expect(marcada.observacionesOwner).toContain('CONVERSION_PENDIENTE');
    expect(marcada.observacionesOwner).toContain('permission-denied');
    expect(marcada.id).toBe('sol-1');
    expect(marcada.historial?.[0].accion).toBe('Conversión pendiente');
  });
});
