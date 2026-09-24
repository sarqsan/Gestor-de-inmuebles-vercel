// ============================================================
// FASE 3.5 — Cliente de la revisión de pricing por IA.
// El cálculo base es determinista (pricingRecomerc.ts); la IA
// solo puede refinarlo a partir de los datos aportados.
// ============================================================

import type { Inmueble, PricingRecomercializacion } from '../types';

export async function estimarPricingConIA(args: {
  base: PricingRecomercializacion;
  rentaAnterior?: number;
  ipcAcumuladoPct?: number;
  ajusteMercadoPct?: number;
  mejoraRenta?: number;
  inmueble?: Inmueble;
  esVenta?: boolean;
  destino?: string;
}): Promise<{ pricing: PricingRecomercializacion; confianza?: 'alta' | 'media' | 'baja' }> {
  const { base, inmueble } = args;
  const resp = await fetch('/api/estimar-pricing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base,
      rentaAnterior: args.rentaAnterior,
      ipcAcumuladoPct: args.ipcAcumuladoPct,
      ajusteMercadoPct: args.ajusteMercadoPct,
      mejoraRenta: args.mejoraRenta,
      comparables: base.comparables ?? [],
      superficie: inmueble?.superficie,
      habitaciones: inmueble?.habitaciones,
      banos: inmueble?.banos,
      tipoInmueble: inmueble?.tipoInmueble,
      catastro: inmueble?.datosCatastrales,
      ciudad: inmueble?.ciudad,
      codigoPostal: inmueble?.codigoPostal,
      destino: args.destino,
    }),
  });
  if (!resp.ok) throw new Error(`La estimación de precio respondió ${resp.status}.`);
  const json = await resp.json();
  return {
    pricing: {
      ...base,
      ...json,
      fechaCalculo: new Date().toISOString(),
    } as PricingRecomercializacion,
    confianza: json.confianza,
  };
}
