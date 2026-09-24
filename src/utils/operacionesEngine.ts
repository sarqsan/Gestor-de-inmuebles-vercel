/**
 * CENTRO DE OPERACIONES Y MANTENIMIENTO — motor de agregación/coordinación.
 *
 * Capa pura de SOLO LECTURA: clasifica, filtra y agrega entidades operativas
 * existentes (incidencias, tareas de mantenimiento, trabajos/OT, presupuestos,
 * profesionales, reformas, garantías, pólizas, siniestros, gastos).
 *
 * Reglas:
 * - NO crea entidades ni colecciones nuevas (cero fuentes de verdad paralelas).
 * - NO cambia máquinas de estado: reutiliza los predicados/semánticas de los
 *   motores existentes (incidenciasEngine, mantenimientoEngine, segurosEngine,
 *   gastosEngine) y de reportingEngine (InformeOperativa).
 * - Toda fecha de referencia es inyectable (`fechaRef`) para determinismo.
 * - El RBAC canónico vive en App (scoped arrays) + Firestore rules; aquí solo
 *   se aplica un filtro de alcance en profundidad con los ids ya acotados.
 */

import type {
  Gasto,
  GarantiaReparacion,
  Incidencia,
  NecesidadReforma,
  PolizaSeguro,
  PresupuestoProfesional,
  Profesional,
  ProyectoReforma,
  Siniestro,
  TareaMantenimiento,
  TrabajoProfesional,
} from '../types';
import { calcularMetricasIncidencias } from './incidenciasEngine';
import {
  evaluarEstadoGarantia,
  evaluarEstadoSeguimiento,
} from './mantenimientoEngine';
import { detectarPolizasProximasVencer } from './segurosEngine';
import { calcularTotalesGastos } from './gastosEngine';

// ---------------------------------------------------------------------------
// Alcance RBAC (defensa en profundidad sobre listas ya acotadas por App)
// ---------------------------------------------------------------------------

export interface AlcanceOperativa {
  esAdmin: boolean;
  propietarioId?: string | null;
  /** Ids de inmuebles ya acotados por App (scopedInmuebles). */
  inmuebleIdsPermitidos: string[];
}

type ConAlcance = {
  inmuebleId?: string;
  propietarioId?: string;
};

/**
 * Filtra una colección operativa por alcance.
 * - Admin: todo.
 * - Propietario: propietarioId propio O inmuebleId dentro de los permitidos
 *   (misma disyunción que los scoped arrays de App y canAccess*).
 * - Cualquier otro caso: vacío.
 */
export function filtrarPorAlcance<T extends ConAlcance>(
  items: T[],
  alcance: AlcanceOperativa
): T[] {
  if (alcance.esAdmin) return items;
  const permitidos = new Set(alcance.inmuebleIdsPermitidos);
  return items.filter((item) => {
    if (
      alcance.propietarioId &&
      item.propietarioId &&
      item.propietarioId === alcance.propietarioId
    ) {
      return true;
    }
    if (item.inmuebleId && permitidos.has(item.inmuebleId)) return true;
    return false;
  });
}

/**
 * Siniestro no porta inmuebleId/propietarioId: es visible si su incidencia
 * vinculada o su póliza vinculada son visibles (listas ya acotadas).
 */
export function filtrarSiniestrosPorAlcance(
  siniestros: Siniestro[],
  incidenciasVisibles: Pick<Incidencia, 'id'>[],
  polizasVisibles: Pick<PolizaSeguro, 'id'>[]
): Siniestro[] {
  const incidenciasIds = new Set(incidenciasVisibles.map((i) => i.id));
  const polizasIds = new Set(polizasVisibles.map((p) => p.id));
  return siniestros.filter(
    (s) => incidenciasIds.has(s.incidenciaId) || polizasIds.has(s.polizaId)
  );
}

// ---------------------------------------------------------------------------
// Utilidades de fecha (convención YYYY-MM-DD, igual que mantenimientoEngine)
// ---------------------------------------------------------------------------

