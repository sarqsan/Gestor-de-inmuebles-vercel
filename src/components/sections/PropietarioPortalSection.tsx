import React, { useEffect, useState } from 'react';
import {
  Home,
  Wrench,
  FileCheck,
  DollarSign,
  TrendingDown,
  AlertTriangle,
  User,
  Plus,
  Search,
  Check,
  Copy,
  Mail,
  Phone,
  Building,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Save,
  Wallet,
} from 'lucide-react';
import {
  UsuarioApp,
  Inmueble,
  Profesional,
  ContratoFormalizacion,
  Especialidad,
  Propietario,
  Gasto,
  Incidencia,
  EstadoCobroAlquiler,
} from '../../types';
import type { LiquidacionPropietario } from '../../tesoreria/tipos';
// PORTAL PROPIETARIO — Gastos/Cobros/Incidencias: se reutilizan los MISMOS motores
// puros que las secciones internas (sin lógica paralela): mismos resúmenes,
// mismos filtros, mismas etiquetas y misma puerta de permisos.
import {
  resumenGastos,
  ESTADO_GASTO_LABEL,
  CATEGORIAS_GASTO,
  categoriaDef,
  etiquetaMesAnio,
} from '../../utils/gastosEngine';
import {
  actualizarEstadosVencimiento,
  obtenerTodosCobros,
  calcularResumenCobros,
} from '../../utils/cobrosEngine';
import {
  filtrarIncidencias,
  canAccessIncidencia,
  ESTADOS_INCIDENCIA_LABELS,
  CATEGORIA_INCIDENCIA_LABEL,
  PRIORIDADES_INCIDENCIA_LABELS,
  ORIGEN_INCIDENCIA_LABEL,
} from '../../utils/incidenciasEngine';
// BLOQUE C — Morosidad: el portal del propietario SOLO consume el espejo recortado
// (`morosidad_resumen_propietario`); nunca lee expedientes, comunicaciones internas ni estrategias.
import type { ResumenMorosidadPropietario } from '../../types/morosidad';
import { formatoImporteSepa } from '../../tesoreria/sepaUtils';
import { imprimirLiquidacionPDF } from '../../tesoreria/liquidacionPdf';

interface PropietarioPortalSectionProps {
  currentUser: UsuarioApp;
  inmuebles: Inmueble[];
  profesionales: Profesional[];
  contratos: ContratoFormalizacion[];
  especialidades: Especialidad[];
  propietarios: Propietario[];
  /** BLOQUE B — liquidaciones (ya acotadas por propietario desde el App). */
  liquidaciones?: LiquidacionPropietario[];
  /** BLOQUE C — resumen de morosidad ya recortado (sin datos del inquilino ni de estrategia). */
  resumenMorosidad?: ResumenMorosidadPropietario[];
  /** PORTAL — gastos ya acotados desde App (`scopedGastos`, mismo origen que GastosSection). */
  gastos?: Gasto[];
  /** PORTAL — incidencias ya acotadas desde App (`scopedIncidencias`). Los cobros
      no necesitan prop: derivan de `contratos` con el motor puro, como CobrosSection. */
  incidencias?: Incidencia[];
  onOpenCrearProfesionalModal: (profesional?: Profesional) => void;
  onSaveProfesional: (profesional: Profesional) => Promise<void>;
  onSavePropietario?: (propietario: Propietario) => Promise<void>;
  onNavigateToInmueble?: (inmuebleId: string) => void;
  /** Mismo callback que el alta desde la ficha de administración. */
  onCrearInmueble?: (propietarioId: string) => void;
  /** «Mi Cuenta»: abre la pestaña de perfil y se consume. */
  pestanaInicial?: 'perfil' | null;
  onPestanaInicialConsumida?: () => void;
}

