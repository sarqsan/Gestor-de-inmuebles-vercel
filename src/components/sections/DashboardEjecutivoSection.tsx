/**
 * CENTRO DE CONTROL EJECUTIVO DEL ERP — DASHBOARD PRINCIPAL
 * ARENA D — Auditoría previa y fuentes reales documentadas:
 *
 * Inmuebles: subscribeInmuebles (firebase.ts) -> Inmueble[] scoped por propietarioId / inmuebleIds. Fuente: colección 'inmuebles'.
 * Alquileres/Contratos: subscribeContratos scoped propietarioId -> ContratoFormalizacion[] con registroCobros CobroPeriodo[].
 *   Motor: generarPeriodosParaContrato, obtenerTodosCobros, calcularResumenCobros, calcularAvisosCobros (cobrosEngine.ts)
 * Ocupación: derivada de Inmueble.estado ('alquilado'|'disponible') + contratos vigentes (esVigente) + modalidad habitaciones.
 *   Cálculo: ocupados = inmuebles.filter(i=>i.estado==='alquilado').length, % = ocupados/total.
 * Ingresos: CobroPeriodo[] de contratos visibles, importeRecibido sumado si estado RECIBIDO/VERIFICADO/PAGADO.
 *   Fuente real: contrato.registroCobros, motor calcularResumenCobros.
 * Gastos: subscribeGastos scoped propietarioId -> Gasto[] con tipo EXPLOTACION/FINANCIACION, estado PAGADO/PENDIENTE.
 *   Motor: resumenGastos (gastosEngine.ts) separa explotacionPagado, financiacionPagado, pendiente, salidaCajaPagada.
 * Conciliación bancaria: types/conciliacion.ts + engines (importEngine, matchingEngine, conciliacionEngine). Datos en memoria
 *   tras importación CSV/OFX/MT940/Norma43, no persistido Firestore. Si no hay importaciones, mostrar vacío informativo.
 * Tesorería: derivada si fuentes permiten: ingresos cobrados - gastos pagados (saldo). Solo cálculo derivado claro.
 * Morosidad: cobros con estado RETRASADO/INCIDENCIA/IMPAGADO + importe pendiente. Fuente: cobrosEngine + calcularAvisosCobros.
 * Candidatos: subscribeCandidatos -> Candidato[] (estado nuevo, pendiente_doc, etc.)
 * Operaciones/Incidencias: subscribeIncidencias, subscribeTareasMantenimiento, subscribeTrabajosProfesionales,
 *   subscribePresupuestosProfesionales, subscribePolizas, subscribeSiniestros (firebase.ts / firebaseActas.ts)
 * Alertas: polizas próximas a vencer (PolizaSeguro.fechaVencimiento), actas pendientes firma (Acta.estado),
 *   contratos próximos a finalizar (ContratoFormalizacion.fechaFinContrato), incidencias urgentes.
 * Actividad/Historial: subscribeAuditLogs (solo ADMIN) -> AuditLog[], fallback a historial de contratos/incidencias/gastos
 *   recientes si no hay logs. Fuente real: audit_logs colección.
 *
 * PROHIBIDO datos ficticios / KPIs estáticos. Si dato no existe -> vacío informativo, nunca 0 sustituto de no obtenido.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  SectionType,
  Inmueble,
  ContratoFormalizacion,
  CobroPeriodo,
  Gasto,
  Candidato,
  UsuarioApp,
  Propietario,
  Incidencia,
  TareaMantenimiento,
  PolizaSeguro,
  Siniestro,
  TrabajoProfesional,
  ExpedienteRecomercializacion,
  AuditLog,
} from '../../types';
import { calcularResumenCobros, calcularAvisosCobros } from '../../utils/cobrosEngine';
import { resumenGastos } from '../../utils/gastosEngine';
import {
  subscribeIncidencias,
  subscribeTareasMantenimiento,
  subscribePolizas,
  subscribeSiniestros,
  subscribeTrabajosProfesionales,
  subscribeExpedientesRecomercializacion,
  subscribeAuditLogs,
} from '../../lib/firebase';
import { subscribeActas } from '../../lib/firebaseActas';
import type { Acta } from '../../types/actas';
import {
  Building2,
  Home,
  Euro,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileText,
  Wrench,
  Users,
  Calendar,
  ArrowUpRight,
  Activity,
  Banknote,
  Receipt,
  Landmark,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  PieChart,
  ClipboardList,
  Key,
} from 'lucide-react';

interface DashboardEjecutivoProps {
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  cobros: CobroPeriodo[];
  gastos: Gasto[];
  candidatos: Candidato[];
  propietarios?: Propietario[];
  currentUser?: UsuarioApp | null;
  onSelectSection: (section: SectionType) => void;
  loadingMain?: boolean;
  cobrosPendientesCount?: number;
}

type PeriodoFiltro = 'MES_ACTUAL' | 'ULT_3M' | 'ULT_6M' | 'ANO_ACTUAL' | 'ULT_12M';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatEuro(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n));
}
function formatEuroPreciso(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(n));
}
function formatFechaCorta(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
function diasHasta(fechaISO?: string): number | null {
  if (!fechaISO) return null;
  const f = new Date(`${fechaISO}T00:00:00`);
  if (isNaN(f.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((f.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export const DashboardEjecutivoSection: React.FC<DashboardEjecutivoProps> = ({
  inmuebles,
  contratos,
  cobros,
  gastos,
  candidatos,
  propietarios = [],
  currentUser,
  onSelectSection,
  loadingMain = false,
}) => {
  // Subscripciones internas para completar el centro de control con datos reales existentes
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [tareas, setTareas] = useState<TareaMantenimiento[]>([]);
  const [polizas, setPolizas] = useState<PolizaSeguro[]>([]);
  const [siniestros, setSiniestros] = useState<Siniestro[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoProfesional[]>([]);
  const [actas, setActas] = useState<Acta[]>([]);
  const [expedientes, setExpedientes] = useState<ExpedienteRecomercializacion[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [errorOps, setErrorOps] = useState<string | null>(null);

  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('ANO_ACTUAL');
  const [fechaAhora] = useState(() => new Date());

  // Scope para filtrado cliente cuando el subscribe no lleva scope
  const allowedInmuebleIds = useMemo(() => new Set(inmuebles.map((i) => i.id)), [inmuebles]);

  useEffect(() => {
    setLoadingOps(true);
    setErrorOps(null);
    const subs: Array<() => void> = [];
    try {
      const scope = currentUser
        ? { tipoPerfil: currentUser.tipoPerfil, propietarioId: currentUser.propietarioId, inmuebleIds: currentUser.inmuebleIds || [] }
        : undefined;

      subs.push(
        subscribeIncidencias((items) => {
          // Defensa en profundidad: filtrar por inmuebles permitidos si existen
          const filtered = allowedInmuebleIds.size > 0 ? items.filter((it) => allowedInmuebleIds.has(it.inmuebleId)) : items;
          setIncidencias(filtered);
        }, scope as any)
      );
      subs.push(
        subscribeTareasMantenimiento((items) => {
          const filtered = allowedInmuebleIds.size > 0 ? items.filter((it) => allowedInmuebleIds.has(it.inmuebleId)) : items;
          setTareas(filtered);
        }, scope as any)
      );
      subs.push(
        subscribePolizas((items) => {
          const filtered = allowedInmuebleIds.size > 0 ? items.filter((it) => !it.inmuebleId || allowedInmuebleIds.has(it.inmuebleId)) : items;
          setPolizas(filtered);
        })
      );
      subs.push(
        subscribeSiniestros((items) => {
          // Siniestros vinculados a incidencias ya filtradas; filtrado indirecto por inmueble via incidenciaId si posible
          setSiniestros(items);
        })
      );
      subs.push(
        subscribeTrabajosProfesionales((items) => {
          const filtered = allowedInmuebleIds.size > 0 ? items.filter((it) => allowedInmuebleIds.has(it.inmuebleId)) : items;
          setTrabajos(filtered);
        })
      );
      subs.push(
        subscribeExpedientesRecomercializacion((items) => {
          const filtered = allowedInmuebleIds.size > 0 ? items.filter((it) => allowedInmuebleIds.has(it.inmuebleId)) : items;
          setExpedientes(filtered);
        }, scope as any)
      );
      subs.push(
        subscribeActas((items) => {
          const filtered = allowedInmuebleIds.size > 0 ? items.filter((it) => allowedInmuebleIds.has(it.propertyId)) : items;
          setActas(filtered as any);
        }, scope as any)
      );
      // Solo admin tiene audit logs; si falla, no rompe dashboard
      try {
        subs.push(
          subscribeAuditLogs((items) => {
            setAuditLogs(items);
          })
        );
      } catch {}
      setLoadingOps(false);
    } catch (e: any) {
      setErrorOps(e?.message || 'Error cargando operaciones');
      setLoadingOps(false);
    }
    return () => {
      subs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
    // Re-suscribir si cambian inmuebles permitidos (scope)
  }, [currentUser?.id, currentUser?.tipoPerfil, inmuebles.length]);

  // ===================== CÁLCULOS DERIVADOS REALES =====================
  const resumenCobros = useMemo(() => calcularResumenCobros(cobros), [cobros]);
  const avisosCobros = useMemo(() => calcularAvisosCobros(cobros, new Date()), [cobros]);
  const resumenGastosMemo = useMemo(() => resumenGastos(gastos), [gastos]);

  const inmueblesStats = useMemo(() => {
    const total = inmuebles.length;
    const ocupados = inmuebles.filter((i) => i.estado === 'alquilado').length;
    const vacios = inmuebles.filter((i) => i.estado === 'disponible').length;
    const habitaciones = inmuebles.filter((i) => i.modalidadAlquiler === 'habitaciones').length;
    const parcial = total - ocupados - vacios; // otros estados o inconsistentes
    const porcentajeOcupacion = total > 0 ? Math.round((ocupados / total) * 100) : null;
    return { total, ocupados, vacios, habitaciones, parcial, porcentajeOcupacion };
  }, [inmuebles]);

  const contratosStats = useMemo(() => {
    const activos = contratos.filter((c) => c.estado !== 'FINALIZADO' && c.esVigente !== false).length;
    const hoy = new Date();
    const en60 = contratos.filter((c) => {
      if (!c.fechaFinContrato) return false;
      const dias = diasHasta(c.fechaFinContrato);
      return dias !== null && dias >= 0 && dias <= 60;
    });
    const finalizados = contratos.filter((c) => c.estado === 'FINALIZADO').length;
    return { activos, proximosFin: en60, finalizados, total: contratos.length };
  }, [contratos]);

  const morosidadStats = useMemo(() => {
    const retrasados = cobros.filter((c) => c.estado === 'RETRASADO');
    const incidenciasCobro = cobros.filter((c) => c.estado === 'INCIDENCIA');
    const impagados = cobros.filter((c) => c.estado === 'IMPAGADO');
    const totalCount = retrasados.length + incidenciasCobro.length + impagados.length;
    const totalImporte =
      retrasados.reduce((s, c) => s + (c.importePrevisto - (c.importeRecibido || 0)), 0) +
      incidenciasCobro.reduce((s, c) => s + (c.importePrevisto - (c.importeRecibido || 0)), 0) +
      impagados.reduce((s, c) => s + (c.importePrevisto - (c.importeRecibido || 0)), 0);
    return { retrasados, incidenciasCobro, impagados, totalCount, totalImporte };
  }, [cobros]);

  const cobrosPendientesStats = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    const vencidos = cobros.filter((c) => {
      if (c.estado === 'RETRASADO' || c.estado === 'INCIDENCIA' || c.estado === 'IMPAGADO') return true;
      if (c.estado === 'PENDIENTE' && c.fechaVencimiento) {
        return new Date(`${c.fechaVencimiento}T23:59:59`) <= hoy;
      }
      return false;
    });
    const importePendiente = vencidos.reduce((s, c) => s + (c.importePrevisto - (c.importeRecibido || 0)), 0);
    return { vencidos, importePendiente, count: vencidos.length };
  }, [cobros]);

  const incidenciasStats = useMemo(() => {
    const abiertas = incidencias.filter((i) => !['CERRADA', 'RESUELTA', 'CANCELADA', 'RECHAZADA'].includes(i.estado));
    const urgentes = incidencias.filter((i) => i.prioridad === 'URGENTE' || i.prioridad === 'ALTA');
    const enCurso = incidencias.filter((i) => ['EN_CURSO', 'EN_REPARACION', 'ASIGNADA'].includes(i.estado));
    return { total: incidencias.length, abiertas, urgentes, enCurso };
  }, [incidencias]);

  const polizasAlertas = useMemo(() => {
    const proximas = polizas.filter((p) => {
      const dias = diasHasta(p.fechaVencimiento);
      return dias !== null && dias >= -1 && dias <= 60;
    });
    const vencidas = polizas.filter((p) => {
      const dias = diasHasta(p.fechaVencimiento);
      return dias !== null && dias < 0;
    });
    return { proximas, vencidas, total: polizas.length };
  }, [polizas]);

  const actasPendientes = useMemo(() => {
    return actas.filter((a: any) => ['BORRADOR', 'EN_REVISION', 'PENDIENTE_FIRMA'].includes(a.estado));
  }, [actas]);

  const gastosPendientes = useMemo(() => {
    return gastos.filter((g) => g.estado === 'PENDIENTE');
  }, [gastos]);

  const candidatosPendientes = useMemo(() => {
    return candidatos.filter((c) => c.estado === 'nuevo' || c.estado === 'pendiente_doc');
  }, [candidatos]);

  // Evolución mensual ingresos vs gastos últimos 6-12 meses (solo si hay datos)
  const evolucionMensual = useMemo(() => {
    const now = new Date();
    const meses: Array<{ key: string; label: string; ingresos: number; gastos: number }> = [];
    let numMeses = 6;
    if (periodoFiltro === 'ULT_3M') numMeses = 3;
    if (periodoFiltro === 'ULT_6M') numMeses = 6;
    if (periodoFiltro === 'ULT_12M' || periodoFiltro === 'ANO_ACTUAL') numMeses = 12;
    if (periodoFiltro === 'MES_ACTUAL') numMeses = 1;

    for (let i = numMeses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = periodoFiltro === 'MES_ACTUAL' ? `${MESES[d.getMonth()]} ${d.getFullYear()}` : MESES[d.getMonth()];
      meses.push({ key, label, ingresos: 0, gastos: 0 });
    }
    // Ingresos cobrados por fechaPago o fechaVencimiento si cobrado
    cobros.forEach((c) => {
      if ((c.estado === 'RECIBIDO' || c.estado === 'VERIFICADO' || (c as any).estado === 'PAGADO') && c.fechaPago) {
        const k = c.fechaPago.slice(0, 7);
        const m = meses.find((x) => x.key === k);
        if (m) m.ingresos += c.importeRecibido || c.importePrevisto || 0;
      } else if ((c.estado === 'RECIBIDO' || c.estado === 'VERIFICADO') && c.periodoMesAnio) {
        const m = meses.find((x) => x.key === c.periodoMesAnio);
        if (m) m.ingresos += c.importeRecibido || 0;
      }
    });
    gastos.forEach((g) => {
      if (g.estado === 'PAGADO' && g.periodoMesAnio) {
        const m = meses.find((x) => x.key === g.periodoMesAnio);
        if (m) m.gastos += g.importe || 0;
      } else if (g.estado === 'PAGADO' && g.fechaPago) {
        const k = g.fechaPago.slice(0, 7);
        const m = meses.find((x) => x.key === k);
        if (m) m.gastos += g.importe || 0;
      }
    });
    return meses;
  }, [cobros, gastos, periodoFiltro]);

  const maxEvolucion = useMemo(() => {
    return Math.max(1, ...evolucionMensual.map((m) => Math.max(m.ingresos, m.gastos)));
  }, [evolucionMensual]);

  const tesoreria = useMemo(() => {
    const ingresosCobrados = resumenCobros.totalRecibido;
    const gastosPagados = resumenGastosMemo.salidaCajaPagada;
    const saldo = ingresosCobrados - gastosPagados;
    const hasData = cobros.length > 0 || gastos.length > 0;
    return { ingresosCobrados, gastosPagados, saldo, hasData };
  }, [resumenCobros, resumenGastosMemo, cobros.length, gastos.length]);

  // Actividad reciente real: auditLogs si existen, si no, últimos contratos/gastos/incidencias/cobros
  const actividadReciente = useMemo(() => {
    if (auditLogs.length > 0) {
      return auditLogs.slice(0, 8).map((log) => ({
        id: log.id,
        fecha: log.fechaHora,
        titulo: log.accion,
        detalle: log.descripcion,
        tipo: log.entidadAfectada,
      }));
    }
    // Fallback: construir actividad desde datos reales existentes
    const items: Array<{ id: string; fecha: string; titulo: string; detalle: string; tipo: string }> = [];
    contratos
      .slice()
      .sort((a, b) => (b.fechaActualizacion || '').localeCompare(a.fechaActualizacion || ''))
      .slice(0, 3)
      .forEach((c) => {
        items.push({
          id: `cont_${c.id}`,
          fecha: c.fechaActualizacion || c.fechaCreacion,
          titulo: `Contrato ${c.estado}`,
          detalle: `${c.inmuebleDireccion} · ${c.candidatoNombre} · ${formatEuro(c.rentaMensual)}/mes`,
          tipo: 'contrato',
        });
      });
    gastos
      .slice()
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 3)
      .forEach((g) => {
        items.push({
          id: `gas_${g.id}`,
          fecha: g.updatedAt || g.createdAt,
          titulo: `Gasto ${g.estado} — ${g.categoria}`,
          detalle: `${g.concepto} · ${formatEuro(g.importe)} · ${g.inmuebleId}`,
          tipo: 'gasto',
        });
      });
    incidencias
      .slice()
      .sort((a, b) => (b.fechaActualizacion || b.createdAt || '').localeCompare(a.fechaActualizacion || a.createdAt || ''))
      .slice(0, 3)
      .forEach((i) => {
        items.push({
          id: `inc_${i.id}`,
          fecha: i.fechaActualizacion || i.createdAt || '',
          titulo: `Incidencia ${i.estado} — ${i.categoria}`,
          detalle: `${i.titulo} · ${i.inmuebleDireccion || i.inmuebleId}`,
          tipo: 'incidencia',
        });
      });
    return items.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 8);
  }, [auditLogs, contratos, gastos, incidencias]);

  const requiereAtencion = useMemo(() => {
    const items: Array<{ id: string; prioridad: 'critica' | 'alta' | 'media'; titulo: string; detalle: string; accion: SectionType; count?: number }> = [];
    if (cobrosPendientesStats.count > 0) {
      items.push({
        id: 'cobros_pend',
        prioridad: 'critica',
        titulo: `${cobrosPendientesStats.count} cobros vencidos por gestionar`,
        detalle: `Importe pendiente ${formatEuro(cobrosPendientesStats.importePendiente)} — Requiere seguimiento inmediato`,
        accion: 'cobros',
        count: cobrosPendientesStats.count,
      });
    }
    if (morosidadStats.totalCount > 0) {
      items.push({
        id: 'morosidad',
        prioridad: 'critica',
        titulo: `${morosidadStats.totalCount} periodos en morosidad`,
        detalle: `${formatEuro(morosidadStats.totalImporte)} en retraso/incidencia — Expedientes de reclamación`,
        accion: 'cobros',
        count: morosidadStats.totalCount,
      });
    }
    if (incidenciasStats.abiertas.length > 0) {
      items.push({
        id: 'incidencias',
        prioridad: incidenciasStats.urgentes.length > 0 ? 'critica' : 'alta',
        titulo: `${incidenciasStats.abiertas.length} incidencias abiertas`,
        detalle: `${incidenciasStats.urgentes.length} urgentes/alta · ${incidenciasStats.enCurso.length} en curso`,
        accion: 'incidencias',
        count: incidenciasStats.abiertas.length,
      });
    }
    if (gastosPendientes.length > 0) {
      items.push({
        id: 'gastos_pend',
        prioridad: 'media',
        titulo: `${gastosPendientes.length} gastos pendientes de pago`,
        detalle: `${formatEuro(gastosPendientes.reduce((s, g) => s + (g.importe || 0), 0))} por abonar`,
        accion: 'gastos',
        count: gastosPendientes.length,
      });
    }
    if (contratosStats.proximosFin.length > 0) {
      items.push({
        id: 'contratos_fin',
        prioridad: 'alta',
        titulo: `${contratosStats.proximosFin.length} contratos próximos a finalizar (60d)`,
        detalle: contratosStats.proximosFin.map((c) => `${c.inmuebleDireccion} vence ${formatFechaCorta(c.fechaFinContrato)}`).slice(0, 2).join(' · '),
        accion: 'formalizacion',
        count: contratosStats.proximosFin.length,
      });
    }
    if (polizasAlertas.proximas.length > 0) {
      items.push({
        id: 'polizas_venc',
        prioridad: polizasAlertas.vencidas.length > 0 ? 'critica' : 'alta',
        titulo: `${polizasAlertas.proximas.length} pólizas próximas a vencer`,
        detalle: `${polizasAlertas.vencidas.length} ya vencidas · Revisar renovación Bloque D`,
        accion: 'polizas',
        count: polizasAlertas.proximas.length,
      });
    }
    if (actasPendientes.length > 0) {
      items.push({
        id: 'actas_pend',
        prioridad: 'media',
        titulo: `${actasPendientes.length} actas pendientes de firma/revisión`,
        detalle: `Estados: ${actasPendientes.map((a: any) => a.estado).slice(0, 3).join(', ')}`,
        accion: 'actas',
        count: actasPendientes.length,
      });
    }
    if (candidatosPendientes.length > 0 && currentUser?.tipoPerfil !== 'PROFESIONAL') {
      items.push({
        id: 'candidatos_pend',
        prioridad: 'media',
        titulo: `${candidatosPendientes.length} candidatos por revisar`,
        detalle: `Nuevos y documentación pendiente`,
        accion: 'candidatos',
        count: candidatosPendientes.length,
      });
    }
    return items.sort((a, b) => {
      const ord = { critica: 0, alta: 1, media: 2 };
      return ord[a.prioridad] - ord[b.prioridad];
    });
  }, [
    cobrosPendientesStats,
    morosidadStats,
    incidenciasStats,
    gastosPendientes,
    contratosStats,
    polizasAlertas,
    actasPendientes,
    candidatosPendientes,
    currentUser?.tipoPerfil,
  ]);

  const isProfesional = currentUser?.tipoPerfil === 'PROFESIONAL';

  // Si no hay datos en absoluto y no está cargando, mostrar vacío informativo global (no 0 sustituto)
  const hasAnyData = inmuebles.length > 0 || contratos.length > 0 || cobros.length > 0 || gastos.length > 0 || incidencias.length > 0;

  return (
    <div className="space-y-6">
      {/* CABECERA EJECUTIVA */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-5 sm:p-7 text-white shadow-lg relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-24 translate-x-24 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl translate-y-20 -translate-x-20 pointer-events-none" />
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Centro de Control Ejecutivo
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-200 border border-emerald-400/20">
                  <Activity className="w-3 h-3" />
                  Datos reales — {currentUser?.tipoPerfil || 'SISTEMA'}
                </span>
                <span className="text-[11px] text-slate-400">
                  {fechaAhora.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">Panel Ejecutivo del ERP Inmobiliario</h1>
              <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
                Visión consolidada de patrimonio, ocupación, tesorería, cobros, gastos, incidencias y operaciones — todo conectado a fuentes reales existentes sin datos ficticios.
                {currentUser ? ` Sesión: ${currentUser.nombre} (${currentUser.email})` : ''} · Propietarios: {propietarios.length || '—'} · Cartera scoped: {inmuebles.length} inmuebles
              </p>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Periodo análisis:</label>
                <select
                  value={periodoFiltro}
                  onChange={(e) => setPeriodoFiltro(e.target.value as PeriodoFiltro)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-white rounded-xl text-xs font-semibold focus:border-blue-500 outline-none"
                >
                  <option value="MES_ACTUAL">Mes actual</option>
                  <option value="ULT_3M">Últimos 3 meses</option>
                  <option value="ULT_6M">Últimos 6 meses</option>
                  <option value="ANO_ACTUAL">Año actual</option>
                  <option value="ULT_12M">Últimos 12 meses</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => onSelectSection('cobros')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors">
                  <Receipt className="w-3.5 h-3.5" /> Cobros
                </button>
                <button onClick={() => onSelectSection('gastos')} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors">
                  <TrendingDown className="w-3.5 h-3.5" /> Gastos
                </button>
                <button onClick={() => onSelectSection('incidencias')} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors">
                  <Wrench className="w-3.5 h-3.5" /> Incidencias
                </button>
                <button onClick={() => onSelectSection('inmuebles')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors">
                  <Building2 className="w-3.5 h-3.5" /> Inmuebles
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ESTADOS GLOBALES CARGA/ERROR/VACÍO */}
      {loadingMain || loadingOps ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs animate-pulse">
              <div className="h-3 bg-slate-200 rounded w-1/2 mb-3" />
              <div className="h-7 bg-slate-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : !hasAnyData ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-2xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-slate-900">Sin datos suficientes para el centro de control</h3>
          <p className="text-sm text-slate-500 max-w-lg mx-auto">
            Aún no hay inmuebles, contratos o movimientos registrados en tu cartera. Añade tu primer inmueble y formaliza un contrato para activar los KPIs reales.
            No se muestran datos ficticios ni valores 0 como sustituto de información no obtenida.
          </p>
          <button onClick={() => onSelectSection('inmuebles')} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700">
            Ir a Inmuebles
          </button>
        </div>
      ) : null}

      {errorOps && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">Error cargando operaciones</p>
            <p className="text-rose-700">{errorOps} — Se muestran KPIs con datos principales disponibles.</p>
          </div>
        </div>
      )}

      {/* KPIs PRINCIPALES — solo datos reales, navegación a módulos existentes */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        {/* Total inmuebles */}
        <button
          onClick={() => onSelectSection('inmuebles')}
          className="text-left bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Inmuebles</span>
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center group-hover:bg-blue-600 transition-colors">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          {inmuebles.length === 0 ? (
            <div className="text-xs text-slate-400">Sin inmuebles registrados</div>
          ) : (
            <>
              <p className="text-2xl font-black text-slate-900">{inmueblesStats.total}</p>
              <p className="text-[11px] text-slate-500 mt-1">{inmueblesStats.ocupados} alquilados · {inmueblesStats.vacios} libres</p>
            </>
          )}
        </button>

        {/* Ocupación */}
        <button
          onClick={() => onSelectSection('inmuebles')}
          className="text-left bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Ocupación</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Home className="w-4 h-4" />
            </div>
          </div>
          {inmueblesStats.total === 0 ? (
            <div className="text-xs text-slate-400">Sin datos de ocupación</div>
          ) : inmueblesStats.porcentajeOcupacion === null ? (
            <div className="text-xs text-slate-400">Datos insuficientes</div>
          ) : (
            <>
              <p className="text-2xl font-black text-emerald-700">{inmueblesStats.porcentajeOcupacion}%</p>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${inmueblesStats.porcentajeOcupacion}%` }} />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{inmueblesStats.ocupados}/{inmueblesStats.total} ocupados</p>
            </>
          )}
        </button>

        {/* Ingresos cobrados */}
        <button
          onClick={() => onSelectSection('cobros')}
          className="text-left bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all group"
          disabled={isProfesional}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Ingresos cobrados</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          {isProfesional ? (
            <div className="text-xs text-slate-400">No disponible para perfil profesional</div>
          ) : cobros.length === 0 ? (
            <div className="text-xs text-slate-400">Sin cobros registrados</div>
          ) : (
            <>
              <p className="text-xl font-black text-slate-900">{formatEuro(resumenCobros.totalRecibido)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Previsto {formatEuro(resumenCobros.totalPrevisto)} · {resumenCobros.porcentajeCobrado}% cobrado</p>
            </>
          )}
        </button>

        {/* Gastos pagados */}
        <button
          onClick={() => onSelectSection('gastos')}
          className="text-left bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all group"
          disabled={isProfesional}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Gastos pagados</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          {isProfesional ? (
            <div className="text-xs text-slate-400">No disponible para perfil profesional</div>
          ) : gastos.length === 0 ? (
            <div className="text-xs text-slate-400">Sin gastos registrados</div>
          ) : (
            <>
              <p className="text-xl font-black text-slate-900">{formatEuro(resumenGastosMemo.salidaCajaPagada)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Expl. {formatEuro(resumenGastosMemo.explotacionPagado)} · Fin. {formatEuro(resumenGastosMemo.financiacionPagado)}</p>
            </>
          )}
        </button>

        {/* Cobros pendientes */}
        <button
          onClick={() => onSelectSection('cobros')}
          className="text-left bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-2xs hover:shadow-md transition-all group"
          disabled={isProfesional}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Cobros pendientes</span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          {isProfesional ? (
            <div className="text-xs text-amber-700/70">No disponible</div>
          ) : cobros.length === 0 ? (
            <div className="text-xs text-amber-700/70">Sin datos de cobros</div>
          ) : (
            <>
              <p className="text-2xl font-black text-amber-800">{cobrosPendientesStats.count}</p>
              <p className="text-[11px] text-amber-800/80 mt-1">{formatEuro(cobrosPendientesStats.importePendiente)} por cobrar</p>
            </>
          )}
        </button>

        {/* Morosidad */}
        <button
          onClick={() => onSelectSection('cobros')}
          className="text-left bg-white p-4 rounded-2xl border border-rose-200 bg-rose-50/30 shadow-2xs hover:shadow-md transition-all group"
          disabled={isProfesional}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">Morosidad</span>
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          {isProfesional ? (
            <div className="text-xs text-rose-700/70">No disponible</div>
          ) : cobros.length === 0 ? (
            <div className="text-xs text-rose-700/70">Sin datos de morosidad</div>
          ) : morosidadStats.totalCount === 0 ? (
            <>
              <p className="text-xl font-black text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-5 h-5" /> 0</p>
              <p className="text-[11px] text-emerald-700 mt-1">Sin morosidad detectada</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-black text-rose-800">{morosidadStats.totalCount}</p>
              <p className="text-[11px] text-rose-800/80 mt-1">{formatEuro(morosidadStats.totalImporte)} en retraso</p>
            </>
          )}
        </button>
      </div>

      {/* BLOQUE REQUIERE TU ATENCIÓN — prioridad real */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Requiere tu atención
            {requiereAtencion.length > 0 && (
              <span className="ml-2 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {requiereAtencion.length} alertas
              </span>
            )}
          </h2>
          <span className="text-[11px] text-slate-500">Ordenado por criticidad real — fuentes: cobrosEngine, incidencias, gastos, contratos, pólizas, actas</span>
        </div>
        {requiereAtencion.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Sin alertas críticas</p>
            <p className="text-xs text-slate-500">Todos los circuitos operativos al día según datos reales actuales.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {requiereAtencion.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelectSection(item.accion)}
                className={`text-left p-3.5 rounded-xl border flex items-start gap-3 hover:shadow-sm transition-all ${
                  item.prioridad === 'critica'
                    ? 'bg-rose-50/60 border-rose-200 hover:border-rose-300'
                    : item.prioridad === 'alta'
                    ? 'bg-amber-50/60 border-amber-200 hover:border-amber-300'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    item.prioridad === 'critica' ? 'bg-rose-600 text-white' : item.prioridad === 'alta' ? 'bg-amber-600 text-white' : 'bg-slate-700 text-white'
                  }`}
                >
                  {item.prioridad === 'critica' ? <AlertTriangle className="w-4 h-4" /> : item.prioridad === 'alta' ? <Clock className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 leading-snug">{item.titulo}</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.detalle}</p>
                  <span className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-blue-700 hover:underline">
                    Ir a {item.accion} <ArrowUpRight className="w-3 h-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* BLOQUE FINANCIERO */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Banknote className="w-5 h-5 text-blue-600" />
                Financiero — Ingresos, gastos, tesorería
              </h2>
              <span className="text-[11px] text-slate-500">Fuentes: cobrosEngine.calcularResumenCobros + gastosEngine.resumenGastos</span>
            </div>

            {isProfesional ? (
              <div className="p-6 text-center border border-dashed rounded-xl text-xs text-slate-500">Financiero no disponible para perfil profesional por aislamiento RBAC.</div>
            ) : cobros.length === 0 && gastos.length === 0 ? (
              <div className="p-6 text-center border border-dashed rounded-xl">
                <p className="text-sm font-semibold text-slate-700">Sin datos financieros suficientes</p>
                <p className="text-xs text-slate-500 mt-1">Registra cobros y gastos reales para activar el bloque financiero. No se muestran gráficos ficticios.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <p className="text-[11px] font-bold uppercase text-blue-800">Ingresos cobrados</p>
                    <p className="text-lg font-black text-blue-900 mt-1">{formatEuro(tesoreria.ingresosCobrados)}</p>
                    <p className="text-[11px] text-blue-700 mt-0.5">{resumenCobros.countCobrados} periodos cobrados</p>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-100">
                    <p className="text-[11px] font-bold uppercase text-rose-800">Gastos pagados</p>
                    <p className="text-lg font-black text-rose-900 mt-1">{formatEuro(tesoreria.gastosPagados)}</p>
                    <p className="text-[11px] text-rose-700 mt-0.5">{gastos.filter((g) => g.estado === 'PAGADO').length} apuntes pagados</p>
                  </div>
                  <div className={`p-3 rounded-xl border ${tesoreria.saldo >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                    <p className={`text-[11px] font-bold uppercase ${tesoreria.saldo >= 0 ? 'text-emerald-800' : 'text-amber-800'}`}>Tesorería neta (derivada)</p>
                    <p className={`text-lg font-black mt-1 ${tesoreria.saldo >= 0 ? 'text-emerald-900' : 'text-amber-900'}`}>{formatEuro(tesoreria.saldo)}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">Ingresos - Gastos (cálculo derivado claro)</p>
                  </div>
                </div>

                {/* Evolución mensual solo si datos suficientes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-slate-600" /> Evolución {periodoFiltro.replace('_', ' ').toLowerCase()}
                    </h3>
                    <span className="text-[11px] text-slate-500">Gráfico solo si datos suficientes — sin datos ficticios</span>
                  </div>
                  {evolucionMensual.every((m) => m.ingresos === 0 && m.gastos === 0) ? (
                    <div className="p-4 text-center border border-dashed rounded-xl text-xs text-slate-500">Sin movimientos en el periodo seleccionado.</div>
                  ) : (
                    <div className="space-y-2">
                      {evolucionMensual.map((m) => (
                        <div key={m.key} className="flex items-center gap-3 text-xs">
                          <span className="w-10 font-semibold text-slate-700 shrink-0">{m.label}</span>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                              <div className="h-full bg-blue-600" style={{ width: `${maxEvolucion > 0 ? (m.ingresos / maxEvolucion) * 100 : 0}%` }} title={`Ingresos ${formatEuro(m.ingresos)}`} />
                            </div>
                            <span className="w-20 text-right font-medium text-blue-800">{formatEuro(m.ingresos)}</span>
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                              <div className="h-full bg-rose-500" style={{ width: `${maxEvolucion > 0 ? (m.gastos / maxEvolucion) * 100 : 0}%` }} title={`Gastos ${formatEuro(m.gastos)}`} />
                            </div>
                            <span className="w-20 text-right font-medium text-rose-800">{formatEuro(m.gastos)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1">
                        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-600 rounded-sm inline-block" /> Ingresos cobrados</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-rose-500 rounded-sm inline-block" /> Gastos pagados</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Detalle cobros por estado */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="font-bold text-slate-700">Cobrados</p>
                    <p className="text-sm font-black text-slate-900">{resumenCobros.countCobrados} · {formatEuro(resumenCobros.totalRecibido)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="font-bold text-amber-800">Pendientes</p>
                    <p className="text-sm font-black text-amber-900">{resumenCobros.countPendientes} · {formatEuro(resumenCobros.totalPendiente)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                    <p className="font-bold text-rose-800">Retrasados</p>
                    <p className="text-sm font-black text-rose-900">{resumenCobros.countRetrasados} · {formatEuro(resumenCobros.totalRetrasado)}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
                    <p className="font-bold text-purple-800">Incidencias</p>
                    <p className="text-sm font-black text-purple-900">{resumenCobros.countIncidencias} · {formatEuro(resumenCobros.totalIncidencias)}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RESUMEN INMUEBLES */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-slate-700" />
                Resumen de inmuebles
              </h2>
              <button onClick={() => onSelectSection('inmuebles')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                Ver todo <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
            {inmuebles.length === 0 ? (
              <div className="p-6 text-center border border-dashed rounded-xl text-xs text-slate-500">Sin inmuebles en cartera. Fuente: colección inmuebles.</div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-xl bg-slate-50 border">
                    <p className="text-2xl font-black text-slate-900">{inmueblesStats.total}</p>
                    <p className="text-[11px] text-slate-500 uppercase font-bold">Total</p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                    <p className="text-2xl font-black text-emerald-800">{inmueblesStats.ocupados}</p>
                    <p className="text-[11px] text-emerald-700 uppercase font-bold">Ocupados</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-100 border">
                    <p className="text-2xl font-black text-slate-800">{inmueblesStats.vacios}</p>
                    <p className="text-[11px] text-slate-600 uppercase font-bold">Vacíos</p>
                  </div>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {inmuebles.slice(0, 6).map((inm) => (
                    <div key={inm.id} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/60">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{inm.direccion}</p>
                        <p className="text-[11px] text-slate-500 truncate">{inm.ciudad} · {inm.modalidadAlquiler || 'completo'} · {inm.estado}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-xs font-bold text-slate-900">{formatEuro(inm.precio)}/mes</p>
                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${inm.estado === 'alquilado' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                          {inm.estado}
                        </span>
                      </div>
                    </div>
                  ))}
                  {inmuebles.length > 6 && <p className="text-[11px] text-slate-500 text-center">Y {inmuebles.length - 6} más…</p>}
                </div>
                {inmueblesStats.habitaciones > 0 && (
                  <p className="text-[11px] text-slate-500">Modalidad habitaciones: {inmueblesStats.habitaciones} inmuebles — Fuente: Inmueble.modalidadAlquiler</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: OPERACIONES + ACTIVIDAD + IA PREPARADO */}
        <div className="space-y-6">
          {/* Operaciones */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
            <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
              <ClipboardList className="w-5 h-5 text-indigo-600" />
              Operaciones
            </h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Incidencias</p>
                  <button onClick={() => onSelectSection('incidencias')} className="text-[11px] text-blue-600 font-bold hover:underline">Ver</button>
                </div>
                {incidencias.length === 0 ? (
                  <p className="text-xs text-slate-400 border border-dashed rounded-xl p-3 text-center">Sin incidencias registradas — Fuente: colección incidencias</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 text-xs text-center">
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-100"><p className="font-black text-amber-900">{incidenciasStats.abiertas.length}</p><p className="text-[10px] text-amber-800">Abiertas</p></div>
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-100"><p className="font-black text-rose-900">{incidenciasStats.urgentes.length}</p><p className="text-[10px] text-rose-800">Urgentes</p></div>
                      <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-100"><p className="font-black text-emerald-900">{incidenciasStats.enCurso.length}</p><p className="text-[10px] text-emerald-800">En curso</p></div>
                    </div>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {incidenciasStats.abiertas.slice(0, 3).map((inc) => (
                        <div key={inc.id} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                          <p className="font-semibold text-slate-900 truncate">{inc.titulo}</p>
                          <p className="text-[11px] text-slate-500 truncate">{inc.inmuebleDireccion || inc.inmuebleId} · {inc.prioridad}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Tareas mantenimiento</p>
                  <button onClick={() => onSelectSection('incidencias')} className="text-[11px] text-blue-600 font-bold hover:underline">Ver</button>
                </div>
                {tareas.length === 0 ? (
                  <p className="text-xs text-slate-400 border border-dashed rounded-xl p-3 text-center">Sin tareas programadas — Fuente: tareas_mantenimiento</p>
                ) : (
                  <div className="space-y-1.5">
                    {tareas.slice(0, 3).map((t) => (
                      <div key={t.id} className="p-2 rounded-lg bg-slate-50 border text-xs">
                        <p className="font-semibold truncate">{t.titulo}</p>
                        <p className="text-[11px] text-slate-500">Próx: {formatFechaCorta(t.proximaFecha)} · {t.periodicidad}</p>
                      </div>
                    ))}
                    {tareas.length > 3 && <p className="text-[11px] text-slate-500 text-center">+{tareas.length - 3} más</p>}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Trabajos profesionales</p>
                </div>
                {trabajos.length === 0 ? (
                  <p className="text-xs text-slate-400 border border-dashed rounded-xl p-3 text-center">Sin órdenes de trabajo — Fuente: trabajos_profesionales</p>
                ) : (
                  <div className="space-y-1.5">
                    {trabajos.slice(0, 3).map((tr) => (
                      <div key={tr.id} className="p-2 rounded-lg bg-slate-50 border text-xs">
                        <p className="font-semibold truncate">{tr.titulo} · {tr.estado}</p>
                        <p className="text-[11px] text-slate-500 truncate">{tr.profesionalNombre || 'Sin asignar'} · {formatEuro(tr.importeEstimado)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Pólizas y seguros</p>
                  <button onClick={() => onSelectSection('polizas')} className="text-[11px] text-blue-600 font-bold hover:underline">Ver</button>
                </div>
                {polizas.length === 0 ? (
                  <p className="text-xs text-slate-400 border border-dashed rounded-xl p-3 text-center">Sin pólizas registradas — Fuente: polizas_seguros</p>
                ) : (
                  <div className="text-xs space-y-1">
                    <p>{polizas.length} pólizas totales · {polizasAlertas.proximas.length} próximas a vencer · {polizasAlertas.vencidas.length} vencidas</p>
                    {polizasAlertas.proximas.slice(0, 2).map((p) => (
                      <div key={p.id} className="p-2 rounded-lg bg-amber-50 border border-amber-100">
                        <p className="font-semibold">{p.aseguradora} · {p.numeroPoliza}</p>
                        <p className="text-[11px]">Vence {formatFechaCorta(p.fechaVencimiento)} ({diasHasta(p.fechaVencimiento)} días)</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Actas y recomercialización</p>
                </div>
                <div className="text-xs space-y-1.5">
                  <p>Actas: {actas.length} totales · {actasPendientes.length} pendientes firma — Fuente: actas</p>
                  <p>Recomercialización: {expedientes.length} expedientes — Fuente: expedientes_recomercializacion</p>
                </div>
              </div>
            </div>
          </div>

          {/* Actividad reciente */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5">
            <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-slate-700" />
              Actividad reciente
            </h2>
            {actividadReciente.length === 0 ? (
              <div className="p-4 text-center border border-dashed rounded-xl text-xs text-slate-500">
                Sin actividad reciente registrada — Fuente: audit_logs / historial contratos/gastos/incidencias
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {actividadReciente.map((act) => (
                  <div key={act.id} className="flex gap-2.5 p-2.5 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                      {act.tipo === 'contrato' ? <FileText className="w-3.5 h-3.5" /> : act.tipo === 'gasto' ? <Euro className="w-3.5 h-3.5" /> : act.tipo === 'incidencia' ? <Wrench className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{act.titulo}</p>
                      <p className="text-[11px] text-slate-600 leading-snug line-clamp-2">{act.detalle}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{formatFechaCorta(act.fecha)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-3">Fuente: {auditLogs.length > 0 ? 'audit_logs (canónica registrarAuditoriaFirestore)' : 'contratos/gastos/incidencias (fallback real)'} — Sin datos ficticios</p>
          </div>

          {/* Preparado para IA */}
          <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl border border-indigo-100 p-5">
            <h2 className="font-bold text-indigo-900 flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Asistente contextual IA — Preparado
            </h2>
            <p className="text-xs text-indigo-800 leading-relaxed">
              Hueco arquitectónico reservado para futuro asistente contextual que consumirá los mismos motores existentes (cobrosEngine, gastosEngine, incidenciasEngine, reportingEngine) sin duplicar lógica ni crear segunda fuente de verdad.
            </p>
            <div className="mt-3 p-2.5 rounded-xl bg-white border border-indigo-100 text-[11px] text-slate-600 space-y-1">
              <p>• Entrada: contexto cartera (inmuebles, contratos, cobros, gastos, incidencias, pólizas, actas)</p>
              <p>• Salida: insights, alertas priorizadas, sugerencias de acción con trazabilidad</p>
              <p>• No implementado ahora por especificación — solo preparado</p>
            </div>
          </div>
        </div>
      </div>

      {/* PIE: navegación rápida y confirmación no ficticios */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-700">Navegación rápida a módulos existentes:</span>
          <button onClick={() => onSelectSection('inmuebles')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border text-slate-700 font-semibold">Inmuebles</button>
          <button onClick={() => onSelectSection('formalizacion')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border text-slate-700 font-semibold">Contratos</button>
          <button onClick={() => onSelectSection('cobros')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border text-slate-700 font-semibold">Cobros</button>
          <button onClick={() => onSelectSection('gastos')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border text-slate-700 font-semibold">Gastos</button>
          <button onClick={() => onSelectSection('incidencias')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border text-slate-700 font-semibold">Incidencias</button>
          <button onClick={() => onSelectSection('polizas')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border text-slate-700 font-semibold">Pólizas</button>
          <button onClick={() => onSelectSection('actas')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border text-slate-700 font-semibold">Actas</button>
          <button onClick={() => onSelectSection('conciliacion')} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border text-slate-700 font-semibold">Conciliación</button>
        </div>
        <span className="text-[11px] text-slate-500">Arquitectura: reutiliza servicios existentes, sin segunda fuente verdad, sin localStorage sensible, permisos R1/R2/R3/R4 intactos, sin modificar firestore.rules.</span>
      </div>
    </div>
  );
};

export default DashboardEjecutivoSection;
