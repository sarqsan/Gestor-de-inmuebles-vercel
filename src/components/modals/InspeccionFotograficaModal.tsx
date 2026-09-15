import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  Camera,
  Trash2,
  Loader2,
  Check,
  RotateCcw,
  ZoomIn,
  Sparkles,
  AlertCircle,
  Wand2,
  Info,
} from 'lucide-react';
import type {
  EstanciaFoto,
  ExpedienteRecomercializacion,
  FotoInspeccion,
  Inmueble,
} from '../../types';
import {
  agregarFotoInspeccion,
  aplicarAnalisisFotos,
  DESTINO_INMUEBLE_LABEL,
  ESTANCIAS_ORDEN,
  ESTANCIA_LABEL,
  ESTADOS_RECOMERCIALIZACION,
  nuevoFotoInspeccionId,
  puedeTransicionar,
  quitarFotoInspeccion,
} from '../../utils/recomercializacionEngine';
import {
  deleteFotoInspeccionStorage,
  uploadFotoInspeccionStorage,
} from '../../lib/firebase';
import { compressImageForUpload } from '../../utils/fileCompressor';
import { analizarFotosInspeccion } from '../../utils/inspeccionIa';

interface Props {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
  onGuardar: (expediente: ExpedienteRecomercializacion) => Promise<void> | void;
  onClose: () => void;
}

interface Progreso {
  actual: number;
  total: number;
  nombre: string;
}

