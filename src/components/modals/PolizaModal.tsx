import React, { useState, useEffect } from 'react';
import {
  PolizaSeguro,
  Inmueble,
  Propietario,
  TipoPolizaSeguro,
  EstadoPolizaSeguro,
  UsuarioApp,
} from '../../types';
import {
  X,
  ShieldCheck,
  Building2,
  Calendar,
  Phone,
  Mail,
  Euro,
  Check,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface PolizaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (poliza: PolizaSeguro) => Promise<void>;
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  currentUser?: UsuarioApp;
  polizaToEdit?: PolizaSeguro | null;
  defaultInmuebleId?: string;
}

const COBERTURAS_PREDEFINIDAS = [
  'Daños por agua',
  'Rotura de tuberías e instalaciones',
  'Filtraciones y atascos',
  'Responsabilidad Civil inmobiliaria',
  'Cerrajería urgente 24h',
  'Electricidad de urgencia 24h',
  'Rotura de cristales y loza sanitaria',
  'Incendio y explosión',
  'Robo y expoliación',
  'Daños eléctricos y sobretensión',
  'Actos vandálicos del inquilino',
  'Defensa jurídica y reclamación',
  'Avería de electrodomésticos (línea blanca)',
  'Asistencia en el hogar 24h',
];

const ASEGURADORAS_SUGERIDAS = [
  'Mapfre Seguros',
  'Caser Seguros',
  'Mutua de Propietarios',
  'Allianz Seguros',
  'AXA Seguros',
  'Zurich Seguros',
  'Generali Seguros',
  'Occident (Catalana Occidente)',
  'Reale Seguros',
  'Santa Lucía',
  'Pelayo',
];

