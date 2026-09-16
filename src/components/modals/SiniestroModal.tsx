import React, { useState, useEffect } from 'react';
import {
  Siniestro,
  Incidencia,
  PolizaSeguro,
  EstadoSiniestro,
  ComunicacionSiniestro,
  UsuarioApp,
} from '../../types';
import {
  X,
  FileCheck,
  Building2,
  Phone,
  Euro,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  MessageSquare,
  Shield,
} from 'lucide-react';

interface SiniestroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (siniestro: Siniestro) => Promise<void>;
  incidencia: Incidencia;
  polizas: PolizaSeguro[];
  currentUser?: UsuarioApp;
  siniestroToEdit?: Siniestro | null;
}

export const ESTADOS_SINIESTRO_LABELS: Record<EstadoSiniestro, { label: string; badgeClass: string }> = {
  PENDIENTE_COMUNICAR: { label: 'Pendiente de Comunicar', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  COMUNICADO: { label: 'Parte Comunicado / Abierto', badgeClass: 'bg-sky-100 text-sky-800 border-sky-300' },
  EN_ESTUDIO: { label: 'En Estudio / Visita Pericial', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  PENDIENTE_DOCUMENTACION: { label: 'Pendiente de Facturas / Fotos', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  ACEPTADO: { label: 'Aceptado por la Aseguradora', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  RECHAZADO: { label: 'Rechazado / Sin Cobertura', badgeClass: 'bg-rose-100 text-rose-800 border-rose-300' },
  INDEMNIZADO: { label: 'Indemnizado / Liquidado', badgeClass: 'bg-teal-100 text-teal-800 border-teal-300' },
  CERRADO: { label: 'Expediente Cerrado', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' },
};

export const SiniestroModal: React.FC<SiniestroModalProps> = ({
  isOpen,
  onClose,
  onSave,
  incidencia,
  polizas,
  currentUser,
  siniestroToEdit,
}) => {
  const [polizaId, setPolizaId] = useState<string>('');
  const [aseguradora, setAseguradora] = useState<string>('');
  const [numeroExpediente, setNumeroExpediente] = useState<string>('');
  const [numeroSiniestro, setNumeroSiniestro] = useState<string>('');
  const [fechaComunicacion, setFechaComunicacion] = useState<string>('');
  const [estado, setEstado] = useState<EstadoSiniestro>('COMUNICADO');
  const [indemnizacion, setIndemnizacion] = useState<string>('');
  const [franquicia, setFranquicia] = useState<string>('0');
  const [resolucion, setResolucion] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  // Comunicaciones
  const [comunicaciones, setComunicaciones] = useState<ComunicacionSiniestro[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState<string>('');
  const [nuevoRemitente, setNuevoRemitente] = useState<string>('Perito');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Filtrar pólizas válidas para esta vivienda
  const polizasDisponibles = polizas.filter(
    (p) => !p.inmuebleId || p.inmuebleId === incidencia.inmuebleId || p.propietarioId === incidencia.propietarioId
  );

  useEffect(() => {
    if (isOpen) {
      if (siniestroToEdit) {
        setPolizaId(siniestroToEdit.polizaId || '');
        setAseguradora(siniestroToEdit.aseguradora || '');
        setNumeroExpediente(siniestroToEdit.numeroExpediente || '');
        setNumeroSiniestro(siniestroToEdit.numeroSiniestro || '');
        setFechaComunicacion(siniestroToEdit.fechaComunicacion || '');
        setEstado(siniestroToEdit.estado || 'COMUNICADO');
        setIndemnizacion(siniestroToEdit.indemnizacion?.toString() || '');
        setFranquicia(siniestroToEdit.franquicia?.toString() || '0');
        setResolucion(siniestroToEdit.resolucion || '');
        setObservaciones(siniestroToEdit.observaciones || '');
        setComunicaciones(siniestroToEdit.comunicaciones || []);
      } else {
        const initialPol = polizasDisponibles.length > 0 ? polizasDisponibles[0] : null;
        setPolizaId(initialPol ? initialPol.id : '');
        setAseguradora(initialPol ? initialPol.aseguradora : '');
        setNumeroExpediente('');
        setNumeroSiniestro('');
        setFechaComunicacion(new Date().toISOString().split('T')[0]);
        setEstado('COMUNICADO');
        setIndemnizacion('');
        setFranquicia(initialPol?.franquicia ? initialPol.franquicia.toString() : '0');
        setResolucion('');
        setObservaciones('');
        setComunicaciones([]);
      }
      setNuevoMensaje('');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, siniestroToEdit, polizasDisponibles]);

  if (!isOpen) return null;

  const handlePolizaChange = (newPolId: string) => {
    setPolizaId(newPolId);
    const pol = polizas.find((p) => p.id === newPolId);
    if (pol) {
      setAseguradora(pol.aseguradora);
      if (pol.franquicia !== undefined) {
        setFranquicia(pol.franquicia.toString());
      }
    }
  };

  const handleAddComunicacion = () => {
    if (!nuevoMensaje.trim()) return;
    const item: ComunicacionSiniestro = {
      id: `com_${Date.now()}`,
      fecha: new Date().toISOString(),
      remitente: nuevoRemitente.trim() || 'Gestor',
      mensaje: nuevoMensaje.trim(),
      canal: 'telefono',
    };
    setComunicaciones((prev) => [item, ...prev]);
    setNuevoMensaje('');
  };

  const handleRemoveComunicacion = (id: string) => {
    setComunicaciones((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!polizaId) {
      setErrorMsg('Debe vincular una póliza de seguro.');
      return;
    }
    if (!aseguradora.trim()) {
      setErrorMsg('Indique la aseguradora responsable del trámite.');
      return;
    }
    if (!fechaComunicacion) {
      setErrorMsg('Indique la fecha en la que se dio parte del siniestro.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const now = new Date().toISOString();
      const siniestroData: Siniestro = {
        id: siniestroToEdit ? siniestroToEdit.id : `sin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        incidenciaId: incidencia.id,
        polizaId,
        aseguradora: aseguradora.trim(),
        numeroExpediente: numeroExpediente.trim() || undefined,
        numeroSiniestro: numeroSiniestro.trim() || undefined,
        fechaComunicacion,
        estado,
        indemnizacion: indemnizacion ? parseFloat(indemnizacion) : undefined,
        franquicia: franquicia ? parseFloat(franquicia) : undefined,
        resolucion: resolucion.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        comunicaciones,
        createdAt: siniestroToEdit ? siniestroToEdit.createdAt : now,
        updatedAt: now,
      };

      await onSave(siniestroData);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar siniestro:', err);
      setErrorMsg(err?.message || 'Error al guardar el siniestro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {siniestroToEdit ? 'Seguimiento de Siniestro' : 'Apertura de Siniestro con Aseguradora'}
              </h2>
              <p className="text-xs text-slate-300">
                Gestión pericial, número de expediente, dictamen y liquidación
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resumen de la Incidencia de Origen */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 text-xs text-slate-700 flex items-start justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">
              Incidencia Vinculada
            </span>
            <p className="font-semibold text-slate-900 text-sm">{incidencia.titulo}</p>
            <p className="text-slate-500">{incidencia.inmuebleDireccion} • {incidencia.categoria}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[11px] text-slate-400 block">Reportada:</span>
            <span className="font-medium text-slate-700">
              {new Date(incidencia.fechaCreacion).toLocaleDateString('es-ES')}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Selección de Póliza */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Póliza de Seguro *
              </label>
              <div className="relative">
                <select
                  value={polizaId}
                  onChange={(e) => handlePolizaChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all"
                  required
                >
                  <option value="" disabled>Seleccione la póliza</option>
                  {polizasDisponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.aseguradora} ({p.numeroPoliza}) - {p.tipo}
                    </option>
                  ))}
                </select>
                <Shield className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Compañía Aseguradora *
              </label>
              <input
                type="text"
                value={aseguradora}
                onChange={(e) => setAseguradora(e.target.value)}
                placeholder="Ej: Mapfre, Caser..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                required
              />
            </div>
          </div>

          {/* Expediente y Fecha */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Nº Expediente / Siniestro
              </label>
              <input
                type="text"
                value={numeroExpediente}
                onChange={(e) => setNumeroExpediente(e.target.value)}
                placeholder="Ej: SIN-2025/94821"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Fecha del Parte *
              </label>
              <input
                type="date"
                value={fechaComunicacion}
                onChange={(e) => setFechaComunicacion(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Estado del Siniestro *
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoSiniestro)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
              >
                {Object.entries(ESTADOS_SINIESTRO_LABELS).map(([estKey, val]) => (
                  <option key={estKey} value={estKey}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Liquidación Económica */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Franquicia a Cargo (€)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={franquicia}
                  onChange={(e) => setFranquicia(e.target.value)}
                  placeholder="0"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                />
                <Euro className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Indemnización / Cobro Seguro (€)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={indemnizacion}
                  onChange={(e) => setIndemnizacion(e.target.value)}
                  placeholder="Importe liquidado por la aseguradora"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
                />
                <Euro className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          {/* Dictamen Pericial / Resolución */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Dictamen Pericial o Resolución de la Compañía
            </label>
            <textarea
              rows={3}
              value={resolucion}
              onChange={(e) => setResolucion(e.target.value)}
              placeholder="Indique si el perito ha acudido a tasar, si han aprobado el presupuesto del fontanero, o si envían a su propio reparador homologado..."
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 outline-none"
            />
          </div>

          {/* Comunicaciones y Llamadas con el Seguro */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                <span>Bitácora de Contacto con Aseguradora / Perito</span>
              </h3>
            </div>

            {/* Formulario añadir comunicación */}
            <div className="flex gap-2">
              <select
                value={nuevoRemitente}
                onChange={(e) => setNuevoRemitente(e.target.value)}
                className="w-32 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-700 outline-none shrink-0"
              >
                <option value="Perito">Perito</option>
                <option value="Aseguradora">Aseguradora</option>
                <option value="Tramitador">Tramitador</option>
                <option value="Inquilino">Inquilino</option>
                <option value="Gestor">Gestor</option>
              </select>
              <input
                type="text"
                value={nuevoMensaje}
                onChange={(e) => setNuevoMensaje(e.target.value)}
                placeholder="Ej: Perito confirma visita para mañana a las 11h..."
                className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddComunicacion();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddComunicacion}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Anotar</span>
              </button>
            </div>

            {/* Listado de comunicaciones */}
            {comunicaciones.length > 0 && (
              <div className="space-y-2 mt-2 max-h-40 overflow-y-auto">
                {comunicaciones.map((com) => (
                  <div key={com.id} className="p-2 bg-white border border-slate-200 rounded-lg text-xs flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-slate-800">{com.remitente}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(com.fecha).toLocaleString('es-ES')}
                        </span>
                      </div>
                      <p className="text-slate-600">{com.mensaje}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveComunicacion(com.id)}
                      className="text-slate-400 hover:text-red-600 p-1"
                      title="Borrar anotación"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-md shadow-indigo-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{siniestroToEdit ? 'Actualizar Siniestro' : 'Registrar Siniestro'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
