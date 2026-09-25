import React, { useState } from 'react';
import {
  Home,
  Wrench,
  User,
  Mail,
  Phone,
  Key,
  Check,
  MapPin,
  Trash2,
  Plus,
  AlertCircle,
  ArrowLeft,
  Loader2,
  UserCheck,
  Building2,
  Users,
} from 'lucide-react';
import { registerAutonomo } from '../lib/authService';
import { enviarRegistroAutonomo, type ZonaAdicionalForm } from '../lib/registroAutonomoForm';
import type {
  Especialidad,
  TipoProfesional,
  TipoPropietario,
  UsuarioApp,
} from '../types';

export type PasoRegistroAutonomo = 'selector' | 'propietario' | 'profesional';

interface RegistroAutonomoViewProps {
  especialidades: Especialidad[];
  onComplete: (usuario: UsuarioApp) => void | Promise<void>;
  onCancel: () => void;
  /** Solo tests: paso inicial (producción siempre empieza en el selector). */
  pasoInicial?: PasoRegistroAutonomo;
}

// Titularidades con las mismas etiquetas que PropietariosSection.
const TIPOS_PROPIETARIO: Array<{
  id: TipoPropietario;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'persona_fisica', label: 'Persona Física', Icon: UserCheck },
  { id: 'persona_juridica', label: 'Sociedad / S.L. / S.A.', Icon: Building2 },
  { id: 'comunidad_bienes', label: 'Comunidad Bienes', Icon: Users },
];

const inputCls =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden';
const inputIconCls =
  'w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden';
const labelCls =
  'block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5';

