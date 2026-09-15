import React, { useState, useMemo } from 'react';
import { Propietario, CuentaBancariaPropietario, TipoPropietario, Inmueble } from '../../types';
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
  onSavePropietario: (propietario: Propietario) => void;
  onDeletePropietario: (propietarioId: string) => void;
  onSelectInmueble?: (inmuebleId: string) => void;
}

export const PropietariosSection: React.FC<PropietariosSectionProps> = ({
  propietarios,
  inmuebles,
  onSavePropietario,
  onDeletePropietario,
  onSelectInmueble,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('todos');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal States
  const [showModal, setShowModal] = useState(false);
  const [editingPropietario, setEditingPropietario] = useState<Propietario | null>(null);

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

  const getLinkedProperties = (propId: string, propNif: string) => {
    return inmuebles.filter(
      (inm) =>
        inm.propietarioId === propId ||
        inm.propietarioPrincipalId === propId ||
        inm.propietarioSecundarioId === propId ||
        (inm.datosFiscales?.propietarioPrincipal?.nifDni &&
          inm.datosFiscales.propietarioPrincipal.nifDni.toUpperCase() === propNif.toUpperCase()) ||
        (inm.datosFiscales?.segundoPropietario?.nifDni &&
          inm.datosFiscales.segundoPropietario.nifDni.toUpperCase() === propNif.toUpperCase())
    );
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

  const totalInmueblesVinculados = useMemo(() => {
    const linkedIds = new Set<string>();
    inmuebles.forEach((inm) => {
      if (inm.propietarioPrincipalId || inm.propietarioSecundarioId) {
        linkedIds.add(inm.id);
      }
    });
    return linkedIds.size;
  }, [inmuebles]);

  const handleOpenCreateModal = () => {
    setEditingPropietario(null);
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

  const handleSavePropietarioSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombre.trim() || !formNifCif.trim()) {
      alert('Por favor introduce al menos el Nombre/Razón Social y el NIF/CIF.');
      return;
    }

    const now = new Date().toISOString();
    const cleanCuentas = formCuentas.map((c, idx) => ({
      ...c,
      iban: formatIbanInput(c.iban),
      esPrincipal: c.esPrincipal || (idx === 0 && formCuentas.every((x) => !x.esPrincipal)),
    }));

    const propietarioToSave: Propietario = {
      id: editingPropietario ? editingPropietario.id : `prop-${Date.now()}`,
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

    onSavePropietario(propietarioToSave);
    setShowModal(false);
  };

  // Quick Add Bank Account Submission
  const handleQuickAddBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickBankModalOwner || !quickIban.trim()) return;

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

    onSavePropietario(updatedOwner);
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
              Base de Datos Fiscal & Arrendadores
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Gestión de Propietarios y Cuentas Bancarias
            </h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Registra los datos fiscales completos de los arrendadores y sus números de cuenta (IBAN) para
              vincularlos a los inmuebles y redactar automáticamente los contratos de arrendamiento LAU.
            </p>
          </div>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-all hover:shadow shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Propietario</span>
          </button>
        </div>

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
              ? 'No se encontraron propietarios con esos filtros'
              : 'No hay propietarios registrados todavía'}
          </h3>
          <p className="text-sm text-slate-500 mt-2 mb-6">
            {searchTerm || filterTipo !== 'todos'
              ? 'Prueba a cambiar el término de búsqueda o limpia los filtros activos.'
              : 'Crea tu primera ficha de propietario con sus datos fiscales e IBAN para asignarlo a tus inmuebles y generar contratos con un solo clic.'}
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Primer Propietario</span>
          </button>
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
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(prop)}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        title="Editar propietario"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setOwnerToDelete(prop)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                        title="Eliminar propietario"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
                    </div>
                  )}

                  {/* Linked Properties */}
                  <div className="mt-4 pt-3.5 border-t border-slate-200/60">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                      <span className="flex items-center gap-1.5">
                        <Home className="w-3.5 h-3.5 text-slate-400" />
                        Inmuebles Asignados ({linkedProps.length})
                      </span>
                    </div>

                    {linkedProps.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {linkedProps.map((inm) => (
                          <button
                            key={inm.id}
                            onClick={() => onSelectInmueble && onSelectInmueble(inm.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 rounded-lg text-xs font-medium transition-all group"
                          >
                            <span className="truncate max-w-[180px]">{inm.direccion}</span>
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
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                  {editingPropietario ? <Edit2 className="w-5 h-5" /> : <UserCheck className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold">
                    {editingPropietario ? 'Editar Propietario / Arrendador' : 'Nuevo Propietario / Arrendador'}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Datos fiscales y domicilios para la redacción de contratos LAU
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModal(false)}
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
              {/* TAB 1: IDENTIFICACIÓN Y FISCAL */}
              {activeTab === 'fiscal' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Tipo de Titularidad / Régimen
                    </label>
                    <div className="grid grid-cols-3 gap-2">
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
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                      />
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
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Teléfono de Contacto
                      </label>
                      <input
                        type="tel"
                        placeholder="Ej: +34 600 000 000"
                        value={formTelefono}
                        onChange={(e) => setFormTelefono(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Correo Electrónico (Notificaciones)
                      </label>
                      <input
                        type="email"
                        placeholder="Ej: arrendador@email.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                      />
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
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Dirección (Calle, Número, Piso, Puerta)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Calle Gran Vía 28, 4º B"
                      value={formDireccion}
                      onChange={(e) => setFormDireccion(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Código Postal</label>
                      <input
                        type="text"
                        placeholder="28013"
                        value={formCodigoPostal}
                        onChange={(e) => setFormCodigoPostal(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Ciudad / Municipio</label>
                      <input
                        type="text"
                        placeholder="Madrid"
                        value={formCiudad}
                        onChange={(e) => setFormCiudad(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Provincia</label>
                      <input
                        type="text"
                        placeholder="Madrid"
                        value={formProvincia}
                        onChange={(e) => setFormProvincia(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                      />
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
                          <label className="block text-xs font-bold text-slate-700 mb-1.5">
                            NIF / NIE del Representante *
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: 87654321X"
                            value={formNifRepresentante}
                            onChange={(e) => setFormNifRepresentante(e.target.value.toUpperCase())}
                            className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                          />
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
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          Título de Representación / Datos Notariales
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Ej: Escritura de elevación a público de acuerdos sociales otorgada ante el notario de Madrid D. Fernando Díaz con nº de protocolo 1234."
                          value={formTituloRepresentacion}
                          onChange={(e) => setFormTituloRepresentacion(e.target.value)}
                          className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                        />
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
                          type="button"
                          onClick={() => setShowAddAccountForm(false)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Alias / Identificador de la Cuenta *
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: BBVA Principal Alquileres"
                            value={newAccAlias}
                            onChange={(e) => setNewAccAlias(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Banco / Entidad</label>
                          <input
                            type="text"
                            placeholder="Ej: Banco Santander, BBVA, CaixaBank"
                            value={newAccBanco}
                            onChange={(e) => setNewAccBanco(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Número de Cuenta IBAN *
                          </label>
                          <input
                            type="text"
                            placeholder="ES21 0182 1234 5678 9012 3456"
                            value={newAccIban}
                            onChange={(e) => setNewAccIban(formatIbanInput(e.target.value))}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none uppercase"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Titular de la Cuenta</label>
                          <input
                            type="text"
                            placeholder="Ej: Manuel Gómez Rodríguez"
                            value={newAccTitular}
                            onChange={(e) => setNewAccTitular(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                          />
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
                  onClick={() => setShowModal(false)}
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
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{editingPropietario ? 'Guardar Cambios' : 'Crear Propietario'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Bank Account Modal */}
      {quickBankModalOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
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
                onClick={() => setQuickBankModalOwner(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAddBankSubmit} className="p-6 space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Alias de la Cuenta *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Cuenta Cobro BBVA"
                  value={quickAlias}
                  onChange={(e) => setQuickAlias(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Banco / Entidad</label>
                <input
                  type="text"
                  placeholder="Ej: Banco Santander, CaixaBank"
                  value={quickBanco}
                  onChange={(e) => setQuickBanco(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Número de Cuenta IBAN *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ES21 0182 1234 5678 9012 3456"
                  value={quickIban}
                  onChange={(e) => setQuickIban(formatIbanInput(e.target.value))}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Titular</label>
                <input
                  type="text"
                  placeholder="Titular de la cuenta"
                  value={quickTitular}
                  onChange={(e) => setQuickTitular(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:outline-none"
                />
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
                  onClick={() => setQuickBankModalOwner(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!quickIban.trim()}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95">
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
