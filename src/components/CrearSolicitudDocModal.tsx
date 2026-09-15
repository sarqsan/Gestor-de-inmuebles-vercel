import React, { useState, useEffect } from 'react';
import {
  Candidato,
  Inmueble,
  ItemDocumentoSolicitado,
  SolicitudDocumentacion,
  TipoDocumento,
  InvitacionVisita,
} from '../types';
import {
  generarDocumentosSugeridos,
  buildSolicitudDocumentacion,
  PRESET_DOCUMENTOS,
  generarMensajeWhatsappSolicitud,
} from '../utils/documentTemplates';
import {
  X,
  FileCheck2,
  Plus,
  Trash2,
  MessageSquare,
  Copy,
  Check,
  Calendar,
  Home,
  User,
  AlertCircle,
  HelpCircle,
  FileText,
  CheckCircle2,
  ShieldCheck,
  Send,
} from 'lucide-react';

interface CrearSolicitudDocModalProps {
  candidato: Candidato;
  inmueble?: Inmueble;
  invitacion?: InvitacionVisita;
  onClose: () => void;
  onSaveSolicitud: (solicitud: SolicitudDocumentacion) => Promise<void>;
  onOpenWhatsapp?: (url: string) => void;
}

export const CrearSolicitudDocModal: React.FC<CrearSolicitudDocModalProps> = ({
  candidato,
  inmueble,
  invitacion,
  onClose,
  onSaveSolicitud,
  onOpenWhatsapp,
}) => {
  const [documentos, setDocumentos] = useState<ItemDocumentoSolicitado[]>([]);
  const [mensajePropietario, setMensajePropietario] = useState<string>(
    'Gracias por realizar la visita. Para formalizar la valoración de tu candidatura al alquiler, te solicitamos que aportes los siguientes documentos a través de este enlace seguro privado.'
  );
  const [showAddCustom, setShowAddCustom] = useState<boolean>(false);
  const [customNombre, setCustomNombre] = useState<string>('');
  const [customDescripcion, setCustomDescripcion] = useState<string>('');
  const [customTipo, setCustomTipo] = useState<TipoDocumento>('otro');
  const [customObligatorio, setCustomObligatorio] = useState<boolean>(true);
  const [customTitular, setCustomTitular] = useState<'titular_1' | 'titular_2' | 'avalista' | 'general'>('general');

  const [saving, setSaving] = useState<boolean>(false);
  const [createdSolicitud, setCreatedSolicitud] = useState<SolicitudDocumentacion | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedMsg, setCopiedMsg] = useState<boolean>(false);

  const esDosTitulares = candidato.numTitularesContrato === 2 || !!candidato.cotitular;

  // Initialize suggested documents on mount
  useEffect(() => {
    const sugeridos = generarDocumentosSugeridos(candidato);
    setDocumentos(sugeridos);
  }, [candidato]);

  // Derived property info
  const targetInmueble: Inmueble = inmueble || {
    id: candidato.inmuebleId || 'inm-default',
    direccion: candidato.inmuebleNombre || 'Inmueble seleccionado',
    precio: 0,
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    estado: 'disponible',
    descripcion: '',
    images: [],
    ownerId: 'propietario',
  };

  const visitDateFormatted = invitacion?.reserva
    ? `${invitacion.reserva.fecha} (${invitacion.reserva.horaInicio} - ${invitacion.reserva.horaFin})`
    : 'Visita completada';

  // Toggle item obligation
  const handleToggleObligatorio = (id: string) => {
    setDocumentos((prev) =>
      prev.map((d) => (d.id === id ? { ...d, obligatorio: !d.obligatorio } : d))
    );
  };

  // Remove document item
  const handleRemoveDoc = (id: string) => {
    setDocumentos((prev) => prev.filter((d) => d.id !== id));
  };

  // Add custom document
  const handleAddCustomDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customNombre.trim()) return;

    const newDoc: ItemDocumentoSolicitado = {
      id: `req-custom-${Date.now()}`,
      tipo: customTipo,
      nombre: customNombre.trim(),
      descripcion: customDescripcion.trim() || undefined,
      obligatorio: customObligatorio,
      titular: customTitular,
      estado: 'pendiente',
      archivos: [],
    };

    setDocumentos((prev) => [...prev, newDoc]);
    setCustomNombre('');
    setCustomDescripcion('');
    setShowAddCustom(false);
  };

  // Add from standard preset library
  const handleAddPreset = (preset: typeof PRESET_DOCUMENTOS[0]) => {
    const newDoc: ItemDocumentoSolicitado = {
      id: `req-preset-${Date.now()}`,
      tipo: preset.tipo,
      nombre: preset.nombre,
      descripcion: preset.descripcion,
      obligatorio: preset.obligatorio,
      titular: 'general',
      estado: 'pendiente',
      archivos: [],
    };
    setDocumentos((prev) => [...prev, newDoc]);
  };

  // Submit and create document request
  const handleCreateRequest = async () => {
    if (documentos.length === 0) {
      alert('Debes incluir al menos un documento en la solicitud.');
      return;
    }

    setSaving(true);
    try {
      const nuevaSol = buildSolicitudDocumentacion(
        candidato,
        targetInmueble,
        documentos,
        {
          visitaId: invitacion?.id,
          fechaVisita: visitDateFormatted,
          mensajePropietario: mensajePropietario.trim(),
        }
      );

      await onSaveSolicitud(nuevaSol);
      setCreatedSolicitud(nuevaSol);
    } catch (err) {
      console.error('Error creating doc request:', err);
      alert('Error al guardar la solicitud. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  // Public URL calculation
  const publicUrl = createdSolicitud
    ? `${window.location.origin}/#documentacion/${createdSolicitud.token}`
    : '';

  const handleCopyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyWhatsappText = () => {
    if (!createdSolicitud) return;
    const msg = generarMensajeWhatsappSolicitud(createdSolicitud);
    navigator.clipboard.writeText(msg);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
  };

  const handleOpenWhatsappClick = () => {
    if (!createdSolicitud) return;
    const msg = generarMensajeWhatsappSolicitud(createdSolicitud);
    const cleanPhone = candidato.telefono.replace(/[^0-9]/g, '');
    const phoneWithPrefix = cleanPhone.startsWith('34') ? cleanPhone : `34${cleanPhone}`;
    const whatsappUrl = `https://wa.me/${phoneWithPrefix}?text=${encodeURIComponent(msg)}`;

    if (onOpenWhatsapp) {
      onOpenWhatsapp(whatsappUrl);
    } else {
      window.open(whatsappUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                Solicitud de Documentación Post-Visita
              </h3>
              <p className="text-xs text-slate-500">
                Paso siguiente tras la visita para evaluar y validar al candidato
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {/* SUCCESS SCREEN WHEN CREATED */}
          {createdSolicitud ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-emerald-900">
                  ¡Solicitud de Documentación Creada con Éxito!
                </h4>
                <p className="text-xs text-emerald-800 max-w-lg mx-auto">
                  Se ha generado el enlace privado seguro para <strong>{candidato.nombre}</strong>. El candidato podrá subir los <strong>{createdSolicitud.documentos.length} documentos</strong> solicitados directamente sin registrarse.
                </p>
              </div>

              {/* Private Link Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    Enlace Privado del Candidato:
                  </span>
                  <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                    Aislamiento Seguro
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={publicUrl}
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-700 font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs ${
                      copiedLink
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'Copiado' : 'Copiar Enlace'}</span>
                  </button>
                </div>
              </div>

              {/* WhatsApp Action */}
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-emerald-600" />
                      Enviar Solicitud al Candidato por WhatsApp
                    </h5>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Teléfono: <span className="font-semibold">{candidato.telefono}</span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={handleOpenWhatsappClick}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Abrir WhatsApp con Mensaje Predefinido</span>
                  </button>

                  <button
                    onClick={handleCopyWhatsappText}
                    className="py-2.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    {copiedMsg ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{copiedMsg ? 'Mensaje Copiado' : 'Copiar Texto'}</span>
                  </button>
                </div>
              </div>

              {/* Summary List */}
              <div className="border-t border-slate-100 pt-4">
                <h5 className="text-xs font-bold text-slate-700 mb-2">Documentos solicitados en este envío:</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {createdSolicitud.documentos.map((doc, i) => (
                    <div
                      key={doc.id}
                      className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-800 truncate">{doc.nombre}</span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          doc.obligatorio
                            ? 'bg-rose-50 text-rose-700 border border-rose-100'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {doc.obligatorio ? 'Obligatorio' : 'Opcional'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Finalizar y Volver
                </button>
              </div>
            </div>
          ) : (
            /* CONFIGURATION & CREATION FORM */
            <>
              {/* Context Summary: Candidate + Property + Visit */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2.5">
                  <User className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-400">Candidato</div>
                    <div className="text-xs font-bold text-slate-800 truncate">{candidato.nombre}</div>
                    <div className="text-[11px] text-slate-500">{candidato.telefono}</div>
                    {esDosTitulares && (
                      <span className="inline-block mt-1 px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                        2 Titulares
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2.5">
                  <Home className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-400">Inmueble</div>
                    <div className="text-xs font-bold text-slate-800 truncate">{targetInmueble.direccion}</div>
                    <div className="text-[11px] text-slate-500">
                      {targetInmueble.precio ? `${targetInmueble.precio} €/mes` : 'Alquiler'}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-2.5">
                  <Calendar className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-400">Visita Vinculada</div>
                    <div className="text-xs font-bold text-indigo-900 truncate">{visitDateFormatted}</div>
                    <div className="text-[11px] text-emerald-600 font-medium">Asociación Directa</div>
                  </div>
                </div>
              </div>

              {/* Instructions / Message to Candidate */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  Mensaje / Instrucciones para el candidato:
                </label>
                <textarea
                  rows={2}
                  value={mensajePropietario}
                  onChange={(e) => setMensajePropietario(e.target.value)}
                  placeholder="Escribe instrucciones personalizadas para el candidato..."
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400"
                />
              </div>

              {/* Documents to Request Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Documentos a Solicitar ({documentos.length})
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Selecciona y ajusta los documentos requeridos para este candidato
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddCustom(true)}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir Documento</span>
                  </button>
                </div>

                {/* Custom Doc Form Popover */}
                {showAddCustom && (
                  <form
                    onSubmit={handleAddCustomDoc}
                    className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl space-y-3 animate-in fade-in duration-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-950">Añadir Documento Personalizado</span>
                      <button
                        type="button"
                        onClick={() => setShowAddCustom(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Nombre del Documento *
                        </label>
                        <input
                          type="text"
                          required
                          value={customNombre}
                          onChange={(e) => setCustomNombre(e.target.value)}
                          placeholder="Ej. Certificado de Empadronamiento"
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Tipo / Categoría
                        </label>
                        <select
                          value={customTipo}
                          onChange={(e) => setCustomTipo(e.target.value as TipoDocumento)}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="otro">Otro / General</option>
                          <option value="dni_nie">Identidad (DNI / NIE)</option>
                          <option value="nomina">Nómina</option>
                          <option value="contrato">Contrato Laboral</option>
                          <option value="vida_laboral">Vida Laboral</option>
                          <option value="renta">Declaración de la Renta</option>
                          <option value="justificante_bancario">Justificante Bancario</option>
                          <option value="avalista">Avalista</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Descripción o Instrucciones Específicas (Opcional)
                      </label>
                      <input
                        type="text"
                        value={customDescripcion}
                        onChange={(e) => setCustomDescripcion(e.target.value)}
                        placeholder="Ej. Emitido en los últimos 3 meses en PDF"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={customObligatorio}
                          onChange={(e) => setCustomObligatorio(e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-medium">Documento obligatorio</span>
                      </label>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddCustom(false)}
                          className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
                        >
                          Añadir a la lista
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* Items List */}
                <div className="space-y-2">
                  {documentos.map((doc, idx) => (
                    <div
                      key={doc.id}
                      className="p-3.5 bg-white border border-slate-200/90 rounded-xl hover:border-slate-300 transition-colors flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs">{doc.nombre}</span>
                            {doc.titular && doc.titular !== 'general' && (
                              <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 text-[10px] font-bold rounded">
                                {doc.titular === 'titular_1'
                                  ? 'Titular 1'
                                  : doc.titular === 'titular_2'
                                  ? 'Titular 2'
                                  : 'Avalista'}
                              </span>
                            )}
                          </div>
                          {doc.descripcion && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{doc.descripcion}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleObligatorio(doc.id)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                            doc.obligatorio
                              ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {doc.obligatorio ? 'Obligatorio' : 'Opcional'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveDoc(doc.id)}
                          title="Eliminar de la solicitud"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {documentos.length === 0 && (
                    <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center space-y-2">
                      <p className="text-xs text-slate-500">No has seleccionado ningún documento para solicitar.</p>
                      <button
                        type="button"
                        onClick={() => setDocumentos(generarDocumentosSugeridos(candidato))}
                        className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold"
                      >
                        Restablecer documentos sugeridos
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Add Presets Library */}
                <div className="pt-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                    Añadir otros tipos documentales comunes con 1 clic:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_DOCUMENTOS.map((preset) => {
                      const alreadyAdded = documentos.some((d) => d.tipo === preset.tipo && d.nombre === preset.nombre);
                      if (alreadyAdded) return null;
                      return (
                        <button
                          key={preset.nombre}
                          type="button"
                          onClick={() => handleAddPreset(preset)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>{preset.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  disabled={saving || documentos.length === 0}
                  onClick={handleCreateRequest}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                >
                  {saving ? (
                    <span>Generando Solicitud...</span>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Generar Solicitud y Enlace Privado</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
