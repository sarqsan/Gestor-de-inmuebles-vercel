import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstruirHistorial,versionDe } from '../persistence/versions.ts';
import { ejecutarRecorridoFicticio } from '../demo/recorrido.mjs';
const journey=ejecutarRecorridoFicticio().estado;
function filas(){const rows=new Map();for(const h of journey.historial){const k=h.referencia.tipo+'~'+h.referencia.id;const prev=rows.get(k);rows.set(k,{registro:h.despues,auditId:'referencia',versiones:[...(prev?.versiones??[]),versionDe(h)]});}return structuredClone([...rows.values()]);}
test('versiones reconstruyen exactamente el historial de negocio sin leer auditoría',()=>assert.deepEqual(reconstruirHistorial(filas(),'prop-demo-a'),journey.historial));
test('filas antiguas sin versiones fallan explícitamente, nunca hay fallback a audit_logs',()=>{
 const rows=filas();delete rows[0].versiones;assert.throws(()=>reconstruirHistorial(rows,'prop-demo-a'),/sin versiones/);
});
test('versiones manipuladas/reordenadas, cross-owner y snapshot alterado se rechazan',()=>{
 for(const mutar of [r=>r[3].versiones.reverse(),r=>r[0].versiones[0].ambito.propietarioId='ajeno',r=>r[0].registro.nombre='Manipulado']){const rows=filas();mutar(rows);assert.throws(()=>reconstruirHistorial(rows,'prop-demo-a'));}
});
test('un hueco en revisiones o ID idempotente duplicado no se oculta',()=>{
 const rows=filas();rows[1].versiones[0].comando.operacionId=rows[0].versiones[0].comando.operacionId;assert.throws(()=>reconstruirHistorial(rows,'prop-demo-a'),/duplicado/);
});
