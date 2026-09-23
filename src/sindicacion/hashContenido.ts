/**
 * GAP 5 · FASE 1 — HUECO 1: representación canónica, hash de contenido y versionado.
 * ------------------------------------------------------------------------------
 * ESTE MÓDULO NO es un segundo motor: compone el existente.
 *   · La forma del dato la define `PublicacionInmueble` (src/types.ts).
 *   · La huella corta reutiliza `hashEstable` (src/utils/publicacionEngine.ts).
 *   · La huella fuerte reutiliza `sha256Hex` (src/utils/sha256.ts, ya verificado
 *     contra los vectores de la AEAT y contra `crypto.createHash`).
 *   · La ordenación estable de claves reutiliza `jsonDeterminista`
 *     (src/utils/publicacionJson.ts).
 * Aquí solo se añade lo que faltaba: qué se considera CONTENIDO PUBLICABLE y cómo
 * se numera una versión del mismo.
 *
 * Contratos que se cumplen (comprobados en tests/…):
 *   mismo contenido publicable → misma huella (aunque el objeto de entrada difiera
 *   en el orden de sus propiedades, en espacios o en claves ausentes vs vacías);
 *   un cambio relevante (precio, descripción, imágenes, superficie…) → huella distinta;
 *   la identidad del inmueble es INDEPENDIENTE del contenido: no cambia si cambia el contenido;
 *   cero reloj, cero aleatoriedad, cero E/S ⇒ determinista y sin efectos secundarios.
 */
import type { HabitacionPublicacion, ImagenPublicacion, Inmueble, PublicacionInmueble } from '../types';
import { generarIdPublicoInmueble, hashEstable, identidadPublicacionPortal, referenciaInternaInmueble } from '../utils/publicacionEngine';
import { jsonDeterminista } from '../utils/publicacionJson';
import { sha256Hex } from '../utils/sha256';
import type { PortalInmobiliario } from '../types';

/**
 * Claves de METADATO que no forman parte del contenido publicable y, por tanto,
 * NUNCA entran en la huella. `generadoEn` es el campo que el motor existente deja
 * opcional para el llamador: si entrara en la huella, cada generación produciría
 * una versión nueva falsa (publicaciones inútiles).
 */
export const CLAVES_NO_CONTENIDO: readonly string[] = ['generadoEn'];

/** Metadato por imagen (gestión del ciclo de vida, no contenido del anuncio). */
export const CLAVES_NO_CONTENIDO_IMAGEN: readonly string[] = ['estadoPublicacion'];

