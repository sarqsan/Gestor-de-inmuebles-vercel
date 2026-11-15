import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  Building,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Globe,
  Home,
  Image as ImageIcon,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  User,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import {
  UsuarioApp,
  Profesional,
  Inmueble,
  Especialidad,
  ZonaServicio,
  TrabajoProfesional,
  Incidencia,
  EstadoTrabajoProfesional,
  PresupuestoProfesional,
} from '../../types';
import type { EvidenciaTrabajo } from '../profesional/PanelEvidencias';
import {
  ESTADO_TRABAJO_LABELS,
  PRIORIDAD_TRABAJO_LABELS,
  crearItemHistorialTrabajo,
} from '../../utils/profesionalesEngine';
import {
  claveScope,
  subscribeTrabajosProfesionales,
  subscribeIncidencias,
  subscribePresupuestosProfesionales,
  saveTrabajoProfesionalFirestore,
  uploadEvidenciaTrabajoStorage,
  saveIncidenciaFirestore,
  type DataAccessScope,
} from '../../lib/firebase';
import { DetalleTrabajoProfesionalModal } from '../modals/DetalleTrabajoProfesionalModal';
import { PresupuestoProfesionalModal } from '../modals/PresupuestoProfesionalModal';
import { DetallePresupuestoProfesionalModal } from '../modals/DetallePresupuestoProfesionalModal';
import {
  BLOQUES_PANEL,
  ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL,
  clasificarEnBloques,
  puedeAceptarORechazar,
  validarInformeFinalizacion,
  resolverEncargo,
  validarTransicionProfesional,
} from '../../features/profesional/circuitoProfesional';
import { TrabajoProfesionalModal } from '../modals/TrabajoProfesionalModal';
import { propsInteraccion } from '../../accesibilidad/interaccion';
import { confirmar } from '../../feedback/confirmacion';

interface ProfesionalPortalSectionProps {
  currentUser: UsuarioApp;
  profesional?: Profesional | null;
  inmuebles: Inmueble[];
  especialidades: Especialidad[];
  onSaveProfesional: (profesional: Profesional) => Promise<void>;
}

