import React, { useState, useEffect } from 'react';
import {
  Candidato,
  Inmueble,
  RespuestaIncidencia,
  EmploymentType,
  ContractType,
  CotitularData,
} from '../types';
import {
  PREGUNTAS_INCIDENCIAS,
  PREGUNTA_INFORMACION_ADICIONAL,
  INTRO_CUESTIONARIO_TEXT,
} from '../data/cuestionarioPreguntas';
import {
  Home,
  CheckCircle2,
  Send,
  HelpCircle,
  FileText,
  AlertCircle,
  User,
  Phone,
  Mail,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Building,
  Check,
  Users,
  Euro,
  Info,
  Clock,
  Sparkles,
} from 'lucide-react';

interface CuestionarioPublicoViewProps {
  candidato: Candidato;
  inmueble?: Inmueble;
  onSubmit: (
    updatedCandidateData: Partial<Candidato>,
    respuestas: RespuestaIncidencia[],
    informacionAdicional: string
  ) => Promise<void> | void;
}

export const CuestionarioPublicoView: React.FC<CuestionarioPublicoViewProps> = ({
  candidato,
  inmueble,
  onSubmit,
}) => {
  const existing = candidato.cuestionarioIncidencias;
  const isAlreadyCompleted = existing?.completado || false;

  // Wizard Steps:
  // Step 1: Datos Personales y Titulares (1 o 2)
  // Step 2: Información Económica y Laboral
  // Step 3: Cuestionario de Incidencias (12 situaciones)
  // Step 4: Revisión y Envío
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Selector de 1 o 2 titulares
  const [numTitulares, setNumTitulares] = useState<1 | 2>(
    candidato.numTitularesContrato || (candidato.cotitular ? 2 : 1)
  );

  // Datos Candidato 1 (Titular Principal)
  const [nombre, setNombre] = useState(candidato.nombre || '');
  const [telefono, setTelefono] = useState(candidato.telefono || '');
  const [email, setEmail] = useState(candidato.email || '');
  const [numPersonas, setNumPersonas] = useState(candidato.numPersonas || 1);

  const [tipoEmpleo, setTipoEmpleo] = useState<EmploymentType>(candidato.tipoEmpleo || 'cuenta_ajena');
  const [empresa, setEmpresa] = useState<string>(candidato.observaciones || '');
  const [tipoContrato, setTipoContrato] = useState<ContractType>(candidato.tipoContrato || 'indefinido');
  const [antiguedadLaboral, setAntiguedadLaboral] = useState(candidato.antiguedadLaboral || '');
  const [ingresosNetos, setIngresosNetos] = useState<number | ''>(candidato.ingresosNetos || '');
  const [otrosIngresos, setOtrosIngresos] = useState<number | ''>(candidato.otrosIngresos || 0);
  const [descripcionOtrosIngresos, setDescripcionOtrosIngresos] = useState(candidato.descripcionOtrosIngresos || '');
  const [avalista, setAvalista] = useState<boolean>(candidato.avalista || false);

  // Datos Candidato 2 (Cotitular)
  const [cotitularNombre, setCotitularNombre] = useState(candidato.cotitular?.nombre || '');
  const [cotitularTelefono, setCotitularTelefono] = useState(candidato.cotitular?.telefono || '');
  const [cotitularEmail, setCotitularEmail] = useState(candidato.cotitular?.email || '');
  const [cotitularTipoEmpleo, setCotitularTipoEmpleo] = useState<EmploymentType>(
    candidato.cotitular?.tipoEmpleo || 'cuenta_ajena'
  );
  const [cotitularEmpresa, setCotitularEmpresa] = useState<string>(candidato.cotitular?.empresa || '');
  const [cotitularTipoContrato, setCotitularTipoContrato] = useState<ContractType>(
    candidato.cotitular?.tipoContrato || 'indefinido'
  );
  const [cotitularAntiguedad, setCotitularAntiguedad] = useState<string>(
    candidato.cotitular?.antiguedadLaboral || ''
  );
  const [cotitularIngresosNetos, setCotitularIngresosNetos] = useState<number | ''>(
    candidato.cotitular?.ingresosNetos || ''
  );
  const [cotitularOtrosIngresos, setCotitularOtrosIngresos] = useState<number | ''>(
    candidato.cotitular?.otrosIngresos || 0
  );
  const [cotitularDescripcionOtros, setCotitularDescripcionOtros] = useState<string>(
    candidato.cotitular?.descripcionOtrosIngresos || ''
  );

  // Respuestas del Cuestionario de Incidencias (1-11 test)
  const [respuestasOp, setRespuestasOp] = useState<Record<string, 'A' | 'B' | 'C' | 'D'>>(() => {
    const initial: Record<string, 'A' | 'B' | 'C' | 'D'> = {};
    if (existing?.respuestas) {
      existing.respuestas.forEach((r) => {
        if (r.opcionSeleccionadaId) {
          initial[r.preguntaId] = r.opcionSeleccionadaId;
        }
      });
    }
    return initial;
  });

  // Situación 12 (pregunta abierta)
  const [respuestaSit12, setRespuestaSit12] = useState<string>(() => {
    const sit12 = existing?.respuestas?.find((r) => r.preguntaId === 'sit_12');
    return sit12?.respuestaTextoLibre || '';
  });

  const [infoAdicional, setInfoAdicional] = useState<string>(existing?.informacionAdicional || '');

  // Sub-índice de pregunta activa en el paso 3 (0 a 11)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);

  const [submitted, setSubmitted] = useState<boolean>(isAlreadyCompleted);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const tokenKey = candidato.cuestionarioToken || candidato.id;

  // Cargar borrador local si existe
  useEffect(() => {
    if (isAlreadyCompleted) return;
    try {
      const draftRaw = localStorage.getItem(`cuestionario_draft_v2_${tokenKey}`);
      if (draftRaw) {
        const draft = JSON.parse(draftRaw);
        if (draft.numTitulares) setNumTitulares(draft.numTitulares);
        if (draft.nombre) setNombre(draft.nombre);
        if (draft.telefono) setTelefono(draft.telefono);
        if (draft.email) setEmail(draft.email);
        if (draft.numPersonas) setNumPersonas(draft.numPersonas);
        if (draft.tipoEmpleo) setTipoEmpleo(draft.tipoEmpleo);
        if (draft.empresa) setEmpresa(draft.empresa);
        if (draft.tipoContrato) setTipoContrato(draft.tipoContrato);
        if (draft.antiguedadLaboral) setAntiguedadLaboral(draft.antiguedadLaboral);
        if (draft.ingresosNetos) setIngresosNetos(draft.ingresosNetos);
        if (draft.otrosIngresos !== undefined) setOtrosIngresos(draft.otrosIngresos);
        if (draft.descripcionOtrosIngresos) setDescripcionOtrosIngresos(draft.descripcionOtrosIngresos);
        if (draft.avalista !== undefined) setAvalista(draft.avalista);

        if (draft.cotitularNombre) setCotitularNombre(draft.cotitularNombre);
        if (draft.cotitularTelefono) setCotitularTelefono(draft.cotitularTelefono);
        if (draft.cotitularEmail) setCotitularEmail(draft.cotitularEmail);
        if (draft.cotitularTipoEmpleo) setCotitularTipoEmpleo(draft.cotitularTipoEmpleo);
        if (draft.cotitularEmpresa) setCotitularEmpresa(draft.cotitularEmpresa);
        if (draft.cotitularTipoContrato) setCotitularTipoContrato(draft.cotitularTipoContrato);
        if (draft.cotitularAntiguedad) setCotitularAntiguedad(draft.cotitularAntiguedad);
        if (draft.cotitularIngresosNetos) setCotitularIngresosNetos(draft.cotitularIngresosNetos);
        if (draft.cotitularOtrosIngresos !== undefined) setCotitularOtrosIngresos(draft.cotitularOtrosIngresos);
        if (draft.cotitularDescripcionOtros) setCotitularDescripcionOtros(draft.cotitularDescripcionOtros);

        if (draft.respuestasOp) setRespuestasOp(draft.respuestasOp);
        if (draft.respuestaSit12) setRespuestaSit12(draft.respuestaSit12);
        if (draft.infoAdicional) setInfoAdicional(draft.infoAdicional);
      }
    } catch (e) {
      console.error('Error loading questionnaire draft:', e);
    }
  }, [tokenKey, isAlreadyCompleted]);

  // Guardar borrador local
  useEffect(() => {
    if (isAlreadyCompleted || submitted) return;
    try {
      const draft = {
        numTitulares,
        nombre,
        telefono,
        email,
        numPersonas,
        tipoEmpleo,
        empresa,
        tipoContrato,
        antiguedadLaboral,
        ingresosNetos,
        otrosIngresos,
        descripcionOtrosIngresos,
        avalista,
        cotitularNombre,
        cotitularTelefono,
        cotitularEmail,
        cotitularTipoEmpleo,
        cotitularEmpresa,
        cotitularTipoContrato,
        cotitularAntiguedad,
        cotitularIngresosNetos,
        cotitularOtrosIngresos,
        cotitularDescripcionOtros,
        respuestasOp,
        respuestaSit12,
        infoAdicional,
      };
      localStorage.setItem(`cuestionario_draft_v2_${tokenKey}`, JSON.stringify(draft));
    } catch (e) {
      console.error('Error saving questionnaire draft:', e);
    }
  }, [
    tokenKey,
    isAlreadyCompleted,
    submitted,
    numTitulares,
    nombre,
    telefono,
    email,
    numPersonas,
    tipoEmpleo,
    empresa,
    tipoContrato,
    antiguedadLaboral,
    ingresosNetos,
    otrosIngresos,
    descripcionOtrosIngresos,
    avalista,
    cotitularNombre,
    cotitularTelefono,
    cotitularEmail,
    cotitularTipoEmpleo,
    cotitularEmpresa,
    cotitularTipoContrato,
    cotitularAntiguedad,
    cotitularIngresosNetos,
    cotitularOtrosIngresos,
    cotitularDescripcionOtros,
    respuestasOp,
    respuestaSit12,
    infoAdicional,
  ]);

  const nombreInmueble = inmueble?.direccion || candidato.inmuebleNombre || 'Vivienda en Alquiler';

  // Navegación y Validación de pasos
  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!nombre.trim() || !telefono.trim() || !email.trim()) {
      setValidationError('Por favor completa los datos de contacto del Candidato 1 (Nombre, Teléfono y Email).');
      return;
    }
    if (numTitulares === 2) {
      if (!cotitularNombre.trim()) {
        setValidationError('Por favor indica al menos el Nombre y Apellidos del Candidato 2 (Cotitular).');
        return;
      }
    }
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!ingresosNetos || Number(ingresosNetos) <= 0) {
      setValidationError('Por favor introduce los ingresos netos mensuales del Candidato 1.');
      return;
    }
    if (numTitulares === 2) {
      if (!cotitularIngresosNetos || Number(cotitularIngresosNetos) <= 0) {
        setValidationError('Por favor introduce los ingresos netos mensuales del Candidato 2 (Cotitular).');
        return;
      }
    }
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNextStep3 = () => {
    setValidationError(null);

    // Validar las 11 preguntas de opción múltiple
    const faltantes: number[] = [];
    PREGUNTAS_INCIDENCIAS.forEach((p) => {
      if (!p.esAbierta && !respuestasOp[p.id]) {
        faltantes.push(p.numero);
      }
    });

    if (faltantes.length > 0) {
      setValidationError(`Falta responder a la(s) situación(es): ${faltantes.join(', ')}.`);
      const firstMissingNum = faltantes[0];
      setCurrentQuestionIndex(firstMissingNum - 1);
      return;
    }

    if (!respuestaSit12.trim()) {
      setValidationError('Por favor responde a la pregunta abierta (Situación 12).');
      setCurrentQuestionIndex(11);
      return;
    }

    setCurrentStep(4);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Envío Final del Cuestionario
  const handleFinalSubmit = async () => {
    setValidationError(null);
    setIsSubmitting(true);

    const finalRespuestas: RespuestaIncidencia[] = PREGUNTAS_INCIDENCIAS.map((p) => {
      if (p.esAbierta) {
        return {
          preguntaId: p.id,
          preguntaTitulo: p.titulo,
          preguntaTexto: p.pregunta,
          respuestaTextoLibre: respuestaSit12.trim(),
          esAbierta: true,
        };
      } else {
        const opcionId = respuestasOp[p.id];
        const opcionObj = p.opciones?.find((o) => o.id === opcionId);
        return {
          preguntaId: p.id,
          preguntaTitulo: p.titulo,
          preguntaTexto: p.pregunta,
          opcionSeleccionadaId: opcionId,
          opcionSeleccionadaTexto: opcionObj?.texto || '',
          esAbierta: false,
        };
      }
    });

    const cotitularData: CotitularData | undefined =
      numTitulares === 2
        ? {
            nombre: cotitularNombre.trim(),
            telefono: cotitularTelefono.trim() || undefined,
            email: cotitularEmail.trim() || undefined,
            tipoEmpleo: cotitularTipoEmpleo,
            empresa: cotitularEmpresa.trim() || undefined,
            tipoContrato: cotitularTipoContrato,
            antiguedadLaboral: cotitularAntiguedad.trim() || 'No indicada',
            ingresosNetos: Number(cotitularIngresosNetos) || 0,
            otrosIngresos: Number(cotitularOtrosIngresos) || 0,
            descripcionOtrosIngresos: cotitularDescripcionOtros.trim() || undefined,
          }
        : undefined;

    const candidateUpdates: Partial<Candidato> = {
      nombre: nombre.trim(),
      telefono: telefono.trim(),
      email: email.trim(),
      numPersonas: Number(numPersonas) || 1,
      tipoEmpleo,
      tipoContrato,
      antiguedadLaboral: antiguedadLaboral.trim() || 'No especificada',
      ingresosNetos: Number(ingresosNetos) || 0,
      otrosIngresos: Number(otrosIngresos) || 0,
      descripcionOtrosIngresos: descripcionOtrosIngresos.trim(),
      avalista,
      numTitularesContrato: numTitulares,
      cotitular: cotitularData,
      estado: 'analizado',
    };

    try {
      await onSubmit(candidateUpdates, finalRespuestas, infoAdicional.trim());
      localStorage.removeItem(`cuestionario_draft_v2_${tokenKey}`);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Error submitting public questionnaire:', err);
      setValidationError('Hubo un error al enviar tu cuestionario. Por favor inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // PANTALLA: Cuestionario completado con éxito
  if (submitted || isAlreadyCompleted) {
    return (
      <div className="min-h-screen bg-slate-100 py-12 px-4 flex items-center justify-center font-sans">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 p-8 shadow-xl text-center space-y-6 animate-in fade-in duration-300">
          <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full inline-block">
              CUESTIONARIO REGISTRADO
            </span>
            <h2 className="text-2xl font-black text-slate-900">
              {submitted ? 'Cuestionario enviado correctamente' : 'Este cuestionario ya ha sido completado'}
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed pt-1">
              Gracias. Hemos registrado tus respuestas y datos para la vivienda{' '}
              <strong className="text-slate-900">{nombreInmueble}</strong>.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-left space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Siguientes pasos:</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              El propietario revisará tu información. En caso de preselección para visita, contactará contigo para coordinar la cita y, solo si resulta necesario, solicitar la documentación acreditativa correspondiente.
            </p>
          </div>

          <div className="pt-2 text-slate-400 text-[11px] font-medium">
            Puedes cerrar esta pestaña de forma segura.
          </div>
        </div>
      </div>
    );
  }

  // Cuestionario de Incidencias: datos de pregunta activa
  const currentQuestion = PREGUNTAS_INCIDENCIAS[currentQuestionIndex];
  const totalQuestions = PREGUNTAS_INCIDENCIAS.length; // 12
  const answeredCount =
    Object.keys(respuestasOp).length + (respuestaSit12.trim().length > 0 ? 1 : 0);

  // Cálculos de ingresos totales conjuntos
  const totalIngresosConjuntos =
    (Number(ingresosNetos) || 0) +
    (Number(otrosIngresos) || 0) +
    (numTitulares === 2
      ? (Number(cotitularIngresosNetos) || 0) + (Number(cotitularOtrosIngresos) || 0)
      : 0);

  return (
    <div className="min-h-screen bg-slate-100/90 py-6 sm:py-10 px-3 sm:px-6 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header de la Vivienda */}
        <header className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <Home className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-extrabold tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md inline-block mb-1">
                Cuestionario de Alquiler
              </span>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">
                {nombreInmueble}
              </h1>
              {inmueble && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {inmueble.precio} €/mes • {inmueble.ciudad}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80 text-[11px] font-semibold text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Formulario Seguro y Confidencial</span>
          </div>
        </header>

        {/* Wizard Stepper Progress Bar (4 Pasos) */}
        <nav aria-label="Progreso del cuestionario" className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-sm">
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {/* Step 1 */}
            <div
              className={`flex flex-col items-center gap-1.5 ${
                currentStep >= 1 ? 'text-blue-600 font-bold' : 'text-slate-400'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors ${
                  currentStep > 1
                    ? 'bg-blue-600 text-white'
                    : currentStep === 1
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {currentStep > 1 ? <Check className="w-4 h-4" /> : '1'}
              </div>
              <span className="text-[11px] truncate max-w-full">1. Titulares</span>
            </div>

            {/* Step 2 */}
            <div
              className={`flex flex-col items-center gap-1.5 ${
                currentStep >= 2 ? 'text-blue-600 font-bold' : 'text-slate-400'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors ${
                  currentStep > 2
                    ? 'bg-blue-600 text-white'
                    : currentStep === 2
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {currentStep > 2 ? <Check className="w-4 h-4" /> : '2'}
              </div>
              <span className="text-[11px] truncate max-w-full">2. Economía</span>
            </div>

            {/* Step 3 */}
            <div
              className={`flex flex-col items-center gap-1.5 ${
                currentStep >= 3 ? 'text-blue-600 font-bold' : 'text-slate-400'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors ${
                  currentStep > 3
                    ? 'bg-blue-600 text-white'
                    : currentStep === 3
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {currentStep > 3 ? <Check className="w-4 h-4" /> : '3'}
              </div>
              <span className="text-[11px] truncate max-w-full">3. Incidencias</span>
            </div>

            {/* Step 4 */}
            <div
              className={`flex flex-col items-center gap-1.5 ${
                currentStep === 4 ? 'text-blue-600 font-bold' : 'text-slate-400'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-colors ${
                  currentStep === 4
                    ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-600'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                4
              </div>
              <span className="text-[11px] truncate max-w-full">4. Envío</span>
            </div>
          </div>
        </nav>

        {/* Validation Error Banner */}
        {validationError && (
          <div
            role="alert"
            className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs flex items-start gap-2.5 shadow-sm animate-shake"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed font-medium">{validationError}</span>
          </div>
        )}

        {/* ======================================================== */}
        {/* PASO 1: DATOS DE CONTACTO Y TITULARES (1 O 2 PERSONAS) */}
        {/* ======================================================== */}
        {currentStep === 1 && (
          <form
            onSubmit={handleNextStep1}
            id="form-paso-1-titulares"
            className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold text-slate-900">Titulares del Contrato</h2>
              <p className="text-xs text-slate-500 mt-1">
                Indica si el contrato de alquiler se formalizará a nombre de una o dos personas.
              </p>
            </div>

            {/* Selector de 1 o 2 Titulares */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                ¿A nombre de cuántas personas irá el contrato? *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  id="btn-select-1-titular"
                  onClick={() => setNumTitulares(1)}
                  className={`p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all ${
                    numTitulares === 1
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      numTitulares === 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">1 Titular</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Una sola persona firma el contrato</p>
                  </div>
                </button>

                <button
                  type="button"
                  id="btn-select-2-titulares"
                  onClick={() => setNumTitulares(2)}
                  className={`p-4 rounded-2xl border text-left flex items-start gap-3.5 transition-all ${
                    numTitulares === 2
                      ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      numTitulares === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">2 Titulares</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Pareja, compañeros o dos cotitulares</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Bloque: Candidato 1 (Titular Principal) */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                  1
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {numTitulares === 2 ? 'Candidato 1 (Titular Principal)' : 'Datos de Contacto'}
                </h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="input-candidato-nombre" className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre y Apellidos completos *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-candidato-nombre"
                      type="text"
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ej. Juan García Moreno"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="input-candidato-telefono" className="block text-xs font-semibold text-slate-700 mb-1">
                      Teléfono de contacto *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="input-candidato-telefono"
                        type="tel"
                        required
                        value={telefono}
                        onChange={(e) => setTelefono(e.target.value)}
                        placeholder="Ej. 612 345 678"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="input-candidato-email" className="block text-xs font-semibold text-slate-700 mb-1">
                      Correo Electrónico *
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="input-candidato-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ej. juan.garcia@email.com"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloque: Candidato 2 (Cotitular) — Si numTitulares === 2 */}
            {numTitulares === 2 && (
              <div className="space-y-4 pt-4 border-t border-slate-100 animate-fadeIn">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                    2
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">Candidato 2 (Cotitular del Contrato)</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label htmlFor="input-cotitular-nombre" className="block text-xs font-semibold text-slate-700 mb-1">
                      Nombre y Apellidos del Cotitular *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="input-cotitular-nombre"
                        type="text"
                        required={numTitulares === 2}
                        value={cotitularNombre}
                        onChange={(e) => setCotitularNombre(e.target.value)}
                        placeholder="Ej. María López Sánchez"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="input-cotitular-telefono" className="block text-xs font-semibold text-slate-700 mb-1">
                        Teléfono del Cotitular (Opcional)
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="input-cotitular-telefono"
                          type="tel"
                          value={cotitularTelefono}
                          onChange={(e) => setCotitularTelefono(e.target.value)}
                          placeholder="Ej. 699 888 777"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="input-cotitular-email" className="block text-xs font-semibold text-slate-700 mb-1">
                        Correo del Cotitular (Opcional)
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="input-cotitular-email"
                          type="email"
                          value={cotitularEmail}
                          onChange={(e) => setCotitularEmail(e.target.value)}
                          placeholder="Ej. maria.lopez@email.com"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Número total de personas en la vivienda */}
            <div className="pt-2 border-t border-slate-100">
              <label htmlFor="input-num-personas-vivienda" className="block text-xs font-semibold text-slate-700 mb-1">
                ¿Cuántas personas vivirán en total en la vivienda?
              </label>
              <div className="relative max-w-xs">
                <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-num-personas-vivienda"
                  type="number"
                  min="1"
                  max="10"
                  value={numPersonas}
                  onChange={(e) => setNumPersonas(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Incluyendo titulares, familiares, menores u otros convivientes.
              </p>
            </div>

            {/* Botón Siguiente */}
            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                id="btn-continuar-paso-2"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <span>Continuar a Información Económica</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ======================================================== */}
        {/* PASO 2: INFORMACIÓN ECONÓMICA Y LABORAL */}
        {/* ======================================================== */}
        {currentStep === 2 && (
          <form
            onSubmit={handleNextStep2}
            id="form-paso-2-economia"
            className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6"
          >
            <div>
              <h2 className="text-xl font-bold text-slate-900">Información Económica y Laboral</h2>
              <p className="text-xs text-slate-500 mt-1">
                Datos necesarios para valorar la capacidad de pago y solvencia de los titulares.
              </p>
            </div>

            {/* Resumen de ingresos conjuntos si son 2 titulares */}
            {numTitulares === 2 && (
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Euro className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase text-blue-700 tracking-wider">
                      Suma Conjunta de Ingresos
                    </span>
                    <p className="text-xs text-slate-600">
                      Titular 1 ({nombre || 'Candidato 1'}) + Titular 2 ({cotitularNombre || 'Candidato 2'})
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-blue-950">
                    {totalIngresosConjuntos.toLocaleString('es-ES')} €
                  </span>
                  <span className="text-[11px] text-slate-500 block">/ mes netos</span>
                </div>
              </div>
            )}

            {/* Bloque Económico: Candidato 1 */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                  1
                </div>
                <h3 className="font-bold text-slate-900 text-sm">
                  {numTitulares === 2 ? `Candidato 1: ${nombre || 'Titular Principal'}` : 'Situación Laboral e Ingresos'}
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="select-candidato-tipo-empleo" className="block text-xs font-semibold text-slate-700 mb-1">
                    Situación laboral *
                  </label>
                  <select
                    id="select-candidato-tipo-empleo"
                    value={tipoEmpleo}
                    onChange={(e) => setTipoEmpleo(e.target.value as EmploymentType)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cuenta_ajena">💼 Trabajador por cuenta ajena</option>
                    <option value="autonomo">📈 Autónomo / Profesional independiente</option>
                    <option value="funcionario">🏛️ Funcionario / Empleo público</option>
                    <option value="pensionista">🛡️ Pensionista / Jubilado</option>
                    <option value="estudiante_otro">🎓 Estudiante / Otra situación</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="select-candidato-tipo-contrato" className="block text-xs font-semibold text-slate-700 mb-1">
                    Tipo de contrato
                  </label>
                  <select
                    id="select-candidato-tipo-contrato"
                    value={tipoContrato}
                    onChange={(e) => setTipoContrato(e.target.value as ContractType)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="indefinido">Contrato Indefinido</option>
                    <option value="temporal">Contrato Temporal</option>
                    <option value="fijo_discontinuo">Fijo Discontinuo</option>
                    <option value="practicas">Prácticas / Formativo</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="input-candidato-empresa" className="block text-xs font-semibold text-slate-700 mb-1">
                    Empresa o Actividad
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-candidato-empresa"
                      type="text"
                      value={empresa}
                      onChange={(e) => setEmpresa(e.target.value)}
                      placeholder="Ej. Sector Tecnológico / Logística"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="input-candidato-antiguedad" className="block text-xs font-semibold text-slate-700 mb-1">
                    Antigüedad en la empresa
                  </label>
                  <div className="relative">
                    <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-candidato-antiguedad"
                      type="text"
                      value={antiguedadLaboral}
                      onChange={(e) => setAntiguedadLaboral(e.target.value)}
                      placeholder="Ej. 3 años y 2 meses"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="input-candidato-ingresos" className="block text-xs font-semibold text-slate-700 mb-1">
                    Ingresos netos mensuales (€) *
                  </label>
                  <div className="relative">
                    <Euro className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-candidato-ingresos"
                      type="number"
                      min="1"
                      required
                      value={ingresosNetos}
                      onChange={(e) => setIngresosNetos(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="Ej. 2100"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Sueldo neto percibido en nómina</span>
                </div>

                <div>
                  <label htmlFor="input-candidato-otros-ingresos" className="block text-xs font-semibold text-slate-700 mb-1">
                    Otros ingresos mensuales (€)
                  </label>
                  <div className="relative">
                    <Euro className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-candidato-otros-ingresos"
                      type="number"
                      min="0"
                      value={otrosIngresos}
                      onChange={(e) => setOtrosIngresos(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Pensión, rentas, extras demostrables</span>
                </div>
              </div>

              {Number(otrosIngresos) > 0 && (
                <div>
                  <label htmlFor="input-candidato-desc-otros-ingresos" className="block text-xs font-semibold text-slate-700 mb-1">
                    Origen de los otros ingresos
                  </label>
                  <input
                    id="input-candidato-desc-otros-ingresos"
                    type="text"
                    value={descripcionOtrosIngresos}
                    onChange={(e) => setDescripcionOtrosIngresos(e.target.value)}
                    placeholder="Ej. Rendimientos de alquiler de plaza de garaje"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Bloque Económico: Candidato 2 (Cotitular) */}
            {numTitulares === 2 && (
              <div className="space-y-4 pt-6 border-t border-slate-100 animate-fadeIn">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center">
                    2
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Candidato 2: {cotitularNombre || 'Cotitular'} — Situación Laboral e Ingresos
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="select-cotitular-tipo-empleo" className="block text-xs font-semibold text-slate-700 mb-1">
                      Situación laboral *
                    </label>
                    <select
                      id="select-cotitular-tipo-empleo"
                      value={cotitularTipoEmpleo}
                      onChange={(e) => setCotitularTipoEmpleo(e.target.value as EmploymentType)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="cuenta_ajena">💼 Trabajador por cuenta ajena</option>
                      <option value="autonomo">📈 Autónomo / Profesional independiente</option>
                      <option value="funcionario">🏛️ Funcionario / Empleo público</option>
                      <option value="pensionista">🛡️ Pensionista / Jubilado</option>
                      <option value="estudiante_otro">🎓 Estudiante / Otra situación</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="select-cotitular-tipo-contrato" className="block text-xs font-semibold text-slate-700 mb-1">
                      Tipo de contrato
                    </label>
                    <select
                      id="select-cotitular-tipo-contrato"
                      value={cotitularTipoContrato}
                      onChange={(e) => setCotitularTipoContrato(e.target.value as ContractType)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="indefinido">Contrato Indefinido</option>
                      <option value="temporal">Contrato Temporal</option>
                      <option value="fijo_discontinuo">Fijo Discontinuo</option>
                      <option value="practicas">Prácticas / Formativo</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="input-cotitular-empresa" className="block text-xs font-semibold text-slate-700 mb-1">
                      Empresa o Actividad
                    </label>
                    <div className="relative">
                      <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="input-cotitular-empresa"
                        type="text"
                        value={cotitularEmpresa}
                        onChange={(e) => setCotitularEmpresa(e.target.value)}
                        placeholder="Ej. Sector Salud / Docencia"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="input-cotitular-antiguedad" className="block text-xs font-semibold text-slate-700 mb-1">
                      Antigüedad en la empresa
                    </label>
                    <div className="relative">
                      <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="input-cotitular-antiguedad"
                        type="text"
                        value={cotitularAntiguedad}
                        onChange={(e) => setCotitularAntiguedad(e.target.value)}
                        placeholder="Ej. 2 años"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="input-cotitular-ingresos" className="block text-xs font-semibold text-slate-700 mb-1">
                      Ingresos netos mensuales (€) *
                    </label>
                    <div className="relative">
                      <Euro className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="input-cotitular-ingresos"
                        type="number"
                        min="1"
                        required={numTitulares === 2}
                        value={cotitularIngresosNetos}
                        onChange={(e) => setCotitularIngresosNetos(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Ej. 1850"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5">Sueldo neto del cotitular</span>
                  </div>

                  <div>
                    <label htmlFor="input-cotitular-otros-ingresos" className="block text-xs font-semibold text-slate-700 mb-1">
                      Otros ingresos mensuales (€)
                    </label>
                    <div className="relative">
                      <Euro className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        id="input-cotitular-otros-ingresos"
                        type="number"
                        min="0"
                        value={cotitularOtrosIngresos}
                        onChange={(e) => setCotitularOtrosIngresos(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Avalista / Garantías */}
            <div className="pt-4 border-t border-slate-100">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100/70 transition-colors">
                <input
                  id="chk-avalista"
                  type="checkbox"
                  checked={avalista}
                  onChange={(e) => setAvalista(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500"
                />
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    ¿Dispones de avalista o garantías adicionales si fueran requeridas?
                  </span>
                  <span className="text-[11px] text-slate-500 block">
                    Marca esta opción si cuentas con un familiar o fiador solidario con solvencia acreditada.
                  </span>
                </div>
              </label>
            </div>

            {/* Navegación */}
            <div className="pt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setValidationError(null);
                  setCurrentStep(1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Volver</span>
              </button>

              <button
                type="submit"
                id="btn-continuar-paso-3"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                <span>Continuar a Cuestionario de Incidencias</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* ======================================================== */}
        {/* PASO 3: CUESTIONARIO DE INCIDENCIAS (12 SITUACIONES) */}
        {/* ======================================================== */}
        {currentStep === 3 && (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                  Situación {currentQuestionIndex + 1} de {totalQuestions}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Respondidas: {answeredCount} / {totalQuestions}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900">Cuestionario de Gestión de Incidencias</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Situaciones prácticas en el hogar. Ayudan al propietario a conocer cómo gestionas el mantenimiento cotidiano de la vivienda.
              </p>
            </div>

            {/* Barra de progreso interactiva */}
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
              />
            </div>

            {/* Selector directo de situaciones */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PREGUNTAS_INCIDENCIAS.map((q, idx) => {
                const isAnswered = q.esAbierta
                  ? respuestaSit12.trim().length > 0
                  : !!respuestasOp[q.id];
                const isCurrent = idx === currentQuestionIndex;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      setValidationError(null);
                      setCurrentQuestionIndex(idx);
                    }}
                    className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                      isCurrent
                        ? 'bg-blue-600 text-white shadow-xs scale-105'
                        : isAnswered
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={`Situación ${idx + 1}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Tarjeta de la Situación Actual */}
            <div className="p-5 sm:p-6 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  {currentQuestion.titulo}
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {currentQuestion.pregunta}
                </h3>
              </div>

              {/* Preguntas 1 a 11: Opciones de test */}
              {!currentQuestion.esAbierta && currentQuestion.opciones && (
                <div className="space-y-2.5 pt-1">
                  {currentQuestion.opciones.map((op) => {
                    const isSelected = respuestasOp[currentQuestion.id] === op.id;

                    return (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => {
                          setRespuestasOp((prev) => ({
                            ...prev,
                            [currentQuestion.id]: op.id as 'A' | 'B' | 'C' | 'D',
                          }));
                          setValidationError(null);
                          // Auto-advance if not last question
                          if (currentQuestionIndex < totalQuestions - 1) {
                            setTimeout(() => {
                              setCurrentQuestionIndex((prev) => prev + 1);
                            }, 180);
                          }
                        }}
                        className={`w-full p-3.5 sm:p-4 rounded-xl border text-left flex items-start gap-3 transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 shadow-xs ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {op.id}
                        </div>
                        <span className="text-xs text-slate-800 leading-relaxed font-medium pt-0.5">
                          {op.texto}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pregunta 12: Texto libre */}
              {currentQuestion.esAbierta && (
                <div className="space-y-3 pt-1">
                  <div className="p-3.5 bg-blue-50 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      Describe brevemente qué pasos lógicos seguirías en esta situación antes de solicitar la intervención técnica.
                    </span>
                  </div>

                  <textarea
                    rows={4}
                    value={respuestaSit12}
                    onChange={(e) => setRespuestaSit12(e.target.value)}
                    placeholder="Ej. Comprobaría primero si las pilas del mando están bien, revisaría el automático del cuadro eléctrico y los filtros antes de reportar la avería..."
                    className="w-full p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Información adicional voluntaria */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
              <label htmlFor="textarea-info-adicional-voluntaria" className="block text-xs font-bold text-slate-800">
                {PREGUNTA_INFORMACION_ADICIONAL.titulo} (Opcional)
              </label>
              <p className="text-[11px] text-slate-500">
                {PREGUNTA_INFORMACION_ADICIONAL.pregunta}
              </p>
              <textarea
                id="textarea-info-adicional-voluntaria"
                rows={2}
                value={infoAdicional}
                onChange={(e) => setInfoAdicional(e.target.value)}
                placeholder="Cualquier aclaración que quieras trasladar al propietario..."
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Controles de Navegación del Cuestionario */}
            <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setValidationError(null);
                    setCurrentStep(2);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Volver a Economía</span>
                </button>

                {currentQuestionIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setValidationError(null);
                      setCurrentQuestionIndex((prev) => prev - 1);
                    }}
                    className="px-3.5 py-2.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs rounded-xl transition-colors"
                  >
                    Anterior situación
                  </button>
                )}
              </div>

              {currentQuestionIndex < totalQuestions - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setValidationError(null);
                    setCurrentQuestionIndex((prev) => prev + 1);
                  }}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
                >
                  <span>Siguiente situación</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-continuar-paso-4"
                  onClick={handleNextStep3}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  <span>Revisar y Enviar</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* PASO 4: REVISIÓN FINAL Y ENVÍO (SIN ARCHIVOS ADJUNTOS) */}
        {/* ======================================================== */}
        {currentStep === 4 && (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-sm space-y-6 animate-fadeIn">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Revisión Final y Envío</h2>
              <p className="text-xs text-slate-500 mt-1">
                Comprueba el resumen de tus datos antes de enviar el cuestionario al propietario.
              </p>
            </div>

            {/* Aviso informativo de no necesidad de archivos en esta fase */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-emerald-950">
                  Cuestionario ágil sin archivos adjuntos
                </h4>
                <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                  No es necesario adjuntar nóminas ni documentos en esta fase inicial. La documentación acreditativa solo se solicitará a los candidatos preseleccionados tras la visita.
                </p>
              </div>
            </div>

            {/* Resumen Candidato 1 */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                    1
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {numTitulares === 2 ? 'Candidato 1 (Titular Principal)' : 'Datos del Titular'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-blue-600 font-bold hover:underline"
                >
                  Editar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Nombre:</span>
                  <span className="font-bold text-slate-900">{nombre}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Contacto:</span>
                  <span className="font-medium text-slate-800">{telefono} • {email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Situación Laboral:</span>
                  <span className="font-medium text-slate-800">
                    {tipoEmpleo} ({tipoContrato}) • {empresa || 'Empresa no indicada'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Ingresos netos declarados:</span>
                  <span className="font-bold text-blue-700">
                    {Number(ingresosNetos).toLocaleString('es-ES')} €/mes
                    {Number(otrosIngresos) > 0 && ` (+ ${Number(otrosIngresos)} € otros)`}
                  </span>
                </div>
              </div>
            </div>

            {/* Resumen Candidato 2 (si numTitulares === 2) */}
            {numTitulares === 2 && (
              <div className="p-5 bg-purple-50/50 rounded-2xl border border-purple-200/80 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-purple-200">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold flex items-center justify-center">
                      2
                    </div>
                    <h3 className="font-bold text-purple-950 text-sm">Candidato 2 (Cotitular)</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs text-purple-700 font-bold hover:underline"
                  >
                    Editar
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-purple-400 block text-[11px]">Nombre:</span>
                    <span className="font-bold text-slate-900">{cotitularNombre}</span>
                  </div>
                  <div>
                    <span className="text-purple-400 block text-[11px]">Contacto:</span>
                    <span className="font-medium text-slate-800">
                      {cotitularTelefono || 'No indicado'} • {cotitularEmail || 'No indicado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-purple-400 block text-[11px]">Situación Laboral:</span>
                    <span className="font-medium text-slate-800">
                      {cotitularTipoEmpleo} ({cotitularTipoContrato}) • {cotitularEmpresa || 'Empresa no indicada'}
                    </span>
                  </div>
                  <div>
                    <span className="text-purple-400 block text-[11px]">Ingresos netos declarados:</span>
                    <span className="font-bold text-purple-700">
                      {Number(cotitularIngresosNetos).toLocaleString('es-ES')} €/mes
                      {Number(cotitularOtrosIngresos) > 0 && ` (+ ${Number(cotitularOtrosIngresos)} € otros)`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Total Conjunto y Respuestas */}
            <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Ingresos Mensuales Conjuntos del Hogar
                </span>
                <span className="text-2xl font-black text-emerald-400">
                  {totalIngresosConjuntos.toLocaleString('es-ES')} € / mes
                </span>
              </div>
              <div className="text-right text-xs text-slate-300">
                <span className="block font-semibold">12 situaciones respondidas</span>
                <span className="text-slate-400 text-[11px]">Convivientes: {numPersonas} persona(s)</span>
              </div>
            </div>

            {/* Botones Finales */}
            <div className="pt-4 flex items-center justify-between gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setValidationError(null);
                  setCurrentStep(3);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Volver a Cuestionario</span>
              </button>

              <button
                type="button"
                id="btn-enviar-cuestionario-final"
                disabled={isSubmitting}
                onClick={handleFinalSubmit}
                className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-sm rounded-xl shadow-lg transition-all flex items-center gap-2.5"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Enviando cuestionario...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Enviar Cuestionario al Propietario</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
