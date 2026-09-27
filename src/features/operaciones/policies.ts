import type { PoliticaEstados } from './contracts.ts';

function congelar<T extends object>(valor: T): T {
  for (const v of Object.values(valor)) if (v && typeof v === 'object') congelar(v);
  return Object.freeze(valor);
}

/** Flujo operativo inicial sustituible por configuración explícita, no por roles. */
export const POLITICA_ESTADOS: PoliticaEstados = congelar({
  incidencia: { inicial: 'ABIERTA', terminales: ['CERRADA', 'CANCELADA'], transiciones: {
    ABIERTA: ['EN_REVISION', 'CANCELADA'], EN_REVISION: ['PRESUPUESTO', 'AUTORIZADA', 'RESUELTA', 'CANCELADA'],
    PRESUPUESTO: ['AUTORIZADA', 'EN_REVISION', 'CANCELADA'], AUTORIZADA: ['EN_REPARACION', 'RESUELTA', 'CANCELADA'],
    EN_REPARACION: ['RESUELTA', 'EN_REVISION'], RESUELTA: ['CERRADA', 'EN_REVISION'], CERRADA: ['EN_REVISION'], CANCELADA: [],
  } },
  averia: { inicial: 'PENDIENTE', terminales: ['RESUELTA', 'CANCELADA'], transiciones: {
    PENDIENTE: ['EN_DIAGNOSTICO', 'CANCELADA'], EN_DIAGNOSTICO: ['EN_REPARACION', 'RESUELTA', 'CANCELADA'],
    EN_REPARACION: ['RESUELTA', 'EN_DIAGNOSTICO'], RESUELTA: ['EN_DIAGNOSTICO'], CANCELADA: [],
  } },
  reparacion: { inicial: 'PLANIFICADA', terminales: ['FINALIZADA', 'CANCELADA'], transiciones: {
    PLANIFICADA: ['EN_CURSO', 'CANCELADA'], EN_CURSO: ['FINALIZADA', 'CANCELADA'], FINALIZADA: [], CANCELADA: [],
  } },
  equipo: { inicial: 'OPERATIVO', terminales: ['RETIRADO'], transiciones: {
    OPERATIVO: ['AVERIADO', 'EN_REPARACION', 'RETIRADO'], AVERIADO: ['EN_REPARACION', 'OPERATIVO', 'RETIRADO'],
    EN_REPARACION: ['OPERATIVO', 'AVERIADO', 'RETIRADO'], RETIRADO: [],
  } },
  presupuesto: { inicial: 'PENDIENTE', terminales: ['APROBADO', 'RECHAZADO', 'CANCELADO'], transiciones: {
    PENDIENTE: ['APROBADO', 'RECHAZADO', 'CANCELADO'], APROBADO: ['CANCELADO'], RECHAZADO: [], CANCELADO: [],
  } },
  factura: { inicial: 'REGISTRADA', terminales: ['ANULADA'], transiciones: { REGISTRADA: ['ANULADA'], ANULADA: [] } },
});
