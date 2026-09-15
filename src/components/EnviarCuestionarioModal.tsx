import React, { useState } from 'react';
import { Candidato, Inmueble } from '../types';
import {
  Send,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  X,
  Link,
  ShieldCheck,
  Smartphone,
  Building,
  User,
} from 'lucide-react';

interface EnviarCuestionarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidato: Candidato | null;
  inmueble?: Inmueble | null;
  onUpdateCandidateToken: (candidateId: string, newToken: string) => void;
  onOpenPublicView: (token: string) => void;
}

export const EnviarCuestionarioModal: React.FC<EnviarCuestionarioModalProps> = ({
  isOpen,
  onClose,
  candidato,
  inmueble,
  onUpdateCandidateToken,
  onOpenPublicView,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !candidato) return null;

  // Ensure candidate has a questionnaire token
  const token = candidato.cuestionarioToken || `q-${candidato.id}`;

  const publicOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = `${publicOrigin}/#cuestionario/${token}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegenerateToken = () => {
    const newToken = `q-${Math.random().toString(36).substring(2, 8)}${Date.now().toString(36).substring(4, 7)}`;
    onUpdateCandidateToken(candidato.id, newToken);
  };

  const nombreInmueble =
    inmueble?.direccion || candidato.inmuebleNombre || 'Vivienda de Alquiler';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden space-y-0">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500/20 border border-blue-400/30 rounded-2xl text-blue-300">
              <Send className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest block">
                PROCESO DE SOLICITUD REAL
              </span>
              <h2 className="text-xl font-black text-white">ENVIAR CUESTIONARIO</h2>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Information Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <User className="w-4 h-4 text-slate-400" />
                Candidato:
              </span>
              <strong className="text-slate-900 font-bold">{candidato.nombre}</strong>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/60">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Building className="w-4 h-4 text-slate-400" />
                Inmueble:
              </span>
              <strong className="text-slate-900 font-bold">{nombreInmueble}</strong>
            </div>
          </div>

          {/* URL Generator Box */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Link className="w-4 h-4 text-blue-600" />
              Enlace único y seguro para el candidato:
            </label>

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-100 border border-slate-300/80 rounded-xl px-3.5 py-2.5 text-xs font-mono font-semibold text-slate-800 truncate select-all">
                {publicUrl}
              </div>

              <button
                type="button"
                onClick={handleCopyLink}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shrink-0 shadow-xs ${
                  copied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Features Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-medium text-slate-600">
            <div className="p-3 bg-blue-50/80 border border-blue-100 rounded-xl flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong>100% Privado:</strong> La URL no contiene nombre ni datos personales.
              </span>
            </div>

            <div className="p-3 bg-indigo-50/80 border border-indigo-100 rounded-xl flex items-start gap-2.5">
              <Smartphone className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                <strong>Diseño móvil:</strong> Optimizado para rellenar desde smartphone.
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPublicView(token);
              }}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4 text-blue-400" />
              <span>Probar cuestionario público como interesado</span>
            </button>

            <button
              type="button"
              onClick={handleRegenerateToken}
              className="w-full py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
              <span>Generar nuevo enlace (invalidar anterior)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
