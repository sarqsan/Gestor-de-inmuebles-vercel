import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import * as gestionDominio from '../src/lib/gestionesCartera';
import type { Propietario, UsuarioApp } from '../src/types';
import { crearPersona, vincularPropietario, vincularUsuario, cambiarRolesPersona, estadoAccesoPersona, auditoriaPersona } from '../src/lib/personas';
import { crearGestion, registrarEvento } from '../src/lib/gestionesCartera';
import { proyectarCarterasGestionadas } from '../src/lib/carterasGestion';
const T = '2026-09-27T12:00:00Z';
const owner = (id: string): Propietario => ({ id, nombre: id, nifCif: '', tipoPropietario: 'persona_fisica', telefono: '', email: '', direccion: '', ciudad: '', codigoPostal: '', cuentasBancarias: [], fechaCreacion: T, fechaActualizacion: T });
const user = (id: string, propietarioId?: string): UsuarioApp => ({ id, nombre: id, email: `${id}@test.local`, estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', roles: [], permisos: [], propietarioId, createdAt: T, updatedAt: T });
const gestion = (gestorUsuarioId: string, propietarioId: string, inmuebleIds: string[] = []) => {
  const g = crearGestion({ id: `${gestorUsuarioId}_${propietarioId}`, gestorUsuarioId, propietarioId,
    propietarioTieneCuenta: false, tipoGestor: 'GESTOR_PROFESIONAL', permiso: 'LECTURA_ESCRITURA', inmuebleIds,
    fecha: T, actorId: 'master' });
  if (!('gestion' in g)) throw new Error(g.error);
  const a = registrarEvento(g.gestion, { tipo: 'ACTIVACION', fecha: T, actorId: 'master' });
  if (!('gestion' in a)) throw new Error(a.error);
  return a.gestion;
};

describe('ROADMAP-01 · identidad separada de titularidad, gestión y acceso', () => {
  it('persona y propietario sin cuenta; datos incompletos no revocan propiedad', () => {
    const p = crearPersona('pers_A', 'Ana', T);
    const { persona, propietario } = vincularPropietario(p, owner('prop_A'), T);
    expect(persona.usuarioId).toBeUndefined();
    expect(persona.estadoDatos).toBe('INCOMPLETO');
    expect(estadoAccesoPersona(persona)).toBe('PENDIENTE');
    expect(propietario.personaId).toBe(p.id);
    expect(persona.propietarioIds).toEqual(['prop_A']);
    expect(() => vincularPropietario(crearPersona('pers_B', 'B', T), propietario, T)).toThrow();
  });
  it('vincula el mismo propietario a un usuario pendiente sin crear otra persona ni Auth', () => {
    const { persona, propietario } = vincularPropietario(crearPersona('p', 'A', T), owner('o'), T);
    const pendiente = { ...user('u', 'o'), estado: 'PENDIENTE' as const };
    const vinculo = vincularUsuario(persona, pendiente, T);
    expect(vinculo.persona.id).toBe(persona.id);
    expect(vinculo.usuario.propietarioId).toBe(propietario.id);
    expect(vinculo.usuario.authUid).toBeUndefined();
    expect(estadoAccesoPersona(vinculo.persona, pendiente)).toBe('PENDIENTE');
    expect(estadoAccesoPersona(vinculo.persona, { ...vinculo.usuario, estado: 'ACTIVO', authUid: 'uid' })).toBe('ACTIVO');
    expect(estadoAccesoPersona(vinculo.persona, { ...vinculo.usuario, estado: 'INACTIVO', authUid: 'uid' })).toBe('REVOCADO');
    expect(estadoAccesoPersona({ ...vinculo.persona, estado: 'BLOQUEADA' }, { ...vinculo.usuario, estado: 'ACTIVO', authUid: 'uid' })).toBe('ACTIVO');
    expect(estadoAccesoPersona(vinculo.persona, { ...vinculo.usuario, estado: 'BLOQUEADO', authUid: 'uid' })).toBe('BLOQUEADO');
    expect(() => vincularUsuario(vinculo.persona, user('otro', 'o'), T)).toThrow();
    expect(() => vincularUsuario(persona, user('otro', 'ajeno'), T)).toThrow();
  });
  it('roles de dominio nunca conceden carteras; gestor propietario conserva solo titularidad propia', () => {
    const own = vincularPropietario(crearPersona('p', 'A', T), owner('prop_A'), T).persona;
    const rol = cambiarRolesPersona(own, ['PROPIETARIO', 'GESTOR_PROPIETARIO'], T);
    expect(rol.propietarioIds).toEqual(['prop_A']);
    expect(proyectarCarterasGestionadas([], 'u')).toEqual({ carterasL: [], carterasE: [] });
    const delegada = gestion('u', 'prop_B');
    expect(proyectarCarterasGestionadas([delegada], 'u')).toEqual({ carterasL: ['prop_B'], carterasE: ['prop_B'] });
    expect(rol.propietarioIds).not.toContain('prop_B');
    expect(cambiarRolesPersona(rol, ['PROPIETARIO'], T).roles).toEqual(['PROPIETARIO']);
    expect(() => cambiarRolesPersona(rol, ['GESTOR_PROFESIONAL'], T)).toThrow();
  });
  it('gestor profesional sin propiedad, varias carteras aisladas, revocación y delegación parcial fail-closed', () => {
    const profesional = cambiarRolesPersona(crearPersona('pro', 'Gestora', T), ['GESTOR_PROFESIONAL'], T);
    const gA = gestion('u', 'prop_A');
    const gB = gestion('u', 'prop_B');
    expect(profesional.propietarioIds).toEqual([]);
    expect(proyectarCarterasGestionadas([gA, gB], 'u').carterasE).toEqual(['prop_A', 'prop_B']);
    expect(proyectarCarterasGestionadas([gA, gB], 'ajeno').carterasL).toEqual([]);
    const rev = registrarEvento(gA, { tipo: 'REVOCACION', actorId: 'master', fecha: T, conservarLecturaHistorica: false });
    if (!('gestion' in rev)) throw new Error(rev.error);
    expect(proyectarCarterasGestionadas([rev.gestion, gB], 'u').carterasE).toEqual(['prop_B']);
    expect(proyectarCarterasGestionadas([gestion('u', 'prop_A', ['inm_1'])], 'u')).toEqual({ carterasL: [], carterasE: [] });
    expect(cambiarRolesPersona(profesional, [], T).roles).toEqual([]);
  });
  it('mutación adversarial: quitar el corte de ámbito parcial concede cartera completa y el test lo detecta', () => {
    const fuente = readFileSync(resolve(__dirname, '../src/lib/carterasGestion.ts'), 'utf8');
    const guard = 'if (!Array.isArray(gestion.inmuebleIds) || gestion.inmuebleIds.length !== 0) continue;';
    expect(fuente.split(guard).length).toBe(2);
    const mutada = transpileModule(fuente.replace(guard, ''), {
      compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText;
    const exportsMutados: Record<string, any> = {};
    new Function('require', 'exports', mutada)(() => gestionDominio, exportsMutados);
    const parcial = gestion('u', 'prop_A', ['inm_1']);
    expect(proyectarCarterasGestionadas([parcial], 'u').carterasE).toEqual([]);
    expect(exportsMutados.proyectarCarterasGestionadas([parcial], 'u').carterasE).toEqual(['prop_A']);
  });
  it('audit_logs reutilizado, sin credenciales ni datos patrimoniales', () => {
    const a = auditoriaPersona({ id: 'log', accion: 'VINCULO_CUENTA', personaId: 'p', actorUid: 'uid', actorEmail: 'master@test.local', fecha: T, detalle: { usuarioId: 'u' } });
    expect(a.entidadAfectada).toBe('persona');
    expect(a.idAfectado).toBe('p');
    expect(a.detalles).toEqual({ usuarioId: 'u' });
  });
});
