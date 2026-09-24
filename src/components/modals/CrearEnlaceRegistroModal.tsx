import React, { useState } from 'react';
import { X, Link2, Copy, Check, Calendar, Users, Eye } from 'lucide-react';
import { EnlaceRegistro, Propietario, UsuarioApp } from '../../types';
import {
  buildInvitacionNominalPropietario,
  buildUrlInvitacionPropietario,
  generarIdEnlace,
} from '../../lib/accesoPropietarios';

interface CrearEnlaceRegistroModalProps {
  enlaceParaEditar?: EnlaceRegistro | null;
  usuarios?: UsuarioApp[];
  propietarios?: Propietario[];
  onSave: (enlace: EnlaceRegistro) => Promise<void>;
  onClose: () => void;
}

export const CrearEnlaceRegistroModal: React.FC<CrearEnlaceRegistroModalProps> = ({
  enlaceParaEditar,
  usuarios = [],
  propietarios = [],
  onSave,
  onClose,
}) => {
  const isEditing = !!enlaceParaEditar;
  // ACCESO-PROPIETARIOS: id estable para previsualizar la URL nominal.
  const [enlaceId] = useState(enlaceParaEditar?.id || generarIdEnlace());
  const [usuarioVinculadoId, setUsuarioVinculadoId] = useState(
    enlaceParaEditar?.usuarioIdVinculado || ''
  );

  const [tipoPerfil, setTipoPerfil] = useState<'PROPIETARIO' | 'PROFESIONAL'>(
    enlaceParaEditar?.tipoPerfil || 'PROPIETARIO'
  );
  const [textoVisible, setTextoVisible] = useState(
    enlaceParaEditar?.textoVisible ||
      (tipoPerfil === 'PROPIETARIO'
        ? '🏠 Regístrate como propietario'
        : '🔧 Regístrate como profesional o empresa')
  );
  const [descripcion, setDescripcion] = useState(
    enlaceParaEditar?.descripcion || ''
  );
  const [token, setToken] = useState(
    enlaceParaEditar?.token ||
      `reg_${tipoPerfil.toLowerCase()}_${Math.random().toString(36).substring(2, 8)}`
  );
  const [activo, setActivo] = useState(
    enlaceParaEditar?.activo !== undefined ? enlaceParaEditar.activo : true
  );
  const [fechaCaducidad, setFechaCaducidad] = useState(
    enlaceParaEditar?.fechaCaducidad || ''
  );
  const [usosMaximos, setUsosMaximos] = useState<string>(
    enlaceParaEditar?.usosMaximos ? String(enlaceParaEditar.usosMaximos) : ''
  );

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiado, setCopiado] = useState(false);

  // ACCESO-PROPIETARIOS: candidatos a invitación nominal (pendientes sin acceso).
  const usuariosPendientes = usuarios.filter(
    (u) => u.tipoPerfil === 'PROPIETARIO' && u.estado === 'PENDIENTE' && !u.authUid
  );
  const usuarioVinculado = usuarios.find((u) => u.id === usuarioVinculadoId);
  const propietarioVinculado = propietarios.find(
    (p) => p.id === (usuarioVinculado?.propietarioId || enlaceParaEditar?.propietarioIdVinculado)
  );

  const handleUsuarioVinculadoChange = (nuevoId: string) => {
    setUsuarioVinculadoId(nuevoId);
    if (nuevoId && !isEditing) {
      // Disciplina nominal: un solo uso + caducidad a 14 días si está vacía.
      setUsosMaximos('1');
      setFechaCaducidad((prev) => {
        if (prev) return prev;
        const d = new Date(Date.now() + 14 * 86400000);
        return d.toISOString().slice(0, 10);
      });
    }
  };

  const fullUrl = usuarioVinculadoId
    ? buildUrlInvitacionPropietario(enlaceId, window.location.origin)
    : `${window.location.origin}?registro=${token}`;

  const handleTipoChange = (nuevoTipo: 'PROPIETARIO' | 'PROFESIONAL') => {
    setTipoPerfil(nuevoTipo);
    if (nuevoTipo !== 'PROPIETARIO') setUsuarioVinculadoId('');
    if (!isEditing) {
      setTextoVisible(
        nuevoTipo === 'PROPIETARIO'
          ? '🏠 Regístrate como propietario'
          : '🔧 Regístrate como profesional o empresa'
      );
      setToken(`reg_${nuevoTipo.toLowerCase()}_${Math.random().toString(36).substring(2, 8)}`);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textoVisible.trim() || !token.trim()) {
      setErrorMsg('Por favor especifica el texto visible y el código de enlace.');
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg('');

      // ACCESO-PROPIETARIOS: disciplina de la invitación nominal.
      let vinculosNominal: Partial<EnlaceRegistro> = {};
      let usosMaximosFinal = usosMaximos ? parseInt(usosMaximos, 10) : undefined;
      if (usuarioVinculadoId) {
        if (!usuarioVinculado) {
          setErrorMsg('El usuario pendiente seleccionado ya no existe.');
          return;
        }
        if (!usuarioVinculado.propietarioId) {
          setErrorMsg('El usuario pendiente no está vinculado a ningún propietario.');
          return;
        }
        if (!fechaCaducidad) {
          setErrorMsg('La invitación nominal requiere fecha de caducidad.');
          return;
        }
        const nominal = buildInvitacionNominalPropietario({ usuario: usuarioVinculado });
        vinculosNominal = {
          token: isEditing ? token.trim() : nominal.token,
          textoVisible: textoVisible.trim() || nominal.textoVisible,
          descripcion: descripcion.trim() || nominal.descripcion,
          fechaCaducidad: new Date(fechaCaducidad).toISOString(),
          propietarioIdVinculado: usuarioVinculado.propietarioId,
          usuarioIdVinculado: usuarioVinculado.id,
          emailInvitado: usuarioVinculado.email.trim().toLowerCase(),
        };
        usosMaximosFinal = 1;
      }

      const enlaceActualizado: EnlaceRegistro = {
        id: enlaceId,
        token: token.trim(),
        tipoPerfil,
        textoVisible: textoVisible.trim(),
        descripcion: descripcion.trim() || undefined,
        activo,
        fechaCaducidad: fechaCaducidad ? new Date(fechaCaducidad).toISOString() : undefined,
        usosMaximos: usosMaximosFinal,
        usosActuales: enlaceParaEditar?.usosActuales || 0,
        creadoPor: enlaceParaEditar?.creadoPor || 'admin',
        createdAt: enlaceParaEditar?.createdAt || new Date().toISOString(),
        ...vinculosNominal,
      };

      await onSave(enlaceActualizado);
      onClose();
    } catch (err: any) {
      console.error('Error saving invitation link:', err);
      setErrorMsg(err?.message || 'Error al guardar el enlace de registro.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      id="crear-enlace-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl my-8 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Configurar Enlace de Registro' : 'Crear Nuevo Enlace de Registro'}
              </h3>
              <p className="text-xs text-slate-500">
                Configura el texto visible, token único y tipo de perfil permitido
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
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm font-medium">
              {errorMsg}
            </div>
          )}

          {/* Tipo de Perfil */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Tipo de Perfil a Registrar *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTipoChange('PROPIETARIO')}
                className={`p-3 text-xs font-semibold rounded-xl border text-left transition-all cursor-pointer ${
                  tipoPerfil === 'PROPIETARIO'
                    ? 'bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-400'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-base">🏠</span>
                  <span className="font-bold">Propietario / Arrendador</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Acceso a viviendas en alquiler y contratos
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleTipoChange('PROFESIONAL')}
                className={`p-3 text-xs font-semibold rounded-xl border text-left transition-all cursor-pointer ${
                  tipoPerfil === 'PROFESIONAL'
                    ? 'bg-amber-50 border-amber-400 text-amber-900 ring-1 ring-amber-400'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="text-base">🔧</span>
                  <span className="font-bold">Profesional / Empresa</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Acceso técnico para mantenimiento y zonas
                </p>
              </button>
            </div>
          </div>

          {/* ACCESO-PROPIETARIOS: invitación nominal de un solo uso */}
          {tipoPerfil === 'PROPIETARIO' && (
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
              <div>
                <label className="block text-xs font-semibold text-emerald-900 uppercase tracking-wider mb-1.5">
                  Invitación Nominal (usuario pendiente)
                </label>
                <select
                  value={usuarioVinculadoId}
                  onChange={(e) => handleUsuarioVinculadoChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-emerald-300 rounded-xl bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                >
                  <option value="">— Enlace genérico (sin nominalizar) —</option>
                  {usuarioVinculado &&
                    !usuariosPendientes.some((u) => u.id === usuarioVinculado.id) && (
                      <option value={usuarioVinculado.id}>
                        {usuarioVinculado.nombre} · {usuarioVinculado.email} (vinculado actual)
                      </option>
                    )}
                  {usuariosPendientes.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre} · {u.email}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-emerald-800 mt-1">
                  Al nominalizar: un solo uso, caducidad obligatoria y URL por ID directo (sin
                  listar). El propietario activa su cuenta pendiente, sin duplicados.
                </p>
              </div>
              {usuarioVinculadoId && (
                <div className="text-[11px] text-emerald-900 bg-white/70 border border-emerald-200 rounded-lg px-3 py-2 space-y-0.5">
                  <div>
                    <strong>Usuario:</strong> {usuarioVinculado?.nombre || '—'} (
                    {usuarioVinculado?.email || enlaceParaEditar?.emailInvitado || '—'})
                  </div>
                  <div>
                    <strong>Propietario:</strong> {propietarioVinculado?.nombre || '—'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Texto Visible */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Texto Visible del Enlace / Botón *
            </label>
            <div className="relative">
              <Eye className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                required
                value={textoVisible}
                onChange={(e) => setTextoVisible(e.target.value)}
                placeholder="Ej. «🏠 Regístrate como propietario»"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden font-medium"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Es el título que se mostrará en los botones de invitación o cabecera de la página.
            </p>
          </div>

          {/* Descripción opcional */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Descripción o Instrucciones
            </label>
            <textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Instrucciones para quien reciba el enlace..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
            />
          </div>

          {/* Token del Enlace & URL Preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Identificador / Token Técnico
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl bg-slate-50"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-2 text-xs font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors shrink-0"
              >
                {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiado ? '¡Copiado!' : 'Copiar URL'}</span>
              </button>
            </div>
            <div className="mt-1 text-[11px] text-slate-400 font-mono truncate">
              {fullUrl}
            </div>
          </div>

          {/* Límites: Usos máximos y Caducidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Límite de Usos (Opcional)
              </label>
              <div className="relative">
                <Users className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="number"
                  min="1"
                  value={usosMaximos}
                  onChange={(e) => setUsosMaximos(e.target.value)}
                  placeholder="Ilimitado"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Fecha de Caducidad (Opcional)
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="date"
                  value={fechaCaducidad}
                  onChange={(e) => setFechaCaducidad(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Estado Activo */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-800">Enlace Activo</div>
              <div className="text-[11px] text-slate-500">
                Si se desactiva, los usuarios que entren verán aviso de enlace caducado
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
          >
            {guardando ? (
              <span>Guardando...</span>
            ) : (
              <span>{isEditing ? 'Actualizar Enlace' : 'Crear Enlace'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
