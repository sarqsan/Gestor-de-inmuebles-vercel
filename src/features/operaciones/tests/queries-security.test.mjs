import assert from 'node:assert/strict';
import test from 'node:test';
import { consultarCentroOperativo, consultarExpediente, consultarProveedor, evaluarVigenciaGarantia, ejecutarOperacion } from '../index.ts';
import { CONTEXTO_FICTICIO, DATOS_FICTICIOS } from '../demo/fixtures.ts';
import { base, sesion, datosIncidenciaSinEquipo, crearCmd, estadoCmd } from './support.mjs';
const opciones = { hoy: '2026-09-26', diasAvisoGarantia: 30 };
const otroInmueble = { ...CONTEXTO_FICTICIO, ambito: { propietarioId: 'prop-demo-a', inmuebleId: 'inm-demo-2' } };
const otroPropietario = { ...CONTEXTO_FICTICIO, ambito: { propietarioId: 'prop-demo-b', inmuebleId: 'inm-demo-3' } };

test('centro operativo devuelve las siete consultas pedidas y el historial íntegro', () => {
  const s = base(); const centro = consultarCentroOperativo(s.estado, s.ctx, { ...opciones, limiteHistorial: 3 });
  for (const campo of ['incidenciasAbiertas', 'averiasPendientes', 'reparacionesActivas', 'presupuestosPendientes', 'facturasSinAsociar', 'garantiasPorVencer']) assert.equal(centro[campo].length, 1, campo);
  assert.equal(centro.ultimasActuaciones.length, 3); assert.deepEqual(centro.ultimasActuaciones.map((h) => h.revision), [9, 8, 7]);
  assert.equal(centro.historial.length, 9); assert.equal(centro.garantiasPorVencer[0].diasRestantes, 9);
});
test('garantías por fecha nunca afirman cobertura; original documental sigue siendo fuente', () => {
  const s = base(); const garantia = s.estado.entidades.find((e) => e.tipo === 'garantia');
  for (const [hoy, vigencia] of [['2024-01-01', 'NO_INICIADA'], ['2026-10-05', 'VIGENTE_POR_FECHAS'], ['2026-10-06', 'VENCIDA']]) {
    const resultado = evaluarVigenciaGarantia(garantia, hoy); assert.equal(resultado.vigencia, vigencia); assert.equal(resultado.cobertura, 'NO_EVALUADA'); assert.equal(resultado.fuenteCobertura, 'DOCUMENTACION_ORIGINAL');
  }
  s.ok({ accion: 'VINCULAR_DOCUMENTO', tipo: 'garantia', id: 'garantia-demo', documentoId: 'documento-demo' });
  const centro = consultarCentroOperativo(s.estado, s.ctx, opciones); assert.equal(centro.garantiasPorVencer[0].tieneDocumentacion, true); assert.equal(centro.garantiasPorVencer[0].cobertura, 'NO_EVALUADA');
});
test('garantía sin fechas se registra incompleta, no se inventa vencimiento ni cobertura', () => {
  const s = base(); s.ok(crearCmd('garantia', { equipoId: 'equipo-demo', referenciaCompra: 'SIN-FECHAS' }, 'garantia-2'));
  const g = s.estado.entidades.find((e) => e.id === 'garantia-2'); assert.equal(evaluarVigenciaGarantia(g, opciones.hoy).vigencia, 'FECHAS_INCOMPLETAS');
  assert.equal(consultarCentroOperativo(s.estado, s.ctx, opciones).garantiasPorVencer.length, 1);
});
test('avisos de garantía incluyen ambos límites y excluyen vencidas', () => {
  const s = base(); assert.equal(consultarCentroOperativo(s.estado, s.ctx, { hoy: '2026-10-05', diasAvisoGarantia: 0 }).garantiasPorVencer.length, 1);
  assert.equal(consultarCentroOperativo(s.estado, s.ctx, { hoy: '2026-10-06', diasAvisoGarantia: 30 }).garantiasPorVencer.length, 0);
  assert.equal(consultarCentroOperativo(s.estado, s.ctx, { hoy: '2026-09-26', diasAvisoGarantia: 8 }).garantiasPorVencer.length, 0);
});
test('fechas de garantía corregidas dejan el original completo en histórico', () => {
  const s = base(); const r = s.modificar('garantia', { vencimiento: '2027-01-02' });
  assert.equal(r.evento.antes.vencimiento, '2026-10-05'); assert.equal(r.evento.despues.vencimiento, '2027-01-02');
  assert.equal(r.evento.despues.condiciones, DATOS_FICTICIOS.garantia.condiciones);
});
test('equipos reúnen averías, reparaciones, garantía y facturas con vínculos de actuación', () => {
  const s = base(); s.ok({ accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-demo', vinculo: { incidenciaId: 'incidencia-demo', reparacionId: 'reparacion-demo' } });
  const e = consultarExpediente(s.estado, s.ctx, { tipo: 'equipo', id: 'equipo-demo' });
  for (const tipo of ['incidencia', 'averia', 'reparacion', 'garantia', 'presupuesto', 'factura']) assert.ok(e.relacionadas.some((x) => x.tipo === tipo), tipo);
});
test('anular factura o decidir presupuesto los retira de las consultas pendientes, no del histórico', () => {
  const s = base(); s.cambiar('factura', 'ANULADA'); s.cambiar('presupuesto', 'RECHAZADO');
  const centro = consultarCentroOperativo(s.estado, s.ctx, opciones); assert.equal(centro.facturasSinAsociar.length, 0); assert.equal(centro.presupuestosPendientes.length, 0);
  assert.equal(centro.historial.length, 11); assert.equal(s.estado.entidades.length, 9);
});
for (const [nombre, ctx] of [['otro inmueble', otroInmueble], ['otro propietario', otroPropietario]]) {
  test(`aislamiento de lectura, escritura e histórico: ${nombre}`, () => {
    const s = base(); const centro = consultarCentroOperativo(s.estado, ctx, opciones);
    for (const campo of ['incidenciasAbiertas', 'averiasPendientes', 'reparacionesActivas', 'garantiasPorVencer', 'presupuestosPendientes', 'facturasSinAsociar', 'historial']) assert.deepEqual(centro[campo], []);
    assert.throws(() => consultarExpediente(s.estado, ctx, { tipo: 'incidencia', id: 'incidencia-demo' }), (e) => e.codigo === 'AISLAMIENTO');
    const r = ejecutarOperacion(s.estado, ctx, s.comando(estadoCmd('incidencia', 'EN_REVISION'))); assert.equal(r.error.codigo, 'AISLAMIENTO'); assert.equal(r.estado, s.estado);
  });
}
test('el mismo inmueble con otro propietario no hereda acceso a los datos del anterior', () => {
  const s = base(); const ambito = { inmuebleId: 'inm-demo-1', propietarioId: 'prop-demo-b' };
  const ctx = { ...CONTEXTO_FICTICIO, ambito, ambitosPermitidos: [ambito] };
  assert.deepEqual(consultarCentroOperativo(s.estado, ctx, opciones).historial, []);
  assert.throws(() => consultarExpediente(s.estado, ctx, { tipo: 'incidencia', id: 'incidencia-demo' }), (e) => e.codigo === 'AISLAMIENTO');
});
test('contexto sin permiso no obtiene acceso por isStaff, identidad implícita ni propietario único', () => {
  const s = base(); const ctx = { ...CONTEXTO_FICTICIO, ambitosPermitidos: [], isStaff: true };
  const r = ejecutarOperacion(s.estado, ctx, s.comando(estadoCmd('incidencia', 'EN_REVISION'))); assert.equal(r.error.codigo, 'AMBITO_NO_PERMITIDO');
  assert.throws(() => consultarCentroOperativo(s.estado, ctx, opciones), (e) => e.codigo === 'AMBITO_NO_PERMITIDO');
});
test('el ámbito requiere propietario e inmueble explícitos y referencias no ambiguas', () => {
  const s = base(); const ctx = { ...CONTEXTO_FICTICIO, propietarios: [...CONTEXTO_FICTICIO.propietarios, CONTEXTO_FICTICIO.propietarios[0]] };
  assert.equal(ejecutarOperacion(s.estado, ctx, s.comando(estadoCmd('incidencia', 'EN_REVISION'))).error.codigo, 'REFERENCIA_INVALIDA');
  assert.equal(ejecutarOperacion(s.estado, { ...CONTEXTO_FICTICIO, ambito: { inmuebleId: 'inm-demo-1', propietarioId: '' } }, s.comando(estadoCmd('incidencia', 'EN_REVISION'))).error.codigo, 'DATO_INVALIDO');
});
for (const tipo of ['averia', 'garantia', 'presupuesto']) test(`referencias a otro inmueble rechazadas al crear ${tipo}`, () => {
  const s = sesion(otroInmueble, base().estado); s.error('AISLAMIENTO', crearCmd(tipo, DATOS_FICTICIOS[tipo], `${tipo}-otro`));
});
test('documentación de otro inmueble no puede vincularse a una incidencia local', () => {
  const s = sesion(otroInmueble, base().estado); s.ok(crearCmd('incidencia', datosIncidenciaSinEquipo, 'incidencia-otro'));
  s.error('AISLAMIENTO', { accion: 'VINCULAR_DOCUMENTO', tipo: 'incidencia', id: 'incidencia-otro', documentoId: 'documento-demo' });
});
test('factura recibida en otro inmueble no se asocia a una reparación ajena', () => {
  const s = sesion(otroInmueble, base().estado); s.crear('factura', { referencia: 'F-OTRO' }, 'factura-otra');
  s.error('AISLAMIENTO', { accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-otra', vinculo: { incidenciaId: 'incidencia-demo', reparacionId: 'reparacion-demo' } });
});
test('no duplica factura entre inmuebles del mismo propietario/proveedor', () => {
  sesion(otroInmueble, base().estado).error('DUPLICADO', crearCmd('factura', DATOS_FICTICIOS.factura, 'factura-otra'));
});
test('proveedor compartido solo en su propietario; historial multiinmueble requiere ámbitos explícitos', () => {
  const s = sesion(otroInmueble, base().estado); s.ok(crearCmd('incidencia', { ...datosIncidenciaSinEquipo, proveedorId: 'proveedor-demo' }, 'incidencia-otro'));
  const completo = consultarProveedor(s.estado, CONTEXTO_FICTICIO, 'proveedor-demo'); assert.deepEqual(completo.inmueblesRelacionados, ['inm-demo-1', 'inm-demo-2']);
  const limitado = consultarProveedor(s.estado, { ...CONTEXTO_FICTICIO, ambitosPermitidos: [CONTEXTO_FICTICIO.ambito] }, 'proveedor-demo');
  assert.deepEqual(limitado.inmueblesRelacionados, ['inm-demo-1']); assert.ok(limitado.historial.every((h) => h.ambito.inmuebleId === 'inm-demo-1'));
  assert.throws(() => consultarProveedor(s.estado, otroPropietario, 'proveedor-demo'), (e) => e.codigo === 'AISLAMIENTO');
  sesion(otroPropietario, s.estado).error('AISLAMIENTO', crearCmd('factura', DATOS_FICTICIOS.factura, 'factura-ajena'));
});
test('idempotencia no permite recuperar un evento de otro ámbito', () => {
  const s = base(); const previo = s.estado.historial[0].comando;
  const r = ejecutarOperacion(s.estado, otroInmueble, previo); assert.equal(r.error.codigo, 'AISLAMIENTO');
});
test('query no entrega alias mutables al estado', () => {
  const s = base(); const centro = consultarCentroOperativo(s.estado, s.ctx, opciones); centro.incidenciasAbiertas[0].descripcion = 'Mutación';
  assert.equal(s.estado.entidades.find((e) => e.tipo === 'incidencia').descripcion, DATOS_FICTICIOS.incidencia.descripcion);
});
for (const extra of [{ hoy: '2026-02-29' }, { diasAvisoGarantia: -1 }, { limiteHistorial: -1 }, { diasAvisoGarantia: 1.5 }]) test(`opciones de query inválidas: ${JSON.stringify(extra)}`, () => {
  const s = base(); assert.throws(() => consultarCentroOperativo(s.estado, s.ctx, { ...opciones, ...extra }));
});
test('equipo conserva factura y documentos históricos después de reasociarla a otro equipo', () => {
  const s = base();
  s.ok({ accion: 'VINCULAR_DOCUMENTO', tipo: 'factura', id: 'factura-demo', documentoId: 'documento-demo' });
  s.ok({ accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-demo', vinculo: { incidenciaId: 'incidencia-demo', reparacionId: 'reparacion-demo' } });
  s.crear('equipo', { numeroSerie: 'OTRA-SERIE' }, 'equipo-2');
  s.ok(crearCmd('incidencia', { ...datosIncidenciaSinEquipo, equipoId: 'equipo-2' }, 'incidencia-2'));
  s.ok({ accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-demo', vinculo: { incidenciaId: 'incidencia-2' } });
  const expediente = consultarExpediente(s.estado, s.ctx, { tipo: 'equipo', id: 'equipo-demo' });
  assert.ok(!expediente.relacionadas.some((e) => e.tipo === 'factura'), 'La relación ACTUAL ya es de otro equipo');
  assert.ok(expediente.historial.some((h) => h.antes?.tipo === 'factura' && h.antes.vinculo?.reparacionId === 'reparacion-demo'));
  assert.deepEqual(expediente.documentos.map((e) => e.id), ['documento-demo']);
});
test('registrar un proveedor en el catálogo no inventa una actuación ni un inmueble relacionado', () => {
  const s = sesion(); s.crear('proveedor');
  const p = consultarProveedor(s.estado, s.ctx, 'proveedor-demo'); assert.deepEqual(p.inmueblesRelacionados, []); assert.deepEqual(p.actuaciones, []); assert.equal(p.historial.length, 1);
});
test('equipo reúne la incidencia padre aun si se identificó el equipo al registrar la avería', () => {
  const s = base(); s.ok(crearCmd('incidencia', datosIncidenciaSinEquipo, 'incidencia-sin-equipo'));
  s.crear('averia', { incidenciaId: 'incidencia-sin-equipo' }, 'averia-tardia');
  const e = consultarExpediente(s.estado, s.ctx, { tipo: 'equipo', id: 'equipo-demo' });
  assert.ok(e.relacionadas.some((r) => r.id === 'incidencia-sin-equipo'));
  assert.ok(e.historial.some((h) => h.referencia.id === 'incidencia-sin-equipo' && h.comando.accion === 'CREAR'));
});
test('una consulta de equipo no atribuye presupuesto específico de otra avería del mismo aviso', () => {
  const s = base(); s.ok(crearCmd('incidencia', datosIncidenciaSinEquipo, 'incidencia-multi'));
  s.crear('averia', { incidenciaId: 'incidencia-multi' }, 'averia-equipo-1');
  s.crear('equipo', { numeroSerie: 'SERIE-OTRA' }, 'equipo-2');
  const { garantiaId, ...datos } = DATOS_FICTICIOS.averia;
  s.ok(crearCmd('averia', { ...datos, incidenciaId: 'incidencia-multi', equipoId: 'equipo-2' }, 'averia-equipo-2'));
  s.crear('presupuesto', { referencia: 'P-EQUIPO-2', vinculo: { incidenciaId: 'incidencia-multi', averiaId: 'averia-equipo-2' } }, 'presupuesto-equipo-2');
  const e = consultarExpediente(s.estado, s.ctx, { tipo: 'equipo', id: 'equipo-demo' });
  assert.ok(!e.relacionadas.some((r) => r.id === 'presupuesto-equipo-2'));
});
