import {
  Candidato,
  Inmueble,
  ItemDocumentoSolicitado,
  SolicitudDocumentacion,
  TipoDocumento,
  SolicitudDocEstado,
  DocItemEstado,
} from '../types';

export interface DocTemplatePreset {
  tipo: TipoDocumento;
  nombre: string;
  descripcion: string;
  obligatorio: boolean;
  categoria: 'laboral_economica' | 'identidad' | 'bancaria' | 'garantias' | 'otros';
  aplicableA?: ('cuenta_ajena' | 'autonomo' | 'funcionario' | 'pensionista' | 'todos')[];
}

export const PRESET_DOCUMENTOS: DocTemplatePreset[] = [
  {
    tipo: 'dni_nie',
    nombre: 'DNI / NIE / Pasaporte (Vigente)',
    descripcion: 'Fotografía o escaneo nítido por ambas caras del documento de identidad en vigor.',
    obligatorio: true,
    categoria: 'identidad',
    aplicableA: ['todos'],
  },
  {
    tipo: 'nomina',
    nombre: 'Últimas 3 Nóminas',
    descripcion: 'Las tres nóminas más recientes firmadas o selladas por la empresa.',
    obligatorio: true,
    categoria: 'laboral_economica',
    aplicableA: ['cuenta_ajena', 'funcionario'],
  },
  {
    tipo: 'contrato',
    nombre: 'Contrato de Trabajo / Nombramiento',
    descripcion: 'Contrato laboral completo con anexos o justificante de toma de posesión/nombramiento.',
    obligatorio: true,
    categoria: 'laboral_economica',
    aplicableA: ['cuenta_ajena', 'funcionario'],
  },
  {
    tipo: 'vida_laboral',
    nombre: 'Informe de Vida Laboral Actualizado',
    descripcion: 'Informe oficial emitido por la Tesorería General de la Seguridad Social (últimos 30 días).',
    obligatorio: true,
    categoria: 'laboral_economica',
    aplicableA: ['cuenta_ajena', 'autonomo'],
  },
  {
    tipo: 'renta',
    nombre: 'Declaración de la Renta (Modelo 100)',
    descripcion: 'Declaración completa del último ejercicio fiscal con código seguro de verificación (CSV).',
    obligatorio: false,
    categoria: 'laboral_economica',
    aplicableA: ['todos'],
  },
  {
    tipo: 'otros_ingresos',
    nombre: 'Modelos Trimestrales IRPF / IVA (130 / 303)',
    descripcion: 'Declaraciones trimestrales del año en curso para acreditar ingresos recurrentes.',
    obligatorio: true,
    categoria: 'laboral_economica',
    aplicableA: ['autonomo'],
  },
  {
    tipo: 'justificante_bancario',
    nombre: 'Certificado de Titularidad Bancaria / Saldo',
    descripcion: 'Certificado emitido por la entidad bancaria donde figure el titular y el número de cuenta.',
    obligatorio: false,
    categoria: 'bancaria',
    aplicableA: ['todos'],
  },
  {
    tipo: 'avalista',
    nombre: 'Documentación del Avalista / Garantes',
    descripcion: 'DNI, últimas nóminas o declaración de la renta del avalista acreditado.',
    obligatorio: false,
    categoria: 'garantias',
    aplicableA: ['todos'],
  },
  {
    tipo: 'otro',
    nombre: 'Carta de Recomendación / Justificante adicional',
    descripcion: 'Documentos complementarios que sumen garantías al perfil (referencias previas, etc.).',
    obligatorio: false,
    categoria: 'otros',
    aplicableA: ['todos'],
  },
];

/**
 * Genera la lista sugerida de documentos a solicitar según el perfil del candidato
 * (adaptándose a 1 o 2 titulares, tipo de empleo, y si tiene avalista).
 */
