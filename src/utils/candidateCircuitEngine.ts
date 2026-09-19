import {
  Candidato,
  Inmueble,
  SolicitudDocumentacion,
  SolicitudSeguroImpago,
  ItemDocumentoSolicitado,
  ArchivoAportado,
  DocItemEstado,
  SolicitudDocEstado,
  DictamenAseguradora,
  DecisionFinalPropietarioSeguro,
  ConfiguracionAseguradora,
  DocumentoAdjuntoSeguro,
  CandidatoHistorialItem,
  SolicitudDocPublicData,
  TipoDocumento,
} from '../types';
import { generarDocumentosSugeridos } from './documentTemplates';

/**
 * MOTOR DE CIRCUITO COMPLETO DE CANDIDATO HASTA SEGURO DE IMPAGO Y DECISIÓN
 *
 * Flujo riguroso:
 * PRESELECCIÓN → SELECCIONADO → SOLICITUD DOC → DOC RECIBIDA → ANÁLISIS IA → SEGURO DE IMPAGO → DECISIÓN PROPIETARIO → HISTORIAL
 *
 * Principios:
 * 1. Idempotencia en cada paso (nunca duplicar solicitudes ni desvincular candidato/inmueble).
 * 2. La IA es ESTRICTAMENTE consultiva. Nunca toma la decisión de seleccionar, aceptar ni formalizar.
 * 3. Seguridad de aislamiento: el candidato solo accede a sus documentos solicitados vía token.
 * 4. Trazabilidad inmutable: cada cambio registra fecha, autor, acción y estado.
 * 5. Conservación de datos: los candidatos no seleccionados permanecen en el historial sin eliminarse.
 */

// Helper para obtener el nombre legible del inmueble
export function getInmuebleDisplayName(property: Inmueble): string {
  return (property as any).titulo || (property as any).nombre || property.direccion || 'Inmueble';
}

export function agregarHistorialCandidato(
  candidato: Candidato,
  evento: Omit<CandidatoHistorialItem, 'id' | 'fecha' | 'timestamp'> & { fecha?: string }
): Candidato {
  const now = new Date();
  const nuevoItem: CandidatoHistorialItem = {
    id: `chist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fecha: evento.fecha || now.toLocaleString('es-ES'),
    timestamp: now.getTime(),
    autor: evento.autor,
    autorNombre: evento.autorNombre || (evento.autor === 'propietario' ? 'Propietario' : evento.autor === 'sistema_ia' ? 'Sistema IA' : evento.autor === 'aseguradora' ? 'Aseguradora' : 'Candidato'),
    fase: evento.fase,
    accion: evento.accion,
    detalle: evento.detalle,
    estadoAnterior: evento.estadoAnterior || candidato.estado,
    estadoNuevo: evento.estadoNuevo || candidato.estado,
    metadatos: evento.metadatos,
  };

  const historialPrevio = candidato.historial || [];
  return {
    ...candidato,
    historial: [...historialPrevio, nuevoItem],
  };
}

// =========================================================================
// 2. FASE: PRESELECCIÓN DEL CANDIDATO
// =========================================================================

export function preseleccionarCandidato(
  candidato: Candidato,
  property: Inmueble,
  autor: 'propietario' | 'sistema_ia' = 'propietario',
  autorNombre?: string,
  observaciones?: string
): { candidatoActualizado: Candidato } {
  const estadoAnterior = candidato.estado;
  const now = new Date().toISOString();

  let candActualizado: Candidato = {
    ...candidato,
    estado: 'preseleccionado',
    fechaPreseleccion: now,
    inmuebleId: candidato.inmuebleId || property.id,
    inmuebleNombre: candidato.inmuebleNombre || getInmuebleDisplayName(property),
  };

  candActualizado = agregarHistorialCandidato(candActualizado, {
    autor,
    autorNombre,
    fase: 'preseleccion',
    accion: 'Candidato preseleccionado',
    detalle: observaciones || `Candidato preseleccionado para visita en inmueble ${candActualizado.inmuebleNombre}.`,
    estadoAnterior,
    estadoNuevo: 'preseleccionado',
    metadatos: {
      inmuebleId: property.id,
      inmuebleNombre: candActualizado.inmuebleNombre,
    },
  });

  return { candidatoActualizado: candActualizado };
}

export const preseleccionarCandidatoParaVisita = preseleccionarCandidato;

// =========================================================================
// 3. FASE: SELECCIÓN DEL CANDIDATO (IDEMPOTENTE Y PREPARACIÓN DOCUMENTAL)
// =========================================================================

export interface SeleccionCandidatoResult {
  candidatoActualizado: Candidato;
  solicitudDoc: SolicitudDocumentacion;
  esNuevaSolicitudDoc: boolean;
}

export function seleccionarCandidato(
  candidato: Candidato,
  property: Inmueble,
  solicitudesDocExistentes: SolicitudDocumentacion[],
  autor: 'propietario' = 'propietario',
  autorNombre?: string,
  motivo?: string
): SeleccionCandidatoResult {
  const estadoAnterior = candidato.estado;
  const nowIso = new Date().toISOString();
  const nowLegible = new Date().toLocaleString('es-ES');
  const nombreInmueble = getInmuebleDisplayName(property);

  // Comprobar IDEMPOTENCIA: ¿Ya existe una SolicitudDocumentacion para este candidato e inmueble?
  const solicitudExistente = solicitudesDocExistentes.find(
    (s) =>
      s.candidatoId === candidato.id ||
      (s.id && candidato.solicitudDocId && s.id === candidato.solicitudDocId) ||
      (s.candidatoTelefono && candidato.telefono && s.candidatoTelefono.replace(/\s+/g, '') === candidato.telefono.replace(/\s+/g, '') && (s.inmuebleId === property.id || s.inmuebleId === candidato.inmuebleId))
  );

  let solicitudDocFinal: SolicitudDocumentacion;
  let esNueva = false;

  if (solicitudExistente) {
    // Reutilizar solicitud existente sin duplicar
    solicitudDocFinal = {
      ...solicitudExistente,
      estado: solicitudExistente.estado === 'BORRADOR' ? 'SOLICITADA' : solicitudExistente.estado,
      historial: [
        ...solicitudExistente.historial,
        {
          id: `h-${Date.now()}`,
          fecha: nowLegible,
          autor: 'propietario',
          accion: 'Candidato seleccionado (Solicitud documental vinculada)',
          detalle: motivo || 'Candidato marcado como seleccionado; se mantiene la solicitud documental activa.',
        },
      ],
    };
  } else {
    // Crear nueva SolicitudDocumentacion adaptada al perfil
    esNueva = true;
    const token = `doc-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const itemsSugeridos = generarDocumentosSugeridos(candidato);

    // Deterministic ID preventing duplicate creation on simultaneous clicks
    const deterministicDocId = `doc-${candidato.id}-${property.id}`;
    solicitudDocFinal = {
      id: deterministicDocId,
      token,
      candidatoId: candidato.id,
      candidatoNombre: candidato.nombre,
      candidatoTelefono: candidato.telefono,
      candidatoEmail: candidato.email,
      inmuebleId: property.id,
      inmuebleNombre: nombreInmueble,
      inmuebleDireccion: property.direccion,
      inmuebleCiudad: property.ciudad,
      ownerId: property.propietarioId || property.propietarioPrincipalId,
      estado: 'SOLICITADA',
      mensajePropietario: `Hola ${candidato.nombre}, has sido seleccionado como candidato prioritario para el alquiler de ${nombreInmueble}. Por favor, aporta la documentación requerida para tramitar el expediente.`,
      documentos: itemsSugeridos,
      fechaCreacion: nowIso,
      fechaSolicitud: nowIso,
      historial: [
        {
          id: `h-${Date.now()}`,
          fecha: nowLegible,
          autor: 'propietario',
          accion: 'Solicitud de documentación creada tras selección',
          detalle: `Solicitud creada automáticamente con ${itemsSugeridos.length} documentos requeridos.`,
        },
      ],
    };
  }

  // Actualizar el candidato con vinculación al inmueble y propietario
  let candActualizado: Candidato = {
    ...candidato,
    propietarioId: candidato.propietarioId || property.propietarioId || property.propietarioPrincipalId,
    estado: 'seleccionado',
    fechaSeleccion: nowIso,
    seleccionadoMotivo: motivo || 'Seleccionado por el propietario como candidato preferente.',
    solicitudDocId: solicitudDocFinal.id,
    estadoDocumentacion: candidato.estadoDocumentacion === 'completa' ? 'completa' : 'solicitada',
  };

  candActualizado = agregarHistorialCandidato(candActualizado, {
    autor,
    autorNombre,
    fase: 'seleccion',
    accion: 'Candidato seleccionado como preferente',
    detalle: motivo || `Seleccionado para el inmueble ${nombreInmueble}. Solicitud documental preparada/activa (${solicitudDocFinal.id}).`,
    estadoAnterior,
    estadoNuevo: 'seleccionado',
    metadatos: {
      inmuebleId: property.id,
      solicitudDocId: solicitudDocFinal.id,
      tokenSolicitudDoc: solicitudDocFinal.token,
    },
  });

  return {
    candidatoActualizado: candActualizado,
    solicitudDoc: solicitudDocFinal,
    esNuevaSolicitudDoc: esNueva,
  };
}

