import { expect,it } from 'vitest';
import { auditarInstantaneaRoadmap01, type InstantaneaRoadmap01 } from '../src/lib/auditoriaHistoricaRoadmap01';
import type { GestionCartera } from '../src/lib/gestionesCartera';
const gest = (inmuebleIds:string[]):GestionCartera => ({id:'g1',gestorUsuarioId:'u',propietarioId:'p',inmuebleIds,
  estado:'ACTIVA',permiso:'ESCRITURA',eventos:[]} as unknown as GestionCartera);
const fixture = ():InstantaneaRoadmap01 => ({
 usuarios:[{id:'u',authUid:'uid',email:'u@test.es',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',propietarioId:'mio'} as InstantaneaRoadmap01['usuarios'][number]],
 propietarios:[{id:'p'},{id:'mio'}] as InstantaneaRoadmap01['propietarios'],
 usuarios_auth:[{uid:'uid',usuarioId:'u',email:'u@test.es',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',propietarioId:'mio',carterasL:[],carterasE:[]}],
 gestiones_cartera:[gest(['i1'])], inmuebles:[{id:'i1',propietarioId:'p'}] as InstantaneaRoadmap01['inmuebles'],
 enlaces_registro:[],
});
it('auditoría histórica read-only marca parcial sobreautorizada sin alterar la instantánea', () => {
 const f=fixture(); f.usuarios_auth[0].carterasE=['p']; const previo=JSON.stringify(f);
 const h=auditarInstantaneaRoadmap01(f,'2026-09-28T10:00:00Z');
 expect(h.map(x=>x.codigo)).toContain('ESPEJO_SOBREAUTORIZADO');
 expect(h.map(x=>x.codigo)).toContain('GESTION_PARCIAL');
 expect(JSON.stringify(f)).toBe(previo);
});
it('espejo correcto, faltante, identidad forjada, invitación legacy y export incompleto', () => {
 const f=fixture(); f.gestiones_cartera=[];
 expect(auditarInstantaneaRoadmap01(f,'2026-09-28T10:00:00Z').map(h=>h.codigo)).toContain('ESPEJO_D3');
 f.usuarios_auth[0].usuarioId='otro'; f.usuarios_auth[0].carterasL=['p'];
 const codes=auditarInstantaneaRoadmap01(f,'2026-09-28T10:00:00Z').map(h=>h.codigo);
 expect(codes).toContain('ESPEJO_IDENTIDAD_D2'); expect(codes).toContain('ESPEJO_HUERFANO'); expect(codes).toContain('ESPEJO_SOBREAUTORIZADO');
 f.enlaces_registro=[{id:'e',usuarioIdVinculado:'u',propietarioIdVinculado:'mio',emailInvitado:'u@test.es',estadoInvitacion:'PENDIENTE',activo:true,usosActuales:0} as InstantaneaRoadmap01['enlaces_registro'][number]];
 expect(auditarInstantaneaRoadmap01(f,'2026-09-28T10:00:00Z').map(h=>h.codigo)).toContain('INVITACION_LEGACY_REEMITIR');
 expect(()=>auditarInstantaneaRoadmap01({...f,propietarios:undefined} as unknown as InstantaneaRoadmap01,'2026-09-28T10:00:00Z')).toThrow(/incompleta/);
});
