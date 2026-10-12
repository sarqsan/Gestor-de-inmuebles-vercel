/**
 * Preflight de identidad de la promoción: identidad CANÓNICA (proyectarIdentidad)
 * frente a la ficha y a los destinos. Datos 100 % sintéticos; sin personas reales.
 */
import { describe, expect, it } from 'vitest';
import { proyectarIdentidad } from '../src/features/operaciones/persistence/authorization';
import { evaluarPreflightIdentidadImport } from '../src/lib/importExport/preflight';

const EMAIL = 'sintetico@test.local';

function identidad(espejo: Record<string, unknown>, perfil: Record<string, unknown> = { nombre: 'Sintético' }) {
  return proyectarIdentidad('uid_sintetico', { estado: 'ACTIVO', ...espejo }, perfil, EMAIL);
}

const TITULAR = identidad({ usuarioId: 'u1', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_T', carterasL: [], carterasE: [] });
const GESTOR = identidad({
  usuarioId: 'u2', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_GE',
  carterasL: ['prop_X'], carterasE: ['prop_X'],
});
const SOLO_LECTURA = identidad({
  usuarioId: 'u3', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_GL',
  carterasL: ['prop_X'], carterasE: [],
});
const FICHA_T = { id: 'u1', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_T' };
const FICHA_GE = { id: 'u2', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_GE' };
const FICHA_GL = { id: 'u3', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop_GL' };

describe('preflight de identidad · casos positivos', () => {
  it('titular propio escribiendo en su propio titular: pasa', () => {
    const r = evaluarPreflightIdentidadImport({ identidad: TITULAR, ficha: FICHA_T, destinos: ['prop_T', 'prop_T'] });
    expect(r).toEqual({ pasa: true, motivos: [] });
  });

  it('gestor con cartera de ESCRITURA confirmada en el espejo: pasa', () => {
    const r = evaluarPreflightIdentidadImport({ identidad: GESTOR, ficha: FICHA_GE, destinos: ['prop_X'] });
    expect(r.pasa).toBe(true);
  });

  it('administrador master: pasa', () => {
    const master = proyectarIdentidad('uid_m', { usuarioId: 'u9', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' }, {}, 'sarqsan2@gmail.com');
    const r = evaluarPreflightIdentidadImport({
      identidad: master, ficha: { id: 'u9', tipoPerfil: 'ADMINISTRADOR' }, destinos: ['prop_cualquiera'],
    });
    expect(r.pasa).toBe(true);
  });
});

describe('preflight de identidad · casos negativos (no se escribe nada)', () => {
  it('sin espejo canónico: bloquea', () => {
    const r = evaluarPreflightIdentidadImport({ identidad: null, ficha: FICHA_T, destinos: ['prop_T'] });
    expect(r.pasa).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/sin espejo usuarios_auth/);
  });

  it('espejo de OTRO usuario distinto de la ficha: bloquea', () => {
    const r = evaluarPreflightIdentidadImport({ identidad: TITULAR, ficha: { ...FICHA_T, id: 'otro' }, destinos: ['prop_T'] });
    expect(r.pasa).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/no coincide con el espejo/);
  });

  it('titular de la ficha distinto del titular del espejo: bloquea', () => {
    const r = evaluarPreflightIdentidadImport({ identidad: TITULAR, ficha: { ...FICHA_T, propietarioId: 'prop_Z' }, destinos: ['prop_T'] });
    expect(r.pasa).toBe(false);
  });

  it('destino ajeno sin cartera de escritura: bloquea sin revelar el id', () => {
    const r = evaluarPreflightIdentidadImport({ identidad: TITULAR, ficha: FICHA_T, destinos: ['prop_T', 'prop_X'] });
    expect(r.pasa).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/1 destino\(s\) fuera/);
    expect(r.motivos.join(' ')).not.toContain('prop_X');
  });

  it('cartera solo de LECTURA no autoriza escribir: bloquea', () => {
    const r = evaluarPreflightIdentidadImport({ identidad: SOLO_LECTURA, ficha: FICHA_GL, destinos: ['prop_X'] });
    expect(r.pasa).toBe(false);
  });

  it('el selector de titular no concede permisos: un destino sin escritura sigue bloqueado', () => {
    // El preflight sólo recibe identidad canónica + ficha + destinos (no el selector).
    const r = evaluarPreflightIdentidadImport({ identidad: TITULAR, ficha: FICHA_T, destinos: ['prop_X'] });
    expect(r.pasa).toBe(false);
  });

  it('ficha ADMINISTRADOR sin master: bloquea', () => {
    const noMaster = identidad({ usuarioId: 'u4', tipoPerfil: 'ADMINISTRADOR' });
    const r = evaluarPreflightIdentidadImport({ identidad: noMaster, ficha: { id: 'u4', tipoPerfil: 'ADMINISTRADOR' }, destinos: ['prop_T'] });
    expect(r.pasa).toBe(false);
    expect(r.motivos.join(' ')).toMatch(/administrador sin master/);
  });

  it('sin ficha de usuario: bloquea', () => {
    const r = evaluarPreflightIdentidadImport({ identidad: TITULAR, ficha: null, destinos: ['prop_T'] });
    expect(r.pasa).toBe(false);
  });
});
