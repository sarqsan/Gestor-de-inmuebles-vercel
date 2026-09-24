/**
 * CAPA TRANSVERSAL §6 — FASE 4 · Asistente transversal (UI mínima, reutilizable).
 *
 * Botón + panel ligero (no es un chat): petición → estado de procesamiento → interpretación
 * validada → ambigüedad (elegir) / confirmación explícita (escritura) / error → ejecución por
 * el HOST (navegar, explicar, iniciar tutorial). Todo pasa por `resolverPeticion` +
 * `validarResolucionIA` + `ejecutarResolucion`; el componente nunca toca Firestore ni RBAC.
 * ERP y Portal comparten este componente con su propio contexto (`host`).
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Sparkles, X, Loader2, ArrowRight, AlertTriangle, ShieldAlert, CheckCircle2, BookOpen, HelpCircle } from 'lucide-react';
import type { UsuarioApp } from '../../types';
import type { AIIntentResolution, ExperienceContext, HostExperiencia, ProveedorIA } from '../../experiencia';
import { capacidadesDisponibles, confirmarResolucion, contextoDesdeUsuario, ejecutarResolucion, elegirAlternativa, obtenerAyuda, resolverPeticion, type AccionHost } from '../../experiencia';

export interface AsistentePanelProps {
  usuario?: Pick<UsuarioApp, 'tipoPerfil' | 'roles' | 'permisos'> | null;
  section: string;
  host?: HostExperiencia;
  /** Contexto ya resuelto por el host (tiene prioridad sobre usuario+section). */
  contexto?: ExperienceContext;
  accessibleSections?: string[];
  /** Proveedor IA (Gemini remoto). Sin él, resolutor local. */
  proveedor?: ProveedorIA;
  /** El host ejecuta la acción validada con sus propios medios (route guard, tutoriales, ayuda). */
  onAccion: (accion: Exclude<AccionHost, { tipo: 'NINGUNA' }>) => void;
  tema?: 'claro' | 'oscuro';
  variante?: 'icono' | 'texto';
  className?: string;
  /** Posición del panel. */
  posicion?: 'derecha' | 'centro';
}

const ETIQUETA_ESTADO: Record<AIIntentResolution['estado'], string> = {
  RESUELTA: 'Listo',
  REQUIERE_CONFIRMACION: 'Necesita tu confirmación',
  AMBIGUA: 'Varias opciones',
  SIN_CAPACIDAD: 'No disponible',
  SIN_PERMISO: 'Sin permiso',
  NO_SOPORTADA: 'No soportada',
  ERROR: 'Error',
};

