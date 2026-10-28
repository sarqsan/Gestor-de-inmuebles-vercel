/// <reference types="vite/client" />
/**
 * P0.1 — Flags de ejecución del CLIENTE (solo lectura, sin secretos).
 * ===========================================================================
 * Dos banderas separan "datos de demostración" de "datos reales":
 *
 *  · `VITE_SEEDS_ENABLED`  → permite escribir semillas en Firestore.
 *  · `VITE_DEMO_DATA`      → permite precargar la UI con `INITIAL_*`.
 *
 * AMBAS están desactivadas por defecto. Un despliegue que no las declare
 * arranca con la interfaz vacía y NO escribe nada en la base de datos hasta
 * que una suscripción real entregue datos. Esto evita que un usuario vea
 * inmuebles/candidatos ficticios como si fueran suyos o que un primer login
 * de administrador siembre datos demo en producción.
 *
 * Son variables `VITE_*` (públicas por diseño en el bundle): NO deben
 * contener secretos. Solo activan comportamiento de demostración.
 */

type MetaEntorno = { env?: Readonly<Record<string, unknown>> };

function leerVariable(nombre: string): string {
  try {
    const meta = import.meta as unknown as MetaEntorno;
    const valor = meta.env?.[nombre];
    return typeof valor === 'string' ? valor.trim() : '';
  } catch {
    // Entorno sin import.meta.env (node:test, scripts): comportamiento seguro.
    return '';
  }
}

/** Solo `1`, `true`, `si`, `sí` u `on` activan una bandera; cualquier otra cosa la apaga. */
export function banderaActivada(nombre: string): boolean {
  return ['1', 'true', 'si', 'sí', 'on'].includes(leerVariable(nombre).toLowerCase());
}

/** ¿Se permite ESCRIBIR semillas (usuarios demo, aseguradoras, especialidades)? */
export function semillasHabilitadas(): boolean {
  return banderaActivada('VITE_SEEDS_ENABLED');
}

/** ¿Se permite MOSTRAR datos de demostración antes del primer snapshot real? */
export function datosDemoHabilitados(): boolean {
  return banderaActivada('VITE_DEMO_DATA');
}
