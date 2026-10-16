/**
 * IA · FASE 9 — CONTRATO COMPARTIDO DE LAS LLAVES DE USUARIO (Vía 2)
 * ===================================================================
 * Módulo PURO (sin dependencias, como `catalogoOperacionesIA.ts`) que comparten:
 *
 *   · el servidor (`server/ia/llavesUsuarioIA.ts`, `server/ia/rutasLlavesIA.ts`
 *     y `server/ia/nucleoIA.ts`), que custodia la llave CIFRADA y la usa SOLO
 *     para las operaciones del usuario al que pertenece; y
 *   · el cliente (`src/lib/llavesUsuarioIA.ts` y el alta guiada
 *     `src/components/ia/AltaGuiadaLlaveIA.tsx`), que valida la FORMA de la
 *     clave antes de enviarla y después sólo ve estado, sufijo y fechas.
 *
 * DECISIÓN §11 (docs/IA-FASE-9-LLAVES-DE-USUARIO-DISENO-Y-DECISIONES.md):
 * cada usuario aporta su propia clave del proveedor. El contrato fija qué es
 * visible (nunca la llave), qué estados existen y qué códigos devuelve el
 * servidor. Nada de aquí decide permisos ni consumo: eso es del gobierno.
 */

/** Único proveedor soportado en esta fase. */
export const PROVEEDOR_LLAVE_IA = 'GEMINI' as const;
export type ProveedorLlaveIA = typeof PROVEEDOR_LLAVE_IA;

/** Estado de la llave de un usuario tal y como lo ve el cliente. */
export type EstadoLlaveUsuarioIA = 'AUSENTE' | 'REGISTRADA' | 'VERIFICADA' | 'REVOCADA';

/** Resultado de la última verificación con el proveedor (si la hubo). */
export type ResultadoVerificacionLlaveIA = 'OK' | 'FALLIDA';

/**
 * Resumen SIN secretos de la llave de un usuario: lo único que viaja al
 * navegador. `sufijo` son los 4 últimos caracteres (como en una tarjeta).
 */
export interface ResumenLlaveUsuarioIA {
  version: 1;
  proveedor: ProveedorLlaveIA;
  estado: EstadoLlaveUsuarioIA;
  sufijo: string | null;
  registradaEn: string | null;
  verificadaEn: string | null;
  revocadaEn: string | null;
  sustituciones: number;
  ultimaVerificacion: ResultadoVerificacionLlaveIA | null;
}

export function resumenLlaveAusente(): ResumenLlaveUsuarioIA {
  return {
    version: 1,
    proveedor: PROVEEDOR_LLAVE_IA,
    estado: 'AUSENTE',
    sufijo: null,
    registradaEn: null,
    verificadaEn: null,
    revocadaEn: null,
    sustituciones: 0,
    ultimaVerificacion: null,
  };
}

/** ¿La llave está activa (utilizable por el núcleo)? */
export function llaveActiva(resumen: Pick<ResumenLlaveUsuarioIA, 'estado'>): boolean {
  return resumen.estado === 'REGISTRADA' || resumen.estado === 'VERIFICADA';
}

// ---------------------------------------------------------------------------
// Modo del subsistema (expuesto en /api/health y en GET /api/ia/llave)
// ---------------------------------------------------------------------------

/** Estado del subsistema de llaves (sin secretos). */
export type ModoLlavesIA = 'USUARIO' | 'NO_CONFIGURADO' | 'CLAVE_MAESTRA_INVALIDA';

/** Qué hace el núcleo cuando el usuario no tiene llave activa. */
export type ModoSinLlaveIA = 'RESPALDO' | 'EXIGIR';

/** Si la verificación con el proveedor está disponible en el entorno. */
export type ModoVerificacionLlaveIA = 'DESACTIVADA' | 'PROVEEDOR';

export const VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES = 'IA_LLAVES_CLAVE_MAESTRA';
export const VARIABLE_ENTORNO_SIN_LLAVE = 'IA_LLAVES_SIN_LLAVE';
export const VARIABLE_ENTORNO_VERIFICACION_LLAVES = 'IA_LLAVES_VERIFICACION';

/** Cabecera que el núcleo añade a cada operación: `activa` | `ausente` | `no-configurado`. */
export const CABECERA_LLAVE_USUARIO_IA = 'X-IA-Llave-Usuario';
export type ValorCabeceraLlaveUsuarioIA = 'activa' | 'ausente' | 'no-configurado';

/** Rutas del alta guiada (servidor). */
export const RUTA_LLAVE_USUARIO_IA = '/api/ia/llave' as const;
export const RUTA_VERIFICAR_LLAVE_USUARIO_IA = '/api/ia/llave/verificar' as const;

// ---------------------------------------------------------------------------
// Códigos de rechazo (los mismos en servidor y cliente)
// ---------------------------------------------------------------------------

