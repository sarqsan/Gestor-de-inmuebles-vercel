import test from 'node:test';
import assert from 'node:assert/strict';
import { DATOS_FICTICIOS, CONTEXTO_FICTICIO } from '../demo/fixtures.ts';
import { base, sesion, crearCmd, modificarCmd, estadoCmd, datosIncidenciaSinEquipo } from './support.mjs';
const casos = [
  ['incidencia', { prioridad: 'IMPUESTA' }, 'DATO_INVALIDO'],
  ['incidencia', { alcance: 'OTRO' }, 'DATO_INVALIDO'],
  ['incidencia', { descripcion: '  ' }, 'DATO_INVALIDO'],
  ['incidencia', { fecha: '2026-02-29' }, 'FECHA_INVALIDA'],
  ['incidencia', { fecha: '2026-04-31' }, 'FECHA_INVALIDA'],
  ['averia', { sintomas: [] }, 'DATO_INVALIDO'],
  ['averia', { sintomas: [''] }, 'DATO_INVALIDO'],
  ['proveedor', { contacto: { cuentaBancaria: 'no' } }, 'CAMPO_NO_ADMITIDO'],
  ['proveedor', { servicios: [] }, 'DATO_INVALIDO'],
  ['proveedor', { activo: 'sí' }, 'DATO_INVALIDO'],
  ['equipo', { fechaAdquisicion: 'ayer' }, 'FECHA_INVALIDA'],
  ['equipo', { tipoEquipo: '' }, 'DATO_INVALIDO'],
  ['garantia', { inicio: '2027-01-01', vencimiento: '2026-01-01' }, 'FECHA_INVALIDA'],
  ['garantia', { cobertura: 'AUTOMATICA' }, 'CAMPO_NO_ADMITIDO'],
  ['presupuesto', { importeCentimos: 1 }, 'IMPORTE_INVALIDO'],
  ['presupuesto', { importeCentimos: -1 }, 'IMPORTE_INVALIDO'],
  ['presupuesto', { importeCentimos: 1.5 }, 'IMPORTE_INVALIDO'],
  ['presupuesto', { importeCentimos: Number.MAX_SAFE_INTEGER + 1 }, 'IMPORTE_INVALIDO'],
  ['presupuesto', { conceptos: [] }, 'IMPORTE_INVALIDO'],
  ['presupuesto', { vinculo: null }, 'RELACION_INCOHERENTE'],
  ['factura', { moneda: 'USD' }, 'MONEDA_NO_SOPORTADA'],
  ['factura', { conceptos: [{ descripcion: '', importeCentimos: 12000 }] }, 'DATO_INVALIDO'],
  ['factura', { conceptos: [{ descripcion: 'Prueba', importeCentimos: -1 }] }, 'IMPORTE_INVALIDO'],
  ['reparacion', { materiales: [{ descripcion: 'Bomba', cantidad: -1 }] }, 'DATO_INVALIDO'],
  ['reparacion', { fechaInicio: '2026-09-28', fechaFin: '2026-09-27' }, 'FECHA_INVALIDA'],
  ['reparacion', { costeCentimos: -1 }, 'IMPORTE_INVALIDO'],
  ['documento', { categoria: 'CUALQUIERA' }, 'DATO_INVALIDO'],
  ['documento', { archivo: { ...DATOS_FICTICIOS.documento.archivo, tamañoBytes: -1 } }, 'DATO_INVALIDO'],
];
for (const [tipo, cambios, codigo] of casos) test(`validación atómica: ${tipo} / ${JSON.stringify(cambios)}`, () => {
  const s = base(); s.error(codigo, crearCmd(tipo, { ...DATOS_FICTICIOS[tipo], ...cambios }, `${tipo}-invalid`)); assert.equal(s.estado.revision, 9);
});
for (const campos of [{ ambito: CONTEXTO_FICTICIO.ambito }, { propietarioId: 'otro' }, { id: 'otro' }, { version: 100 }, { documentoIds: ['oculto'] }, { historial: [] }]) test(`no acepta inyección de metadatos: ${JSON.stringify(campos)}`, () => {
  base().error('CAMPO_NO_ADMITIDO', modificarCmd('incidencia', campos));
});
for (const meta of [{ actor: '' }, { motivo: ' ' }, { operacionId: '' }]) test(`metadatos explícitos no vacíos: ${JSON.stringify(meta)}`, () => {
  base().error('DATO_INVALIDO', estadoCmd('incidencia', 'EN_REVISION'), meta);
});
for (const fecha of ['2026-09-27', '2026-09-27T12:00:00+00:00', '2026-02-30T00:00:00.000Z']) test(`instante UTC canónico: ${fecha}`, () => {
  base().error('FECHA_INVALIDA', estadoCmd('incidencia', 'EN_REVISION'), { fecha });
});
test('no deja pasar patch vacío o valores sin cambios', () => {
  const s = base(); s.error('SIN_CAMBIOS', modificarCmd('incidencia', {})); s.error('SIN_CAMBIOS', modificarCmd('incidencia', { descripcion: DATOS_FICTICIOS.incidencia.descripcion }));
});
test('relación avería/reparación/presupuesto debe ser coherente dentro del mismo inmueble', () => {
  const s = base(); s.crear('incidencia', {}, 'incidencia-2');
  s.error('RELACION_INCOHERENTE', crearCmd('reparacion', { ...DATOS_FICTICIOS.reparacion, incidenciaId: 'incidencia-2' }, 'reparacion-2'));
  s.error('RELACION_INCOHERENTE', crearCmd('presupuesto', { ...DATOS_FICTICIOS.presupuesto, referencia: 'P-2', vinculo: { incidenciaId: 'incidencia-2', averiaId: 'averia-demo' } }, 'presupuesto-2'));
});
test('contrato de otro inmueble no entra aunque figure en el contexto del usuario', () => {
  const ctx = { ...CONTEXTO_FICTICIO, contratos: [...CONTEXTO_FICTICIO.contratos, { id: 'otro', inmuebleId: 'inm-demo-2', candidatoId: 'candidato-demo', estado: 'CANCELADO' }] };
  sesion(ctx).error('RELACION_ALQUILER_INVALIDA', crearCmd('incidencia', { ...datosIncidenciaSinEquipo, contratoId: 'otro' }));
});
for (const [tipo, campo] of [['reparacion', 'averiaId'], ['reparacion', 'presupuestoId'], ['factura', 'presupuestoId']]) test(`no trata referencia vacía como ausencia: ${tipo}.${campo}`, () => {
  base().error('DATO_INVALIDO', crearCmd(tipo, { ...DATOS_FICTICIOS[tipo], [campo]: '' }, `${tipo}-invalida`));
});
test('presupuesto ligado directamente a reparación exige el mismo proveedor', () => {
  const s = base(); s.crear('proveedor', { referenciaExterna: 'externo-2' }, 'proveedor-2');
  s.error('RELACION_INCOHERENTE', crearCmd('presupuesto', { ...DATOS_FICTICIOS.presupuesto, referencia: 'P-2', proveedorId: 'proveedor-2', vinculo: { incidenciaId: 'incidencia-demo', reparacionId: 'reparacion-demo' } }, 'presupuesto-2'));
});
for (const [tipo, campo, codigo] of [
  ['incidencia', 'fecha', 'FECHA_INVALIDA'], ['incidencia', 'descripcion', 'DATO_INVALIDO'],
  ['averia', 'fecha', 'FECHA_INVALIDA'], ['averia', 'descripcion', 'DATO_INVALIDO'],
  ['reparacion', 'descripcion', 'DATO_INVALIDO'], ['reparacion', 'proveedorId', 'DATO_INVALIDO'],
  ['garantia', 'equipoId', 'DATO_INVALIDO'], ['presupuesto', 'proveedorId', 'DATO_INVALIDO'],
  ['factura', 'proveedorId', 'DATO_INVALIDO'], ['documento', 'descripcion', 'DATO_INVALIDO'],
]) test(`los campos obligatorios no pueden omitirse en runtime: ${tipo}.${campo}`, () => {
  const datos = { ...DATOS_FICTICIOS[tipo] }; delete datos[campo];
  base().error(codigo, crearCmd(tipo, datos, `${tipo}-incompleto`));
});
test('resultado proporcionado debe ser texto incluso antes de finalizar reparación', () => {
  base().error('DATO_INVALIDO', modificarCmd('reparacion', { resultado: 42 }));
});
test('asociar factura no ignora una referencia de presupuesto vacía', () => {
  base().error('DATO_INVALIDO', { accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-demo', vinculo: { incidenciaId: 'incidencia-demo' }, presupuestoId: '' });
});
