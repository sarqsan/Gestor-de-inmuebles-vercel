import React, { useState, useEffect } from 'react';
import {
  Inmueble,
  TareaMantenimiento,
  GarantiaReparacion,
  TrabajoProfesional,
  Gasto,
  Propietario,
  Profesional,
  UsuarioApp,
} from '../../types';
import {
  subscribeTareasMantenimiento,
  subscribeGarantiasReparacion,
  subscribeTrabajosProfesionales,
  subscribeGastos,
} from '../../lib/firebase';
import { resumenMantenimientoInmueble } from '../../utils/mantenimientoEngine';
import { MantenimientoPreventivoPanel } from './MantenimientoPreventivoPanel';
import { GarantiasReparacionPanel } from './GarantiasReparacionPanel';
import {
  Wrench,
  ShieldCheck,
  History,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Clock,
  Sparkles,
  Tag,
} from 'lucide-react';

interface MantenimientoInmueblePanelProps {
  inmueble: Inmueble;
  propietarios?: Propietario[];
  profesionales?: Profesional[];
  currentUser?: UsuarioApp;
}

export const MantenimientoInmueblePanel: React.FC<MantenimientoInmueblePanelProps> = ({
  inmueble,
  propietarios = [],
  profesionales = [],
  currentUser,
}) => {
  const [subTab, setSubTab] = useState<'planes' | 'garantias' | 'historial'>('planes');
  const [tareas, setTareas] = useState<TareaMantenimiento[]>([]);
  const [garantias, setGarantias] = useState<GarantiaReparacion[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoProfesional[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    const unsubTareas = subscribeTareasMantenimiento((items) => {
      setTareas(items.filter((t) => t.inmuebleId === inmueble.id));
      setLoading(false);
    });

    const unsubGarantias = subscribeGarantiasReparacion((items) => {
      setGarantias(items.filter((g) => g.inmuebleId === inmueble.id));
    });

    const unsubTrabajos = subscribeTrabajosProfesionales((items) => {
      setTrabajos(items.filter((t) => t.inmuebleId === inmueble.id));
    });

    const unsubGastos = subscribeGastos((items) => {
      setGastos(items.filter((g) => g.inmuebleId === inmueble.id));
    });

    return () => {
      unsubTareas();
      unsubGarantias();
      unsubTrabajos();
      unsubGastos();
    };
  }, [inmueble.id]);

  // Resumen del inmueble
  const resumen = resumenMantenimientoInmueble(inmueble.id, tareas, garantias, trabajos, gastos);

  // Unificar historial de actuaciones
  const historialCompleto: Array<{
    id: string;
    fecha: string;
    tipo: 'ACTUACION' | 'TRABAJO_OT' | 'GASTO';
    titulo: string;
    descripcion?: string;
    coste?: number;
    proveedor?: string;
    elemento?: string;
    factura?: string;
  }> = [];

  // Actuaciones de las tareas
  tareas.forEach((t) => {
    (t.historialActuaciones || []).forEach((act) => {
      historialCompleto.push({
        id: act.id,
        fecha: act.fechaRealizada,
        tipo: 'ACTUACION',
        titulo: `Actuación Preventiva: ${t.titulo}`,
        descripcion: act.observaciones,
        coste: act.costeReal,
        proveedor: act.profesionalNombre,
        elemento: t.elementoNombre,
        factura: act.documentoFacturaRef,
      });
    });
  });

  // Trabajos OTs finalizados
  trabajos.forEach((trabajo) => {
    if (trabajo.estado === 'FINALIZADO') {
      historialCompleto.push({
        id: trabajo.id,
        fecha: trabajo.fechaFinalizacion || trabajo.createdAt,
        tipo: 'TRABAJO_OT',
        titulo: `OT: ${trabajo.titulo} (${trabajo.id})`,
        descripcion: trabajo.descripcion,
        coste: trabajo.importeFinal !== undefined ? trabajo.importeFinal : trabajo.importeEstimado,
        proveedor: trabajo.profesionalNombre,
        elemento: trabajo.categoria,
      });
    }
  });

  // Gastos de mantenimiento
  gastos.forEach((g) => {
    if (g.categoria === 'MANTENIMIENTO' && !g.ordenTrabajoId && !g.trabajoId) {
      historialCompleto.push({
        id: g.id,
        fecha: g.fechaDevengo || g.fechaPago || g.createdAt,
        tipo: 'GASTO',
        titulo: `Gasto Técnico: ${g.concepto}`,
        descripcion: g.notas,
        coste: g.importe,
        proveedor: g.proveedor,
      });
    }
  });

  // Ordenar historial cronológicamente descendente
  historialCompleto.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return (
    <div className="space-y-6 pt-4">
      {/* Header y Resumen de Estado */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white p-5 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/30 text-blue-200 uppercase tracking-wider">
                Módulo Técnico
              </span>
              <span className="text-xs text-slate-400">Patrimonio & Conservación</span>
            </div>
            <h3 className="text-lg font-black text-white mt-1 flex items-center gap-2">
              <Wrench className="w-5 h-5 text-blue-400" />
              Mantenimiento Preventivo & Garantías
            </h3>
          </div>
          <div className="text-xs text-slate-300">
            Inmueble: <strong className="text-white">{inmueble.alias || inmueble.direccion}</strong>
          </div>
        </div>

        {/* KPIs del Inmueble */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">Planes Activos</span>
            <span className="text-xl font-black text-white">{resumen.planesActivos}</span>
          </div>

          <div className={`p-3 rounded-xl border backdrop-blur-xs ${
            resumen.planesVencidos > 0
              ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
              : 'bg-white/10 border-white/10 text-white'
          }`}>
            <span className="text-[10px] font-bold uppercase tracking-wider block">Vencidos / Próximos</span>
            <span className="text-xl font-black">
              {resumen.planesVencidos} <span className="text-xs font-normal">/ {resumen.planesProximos}</span>
            </span>
          </div>

          <div className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 p-3 rounded-xl backdrop-blur-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider block">Garantías Vigentes</span>
            <span className="text-xl font-black">{resumen.garantiasActivas}</span>
          </div>

          <div className="bg-white/10 backdrop-blur-xs p-3 rounded-xl border border-white/10">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300 block">Inversión Real Mantenimiento</span>
            <span className="text-xl font-black text-white font-mono">
              {resumen.costeTotalRealMantenimiento.toFixed(2)} €
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Internas */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setSubTab('planes')}
          className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            subTab === 'planes'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Wrench className="w-4 h-4 text-blue-500" />
          <span>Planes Preventivos ({tareas.length})</span>
        </button>

        <button
          onClick={() => setSubTab('garantias')}
          className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            subTab === 'garantias'
              ? 'border-emerald-600 text-emerald-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Garantías de Reparación ({garantias.length})</span>
        </button>

        <button
          onClick={() => setSubTab('historial')}
          className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
            subTab === 'historial'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="w-4 h-4 text-indigo-500" />
          <span>Historial Consolidado ({historialCompleto.length})</span>
        </button>
      </div>

      {/* Contenido según tab */}
      {subTab === 'planes' && (
        <MantenimientoPreventivoPanel
          tareas={tareas}
          inmuebles={[inmueble]}
          propietarios={propietarios}
          profesionales={profesionales}
          trabajos={trabajos}
          currentUser={currentUser}
          inmuebleIdFiltro={inmueble.id}
        />
      )}

      {subTab === 'garantias' && (
        <GarantiasReparacionPanel
          garantias={garantias}
          inmuebles={[inmueble]}
          propietarios={propietarios}
          profesionales={profesionales}
          currentUser={currentUser}
          inmuebleIdFiltro={inmueble.id}
        />
      )}

      {subTab === 'historial' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
            Registro cronológico unificado de todas las intervenciones técnicas, mantenimientos preventivos realizados y órdenes de trabajo ejecutadas en esta propiedad.
          </div>

          {historialCompleto.length === 0 ? (
            <div className="p-8 text-center bg-white border border-dashed border-slate-300 rounded-2xl text-slate-400 space-y-1">
              <History className="w-6 h-6 mx-auto text-slate-300" />
              <p className="font-semibold text-xs text-slate-600">No hay actuaciones registradas en el historial</p>
              <p className="text-[11px]">Cuando complete actuaciones o finalice OTs aparecerán aquí con su trazabilidad de costes.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {historialCompleto.map((item) => (
                <div key={item.id} className="relative group">
                  <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white bg-blue-600 shadow-xs group-hover:scale-125 transition-transform" />
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition-all space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-900">{item.titulo}</span>
                      <span className="font-semibold text-slate-500 text-[11px]">
                        {new Date(item.fecha).toLocaleDateString('es-ES')}
                      </span>
                    </div>

                    {item.descripcion && (
                      <p className="text-xs text-slate-600">{item.descripcion}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs pt-1 border-t border-slate-100">
                      {item.coste !== undefined && (
                        <span className="font-mono font-bold text-slate-900">
                          Coste: {item.coste.toFixed(2)} €
                        </span>
                      )}
                      {item.proveedor && (
                        <span className="text-slate-600">
                          Técnico: <strong className="text-slate-800">{item.proveedor}</strong>
                        </span>
                      )}
                      {item.factura && (
                        <span className="text-slate-500 font-mono text-[11px]">
                          Doc/Factura: {item.factura}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
