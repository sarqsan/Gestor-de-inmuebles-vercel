import type { AnalisisRespuestaAseguradoraAI, DictamenAseguradora } from '../types';

const DICTAMENES_ASEGURADORA: readonly DictamenAseguradora[] = [
  'FAVORABLE',
  'FAVORABLE_CONDICIONADO',
  'DESFAVORABLE',
  'DOCUMENTACION_REQUERIDA',
  'EN_ESTUDIO',
];

/** Valida en tiempo de ejecución el contrato que habilita guardar un dictamen de IA. */
export function esAnalisisRespuestaAseguradoraValido(
  valor: unknown,
): valor is AnalisisRespuestaAseguradoraAI {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;

  const analisis = valor as Record<string, unknown>;
  return (
    typeof analisis.dictamen === 'string' &&
    DICTAMENES_ASEGURADORA.includes(analisis.dictamen as DictamenAseguradora) &&
    typeof analisis.dictamenTexto === 'string' &&
    analisis.dictamenTexto.trim().length > 0 &&
    typeof analisis.importeMaximoAsegurable === 'number' &&
    Number.isFinite(analisis.importeMaximoAsegurable) &&
    analisis.importeMaximoAsegurable >= 0 &&
    Array.isArray(analisis.condiciones) &&
    analisis.condiciones.every((condicion) => typeof condicion === 'string') &&
    Array.isArray(analisis.documentosRequeridos) &&
    analisis.documentosRequeridos.every((documento) => typeof documento === 'string') &&
    typeof analisis.resumenEjecutivo === 'string' &&
    analisis.resumenEjecutivo.trim().length > 0 &&
    typeof analisis.requiereAtencionPropietario === 'boolean'
  );
}