function diaString(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function diaDe(valor?: string): string {
  return (valor || '').slice(0, 10);
}

function esDiaValido(dia: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(Date.parse(dia));
}

/** Días naturales entre dos días YYYY-MM-DD (fin - inicio). NaN si inválidos. */
export function diasEntreDias(inicioDia: string, finDia: string): number {
  if (!esDiaValido(inicioDia) || !esDiaValido(finDia)) return Number.NaN;
  return Math.round(
    (Date.parse(finDia) - Date.parse(inicioDia)) / 86400000
  );
}

// ---------------------------------------------------------------------------
// Incidencias (semántica coherente con calcularMetricasIncidencias)
// ---------------------------------------------------------------------------

const ESTADOS_INCIDENCIA_CERRADA = new Set([
  'RESUELTA',
  'CERRADA',
  'CANCELADA',
  'RECHAZADA',
]);

export function esIncidenciaNoCerrada(incidencia: Incidencia): boolean {
  return !ESTADOS_INCIDENCIA_CERRADA.has(incidencia.estado);
}

export function incidenciasNoCerradas(
  incidencias: Incidencia[]
): Incidencia[] {
  return incidencias.filter(esIncidenciaNoCerrada);
}

function compromisoVencido(
  incidencia: Incidencia,
  hoyDia: string
): boolean {
  const dia = diaDe(incidencia.fechaCompromiso);
  return esDiaValido(dia) && dia < hoyDia;
}

/**
 * Incidencias que requieren atención inmediata: no cerradas Y
 * (prioridad URGENTE/ALTA — mismo predicado que metricas.urgentes — O
 * fechaCompromiso vencida). Orden: URGENTE primero, luego por compromiso.
 */
export function incidenciasCriticas(
  incidencias: Incidencia[],
  fechaRef: Date = new Date()
): Incidencia[] {
  const hoyDia = diaString(fechaRef);
  const pesoPrioridad = (p?: string): number =>
    p === 'URGENTE' ? 0 : p === 'ALTA' ? 1 : 2;
  return incidencias
    .filter(
      (inc) =>
        esIncidenciaNoCerrada(inc) &&
        ((inc.prioridad === 'URGENTE' || inc.prioridad === 'ALTA') ||
          compromisoVencido(inc, hoyDia))
    )
    .sort((a, b) => {
      const pa = pesoPrioridad(a.prioridad);
      const pb = pesoPrioridad(b.prioridad);
      if (pa !== pb) return pa - pb;
      const fa = diaDe(a.fechaCompromiso) || '9999-12-31';
      const fb = diaDe(b.fechaCompromiso) || '9999-12-31';
      if (fa !== fb) return fa < fb ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
}

export function incidenciasCompromisoVencido(
  incidencias: Incidencia[],
  fechaRef: Date = new Date()
): Incidencia[] {
  const hoyDia = diaString(fechaRef);
  return incidencias.filter(
    (inc) => esIncidenciaNoCerrada(inc) && compromisoVencido(inc, hoyDia)
  );
}

// ---------------------------------------------------------------------------
// Tareas de mantenimiento (reutiliza evaluarEstadoSeguimiento)
// ---------------------------------------------------------------------------

export function tareasVencidas(
  tareas: TareaMantenimiento[],
  fechaRef: Date = new Date()
): TareaMantenimiento[] {
  return tareas.filter(
    (t) =>
      evaluarEstadoSeguimiento(t.proximaFecha, t.activa, 30, false, fechaRef) ===
      'VENCIDO'
  );
}

export function tareasProximas(
  tareas: TareaMantenimiento[],
  fechaRef: Date = new Date(),
  diasVentana: number = 30
): TareaMantenimiento[] {
  return tareas
    .filter(
      (t) =>
        evaluarEstadoSeguimiento(
          t.proximaFecha,
          t.activa,
          diasVentana,
          false,
          fechaRef
        ) === 'PROXIMO'
    )
    .sort((a, b) =>
      diaDe(a.proximaFecha) < diaDe(b.proximaFecha) ? -1 : 1
    );
}

// ---------------------------------------------------------------------------
// Trabajos / OOTT
// ---------------------------------------------------------------------------

const ESTADOS_TRABAJO_CERRADO = new Set([
  'FINALIZADO',
  'FINALIZADA',
  'CANCELADO',
  'CANCELADA',
]);

export function esTrabajoAbierto(trabajo: TrabajoProfesional): boolean {
  return !ESTADOS_TRABAJO_CERRADO.has(trabajo.estado);
}

export function trabajosAbiertos(
  trabajos: TrabajoProfesional[]
): TrabajoProfesional[] {
  return trabajos.filter(esTrabajoAbierto);
}

/** OOTT paradas esperando material o decisión del propietario. */
export function trabajosBloqueados(
  trabajos: TrabajoProfesional[]
): TrabajoProfesional[] {
  return trabajos.filter(
    (t) =>
      t.estado === 'PENDIENTE_MATERIAL' ||
      t.estado === 'PENDIENTE_PROPIETARIO'
  );
}

/** OOTT abiertas sin profesional asignado todavía. */
export function trabajosSinProfesional(
  trabajos: TrabajoProfesional[]
): TrabajoProfesional[] {
  return trabajos.filter((t) => esTrabajoAbierto(t) && !t.profesionalId);
}

// ---------------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------------

const ESTADOS_PRESUPUESTO_PENDIENTE_DECISION = new Set([
  'RECIBIDO',
  'EN_REVISION',
  'EN_NEGOCIACION',
]);

/** Presupuestos recibidos pendientes de decisión (excluye borradores). */
export function presupuestosPendientesDecision(
  presupuestos: PresupuestoProfesional[]
): PresupuestoProfesional[] {
  return presupuestos.filter((p) =>
    ESTADOS_PRESUPUESTO_PENDIENTE_DECISION.has(p.estado)
  );
}

// ---------------------------------------------------------------------------
// Garantías (reutiliza evaluarEstadoGarantia)
// ---------------------------------------------------------------------------

export function garantiasVigentes(
  garantias: GarantiaReparacion[],
  fechaRef: Date = new Date()
): GarantiaReparacion[] {
  return garantias.filter(
    (g) => evaluarEstadoGarantia(g.fechaFin, g.estado, fechaRef) === 'ACTIVA'
  );
}

/** Garantías vigentes cuyo fin cae dentro de la ventana (días naturales). */
export function garantiasProximasVencer(
  garantias: GarantiaReparacion[],
  fechaRef: Date = new Date(),
  diasVentana: number = 60
): GarantiaReparacion[] {
  const hoyDia = diaString(fechaRef);
  return garantias
    .filter((g) => {
      if (
        evaluarEstadoGarantia(g.fechaFin, g.estado, fechaRef) !== 'ACTIVA'
      ) {
        return false;
      }
      const finDia = diaDe(g.fechaFin);
      if (!esDiaValido(finDia)) return false;
      const diff = diasEntreDias(hoyDia, finDia);
      return diff >= 0 && diff <= diasVentana;
    })
    .sort((a, b) => (diaDe(a.fechaFin) < diaDe(b.fechaFin) ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Siniestros (mismo predicado que reportingEngine InformeOperativa)
// ---------------------------------------------------------------------------

export function esSiniestroAbierto(siniestro: Siniestro): boolean {
  return siniestro.estado !== 'CERRADO' && siniestro.estado !== 'INDEMNIZADO';
}

export function siniestrosAbiertos(siniestros: Siniestro[]): Siniestro[] {
  return siniestros.filter(esSiniestroAbierto);
}

// ---------------------------------------------------------------------------
// Reformas
// ---------------------------------------------------------------------------

const ESTADOS_PROYECTO_CERRADO = new Set([
  'FINALIZADO',
  'FINALIZADA',
  'CANCELADO',
  'CANCELADA',
]);

export function proyectosActivos(
  proyectos: ProyectoReforma[]
): ProyectoReforma[] {
  return proyectos.filter((p) => !ESTADOS_PROYECTO_CERRADO.has(p.estado));
}

export function necesidadesAbiertas(
  necesidades: NecesidadReforma[]
): NecesidadReforma[] {
  return necesidades.filter(
    (n) => n.estado !== 'FINALIZADA' && n.estado !== 'CANCELADA'
  );
}

// ---------------------------------------------------------------------------
// Coste operativo (gastos vinculados al circuito operativo)
// ---------------------------------------------------------------------------

const ORIGENES_COSTE_OPERATIVO = new Set([
  'REPARACION',
  'ORDEN_TRABAJO',
  'INCIDENCIA',
  'SEGURO',
]);

export interface CosteOperativo {
  gastos: Gasto[];
  count: number;
  totalDeducible: number;
  totalPagado: number;
  porCategoria: Record<string, number>;
}

/**
 * Gastos del circuito operativo: origen REPARACION/ORDEN_TRABAJO/INCIDENCIA/
 * SEGURO o con trazabilidad trabajoId/ordenTrabajoId/incidenciaId.
 * Totales calculados con calcularTotalesGastos (gastosEngine).
 */
export function costeOperativo(gastos: Gasto[]): CosteOperativo {
  const operativos = gastos.filter(
    (g) =>
      (g.origen && ORIGENES_COSTE_OPERATIVO.has(g.origen)) ||
      !!g.trabajoId ||
      !!g.ordenTrabajoId ||
      !!g.incidenciaId
  );
  const totales = calcularTotalesGastos(operativos);
  return {
    gastos: operativos,
    count: operativos.length,
    totalDeducible: totales.totalDeducible,
    totalPagado: totales.totalPagado,
    porCategoria: totales.porCategoria,
  };
}

// ---------------------------------------------------------------------------
// Carga de profesionales (OOTT abiertas por profesional)
// ---------------------------------------------------------------------------

export interface CargaProfesional {
  profesional: Profesional;
  trabajosActivos: number;
  trabajosBloqueados: number;
}

export function cargaProfesionales(
  profesionales: Profesional[],
  trabajos: TrabajoProfesional[]
): CargaProfesional[] {
  const abiertos = trabajosAbiertos(trabajos);
  return profesionales
    .map((profesional) => {
      const delProfesional = abiertos.filter(
        (t) => t.profesionalId === profesional.id
      );
      return {
        profesional,
        trabajosActivos: delProfesional.length,
        trabajosBloqueados: delProfesional.filter(
          (t) =>
            t.estado === 'PENDIENTE_MATERIAL' ||
            t.estado === 'PENDIENTE_PROPIETARIO'
        ).length,
      };
    })
    .filter((c) => c.trabajosActivos > 0)
    .sort(
      (a, b) =>
        b.trabajosActivos - a.trabajosActivos ||
        (a.profesional.nombreComercial || '').localeCompare(
          b.profesional.nombreComercial || ''
        )
    );
}

// ---------------------------------------------------------------------------
// Agenda operativa unificada (próximos hitos con fecha)
// ---------------------------------------------------------------------------

export type TipoEventoAgenda =
  | 'COMPROMISO_INCIDENCIA'
  | 'TAREA_VENCIDA'
  | 'TAREA_PROXIMA'
  | 'VENCIMIENTO_POLIZA'
  | 'FIN_GARANTIA'
  | 'HITO_PROYECTO';

export type EntidadAgenda =
  | 'incidencia'
  | 'tarea'
  | 'poliza'
  | 'garantia'
  | 'proyecto';

export interface EventoAgendaOperativa {
  id: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoEventoAgenda;
  titulo: string;
  detalle?: string;
  inmuebleId?: string;
  inmuebleDireccion?: string;
  vencido: boolean;
  entidad: EntidadAgenda;
  entidadId: string;
}

export interface EntradaAgendaOperativa {
  incidencias: Incidencia[];
  tareas: TareaMantenimiento[];
  polizas: PolizaSeguro[];
  garantias: GarantiaReparacion[];
  proyectos: ProyectoReforma[];
}

/**
 * Agenda unificada: compromisos de incidencia, tareas vencidas/próximas,
 * vencimientos de póliza (vía detectarPolizasProximasVencer), fines de
 * garantía e hitos previstos de proyecto. Ventana: pasado vencido + próximos
 * `diasVentana` días. Ordenada por fecha ascendente (vencidos primero).
 */
export function agendaOperativa(
  entrada: EntradaAgendaOperativa,
  fechaRef: Date = new Date(),
  diasVentana: number = 30
): EventoAgendaOperativa[] {
  const hoyDia = diaString(fechaRef);
  const eventos: EventoAgendaOperativa[] = [];

  const dentroVentana = (dia: string): boolean => {
    if (!esDiaValido(dia)) return false;
    if (dia < hoyDia) return true; // vencido: siempre se muestra
    return diasEntreDias(hoyDia, dia) <= diasVentana;
  };

  for (const inc of incidenciasNoCerradas(entrada.incidencias)) {
    const dia = diaDe(inc.fechaCompromiso);
    if (!dentroVentana(dia)) continue;
    eventos.push({
      id: `inc-${inc.id}`,
      fecha: dia,
      tipo: 'COMPROMISO_INCIDENCIA',
      titulo: inc.titulo,
      detalle: `Incidencia ${inc.prioridad} · ${inc.estado}`,
      inmuebleId: inc.inmuebleId,
      inmuebleDireccion: inc.inmuebleDireccion,
      vencido: dia < hoyDia,
      entidad: 'incidencia',
      entidadId: inc.id,
    });
  }

  for (const tarea of entrada.tareas) {
    if (!tarea.activa) continue;
    const estado = evaluarEstadoSeguimiento(
      tarea.proximaFecha,
      tarea.activa,
      diasVentana,
      false,
      fechaRef
    );
    if (estado !== 'VENCIDO' && estado !== 'PROXIMO') continue;
    const dia = diaDe(tarea.proximaFecha);
    eventos.push({
      id: `tar-${tarea.id}`,
      fecha: dia,
      tipo: estado === 'VENCIDO' ? 'TAREA_VENCIDA' : 'TAREA_PROXIMA',
      titulo: tarea.titulo,
      detalle: `Mantenimiento${tarea.tipo ? ` ${tarea.tipo}` : ''} · ${tarea.periodicidad}`,
      inmuebleId: tarea.inmuebleId,
      inmuebleDireccion: tarea.inmuebleDireccion,
      vencido: estado === 'VENCIDO',
      entidad: 'tarea',
      entidadId: tarea.id,
    });
  }

  for (const alerta of detectarPolizasProximasVencer(entrada.polizas)) {
    const dia = diaDe(alerta.fechaVencimiento);
    if (!dentroVentana(dia)) continue;
    eventos.push({
      id: `pol-${alerta.polizaId}`,
      fecha: dia,
      tipo: 'VENCIMIENTO_POLIZA',
      titulo: `Póliza ${alerta.polizaNumero} · ${alerta.aseguradora}`,
      detalle: `Vence en ${alerta.diasRestantes} días`,
      inmuebleId: alerta.inmuebleId,
      inmuebleDireccion: alerta.inmuebleDireccion,
      vencido: dia < hoyDia,
      entidad: 'poliza',
      entidadId: alerta.polizaId,
    });
  }

  for (const garantia of garantiasVigentes(entrada.garantias, fechaRef)) {
    const dia = diaDe(garantia.fechaFin);
    if (dia < hoyDia || !dentroVentana(dia)) continue;
    eventos.push({
      id: `gar-${garantia.id}`,
      fecha: dia,
      tipo: 'FIN_GARANTIA',
      titulo: garantia.titulo,
      detalle: `Garantía ${garantia.proveedor}`,
      inmuebleId: garantia.inmuebleId,
      inmuebleDireccion: garantia.inmuebleDireccion,
      vencido: false,
      entidad: 'garantia',
      entidadId: garantia.id,
    });
  }

  for (const proyecto of proyectosActivos(entrada.proyectos)) {
    const dia = diaDe(proyecto.fechaPrevistaFin);
    if (!dentroVentana(dia)) continue;
    eventos.push({
      id: `pro-${proyecto.id}`,
      fecha: dia,
      tipo: 'HITO_PROYECTO',
      titulo: proyecto.titulo,
      detalle: `Fin previsto · ${proyecto.estado}`,
      inmuebleId: proyecto.inmuebleId,
      inmuebleDireccion: proyecto.inmuebleDireccion,
      vencido: dia < hoyDia,
      entidad: 'proyecto',
      entidadId: proyecto.id,
    });
  }

  const pesoTipo: Record<TipoEventoAgenda, number> = {
    TAREA_VENCIDA: 0,
    COMPROMISO_INCIDENCIA: 1,
    VENCIMIENTO_POLIZA: 2,
    TAREA_PROXIMA: 3,
    FIN_GARANTIA: 4,
    HITO_PROYECTO: 5,
  };

  return eventos.sort(
    (a, b) =>
      (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0) ||
      pesoTipo[a.tipo] - pesoTipo[b.tipo] ||
      (a.id < b.id ? -1 : 1)
  );
}

// ---------------------------------------------------------------------------
// Resumen operativo (KPIs del centro)
// ---------------------------------------------------------------------------

export interface ResumenOperativo {
  incidenciasAbiertas: number;
  incidenciasEnProceso: number;
  incidenciasUrgentes: number;
  incidenciasCompromisoVencido: number;
  tareasVencidas: number;
  tareasProximas: number;
  trabajosAbiertos: number;
  trabajosBloqueados: number;
  trabajosSinProfesional: number;
  presupuestosPendientes: number;
  garantiasVigentes: number;
  garantiasProximasVencer: number;
  polizasProximasVencer: number;
  siniestrosAbiertos: number;
  proyectosActivos: number;
  necesidadesAbiertas: number;
  eventosAgenda: number;
  costeOperativoTotal: number;
  costeOperativoPagado: number;
  costeOperativoCount: number;
}

export interface EntradaResumenOperativo extends EntradaAgendaOperativa {
  trabajos: TrabajoProfesional[];
  presupuestos: PresupuestoProfesional[];
  siniestros: Siniestro[];
  necesidades: NecesidadReforma[];
  gastos: Gasto[];
}

/**
 * KPIs del centro. Las listas de entrada deben venir ya acotadas por alcance
 * (props scoped de App + filtrarPorAlcance/filtrarSiniestrosPorAlcance).
 */
export function resumenOperativo(
  entrada: EntradaResumenOperativo,
  fechaRef: Date = new Date()
): ResumenOperativo {
  const metricas = calcularMetricasIncidencias(
    entrada.incidencias,
    entrada.siniestros
  );
  const coste = costeOperativo(entrada.gastos);
  const agenda = agendaOperativa(entrada, fechaRef);
  return {
    incidenciasAbiertas: metricas.abiertas,
    incidenciasEnProceso: metricas.enProceso,
    incidenciasUrgentes: metricas.urgentes,
    incidenciasCompromisoVencido: incidenciasCompromisoVencido(
      entrada.incidencias,
      fechaRef
    ).length,
    tareasVencidas: tareasVencidas(entrada.tareas, fechaRef).length,
    tareasProximas: tareasProximas(entrada.tareas, fechaRef).length,
    trabajosAbiertos: trabajosAbiertos(entrada.trabajos).length,
    trabajosBloqueados: trabajosBloqueados(entrada.trabajos).length,
    trabajosSinProfesional: trabajosSinProfesional(entrada.trabajos).length,
    presupuestosPendientes: presupuestosPendientesDecision(
      entrada.presupuestos
    ).length,
    garantiasVigentes: garantiasVigentes(entrada.garantias, fechaRef).length,
    garantiasProximasVencer: garantiasProximasVencer(
      entrada.garantias,
      fechaRef
    ).length,
    polizasProximasVencer: detectarPolizasProximasVencer(entrada.polizas)
      .length,
    siniestrosAbiertos: siniestrosAbiertos(entrada.siniestros).length,
    proyectosActivos: proyectosActivos(entrada.proyectos).length,
    necesidadesAbiertas: necesidadesAbiertas(entrada.necesidades).length,
    eventosAgenda: agenda.length,
    costeOperativoTotal: coste.totalDeducible,
    costeOperativoPagado: coste.totalPagado,
    costeOperativoCount: coste.count,
  };
}
