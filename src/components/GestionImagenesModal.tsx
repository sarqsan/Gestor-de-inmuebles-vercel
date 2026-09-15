import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Trash2,
  Star,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Camera,
  Info,
  Link as LinkIcon,
  Plus,
} from 'lucide-react';
import { Inmueble, InmuebleImage } from '../types';
import { compressImage, isValidImageFile } from '../utils/imageCompressor';
import {
  uploadInmuebleImageToStorage,
  deleteInmuebleImageFromStorage,
  saveInmuebleFirestore,
} from '../lib/firebase';
import { getInmuebleCoverUrl } from '../utils/imageUtils';

interface GestionImagenesModalProps {
  isOpen: boolean;
  onClose: () => void;
  inmueble: Inmueble;
  onSaveInmueble: (updatedInmueble: Inmueble) => void;
}

export const GestionImagenesModal: React.FC<GestionImagenesModalProps> = ({
  isOpen,
  onClose,
  inmueble,
  onSaveInmueble,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<InmuebleImage[]>(inmueble.images || []);

  React.useEffect(() => {
    setImages(inmueble.images || []);
  }, [inmueble.id, inmueble.images]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [imageToDelete, setImageToDelete] = useState<InmuebleImage | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Direct URL input state
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');

  if (!isOpen) return null;

  const currentCount = images.length;
  const maxLimit = 20;

  const handleAddImageUrl = () => {
    if (!urlInputValue.trim()) return;
    const url = urlInputValue.trim();

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setErrorMessage('Por favor introduce un enlace web válido (ej. https://...)');
      return;
    }

    const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isFirst = images.length === 0;

    const newImg: InmuebleImage = {
      id: imageId,
      storagePath: url,
      downloadURL: url,
      order: images.length,
      isCover: isFirst,
      isPublic: true,
      createdAt: new Date().toISOString(),
      nombreOriginal: 'Imagen por URL',
      tamañoBytes: 0,
    };

    const updated = [...images, newImg];
    setImages(updated);
    persistInmuebleImages(updated);
    setUrlInputValue('');
    setShowUrlInput(false);
    setSuccessMessage('¡Imagen por enlace añadida correctamente!');
  };

  const handleFilesSelected = async (filesList: FileList | File[]) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const filesArray = Array.from(filesList);
    if (filesArray.length === 0) return;

    // 1. Format validation check
    const invalidFiles = filesArray.filter((f) => !isValidImageFile(f));
    if (invalidFiles.length > 0) {
      setErrorMessage(
        `Formato no compatible en ${invalidFiles.length} archivo(s). Solo se permiten imágenes JPG, JPEG, PNG o WEBP.`
      );
      return;
    }

    // 2. Count limit check
    if (currentCount + filesArray.length > maxLimit) {
      const allowedCount = maxLimit - currentCount;
      if (allowedCount <= 0) {
        setErrorMessage(`Se ha alcanzado el límite máximo de ${maxLimit} imágenes por inmueble.`);
        return;
      }
      setErrorMessage(
        `Límite de 20 imágenes: solo se procesarán los primeros ${allowedCount} archivo(s).`
      );
      filesArray.splice(allowedCount);
    }

    setIsUploading(true);
    const newUploadedImages: InmuebleImage[] = [];

    try {
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        setUploadStatus(`Optimizando y subiendo ${i + 1} de ${filesArray.length}...`);

        try {
          // Fast client side compression (max 1200x900 @ 0.70 quality => ~35KB)
          const compressedBlob = await compressImage(file, {
            maxWidth: 1200,
            maxHeight: 900,
            quality: 0.70,
          });

          const imageId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          
          // Non-blocking upload (max 2s timeout per image)
          const { downloadURL, storagePath } = await uploadInmuebleImageToStorage(
            inmueble.id,
            imageId,
            compressedBlob,
            file.name
          );

          const isFirst = images.length === 0 && i === 0;
          const hasExistingCover = images.some((img) => img.isCover);

          const newImg: InmuebleImage = {
            id: imageId,
            storagePath,
            downloadURL,
            order: images.length + newUploadedImages.length,
            isCover: isFirst || (!hasExistingCover && newUploadedImages.length === 0),
            isPublic: true,
            createdAt: new Date().toISOString(),
            nombreOriginal: file.name,
            tamañoBytes: compressedBlob.size,
          };

          newUploadedImages.push(newImg);
        } catch (err: any) {
          console.error('Error uploading image:', err);
          setErrorMessage(`Error al procesar ${file.name}: ${err.message || 'Error desconocido'}`);
        }
      }

      if (newUploadedImages.length > 0) {
        const updatedList = [...images, ...newUploadedImages];
        setImages(updatedList);
        persistInmuebleImages(updatedList);
        setSuccessMessage(`¡${newUploadedImages.length} imagen(es) añadida(s) correctamente!`);
      }
    } catch (globalErr: any) {
      console.error('Global upload error:', globalErr);
      setErrorMessage('Ocurrió un error inesperado al procesar las imágenes.');
    } finally {
      setIsUploading(false);
      setUploadStatus('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSetCover = (imageId: string) => {
    const updated = images.map((img) => ({
      ...img,
      isCover: img.id === imageId,
    }));
    setImages(updated);
    persistInmuebleImages(updated);
  };

  const handleTogglePublic = (imageId: string) => {
    const updated = images.map((img) =>
      img.id === imageId ? { ...img, isPublic: !img.isPublic } : img
    );
    setImages(updated);
    persistInmuebleImages(updated);
  };

  const handleMoveImage = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const newList = [...images];
    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;

    // Recalculate order values
    const reordered = newList.map((img, i) => ({
      ...img,
      order: i,
    }));

    setImages(reordered);
    persistInmuebleImages(reordered);
  };

  const confirmDeleteImage = async () => {
    if (!imageToDelete) return;
    setIsDeleting(true);

    try {
      // 1. Delete from Firebase Storage
      await deleteInmuebleImageFromStorage(imageToDelete.storagePath);

      // 2. Remove from list
      const remaining = images.filter((img) => img.id !== imageToDelete.id);

      // 3. If deleted image was cover, reassign cover to first remaining image
      if (imageToDelete.isCover && remaining.length > 0) {
        remaining[0].isCover = true;
      }

      // Re-index order
      const reindexed = remaining.map((img, i) => ({
        ...img,
        order: i,
      }));

      setImages(reindexed);
      persistInmuebleImages(reindexed);
      setSuccessMessage('Imagen eliminada de la galería.');
    } catch (err: any) {
      console.error('Error deleting image:', err);
      setErrorMessage('No se pudo eliminar la imagen.');
    } finally {
      setIsDeleting(false);
      setImageToDelete(null);
    }
  };

  const persistInmuebleImages = (updatedImages: InmuebleImage[]) => {
    const updatedInmueble: Inmueble = {
      ...inmueble,
      images: updatedImages,
      imagenUrl: getInmuebleCoverUrl({ ...inmueble, images: updatedImages }),
    };

    onSaveInmueble(updatedInmueble);
    saveInmuebleFirestore(updatedInmueble);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 sm:p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/90 text-white flex items-center justify-center shadow-sm">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">Galería de Imágenes</h2>
              <p className="text-xs text-slate-300 mt-0.5">{inmueble.direccion} • {inmueble.ciudad}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold ${
                currentCount >= maxLimit
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {currentCount} de {maxLimit} imágenes
            </span>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
          {/* Messages */}
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-600 hover:text-rose-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{successMessage}</span>
              </div>
              <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Upload Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files) {
                handleFilesSelected(e.dataTransfer.files);
              }
            }}
            className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/70 scale-[1.01]'
                : currentCount >= maxLimit
                ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50/30'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              multiple
              disabled={isUploading || currentCount >= maxLimit}
              className="hidden"
            />

            <div className="max-w-md mx-auto space-y-3">
              {isUploading ? (
                <div className="space-y-3 py-2">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">{uploadStatus}</p>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs">
                    <Upload className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">
                      {currentCount >= maxLimit
                        ? 'Has alcanzado el máximo de 20 imágenes'
                        : 'Arrastra y suelta imágenes aquí o haz clic para examinar'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Soporta JPG, JPEG, PNG y WEBP. Compresión automática de alta calidad.
                    </p>
                  </div>
                  {currentCount < maxLimit && (
                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-2 cursor-pointer"
                      >
                        <ImageIcon className="w-4 h-4" />
                        <span>Seleccionar fotos del dispositivo</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowUrlInput(!showUrlInput)}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-all inline-flex items-center gap-2 cursor-pointer"
                      >
                        <LinkIcon className="w-4 h-4 text-blue-600" />
                        <span>{showUrlInput ? 'Ocultar enlace' : 'Añadir por enlace/URL'}</span>
                      </button>
                    </div>
                  )}

                  {showUrlInput && currentCount < maxLimit && (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row gap-2 max-w-md mx-auto text-left">
                      <input
                        type="url"
                        placeholder="https://ejemplo.com/foto.jpg"
                        value={urlInputValue}
                        onChange={(e) => setUrlInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddImageUrl()}
                        className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddImageUrl}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Añadir</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Image Grid */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <span>Imágenes de la propiedad</span>
                <span className="text-xs text-slate-500 font-normal">({images.length})</span>
              </h3>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                Haz clic en la estrella para cambiar la foto de portada.
              </p>
            </div>

            {images.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-8 text-center text-slate-500 text-xs">
                No hay imágenes subidas para este inmueble. Sube fotos para mostrarlas a los candidatos preseleccionados.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className={`bg-white rounded-2xl border transition-all overflow-hidden relative flex flex-col ${
                      img.isCover
                        ? 'border-amber-400 ring-2 ring-amber-400/30 shadow-md'
                        : 'border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    {/* Thumbnail Image Container */}
                    <div className="relative h-44 bg-slate-100 overflow-hidden group">
                      <img
                        src={img.downloadURL}
                        alt={`Foto ${idx + 1}`}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />

                      {/* Top Badges */}
                      <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 z-10">
                        {img.isCover ? (
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-400 text-slate-900 shadow-md flex items-center gap-1 border border-amber-300">
                            <Star className="w-3.5 h-3.5 fill-slate-900" />
                            <span>Portada</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSetCover(img.id)}
                            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-xs flex items-center gap-1 border border-white/20 transition-all"
                            title="Establecer como foto principal de portada"
                          >
                            <Star className="w-3.5 h-3.5 text-amber-300" />
                            <span>Marcar portada</span>
                          </button>
                        )}
                      </div>

                      {/* Top Right Order Badge */}
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-900/80 text-white backdrop-blur-xs border border-white/20">
                          #{idx + 1}
                        </span>
                      </div>
                    </div>

                    {/* Image Controls Bar */}
                    <div className="p-3 bg-slate-50 border-t border-slate-100 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="truncate max-w-[140px]" title={img.nombreOriginal || 'Foto'}>
                          {img.nombreOriginal || `Foto ${idx + 1}`}
                        </span>
                        <span>{img.isPublic ? 'Pública' : 'Privada'}</span>
                      </div>

                      <div className="flex items-center justify-between gap-1 pt-1">
                        {/* Visibility Toggle */}
                        <button
                          onClick={() => handleTogglePublic(img.id)}
                          className={`px-2 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 border transition-colors ${
                            img.isPublic
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-200 text-slate-600 border-slate-300 hover:bg-slate-300'
                          }`}
                          title={img.isPublic ? 'Visible para candidatos' : 'Oculto para candidatos'}
                        >
                          {img.isPublic ? (
                            <>
                              <Eye className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Pública</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                              <span>Oculta</span>
                            </>
                          )}
                        </button>

                        {/* Reorder Buttons */}
                        <div className="flex items-center gap-0.5 bg-white rounded-lg border border-slate-200 p-0.5">
                          <button
                            onClick={() => handleMoveImage(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600 transition-colors"
                            title="Mover antes"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveImage(idx, 'down')}
                            disabled={idx === images.length - 1}
                            className="p-1 text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-600 transition-colors"
                            title="Mover después"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Delete Button */}
                        <button
                          onClick={() => setImageToDelete(img)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg transition-colors"
                          title="Eliminar esta imagen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 sm:p-5 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500">
            Los cambios en la galería se guardan automáticamente en Firebase.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            Cerrar Galería
          </button>
        </div>
      </div>

      {/* DELETE CONFIRMATION DIALOG */}
      {imageToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">¿Quieres eliminar esta imagen?</h3>
              <p className="text-xs text-slate-500 mt-1">
                La foto se eliminará permanentemente de Firebase Storage y de la galería pública del inmueble.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setImageToDelete(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteImage}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                {isDeleting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Sí, eliminar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
