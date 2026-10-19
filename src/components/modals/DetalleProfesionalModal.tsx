import React, { useEffect, useState } from 'react';
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
import { documentosProfesionales } from '../../lib/expedienteDocumental/documentosProfesionalesCliente';
import {
  clasificarDocumentoProfesionalHeredado,
  presentarEstadoDocumentoProfesional,
  type DocumentoProfesionalAlmacenado,
  type TipoDocumentoProfesional,
} from '../../lib/expedienteDocumental/documentosProfesionales';
import { mensajeDeErrorUsuario } from '../../feedback/mensajes';
import { propsInteraccion } from '../../accesibilidad/interaccion';
import { useDialogoAccesible } from '../../accesibilidad/dialogo';

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
  const [tipoDocSeleccionado, setTipoDocSeleccionado] = useState<TipoDocumentoProfesional>('SEGURO_RC');
  const [nombreDoc, setNombreDoc] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadInfo, setUploadInfo] = useState('');
  const [archivoSeleccionado, setArchivoSeleccionado] = useState<File | null>(null);
  const [sustituyeA, setSustituyeA] = useState('');
  // P3: documentos con almacenamiento autorizado (subcolección del profesional).
  const [docsAlmacenados, setDocsAlmacenados] = useState<DocumentoProfesionalAlmacenado[]>([]);
  const [docsError, setDocsError] = useState('');
  const [verificaciones, setVerificaciones] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen || !profesional?.id) return undefined;
    setDocsError('');
    return documentosProfesionales.subscribe(
      profesional.id,
      setDocsAlmacenados,
      () => setDocsError('No se pudo consultar la documentación almacenada (sin acceso o sin conexión).')
    );
  }, [isOpen, profesional?.id]);

  // UX-7 §6: capa que ya se comporta como diálogo (título y cierre propios) →
  // mismo patrón que el resto: el foco entra, `Escape` cancela, el foco vuelve
  // al origen y `Tab` no se escapa; con diálogos superpuestos sólo manda el de arriba.
  const dialogo = useDialogoAccesible(
    { abierto: isOpen, onCerrar: onClose },
    'Detalle del profesional'
  );

  if (!isOpen) return null;

  const metricas = calcularMetricasProfesional(profesional, trabajos, presupuestos, valoraciones);
  const tipoInfo = TIPO_PROFESIONAL_LABELS[profesional.tipo] || TIPO_PROFESIONAL_LABELS.AUTONOMO;
  const estadoInfo = ESTADO_PROFESIONAL_LABELS[profesional.estado || 'ACTIVO'] || ESTADO_PROFESIONAL_LABELS.ACTIVO;

  const nombreActor = currentUser?.nombre ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim() : undefined;
  const documentosHeredados: DocumentoProfesional[] = profesional.documentos || [];
  const totalDocumentos = docsAlmacenados.length + documentosHeredados.length;

  const handleFileUpload = async () => {
    const file = archivoSeleccionado;
    if (!file || uploadingDoc) return;
    setUploadingDoc(true);
    setUploadError('');
    setUploadInfo('');
    try {
      const { duplicado, documento } = await documentosProfesionales.subir({
        profesionalId: profesional.id,
        tipo: tipoDocSeleccionado,
        archivo: file,
        nombre: nombreDoc.trim() || file.name,
        sustituyeA: sustituyeA || undefined,
        actorNombre: nombreActor,
      });
      setUploadInfo(duplicado
        ? `Este archivo ya constaba almacenado (huella ${documento.sha256.slice(0, 12)}…); no se ha duplicado.`
        : `Documento almacenado en Storage privado. Huella SHA-256 registrada: ${documento.sha256.slice(0, 12)}…`);
      setNombreDoc('');
      setSustituyeA('');
      setArchivoSeleccionado(null);
    } catch (err) {
      // Nunca se presenta como guardado: el registro queda en error/pendiente.
      setUploadError(mensajeDeErrorUsuario(err, 'No se pudo almacenar el documento. NO ha quedado guardado; inténtalo de nuevo con el mismo archivo.'));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDescargar = async (documento: DocumentoProfesionalAlmacenado) => {
    setUploadError('');
    try {
      const resultado = await documentosProfesionales.descargar(profesional.id, documento.id, nombreActor);
      const url = URL.createObjectURL(new Blob([resultado.bytes], { type: resultado.mimeType }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = resultado.nombre;
      anchor.click();
      URL.revokeObjectURL(url);
      setVerificaciones((prev) => ({ ...prev, [documento.id]: 'Huella verificada al descargar' }));
    } catch (err) {
      setUploadError(mensajeDeErrorUsuario(err, 'No se pudo recuperar el documento.'));
    }
  };

  const handleVerificar = async (documento: DocumentoProfesionalAlmacenado) => {
    const resultado = await documentosProfesionales.verificar(profesional.id, documento.id, nombreActor);
    const texto = resultado.estado === 'VERIFICADO'
      ? 'Integridad verificada: el contenido coincide con la huella registrada'
      : resultado.estado === 'OBJETO_AUSENTE'
        ? 'El archivo no existe en Storage'
        : resultado.estado === 'INTEGRIDAD_DISCREPANTE'
          ? 'El contenido NO coincide con la huella registrada'
          : 'No se pudo verificar (sin acceso o sin conexión)';
    setVerificaciones((prev) => ({ ...prev, [documento.id]: texto }));
  };

  const handleEliminar = async (documento: DocumentoProfesionalAlmacenado) => {
    setUploadError('');
    try {
      await documentosProfesionales.eliminar(profesional.id, documento.id, nombreActor);
      setUploadInfo('Documento eliminado; se conserva su traza de auditoría.');
    } catch (err) {
      setUploadError(mensajeDeErrorUsuario(err, 'No se pudo eliminar el documento (requiere ser titular o administración).'));
    }
  };

  return (
    <div
      id="detalle-profesional-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div ref={dialogo.refDialogo} {...dialogo.propsDialogo} className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
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
            aria-label="Cerrar"
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
            Documentación ({totalDocumentos})
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
                  <span>Añadir documento acreditativo (Storage privado con huella SHA-256)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <label htmlFor="campo-tipo-de-documento" className="text-xs font-medium text-slate-600 block mb-1">Tipo de Documento</label>
                    <select
                      value={tipoDocSeleccionado}
                      onChange={(e) => setTipoDocSeleccionado(e.target.value as TipoDocumentoProfesional)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                      id="campo-tipo-de-documento">
                      <option value="SEGURO_RC">Póliza de Seguro de RC</option>
                      <option value="ALTA_IAE">Alta IAE / Autónomos</option>
                      <option value="PREVENCION_RIESGOS">Prevención Riesgos Laborales</option>
                      <option value="CERTIFICADO_CONTRATISTA">Certificado Contratistas (Hacienda)</option>
                      <option value="TITULO_OFICIAL">Título / Carnet Instalador Oficial</option>
                      <option value="OTRO">Otro Documento</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="campo-nombre-descriptivo" className="text-xs font-medium text-slate-600 block mb-1">Nombre Descriptivo</label>
                    <input
                      type="text"
                      placeholder="Ej: Seguro RC 2026"
                      value={nombreDoc}
                      onChange={(e) => setNombreDoc(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                      id="campo-nombre-descriptivo"/>
                  </div>
                  <div>
                    <label htmlFor="campo-archivo-profesional" className="text-xs font-medium text-slate-600 block mb-1">Archivo (PDF / JPG / PNG / WEBP, máx. 20 MB)</label>
                    <input
                      id="campo-archivo-profesional"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={(e) => { setArchivoSeleccionado(e.target.files?.[0] || null); setUploadInfo(''); setUploadError(''); }}
                      disabled={uploadingDoc}
                      className="w-full text-[11px]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleFileUpload}
                    disabled={!archivoSeleccionado || uploadingDoc}
                    className="w-full flex items-center justify-center space-x-1.5 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{uploadingDoc ? 'Almacenando…' : 'Subir y almacenar'}</span>
                  </button>
                </div>
                {docsAlmacenados.some((d) => d.estado === 'DISPONIBLE') && (
                  <div>
                    <label htmlFor="campo-sustituye-a" className="text-xs font-medium text-slate-600 block mb-1">Sustituye explícitamente a (opcional)</label>
                    <select id="campo-sustituye-a" value={sustituyeA} onChange={(e) => setSustituyeA(e.target.value)} className="w-full sm:w-1/2 text-xs p-2 border border-slate-300 rounded-lg bg-white">
                      <option value="">No sustituye a ningún documento</option>
                      {docsAlmacenados.filter((d) => d.estado === 'DISPONIBLE').map((d) => (
                        <option key={d.id} value={d.id}>{d.nombre} (v{d.version})</option>
                      ))}
                    </select>
                  </div>
                )}
                {archivoSeleccionado && !uploadingDoc && (
                  <p className="text-xs text-amber-700" role="status">Seleccionado, pendiente de subir: {archivoSeleccionado.name}. Aún no está almacenado.</p>
                )}
                {uploadInfo && <p className="text-xs text-emerald-700 font-medium" role="status">{uploadInfo}</p>}
                {uploadError && <p className="text-xs text-rose-600 font-medium" role="alert">{uploadError}</p>}
              </div>

              {/* Documentos con almacenamiento autorizado */}
              <div className="space-y-2">
                {docsError && <p className="text-xs text-rose-600" role="alert">{docsError}</p>}
                {docsAlmacenados.map((doc) => {
                  const presentacion = presentarEstadoDocumentoProfesional(doc);
                  const sustituido = docsAlmacenados.some((otro) => otro.sustituyeA === doc.id && otro.estado === 'DISPONIBLE');
                  const tono = presentacion.tono === 'ok' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : presentacion.tono === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200';
                  return (
                    <div key={doc.id} className="p-3.5 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-800">{doc.nombre}</span>
                          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="px-1.5 bg-slate-100 rounded text-slate-700 font-mono text-[10px]">{doc.tipo}</span>
                            <span className={`px-1.5 border rounded text-[10px] font-semibold ${tono}`}>{presentacion.etiqueta}</span>
                            {sustituido && <span className="px-1.5 border rounded text-[10px] bg-slate-100 text-slate-600">Sustituido por una versión posterior</span>}
                            <span>v{doc.version} • {new Date(doc.fechaIncorporacion).toLocaleDateString('es-ES')} por {doc.actorNombre}</span>
                            <span className="font-mono" title={doc.sha256}>SHA-256 {doc.sha256.slice(0, 12)}…</span>
                          </div>
                          {verificaciones[doc.id] && <p className="text-[11px] text-slate-600 mt-0.5" role="status">{verificaciones[doc.id]}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {presentacion.descargable && (
                          <>
                            <button type="button" onClick={() => handleDescargar(doc)} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium rounded-lg">Descargar</button>
                            <button type="button" onClick={() => handleVerificar(doc)} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium rounded-lg">Verificar integridad</button>
                          </>
                        )}
                        {doc.estado !== 'ELIMINADO' && (
                          <button type="button" onClick={() => handleEliminar(doc)} className="px-3 py-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-medium rounded-lg">Eliminar</button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Entradas heredadas (anteriores a P3): no se modifican, sólo se clasifican. */}
                {documentosHeredados.map((doc) => {
                  const clase = clasificarDocumentoProfesionalHeredado(doc);
                  return (
                    <div key={doc.id} className="p-3.5 border border-dashed border-slate-300 rounded-xl flex items-center justify-between bg-slate-50/50">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-slate-100 text-slate-500 rounded-lg">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-700">{doc.nombre}</span>
                          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="px-1.5 bg-slate-100 rounded text-slate-700 font-mono text-[10px]">{doc.tipo}</span>
                            <span className={`px-1.5 border rounded text-[10px] font-semibold ${clase === 'NO_ALMACENADO' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              {clase === 'NO_ALMACENADO' ? 'Registro heredado sin archivo en Storage: vuelve a subirlo' : 'Referencia heredada sin huella: no verificada'}
                            </span>
                            <span>Registrado el {new Date(doc.fechaSubida).toLocaleDateString('es-ES')}</span>
                          </div>
                        </div>
                      </div>
                      {clase === 'REFERENCIA_NO_VERIFICADA' && (
                        <a
                          href={doc.downloadUrl || doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-medium rounded-lg"
                        >
                          <span>Abrir referencia</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  );
                })}

                {totalDocumentos === 0 && (
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
                      {...propsInteraccion(() => onSelectTrabajo && onSelectTrabajo(trabajo))}
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
