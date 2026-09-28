import { describe, expect, it } from 'vitest';
import {
  ambitosInmueblesParcialesActivosDe,
  inmueblesParcialesActivosDe,
  inmueblesParcialesEscrituraDe,
} from '../src/lib/carterasGestion';
import type { GestionCartera } from '../src/lib/gestionesCartera';

const gestion = (overrides: Partial<GestionCartera>): GestionCartera => ({
  id: 'g1', propietarioId: 'prop-a', gestorUsuarioId: 'gestor-1',
  tipoGestor: 'GESTOR_PROFESIONAL', inmuebleIds: ['inm-a'], permiso: 'LECTURA',
  responsableActual: 'TITULAR', estado: 'ACTIVA', requiereAceptacion: true,
  resolucionInvitacion: 'ACEPTADA', eventos: [], creadoPor: 'admin',
  fechaAlta: '2026-01-01', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  ...overrides,
});

describe('ROADMAP-04 · ámbito de alquiler por delegación parcial', () => {
  it('deriva solamente inmuebles de relaciones activas, aceptadas y del gestor autenticado', () => {
    const gestiones = [
      gestion({ id: 'activa', inmuebleIds: ['inm-a', 'inm-b'] }),
      gestion({ id: 'suspendida', inmuebleIds: ['inm-c'], estado: 'SUSPENDIDA' }),
      gestion({ id: 'pendiente', inmuebleIds: ['inm-d'], estado: 'PENDIENTE_ACEPTACION' }),
      gestion({ id: 'revocada', inmuebleIds: ['inm-e'], estado: 'REVOCADA' }),
      gestion({ id: 'otro-gestor', inmuebleIds: ['inm-f'], gestorUsuarioId: 'gestor-2' }),
      gestion({ id: 'completa', inmuebleIds: [] }),
      gestion({ id: 'escritura', inmuebleIds: ['inm-g'], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR' }),
      gestion({ id: 'duplicada', inmuebleIds: ['inm-a'] }),
    ];
    expect(inmueblesParcialesActivosDe(gestiones, 'gestor-1')).toEqual(['inm-a', 'inm-b', 'inm-g']);
    expect(inmueblesParcialesEscrituraDe(gestiones, 'gestor-1')).toEqual(['inm-g']);
    expect(ambitosInmueblesParcialesActivosDe(gestiones, 'gestor-1')).toEqual([
      { propietarioId: 'prop-a', inmuebleId: 'inm-a' },
      { propietarioId: 'prop-a', inmuebleId: 'inm-b' },
      { propietarioId: 'prop-a', inmuebleId: 'inm-g' },
    ]);
  });

  it('falla cerrado ante relación activa sin aceptación o IDs vacíos/mal formados', () => {
    const invalidas = [
      gestion({ resolucionInvitacion: undefined }),
      gestion({ inmuebleIds: [''] }),
      gestion({ inmuebleIds: [] }),
    ];
    expect(inmueblesParcialesActivosDe(invalidas, 'gestor-1')).toEqual([]);
    expect(inmueblesParcialesEscrituraDe([
      gestion({ permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR', resolucionInvitacion: undefined }),
    ], 'gestor-1')).toEqual([]);
  });
});
