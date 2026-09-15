import { VisitSlot } from '../types';

export interface BloqueHorario {
  id: string;
  horaInicio: string; // HH:MM e.g. "08:10"
  horaFin: string; // HH:MM e.g. "09:00"
  duracionMinutos: number; // 5, 10, 15, 20, 25, 30, 45, 60
  intervaloMinutos: number; // 0, 5, 10, 15, 20, 25, 30
}

export interface DayConfig {
  id: string;
  fecha: string; // YYYY-MM-DD
  bloquesHorarios?: BloqueHorario[];
  // Legacy / Direct single block fallback fields:
  horaInicio?: string; 
  horaFin?: string; 
  duracionMinutos?: number; 
  intervaloMinutos?: number; 
}

export const DURACION_OPCIONES = [5, 10, 15, 20, 25, 30, 45, 60];
export const INTERVALO_OPCIONES = [0, 5, 10, 15, 20, 25, 30];

/**
 * Converts "HH:MM" string to total minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * Converts total minutes from midnight to "HH:MM" string
 */
export function minutesToTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Generates slots for a time block
 */
export function generateSlotsFromBlock(
  fecha: string,
  block: BloqueHorario,
  inmuebleId: string
): VisitSlot[] {
  const slots: VisitSlot[] = [];
  const startMins = timeToMinutes(block.horaInicio);
  const endMins = timeToMinutes(block.horaFin);
  const duration = block.duracionMinutos;
  const interval = block.intervaloMinutos;

  if (duration <= 0 || startMins >= endMins) {
    return slots;
  }

  let currentStart = startMins;

  while (currentStart + duration <= endMins) {
    const slotStartMins = currentStart;
    const slotEndMins = currentStart + duration;

    const horaInicio = minutesToTime(slotStartMins);
    const horaFin = minutesToTime(slotEndMins);

    slots.push({
      id: `slot-${inmuebleId}-${fecha}-${horaInicio.replace(':', '')}-${horaFin.replace(':', '')}`,
      inmuebleId,
      fecha,
      horaInicio,
      horaFin,
      disponible: true,
    });

    currentStart = slotEndMins + interval;
  }

  return slots;
}

/**
 * Generates slots for a given day configuration following exact rules:
 * Supports both multiple blocks and single legacy block.
 */
export function generateSlotsFromDayConfig(day: DayConfig, inmuebleId: string): VisitSlot[] {
  const slots: VisitSlot[] = [];

  if (day.bloquesHorarios && day.bloquesHorarios.length > 0) {
    day.bloquesHorarios.forEach((block) => {
      const blockSlots = generateSlotsFromBlock(day.fecha, block, inmuebleId);
      slots.push(...blockSlots);
    });
    return slots;
  }

  // Fallback if day uses legacy single block format
  const block: BloqueHorario = {
    id: `b-${day.id}`,
    horaInicio: day.horaInicio || '09:00',
    horaFin: day.horaFin || '13:00',
    duracionMinutos: day.duracionMinutos ?? 30,
    intervaloMinutos: day.intervaloMinutos ?? 0,
  };

  return generateSlotsFromBlock(day.fecha, block, inmuebleId);
}

/**
 * Formats YYYY-MM-DD to a nice Spanish string (e.g. "Viernes, 15 de agosto de 2026")
 */
export function formatDateNice(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      const formatted = d.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Formats date string to DD/MM/YYYY
 */
export function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}
