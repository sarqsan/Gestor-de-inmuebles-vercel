import React, { useState } from 'react';
import { ConfiguracionAseguradora, TipoDocumento } from '../types';
import { X, Plus, Trash2, Check, ShieldCheck, Info, Save, Settings2, Sliders, Mail, Sparkles, Star } from 'lucide-react';
import { getTipoDocumentoLabel } from '../utils/formatters';
import { INITIAL_ASEGURADORAS } from '../data/mockData';

interface ConfiguracionAseguradorasModalProps {
  aseguradoras: ConfiguracionAseguradora[];
  onClose: () => void;
  onSaveAseguradora: (aseguradora: ConfiguracionAseguradora) => void;
  onSaveAllAseguradoras?: (aseguradoras: ConfiguracionAseguradora[]) => void;
  onDeleteAseguradora: (aseguradoraId: string) => void;
  onSaveGmailConfig?: (config: any) => void;
  gmailConfig?: any;
}

export const ConfiguracionAseguradorasModal: React.FC<ConfiguracionAseguradorasModalProps> = ({
  aseguradoras,
  onClose,
  onSaveAseguradora,
  onDeleteAseguradora,
}) => {
  const initialSelected =
    aseguradoras.find((a) => a.id === 'seag') || aseguradoras[0] || INITIAL_ASEGURADORAS[0];

  const [selectedId, setSelectedId] = useState<string>(initialSelected?.id || 'seag');
  const [editingAseg, setEditingAseg] = useState<ConfiguracionAseguradora>(
    initialSelected || {
      id: 'seag',
      nombre: 'SEAG (Sociedad Española de Alquiler Garantizado)',
      nombreComercial: 'SEAG Garantía Total Alquiler',
      emailTramitacion: 'estudios@seag.es',
      activa: true,
      ratioEsfuerzoMaximo: 45,
      antiguedadMinimaMeses: 3,
      documentosRequeridos: ['dni_nie', 'nomina', 'vida_laboral'],
      tasaPrimaAnualPorcentaje: 4.5,
      mesesCoberturaImpago: 12,
      tiempoMedioRespuestaHoras: 2,
      coberturasSugeridas: {
        mesesImpago: 12,
        defensaJuridicaEuros: 3000,
        actosVandalicosEuros: 3000,
      },
      instruccionesEnvio:
        'Sociedad Española de Alquiler Garantizado (SEAG). Garantía de cobro puntual el día 1 de cada mes y protección jurídica integral. Adjuntar DNI/NIE en vigor y 2 últimas nóminas.',
      formatoAsuntoEmail:
        '[REF-IMPAGO] Solicitud Estudio SEAG - Inmueble {inmueble} - Inquilino {candidato}',
    }
  );
  const [isSavedBanner, setIsSavedBanner] = useState(false);

  const handleSelectAseg = (aseg: ConfiguracionAseguradora) => {
    setSelectedId(aseg.id);
    setEditingAseg({ ...aseg });
    setIsSavedBanner(false);
  };

  const handleLoadPreset = (preset: ConfiguracionAseguradora) => {
    // Check if preset already exists in list
    const existing = aseguradoras.find((a) => a.id === preset.id);
    if (existing) {
      setSelectedId(existing.id);
      setEditingAseg({ ...existing });
    } else {
      setSelectedId(preset.id);
      setEditingAseg({ ...preset });
    }
    setIsSavedBanner(false);
  };

  const handleCreateNew = () => {
    const newId = `aseguradora_${Date.now().toString().slice(-4)}`;
    const newAseg: ConfiguracionAseguradora = {
      id: newId,
      nombre: 'Nueva Entidad Aseguradora',
      nombreComercial: 'Seguro Impago Personalizado',
      emailTramitacion: 'estudios@aseguradora.es',
      activa: true,
      ratioEsfuerzoMaximo: 40,
      antiguedadMinimaMeses: 6,
      documentosRequeridos: ['dni_nie', 'nomina', 'contrato'],
      tasaPrimaAnualPorcentaje: 4.5,
      mesesCoberturaImpago: 12,
      tiempoMedioRespuestaHoras: 24,
      coberturasSugeridas: {
        mesesImpago: 12,
        defensaJuridicaEuros: 3000,
        actosVandalicosEuros: 3000,
      },
      instruccionesEnvio: '',
      formatoAsuntoEmail: '[REF-IMPAGO] Solicitud Seguro - {inmueble} - {candidato}',
    };
    setSelectedId(newId);
    setEditingAseg(newAseg);
    setIsSavedBanner(false);
  };

  const handleToggleDoc = (tipo: TipoDocumento) => {
    const current = editingAseg.documentosRequeridos || [];
    const exists = current.includes(tipo);
    const updated = exists ? current.filter((d) => d !== tipo) : [...current, tipo];
    setEditingAseg({ ...editingAseg, documentosRequeridos: updated });
  };

  const handleSave = () => {
    onSaveAseguradora(editingAseg);
    setIsSavedBanner(true);
    setTimeout(() => setIsSavedBanner(false), 3000);
  };

  const availableDocs: TipoDocumento[] = [
    'dni_nie',
    'nomina',
    'contrato',
    'vida_laboral',
    'renta',
    'justificante_bancario',
    'otros_ingresos',
    'avalista',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">Configuración de Aseguradoras de Impago</h3>
              <p className="text-xs text-slate-500">
                Ajusta parámetros de admisión, ratios de solvencia, primas y correos de tramitación
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 md:grid-cols-3 flex-1 overflow-hidden">
          {/* Left Column: Aseguradoras List */}
          <div className="border-r border-slate-100 bg-slate-50/50 p-4 space-y-2 overflow-y-auto max-h-[40vh] md:max-h-[70vh]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Entidades disponibles</span>
              <button
                onClick={handleCreateNew}
                className="px-2 py-1 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Nueva
              </button>
            </div>

            {aseguradoras.map((aseg) => {
              const isSeag = aseg.id === 'seag' || aseg.nombre.toLowerCase().includes('seag');
              return (
                <button
                  key={aseg.id}
                  onClick={() => handleSelectAseg(aseg)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-start justify-between ${
                    selectedId === aseg.id
                      ? 'bg-blue-50/90 border-blue-400 shadow-2xs'
                      : isSeag
                      ? 'bg-amber-50/40 border-amber-200/80 hover:border-amber-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="w-full">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-bold text-xs text-slate-900 truncate">{aseg.nombre}</span>
                        {aseg.activa && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Activa"></span>
                        )}
                      </div>
                      {isSeag && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[9px] font-black shrink-0">
                          ACTUAL
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{aseg.nombreComercial}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-600 font-semibold flex-wrap">
                      <span>Máx {aseg.ratioEsfuerzoMaximo}% esfuerzo</span>
                      <span>• Prima {aseg.tasaPrimaAnualPorcentaje}%</span>
                      {isSeag && <span className="text-amber-800 font-bold">• Cobro día 1</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Column: Edit Form */}
          <div className="md:col-span-2 p-4 sm:p-6 overflow-y-auto space-y-5">
            {/* Quick preset selector banner */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-slate-700">Cargar plantilla predefinida:</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {INITIAL_ASEGURADORAS.map((preset) => {
                  const isCurrent = editingAseg.id === preset.id;
                  const isSeag = preset.id === 'seag';
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleLoadPreset(preset)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 ${
                        isCurrent
                          ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                          : isSeag
                          ? 'bg-amber-100/80 text-amber-900 border-amber-300 hover:bg-amber-200/80'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {isSeag && <Star className="w-3 h-3 fill-amber-500 text-amber-600" />}
                      {preset.id === 'seag' ? 'SEAG' : preset.id === 'arag' ? 'ARAG' : preset.id === 'caser' ? 'Caser' : preset.id === 'mutua_propietarios' ? 'Mutua' : 'DAS'}
                    </button>
                  );
                })}
              </div>
            </div>

            {isSavedBanner && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2 animate-in fade-in duration-150">
                <Check className="w-4 h-4 text-emerald-600" />
                Configuración de aseguradora guardada con éxito en Firestore.
              </div>
            )}

            {(editingAseg.id === 'seag' || editingAseg.nombre.toLowerCase().includes('seag')) && (
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <span className="font-extrabold block text-amber-950">Garantía de Cobro Indefinido SEAG</span>
                  SEAG garantiza el cobro de la renta el día 1 de cada mes sin límite de meses hasta desahucio. Tiempo de estudio estándar: menos de 2 horas. Ratio de esfuerzo admisible hasta el 45%.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nombre de la Entidad:</label>
                <input
                  type="text"
                  value={editingAseg.nombre}
                  onChange={(e) => setEditingAseg({ ...editingAseg, nombre: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ej: ARAG Seguros"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nombre Comercial del Producto:</label>
                <input
                  type="text"
                  value={editingAseg.nombreComercial}
                  onChange={(e) => setEditingAseg({ ...editingAseg, nombreComercial: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ej: ARAG Alquiler Protección"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  Email de Tramitación y Envío de Expedientes:
                </label>
                <input
                  type="email"
                  value={editingAseg.emailTramitacion}
                  onChange={(e) => setEditingAseg({ ...editingAseg, emailTramitacion: e.target.value })}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="estudios.alquiler@aseguradora.es"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Ratio de Esfuerzo Máximo (%):
                </label>
                <input
                  type="number"
                  min="20"
                  max="60"
                  value={editingAseg.ratioEsfuerzoMaximo}
                  onChange={(e) => setEditingAseg({ ...editingAseg, ratioEsfuerzoMaximo: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-[10px] text-slate-400">Normalmente 35% a 40% de los ingresos netos.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Antigüedad Laboral Mínima (meses):
                </label>
                <input
                  type="number"
                  min="0"
                  max="36"
                  value={editingAseg.antiguedadMinimaMeses}
                  onChange={(e) => setEditingAseg({ ...editingAseg, antiguedadMinimaMeses: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-[10px] text-slate-400">Superación de periodo de prueba o meses de contrato.</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tasa de Prima Anual Estimada (%):
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="10"
                  value={editingAseg.tasaPrimaAnualPorcentaje}
                  onChange={(e) => setEditingAseg({ ...editingAseg, tasaPrimaAnualPorcentaje: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <span className="text-[10px] text-slate-400">Ej: 4.25% sobre la renta anual (renta × 12 × 4.25%).</span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Meses de Cobertura de Impago:
                </label>
                <select
                  value={editingAseg.mesesCoberturaImpago}
                  onChange={(e) => setEditingAseg({ ...editingAseg, mesesCoberturaImpago: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value={6}>6 Meses</option>
                  <option value={12}>12 Meses (Estándar)</option>
                  <option value={18}>18 Meses</option>
                  <option value={24}>24 Meses</option>
                </select>
              </div>
            </div>

            {/* Documentos Requeridos */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-2">
                Documentación Exigida para el Estudio de Solvencia:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {availableDocs.map((tipo) => {
                  const isChecked = (editingAseg.documentosRequeridos || []).includes(tipo);
                  return (
                    <button
                      type="button"
                      key={tipo}
                      onClick={() => handleToggleDoc(tipo)}
                      className={`p-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-between text-left ${
                        isChecked
                          ? 'bg-blue-50 text-blue-900 border-blue-300'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{getTipoDocumentoLabel(tipo)}</span>
                      {isChecked && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instrucciones de Envío */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Instrucciones Específicas de Tramitación / Observaciones:
              </label>
              <textarea
                value={editingAseg.instruccionesEnvio || ''}
                onChange={(e) => setEditingAseg({ ...editingAseg, instruccionesEnvio: e.target.value })}
                rows={2}
                placeholder="Ej: Para autónomos se requiere modelo 130 y última declaración de IRPF..."
                className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={() => {
              if (confirm(`¿Eliminar la aseguradora "${editingAseg.nombre}"?`)) {
                onDeleteAseguradora(editingAseg.id);
                onClose();
              }
            }}
            className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Eliminar Aseguradora
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl transition-colors shadow-md shadow-blue-600/20 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              Guardar Configuración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
