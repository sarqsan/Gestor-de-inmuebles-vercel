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
  Info,
  Lock,
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
import {
  esUsuarioMaster,
  validarEdicionAdmin,
  ROL_SUPERADMIN,
} from '../../lib/adminUsuarios';

const ETIQUETA_PERFIL: Record<TipoPerfilUsuario, string> = {
  ADMINISTRADOR: '👑 Administrador (Acceso Completo)',
  PROPIETARIO: '🏠 Propietario (Acceso a sus viviendas)',
  PROFESIONAL: '🔧 Profesional / Empresa Mantenimiento',
  INQUILINO: '🔑 Inquilino (Acceso portal)',
};

interface CrearUsuarioModalProps {
  usuarioParaEditar?: UsuarioApp | null;
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  onSave: (usuario: UsuarioApp) => Promise<void>;
  onClose: () => void;
  /** Cuenta autenticada que opera el editor (para protecciones de autoedición). */
  operador?: { id: string; email: string } | null;
}

export const CrearUsuarioModal: React.FC<CrearUsuarioModalProps> = ({
  usuarioParaEditar,
  inmuebles,
  propietarios,
  onSave,
  onClose,
  operador,
}) => {
  // Edición solo si hay un documento existente con id: el prefill de alta
  // (sin id o con id vacío) y otras llamadas abren el modo creación.
  const isEditing = !!usuarioParaEditar?.id;

  // --- Reglas de edición administrativa (Bloque Administración) ---
  const esMasterEditado = isEditing && esUsuarioMaster(usuarioParaEditar);
  const esSelfEditado = isEditing && !!operador?.id && operador.id === usuarioParaEditar?.id;
  const estadoInicialEsPendiente = (usuarioParaEditar?.estado || 'ACTIVO') === 'PENDIENTE';
  const rolesBloqueados = esMasterEditado || esSelfEditado;
  const permisosBloqueados = esMasterEditado || esSelfEditado;
  const estadoBloqueado = estadoInicialEsPendiente || esMasterEditado;
  const fichaPropietarioVinculada = isEditing
    ? propietarios.find((p) => p.id === usuarioParaEditar?.propietarioId)
    : undefined;
  const numContratosPreservados = isEditing ? usuarioParaEditar?.contratoIds?.length || 0 : 0;

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

      // En edición se parte del documento existente para preservar authUid,
      // vínculos (fichas/contratos/viviendas) y metadatos; los campos
      // bloqueados se fuerzan al valor original como defensa en profundidad.
      const original = isEditing ? usuarioParaEditar ?? undefined : undefined;
      const ahora = new Date().toISOString();
      const usuarioActualizado: UsuarioApp = {
        ...(original ? { ...original } : {}),
        id: original?.id || `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        nombre: nombre.trim(),
        apellidos: apellidos.trim() || undefined,
        email: original ? original.email : email.trim().toLowerCase(),
        telefono: telefono.trim() || undefined,
        tipoPerfil: original ? original.tipoPerfil : tipoPerfil,
        estado,
        roles: selectedRoles,
        permisos: selectedPermisos,
        inmuebleIds: original ? original.inmuebleIds : selectedInmuebleIds,
        propietarioId: original ? original.propietarioId : (propietarioId || undefined),
        createdAt: original?.createdAt || ahora,
        updatedAt: ahora,
      };

      // Las reglas de adminUsuarios mandan sobre la UI: si algo viola las
      // protecciones (master, autoedición, vínculos, estados), se rechaza.
      if (original) {
        const rechazo = validarEdicionAdmin({
          operador: operador ?? null,
          original,
          editado: usuarioActualizado,
        });
        if (rechazo) {
          setErrorMsg(rechazo);
          setGuardando(false);
          return;
        }
      }

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
              <h3 className="text-lg font-bold text-slate-900" data-testid="usuario-modal-titulo">
                {isEditing ? 'Modificar Usuario y Permisos' : 'Dar de Alta Nuevo Usuario'}
              </h3>
              <p className="text-xs text-slate-500">
                {isEditing && usuarioParaEditar
                  ? `${usuarioParaEditar.nombre} · ${usuarioParaEditar.email} · ${usuarioParaEditar.tipoPerfil}`
                  : 'Asigna tipo de perfil, roles de acceso y ámbito de viviendas autorizadas'}
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

          {isEditing && esMasterEditado && (
            <div data-testid="aviso-master" className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-medium flex items-start gap-2">
              <Lock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Cuenta maestra protegida: solo pueden editarse nombre, apellidos y teléfono. Estado, perfil, roles, permisos y vínculos están bloqueados.</span>
            </div>
          )}
          {isEditing && esSelfEditado && !esMasterEditado && (
            <div data-testid="aviso-self" className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs font-medium flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Estás editando tu propia cuenta: no puedes modificar tus roles, tus permisos ni desactivarla.</span>
            </div>
          )}
          {isEditing && (
            <div data-testid="auth-info" className="p-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Cuenta de acceso: {usuarioParaEditar?.authUid ? 'vinculada' : 'pendiente de vinculación'}
                {numContratosPreservados > 0 && ` · ${numContratosPreservados} contrato(s) preservado(s)`}
                {' '}· Fichas y vínculos preservados.
              </span>
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
                  readOnly={isEditing}
                  title={isEditing ? 'El email de acceso no puede modificarse' : undefined}
                  className={`w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden ${isEditing ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''}`}
                />
              </div>
              {isEditing && (
                <p className="text-[11px] text-slate-400 mt-1">No modificable en edición.</p>
              )}
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
              {isEditing ? (
                <div data-testid="perfil-badge" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-100 text-slate-700 font-medium flex items-center justify-between">
                  <span>{ETIQUETA_PERFIL[tipoPerfil] ?? tipoPerfil}</span>
                  <span className="text-[11px] text-slate-400 font-normal">No modificable</span>
                </div>
              ) : (
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
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Estado de la Cuenta *
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as EstadoUsuario)}
                disabled={estadoBloqueado}
                data-testid="estado-select"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-medium disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
              >
                <option value="ACTIVO">✅ Activo (Puede iniciar sesión)</option>
                {estadoInicialEsPendiente ? (
                  <option value="PENDIENTE">⏳ Pendiente de verificación / invitación</option>
                ) : null}
                <option value="BLOQUEADO">⛔ Bloqueado por administración</option>
                <option value="INACTIVO">⏸️ Inactivo</option>
              </select>
              {estadoBloqueado && (
                <p className="text-[11px] text-slate-400 mt-1">
                  {esMasterEditado
                    ? 'La cuenta maestra no puede cambiar de estado.'
                    : 'Gestionado por invitación: no modificable desde este editor.'}
                </p>
              )}
            </div>
          </div>

          {/* Vinculación con Propietario Existente (Si es Propietario) */}
          {tipoPerfil === 'PROPIETARIO' && !isEditing && (
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
          {isEditing && tipoPerfil === 'PROPIETARIO' && (
            <div data-testid="vinculo-propietario" className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Ficha de propietario vinculada: </span>
              {fichaPropietarioVinculada
                ? `${fichaPropietarioVinculada.nombre} (${fichaPropietarioVinculada.nifCif})`
                : 'Sin vincular'}
              <span className="text-slate-400"> — no modificable desde este editor.</span>
            </div>
          )}

          {/* Asignación de Inmuebles Autorizados */}
          {isEditing ? (
            <div data-testid="ambito-viviendas" className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Ámbito de viviendas autorizadas: </span>
              {selectedInmuebleIds.length} vivienda(s)
              <span className="text-slate-400"> — no modificable desde este editor.</span>
            </div>
          ) : (
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
          )}

          {/* Roles Asignados */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center space-x-2 text-slate-800 font-semibold text-sm">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>Roles Predefinidos</span>
            </div>
            {rolesBloqueados && (
              <p className="text-[11px] text-slate-400">Roles bloqueados en esta cuenta.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="roles-group">
              {ROLES_PREDEFINIDOS.filter((rol) => rol.id !== ROL_SUPERADMIN || selectedRoles.includes(ROL_SUPERADMIN)).map((rol) => {
                const isSelected = selectedRoles.includes(rol.id);
                const rolBloqueado = rolesBloqueados || rol.id === ROL_SUPERADMIN;
                return (
                  <button
                    type="button"
                    key={rol.id}
                    onClick={() => handleRoleToggle(rol.id)}
                    disabled={rolBloqueado}
                    title={rol.id === ROL_SUPERADMIN ? 'No gestionable desde este editor' : undefined}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
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
            {permisosBloqueados && (
              <p className="text-[11px] text-slate-400">Permisos bloqueados en esta cuenta.</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50" data-testid="permisos-group">
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
                      disabled={permisosBloqueados}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 mt-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
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
