import React, { useState, useEffect, useMemo } from 'react';
import {
  Hammer,
  Plus,
  Layers,
  FileText,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Briefcase,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  Inmueble,
  NecesidadReforma,
  ProyectoReforma,
  Profesional,
  PresupuestoProfesional,
  TrabajoProfesional,
  Gasto,
  UsuarioApp,
} from '../../types';
import {
  CATEGORIA_REFORMA_LABELS,
  ESTADO_NECESIDAD_REFORMA_LABELS,
  ESTADO_PROYECTO_REFORMA_LABELS,
  crearProyectoDesdeNecesidad,
} from '../../utils/reformasEngine';
import {
  subscribeNecesidadesReforma,
  subscribeProyectosReforma,
  subscribePresupuestosProfesionales,
  subscribeTrabajosProfesionales,
  subscribeGastos,
  saveProyectoReformaFirestore,
  saveNecesidadReformaFirestore,
} from '../../lib/firebase';
import { NecesidadReformaModal } from '../modals/NecesidadReformaModal';
import { DetalleProyectoReformaModal } from '../modals/DetalleProyectoReformaModal';

interface ReformasInmueblePanelProps {
  inmueble: Inmueble;
  profesionales: Profesional[];
  currentUser?: UsuarioApp;
  onAbrirOT?: (trabajo: TrabajoProfesional) => void;
  onAbrirPresupuesto?: (presupuesto: PresupuestoProfesional) => void;
}

