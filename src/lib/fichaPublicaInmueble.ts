/**
 * R3 — Ficha pública de inmueble (espejo mínimo para accesos anónimos).
 *
 * La colección `inmuebles` contiene datos estrictamente privados (IBAN, NIF de
 * propietarios, inquilino actual, valores patrimoniales, notas internas,
 * token de solicitud…) y su lectura YA NO es pública (ver `firestore.rules`
 * §1). Los flujos anónimos legítimos (reserva de visita, solicitud de
 * alquiler, cuestionario) resuelven UN inmueble por id mediante esta ficha,
 * que contiene EXCLUSIVAMENTE campos destinados a publicación.
 *
 * - Escritura: `saveFichaPublicaInmueble` (la invoca `saveInmuebleFirestore`
 *   tras guardar; solo master/propietario titular según reglas R3).
 * - Lectura anónima: `cargarFichaPublicaPorToken` (id exacto o `sol-<id>`).
 * - Este módulo NUNCA lee la colección `inmuebles` (verificado en tests).
 * - Sin propietario efectivo no hay ficha (cierre por defecto).
 */
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Inmueble, InmuebleImage } from '../types';

/** Colección espejo con solo campos publicables (reglas R3). */
export const FICHAS_PUBLICAS_COL = 'fichas_publicas_inmueble';

/** Prefijo de los enlaces generados por `CrearEnlaceSolicitudModal` (`sol-<id>`). */
export const PREFIJO_ENLACE_SOLICITUD = 'sol-';

/** Imagen de ficha pública: solo lo necesario para renderizar la galería. */
export interface ImagenFichaPublica {
  id: string;
  storagePath: string;
  downloadURL: string;
  order: number;
  isCover: boolean;
  isPublic: boolean;
}

/**
 * Ficha pública: lista blanca CERRADA. Añadir un campo aquí exige añadirlo a
 * `CAMPOS_FICHA_PUBLICA`, a `clavesFichaPublicaOk()` en `firestore.rules` y
 * justificar por qué es publicable. Todo lo demás es privado por defecto.
 */
export interface FichaPublicaInmueble {
  id: string;
  inmuebleId: string;
  /** Titular efectivo (necesario para que la regla autorice al propietario). */
  propietarioId: string;
  direccion: string;
  ciudad: string;
  codigoPostal?: string;
  precio: number;
  estado: 'disponible' | 'alquilado';
  habitaciones: number;
  banos: number;
  superficie: number;
  descripcion?: string;
  /** Portada heredada (solo https; nunca data-URL). */
  imagenUrl?: string;
  imagenes: ImagenFichaPublica[];
  fianzaMeses: number;
  tipoInmueble?: Inmueble['tipoInmueble'];
  modalidadAlquiler?: Inmueble['modalidadAlquiler'];
  planta?: string;
  ascensor?: boolean;
  terraza?: boolean;
  balcon?: boolean;
  interiorExterior?: Inmueble['interiorExterior'];
  orientacion?: string;
  anioConstruccion?: number;
  estadoConservacion?: Inmueble['estadoConservacion'];
  aireAcondicionado?: boolean;
  calefaccion?: boolean;
  cocinaEquipada?: boolean;
  electrodomesticosIncluidos?: boolean;
  armariosEmpotrados?: boolean;
  tipoVentanas?: string;
  tipoPersianas?: string;
  actualizadoEn: string;
}

/** Claves permitidas en la ficha (paridad con `clavesFichaPublicaOk()`). */
export const CAMPOS_FICHA_PUBLICA: readonly string[] = [
  'id',
  'inmuebleId',
  'propietarioId',
  'direccion',
  'ciudad',
  'codigoPostal',
  'precio',
  'estado',
  'habitaciones',
  'banos',
  'superficie',
  'descripcion',
  'imagenUrl',
  'imagenes',
  'fianzaMeses',
  'tipoInmueble',
  'modalidadAlquiler',
  'planta',
  'ascensor',
  'terraza',
  'balcon',
  'interiorExterior',
  'orientacion',
  'anioConstruccion',
  'estadoConservacion',
  'aireAcondicionado',
  'calefaccion',
  'cocinaEquipada',
  'electrodomesticosIncluidos',
  'armariosEmpotrados',
  'tipoVentanas',
  'tipoPersianas',
  'actualizadoEn',
];