export const PropietarioPortalSection: React.FC<PropietarioPortalSectionProps> = ({
  currentUser,
  inmuebles,
  profesionales,
  contratos,
  especialidades,
  propietarios,
  liquidaciones = [],
  resumenMorosidad = [],
  gastos = [],
  incidencias = [],
  onOpenCrearProfesionalModal,
  onSaveProfesional,
  onSavePropietario,
  onNavigateToInmueble,
  onCrearInmueble,
  pestanaInicial,
  onPestanaInicialConsumida,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'viviendas' | 'profesionales' | 'contratos' | 'liquidaciones' | 'morosidad' | 'gastos' | 'cobros' | 'incidencias' | 'perfil'
  >(pestanaInicial === 'perfil' ? 'perfil' : 'viviendas');
  useEffect(() => {
    if (pestanaInicial !== 'perfil') return;
    setActiveSubTab('perfil');
    onPestanaInicialConsumida?.();
  }, [pestanaInicial, onPestanaInicialConsumida]);
  // BLOQUE C: aislamiento defensivo en profundidad — aunque el prop incoming contuviera
  // otra fila, el propietario solo ve las suyas (la regla de Firestore ya lo garantiza).
  const miMorosidad = (resumenMorosidad || []).filter(
    (r) => !currentUser?.propietarioId || r.propietarioId === currentUser.propietarioId,
  );
  const morosidadConSaldo = miMorosidad.filter((r) => r.saldoPendiente > 0.009);
  const morosidadTotalPendiente = morosidadConSaldo.reduce((sum, r) => sum + Number(r.saldoPendiente || 0), 0);
  // BLOQUE B: detalle de liquidación seleccionado
  const [liqDetalleId, setLiqDetalleId] = useState<string | null>(null);

  const [profesionalTab, setProfesionalTab] = useState<'catalogo' | 'privados'>('catalogo');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEspecialidad, setSelectedEspecialidad] = useState<string>('TODAS');
  const [copiedLinkProfId, setCopiedLinkProfId] = useState<string | null>(null);
  const [formFicha, setFormFicha] = useState<{
    nombre: string;
    nifCif: string;
    telefono: string;
    email: string;
    direccion: string;
    ciudad: string;
    codigoPostal: string;
  } | null>(null);
  const [guardandoFicha, setGuardandoFicha] = useState<boolean>(false);
  const [mensajeFicha, setMensajeFicha] = useState<string | null>(null);

  // PORTAL — filtros y detalle de Gastos (solo lectura).
  const [gastoSearch, setGastoSearch] = useState('');
  const [gastoFiltroInmueble, setGastoFiltroInmueble] = useState<string>('TODOS');
  const [gastoFiltroCategoria, setGastoFiltroCategoria] = useState<string>('TODAS');
  const [gastoFiltroEstado, setGastoFiltroEstado] = useState<string>('TODOS');
  const [gastoDetalleId, setGastoDetalleId] = useState<string | null>(null);
  // PORTAL — filtros y detalle de Cobros (solo lectura).
  const [cobroSearch, setCobroSearch] = useState('');
  const [cobroFiltroInmueble, setCobroFiltroInmueble] = useState<string>('TODOS');
  const [cobroFiltroEstado, setCobroFiltroEstado] = useState<string>('TODOS');
  const [cobroDetalleId, setCobroDetalleId] = useState<string | null>(null);
  // PORTAL — filtros y detalle de Incidencias (solo lectura; el filtrado lo
  // hace el motor `filtrarIncidencias`, igual que IncidenciasSection).
  const [incSearch, setIncSearch] = useState('');
  const [incFiltroInmueble, setIncFiltroInmueble] = useState<string>('TODOS');
  const [incFiltroCategoria, setIncFiltroCategoria] = useState<string>('TODAS');
  const [incFiltroPrioridad, setIncFiltroPrioridad] = useState<string>('TODAS');
  const [incFiltroEstado, setIncFiltroEstado] = useState<string>('TODOS');
  const [incDetalleId, setIncDetalleId] = useState<string | null>(null);

  // Security check: Only filter properties that belong to this owner
  const misViviendas = inmuebles.filter((inm) => {
    const pid = currentUser.propietarioId;
    const isOwnerByPropietarioId = !!pid && (inm.propietarioId === pid || inm.propietarioPrincipalId === pid);
    const isOwnerByInmuebleIds = !!currentUser.inmuebleIds && currentUser.inmuebleIds.includes(inm.id);
    return isOwnerByPropietarioId || isOwnerByInmuebleIds;
  });

  const misViviendasIds = misViviendas.map((v) => v.id);

  // Contracts belonging to this owner's properties
  const misContratos = contratos.filter((c) => misViviendasIds.includes(c.inmuebleId));

  // Registered active public professionals
  const profesionalesPublicos = profesionales.filter((p) => p.activo && !p.esPrivado);

  // Private professionals added by this owner
  const misProfesionalesPrivados = profesionales.filter(
    (p) => p.creadoPorPropietarioId === currentUser.id || p.creadoPorPropietarioId === currentUser.propietarioId
  );

  // Associated Propietario record
  const miFichaPropietario = propietarios.find((p) => p.id === currentUser.propietarioId);

  // BLOQUE B: liquidaciones del propietario (aislamiento estricto por propietarioId)
  const misLiquidaciones = liquidaciones
    .filter((l) => l.propietarioId && l.propietarioId === currentUser.propietarioId && l.estado !== 'ANULADA' && l.estado !== 'REVERSADA')
    .sort((a, b) => (a.periodo < b.periodo ? 1 : -1));
  const liqDetalle = misLiquidaciones.find((l) => l.id === liqDetalleId) || null;

  // PORTAL — GASTOS: mismo origen que GastosSection + filtro defensivo en
  // profundidad (propietarioId propio o inmueble de mi cartera).
  const misGastos = (gastos || [])
    .filter(
      (g) =>
        (!!currentUser?.propietarioId && g.propietarioId === currentUser.propietarioId) ||
        misViviendasIds.includes(g.inmuebleId),
    )
    .sort((a, b) =>
      (b.fechaDevengo || b.periodoMesAnio || b.createdAt || '').localeCompare(
        a.fechaDevengo || a.periodoMesAnio || a.createdAt || '',
      ),
    );
  const resumenMisGastos = resumenGastos(misGastos);
  const gastosFiltrados = misGastos.filter((g) => {
    if (gastoFiltroInmueble !== 'TODOS' && g.inmuebleId !== gastoFiltroInmueble) return false;
    if (gastoFiltroCategoria !== 'TODAS' && g.categoria !== gastoFiltroCategoria) return false;
    if (gastoFiltroEstado !== 'TODOS' && g.estado !== gastoFiltroEstado) return false;
    const q = gastoSearch.trim().toLowerCase();
    if (q) {
      const hay = `${g.concepto || ''} ${g.proveedor || ''} ${g.notas || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const gastoDetalle = misGastos.find((g) => g.id === gastoDetalleId) || null;

  // PORTAL — COBROS: derivación IDÉNTICA a CobrosSection (mismo motor, mismo
  // orden: primero `actualizarEstadosVencimiento` por contrato, después
  // `obtenerTodosCobros`). La fuente (`misContratos`) ya viene acotada.
  const misCobros = obtenerTodosCobros(
    misContratos.map((c) => actualizarEstadosVencimiento(c).contratoActualizado),
  ).sort((a, b) => b.anio - a.anio || b.mes - a.mes);
  const resumenMisCobros = calcularResumenCobros(misCobros);
  const cobrosFiltrados = misCobros.filter((c) => {
    if (cobroFiltroInmueble !== 'TODOS' && c.inmuebleId !== cobroFiltroInmueble) return false;
    if (cobroFiltroEstado !== 'TODOS' && c.estado !== cobroFiltroEstado) return false;
    const q = cobroSearch.trim().toLowerCase();
    if (q) {
      const hay = `${c.nombreMes || ''} ${c.inmuebleDireccion || ''} ${c.inquilinoNombre || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const cobroDetalle = misCobros.find((c) => c.id === cobroDetalleId) || null;
  const cobrosAtencion = resumenMisCobros.countPendientes + resumenMisCobros.countRetrasados + resumenMisCobros.countIncidencias;

  // PORTAL — INCIDENCIAS: `scopedIncidencias` de App + la MISMA puerta de
  // permisos que la sección interna (`canAccessIncidencia`) + filtro por
  // cartera. Nunca se muestran notas internas ni teléfonos de contacto.
  const misIncidencias = (incidencias || [])
    .filter(
      (x) =>
        canAccessIncidencia(x, currentUser) &&
        ((!!currentUser?.propietarioId && x.propietarioId === currentUser.propietarioId) ||
          misViviendasIds.includes(x.inmuebleId)),
    )
    .sort((a, b) => (b.fechaCreacion || b.createdAt || '').localeCompare(a.fechaCreacion || a.createdAt || ''));
  const incidenciasFiltradas = filtrarIncidencias(
    misIncidencias,
    incSearch,
    incFiltroInmueble,
    incFiltroCategoria,
    incFiltroPrioridad,
    incFiltroEstado,
  );
  const incDetalle = misIncidencias.find((x) => x.id === incDetalleId) || null;
  const incAbiertas = misIncidencias.filter(
    (x) => !['RESUELTA', 'CERRADA', 'CANCELADA', 'RECHAZADA'].includes(x.estado),
  ).length;

  useEffect(() => {
    setFormFicha({
      nombre: miFichaPropietario?.nombre || `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim(),
      nifCif: miFichaPropietario?.nifCif || '',
      telefono: miFichaPropietario?.telefono || currentUser.telefono || '',
      email: miFichaPropietario?.email || currentUser.email || '',
      direccion: miFichaPropietario?.direccion || '',
      ciudad: miFichaPropietario?.ciudad || '',
      codigoPostal: miFichaPropietario?.codigoPostal || '',
    });
  }, [miFichaPropietario, currentUser]);

  const puedeEditarFicha = !!onSavePropietario && !!currentUser.propietarioId;

  const handleGuardarFicha = async () => {
    if (!onSavePropietario || !currentUser.propietarioId || !formFicha) return;
    setGuardandoFicha(true);
    setMensajeFicha(null);
    try {
      const base: Propietario =
        miFichaPropietario ||
        ({
          id: currentUser.propietarioId,
          nombre: formFicha.nombre,
          nifCif: formFicha.nifCif,
          tipoPropietario: 'persona_fisica',
          telefono: formFicha.telefono,
          email: formFicha.email,
          direccion: formFicha.direccion,
          ciudad: formFicha.ciudad,
          codigoPostal: formFicha.codigoPostal,
          cuentasBancarias: [],
          fechaCreacion: new Date().toISOString(),
          fechaActualizacion: new Date().toISOString(),
        } as Propietario);

      const actualizada: Propietario = {
        ...base,
        id: currentUser.propietarioId,
        nombre: formFicha.nombre.trim() || base.nombre,
        nifCif: formFicha.nifCif.trim() || base.nifCif,
        telefono: formFicha.telefono.trim() || base.telefono,
        email: formFicha.email.trim() || base.email,
        direccion: formFicha.direccion.trim() || base.direccion,
        ciudad: formFicha.ciudad.trim() || base.ciudad,
        codigoPostal: formFicha.codigoPostal.trim() || base.codigoPostal,
        fechaActualizacion: new Date().toISOString(),
      };

      await onSavePropietario(actualizada);
      setMensajeFicha('Ficha fiscal guardada correctamente.');
      setTimeout(() => setMensajeFicha(null), 3000);
    } catch (e: any) {
      setMensajeFicha(`Error al guardar: ${e?.message || 'Revisa los campos.'}`);
    } finally {
      setGuardandoFicha(false);
    }
  };

  const handleCopyInvitacion = (prof: Profesional) => {
    const token = prof.tokenInvitacion || `inv_${prof.id}`;
    const url = `${window.location.origin}?registro=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkProfId(prof.id);
    setTimeout(() => setCopiedLinkProfId(null), 2500);
  };

  const handleToggleViviendaAsignada = async (prof: Profesional, inmuebleId: string) => {
    const current = prof.inmuebleIdsAsignados || [];
    let updated: string[];
    if (current.includes(inmuebleId)) {
      updated = current.filter((id) => id !== inmuebleId);
    } else {
      updated = [...current, inmuebleId];
    }
    await onSaveProfesional({
      ...prof,
      inmuebleIdsAsignados: updated,
    });
  };

  // PORTAL — helpers de presentación (la semántica vive en los motores).
  const nombreVivienda = (inmuebleId?: string): string => {
    const v = (inmuebles || []).find((i) => i.id === inmuebleId);
    return v?.alias || v?.direccion || 'Vivienda';
  };
  // Insignia de estado de cobro (mismos colores que CobrosSection; incluye el
  // valor heredado 'INCIDENCIA' que el motor aún contempla).
  const badgeCobroClass = (estado: EstadoCobroAlquiler | string): string =>
    (
      {
        RECIBIDO: 'bg-emerald-100 text-emerald-800',
        VERIFICADO: 'bg-blue-100 text-blue-800',
        PAGADO: 'bg-emerald-100 text-emerald-800',
        PAGADO_PARCIAL: 'bg-amber-100 text-amber-800',
        PENDIENTE: 'bg-slate-100 text-slate-700',
        RETRASADO: 'bg-rose-100 text-rose-800',
        IMPAGADO: 'bg-rose-100 text-rose-800',
        RECLAMADO: 'bg-orange-100 text-orange-800',
        DEVUELTO: 'bg-rose-100 text-rose-800',
        ANULADO: 'bg-slate-100 text-slate-500',
        INCIDENCIA: 'bg-amber-100 text-amber-800',
      } as Record<string, string>
    )[estado] || 'bg-slate-100 text-slate-700';
  const etiquetaCobro = (estado: string): string =>
    estado.charAt(0) + estado.slice(1).toLowerCase().replace(/_/g, ' ');
  const badgeGastoClass = (estado: string): string =>
    estado === 'PAGADO'
      ? 'bg-emerald-100 text-emerald-800'
      : estado === 'PENDIENTE'
        ? 'bg-amber-100 text-amber-800'
        : estado === 'EN_REVISION'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-slate-100 text-slate-500';

  return (
    <div id="propietario-portal-section" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
            <Home className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-slate-900">
                Portal del Propietario
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-md">
                PROPIETARIO
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Bienvenido, <span className="font-semibold text-slate-800">{currentUser.nombre}</span>. Gestiona tus viviendas, contratos y técnicos de confianza.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500">Viviendas en cartera</div>
            <div className="text-lg font-bold text-slate-900">{misViviendas.length}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="flex overflow-x-auto border-b border-slate-200 scrollbar-none px-4">
          {[
            { id: 'viviendas', label: 'Mis Viviendas', icon: Home, count: misViviendas.length },
            {
              id: 'profesionales',
              label: 'Mis Profesionales',
              icon: Wrench,
              count: misProfesionalesPrivados.length,
            },
            { id: 'contratos', label: 'Mis Contratos', icon: FileCheck, count: misContratos.length },
            { id: 'liquidaciones', label: 'Mis Liquidaciones', icon: Wallet, count: misLiquidaciones.length },
            { id: 'morosidad', label: 'Morosidad', icon: AlertTriangle, count: morosidadConSaldo.length },
            { id: 'gastos', label: 'Gastos', icon: TrendingDown, count: misGastos.length },
            { id: 'cobros', label: 'Cobros', icon: DollarSign, count: cobrosAtencion },
            { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle, count: incAbiertas },
            { id: 'perfil', label: 'Mi Perfil', icon: User },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* SUBTAB 1: MIS VIVIENDAS */}
          {activeSubTab === 'viviendas' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Viviendas Asignadas a Tu Cuenta ({misViviendas.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Por motivos de privacidad y seguridad, sólo puedes visualizar y operar sobre tus propias propiedades.
                  </p>
                </div>
              </div>

              {misViviendas.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                  <Home className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">
                    No tienes viviendas asignadas todavía
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Puedes crear tu primer inmueble desde aquí. Quedará vinculado a tu cuenta de propietario.
                  </p>
                  {onCrearInmueble && currentUser.propietarioId && (
                    <button
                      type="button"
                      onClick={() => onCrearInmueble(currentUser.propietarioId!)}
                      className="inline-flex items-center gap-1.5 mt-3 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      Nuevo inmueble
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {misViviendas.map((inm) => {
                    const assignedProfs = profesionales.filter((p) =>
                      p.inmuebleIdsAsignados?.includes(inm.id)
                    );

                    return (
                      <div
                        key={inm.id}
                        className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 transition-all flex flex-col justify-between shadow-xs"
                      >
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 rounded-md">
                              {inm.tipoInmueble || 'Vivienda'}
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {inm.precioRentaMensual} €/mes
                            </span>
                          </div>

                          <div>
                            <div className="font-bold text-sm text-slate-900 line-clamp-1">
                              {inm.alias || inm.direccion}
                            </div>
                            <div className="text-xs text-slate-500 line-clamp-1">
                              {inm.direccion}, {inm.ciudad} ({inm.codigoPostal})
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                            <span>{inm.habitaciones || 0} hab · {inm.banos || 0} baños</span>
                            <span>{inm.superficieConstruida || 0} m²</span>
                          </div>

                          <div className="text-xs text-slate-500 flex items-center space-x-1">
                            <Wrench className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {assignedProfs.length === 0
                                ? 'Sin técnicos asignados'
                                : `${assignedProfs.length} técnico(s) asignado(s)`}
                            </span>
                          </div>
                        </div>

                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                          {onNavigateToInmueble && (
                            <button
                              onClick={() => onNavigateToInmueble(inm.id)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1 cursor-pointer"
                            >
                              <span>Ver detalles de vivienda</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: MIS PROFESIONALES */}
          {activeSubTab === 'profesionales' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Profesionales y Servicios de Mantenimiento
                  </h3>
                  <p className="text-xs text-slate-500">
                    Consulta profesionales del catálogo público o añade tus propios operarios privados y asígnalos a tus viviendas.
                  </p>
                </div>

                <button
                  onClick={() => onOpenCrearProfesionalModal()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-2 transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Añadir Profesional Propio</span>
                </button>
              </div>

              {/* Sub-selector: Catálogo Público vs Mis Privados */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setProfesionalTab('catalogo')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 mr-4 transition-colors cursor-pointer ${
                    profesionalTab === 'catalogo'
                      ? 'border-amber-600 text-amber-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Catálogo de Profesionales ({profesionalesPublicos.length})
                </button>
                <button
                  onClick={() => setProfesionalTab('privados')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                    profesionalTab === 'privados'
                      ? 'border-amber-600 text-amber-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Mis Profesionales Propios Privados ({misProfesionalesPrivados.length})
                </button>
              </div>

              {/* Search & Filter */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, especialidad..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-xs text-slate-500 whitespace-nowrap">Especialidad:</span>
                  <select
                    value={selectedEspecialidad}
                    onChange={(e) => setSelectedEspecialidad(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                  >
                    <option value="TODAS">Todas las especialidades</option>
                    {especialidades.map((esp) => (
                      <option key={esp.id} value={esp.nombre}>
                        {esp.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* List */}
              {profesionalTab === 'privados' && misProfesionalesPrivados.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                  <Wrench className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">
                    No has añadido profesionales privados todavía
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    ¿Tienes un fontanero o electricista de confianza que aún no usa la plataforma? Añádelo manualmente y envíale un enlace de invitación.
                  </p>
                  <button
                    onClick={() => onOpenCrearProfesionalModal()}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold inline-flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir Profesional Ahora</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(profesionalTab === 'catalogo' ? profesionalesPublicos : misProfesionalesPrivados)
                    .filter((p) => {
                      const matchesSearch =
                        p.nombreComercial.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.especialidades.some((e) => e.toLowerCase().includes(searchTerm.toLowerCase()));
                      const matchesEsp =
                        selectedEspecialidad === 'TODAS' ||
                        p.especialidades.includes(selectedEspecialidad);
                      return matchesSearch && matchesEsp;
                    })
                    .map((prof) => {
                      const isCopied = copiedLinkProfId === prof.id;
                      const hasAccount = !!prof.usuarioId;

                      return (
                        <div
                          key={prof.id}
                          className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-4 shadow-xs"
                        >
                          <div>
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-bold text-sm text-slate-900">
                                  {prof.nombreComercial}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {prof.tipo} {prof.contactoNombre ? `· Contacto: ${prof.contactoNombre}` : ''}
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                  hasAccount
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {hasAccount ? 'Registrado en Plataforma' : 'Sin Cuenta (Privado)'}
                              </span>
                            </div>

                            <div className="text-xs text-slate-600 space-y-1 mt-2">
                              {prof.email && (
                                <div className="flex items-center space-x-1.5">
                                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{prof.email}</span>
                                </div>
                              )}
                              {prof.telefono && (
                                <div className="flex items-center space-x-1.5">
                                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{prof.telefono}</span>
                                </div>
                              )}
                            </div>

                            {/* Specialties */}
                            <div className="flex flex-wrap gap-1 mt-3">
                              {prof.especialidades.map((esp, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200 rounded-md"
                                >
                                  {esp}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Asignación a mis viviendas */}
                          <div className="pt-3 border-t border-slate-100 space-y-2">
                            <div className="text-xs font-semibold text-slate-800">
                              Asignar a Mis Viviendas:
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {misViviendas.map((vivienda) => {
                                const isAssigned = prof.inmuebleIdsAsignados?.includes(vivienda.id);
                                return (
                                  <button
                                    key={vivienda.id}
                                    type="button"
                                    onClick={() => handleToggleViviendaAsignada(prof, vivienda.id)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center space-x-1 ${
                                      isAssigned
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {isAssigned && <Check className="w-3 h-3" />}
                                    <span>{vivienda.alias || vivienda.direccion}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Acción Invitar si no tiene cuenta */}
                          {!hasAccount && (
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-[11px] text-slate-500">
                                Invítalo para que active su cuenta y reciba avisos:
                              </span>
                              <button
                                onClick={() => handleCopyInvitacion(prof)}
                                className="px-3 py-1 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                              >
                                {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                <span>{isCopied ? '¡Enlace Copiado!' : 'Invitar a la Plataforma'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 3: MIS CONTRATOS */}
          {activeSubTab === 'contratos' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Contratos LAU de Tus Viviendas ({misContratos.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Documentación formalizada, fechas de vigencia y rentas pactadas.
                </p>
              </div>

              {misContratos.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <FileCheck className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">No hay contratos activos</div>
                  <p className="text-xs text-slate-500">
                    Aún no se ha formalizado ningún contrato de arrendamiento sobre tus viviendas.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {misContratos.map((c) => {
                    const vivienda = inmuebles.find((i) => i.id === c.inmuebleId);
                    return (
                      <div
                        key={c.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="font-bold text-sm text-slate-900">
                            {vivienda?.alias || vivienda?.direccion || 'Vivienda en Alquiler'}
                          </div>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                            {c.estado}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 space-y-1">
                          <div>Inquilino: <span className="font-semibold">{c.candidatoNombre}</span></div>
                          <div>Renta mensual: <span className="font-semibold">{c.rentaMensual} €/mes</span></div>
                          <div>Fianza legal: {c.fianzaEuros} €</div>
                          <div>Vigencia: Desde {new Date(c.fechaInicio).toLocaleDateString()} hasta {new Date(c.fechaFin).toLocaleDateString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB: MIS LIQUIDACIONES (BLOQUE B — 2026-09-20) */}
          {activeSubTab === 'liquidaciones' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Mis Liquidaciones Mensuales ({misLiquidaciones.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Estado de cuenta: ingresos cobrados, deducciones y neto transferido. Solo se liquida lo efectivamente cobrado.
                </p>
              </div>

              {misLiquidaciones.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <DollarSign className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">Aún no tienes liquidaciones</div>
                  <p className="text-xs text-slate-500">
                    La administración genera tu liquidación mensual cuando existen cobros registrados.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {misLiquidaciones.map((l) => (
                    <div key={l.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div>
                          <div className="font-bold text-sm text-slate-900">Periodo {l.periodo}</div>
                          <div className="text-[11px] text-slate-500">
                            Bruto {formatoImporteSepa(l.totalBrutoCobrado)} € · Deducciones −{formatoImporteSepa(l.totalDeducciones)} €
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-emerald-700 text-base">{formatoImporteSepa(l.netoPropietario)} €</div>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded-md">{l.estado}</span>
                        </div>
                      </div>
                      {(l.fechaPago || l.referenciaBancariaPago) && (
                        <div className="text-[11px] text-slate-600">
                          Pagada el {l.fechaPago}{l.referenciaBancariaPago ? ` · ref. ${l.referenciaBancariaPago}` : ''}
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => setLiqDetalleId(liqDetalleId === l.id ? null : l.id)} className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold">
                          {liqDetalleId === l.id ? 'Ocultar detalle' : 'Ver detalle'}
                        </button>
                        <button onClick={() => imprimirLiquidacionPDF(l)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold">
                          Descargar PDF
                        </button>
                      </div>
                      {liqDetalleId === l.id && liqDetalle && liqDetalle.id === l.id && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          {liqDetalle.lineas.map((x) => (
                            <div key={x.id} className="flex justify-between gap-2 text-[11px]">
                              <span className="text-slate-600"><span className="font-mono text-[10px] bg-slate-100 px-1 rounded mr-1">{x.naturaleza}</span>{x.concepto}{x.detalle ? ` — ${x.detalle}` : ''}</span>
                              <span className={`font-mono font-bold whitespace-nowrap ${x.importe < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatoImporteSepa(x.importe)} €</span>
                            </div>
                          ))}
                          <div className="text-[11px] text-slate-500 pt-1">
                            Cuenta de abono: <span className="font-mono">{liqDetalle.cuentaAbonoIban}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB: MOROSIDAD (BLOQUE C — 2026-09-20). Vista de MÍNIMO PRIVILEGIO:
              solo importe, periodos y estado visible. No hay nombre del inquilino,
              datos de contacto, estrategia de recobro, póliza ni expedientes externos. */}
          {activeSubTab === 'morosidad' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Situación de impagos ({morosidadConSaldo.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Información que la administración tiene registrada sobre contratos con rentas pendientes. El detalle
                  del recobro (llamadas, requerimientos, acuerdos con la aseguradora o acciones legales) lo gestiona
                  la administración y no se publica aquí.
                </p>
              </div>

              {miMorosidad.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">Sin incidencias de impago registradas</div>
                  <p className="text-xs text-slate-500">
                    No hay ningún contrato tuyo con rentas vencidas pendientes de cobro.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap gap-x-8 gap-y-2 text-xs">
                    <div>
                      <span className="text-slate-500 block">Pendiente de cobro</span>
                      <span className="font-mono font-bold text-rose-700 text-base">
                        {formatoImporteSepa(morosidadTotalPendiente)} €
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Contratos afectados</span>
                      <span className="font-bold text-slate-800 text-base">{morosidadConSaldo.length}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Periodos impagados</span>
                      <span className="font-bold text-slate-800 text-base">
                        {morosidadConSaldo.reduce((n, r) => n + Number(r.numPeriodosImpagados || 0), 0)}
                      </span>
                    </div>
                  </div>

                  {miMorosidad.map((r) => {
                    const abierta = r.saldoPendiente > 0.009;
                    return (
                      <div key={r.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div>
                            <div className="font-bold text-sm text-slate-900">{r.inmuebleDireccion || r.inmuebleId}</div>
                            <div className="text-[11px] text-slate-500">
                              Periodos {r.periodoDesde} → {r.periodoHasta} · {r.numPeriodosImpagados} impagado(s) ·{' '}
                              {r.diasRetraso} día(s) de retraso
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`font-mono font-bold text-base ${abierta ? 'text-rose-700' : 'text-emerald-700'}`}>
                              {formatoImporteSepa(r.saldoPendiente)} €
                            </div>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                abierta ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {r.estadoEtiqueta}
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">Reclamado</span>
                            <span className="font-mono font-semibold text-slate-800">{formatoImporteSepa(r.importeTotalReclamado)} €</span>
                          </div>
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">Cubierto con cobros reales</span>
                            <span className="font-mono font-semibold text-emerald-700">{formatoImporteSepa(r.importeCubierto)} €</span>
                          </div>
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">Última actualización</span>
                            <span className="font-semibold text-slate-800">{String(r.ultimaActualizacion).slice(0, 10)}</span>
                          </div>
                        </div>
                        {r.ultimoHechoResumen && (
                          <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                            {r.ultimoHechoResumen}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-400">
                          Importes calculados desde los cobros del contrato; si un pago aún no está conciliado puede
                          aparecer pendiente hasta que la administración lo registre.
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB: GASTOS — solo lectura sobre el mismo origen que GastosSection
              (`scopedGastos`), con el resumen y las etiquetas del motor. */}
          {activeSubTab === 'gastos' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Gastos de Tus Viviendas ({gastosFiltrados.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Facturas de suministros, IBI, comunidad, seguros y reparaciones. El registro y la
                  edición los realiza la administración; aquí consultas el estado y el detalle.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap gap-x-8 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-500 block">Apuntes</span>
                  <span className="font-bold text-slate-800 text-base">{resumenMisGastos.numero}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Explotación pagada</span>
                  <span className="font-mono font-bold text-slate-800 text-base">
                    {formatoImporteSepa(resumenMisGastos.explotacionPagado)} €
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Pendiente de pago</span>
                  <span className="font-mono font-bold text-amber-700 text-base">
                    {formatoImporteSepa(resumenMisGastos.pendiente)} €
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Salida de caja pagada</span>
                  <span className="font-mono font-bold text-slate-800 text-base">
                    {formatoImporteSepa(resumenMisGastos.salidaCajaPagada)} €
                  </span>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="relative w-full lg:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={gastoSearch}
                    onChange={(e) => setGastoSearch(e.target.value)}
                    placeholder="Buscar por concepto, proveedor..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
                <select
                  value={gastoFiltroInmueble}
                  onChange={(e) => setGastoFiltroInmueble(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODOS">Todas las viviendas</option>
                  {misViviendas.map((v) => (
                    <option key={v.id} value={v.id}>{v.alias || v.direccion}</option>
                  ))}
                </select>
                <select
                  value={gastoFiltroCategoria}
                  onChange={(e) => setGastoFiltroCategoria(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODAS">Todas las categorías</option>
                  {CATEGORIAS_GASTO.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <select
                  value={gastoFiltroEstado}
                  onChange={(e) => setGastoFiltroEstado(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODOS">Todos los estados</option>
                  {Object.entries(ESTADO_GASTO_LABEL).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>

              {gastosFiltrados.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <TrendingDown className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">Sin gastos que mostrar</div>
                  <p className="text-xs text-slate-500">
                    No hay gastos registrados en tus viviendas{gastoSearch || gastoFiltroInmueble !== 'TODOS' || gastoFiltroCategoria !== 'TODAS' || gastoFiltroEstado !== 'TODOS' ? ' con estos filtros' : ''}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {gastosFiltrados.map((g) => (
                    <div key={g.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div>
                          <div className="font-bold text-sm text-slate-900">{g.concepto}</div>
                          <div className="text-[11px] text-slate-500">
                            {categoriaDef(g.categoria).label} · {nombreVivienda(g.inmuebleId)}
                            {g.periodoMesAnio ? ` · ${etiquetaMesAnio(g.periodoMesAnio)}` : g.fechaDevengo ? ` · ${g.fechaDevengo}` : ''}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-bold text-slate-900 text-base">
                            {formatoImporteSepa(g.importe)} €
                          </div>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${badgeGastoClass(g.estado)}`}>
                            {ESTADO_GASTO_LABEL[g.estado] || g.estado}
                          </span>
                        </div>
                      </div>
                      <div>
                        <button
                          onClick={() => setGastoDetalleId(gastoDetalleId === g.id ? null : g.id)}
                          className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold"
                        >
                          {gastoDetalleId === g.id ? 'Ocultar detalle' : 'Ver detalle'}
                        </button>
                      </div>
                      {gastoDetalleId === g.id && gastoDetalle && gastoDetalle.id === g.id && (
                        <div className="pt-2 border-t border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">Proveedor</span>
                            <span className="font-semibold text-slate-800">{gastoDetalle.proveedor || '—'}</span>
                          </div>
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">Tipo</span>
                            <span className="font-semibold text-slate-800">
                              {gastoDetalle.tipo === 'FINANCIACION' ? 'Financiación' : 'Explotación'}
                            </span>
                          </div>
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">A cargo de</span>
                            <span className="font-semibold text-slate-800">
                              {gastoDetalle.aCargoDe === 'arrendatario' ? 'Arrendatario' : 'Arrendador'}
                            </span>
                          </div>
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">Deducible IRPF</span>
                            <span className="font-semibold text-slate-800">
                              {gastoDetalle.deducible === true ? 'Sí' : gastoDetalle.deducible === false ? 'No' : '—'}
                            </span>
                          </div>
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">Devengo / Pago</span>
                            <span className="font-semibold text-slate-800">
                              {gastoDetalle.fechaDevengo || '—'} / {gastoDetalle.fechaPago || '—'}
                            </span>
                          </div>
                          <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-500 block">Método de pago</span>
                            <span className="font-semibold text-slate-800 capitalize">{gastoDetalle.metodoPago || '—'}</span>
                          </div>
                          {gastoDetalle.tipo === 'FINANCIACION' && (gastoDetalle.intereses || gastoDetalle.capitalAmortizado) ? (
                            <>
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Intereses</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {formatoImporteSepa(gastoDetalle.intereses || 0)} €
                                </span>
                              </div>
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Capital amortizado</span>
                                <span className="font-mono font-semibold text-slate-800">
                                  {formatoImporteSepa(gastoDetalle.capitalAmortizado || 0)} €
                                </span>
                              </div>
                            </>
                          ) : null}
                          {gastoDetalle.notas ? (
                            <div className="border border-slate-100 rounded-lg px-2.5 py-1.5 col-span-2 md:col-span-3">
                              <span className="text-slate-500 block">Notas</span>
                              <span className="text-slate-700">{gastoDetalle.notas}</span>
                            </div>
                          ) : null}
                          {(gastoDetalle.justificanteUrl || gastoDetalle.documento?.url) ? (
                            <div className="col-span-2 md:col-span-3">
                              <a
                                href={(gastoDetalle.justificanteUrl || gastoDetalle.documento?.url) as string}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                              >
                                Ver justificante / factura
                              </a>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB: COBROS — solo lectura; periodos derivados de mis contratos con
              el motor (`actualizarEstadosVencimiento` + `obtenerTodosCobros`),
              igual que CobrosSection. Sin datos de contacto del inquilino. */}
          {activeSubTab === 'cobros' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Cobros de Renta ({cobrosFiltrados.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Mensualidades previstas y recibidas por contrato. El registro de pagos lo realiza
                  la administración; si un pago reciente aún no aparece, está pendiente de conciliar.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap gap-x-8 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-500 block">Previsto</span>
                  <span className="font-mono font-bold text-slate-800 text-base">
                    {formatoImporteSepa(resumenMisCobros.totalPrevisto)} €
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Recibido ({resumenMisCobros.porcentajeCobrado} %)</span>
                  <span className="font-mono font-bold text-emerald-700 text-base">
                    {formatoImporteSepa(resumenMisCobros.totalRecibido)} €
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Pendiente + retrasado</span>
                  <span className="font-mono font-bold text-rose-700 text-base">
                    {formatoImporteSepa(resumenMisCobros.totalPendiente + resumenMisCobros.totalRetrasado)} €
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Periodos que requieren atención</span>
                  <span className="font-bold text-slate-800 text-base">{cobrosAtencion}</span>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="relative w-full lg:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={cobroSearch}
                    onChange={(e) => setCobroSearch(e.target.value)}
                    placeholder="Buscar por mes, vivienda, inquilino..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
                <select
                  value={cobroFiltroInmueble}
                  onChange={(e) => setCobroFiltroInmueble(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODOS">Todas las viviendas</option>
                  {misViviendas.map((v) => (
                    <option key={v.id} value={v.id}>{v.alias || v.direccion}</option>
                  ))}
                </select>
                <select
                  value={cobroFiltroEstado}
                  onChange={(e) => setCobroFiltroEstado(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODOS">Todos los estados</option>
                  {Array.from(new Set(misCobros.map((c) => c.estado))).sort().map((e) => (
                    <option key={e} value={e}>{etiquetaCobro(e)}</option>
                  ))}
                </select>
              </div>

              {cobrosFiltrados.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <DollarSign className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">Sin periodos que mostrar</div>
                  <p className="text-xs text-slate-500">
                    No hay mensualidades generadas{cobroSearch || cobroFiltroInmueble !== 'TODOS' || cobroFiltroEstado !== 'TODOS' ? ' con estos filtros' : ' todavía'}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cobrosFiltrados.map((c) => {
                    const pendiente = (c.importePrevisto || 0) - (c.importeRecibido || 0);
                    return (
                      <div key={c.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div>
                            <div className="font-bold text-sm text-slate-900">{c.nombreMes}</div>
                            <div className="text-[11px] text-slate-500">
                              {c.inmuebleDireccion || nombreVivienda(c.inmuebleId)}
                              {c.inquilinoNombre ? ` · ${c.inquilinoNombre}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-slate-900 text-base">
                              {formatoImporteSepa(c.importeRecibido)} / {formatoImporteSepa(c.importePrevisto)} €
                            </div>
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${badgeCobroClass(c.estado)}`}>
                              {etiquetaCobro(c.estado)}
                            </span>
                          </div>
                        </div>
                        <div>
                          <button
                            onClick={() => setCobroDetalleId(cobroDetalleId === c.id ? null : c.id)}
                            className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold"
                          >
                            {cobroDetalleId === c.id ? 'Ocultar detalle' : 'Ver detalle'}
                          </button>
                        </div>
                        {cobroDetalleId === c.id && cobroDetalle && cobroDetalle.id === c.id && (
                          <div className="pt-2 border-t border-slate-100 grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                            <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-slate-500 block">Vencimiento</span>
                              <span className="font-semibold text-slate-800">{cobroDetalle.fechaVencimiento || '—'}</span>
                            </div>
                            <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-slate-500 block">Fecha de pago</span>
                              <span className="font-semibold text-slate-800">{cobroDetalle.fechaPago || '—'}</span>
                            </div>
                            <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-slate-500 block">Pendiente del periodo</span>
                              <span className={`font-mono font-semibold ${pendiente > 0.009 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {formatoImporteSepa(Math.max(pendiente, 0))} €
                              </span>
                            </div>
                            <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-slate-500 block">Método de pago</span>
                              <span className="font-semibold text-slate-800 capitalize">{cobroDetalle.metodoPago || '—'}</span>
                            </div>
                            <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-slate-500 block">Justificante</span>
                              <span className="font-semibold text-slate-800">
                                {cobroDetalle.justificante ? 'Aportado' : '—'}
                              </span>
                            </div>
                            {cobroDetalle.observaciones ? (
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5 col-span-2 md:col-span-3">
                                <span className="text-slate-500 block">Observaciones</span>
                                <span className="text-slate-700">{cobroDetalle.observaciones}</span>
                              </div>
                            ) : null}
                            {cobroDetalle.motivoIncidencia ? (
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5 col-span-2 md:col-span-3">
                                <span className="text-slate-500 block">Motivo de incidencia</span>
                                <span className="text-slate-700">{cobroDetalle.motivoIncidencia}</span>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB: INCIDENCIAS — solo lectura sobre `scopedIncidencias` con la
              puerta `canAccessIncidencia` y el filtro `filtrarIncidencias` del
              motor. No se muestran notas internas ni teléfonos de contacto. */}
          {activeSubTab === 'incidencias' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Incidencias de Tus Viviendas ({incidenciasFiltradas.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Avisos reportados, reparaciones en curso y resoluciones. La gestión (asignación,
                  presupuestos y cierre) la realiza la administración con tus profesionales.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap gap-x-8 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-500 block">Abiertas o en curso</span>
                  <span className="font-bold text-slate-800 text-base">{incAbiertas}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Total registradas</span>
                  <span className="font-bold text-slate-800 text-base">{misIncidencias.length}</span>
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                <div className="relative w-full lg:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={incSearch}
                    onChange={(e) => setIncSearch(e.target.value)}
                    placeholder="Buscar por título, descripción..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
                <select
                  value={incFiltroInmueble}
                  onChange={(e) => setIncFiltroInmueble(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODOS">Todas las viviendas</option>
                  {misViviendas.map((v) => (
                    <option key={v.id} value={v.id}>{v.alias || v.direccion}</option>
                  ))}
                </select>
                <select
                  value={incFiltroCategoria}
                  onChange={(e) => setIncFiltroCategoria(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODAS">Todas las categorías</option>
                  {Object.entries(CATEGORIA_INCIDENCIA_LABEL).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
                <select
                  value={incFiltroPrioridad}
                  onChange={(e) => setIncFiltroPrioridad(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODAS">Todas las prioridades</option>
                  {Object.entries(PRIORIDADES_INCIDENCIA_LABELS).map(([v, meta]) => (
                    <option key={v} value={v}>{meta.label}</option>
                  ))}
                </select>
                <select
                  value={incFiltroEstado}
                  onChange={(e) => setIncFiltroEstado(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                >
                  <option value="TODOS">Todos los estados</option>
                  {Object.entries(ESTADOS_INCIDENCIA_LABELS).map(([v, meta]) => (
                    <option key={v} value={v}>{meta.label}</option>
                  ))}
                </select>
              </div>

              {incidenciasFiltradas.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">Sin incidencias que mostrar</div>
                  <p className="text-xs text-slate-500">
                    No hay incidencias registradas{incSearch || incFiltroInmueble !== 'TODOS' || incFiltroCategoria !== 'TODAS' || incFiltroPrioridad !== 'TODAS' || incFiltroEstado !== 'TODOS' ? ' con estos filtros' : ' en tus viviendas'}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incidenciasFiltradas.map((x) => {
                    const est = ESTADOS_INCIDENCIA_LABELS[x.estado];
                    const pri = PRIORIDADES_INCIDENCIA_LABELS[x.prioridad];
                    return (
                      <div key={x.id} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div>
                            <div className="font-bold text-sm text-slate-900">
                              {x.numero ? `${x.numero} · ` : ''}{x.titulo}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {CATEGORIA_INCIDENCIA_LABEL[x.categoria] || x.categoria} ·{' '}
                              {x.inmuebleDireccion || nombreVivienda(x.inmuebleId)}
                              {x.fechaCreacion ? ` · ${String(x.fechaCreacion).slice(0, 10)}` : ''}
                            </div>
                          </div>
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            {est ? (
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${est.badgeClass}`}>
                                {est.label}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-700">
                                {x.estado}
                              </span>
                            )}
                            {pri ? (
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${pri.badgeClass}`}>
                                {pri.label}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div>
                          <button
                            onClick={() => setIncDetalleId(incDetalleId === x.id ? null : x.id)}
                            className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold"
                          >
                            {incDetalleId === x.id ? 'Ocultar detalle' : 'Ver detalle'}
                          </button>
                        </div>
                        {incDetalleId === x.id && incDetalle && incDetalle.id === x.id && (
                          <div className="pt-2 border-t border-slate-100 space-y-2 text-[11px]">
                            <p className="text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                              {incDetalle.descripcion}
                            </p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Origen del aviso</span>
                                <span className="font-semibold text-slate-800">
                                  {ORIGEN_INCIDENCIA_LABEL[incDetalle.origen] || incDetalle.origen || '—'}
                                </span>
                              </div>
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Profesional asignado</span>
                                <span className="font-semibold text-slate-800">
                                  {incDetalle.profesionalAsignadoNombre ||
                                    incDetalle.trabajoProfesional?.profesionalNombre ||
                                    'Pendiente de asignar'}
                                </span>
                              </div>
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Inquilino</span>
                                <span className="font-semibold text-slate-800">{incDetalle.inquilinoNombre || '—'}</span>
                              </div>
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Compromiso / Inicio</span>
                                <span className="font-semibold text-slate-800">
                                  {incDetalle.fechaCompromiso ? String(incDetalle.fechaCompromiso).slice(0, 10) : '—'}
                                  {' / '}
                                  {incDetalle.fechaInicioReparacion ? String(incDetalle.fechaInicioReparacion).slice(0, 10) : '—'}
                                </span>
                              </div>
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Cierre</span>
                                <span className="font-semibold text-slate-800">
                                  {incDetalle.fechaCierre ? String(incDetalle.fechaCierre).slice(0, 10) : '—'}
                                </span>
                              </div>
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Evidencias</span>
                                <span className="font-semibold text-slate-800">
                                  {(incDetalle.fotografias?.length || 0) + (incDetalle.fotos?.length || 0)} foto(s) ·{' '}
                                  {incDetalle.documentos?.length || 0} doc(s)
                                </span>
                              </div>
                            </div>
                            {typeof incDetalle.resolucion === 'string' && incDetalle.resolucion ? (
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Resolución</span>
                                <span className="text-slate-700">{incDetalle.resolucion}</span>
                              </div>
                            ) : null}
                            {incDetalle.observaciones ? (
                              <div className="border border-slate-100 rounded-lg px-2.5 py-1.5">
                                <span className="text-slate-500 block">Observaciones</span>
                                <span className="text-slate-700">{incDetalle.observaciones}</span>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 7: MI PERFIL */}
          {activeSubTab === 'perfil' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Datos de Tu Cuenta</h3>
                <p className="text-xs text-slate-500">
                  Información asociada a tu perfil de acceso y ficha fiscal
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Nombre completo:</span>
                  <span className="font-semibold text-slate-900">
                    {currentUser.nombre} {currentUser.apellidos || ''}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-semibold text-slate-900">{currentUser.email}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Teléfono:</span>
                  <span className="font-semibold text-slate-900">{currentUser.telefono || 'No indicado'}</span>
                </div>
                {miFichaPropietario && (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">NIF/CIF Fiscal:</span>
                      <span className="font-semibold text-slate-900">{miFichaPropietario.nifCif}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Domicilio de Notificaciones:</span>
                      <span className="font-semibold text-slate-900">
                        {miFichaPropietario.direccion}, {miFichaPropietario.ciudad}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Viviendas en propiedad autorizadas:</span>
                  <span className="font-bold text-blue-700">{misViviendas.length} viviendas</span>
                </div>
              </div>

              {puedeEditarFicha && formFicha && (
                <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Mi Ficha Fiscal</h4>
                    <p className="text-xs text-slate-500">
                      Estos datos se guardan en tu ficha de propietario y se conservan al recargar.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs font-semibold text-slate-600">Nombre y apellidos / Razón social</span>
                      <input
                        type="text"
                        value={formFicha.nombre}
                        onChange={(e) => setFormFicha({ ...formFicha, nombre: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">NIF / CIF / NIE</span>
                      <input
                        type="text"
                        value={formFicha.nifCif}
                        onChange={(e) => setFormFicha({ ...formFicha, nifCif: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">Teléfono</span>
                      <input
                        type="tel"
                        value={formFicha.telefono}
                        onChange={(e) => setFormFicha({ ...formFicha, telefono: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs font-semibold text-slate-600">Email de contacto</span>
                      <input
                        type="email"
                        value={formFicha.email}
                        onChange={(e) => setFormFicha({ ...formFicha, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs font-semibold text-slate-600">Domicilio a efectos de notificaciones</span>
                      <input
                        type="text"
                        value={formFicha.direccion}
                        onChange={(e) => setFormFicha({ ...formFicha, direccion: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">Ciudad</span>
                      <input
                        type="text"
                        value={formFicha.ciudad}
                        onChange={(e) => setFormFicha({ ...formFicha, ciudad: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">Código postal</span>
                      <input
                        type="text"
                        value={formFicha.codigoPostal}
                        onChange={(e) => setFormFicha({ ...formFicha, codigoPostal: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleGuardarFicha}
                      disabled={guardandoFicha}
                      className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>{guardandoFicha ? 'Guardando…' : 'Guardar Mi Ficha'}</span>
                    </button>
                    {mensajeFicha && (
                      <span className="text-xs font-semibold text-slate-600">{mensajeFicha}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
