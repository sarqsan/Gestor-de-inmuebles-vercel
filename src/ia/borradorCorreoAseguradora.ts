/**
 * P7 · Contrato del borrador de correo generado por IA.
 *
 * El borrador es un TEXTO DE TRABAJO, no un dictamen ni una comunicación ya
 * enviada. La validación es compartida por el servidor y el cliente para que
 * ninguno de los dos acepte una respuesta parcial y la presente como si la IA
 * hubiera redactado el correo.
 */
export interface BorradorCorreoAseguradoraIA {
  asunto: string;
  cuerpo: string;
}

/** Valida en tiempo de ejecución el contrato mínimo de un borrador generado. */
export function esBorradorCorreoAseguradoraValido(
  valor: unknown,
): valor is BorradorCorreoAseguradoraIA {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;

  const borrador = valor as Record<string, unknown>;
  return (
    typeof borrador.asunto === 'string' &&
    borrador.asunto.trim().length > 0 &&
    typeof borrador.cuerpo === 'string' &&
    borrador.cuerpo.trim().length > 0
  );
}