/**
 * Campos del `Inmueble` que JAMÁS entran en la ficha (documenta la frontera;
 * los tests afirman la ausencia de cada uno, incluidos los anidados).
 */
export const CAMPOS_PRIVADOS_INMUEBLE: readonly string[] = [
  'tokenSolicitud',
  'referenciaCatastral',
  'datosCatastrales',
  'propietarioPrincipalId',
  'propietarioSecundarioId',
  'cuentaBancariaCobroId',
  'ibanCobro',
  'datosFiscales',
  'inquilinoActualId',
  'inquilinoActualNombre',
  'contratoActivoId',
  'valorAdquisicion',
  'valoracionEstimada',
  'rentabilidadEstimada',
  'fechaAdquisicion',
  'notasInternas',
  'alias',
  'municipio',
  'localidad',
  'provincia',
  'pais',
  'tipo',
  'rentaMensual',
  'candidatosCount',
  'imagenIa',
  'createdAt',
  'updatedAt',
  'fechaActualizacionFicha',
  'actualizadoPorFicha',
  'suministroIds',
  'contratoIdsAutorizados',
];

/** Titular efectivo (misma derivación que usan las reglas de `inmuebles`). */
export function propietarioEfectivoInmueble(inm: Inmueble): string {
  return (inm.propietarioId || inm.propietarioPrincipalId || '').trim();
}

/** Solo URLs https(s): las data-URL de emergencia nunca salen a la ficha. */
function esUrlPublicable(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\//i.test(url.trim());
}

function recortarImagen(img: InmuebleImage): ImagenFichaPublica | null {
  if (img.isPublic === false) return null;
  if (!esUrlPublicable(img.downloadURL)) return null;
  return {
    id: String(img.id || ''),
    storagePath: String(img.storagePath || ''),
    downloadURL: img.downloadURL,
    order: Number(img.order || 0),
    isCover: img.isCover === true,
    isPublic: true,
  };
}

/**
 * Construye la ficha pública desde el documento completo. Devuelve `null` si
 * el inmueble no tiene titular efectivo (sin titular no hay publicación:
 * cierre por defecto, igual que exigen las reglas R3 en escritura).
 */
export function buildFichaPublicaInmueble(inm: Inmueble, ahoraIso?: string): FichaPublicaInmueble | null {
  const propietarioId = propietarioEfectivoInmueble(inm);
  if (!propietarioId) return null;
  const imagenes = (inm.images || [])
    .map(recortarImagen)
    .filter((x): x is ImagenFichaPublica => x !== null)
    .sort((a, b) => {
      if (a.isCover) return -1;
      if (b.isCover) return 1;
      return a.order - b.order;
    });
  const ficha: FichaPublicaInmueble = {
    id: inm.id,
    inmuebleId: inm.id,
    propietarioId,
    direccion: inm.direccion,
    ciudad: inm.ciudad,
    codigoPostal: inm.codigoPostal,
    precio: inm.precio,
    estado: inm.estado,
    habitaciones: inm.habitaciones,
    banos: inm.banos,
    superficie: inm.superficie,
    descripcion: inm.descripcion,
    imagenUrl: esUrlPublicable(inm.imagenUrl) ? inm.imagenUrl : undefined,
    imagenes,
    fianzaMeses: inm.fianzaMeses,
    tipoInmueble: inm.tipoInmueble,
    modalidadAlquiler: inm.modalidadAlquiler,
    planta: inm.planta,
    ascensor: inm.ascensor,
    terraza: inm.terraza,
    balcon: inm.balcon,
    interiorExterior: inm.interiorExterior,
    orientacion: inm.orientacion,
    anioConstruccion: inm.anioConstruccion,
    estadoConservacion: inm.estadoConservacion,
    aireAcondicionado: inm.aireAcondicionado,
    calefaccion: inm.calefaccion,
    cocinaEquipada: inm.cocinaEquipada,
    electrodomesticosIncluidos: inm.electrodomesticosIncluidos,
    armariosEmpotrados: inm.armariosEmpotrados,
    tipoVentanas: inm.tipoVentanas,
    tipoPersianas: inm.tipoPersianas,
    actualizadoEn: ahoraIso || new Date().toISOString(),
  };
  // Sin `undefined`: la ficha persistida contiene exactamente sus claves.
  return JSON.parse(JSON.stringify(ficha)) as FichaPublicaInmueble;
}

