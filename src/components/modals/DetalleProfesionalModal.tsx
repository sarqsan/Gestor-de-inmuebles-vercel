import React, { useState } from 'react';
import {
  X,
  Wrench,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  Star,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Calendar,
  DollarSign,
  Award,
  Layers,
  Clock,
  User,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';
import {
  Profesional,
  TrabajoProfesional,
  PresupuestoProfesional,
  ValoracionProfesionalTrabajo,
  Inmueble,
  UsuarioApp,
  DocumentoProfesional,
} from '../../types';
import {
  TIPO_PROFESIONAL_LABELS,
  ESTADO_PROFESIONAL_LABELS,
  ESTADO_TRABAJO_LABELS,
  ESTADO_PRESUPUESTO_LABELS,
  calcularMetricasProfesional,
} from '../../utils/profesionalesEngine';
import { uploadProfesionalDocumentoStorage, saveProfesionalFirestore } from '../../lib/firebase';

interface DetalleProfesionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  profesional: Profesional;
  trabajos: TrabajoProfesional[];
  presupuestos: PresupuestoProfesional[];
  valoraciones: ValoracionProfesionalTrabajo[];
  inmuebles: Inmueble[];
  currentUser?: UsuarioApp;
  onEditarProfesional?: (profesional: Profesional) => void;
  onCrearTrabajo?: (profesionalId: string) => void;
  onCrearPresupuesto?: (profesionalId: string) => void;
  onSelectTrabajo?: (trabajo: TrabajoProfesional) => void;
}

type TabType = 'general' | 'zonas' | 'documentos' | 'trabajos' | 'presupuestos' | 'valoraciones';

