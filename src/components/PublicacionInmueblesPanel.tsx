import React, { useEffect, useMemo, useState } from 'react';
import {
  EstadoSindicacionPortal,
  FormatoFeedPublicacion,
  HabitacionInmueble,
  Inmueble,
  PortalInmobiliario,
  RegistroTrazabilidadPublicacion,
  UsuarioApp,
} from '../types';
import {
  buildPublicacionInmueble,
  estadoSindicacionInicial,
  aplicarEstadoPublicacion,
  identidadPublicacionPortal,
  registrarTrazabilidadPublicacion,
  validarPublicacion,
} from '../utils/publicacionEngine';
import { ADAPTADORES_PORTAL, FORMATOS_EXPORTACION, PORTALES_DISPONIBLES, generarExportacion, obtenerAdaptadorPortal } from '../utils/publicacionPortales';
import { subscribeHabitacionesInmueble } from '../lib/firebase';
import { Megaphone, Download, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

/**
 * GAP 5 — Panel de sindicación/publicación (fase 13).
 * Exportación manual: valida, genera el feed en el formato elegido, lo muestra y lo descarga.
 * No automatiza la publicación en portales que requieren credenciales/acceso externo.
 */
interface PublicacionInmueblesPanelProps {
  inmueble?: Inmueble | null;
  currentUser?: UsuarioApp | null;
}

export const PublicacionInmueblesPanel: React.FC<PublicacionInmueblesPanelProps> = ({ inmueble, currentUser }) => {
  const [abierto, setAbierto] = useState(false);
  const [habitaciones, setHabitaciones] = useState<HabitacionInmueble[]>([]);
  const [formato, setFormato] = useState<FormatoFeedPublicacion>('XML_KYLERO');
  const [portalSel, setPortalSel] = useState<PortalInmobiliario>('KYERO');
  const [resultado, setResultado] = useState<string | null>(null);
  const [errorGen, setErrorGen] = useState<string | null>(null);
  const [estados, setEstados] = useState<EstadoSindicacionPortal[]>([]);
  const [trazabilidad, setTrazabilidad] = useState<RegistroTrazabilidadPublicacion[]>([]);

  useEffect(() => {
    if (!inmueble || inmueble.modalidadAlquiler !== 'habitaciones') {
      setHabitaciones([]);
      return;
    }
    const unsub = subscribeHabitacionesInmueble(inmueble.id, setHabitaciones);
    return () => unsub && unsub();
  }, [inmueble?.id, inmueble?.modalidadAlquiler]);

  const publicacion = useMemo(
    () => (inmueble ? buildPublicacionInmueble(inmueble, habitaciones) : null),
    [inmueble, habitaciones]
  );
  const validacion = useMemo(() => (publicacion ? validarPublicacion(publicacion) : null), [publicacion]);

  useEffect(() => {
    if (inmueble) setEstados(estadoSindicacionInicial(inmueble.id, PORTALES_DISPONIBLES));
    setResultado(null);
    setErrorGen(null);
  }, [inmueble?.id]);

  if (!inmueble) return null;

  const generar = () => {
    if (!publicacion || !validacion) return;
    const res = generarExportacion([publicacion], formato, portalSel);
    const traza = registrarTrazabilidadPublicacion(
      publicacion,
      portalSel,
      formato,
      validacion,
      res.ok ? identidadPublicacionPortal(publicacion.inmuebleId, portalSel).externalId : undefined
    );
    setTrazabilidad((prev) => [traza, ...prev].slice(0, 20));
    if (!res.ok) {
      setErrorGen(res.motivo || 'Error generando el feed.');
      setResultado(null);
      setEstados((prev) =>
        prev.map((e) =>
          e.portal === portalSel
            ? aplicarEstadoPublicacion(e, 'ERROR', { ultimoError: res.motivo }).registro || e
            : e
        )
      );
      return;
    }
    setErrorGen(null);
    setResultado(res.contenido || '');
    setEstados((prev) =>
      prev.map((e) => {
        if (e.portal !== portalSel) return e;
        const aValidado = aplicarEstadoPublicacion(e, e.estado === 'BORRADOR' ? 'VALIDADO' : 'ACTUALIZADO');
        return aValidado.ok ? aValidado.registro! : e;
      })
    );
  };

  const descargar = () => {
    if (!resultado) return;
    const ext = formato.startsWith('XML') ? 'xml' : formato === 'JSON_LD' ? 'jsonld' : 'json';
    const mime = formato.startsWith('XML') ? 'application/xml' : formato === 'JSON_LD' ? 'application/ld+json' : 'application/json';
    const blob = new Blob([resultado], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feed_${inmueble.id}_${formato.toLowerCase()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <button
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100">
            <Megaphone className="w-5 h-5" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-slate-900">Sindicación y Publicación Multicanal</h3>
            <p className="text-[11px] text-slate-500">Valida y exporta el anuncio (Kyero XML, JSON, JSON-LD) sin publicar automáticamente.</p>
          </div>
        </div>
        <span className="text-xs font-bold text-slate-400">{abierto ? 'Cerrar' : 'Abrir'}</span>
      </button>

      {abierto && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-100 pt-4">
          {/* VALIDACIÓN */}
          {validacion && (
            <div className="space-y-1.5">
              {validacion.erroresBloqueantes.map((e, i) => (
                <div key={`e${i}`} className="flex items-start gap-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {e}
                </div>
              ))}
              {validacion.advertencias.map((w, i) => (
                <div key={`w${i}`} className="flex items-start gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
                </div>
              ))}
              {validacion.valido && validacion.advertencias.length === 0 && (
                <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Datos completos y válidos para publicación.
                </div>
              )}
            </div>
          )}

          {/* SELECTORES */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={portalSel} onChange={(e) => setPortalSel(e.target.value as PortalInmobiliario)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
              {PORTALES_DISPONIBLES.map((p) => (
                <option key={p} value={p}>{p} {obtenerAdaptadorPortal(p)?.modo === 'PENDIENTE_ACCESO_OPERADOR' ? '(preparado)' : '(feed)'}</option>
              ))}
            </select>
            <select value={formato} onChange={(e) => setFormato(e.target.value as FormatoFeedPublicacion)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
              {FORMATOS_EXPORTACION.map((f) => (
                <option key={f.formato} value={f.formato}>{f.etiqueta}</option>
              ))}
            </select>
            <button
              onClick={generar}
              disabled={!validacion?.valido}
              className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold"
            >
              Validar y generar feed
            </button>
            {resultado && (
              <button onClick={descargar} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" /> Descargar
              </button>
            )}
          </div>

          {errorGen && <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{errorGen}</div>}

          {/* ADAPTADOR: requisitos del portal elegido */}
          {(() => {
            const ad = obtenerAdaptadorPortal(portalSel);
            if (!ad) return null;
            return (
              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-1">
                <p><strong>{ad.nombre}</strong> · {ad.modo === 'FEED_XML_GENERABLE' ? 'Feed generable' : 'Pendiente de acceso del operador'}</p>
                <p>{ad.mecanismo}</p>
                {ad.requisitos.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5">
                    {ad.requisitos.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            );
          })()}

          {/* RESULTADO */}
          {resultado && (
            <pre className="text-[10px] leading-relaxed bg-slate-900 text-emerald-200 rounded-xl p-4 overflow-auto max-h-72 whitespace-pre-wrap">{resultado.slice(0, 8000)}{resultado.length > 8000 ? '\n… (descarga el archivo completo)' : ''}</pre>
          )}

          {/* ESTADOS POR PORTAL (independientes del estado interno del inmueble) */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Estado de publicación por portal</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {estados.map((e) => (
                <div key={e.portal} className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50">
                  <div>
                    <span className="text-[11px] font-bold text-slate-700">{e.portal}</span>
                    <span className="block text-[9px] text-slate-400">ext: {e.externalId}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    e.estado === 'ERROR' ? 'bg-rose-100 text-rose-700'
                    : e.estado === 'PUBLICADO' || e.estado === 'ACTUALIZADO' ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600'
                  }`}>{e.estado}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TRAZABILIDAD */}
          {trazabilidad.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Trazabilidad (sesión actual)</h4>
              <div className="space-y-1">
                {trazabilidad.map((t, i) => (
                  <div key={i} className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                    {new Date(t.fecha).toLocaleString('es-ES')} · {t.portal} · {t.formato} · {t.resultado}
                    {t.externalId ? ` · ${t.externalId}` : ''}
                    {t.errores.length > 0 ? ` · errores: ${t.errores.join('; ')}` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentUser && (
            <p className="text-[10px] text-slate-400">
              Identidad estable por inmueble + portal: actualizar el anuncio regenera el contenido sin duplicarlo. La publicación real en portales con acceso restringido se realiza fuera del ERP.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
