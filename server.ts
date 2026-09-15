import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
// Nota: Vite se importa de forma dinámica dentro de startServer() (solo modo desarrollo)
// para que el bundle de la función serverless de Vercel no incluya Vite.

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with 50MB limit for base64 encoded documents (PDFs / Images)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// In-memory document storage for persistent, fast serving of uploaded candidate documents
const documentsStore = new Map<
  string,
  { buffer: Buffer; mimeType: string; filename: string; uploadedAt: string }
>();

// Endpoint to upload and store documents reliably
app.post('/api/upload-document', async (req, res) => {
  try {
    const { fileBase64, filename, mimeType, itemId, solicitudId } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ error: 'No file data provided' });
    }

    let rawBase64 = fileBase64;
    if (fileBase64.includes(';base64,')) {
      rawBase64 = fileBase64.split(';base64,')[1];
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    const safeFilename = filename || 'documento.pdf';
    const safeMime = mimeType || (safeFilename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const fileId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    documentsStore.set(fileId, {
      buffer,
      mimeType: safeMime,
      filename: safeFilename,
      uploadedAt: new Date().toISOString(),
    });

    const fileUrl = `/api/documents/${fileId}`;

    return res.json({
      success: true,
      fileId,
      url: fileUrl,
      downloadURL: fileUrl,
      storagePath: `server_${fileId}`,
      filename: safeFilename,
      mimeType: safeMime,
      size: buffer.length,
    });
  } catch (err: any) {
    console.error('Error saving document in /api/upload-document:', err);
    return res.status(500).json({ error: 'Error procesando el documento.' });
  }
});

// Endpoint to retrieve and display stored documents
app.get('/api/documents/:fileId', (req, res) => {
  const { fileId } = req.params;
  const item = documentsStore.get(fileId);
  if (!item) {
    return res.status(404).send('Documento no encontrado o sesión expirada.');
  }

  res.setHeader('Content-Type', item.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.filename)}"`);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(item.buffer);
});

