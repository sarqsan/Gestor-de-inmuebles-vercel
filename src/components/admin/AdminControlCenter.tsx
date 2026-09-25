import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  Building2,
  UserCheck,
  Wrench,
  Settings,
  Shield,
  LogOut,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  Plus,
  ExternalLink,
  Eye,
  Pencil,
  FileText,
  ShieldCheck,
  Copy,
  Check,
  Building,
  Tag,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  MapPin,
  Calendar,
} from 'lucide-react';
import {
  UsuarioApp,
  Inmueble,
  Propietario,
  Profesional,
  ContratoFormalizacion,
  AuditLog,
  EnlaceRegistro,
  Especialidad,
  ModulosConfig,
  ROLES_PREDEFINIDOS,
  PERMISOS_SISTEMA,
} from '../../types';
import {
  buildPrefillUsuarioDesdePropietario,
  buildUrlInvitacion,
  esInvitacionNominalPropietario,
} from '../../lib/accesoPropietarios';

import { esUsuarioMaster } from '../../lib/adminUsuarios';
import { DryRunFichasPublicasPanel } from './DryRunFichasPublicasPanel';

interface AdminControlCenterProps {
  currentUser: UsuarioApp;
  usuarios: UsuarioApp[];
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  profesionales: Profesional[];
  contratos: ContratoFormalizacion[];
  auditLogs: AuditLog[];
  enlacesRegistro: EnlaceRegistro[];
  especialidades: Especialidad[];
  modulosConfig?: ModulosConfig;
  onLogout: () => void;
  onSaveUsuario: (usuario: UsuarioApp) => Promise<void>;
  onDeleteUsuario: (id: string) => Promise<void>;
  /** Baja segura de acceso (INACTIVO + auditoría; nunca borra datos). */
  onBajaUsuario?: (id: string, motivo?: string) => Promise<void>;
  onSaveEnlaceRegistro: (enlace: EnlaceRegistro) => Promise<void>;
  onDeleteEnlaceRegistro: (id: string) => Promise<void>;
  onSaveEspecialidad: (especialidad: Especialidad) => Promise<void>;
  onDeleteEspecialidad: (id: string) => Promise<void>;
  onSaveModulosConfig?: (config: ModulosConfig) => Promise<void>;
  onOpenCrearUsuarioModal: (prefill?: Partial<UsuarioApp>) => void;
  onOpenCrearEnlaceModal: () => void;
  /** Sección inicial (por defecto 'dashboard'). */
  seccionInicial?: AdminSection;
}

type AdminSection =
  | 'dashboard'
  | 'usuarios'
  | 'inmuebles'
  | 'propietarios'
  | 'profesionales'
  | 'configuracion'
  | 'auditoria';

