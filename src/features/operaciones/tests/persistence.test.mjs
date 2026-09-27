import assert from 'node:assert/strict';
import test from 'node:test';
import { crearRepositorioOperativo } from '../persistence/repository.ts';
import { permitido, proyectarIdentidad } from '../persistence/authorization.ts';
import { registrarAuditoriaFirestore, auditoriaDe, idAuditoria } from '../../../lib/auditoria.ts';
import { ejecutarRecorridoFicticio } from '../demo/recorrido.mjs';
import { CONTEXTO_FICTICIO, DATOS_FICTICIOS } from '../demo/fixtures.ts';
import { transporteMemoria } from './memory-transport.mjs';
const a=CONTEXTO_FICTICIO.ambito;
const journey=ejecutarRecorridoFicticio().estado;
async function ejecutarHasta(t,n=29){const r=crearRepositorioOperativo(t);for(const h of journey.historial.slice(0,n))await r.ejecutar(a,h.comando);return r;}

test('persistencia: journey de 29 eventos conserva entidades y cadena exacta del motor',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t);const d=await r.cargar(a);assert.deepEqual(d.estado,journey);assert.equal(t.auditoria.size,29);
  assert.equal(d.cabecera.abiertasPorIncidencia['incidencia-demo'],0);assert.equal(d.cabecera.abiertasPorAveria['averia-demo'],0);assert.equal(d.cabecera.presupuestosEnUso['presupuesto-demo'],1);
});
for(const tipo of Object.keys(DATOS_FICTICIOS))test(`persiste y recupera ${tipo} sin modelo paralelo`,async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,9);const d=await r.cargar(a);
  assert.deepEqual(d.estado.entidades.find((e)=>e.tipo===tipo),journey.historial.find((h)=>h.referencia.tipo===tipo).despues);
});
test('idempotencia persistente: reintentar todos los comandos no duplica entidad, revisión ni audit_logs',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t);for(const h of journey.historial)await r.ejecutar(a,h.comando);
  assert.equal(t.auditoria.size,29);assert.deepEqual((await r.cargar(a)).estado,journey);
});
test('conflicto de clave idempotente no admite contenido diferente',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,1);await assert.rejects(r.ejecutar(a,{...journey.historial[0].comando,motivo:'Alterado'}),/CONFLICTO_IDEMPOTENCIA/);assert.equal(t.auditoria.size,1);
});
for(const punto of ['entidad','auditoria','cabecera','commit'])test(`rollback de entidad + audit_logs + revisión ante fallo en ${punto}`,async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,9),antes=structuredClone(t.libros),auditoria=structuredClone(t.auditoria);t.fallo=punto;
  await assert.rejects(r.ejecutar(a,journey.historial[9].comando),/Fallo simulado/);assert.deepEqual(t.libros,antes);assert.deepEqual(t.auditoria,auditoria);
  t.fallo='';await r.ejecutar(a,journey.historial[9].comando);assert.equal(t.auditoria.size,10);
});
test('auditoría canónica: envelope B y referencia de versión, sin copiar histórico de negocio',async()=>{
  const t=transporteMemoria();await ejecutarHasta(t);for(const h of journey.historial){const log=t.auditoria.get(idAuditoria(h));assert.equal(log.usuarioId,'user-actor-ficticio');assert.equal(log.detalles.actorUid,'actor-ficticio');assert.equal(log.fechaHora,h.fecha);assert.equal(log.accion,'OPERACIONES_'+h.comando.accion);assert.equal(log.resultado,'EXITO');assert.equal(log.detalles.evento,undefined);assert.equal(log.detalles.version,h.despues.version);}
});
test('registrarAuditoriaFirestore rechaza actor falso sin invocar transporte',()=>{
  assert.throws(()=>registrarAuditoriaFirestore(auditoriaDe(journey.historial[0],{uid:'otro'}),{crearAuditoria(){assert.fail('No debe escribir');}}),/Actor/);
});
test('actor de comando no sustituye al UID autenticado',async()=>{
  const t=transporteMemoria(),r=crearRepositorioOperativo(t);await assert.rejects(r.ejecutar(a,{...journey.historial[0].comando,actor:'suplantado'}),/actor/);assert.equal(t.auditoria.size,0);
});
test('dos actualizaciones concurrentes: un éxito y un conflicto, nunca estado parcial',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,9);const cmd=journey.historial[9].comando;
  const resultados=await Promise.allSettled([r.ejecutar(a,cmd),r.ejecutar(a,{...cmd,operacionId:'otra-op',texto:'Otro diagnóstico'})]);
  assert.equal(resultados.filter((x)=>x.status==='fulfilled').length,1);assert.equal(t.auditoria.size,10);assert.equal(t.libros.get(a.propietarioId).estado.revision,10);
});
test('no cierra expediente con averías pendientes ni guarda auditoría de éxito',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,11);const cmd={...journey.historial[11].comando,estado:'CANCELADA'};
  await assert.rejects(r.ejecutar(a,cmd),/ACTUACIONES_PENDIENTES/);assert.equal(t.auditoria.size,11);
});
test('no persiste factura con reparación inexistente',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,9);const cmd={...journey.historial[22].comando,revisionEsperada:9,vinculo:{incidenciaId:'incidencia-demo',reparacionId:'ausente'}};
  await assert.rejects(r.ejecutar(a,cmd),/REFERENCIA_INVALIDA/);assert.equal(t.auditoria.size,9);
});
test('no se puede mover el ámbito mediante un patch persistente',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,9);const cmd={...journey.historial[9].comando,accion:'MODIFICAR',tipo:'incidencia',id:'incidencia-demo',cambios:{propietarioId:'prop-demo-b'}};delete cmd.texto;delete cmd.clase;
  await assert.rejects(r.ejecutar(a,cmd),/CAMPO_NO_ADMITIDO/);
});
test('consulta histórica permitida; escritura tras cesión rechazada en transacción',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,9);t.titulares.set('inm-demo-1',['prop-demo-b']);assert.equal((await r.cargar(a)).estado.revision,9);
  await assert.rejects(r.ejecutar(a,journey.historial[9].comando),/titularidad actual/);assert.equal(t.auditoria.size,9);
});
const casos=[
  ['titular',{propietarioId:'prop-demo-a'},true,true],['otro propietario',{propietarioId:'prop-demo-b'},false,false],
  ['gestor L',{carterasL:['prop-demo-a']},true,false],['gestor E',{carterasL:['prop-demo-a'],carterasE:['prop-demo-a']},true,true],
  ['revocado con histórico',{carterasL:['prop-demo-a'],carterasE:[],estadoGestion:'REVOCADA'},true,false],
  ['revocado sin histórico',{carterasL:[],carterasE:[],estadoGestion:'REVOCADA'},false,false],
  ['autenticado sin relación',{},false,false],['UI admin sin ámbito',{roles:['ADMIN'],permisos:['*'],activo:true},false,false],
  ['admin con ámbito canónico',{roles:['ADMIN'],carterasL:['prop-demo-a'],carterasE:['prop-demo-a']},true,true],
  ['master sin ámbito',{roles:['MASTER']},false,false],['master con ámbito canónico',{roles:['MASTER'],carterasL:['prop-demo-a'],carterasE:['prop-demo-a']},true,true],
];
for(const [nombre,claims,lectura,escritura]of casos)test(`matriz de adaptación canónica (no emulador): ${nombre}`,async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,9);t.sesion=proyectarIdentidad('actor-ficticio',{usuarioId:'user-actor-ficticio',tipoPerfil:'PROPIETARIO',estado:'ACTIVO',...claims},{nombre:'Ficticio'});
  assert.equal(permitido(t.sesion,a.propietarioId),lectura);assert.equal(permitido(t.sesion,a.propietarioId,true),escritura);
  if(lectura)assert.equal((await r.cargar(a)).estado.revision,9);else await assert.rejects(r.cargar(a),/lectura/);
  if(escritura)await r.ejecutar(a,journey.historial[9].comando);else await assert.rejects(r.ejecutar(a,journey.historial[9].comando),/escritura/);
});
test('anónimo no lee ni escribe',async()=>{const t=transporteMemoria(),r=crearRepositorioOperativo(t);t.sesion=null;await assert.rejects(r.cargar(a),/lectura/);await assert.rejects(r.ejecutar(a,journey.historial[0].comando),/escritura/);});
test('carterasE fuera de L falla cerrado; cuenta/perfil no adjudica propiedad',()=>{
  assert.throws(()=>proyectarIdentidad('uid',{usuarioId:'user-distinto',estado:'ACTIVO',carterasE:['prop-demo-a']},{}),/contenida/);
  assert.equal(permitido(proyectarIdentidad('prop-demo-a',{nombre:'Titular',activo:true}),'prop-demo-a'),false);
});
test('snapshot incompleto falla sin guardar nuevos eventos',async()=>{
  const t=transporteMemoria(),r=await ejecutarHasta(t,9);t.libros.get(a.propietarioId).estado.historial.pop();await assert.rejects(r.cargar(a),/incompleta/);assert.equal(t.auditoria.size,9);
});
