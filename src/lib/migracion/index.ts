/**
 * B4 — DRY-RUN DE MIGRACIÓN HISTÓRICA (solo lectura).
 *
 * Punto de entrada del módulo. Todo es puro y determinista: no lee ni
 * escribe Firestore/Storage/auditoría. Ver `motor.ts` (`ejecutarDryRun`) y
 * `plan.ts` (`derivarPlan`, informativo y no ejecutable).
 */
export * from './tipos';
export { resolverPropietario, resolverInmueble, viaInmuebleAptaAuto } from './resolucion';
export { resolverContrato, evaluarRelaciones } from './relaciones';
export {
  huellasGasto,
  huellasCobro,
  indicesDesdeExistentesDestino,
  registrarHuellas,
  esRecurrenciaLegitima,
  clasificarB4,
} from './duplicados';
export {
  chequearCompletitud,
  proponerDestino,
  clasificarFiscal,
  tipoDocumentalDeclarado,
} from './entidades';
export { ejecutarDryRun, calcularMigrationKey, jsonEstable } from './motor';
export { derivarPlan } from './plan';
export { responderPreguntas, generarInforme, idempotenciaVerificada, PREGUNTAS_CANONICAS } from './informe';
export type { RespuestaPregunta } from './informe';
export { adaptarMovimientoRentasync, adaptarInmuebleRentasync } from './adaptadorRentasync';