export const PolizaModal: React.FC<PolizaModalProps> = ({
  isOpen,
  onClose,
  onSave,
  inmuebles,
  propietarios,
  currentUser,
  polizaToEdit,
  defaultInmuebleId,
}) => {
  const [inmuebleId, setInmuebleId] = useState<string>('');
  const [aseguradora, setAseguradora] = useState<string>('');
  const [numeroPoliza, setNumeroPoliza] = useState<string>('');
  const [tipo, setTipo] = useState<TipoPolizaSeguro>('HOGAR');
  const [fechaInicio, setFechaInicio] = useState<string>('');
  const [fechaVencimiento, setFechaVencimiento] = useState<string>('');
  const [estado, setEstado] = useState<EstadoPolizaSeguro>('VIGENTE');
  const [coberturas, setCoberturas] = useState<string[]>([]);
  const [nuevaCobertura, setNuevaCobertura] = useState<string>('');
  const [franquicia, setFranquicia] = useState<string>('0');
  const [primaAnual, setPrimaAnual] = useState<string>('');
  const [telefono, setTelefono] = useState<string>('');
  const [asistencia24h, setAsistencia24h] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      if (polizaToEdit) {
        setInmuebleId(polizaToEdit.inmuebleId || '');
        setAseguradora(polizaToEdit.aseguradora || '');
        setNumeroPoliza(polizaToEdit.numeroPoliza || '');
        setTipo(polizaToEdit.tipo || 'HOGAR');
        setFechaInicio(polizaToEdit.fechaInicio || '');
        setFechaVencimiento(polizaToEdit.fechaVencimiento || '');
        setEstado(polizaToEdit.estado || 'VIGENTE');
        setCoberturas(polizaToEdit.coberturas || []);
        setFranquicia(polizaToEdit.franquicia?.toString() || '0');
        setPrimaAnual(polizaToEdit.primaAnual?.toString() || '');
        setTelefono(polizaToEdit.contacto?.telefono || '');
        setAsistencia24h(polizaToEdit.contacto?.asistencia24h || '');
        setEmail(polizaToEdit.contacto?.email || '');
        setObservaciones(polizaToEdit.observaciones || '');
      } else {
        const initInm = defaultInmuebleId || (inmuebles.length > 0 ? inmuebles[0].id : '');
        setInmuebleId(initInm);
        setAseguradora('Mapfre Seguros');
        setNumeroPoliza('');
        setTipo('HOGAR');
        const hoy = new Date().toISOString().split('T')[0];
        const unAnoDespues = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().split('T')[0];
        setFechaInicio(hoy);
        setFechaVencimiento(unAnoDespues);
        setEstado('VIGENTE');
        setCoberturas([
          'Daños por agua',
          'Rotura de tuberías e instalaciones',
          'Responsabilidad Civil inmobiliaria',
          'Cerrajería urgente 24h',
          'Electricidad de urgencia 24h',
        ]);
        setFranquicia('0');
        setPrimaAnual('220');
        setTelefono('');
        setAsistencia24h('');
        setEmail('');
        setObservaciones('');
      }
      setNuevaCobertura('');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, polizaToEdit, defaultInmuebleId, inmuebles]);

  if (!isOpen) return null;

  const selectedInmueble = inmuebles.find((i) => i.id === inmuebleId);
  // Propietario de la póliza (clave de aislamiento en Firestore): el usuario
  // propietario autenticado o el titular del inmueble. Nunca un valor
  // provisional, que dejaría la póliza fuera del ámbito de su propietario.
  const propietarioEfectivo =
    currentUser?.tipoPerfil === 'PROPIETARIO' && currentUser.propietarioId
      ? currentUser.propietarioId
      : polizaToEdit?.propietarioId ||
        selectedInmueble?.propietarioId ||
        selectedInmueble?.propietarioPrincipalId ||
        selectedInmueble?.datosFiscales?.propietarioPrincipal?.propietarioId ||
        '';

  const toggleCobertura = (cob: string) => {
    if (coberturas.includes(cob)) {
      setCoberturas((prev) => prev.filter((c) => c !== cob));
    } else {
      setCoberturas((prev) => [...prev, cob]);
    }
  };

  const handleAddCustomCobertura = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaCobertura.trim()) return;
    const clean = nuevaCobertura.trim();
    if (!coberturas.includes(clean)) {
      setCoberturas((prev) => [...prev, clean]);
    }
    setNuevaCobertura('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aseguradora.trim()) {
      setErrorMsg('Debe indicar la entidad aseguradora.');
      return;
    }
    if (!numeroPoliza.trim()) {
      setErrorMsg('Debe indicar el número de póliza.');
      return;
    }
    if (!fechaInicio || !fechaVencimiento) {
      setErrorMsg('Indique las fechas de vigencia de la póliza.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const propId = propietarioEfectivo;
      if (!propId) {
        setErrorMsg('No se pudo determinar el propietario de la póliza. Selecciona un inmueble con titular asignado.');
        setIsSubmitting(false);
        return;
      }
      const now = new Date().toISOString();

      const polizaData: PolizaSeguro = {
        id: polizaToEdit ? polizaToEdit.id : `pol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        aseguradora: aseguradora.trim(),
        numeroPoliza: numeroPoliza.trim().toUpperCase(),
        tipo,
        propietarioId: propId,
        inmuebleId: inmuebleId || undefined,
        inmuebleDireccion: selectedInmueble?.direccion,
        fechaInicio,
        fechaVencimiento,
        estado,
        coberturas,
        franquicia: franquicia ? parseFloat(franquicia) : 0,
        primaAnual: primaAnual ? parseFloat(primaAnual) : undefined,
        contacto: {
          telefono: telefono.trim() || undefined,
          asistencia24h: asistencia24h.trim() || undefined,
          email: email.trim() || undefined,
        },
        observaciones: observaciones.trim() || undefined,
        createdAt: polizaToEdit ? polizaToEdit.createdAt : now,
        updatedAt: now,
      };

      await onSave(polizaData);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar póliza:', err);
      setErrorMsg(err?.message || 'Error al guardar la póliza.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {polizaToEdit ? 'Editar Póliza de Seguro' : 'Alta de Póliza de Seguro'}
              </h2>
              <p className="text-xs text-slate-300">
                Coberturas multirriesgo, asistencia 24h y aseguramiento del inmueble
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

        {errorMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Inmueble y Tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Vivienda Asociada *
              </label>
              <div className="relative">
                <select
                  value={inmuebleId}
                  onChange={(e) => setInmuebleId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  required
                >
                  <option value="" disabled>Seleccione una vivienda</option>
                  {inmuebles.map((inm) => (
                    <option key={inm.id} value={inm.id}>
                      {inm.direccion} ({inm.ciudad})
                    </option>
                  ))}
                </select>
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Tipo de Póliza *
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoPolizaSeguro)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              >
                <option value="HOGAR">Hogar Multirriesgo (Continente + Contenido)</option>
                <option value="ARRENDADOR">Protección Arrendador / Propietario</option>
                <option value="IMPAGO_ALQUILER">Seguro de Impago de Alquiler</option>
                <option value="RESPONSABILIDAD_CIVIL">Responsabilidad Civil Exclusiva</option>
                <option value="COMUNIDAD">Seguro de Comunidad de Propietarios</option>
                <option value="OTRO">Otro Tipo de Póliza</option>
              </select>
            </div>
          </div>

          {/* Aseguradora y Número de Póliza */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Entidad Aseguradora *
              </label>
              <input
                type="text"
                list="aseguradoras-list"
                value={aseguradora}
                onChange={(e) => setAseguradora(e.target.value)}
                placeholder="Ej: Mapfre, Caser, Mutua de Propietarios..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                required
              />
              <datalist id="aseguradoras-list">
                {ASEGURADORAS_SUGERIDAS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Número de Póliza / Expediente *
              </label>
              <input
                type="text"
                value={numeroPoliza}
                onChange={(e) => setNumeroPoliza(e.target.value)}
                placeholder="Ej: MAP-8492048-H"
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                required
              />
            </div>
          </div>

          {/* Fechas de Vigencia y Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Fecha de Efecto *
              </label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Fecha Vencimiento *
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Estado *
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoPolizaSeguro)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
              >
                <option value="VIGENTE">Vigente</option>
                <option value="EN_TRAMITE">En Trámite</option>
                <option value="VENCIDA">Vencida</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </div>
          </div>

          {/* Económico: Franquicia y Prima */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Franquicia (€)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={franquicia}
                  onChange={(e) => setFranquicia(e.target.value)}
                  placeholder="0 si no aplica"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <Euro className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Prima Anual (€)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={primaAnual}
                  onChange={(e) => setPrimaAnual(e.target.value)}
                  placeholder="Ej: 245.50"
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
                <Euro className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>
          </div>

          {/* Contacto con la Aseguradora */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Teléfonos de Atención y Asistencia de Emergencia
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Asistencia 24h / Urgencias
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={asistencia24h}
                    onChange={(e) => setAsistencia24h(e.target.value)}
                    placeholder="900 101 010"
                    className="w-full pl-7 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-blue-500 outline-none"
                  />
                  <Phone className="w-3.5 h-3.5 text-blue-600 absolute left-2 top-2" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Teléfono Atención General
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="918 365 365"
                    className="w-full pl-7 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-blue-500 outline-none"
                  />
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Email Apertura Siniestros
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="siniestros@aseguradora.es"
                    className="w-full pl-7 pr-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:border-blue-500 outline-none"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2" />
                </div>
              </div>
            </div>
          </div>

          {/* Coberturas Declaradas */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Coberturas y Garantías Activas ({coberturas.length} seleccionadas)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 border border-slate-200 rounded-xl bg-slate-50/50">
              {COBERTURAS_PREDEFINIDAS.map((cob) => {
                const isSelected = coberturas.includes(cob);
                return (
                  <button
                    key={cob}
                    type="button"
                    onClick={() => toggleCobertura(cob)}
                    className={`flex items-start gap-2 p-2 rounded-lg text-xs text-left transition-all border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300 text-blue-900 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 shrink-0 flex items-center justify-center border ${
                        isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                    <span className="leading-tight">{cob}</span>
                  </button>
                );
              })}
            </div>

            {/* Añadir cobertura personalizada */}
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={nuevaCobertura}
                onChange={(e) => setNuevaCobertura(e.target.value)}
                placeholder="Añadir otra garantía personalizada (ej. Filtraciones por lluvias > 40l/h)..."
                className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:bg-white focus:border-blue-500 outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomCobertura}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir</span>
              </button>
            </div>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Observaciones o Cláusulas Específicas
            </label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Mediador de seguros, número de sucursal, condiciones de renovación..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
            />
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
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{polizaToEdit ? 'Actualizar Póliza' : 'Guardar Póliza'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
