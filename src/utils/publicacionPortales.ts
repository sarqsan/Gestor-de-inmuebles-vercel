import { FormatoFeedPublicacion, PortalInmobiliario, PublicacionInmueble, ValidacionPublicacion } from '../types';
import { identidadPublicacionPortal, validarPublicacion } from './publicacionEngine';
import { generarFeedXmlKyero, generarFeedXmlPublicaciones } from './publicacionXml';
import { generarJsonLdPublicacion, generarJsonPublicacion } from './publicacionJson';

/**
 * GAP 5 — CAPA DE ADAPTADORES DE PORTAL.
 *
 * POLÍTICA (sin APIs inventadas ni automatizaciones que eludan restricciones):
 * - KYERO: mecanismo real y documentado = feed XML v3 servido en una URL que Kyero sondea.
 *   El adaptador GENERA el feed; el alta del feed requiere cuenta/acuerdo con Kyero.
 * - IDEALISTA: su API pública (developers.idealista.com) es de BÚSQUEDA (solo lectura);
 *   la publicación de anuncios requiere canal comercial propio de idealista. No se simula conexión.
 * - FOTOCASA / HABITACLIA (grupo Adevinta Spain): no ofrecen API pública de publicación;
 *   la sindicación se realiza por sus canales profesionales. No se simula conexión.
 *
 * En ningún caso se almacenan credenciales: el operador las gestiona fuera del ERP.
 */

export type ModoIntegracionPortal = 'FEED_XML_GENERABLE' | 'PENDIENTE_ACCESO_OPERADOR';

export interface AdaptadorPortal {
  portal: PortalInmobiliario;
  nombre: string;
  modo: ModoIntegracionPortal;
  formato: FormatoFeedPublicacion;
  /** Descripción del mecanismo real documentado. */
  mecanismo: string;
  /** Requisitos externos necesarios para publicar realmente. */
  requisitos: string[];
  /** Genera la exportación si el modo lo permite; si no, devuelve el motivo. */
  generar: (publicaciones: PublicacionInmueble[]) => { ok: boolean; contenido?: string; motivo?: string };
}

const adaptadorSoloPreparado = (
  portal: PortalInmobiliario,
  nombre: string,
  mecanismo: string,
  requisitos: string[]
): AdaptadorPortal => ({
  portal,
  nombre,
  modo: 'PENDIENTE_ACCESO_OPERADOR',
  formato: 'XML_GENERICO',
  mecanismo,
  requisitos,
  generar: () => ({
    ok: false,
    motivo: `${nombre}: este portal requiere acceso/configuración del operador y no se simula conexión. ${mecanismo}`,
  }),
});

export const ADAPTADORES_PORTAL: AdaptadorPortal[] = [
  {
    portal: 'KYERO',
    nombre: 'Kyero',
    modo: 'FEED_XML_GENERABLE',
    formato: 'XML_KYLERO',
    mecanismo:
      'Feed XML v3: el ERP genera el archivo XML y el agente lo sirve en una URL que los servidores de Kyero sondean periódicamente.',
    requisitos: [
      'Cuenta de agente en Kyero',
      'Alojar el feed XML en una URL pública estable',
      'Confirmar el mapeo definitivo de campos durante el onboarding de Kyero',
    ],
    generar: (publicaciones) => {
      const invalidas = publicaciones
        .map((p) => ({ pub: p, val: validarPublicacion(p) }))
        .filter((x) => !x.val.valido);
      if (invalidas.length > 0) {
        return {
          ok: false,
          motivo: `Errores bloqueantes en ${invalidas.length} publicación(es): ${invalidas[0].val.erroresBloqueantes.join(' | ')}`,
        };
      }
      return { ok: true, contenido: generarFeedXmlKyero(publicaciones) };
    },
  },
  adaptadorSoloPreparado(
    'IDEALISTA',
    'Idealista',
    'La API pública de idealista (developers.idealista.com) es solo de búsqueda; publicar anuncios requiere el canal comercial/profesional de idealista.',
    [
      'Acuerdo comercial con idealista para publicación profesional',
      'Credenciales del canal de publicación (fuera del ERP, nunca en Firestore ni en el código)',
    ]
  ),
  adaptadorSoloPreparado(
    'FOTOCASA',
    'Fotocasa',
    'Fotocasa (Adevinta Spain) no ofrece API pública de publicación; la carga se realiza por sus herramientas profesionales.',
    ['Acceso profesional a las herramientas de Fotocasa', 'Configuración del operador (fuera del ERP)']
  ),
  adaptadorSoloPreparado(
    'HABITACLIA',
    'Habitaclia',
    'Habitaclia (Adevinta Spain) no ofrece API pública de publicación; la carga se realiza por sus herramientas profesionales.',
    ['Acceso profesional a las herramientas de Habitaclia', 'Configuración del operador (fuera del ERP)']
  ),
];

