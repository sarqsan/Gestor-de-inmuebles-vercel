/**
 * D2 (ORDEN 3 §2) — Puertas de lectura de la UI (`canAccess*`) con carteras.
 * La autorización efectiva está en Firestore Rules (ver
 * seguridad-firestore-d2.test.ts); aquí se prueba que la VISTA del gestor
 * multicartera incluye su ámbito (propio + L/E) sin mezclar carteras, y que
 * el operativo sin carteras sigue denegado.
 */
import { describe, expect, it } from 'vitest';
import {
  canAccessCandidato,
  canAccessCobro,
  canAccessContrato,
  canAccessInmueble,
} from '../src/lib/authService';
import type { Candidato, CobroPeriodo, ContratoFormalizacion, Inmueble, UsuarioApp } from '../src/types';

const u = (over: Partial<UsuarioApp> & { id: string; tipoPerfil: UsuarioApp['tipoPerfil'] }): UsuarioApp =>
  ({
    nombre: 'T', email: 't@t.local', estado: 'ACTIVO', roles: [], permisos: [],
    createdAt: '', updatedAt: '', ...over,
  }) as UsuarioApp;

const GESTOR_E = u({ id: 'gE', tipoPerfil: 'PROPIETARIO', carterasL: ['prop_A'], carterasE: ['prop_A'] });
const GESTOR_L = u({ id: 'gL', tipoPerfil: 'PROPIETARIO', carterasL: ['prop_A'] });
const GESTOR_PROF = u({ id: 'gP', tipoPerfil: 'PROFESIONAL', profesionalId: 'prof_g', carterasL: ['prop_A'], carterasE: ['prop_A'] });
const PROP_A = u({ id: 'pA', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_A' });
const PROP_B = u({ id: 'pB', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_B' });
const OPERATIVO = u({ id: 'op', tipoPerfil: 'PROFESIONAL', profesionalId: 'prof_1' });
const ADMIN = u({ id: 'ad', tipoPerfil: 'ADMINISTRADOR' });

const INM_A = { id: 'inm_A', propietarioId: 'prop_A', propietarioPrincipalId: 'prop_A' } as Inmueble;
const INM_B = { id: 'inm_B', propietarioId: 'prop_B', propietarioPrincipalId: 'prop_B' } as Inmueble;
const CT_A = { id: 'ct_A', propietarioId: 'prop_A', inmuebleId: 'inm_A' } as ContratoFormalizacion;
const CAND_A = { id: 'cand_A', inmuebleId: 'inm_A' } as unknown as Candidato;
const COBRO_A = { id: 'cobro_A', propietarioId: 'prop_A', inmuebleId: 'inm_A' } as unknown as CobroPeriodo;
const INMS = [INM_A, INM_B];

describe('D2 · canAccessInmueble con carteras', () => {
  it('gestor E/L ve la cartera; no ve otras carteras', () => {
    expect(canAccessInmueble(GESTOR_E, INM_A)).toBe(true);
    expect(canAccessInmueble(GESTOR_L, INM_A)).toBe(true);
    expect(canAccessInmueble(GESTOR_E, INM_B)).toBe(false);
    expect(canAccessInmueble(GESTOR_L, INM_B)).toBe(false);
  });
  it('gestor profesional ve su cartera; operativo sin carteras no', () => {
    expect(canAccessInmueble(GESTOR_PROF, INM_A)).toBe(true);
    expect(canAccessInmueble(GESTOR_PROF, INM_B)).toBe(false);
    expect(canAccessInmueble(OPERATIVO, INM_A)).toBe(false);
  });
  it('titular y admin intactos', () => {
    expect(canAccessInmueble(PROP_A, INM_A)).toBe(true);
    expect(canAccessInmueble(PROP_A, INM_B)).toBe(false);
    expect(canAccessInmueble(PROP_B, INM_A)).toBe(false);
    expect(canAccessInmueble(ADMIN, INM_A)).toBe(true);
    expect(canAccessInmueble(null, INM_A)).toBe(false);
  });
});

describe('D2 · canAccessContrato/Candidato/Cobro con carteras', () => {
  it('gestor accede a contrato/candidato/cobro de su cartera', () => {
    expect(canAccessContrato(GESTOR_E, CT_A, INMS)).toBe(true);
    expect(canAccessCandidato(GESTOR_E, CAND_A, INMS)).toBe(true);
    expect(canAccessCobro(GESTOR_E, COBRO_A, INMS)).toBe(true);
    expect(canAccessContrato(GESTOR_PROF, CT_A, INMS)).toBe(true);
    expect(canAccessCandidato(GESTOR_PROF, CAND_A, INMS)).toBe(true);
    expect(canAccessCobro(GESTOR_PROF, COBRO_A, INMS)).toBe(true);
  });
  it('sin vínculo con la cartera: denegado (sin mezcla)', () => {
    expect(canAccessContrato(PROP_B, CT_A, INMS)).toBe(false);
    expect(canAccessCandidato(PROP_B, CAND_A, INMS)).toBe(false);
    expect(canAccessCobro(PROP_B, COBRO_A, INMS)).toBe(false);
    expect(canAccessContrato(OPERATIVO, CT_A, INMS)).toBe(false);
    expect(canAccessCandidato(OPERATIVO, CAND_A, INMS)).toBe(false);
    expect(canAccessCobro(OPERATIVO, COBRO_A, INMS)).toBe(false);
  });
  it('titular y admin intactos', () => {
    expect(canAccessContrato(PROP_A, CT_A, INMS)).toBe(true);
    expect(canAccessCandidato(PROP_A, CAND_A, INMS)).toBe(true);
    expect(canAccessCobro(PROP_A, COBRO_A, INMS)).toBe(true);
    expect(canAccessContrato(ADMIN, CT_A, INMS)).toBe(true);
  });
});
