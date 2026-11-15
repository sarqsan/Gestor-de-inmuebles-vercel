/**
 * P1 · EVIDENCIAS FOTOGRÁFICAS de una intervención: ANTES / DURANTE / DESPUÉS.
 *
 * QUÉ RESUELVE Y QUÉ NO:
 *   - Clasifica por momento, permite añadir una observación y consultar lo ya
 *     adjuntado (con su fecha y su autor).
 *   - NO inventa un canal de subida: usa `onAdjuntar`, que el llamante conecta
 *     al circuito de Storage ya existente. La ruta y el tipo de archivo se
 *     validan en cliente con `validarEvidencia`/`rutaEvidencia` —el MISMO
 *     núcleo que las pruebas— antes de gastar datos del móvil.
 *
 * PRIVACIDAD:
 *   - La ruta se construye SIEMPRE bajo `incidencias/{incidenciaId}/`, que es el
 *     patrón que `storage.rules` y `autorizacionDocumental` ya autorizan al
 *     profesional asignado. Nunca se genera una URL pública: `url` es la que
 *     devuelva Storage y la vista previa usa `objectFit` sobre esa misma URL
 *     autenticada, sin firmas públicas ni enlaces permanentes.
 */
import React, { useMemo, useRef, useState } from 'react';
import { CalendarClock, Camera, FileText, Image as ImageIcon, Upload } from 'lucide-react';

import { MOMENTOS_EVIDENCIA, rutaEvidencia, validarEvidencia, type MomentoEvidencia } from '../../features/profesional/circuitoProfesional';
import type { AdjuntoIncidencia, TrabajoProfesional } from '../../types';

/**
 * Adjunto con la clasificación P1 opcional.
 *
 * `momentoEvidencia` / `observacion` / `fechaMomento` NO se añaden a
 * `AdjuntoIncidencia` en `src/types.ts` porque ese fichero es compartido y está
 * fijado byte a byte por la guardia de custodia. Se modelan aquí como extensión
 * OPCIONAL: un adjunto sin estos campos sigue siendo válido, así que no hay
 * migración ni incompatibilidad con los datos existentes.
 */
export interface EvidenciaTrabajo extends AdjuntoIncidencia {
  momentoEvidencia?: MomentoEvidencia;
  observacion?: string;
  fechaMomento?: string;
  trabajoId?: string;
  incidenciaId?: string;
  subidoPor?: string;
}

export const ETIQUETA_MOMENTO: Record<MomentoEvidencia, string> = {
  ANTES: 'Antes de la intervención',
  DURANTE: 'Durante la intervención',
  DESPUES: 'Después de la intervención',
};

export interface PanelEvidenciasProps {
  trabajo: TrabajoProfesional;
  /** Solo el profesional asignado puede adjuntar; el propietario solo consulta. */
  puedeAdjuntar: boolean;
  /**
   * Persiste una evidencia ya aceptada. Debe subir el archivo con la ruta
   * indicada y devolver el adjunto registrado.
   */
  onAdjuntar?: (entrada: {
    archivo: File;
    momento: MomentoEvidencia;
    observacion: string;
    ruta: string;
  }) => Promise<EvidenciaTrabajo | void>;
  /** Si el trabajo no tiene incidencia, no hay ruta autorizada para el profesional. */
  avisoSinRuta?: string;
}

