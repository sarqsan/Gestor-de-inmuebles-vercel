import React, { useState, useRef, useEffect } from 'react';
import { SectionType, Candidato, UsuarioApp } from '../types';
import {
  Home,
  Building2,
  Users,
  UserPlus,
  Sparkles,
  Settings,
  Plus,
  HelpCircle,
  FileText,
  UserCheck,
  Key,
  ChevronDown,
  Menu,
  X,
  Check,
  ShieldCheck,
  Shield,
  Wrench,
  ArrowLeftRight,
  Receipt,
  AlertTriangle,
} from 'lucide-react';

interface MobileNavProps {
  activeSection: SectionType;
  onSelectSection: (section: SectionType) => void;
  candidatos: Candidato[];
  inmueblesCount?: number;
  propietariosCount?: number;
  solicitudesCount?: number;
  preseleccionadosCount?: number;
  contratosCount?: number;
  solicitudesSeguroCount?: number;
  cobrosPendientesCount?: number;
  incidenciasCount?: number;
  trabajosActivosCount?: number;
  currentUser?: UsuarioApp;
  onOpenAddCandidateModal?: () => void;
  onOpenAuthModal?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeSection,
  onSelectSection,
  candidatos,
  inmueblesCount = 0,
  propietariosCount = 0,
  solicitudesCount = 0,
  preseleccionadosCount = 0,
  contratosCount = 0,
  solicitudesSeguroCount = 0,
  cobrosPendientesCount = 0,
  incidenciasCount = 0,
  trabajosActivosCount = 0,
  currentUser,
  onOpenAddCandidateModal,
  onOpenAuthModal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pendingCount = candidatos.filter((c) => c.estado === 'nuevo').length;
  const perfil = currentUser?.tipoPerfil || 'ADMINISTRADOR';

  const allSections: {
    id: SectionType;
    label: string;
    icon: React.FC<{ className?: string }>;
    badge?: number;
    description?: string;
  }[] =
    perfil === 'PROPIETARIO'
      ? [
          { id: 'propietarios', label: 'Mi Portal Propietario', icon: UserCheck, description: 'Servicios y profesionales' },
          { id: 'inmuebles', label: 'Mis Viviendas', icon: Building2, badge: inmueblesCount, description: 'Catálogo de propiedades' },
          { id: 'profesionales', label: 'Profesionales & Obras', icon: Wrench, badge: trabajosActivosCount, description: 'Técnicos, presupuestos y obras' },
          { id: 'formalizacion', label: 'Mis Contratos', icon: FileText, badge: contratosCount, description: 'Contratos de alquiler' },
          { id: 'cobros', label: 'Mis Cobros', icon: Receipt, badge: cobrosPendientesCount, description: 'Control mensual y pagos' },
          { id: 'incidencias', label: 'Mis Incidencias', icon: AlertTriangle, badge: incidenciasCount, description: 'Averías y mantenimiento' },
          { id: 'configuracion', label: 'Mi Cuenta', icon: Settings, description: 'Ajustes' },
        ]
      : perfil === 'PROFESIONAL'
      ? [
          { id: 'administracion', label: 'Mi Portal Profesional', icon: Wrench, description: 'Datos y especialidades' },
          { id: 'inmuebles', label: 'Viviendas Asignadas', icon: Building2, badge: inmueblesCount, description: 'Inmuebles a atender' },
          { id: 'incidencias', label: 'Órdenes de Trabajo', icon: AlertTriangle, badge: incidenciasCount, description: 'Reparaciones asignadas' },
          { id: 'configuracion', label: 'Mi Cuenta', icon: Settings, description: 'Ajustes' },
        ]
      : [
          { id: 'administracion', label: 'Centro de Control', icon: Shield, description: 'Gestión de usuarios, roles y seguridad' },
          { id: 'inmuebles', label: 'Inmuebles', icon: Building2, badge: inmueblesCount, description: 'Catálogo de propiedades' },
          { id: 'propietarios', label: 'Propietarios & IBAN', icon: UserCheck, badge: propietariosCount, description: 'Base fiscal y cuentas bancarias' },
          { id: 'cobros', label: 'Gestión de Cobros', icon: Receipt, badge: cobrosPendientesCount, description: 'Control mensual de alquileres' },
          { id: 'profesionales', label: 'Profesionales & Obras', icon: Wrench, badge: trabajosActivosCount, description: 'Técnicos, presupuestos y obras' },
          { id: 'incidencias', label: 'Incidencias & Seguros', icon: AlertTriangle, badge: incidenciasCount, description: 'Averías, peritajes IA y siniestros' },
          { id: 'preseleccionados', label: 'Preseleccionados', icon: Key, badge: preseleccionadosCount, description: 'Gestión de visitas y citas' },
          { id: 'seguro_impago', label: 'Seguro Impago', icon: ShieldCheck, badge: solicitudesSeguroCount, description: 'Estudio de solvencia con aseguradoras' },
          { id: 'formalizacion', label: 'Formalización & LAU', icon: FileText, badge: contratosCount, description: 'Contratos y asegurabilidad' },
          { id: 'candidatos', label: 'Candidatos', icon: Users, badge: candidatos.length, description: 'Listado completo' },
          { id: 'analisis', label: 'Análisis IA', icon: Sparkles, description: 'Puntuación e informes' },
          { id: 'configuracion', label: 'Configuración', icon: Settings, description: 'Ajustes del sistema' },
        ];

