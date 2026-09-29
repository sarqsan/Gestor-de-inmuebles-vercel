import React, { useMemo, useRef, useState, useEffect, useId } from 'react';
import { SectionType, Candidato, UsuarioApp } from '../types';
import { Plus, ChevronDown, Check } from 'lucide-react';

import { AsistentePanel } from './experiencia/AsistentePanel';
import type { AccionHost, ExperienceContext, ProveedorIA, ResultadoConsultaERP } from '../experiencia';
// BLOQUE 10 · UX-1: fuente única de navegación (sin listas locales de secciones).
import {
  ATRIBUTO_TOUR_NAV,
  ContadoresNav,
  gruposDePerfil,
  idTourDeSeccion,
  perfilNavegacionDe,
  valorBadge,
} from '../navegacion/navegacion';

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
  /** BLOQUE C: expedientes de morosidad con saldo pendiente. */
  morosidadAbiertaCount?: number;
  /** Incidencias sin cerrar (mismo contador que el menú lateral). */
  incidenciasAbiertasCount?: number;
  currentUser?: UsuarioApp;
  onOpenAddCandidateModal?: () => void;
  onOpenAuthModal?: () => void;
  /** §6 F4: asistente transversal (misma acción que el Header). */
  onAccionAsistente?: (accion: Exclude<AccionHost, { tipo: 'NINGUNA' }>) => void;
  proveedorIA?: ProveedorIA;
  contextoIA?: ExperienceContext;
  onConsultarAsistente?: (accion: Extract<AccionHost, { tipo: 'CONSULTAR' }>) => Promise<ResultadoConsultaERP>;
  accessibleSections?: SectionType[];
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
  morosidadAbiertaCount = 0,
  incidenciasAbiertasCount = 0,
  currentUser,
  onOpenAddCandidateModal,
  onOpenAuthModal,
  onAccionAsistente,
  proveedorIA,
  contextoIA,
  onConsultarAsistente,
  accessibleSections,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();

  const perfil = perfilNavegacionDe(currentUser?.tipoPerfil);
  const contadores: ContadoresNav = {
    inmuebles: inmueblesCount,
    propietarios: propietariosCount,
    solicitudes: solicitudesCount,
    preseleccionados: preseleccionadosCount,
    contratos: contratosCount,
    solicitudesSeguro: solicitudesSeguroCount,
    cobrosPendientes: cobrosPendientesCount,
    morosidadAbierta: morosidadAbiertaCount,
    incidenciasAbiertas: incidenciasAbiertasCount,
    candidatos: candidatos.length,
  };
  const gestorPatrimonial = Boolean(currentUser?.roles?.includes('GESTOR_PATRIMONIAL'));
  const grupos = useMemo(
    () => gruposDePerfil(perfil, { gestorPatrimonial }),
    [perfil, gestorPatrimonial]
  );
  const items = useMemo(() => grupos.flatMap((grupo) => grupo.items), [grupos]);

  const currentSectionItem = items.find((s) => s.id === activeSection) || items[0];
  const CurrentIcon = currentSectionItem.icono;
  const currentBadge = valorBadge(currentSectionItem.contador, contadores);

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

  // BLOQUE 10 · UX-6 §12: el menú móvil se cierra con Escape y el foco vuelve al botón
  // que lo abrió; al abrirse, el foco entra en el menú (antes sólo funcionaba con ratón).
  useEffect(() => {
    if (!isOpen) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape') return;
      evento.stopPropagation();
      setIsOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const destino =
      panel.querySelector<HTMLButtonElement>('button[aria-current="page"]') ||
      panel.querySelector<HTMLButtonElement>('button');
    destino?.focus();
  }, [isOpen]);

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
            ref={triggerRef}
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 rounded-xl transition-all text-left w-full max-w-xs"
          >
            <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              <CurrentIcon className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-white truncate">{currentSectionItem.etiqueta}</span>
                {currentBadge !== undefined && (
                  <span className="px-1.5 py-0.2 text-[10px] font-bold bg-blue-500 text-white rounded-full">
                    {currentBadge}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 leading-none truncate">RentSelect Menu</p>
            </div>

            <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180 text-blue-400' : ''}`} />
          </button>

          {/* Top Dropdown Menu Overlay */}
          {isOpen && (
            <div className="absolute top-full left-0 mt-2 w-[min(88vw,20rem)] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 animate-fadeIn">
              <div className="p-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-semibold uppercase tracking-wider">
                <span>Navegación</span>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-sm">{items.length} módulos</span>
              </div>

              <nav ref={panelRef} id={panelId} aria-label="Navegación del ERP" className="p-1.5 max-h-[60vh] overflow-y-auto space-y-3">
                {grupos.map((grupo) => (
                  <div key={grupo.id} className="space-y-1">
                    <h3 className="px-2.5 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {grupo.nombre}
                    </h3>

                    {grupo.items.map((item) => {
                      const Icon = item.icono;
                      const isSelected = activeSection === item.id;
                      const badge = valorBadge(item.contador, contadores);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          {...{ [ATRIBUTO_TOUR_NAV]: idTourDeSeccion(item.id) }}
                          aria-current={isSelected ? 'page' : undefined}
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
                              <p className="truncate font-medium">{item.etiqueta}</p>
                              <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                                {item.descripcion}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {badge !== undefined && (
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {badge}
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-white ml-1" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>
          )}
        </div>

        {/* §6 F4: asistente (móvil) */}
        {currentUser && onAccionAsistente && (
          <AsistentePanel usuario={currentUser} section={activeSection} contexto={contextoIA} accessibleSections={accessibleSections} proveedor={proveedorIA} onAccion={onAccionAsistente} onConsultar={onConsultarAsistente} tema="oscuro" />
        )}

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