export interface VersionPublicable {
  /** 1 para el primer contenido conocido; se incrementa sólo si cambia la huella. */
  numero: number;
  /** Etiqueta opaca y legible para anuncios/logs: `v{numero}·{huellaCorta}`. */
  etiqueta: string;
  /** Huella fuerte (SHA-256, hex minúsculas, 64) de la forma canónica. */
  hashContenido: string;
  /** Huella corta derivada de `hashEstable` (el contrato ya existente). */
  hashCorto: string;
  /** Longitud de la representación canónica: sólo diagnóstico (no participa en la igualdad). */
  longitudCanonica: number;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** Cadena normalizada: recortada; vacía ⇒ `undefined` (ausente y vacío son el mismo contenido). */
function textoNormalizado(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return valor === undefined || valor === null ? undefined : String(valor);
  const recortado = valor.replace(/\s+/g, ' ').trim();
  return recortado.length > 0 ? recortado : undefined;
}

function canonizarImagen(imagen: ImagenPublicacion): Record<string, unknown> {
  const salida: Record<string, unknown> = {
    url: textoNormalizado(imagen?.url) ?? '',
    orden: Number.isFinite(imagen?.orden as number) ? Number(imagen.orden) : 0,
    portada: imagen?.portada === true,
  };
  return salida;
}

function canonizarHabitacion(habitacion: HabitacionPublicacion): Record<string, unknown> {
  const salida: Record<string, unknown> = { habitacionId: String(habitacion?.habitacionId ?? '') };
  const nombre = textoNormalizado(habitacion?.nombre);
  if (nombre !== undefined) salida.nombre = nombre;
  const descripcion = textoNormalizado(habitacion?.descripcion);
  if (descripcion !== undefined) salida.descripcion = descripcion;
  if (typeof habitacion?.superficieM2 === 'number' && Number.isFinite(habitacion.superficieM2)) {
    salida.superficieM2 = habitacion.superficieM2;
  }
  if (typeof habitacion?.precioMensual === 'number' && Number.isFinite(habitacion.precioMensual)) {
    salida.precioMensual = habitacion.precioMensual;
  }
  salida.disponible = habitacion?.disponible === true;
  return salida;
}

/**
 * Forma canónica del contenido publicable: valores normalizados, claves de
 * metadato excluidas, conjuntos ordenados (`caracteristicas`, habitaciones) y
 * imágenes ordenadas por el criterio con el que se construye el feed (portada +
 * `orden`): la posición de LLEGADA del array no es contenido, la portada y el
 * `orden` declarado sí lo son. La ordenación de claves la hace `jsonDeterminista`.
 */
export function formaCanonicaPublicable(pub: PublicacionInmueble): Record<string, unknown> {
  const origen = (pub || {}) as Record<string, unknown>;
  const salida: Record<string, unknown> = {};

  for (const clave of Object.keys(origen)) {
    if ((CLAVES_NO_CONTENIDO as readonly string[]).includes(clave)) continue;
    const valor = origen[clave];
    if (clave === 'imagenes') continue; // se trata abajo, con su propia normalización
    if (clave === 'habitacionesPublicables') continue; // ídem
    if (clave === 'caracteristicas') continue; // ídem
    if (typeof valor === 'string') {
      const texto = textoNormalizado(valor);
      if (texto !== undefined) salida[clave] = texto;
      continue;
    }
    if (valor === undefined || valor === null || valor === '') continue;
    if (typeof valor === 'number') {
      if (Number.isFinite(valor)) salida[clave] = valor;
      continue;
    }
    if (typeof valor === 'boolean') {
      salida[clave] = valor;
      continue;
    }
    if (esObjeto(valor)) {
      const hijo = canonizarValorPlano(valor);
      if (Object.keys(hijo).length > 0) salida[clave] = hijo;
      continue;
    }
    if (Array.isArray(valor)) {
      const items = valor.map((x) => canonizarValorPlano(x)).filter((x) => Object.keys(x).length > 0);
      if (items.length > 0) salida[clave] = items;
      continue;
    }
    salida[clave] = valor;
  }

  // Conjuntos: orden canónico independiente del orden de origen (mismo contenido, misma huella).
  const caracteristicas = Array.isArray(pub?.caracteristicas)
    ? [...new Set(pub.caracteristicas.map((c) => textoNormalizado(c)).filter((c): c is string => c !== undefined))].sort()
    : [];
  if (caracteristicas.length > 0) salida.caracteristicas = caracteristicas;

  const imagenes = Array.isArray(pub?.imagenes)
    ? pub.imagenes
        .map(canonizarImagen)
        // El orden de llegada NO es contenido: el feed se construye por (portada, orden),
        // así que la forma canónica usa ese mismo orden y dos payloads que sólo difieren
        // en cómo vinieron listados producen la misma huella.
        .sort((a, b) => {
          if (a.portada !== b.portada) return a.portada === true ? -1 : 1;
          if (a.orden !== b.orden) return Number(a.orden) - Number(b.orden);
          return String(a.url).localeCompare(String(b.url));
        })
    : [];
  salida.imagenes = imagenes;

  const habitaciones = Array.isArray(pub?.habitacionesPublicables)
    ? pub.habitacionesPublicables.map(canonizarHabitacion).sort((a, b) => String(a.habitacionId).localeCompare(String(b.habitacionId)))
    : [];
  if (habitaciones.length > 0) salida.habitacionesPublicables = habitaciones;

  return salida;
}

function canonizarValorPlano(valor: unknown): Record<string, unknown> {
  if (!esObjeto(valor)) return { valor: valor as unknown };
  const salida: Record<string, unknown> = {};
  for (const clave of Object.keys(valor)) {
    if ((CLAVES_NO_CONTENIDO_IMAGEN as readonly string[]).includes(clave)) continue;
    const interno = valor[clave];
    if (typeof interno === 'string') {
      const texto = textoNormalizado(interno);
      if (texto !== undefined) salida[clave] = texto;
      continue;
    }
    if (interno === undefined || interno === null || interno === '') continue;
    salida[clave] = interno;
  }
  return salida;
}

/** Representación canónica como texto: la entrada del hash. Estable por construcción. */
export function representacionCanonica(pub: PublicacionInmueble): string {
  return jsonDeterminista(formaCanonicaPublicable(pub));
}

/** Huella fuerte del contenido publicable (SHA-256 en minúsculas para uso interno). */
export function hashDeContenidoPublicable(pub: PublicacionInmueble): string {
  return sha256Hex(representacionCanonica(pub)).toLowerCase();
}

/** Huella corta reutilizando el contrato ya existente (`hashEstable`). */
export function huellaCortaDeContenido(pub: PublicacionInmueble): string {
  return hashEstable(representacionCanonica(pub));
}

/**
 * Versión publicable. `anterior` es la única fuente del contador: sin reloj y sin
 * azar ⇒ la misma pareja (anterior, nuevo) siempre da la misma versión.
 */
export function calcularVersionPublicable(pub: PublicacionInmueble, anterior?: VersionPublicable): VersionPublicable {
  const canonica = representacionCanonica(pub);
  const hashContenido = sha256Hex(canonica).toLowerCase();
  const cambio = !anterior || anterior.hashContenido !== hashContenido;
  const numero = !anterior ? 1 : cambio ? anterior.numero + 1 : anterior.numero;
  return {
    numero,
    etiqueta: `v${numero}·${hashEstable(canonica)}`,
    hashContenido,
    hashCorto: hashEstable(canonica),
    longitudCanonica: canonica.length,
  };
}

/** ¿Mismo contenido publicable? (comparación por huella, no por referencia de objeto). */
export function contenidoPublicableIdentico(a: PublicacionInmueble, b: PublicacionInmueble): boolean {
  return hashDeContenidoPublicable(a) === hashDeContenidoPublicable(b);
}

/** Comparación directa de dos versiones ya calculadas. */
export function versionesIguales(a?: VersionPublicable, b?: VersionPublicable): boolean {
  if (!a || !b) return false;
  return a.hashContenido === b.hashContenido;
}

/**
 * Lista de campos públicos que cambiaron (diagnóstico para adaptadores y logs).
 * Se calcula sobre la forma canónica: no informa cambios de metadato.
 */
export function camposQueCambiaron(anterior: PublicacionInmueble, nueva: PublicacionInmueble): string[] {
  const a = formaCanonicaPublicable(anterior);
  const b = formaCanonicaPublicable(nueva);
  const claves = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const cambian: string[] = [];
  for (const clave of claves) {
    if (JSON.stringify(a[clave] ?? null) !== JSON.stringify(b[clave] ?? null)) cambian.push(clave);
  }
  return cambian;
}

/**
 * Identidad ESTABLE del inmueble: deliberadamente derivada sólo del identificador,
 * nunca del contenido ⇒ cambiar el contenido no crea un inmueble nuevo.
 * Reutiliza las dos funciones del motor existente.
 */
export function identidadEstableInmueble(inmueble: Inmueble): { idPublico: string; referenciaInterna: string } {
  return {
    idPublico: generarIdPublicoInmueble(inmueble.id),
    referenciaInterna: referenciaInternaInmueble(inmueble),
  };
}

/** Identidad por portal (externalId idempotente) reutilizando el motor existente. */
export function identidadEnPortal(inmuebleId: string, portal: PortalInmobiliario): { clave: string; externalId: string } {
  return identidadPublicacionPortal(inmuebleId, portal);
}