export type CodigoRechazoLlavesIA =
  | 'LLAVES_NO_CONFIGURADAS'
  | 'LLAVES_CLAVE_MAESTRA_INVALIDA'
  | 'LLAVES_NO_DISPONIBLES'
  | 'LLAVE_USUARIO_REQUERIDA'
  | 'LLAVE_FORMATO_INVALIDO'
  | 'LLAVE_RECHAZADA_POR_PROVEEDOR'
  | 'SIN_LLAVE'
  | 'LLAVE_ACCION_DUPLICADA'
  | 'VERIFICACION_NO_DISPONIBLE';

// ---------------------------------------------------------------------------
// Validación de FORMA de la clave (local, sin red). La validez real sólo la
// confirma el proveedor.
// ---------------------------------------------------------------------------

/** Clave de Google AI Studio: `AIza` + 35 caracteres [A-Za-z0-9_-] (39 en total). */
export const LONGITUD_LLAVE_GEMINI = 39;
export const PREFIJO_LLAVE_GEMINI = 'AIza';
const PATRON_LLAVE_GEMINI = /^AIza[0-9A-Za-z_-]{35}$/;
/** Marcador que trae `.env.example`; nunca es una llave. */
export const MARCADOR_LLAVE_GEMINI = 'MY_GEMINI_API_KEY';
/** Tope de lo que el servidor acepta en el cuerpo antes de normalizar. */
export const MAX_LONGITUD_ENTRADA_LLAVE = 200;

export type CodigoFormatoLlaveIA = 'VACIA' | 'MARCADOR_DE_POSICION' | 'LONGITUD' | 'PREFIJO' | 'CARACTERES';

export type ResultadoFormatoLlaveIA =
  | { estado: 'VALIDA'; valor: string; sufijo: string }
  | { estado: 'INVALIDA'; codigo: CodigoFormatoLlaveIA; mensaje: string };

/** Los 4 últimos caracteres: lo único de la llave que se muestra. */
export function sufijoLlave(valor: string): string {
  return valor.slice(-4);
}

/** Recorta espacios, saltos de línea y comillas de un pegado descuidado. */
export function normalizarEntradaLlave(entrada: unknown): string {
  if (typeof entrada !== 'string') return '';
  return entrada.trim().replace(/^["'`\s]+|["'`\s]+$/g, '').trim();
}

export function validarFormatoLlaveProveedorIA(entrada: unknown): ResultadoFormatoLlaveIA {
  const valor = normalizarEntradaLlave(entrada);
  if (valor === '') {
    return { estado: 'INVALIDA', codigo: 'VACIA', mensaje: 'Pega la clave de API que has creado en Google AI Studio.' };
  }
  if (valor === MARCADOR_LLAVE_GEMINI) {
    return { estado: 'INVALIDA', codigo: 'MARCADOR_DE_POSICION', mensaje: 'Eso es un marcador de ejemplo, no una clave real.' };
  }
  if (!valor.startsWith(PREFIJO_LLAVE_GEMINI)) {
    return { estado: 'INVALIDA', codigo: 'PREFIJO', mensaje: `Una clave de Google AI Studio empieza por «${PREFIJO_LLAVE_GEMINI}». Comprueba que has copiado la clave completa.` };
  }
  if (valor.length !== LONGITUD_LLAVE_GEMINI) {
    return { estado: 'INVALIDA', codigo: 'LONGITUD', mensaje: `La clave debe tener ${LONGITUD_LLAVE_GEMINI} caracteres (la tuya tiene ${valor.length}). Cópiala entera, sin espacios.` };
  }
  if (!PATRON_LLAVE_GEMINI.test(valor)) {
    return { estado: 'INVALIDA', codigo: 'CARACTERES', mensaje: 'La clave contiene caracteres que no pertenecen a una clave de API. Vuelve a copiarla desde Google AI Studio.' };
  }
  return { estado: 'VALIDA', valor, sufijo: sufijoLlave(valor) };
}

/** Modo «sin llave» a partir del entorno (valor desconocido ⇒ el más conservador para el usuario: RESPALDO). */
export function modoSinLlaveDesdeEntorno(entorno: Record<string, string | undefined>): ModoSinLlaveIA {
  return entorno[VARIABLE_ENTORNO_SIN_LLAVE]?.trim().toUpperCase() === 'EXIGIR' ? 'EXIGIR' : 'RESPALDO';
}

/** Modo de verificación a partir del entorno (sólo `PROVEEDOR` activa la llamada real). */
export function modoVerificacionDesdeEntorno(entorno: Record<string, string | undefined>): ModoVerificacionLlaveIA {
  return entorno[VARIABLE_ENTORNO_VERIFICACION_LLAVES]?.trim().toUpperCase() === 'PROVEEDOR' ? 'PROVEEDOR' : 'DESACTIVADA';
}
