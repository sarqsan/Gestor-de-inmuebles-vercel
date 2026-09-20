import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Loader2,
  Plus,
  Copy,
  Check,
  FileText,
  Megaphone,
  Info,
  AlertCircle,
} from 'lucide-react';
import type { ExpedienteRecomercializacion, Inmueble, KitPublicacion } from '../../types';
import { DESTINO_INMUEBLE_LABEL } from '../../utils/recomercializacionEngine';
import { generarKitPublicacion } from '../../utils/kitPublicacionIa';

interface Props {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
  rentaAnterior?: number;
  onGuardar: (expediente: ExpedienteRecomercializacion) => Promise<void> | void;
  onClose: () => void;
}

const inputCls =
  'w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 outline-none';

const SeccionChips: React.FC<{
  titulo: string;
  ayuda: string;
  valores: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  color: string;
}> = ({ titulo, ayuda, valores, onAdd, onRemove, color }) => {
  const [texto, setTexto] = useState('');
  const agregar = () => {
    const v = texto.trim();
    if (!v) return;
    onAdd(v);
    setTexto('');
  };
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 mb-1">{titulo}</p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {valores.map((v, i) => (
          <span key={`${v}-${i}`} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${color}`}>
            {v}
            <button type="button" onClick={() => onRemove(i)} className="opacity-60 hover:opacity-100">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {valores.length === 0 && <span className="text-[10px] text-slate-400 italic">{ayuda}</span>}
      </div>
      <div className="flex gap-1.5">
        <input
          className={`${inputCls} flex-1`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregar())}
          placeholder="Añadir y pulsar +"
        />
        <button type="button" onClick={agregar} className="px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const KitPublicacionModal: React.FC<Props> = ({ expediente, inmueble, onGuardar, onClose }) => {
  const kitPrevio = expediente.comercializacion?.kitPublicacion;
  const [titulo, setTitulo] = useState(kitPrevio?.titulo || '');
  const [descripcion, setDescripcion] = useState(kitPrevio?.descripcion || '');
  const [puntosFuertes, setPuntosFuertes] = useState<string[]>(kitPrevio?.puntosFuertes ?? []);
  const [entorno, setEntorno] = useState<string[]>(kitPrevio?.entorno ?? []);
  const [extras, setExtras] = useState<string[]>(kitPrevio?.extras ?? []);
  const [motor, setMotor] = useState<'ia' | 'heuristico' | undefined>(kitPrevio?.motor);
  const [cargandoIa, setCargandoIa] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aviso, setAviso] = useState('');

  const construirKit = (fecha?: string): KitPublicacion => ({
    titulo: titulo.trim() || undefined,
    descripcion: descripcion.trim() || undefined,
    puntosFuertes: puntosFuertes.length ? puntosFuertes : undefined,
    entorno: entorno.length ? entorno : undefined,
    extras: extras.length ? extras : undefined,
    motor,
    fechaGeneracion: fecha || kitPrevio?.fechaGeneracion || new Date().toISOString(),
  });

  const construirExpediente = (parcial?: Partial<ExpedienteRecomercializacion>): ExpedienteRecomercializacion => ({
    ...expediente,
    comercializacion: {
      inmobiliariasContactadasIds: expediente.comercializacion?.inmobiliariasContactadasIds ?? [],
      ...expediente.comercializacion,
      kitPublicacion: construirKit(),
    },
    ...parcial,
    updatedAt: new Date().toISOString(),
  });

  const guardar = async (parcial?: Partial<ExpedienteRecomercializacion>) => {
    setGuardando(true);
    try {
      await onGuardar(construirExpediente(parcial));
    } finally {
      setGuardando(false);
    }
  };

  const handleGenerarIa = async () => {
    setAviso('');
    setCargandoIa(true);
    try {
      const kit = await generarKitPublicacion({
        expediente,
        inmueble,
        hechosAdicionales: [...extras, ...entorno],
      });
      setTitulo(kit.titulo || '');
      setDescripcion(kit.descripcion || '');
      setPuntosFuertes(kit.puntosFuertes ?? []);
      // Entorno/extras generados se añaden sólo si la IA trajo contenido nuevo.
      if ((kit.entorno ?? []).length) setEntorno(kit.entorno!);
      if ((kit.extras ?? []).length) setExtras(kit.extras!);
      setMotor(kit.motor);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : 'No se pudo generar el kit.');
    } finally {
      setCargandoIa(false);
    }
  };

  const textoAnuncio = [
    titulo,
    '',
    descripcion,
    '',
    puntosFuertes.length ? `Puntos fuertes:\n- ${puntosFuertes.join('\n- ')}` : '',
    entorno.length ? `Entorno:\n- ${entorno.join('\n- ')}` : '',
    extras.length ? `Equipamiento (a confirmar en visita):\n- ${extras.join('\n- ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoAnuncio);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setAviso('No se pudo copiar automáticamente; selecciona y copia el texto.');
    }
  };

  const enComercializacion = expediente.estado === 'EN_COMERCIALIZACION';
  const puedePublicar =
    expediente.estado === 'DECISION_ESTRATEGIA' || expediente.estado === 'EN_COMERCIALIZACION';

  const publicar = async () => {
    if (!titulo.trim() || !descripcion.trim()) {
      setAviso('Completa al menos el titular y la descripción antes de publicar.');
      return;
    }
    const ahora = new Date().toISOString();
    await guardar({
      estado: 'EN_COMERCIALIZACION',
      comercializacion: {
        inmobiliariasContactadasIds: expediente.comercializacion?.inmobiliariasContactadasIds ?? [],
        kitPublicacion: construirKit(ahora),
        fechaPublicacion: expediente.comercializacion?.fechaPublicacion || ahora,
        fechaInicioComercializacion: expediente.comercializacion?.fechaInicioComercializacion || ahora,
      },
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-700">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">Kit de publicación del anuncio</h3>
              <p className="text-xs text-slate-500">
                {inmueble?.direccion} · {DESTINO_INMUEBLE_LABEL[expediente.destinoPrevisto]}
                {motor ? ` · borrador ${motor === 'ia' ? 'de IA' : 'de plantilla'}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {aviso && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {aviso}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleGenerarIa}
              disabled={cargandoIa || guardando}
              className="px-3.5 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              {cargandoIa ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {kitPrevio ? 'Regenerar borrador con IA' : 'Generar borrador con IA'}
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">Titular del anuncio</label>
            <input className={inputCls} value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej. Piso reformado en el centro de Alicante · 3 hab. · 85 m²" />
            <p className="text-[9px] text-slate-400 mt-0.5 text-right">{titulo.length}/80</p>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">Descripción</label>
            <textarea className={`${inputCls} min-h-[150px] leading-relaxed`} value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="La IA redacta un borrador veraz y prudente; revísalo y ajústalo antes de publicar." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SeccionChips titulo="Puntos fuertes" ayuda="Sin puntos fuertes todavía"
              valores={puntosFuertes} color="bg-teal-50 text-teal-800 border border-teal-200"
              onAdd={(v) => setPuntosFuertes((p) => [...p, v])} onRemove={(i) => setPuntosFuertes((p) => p.filter((_, j) => j !== i))} />
            <SeccionChips titulo="Entorno (sólo si lo conoces)" ayuda="No inventes transporte o servicios"
              valores={entorno} color="bg-sky-50 text-sky-800 border border-sky-200"
              onAdd={(v) => setEntorno((p) => [...p, v])} onRemove={(i) => setEntorno((p) => p.filter((_, j) => j !== i))} />
            <SeccionChips titulo="Equipamiento / extras" ayuda="Ascensor, parking… sólo si existen"
              valores={extras} color="bg-indigo-50 text-indigo-800 border border-indigo-200"
              onAdd={(v) => setExtras((p) => [...p, v])} onRemove={(i) => setExtras((p) => p.filter((_, j) => j !== i))} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Vista previa (texto para portales)
              </p>
              <button type="button" onClick={copiar}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">
                {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copiado ? 'Copiado' : 'Copiar anuncio'}
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-[11px] text-slate-600 font-sans leading-relaxed max-h-44 overflow-y-auto">
              {textoAnuncio || 'Aún no hay contenido.'}
            </pre>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              El borrador se redacta únicamente con los datos del expediente y del inmueble; la IA no inventa
              ascensores, parkings, terrazas ni servicios del barrio. Verifica todos los hechos y la normativa
              municipal de publicidad antes de publicar en cada portal.
            </span>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button type="button" onClick={() => guardar()} disabled={guardando}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl disabled:opacity-50">
            Guardar borrador
          </button>
          <button type="button" onClick={publicar} disabled={guardando || !puedePublicar}
            title={!puedePublicar ? 'Primero toma la decisión de estrategia en el expediente' : undefined}
            className="px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl flex items-center gap-1.5 disabled:opacity-50">
            <Megaphone className="w-4 h-4" />
            {enComercializacion ? 'Actualizar y mantener publicado' : 'Publicar e iniciar comercialización'}
          </button>
        </div>
      </div>
    </div>
  );
};
