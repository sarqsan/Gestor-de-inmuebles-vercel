/**
 * PRESENTACIÓN DE TITULARIDAD (BLOQUE 2 · 2.3 · BLOQUE 3 · 3.1)
 * =============================================================
 * Regla dura: un porcentaje desconocido se muestra como PENDIENTE.
 * NUNCA se pinta un "50 %" ni un reparto estimado como si fuera un dato real.
 */

export const TEXTO_PORCENTAJE_PENDIENTE = 'Pendiente';

/**
 * Devuelve el texto a mostrar para un porcentaje.
 * `null` / inválido → "Pendiente".
 */
export function formatearPorcentaje(valor: number | null | undefined): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return TEXTO_PORCENTAJE_PENDIENTE;
  const texto = Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(/\.?0+$/, '');
  return `${texto} %`;
}

/** ¿El porcentaje es un dato real o una pendencia? */
export function esPorcentajeReal(valor: number | null | undefined): boolean {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/** Resumen legible de una titularidad: "70 %" o "Pendiente". */
export function resumenPorcentaje(valor: number | null | undefined): string {
  return esPorcentajeReal(valor) ? formatearPorcentaje(valor) : TEXTO_PORCENTAJE_PENDIENTE;
}

/** Etiqueta del eje patrimonial en castellano. */
export const ETIQUETAS_ESTADO_PATRIMONIAL: Record<string, string> = {
  ACTIVO: 'Activo',
  EN_VENTA: 'En venta',
  VENDIDO: 'Vendido',
  TRANSMITIDO: 'Transmitido',
  BAJA: 'De baja',
  HISTORICO: 'Histórico',
};

/** Etiqueta del eje de explotación en castellano. */
export const ETIQUETAS_ESTADO_EXPLOTACION: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  ALQUILADO: 'Alquilado',
  EN_REFORMA: 'En reforma',
  NO_DISPONIBLE: 'No disponible',
  SIN_EXPLOTACION: 'Sin explotación',
};

/** Etiqueta del estado de una relación de titularidad. */
export const ETIQUETAS_ESTADO_TITULARIDAD: Record<string, string> = {
  ACTIVA: 'Vigente',
  BAJA: 'De baja',
  TRANSMITIDA: 'Transmitida',
  PENDIENTE: 'Pendiente',
};

export function etiquetaEstadoPatrimonial(estado?: string): string {
  return (estado && ETIQUETAS_ESTADO_PATRIMONIAL[estado]) || 'Activo';
}

export function etiquetaEstadoExplotacion(estado?: string): string {
  return (estado && ETIQUETAS_ESTADO_EXPLOTACION[estado]) || '—';
}

export function etiquetaEstadoTitularidad(estado?: string): string {
  return (estado && ETIQUETAS_ESTADO_TITULARIDAD[estado]) || '—';
}