  const currentSectionItem = allSections.find((s) => s.id === activeSection) || allSections[0];
  const CurrentIcon = currentSectionItem.icon;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (sectionId: SectionType) => {
    onSelectSection(sectionId);
    setIsOpen(false);
  };

  return (
    <header className="md:hidden sticky top-0 z-50 bg-slate-900 text-white border-b border-slate-800 shadow-md">
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2" ref={dropdownRef}>
        {/* Brand & Section Dropdown Selector */}
        <div className="relative flex-1">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-all text-left w-full max-w-xs"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              <CurrentIcon className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-white truncate">{currentSectionItem.label}</span>
                {currentSectionItem.badge !== undefined && currentSectionItem.badge > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                    {currentSectionItem.badge}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 leading-none truncate">RentSelect Menu</p>
            </div>

            <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180 text-blue-400' : ''}`} />
          </button>

          {/* Top Dropdown Menu Overlay */}
          {isOpen && (
            <div className="absolute top-full left-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
              <div className="p-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
                <span>Navegación</span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-sm">{allSections.length} módulos</span>
              </div>

              <div className="p-1.5 max-h-[60vh] overflow-y-auto space-y-1">
                {allSections.map((item) => {
                  const Icon = item.icon;
                  const isSelected = activeSection === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.id)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-600 text-white font-bold shadow-xs' : 'hover:bg-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-left truncate">
                          <p className="truncate font-medium">{item.label}</p>
                          {item.description && (
                            <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {item.badge !== undefined && item.badge > 0 && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                        {isSelected && <Check className="w-3.5 h-3.5 text-white ml-1" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* User Profile on Mobile */}
        {onOpenAuthModal && (
          <button
            onClick={onOpenAuthModal}
            className="p-1.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
            title="Mi Perfil"
          >
            <div className="w-5 h-5 rounded-md bg-blue-600/40 text-blue-300 flex items-center justify-center font-bold text-[10px]">
              {currentUser?.nombre ? currentUser.nombre.charAt(0).toUpperCase() : 'U'}
            </div>
          </button>
        )}

        {/* Quick Add Button */}
        {currentUser?.tipoPerfil !== 'PROFESIONAL' && onOpenAddCandidateModal && (
          <button
            onClick={onOpenAddCandidateModal}
            className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
            title="Añadir Candidato"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};
