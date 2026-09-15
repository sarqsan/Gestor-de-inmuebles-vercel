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
} from 'lucide-react';
import type {
  EstanciaFoto,
  ExpedienteRecomercializacion,
  FotoInspeccion,
  Inmueble,
} from '../../types';
import {
  agregarFotoInspeccion,
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const estado = expediente.estado;
  const esEditable = estado === 'REVISION_PENDIENTE' || estado === 'FOTOS_ACTUALIZADAS';

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
              buena luz y encuadrando lo relevante). El <b>diagnóstico asistido por IA</b> sobre estas
              imágenes llegará en la siguiente fase; aquí solo se catalogan y almacenan de forma segura.
            </span>
          </div>

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
                        disabled={!!progreso || guardando}
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
                        disabled={!esEditable || !!progreso || guardando}
                        className="w-full py-6 border-2 border-dashed border-slate-200 rounded-lg text-[11px] text-slate-400 hover:border-sky-300 hover:text-sky-600 transition disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:text-slate-400"
                      >
                        Sin fotografías de {ESTANCIA_LABEL[estancia].toLowerCase()}
                      </button>
                    ) : (
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
                              <span className="absolute top-1 left-1 px-1 py-0.5 rounded bg-violet-600/90 text-white text-[8px] font-bold flex items-center gap-0.5">
                                <Sparkles className="w-2.5 h-2.5" /> IA
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
          <div className="flex items-center gap-2">
            {estado === 'FOTOS_ACTUALIZADAS' && puedeTransicionar('FOTOS_ACTUALIZADAS', 'REVISION_PENDIENTE') && (
              <button
                onClick={volverARevision}
                disabled={guardando || !!progreso}
                className="px-3 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Volver a revisión
              </button>
            )}
            {estado === 'REVISION_PENDIENTE' && (
              <button
                onClick={marcarFotosActualizadas}
                disabled={guardando || !!progreso || fotos.length === 0}
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

      {/* Visor en grande */}
      {fotoZoom && (
        <div
          className="fixed inset-0 z-[60] bg-slate-900/85 flex items-center justify-center p-6"
          onClick={() => setFotoZoom(null)}
        >
          <button className="absolute top-5 right-5 p-2 text-white/80 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-4xl max-h-full">
            <img src={fotoZoom.url} alt={ESTANCIA_LABEL[fotoZoom.estancia]} className="max-h-[85vh] w-auto rounded-xl shadow-2xl" />
            <p className="text-center text-white/80 text-xs mt-3">{ESTANCIA_LABEL[fotoZoom.estancia]}</p>
          </div>
        </div>
      )}
    </div>
  );
};
