import React, { useState } from 'react';
import {
  Building2,
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  Sparkles,
  Link2,
  Info,
} from 'lucide-react';
import {
  loginWithEmail,
  initFirstAdminAccount,
  ADMIN_MASTER_EMAIL,
  mensajeErrorLogin,
} from '../lib/authService';
import { UsuarioApp } from '../types';

interface LoginViewProps {
  onLoginSuccess: (usuario: UsuarioApp) => void;
  onOpenRegisterWithToken?: (token: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onOpenRegisterWithToken,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showAdminSetup, setShowAdminSetup] = useState(false);
  const [adminSetupPassword, setAdminSetupPassword] = useState('');
  const [adminSetupConfirm, setAdminSetupConfirm] = useState('');
  const [adminSetupSuccess, setAdminSetupSuccess] = useState(false);
  const [invitationTokenInput, setInvitationTokenInput] = useState('');
  const [showInvitationPrompt, setShowInvitationPrompt] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Por favor introduce tu correo electrónico y contraseña.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');
      const { usuarioApp } = await loginWithEmail(email, password);
      onLoginSuccess(usuarioApp);
    } catch (err: any) {
      console.error('Error de autenticación:', err);
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        setErrorMsg('Credenciales incorrectas. Verifica tu correo y contraseña.');
      } else if (err?.code === 'auth/user-not-found') {
        setErrorMsg('No existe ningún usuario con este correo electrónico.');
      } else if (err?.code === 'auth/too-many-requests') {
        setErrorMsg('Demasiados intentos fallidos. Por favor inténtalo de nuevo en unos minutos.');
      } else if (mensajeErrorLogin(err)) {
        setErrorMsg(mensajeErrorLogin(err) as string);
      } else {
        setErrorMsg(err?.message || 'Error al iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSetupPassword || adminSetupPassword.length < 6) {
      setErrorMsg('La contraseña de administrador debe tener un mínimo de 6 caracteres.');
      return;
    }
    if (adminSetupPassword !== adminSetupConfirm) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');
      const { usuarioApp } = await initFirstAdminAccount(adminSetupPassword);
      setAdminSetupSuccess(true);
      setTimeout(() => {
        onLoginSuccess(usuarioApp);
      }, 1200);
    } catch (err: any) {
      console.error('Error configurando administrador:', err);
      setErrorMsg(err?.message || 'Error al inicializar la cuenta de administrador.');
    } finally {
      setLoading(false);
    }
  };

  const handleInvitationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitationTokenInput.trim()) {
      setErrorMsg('Introduce el token o enlace de invitación.');
      return;
    }

    // Extraer token si el usuario pegó la URL completa
    let token = invitationTokenInput.trim();
    if (token.includes('registro=')) {
      const match = token.match(/registro=([^&]+)/);
      if (match && match[1]) {
        token = match[1];
      }
    }

    if (onOpenRegisterWithToken) {
      onOpenRegisterWithToken(token);
    } else {
      window.location.search = `?registro=${encodeURIComponent(token)}`;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background ambient gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-blue-900/20 via-indigo-900/10 to-transparent pointer-events-none blur-3xl" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/25 border border-blue-400/20">
            <Building2 className="w-8 h-8" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-3xl font-extrabold text-white tracking-tight">
          RentSelect
        </h2>
        <p className="mt-1 text-center text-sm text-slate-400">
          Plataforma de Gestión Inmobiliaria & Seguridad
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {adminSetupSuccess && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div className="leading-relaxed">
                ¡Administrador configurado con éxito! Entrando al Centro de Control...
              </div>
            </div>
          )}

          {/* Formulario Estándar de Login */}
          {!showAdminSetup && !showInvitationPrompt && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Correo Electrónico
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ejemplo@rentselect.com"
                    className="block w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative rounded-xl shadow-xs">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="block w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Iniciar Sesión</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Formulario de Inicialización del Primer Administrador */}
          {showAdminSetup && (
            <form onSubmit={handleAdminSetup} className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 text-xs flex items-start gap-2.5 mb-3">
                <Info className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
                <div>
                  Procedimiento de configuración de credenciales del Administrador Principal:{' '}
                  <span className="font-mono font-bold text-white">{ADMIN_MASTER_EMAIL}</span>.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nueva Contraseña de Administrador
                </label>
                <input
                  type="password"
                  required
                  value={adminSetupPassword}
                  onChange={(e) => setAdminSetupPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="block w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Confirmar Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={adminSetupConfirm}
                  onChange={(e) => setAdminSetupConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="block w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Configurar y Acceder como Administrador</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminSetup(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 py-1.5 transition-colors cursor-pointer text-center"
                >
                  Volver al inicio de sesión normal
                </button>
              </div>
            </form>
          )}

          {/* Formulario para ingresar con Token de Invitación */}
          {showInvitationPrompt && (
            <form onSubmit={handleInvitationSubmit} className="space-y-4">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-300 text-xs flex items-start gap-2.5 mb-2">
                <Link2 className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
                <div>
                  Introduce el token o enlace de invitación proporcionado por un propietario o por la
                  administración para darte de alta.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Token o Enlace de Invitación
                </label>
                <input
                  type="text"
                  required
                  value={invitationTokenInput}
                  onChange={(e) => setInvitationTokenInput(e.target.value)}
                  placeholder="Ej. reg_prop_valle_2026 o URL completa"
                  className="block w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-white text-sm focus:ring-2 focus:ring-purple-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Continuar al Formulario de Registro</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvitationPrompt(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 py-1.5 transition-colors cursor-pointer text-center"
                >
                  Volver al inicio de sesión
                </button>
              </div>
            </form>
          )}

          {/* Opciones y accesos secundarios */}
          {!showAdminSetup && !showInvitationPrompt && (
            <div className="mt-6 pt-6 border-t border-slate-800/80 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setShowInvitationPrompt(true);
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-950/50 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5 text-purple-400" />
                <span>¿Tienes un enlace de invitación? Regístrate aquí</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setShowAdminSetup(true);
                }}
                className="w-full py-1.5 px-3 text-slate-400 hover:text-indigo-400 text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <KeyRound className="w-3 h-3" />
                <span>Configurar Administrador Principal ({ADMIN_MASTER_EMAIL})</span>
              </button>
            </div>
          )}
        </div>

        {/* Security watermark footer */}
        <div className="mt-6 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Acceso protegido por Firebase Authentication & RBAC</span>
        </div>
      </div>
    </div>
  );
};
