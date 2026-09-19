import React from 'react';
import { SectionType, Candidato, UsuarioApp } from '../types';
import {
  Home,
  Building2,
  Users,
  UserPlus,
  Sparkles,
  HelpCircle,
  Settings,
  ShieldCheck,
  ChevronRight,
  Database,
  FileText,
  UserCheck,
  Key,
  Shield,
  Wrench,
  User,
  LogOut,
  Receipt,
  TrendingDown,
  RefreshCw,
  LifeBuoy,
  Calculator,
} from 'lucide-react';

interface SidebarProps {
  activeSection: SectionType;
  onSelectSection: (section: SectionType) => void;
  candidatos: Candidato[];
  inmueblesCount: number;
  propietariosCount?: number;
  solicitudesCount?: number;
  preseleccionadosCount?: number;
  contratosCount?: number;
  solicitudesSeguroCount?: number;
  cobrosPendientesCount?: number;
  incidenciasAbiertasCount?: number;
  currentUser?: UsuarioApp;
  onOpenAuthModal?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  candidatos,
  inmueblesCount,
  propietariosCount = 0,
  solicitudesCount = 0,
  preseleccionadosCount = 0,
  contratosCount = 0,
  solicitudesSeguroCount = 0,
  cobrosPendientesCount = 0,
  incidenciasAbiertasCount = 0,
  currentUser,
  onOpenAuthModal,
  onLogout,
}) => {
  const pendingReviewCount = candidatos.filter((c) => c.estado === 'nuevo').length;
  const pendingDocCount = candidatos.filter((c) => c.estado === 'pendiente_doc').length;

  const perfil = currentUser?.tipoPerfil || 'ADMINISTRADOR';

  // Role-scoped navigation items
  let navItems: {
    id: SectionType;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
  }[] = [];

  if (perfil === 'PROPIETARIO') {
    navItems = [
      { id: 'propietarios', label: 'Mi Portal Propietario', icon: UserCheck },
      { id: 'inmuebles', label: 'Mis Viviendas', icon: Building2, badge: inmueblesCount },
      { id: 'formalizacion', label: 'Mis Contratos', icon: FileText, badge: contratosCount },
      { id: 'cobros', label: 'Mis Cobros', icon: Receipt, badge: cobrosPendientesCount },
      { id: 'gastos', label: 'Mis Gastos', icon: TrendingDown },
      { id: 'fiscal', label: 'Fiscalidad IRPF', icon: Calculator },
      { id: 'polizas', label: 'Pólizas y Seguros', icon: ShieldCheck },
      { id: 'recomercializacion', label: 'Recomercializar', icon: RefreshCw },
      { id: 'incidencias', label: 'Incidencias', icon: LifeBuoy, badge: incidenciasAbiertasCount },
      { id: 'configuracion', label: 'Mi Cuenta', icon: Settings },
    ];
  } else if (perfil === 'PROFESIONAL') {
    navItems = [
      { id: 'administracion', label: 'Mi Portal Profesional', icon: Wrench },
      { id: 'inmuebles', label: 'Viviendas Asignadas', icon: Building2, badge: inmueblesCount },
      { id: 'configuracion', label: 'Mi Cuenta', icon: Settings },
    ];
  } else {
    // ADMINISTRADOR
    navItems = [
      { id: 'administracion', label: 'Centro de Control', icon: Shield },
      { id: 'inmuebles', label: 'Inmuebles', icon: Building2, badge: inmueblesCount },
      { id: 'propietarios', label: 'Propietarios & IBAN', icon: UserCheck, badge: propietariosCount },
      { id: 'cobros', label: 'Gestión de Cobros', icon: Receipt, badge: cobrosPendientesCount },
      { id: 'gastos', label: 'Gestión de Gastos', icon: TrendingDown },
      { id: 'fiscal', label: 'Fiscalidad IRPF', icon: Calculator },
      { id: 'polizas', label: 'Pólizas y Seguros', icon: ShieldCheck },
      { id: 'preseleccionados', label: 'Preseleccionados', icon: Key, badge: preseleccionadosCount },
      { id: 'seguro_impago', label: 'Seguro Impago', icon: ShieldCheck, badge: solicitudesSeguroCount },
      { id: 'formalizacion', label: 'Formalización & LAU', icon: FileText, badge: contratosCount },
      { id: 'recomercializacion', label: 'Recomercialización', icon: RefreshCw },
      { id: 'incidencias', label: 'Incidencias', icon: LifeBuoy, badge: incidenciasAbiertasCount },
      { id: 'candidatos', label: 'Candidatos', icon: Users, badge: candidatos.length },
      { id: 'analisis', label: 'Análisis IA', icon: Sparkles },
      { id: 'configuracion', label: 'Configuración', icon: Settings },
    ];
  }

  return (
    <aside className="hidden md:flex flex-col w-64 bg-slate-900 text-slate-300 border-r border-slate-800 min-h-screen sticky top-0 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-white text-base tracking-tight leading-tight">RentSelect</h1>
            <p className="text-[11px] text-slate-400 font-medium">Gestión de Alquileres</p>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Menú Principal
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Summary Cards in Sidebar (Only for Admins) */}
      {perfil === 'ADMINISTRADOR' && (
        <div className="p-3 mx-3 mb-3 bg-slate-800/60 rounded-xl border border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              Nuevos a revisar:
            </span>
            <span className="font-bold text-white bg-slate-700 px-2 py-0.5 rounded-full">{pendingReviewCount}</span>
          </div>
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Pendiente doc.:
            </span>
            <span className="font-bold text-white bg-slate-700 px-2 py-0.5 rounded-full">{pendingDocCount}</span>
          </div>
        </div>
      )}

      {/* Active User Session */}
      {currentUser && (
        <div className="p-3 mx-3 mb-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={onOpenAuthModal}
              className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity cursor-pointer truncate"
              title="Ver mi perfil"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0">
                {currentUser.nombre.charAt(0)}
              </div>
              <div className="truncate max-w-[110px]">
                <p className="font-bold text-slate-200 truncate">{currentUser.nombre}</p>
                <p className="text-[10px] text-slate-400 truncate">{currentUser.tipoPerfil}</p>
              </div>
            </button>

            {onLogout && (
              <button
                onClick={onLogout}
                title="Cerrar sesión"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Prepared Status Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-2.5 text-xs text-slate-400">
          <Database className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="leading-tight">
            <p className="font-medium text-slate-300">Firestore & Auth Conectado</p>
            <p className="text-[10px] text-slate-500">Control de Acceso RBAC Activo</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
