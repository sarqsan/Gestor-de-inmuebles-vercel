/**
 * REPARTO ENTRE N TITULARES
 * =========================
 * Motor puro que convierte un importe neto en la parte de cada titular.
 *
 * Reglas duras:
 *  · NO se inventan porcentajes: si el diagnóstico no es `OK`, el reparto
 *    BLOQUEA (el llamador debe detener la liquidación).
 *  · Con 3+ titulares no se hace ninguna partición binaria inventada.
 *  · Redondeo a céntimos con reparto del residuo por mayor resto, de modo que
 *    la suma de las partes es EXACTAMENTE el importe (sin descuadres).
 *  · Sin titularidades declaradas: sólo se admite el reparto binario EXPLÍCITO
 *    ya configurado (`repartoCopropiedad`), nunca uno supuesto.
 */
import type { Titularidad } from '../types';
import type { DiagnosticoPorcentajes } from './titularidadesEngine';
import { redondear2, validarPorcentajes } from './titularidadesEngine';

export type OrigenReparto = 'TITULARIDADES' | 'REPARTO_BINARIO' | 'SIN_REPARTO';

export interface ParteReparto {
  propietarioId: string;
  nombre?: string;
  porcentaje: number;
  importe: number;
}

export interface RepartoAplicado {
  origen: OrigenReparto;
  /** Partes de TODOS los titulares excepto el titular principal de la liquidación. */
  partes: ParteReparto[];
  /** Importe que corresponde al titular principal (propietario de la liquidación). */
  importePrincipal: number;
  /** Reparto completo (incluye al principal), en el mismo orden que las titularidades. */
  detalle: ParteReparto[];
}

export interface ResultadoReparto {
  ok: boolean;
  /** Mensaje bloqueante cuando `ok === false`. */
  mensaje?: string;
  reparto?: RepartoAplicado;
}

/** Reparte `importe` (céntimos exactos) según porcentajes. */
function repartir(importe: number, porcentajes: Array<{ propietarioId: string; porcentaje: number; nombre?: string }>): ParteReparto[] {
  const bruto = porcentajes.map((p) => ({
    propietarioId: p.propietarioId,
    nombre: p.nombre,
    porcentaje: p.porcentaje,
    exacto: (importe * p.porcentaje) / 100,
  }));
  const partes = bruto.map((b) => ({
    propietarioId: b.propietarioId,
    nombre: b.nombre,
    porcentaje: b.porcentaje,
    importe: redondear2(b.exacto),
  }));
  // Residuo por redondeo: se asigna por mayor resto (determinista e íntegro).
  const suma = redondear2(partes.reduce((acc, p) => acc + p.importe, 0));
  let residuoCentimos = Math.round((importe - suma) * 100);
  if (residuoCentimos !== 0) {
    const orden = bruto
      .map((b, i) => ({ i, resto: b.exacto - Math.floor(b.exacto * 100) / 100 }))
      .sort((a, b) => b.resto - a.resto || a.i - b.i);
    let cursor = 0;
    const paso = residuoCentimos > 0 ? 1 : -1;
    while (residuoCentimos !== 0 && orden.length > 0) {
      const idx = orden[cursor % orden.length].i;
      partes[idx] = { ...partes[idx], importe: redondear2(partes[idx].importe + paso * 0.01) };
      residuoCentimos -= paso;
      cursor += 1;
    }
  }
  return partes;
}

export interface OpcionesReparto {
  /** propietarioId al que se le liquida (titular principal de la liquidación). */
  propietarioPrincipalId: string;
  /** Nombres para presentación (opcional). */
  nombres?: Record<string, string>;
  /**
   * Reparto binario EXPLÍCITO ya configurado en la liquidación (comportamiento
   * heredado de main). Sólo se aplica cuando NO hay titularidades declaradas.
   */
  repartoBinario?: { segundoPropietarioId: string; porcentajeSegundo: number; segundoPropietarioNombre?: string };
}

/**
 * Calcula el reparto del importe neto entre los N titulares.
 * Devuelve `ok:false` (y la liquidación debe BLOQUEARSE) cuando el reparto no
 * es demostrable: nunca reparte "a ojo".
 */
export function calcularReparto(
  importe: number,
  titularidades: readonly Titularidad[],
  opciones: OpcionesReparto,
): ResultadoReparto {
  const neto = redondear2(Number(importe) || 0);
  const nombreDe = (id: string) => opciones.nombres?.[id];

  if (neto === 0) {
    return { ok: true, reparto: { origen: 'SIN_REPARTO', partes: [], importePrincipal: 0, detalle: [] } };
  }

  const diagnostic: DiagnosticoPorcentajes = validarPorcentajes(titularidades);

  if (diagnostic.codigo === 'SIN_TITULARIDADES') {
    const bin = opciones.repartoBinario;
    if (!bin || !bin.segundoPropietarioId) {
      return {
        ok: true,
        reparto: { origen: 'SIN_REPARTO', partes: [], importePrincipal: neto, detalle: [] },
      };
    }
    const pct2 = Number(bin.porcentajeSegundo);
    if (!(pct2 > 0 && pct2 < 100)) {
      return {
        ok: false,
        mensaje: `Reparto de copropiedad no válido: porcentajeSegundo debe estar entre 0 y 100 (valor: ${pct2}).`,
      };
    }
    const detalle = repartir(neto, [
      { propietarioId: opciones.propietarioPrincipalId, porcentaje: redondear2(100 - pct2), nombre: nombreDe(opciones.propietarioPrincipalId) },
      {
        propietarioId: bin.segundoPropietarioId,
        porcentaje: pct2,
        nombre: bin.segundoPropietarioNombre || nombreDe(bin.segundoPropietarioId),
      },
    ]);
    const principal = detalle.find((p) => p.propietarioId === opciones.propietarioPrincipalId);
    return {
      ok: true,
      reparto: {
        origen: 'REPARTO_BINARIO',
        partes: detalle.filter((p) => p.propietarioId !== opciones.propietarioPrincipalId),
        importePrincipal: principal?.importe ?? redondear2(neto - (detalle.find((p) => p.propietarioId !== opciones.propietarioPrincipalId)?.importe ?? 0)),
        detalle,
      },
    };
  }

  if (diagnostic.bloquea) {
    return { ok: false, mensaje: diagnostic.mensaje };
  }

  const detalle = repartir(
    neto,
    diagnostic.porcentajes.map((p) => ({ ...p, nombre: nombreDe(p.propietarioId) })),
  );
  const principal = detalle.find((p) => p.propietarioId === opciones.propietarioPrincipalId);
  const importePrincipal =
    principal?.importe ??
    redondear2(neto - detalle.filter((p) => p.propietarioId !== opciones.propietarioPrincipalId).reduce((a, p) => a + p.importe, 0));

  return {
    ok: true,
    reparto: {
      origen: 'TITULARIDADES',
      partes: detalle.filter((p) => p.propietarioId !== opciones.propietarioPrincipalId),
      importePrincipal,
      detalle,
    },
  };
}
