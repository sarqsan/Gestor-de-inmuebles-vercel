import React, { useState } from 'react';
import {
  X,
  Wrench,
  Building,
  Mail,
  Phone,
  Globe,
  MapPin,
  Home,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';
import {
  Profesional,
  TipoProfesional,
  Especialidad,
  Inmueble,
  ZonaServicio,
  UsuarioApp,
} from '../../types';

interface CrearProfesionalModalProps {
  profesionalParaEditar?: Profesional | null;
  especialidades: Especialidad[];
  inmueblesDisponibles: Inmueble[];
  currentUser: UsuarioApp;
  onSave: (profesional: Profesional) => Promise<void>;
  onClose: () => void;
}

export const CrearProfesionalModal: React.FC<CrearProfesionalModalProps> = ({
  profesionalParaEditar,
  especialidades,
  inmueblesDisponibles,
  currentUser,
  onSave,
  onClose,
}) => {
  const isEditing = !!profesionalParaEditar;

  const [tipo, setTipo] = useState<TipoProfesional>(
    profesionalParaEditar?.tipo || 'AUTONOMO'
  );
  const [nombreComercial, setNombreComercial] = useState(
    profesionalParaEditar?.nombreComercial || ''
  );
  const [razonSocial, setRazonSocial] = useState(
    profesionalParaEditar?.razonSocial || ''
  );
  const [cifNif, setCifNif] = useState(profesionalParaEditar?.cifNif || '');
  const [contactoNombre, setContactoNombre] = useState(
    profesionalParaEditar?.contactoNombre || ''
  );
  const [email, setEmail] = useState(profesionalParaEditar?.email || '');
  const [telefono, setTelefono] = useState(profesionalParaEditar?.telefono || '');
  const [web, setWeb] = useState(profesionalParaEditar?.web || '');
  const [selectedEspecialidades, setSelectedEspecialidades] = useState<string[]>(
    profesionalParaEditar?.especialidades || []
  );
  const [zonas, setZonas] = useState<ZonaServicio[]>(
    profesionalParaEditar?.zonasServicio || [
      { id: 'z1', provincia: 'Almería', municipio: 'Vera', codigosPostales: ['04620'] },
    ]
  );
  const [inmueblesAsignados, setInmueblesAsignados] = useState<string[]>(
    profesionalParaEditar?.inmuebleIdsAsignados || []
  );
  const [activo, setActivo] = useState(
    profesionalParaEditar?.activo !== undefined ? profesionalParaEditar.activo : true
  );

  // New zone temp inputs
  const [nuevaProvincia, setNuevaProvincia] = useState('');
  const [nuevoMunicipio, setNuevoMunicipio] = useState('');
  const [nuevoCP, setNuevoCP] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleEspecialidadToggle = (nombre: string) => {
    if (selectedEspecialidades.includes(nombre)) {
      setSelectedEspecialidades(selectedEspecialidades.filter((e) => e !== nombre));
    } else {
      setSelectedEspecialidades([...selectedEspecialidades, nombre]);
    }
  };

  const handleInmuebleToggle = (id: string) => {
    if (inmueblesAsignados.includes(id)) {
      setInmueblesAsignados(inmueblesAsignados.filter((i) => i !== id));
    } else {
      setInmueblesAsignados([...inmueblesAsignados, id]);
    }
  };

  const handleAddZona = () => {
    if (!nuevaProvincia.trim()) return;
    const nueva: ZonaServicio = {
      id: `zona_${Date.now()}`,
      provincia: nuevaProvincia.trim(),
      municipio: nuevoMunicipio.trim() || undefined,
      codigosPostales: nuevoCP.trim()
        ? nuevoCP.split(',').map((c) => c.trim()).filter(Boolean)
        : undefined,
    };
    setZonas([...zonas, nueva]);
    setNuevaProvincia('');
    setNuevoMunicipio('');
    setNuevoCP('');
  };

  const handleRemoveZona = (id: string) => {
    setZonas(zonas.filter((z) => z.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreComercial.trim()) {
      setErrorMsg('Por favor especifica el nombre comercial del profesional o empresa.');
      return;
    }
    if (selectedEspecialidades.length === 0) {
      setErrorMsg('Por favor selecciona al menos una especialidad técnica.');
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg('');

      const esOwner = currentUser.tipoPerfil === 'PROPIETARIO';
      const profesionalActualizado: Profesional = {
        id: profesionalParaEditar?.id || `prof_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        usuarioId: profesionalParaEditar?.usuarioId,
        creadoPorPropietarioId: profesionalParaEditar?.creadoPorPropietarioId || (esOwner ? currentUser.id : undefined),
        esPrivado: profesionalParaEditar?.esPrivado !== undefined ? profesionalParaEditar.esPrivado : esOwner,
        tipo,
        nombreComercial: nombreComercial.trim(),
        razonSocial: razonSocial.trim() || undefined,
        cifNif: cifNif.trim() || undefined,
        contactoNombre: contactoNombre.trim() || undefined,
        email: email.trim().toLowerCase() || undefined,
        telefono: telefono.trim() || undefined,
        web: web.trim() || undefined,
        especialidades: selectedEspecialidades,
        zonasServicio: zonas,
        inmuebleIdsAsignados: inmueblesAsignados,
        activo,
        tokenInvitacion: profesionalParaEditar?.tokenInvitacion || `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: profesionalParaEditar?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSave(profesionalActualizado);
      onClose();
    } catch (err: any) {
      console.error('Error saving professional:', err);
      setErrorMsg(err?.message || 'Error al guardar el profesional en Firestore.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      id="crear-profesional-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Modificar Ficha Profesional' : 'Alta de Profesional / Empresa de Mantenimiento'}
              </h3>
              <p className="text-xs text-slate-500">
                {currentUser.tipoPerfil === 'PROPIETARIO'
                  ? 'Añade un profesional privado para atender tus viviendas y envíale invitación'
                  : 'Gestión técnica de proveedores de servicios de mantenimiento'}
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

          {/* Tipo de Profesional */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Tipo de Entidad *
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['AUTONOMO', 'EMPRESA', 'PARTICULAR'] as TipoProfesional[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTipo(t)}
                  className={`py-2 px-3 text-xs font-semibold rounded-xl border text-center transition-all cursor-pointer ${
                    tipo === t
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

          {/* Datos Comerciales */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  placeholder="Ej. Fontanería Vera y Reparaciones"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Razón Social / Titular
              </label>
              <div className="relative">
                <Building className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  placeholder="Ej. Juan García Martínez S.L."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
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
                placeholder="Ej. B04123456"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Persona de Contacto
              </label>
              <input
                type="text"
                value={contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
                placeholder="Ej. Juan García"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email de Notificaciones
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="fontanero@ejemplo.com"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Teléfono Directo
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Especialidades Técnicas */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Especialidades y Categorías * ({selectedEspecialidades.length})
              </label>
              <span className="text-xs text-slate-500">Selecciona los servicios que ofrece</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
              {especialidades.map((esp) => {
                const isSelected = selectedEspecialidades.includes(esp.nombre);
                return (
                  <button
                    type="button"
                    key={esp.id}
                    onClick={() => handleEspecialidadToggle(esp.nombre)}
                    className={`flex items-center space-x-2 p-2 rounded-lg border text-xs text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-100 border-amber-400 text-amber-950 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="w-4 h-4 rounded-full flex items-center justify-center border border-current shrink-0">
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                    <span className="truncate">{esp.nombre}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Zonas de Servicio */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">
              Zonas Geográficas de Cobertura ({zonas.length})
            </label>
            <div className="space-y-2">
              {zonas.map((z) => (
                <div
                  key={z.id}
                  className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="font-semibold text-slate-800">{z.provincia}</span>
                    {z.municipio && <span className="text-slate-600">· {z.municipio}</span>}
                    {z.codigosPostales && z.codigosPostales.length > 0 && (
                      <span className="text-slate-400">
                        (CP: {z.codigosPostales.join(', ')})
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveZona(z.id)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Añadir nueva zona */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
              <input
                type="text"
                value={nuevaProvincia}
                onChange={(e) => setNuevaProvincia(e.target.value)}
                placeholder="Provincia (ej. Almería)"
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="text"
                value={nuevoMunicipio}
                onChange={(e) => setNuevoMunicipio(e.target.value)}
                placeholder="Municipio (ej. Vera)"
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="text"
                value={nuevoCP}
                onChange={(e) => setNuevoCP(e.target.value)}
                placeholder="CPs (ej. 04620, 04621)"
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

          {/* Asignación de Viviendas */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Viviendas Asignadas ({inmueblesAsignados.length})
              </label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setInmueblesAsignados(inmueblesDisponibles.map((i) => i.id))}
                  className="text-xs text-amber-700 hover:text-amber-800 font-medium cursor-pointer"
                >
                  Asignar todas
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setInmueblesAsignados([])}
                  className="text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                >
                  Quitar todas
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Viviendas donde este profesional está autorizado para realizar intervenciones técnicas.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-xl bg-slate-50">
              {inmueblesDisponibles.length === 0 ? (
                <div className="text-xs text-slate-400 p-2 italic col-span-2">
                  No hay inmuebles disponibles para asignar.
                </div>
              ) : (
                inmueblesDisponibles.map((inm) => {
                  const isChecked = inmueblesAsignados.includes(inm.id);
                  return (
                    <label
                      key={inm.id}
                      className={`flex items-center space-x-2.5 p-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-amber-50 border-amber-300 text-amber-950 font-medium'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleInmuebleToggle(inm.id)}
                        className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5"
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

          {/* Estado Activo */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-800">Profesional Activo</div>
              <div className="text-[11px] text-slate-500">
                Determina si puede recibir asignaciones y estar visible en el catálogo
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={activo}
                onChange={(e) => setActivo(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
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
            className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm transition-all disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
          >
            {guardando ? (
              <span>Guardando...</span>
            ) : (
              <span>{isEditing ? 'Actualizar Ficha' : 'Guardar Profesional'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
