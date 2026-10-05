import React, { useEffect, useState, useMemo } from 'react';
import { ErrorCampo, ResumenErrores, claseEntrada } from '../formularios/CampoFormulario';
import { hayErrores, resumenErrores, validarFormulario } from '../../formularios/validacion';
import { useDialogoAccesible } from '../../accesibilidad/dialogo';
import type { ErroresFormulario } from '../../formularios/validacion';
import { Propietario, CuentaBancariaPropietario, TipoPropietario, Inmueble } from '../../types';
import { clasificarVinculoInmueble, type DescriptorVinculo } from '../../lib/presentacionTitularidad';
import {
  MENSAJE_TITULAR_NO_EXISTE_SECCION,
  generarIdTitularAmbito,
  mensajeErrorGuardadoTitular,
  mensajeTitularDuplicado,
  titularDuplicado,
} from '../../lib/titularesModelo';
import {
  UserCheck,
  Building2,
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  CreditCard,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  Copy,
  Check,
  FileText,
  AlertCircle,
  X,
  Briefcase,
  Home,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface PropietariosSectionProps {
  propietarios: Propietario[];
  inmuebles: Inmueble[];
  /**
   * Guarda una ficha. Puede devolver una promesa: la sección ESPERA, y si se rechaza mantiene el
   * formulario abierto con el error visible (nunca cierra el modal ni pierde lo escrito).
   */
  onSavePropietario: (propietario: Propietario) => void | Promise<void>;
  onDeletePropietario: (propietarioId: string) => void;
  onSelectInmueble?: (inmuebleId: string) => void;
  /** Abre el alta de inmueble ya en el contexto de este propietario. */
  onCrearInmueble?: (propietarioId: string) => void;
  /**
   * ¿Puede esta persona crear/editar fichas de titular? Es un espejo de las Rules (master, y el
   * PROPIETARIO sobre su ficha y las de su ámbito; el gestor NO crea propietarios — S3). Con `false`
   * la sección queda en consulta; nunca se ofrece una acción que Firestore vaya a denegar.
   */
  puedeGestionar?: boolean;
  /**
   * ¿Puede crear fichas NUEVAS? Espejo de `allow create` de `propietarios`. Por defecto,
   * `puedeGestionar`. Para el PROPIETARIO es siempre `true`: puede crear TANTOS titulares como
   * necesite; el botón «Crear titular» no depende de cuántos haya ya ni desaparece tras guardar.
   */
  puedeCrear?: boolean;
  /**
   * Fichas que esta persona puede editar (espejo de `allow update`). `undefined` = todas
   * (master). Un PROPIETARIO edita la suya y las de su ámbito; las ajenas no se ofrecen.
   */
  fichasEditablesIds?: readonly string[];
  /**
   * Id de la ficha PROPIA del titular (PROPIETARIO). «Crear mi ficha» la crea con ESTE id (las Rules
   * solo permiten `propietarioId == myPropId()`).
   */
  idFichaPropia?: string;
  /**
   * PROPIETARIO: su `propietarioId`. Cada ficha NUEVA que crea «Crear titular» lleva este valor en
   * `ambitoPropietarioId` y un id reservado `tit_<token>` único. Sin él (master) el alta es la de siempre.
   */
  ambitoPropietarioId?: string;
  /** PROPIETARIO sin ficha propia: puede además crearla («Crear mi ficha de titular»). */
  puedeCrearFichaPropia?: boolean;
}

export const PropietariosSection: React.FC<PropietariosSectionProps> = ({
  propietarios,
  inmuebles,
  onSavePropietario,
  onDeletePropietario,
  onSelectInmueble,
  onCrearInmueble,
  puedeGestionar = true,
  puedeCrear,
  fichasEditablesIds,
  idFichaPropia,
  ambitoPropietarioId,
  puedeCrearFichaPropia = false,
}) => {
  // Permisos derivados (espejo de las Rules; ver las props). Sin props nuevas = comportamiento previo.
  // NINGUNA de estas condiciones depende de cuántas fichas existan: no hay contador ni tope.
  const puedeCrearFichas = puedeGestionar && (puedeCrear ?? true);
  const puedeCrearMiFicha = puedeGestionar && puedeCrearFichaPropia && Boolean(idFichaPropia);
  const puedeEditarFicha = (prop: Pick<Propietario, 'id'>) =>
    puedeGestionar && (!fichasEditablesIds || fichasEditablesIds.includes(prop.id));
  // La ficha jurídica no se purga (Rules: `allow delete: if false`): el botón solo existe en la
  // administración completa y nunca para el PROPIETARIO.
  const puedeEliminarFichas = puedeGestionar && !fichasEditablesIds;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [editingPropietario, setEditingPropietario] = useState<Propietario | null>(null);
  // Qué crea el alta abierta: un titular del ámbito (por defecto) o la ficha PROPIA del propietario.
  const [modoAlta, setModoAlta] = useState<'titular' | 'propia'>('titular');
  // Guardado asíncrono: el modal espera, y si falla sigue abierto con el error a la vista.
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [avisoGuardado, setAvisoGuardado] = useState<{ nombre: string; nueva: boolean } | null>(null);
  const [guardandoCuenta, setGuardandoCuenta] = useState(false);
  const [errorGuardadoCuenta, setErrorGuardadoCuenta] = useState<string | null>(null);

  // Quick Add Bank Account Modal
  const [quickBankModalOwner, setQuickBankModalOwner] = useState<Propietario | null>(null);
  const [quickAlias, setQuickAlias] = useState('');
  const [quickIban, setQuickIban] = useState('');
  const [quickBanco, setQuickBanco] = useState('');
  const [quickTitular, setQuickTitular] = useState('');
  const [quickEsPrincipal, setQuickEsPrincipal] = useState(false);

  // Delete Confirmation Modal
  const [ownerToDelete, setOwnerToDelete] = useState<Propietario | null>(null);

  // Form State for Main Modal
  const [formTipo, setFormTipo] = useState<TipoPropietario>('persona_fisica');
  // UX-6 §11: semántica de diálogo, foco dentro y Escape en los tres diálogos.
  const cerrarModalPropietario = () => {
    setShowModal(false);
    setErrorGuardado(null);
  };
  const cerrarModalCuenta = () => {
    setQuickBankModalOwner(null);
    setErrorGuardadoCuenta(null);
  };
  const dialogoPropietario = useDialogoAccesible(
    { abierto: showModal, onCerrar: cerrarModalPropietario },
    editingPropietario ? 'Editar propietario' : 'Nuevo propietario'
  );
  const dialogoCuentaBanco = useDialogoAccesible(
    { abierto: Boolean(quickBankModalOwner), onCerrar: cerrarModalCuenta },
    'Añadir cuenta bancaria (IBAN)'
  );
  const dialogoEliminarPropietario = useDialogoAccesible(
    { abierto: Boolean(ownerToDelete), onCerrar: () => setOwnerToDelete(null) },
    'Eliminar propietario'
  );

  // UX-4: errores por campo (antes un único `alert` al guardar).
  const [erroresPropietario, setErroresPropietario] = useState<ErroresFormulario>({});
  const [erroresCuentaBanco, setErroresCuentaBanco] = useState<ErroresFormulario>({});

  // UX-6 §12: el foco va al primer campo con error al fallar la validación.
  useEffect(() => {
    if (!hayErrores(erroresPropietario)) return;
    const contenedor = dialogoPropietario.refDialogo.current;
    contenedor?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [erroresPropietario, dialogoPropietario.refDialogo]);
  const [formNombre, setFormNombre] = useState('');
  const [formNifCif, setFormNifCif] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [formCiudad, setFormCiudad] = useState('');
  const [formCodigoPostal, setFormCodigoPostal] = useState('');
  const [formProvincia, setFormProvincia] = useState('');

  const [formTieneRepresentante, setFormTieneRepresentante] = useState(false);
  const [formNombreRepresentante, setFormNombreRepresentante] = useState('');
  const [formNifRepresentante, setFormNifRepresentante] = useState('');
  const [formCargoRepresentante, setFormCargoRepresentante] = useState('');
  const [formTituloRepresentacion, setFormTituloRepresentacion] = useState('');

  const [formCuentas, setFormCuentas] = useState<CuentaBancariaPropietario[]>([]);
  const [formNotas, setFormNotas] = useState('');
  const [activeTab, setActiveTab] = useState<'fiscal' | 'domicilio' | 'representante' | 'cuentas' | 'notas'>('fiscal');

  // New inline account inside main modal
  const [newAccAlias, setNewAccAlias] = useState('');
  const [newAccIban, setNewAccIban] = useState('');
  const [newAccBanco, setNewAccBanco] = useState('');
  const [newAccTitular, setNewAccTitular] = useState('');
  const [newAccEsPrincipal, setNewAccEsPrincipal] = useState(false);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatIbanInput = (val: string) => {
    const raw = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    // Group in 4s
    return raw.replace(/(.{4})/g, '$1 ').trim();
  };

  // H11 — el vínculo persona↔inmueble se CLASIFICA (titular real vs. dato
  // fiscal/heredado) en vez de colapsar seis relaciones distintas en una lista
  // indistinguible. La clasificación vive en una función pura compartida.
  const getLinkedProperties = (propId: string, propNif: string) => {
    return inmuebles
      .map((inm) => ({ inmueble: inm, vinculo: clasificarVinculoInmueble(inm, { id: propId, nif: propNif }) }))
      .filter((x): x is { inmueble: Inmueble; vinculo: DescriptorVinculo } => x.vinculo !== null);
  };

  const filteredPropietarios = useMemo(() => {
    return propietarios.filter((prop) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        prop.nombre.toLowerCase().includes(q) ||
        prop.nifCif.toLowerCase().includes(q) ||
        prop.email.toLowerCase().includes(q) ||
        prop.telefono.toLowerCase().includes(q) ||
        prop.ciudad.toLowerCase().includes(q) ||
        prop.cuentasBancarias.some(
          (c) => c.iban.toLowerCase().includes(q) || c.alias.toLowerCase().includes(q)
        );

      const matchesTipo = filterTipo === 'todos' || prop.tipoPropietario === filterTipo;
      return matchesSearch && matchesTipo;
    });
  }, [propietarios, searchTerm, filterTipo]);

  const totalCuentas = useMemo(() => {
    return propietarios.reduce((acc, p) => acc + (p.cuentasBancarias?.length || 0), 0);
  }, [propietarios]);

  /**
   * Duplicado por NIF/CIF: la ficha de un titular se crea UNA vez. Se detecta
   * mientras se escribe (aviso inmediato, con acceso a la ficha existente) y se
   * bloquea al guardar; nunca se crea una persona duplicada.
   */
  const duplicadoPorNif = useMemo(
    () => titularDuplicado(propietarios, { nifCif: formNifCif, idExcluido: editingPropietario?.id }),
    [propietarios, formNifCif, editingPropietario?.id],
  );

  const totalInmueblesVinculados = useMemo(() => {
    const linkedIds = new Set<string>();
    inmuebles.forEach((inm) => {
      if (inm.propietarioPrincipalId || inm.propietarioSecundarioId || (Array.isArray(inm.titularesIds) && inm.titularesIds.length > 0)) {
        linkedIds.add(inm.id);
      }
    });
    return linkedIds.size;
  }, [inmuebles]);

  const handleOpenCreateModal = (modo: 'titular' | 'propia' = 'titular') => {
    setEditingPropietario(null);
    setModoAlta(modo);
    setErrorGuardado(null);
    setAvisoGuardado(null);
    setFormTipo('persona_fisica');
    setFormNombre('');
    setFormNifCif('');
    setFormTelefono('');
    setFormEmail('');
    setFormDireccion('');
    setFormCiudad('');
    setFormCodigoPostal('');
    setFormProvincia('');
    setFormTieneRepresentante(false);
    setFormNombreRepresentante('');
    setFormNifRepresentante('');
    setFormCargoRepresentante('');
    setFormTituloRepresentacion('');
    setFormCuentas([]);
    setFormNotas('');
    setActiveTab('fiscal');
    setShowAddAccountForm(false);
    setShowModal(true);
  };

  const handleOpenEditModal = (prop: Propietario) => {
    setEditingPropietario(prop);
    setErrorGuardado(null);
    setAvisoGuardado(null);
    setFormTipo(prop.tipoPropietario || 'persona_fisica');
    setFormNombre(prop.nombre);
    setFormNifCif(prop.nifCif);
    setFormTelefono(prop.telefono || '');
    setFormEmail(prop.email || '');
    setFormDireccion(prop.direccion || '');
    setFormCiudad(prop.ciudad || '');
    setFormCodigoPostal(prop.codigoPostal || '');
    setFormProvincia(prop.provincia || '');
    setFormTieneRepresentante(prop.tieneRepresentanteLegal || false);
    setFormNombreRepresentante(prop.nombreRepresentante || '');
    setFormNifRepresentante(prop.nifRepresentante || '');
    setFormCargoRepresentante(prop.cargoRepresentante || '');
    setFormTituloRepresentacion(prop.tituloRepresentacion || '');
    setFormCuentas(prop.cuentasBancarias ? [...prop.cuentasBancarias] : []);
    setFormNotas(prop.notasPrivadas || '');
    setActiveTab('fiscal');
    setShowAddAccountForm(false);
    setShowModal(true);
  };

  const handleAddAccountToForm = () => {
    if (!newAccIban.trim()) return;
    const formattedIban = formatIbanInput(newAccIban);
    const newAcc: CuentaBancariaPropietario = {
      id: `acc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      alias: newAccAlias.trim() || `Cuenta ${newAccBanco.trim() || 'Principal'}`,
      iban: formattedIban,
      banco: newAccBanco.trim() || undefined,
      titular: newAccTitular.trim() || formNombre.trim() || undefined,
      esPrincipal: newAccEsPrincipal || formCuentas.length === 0,
    };

    let updatedList = [...formCuentas];
    if (newAcc.esPrincipal) {
      updatedList = updatedList.map((c) => ({ ...c, esPrincipal: false }));
    }
    updatedList.push(newAcc);
    setFormCuentas(updatedList);

    // Reset account sub-form
    setNewAccAlias('');
    setNewAccIban('');
    setNewAccBanco('');
    setNewAccTitular('');
    setNewAccEsPrincipal(false);
    setShowAddAccountForm(false);
  };

  const handleRemoveAccountFromForm = (accId: string) => {
    const updated = formCuentas.filter((c) => c.id !== accId);
    // If we removed the principal and there are other accounts, make the first one principal
    if (updated.length > 0 && !updated.some((c) => c.esPrincipal)) {
      updated[0].esPrincipal = true;
    }
    setFormCuentas(updated);
  };

  const handleSetPrincipalAccount = (accId: string) => {
    setFormCuentas((prev) =>
      prev.map((c) => ({
        ...c,
        esPrincipal: c.id === accId,
      }))
    );
  };

  const handleSavePropietarioSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return; // un solo guardado a la vez: un doble clic no crea dos fichas
    // UX-4 §8: reglas reales del formulario, con el mensaje junto al campo.
    const validos = validarFormulario(
      { nombre: formNombre, nifCif: formNifCif, email: formEmail },
      {
        nombre: { etiqueta: 'Nombre/Razón Social', obligatorio: true },
        nifCif: {
          etiqueta: formTipo === 'persona_juridica' ? 'CIF de la Sociedad' : 'NIF / NIE',
          obligatorio: true,
          nif: true,
        },
        email: { etiqueta: 'Email', email: true },
      }
    );
    // Nombre, NIF y email viven en la pestaña «Datos Fiscales»: si falla alguno hay que llevar a la
    // persona allí, o el mensaje quedaría oculto en otra pestaña (se guardaba «sin reacción»).
    if (hayErrores(validos)) {
      setErroresPropietario(validos);
      setActiveTab('fiscal');
      return;
    }
    if (duplicadoPorNif) {
      // Una persona = una ficha. Se ofrece abrir la existente en vez de duplicar.
      setErroresPropietario({ nifCif: mensajeTitularDuplicado(duplicadoPorNif.nombre) });
      setActiveTab('fiscal');
      return;
    }
    setErroresPropietario({});

    const now = new Date().toISOString();
    const cleanCuentas = formCuentas.map((c, idx) => ({
      ...c,
      iban: formatIbanInput(c.iban),
      esPrincipal: c.esPrincipal || (idx === 0 && formCuentas.every((x) => !x.esPrincipal)),
    }));

    // Quién es la ficha y de qué ámbito cuelga:
    //  · edición → conserva su id y su ámbito (el ámbito es inmutable: lo exigen las Rules);
    //  · «Crear mi ficha» → id == propietarioId del espejo (las Rules solo lo permiten así), sin ámbito;
    //  · «Crear titular» del PROPIETARIO → ficha NUEVA e independiente en SU ámbito: id reservado único
    //    (`tit_<token>`) + `ambitoPropietarioId`. Tantas como necesite: cada alta genera un id distinto,
    //    sin contador ni tope y sin copiar nada de ninguna otra ficha;
    //  · master → alta de siempre (`prop-<marca de tiempo>`).
    const nuevaPropia =
      !editingPropietario && modoAlta === 'propia' && Boolean(idFichaPropia) && !propietarios.some((p) => p.id === idFichaPropia);
    const identidadFicha: Pick<Propietario, 'id' | 'ambitoPropietarioId'> = editingPropietario
      ? { id: editingPropietario.id, ambitoPropietarioId: editingPropietario.ambitoPropietarioId }
      : nuevaPropia
        ? { id: idFichaPropia as string }
        : ambitoPropietarioId
          ? {
              id: generarIdTitularAmbito({ existentes: propietarios.map((p) => p.id) }),
              ambitoPropietarioId,
            }
          : { id: `prop-${Date.now()}` };

    const propietarioToSave: Propietario = {
      id: identidadFicha.id,
      ...(identidadFicha.ambitoPropietarioId ? { ambitoPropietarioId: identidadFicha.ambitoPropietarioId } : {}),
      nombre: formNombre.trim(),
      nifCif: formNifCif.trim().toUpperCase(),
      tipoPropietario: formTipo,
      telefono: formTelefono.trim(),
      email: formEmail.trim(),
      direccion: formDireccion.trim(),
      ciudad: formCiudad.trim(),
      codigoPostal: formCodigoPostal.trim(),
      provincia: formProvincia.trim() || undefined,
      tieneRepresentanteLegal: formTieneRepresentante,
      nombreRepresentante: formTieneRepresentante ? formNombreRepresentante.trim() : undefined,
      nifRepresentante: formTieneRepresentante ? formNifRepresentante.trim().toUpperCase() : undefined,
      cargoRepresentante: formTieneRepresentante ? formCargoRepresentante.trim() : undefined,
      tituloRepresentacion: formTieneRepresentante ? formTituloRepresentacion.trim() : undefined,
      cuentasBancarias: cleanCuentas,
      notasPrivadas: formNotas.trim() || undefined,
      fechaCreacion: editingPropietario ? editingPropietario.fechaCreacion : now,
      fechaActualizacion: now,
    };

    setGuardando(true);
    setErrorGuardado(null);
    try {
      await onSavePropietario(propietarioToSave);
    } catch (error) {
      // Guardado rechazado: el formulario SIGUE abierto con lo escrito y el motivo a la vista.
      console.error('No se pudo guardar la ficha de titular:', error);
      setErrorGuardado(mensajeErrorGuardadoTitular(error));
      setGuardando(false);
      return;
    }
    setGuardando(false);
    setShowModal(false);
    setAvisoGuardado({ nombre: propietarioToSave.nombre, nueva: !editingPropietario });
  };

  // Quick Add Bank Account Submission
  const handleQuickAddBankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardandoCuenta) return;
    // UX-4: el botón ya se deshabilitaba sin explicar el motivo; ahora se dice qué falta.
    const validosCuenta = validarFormulario(
      { iban: quickIban },
      { iban: { etiqueta: 'Número de Cuenta IBAN', obligatorio: true, iban: true } }
    );
    if (hayErrores(validosCuenta) || !quickBankModalOwner) {
      setErroresCuentaBanco(validosCuenta);
      return;
    }
    setErroresCuentaBanco({});

    const formattedIban = formatIbanInput(quickIban);
    const newAcc: CuentaBancariaPropietario = {
      id: `acc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      alias: quickAlias.trim() || `Cuenta ${quickBanco.trim() || 'Principal'}`,
      iban: formattedIban,
      banco: quickBanco.trim() || undefined,
      titular: quickTitular.trim() || quickBankModalOwner.nombre,
      esPrincipal: quickEsPrincipal || (quickBankModalOwner.cuentasBancarias || []).length === 0,
    };

    let existingCuentas = quickBankModalOwner.cuentasBancarias ? [...quickBankModalOwner.cuentasBancarias] : [];
    if (newAcc.esPrincipal) {
      existingCuentas = existingCuentas.map((c) => ({ ...c, esPrincipal: false }));
    }
    existingCuentas.push(newAcc);

    const updatedOwner: Propietario = {
      ...quickBankModalOwner,
      cuentasBancarias: existingCuentas,
      fechaActualizacion: new Date().toISOString(),
    };

    setGuardandoCuenta(true);
    setErrorGuardadoCuenta(null);
    try {
      await onSavePropietario(updatedOwner);
    } catch (error) {
      console.error('No se pudo guardar la cuenta bancaria del titular:', error);
      setErrorGuardadoCuenta(mensajeErrorGuardadoTitular(error));
      setGuardandoCuenta(false);
      return;
    }
    setGuardandoCuenta(false);
    setQuickBankModalOwner(null);
    setQuickAlias('');
    setQuickIban('');
    setQuickBanco('');
    setQuickTitular('');
    setQuickEsPrincipal(false);
  };

  const getTipoBadge = (tipo: TipoPropietario) => {
    switch (tipo) {
      case 'persona_juridica':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
            <Building2 className="w-3 h-3" />
            Sociedad / Jurídica
          </span>
        );
      case 'comunidad_bienes':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <Users className="w-3 h-3" />
            Comunidad de Bienes
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <UserCheck className="w-3 h-3" />
            Persona Física
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Metrics Overview */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              Titulares del patrimonio · fuente de verdad fiscal
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Propietarios / Titulares
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Aquí se crea el titular una sola vez, con todos sus datos personales, de contacto y fiscales
              (incluido su IBAN). Después se asigna a los inmuebles que correspondan; la relación con cada
              inmueble es la titularidad, y no copia ni modifica los datos de la ficha.
            </p>
          </div>

          {(puedeCrearFichas || puedeCrearMiFicha) && (
            <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-2 shrink-0">
              {/* «Crear titular» es SIEMPRE el mismo botón: no se oculta ni se desactiva por cuántas
                  fichas haya ya ni tras guardar una; se puede pulsar tantas veces como haga falta. */}
              {puedeCrearFichas && (
                <button
                  type="button"
                  onClick={() => handleOpenCreateModal('titular')}
                  data-testid="boton-crear-titular"
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-all hover:shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear titular</span>
                </button>
              )}
              {puedeCrearMiFicha && (
                <button
                  type="button"
                  onClick={() => handleOpenCreateModal('propia')}
                  data-testid="boton-crear-mi-ficha"
                  className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white hover:bg-blue-50 text-blue-700 text-sm font-semibold rounded-xl border border-blue-200 transition-all"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Crear mi ficha de titular</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Confirmación de la última ficha guardada: no bloquea; el botón «Crear titular» sigue ahí. */}
        {avisoGuardado && (
          <p
            role="status"
            data-testid="titular-guardado-aviso"
            className="mt-4 flex items-start gap-2 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              {avisoGuardado.nueva
                ? `Titular «${avisoGuardado.nombre}» creado. Ya puedes asignarlo a tus inmuebles o crear otro titular.`
                : `Ficha de «${avisoGuardado.nombre}» guardada.`}
            </span>
          </p>
        )}

        {/* Counter KPI Chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">Total Propietarios</p>
            <p className="text-xl font-bold text-slate-900 mt-0.5">{propietarios.length}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">Cuentas IBAN Registradas</p>
            <p className="text-xl font-bold text-blue-600 mt-0.5">{totalCuentas}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">Inmuebles Vinculados</p>
            <p className="text-xl font-bold text-emerald-600 mt-0.5">{totalInmueblesVinculados}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-slate-500 font-medium">Personas Jurídicas</p>
            <p className="text-xl font-bold text-purple-600 mt-0.5">
              {propietarios.filter((p) => p.tipoPropietario === 'persona_juridica').length}
            </p>
          </div>
        </div>
      </div>

      {/* Guía del flujo definitivo: el titular se crea AQUÍ y luego se asigna al inmueble. */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5" data-testid="flujo-propietarios-titulares">
        <h2 className="text-sm font-bold text-slate-900">Cómo funciona</h2>
        <ol className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 list-none">
          <li className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="font-bold text-slate-900">1. Crea el titular</span>
            <p className="mt-1">
              Aquí, con sus datos personales, de contacto y fiscales completos. Cada titular tiene su propia ficha.
            </p>
          </li>
          <li className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="font-bold text-slate-900">2. Guarda la ficha</span>
            <p className="mt-1">Queda lista para asignarse: no hay que completarla en otro sitio.</p>
          </li>
          <li className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <span className="font-bold text-slate-900">3. Asígnala al inmueble</span>
            <p className="mt-1">Selecciónalo al crear o editar el inmueble e indica su participación (si la conoces).</p>
          </li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          Ser titular no crea ninguna cuenta de acceso, y tener cuenta no da la titularidad: son cosas distintas.
          La ficha del titular es la fuente de verdad de sus datos fiscales.
        </p>
        {ambitoPropietarioId && (
          <p className="mt-2 text-xs text-slate-600" data-testid="titulares-ambito-ayuda">
            Puedes crear tantos titulares como necesites (cónyuge, copropietario, familiar, sociedad…). Cada ficha es
            independiente: tiene sus propios datos fiscales, no se copian de otra, y queda en tu ámbito.
          </p>
        )}
        {(puedeCrearFichas || !puedeGestionar) && (
          <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            ¿Vienes del alta de un inmueble porque no encontrabas al titular? Estás en el sitio correcto.
            <span className="block mt-1" data-testid="aviso-titular-inexistente-propietarios">
              {MENSAJE_TITULAR_NO_EXISTE_SECCION}
            </span>
          </p>
        )}
        {puedeCrearMiFicha && (
          <p className="mt-3 text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-xl p-3" data-testid="titulares-ficha-propia-pendiente">
            <strong className="block">Aún no has creado tu propia ficha de titular</strong>
            Es la del titular principal de tus inmuebles: créala con «Crear mi ficha de titular». Después puedes crear
            los demás titulares con «Crear titular».
          </p>
        )}
        {!puedeGestionar && (
          <p className="mt-3 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3" data-testid="propietarios-solo-consulta">
            Estás viendo las fichas en modo consulta: tu perfil no puede crear ni editar titulares.
          </p>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, NIF, IBAN, ciudad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'persona_fisica', label: 'Personas Físicas' },
            { id: 'persona_juridica', label: 'Sociedades / Jurídicas' },
            { id: 'comunidad_bienes', label: 'C. de Bienes' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilterTipo(item.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filterTipo === item.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filteredPropietarios.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <UserCheck className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            {searchTerm || filterTipo !== 'todos'
              ? 'No se encontraron titulares con esos filtros'
              : 'No hay titulares registrados todavía'}
          </h3>
          <p className="text-sm text-slate-500 mt-2 mb-6">
            {searchTerm || filterTipo !== 'todos'
              ? 'Prueba a cambiar el término de búsqueda o limpia los filtros activos.'
              : 'Crea la primera ficha de titular con sus datos fiscales e IBAN: después podrás asignarla a tus inmuebles y usarla en los contratos.'}
          </p>
          {puedeCrearFichas && (
            <button
              type="button"
              onClick={() => handleOpenCreateModal('titular')}
              data-testid="boton-crear-primer-titular"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Crear primer titular</span>
            </button>
          )}
        </div>
      )}

      {/* Grid of Propietarios */}
      {filteredPropietarios.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filteredPropietarios.map((prop) => {
            const linkedProps = getLinkedProperties(prop.id, prop.nifCif);

            return (
              <div
                key={prop.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
              >
                {/* Card Header */}
                <div className="p-5 sm:p-6 border-b border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
                        {prop.nombre.charAt(0).toUpperCase()}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 leading-tight">
                            {prop.nombre}
                          </h3>
                          {getTipoBadge(prop.tipoPropietario)}
                          {idFichaPropia && prop.id === idFichaPropia && (
                            <span
                              data-testid={`insignia-ficha-propia-${prop.id}`}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"
                            >
                              Tu ficha
                            </span>
                          )}
                          {ambitoPropietarioId && prop.ambitoPropietarioId === ambitoPropietarioId && (
                            <span
                              data-testid={`insignia-titular-ambito-${prop.id}`}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200"
                            >
                              Titular de tu ámbito
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                            {prop.nifCif}
                          </span>
                          <button
                            onClick={() => copyToClipboard(prop.nifCif, `nif-${prop.id}`)}
                            title="Copiar NIF"
                            className="text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            {copiedKey === `nif-${prop.id}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    {puedeEditarFicha(prop) && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenEditModal(prop)}
                          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="Editar titular"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {puedeEliminarFichas && (
                          <button
                            onClick={() => setOwnerToDelete(prop)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                            title="Eliminar titular"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Contact Info & Fiscal Address */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4 text-xs text-slate-600">
                    <div className="flex items-center gap-2 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate font-medium">{prop.telefono || 'Sin teléfono'}</span>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate font-medium">{prop.email || 'Sin email'}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 mt-2.5 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100 text-xs text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="font-medium">
                      {prop.direccion ? (
                        `${prop.direccion}, ${prop.codigoPostal || ''} ${prop.ciudad || ''} ${
                          prop.provincia ? `(${prop.provincia})` : ''
                        }`
                      ) : (
                        <span className="text-slate-400 italic">Domicilio fiscal no configurado</span>
                      )}
                    </span>
                  </div>

                  {/* Legal Representative Details if present */}
                  {prop.tieneRepresentanteLegal && prop.nombreRepresentante && (
                    <div className="mt-3 p-3 bg-purple-50/70 border border-purple-100 rounded-xl text-xs">
                      <div className="flex items-center gap-1.5 text-purple-900 font-bold mb-1">
                        <Briefcase className="w-3.5 h-3.5 text-purple-700" />
                        Representante Legal / Apoderado
                      </div>
                      <p className="text-purple-950 font-medium">
                        {prop.nombreRepresentante} {prop.nifRepresentante ? `(NIF: ${prop.nifRepresentante})` : ''}
                      </p>
                      {prop.cargoRepresentante && (
                        <p className="text-purple-700 text-[11px] mt-0.5">Cargo: {prop.cargoRepresentante}</p>
                      )}
                      {prop.tituloRepresentacion && (
                        <p className="text-purple-600 text-[11px] mt-0.5 italic">{prop.tituloRepresentacion}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Bank Accounts Section */}
                <div className="p-5 sm:p-6 bg-slate-50/50 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                      Cuentas Bancarias ({prop.cuentasBancarias?.length || 0})
                    </div>

                    {puedeEditarFicha(prop) && (
                      <button
                        onClick={() => {
                          setQuickBankModalOwner(prop);
                          setQuickAlias('');
                          setQuickIban('');
                          setQuickBanco('');
                          setQuickTitular(prop.nombre);
                          setQuickEsPrincipal((prop.cuentasBancarias?.length || 0) === 0);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Añadir IBAN</span>
                      </button>
                    )}
                  </div>

                  {prop.cuentasBancarias && prop.cuentasBancarias.length > 0 ? (
                    <div className="space-y-2">
                      {prop.cuentasBancarias.map((acc) => (
                        <div
                          key={acc.id}
                          className={`p-3 rounded-xl border text-xs transition-all flex items-center justify-between gap-2 ${
                            acc.esPrincipal
                              ? 'bg-white border-blue-200 shadow-xs'
                              : 'bg-white/80 border-slate-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 truncate">{acc.alias}</span>
                              {acc.esPrincipal && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                  Principal
                                </span>
                              )}
                              {acc.banco && (
                                <span className="text-[11px] text-slate-500 font-medium">({acc.banco})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-mono text-slate-700 font-medium text-[11px] tracking-wide">
                                {acc.iban}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => copyToClipboard(acc.iban, `iban-${acc.id}`)}
                            title="Copiar IBAN"
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                          >
                            {copiedKey === `iban-${acc.id}` ? (
                              <Check className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-amber-800 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Sin cuentas bancarias registradas.</span>
                      </div>
                      {puedeEditarFicha(prop) && (
                        <button
                          onClick={() => {
                            setQuickBankModalOwner(prop);
                            setQuickAlias('');
                            setQuickIban('');
                            setQuickBanco('');
                            setQuickTitular(prop.nombre);
                            setQuickEsPrincipal(true);
                          }}
                          className="font-bold text-blue-700 hover:underline shrink-0"
                        >
                          + Añadir ahora
                        </button>
                      )}
                    </div>
                  )}

                  {/* Linked Properties */}
                  <div className="mt-4 pt-3.5 border-t border-slate-200/60">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2 gap-2">
                      <span className="flex items-center gap-1.5">
                        <Home className="w-3.5 h-3.5 text-slate-400" />
                        Inmuebles Asignados ({linkedProps.length})
                      </span>
                      {/* Un PROPIETARIO solo crea inmuebles a nombre de SU ficha (las Rules de `inmuebles`
                          exigen su propietarioId): sobre un titular de su ámbito no se ofrece, se asigna después. */}
                      {onCrearInmueble && (!idFichaPropia || prop.id === idFichaPropia) && (
                        <button
                          type="button"
                          onClick={() => onCrearInmueble(prop.id)}
                          className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 hover:underline shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Crear inmueble</span>
                        </button>
                      )}
                    </div>

                    {linkedProps.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {linkedProps.map(({ inmueble: inm, vinculo }) => (
                          <button
                            key={inm.id}
                            onClick={() => onSelectInmueble && onSelectInmueble(inm.id)}
                            title={vinculo.descripcion}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-medium transition-all group"
                          >
                            <span className="truncate max-w-[180px]">{inm.direccion}</span>
                            {/* H11: un vínculo meramente fiscal o heredado NO se presenta
                                como titularidad; se nombra su fuente. */}
                            {!vinculo.acreditaTitularidadActual && (
                              <span
                                data-testid={`vinculo-${inm.id}`}
                                className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold"
                              >
                                {vinculo.etiqueta}
                              </span>
                            )}
                            <ExternalLink className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-600" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">
                        No hay inmuebles vinculados a este propietario todavía.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Add/Edit Propietario Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div ref={dialogoPropietario.refDialogo} {...dialogoPropietario.propsDialogo} className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  {editingPropietario ? <Edit2 className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold">
                    {editingPropietario ? 'Editar titular' : modoAlta === 'propia' ? 'Mi ficha de titular' : 'Nuevo titular'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Ficha completa del titular: identificación, contacto, domicilio fiscal, representación y cuentas
                  </p>
                </div>
              </div>

              <button
                aria-label="Cerrar"
                onClick={cerrarModalPropietario}
                className="p-2 text-slate-400 hover:text-white rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-4 gap-1 overflow-x-auto">
              {[
                { id: 'fiscal', label: '1. Datos Fiscales' },
                { id: 'domicilio', label: '2. Domicilio Notificaciones' },
                { id: 'representante', label: '3. Representante Legal' },
                { id: 'cuentas', label: `4. Cuentas IBAN (${formCuentas.length})` },
                { id: 'notas', label: '5. Notas' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-3.5 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600 bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSavePropietarioSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Fallo de guardado: visible en TODAS las pestañas, sin cerrar el formulario ni perder lo escrito. */}
              {errorGuardado && (
                <p
                  role="alert"
                  data-testid="titular-error-guardado"
                  className="flex items-start gap-2 text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-xl p-3"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorGuardado}</span>
                </p>
              )}
              {!editingPropietario && modoAlta === 'titular' && ambitoPropietarioId && (
                <p className="text-[11px] text-slate-500" data-testid="titular-nuevo-independiente">
                  Ficha nueva e independiente: se rellena aquí, con sus propios datos fiscales. No se copia nada de otros titulares.
                </p>
              )}
              {/* TAB 1: IDENTIFICACIÓN Y FISCAL */}
              {activeTab === 'fiscal' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Tipo de Titularidad / Régimen
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { id: 'persona_fisica', label: 'Persona Física', icon: UserCheck },
                        { id: 'persona_juridica', label: 'Sociedad / S.L. / S.A.', icon: Building2 },
                        { id: 'comunidad_bienes', label: 'Comunidad Bienes', icon: Users },
                      ].map((t) => {
                        const Icon = t.icon;
                        const isSelected = formTipo === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setFormTipo(t.id as TipoPropietario);
                              if (t.id === 'persona_juridica') {
                                setFormTieneRepresentante(true);
                              }
                            }}
                            className={`p-3 rounded-xl border text-left flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold ${
                              isSelected
                                ? 'bg-blue-50/80 border-blue-500 text-blue-900 ring-2 ring-blue-500/20'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                            <span className="text-center">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        {formTipo === 'persona_juridica'
                          ? 'Razón Social de la Empresa *'
                          : 'Nombre y Apellidos Completos *'}
                      </label>
                      {erroresPropietario.general && <ResumenErrores mensaje={erroresPropietario.general} />}
                      <input
                        type="text"
                        required
                        placeholder={
                          formTipo === 'persona_juridica'
                            ? 'Ej: Inmobiliaria Renta Segura S.L.'
                            : 'Ej: Manuel Gómez Rodríguez'
                        }
                        value={formNombre}
                        onChange={(e) => setFormNombre(e.target.value)}
                        aria-invalid={Boolean(erroresPropietario.nombre)}
                        className={claseEntrada(erroresPropietario.nombre)}

                        aria-describedby="error-nombre"/>
                      <ErrorCampo id="error-nombre" mensaje={erroresPropietario.nombre} />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        {formTipo === 'persona_juridica' ? 'CIF de la Sociedad *' : 'NIF / NIE / Pasaporte *'}
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: 12345678Z o B-12345678"
                        value={formNifCif}
                        onChange={(e) => setFormNifCif(e.target.value.toUpperCase())}
                        aria-invalid={Boolean(erroresPropietario.nifCif)}
                        className={`${claseEntrada(erroresPropietario.nifCif)} font-mono uppercase`}

                        aria-describedby="error-nifcif"/>
                      <ErrorCampo id="error-nifcif" mensaje={erroresPropietario.nifCif} />
                      {duplicadoPorNif && (
                        <div
                          className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2"
                          data-testid="titular-duplicado"
                          role="alert"
                        >
                          <p>{mensajeTitularDuplicado(duplicadoPorNif.nombre)}</p>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(duplicadoPorNif)}
                            className="inline-flex items-center gap-1 font-bold text-amber-900 hover:text-amber-950 underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Abrir ficha de {duplicadoPorNif.nombre}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Estos datos son del titular y se guardan una sola vez: al asignarlo a un inmueble no se copian ni
                    se modifican, y editar el inmueble nunca cambia esta ficha.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="campo-telefono-de-contacto" className="block text-xs font-bold text-slate-700 mb-1.5">
                        Teléfono de Contacto
                      </label>
                      <input
                        type="tel"
                        placeholder="Ej: +34 600 000 000"
                        value={formTelefono}
                        onChange={(e) => setFormTelefono(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                         id="campo-telefono-de-contacto"/>
                    </div>

                    <div>
                      <label htmlFor="campo-correo-electronico-notificaciones" className="block text-xs font-bold text-slate-700 mb-1.5">
                        Correo Electrónico (Notificaciones)
                      </label>
                      <input
                        type="email"
                        placeholder="Ej: arrendador@email.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                         id="campo-correo-electronico-notificaciones"/>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DOMICILIO NOTIFICACIONES */}
              {activeTab === 'domicilio' && (
                <div className="space-y-4">
                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-800">
                    El domicilio fiscal es el que figurará en el encabezado del contrato de arrendamiento LAU a efectos de requerimientos y notificaciones fehacientes.
                  </div>

                  <div>
                    <label htmlFor="campo-direccion-calle-numero-piso-puerta" className="block text-xs font-bold text-slate-700 mb-1.5">
                      Dirección (Calle, Número, Piso, Puerta)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Calle Gran Vía 28, 4º B"
                      value={formDireccion}
                      onChange={(e) => setFormDireccion(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                       id="campo-direccion-calle-numero-piso-puerta"/>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor="campo-codigo-postal" className="block text-xs font-bold text-slate-700 mb-1.5">Código Postal</label>
                      <input
                        type="text"
                        placeholder="28013"
                        value={formCodigoPostal}
                        onChange={(e) => setFormCodigoPostal(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                         id="campo-codigo-postal"/>
                    </div>
                    <div>
                      <label htmlFor="campo-ciudad-municipio" className="block text-xs font-bold text-slate-700 mb-1.5">Ciudad / Municipio</label>
                      <input
                        type="text"
                        placeholder="Madrid"
                        value={formCiudad}
                        onChange={(e) => setFormCiudad(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                         id="campo-ciudad-municipio"/>
                    </div>
                    <div>
                      <label htmlFor="campo-provincia" className="block text-xs font-bold text-slate-700 mb-1.5">Provincia</label>
                      <input
                        type="text"
                        placeholder="Madrid"
                        value={formProvincia}
                        onChange={(e) => setFormProvincia(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                         id="campo-provincia"/>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: REPRESENTANTE LEGAL */}
              {activeTab === 'representante' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <input
                      type="checkbox"
                      id="toggleRepresentante"
                      checked={formTieneRepresentante}
                      onChange={(e) => setFormTieneRepresentante(e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                    />
                    <label htmlFor="toggleRepresentante" className="text-xs font-bold text-slate-800 cursor-pointer">
                      ¿Actúa a través de Representante Legal o Apoderado?
                    </label>
                  </div>

                  {formTieneRepresentante && (
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            Nombre del Representante / Apoderado *
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: Juan Carlos Pérez Soto"
                            value={formNombreRepresentante}
                            onChange={(e) => setFormNombreRepresentante(e.target.value)}
                            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label htmlFor="campo-nif-nie-del-representante" className="block text-xs font-bold text-slate-700 mb-1.5">
                            NIF / NIE del Representante *
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: 87654321X"
                            value={formNifRepresentante}
                            onChange={(e) => setFormNifRepresentante(e.target.value.toUpperCase())}
                            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                             id="campo-nif-nie-del-representante"/>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Cargo / Condición (Ej: Administrador Único, Apoderado con poder especial)
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: Administrador Único según escritura pública"
                          value={formCargoRepresentante}
                          onChange={(e) => setFormCargoRepresentante(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label htmlFor="campo-titulo-de-representacion-datos-notariale" className="block text-xs font-bold text-slate-700 mb-1.5">
                          Título de Representación / Datos Notariales
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Ej: Escritura de elevación a público de acuerdos sociales otorgada ante el notario de Madrid D. Fernando Díaz con nº de protocolo 1234."
                          value={formTituloRepresentacion}
                          onChange={(e) => setFormTituloRepresentacion(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                           id="campo-titulo-de-representacion-datos-notariale"/>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: CUENTAS BANCARIAS */}
              {activeTab === 'cuentas' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Cuentas Bancarias para Cobro de Rentas
                      </h4>
                      <p className="text-xs text-slate-500">
                        Puedes añadir una o varias cuentas. Al crear un inmueble, podrás elegir cuál usar.
                      </p>
                    </div>

                    {!showAddAccountForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddAccountForm(true);
                          setNewAccTitular(formNombre);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Añadir Cuenta</span>
                      </button>
                    )}
                  </div>

                  {/* Inline Add Account Form */}
                  {showAddAccountForm && (
                    <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-2xl space-y-3 animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                          Nueva Cuenta Bancaria
                        </span>
                        <button
                          aria-label="Cerrar"
                          type="button"
                          onClick={() => setShowAddAccountForm(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="campo-alias-identificador-de-la-cuenta" className="block text-[11px] font-bold text-slate-700 mb-1">
                            Alias / Identificador de la Cuenta *
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: BBVA Principal Alquileres"
                            value={newAccAlias}
                            onChange={(e) => setNewAccAlias(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                             id="campo-alias-identificador-de-la-cuenta"/>
                        </div>

                        <div>
                          <label htmlFor="campo-banco-entidad" className="block text-[11px] font-bold text-slate-700 mb-1">Banco / Entidad</label>
                          <input
                            type="text"
                            placeholder="Ej: Banco Santander, BBVA, CaixaBank"
                            value={newAccBanco}
                            onChange={(e) => setNewAccBanco(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                             id="campo-banco-entidad"/>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="campo-numero-de-cuenta-iban" className="block text-[11px] font-bold text-slate-700 mb-1">
                            Número de Cuenta IBAN *
                          </label>
                          <input
                            type="text"
                            placeholder="ES21 0182 1234 5678 9012 3456"
                            value={newAccIban}
                            onChange={(e) => setNewAccIban(formatIbanInput(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none uppercase"

                             id="campo-numero-de-cuenta-iban"/>
                        </div>

                        <div>
                          <label htmlFor="campo-titular-de-la-cuenta" className="block text-[11px] font-bold text-slate-700 mb-1">Titular de la Cuenta</label>
                          <input
                            type="text"
                            placeholder="Ej: Manuel Gómez Rodríguez"
                            value={newAccTitular}
                            onChange={(e) => setNewAccTitular(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                             id="campo-titular-de-la-cuenta"/>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newAccEsPrincipal}
                            onChange={(e) => setNewAccEsPrincipal(e.target.checked)}
                            className="w-4 h-4 text-blue-600 rounded border-slate-300"
                          />
                          <span>Marcar como cuenta principal por defecto</span>
                        </label>

                        <button
                          type="button"
                          onClick={handleAddAccountToForm}
                          disabled={!newAccIban.trim()}
                          className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                        >
                          Guardar Cuenta
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List of current accounts in form */}
                  {formCuentas.length > 0 ? (
                    <div className="space-y-2">
                      {formCuentas.map((acc) => (
                        <div
                          key={acc.id}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                            acc.esPrincipal ? 'bg-blue-50/50 border-blue-300' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 truncate">{acc.alias}</span>
                              {acc.banco && <span className="text-slate-500 text-[11px]">({acc.banco})</span>}
                              {acc.esPrincipal && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">
                                  Principal
                                </span>
                              )}
                            </div>
                            <p className="font-mono text-slate-700 text-[11px] mt-0.5">{acc.iban}</p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {!acc.esPrincipal && (
                              <button
                                type="button"
                                onClick={() => handleSetPrincipalAccount(acc.id)}
                                className="px-2 py-1 text-[11px] text-slate-600 hover:text-blue-600 hover:bg-white rounded-lg border border-slate-200 font-semibold"
                              >
                                Hacer Principal
                              </button>
                            )}
                            <button
                              aria-label="Eliminar"
                              type="button"
                              onClick={() => handleRemoveAccountFromForm(acc.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                      No hay cuentas añadidas aún. Pulsa en "+ Añadir Cuenta" para registrar el IBAN de cobro.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: NOTAS */}
              {activeTab === 'notas' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Notas y Observaciones Internas (Privadas)
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Información relevante sobre el propietario, preferencias de inquilinos, acuerdos específicos..."
                    value={formNotas}
                    onChange={(e) => setFormNotas(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Modal Footer */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={cerrarModalPropietario}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                >
                  Cancelar
                </button>

                <div className="flex items-center gap-2">
                  {activeTab !== 'notas' && (
                    <button
                      type="button"
                      onClick={() => {
                        const tabs = ['fiscal', 'domicilio', 'representante', 'cuentas', 'notas'];
                        const nextIdx = (tabs.indexOf(activeTab) + 1) % tabs.length;
                        setActiveTab(tabs[nextIdx] as any);
                      }}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-1"
                    >
                      <span>Siguiente paso</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={guardando}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{guardando ? 'Guardando…' : editingPropietario ? 'Guardar Cambios' : 'Crear Propietario'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Bank Account Modal */}
      {quickBankModalOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div ref={dialogoCuentaBanco.refDialogo} {...dialogoCuentaBanco.propsDialogo} className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] my-auto shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold">Añadir Cuenta Bancaria (IBAN)</h3>
                  <p className="text-[11px] text-slate-300 truncate max-w-[240px]">
                    Propietario: {quickBankModalOwner.nombre}
                  </p>
                </div>
              </div>
              <button
                aria-label="Cerrar"
                onClick={cerrarModalCuenta}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAddBankSubmit} className="p-6 space-y-3.5">
              {errorGuardadoCuenta && (
                <p
                  role="alert"
                  data-testid="titular-error-guardado-cuenta"
                  className="flex items-start gap-2 text-xs text-rose-900 bg-rose-50 border border-rose-200 rounded-xl p-3"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorGuardadoCuenta}</span>
                </p>
              )}
              <div>
                <label htmlFor="campo-alias-de-la-cuenta" className="block text-xs font-bold text-slate-700 mb-1">
                  Alias de la Cuenta *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Cuenta Cobro BBVA"
                  value={quickAlias}
                  onChange={(e) => setQuickAlias(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                   id="campo-alias-de-la-cuenta"/>
              </div>

              <div>
                <label htmlFor="campo-banco-entidad-2" className="block text-xs font-bold text-slate-700 mb-1">Banco / Entidad</label>
                <input
                  type="text"
                  placeholder="Ej: Banco Santander, CaixaBank"
                  value={quickBanco}
                  onChange={(e) => setQuickBanco(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                   id="campo-banco-entidad-2"/>
              </div>

              <div>
                <label htmlFor="campo-numero-de-cuenta-iban-2" className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Cuenta IBAN *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ES21 0182 1234 5678 9012 3456"
                  value={quickIban}
                  onChange={(e) => setQuickIban(formatIbanInput(e.target.value))}
                  aria-invalid={Boolean(erroresCuentaBanco.iban)}
                  className={`${claseEntrada(erroresCuentaBanco.iban)} font-mono font-bold uppercase`}

                  aria-describedby="error-iban"
                   id="campo-numero-de-cuenta-iban-2"/>
                <ErrorCampo id="error-iban" mensaje={erroresCuentaBanco.iban} />
              </div>

              <div>
                <label htmlFor="campo-titular" className="block text-xs font-bold text-slate-700 mb-1">Titular</label>
                <input
                  type="text"
                  placeholder="Titular de la cuenta"
                  value={quickTitular}
                  onChange={(e) => setQuickTitular(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"

                   id="campo-titular"/>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickEsPrincipal}
                    onChange={(e) => setQuickEsPrincipal(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                  />
                  <span>Marcar como cuenta bancaria principal</span>
                </label>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cerrarModalCuenta}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!quickIban.trim() || guardandoCuenta}
                  title={!quickIban.trim() ? 'Introduce el número de cuenta IBAN para guardar.' : undefined}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  Guardar IBAN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {ownerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div ref={dialogoEliminarPropietario.refDialogo} {...dialogoEliminarPropietario.propsDialogo} className="bg-white rounded-3xl max-w-sm w-full max-h-[90vh] my-auto p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">¿Eliminar este propietario?</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Se eliminará la ficha de <strong className="text-slate-700">{ownerToDelete.nombre}</strong> ({ownerToDelete.nifCif}).
              Los inmuebles ya existentes conservarán sus datos fiscales archivados.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setOwnerToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onDeletePropietario(ownerToDelete.id);
                  setOwnerToDelete(null);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-xs"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
