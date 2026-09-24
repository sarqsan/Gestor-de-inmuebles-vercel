import { EstadoActa } from '../../types/actas';

export const TRANSICIONES_ACTA: Record<EstadoActa, EstadoActa[]> = {
  BORRADOR: ['EN_REVISION', 'PENDIENTE_FIRMA', 'CANCELADA', 'ERROR'],
  EN_REVISION: ['BORRADOR', 'PENDIENTE_FIRMA', 'CANCELADA', 'ERROR'],
  PENDIENTE_FIRMA: ['FIRMADA', 'EN_REVISION', 'CANCELADA', 'ERROR'],
  FIRMADA: ['CERRADA', 'ERROR'],
  CERRADA: [], // terminal, no vuelve a borrador silenciosamente
  ERROR: ['BORRADOR', 'EN_REVISION', 'CANCELADA'],
  CANCELADA: [], // terminal, pero puede versionarse
};

export function puedeTransicionar(desde: EstadoActa, hacia: EstadoActa): boolean {
  if (desde === hacia) return true;
  const permitidos = TRANSICIONES_ACTA[desde] || [];
  return permitidos.includes(hacia);
}

export function validarTransicion(desde: EstadoActa, hacia: EstadoActa): void {
  if (!puedeTransicionar(desde, hacia)) {
    throw new Error(`Transición no permitida: ${desde} → ${hacia}`);
  }
  // Acta firmada/cerrada no debe volver silenciosamente a borrador
  if ((desde === 'FIRMADA' || desde === 'CERRADA') && hacia === 'BORRADOR') {
    throw new Error(`Un acta ${desde} no puede volver a BORRADOR sin versionado`);
  }
  if (desde === 'CERRADA' && hacia !== 'CERRADA') {
    throw new Error('Un acta CERRADA no puede cambiar de estado');
  }
}

export const ESTADOS_ACTA_LABEL: Record<EstadoActa, string> = {
  BORRADOR: 'Borrador',
  EN_REVISION: 'En revisión',
  PENDIENTE_FIRMA: 'Pendiente de firma',
  FIRMADA: 'Firmada',
  CERRADA: 'Cerrada',
  ERROR: 'Error',
  CANCELADA: 'Cancelada',
};

export function esEstadoEditable(estado: EstadoActa): boolean {
  return estado === 'BORRADOR' || estado === 'EN_REVISION' || estado === 'ERROR';
}

export function esEstadoFirmable(estado: EstadoActa): boolean {
  return estado === 'PENDIENTE_FIRMA';
}

export function esEstadoFinal(estado: EstadoActa): boolean {
  return estado === 'CERRADA' || estado === 'CANCELADA';
}
