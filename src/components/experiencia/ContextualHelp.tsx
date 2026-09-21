/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Ayuda contextual reutilizable.
 *
 * Botón «?» accesible que abre un panel con la ayuda de la pantalla actual.
 * Si no hay ayuda registrada para el contexto, no renderiza nada (patrón del ERP:
 * no mostrar controles vacíos). Nunca escribe en audit_logs.
 */
import React, { useEffect, useId, useMemo, useState } from 'react';
import { HelpCircle, X, BookOpen, ChevronRight } from 'lucide-react';
import type { SectionType, UsuarioApp } from '../../types';
import type { ExperienceContext, HelpEntry } from '../../experiencia';
import { ayudaParaContexto, contextoDesdeUsuario, obtenerTutorial, tutorialesDisponibles } from '../../experiencia';

interface ContextualHelpProps {
  /** Usuario canónico (de él salen rol y permisos). */
  usuario?: Pick<UsuarioApp, 'tipoPerfil' | 'roles' | 'permisos'> | null;
  /** Sección/pantalla actual. */
  section: SectionType | string;
  /** Contexto ya resuelto (si el host lo tiene); tiene prioridad sobre usuario+section. */
  contexto?: ExperienceContext;
  /** Abrir el Centro de Ayuda (opcional; si no se aporta, no se muestra el enlace). */
  onAbrirCentro?: () => void;
  /** Iniciar un tutorial relacionado (opcional). */
  onIniciarTutorial?: (tutorialId: string) => void;
  /** Variante compacta (solo icono) o con texto. */
  variante?: 'icono' | 'texto';
  className?: string;
}

export const ContextualHelp: React.FC<ContextualHelpProps> = ({ usuario, section, contexto, onAbrirCentro, onIniciarTutorial, variante = 'icono', className = '' }) => {
  const ctx = useMemo(() => contexto ?? contextoDesdeUsuario(usuario, section), [contexto, usuario, section]);
  const entradas = useMemo(() => ayudaParaContexto(ctx), [ctx]);
  const tutorialesVisibles = useMemo(() => new Set(tutorialesDisponibles(ctx).map((t) => t.id)), [ctx]);
  const [abierto, setAbierto] = useState(false);
  const [ampliada, setAmpliada] = useState<HelpEntry | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto]);

  // Sin ayuda para esta pantalla → no se muestra nada (no rompe pantallas sin contenido).
  if (entradas.length === 0) return null;

  const principal = entradas[0];

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => {
          setAbierto((v) => !v);
          setAmpliada(null);
        }}
        aria-label={`Ayuda: ${principal.title}`}
        aria-expanded={abierto}
        aria-controls={panelId}
        title="Ayuda de esta pantalla"
        className={`inline-flex items-center gap-1.5 rounded-xl text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer ${
          variante === 'texto' ? 'px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white' : 'p-1.5'
        }`}
      >
        <HelpCircle className="w-4 h-4" />
        {variante === 'texto' && <span>Ayuda</span>}
      </button>

      {abierto && (
        <section
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label={`Ayuda contextual: ${principal.title}`}
          className="absolute right-0 z-40 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-xl text-left"
        >
          <header className="flex items-start justify-between gap-2 p-4 border-b border-slate-100">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700">Ayuda de esta pantalla</p>
              <h3 className="text-sm font-extrabold text-slate-900 truncate">{ampliada ? ampliada.title : principal.title}</h3>
            </div>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar ayuda" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {ampliada ? (
              <>
                {ampliada.content.split(/\n\s*\n/).map((parrafo, i) => (
                  <p key={i} className="text-xs text-slate-700 leading-relaxed">
                    {parrafo}
                  </p>
                ))}
                {ampliada.relatedTutorials?.filter((id) => tutorialesVisibles.has(id)).map((id) => {
                  const t = obtenerTutorial(id);
                  if (!t) return null;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onIniciarTutorial?.(id)}
                      disabled={!onIniciarTutorial}
                      className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-left text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5" /> Tutorial: {t.title}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
                <button type="button" onClick={() => setAmpliada(null)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer">
                  ← Volver al resumen
                </button>
              </>
            ) : (
              <ul className="space-y-2">
                {entradas.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setAmpliada(e)}
                      className="w-full text-left p-2.5 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 cursor-pointer"
                    >
                      <p className="text-xs font-bold text-slate-900">{e.title}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">{e.summary}</p>
                      <span className="text-[11px] font-semibold text-blue-700 mt-1 inline-block">Leer más</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {onAbrirCentro && (
            <footer className="p-3 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
              <button
                type="button"
                onClick={() => {
                  setAbierto(false);
                  onAbrirCentro();
                }}
                className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
              >
                Abrir Centro de Ayuda
              </button>
            </footer>
          )}
        </section>
      )}
    </div>
  );
};
