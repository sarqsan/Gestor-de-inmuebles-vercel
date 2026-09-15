// ============================================================
// FASE 3.6 — Cliente del kit de publicación (IA con plantilla
// heurística de respaldo en el servidor).
// ============================================================

import type { ExpedienteRecomercializacion, Inmueble, KitPublicacion } from '../types';
import { DESTINO_INMUEBLE_LABEL } from './recomercializacionEngine';

export async function generarKitPublicacion(args: {
  expediente: ExpedienteRecomercializacion;
  inmueble?: Inmueble;
  rentaAnterior?: number;
  hechosAdicionales?: string[];
}): Promise<KitPublicacion> {
  const { expediente, inmueble } = args;
  const resp = await fetch('/api/generar-kit-publicacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipoInmueble: inmueble?.tipoInmueble,
      ciudad: inmueble?.ciudad,
      codigoPostal: inmueble?.codigoPostal,
      superficie: inmueble?.superficie,
      habitaciones: inmueble?.habitaciones,
      banos: inmueble?.banos,
      destino: DESTINO_INMUEBLE_LABEL[expediente.destinoPrevisto],
      precioRecomendado: expediente.pricing?.escenarioRecomendado,
      precioVenta: expediente.pricing?.precioSalidaRecomendado ?? expediente.pricing?.valoracionVentaEstimada,
      mejoras: (expediente.mejorasPropuestas ?? [])
        .filter((m) => m.confirmadaPorPropietario)
        .map((m) => m.actuacion),
      anioConstruccion: inmueble?.datosCatastrales?.anioConstruccion,
      hechosAdicionales: args.hechosAdicionales ?? [],
    }),
  });
  if (!resp.ok) throw new Error(`El kit de publicación respondió ${resp.status}.`);
  const json = await resp.json();
  return {
    titulo: json.titulo,
    descripcion: json.descripcion,
    puntosFuertes: json.puntosFuertes ?? [],
    entorno: json.entorno ?? [],
    extras: json.extras ?? [],
    motor: json.motor === 'ia' ? 'ia' : 'heuristico',
    fechaGeneracion: new Date().toISOString(),
  };
}