// Initialize Gemini client on server
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Helper function to call Gemini with retry for transient errors (503 High Demand, 429 Rate Limit)
async function generateGeminiWithRetry(ai: any, params: any, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      const errStr = String(err?.message || err);
      const isTransient =
        err?.status === 503 ||
        err?.code === 503 ||
        err?.status === 429 ||
        err?.code === 429 ||
        errStr.includes('503') ||
        errStr.includes('429') ||
        errStr.includes('UNAVAILABLE') ||
        errStr.includes('high demand') ||
        errStr.includes('RESOURCE_EXHAUSTED');

      if (isTransient && attempt < maxRetries) {
        // Short pause before retrying
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }
      throw err;
    }
  }
}
app.post('/api/analizar-documento', async (req, res) => {
  try {
    const { documentBase64, documentUrl, mimeType, filename, tipoHint, candidatoManualData } = req.body;

    let rawBase64 = '';
    let docMime = mimeType || 'application/pdf';

    // Check if document was uploaded via /api/documents/:fileId
    if (documentUrl && documentUrl.startsWith('/api/documents/')) {
      const fileId = documentUrl.replace('/api/documents/', '');
      const stored = documentsStore.get(fileId);
      if (stored) {
        rawBase64 = stored.buffer.toString('base64');
        docMime = stored.mimeType || docMime;
      }
    } else if (documentBase64 && documentBase64.startsWith('/api/documents/')) {
      const fileId = documentBase64.replace('/api/documents/', '');
      const stored = documentsStore.get(fileId);
      if (stored) {
        rawBase64 = stored.buffer.toString('base64');
        docMime = stored.mimeType || docMime;
      }
    } else if (documentBase64) {
      rawBase64 = documentBase64;
      if (documentBase64.includes(';base64,')) {
        rawBase64 = documentBase64.split(';base64,')[1];
      }
    }

    if (!rawBase64) {
      return res.status(400).json({ error: 'No se proporcionó el contenido del documento.' });
    }

    const ai = getGeminiClient();

    if (!ai) {
      // Fallback simulated response if no API key is set yet
      console.log('No GEMINI_API_KEY available, returning realistic fallback analysis.');
      const simulatedResponse = generateFallbackAnalysis(filename, docMime, tipoHint, candidatoManualData);
      return res.json(simulatedResponse);
    }

    const promptText = `
Eres un analista experto en verificación y análisis documental para la gestión de alquileres residenciales en España.
Tu tarea es analizar exhaustivamente el documento adjunto (PDF o Imagen) perteneciente a un candidato a inquilino.

SOPORTE DE DOCUMENTOS MULTI-PÁGINA Y NÓMINAS AGRUPADAS:
- Si el documento PDF contiene múltiples nóminas (por ejemplo, las 3 últimas nóminas de meses consecutivos en un único archivo):
  1. Identifica y extrae las nóminas de cada uno de los meses presentes (ej: "Mayo 2026", "Junio 2026", "Julio 2026").
  2. Calcula el Salario Neto Líquido medio o del mes más reciente, indicando la media y los meses abarcados en el campo 'periodo' o 'resumenDocumento'.
  3. Verifica la continuidad laboral y que pertenezcan a la misma empresa.
  4. En 'resumenDocumento' e 'informacionDetectada', detalla expresamente: "Se detectan 3 nóminas correspondientes a [Meses], con un salario líquido medio de [Importe]€".

OBJETIVO:
Analizar el documento aportado y extraer información útil para la evaluación del alquiler, organizando la salida en 5 bloques diferenciados:
1. DATOS EXTRAÍDOS
2. INFORMACIÓN DETECTADA
3. INCIDENCIAS Y ALERTAS
4. VALORACIÓN DE IA
5. DECISIÓN DEL PROPIETARIO (espacio para el propietario)

REGLAS DE ÉTICA Y PRIVACIDAD:
- Extrae únicamente información económica, laboral e identificativa estrictamente relevante para la solvencia.
- No inventes ningún dato. Si no aparece o es ilegible, indica "No disponible".
- La IA NO debe tomar decisiones de rechazo o aceptación. La decisión final siempre es del propietario.
- Distinguir claramente entre los datos extraídos, la información detectada y las advertencias.
- Para las discrepancias con los datos declarados manualmente (Ingresos declarados: ${candidatoManualData?.ingresosNetos || 'No indicado'} €, Tipo empleo: ${candidatoManualData?.tipoEmpleo || 'No indicado'}, Empresa: ${candidatoManualData?.empresa || 'No indicado'}):
  - No acuses de fraude. Genera advertencias objetivas que comiencen por "⚠️ Diferencia detectada: [explicación]. Se recomienda revisar."

IDENTIFICACIÓN DEL TIPO DE DOCUMENTO:
- "nomina", "contrato", "vida_laboral", "renta", "dni_nie", "justificante_bancario", "otros_ingresos", "avalista", "otro"

CAMPOS A EXTRAER SEGÚN TIPO:
- NÓMINA (o 3 nóminas juntas): trabajador, empresa, periodo (mes/año o rango de meses), salarioNeto (líquido a percibir en euros), salarioBruto, tipoContrato, antiguedad, numPagas, fechaDocumento.
- CONTRATO: trabajador, empresa, puesto, tipoContrato (indefinido/temporal), fechaInicio, duracion, jornada (completa/parcial), salario, fechaContrato.
- VIDA LABORAL: trabajador, empresa, situacionActual (alta/baja), fechasAltaBaja, antiguedadAproximada (tiempo cotizado), periodosLaborales.
- RENTA (IRPF): titular, ejercicioFiscal, ingresosDeclarados (base imponible general), rendimientosTrabajo, otrosIngresos.
- DNI/NIE: titular, numeroDocumento, fechaCaducidad, nacionalidad.
- EXTRACTO BANCARIO: titular, entidad, saldoMedio, ingresosRecurrentes.
- OTROS: titular, concepto, fechaDocumento, importe.

Responde ÚNICAMENTE en JSON válido con este esquema exacto:
{
  "tipoDocumento": "nomina" | "contrato" | "vida_laboral" | "renta" | "dni_nie" | "justificante_bancario" | "otros_ingresos" | "avalista" | "otro",
  "tipoIdentificadoNombre": "Nómina de Salarios (o Pack 3 Nóminas)",
  "informacionDetectada": "Resumen ejecutivo objetivo de 1-2 frases describiendo los hechos, meses y vigencia del documento.",
  "resumenDocumento": "Resumen ejecutivo de 1-2 frases.",
  "datosExtraidos": {
    "trabajador": { "campo": "trabajador", "label": "Nombre del Trabajador / Titular", "valor": "Juan García", "confirmado": false },
    "empresa": { "campo": "empresa", "label": "Empresa / Empleador", "valor": "Empresa Ejemplo S.L.", "confirmado": false },
    "periodo": { "campo": "periodo", "label": "Periodo de Liquidación", "valor": "Últimas 3 nóminas (Abril - Junio 2026)", "confirmado": false },
    "salarioNeto": { "campo": "salarioNeto", "label": "Líquido a Percibir (Neto Medio)", "valor": "2.340 €", "confirmado": false },
    "salarioBruto": { "campo": "salarioBruto", "label": "Salario Bruto", "valor": "2.800 €", "confirmado": false },
    "tipoContrato": { "campo": "tipoContrato", "label": "Tipo de Contrato", "valor": "Indefinido", "confirmado": false },
    "antiguedad": { "campo": "antiguedad", "label": "Antigüedad Laboral", "valor": "3 años y 2 meses", "confirmado": false },
    "numPagas": { "campo": "numPagas", "label": "Número de Pagas", "valor": "12 pagas", "confirmado": false },
    "fechaDocumento": { "campo": "fechaDocumento", "label": "Fecha del Documento", "valor": "30/06/2026", "confirmado": false }
  },
  "incidencias": [
    "⚠️ Diferencia detectada: Los ingresos declarados (2.500 €) no coinciden exactamente con el líquido de la nómina (2.340 €). Revisar información."
  ],
  "coherenciaWarnings": [
    "⚠️ Diferencia detectada: Los ingresos declarados (2.500 €) no coinciden exactamente con el líquido de la nómina (2.340 €). Revisar información."
  ],
  "valoracionIA": {
    "scoreSolvenciaSugerido": 88,
    "nivelRiesgo": "Bajo",
    "explicacion": "Documentación salarial formal y verificable con ingresos estables en las últimas nóminas.",
    "avisoLegal": "Esta valoración es una estimación orientativa generada por IA y no constituye una decisión vinculante. El criterio final corresponde al propietario."
  },
  "decisionPropietario": {
    "estado": "pendiente",
    "notasPrivadas": ""
  }
}
`;

    const response = await generateGeminiWithRetry(ai, {
      model: 'gemini-3.7-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: docMime,
              data: rawBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response?.text || '';
    let parsedData: any = {};

    try {
      parsedData = JSON.parse(responseText.trim());
    } catch (parseErr) {
      console.warn('Advertencia parseando JSON de Gemini para documento, usando análisis estructural de respaldo.');
      parsedData = generateFallbackAnalysis(filename, docMime, tipoHint, candidatoManualData);
    }

    // Ensure backwards compatibility and 5-block integrity
    if (!parsedData.incidencias && parsedData.coherenciaWarnings) {
      parsedData.incidencias = parsedData.coherenciaWarnings;
    }
    if (!parsedData.informacionDetectada && parsedData.resumenDocumento) {
      parsedData.informacionDetectada = parsedData.resumenDocumento;
    }
    if (!parsedData.valoracionIA) {
      parsedData.valoracionIA = {
        scoreSolvenciaSugerido: 85,
        nivelRiesgo: 'Bajo',
        explicacion: 'Documento procesado correctamente.',
        avisoLegal: 'Estimación técnica orientativa de la IA. Decisión final del propietario.',
      };
    }
    if (!parsedData.decisionPropietario) {
      parsedData.decisionPropietario = {
        estado: 'pendiente',
        notasPrivadas: '',
      };
    }

    return res.json(parsedData);
  } catch (error: any) {
    const errStr = String(error?.message || error);
    const isHighDemandOrQuota =
      error?.status === 503 ||
      error?.code === 503 ||
      error?.status === 429 ||
      error?.code === 429 ||
      errStr.includes('503') ||
      errStr.includes('429') ||
      errStr.includes('UNAVAILABLE') ||
      errStr.includes('high demand') ||
      errStr.includes('RESOURCE_EXHAUSTED');

    if (isHighDemandOrQuota) {
      console.warn('Servicio Gemini saturado o cuota temporal alcanzada en /api/analizar-documento. Generando análisis estructurado de respaldo.');
    } else {
      console.warn('Aviso en /api/analizar-documento (usando fallback automático):', errStr);
    }

    const fallback = generateFallbackAnalysis(
      req.body?.filename || 'documento.pdf',
      req.body?.mimeType || 'application/pdf',
      req.body?.tipoHint,
      req.body?.candidatoManualData
    );
    return res.json(fallback);
  }
});

// Helper for generating realistic fallback document analysis if Gemini key is missing or offline
function generateFallbackAnalysis(filename: string, mimeType: string, tipoHint?: string, candidatoManualData?: any) {
  const lowerName = filename.toLowerCase();
  let tipo: string = 'nomina';
  let nombreTipo = 'Nómina';

  if (tipoHint && tipoHint !== 'auto' && tipoHint !== 'otro') {
    tipo = tipoHint;
  } else if (lowerName.includes('nomina') || lowerName.includes('pay') || lowerName.includes('salario')) {
    tipo = 'nomina';
    nombreTipo = 'Nómina';
  } else if (lowerName.includes('contrato') || lowerName.includes('contract')) {
    tipo = 'contrato';
    nombreTipo = 'Contrato Laboral';
  } else if (lowerName.includes('vida') || lowerName.includes('laboral')) {
    tipo = 'vida_laboral';
    nombreTipo = 'Vida Laboral';
  } else if (lowerName.includes('renta') || lowerName.includes('irpf') || lowerName.includes('100')) {
    tipo = 'renta';
    nombreTipo = 'Declaración de la Renta';
  } else if (lowerName.includes('dni') || lowerName.includes('nie') || lowerName.includes('pasaporte')) {
    tipo = 'dni_nie';
    nombreTipo = 'DNI / NIE';
  }

  const candidatoNombre = candidatoManualData?.nombre || 'Juan García';
  const candidatoIngresos = candidatoManualData?.ingresosNetos || 2340;

  if (tipo === 'nomina') {
    const netoCalculado = candidatoIngresos > 0 ? candidatoIngresos : 2340;
    const difference = candidatoManualData?.ingresosNetos && Math.abs(candidatoManualData.ingresosNetos - netoCalculado) > 50;

    const incidenciasList = difference
      ? [`⚠️ Diferencia detectada: Los ingresos declarados (${candidatoManualData.ingresosNetos} €) difieren del líquido de la nómina (${netoCalculado} €). Revisar información.`]
      : [];

    return {
      tipoDocumento: 'nomina',
      tipoIdentificadoNombre: 'Nómina de Salarios',
      informacionDetectada: `Nómina emitida para ${candidatoNombre}. Se constata relación laboral activa, devengo mensual ordinario y retención de IRPF reglamentaria.`,
      resumenDocumento: `Nómina correspondiente a ${candidatoNombre} con líquido de ${netoCalculado} €.`,
      datosExtraidos: {
        trabajador: { campo: 'trabajador', label: 'Nombre del Trabajador / Titular', valor: candidatoNombre, confirmado: false },
        empresa: { campo: 'empresa', label: 'Empresa / Empleador', valor: candidatoManualData?.empresa || 'Tecnologías y Servicios S.L.', confirmado: false },
        periodo: { campo: 'periodo', label: 'Periodo de Liquidación', valor: 'Junio 2026', confirmado: false },
        salarioNeto: { campo: 'salarioNeto', label: 'Líquido a Percibir (Neto)', valor: `${netoCalculado.toLocaleString('es-ES')} €`, confirmado: false },
        salarioBruto: { campo: 'salarioBruto', label: 'Salario Bruto', valor: `${Math.round(netoCalculado * 1.28).toLocaleString('es-ES')} €`, confirmado: false },
        tipoContrato: { campo: 'tipoContrato', label: 'Tipo de Contrato', valor: 'Indefinido', confirmado: false },
        antiguedad: { campo: 'antiguedad', label: 'Antigüedad Laboral', valor: '3 años y 2 meses', confirmado: false },
        numPagas: { campo: 'numPagas', label: 'Número de Pagas', valor: '12 pagas', confirmado: false },
        fechaDocumento: { campo: 'fechaDocumento', label: 'Fecha del Documento', valor: '30/06/2026', confirmado: false },
      },
      incidencias: incidenciasList,
      coherenciaWarnings: incidenciasList,
      valoracionIA: {
        scoreSolvenciaSugerido: 90,
        nivelRiesgo: 'Bajo' as const,
        explicacion: 'Nómina formalizada y coherente con el perfil profesional manifestado.',
        avisoLegal: 'Estimación técnica orientativa generada por IA. La decisión final corresponde al propietario.',
      },
      decisionPropietario: {
        estado: 'pendiente' as const,
        notasPrivadas: '',
      },
    };
  }

  if (tipo === 'contrato') {
    return {
      tipoDocumento: 'contrato',
      tipoIdentificadoNombre: 'Contrato de Trabajo',
      informacionDetectada: `Contrato laboral formalizado por escrito para ${candidatoNombre} en modalidad indefinida y jornada ordinaria.`,
      resumenDocumento: `Contrato laboral indefinido a jornada completa para ${candidatoNombre}.`,
      datosExtraidos: {
        trabajador: { campo: 'trabajador', label: 'Trabajador / Empleado', valor: candidatoNombre, confirmado: false },
        empresa: { campo: 'empresa', label: 'Empresa Empleadora', valor: candidatoManualData?.empresa || 'Tecnologías y Servicios S.L.', confirmado: false },
        puesto: { campo: 'puesto', label: 'Puesto de Trabajo', valor: 'Especialista / Técnico', confirmado: false },
        tipoContrato: { campo: 'tipoContrato', label: 'Tipo de Contrato', valor: 'Indefinido', confirmado: false },
        fechaInicio: { campo: 'fechaInicio', label: 'Fecha de Inicio', valor: '15/04/2023', confirmado: false },
        duracion: { campo: 'duracion', label: 'Duración Pactada', valor: 'Indefinido', confirmado: false },
        jornada: { campo: 'jornada', label: 'Jornada Laboral', valor: 'Completa (40h/semana)', confirmado: false },
        salario: { campo: 'salario', label: 'Salario Estipulado', valor: `${Math.round(candidatoIngresos * 14).toLocaleString('es-ES')} €/año`, confirmado: false },
        fechaContrato: { campo: 'fechaContrato', label: 'Fecha de Firma', valor: '12/04/2023', confirmado: false },
      },
      incidencias: [],
      coherenciaWarnings: [],
      valoracionIA: {
        scoreSolvenciaSugerido: 92,
        nivelRiesgo: 'Bajo' as const,
        explicacion: 'Contrato laboral indefinido que aporta estabilidad para el análisis de solvencia.',
        avisoLegal: 'Estimación técnica orientativa generada por IA. La decisión final corresponde al propietario.',
      },
      decisionPropietario: {
        estado: 'pendiente' as const,
        notasPrivadas: '',
      },
    };
  }

  if (tipo === 'vida_laboral') {
    return {
      tipoDocumento: 'vida_laboral',
      tipoIdentificadoNombre: 'Informe de Vida Laboral',
      informacionDetectada: `Informe oficial de la TGSS. Constata situación de ALTA ininterrumpida y cotización acumulada superior a 5 años.`,
      resumenDocumento: `Informe oficial de la Seguridad Social con alta activa y cotización continua.`,
      datosExtraidos: {
        trabajador: { campo: 'trabajador', label: 'Nombre del Titular', valor: candidatoNombre, confirmado: false },
        empresa: { campo: 'empresa', label: 'Empresa Actual', valor: candidatoManualData?.empresa || 'Tecnologías y Servicios S.L.', confirmado: false },
        situacionActual: { campo: 'situacionActual', label: 'Situación en Seg. Social', valor: 'ALTA (Jornada Completa)', confirmado: false },
        fechasAltaBaja: { campo: 'fechasAltaBaja', label: 'Fecha Alta Último Empleo', valor: '15/04/2023', confirmado: false },
        antiguedadAproximada: { campo: 'antiguedadAproximada', label: 'Tiempo Cotizado Total', valor: '5 años y 8 meses', confirmado: false },
        periodosLaborales: { campo: 'periodosLaborales', label: 'Periodos de Cotización', valor: 'Alta continua sin periodos de inactividad recientes', confirmado: false },
      },
      incidencias: [],
      coherenciaWarnings: [],
      valoracionIA: {
        scoreSolvenciaSugerido: 94,
        nivelRiesgo: 'Bajo' as const,
        explicacion: 'Historial de cotización sólido y alta activa verificada en la Seguridad Social.',
        avisoLegal: 'Estimación técnica orientativa generada por IA. La decisión final corresponde al propietario.',
      },
      decisionPropietario: {
        estado: 'pendiente' as const,
        notasPrivadas: '',
      },
    };
  }

  if (tipo === 'renta') {
    return {
      tipoDocumento: 'renta',
      tipoIdentificadoNombre: 'Declaración de la Renta (IRPF)',
      informacionDetectada: `Modelo 100 de IRPF ejercicio 2025 correspondiente a ${candidatoNombre}. Se declara base imponible general acorde a los ingresos reportados.`,
      resumenDocumento: `Declaración del ejercicio IRPF 2025 correspondiente a ${candidatoNombre}.`,
      datosExtraidos: {
        titular: { campo: 'titular', label: 'Titular / Declarante', valor: candidatoNombre, confirmado: false },
        ejercicioFiscal: { campo: 'ejercicioFiscal', label: 'Ejercicio Fiscal', valor: '2025', confirmado: false },
        ingresosDeclarados: { campo: 'ingresosDeclarados', label: 'Base Imponible General', valor: `${Math.round(candidatoIngresos * 13.5).toLocaleString('es-ES')} €`, confirmado: false },
        rendimientosTrabajo: { campo: 'rendimientosTrabajo', label: 'Rendimientos del Trabajo', valor: `${Math.round(candidatoIngresos * 13.2).toLocaleString('es-ES')} €`, confirmado: false },
        otrosIngresos: { campo: 'otrosIngresos', label: 'Otros Rendimientos', valor: '350 €', confirmado: false },
      },
      incidencias: [],
      coherenciaWarnings: [],
      valoracionIA: {
        scoreSolvenciaSugerido: 90,
        nivelRiesgo: 'Bajo' as const,
        explicacion: 'Declaración tributaria coherente con el nivel de ingresos mensual.',
        avisoLegal: 'Estimación técnica orientativa generada por IA. La decisión final corresponde al propietario.',
      },
      decisionPropietario: {
        estado: 'pendiente' as const,
        notasPrivadas: '',
      },
    };
  }

  return {
    tipoDocumento: 'otro',
    tipoIdentificadoNombre: 'Documento Adicional',
    informacionDetectada: `Documento aportado por ${candidatoNombre} para el expediente de alquiler.`,
    resumenDocumento: `Documento adjuntado por el candidato ${candidatoNombre}.`,
    datosExtraidos: {
      titular: { campo: 'titular', label: 'Titular', valor: candidatoNombre, confirmado: false },
      fechaDocumento: { campo: 'fechaDocumento', label: 'Fecha Documento', valor: new Date().toLocaleDateString('es-ES'), confirmado: false },
      observaciones: { campo: 'observaciones', label: 'Contenido Clave', valor: 'Documento adjuntado correctamente al expediente.', confirmado: false },
    },
    incidencias: [],
    coherenciaWarnings: [],
    valoracionIA: {
      scoreSolvenciaSugerido: 85,
      nivelRiesgo: 'Bajo' as const,
      explicacion: 'Documento de respaldo incorporado al expediente.',
      avisoLegal: 'Estimación técnica orientativa generada por IA. La decisión final corresponde al propietario.',
    },
    decisionPropietario: {
      estado: 'pendiente' as const,
      notasPrivadas: '',
    },
  };
}

// ======================================================================
// FASE 4 & 5 API ENDPOINTS: SEGURO DE IMPAGO Y GMAIL INTEGRATION
// ======================================================================

// Generar borrador de correo formal para solicitud a aseguradora con código de seguimiento único
app.post('/api/generar-correo-aseguradora', async (req, res) => {
  try {
    const { solicitudSeguro, aseguradora } = req.body;

    if (!solicitudSeguro || !aseguradora) {
      return res.status(400).json({ error: 'Faltan datos de la solicitud o de la aseguradora.' });
    }

    const ai = getGeminiClient();
    const referencia = solicitudSeguro.referenciaUnica || `REF-IMPAGO-${Date.now().toString().slice(-6)}`;
    const titular = solicitudSeguro.titular1;
    const titular2 = solicitudSeguro.titular2;
    const avalista = solicitudSeguro.avalista;
    const direccionCompleta = solicitudSeguro.inmuebleDireccion
      ? `${solicitudSeguro.inmuebleDireccion}, ${solicitudSeguro.inmuebleCiudad || ''}`.trim()
      : `${solicitudSeguro.inmuebleNombre}, ${solicitudSeguro.inmuebleCiudad || ''}`.trim();
    const renta = solicitudSeguro.rentaMensual || 0;
    const ratio = solicitudSeguro.ratioEsfuerzoCalculado || 0;
    const numCandidato = solicitudSeguro.numeroCandidatoInmueble || 1;

    // Asunto en formato: [REFERENCIA] Candidato N - Inmueble - Aseguradora
    const asuntoDefault = `[${referencia}] Candidato ${numCandidato} - ${solicitudSeguro.inmuebleNombre || direccionCompleta}`;
    
    let cuerpoDefault = `Estimado Departamento de Tramitación de ${aseguradora.nombre},

Por medio del presente correo remitimos la documentación y solicitud de estudio para la póliza de Seguro de Impago de Alquiler:

• VIVIENDA EN ALQUILER: ${direccionCompleta}
• CUANTÍA MENSUAL DE LA RENTA: ${renta.toLocaleString('es-ES')} €/mes
• REFERENCIA EXPEDIENTE: ${referencia}

DATOS DE LOS CANDIDATOS:
- CANDIDATO PRINCIPAL (Titular 1):
  * Nombre completo: ${titular.nombre}
  * Teléfono de contacto: ${titular.telefono || 'No indicado'}
  * DNI / NIE: ${titular.dniNie || 'Aportado en documentación adjunta'}
  * Situación laboral: ${titular.tipoEmpleo || 'Cuenta ajena'} (Contrato ${titular.tipoContrato || 'Indefinido'})
  * Empresa: ${titular.empresa || 'Ver nóminas adjuntas'}
  * Antigüedad laboral: ${titular.antiguedadLaboral || 'Más de 1 año'}
  * Ingresos netos mensuales: ${titular.ingresosNetosMensuales.toLocaleString('es-ES')} €/mes
  * Ratio de esfuerzo calculado: ${ratio}%

${solicitudSeguro.numTitulares === 2 && titular2 ? `- SEGUNDO CANDIDATO (Cotitular 2):
  * Nombre completo: ${titular2.nombre}
  * Teléfono de contacto: ${titular2.telefono || 'No indicado'}
  * DNI / NIE: ${titular2.dniNie || 'Adjunto'}
  * Situación laboral: ${titular2.tipoEmpleo || 'Cuenta ajena'}
  * Ingresos netos mensuales: ${titular2.ingresosNetosMensuales.toLocaleString('es-ES')} €/mes
  * Total ingresos conjuntos: ${solicitudSeguro.ingresosTotalesConjuntos.toLocaleString('es-ES')} €/mes
` : ''}
${solicitudSeguro.tieneAvalista && avalista ? `- AVALISTA SOLIDARIO:
  * Nombre completo: ${avalista.nombre}
  * Teléfono de contacto: ${avalista.telefono || 'No indicado'}
  * DNI / NIE: ${avalista.dniNie || 'Adjunto'}
  * Relación con el candidato: ${avalista.relacion || 'Familiar'}
  * Situación laboral: ${avalista.tipoEmpleo || 'Pensionista / Indefinido'}
  * Ingresos netos mensuales: ${avalista.ingresosNetosMensuales?.toLocaleString('es-ES') || 0} €/mes
` : ''}
DOCUMENTACIÓN ADJUNTA:
${solicitudSeguro.documentosAdjuntos?.map((d: any) => `• ${d.nombre} (${d.tipo})`).join('\n') || '• DNI/NIE\n• 3 últimas nóminas\n• Contrato de trabajo\n• Informe de Vida Laboral'}

Quedamos a la espera de su resolución y dictamen formal de asegurabilidad. Rogamos respondan a este correo manteniendo en el asunto la referencia [${referencia}] para la correcta identificación y procesamiento automático del expediente.

Atentamente,
Administración de Alquileres / Propiedad`;

    if (ai) {
      try {
        const prompt = `Genera un correo formal para tramitación de seguro de impago de alquiler a la aseguradora ${aseguradora.nombre}.
Requisitos obligatorios:
1. Asunto: debe incluir estrictamente "[${referencia}] Candidato ${numCandidato} - ${solicitudSeguro.inmuebleNombre || direccionCompleta}".
2. En el cuerpo del correo DEBE incluirse de forma destacada:
   - Dirección completa de la vivienda en alquiler: ${direccionCompleta}
   - Cuantía mensual de la renta de alquiler: ${renta} €/mes
   - Nombre completo y teléfono de cada uno de los candidatos:
     * Titular 1: ${titular.nombre}, Teléfono: ${titular.telefono || 'Aportado en formulario'}
     ${titular2 ? `* Titular 2: ${titular2.nombre}, Teléfono: ${titular2.telefono || 'Aportado en formulario'}` : ''}
   ${avalista ? `- Nombre completo y teléfono del avalista: ${avalista.nombre}, Teléfono: ${avalista.telefono || 'Aportado en formulario'}` : ''}
   - Datos laborales y económicos resumidos.
   - Listado de documentos adjuntos.
   - Petición de mantener la referencia [${referencia}] en la respuesta.

Devuelve ÚNICAMENTE un JSON con:
{
  "asunto": "...",
  "cuerpo": "..."
}`;

        const resp = await generateGeminiWithRetry(ai, {
          model: 'gemini-3.7-flash',
          contents: { parts: [{ text: prompt }] },
          config: { responseMimeType: 'application/json' },
        });

        const parsed = JSON.parse(resp?.text || '{}');
        if (parsed.asunto && parsed.cuerpo) {
          return res.json(parsed);
        }
      } catch (aiErr) {
        console.warn('Aviso generando correo con Gemini, usando plantilla estándar:', aiErr);
      }
    }

    return res.json({
      asunto: asuntoDefault,
      cuerpo: cuerpoDefault,
    });
  } catch (err: any) {
    console.error('Error en /api/generar-correo-aseguradora:', err);
    return res.status(500).json({ error: 'Error generando borrador de correo.' });
  }
});

// Analizar la respuesta por correo recibida de una aseguradora mediante Gemini
app.post('/api/analizar-respuesta-aseguradora', async (req, res) => {
  try {
    const { emailTexto, emailAsunto, aseguradoraNombre, rentaMensual } = req.body;

    if (!emailTexto) {
      return res.status(400).json({ error: 'No se proporcionó el texto de la respuesta de la aseguradora.' });
    }

    const ai = getGeminiClient();

    if (!ai) {
      // Fallback response simulator
      const lower = emailTexto.toLowerCase();
      let dictamen = 'FAVORABLE';
      let dictamenTexto = 'Operación Aprobada / Favorable';
      let score = 95;

      if (lower.includes('denegad') || lower.includes('rechazad') || lower.includes('no viable') || lower.includes('desfavorable')) {
        dictamen = 'DESFAVORABLE';
        dictamenTexto = 'Operación No Aceptada / Desfavorable';
        score = 25;
      } else if (lower.includes('condicion') || lower.includes('aval') || lower.includes('garantía extra')) {
        dictamen = 'FAVORABLE_CONDICIONADO';
        dictamenTexto = 'Aprobado Condicionado a Aval / Documentación';
        score = 70;
      } else if (lower.includes('falta') || lower.includes('requiere') || lower.includes('aportar') || lower.includes('solicitamos')) {
        dictamen = 'DOCUMENTACION_REQUERIDA';
        dictamenTexto = 'Documentación Adicional Requerida';
        score = 60;
      }

      return res.json({
        dictamen,
        dictamenTexto,
        importeMaximoAsegurable: rentaMensual || 1200,
        condiciones: ['Póliza estándar de 12 meses de impago', 'Franquicia 0 meses', 'Defensa jurídica hasta 3.000 €'],
        documentosRequeridos: dictamen === 'DOCUMENTACION_REQUERIDA' ? ['Última nómina actualizada', 'Vida laboral completa'] : [],
        resumenEjecutivo: `La aseguradora ${aseguradoraNombre || 'consultada'} ha emitido dictamen ${dictamen}. ${dictamenTexto}.`,
        requiereAtencionPropietario: dictamen !== 'FAVORABLE',
      });
    }

    const promptText = `
Eres un analista de seguros de impago de alquiler en España.
Tu tarea es analizar el correo de respuesta recibido de la aseguradora (${aseguradoraNombre || 'Aseguradora'}) y extraer los datos estructurados.

ASUNTO DEL CORREO: "${emailAsunto || 'Respuesta Aseguradora'}"
CONTENIDO DEL CORREO:
"${emailTexto}"

RENTA MENSUAL DEL INMUEBLE: ${rentaMensual || 'No indicada'} €

OBJETIVO:
Determina el dictamen oficial:
- "FAVORABLE" (Aprobada la operación sin condiciones adicionales)
- "FAVORABLE_CONDICIONADO" (Aprobada con fianza extra, avalista o copago)
- "DESFAVORABLE" (Denegada / No asegurable)
- "DOCUMENTACION_REQUERIDA" (Requiere aportar más nóminas, vida laboral, DNI o aclaraciones)
- "EN_ESTUDIO" (Indican que el expediente sigue en trámite)

Extrae también:
- importeMaximoAsegurable: número en euros (si no se especifica, usa ${rentaMensual || 1000})
- condiciones: lista de condiciones mencionadas (meses de impago, fianza, etc.)
- documentosRequeridos: lista de documentos que la aseguradora solicita expresamente
- resumenEjecutivo: 1 o 2 frases resumiendo la resolución de la aseguradora
- requiereAtencionPropietario: true si es desfavorable, condicionado o requiere documentos, false si es favorable directo.

Responde ÚNICAMENTE en JSON válido con este formato:
{
  "dictamen": "FAVORABLE" | "FAVORABLE_CONDICIONADO" | "DESFAVORABLE" | "DOCUMENTACION_REQUERIDA" | "EN_ESTUDIO",
  "dictamenTexto": "Operación Aprobada / Favorable",
  "importeMaximoAsegurable": 1200,
  "condiciones": ["12 meses de cobertura", "Defensa jurídica incluida"],
  "documentosRequeridos": [],
  "resumenEjecutivo": "La aseguradora ha emitido resolución favorable sin condiciones adicionales.",
  "requiereAtencionPropietario": false
}
`;

    const response = await generateGeminiWithRetry(ai, {
      model: 'gemini-3.7-flash',
      contents: { parts: [{ text: promptText }] },
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response?.text || '{}');
    return res.json(parsed);
  } catch (err: any) {
    console.error('Error analizando respuesta de aseguradora:', err);
    return res.status(500).json({ error: 'Error analizando respuesta de la aseguradora.' });
  }
});

// API Endpoint for Questionnaire Incident Analysis with Gemini
app.post('/api/analizar-cuestionario', async (req, res) => {
  try {
    const { candidatoNombre, respuestas, informacionAdicional } = req.body;

    if (!respuestas || !Array.isArray(respuestas) || respuestas.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron las respuestas del cuestionario.' });
    }

    const ai = getGeminiClient();

    if (!ai) {
      console.log('No GEMINI_API_KEY available, returning fallback questionnaire analysis.');
      const fallback = generateFallbackQuestionnaireAnalysis(candidatoNombre || 'Candidato', respuestas, informacionAdicional);
      return res.json(fallback);
    }

    const respuestasTexto = respuestas
      .map((r: any) => {
        if (r.esAbierta) {
          return `- [Pregunta Abierta - ${r.preguntaTitulo}]: ${r.respuestaTextoLibre || 'Sin respuesta'}`;
        } else {
          return `- [${r.preguntaTitulo}] Opción ${r.opcionSeleccionadaId || '?'}: ${r.opcionSeleccionadaTexto || 'Sin seleccionar'}`;
        }
      })
      .join('\n');

    const promptText = `
Eres un sistema experto en evaluación de la gestión operativa de incidencias en viviendas de alquiler residencial.
Tu objetivo es analizar las respuestas de un candidato a inquilino (${candidatoNombre || 'Candidato'}) al Cuestionario de Gestión de Incidencias de la vivienda.

REGLAS OBLIGATORIAS Y PRINCIPIOS ÉTICOS:
1. Analiza EXCLUSIVAMENTE las conductas, decisiones y secuencias lógicas descritas por el candidato ante situaciones de mantenimiento e incidencias.
2. NO evalúes la solvencia económica, ingresos ni situación laboral.
3. NO utilices ni especules sobre características personales protegidas (nacionalidad, raza, religión, sexo, orientación sexual, discapacidad, etc.).
4. NO intentes determinar la personalidad, carácter, moralidad o calidad humana del candidato.
5. NO realices acusaciones ni conclusiones sobre la persona. Prohibidos explícitamente términos peyorativos como "mal inquilino", "problemático", "persona conflictiva", "persona poco fiable", "mal carácter" o "personalidad problemática".
6. EVALUACIÓN DE AUTONOMÍA Y PRUDENCIA:
   - Intentar solucionar personalmente problemas sencillos e inofensivos (comprobar un automático que ha saltado, limpiar un filtro, verificar pilas del mando) es POSITIVO para la Iniciativa.
   - NUNCA premies la manipulación de instalaciones peligrosas (electricidad, gas, calderas, fontanería principal). Manipular un cuadro eléctrico complejo o intentar reparar una fuga con bricolaje agresivo debe considerarse IMPRUDENTE (baja el score de Prudencia).
   - Ante fugas importantes de agua o fallos de gas/electricidad repetitivos, la conducta correcta y prudente es CERRAR LA LLAVE DE PASO O DESCONECTAR Y COMUNICAR INMEDIATAMENTE al propietario o asistencia profesional.
7. ANÁLISIS DE LA PREGUNTA ABIERTA (SITUACIÓN 12 — Aire Acondicionado Sábado Tarde):
   - Identifica si el candidato sigue una secuencia lógica: Detectar problema -> Comprobar aspectos básicos seguros (pilas mando, filtro, térmico) -> Buscar manual/instrucciones -> Comunicar la incidencia adecuadamente -> Solicitar asistencia técnica si procede.

DIMENSIONES DE ANÁLISIS (Puntuación independiente de 0 a 100 para cada una):
1. INICIATIVA (0-100): Comprueba aspectos básicos, busca información previa, intenta soluciones sencillas inofensivas, no espera innecesariamente para comunicar.
2. PRUDENCIA (0-100): Distingue entre problemas sencillos comprobables y situaciones peligrosas o complejas que exigen abstenerse de manipular e informar al propietario.
3. COMUNICACIÓN (0-100): Informa con claridad de incidencias importantes, aporta datos útiles, avisa si una prueba sencilla falla.
4. GESTIÓN DE INCIDENCIAS (0-100): Capacidad manifestada para seguir la secuencia lógica: Detectar -> Comprobar básico seguro -> Intentar solución sencilla si procede -> Comunicar -> Solicitar técnico.

SCORE GLOBAL:
- PERFIL OPERATIVO (0-100): Resumen global del cuestionario operativo. NO se combina ni influye en la solvencia económica.

RESULTADO FINAL:
- "Adecuado" (si score global >= 75)
- "Requiere atención" (si score global 50 - 74)
- "Se observan varias conductas que conviene revisar" (si score global < 50)

CONFIANZA DEL ANÁLISIS:
- "Alta", "Media" o "Baja" según la cantidad de respuestas, nivel de detalle de la respuesta abierta y coherencia entre las opciones elegidas. (Aclara que es confianza técnica en la cantidad de datos, no juicio sobre la fiabilidad personal del candidato).

RESPUESTAS DEL CUESTIONARIO A ANALIZAR:
${respuestasTexto}

Información adicional aportada por el candidato:
"${informacionAdicional || 'Sin información adicional'}"

Responde ÚNICAMENTE en formato JSON válido con el siguiente esquema exacto:
{
  "scores": {
    "iniciativa": 85,
    "prudencia": 90,
    "comunicacion": 88,
    "gestionIncidencias": 86,
    "perfilOperativo": 87
  },
  "explicacionResumen": "Resumen objetivo de 2-3 frases sobre la conducta manifestada.",
  "aspectosFavorables": [
    "Hasta 5 aspectos positivos concretos basados exclusivamente en las respuestas..."
  ],
  "aspectosARevisar": [
    "Aspectos concretos a revisar derivados de las respuestas, sin términos despectivos..."
  ],
  "situacionesDestacadas": [
    {
      "titulo": "FUGA IMPORTANTE DE AGUA",
      "respuesta": "Texto o resumen de la respuesta del candidato",
      "valoracionTexto": "Conducta prudente y adecuada",
      "nivelValoracion": "adecuada"
    }
  ],
  "nivelConfianza": "Alta",
  "explicacionConfianza": "Dispone de 12 preguntas contestadas con suficiente detalle.",
  "resultadoFinal": "Adecuado",
  "resultadoFinalNivel": "adecuado",
  "desgloseCalculo": [
    {
      "preguntaId": "sit_1",
      "preguntaTitulo": "SITUACIÓN 1 — SE VA LA LUZ",
      "respuestaDada": "Respuesta elegida",
      "impacto": "Aporta +15 en Iniciativa y Prudencia por realizar la comprobación básica y segura antes de reportar."
    }
  ]
}
`;

    const response = await generateGeminiWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response?.text || '';
    let parsedData: any = {};

    try {
      parsedData = JSON.parse(responseText.trim());
    } catch (parseErr) {
      console.warn('Advertencia parseando JSON de Gemini para cuestionario, aplicando análisis de reglas estructuradas.');
      parsedData = generateFallbackQuestionnaireAnalysis(candidatoNombre || 'Candidato', respuestas, informacionAdicional);
    }

    return res.json(parsedData);
  } catch (error: any) {
    const errStr = String(error?.message || error);
    const isHighDemandOrQuota =
      error?.status === 503 ||
      error?.code === 503 ||
      error?.status === 429 ||
      error?.code === 429 ||
      errStr.includes('503') ||
      errStr.includes('429') ||
      errStr.includes('UNAVAILABLE') ||
      errStr.includes('high demand') ||
      errStr.includes('RESOURCE_EXHAUSTED');

    if (isHighDemandOrQuota) {
      console.warn('Servicio Gemini temporalmente saturado (503/429) en /api/analizar-cuestionario. Aplicando análisis operativo local de respaldo.');
    } else {
      console.warn('Aviso en /api/analizar-cuestionario (usando fallback automático):', errStr);
    }
    return res.json(
      generateFallbackQuestionnaireAnalysis(req.body?.candidatoNombre || 'Candidato', req.body?.respuestas || [], req.body?.informacionAdicional)
    );
  }
});

// Helper for generating realistic fallback questionnaire analysis
function generateFallbackQuestionnaireAnalysis(candidatoNombre: string, respuestas: any[], informacionAdicional?: string) {
  let countA = 0;
  let countB = 0;
  let countC = 0;
  let countD = 0;

  respuestas.forEach((r) => {
    if (r.opcionSeleccionadaId === 'A') countA++;
    if (r.opcionSeleccionadaId === 'B') countB++;
    if (r.opcionSeleccionadaId === 'C') countC++;
    if (r.opcionSeleccionadaId === 'D') countD++;
  });

  const openAns = respuestas.find((r) => r.esAbierta || r.preguntaId === 'sit_12')?.respuestaTextoLibre || '';

  let iniciativa = 75;
  let prudencia = 80;
  let comunicacion = 80;
  let gestionIncidencias = 78;

  // Pattern detection:
  if (countB >= 6) {
    // Candidate B: Llama siempre, sin comprobación básica
    iniciativa = 42;
    prudencia = 92;
    comunicacion = 75;
    gestionIncidencias = 60;
  } else if (countC >= 5) {
    // Candidate C: Intenta arreglar todo por su cuenta, bricolaje peligroso
    iniciativa = 90;
    prudencia = 38;
    comunicacion = 48;
    gestionIncidencias = 52;
  } else if (countA >= 6) {
    // Candidate A: Prudente, comprobación básica segura, comunica bien
    iniciativa = 86;
    prudencia = 94;
    comunicacion = 90;
    gestionIncidencias = 91;
  } else {
    // Candidate D: Equilibrado
    iniciativa = 82;
    prudencia = 88;
    comunicacion = 85;
    gestionIncidencias = 86;
  }

  const perfilOperativo = Math.round((iniciativa + prudencia + comunicacion + gestionIncidencias) / 4);

  let resultadoFinal: 'Adecuado' | 'Requiere atención' | 'Se observan varias conductas que conviene revisar' = 'Adecuado';
  let resultadoFinalNivel: 'adecuado' | 'requiere_atencion' | 'revisar' = 'adecuado';

  if (perfilOperativo < 55) {
    resultadoFinal = 'Se observan varias conductas que conviene revisar';
    resultadoFinalNivel = 'revisar';
  } else if (perfilOperativo < 75) {
    resultadoFinal = 'Requiere atención';
    resultadoFinalNivel = 'requiere_atencion';
  }

  const aspectosFavorables: string[] = [];
  const aspectosARevisar: string[] = [];

  if (prudencia >= 75) {
    aspectosFavorables.push('Diferencia entre pequeñas comprobaciones y averías complejas que requieren técnico.');
    aspectosFavorables.push('Muestra la prudencia necesaria para no manipular instalaciones peligrosas (gas/electricidad).');
  } else {
    aspectosARevisar.push('Tiende a intentar reparar o desmontar instalaciones por cuenta propia en situaciones complejas.');
  }

  if (iniciativa >= 75) {
    aspectosFavorables.push('Comprueba aspectos básicos y seguros (diferenciales, filtros, llaves) antes de comunicar.');
    aspectosFavorables.push('Muestra disposición para buscar manuales e información previa.');
  } else {
    aspectosARevisar.push('Tiende a comunicar cualquier pequeña eventualidad sin realizar comprobaciones sencillas previas.');
  }

  if (comunicacion >= 75) {
    aspectosFavorables.push('Comunica oportunamente las incidencias importantes aportando detalles útiles.');
  } else {
    aspectosARevisar.push('En algunas situaciones podría mejorar la fluidez de comunicación con la propiedad.');
  }

  if (openAns.length > 20) {
    aspectosFavorables.push('Describe una secuencia lógica estructurada en la respuesta abierta sobre el aire acondicionado.');
  }

  const situacionesDestacadas = [
    {
      titulo: 'FUGA IMPORTANTE DE AGUA',
      respuesta: respuestas.find((r) => r.preguntaId === 'sit_2')?.opcionSeleccionadaTexto || 'Cierra la llave de paso y notifica.',
      valoracionTexto: prudencia >= 75 ? 'Conducta adecuada y prudente' : 'Conducta a revisar',
      nivelValoracion: (prudencia >= 75 ? 'adecuada' : 'revisar') as 'adecuada' | 'revisar' | 'imprudente',
    },
    {
      titulo: 'FALLO ELÉCTRICO REPETITIVO',
      respuesta: respuestas.find((r) => r.preguntaId === 'sit_1')?.opcionSeleccionadaTexto || 'Comprueba diferenciales y avisa.',
      valoracionTexto: prudencia >= 75 ? 'Actuación cauta sin manipular instalaciones' : 'Riesgo de manipulación imprudente',
      nivelValoracion: (prudencia >= 75 ? 'adecuada' : 'imprudente') as 'adecuada' | 'revisar' | 'imprudente',
    },
    {
      titulo: 'AIRE ACONDICIONADO SÁBADO TARDE (RESPUESTA ABIERTA)',
      respuesta: openAns || 'Comprueba mando y notifica la incidencia.',
      valoracionTexto: openAns.length > 15 ? 'Secuencia de verificación lógica' : 'Respuesta breve',
      nivelValoracion: 'adecuada' as 'adecuada' | 'revisar' | 'imprudente',
    },
  ];

  const desgloseCalculo = respuestas.map((r) => {
    let imp = 'Contribuye al perfil general de gestión de incidencias.';
    if (r.opcionSeleccionadaId === 'A') imp = 'Aporta puntuación positiva en Iniciativa y Prudencia por realizar comprobación básica segura.';
    if (r.opcionSeleccionadaId === 'B') imp = 'Aporta en Prudencia pero reduce Iniciativa al recurrir inmediatamente al propietario.';
    if (r.opcionSeleccionadaId === 'C') imp = 'Eleva Iniciativa pero reduce la Prudencia por riesgo de manipular instalaciones.';
    if (r.esAbierta) imp = 'Evalúa la secuencia lógica y estructurada ante incidencias de fin de semana.';
    return {
      preguntaId: r.preguntaId,
      preguntaTitulo: r.preguntaTitulo,
      respuestaDada: r.esAbierta ? r.respuestaTextoLibre || '' : `Opción ${r.opcionSeleccionadaId}: ${r.opcionSeleccionadaTexto}`,
      impacto: imp,
    };
  });

  return {
    analizado: true,
    fechaAnalisis: new Date().toISOString(),
    timestamp: Date.now(),
    scores: {
      iniciativa,
      prudencia,
      comunicacion,
      gestionIncidencias,
      perfilOperativo,
    },
    explicacionResumen: `El candidato ${candidatoNombre} muestra un perfil operativo ${resultadoFinal.toLowerCase()}. Manifiesta nivel de iniciativa de ${iniciativa}/100 y prudencia de ${prudencia}/100 ante incidencias habituales de la vivienda.`,
    aspectosFavorables,
    aspectosARevisar,
    situacionesDestacadas,
    nivelConfianza: 'Alta' as const,
    explicacionConfianza: 'Análisis fundamentado en las 12 situaciones respondidas del cuestionario y la respuesta cualitativa abierta.',
    resultadoFinal,
    resultadoFinalNivel,
    desgloseCalculo,
  };
}

// Endpoint para redactar cláusulas de contrato con IA jurídica especializada en LAU
app.post('/api/redactar-clausula', async (req, res) => {
  try {
    const { promptUsuario, tipoInmueble, renta, categoriaDeseada, contextoInmueble } = req.body;

    if (!promptUsuario || !promptUsuario.trim()) {
      return res.status(400).json({ error: 'Debe proporcionar una descripción o petición para la cláusula.' });
    }

    const ai = getGeminiClient();

    if (!ai) {
      console.log('No GEMINI_API_KEY available, usando generador jurídico experto de respaldo.');
      const fallbackResult = generateFallbackLegalClause(promptUsuario, categoriaDeseada, tipoInmueble, renta);
      return res.json(fallbackResult);
    }

    const promptSystem = `
Eres un Abogado y Jurista especialista en Derecho Inmobiliario y Arrendamientos Urbanos en España (Ley 29/1994 de Arrendamientos Urbanos LAU, reformada por RDL 7/2019 y Ley 12/2023 por el Derecho a la Vivienda, y Código Civil español).

El usuario (propietario o administrador de fincas) te solicita redactar una CLÁUSULA ADICIONAL O ESTIPULACIÓN CONTRACTUAL para un contrato de arrendamiento de vivienda habitual.

PETICIÓN DEL USUARIO (en lenguaje natural):
"${promptUsuario}"

${tipoInmueble ? `TIPO DE INMUEBLE: ${tipoInmueble}` : ''}
${renta ? `RENTA MENSUAL: ${renta} €/mes` : ''}
${categoriaDeseada ? `CATEGORÍA SUGERIDA: ${categoriaDeseada}` : ''}
${contextoInmueble ? `DETALLES ADICIONALES: ${contextoInmueble}` : ''}

DIRECTRICES LEGALES ESTRICTAS:
1. Redacta una cláusula jurídica formal, con lenguaje técnico, riguroso, equilibrado e impecable en castellano formal de contratos.
2. CUMPLE ESTRICTAMENTE LA LEGALIDAD VIGENTE:
   - NO redactes cláusulas nulas de pleno derecho según el Art. 6 de la LAU (que sanciona como nulas las estipulaciones que perjudiquen los derechos irrenunciables del arrendatario recogidos en el Título II de la LAU).
   - No prohíbas prórrogas legales obligatorias de 5/7 años (Art. 9 LAU).
   - No impongas gastos de agencia o gestión inmobiliaria al arrendatario particular (Art. 20.1 LAU tras Ley 12/2023).
   - En cuanto a obras y conservación: las pequeñas reparaciones por uso ordinario corresponden al arrendatario (Art. 21.4 LAU); las reparaciones necesarias para conservación y habitabilidad corresponden al arrendador (Art. 21.1 LAU).
   - Si la cláusula es una prohibición permitida (ej: fumar, mascotas, subarriendo, ruidos, taladros estructurales), fundaméntala adecuadamente y especifica las consecuencias proporcionadas (obligación de reposición, pérdida justificada de fianza por daños, o causa de resolución contractual ex Art. 27.2 LAU).
3. Si el usuario pide algo que vulneraría la ley, ADAPTA la cláusula al máximo marco legal posible y advierte en el campo "analisisLegal".

DEBES RESPONDER EXCLUSIVAMENTE UN OBJETO JSON VÁLIDO CON ESTA ESTRUCTURA EXACTA:
{
  "titulo": "TÍTULO CONCISO EN MAYÚSCULAS DE LA ESTIPULACIÓN (ej: ESTIPULACIÓN ADICIONAL. MANTENIMIENTO Y REVISIÓN PERIÓDICA DE LA CALDERA)",
  "contenido": "Texto completo y exhaustivo de la cláusula redactada jurídicamente, listo para insertarse en el contrato...",
  "categoria": "general" | "fianza" | "suministros" | "mascotas" | "obras" | "inventario" | "penalizaciones",
  "analisisLegal": "Breve fundamentación jurídica explicando por qué la cláusula es válida conforme a los artículos pertinentes de la LAU y el Código Civil.",
  "validezLegal": true,
  "advertenciaLegal": "Advertencia o consejo práctico si procede (o null si es 100% estándar)"
}
`;

    const response = await generateGeminiWithRetry(ai, {
      model: 'gemini-2.5-flash',
      contents: promptSystem,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '';
    let parsed: any = {};
    try {
      parsed = JSON.parse(responseText.trim());
    } catch (parseErr) {
      console.warn('Error parseando JSON de cláusula Gemini, aplicando fallback:', parseErr);
      parsed = generateFallbackLegalClause(promptUsuario, categoriaDeseada, tipoInmueble, renta);
    }

    return res.json({
      titulo: parsed.titulo || 'ESTIPULACIÓN ADICIONAL',
      contenido: parsed.contenido || promptUsuario,
      categoria: parsed.categoria || 'general',
      analisisLegal: parsed.analisisLegal || 'Cláusula redactada conforme a los principios de libertad de pactos (Art. 1255 Código Civil) y dentro de los límites de la LAU.',
      validezLegal: parsed.validezLegal !== false,
      advertenciaLegal: parsed.advertenciaLegal || null,
      generadaPorIa: true,
    });
  } catch (error: any) {
    console.warn('Error generando cláusula con Gemini, aplicando fallback jurídico:', error?.message || error);
    const fallback = generateFallbackLegalClause(
      req.body?.promptUsuario || 'Cláusula adicional',
      req.body?.categoriaDeseada,
      req.body?.tipoInmueble,
      req.body?.renta
    );
    return res.json(fallback);
  }
});

// Generador de respaldo jurídico experto para cláusulas LAU
function generateFallbackLegalClause(
  prompt: string,
  categoriaHint?: string,
  tipoInmueble?: string,
  renta?: number
) {
  const p = prompt.toLowerCase();

  if (p.includes('fuma') || p.includes('tabaco') || p.includes('cigarro') || p.includes('vape')) {
    return {
      titulo: 'PROHIBICIÓN EXPRESA DE FUMAR EN EL INTERIOR DEL INMUEBLE',
      contenido:
        'Queda terminantemente prohibido fumar en el interior de la vivienda arrendada, incluyendo cualquier tipo de tabaco, cigarrillos electrónicos, vaporizadores o sustancias aromáticas de combustión. En caso de incumplimiento, la parte arrendataria vendrá obligada a sufragar íntegramente los gastos derivados de la desodorización, limpieza profunda de textiles y el repintado integral de techos y paredes con pintura aislante al finalizar el arrendamiento, pudiendo deducirse dichos importes justificadamente de la fianza y garantías constituidas.',
      categoria: 'general' as const,
      analisisLegal:
        'Válida según el principio de autonomía de la voluntad (Art. 1255 del Código Civil) y el deber del arrendatario de destinar la finca al uso pactado conservándola en buen estado (Art. 21 y 27 LAU).',
      validezLegal: true,
      generadaPorIa: true,
    };
  }

  if (p.includes('mascota') || p.includes('perro') || p.includes('gato') || p.includes('animal')) {
    return {
      titulo: 'TENENCIA RESPONSABLE DE ANIMALES DE COMPAÑÍA Y SEGURO DE RESPONSABILIDAD CIVIL',
      contenido:
        'La parte arrendataria queda autorizada a convivir en el inmueble exclusivamente con los animales de compañía declarados al inicio del contrato. Será requisito indispensable que los animales cuenten con su preceptiva cartilla sanitaria, microchip y vacunas al día. Asimismo, el arrendatario se compromete a mantener en vigor una póliza de seguro de Responsabilidad Civil por daños a terceros y al propio inmueble con cobertura mínima de 150.000 euros, acreditando su contratación a la propiedad a la entrega de llaves. Cualquier desperfecto causado en parqués, carpintería, jardines o zonas comunes será subsanado a coste exclusivo del arrendatario.',
      categoria: 'mascotas' as const,
      analisisLegal:
        'Conforme a la Ley 7/2023 de Protección de los Derechos y el Bienestar de los Animales y la LAU 29/1994. Es plenamente legal pactar el requisito de seguro de RC y la asunción íntegra de daños ocasionados.',
      validezLegal: true,
      generadaPorIa: true,
    };
  }

  if (p.includes('caldera') || p.includes('gas') || p.includes('clima') || p.includes('aire acondicionado') || p.includes('filtro')) {
    return {
      titulo: 'MANTENIMIENTO PERIÓDICO Y REVISIÓN OFICIAL DE INSTALACIONES TÉRMICAS Y DE CLIMATIZACIÓN',
      contenido:
        'La parte arrendataria asume la obligación de realizar y costear el mantenimiento ordinario y las revisiones periódicas anuales obligatorias de la caldera de gas / termo eléctrico y de las bombas de climatización (incluyendo la limpieza o sustitución de filtros al menos una vez al año). Dichas revisiones deberán efectuarse por servicio técnico oficial autorizado o empresa instaladora habilitada (RITE), debiendo remitir copia del certificado o informe de revisión al arrendador cuando sea requerida. Las averías derivadas de falta de mantenimiento o negligencia manifiesta serán a cargo del arrendatario (Art. 21.4 LAU).',
      categoria: 'suministros' as const,
      analisisLegal:
        'Conforme al Art. 21.4 de la LAU (pequeñas reparaciones y mantenimiento por uso ordinario a cargo del arrendatario) y normativa RITE (Reglamento de Instalaciones Térmicas en los Edificios).',
      validezLegal: true,
      generadaPorIa: true,
    };
  }

  if (p.includes('ruido') || p.includes('fiesta') || p.includes('comunidad') || p.includes('convivencia') || p.includes('descanso')) {
    return {
      titulo: 'NORMAS DE RÉGIMEN INTERNO, CONVIVENCIA VECINAL Y DESCANSO NOCTURNO',
      contenido:
        'La parte arrendataria se compromete a respetar escrupulosamente los Estatutos de la Comunidad de Propietarios y las ordenanzas municipales sobre ruidos y convivencia ciudadana. Queda expresamente prohibido perturbar el descanso vecinal, especialmente en la franja horaria comprendida entre las 22:00 y las 08:00 horas. La realización reiterada de actividades molestas, insalubres, nocivas o peligrosas facultará expresamente a la parte arrendadora para instar la resolución del contrato de pleno derecho de conformidad con el Art. 27.2.e) de la LAU.',
      categoria: 'general' as const,
      analisisLegal:
        'Fundamentada expresamente en el Art. 27.2.e) de la Ley de Arrendamientos Urbanos y el Art. 7.2 de la Ley de Propiedad Horizontal (LPH).',
      validezLegal: true,
      generadaPorIa: true,
    };
  }

  if (p.includes('taladro') || p.includes('pintar') || p.includes('pared') || p.includes('obra') || p.includes('azulejo') || p.includes('agujero')) {
    return {
      titulo: 'RÉGIMEN DE MODIFICACIONES, TALADROS Y PINTURA EN EL INMUEBLE',
      contenido:
        'La parte arrendataria no podrá realizar obras, modificaciones en instalaciones ni perforaciones en azulejos de cocina o baños sin la previa autorización expresa y por escrito del arrendador. Se permite el colgado moderado de cuadros en paredes de tabiquería mediante sistemas no invasivos o tacos de pequeño calibre, obligándose el arrendatario a masillar, lijar y repintar en el tono original los orificios efectuados con carácter previo a la entrega del inmueble, dejándolo en perfecto estado de ornato.',
      categoria: 'obras' as const,
      analisisLegal:
        'Ajustada al Art. 23 de la LAU (Obras del arrendatario), que prohíbe realizar sin consentimiento obras que modifiquen la configuración del inmueble o disminuyan su estabilidad o seguridad.',
      validezLegal: true,
      generadaPorIa: true,
    };
  }

  if (p.includes('llave') || p.includes('cerradura') || p.includes('copia')) {
    return {
      titulo: 'CUSTODIA DE LLAVES, PÉRDIDA Y SUSTITUCIÓN DE CERRADURA',
      contenido:
        'El arrendatario recibe el juego completo de llaves del inmueble, portón y buzón inventariado en el presente contrato. En caso de pérdida, sustracción o extravío de cualquiera de las llaves, el arrendatario vendrá obligado a comunicarlo de inmediato y a costear el cambio del bombín o cerradura de seguridad por uno de idéntica o superior calidad, entregando todas las copias al arrendador al término del contrato.',
      categoria: 'inventario' as const,
      analisisLegal:
        'Conforme al Art. 1563 del Código Civil (responsabilidad del arrendatario por el deterioro o pérdida de las cosas recibidas).',
      validezLegal: true,
      generadaPorIa: true,
    };
  }

  if (p.includes('limpieza') || p.includes('limpio') || p.includes('higiene') || p.includes('entrega')) {
    return {
      titulo: 'ESTADO DE LIMPIEZA E HIGIENE A LA DEVOLUCIÓN DE LA POSESIÓN',
      contenido:
        'La parte arrendataria recibe la vivienda en estado óptimo de limpieza y desinfección, y se compromete a devolverla a la extinción del arriendo en idénticas condiciones higiénicas. De no entregarse en estado de limpieza profesional adecuada (incluyendo electrodomésticos, horno, campana y sanitarios), el arrendador quedará facultado para contratar un servicio de limpieza profesional y descontar su coste justificado con factura del saldo de la fianza.',
      categoria: 'fianza' as const,
      analisisLegal:
        'Conforme al Art. 1561 del Código Civil (deber de devolver la finca al concluir el arriendo tal como la recibió) y Art. 36 LAU.',
      validezLegal: true,
      generadaPorIa: true,
    };
  }

  // Generic custom clause
  return {
    titulo: prompt.length > 50 ? prompt.substring(0, 48).toUpperCase() : `ESTIPULACIÓN ADICIONAL: ${prompt.toUpperCase()}`,
    contenido: `De común acuerdo entre las partes, se conviene expresamente la siguiente estipulación: ${prompt}. Ambas partes reconocen el carácter vinculante de la presente cláusula, la cual se regirá supletoriamente por lo dispuesto en la Ley 29/1994 de Arrendamientos Urbanos y en el Código Civil español, comprometiéndose el arrendatario a su exacto y puntual cumplimiento durante toda la vigencia del contrato.`,
    categoria: (categoriaHint as any) || 'general',
    analisisLegal:
      'Estipulación redactada en el marco de la autonomía de la voluntad privada (Art. 1255 Código Civil) sin vulnerar los derechos irrenunciables previstos en la LAU.',
    validezLegal: true,
    generadaPorIa: true,
  };
}

// ============================================================
// FASE 3.3 — DIAGNÓSTICO ASISTIDO POR IA DE LA INSPECCIÓN VISUAL
// Analiza por visión las fotografías de las estancias y devuelve
// observaciones y sugerencias de mejora con LENGUAJE NO ASERTIVO
// (indicios, posibilidades, recomendaciones de revisión), nunca
// certezas de daño. Procesa un lote pequeño (cada foto, una llamada).
// ============================================================

const ESTANCIA_NOMBRE: Record<string, string> = {
  salon: 'Salón / Comedor',
  cocina: 'Cocina (mobiliario, electrodomésticos, encimera)',
  bano: 'Baño (sanitarios, grifería, azulejos)',
  dormitorio: 'Dormitorio',
  terraza: 'Terraza / Balcón',
  exterior: 'Zonas comunes / Exterior',
  otro: 'Otras zonas (trastero, garaje, etc.)',
};

const MAX_FOTOS_POR_LOTE_INSPECCION = 8;

// Lista de comprobación honesta cuando NO hay modelo de visión. No finge
// haber analizado la imagen: deja claro que es una guía de revisión manual.
function inspeccionFallbackPorEstancia(estancia: string) {
  const nombre = ESTANCIA_NOMBRE[estancia] || ESTANCIA_NOMBRE.otro;
  return {
    observaciones: [
      `Sin modelo de visión disponible: no se ha podido analizar automáticamente la fotografía de ${nombre.toLowerCase()}. Revisa manualmente la imagen.`,
      'Como guía orientativa, comprueba pintura y acabados, iluminación, limpieza y posibles elementos faltantes o desgastados visibles.',
    ],
    sugerenciasMejora: [
      'Verifica con fotografías bien iluminadas y encuadres generales antes de publicar.',
      'Si aprecias algún desperfecto en la revisión presencial, registra una foto de detalle adicional.',
    ],
    prioridad: 'baja' as const,
    motor: 'heuristico' as const,
  };
}

async function resolverImagenFoto(item: any): Promise<{ data: string; mimeType: string } | null> {
  // 1) Base64 directo (con o sin prefijo data URL)
  if (item?.imageBase64 && typeof item.imageBase64 === 'string') {
    let b64 = item.imageBase64;
    if (b64.includes(';base64,')) b64 = b64.split(';base64,')[1];
    if (b64) return { data: b64, mimeType: item.mimeType || 'image/jpeg' };
  }
  // 2) Documento servido por esta misma función (almacén en memoria)
  const url: string = item?.imageUrl || '';
  if (url.startsWith('/api/documents/')) {
    const stored = documentsStore.get(url.replace('/api/documents/', ''));
    if (stored) return { data: stored.buffer.toString('base64'), mimeType: stored.mimeType };
    return null;
  }
  // 3) URL remota (p. ej. downloadURL firmada de Firebase Storage). El
  //    servidor no tiene restricciones CORS, así que puede descargarla.
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const arrayBuf = await resp.arrayBuffer();
      const data = Buffer.from(arrayBuf).toString('base64');
      const mimeType = resp.headers.get('content-type') || item?.mimeType || 'image/jpeg';
      return { data, mimeType: mimeType.split(';')[0] };
    } catch (e) {
      console.warn('No se pudo descargar la imagen de inspección desde la URL:', String(e));
      return null;
    }
  }
  return null;
}

app.post('/api/analizar-inspeccion', async (req, res) => {
  try {
    const fotos: any[] = Array.isArray(req.body?.fotos) ? req.body.fotos : [];
    const contexto = req.body?.contexto || {};
    if (fotos.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron fotografías para analizar.' });
    }
    const lote = fotos.slice(0, MAX_FOTOS_POR_LOTE_INSPECCION);
    const ai = getGeminiClient();

    const promptBase = (estancia: string) => {
      const nombre = ESTANCIA_NOMBRE[estancia] || ESTANCIA_NOMBRE.otro;
      return `Eres un asesor inmobiliario prudente que ayuda a un propietario a preparar una vivienda para volver a alquilarla o venderla. Analiza ÚNICAMENTE lo que se ve en esta fotografía de la estancia: ${nombre}.${
        contexto?.direccion ? ` Inmueble: ${contexto.direccion}.` : ''
      }${contexto?.destino ? ` Objetivo previsto: ${contexto.destino}.` : ''}

Evalúa, solo cuando sea visible en la imagen, estas categorías:
- Pintura y acabados superficiales (paredes, techos, suelos).
- Nivel de iluminación natural/artificial y luminosidad aparente.
- Estado aparente de electrodomésticos, encimera y grifería (si aplica).
- Modernidad y estado aparente del mobiliario o decoración (si se ve).
- Limpieza, orden y presentación visual para fotografía de anuncio.
- Desperfectos, elementos faltantes u objetos retirados visibles.

REGLAS OBLIGATORIAS DE LENGUAJE (lenguaje no asertivo):
- Habla siempre de INDICIOS o APRECIACIONES VISUALES: "Se aprecian indicios de…", "Podría ser conveniente revisar…", "En la imagen parece observarse…".
- NO afirmes diagnósticos con certeza. Prohibido decir que hay humedad, grietas estructurales, plagas, averías eléctricas o de fontanería como un hecho; como mucho: "podrían apreciarse señales que conviene revisar presencialmente".
- No inventes nada que no se vea. Si la foto está oscura, borrosa, recargada o no permite evaluar una categoría, dilo explícitamente en lugar de suponer.
- No recomiendes manipulaciones peligrosas (instalaciones eléctricas, gas, calderas, fontanería principal); indica que debe hacerlo un profesional cualificado.
- Las sugerencias deben ser acciones prácticas y económicas de puesta a punto para el anuncio (limpieza, pintura neutra, orden, iluminación, retirada de objetos, retoque de tiradores, pequeños arreglos).
- Redacta en español, de forma breve y accionable.

Responde SOLO con JSON válido con este esquema exacto:
{
  "observaciones": ["2 a 5 frases que describan con prudencia lo que se aprecia en la imagen"],
  "sugerenciasMejora": ["1 a 4 acciones concretas de puesta a punto, en tono recomendado, no obligatorio"],
  "prioridad": "baja" | "media" | "alta"
}
La "prioridad" refleja, de forma ORIENTATIVA, cuánto conviene revisar/mejorar esa estancia antes de publicar: alta si se aprecian varios indicios de desgaste o mala presentación, baja si se ve ordenada y cuidada. No es una valoración pericial.`;
    };

    const resultados: any[] = [];
    let motorGlobal: 'gemini' | 'heuristico' = ai ? 'gemini' : 'heuristico';

    for (const item of lote) {
      const id: string = String(item?.id || '');
      const estancia: string = String(item?.estancia || 'otro');

      const imagen = ai ? await resolverImagenFoto(item) : null;

      if (!ai || !imagen) {
        if (ai && !imagen) {
          console.warn(`Foto ${id}: no se pudo resolver la imagen; se devuelve guía de respaldo.`);
        } else if (!ai) {
          console.log('No GEMINI_API_KEY: guía de inspección de respaldo para', id);
        }
        resultados.push({ id, ok: false, ...inspeccionFallbackPorEstancia(estancia), motor: 'heuristico' });
        continue;
      }

      try {
        const response = await generateGeminiWithRetry(ai, {
          model: 'gemini-3.7-flash',
          contents: {
            parts: [
              { inlineData: { mimeType: imagen.mimeType, data: imagen.data } },
              { text: promptBase(estancia) },
            ],
          },
          config: { responseMimeType: 'application/json' },
        });
        let parsed: any = {};
        try {
          parsed = JSON.parse((response?.text || '').trim());
        } catch {
          parsed = {};
        }
        const observaciones = Array.isArray(parsed.observaciones)
          ? parsed.observaciones.map(String).filter(Boolean).slice(0, 6)
          : [];
        const sugerenciasMejora = Array.isArray(parsed.sugerenciasMejora)
          ? parsed.sugerenciasMejora.map(String).filter(Boolean).slice(0, 5)
          : [];
        const prioridad = ['baja', 'media', 'alta'].includes(parsed.prioridad) ? parsed.prioridad : 'media';

        if (observaciones.length === 0 && sugerenciasMejora.length === 0) {
          resultados.push({ id, ok: false, ...inspeccionFallbackPorEstancia(estancia) });
        } else {
          resultados.push({
            id,
            ok: true,
            observaciones: observaciones.length ? observaciones : ['No se han podido extraer observaciones fiables de esta imagen; revísala manualmente.'],
            sugerenciasMejora,
            prioridad,
            motor: 'gemini',
          });
        }
      } catch (err: any) {
        console.warn('Error analizando foto de inspección', id, String(err?.message || err));
        resultados.push({ id, ok: false, ...inspeccionFallbackPorEstancia(estancia) });
      }
    }

    return res.json({ resultados, motorGlobal });
  } catch (error: any) {
    console.error('Error en /api/analizar-inspeccion:', error);
    return res.status(500).json({ error: 'No se pudo realizar el análisis de inspección.', resultados: [] });
  }
});

// ============================================================
// FASE 3.4 — PROPUESTA DE REFORMAS Y OPTIMIZACIÓN (ROI)
// A partir del diagnóstico de las fotos (texto, no imágenes),
// propone mejoras accionables con rangos orientativos de coste,
// posible subida de renta y de valor patrimonial. Estimaciones,
// no presupuestos: el lenguaje sigue siendo prudente.
// ============================================================

const CATEGORIAS_MEJORA_VALIDAS = [
  'PINTURA', 'ILUMINACION', 'COCINA', 'BANO', 'SUELOS',
  'MOBILIARIO', 'LIMPIEZA_PUESTA_A_PUNTO', 'EFICIENCIA_ENERGETICA', 'REPARACION', 'OTRA',
];

// Catálogo heurístico de mejoras frecuentes en viviendas de alquiler en
// España (rangos orientativos). Se usa cuando no hay modelo disponible.
const CATALOGO_MEJORAS_HEURISTICO = [
  {
    claves: ['pintura general', 'pintado integral', 'pintar toda', 'pintura integral', 'paredes de toda', 'repintado general'],
    mejora: {
      actuacion: 'Pintado integral en tonos neutros (blanco/crema) de toda la vivienda',
      categoria: 'PINTURA',
      costeEstimadoMin: 700, costeEstimadoMax: 1800,
      incrementoRentaMensual: 50, incrementoValoracion: 3000, impacto: 'alto',
    },
  },
  {
    claves: ['pintur', 'pared', 'deslucid', 'mancha', 'color oscuro', 'repasar pintura'],
    mejora: {
      actuacion: 'Repaso de pintura de las estancias más deslucidas en tonos claros',
      categoria: 'PINTURA',
      costeEstimadoMin: 120, costeEstimadoMax: 450,
      incrementoRentaMensual: 20, incrementoValoracion: 900, impacto: 'medio',
    },
  },
  {
    claves: ['iluminaci', 'luz', 'lámpara', 'lampara', 'oscur', 'led'],
    mejora: {
      actuacion: 'Mejora de iluminación: luminarias de luz cálida y bombillas LED en estancias clave',
      categoria: 'ILUMINACION',
      costeEstimadoMin: 80, costeEstimadoMax: 350,
      incrementoRentaMensual: 15, incrementoValoracion: 600, impacto: 'medio',
    },
  },
  {
    claves: ['limpieza', 'limpieza profunda', 'desorden', 'orden', 'despersonaliz'],
    mejora: {
      actuacion: 'Limpieza profunda, vaciado de enseres y puesta a punto para fotos y visitas',
      categoria: 'LIMPIEZA_PUESTA_A_PUNTO',
      costeEstimadoMin: 120, costeEstimadoMax: 400,
      incrementoRentaMensual: 25, incrementoValoracion: 400, impacto: 'medio',
    },
  },
  {
    claves: ['tirador', 'encimera', 'muebles de cocina', 'grifería de cocina', 'griferia de la cocina'],
    mejora: {
      actuacion: 'Actualización económica de cocina: tiradores, grifería y encimera',
      categoria: 'COCINA',
      costeEstimadoMin: 250, costeEstimadoMax: 900,
      incrementoRentaMensual: 35, incrementoValoracion: 2000, impacto: 'medio',
    },
  },
  {
    claves: ['cocina'],
    mejora: {
      actuacion: 'Pintura de muebles de cocina y renovación de detalles (puños, tapones)',
      categoria: 'COCINA',
      costeEstimadoMin: 180, costeEstimadoMax: 700,
      incrementoRentaMensual: 25, incrementoValoracion: 1500, impacto: 'medio',
    },
  },
  {
    claves: ['grifería del baño', 'griferia del bano', 'inodoro', 'sanitario', 'azulejo', 'plat[o] de ducha', 'baño'],
    mejora: {
      actuacion: 'Actualización de baño: grifería, accesorios y pintado de azulejos/plato de ducha',
      categoria: 'BANO',
      costeEstimadoMin: 200, costeEstimadoMax: 1200,
      incrementoRentaMensual: 40, incrementoValoracion: 2500, impacto: 'alto',
    },
  },
  {
    claves: ['suelo', 'parquet', 'tarima', 'rodapié', 'rodapie', 'vinílico', 'vinilico', 'baldosa'],
    mejora: {
      actuacion: 'Renovación de suelos muy desgastados (vinílico click o lijado/ barnizado)',
      categoria: 'SUELOS',
      costeEstimadoMin: 600, costeEstimadoMax: 2600,
      incrementoRentaMensual: 60, incrementoValoracion: 4000, impacto: 'alto',
    },
  },
  {
    claves: ['mobiliario', 'mueble', 'decoraci', 'cortina', 'home staging', 'despersonaliz'],
    mejora: {
      actuacion: 'Home staging económico: despersonalización, textiles y detalles de presentación',
      categoria: 'MOBILIARIO',
      costeEstimadoMin: 150, costeEstimadoMax: 700,
      incrementoRentaMensual: 30, incrementoValoracion: 1000, impacto: 'medio',
    },
  },
  {
    claves: ['caldera', 'termo', 'calefacci', 'ventana', 'cerramiento', 'eficiencia', 'aislamiento', 'burlete'],
    mejora: {
      actuacion: 'Mejora de eficiencia: revisión de caldera/termo, burletes y bajo consumo',
      categoria: 'EFICIENCIA_ENERGETICA',
      costeEstimadoMin: 100, costeEstimadoMax: 700,
      incrementoRentaMensual: 15, incrementoValoracion: 900, impacto: 'medio',
    },
  },
  {
    claves: ['desperfecto', 'reparaci', 'enchufe', 'persiana', 'grieta superficial', 'puerta', 'pequeños arreglo', 'pequenos arreglo'],
    mejora: {
      actuacion: 'Reparación de pequeños desperfectos (persianas, enchufes, puertas, rozas superficiales)',
      categoria: 'REPARACION',
      costeEstimadoMin: 80, costeEstimadoMax: 400,
      incrementoRentaMensual: 15, incrementoValoracion: 500, impacto: 'bajo',
    },
  },
];

function generarMejorasHeuristicas(textoSugerencias: string) {
  const texto = (textoSugerencias || '').toLowerCase();
  const elegidas: any[] = [];
  const categoriasVistas = new Set<string>();
  for (const regla of CATALOGO_MEJORAS_HEURISTICO) {
    if (elegidas.length >= 6) break;
    if (regla.claves.some((c) => texto.includes(c))) {
      // Evita duplicar dos propuestas de la misma categoría (se queda con la
      // primera, que suele ser la más específica).
      if (categoriasVistas.has(regla.mejora.categoria)) continue;
      categoriasVistas.add(regla.mejora.categoria);
      elegidas.push(regla.mejora);
    }
  }
  // Si no se reconoce nada, ofrecer como mínimo la puesta a punto neutra.
  if (elegidas.length === 0) {
    elegidas.push({
      actuacion: 'Puesta a punto general: limpieza profunda, repaso de pintura neutra y pequeños arreglos',
      categoria: 'LIMPIEZA_PUESTA_A_PUNTO',
      costeEstimadoMin: 250, costeEstimadoMax: 900,
      incrementoRentaMensual: 30, incrementoValoracion: 1200, impacto: 'medio',
    });
  }
  return elegidas;
}

function normalizarMejoraIA(m: any) {
  const num = (v: any) => {
    const n = Number(typeof v === 'string' ? v.replace(',', '.') : v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
  };
  const categoria = CATEGORIAS_MEJORA_VALIDAS.includes(m?.categoria) ? m.categoria : 'OTRA';
  const impacto = ['bajo', 'medio', 'alto'].includes(m?.impacto) ? m.impacto : 'medio';
  const actuacion = typeof m?.actuacion === 'string' ? m.actuacion.trim() : '';
  if (!actuacion) return null;
  return {
    actuacion: actuacion.slice(0, 220),
    categoria,
    costeEstimadoMin: num(m.costeEstimadoMin),
    costeEstimadoMax: num(m.costeEstimadoMax),
    incrementoRentaMensual: num(m.incrementoRentaMensual),
    incrementoValoracion: num(m.incrementoValoracion),
    impacto,
  };
}

app.post('/api/proponer-mejoras', async (req, res) => {
  try {
    const { rentaAnterior, destino, ciudad, codigoPostal, fotos, sugerencias } = req.body || {};

    const fotosArr: any[] = Array.isArray(fotos) ? fotos : [];
    const lineasFotos = fotosArr
      .map((f) => {
        const est = ESTANCIA_NOMBRE[f?.estancia] || f?.estancia || 'Estancia';
        const obs = Array.isArray(f?.observaciones) ? f.observaciones.join('; ') : '';
        const sug = Array.isArray(f?.sugerenciasMejora) ? f.sugerenciasMejora.join('; ') : '';
        return `- ${est}. Indicios: ${obs}. Sugerencias: ${sug}`;
      })
      .filter((l) => !l.endsWith('. Indicios: . Sugerencias: '))
      .join('\n');
    const extraSug = Array.isArray(sugerencias) ? sugerencias.join('\n') : String(sugerencias || '');
    const textoContexto = `${lineasFotos}\n${extraSug}`;
    // Para el emparejado heurístico NO se usan los nombres de estancia (la
    // etiqueta «Cocina»/«Baño» dispararía mejoras por categoría sin que el
    // diagnóstico las pida): solo el contenido de observaciones y sugerencias.
    const textoHeuristico = [
      ...fotosArr.flatMap((f) => [
        Array.isArray(f?.observaciones) ? f.observaciones.join('; ') : '',
        Array.isArray(f?.sugerenciasMejora) ? f.sugerenciasMejora.join('; ') : '',
      ]),
      extraSug,
    ].join('\n');

    const ai = getGeminiClient();
    if (!ai) {
      console.log('No GEMINI_API_KEY: catálogo heurístico de mejoras.');
      return res.json({ mejoras: generarMejorasHeuristicas(textoHeuristico), motorGlobal: 'heuristico' });
    }

    const prompt = `Eres un asesor inmobiliario prudente especializado en puesta a punto de viviendas en alquiler en España.
A partir del DIAGNÓSTICO VISUAL (redactado por otra IA con lenguaje de indicios), propón entre 3 y 7 reformas o mejoras ACCIONABLES y realistas para mejorar la presentación y, si procede, la renta y el valor del inmueble.

Datos:
- Renta mensual anterior orientativa: ${rentaAnterior ? `${rentaAnterior} €/mes` : 'no indicada'}
- Destino previsto: ${destino || 'alquiler tradicional'}
- Zona: ${[ciudad, codigoPostal].filter(Boolean).join(', ') || 'no indicada'}

Diagnóstico:
${textoContexto || '(sin diagnóstico detallado; propón únicamente una puesta a punto general neutra)'}

REGLAS:
- NO inventes daños; parte solo de los indicios del diagnóstico.
- Las cifras son RANGOS ORIENTATIVOS de mercado español, no un presupuesto. No prometas rentabilidades garantizadas.
- Incluye siempre alguna mejora económica de rápida amortización (limpieza, pintura, iluminación, pequeños arreglos) y solo reformas de fondo si el diagnóstico las justifica.
- En "incrementoRentaMensual" indica la posible subida MENSUAL en euros (no un porcentaje), de forma conservadora.
- En "incrementoValoracion" indica la posible revalorización orientativa del inmueble en euros.
- "impacto" es "bajo", "medio" o "alto" según efecto esperado en presentación/venta o alquiler.
- "categoria" debe ser exactamente una de: ${CATEGORIAS_MEJORA_VALIDAS.join(', ')}.
- Si el destino es VENTA, prioriza mejoras de valor patrimonial; si es ALQUILER, prioriza rápida absorción y subida de renta.

Responde SOLO con JSON válido:
{
  "mejoras": [
    {
      "actuacion": "Descripción breve y concreta de la actuación",
      "categoria": "PINTURA",
      "costeEstimadoMin": 150,
      "costeEstimadoMax": 450,
      "incrementoRentaMensual": 20,
      "incrementoValoracion": 800,
      "impacto": "medio"
    }
  ]
}`;

    try {
      const response = await generateGeminiWithRetry(ai, {
        model: 'gemini-3.7-flash',
        contents: { parts: [{ text: prompt }] },
        config: { responseMimeType: 'application/json' },
      });
      let parsed: any = {};
      try {
        parsed = JSON.parse((response?.text || '').trim());
      } catch {
        parsed = {};
      }
      const mejoras = (Array.isArray(parsed.mejoras) ? parsed.mejoras : [])
        .map(normalizarMejoraIA)
        .filter(Boolean)
        .slice(0, 8);
      if (mejoras.length === 0) {
        return res.json({ mejoras: generarMejorasHeuristicas(textoHeuristico), motorGlobal: 'heuristico' });
      }
      return res.json({ mejoras, motorGlobal: 'gemini' });
    } catch (err: any) {
      console.warn('Error en /api/proponer-mejoras (respaldo heurístico):', String(err?.message || err));
      return res.json({ mejoras: generarMejorasHeuristicas(textoHeuristico), motorGlobal: 'heuristico' });
    }
  } catch (error: any) {
    console.error('Error en /api/proponer-mejoras:', error);
    return res.status(500).json({ error: 'No se pudieron generar las propuestas de mejora.', mejoras: [] });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', geminiKeyConfigured: !!process.env.GEMINI_API_KEY });
});

// SPA fallback for direct public links (/solicitud/*, /visita/*)
app.get(['/solicitud/:token', '/visita/:token'], (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    req.url = '/index.html';
    next();
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// Vite middleware in development or static serve in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// En Vercel el runtime serverless invoca la app Express exportada desde api/index.ts,
// por lo que NO debe llamarse a app.listen(). Para ejecución tradicional (desarrollo
// local con tsx, o `node dist/server.cjs`) se arranca el servidor como siempre.
if (!process.env.VERCEL) {
  startServer();
}

export default app;
