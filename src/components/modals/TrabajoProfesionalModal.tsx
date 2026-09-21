import React, { useState } from 'react';
import {
  X,
  Briefcase,
  Building2,
  Calendar,
  AlertTriangle,
  Upload,
  User,
  CheckCircle2,
  Plus,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Wrench,
  Tag,
  Clock,
  DollarSign,
} from 'lucide-react';
import {
  TrabajoProfesional,
  Inmueble,
  Incidencia,
  Profesional,
  UsuarioApp,
  TipoTrabajoProfesional,
  EstadoTrabajoProfesional,
  PrioridadIncidencia,
  AdjuntoIncidencia,
} from '../../types';
import {
  ESPECIALIDADES_CATALOGO,
  PRIORIDAD_TRABAJO_LABELS,
  ESTADO_TRABAJO_LABELS,
  coincideUbicacion,
  crearItemHistorialTrabajo,
  buscarProfesionalesCompatibles,
} from '../../utils/profesionalesEngine';
import {
  saveTrabajoProfesionalFirestore,
  uploadTrabajoAdjuntoStorage,
  saveIncidenciaFirestore,
} from '../../lib/firebase';

interface TrabajoProfesionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  trabajoParaEditar?: TrabajoProfesional | null;
  inmuebles: Inmueble[];
  incidencias: Incidencia[];
  profesionales: Profesional[];
  currentUser?: UsuarioApp;
  incidenciaPreseleccionada?: Incidencia | null;
  profesionalPreseleccionadoId?: string;
  onSaveSuccess?: (trabajo: TrabajoProfesional) => void;
}