export interface BajaUsuarioConfirmacionProps {
  usuario: UsuarioApp;
  motivo: string;
  onMotivoChange: (v: string) => void;
  error: string;
  guardando: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmación explícita de baja de acceso: retira el acceso (INACTIVO)
 * conservando todos los datos patrimoniales e históricos. Nunca borra.
 */
export const BajaUsuarioConfirmacion: React.FC<BajaUsuarioConfirmacionProps> = ({
  usuario,
  motivo,
  onMotivoChange,
  error,
  guardando,
  onConfirm,
  onCancel,
}) => (
  <div
    data-testid="baja-confirmacion"
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
  >
    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4">
      <div>
        <h3 className="text-base font-bold text-white">Dar de baja de acceso</h3>
        <p className="text-xs text-slate-400 mt-1">
          {usuario.nombre} · {usuario.email} · {usuario.tipoPerfil}
        </p>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed">
        Esta operación retirará el acceso del usuario (pasará a INACTIVO), pero conservará
        su ficha patrimonial, inmuebles, contratos, documentos, históricos y auditoría.
        No se elimina ningún dato patrimonial.
      </p>
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Motivo (opcional)
        </label>
        <input
          type="text"
          value={motivo}
          onChange={(e) => onMotivoChange(e.target.value)}
          placeholder="Ej. Fin de la relación contractual"
          data-testid="baja-motivo"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
        />
      </div>
      {error && (
        <div
          data-testid="baja-error"
          className="p-3 bg-red-950/40 border border-red-800/60 text-red-400 rounded-xl text-xs font-medium"
        >
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={guardando}
          className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={guardando}
          data-testid="baja-confirmar"
          className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors disabled:opacity-50"
        >
          {guardando ? 'Tramitando baja…' : 'Confirmar baja'}
        </button>
      </div>
    </div>
  </div>
);

export const AdminControlCenter: React.FC<AdminControlCenterProps> = ({
  currentUser,
  usuarios,
  inmuebles,
  propietarios,
  profesionales,
  contratos,
  auditLogs,
  enlacesRegistro,
  especialidades,
  modulosConfig,
  onLogout,
  onSaveUsuario,
  onDeleteUsuario,
  onBajaUsuario,
  onSaveEnlaceRegistro,
  onDeleteEnlaceRegistro,
  onSaveEspecialidad,
  onDeleteEspecialidad,
  onSaveModulosConfig,
  onOpenCrearUsuarioModal,
  onOpenCrearEnlaceModal,
  seccionInicial,
}) => {
  const [activeSection, setActiveSection] = useState<AdminSection>(seccionInicial ?? 'dashboard');

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [userProfileFilter, setUserProfileFilter] = useState<string>('TODOS');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('TODOS');

  // Inmuebles filters
  const [inmuebleSearch, setInmuebleSearch] = useState('');
  const [inmuebleEstadoFilter, setInmuebleEstadoFilter] = useState<string>('TODOS');
  const [inmueblePropietarioFilter, setInmueblePropietarioFilter] = useState<string>('TODOS');
  const [selectedInmuebleDossier, setSelectedInmuebleDossier] = useState<Inmueble | null>(null);

  // Propietario modal
  const [selectedPropietarioDetail, setSelectedPropietarioDetail] = useState<Propietario | null>(null);

  // Specialty state
  const [nuevaEspecialidad, setNuevaEspecialidad] = useState('');
  const [copiedEnlaceId, setCopiedEnlaceId] = useState<string | null>(null);

  // Baja segura de acceso (confirmación explícita + motivo)
  const [bajaPendiente, setBajaPendiente] = useState<UsuarioApp | null>(null);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [bajaError, setBajaError] = useState('');
  const [bajaGuardando, setBajaGuardando] = useState(false);

  // Computed Indicators
  const totalUsuarios = usuarios.length;
  const totalPropietarios = propietarios.length;
  const totalProfesionales = profesionales.length;
  const totalInmuebles = inmuebles.length;
  const totalContratos = contratos.length;
  const viviendasAlquiladas = inmuebles.filter(
    (i) => i.estado === 'alquilado' || i.estado === 'reservado'
  ).length;
  const viviendasDisponibles = inmuebles.filter((i) => i.estado === 'disponible').length;
  const totalAuditLogs = auditLogs.length;

  const tasaOcupacion =
    totalInmuebles > 0 ? Math.round((viviendasAlquiladas / totalInmuebles) * 100) : 0;

  // Toggle user state
  const handleToggleBloqueoUsuario = async (usr: UsuarioApp) => {
    if (usr.id === currentUser.id) {
      alert('No puedes bloquear tu propia cuenta de administrador.');
      return;
    }
    const nuevoEstado = usr.estado === 'BLOQUEADO' ? 'ACTIVO' : 'BLOQUEADO';
    await onSaveUsuario({
      ...usr,
      estado: nuevoEstado,
      updatedAt: new Date().toISOString(),
    });
  };

  // Add specialty
  const handleAddEspecialidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaEspecialidad.trim()) return;
    const nueva: Especialidad = {
      id: `esp_${Date.now()}`,
      nombre: nuevaEspecialidad.trim(),
      activa: true,
      orden: especialidades.length + 1,
    };
    await onSaveEspecialidad(nueva);
    setNuevaEspecialidad('');
  };

  // Toggle Module
  const handleToggleModulo = async (key: keyof ModulosConfig) => {
    if (!modulosConfig || !onSaveModulosConfig) return;
    await onSaveModulosConfig({
      ...modulosConfig,
      [key]: !modulosConfig[key],
    });
  };

  // Copy link helper (nominal → URL por ID directo; genérica → URL por token)
  const handleCopyLink = (enlace: EnlaceRegistro) => {
    const url = buildUrlInvitacion(enlace, window.location.origin);
    navigator.clipboard.writeText(url);
    setCopiedEnlaceId(enlace.id);
    setTimeout(() => setCopiedEnlaceId(null), 2500);
  };

  // Filtered Users
  const filteredUsuarios = useMemo(() => {
    return usuarios.filter((u) => {
      const matchesSearch =
        u.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.apellidos && u.apellidos.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesProfile = userProfileFilter === 'TODOS' || u.tipoPerfil === userProfileFilter;
      const matchesStatus = userStatusFilter === 'TODOS' || u.estado === userStatusFilter;
      return matchesSearch && matchesProfile && matchesStatus;
    });
  }, [usuarios, searchQuery, userProfileFilter, userStatusFilter]);

  // Filtered Inmuebles for Global Inspection
  const filteredInmuebles = useMemo(() => {
    return inmuebles.filter((inm) => {
      const matchesSearch =
        inm.direccion.toLowerCase().includes(inmuebleSearch.toLowerCase()) ||
        inm.ciudad.toLowerCase().includes(inmuebleSearch.toLowerCase()) ||
        (inm.nombre && inm.nombre.toLowerCase().includes(inmuebleSearch.toLowerCase()));
      const matchesEstado =
        inmuebleEstadoFilter === 'TODOS' || inm.estado === inmuebleEstadoFilter;
      const matchesPropietario =
        inmueblePropietarioFilter === 'TODOS' ||
        inm.propietarioPrincipalId === inmueblePropietarioFilter;
      return matchesSearch && matchesEstado && matchesPropietario;
    });
  }, [inmuebles, inmuebleSearch, inmuebleEstadoFilter, inmueblePropietarioFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row antialiased">
      {/* Sidebar de Administración Global */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        {/* Header de Marca */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-white text-base tracking-tight leading-tight">
                RentSelect
              </h1>
              <p className="text-[10px] text-purple-400 font-semibold tracking-wider uppercase">
                Centro de Control
              </p>
            </div>
          </div>
        </div>

        {/* Info del Administrador Autenticado */}
        <div className="p-4 mx-3 my-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold">
              {currentUser.nombre.charAt(0)}
            </div>
            <div className="truncate">
              <p className="font-semibold text-white truncate">{currentUser.nombre}</p>
              <p className="text-[10px] text-purple-300/80 font-mono truncate">{currentUser.email}</p>
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
            <span className="text-slate-400">Rol:</span>
            <span className="font-bold text-purple-300 uppercase tracking-wide">
              {currentUser.roles?.[0] || 'SUPERADMIN'}
            </span>
          </div>
        </div>

        {/* Navegación Administrativa */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Navegación de Plataforma
          </div>

          <button
            onClick={() => setActiveSection('dashboard')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'dashboard'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard Global</span>
          </button>

          <button
            onClick={() => setActiveSection('usuarios')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'usuarios'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4" />
              <span>Gestión de Usuarios</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {totalUsuarios}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('inmuebles')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'inmuebles'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4" />
              <span>Inmuebles Plataforma</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {totalInmuebles}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('propietarios')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'propietarios'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <UserCheck className="w-4 h-4" />
              <span>Propietarios</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {totalPropietarios}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('profesionales')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'profesionales'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <Wrench className="w-4 h-4" />
              <span>Profesionales & Gremios</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {totalProfesionales}
            </span>
          </button>

          <button
            onClick={() => setActiveSection('configuracion')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'configuracion'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Configuración & Módulos</span>
          </button>

          <button
            onClick={() => setActiveSection('auditoria')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeSection === 'auditoria'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
            }`}
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4" />
              <span>Registro de Auditoría</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
              {totalAuditLogs}
            </span>
          </button>
        </nav>

        {/* Footer con Botón de Logout Real */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 hover:text-rose-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-950">
        {/* Top bar */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-purple-400 mb-1">
              <span>Centro de Control</span>
              <span>/</span>
              <span className="text-slate-300 capitalize">{activeSection}</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {activeSection === 'dashboard' && 'Dashboard de Supervisión Global'}
              {activeSection === 'usuarios' && 'Gestión y Seguridad de Usuarios'}
              {activeSection === 'inmuebles' && 'Consulta Global de Inmuebles en la Plataforma'}
              {activeSection === 'propietarios' && 'Directorio de Propietarios Registrados'}
              {activeSection === 'profesionales' && 'Directorio de Profesionales y Gremios'}
              {activeSection === 'configuracion' && 'Parámetros, Módulos y Enlaces de Registro'}
              {activeSection === 'auditoria' && 'Registro Inmutable de Auditoría'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Supervisión de arquitectura, control de acceso y telemetría de RentSelect
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Firebase Auth Verificado</span>
            </div>
            {activeSection === 'usuarios' && (
              <button
                onClick={onOpenCrearUsuarioModal}
                className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md shadow-blue-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Usuario</span>
              </button>
            )}
            {activeSection === 'configuracion' && (
              <button
                onClick={onOpenCrearEnlaceModal}
                className="flex items-center gap-2 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md shadow-purple-600/20"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Enlace de Invitación</span>
              </button>
            )}
          </div>
        </header>

        {/* SUB-VIEW 1: DASHBOARD GLOBAL */}
        {activeSection === 'dashboard' && (
          <div className="space-y-6">
            {/* KPIs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Usuarios Totales</span>
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold text-white">{totalUsuarios}</div>
                <div className="mt-2 text-[11px] text-slate-500">
                  {propietarios.length} prop. · {profesionales.length} prof.
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Inmuebles en Plataforma</span>
                  <Building2 className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold text-white">{totalInmuebles}</div>
                <div className="mt-2 text-[11px] text-slate-500">
                  {viviendasDisponibles} disp. · {viviendasAlquiladas} alquiladas
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Tasa de Ocupación</span>
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400">{tasaOcupacion}%</div>
                <div className="mt-2 text-[11px] text-slate-500">
                  {viviendasAlquiladas} viviendas arrendadas
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Eventos de Auditoría</span>
                  <Shield className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl font-bold text-white">{totalAuditLogs}</div>
                <div className="mt-2 text-[11px] text-slate-500">Registro inmutable activo</div>
              </div>
            </div>

            {/* Platform Health and Recent Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Actividad Reciente del Sistema</h3>
                  <button
                    onClick={() => setActiveSection('auditoria')}
                    className="text-xs text-purple-400 hover:text-purple-300 font-semibold cursor-pointer"
                  >
                    Ver auditoría completa &rarr;
                  </button>
                </div>

                <div className="space-y-3">
                  {auditLogs.slice(0, 6).map((log) => (
                    <div
                      key={log.id}
                      className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-start justify-between text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{log.accion}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.resultado === 'EXITO'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {log.resultado}
                          </span>
                        </div>
                        <p className="text-slate-400">{log.descripcion}</p>
                      </div>
                      <div className="text-[10px] text-slate-500 shrink-0 font-mono">
                        {new Date(log.fechaHora).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                  ))}
                  {auditLogs.length === 0 && (
                    <p className="text-xs text-slate-500 py-6 text-center">
                      No hay registros de auditoría recientes.
                    </p>
                  )}
                </div>
              </div>

              {/* Status breakdown */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-4">Distribución del Parque Inmobiliario</h3>
                  <div className="space-y-4 text-xs">
                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Disponibles en Alquiler</span>
                        <span className="font-bold">{viviendasDisponibles}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{
                            width: `${
                              totalInmuebles > 0 ? (viviendasDisponibles / totalInmuebles) * 100 : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Alquiladas / Arrendadas</span>
                        <span className="font-bold">{viviendasAlquiladas}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{
                            width: `${
                              totalInmuebles > 0 ? (viviendasAlquiladas / totalInmuebles) * 100 : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-slate-300 mb-1">
                        <span>Contratos LAU Formalizados</span>
                        <span className="font-bold">{totalContratos}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-400">
                  <p className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>Todas las consultas se ejecutan con permisos globales de administración.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB-VIEW 2: USUARIOS */}
        {activeSection === 'usuarios' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre o correo..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <select
                  value={userProfileFilter}
                  onChange={(e) => setUserProfileFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                >
                  <option value="TODOS">Todos los Perfiles</option>
                  <option value="ADMINISTRADOR">Administradores</option>
                  <option value="PROPIETARIO">Propietarios</option>
                  <option value="PROFESIONAL">Profesionales</option>
                  <option value="INQUILINO">Inquilinos</option>
                </select>

                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                >
                  <option value="TODOS">Todos los Estados</option>
                  <option value="ACTIVO">Activos</option>
                  <option value="PENDIENTE">Pendientes</option>
                  <option value="INACTIVO">Inactivos</option>
                  <option value="BLOQUEADO">Bloqueados</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-4">Usuario</th>
                      <th className="p-4">Email</th>
                      <th className="p-4">Perfil</th>
                      <th className="p-4">Auth UID</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4">Fecha Alta</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredUsuarios.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-semibold text-white">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 text-xs">
                              {u.nombre.charAt(0)}
                            </div>
                            <div>
                              <span>{u.nombre} {u.apellidos || ''}</span>
                              {u.roles?.includes('SUPERADMIN') && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                                  SUPERADMIN
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-slate-400">{u.email}</td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              u.tipoPerfil === 'ADMINISTRADOR'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : u.tipoPerfil === 'PROPIETARIO'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {u.tipoPerfil}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-slate-500 text-[11px] truncate max-w-[120px]">
                          {u.authUid ? u.authUid.substring(0, 10) + '...' : <span className="text-slate-600">Pendiente login</span>}
                        </td>
                        <td className="p-4">
                          {u.estado === 'ACTIVO' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Activo</span>
                            </span>
                          ) : u.estado === 'BLOQUEADO' ? (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Bloqueado</span>
                            </span>
                          ) : u.estado === 'INACTIVO' ? (
                            <span className="inline-flex items-center gap-1 text-amber-400 font-semibold">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Inactivo</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-blue-400 font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Pendiente</span>
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-slate-500">
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => onOpenCrearUsuarioModal(u)}
                            title="Editar usuario"
                            data-testid={`editar-usuario-${u.id}`}
                            className="px-2.5 py-1 mr-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-blue-950/40 text-blue-400 border border-blue-800/60 hover:bg-blue-900/60"
                          >
                            <Pencil className="w-3.5 h-3.5 inline-block" />
                          </button>
                          {u.id !== currentUser.id &&
                            !esUsuarioMaster(u) &&
                            !u.roles?.includes('SUPERADMIN') &&
                            (u.estado === 'ACTIVO' || u.estado === 'BLOQUEADO') && (
                              <button
                                onClick={() => {
                                  setBajaPendiente(u);
                                  setMotivoBaja('');
                                  setBajaError('');
                                }}
                                title="Dar de baja de acceso (conserva datos patrimoniales)"
                                data-testid={`baja-usuario-${u.id}`}
                                className="px-2.5 py-1 mr-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-amber-950/40 text-amber-400 border border-amber-800/60 hover:bg-amber-900/60"
                              >
                                Dar de baja
                              </button>
                            )}
                          {u.id !== currentUser.id && (
                            <button
                              onClick={() => handleToggleBloqueoUsuario(u)}
                              title={u.estado === 'BLOQUEADO' ? 'Desbloquear cuenta' : 'Bloquear cuenta'}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                u.estado === 'BLOQUEADO'
                                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/60'
                                  : 'bg-rose-950/40 text-rose-400 border border-rose-800/60 hover:bg-rose-900/60'
                              }`}
                            >
                              {u.estado === 'BLOQUEADO' ? 'Desbloquear' : 'Bloquear'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {bajaPendiente && (
              <BajaUsuarioConfirmacion
                usuario={bajaPendiente}
                motivo={motivoBaja}
                onMotivoChange={setMotivoBaja}
                error={bajaError}
                guardando={bajaGuardando}
                onCancel={() => {
                  setBajaPendiente(null);
                  setBajaError('');
                }}
                onConfirm={async () => {
                  setBajaGuardando(true);
                  setBajaError('');
                  try {
                    await onBajaUsuario?.(bajaPendiente.id, motivoBaja.trim() || undefined);
                    setBajaPendiente(null);
                    setMotivoBaja('');
                  } catch (err: any) {
                    setBajaError(err?.message || 'No se pudo completar la baja.');
                  } finally {
                    setBajaGuardando(false);
                  }
                }}
              />
            )}
          </div>
        )}

        {/* SUB-VIEW 3: INMUEBLES DE LA PLATAFORMA */}
        {activeSection === 'inmuebles' && (
          <div className="space-y-4">
            {/* Search & Filters */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inmuebleSearch}
                  onChange={(e) => setInmuebleSearch(e.target.value)}
                  placeholder="Buscar por dirección o ciudad..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <select
                  value={inmuebleEstadoFilter}
                  onChange={(e) => setInmuebleEstadoFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                >
                  <option value="TODOS">Todos los Estados</option>
                  <option value="disponible">Disponible</option>
                  <option value="alquilado">Alquilado</option>
                  <option value="reservado">Reservado</option>
                  <option value="en_reforma">En Reforma</option>
                </select>

                <select
                  value={inmueblePropietarioFilter}
                  onChange={(e) => setInmueblePropietarioFilter(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                >
                  <option value="TODOS">Todos los Propietarios</option>
                  {propietarios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Inmuebles Global Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-4">Inmueble / Dirección</th>
                      <th className="p-4">Ubicación</th>
                      <th className="p-4">Propietario</th>
                      <th className="p-4">Renta Mensual</th>
                      <th className="p-4">Estado</th>
                      <th className="p-4 text-right">Ficha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredInmuebles.map((inm) => {
                      const prop = propietarios.find((p) => p.id === inm.propietarioPrincipalId);
                      return (
                        <tr key={inm.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-4">
                            <div className="font-semibold text-white">{inm.nombre || inm.direccion}</div>
                            <div className="text-[11px] text-slate-500">{inm.direccion}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-slate-300">{inm.ciudad}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {inm.datosFiscales?.codigoPostal || 'CP No indicado'}
                            </div>
                          </td>
                          <td className="p-4">
                            {prop ? (
                              <button
                                onClick={() => {
                                  setSelectedPropietarioDetail(prop);
                                }}
                                className="text-purple-400 hover:text-purple-300 font-medium hover:underline cursor-pointer"
                              >
                                {prop.nombre}
                              </button>
                            ) : (
                              <span className="text-slate-500">Sin asignar</span>
                            )}
                          </td>
                          <td className="p-4 font-bold text-white font-mono">
                            {inm.precio} €/mes
                          </td>
                          <td className="p-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                inm.estado === 'disponible'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : inm.estado === 'alquilado'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {inm.estado.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => setSelectedInmuebleDossier(inm)}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ml-auto"
                            >
                              <Eye className="w-3.5 h-3.5 text-purple-400" />
                              <span>Consultar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-VIEW 4: PROPIETARIOS */}
        {activeSection === 'propietarios' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-4">Propietario / Razón Social</th>
                      <th className="p-4">NIF / CIF</th>
                      <th className="p-4">Contacto</th>
                      <th className="p-4">Inmuebles en Gestión</th>
                      <th className="p-4">Cuentas Bancarias</th>
                      <th className="p-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {propietarios.map((p) => {
                      const inmCount = inmuebles.filter(
                        (i) => i.propietarioPrincipalId === p.id
                      ).length;
                      return (
                        <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 font-semibold text-white">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center justify-center font-bold text-xs">
                                {p.nombre.charAt(0)}
                              </div>
                              <span>{p.nombre}</span>
                            </div>
                          </td>
                          <td className="p-4 font-mono text-slate-400">{p.nifCif}</td>
                          <td className="p-4">
                            <div>{p.email}</div>
                            <div className="text-[11px] text-slate-500">{p.telefono || '—'}</div>
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {inmCount} {inmCount === 1 ? 'vivienda' : 'viviendas'}
                            </span>
                          </td>
                          <td className="p-4 text-slate-400">
                            {p.cuentasBancarias && p.cuentasBancarias.length > 0 ? (
                              <span className="font-mono text-emerald-400 text-[11px]">
                                {p.cuentasBancarias.length} cuenta(s) registrada(s)
                              </span>
                            ) : (
                              <span className="text-slate-600">Sin IBAN registrado</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => {
                                  setInmueblePropietarioFilter(p.id);
                                  setActiveSection('inmuebles');
                                }}
                                className="px-2.5 py-1 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/60 text-purple-300 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                              >
                                Ver Inmuebles
                              </button>
                              <button
                                onClick={() => setSelectedPropietarioDetail(p)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                              >
                                Ficha
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-VIEW 5: PROFESIONALES */}
        {activeSection === 'profesionales' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-4">Profesional / Empresa</th>
                      <th className="p-4">Tipo</th>
                      <th className="p-4">Especialidades</th>
                      <th className="p-4">Zonas de Cobertura</th>
                      <th className="p-4">Inmuebles Asignados</th>
                      <th className="p-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {profesionales.map((prof) => (
                      <tr key={prof.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-semibold text-white">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center font-bold text-xs">
                              {prof.nombreComercial.charAt(0)}
                            </div>
                            <div>
                              <span>{prof.nombreComercial}</span>
                              <div className="text-[11px] text-slate-500 font-normal">
                                {prof.email || 'Sin email'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-slate-400">{prof.tipo}</td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {prof.especialidades?.map((esp) => (
                              <span
                                key={esp}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700"
                              >
                                {esp}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-slate-400">
                          {prof.zonasServicio?.map((z) => `${z.provincia} (${z.municipio || 'General'})`).join(', ') ||
                            'Sin zona'}
                        </td>
                        <td className="p-4 font-mono text-purple-400">
                          {prof.inmuebleIdsAsignados?.length || 0} viviendas
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              prof.activo
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-500 border border-slate-700'
                            }`}
                          >
                            {prof.activo ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUB-VIEW 6: CONFIGURACIÓN DE PLATAFORMA */}
        {activeSection === 'configuracion' && (
          <div className="space-y-6">
            {/* Módulos Config */}
            {modulosConfig && (
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                <h3 className="text-sm font-bold text-white mb-2">Módulos Globales de la Plataforma</h3>
                <p className="text-xs text-slate-400 mb-6">
                  Habilita o deshabilita funciones operativas a nivel de sistema.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(Object.keys(modulosConfig) as Array<keyof ModulosConfig>).map((key) => {
                    const isEnabled = modulosConfig[key];
                    return (
                      <div
                        key={key}
                        className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between"
                      >
                        <div>
                          <p className="text-xs font-semibold text-white capitalize">
                            {key.replace(/([A-Z])/g, ' $1')}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {isEnabled ? 'Módulo Activo' : 'Módulo Desactivado'}
                          </p>
                        </div>
                        <button
                          onClick={() => handleToggleModulo(key)}
                          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                            isEnabled
                              ? 'text-emerald-400 hover:text-emerald-300 bg-emerald-500/10'
                              : 'text-slate-600 hover:text-slate-400 bg-slate-900'
                          }`}
                        >
                          {isEnabled ? (
                            <ToggleRight className="w-6 h-6" />
                          ) : (
                            <ToggleLeft className="w-6 h-6" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Enlaces de Registro */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Enlaces de Invitación y Registro</h3>
                  <p className="text-xs text-slate-400">
                    Solo permiten dar de alta PROPIETARIOS o PROFESIONALES (nunca administradores).
                  </p>
                </div>
                <button
                  onClick={onOpenCrearEnlaceModal}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo Enlace</span>
                </button>
              </div>

              <div className="space-y-3">
                {enlacesRegistro.map((enlace) => (
                  <div
                    key={enlace.id}
                    className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white">{enlace.textoVisible}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            enlace.tipoPerfil === 'PROPIETARIO'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {enlace.tipoPerfil}
                        </span>
                        {enlace.activo ? (
                          <span className="text-[10px] text-emerald-400 font-semibold">● Activo</span>
                        ) : (
                          <span className="text-[10px] text-slate-500">Inactivo</span>
                        )}
                        {esInvitacionNominalPropietario(enlace) && (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            title={`Nominal para ${enlace.emailInvitado || '—'}`}
                          >
                            NOMINAL 1 USO
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-slate-500 text-[11px]">
                        Token: {enlace.token} · Usos: {enlace.usosActuales || 0}
                        {enlace.usosMaximos ? ` / ${enlace.usosMaximos}` : ' (Ilimitados)'}
                        {esInvitacionNominalPropietario(enlace) &&
                          ` · Para: ${enlace.emailInvitado || '—'}`}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyLink(enlace)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedEnlaceId === enlace.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>¡Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            <span>Copiar Enlace</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => onDeleteEnlaceRegistro(enlace.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg cursor-pointer"
                        title="Eliminar enlace"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Catálogo de Especialidades */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
              <h3 className="text-sm font-bold text-white mb-2">Catálogo de Especialidades de Mantenimiento</h3>
              <p className="text-xs text-slate-400 mb-4">
                Gremios y oficios disponibles para asignación a profesionales.
              </p>

              <form onSubmit={handleAddEspecialidad} className="flex gap-2 max-w-md mb-4">
                <input
                  type="text"
                  value={nuevaEspecialidad}
                  onChange={(e) => setNuevaEspecialidad(e.target.value)}
                  placeholder="Añadir especialidad (ej. Climatización)..."
                  className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-purple-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Añadir
                </button>
              </form>

              <div className="flex flex-wrap gap-2">
                {especialidades.map((esp) => (
                  <div
                    key={esp.id}
                    className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300 flex items-center gap-2"
                  >
                    <span>{esp.nombre}</span>
                    <button
                      onClick={() => onDeleteEspecialidad(esp.id)}
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* R3 · DRY-RUN de fichas públicas (solo lectura; solo master) */}
            <DryRunFichasPublicasPanel currentUser={currentUser} />
          </div>
        )}

        {/* SUB-VIEW 7: REGISTRO DE AUDITORÍA */}
        {activeSection === 'auditoria' && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-4">Fecha y Hora</th>
                      <th className="p-4">Usuario / Origen</th>
                      <th className="p-4">Acción</th>
                      <th className="p-4">Entidad</th>
                      <th className="p-4">Descripción / Detalles</th>
                      <th className="p-4">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                          {new Date(log.fechaHora).toLocaleString()}
                        </td>
                        <td className="p-4 font-semibold text-white">
                          <div>{log.usuarioNombre || 'Sistema'}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {log.usuarioEmail || log.usuarioId || '—'}
                          </div>
                        </td>
                        <td className="p-4 font-mono text-purple-400 font-bold">{log.accion}</td>
                        <td className="p-4 text-slate-400 capitalize">{log.entidadAfectada}</td>
                        <td className="p-4 text-slate-300 max-w-xs">{log.descripcion}</td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.resultado === 'EXITO'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {log.resultado}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          No hay registros de auditoría registrados todavía.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Ficha de Inmueble (Inspección de Administración) */}
        {selectedInmuebleDossier && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-xs text-slate-300 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">Ficha de Inmueble (Supervisión)</h3>
                <button
                  onClick={() => setSelectedInmuebleDossier(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-2">
                <p>
                  <strong className="text-white">Nombre / Título:</strong> {selectedInmuebleDossier.nombre || '—'}
                </p>
                <p>
                  <strong className="text-white">Dirección:</strong> {selectedInmuebleDossier.direccion}
                </p>
                <p>
                  <strong className="text-white">Ciudad / Localidad:</strong> {selectedInmuebleDossier.ciudad}
                </p>
                <p>
                  <strong className="text-white">Renta Mensual:</strong>{' '}
                  <span className="font-mono text-emerald-400 font-bold">{selectedInmuebleDossier.precio} €</span>
                </p>
                <p>
                  <strong className="text-white">Estado Actual:</strong>{' '}
                  <span className="font-bold text-purple-400 uppercase">{selectedInmuebleDossier.estado}</span>
                </p>
                <p>
                  <strong className="text-white">Propietario Asignado:</strong>{' '}
                  {propietarios.find((p) => p.id === selectedInmuebleDossier.propietarioPrincipalId)?.nombre ||
                    'Sin asignar'}
                </p>
                <p>
                  <strong className="text-white">Habitaciones / Baños:</strong>{' '}
                  {selectedInmuebleDossier.habitaciones} hab. / {selectedInmuebleDossier.banos} baños
                </p>
                <p>
                  <strong className="text-white">Superficie:</strong> {selectedInmuebleDossier.superficie} m²
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button
                  onClick={() => setSelectedInmuebleDossier(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Cerrar Consulta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Ficha de Propietario */}
        {selectedPropietarioDetail && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 text-xs text-slate-300 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">Ficha del Propietario</h3>
                <button
                  onClick={() => setSelectedPropietarioDetail(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold cursor-pointer"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-2">
                <p>
                  <strong className="text-white">Nombre / Razón Social:</strong> {selectedPropietarioDetail.nombre}
                </p>
                <p>
                  <strong className="text-white">NIF / CIF:</strong>{' '}
                  <span className="font-mono text-slate-300">{selectedPropietarioDetail.nifCif}</span>
                </p>
                <p>
                  <strong className="text-white">Correo Electrónico:</strong> {selectedPropietarioDetail.email}
                </p>
                <p>
                  <strong className="text-white">Teléfono:</strong> {selectedPropietarioDetail.telefono || '—'}
                </p>
                <p>
                  <strong className="text-white">Dirección Fiscal:</strong>{' '}
                  {selectedPropietarioDetail.direccion}, {selectedPropietarioDetail.ciudad} ({selectedPropietarioDetail.codigoPostal})
                </p>
                <p>
                  <strong className="text-white">Inmuebles en Gestión:</strong>{' '}
                  {inmuebles.filter((i) => i.propietarioPrincipalId === selectedPropietarioDetail.id).length}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => {
                    // ACCESO-PROPIETARIOS §1: alta con el propietario ya vinculado.
                    const prop = selectedPropietarioDetail;
                    setSelectedPropietarioDetail(null);
                    onOpenCrearUsuarioModal(buildPrefillUsuarioDesdePropietario(prop));
                  }}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Crear Cuenta de Usuario
                </button>
                <button
                  onClick={() => {
                    const propId = selectedPropietarioDetail.id;
                    setSelectedPropietarioDetail(null);
                    setInmueblePropietarioFilter(propId);
                    setActiveSection('inmuebles');
                  }}
                  className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Ver Inmuebles de este Propietario
                </button>
                <button
                  onClick={() => setSelectedPropietarioDetail(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
