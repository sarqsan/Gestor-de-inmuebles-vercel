import test from 'node:test';
import assert from 'node:assert/strict';
import { proyectarIdentidad, permitido, MASTER_EMAIL_CANONICO } from '../persistence/authorization.ts';
const perfil={nombre:'Cuenta sintética',roles:['MASTER'],permisos:['*'],carterasE:['intruso'],propietarioId:'intruso'};
const espejo=(v={})=>({usuarioId:'user-negocio',estado:'ACTIVO',tipoPerfil:'PROPIETARIO',...v});
for(const usuarioId of ['auth-uid','user-negocio'])test(`binding conservado: UID ${usuarioId==='auth-uid'?'=':'!='} usuarioId`,()=>{
 const i=proyectarIdentidad('auth-uid',espejo({usuarioId,propietarioId:'legal-1'}),perfil);
 assert.equal(i.usuarioId,usuarioId);assert.equal(i.uid,'auth-uid');assert.equal(permitido(i,'legal-1',true),true);assert.equal(permitido(i,'intruso'),false);
});
test('sin binding o perfil inexistente no se infiere identidad',()=>{
 assert.equal(proyectarIdentidad('auth-uid',{},perfil),null);assert.equal(proyectarIdentidad('auth-uid',espejo()),null);assert.equal(proyectarIdentidad(null,espejo(),perfil),null);
});
test('gestor profesional sin propiedad propia puede gestionar varios propietarios sin cuenta',()=>{
 const i=proyectarIdentidad('uid',espejo({tipoPerfil:'PROFESIONAL',carterasL:['legal-sin-cuenta-1','legal-sin-cuenta-2'],carterasE:['legal-sin-cuenta-2']}),perfil);
 assert.equal(i.propietarioId,undefined);assert.ok(permitido(i,'legal-sin-cuenta-1'));assert.equal(permitido(i,'legal-sin-cuenta-1',true),false);assert.ok(permitido(i,'legal-sin-cuenta-2',true));assert.equal(permitido(i,'ajeno'),false);
});
test('revocación conserva L sin recuperar E ni convertirse en gestión activa',()=>{
 const i=proyectarIdentidad('uid',espejo({tipoPerfil:'PROFESIONAL',carterasL:['p'],carterasE:[],estadoGestion:'REVOCADA'}),perfil);assert.ok(permitido(i,'p'));assert.equal(permitido(i,'p',true),false);
});
for(const estado of ['BLOQUEADO','INACTIVO','PENDIENTE'])test(`estado de cuenta ${estado} no concede carteras ni titularidad`,()=>{
 const i=proyectarIdentidad('uid',espejo({estado,propietarioId:'p',carterasL:['p'],carterasE:['p']}),perfil);assert.equal(permitido(i,'p'),false);assert.equal(permitido(i,'p',true),false);
});
test('E fuera de L falla cerrado; roles o email de perfil no conceden master',()=>{
 assert.throws(()=>proyectarIdentidad('uid',espejo({carterasE:['p']}),perfil),/contenida/);
 const i=proyectarIdentidad('uid',espejo(),{...perfil,email:MASTER_EMAIL_CANONICO});assert.equal(i.master,false);assert.equal(permitido(i,'p'),false);
});
test('master canónico procede de email autenticado, no del perfil ni de carteras',()=>{
 const i=proyectarIdentidad('uid',espejo({tipoPerfil:'ADMINISTRADOR'}),{nombre:'Master sintético'},MASTER_EMAIL_CANONICO);assert.equal(i.master,true);assert.ok(permitido(i,'p',true));
});
test('ADMINISTRADOR sin relación no recibe bypass operativo',()=>{
 const i=proyectarIdentidad('uid',espejo({tipoPerfil:'ADMINISTRADOR'}),perfil);assert.equal(permitido(i,'p'),false);
});