export function obtenerAdaptadorPortal(portal: PortalInmobiliario): AdaptadorPortal | undefined {
  return ADAPTADORES_PORTAL.find((a) => a.portal === portal);
}

export const PORTALES_DISPONIBLES: PortalInmobiliario[] = ['KYERO', 'IDEALISTA', 'FOTOCASA', 'HABITACLIA'];

export const FORMATOS_EXPORTACION: { formato: FormatoFeedPublicacion; etiqueta: string }[] = [
  { formato: 'XML_GENERICO', etiqueta: 'XML normalizado (genérico)' },
  { formato: 'XML_KYLERO', etiqueta: 'XML feed Kyero v3' },
  { formato: 'JSON_NORMALIZADO', etiqueta: 'JSON normalizado' },
  { formato: 'JSON_LD', etiqueta: 'JSON-LD (Schema.org)' },
];

/**
 * Resultado completo de una generación para exportación manual (fase 13).
 * Valida antes de generar e informa errores/advertencias con claridad.
 */
export function generarExportacion(
  publicaciones: PublicacionInmueble[],
  formato: FormatoFeedPublicacion,
  portal?: PortalInmobiliario
): {
  ok: boolean;
  contenido?: string;
  tipoMime: string;
  validaciones: ValidacionPublicacion[];
  externalIds: { inmuebleId: string; externalId: string }[];
  motivo?: string;
} {
  const validaciones = publicaciones.map((p) => validarPublicacion(p));
  const conError = validaciones.filter((v) => !v.valido);
  const externalIds = portal
    ? publicaciones.map((p) => ({ inmuebleId: p.inmuebleId, externalId: identidadPublicacionPortal(p.inmuebleId, portal).externalId }))
    : [];

  if (conError.length > 0) {
    return {
      ok: false,
      tipoMime: 'text/plain',
      validaciones,
      externalIds,
      motivo: `Existen ${conError.length} publicación(es) con errores bloqueantes.`,
    };
  }

  switch (formato) {
    case 'XML_GENERICO':
      return { ok: true, contenido: generarFeedXmlPublicaciones(publicaciones), tipoMime: 'application/xml', validaciones, externalIds };
    case 'XML_KYLERO':
      return { ok: true, contenido: generarFeedXmlKyero(publicaciones), tipoMime: 'application/xml', validaciones, externalIds };
    case 'JSON_NORMALIZADO':
      return { ok: true, contenido: generarJsonPublicacion(publicaciones), tipoMime: 'application/json', validaciones, externalIds };
    case 'JSON_LD':
      if (publicaciones.length !== 1) {
        return {
          ok: false,
          tipoMime: 'application/ld+json',
          validaciones,
          externalIds,
          motivo: 'JSON-LD se genera por inmueble individual (selecciona exactamente uno).',
        };
      }
      return { ok: true, contenido: generarJsonLdPublicacion(publicaciones[0]), tipoMime: 'application/ld+json', validaciones, externalIds };
    default:
      return { ok: false, tipoMime: 'text/plain', validaciones, externalIds, motivo: `Formato no soportado: ${formato}` };
  }
}
