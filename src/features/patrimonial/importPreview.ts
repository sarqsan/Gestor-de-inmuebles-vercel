import type {
  ContextoDestinoImportacion, ContextoPrevisualizacion, IncidenciaRevision,
  PrevisualizacionImportacion, RegistroPrevisualizado, ResultadoDestinoImportacion, SolicitudPrevisualizacion,
} from './contracts.ts';
import { evaluarCompletitud } from './completeness.ts';

/** Comprueba una selección contra un snapshot externo, NO concede autorización. */
export function resolverDestinoImportacion(
  propietarioDestinoId: string | null | undefined,
  contexto: ContextoDestinoImportacion,
): ResultadoDestinoImportacion {
  const id = typeof propietarioDestinoId === 'string' && propietarioDestinoId.trim() !== '' ? propietarioDestinoId : null;
  function bloqueo(
    estado: 'AUSENTE' | 'NO_ENCONTRADO' | 'NO_PERMITIDO' | 'AMBIGUO', mensaje: string,
  ): ResultadoDestinoImportacion {
    return { estado, propietarioDestinoId: id, propietario: null,
      incidencias: [{ codigo: `DESTINO_${estado}`, nivel: 'BLOQUEO', mensaje }] };
  }
  if (id === null) return bloqueo('AUSENTE', 'Selecciona explícitamente un propietario destino.');
  // No normaliza IDs, ni usa la primera ficha o una cuenta como alternativa.
  const coincidencias = contexto.propietarios.filter((p) => p.id === id);
  if (coincidencias.length === 0) return bloqueo('NO_ENCONTRADO', 'El destino seleccionado no existe en el contexto suministrado.');
  if (coincidencias.length > 1) return bloqueo('AMBIGUO', 'El contexto contiene varias referencias con el mismo ID de destino.');
  if (contexto.propietariosPermitidosIds?.includes(id) !== true) {
    return bloqueo('NO_PERMITIDO', 'El contexto suministrado no permite planificar para ese destino. No se ha consultado un servicio de permisos.');
  }
  return { estado: 'VALIDO', propietarioDestinoId: id,
    propietario: { id, nombre: coincidencias[0].nombre }, incidencias: [] };
}

/**
 * Dry-run de registros previamente normalizados como datos JSON por un adaptador.
 * Clona el origen, conserva campos desconocidos y no genera IDs de entidades.
 * Un resultado CREARIA es hipotético: no es un comando de persistencia ni un permiso.
 */
export function previsualizarImportacion(
  solicitud: SolicitudPrevisualizacion,
  contexto: ContextoPrevisualizacion,
): PrevisualizacionImportacion {
  const destino = resolverDestinoImportacion(solicitud.propietarioDestinoId, contexto);
  const registros: RegistroPrevisualizado[] = solicitud.datosOrigen.map((original, indiceOrigen): RegistroPrevisualizado => {
    const datosOrigen = structuredClone(original);
    const evaluacionDatos = evaluarCompletitud(datosOrigen, contexto.reglasPorRegistro?.[indiceOrigen] ?? null);
    const incidencias = [...evaluacionDatos.incidencias, ...destino.incidencias]
      .map((incidencia) => ({ ...incidencia, indiceOrigen }));
    const decision = incidencias.some((i) => i.nivel === 'BLOQUEO') ? 'BLOQUEADO'
      : incidencias.length > 0 ? 'REVISAR' : 'CREARIA';
    return { indiceOrigen, datosOrigen, evaluacionDatos, decision, incidencias };
  });
  const incidencias: IncidenciaRevision[] = [
    ...destino.incidencias,
    ...registros.flatMap((r) => r.evaluacionDatos.incidencias.map((i) => ({ ...i, indiceOrigen: r.indiceOrigen }))),
  ];
  if (registros.length === 0) incidencias.push({
    codigo: 'ORIGEN_VACIO', nivel: 'REVISION', mensaje: 'No hay registros de origen que previsualizar.',
  });
  return {
    soloLectura: true,
    destino,
    registros,
    registrosQueSeCrearian: registros.filter((r) => r.decision === 'CREARIA'),
    registrosIncompletos: registros.filter((r) => r.evaluacionDatos.estadoDatos === 'INCOMPLETO'),
    registrosBloqueados: registros.filter((r) => r.decision === 'BLOQUEADO'),
    datosQueRequierenRevision: registros.filter((r) => r.decision !== 'CREARIA'),
    incidencias,
  };
}
