/**
 * MODELO DEL TITULAR (Persona / Propietario) — REGLAS PURAS
 * ==========================================================
 * CUENTA DE ACCESO ≠ PROPIETARIO/TITULAR ≠ GESTOR.
 *
 * La entidad Titular es **una sola** y completa: `propietarios/{id}` (interfaz
 * `Propietario`). No existe «titular básico» ni «segundo propietario» como
 * entidad aparte: la relación con un inmueble vive en la titularidad
 * (`titularidades/{inmuebleId}__{propietarioId}` + índice `titularesIds`).
 *
 * Este módulo es PURO (sin Firebase ni React) y contiene lo que necesitan la
 * sección «Propietarios / Titulares» y el alta/edición de inmuebles:
 *
 *  · `normalizarNif` + `titularDuplicado`: una persona no se duplica por
 *    NIF/CIF/NIE (la ficha existente se abre en vez de crear otra);
 *  · `esFichaCompleta`: la ficha nace lista para asignarse a un inmueble;
 *  · `resumenTitular`: lo que se muestra en las listas y en el alta;
 *  · `porcentajeDesdeTexto`: NUNCA inventa (vacío = PENDIENTE = `null`);
 *  · ÁMBITO DEL PROPIETARIO: un PROPIETARIO crea y mantiene TANTAS fichas de titular
 *    como necesite. No hay contador ni tope en ninguna función de este módulo: lo único
 *    que acota es la AUTORIZACIÓN (`ambitoPropietarioId` == su `propietarioId`), la misma
 *    frontera que aplican las Firestore Rules. Ver `generarIdTitularAmbito`,
 *    `fichaEnAmbito` y `fichasVisiblesDelPropietario`.
 *
 * Los datos fiscales son del TITULAR y no se copian de unos titulares a otros:
 * este módulo sólo los LEE para presentación.
 */
import type { Propietario, TipoPropietario, UsuarioApp } from '../types';

/** Etiqueta legible del régimen del titular (misma nomenclatura en toda la app). */
export const ETIQUETA_TIPO_PROPIETARIO: Record<TipoPropietario, string> = {
  persona_fisica: 'Persona física',
  persona_juridica: 'Sociedad / Persona jurídica',
  comunidad_bienes: 'Comunidad de bienes',
};

