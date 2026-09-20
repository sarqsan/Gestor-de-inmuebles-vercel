import React, { useState, useEffect, useRef } from 'react';
import {
  PolizaSeguro,
  Inmueble,
  Propietario,
  UsuarioApp,
  DocumentoRenovacionPoliza,
  ComparacionPoliza,
  DatosExtraidosRenovacion,
  TipoDocumentoPoliza,
} from '../../types';
import {
  ESTADO_RENOVACION_LABELS,
  TIPO_POLIZA_LABELS,
  calcularDiasRestantes,
  obtenerNivelAlerta,
  obtenerTextoDiasRestantes,
  compararPolizas,
  crearHistorialPolizaItem,
  obtenerCadenaHistorialPoliza,
  validarDatosExtraidos,
} from '../../utils/segurosEngine';
import { PolizaComparacionView } from '../polizas/PolizaComparacionView';
import { PolizaHistorialTimeline } from '../polizas/PolizaHistorialTimeline';
import {
  X,
  ShieldCheck,
  Building2,
  Calendar,
  Euro,
  Phone,
  Mail,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Upload,
  Trash2,
  History,
  Scale,
  Sparkles,
  Eye,
  Edit,
  Plus,
  FileCheck,
  TrendingUp,
} from 'lucide-react';

interface DetallePolizaModalProps {
  isOpen: boolean;
  onClose: () => void;
  poliza: PolizaSeguro;
  todasPolizas: PolizaSeguro[];
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  currentUser?: UsuarioApp;
  onSave: (poliza: PolizaSeguro) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onEdit?: (poliza: PolizaSeguro) => void;
  onCrearNuevaDesdeRenovacion?: (polizaAnterior: PolizaSeguro) => void;
}

type TabType = 'general' | 'renovacion' | 'documentos' | 'extraccion' | 'comparacion' | 'historial';

