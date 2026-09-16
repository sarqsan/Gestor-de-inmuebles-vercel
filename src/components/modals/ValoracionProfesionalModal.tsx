import React, { useState } from 'react';
import {
  X,
  Star,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Wrench,
  ThumbsUp,
  ThumbsDown,
  Building2,
  MessageSquare,
} from 'lucide-react';
import {
  TrabajoProfesional,
  ValoracionProfesionalTrabajo,
  Profesional,
  UsuarioApp,
} from '../../types';
import {
  saveValoracionProfesionalFirestore,
  saveTrabajoProfesionalFirestore,
  saveProfesionalFirestore,
} from '../../lib/firebase';

interface ValoracionProfesionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  trabajo: TrabajoProfesional;
  profesional?: Profesional;
  currentUser?: UsuarioApp;
  onSuccess?: (valoracion: ValoracionProfesionalTrabajo) => void;
}

export const ValoracionProfesionalModal: React.FC<ValoracionProfesionalModalProps> = ({
  isOpen,
  onClose,
  trabajo,
  profesional,
  currentUser,
  onSuccess,
}) => {
  const [puntuacion, setPuntuacion] = useState<number>(5);
  const [calidad, setCalidad] = useState<number>(5);
  const [puntualidad, setPuntualidad] = useState<number>(5);
  const [precio, setPrecio] = useState<number>(5);
  const [comunicacion, setComunicacion] = useState<number>(5);
  const [resultado, setResultado] = useState<'SATISFACTORIO' | 'ACEPTABLE' | 'DEFICIENTE'>('SATISFACTORIO');
  const [comentario, setComentario] = useState<string>('');
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const renderStarSelector = (value: number, onChange: (val: number) => void) => {
    return (
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-1 text-slate-300 hover:text-amber-400 focus:outline-hidden transition-colors"
          >
            <Star
              className={`w-5 h-5 ${
                star <= value ? 'text-amber-500 fill-amber-500' : 'text-slate-200'
              }`}
            />
          </button>
        ))}
        <span className="text-xs font-bold text-slate-700 ml-2">{value}/5</span>
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!trabajo.profesionalId) {
      setErrorMsg('No hay un profesional asociado a este trabajo para valorar.');
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg('');

      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Propietario / Gestor';

      const valoracionId = `val_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // La valoración hereda el ámbito del trabajo valorado (aislamiento por
      // propietario en Firestore).
      const propietarioIdValoracion =
        trabajo.propietarioId ||
        (currentUser?.tipoPerfil === 'PROPIETARIO' ? currentUser.propietarioId : '') ||
        '';
      if (!propietarioIdValoracion) {
        setErrorMsg('No se pudo determinar el propietario del trabajo valorado.');
        setGuardando(false);
        return;
      }

      const valoracion: ValoracionProfesionalTrabajo = {
        id: valoracionId,
        propietarioId: propietarioIdValoracion,
        trabajoId: trabajo.id,
        profesionalId: trabajo.profesionalId,
        inmuebleId: trabajo.inmuebleId,
        inmuebleDireccion: trabajo.inmuebleDireccion,
        puntuacion,
        calidad,
        puntualidad,
        precio,
        comunicacion,
        resultado,
        comentario: comentario.trim() || undefined,
        fecha: new Date().toISOString(),
        usuarioId: currentUser?.id || 'usuario',
        usuarioNombre,
      };

      // 1. Save evaluation in Firestore
      await saveValoracionProfesionalFirestore(valoracion);

      // 2. Attach evaluation onto work order
      const trabajoActualizado: TrabajoProfesional = {
        ...trabajo,
        valoracion,
        updatedAt: new Date().toISOString(),
      };
      await saveTrabajoProfesionalFirestore(trabajoActualizado);

      // 3. Update professional's average score if professional object exists
      if (profesional) {
        const totalVals = (profesional.totalValoraciones || 0) + 1;
        const currentSum = (profesional.valoracionMedia || 5) * (profesional.totalValoraciones || 0);
        const nuevaMedia = Math.round(((currentSum + puntuacion) / totalVals) * 10) / 10;

        const profActualizado: Profesional = {
          ...profesional,
          valoracionMedia: nuevaMedia,
          totalValoraciones: totalVals,
          updatedAt: new Date().toISOString(),
        };
        await saveProfesionalFirestore(profActualizado);
      }

      if (onSuccess) onSuccess(valoracion);
      onClose();
    } catch (err: any) {
      console.error('Error saving valoracion:', err);
      setErrorMsg(err?.message || 'Error al registrar la valoración.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      id="valoracion-profesional-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg my-8 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
              <Star className="w-5 h-5 fill-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Valoración del Trabajo Realizado</h3>
              <p className="text-xs text-slate-500">
                {trabajo.profesionalNombre || profesional?.nombreComercial || 'Profesional'} • {trabajo.titulo}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Overall Rating */}
          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl text-center space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Puntuación General
            </label>
            <div className="flex items-center justify-center space-x-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPuntuacion(s)}
                  className="p-1 focus:outline-hidden hover:scale-110 transition-transform"
                >
                  <Star
                    className={`w-8 h-8 ${
                      s <= puntuacion ? 'text-amber-500 fill-amber-500' : 'text-slate-200'
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="text-sm font-bold text-slate-800 block">{puntuacion} de 5 estrellas</span>
          </div>

          {/* Breakdown Criteria */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Calidad de la ejecución técnica:</span>
              {renderStarSelector(calidad, setCalidad)}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Puntualidad y cumplimiento de plazos:</span>
              {renderStarSelector(puntualidad, setPuntualidad)}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Relación calidad / precio:</span>
              {renderStarSelector(precio, setPrecio)}
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Comunicación y trato profesional:</span>
              {renderStarSelector(comunicacion, setComunicacion)}
            </div>
          </div>

          {/* Result Buttons */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Resultado de la Intervención</label>
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setResultado('SATISFACTORIO')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  resultado === 'SATISFACTORIO'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-400'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Satisfactorio
              </button>
              <button
                type="button"
                onClick={() => setResultado('ACEPTABLE')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  resultado === 'ACEPTABLE'
                    ? 'bg-amber-50 text-amber-800 border-amber-300 ring-2 ring-amber-400'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Aceptable
              </button>
              <button
                type="button"
                onClick={() => setResultado('DEFICIENTE')}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  resultado === 'DEFICIENTE'
                    ? 'bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-400'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                Deficiente
              </button>
            </div>
          </div>

          {/* Comment */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Observaciones y Comentarios de la Intervención
            </label>
            <textarea
              rows={3}
              placeholder="Indica qué tal fue el trabajo, limpieza, profesionalidad o si volverías a contratarle..."
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {guardando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Valoración</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
