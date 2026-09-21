/** BLOQUE E — Hilo de mensajes con gestión (por contrato). */
import React, { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import {
  auditarAccionPortal,
  enviarMensajePortal,
  marcarMensajeLeidoPorInquilino,
} from '../../lib/suministrosFirestore';
import { validarMensajePortal } from '../../inquilino/portalEngine';
import type { ContratoFormalizacion, MensajePortal, UsuarioApp } from '../../types';

interface Props {
  usuario: UsuarioApp;
  contrato: ContratoFormalizacion;
  mensajes: MensajePortal[];
  onCambio: () => void;
}

export const PortalMensajes: React.FC<Props> = ({ usuario, contrato, mensajes, onCambio }) => {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  // Acuse de lectura al abrir el hilo
  useEffect(() => {
    const pendientes = mensajes.filter((m) => m.remitenteRol === 'GESTION' && m.leidoPorInquilino !== true);
    if (pendientes.length === 0) return;
    Promise.all(pendientes.map((m) => marcarMensajeLeidoPorInquilino(m.id).catch(() => undefined))).then(() => {
      onCambio();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mensajes.map((m) => m.id).join('|')]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes.length]);

  const enviar = async () => {
    const v = validarMensajePortal(texto);
    if (!v.ok) {
      setError(v.errores[0]);
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const nombre = `${usuario.nombre} ${usuario.apellidos || ''}`.trim();
      await enviarMensajePortal({
        contratoId: contrato.id,
        inmuebleId: contrato.inmuebleId,
        remitenteUid: usuario.authUid || usuario.id,
        remitenteNombre: nombre,
        remitenteRol: 'INQUILINO',
        texto,
      });
      await auditarAccionPortal({
        usuarioId: usuario.id,
        usuarioEmail: usuario.email,
        usuarioNombre: nombre,
        accion: 'INQUILINO_MENSAJE_ENVIADO',
        descripcion: `Mensaje a gestión desde el portal (${contrato.inmuebleDireccion}).`,
        entidadAfectada: 'mensaje',
        idAfectado: contrato.id,
      });
      setTexto('');
      await onCambio();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se ha podido enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ minHeight: '60vh' }}>
      <div className="flex-1 space-y-2 pb-2">
        {mensajes.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-8">
            Aún no hay mensajes. Escríbenos lo que necesites.
          </p>
        )}
        {mensajes.map((m) => {
          const mio = m.remitenteRol === 'INQUILINO';
          return (
            <div key={m.id} className={`flex ${mio ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                  mio
                    ? 'bg-indigo-700 text-white rounded-br-md'
                    : 'bg-white border border-slate-200 rounded-bl-md'
                }`}
              >
                {!mio && <p className="text-[11px] font-bold text-indigo-700 mb-0.5">{m.remitenteNombre}</p>}
                <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                <p className={`mt-1 text-[10px] text-right ${mio ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {new Date(m.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}{' '}
                  {new Date(m.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {error && <p className="mb-2 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</p>}

      <div className="sticky bottom-0 bg-slate-100 pt-2 pb-1">
        <div className="flex gap-2 items-end">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Escribe tu mensaje…"
            className="flex-1 px-3.5 py-2.5 text-sm border border-slate-200 rounded-2xl bg-white resize-none"
          />
          <button
            onClick={enviar}
            disabled={enviando || texto.trim().length === 0}
            className="w-11 h-11 shrink-0 bg-indigo-700 hover:bg-indigo-800 text-white rounded-full flex items-center justify-center cursor-pointer disabled:opacity-50"
            aria-label="Enviar mensaje"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
