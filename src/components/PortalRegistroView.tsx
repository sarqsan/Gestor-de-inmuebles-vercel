import React, { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { getEnlaceById } from '../lib/suministrosFirestore';
import { registerWithInvitationLink } from '../lib/authService';
import { validarInvitacionPropietario } from '../lib/accesoPropietarios';
import {
  Building,
  Wrench,
  User,
  Mail,
  Phone,
  Key,
  CheckCircle2,
  AlertCircle,
  Home,
  Check,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  EnlaceRegistro,
  Profesional,
  UsuarioApp,
  Propietario,
  Especialidad,
  ROLES_PREDEFINIDOS,
} from '../types';

interface PortalRegistroViewProps {
  token: string;
  /** ACCESO-PROPIETARIOS: si se aporta, modo nominal (lectura directa por ID, sin listar). */
  enlaceId?: string;
  enlaces: EnlaceRegistro[];
  profesionales: Profesional[];
  especialidades: Especialidad[];
  onCompleteRegistro: (
    usuario: UsuarioApp,
    propietarioData?: Partial<Propietario>,
    profesionalData?: Partial<Profesional>,
    enlaceUtilizado?: EnlaceRegistro
  ) => Promise<void>;
  onCancel: () => void;
}

export const PortalRegistroView: React.FC<PortalRegistroViewProps> = ({
  token,
  enlaceId,
  enlaces,
  profesionales,
  especialidades,
  onCompleteRegistro,
  onCancel,
}) => {
  // Find matching link or invitation
  const enlaceMatch = enlaces.find((e) => e.token === token && e.activo);
  const profesionalMatch = profesionales.find((p) => p.tokenInvitacion === token);

  const tipoPerfilDeterminado: 'PROPIETARIO' | 'PROFESIONAL' = profesionalMatch
    ? 'PROFESIONAL'
    : enlaceMatch
    ? enlaceMatch.tipoPerfil
    : 'PROPIETARIO';

  // Common fields
  const [nombre, setNombre] = useState(profesionalMatch?.contactoNombre || '');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState(profesionalMatch?.email || '');
  const [telefono, setTelefono] = useState(profesionalMatch?.telefono || '');
  const [password, setPassword] = useState('');
  const [cifNif, setCifNif] = useState(profesionalMatch?.cifNif || '');

  // Professional specific fields
  const [nombreComercial, setNombreComercial] = useState(
    profesionalMatch?.nombreComercial || ''
  );
  const [selectedEspecialidades, setSelectedEspecialidades] = useState<string[]>(
    profesionalMatch?.especialidades || []
  );
  const [provincia, setProvincia] = useState('Almería');
  const [municipio, setMunicipio] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [registroExitoso, setRegistroExitoso] = useState(false);

  // ACCESO-PROPIETARIOS: modo nominal — la invitación se lee por get() directo
  // (ID impredecible, regla pública si activa). Nunca se lista la colección.
  const [enlaceNominal, setEnlaceNominal] = useState<EnlaceRegistro | null>(null);
  const [cargandoNominal, setCargandoNominal] = useState(false);
  const [errorNominal, setErrorNominal] = useState('');

  useEffect(() => {
    if (!enlaceId) return;
    let vivo = true;
    setCargandoNominal(true);
    setErrorNominal('');
    (async () => {
      try {
        const enl = await getEnlaceById(enlaceId);
        if (!vivo) return;
        const v = validarInvitacionPropietario(enl);
        if (!enl || !v.ok) {
          setErrorNominal(v.errores[0] || 'Esta invitación no es válida.');
          return;
        }
        setEnlaceNominal(enl);
        if (enl.emailInvitado) setEmail(enl.emailInvitado);
      } catch {
        if (vivo) setErrorNominal('No se ha podido validar la invitación. Revisa tu conexión.');
      } finally {
        if (vivo) setCargandoNominal(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [enlaceId]);

  // Link validation
  const isExpired =
    enlaceMatch?.fechaCaducidad && new Date(enlaceMatch.fechaCaducidad) < new Date();
  const isMaxUsesReached =
    enlaceMatch?.usosMaximos !== undefined &&
    enlaceMatch.usosActuales >= enlaceMatch.usosMaximos;

  const isInvalid = !enlaceMatch && !profesionalMatch;

  // ACCESO-PROPIETARIOS: estados del modo nominal (carga / invitación inválida).
  if (enlaceId && (cargandoNominal || errorNominal || !enlaceNominal)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-200 shadow-xl text-center space-y-4">
          {cargandoNominal && !errorNominal ? (
            <>
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Validando tu invitación…</h2>
              <p className="text-xs text-slate-500">Estamos comprobando tu invitación nominal.</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Invitación No Válida</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                {errorNominal || 'Esta invitación nominal no es válida.'}
              </p>
              <button
                onClick={onCancel}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors"
              >
                Ir a la Página Principal
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!enlaceId && (isInvalid || isExpired || isMaxUsesReached)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-200 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Enlace de Registro No Válido</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isExpired
              ? 'Este enlace de invitación ha caducado.'
              : isMaxUsesReached
              ? 'Este enlace ha alcanzado el número máximo de usos permitidos.'
              : 'El enlace de registro que has utilizado no existe o ha sido desactivado por la administración.'}
          </p>
          <button
            onClick={onCancel}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors"
          >
            Ir a la Página Principal
          </button>
        </div>
      </div>
    );
  }

  const handleToggleEspecialidad = (esp: string) => {
    if (selectedEspecialidades.includes(esp)) {
      setSelectedEspecialidades(selectedEspecialidades.filter((e) => e !== esp));
    } else {
      setSelectedEspecialidades([...selectedEspecialidades, esp]);
    }
  };

  // ACCESO-PROPIETARIOS: activación nominal (un solo uso, sin duplicar nada).
  const handleSubmitNominal = async () => {
    if (!enlaceNominal) return;
    if (!password || password.length < 6) {
      setErrorMsg('Por favor introduce una contraseña de al menos 6 caracteres para tu cuenta.');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg('');
      const v = validarInvitacionPropietario(enlaceNominal, email);
      if (!v.ok) {
        setErrorMsg(v.errores[0]);
        return;
      }
      const { usuarioApp } = await registerWithInvitationLink({
        enlace: enlaceNominal,
        email: email.trim(),
        password,
        nombre: nombre.trim(),
        apellidos: apellidos.trim() || undefined,
        telefono: telefono.trim() || undefined,
      });
      await onCompleteRegistro(usuarioApp, undefined, undefined, enlaceNominal);
      setRegistroExitoso(true);
    } catch (err: any) {
      console.error('Error during nominal activation:', err);
      setErrorMsg(err?.message || 'Error al activar la cuenta.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // ACCESO-PROPIETARIOS: modo nominal → flujo canónico (servicio).
    if (enlaceId) {
      await handleSubmitNominal();
      return;
    }
    if (!nombre.trim() || !email.trim()) {
      setErrorMsg('Por favor completa los campos obligatorios.');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMsg('Por favor introduce una contraseña de al menos 6 caracteres para tu cuenta.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');

      // ACCESO-PROPIETARIOS: registro por enlace → servicio canónico
      // (un único flujo; sin duplicar usuario ni propietario).
      // El camino directo inferior queda solo para el profesional invitado
      // por token de ficha (sin enlace de registro).
      if (enlaceMatch) {
        const { usuarioApp } = await registerWithInvitationLink({
          enlace: enlaceMatch,
          email: email.trim(),
          password,
          nombre: nombre.trim(),
          apellidos: apellidos.trim() || undefined,
          telefono: telefono.trim() || undefined,
          cifNif: cifNif.trim() || undefined,
          nombreComercial: nombreComercial.trim() || undefined,
          especialidades: selectedEspecialidades,
          provincia,
          municipio,
        });
        await onCompleteRegistro(usuarioApp, undefined, undefined, enlaceMatch);
        setRegistroExitoso(true);
        return;
      }

      // Crear usuario real en Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );
      const authUser = userCredential.user;
      await updateProfile(authUser, { displayName: `${nombre.trim()} ${apellidos.trim()}`.trim() });

      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const rolDef = ROLES_PREDEFINIDOS.find((r) =>
        tipoPerfilDeterminado === 'PROPIETARIO'
          ? r.id === 'PROPIETARIO_ESTANDAR'
          : r.id === 'PROFESIONAL_MANTENIMIENTO'
      );

      const nuevoUsuario: UsuarioApp = {
        id: userId,
        authUid: authUser.uid,
        nombre: nombre.trim(),
        apellidos: apellidos.trim() || undefined,
        email: email.trim().toLowerCase(),
        telefono: telefono.trim() || undefined,
        tipoPerfil: tipoPerfilDeterminado,
        estado: 'ACTIVO',
        roles: rolDef ? [rolDef.id] : [],
        permisos: rolDef ? rolDef.permisos : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      let propietarioData: Partial<Propietario> | undefined;
      let profesionalData: Partial<Profesional> | undefined;

      if (tipoPerfilDeterminado === 'PROPIETARIO') {
        const propId = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        nuevoUsuario.propietarioId = propId;
        propietarioData = {
          id: propId,
          nombre: `${nombre.trim()} ${apellidos.trim()}`.trim(),
          nifCif: cifNif.trim() || 'NO_INDICADO',
          email: email.trim().toLowerCase(),
          telefono: telefono.trim() || undefined,
          direccion: 'Dirección por completar',
          ciudad: 'Ciudad por completar',
          codigoPostal: '00000',
          tipoPropietario: 'persona_fisica',
        };
      } else {
        const profId = profesionalMatch?.id || `prof_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        nuevoUsuario.profesionalId = profId;
        profesionalData = {
          id: profId,
          usuarioId: userId,
          nombreComercial: nombreComercial.trim() || nombre.trim(),
          contactoNombre: nombre.trim(),
          cifNif: cifNif.trim() || undefined,
          email: email.trim().toLowerCase(),
          telefono: telefono.trim() || undefined,
          especialidades: selectedEspecialidades,
          tipo: 'AUTONOMO',
          zonasServicio: [{ id: 'z1', provincia: provincia.trim(), municipio: municipio.trim() || undefined }],
          activo: true,
          tokenInvitacion: undefined, // consume token
        };
      }

      await onCompleteRegistro(
        nuevoUsuario,
        propietarioData,
        profesionalData,
        enlaceMatch
      );

      setRegistroExitoso(true);
    } catch (err: any) {
      console.error('Error during registration:', err);
      setErrorMsg(err?.message || 'Error al completar el registro.');
    } finally {
      setLoading(false);
    }
  };

  if (registroExitoso) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-200 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">¡Registro Completado con Éxito!</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Tu cuenta de{' '}
            <strong className="text-slate-800">
              {tipoPerfilDeterminado === 'PROPIETARIO' ? 'Propietario' : 'Profesional Técnico'}
            </strong>{' '}
            ha sido activada en RentSelect.
          </p>
          <button
            onClick={onCancel}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-2 cursor-pointer transition-colors"
          >
            <span>Acceder a Mi Panel</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ACCESO-PROPIETARIOS: formulario nominal (email invitado fijo + contraseña).
  if (enlaceId && enlaceNominal) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
          <div className="p-8 bg-slate-900 text-white space-y-3">
            <div className="flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-slate-400">
              <span>RentSelect</span>
              <span>·</span>
              <span>Invitación nominal</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              {enlaceNominal.textoVisible || '🔑 Activa tu cuenta de propietario'}
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              {enlaceNominal.descripcion ||
                'Crea tu contraseña para activar tu cuenta y acceder a tu panel de propietario.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Invitado (fijo)
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  readOnly
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-100 text-slate-600 font-medium"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Esta invitación es nominal e intransferible: solo vale para este correo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nombre
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Tu nombre"
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
                  placeholder="Tus apellidos"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Teléfono
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Contraseña *
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                Cancelar y volver
              </button>

              <button
                type="submit"
                disabled={loading}
                className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center space-x-2"
              >
                {loading ? <span>Activando cuenta...</span> : <span>Activar Mi Cuenta</span>}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-12">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
        {/* Banner */}
        <div className="p-8 bg-slate-900 text-white space-y-3">
          <div className="flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-slate-400">
            <span>RentSelect</span>
            <span>·</span>
            <span>Alta de Cuenta</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            {enlaceMatch?.textoVisible ||
              (tipoPerfilDeterminado === 'PROPIETARIO'
                ? '🏠 Regístrate como propietario'
                : '🔧 Regístrate como profesional o empresa')}
          </h1>
          <p className="text-xs text-slate-300 leading-relaxed">
            {enlaceMatch?.descripcion ||
              'Completa tus datos para activar tu cuenta y acceder a la plataforma de gestión inmobiliaria y de alquileres.'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {tipoPerfilDeterminado === 'PROFESIONAL' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Nombre Comercial / Marca *
              </label>
              <div className="relative">
                <Wrench className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={nombreComercial}
                  onChange={(e) => setNombreComercial(e.target.value)}
                  placeholder="Ej. Fontanería Vera y Servicios S.L."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}

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
                  placeholder="Tu nombre"
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
                placeholder="Tus apellidos"
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
                  placeholder="tuemail@ejemplo.com"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Teléfono
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

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                NIF / CIF Fiscal
              </label>
              <input
                type="text"
                value={cifNif}
                onChange={(e) => setCifNif(e.target.value)}
                placeholder="Ej. 12345678Z o B04123456"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {tipoPerfilDeterminado === 'PROFESIONAL' && (
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Especialidades que atiendes
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
                {especialidades.map((esp) => {
                  const isChecked = selectedEspecialidades.includes(esp.nombre);
                  return (
                    <button
                      type="button"
                      key={esp.id}
                      onClick={() => handleToggleEspecialidad(esp.nombre)}
                      className={`p-2 rounded-lg border text-xs font-medium flex items-center justify-between cursor-pointer ${
                        isChecked
                          ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <span>{esp.nombre}</span>
                      {isChecked && <Check className="w-3.5 h-3.5 text-amber-700" />}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Provincia Principal
                  </label>
                  <input
                    type="text"
                    value={provincia}
                    onChange={(e) => setProvincia(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Municipio Principal
                  </label>
                  <input
                    type="text"
                    value={municipio}
                    onChange={(e) => setMunicipio(e.target.value)}
                    placeholder="Ej. Vera"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
            >
              Cancelar y volver
            </button>

            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center space-x-2"
            >
              {loading ? (
                <span>Activando cuenta...</span>
              ) : (
                <span>Completar Registro y Acceder</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
