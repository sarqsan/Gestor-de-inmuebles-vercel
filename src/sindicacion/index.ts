/**
 * GAP 5 · FASE 1 — Núcleo interno de sindicación/publicación.
 * ==========================================================
 * Cuatro huecos que el ERP no tenía, en un módulo AISLADO que no altera el
 * comportamiento ya validado: reutiliza el motor existente
 * (`src/utils/publicacionEngine.ts`, `publicacionJson.ts`, `publicacionXml.ts`,
 * `publicacionPortales.ts`) y sólo AÑADE lo que faltaba:
 *
 *  1. `hashContenido`  → forma canónica determinista + huella sha256 + versionado (v1, v2…).
 *  2. `idempotencia`   → decisor puro NUEVO | SIN_CAMBIOS | ACTUALIZAR | RETIRAR (+ BLOQUEADO).
 *  3. `validacion`     → errores estructurados {código, campo, severidad, categoría} + reglas de imágenes.
 *  4. `adaptadores`    → contrato de adaptador (validar/publicar/actualizar/retirar/consultarEstado).
 *  5. `estadoRepositorio` → PERSISTENCIA del estado por (inmueble, portal): guardar,
 *     leer, idempotencia de escritura e historial por el canal canónico `audit_logs`.
 *     El adaptador real de Firestore vive en `src/lib/sindicacionFirestore.ts` (patrón
 *     del ERP); aquí dentro no hay ninguna dependencia de Firebase.
 *
 * NO hace: llamadas de red, jobs, cron, colas, webhooks, ni publicación real en ningún
 * portal. La persistencia del estado SÍ existe, pero siempre a través del puerto
 * inyectado (`PuertoEstadoSindicacion`): este módulo no importa Firebase.
 * Los nombres de los ficheros internos son estables: son el contrato de la fase 2.
 */

export {
  CLAVES_NO_CONTENIDO,
  CLAVES_NO_CONTENIDO_IMAGEN,
  calcularVersionPublicable,
  camposQueCambiaron,
  contenidoPublicableIdentico,
  formaCanonicaPublicable,
  hashDeContenidoPublicable,
  huellaCortaDeContenido,
  identidadEnPortal,
  identidadEstableInmueble,
  representacionCanonica,
  versionesIguales,
  type VersionPublicable,
} from './hashContenido';

export {
  aValidacionLegado,
  codigosDeValidacion,
  mensajesAEstructurados,
  TABLA_MENSAJES_Y_CODIGOS,
  validarImagenesPublicables,
  validarModeloPublicable,
  type CategoriaValidacion,
  type ErrorValidacionEstructurado,
  type SeveridadValidacion,
  type ValidacionEstructurada,
} from './validacion';

export {
  erroresDeDecision,
  operacionDeAccion,
  requiereEnvio,
  resolverAccionSindicacion,
  type AccionSindicacion,
  type DecisionSindicacion,
  type InstantaneaPublicada,
  type IntencionSindicacion,
  type MotivoAccionSindicacion,
} from './idempotencia';

export {
  ADAPTADORES_SINDICACION_FASE1,
  auditarContratoAdaptador,
  crearAdaptador,
  crearAdaptadorNoConectado,
  contextoParaAdaptador,
  estadoAdaptadores,
  exportarFeed,
  OPERACIONES_ADAPTADOR,
  sanearContexto,
  type AdaptadorSindicacion,
  type ContextoOperacion,
  type ErrorAdaptador,
  type EstadoAdaptadorPortal,
  type OperacionAdaptador,
  type PuertoAdaptadorSindicacion,
  type ResultadoAdaptador,
} from './adaptadores';
export {
  CLAVES_CREDENCIAL_PROHIBIDAS,
  CODIGO_CONTEXTO_RECHAZADO,
  CODIGO_DECISION_NO_ENVIABLE,
  CODIGO_OPERACION_NO_IMPLEMENTADA,
  CODIGO_PORTAL_NO_CONECTADO,
  VERSION_CONTRATO_ADAPTADOR,
} from './adaptadores';
export { ejecutarOperacion } from './adaptadores';

// ---------------------------------------------------------------------------
// PERSISTENCIA DEL ESTADO DE SINDICACIÓN (capa de dominio; el adaptador de
// Firestore está en src/lib/sindicacionFirestore.ts)
// ---------------------------------------------------------------------------
export {
  CLAVES_DE_ESTADO,
  COLECCION_ESTADO_SINDICACION,
  ESQUEMA_ESTADO_SINDICACION,
  OBJETIVO_POR_ACCION,
  avanzarEstadoHasta,
  actualizarEstadoSindicacion,
  construirRegistroEstado,
  construirTrazabilidadDelEvento,
  crearEstadoInicialSindicacion,
  caminoDeEstados,
  estadosIguales,
  huellaDeEstado,
  idDelEvento,
  leerEstadoSindicacionPorPortal,
  leerEstadosSindicacion,
  proyeccionDeEstado,
  registrarActualizacionSindicacion,
  registrarErrorSindicacion,
  registrarPublicacionSindicacion,
  registrarRecuperacionSindicacion,
  registrarResultadoSindicacion,
  registrarRetiradaSindicacion,
  registrarSinEnvioSindicacion,
  registrarValidacionSindicacion,
  resumenDelEstado,
  verificarInvariantesDelRegistro,
  type ContextoPersistencia,
  type EventoSindicacion,
  type LecturaEstadoPorPortal,
  type LecturaEstadosSindicacion,
  type OperacionSindicacionRegistrada,
  type ParamsRegistrarResultado,
  type PuertoEstadoSindicacion,
  type ResultadoEscritura,
  type ResultadoOperacionPersistida,
  type ResultadoOperacionSindicacion,
  type RegistroEstadoSindicacion,
  type VerificacionInvariante,
} from './estadoRepositorio';
