import test from 'node:test';
import assert from 'node:assert/strict';
import { sesion, crearCmd } from './support.mjs';
import { DATOS_FICTICIOS } from '../demo/fixtures.ts';
test('referencia externa opaca se conserva con evidencia original, actor, versión y evento',()=>{
  const s=sesion(),ref={sistemaExterno:'POLIZAS_B',referenciaExterna:'poliza-ejemplo'};
  s.crear('documento',{referenciaExterna:ref});const doc=s.estado.entidades[0],h=s.estado.historial[0];
  assert.deepEqual(doc.referenciaExterna,ref);assert.deepEqual(doc.archivo,DATOS_FICTICIOS.documento.archivo);assert.equal(doc.version,1);assert.equal(h.actor,'actor-demo');assert.deepEqual(h.despues,doc);assert.equal(doc.cobertura,undefined);
});
for(const ref of [{sistemaExterno:'B'}, {sistemaExterno:'',referenciaExterna:'p'}])test('referencia externa incompleta rechazada: '+JSON.stringify(ref),()=>{
  const s=sesion();s.error('DATO_INVALIDO',crearCmd('documento',{...DATOS_FICTICIOS.documento,referenciaExterna:ref}));assert.equal(s.estado.historial.length,0);
});
test('no acepta decisiones de cobertura dentro de una referencia externa',()=>{
  sesion().error('CAMPO_NO_ADMITIDO',crearCmd('documento',{...DATOS_FICTICIOS.documento,referenciaExterna:{sistemaExterno:'B',referenciaExterna:'p',cobertura:true}}));
});
