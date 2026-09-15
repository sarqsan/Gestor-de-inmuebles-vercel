import React, { useState, useRef } from 'react';
import { UserProfile, Candidato, Inmueble } from '../../types';
import {
  User,
  Settings,
  Database,
  Bell,
  Sliders,
  CheckCircle2,
  Lock,
  Mail,
  Phone,
  Building,
  Key,
  Flame,
  Download,
  Upload,
  FileJson,
  Layers,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface ConfiguracionSectionProps {
  userProfile: UserProfile;
  candidatos?: Candidato[];
  inmuebles?: Inmueble[];
  onUpdateProfile: (updated: UserProfile) => void;
  onImportData?: (importedData: { candidatos?: Candidato[]; inmuebles?: Inmueble[] }) => void;
  onOpenConfigAseguradoras?: () => void;
}

export const ConfiguracionSection: React.FC<ConfiguracionSectionProps> = ({
  userProfile,
  candidatos = [],
  inmuebles = [],
  onUpdateProfile,
  onImportData,
  onOpenConfigAseguradoras,
}) => {
  const [formData, setFormData] = useState({ ...userProfile });
  const [saved, setSaved] = useState(false);
  const [jsonPaste, setJsonPaste] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleExportJSON = () => {
    const dataToExport = {
      userProfile,
      inmuebles,
      candidatos,
      fechaExportacion: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rentselect_datos_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleProcessImport = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && (parsed.candidatos || parsed.inmuebles)) {
        if (onImportData) {
          onImportData({
            candidatos: parsed.candidatos || [],
            inmuebles: parsed.inmuebles || [],
          });
        }
        setImportStatus(`¡Éxito! Importados ${parsed.inmuebles?.length || 0} inmuebles y ${parsed.candidatos?.length || 0} candidatos.`);
        setJsonPaste('');
      } else {
        setImportStatus('Error: El archivo JSON debe contener un array de "inmuebles" o "candidatos".');
      }
    } catch (err) {
      setImportStatus('Error: Formato JSON no válido.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        handleProcessImport(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Configuración del Sistema</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ajusta los parámetros de tu perfil, tus criterios de preselección e infraestructura.
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
          <Settings className="w-5 h-5" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* User profile card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            Datos de Usuario y Propietario / Gestor
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre Completo</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre de la Empresa o Agencia</label>
              <input
                type="text"
                value={formData.empresa || ''}
                onChange={(e) => setFormData({ ...formData, empresa: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email de Contacto</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono</label>
              <input
                type="tel"
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* General Pre-selection Parameters */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-3 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-600" />
            Criterios Generales de Preselección
          </h3>

          <div className="space-y-4 text-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ratio Máximo de Esfuerzo Recomendado (% sobre ingresos):
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="20"
                  max="50"
                  value={formData.ratioSolvenciaMaximo}
                  onChange={(e) => setFormData({ ...formData, ratioSolvenciaMaximo: Number(e.target.value) || 35 })}
                  className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
                <span className="text-xs text-slate-500">
                  (El estándar recomendado del mercado para alquiler es del 30% al 35%)
                </span>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.notificacionesEmail}
                  onChange={(e) => setFormData({ ...formData, notificacionesEmail: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>Recibir alertas por correo electrónico cuando un candidato envíe documentación completa</span>
              </label>
            </div>
          </div>
        </div>

        {/* Data Sync & App Integration Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <FileJson className="w-5 h-5 text-indigo-600" />
              <h3>Gestión de Datos e Integración con Otras Apps</h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Sincronización Multi-App
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Puedes exportar los datos actuales (inmuebles, candidatos e informes) para llevarlos a tu otra aplicación de AI Studio o importar un JSON de tu otra aplicación para nutrir este panel con tus viviendas e inquilinos existentes.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={handleExportJSON}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Todos los Datos (JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Importar Archivo JSON</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".json"
              className="hidden"
            />
          </div>

          {importStatus && (
            <div className={`p-3 rounded-xl text-xs font-semibold ${importStatus.startsWith('Error') ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {importStatus}
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-xs text-slate-600 mt-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>¿Cómo integrar esta app como pestaña dentro de tu otra app de AI Studio?</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 text-[11px] leading-relaxed">
              <li><strong>Opción A (Importación JSON rápida):</strong> Exporta el archivo JSON desde este botón e impórtalo en tu app principal, o copia la carpeta <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">/src/components</code> directamente.</li>
              <li><strong>Opción B (Integración mediante iframe):</strong> En tu otra app, añade un componente pestaña e inserta un <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">&lt;iframe src="URL_DE_ESTA_APP" /&gt;</code> para cargar este módulo analítico completo.</li>
              <li><strong>Opción C (Base de Datos Compartida Firebase):</strong> Al activar Firebase en ambas apps con el mismo ID de proyecto, ambas leerán y escribirán en directo en las colecciones <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">/inmuebles</code> y <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">/candidatos</code>.</li>
            </ol>
          </div>
        </div>

        {/* Módulo de Aseguradoras de Impago */}
        {onOpenConfigAseguradoras && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">Seguros de Impago y Criterios de Aceptación</h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                ARAG • Caser • Mutua • DAS
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Personaliza las aseguradoras de impago de alquiler disponibles en el sistema: define los ratios de esfuerzo máximos tolerados (ej: 40%), los meses de cobertura (12-18 meses), las tasas de prima anual y las direcciones de correo electrónico para tramitación automatizada con trazabilidad por referencia.
            </p>

            <div className="pt-1">
              <button
                type="button"
                onClick={onOpenConfigAseguradoras}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-500/20 flex items-center gap-2"
              >
                <Sliders className="w-4 h-4" />
                Configurar Entidades Aseguradoras y Ratios
              </button>
            </div>
          </div>
        )}

        {/* Firebase Active Connection Box */}
        <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-base text-white">Base de Datos Firebase Firestore Activa</h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Sincronización en Tiempo Real</span>
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Tu base de datos gratis de Firebase está provista y conectada en tiempo real. Todos los cambios que realices en viviendas, candidatos, evaluaciones e informes se guardan automáticamente en la nube.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
              <span className="text-emerald-400 font-mono font-bold block">/inmuebles</span>
              <span className="text-[11px] text-slate-400">Colección activa con {inmuebles.length} viviendas.</span>
            </div>
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
              <span className="text-emerald-400 font-mono font-bold block">/candidatos</span>
              <span className="text-[11px] text-slate-400">Colección activa con {candidatos.length} candidatos.</span>
            </div>
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
              <span className="text-emerald-400 font-mono font-bold block">startup-sanctuary-sln7n</span>
              <span className="text-[11px] text-slate-400">ID del proyecto Firebase activo.</span>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-between pt-2">
          {saved ? (
            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              <CheckCircle2 className="w-4 h-4" /> Configuración guardada correctamente
            </span>
          ) : (
            <div></div>
          )}

          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-blue-500/20 transition-all"
          >
            Guardar Cambios
          </button>
        </div>
      </form>
    </div>
  );
};