export const ProfesionalPortalSection: React.FC<ProfesionalPortalSectionProps> = ({
  currentUser,
  profesional,
  inmuebles,
  especialidades,
  onSaveProfesional,
}) => {
  const [activeTab, setActiveTab] = useState<
    'ficha' | 'especialidades' | 'zonas' | 'asignaciones' | 'incidencias'
  >('incidencias');

  // Real-time Firestore subscriptions for Work Orders and Incidences
  const [trabajos, setTrabajos] = useState<TrabajoProfesional[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'PENDIENTES' | 'EN_CURSO' | 'FINALIZADOS'>('TODOS');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedTrabajoForModal, setSelectedTrabajoForModal] = useState<TrabajoProfesional | null>(null);
  const [showCrearTrabajoModal, setShowCrearTrabajoModal] = useState(false);
  const [selectedPhotoUrl, setSelectedPhotoUrl] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  // P1 · estado de UI del circuito: avisos de error y modales de presupuesto.
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [showPresupuestoModal, setShowPresupuestoModal] = useState(false);
  const [trabajoParaPresupuesto, setTrabajoParaPresupuesto] = useState<TrabajoProfesional | null>(null);
  const [presupuestoParaEditar, setPresupuestoParaEditar] = useState<PresupuestoProfesional | null>(null);
  const [presupuestoParaVer, setPresupuestoParaVer] = useState<PresupuestoProfesional | null>(null);
  const [presupuestos, setPresupuestos] = useState<PresupuestoProfesional[]>([]);

  // BLOQUE 12 · A-01: portal del profesional. Las reglas conceden `list` por
  // `profesionalId` (trabajos) y `profesionalAsignadoId` (incidencias): antes
  // se pedía la colección completa y las reglas la denegaban.
  const scope = useMemo<DataAccessScope>(
    () => ({
      tipoPerfil: currentUser.tipoPerfil,
      propietarioId: currentUser.propietarioId,
      inmuebleIds: currentUser.inmuebleIds || [],
      profesionalId: profesional?.id || currentUser.profesionalId,
    }),
    [currentUser, profesional?.id]
  );
  const claveDelScope = claveScope(scope);
  useEffect(() => {
    const unsubTrabajos = subscribeTrabajosProfesionales((data) => {
      setTrabajos(data || []);
    }, scope);
    const unsubIncidencias = subscribeIncidencias((data) => {
      setIncidencias(data || []);
    }, scope);
    // P1 §B: el profesional debe ver SUS presupuestos y su historial de versiones.
    // `firestore.rules` ya concede `list` por `profesionalId`; no se amplía nada.
    const unsubPresupuestos = subscribePresupuestosProfesionales((data) => {
      setPresupuestos(data || []);
    }, scope);

    return () => {
      unsubTrabajos();
      unsubIncidencias();
      unsubPresupuestos();
    };
  }, [claveDelScope]);

  // Local state for editing profile
  const [nombreComercial, setNombreComercial] = useState(
    profesional?.nombreComercial || currentUser.nombre || ''
  );
  const [razonSocial, setRazonSocial] = useState(profesional?.razonSocial || '');
  const [cifNif, setCifNif] = useState(profesional?.cifNif || '');
  const [contactoNombre, setContactoNombre] = useState(profesional?.contactoNombre || '');
  const [email, setEmail] = useState(profesional?.email || currentUser.email || '');
  const [telefono, setTelefono] = useState(profesional?.telefono || currentUser.telefono || '');
  const [web, setWeb] = useState(profesional?.web || '');

  // Specialty selection
  const [selectedEspecialidades, setSelectedEspecialidades] = useState<string[]>(
    profesional?.especialidades || ['Fontanería', 'Electricidad']
  );

  // Zones
  const [zonas, setZonas] = useState<ZonaServicio[]>(
    profesional?.zonasServicio || [
      { id: 'z1', provincia: 'Almería', municipio: 'Vera', codigosPostales: ['04620'] },
    ]
  );
  const [nuevaProvincia, setNuevaProvincia] = useState('');
  const [nuevoMunicipio, setNuevoMunicipio] = useState('');

  const [guardadoExito, setGuardadoExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Properties assigned to this professional
  const viviendasAsignadas = inmuebles.filter((i) =>
    profesional?.inmuebleIdsAsignados?.includes(i.id)
  );

  const handleToggleEspecialidad = (nombre: string) => {
    if (selectedEspecialidades.includes(nombre)) {
      setSelectedEspecialidades(selectedEspecialidades.filter((e) => e !== nombre));
    } else {
      setSelectedEspecialidades([...selectedEspecialidades, nombre]);
    }
  };

  const handleAddZona = () => {
    if (!nuevaProvincia.trim()) return;
    const nueva: ZonaServicio = {
      id: `zona_${Date.now()}`,
      provincia: nuevaProvincia.trim(),
      municipio: nuevoMunicipio.trim() || undefined,
    };
    setZonas([...zonas, nueva]);
    setNuevaProvincia('');
    setNuevoMunicipio('');
  };

  const handleRemoveZona = (id: string) => {
    setZonas(zonas.filter((z) => z.id !== id));
  };

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardando(true);
      const baseProf: Profesional = profesional || {
        id: currentUser.profesionalId || `prof_${Date.now()}`,
        usuarioId: currentUser.id,
        tipo: 'AUTONOMO',
        nombreComercial: nombreComercial.trim(),
        especialidades: selectedEspecialidades,
        zonasServicio: zonas,
        activo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const actualizado: Profesional = {
        ...baseProf,
        nombreComercial: nombreComercial.trim(),
        razonSocial: razonSocial.trim() || undefined,
        cifNif: cifNif.trim() || undefined,
        contactoNombre: contactoNombre.trim() || undefined,
        email: email.trim().toLowerCase() || undefined,
        telefono: telefono.trim() || undefined,
        web: web.trim() || undefined,
        especialidades: selectedEspecialidades,
        zonasServicio: zonas,
        updatedAt: new Date().toISOString(),
      };

      await onSaveProfesional(actualizado);
      setGuardadoExito(true);
      setTimeout(() => setGuardadoExito(false), 3000);
    } catch (err) {
      console.error('Error saving professional profile:', err);
    } finally {
      setGuardando(false);
    }
  };

  // Filter jobs for this professional
  const misTrabajos = useMemo(() => {
    return trabajos.filter((t) => {
      if (profesional?.id && t.profesionalId === profesional.id) return true;
      if (profesional?.email && t.profesionalEmail?.toLowerCase() === profesional.email.toLowerCase()) return true;
      if (currentUser.email && t.profesionalEmail?.toLowerCase() === currentUser.email.toLowerCase()) return true;
      if (currentUser.profesionalId && t.profesionalId === currentUser.profesionalId) return true;
      if (profesional?.nombreComercial && t.profesionalNombre?.toLowerCase() === profesional.nombreComercial.toLowerCase()) return true;
      // Fallback: If no professional ID is registered yet or in test profile
      if (!profesional?.id) return true;
      return false;
    });
  }, [trabajos, profesional, currentUser]);

  const trabajosFiltrados = useMemo(() => {
    return misTrabajos.filter((t) => {
      // Estado
      if (filtroEstado === 'PENDIENTES') {
        if (!['PENDIENTE', 'ASIGNADO', 'ASIGNADA', 'BUSCANDO_PROFESIONAL', 'PRESUPUESTO_SOLICITADO', 'PRESUPUESTO_RECIBIDO'].includes(t.estado)) {
          return false;
        }
      } else if (filtroEstado === 'EN_CURSO') {
        if (!['PROGRAMADO', 'ACEPTADO', 'EN_EJECUCION', 'EN_CURSO', 'PENDIENTE_MATERIAL'].includes(t.estado)) {
          return false;
        }
      } else if (filtroEstado === 'FINALIZADOS') {
        if (!['FINALIZADO', 'FINALIZADA', 'CANCELADO', 'CANCELADA'].includes(t.estado)) {
          return false;
        }
      }

      // Búsqueda
      if (searchFilter.trim()) {
        const query = searchFilter.toLowerCase();
        const matches =
          t.titulo.toLowerCase().includes(query) ||
          t.descripcion?.toLowerCase().includes(query) ||
          t.inmuebleDireccion?.toLowerCase().includes(query) ||
          t.categoria?.toLowerCase().includes(query);
        if (!matches) return false;
      }

      return true;
    });
  }, [misTrabajos, filtroEstado, searchFilter]);

  const statsTrabajos = useMemo(() => {
    const total = misTrabajos.length;
    const pendientes = misTrabajos.filter((t) =>
      ['PENDIENTE', 'ASIGNADO', 'ASIGNADA', 'BUSCANDO_PROFESIONAL', 'PRESUPUESTO_SOLICITADO', 'PRESUPUESTO_RECIBIDO'].includes(t.estado)
    ).length;
    const enCurso = misTrabajos.filter((t) =>
      ['PROGRAMADO', 'ACEPTADO', 'EN_EJECUCION', 'EN_CURSO', 'PENDIENTE_MATERIAL'].includes(t.estado)
    ).length;
    const finalizados = misTrabajos.filter((t) =>
      ['FINALIZADO', 'FINALIZADA'].includes(t.estado)
    ).length;

    return { total, pendientes, enCurso, finalizados };
  }, [misTrabajos]);

  /**
   * P1 §A — Aceptar o rechazar un encargo.
   *
   * El motivo del rechazo se pide SIEMPRE: es el único dato que permite al
   * propietario entender qué ha pasado y reasignar. Reutiliza
   * `handleCambiarEstadoTrabajo`, que ya escribe historial, sincroniza la
   * incidencia vinculada y respeta las reglas; no se duplica la escritura.
   */
  /**
   * P1 §C — Sube una evidencia y la registra en el trabajo.
   *
   * La ruta la impone el núcleo (`rutaEvidencia`): siempre bajo
   * `incidencias/{incidenciaId}/{momento}_…`, el único prefijo que el
   * servidor autoriza al profesional asignado. El binario va por el motor
   * mediado por servidor; en el trabajo solo se persiste metadato + URL.
   */
  const handleAdjuntarEvidencia = async (entrada: {
    archivo: File;
    momento: 'ANTES' | 'DURANTE' | 'DESPUES';
    observacion: string;
    ruta: string;
  }): Promise<EvidenciaTrabajo> => {
    const trabajo = selectedTrabajoForModal;
    if (!trabajo) throw new Error('No hay un trabajo abierto.');
    if (!profesional?.id || trabajo.profesionalId !== profesional.id) {
      throw new Error('Solo el profesional asignado puede adjuntar evidencias de este trabajo.');
    }
    if (!trabajo.incidenciaId) {
      throw new Error('Este trabajo no tiene una incidencia vinculada donde guardar evidencias.');
    }

    const { url, storagePath } = await uploadEvidenciaTrabajoStorage(
      entrada.ruta,
      entrada.archivo,
      entrada.archivo.type || 'image/jpeg'
    );

    const adjunto: EvidenciaTrabajo = {
      id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      nombre: entrada.archivo.name,
      url,
      storagePath,
      tipo: entrada.archivo.type.startsWith('image/') ? 'IMAGEN' : 'DOCUMENTO',
      mimeType: entrada.archivo.type,
      tamano: entrada.archivo.size,
      tamanoBytes: entrada.archivo.size,
      fechaSubida: new Date().toISOString(),
      incidenciaId: trabajo.incidenciaId,
      inmuebleId: trabajo.inmuebleId,
      propietarioId: trabajo.propietarioId,
      trabajoId: trabajo.id,
      subidoPor: profesional.nombreComercial || profesional.razonSocial || currentUser.nombre || 'Profesional',
      momentoEvidencia: entrada.momento,
      observacion: entrada.observacion || undefined,
      fechaMomento: new Date().toISOString(),
    };

    const documentos = [...((trabajo.documentos || []) as EvidenciaTrabajo[]), adjunto];
    const actualizado: TrabajoProfesional = {
      ...trabajo,
      documentos,
      historial: [
        ...(trabajo.historial || []),
        {
          id: `h_ev_${Date.now()}`,
          fecha: new Date().toISOString(),
          estado: trabajo.estado,
          usuario: currentUser.nombre || 'Profesional',
          usuarioId: currentUser.id,
          comentario: `Evidencia adjuntada (${entrada.momento.toLowerCase()})${entrada.observacion ? `: ${entrada.observacion}` : ''}`,
        },
      ],
      actualizadoPor: currentUser.nombre || 'Profesional',
      updatedAt: new Date().toISOString(),
    };

    await saveTrabajoProfesionalFirestore(actualizado);
    setSelectedTrabajoForModal(actualizado);
    setTrabajos((prev) => prev.map((t) => (t.id === actualizado.id ? actualizado : t)));
    return adjunto;
  };

  const handleAceptarEncargo = async (trabajo: TrabajoProfesional) => {
    const r = resolverEncargo(
      { estado: trabajo.estado, profesionalId: trabajo.profesionalId },
      profesional?.id,
      'ACEPTAR'
    );
    if (!r.ok || !r.estado) { setError(r.error || 'No se ha podido aceptar el encargo.'); return; }
    setAviso(null);
    await handleCambiarEstadoTrabajo(trabajo, r.estado, 'Encargo aceptado por el profesional');
  };

  const handleRechazarEncargo = async (trabajo: TrabajoProfesional) => {
    // El canal `confirmar` es el sustituto accesible del prompt nativo
    // (UX-7): diálogo con foco gestionado, Escape para cancelar y campo de texto.
    await confirmar({
      titulo: 'Rechazar encargo',
      mensaje: 'El propietario recibirá el rechazo junto con el motivo.',
      detalle: 'El trabajo quedará cerrado y deberá reasignarse.',
      etiquetaConfirmar: 'Rechazar encargo',
      etiquetaCancelar: 'Volver',
      peligroso: true,
      entradaTexto: {
        etiqueta: 'Motivo del rechazo',
        marcador: 'Ej.: no dispongo de maquinaria para este trabajo',
        obligatorio: true,
        errorObligatorio: 'Indica el motivo del rechazo (mínimo 5 caracteres).',
      },
      alConfirmar: async (motivo) => {
        const r = resolverEncargo(
          { estado: trabajo.estado, profesionalId: trabajo.profesionalId },
          profesional?.id,
          'RECHAZAR',
          motivo
        );
        if (!r.ok || !r.estado) { setError(r.error || 'No se ha podido rechazar el encargo.'); return; }
        setAviso(null);
        await handleCambiarEstadoTrabajo(trabajo, r.estado, `Rechazado por el profesional: ${String(motivo || '').trim()}`);
      },
    });
  };

  /** P1 §B — abrir el presupuesto para un trabajo. */
  const handleAbrirPresupuesto = (trabajo: TrabajoProfesional, presupuestoExistente?: PresupuestoProfesional) => {
    setTrabajoParaPresupuesto(trabajo);
    setPresupuestoParaEditar(presupuestoExistente || null);
    setShowPresupuestoModal(true);
  };

  /**
   * P1 §E — Informe de finalización.
   *
   * Se piden observaciones y se exige que el trabajo tenga al menos una
   * evidencia si tiene una incidencia vinculada (donde el servidor autoriza la
   * subida del profesional asignado). Si no tiene incidencia, se avisa pero no
   * se bloquea: hay intervenciones sin soporte fotográfico posible.
   */
  const handleInformarFinalizacion = async (trabajo: TrabajoProfesional) => {
    const informe = validarInformeFinalizacion(
      { estado: trabajo.estado, profesionalId: trabajo.profesionalId },
      profesional?.id
    );
    if (!informe.ok) { setError(informe.error || 'No se puede finalizar este trabajo.'); return; }

    const nEvidencias = Array.isArray(trabajo.fotos) ? trabajo.fotos.length : 0;
    if (informe.exigeEvidencias && trabajo.incidenciaId && nEvidencias === 0) {
      setError(
        'Antes de finalizar, adjunta al menos una fotografía o documento del trabajo. ' +
        'El propietario tiene que poder revisarlo.'
      );
      return;
    }

    await confirmar({
      titulo: 'Informar de la finalización',
      mensaje: 'El propietario revisará el trabajo y confirmará la finalización.',
      detalle: 'Añade observaciones si quieres explicar lo que se ha hecho.',
      etiquetaConfirmar: 'Finalizar trabajo',
      etiquetaCancelar: 'Volver',
      entradaTexto: {
        etiqueta: 'Observaciones (opcional)',
        marcador: 'Ej.: sustituido el grifo y revisada la presión',
        obligatorio: false,
        valorInicial: trabajo.observaciones || '',
      },
      alConfirmar: async (observaciones) => {
        const obs = String(observaciones || '').trim().slice(0, 2000);
        setAviso(null);
        await handleCambiarEstadoTrabajo(
          trabajo,
          'FINALIZADO',
          obs
            ? `Finalización informada por el profesional: ${obs}`
            : 'Trabajo finalizado por el profesional, pendiente de confirmación del propietario'
        );
        setAviso('Trabajo finalizado. El propietario debe revisarlo y confirmar la finalización.');
      },
    });
  };

  const handleCambiarEstadoTrabajo = async (
    trabajo: TrabajoProfesional,
    nuevoEstado: EstadoTrabajoProfesional,
    observacion?: string
  ) => {
    // P1 §2: el profesional solo puede AÑADIR progreso a SUS trabajos. La
    // comprobación se hace aquí, antes de escribir, para dar un mensaje útil;
    // la autoridad sigue siendo `firestore.rules`, que ya limita el update al
    // profesional asignado. No se amplía ningún permiso.
    const permiso = validarTransicionProfesional(
      { estado: trabajo.estado, profesionalId: trabajo.profesionalId },
      profesional?.id,
      nuevoEstado
    );
    if (!permiso.ok) {
      setError(permiso.mensaje || 'No puedes cambiar el estado de este trabajo.');
      return;
    }
    try {
      setIsUpdatingStatus(true);
      setError(null);
      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : profesional?.nombreComercial || 'Profesional Técnico';

      const nuevoHistorial = [
        ...(trabajo.historial || []),
        crearItemHistorialTrabajo(
          'ESTADO_MODIFICADO',
          usuarioNombre,
          trabajo.estado,
          nuevoEstado,
          observacion || `Actualizado por profesional a ${ESTADO_TRABAJO_LABELS[nuevoEstado]?.label || nuevoEstado}`
        ),
      ];

      const trabajoActualizado: TrabajoProfesional = {
        ...trabajo,
        estado: nuevoEstado,
        historial: nuevoHistorial,
        fechaFinalizacion:
          (nuevoEstado === 'FINALIZADO' || nuevoEstado === 'FINALIZADA')
            ? (trabajo.fechaFinalizacion || new Date().toISOString())
            : trabajo.fechaFinalizacion,
        updatedAt: new Date().toISOString(),
      };

      await saveTrabajoProfesionalFirestore(trabajoActualizado);

      // Sync linked incidence in Firestore
      if (trabajo.incidenciaId) {
        const incVinculada = incidencias.find((i) => i.id === trabajo.incidenciaId);
        if (incVinculada) {
          let nuevoEstadoInc = incVinculada.estado;
          if (nuevoEstado === 'EN_EJECUCION' || nuevoEstado === 'EN_CURSO') nuevoEstadoInc = 'EN_REPARACION';
          if (nuevoEstado === 'FINALIZADO' || nuevoEstado === 'FINALIZADA') nuevoEstadoInc = 'RESUELTA';
          if (nuevoEstado === 'CANCELADO' || nuevoEstado === 'CANCELADA') nuevoEstadoInc = 'CANCELADA';

          const mappedEstadoTrabajo: 'ASIGNADO' | 'PRESUPUESTADO' | 'ACEPTADO' | 'EN_CURSO' | 'FINALIZADO' | 'CANCELADO' =
            (nuevoEstado === 'FINALIZADO' || nuevoEstado === 'FINALIZADA')
              ? 'FINALIZADO'
              : (nuevoEstado === 'EN_EJECUCION' || nuevoEstado === 'EN_CURSO')
              ? 'EN_CURSO'
              : (nuevoEstado === 'CANCELADO' || nuevoEstado === 'CANCELADA')
              ? 'CANCELADO'
              : 'ASIGNADO';

          const incActualizada: Incidencia = {
            ...incVinculada,
            estado: nuevoEstadoInc,
            trabajoProfesional: incVinculada.trabajoProfesional
              ? {
                  ...incVinculada.trabajoProfesional,
                  estadoTrabajo: mappedEstadoTrabajo,
                  costeReal: trabajoActualizado.importeFinal || incVinculada.trabajoProfesional.costeReal,
                  fechaFinalizacion:
                    (nuevoEstado === 'FINALIZADO' || nuevoEstado === 'FINALIZADA')
                      ? new Date().toISOString()
                      : incVinculada.trabajoProfesional.fechaFinalizacion,
                }
              : {
                  profesionalId: trabajo.profesionalId || '',
                  profesionalNombre: trabajo.profesionalNombre || profesional?.nombreComercial || 'Profesional',
                  servicio: trabajo.categoria || 'Mantenimiento',
                  fechaAsignacion: trabajo.fechaAsignacion || new Date().toISOString(),
                  estadoTrabajo: mappedEstadoTrabajo,
                },
            historial: [
              ...(incVinculada.historial || []),
              {
                id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                fecha: new Date().toISOString(),
                usuario: usuarioNombre,
                accion: 'ORDEN_TRABAJO_ESTADO_ACTUALIZADO',
                valorAnterior: trabajo.estado,
                valorNuevo: nuevoEstado,
                observacion: `El profesional actualizó el estado de la orden de trabajo a: ${ESTADO_TRABAJO_LABELS[nuevoEstado]?.label || nuevoEstado}`,
              },
            ],
            updatedAt: new Date().toISOString(),
          };
          await saveIncidenciaFirestore(incActualizada);
        }
      }
    } catch (err) {
      console.error('Error updating work order from professional portal:', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div id="profesional-portal-section" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-slate-900">
                Portal de Servicios y Mantenimiento
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-md">
                PROFESIONAL TÉCNICO
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {profesional?.nombreComercial || currentUser.nombre} · Gestiona tus especialidades técnicas, zonas de cobertura y viviendas asignadas.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500">Viviendas Asignadas</div>
            <div className="text-lg font-bold text-slate-900">{viviendasAsignadas.length}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="flex overflow-x-auto border-b border-slate-200 scrollbar-none px-4">
          {[
            { id: 'ficha', label: 'Mi Ficha y Datos', icon: Building },
            {
              id: 'especialidades',
              label: 'Mis Especialidades',
              icon: Tag,
              count: selectedEspecialidades.length,
            },
            { id: 'zonas', label: 'Mis Zonas de Cobertura', icon: MapPin, count: zonas.length },
            {
              id: 'asignaciones',
              label: 'Viviendas Asignadas',
              icon: Home,
              count: viviendasAsignadas.length,
            },
            {
              id: 'incidencias',
              label: 'Órdenes de Trabajo & Partes',
              icon: Wrench,
              count: misTrabajos.length,
            },
          ].map((tab: { id: string; label: string; icon: any; count?: number; badge?: string }) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-amber-600 text-amber-700 bg-amber-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-sm font-semibold bg-amber-100 text-amber-800">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {guardadoExito && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Cambios guardados con éxito en la plataforma.</span>
            </div>
          )}

          {/* TAB 1: FICHA Y DATOS */}
          {activeTab === 'ficha' && (
            <form onSubmit={handleGuardarPerfil} className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Datos Comerciales y de Facturación
                </h3>
                <p className="text-xs text-slate-500">
                  Esta información será visible para los propietarios al asignarte trabajos.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="campo-nombre-comercial" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nombre Comercial *
                  </label>
                  <input
                    type="text"
                    required
                    value={nombreComercial}
                    onChange={(e) => setNombreComercial(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"

                     id="campo-nombre-comercial"/>
                </div>

                <div>
                  <label htmlFor="campo-razon-social" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Razón Social
                  </label>
                  <input
                    type="text"
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"

                     id="campo-razon-social"/>
                </div>

                <div>
                  <label htmlFor="campo-cif-nif" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    CIF / NIF
                  </label>
                  <input
                    type="text"
                    value={cifNif}
                    onChange={(e) => setCifNif(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"

                     id="campo-cif-nif"/>
                </div>

                <div>
                  <label htmlFor="campo-persona-de-contacto" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Persona de Contacto
                  </label>
                  <input
                    type="text"
                    value={contactoNombre}
                    onChange={(e) => setContactoNombre(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"

                     id="campo-persona-de-contacto"/>
                </div>

                <div>
                  <label htmlFor="campo-email-de-contacto" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Email de Contacto
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"

                     id="campo-email-de-contacto"/>
                </div>

                <div>
                  <label htmlFor="campo-telefono" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"

                     id="campo-telefono"/>
                </div>
              </div>

              <div>
                <label htmlFor="campo-sitio-web" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Sitio Web
                </label>
                <input
                  type="text"
                  value={web}
                  onChange={(e) => setWeb(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"

                   id="campo-sitio-web"/>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {guardando ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: ESPECIALIDADES */}
          {activeTab === 'especialidades' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Especialidades Técnicas que Ofreces ({selectedEspecialidades.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Marca los oficios y servicios en los que estás capacitado para atender reparaciones.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                {especialidades.map((esp) => {
                  const isChecked = selectedEspecialidades.includes(esp.nombre);
                  return (
                    <button
                      key={esp.id}
                      type="button"
                      onClick={() => handleToggleEspecialidad(esp.nombre)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'bg-amber-100 border-amber-400 text-amber-950'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">{esp.nombre}</span>
                      {isChecked && <Check className="w-3.5 h-3.5 text-amber-700 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleGuardarPerfil}
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Actualizar Especialidades
              </button>
            </div>
          )}

          {/* TAB 3: ZONAS */}
          {activeTab === 'zonas' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Zonas Geográficas de Desplazamiento ({zonas.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Provincias y municipios donde prestas servicio de mantenimiento.
                </p>
              </div>

              <div className="space-y-2">
                {zonas.map((z) => (
                  <div
                    key={z.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-bold text-slate-900">{z.provincia}</span>
                      {z.municipio && <span className="text-slate-600">· {z.municipio}</span>}
                    </div>
                    <button
                      aria-label="Eliminar"
                      type="button"
                      onClick={() => handleRemoveZona(z.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Zone */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={nuevaProvincia}
                  onChange={(e) => setNuevaProvincia(e.target.value)}
                  placeholder="Provincia (ej. Almería)"
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  value={nuevoMunicipio}
                  onChange={(e) => setNuevoMunicipio(e.target.value)}
                  placeholder="Municipio (ej. Garrucha)"
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl"
                />
                <button
            aria-label="Añadir"
                  type="button"
                  onClick={handleAddZona}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleGuardarPerfil}
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Guardar Zonas
              </button>
            </div>
          )}

          {/* TAB 4: VIVIENDAS ASIGNADAS */}
          {activeTab === 'asignaciones' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Viviendas Donde Estás Autorizado ({viviendasAsignadas.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Propiedades en las que los propietarios te han designado como técnico de referencia para atender averías y revisiones.
                </p>
              </div>

              {viviendasAsignadas.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <Home className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">No hay viviendas asignadas todavía</div>
                  <p className="text-xs text-slate-500">
                    Los propietarios te asignarán a sus inmuebles cuando requieran tus servicios de mantenimiento.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {viviendasAsignadas.map((inm) => (
                    <div
                      key={inm.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 shadow-xs"
                    >
                      <div className="font-bold text-sm text-slate-900">
                        {inm.alias || inm.direccion}
                      </div>
                      <div className="text-xs text-slate-500">
                        📍 {inm.direccion}, {inm.ciudad}
                      </div>
                      <div className="text-xs text-slate-600 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span>Tipo: {inm.tipoInmueble}</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                          Autorizado
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ÓRDENES DE TRABAJO E INCIDENCIAS */}
          {activeTab === 'incidencias' && (
            <div className="space-y-6">
              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Órdenes</span>
                    <Wrench className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 mt-1">{statsTrabajos.total}</div>
                </div>

                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Pendientes</span>
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-xl font-bold text-amber-900 mt-1">{statsTrabajos.pendientes}</div>
                </div>

                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider">En Ejecución</span>
                    <Sparkles className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-xl font-bold text-blue-900 mt-1">{statsTrabajos.enCurso}</div>
                </div>

                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Finalizadas</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-bold text-emerald-900 mt-1">{statsTrabajos.finalizados}</div>
                </div>
              </div>


              {/* P1 §3 — PANEL DEL CIRCUITO: los seis bloques de la orden.
                  Se calcula con `clasificarEnBloques`, la misma función que las
                  pruebas unitarias, para que la UI y las pruebas no diverjan. */}
              {(() => {
                const bloques = clasificarEnBloques(
                  trabajos.map((t) => ({
                    estado: t.estado,
                    profesionalId: t.profesionalId,
                    evidencias: Array.isArray(t.fotos) ? t.fotos.length : 0,
                    presupuestos: presupuestos
                      .filter((p) => p.trabajoId === t.id)
                      .map((p) => ({ estado: p.estado })),
                  })),
                  profesional?.id
                );
                const total = BLOQUES_PANEL.reduce((n, b) => n + bloques[b.id].length, 0);
                if (!total) return null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {BLOQUES_PANEL.map((b) => {
                      const n = bloques[b.id].length;
                      const alerta = (b.id === 'PENDIENTES_ACEPTAR' || b.id === 'PENDIENTES_DOCUMENTAR') && n > 0;
                      return (
                        <div
                          key={b.id}
                          title={b.descripcion}
                          className={`p-3 rounded-xl border ${
                            alerta ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className={`text-[10px] font-bold uppercase tracking-wider ${
                            alerta ? 'text-amber-800' : 'text-slate-500'
                          }`}>
                            {b.titulo}
                          </div>
                          <div className={`text-xl font-bold mt-0.5 ${
                            alerta ? 'text-amber-900' : 'text-slate-800'
                          }`}>
                            {n}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex items-start justify-between gap-3">
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-900 font-bold cursor-pointer">Cerrar</button>
                </div>
              )}
              {aviso && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800">
                  {aviso}
                </div>
              )}

              {/* Filters & Actions Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                  {(
                    [
                      { id: 'TODOS', label: 'Todas', count: statsTrabajos.total },
                      { id: 'PENDIENTES', label: 'Pendientes', count: statsTrabajos.pendientes },
                      { id: 'EN_CURSO', label: 'En Ejecución', count: statsTrabajos.enCurso },
                      { id: 'FINALIZADOS', label: 'Finalizadas', count: statsTrabajos.finalizados },
                    ] as const
                  ).map((filtro) => (
                    <button
                      key={filtro.id}
                      onClick={() => setFiltroEstado(filtro.id)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                        filtroEstado === filtro.id
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <span>{filtro.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                          filtroEstado === filtro.id
                            ? 'bg-amber-800 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {filtro.count}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por título, dirección..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <button
                    onClick={() => setShowCrearTrabajoModal(true)}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nueva Orden</span>
                  </button>
                </div>
              </div>

              {/* Work Order Cards List */}
              {trabajosFiltrados.length > 0 ? (
                <div className="space-y-4">
                  {trabajosFiltrados.map((trab) => {
                    const estInfo = ESTADO_TRABAJO_LABELS[trab.estado] || ESTADO_TRABAJO_LABELS.PENDIENTE;
                    const prioInfo = PRIORIDAD_TRABAJO_LABELS[trab.prioridad] || PRIORIDAD_TRABAJO_LABELS.NORMAL;
                    const incAsociada = incidencias.find((i) => i.id === trab.incidenciaId);

                    return (
                      <div
                        key={trab.id}
                        className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-amber-300 transition-all space-y-4"
                      >
                        {/* Header: Title, Badges, Category */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 pb-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-slate-900">{trab.titulo}</h3>
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${estInfo.badgeClass}`}>
                                {estInfo.label}
                              </span>
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${prioInfo.badgeClass}`}>
                                {prioInfo.label}
                              </span>
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {trab.categoria}
                              </span>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                <span>{trab.inmuebleDireccion || 'Vivienda'}</span>
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                <span>Solicitado: {new Date(trab.fechaSolicitud).toLocaleDateString('es-ES')}</span>
                              </span>
                              {trab.importeEstimado !== undefined && (
                                <span className="font-semibold text-slate-700">
                                  Presupuesto: {trab.importeEstimado.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <button
                              onClick={() => setSelectedTrabajoForModal(trab)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver Ficha Completa</span>
                            </button>
                          </div>
                        </div>

                        {/* P1 · CIRCUITO DE TRABAJO — acciones del profesional.
                            Solo aparecen cuando el estado REAL lo permite; la
                            comprobación se repite en el manejador y en las reglas. */}
                        {(puedeAceptarORechazar({ estado: trab.estado, profesionalId: trab.profesionalId }, profesional?.id)
                          || ['ACEPTADO', 'PROGRAMADO', 'EN_EJECUCION', 'EN_CURSO'].includes(trab.estado)) && (
                          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                            {puedeAceptarORechazar({ estado: trab.estado, profesionalId: trab.profesionalId }, profesional?.id) && (
                              <>
                                <button
                                  onClick={() => handleAceptarEncargo(trab)}
                                  disabled={isUpdatingStatus}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Aceptar encargo</span>
                                </button>
                                <button
                                  onClick={() => handleRechazarEncargo(trab)}
                                  disabled={isUpdatingStatus}
                                  className="px-3 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Rechazar</span>
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleAbrirPresupuesto(
                                trab,
                                presupuestos.find((p) => p.trabajoId === trab.id)
                              )}
                              className="px-3 py-1.5 bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>{presupuestos.some((p) => p.trabajoId === trab.id) ? 'Ver / editar presupuesto' : 'Preparar presupuesto'}</span>
                            </button>
                            {presupuestos.find((p) => p.trabajoId === trab.id) && (
                              <button
                                onClick={() => {
                                  const p = presupuestos.find((x) => x.trabajoId === trab.id);
                                  if (p) setPresupuestoParaVer(p);
                                }}
                                className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                              >
                                Historial de versiones
                              </button>
                            )}
                          </div>
                        )}

                        {/* Scope description */}
                        {trab.descripcion && (
                          <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/60 leading-relaxed">
                            <span className="font-bold text-slate-800 block mb-0.5">Descripción de la Intervención:</span>
                            <p className="whitespace-pre-line">{trab.descripcion}</p>
                          </div>
                        )}

                        {/* Associated Incident Card if linked */}
                        {incAsociada && (
                          <div className="p-3.5 bg-blue-50/50 border border-blue-200/70 rounded-xl space-y-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                                <AlertTriangle className="w-4 h-4 text-blue-600" />
                                <span>Incidencia Origen: {incAsociada.titulo}</span>
                              </div>
                              <span className="text-[11px] text-blue-700 font-medium">
                                Reportada: {new Date(incAsociada.fechaCreacion).toLocaleDateString('es-ES')}
                              </span>
                            </div>

                            {incAsociada.inquilinoNombre && (
                              <div className="flex items-center justify-between text-xs text-blue-900 pt-1">
                                <div className="flex items-center gap-2">
                                  <User className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Inquilino: <strong className="text-slate-900">{incAsociada.inquilinoNombre}</strong></span>
                                </div>
                                {incAsociada.inquilinoTelefono && (
                                  <a
                                    href={`tel:${incAsociada.inquilinoTelefono}`}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1 transition-colors"
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>Llamar al Inquilino</span>
                                  </a>
                                )}
                              </div>
                            )}

                            {/* Photographs of the damage */}
                            {incAsociada.fotografias && incAsociada.fotografias.length > 0 && (
                              <div className="pt-2 border-t border-blue-200/50">
                                <span className="text-[11px] font-bold text-slate-700 block mb-1.5 flex items-center gap-1">
                                  <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                                  <span>Fotografías del parte de avería ({incAsociada.fotografias.length}):</span>
                                </span>
                                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                  {incAsociada.fotografias.map((foto) => (
                                    <div
                                      {...propsInteraccion(() => setSelectedPhotoUrl(foto.url), `Ampliar foto ${foto.nombre}`)}
                                      key={foto.id}
                                      onClick={() => setSelectedPhotoUrl(foto.url)}
                                      className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-300 shrink-0 cursor-pointer group shadow-2xs hover:border-blue-500 transition-all"
                                      title="Clic para ampliar fotografía"
                                    >
                                      <img
                                        src={foto.url}
                                        alt={foto.nombre || 'Foto avería'}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        referrerPolicy="no-referrer"
                                      />
                                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                        <Eye className="w-4 h-4" />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Execution Workflow Bar */}
                        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                              Avance del Trabajo:
                            </span>

                            {/* Contextual Action Buttons */}
                            {['PENDIENTE', 'ASIGNADO', 'ASIGNADA', 'BUSCANDO_PROFESIONAL', 'ACEPTADO'].includes(trab.estado) && (
                              <button
                                disabled={isUpdatingStatus}
                                onClick={() => handleCambiarEstadoTrabajo(trab, 'PROGRAMADO', 'Visita técnica programada por el profesional')}
                                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                <span>Programar Visita</span>
                              </button>
                            )}

                            {['PENDIENTE', 'ASIGNADO', 'ASIGNADA', 'PROGRAMADO', 'ACEPTADO', 'PENDIENTE_MATERIAL'].includes(trab.estado) && (
                              <button
                                disabled={isUpdatingStatus}
                                onClick={() => handleCambiarEstadoTrabajo(trab, 'EN_EJECUCION', 'Inicio de trabajos y reparaciones in situ')}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Iniciar Trabajo</span>
                              </button>
                            )}

                            {trab.estado === 'EN_EJECUCION' && (
                              <button
                                disabled={isUpdatingStatus}
                                onClick={() => handleCambiarEstadoTrabajo(trab, 'PENDIENTE_MATERIAL', 'Trabajo en pausa a la espera de repuesto o material')}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>Pausa por Material</span>
                              </button>
                            )}

                            {['EN_EJECUCION', 'PENDIENTE_MATERIAL'].includes(trab.estado) && (
                              <button
                                disabled={isUpdatingStatus}
                                onClick={() => handleInformarFinalizacion(trab)}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Finalizar Trabajo</span>
                              </button>
                            )}
                          </div>

                          {/* Quick selector for any state */}
                          <div className="flex items-center gap-2 self-end sm:self-auto">
                            <span className="text-[11px] text-slate-400 font-semibold">Cambiar Estado:</span>
                            {/* P1 §2: el profesional NO puede fijar cualquier estado
                                (ni ASIGNADO, ni CANCELADO, ni volver a PENDIENTE).
                                El selector ofrece exactamente lo que la regla y el
                                núcleo del circuito permiten: la UI no puede ofrecer
                                más de lo que el backend acepta. */}
                            <select
                              value={ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL.includes(trab.estado) ? trab.estado : ''}
                              disabled={isUpdatingStatus}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                handleCambiarEstadoTrabajo(trab, e.target.value as EstadoTrabajoProfesional);
                              }}
                              className="px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
                            >
                              <option value="">
                                {ESTADO_TRABAJO_LABELS[trab.estado]?.label || trab.estado}
                              </option>
                              {ESTADOS_QUE_PUEDE_FIJAR_EL_PROFESIONAL
                                .filter((estado) => estado !== trab.estado)
                                .map((estado) => (
                                  <option key={estado} value={estado}>
                                    {ESTADO_TRABAJO_LABELS[estado]?.label || estado}
                                  </option>
                                ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <Wrench className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">
                    No hay órdenes de trabajo en esta sección
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {filtroEstado !== 'TODOS' || searchFilter
                      ? 'No se encontraron resultados con los filtros actuales.'
                      : 'Crea una orden de trabajo o atiende incidencias asignadas a tu especialidad.'}
                  </p>
                  <button
                    onClick={() => setShowCrearTrabajoModal(true)}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Orden de Trabajo</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Detalle de Trabajo Profesional */}
      {selectedTrabajoForModal && (
        <DetalleTrabajoProfesionalModal
          isOpen={true}
          onClose={() => setSelectedTrabajoForModal(null)}
          trabajo={selectedTrabajoForModal}
          inmueble={inmuebles.find((inm) => inm.id === selectedTrabajoForModal.inmuebleId) || null}
          profesionales={profesional ? [profesional] : []}
          presupuestos={presupuestos.filter((p) => p.trabajoId === selectedTrabajoForModal.id)}
          currentUser={currentUser}
          incidenciaVinculada={incidencias.find((inc) => inc.id === selectedTrabajoForModal.incidenciaId) || null}
          onAdjuntarEvidencia={handleAdjuntarEvidencia}
          onCrearPresupuesto={(t) => handleAbrirPresupuesto(t, presupuestos.find((p) => p.trabajoId === t.id))}
          onVerPresupuesto={(p) => setPresupuestoParaVer(p)}
        />
      )}

      {/* P1 §B — Modal de presupuesto: reutiliza el modal del propietario.
          Las reglas ya permiten al profesional crear y actualizar SUS
          presupuestos (`presupuestos_profesionales`, rama isProfesionalRole). */}
      <PresupuestoProfesionalModal
        isOpen={showPresupuestoModal}
        onClose={() => { setShowPresupuestoModal(false); setPresupuestoParaEditar(null); setTrabajoParaPresupuesto(null); }}
        presupuestoParaEditar={presupuestoParaEditar}
        trabajos={trabajos}
        profesionales={profesional ? [profesional] : []}
        inmuebles={inmuebles}
        currentUser={currentUser}
        trabajoPreseleccionado={trabajoParaPresupuesto}
        onSaveSuccess={() => { setShowPresupuestoModal(false); setPresupuestoParaEditar(null); }}
      />

      {/* P1 §B — Detalle del presupuesto e historial de versiones */}
      {presupuestoParaVer && (
        <DetallePresupuestoProfesionalModal
          isOpen={true}
          onClose={() => setPresupuestoParaVer(null)}
          presupuesto={presupuestoParaVer}
          trabajos={trabajos}
          profesionales={profesional ? [profesional] : []}
          inmuebles={inmuebles}
          currentUser={currentUser}
          onEditarPresupuesto={(p) => {
            setPresupuestoParaVer(null);
            handleAbrirPresupuesto(
              trabajos.find((t) => t.id === p.trabajoId) as TrabajoProfesional,
              p
            );
          }}
        />
      )}

      {/* Modal: Crear Nueva Orden de Trabajo */}
      {showCrearTrabajoModal && (
        <TrabajoProfesionalModal
          isOpen={true}
          onClose={() => setShowCrearTrabajoModal(false)}
          inmuebles={inmuebles}
          incidencias={incidencias}
          profesionales={profesional ? [profesional] : []}
          currentUser={currentUser}
          profesionalPreseleccionadoId={profesional?.id}
          onSaveSuccess={() => {
            setShowCrearTrabajoModal(false);
          }}
        />
      )}

      {/* Lightbox: Ampliar Fotografía de Avería */}
      {selectedPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedPhotoUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
            <button
              aria-label="Cerrar"
              onClick={() => setSelectedPhotoUrl(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={selectedPhotoUrl}
              alt="Fotografía de daño ampliada"
              className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
