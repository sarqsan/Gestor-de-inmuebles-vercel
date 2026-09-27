/**
 * B — Resolución pura de tokens públicos desde la URL.
 * ---------------------------------------------------------------------------
 * Recupera el delta útil de Arena C (`App.tsx / checkUrlForTokens`, commit
 * a6ac280): limpiar el token local cuando deja de estar presente en la URL,
 * para las cuatro superficies públicas heredadas (visitas, solicitudes,
 * documentación y cuestionarios).
 *
 * ADAPTACIÓN a main (no es copia del efecto de C):
 *  · Función pura y probada en aislamiento; `App.tsx` la invoca dentro de su
 *    propio `checkUrlForTokens` (montaje + `hashchange`, sin router nuevo).
 *  · Precedencia observable de C: segmento de path, después hash y después
 *    query (C sobrescribe el valor de query cuando el path contiene el
 *    marcador). Se conserva para no cambiar el comportamiento heredado.
 *  · Saneado añadido: el segmento tomado del path/hash se recorta en el
 *    primer `?`, `#`, `&` o `/` y se ignora si queda vacío. C tomaba el resto
 *    crudo (`split(...)[1]`), de modo que `/visita/abc?x=1` producía un token
 *    `abc?x=1` que nunca igualaba al token real.
 *  · Alcance estricto a las 4 superficies heredadas. Las rutas públicas
 *    nuevas de main (`?registro`, `?registroInq`, `?registroProp`, `/registro/`)
 *    NO se resuelven aquí y su cableado en `App.tsx` sigue siendo set-only.
 *
 * Contrato garantizado (ver tests/tokens-publicos.test.ts):
 *  · token válido presente → se devuelve (se conserva en el estado);
 *  · token ausente → `null` (el llamante limpia el estado);
 *  · cambiar de superficie (p. ej. `?visita=A` → `?solicitud=B`) devuelve
 *    `null` para la superficie abandonada: no se conserva un token
 *    incompatible entre superficies.
 */

export interface UbicacionParaTokens {
  readonly pathname: string;
  readonly hash: string;
  readonly search: string;
}

export interface TokensPublicosResueltos {
  readonly visita: string | null;
  readonly solicitud: string | null;
  readonly documentacion: string | null;
  readonly cuestionario: string | null;
}

interface SuperficiePublica {
  readonly segmento: string;
  readonly parametros: readonly string[];
}

const SUPERFICIES: Record<keyof TokensPublicosResueltos, SuperficiePublica> = {
  visita: { segmento: 'visita', parametros: ['visita', 'visitaToken'] },
  solicitud: { segmento: 'solicitud', parametros: ['solicitud', 'solicitudToken'] },
  documentacion: { segmento: 'documentacion', parametros: ['documentacion', 'docToken', 'doc'] },
  cuestionario: { segmento: 'cuestionario', parametros: ['cuestionario', 'cuestionarioToken'] },
};

/** Recorta restos de ruta/query/hash y normaliza vacío → null. */
function limpiarSegmento(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const recortado = valor.split(/[?#&/]/, 1)[0].trim();
  return recortado === '' ? null : recortado;
}

function extraerToken(ubicacion: UbicacionParaTokens, superficie: SuperficiePublica): string | null {
  // 1. Segmento de path (precedencia de C: sobrescribe a query/hash).
  const marcadorPath = `/${superficie.segmento}/`;
  if (ubicacion.pathname.includes(marcadorPath)) {
    const porPath = limpiarSegmento(ubicacion.pathname.split(marcadorPath)[1]);
    if (porPath) return porPath;
  }
  // 2. Hash (C comprueba `${segmento}/` sin barra inicial).
  const marcadorHash = `${superficie.segmento}/`;
  if (ubicacion.hash.includes(marcadorHash)) {
    const porHash = limpiarSegmento(ubicacion.hash.split(marcadorHash)[1]);
    if (porHash) return porHash;
  }
  // 3. Query params (alias históricos incluidos).
  const params = new URLSearchParams(ubicacion.search);
  for (const nombre of superficie.parametros) {
    const porQuery = limpiarSegmento(params.get(nombre));
    if (porQuery) return porQuery;
  }
  return null;
}

/** Resuelve los 4 tokens públicos heredados desde una ubicación tipo `window.location`. */
export function resolverTokensPublicos(ubicacion: UbicacionParaTokens): TokensPublicosResueltos {
  return {
    visita: extraerToken(ubicacion, SUPERFICIES.visita),
    solicitud: extraerToken(ubicacion, SUPERFICIES.solicitud),
    documentacion: extraerToken(ubicacion, SUPERFICIES.documentacion),
    cuestionario: extraerToken(ubicacion, SUPERFICIES.cuestionario),
  };
}

/** Conveniencia para tests: resuelve desde una URL completa o un path con query/hash. */
export function resolverTokensPublicosDesdeUrl(url: string): TokensPublicosResueltos {
  const parsed = new URL(url, 'http://localhost');
  return resolverTokensPublicos({ pathname: parsed.pathname, hash: parsed.hash, search: parsed.search });
}
