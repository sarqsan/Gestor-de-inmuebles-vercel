import {
  EstadoPublicacionPortal,
  EstadoSindicacionPortal,
  HabitacionInmueble,
  HabitacionPublicacion,
  ImagenPublicacion,
  Inmueble,
  PortalInmobiliario,
  PublicacionInmueble,
  RegistroTrazabilidadPublicacion,
  ValidacionPublicacion,
} from '../types';
import { estadoHabitacionEfectivo } from './habitacionesEngine';

/**
 * GAP 5 — MOTOR DE SINDICACIÓN Y PUBLICACIÓN MULTICANAL.
 *
 * ARQUITECTURA (capa desacoplada):
 *   DATOS ERP → MODELO NORMALIZADO (buildPublicacionInmueble)
 *             → VALIDADOR (validarPublicacion)
 *             → GENERADOR/ADAPTADOR (publicacionXml / publicacionJson / publicacionPortales)
 *             → FEED O EXPORTACIÓN
 *
 * REGLAS:
 * - El modelo interno NO depende de ningún portal concreto.
 * - NO se inventan valores: solo se publican datos reales del ERP.
 * - NO se modifica el circuito de contratos/disponibilidad: las habitaciones se LEEN.
 * - Idempotencia: identidad estable por inmuebleId + portal (actualizar no duplica).
 * - Sin credenciales ni secretos: los adaptadores que requieren acceso externo lo declaran.
 */

// =====================================================================
// IDENTIDAD ESTABLE E IDEMPOTENCIA
// =====================================================================

