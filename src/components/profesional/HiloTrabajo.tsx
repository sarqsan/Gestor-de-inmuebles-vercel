/**
 * P1 · Hilo de comunicación propietario ↔ profesional de UNA orden de trabajo.
 *
 * Es un componente y no dos: el mismo hilo lo ven el propietario y el
 * profesional asignado, y solo cambia quién escribe. Aísla la presentación del
 * transporte (`mensajesTrabajoFirestore`), de modo que se puede probar sin
 * Firebase y no arrastra al resto de modales.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';

import {
  enviarMensajeTrabajo,
  marcarMensajeTrabajoLeido,
  subscribeMensajesTrabajo,
} from '../../lib/mensajesTrabajoFirestore';
import type { TrabajoProfesional } from '../../types';
import type {
  MensajeTrabajo,
  RolRemitenteMensajeTrabajo,
} from '../../features/profesional/tiposMensajeTrabajo';

export interface HiloTrabajoProps {
  trabajo: TrabajoProfesional;
  /** Rol de quien está mirando el hilo: decide con qué firma escribe. */
  rol: RolRemitenteMensajeTrabajo;
  /** UID del usuario autenticado (se sella en `remitenteUid`). */
  remitenteUid: string;
  /** Nombre visible del autor. */
  remitenteNombre: string;
  className?: string;
}

const formatearFecha = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const HiloTrabajo: React.FC<HiloTrabajoProps> = ({
  trabajo,
  rol,
  remitenteUid,
  remitenteNombre,
  className = '',
}) => {
  const [mensajes, setMensajes] = useState<MensajeTrabajo[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finDelHilo = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!trabajo?.id) return;
    let vivo = true;
    setMensajes([]);
    // El hilo se acota SIEMPRE al trabajo: no hay consulta global.
    const unsub = subscribeMensajesTrabajo(trabajo.id, (items) => {
      if (vivo) setMensajes(items);
    });
    return () => {
      vivo = false;
      unsub();
    };
  }, [trabajo?.id]);

  // Acuse de lectura de lo que ha llegado del otro participante.
  const pendientesDeLeer = useMemo(
    () =>
      mensajes.filter((m) =>
        rol === 'PROPIETARIO'
          ? m.remitenteRol === 'PROFESIONAL' && !m.leidoPorPropietario
          : m.remitenteRol === 'PROPIETARIO' && !m.leidoPorProfesional,
      ),
    [mensajes, rol],
  );

  useEffect(() => {
    if (!pendientesDeLeer.length) return;
    pendientesDeLeer.forEach((m) => {
      void marcarMensajeTrabajoLeido(m.id, rol);
    });
    // Solo cuando cambia el conjunto de no leídos.
  }, [pendientesDeLeer, rol]);

  useEffect(() => {
    finDelHilo.current?.scrollIntoView?.({ block: 'nearest' });
  }, [mensajes.length]);

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await enviarMensajeTrabajo({
        trabajoId: trabajo.id,
        propietarioId: trabajo.propietarioId,
        profesionalId: trabajo.profesionalId,
        remitenteUid,
        remitenteNombre,
        remitenteRol: rol,
        texto: limpio,
      });
      setTexto('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido enviar el mensaje.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-slate-500" />
        <h4 className="text-sm font-bold text-slate-800">Comunicación del trabajo</h4>
        <span className="text-[11px] font-semibold text-slate-500">
          {rol === 'PROPIETARIO' ? 'Con el profesional asignado' : 'Con el propietario'}
        </span>
      </div>

      <div
        className="max-h-64 overflow-y-auto flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3"
        role="log"
        aria-label="Historial de mensajes del trabajo"
      >
        {mensajes.length === 0 ? (
          <p className="text-xs text-slate-500 italic">
            Todavía no hay mensajes. Todo lo que se escriba aquí queda vinculado a esta orden de trabajo.
          </p>
        ) : (
          mensajes.map((m) => {
            const propio = m.remitenteRol === rol;
            return (
              <div key={m.id} className={`flex flex-col ${propio ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-line ${
                    propio
                      ? 'bg-amber-100 text-slate-900 border border-amber-200'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  {m.texto}
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  {m.remitenteNombre || (m.remitenteRol === 'PROPIETARIO' ? 'Propietario' : 'Profesional')}
                  {' · '}
                  {formatearFecha(m.createdAt)}
                </span>
              </div>
            );
          })
        )}
        <div ref={finDelHilo} />
      </div>

      {error && (
        <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Escribe un mensaje sobre este trabajo…"
          aria-label="Nuevo mensaje del trabajo"
          className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
        />
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{enviando ? 'Enviando…' : 'Enviar'}</span>
        </button>
      </div>
    </div>
  );
};

export default HiloTrabajo;
