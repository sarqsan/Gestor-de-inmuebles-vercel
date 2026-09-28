import { describe, expect, it } from 'vitest';
import { canAccessCobro, canAccessContrato, canWriteContrato } from '../src/lib/authService';
import type { CobroPeriodo, ContratoFormalizacion, UsuarioApp } from '../src/types';

const gestor = {
  id: 'g1', tipoPerfil: 'PROFESIONAL', nombre: 'Gestor', email: 'g@test.local',
  estado: 'ACTIVO', roles: ['GESTOR_PATRIMONIAL'], permisos: [], createdAt: '', updatedAt: '',
  inmueblesDelegadosParciales: ['inm-a'],
} as UsuarioApp;
const contrato = (overrides: Partial<ContratoFormalizacion> = {}) => ({
  id: 'ct-a', inmuebleId: 'inm-a', propietarioId: 'prop-a',
  ...overrides,
} as ContratoFormalizacion);
const cobro = (overrides: Partial<CobroPeriodo> = {}) => ({
  id: 'cobro-a', inmuebleId: 'inm-a', propietarioId: 'prop-a',
  ...overrides,
} as CobroPeriodo);

describe('ROADMAP-04 · filtro visual de contratos delegados', () => {
  it('muestra ciclos y cobros solo sobre inmuebles delegados en el contexto de UI', () => {
    expect(canAccessContrato(gestor, contrato(), [])).toBe(true);
    expect(canAccessCobro(gestor, cobro(), [])).toBe(true);
    expect(canWriteContrato(gestor, contrato())).toBe(false); // LECTURA no da escritura
    expect(canWriteContrato({ ...gestor, inmueblesDelegadosParcialesEscritura: ['inm-a'] }, contrato())).toBe(true);
    expect(canWriteContrato({ ...gestor, carterasE: ['prop-a'] }, contrato())).toBe(true);
    expect(canAccessContrato(gestor, contrato({ inmuebleId: 'inm-b', propietarioId: 'prop-b' }), [])).toBe(false);
    expect(canAccessCobro(gestor, cobro({ inmuebleId: 'inm-b', propietarioId: 'prop-b' }), [])).toBe(false);
  });

  it('los IDs parciales no conceden acceso si el usuario no recibe el contexto derivado', () => {
    const usuarioSinAmbito = { ...gestor, inmueblesDelegadosParciales: [] };
    expect(canAccessContrato(usuarioSinAmbito, contrato(), [])).toBe(false);
    expect(canAccessCobro(usuarioSinAmbito, cobro(), [])).toBe(false);
  });
});