export const TrabajoProfesionalModal: React.FC<TrabajoProfesionalModalProps> = ({
  isOpen,
  onClose,
  trabajoParaEditar,
  inmuebles,
  incidencias,
  profesionales,
  currentUser,
  incidenciaPreseleccionada,
  profesionalPreseleccionadoId,
  onSaveSuccess,
}) => {
  const isEditing = !!trabajoParaEditar;

  // Initialize values
  const [inmuebleId, setInmuebleId] = useState<string>(
    trabajoParaEditar?.inmuebleId || incidenciaPreseleccionada?.inmuebleId || (inmuebles[0]?.id || '')
  );
  const [incidenciaId, setIncidenciaId] = useState<string>(
    trabajoParaEditar?.incidenciaId || incidenciaPreseleccionada?.id || ''
  );
  const [tipoTrabajo, setTipoTrabajo] = useState<TipoTrabajoProfesional>(
    trabajoParaEditar?.tipoTrabajo || (incidenciaPreseleccionada ? 'REPARACION_INCIDENCIA' : 'MANTENIMIENTO_PREVENTIVO')
  );
  const [categoria, setCategoria] = useState<string>(
    trabajoParaEditar?.categoria || incidenciaPreseleccionada?.categoria || 'FONTANERIA'
  );
  const [titulo, setTitulo] = useState<string>(
    trabajoParaEditar?.titulo ||
      (incidenciaPreseleccionada ? `Reparación: ${incidenciaPreseleccionada.titulo}` : '')
  );
  const [descripcion, setDescripcion] = useState<string>(
    trabajoParaEditar?.descripcion ||
      (incidenciaPreseleccionada ? incidenciaPreseleccionada.descripcion : '')
  );
  const [prioridad, setPrioridad] = useState<PrioridadIncidencia>(
    trabajoParaEditar?.prioridad || incidenciaPreseleccionada?.prioridad || 'NORMAL'
  );
  const [estado, setEstado] = useState<EstadoTrabajoProfesional>(
    trabajoParaEditar?.estado || 'PENDIENTE'
  );
  const [profesionalId, setProfesionalId] = useState<string>(
    trabajoParaEditar?.profesionalId || profesionalPreseleccionadoId || ''
  );
  const [importeEstimado, setImporteEstimado] = useState<string>(
    trabajoParaEditar?.importeEstimado !== undefined ? trabajoParaEditar.importeEstimado.toString() : ''
  );
  const [importeFinal, setImporteFinal] = useState<string>(
    trabajoParaEditar?.importeFinal !== undefined ? trabajoParaEditar.importeFinal.toString() : ''
  );
  const [fechaInicio, setFechaInicio] = useState<string>(
    trabajoParaEditar?.fechaInicio ? trabajoParaEditar.fechaInicio.slice(0, 10) : ''
  );
  const [fechaFinalizacion, setFechaFinalizacion] = useState<string>(
    trabajoParaEditar?.fechaFinalizacion ? trabajoParaEditar.fechaFinalizacion.slice(0, 10) : ''
  );
  const [observaciones, setObservaciones] = useState<string>(trabajoParaEditar?.observaciones || '');

  const [documentos, setDocumentos] = useState<AdjuntoIncidencia[]>(
    trabajoParaEditar?.documentos ||
      (incidenciaPreseleccionada
        ? [
            ...(incidenciaPreseleccionada.fotografias || []),
            ...(incidenciaPreseleccionada.documentos || []),
          ]
        : [])
  );
  const [uploadingFile, setUploadingFile] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const inmuebleSeleccionado = inmuebles.find((i) => i.id === inmuebleId);
  const profesionalSeleccionado = profesionales.find((p) => p.id === profesionalId);

  // Filter incidents for selected property
  const incidenciasDelInmueble = incidencias.filter((inc) => inc.inmuebleId === inmuebleId);

  // Candidatos evaluados por el motor puro de compatibilidad
  const candidatosCompatibles = inmuebleSeleccionado
    ? buscarProfesionalesCompatibles({
        inmueble: inmuebleSeleccionado,
        profesionales,
        categoria,
        servicioRequerido: titulo,
        incluirNoCompatibles: true,
      })
    : profesionales.map((p) => ({
        profesional: p,
        nivel: 'COMPATIBLE_CON_RESERVA' as const,
        cumpleEspecialidad: true,
        cumpleZona: false,
        cumpleEstado: true,
        estadoZona: 'ZONA_NO_DETERMINADA' as const,
        motivo: 'Sin inmueble de referencia',
        detalles: { especialidad: '', zona: '', estado: '' },
      }));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingFile(true);
      setErrorMsg('');
      const tempTrabajoId = trabajoParaEditar?.id || `trabajo_temp_${Date.now()}`;
      const downloadUrl = await uploadTrabajoAdjuntoStorage(tempTrabajoId, file, file.name);

      const nuevoAdjunto: AdjuntoIncidencia = {
        id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        nombre: file.name,
        tipo: file.type.startsWith('image/') ? 'imagen' : 'documento',
        tamano: file.size,
        url: downloadUrl,
        fechaSubida: new Date().toISOString(),
        subidoPor: currentUser?.nombre ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim() : 'Usuario',
      };

      setDocumentos([...documentos, nuevoAdjunto]);
    } catch (err: any) {
      console.error('Error uploading adjunto:', err);
      setErrorMsg('Error al subir el archivo adjunto.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleEliminarAdjunto = (id: string) => {
    setDocumentos(documentos.filter((d) => d.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!titulo.trim()) {
      setErrorMsg('Por favor especifica un título descriptivo para la orden de trabajo.');
      return;
    }
    if (!inmuebleId) {
      setErrorMsg('Por favor selecciona la vivienda o inmueble donde se realizará el trabajo.');
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg('');

      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Gestor Patrimonial';

      const trabajoId =
        trabajoParaEditar?.id || `trab_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Historial tracking
      const historial = [...(trabajoParaEditar?.historial || [])];
      if (!trabajoParaEditar) {
        historial.push(
          crearItemHistorialTrabajo('TRABAJO_CREADO', usuarioNombre, undefined, estado, 'Creación de orden de trabajo')
        );
        if (profesionalId) {
          historial.push(
            crearItemHistorialTrabajo(
              'PROFESIONAL_ASIGNADO',
              usuarioNombre,
              estado,
              estado,
              `Asignado a ${profesionalSeleccionado?.nombreComercial || 'Profesional'}`
            )
          );
        }
      } else if (trabajoParaEditar.estado !== estado) {
        historial.push(
          crearItemHistorialTrabajo(
            'ESTADO_MODIFICADO',
            usuarioNombre,
            trabajoParaEditar.estado,
            estado,
            `Estado modificado a ${ESTADO_TRABAJO_LABELS[estado]?.label || estado}`
          )
        );
      }

      const trabajoFinal: TrabajoProfesional = {
        id: trabajoId,
        propietarioId: inmuebleSeleccionado?.propietarioId || currentUser?.propietarioId || 'prop_default',
        inmuebleId,
        inmuebleDireccion: inmuebleSeleccionado ? `${inmuebleSeleccionado.direccion}, ${inmuebleSeleccionado.ciudad}` : undefined,
        incidenciaId: incidenciaId || undefined,
        tipoTrabajo,
        categoria,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        prioridad,
        estado,
        profesionalId: profesionalId || undefined,
        profesionalNombre: profesionalSeleccionado?.nombreComercial || undefined,
        profesionalTelefono: profesionalSeleccionado?.telefono || undefined,
        profesionalEmail: profesionalSeleccionado?.email || undefined,
        fechaSolicitud: trabajoParaEditar?.fechaSolicitud || new Date().toISOString(),
        fechaAsignacion: profesionalId ? (trabajoParaEditar?.fechaAsignacion || new Date().toISOString()) : undefined,
        fechaInicio: fechaInicio ? new Date(fechaInicio).toISOString() : undefined,
        fechaFinalizacion: fechaFinalizacion ? new Date(fechaFinalizacion).toISOString() : undefined,
        importeEstimado: importeEstimado ? parseFloat(importeEstimado) : undefined,
        importeFinal: importeFinal ? parseFloat(importeFinal) : undefined,
        gastoId: trabajoParaEditar?.gastoId,
        observaciones: observaciones.trim() || undefined,
        creadoPor: trabajoParaEditar?.creadoPor || usuarioNombre,
        actualizadoPor: usuarioNombre,
        documentos,
        historial,
        valoracion: trabajoParaEditar?.valoracion,
        createdAt: trabajoParaEditar?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveTrabajoProfesionalFirestore(trabajoFinal);

      // If tied to an Incidencia, sync work details onto Incidencia
      if (incidenciaId) {
        const incTarget = incidencias.find((i) => i.id === incidenciaId);
        if (incTarget) {
          const mappedEstadoTrabajo: 'ASIGNADO' | 'PRESUPUESTADO' | 'ACEPTADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO' =
            (estado === 'FINALIZADO' || estado === 'FINALIZADA')
              ? 'FINALIZADO'
              : (estado === 'EN_EJECUCION' || estado === 'EN_CURSO')
              ? 'EN_CURSO'
              : (estado === 'CANCELADO' || estado === 'CANCELADA')
              ? 'CANCELADO'
              : 'ASIGNADO';

          const nuevoEstadoInc =
            (estado === 'FINALIZADO' || estado === 'FINALIZADA')
              ? 'RESUELTA'
              : (estado === 'EN_EJECUCION' || estado === 'EN_CURSO')
              ? 'EN_REPARACION'
              : incTarget.estado;

          const costeRealFinal = importeFinal ? parseFloat(importeFinal) : (trabajoParaEditar?.importeFinal || incTarget.trabajoProfesional?.costeReal);

          const incActualizada: Incidencia = {
            ...incTarget,
            estado: nuevoEstadoInc,
            viaActuacion: 'PROFESIONAL',
            profesionalId: profesionalId || incTarget.profesionalId,
            trabajoProfesional: {
              profesionalId: profesionalId || incTarget.trabajoProfesional?.profesionalId || '',
              profesionalNombre: profesionalSeleccionado?.nombreComercial || incTarget.trabajoProfesional?.profesionalNombre || 'Profesional',
              profesionalTelefono: profesionalSeleccionado?.telefono || incTarget.trabajoProfesional?.profesionalTelefono,
              profesionalEmail: profesionalSeleccionado?.email || incTarget.trabajoProfesional?.profesionalEmail,
              especialidad: categoria,
              servicio: categoria,
              fechaAsignacion: profesionalId ? (incTarget.trabajoProfesional?.fechaAsignacion || new Date().toISOString()) : new Date().toISOString(),
              presupuestoEstimado: importeEstimado ? parseFloat(importeEstimado) : incTarget.trabajoProfesional?.presupuestoEstimado,
              costeReal: costeRealFinal,
              gastoId: trabajoParaEditar?.gastoId || incTarget.trabajoProfesional?.gastoId,
              estadoTrabajo: mappedEstadoTrabajo,
              fechaFinalizacion: (estado === 'FINALIZADO' || estado === 'FINALIZADA') ? new Date().toISOString() : incTarget.trabajoProfesional?.fechaFinalizacion,
            },
            historial: [
              ...(incTarget.historial || []),
              {
                id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                fecha: new Date().toISOString(),
                usuario: usuarioNombre,
                accion: trabajoParaEditar ? 'ORDEN_TRABAJO_MODIFICADA' : 'ORDEN_TRABAJO_CREADA',
                valorNuevo: ESTADO_TRABAJO_LABELS[estado]?.label || estado,
                observacion: `Orden de trabajo "${titulo}": ${ESTADO_TRABAJO_LABELS[estado]?.label || estado}${profesionalSeleccionado ? ` (Asignado a ${profesionalSeleccionado.nombreComercial})` : ''}`,
              },
            ],
            updatedAt: new Date().toISOString(),
          };
          await saveIncidenciaFirestore(incActualizada);
        }
      }

      if (onSaveSuccess) onSaveSuccess(trabajoFinal);
      onClose();
    } catch (err: any) {
      console.error('Error saving trabajo:', err);
      setErrorMsg(err?.message || 'Error al guardar la orden de trabajo en Firestore.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      id="trabajo-profesional-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-blue-600">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Modificar Orden de Trabajo' : 'Nueva Orden de Trabajo Profesional'}
              </h3>
              <p className="text-xs text-slate-500">
                Gestión de intervenciones técnicas, reparaciones o reformas con profesionales y proveedores
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
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Section 1: Inmueble & Incidencia Vinculada */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Inmueble / Vivienda <span className="text-red-500">*</span>
              </label>
              <select
                value={inmuebleId}
                onChange={(e) => {
                  setInmuebleId(e.target.value);
                  setIncidenciaId(''); // Reset incident if property changes
                }}
                required
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecciona una vivienda...</option>
                {inmuebles.map((inm) => (
                  <option key={inm.id} value={inm.id}>
                    {inm.direccion} ({inm.ciudad})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Incidencia Relacionada <span className="text-slate-400 font-normal">(Opcional)</span>
              </label>
              <select
                value={incidenciaId}
                onChange={(e) => {
                  const selId = e.target.value;
                  setIncidenciaId(selId);
                  const found = incidencias.find((inc) => inc.id === selId);
                  if (found && !titulo) {
                    setTitulo(`Reparación: ${found.titulo}`);
                    setDescripcion(found.descripcion);
                    setCategoria(found.categoria);
                    setPrioridad(found.prioridad);
                  }
                }}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Independiente (Sin incidencia previa)</option>
                {incidenciasDelInmueble.map((inc) => (
                  <option key={inc.id} value={inc.id}>
                    [{inc.categoria}] {inc.titulo} ({inc.estado})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 2: Tipo de Trabajo & Categoría */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tipo de Trabajo</label>
              <select
                value={tipoTrabajo}
                onChange={(e) => setTipoTrabajo(e.target.value as any)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white"
              >
                <option value="REPARACION_INCIDENCIA">Reparación de Avería / Incidencia</option>
                <option value="MANTENIMIENTO_PREVENTIVO">Mantenimiento Preventivo / Revisión</option>
                <option value="REFORMA">Reforma / Acondicionamiento</option>
                <option value="INSPECCION">Inspección Técnica / ITE</option>
                <option value="MEJORA">Mejora de Eficiencia o Confort</option>
                <option value="OTRO">Otro Servicio</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Especialidad Requerida</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
              >
                {ESPECIALIDADES_CATALOGO.map((esp) => (
                  <option key={esp.codigo} value={esp.codigo}>
                    {esp.nombre} - {esp.descripcion.slice(0, 45)}...
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 3: Título & Descripción */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Título del Trabajo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ej: Sustitución de termo eléctrico y reparación de latiguillo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Descripción Detallada del Alcance</label>
              <textarea
                rows={3}
                placeholder="Indica los detalles del trabajo, especificaciones técnicas, piezas a sustituir o instrucciones de acceso..."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Section 4: Prioridad & Estado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nivel de Prioridad</label>
              <div className="grid grid-cols-4 gap-2">
                {(['BAJA', 'NORMAL', 'ALTA', 'URGENTE'] as PrioridadIncidencia[]).map((p) => {
                  const pInfo = PRIORIDAD_TRABAJO_LABELS[p];
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPrioridad(p)}
                      className={`p-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                        prioridad === p
                          ? `${pInfo.badgeClass} ring-2 ring-blue-500 shadow-xs`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pInfo.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Estado del Trabajo</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as any)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
              >
                {Object.entries(ESTADO_TRABAJO_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 5: Asignación de Profesional */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Profesional o Empresa Asignada
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <select
                  value={profesionalId}
                  onChange={(e) => setProfesionalId(e.target.value)}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white"
                >
                  <option value="">Sin profesional asignado (Buscando presupuesto)</option>
                  {candidatosCompatibles.map((res) => {
                    const prof = res.profesional;
                    const badgeTxt =
                      res.nivel === 'COMPATIBLE'
                        ? '✅ Compatible'
                        : res.nivel === 'COMPATIBLE_CON_RESERVA'
                        ? '⚠️ Con Reserva'
                        : '❌ No Compatible';
                    return (
                      <option key={prof.id} value={prof.id}>
                        {badgeTxt} — {prof.nombreComercial} ({prof.tipo})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Importe Estimado (€)</label>
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    €
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Importe estimado (ej: 180.00)"
                    value={importeEstimado}
                    onChange={(e) => setImporteEstimado(e.target.value)}
                    className="w-full text-xs pl-7 p-2.5 border border-slate-300 rounded-xl bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200/80">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 block">Coste Real Liquidado (€)</label>
                  {importeEstimado && !importeFinal && (
                    <button
                      type="button"
                      onClick={() => setImporteFinal(importeEstimado)}
                      className="text-[11px] text-blue-600 hover:underline font-semibold"
                    >
                      Copiar estimado
                    </button>
                  )}
                </div>
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400 text-xs">
                    €
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Coste real final (ej: 175.50)"
                    value={importeFinal}
                    onChange={(e) => setImporteFinal(e.target.value)}
                    className="w-full text-xs pl-7 p-2.5 border border-emerald-300 bg-emerald-50/30 rounded-xl focus:ring-2 focus:ring-emerald-500 font-semibold text-emerald-900"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Importe que se utilizará para registrar el gasto de reparación contable al finalizar.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Estado de la Orden</label>
                <select
                  value={estado}
                  onChange={(e) => {
                    const nuevo = e.target.value as EstadoTrabajoProfesional;
                    setEstado(nuevo);
                    if ((nuevo === 'FINALIZADO' || nuevo === 'FINALIZADA') && !fechaFinalizacion) {
                      setFechaFinalizacion(new Date().toISOString().slice(0, 10));
                    }
                  }}
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white font-semibold"
                >
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="BUSCANDO_PROFESIONAL">BUSCANDO PROFESIONAL</option>
                  <option value="ASIGNADO">ASIGNADO</option>
                  <option value="PRESUPUESTO_SOLICITADO">PRESUPUESTO SOLICITADO</option>
                  <option value="ACEPTADO">ACEPTADO</option>
                  <option value="PROGRAMADO">PROGRAMADO</option>
                  <option value="EN_EJECUCION">EN EJECUCIÓN</option>
                  <option value="PENDIENTE_MATERIAL">PENDIENTE MATERIAL</option>
                  <option value="FINALIZADO">✓ FINALIZADO</option>
                  <option value="CANCELADO">CANCELADO</option>
                </select>
              </div>
            </div>

            {profesionalSeleccionado && (
              <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900">{profesionalSeleccionado.nombreComercial}</span>
                  <span className="text-slate-500 ml-2">
                    {profesionalSeleccionado.telefono || profesionalSeleccionado.email || 'Sin contacto registrado'}
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-semibold text-[11px]">
                  {profesionalSeleccionado.estado || 'ACTIVO'}
                </span>
              </div>
            )}
          </div>

          {/* Section 6: Fechas Previstas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Fecha Prevista de Inicio</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Fecha Límite / Finalización</label>
              <input
                type="date"
                value={fechaFinalizacion}
                onChange={(e) => setFechaFinalizacion(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white"
              />
            </div>
          </div>

          {/* Section 7: Documentos y Fotografías Adjuntas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 block">Fotografías o Informes Técnicos</label>
              <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingFile ? 'Subiendo...' : 'Adjuntar Foto / PDF'}</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={handleFileUpload}
                  disabled={uploadingFile}
                  className="hidden"
                />
              </label>
            </div>

            {documentos.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {documentos.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="truncate font-medium text-slate-700">{doc.nombre}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleEliminarAdjunto(doc.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                Sin documentos adjuntos a esta orden técnica.
              </div>
            )}
          </div>

          {/* Section 8: Observaciones */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Notas Internas y Observaciones</label>
            <input
              type="text"
              placeholder="Ej: El profesional contactará primero al inquilino para confirmar la hora de entrada"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
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
              disabled={guardando || uploadingFile}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              {guardando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isEditing ? 'Guardar Cambios' : 'Crear Orden de Trabajo'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