/** Hash determinista y estable (FNV-1a 32 bits → base36). Sin aleatoriedad: reproducible. */
export function hashEstable(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Identificador público estable del inmueble (independiente del portal). */
export function generarIdPublicoInmueble(inmuebleId: string): string {
  return `pub_${hashEstable(`inmueble:${inmuebleId}`)}`;
}

/** Referencia interna legible del ERP para el inmueble. */
export function referenciaInternaInmueble(inmueble: Inmueble): string {
  return inmueble.referenciaCatastral?.trim() || `ERP-${inmueble.id}`;
}

/**
 * Identidad por inmueble + portal: MISMO inmueble + MISMO portal = MISMA identidad.
 * Una actualización regenera contenido bajo el mismo externalId → no crea anuncios duplicados.
 */
export function identidadPublicacionPortal(inmuebleId: string, portal: PortalInmobiliario): {
  clave: string;
  externalId: string;
} {
  const clave = `${portal}:${inmuebleId}`;
  return { clave, externalId: `${portal.toLowerCase()}_${hashEstable(clave)}` };
}

// =====================================================================
// MODELO NORMALIZADO (solo datos reales del ERP)
// =====================================================================

/**
 * Construye el modelo normalizado de publicación a partir de los datos del ERP.
 * Determinista: misma entrada → misma salida (sin Date.now ni aleatoriedad).
 */
export function buildPublicacionInmueble(
  inmueble: Inmueble,
  habitaciones?: HabitacionInmueble[]
): PublicacionInmueble {
  const imagenes: ImagenPublicacion[] = (inmueble.images || [])
    .filter((img) => img.isPublic !== false && !!img.downloadURL)
    .sort((a, b) => {
      if (!!a.isCover !== !!b.isCover) return a.isCover ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    })
    .map((img, idx) => ({
      url: img.downloadURL,
      orden: idx,
      portada: !!img.isCover,
    }));

  const modalidad: 'completo' | 'habitaciones' = inmueble.modalidadAlquiler || 'completo';

  // Solo LECTURA del circuito de habitaciones: se publican las habitaciones activas y disponibles.
  let habitacionesPublicables: HabitacionPublicacion[] | undefined;
  if (modalidad === 'habitaciones' && habitaciones) {
    habitacionesPublicables = [...habitaciones]
      .filter((h) => h.inmuebleId === inmueble.id && h.activo !== false)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((h) => ({
        habitacionId: h.id,
        nombre: h.nombre,
        descripcion: h.descripcion,
        superficieM2: h.superficie,
        precioMensual: h.precioObjetivo,
        disponible: estadoHabitacionEfectivo(h.estado) === 'DISPONIBLE' && !h.selectedCandidatoId,
      }));
  }

  const caracteristicas: string[] = [];
  if (inmueble.ascensor) caracteristicas.push('Ascensor');
  if (inmueble.terraza) caracteristicas.push('Terraza');
  if (inmueble.balcon) caracteristicas.push('Balcón');
  if (inmueble.aireAcondicionado) caracteristicas.push('Aire acondicionado');
  if (inmueble.calefaccion) caracteristicas.push('Calefacción');
  if (inmueble.cocinaEquipada) caracteristicas.push('Cocina equipada');
  if (inmueble.electrodomesticosIncluidos) caracteristicas.push('Electrodomésticos incluidos');
  if (inmueble.armariosEmpotrados) caracteristicas.push('Armarios empotrados');
  if (inmueble.interiorExterior) {
    caracteristicas.push(inmueble.interiorExterior === 'exterior' ? 'Exterior' : inmueble.interiorExterior === 'interior' ? 'Interior' : 'Interior/Exterior');
  }
  caracteristicas.sort();

  const tituloBase = `${inmueble.tipoInmueble ? tipoInmuebleLabel(inmueble.tipoInmueble) : 'Inmueble'} en alquiler en ${inmueble.ciudad}`;

  const pub: PublicacionInmueble = {
    inmuebleId: inmueble.id,
    idPublico: generarIdPublicoInmueble(inmueble.id),
    referenciaInterna: referenciaInternaInmueble(inmueble),
    propietarioId: inmueble.propietarioId || inmueble.propietarioPrincipalId,
    direccion: inmueble.direccion || '',
    municipio: inmueble.ciudad || '',
    provincia: inmueble.provincia,
    codigoPostal: inmueble.codigoPostal,
    tipoInmueble: inmueble.tipoInmueble,
    modalidadAlquiler: modalidad,
    superficieM2: inmueble.superficie,
    habitaciones: inmueble.habitaciones,
    banos: inmueble.banos,
    planta: inmueble.planta,
    ascensor: inmueble.ascensor,
    terraza: inmueble.terraza,
    balcon: inmueble.balcon,
    aireAcondicionado: inmueble.aireAcondicionado,
    calefaccion: inmueble.calefaccion,
    precioMensual: inmueble.precio,
    fianzaMeses: inmueble.fianzaMeses,
    tipoOperacion: 'ALQUILER',
    titulo: tituloBase,
    descripcion: inmueble.descripcion,
    caracteristicas,
    imagenes,
  };
  if (habitacionesPublicables) {
    pub.habitacionesPublicables = habitacionesPublicables;
  }
  return pub;
}

function tipoInmuebleLabel(tipo: string): string {
  const map: Record<string, string> = {
    piso: 'Piso',
    casa: 'Casa',
    chalet: 'Chalet',
    estudio: 'Estudio',
    atico: 'Ático',
    duplex: 'Dúplex',
    habitacion: 'Habitación',
    local: 'Local',
  };
  return map[tipo] || 'Inmueble';
}

// =====================================================================
// VALIDACIÓN (errores bloqueantes vs advertencias; sin inventar valores)
// =====================================================================

export function validarPublicacion(pub: PublicacionInmueble): ValidacionPublicacion {
  const erroresBloqueantes: string[] = [];
  const advertencias: string[] = [];

  // --- ERRORES BLOQUEANTES ---
  if (!pub.inmuebleId) erroresBloqueantes.push('Identificador de inmueble inexistente.');
  if (!pub.idPublico) erroresBloqueantes.push('Identificador público inexistente.');
  if (!(pub.precioMensual > 0)) erroresBloqueantes.push('Precio inválido: debe ser un número positivo.');
  if (!pub.direccion || !pub.direccion.trim()) erroresBloqueantes.push('Ubicación esencial ausente: falta la dirección.');
  if (!pub.municipio || !pub.municipio.trim()) erroresBloqueantes.push('Ubicación esencial ausente: falta el municipio.');
  if (!pub.referenciaInterna) erroresBloqueantes.push('Referencia interna inexistente.');
  if (pub.superficieM2 !== undefined && pub.superficieM2 <= 0) {
    erroresBloqueantes.push('Datos incompatibles: superficie no positiva.');
  }

  // --- ADVERTENCIAS ---
  if (pub.imagenes.length === 0) advertencias.push('Sin imágenes: el anuncio se publicará sin fotografías.');
  if (!pub.descripcion || pub.descripcion.trim().length < 40) {
    advertencias.push('Descripción ausente o demasiado corta (menos de 40 caracteres).');
  }
  if (!pub.provincia) advertencias.push('Provincia no informada.');
  if (!pub.tipoInmueble) advertencias.push('Tipo de inmueble no informado.');
  if (pub.codigoPostal === undefined || pub.codigoPostal === '') {
    advertencias.push('Código postal no informado.');
  }
  if (pub.modalidadAlquiler === 'habitaciones') {
    const habs = pub.habitacionesPublicables || [];
    if (habs.length === 0) {
      advertencias.push('Modalidad habitaciones sin habitaciones registradas en la publicación.');
    } else if (!habs.some((h) => h.disponible)) {
      advertencias.push('Ninguna habitación figura como disponible actualmente.');
    }
  }

  return { valido: erroresBloqueantes.length === 0, erroresBloqueantes, advertencias };
}

// =====================================================================
// ESTADOS DE PUBLICACIÓN POR PORTAL (independientes del estado del inmueble)
// =====================================================================

export const ESTADOS_PUBLICACION: EstadoPublicacionPortal[] = [
  'BORRADOR',
  'VALIDADO',
  'LISTO_PARA_PUBLICAR',
  'PUBLICADO',
  'ACTUALIZADO',
  'DESPUBLICADO',
  'ERROR',
];

const TRANSICIONES_PUBLICACION: Record<EstadoPublicacionPortal, EstadoPublicacionPortal[]> = {
  BORRADOR: ['VALIDADO', 'ERROR'],
  VALIDADO: ['LISTO_PARA_PUBLICAR', 'BORRADOR', 'ERROR'],
  LISTO_PARA_PUBLICAR: ['PUBLICADO', 'VALIDADO', 'ERROR'],
  PUBLICADO: ['ACTUALIZADO', 'DESPUBLICADO', 'ERROR'],
  ACTUALIZADO: ['PUBLICADO', 'DESPUBLICADO', 'ERROR'],
  DESPUBLICADO: ['LISTO_PARA_PUBLICAR', 'BORRADOR', 'ERROR'],
  ERROR: ['BORRADOR', 'VALIDADO', 'LISTO_PARA_PUBLICAR'],
};

export function transicionEstadoPublicacionPermitida(
  actual: EstadoPublicacionPortal,
  siguiente: EstadoPublicacionPortal
): boolean {
  return (TRANSICIONES_PUBLICACION[actual] || []).includes(siguiente);
}

/** Estado inicial de sindicación para un inmueble en los portales indicados. */
export function estadoSindicacionInicial(inmuebleId: string, portales: PortalInmobiliario[]): EstadoSindicacionPortal[] {
  return portales.map((portal) => ({
    portal,
    externalId: identidadPublicacionPortal(inmuebleId, portal).externalId,
    estado: 'BORRADOR' as EstadoPublicacionPortal,
  }));
}

/**
 * Aplica una transición de estado de publicación validada. Devuelve el registro actualizado
 * o un error si la transición no está permitida. Inmutable.
 */
export function aplicarEstadoPublicacion(
  registro: EstadoSindicacionPortal,
  siguiente: EstadoPublicacionPortal,
  opts?: { ultimoError?: string; fecha?: string }
): { ok: boolean; registro?: EstadoSindicacionPortal; error?: string } {
  if (!transicionEstadoPublicacionPermitida(registro.estado, siguiente)) {
    return {
      ok: false,
      error: `Transición de publicación no permitida: ${registro.estado} → ${siguiente} (${registro.portal}).`,
    };
  }
  return {
    ok: true,
    registro: {
      ...registro,
      estado: siguiente,
      ultimaSincronizacion: opts?.fecha || new Date().toISOString(),
      ultimoError: siguiente === 'ERROR' ? opts?.ultimoError : undefined,
    },
  };
}

// =====================================================================
// TRAZABILIDAD (sin credenciales ni secretos)
// =====================================================================

/**
 * Registro de trazabilidad de una generación/exportación. El llamador decide si lo persiste;
 * el motor no almacena nada por sí mismo en este primer bloque.
 */
export function registrarTrazabilidadPublicacion(
  pub: PublicacionInmueble,
  portal: RegistroTrazabilidadPublicacion['portal'],
  formato: RegistroTrazabilidadPublicacion['formato'],
  validacion: ValidacionPublicacion,
  externalId?: string,
  fecha?: string
): RegistroTrazabilidadPublicacion {
  return {
    inmuebleId: pub.inmuebleId,
    idPublico: pub.idPublico,
    portal,
    formato,
    fecha: fecha || new Date().toISOString(),
    externalId,
    resultado: validacion.valido ? 'OK' : 'ERROR',
    errores: [...validacion.erroresBloqueantes],
    advertencias: [...validacion.advertencias],
  };
}

// =====================================================================
// SEGURIDAD / AISLAMIENTO
// =====================================================================

/**
 * El propietario de una publicación es inmutable: procede del inmueble del ERP.
 * Deniega cualquier intento de reasignar propietarioId en el modelo normalizado.
 */
export function propietarioPublicacionInmutable(pub: PublicacionInmueble, propietarioIntentado?: string): boolean {
  if (!pub.propietarioId || !propietarioIntentado) return false;
  return propietarioIntentado !== pub.propietarioId;
}

/**
 * Aislamiento: una publicación solo puede generarse para un inmueble del propietario indicado.
 */
export function publicacionAccesoDenegado(inmueble: Inmueble, propietarioId?: string): boolean {
  if (!propietarioId) return true;
  const propietarioInmueble = inmueble.propietarioId || inmueble.propietarioPrincipalId;
  if (!propietarioInmueble) return false; // sin propietario registrado: lo decide el RBAC superior
  return propietarioInmueble !== propietarioId;
}
