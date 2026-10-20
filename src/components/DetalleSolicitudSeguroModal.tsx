import React, { useState, useEffect } from 'react';
import {
  SolicitudSeguroImpago,
  ConfiguracionAseguradora,
  DecisionFinalPropietarioSeguro,
  DictamenAseguradora,
  GmailIntegracionConfig,
} from '../types';
import {
  X,
  ShieldCheck,
  Building2,
  FileCheck,
  Sparkles,
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Copy,
  Check,
  Sliders,
  ExternalLink,
  MessageSquare,
  AlertCircle,
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
  GmailApiError,
} from '../lib/gmailClient';
import { avisarOperacion } from '../feedback/canalFeedback';
import { useDialogoAccesible } from '../accesibilidad/dialogo';
import { solicitarIA } from '../lib/clienteIA';
import { esAnalisisRespuestaAseguradoraValido } from '../ia/analisisRespuestaAseguradora';

function esResultadoEnvioGmailVerificable(
  resultado: unknown,
): resultado is { id: string; threadId: string } {
  if (typeof resultado !== 'object' || resultado === null || Array.isArray(resultado)) return false;
  const mensaje = resultado as Record<string, unknown>;
  return (
    typeof mensaje.id === 'string' && mensaje.id.trim().length > 0 &&
    typeof mensaje.threadId === 'string' && mensaje.threadId.trim().length > 0
  );
}

interface DetalleSolicitudSeguroModalProps {
  solicitud: SolicitudSeguroImpago;
  aseguradoras: ConfiguracionAseguradora[];
  gmailConfig?: GmailIntegracionConfig;
  onClose: () => void;
  onUpdateSolicitud: (updated: SolicitudSeguroImpago) => void | boolean | Promise<void | boolean>;
}

