import React, { useState } from 'react';
import { X, Link2, Copy, Check, Calendar, Users, Eye } from 'lucide-react';
import { EnlaceRegistro } from '../../types';

interface CrearEnlaceRegistroModalProps {
  enlaceParaEditar?: EnlaceRegistro | null;
  onSave: (enlace: EnlaceRegistro) => Promise<void>;
  onClose: () => void;
}

export const CrearEnlaceRegistroModal: React.FC<CrearEnlaceRegistroModalProps> = ({
  enlaceParaEditar,
  onSave,
  onClose,
}) => {
  const isEditing = !!enlaceParaEditar;

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

  const fullUrl = `${window.location.origin}?registro=${token}`;

  const handleTipoChange = (nuevoTipo: 'PROPIETARIO' | 'PROFESIONAL') => {
    setTipoPerfil(nuevoTipo);
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

      const enlaceActualizado: EnlaceRegistro = {
        id: enlaceParaEditar?.id || `enlace_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        token: token.trim(),
        tipoPerfil,
        textoVisible: textoVisible.trim(),
        descripcion: descripcion.trim() || undefined,
        activo,
        fechaCaducidad: fechaCaducidad ? new Date(fechaCaducidad).toISOString() : undefined,
        usosMaximos: usosMaximos ? parseInt(usosMaximos, 10) : undefined,
        usosActuales: enlaceParaEditar?.usosActuales || 0,
        creadoPor: enlaceParaEditar?.creadoPor || 'admin',
        createdAt: enlaceParaEditar?.createdAt || new Date().toISOString(),
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
