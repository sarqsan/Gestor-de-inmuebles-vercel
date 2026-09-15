import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Building2,
  Camera,
  Star,
} from 'lucide-react';
import { Inmueble } from '../types';
import { getInmueblePublicImages } from '../utils/imageUtils';

interface PublicPropertyGalleryProps {
  inmueble?: Inmueble | null;
  className?: string;
}

export const PublicPropertyGallery: React.FC<PublicPropertyGalleryProps> = ({
  inmueble,
  className = '',
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const images = getInmueblePublicImages(inmueble);
  const currentImage = images[selectedIndex] || images[0];

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  if (!inmueble) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Main Image Stage */}
      <div
        onClick={() => setIsFullscreen(true)}
        className="relative h-64 sm:h-80 md:h-96 w-full bg-slate-900 rounded-3xl overflow-hidden cursor-pointer group shadow-sm border border-slate-200/80"
      >
        {currentImage?.downloadURL ? (
          <img
            src={currentImage.downloadURL}
            alt={inmueble.direccion}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-500">
            <Building2 className="w-16 h-16" />
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-black/20 pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-900/80 text-white backdrop-blur-xs border border-white/20 flex items-center gap-1.5 shadow-md">
              <Camera className="w-3.5 h-3.5 text-blue-400" />
              <span>
                {selectedIndex + 1} / {images.length}
              </span>
            </span>

            {currentImage?.isCover && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-400 text-slate-900 shadow-md flex items-center gap-1 border border-amber-300">
                <Star className="w-3.5 h-3.5 fill-slate-900" />
                <span>Foto Principal</span>
              </span>
            )}
          </div>

          <button
            type="button"
            className="p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-xl backdrop-blur-xs border border-white/20 shadow-md transition-all pointer-events-auto"
            title="Ampliar imagen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Prev / Next Controls on Hover or Touch */}
        {images.length > 1 && (
          <>
            <button
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2.5 bg-slate-900/75 hover:bg-slate-900 text-white rounded-full backdrop-blur-xs border border-white/20 shadow-lg transition-all opacity-90 sm:opacity-0 group-hover:opacity-100"
              title="Imagen anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2.5 bg-slate-900/75 hover:bg-slate-900 text-white rounded-full backdrop-blur-xs border border-white/20 shadow-lg transition-all opacity-90 sm:opacity-0 group-hover:opacity-100"
              title="Imagen siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Bottom Title Bar */}
        <div className="absolute bottom-3 left-3 right-3 z-10 text-white pointer-events-none">
          <p className="text-xs font-semibold text-slate-200 drop-shadow-sm truncate">
            {inmueble.direccion} • {inmueble.ciudad}
          </p>
        </div>
      </div>

      {/* Thumbnails Row */}
      {images.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-300">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setSelectedIndex(idx)}
              className={`relative h-16 w-20 rounded-2xl overflow-hidden shrink-0 transition-all border-2 ${
                idx === selectedIndex
                  ? 'border-blue-600 ring-2 ring-blue-600/30 shadow-md scale-102'
                  : 'border-slate-200 opacity-70 hover:opacity-100'
              }`}
            >
              <img
                src={img.downloadURL}
                alt={`Miniatura ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              {img.isCover && (
                <div className="absolute bottom-1 right-1 bg-amber-400 p-0.5 rounded-full shadow-xs">
                  <Star className="w-2.5 h-2.5 fill-slate-900 text-slate-900" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-60 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-200">
          {/* Top Bar */}
          <div className="w-full max-w-5xl flex items-center justify-between text-white z-10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300">
                Fotografía {selectedIndex + 1} de {images.length}
              </span>
              <span className="text-xs text-slate-500">• {inmueble.direccion}</span>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-2xl border border-slate-700 shadow-md transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Fullscreen Image Container */}
          <div className="relative flex-1 w-full max-w-5xl flex items-center justify-center my-4 overflow-hidden">
            <img
              src={currentImage.downloadURL}
              alt={inmueble.direccion}
              className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl"
            />

            {images.length > 1 && (
              <>
                <button
                  onClick={handlePrev}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-3 bg-slate-900/80 hover:bg-slate-900 text-white rounded-full border border-slate-700 shadow-2xl transition-all"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <button
                  onClick={handleNext}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-3 bg-slate-900/80 hover:bg-slate-900 text-white rounded-full border border-slate-700 shadow-2xl transition-all"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </>
            )}
          </div>

          {/* Fullscreen Bottom Strip */}
          {images.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto max-w-3xl w-full justify-center py-2">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedIndex(idx)}
                  className={`h-12 w-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                    idx === selectedIndex
                      ? 'border-blue-500 ring-2 ring-blue-500/40 opacity-100 scale-105'
                      : 'border-slate-800 opacity-50 hover:opacity-100'
                  }`}
                >
                  <img src={img.downloadURL} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
