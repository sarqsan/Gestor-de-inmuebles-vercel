import React from 'react';
import { MessageSquare, CheckCircle, X, ExternalLink, Calendar, Info } from 'lucide-react';
import { InvitacionVisita } from '../types';

interface ConfirmWhatsappSentModalProps {
  invitacion: InvitacionVisita | null;
  whatsappUrl?: string;
  onConfirmSent: (invitacionId: string) => void;
  onClose: () => void;
}

export const ConfirmWhatsappSentModal: React.FC<ConfirmWhatsappSentModalProps> = ({
  invitacion,
  whatsappUrl,
  onConfirmSent,
  onClose,
}) => {
  if (!invitacion) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-md w-full p-6 relative overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badge */}
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 shadow-xs">
          <MessageSquare className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-slate-900 mb-1">
          ¿Has enviado la invitación por WhatsApp?
        </h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Has abierto la conversación con <strong className="text-slate-800">{invitacion.candidateNombre}</strong> para la propiedad <strong className="text-slate-800">{invitacion.inmuebleNombre}</strong>.
        </p>

        {/* Status explanation notice */}
        <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl p-3 text-xs text-amber-900 mb-5 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-0.5">Control de seguimiento</p>
            <p className="text-[11px] text-amber-800/90 leading-tight">
              Solo debes pulsar <strong>"Marcar como enviado"</strong> si has enviado efectivamente el mensaje en WhatsApp. Esto cambiará el estado a <span className="font-semibold text-blue-700">ENVIADO</span> para registrar la fecha y hora de envío.
            </p>
          </div>
        </div>

        {whatsappUrl && (
          <div className="mb-5">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Volver a abrir WhatsApp</span>
            </a>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
          >
            Cancelar (Aún no enviado)
          </button>
          <button
            onClick={() => {
              onConfirmSent(invitacion.id);
              onClose();
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Sí, marcar como ENVIADO</span>
          </button>
        </div>
      </div>
    </div>
  );
};
