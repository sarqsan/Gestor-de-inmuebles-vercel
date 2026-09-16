import React, { useState, useEffect, useRef } from 'react';
import {
  Incidencia,
  Inmueble,
  Propietario,
  ContratoFormalizacion,
  CategoriaIncidencia,
  PrioridadIncidencia,
  OrigenIncidencia,
  UsuarioApp,
  AdjuntoIncidencia,
} from '../../types';
import {
  CATEGORIAS_INCIDENCIA_LABELS,
  PRIORIDADES_INCIDENCIA_LABELS,
  crearHistorialItem,
} from '../../utils/incidenciasEngine';
import { uploadIncidenciaAdjuntoStorage } from '../../lib/firebase';
import {
  X,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  FileText,
  Trash2,
  Building2,
  User,
  Phone,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface IncidenciaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (incidencia: Incidencia) => Promise<void>;
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  contratos: ContratoFormalizacion[];
  currentUser?: UsuarioApp;
  incidenciaToEdit?: Incidencia | null;
  defaultInmuebleId?: string;
}

export const IncidenciaModal: React.FC<IncidenciaModalProps> = ({
  isOpen,
  onClose,
  onSave,
  inmuebles,
  propietarios,
  contratos,
  currentUser,
  incidenciaToEdit,
  defaultInmuebleId,
}) => {
  const [inmuebleId, setInmuebleId] = useState<string>('');
  const [titulo, setTitulo] = useState<string>('');
  const [descripcion, setDescripcion] = useState<string>('');
  const [categoria, setCategoria] = useState<CategoriaIncidencia>('AGUA');
  const [prioridad, setPrioridad] = useState<PrioridadIncidencia>('NORMAL');
  const [origen, setOrigen] = useState<OrigenIncidencia>('INQUILINO');
  const [observaciones, setObservaciones] = useState<string>('');
  
  // Archivos adjuntos
  const [fotografias, setFotografias] = useState<AdjuntoIncidencia[]>([]);
  const [documentos, setDocumentos] = useState<AdjuntoIncidencia[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (incidenciaToEdit) {
        setInmuebleId(incidenciaToEdit.inmuebleId || '');
        setTitulo(incidenciaToEdit.titulo || '');
        setDescripcion(incidenciaToEdit.descripcion || '');
        setCategoria(incidenciaToEdit.categoria || 'AGUA');
        setPrioridad(incidenciaToEdit.prioridad || 'NORMAL');
        setOrigen(incidenciaToEdit.origen || 'INQUILINO');
        setObservaciones(incidenciaToEdit.observaciones || '');
        setFotografias(incidenciaToEdit.fotografias || []);
        setDocumentos(incidenciaToEdit.documentos || []);
      } else {
        const initialInm = defaultInmuebleId || (inmuebles.length > 0 ? inmuebles[0].id : '');
        setInmuebleId(initialInm);
        setTitulo('');
        setDescripcion('');
        setCategoria('AGUA');
        setPrioridad('NORMAL');
        setOrigen(currentUser?.tipoPerfil === 'PROPIETARIO' ? 'PROPIETARIO' : 'INQUILINO');
        setObservaciones('');
        setFotografias([]);
        setDocumentos([]);
      }
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, incidenciaToEdit, defaultInmuebleId, inmuebles, currentUser]);

  if (!isOpen) return null;

  const selectedInmueble = inmuebles.find((i) => i.id === inmuebleId);
  // Buscar contrato activo para asociar inquilino automáticamente
  const activeContract = contratos.find(
    (c) => c.inmuebleId === inmuebleId && (c.estado === 'ACTIVO' || c.estado === 'FIRMADO' || c.estado === 'PENDIENTE_FIRMA')
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
    setErrorMsg('');

    try {
      const tempIncidenciaId = incidenciaToEdit?.id || `inc_${Date.now()}`;
      const newPhotos: AdjuntoIncidencia[] = [];
      const newDocs: AdjuntoIncidencia[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isImage = file.type.startsWith('image/');
        const isDoc = file.type.includes('pdf') || file.type.includes('word') || file.type.includes('text');
        const tipo: 'imagen' | 'documento' = isImage ? 'imagen' : 'documento';

        const downloadUrl = await uploadIncidenciaAdjuntoStorage(
          tempIncidenciaId,
          file,
          file.name,
          tipo
        );

        const adjunto: AdjuntoIncidencia = {
          id: `adj_${Date.now()}_${i}`,
          incidenciaId: tempIncidenciaId,
          inmuebleId,
          propietarioId: selectedInmueble?.datosFiscales?.propietarioId,
          nombre: file.name,
          tipo,
          mimeType: file.type,
          url: downloadUrl,
          storagePath: `incidencias/${tempIncidenciaId}/${file.name}`,
          tamanoBytes: file.size,
          fechaSubida: new Date().toISOString(),
          subidoPor: currentUser?.nombre || 'Usuario',
        };

        if (isImage) {
          newPhotos.push(adjunto);
        } else {
          newDocs.push(adjunto);
        }
      }

      setFotografias((prev) => [...prev, ...newPhotos]);
      setDocumentos((prev) => [...prev, ...newDocs]);
    } catch (err: any) {
      console.error('Error subiendo adjunto:', err);
      setErrorMsg('No se pudo subir uno o varios archivos. Inténtelo de nuevo.');
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = (id: string) => {
    setFotografias((prev) => prev.filter((p) => p.id !== id));
  };

  const handleRemoveDoc = (id: string) => {
    setDocumentos((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inmuebleId) {
      setErrorMsg('Debe seleccionar un inmueble.');
      return;
    }
    if (!titulo.trim()) {
      setErrorMsg('Debe indicar un título descriptivo para la incidencia.');
      return;
    }
    if (!descripcion.trim()) {
      setErrorMsg('Por favor, describa detalladamente el desperfecto.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const propId = selectedInmueble?.datosFiscales?.propietarioId || 'prop_general';
      const now = new Date().toISOString();
      const userName = currentUser?.nombre || 'Administrador';

      let baseIncidencia: Incidencia;

      if (incidenciaToEdit) {
        baseIncidencia = {
          ...incidenciaToEdit,
          inmuebleId,
          inmuebleDireccion: selectedInmueble?.direccion || '',
          inmuebleCiudad: selectedInmueble?.ciudad || '',
          propietarioId: propId,
          contratoId: activeContract?.id || incidenciaToEdit.contratoId,
          inquilinoId: activeContract?.inquilinoNombre ? (incidenciaToEdit.inquilinoId || 'cand_auto') : incidenciaToEdit.inquilinoId,
          inquilinoNombre: activeContract?.inquilinoNombre || incidenciaToEdit.inquilinoNombre,
          inquilinoTelefono: activeContract?.inquilinoTelefono || incidenciaToEdit.inquilinoTelefono,
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          categoria,
          prioridad,
          origen,
          fechaActualizacion: now,
          observaciones: observaciones.trim(),
          fotografias,
          documentos,
          actualizadoPor: userName,
          historial: [
            ...(incidenciaToEdit.historial || []),
            crearHistorialItem(
              userName,
              'INCIDENCIA_ACTUALIZADA',
              undefined,
              undefined,
              'Datos generales o archivos modificados.'
            ),
          ],
        };
      } else {
        baseIncidencia = {
          id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          propietarioId: propId,
          inmuebleId,
          inmuebleDireccion: selectedInmueble?.direccion || '',
          inmuebleCiudad: selectedInmueble?.ciudad || '',
          contratoId: activeContract?.id,
          inquilinoId: activeContract ? 'cand_asociado' : undefined,
          inquilinoNombre: activeContract?.inquilinoNombre,
          inquilinoTelefono: activeContract?.inquilinoTelefono,
          titulo: titulo.trim(),
          descripcion: descripcion.trim(),
          categoria,
          prioridad,
          estado: 'ABIERTA',
          origen,
          fechaCreacion: now,
          fechaActualizacion: now,
          responsabilidad: 'PENDIENTE_COMPROBACION',
          responsabilidadNotas: 'Pendiente de inspección o análisis pericial.',
          seguroEstado: 'PENDIENTE_COMPROBACION',
          seguroComprobacionNotas: 'Cotejando con pólizas de seguro del inmueble.',
          viaActuacion: 'PROFESIONAL',
          observaciones: observaciones.trim(),
          creadoPor: userName,
          actualizadoPor: userName,
          fotografias,
          documentos,
          historial: [
            crearHistorialItem(
              userName,
              'INCIDENCIA_CREADA',
              undefined,
              'ABIERTA',
              `Incidencia registrada con prioridad ${prioridad} y categoría ${categoria}.`
            ),
          ],
        };
      }

      await onSave(baseIncidencia);
      onClose();
    } catch (err: any) {
      console.error('Error al guardar incidencia:', err);
      setErrorMsg(err?.message || 'Error al guardar la incidencia.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-blue-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {incidenciaToEdit ? 'Modificar Incidencia' : 'Registrar Nueva Incidencia'}
              </h2>
              <p className="text-xs text-slate-300">
                Averías, desperfectos, inspecciones y órdenes de mantenimiento
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
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Selección de Inmueble */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Vivienda Afectada *
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
                Origen del Reporte *
              </label>
              <select
                value={origen}
                onChange={(e) => setOrigen(e.target.value as OrigenIncidencia)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              >
                <option value="INQUILINO">Inquilino (Arrendatario)</option>
                <option value="PROPIETARIO">Propietario (Arrendador)</option>
                <option value="ADMINISTRADOR">Administrador / Gestor</option>
                <option value="INSPECCION">Inspección Periódica / Entrada-Salida</option>
                <option value="COMUNIDAD">Comunidad de Propietarios</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>

          {/* Tarjeta de inquilino vinculado si existe contrato */}
          {activeContract && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-center justify-between text-xs text-blue-900">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold">{activeContract.inquilinoNombre}</span>
                  <span className="text-blue-600 block text-[11px]">Contrato vigente Nº {activeContract.id.substring(0, 8)}...</span>
                </div>
              </div>
              {activeContract.inquilinoTelefono && (
                <div className="flex items-center gap-1.5 text-blue-700 font-medium">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{activeContract.inquilinoTelefono}</span>
                </div>
              )}
            </div>
          )}

          {/* Título de la Incidencia */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Título descriptivo de la incidencia *
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Fuga de agua en latiguillo del fregadero / Caldera no enciende error E04"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              required
            />
          </div>

          {/* Categoría y Prioridad */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Categoría Técnica *
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value as CategoriaIncidencia)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              >
                {Object.entries(CATEGORIAS_INCIDENCIA_LABELS).map(([catKey, val]) => (
                  <option key={catKey} value={catKey}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Prioridad / Nivel de Urgencia *
              </label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(e.target.value as PrioridadIncidencia)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              >
                {Object.entries(PRIORIDADES_INCIDENCIA_LABELS).map(([prioKey, val]) => (
                  <option key={prioKey} value={prioKey}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Descripción detallada de los daños o hechos *
            </label>
            <textarea
              rows={4}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describa qué ocurre, cuándo comenzó, si afecta a otras estancias o vecinos colindantes, y las medidas provisionales tomadas (ej. corte de agua general, colocación de recipiente, bajada de térmico)..."
              className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
              required
            />
          </div>

          {/* Subida de Fotografías y Documentos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Fotografías y Justificantes (Subida a Firebase Storage)
              </label>
              <span className="text-[11px] text-slate-400">Formatos JPG, PNG, PDF</span>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/40 rounded-xl p-4 text-center cursor-pointer transition-colors"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center justify-center gap-1.5 text-slate-500">
                {uploadingFiles ? (
                  <>
                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                    <span className="text-xs font-medium text-blue-600">Subiendo archivos a Firebase Storage...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-slate-400" />
                    <span className="text-xs font-medium text-slate-700">
                      Haz clic aquí para seleccionar fotos o documentos
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Fotografías del desperfecto, contador, facturas o comunicaciones
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Galería de fotos subidas */}
            {fotografias.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-slate-600 mb-2">Fotos adjuntas ({fotografias.length}):</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {fotografias.map((foto) => (
                    <div key={foto.id} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                      <img
                        src={foto.url}
                        alt={foto.nombre}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(foto.id)}
                        className="absolute top-1 right-1 p-1 bg-red-600 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Eliminar foto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documentos adjuntos */}
            {documentos.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-medium text-slate-600">Documentos adjuntos ({documentos.length}):</p>
                {documentos.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="truncate font-medium text-slate-700">{doc.nombre}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDoc(doc.id)}
                      className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                      title="Eliminar documento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Observaciones internas */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Observaciones Internas del Gestor (Opcional)
            </label>
            <input
              type="text"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Instrucciones para la visita, llaves en conserjería, notas para peritaje..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
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
              disabled={isSubmitting || uploadingFiles}
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
                  <span>{incidenciaToEdit ? 'Actualizar Incidencia' : 'Dar de Alta Incidencia'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
