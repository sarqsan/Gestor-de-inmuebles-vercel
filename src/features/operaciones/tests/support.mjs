import assert from 'node:assert/strict';
import { crearEstadoOperaciones, ejecutarOperacion } from '../index.ts';
import { CONTEXTO_FICTICIO, DATOS_FICTICIOS } from '../demo/fixtures.ts';
export function congelar(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(congelar); Object.freeze(value); }
  return value;
}
export function sesion(contexto = CONTEXTO_FICTICIO, inicial = crearEstadoOperaciones()) {
  let estado = structuredClone(inicial);
  const ctx = congelar(structuredClone(contexto));
  const comando = (instruccion, meta = {}) => ({ operacionId: `op-${estado.revision + 1}`, fecha: '2026-09-27T12:00:00.000Z',
    actor: 'actor-demo', revisionEsperada: estado.revision, motivo: 'Operación ficticia explícita', ...instruccion, ...meta });
  const run = (instruccion, meta = {}) => {
    const antes = congelar(estado);
    const cmd = congelar(comando(instruccion, meta));
    const resultado = ejecutarOperacion(antes, ctx, cmd);
    if (resultado.ok) estado = resultado.estado;
    else assert.equal(resultado.estado, antes, 'El rechazo debe conservar el snapshot exacto');
    return resultado;
  };
  const ok = (instruccion, meta) => { const r = run(instruccion, meta); assert.equal(r.ok, true, JSON.stringify(r.error)); return r; };
  const error = (codigo, instruccion, meta) => { const r = run(instruccion, meta); assert.equal(r.ok, false); assert.equal(r.error.codigo, codigo, JSON.stringify(r.error)); return r; };
  const crear = (tipo, cambios = {}, id = `${tipo}-demo`) => ok({ accion: 'CREAR', tipo, id, datos: { ...DATOS_FICTICIOS[tipo], ...cambios } });
  const cambiar = (tipo, nuevoEstado, id = `${tipo}-demo`) => ok({ accion: 'CAMBIAR_ESTADO', tipo, id, estado: nuevoEstado });
  const modificar = (tipo, cambios, id = `${tipo}-demo`) => ok({ accion: 'MODIFICAR', tipo, id, cambios });
  return { get estado() { return estado; }, ctx, comando, run, ok, error, crear, cambiar, modificar };
}
export function base(ctx = CONTEXTO_FICTICIO) {
  const s = sesion(ctx);
  for (const tipo of ['proveedor', 'equipo', 'garantia', 'incidencia', 'averia', 'presupuesto', 'reparacion', 'factura', 'documento']) s.crear(tipo);
  return s;
}
export function enCurso(s) {
  s.cambiar('presupuesto', 'APROBADO'); s.modificar('reparacion', { fechaInicio: '2026-09-27' }); s.cambiar('reparacion', 'EN_CURSO');
}
export function finalizar(s) {
  enCurso(s); s.modificar('reparacion', { fechaFin: '2026-09-27', costeCentimos: 0, resultado: 'Intervención sin coste', materiales: [{ descripcion: 'Junta', cantidad: 1 }] });
  s.cambiar('reparacion', 'FINALIZADA');
}
export const datosIncidenciaSinEquipo = { fecha: '2020-02-29', descripcion: 'Mantenimiento ficticio de zonas comunes', prioridad: 'MEDIA', origen: 'PROPIETARIO', alcance: 'ZONAS_COMUNES' };
export const modificarCmd = (tipo, cambios, id = `${tipo}-demo`) => ({ accion: 'MODIFICAR', tipo, id, cambios });
export const estadoCmd = (tipo, estado, id = `${tipo}-demo`) => ({ accion: 'CAMBIAR_ESTADO', tipo, id, estado });
export const crearCmd = (tipo, datos = DATOS_FICTICIOS[tipo], id = `${tipo}-demo`) => ({ accion: 'CREAR', tipo, id, datos });