/** Guarda (reemplaza) la ficha pública derivada. Propaga errores. */
export async function saveFichaPublicaInmueble(ficha: FichaPublicaInmueble): Promise<void> {
  await setDoc(doc(db, FICHAS_PUBLICAS_COL, ficha.id), { ...ficha }, { merge: false });
}

/** Elimina la ficha pública (al borrar el inmueble; solo master por reglas). */
export async function deleteFichaPublicaInmueble(fichaId: string): Promise<void> {
  if (!fichaId) return;
  await deleteDoc(doc(db, FICHAS_PUBLICAS_COL, fichaId));
}

/** Lee UNA ficha por id (get público; `null` si no existe o se deniega). */
export async function getFichaPublicaInmueble(fichaId: string): Promise<FichaPublicaInmueble | null> {
  const id = String(fichaId || '').trim();
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, FICHAS_PUBLICAS_COL, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as object) } as FichaPublicaInmueble;
  } catch {
    return null;
  }
}

/**
 * Ids candidatos para un token de enlace, en orden: el token tal cual (cubre
 * enlaces `/#solicitud/<id>` con el id directo) y, si lleva el prefijo
 * generado por el ERP, el id sin prefijo. Pura (testeable sin red).
 */
export function candidatosIdFichaPublica(token: string): string[] {
  const t = String(token || '').trim();
  if (!t) return [];
  const ids = [t];
  if (t.startsWith(PREFIJO_ENLACE_SOLICITUD) && t.length > PREFIJO_ENLACE_SOLICITUD.length) {
    const sinPrefijo = t.slice(PREFIJO_ENLACE_SOLICITUD.length);
    if (!ids.includes(sinPrefijo)) ids.push(sinPrefijo);
  }
  return ids;
}

/**
 * Resuelve la ficha pública de un enlace anónimo. Prueba cada candidato en
 * orden y devuelve la primera que exista; `null` si ninguna (cierre por
 * defecto). Solo toca la colección espejo, jamás `inmuebles`.
 */
export async function cargarFichaPublicaPorToken(token: string): Promise<FichaPublicaInmueble | null> {
  for (const id of candidatosIdFichaPublica(token)) {
    const ficha = await getFichaPublicaInmueble(id);
    if (ficha) return ficha;
  }
  return null;
}

/**
 * Adapta la ficha para las vistas públicas tipadas con `Inmueble` (visita,
 * solicitud, cuestionario): esas vistas solo consumen campos públicos
 * (dirección, ciudad, precio, imágenes, características), todos presentes.
 */
export function adaptarFichaAInmuebleVista(ficha: FichaPublicaInmueble): Inmueble {
  // Las vistas leen `images` (galería vía getInmueblePublicImages): se mapea
  // `imagenes` -> `images` con `createdAt` derivado (requerido por el tipo).
  const { imagenes, ...resto } = ficha;
  return {
    ...resto,
    images: imagenes.map((img) => ({ ...img, createdAt: ficha.actualizadoEn })),
  } as unknown as Inmueble;
}
