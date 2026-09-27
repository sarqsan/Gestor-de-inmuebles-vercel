import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Inmueble,
  Candidato,
  VisitSlot,
  InvitacionVisita,
  DatosCatastrales,
  DatosFiscalesInmueble,
  PropietarioFiscal,
  Propietario,
  CuentaBancariaPropietario,
  ContratoFormalizacion,
  CobroPeriodo,
  EstadoCobroAlquiler,
  UsuarioApp,
  Profesional,
} from '../../types';
import { MantenimientoInmueblePanel } from '../mantenimiento/MantenimientoInmueblePanel';
import { ReformasInmueblePanel } from '../reformas/ReformasInmueblePanel';
import { FichaTecnicaInventarioPanel } from '../FichaTecnicaInventarioPanel';
import { HabitacionesInmueblePanel } from '../HabitacionesInmueblePanel';
import { PublicacionInmueblesPanel } from '../PublicacionInmueblesPanel';
import { CentroOperativoInmueblePanel } from '../inmueble/CentroOperativoInmueblePanel';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';
import { GestionImagenesModal } from '../GestionImagenesModal';
import { VerAgendaInmuebleModal } from '../VerAgendaInmuebleModal';
import { getInmuebleCoverUrl } from '../../utils/imageUtils';
import { getFormalizacionEstadoInfo } from '../../utils/contratoEngine';
import {
  obtenerCobrosInmueble,
  calcularResumenCobros,
  registrarPagoPeriodo,
  MESES_NOMBRES,
} from '../../utils/cobrosEngine';
import {
  formatEuro,
  formatDate,
  getCandidateStatusLabel,
  getCandidateStatusBadgeStyle,
} from '../../utils/formatters';
import {
  Building2,
  Users,
  MapPin,
  Tag,
  Bed,
  Bath,
  Maximize2,
  CheckCircle2,
  Clock,
  Filter,
  Search,
  ChevronRight,
  ArrowLeft,
  Phone,
  Mail,
  User,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  Sparkles,
  Upload,
  Camera,
  Image as ImageIcon,
  Link as LinkIcon,
  Edit,
  FileText,
  CalendarCheck,
  ShieldCheck,
  CreditCard,
  Building,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Info,
  Check,
  FileCheck2,
  Landmark,
  FileSignature,
  History,
  Calendar,
  Archive,
  RefreshCw,
  UserCheck,
  Receipt,
  Banknote,
  AlertCircle,
  Paperclip,
} from 'lucide-react';

interface InmueblesSectionProps {
  inmuebles: Inmueble[];
  candidatos: Candidato[];
  propietarios?: Propietario[];
  profesionales?: Profesional[];
  slots?: VisitSlot[];
  invitaciones?: InvitacionVisita[];
  contratos?: ContratoFormalizacion[];
  currentUser?: UsuarioApp | null;
  onSelectCandidate: (candidato: Candidato) => void;
  onDeleteInmueble?: (inmuebleId: string) => void;
  onAddInmueble?: (inmueble: Inmueble) => void;
  onOpenLinkModal?: (inmueble: Inmueble) => void;
  onOpenConfigurarAgenda?: (inmuebleId?: string) => void;
  onUpdateInmueble?: (inmueble: Inmueble) => void;
  onDeleteSlot?: (slotId: string) => void;
  onDeleteSlotsBatch?: (slotIds: string[]) => void;
  onUpdateSlot?: (slot: VisitSlot) => void;
  onNavigateToPropietarios?: () => void;
  /**
   * BLOQUE 1 — navegación contextual desde el centro operativo del inmueble
   * a secciones globales (pólizas, cobros, incidencias, gastos). Enlaza los
   * módulos existentes; no los duplica.
   */
  onAbrirSeccionGlobal?: (seccion: string, inmuebleId?: string) => void;
  onOpenFormalizarModal?: (candidato: Candidato, inmueble?: Inmueble, existingContrato?: ContratoFormalizacion) => void;
  onFinalizarContrato?: (contratoId: string) => Promise<void>;
  onSaveContrato?: (contrato: ContratoFormalizacion) => Promise<void> | void;
  // FASE 3.1: abrir expediente de recomercialización desde el inmueble.
  onRecomercializarInmueble?: (inmuebleId: string, contratoAnteriorId?: string) => void;
  /**
   * Si viene informado, el alta se abre con este propietario ya seleccionado
   * (misma ruta que el desplegable). El alta general no lo envía.
   */
  propietarioContextoAltaId?: string | null;
  /** El padre lo limpia después de aplicarlo, para no repetir la preselección. */
  onContextoAltaConsumido?: () => void;
}

