/**
 * B — Reintento acotado para errores recuperables concretos.
 * ---------------------------------------------------------------------------
 * Recupera el delta útil de Arena C (`src/lib/googleAuth.ts`, commit e7798d3):
 * reintentar la operación cuando falla con el error recuperable de Firebase
 * Auth `Database is closing`.
 *
 * ADAPTACIÓN a main (difiere de C en un punto, por orden expresa):
 *  · C permite hasta 3 llamadas (`retryCount < 2` empezando en 0: intento
 *    inicial + 2 reintentos). Aquí el máximo es DOS intentos en total
 *    (inicial + 1 reintento), según la orden de recuperación.
 *  · La espera entre intentos es 600 ms, equivalente a la de C.
 *  · Sólo el error concreto recuperable reintenta; cualquier otro error se
 *    propaga inmediatamente sin espera ni segundo intento.
 */
export const ERROR_DATABASE_CLOSING = 'Database is closing';

/** Detecta el error recuperable concreto (cubre `…/hidden` por inclusión). */
export function esErrorRecuperableDatabaseClosing(error: unknown): boolean {
  let mensaje: string;
  if (typeof error === 'string') {
    mensaje = error;
  } else if (error instanceof Error) {
    mensaje = error.message;
  } else if (
    error !== null &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    mensaje = (error as { message: string }).message;
  } else {
    mensaje = String(error ?? '');
  }
  return mensaje.includes(ERROR_DATABASE_CLOSING);
}

export interface OpcionesReintentoAcotado {
  /** Número total de llamadas (incluido el intento inicial). Debe ser ≥ 1. */
  readonly maxIntentos: number;
  /** Espera entre intentos, en milisegundos. */
  readonly esperaMs: number;
  /** Espera inyectable (tests deterministas). */
  readonly esperar?: (ms: number) => Promise<void>;
}

const esperarPorDefecto = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ejecuta `operacion` reintentando sólo ante errores recuperables, hasta
 * `maxIntentos` llamadas en total. Propaga el último error cuando se agotan
 * los intentos o el error no es recuperable.
 */
export async function conReintentoAcotado<T>(
  operacion: () => Promise<T>,
  esRecuperable: (error: unknown) => boolean,
  opciones: OpcionesReintentoAcotado
): Promise<T> {
  const maxIntentos = Math.max(1, Math.floor(opciones.maxIntentos));
  const esperar = opciones.esperar ?? esperarPorDefecto;
  let ultimoError: unknown;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      return await operacion();
    } catch (err) {
      ultimoError = err;
      const quedanIntentos = intento < maxIntentos;
      if (!quedanIntentos || !esRecuperable(err)) throw err;
      await esperar(opciones.esperaMs);
    }
  }
  throw ultimoError;
}
