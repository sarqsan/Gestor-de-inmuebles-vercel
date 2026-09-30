/**
 * REPARTO DE LIQUIDACIÓN CON N TITULARES (BLOQUE 3 · 3.4)
 * =======================================================
 * El reparto que usa hoy la liquidación (`ConfigFiscalLiquidacion.
 * repartoCopropiedad`) es BINARIO: un primer titular implícito y un
 * `segundoPropietarioId` con `porcentajeSegundo`. Con la titularidad extensible
 * a N (Bloque 2) ese modelo puede dejar de representar la realidad.
 *
 * Regla: NUNCA se reparte "a ojo". Si el reparto binario no representa la
 * titularidad vigente, se informa y NO se aplica ningún reparto (3.4:
 * "sin repartos falsos"). El usuario debe completar los porcentajes reales.
 *
 * Módulo PURO: no escribe ni modifica nada.
 */

import type { Titularidad } from '../types';
import { titularidadesVigentes } from './titularidadesEngine';

export type TipoDiagnosticoReparto =
  /** Un solo titular: el 100 % es suyo, no hay reparto. */
  | 'UNICO_TITULAR'
  /** Sin titularidad vigente registrada. */
  | 'SIN_TITULARIDAD'
  /** Reparto binario que SÍ representa la titularidad vigente. */
  | 'REPARTO_BINARIO_OK'
  /** Reparto binario que NO encaja con los titulares vigentes. */
  | 'REPARTO_BINARIO_NO_ENCAJA'
  /** 2 titulares sin reparto configurado: todo queda pendiente. */
  | 'PENDIENTE_SIN_REPARTO'
  /** 3 o más titulares: el modelo binario NO puede representarlo. */
  | 'NO_REPRESENTABLE'
  /** Hay porcentajes pero no suman 100. */
  | 'SUMA_INCORRECTA';

export interface DiagnosticoReparto {
  tipo: TipoDiagnosticoReparto;
  /** ¿Se puede aplicar un reparto con garantías? */
  aplicable: boolean;
  /** Nº de titulares vigentes considerados. */
  titulares: number;
  /**
   * Reparto resultante `{propietarioId → porcentaje}`.
   * `null` cuando NO se puede afirmar ningún reparto (nunca se inventa).
   */
  reparto: Record<string, number> | null;
  /** Explicación para el usuario / para la auditoría. */
  mensaje: string;
}

/** ¿Existe un reparto binario utilizable? Forma laxa para no acoplarnos al tipo exacto. */
export interface RepartoBinarioLike {
  segundoPropietarioId?: string | null;
  porcentajeSegundo?: number | null;
}

function pctValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 100;
}

/**
 * Diagnostica si el reparto de liquidación representa fielmente la titularidad
 * vigente del inmueble.
 *
 * @param todas Todas las titularidades disponibles (se filtran las vigentes).
 * @param inmuebleId Inmueble objeto de la liquidación.
 * @param reparto Reparto binario heredado (`repartoCopropiedad`), si existe.
 */
