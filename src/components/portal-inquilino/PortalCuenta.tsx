/** BLOQUE E — Mi cuenta (datos de acceso + cierre de sesión). */
import React from 'react';
import { LogOut } from 'lucide-react';
import type { UsuarioApp } from '../../types';

interface Props {
  usuario: UsuarioApp;
  onLogout: () => void;
}

export const PortalCuenta: React.FC<Props> = ({ usuario, onLogout }) => {
  return (
    <div className="space-y-3">
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-700 text-white flex items-center justify-center text-xl font-black">
          {(usuario.nombre || 'I').charAt(0).toUpperCase()}
        </div>
        <h2 className="mt-2 text-base font-extrabold">
          {usuario.nombre} {usuario.apellidos || ''}
        </h2>
        <p className="text-xs text-slate-500">{usuario.email}</p>
        {usuario.telefono && <p className="text-xs text-slate-500">{usuario.telefono}</p>}
        <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Contratos vinculados</span>
            <strong>{(usuario.contratoIds || []).length}</strong>
          </div>
          {usuario.habitacionIdentificador && (
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Habitación</span>
              <strong>{usuario.habitacionIdentificador}</strong>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500 font-medium">Último acceso</span>
            <strong>
              {usuario.lastLoginAt ? new Date(usuario.lastLoginAt).toLocaleDateString('es-ES') : '—'}
            </strong>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <p className="text-xs text-slate-600 leading-relaxed">
          Si necesitas cambiar tu email, tu teléfono o desvincular un contrato, contacta con gestión
          desde la sección de mensajes.
        </p>
      </section>

      <button
        onClick={onLogout}
        className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-2xl cursor-pointer"
      >
        <LogOut className="w-4 h-4" /> Cerrar sesión
      </button>
    </div>
  );
};
