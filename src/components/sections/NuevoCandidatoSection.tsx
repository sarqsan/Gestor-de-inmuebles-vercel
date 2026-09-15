import React, { useState } from 'react';
import { Candidato, Inmueble, EmploymentType, ContractType, SectionType } from '../../types';
import {
  openCandidatoQuestionnairePDF,
  parseCompletedQuestionnaireFile,
} from '../../utils/candidatoQuestionnaire';
import {
  User,
  Phone,
  Mail,
  Building2,
  Users,
  DollarSign,
  Briefcase,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Plus,
  ArrowRight,
  Printer,
  Upload,
  Zap,
  Sparkles,
  FileCheck,
} from 'lucide-react';

interface NuevoCandidatoSectionProps {
  inmuebles: Inmueble[];
  onAddCandidato: (candidato: Candidato) => void;
  onSelectSection: (section: SectionType) => void;
}

export const NuevoCandidatoSection: React.FC<NuevoCandidatoSectionProps> = ({
  inmuebles,
  onAddCandidato,
  onSelectSection,
}) => {
  const [creationMode, setCreationMode] = useState<'expres' | 'completo'>('expres');

  const [formData, setFormData] = useState({
    nombre: '',
    telefono: '',
    email: '',
    inmuebleId: inmuebles[0]?.id || '',
    numPersonas: 1,
    ingresosNetos: 2200,
    tipoEmpleo: 'cuenta_ajena' as EmploymentType,
    tipoContrato: 'indefinido' as ContractType,
    antiguedadLaboral: '1 año',
    otrosIngresos: 0,
    descripcionOtrosIngresos: '',
    avalista: false,
    observaciones: '',
  });

  const [submitted, setSubmitted] = useState(false);
  const [createdCandidate, setCreatedCandidate] = useState<Candidato | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nombre.trim()) {
      alert('Por favor, introduce al menos el Nombre y Apellidos completos.');
      return;
    }

    const selectedInmueble = inmuebles.find((i) => i.id === formData.inmuebleId);
    const inmuebleNombre = selectedInmueble ? selectedInmueble.direccion : 'Sin inmueble asignado';

    const newCandidate: Candidato = {
      id: `cand-${Date.now()}`,
      nombre: formData.nombre.trim(),
      telefono: formData.telefono.trim() || 'Pendiente de datos',
      email: formData.email.trim() || 'Pendiente de datos',
      inmuebleId: formData.inmuebleId || '',
      inmuebleNombre: inmuebleNombre,
      numPersonas: Number(formData.numPersonas) || 1,
      ingresosNetos: creationMode === 'expres' ? 0 : Number(formData.ingresosNetos),
      tipoEmpleo: creationMode === 'expres' ? 'cuenta_ajena' : formData.tipoEmpleo,
      tipoContrato: creationMode === 'expres' ? 'indefinido' : formData.tipoContrato,
      antiguedadLaboral: creationMode === 'expres' ? 'Por determinar' : formData.antiguedadLaboral,
      otrosIngresos: Number(formData.otrosIngresos) || 0,
      descripcionOtrosIngresos: formData.descripcionOtrosIngresos,
      avalista: formData.avalista,
      observaciones: creationMode === 'expres' ? 'Creado con Registro Exprés. Cuestionario pendiente.' : formData.observaciones,
      estado: creationMode === 'expres' ? 'nuevo' : 'nuevo',
      fechaCreacion: new Date().toISOString().split('T')[0],
      scoreEstimado: creationMode === 'expres' ? 50 : 75,
      documentos: [
        { id: 'doc-1', nombre: 'DNI / NIE', subido: false },
        { id: 'doc-2', nombre: 'Nómina 1', subido: false },
        { id: 'doc-3', nombre: 'Nómina 2', subido: false },
        { id: 'doc-4', nombre: 'Declaración Renta', subido: false },
        { id: 'doc-5', nombre: 'Vida Laboral', subido: false },
      ],
    };

    onAddCandidato(newCandidate);
    setCreatedCandidate(newCandidate);
    setSubmitted(true);
  };

  const handleUploadQuestionnaireResponse = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !createdCandidate) return;

    setIsUploading(true);
    setUploadSuccessMsg(null);

    try {
      const parsedData = await parseCompletedQuestionnaireFile(file);
      const updatedCand: Candidato = {
        ...createdCandidate,
        ...parsedData,
        nombre: parsedData.nombre || createdCandidate.nombre,
        observaciones: parsedData.observaciones
          ? `${createdCandidate.observaciones}\n[Datos importados de Cuestionario]: ${parsedData.observaciones}`
          : createdCandidate.observaciones,
      };

      onAddCandidato(updatedCand);
      setCreatedCandidate(updatedCand);
      setUploadSuccessMsg('¡Datos cargados y perfil actualizado con éxito!');
    } catch (err) {
      console.error(err);
      alert('Error al leer el archivo. Asegúrate de que sea un archivo .json o .txt válido.');
    } finally {
      setIsUploading(false);
    }
  };

  if (submitted && createdCandidate) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200/90 p-8 shadow-md text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
          <CheckCircle2 className="w-8 h-8" />
        </div>

        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">¡Perfil Creado Correctamente!</h2>
          <p className="text-sm text-slate-600 mt-1">
            Se ha registrado el candidato <strong className="text-blue-700 font-bold">{createdCandidate.nombre}</strong>.
          </p>
        </div>

        {/* Action Box: Download PDF & Upload Completed Questionnaire */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-left space-y-4">
          <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Pasos Siguientes Recomendados</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Download PDF button */}
            <button
              onClick={() => openCandidatoQuestionnairePDF(createdCandidate.nombre, createdCandidate.inmuebleNombre)}
              className="p-4 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all text-left flex flex-col justify-between group shadow-2xs"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-lg group-hover:scale-105 transition-transform">
                  <Printer className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs text-slate-900">1. Descargar Cuestionario PDF</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Imprime o envía este documento al interesado para que responda a todas sus preguntas de solvencia.
              </p>
            </button>

            {/* Upload completed questionnaire */}
            <label className="p-4 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl transition-all cursor-pointer flex flex-col justify-between group shadow-2xs">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg group-hover:scale-105 transition-transform">
                  <Upload className="w-5 h-5" />
                </div>
                <span className="font-bold text-xs text-slate-900">2. Subir Cuestionario Rellenado</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                Sube el archivo cumplimentado devuelto por el interesado para autocompletar su perfil.
              </p>
              <input
                type="file"
                accept=".json,.txt,.doc,.docx,.pdf"
                onChange={handleUploadQuestionnaireResponse}
                className="hidden"
                disabled={isUploading}
              />
            </label>
          </div>

          {uploadSuccessMsg && (
            <div className="p-3 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{uploadSuccessMsg}</span>
            </div>
          )}
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => onSelectSection('candidatos')}
            className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
          >
            <span>Ver Listado de Candidatos</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setSubmitted(false);
              setCreatedCandidate(null);
              setUploadSuccessMsg(null);
              setFormData({
                nombre: '',
                telefono: '',
                email: '',
                inmuebleId: inmuebles[0]?.id || '',
                numPersonas: 1,
                ingresosNetos: 2000,
                tipoEmpleo: 'cuenta_ajena',
                tipoContrato: 'indefinido',
                antiguedadLaboral: '1 año',
                otrosIngresos: 0,
                descripcionOtrosIngresos: '',
                avalista: false,
                observaciones: '',
              });
            }}
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            Añadir Otro Candidato
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Creation Mode Switcher */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200/90 shadow-2xs flex items-center gap-2">
        <button
          type="button"
          onClick={() => setCreationMode('expres')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            creationMode === 'expres'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-300" />
          <span>Registro Exprés (Solo Nombre Completo)</span>
        </button>
        <button
          type="button"
          onClick={() => setCreationMode('completo')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
            creationMode === 'completo'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Formulario Completo Manual</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* Form Header */}
        <div className="p-6 bg-slate-900 text-white border-b border-slate-800">
          <h2 className="text-lg font-bold flex items-center gap-2">
            {creationMode === 'expres' ? (
              <Zap className="w-5 h-5 text-amber-400" />
            ) : (
              <Plus className="w-5 h-5 text-blue-400" />
            )}
            <span>
              {creationMode === 'expres'
                ? 'Alta Rápida de Interesado (Modo Exprés)'
                : 'Formulario Completo de Nuevo Candidato'}
            </span>
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {creationMode === 'expres'
              ? 'Crea la ficha del interesado introduciendo únicamente su nombre completo. A continuación podrás descargar un PDF editable para enviárselo y completar su perfil automáticamente.'
              : 'Introduce todos los detalles económicos y laborales del candidato manualmente.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 text-xs text-slate-700">
          {creationMode === 'expres' ? (
            /* Express Mode: ONLY Full Name required, optional property */
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Método Ágil Recomendado</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Solo necesitas introducir el nombre del interesado. Una vez creado, se generará un cuestionario en PDF listo para enviar por WhatsApp o Email para que el candidato responda por sí mismo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1.5">
                  Nombre y Apellidos del Interesado *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Carlos Mendoza Rivas"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Vivienda de Interés (Opcional)
                </label>
                <select
                  value={formData.inmuebleId}
                  onChange={(e) => setFormData({ ...formData, inmuebleId: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sin inmueble asignado por ahora</option>
                  {inmuebles.map((inm) => (
                    <option key={inm.id} value={inm.id}>
                      {inm.direccion} ({inm.ciudad}) - {inm.precio}€/mes
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            /* Full Manual Mode */
            <>
              {/* Section 1: Contact & Property */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900 text-xs border-b border-slate-100 pb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  1. Datos Personales e Inmueble Optado
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre y Apellidos *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Ana Martínez Gómez"
                      value={formData.nombre}
                      onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Inmueble al que Opta</label>
                    <select
                      value={formData.inmuebleId}
                      onChange={(e) => setFormData({ ...formData, inmuebleId: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                      <option value="">Sin inmueble asignado</option>
                      {inmuebles.map((inm) => (
                        <option key={inm.id} value={inm.id}>
                          {inm.direccion} ({inm.ciudad}) - {inm.precio}€/mes
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono de Contacto</label>
                    <input
                      type="tel"
                      placeholder="Ej. +34 612 345 678"
                      value={formData.telefono}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="Ej. ana.martinez@email.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Employment & Income */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900 text-xs border-b border-slate-100 pb-2 flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  2. Información Económica y Laboral
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ingresos Netos Mensuales (€)</label>
                    <input
                      type="number"
                      min="0"
                      step="50"
                      value={formData.ingresosNetos}
                      onChange={(e) => setFormData({ ...formData, ingresosNetos: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Empleo</label>
                    <select
                      value={formData.tipoEmpleo}
                      onChange={(e) => setFormData({ ...formData, tipoEmpleo: e.target.value as EmploymentType })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="cuenta_ajena">Por cuenta ajena</option>
                      <option value="autonomo">Autónomo</option>
                      <option value="funcionario">Funcionario / Empleo Público</option>
                      <option value="pensionista">Pensionista / Jubilado</option>
                      <option value="estudiante_otro">Estudiante / Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Contrato</label>
                    <select
                      value={formData.tipoContrato}
                      onChange={(e) => setFormData({ ...formData, tipoContrato: e.target.value as ContractType })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="indefinido">Indefinido</option>
                      <option value="temporal">Temporal</option>
                      <option value="practicas">En prácticas</option>
                      <option value="fijo_discontinuo">Fijo discontinuo</option>
                      <option value="no_aplica">No aplica</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Antigüedad Laboral</label>
                    <input
                      type="text"
                      placeholder="Ej. 2 años"
                      value={formData.antiguedadLaboral}
                      onChange={(e) => setFormData({ ...formData, antiguedadLaboral: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Submit button */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onSelectSection('candidatos')}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
            >
              <Zap className="w-4 h-4 text-amber-300" />
              <span>{creationMode === 'expres' ? 'Crear Perfil Rápido' : 'Guardar Candidato Completo'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