export const ReformasInmueblePanel: React.FC<ReformasInmueblePanelProps> = ({
  inmueble,
  profesionales,
  currentUser,
  onAbrirOT,
  onAbrirPresupuesto,
}) => {
  const [necesidades, setNecesidades] = useState<NecesidadReforma[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoReforma[]>([]);
  const [presupuestos, setPresupuestos] = useState<PresupuestoProfesional[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoProfesional[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);

  // Modals state
  const [showNuevaNecesidadModal, setShowNuevaNecesidadModal] = useState(false);
  const [selectedNecesidadParaEditar, setSelectedNecesidadParaEditar] = useState<NecesidadReforma | null>(null);
  const [selectedProyectoParaDetalle, setSelectedProyectoParaDetalle] = useState<ProyectoReforma | null>(null);

  useEffect(() => {
    const unsubNec = subscribeNecesidadesReforma((data) => {
      setNecesidades(data || []);
    });
    const unsubProj = subscribeProyectosReforma((data) => {
      setProyectos(data || []);
    });
    const unsubPpt = subscribePresupuestosProfesionales((data) => {
      setPresupuestos(data || []);
    });
    const unsubTrab = subscribeTrabajosProfesionales((data) => {
      setTrabajos(data || []);
    });
    const unsubGast = subscribeGastos((data) => {
      setGastos(data || []);
    });

    return () => {
      unsubNec();
      unsubProj();
      unsubPpt();
      unsubTrab();
      unsubGast();
    };
  }, []);

  const necesidadesDelInmueble = useMemo(
    () => necesidades.filter((n) => n.inmuebleId === inmueble.id),
    [necesidades, inmueble.id]
  );

  const proyectosDelInmueble = useMemo(
    () => proyectos.filter((p) => p.inmuebleId === inmueble.id),
    [proyectos, inmueble.id]
  );

  const kpis = useMemo(() => {
    const totalNecesidades = necesidadesDelInmueble.length;
    const proyectosActivos = proyectosDelInmueble.filter((p) => !['FINALIZADO', 'FINALIZADA', 'CANCELADO', 'CANCELADA'].includes(p.estado)).length;
    const presupuestoPrevistoTotal = proyectosDelInmueble.reduce((acc, p) => acc + (Number(p.presupuestoPrevisto) || 0), 0);
    const costeRealTotal = proyectosDelInmueble.reduce((acc, p) => acc + (Number(p.costeReal) || 0), 0);

    return {
      totalNecesidades,
      proyectosActivos,
      presupuestoPrevistoTotal,
      costeRealTotal,
    };
  }, [necesidadesDelInmueble, proyectosDelInmueble]);

  const handleCrearProyectoDesdeNecesidad = async (necesidad: NecesidadReforma) => {
    try {
      const nuevoProyecto = crearProyectoDesdeNecesidad({
        necesidad,
        usuarioNombre: currentUser?.nombre || 'Gestor Operativo',
      });
      await saveProyectoReformaFirestore(nuevoProyecto);

      const necesidadActualizada: NecesidadReforma = {
        ...necesidad,
        estado: 'APROBADA',
        proyectoReformaId: nuevoProyecto.id,
        updatedAt: new Date().toISOString(),
      };
      await saveNecesidadReformaFirestore(necesidadActualizada);

      setSelectedProyectoParaDetalle(nuevoProyecto);
    } catch (err) {
      console.error('Error aprobando necesidad y creando proyecto:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Panel Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600/10 border border-purple-600/20 flex items-center justify-center text-purple-600">
            <Hammer className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Reformas y Revalorización Operativa</h4>
            <p className="text-2xs text-slate-500">
              Proyectos de reforma, partidas técnicas, presupuestos y liquidación económica
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNuevaNecesidadModal(true)}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Identificar Necesidad</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-purple-50/40 border border-purple-200/60 rounded-xl">
          <span className="text-2xs font-semibold text-purple-800 uppercase tracking-wider block">
            Necesidades
          </span>
          <span className="text-base font-bold text-purple-950">{kpis.totalNecesidades}</span>
        </div>

        <div className="p-3 bg-blue-50/40 border border-blue-200/60 rounded-xl">
          <span className="text-2xs font-semibold text-blue-800 uppercase tracking-wider block">
            Proyectos Activos
          </span>
          <span className="text-base font-bold text-blue-950">{kpis.proyectosActivos}</span>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <span className="text-2xs font-semibold text-slate-500 uppercase tracking-wider block">
            Presupuesto Previsto
          </span>
          <span className="text-base font-bold text-slate-900">{kpis.presupuestoPrevistoTotal.toLocaleString()} €</span>
        </div>

        <div className="p-3 bg-emerald-50/40 border border-emerald-200/60 rounded-xl">
          <span className="text-2xs font-semibold text-emerald-800 uppercase tracking-wider block">
            Coste Real Invertido
          </span>
          <span className="text-base font-bold text-emerald-950">{kpis.costeRealTotal.toLocaleString()} €</span>
        </div>
      </div>

      {/* Sección Proyectos de Reforma */}
      <div className="space-y-2.5">
        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
          Proyectos de Reforma ({proyectosDelInmueble.length})
        </span>

        {proyectosDelInmueble.length === 0 ? (
          <div className="p-6 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-xl">
            <Layers className="w-7 h-7 text-slate-400 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-700">No hay proyectos de reforma registrados</p>
            <p className="text-2xs text-slate-400">
              Identifica una necesidad de reforma para planificar partidas, presupuestos y órdenes de trabajo.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {proyectosDelInmueble.map((proj) => {
              const stInfo = ESTADO_PROYECTO_REFORMA_LABELS[proj.estado] || {
                label: proj.estado,
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
              };
              return (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProyectoParaDetalle(proj)}
                  className="p-3.5 bg-white border border-slate-200 hover:border-purple-300 hover:shadow-2xs rounded-xl flex items-center justify-between cursor-pointer transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-900">{proj.titulo}</span>
                      <span className={`px-2 py-0.5 rounded-full text-2xs font-bold border ${stInfo.badgeClass}`}>
                        {stInfo.label}
                      </span>
                    </div>
                    <p className="text-2xs text-slate-500">
                      {(proj.partidas || []).length} partidas • Contratista: {proj.profesionalPrincipalNombre || 'Sin adjudicar'} • Previsto: {proj.presupuestoPrevisto.toLocaleString()} € • Real: {proj.costeReal.toLocaleString()} €
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sección Necesidades de Reforma */}
      {necesidadesDelInmueble.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-200">
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
            Necesidades Identificadas ({necesidadesDelInmueble.length})
          </span>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {necesidadesDelInmueble.map((nec) => {
              const stInfo = ESTADO_NECESIDAD_REFORMA_LABELS[nec.estado] || {
                label: nec.estado,
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
              };
              return (
                <div
                  key={nec.id}
                  className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 truncate">{nec.titulo}</span>
                    <span className={`px-2 py-0.5 rounded-full text-2xs font-bold border ${stInfo.badgeClass}`}>
                      {stInfo.label}
                    </span>
                  </div>
                  <p className="text-2xs text-slate-500 line-clamp-2">{nec.descripcion}</p>

                  <div className="flex items-center justify-between pt-1 text-2xs">
                    <span className="text-slate-400">{nec.categoria}</span>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => setSelectedNecesidadParaEditar(nec)}
                        className="px-2 py-0.5 text-purple-700 hover:bg-purple-50 rounded font-semibold"
                      >
                        Editar
                      </button>
                      {!nec.proyectoReformaId && nec.estado !== 'CANCELADA' && (
                        <button
                          onClick={() => handleCrearProyectoDesdeNecesidad(nec)}
                          className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded font-bold"
                        >
                          Crear Proyecto
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Crear/Editar Necesidad */}
      {(showNuevaNecesidadModal || selectedNecesidadParaEditar) && (
        <NecesidadReformaModal
          isOpen={true}
          onClose={() => {
            setShowNuevaNecesidadModal(false);
            setSelectedNecesidadParaEditar(null);
          }}
          inmuebles={[inmueble]}
          inmueblePreseleccionado={inmueble}
          necesidadParaEditar={selectedNecesidadParaEditar}
          currentUser={currentUser}
          onCrearProyecto={handleCrearProyectoDesdeNecesidad}
        />
      )}

      {/* Modal: Detalle de Proyecto de Reforma */}
      {selectedProyectoParaDetalle && (
        <DetalleProyectoReformaModal
          isOpen={true}
          onClose={() => setSelectedProyectoParaDetalle(null)}
          proyecto={selectedProyectoParaDetalle}
          inmueble={inmueble}
          profesionales={profesionales}
          presupuestos={presupuestos}
          trabajos={trabajos}
          gastos={gastos}
          currentUser={currentUser}
          onUpdateSuccess={(p) => {
            setSelectedProyectoParaDetalle(p);
          }}
          onAbrirOT={onAbrirOT}
          onAbrirPresupuesto={onAbrirPresupuesto}
        />
      )}
    </div>
  );
};