export const DetallePolizaModal: React.FC<DetallePolizaModalProps> = ({
  isOpen,
  onClose,
  poliza,
  todasPolizas,
  inmuebles,
  propietarios,
  currentUser,
  onSave,
  onDelete,
  onEdit,
  onCrearNuevaDesdeRenovacion,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocType, setSelectedDocType] = useState<TipoDocumentoPoliza>('CARTA_RENOVACION');
  const [extraccionLoading, setExtraccionLoading] = useState(false);
  const [extraccionError, setExtraccionError] = useState('');
  const [datosExtraidosPreview, setDatosExtraidosPreview] = useState<DatosExtraidosRenovacion | null>(
    poliza.datosExtraidosRenovacion || null
  );

  useEffect(() => {
    if (isOpen) {
      setDatosExtraidosPreview(poliza.datosExtraidosRenovacion || null);
      setActiveTab('general');
    }
  }, [isOpen, poliza.id]);

  if (!isOpen) return null;

  const diasRestantes = calcularDiasRestantes(poliza.fechaVencimiento);
  const nivelAlerta = obtenerNivelAlerta(diasRestantes);
  const estadoRenov = poliza.estadoRenovacion || 'VIGENTE';
  const estadoRenovInfo = ESTADO_RENOVACION_LABELS[estadoRenov] || ESTADO_RENOVACION_LABELS.VIGENTE;
  const tipoInfo = TIPO_POLIZA_LABELS[poliza.tipo] || TIPO_POLIZA_LABELS.OTRO;
  const inmueble = inmuebles.find((i) => i.id === poliza.inmuebleId);
  const propietario = propietarios.find((p) => p.id === poliza.propietarioId);
  const polizaAnterior = poliza.polizaAnteriorId ? todasPolizas.find((p) => p.id === poliza.polizaAnteriorId) : undefined;
  const cadenaHistorial = obtenerCadenaHistorialPoliza(poliza.id, todasPolizas);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    try {
      // Try server upload first
      let downloadURL = '';
      let storagePath = `local_${Date.now()}`;

      // Convert to base64 for server upload attempt
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });

      try {
        const res = await fetch('/api/upload-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64: base64,
            filename: file.name,
            mimeType: file.type,
            solicitudId: poliza.id,
            itemId: `poliza_${poliza.id}`,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.url) {
            downloadURL = json.url;
            storagePath = json.storagePath || storagePath;
          }
        }
      } catch (err) {
        console.warn('Server upload fallback:', err);
      }

      if (!downloadURL) {
        downloadURL = base64;
      }

      const nuevoDoc: DocumentoRenovacionPoliza = {
        id: `doc_renov_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        nombre: file.name,
        tipo: selectedDocType,
        url: downloadURL,
        storagePath,
        fechaRecepcion: new Date().toISOString().split('T')[0],
        fechaSubida: new Date().toISOString(),
        subidoPor: currentUser?.nombre || 'Usuario',
        subidoPorId: currentUser?.id,
        tamanoBytes: file.size,
        mimeType: file.type,
      };

      const historialItem = crearHistorialPolizaItem(
        currentUser?.nombre || 'Usuario',
        'DOCUMENTO_ADJUNTADO',
        `Documento ${selectedDocType} adjuntado: ${file.name}`,
        undefined,
        undefined,
        currentUser?.id
      );

      const polizaActualizada: PolizaSeguro = {
        ...poliza,
        documentosRenovacion: [...(poliza.documentosRenovacion || []), nuevoDoc],
        fechaRecepcionRenovacion: nuevoDoc.fechaRecepcion,
        historial: [...(poliza.historial || []), historialItem],
        updatedAt: new Date().toISOString(),
      };

      await onSave(polizaActualizada);
    } catch (err) {
      console.error('Error subiendo documento:', err);
    } finally {
      setIsSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocumento = async (docId: string) => {
    if (!window.confirm('¿Eliminar este documento de renovación?')) return;
    setIsSaving(true);
    try {
      const polizaActualizada: PolizaSeguro = {
        ...poliza,
        documentosRenovacion: (poliza.documentosRenovacion || []).filter((d) => d.id !== docId),
        updatedAt: new Date().toISOString(),
      };
      await onSave(polizaActualizada);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExtraerDatos = async (doc: DocumentoRenovacionPoliza) => {
    setExtraccionLoading(true);
    setExtraccionError('');
    try {
      // Intentar obtener base64 si es data URL o server URL
      let base64Data = '';
      let mimeType = doc.mimeType || 'application/pdf';

      if (doc.url.startsWith('data:')) {
        base64Data = doc.url;
      } else if (doc.url.startsWith('/api/documents/')) {
        // Recuperar del store del servidor
        try {
          const res = await fetch(doc.url);
          if (res.ok) {
            const blob = await res.blob();
            base64Data = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            mimeType = blob.type || mimeType;
          }
        } catch (e) {
          console.warn('Error fetching doc:', e);
        }
      } else {
        // Si es http, no podemos extraer directamente sin proxy, usar simulación
        base64Data = '';
      }

      if (!base64Data) {
        // Fallback simulado consultivo - no modifica automáticamente
        const simulado: DatosExtraidosRenovacion = {
          aseguradora: poliza.aseguradora,
          numeroPoliza: poliza.numeroPoliza,
          fechaInicio: poliza.fechaInicio,
          fechaVencimiento: poliza.fechaVencimiento,
          primaAnual: poliza.primaAnual,
          coberturas: poliza.coberturas,
          franquicia: poliza.franquicia,
          confianza: 'MEDIA',
          fechaExtraccion: new Date().toISOString(),
          confirmadoUsuario: false,
          observaciones: 'Extracción simulada - documento no accesible para IA. Revise manualmente.',
        };
        setDatosExtraidosPreview(simulado);
        return;
      }

      // Llamar a API de análisis documental si existe
      const resp = await fetch('/api/analizar-documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentBase64: base64Data,
          mimeType,
          filename: doc.nombre,
          tipoHint: 'otro',
          candidatoManualData: {
            nombre: poliza.aseguradora,
            ingresosNetos: poliza.primaAnual || 0,
          },
        }),
      });

      if (!resp.ok) throw new Error('Error en análisis IA');

      const data = await resp.json();

      // Mapear a DatosExtraidosRenovacion de forma consultiva
      const extraidos: DatosExtraidosRenovacion = {
        aseguradora: data.datosExtraidos?.empresa?.valor || data.datosExtraidos?.trabajador?.valor || poliza.aseguradora,
        numeroPoliza: data.datosExtraidos?.numeroPoliza?.valor || poliza.numeroPoliza,
        fechaInicio: data.datosExtraidos?.fechaDocumento?.valor || data.datosExtraidos?.periodo?.valor,
        fechaVencimiento: undefined, // intentar parsear si existe
        primaAnual: poliza.primaAnual,
        coberturas: poliza.coberturas,
        confianza: 'MEDIA',
        fechaExtraccion: new Date().toISOString(),
        confirmadoUsuario: false,
        observaciones: data.informacionDetectada || data.resumenDocumento || 'Extracción IA consultiva',
      };

      // Intentar extraer fechas y prima de los campos genéricos
      if (data.datosExtraidos) {
        Object.values(data.datosExtraidos as any).forEach((field: any) => {
          const label = field.label?.toLowerCase() || '';
          const valor = String(field.valor || '');
          if (label.includes('prima') || label.includes('importe')) {
            const num = parseFloat(valor.replace(/[^0-9.,]/g, '').replace(',', '.'));
            if (!isNaN(num)) extraidos.primaAnual = num;
          }
          if (label.includes('vencimiento') || label.includes('validez')) {
            // intentar parsear fecha DD/MM/YYYY
            const match = valor.match(/(\d{2})\/(\d{2})\/(\d{4})/);
            if (match) {
              extraidos.fechaVencimiento = `${match[3]}-${match[2]}-${match[1]}`;
            }
          }
        });
      }

      setDatosExtraidosPreview(extraidos);
    } catch (err: any) {
      console.error(err);
      setExtraccionError(err?.message || 'Error en extracción IA');
    } finally {
      setExtraccionLoading(false);
    }
  };

  const handleConfirmarExtraccion = async () => {
    if (!datosExtraidosPreview) return;
    setIsSaving(true);
    try {
      const confirmado: DatosExtraidosRenovacion = {
        ...datosExtraidosPreview,
        confirmadoUsuario: true,
        confirmadoPor: currentUser?.nombre || 'Usuario',
        fechaConfirmacion: new Date().toISOString(),
      };

      const historialItem = crearHistorialPolizaItem(
        currentUser?.nombre || 'Usuario',
        'COMPARACION_REALIZADA',
        'Datos extraídos de renovación confirmados por usuario',
        undefined,
        confirmado.observaciones,
        currentUser?.id
      );

      const polizaActualizada: PolizaSeguro = {
        ...poliza,
        datosExtraidosRenovacion: confirmado,
        historial: [...(poliza.historial || []), historialItem],
        updatedAt: new Date().toISOString(),
      };

      await onSave(polizaActualizada);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerarComparacion = async () => {
    if (!polizaAnterior) return;
    setIsSaving(true);
    try {
      const comp = compararPolizas(polizaAnterior, poliza);
      comp.generadoPor = currentUser?.nombre || 'Sistema';
      comp.generadoPorId = currentUser?.id;

      const historialItem = crearHistorialPolizaItem(
        currentUser?.nombre || 'Sistema',
        'COMPARACION_REALIZADA',
        `Comparación entre ${polizaAnterior.numeroPoliza} y ${poliza.numeroPoliza}`,
        `Δ ${comp.diferenciaAbsoluta ?? 0}€ (${comp.variacionPorcentual ?? 0}%)`,
        undefined,
        currentUser?.id
      );

      const polizaActualizada: PolizaSeguro = {
        ...poliza,
        comparacionUltima: comp,
        comparacionesHistorial: [...(poliza.comparacionesHistorial || []), comp],
        historial: [...(poliza.historial || []), historialItem],
        updatedAt: new Date().toISOString(),
      };

      await onSave(polizaActualizada);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-6 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1.5 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-600 text-white border border-blue-500">
                {tipoInfo.label}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${estadoRenovInfo.badgeClass}`}>
                {estadoRenovInfo.label}
              </span>
              {nivelAlerta !== null && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    nivelAlerta === -1 || nivelAlerta === 0 || nivelAlerta === 15
                      ? 'bg-rose-100 text-rose-700 border-rose-300'
                      : nivelAlerta === 30
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-blue-100 text-blue-800 border-blue-200'
                  }`}
                >
                  {nivelAlerta === -1 ? 'VENCIDA' : nivelAlerta === 0 ? 'VENCE HOY' : `${nivelAlerta} DÍAS`}
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
              {poliza.aseguradora} — Nº {poliza.numeroPoliza}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              {poliza.inmuebleDireccion && (
                <span className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  {poliza.inmuebleDireccion}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {poliza.fechaInicio} → {poliza.fechaVencimiento} ({obtenerTextoDiasRestantes(diasRestantes)})
              </span>
              {poliza.primaAnual && (
                <span className="flex items-center gap-1">
                  <Euro className="w-3.5 h-3.5 text-slate-400" />
                  {poliza.primaAnual} €/año
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-slate-50 px-4 flex items-center gap-1 overflow-x-auto shrink-0">
          {[
            { id: 'general', label: 'Datos & Cobertura', icon: FileText },
            { id: 'renovacion', label: 'Renovación', icon: Clock },
            { id: 'documentos', label: `Documentos (${(poliza.documentosRenovacion?.length || 0) + (poliza.documentos?.length || 0)})`, icon: FileCheck },
            { id: 'extraccion', label: 'Extracción IA', icon: Sparkles },
            { id: 'comparacion', label: 'Comparación', icon: Scale },
            { id: 'historial', label: `Histórico (${poliza.historial?.length || 0})`, icon: History },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  isActive ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Compañía Aseguradora</span>
                  <span className="font-bold text-slate-900 text-sm">{poliza.aseguradora}</span>
                  <div className="mt-2 space-y-1 text-slate-600">
                    {poliza.contacto?.telefono && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> {poliza.contacto.telefono}
                      </div>
                    )}
                    {poliza.contacto?.asistencia24h && (
                      <div className="flex items-center gap-1.5 font-bold text-blue-700">
                        <Phone className="w-3.5 h-3.5" /> Asistencia 24h: {poliza.contacto.asistencia24h}
                      </div>
                    )}
                    {poliza.contacto?.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" /> {poliza.contacto.email}
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Inmueble & Propietario</span>
                  <div className="font-bold text-slate-900 text-sm">{poliza.inmuebleDireccion || inmueble?.direccion || 'Sin inmueble'}</div>
                  <div className="text-slate-600 mt-1">
                    {inmueble?.ciudad || ''} {inmueble?.codigoPostal ? `(${inmueble.codigoPostal})` : ''}
                  </div>
                  <div className="mt-2 text-slate-500">
                    Propietario: {propietario?.nombre || poliza.propietarioId} {propietario?.nifCif ? `· ${propietario.nifCif}` : ''}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Vigencia</span>
                  <div className="font-semibold text-slate-900 mt-1">
                    Inicio: {poliza.fechaInicio}
                    <br />
                    Vto: {poliza.fechaVencimiento}
                  </div>
                  <div className="mt-1 text-[11px] font-bold text-blue-700">{obtenerTextoDiasRestantes(diasRestantes)}</div>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Prima & Franquicia</span>
                  <div className="font-semibold text-slate-900 mt-1">
                    Prima: {poliza.primaAnual ? `${poliza.primaAnual} €/año` : 'No indicada'}
                    <br />
                    Franquicia: {poliza.franquicia ?? 0} €
                  </div>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Estado</span>
                  <div className="mt-1 space-y-1">
                    <div>
                      Vigencia: <span className="font-bold">{poliza.estado}</span>
                    </div>
                    <div>
                      Renovación: <span className="font-bold">{estadoRenovInfo.label}</span>
                    </div>
                    {poliza.fechaUltimaComprobacion && (
                      <div className="text-[11px] text-slate-500">Última comprobación: {new Date(poliza.fechaUltimaComprobacion).toLocaleDateString('es-ES')}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Coberturas Activas ({poliza.coberturas.length})</h4>
                <div className="flex flex-wrap gap-1.5">
                  {poliza.coberturas.map((c, i) => (
                    <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-xs font-medium">
                      {c}
                    </span>
                  ))}
                </div>
                {poliza.observaciones && (
                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <span className="font-bold">Observaciones:</span> {poliza.observaciones}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {onEdit && (
                  <button
                    onClick={() => {
                      onEdit(poliza);
                      onClose();
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    <Edit className="w-4 h-4" />
                    Editar Póliza
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={async () => {
                      if (window.confirm('¿Eliminar esta póliza? El histórico se conservará si está vinculada.')) {
                        await onDelete(poliza.id);
                        onClose();
                      }
                    }}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'renovacion' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Circuito de Renovación
                </h4>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Póliza → Datos Cobertura → Fecha Vencimiento → Detección Próxima Renovación → Alerta → Comprobación Renovación → Recepción Nueva Póliza/Carta → Extracción Datos → Comparación → Decisión → Histórico
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Última Comprobación</span>
                  <div className="mt-1 font-medium">
                    {poliza.fechaUltimaComprobacion ? (
                      <>
                        <div>{new Date(poliza.fechaUltimaComprobacion).toLocaleString('es-ES')}</div>
                        <div>Usuario: {poliza.usuarioUltimaComprobacion || '—'}</div>
                        <div>Resultado: {poliza.resultadoUltimaComprobacion || '—'}</div>
                      </>
                    ) : (
                      <span className="text-slate-400 italic">Nunca se ha comprobado renovación</span>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Observaciones Renovación</span>
                  <div className="mt-1 text-slate-700">
                    {poliza.observacionesRenovacion || <span className="text-slate-400 italic">Sin observaciones</span>}
                  </div>
                  {poliza.fechaRecepcionRenovacion && (
                    <div className="mt-2 text-[11px] text-slate-500">Recepción: {poliza.fechaRecepcionRenovacion}</div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    // El componente padre debe abrir RenovacionPolizaModal, pero aquí mostramos info de que debe comprobarse
                    // Como fallback, marcamos como solicitada directamente si no hay modal externo
                    const event = new CustomEvent('abrirRenovacion', { detail: poliza.id });
                    window.dispatchEvent(event);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                >
                  <Clock className="w-4 h-4" />
                  Comprobar Renovación (registra evento)
                </button>
                {onCrearNuevaDesdeRenovacion && (
                  <button
                    onClick={() => onCrearNuevaDesdeRenovacion(poliza)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Crear Renovación como Nueva Póliza
                  </button>
                )}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <h5 className="font-bold text-slate-700 uppercase text-[11px] mb-1">Estados posibles de renovación</h5>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ESTADO_RENOVACION_LABELS).map(([k, v]) => (
                    <span key={k} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${v.badgeClass}`}>
                      {v.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'documentos' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Documentos de Renovación</h4>
                  <p className="text-xs text-slate-500">Conserva documento anterior y nuevo. No almacenar duplicados innecesarios.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedDocType}
                    onChange={(e) => setSelectedDocType(e.target.value as TipoDocumentoPoliza)}
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium"
                  >
                    <option value="POLIZA_ORIGINAL">Póliza Original</option>
                    <option value="POLIZA_RENOVACION">Póliza Renovación</option>
                    <option value="CARTA_RENOVACION">Carta Renovación</option>
                    <option value="CONDICIONES_PARTICULARES">Condiciones Particulares</option>
                    <option value="RECIBO_PRIMA">Recibo Prima</option>
                    <option value="OTRO">Otro</option>
                  </select>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSaving}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" />
                    Adjuntar
                  </button>
                  <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFileUpload} />
                </div>
              </div>

              {/* Documentos originales */}
              {poliza.documentos && poliza.documentos.length > 0 && (
                <div>
                  <h5 className="text-[11px] font-bold text-slate-500 uppercase mb-2">Documentos Originales ({poliza.documentos.length})</h5>
                  <div className="space-y-2">
                    {poliza.documentos.map((doc) => (
                      <div key={doc.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-500" />
                          <span className="font-medium">{doc.nombre}</span>
                          <span className="text-[11px] text-slate-400">{new Date(doc.fechaSubida).toLocaleDateString('es-ES')}</span>
                        </div>
                        <a href={doc.url} target="_blank" rel="noreferrer" className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-bold hover:bg-slate-50 flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documentos renovación */}
              <div>
                <h5 className="text-[11px] font-bold text-slate-500 uppercase mb-2">
                  Documentos de Renovación ({poliza.documentosRenovacion?.length || 0})
                </h5>
                {(!poliza.documentosRenovacion || poliza.documentosRenovacion.length === 0) ? (
                  <div className="p-6 text-center bg-white border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                    No hay documentos de renovación adjuntados. Adjunta nueva póliza o carta de renovación.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {poliza.documentosRenovacion.map((doc) => (
                      <div key={doc.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                            <FileCheck className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                              {doc.nombre}
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">{doc.tipo}</span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Recepción: {doc.fechaRecepcion} · Subida: {new Date(doc.fechaSubida).toLocaleDateString('es-ES')} · {doc.subidoPor || '—'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a href={doc.url} target="_blank" rel="noreferrer" className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
                            <Eye className="w-4 h-4" />
                          </a>
                          <button
                            onClick={() => handleExtraerDatos(doc)}
                            disabled={extraccionLoading}
                            className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg"
                            title="Extraer datos con IA (consultivo)"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDocumento(doc.id)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'extraccion' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  Extracción de Datos — IA Consultiva
                </h4>
                <p className="text-xs text-purple-800 mt-1">
                  La IA es consultiva. Nunca modifica automáticamente datos patrimoniales críticos sin confirmación del usuario. El usuario debe revisar y confirmar los datos extraídos.
                </p>
              </div>

              {extraccionError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{extraccionError}</div>
              )}

              {datosExtraidosPreview ? (
                <div className="space-y-3">
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-slate-700 uppercase">Datos Extraídos</h5>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${datosExtraidosPreview.confianza === 'ALTA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : datosExtraidosPreview.confianza === 'MEDIA' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                        Confianza: {datosExtraidosPreview.confianza}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-500 block">Compañía</span>
                        <span className="font-bold text-slate-900">{datosExtraidosPreview.aseguradora || 'No detectada'}</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-500 block">Nº Póliza</span>
                        <span className="font-bold text-slate-900 font-mono">{datosExtraidosPreview.numeroPoliza || 'No detectado'}</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-500 block">Fecha Inicio</span>
                        <span className="font-bold text-slate-900">{datosExtraidosPreview.fechaInicio || '—'}</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-500 block">Fecha Vencimiento</span>
                        <span className="font-bold text-slate-900">{datosExtraidosPreview.fechaVencimiento || '—'}</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-500 block">Prima Anual</span>
                        <span className="font-bold text-slate-900">{datosExtraidosPreview.primaAnual ? `${datosExtraidosPreview.primaAnual} €` : '—'}</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg">
                        <span className="text-[11px] text-slate-500 block">Franquicia</span>
                        <span className="font-bold text-slate-900">{datosExtraidosPreview.franquicia ?? '—'} €</span>
                      </div>
                    </div>
                    {datosExtraidosPreview.coberturas && datosExtraidosPreview.coberturas.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Coberturas detectadas</span>
                        <div className="flex flex-wrap gap-1">
                          {datosExtraidosPreview.coberturas.map((c, i) => (
                            <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-full text-[11px] font-medium">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {datosExtraidosPreview.cambiosRelevantes && datosExtraidosPreview.cambiosRelevantes.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Cambios relevantes</span>
                        <ul className="list-disc pl-5 text-xs text-slate-700">
                          {datosExtraidosPreview.cambiosRelevantes.map((ch, i) => (
                            <li key={i}>{ch}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="text-[11px] text-slate-500 italic">
                      Extraído el {new Date(datosExtraidosPreview.fechaExtraccion).toLocaleString('es-ES')} · {datosExtraidosPreview.observaciones || ''}
                    </div>
                    {datosExtraidosPreview.confirmadoUsuario ? (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Confirmado por {datosExtraidosPreview.confirmadoPor} el {datosExtraidosPreview.fechaConfirmacion ? new Date(datosExtraidosPreview.fechaConfirmacion).toLocaleString('es-ES') : ''}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleConfirmarExtraccion}
                          disabled={isSaving}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Confirmar Datos Extraídos (consultivo)
                        </button>
                        <span className="text-[11px] text-slate-500">Requiere revisión humana antes de aplicar</span>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const validacion = validarDatosExtraidos(datosExtraidosPreview);
                    return (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                        <h5 className="font-bold text-slate-700 uppercase text-[11px]">Validación</h5>
                        {validacion.errores.length > 0 && (
                          <div className="text-rose-700">
                            Errores: {validacion.errores.join(', ')}
                          </div>
                        )}
                        {validacion.advertencias.length > 0 && (
                          <div className="text-amber-700">Advertencias: {validacion.advertencias.join(', ')}</div>
                        )}
                        {validacion.valido && validacion.errores.length === 0 && validacion.advertencias.length === 0 && (
                          <div className="text-emerald-700">Datos coherentes</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="p-8 text-center bg-white border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                  No hay datos extraídos. Adjunta un documento de renovación y pulsa el icono ✨ para extraer datos de forma consultiva.
                </div>
              )}
            </div>
          )}

          {activeTab === 'comparacion' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Scale className="w-4 h-4 text-indigo-600" />
                  Comparación con Póliza Anterior
                </h4>
                {polizaAnterior && (
                  <button
                    onClick={handleGenerarComparacion}
                    disabled={isSaving}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Generar Comparación Objetiva
                  </button>
                )}
              </div>

              {!polizaAnterior ? (
                <div className="p-6 text-center bg-white border border-dashed border-slate-300 rounded-xl text-xs text-slate-500">
                  No hay póliza anterior vinculada. Para comparar, esta póliza debe tener una póliza anterior relacionada (polizaAnteriorId). Crea una renovación desde una póliza existente.
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="font-bold text-slate-800">Póliza Anterior:</div>
                  <div>
                    {polizaAnterior.aseguradora} · Nº {polizaAnterior.numeroPoliza} · {polizaAnterior.fechaInicio} → {polizaAnterior.fechaVencimiento} · {polizaAnterior.primaAnual ?? '—'}€/año
                  </div>
                </div>
              )}

              {poliza.comparacionUltima ? (
                <PolizaComparacionView
                  comparacion={poliza.comparacionUltima}
                  polizaAnterior={todasPolizas.find((p) => p.id === poliza.comparacionUltima!.polizaAnteriorId)}
                  polizaNueva={todasPolizas.find((p) => p.id === poliza.comparacionUltima!.polizaNuevaId) || poliza}
                />
              ) : (
                <div className="p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-500">
                  No se ha generado comparación aún. Pulsa &quot;Generar Comparación Objetiva&quot; para ver diferencias: prima anterior/nueva, diferencia absoluta, variación %, fechas, coberturas modificadas, franquicia, límites. Detección de aumento prima, reducción cobertura, aumento franquicia, modificación límites. Sin valoración comercial.
                </div>
              )}

              {poliza.comparacionesHistorial && poliza.comparacionesHistorial.length > 1 && (
                <div>
                  <h5 className="text-[11px] font-bold text-slate-500 uppercase mb-2">Historial de Comparaciones ({poliza.comparacionesHistorial.length})</h5>
                  <div className="space-y-2">
                    {poliza.comparacionesHistorial.map((comp) => (
                      <div key={comp.id} className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                        <span>
                          {new Date(comp.fechaComparacion).toLocaleDateString('es-ES')} · Δ {comp.diferenciaAbsoluta ?? 0}€ ({comp.variacionPorcentual ?? 0}%)
                        </span>
                        <span className="text-[11px] text-slate-500">{comp.generadoPor || 'Sistema'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'historial' && (
            <PolizaHistorialTimeline poliza={poliza} cadenaHistorial={cadenaHistorial} onVerPoliza={(id) => {
              const p = todasPolizas.find((x) => x.id === id);
              if (p) {
                // Disparar evento para que el padre cambie de póliza
                const ev = new CustomEvent('verPolizaHistorial', { detail: id });
                window.dispatchEvent(ev);
              }
            }} />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500">
            ID: {poliza.id} · Creada {new Date(poliza.createdAt).toLocaleDateString('es-ES')}
          </div>
          <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
