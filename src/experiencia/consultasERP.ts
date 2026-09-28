import type { CobroPeriodo, Gasto, Incidencia } from '../types';
import { calcularGastosEjercicio } from '../utils/fiscalEngine';
import { calcularResumenCobros } from '../utils/cobrosEngine';
import { incidenciasNoCerradas } from '../utils/operacionesEngine';
import { capacidadesDisponibles } from './intenciones';
import type { ExperienceContext, ResultadoConsultaERP } from './tipos';

/** Snapshot del host: cada lista debe proceder de las suscripciones/scoped arrays canónicos. */
export interface FuentesConsultaERP {
  gastos: readonly Gasto[];
  cobros: readonly CobroPeriodo[];
  incidencias: readonly Incidencia[];
  inmuebleIdsAutorizados: readonly string[];
}

export interface OpcionesConsultaERP {
  ejercicioActual?: number;
}

function sinDatos(capabilityId: string, titulo: string, motorOficial: string, ambito: ResultadoConsultaERP['ambito']): ResultadoConsultaERP {
  return { estado: 'SIN_DATOS', capabilityId, titulo, resumen: 'No hay registros disponibles en el ámbito autorizado para esta consulta.', motorOficial, hechos: [], ambito };
}

/**
 * Ejecuta únicamente capacidades tipadas y autorizadas sobre snapshots entregados por el host.
 * No lee Firestore, no acepta IDs en lenguaje natural y nunca devuelve registros completos al modelo.
 */
export function ejecutarConsultaERP(
  capabilityId: string,
  parametros: Record<string, unknown>,
  contexto: ExperienceContext,
  fuentes: FuentesConsultaERP,
  opciones: OpcionesConsultaERP = {},
): ResultadoConsultaERP {
  const cap = capacidadesDisponibles(contexto).find((c) => c.id === capabilityId);
  if (!cap?.consultaId) {
    return { estado: 'NO_DISPONIBLE', capabilityId, titulo: 'Consulta no disponible', resumen: 'La capacidad no existe o no está autorizada en el contexto actual.', motorOficial: 'RBAC', hechos: [], ambito: 'AMBITO_AUTORIZADO' };
  }

  let inmuebleId: string | undefined;
  if (contexto.entityId || contexto.entityType) {
    if (contexto.entityType !== 'inmueble' || !contexto.entityId || !fuentes.inmuebleIdsAutorizados.includes(contexto.entityId)) {
      return { estado: 'NO_DISPONIBLE', capabilityId, titulo: 'Contexto de inmueble no autorizado', resumen: 'No se puede verificar que el inmueble seleccionado pertenezca al ámbito autorizado.', motorOficial: 'RBAC + ámbito del host', hechos: [], ambito: 'INMUEBLE' };
    }
    inmuebleId = contexto.entityId;
  }
  const ambito: ResultadoConsultaERP['ambito'] = inmuebleId ? 'INMUEBLE' : 'AMBITO_AUTORIZADO';
  const ejercicioSolicitado = parametros.ejercicio;
  const ejercicio = typeof ejercicioSolicitado === 'number' && Number.isInteger(ejercicioSolicitado) && ejercicioSolicitado >= 2000 && ejercicioSolicitado <= 2100
    ? ejercicioSolicitado
    : opciones.ejercicioActual ?? new Date().getFullYear();

  if (cap.consultaId === 'GASTOS_EJERCICIO') {
    const scope = fuentes.gastos.filter((g) => !inmuebleId || g.inmuebleId === inmuebleId);
    const resumen = calcularGastosEjercicio([...scope], ejercicio);
    if (resumen.countTotal === 0) return sinDatos(capabilityId, `Gastos ${ejercicio}`, 'fiscalEngine.calcularGastosEjercicio', ambito);
    return {
      estado: 'OK', capabilityId, titulo: `Resumen de gastos · ${ejercicio}`,
      resumen: `El motor fiscal del ERP ha clasificado ${resumen.countTotal} gastos del ejercicio. La etiqueta de deducibilidad refleja el dato/regla vigente en la aplicación y no sustituye el criterio fiscal profesional.`,
      motorOficial: 'fiscalEngine.calcularGastosEjercicio', ambito,
      hechos: [
        { etiqueta: 'Gasto total según el motor', valor: resumen.total, formato: 'EUR' },
        { etiqueta: 'Clasificados como deducibles por el ERP', valor: resumen.totalDeducible, formato: 'EUR' },
        { etiqueta: 'Clasificados como no deducibles por el ERP', valor: resumen.totalNoDeducible, formato: 'EUR' },
        { etiqueta: 'Gastos con justificante', valor: resumen.gastosConJustificante, formato: 'NUMERO' },
        { etiqueta: 'Gastos sin justificante', valor: resumen.gastosSinJustificante, formato: 'NUMERO' },
      ],
    };
  }

  if (cap.consultaId === 'COBROS_EJERCICIO') {
    const scope = fuentes.cobros.filter((c) => c.anio === ejercicio && (!inmuebleId || c.inmuebleId === inmuebleId));
    if (scope.length === 0) return sinDatos(capabilityId, `Cobros ${ejercicio}`, 'cobrosEngine.calcularResumenCobros', ambito);
    const resumen = calcularResumenCobros([...scope]);
    return {
      estado: 'OK', capabilityId, titulo: `Estado de cobros · ${ejercicio}`,
      resumen: `Resumen calculado por el motor oficial de cobros sobre ${resumen.totalPeriodos} recibos accesibles.`,
      motorOficial: 'cobrosEngine.calcularResumenCobros', ambito,
      hechos: [
        { etiqueta: 'Recibos', valor: resumen.totalPeriodos, formato: 'NUMERO' },
        { etiqueta: 'Recibos pendientes', valor: resumen.countPendientes, formato: 'NUMERO' },
        { etiqueta: 'Recibos retrasados', valor: resumen.countRetrasados, formato: 'NUMERO' },
        { etiqueta: 'Recibos con incidencia', valor: resumen.countIncidencias, formato: 'NUMERO' },
        { etiqueta: 'Importe pendiente', valor: resumen.totalPendiente, formato: 'EUR' },
        { etiqueta: 'Importe retrasado', valor: resumen.totalRetrasado, formato: 'EUR' },
      ],
    };
  }

  if (cap.consultaId === 'INCIDENCIAS_ABIERTAS') {
    const scope = fuentes.incidencias.filter((i) => !inmuebleId || i.inmuebleId === inmuebleId);
    const abiertas = incidenciasNoCerradas([...scope]);
    return {
      estado: abiertas.length ? 'OK' : 'SIN_DATOS', capabilityId, titulo: 'Incidencias abiertas',
      resumen: abiertas.length
        ? `El motor de operaciones encuentra ${abiertas.length} incidencias no cerradas en el ámbito autorizado.`
        : 'El motor de operaciones no encuentra incidencias abiertas en el ámbito autorizado.',
      motorOficial: 'operacionesEngine.incidenciasNoCerradas', ambito,
      hechos: [{ etiqueta: 'Incidencias no cerradas', valor: abiertas.length, formato: 'NUMERO' }],
    };
  }

  return { estado: 'NO_DISPONIBLE', capabilityId, titulo: 'Consulta no implementada', resumen: 'Esta consulta no tiene un adaptador de motor conectado.', motorOficial: 'ninguno', hechos: [], ambito };
}
