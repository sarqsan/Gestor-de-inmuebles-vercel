/**
 * CAPA TRANSVERSAL §6 — FASE 1/2 · Reproductor de tutoriales y recorridos guiados.
 *
 * Panel flotante (no bloquea la pantalla) que muestra el paso actual, permite avanzar/retroceder/
 * saltar, navegar a la pantalla del paso (a través del host, respetando su route guard),
 * cancelar/finalizar y —F2— resalta visualmente el `target` del paso si existe y es visible.
 *
 * F3 · Persistencia: la sesión sigue viviendo en memoria del host (estado de UI), pero si el
 * host inyecta `servicio` (único servicio transversal `servicioProgresoTutoriales`) el
 * reproductor recupera el progreso al abrir, guarda al avanzar/retroceder/saltar, al salir
 * (cancelar) y al finalizar (`completed`). Si Firestore falla, el tutorial continúa en memoria
 * y se informa de forma no intrusiva; el siguiente cambio vuelve a intentar guardar.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, X, Lock, ExternalLink, CheckCircle2, SkipForward, CloudOff, History } from 'lucide-react';
import type { ExperienceContext, ServicioProgresoTutoriales, SesionTutorial, Tutorial } from '../../experiencia';
import { avanzar, cancelar, esUltimoPaso, evaluarPaso, finalizar, hostDeTutorial, limpiarResaltado, pasoActual, progreso, resaltarTarget, retroceder, saltar, sesionDesdeProgreso, targetVisible } from '../../experiencia';

interface TutorialPlayerProps {
  tutorial: Tutorial;
  sesion: SesionTutorial;
  contexto: ExperienceContext;
  onCambio: (sesion: SesionTutorial) => void;
  /** Navegación del host (misma función que usa el menú; el route guard del host sigue mandando). */
  onNavegar?: (route: string) => void;
  onCerrar: () => void;
  /** Posición del panel (el portal móvil usa 'abajo-centro'). */
  posicion?: 'abajo-derecha' | 'abajo-centro';
  /** F3 · Servicio de persistencia del progreso (opcional: sin él, la sesión es solo memoria). */
  servicio?: ServicioProgresoTutoriales;
}

type EstadoPersistencia = 'INACTIVA' | 'CARGANDO' | 'SINCRONIZADA' | 'ERROR' | 'SIN_SESION';

const claveSesion = (s: SesionTutorial) => `${s.tutorialId}|${s.indice}|${s.estado}|${(s.saltados ?? []).join(',')}`;

