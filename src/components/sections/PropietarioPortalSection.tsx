import React, { useEffect, useState } from 'react';
import {
  Home,
  Wrench,
  FileCheck,
  DollarSign,
  TrendingDown,
  AlertTriangle,
  User,
  Plus,
  Search,
  Check,
  Copy,
  Mail,
  Phone,
  Building,
  ArrowRight,
  ShieldAlert,
  Save,
} from 'lucide-react';
import {
  UsuarioApp,
  Inmueble,
  Profesional,
  ContratoFormalizacion,
  Especialidad,
  Propietario,
  SectionType,
} from '../../types';

interface PropietarioPortalSectionProps {
  currentUser: UsuarioApp;
  inmuebles: Inmueble[];
  profesionales: Profesional[];
  contratos: ContratoFormalizacion[];
  especialidades: Especialidad[];
  propietarios: Propietario[];
  onOpenCrearProfesionalModal: (profesional?: Profesional) => void;
  onSaveProfesional: (profesional: Profesional) => Promise<void>;
  onSavePropietario?: (propietario: Propietario) => Promise<void>;
  onNavigateToInmueble?: (inmuebleId: string) => void;
  /** Navegación a los módulos reales ya implementados (cobros, gastos, incidencias…). */
  onNavigateToSection?: (section: SectionType) => void;
}

