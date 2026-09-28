import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {crearEvaluadorReglas} from './harness/firestoreRulesEval';
const rules=crearEvaluadorReglas(readFileSync('firestore.rules','utf8')).permite;
const mirror={usuarioId:'g',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',carterasL:['o'],carterasE:[],gestionesPorPropietario:{o:'o~g'}};
const user={id:'g',authUid:'uid-g',estado:'ACTIVO',tipoPerfil:'PROPIETARIO',propietarioId:'other',inmuebleIds:[]};
const gestion={id:'o~g',gestorUsuarioId:'g',propietarioId:'o',estado:'ACTIVA',inmuebleIds:[],permiso:'LECTURA',resolucionInvitacion:'ACEPTADA'};
const db={'usuarios_auth/uid-g':mirror,'usuarios/g':user,'gestiones_cartera/o~g':gestion,'propietarios/o':{id:'o',nombre:'Fiscal'},'inmuebles/i':{id:'i',propietarioId:'o'},'inmuebles/j':{id:'j',propietarioId:'otro'}};
const auth={uid:'uid-g',token:{email:'g@example.es',email_verified:true}};
describe('R02 actual authorization after index and stale projections',()=>{
 it('requires a live active relationship to expose delegated proprietor/inmueble',()=>{
  const req=(col:string,id:string)=>({auth,db,docId:id,resource:db[`${col}/${id}` as keyof typeof db],requestResource:null});
  expect(rules('propietarios','get',req('propietarios','o'))).toBe(true);
  expect(rules('inmuebles','get',req('inmuebles','i'))).toBe(true);
  expect(rules('inmuebles','get',req('inmuebles','j'))).toBe(false);
  const revoked={...db,'gestiones_cartera/o~g':{...gestion,estado:'REVOCADA'}};
  expect(rules('propietarios','get',{...req('propietarios','o'),db:revoked})).toBe(false);
  expect(rules('inmuebles','get',{...req('inmuebles','i'),db:revoked})).toBe(false);
 });
 it('does not let staff role list private R02 invites or user profiles',()=>{
   const inv={id:'e',finalidad:'ONBOARDING_CARTERA',usuarioIdVinculado:'g',emailInvitado:'g@example.es'};
   const db2={...db,'enlaces_registro/e':inv};
   expect(rules('enlaces_registro','list',{auth,db:db2,docId:'e',resource:inv,requestResource:null})).toBe(false);
   expect(rules('usuarios','get',{auth,db:db2,docId:'other',resource:{id:'other',tipoPerfil:'PROPIETARIO'},requestResource:null})).toBe(false);
 });
});