export const AsistentePanel: React.FC<AsistentePanelProps> = ({ usuario, section, host = 'ERP' as HostExperiencia, contexto, accessibleSections, proveedor, onAccion, tema = 'claro', variante = 'icono', className = '', posicion = 'derecha' }) => {
  const ctx = useMemo(() => contexto ?? contextoDesdeUsuario(usuario, section, { host, accessibleSections }), [contexto, usuario, section, host, accessibleSections]);
  const disponible = useMemo(() => capacidadesDisponibles(ctx).length > 0, [ctx]);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [resolucion, setResolucion] = useState<AIIntentResolution | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const peticionId = useRef(0);

  useEffect(() => {
    if (!abierto) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto]);

  if (!disponible) return null;

  const ejecutar = (res: AIIntentResolution) => {
    const accion = ejecutarResolucion(res, ctx);
    if (accion.tipo === 'NINGUNA') {
      setResolucion({ ...res, estado: 'ERROR', explicacion: 'La acción ya no se puede realizar en este contexto.', errores: [accion.motivo], requiereConfirmacion: false });
      return;
    }
    onAccion(accion);
    setHecho(accion.tipo === 'NAVEGAR' ? 'Te he llevado a la pantalla.' : accion.tipo === 'TUTORIAL' ? 'Tutorial iniciado.' : 'Ayuda mostrada.');
    setResolucion(null);
    setTexto('');
    if (accion.tipo !== 'EXPLICAR') setAbierto(false);
  };

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || cargando) return;
    const id = ++peticionId.current;
    setCargando(true);
    setHecho(null);
    setResolucion(null);
    const res = await resolverPeticion(t, ctx, { proveedor });
    if (id !== peticionId.current) return; // petición superada
    setCargando(false);
    if (res.estado === 'RESUELTA' && !res.requiereConfirmacion && res.intencion !== 'EXPLICAR' && res.intencion !== 'CONSULTAR') {
      // Navegación/tutorial: sin efectos → ejecución directa
      ejecutar(res);
      return;
    }
    setResolucion(res);
  };

  const confirmar = () => {
    if (!resolucion) return;
    const c = confirmarResolucion(resolucion, ctx);
    if (c.confirmada) ejecutar(c);
    else setResolucion(c);
  };

  const ayudaMostrada = resolucion?.helpEntryId ? obtenerAyuda(resolucion.helpEntryId) : undefined;
  const tono = tema === 'oscuro' ? 'text-white/90 hover:bg-white/10 rounded-full p-2' : 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50';
  const clasePos = posicion === 'centro' ? 'fixed left-1/2 -translate-x-1/2 bottom-20 w-[calc(100%-2rem)] max-w-md' : 'absolute right-0 mt-2 w-[min(92vw,26rem)]';

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Asistente"
        aria-expanded={abierto}
        aria-controls={panelId}
        title="Asistente: escribe qué necesitas"
        className={`inline-flex items-center gap-1.5 rounded-xl transition-colors cursor-pointer ${tono} ${variante === 'texto' ? 'px-3 py-1.5 text-xs font-semibold border border-indigo-200 bg-white' : tema === 'claro' ? 'p-1.5' : ''}`}
      >
        <Sparkles className="w-4 h-4" />
        {variante === 'texto' && <span>Asistente</span>}
      </button>

      {abierto && (
        <section id={panelId} role="dialog" aria-modal="false" aria-label="Asistente" className={`${clasePos} z-[65] bg-white text-slate-900 border border-indigo-200 rounded-2xl shadow-2xl text-left`}>
          <header className="p-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Asistente {host === 'PORTAL_INQUILINO' ? 'del portal' : 'del ERP'}
            </p>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar asistente" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </header>

          <form onSubmit={enviar} className="p-3 flex items-center gap-2">
            <label htmlFor={`${panelId}-input`} className="sr-only">
              ¿Qué necesitas?
            </label>
            <input
              id={`${panelId}-input`}
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={500}
              placeholder={host === 'PORTAL_INQUILINO' ? 'Ej.: ver mis recibos, avisar de una avería…' : 'Ej.: ir a tesorería, qué es una liquidación…'}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:border-indigo-400"
              disabled={cargando}
            />
            <button type="submit" disabled={cargando || !texto.trim()} aria-label="Enviar petición" className="p-2 rounded-xl bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700 cursor-pointer">
              {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="px-3 pb-3 space-y-2" aria-live="polite">
            {cargando && (
              <p role="status" className="text-xs text-slate-500 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Interpretando tu petición…
              </p>
            )}
            {hecho && !cargando && !resolucion && (
              <p role="status" className="text-xs text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {hecho}
              </p>
            )}

            {resolucion && !cargando && (
              <div data-testid="asistente-resolucion" data-estado={resolucion.estado} className="space-y-2">
                <p className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                  {resolucion.estado === 'SIN_PERMISO' ? <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> : resolucion.estado === 'ERROR' || resolucion.estado === 'NO_SOPORTADA' || resolucion.estado === 'SIN_CAPACIDAD' ? <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> : <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                  {ETIQUETA_ESTADO[resolucion.estado]}
                  {resolucion.origen === 'LOCAL' && resolucion.avisos?.length ? <span className="font-normal text-slate-400"> · modo local</span> : null}
                </p>
                <p className="text-sm text-slate-800 leading-snug">{resolucion.explicacion}</p>
                {resolucion.avisos?.map((a) => (
                  <p key={a} className="text-[11px] text-slate-400">
                    {a}
                  </p>
                ))}
                {resolucion.errores.length > 0 && resolucion.estado === 'ERROR' && (
                  <ul className="text-[11px] text-rose-700 list-disc pl-4">
                    {resolucion.errores.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}

                {resolucion.estado === 'AMBIGUA' && resolucion.alternativas && (
                  <div className="flex flex-col gap-1" role="group" aria-label="Elige una opción">
                    {resolucion.alternativas.map((a) => (
                      <button key={a.capabilityId} type="button" onClick={() => setResolucion(elegirAlternativa(resolucion, a.capabilityId, ctx))} className="text-left text-xs px-3 py-2 rounded-xl border border-slate-200 hover:bg-indigo-50 hover:border-indigo-200 cursor-pointer">
                        {a.descripcion}
                      </button>
                    ))}
                  </div>
                )}

                {resolucion.estado === 'REQUIERE_CONFIRMACION' && (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={confirmar} className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer">
                      Sí, continuar
                    </button>
                    <button type="button" onClick={() => setResolucion(null)} className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
                      Cancelar
                    </button>
                  </div>
                )}

                {resolucion.estado === 'RESUELTA' && (resolucion.intencion === 'EXPLICAR' || resolucion.intencion === 'CONSULTAR') && (
                  <div className="space-y-2">
                    {ayudaMostrada && (
                      <article className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          <HelpCircle className="w-3.5 h-3.5 text-indigo-600" /> {ayudaMostrada.title}
                        </h4>
                        <p className="text-xs text-slate-700 whitespace-pre-line mt-1 max-h-48 overflow-y-auto">{ayudaMostrada.content}</p>
                      </article>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {resolucion.route && (
                        <button type="button" onClick={() => ejecutar({ ...resolucion, helpEntryId: undefined, tutorialId: undefined })} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer">
                          Ir a la pantalla <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {resolucion.tutorialId && (
                        <button type="button" onClick={() => ejecutar(resolucion)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-indigo-200 text-indigo-800 text-xs font-bold hover:bg-indigo-50 cursor-pointer">
                          <BookOpen className="w-3.5 h-3.5" /> Iniciar tutorial
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