export function diagnosticarReparto(
  todas: Titularidad[],
  inmuebleId: string,
  reparto?: RepartoBinarioLike | null
): DiagnosticoReparto {
  const vigentes = titularidadesVigentes(todas, inmuebleId);
  const n = vigentes.length;

  if (n === 0) {
    return {
      tipo: 'SIN_TITULARIDAD',
      aplicable: false,
      titulares: 0,
      reparto: null,
      mensaje: 'No hay titularidad vigente registrada: no se puede afirmar ningún reparto.',
    };
  }

  if (n === 1) {
    const unico = vigentes[0];
    return {
      tipo: 'UNICO_TITULAR',
      aplicable: true,
      titulares: 1,
      reparto: { [unico.propietarioId]: 100 },
      mensaje: 'Titular único: el 100 % le corresponde.',
    };
  }

  // --- 3 o más titulares: el modelo binario NO sirve --------------------
  if (n >= 3) {
    const todosTienenPct = vigentes.every(
      (t) => !t.porcentajePendiente && typeof t.porcentaje === 'number'
    );

    let suma = 0;
    for (const t of vigentes) suma += Number(t.porcentaje ?? 0);

    if (todosTienenPct && Math.abs(suma - 100) < 0.01) {
      const repartoN: Record<string, number> = {};
      for (const t of vigentes) repartoN[t.propietarioId] = t.porcentaje as number;
      return {
        tipo: 'REPARTO_BINARIO_NO_ENCAJA',
        aplicable: true,
        titulares: n,
        reparto: repartoN,
        mensaje:
          'La titularidad tiene 3 o más titulares: el reparto binario de la configuración fiscal NO la representa. Se usa el reparto real de la titularidad.',
      };
    }

    return {
      tipo: 'NO_REPRESENTABLE',
      aplicable: false,
      titulares: n,
      reparto: null,
      mensaje:
        'La titularidad tiene 3 o más titulares y el reparto binario de la configuración fiscal no puede representarla. Hay que indicar el porcentaje real de cada titular: NO se reparte a partes iguales ni se estima.',
    };
  }

  // --- Exactamente 2 titulares ------------------------------------------
  const [a, b] = vigentes;

  const segundoId = reparto?.segundoPropietarioId;
  const pctSegundo = reparto?.porcentajeSegundo;

  const idsVigentes = [a.propietarioId, b.propietarioId];
  const encaja = Boolean(segundoId) && idsVigentes.includes(String(segundoId));

  if (encaja && pctValido(pctSegundo)) {
    const principalId = a.propietarioId === segundoId ? b.propietarioId : a.propietarioId;
    return {
      tipo: 'REPARTO_BINARIO_OK',
      aplicable: true,
      titulares: 2,
      reparto: { [principalId]: 100 - pctSegundo, [String(segundoId)]: pctSegundo },
      mensaje: 'Reparto binario vigente y coherente con la titularidad actual.',
    };
  }

  if (encaja && !pctValido(pctSegundo)) {
    return {
      tipo: 'PENDIENTE_SIN_REPARTO',
      aplicable: false,
      titulares: 2,
      reparto: null,
      mensaje:
        'Hay 2 titulares pero el reparto de la configuración fiscal no es válido (falta o es incorrecto el porcentaje del segundo). No se reparte: queda pendiente.',
    };
  }

  // Los dos titulares tienen porcentaje propio en la titularidad: se usa ese dato real.
  const ambosConPct =
    !a.porcentajePendiente &&
    !b.porcentajePendiente &&
    typeof a.porcentaje === 'number' &&
    typeof b.porcentaje === 'number';

  if (ambosConPct) {
    const suma = (a.porcentaje as number) + (b.porcentaje as number);
    if (Math.abs(suma - 100) < 0.01) {
      return {
        tipo: 'REPARTO_BINARIO_NO_ENCAJA',
        aplicable: true,
        titulares: 2,
        reparto: { [a.propietarioId]: a.porcentaje as number, [b.propietarioId]: b.porcentaje as number },
        mensaje:
          'El reparto binario no apunta a ninguno de los titulares vigentes: se usa el porcentaje real de la titularidad.',
      };
    }
    return {
      tipo: 'SUMA_INCORRECTA',
      aplicable: false,
      titulares: 2,
      reparto: null,
      mensaje: `Los porcentajes de la titularidad suman ${suma} %, no 100 %. Corrígelos antes de liquidar: no se ajusta automáticamente.`,
    };
  }

  return {
    tipo: 'PENDIENTE_SIN_REPARTO',
    aplicable: false,
    titulares: 2,
    reparto: null,
    mensaje:
      'Hay 2 titulares y no existe un reparto válido ni porcentajes reales. Queda PENDIENTE: no se inventa un 50/50.',
  };
}

/** Atajo: ¿se puede liquidar con reparto garantizado? */
export function repartoAplicable(diagnostico: DiagnosticoReparto): boolean {
  return diagnostico.aplicable && diagnostico.reparto !== null;
}
