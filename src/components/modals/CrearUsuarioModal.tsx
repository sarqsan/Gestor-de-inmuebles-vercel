import React, { useState } from 'react';
import {
  X,
  User,
  Mail,
  Phone,
  Shield,
  Home,
  Check,
  Building,
  Key,
} from 'lucide-react';
import {
  UsuarioApp,
  TipoPerfilUsuario,
  EstadoUsuario,
  PERMISOS_SISTEMA,
  ROLES_PREDEFINIDOS,
  Inmueble,
  Propietario,
} from '../../types';

interface CrearUsuarioModalProps {
  usuarioParaEditar?: UsuarioApp | null;
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  onSave: (usuario: UsuarioApp) => Promise<void>;
  onClose: () => void;
}

export const CrearUsuarioModal: React.FC<CrearUsuarioModalProps> = ({
  usuarioParaEditar,
  inmuebles,
  propietarios,
  onSave,
  onClose,
}) => {
  const isEditing = !!usuarioParaEditar;

  const [nombre, setNombre] = useState(usuarioParaEditar?.nombre || '');
  const [apellidos, setApellidos] = useState(usuarioParaEditar?.apellidos || '');
  const [email, setEmail] = useState(usuarioParaEditar?.email || '');
  const [telefono, setTelefono] = useState(usuarioParaEditar?.telefono || '');
  const [tipoPerfil, setTipoPerfil] = useState<TipoPerfilUsuario>(
    usuarioParaEditar?.tipoPerfil || 'PROPIETARIO'
  );
  const [estado, setEstado] = useState<EstadoUsuario>(
    usuarioParaEditar?.estado || 'ACTIVO'
  );
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    usuarioParaEditar?.roles || ['PROPIETARIO_ESTANDAR']
  );
  const [selectedPermisos, setSelectedPermisos] = useState<string[]>(
    usuarioParaEditar?.permisos || []
  );
  const [selectedInmuebleIds, setSelectedInmuebleIds] = useState<string[]>(
    usuarioParaEditar?.inmuebleIds || []
  );
  const [propietarioId, setPropietarioId] = useState<string>(
    usuarioParaEditar?.propietarioId || ''
  );
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Handle role change auto-updating default permissions
  const handleRoleToggle = (rolId: string) => {
    let nextRoles: string[];
    if (selectedRoles.includes(rolId)) {
      nextRoles = selectedRoles.filter((r) => r !== rolId);
    } else {
      nextRoles = [...selectedRoles, rolId];
    }
    setSelectedRoles(nextRoles);

    // Combine permissions from selected roles
    const combinedPermisos = new Set<string>(selectedPermisos);
    nextRoles.forEach((rId) => {
      const def = ROLES_PREDEFINIDOS.find((r) => r.id === rId);
      if (def) {
        def.permisos.forEach((p) => combinedPermisos.add(p));
      }
    });
    setSelectedPermisos(Array.from(combinedPermisos));
  };

  const handlePermisoToggle = (codigo: string) => {
    if (selectedPermisos.includes(codigo)) {
      setSelectedPermisos(selectedPermisos.filter((p) => p !== codigo));
    } else {
      setSelectedPermisos([...selectedPermisos, codigo]);
    }
  };

  const handleInmuebleToggle = (id: string) => {
    if (selectedInmuebleIds.includes(id)) {
      setSelectedInmuebleIds(selectedInmuebleIds.filter((i) => i !== id));
    } else {
      setSelectedInmuebleIds([...selectedInmuebleIds, id]);
    }
  };

  // If user picks an existing propietario, auto-assign their properties
  const handlePropietarioSelect = (propId: string) => {
    setPropietarioId(propId);
    if (propId) {
      const propInmuebles = inmuebles
        .filter((inm) => inm.propietarioPrincipalId === propId)
        .map((inm) => inm.id);
      if (propInmuebles.length > 0) {
        const union = Array.from(new Set([...selectedInmuebleIds, ...propInmuebles]));
        setSelectedInmuebleIds(union);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) {
      setErrorMsg('Por favor completa el nombre y el correo electrónico.');
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg('');

      const usuarioActualizado: UsuarioApp = {
        id: usuarioParaEditar?.id || `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        authUid: usuarioParaEditar?.authUid,
        nombre: nombre.trim(),
        apellidos: apellidos.trim() || undefined,
        email: email.trim().toLowerCase(),
        telefono: telefono.trim() || undefined,
        tipoPerfil,
        estado,
        roles: selectedRoles,
        permisos: selectedPermisos,
        inmuebleIds: selectedInmuebleIds,
        propietarioId: propietarioId || undefined,
        profesionalId: usuarioParaEditar?.profesionalId,
        createdAt: usuarioParaEditar?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: usuarioParaEditar?.lastLoginAt,
      };

      await onSave(usuarioActualizado);
      onClose();
    } catch (err: any) {
      console.error('Error saving user:', err);
      setErrorMsg(err?.message || 'Error al guardar el usuario en Firestore.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      id="crear-usuario-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Modificar Usuario y Permisos' : 'Dar de Alta Nuevo Usuario'}
              </h3>
              <p className="text-xs text-slate-500">
                Asigna tipo de perfil, roles de acceso y ámbito de viviendas autorizadas
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
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
              {errorMsg}
            </div>
          )}

          {/* Datos Personales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Nombre *
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Carlos"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Apellidos
              </label>
              <input
                type="text"
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                placeholder="Ej. Gómez Martínez"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email de Acceso *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@rentselect.es"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Teléfono de Contacto
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Tipo de Perfil y Estado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Tipo de Perfil *
              </label>
              <select
                value={tipoPerfil}
                onChange={(e) => {
                  const val = e.target.value as TipoPerfilUsuario;
                  setTipoPerfil(val);
                  if (val === 'ADMINISTRADOR') {
                    setSelectedRoles(['SUPERADMIN']);
                    setSelectedPermisos(PERMISOS_SISTEMA.map((p) => p.codigo));
                  } else if (val === 'PROPIETARIO') {
                    setSelectedRoles(['PROPIETARIO_ESTANDAR']);
                    const def = ROLES_PREDEFINIDOS.find((r) => r.id === 'PROPIETARIO_ESTANDAR');
                    setSelectedPermisos(def?.permisos || []);
                  } else {
                    setSelectedRoles(['PROFESIONAL_MANTENIMIENTO']);
                    const def = ROLES_PREDEFINIDOS.find((r) => r.id === 'PROFESIONAL_MANTENIMIENTO');
                    setSelectedPermisos(def?.permisos || []);
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-medium"
              >
                <option value="ADMINISTRADOR">👑 Administrador (Acceso Completo)</option>
                <option value="PROPIETARIO">🏠 Propietario (Acceso a sus viviendas)</option>
                <option value="PROFESIONAL">🔧 Profesional / Empresa Mantenimiento</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Estado de la Cuenta *
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoUsuario)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-medium"
              >
                <option value="ACTIVO">✅ Activo (Puede iniciar sesión)</option>
                <option value="PENDIENTE">⏳ Pendiente de verificación / invitación</option>
                <option value="BLOQUEADO">⛔ Bloqueado por administración</option>
                <option value="INACTIVO">⏸️ Inactivo</option>
              </select>
            </div>
          </div>

          {/* Vinculación con Propietario Existente (Si es Propietario) */}
          {tipoPerfil === 'PROPIETARIO' && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center space-x-2 text-slate-800 font-semibold text-sm">
                <Building className="w-4 h-4 text-blue-600" />
                <span>Vincular con Ficha de Propietario Existente</span>
              </div>
              <p className="text-xs text-slate-500">
                Conecta esta cuenta de usuario con una ficha fiscal de propietario ya registrada para evitar duplicados.
              </p>
              <select
                value={propietarioId}
                onChange={(e) => handlePropietarioSelect(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              >
                <option value="">-- Sin vincular a propietario existente --</option>
                {propietarios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.nifCif}) — {p.email || 'Sin email'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Asignación de Inmuebles Autorizados */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-800 font-semibold text-sm">
                <Home className="w-4 h-4 text-blue-600" />
                <span>Ámbito de Viviendas Autorizadas ({selectedInmuebleIds.length})</span>
              </div>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedInmuebleIds(inmuebles.map((i) => i.id))}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  Seleccionar todos
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setSelectedInmuebleIds([])}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                >
                  Deseleccionar
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {tipoPerfil === 'ADMINISTRADOR'
                ? 'Los administradores tienen acceso global a todos los inmuebles por defecto.'
                : 'El usuario sólo podrá visualizar, consultar contratos y gestionar incidencias de las viviendas seleccionadas a continuación.'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
              {inmuebles.length === 0 ? (
                <div className="text-xs text-slate-400 p-2 italic col-span-2">
                  No hay inmuebles registrados en el sistema todavía.
                </div>
              ) : (
                inmuebles.map((inm) => {
                  const isChecked = selectedInmuebleIds.includes(inm.id);
                  return (
                    <label
                      key={inm.id}
                      className={`flex items-center space-x-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-blue-50 border-blue-300 text-blue-900 font-medium'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleInmuebleToggle(inm.id)}
                        className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span className="truncate">
                        {inm.alias || inm.direccion} {inm.ciudad ? `(${inm.ciudad})` : ''}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Roles Asignados */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center space-x-2 text-slate-800 font-semibold text-sm">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>Roles Predefinidos</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLES_PREDEFINIDOS.map((rol) => {
                const isSelected = selectedRoles.includes(rol.id);
                return (
                  <button
                    type="button"
                    key={rol.id}
                    onClick={() => handleRoleToggle(rol.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-300 text-blue-900 ring-1 ring-blue-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">{rol.nombre}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                      {rol.descripcion}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Permisos Granulares */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-slate-800 font-semibold text-sm">
                <Key className="w-4 h-4 text-blue-600" />
                <span>Permisos Granulares Activos ({selectedPermisos.length})</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
              {PERMISOS_SISTEMA.map((perm) => {
                const isChecked = selectedPermisos.includes(perm.codigo);
                return (
                  <label
                    key={perm.codigo}
                    className={`flex items-start space-x-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handlePermisoToggle(perm.codigo)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 mt-0.5"
                    />
                    <div>
                      <div className="font-semibold">{perm.nombre}</div>
                      <div className="text-[10px] text-slate-400">{perm.codigo}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center space-x-2"
          >
            {guardando ? (
              <span>Guardando...</span>
            ) : (
              <span>{isEditing ? 'Actualizar Usuario' : 'Crear Usuario'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
