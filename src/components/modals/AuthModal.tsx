import React from 'react';
import {
  X,
  User,
  Shield,
  Home,
  Wrench,
  LogOut,
  Mail,
  Phone,
  Key,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { UsuarioApp } from '../../types';

interface AuthModalProps {
  currentUser: UsuarioApp | null;
  onLogout: () => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  currentUser,
  onLogout,
  onClose,
}) => {
  if (!currentUser) return null;

  const getPerfilBadge = (perfil: string) => {
    switch (perfil) {
      case 'ADMINISTRADOR':
        return (
          <span className="px-2.5 py-1 text-xs font-bold bg-purple-100 text-purple-800 rounded-lg flex items-center space-x-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>ADMINISTRADOR</span>
          </span>
        );
      case 'PROPIETARIO':
        return (
          <span className="px-2.5 py-1 text-xs font-bold bg-blue-100 text-blue-800 rounded-lg flex items-center space-x-1.5">
            <Home className="w-3.5 h-3.5" />
            <span>PROPIETARIO</span>
          </span>
        );
      case 'PROFESIONAL':
        return (
          <span className="px-2.5 py-1 text-xs font-bold bg-amber-100 text-amber-800 rounded-lg flex items-center space-x-1.5">
            <Wrench className="w-3.5 h-3.5" />
            <span>PROFESIONAL</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      id="user-profile-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md my-8 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Mi Perfil de Usuario
              </h3>
              <p className="text-xs text-slate-500">
                Sesión autenticada en Firebase
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                {currentUser.nombre.charAt(0)}
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">{currentUser.nombre} {currentUser.apellidos || ''}</p>
                <p className="text-xs text-slate-500 font-mono">{currentUser.email}</p>
              </div>
            </div>
            {getPerfilBadge(currentUser.tipoPerfil)}
          </div>

          <div className="space-y-2.5 text-xs text-slate-600">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-400">Estado de Cuenta:</span>
              <span className="font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{currentUser.estado}</span>
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-400">Firebase Auth UID:</span>
              <span className="font-mono text-slate-800 text-[11px] truncate max-w-[200px]">
                {currentUser.authUid || currentUser.id}
              </span>
            </div>

            {currentUser.telefono && (
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-400">Teléfono:</span>
                <span className="font-medium text-slate-800">{currentUser.telefono}</span>
              </div>
            )}

            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-400">Roles Asignados:</span>
              <span className="font-bold text-slate-800">
                {currentUser.roles?.join(', ') || 'ESTÁNDAR'}
              </span>
            </div>

            <div className="py-1.5">
              <span className="text-slate-400 block mb-1.5">Permisos del Sistema:</span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 bg-slate-50 border border-slate-100 rounded-lg">
                {currentUser.permisos && currentUser.permisos.length > 0 ? (
                  currentUser.permisos.map((p) => (
                    <span
                      key={p}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 font-mono"
                    >
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-400 text-[11px]">Permisos por defecto de rol</span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>

        {/* Security footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Control de Acceso RBAC Activo</span>
          </span>
          <button
            onClick={onClose}
            className="text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