export function generarDocumentosSugeridos(candidato: Candidato): ItemDocumentoSolicitado[] {
  const items: ItemDocumentoSolicitado[] = [];
  const esDosTitulares = candidato.numTitularesContrato === 2 || !!candidato.cotitular;
  const esAutonomo = candidato.tipoEmpleo === 'autonomo';
  const esPensionista = candidato.tipoEmpleo === 'pensionista';

  // 1. DNI Candidato Principal
  items.push({
    id: `req-dni-1-${Date.now()}`,
    tipo: 'dni_nie',
    nombre: esDosTitulares ? `DNI / NIE — ${candidato.nombre.split(' ')[0]}` : 'DNI / NIE (Ambas caras)',
    descripcion: 'Documento de identidad oficial en vigor (anverso y reverso).',
    obligatorio: true,
    titular: esDosTitulares ? 'titular_1' : 'general',
    estado: 'pendiente',
    archivos: [],
  });

  // 2. DNI Cotitular (si aplica)
  if (esDosTitulares) {
    const nombreCotitular = candidato.cotitular?.nombre || 'Cotitular';
    items.push({
      id: `req-dni-2-${Date.now()}`,
      tipo: 'dni_nie',
      nombre: `DNI / NIE — ${nombreCotitular.split(' ')[0]}`,
      descripcion: 'Documento de identidad oficial en vigor del segundo titular.',
      obligatorio: true,
      titular: 'titular_2',
      estado: 'pendiente',
      archivos: [],
    });
  }

  // 3. Documentación económica / laboral Titular 1
  if (esAutonomo) {
    items.push({
      id: `req-trimestres-1-${Date.now()}`,
      tipo: 'otros_ingresos',
      nombre: esDosTitulares ? `Modelos 130 / 303 — ${candidato.nombre.split(' ')[0]}` : 'Modelos Trimestrales (130 / 303)',
      descripcion: 'Trimestres de IRPF e IVA del año en curso.',
      obligatorio: true,
      titular: esDosTitulares ? 'titular_1' : 'general',
      estado: 'pendiente',
      archivos: [],
    });
    items.push({
      id: `req-renta-1-${Date.now()}`,
      tipo: 'renta',
      nombre: esDosTitulares ? `Declaración IRPF — ${candidato.nombre.split(' ')[0]}` : 'Declaración de la Renta (IRPF)',
      descripcion: 'Última declaración de la renta presentada.',
      obligatorio: true,
      titular: esDosTitulares ? 'titular_1' : 'general',
      estado: 'pendiente',
      archivos: [],
    });
  } else if (esPensionista) {
    items.push({
      id: `req-pension-1-${Date.now()}`,
      tipo: 'otros_ingresos',
      nombre: 'Certificado de Revalorización de Pensión',
      descripcion: 'Certificado oficial de pensión emitido por la Seguridad Social.',
      obligatorio: true,
      titular: esDosTitulares ? 'titular_1' : 'general',
      estado: 'pendiente',
      archivos: [],
    });
  } else {
    // Cuenta ajena o funcionario
    items.push({
      id: `req-nominas-1-${Date.now()}`,
      tipo: 'nomina',
      nombre: esDosTitulares ? `3 Últimas Nóminas — ${candidato.nombre.split(' ')[0]}` : '3 Últimas Nóminas',
      descripcion: 'Nóminas de los últimos tres meses selladas o firmadas.',
      obligatorio: true,
      titular: esDosTitulares ? 'titular_1' : 'general',
      estado: 'pendiente',
      archivos: [],
    });
    items.push({
      id: `req-contrato-1-${Date.now()}`,
      tipo: 'contrato',
      nombre: esDosTitulares ? `Contrato de Trabajo — ${candidato.nombre.split(' ')[0]}` : 'Contrato de Trabajo',
      descripcion: 'Contrato laboral completo en vigor o documento de prórroga.',
      obligatorio: true,
      titular: esDosTitulares ? 'titular_1' : 'general',
      estado: 'pendiente',
      archivos: [],
    });
    items.push({
      id: `req-vidalab-1-${Date.now()}`,
      tipo: 'vida_laboral',
      nombre: esDosTitulares ? `Vida Laboral — ${candidato.nombre.split(' ')[0]}` : 'Vida Laboral Actualizada',
      descripcion: 'Informe de vida laboral reciente de la Seguridad Social.',
      obligatorio: true,
      titular: esDosTitulares ? 'titular_1' : 'general',
      estado: 'pendiente',
      archivos: [],
    });
  }

  // 4. Documentación económica / laboral Titular 2 (si aplica)
  if (esDosTitulares) {
    const nombreCotitular = candidato.cotitular?.nombre || 'Cotitular';
    const cotitularEsAutonomo = candidato.cotitular?.tipoEmpleo === 'autonomo';

    if (cotitularEsAutonomo) {
      items.push({
        id: `req-trimestres-2-${Date.now()}`,
        tipo: 'otros_ingresos',
        nombre: `Modelos Trimestrales — ${nombreCotitular.split(' ')[0]}`,
        descripcion: 'Trimestres de IRPF e IVA del segundo titular.',
        obligatorio: true,
        titular: 'titular_2',
        estado: 'pendiente',
        archivos: [],
      });
    } else {
      items.push({
        id: `req-nominas-2-${Date.now()}`,
        tipo: 'nomina',
        nombre: `3 Últimas Nóminas — ${nombreCotitular.split(' ')[0]}`,
        descripcion: 'Nóminas recientes del segundo titular.',
        obligatorio: true,
        titular: 'titular_2',
        estado: 'pendiente',
        archivos: [],
      });
      items.push({
        id: `req-contrato-2-${Date.now()}`,
        tipo: 'contrato',
        nombre: `Contrato de Trabajo — ${nombreCotitular.split(' ')[0]}`,
        descripcion: 'Contrato laboral del segundo titular.',
        obligatorio: true,
        titular: 'titular_2',
        estado: 'pendiente',
        archivos: [],
      });
    }
  }

  // 5. Avalista si está indicado
  if (candidato.avalista) {
    items.push({
      id: `req-aval-${Date.now()}`,
      tipo: 'avalista',
      nombre: 'Documentación del Avalista',
      descripcion: 'DNI y últimas 2 nóminas o declaración de la renta del avalista.',
      obligatorio: true,
      titular: 'avalista',
      estado: 'pendiente',
      archivos: [],
    });
  }

  return items;
}

