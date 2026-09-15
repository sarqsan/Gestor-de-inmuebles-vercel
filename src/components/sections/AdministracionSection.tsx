import React, { useState } from 'react';
import {
  Users,
  Building,
  Wrench,
  Shield,
  ToggleLeft,
  Link2,
  Tag,
  FileText,
  Search,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import {
  UsuarioApp,
  Profesional,
  EnlaceRegistro,
  Especialidad,
  AuditLog,
  ModulosConfig,
  Inmueble,
  Propietario,
  PERMISOS_SISTEMA,
  ROLES_PREDEFINIDOS,
} from '../../types';

interface AdministracionSectionProps {
  usuarios?: UsuarioApp[];
  profesionales?: Profesional[];
  enlacesRegistro?: EnlaceRegistro[];
  especialidades?: Especialidad[];
  auditLogs?: AuditLog[];
  modulosConfig?: ModulosConfig;
  inmuebles?: Inmueble[];
  propietarios?: Propietario[];
  currentUser?: UsuarioApp | null;
  onSaveUsuario: (usuario: UsuarioApp) => Promise<void>;
  onDeleteUsuario: (id: string) => Promise<void>;
  onSaveProfesional: (profesional: Profesional) => Promise<void>;
  onDeleteProfesional: (id: string) => Promise<void>;
  onSaveEnlaceRegistro: (enlace: EnlaceRegistro) => Promise<void>;
  onDeleteEnlaceRegistro: (id: string) => Promise<void>;
  onSaveEspecialidad: (especialidad: Especialidad) => Promise<void>;
  onDeleteEspecialidad: (id: string) => Promise<void>;
  onSaveModulosConfig?: (config: ModulosConfig) => Promise<void>;
  onToggleModulo?: (moduloKey: any, valor: boolean) => Promise<void>;
  onAssignProfesionalToInmueble?: (profesionalId: string, inmuebleId: string) => Promise<void>;
  onOpenCrearUsuarioModal?: (usuario?: UsuarioApp) => void;
  onOpenCreateUserModal?: (usuario?: UsuarioApp) => void;
  onOpenCrearProfesionalModal?: (profesional?: Profesional) => void;
  onOpenCreateProfModal?: (profesional?: Profesional) => void;
  onOpenCrearEnlaceModal?: (enlace?: EnlaceRegistro) => void;
  onOpenCreateEnlaceModal?: (enlace?: EnlaceRegistro) => void;
}

type AdminTab =
  | 'usuarios'
  | 'propietarios'
  | 'profesionales'
  | 'roles'
  | 'funciones'
  | 'enlaces'
  | 'especialidades'
  | 'auditoria';

export const AdministracionSection: React.FC<AdministracionSectionProps> = ({
  usuarios = [],
  profesionales = [],
  enlacesRegistro = [],
  especialidades = [],
  auditLogs = [],
  modulosConfig,
  inmuebles = [],
  propietarios = [],
  currentUser,
  onSaveUsuario,
  onDeleteUsuario,
  onSaveProfesional,
  onDeleteProfesional,
  onSaveEnlaceRegistro,
  onDeleteEnlaceRegistro,
  onSaveEspecialidad,
  onDeleteEspecialidad,
  onSaveModulosConfig,
  onToggleModulo,
  onAssignProfesionalToInmueble,
  onOpenCrearUsuarioModal,
  onOpenCreateUserModal,
  onOpenCrearProfesionalModal,
  onOpenCreateProfModal,
  onOpenCrearEnlaceModal,
  onOpenCreateEnlaceModal,
}) => {
  const openUserModal = onOpenCrearUsuarioModal || onOpenCreateUserModal || (() => {});
  const openProfModal = onOpenCrearProfesionalModal || onOpenCreateProfModal || (() => {});
  const openEnlaceModal = onOpenCrearEnlaceModal || onOpenCreateEnlaceModal || (() => {});
  const [activeTab, setActiveTab] = useState<AdminTab>('usuarios');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPerfil, setFilterPerfil] = useState<string>('TODOS');
  const [copiedEnlaceId, setCopiedEnlaceId] = useState<string | null>(null);

  // Specialties temp form state
  const [nuevaEspecialidadNombre, setNuevaEspecialidadNombre] = useState('');

  // Copy helper
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEnlaceId(id);
    setTimeout(() => setCopiedEnlaceId(null), 2500);
  };

  // Toggle user state (active / blocked)
  const handleToggleBloqueoUsuario = async (usr: UsuarioApp) => {
    const nuevoEstado = usr.estado === 'BLOQUEADO' ? 'ACTIVO' : 'BLOQUEADO';
    await onSaveUsuario({
      ...usr,
      estado: nuevoEstado,
    });
  };

  // Toggle module configuration
  const handleToggleModulo = async (moduloKey: keyof ModulosConfig) => {
    const updated = {
      ...modulosConfig,
      [moduloKey]: !modulosConfig[moduloKey],
    };
    await onSaveModulosConfig(updated);
  };

  // Create new specialty
  const handleCrearEspecialidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevaEspecialidadNombre.trim()) return;
    const nueva: Especialidad = {
      id: `esp_${Date.now()}`,
      nombre: nuevaEspecialidadNombre.trim(),
      activa: true,
      orden: especialidades.length + 1,
    };
    await onSaveEspecialidad(nueva);
    setNuevaEspecialidadNombre('');
  };

  // Filtered users
  const filteredUsuarios = usuarios.filter((u) => {
    const matchesSearch =
      u.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.apellidos && u.apellidos.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPerfil = filterPerfil === 'TODOS' || u.tipoPerfil === filterPerfil;
    return matchesSearch && matchesPerfil;
  });

  return (
    <div id="administracion-section" className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Panel de Administración Global
              </h1>
              <p className="text-xs text-slate-500">
                Gestión de usuarios, propietarios, empresas de mantenimiento, roles y seguridad
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          {activeTab === 'usuarios' && (
            <button
              onClick={() => openUserModal()}
              className="w-full md:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Usuario</span>
            </button>
          )}

          {activeTab === 'profesionales' && (
            <button
              onClick={() => openProfModal()}
              className="w-full md:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Alta Profesional</span>
            </button>
          )}

          {activeTab === 'enlaces' && (
            <button
              onClick={() => openEnlaceModal()}
              className="w-full md:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center justify-center space-x-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Crear Enlace de Registro</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="flex overflow-x-auto border-b border-slate-200 scrollbar-none px-4">
          {[
            { id: 'usuarios', label: 'Usuarios', icon: Users, count: usuarios.length },
            { id: 'propietarios', label: 'Propietarios', icon: Building, count: propietarios.length },
            { id: 'profesionales', label: 'Profesionales', icon: Wrench, count: profesionales.length },
            { id: 'roles', label: 'Roles y Permisos', icon: Shield, count: ROLES_PREDEFINIDOS.length },
            { id: 'funciones', label: 'Funciones (Módulos)', icon: ToggleLeft },
            { id: 'enlaces', label: 'Enlaces de Registro', icon: Link2, count: enlacesRegistro.length },
            { id: 'especialidades', label: 'Especialidades', icon: Tag, count: especialidades.length },
            { id: 'auditoria', label: 'Auditoría', icon: FileText, count: auditLogs.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as AdminTab);
                  setSearchTerm('');
                }}
                className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-purple-600 text-purple-700 bg-purple-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-purple-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-purple-200 text-purple-800' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Container */}
        <div className="p-6">
          {/* TAB 1: USUARIOS */}
          {activeTab === 'usuarios' && (
            <div className="space-y-4">
              {/* Filter and Search */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, email..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <span className="text-xs text-slate-500 whitespace-nowrap">Perfil:</span>
                  <select
                    value={filterPerfil}
                    onChange={(e) => setFilterPerfil(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-xl bg-white focus:outline-hidden font-medium"
                  >
                    <option value="TODOS">Todos los perfiles</option>
                    <option value="ADMINISTRADOR">👑 Administradores</option>
                    <option value="PROPIETARIO">🏠 Propietarios</option>
                    <option value="PROFESIONAL">🔧 Profesionales</option>
                  </select>
                </div>
              </div>

              {/* Users Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Tipo de Perfil</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Viviendas Asignadas</th>
                      <th className="px-4 py-3">Último Acceso</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUsuarios.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">
                          No se encontraron usuarios que coincidan con la búsqueda.
                        </td>
                      </tr>
                    ) : (
                      filteredUsuarios.map((usr) => (
                        <tr key={usr.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">
                              {usr.nombre} {usr.apellidos || ''}
                            </div>
                            <div className="text-slate-500 text-[11px]">{usr.email}</div>
                            {usr.telefono && (
                              <div className="text-slate-400 text-[10px]">{usr.telefono}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {usr.tipoPerfil === 'ADMINISTRADOR' && (
                              <span className="px-2 py-0.5 font-bold text-[10px] bg-purple-100 text-purple-800 rounded-md">
                                ADMINISTRADOR
                              </span>
                            )}
                            {usr.tipoPerfil === 'PROPIETARIO' && (
                              <span className="px-2 py-0.5 font-bold text-[10px] bg-blue-100 text-blue-800 rounded-md">
                                PROPIETARIO
                              </span>
                            )}
                            {usr.tipoPerfil === 'PROFESIONAL' && (
                              <span className="px-2 py-0.5 font-bold text-[10px] bg-amber-100 text-amber-800 rounded-md">
                                PROFESIONAL
                              </span>
                            )}
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {usr.roles?.join(', ') || 'Sin rol'}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {usr.estado === 'ACTIVO' && (
                              <span className="px-2 py-0.5 font-semibold text-[10px] bg-emerald-100 text-emerald-800 rounded-full">
                                Activo
                              </span>
                            )}
                            {usr.estado === 'BLOQUEADO' && (
                              <span className="px-2 py-0.5 font-semibold text-[10px] bg-red-100 text-red-800 rounded-full">
                                Bloqueado
                              </span>
                            )}
                            {usr.estado === 'PENDIENTE' && (
                              <span className="px-2 py-0.5 font-semibold text-[10px] bg-amber-100 text-amber-800 rounded-full">
                                Pendiente
                              </span>
                            )}
                            {usr.estado === 'INACTIVO' && (
                              <span className="px-2 py-0.5 font-semibold text-[10px] bg-slate-100 text-slate-700 rounded-full">
                                Inactivo
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {usr.tipoPerfil === 'ADMINISTRADOR' ? (
                              <span className="text-slate-500 text-[11px] italic">Acceso Global</span>
                            ) : usr.inmuebleIds && usr.inmuebleIds.length > 0 ? (
                              <span className="font-semibold text-slate-800 text-[11px]">
                                {usr.inmuebleIds.length} vivienda(s)
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Sin asignar</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-[11px]">
                            {usr.lastLoginAt
                              ? new Date(usr.lastLoginAt).toLocaleDateString()
                              : 'Nunca'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end space-x-1">
                              <button
                                onClick={() => openUserModal(usr)}
                                title="Editar usuario"
                                className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleToggleBloqueoUsuario(usr)}
                                title={usr.estado === 'BLOQUEADO' ? 'Desbloquear' : 'Bloquear acceso'}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  usr.estado === 'BLOQUEADO'
                                    ? 'text-amber-600 hover:bg-amber-50'
                                    : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                                }`}
                              >
                                {usr.estado === 'BLOQUEADO' ? (
                                  <Unlock className="w-3.5 h-3.5" />
                                ) : (
                                  <Lock className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {usr.id !== currentUser?.id && (
                                <button
                                  onClick={() => {
                                    if (confirm(`¿Eliminar al usuario ${usr.nombre}?`)) {
                                      onDeleteUsuario(usr.id);
                                    }
                                  }}
                                  title="Eliminar usuario"
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: PROPIETARIOS */}
          {activeTab === 'propietarios' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200 text-xs text-blue-900 leading-relaxed">
                <strong>Vinculación de Propietarios y Cuentas de Acceso:</strong> En RentSelect, las fichas fiscales de arrendador residen en la colección existente <code>propietarios</code> y no se duplican. Cuando un propietario necesita acceder a la plataforma, se asocia su <code>UsuarioApp</code> mediante <code>propietarioId</code> y se le otorga acceso a sus inmuebles.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {propietarios.length === 0 ? (
                  <div className="col-span-2 text-center p-8 text-slate-400 text-xs italic">
                    No hay propietarios dados de alta en el sistema.
                  </div>
                ) : (
                  propietarios.map((prop) => {
                    const linkedUser = usuarios.find((u) => u.propietarioId === prop.id);
                    const propInmuebles = inmuebles.filter(
                      (inm) => inm.propietarioPrincipalId === prop.id
                    );

                    return (
                      <div
                        key={prop.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-sm text-slate-900">{prop.nombre}</div>
                            <div className="text-xs text-slate-500">
                              NIF/CIF: <span className="font-mono">{prop.nifCif}</span> · {prop.tipoPropietario}
                            </div>
                          </div>
                          {linkedUser ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                              Usuario Vinculado
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 rounded-md">
                              Sin Cuenta de Acceso
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 space-y-1">
                          <div>📧 {prop.email || 'Sin correo electrónico'}</div>
                          <div>📞 {prop.telefono || 'Sin teléfono'}</div>
                          <div>📍 {prop.direccion}, {prop.ciudad} ({prop.codigoPostal})</div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <div className="text-slate-500">
                            Viviendas asociadas:{' '}
                            <span className="font-bold text-slate-800">{propInmuebles.length}</span>
                          </div>

                          {!linkedUser && (
                            <button
                              onClick={() => {
                                openUserModal({
                                  id: '',
                                  nombre: prop.nombre,
                                  email: prop.email || '',
                                  telefono: prop.telefono || '',
                                  tipoPerfil: 'PROPIETARIO',
                                  estado: 'ACTIVO',
                                  roles: ['PROPIETARIO_ESTANDAR'],
                                  permisos: [
                                    'inmuebles.ver',
                                    'inmuebles.editar',
                                    'contratos.ver',
                                    'profesionales.ver',
                                    'profesionales.crear',
                                    'profesionales.asignar',
                                  ],
                                  propietarioId: prop.id,
                                  inmuebleIds: propInmuebles.map((i) => i.id),
                                  createdAt: new Date().toISOString(),
                                  updatedAt: new Date().toISOString(),
                                });
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                            >
                              + Crear Cuenta de Usuario
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PROFESIONALES */}
          {activeTab === 'profesionales' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar profesional o empresa..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profesionales.length === 0 ? (
                  <div className="col-span-3 text-center p-8 text-slate-400 text-xs italic">
                    No hay profesionales registrados en la plataforma.
                  </div>
                ) : (
                  profesionales
                    .filter((p) =>
                      p.nombreComercial.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      p.especialidades.some((e) => e.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .map((prof) => (
                      <div
                        key={prof.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col justify-between space-y-3"
                      >
                        <div>
                          <div className="flex items-start justify-between">
                            <div className="font-bold text-sm text-slate-900">
                              {prof.nombreComercial}
                            </div>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                prof.activo
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {prof.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>

                          <div className="text-xs text-slate-500 mt-1">
                            {prof.tipo} {prof.cifNif ? `· ${prof.cifNif}` : ''}
                          </div>

                          <div className="text-xs text-slate-600 space-y-1 mt-2">
                            {prof.email && <div>📧 {prof.email}</div>}
                            {prof.telefono && <div>📞 {prof.telefono}</div>}
                            {prof.zonasServicio && prof.zonasServicio.length > 0 && (
                              <div className="text-[11px] text-slate-500 truncate">
                                📍 {prof.zonasServicio.map((z) => `${z.provincia}${z.municipio ? ` (${z.municipio})` : ''}`).join(', ')}
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

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500 text-[11px]">
                            {prof.inmuebleIdsAsignados?.length || 0} vivienda(s) asignadas
                          </span>

                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => onOpenCrearProfesionalModal(prof)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`¿Eliminar profesional ${prof.nombreComercial}?`)) {
                                  onDeleteProfesional(prof.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ROLES Y PERMISOS */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Roles Predefinidos del Sistema
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Plantillas de acceso que pueden ser asignadas rápidamente a los usuarios
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ROLES_PREDEFINIDOS.map((rol) => (
                    <div
                      key={rol.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900">{rol.nombre}</span>
                        <span className="text-[10px] font-mono text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md font-bold">
                          {rol.id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{rol.descripcion}</p>
                      <div className="pt-2 text-xs font-semibold text-slate-700">
                        {rol.permisos.length} permisos incluidos:
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {rol.permisos.map((p) => (
                          <span
                            key={p}
                            className="px-1.5 py-0.5 text-[9px] font-mono bg-slate-100 text-slate-700 rounded-sm"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Catálogo Completo de Permisos Granulares ({PERMISOS_SISTEMA.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {PERMISOS_SISTEMA.map((perm) => (
                    <div
                      key={perm.codigo}
                      className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-xs"
                    >
                      <div className="font-bold text-slate-800">{perm.nombre}</div>
                      <div className="font-mono text-[10px] text-purple-700">{perm.codigo}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{perm.descripcion}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: FUNCIONES (MÓDULOS ACTIVABLES) */}
          {activeTab === 'funciones' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Control Modular de Funciones (Feature Flags)
                </h3>
                <p className="text-xs text-slate-500">
                  Activa o desactiva módulos de la aplicación en tiempo real. Los cambios se sincronizan en Firestore para todos los usuarios.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    key: 'inmuebles' as keyof ModulosConfig,
                    title: 'Gestión de Inmuebles',
                    desc: 'Catálogo de viviendas, fichas técnicas, precios de renta y asignaciones',
                    ready: true,
                  },
                  {
                    key: 'propietarios' as keyof ModulosConfig,
                    title: 'Gestión de Propietarios',
                    desc: 'Fichas fiscales, cuentas IBAN y notificaciones',
                    ready: true,
                  },
                  {
                    key: 'candidatos' as keyof ModulosConfig,
                    title: 'Candidatos y Evaluación de Solvencia',
                    desc: 'Scoring financiero, verificación documental y preselección',
                    ready: true,
                  },
                  {
                    key: 'visitas' as keyof ModulosConfig,
                    title: 'Visitas y Agenda Presencial',
                    desc: 'Slots horarios, reservas públicas e invitaciones a inmuebles',
                    ready: true,
                  },
                  {
                    key: 'contratos' as keyof ModulosConfig,
                    title: 'Formalización de Contratos LAU',
                    desc: 'Generación de contratos de arrendamiento y actas de entrega',
                    ready: true,
                  },
                  {
                    key: 'seguros' as keyof ModulosConfig,
                    title: 'Seguros de Impago',
                    desc: 'Trámites con aseguradoras (SEAG, ARAG, Caser) y seguimiento',
                    ready: true,
                  },
                  {
                    key: 'profesionales' as keyof ModulosConfig,
                    title: 'Mantenimiento y Profesionales',
                    desc: 'Directorio de técnicos, zonas de cobertura y asignación a viviendas',
                    ready: true,
                  },
                  {
                    key: 'gastos' as keyof ModulosConfig,
                    title: 'Gastos de Inmuebles',
                    desc: 'Control de facturas, IBI, comunidad y amortizaciones',
                    ready: false,
                  },
                  {
                    key: 'cobros' as keyof ModulosConfig,
                    title: 'Cobros y Liquidaciones',
                    desc: 'Seguimiento mensual de cobros y rentas de inquilinos',
                    ready: false,
                  },
                  {
                    key: 'hipotecas' as keyof ModulosConfig,
                    title: 'Hipotecas y Financiación',
                    desc: 'Préstamos bancarios y cuadros de amortización',
                    ready: false,
                  },
                  {
                    key: 'patrimonio' as keyof ModulosConfig,
                    title: 'Patrimonio y Rentabilidad',
                    desc: 'Cálculo de rentabilidad bruta/neta y valoración de activos',
                    ready: false,
                  },
                  {
                    key: 'incidencias' as keyof ModulosConfig,
                    title: 'Sistema de Incidencias',
                    desc: 'Tickets de reparación, fotos y partes de trabajo de profesionales',
                    ready: false,
                  },
                ].map((item) => {
                  const isEnabled = !!modulosConfig[item.key];
                  return (
                    <div
                      key={item.key}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex items-start justify-between space-x-3"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs text-slate-900">{item.title}</span>
                          {!item.ready && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 rounded-sm">
                              Próximamente
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">{item.desc}</p>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => handleToggleModulo(item.key)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 6: ENLACES DE REGISTRO */}
          {activeTab === 'enlaces' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Enlaces de Registro e Invitaciones Configurables
                </h3>
                <p className="text-xs text-slate-500">
                  Crea enlaces públicos o personalizados con texto visible configurable para invitar a propietarios y profesionales.
                </p>
              </div>

              <div className="space-y-3">
                {enlacesRegistro.length === 0 ? (
                  <div className="text-center p-8 text-slate-400 text-xs italic border border-slate-200 rounded-xl">
                    No hay enlaces de registro creados todavía.
                  </div>
                ) : (
                  enlacesRegistro.map((enlace) => {
                    const fullUrl = `${window.location.origin}?registro=${enlace.token}`;
                    const isCopied = copiedEnlaceId === enlace.id;

                    return (
                      <div
                        key={enlace.id}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-slate-900">
                              {enlace.textoVisible}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                enlace.activo
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {enlace.activo ? 'Activo' : 'Inactivo'}
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-50 text-purple-700 rounded-md">
                              {enlace.tipoPerfil}
                            </span>
                          </div>

                          {enlace.descripcion && (
                            <p className="text-xs text-slate-500">{enlace.descripcion}</p>
                          )}

                          <div className="flex items-center space-x-2 text-[11px] text-slate-400 font-mono pt-1">
                            <span className="truncate max-w-xs sm:max-w-md">{fullUrl}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => handleCopy(enlace.id, fullUrl)}
                            className="px-3 py-1.5 text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl flex items-center space-x-1.5 transition-colors cursor-pointer"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{isCopied ? '¡Copiado!' : 'Copiar'}</span>
                          </button>

                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-purple-600 rounded-lg hover:bg-purple-50 transition-colors"
                            title="Abrir enlace en nueva pestaña"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>

                          <button
                            onClick={() => onOpenCrearEnlaceModal(enlace)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                            title="Editar enlace"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              if (confirm('¿Eliminar este enlace de registro?')) {
                                onDeleteEnlaceRegistro(enlace.id);
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 7: ESPECIALIDADES */}
          {activeTab === 'especialidades' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Catálogo Administrable de Especialidades Técnicas
                </h3>
                <p className="text-xs text-slate-500">
                  Categorías disponibles para que los profesionales clasifiquen sus servicios de mantenimiento.
                </p>
              </div>

              {/* Add form */}
              <form onSubmit={handleCrearEspecialidad} className="flex gap-2 max-w-md">
                <input
                  type="text"
                  value={nuevaEspecialidadNombre}
                  onChange={(e) => setNuevaEspecialidadNombre(e.target.value)}
                  placeholder="Nueva especialidad (ej. Domótica e Internet)..."
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir</span>
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {especialidades.map((esp) => (
                  <div
                    key={esp.id}
                    className="p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2">
                      <Tag className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-bold text-slate-900">{esp.nombre}</span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={async () => {
                          await onSaveEspecialidad({
                            ...esp,
                            activa: !esp.activa,
                          });
                        }}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md cursor-pointer ${
                          esp.activa
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {esp.activa ? 'Activa' : 'Inactiva'}
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(`¿Eliminar especialidad ${esp.nombre}?`)) {
                            onDeleteEspecialidad(esp.id);
                          }
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: AUDITORÍA */}
          {activeTab === 'auditoria' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Registro Inmutable de Auditoría
                </h3>
                <p className="text-xs text-slate-500">
                  Trazabilidad de acciones críticas administrativas, cambios de perfil, asignaciones y bloqueos de seguridad.
                </p>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Fecha y Hora</th>
                      <th className="px-4 py-3">Usuario Responsable</th>
                      <th className="px-4 py-3">Acción</th>
                      <th className="px-4 py-3">Descripción</th>
                      <th className="px-4 py-3">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                          No hay registros de auditoría registrados.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                            {new Date(log.fechaHora).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-sans font-medium text-slate-800">
                            {log.usuarioNombre || log.usuarioEmail}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="px-1.5 py-0.5 rounded-sm bg-purple-50 text-purple-700 font-bold text-[10px]">
                              {log.accion}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-sans text-slate-600">
                            {log.descripcion}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`px-1.5 py-0.5 rounded-sm font-bold text-[10px] ${
                                log.resultado === 'EXITO'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {log.resultado}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
