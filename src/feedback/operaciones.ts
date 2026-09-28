/**
 * BLOQUE 10 · UX-3 — EJECUCIÓN DE OPERACIONES CON RESULTADO REAL.
 *
 * Toda acción del usuario pasa por aquí para cumplir la regla de la orden (§6):
 * **no se muestra éxito hasta que el resultado real confirma el éxito**.
 *
 * Cómo se sabe:
 *  1. si la acción lanza una excepción → fallo (nunca éxito);
 *  2. si la acción devuelve `false` (contrato booleano B5) → fallo;
 *  3. si la acción termina pero la persistencia registró un fallo de guardado
 *     durante la operación (canal de incidencias de UX-2, instrumentado en la capa
 *     de datos) → fallo, aunque la promesa se haya resuelto `void`;
 *  3. sólo si ninguna de las dos cosas ocurre → éxito.
 *
 * Estado `idle → ejecutando → resultado` (§7) sin estados globales: `useOperacionEnCurso`
 * es local a cada pantalla y bloquea el doble envío mientras dura la operación.
 *
 * No cambia contratos de datos ni la estrategia de persistencia (B5 intacta).
 */
import { useCallback, useRef, useState } from 'react';

import { reportarResultadoGuardado, ultimaIncidenciaDe } from '../estadoDatos/canalIncidencias';
import type { OrigenDatos } from '../estadoDatos/canalIncidencias';
import { avisarOperacion } from './canalFeedback';

export type MotivoFalloOperacion = 'excepcion' | 'persistencia' | 'duplicada';

export type ResultadoOperacion<T> =
  | { ok: true; valor: T }
  | { ok: false; motivo: MotivoFalloOperacion; error?: unknown };

export interface OpcionesOperacion<T> {
  /** Operación real (la misma que ejecutaba la interfaz). */
  accion: () => Promise<T> | T;
  /** Mensaje de éxito. Ej. «Inmueble guardado correctamente.» */
  mensajeExito?: string | ((valor: T) => string);
  /** Mensaje de fallo. Ej. «No se ha podido guardar el inmueble.» */
  mensajeError: string;
  /**
   * Orígenes de datos implicados: si alguno registra un fallo de guardado durante
   * la operación, el resultado no puede presentarse como éxito.
   */
  origenesDatos?: readonly OrigenDatos[];
  /** Efecto adicional tras el éxito (navegación, cierre de modal…). */
  onExito?: (valor: T) => void;
  /** Efecto adicional tras el fallo. */
  onFallo?: (resultado: Extract<ResultadoOperacion<T>, { ok: false }>) => void;
  /** `false` para operaciones sin feedback de éxito (p. ej. guardados silenciosos). */
  avisarExito?: boolean;
}

/** Instantánea de la última incidencia de guardado por origen (detección de fallos nuevos). */
function fallosDe(origenes: readonly OrigenDatos[]): Array<string | undefined> {
  return origenes.map((origen) => ultimaIncidenciaDe(origen, 'GUARDADO')?.id);
}

export async function ejecutarOperacion<T>({
  accion,
  mensajeExito,
  mensajeError,
  origenesDatos = [],
  onExito,
  onFallo,
  avisarExito = true,
}: OpcionesOperacion<T>): Promise<ResultadoOperacion<T>> {
  const fallosPrevios = fallosDe(origenesDatos);
  let valor: T;
  try {
    valor = await accion();
  } catch (error) {
    console.error(`[UX-3] ${mensajeError}`, error);
    avisarOperacion({ tipo: 'error', mensaje: mensajeError });
    const fallo: Extract<ResultadoOperacion<T>, { ok: false }> = { ok: false, motivo: 'excepcion', error };
    onFallo?.(fallo);
    return fallo;
  }

  // B5: los contratos booleanos (`save*Firestore` → `Promise<boolean>`) devuelven
  // `false` cuando la persistencia NO confirmó el cambio: nunca puede presentarse
  // como éxito, aunque la promesa se haya resuelto.
  if (valor === false) {
    origenesDatos.forEach((origen) => reportarResultadoGuardado(origen, false));
    console.error(`[UX-3] ${mensajeError} (la persistencia devolvió false).`);
    avisarOperacion({ tipo: 'error', mensaje: mensajeError });
    const fallo: Extract<ResultadoOperacion<T>, { ok: false }> = { ok: false, motivo: 'persistencia' };
    onFallo?.(fallo);
    return fallo;
  }

  const fallosNuevos = fallosDe(origenesDatos);
  const huboFalloDePersistencia = fallosNuevos.some((id, i) => id !== fallosPrevios[i]);
  if (huboFalloDePersistencia) {
    // La promesa se resolvió, pero la persistencia no confirmó: no se puede decir «guardado».
    console.error(`[UX-3] ${mensajeError} (la persistencia no confirmó el cambio).`);
    avisarOperacion({ tipo: 'error', mensaje: mensajeError });
    const fallo: Extract<ResultadoOperacion<T>, { ok: false }> = { ok: false, motivo: 'persistencia' };
    onFallo?.(fallo);
    return fallo;
  }

  if (avisarExito && mensajeExito) {
    avisarOperacion({
      tipo: 'exito',
      mensaje: typeof mensajeExito === 'function' ? mensajeExito(valor) : mensajeExito,
    });
  }
  onExito?.(valor);
  return { ok: true, valor };
}

export interface OperacionEnCurso {
  /** `true` mientras hay una operación en curso (usar para deshabilitar el control). */
  ejecutando: boolean;
  /** Ejecuta una sola vez: una segunda llamada mientras corre no se ejecuta. */
  ejecutar: <T>(opciones: OpcionesOperacion<T>) => Promise<ResultadoOperacion<T>>;
}

/** Estado `idle → ejecutando → resultado` local a la pantalla, con bloqueo de doble envío. */
export function useOperacionEnCurso(): OperacionEnCurso {
  const [ejecutando, setEjecutando] = useState(false);
  const enCursoRef = useRef(false);

  const ejecutar = useCallback(<T,>(opciones: OpcionesOperacion<T>): Promise<ResultadoOperacion<T>> => {
    if (enCursoRef.current) {
      // Doble clic / doble envío: se ignora la segunda pulsación.
      return Promise.resolve({ ok: false, motivo: 'duplicada' } as ResultadoOperacion<T>);
    }
    enCursoRef.current = true;
    setEjecutando(true);
    return ejecutarOperacion(opciones).finally(() => {
      enCursoRef.current = false;
      setEjecutando(false);
    });
  }, []);

  return { ejecutando, ejecutar };
}
