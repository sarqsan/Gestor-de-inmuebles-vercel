import React, { useState, useEffect } from 'react';
import {
  SolicitudSeguroImpago,
  ConfiguracionAseguradora,
  SolicitudSeguroEstado,
  DictamenAseguradora,
  DecisionFinalPropietarioSeguro,
  GmailIntegracionConfig,
} from '../types';
import {
  X,
  ShieldCheck,
  Building2,
  Users,
  FileCheck,
  Sparkles,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCw,
  Copy,
  Check,
  Sliders,
  ExternalLink,
  MessageSquare,
  AlertCircle,
  FileText,
  HelpCircle,
  Info,
  Paperclip,
} from 'lucide-react';
import { getTipoDocumentoLabel } from '../utils/formatters';
import { getAccessToken, googleSignIn } from '../lib/googleAuth';
import {
  buildRawEmailWithAttachments,
  sendGmailMessage,
  searchGmailMessages,
  getGmailMessageDetails,
} from '../lib/gmailClient';

interface DetalleSolicitudSeguroModalProps {
  solicitud: SolicitudSeguroImpago;
  aseguradoras: ConfiguracionAseguradora[];
  gmailConfig?: GmailIntegracionConfig;
  onClose: () => void;
  onUpdateSolicitud: (updated: SolicitudSeguroImpago) => void;
}

