import type { EvaluacionDatos, IncidenciaRevision, ReglasRevisionDatos } from './contracts.ts';

/** Solo objetos de campos; no evalúa cuentas, modalidades ni titularidad. */
export function esObjetoDeDatos(datos: unknown): datos is Record<string, unknown> {
  return datos !== null && typeof datos === 'object'
    && (Object.getPrototypeOf(datos) === Object.prototype || Object.getPrototypeOf(datos) === null);
}

/**
 * Presencia genérica: propiedad propia, distinta de null/undefined y de texto en blanco.
 * 0 y false son valores presentes. Arrays/objetos vacíos no implican una regla documental.
 * Claves literales: 'domicilio.ciudad' no se interpreta como una ruta.
 */
export function campoPresente(datos: Record<string, unknown>, campo: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(datos, campo)) return false;
  const valor = datos[campo];
  return valor !== null && valor !== undefined && (typeof valor !== 'string' || valor.trim().length > 0);
}

export function evaluarCompletitud(datos: unknown, reglas: ReglasRevisionDatos | null): EvaluacionDatos {
  const incidencias: IncidenciaRevision[] = [];
  const politica = reglas?.politica;
  const politicaValida = politica != null && typeof politica.id === 'string' && politica.id.trim() !== ''
    && Array.isArray(politica.camposRequeridos)
    && Array.from(politica.camposRequeridos).every((campo) => typeof campo === 'string' && campo.trim() !== '');
  const datosValidos = esObjetoDeDatos(datos);
  if (!politicaValida) incidencias.push({
    codigo: politica == null ? 'POLITICA_NO_DISPONIBLE' : 'POLITICA_INVALIDA',
    nivel: 'BLOQUEO', mensaje: 'No hay una política válida para evaluar estos datos. No se asume que estén completos.',
  });
  if (!datosValidos) incidencias.push({
    codigo: 'FORMATO_DATOS_INVALIDO', nivel: 'BLOQUEO', mensaje: 'Se esperaba un objeto de campos de origen.',
  });
  const camposFaltantes = politicaValida && datosValidos
    ? [...new Set(politica.camposRequeridos)].filter((campo) => !campoPresente(datos, campo))
    : [];
  incidencias.push(...camposFaltantes.map((campo): IncidenciaRevision => ({
    codigo: 'CAMPO_FALTANTE', nivel: 'REVISION', campo,
    mensaje: `Falta el campo «${campo}» según la política suministrada.`,
  })));
  // Copia solo los campos del contrato; no permite que un motivo externo rebaje su nivel.
  for (const [motivos, nivel] of [
    [reglas?.bloqueos ?? [], 'BLOQUEO'], [reglas?.revisiones ?? [], 'REVISION'],
  ] as const) {
    for (const motivo of motivos) incidencias.push({
      codigo: motivo.codigo, mensaje: motivo.mensaje,
      ...(motivo.campo === undefined ? {} : { campo: motivo.campo }), nivel,
    });
  }
  return {
    estadoDatos: incidencias.some((i) => i.nivel === 'BLOQUEO')
      ? 'BLOQUEADO' : camposFaltantes.length > 0 ? 'INCOMPLETO' : 'COMPLETO',
    camposFaltantes,
    politicaId: politicaValida ? politica.id : null,
    incidencias,
  };
}