export const TutorialPlayer: React.FC<TutorialPlayerProps> = ({ tutorial, sesion, contexto, onCambio, onNavegar, onCerrar, posicion = 'abajo-derecha', servicio }) => {
  const paso = pasoActual(sesion, tutorial);
  const completado = sesion.estado === 'COMPLETADO';
  const enRutaDelPaso = !paso.route || paso.route === contexto.section;
  // Re-evaluación del target tras cada render relevante (cambio de paso/sección/estado)
  const [tick, setTick] = useState(0);

  // ------------------------------------------------------------------ F3 · persistencia
  const [persistencia, setPersistencia] = useState<EstadoPersistencia>(servicio ? 'CARGANDO' : 'INACTIVA');
  const [reanudadoDesde, setReanudadoDesde] = useState<number | null>(null);
  const cargado = useRef(!servicio); // no se guarda nada hasta haber intentado recuperar
  const ultimoGuardado = useRef<string | null>(null);
  const cola = useRef<Promise<unknown>>(Promise.resolve());
  const sesionRef = useRef(sesion);
  sesionRef.current = sesion;
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;

  const guardar = (s: SesionTutorial) => {
    if (!servicio || !cargado.current) return;
    const clave = claveSesion(s);
    if (ultimoGuardado.current === clave) return;
    ultimoGuardado.current = clave;
    cola.current = cola.current.then(async () => {
      const r = await servicio.saveTutorialProgress(s, tutorial);
      if (r.ok) setPersistencia('SINCRONIZADA');
      else if (r.motivo === 'NO_AUTENTICADO') setPersistencia('SIN_SESION');
      else {
        ultimoGuardado.current = null; // el siguiente cambio (o «Reintentar») vuelve a intentarlo
        setPersistencia('ERROR');
      }
    });
  };

  // Recuperar progreso al abrir (una vez por tutorial). Si el host ya arrancó en un paso > 0
  // (p. ej. sesión reanudada por él), no se sobrescribe su estado.
  useEffect(() => {
    if (!servicio) return;
    let vigente = true;
    cargado.current = false;
    setPersistencia('CARGANDO');
    servicio.getTutorialProgress(tutorial.id, hostDeTutorial(tutorial)).then((r) => {
      if (!vigente) return;
      cargado.current = true;
      if (!r.ok) {
        setPersistencia(r.motivo === 'NO_AUTENTICADO' ? 'SIN_SESION' : 'ERROR');
        return;
      }
      setPersistencia('SINCRONIZADA');
      const actual = sesionRef.current;
      const reanudada = sesionDesdeProgreso(r.data, tutorial);
      if (reanudada && actual.estado === 'EN_CURSO' && actual.indice === 0 && !(actual.saltados && actual.saltados.length > 0)) {
        ultimoGuardado.current = claveSesion(reanudada); // ya está así en Firestore
        setReanudadoDesde(reanudada.indice);
        onCambioRef.current(reanudada);
      } else {
        guardar(actual); // deja constancia del inicio (paso 0)
      }
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial.id, servicio]);

  // Guardar en cada cambio de sesión (avanzar, retroceder, saltar, finalizar, cancelar)
  useEffect(() => {
    guardar(sesion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.indice, sesion.estado, sesion.saltados?.length]);

  // Guardar al desmontar si el host cierra sin pasar por «Salir» (p. ej. cierre de sesión)
  useEffect(
    () => () => {
      const s = sesionRef.current;
      if (servicio && cargado.current && ultimoGuardado.current !== claveSesion(s)) guardar(s);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const evaluacion = useMemo(
    () => evaluarPaso(paso, sesion.indice, tutorial.steps.length, contexto, { targetVisible: enRutaDelPaso ? targetVisible : undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paso, sesion.indice, tutorial.steps.length, contexto, enRutaDelPaso, tick]
  );

  // F2 · Resaltado visual real del target: se aplica al entrar en el paso (o al llegar a su ruta)
  // y se limpia al cambiar de paso, cancelar, finalizar o desmontar.
  useEffect(() => {
    if (completado || sesion.estado !== 'EN_CURSO' || !paso.target || !enRutaDelPaso) {
      limpiarResaltado();
      return;
    }
    // El host puede tardar un frame en pintar la sección destino: reintento breve.
    let intentos = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const intentar = () => {
      const r = resaltarTarget(paso.target as string);
      if (r.estado !== 'RESALTADO' && intentos < 5) {
        intentos += 1;
        timer = setTimeout(intentar, 120);
      } else {
        setTick((t) => t + 1);
      }
    };
    intentar();
    return () => {
      if (timer) clearTimeout(timer);
      limpiarResaltado();
    };
  }, [paso.target, paso.id, enRutaDelPaso, completado, sesion.estado, contexto.section]);

  useEffect(() => () => limpiarResaltado(), []);

  const ultimo = esUltimoPaso(sesion, tutorial);
  const pct = Math.round(progreso(sesion, tutorial) * 100);
  const clasePos = posicion === 'abajo-centro' ? 'bottom-20 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md' : 'bottom-20 md:bottom-6 right-4 w-[calc(100vw-2rem)] sm:w-96';

  const cerrarCancelando = () => {
    limpiarResaltado();
    const cancelada = cancelar(sesion);
    guardar(cancelada); // el paso actual queda guardado: al volver, se reanuda desde aquí
    onCambio(cancelada);
    onCerrar();
  };

  const reintentarGuardado = () => {
    ultimoGuardado.current = null;
    guardar(sesion);
  };

  return (
    <aside role="dialog" aria-label={`Tutorial: ${tutorial.title}`} aria-live="polite" className={`fixed z-[70] bg-white border border-indigo-200 rounded-2xl shadow-2xl ${clasePos}`}>
      <header className="p-4 border-b border-slate-100 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 flex items-center gap-1">
            <BookOpen className="w-3 h-3" /> {tutorial.host === 'PORTAL_INQUILINO' ? 'Recorrido' : 'Tutorial'}
          </p>
          <h3 className="text-sm font-extrabold text-slate-900 truncate">{tutorial.title}</h3>
        </div>
        <button type="button" onClick={cerrarCancelando} aria-label="Cancelar tutorial" className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </header>

      <div className="px-4 pt-3">
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          Paso {sesion.indice + 1} de {tutorial.steps.length}
          {sesion.saltados && sesion.saltados.length > 0 && <span className="text-slate-400"> · {sesion.saltados.length} saltado(s)</span>}
        </p>
        {reanudadoDesde !== null && sesion.indice === reanudadoDesde && sesion.estado === 'EN_CURSO' && (
          <p className="text-[11px] text-indigo-700 mt-1 inline-flex items-center gap-1" role="status" data-testid="tutorial-reanudado">
            <History className="w-3 h-3" /> Reanudado desde el paso {reanudadoDesde + 1}
          </p>
        )}
        {(persistencia === 'ERROR' || persistencia === 'SIN_SESION') && (
          <p className="text-[11px] text-amber-700 mt-1 inline-flex items-center gap-1" role="status" data-testid="tutorial-persistencia">
            <CloudOff className="w-3 h-3" />
            {persistencia === 'ERROR' ? (
              <>
                No se pudo guardar el progreso; puedes continuar y se reintentará.
                <button type="button" onClick={reintentarGuardado} className="underline font-semibold cursor-pointer">
                  Reintentar
                </button>
              </>
            ) : (
              'El progreso no se guarda sin sesión iniciada.'
            )}
          </p>
        )}
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
                onClick={() => onNavegar(paso.route as string)}
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
          <button
            type="button"
            onClick={() => {
              limpiarResaltado();
              onCerrar();
            }}
            className="ml-auto px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer"
          >
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
            <div className="flex items-center gap-2">
              <button type="button" onClick={cerrarCancelando} className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 cursor-pointer">
                Salir
              </button>
              <button
                type="button"
                onClick={() => onCambio(saltar(sesion, tutorial))}
                aria-label="Saltar paso"
                title="Saltar este paso"
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5" /> Saltar
              </button>
            </div>
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
