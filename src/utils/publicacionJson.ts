import { PublicacionInmueble } from '../types';
import { deduplicarPublicaciones } from './publicacionXml';

/**
 * GAP 5 — JSON NORMALIZADO Y JSON-LD.
 * - Determinista: construcción con orden de claves fijo + serialización estable.
 * - Solo datos reales del ERP: nunca se inventan superficies, precios, características,
 *   disponibilidades, ubicaciones ni valoraciones.
 */

/** Serialización JSON determinista (ordena claves recursivamente). */
export function jsonDeterminista(valor: unknown): string {
  return JSON.stringify(ordenarClaves(valor), null, 2);
}

function ordenarClaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarClaves);
  if (valor && typeof valor === 'object') {
    const obj = valor as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const clave of Object.keys(obj).sort()) {
      const v = obj[clave];
      if (v !== undefined) out[clave] = ordenarClaves(v);
    }
    return out;
  }
  return valor;
}

/**
 * Representación JSON equivalente al modelo normalizado (fase 6).
 * Conserva imágenes e identificadores; representa alquiler completo y por habitaciones.
 */
export function generarJsonPublicacion(publicaciones: PublicacionInmueble[]): string {
  const unicas = deduplicarPublicaciones(publicaciones)
    .sort((a, b) => a.idPublico.localeCompare(b.idPublico));
  return jsonDeterminista({
    version: 'GAP5/1.0',
    total: unicas.length,
    inmuebles: unicas.map((p) => ({
      identificacion: {
        inmuebleId: p.inmuebleId,
        idPublico: p.idPublico,
        referenciaInterna: p.referenciaInterna,
      },
      ubicacion: {
        direccion: p.direccion,
        municipio: p.municipio,
        provincia: p.provincia,
        codigoPostal: p.codigoPostal,
        coordenadas: p.coordenadas,
      },
      caracteristicas: {
        tipoInmueble: p.tipoInmueble,
        modalidadAlquiler: p.modalidadAlquiler,
        superficieM2: p.superficieM2,
        habitaciones: p.habitaciones,
        banos: p.banos,
        planta: p.planta,
        ascensor: p.ascensor,
        terraza: p.terraza,
        balcon: p.balcon,
        garaje: p.garaje,
        trastero: p.trastero,
        aireAcondicionado: p.aireAcondicionado,
        calefaccion: p.calefaccion,
      },
      economico: {
        tipoOperacion: p.tipoOperacion,
        precioMensual: p.precioMensual,
        fianzaMeses: p.fianzaMeses,
        moneda: 'EUR',
      },
      descripcion: {
        titulo: p.titulo,
        descripcion: p.descripcion,
        caracteristicas: p.caracteristicas,
      },
      imagenes: p.imagenes,
      habitacionesPublicables: p.habitacionesPublicables,
    })),
  });
}

/** Mapeo del tipo de inmueble del ERP a vocabulario Schema.org (solo tipos reales del ERP). */
export function tipoSchemaOrg(pub: PublicacionInmueble): string {
  if (pub.modalidadAlquiler === 'habitaciones') return 'Apartment'; // el inmueble completo es un piso por habitaciones
  switch (pub.tipoInmueble) {
    case 'casa':
    case 'chalet':
      return 'House';
    case 'local':
      return 'Place'; // uso distinto de vivienda: sin tipo residencial aplicable
    case 'habitacion':
      return 'Room';
    case 'piso':
    case 'atico':
    case 'duplex':
    case 'estudio':
    default:
      return 'Apartment';
  }
}

/**
 * JSON-LD (Schema.org) de una publicación individual.
 * SOLO con información realmente disponible: si un campo no existe en el ERP, no aparece.
 * No se inventan superficies, precios, disponibilidades, ubicaciones ni valoraciones.
 */
export function generarJsonLdPublicacion(pub: PublicacionInmueble): string {
  const nodo: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': tipoSchemaOrg(pub),
    identifier: pub.idPublico,
    name: pub.titulo,
  };

  if (pub.descripcion) nodo.description = pub.descripcion;

  const address: Record<string, unknown> = {};
  if (pub.direccion) address.streetAddress = pub.direccion;
  if (pub.municipio) address.addressLocality = pub.municipio;
  if (pub.provincia) address.addressRegion = pub.provincia;
  if (pub.codigoPostal) address.postalCode = pub.codigoPostal;
  address.addressCountry = 'ES';
  nodo.address = address;

  if (pub.coordenadas) {
    nodo.geo = {
      '@type': 'GeoCoordinates',
      latitude: pub.coordenadas.latitud,
      longitude: pub.coordenadas.longitud,
    };
  }

  // FloorSize / numberOfRooms SOLO si existen realmente en el ERP
  if (pub.superficieM2 && pub.superficieM2 > 0) {
    nodo.floorSize = { '@type': 'QuantitativeValue', value: pub.superficieM2, unitCode: 'MTK' };
  }
  if (pub.habitaciones !== undefined && pub.modalidadAlquiler !== 'habitaciones') {
    nodo.numberOfRooms = pub.habitaciones;
  }
  if (pub.banos !== undefined) nodo.numberOfBathroomsTotal = pub.banos;

  nodo.offers = {
    '@type': 'Offer',
    price: pub.precioMensual,
    priceCurrency: 'EUR',
    businessFunction: 'http://purl.org/goodrelations/v1#LeaseOut',
  };

  if (pub.imagenes.length > 0) {
    nodo.image = pub.imagenes.map((i) => i.url);
  }

  if (pub.modalidadAlquiler === 'habitaciones' && pub.habitacionesPublicables && pub.habitacionesPublicables.length > 0) {
    nodo.containsPlace = pub.habitacionesPublicables.map((h) => {
      const room: Record<string, unknown> = {
        '@type': 'Room',
        name: h.nombre,
        identifier: h.habitacionId,
      };
      if (h.superficieM2) room.floorSize = { '@type': 'QuantitativeValue', value: h.superficieM2, unitCode: 'MTK' };
      if (h.precioMensual) {
        room.offers = { '@type': 'Offer', price: h.precioMensual, priceCurrency: 'EUR' };
      }
      return room;
    });
  }

  return jsonDeterminista(nodo);
}
