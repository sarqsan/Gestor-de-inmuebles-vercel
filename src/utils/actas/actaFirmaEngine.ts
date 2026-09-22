import { Acta, FirmaActa, ParticipanteActa, HistorialActa } from '../../types/actas';
import { validarTransicion } from './actaStateMachine';

export function crearFirmaActa(
  actaId: string,
  versionActa: number,
  participante: ParticipanteActa,
  metodo: FirmaActa['metodo'] = 'OTP'
): FirmaActa {
  const ahora = new Date().toISOString();
  return {
    id: `firma_${actaId}_${participante.id}_${Date.now()}`,
    actaId,
    versionActa,
    firmanteId: participante.id,
    firmanteNombre: participante.nombre,
    firmanteDni: participante.dni,
    firmanteRol: participante.rol,
    estado: 'PENDIENTE',
    metodo,
    trazabilidad: [
      { id: `tr_${Date.now()}`, fecha: ahora, accion: 'CREADA', detalle: `Firma creada para ${participante.nombre}` },
    ],
  };
}

export function solicitarFirma(firma: FirmaActa): FirmaActa {
  if (firma.estado !== 'PENDIENTE') throw new Error('Solo se puede solicitar firma en estado PENDIENTE');
  const ahora = new Date().toISOString();
  return {
    ...firma,
    estado: 'SOLICITADA',
    fechaSolicitud: ahora,
    trazabilidad: [
      ...(firma.trazabilidad || []),
      { id: `tr_${Date.now()}`, fecha: ahora, accion: 'SOLICITADA', detalle: 'Solicitud de firma enviada' },
    ],
  };
}

export function validarFirmaConOtp(firma: FirmaActa): FirmaActa {
  if (firma.estado !== 'SOLICITADA') throw new Error('Firma debe estar SOLICITADA para validar OTP');
  const ahora = new Date().toISOString();
  return {
    ...firma,
    estado: 'VALIDADA',
    trazabilidad: [
      ...(firma.trazabilidad || []),
      { id: `tr_${Date.now()}`, fecha: ahora, accion: 'OTP_VALIDADO', detalle: 'OTP validado correctamente' },
    ],
  };
}

export function completarFirma(firma: FirmaActa, ip?: string, userAgent?: string): FirmaActa {
  if (firma.metodo !== 'MANUAL') {
    if (firma.estado !== 'VALIDADA' && firma.estado !== 'SOLICITADA') {
      throw new Error('Firma debe estar VALIDADA o SOLICITADA para completar (OTP)');
    }
  } else {
    if (firma.estado === 'FIRMADA') {
      throw new Error('Firma ya completada');
    }
  }
  const ahora = new Date().toISOString();
  return {
    ...firma,
    estado: 'FIRMADA',
    fechaFirma: ahora,
    ip,
    userAgent,
    trazabilidad: [
      ...(firma.trazabilidad || []),
      { id: `tr_${Date.now()}`, fecha: ahora, accion: 'FIRMADA', detalle: `Firmada por ${firma.firmanteNombre}` },
    ],
  };
}

export function rechazarFirma(firma: FirmaActa, motivo?: string): FirmaActa {
  const ahora = new Date().toISOString();
  return {
    ...firma,
    estado: 'RECHAZADA',
    trazabilidad: [
      ...(firma.trazabilidad || []),
      { id: `tr_${Date.now()}`, fecha: ahora, accion: 'RECHAZADA', detalle: motivo || 'Firma rechazada' },
    ],
  };
}

export function todasFirmasCompletadas(acta: Acta): boolean {
  const requeridas = acta.participantes.filter(p => p.firmaRequerida);
  if (requeridas.length === 0) return true;
  const firmasMap = new Map(acta.firmas.map(f => [f.firmanteId, f]));
  return requeridas.every(p => {
    const f = firmasMap.get(p.id);
    return f && f.estado === 'FIRMADA';
  });
}

export function puedeFirmarActa(acta: Acta): { puede: boolean; motivo?: string } {
  if (acta.estado !== 'PENDIENTE_FIRMA') {
    return { puede: false, motivo: `Acta no está en PENDIENTE_FIRMA, está en ${acta.estado}` };
  }
  if (acta.version < 1) {
    return { puede: false, motivo: 'Versión de acta no válida' };
  }
  return { puede: true };
}

export function prepararActaParaFirma(
  acta: Acta,
  usuario: string,
  usuarioId?: string
): { actaActualizada: Acta; historialItem: HistorialActa } {
  validarTransicion(acta.estado, 'PENDIENTE_FIRMA');
  
  const ahora = new Date().toISOString();
  const firmas: FirmaActa[] = acta.participantes
    .filter(p => p.firmaRequerida)
    .map(p => crearFirmaActa(acta.id, acta.version, p, 'OTP'))
    .map(f => solicitarFirma(f));

  const historialItem: HistorialActa = {
    id: `hist_${Date.now()}`,
    fecha: ahora,
    usuario,
    usuarioId,
    accion: 'SOLICITUD_FIRMA',
    estadoAnterior: acta.estado,
    estadoNuevo: 'PENDIENTE_FIRMA',
    detalle: `Solicitud de firma enviada a ${firmas.length} participantes`,
    version: acta.version,
  };

  return {
    actaActualizada: {
      ...acta,
      estado: 'PENDIENTE_FIRMA',
      estadoFirma: 'EN_PROCESO',
      firmas,
      historial: [...acta.historial, historialItem],
      fechaActualizacion: ahora,
      actualizadoPor: usuario,
    },
    historialItem,
  };
}

export function cerrarActaTrasFirmas(
  acta: Acta,
  usuario: string,
  usuarioId?: string
): { actaActualizada: Acta; historialItem: HistorialActa } {
  if (!todasFirmasCompletadas(acta)) {
    throw new Error('No todas las firmas requeridas están completadas');
  }
  validarTransicion(acta.estado, 'FIRMADA');

  const ahora = new Date().toISOString();
  const historialItem: HistorialActa = {
    id: `hist_${Date.now()}`,
    fecha: ahora,
    usuario,
    usuarioId,
    accion: 'FIRMADA',
    estadoAnterior: acta.estado,
    estadoNuevo: 'FIRMADA',
    detalle: 'Acta firmada por todos los participantes',
    version: acta.version,
  };

  return {
    actaActualizada: {
      ...acta,
      estado: 'FIRMADA',
      estadoFirma: 'FIRMADA',
      fechaFirma: ahora,
      historial: [...acta.historial, historialItem],
      fechaActualizacion: ahora,
      actualizadoPor: usuario,
    },
    historialItem,
  };
}