export const PropietarioPortalSection: React.FC<PropietarioPortalSectionProps> = ({
  currentUser,
  inmuebles,
  profesionales,
  contratos,
  especialidades,
  propietarios,
  onOpenCrearProfesionalModal,
  onSaveProfesional,
  onSavePropietario,
  onNavigateToInmueble,
  onNavigateToSection,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'viviendas' | 'profesionales' | 'contratos' | 'gastos' | 'cobros' | 'incidencias' | 'perfil'
  >('viviendas');

  const [profesionalTab, setProfesionalTab] = useState<'catalogo' | 'privados'>('catalogo');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEspecialidad, setSelectedEspecialidad] = useState<string>('TODAS');
  const [copiedLinkProfId, setCopiedLinkProfId] = useState<string | null>(null);
  // Ficha fiscal del propietario: edición de SUS propios datos (las reglas de
  // Firestore permiten al propietario crear/editar únicamente su ficha).
  const [formFicha, setFormFicha] = useState<{
    nombre: string;
    nifCif: string;
    telefono: string;
    email: string;
    direccion: string;
    ciudad: string;
    codigoPostal: string;
  } | null>(null);
  const [guardandoFicha, setGuardandoFicha] = useState<boolean>(false);
  const [mensajeFicha, setMensajeFicha] = useState<string | null>(null);

  // Security check: Only filter properties that belong to this owner
  // Aislamiento por propietario: se aceptan las dos formas de titularidad con
  // las que trabaja la aplicación (propietarioId y propietarioPrincipalId), más
  // la asignación explícita por inmuebleIds. Nunca se muestran viviendas ajenas.
  const misViviendas = inmuebles.filter((inm) => {
    const pid = currentUser.propietarioId;
    const isOwnerByPropietarioId = !!pid && (inm.propietarioId === pid || inm.propietarioPrincipalId === pid);
    const isOwnerByInmuebleIds = !!currentUser.inmuebleIds && currentUser.inmuebleIds.includes(inm.id);
    return isOwnerByPropietarioId || isOwnerByInmuebleIds;
  });

  const misViviendasIds = misViviendas.map((v) => v.id);

  // Contracts belonging to this owner's properties
  const misContratos = contratos.filter((c) => misViviendasIds.includes(c.inmuebleId));

  // Registered active public professionals
  const profesionalesPublicos = profesionales.filter((p) => p.activo && !p.esPrivado);

  // Private professionals added by this owner
  const misProfesionalesPrivados = profesionales.filter(
    (p) => p.creadoPorPropietarioId === currentUser.id || p.creadoPorPropietarioId === currentUser.propietarioId
  );

  // Associated Propietario record
  const miFichaPropietario = propietarios.find((p) => p.id === currentUser.propietarioId);

  // La ficha se rellena desde Firestore (lectura acotada a la ficha propia) y se
  // vuelve a sincronizar cuando llega la versión guardada: tras recargar, los
  // datos persistidos son los que se muestran.
  useEffect(() => {
    setFormFicha({
      nombre: miFichaPropietario?.nombre || `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim(),
      nifCif: miFichaPropietario?.nifCif || '',
      telefono: miFichaPropietario?.telefono || currentUser.telefono || '',
      email: miFichaPropietario?.email || currentUser.email || '',
      direccion: miFichaPropietario?.direccion || '',
      ciudad: miFichaPropietario?.ciudad || '',
      codigoPostal: miFichaPropietario?.codigoPostal || '',
    });
  }, [miFichaPropietario, currentUser]);

  const puedeEditarFicha = !!onSavePropietario && !!currentUser.propietarioId;

  const handleGuardarFicha = async () => {
    if (!onSavePropietario || !currentUser.propietarioId || !formFicha) return;
    setGuardandoFicha(true);
    setMensajeFicha(null);
    try {
      // Se conserva la ficha existente (tipo de propietario, cuentas bancarias,
      // representante legal…): sólo se actualizan los datos editables aquí.
      const base: Propietario =
        miFichaPropietario ||
        ({
          id: currentUser.propietarioId,
          nombre: formFicha.nombre,
          nifCif: formFicha.nifCif,
          tipoPropietario: 'persona_fisica',
          telefono: formFicha.telefono,
          email: formFicha.email,
          direccion: formFicha.direccion,
          ciudad: formFicha.ciudad,
          codigoPostal: formFicha.codigoPostal,
          cuentasBancarias: [],
          fechaCreacion: new Date().toISOString(),
          fechaActualizacion: new Date().toISOString(),
        } as Propietario);

      const actualizada: Propietario = {
        ...base,
        id: currentUser.propietarioId,
        nombre: formFicha.nombre.trim() || base.nombre,
        nifCif: formFicha.nifCif.trim(),
        telefono: formFicha.telefono.trim(),
        email: formFicha.email.trim(),
        direccion: formFicha.direccion.trim(),
        ciudad: formFicha.ciudad.trim(),
        codigoPostal: formFicha.codigoPostal.trim(),
        fechaActualizacion: new Date().toISOString(),
      };

      await onSavePropietario(actualizada);
      setMensajeFicha('Datos guardados correctamente.');
    } catch (err) {
      console.error('Error guardando la ficha del propietario:', err);
      setMensajeFicha('No se han podido guardar los datos. Inténtalo de nuevo.');
    } finally {
      setGuardandoFicha(false);
    }
  };

  const handleCopyInvitacion = (prof: Profesional) => {
    const token = prof.tokenInvitacion || `inv_${prof.id}`;
    const url = `${window.location.origin}?registro=${token}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkProfId(prof.id);
    setTimeout(() => setCopiedLinkProfId(null), 2500);
  };

  const handleToggleViviendaAsignada = async (prof: Profesional, inmuebleId: string) => {
    const current = prof.inmuebleIdsAsignados || [];
    let updated: string[];
    if (current.includes(inmuebleId)) {
      updated = current.filter((id) => id !== inmuebleId);
    } else {
      updated = [...current, inmuebleId];
    }
    await onSaveProfesional({
      ...prof,
      inmuebleIdsAsignados: updated,
    });
  };

  return (
    <div id="propietario-portal-section" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
            <Home className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-slate-900">
                Portal del Propietario
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-800 rounded-md">
                PROPIETARIO
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Bienvenido, <span className="font-semibold text-slate-800">{currentUser.nombre}</span>. Gestiona tus viviendas, contratos y técnicos de confianza.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500">Viviendas en cartera</div>
            <div className="text-lg font-bold text-slate-900">{misViviendas.length}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="flex overflow-x-auto border-b border-slate-200 scrollbar-none px-4">
          {[
            { id: 'viviendas', label: 'Mis Viviendas', icon: Home, count: misViviendas.length },
            {
              id: 'profesionales',
              label: 'Mis Profesionales',
              icon: Wrench,
              count: misProfesionalesPrivados.length,
            },
            { id: 'contratos', label: 'Mis Contratos', icon: FileCheck, count: misContratos.length },
            { id: 'gastos', label: 'Gastos', icon: TrendingDown },
            { id: 'cobros', label: 'Cobros', icon: DollarSign },
            { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle },
            { id: 'perfil', label: 'Mi Perfil', icon: User },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-blue-200 text-blue-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* SUBTAB 1: MIS VIVIENDAS */}
          {activeSubTab === 'viviendas' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Viviendas Asignadas a Tu Cuenta ({misViviendas.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Por motivos de privacidad y seguridad, sólo puedes visualizar y operar sobre tus propias propiedades.
                  </p>
                </div>
              </div>

              {misViviendas.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                  <Home className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">
                    No tienes viviendas asignadas todavía
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    El administrador principal asignará tus inmuebles a tu cuenta. Contacta con la administración para vincular tus propiedades.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {misViviendas.map((inm) => {
                    const assignedProfs = profesionales.filter((p) =>
                      p.inmuebleIdsAsignados?.includes(inm.id)
                    );

                    return (
                      <div
                        key={inm.id}
                        className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 transition-all flex flex-col justify-between shadow-xs"
                      >
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-700 rounded-md">
                              {inm.tipoInmueble || 'Vivienda'}
                            </span>
                            <span className="text-sm font-bold text-slate-900">
                              {inm.precioRentaMensual} €/mes
                            </span>
                          </div>

                          <div>
                            <div className="font-bold text-sm text-slate-900 line-clamp-1">
                              {inm.alias || inm.direccion}
                            </div>
                            <div className="text-xs text-slate-500 line-clamp-1">
                              {inm.direccion}, {inm.ciudad} ({inm.codigoPostal})
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                            <span>{inm.habitaciones || 0} hab · {inm.banos || 0} baños</span>
                            <span>{inm.superficieConstruida || 0} m²</span>
                          </div>

                          <div className="text-xs text-slate-500 flex items-center space-x-1">
                            <Wrench className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {assignedProfs.length === 0
                                ? 'Sin técnicos asignados'
                                : `${assignedProfs.length} técnico(s) asignado(s)`}
                            </span>
                          </div>
                        </div>

                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                          {onNavigateToInmueble && (
                            <button
                              onClick={() => onNavigateToInmueble(inm.id)}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1 cursor-pointer"
                            >
                              <span>Ver detalles de vivienda</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: MIS PROFESIONALES */}
          {activeSubTab === 'profesionales' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Profesionales y Servicios de Mantenimiento
                  </h3>
                  <p className="text-xs text-slate-500">
                    Consulta profesionales del catálogo público o añade tus propios operarios privados y asígnalos a tus viviendas.
                  </p>
                </div>

                <button
                  onClick={() => onOpenCrearProfesionalModal()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-2 transition-all cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Añadir Profesional Propio</span>
                </button>
              </div>

              {/* Sub-selector: Catálogo Público vs Mis Privados */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setProfesionalTab('catalogo')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 mr-4 transition-colors cursor-pointer ${
                    profesionalTab === 'catalogo'
                      ? 'border-amber-600 text-amber-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Catálogo de Profesionales ({profesionalesPublicos.length})
                </button>
                <button
                  onClick={() => setProfesionalTab('privados')}
                  className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                    profesionalTab === 'privados'
                      ? 'border-amber-600 text-amber-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Mis Profesionales Propios Privados ({misProfesionalesPrivados.length})
                </button>
              </div>

              {/* Search & Filter */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, especialidad..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-xs text-slate-500 whitespace-nowrap">Especialidad:</span>
                  <select
                    value={selectedEspecialidad}
                    onChange={(e) => setSelectedEspecialidad(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white font-medium"
                  >
                    <option value="TODAS">Todas las especialidades</option>
                    {especialidades.map((esp) => (
                      <option key={esp.id} value={esp.nombre}>
                        {esp.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* List */}
              {profesionalTab === 'privados' && misProfesionalesPrivados.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                  <Wrench className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">
                    No has añadido profesionales privados todavía
                  </div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    ¿Tienes un fontanero o electricista de confianza que aún no usa la plataforma? Añádelo manualmente y envíale un enlace de invitación.
                  </p>
                  <button
                    onClick={() => onOpenCrearProfesionalModal()}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold inline-flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Añadir Profesional Ahora</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(profesionalTab === 'catalogo' ? profesionalesPublicos : misProfesionalesPrivados)
                    .filter((p) => {
                      const matchesSearch =
                        p.nombreComercial.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.especialidades.some((e) => e.toLowerCase().includes(searchTerm.toLowerCase()));
                      const matchesEsp =
                        selectedEspecialidad === 'TODAS' ||
                        p.especialidades.includes(selectedEspecialidad);
                      return matchesSearch && matchesEsp;
                    })
                    .map((prof) => {
                      const isCopied = copiedLinkProfId === prof.id;
                      const hasAccount = !!prof.usuarioId;

                      return (
                        <div
                          key={prof.id}
                          className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-4 shadow-xs"
                        >
                          <div>
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-bold text-sm text-slate-900">
                                  {prof.nombreComercial}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {prof.tipo} {prof.contactoNombre ? `· Contacto: ${prof.contactoNombre}` : ''}
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                  hasAccount
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {hasAccount ? 'Registrado en Plataforma' : 'Sin Cuenta (Privado)'}
                              </span>
                            </div>

                            <div className="text-xs text-slate-600 space-y-1 mt-2">
                              {prof.email && (
                                <div className="flex items-center space-x-1.5">
                                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{prof.email}</span>
                                </div>
                              )}
                              {prof.telefono && (
                                <div className="flex items-center space-x-1.5">
                                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{prof.telefono}</span>
                                </div>
                              )}
                            </div>

                            {/* Specialties */}
                            <div className="flex flex-wrap gap-1 mt-3">
                              {prof.especialidades.map((esp, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-900 border border-amber-200 rounded-md"
                                >
                                  {esp}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Asignación a mis viviendas */}
                          <div className="pt-3 border-t border-slate-100 space-y-2">
                            <div className="text-xs font-semibold text-slate-800">
                              Asignar a Mis Viviendas:
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {misViviendas.map((vivienda) => {
                                const isAssigned = prof.inmuebleIdsAsignados?.includes(vivienda.id);
                                return (
                                  <button
                                    key={vivienda.id}
                                    type="button"
                                    onClick={() => handleToggleViviendaAsignada(prof, vivienda.id)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center space-x-1 ${
                                      isAssigned
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {isAssigned && <Check className="w-3 h-3" />}
                                    <span>{vivienda.alias || vivienda.direccion}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Acción Invitar si no tiene cuenta */}
                          {!hasAccount && (
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-[11px] text-slate-500">
                                Invítalo para que active su cuenta y reciba avisos:
                              </span>
                              <button
                                onClick={() => handleCopyInvitacion(prof)}
                                className="px-3 py-1 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                              >
                                {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                <span>{isCopied ? '¡Enlace Copiado!' : 'Invitar a la Plataforma'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 3: MIS CONTRATOS */}
          {activeSubTab === 'contratos' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Contratos LAU de Tus Viviendas ({misContratos.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Documentación formalizada, fechas de vigencia y rentas pactadas.
                </p>
              </div>

              {misContratos.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <FileCheck className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">No hay contratos activos</div>
                  <p className="text-xs text-slate-500">
                    Aún no se ha formalizado ningún contrato de arrendamiento sobre tus viviendas.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {misContratos.map((c) => {
                    const vivienda = inmuebles.find((i) => i.id === c.inmuebleId);
                    return (
                      <div
                        key={c.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div className="font-bold text-sm text-slate-900">
                            {vivienda?.alias || vivienda?.direccion || 'Vivienda en Alquiler'}
                          </div>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                            {c.estado}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 space-y-1">
                          <div>Inquilino: <span className="font-semibold">{c.candidatoNombre}</span></div>
                          <div>Renta mensual: <span className="font-semibold">{c.rentaMensual} €/mes</span></div>
                          <div>Fianza legal: {c.fianzaEuros} €</div>
                          <div>Vigencia: Desde {new Date(c.fechaInicio).toLocaleDateString()} hasta {new Date(c.fechaFin).toLocaleDateString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 4: GASTOS — módulo real ya operativo (acotado a tus viviendas) */}
          {activeSubTab === 'gastos' && (
            <div className="p-8 text-center border border-slate-200 rounded-2xl bg-white space-y-3 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
                <TrendingDown className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Gestión de Gastos de Tus Viviendas</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Suministros, IBI, comunidad, seguros de hogar, gastos recurrentes, préstamos y cuadre de
                rentabilidad de tus inmuebles. Sólo se muestran los gastos de tus viviendas.
              </p>
              {onNavigateToSection && (
                <button
                  onClick={() => onNavigateToSection('gastos')}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>Abrir Mis Gastos</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* SUBTAB 5: COBROS — módulo real ya operativo (calendario y justificantes) */}
          {activeSubTab === 'cobros' && (
            <div className="p-8 text-center border border-slate-200 rounded-2xl bg-white space-y-3 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
                <DollarSign className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Cobros y Liquidaciones</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Calendario mensual de rentas de tus contratos, recibo de cada periodo, justificantes en
                Firebase Storage, avisos y control de retrasos.
              </p>
              {onNavigateToSection && (
                <button
                  onClick={() => onNavigateToSection('cobros')}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Abrir Mis Cobros</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* SUBTAB 6: INCIDENCIAS — módulo real ya operativo (incidencias, seguros y siniestros) */}
          {activeSubTab === 'incidencias' && (
            <div className="p-8 text-center border border-slate-200 rounded-2xl bg-white space-y-3 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Incidencias, Mantenimiento y Seguros</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Averías y mantenimiento de tus inmuebles con dictamen pericial IA, tus pólizas de seguro y
                los partes de siniestro tramitados.
              </p>
              {onNavigateToSection && (
                <button
                  onClick={() => onNavigateToSection('incidencias')}
                  className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Abrir Mis Incidencias</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* SUBTAB 7: MI PERFIL — datos de acceso y ficha fiscal editable */}
          {activeSubTab === 'perfil' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Datos de Tu Cuenta</h3>
                <p className="text-xs text-slate-500">
                  Información asociada a tu perfil de acceso y ficha fiscal
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Email de acceso:</span>
                  <span className="font-semibold text-slate-900">{currentUser.email}</span>
                </div>
                {miFichaPropietario && (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">NIF/CIF Fiscal:</span>
                      <span className="font-semibold text-slate-900">{miFichaPropietario.nifCif || 'No indicado'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-500">Domicilio de Notificaciones:</span>
                      <span className="font-semibold text-slate-900">
                        {miFichaPropietario.direccion ? `${miFichaPropietario.direccion}, ${miFichaPropietario.ciudad}` : 'No indicado'}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Viviendas en propiedad autorizadas:</span>
                  <span className="font-bold text-blue-700">{misViviendas.length} viviendas</span>
                </div>
              </div>

              {puedeEditarFicha && formFicha && (
                <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Mi Ficha Fiscal</h4>
                    <p className="text-xs text-slate-500">
                      Estos datos se guardan en tu ficha de propietario y se conservan al recargar.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs font-semibold text-slate-600">Nombre y apellidos / Razón social</span>
                      <input
                        type="text"
                        value={formFicha.nombre}
                        onChange={(e) => setFormFicha({ ...formFicha, nombre: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">NIF / CIF / NIE</span>
                      <input
                        type="text"
                        value={formFicha.nifCif}
                        onChange={(e) => setFormFicha({ ...formFicha, nifCif: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">Teléfono</span>
                      <input
                        type="tel"
                        value={formFicha.telefono}
                        onChange={(e) => setFormFicha({ ...formFicha, telefono: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs font-semibold text-slate-600">Email de contacto</span>
                      <input
                        type="email"
                        value={formFicha.email}
                        onChange={(e) => setFormFicha({ ...formFicha, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-xs font-semibold text-slate-600">Domicilio a efectos de notificaciones</span>
                      <input
                        type="text"
                        value={formFicha.direccion}
                        onChange={(e) => setFormFicha({ ...formFicha, direccion: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">Ciudad</span>
                      <input
                        type="text"
                        value={formFicha.ciudad}
                        onChange={(e) => setFormFicha({ ...formFicha, ciudad: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">Código postal</span>
                      <input
                        type="text"
                        value={formFicha.codigoPostal}
                        onChange={(e) => setFormFicha({ ...formFicha, codigoPostal: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={handleGuardarFicha}
                      disabled={guardandoFicha}
                      className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>{guardandoFicha ? 'Guardando…' : 'Guardar Mi Ficha'}</span>
                    </button>
                    {mensajeFicha && (
                      <span className="text-xs font-semibold text-slate-600">{mensajeFicha}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
