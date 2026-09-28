import React, { useMemo } from 'react';
import { SectionType, Candidato, UsuarioApp } from '../types';
import { Building2, Database, LogOut } from 'lucide-react';
// BLOQUE 10 · UX-1: fuente única de navegación (sin listas locales de secciones).
import {
  ATRIBUTO_TOUR_NAV,
  ContadoresNav,
  gruposDePerfil,
  idTourDeSeccion,
  perfilNavegacionDe,
  valorBadge,
} from '../navegacion/navegacion';

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
  /** BLOQUE C: nº de expedientes de morosidad con saldo pendiente. */
  morosidadAbiertaCount?: number;
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
  morosidadAbiertaCount = 0,
  currentUser,
  onOpenAuthModal,
  onLogout,
}) => {
  const pendingReviewCount = candidatos.filter((c) => c.estado === 'nuevo').length;
  const pendingDocCount = candidatos.filter((c) => c.estado === 'pendiente_doc').length;

  const perfil = perfilNavegacionDe(currentUser?.tipoPerfil);
  const contadores: ContadoresNav = {
    inmuebles: inmueblesCount,
    propietarios: propietariosCount,
    solicitudes: solicitudesCount,
    preseleccionados: preseleccionadosCount,
    contratos: contratosCount,
    solicitudesSeguro: solicitudesSeguroCount,
    cobrosPendientes: cobrosPendientesCount,
    incidenciasAbiertas: incidenciasAbiertasCount,
    morosidadAbierta: morosidadAbiertaCount,
    candidatos: candidatos.length,
  };
  const gestorPatrimonial = Boolean(currentUser?.roles?.includes('GESTOR_PATRIMONIAL'));
  const grupos = useMemo(
    () => gruposDePerfil(perfil, { gestorPatrimonial }),
    [perfil, gestorPatrimonial]
  );

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

      {/* Navigation List (agrupada; fuente única: src/navegacion/navegacion.ts) */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto" aria-label="Navegación principal">
        {grupos.map((grupo) => (
          <div key={grupo.id} className="space-y-1">
            <h3 className="px-3 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              {grupo.nombre}
            </h3>

            {grupo.items.map((item) => {
              const Icon = item.icono;
              const isActive = activeSection === item.id;
              const badge = valorBadge(item.contador, contadores);

              return (
                <button
                  key={item.id}
                  type="button"
                  {...{ [ATRIBUTO_TOUR_NAV]: idTourDeSeccion(item.id) }}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectSection(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span>{item.etiqueta}</span>
                  </div>

                  {badge !== undefined && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
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