export const DetalleProfesionalModal: React.FC<DetalleProfesionalModalProps> = ({
  isOpen,
  onClose,
  profesional,
  trabajos,
  presupuestos,
  valoraciones,
  inmuebles,
  currentUser,
  onEditarProfesional,
  onCrearTrabajo,
  onCrearPresupuesto,
  onSelectTrabajo,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [tipoDocSeleccionado, setTipoDocSeleccionado] = useState<DocumentoProfesional['tipo']>('SEGURO_RC');
  const [nombreDoc, setNombreDoc] = useState('');
  const [uploadError, setUploadError] = useState('');

  if (!isOpen) return null;

  const metricas = calcularMetricasProfesional(profesional, trabajos, presupuestos, valoraciones);
  const tipoInfo = TIPO_PROFESIONAL_LABELS[profesional.tipo] || TIPO_PROFESIONAL_LABELS.AUTONOMO;
  const estadoInfo = ESTADO_PROFESIONAL_LABELS[profesional.estado || 'ACTIVO'] || ESTADO_PROFESIONAL_LABELS.ACTIVO;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingDoc(true);
      setUploadError('');
      const docName = nombreDoc.trim() || file.name;
      const { downloadUrl, storagePath } = await uploadProfesionalDocumentoStorage(
        profesional.id,
        file,
        docName,
        tipoDocSeleccionado
      );

      const nuevoDoc: DocumentoProfesional = {
        id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        nombre: docName,
        tipo: tipoDocSeleccionado,
        tamano: file.size,
        storagePath,
        downloadUrl,
        fechaSubida: new Date().toISOString(),
        subidoPor: currentUser?.nombre ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim() : 'Administrador',
      };

      const documentosActualizados = [...(profesional.documentos || []), nuevoDoc];
      const profActualizado: Profesional = {
        ...profesional,
        documentos: documentosActualizados,
        updatedAt: new Date().toISOString(),
      };

      await saveProfesionalFirestore(profActualizado);
      setNombreDoc('');
    } catch (err: any) {
      console.error('Error uploading doc:', err);
      setUploadError('Error al subir el documento. Revisa tu conexión.');
    } finally {
      setUploadingDoc(false);
    }
  };

  return (
    <div
      id="detalle-profesional-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700 shadow-xs">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-xl font-bold text-slate-900">{profesional.nombreComercial}</h2>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${tipoInfo.badgeClass}`}>
                  {tipoInfo.label}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estadoInfo.badgeClass}`}>
                  {estadoInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {profesional.razonSocial ? `${profesional.razonSocial} • ` : ''}
                {profesional.cifNif ? `CIF/NIF: ${profesional.cifNif}` : 'Sin CIF especificado'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onCrearTrabajo && (
              <button
                onClick={() => onCrearTrabajo(profesional.id)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Asignar Trabajo</span>
              </button>
            )}
            {onEditarProfesional && (
              <button
                onClick={() => onEditarProfesional(profesional)}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Editar Ficha
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 border-b border-slate-200 bg-white divide-x divide-slate-100 text-center text-xs">
          <div className="p-3">
            <span className="text-slate-400 block font-medium">Trabajos Totales</span>
            <span className="text-base font-bold text-slate-900">{metricas.totalTrabajos}</span>
          </div>
          <div className="p-3">
            <span className="text-slate-400 block font-medium">Finalizados</span>
            <span className="text-base font-bold text-emerald-600">{metricas.trabajosFinalizados}</span>
          </div>
          <div className="p-3">
            <span className="text-slate-400 block font-medium">En Curso</span>
            <span className="text-base font-bold text-blue-600">{metricas.trabajosEnCurso}</span>
          </div>
          <div className="p-3">
            <span className="text-slate-400 block font-medium">Tasa Aceptación</span>
            <span className="text-base font-bold text-slate-900">{metricas.tasaAceptacion}%</span>
          </div>
          <div className="p-3">
            <span className="text-slate-400 block font-medium">Volumen Facturado</span>
            <span className="text-base font-bold text-slate-900">
              {metricas.volumenTotalFacturado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
          <div className="p-3">
            <span className="text-slate-400 block font-medium">Valoración Media</span>
            <div className="flex items-center justify-center space-x-1 mt-0.5">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="text-base font-bold text-slate-900">
                {metricas.mediaPuntuacion > 0 ? metricas.mediaPuntuacion.toFixed(1) : 'S/V'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6 overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'general'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Ficha y Servicios ({profesional.servicios?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('zonas')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'zonas'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Ámbito Geográfico ({profesional.zonasServicio?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('documentos')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'documentos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Documentación ({profesional.documentos?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('trabajos')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'trabajos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Trabajos ({metricas.totalTrabajos})
          </button>
          <button
            onClick={() => setActiveTab('presupuestos')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'presupuestos'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Presupuestos ({metricas.totalPresupuestos})
          </button>
          <button
            onClick={() => setActiveTab('valoraciones')}
            className={`py-3 px-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'valoraciones'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Valoraciones ({metricas.totalValoraciones})
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-white space-y-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Contact Information Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Datos de Contacto Directo</h4>
                  <div className="space-y-2 text-sm text-slate-700">
                    {profesional.contactoNombre && (
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="font-medium text-slate-900">{profesional.contactoNombre}</span>
                      </div>
                    )}
                    {profesional.telefono ? (
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-slate-400" />
                        <a href={`tel:${profesional.telefono}`} className="text-blue-600 hover:underline">
                          {profesional.telefono}
                        </a>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">Teléfono no registrado</div>
                    )}
                    {profesional.email ? (
                      <div className="flex items-center space-x-2">
                        <Mail className="w-4 h-4 text-slate-400" />
                        <a href={`mailto:${profesional.email}`} className="text-blue-600 hover:underline">
                          {profesional.email}
                        </a>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">Email no registrado</div>
                    )}
                    {profesional.web && (
                      <div className="flex items-center space-x-2">
                        <Globe className="w-4 h-4 text-slate-400" />
                        <a href={profesional.web} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline flex items-center space-x-1">
                          <span>{profesional.web}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Especialidades Acreditadas</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {profesional.especialidades && profesional.especialidades.length > 0 ? (
                      profesional.especialidades.map((esp, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold rounded-lg"
                        >
                          {esp}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">Sin especialidades especificadas</span>
                    )}
                  </div>
                  {profesional.descripcion && (
                    <div className="pt-2 border-t border-slate-200">
                      <p className="text-xs text-slate-600 leading-relaxed">{profesional.descripcion}</p>
                    </div>
                  )}
                  {profesional.observaciones && (
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-xs font-semibold text-slate-500 block mb-0.5">Notas internas:</span>
                      <p className="text-xs text-slate-600 leading-relaxed italic">{profesional.observaciones}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Catálogo de Servicios Específicos */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <Briefcase className="w-4 h-4 text-blue-600" />
                    <span>Servicios Ofertados y Tarifas Estimadas</span>
                  </h4>
                </div>

                {profesional.servicios && profesional.servicios.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {profesional.servicios.map((serv, idx) => (
                      <div key={idx} className="p-3.5 border border-slate-200 rounded-xl bg-white hover:border-blue-300 transition-colors">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                              {serv.especialidad}
                            </span>
                            <h5 className="text-sm font-semibold text-slate-900 mt-0.5">{serv.nombre}</h5>
                          </div>
                          {serv.precioEstimado !== undefined && serv.precioEstimado > 0 && (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-md">
                              ~{serv.precioEstimado}€
                            </span>
                          )}
                        </div>
                        {serv.descripcion && (
                          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{serv.descripcion}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                    No se han desglosado servicios tarifados individuales para este profesional.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'zonas' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-blue-600" />
                <span>Ámbito Geográfico de Cobertura y Desplazamiento</span>
              </h4>
              <p className="text-xs text-slate-500">
                El motor de asignación utiliza estas zonas para emparejar automáticamente al profesional con las incidencias y viviendas de tu cartera.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {profesional.zonasServicio && profesional.zonasServicio.length > 0 ? (
                  profesional.zonasServicio.map((zona, idx) => (
                    <div key={zona.id || idx} className="p-3.5 border border-slate-200 rounded-xl bg-slate-50/60">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">{zona.provincia}</span>
                        {zona.radioKm && (
                          <span className="text-xs px-2 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-md font-medium">
                            Radio: {zona.radioKm} km
                          </span>
                        )}
                      </div>
                      {zona.municipio && (
                        <p className="text-xs text-slate-600 mt-1">
                          Municipio/Comarca: <span className="font-semibold text-slate-800">{zona.municipio}</span>
                        </p>
                      )}
                      {zona.codigosPostales && zona.codigosPostales.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {zona.codigosPostales.map((cp, cpi) => (
                            <span key={cpi} className="px-1.5 py-0.5 bg-white border border-slate-200 text-slate-600 text-[11px] rounded font-mono">
                              CP {cp}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 p-6 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                    Sin zonas geográficas específicas. Trabaja en todo el territorio.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'documentos' && (
            <div className="space-y-6">
              {/* Upload Document Box */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Añadir Documento Acreditativo o Seguro RC (Almacenamiento Seguro Firebase)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Tipo de Documento</label>
                    <select
                      value={tipoDocSeleccionado}
                      onChange={(e) => setTipoDocSeleccionado(e.target.value as any)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="SEGURO_RC">Póliza de Seguro de RC</option>
                      <option value="ALTA_IAE">Alta IAE / Autónomos</option>
                      <option value="PREVENCION_RIESGOS">Prevención Riesgos Laborales</option>
                      <option value="CERTIFICADO_CONTRATISTA">Certificado Contratistas (Hacienda)</option>
                      <option value="TITULO_OFICIAL">Título / Carnet Instalador Oficial</option>
                      <option value="OTRO">Otro Documento</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Nombre Descriptivo</label>
                    <input
                      type="text"
                      placeholder="Ej: Seguro RC Mapfre 2025"
                      value={nombreDoc}
                      onChange={(e) => setNombreDoc(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Seleccionar Archivo (PDF / JPG)</label>
                    <label className="w-full flex items-center justify-center space-x-1.5 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingDoc ? 'Subiendo...' : 'Subir Documento'}</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileUpload}
                        disabled={uploadingDoc}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                {uploadError && <p className="text-xs text-rose-600 font-medium">{uploadError}</p>}
              </div>

              {/* Documents List */}
              <div className="space-y-2">
                {profesional.documentos && profesional.documentos.length > 0 ? (
                  profesional.documentos.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3.5 border border-slate-200 rounded-xl flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800">{doc.nombre}</span>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="px-1.5 py-0.2 bg-slate-100 rounded text-slate-700 font-mono text-[10px]">
                              {doc.tipo}
                            </span>
                            <span>• Subido el {new Date(doc.fechaSubida).toLocaleDateString('es-ES')}</span>
                            {doc.subidoPor && <span>por {doc.subidoPor}</span>}
                          </div>
                        </div>
                      </div>
                      <a
                        href={doc.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium rounded-lg transition-colors"
                      >
                        <span>Ver Documento</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                    No se ha adjuntado documentación técnica ni pólizas de RC aún.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'trabajos' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">Historial de Trabajos Realizados</h4>
                {onCrearTrabajo && (
                  <button
                    onClick={() => onCrearTrabajo(profesional.id)}
                    className="text-xs font-semibold text-blue-600 hover:underline flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Crear nueva orden para este profesional</span>
                  </button>
                )}
              </div>

              {metricas.misTrabajos.length > 0 ? (
                metricas.misTrabajos.map((trabajo) => {
                  const estInfo = ESTADO_TRABAJO_LABELS[trabajo.estado] || ESTADO_TRABAJO_LABELS.PENDIENTE;
                  return (
                    <div
                      key={trabajo.id}
                      onClick={() => onSelectTrabajo && onSelectTrabajo(trabajo)}
                      className="p-4 border border-slate-200 rounded-xl hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2 flex-wrap">
                            <h5 className="font-bold text-slate-900 text-sm">{trabajo.titulo}</h5>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${estInfo.badgeClass}`}>
                              {estInfo.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
                            <MapPin className="w-3 h-3" />
                            <span>{trabajo.inmuebleDireccion || 'Inmueble asignado'}</span>
                            <span>•</span>
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(trabajo.fechaSolicitud).toLocaleDateString('es-ES')}</span>
                          </p>
                        </div>
                        {trabajo.importeFinal !== undefined && (
                          <span className="text-sm font-bold text-slate-900">
                            {trabajo.importeFinal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  Este profesional no tiene órdenes de trabajo registradas todavía.
                </div>
              )}
            </div>
          )}

          {activeTab === 'presupuestos' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">Presupuestos Emitidos</h4>
                {onCrearPresupuesto && (
                  <button
                    onClick={() => onCrearPresupuesto(profesional.id)}
                    className="text-xs font-semibold text-blue-600 hover:underline flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Registrar nuevo presupuesto</span>
                  </button>
                )}
              </div>

              {metricas.misPresupuestos.length > 0 ? (
                metricas.misPresupuestos.map((pres) => {
                  const estPres = ESTADO_PRESUPUESTO_LABELS[pres.estado] || ESTADO_PRESUPUESTO_LABELS.BORRADOR;
                  return (
                    <div key={pres.id} className="p-4 border border-slate-200 rounded-xl bg-white space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              {pres.numeroPresupuesto || `PRE-${pres.id.slice(-5)}`}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${estPres.badgeClass}`}>
                              {estPres.label}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{pres.descripcion}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-bold text-slate-900">
                            {pres.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                          </span>
                          <span className="text-[11px] text-slate-400 block">IVA incl.</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                        <span>Fecha: {new Date(pres.fecha).toLocaleDateString('es-ES')}</span>
                        <span>{pres.partidas?.length || 0} partidas detalladas</span>
                        {pres.documentoUrl && (
                          <a
                            href={pres.documentoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline flex items-center space-x-1"
                          >
                            <span>Ver PDF</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No constan presupuestos emitidos por este profesional.
                </div>
              )}
            </div>
          )}

          {activeTab === 'valoraciones' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Resumen de Calidad y Rendimiento Pericial</h4>
                  <p className="text-xs text-slate-500">Basado en evaluaciones post-intervención de propietarios y peritos.</p>
                </div>
                <div className="flex items-center space-x-4 text-xs font-semibold">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Calidad</span>
                    <span className="text-slate-800">{metricas.mediaCalidad || '-'}/5</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Puntualidad</span>
                    <span className="text-slate-800">{metricas.mediaPuntualidad || '-'}/5</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Precio</span>
                    <span className="text-slate-800">{metricas.mediaPrecio || '-'}/5</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Comunicación</span>
                    <span className="text-slate-800">{metricas.mediaComunicacion || '-'}/5</span>
                  </div>
                </div>
              </div>

              {metricas.misValoraciones.length > 0 ? (
                metricas.misValoraciones.map((val, idx) => (
                  <div key={val.id || idx} className="p-4 border border-slate-200 rounded-xl bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${
                              s <= val.puntuacion ? 'text-amber-500 fill-amber-500' : 'text-slate-200'
                            }`}
                          />
                        ))}
                        <span className="text-xs font-bold text-slate-800 ml-1.5">{val.puntuacion}/5</span>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(val.fecha).toLocaleDateString('es-ES')}</span>
                    </div>
                    {val.comentario && <p className="text-xs text-slate-700 italic">"{val.comentario}"</p>}
                    <div className="flex items-center space-x-4 text-[11px] text-slate-500 pt-1">
                      <span>Resultado: <strong className="text-slate-700">{val.resultado}</strong></span>
                      {val.inmuebleDireccion && <span>Inmueble: {val.inmuebleDireccion}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  No hay valoraciones registradas para este profesional todavía.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
