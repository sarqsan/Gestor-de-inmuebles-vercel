/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Reproductor de tutoriales paso a paso.
 *
 * Panel flotante (no bloquea la pantalla) que muestra el paso actual, permite avanzar/retroceder,
 * navegar a la pantalla del paso (a través del host, respetando su route guard) y cancelar/finalizar.
 * La sesión vive en memoria del host: sin persistencia en esta fase.
 */
import React, { useMemo } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, X, Lock, ExternalLink, CheckCircle2 } from 'lucide-react';
import type { SectionType } from '../../types';
import type { ExperienceContext, SesionTutorial, Tutorial } from '../../experiencia';
import { avanzar, cancelar, esUltimoPaso, evaluarPaso, finalizar, pasoActual, progreso, retroceder } from '../../experiencia';

interface TutorialPlayerProps {
  tutorial: Tutorial;
  sesion: SesionTutorial;
  contexto: ExperienceContext;
  onCambio: (sesion: SesionTutorial) => void;
  /** Navegación del host (misma función que usa el menú; el route guard del host sigue mandando). */
  onNavegar?: (section: SectionType) => void;
  onCerrar: () => void;
}

export const TutorialPlayer: React.FC<TutorialPlayerProps> = ({ tutorial, sesion, contexto, onCambio, onNavegar, onCerrar }) => {
  const paso = pasoActual(sesion, tutorial);
  const evaluacion = useMemo(
    () =>
      evaluarPaso(paso, sesion.indice, tutorial.steps.length, contexto, {
        targetVisible: typeof document !== 'undefined' ? (sel) => !!document.querySelector(sel) : undefined,
      }),
    [paso, sesion.indice, tutorial.steps.length, contexto]
  );
  const ultimo = esUltimoPaso(sesion, tutorial);
  const pct = Math.round(progreso(sesion, tutorial) * 100);
  const completado = sesion.estado === 'COMPLETADO';
  const enRutaDelPaso = !paso.route || paso.route === contexto.section;

  return (
    <aside
      role="dialog"
      aria-label={`Tutorial: ${tutorial.title}`}
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 right-4 z-50 w-[calc(100vw-2rem)] sm:w-96 bg-white border border-indigo-200 rounded-2xl shadow-2xl"
    >
      <header className="p-4 border-b border-slate-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 flex items-center gap-1">
            <BookOpen className="w-3 h-3" /> Tutorial
          </p>
          <h3 className="text-sm font-extrabold text-slate-900 truncate">{tutorial.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            onCambio(cancelar(sesion));
            onCerrar();
          }}
          aria-label="Cancelar tutorial"
          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="px-4 pt-3">
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Paso {sesion.indice + 1} de {tutorial.steps.length}
        </p>
      </div>

      <div className="p-4 space-y-3">
        {completado ? (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">Tutorial completado</p>
              <p className="text-xs">Has recorrido todos los pasos de «{tutorial.title}».</p>
            </div>
          </div>
        ) : (
          <>
            <h4 className="text-sm font-bold text-slate-900">{paso.title}</h4>
            <p className="text-xs text-slate-700 leading-relaxed">{paso.description}</p>

            {evaluacion.motivos.length > 0 && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900" role="note">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-snug">{evaluacion.explicacion}</p>
              </div>
            )}

            {paso.route && !enRutaDelPaso && onNavegar && evaluacion.puedeNavegar && (
              <button
                type="button"
                onClick={() => onNavegar(paso.route as SectionType)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold hover:bg-indigo-100 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Ir a la pantalla de este paso
              </button>
            )}
          </>
        )}
      </div>

      <footer className="p-3 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl flex items-center justify-between gap-2">
        {completado ? (
          <button type="button" onClick={onCerrar} className="ml-auto px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer">
            Cerrar
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onCambio(retroceder(sesion))}
              disabled={sesion.indice === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
            <button
              type="button"
              onClick={() => {
                onCambio(cancelar(sesion));
                onCerrar();
              }}
              className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer"
            >
              Salir
            </button>
            {ultimo ? (
              <button
                type="button"
                onClick={() => onCambio(finalizar(sesion, tutorial))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer"
              >
                Finalizar <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onCambio(avanzar(sesion, tutorial))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer"
              >
                Siguiente <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </footer>
    </aside>
  );
};