export const InmueblesSection: React.FC<InmueblesSectionProps> = ({
  inmuebles,
  candidatos,
  propietarios = [],
  profesionales = [],
  slots = [],
  invitaciones = [],
  contratos = [],
  currentUser,
  onSelectCandidate,
  onDeleteInmueble,
  onAddInmueble,
  onOpenLinkModal,
  onOpenConfigurarAgenda,
  onUpdateInmueble,
  onDeleteSlot,
  onDeleteSlotsBatch,
  onUpdateSlot,
  onNavigateToPropietarios,
  onAbrirSeccionGlobal,
  onOpenFormalizarModal,
  onFinalizarContrato,
  onSaveContrato,
  onRecomercializarInmueble,
  propietarioContextoAltaId,
  onContextoAltaConsumido,
}) => {
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<'todos' | 'disponible' | 'alquilado'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [inmuebleToDelete, setInmuebleToDelete] = useState<Inmueble | null>(null);
  const [gestionImagenesInmueble, setGestionImagenesInmueble] = useState<Inmueble | null>(null);
  const [verAgendaInmueble, setVerAgendaInmueble] = useState<Inmueble | null>(null);

  // Modal State for New Property
  const [showAddModal, setShowAddModal] = useState(false);
  /** La preselección contextual no debe filtrarse al siguiente alta general. */
  const altaAplicoContexto = useRef(false);
  const [newTab, setNewTab] = useState<'general' | 'fiscal'>('general');
  const [newDireccion, setNewDireccion] = useState('');
  const [newCiudad, setNewCiudad] = useState('');
  const [newPrecio, setNewPrecio] = useState<number>(850);
  const [newFianza, setNewFianza] = useState<number>(1);
  const [newHabitaciones, setNewHabitaciones] = useState<number>(2);
  const [newBanos, setNewBanos] = useState<number>(1);
  const [newSuperficie, setNewSuperficie] = useState<number>(75);
  const [newEstado, setNewEstado] = useState<'disponible' | 'alquilado'>('disponible');
  const [newDescripcion, setNewDescripcion] = useState('');

  // Image Upload State for New Property
  const [tabImagen, setTabImagen] = useState<'archivo' | 'url'>('archivo');
  const [newImagenUrl, setNewImagenUrl] = useState('');
  const [newImagenPreview, setNewImagenPreview] = useState<string | null>(null);

  // New Property Fiscal & Owner Linking Fields
  const [newSelectedPropId, setNewSelectedPropId] = useState<string>('');
  const [newSelectedCuentaId, setNewSelectedCuentaId] = useState<string>('');
  const [newSelectedProp2Id, setNewSelectedProp2Id] = useState<string>('');
  const [newReferenciaCatastral, setNewReferenciaCatastral] = useState('');
  const [newCodigoPostal, setNewCodigoPostal] = useState('');
  const [newIbanCobro, setNewIbanCobro] = useState('');
  const [newCertificadoEnergetico, setNewCertificadoEnergetico] = useState('');
  const [newNumeroRegistroPropiedad, setNewNumeroRegistroPropiedad] = useState('');
  const [newPropNombre, setNewPropNombre] = useState('');
  const [newPropNif, setNewPropNif] = useState('');
  const [newPropDireccion, setNewPropDireccion] = useState('');
  const [newPropTelefono, setNewPropTelefono] = useState('');
  const [newPropEmail, setNewPropEmail] = useState('');
  const [newPropEsPersonaJuridica, setNewPropEsPersonaJuridica] = useState(false);
  const [newTieneSegundoProp, setNewTieneSegundoProp] = useState(false);
  const [newProp2Nombre, setNewProp2Nombre] = useState('');
  const [newProp2Nif, setNewProp2Nif] = useState('');
  const [newProp2Direccion, setNewProp2Direccion] = useState('');
  const [newProp2Telefono, setNewProp2Telefono] = useState('');
  const [newProp2Email, setNewProp2Email] = useState('');
  const [newProp2EsPersonaJuridica, setNewProp2EsPersonaJuridica] = useState(false);

  // Modal State for Edit Property
  const [inmuebleToEdit, setInmuebleToEdit] = useState<Inmueble | null>(null);
  const [editTab, setEditTab] = useState<'general' | 'fiscal'>('general');
  const [editDireccion, setEditDireccion] = useState('');
  const [editCiudad, setEditCiudad] = useState('');
  const [editPrecio, setEditPrecio] = useState<number>(850);
  const [editFianza, setEditFianza] = useState<number>(1);
  const [editHabitaciones, setEditHabitaciones] = useState<number>(2);
  const [editBanos, setEditBanos] = useState<number>(1);
  const [editSuperficie, setEditSuperficie] = useState<number>(75);
  const [editEstado, setEditEstado] = useState<'disponible' | 'alquilado'>('disponible');
  const [editDescripcion, setEditDescripcion] = useState('');
  const [editImagenUrl, setEditImagenUrl] = useState('');

  // Edit Fiscal & Owner Linking Fields
  const [editSelectedPropId, setEditSelectedPropId] = useState<string>('');
  const [editSelectedCuentaId, setEditSelectedCuentaId] = useState<string>('');
  const [editSelectedProp2Id, setEditSelectedProp2Id] = useState<string>('');
  const [editReferenciaCatastral, setEditReferenciaCatastral] = useState('');
  // FASE 3.5.1 — detalle catastral
  const [editCatastro, setEditCatastro] = useState<Partial<DatosCatastrales>>({});
  const [catastroConsultando, setCatastroConsultando] = useState(false);
  const [catastroAviso, setCatastroAviso] = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null);
  const [editCodigoPostal, setEditCodigoPostal] = useState('');
  const [editIbanCobro, setEditIbanCobro] = useState('');
  const [editCertificadoEnergetico, setEditCertificadoEnergetico] = useState('');
  const [editNumeroRegistroPropiedad, setEditNumeroRegistroPropiedad] = useState('');
  const [editPropNombre, setEditPropNombre] = useState('');
  const [editPropNif, setEditPropNif] = useState('');
  const [editPropDireccion, setEditPropDireccion] = useState('');
  const [editPropTelefono, setEditPropTelefono] = useState('');
  const [editPropEmail, setEditPropEmail] = useState('');
  const [editPropEsPersonaJuridica, setEditPropEsPersonaJuridica] = useState(false);
  const [editTieneSegundoProp, setEditTieneSegundoProp] = useState(false);
  const [editProp2Nombre, setEditProp2Nombre] = useState('');
  const [editProp2Nif, setEditProp2Nif] = useState('');
  const [editProp2Direccion, setEditProp2Direccion] = useState('');
  const [editProp2Telefono, setEditProp2Telefono] = useState('');
  const [editProp2Email, setEditProp2Email] = useState('');
  const [editProp2EsPersonaJuridica, setEditProp2EsPersonaJuridica] = useState(false);

  // New property physical identity & contract state
  const [newIdPersonalizado, setNewIdPersonalizado] = useState('');
  const [newModalidadAlquiler, setNewModalidadAlquiler] = useState<'completo' | 'habitaciones'>('completo');
  const [editModalidadAlquiler, setEditModalidadAlquiler] = useState<'completo' | 'habitaciones'>('completo');
  const [showFormalizarNuevoContratoModal, setShowFormalizarNuevoContratoModal] = useState(false);
  const [selectedCandidatoParaContrato, setSelectedCandidatoParaContrato] = useState<string>('');
  const [isFinalizandoContrato, setIsFinalizandoContrato] = useState(false);

  // Copied state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setNewImagenPreview(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const selectedInmueble = inmuebles.find((i) => i.id === selectedInmuebleId);

  const interestedCandidates = selectedInmuebleId
    ? candidatos.filter((c) => c.inmuebleId === selectedInmuebleId)
    : [];

  const propertyContracts = useMemo(() => {
    if (!selectedInmuebleId || !contratos) return [];
    return contratos.filter((c) => c.inmuebleId === selectedInmuebleId);
  }, [selectedInmuebleId, contratos]);

  const activeContract = useMemo(() => {
    return propertyContracts.find((c) => c.estado === 'FORMALIZADO_ACTIVO' || c.esVigente);
  }, [propertyContracts]);

  const historicalContracts = useMemo(() => {
    return propertyContracts
      .filter((c) => c.id !== activeContract?.id)
      .sort((a, b) => new Date(b.fechaInicioContrato || b.fechaCreacion).getTime() - new Date(a.fechaInicioContrato || a.fechaCreacion).getTime());
  }, [propertyContracts, activeContract]);

  // Gestión de Cobros de Alquiler vinculada permanentemente al inmuebleId
  const propertyCobros = useMemo(() => {
    if (!selectedInmuebleId || !contratos) return [];
    return obtenerCobrosInmueble(selectedInmuebleId, contratos);
  }, [selectedInmuebleId, contratos]);

  const propertyCobrosMetrics = useMemo(() => {
    return calcularResumenCobros(propertyCobros);
  }, [propertyCobros]);

  // Modal para registrar cobro rápido desde la ficha del inmueble
  const [cobroToPay, setCobroToPay] = useState<CobroPeriodo | null>(null);
  const [payImporte, setPayImporte] = useState<number>(0);
  const [payFecha, setPayFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [payMetodo, setPayMetodo] = useState<'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro'>('transferencia');
  const [payEstado, setPayEstado] = useState<EstadoCobroAlquiler>('RECIBIDO');
  const [payObservaciones, setPayObservaciones] = useState<string>('');
  const [payReferencia, setPayReferencia] = useState<string>('');
  const [payFile, setPayFile] = useState<File | null>(null);
  const [isSubmittingPay, setIsSubmittingPay] = useState<boolean>(false);

  const handleOpenPayModal = (cobro: CobroPeriodo) => {
    setCobroToPay(cobro);
    setPayImporte(cobro.importeRecibido > 0 ? cobro.importeRecibido : cobro.importePrevisto);
    setPayFecha(cobro.fechaPago || new Date().toISOString().split('T')[0]);
    setPayMetodo(cobro.metodoPago || 'transferencia');
    setPayEstado(cobro.importeRecibido > 0 ? cobro.estado : 'RECIBIDO');
    setPayObservaciones(cobro.observaciones || '');
    setPayReferencia(cobro.referenciaBancaria || '');
    setPayFile(null);
  };

  const handleSavePropertyCobro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cobroToPay || !onSaveContrato) return;
    const contrato = contratos.find((c) => c.id === cobroToPay.contratoId);
    if (!contrato) return;

    setIsSubmittingPay(true);
    try {
      let justData = cobroToPay.justificante;
      if (payFile) {
        justData = {
          id: `just_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          nombreArchivo: payFile.name,
          tipoMime: payFile.type,
          tamanoBytes: payFile.size,
          fechaSubida: new Date().toISOString(),
          subidoPor: currentUser?.nombre || currentUser?.email || 'Administrador',
          storagePath: `cobros/${cobroToPay.id}/${payFile.name}`,
          url: URL.createObjectURL(payFile),
        };
      }

      const updated = registrarPagoPeriodo(
        contrato,
        cobroToPay.id,
        {
          importeRecibido: Number(payImporte),
          fechaPago: payFecha,
          metodoPago: payMetodo,
          estado: payEstado,
          observaciones: payObservaciones,
          referenciaBancaria: payReferencia,
          justificante: justData,
        },
        currentUser
      );

      await onSaveContrato(updated);
      setCobroToPay(null);
    } catch (err) {
      console.error('Error al registrar cobro:', err);
      alert('Error al registrar el cobro.');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const linkedPropietarioPrincipal = useMemo(() => {
    if (!selectedInmueble) return null;
    const propId =
      selectedInmueble.propietarioId ||
      selectedInmueble.propietarioPrincipalId ||
      selectedInmueble.datosFiscales?.propietarioPrincipal?.propietarioId;
    if (propId) {
      const found = propietarios.find((p) => p.id === propId);
      if (found) return found;
    }
    const propNif = selectedInmueble.datosFiscales?.propietarioPrincipal?.nifDni;
    if (propNif) {
      const found = propietarios.find((p) => p.nifCif.toLowerCase() === propNif.toLowerCase());
      if (found) return found;
    }
    return null;
  }, [selectedInmueble, propietarios]);

  const filteredInmuebles = inmuebles.filter((inm) => {
    const matchesSearch =
      inm.direccion.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inm.ciudad.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inm.referenciaCatastral && inm.referenciaCatastral.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (inm.datosFiscales?.propietarioPrincipal?.nombre && inm.datosFiscales.propietarioPrincipal.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesState = filterState === 'todos' || inm.estado === filterState;
    return matchesSearch && matchesState;
  });

  const abrirAltaGeneral = () => {
    setNewTab('general');
    if (altaAplicoContexto.current) {
      setNewSelectedPropId('');
      setNewSelectedCuentaId('');
      setNewIbanCobro('');
      setNewPropNombre('');
      setNewPropNif('');
      setNewPropDireccion('');
      setNewPropTelefono('');
      setNewPropEmail('');
      setNewPropEsPersonaJuridica(false);
      altaAplicoContexto.current = false;
    }
    setShowAddModal(true);
  };

  const handleSelectNewPropietario = (propId: string) => {
    setNewSelectedPropId(propId);
    if (!propId) {
      setNewSelectedCuentaId('');
      return;
    }
    const prop = propietarios.find((p) => p.id === propId);
    if (prop) {
      setNewPropNombre(prop.nombre);
      setNewPropNif(prop.nifCif);
      setNewPropDireccion(`${prop.direccion}${prop.ciudad ? `, ${prop.ciudad}` : ''}`);
      setNewPropTelefono(prop.telefono || '');
      setNewPropEmail(prop.email || '');
      setNewPropEsPersonaJuridica(
        prop.tipo === 'sociedad_limitada' ||
        prop.tipo === 'sociedad_anonima' ||
        prop.tipo === 'comunidad_bienes'
      );
      const principalAcc = prop.cuentasBancarias.find((c) => c.esPrincipal) || prop.cuentasBancarias[0];
      if (principalAcc) {
        setNewSelectedCuentaId(principalAcc.id);
        setNewIbanCobro(principalAcc.iban);
      } else {
        setNewSelectedCuentaId('');
      }
    }
  };

  useEffect(() => {
    if (!propietarioContextoAltaId) return;
    if (!propietarios.some((p) => p.id === propietarioContextoAltaId)) return;
    setNewTab('fiscal');
    handleSelectNewPropietario(propietarioContextoAltaId);
    altaAplicoContexto.current = true;
    setShowAddModal(true);
    onContextoAltaConsumido?.();
    // Solo el id de contexto y la lista: la función de selección se reutiliza tal cual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propietarioContextoAltaId, propietarios]);

  const handleSelectNewCuenta = (cuentaId: string) => {
    setNewSelectedCuentaId(cuentaId);
    if (cuentaId === 'custom' || !cuentaId) return;
    const prop = propietarios.find((p) => p.id === newSelectedPropId);
    const acc = prop?.cuentasBancarias.find((c) => c.id === cuentaId);
    if (acc) {
      setNewIbanCobro(acc.iban);
    }
  };

  const handleSelectNewProp2 = (propId: string) => {
    setNewSelectedProp2Id(propId);
    if (!propId) return;
    const prop = propietarios.find((p) => p.id === propId);
    if (prop) {
      setNewProp2Nombre(prop.nombre);
      setNewProp2Nif(prop.nifCif);
      setNewProp2Direccion(`${prop.direccion}${prop.ciudad ? `, ${prop.ciudad}` : ''}`);
      setNewProp2Telefono(prop.telefono || '');
      setNewProp2Email(prop.email || '');
      setNewProp2EsPersonaJuridica(
        prop.tipo === 'sociedad_limitada' ||
        prop.tipo === 'sociedad_anonima' ||
        prop.tipo === 'comunidad_bienes'
      );
    }
  };

  const handleCreateInmuebleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDireccion || !newCiudad || !onAddInmueble) return;

    const hasCustomImage = !!(newImagenPreview || newImagenUrl.trim());
    const finalImageUrl =
      newImagenPreview ||
      newImagenUrl.trim() ||
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop&q=80';

    const propPrincipal: PropietarioFiscal = {
      nombre: newPropNombre.trim() || 'Propietario / Arrendador',
      nifDni: newPropNif.trim() || '',
      direccion: newPropDireccion.trim() || newDireccion,
      telefono: newPropTelefono.trim() || undefined,
      email: newPropEmail.trim() || undefined,
      esPersonaJuridica: newPropEsPersonaJuridica,
      propietarioId: newSelectedPropId || undefined,
    };

    let segundoProp: PropietarioFiscal | undefined = undefined;
    if (newTieneSegundoProp && newProp2Nombre.trim()) {
      segundoProp = {
        nombre: newProp2Nombre.trim(),
        nifDni: newProp2Nif.trim() || '',
        direccion: newProp2Direccion.trim() || newPropDireccion.trim() || newDireccion,
        telefono: newProp2Telefono.trim() || undefined,
        email: newProp2Email.trim() || undefined,
        esPersonaJuridica: newProp2EsPersonaJuridica,
        propietarioId: newSelectedProp2Id || undefined,
      };
    }

    const datosFiscales: DatosFiscalesInmueble = {
      referenciaCatastral: newReferenciaCatastral.trim() || undefined,
      codigoPostal: newCodigoPostal.trim() || undefined,
      ibanCobro: newIbanCobro.trim() || undefined,
      certificadoEnergetico: newCertificadoEnergetico.trim() || undefined,
      numeroRegistroPropiedad: newNumeroRegistroPropiedad.trim() || undefined,
      propietarioPrincipal: propPrincipal,
      tieneSegundoPropietario: newTieneSegundoProp,
      segundoPropietario: segundoProp,
    };

    const finalInmuebleId = newIdPersonalizado.trim() || `inm-${Date.now()}`;
    const created: Inmueble = {
      id: finalInmuebleId,
      direccion: newDireccion,
      ciudad: newCiudad,
      precio: newPrecio,
      fianzaMeses: newFianza,
      habitaciones: newHabitaciones,
      banos: newBanos,
      superficie: newSuperficie,
      estado: newEstado,
      modalidadAlquiler: newModalidadAlquiler,
      descripcion: newDescripcion.trim() || undefined,
      candidatosCount: 0,
      imagenUrl: finalImageUrl,
      imagenIa: !hasCustomImage,
      referenciaCatastral: newReferenciaCatastral.trim() || undefined,
      codigoPostal: newCodigoPostal.trim() || undefined,
      propietarioId: newSelectedPropId || undefined,
      propietarioPrincipalId: newSelectedPropId || undefined,
      propietarioSecundarioId: newTieneSegundoProp && newSelectedProp2Id ? newSelectedProp2Id : undefined,
      cuentaBancariaCobroId: newSelectedCuentaId && newSelectedCuentaId !== 'custom' ? newSelectedCuentaId : undefined,
      ibanCobro: newIbanCobro.trim() || undefined,
      datosFiscales,
    };

    onAddInmueble(created);
    setShowAddModal(false);
    setNewIdPersonalizado('');
    setNewModalidadAlquiler('completo');
    setNewTab('general');
    setNewDireccion('');
    setNewCiudad('');
    setNewDescripcion('');
    setNewImagenUrl('');
    setNewImagenPreview(null);
    setNewSelectedPropId('');
    setNewSelectedCuentaId('');
    setNewSelectedProp2Id('');
    setNewReferenciaCatastral('');
    setNewCodigoPostal('');
    setNewIbanCobro('');
    setNewCertificadoEnergetico('');
    setNewNumeroRegistroPropiedad('');
    setNewPropNombre('');
    setNewPropNif('');
    setNewPropDireccion('');
    setNewPropTelefono('');
    setNewPropEmail('');
    setNewPropEsPersonaJuridica(false);
    setNewTieneSegundoProp(false);
    setNewProp2Nombre('');
    setNewProp2Nif('');
    setNewProp2Direccion('');
    setNewProp2Telefono('');
    setNewProp2Email('');
    setNewProp2EsPersonaJuridica(false);
  };

  const handleSelectEditPropietario = (propId: string) => {
    setEditSelectedPropId(propId);
    if (!propId) {
      setEditSelectedCuentaId('');
      return;
    }
    const prop = propietarios.find((p) => p.id === propId);
    if (prop) {
      setEditPropNombre(prop.nombre);
      setEditPropNif(prop.nifCif);
      setEditPropDireccion(`${prop.direccion}${prop.ciudad ? `, ${prop.ciudad}` : ''}`);
      setEditPropTelefono(prop.telefono || '');
      setEditPropEmail(prop.email || '');
      setEditPropEsPersonaJuridica(
        prop.tipo === 'sociedad_limitada' ||
        prop.tipo === 'sociedad_anonima' ||
        prop.tipo === 'comunidad_bienes'
      );
      const principalAcc = prop.cuentasBancarias.find((c) => c.esPrincipal) || prop.cuentasBancarias[0];
      if (principalAcc) {
        setEditSelectedCuentaId(principalAcc.id);
        setEditIbanCobro(principalAcc.iban);
      } else {
        setEditSelectedCuentaId('');
      }
    }
  };

  const handleSelectEditCuenta = (cuentaId: string) => {
    setEditSelectedCuentaId(cuentaId);
    if (cuentaId === 'custom' || !cuentaId) return;
    const prop = propietarios.find((p) => p.id === editSelectedPropId);
    const acc = prop?.cuentasBancarias.find((c) => c.id === cuentaId);
    if (acc) {
      setEditIbanCobro(acc.iban);
    }
  };

  const handleSelectEditProp2 = (propId: string) => {
    setEditSelectedProp2Id(propId);
    if (!propId) return;
    const prop = propietarios.find((p) => p.id === propId);
    if (prop) {
      setEditProp2Nombre(prop.nombre);
      setEditProp2Nif(prop.nifCif);
      setEditProp2Direccion(`${prop.direccion}${prop.ciudad ? `, ${prop.ciudad}` : ''}`);
      setEditProp2Telefono(prop.telefono || '');
      setEditProp2Email(prop.email || '');
      setEditProp2EsPersonaJuridica(
        prop.tipo === 'sociedad_limitada' ||
        prop.tipo === 'sociedad_anonima' ||
        prop.tipo === 'comunidad_bienes'
      );
    }
  };

  const handleOpenEditModal = (inm: Inmueble, defaultTab: 'general' | 'fiscal' = 'general') => {
    setInmuebleToEdit(inm);
    setEditTab(defaultTab);
    setEditDireccion(inm.direccion);
    setEditCiudad(inm.ciudad);
    setEditPrecio(inm.precio);
    setEditFianza(inm.fianzaMeses || 1);
    setEditHabitaciones(inm.habitaciones);
    setEditBanos(inm.banos);
    setEditSuperficie(inm.superficie);
    setEditEstado(inm.estado);
    setEditModalidadAlquiler(inm.modalidadAlquiler || 'completo');
    setEditDescripcion(inm.descripcion || '');
    setEditImagenUrl(inm.imagenUrl || '');

    const df = inm.datosFiscales;
    setEditReferenciaCatastral(inm.referenciaCatastral || df?.referenciaCatastral || '');
    setEditCatastro(
      inm.datosCatastrales
        ? { ...inm.datosCatastrales }
        : { referenciaCatastral: inm.referenciaCatastral || df?.referenciaCatastral || undefined }
    );
    setCatastroAviso(null);
    setEditCodigoPostal(inm.codigoPostal || df?.codigoPostal || '');
    const currentIban = df?.ibanCobro || inm.ibanCobro || '';
    setEditIbanCobro(currentIban);
    setEditCertificadoEnergetico(df?.certificadoEnergetico || '');
    setEditNumeroRegistroPropiedad(df?.numeroRegistroPropiedad || '');

    // Misma prioridad que los motores. propietarioId gana para que abrir y
    // guardar no sustituya el titular operativo por otra referencia desalineada.
    // No se llama al selector: el snapshot fiscal escrito a mano se conserva.
    const prop1Id =
      inm.propietarioId ||
      inm.propietarioPrincipalId ||
      df?.propietarioPrincipal?.propietarioId ||
      propietarios.find((p) => df?.propietarioPrincipal?.nifDni && p.nifCif.toLowerCase() === df.propietarioPrincipal.nifDni.toLowerCase())?.id ||
      '';
    setEditSelectedPropId(prop1Id);

    // Resolve account ID
    if (prop1Id) {
      const prop1 = propietarios.find((p) => p.id === prop1Id);
      const accMatch = prop1?.cuentasBancarias.find((c) => c.iban.replace(/\s+/g, '') === currentIban.replace(/\s+/g, ''));
      setEditSelectedCuentaId(accMatch ? accMatch.id : (inm.cuentaBancariaCobroId || (currentIban ? 'custom' : '')));
    } else {
      setEditSelectedCuentaId(inm.cuentaBancariaCobroId || (currentIban ? 'custom' : ''));
    }

    setEditPropNombre(df?.propietarioPrincipal?.nombre || '');
    setEditPropNif(df?.propietarioPrincipal?.nifDni || '');
    setEditPropDireccion(df?.propietarioPrincipal?.direccion || '');
    setEditPropTelefono(df?.propietarioPrincipal?.telefono || '');
    setEditPropEmail(df?.propietarioPrincipal?.email || '');
    setEditPropEsPersonaJuridica(df?.propietarioPrincipal?.esPersonaJuridica || false);

    // Resolve owner 2
    const prop2Id =
      inm.propietarioSecundarioId ||
      df?.segundoPropietario?.propietarioId ||
      propietarios.find((p) => df?.segundoPropietario?.nifDni && p.nifCif.toLowerCase() === df.segundoPropietario.nifDni.toLowerCase())?.id ||
      '';
    setEditSelectedProp2Id(prop2Id);
    setEditTieneSegundoProp(df?.tieneSegundoPropietario || false);
    setEditProp2Nombre(df?.segundoPropietario?.nombre || '');
    setEditProp2Nif(df?.segundoPropietario?.nifDni || '');
    setEditProp2Direccion(df?.segundoPropietario?.direccion || '');
    setEditProp2Telefono(df?.segundoPropietario?.telefono || '');
    setEditProp2Email(df?.segundoPropietario?.email || '');
    setEditProp2EsPersonaJuridica(df?.segundoPropietario?.esPersonaJuridica || false);
  };

  // FASE 3.5.1 — valida/localiza la referencia en el Catastro (servicio público OVC)
  const handleConsultarCatastro = async () => {
    const ref = editReferenciaCatastral.trim();
    if (ref.replace(/[^a-zA-Z0-9]/g, '').length < 14) {
      setCatastroAviso({ tipo: 'err', texto: 'Introduce una referencia catastral válida (14-20 caracteres).' });
      return;
    }
    setCatastroConsultando(true);
    setCatastroAviso(null);
    try {
      const resp = await fetch('/api/catastro/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenciaCatastral: ref }),
      });
      const j = await resp.json();
      if (j.ok) {
        const refNormalizada = j.referenciaCatastral || ref;
        setEditCatastro((prev) => ({ ...prev, ...j, referenciaCatastral: refNormalizada }));
        setEditReferenciaCatastral(refNormalizada);
        setCatastroAviso({
          tipo: 'ok',
          texto: `Referencia localizada${j.direccionCatastral ? `: ${j.direccionCatastral}` : ''}. El año de construcción, la superficie y el valor catastral se completan desde el IBI o la Sede Electrónica.`,
        });
      } else {
        setCatastroAviso({ tipo: 'err', texto: j.error || 'No se pudo localizar la referencia; puedes completar los datos manualmente.' });
      }
    } catch {
      setCatastroAviso({ tipo: 'err', texto: 'Servicio del Catastro no disponible ahora; puedes completar los datos manualmente.' });
    } finally {
      setCatastroConsultando(false);
    }
  };

  const handleSaveEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inmuebleToEdit || !onUpdateInmueble) return;

    const propPrincipal: PropietarioFiscal = {
      nombre: editPropNombre.trim() || 'Propietario / Arrendador',
      nifDni: editPropNif.trim() || '',
      direccion: editPropDireccion.trim() || editDireccion,
      telefono: editPropTelefono.trim() || undefined,
      email: editPropEmail.trim() || undefined,
      esPersonaJuridica: editPropEsPersonaJuridica,
      propietarioId: editSelectedPropId || undefined,
    };

    let segundoProp: PropietarioFiscal | undefined = undefined;
    if (editTieneSegundoProp && editProp2Nombre.trim()) {
      segundoProp = {
        nombre: editProp2Nombre.trim(),
        nifDni: editProp2Nif.trim() || '',
        direccion: editProp2Direccion.trim() || editPropDireccion.trim() || editDireccion,
        telefono: editProp2Telefono.trim() || undefined,
        email: editProp2Email.trim() || undefined,
        esPersonaJuridica: editProp2EsPersonaJuridica,
        propietarioId: editSelectedProp2Id || undefined,
      };
    }

    const datosFiscales: DatosFiscalesInmueble = {
      referenciaCatastral: editReferenciaCatastral.trim() || undefined,
      codigoPostal: editCodigoPostal.trim() || undefined,
      ibanCobro: editIbanCobro.trim() || undefined,
      certificadoEnergetico: editCertificadoEnergetico.trim() || undefined,
      numeroRegistroPropiedad: editNumeroRegistroPropiedad.trim() || undefined,
      propietarioPrincipal: propPrincipal,
      tieneSegundoPropietario: editTieneSegundoProp,
      segundoPropietario: segundoProp,
    };

    const refCatEdit = editReferenciaCatastral.trim();
    const numPos = (v: unknown): number | undefined => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const datosCatastrales: DatosCatastrales | undefined = refCatEdit
      ? {
          ...(editCatastro as DatosCatastrales),
          referenciaCatastral: refCatEdit,
          superficieCatastralConstruida: numPos(editCatastro.superficieCatastralConstruida),
          anioConstruccion: numPos(editCatastro.anioConstruccion),
          valorCatastral: numPos(editCatastro.valorCatastral),
          planta: editCatastro.planta ? String(editCatastro.planta).trim() || undefined : undefined,
        }
      : undefined;

    const updated: Inmueble = {
      ...inmuebleToEdit,
      direccion: editDireccion,
      ciudad: editCiudad,
      precio: editPrecio,
      fianzaMeses: editFianza,
      habitaciones: editHabitaciones,
      banos: editBanos,
      superficie: editSuperficie,
      estado: editEstado,
      modalidadAlquiler: editModalidadAlquiler,
      descripcion: editDescripcion.trim() || undefined,
      imagenUrl: editImagenUrl.trim() || inmuebleToEdit.imagenUrl,
      referenciaCatastral: editReferenciaCatastral.trim() || undefined,
      datosCatastrales,
      codigoPostal: editCodigoPostal.trim() || undefined,
      propietarioId: editSelectedPropId || undefined,
      propietarioPrincipalId: editSelectedPropId || undefined,
      propietarioSecundarioId: editTieneSegundoProp && editSelectedProp2Id ? editSelectedProp2Id : undefined,
      cuentaBancariaCobroId: editSelectedCuentaId && editSelectedCuentaId !== 'custom' ? editSelectedCuentaId : undefined,
      ibanCobro: editIbanCobro.trim() || undefined,
      datosFiscales,
    };

    onUpdateInmueble(updated);
    setInmuebleToEdit(null);
  };

  const df = selectedInmueble?.datosFiscales;
  const tieneDatosFiscales = selectedInmueble
    ? !!(
        selectedInmueble.referenciaCatastral ||
        df?.referenciaCatastral ||
        df?.ibanCobro ||
        df?.propietarioPrincipal?.nifDni
      )
    : false;

  return (
    <div className="space-y-6">
      {selectedInmueble ? (
        <div className="space-y-6">
          {/* Top Back Navigation */}
          <button
            onClick={() => setSelectedInmuebleId(null)}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs hover:bg-slate-50 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al listado de inmuebles</span>
          </button>

        {/* Selected Property Header Detail */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-2xs space-y-5">
          {/* Property Image Banner */}
          <div className="relative h-48 sm:h-64 w-full bg-slate-100 rounded-xl overflow-hidden border border-slate-200/80 group">
            <img
              src={getInmuebleCoverUrl(selectedInmueble)}
              alt={selectedInmueble.direccion}
              className="w-full h-full object-cover"
            />
            {selectedInmueble.imagenIa && (
              <div className="absolute top-3 left-3">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-900/85 text-amber-300 backdrop-blur-xs flex items-center gap-1.5 border border-amber-400/40 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Fotografía generada con IA</span>
                </span>
              </div>
            )}

            <button
              onClick={() => setGestionImagenesInmueble(selectedInmueble)}
              className="absolute bottom-3 right-3 px-3 py-2 bg-slate-900/85 hover:bg-slate-900 text-white rounded-xl text-xs font-bold backdrop-blur-xs border border-white/20 shadow-md transition-all flex items-center gap-2"
              title="Gestionar fotos de la propiedad"
            >
              <Camera className="w-4 h-4 text-blue-400" />
              <span>Gestionar imágenes ({selectedInmueble.images?.length || 0})</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    selectedInmueble.estado === 'disponible'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-purple-100 text-purple-800 border border-purple-200'
                  }`}
                >
                  {selectedInmueble.estado === 'disponible' ? 'Disponible' : 'Alquilado'}
                </span>
                <span className="font-mono text-xs font-bold px-2.5 py-0.5 bg-slate-100 text-slate-800 rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-2xs">
                  <span>ID Físico: {selectedInmueble.id}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedInmueble.id, 'inmId')}
                    className="p-0.5 hover:text-blue-600 rounded text-slate-400 hover:bg-slate-200 transition-colors"
                    title="Copiar ID permanente del inmueble"
                  >
                    {copiedField === 'inmId' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </span>
                <span className="text-xs font-semibold px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                  {selectedInmueble.modalidadAlquiler === 'habitaciones' ? 'Alquiler por Habitaciones' : 'Alquiler Completo'}
                </span>
                <span className="text-xs text-slate-500">• {selectedInmueble.ciudad}</span>
                {selectedInmueble.codigoPostal && (
                  <span className="text-xs text-slate-500 font-mono">({selectedInmueble.codigoPostal})</span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{selectedInmueble.direccion}</h2>

              {/* Linked Owner & Current Tenant summary bar */}
              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-600">
                <div className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg">
                  <Landmark className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span className="font-medium text-slate-700">
                    Propietario:{' '}
                    <strong className="text-slate-900">
                      {linkedPropietarioPrincipal?.nombre || selectedInmueble.datosFiscales?.propietarioPrincipal?.nombre || 'Sin asignar'}
                    </strong>
                  </span>
                  {linkedPropietarioPrincipal?.nifCif && (
                    <span className="font-mono text-[11px] text-slate-400">({linkedPropietarioPrincipal.nifCif})</span>
                  )}
                </div>

                {selectedInmueble.estado === 'alquilado' && (
                  <div className="inline-flex items-center gap-1.5 bg-purple-50 border border-purple-200 text-purple-900 px-2.5 py-1 rounded-lg">
                    <UserCheck className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                    <span>
                      Inquilino actual:{' '}
                      <strong className="text-purple-950 font-bold">
                        {activeContract?.candidatoNombre || selectedInmueble.inquilinoActualNombre || 'Arrendatario formalizado'}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 text-left sm:text-right flex-wrap">
              <div>
                <p className="text-2xl font-extrabold text-blue-600">{formatEuro(selectedInmueble.precio)} <span className="text-sm font-normal text-slate-500">/ mes</span></p>
                <p className="text-xs text-slate-500 mt-0.5">Fianza: {selectedInmueble.fianzaMeses} mes(es)</p>
              </div>

              {/* Edit Property Button */}
              <button
                onClick={() => handleOpenEditModal(selectedInmueble, 'general')}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                title="Editar precio, descripción y datos del inmueble"
              >
                <Edit className="w-4 h-4" />
                <span>Editar Inmueble</span>
              </button>

              <button
                onClick={() => handleOpenEditModal(selectedInmueble, 'fiscal')}
                className="px-3.5 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                title="Editar apartado fiscal y datos de arrendador"
              >
                <FileCheck2 className="w-4 h-4 text-indigo-600" />
                <span>Apartado Fiscal</span>
              </button>

              <button
                onClick={() => setGestionImagenesInmueble(selectedInmueble)}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                title="Gestionar galería de fotos del inmueble"
              >
                <Camera className="w-4 h-4 text-blue-400" />
                <span>Gestionar imágenes</span>
              </button>

              <button
                onClick={() => setVerAgendaInmueble(selectedInmueble)}
                className="px-3 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                title="Consultar agenda de visitas existente"
              >
                <CalendarCheck className="w-4 h-4 text-blue-600" />
                <span className="hidden sm:inline">Ver agenda</span>
              </button>

              {onOpenConfigurarAgenda && (
                <button
                  onClick={() => onOpenConfigurarAgenda(selectedInmueble.id)}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition-colors flex items-center gap-1.5"
                  title="Configurar agenda de visitas"
                >
                  <Clock className="w-4 h-4" />
                  <span className="hidden sm:inline">Crear agenda</span>
                </button>
              )}

              {onDeleteInmueble && (
                <button
                  onClick={() => setInmuebleToDelete(selectedInmueble)}
                  className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl transition-colors font-semibold text-xs flex items-center gap-1.5"
                  title="Eliminar inmueble"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Eliminar</span>
                </button>
              )}
            </div>
          </div>

          {/* Description Section */}
          {selectedInmueble.descripcion && (
            <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <FileText className="w-4 h-4 text-blue-600" />
                <span>Descripción del Inmueble</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                {selectedInmueble.descripcion}
              </p>
            </div>
          )}

          {/* Core Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 text-xs text-slate-600">
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <Bed className="w-4 h-4 text-slate-400" />
              <span>Habitaciones: <strong className="text-slate-900">{selectedInmueble.habitaciones}</strong></span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <Bath className="w-4 h-4 text-slate-400" />
              <span>Baños: <strong className="text-slate-900">{selectedInmueble.banos}</strong></span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <Maximize2 className="w-4 h-4 text-slate-400" />
              <span>Superficie: <strong className="text-slate-900">{selectedInmueble.superficie} m²</strong></span>
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50/60 rounded-xl border border-blue-100">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Candidatos: <strong className="text-blue-600">{interestedCandidates.length}</strong></span>
            </div>
          </div>

          {/* FISCAL DATA CARD */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-slate-50/50">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="font-bold text-sm">Apartado Fiscal y Datos del Arrendador</h3>
                  <p className="text-[11px] text-slate-400">Datos preparados para formalización de contrato LAU y pólizas de impago</p>
                </div>
              </div>
              <button
                onClick={() => handleOpenEditModal(selectedInmueble, 'fiscal')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Editar Fiscal</span>
              </button>
            </div>

            {tieneDatosFiscales ? (
              <div className="p-5 space-y-5 text-xs">
                {/* Inmueble Fiscal Info */}
                <div>
                  <h4 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-1.5 uppercase tracking-wider text-indigo-700">
                    <Building className="w-4 h-4 text-indigo-600" />
                    Identificación Inmueble y Registro
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Referencia Catastral</span>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-bold text-slate-900 text-xs truncate">
                          {selectedInmueble.referenciaCatastral || df?.referenciaCatastral || 'No asignada'}
                        </span>
                        {(selectedInmueble.referenciaCatastral || df?.referenciaCatastral) && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => copyToClipboard(selectedInmueble.referenciaCatastral || df?.referenciaCatastral || '', 'catastro')}
                              className="p-1 hover:bg-slate-100 text-slate-500 rounded"
                              title="Copiar referencia"
                            >
                              {copiedField === 'catastro' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                            <a
                              href="https://www1.sedecatastro.gob.es/CYGConsulta/OVCConsultaCriterios.aspx"
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 hover:bg-slate-100 text-indigo-600 rounded"
                              title="Consultar en Sede del Catastro"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Código Postal y Ciudad</span>
                      <span className="font-semibold text-slate-900 text-xs">
                        {selectedInmueble.codigoPostal || df?.codigoPostal || '—'} {selectedInmueble.ciudad}
                      </span>
                    </div>

                    {selectedInmueble.datosCatastrales && (
                      <div className="p-3 bg-white rounded-xl border border-indigo-200">
                        <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-0.5 flex items-center gap-1">
                          <Landmark className="w-3 h-3" /> Datos catastrales
                        </span>
                        <span className="font-semibold text-slate-900 text-[11px] block">
                          {selectedInmueble.datosCatastrales.anioConstruccion
                            ? `Año ${selectedInmueble.datosCatastrales.anioConstruccion} (${new Date().getFullYear() - selectedInmueble.datosCatastrales.anioConstruccion} años)`
                            : 'Año sin indicar'}
                          {selectedInmueble.datosCatastrales.superficieCatastralConstruida
                            ? ` · ${selectedInmueble.datosCatastrales.superficieCatastralConstruida} m² cat.`
                            : ''}
                        </span>
                        {selectedInmueble.datosCatastrales.valorCatastral ? (
                          <span className="text-[10px] text-slate-500 block">
                            Valor catastral {selectedInmueble.datosCatastrales.valorCatastral.toLocaleString('es-ES')} € (no es valor de mercado)
                          </span>
                        ) : null}
                      </div>
                    )}

                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">IBAN Cobro de Renta</span>
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono font-semibold text-slate-900 text-xs">
                          {df?.ibanCobro || 'No configurado'}
                        </span>
                        {df?.ibanCobro && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(df.ibanCobro!, 'iban')}
                            className="p-1 hover:bg-slate-100 text-slate-500 rounded shrink-0"
                            title="Copiar IBAN"
                          >
                            {copiedField === 'iban' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Certificado Energético</span>
                      <span className="font-semibold text-slate-900 text-xs">
                        {df?.certificadoEnergetico || 'Pendiente'}
                      </span>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Nº Registro Propiedad</span>
                      <span className="font-semibold text-slate-900 text-xs">
                        {df?.numeroRegistroPropiedad || 'No indicado'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Arrendador Principal */}
                <div className="pt-2 border-t border-slate-200/80">
                  <h4 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-1.5 uppercase tracking-wider text-indigo-700">
                    <User className="w-4 h-4 text-indigo-600" />
                    Arrendador / Propietario Principal
                  </h4>
                  <div className="p-4 bg-white rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Nombre / Razón Social</span>
                      <strong className="text-slate-900 text-xs">{df?.propietarioPrincipal?.nombre || 'Propietario'}</strong>
                      {df?.propietarioPrincipal?.esPersonaJuridica && (
                        <span className="inline-block px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded ml-1.5">Persona Jurídica / Sociedad</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">NIF / CIF / DNI</span>
                      <span className="font-mono font-semibold text-slate-800 text-xs">{df?.propietarioPrincipal?.nifDni || 'No indicado'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Dirección Fiscal</span>
                      <span className="text-slate-700 text-xs">{df?.propietarioPrincipal?.direccion || 'Misma que el inmueble'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Contacto Arrendador</span>
                      <span className="text-slate-700 text-xs block">{df?.propietarioPrincipal?.telefono || '—'}</span>
                      <span className="text-slate-500 text-[11px] truncate block">{df?.propietarioPrincipal?.email || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Segundo Propietario si existe */}
                {df?.tieneSegundoPropietario && df?.segundoPropietario && (
                  <div className="pt-2 border-t border-slate-200/80">
                    <h4 className="font-bold text-slate-800 text-xs mb-3 flex items-center gap-1.5 uppercase tracking-wider text-indigo-700">
                      <Users className="w-4 h-4 text-indigo-600" />
                      Segundo Propietario / Co-Arrendador
                    </h4>
                    <div className="p-4 bg-white rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Nombre / Razón Social</span>
                        <strong className="text-slate-900 text-xs">{df.segundoPropietario.nombre}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">NIF / CIF</span>
                        <span className="font-mono font-semibold text-slate-800 text-xs">{df.segundoPropietario.nifDni || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Dirección</span>
                        <span className="text-slate-700 text-xs">{df.segundoPropietario.direccion || '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Contacto</span>
                        <span className="text-slate-700 text-xs block">{df.segundoPropietario.telefono || '—'}</span>
                        <span className="text-slate-500 text-[11px] truncate block">{df.segundoPropietario.email || '—'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center bg-white space-y-3">
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto">
                  <h4 className="font-bold text-slate-900 text-sm">Apartado fiscal no configurado</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Añade la referencia catastral, IBAN de cobro y datos del arrendador para automatizar contratos LAU y pólizas de seguro de impago sin reescribirlos.
                  </p>
                </div>
                <button
                  onClick={() => handleOpenEditModal(selectedInmueble, 'fiscal')}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Configurar datos fiscales ahora</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* HISTORIAL DE CONTRATOS E INQUILINOS PERMANENTE DEL INMUEBLE */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-lg">Historial de Contratos e Inquilinos</h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold">
                    {propertyContracts.length} registro(s)
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Toda la historia de alquileres se conserva permanentemente vinculada al ID del inmueble (<span className="font-mono font-semibold text-slate-700">{selectedInmueble.id}</span>)
                </p>
              </div>
            </div>

            {onOpenFormalizarModal && (
              <button
                type="button"
                onClick={() => {
                  if (interestedCandidates.length > 0) {
                    setSelectedCandidatoParaContrato(interestedCandidates[0].id);
                  } else if (candidatos.length > 0) {
                    setSelectedCandidatoParaContrato(candidatos[0].id);
                  }
                  setShowFormalizarNuevoContratoModal(true);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-auto"
              >
                <FileSignature className="w-4 h-4" />
                <span>Formalizar Nuevo Contrato</span>
              </button>
            )}
          </div>

          {/* Si existe Contrato Vigente */}
          {activeContract ? (
            <div className="p-4 bg-gradient-to-r from-purple-50/80 via-indigo-50/50 to-blue-50/60 border border-purple-200/90 rounded-2xl space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-purple-700 text-white shadow-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>CONTRATO EN VIGOR</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-700 bg-white/80 px-2 py-0.5 rounded-md border border-purple-200">
                    Ref: {activeContract.id}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {onOpenFormalizarModal && (
                    <button
                      type="button"
                      onClick={() => {
                        const cand = candidatos.find((c) => c.id === activeContract.candidatoId) || ({
                          id: activeContract.candidatoId,
                          nombre: activeContract.candidatoNombre,
                          email: activeContract.candidatoEmail,
                          telefono: activeContract.candidatoTelefono,
                          dni: activeContract.candidatoDni,
                          inmuebleId: selectedInmueble.id,
                          estado: 'aprobado',
                          puntuacionScoring: 85,
                        } as unknown as Candidato);
                        onOpenFormalizarModal(cand, selectedInmueble, activeContract);
                      }}
                      className="px-3 py-1.5 bg-white border border-purple-300 hover:bg-purple-100 text-purple-800 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>Ver / Editar Contrato</span>
                    </button>
                  )}

                  {onRecomercializarInmueble && selectedInmueble && (
                    <button
                      type="button"
                      onClick={() =>
                        onRecomercializarInmueble(selectedInmueble.id, activeContract?.id)
                      }
                      className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1"
                      title="El inquilino se va: abre un expediente de salida, inspección y nueva comercialización"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Recomercializar</span>
                    </button>
                  )}

                  {onFinalizarContrato && (
                    <button
                      type="button"
                      disabled={isFinalizandoContrato}
                      onClick={async () => {
                        const confirmed = window.confirm(
                          `¿Confirmas la finalización del contrato con ${activeContract.candidatoNombre}?\n\nEl contrato pasará a estado FINALIZADO (conservado permanentemente en el historial de este inmueble) y la vivienda quedará en estado DISPONIBLE para un nuevo alquiler.`
                        );
                        if (!confirmed) return;
                        try {
                          setIsFinalizandoContrato(true);
                          await onFinalizarContrato(activeContract.id);
                        } finally {
                          setIsFinalizandoContrato(false);
                        }
                      }}
                      className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 disabled:opacity-50"
                      title="Concluir el alquiler actual y dejar la vivienda disponible"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>{isFinalizandoContrato ? 'Finalizando...' : 'Finalizar Alquiler'}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-purple-100 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Inquilino Actual</span>
                  <strong className="text-slate-900 text-xs block font-bold">{activeContract.candidatoNombre}</strong>
                  <span className="font-mono text-slate-500 text-[11px] block">{activeContract.candidatoDni || 'DNI no indicado'}</span>
                  {activeContract.candidatoTelefono && (
                    <span className="text-slate-500 text-[11px] block mt-0.5">{activeContract.candidatoTelefono}</span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Periodo y Duración</span>
                  <span className="font-semibold text-slate-800 block">
                    {formatDate(activeContract.fechaInicioContrato)} → {activeContract.fechaFinContrato ? formatDate(activeContract.fechaFinContrato) : 'En vigor (LAU)'}
                  </span>
                  <span className="text-[11px] text-slate-500 block">Duración: {activeContract.duracionAnos || 1} año(s)</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Renta & Fianza</span>
                  <strong className="text-indigo-700 text-sm block font-extrabold">{formatEuro(activeContract.rentaMensual)} / mes</strong>
                  <span className="text-[11px] text-slate-500 block">Fianza Legal: {formatEuro(activeContract.fianzaLegalImporte)}</span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Modalidad & Póliza</span>
                  <span className="font-semibold text-slate-800 text-xs block">
                    {activeContract.modalidadAlquiler === 'habitaciones' ? 'Alquiler por Habitaciones' : 'Vivienda Completa'}
                  </span>
                  <span className={`text-[11px] font-medium block mt-0.5 ${
                    activeContract.evaluacionAsegurabilidad?.dictamen === 'APTO_RECOMENDADO' ? 'text-emerald-700' : 'text-slate-500'
                  }`}>
                    Seguro Impago: {activeContract.evaluacionAsegurabilidad?.dictamen === 'APTO_RECOMENDADO' ? 'Apto Asegurable' : 'En tramitación'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold text-emerald-900">Inmueble actualmente disponible</span>
                  <p className="text-[11px] text-emerald-700">Sin contrato activo en curso. Listo para seleccionar candidato y formalizar nuevo contrato.</p>
                </div>
              </div>
              {onOpenFormalizarModal && (
                <button
                  type="button"
                  onClick={() => {
                    if (interestedCandidates.length > 0) {
                      setSelectedCandidatoParaContrato(interestedCandidates[0].id);
                    } else if (candidatos.length > 0) {
                      setSelectedCandidatoParaContrato(candidatos[0].id);
                    }
                    setShowFormalizarNuevoContratoModal(true);
                  }}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs shrink-0 transition-colors"
                >
                  Formalizar Contrato
                </button>
              )}
            </div>
          )}

          {/* Histórico de contratos cerrados / finalizados */}
          {historicalContracts.length > 0 ? (
            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>Archivo Histórico de Contratos ({historicalContracts.length})</span>
              </h4>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {historicalContracts.map((hist) => {
                  const estadoInfo = getFormalizacionEstadoInfo(hist.estado);
                  return (
                    <div key={hist.id} className="p-3.5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-slate-900 font-bold">{hist.candidatoNombre}</strong>
                          {hist.candidatoDni && <span className="font-mono text-slate-500 text-[11px]">({hist.candidatoDni})</span>}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${estadoInfo.badgeClass}`}>
                            {estadoInfo.label}
                          </span>
                          <span className="text-slate-400 text-[11px] font-mono">• Ref: {hist.id}</span>
                        </div>

                        <div className="flex items-center gap-4 text-slate-500 text-[11px] flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>
                              {formatDate(hist.fechaInicioContrato)} {hist.fechaFinContrato ? `al ${formatDate(hist.fechaFinContrato)}` : ''}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Receipt className="w-3 h-3 text-slate-400" />
                            <span className="font-semibold text-slate-700">{formatEuro(hist.rentaMensual)} / mes</span>
                          </span>
                          <span>Fianza: {formatEuro(hist.fianzaLegalImporte)}</span>
                          {hist.modalidadAlquiler && (
                            <span className="text-slate-400">
                              Modalidad: {hist.modalidadAlquiler === 'habitaciones' ? 'Habitaciones' : 'Vivienda Completa'}
                            </span>
                          )}
                        </div>
                      </div>

                      {onOpenFormalizarModal && (
                        <button
                          type="button"
                          onClick={() => {
                            const cand = candidatos.find((c) => c.id === hist.candidatoId) || ({
                              id: hist.candidatoId,
                              nombre: hist.candidatoNombre,
                              email: hist.candidatoEmail,
                              telefono: hist.candidatoTelefono,
                              dni: hist.candidatoDni,
                              inmuebleId: selectedInmueble.id,
                              estado: 'aprobado',
                              puntuacionScoring: 80,
                            } as unknown as Candidato);
                            onOpenFormalizarModal(cand, selectedInmueble, hist);
                          }}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold self-start sm:self-center transition-colors"
                        >
                          Ver Contrato
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            !activeContract && (
              <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <FileSignature className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                <p className="font-semibold text-slate-700 text-xs">Sin contratos formalizados en este inmueble</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Cuando formalices un contrato con un candidato, quedará registrado permanentemente en la historia de este inmueble.
                </p>
              </div>
            )
          )}
        </div>

        {/* BLOQUE 1: CENTRO OPERATIVO DEL INMUEBLE (resumen + seguros + averías + histórico) */}
        {selectedInmueble && (
          <CentroOperativoInmueblePanel
            inmueble={selectedInmueble}
            cobros={propertyCobros}
            contratos={contratos}
            currentUser={currentUser}
            onAbrirSeccionGlobal={onAbrirSeccionGlobal}
          />
        )}

        {/* GESTIÓN DE COBROS DE ALQUILER (INMUEBLE → CONTRATO → INQUILINO) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                <Receipt className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-lg">Control Mensual de Cobros de Alquiler</h3>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                    {propertyCobros.length} periodo(s)
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Seguimiento de rentas, pagos recibidos, retrasos y justificantes de este inmueble
                </p>
              </div>
            </div>
          </div>

          {/* Resumen numérico del inmueble */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Previsto Total</span>
              <span className="text-lg font-bold font-mono text-slate-900 block mt-0.5">
                {propertyCobrosMetrics.totalPrevisto.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
              </span>
              <span className="text-[10px] text-slate-400">{propertyCobros.length} mensualidades</span>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-emerald-800 block">Cobrado</span>
              <span className="text-lg font-bold font-mono text-emerald-700 block mt-0.5">
                {propertyCobrosMetrics.totalRecibido.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold">
                {propertyCobrosMetrics.countCobrados} cobros recibidos
              </span>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-amber-800 block">Pendiente</span>
              <span className="text-lg font-bold font-mono text-amber-700 block mt-0.5">
                {propertyCobrosMetrics.totalPendiente.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
              </span>
              <span className="text-[10px] text-amber-600">{propertyCobrosMetrics.countPendientes} en curso</span>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-rose-800 block">Retrasos / Incidencias</span>
              <span className="text-lg font-bold font-mono text-rose-700 block mt-0.5">
                {(propertyCobrosMetrics.totalRetrasado + propertyCobrosMetrics.totalIncidencias).toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
              </span>
              <span className="text-[10px] text-rose-600">
                {propertyCobrosMetrics.countRetrasados} retrasos · {propertyCobrosMetrics.countIncidencias} inc.
              </span>
            </div>
          </div>

          {propertyCobros.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
              <p className="font-semibold text-slate-700 text-xs">Sin cobros generados para este inmueble</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Al existir contratos formalizados, los periodos mensuales se generarán y vincularán automáticamente aquí.
              </p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Periodo</th>
                      <th className="py-2.5 px-3">Inquilino</th>
                      <th className="py-2.5 px-3 text-right">Previsto</th>
                      <th className="py-2.5 px-3 text-right">Recibido</th>
                      <th className="py-2.5 px-3">Fecha Cobro</th>
                      <th className="py-2.5 px-3 text-center">Estado</th>
                      <th className="py-2.5 px-3 text-center">Justificante</th>
                      <th className="py-2.5 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {propertyCobros.map((cobro) => (
                      <tr key={cobro.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                          {cobro.nombreMes}
                          <span className="text-[10px] text-slate-400 block font-normal">
                            Límite: día {cobro.fechaVencimiento.split('-')[2] || 5}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-800">{cobro.inquilinoNombre}</span>
                          {cobro.inquilinoDni && (
                            <span className="text-[10px] text-slate-400 block font-mono">
                              {cobro.inquilinoDni}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                          {cobro.importePrevisto.toFixed(2)} €
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {cobro.importeRecibido > 0 ? (
                            <span className="font-mono font-bold text-emerald-700">
                              {cobro.importeRecibido.toFixed(2)} €
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono">0,00 €</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                          {cobro.fechaPago || <span className="text-slate-400 italic">—</span>}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              cobro.estado === 'RECIBIDO' || cobro.estado === 'VERIFICADO'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : cobro.estado === 'RETRASADO'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : cobro.estado === 'INCIDENCIA'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {cobro.estado}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {cobro.justificante ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                              title={cobro.justificante.nombreArchivo}
                            >
                              <Paperclip className="w-3 h-3 text-blue-600" />
                              <span className="max-w-[70px] truncate">{cobro.justificante.nombreArchivo}</span>
                            </span>
                          ) : (
                            <span className="text-slate-300 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          {onSaveContrato && (
                            <button
                              type="button"
                              onClick={() => handleOpenPayModal(cobro)}
                              className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg text-[11px] transition-colors inline-flex items-center gap-1"
                            >
                              <Banknote className="w-3 h-3" />
                              <span>{cobro.importeRecibido > 0 ? 'Editar' : 'Registrar'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* FASE 4: Mantenimiento Preventivo, Garantías e Historial Técnico */}
        {selectedInmueble && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <MantenimientoInmueblePanel
              inmueble={selectedInmueble}
              propietarios={propietarios}
              profesionales={profesionales}
              currentUser={currentUser || undefined}
            />
          </div>
        )}

        {/* FASE 4.5: Circuito Operativo de Reformas y Revalorización */}
        {selectedInmueble && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
            <ReformasInmueblePanel
              inmueble={selectedInmueble}
              profesionales={profesionales}
              currentUser={currentUser || undefined}
            />
          </div>
        )}

        {/* ARENA C: Ficha Técnica e Inventario del Inmueble */}
        {selectedInmueble && (
          <FichaTecnicaInventarioPanel
            inmueble={selectedInmueble}
            currentUser={currentUser}
            profesional={null}
            onUpdateInmueble={onUpdateInmueble}
          />
        )}

        {/* ARENA C: Gestión de Habitaciones */}
        {selectedInmueble && (
          <HabitacionesInmueblePanel
            inmueble={selectedInmueble}
            currentUser={currentUser}
            profesional={null}
            contratos={contratos}
            onUpdateInmueble={onUpdateInmueble}
          />
        )}

        {/* GAP 5: SINDICACIÓN Y PUBLICACIÓN MULTICANAL (capa desacoplada, solo exporta) */}
        <PublicacionInmueblesPanel inmueble={selectedInmueble} currentUser={currentUser} />

        {/* Candidates Interested in this Property */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Candidatos Interesados ({interestedCandidates.length})</h3>
              <p className="text-xs text-slate-500">Solicitantes vinculados a esta vivienda</p>
            </div>
          </div>

          {interestedCandidates.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-medium">No hay candidatos registrados para esta vivienda todavía.</p>
              <p className="text-xs text-slate-400 mt-1">Añade un nuevo candidato vinculándolo a este inmueble.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {interestedCandidates.map((cand) => (
                <div
                  key={cand.id}
                  onClick={() => onSelectCandidate(cand)}
                  className="p-4 rounded-xl border border-slate-200/80 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50 transition-all cursor-pointer space-y-3 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                        {cand.nombre.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm group-hover:text-blue-600 transition-colors">
                          {cand.nombre}
                        </h4>
                        <p className="text-xs text-slate-500">{cand.telefono}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getCandidateStatusBadgeStyle(cand.estado)}`}>
                      {getCandidateStatusLabel(cand.estado)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Ingresos:</span>
                      <strong className="text-slate-800">{formatEuro(cand.ingresosNetos)}/m</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Inquilinos:</span>
                      <strong className="text-slate-800">{cand.numPersonas} pers.</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                    <span>Score: <strong className="text-slate-800">{cand.scoreEstimado ? `${cand.scoreEstimado}/100` : 'En revisión'}</strong></span>
                    <span className="text-blue-600 font-medium group-hover:underline flex items-center gap-1">
                      Ver ficha completa
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    ) : (
      <>
        {/* Controls: Search & Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por dirección, ciudad, catastro o propietario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter State Tabs & Add Button */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 w-full sm:w-auto bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setFilterState('todos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-1 sm:flex-initial ${
                filterState === 'todos' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({inmuebles.length})
            </button>
            <button
              onClick={() => setFilterState('disponible')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-1 sm:flex-initial ${
                filterState === 'disponible' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Disponibles
            </button>
            <button
              onClick={() => setFilterState('alquilado')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-1 sm:flex-initial ${
                filterState === 'alquilado' ? 'bg-white text-slate-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Alquilados
            </button>
          </div>

          {onAddInmueble && (
            <button
              onClick={abrirAltaGeneral}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Inmueble</span>
            </button>
          )}
        </div>
      </div>

      {/* Property Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredInmuebles.map((inm) => {
          const count = candidatos.filter((c) => c.inmuebleId === inm.id).length;
          const df = inm.datosFiscales;
          const hasFiscal = !!(inm.referenciaCatastral || df?.referenciaCatastral || df?.ibanCobro);
          const propId = inm.propietarioId || inm.propietarioPrincipalId || df?.propietarioPrincipal?.propietarioId;
          const ownerObj = propId ? propietarios.find((p) => p.id === propId) : null;
          const propName = ownerObj?.nombre || df?.propietarioPrincipal?.nombre;
          const activeContratoInm = contratos.find((c) => c.inmuebleId === inm.id && (c.estado === 'FORMALIZADO_ACTIVO' || c.esVigente));

          return (
            <div
              key={inm.id}
              onClick={() => setSelectedInmuebleId(inm.id)}
              className="bg-white rounded-2xl border border-slate-200/80 hover:border-blue-400 overflow-hidden shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group relative"
            >
              <div>
                {/* Image / Header bar */}
                <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
                  <img
                    src={getInmuebleCoverUrl(inm)}
                    alt={inm.direccion}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* Camera button on card image header */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGestionImagenesInmueble(inm);
                    }}
                    className="absolute bottom-3 left-3 px-2.5 py-1 bg-slate-900/80 hover:bg-slate-900 text-white rounded-lg text-[11px] font-bold backdrop-blur-xs border border-white/20 shadow-sm flex items-center gap-1 transition-all z-10"
                    title="Gestionar imágenes del inmueble"
                  >
                    <Camera className="w-3.5 h-3.5 text-blue-400" />
                    <span>Fotos ({inm.images?.length || 0})</span>
                  </button>
                  <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${
                        inm.estado === 'disponible'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-800/80 backdrop-blur-xs text-slate-200'
                      }`}
                    >
                      {inm.estado === 'disponible' ? 'Disponible' : 'Alquilado'}
                    </span>

                    {inm.imagenIa && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900/85 text-amber-300 backdrop-blur-xs flex items-center gap-1 border border-amber-400/40 shadow-xs">
                        <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                        <span>Generada con IA</span>
                      </span>
                    )}
                  </div>

                  {/* Edit and Delete buttons on property card */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal(inm, 'general');
                      }}
                      className="p-1.5 rounded-full bg-slate-900/80 hover:bg-blue-600 text-white backdrop-blur-xs transition-colors shadow-sm"
                      title="Editar inmueble"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    {onDeleteInmueble && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInmuebleToDelete(inm);
                        }}
                        className="p-1.5 rounded-full bg-slate-900/80 hover:bg-rose-600 text-white backdrop-blur-xs transition-colors shadow-sm"
                        title="Eliminar inmueble"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="absolute bottom-3 right-3 bg-slate-900/80 backdrop-blur-xs text-white px-3 py-1 rounded-xl font-bold text-sm">
                    {formatEuro(inm.precio)} / mes
                  </div>
                </div>

                {/* Body Details */}
                <div className="p-5 space-y-3">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                        {inm.id}
                      </span>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200">
                        {inm.modalidadAlquiler === 'habitaciones' ? 'Habitaciones' : 'Completo'}
                      </span>
                      {propName && (
                        <span className="text-[10px] text-slate-600 truncate max-w-[170px]" title={propName}>
                          Prop: <strong className="text-slate-800 font-semibold">{propName}</strong>
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors">
                      {inm.direccion}
                    </h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {inm.ciudad}
                      {inm.codigoPostal && <span className="font-mono text-slate-400">• CP {inm.codigoPostal}</span>}
                    </p>
                  </div>

                  {inm.estado === 'alquilado' && (
                    <div className="p-2 bg-purple-50/90 border border-purple-200/90 rounded-xl text-xs flex items-center gap-2 text-purple-900">
                      <UserCheck className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                      <span className="truncate">
                        Inquilino:{' '}
                        <strong className="font-bold text-purple-950">
                          {inm.inquilinoActualNombre || activeContratoInm?.candidatoNombre || 'Arrendatario formalizado'}
                        </strong>
                      </span>
                    </div>
                  )}

                  {inm.descripcion && (
                    <p className="text-xs text-slate-500 line-clamp-2 italic bg-slate-50 p-2 rounded-xl border border-slate-100">
                      "{inm.descripcion}"
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Bed className="w-3.5 h-3.5 text-slate-400" />
                      <span>{inm.habitaciones} hab.</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Bath className="w-3.5 h-3.5 text-slate-400" />
                      <span>{inm.banos} baño(s)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{inm.superficie} m²</span>
                    </div>
                  </div>

                  {/* Fiscal mini-badge */}
                  <div className="flex items-center justify-between pt-0.5 text-[11px]">
                    {hasFiscal ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                        <FileCheck2 className="w-3 h-3 text-emerald-600" />
                        <span>Datos fiscales completos</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
                        <Info className="w-3 h-3 text-amber-600" />
                        <span>Fiscal pendiente de rellenar</span>
                      </span>
                    )}

                    {(inm.referenciaCatastral || df?.referenciaCatastral) && (
                      <span className="font-mono text-[10px] text-slate-500 truncate max-w-[140px]">
                        Ref: {inm.referenciaCatastral || df?.referenciaCatastral}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-blue-700 flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  {count} Candidatos
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(inm, 'general');
                    }}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-700 rounded-xl font-bold flex items-center gap-1 shadow-2xs transition-all"
                    title="Editar datos e información del inmueble"
                  >
                    <Edit className="w-3.5 h-3.5 text-blue-600" />
                    <span>Editar</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(inm, 'fiscal');
                    }}
                    className="px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl font-bold flex items-center gap-1 shadow-2xs transition-all"
                    title="Configurar o editar apartado fiscal"
                  >
                    <FileCheck2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Fiscal</span>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setVerAgendaInmueble(inm);
                    }}
                    className="px-2.5 py-1.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-xl font-bold flex items-center gap-1 shadow-2xs transition-all"
                    title="Consultar agenda de visitas existente para este inmueble"
                  >
                    <CalendarCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Ver agenda</span>
                  </button>

                  {onOpenConfigurarAgenda && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenConfigurarAgenda(inm.id);
                      }}
                      className="px-2.5 py-1.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center gap-1 shadow-2xs transition-all"
                      title="Crear agenda de visitas para este inmueble"
                    >
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      <span>Agenda</span>
                    </button>
                  )}

                  {onOpenLinkModal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenLinkModal(inm);
                      }}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-600 text-slate-700 rounded-xl font-bold flex items-center gap-1 shadow-2xs transition-all"
                      title="Generar enlace de solicitud"
                    >
                      <LinkIcon className="w-3.5 h-3.5 text-blue-600" />
                      <span>Enlace</span>
                    </button>
                  )}

                  <span className="text-slate-500 font-medium group-hover:text-blue-600 flex items-center gap-0.5">
                    Ver
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </>
    )}

      {/* EDIT PROPERTY MODAL DIALOG */}
      {inmuebleToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 my-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base">Editar Inmueble & Apartado Fiscal</h3>
              </div>
              <button
                onClick={() => setInmuebleToEdit(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setEditTab('general')}
                className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  editTab === 'general'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Datos Generales y Vivienda</span>
              </button>
              <button
                type="button"
                onClick={() => setEditTab('fiscal')}
                className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  editTab === 'fiscal'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Apartado Fiscal & Arrendador</span>
              </button>
            </div>

            <form onSubmit={handleSaveEditSubmit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {editTab === 'general' ? (
                <>
                  <div className="p-3 bg-slate-100/90 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                      <div>
                        <span className="font-bold text-slate-800">Inmueble Físico Permanente:</span>{' '}
                        <span className="font-mono font-bold text-blue-700">{inmuebleToEdit.id}</span>
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">Historial conservado bajo este ID</span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Dirección del Inmueble *</label>
                    <input
                      type="text"
                      required
                      value={editDireccion}
                      onChange={(e) => setEditDireccion(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Ciudad *</label>
                      <input
                        type="text"
                        required
                        value={editCiudad}
                        onChange={(e) => setEditCiudad(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Precio Alquiler (€/mes) *</label>
                      <input
                        type="number"
                        required
                        min="100"
                        value={editPrecio}
                        onChange={(e) => setEditPrecio(Number(e.target.value))}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-extrabold text-sm text-blue-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Descripción de la Vivienda</label>
                    <textarea
                      rows={3}
                      placeholder="Añade detalles sobre la propiedad, reformas, estado, equipamiento..."
                      value={editDescripcion}
                      onChange={(e) => setEditDescripcion(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Habitaciones</label>
                      <input
                        type="number"
                        min="1"
                        value={editHabitaciones}
                        onChange={(e) => setEditHabitaciones(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Baños</label>
                      <input
                        type="number"
                        min="1"
                        value={editBanos}
                        onChange={(e) => setEditBanos(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Superficie (m²)</label>
                      <input
                        type="number"
                        min="10"
                        value={editSuperficie}
                        onChange={(e) => setEditSuperficie(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Fianza (Meses)</label>
                      <input
                        type="number"
                        min="0"
                        max="6"
                        value={editFianza}
                        onChange={(e) => setEditFianza(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Estado</label>
                      <select
                        value={editEstado}
                        onChange={(e) => setEditEstado(e.target.value as 'disponible' | 'alquilado')}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
                      >
                        <option value="disponible">Disponible</option>
                        <option value="alquilado">Alquilado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Modalidad</label>
                      <select
                        value={editModalidadAlquiler}
                        onChange={(e) => setEditModalidadAlquiler(e.target.value as 'completo' | 'habitaciones')}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
                      >
                        <option value="completo">Completo</option>
                        <option value="habitaciones">Por Habitaciones</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                /* FISCAL TAB */
                <div className="space-y-4">
                  {/* Propietario Selector Card */}
                  <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-700" />
                        <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                          Seleccionar Propietario Registrado
                        </span>
                      </div>
                      {onNavigateToPropietarios && (
                        <button
                          type="button"
                          onClick={() => {
                            setInmuebleToEdit(null);
                            onNavigateToPropietarios();
                          }}
                          className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Gestionar Propietarios</span>
                        </button>
                      )}
                    </div>

                    <div>
                      <select
                        value={editSelectedPropId}
                        onChange={(e) => handleSelectEditPropietario(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 shadow-2xs"
                      >
                        <option value="">-- Asignación manual / Personalizada --</option>
                        {propietarios.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.nifCif}) — {p.cuentasBancarias.length} cuenta(s) bancaria(s)
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-blue-800/80 mt-1">
                        Al elegir un propietario de la lista, sus datos fiscales y su cuenta bancaria se vincularán automáticamente.
                      </p>
                    </div>

                    {/* Selected Owner Quick Info Badge */}
                    {editSelectedPropId && (() => {
                      const selectedProp = propietarios.find((p) => p.id === editSelectedPropId);
                      if (!selectedProp) return null;
                      return (
                        <div className="p-2.5 bg-white/90 border border-blue-200/80 rounded-lg text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{selectedProp.nombre}</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-mono text-[10px] font-bold">
                              {selectedProp.nifCif}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate">{selectedProp.direccion}{selectedProp.ciudad ? `, ${selectedProp.ciudad}` : ''}</p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Property Data */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Referencia Catastral</label>
                      <input
                        type="text"
                        placeholder="Ej. 9876543VK4797S0001TR (20 caracteres)"
                        value={editReferenciaCatastral}
                        onChange={(e) => setEditReferenciaCatastral(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Código Postal</label>
                      <input
                        type="text"
                        placeholder="Ej. 28001"
                        value={editCodigoPostal}
                        onChange={(e) => setEditCodigoPostal(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  {/* FASE 3.5.1 — Detalle catastral para la valoración */}
                  <div className="p-3.5 bg-indigo-50/40 border border-indigo-200 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="block font-semibold text-indigo-900 text-xs flex items-center gap-1.5">
                        <Landmark className="w-4 h-4 text-indigo-600" />
                        <span>Datos catastrales (la IA de precio los usa para comparar viviendas de las mismas características y zona)</span>
                      </label>
                      <button
                        type="button"
                        onClick={handleConsultarCatastro}
                        disabled={catastroConsultando}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 disabled:opacity-60"
                      >
                        {catastroConsultando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        Validar con Catastro
                      </button>
                    </div>
                    {catastroAviso && (
                      <p className={`text-[11px] rounded-lg px-2 py-1 ${catastroAviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                        {catastroAviso.texto}
                      </p>
                    )}
                    {editCatastro.direccionCatastral && (
                      <p className="text-[11px] text-indigo-900/80">
                        Domicilio Catastro: <b>{editCatastro.direccionCatastral}</b>
                        {editCatastro.latitud && editCatastro.longitud ? ` (${editCatastro.latitud.toFixed(5)}, ${editCatastro.longitud.toFixed(5)})` : ''}
                      </p>
                    )}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Año construcción</label>
                        <input
                          type="number"
                          placeholder="Ej. 1985"
                          value={editCatastro.anioConstruccion ?? ''}
                          onChange={(e) => setEditCatastro((p) => ({ ...p, anioConstruccion: e.target.value === '' ? undefined : Number(e.target.value) }))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">m² catastrales</label>
                        <input
                          type="number"
                          placeholder="Ej. 92"
                          value={editCatastro.superficieCatastralConstruida ?? ''}
                          onChange={(e) => setEditCatastro((p) => ({ ...p, superficieCatastralConstruida: e.target.value === '' ? undefined : Number(e.target.value) }))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Valor catastral (€)</label>
                        <input
                          type="number"
                          placeholder="Del IBI"
                          value={editCatastro.valorCatastral ?? ''}
                          onChange={(e) => setEditCatastro((p) => ({ ...p, valorCatastral: e.target.value === '' ? undefined : Number(e.target.value) }))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">Planta</label>
                        <input
                          type="text"
                          placeholder="Ej. 3º"
                          value={editCatastro.planta ?? ''}
                          onChange={(e) => setEditCatastro((p) => ({ ...p, planta: e.target.value }))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      El Catastro no publica por servicio abierto la superficie, el año ni el valor catastral (sólo localiza la
                      referencia); transcríbelos del IBI o la Sede Electrónica. El valor catastral es administrativo y nunca
                      se usa como valor de mercado.
                    </p>
                  </div>

                  {/* IBAN Selection / Input */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                        <Landmark className="w-4 h-4 text-emerald-600" />
                        <span>Cuenta Bancaria / IBAN para Cobro de Renta</span>
                      </label>
                    </div>

                    {editSelectedPropId && (() => {
                      const selProp = propietarios.find((p) => p.id === editSelectedPropId);
                      const cuentas = selProp?.cuentasBancarias || [];
                      if (cuentas.length > 0) {
                        return (
                          <div className="space-y-2">
                            <select
                              value={editSelectedCuentaId}
                              onChange={(e) => handleSelectEditCuenta(e.target.value)}
                              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                            >
                              {cuentas.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.alias ? `${c.alias} - ` : ''}{c.banco || 'Banco'} ({c.iban}) {c.esPrincipal ? '★ [Principal]' : ''}
                                </option>
                              ))}
                              <option value="custom">-- Introducir otro IBAN manualmente --</option>
                            </select>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <input
                      type="text"
                      placeholder="ESXX XXXX XXXX XXXX XXXX XXXX"
                      value={editIbanCobro}
                      onChange={(e) => {
                        setEditIbanCobro(e.target.value);
                        setEditSelectedCuentaId('custom');
                      }}
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Certificado Eficiencia Energética</label>
                      <input
                        type="text"
                        placeholder="Ej. Calificación E (145 kWh/m² año)"
                        value={editCertificadoEnergetico}
                        onChange={(e) => setEditCertificadoEnergetico(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nº Registro de la Propiedad (Opcional)</label>
                      <input
                        type="text"
                        placeholder="Ej. Registro nº 12 de Madrid, Tomo 1420, Finca 45120"
                        value={editNumeroRegistroPropiedad}
                        onChange={(e) => setEditNumeroRegistroPropiedad(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Arrendador Principal Details Form */}
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1 text-indigo-700">
                        <User className="w-4 h-4 text-indigo-600" />
                        Datos del Arrendador Principal
                      </h4>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={editPropEsPersonaJuridica}
                          onChange={(e) => setEditPropEsPersonaJuridica(e.target.checked)}
                          className="w-4 h-4 rounded text-indigo-600"
                        />
                        <span>¿Es Empresa / Persona Jurídica?</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Nombre o Razón Social</label>
                        <input
                          type="text"
                          placeholder="Ej. Inmobiliaria SL o Juan Pérez"
                          value={editPropNombre}
                          onChange={(e) => setEditPropNombre(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">NIF / CIF / DNI</label>
                        <input
                          type="text"
                          placeholder="Ej. B-87654321 o 12345678Z"
                          value={editPropNif}
                          onChange={(e) => setEditPropNif(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-1">
                        <label className="block font-semibold text-slate-700 mb-1">Dirección Fiscal</label>
                        <input
                          type="text"
                          placeholder="Calle, número, ciudad"
                          value={editPropDireccion}
                          onChange={(e) => setEditPropDireccion(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                        <input
                          type="tel"
                          placeholder="600000000"
                          value={editPropTelefono}
                          onChange={(e) => setEditPropTelefono(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Email</label>
                        <input
                          type="email"
                          placeholder="propietario@correo.com"
                          value={editPropEmail}
                          onChange={(e) => setEditPropEmail(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Segundo Propietario Toggle & Form */}
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs">
                      <input
                        type="checkbox"
                        checked={editTieneSegundoProp}
                        onChange={(e) => setEditTieneSegundoProp(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <span>Inmueble con Segundo Propietario / Co-Arrendador</span>
                    </label>

                    {editTieneSegundoProp && (
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in">
                        {/* Selector for Owner 2 */}
                        {propietarios.length > 0 && (
                          <div>
                            <label className="block font-semibold text-slate-700 text-xs mb-1">
                              Seleccionar 2º Propietario Registrado
                            </label>
                            <select
                              value={editSelectedProp2Id}
                              onChange={(e) => handleSelectEditProp2(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Introducir datos manualmente o sin vincular --</option>
                              {propietarios
                                .filter((p) => p.id !== editSelectedPropId)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nombre} ({p.nifCif})
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Nombre Completo 2º Propietario</label>
                            <input
                              type="text"
                              placeholder="Ej. María López"
                              value={editProp2Nombre}
                              onChange={(e) => setEditProp2Nombre(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">NIF / DNI 2º Propietario</label>
                            <input
                              type="text"
                              placeholder="87654321A"
                              value={editProp2Nif}
                              onChange={(e) => setEditProp2Nif(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Dirección</label>
                            <input
                              type="text"
                              placeholder="Dirección completa"
                              value={editProp2Direccion}
                              onChange={(e) => setEditProp2Direccion(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                            <input
                              type="tel"
                              placeholder="611223344"
                              value={editProp2Telefono}
                              onChange={(e) => setEditProp2Telefono(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Email</label>
                            <input
                              type="email"
                              placeholder="co-propietario@correo.com"
                              value={editProp2Email}
                              onChange={(e) => setEditProp2Email(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const target = inmuebleToEdit;
                    setInmuebleToEdit(null);
                    if (target) setGestionImagenesInmueble(target);
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl flex items-center gap-1.5"
                >
                  <Camera className="w-4 h-4 text-blue-600" />
                  <span>Fotos</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInmuebleToEdit(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md"
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Property Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 my-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base">Añadir Nuevo Inmueble & Apartado Fiscal</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setNewTab('general')}
                className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  newTab === 'general'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Datos Generales y Vivienda</span>
              </button>
              <button
                type="button"
                onClick={() => setNewTab('fiscal')}
                className={`pb-3 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  newTab === 'fiscal'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Apartado Fiscal & Arrendador (Opcional)</span>
              </button>
            </div>

            <form onSubmit={handleCreateInmuebleSubmit} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {newTab === 'general' ? (
                <>
                  <div className="p-3 bg-blue-50/80 rounded-xl border border-blue-200/80 text-xs text-blue-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-blue-950">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span>Registro de Inmueble Físico Permanente</span>
                    </div>
                    <p className="text-[11px] text-blue-800">
                      El inmueble es la entidad física permanente. Toda su historia (contratos, inquilinos sucesivos, precios y modalidades) se conservará bajo su mismo ID único.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-slate-700 mb-1">Dirección del Inmueble *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Calle Gran Vía 42, 3ºB"
                        value={newDireccion}
                        onChange={(e) => setNewDireccion(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">ID Físico (Opcional)</label>
                      <input
                        type="text"
                        placeholder="Auto (inm-...)"
                        value={newIdPersonalizado}
                        onChange={(e) => setNewIdPersonalizado(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500"
                        title="Identificador físico permanente opcional. Si se deja vacío se genera automáticamente."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Ciudad *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Madrid"
                        value={newCiudad}
                        onChange={(e) => setNewCiudad(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Precio Alquiler (€/mes) *</label>
                      <input
                        type="number"
                        required
                        min="100"
                        value={newPrecio}
                        onChange={(e) => setNewPrecio(Number(e.target.value))}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold text-sm text-blue-700"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Descripción de la Vivienda</label>
                    <textarea
                      rows={2}
                      placeholder="Detalles sobre la propiedad, equipamiento, zona..."
                      value={newDescripcion}
                      onChange={(e) => setNewDescripcion(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Habitaciones</label>
                      <input
                        type="number"
                        min="1"
                        value={newHabitaciones}
                        onChange={(e) => setNewHabitaciones(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Baños</label>
                      <input
                        type="number"
                        min="1"
                        value={newBanos}
                        onChange={(e) => setNewBanos(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Superficie (m²)</label>
                      <input
                        type="number"
                        min="10"
                        value={newSuperficie}
                        onChange={(e) => setNewSuperficie(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Fianza (Meses)</label>
                      <input
                        type="number"
                        min="0"
                        max="6"
                        value={newFianza}
                        onChange={(e) => setNewFianza(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Estado Inicial</label>
                      <select
                        value={newEstado}
                        onChange={(e) => setNewEstado(e.target.value as 'disponible' | 'alquilado')}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      >
                        <option value="disponible">Disponible</option>
                        <option value="alquilado">Alquilado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Modalidad</label>
                      <select
                        value={newModalidadAlquiler}
                        onChange={(e) => setNewModalidadAlquiler(e.target.value as 'completo' | 'habitaciones')}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      >
                        <option value="completo">Completo</option>
                        <option value="habitaciones">Por Habitaciones</option>
                      </select>
                    </div>
                  </div>

                  {/* Property Image Upload Section */}
                  <div className="pt-2">
                    <label className="block font-semibold text-slate-700 mb-1.5">Fotografía de la Vivienda</label>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-[11px] font-semibold">
                        <button
                          type="button"
                          onClick={() => setTabImagen('archivo')}
                          className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                            tabImagen === 'archivo' ? 'bg-white text-blue-600 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Subir archivo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTabImagen('url')}
                          className={`px-3 py-1 rounded-lg transition-colors flex items-center gap-1.5 ${
                            tabImagen === 'url' ? 'bg-white text-blue-600 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>URL de imagen</span>
                        </button>
                      </div>

                      {tabImagen === 'archivo' ? (
                        <div>
                          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-4 cursor-pointer bg-white transition-colors">
                            <Upload className="w-6 h-6 text-slate-400 mb-1" />
                            <span className="text-xs font-semibold text-slate-700">Seleccionar foto de tu dispositivo</span>
                            <span className="text-[10px] text-slate-400 mt-0.5">JPG, PNG, WebP</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleImageFileChange}
                              className="hidden"
                            />
                          </label>
                        </div>
                      ) : (
                        <div>
                          <input
                            type="url"
                            placeholder="https://ejemplo.com/fotografia.jpg"
                            value={newImagenUrl}
                            onChange={(e) => setNewImagenUrl(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          />
                        </div>
                      )}

                      {/* Image Preview or AI Notice */}
                      {(newImagenPreview || newImagenUrl.trim()) ? (
                        <div className="relative h-32 w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                          <img
                            src={newImagenPreview || newImagenUrl.trim()}
                            alt="Vista previa"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setNewImagenPreview(null);
                              setNewImagenUrl('');
                            }}
                            className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-rose-600 text-white rounded-full transition-colors shadow-sm"
                            title="Quitar foto"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <div className="absolute bottom-2 left-2 px-2.5 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded-md shadow-2xs flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Foto propia adjuntada</span>
                          </div>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl flex items-start gap-2 text-[11px] text-amber-800">
                          <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <span>Si no adjuntas una foto propia, se asignará automáticamente una imagen de muestra etiquetada como <strong>"Generada con IA"</strong>.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* NEW PROPERTY FISCAL TAB */
                <div className="space-y-4">
                  {/* Propietario Selector Card */}
                  <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-700" />
                        <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                          Seleccionar Propietario Registrado
                        </span>
                      </div>
                      {onNavigateToPropietarios && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddModal(false);
                            onNavigateToPropietarios();
                          }}
                          className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Gestionar Propietarios</span>
                        </button>
                      )}
                    </div>

                    <div>
                      <select
                        value={newSelectedPropId}
                        onChange={(e) => handleSelectNewPropietario(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 shadow-2xs"
                      >
                        <option value="">-- Asignación manual / Personalizada --</option>
                        {propietarios.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nombre} ({p.nifCif}) — {p.cuentasBancarias.length} cuenta(s) bancaria(s)
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-blue-800/80 mt-1">
                        Al elegir un propietario de la lista, sus datos fiscales y su cuenta bancaria se vincularán automáticamente al inmueble.
                      </p>
                    </div>

                    {/* Selected Owner Quick Info Badge */}
                    {newSelectedPropId && (() => {
                      const selectedProp = propietarios.find((p) => p.id === newSelectedPropId);
                      if (!selectedProp) return null;
                      return (
                        <div className="p-2.5 bg-white/90 border border-blue-200/80 rounded-lg text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{selectedProp.nombre}</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-mono text-[10px] font-bold">
                              {selectedProp.nifCif}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 truncate">{selectedProp.direccion}{selectedProp.ciudad ? `, ${selectedProp.ciudad}` : ''}</p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Property Data */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Referencia Catastral</label>
                      <input
                        type="text"
                        placeholder="Ej. 9876543VK4797S0001TR (20 caracteres)"
                        value={newReferenciaCatastral}
                        onChange={(e) => setNewReferenciaCatastral(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Código Postal</label>
                      <input
                        type="text"
                        placeholder="Ej. 28001"
                        value={newCodigoPostal}
                        onChange={(e) => setNewCodigoPostal(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  {/* IBAN Selection / Input */}
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                        <Landmark className="w-4 h-4 text-emerald-600" />
                        <span>Cuenta Bancaria / IBAN para Cobro de Renta</span>
                      </label>
                    </div>

                    {newSelectedPropId && (() => {
                      const selProp = propietarios.find((p) => p.id === newSelectedPropId);
                      const cuentas = selProp?.cuentasBancarias || [];
                      if (cuentas.length > 0) {
                        return (
                          <div className="space-y-2">
                            <select
                              value={newSelectedCuentaId}
                              onChange={(e) => handleSelectNewCuenta(e.target.value)}
                              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                            >
                              {cuentas.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.alias ? `${c.alias} - ` : ''}{c.banco || 'Banco'} ({c.iban}) {c.esPrincipal ? '★ [Principal]' : ''}
                                </option>
                              ))}
                              <option value="custom">-- Introducir otro IBAN manualmente --</option>
                            </select>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    <input
                      type="text"
                      placeholder="ESXX XXXX XXXX XXXX XXXX XXXX"
                      value={newIbanCobro}
                      onChange={(e) => {
                        setNewIbanCobro(e.target.value);
                        setNewSelectedCuentaId('custom');
                      }}
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Certificado Eficiencia Energética</label>
                      <input
                        type="text"
                        placeholder="Ej. Calificación E (145 kWh/m² año)"
                        value={newCertificadoEnergetico}
                        onChange={(e) => setNewCertificadoEnergetico(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">Nº Registro de la Propiedad (Opcional)</label>
                      <input
                        type="text"
                        placeholder="Ej. Registro nº 12 de Madrid, Tomo 1420, Finca 45120"
                        value={newNumeroRegistroPropiedad}
                        onChange={(e) => setNewNumeroRegistroPropiedad(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Arrendador Principal Form */}
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1 text-indigo-700">
                        <User className="w-4 h-4 text-indigo-600" />
                        Datos del Arrendador Principal
                      </h4>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={newPropEsPersonaJuridica}
                          onChange={(e) => setNewPropEsPersonaJuridica(e.target.checked)}
                          className="w-4 h-4 rounded text-indigo-600"
                        />
                        <span>¿Es Empresa / Persona Jurídica?</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Nombre o Razón Social</label>
                        <input
                          type="text"
                          placeholder="Ej. Juan Pérez García o Arrendamientos SL"
                          value={newPropNombre}
                          onChange={(e) => setNewPropNombre(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">NIF / CIF / DNI</label>
                        <input
                          type="text"
                          placeholder="Ej. 12345678Z o B-87654321"
                          value={newPropNif}
                          onChange={(e) => setNewPropNif(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-1">
                        <label className="block font-semibold text-slate-700 mb-1">Dirección Fiscal</label>
                        <input
                          type="text"
                          placeholder="Calle, número, ciudad"
                          value={newPropDireccion}
                          onChange={(e) => setNewPropDireccion(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                        <input
                          type="tel"
                          placeholder="600000000"
                          value={newPropTelefono}
                          onChange={(e) => setNewPropTelefono(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">Email</label>
                        <input
                          type="email"
                          placeholder="propietario@correo.com"
                          value={newPropEmail}
                          onChange={(e) => setNewPropEmail(e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Segundo Propietario Toggle & Form */}
                  <div className="pt-3 border-t border-slate-200 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800 text-xs">
                      <input
                        type="checkbox"
                        checked={newTieneSegundoProp}
                        onChange={(e) => setNewTieneSegundoProp(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <span>Inmueble con Segundo Propietario / Co-Arrendador</span>
                    </label>

                    {newTieneSegundoProp && (
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in">
                        {/* Selector for Owner 2 */}
                        {propietarios.length > 0 && (
                          <div>
                            <label className="block font-semibold text-slate-700 text-xs mb-1">
                              Seleccionar 2º Propietario Registrado
                            </label>
                            <select
                              value={newSelectedProp2Id}
                              onChange={(e) => handleSelectNewProp2(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Introducir datos manualmente o sin vincular --</option>
                              {propietarios
                                .filter((p) => p.id !== newSelectedPropId)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.nombre} ({p.nifCif})
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Nombre Completo 2º Propietario</label>
                            <input
                              type="text"
                              placeholder="Ej. María López"
                              value={newProp2Nombre}
                              onChange={(e) => setNewProp2Nombre(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">NIF / DNI 2º Propietario</label>
                            <input
                              type="text"
                              placeholder="87654321A"
                              value={newProp2Nif}
                              onChange={(e) => setNewProp2Nif(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Dirección</label>
                            <input
                              type="text"
                              placeholder="Dirección completa"
                              value={newProp2Direccion}
                              onChange={(e) => setNewProp2Direccion(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Teléfono</label>
                            <input
                              type="tel"
                              placeholder="611223344"
                              value={newProp2Telefono}
                              onChange={(e) => setNewProp2Telefono(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-slate-700 mb-1">Email</label>
                            <input
                              type="email"
                              placeholder="co-propietario@correo.com"
                              value={newProp2Email}
                              onChange={(e) => setNewProp2Email(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md"
                >
                  Guardar Inmueble
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Formalizar Nuevo Contrato Modal */}
      {showFormalizarNuevoContratoModal && selectedInmueble && onOpenFormalizarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <FileSignature className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">Formalizar Nuevo Contrato</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormalizarNuevoContratoModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1">
                <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>Inmueble Físico Permanente</span>
                </div>
                <p className="text-indigo-800 text-[11px]">
                  <strong>{selectedInmueble.direccion}</strong> ({selectedInmueble.ciudad})
                  <span className="block font-mono text-indigo-600 mt-0.5">ID: {selectedInmueble.id}</span>
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Selecciona el Inquilino / Candidato *
                </label>
                {candidatos.length > 0 ? (
                  <select
                    value={selectedCandidatoParaContrato}
                    onChange={(e) => setSelectedCandidatoParaContrato(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Seleccionar candidato --</option>
                    {interestedCandidates.length > 0 && (
                      <optgroup label="Candidatos de este inmueble">
                        {interestedCandidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} {c.dni ? `(${c.dni})` : ''} - Score: {c.puntuacionScoring || 0}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Todos los candidatos registrados">
                      {candidatos
                        .filter((c) => !interestedCandidates.some((ic) => ic.id === c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} {c.dni ? `(${c.dni})` : ''}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                ) : (
                  <p className="text-amber-700 bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-[11px]">
                    No hay candidatos registrados en el sistema. Puedes crear uno primero en la sección de Candidatos o continuar con un candidato borrador.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowFormalizarNuevoContratoModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!selectedCandidatoParaContrato}
                  onClick={() => {
                    const cand = candidatos.find((c) => c.id === selectedCandidatoParaContrato);
                    if (cand) {
                      onOpenFormalizarModal(cand, selectedInmueble);
                      setShowFormalizarNuevoContratoModal(false);
                    }
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FileSignature className="w-4 h-4" />
                  <span>Abrir Formalización de Contrato</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        isOpen={!!inmuebleToDelete}
        title="¿Eliminar inmueble?"
        description={`¿Estás seguro de que deseas eliminar el inmueble "${inmuebleToDelete?.direccion}"? Los candidatos vinculados pasarán a estado 'Sin inmueble'.`}
        onConfirm={() => {
          if (inmuebleToDelete && onDeleteInmueble) {
            onDeleteInmueble(inmuebleToDelete.id);
            if (selectedInmuebleId === inmuebleToDelete.id) {
              setSelectedInmuebleId(null);
            }
            setInmuebleToDelete(null);
          }
        }}
        onCancel={() => setInmuebleToDelete(null)}
      />

      {/* Image Management Modal */}
      {gestionImagenesInmueble && (
        <GestionImagenesModal
          isOpen={!!gestionImagenesInmueble}
          onClose={() => setGestionImagenesInmueble(null)}
          inmueble={gestionImagenesInmueble}
          onSaveInmueble={(updated) => {
            if (onUpdateInmueble) {
              onUpdateInmueble(updated);
              setGestionImagenesInmueble(updated);
            }
          }}
        />
      )}

      {/* View Agenda Modal */}
      {verAgendaInmueble && (
        <VerAgendaInmuebleModal
          inmueble={verAgendaInmueble}
          slots={slots}
          invitaciones={invitaciones}
          candidatos={candidatos}
          onClose={() => setVerAgendaInmueble(null)}
          onOpenConfigurarAgenda={onOpenConfigurarAgenda}
          onDeleteSlot={onDeleteSlot}
          onDeleteSlotsBatch={onDeleteSlotsBatch}
          onUpdateSlot={onUpdateSlot}
        />
      )}
      {/* Modal Registrar Cobro en Ficha de Inmueble */}
      {cobroToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base">Registrar Cobro: {cobroToPay.nombreMes}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCobroToPay(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePropertyCobro} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{cobroToPay.inquilinoNombre}</span>
                  <span className="font-mono text-xs font-bold text-slate-600">
                    Previsto: {cobroToPay.importePrevisto.toFixed(2)} €
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Fecha límite pactada: {cobroToPay.fechaVencimiento}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Importe Recibido (€) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={payImporte}
                    onChange={(e) => setPayImporte(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha de Cobro *</label>
                  <input
                    type="date"
                    required
                    value={payFecha}
                    onChange={(e) => setPayFecha(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Método de Pago</label>
                  <select
                    value={payMetodo}
                    onChange={(e) => setPayMetodo(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  >
                    <option value="transferencia">Transferencia Bancaria</option>
                    <option value="domiciliacion">Domiciliación</option>
                    <option value="bizum">Bizum</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estado</label>
                  <select
                    value={payEstado}
                    onChange={(e) => setPayEstado(e.target.value as EstadoCobroAlquiler)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900"
                  >
                    <option value="RECIBIDO">RECIBIDO</option>
                    <option value="VERIFICADO">VERIFICADO</option>
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="RETRASADO">RETRASADO</option>
                    <option value="INCIDENCIA">INCIDENCIA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Justificante (PDF o Imagen)</label>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setPayFile(e.target.files[0]);
                    }
                  }}
                  className="w-full text-xs text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Notas adicionales sobre el pago..."
                  value={payObservaciones}
                  onChange={(e) => setPayObservaciones(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCobroToPay(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-100 text-xs transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPay}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Banknote className="w-4 h-4" />
                  <span>{isSubmittingPay ? 'Guardando...' : 'Guardar Cobro'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
