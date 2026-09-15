import React, { useState } from 'react';
import {
  Inmueble,
  SolicitudAlquiler,
  Candidato,
  EmploymentType,
  ContractType,
  RespuestaIncidencia,
  DocumentStatus,
  SolicitudHistorialItem,
} from '../types';
import { PREGUNTAS_INCIDENCIAS } from '../data/cuestionarioPreguntas';
import {
  Building2,
  Euro,
  Users,
  CheckCircle2,
  Lock,
  FileText,
  Upload,
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Calendar,
  Briefcase,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
  MapPin,
  Maximize2,
  Check,
  Dog,
  Cigarette,
  UserCheck,
} from 'lucide-react';

interface PortalSolicitudPublicaViewProps {
  inmueble: Inmueble;
  onCompleteSolicitud: (solicitud: SolicitudAlquiler, candidato: Candidato) => void;
}

export const PortalSolicitudPublicaView: React.FC<PortalSolicitudPublicaViewProps> = ({
  inmueble,
  onCompleteSolicitud,
}) => {
  const [step, setStep] = useState<number>(1);

  // Paso 1: Datos Personales
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [numAdultos, setNumAdultos] = useState<number>(1);
  const [numMenores, setNumMenores] = useState<number>(0);
  const [fechaEntrada, setFechaEntrada] = useState('');
  const [duracionPrevista, setDuracionPrevista] = useState('1 año');
  const [tieneMascotas, setTieneMascotas] = useState<boolean>(false);
  const [detallesMascotas, setDetallesMascotas] = useState('');
  const [esFumador, setEsFumador] = useState<boolean>(false);

  // Paso 2: Situación Económica
  const [situacionLaboral, setSituacionLaboral] = useState<EmploymentType>('cuenta_ajena');
  const [empresa, setEmpresa] = useState('');
  const [puesto, setPuesto] = useState('');
  const [tipoContrato, setTipoContrato] = useState<ContractType>('indefinido');
  const [antiguedad, setAntiguedad] = useState('');
  const [ingresosNetos, setIngresosNetos] = useState<string>('');
  const [otrosIngresos, setOtrosIngresos] = useState<string>('');
  const [descripcionOtros, setDescripcionOtros] = useState('');
  const [tieneAvalista, setTieneAvalista] = useState<boolean>(false);
  const [avalIngresos, setAvalIngresos] = useState('');
  const [avalSituacion, setAvalSituacion] = useState('');
  const [avalContrato, setAvalContrato] = useState('');

  // Consentimiento
  const [consentimientoAceptado, setConsentimientoAceptado] = useState(false);
  const [showPrivacyPolicyModal, setShowPrivacyPolicyModal] = useState(false);

  // Paso 3: Cuestionario de Incidencias
  const [respuestas, setRespuestas] = useState<Record<string, { opcionId?: 'A' | 'B' | 'C' | 'D'; textoLibre?: string }>>({});
  const [infoAdicional, setInfoAdicional] = useState('');

  // Paso 4: Documentación
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, { file: File; name: string; url?: string }>>({});

  // Status flags
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const numTotalPersonas = numAdultos + numMenores;
  const isAutonomo = situacionLaboral === 'autonomo';

  // Helper validation for steps
  const canProceedStep1 = nombre.trim() !== '' && telefono.trim() !== '' && email.trim() !== '';
  const canProceedStep2 =
    ingresosNetos !== '' &&
    parseFloat(ingresosNetos) > 0 &&
    consentimientoAceptado;

  const handleOptionSelect = (preguntaId: string, opcionId: 'A' | 'B' | 'C' | 'D') => {
    setRespuestas((prev) => ({
      ...prev,
      [preguntaId]: {
        ...prev[preguntaId],
        opcionId,
      },
    }));
  };

  const handleTextLibreChange = (preguntaId: string, texto: string) => {
    setRespuestas((prev) => ({
      ...prev,
      [preguntaId]: {
        ...prev[preguntaId],
        textoLibre: texto,
      },
    }));
  };

  const handleFileUpload = (slotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFiles((prev) => ({
        ...prev,
        [slotId]: { file, name: file.name },
      }));
    }
  };

  const handleSubmitFinal = () => {
    if (!consentimientoAceptado) {
      setErrorMsg('Debes aceptar el consentimiento de privacidad antes de enviar.');
      return;
    }

    // Build questionnaire responses
    const respuestasArray: RespuestaIncidencia[] = PREGUNTAS_INCIDENCIAS.map((preg) => {
      const resp = respuestas[preg.id];
      if (preg.esAbierta) {
        return {
          preguntaId: preg.id,
          preguntaTitulo: preg.titulo,
          preguntaTexto: preg.pregunta,
          esAbierta: true,
          respuestaTextoLibre: resp?.textoLibre || 'Sin respuesta detallada.',
        };
      }
      const op = preg.opciones?.find((o) => o.id === resp?.opcionId);
      return {
        preguntaId: preg.id,
        preguntaTitulo: preg.titulo,
        preguntaTexto: preg.pregunta,
        opcionSeleccionadaId: resp?.opcionId || 'A',
        opcionSeleccionadaTexto: op?.texto || 'Opción no seleccionada',
      };
    });

    const isQuestionnaireCompleted = respuestasArray.length >= 10;

    // Document slots status
    const docSlots = isAutonomo
      ? [
          { id: 'dni', nombre: 'DNI / NIE / Pasaporte', subido: !!uploadedFiles['dni'], valido: true },
          { id: 'nomina', nombre: '3 Últimas Nóminas / Justificantes', subido: !!uploadedFiles['nomina'], valido: true },
          { id: 'renta', nombre: 'Declaración Renta / Documentación Fiscal', subido: !!uploadedFiles['renta'], valido: true },
          { id: 'avalista', nombre: 'Documentación Avalista', subido: !!uploadedFiles['avalista'], valido: true },
          { id: 'otros', nombre: 'Otros Documentos', subido: !!uploadedFiles['otros'], valido: true },
        ]
      : [
          { id: 'dni', nombre: 'DNI / NIE / Pasaporte', subido: !!uploadedFiles['dni'], valido: true },
          { id: 'nomina', nombre: '3 Últimas Nóminas', subido: !!uploadedFiles['nomina'], valido: true },
          { id: 'avalista', nombre: 'Documentación Avalista', subido: !!uploadedFiles['avalista'], valido: true },
          { id: 'otros', nombre: 'Otros Documentos', subido: !!uploadedFiles['otros'], valido: true },
        ];

    const docsSubidosCount = docSlots.filter((d) => d.subido).length;
    const isDocComplete = isAutonomo
      ? uploadedFiles['dni'] && uploadedFiles['nomina'] && uploadedFiles['renta']
      : uploadedFiles['dni'] && uploadedFiles['nomina'];

    const newCandId = `cand-${Date.now()}`;
    const newSolId = `sol-${Date.now()}`;
    const timestampNow = new Date().toISOString();
    const formattedDateNow = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const numIngresosNetos = parseFloat(ingresosNetos) || 0;
    const numOtrosIngresos = parseFloat(otrosIngresos) || 0;

    // Estimated Solvencia ratio
    const totalIngresos = numIngresosNetos + numOtrosIngresos;
    const ratioSolvencia = totalIngresos > 0 ? Number(((inmueble.precio / totalIngresos) * 100).toFixed(1)) : 100;
    const scoreSolvenciaCalculated = ratioSolvencia <= 35 ? 90 : ratioSolvencia <= 45 ? 75 : 50;

    const newCandidate: Candidato = {
      id: newCandId,
      nombre,
      telefono,
      email,
      inmuebleId: inmueble.id,
      inmuebleNombre: inmueble.direccion,
      numPersonas: numTotalPersonas,
      ingresosNetos: numIngresosNetos,
      tipoEmpleo: situacionLaboral,
      tipoContrato,
      antiguedadLaboral: antiguedad || 'Reciente',
      otrosIngresos: numOtrosIngresos,
      descripcionOtrosIngresos: descripcionOtros,
      avalista: tieneAvalista,
      observaciones: `Solicitud pública desde portal del inmueble ${inmueble.direccion}. Mascotas: ${tieneMascotas ? 'Sí' : 'No'}, Fumador: ${esFumador ? 'Sí' : 'No'}.`,
      estado: isDocComplete ? 'analizado' : 'pendiente_doc',
      fechaCreacion: new Date().toISOString().split('T')[0],
      scoreEstimado: scoreSolvenciaCalculated,
      ratioSolvencia,
      documentos: docSlots as DocumentStatus[],
      cuestionarioIncidencias: {
        completado: isQuestionnaireCompleted,
        fechaCompletado: timestampNow,
        numRespuestas: respuestasArray.length,
        totalPreguntas: 12,
        respuestas: respuestasArray,
        informacionAdicional: infoAdicional,
      },
    };

    const initialHistorial: SolicitudHistorialItem[] = [
      {
        id: `h-1-${Date.now()}`,
        fecha: formattedDateNow,
        accion: 'Solicitud creada',
        detalle: `Enviada correctamente por ${nombre} a través del portal público.`,
        estadoNuevo: 'NUEVA',
      },
    ];

    if (isQuestionnaireCompleted) {
      initialHistorial.push({
        id: `h-2-${Date.now()}`,
        fecha: formattedDateNow,
        accion: 'Cuestionario completado',
        detalle: 'El candidato ha respondido a las 12 situaciones planteadas.',
      });
    }

    if (docsSubidosCount > 0) {
      initialHistorial.push({
        id: `h-3-${Date.now()}`,
        fecha: formattedDateNow,
        accion: 'Documentación recibida',
        detalle: `El candidato ha adjuntado ${docsSubidosCount} documento(s).`,
      });
    }

    const newSolicitud: SolicitudAlquiler = {
      id: newSolId,
      token: `sol-${inmueble.id}-${Math.random().toString(36).substring(2, 8)}`,
      ownerId: 'owner-1',
      inmuebleId: inmueble.id,
      inmuebleNombre: inmueble.direccion,
      inmueblePrecio: inmueble.precio,
      inmuebleCiudad: inmueble.ciudad,
      inmuebleImagenUrl: inmueble.imagenUrl,
      candidatoId: newCandId,
      candidatoNombre: nombre,
      candidatoTelefono: telefono,
      candidatoEmail: email,
      numAdultos,
      numMenores,
      numTotalPersonas,
      fechaEntradaAproximada: fechaEntrada || 'A convenir',
      duracionPrevista,
      tieneMascotas,
      detallesMascotas,
      esFumador,
      situacionLaboral,
      empresa,
      puesto,
      tipoContrato,
      antiguedadLaboral: antiguedad || 'No especificada',
      ingresosNetosMensuales: numIngresosNetos,
      otrosIngresos: numOtrosIngresos,
      descripcionOtrosIngresos: descripcionOtros,
      tieneAvalista,
      detallesAvalista: tieneAvalista
        ? {
            ingresosAproximados: parseFloat(avalIngresos) || 0,
            situacionLaboral: avalSituacion,
            tipoContrato: avalContrato,
          }
        : undefined,
      consentimientoAceptado: true,
      fechaConsentimiento: timestampNow,
      estado: isDocComplete ? 'CUESTIONARIO COMPLETADO' : 'DOCUMENTACIÓN PENDIENTE',
      cuestionarioCompletado: isQuestionnaireCompleted,
      cuestionarioData: {
        completado: isQuestionnaireCompleted,
        fechaCompletado: timestampNow,
        numRespuestas: respuestasArray.length,
        totalPreguntas: 12,
        respuestas: respuestasArray,
        informacionAdicional: infoAdicional,
      },
      documentosCompletados: !!isDocComplete,
      documentos: docSlots as DocumentStatus[],
      historial: initialHistorial,
      fechaCreacion: new Date().toISOString().split('T')[0],
      fechaActualizacion: timestampNow,
      scoreSolvencia: scoreSolvenciaCalculated,
      perfilOperativo: 85,
    };

    onCompleteSolicitud(newSolicitud, newCandidate);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-100/90 py-8 px-4 flex items-center justify-center font-sans antialiased">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200/90 p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Solicitud enviada correctamente
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              El propietario del inmueble <strong>{inmueble.direccion}</strong> ha recibido tu información.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl text-xs text-slate-600 leading-relaxed text-left space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <Clock className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Próximos pasos</span>
            </div>
            <p>
              El propietario revisará la información aportada y se pondrá en contacto contigo si necesita información adicional o para concertar una visita.
            </p>
          </div>

          <div className="pt-2 text-slate-400 text-xs font-medium">
            Puedes cerrar esta pestaña de forma segura.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/90 py-4 sm:py-8 px-3 sm:px-6 font-sans text-slate-800 antialiased">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header Bar */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600">
                Portal de Candidatos
              </span>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-1">
                {inmueble.direccion}
              </h1>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-400 block">Alquiler</span>
            <span className="text-base sm:text-lg font-black text-blue-700">
              {inmueble.precio} €/mes
            </span>
          </div>
        </div>

        {/* Stepped Progress Bar */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700">
              Paso {step} de 5: {step === 1 && 'Inicio'} {step === 2 && 'Datos Personales'} {step === 3 && 'Situación Económica'} {step === 4 && 'Cuestionario'} {step === 5 && 'Documentación'}
            </span>
            <span className="text-xs font-extrabold text-blue-600">
              {Math.round((step / 5) * 100)}%
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* STEP 1: Presentation & Inquiry */}
        {step === 1 && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-6">
            {/* Property Hero Banner */}
            <div className="relative rounded-2xl overflow-hidden aspect-video bg-slate-200 shadow-inner">
              <img
                src={inmueble.imagenUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80'}
                alt={inmueble.direccion}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 text-white space-y-1">
                <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  <MapPin className="w-3 h-3" /> {inmueble.ciudad}
                </span>
                <h2 className="text-lg sm:text-xl font-bold leading-snug">{inmueble.direccion}</h2>
              </div>
            </div>

            {/* Property Key Features Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl text-center">
                <span className="text-xs text-slate-500 font-medium block">Habitaciones</span>
                <span className="text-sm sm:text-base font-black text-slate-800">{inmueble.habitaciones}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl text-center">
                <span className="text-xs text-slate-500 font-medium block">Baños</span>
                <span className="text-sm sm:text-base font-black text-slate-800">{inmueble.banos}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200/70 rounded-2xl text-center">
                <span className="text-xs text-slate-500 font-medium block">Superficie</span>
                <span className="text-sm sm:text-base font-black text-slate-800">{inmueble.superficie} m²</span>
              </div>
            </div>

            {/* Call to action */}
            <div className="bg-blue-50/80 border border-blue-200/80 rounded-2xl p-5 text-center space-y-3">
              <h3 className="text-base font-bold text-blue-950">¿Estás interesado en esta vivienda?</h3>
              <p className="text-xs text-blue-800 leading-relaxed max-w-lg mx-auto">
                Inicia tu solicitud de alquiler en 5 sencillos pasos. El propietario revisará tu perfil directamente.
              </p>
              <button
                onClick={() => setStep(2)}
                className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md transition-all inline-flex items-center justify-center gap-2"
              >
                <span>Solicitar alquiler</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Personal Info */}
        {step === 2 && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <span>Datos del Interesado</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Por favor, indica tus datos personales y las características de tu unidad de convivencia.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nombre completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Ana María Martínez"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Teléfono *</label>
                  <input
                    type="tel"
                    required
                    placeholder="+34 600 000 000"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="ejemplo@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Occupants grid */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Adultos</label>
                  <input
                    type="number"
                    min="1"
                    value={numAdultos}
                    onChange={(e) => setNumAdultos(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-center"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Menores</label>
                  <input
                    type="number"
                    min="0"
                    value={numMenores}
                    onChange={(e) => setNumMenores(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 text-center"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Total personas</label>
                  <div className="w-full px-3 py-2 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-black text-center">
                    {numTotalPersonas}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Fecha aproximada de entrada</label>
                  <input
                    type="date"
                    value={fechaEntrada}
                    onChange={(e) => setFechaEntrada(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Duración prevista del alquiler</label>
                  <select
                    value={duracionPrevista}
                    onChange={(e) => setDuracionPrevista(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium"
                  >
                    <option value="1 año">1 año</option>
                    <option value="Múltiples años">Múltiples años / Larga estancia</option>
                    <option value="6-12 meses">6 a 12 meses</option>
                    <option value="Temporal (<6 meses)">Temporal (&lt; 6 meses)</option>
                  </select>
                </div>
              </div>

              {/* Mascotas & Fumadores */}
              <div className="space-y-3 p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Dog className="w-4 h-4 text-slate-500" />
                    <span>¿Tienes mascotas?</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTieneMascotas(true)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        tieneMascotas ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setTieneMascotas(false)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        !tieneMascotas ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {tieneMascotas && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo y número de mascotas</label>
                    <input
                      type="text"
                      placeholder="Ej. 1 perro pequeño (Caniche)"
                      value={detallesMascotas}
                      onChange={(e) => setDetallesMascotas(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Cigarette className="w-4 h-4 text-slate-500" />
                    <span>¿Fumadores en la vivienda?</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setEsFumador(true)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        esFumador ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setEsFumador(false)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        !esFumador ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                type="button"
                disabled={!canProceedStep1}
                onClick={() => setStep(3)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all inline-flex items-center gap-1.5"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Economic Situation & Consent */}
        {step === 3 && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-blue-600" />
                <span>Situación Económica</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                La información de ingresos nos ayuda a verificar la solvencia necesaria para el alquiler.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Situación laboral</label>
                <select
                  value={situacionLaboral}
                  onChange={(e) => setSituacionLaboral(e.target.value as EmploymentType)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium"
                >
                  <option value="cuenta_ajena">Trabajador por Cuenta Ajena</option>
                  <option value="autonomo">Trabajador Autónomo</option>
                  <option value="funcionario">Funcionario / Empleado Público</option>
                  <option value="pensionista">Pensionista / Jubilado</option>
                  <option value="estudiante_otro">Otro / Estudiante</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Empresa / Empleador</label>
                  <input
                    type="text"
                    placeholder="Nombre de la empresa"
                    value={empresa}
                    onChange={(e) => setEmpresa(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Puesto / Cargo</label>
                  <input
                    type="text"
                    placeholder="Puesto de trabajo"
                    value={puesto}
                    onChange={(e) => setPuesto(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de contrato</label>
                  <select
                    value={tipoContrato}
                    onChange={(e) => setTipoContrato(e.target.value as ContractType)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium"
                  >
                    <option value="indefinido">Indefinido</option>
                    <option value="temporal">Temporal</option>
                    <option value="fijo_discontinuo">Fijo Discontinuo</option>
                    <option value="practicas">En Prácticas</option>
                    <option value="no_aplica">No Aplica / Autónomo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Antigüedad en la empresa</label>
                  <input
                    type="text"
                    placeholder="Ej. 2 años y 6 meses"
                    value={antiguedad}
                    onChange={(e) => setAntiguedad(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ingresos netos mensuales (€) *</label>
                  <input
                    type="number"
                    required
                    placeholder="Ej. 2100"
                    value={ingresosNetos}
                    onChange={(e) => setIngresosNetos(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Otros ingresos mensuales (€)</label>
                  <input
                    type="number"
                    placeholder="Ej. 300"
                    value={otrosIngresos}
                    onChange={(e) => setOtrosIngresos(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-bold"
                  />
                </div>
              </div>

              {/* Avalista Section */}
              <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-slate-500" />
                    <span>¿Aportas avalista personal o familiar?</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTieneAvalista(true)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        tieneAvalista ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={() => setTieneAvalista(false)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        !tieneAvalista ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>

                {tieneAvalista && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Ingresos aprox. avalista (€)</label>
                      <input
                        type="number"
                        placeholder="2500"
                        value={avalIngresos}
                        onChange={(e) => setAvalIngresos(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Situación laboral</label>
                      <input
                        type="text"
                        placeholder="Cuenta ajena / Funcionario"
                        value={avalSituacion}
                        onChange={(e) => setAvalSituacion(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tipo de contrato</label>
                      <input
                        type="text"
                        placeholder="Indefinido"
                        value={avalContrato}
                        onChange={(e) => setAvalContrato(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Consent & Privacy Section */}
              <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="consentimento"
                    checked={consentimientoAceptado}
                    onChange={(e) => setConsentimientoAceptado(e.target.checked)}
                    className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 shrink-0 cursor-pointer"
                  />
                  <label htmlFor="consentimento" className="text-xs text-blue-950 font-medium leading-relaxed cursor-pointer">
                    Acepto expresamente el tratamiento de mis datos personales para la gestión de la solicitud de alquiler de la vivienda <strong>{inmueble.direccion}</strong> conforme a la normativa de protección de datos (RGPD).
                  </label>
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowPrivacyPolicyModal(true)}
                    className="text-[11px] font-bold text-blue-700 underline hover:text-blue-900"
                  >
                    Ver información de privacidad y RGPD
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                type="button"
                disabled={!canProceedStep2}
                onClick={() => setStep(4)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all inline-flex items-center gap-1.5"
              >
                Continuar al Cuestionario <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Incident Questionnaire */}
        {step === 4 && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>Cuestionario de Situaciones en la Vivienda</span>
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Ahora vamos a realizar unas preguntas sobre situaciones habituales en una vivienda. Selecciona la opción que mejor describa cómo actuarías.
              </p>
            </div>

            <div className="space-y-6">
              {PREGUNTAS_INCIDENCIAS.map((preg, idx) => {
                const currentResp = respuestas[preg.id];
                return (
                  <div key={preg.id} className="p-4 bg-slate-50/90 border border-slate-200/80 rounded-2xl space-y-3">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 block">
                      Situación {idx + 1} de {PREGUNTAS_INCIDENCIAS.length}
                    </span>
                    <h3 className="text-xs font-bold text-slate-900">{preg.titulo}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{preg.pregunta}</p>

                    {preg.esAbierta ? (
                      <div>
                        <textarea
                          rows={3}
                          placeholder="Describe brevemente cómo actuarías en esta situación..."
                          value={currentResp?.textoLibre || ''}
                          onChange={(e) => handleTextLibreChange(preg.id, e.target.value)}
                          className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {preg.opciones?.map((op) => {
                          const isSelected = currentResp?.opcionId === op.id;
                          return (
                            <button
                              key={op.id}
                              type="button"
                              onClick={() => handleOptionSelect(preg.id, op.id as any)}
                              className={`w-full p-3 text-left rounded-xl border text-xs font-medium transition-all flex items-start gap-2.5 ${
                                isSelected
                                  ? 'bg-blue-50 border-blue-500 text-blue-950 shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100/80'
                              }`}
                            >
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                                  isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {op.id}
                              </span>
                              <span>{op.texto}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all inline-flex items-center gap-1.5"
              >
                Ir a Documentación <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Documentation Upload */}
        {step === 5 && (
          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-7 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                <span>Documentación</span>
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Adjunta los documentos requeridos para que el propietario pueda validar tu solicitud.
              </p>
            </div>

            {/* Document slots */}
            <div className="space-y-3">
              {(isAutonomo
                ? [
                    { id: 'dni', title: 'DNI / NIE / Pasaporte', req: true, sub: 'Documento de identidad en vigor por ambas caras' },
                    { id: 'nomina', title: '3 Últimas Nóminas / Justificantes', req: true, sub: 'Comprobantes de ingresos de los últimos 3 meses' },
                    { id: 'renta', title: 'Declaración Renta / Doc. Fiscal', req: true, sub: 'Última declaración de IRPF o certificado fiscal' },
                    { id: 'avalista', title: 'Documentación del Avalista', req: false, sub: 'Solo en caso de contar con aval personal' },
                    { id: 'otros', title: 'Otros Documentos', req: false, sub: 'Extractos bancarios o justificantes opcionales' },
                  ]
                : [
                    { id: 'dni', title: 'DNI / NIE / Pasaporte', req: true, sub: 'Documento de identidad en vigor por ambas caras' },
                    { id: 'nomina', title: '3 Últimas Nóminas', req: true, sub: 'Tus 3 últimas nóminas de trabajo recientes' },
                    { id: 'avalista', title: 'Documentación del Avalista', req: false, sub: 'Solo en caso de contar con aval personal' },
                    { id: 'otros', title: 'Otros Documentos', req: false, sub: 'Extractos bancarios o justificantes opcionales' },
                  ]
              ).map((slot) => {
                const uploaded = uploadedFiles[slot.id];
                return (
                  <div
                    key={slot.id}
                    className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{slot.title}</span>
                        {slot.req ? (
                          <span className="text-[10px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Requerido</span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Opcional</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{slot.sub}</p>
                    </div>

                    <div>
                      {uploaded ? (
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl text-emerald-800 text-xs font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="truncate max-w-[140px]">{uploaded.name}</span>
                        </div>
                      ) : (
                        <label className="cursor-pointer px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100/80 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs">
                          <Upload className="w-3.5 h-3.5 text-blue-600" />
                          <span>Adjuntar</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="hidden"
                            onChange={(e) => handleFileUpload(slot.id, e)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                type="button"
                onClick={handleSubmitFinal}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg transition-all inline-flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Finalizar y Enviar Solicitud</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Policy Information Modal */}
      {showPrivacyPolicyModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-600" />
              <span>Información de Protección de Datos (RGPD)</span>
            </h3>
            <div className="text-xs text-slate-600 leading-relaxed space-y-2 max-h-60 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200">
              <p>
                <strong>Responsable:</strong> El propietario arrendador del inmueble {inmueble.direccion}.
              </p>
              <p>
                <strong>Finalidad:</strong> Evaluar la solvencia y adecuación de la candidatura para el alquiler del inmueble indicado.
              </p>
              <p>
                <strong>Legitimación:</strong> Consentimiento expreso del interesado al enviar el formulario.
              </p>
              <p>
                <strong>Destinatarios:</strong> Sus datos no se cederán a terceros salvo obligación legal.
              </p>
              <p>
                <strong>Derechos:</strong> Puedes ejercitar tus derechos de acceso, rectificación y supresión contactando directamente con la propiedad.
              </p>
            </div>
            <button
              onClick={() => setShowPrivacyPolicyModal(false)}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
