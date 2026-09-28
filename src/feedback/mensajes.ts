/**
 * BLOQUE 10 · UX-3 — MENSAJES DE ERROR ORIENTADOS A LA PERSONA USUARIA.
 *
 * Regla (§12): el usuario debe entender **qué ha ocurrido y qué puede hacer**; nunca
 * debe ver códigos del SDK, nombres de colecciones, excepciones ni stack traces.
 *
 * Estrategia: los mensajes de negocio (los que ya escribe el ERP y los motores, con
 * lenguaje claro) se muestran tal cual; los mensajes técnicos se sustituyen por el
 * texto de contexto que aporta quien informa, dejando el detalle en consola.
 */
import { codigoDeError } from '../estadoDatos/canalIncidencias';

/** Patrones que delatan un mensaje técnico (SDK, excepción, stack, colección…). */
const PATRONES_TECNICOS: readonly RegExp[] = [
  /firebase/i,
  /firestore/i,
  /storage\//i,
  /permission[-_ ]denied/i,
  /missing or insufficient permissions/i,
  /unauthenticated/i,
  /unavailable\b/i,
  /deadline[-_ ]exceeded/i,
  /failed[-_ ]precondition/i,
  /resource[-_ ]exhausted/i,
  /network[-_ ]request[-_ ]failed/i,
  /cannot read propert/i,
  /is not a function/i,
  /undefined is not/i,
  /\bis not defined\b/i,
  /\[object object\]/i,
  /stack trace/i,
  /\bat [\w$.]+ \(/,
  /^\s*(type)?error:/i,
  /^\s*[a-z-]+\/[a-z-]+\s*:/i, // p. ej. "storage/unauthorized: ..."
  /collection\//i,
];

/** Longitud máxima razonable de un mensaje dirigido a la persona usuaria. */
const LONGITUD_MAXIMA = 240;

export function esMensajeTecnico(mensaje: string): boolean {
  const texto = (mensaje || '').trim();
  if (!texto) return true;
  if (texto.length > LONGITUD_MAXIMA) return true;
  return PATRONES_TECNICOS.some((patron) => patron.test(texto));
}

/**
 * Traduce un error a un mensaje claro. `contexto` es el texto específico de la
 * operación («No se pudo eliminar el documento.»). Nunca lanza.
 */
export function mensajeDeErrorUsuario(error: unknown, contexto: string): string {
  const texto = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (!texto || esMensajeTecnico(texto)) {
    if (error !== undefined && error !== null) {
      // El detalle técnico se conserva para diagnóstico (consola), nunca en la interfaz.
      console.warn(`[UX-3] Operación fallida (${codigoDeError(error)}). Detalle técnico:`, error);
    }
    return contexto;
  }
  return texto.trim().replace(/\s+/g, ' ');
}