// =========================================================================
// 4. FASE: GESTIÓN Y SUBIDA DE DOCUMENTACIÓN (CANDIDATO / PROPIETARIO)
// =========================================================================

export interface SubidaDocumentoResult {
  solicitudDocActualizada: SolicitudDocumentacion;
  candidatoActualizado?: Candidato;
  todosObligatoriosAportados: boolean;
}

export function registrarSubidaDocumento(
  solicitudDoc: SolicitudDocumentacion,
  itemId: string,
  archivo: ArchivoAportado,
  isFinalSubmit: boolean = false,
  candidato?: Candidato | null
): SubidaDocumentoResult {
  const nowIso = new Date().toISOString();
  const nowLegible = new Date().toLocaleString('es-ES');

  const docsActualizados = solicitudDoc.documentos.map((doc) => {
    if (doc.id === itemId) {
      const archivosExistentes = doc.archivos || [];
      return {
        ...doc,
        estado: 'subido' as DocItemEstado,
        motivoCorreccion: undefined, // Limpiar motivo previo si existía
        fechaSubida: nowIso,
        archivos: [...archivosExistentes, archivo],
      };
    }
    return doc;
  });

  // Comprobar obligatorios aportados
  const docsObligatorios = docsActualizados.filter((d) => d.obligatorio);
  const todosObligatoriosAportados = docsObligatorios.every(
    (d) => d.estado === 'subido' || d.estado === 'validado' || (d.archivos && d.archivos.length > 0)
  );

  let nuevoEstadoSolicitud: SolicitudDocEstado = solicitudDoc.estado;
  if (isFinalSubmit) {
    nuevoEstadoSolicitud = todosObligatoriosAportados ? 'COMPLETADA' : 'PARCIALMENTE_APORTADA';
  } else if (solicitudDoc.estado === 'SOLICITADA' || solicitudDoc.estado === 'BORRADOR') {
    nuevoEstadoSolicitud = 'PARCIALMENTE_APORTADA';
  }

  const docModificado = docsActualizados.find((d) => d.id === itemId);

  const solActualizada: SolicitudDocumentacion = {
    ...solicitudDoc,
    documentos: docsActualizados,
    estado: nuevoEstadoSolicitud,
    fechaEnvioCandidato: isFinalSubmit ? nowIso : solicitudDoc.fechaEnvioCandidato,
    historial: [
      ...solicitudDoc.historial,
      {
        id: `h-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        fecha: nowLegible,
        autor: 'candidato',
        accion: isFinalSubmit ? 'Documentación completada y enviada' : 'Archivo aportado',
        detalle: `Documento "${docModificado?.nombre || itemId}": aportado "${archivo.nombreArchivo}".`,
      },
    ],
  };

  let candActualizado: Candidato | undefined = undefined;
  if (candidato) {
    const estadoDoc = todosObligatoriosAportados ? 'completa' : 'parcial';
    const estadoCand = todosObligatoriosAportados && isFinalSubmit ? 'doc_recibida' : candidato.estado;

    candActualizado = {
      ...candidato,
      estadoDocumentacion: estadoDoc,
      estado: estadoCand,
    };

    candActualizado = agregarHistorialCandidato(candActualizado, {
      autor: 'candidato',
      fase: 'documentacion',
      accion: isFinalSubmit ? 'Documentación aportada completamente' : 'Nuevo archivo documental subido',
      detalle: `Archivo "${archivo.nombreArchivo}" subido en requisito "${docModificado?.nombre || itemId}".`,
      estadoAnterior: candidato.estado,
      estadoNuevo: candActualizado.estado,
    });
  }

  return {
    solicitudDocActualizada: solActualizada,
    candidatoActualizado: candActualizado,
    todosObligatoriosAportados,
  };
}

// =========================================================================
// 5. FASE: VALIDACIÓN O RECHAZO DOCUMENTAL POR EL PROPIETARIO
// =========================================================================

export function validarDocumentoExpediente(
  solicitudDoc: SolicitudDocumentacion,
  itemId: string,
  autorNombre?: string,
  candidato?: Candidato | null
): { solicitudDocActualizada: SolicitudDocumentacion; candidatoActualizado?: Candidato } {
  const nowIso = new Date().toISOString();
  const nowLegible = new Date().toLocaleString('es-ES');

  const targetDoc = solicitudDoc.documentos.find((d) => d.id === itemId);

  const docsActualizados = solicitudDoc.documentos.map((doc) =>
    doc.id === itemId
      ? {
          ...doc,
          estado: 'validado' as DocItemEstado,
          fechaValidacion: nowIso,
          motivoCorreccion: undefined,
        }
      : doc
  );

  const todosValidados = docsActualizados.every(
    (d) => !d.obligatorio || d.estado === 'validado'
  );

  const solActualizada: SolicitudDocumentacion = {
    ...solicitudDoc,
    documentos: docsActualizados,
    estado: todosValidados ? 'APROBADA' : solicitudDoc.estado,
    historial: [
      ...solicitudDoc.historial,
      {
        id: `h-${Date.now()}`,
        fecha: nowLegible,
        autor: 'propietario',
        accion: 'Documento validado',
        detalle: `El propietario validó "${targetDoc?.nombre || itemId}".`,
      },
    ],
  };

  let candActualizado: Candidato | undefined = undefined;
  if (candidato) {
    candActualizado = agregarHistorialCandidato(candidato, {
      autor: 'propietario',
      autorNombre,
      fase: 'documentacion',
      accion: 'Documento validado por el propietario',
      detalle: `Documento "${targetDoc?.nombre || itemId}" revisado y validado satisfactoriamente.`,
      estadoAnterior: candidato.estado,
      estadoNuevo: candidato.estado,
    });
  }

  return {
    solicitudDocActualizada: solActualizada,
    candidatoActualizado: candActualizado,
  };
}

export function rechazarDocumentoExpediente(
  solicitudDoc: SolicitudDocumentacion,
  itemId: string,
  motivo: string,
  autorNombre?: string,
  candidato?: Candidato | null
): { solicitudDocActualizada: SolicitudDocumentacion; candidatoActualizado?: Candidato } {
  const nowLegible = new Date().toLocaleString('es-ES');
  const targetDoc = solicitudDoc.documentos.find((d) => d.id === itemId);

  const docsActualizados = solicitudDoc.documentos.map((doc) =>
    doc.id === itemId
      ? {
          ...doc,
          estado: 'requiere_correccion' as DocItemEstado,
          motivoCorreccion: motivo,
        }
      : doc
  );

  const solActualizada: SolicitudDocumentacion = {
    ...solicitudDoc,
    documentos: docsActualizados,
    estado: 'REVISION_SOLICITADA',
    historial: [
      ...solicitudDoc.historial,
      {
        id: `h-${Date.now()}`,
        fecha: nowLegible,
        autor: 'propietario',
        accion: 'Corrección documental solicitada',
        detalle: `Documento "${targetDoc?.nombre || itemId}": ${motivo}`,
      },
    ],
  };

  let candActualizado: Candidato | undefined = undefined;
  if (candidato) {
    candActualizado = agregarHistorialCandidato(candidato, {
      autor: 'propietario',
      autorNombre,
      fase: 'documentacion',
      accion: 'Corrección solicitada al candidato',
      detalle: `Documento "${targetDoc?.nombre || itemId}" no válido: ${motivo}.`,
      estadoAnterior: candidato.estado,
      estadoNuevo: candidato.estado,
    });
  }

  return {
    solicitudDocActualizada: solActualizada,
    candidatoActualizado: candActualizado,
  };
}

// =========================================================================
// 6. CLASIFICACIÓN DOCUMENTAL DEL EXPEDIENTE
// =========================================================================

export type ClasificacionExpediente = 'COMPLETO' | 'INCOMPLETO' | 'REVISAR' | 'NO_VALIDO';

export interface EvaluacionClasificacionResult {
  clasificacion: ClasificacionExpediente;
  resumen: string;
  totalDocs: number;
  subidosDocs: number;
  validadosDocs: number;
  requierenCorreccionDocs: number;
  pendientesObligatoriosDocs: number;
}

export function clasificarExpedienteDocumental(
  solicitudDoc: SolicitudDocumentacion
): EvaluacionClasificacionResult {
  const items = solicitudDoc.documentos || [];
  const totalDocs = items.length;
  const subidosDocs = items.filter(
    (d) => d.estado === 'subido' || d.estado === 'validado' || (d.archivos && d.archivos.length > 0)
  ).length;
  const validadosDocs = items.filter((d) => d.estado === 'validado').length;
  const requierenCorreccionDocs = items.filter(
    (d) => d.estado === 'requiere_correccion' || d.estado === 'rechazado' || d.estado === 'revisar'
  ).length;
  const obligatorios = items.filter((d) => d.obligatorio);
  const pendientesObligatoriosDocs = obligatorios.filter(
    (d) => !d.archivos || d.archivos.length === 0 || d.estado === 'pendiente'
  ).length;

  let clasificacion: ClasificacionExpediente = 'INCOMPLETO';
  let resumen = '';

  if (requierenCorreccionDocs > 0) {
    clasificacion = 'REVISAR';
    resumen = `Hay ${requierenCorreccionDocs} documento(s) con solicitud de subsanación o revisión.`;
  } else if (pendientesObligatoriosDocs > 0) {
    clasificacion = 'INCOMPLETO';
    resumen = `Faltan ${pendientesObligatoriosDocs} documento(s) obligatorios por aportar.`;
  } else if (validadosDocs === totalDocs && totalDocs > 0) {
    clasificacion = 'COMPLETO';
    resumen = 'Todos los documentos del expediente han sido aportados y validados.';
  } else if (subidosDocs === totalDocs && totalDocs > 0) {
    clasificacion = 'COMPLETO';
    resumen = 'Todos los documentos han sido aportados y están listos para dictamen.';
  } else {
    clasificacion = 'INCOMPLETO';
    resumen = `${subidosDocs} de ${totalDocs} documentos aportados.`;
  }

  return {
    clasificacion,
    resumen,
    totalDocs,
    subidosDocs,
    validadosDocs,
    requierenCorreccionDocs,
    pendientesObligatoriosDocs,
  };
}

// =========================================================================
// 7. ANÁLISIS DOCUMENTAL IA (ESTRICTAMENTE CONSULTIVA)
// =========================================================================

export interface AnalisisIaDocumentalInput {
  ingresosDeclarados: number;
  ingresosDocumentados?: number;
  coherenciaWarnings?: string[];
  legibilidadDocs?: 'alta' | 'media' | 'baja';
  observacionesIa?: string;
}

export function registrarAnalisisDocumentalIA(
  candidato: Candidato,
  analisis: AnalisisIaDocumentalInput
): Candidato {
  const nowLegible = new Date().toLocaleString('es-ES');
  const diferencia =
    analisis.ingresosDocumentados !== undefined
      ? Math.abs(candidato.ingresosNetos - analisis.ingresosDocumentados)
      : 0;

  const tieneDiferenciaGrave = diferencia > candidato.ingresosNetos * 0.2;
  const detalleAnalisis = `Análisis consultivo IA completado. Ingresos declarados: ${candidato.ingresosNetos}€/mes. ${
    analisis.ingresosDocumentados ? `Documentados: ${analisis.ingresosDocumentados}€/mes.` : ''
  } ${analisis.observacionesIa || 'Sin alertas críticas detectadas.'}`;

  let candActualizado: Candidato = {
    ...candidato,
    estado: candidato.estado === 'seleccionado' || candidato.estado === 'doc_recibida' ? 'analizado' : candidato.estado,
    clasificacionDocumental: tieneDiferenciaGrave ? 'REVISAR' : 'COMPLETO',
    clasificacionDocumentalMotivo: detalleAnalisis,
  };

  candActualizado = agregarHistorialCandidato(candActualizado, {
    autor: 'sistema_ia',
    fase: 'analisis_ia',
    accion: 'Análisis documental consultivo emitido por IA',
    detalle: `${detalleAnalisis} (Nota: Dictamen consultivo, requiere confirmación humana del propietario).`,
    estadoAnterior: candidato.estado,
    estadoNuevo: candActualizado.estado,
    metadatos: {
      ingresosDeclarados: candidato.ingresosNetos,
      ingresosDocumentados: analisis.ingresosDocumentados,
      warningsCount: analisis.coherenciaWarnings?.length || 0,
    },
  });

  return candActualizado;
}

// =========================================================================
// 8. FASE: SOLICITUD DE SEGURO DE IMPAGO (IDEMPOTENTE)
// =========================================================================

export interface TramitacionSeguroResult {
  solicitudSeguro: SolicitudSeguroImpago;
  candidatoActualizado: Candidato;
  esNueva: boolean;
}

export function tramitarSolicitudSeguroImpago(
  candidato: Candidato,
  property: Inmueble,
  solicitudesSeguroExistentes: SolicitudSeguroImpago[],
  aseguradora: ConfiguracionAseguradora,
  rentaMensual: number,
  autor: 'propietario' = 'propietario',
  autorNombre?: string
): TramitacionSeguroResult {
  const nowIso = new Date().toISOString();
  const nowLegible = new Date().toLocaleString('es-ES');

  // IDEMPOTENCIA: Verificar si ya existe una solicitud de seguro activa para este candidato e inmueble
  const existente = solicitudesSeguroExistentes.find(
    (s) =>
      s.candidatoId === candidato.id &&
      s.inmuebleId === property.id &&
      s.estado !== 'CANCELADA'
  );

  if (existente) {
    // Reutilizar sin duplicar
    let candActualizado: Candidato = {
      ...candidato,
      estado: 'seguro_solicitado',
      solicitudSeguroId: existente.id,
    };
    candActualizado = agregarHistorialCandidato(candActualizado, {
      autor,
      autorNombre,
      fase: 'seguro',
      accion: 'Expediente de seguro de impago verificado (Existente)',
      detalle: `Reutilizada solicitud existente ref [${existente.referenciaUnica}] con ${existente.aseguradoraNombre}.`,
      estadoAnterior: candidato.estado,
      estadoNuevo: 'seguro_solicitado',
    });

    return {
      solicitudSeguro: existente,
      candidatoActualizado: candActualizado,
      esNueva: false,
    };
  }

  // Documentos adjuntos desde candidato
  const adjuntos: DocumentoAdjuntoSeguro[] = (candidato.documentosAnalizados || []).map((doc) => ({
    id: doc.id,
    nombre: doc.nombreArchivo,
    tipo: doc.tipoDocumento || 'otro',
    verificado: doc.estadoAnalisis === 'analizado',
    url: doc.url,
    base64Data: doc.base64Data,
    tamanoBytes: (doc as any).tamanoBytes || (doc as any).tamañoBytes,
  }));

  const ingresosTotales = candidato.ingresosNetos + (candidato.cotitular?.ingresosNetos || 0);
  const ratioEsfuerzo = rentaMensual > 0 ? Math.round((rentaMensual / ingresosTotales) * 100) : 0;
  const refCode = `REF-IMPAGO-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
  const nombreInmueble = getInmuebleDisplayName(property);

  const deterministicSeguroId = `seg_${candidato.id}_${property.id}`;
  const propOwnerId = property.propietarioId || property.propietarioPrincipalId;

  const nuevaSolicitudSeguro: SolicitudSeguroImpago = {
    id: deterministicSeguroId,
    referenciaUnica: refCode,
    candidatoId: candidato.id,
    inmuebleId: property.id,
    propietarioId: propOwnerId,
    inmuebleNombre: nombreInmueble,
    inmuebleDireccion: property.direccion || 'Dirección',
    inmuebleCiudad: property.ciudad || 'Ciudad',
    rentaMensual: rentaMensual || property.precio || 1000,
    aseguradoraId: aseguradora.id,
    aseguradoraNombre: aseguradora.nombre,
    aseguradoraEmail: aseguradora.emailTramitacion || 'tramitacion@aseguradora.com',
    numTitulares: (candidato.numTitularesContrato === 2 || candidato.cotitular) ? 2 : 1,
    titular1: {
      nombre: candidato.nombre,
      telefono: candidato.telefono,
      email: candidato.email,
      tipoEmpleo: candidato.tipoEmpleo,
      tipoContrato: candidato.tipoContrato,
      antiguedadLaboral: candidato.antiguedadLaboral,
      ingresosNetosMensuales: candidato.ingresosNetos,
    },
    titular2: candidato.cotitular
      ? {
          nombre: candidato.cotitular.nombre,
          telefono: candidato.cotitular.telefono,
          email: candidato.cotitular.email,
          tipoEmpleo: candidato.cotitular.tipoEmpleo || 'cuenta_ajena',
          tipoContrato: candidato.cotitular.tipoContrato || 'indefinido',
          antiguedadLaboral: candidato.cotitular.antiguedadLaboral || 'No indicada',
          ingresosNetosMensuales: candidato.cotitular.ingresosNetos || 0,
        }
      : undefined,
    tieneAvalista: !!candidato.avalista,
    ingresosTotalesConjuntos: ingresosTotales,
    ratioEsfuerzoCalculado: ratioEsfuerzo,
    documentosAdjuntos: adjuntos,
    documentacionCompletaSegunAseguradora: adjuntos.length >= 2,
    resumenSolvenciaIA: `Ratio esfuerzo: ${ratioEsfuerzo}%. Ingresos netos familiares: ${ingresosTotales} €/mes.`,
    scoreSolvenciaIA: candidato.scoreEstimado || 85,
    alertasDetectadasIA: ratioEsfuerzo > 40 ? ['Ratio de esfuerzo superior al 40%'] : [],
    nivelRiesgoIA: ratioEsfuerzo <= 35 ? 'Bajo' : ratioEsfuerzo <= 45 ? 'Medio' : 'Alto',
    estado: 'SOLICITUD_PENDIENTE',
    metodoEnvio: 'GMAIL_WEB',
    dictamenAseguradora: 'EN_ESTUDIO',
    procesadoConIA: false,
    decisionFinalPropietario: 'PENDIENTE',
    fechaCreacion: nowIso,
    fechaActualizacion: nowIso,
    historial: [
      {
        id: `h_${Date.now()}`,
        fecha: nowLegible,
        autor: 'propietario',
        accion: 'Solicitud de seguro de impago tramitada',
        detalle: `Expediente enviado a ${aseguradora.nombre} con referencia ${refCode}. Renta mensual: ${rentaMensual} €/mes.`,
      },
    ],
  };

  let candActualizado: Candidato = {
    ...candidato,
    propietarioId: candidato.propietarioId || propOwnerId,
    estado: 'seguro_solicitado',
    solicitudSeguroId: nuevaSolicitudSeguro.id,
  };

  candActualizado = agregarHistorialCandidato(candActualizado, {
    autor,
    autorNombre,
    fase: 'seguro',
    accion: 'Solicitud de seguro de impago tramitada a aseguradora',
    detalle: `Expediente enviado a ${aseguradora.nombre} (Ref: ${refCode}). Renta: ${rentaMensual} €/mes. En espera de resolución.`,
    estadoAnterior: candidato.estado,
    estadoNuevo: 'seguro_solicitado',
    metadatos: {
      referenciaUnica: refCode,
      aseguradoraNombre: aseguradora.nombre,
      rentaMensual,
    },
  });

  return {
    solicitudSeguro: nuevaSolicitudSeguro,
    candidatoActualizado: candActualizado,
    esNueva: true,
  };
}

// =========================================================================
// 9. RESPUESTA DE LA ASEGURADORA (FAVORABLE, CONDICIONADO, DESFAVORABLE, DOCS EXTRA)
// =========================================================================

export function registrarDictamenAseguradora(
  arg1: SolicitudSeguroImpago | Candidato,
  arg2: Candidato | SolicitudSeguroImpago,
  dictamen: DictamenAseguradora | 'APROBADA' | 'RECHAZADA' | 'CONDICIONADA',
  detalles:
    | string
    | {
        importeMaximo?: number;
        condiciones?: string[] | string;
        documentosExtra?: string[];
        comentario?: string;
      } = {},
  solicitudDoc?: SolicitudDocumentacion | null
): {
  solicitudSeguroActualizada: SolicitudSeguroImpago;
  solicitudActualizada: SolicitudSeguroImpago;
  candidatoActualizado: Candidato;
  solicitudDocActualizada?: SolicitudDocumentacion;
} {
  // Detect parameter order
  const isArg1Candidato = 'nombre' in arg1 && ('ingresosNetos' in arg1 || 'estado' in arg1 || 'email' in arg1);
  const candidato = (isArg1Candidato ? arg1 : arg2) as Candidato;
  const solicitudSeguro = (isArg1Candidato ? arg2 : arg1) as SolicitudSeguroImpago;

  const nowIso = new Date().toISOString();
  const nowLegible = new Date().toLocaleString('es-ES');
  const detallesObj = typeof detalles === 'string' ? { comentario: detalles } : detalles || {};

  const estadoSeguro: string =
    dictamen === 'APROBADA' || dictamen === 'FAVORABLE'
      ? 'APROBADA'
      : dictamen === 'RECHAZADA' || dictamen === 'DESFAVORABLE'
      ? 'RECHAZADA'
      : 'RESPUESTA_PROCESADA';

  const seguroActualizado: SolicitudSeguroImpago = {
    ...solicitudSeguro,
    estado: estadoSeguro as any,
    dictamenAseguradora: dictamen as any,
    fechaRecepcionRespuesta: nowIso,
    importeMaximoAsegurable: detallesObj.importeMaximo,
    condicionesEstipuladas: Array.isArray(detallesObj.condiciones)
      ? detallesObj.condiciones
      : detallesObj.condiciones
      ? [detallesObj.condiciones]
      : undefined,
    documentosSolicitadosExtra: detallesObj.documentosExtra,
    comentariosAseguradora: detallesObj.comentario,
    fechaActualizacion: nowIso,
    historial: [
      ...(solicitudSeguro?.historial || []),
      {
        id: `h_${Date.now()}`,
        fecha: nowLegible,
        autor: 'aseguradora',
        accion: `Dictamen recibido: ${dictamen}`,
        detalle: detallesObj.comentario || `Resolución de la aseguradora: ${dictamen}.`,
      },
    ],
  };

  // Determinar nuevo estado del candidato
  let nuevoEstadoCandidato: Candidato['estado'] = candidato.estado;
  if (dictamen === 'FAVORABLE' || dictamen === 'FAVORABLE_CONDICIONADO' || dictamen === 'APROBADA') {
    nuevoEstadoCandidato = 'aprobado_seguro';
  } else if (dictamen === 'DESFAVORABLE' || dictamen === 'RECHAZADA') {
    nuevoEstadoCandidato = 'rechazado_seguro';
  } else if (dictamen === 'DOCUMENTACION_REQUERIDA' || dictamen === 'CONDICIONADA') {
    nuevoEstadoCandidato = 'decision_pendiente';
  }

  let candActualizado: Candidato = {
    ...candidato,
    estado: nuevoEstadoCandidato,
    seguroDictamen: dictamen as any,
  };

  candActualizado = agregarHistorialCandidato(candActualizado, {
    autor: 'aseguradora',
    fase: 'seguro',
    accion: `Resolución de aseguradora: ${dictamen}`,
    detalle: detallesObj.comentario || `La aseguradora emitió dictamen ${dictamen}.`,
    estadoAnterior: candidato.estado,
    estadoNuevo: nuevoEstadoCandidato,
    metadatos: {
      dictamen,
      importeMaximo: detallesObj.importeMaximo,
      condiciones: detallesObj.condiciones,
      documentosExtra: detallesObj.documentosExtra,
    },
  });

  // Si la aseguradora solicita documentación extra, actualizar la solicitud documental si se proporciona
  let solDocActualizada: SolicitudDocumentacion | undefined = undefined;
  if (
    dictamen === 'DOCUMENTACION_REQUERIDA' &&
    solicitudDoc &&
    detallesObj.documentosExtra &&
    detallesObj.documentosExtra.length > 0
  ) {
    const nuevosItems: ItemDocumentoSolicitado[] = detallesObj.documentosExtra.map((nombreDoc, idx) => ({
      id: `req-extra-${Date.now()}-${idx}`,
      tipo: 'otro',
      nombre: `[Aseguradora Requerido] ${nombreDoc}`,
      descripcion: 'Documentación adicional solicitada expresamente por la compañía aseguradora para aprobar el expediente.',
      obligatorio: true,
      estado: 'pendiente',
      archivos: [],
    }));

    solDocActualizada = {
      ...solicitudDoc,
      estado: 'REVISION_SOLICITADA',
      documentos: [...solicitudDoc.documentos, ...nuevosItems],
      historial: [
        ...solicitudDoc.historial,
        {
          id: `h-${Date.now()}`,
          fecha: nowLegible,
          autor: 'propietario',
          accion: 'Documentación complementaria requerida por la aseguradora',
          detalle: `Se añadieron ${nuevosItems.length} requisitos documentales extras por solicitud de la aseguradora.`,
        },
      ],
    };
  }

  return {
    solicitudSeguroActualizada: seguroActualizado,
    solicitudActualizada: seguroActualizado,
    candidatoActualizado: candActualizado,
    solicitudDocActualizada: solDocActualizada,
  };
}

// =========================================================================
// 10. DECISIÓN FINAL DEL PROPIETARIO (ACEPTAR / RECHAZAR HUMANO)
// =========================================================================

export function registrarDecisionFinalPropietario(
  candidato: Candidato,
  decision: 'ACEPTAR' | 'RECHAZAR',
  motivo: string,
  autorNombre: string = 'Propietario',
  solicitudSeguro?: SolicitudSeguroImpago | null
): {
  candidatoActualizado: Candidato;
  solicitudSeguroActualizada?: SolicitudSeguroImpago;
} {
  // Validación estricta: RECHAZAR exige motivo obligatorio no vacío
  const trimmedMotivo = (motivo || '').trim();
  if (decision === 'RECHAZAR' && trimmedMotivo.length === 0) {
    throw new Error('Es obligatorio indicar un motivo justificativo para rechazar la candidatura.');
  }

  const nowIso = new Date().toISOString();
  const estadoAnterior = candidato.estado;

  const nuevoEstado: Candidato['estado'] =
    decision === 'ACEPTAR' ? 'aceptado_final' : 'rechazado_final';

  let candActualizado: Candidato = {
    ...candidato,
    estado: nuevoEstado,
    decisionFinal: decision,
    decisionFinalMotivo: trimmedMotivo || (decision === 'ACEPTAR' ? 'Candidatura aceptada por el propietario' : 'Rechazada'),
    decisionFinalFecha: nowIso,
    decisionFinalAutor: autorNombre,
  };

  candActualizado = agregarHistorialCandidato(candActualizado, {
    autor: 'propietario',
    autorNombre,
    fase: 'decision_final',
    accion: decision === 'ACEPTAR' ? 'Decisión final: Candidato Aceptado' : 'Decisión final: Candidato No Seleccionado',
    detalle: motivo,
    estadoAnterior,
    estadoNuevo: nuevoEstado,
    metadatos: {
      decision,
      motivo,
      autor: autorNombre,
    },
  });

  // Sincronizar en solicitud de seguro si existe
  let solSeguroActualizada: SolicitudSeguroImpago | undefined = undefined;
  if (solicitudSeguro) {
    const decisionSeguro: DecisionFinalPropietarioSeguro =
      decision === 'ACEPTAR' ? 'ACEPTAR_CANDIDATO' : 'RECHAZAR_CANDIDATO';

    solSeguroActualizada = {
      ...solicitudSeguro,
      decisionFinalPropietario: decisionSeguro,
      notasPrivadasPropietario: motivo,
      fechaDecisionPropietario: nowIso,
      fechaActualizacion: nowIso,
      historial: [
        ...solicitudSeguro.historial,
        {
          id: `h_${Date.now()}`,
          fecha: new Date().toLocaleString('es-ES'),
          autor: 'propietario',
          accion: `Decisión final registrada: ${decisionSeguro}`,
          detalle: motivo,
        },
      ],
    };
  }

  return {
    candidatoActualizado: candActualizado,
    solicitudSeguroActualizada: solSeguroActualizada,
  };
}

// =========================================================================
// 11. AISLAMIENTO Y SEGURIDAD: SANEAR DATOS PARA PORTAL PÚBLICO
// =========================================================================

export function sanearSolicitudParaPortalPublico(
  solicitud: SolicitudDocumentacion
): SolicitudDocPublicData {
  return {
    id: solicitud.id,
    token: solicitud.token,
    candidatoNombre: solicitud.candidatoNombre,
    candidatoTelefono: solicitud.candidatoTelefono,
    inmuebleNombre: solicitud.inmuebleNombre,
    inmuebleDireccion: solicitud.inmuebleDireccion,
    inmuebleCiudad: solicitud.inmuebleCiudad,
    fechaVisita: solicitud.fechaVisita,
    estado: solicitud.estado,
    mensajePropietario: solicitud.mensajePropietario,
    documentos: solicitud.documentos.map((doc) => ({
      id: doc.id,
      tipo: doc.tipo,
      nombre: doc.nombre,
      descripcion: doc.descripcion,
      obligatorio: doc.obligatorio,
      titular: doc.titular,
      estado: doc.estado,
      motivoCorreccion: doc.motivoCorreccion,
      archivos: (doc.archivos || []).map((f) => ({
        id: f.id,
        nombreArchivo: f.nombreArchivo,
        mimeType: f.mimeType,
        url: f.url,
        base64Data: f.base64Data,
        storagePath: f.storagePath,
        tamañoBytes: f.tamañoBytes,
        fechaSubida: f.fechaSubida,
      })),
      fechaSubida: doc.fechaSubida,
      fechaValidacion: doc.fechaValidacion,
    })),
    fechaCreacion: solicitud.fechaCreacion,
    fechaSolicitud: solicitud.fechaSolicitud,
    fechaEnvioCandidato: solicitud.fechaEnvioCandidato,
  };
}

// =========================================================================
// 12. HELPER OPERATIVOS Y VERIFICACIÓN DE TRANSICIONES DEL CIRCUITO
// =========================================================================

export function evaluarPreseleccionCandidato(
  candidato: Candidato,
  property: Inmueble
): { candidatoActualizado: Candidato; pasaPreseleccion: boolean; motivo?: string } {
  // Idempotencia: Si ya está preseleccionado, no modificar historial
  if (candidato.estado === 'preseleccionado') {
    return { candidatoActualizado: candidato, pasaPreseleccion: true };
  }

  const ingresos = candidato.ingresosNetos || 0;
  const renta = property.precio || 0;
  const ratio = renta > 0 ? ingresos / renta : 0;

  const pasa = ratio >= 2.5;

  if (pasa) {
    const nuevoHistorial: CandidatoHistorialItem[] = [
      ...(candidato.historial || []),
      {
        id: `h_pre_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fecha: new Date().toISOString().split('T')[0],
        autor: 'sistema_ia',
        fase: 'preseleccion',
        accion: 'Preselección automática',
        detalle: 'Aprobada',
      },
    ];

    const candidatoActualizado: Candidato = {
      ...candidato,
      estado: 'preseleccionado',
      inmuebleId: candidato.inmuebleId || property.id,
      inmuebleNombre: candidato.inmuebleNombre || getInmuebleDisplayName(property),
      historial: nuevoHistorial,
    };

    return { candidatoActualizado, pasaPreseleccion: true };
  }

  return {
    candidatoActualizado: candidato,
    pasaPreseleccion: false,
    motivo: 'Ratio de ingresos respecto al alquiler insuficiente (< 2.5x).',
  };
}

export function generarSolicitudDocumentacionParaCandidato(
  candidato: Candidato,
  property: Inmueble
): SolicitudDocumentacion {
  const solId = `doc-${candidato.id}-${property.id}`;
  const solToken = `tok_${candidato.id}_${property.id}`;
  const nowIso = new Date().toISOString();

  const documentosBase: ItemDocumentoSolicitado[] = [
    {
      id: `doc_dni_${candidato.id}`,
      tipo: 'dni_nie',
      nombre: 'DNI / NIE / Pasaporte en vigor',
      descripcion: 'Documento de identidad oficial vigente por ambas caras.',
      obligatorio: true,
      estado: 'pendiente',
      archivos: [],
    },
    {
      id: `doc_nominas_${candidato.id}`,
      tipo: 'nomina',
      nombre: 'Últimas 3 nóminas',
      descripcion: 'Justificante de ingresos regulares mensuales.',
      obligatorio: true,
      estado: 'pendiente',
      archivos: [],
    },
    {
      id: `doc_contrato_${candidato.id}`,
      tipo: 'contrato',
      nombre: 'Contrato de trabajo laboral',
      descripcion: 'Contrato firmado o vida laboral actualizada.',
      obligatorio: true,
      estado: 'pendiente',
      archivos: [],
    },
  ];

  return {
    id: solId,
    token: solToken,
    candidatoId: candidato.id,
    candidatoNombre: candidato.nombre,
    candidatoTelefono: candidato.telefono,
    candidatoEmail: candidato.email,
    inmuebleId: property.id,
    inmuebleNombre: getInmuebleDisplayName(property),
    inmuebleDireccion: property.direccion,
    inmuebleCiudad: property.ciudad,
    ownerId: property.propietarioId,
    estado: 'SOLICITADA',
    documentos: documentosBase,
    fechaCreacion: nowIso,
    fechaSolicitud: nowIso,
    historial: [
      {
        id: `h_${Date.now()}`,
        fecha: nowIso,
        autor: 'propietario',
        accion: 'Solicitud de documentación generada',
        detalle: 'Requisitos documentales iniciales enviados al candidato.',
      },
    ],
  };
}

export function generarSolicitudSeguroParaCandidato(
  candidato: Candidato,
  property: Inmueble,
  aseguradoraNombre: string = 'SEAG'
): SolicitudSeguroImpago {
  const id = `seg_${candidato.id}-${property.id}`;
  const ref = `REF-${candidato.id}-${property.id}`;
  const nowIso = new Date().toISOString();

  return {
    id,
    referenciaUnica: ref,
    candidatoId: candidato.id,
    inmuebleId: property.id,
    inmuebleNombre: getInmuebleDisplayName(property),
    inmuebleDireccion: property.direccion,
    inmuebleCiudad: property.ciudad,
    propietarioId: property.propietarioId,
    aseguradoraId: aseguradoraNombre.toLowerCase(),
    aseguradoraNombre,
    aseguradoraEmail: 'tramitacion@aseguradora.com',
    rentaMensual: property.precio || 0,
    numTitulares: 1,
    titular1: {
      nombre: candidato.nombre,
      telefono: candidato.telefono,
      email: candidato.email,
      tipoEmpleo: candidato.tipoEmpleo || 'cuenta_ajena',
      tipoContrato: 'indefinido',
      antiguedadLaboral: 'Más de 1 año',
      ingresosNetosMensuales: candidato.ingresosNetos || 0,
    },
    tieneAvalista: false,
    ingresosTotalesConjuntos: candidato.ingresosNetos || 0,
    ratioEsfuerzoCalculado: property.precio && candidato.ingresosNetos ? Math.round((property.precio / candidato.ingresosNetos) * 100) : 0,
    documentosAdjuntos: [],
    documentacionCompletaSegunAseguradora: true,
    resumenSolvenciaIA: 'Evaluación preliminar favorable para seguro de impago.',
    scoreSolvenciaIA: candidato.scoreEstimado || 75,
    alertasDetectadasIA: [],
    nivelRiesgoIA: 'Bajo',
    estado: 'SOLICITUD_PENDIENTE',
    metodoEnvio: 'MANUAL',
    dictamenAseguradora: 'EN_ESTUDIO',
    procesadoConIA: false,
    decisionFinalPropietario: 'PENDIENTE',
    fechaCreacion: nowIso,
    fechaActualizacion: nowIso,
    fechaEnvio: nowIso,
    historial: [
      {
        id: `h_seg_${Date.now()}`,
        fecha: nowIso,
        autor: 'propietario',
        accion: 'Solicitud enviada a la aseguradora',
        detalle: `Expediente generado con referencia ${ref}`,
      },
    ],
  };
}

export function evaluarCapacidadAnalisisIA(candidato: Candidato): {
  puedeAnalizar: boolean;
  motivo?: string;
} {
  const tieneDocs =
    candidato.estado === 'doc_recibida' ||
    (Array.isArray(candidato.documentosAnalizados) && candidato.documentosAnalizados.length > 0);

  return {
    puedeAnalizar: Boolean(tieneDocs),
    motivo: tieneDocs ? undefined : 'Falta documentación recibida para procesar análisis IA.',
  };
}

export function puedoEjecutarDecisionFinal(candidato: Candidato): boolean {
  return Boolean(
    candidato.estado === 'aprobado_seguro' ||
      candidato.seguroDictamen !== undefined ||
      candidato.estado === 'analizado' ||
      candidato.scoreEstimado !== undefined
  );
}

export function avanzarFaseCircuito(
  candidato: Candidato,
  nuevaFase: string
): { valido: boolean; candidatoActualizado?: Candidato; mensaje?: string } {
  if (candidato.estado === 'rechazado_final' && nuevaFase === 'aceptado_final') {
    return {
      valido: false,
      mensaje: 'Candidato rechazado definitivamente no puede ser aceptado por avance ordinario',
    };
  }

  return {
    valido: true,
    candidatoActualizado: {
      ...candidato,
      estado: nuevaFase as any,
    },
  };
}

