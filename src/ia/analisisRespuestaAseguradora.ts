import type { AnalisisRespuestaAseguradoraAI, DictamenAseguradora } from '../types';

const CLASIFICACIONES_ASEGURADORA: readonly DictamenAseguradora[] = [
  'FAVORABLE',
  'FAVORABLE_CONDICIONADO',
  'DESFAVORABLE',
  'DOCUMENTACION_REQUERIDA',
  'EN_ESTUDIO',
];

function textoNoVacio(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

function listaDeTextos(valor: unknown): valor is string[] {
  return Array.isArray(valor) && valor.every((elemento) => textoNoVacio(elemento));
}

/** Valida el contrato del análisis orientativo; jamás valida ni autentica un dictamen oficial. */
export function esAnalisisRespuestaAseguradoraValido(
  valor: unknown,
): valor is AnalisisRespuestaAseguradoraAI {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;

  const analisis = valor as Record<string, unknown>;
  const camposPermitidos = new Set([
    'clasificacionInferida',
    'textoClasificacionInferida',
    'importeMaximoAsegurable',
    'condiciones',
    'documentosRequeridos',
    'resumenAnalisis',
    'recomendacionAtencionPropietario',
  ]);
  if (Object.keys(analisis).some((campo) => !camposPermitidos.has(campo))) return false;

  const importe = analisis.importeMaximoAsegurable;
  const importeValido = importe === null || (
    typeof importe === 'number' && Number.isFinite(importe) && importe >= 0
  );

  return (
    typeof analisis.clasificacionInferida === 'string' &&
    CLASIFICACIONES_ASEGURADORA.includes(analisis.clasificacionInferida as DictamenAseguradora) &&
    textoNoVacio(analisis.textoClasificacionInferida) &&
    importeValido &&
    listaDeTextos(analisis.condiciones) &&
    listaDeTextos(analisis.documentosRequeridos) &&
    textoNoVacio(analisis.resumenAnalisis) &&
    typeof analisis.recomendacionAtencionPropietario === 'boolean'
  );
}
