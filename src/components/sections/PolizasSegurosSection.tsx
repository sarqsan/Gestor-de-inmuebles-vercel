import React, { useState, useEffect, useMemo } from 'react';
import {
  PolizaSeguro,
  Inmueble,
  Propietario,
  UsuarioApp,
  AlertaRenovacionPoliza,
} from '../../types';
import {
  subscribePolizas,
  subscribePolizasSeguras,
  savePolizaFirestore,
  deletePolizaFirestore,
} from '../../lib/firebase';
import {
  detectarPolizasProximasVencer,
  filtrarPolizasPorUsuario,
  canAccessPoliza,
  crearHistorialPolizaItem,
  calcularDiasRestantes,
  obtenerNivelAlerta,
  obtenerTextoDiasRestantes,
  ESTADO_RENOVACION_LABELS,
} from '../../utils/segurosEngine';
import { PolizaModal } from '../modals/PolizaModal';
import { DetallePolizaModal } from '../modals/DetallePolizaModal';
import { RenovacionPolizaModal } from '../modals/RenovacionPolizaModal';
import { AlertaRenovacionCard } from '../polizas/AlertaRenovacionCard';
import {
  ShieldCheck,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  Building2,
  Euro,
  Calendar,
  FileText,
  Filter,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
} from 'lucide-react';

interface PolizasSegurosSectionProps {
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  currentUser?: UsuarioApp;
  modo?: 'ADMIN' | 'PROPIETARIO';
  inmuebleFiltro?: string; // si se quiere filtrar por un inmueble concreto
}