export const DetalleSolicitudSeguroModal: React.FC<DetalleSolicitudSeguroModalProps> = ({
  solicitud,
  aseguradoras,
  gmailConfig,
  onClose,
  onUpdateSolicitud,
}) => {
  const { refDialogo, propsDialogo } = useDialogoAccesible(
    { abierto: true, onCerrar: onClose },
    'EXPEDIENTE DE SEGURO DE IMPAGO'
  );
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
  const tieneConfirmacionGmailVerificable =
    typeof sol.confirmacionGmail?.id === 'string' && sol.confirmacionGmail.id.trim().length > 0 &&
    typeof sol.confirmacionGmail?.threadId === 'string' && sol.confirmacionGmail.threadId.trim().length > 0;
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
  const [emailGenerationNotice, setEmailGenerationNotice] = useState<string | null>(null);
  const [emailGenerationError, setEmailGenerationError] = useState<string | null>(null);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [sendErrorMsg, setSendErrorMsg] = useState<string | null>(null);

  // Incoming response and Gmail search

  const [incomingResponseText, setIncomingResponseText] = useState<string>(
    sol.emailRespuestaRaw || ''
  );
  const [isAnalyzingResponse, setIsAnalyzingResponse] = useState(false);
  const [isCheckingGmail, setIsCheckingGmail] = useState(false);
  const [gmailStatusNotice, setGmailStatusNotice] = useState<string | null>(null);
  const [responseProcessingError, setResponseProcessingError] = useState<string | null>(null);
  const [dictamenManual, setDictamenManual] = useState<DictamenAseguradora>(
    solicitud.dictamenAseguradoraVerificadoManualmente ? solicitud.dictamenAseguradora : 'EN_ESTUDIO'
  );
  const [fuenteOriginalContrastada, setFuenteOriginalContrastada] = useState(false);
  const [dictamenVerificacionNotice, setDictamenVerificacionNotice] = useState<string | null>(null);
  const [dictamenVerificacionError, setDictamenVerificacionError] = useState<string | null>(null);

  // Owner decision state
  const [ownerDecision, setOwnerDecision] = useState<DecisionFinalPropietarioSeguro>(
    sol.decisionFinalPropietario || 'PENDIENTE'
  );
  const [ownerNotas, setOwnerNotas] = useState<string>(sol.notasPrivadasPropietario || '');
  const [ownerDecisionError, setOwnerDecisionError] = useState<string | null>(null);

  const persistirSolicitud = async (actualizada: SolicitudSeguroImpago): Promise<boolean> => {
    try {
      const resultado = await onUpdateSolicitud(actualizada);
      return resultado !== false;
    } catch {
      return false;
    }
  };

  // Generar borrador formal con IA; una plantilla local no sustituye ni sobreescribe el borrador visible.
  const handleGenerateAiEmail = async () => {
    setIsGeneratingEmail(true);
    setEmailGenerationNotice(null);
    setEmailGenerationError(null);
    try {
      const res = await solicitarIA('/api/generar-correo-aseguradora', {
        solicitudSeguro: sol,
        aseguradora,
      });
      if (!res.ok) throw new Error('HTTP_NO_OK');

      const datos: unknown = await res.json();
      if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) {
        throw new Error('RESPUESTA_INVALIDA');
      }
      const borrador = datos as Record<string, unknown>;
      if (borrador.origenBorrador === 'PLANTILLA_LOCAL') {
        setEmailGenerationNotice(
          'La IA no generó un borrador. Se conserva el texto actual; la plantilla local recibida no se aplicó para no sobrescribirlo.'
        );
        return;
      }
      if (
        borrador.origenBorrador !== 'IA' ||
        typeof borrador.asunto !== 'string' || !borrador.asunto.trim() ||
        typeof borrador.cuerpo !== 'string' || !borrador.cuerpo.trim()
      ) {
        throw new Error('RESPUESTA_INVALIDA');
      }

      setEmailAsunto(borrador.asunto);
      setEmailCuerpo(borrador.cuerpo);
      setEmailGenerationNotice(
        'Borrador propuesto por IA. Revísalo antes de enviarlo; no es una respuesta ni un dictamen de la aseguradora.'
      );
    } catch {
      console.warn('No se pudo generar el borrador IA:', { codigo: 'BORRADOR_IA_NO_VALIDO' });
      setEmailGenerationError('No se pudo generar un borrador válido con IA. El asunto y el texto actuales se han conservado.');
    } finally {
      setIsGeneratingEmail(false);
    }
  };

  // Enviar correo a la aseguradora directamente por Gmail API con adjuntos
  const handleSendEmail = async () => {
    if (isSendingEmail || !['BORRADOR', 'ERROR_ENVIO'].includes(sol.estado)) return;

    setIsSendingEmail(true);
    setSendSuccessMsg(null);
    setSendErrorMsg(null);
    let solicitudGmailIniciada = false;
    let envioConfirmado = false;
    let registroConfirmado: SolicitudSeguroImpago | null = null;

    try {
      let token = (await getAccessToken())?.trim() || null;
      if (!token) {
        // Un fallo/cancelación OAuth ocurre antes de iniciar una petición de envío.
        const authRes = await googleSignIn();
        token = authRes?.accessToken?.trim() || null;
      }
      if (!token) throw new Error('TOKEN_NO_DISPONIBLE');

      const attachmentsToSend = sol.documentosAdjuntos
        .filter((d) => d.verificado && d.base64Data)
        .map((d) => ({
          filename: d.nombre || 'documento.pdf',
          mimeType: 'application/pdf',
          base64Data: d.base64Data || '',
        }));

      const rawMime = buildRawEmailWithAttachments({
        to: sol.aseguradoraEmail,
        subject: emailAsunto,
        bodyText: emailCuerpo,
        attachments: attachmentsToSend,
      });

      // Desde este punto cualquier error de transporte puede tener resultado incierto.
      solicitudGmailIniciada = true;
      const sendResult: unknown = await sendGmailMessage(token, rawMime);
      if (!esResultadoEnvioGmailVerificable(sendResult)) {
        throw new GmailApiError(null, 'INCIERTO');
      }
      envioConfirmado = true;

      const ahora = new Date().toISOString();
      const updated: SolicitudSeguroImpago = {
        ...sol,
        estado: 'CORREO_ENVIADO',
        metodoEnvio: 'GMAIL_API',
        confirmacionGmail: {
          id: sendResult.id,
          threadId: sendResult.threadId,
          fechaConfirmacion: ahora,
        },
        emailAsunto,
        emailCuerpo,
        fechaEnvio: ahora,
        fechaActualizacion: ahora,
        historial: [
          ...sol.historial,
          {
            id: `hist_${Date.now()}`,
            fecha: ahora,
            autor: 'gmail',
            accion: 'Gmail confirmó la aceptación de la solicitud de envío',
            detalle: `Destinatario: ${sol.aseguradoraEmail}; ID de mensaje: ${sendResult.id}; ID de conversación: ${sendResult.threadId}; adjuntos: ${attachmentsToSend.length}. La respuesta de Gmail no acredita entrega ni lectura por el destinatario.`,
          },
        ],
      };
      registroConfirmado = updated;
      // La confirmación de Gmail bloquea nuevos envíos incluso si falla su persistencia.
      setSol(updated);

      if (!(await persistirSolicitud(updated))) {
        const mensaje = 'Gmail confirmó la aceptación del mensaje, pero no se pudo confirmar el guardado del expediente. No lo reenvíes; revisa la carpeta Enviados y el historial.';
        setSendErrorMsg(mensaje);
        avisarOperacion({ tipo: 'error', mensaje });
        return;
      }

      const avisoAceptacionGmail = `Gmail confirmó la aceptación del mensaje dirigido a ${sol.aseguradoraEmail}. Esto no confirma su entrega ni lectura.`;
      setSendSuccessMsg(avisoAceptacionGmail);
      setGmailStatusNotice(avisoAceptacionGmail);
      setActiveTab('respuesta');
    } catch (error: unknown) {
      if (envioConfirmado && registroConfirmado) {
        setSol(registroConfirmado);
        const mensaje = 'Gmail confirmó la aceptación del mensaje, pero ocurrió un error al guardar su estado. No lo reenvíes; revisa la carpeta Enviados y el historial.';
        console.warn('Envío Gmail confirmado; persistencia no confirmada.');
        setSendErrorMsg(mensaje);
        avisarOperacion({ tipo: 'error', mensaje });
      } else {
        const incierto = solicitudGmailIniciada && (
          !(error instanceof GmailApiError) || error.resultadoEnvio === 'INCIERTO'
        );
        const resultado = incierto ? 'ENVIO_INCIERTO' : 'ERROR_ENVIO';
        const ahora = new Date().toISOString();
        const statusHttp = error instanceof GmailApiError ? error.status : null;
        const detalle = incierto
          ? 'No se recibió una confirmación verificable. Gmail pudo aceptar el mensaje; revisar Enviados antes de cualquier reintento.'
          : solicitudGmailIniciada
            ? `Gmail rechazó la solicitud${statusHttp === null ? '' : ` (HTTP ${statusHttp})`}. No se registró como enviada.`
            : 'No se inició un envío confirmado (autorización o preparación fallida). Se conserva el borrador.';
        const actualizado: SolicitudSeguroImpago = {
          ...sol,
          estado: resultado,
          metodoEnvio: 'GMAIL_API',
          emailAsunto,
          emailCuerpo,
          fechaActualizacion: ahora,
          historial: [
            ...sol.historial,
            {
              id: `hist_${Date.now()}`,
              fecha: ahora,
              autor: 'gmail',
              accion: incierto ? 'Resultado de envío incierto; requiere revisión humana' : 'Intento de envío no confirmado',
              detalle,
            },
          ],
        };
        setSol(actualizado);
        const guardado = await persistirSolicitud(actualizado);
        const mensajeBase = incierto
          ? 'El resultado del envío es incierto: Gmail pudo haber aceptado el mensaje. Revisa Enviados y no vuelvas a enviarlo hasta comprobarlo.'
          : solicitudGmailIniciada
            ? `Gmail rechazó la solicitud${statusHttp === null ? '' : ` (HTTP ${statusHttp})`}. No se marcó como enviada; se conserva el borrador.`
            : 'No se pudo iniciar el envío por un problema de autorización o preparación. No se marcó como enviado y se conserva el borrador.';
        const mensaje = guardado
          ? mensajeBase
          : `${mensajeBase} Además, no se pudo guardar este estado en el expediente; mantén la revisión manual antes de cualquier reintento.`;
        console.warn('Envío Gmail no confirmado:', { resultado, status: statusHttp });
        setSendErrorMsg(mensaje);
        avisarOperacion({ tipo: 'error', mensaje });
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleAutorizarReintentoManual = async () => {
    if (sol.estado !== 'ENVIO_INCIERTO') return;
    const confirmado = window.confirm(
      'Confirma que has revisado la carpeta Enviados de Gmail y no aparece el mensaje. El siguiente intento puede duplicar un envío si esa comprobación no es correcta.'
    );
    if (!confirmado) return;

    const ahora = new Date().toISOString();
    const actualizado: SolicitudSeguroImpago = {
      ...sol,
      estado: 'BORRADOR',
      fechaActualizacion: ahora,
      historial: [
        ...sol.historial,
        {
          id: `hist_${Date.now()}`,
          fecha: ahora,
          autor: 'propietario',
          accion: 'Reintento manual autorizado tras revisar Gmail',
          detalle: 'La persona usuaria confirmó haber revisado la carpeta Enviados antes de habilitar un nuevo intento.',
        },
      ],
    };
    if (!(await persistirSolicitud(actualizado))) {
      const mensaje = 'No se pudo guardar la autorización manual. El expediente sigue bloqueado para evitar un posible duplicado.';
      setSendErrorMsg(mensaje);
      avisarOperacion({ tipo: 'error', mensaje });
      return;
    }
    setSol(actualizado);
    setSendErrorMsg(null);
    setSendSuccessMsg('Reintento habilitado por revisión humana. Comprueba el destinatario y el borrador antes de enviarlo.');
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
        setFuenteOriginalContrastada(false);
        setGmailStatusNotice(
          `Gmail encontró un mensaje cuyo remitente indica «${latestMsg.from || 'no identificado'}». La aplicación no verifica su autenticidad; contrasta el correo original antes de registrar un dictamen.`
        );
        // El resultado es solo un análisis del texto y nunca confirma un dictamen oficial.
        await handleAnalyzeSpecificText(latestMsg.body);
      }
    } catch (error: unknown) {
      const status = error instanceof GmailApiError ? error.status : null;
      console.warn('Consulta de respuestas en Gmail no completada:', { status });
      setGmailStatusNotice(
        status === null
          ? 'No se pudo consultar Gmail. Revisa la autorización y la conexión; no se ha registrado una respuesta nueva.'
          : `Gmail no permitió consultar la respuesta (HTTP ${status}). No se ha registrado una respuesta nueva.`
      );
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

  // Analizar texto de respuesta; la IA produce una clasificación orientativa, nunca un dictamen oficial.
  const handleAnalyzeSpecificText = async (textToAnalyze: string) => {
    if (!textToAnalyze.trim()) return;
    setIsAnalyzingResponse(true);
    setResponseProcessingError(null);
    const fuenteNueva = textToAnalyze !== sol.emailRespuestaRaw;
    let analisisValido = false;

    const cambiosFuenteNueva = fuenteNueva
      ? {
          analisisRespuestaIA: null,
          dictamenAseguradora: 'EN_ESTUDIO' as DictamenAseguradora,
          dictamenAseguradoraVerificadoManualmente: false,
          fechaVerificacionDictamenAseguradora: null,
        }
      : {};

    const registrarPendienteRevision = async () => {
      const ahora = new Date().toISOString();
      const actualizado: SolicitudSeguroImpago = {
        ...sol,
        ...cambiosFuenteNueva,
        estado: 'ERROR_PROCESAMIENTO',
        emailRespuestaRaw: textToAnalyze,
        procesadoConIA: fuenteNueva ? false : sol.procesadoConIA,
        fechaActualizacion: ahora,
        historial: [
          ...sol.historial,
          {
            id: `hist_${Date.now()}`,
            fecha: ahora,
            autor: 'sistema_ia',
            accion: 'Análisis automático no disponible; requiere revisión humana',
            detalle: 'El texto fuente se conserva. No se ha registrado una clasificación nueva ni un dictamen oficial.',
          },
        ],
      };
      setSol(actualizado);
      return persistirSolicitud(actualizado);
    };

    try {
      const res = await solicitarIA('/api/analizar-respuesta-aseguradora', {
        emailTexto: textToAnalyze,
        emailAsunto: `Re: [${sol.referenciaUnica}]`,
        aseguradoraNombre: sol.aseguradoraNombre,
        rentaMensual: sol.rentaMensual,
      });

      if (!res.ok) throw new Error('ANALISIS_IA_NO_DISPONIBLE');

      const datos: unknown = await res.json();
      if (!esAnalisisRespuestaAseguradoraValido(datos)) {
        throw new Error('RESPUESTA_IA_INVALIDA');
      }
      const analisis = datos;
      analisisValido = true;

      if (fuenteNueva) {
        setFuenteOriginalContrastada(false);
        setDictamenManual('EN_ESTUDIO');
        setDictamenVerificacionNotice(null);
        setDictamenVerificacionError(null);
      }

      const ahora = new Date().toISOString();
      const updated: SolicitudSeguroImpago = {
        ...sol,
        ...cambiosFuenteNueva,
        estado: 'RESPUESTA_PROCESADA',
        analisisRespuestaIA: analisis,
        emailRespuestaRaw: textToAnalyze,
        fechaRecepcionRespuesta: ahora,
        procesadoConIA: true,
        fechaActualizacion: ahora,
        historial: [
          ...sol.historial,
          {
            id: `hist_${Date.now()}`,
            fecha: ahora,
            autor: 'sistema_ia',
            accion: 'Análisis IA de respuesta registrado; dictamen pendiente de contraste humano',
            detalle: `Clasificación inferida: ${analisis.clasificacionInferida}. El resultado no acredita autenticidad ni sustituye la decisión humana.`,
          },
        ],
      };

      setSol(updated);
      if (!(await persistirSolicitud(updated))) {
        setResponseProcessingError(
          'El análisis orientativo se completó, pero no se pudo confirmar su guardado. El resultado no es un dictamen oficial; revisa la conexión antes de continuar.'
        );
      }
    } catch {
      console.warn('Análisis de respuesta no completado:', { codigo: analisisValido ? 'PERSISTENCIA_NO_CONFIRMADA' : 'IA_NO_VALIDADA' });
      if (!analisisValido) {
        const guardado = await registrarPendienteRevision();
        setResponseProcessingError(
          guardado
            ? 'El análisis automático no se pudo completar. El texto recibido se conserva y el expediente queda pendiente de revisión humana.'
            : 'El análisis automático no se pudo completar. El texto se conserva en pantalla, pero no se confirmó su guardado; requiere revisión humana.'
        );
      } else {
        setResponseProcessingError(
          'El análisis orientativo se completó, pero no se pudo guardar en el expediente. No lo trates como dictamen oficial.'
        );
      }
    } finally {
      setIsAnalyzingResponse(false);
    }
  };

  // Wrapper para procesar texto manual del textarea
  const handleAnalyzeIncomingResponse = async () => {
    await handleAnalyzeSpecificText(incomingResponseText);
  };

  const handleRegistrarDictamenManual = async () => {
    const textoFuente = incomingResponseText.trim();
    if (!textoFuente || !fuenteOriginalContrastada) return;

    setDictamenVerificacionNotice(null);
    setDictamenVerificacionError(null);
    const ahora = new Date().toISOString();
    const fuenteNueva = incomingResponseText !== sol.emailRespuestaRaw;
    const actualizado: SolicitudSeguroImpago = {
      ...sol,
      ...(fuenteNueva ? { analisisRespuestaIA: null, procesadoConIA: false } : {}),
      estado: 'RESPUESTA_PROCESADA',
      dictamenAseguradora: dictamenManual,
      dictamenAseguradoraVerificadoManualmente: true,
      fechaVerificacionDictamenAseguradora: ahora,
      emailRespuestaRaw: incomingResponseText,
      fechaRecepcionRespuesta: sol.fechaRecepcionRespuesta || ahora,
      fechaActualizacion: ahora,
      historial: [
        ...sol.historial,
        {
          id: `hist_${Date.now()}`,
          fecha: ahora,
          autor: 'propietario',
          accion: 'Dictamen de aseguradora contrastado manualmente con la fuente original',
          detalle: `Clasificación registrada por la persona usuaria: ${dictamenManual}. La aplicación no verifica técnicamente la autenticidad del correo.`,
        },
      ],
    };

    if (!(await persistirSolicitud(actualizado))) {
      // Mantener la revisión y el texto fuente en memoria, sin afirmar que Firestore los guardó.
      setSol(actualizado);
      setDictamenVerificacionError('El contraste humano se conserva en memoria, pero no se confirmó su persistencia. Revisa la conexión y vuelve a guardar antes de dar por guardado el expediente.');
      return;
    }
    setSol(actualizado);
    setDictamenVerificacionNotice('Dictamen registrado por revisión humana de la fuente original; la aplicación no ha autenticado el remitente.');
  };

  // La decisión del propietario se guarda como campo independiente del dictamen de la aseguradora.
  const handleSaveOwnerDecision = async () => {
    setOwnerDecisionError(null);
    const ahora = new Date().toISOString();
    const updated: SolicitudSeguroImpago = {
      ...sol,
      decisionFinalPropietario: ownerDecision,
      notasPrivadasPropietario: ownerNotas,
      fechaDecisionPropietario: ahora,
      fechaActualizacion: ahora,
      historial: [
        ...sol.historial,
        {
          id: `hist_${Date.now()}`,
          fecha: ahora,
          autor: 'propietario',
          accion: `Decisión final registrada: ${ownerDecision}`,
          detalle: ownerNotas || 'Sin notas adicionales.',
        },
      ],
    };
    if (!(await persistirSolicitud(updated))) {
      setOwnerDecisionError('No se confirmó el guardado de la decisión. El expediente permanece abierto para revisión.');
      return;
    }
    setSol(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div ref={refDialogo} {...propsDialogo}
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
                  sol.dictamenAseguradoraVerificadoManualmente !== true
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : sol.dictamenAseguradora === 'FAVORABLE'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : sol.dictamenAseguradora === 'FAVORABLE_CONDICIONADO'
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : sol.dictamenAseguradora === 'DESFAVORABLE'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-blue-100 text-blue-800 border-blue-300'
                }`}>
                  {sol.dictamenAseguradoraVerificadoManualmente === true
                    ? `Dictamen contrastado: ${sol.dictamenAseguradora}`
                    : 'Dictamen pendiente de contraste humano'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {sol.aseguradoraNombre} • {sol.inmuebleNombre} ({sol.rentaMensual} €/mes) • Titular: {sol.titular1.nombre}
              </p>
            </div>
          </div>
          <button
            aria-label="Cerrar"
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
            {sol.estado === 'CORREO_ENVIADO' && tieneConfirmacionGmailVerificable && (
              <span
                role="img"
                aria-label="Gmail aceptó el mensaje; entrega no confirmada"
                className="w-2 h-2 rounded-full bg-blue-500 inline-block"
              />
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

              {/* BLOQUE 3: CÁLCULOS LOCALES, SEPARADOS DEL DICTAMEN */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <div className="w-6 h-6 rounded-lg bg-slate-600 text-white flex items-center justify-center text-xs font-black">3</div>
                  <h4 className="font-black text-slate-900 text-sm tracking-wide uppercase">CÁLCULOS LOCALES · SIN DICTAMEN DE ASEGURADORA</h4>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <p className="text-xs text-slate-700">
                    El ratio es un cálculo aritmético sobre los datos registrados. No es una puntuación de la aseguradora, una recomendación de aceptación ni un análisis de solvencia.
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-700 font-bold">
                      Ratio calculado: {sol.ratioEsfuerzoCalculado}% · Límite configurado: {aseguradora.ratioEsfuerzoMaximo}%
                    </div>
                    {sol.scoreSolvenciaFuente === 'PUNTUACION_CANDIDATO' &&
                      typeof sol.scoreSolvenciaIA === 'number' &&
                      Number.isFinite(sol.scoreSolvenciaIA) && (
                        <div className="text-xs text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-lg">
                          Puntuación existente en la ficha de candidato: {sol.scoreSolvenciaIA} / 100. No es un dictamen ni ha sido verificada para esta aseguradora.
                        </div>
                      )}
                  </div>
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

              {emailGenerationNotice && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-950 text-xs" role="status">
                  {emailGenerationNotice}
                </div>
              )}
              {emailGenerationError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs" role="alert">
                  {emailGenerationError}
                </div>
              )}

              {/* Status bar */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-600">Estado de Envío:</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold border ${
                    sol.estado === 'ENVIO_INCIERTO'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : sol.estado === 'ERROR_ENVIO'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : sol.estado === 'CORREO_ENVIADO' && tieneConfirmacionGmailVerificable
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : sol.estado === 'RESPUESTA_PROCESADA' || sol.estado === 'RESPUESTA_RECIBIDA'
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-slate-200 text-slate-700 border-slate-300'
                  }`}>
                    {sol.estado === 'CORREO_ENVIADO'
                      ? tieneConfirmacionGmailVerificable
                        ? 'GMAIL ACEPTÓ · ENTREGA NO CONFIRMADA'
                        : 'ESTADO HEREDADO · REVISAR GMAIL'
                      : sol.estado}
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

              {sol.estado === 'CORREO_ENVIADO' && !tieneConfirmacionGmailVerificable && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs" role="alert">
                  Este expediente conserva un estado de envío histórico sin id y threadId verificables. No equivale a una confirmación de Gmail; revisa Enviados antes de cualquier acción.
                </div>
              )}
              {sendSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in" role="status">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{sendSuccessMsg}</span>
                </div>
              )}
              {sendErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-semibold flex items-center gap-2" role="alert">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{sendErrorMsg}</span>
                </div>
              )}
              {sol.estado === 'ENVIO_INCIERTO' && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                  <p className="text-xs font-semibold text-amber-950">
                    El envío está bloqueado para evitar duplicados. Revisa manualmente la carpeta Enviados de Gmail antes de habilitar otro intento.
                  </p>
                  <button
                    type="button"
                    onClick={handleAutorizarReintentoManual}
                    disabled={isSendingEmail}
                    className="px-3 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-lg disabled:opacity-50"
                  >
                    He revisado Enviados; habilitar reintento manual
                  </button>
                </div>
              )}

              {/* Subject */}
              <div>
                <label htmlFor="campo-asunto-del-correo-estructurado-con-candi" className="text-xs font-bold text-slate-700 block mb-1">
                  Asunto del Correo (Estructurado con Candidato {numCandidato} y referencia única):
                </label>
                <input
                  type="text"
                  value={emailAsunto}
                  onChange={(e) => setEmailAsunto(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono font-bold text-slate-900 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"

                   id="campo-asunto-del-correo-estructurado-con-candi"/>
              </div>

              {/* Body */}
              <div>
                <label htmlFor="campo-cuerpo-del-mensaje-formal-datos-completo" className="text-xs font-bold text-slate-700 block mb-1">
                  Cuerpo del Mensaje Formal (Datos completos, teléfonos, renta y candidatos):
                </label>
                <textarea
                  value={emailCuerpo}
                  onChange={(e) => setEmailCuerpo(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 leading-relaxed"

                   id="campo-cuerpo-del-mensaje-formal-datos-completo"/>
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
                  disabled={isSendingEmail || !['BORRADOR', 'ERROR_ENVIO'].includes(sol.estado)}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-colors shadow-md shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                  {isSendingEmail ? 'Enviando vía Gmail API...' : sol.estado === 'ENVIO_INCIERTO' ? 'Reintento bloqueado por resultado incierto' : 'Enviar Solicitud con Gmail OAuth'}
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

                </div>
              </div>

              {gmailStatusNotice && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-950 text-xs font-medium flex items-center gap-2" role="status">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>{gmailStatusNotice}</span>
                </div>
              )}
              {responseProcessingError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs font-semibold flex items-center gap-2" role="alert">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{responseProcessingError}</span>
                </div>
              )}

              {/* Text input for received response */}
              <div>
                <label htmlFor="campo-texto-del-correo-de-respuesta-recibido-d" className="text-xs font-bold text-slate-700 block mb-1">
                  Texto fuente de respuesta atribuido a {sol.aseguradoraNombre} (no autenticado automáticamente):
                </label>
                <textarea
                  value={incomingResponseText}
                  onChange={(e) => {
                    setIncomingResponseText(e.target.value);
                    setFuenteOriginalContrastada(false);
                    setDictamenVerificacionNotice(null);
                    setDictamenVerificacionError(null);
                  }}
                  placeholder="Pega aquí el contenido del correo recibido o busca mensajes en Gmail. La aplicación no autentica el remitente."
                  rows={5}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-sky-500 outline-none text-slate-800"

                   id="campo-texto-del-correo-de-respuesta-recibido-d"/>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAnalyzeIncomingResponse}
                  disabled={isAnalyzingResponse || !incomingResponseText.trim()}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-black rounded-xl transition-colors shadow-md shadow-sky-600/20 flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  {isAnalyzingResponse ? 'Analizando con Gemini...' : 'Analizar texto (orientativo) con IA'}
                </button>
              </div>

              {sol.analisisRespuestaIA && (
                <section className="bg-purple-50 border border-purple-200 rounded-2xl p-4 sm:p-5 space-y-4" aria-label="Análisis orientativo de IA">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200 pb-2">
                    <div>
                      <h5 className="font-black text-xs text-purple-950 uppercase tracking-wider">Análisis IA orientativo · no es dictamen oficial</h5>
                      <p className="text-[11px] text-purple-900 mt-1">Clasificación inferida del texto fuente; no autentica al remitente. Requiere contraste humano.</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-black border bg-purple-100 text-purple-900 border-purple-300">
                      {sol.analisisRespuestaIA.clasificacionInferida}
                    </span>
                  </div>

                  <p className="text-xs text-slate-800 font-medium bg-white p-3 rounded-xl border border-purple-200">
                    {sol.analisisRespuestaIA.resumenAnalisis}
                  </p>
                  <p className="text-xs text-slate-700">
                    <strong>Texto de clasificación inferida:</strong> {sol.analisisRespuestaIA.textoClasificacionInferida}
                  </p>
                  <p className="text-xs text-slate-700">
                    <strong>Importe máximo explícito:</strong>{' '}
                    {sol.analisisRespuestaIA.importeMaximoAsegurable === null
                      ? 'No indicado en el texto fuente.'
                      : `${sol.analisisRespuestaIA.importeMaximoAsegurable.toLocaleString('es-ES')} €`}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-white rounded-xl border border-purple-200">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Condiciones identificadas explícitamente:</span>
                      {sol.analisisRespuestaIA.condiciones.length > 0 ? (
                        <ul className="text-xs text-slate-700 space-y-1">
                          {sol.analisisRespuestaIA.condiciones.map((condicion, indice) => <li key={indice}>• {condicion}</li>)}
                        </ul>
                      ) : <span className="text-xs text-slate-500">No se identificaron condiciones explícitas; esto no acredita que no existan.</span>}
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-purple-200">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Documentación mencionada explícitamente:</span>
                      {sol.analisisRespuestaIA.documentosRequeridos.length > 0 ? (
                        <ul className="text-xs text-slate-700 space-y-1">
                          {sol.analisisRespuestaIA.documentosRequeridos.map((documento, indice) => <li key={indice}>• {documento}</li>)}
                        </ul>
                      ) : <span className="text-xs text-slate-500">No se identificaron documentos en el texto; confirma el mensaje original.</span>}
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-purple-950">
                    Sugerencia de seguimiento generada por IA: {sol.analisisRespuestaIA.recomendacionAtencionPropietario ? 'requiere atención humana' : 'no detectada'}.
                    Esta sugerencia no es una decisión del propietario.
                  </p>
                </section>
              )}

              {sol.dictamenAseguradoraVerificadoManualmente && incomingResponseText === sol.emailRespuestaRaw ? (
                <section className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 space-y-2" aria-label="Dictamen registrado tras contraste manual">
                  <h5 className="font-black text-xs text-emerald-950 uppercase tracking-wider">Contraste humano declarado para el texto fuente</h5>
                  <p className="text-sm font-bold text-emerald-900">{sol.dictamenAseguradora}</p>
                  <p className="text-xs text-emerald-900">La persona usuaria declaró haber contrastado la fuente original. La aplicación no autentica técnicamente el remitente.</p>
                  {sol.fechaVerificacionDictamenAseguradora && (
                    <p className="text-[11px] text-emerald-800">Fecha del contraste humano: {new Date(sol.fechaVerificacionDictamenAseguradora).toLocaleString('es-ES')}</p>
                  )}
                </section>
              ) : (
                <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3">
                  No consta un dictamen confirmado manualmente para el texto actualmente visible. La clasificación de IA y los campos heredados no cuentan como dictamen oficial.
                </p>
              )}

              {sol.dictamenAseguradoraVerificadoManualmente && incomingResponseText !== sol.emailRespuestaRaw && (
                <p className="text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3" role="status">
                  El texto fuente visible se ha modificado desde la última verificación manual. Vuelve a contrastarlo y regístralo para asociar un dictamen a esta versión.
                </p>
              )}

              <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div>
                  <h5 className="font-black text-xs text-slate-900 uppercase tracking-wider">Registro manual del dictamen</h5>
                  <p className="text-xs text-slate-600 mt-1">Selecciona lo que has comprobado en la comunicación original. No se copia automáticamente la clasificación de IA.</p>
                </div>
                <label htmlFor="dictamen-aseguradora-manual" className="text-xs font-bold text-slate-700">Clasificación confirmada por revisión humana:</label>
                <select
                  id="dictamen-aseguradora-manual"
                  value={dictamenManual}
                  onChange={(e) => {
                    setDictamenManual(e.target.value as DictamenAseguradora);
                    setFuenteOriginalContrastada(false);
                  }}
                  className="w-full sm:max-w-md px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white"
                >
                  <option value="EN_ESTUDIO">En estudio / no concluyente</option>
                  <option value="FAVORABLE">Favorable</option>
                  <option value="FAVORABLE_CONDICIONADO">Favorable condicionado</option>
                  <option value="DESFAVORABLE">Desfavorable</option>
                  <option value="DOCUMENTACION_REQUERIDA">Documentación requerida</option>
                </select>
                <label className="flex items-start gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={fuenteOriginalContrastada}
                    onChange={(e) => setFuenteOriginalContrastada(e.target.checked)}
                    disabled={!incomingResponseText.trim()}
                    className="mt-0.5"
                  />
                  <span>He contrastado el texto con la comunicación original de la aseguradora y registro esta clasificación manualmente. Entiendo que la aplicación no autentica el correo.</span>
                </label>
                <button
                  type="button"
                  onClick={handleRegistrarDictamenManual}
                  disabled={!fuenteOriginalContrastada || !incomingResponseText.trim()}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Registrar dictamen contrastado manualmente
                </button>
                {dictamenVerificacionNotice && <p className="text-xs text-emerald-800" role="status">{dictamenVerificacionNotice}</p>}
                {dictamenVerificacionError && <p className="text-xs text-rose-800" role="alert">{dictamenVerificacionError}</p>}
              </section>
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
                      onClick={() => setOwnerDecision('ACEPTAR_CANDIDATO')}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-2.5 text-left ${
                        ownerDecision === 'ACEPTAR_CANDIDATO'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="block font-black">Aceptar Candidato y Proceder a Firma</span>
                        <span className={`text-[10px] ${ownerDecision === 'ACEPTAR_CANDIDATO' ? 'text-emerald-100' : 'text-slate-500'}`}>
                          Decisión del propietario; no sustituye el dictamen verificado de la aseguradora
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOwnerDecision('SOLICITAR_AVAL_EXTRA')}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-2.5 text-left ${
                        ownerDecision === 'SOLICITAR_AVAL_EXTRA'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="block font-black">Condicionar a Aval / Fianza Extra</span>
                        <span className={`text-[10px] ${ownerDecision === 'SOLICITAR_AVAL_EXTRA' ? 'text-amber-100' : 'text-slate-500'}`}>
                          Exigir garantías complementarias antes de firmar
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOwnerDecision('RECHAZAR_CANDIDATO')}
                      className={`p-3 rounded-xl text-xs font-bold border transition-all flex items-center gap-2.5 text-left ${
                        ownerDecision === 'RECHAZAR_CANDIDATO'
                          ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <X className="w-4 h-4 shrink-0" />
                      <div>
                        <span className="block font-black">Rechazar Candidatura</span>
                        <span className={`text-[10px] ${ownerDecision === 'RECHAZAR_CANDIDATO' ? 'text-rose-100' : 'text-slate-500'}`}>
                          Decisión del propietario de no continuar con esta candidatura
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

        {ownerDecisionError && (
          <div className="px-4 py-2 bg-rose-50 border-t border-rose-200 text-rose-900 text-xs" role="alert">
            {ownerDecisionError}
          </div>
        )}

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
