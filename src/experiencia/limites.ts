export interface ResultadoLimite { permitido: boolean; reintentarEnMs: number }

/** Limitador local de ventana móvil para rutas IA de alto coste (por clave de origen). */
export function crearLimitadorVentana(maximo: number, ventanaMs: number, reloj: () => number = Date.now) {
  if (!Number.isInteger(maximo) || maximo < 1 || !Number.isFinite(ventanaMs) || ventanaMs < 1) throw new Error('LÍMITE_INVÁLIDO');
  const marcas = new Map<string, number[]>();
  return {
    consumir(clave: string): ResultadoLimite {
      const ahora = reloj();
      const previas = (marcas.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
      if (previas.length >= maximo) {
        marcas.set(clave, previas);
        return { permitido: false, reintentarEnMs: Math.max(1, ventanaMs - (ahora - previas[0])) };
      }
      previas.push(ahora);
      marcas.set(clave, previas);
      // Evita crecimiento sin límite en procesos persistentes.
      if (marcas.size > 5000) {
        for (const [k, ts] of marcas) if (ts.every((t) => ahora - t >= ventanaMs)) marcas.delete(k);
      }
      return { permitido: true, reintentarEnMs: 0 };
    },
  };
}
