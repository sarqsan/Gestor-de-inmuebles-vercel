/**
 * BLOQUE E — Registro público de inquilino por invitación.
 * Lee el enlace por get() directo (ID impredecible, regla pública si activo).
 * Crea la cuenta mediante el flujo canónico (registerWithInvitationLink).
 */
import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Home,
  Key,
  Loader2,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import type { EnlaceRegistro, UsuarioApp } from '../../types';
import { getEnlaceById } from '../../lib/suministrosFirestore';
import { registerWithInvitationLink } from '../../lib/authService';
import { validarEnlaceRegistroInquilino } from '../../inquilino/portalEngine';

interface Props {
  enlaceId: string;
  onComplete: (usuario: UsuarioApp) => void;
  onCancel: () => void;
}

export const RegistroInquilinoView: React.FC<Props> = ({ enlaceId, onComplete, onCancel }) => {
  const [enlace, setEnlace] = useState<EnlaceRegistro | null>(null);
  const [cargandoEnlace, setCargandoEnlace] = useState(true);
  const [errorEnlace, setErrorEnlace] = useState('');

  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [usuarioCreado, setUsuarioCreado] = useState<UsuarioApp | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const enl = await getEnlaceById(enlaceId);
        if (!vivo) return;
        if (!enl) {
          setErrorEnlace('El enlace de invitación no existe o ha sido desactivado.');
          return;
        }
        const v = validarEnlaceRegistroInquilino(enl);
        if (!v.ok) {
          setErrorEnlace(v.errores[0]);
          return;
        }
        setEnlace(enl);
      } catch {
        if (vivo) setErrorEnlace('No se ha podido validar la invitación. Revisa tu conexión.');
      } finally {
        if (vivo) setCargandoEnlace(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [enlaceId]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enlace) return;
    if (!nombre.trim() || !email.trim()) {
      setError('Completa tu nombre y tu email.');
      return;
    }
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const { usuarioApp } = await registerWithInvitationLink({
        enlace,
        email: email.trim(),
        password,
        nombre: nombre.trim(),
        apellidos: apellidos.trim() || undefined,
        telefono: telefono.trim() || undefined,
      });
      setUsuarioCreado(usuarioApp);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se ha podido completar el registro.');
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoEnlace) {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-4">
        <p className="flex items-center gap-2 text-indigo-200 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin" /> Validando tu invitación…
        </p>
      </div>
    );
  }

  if (errorEnlace || !enlace) {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Invitación no válida</h2>
          <p className="text-xs text-slate-500">{errorEnlace || 'Esta invitación no es válida.'}</p>
          <button
            onClick={onCancel}
            className="w-full py-2.5 px-4 bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer"
          >
            Ir a la página principal
          </button>
        </div>
      </div>
    );
  }

  if (usuarioCreado) {
    return (
      <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">¡Cuenta creada!</h2>
          <p className="text-xs text-slate-500">
            Tu acceso al <strong>portal del inquilino</strong> está listo, {usuarioCreado.nombre}.
          </p>
          <button
            onClick={() => onComplete(usuarioCreado)}
            className="w-full py-2.5 px-4 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            Entrar en mi portal <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-indigo-950 flex items-center justify-center p-4 py-10">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
        <div className="p-7 bg-gradient-to-br from-indigo-700 to-violet-800 text-white space-y-2">
          <p className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-indigo-200">
            <Home className="w-3.5 h-3.5" /> Portal del inquilino
          </p>
          <h1 className="text-xl font-black">{enlace.textoVisible}</h1>
          <p className="text-xs text-indigo-100">{enlace.descripcion}</p>
        </div>
        <form onSubmit={enviar} className="p-7 space-y-4">
          {error && (
            <p className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Nombre *</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Apellidos</label>
              <input
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                placeholder="Tus apellidos"
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Email de acceso *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tuemail@ejemplo.com"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Teléfono</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+34 600 000 000"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Contraseña * (mín. 6 caracteres)</label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={guardando}
            className="w-full py-3 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50"
          >
            {guardando ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-xs text-slate-500 font-medium cursor-pointer"
          >
            Cancelar y volver
          </button>
        </form>
      </div>
    </div>
  );
};
