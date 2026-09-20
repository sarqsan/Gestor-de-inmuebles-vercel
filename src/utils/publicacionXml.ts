import { PublicacionInmueble } from '../types';
import { identidadPublicacionPortal } from './publicacionEngine';

/**
 * GAP 5 — GENERADOR XML.
 * Propiedades garantizadas: válido, determinista, con escaping correcto,
 * identificadores estables, sin duplicados y reproducible con los mismos datos.
 * NO incluye marcas de tiempo internas: la fecha de generación solo aparece si el
 * llamador la aporta explícitamente (determinismo).
 */

/** Escaping XML completo: & < > " ' (en este orden: la ampersand primero). */
export function escapeXml(valor: string): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function nodo(nombre: string, valor: string | number | boolean | undefined | null): string {
  if (valor === undefined || valor === null || valor === '') return '';
  return `    <${nombre}>${escapeXml(String(valor))}</${nombre}>\n`;
}

/** Deduplicación por idPublico conservando el orden de primera aparición. */
export function deduplicarPublicaciones(publicaciones: PublicacionInmueble[]): PublicacionInmueble[] {
  const vistos = new Set<string>();
  const resultado: PublicacionInmueble[] = [];
  for (const pub of publicaciones) {
    if (!pub.idPublico || vistos.has(pub.idPublico)) continue;
    vistos.add(pub.idPublico);
    resultado.push(pub);
  }
  return resultado;
}

function ordenarDeterminista(publicaciones: PublicacionInmueble[]): PublicacionInmueble[] {
  return [...publicaciones].sort((a, b) => a.idPublico.localeCompare(b.idPublico));
}

function bloquePublicacionXml(pub: PublicacionInmueble): string {
  let xml = '';
  xml += `  <inmueble id="${escapeXml(pub.idPublico)}">\n`;
  xml += nodo('referencia_interna', pub.referenciaInterna);
  xml += nodo('operacion', pub.tipoOperacion);
  xml += nodo('modalidad', pub.modalidadAlquiler);
  xml += nodo('precio_mensual', pub.precioMensual);
  xml += nodo('fianza_meses', pub.fianzaMeses);
  xml += nodo('titulo', pub.titulo);
  xml += nodo('descripcion', pub.descripcion);
  xml += nodo('direccion', pub.direccion);
  xml += nodo('municipio', pub.municipio);
  xml += nodo('provincia', pub.provincia);
  xml += nodo('codigo_postal', pub.codigoPostal);
  if (pub.coordenadas) {
    xml += nodo('latitud', pub.coordenadas.latitud);
    xml += nodo('longitud', pub.coordenadas.longitud);
  }
  xml += nodo('tipo_inmueble', pub.tipoInmueble);
  xml += nodo('superficie_m2', pub.superficieM2);
  xml += nodo('num_habitaciones', pub.habitaciones);
  xml += nodo('num_banos', pub.banos);
  xml += nodo('planta', pub.planta);
  if (pub.ascensor !== undefined) xml += nodo('ascensor', pub.ascensor);
  if (pub.terraza !== undefined) xml += nodo('terraza', pub.terraza);
  if (pub.balcon !== undefined) xml += nodo('balcon', pub.balcon);
  if (pub.garaje !== undefined) xml += nodo('garaje', pub.garaje);
  if (pub.trastero !== undefined) xml += nodo('trastero', pub.trastero);
  if (pub.aireAcondicionado !== undefined) xml += nodo('aire_acondicionado', pub.aireAcondicionado);
  if (pub.calefaccion !== undefined) xml += nodo('calefaccion', pub.calefaccion);

  if (pub.caracteristicas.length > 0) {
    xml += '    <caracteristicas>\n';
    for (const c of pub.caracteristicas) {
      xml += `      <caracteristica>${escapeXml(c)}</caracteristica>\n`;
    }
    xml += '    </caracteristicas>\n';
  }

  if (pub.imagenes.length > 0) {
    xml += '    <imagenes>\n';
    for (const img of pub.imagenes) {
      xml += `      <imagen orden="${img.orden}" portada="${img.portada}">${escapeXml(img.url)}</imagen>\n`;
    }
    xml += '    </imagenes>\n';
  }

  if (pub.habitacionesPublicables && pub.habitacionesPublicables.length > 0) {
    xml += '    <habitaciones>\n';
    for (const h of pub.habitacionesPublicables) {
      xml += `      <habitacion id="${escapeXml(h.habitacionId)}" disponible="${h.disponible}">\n`;
      xml += `        <nombre>${escapeXml(h.nombre)}</nombre>\n`;
      if (h.superficieM2 !== undefined) xml += `        <superficie_m2>${escapeXml(String(h.superficieM2))}</superficie_m2>\n`;
      if (h.precioMensual !== undefined) xml += `        <precio_mensual>${escapeXml(String(h.precioMensual))}</precio_mensual>\n`;
      if (h.descripcion) xml += `        <descripcion>${escapeXml(h.descripcion)}</descripcion>\n`;
      xml += '      </habitacion>\n';
    }
    xml += '    </habitaciones>\n';
  }

  xml += '  </inmueble>\n';
  return xml;
}

/**
 * Feed XML genérico y normalizado (independiente de portal).
 * Determinista: mismo input → mismo byte de salida.
 */
export function generarFeedXmlPublicaciones(publicaciones: PublicacionInmueble[]): string {
  const unicas = ordenarDeterminista(deduplicarPublicaciones(publicaciones));
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<feed_inmuebles total="${unicas.length}">\n`;
  for (const pub of unicas) {
    xml += bloquePublicacionXml(pub);
  }
  xml += '</feed_inmuebles>\n';
  return xml;
}

/**
 * ADAPTADOR KYERO (feed XML v3, mecanismo real documentado: Kyero descarga/sondea una URL
 * de feed XML proporcionada por el agente; el agente necesita cuenta Kyero para el alta).
 * Genera un XML conservador con la estructura pública conocida de Kyero v3.
 * El mapeo fino definitivo se confirma durante el onboarding con Kyero (no se inventan APIs).
 */
export function generarFeedXmlKyero(publicaciones: PublicacionInmueble[]): string {
  const unicas = ordenarDeterminista(deduplicarPublicaciones(publicaciones));
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<kyero>\n';
  for (const pub of unicas) {
    const identidad = identidadPublicacionPortal(pub.inmuebleId, 'KYERO');
    xml += `  <property id="${escapeXml(identidad.externalId)}">\n`;
    xml += nodo('reference', pub.referenciaInterna);
    xml += nodo('price', pub.precioMensual);
    xml += nodo('currency', 'EUR');
    xml += nodo('price_freq', 'month');
    xml += nodo('type', pub.tipoInmueble || 'apartment');
    xml += nodo('town', pub.municipio);
    xml += nodo('province', pub.provincia);
    xml += nodo('postcode', pub.codigoPostal);
    xml += nodo('beds', pub.habitaciones);
    xml += nodo('baths', pub.banos);
    xml += nodo('built', pub.superficieM2);
    xml += nodo('desc', pub.descripcion || pub.titulo);
    if (pub.imagenes.length > 0) {
      xml += '    <url_list>\n';
      for (const img of pub.imagenes) {
        xml += `      <image url="${escapeXml(img.url)}" order="${img.orden}"/>\n`;
      }
      xml += '    </url_list>\n';
    }
    xml += '  </property>\n';
  }
  xml += '</kyero>\n';
  return xml;
}
