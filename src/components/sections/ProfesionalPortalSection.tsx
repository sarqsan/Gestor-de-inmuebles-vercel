import React, { useState } from 'react';
import {
  Wrench,
  Building,
  MapPin,
  Home,
  Tag,
  AlertTriangle,
  Mail,
  Phone,
  Globe,
  Check,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  UsuarioApp,
  Profesional,
  Inmueble,
  Especialidad,
  ZonaServicio,
} from '../../types';

interface ProfesionalPortalSectionProps {
  currentUser: UsuarioApp;
  profesional?: Profesional | null;
  inmuebles: Inmueble[];
  especialidades: Especialidad[];
  onSaveProfesional: (profesional: Profesional) => Promise<void>;
}

export const ProfesionalPortalSection: React.FC<ProfesionalPortalSectionProps> = ({
  currentUser,
  profesional,
  inmuebles,
  especialidades,
  onSaveProfesional,
}) => {
  const [activeTab, setActiveTab] = useState<
    'ficha' | 'especialidades' | 'zonas' | 'asignaciones' | 'incidencias'
  >('ficha');

  // Local state for editing profile
  const [nombreComercial, setNombreComercial] = useState(
    profesional?.nombreComercial || currentUser.nombre || ''
  );
  const [razonSocial, setRazonSocial] = useState(profesional?.razonSocial || '');
  const [cifNif, setCifNif] = useState(profesional?.cifNif || '');
  const [contactoNombre, setContactoNombre] = useState(profesional?.contactoNombre || '');
  const [email, setEmail] = useState(profesional?.email || currentUser.email || '');
  const [telefono, setTelefono] = useState(profesional?.telefono || currentUser.telefono || '');
  const [web, setWeb] = useState(profesional?.web || '');

  // Specialty selection
  const [selectedEspecialidades, setSelectedEspecialidades] = useState<string[]>(
    profesional?.especialidades || ['Fontanería', 'Electricidad']
  );

  // Zones
  const [zonas, setZonas] = useState<ZonaServicio[]>(
    profesional?.zonasServicio || [
      { id: 'z1', provincia: 'Almería', municipio: 'Vera', codigosPostales: ['04620'] },
    ]
  );
  const [nuevaProvincia, setNuevaProvincia] = useState('');
  const [nuevoMunicipio, setNuevoMunicipio] = useState('');

  const [guardadoExito, setGuardadoExito] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Properties assigned to this professional
  const viviendasAsignadas = inmuebles.filter((i) =>
    profesional?.inmuebleIdsAsignados?.includes(i.id)
  );

  const handleToggleEspecialidad = (nombre: string) => {
    if (selectedEspecialidades.includes(nombre)) {
      setSelectedEspecialidades(selectedEspecialidades.filter((e) => e !== nombre));
    } else {
      setSelectedEspecialidades([...selectedEspecialidades, nombre]);
    }
  };

  const handleAddZona = () => {
    if (!nuevaProvincia.trim()) return;
    const nueva: ZonaServicio = {
      id: `zona_${Date.now()}`,
      provincia: nuevaProvincia.trim(),
      municipio: nuevoMunicipio.trim() || undefined,
    };
    setZonas([...zonas, nueva]);
    setNuevaProvincia('');
    setNuevoMunicipio('');
  };

  const handleRemoveZona = (id: string) => {
    setZonas(zonas.filter((z) => z.id !== id));
  };

  const handleGuardarPerfil = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardando(true);
      const baseProf: Profesional = profesional || {
        id: currentUser.profesionalId || `prof_${Date.now()}`,
        usuarioId: currentUser.id,
        tipo: 'AUTONOMO',
        nombreComercial: nombreComercial.trim(),
        especialidades: selectedEspecialidades,
        zonasServicio: zonas,
        activo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const actualizado: Profesional = {
        ...baseProf,
        nombreComercial: nombreComercial.trim(),
        razonSocial: razonSocial.trim() || undefined,
        cifNif: cifNif.trim() || undefined,
        contactoNombre: contactoNombre.trim() || undefined,
        email: email.trim().toLowerCase() || undefined,
        telefono: telefono.trim() || undefined,
        web: web.trim() || undefined,
        especialidades: selectedEspecialidades,
        zonasServicio: zonas,
        updatedAt: new Date().toISOString(),
      };

      await onSaveProfesional(actualizado);
      setGuardadoExito(true);
      setTimeout(() => setGuardadoExito(false), 3000);
    } catch (err) {
      console.error('Error saving professional profile:', err);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div id="profesional-portal-section" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-slate-900">
                Portal de Servicios y Mantenimiento
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-md">
                PROFESIONAL TÉCNICO
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {profesional?.nombreComercial || currentUser.nombre} · Gestiona tus especialidades técnicas, zonas de cobertura y viviendas asignadas.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-500">Viviendas Asignadas</div>
            <div className="text-lg font-bold text-slate-900">{viviendasAsignadas.length}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="flex overflow-x-auto border-b border-slate-200 scrollbar-none px-4">
          {[
            { id: 'ficha', label: 'Mi Ficha y Datos', icon: Building },
            {
              id: 'especialidades',
              label: 'Mis Especialidades',
              icon: Tag,
              count: selectedEspecialidades.length,
            },
            { id: 'zonas', label: 'Mis Zonas de Cobertura', icon: MapPin, count: zonas.length },
            {
              id: 'asignaciones',
              label: 'Viviendas Asignadas',
              icon: Home,
              count: viviendasAsignadas.length,
            },
            { id: 'incidencias', label: 'Incidencias', icon: AlertTriangle, badge: 'Próximamente' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-3.5 px-4 text-xs font-bold border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  isActive
                    ? 'border-amber-600 text-amber-700 bg-amber-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.badge && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-sm font-semibold bg-amber-100 text-amber-800">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {guardadoExito && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Cambios guardados con éxito en la plataforma.</span>
            </div>
          )}

          {/* TAB 1: FICHA Y DATOS */}
          {activeTab === 'ficha' && (
            <form onSubmit={handleGuardarPerfil} className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Datos Comerciales y de Facturación
                </h3>
                <p className="text-xs text-slate-500">
                  Esta información será visible para los propietarios al asignarte trabajos.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Nombre Comercial *
                  </label>
                  <input
                    type="text"
                    required
                    value={nombreComercial}
                    onChange={(e) => setNombreComercial(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Razón Social
                  </label>
                  <input
                    type="text"
                    value={razonSocial}
                    onChange={(e) => setRazonSocial(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    CIF / NIF
                  </label>
                  <input
                    type="text"
                    value={cifNif}
                    onChange={(e) => setCifNif(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
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
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Email de Contacto
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Sitio Web
                </label>
                <input
                  type="text"
                  value={web}
                  onChange={(e) => setWeb(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  {guardando ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: ESPECIALIDADES */}
          {activeTab === 'especialidades' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Especialidades Técnicas que Ofreces ({selectedEspecialidades.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Marca los oficios y servicios en los que estás capacitado para atender reparaciones.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                {especialidades.map((esp) => {
                  const isChecked = selectedEspecialidades.includes(esp.nombre);
                  return (
                    <button
                      key={esp.id}
                      type="button"
                      onClick={() => handleToggleEspecialidad(esp.nombre)}
                      className={`p-2.5 rounded-lg border text-xs font-semibold text-left transition-all cursor-pointer flex items-center justify-between ${
                        isChecked
                          ? 'bg-amber-100 border-amber-400 text-amber-950'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">{esp.nombre}</span>
                      {isChecked && <Check className="w-3.5 h-3.5 text-amber-700 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleGuardarPerfil}
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Actualizar Especialidades
              </button>
            </div>
          )}

          {/* TAB 3: ZONAS */}
          {activeTab === 'zonas' && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Zonas Geográficas de Desplazamiento ({zonas.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Provincias y municipios donde prestas servicio de mantenimiento.
                </p>
              </div>

              <div className="space-y-2">
                {zonas.map((z) => (
                  <div
                    key={z.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-bold text-slate-900">{z.provincia}</span>
                      {z.municipio && <span className="text-slate-600">· {z.municipio}</span>}
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

              {/* Add Zone */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={nuevaProvincia}
                  onChange={(e) => setNuevaProvincia(e.target.value)}
                  placeholder="Provincia (ej. Almería)"
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  value={nuevoMunicipio}
                  onChange={(e) => setNuevoMunicipio(e.target.value)}
                  placeholder="Municipio (ej. Garrucha)"
                  className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl"
                />
                <button
                  type="button"
                  onClick={handleAddZona}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleGuardarPerfil}
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Guardar Zonas
              </button>
            </div>
          )}

          {/* TAB 4: VIVIENDAS ASIGNADAS */}
          {activeTab === 'asignaciones' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Viviendas Donde Estás Autorizado ({viviendasAsignadas.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Propiedades en las que los propietarios te han designado como técnico de referencia para atender averías y revisiones.
                </p>
              </div>

              {viviendasAsignadas.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-1">
                  <Home className="w-8 h-8 text-slate-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-700">No hay viviendas asignadas todavía</div>
                  <p className="text-xs text-slate-500">
                    Los propietarios te asignarán a sus inmuebles cuando requieran tus servicios de mantenimiento.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {viviendasAsignadas.map((inm) => (
                    <div
                      key={inm.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 shadow-xs"
                    >
                      <div className="font-bold text-sm text-slate-900">
                        {inm.alias || inm.direccion}
                      </div>
                      <div className="text-xs text-slate-500">
                        📍 {inm.direccion}, {inm.ciudad}
                      </div>
                      <div className="text-xs text-slate-600 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span>Tipo: {inm.tipoInmueble}</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-md">
                          Autorizado
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: INCIDENCIAS (PRÓXIMAMENTE) */}
          {activeTab === 'incidencias' && (
            <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-3 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Partes de Trabajo e Incidencias (Próximamente)</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                En la siguiente fase podrás recibir avisos directos de averías con fotos tomadas por los inquilinos, presupuestar reparaciones y emitir partes de finalización de obra con un clic.
              </p>
              <div className="inline-block px-3 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold">
                Fase 2 de Desarrollo
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
