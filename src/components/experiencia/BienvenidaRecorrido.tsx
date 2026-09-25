/**
 * UX-1B · Tarjeta de bienvenida. No navega y no inicia el tutorial por su cuenta.
 */
import React from 'react';
import { Sparkles } from 'lucide-react';
import type { UsuarioApp } from '../../types';
import type { HostExperiencia, ServicioProgresoTutoriales, Tutorial } from '../../experiencia';
import { textoBienvenida, type ModoBienvenida } from '../../experiencia';
import { useBienvenidaRecorrido } from './useBienvenidaRecorrido';

interface Props {
  tutorial: Tutorial;
  modo: ModoBienvenida;
  onAccion: () => void;
  onAhoraNo: () => void;
}

export const BienvenidaRecorrido: React.FC<Props> = ({ tutorial, modo, onAccion, onAhoraNo }) => {
  const texto = textoBienvenida(tutorial, modo);
  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center p-4 bg-slate-900/35">
      <section
        role="dialog"
        aria-modal="false"
        aria-label={texto.titulo}
        className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 space-y-3"
      >
        <p className="text-[10px] uppercase tracking-wider font-bold text-indigo-700 flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> {modo === 'CONTINUAR' ? 'Recorrido pendiente' : 'Primera visita'}
        </p>
        <h2 className="text-base font-extrabold text-slate-900">{texto.titulo}</h2>
        <p className="text-sm text-slate-600 leading-relaxed">{texto.cuerpo}</p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onAhoraNo}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Ahora no
          </button>
          <button
            type="button"
            onClick={onAccion}
            className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer"
          >
            {texto.accion}
          </button>
        </div>
      </section>
    </div>
  );
};

/** Se monta solo con sesión iniciada. No cambia la sección de aterrizaje. */
export const BienvenidaHost: React.FC<{
  usuario: Pick<UsuarioApp, 'id' | 'tipoPerfil' | 'roles' | 'permisos'>;
  host?: HostExperiencia;
  servicio: ServicioProgresoTutoriales;
  reproductorAbierto: boolean;
  habilitada?: boolean;
  onIniciar: (tutorialId: string) => void;
}> = (props) => {
  const { tutorial, modo, empezar, ahoraNo } = useBienvenidaRecorrido(props);
  if (!modo || !tutorial) return null;
  return <BienvenidaRecorrido tutorial={tutorial} modo={modo} onAccion={empezar} onAhoraNo={ahoraNo} />;
};