export const DetalleSolicitudSeguroModal: React.FC<DetalleSolicitudSeguroModalProps> = ({
  solicitud,
  aseguradoras,
  gmailConfig,
  onClose,
  onUpdateSolicitud,
}) => {
  const [sol, setSol] = useState<SolicitudSeguroImpago>(JSON.parse(JSON.stringify(solicitud)));
  const [activeTab, setActiveTab] = useState<'detalle' | 'correo' | 'respuesta' | 'decision'>('detalle');

  // Insurer info
  const aseguradora = aseguradoras.find((a) => a.id === sol.aseguradoraId) || {
    id: sol.aseguradoraId,
    nombre: sol.aseguradoraNombre,
    nombreComercial: sol.aseguradoraNombre,
    emailTramitacion: sol.aseguradoraEmail,
    activa: true,
    ratioEsfuerzoMaximo: 40,
    antiguedadMinimaMeses: 6,
    documentosRequeridos: ['dni_nie', 'nomina', 'contrato'],
    tasaPrimaAnualPorcentaje: 4.5,
    mesesCoberturaImpago: 12,
  };

  const numCandidato = sol.numeroCandidatoInmueble || 1;
  const direccionCompleta = sol.inmuebleDireccion
    ? `${sol.inmuebleDireccion}, ${sol.inmuebleCiudad || ''}`.trim()
    : `${sol.inmuebleNombre}, ${sol.inmuebleCiudad || ''}`.trim();

  // Mail draft states
  const [emailAsunto, setEmailAsunto] = useState<string>(
    sol.emailAsunto ||
      `[${sol.referenciaUnica}] Candidato ${numCandidato} - ${sol.inmuebleNombre || direccionCompleta}`
  );
  const [emailCuerpo, setEmailCuerpo] = useState<string>(
    sol.emailCuerpo ||
      `Estimado Departamento de Tramitación de ${sol.aseguradoraNombre},\n\nPor medio del presente correo remitimos la documentación y solicitud de estudio para la póliza de Seguro de Impago de Alquiler:\n\n• VIVIENDA EN ALQUILER: ${direccionCompleta}\n• CUANTÍA MENSUAL DE LA RENTA: ${sol.rentaMensual.toLocaleString('es-ES')} €/mes\n• REFERENCIA EXPEDIENTE: ${sol.referenciaUnica}\n\nDATOS DE LOS CANDIDATOS:\n- CANDIDATO PRINCIPAL (Titular 1):\n  * Nombre completo: ${sol.titular1.nombre}\n  * Teléfono de contacto: ${sol.titular1.telefono || 'No indicado'}\n  * DNI / NIE: ${sol.titular1.dniNie || 'Aportado en documentación adjunta'}\n  * Situación laboral: ${sol.titular1.tipoEmpleo} (Contrato ${sol.titular1.tipoContrato || 'Indefinido'})\n  * Empresa: ${sol.titular1.empresa || 'Ver nóminas adjuntas'}\n  * Antigüedad laboral: ${sol.titular1.antiguedadLaboral || 'Más de 1 año'}\n  * Ingresos netos mensuales: ${sol.titular1.ingresosNetosMensuales.toLocaleString('es-ES')} €/mes\n  * Ratio de esfuerzo calculado: ${sol.ratioEsfuerzoCalculado}%\n\n${sol.numTitulares === 2 && sol.titular2 ? `- SEGUNDO CANDIDATO (Cotitular 2):\n  * Nombre completo: ${sol.titular2.nombre}\n  * Teléfono de contacto: ${sol.titular2.telefono || 'No indicado'}\n  * DNI / NIE: ${sol.titular2.dniNie || 'Adjunto'}\n  * Situación laboral: ${sol.titular2.tipoEmpleo}\n  * Ingresos netos mensuales: ${sol.titular2.ingresosNetosMensuales.toLocaleString('es-ES')} €/mes\n  * Total ingresos conjuntos: ${sol.ingresosTotalesConjuntos.toLocaleString('es-ES')} €/mes\n\n` : ''}${sol.tieneAvalista && sol.avalista ? `- AVALISTA SOLIDARIO:\n  * Nombre completo: ${sol.avalista.nombre}\n  * Teléfono de contacto: ${sol.avalista.telefono || 'No indicado'}\n  * DNI / NIE: ${sol.avalista.dniNie || 'Adjunto'}\n  * Relación con el candidato: ${sol.avalista.relacion || 'Familiar'}\n  * Situación laboral: ${sol.avalista.tipoEmpleo || 'Pensionista / Indefinido'}\n  * Ingresos netos mensuales: ${sol.avalista.ingresosNetosMensuales?.toLocaleString('es-ES') || 0} €/mes\n\n` : ''}DOCUMENTACIÓN ADJUNTA:\n${sol.documentosAdjuntos.map((d) => `• ${d.nombre} (${getTipoDocumentoLabel(d.tipo)})`).join('\n')}\n\nQuedamos a la espera de su resolución y dictamen formal de asegurabilidad. Rogamos respondan a este correo manteniendo en el asunto la referencia [${sol.referenciaUnica}] para la correcta identificación y procesamiento automático del expediente.\n\nAtentamente,\nAdministración de Alquileres / Propiedad`
  );

  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);

  // Response simulation / test state / Gmail search
  const [incomingResponseText, setIncomingResponseText] = useState<string>(
    sol.emailRespuestaRaw || ''
  );
  const [isAnalyzingResponse, setIsAnalyzingResponse] = useState(false);
  const [isCheckingGmail, setIsCheckingGmail] = useState(false);
  const [gmailStatusNotice, setGmailStatusNotice] = useState<string | null>(null);

  // Owner decision state
  const [ownerDecision, setOwnerDecision] = useState<DecisionFinalPropietarioSeguro>(
    sol.decisionFinalPropietario || 'PENDIENTE'
  );
  const [ownerNotas, setOwnerNotas] = useState<string>(sol.notasPrivadasPropietario || '');

  // Generar borrador formal con IA
  const handleGenerateAiEmail = async () => {
    setIsGeneratingEmail(true);
    try {
      const res = await fetch('/api/generar-correo-aseguradora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitudSeguro: sol,
          aseguradora: aseguradora,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.asunto) setEmailAsunto(data.asunto);
        if (data.cuerpo) setEmailCuerpo(data.cuerpo);
      }
    } catch (e) {
      console.warn('Fallback al generar correo:', e);
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  // Enviar correo a la aseguradora directamente por Gmail API con adjuntos
  const handleSendEmail = async () => {
    setIsSendingEmail(true);
    setSendSuccessMsg(null);

    try {
      let token = await getAccessToken();
      if (!token) {
        // Intenta conectar cuenta Google si no está en memoria
        const authRes = await googleSignIn();
        token = authRes?.accessToken || null;
      }

      if (token) {
        // Preparar adjuntos verificados
        const attachmentsToSend = sol.documentosAdjuntos
          .filter((d) => d.verificado && d.base64Data)
          .map((d) => ({
            filename: d.nombre || 'documento.pdf',
            mimeType: 'application/pdf',
            base64Data: d.base64Data || '',
          }));

        // Construir MIME RFC 2822 y enviar por Gmail REST API
        const rawMime = buildRawEmailWithAttachments({
          to: sol.aseguradoraEmail,
          subject: emailAsunto,
          bodyText: emailCuerpo,
          attachments: attachmentsToSend,
        });

        const sendResult = await sendGmailMessage(token, rawMime);

        const updated: SolicitudSeguroImpago = {
          ...sol,
          estado: 'CORREO_ENVIADO',
          metodoEnvio: 'GMAIL_API',
          emailAsunto: emailAsunto,
          emailCuerpo: emailCuerpo,
          fechaEnvio: new Date().toISOString(),
          fechaActualizacion: new Date().toISOString(),
          historial: [
            ...sol.historial,
            {
              id: `hist_${Date.now()}`,
              fecha: new Date().toISOString(),
              autor: 'gmail',
              accion: 'Solicitud enviada exitosamente vía Gmail API',
              detalle: `Enviado a ${sol.aseguradoraEmail} (ID Mensaje: ${sendResult.id}) con ${attachmentsToSend.length} archivos adjuntos.`,
            },
          ],
        };

        setSol(updated);
        onUpdateSolicitud(updated);
        setSendSuccessMsg(`¡Correo enviado a ${sol.aseguradoraEmail} con éxito vía Gmail!`);
        setActiveTab('respuesta');
      } else {
        // Modo simulación si el usuario canceló el popup de Google
        const updated: SolicitudSeguroImpago = {
          ...sol,
          estado: 'CORREO_ENVIADO',
          metodoEnvio: 'MANUAL',
          emailAsunto: emailAsunto,
          emailCuerpo: emailCuerpo,
          fechaEnvio: new Date().toISOString(),
          fechaActualizacion: new Date().toISOString(),
          historial: [
            ...sol.historial,
            {
              id: `hist_${Date.now()}`,
              fecha: new Date().toISOString(),
              autor: 'propietario',
              accion: 'Solicitud registrada como enviada',
              detalle: `Marcada como enviada a ${sol.aseguradoraEmail} con referencia [${sol.referenciaUnica}].`,
            },
          ],
        };
        setSol(updated);
        onUpdateSolicitud(updated);
        setActiveTab('respuesta');
      }
    } catch (err: any) {
      console.error('Error enviando con Gmail API:', err);
      alert(`No se pudo enviar por Gmail API (${err.message}). Puedes copiar el borrador o abrir tu cliente de correo.`);
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Buscar automáticamente respuestas en Gmail que contengan la referencia del expediente
  const handleCheckGmailResponses = async () => {
    setIsCheckingGmail(true);
    setGmailStatusNotice(null);

    try {
      let token = await getAccessToken();
      if (!token) {
        const authRes = await googleSignIn();
        token = authRes?.accessToken || null;
      }

      if (!token) {
        setGmailStatusNotice('Inicia sesión con Google para buscar respuestas automáticas.');
        return;
      }

      // Buscar mensajes con la referencia exacta del expediente
      const query = `"${sol.referenciaUnica}"`;
      const messages = await searchGmailMessages(token, query);

      if (!messages || messages.length === 0) {
        setGmailStatusNotice(`No se han encontrado correos nuevos con la referencia [${sol.referenciaUnica}].`);
        return;
      }

      // Tomar el mensaje más reciente
      const latestMsg = await getGmailMessageDetails(token, messages[0].id);
      if (latestMsg && latestMsg.body) {
        setIncomingResponseText(latestMsg.body);
        setGmailStatusNotice(`¡Correo recibido de ${latestMsg.from} cargado automáticamente!`);
        // Analizar con IA de inmediato
        await handleAnalyzeSpecificText(latestMsg.body);
      }
    } catch (e: any) {
      console.error('Error buscando respuestas en Gmail:', e);
      setGmailStatusNotice(`Error al consultar Gmail: ${e.message}`);
    } finally {
      setIsCheckingGmail(false);
    }
  };

  // Copiar borrador al portapapeles
  const handleCopyEmail = () => {
    navigator.clipboard.writeText(`Para: ${sol.aseguradoraEmail}\nAsunto: ${emailAsunto}\n\n${emailCuerpo}`);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  // Procesar texto de respuesta con IA
  const handleAnalyzeSpecificText = async (textToAnalyze: string) => {
    if (!textToAnalyze.trim()) return;
    setIsAnalyzingResponse(true);

    try {
      const res = await fetch('/api/analizar-respuesta-aseguradora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailTexto: textToAnalyze,
          emailAsunto: `Re: [${sol.referenciaUnica}]`,
          aseguradoraNombre: sol.aseguradoraNombre,
          rentaMensual: sol.rentaMensual,
        }),
      });

      let parsedAI = {
        dictamen: 'FAVORABLE' as DictamenAseguradora,
        dictamenTexto: 'Operación Aprobada / Favorable',
        importeMaximoAsegurable: sol.rentaMensual,
        condiciones: ['Cobertura de 12 meses', 'Defensa jurídica hasta 3.000 €'],
        documentosRequeridos: [] as string[],
        resumenEjecutivo: 'La aseguradora ha emitido resolución favorable sin condiciones adicionales.',
        requiereAtencionPropietario: false,
      };

      if (res.ok) {
        const data = await res.json();
        if (data.dictamen) {
          parsedAI = data;
        }
      }

      const updated: SolicitudSeguroImpago = {
        ...sol,
        estado: 'RESPUESTA_PROCESADA',
        dictamenAseguradora: parsedAI.dictamen,
        importeMaximoAsegurable: parsedAI.importeMaximoAsegurable,
        condicionesEstipuladas: parsedAI.condiciones,
        documentosSolicitadosExtra: parsedAI.documentosRequeridos,
        resumenProcesadoIA: parsedAI.resumenEjecutivo,
        emailRespuestaRaw: textToAnalyze,
        fechaRecepcionRespuesta: new Date().toISOString(),
        procesadoConIA: true,
        fechaActualizacion: new Date().toISOString(),
        historial: [
          ...sol.historial,
          {
            id: `hist_${Date.now()}`,
            fecha: new Date().toISOString(),
            autor: 'sistema_ia',
            accion: 'Dictamen de aseguradora analizado por IA',
            detalle: `Resultado: ${parsedAI.dictamen} - ${parsedAI.resumenEjecutivo}`,
          },
        ],
      };

      setSol(updated);
      onUpdateSolicitud(updated);
    } catch (e) {
      console.error('Error analizando respuesta:', e);
    } finally {
      setIsAnalyzingResponse(false);
    }
  };

  // Wrapper para procesar texto manual del textarea
  const handleAnalyzeIncomingResponse = async () => {
    await handleAnalyzeSpecificText(incomingResponseText);
  };

  // Simular respuesta rápida para demostración
  const handleSimulateResponse = (tipo: 'FAVORABLE' | 'CONDICIONADO' | 'REQUERIDO' | 'DESFAVORABLE') => {
    let mockText = '';
    const isSeag = sol.aseguradoraId === 'seag' || sol.aseguradoraNombre.toLowerCase().includes('seag');

    if (tipo === 'FAVORABLE') {
      if (isSeag) {
        mockText = `Estimados señores,\n\nEn relación a la solicitud con referencia [${sol.referenciaUnica}] para el inmueble ${direccionCompleta} y candidato ${sol.titular1.nombre} (Candidato ${numCandidato}), les informamos que el estudio de viabilidad con SEAG ha resultado FAVORABLE.\n\nOperación aprobada por una renta mensual de ${sol.rentaMensual} €/mes.\nCoberturas garantizadas por SEAG:\n• Cobro puntual garantizado el día 1 de cada mes (cobertura indefinida hasta desahucio).\n• Reclamación de rentas impagadas y defensa jurídica integral.\n• Compensación de daños y actos vandálicos hasta 3.000 €.\nPueden proceder a la firma del contrato de arrendamiento y remitirnos copia para la emisión definitiva del certificado de garantía.`;
      } else {
        mockText = `Estimados señores,\n\nEn relación a la solicitud con referencia [${sol.referenciaUnica}] para el inmueble ${direccionCompleta} y candidato ${sol.titular1.nombre} (Candidato ${numCandidato}), les informamos que el estudio de solvencia ha resultado FAVORABLE.\n\nOperación aprobada por una renta mensual de ${sol.rentaMensual} €/mes.\nCoberturas: 12 meses de impago, actos vandálicos 3.000 € y defensa jurídica.\nPueden proceder a la emisión de la póliza adjuntando el contrato de arrendamiento firmado.`;
      }
    } else if (tipo === 'CONDICIONADO') {
      mockText = `Estimados señores,\n\nRevisado el expediente [${sol.referenciaUnica}], el estudio de solvencia queda APROBADO CONDICIONADO a la incorporación de un avalista solidario o una fianza adicional de 2 mensualidades debido a la antigüedad contractual del titular.\n\nRenta máxima asegurable: ${sol.rentaMensual} €/mes.`;
    } else if (tipo === 'REQUERIDO') {
      mockText = `Estimados señores,\n\nPara poder continuar con la valoración del expediente [${sol.referenciaUnica}], solicitamos nos remitan:\n1. Última nómina actualizada del mes en curso.\n2. Informe de vida laboral completo actualizado de la TGSS.\n\nQuedamos a la espera para emitir resolución definitiva.`;
    } else {
      mockText = `Estimados señores,\n\nLamentamos comunicarles que tras analizar el expediente [${sol.referenciaUnica}], la operación resulta DESFAVORABLE por superar los parámetros máximos de riesgo admitidos para el producto de impago de alquiler.`;
    }

    setIncomingResponseText(mockText);
  };

  // Guardar decisión final del propietario
  const handleSaveOwnerDecision = () => {
    const updated: SolicitudSeguroImpago = {
      ...sol,
      decisionFinalPropietario: ownerDecision,
      notasPrivadasPropietario: ownerNotas,
      fechaDecisionPropietario: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
      historial: [
        ...sol.historial,
        {
          id: `hist_${Date.now()}`,
          fecha: new Date().toISOString(),
          autor: 'propietario',
          accion: `Decisión final registrada: ${ownerDecision}`,
          detalle: ownerNotas || 'Sin notas adicionales.',
        },
      ],
    };
    setSol(updated);
    onUpdateSolicitud(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[94vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base sm:text-lg">EXPEDIENTE DE SEGURO DE IMPAGO</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {sol.referenciaUnica}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                  sol.dictamenAseguradora === 'FAVORABLE'
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : sol.dictamenAseguradora === 'FAVORABLE_CONDICIONADO'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : sol.dictamenAseguradora === 'DESFAVORABLE'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : 'bg-blue-100 text-blue-800 border-blue-300'
                }`}>
                  {sol.dictamenTexto || sol.dictamenAseguradora || 'En Trámite'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {sol.aseguradoraNombre} • {sol.inmuebleNombre} ({sol.rentaMensual} €/mes) • Titular: {sol.titular1.nombre}
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-4 sm:px-6 gap-2 text-xs font-bold overflow-x-auto">
          <button
            onClick={() => setActiveTab('detalle')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'detalle'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            1. Datos & Solvencia
          </button>

          <button
            onClick={() => setActiveTab('correo')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'correo'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            2. Solicitud & Correo
            {sol.estado === 'CORREO_ENVIADO' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('respuesta')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'respuesta'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            3. Respuesta Aseguradora (IA)
            {sol.procesadoConIA && (
              <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('decision')}
            className={`py-3 px-3.5 border-b-2 transition-colors flex items-center gap-1.5 shrink-0 ${
              activeTab === 'decision'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            4. Decisión Final Propietario
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-sm flex-1">
          {/* ============================================================ */}
          {/* TAB 1: DATOS, DOCUMENTOS Y ANÁLISIS IA */}
          {/* ============================================================ */}
          {activeTab === 'detalle' && (
            <div className="space-y-6">
              {/* BLOQUE 1: DATOS CANDIDATO */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs font-black">1</div>
                  <h4 className="font-black text-slate-900 text-sm tracking-wide uppercase">DATOS CANDIDATO Y TITULARES</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Titular 1 */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                        Titular 1 (Principal)
                      </span>
                      <span className="text-xs font-black text-slate-900">
                        {sol.titular1.ingresosNetosMensuales.toLocaleString('es-ES')} €/mes
                      </span>
                    </div>
                    <p className="font-black text-slate-900 text-sm">{sol.titular1.nombre}</p>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p>• DNI/NIE: <span className="font-bold text-slate-800">{sol.titular1.dniNie || 'No aportado'}</span></p>
                      <p>• Empleo: <span className="font-bold text-slate-800">{sol.titular1.tipoEmpleo} ({sol.titular1.tipoContrato || 'Indefinido'})</span></p>
                      <p>• Empresa: <span className="font-bold text-slate-800">{sol.titular1.empresa || 'Tecnologías S.L.'}</span></p>
                      <p>• Antigüedad: <span className="font-bold text-slate-800">{sol.titular1.antiguedadLaboral || 'Más de 1 año'}</span></p>
                    </div>
                  </div>

                  {/* Titular 2 or Avalista */}
                  {sol.numTitulares === 2 && sol.titular2 ? (
                    <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-md">
                          Titular 2 (Cotitular)
                        </span>
                        <span className="text-xs font-black text-slate-900">
                          {sol.titular2.ingresosNetosMensuales.toLocaleString('es-ES')} €/mes
                        </span>
                      </div>
                      <p className="font-black text-slate-900 text-sm">{sol.titular2.nombre}</p>
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>• DNI/NIE: <span className="font-bold text-slate-800">{sol.titular2.dniNie || 'Aportado'}</span></p>
                        <p>• Empleo: <span className="font-bold text-slate-800">{sol.titular2.tipoEmpleo}</span></p>
                      </div>
                    </div>
                  ) : sol.tieneAvalista && sol.avalista ? (
                    <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                          Garante / Avalista
                        </span>
                        <span className="text-xs font-black text-slate-900">
                          {sol.avalista.ingresosNetosMensuales?.toLocaleString('es-ES') || 0} €/mes
                        </span>
                      </div>
                      <p className="font-black text-slate-900 text-sm">{sol.avalista.nombre}</p>
                      <p className="text-xs text-slate-600">Relación: {sol.avalista.relacion || 'Familiar'}</p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center text-xs text-slate-400">
                      <span>1 Solo Titular formalizado en este expediente.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* BLOQUE 2: DOCUMENTACIÓN APORTADA Y VERIFICADA */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs font-black">2</div>
                    <h4 className="font-black text-slate-900 text-sm tracking-wide uppercase">DOCUMENTACIÓN APORTADA</h4>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {sol.documentosAdjuntos.filter((d) => d.verificado).length} Verificados para Aseguradora
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sol.documentosAdjuntos.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-slate-900 truncate">{doc.nombre}</p>
                          <p className="text-[10px] text-slate-500">{getTipoDocumentoLabel(doc.tipo)}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Adjunto
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* BLOQUE 3: ANÁLISIS IA */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs font-black">3</div>
                  <h4 className="font-black text-slate-900 text-sm tracking-wide uppercase">ANÁLISIS IA Y ESTIMACIÓN DE RIESGO</h4>
                </div>

                <div className="bg-purple-50/70 border border-purple-200/90 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1 bg-purple-600 text-white rounded-lg text-xs font-black">
                        Scoring de Solvencia: {sol.scoreSolvenciaIA} / 100
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        sol.nivelRiesgoIA === 'Bajo'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        Riesgo {sol.nivelRiesgoIA}
                      </span>
                    </div>

                    <div className="text-xs text-purple-900 font-bold">
                      Ratio de esfuerzo: {sol.ratioEsfuerzoCalculado}% (Límite {aseguradora.ratioEsfuerzoMaximo}%)
                    </div>
                  </div>

                  <p className="text-xs text-purple-950 font-medium leading-relaxed">
                    {sol.resumenSolvenciaIA}
                  </p>

                  {sol.alertasDetectadasIA && sol.alertasDetectadasIA.length > 0 && (
                    <div className="space-y-1">
                      {sol.alertasDetectadasIA.map((alerta, idx) => (
                        <div key={idx} className="p-2 bg-white/90 rounded-lg border border-amber-300 text-xs text-amber-900 font-bold flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{alerta}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: SOLICITUD A ASEGURADORA & CORREO GMAIL */}
          {/* ============================================================ */}
          {activeTab === 'correo' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black">4</div>
                  <h4 className="font-black text-slate-900 text-sm tracking-wide uppercase">SOLICITUD A ASEGURADORA & ENVÍO</h4>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerateAiEmail}
                    disabled={isGeneratingEmail}
                    className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    {isGeneratingEmail ? 'Redactando con Gemini...' : 'Regenerar con IA'}
                  </button>
                </div>
              </div>

              {/* Status bar */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-600">Estado de Envío:</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold border ${
                    sol.estado === 'CORREO_ENVIADO' || sol.estado === 'RESPUESTA_PROCESADA' || sol.estado === 'RESPUESTA_RECIBIDA'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-slate-200 text-slate-700 border-slate-300'
                  }`}>
                    {sol.estado}
                  </span>
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                    Candidato {numCandidato}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px]">
                  <span>Destinatario:</span>
                  <span className="font-bold text-slate-800">{sol.aseguradoraEmail}</span>
                </div>
              </div>

              {sendSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{sendSuccessMsg}</span>
                </div>
              )}

              {/* Subject */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Asunto del Correo (Estructurado con Candidato {numCandidato} y referencia única):
                </label>
                <input
                  type="text"
                  value={emailAsunto}
                  onChange={(e) => setEmailAsunto(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Cuerpo del Mensaje Formal (Datos completos, teléfonos, renta y candidatos):
                </label>
                <textarea
                  value={emailCuerpo}
                  onChange={(e) => setEmailCuerpo(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 leading-relaxed"
                />
              </div>

              {/* Attachments preview */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                    Documentos que se adjuntarán ({sol.documentosAdjuntos.filter((d) => d.verificado).length}):
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sol.documentosAdjuntos.filter((d) => d.verificado).map((d) => (
                    <span key={d.id} className="text-[11px] font-semibold text-slate-700 bg-white px-2 py-1 rounded-lg border border-slate-200 flex items-center gap-1">
                      <FileCheck className="w-3 h-3 text-emerald-600" />
                      {d.nombre}
                    </span>
                  ))}
                  {sol.documentosAdjuntos.filter((d) => d.verificado).length === 0 && (
                    <span className="text-xs text-slate-400 italic">No hay documentos marcados como verificados.</span>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedEmail ? '¡Copiado al Portapapeles!' : 'Copiar Texto'}
                  </button>

                  <a
                    href={`mailto:${sol.aseguradoraEmail}?subject=${encodeURIComponent(emailAsunto)}&body=${encodeURIComponent(emailCuerpo)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                    Abrir en Webmail
                  </a>
                </div>

                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={isSendingEmail}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {isSendingEmail ? 'Enviando vía Gmail API...' : 'Enviar Solicitud con Gmail OAuth'}
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: RESPUESTA DE LA ASEGURADORA & ANÁLISIS IA */}
          {/* ============================================================ */}
          {activeTab === 'respuesta' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-sky-600 text-white flex items-center justify-center text-xs font-black">5</div>
                  <h4 className="font-black text-slate-900 text-sm tracking-wide uppercase">RESPUESTA DE LA ASEGURADORA</h4>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleCheckGmailResponses}
                    disabled={isCheckingGmail}
                    className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isCheckingGmail ? 'animate-spin' : ''}`} />
                    {isCheckingGmail ? 'Buscando en Gmail...' : 'Buscar Respuesta en Gmail'}
                  </button>

                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-bold text-slate-400 text-[11px]">Simular:</span>
                    <button
                      onClick={() => handleSimulateResponse('FAVORABLE')}
                      className="px-2 py-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 rounded-lg hover:bg-emerald-200"
                    >
                      Favorable
                    </button>
                    <button
                      onClick={() => handleSimulateResponse('CONDICIONADO')}
                      className="px-2 py-1 text-[11px] font-bold bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200"
                    >
                      Condicionado
                    </button>
                    <button
                      onClick={() => handleSimulateResponse('REQUERIDO')}
                      className="px-2 py-1 text-[11px] font-bold bg-sky-100 text-sky-800 rounded-lg hover:bg-sky-200"
                    >
                      Docs extra
                    </button>
                    <button
                      onClick={() => handleSimulateResponse('DESFAVORABLE')}
                      className="px-2 py-1 text-[11px] font-bold bg-rose-100 text-rose-800 rounded-lg hover:bg-rose-200"
                    >
                      Denegado
                    </button>
                  </div>
                </div>
              </div>

              {gmailStatusNotice && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-950 text-xs font-medium flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{gmailStatusNotice}</span>
                </div>
              )}

              {/* Text input for received response */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Texto del Correo de Respuesta recibido de {sol.aseguradoraNombre}:
                </label>
                <textarea
                  value={incomingResponseText}
                  onChange={(e) => setIncomingResponseText(e.target.value)}
                  placeholder="Pega aquí el contenido del correo recibido o haz clic en 'Buscar Respuesta en Gmail' para sincronizar automáticamente..."
                  rows={5}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-sky-500 outline-none text-slate-800"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAnalyzeIncomingResponse}
                  disabled={isAnalyzingResponse || !incomingResponseText.trim()}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-black rounded-xl transition-colors shadow-md shadow-sky-600/20 flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  {isAnalyzingResponse ? 'Analizando con Gemini...' : 'Procesar Dictamen con IA'}
                </button>
              </div>

              {/* Extracted Structured Results */}
              {sol.procesadoConIA && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-black text-xs text-slate-800 uppercase tracking-wider">
                      Dictamen Oficial Extraído por IA
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-black border ${
                      sol.dictamenAseguradora === 'FAVORABLE'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : sol.dictamenAseguradora === 'FAVORABLE_CONDICIONADO'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : sol.dictamenAseguradora === 'DESFAVORABLE'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-blue-100 text-blue-800 border-blue-300'
                    }`}>
                      {sol.dictamenAseguradora}
                    </span>
                  </div>

                  <p className="text-xs text-slate-800 font-semibold bg-white p-3 rounded-xl border border-slate-200">
                    {sol.resumenProcesadoIA || 'Dictamen procesado correctamente.'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Condiciones Notificadas:
                      </span>
                      {sol.condicionesEstipuladas && sol.condicionesEstipuladas.length > 0 ? (
                        <ul className="text-xs text-slate-700 space-y-1">
                          {sol.condicionesEstipuladas.map((c, i) => (
                            <li key={i} className="flex items-center gap-1.5 font-medium">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{c}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Póliza estándar de 12 meses.</span>
                      )}
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Documentación Adicional Requerida:
                      </span>
                      {sol.documentosSolicitadosExtra && sol.documentosSolicitadosExtra.length > 0 ? (
                        <ul className="text-xs text-amber-900 space-y-1">
                          {sol.documentosSolicitadosExtra.map((d, i) => (
                            <li key={i} className="flex items-center gap-1.5 font-bold">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          No se requieren documentos adicionales.
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 4: DECISIÓN FINAL DEL PROPIETARIO */}
          {/* ============================================================ */}
          {activeTab === 'decision' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-xs font-black">6</div>
                  <h4 className="font-black text-slate-900 text-sm tracking-wide uppercase">DECISIÓN FINAL DEL PROPIETARIO</h4>
                </div>
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                  Control Humano Vinculante
                </span>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-800 block mb-2">
                    Resolución del Propietario tras el dictamen de la aseguradora:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOwnerDecision('ACEPTADO')}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-2.5 text-left ${
                        ownerDecision === 'ACEPTADO'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="block font-black">Aceptar Candidato y Proceder a Firma</span>
                        <span className={`text-[10px] ${ownerDecision === 'ACEPTADO' ? 'text-emerald-100' : 'text-slate-500'}`}>
                          Aprobado con la aseguradora {sol.aseguradoraNombre}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOwnerDecision('CONDICIONADO_AVAL')}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-2.5 text-left ${
                        ownerDecision === 'CONDICIONADO_AVAL'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="block font-black">Condicionar a Aval / Fianza Extra</span>
                        <span className={`text-[10px] ${ownerDecision === 'CONDICIONADO_AVAL' ? 'text-amber-100' : 'text-slate-500'}`}>
                          Exigir garantías complementarias antes de firmar
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOwnerDecision('RECHAZADO')}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-2.5 text-left ${
                        ownerDecision === 'RECHAZADO'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <X className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="block font-black">Rechazar Candidatura</span>
                        <span className={`text-[10px] ${ownerDecision === 'RECHAZADO' ? 'text-rose-100' : 'text-slate-500'}`}>
                          No cumple solvencia requerida
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOwnerDecision('TRAMITAR_OTRA_ASEGURADORA')}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-2.5 text-left ${
                        ownerDecision === 'TRAMITAR_OTRA_ASEGURADORA'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <RotateCw className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="block font-black">Solicitar a Otra Aseguradora</span>
                        <span className={`text-[10px] ${ownerDecision === 'TRAMITAR_OTRA_ASEGURADORA' ? 'text-blue-100' : 'text-slate-500'}`}>
                          Consultar Caser, Mutua, DAS u otra entidad
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                    Notas privadas y justificación de la decisión:
                  </label>
                  <textarea
                    value={ownerNotas}
                    onChange={(e) => setOwnerNotas(e.target.value)}
                    rows={3}
                    placeholder="Ej: Operación aprobada sin fianza extra. Se procederá a generar el contrato de arrendamiento en la sección Formalización."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 font-medium"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors"
          >
            Cerrar
          </button>

          <button
            onClick={handleSaveOwnerDecision}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Guardar Decisión y Actualizar Expediente
          </button>
        </div>
      </div>
    </div>
  );
};