/** NIF/CIF/NIE normalizado para comparar (mayúsculas, sin espacios ni separadores). */
export function normalizarNif(valor: string | null | undefined): string {
  return (valor || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/**
 * ¿Existe ya una ficha con este NIF/CIF/NIE? Devuelve la ficha existente para
 * poder ABRIRLA en vez de crear una persona duplicada.
 *
 *  · sin NIF no se puede deduplicar (devuelve `undefined`: no se bloquea);
 *  · `idExcluido` permite editar una ficha sin que se detecte a sí misma.
 */
export function titularDuplicado(
  titulares: readonly Propietario[],
  entrada: { nifCif: string; idExcluido?: string },
): Propietario | undefined {
  const nif = normalizarNif(entrada.nifCif);
  if (!nif) return undefined;
  return (titulares || []).find(
    (t) => t.id !== entrada.idExcluido && normalizarNif(t.nifCif) === nif,
  );
}

/**
 * ¿La ficha tiene los datos mínimos para poder asignarse a un inmueble?
 * (No es un «titular básico»: es la comprobación de que la ficha completa ya
 * se ha guardado con identificación; el resto de bloques son opcionales pero
 * están en el mismo formulario.)
 */
export function esFichaCompleta(titular: Pick<Propietario, 'id' | 'nombre' | 'nifCif'> | null | undefined): boolean {
  return !!titular && !!titular.id.trim() && !!titular.nombre.trim() && !!normalizarNif(titular.nifCif);
}

export interface ResumenTitular {
  id: string;
  nombre: string;
  nifCif: string;
  tipo: TipoPropietario;
  etiquetaTipo: string;
  /** Domicilio fiscal del titular (nunca el del inmueble). */
  domicilioFiscal: string;
  telefono: string;
  email: string;
  completa: boolean;
}

/** Resumen de presentación de un titular (listas, alta de inmueble, fichas). */
export function resumenTitular(titular: Propietario): ResumenTitular {
  const domicilio = [titular.direccion, titular.ciudad, titular.codigoPostal]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .join(', ');
  return {
    id: titular.id,
    nombre: (titular.nombre || '').trim(),
    nifCif: (titular.nifCif || '').trim(),
    tipo: titular.tipoPropietario,
    etiquetaTipo: ETIQUETA_TIPO_PROPIETARIO[titular.tipoPropietario] || ETIQUETA_TIPO_PROPIETARIO.persona_fisica,
    domicilioFiscal: domicilio,
    telefono: (titular.telefono || '').trim(),
    email: (titular.email || '').trim(),
    completa: esFichaCompleta(titular),
  };
}

/**
 * Porcentaje declarado a partir de un texto de formulario.
 *  · vacío o `null` → `null` = **PENDIENTE** (nunca 50/50, nunca 100);
 *  · número válido entre 0 y 100 → se conserva;
 *  · cualquier otra cosa (texto, negativo, >100) → `undefined` = el llamador
 *    debe rechazarlo y explicarlo (no se corrige ni se redondea a ciegas).
 */
export function porcentajeDesdeTexto(valor: string | number | null | undefined): number | null | undefined {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) return undefined;
    return valor;
  }
  const bruto = valor.trim().replace(',', '.');
  if (bruto === '') return null;
  if (!/^\d+(\.\d+)?$/.test(bruto)) return undefined;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

/**
 * Búsqueda LOCAL de titulares por nombre, NIF/CIF o contacto. Es la búsqueda de
 * los desplegables (el ámbito ya viene acotado por el host); la búsqueda de
 * SERVIDOR (F3) vive en `src/titularidades/busquedaTitulares.ts` y devuelve
 * sólo `{ id, nombre }` para quien no puede ver la ficha completa.
 */
export function filtrarTitularesLocales(
  titulares: readonly Propietario[],
  termino: string,
): Propietario[] {
  const q = (termino || '').trim().toLowerCase();
  if (!q) return [...titulares];
  const qNif = normalizarNif(q);
  return titulares.filter((t) => {
    const nombre = (t.nombre || '').toLowerCase();
    const ciudad = (t.ciudad || '').toLowerCase();
    const email = (t.email || '').toLowerCase();
    return (
      nombre.includes(q) ||
      ciudad.includes(q) ||
      email.includes(q) ||
      (!!qNif && normalizarNif(t.nifCif).includes(qNif))
    );
  });
}

/** Aviso exacto del alta cuando el titular buscado todavía no existe. */
export const MENSAJE_TITULAR_NO_EXISTE_SECCION =
  'Este titular todavía no existe. Créalo desde Propietarios/Titulares y después asígnalo a este inmueble.';

// ─────────────────────────────────────────────────────────────── ÁMBITO DEL PROPIETARIO

/**
 * Forma RESERVADA del id de una ficha de titular creada por un PROPIETARIO dentro de su
 * ámbito: `tit_` + token de minúsculas y dígitos. Espejo EXACTO de la regla
 * `idDeTitularDeAmbito` de `firestore.rules` (`^tit_[a-z0-9]{8,48}$`).
 *
 *  · Es disjunta de los ids de ficha de cuenta (`id == propietarioId`): la rama propia de
 *    las Rules la prohíbe, así que nadie puede adelantarse a ocupar la ficha propia de otro.
 *  · No contiene `__` (clave de titularidad `{inmuebleId}__{propietarioId}`), `~`, `/` ni `.`:
 *    se puede usar como `propietarioId` de una titularidad, de `titularesIds`, de una
 *    auditoría o de un campo sin escapar nada.
 */
export const PREFIJO_ID_TITULAR_AMBITO = 'tit_';
export const PATRON_ID_TITULAR_AMBITO = /^tit_[a-z0-9]{8,48}$/;

/** ¿El id tiene la forma reservada de las fichas de titular de ámbito? */
export function esIdDeTitularDeAmbito(id: string | null | undefined): boolean {
  return typeof id === 'string' && PATRON_ID_TITULAR_AMBITO.test(id);
}

const ALFABETO_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789';

function tokenAleatorio(longitud: number, aleatorio?: () => number): string {
  const salida: string[] = [];
  const rng = globalThis.crypto?.getRandomValues
    ? (() => {
        const buffer = new Uint32Array(longitud);
        globalThis.crypto.getRandomValues(buffer);
        let i = 0;
        return () => buffer[i++] / 0x1_0000_0000;
      })()
    : Math.random;
  const fuente = aleatorio ?? rng;
  for (let i = 0; i < longitud; i++) {
    const n = Math.floor(fuente() * ALFABETO_TOKEN.length);
    salida.push(ALFABETO_TOKEN[Math.min(Math.max(n, 0), ALFABETO_TOKEN.length - 1)]);
  }
  return salida.join('');
}

/**
 * Id nuevo para una ficha de titular de ámbito. Marca de tiempo en base 36 + token aleatorio:
 * único sin coordinar con el servidor, ordenable por alta y sin relación con ningún contador.
 * `existentes` solo evita repetir un id ya presente en la lista local; NO limita cuántas
 * fichas se pueden crear (cada llamada devuelve un id distinto, sin tope).
 */
export function generarIdTitularAmbito(opciones?: {
  existentes?: Iterable<string>;
  ahora?: () => number;
  aleatorio?: () => number;
}): string {
  const usados = new Set(opciones?.existentes ?? []);
  const ahora = opciones?.ahora ?? Date.now;
  let id = '';
  do {
    id = `${PREFIJO_ID_TITULAR_AMBITO}${ahora().toString(36)}${tokenAleatorio(6, opciones?.aleatorio)}`;
  } while (usados.has(id));
  return id;
}

/** ¿La ficha pertenece al ámbito del propietario (la creó o la mantiene dentro de su ámbito)? */
export function fichaEnAmbito(
  ficha: Pick<Propietario, 'ambitoPropietarioId'> | null | undefined,
  propietarioId: string | null | undefined,
): boolean {
  const pid = (propietarioId || '').trim();
  return !!ficha && !!pid && ficha.ambitoPropietarioId === pid;
}

/**
 * Fichas que ve un PROPIETARIO en «Propietarios / Titulares»: SU ficha (por id, o por su email,
 * igual que `scopedPropietarios`) más TODAS las fichas de titular de su ámbito, sin tope.
 *
 *  · La ficha propia va primero; el resto, por nombre.
 *  · Sin duplicados por id (la lista local y la escucha por ámbito pueden coincidir).
 *  · Robusta ante fichas sin `email` (las fichas de titular pueden no tenerlo).
 *  · NO incluye fichas ajenas: una ficha sin su ámbito ni su id nunca pasa este filtro.
 */
export function fichasVisiblesDelPropietario(
  fichas: readonly Propietario[],
  usuario: Pick<UsuarioApp, 'propietarioId' | 'email'> | null | undefined,
): Propietario[] {
  const pid = (usuario?.propietarioId || '').trim();
  const email = (usuario?.email || '').trim().toLowerCase();
  const propia = new Map<string, Propietario>();
  const ambito = new Map<string, Propietario>();
  for (const ficha of fichas || []) {
    if (!ficha || typeof ficha.id !== 'string' || !ficha.id) continue;
    const esPropia =
      (!!pid && ficha.id === pid) ||
      (!!email && typeof ficha.email === 'string' && ficha.email.trim().toLowerCase() === email);
    if (esPropia) propia.set(ficha.id, ficha);
    else if (fichaEnAmbito(ficha, pid)) ambito.set(ficha.id, ficha);
  }
  const propiasOrdenadas = [...propia.values()].sort((a, b) => Number(b.id === pid) - Number(a.id === pid));
  const delAmbito = [...ambito.values()].sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }),
  );
  return [...propiasOrdenadas, ...delAmbito];
}

