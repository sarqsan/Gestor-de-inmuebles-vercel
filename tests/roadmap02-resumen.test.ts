import { describe, expect, it } from 'vitest';
import { resumirOnboardingR02, validarConsumoOnboardingR02, invitacionTerminalR02 } from '../src/lib/roadmap02Onboarding';
import type { EnlaceRegistro, UsuarioApp } from '../src/types';

const enlace: EnlaceRegistro = { id:'i1',token:'secret',tipoPerfil:'PROPIETARIO',textoVisible:'Invitación',activo:true,
 estadoInvitacion:'PENDIENTE',usuarioIdVinculado:'u1',propietarioIdVinculado:'o1',emailInvitado:'a@b.es',
 fechaCaducidadMs:2000,usosMaximos:1,usosActuales:0,creadoPor:'master',createdAt:'2026-01-01' };
const usuario: UsuarioApp = { id:'u1',nombre:'A',tipoPerfil:'PROPIETARIO',estado:'PENDIENTE',roles:['PROPIETARIO'],permisos:[],email:'a@b.es',
 propietarioId:'o1',createdAt:'2026-01-01',updatedAt:'2026-01-01' };

describe('ROADMAP-02 workflow seguro', () => {
 it('identifica retry Firestore sin sugerir borrar Auth', () => {
  const s = resumirOnboardingR02({usuario:{...usuario,authUid:'auth1'},errorFirestore:'offline'});
  expect(s.authUid).toBe('auth1'); expect(s.aviso).toContain('Autenticación conservada'); expect(s.siguiente).toBe('PERSONA');
 });
 it('rechaza email ajeno y acepta solo enlace vigente + usuario nominal', () => {
  expect(validarConsumoOnboardingR02(enlace,usuario,'intruso@b.es','1970-01-01T00:00:00Z').ok).toBe(false);
  expect(validarConsumoOnboardingR02(enlace,usuario,'a@b.es','1970-01-01T00:00:01Z').ok).toBe(true);
 });
 it.each(['ACEPTADA','RECHAZADA','REVOCADA'] as const)('estado %s es terminal', estado => {
  expect(invitacionTerminalR02({...enlace,estadoInvitacion:estado},0)).toBe(true);
 });
 it('expiración y consumo alcanzado son terminales', () => {
  expect(invitacionTerminalR02(enlace,2000)).toBe(true);
  expect(invitacionTerminalR02({...enlace,usosActuales:1},0)).toBe(true);
 });
 it('rol y UID aislados no inventan acceso ni Persona', () => {
  const s = resumirOnboardingR02({usuario:{...usuario,authUid:'uid',roles:['GESTOR_PATRIMONIAL']}});
  expect(s.pasos.ACCESO).toBe('PENDIENTE'); expect(s.pasos.PERSONA).toBe('PENDIENTE');
 });
 it('acota Persona a vínculos respaldados por propietario existente', () => {
  const s = resumirOnboardingR02({usuario, persona:{id:'p1',nombre:'A',estado:'ACTIVA',estadoDatos:'COMPLETO',roles:['PROPIETARIO'],propietarioIds:['o1','o2'],createdAt:'x',updatedAt:'x'}, propietarios:[{id:'o1',personaId:'p1'}]});
  expect(s.propietarioIds).toEqual(['o1']);
 });
});
