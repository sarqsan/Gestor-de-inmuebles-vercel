// Ejemplo ejecutable en memoria: node --experimental-strip-types src/features/operaciones/demo/recorrido.mjs
import { crearEstadoOperaciones, ejecutarOperacion, consultarCentroOperativo, consultarExpediente } from '../index.ts';
import { CONTEXTO_FICTICIO, DATOS_FICTICIOS } from './fixtures.ts';
export function ejecutarRecorridoFicticio() {
  let estado = crearEstadoOperaciones();
  const aplicar = (instruccion) => {
    const resultado = ejecutarOperacion(estado, CONTEXTO_FICTICIO, { operacionId: `op-demo-${estado.revision + 1}`,
      fecha: '2026-09-27T12:00:00.000Z', actor: 'actor-ficticio', revisionEsperada: estado.revision,
      motivo: 'Recorrido ficticio explícito en memoria', ...instruccion });
    if (!resultado.ok) throw new Error(`${resultado.error.codigo}: ${resultado.error.mensaje}`);
    estado = resultado.estado;
  };
  const cambiar = (tipo, nuevoEstado) => aplicar({ accion: 'CAMBIAR_ESTADO', tipo, id: `${tipo}-demo`, estado: nuevoEstado });
  const modificar = (tipo, cambios) => aplicar({ accion: 'MODIFICAR', tipo, id: `${tipo}-demo`, cambios });
  for (const tipo of ['proveedor', 'equipo', 'garantia', 'incidencia', 'averia', 'presupuesto', 'reparacion', 'factura', 'documento']) {
    aplicar({ accion: 'CREAR', tipo, id: `${tipo}-demo`, datos: DATOS_FICTICIOS[tipo] });
  }
  aplicar({ accion: 'ANOTAR', tipo: 'averia', id: 'averia-demo', clase: 'DIAGNOSTICO', texto: 'Diagnóstico ficticio: bomba averiada, sin pronunciamiento sobre cobertura.' });
  cambiar('incidencia', 'EN_REVISION'); cambiar('incidencia', 'PRESUPUESTO');
  cambiar('averia', 'EN_DIAGNOSTICO'); cambiar('presupuesto', 'APROBADO'); cambiar('incidencia', 'AUTORIZADA');
  modificar('reparacion', { fechaInicio: '2026-09-27' });
  cambiar('reparacion', 'EN_CURSO'); cambiar('averia', 'EN_REPARACION'); cambiar('incidencia', 'EN_REPARACION');
  modificar('reparacion', { fechaFin: '2026-09-27', costeCentimos: 12000, materiales: [{ descripcion: 'Bomba ficticia', cantidad: 1 }], resultado: 'Prueba ficticia de vaciado satisfactoria' });
  cambiar('reparacion', 'FINALIZADA'); cambiar('averia', 'RESUELTA');
  aplicar({ accion: 'ASOCIAR_FACTURA', tipo: 'factura', id: 'factura-demo', vinculo: { incidenciaId: 'incidencia-demo', averiaId: 'averia-demo', reparacionId: 'reparacion-demo' }, presupuestoId: 'presupuesto-demo' });
  for (const tipo of ['incidencia', 'averia', 'reparacion', 'factura']) aplicar({ accion: 'VINCULAR_DOCUMENTO', tipo, id: `${tipo}-demo`, documentoId: 'documento-demo' });
  cambiar('incidencia', 'RESUELTA'); cambiar('incidencia', 'CERRADA');
  return { estado, centro: consultarCentroOperativo(estado, CONTEXTO_FICTICIO, { hoy: '2026-09-27', diasAvisoGarantia: 30 }),
    expediente: consultarExpediente(estado, CONTEXTO_FICTICIO, { tipo: 'incidencia', id: 'incidencia-demo' }) };
}
if (process.argv[1]?.endsWith('/recorrido.mjs')) {
  const { estado, centro, expediente } = ejecutarRecorridoFicticio();
  console.log(JSON.stringify({ ficticio: true, sinPersistencia: true, revision: estado.revision,
    estadoIncidencia: expediente.principal.estado, incidenciasAbiertas: centro.incidenciasAbiertas.length,
    facturasSinAsociar: centro.facturasSinAsociar.length, garantiasPorVencer: centro.garantiasPorVencer,
    cadenaHistorica: expediente.historial.map((h) => `${h.revision}: ${h.referencia.tipo} / ${h.comando.accion}`) }, null, 2));
}
