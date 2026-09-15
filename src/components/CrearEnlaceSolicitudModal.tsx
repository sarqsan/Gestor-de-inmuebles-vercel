import React, { useState } from 'react';
import { Inmueble } from '../types';
import { X, Copy, Check, ExternalLink, Link as LinkIcon, Building2, Sparkles } from 'lucide-react';

interface CrearEnlaceSolicitudModalProps {
  inmueble: Inmueble;
  onClose: () => void;
  onOpenPortal: (inmueble: Inmueble) => void;
}

export const CrearEnlaceSolicitudModal: React.FC<CrearEnlaceSolicitudModalProps> = ({
  inmueble,
  onClose,
  onOpenPortal,
}) => {
  const [copied, setCopied] = useState(false);

  const publicToken = inmueble.tokenSolicitud || `sol-${inmueble.id}`;
  const publicOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = `${publicOrigin}/#solicitud/${publicToken}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
              <LinkIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Enlace Público de Solicitud</h3>
              <p className="text-xs text-slate-500 line-clamp-1">{inmueble.direccion}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            Comparte este enlace seguro con los interesados. No contiene datos personales en la URL y los llevará directamente al Portal de Candidatos para solicitar el alquiler.
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-700 truncate select-all">{publicUrl}</span>
            <button
              onClick={handleCopy}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '¡Copiado!' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-xs text-blue-900 space-y-2">
          <div className="flex items-center gap-1.5 font-bold">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
            <span>¿Qué verá el candidato?</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-blue-800 text-[11px]">
            <li>Paso 1: Información básica del inmueble ({inmueble.precio} €/mes)</li>
            <li>Paso 2: Formulario de datos personales y convivientes</li>
            <li>Paso 3: Declaración de situación económica y empleo</li>
            <li>Paso 4: Cuestionario de 12 situaciones en la vivienda</li>
            <li>Paso 5: Adjuntar documentación requerida</li>
          </ul>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => {
              onClose();
              onOpenPortal(inmueble);
            }}
            className="px-4 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-md"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Probador Portal Candidatos
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
