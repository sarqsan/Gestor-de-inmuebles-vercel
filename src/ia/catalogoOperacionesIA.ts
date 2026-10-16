/**
 * IA · FASE 1 — CATÁLOGO ÚNICO DE OPERACIONES DE IA
 * =================================================
 * Fuente única de las operaciones de IA del ERP: identificador estable (el que
 * se registra por usuario en `ia_operaciones`) y ruta HTTP del servidor.
 *
 * Lo comparten el servidor (núcleo `server/ia/nucleoIA.ts`, que exige
 * autenticación y registra cada operación) y el cliente (`src/lib/clienteIA.ts`,
 * que sólo acepta rutas de este catálogo). Módulo puro: sin dependencias.
 *
 * Añadir un endpoint de IA = añadir aquí su entrada y montarlo en `server.ts`
 * con `nucleoIA.operacion('<ID>')`; las pruebas de cableado
 * (tests/ia-fase1-integracion-server.test.ts) fallan si falta cualquiera de
 * los dos lados.
 */

export const OPERACIONES_IA = [
  { id: 'ANALIZAR_DOCUMENTO', ruta: '/api/analizar-documento', descripcion: 'Análisis de documentación de solvencia y pólizas' },
  { id: 'GENERAR_CORREO_ASEGURADORA', ruta: '/api/generar-correo-aseguradora', descripcion: 'Borrador de correo a la aseguradora' },
  { id: 'ANALIZAR_RESPUESTA_ASEGURADORA', ruta: '/api/analizar-respuesta-aseguradora', descripcion: 'Análisis de la respuesta de la aseguradora' },
  { id: 'ASISTENTE_INTERPRETAR', ruta: '/api/asistente/interpretar', descripcion: 'Interpretación de intención del asistente transversal' },
  { id: 'ANALIZAR_CUESTIONARIO', ruta: '/api/analizar-cuestionario', descripcion: 'Análisis del cuestionario de candidatos y solicitudes' },
  { id: 'REDACTAR_CLAUSULA', ruta: '/api/redactar-clausula', descripcion: 'Redacción de cláusulas contractuales' },
  { id: 'ANALIZAR_INSPECCION', ruta: '/api/analizar-inspeccion', descripcion: 'Diagnóstico de fotografías de inspección' },
  { id: 'PROPONER_MEJORAS', ruta: '/api/proponer-mejoras', descripcion: 'Propuesta de mejoras y reformas' },
  { id: 'ESTIMAR_PRICING', ruta: '/api/estimar-pricing', descripcion: 'Revisión del precio de recomercialización' },
  { id: 'GENERAR_KIT_PUBLICACION', ruta: '/api/generar-kit-publicacion', descripcion: 'Kit de publicación del anuncio' },
  { id: 'ANALIZAR_INCIDENCIA', ruta: '/api/analizar-incidencia-ia', descripcion: 'Análisis pericial de incidencias' },
  // IA · FASE 5 — asistente de incidencias para inquilinos: diagnóstico guiado con
  // contrato autorizado, medidas preventivas seguras y derivación explícita. Se
  // monta con el mismo núcleo (autenticación, idempotencia, gobierno y registro).
  { id: 'ASISTENTE_INCIDENCIAS_INQUILINO', ruta: '/api/asistente/incidencias-inquilino', descripcion: 'Diagnóstico guiado de incidencias del inquilino (contrato autorizado)' },
] as const;

export type OperacionIACatalogo = (typeof OPERACIONES_IA)[number];
export type IdOperacionIA = OperacionIACatalogo['id'];
export type RutaOperacionIA = OperacionIACatalogo['ruta'];

/** Cabecera HTTP de idempotencia que exige el núcleo de IA en cada petición. */
export const CABECERA_IDEMPOTENCIA_IA = 'Idempotency-Key';

/**
 * Formato admitido para la clave de idempotencia (8–128 caracteres seguros).
 * El cliente genera un UUID v4 por operación; el servidor rechaza cualquier
 * otra forma con 400 antes de ejecutar nada.
 */
export const PATRON_CLAVE_IDEMPOTENCIA_IA = /^[A-Za-z0-9_\-:.]{8,128}$/;

export function operacionIAPorId(id: string): OperacionIACatalogo | undefined {
  return OPERACIONES_IA.find((operacion) => operacion.id === id);
}

export function operacionIAPorRuta(ruta: string): OperacionIACatalogo | undefined {
  return OPERACIONES_IA.find((operacion) => operacion.ruta === ruta);
}
