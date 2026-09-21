/** CAPA TRANSVERSAL §6 — FASE 1 · API pública del motor de experiencia. */
export * from './tipos';
export { getExperienceContext, contextoDesdeUsuario, contextoTienePermiso, contextoCumpleRoles, moduloDeSeccion, MODULO_POR_SECCION, MODULO_POR_VISTA_PORTAL } from './contexto';
export { AYUDA_REGISTRO, NOMBRE_MODULO, ayudaDisponible, ayudaParaContexto, ayudaParaModulo, ayudaVisibleEn, buscarAyuda, obtenerAyuda, modulosConAyuda } from './ayuda';
export {
  TUTORIALES_REGISTRO,
  TUTORIAL_LIQUIDACION,
  obtenerTutorial,
  tutorialesDisponibles,
  tutorialesDeModulo,
  evaluarPaso,
  evaluarTutorial,
  iniciarTutorial,
  pasoActual,
  esUltimoPaso,
  avanzar,
  retroceder,
  finalizar,
  cancelar,
  reanudar,
  progreso,
} from './tutoriales';
export { CAPACIDADES_ERP, capacidadesDisponibles, construirIntentRequest, resolverIntencionLocal } from './intenciones';
