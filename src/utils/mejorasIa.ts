// ============================================================
// FASE 3.4 — Cliente del generador de propuestas de reforma/ROI.
// Envía el diagnóstico de las fotos (texto) al servidor y devuelve
// objetos MejoraROI con estimaciones orientativas (rangos, no
// presupuestos). El payback lo calcula el motor en cliente.
// ============================================================

import type {
  CategoriaMejora,
  ExpedienteRecomercializacion,
  Inmueble,
  MejoraROI,
} from '../types';
import {
  nuevoMejoraId,
  normalizarMejora,
  sugerenciasDesdeFotos,
} from './recomercializacionEngine';
import { DESTINO_INMUEBLE_LABEL } from './recomercializacionEngine';

interface MejoraRemota {
  actuacion: string;
  categoria: CategoriaMejora;
  costeEstimadoMin?: number;
  costeEstimadoMax?: number;
  incrementoRentaMensual?: number;
  incrementoValoracion?: number;
  impacto?: 'bajo' | 'medio' | 'alto';
}

export interface ResultadoMejorasIa {
  mejoras: MejoraROI[];
  motor: 'gemini' | 'heuristico';
}

/**
 * Pide al servidor propuestas de mejora a partir del diagnóstico visual.
 * Las nuevas propuestas llegan sin confirmar (corresponden al escenario
 * "reforma completa"); el propietario marca después cuáles ejecuta.
 */
export async function proponerMejorasROI(args: {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
  rentaAnterior?: number;
}): Promise<ResultadoMejorasIa> {
  const { expediente, inmueble, rentaAnterior } = args;
  const fotos = (expediente.revisionFotografica?.fotografias ?? [])
    .filter((f) => f.analisisIa)
    .map((f) => ({
      estancia: f.estancia,
      observaciones: f.analisisIa?.observaciones ?? [],
      sugerenciasMejora: f.analisisIa?.sugerenciasMejora ?? [],
    }));

  const resp = await fetch('/api/proponer-mejoras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rentaAnterior,
      destino: DESTINO_INMUEBLE_LABEL[expediente.destinoPrevisto],
      ciudad: inmueble?.ciudad,
      codigoPostal: inmueble?.codigoPostal,
      fotos,
      sugerencias: sugerenciasDesdeFotos(expediente),
    }),
  });
  if (!resp.ok) {
    throw new Error(`El generador de mejoras respondió ${resp.status}.`);
  }
  const json = await resp.json();
  const remotas: MejoraRemota[] = Array.isArray(json.mejoras) ? json.mejoras : [];
  const mejoras: MejoraROI[] = remotas.map((m) =>
    normalizarMejora({
      id: nuevoMejoraId(),
      actuacion: m.actuacion,
      categoria: m.categoria,
      costeEstimadoMin: m.costeEstimadoMin,
      costeEstimadoMax: m.costeEstimadoMax,
      incrementoRentaMensual: m.incrementoRentaMensual,
      incrementoValoracion: m.incrementoValoracion,
      impacto: m.impacto || 'medio',
      confirmadaPorPropietario: false,
      origen: 'ia',
    })
  );
  return { mejoras, motor: json.motorGlobal === 'gemini' ? 'gemini' : 'heuristico' };
}

/**
 * Elimina propuestas casi duplicadas (misma actuación, ignorando
 * mayúsculas/acentos) antes de añadir las nuevas.
 */
export function evitarDuplicadosMejora(existentes: MejoraROI[], nuevas: MejoraROI[]): MejoraROI[] {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const actuales = new Set(existentes.map((m) => norm(m.actuacion)));
  return nuevas.filter((m) => {
    const clave = norm(m.actuacion);
    if (!clave || actuales.has(clave)) return false;
    actuales.add(clave);
    return true;
  });
}