/**
 * Mensaje visible cuando NO se pudo guardar una ficha. Dice QUÉ pasó y qué hacer SIN remitir a nadie
 * (la persona puede reintentar por sí misma) y SIN detalles técnicos del SDK (UX-2 §10). Por eso no
 * reutiliza el texto genérico del canal de incidencias, que para `permission-denied` termina en
 * «avisa a un administrador». Lo escrito en el formulario se conserva siempre.
 */
export function mensajeErrorGuardadoTitular(error: unknown): string {
  const codigo = (error as { code?: unknown } | null | undefined)?.code;
  switch (typeof codigo === 'string' ? codigo : '') {
    case 'permission-denied':
      return 'La base de datos ha rechazado el guardado de esta ficha (permisos). Tus datos siguen en el formulario: puedes volver a intentarlo.';
    case 'unavailable':
    case 'deadline-exceeded':
    case 'network-request-failed':
      return 'No hay conexión con el servidor de datos y la ficha no se ha guardado. Tus datos siguen en el formulario: inténtalo de nuevo en unos segundos.';
    case 'unauthenticated':
      return 'Tu sesión ya no es válida. Vuelve a iniciar sesión y repite el guardado.';
    default:
      return 'No se ha podido guardar la ficha. Tus datos siguen en el formulario: puedes volver a intentarlo.';
  }
}

/** Aviso de duplicado: se ofrece abrir la ficha existente, nunca crear otra. */
export function mensajeTitularDuplicado(nombre: string): string {
  return `Ya existe un titular con este NIF/CIF: ${nombre}. Abre su ficha para editarla; no se crea una ficha duplicada.`;
}