/**
 * Crea una nueva SolicitudDocumentacion asociada a candidato, inmueble y visita
 */
export function buildSolicitudDocumentacion(
  candidato: Candidato,
  inmueble: Inmueble,
  documentos: ItemDocumentoSolicitado[],
  options?: {
    visitaId?: string;
    fechaVisita?: string;
    mensajePropietario?: string;
    ownerId?: string;
  }
): SolicitudDocumentacion {
  const token = `doc-${candidato.id.replace(/[^a-zA-Z0-9]/g, '')}-${Math.random().toString(36).substring(2, 8)}`;
  const nowStr = new Date().toISOString();
  const fechaFormateada = new Date().toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    id: `sol-doc-${candidato.id}-${Date.now()}`,
    token,
    candidatoId: candidato.id,
    candidatoNombre: candidato.nombre,
    candidatoTelefono: candidato.telefono,
    candidatoEmail: candidato.email,
    inmuebleId: inmueble.id,
    inmuebleNombre: inmueble.direccion,
    inmuebleDireccion: inmueble.direccion,
    inmuebleCiudad: inmueble.ciudad,
    visitaId: options?.visitaId,
    fechaVisita: options?.fechaVisita,
    ownerId: options?.ownerId || 'propietario',
    estado: 'SOLICITADA',
    mensajePropietario: options?.mensajePropietario || 'Gracias por realizar la visita. Para avanzar en el proceso de selección y formalización del alquiler, te solicitamos aportar los siguientes documentos a través de este enlace seguro.',
    documentos,
    fechaCreacion: nowStr,
    fechaSolicitud: nowStr,
    historial: [
      {
        id: `h-${Date.now()}`,
        fecha: fechaFormateada,
        autor: 'propietario',
        accion: 'Solicitud de documentación enviada',
        detalle: `Se han solicitado ${documentos.length} documentos tras la visita`,
      },
    ],
  };
}

/**
 * Genera el texto del mensaje de WhatsApp para enviar la solicitud de documentación
 */
export function generarMensajeWhatsappSolicitud(solicitud: SolicitudDocumentacion): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const urlPublica = `${origin}/#documentacion/${solicitud.token}`;
  const primerNombre = solicitud.candidatoNombre.split(' ')[0];

  const totalObligatorios = solicitud.documentos.filter((d) => d.obligatorio).length;

  let texto = `Hola ${primerNombre}.\n\n`;
  texto += `Tras la visita a la vivienda en *${solicitud.inmuebleNombre}*, para poder avanzar en el proceso de alquiler y tramitar la preselección formal, necesitamos que nos aportes la siguiente documentación:\n\n`;

  solicitud.documentos.forEach((doc, idx) => {
    texto += `${idx + 1}. *${doc.nombre}*${doc.obligatorio ? ' (Obligatorio)' : ' (Opcional)'}\n`;
  });

  texto += `\nPuedes subir los documentos cómodamente desde tu móvil u ordenador a través de este enlace seguro privado (sin necesidad de crear cuenta ni registrarte):\n\n`;
  texto += `${urlPublica}\n\n`;

  if (solicitud.mensajePropietario) {
    texto += `*Nota del propietario:* ${solicitud.mensajePropietario}\n\n`;
  }

  texto += `Los archivos se reciben directamente en la plataforma. Si tienes cualquier consulta, no dudes en escribirnos por aquí.\n\nUn saludo.`;

  return texto;
}

/**
 * Helper para obtener estilos e información de estado de la Solicitud de Documentación
 */
export function getSolicitudDocEstadoInfo(estado: SolicitudDocEstado) {
  switch (estado) {
    case 'COMPLETADA':
      return {
        label: 'Documentación Completa',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        dotClass: 'bg-emerald-500',
      };
    case 'PARCIALMENTE_APORTADA':
      return {
        label: 'Aportada Parcialmente',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-300',
        dotClass: 'bg-blue-500 animate-pulse',
      };
    case 'REVISION_SOLICITADA':
      return {
        label: 'Corrección Solicitada',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        dotClass: 'bg-amber-500',
      };
    case 'APROBADA':
      return {
        label: 'Documentación Validada',
        badgeClass: 'bg-teal-100 text-teal-800 border-teal-300',
        dotClass: 'bg-teal-500',
      };
    case 'RECHAZADA':
      return {
        label: 'Rechazada',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
        dotClass: 'bg-rose-500',
      };
    case 'SOLICITADA':
    default:
      return {
        label: 'Solicitud Enviada',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        dotClass: 'bg-indigo-500',
      };
  }
}