export const PolizasSegurosSection: React.FC<PolizasSegurosSectionProps> = ({
  inmuebles,
  propietarios,
  currentUser,
  modo = 'ADMIN',
  inmuebleFiltro,
}) => {
  const [polizas, setPolizas] = useState<PolizaSeguro[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('TODOS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroInmueble, setFiltroInmueble] = useState<string>(inmuebleFiltro || 'TODOS');
  const [soloAlertas, setSoloAlertas] = useState(false);

  // Modales
  const [isPolizaModalOpen, setIsPolizaModalOpen] = useState(false);
  const [polizaToEdit, setPolizaToEdit] = useState<PolizaSeguro | null>(null);
  const [detallePoliza, setDetallePoliza] = useState<PolizaSeguro | null>(null);
  const [renovacionPoliza, setRenovacionPoliza] = useState<PolizaSeguro | null>(null);
  const [isDetalleOpen, setIsDetalleOpen] = useState(false);
  const [isRenovacionOpen, setIsRenovacionOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribePolizasSeguras((items) => {
      setPolizas(items);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser?.id, (currentUser as any)?.propietarioId, JSON.stringify(currentUser?.inmuebleIds)]);

  // Escuchar eventos globales para abrir modales desde DetallePolizaModal
  useEffect(() => {
    const handleAbrirRenovacion = (e: any) => {
      const id = e.detail;
      const p = polizas.find((x) => x.id === id);
      if (p) {
        setRenovacionPoliza(p);
        setIsRenovacionOpen(true);
      }
    };
    const handleVerHistorial = (e: any) => {
      const id = e.detail;
      const p = polizas.find((x) => x.id === id);
      if (p) {
        setDetallePoliza(p);
        setIsDetalleOpen(true);
      }
    };
    window.addEventListener('abrirRenovacion', handleAbrirRenovacion as any);
    window.addEventListener('verPolizaHistorial', handleVerHistorial as any);
    return () => {
      window.removeEventListener('abrirRenovacion', handleAbrirRenovacion as any);
      window.removeEventListener('verPolizaHistorial', handleVerHistorial as any);
    };
  }, [polizas]);

  // Mantener detalle actualizado si cambia la póliza en Firestore
  useEffect(() => {
    if (detallePoliza) {
      const updated = polizas.find((p) => p.id === detallePoliza.id);
      if (updated) setDetallePoliza(updated);
    }
    if (renovacionPoliza) {
      const updated = polizas.find((p) => p.id === renovacionPoliza.id);
      if (updated) setRenovacionPoliza(updated);
    }
  }, [polizas]);

  const polizasFiltradasPorUsuario = useMemo(() => {
    return filtrarPolizasPorUsuario(polizas, currentUser);
  }, [polizas, currentUser]);

  const alertas = useMemo(() => {
    return detectarPolizasProximasVencer(polizasFiltradasPorUsuario);
  }, [polizasFiltradasPorUsuario]);

  const polizasFiltradas = useMemo(() => {
    let lista = polizasFiltradasPorUsuario;

    if (inmuebleFiltro) {
      lista = lista.filter((p) => p.inmuebleId === inmuebleFiltro);
    } else if (filtroInmueble !== 'TODOS') {
      lista = lista.filter((p) => p.inmuebleId === filtroInmueble);
    }

    if (filtroTipo !== 'TODOS') {
      lista = lista.filter((p) => p.tipo === filtroTipo);
    }

    if (filtroEstado !== 'TODOS') {
      if (filtroEstado.startsWith('RENOV_')) {
        const estadoRenov = filtroEstado.replace('RENOV_', '');
        lista = lista.filter((p) => (p.estadoRenovacion || 'VIGENTE') === estadoRenov);
      } else {
        lista = lista.filter((p) => p.estado === filtroEstado);
      }
    }

    if (searchTerm.trim()) {
      const norm = searchTerm.trim().toLowerCase();
      lista = lista.filter((p) => {
        return (
          p.aseguradora.toLowerCase().includes(norm) ||
          p.numeroPoliza.toLowerCase().includes(norm) ||
          (p.inmuebleDireccion && p.inmuebleDireccion.toLowerCase().includes(norm)) ||
          p.tipo.toLowerCase().includes(norm)
        );
      });
    }

    if (soloAlertas) {
      const idsAlertas = new Set(alertas.map((a) => a.polizaId));
      lista = lista.filter((p) => idsAlertas.has(p.id));
    }

    // Ordenar por vencimiento ascendente
    return lista.sort((a, b) => new Date(a.fechaVencimiento).getTime() - new Date(b.fechaVencimiento).getTime());
  }, [polizasFiltradasPorUsuario, filtroTipo, filtroEstado, filtroInmueble, searchTerm, soloAlertas, alertas, inmuebleFiltro]);

  const handleSavePoliza = async (pol: PolizaSeguro) => {
    // Si es nueva, crear historial inicial
    if (!polizas.some((p) => p.id === pol.id)) {
      const historialItem = crearHistorialPolizaItem(
        currentUser?.nombre || 'Sistema',
        'CREACION',
        `Póliza ${pol.numeroPoliza} creada`,
        undefined,
        undefined,
        currentUser?.id
      );
      pol.historial = [historialItem];
      pol.estadoRenovacion = pol.estadoRenovacion || 'VIGENTE';
    }
    await savePolizaFirestore(pol);
  };

  const handleDeletePoliza = async (id: string) => {
    if (window.confirm('¿Eliminar esta póliza? Si tiene histórico vinculado, el histórico de otras pólizas se conservará.')) {
      await deletePolizaFirestore(id);
      if (detallePoliza?.id === id) {
        setIsDetalleOpen(false);
        setDetallePoliza(null);
      }
    }
  };

  const handleCrearRenovacionComoNueva = (polizaAnterior: PolizaSeguro) => {
    // Preparar nueva póliza basada en anterior
    const nueva: PolizaSeguro = {
      ...polizaAnterior,
      id: `pol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      numeroPoliza: `${polizaAnterior.numeroPoliza}-REN`,
      fechaInicio: polizaAnterior.fechaVencimiento,
      fechaVencimiento: new Date(new Date(polizaAnterior.fechaVencimiento).getTime() + 365 * 24 * 3600 * 1000)
        .toISOString()
        .split('T')[0],
      estado: 'VIGENTE',
      estadoRenovacion: 'VIGENTE',
      polizaAnteriorId: polizaAnterior.id,
      primaAnterior: polizaAnterior.primaAnual,
      historial: [
        crearHistorialPolizaItem(
          currentUser?.nombre || 'Sistema',
          'CREACION',
          `Renovación creada desde póliza ${polizaAnterior.numeroPoliza}`,
          undefined,
          undefined,
          currentUser?.id
        ),
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Actualizar anterior para apuntar a siguiente
    const anteriorActualizada: PolizaSeguro = {
      ...polizaAnterior,
      polizaSiguienteId: nueva.id,
      estadoRenovacion: 'RENOVADA',
      historial: [
        ...(polizaAnterior.historial || []),
        crearHistorialPolizaItem(
          currentUser?.nombre || 'Sistema',
          'RENOVACION_CONFIRMADA',
          `Renovada como ${nueva.numeroPoliza}`,
          undefined,
          undefined,
          currentUser?.id,
          polizaAnterior.estadoRenovacion,
          'RENOVADA'
        ),
      ],
      updatedAt: new Date().toISOString(),
    };

    // Guardar ambas
    savePolizaFirestore(anteriorActualizada).then(() => {
      savePolizaFirestore(nueva).then(() => {
        setPolizaToEdit(nueva);
        setIsPolizaModalOpen(true);
      });
    });
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 text-sm">Cargando pólizas de seguro...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Gestión de Pólizas de Seguro
            {modo === 'PROPIETARIO' && <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">PROPIETARIO</span>}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Circuito completo: Póliza → Vencimiento → Alerta (60/45/30/15) → Renovación → Comparación → Histórico. Elemento patrimonial con ciclo de vida.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setPolizaToEdit(null);
              setIsPolizaModalOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Nueva Póliza
          </button>
        </div>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Alertas de Renovación ({alertas.length}) — 60/45/30/15 días
            </h3>
            <button
              onClick={() => setSoloAlertas(!soloAlertas)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${soloAlertas ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
            >
              {soloAlertas ? 'Ver Todas' : 'Filtrar Solo Alertas'}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertas.slice(0, 6).map((alerta) => (
              <AlertaRenovacionCard
                key={alerta.polizaId}
                alerta={alerta}
                onVerPoliza={(id) => {
                  const p = polizas.find((x) => x.id === id);
                  if (p) {
                    setDetallePoliza(p);
                    setIsDetalleOpen(true);
                  }
                }}
                onComprobarRenovacion={(id) => {
                  const p = polizas.find((x) => x.id === id);
                  if (p) {
                    setRenovacionPoliza(p);
                    setIsRenovacionOpen(true);
                  }
                }}
              />
            ))}
          </div>
          {alertas.length > 6 && (
            <div className="text-xs text-slate-500 text-center">Y {alertas.length - 6} alertas más — usa filtro para ver todas</div>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por aseguradora, nº póliza, inmueble..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <select
            value={filtroInmueble}
            onChange={(e) => setFiltroInmueble(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
          >
            <option value="TODOS">Todos los Inmuebles</option>
            {inmuebles.map((inm) => (
              <option key={inm.id} value={inm.id}>
                {inm.direccion}
              </option>
            ))}
          </select>

          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
          >
            <option value="TODOS">Todos los Tipos</option>
            <option value="HOGAR">Hogar</option>
            <option value="ARRENDADOR">Arrendador</option>
            <option value="IMPAGO_ALQUILER">Impago Alquiler</option>
            <option value="COMUNIDAD">Comunidad</option>
            <option value="ELECTRODOMESTICOS">Electrodomésticos</option>
            <option value="OTRO">Otro</option>
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
          >
            <option value="TODOS">Todos los Estados</option>
            <option value="VIGENTE">Vigente</option>
            <option value="VENCIDA">Vencida</option>
            <option value="EN_TRAMITE">En Trámite</option>
            <option value="CANCELADA">Cancelada</option>
            <option value="RENOV_VIGENTE">Renov: Vigente</option>
            <option value="RENOV_PENDIENTE_RENOVACION">Renov: Pendiente Renovación</option>
            <option value="RENOV_RENOVACION_SOLICITADA">Renov: Solicitada</option>
            <option value="RENOV_RENOVACION_RECIBIDA">Renov: Recibida</option>
            <option value="RENOV_RENOVADA">Renov: Renovada</option>
            <option value="RENOV_NO_RENOVADA">Renov: No Renovada</option>
            <option value="RENOV_SUSTITUIDA">Renov: Sustituida</option>
          </select>
        </div>
      </div>

      {/* Listado */}
      {polizasFiltradas.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
          <ShieldCheck className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-900">No hay pólizas que coincidan</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            No se encontraron pólizas con los filtros actuales. {modo === 'PROPIETARIO' ? 'Solo ves pólizas de inmuebles sobre los que tienes autorización.' : ''}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {polizasFiltradas.map((pol) => {
            const dias = calcularDiasRestantes(pol.fechaVencimiento);
            const nivel = obtenerNivelAlerta(dias);
            const estadoRenov = pol.estadoRenovacion || 'VIGENTE';
            const estadoRenovInfo = ESTADO_RENOVACION_LABELS[estadoRenov as any] || ESTADO_RENOVACION_LABELS.VIGENTE;
            return (
              <div key={pol.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-3 hover:shadow-md transition-shadow">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{pol.tipo}</span>
                      <h3 className="text-sm font-black text-slate-900">{pol.aseguradora}</h3>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${pol.estado === 'VIGENTE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {pol.estado}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${estadoRenovInfo.badgeClass}`}>{estadoRenovInfo.label}</span>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="font-mono text-slate-700">
                      <span className="text-slate-400">Nº:</span> <strong>{pol.numeroPoliza}</strong>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{pol.inmuebleDireccion || inmuebles.find((i) => i.id === pol.inmuebleId)?.direccion || 'Sin inmueble'}</span>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-xl text-xs flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Vencimiento</span>
                      <span className="font-semibold text-slate-800">{new Date(pol.fechaVencimiento).toLocaleDateString('es-ES')}</span>
                      <span className="text-[11px] text-slate-500 block">{obtenerTextoDiasRestantes(dias)}</span>
                    </div>
                    {nivel !== null && (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${nivel === -1 || nivel === 0 || nivel === 15 ? 'bg-rose-100 text-rose-700 border-rose-200' : nivel === 30 ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-blue-100 text-blue-800 border-blue-200'}`}>
                        {nivel === -1 ? 'VENCIDA' : nivel === 0 ? 'HOY' : `${nivel} DÍAS`}
                      </span>
                    )}
                  </div>

                  {pol.primaAnual && (
                    <div className="text-xs text-slate-600 flex items-center gap-1">
                      <Euro className="w-3.5 h-3.5" />
                      <span>Prima: <strong>{pol.primaAnual} €/año</strong></span>
                      {pol.primaAnterior && <span className="text-[11px] text-slate-400">(Anterior: {pol.primaAnterior}€)</span>}
                    </div>
                  )}

                  {pol.coberturas && pol.coberturas.length > 0 && (
                    <div>
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Coberturas ({pol.coberturas.length})</span>
                      <div className="flex flex-wrap gap-1">
                        {pol.coberturas.slice(0, 3).map((c, idx) => (
                          <span key={idx} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                            {c}
                          </span>
                        ))}
                        {pol.coberturas.length > 3 && <span className="text-[10px] text-slate-400">+{pol.coberturas.length - 3} más</span>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setDetallePoliza(pol);
                        setIsDetalleOpen(true);
                      }}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Detalle
                    </button>
                    <button
                      onClick={() => {
                        setRenovacionPoliza(pol);
                        setIsRenovacionOpen(true);
                      }}
                      className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold rounded-lg flex items-center gap-1"
                      title="Comprobar renovación"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setPolizaToEdit(pol);
                        setIsPolizaModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePoliza(pol.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modales */}
      {isPolizaModalOpen && (
        <PolizaModal
          isOpen={isPolizaModalOpen}
          onClose={() => {
            setIsPolizaModalOpen(false);
            setPolizaToEdit(null);
          }}
          onSave={handleSavePoliza}
          inmuebles={inmuebles}
          propietarios={propietarios}
          currentUser={currentUser}
          polizaToEdit={polizaToEdit}
        />
      )}

      {isDetalleOpen && detallePoliza && (
        <DetallePolizaModal
          isOpen={isDetalleOpen}
          onClose={() => {
            setIsDetalleOpen(false);
            setDetallePoliza(null);
          }}
          poliza={detallePoliza}
          todasPolizas={polizas}
          inmuebles={inmuebles}
          propietarios={propietarios}
          currentUser={currentUser}
          onSave={handleSavePoliza}
          onDelete={handleDeletePoliza}
          onEdit={(p) => {
            setPolizaToEdit(p);
            setIsPolizaModalOpen(true);
            setIsDetalleOpen(false);
          }}
          onCrearNuevaDesdeRenovacion={handleCrearRenovacionComoNueva}
        />
      )}

      {isRenovacionOpen && renovacionPoliza && (
        <RenovacionPolizaModal
          isOpen={isRenovacionOpen}
          onClose={() => {
            setIsRenovacionOpen(false);
            setRenovacionPoliza(null);
          }}
          poliza={renovacionPoliza}
          currentUser={currentUser}
          onSave={handleSavePoliza}
        />
      )}
    </div>
  );
};
