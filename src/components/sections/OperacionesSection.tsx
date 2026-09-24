/**
 * CENTRO DE OPERACIONES Y MANTENIMIENTO — capa de coordinación/visualización.
 *
 * Solo lectura y agregación sobre entidades existentes (incidencias, tareas de
 * mantenimiento, trabajos/OT, presupuestos, profesionales, reformas, garantías,
 * pólizas, siniestros, gastos). No crea colecciones ni cambia estados: toda
 * clasificación vive en operacionesEngine (que reutiliza los motores
 * existentes) y el detalle de cada registro se abre con los modales canónicos
 * o navegando a la sección propietaria del módulo.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  ChevronRight,
  Clock,
  Euro,
  Eye,
  FileText,
  Hammer,
  LifeBuoy,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import type {
  Gasto,
  GarantiaReparacion,
  Incidencia,
  Inmueble,
  NecesidadReforma,
  PolizaSeguro,
  PresupuestoProfesional,
  Profesional,
  Propietario,
  ProyectoReforma,
  SectionType,
  Siniestro,
  TareaMantenimiento,
  TrabajoProfesional,
  UsuarioApp,
  ValoracionProfesionalTrabajo,
} from '../../types';
import {
  saveIncidenciaFirestore,
  savePolizaFirestore,
  saveSiniestroFirestore,
  subscribeGarantiasReparacion,
  subscribeIncidencias,
  subscribeNecesidadesReforma,
  subscribePolizas,
  subscribePresupuestosProfesionales,
  subscribeProyectosReforma,
  subscribeSiniestros,
  subscribeTareasMantenimiento,
  subscribeTrabajosProfesionales,
  subscribeValoracionesProfesionales,
} from '../../lib/firebase';
import {
  agendaOperativa,
  cargaProfesionales,
  costeOperativo,
  diasEntreDias,
  filtrarPorAlcance,
  filtrarSiniestrosPorAlcance,
  garantiasProximasVencer,
  garantiasVigentes,
  incidenciasCriticas,
  incidenciasNoCerradas,
  necesidadesAbiertas,
  presupuestosPendientesDecision,
  proyectosActivos,
  resumenOperativo,
  siniestrosAbiertos,
  tareasProximas,
  tareasVencidas,
  trabajosAbiertos,
  trabajosBloqueados,
  trabajosSinProfesional,
  type AlcanceOperativa,
  type EntidadAgenda,
  type EventoAgendaOperativa,
} from '../../utils/operacionesEngine';
import { calcularTotalesProyectoReforma } from '../../utils/reformasEngine';
import { detectarPolizasProximasVencer } from '../../utils/segurosEngine';
import { DetalleIncidenciaModal } from '../modals/DetalleIncidenciaModal';
import { DetallePolizaModal } from '../modals/DetallePolizaModal';
import { DetallePresupuestoProfesionalModal } from '../modals/DetallePresupuestoProfesionalModal';
import { DetalleProfesionalModal } from '../modals/DetalleProfesionalModal';
import { DetalleProyectoReformaModal } from '../modals/DetalleProyectoReformaModal';
import { DetalleTrabajoProfesionalModal } from '../modals/DetalleTrabajoProfesionalModal';
import { NecesidadReformaModal } from '../modals/NecesidadReformaModal';
import {
  ESTADOS_SINIESTRO_LABELS,
  SiniestroModal,
} from '../modals/SiniestroModal';

interface OperacionesSectionProps {
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  profesionales: Profesional[];
  gastos: Gasto[];
  currentUser?: UsuarioApp;
  onSelectSection: (section: SectionType) => void;
}

const fmtEur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function fmtFecha(dia?: string): string {
  const d = (dia || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

function badgePrioridad(prioridad?: string): string {
  switch (prioridad) {
    case 'URGENTE':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    case 'ALTA':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'MEDIA':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'NORMAL':
      return 'bg-sky-100 text-sky-800 border-sky-300';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-300';
  }
}

const TIPO_ATENCION: Record<string, { label: string; cls: string }> = {
  INCIDENCIA: { label: 'Incidencia', cls: 'bg-rose-100 text-rose-800 border-rose-300' },
  TAREA: { label: 'Tarea', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  TRABAJO: { label: 'OT', cls: 'bg-orange-100 text-orange-800 border-orange-300' },
  POLIZA: { label: 'Póliza', cls: 'bg-sky-100 text-sky-800 border-sky-300' },
};

const TIPO_AGENDA: Record<EventoAgendaOperativa['tipo'], string> = {
  TAREA_VENCIDA: 'Tarea vencida',
  COMPROMISO_INCIDENCIA: 'Compromiso',
  VENCIMIENTO_POLIZA: 'Vence póliza',
  TAREA_PROXIMA: 'Tarea próxima',
  FIN_GARANTIA: 'Fin garantía',
  HITO_PROYECTO: 'Hito reforma',
};

interface BloqueProps {
  id: string;
  titulo: string;
  icono: React.ReactNode;
  count: number;
  modulo?: { label: string; section: SectionType };
  onSelectSection: (section: SectionType) => void;
  vacio: string;
  children: React.ReactNode;
}

const Bloque: React.FC<BloqueProps> = ({
  id,
  titulo,
  icono,
  count,
  modulo,
  onSelectSection,
  vacio,
  children,
}) => (
  <div
    id={id}
    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden scroll-mt-4"
  >
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
      <div className="flex items-center gap-2.5">
        <span className="text-slate-500">{icono}</span>
        <h3 className="font-semibold text-slate-800 text-sm">{titulo}</h3>
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
          {count}
        </span>
      </div>
      {modulo && (
        <button
          onClick={() => onSelectSection(modulo.section)}
          className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1"
        >
          {modulo.label}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
    {count === 0 ? (
      <p className="px-5 py-6 text-sm text-slate-400">{vacio}</p>
    ) : (
      children
    )}
  </div>
);

export const OperacionesSection: React.FC<OperacionesSectionProps> = ({
  inmuebles,
  propietarios,
  profesionales,
  gastos,
  currentUser,
  onSelectSection,
}) => {
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [tareas, setTareas] = useState<TareaMantenimiento[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoProfesional[]>([]);
  const [presupuestos, setPresupuestos] = useState<PresupuestoProfesional[]>([]);
  const [garantias, setGarantias] = useState<GarantiaReparacion[]>([]);
  const [siniestros, setSiniestros] = useState<Siniestro[]>([]);
  const [polizas, setPolizas] = useState<PolizaSeguro[]>([]);
  const [necesidades, setNecesidades] = useState<NecesidadReforma[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoReforma[]>([]);
  const [valoraciones, setValoraciones] = useState<ValoracionProfesionalTrabajo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Selección para modales de detalle (componentes canónicos existentes)
  const [incidenciaSel, setIncidenciaSel] = useState<Incidencia | null>(null);
  const [trabajoSel, setTrabajoSel] = useState<TrabajoProfesional | null>(null);
  const [presupuestoSel, setPresupuestoSel] = useState<PresupuestoProfesional | null>(null);
  const [proyectoSel, setProyectoSel] = useState<ProyectoReforma | null>(null);
  const [necesidadSel, setNecesidadSel] = useState<NecesidadReforma | null>(null);
  const [polizaSel, setPolizaSel] = useState<PolizaSeguro | null>(null);
  const [profesionalSel, setProfesionalSel] = useState<Profesional | null>(null);
  const [incidenciaParaSiniestro, setIncidenciaParaSiniestro] = useState<Incidencia | null>(null);
  const [siniestroToEdit, setSiniestroToEdit] = useState<Siniestro | null>(null);
  const [isSiniestroModalOpen, setIsSiniestroModalOpen] = useState<boolean>(false);

  // Suscripciones en tiempo real (mismo patrón que IncidenciasSection)
  useEffect(() => {
    setLoading(true);
    const unsubIncidencias = subscribeIncidencias((items) => {
      setIncidencias(items);
      setLoading(false);
    });
    const unsubTareas = subscribeTareasMantenimiento(setTareas);
    const unsubTrabajos = subscribeTrabajosProfesionales(setTrabajos);
    const unsubPresupuestos = subscribePresupuestosProfesionales(setPresupuestos);
    const unsubGarantias = subscribeGarantiasReparacion(setGarantias);
    const unsubSiniestros = subscribeSiniestros(setSiniestros);
    const unsubPolizas = subscribePolizas(setPolizas);
    const unsubNecesidades = subscribeNecesidadesReforma(setNecesidades);
    const unsubProyectos = subscribeProyectosReforma(setProyectos);
    return () => {
      unsubIncidencias();
      unsubTareas();
      unsubTrabajos();
      unsubPresupuestos();
      unsubGarantias();
      unsubSiniestros();
      unsubPolizas();
      unsubNecesidades();
      unsubProyectos();
    };
  }, []);

  // §10.9: valoraciones acotadas por propietario (where propietarioId) con el
  // mismo ámbito de propietario que ya usa la sección (tipoPerfil/propietarioId).
  useEffect(() => {
    const unsubValoraciones = subscribeValoracionesProfesionales(setValoraciones, {
      tipoPerfil: currentUser?.tipoPerfil,
      propietarioId: currentUser?.propietarioId,
    });
    return () => {
      unsubValoraciones();
    };
  }, [currentUser?.tipoPerfil, currentUser?.propietarioId]);

  // Alcance RBAC en profundidad sobre listas ya acotadas por App
  const alcance: AlcanceOperativa = useMemo(
    () => ({
      esAdmin: currentUser?.tipoPerfil === 'ADMINISTRADOR',
      propietarioId: currentUser?.propietarioId ?? null,
      inmuebleIdsPermitidos: inmuebles.map((i) => i.id),
    }),
    [currentUser, inmuebles]
  );

  const incidenciasScope = useMemo(
    () => filtrarPorAlcance(incidencias, alcance),
    [incidencias, alcance]
  );
  const tareasScope = useMemo(() => filtrarPorAlcance(tareas, alcance), [tareas, alcance]);
  const trabajosScope = useMemo(
    () => filtrarPorAlcance(trabajos, alcance),
    [trabajos, alcance]
  );
  const presupuestosScope = useMemo(
    () => filtrarPorAlcance(presupuestos, alcance),
    [presupuestos, alcance]
  );
  const garantiasScope = useMemo(
    () => filtrarPorAlcance(garantias, alcance),
    [garantias, alcance]
  );
  const polizasScope = useMemo(
    () => filtrarPorAlcance(polizas, alcance),
    [polizas, alcance]
  );
  const necesidadesScope = useMemo(
    () => filtrarPorAlcance(necesidades, alcance),
    [necesidades, alcance]
  );
  const proyectosScope = useMemo(
    () => filtrarPorAlcance(proyectos, alcance),
    [proyectos, alcance]
  );
  const valoracionesScope = useMemo(
    () => filtrarPorAlcance(valoraciones, alcance),
    [valoraciones, alcance]
  );
  const siniestrosScope = useMemo(
    () => filtrarSiniestrosPorAlcance(siniestros, incidenciasScope, polizasScope),
    [siniestros, incidenciasScope, polizasScope]
  );

  const hoy = useMemo(() => new Date(), []);
  const hoyDia = hoy.toISOString().slice(0, 10);

  const resumen = useMemo(
    () =>
      resumenOperativo(
        {
          incidencias: incidenciasScope,
          tareas: tareasScope,
          trabajos: trabajosScope,
          presupuestos: presupuestosScope,
          polizas: polizasScope,
          garantias: garantiasScope,
          siniestros: siniestrosScope,
          necesidades: necesidadesScope,
          proyectos: proyectosScope,
          gastos,
        },
        hoy
      ),
    [
      incidenciasScope,
      tareasScope,
      trabajosScope,
      presupuestosScope,
      polizasScope,
      garantiasScope,
      siniestrosScope,
      necesidadesScope,
      proyectosScope,
      gastos,
      hoy,
    ]
  );

  const criticas = useMemo(
    () => incidenciasCriticas(incidenciasScope, hoy),
    [incidenciasScope, hoy]
  );
  const abiertas = useMemo(
    () => incidenciasNoCerradas(incidenciasScope),
    [incidenciasScope]
  );
  const agenda = useMemo(
    () =>
      agendaOperativa(
        {
          incidencias: incidenciasScope,
          tareas: tareasScope,
          polizas: polizasScope,
          garantias: garantiasScope,
          proyectos: proyectosScope,
        },
        hoy
      ),
    [incidenciasScope, tareasScope, polizasScope, garantiasScope, proyectosScope, hoy]
  );
  const alertasPoliza = useMemo(
    () => detectarPolizasProximasVencer(polizasScope),
    [polizasScope]
  );
  const carga = useMemo(
    () => cargaProfesionales(profesionales, trabajosScope),
    [profesionales, trabajosScope]
  );
  const coste = useMemo(() => costeOperativo(gastos), [gastos]);

  const tareasVenc = useMemo(() => tareasVencidas(tareasScope, hoy), [tareasScope, hoy]);
  const tareasProx = useMemo(() => tareasProximas(tareasScope, hoy), [tareasScope, hoy]);
  const trabajosAb = useMemo(() => trabajosAbiertos(trabajosScope), [trabajosScope]);
  const trabajosBloq = useMemo(() => trabajosBloqueados(trabajosScope), [trabajosScope]);
  const sinProf = useMemo(() => trabajosSinProfesional(trabajosScope), [trabajosScope]);
  const presupPend = useMemo(
    () => presupuestosPendientesDecision(presupuestosScope),
    [presupuestosScope]
  );
  const garVig = useMemo(() => garantiasVigentes(garantiasScope, hoy), [garantiasScope, hoy]);
  const garProx = useMemo(
    () => garantiasProximasVencer(garantiasScope, hoy),
    [garantiasScope, hoy]
  );
  const sinAb = useMemo(() => siniestrosAbiertos(siniestrosScope), [siniestrosScope]);
  const proyAct = useMemo(() => proyectosActivos(proyectosScope), [proyectosScope]);
  const necAb = useMemo(() => necesidadesAbiertas(necesidadesScope), [necesidadesScope]);

  const inmueblesById = useMemo(
    () => new Map(inmuebles.map((i) => [i.id, i])),
    [inmuebles]
  );
  const dirDe = (
    entidad: { inmuebleId?: string; inmuebleDireccion?: string }
  ): string =>
    entidad.inmuebleDireccion ||
    (entidad.inmuebleId
      ? inmueblesById.get(entidad.inmuebleId)?.direccion || '—'
      : '—');

  // --- Navegación al registro original (modales canónicos / secciones) ---
  const verGarantia = (g: GarantiaReparacion) => {
    const inc = g.incidenciaId
      ? incidenciasScope.find((i) => i.id === g.incidenciaId) || null
      : null;
    if (inc) {
      setIncidenciaSel(inc);
      return;
    }
    const ot = trabajosScope.find((t) => t.id === g.trabajoId) || null;
    if (ot) {
      setTrabajoSel(ot);
      return;
    }
    onSelectSection('incidencias');
  };

  const verSiniestro = (s: Siniestro) => {
    const inc = incidenciasScope.find((i) => i.id === s.incidenciaId) || null;
    if (inc) setIncidenciaSel(inc);
    else onSelectSection('polizas');
  };

  const verEventoAgenda = (ev: EventoAgendaOperativa) => {
    const porEntidad: Record<EntidadAgenda, () => void> = {
      incidencia: () => {
        const inc = incidenciasScope.find((i) => i.id === ev.entidadId);
        if (inc) setIncidenciaSel(inc);
      },
      tarea: () => onSelectSection('incidencias'),
      poliza: () => {
        const pol = polizasScope.find((p) => p.id === ev.entidadId);
        if (pol) setPolizaSel(pol);
      },
      garantia: () => {
        const gar = garantiasScope.find((g) => g.id === ev.entidadId);
        if (gar) verGarantia(gar);
      },
      proyecto: () => {
        const pro = proyectosScope.find((p) => p.id === ev.entidadId);
        if (pro) setProyectoSel(pro);
      },
    };
    porEntidad[ev.entidad]();
  };

  const handleSaveIncidencia = async (inc: Incidencia) => {
    await saveIncidenciaFirestore(inc);
  };
  const handleSaveSiniestro = async (sin: Siniestro) => {
    await saveSiniestroFirestore(sin);
  };
  const handleSavePoliza = async (pol: PolizaSeguro) => {
    await savePolizaFirestore(pol);
  };
  const handleOpenSiniestroFromDetalle = (inc: Incidencia, sin?: Siniestro) => {
    setIncidenciaParaSiniestro(inc);
    setSiniestroToEdit(sin || null);
    setIsSiniestroModalOpen(true);
  };

  // --- Lista unificada "requieren atención" ---
  interface ItemAtencion {
    key: string;
    tipo: 'INCIDENCIA' | 'TAREA' | 'TRABAJO' | 'POLIZA';
    titulo: string;
    detalle: string;
    inmueble: string;
    fecha: string;
    vencido: boolean;
    onVer: () => void;
  }
  const atencion: ItemAtencion[] = useMemo(() => {
    const items: ItemAtencion[] = [];
    for (const inc of criticas) {
      const dia = (inc.fechaCompromiso || '').slice(0, 10);
      items.push({
        key: `inc-${inc.id}`,
        tipo: 'INCIDENCIA',
        titulo: inc.titulo,
        detalle: `${inc.prioridad} · ${inc.estado}`,
        inmueble: dirDe(inc),
        fecha: dia,
        vencido: !!dia && dia < hoyDia,
        onVer: () => setIncidenciaSel(inc),
      });
    }
    for (const t of tareasVenc) {
      items.push({
        key: `tar-${t.id}`,
        tipo: 'TAREA',
        titulo: t.titulo,
        detalle: 'Mantenimiento vencido',
        inmueble: dirDe(t),
        fecha: t.proximaFecha.slice(0, 10),
        vencido: true,
        onVer: () => onSelectSection('incidencias'),
      });
    }
    for (const t of trabajosBloq) {
      items.push({
        key: `ot-${t.id}`,
        tipo: 'TRABAJO',
        titulo: t.titulo,
        detalle: t.estado === 'PENDIENTE_MATERIAL' ? 'Parada: falta material' : 'Parada: pendiente propietario',
        inmueble: dirDe(t),
        fecha: '',
        vencido: false,
        onVer: () => setTrabajoSel(t),
      });
    }
    for (const a of alertasPoliza.filter(
      (x) => x.nivelProximidad === -1 || x.nivelProximidad === 0
    )) {
      const pol = polizasScope.find((p) => p.id === a.polizaId);
      items.push({
        key: `pol-${a.polizaId}`,
        tipo: 'POLIZA',
        titulo: `Póliza ${a.polizaNumero} · ${a.aseguradora}`,
        detalle: a.diasRestantes < 0 ? 'Vencida' : 'Vence hoy',
        inmueble: a.inmuebleDireccion || '—',
        fecha: a.fechaVencimiento.slice(0, 10),
        vencido: a.diasRestantes < 0,
        onVer: () => {
          if (pol) setPolizaSel(pol);
        },
      });
    }
    return items
      .sort((x, y) => {
        if (x.vencido !== y.vencido) return x.vencido ? -1 : 1;
        const fx = x.fecha || '9999-12-31';
        const fy = y.fecha || '9999-12-31';
        return fx < fy ? -1 : fx > fy ? 1 : 0;
      })
      .slice(0, 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criticas, tareasVenc, trabajosBloq, alertasPoliza, polizasScope, hoyDia, inmueblesById]);

  const kpis: {
    label: string;
    valor: number | string;
    href: string;
    tono: string;
  }[] = [
    { label: 'Incidencias urgentes', valor: resumen.incidenciasUrgentes, href: '#op-atencion', tono: 'border-rose-200 bg-rose-50/60' },
    { label: 'Compromisos vencidos', valor: resumen.incidenciasCompromisoVencido, href: '#op-atencion', tono: 'border-rose-200 bg-rose-50/60' },
    { label: 'Tareas vencidas', valor: resumen.tareasVencidas, href: '#op-mantenimiento', tono: 'border-amber-200 bg-amber-50/60' },
    { label: 'Tareas próximas 30d', valor: resumen.tareasProximas, href: '#op-agenda', tono: 'border-slate-200 bg-white' },
    { label: 'OOTT abiertas', valor: resumen.trabajosAbiertos, href: '#op-trabajos', tono: 'border-slate-200 bg-white' },
    { label: 'OOTT bloqueadas', valor: resumen.trabajosBloqueados, href: '#op-trabajos', tono: 'border-orange-200 bg-orange-50/60' },
    { label: 'Presupuestos pendientes', valor: resumen.presupuestosPendientes, href: '#op-presupuestos', tono: 'border-slate-200 bg-white' },
    { label: 'Siniestros abiertos', valor: resumen.siniestrosAbiertos, href: '#op-seguros', tono: 'border-slate-200 bg-white' },
    { label: 'Pólizas por vencer', valor: resumen.polizasProximasVencer, href: '#op-seguros', tono: 'border-sky-200 bg-sky-50/60' },
    { label: 'Garantías vigentes', valor: resumen.garantiasVigentes, href: '#op-mantenimiento', tono: 'border-emerald-200 bg-emerald-50/60' },
    { label: 'Reformas activas', valor: resumen.proyectosActivos + resumen.necesidadesAbiertas, href: '#op-reformas', tono: 'border-slate-200 bg-white' },
    { label: 'Coste operativo', valor: fmtEur.format(resumen.costeOperativoTotal), href: '#op-costes', tono: 'border-slate-200 bg-white' },
  ];

  if (loading) {
    return (
      <div className="bg-white p-10 rounded-2xl border border-slate-200 text-center text-slate-500 text-sm">
        Cargando centro de operaciones…
      </div>
    );
  }

  const btnVer = 'shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900';

  return (
    <div className="space-y-6">
      {/* Cabecera del centro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              Centro
            </span>
            <span className="text-xs font-medium text-slate-500">
              Operaciones &amp; Mantenimiento
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-2">
            Coordinación operativa de la cartera
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {alcance.esAdmin
              ? `Visión global · ${inmuebles.length} inmuebles`
              : `Tus inmuebles en seguimiento · ${inmuebles.length}`}{' '}
            · {fmtFecha(hoyDia)} · Solo lectura: el detalle vive en cada módulo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onSelectSection('incidencias')}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Incidencias
          </button>
          <button
            onClick={() => onSelectSection('polizas')}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Pólizas
          </button>
          <button
            onClick={() => onSelectSection('gastos')}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Gastos
          </button>
          <button
            onClick={() => onSelectSection('inmuebles')}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            Inmuebles
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <a
            key={k.label}
            href={k.href}
            className={`rounded-2xl border px-4 py-3 shadow-2xs hover:shadow-sm transition-shadow ${k.tono}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {k.label}
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{k.valor}</p>
          </a>
        ))}
      </div>

      {/* Requieren atención */}
      <Bloque
        id="op-atencion"
        titulo="Requieren atención"
        icono={<AlertTriangle className="w-4 h-4" />}
        count={atencion.length}
        onSelectSection={onSelectSection}
        vacio="Sin frentes críticos: no hay urgencias, vencimientos ni OOTT bloqueadas."
      >
        <ul className="divide-y divide-slate-100">
          {atencion.map((item) => {
            const badge = TIPO_ATENCION[item.tipo];
            return (
              <li
                key={item.key}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badge.cls}`}
                >
                  {badge.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {item.titulo}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {item.detalle} · {item.inmueble}
                    {item.fecha ? ` · ${fmtFecha(item.fecha)}` : ''}
                  </p>
                </div>
                {item.vencido && (
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white">
                    Vencido
                  </span>
                )}
                <button onClick={item.onVer} className={btnVer}>
                  <Eye className="w-3.5 h-3.5" />
                  Ver
                </button>
              </li>
            );
          })}
        </ul>
      </Bloque>

      {/* Agenda 30 días */}
      <Bloque
        id="op-agenda"
        titulo="Agenda operativa · próximos 30 días"
        icono={<CalendarDays className="w-4 h-4" />}
        count={agenda.length}
        onSelectSection={onSelectSection}
        vacio="Sin hitos en los próximos 30 días."
      >
        <ul className="divide-y divide-slate-100">
          {agenda.map((ev) => (
            <li
              key={ev.id}
              className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
            >
              <span
                className={`shrink-0 w-16 text-center px-1.5 py-1 rounded-lg text-xs font-bold ${
                  ev.vencido
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {fmtFecha(ev.fecha)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {ev.titulo}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {TIPO_AGENDA[ev.tipo]}
                  {ev.detalle ? ` · ${ev.detalle}` : ''} ·{' '}
                  {ev.inmuebleDireccion || '—'}
                </p>
              </div>
              <button onClick={() => verEventoAgenda(ev)} className={btnVer}>
                <Eye className="w-3.5 h-3.5" />
                Ver
              </button>
            </li>
          ))}
        </ul>
      </Bloque>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Incidencias abiertas */}
        <Bloque
          id="op-incidencias"
          titulo="Incidencias abiertas"
          icono={<LifeBuoy className="w-4 h-4" />}
          count={abiertas.length}
          modulo={{ label: 'Abrir módulo', section: 'incidencias' }}
          onSelectSection={onSelectSection}
          vacio="Sin incidencias abiertas."
        >
          <ul className="divide-y divide-slate-100">
            {abiertas.slice(0, 8).map((inc) => (
              <li
                key={inc.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgePrioridad(inc.prioridad)}`}
                >
                  {inc.prioridad}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {inc.titulo}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {inc.estado} · {dirDe(inc)}
                    {inc.fechaCompromiso
                      ? ` · Compromiso ${fmtFecha(inc.fechaCompromiso)}`
                      : ''}
                  </p>
                </div>
                <button
                  onClick={() => setIncidenciaSel(inc)}
                  className={btnVer}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver
                </button>
              </li>
            ))}
          </ul>
          {abiertas.length > 8 && (
            <p className="px-5 py-2.5 text-xs text-slate-400 border-t border-slate-100">
              Mostrando 8 de {abiertas.length}. El listado completo está en el
              módulo de incidencias.
            </p>
          )}
        </Bloque>

        {/* Mantenimiento y garantías */}
        <Bloque
          id="op-mantenimiento"
          titulo="Mantenimiento y garantías"
          icono={<Wrench className="w-4 h-4" />}
          count={tareasVenc.length + tareasProx.length + garProx.length}
          modulo={{ label: 'Abrir módulo', section: 'incidencias' }}
          onSelectSection={onSelectSection}
          vacio="Sin tareas vencidas/próximas ni garantías por vencer."
        >
          <ul className="divide-y divide-slate-100">
            {tareasVenc.map((t) => (
              <li
                key={t.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <Clock className="w-4 h-4 text-rose-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {t.titulo}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    Vencida {fmtFecha(t.proximaFecha)} · {dirDe(t)}
                  </p>
                </div>
                <button
                  onClick={() => onSelectSection('incidencias')}
                  className={btnVer}
                >
                  Ver
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {tareasProx.slice(0, 5).map((t) => (
              <li
                key={t.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {t.titulo}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    Próxima {fmtFecha(t.proximaFecha)} · {dirDe(t)}
                  </p>
                </div>
                <button
                  onClick={() => onSelectSection('incidencias')}
                  className={btnVer}
                >
                  Ver
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
            {garProx.slice(0, 5).map((g) => (
              <li
                key={g.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {g.titulo}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    Garantía hasta {fmtFecha(g.fechaFin)} · {g.proveedor} ·{' '}
                    {dirDe(g)}
                  </p>
                </div>
                <button onClick={() => verGarantia(g)} className={btnVer}>
                  <Eye className="w-3.5 h-3.5" />
                  Ver origen
                </button>
              </li>
            ))}
          </ul>
          <p className="px-5 py-2.5 text-xs text-slate-400 border-t border-slate-100">
            {garVig.length} garantías vigentes en cartera.
          </p>
        </Bloque>

        {/* Trabajos / OOTT */}
        <Bloque
          id="op-trabajos"
          titulo="Órdenes de trabajo abiertas"
          icono={<Hammer className="w-4 h-4" />}
          count={trabajosAb.length}
          onSelectSection={onSelectSection}
          vacio="Sin órdenes de trabajo abiertas."
        >
          <ul className="divide-y divide-slate-100">
            {trabajosAb.slice(0, 8).map((t) => {
              const bloqueado =
                t.estado === 'PENDIENTE_MATERIAL' ||
                t.estado === 'PENDIENTE_PROPIETARIO';
              return (
                <li
                  key={t.id}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
                >
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgePrioridad(t.prioridad)}`}
                  >
                    {t.prioridad}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {t.titulo}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {t.estado}
                      {t.profesionalNombre
                        ? ` · ${t.profesionalNombre}`
                        : ' · Sin profesional'}{' '}
                      · {dirDe(t)}
                    </p>
                  </div>
                  {bloqueado && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-300">
                      Bloqueada
                    </span>
                  )}
                  <button onClick={() => setTrabajoSel(t)} className={btnVer}>
                    <Eye className="w-3.5 h-3.5" />
                    Ver
                  </button>
                </li>
              );
            })}
          </ul>
          {trabajosAb.length > 8 && (
            <p className="px-5 py-2.5 text-xs text-slate-400 border-t border-slate-100">
              Mostrando 8 de {trabajosAb.length}.
            </p>
          )}
          {sinProf.length > 0 && (
            <p className="px-5 py-2.5 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
              {sinProf.length} OOTT abiertas aún sin profesional asignado.
            </p>
          )}
        </Bloque>

        {/* Presupuestos pendientes */}
        <Bloque
          id="op-presupuestos"
          titulo="Presupuestos pendientes de decisión"
          icono={<FileText className="w-4 h-4" />}
          count={presupPend.length}
          onSelectSection={onSelectSection}
          vacio="Sin presupuestos pendientes de decisión."
        >
          <ul className="divide-y divide-slate-100">
            {presupPend.slice(0, 8).map((p) => (
              <li
                key={p.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {p.profesionalNombre || 'Profesional'} ·{' '}
                    {fmtEur.format(p.importeTotal)}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {p.estado} · Validez: {p.validez} · {dirDe(p)}
                  </p>
                </div>
                <button onClick={() => setPresupuestoSel(p)} className={btnVer}>
                  <Eye className="w-3.5 h-3.5" />
                  Ver
                </button>
              </li>
            ))}
          </ul>
          {presupPend.length > 8 && (
            <p className="px-5 py-2.5 text-xs text-slate-400 border-t border-slate-100">
              Mostrando 8 de {presupPend.length}.
            </p>
          )}
        </Bloque>

        {/* Reformas */}
        <Bloque
          id="op-reformas"
          titulo="Reformas en curso"
          icono={<Building2 className="w-4 h-4" />}
          count={necAb.length + proyAct.length}
          modulo={{ label: 'Abrir módulo', section: 'inmuebles' }}
          onSelectSection={onSelectSection}
          vacio="Sin necesidades ni proyectos de reforma abiertos."
        >
          <ul className="divide-y divide-slate-100">
            {proyAct.slice(0, 5).map((p) => {
              const tot = calcularTotalesProyectoReforma(p);
              return (
                <li
                  key={p.id}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {p.titulo}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      Proyecto · {p.estado} · Previsto{' '}
                      {fmtEur.format(tot.presupuestoPrevisto)} · Real{' '}
                      {fmtEur.format(tot.costeReal)} · {dirDe(p)}
                    </p>
                  </div>
                  <button onClick={() => setProyectoSel(p)} className={btnVer}>
                    <Eye className="w-3.5 h-3.5" />
                    Ver
                  </button>
                </li>
              );
            })}
            {necAb.slice(0, 5).map((n) => (
              <li
                key={n.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgePrioridad(n.prioridad)}`}
                >
                  {n.prioridad}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {n.titulo}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    Necesidad · {n.estado} · {dirDe(n)}
                  </p>
                </div>
                <button onClick={() => setNecesidadSel(n)} className={btnVer}>
                  <Eye className="w-3.5 h-3.5" />
                  Ver
                </button>
              </li>
            ))}
          </ul>
        </Bloque>

        {/* Seguros */}
        <Bloque
          id="op-seguros"
          titulo="Seguros y siniestros"
          icono={<ShieldCheck className="w-4 h-4" />}
          count={alertasPoliza.length + sinAb.length}
          modulo={{ label: 'Abrir módulo', section: 'polizas' }}
          onSelectSection={onSelectSection}
          vacio="Sin alertas de póliza ni siniestros abiertos."
        >
          <ul className="divide-y divide-slate-100">
            {alertasPoliza.slice(0, 5).map((a) => {
              const pol = polizasScope.find((p) => p.id === a.polizaId);
              return (
                <li
                  key={a.polizaId}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
                >
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                      a.diasRestantes < 0
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-sky-100 text-sky-800 border-sky-300'
                    }`}
                  >
                    {a.diasRestantes < 0
                      ? 'Vencida'
                      : a.diasRestantes === 0
                        ? 'Hoy'
                        : `${a.diasRestantes}d`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      Póliza {a.polizaNumero} · {a.aseguradora}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      Vence {fmtFecha(a.fechaVencimiento)} ·{' '}
                      {a.inmuebleDireccion || '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (pol) setPolizaSel(pol);
                    }}
                    className={btnVer}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Ver
                  </button>
                </li>
              );
            })}
            {sinAb.slice(0, 5).map((s) => {
              const etiqueta = ESTADOS_SINIESTRO_LABELS[s.estado];
              return (
                <li
                  key={s.id}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      Siniestro · {s.aseguradora}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {etiqueta?.label || s.estado} · Comunicado{' '}
                      {fmtFecha(s.fechaComunicacion)}
                    </p>
                  </div>
                  <button onClick={() => verSiniestro(s)} className={btnVer}>
                    <Eye className="w-3.5 h-3.5" />
                    Ver incidencia
                  </button>
                </li>
              );
            })}
          </ul>
        </Bloque>

        {/* Profesionales con carga */}
        <Bloque
          id="op-profesionales"
          titulo="Profesionales con OOTT activas"
          icono={<Users className="w-4 h-4" />}
          count={carga.length}
          onSelectSection={onSelectSection}
          vacio="Sin profesionales con órdenes de trabajo activas."
        >
          <ul className="divide-y divide-slate-100">
            {carga.slice(0, 8).map((c) => (
              <li
                key={c.profesional.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {c.profesional.nombreComercial}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {c.trabajosActivos} OOTT activas
                    {c.trabajosBloqueados > 0
                      ? ` · ${c.trabajosBloqueados} bloqueadas`
                      : ''}
                  </p>
                </div>
                <button
                  onClick={() => setProfesionalSel(c.profesional)}
                  className={btnVer}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Ver
                </button>
              </li>
            ))}
          </ul>
        </Bloque>

        {/* Costes operativos */}
        <Bloque
          id="op-costes"
          titulo="Coste operativo del circuito"
          icono={<Euro className="w-4 h-4" />}
          count={coste.count}
          modulo={{ label: 'Abrir módulo', section: 'gastos' }}
          onSelectSection={onSelectSection}
          vacio="Sin gastos vinculados al circuito operativo (reparación, OOTT, incidencias, seguros)."
        >
          <div className="px-5 py-4 grid grid-cols-3 gap-3 border-b border-slate-100">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Deducible
              </p>
              <p className="text-lg font-bold text-slate-900">
                {fmtEur.format(coste.totalDeducible)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Pagado
              </p>
              <p className="text-lg font-bold text-slate-900">
                {fmtEur.format(coste.totalPagado)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Registros
              </p>
              <p className="text-lg font-bold text-slate-900">{coste.count}</p>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {coste.gastos.slice(0, 5).map((g) => (
              <li
                key={g.id}
                className="px-5 py-3 flex items-center gap-3 hover:bg-slate-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {g.concepto} · {fmtEur.format(g.importe)}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {g.categoria} · {g.estado} · {dirDe(g)}
                  </p>
                </div>
                <button
                  onClick={() => onSelectSection('gastos')}
                  className={btnVer}
                >
                  Ver
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </Bloque>
      </div>

      {/* Modales de detalle: componentes canónicos existentes */}
      {incidenciaSel && (
        <DetalleIncidenciaModal
          isOpen={true}
          onClose={() => setIncidenciaSel(null)}
          incidencia={
            incidenciasScope.find((i) => i.id === incidenciaSel.id) ||
            incidenciaSel
          }
          polizas={polizasScope}
          siniestros={siniestrosScope}
          profesionales={profesionales}
          inmuebles={inmuebles}
          currentUser={currentUser}
          onUpdateIncidencia={handleSaveIncidencia}
          onOpenSiniestroModal={handleOpenSiniestroFromDetalle}
        />
      )}

      {isSiniestroModalOpen && incidenciaParaSiniestro && (
        <SiniestroModal
          isOpen={isSiniestroModalOpen}
          onClose={() => {
            setIsSiniestroModalOpen(false);
            setSiniestroToEdit(null);
            setIncidenciaParaSiniestro(null);
          }}
          onSave={handleSaveSiniestro}
          incidencia={incidenciaParaSiniestro}
          polizas={polizasScope}
          currentUser={currentUser}
          siniestroToEdit={siniestroToEdit}
        />
      )}

      {trabajoSel && (
        <DetalleTrabajoProfesionalModal
          isOpen={true}
          onClose={() => setTrabajoSel(null)}
          trabajo={
            trabajosScope.find((t) => t.id === trabajoSel.id) || trabajoSel
          }
          presupuestos={presupuestosScope}
          profesionales={profesionales}
          inmuebles={inmuebles}
          incidencias={incidenciasScope}
          gastos={gastos}
          currentUser={currentUser}
          onVerPresupuesto={(p) => setPresupuestoSel(p)}
          onVerIncidencia={(inc) => setIncidenciaSel(inc)}
          onVerGasto={() => onSelectSection('gastos')}
        />
      )}

      {presupuestoSel && (
        <DetallePresupuestoProfesionalModal
          isOpen={true}
          onClose={() => setPresupuestoSel(null)}
          presupuesto={
            presupuestosScope.find((p) => p.id === presupuestoSel.id) ||
            presupuestoSel
          }
          trabajos={trabajosScope}
          profesionales={profesionales}
          inmuebles={inmuebles}
          currentUser={currentUser}
          onVerTrabajo={(t) => setTrabajoSel(t)}
        />
      )}

      {proyectoSel && (
        <DetalleProyectoReformaModal
          isOpen={true}
          onClose={() => setProyectoSel(null)}
          proyecto={
            proyectosScope.find((p) => p.id === proyectoSel.id) || proyectoSel
          }
          inmueble={inmueblesById.get(proyectoSel.inmuebleId)}
          profesionales={profesionales}
          presupuestos={presupuestosScope}
          trabajos={trabajosScope}
          gastos={gastos}
          currentUser={currentUser}
          onAbrirOT={(t) => setTrabajoSel(t)}
          onAbrirPresupuesto={(p) => setPresupuestoSel(p)}
        />
      )}

      {necesidadSel && (
        <NecesidadReformaModal
          isOpen={true}
          onClose={() => setNecesidadSel(null)}
          inmuebles={inmuebles}
          necesidadParaEditar={
            necesidadesScope.find((n) => n.id === necesidadSel.id) ||
            necesidadSel
          }
          currentUser={currentUser}
          onSaveSuccess={() => setNecesidadSel(null)}
        />
      )}

      {polizaSel && (
        <DetallePolizaModal
          isOpen={true}
          onClose={() => setPolizaSel(null)}
          poliza={
            polizasScope.find((p) => p.id === polizaSel.id) || polizaSel
          }
          todasPolizas={polizasScope}
          inmuebles={inmuebles}
          propietarios={propietarios}
          currentUser={currentUser}
          onSave={handleSavePoliza}
        />
      )}

      {profesionalSel && (
        <DetalleProfesionalModal
          isOpen={true}
          onClose={() => setProfesionalSel(null)}
          profesional={profesionalSel}
          trabajos={trabajosScope}
          presupuestos={presupuestosScope}
          valoraciones={valoracionesScope}
          inmuebles={inmuebles}
          currentUser={currentUser}
          onSelectTrabajo={(t) => setTrabajoSel(t)}
        />
      )}
    </div>
  );
};
