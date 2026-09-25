/**
 * CAPA TRANSVERSAL §6 — FASE 1 · Centro de Ayuda (sección del ERP, `activeSection === 'ayuda'`).
 *
 * Lista, busca y filtra la ayuda visible para el usuario; abre el contenido ampliado y
 * enlaza con los tutoriales disponibles. Solo lectura; nunca concede permisos ni audita.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Search, BookOpen, ChevronRight, ArrowLeft, Clock, Lock, LifeBuoy } from 'lucide-react';
import type { SectionType, UsuarioApp } from '../../types';
import type { ExperienceContext, HelpEntry, ModuloERP, ServicioProgresoTutoriales, Tutorial, TutorialProgress } from '../../experiencia';
import { NOMBRE_MODULO, buscarAyuda, contextoDesdeUsuario, estadoRecorrido, etiquetaTutorial, evaluarTutorial, hostDeTutorial, modulosConAyuda, obtenerTutorial, tutorialesDisponibles } from '../../experiencia';

interface CentroAyudaSectionProps {
  usuario: Pick<UsuarioApp, 'tipoPerfil' | 'roles' | 'permisos'> | null;
  /** Secciones a las que el usuario puede navegar (route guard del host). */
  accessibleSections?: SectionType[];
  onIniciarTutorial: (tutorialId: string) => void;
  onSelectSection?: (section: SectionType) => void;
  /** Progreso ya existente. Sin él, los botones dicen «Comenzar». */
  servicio?: ServicioProgresoTutoriales;
}

export const CentroAyudaSection: React.FC<CentroAyudaSectionProps> = ({ usuario, accessibleSections, onIniciarTutorial, onSelectSection, servicio }) => {
  const ctx: ExperienceContext = useMemo(() => contextoDesdeUsuario(usuario, 'ayuda', { accessibleSections }), [usuario, accessibleSections]);
  const [consulta, setConsulta] = useState('');
  const [modulo, setModulo] = useState<ModuloERP | 'TODOS'>('TODOS');
  const [abierta, setAbierta] = useState<HelpEntry | null>(null);

  const modulos = useMemo(() => modulosConAyuda(ctx), [ctx]);
  const resultados = useMemo(() => {
    const base = buscarAyuda(ctx, consulta);
    return modulo === 'TODOS' ? base : base.filter((e) => e.module === modulo);
  }, [ctx, consulta, modulo]);
  const tutoriales = useMemo(() => tutorialesDisponibles(ctx), [ctx]);
  const [progresos, setProgresos] = useState<Record<string, TutorialProgress | null>>({});

  useEffect(() => {
    if (!servicio || tutoriales.length === 0) {
      setProgresos({});
      return;
    }
    let vivo = true;
    Promise.all(
      tutoriales.map(async (t) => {
        const r = await servicio.getTutorialProgress(t.id, hostDeTutorial(t));
        return [t.id, r.ok ? r.data : null] as const;
      })
    ).then((pares) => {
      if (!vivo) return;
      setProgresos(Object.fromEntries(pares));
    }).catch(() => {
      if (!vivo) return;
      setProgresos({});
    });
    return () => {
      vivo = false;
    };
  }, [servicio, tutoriales]);

  const resumenTutorial = (t: Tutorial) => {
    const ev = evaluarTutorial(t, ctx);
    const bloqueados = ev.filter((p) => !p.puedeEjecutar).length;
    return { total: ev.length, bloqueados };
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2 text-slate-900">
            <LifeBuoy className="w-5 h-5 text-blue-700" /> Centro de Ayuda
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Explicaciones de cada pantalla y tutoriales guiados, según tu perfil.</p>
        </div>
      </div>

      {abierta ? (
        <article className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" aria-label={abierta.title}>
          <button type="button" onClick={() => setAbierta(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver al listado
          </button>
          <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700">{NOMBRE_MODULO[abierta.module]}</p>
          <h3 className="text-base font-extrabold text-slate-900">{abierta.title}</h3>
          {abierta.content.split(/\n\s*\n/).map((p, i) => (
            <p key={i} className="text-sm text-slate-700 leading-relaxed">
              {p}
            </p>
          ))}
          {abierta.relatedTutorials && abierta.relatedTutorials.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <p className="text-xs font-bold text-slate-600">Tutoriales relacionados</p>
              {abierta.relatedTutorials.map((id) => {
                const t = obtenerTutorial(id);
                if (!t || !tutoriales.some((x) => x.id === id)) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onIniciarTutorial(id)}
                    className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-left text-xs font-semibold text-indigo-900 hover:bg-indigo-100 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" /> {t.title}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          )}
          {onSelectSection && abierta.section !== 'ayuda' && (!ctx.accessibleSections || ctx.accessibleSections.includes(abierta.section)) && (
            <button
              type="button"
              onClick={() => onSelectSection(abierta.section as SectionType)}
              className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
            >
              Ir a la pantalla →
            </button>
          )}
        </article>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <label className="relative block">
              <span className="sr-only">Buscar en la ayuda</span>
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Buscar ayuda: liquidación, invitación, lectura…"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </label>
            {modulos.length > 1 && (
              <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Filtrar por módulo">
                <button
                  type="button"
                  onClick={() => setModulo('TODOS')}
                  aria-pressed={modulo === 'TODOS'}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${modulo === 'TODOS' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
                >
                  Todos
                </button>
                {modulos.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModulo(m)}
                    aria-pressed={modulo === m}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${modulo === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}
                  >
                    {NOMBRE_MODULO[m]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <section aria-label="Contenidos de ayuda" className="space-y-2">
            {resultados.length === 0 ? (
              <p className="p-4 bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                No hay ayuda que coincida con «{consulta}». Prueba con otras palabras.
              </p>
            ) : (
              resultados.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setAbierta(e)}
                  className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-sm transition cursor-pointer"
                >
                  <p className="text-[10px] uppercase tracking-wider font-bold text-blue-700">{NOMBRE_MODULO[e.module]}</p>
                  <h3 className="text-sm font-extrabold text-slate-900">{e.title}</h3>
                  <p className="text-xs text-slate-600 mt-0.5">{e.summary}</p>
                </button>
              ))
            )}
          </section>

          <section aria-label="Tutoriales" className="space-y-2">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-indigo-700" /> Tutoriales guiados
            </h3>
            {tutoriales.length === 0 ? (
              <p className="p-4 bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 text-center">No hay tutoriales disponibles para tu perfil todavía.</p>
            ) : (
              tutoriales.map((t) => {
                const r = resumenTutorial(t);
                return (
                  <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-extrabold text-slate-900">{t.title}</h4>
                      <p className="text-xs text-slate-600 mt-0.5">{t.description}</p>
                      <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {t.minutes ?? '–'} min · {r.total} pasos
                        </span>
                        {r.bloqueados > 0 && (
                          <span className="inline-flex items-center gap-1 text-amber-700">
                            <Lock className="w-3 h-3" /> {r.bloqueados} paso(s) requieren otro permiso
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onIniciarTutorial(t.id)}
                      className="shrink-0 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer"
                    >
                      {etiquetaTutorial(progresos[t.id] ? estadoRecorrido(progresos[t.id], t) : 'NO_INICIADO')}
                    </button>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
};
