import assert from 'node:assert/strict';
import test from 'node:test';
import { ejecutarOperacion, crearEstadoOperaciones, prepararCambioPersistencia, consultarExpediente } from '../index.ts';
import { CONTEXTO_FICTICIO, DATOS_FICTICIOS } from '../demo/fixtures.ts';
import { ejecutarRecorridoFicticio } from '../demo/recorrido.mjs';
import { base, sesion, enCurso, finalizar, congelar, datosIncidenciaSinEquipo, modificarCmd, estadoCmd, crearCmd } from './support.mjs';

test('crea las nueve entidades distintas y un evento por creación', () => {
  const s = base(); assert.equal(s.estado.entidades.length, 9); assert.equal(s.estado.historial.length, 9);
  for (const e of s.estado.entidades) { assert.equal(e.version, 1); assert.ok(e.creadoEn); }
  assert.equal(s.estado.entidades.find((e) => e.tipo === 'factura').vinculo, null);
});
for (const tipo of Object.keys(DATOS_FICTICIOS)) test(`no sobrescribe ID existente: ${tipo}`, () => {
  const s = base(); s.error('DUPLICADO', crearCmd(tipo)); assert.equal(s.estado.revision, 9);
});
for (const alcance of ['INMUEBLE', 'ZONAS_COMUNES', 'MANTENIMIENTO_GENERAL']) test(`incidencia sin contrato ni inquilino: ${alcance}`, () => {
  const s = sesion(); s.ok(crearCmd('incidencia', { ...datosIncidenciaSinEquipo, alcance }));
  const e = s.estado.entidades[0]; assert.equal(e.contratoId, undefined); assert.equal(e.inquilinoId, undefined); assert.equal(e.estado, 'ABIERTA');
});
for (const contratoId of ['contrato-demo', 'contrato-historico-demo']) test(`reutiliza contrato/arrendatario, incluso histórico: ${contratoId}`, () => {
  const s = sesion(); s.ok(crearCmd('incidencia', { ...datosIncidenciaSinEquipo, contratoId, inquilinoId: 'candidato-demo' }));
  assert.equal(s.estado.entidades[0].contratoId, contratoId);
});
test('admite arrendatario conocido sin exigir contrato formalizado', () => {
  const s = sesion(); s.ok(crearCmd('incidencia', { ...datosIncidenciaSinEquipo, inquilinoId: 'candidato-demo' }));
});
for (const datos of [{ contratoId: 'ausente' }, { inquilinoId: 'ausente' }, { contratoId: 'contrato-demo', inquilinoId: 'no-es-arrendatario' }]) test(`rechaza alquiler incoherente ${JSON.stringify(datos)}`, () => {
  sesion().error('RELACION_ALQUILER_INVALIDA', crearCmd('incidencia', { ...datosIncidenciaSinEquipo, ...datos }));
});
test('estados cambian solo por transición explícita y con evidencia antes/después', () => {
  const s = base(); const r = s.cambiar('incidencia', 'EN_REVISION');
  assert.equal(r.evento.antes.estado, 'ABIERTA'); assert.equal(r.evento.despues.estado, 'EN_REVISION');
  assert.equal(r.evento.actor, 'actor-demo'); assert.ok(r.evento.motivo); assert.equal(r.evento.despues.version, 2);
});
test('no permite saltos de estado ni estado introducido por patch', () => {
  const s = base(); s.error('TRANSICION_INVALIDA', estadoCmd('incidencia', 'CERRADA'));
  s.error('CAMPO_NO_ADMITIDO', modificarCmd('incidencia', { estado: 'CERRADA' }));
});
test('flujo de incidencia extensible por política explícita, sin modificar el default', () => {
  const ctx = { ...CONTEXTO_FICTICIO, flujoIncidencias: { inicial: 'RECIBIDA', terminales: ['ARCHIVADA'], transiciones: { RECIBIDA: ['TRIAGE'], TRIAGE: ['ARCHIVADA'], ARCHIVADA: [] } } };
  const s = sesion(ctx); s.ok(crearCmd('incidencia', datosIncidenciaSinEquipo)); s.cambiar('incidencia', 'TRIAGE'); s.cambiar('incidencia', 'ARCHIVADA');
  const otro = sesion(); otro.ok(crearCmd('incidencia', datosIncidenciaSinEquipo)); assert.equal(otro.estado.entidades[0].estado, 'ABIERTA');
});
test('rechaza política con destinos no declarados', () => {
  const ctx = { ...CONTEXTO_FICTICIO, flujoIncidencias: { inicial: 'A', terminales: [], transiciones: { A: ['DESCONOCIDO'] } } };
  sesion(ctx).error('POLITICA_INVALIDA', crearCmd('incidencia', datosIncidenciaSinEquipo));
});
test('avería conserva síntomas, equipo, garantía y diagnóstico como evento separado', () => {
  const s = base(); s.ok({ accion: 'ANOTAR', tipo: 'averia', id: 'averia-demo', clase: 'DIAGNOSTICO', texto: 'Obstrucción comprobada' });
  const e = consultarExpediente(s.estado, s.ctx, { tipo: 'averia', id: 'averia-demo' });
  assert.deepEqual(e.principal.sintomas, ['Agua retenida']); assert.equal(e.historial.at(-1).comando.clase, 'DIAGNOSTICO');
  assert.equal(e.principal.garantiaId, 'garantia-demo'); assert.ok(e.relacionadas.some((x) => x.tipo === 'reparacion'));
});
test('no confunde incidencia con avería ni permite referencias ausentes', () => {
  const s = base(); s.error('REFERENCIA_INVALIDA', crearCmd('averia', { ...DATOS_FICTICIOS.averia, incidenciaId: 'averia-demo' }, 'averia-2'));
});
test('garantía debe corresponder al equipo de la avería', () => {
  const s = base(); s.crear('equipo', { numeroSerie: 'SERIE-2' }, 'equipo-2');
  s.crear('incidencia', { equipoId: 'equipo-2' }, 'incidencia-2');
  s.error('RELACION_INCOHERENTE', crearCmd('averia', { ...DATOS_FICTICIOS.averia, incidenciaId: 'incidencia-2', equipoId: 'equipo-2' }, 'averia-2'));
});
test('no borra vínculos históricos mediante modificación genérica', () => {
  const s = base(); s.error('RELACION_INMUTABLE', modificarCmd('averia', { incidenciaId: 'otra' }));
  s.error('RELACION_INMUTABLE', modificarCmd('incidencia', { contratoId: 'contrato-demo' }));
});
test('bloquea resolver/cerrar incidencia con actuaciones pendientes', () => {
  const s = base(); s.cambiar('incidencia', 'EN_REVISION');
  s.error('ACTUACIONES_PENDIENTES', estadoCmd('incidencia', 'RESUELTA'));
  s.error('ACTUACIONES_PENDIENTES', estadoCmd('incidencia', 'CANCELADA'));
});
test('bloquea cerrar avería con reparación activa', () => {
  const s = base(); s.cambiar('averia', 'EN_DIAGNOSTICO'); s.error('ACTUACIONES_PENDIENTES', estadoCmd('averia', 'RESUELTA'));
});
test('presupuesto y factura nunca son la misma entidad ni se convierten automáticamente', () => {
  const s = base(); s.cambiar('presupuesto', 'APROBADO');
  assert.equal(s.estado.entidades.filter((e) => e.tipo === 'factura').length, 1);
  assert.equal(s.estado.entidades.find((e) => e.tipo === 'factura').vinculo, null);
  assert.equal(s.estado.entidades.find((e) => e.tipo === 'incidencia').estado, 'ABIERTA');
});
test('decisión de presupuesto conserva actor, motivo, importe y estado previo', () => {
  const s = base(); const r = s.ok(estadoCmd('presupuesto', 'APROBADO'), { actor: 'decisor-explicito', motivo: 'Autoriza presupuesto recibido' });
  assert.equal(r.evento.antes.estado, 'PENDIENTE'); assert.equal(r.evento.despues.importeCentimos, 12000); assert.equal(r.evento.actor, 'decisor-explicito');
  s.error('PRESUPUESTO_DECIDIDO', modificarCmd('presupuesto', { importeCentimos: 13000 }));
});
for (const estado of ['RECHAZADO', 'CANCELADO']) test(`presupuesto puede terminar ${estado} sin generar reparación ni cobertura`, () => {
  const s = base(); s.cambiar('presupuesto', estado); assert.equal(s.estado.entidades.find((e) => e.tipo === 'reparacion').estado, 'PLANIFICADA');
});
test('no inicia reparación con presupuesto no aprobado', () => {
  const s = base(); s.modificar('reparacion', { fechaInicio: '2026-09-27' });
  s.error('PRESUPUESTO_NO_APROBADO', estadoCmd('reparacion', 'EN_CURSO'));
});
test('reparación directa sin presupuesto es explícita y válida', () => {
  const s = base(); const { presupuestoId, ...datos } = DATOS_FICTICIOS.reparacion;
  s.ok(crearCmd('reparacion', { ...datos, fechaInicio: '2026-09-27' }, 'reparacion-directa')); s.cambiar('reparacion', 'EN_CURSO', 'reparacion-directa');
});
test('reparación necesita fechas, resultado, coste y materiales válidos al finalizar', () => {
  const s = base(); enCurso(s); s.error('DATO_INVALIDO', estadoCmd('reparacion', 'FINALIZADA'));
  s.modificar('reparacion', { resultado: 'Se sustituye bomba', fechaFin: '2026-09-27', costeCentimos: 12500, materiales: [{ descripcion: 'Bomba', cantidad: 1 }] });
  s.cambiar('reparacion', 'FINALIZADA'); const reparacion = s.estado.entidades.find((e) => e.tipo === 'reparacion');
  assert.equal(reparacion.costeCentimos, 12500); assert.equal(reparacion.materiales[0].descripcion, 'Bomba');
  s.error('REPARACION_TERMINADA', modificarCmd('reparacion', { resultado: 'Sustituido sin dejar rastro' }));
});
test('cero céntimos es un coste explícito, no una ausencia', () => { const s = base(); finalizar(s); assert.equal(s.estado.entidades.find((e) => e.tipo === 'reparacion').costeCentimos, 0); });
test('no cancela autorización usada ni cambia ejecutor durante reparación', () => {
  const s = base(); enCurso(s); s.error('PRESUPUESTO_UTILIZADO', estadoCmd('presupuesto', 'CANCELADO'));
  s.error('RELACION_INMUTABLE', modificarCmd('reparacion', { proveedorId: 'otro' }));
});
test('proveedor inactivo no inicia, pero no impide registrar resultado de trabajo ya iniciado', () => {
  const s = base(); s.cambiar('presupuesto', 'APROBADO'); s.modificar('reparacion', { fechaInicio: '2026-09-27' });
  s.modificar('proveedor', { activo: false }); s.error('PROVEEDOR_INACTIVO', estadoCmd('reparacion', 'EN_CURSO'));
  s.modificar('proveedor', { activo: true }); s.cambiar('reparacion', 'EN_CURSO'); s.modificar('proveedor', { activo: false });
  s.modificar('reparacion', { fechaFin: '2026-09-27', resultado: 'Terminada', costeCentimos: 0 }); s.cambiar('reparacion', 'FINALIZADA');
});
test('asocia factura recibida sin actuación; una reasociación conserva el antes', () => {
  const s = base(); const r = s.ok({ accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-demo', vinculo: { incidenciaId: 'incidencia-demo', averiaId: 'averia-demo', reparacionId: 'reparacion-demo' }, presupuestoId: 'presupuesto-demo' });
  assert.equal(r.evento.antes.vinculo, null); assert.equal(r.evento.despues.vinculo.reparacionId, 'reparacion-demo');
  s.crear('reparacion', {}, 'reparacion-2');
  const corregido = s.ok({ accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-demo', vinculo: { incidenciaId: 'incidencia-demo', averiaId: 'averia-demo', reparacionId: 'reparacion-2' } });
  assert.equal(corregido.evento.antes.vinculo.reparacionId, 'reparacion-demo'); assert.equal(corregido.evento.despues.vinculo.reparacionId, 'reparacion-2');
});
test('factura inmutable: ni importe editado ni asociación de una anulada', () => {
  const s = base(); s.error('FACTURA_INMUTABLE', modificarCmd('factura', { importeCentimos: 1 })); s.cambiar('factura', 'ANULADA');
  s.error('FACTURA_INMUTABLE', { accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-demo', vinculo: { incidenciaId: 'incidencia-demo' } });
});
test('factura y reparación deben pertenecer al mismo proveedor', () => {
  const s = base(); s.crear('proveedor', { referenciaExterna: 'proveedor-2' }, 'proveedor-2');
  s.crear('factura', { proveedorId: 'proveedor-2', referencia: 'F-2' }, 'factura-2');
  s.error('RELACION_INCOHERENTE', { accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-2', vinculo: { incidenciaId: 'incidencia-demo', reparacionId: 'reparacion-demo' } });
});
for (const tipo of ['presupuesto', 'factura', 'equipo', 'proveedor', 'documento']) test(`detecta duplicado natural explícito: ${tipo}`, () => {
  const s = base(); s.error('DUPLICADO', crearCmd(tipo, DATOS_FICTICIOS[tipo], `${tipo}-duplicado`));
});
for (const categoria of ['FOTO', 'PRESUPUESTO', 'FACTURA', 'GARANTIA', 'PARTE', 'COMUNICACION', 'OTRO']) test(`documentación ${categoria} conserva descriptor existente y vinculación auditada`, () => {
  const s = base(); s.crear('documento', { categoria, archivo: { ...DATOS_FICTICIOS.documento.archivo, id: `archivo-${categoria}` } }, `doc-${categoria}`);
  const cmd = { accion: 'VINCULAR_DOCUMENTO', tipo: 'garantia', id: 'garantia-demo', documentoId: `doc-${categoria}` };
  const r = s.ok(cmd); assert.deepEqual(r.evento.antes.documentoIds, []); assert.deepEqual(r.evento.despues.documentoIds, [`doc-${categoria}`]);
  s.error('DUPLICADO', cmd);
});
test('documentos sin binarios ni URLs de acceso; metadatos originales no se reescriben', () => {
  const s = base(); s.error('CAMPO_NO_ADMITIDO', crearCmd('documento', { ...DATOS_FICTICIOS.documento, archivo: { ...DATOS_FICTICIOS.documento.archivo, base64Data: 'no' } }, 'doc-2'));
  s.error('COMANDO_INVALIDO', modificarCmd('documento', { descripcion: 'Cambio' }));
});
test('recorrido completo determinista conserva todas las etapas tras el cierre', () => {
  const a = ejecutarRecorridoFicticio(); const b = ejecutarRecorridoFicticio(); assert.deepEqual(a, b);
  assert.equal(a.estado.revision, 29); assert.equal(a.expediente.principal.estado, 'CERRADA');
  assert.equal(a.centro.incidenciasAbiertas.length, 0); assert.equal(a.centro.facturasSinAsociar.length, 0);
  assert.ok(a.expediente.historial.some((h) => h.comando.clase === 'DIAGNOSTICO'));
  for (const tipo of ['incidencia', 'averia', 'presupuesto', 'reparacion', 'factura', 'documento']) assert.ok(a.expediente.historial.some((h) => h.referencia.tipo === tipo));
});
test('una incidencia cerrada exige reapertura antes de avería nueva o reabierta', () => {
  const s = sesion(CONTEXTO_FICTICIO, ejecutarRecorridoFicticio().estado);
  s.error('INCIDENCIA_TERMINADA', crearCmd('averia', DATOS_FICTICIOS.averia, 'averia-2'));
  s.error('INCIDENCIA_TERMINADA', estadoCmd('averia', 'EN_DIAGNOSTICO'));
  s.cambiar('incidencia', 'EN_REVISION'); s.cambiar('averia', 'EN_DIAGNOSTICO'); assert.equal(s.estado.historial.length, 31);
});
test('idempotencia: mismo comando reordenado no duplica eventos incluso tras otra operación', () => {
  const s = base(); const cmd = s.comando(estadoCmd('incidencia', 'EN_REVISION')); s.ok(estadoCmd('incidencia', 'EN_REVISION'));
  s.ok({ accion: 'ANOTAR', tipo: 'incidencia', id: 'incidencia-demo', clase: 'NOTA', texto: 'Posterior' });
  const r = ejecutarOperacion(s.estado, s.ctx, Object.fromEntries(Object.entries(cmd).reverse()));
  assert.equal(r.ok, true); assert.equal(r.repetida, true); assert.equal(r.estado, s.estado); assert.equal(r.estado.revision, 11); assert.equal(prepararCambioPersistencia(r), null);
  const conflicto = ejecutarOperacion(s.estado, s.ctx, { ...cmd, motivo: 'Otro contenido' }); assert.equal(conflicto.error.codigo, 'CONFLICTO_IDEMPOTENCIA');
});
test('CAS rechaza un snapshot obsoleto sin ningún cambio parcial', () => {
  const s = base(); s.error('CONFLICTO_REVISION', estadoCmd('incidencia', 'EN_REVISION'), { revisionEsperada: 8 });
  assert.equal(s.estado.entidades.find((e) => e.tipo === 'incidencia').estado, 'ABIERTA');
});
test('no usa reloj implícito: hecho histórico permitido, registro temporal hacia atrás no', () => {
  const s = base(); s.modificar('incidencia', { fecha: '2000-01-01' });
  s.error('ORDEN_TEMPORAL', estadoCmd('incidencia', 'EN_REVISION'), { fecha: '2020-01-01T00:00:00.000Z' });
});
test('ningún alias mutable del resultado altera input, eventos previos o evidencia devuelta', () => {
  const input = congelar(crearEstadoOperaciones()); const ctx = congelar(structuredClone(CONTEXTO_FICTICIO));
  const cmd = congelar(sesion().comando(crearCmd('incidencia', datosIncidenciaSinEquipo)));
  const r = ejecutarOperacion(input, ctx, cmd); assert.equal(r.ok, true);
  r.estado.entidades[0].descripcion = 'Cambio externo'; assert.equal(r.estado.historial[0].despues.descripcion, datosIncidenciaSinEquipo.descripcion);
  r.evento.despues.descripcion = 'Otro cambio'; assert.equal(r.estado.historial[0].despues.descripcion, datosIncidenciaSinEquipo.descripcion);
  assert.equal(input.revision, 0); assert.equal(cmd.datos.descripcion, datosIncidenciaSinEquipo.descripcion);
});
test('prepara únicamente entidad/evento/versiones; no aplica persistencia', () => {
  const s = base(); const r = s.cambiar('incidencia', 'EN_REVISION'); const lote = prepararCambioPersistencia(r);
  assert.equal(lote.revisionSnapshotEsperada, 9); assert.equal(lote.versionEntidadEsperada, 1); assert.equal(lote.entidad.version, 2);
  assert.deepEqual(lote.ambito, s.ctx.ambito); assert.equal(prepararCambioPersistencia(s.error('TRANSICION_INVALIDA', estadoCmd('incidencia', 'CERRADA'))), null);
  lote.evento.motivo = 'Mutado fuera'; assert.notEqual(r.evento.motivo, lote.evento.motivo);
});