const fechaCorta = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Normaliza `fotos`/`adjuntos`/`documentos` sin asumir una sola forma. */
function evidenciasDelTrabajo(trabajo: TrabajoProfesional): EvidenciaTrabajo[] {
  const salida: EvidenciaTrabajo[] = [];
  const push = (lista?: unknown[]) => {
    (lista || []).forEach((item) => {
      if (typeof item === 'string') {
        salida.push({ id: item, nombre: 'Archivo', url: item, fechaSubida: '' });
      } else if (item && typeof item === 'object' && 'url' in item) {
        salida.push(item as EvidenciaTrabajo);
      }
    });
  };
  push(trabajo.documentos as unknown[]);
  push(trabajo.adjuntos as unknown[]);
  push(trabajo.fotos as unknown[]);
  // Sin duplicados por id/url (en el modelo conviven las tres listas).
  const vistos = new Set<string>();
  return salida.filter((a) => {
    const clave = a.id || a.url;
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

export const PanelEvidencias: React.FC<PanelEvidenciasProps> = ({
  trabajo,
  puedeAdjuntar,
  onAdjuntar,
  avisoSinRuta,
}) => {
  const [momento, setMomento] = useState<MomentoEvidencia>('ANTES');
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [ver, setVer] = useState<EvidenciaTrabajo | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const evidencias = useMemo(() => evidenciasDelTrabajo(trabajo), [trabajo]);
  const porMomento = useMemo(() => {
    const mapa: Record<MomentoEvidencia, EvidenciaTrabajo[]> = { ANTES: [], DURANTE: [], DESPUES: [] };
    evidencias.forEach((e) => {
      const m = (e.momentoEvidencia as MomentoEvidencia) || 'DURANTE';
      if (mapa[m]) mapa[m].push(e);
      else mapa.DURANTE.push(e);
    });
    return mapa;
  }, [evidencias]);

  const sinClasificar = evidencias.filter((e) => !e.momentoEvidencia).length;

  const adjuntar = async (archivo: File) => {
    setError(null);
    setAviso(null);

    const comprobacion = validarEvidencia({
      nombre: archivo.name,
      tamanoBytes: archivo.size,
      tipo: archivo.type,
      momento,
    });
    if (!comprobacion.ok) {
      setError(comprobacion.error || 'El archivo no es válido.');
      return;
    }
    // La ruta se deriva SIEMPRE de la incidencia vinculada: es el ámbito que las
    // reglas de Storage autorizan al profesional asignado.
    const incidenciaId = trabajo.incidenciaId || '';
    const ruta = rutaEvidencia(incidenciaId, momento, archivo.name);
    if (!ruta) {
      setError(avisoSinRuta || 'Este trabajo no tiene una incidencia vinculada donde guardar la evidencia.');
      return;
    }
    if (!onAdjuntar) {
      setError('La subida de evidencias no está disponible en este contexto.');
      return;
    }

    setSubiendo(true);
    try {
      const registrada = await onAdjuntar({ archivo, momento, observacion: observacion.trim(), ruta });
      if (registrada && registrada.url) {
        setAviso('Evidencia adjuntada.');
      } else {
        setAviso('Evidencia enviada.');
      }
      setObservacion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido subir la evidencia.');
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Camera className="w-4 h-4 text-slate-500" />
        <h4 className="text-sm font-bold text-slate-900">Evidencias de la intervención</h4>
        <span className="text-[11px] font-semibold text-slate-500">{evidencias.length} archivo(s)</span>
      </div>

      {/* Resumen por momento: de un vistazo se ve qué falta. */}
      <div className="grid grid-cols-3 gap-2">
        {MOMENTOS_EVIDENCIA.map((m) => (
          <div
            key={m}
            className={`p-2 rounded-xl border ${
              porMomento[m].length ? 'bg-white border-slate-200' : 'bg-amber-50 border-amber-200'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{ETIQUETA_MOMENTO[m]}</div>
            <div className={`text-lg font-bold ${porMomento[m].length ? 'text-slate-800' : 'text-amber-800'}`}>
              {porMomento[m].length}
            </div>
          </div>
        ))}
      </div>

      {puedeAdjuntar && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {MOMENTOS_EVIDENCIA.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMomento(m)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                  momento === m
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                {ETIQUETA_MOMENTO[m]}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            maxLength={500}
            placeholder="Observación (opcional): qué muestra la foto o el documento"
            aria-label="Observación de la evidencia"
            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
          />

          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              disabled={subiendo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void adjuntar(f);
              }}
              className="block text-xs text-slate-700 file:mr-2 file:px-2.5 file:py-1 file:rounded-lg file:border-0 file:bg-slate-800 file:text-white file:text-[11px] file:font-bold file:cursor-pointer disabled:opacity-50"
            />
            {subiendo && <span className="text-[11px] font-semibold text-slate-600">Subiendo…</span>}
          </div>

          <p className="text-[10px] text-slate-500 flex items-center gap-1">
            <Upload className="w-3 h-3" />
            Imágenes y PDF hasta 10 MB. Se guardan en el expediente privado de la incidencia, sin enlaces públicos.
          </p>
        </div>
      )}

      {!puedeAdjuntar && (
        <p className="text-[11px] text-slate-500 italic">
          Solo el profesional asignado puede añadir evidencias. Puedes consultarlas aquí.
        </p>
      )}

      {error && (
        <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
          {error}
        </p>
      )}
      {aviso && (
        <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
          {aviso}
        </p>
      )}

      {sinClasificar > 0 && (
        <p className="text-[11px] text-slate-500">
          {sinClasificar} archivo(s) anteriores a esta mejora no tienen momento asignado; se muestran como «Durante».
        </p>
      )}

      {MOMENTOS_EVIDENCIA.map((m) => (
        <div key={m} className="space-y-1.5">
          <h5 className="text-xs font-bold text-slate-700">{ETIQUETA_MOMENTO[m]}</h5>
          {porMomento[m].length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">Sin archivos en este momento.</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {porMomento[m].map((e) => (
                <li key={e.id || e.url}>
                  <button
                    type="button"
                    onClick={() => setVer(e)}
                    className="w-full text-left p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-start gap-2 cursor-pointer"
                  >
                    {e.tipo === 'DOCUMENTO' || e.tipo === 'documento' ? (
                      <FileText className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-800 truncate">{e.nombre}</span>
                      {e.observacion && (
                        <span className="block text-[11px] text-slate-600 line-clamp-2">{e.observacion}</span>
                      )}
                      <span className="block text-[10px] text-slate-500 flex items-center gap-1">
                        <CalendarClock className="w-3 h-3" />
                        {fechaCorta(e.fechaSubida)}
                        {e.subidoPor ? ` · ${e.subidoPor}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {/* Consulta de la evidencia. Misma URL autenticada del expediente: sin
          enlace público ni copia firmada permanente. */}
      {ver && (
        <div className="p-3 bg-slate-900/5 border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800 truncate">{ver.nombre}</span>
            <button
              type="button"
              onClick={() => setVer(null)}
              className="text-[11px] font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cerrar
            </button>
          </div>
          {ver.observacion && <p className="text-[11px] text-slate-700">{ver.observacion}</p>}
          {ver.url && !(ver.tipo === 'DOCUMENTO' || ver.tipo === 'documento') && (
            <img
              src={ver.url}
              alt={ver.nombre}
              referrerPolicy="no-referrer"
              className="max-h-64 w-auto rounded-lg border border-slate-200"
            />
          )}
          {ver.url && (
            <a
              href={ver.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[11px] font-bold text-blue-700 hover:underline"
            >
              Abrir en el visor privado
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default PanelEvidencias;