export const RegistroAutonomoView: React.FC<RegistroAutonomoViewProps> = ({
  especialidades,
  onComplete,
  onCancel,
  pasoInicial,
}) => {
  const [paso, setPaso] = useState<PasoRegistroAutonomo>(pasoInicial || 'selector');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Campos comunes
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Propietario
  const [nifCif, setNifCif] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [provinciaProp, setProvinciaProp] = useState('');
  const [tipoPropietario, setTipoPropietario] = useState<TipoPropietario>('persona_fisica');

  // Profesional
  const [nombreComercial, setNombreComercial] = useState('');
  const [cifNifProf, setCifNifProf] = useState('');
  const [tipoProf, setTipoProf] = useState<TipoProfesional>('AUTONOMO');
  const [especialidadesSel, setEspecialidadesSel] = useState<string[]>([]);
  const [provincia, setProvincia] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [zonasAdicionales, setZonasAdicionales] = useState<ZonaAdicionalForm[]>([]);
  const [nuevaZonaProvincia, setNuevaZonaProvincia] = useState('');
  const [nuevaZonaMunicipio, setNuevaZonaMunicipio] = useState('');

  const catalogoNombres = especialidades.map((e) => e.nombre);

  const handleToggleEspecialidad = (nombreEsp: string) => {
    setEspecialidadesSel((prev) =>
      prev.includes(nombreEsp) ? prev.filter((e) => e !== nombreEsp) : [...prev, nombreEsp]
    );
  };

  const handleAddZona = () => {
    if (!nuevaZonaProvincia.trim()) return;
    setZonasAdicionales([
      ...zonasAdicionales,
      { provincia: nuevaZonaProvincia.trim(), municipio: nuevaZonaMunicipio.trim() },
    ]);
    setNuevaZonaProvincia('');
    setNuevaZonaMunicipio('');
  };

  const handleRemoveZona = (idx: number) => {
    setZonasAdicionales(zonasAdicionales.filter((_, i) => i !== idx));
  };

  const volverAlSelector = () => {
    setErrorMsg('');
    setPaso('selector');
  };

  const handleSubmitPropietario = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErrorMsg('');
      const usuario = await enviarRegistroAutonomo(
        {
          tipo: 'propietario',
          valores: {
            nombre,
            apellidos,
            email,
            telefono,
            nifCif,
            direccion,
            ciudad,
            codigoPostal,
            provincia: provinciaProp,
            tipoPropietario,
            password,
            confirmPassword,
          },
        },
        { registerAutonomo }
      );
      // Alta completa: entrar directamente en el portal (sin segundo login).
      await onComplete(usuario);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo completar el registro.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitProfesional = async (e: React.FormEvent) => {
    e.preventDefault();
    if (catalogoNombres.length === 0) {
      setErrorMsg(
        'No se pudo cargar el catálogo de especialidades. Revisa tu conexión e inténtalo de nuevo.'
      );
      return;
    }
    try {
      setLoading(true);
      setErrorMsg('');
      const usuario = await enviarRegistroAutonomo(
        {
          tipo: 'profesional',
          valores: {
            nombre,
            apellidos,
            email,
            telefono,
            nombreComercial,
            cifNif: cifNifProf,
            tipo: tipoProf,
            especialidades: especialidadesSel,
            provincia,
            municipio,
            zonasAdicionales,
            password,
            confirmPassword,
          },
          catalogoEspecialidades: catalogoNombres,
        },
        { registerAutonomo }
      );
      await onComplete(usuario);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo completar el registro.');
    } finally {
      setLoading(false);
    }
  };

  const banner = (titulo: string, descripcion: string) => (
    <div className="p-8 bg-slate-900 text-white space-y-3">
      <div className="flex items-center space-x-2 text-xs font-mono uppercase tracking-widest text-slate-400">
        <span>RentSelect</span>
        <span>·</span>
        <span>Registro autónomo</span>
      </div>
      <h1 className="text-2xl font-black tracking-tight">{titulo}</h1>
      <p className="text-xs text-slate-300 leading-relaxed">{descripcion}</p>
    </div>
  );

  const errorBox = errorMsg ? (
    <div
      data-testid="error-registro"
      className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-start gap-2"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{errorMsg}</span>
    </div>
  ) : null;

  // -------------------------------------------------------------------------
  // Paso 1: selector de perfil (propietario / profesional, sin inquilino).
  // -------------------------------------------------------------------------
  if (paso === 'selector') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
          {banner(
            'Crear cuenta',
            'Elige tu perfil para darte de alta. Sin invitaciones ni esperas: accederás directamente a tu portal.'
          )}
          <div className="p-8 space-y-3">
            <button
              type="button"
              data-testid="opcion-propietario"
              onClick={() => setPaso('propietario')}
              className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 text-left flex items-center gap-4 transition-all cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Home className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Soy Propietario</div>
                <div className="text-xs text-slate-500">
                  Gestiona tus inmuebles, contratos y profesionales asignados.
                </div>
              </div>
            </button>

            <button
              type="button"
              data-testid="opcion-profesional"
              onClick={() => setPaso('profesional')}
              className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 text-left flex items-center gap-4 transition-all cursor-pointer"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Soy Profesional</div>
                <div className="text-xs text-slate-500">
                  Ofrece tus servicios técnicos y recibe asignaciones de trabajo.
                </div>
              </div>
            </button>

            <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
              ¿Eres inquilino? El acceso al portal es mediante la invitación vinculada a tu
              contrato de alquiler.
            </p>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                data-testid="volver-login"
                onClick={onCancel}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a Iniciar sesión</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Paso 2a: formulario autónomo de propietario.
  // -------------------------------------------------------------------------
  if (paso === 'propietario') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
          {banner(
            '🏠 Registro de Propietario',
            'Crea tu cuenta y entra directamente en tu Portal de Propietario.'
          )}
          <form
            data-testid="form-propietario"
            onSubmit={handleSubmitPropietario}
            className="p-8 space-y-5"
          >
            {errorBox}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nombre *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Tu nombre"
                    className={inputIconCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Apellidos *</label>
                <input
                  type="text"
                  required
                  value={apellidos}
                  onChange={(e) => setApellidos(e.target.value)}
                  placeholder="Tus apellidos"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Email de Acceso *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tuemail@ejemplo.com"
                    className={inputIconCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Teléfono *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="tel"
                    required
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="+34 600 000 000"
                    className={inputIconCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>NIF / CIF *</label>
                <input
                  type="text"
                  required
                  value={nifCif}
                  onChange={(e) => setNifCif(e.target.value)}
                  placeholder="Ej. 12345678Z"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Dirección Fiscal *</label>
                <input
                  type="text"
                  required
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Calle, número, piso"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Ciudad *</label>
                <input
                  type="text"
                  required
                  value={ciudad}
                  onChange={(e) => setCiudad(e.target.value)}
                  placeholder="Ej. Almería"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Código Postal *</label>
                <input
                  type="text"
                  required
                  value={codigoPostal}
                  onChange={(e) => setCodigoPostal(e.target.value)}
                  placeholder="Ej. 04001"
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Provincia</label>
                <input
                  type="text"
                  value={provinciaProp}
                  onChange={(e) => setProvinciaProp(e.target.value)}
                  placeholder="Ej. Almería"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Tipo de Propietario *</label>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS_PROPIETARIO.map((t) => {
                  const Icon = t.Icon;
                  const selected = tipoPropietario === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTipoPropietario(t.id)}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all text-xs font-bold cursor-pointer ${
                        selected
                          ? 'bg-blue-50/80 border-blue-500 text-blue-900 ring-2 ring-blue-500/20'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${selected ? 'text-blue-600' : 'text-slate-400'}`} />
                      <span className="text-center">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Contraseña *</label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className={inputIconCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Confirmar Contraseña *</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  data-testid="cambiar-perfil"
                  onClick={volverAlSelector}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer text-left"
                >
                  ← Elegir otro perfil
                </button>
                <button
                  type="button"
                  data-testid="volver-login"
                  onClick={onCancel}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer text-left"
                >
                  ← Volver a Iniciar sesión
                </button>
              </div>
              <button
                type="submit"
                data-testid="submit-registro"
                disabled={loading}
                className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center space-x-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creando tu cuenta...</span>
                  </>
                ) : (
                  <span>Crear mi cuenta</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Paso 2b: formulario autónomo de profesional (catálogo de especialidades).
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 py-12">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-xl w-full overflow-hidden">
        {banner(
          '🔧 Registro de Profesional',
          'Crea tu cuenta y entra directamente en tu Portal Profesional.'
        )}
        <form
          data-testid="form-profesional"
          onSubmit={handleSubmitProfesional}
          className="p-8 space-y-5"
        >
          {errorBox}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nombre *</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre"
                  className={inputIconCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Apellidos</label>
              <input
                type="text"
                value={apellidos}
                onChange={(e) => setApellidos(e.target.value)}
                placeholder="Tus apellidos"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Email de Acceso *</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tuemail@ejemplo.com"
                  className={inputIconCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+34 600 000 000"
                  className={inputIconCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Nombre Comercial / Marca *</label>
              <div className="relative">
                <Wrench className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={nombreComercial}
                  onChange={(e) => setNombreComercial(e.target.value)}
                  placeholder="Ej. Fontanería Vera S.L."
                  className={inputIconCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>NIF / CIF</label>
              <input
                type="text"
                value={cifNifProf}
                onChange={(e) => setCifNifProf(e.target.value)}
                placeholder="Ej. B04123456"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Tipo de Entidad *</label>
            <div className="grid grid-cols-3 gap-3">
              {(['AUTONOMO', 'EMPRESA', 'PARTICULAR'] as TipoProfesional[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTipoProf(t)}
                  className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                    tipoProf === t
                      ? 'bg-amber-50 border-amber-400 text-amber-900 ring-1 ring-amber-400'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t === 'AUTONOMO' && '👤 Autónomo / Profesional'}
                  {t === 'EMPRESA' && '🏢 Empresa / Sociedad'}
                  {t === 'PARTICULAR' && '🛠️ Manitas Particular'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100">
            <label className={labelCls}>Especialidades que atiendes *</label>
            {catalogoNombres.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  No se pudo cargar el catálogo de especialidades. Revisa tu conexión e
                  inténtalo de nuevo.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
                {especialidades.map((esp) => {
                  const isChecked = especialidadesSel.includes(esp.nombre);
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
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className={labelCls}>Provincia Principal *</label>
                <input
                  type="text"
                  required
                  value={provincia}
                  onChange={(e) => setProvincia(e.target.value)}
                  placeholder="Ej. Almería"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className={labelCls}>Municipio Principal</label>
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

          <div className="space-y-2 pt-3 border-t border-slate-100">
            <label className={labelCls}>
              Zonas Adicionales de Cobertura ({zonasAdicionales.length})
            </label>
            {zonasAdicionales.map((z, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              >
                <div className="flex items-center space-x-2">
                  <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="font-semibold text-slate-800">{z.provincia}</span>
                  {z.municipio && <span className="text-slate-600">· {z.municipio}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveZona(idx)}
                  className="p-1 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              <input
                type="text"
                value={nuevaZonaProvincia}
                onChange={(e) => setNuevaZonaProvincia(e.target.value)}
                placeholder="Provincia (ej. Granada)"
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="text"
                value={nuevaZonaMunicipio}
                onChange={(e) => setNuevaZonaMunicipio(e.target.value)}
                placeholder="Municipio (opcional)"
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={handleAddZona}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center justify-center space-x-1 cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir Zona</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Contraseña *</label>
              <div className="relative">
                <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={inputIconCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Confirmar Contraseña *</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la contraseña"
                className={inputCls}
              />
            </div>
          </div>

          <div className="pt-4 flex items-center justify-between border-t border-slate-100">
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                data-testid="cambiar-perfil"
                onClick={volverAlSelector}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer text-left"
              >
                ← Elegir otro perfil
              </button>
              <button
                type="button"
                data-testid="volver-login"
                onClick={onCancel}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer text-left"
              >
                ← Volver a Iniciar sesión
              </button>
            </div>
            <button
              type="submit"
              data-testid="submit-registro"
              disabled={loading || catalogoNombres.length === 0}
              className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-50 flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creando tu cuenta...</span>
                </>
              ) : (
                <span>Crear mi cuenta</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