export const InspeccionFotograficaModal: React.FC<Props> = ({
  expediente,
  inmueble,
  onGuardar,
  onClose,
}) => {
  const [fotos, setFotos] = useState<FotoInspeccion[]>(
    expediente.revisionFotografica?.fotografias ?? []
  );
  const [estanciaActiva, setEstanciaActiva] = useState<EstanciaFoto>('salon');
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fotoZoom, setFotoZoom] = useState<FotoInspeccion | null>(null);
  // FASE 3.3: diagnóstico por IA (texto de progreso, null cuando está inactivo)
  const [progresoIa, setProgresoIa] = useState<string | null>(null);
  const [colapsarHallazgos, setColapsarHallazgos] = useState<Set<EstanciaFoto>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const estado = expediente.estado;
  const esEditable = estado === 'REVISION_PENDIENTE' || estado === 'FOTOS_ACTUALIZADAS';

  const fotosAnalizadas = useMemo(() => fotos.filter((f) => !!f.analisisIa), [fotos]);
  const fotosPendientesAnalisis = useMemo(() => fotos.filter((f) => !f.analisisIa), [fotos]);
  const hayMotorHeuristico = fotosAnalizadas.some((f) => f.analisisIa?.motor === 'heuristico');

  const prioridadColor: Record<string, string> = {
    alta: 'bg-rose-100 text-rose-700 border-rose-200',
    media: 'bg-amber-100 text-amber-800 border-amber-200',
    baja: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  const prioridadLabel: Record<string, string> = {
    alta: 'Revisión prioritaria',
    media: 'Revisar',
    baja: 'Aparentemente cuidada',
  };

  const fotosPorEstancia = useMemo(() => {
    const mapa = new Map<EstanciaFoto, FotoInspeccion[]>();
    ESTANCIAS_ORDEN.forEach((e) => mapa.set(e, []));
    fotos.forEach((f) => {
      const lista = mapa.get(f.estancia);
      if (lista) lista.push(f);
    });
    return mapa;
  }, [fotos]);

  const persistir = async (siguiente: ExpedienteRecomercializacion) => {
    setGuardando(true);
    try {
      await onGuardar(siguiente);
    } finally {
      setGuardando(false);
    }
  };

  const abrirSelector = (estancia: EstanciaFoto) => {
    setErrorMsg('');
    setEstanciaActiva(estancia);
    fileInputRef.current?.click();
  };

  const handleArchivos = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const archivos = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (archivos.length === 0) {
      setErrorMsg('Selecciona únicamente archivos de imagen (JPG, PNG o WebP).');
      return;
    }

    let actual = expediente;
    const nuevas: FotoInspeccion[] = [];
    setProgreso({ actual: 0, total: archivos.length, nombre: '' });
    setErrorMsg('');

    for (let i = 0; i < archivos.length; i += 1) {
      const file = archivos[i];
      setProgreso({ actual: i, total: archivos.length, nombre: file.name });
      try {
        // Resolución suficiente para el análisis visual de la fase 3.3,
        // pero comprimida para que Storage sea rápido y económico.
        const { blob } = await compressImageForUpload(file, 1600, 1600, 0.72);
        const { url, storagePath } = await uploadFotoInspeccionStorage(
          expediente.propietarioId,
          expediente.id,
          estanciaActiva,
          blob,
          file.name
        );
        const foto: FotoInspeccion = {
          id: nuevoFotoInspeccionId(estanciaActiva),
          estancia: estanciaActiva,
          url,
          storagePath,
          fecha: new Date().toISOString(),
        };
        nuevas.push(foto);
        actual = agregarFotoInspeccion(actual, foto);
        setFotos(actual.revisionFotografica?.fotografias ?? []);
        // Autoguardado tras cada subida para no perder el trabajo si se corta.
        await onGuardar(actual);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al subir la fotografía.';
        setErrorMsg(`No se pudo subir «${file.name}»: ${msg} Puedes reintentarlo.`);
      }
    }
    setProgreso(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEliminar = async (foto: FotoInspeccion) => {
    if (!window.confirm(`¿Eliminar esta fotografía de ${ESTANCIA_LABEL[foto.estancia]}?`)) return;
    setErrorMsg('');
    setGuardando(true);
    try {
      const siguiente = quitarFotoInspeccion(
        { ...expediente, revisionFotografica: { fechaCarga: expediente.revisionFotografica?.fechaCarga, fotografias: fotos } },
        foto.id
      );
      setFotos(siguiente.revisionFotografica?.fotografias ?? []);
      await onGuardar(siguiente);
      await deleteFotoInspeccionStorage(foto.storagePath);
    } catch {
      setErrorMsg('La foto se quitó del expediente pero hubo un problema al borrarla del almacenamiento.');
    } finally {
      setGuardando(false);
    }
  };

  const handleAnalizar = async (reanalizarTodo: boolean) => {
    const objetivo = reanalizarTodo ? fotos : fotosPendientesAnalisis;
    if (objetivo.length === 0) return;
    setErrorMsg('');
    setProgresoIa(`Preparando el análisis de ${objetivo.length} fotografía(s)…`);

    const aplicarYGuardar = async (mapa: Map<string, FotoInspeccion['analisisIa']>) => {
      if (mapa.size === 0) return;
      const base: ExpedienteRecomercializacion = {
        ...expediente,
        revisionFotografica: {
          fechaCarga: expediente.revisionFotografica?.fechaCarga || new Date().toISOString(),
          fotografias: fotos,
        },
      };
      const siguiente = aplicarAnalisisFotos(base, mapa);
      setFotos(siguiente.revisionFotografica?.fotografias ?? []);
      await onGuardar(siguiente);
    };

    try {
      const mapa = await analizarFotosInspeccion(
        objetivo,
        {
          direccion: inmueble?.direccion,
          destino: DESTINO_INMUEBLE_LABEL[expediente.destinoPrevisto],
        },
        (texto) => setProgresoIa(texto || null),
        // Autoguardado por lote para no perder el trabajo si se corta.
        async (mapaParcial) => {
          try {
            await aplicarYGuardar(mapaParcial);
          } catch {
            /* se reintenta al finalizar */
          }
        }
      );
      if (mapa.size === 0) {
        setErrorMsg(
          'No se pudo analizar ninguna fotografía. Revisa la conexión y que el servidor de IA esté disponible, y reinténtalo.'
        );
      } else if (mapa.size < objetivo.length) {
        setErrorMsg(
          `Se analizaron ${mapa.size} de ${objetivo.length} fotografías; el resto puede reanalizarse.`
        );
      }
      await aplicarYGuardar(mapa);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al contactar con el servicio de análisis.';
      setErrorMsg(`Diagnóstico IA no disponible: ${msg}`);
    } finally {
      setProgresoIa(null);
    }
  };

  const toggleColapsar = (est: EstanciaFoto) => {
    setColapsarHallazgos((prev) => {
      const next = new Set(prev);
      if (next.has(est)) next.delete(est);
      else next.add(est);
      return next;
    });
  };

  const marcarFotosActualizadas = async () => {
    if (fotos.length === 0) {
      setErrorMsg('Sube al menos una fotografía antes de completar la inspección.');
      return;
    }
    const ahora = new Date().toISOString();
    await persistir({
      ...expediente,
      estado: 'FOTOS_ACTUALIZADAS',
      revisionFotografica: { fechaCarga: ahora, fotografias: fotos },
      updatedAt: ahora,
    });
  };

  const volverARevision = async () => {
    const ahora = new Date().toISOString();
    await persistir({
      ...expediente,
      estado: 'REVISION_PENDIENTE',
      revisionFotografica: {
        fechaCarga: expediente.revisionFotografica?.fechaCarga || ahora,
        fotografias: fotos,
      },
      updatedAt: ahora,
    });
  };

  const inputCls = 'hidden';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">Inspección visual</h3>
              <p className="text-xs text-slate-500">
                {inmueble?.direccion || 'Expediente'} · {fotos.length} foto{fotos.length === 1 ? '' : 's'} cargada{fotos.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${ESTADOS_RECOMERCIALIZACION[estado].color}`}>
              {ESTADOS_RECOMERCIALIZACION[estado].label}
            </span>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3.5 text-xs text-sky-900 flex items-start gap-2">
            <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-sky-600" />
            <span>
              Recorre la vivienda por estancias y sube fotografías actualizadas (varias por zona, con
              buena luz y encuadrando lo relevante). Después pulsa <b>«Diagnóstico IA»</b>: la visión
              artificial revisa pintura, iluminación, electrodomésticos/grifería, mobiliario,
              presentación y posibles desperfectos, siempre en tono de <b>indicios y sugerencias</b>,
              nunca como una certeza.
            </span>
          </div>

          {progresoIa && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 flex items-center gap-3 text-xs text-violet-900">
              <Loader2 className="w-4 h-4 animate-spin text-violet-600 shrink-0" />
              <span className="truncate">{progresoIa}</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className={inputCls}
            onChange={(e) => handleArchivos(e.target.files)}
          />

          {progreso && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3 text-xs text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
              <span className="truncate">
                Subiendo {progreso.actual + 1}/{progreso.total}: {progreso.nombre}
              </span>
            </div>
          )}

          {/* Estancias */}
          <div className="space-y-4">
            {ESTANCIAS_ORDEN.map((estancia) => {
              const fotosEstancia = fotosPorEstancia.get(estancia) ?? [];
              return (
                <div key={estancia} className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{ESTANCIA_LABEL[estancia]}</span>
                      {fotosEstancia.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-700 text-[10px] font-bold">
                          {fotosEstancia.length}
                        </span>
                      )}
                    </div>
                    {esEditable && (
                      <button
                        type="button"
                        onClick={() => abrirSelector(estancia)}
                        disabled={!!progreso || !!progresoIa || guardando}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 bg-white border border-sky-200 rounded-lg hover:bg-sky-50 disabled:opacity-50"
                      >
                        <Camera className="w-3.5 h-3.5" /> Añadir
                      </button>
                    )}
                  </div>
                  <div className="p-3">
                    {fotosEstancia.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => esEditable && abrirSelector(estancia)}
                        disabled={!esEditable || !!progreso || !!progresoIa || guardando}
                        className="w-full py-6 border-2 border-dashed border-slate-200 rounded-lg text-[11px] text-slate-400 hover:border-sky-300 hover:text-sky-600 transition disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:text-slate-400"
                      >
                        Sin fotografías de {ESTANCIA_LABEL[estancia].toLowerCase()}
                      </button>
                    ) : (
                      <>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                        {fotosEstancia.map((foto) => (
                          <div
                            key={foto.id}
                            className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                          >
                            <img
                              src={foto.url}
                              alt={`${ESTANCIA_LABEL[foto.estancia]} ${foto.id}`}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {foto.analisisIa && (
                              <span
                                className={`absolute top-1 left-1 px-1 py-0.5 rounded border text-[8px] font-bold flex items-center gap-0.5 ${
                                  prioridadColor[foto.analisisIa.prioridad || 'media']
                                }`}
                                title={prioridadLabel[foto.analisisIa.prioridad || 'media']}
                              >
                                <Sparkles className="w-2.5 h-2.5" />
                                {foto.analisisIa.prioridad === 'alta'
                                  ? 'IA · alta'
                                  : foto.analisisIa.prioridad === 'baja'
                                  ? 'IA · ok'
                                  : 'IA'}
                              </span>
                            )}
                            {esEditable && (
                              <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => setFotoZoom(foto)}
                                  title="Ampliar"
                                  className="p-1.5 rounded-lg bg-white/90 text-slate-700 hover:bg-white"
                                >
                                  <ZoomIn className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEliminar(foto)}
                                  title="Eliminar foto"
                                  className="p-1.5 rounded-lg bg-white/90 text-rose-600 hover:bg-white"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {(() => {
                        const analizadas = fotosEstancia.filter((f) => f.analisisIa);
                        if (analizadas.length === 0) return null;
                        const observaciones = analizadas.flatMap(
                          (f) => f.analisisIa?.observaciones || []
                        );
                        const sugerencias = analizadas.flatMap(
                          (f) => f.analisisIa?.sugerenciasMejora || []
                        );
                        const colapsado = colapsarHallazgos.has(estancia);
                        const prior = analizadas.some((f) => f.analisisIa?.prioridad === 'alta')
                          ? 'alta'
                          : analizadas.some((f) => f.analisisIa?.prioridad === 'media')
                          ? 'media'
                          : 'baja';
                        return (
                          <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/40 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleColapsar(estancia)}
                              className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold text-violet-900"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" /> Diagnóstico IA · {analizadas.length} foto(s)
                              </span>
                              <span className={`px-1.5 py-0.5 rounded border text-[9px] ${prioridadColor[prior]}`}>
                                {prioridadLabel[prior]}
                              </span>
                            </button>
                            {!colapsado && (
                              <div className="px-3 pb-3 grid sm:grid-cols-2 gap-3 text-[11px]">
                                <div>
                                  <p className="font-semibold text-slate-600 mb-1">Se aprecia en las imágenes</p>
                                  <ul className="space-y-1 text-slate-600 list-disc pl-4">
                                    {observaciones.map((o, idx) => (
                                      <li key={idx}>{o}</li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-600 mb-1">Sugerencias de puesta a punto</p>
                                  <ul className="space-y-1 text-slate-600 list-disc pl-4">
                                    {sugerencias.map((s, idx) => (
                                      <li key={idx}>{s}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Aviso legal del diagnóstico */}
          {fotosAnalizadas.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-500 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
              <span>
                El diagnóstico es una <b>ayuda orientativa generada por visión artificial</b>: describe
                indicios a partir de las fotografías y puede no reflejar la realidad. No constituye una
                valoración pericial ni detecta defectos ocultos; las intervenciones en instalaciones
                (luz, gas, fontanería) deben hacerlas profesionales cualificados.
                {hayMotorHeuristico && (
                  <> <b>Sin modelo de visión configurado, algunas fotos muestran solo una guía de revisión manual.</b></>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400">
            {fotos.length === 0
              ? 'Aún no hay fotografías.'
              : estado === 'FOTOS_ACTUALIZADAS'
              ? 'Inspección fotográfica completada.'
              : 'Puedes completar la inspección cuando hayas cubierto las estancias necesarias.'}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {fotos.length > 0 && (
              <>
                <button
                  onClick={() => handleAnalizar(false)}
                  disabled={guardando || !!progreso || !!progresoIa || fotosPendientesAnalisis.length === 0}
                  title={fotosPendientesAnalisis.length === 0 ? 'Todas las fotografías ya están analizadas' : `Analizar ${fotosPendientesAnalisis.length} fotografía(s) pendientes`}
                  className="px-3 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                >
                  {progresoIa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {fotosAnalizadas.length === 0
                    ? 'Diagnóstico IA'
                    : fotosPendientesAnalisis.length > 0
                    ? `Analizar pendientes (${fotosPendientesAnalisis.length})`
                    : 'Diagnóstico completo'}
                </button>
                {fotosAnalizadas.length > 0 && (
                  <button
                    onClick={() => handleAnalizar(true)}
                    disabled={guardando || !!progreso || !!progresoIa}
                    className="px-3 py-2 text-xs font-semibold text-violet-700 bg-white border border-violet-300 hover:bg-violet-50 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reanalizar
                  </button>
                )}
              </>
            )}
            {estado === 'FOTOS_ACTUALIZADAS' && puedeTransicionar('FOTOS_ACTUALIZADAS', 'REVISION_PENDIENTE') && (
              <button
                onClick={volverARevision}
                disabled={guardando || !!progreso || !!progresoIa}
                className="px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Volver a revisión
              </button>
            )}
            {estado === 'REVISION_PENDIENTE' && (
              <button
                onClick={marcarFotosActualizadas}
                disabled={guardando || !!progreso || !!progresoIa || fotos.length === 0}
                className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Fotos completadas
              </button>
            )}
            {estado === 'FOTOS_ACTUALIZADAS' && (
              <span className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
                <Check className="w-4 h-4" /> Listo para valoración (3.3-3.5)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Visor en grande con diagnóstico */}
      {fotoZoom && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/85 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={() => setFotoZoom(null)}
        >
          <button
            onClick={() => setFotoZoom(null)}
            className="absolute top-5 right-5 p-2 text-white/80 hover:text-white z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <div
            className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-4xl grid md:grid-cols-[1.4fr_1fr] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 flex items-center justify-center min-h-[240px]">
              <img
                src={fotoZoom.url}
                alt={ESTANCIA_LABEL[fotoZoom.estancia]}
                className="max-h-[50vh] md:max-h-[90vh] w-full object-contain"
              />
            </div>
            <div className="p-5 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-900">{ESTANCIA_LABEL[fotoZoom.estancia]}</h4>
                {fotoZoom.analisisIa && (
                  <span
                    className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                      prioridadColor[fotoZoom.analisisIa.prioridad || 'media']
                    }`}
                  >
                    {prioridadLabel[fotoZoom.analisisIa.prioridad || 'media']}
                  </span>
                )}
              </div>
              {fotoZoom.analisisIa ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <p className="font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-violet-600" /> Se aprecia en la imagen
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600">
                      {fotoZoom.analisisIa.observaciones.map((o, i) => (
                        <li key={i}>{o}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700 mb-1">Sugerencias de puesta a punto</p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-600">
                      {fotoZoom.analisisIa.sugerenciasMejora.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug border-t border-slate-100 pt-2">
                    Ayuda orientativa de IA (no es una valoración pericial; describe indicios, no
                    certezas).{fotoZoom.analisisIa.motor === 'heuristico' && ' Sin visión configurada: es una guía de revisión manual.'}
                  </p>
                </div>
              ) : (
                <div className="text-xs text-slate-400 space-y-2">
                  <p>Esta fotografía todavía no tiene diagnóstico IA.</p>
                  {esEditable && (
                    <button
                      type="button"
                      onClick={() => setFotoZoom(null)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white bg-violet-600 hover:bg-violet-700 rounded-lg font-semibold"
                    >
                      <Wand2 className="w-3.5 h-3.5" /> Cerrar y analizar
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
