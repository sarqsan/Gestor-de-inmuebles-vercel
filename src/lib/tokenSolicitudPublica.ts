/**
 * H-06 — Token de capacidad del enlace público de solicitud.
 * ===========================================================================
 * PROBLEMA CERRADO AQUÍ
 * El enlace que se manda a un candidato era `sol-<idInmueble>`, y en su forma
 * más pobre, directamente el id del inmueble. Un id de inmueble es ENUMERABLE:
 * quien lo adivine o lo deduzca obtiene una capacidad válida para dar de alta
 * solicitudes y candidatos en la cartera de ESE inmueble, sin haber recibido
 * ningún enlace. No hace falta adivinar una contraseña: basta con saber que
 * existe `inm-3`.
 *
 * DISEÑO
 * El token pasa a ser `sol-<idInmueble>-t<32 hex>`:
 *
 *   · los 32 caracteres hex son **128 bits aleatorios** (`crypto.getRandomValues`),
 *     así que no se pueden adivinar ni derivar del id;
 *   · el id del inmueble se mantiene a la vista A PROPÓSITO: la ficha pública
 *     (`fichas_publicas_inmueble`) es legible por id para cualquiera por diseño
 *     (`allow get: if true`), así que ocultarlo no protegería nada y permitiría
 *     al navegador resolver la ficha sin pedir permiso al servidor;
 *   · lo que el secreto protege es la CAPACIDAD DE ESCRITURA: el servidor
 *     contrasta el token con `inmuebles/<id>.tokenSolicitud` (documento privado,
 *     solo accesible con credencial de servicio) antes de crear nada.
 *
 * COMPATIBILIDAD DECLARADA
 * Los enlaces `sol-<id>` ya enviados a inquilinos siguen funcionando hasta
 * `FECHA_CORTE_ENLACES_LEGADOS`. Después de esa fecha, el servidor responde 404
 * con código `ENLACE_CADUCADO`: la ventana está en el código y en las pruebas,
 * no en un comentario que nadie relee.
 *
 * POR QUÉ EL SEPARADOR ES `-t`
 * Los ids de inmueble admiten guiones (`isValidId` solo exige cadena no vacía),
 * así que partir por el último `-` sería ambiguo. Un sufijo `-t` seguido de
 * exactamente 32 hex no puede confundirse con un id razonable; y si alguien
 * construyera un id así, el contraste con `tokenSolicitud` fallaría y la
 * petición se cerraría (tolerante a fallos en el lado seguro).
 */

/** Prefijo histórico de los enlaces de solicitud. */
export const PREFIJO_TOKEN_SOLICITUD = 'sol-';

/** Bytes de entropía del secreto: 16 = 128 bits. */
export const BYTES_SECRETO = 16;

/** Longitud en hex del secreto (2 caracteres por byte). */
export const LONGITUD_SECRETO = BYTES_SECRETO * 2;

/**
 * Último instante en que se acepta un enlace heredado `sol-<id>`.
 * Fecha deliberadamente holgada: da margen a los enlaces ya enviados a
 * candidatos (una campaña de alquiler dura semanas, no días) sin dejar la
 * compatibilidad abierta para siempre.
 */
export const FECHA_CORTE_ENLACES_LEGADOS = '2027-01-31T23:59:59.000Z';

const PATRON_SECRETO = new RegExp(`^[0-9a-f]{${LONGITUD_SECRETO}}$`);
const PATRON_FIRMADO = new RegExp(`^sol-(.+)-t([0-9a-f]{${LONGITUD_SECRETO}})$`);

export type TokenSolicitudAnalizado =
  | { formato: 'firmado'; inmuebleId: string; secreto: string; token: string }
  | { formato: 'legado'; inmuebleId: string; token: string };

/** Verificación de un token contra la propiedad. Cerrado por defecto. */
export type ResultadoVerificacionToken =
  | 'OK'
  | 'TOKEN_NO_COINCIDE'
  | 'LEGADO_CADUCADO'
  | 'PROPIEDAD_NO_DISPONIBLE';

/**
 * Genera un secreto de 128 bits en hexadecimal.
 * Usa `globalThis.crypto` (navegador y Node ≥ 19); nunca `Math.random`.
 */
export function generarSecreto(aleatorio?: (bytes: Uint8Array) => void): string {
  const bytes = new Uint8Array(BYTES_SECRETO);
  if (aleatorio) {
    aleatorio(bytes);
  } else {
    const cripto = globalThis.crypto;
    if (!cripto || typeof cripto.getRandomValues !== 'function') {
      throw new Error('H-06: no hay fuente criptográfica disponible para emitir el token de solicitud');
    }
    cripto.getRandomValues(bytes);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** `sol-<idInmueble>-t<secreto>`; el secreto se puede inyectar en pruebas. */
export function generarTokenSolicitud(inmuebleId: string, secreto?: string): string {
  const id = String(inmuebleId || '').trim();
  if (!id) throw new Error('H-06: no se puede emitir un token de solicitud sin inmueble');
  const valor = secreto ?? generarSecreto();
  if (!PATRON_SECRETO.test(valor)) {
    throw new Error('H-06: el secreto debe ser hexadecimal de 32 caracteres (128 bits)');
  }
  return `${PREFIJO_TOKEN_SOLICITUD}${id}-t${valor}`;
}

/**
 * Interpreta un token de enlace. Devuelve `null` solo si está vacío: un token
 * con forma desconocida se trata como heredado y será el servidor quien lo
 * rechace (nunca se acepta por parecerse).
 */
export function analizarTokenSolicitud(token: string): TokenSolicitudAnalizado | null {
  const limpio = String(token || '').trim();
  if (!limpio) return null;
  const firmado = PATRON_FIRMADO.exec(limpio);
  if (firmado) {
    return { formato: 'firmado', inmuebleId: firmado[1], secreto: firmado[2], token: limpio };
  }
  const sinPrefijo = limpio.startsWith(PREFIJO_TOKEN_SOLICITUD)
    ? limpio.slice(PREFIJO_TOKEN_SOLICITUD.length)
    : limpio;
  if (!sinPrefijo) return null;
  return { formato: 'legado', inmuebleId: sinPrefijo, token: limpio };
}

/**
 * Ids de ficha pública que puede resolver un token, en orden.
 * Con token firmado, el id del inmueble (la ficha es pública por id). Con
 * enlace heredado se conservan las dos formas históricas para no romper
 * `/#solicitud/<id>`.
 */
export function idsFichaCandidatos(token: string): string[] {
  const limpio = String(token || '').trim();
  if (!limpio) return [];
  const analizado = analizarTokenSolicitud(limpio);
  // Forma irreconocible (p. ej. el prefijo suelto): se prueba el literal tal
  // cual, como siempre. La lectura de ficha pública no autoriza nada por sí
  // sola; la capacidad la decide el servidor al escribir.
  if (!analizado) return [limpio];
  if (analizado.formato === 'firmado') return [analizado.inmuebleId];
  const ids = [analizado.token];
  if (analizado.inmuebleId !== analizado.token) ids.push(analizado.inmuebleId);
  return ids;
}

/** ¿Sigue vigente la ventana de compatibilidad con enlaces heredados? */
export function enlaceLegadoVigente(
  ahoraIso: string,
  corte: string = FECHA_CORTE_ENLACES_LEGADOS
): boolean {
  const ahora = Date.parse(ahoraIso);
  const limite = Date.parse(corte);
  if (!Number.isFinite(ahora) || !Number.isFinite(limite)) return false;
  return ahora <= limite;
}

/**
 * Contraste del token con la propiedad almacenada (`inmuebles/<id>.tokenSolicitud`).
 * Puro: el servidor solo aporta el documento leído y la hora.
 *
 * Reglas:
 *  · con token emitido, SOLO vale ese token exacto (ni el id, ni otro secreto);
 *  · sin token emitido (propiedad antigua), vale el enlace heredado mientras
 *    dure la ventana; después, cerrado;
 *  · sin propiedad legible no hay capacidad (cierre por defecto).
 */
export function verificarTokenContraPropiedad(
  token: string,
  propiedad: { tokenSolicitud?: unknown } | null,
  ahoraIso: string,
  corte: string = FECHA_CORTE_ENLACES_LEGADOS
): ResultadoVerificacionToken {
  const analizado = analizarTokenSolicitud(token);
  if (!analizado || !propiedad) return 'PROPIEDAD_NO_DISPONIBLE';
  const guardado = typeof propiedad.tokenSolicitud === 'string' ? propiedad.tokenSolicitud.trim() : '';
  if (guardado !== '') {
    if (analizado.formato === 'firmado' && analizado.token === guardado) return 'OK';
    return 'TOKEN_NO_COINCIDE';
  }
  if (analizado.formato === 'firmado') return 'TOKEN_NO_COINCIDE';
  return enlaceLegadoVigente(ahoraIso, corte) ? 'OK' : 'LEGADO_CADUCADO';
}

/**
 * Devuelve el inmueble con `tokenSolicitud` garantizado.
 * Punto único de emisión: si la propiedad ya tiene uno válido, se respeta (un
 * reenlace no puede invalidar los enlaces ya enviados).
 */
export function asegurarTokenSolicitud<T extends { id: string; tokenSolicitud?: string }>(inmueble: T): T {
  const actual = typeof inmueble.tokenSolicitud === 'string' ? inmueble.tokenSolicitud.trim() : '';
  if (PATRON_FIRMADO.test(actual)) return inmueble;
  return { ...inmueble, tokenSolicitud: generarTokenSolicitud(inmueble.id) };
}

/**
 * Token que debe viajar en el enlace `/#solicitud/<token>`.
 *
 * Punto único donde se decide: si el inmueble tiene token firmado, ese; si no,
 * el heredado `sol-<id>`, que el servidor acepta solo hasta
 * `FECHA_CORTE_ENLACES_LEGADOS`. Nadie debe reconstruir ese literal por su
 * cuenta: `tests/guardia-h06-enlace-token.test.ts` lo impide.
 */
export function tokenEnlaceParaMostrar(inmueble: { id: string; tokenSolicitud?: string }): string {
  const actual = typeof inmueble.tokenSolicitud === 'string' ? inmueble.tokenSolicitud.trim() : '';
  if (PATRON_FIRMADO.test(actual)) return actual;
  return `${PREFIJO_TOKEN_SOLICITUD}${inmueble.id}`;
}

/** `true` si el token ya tiene el formato nuevo (para diagnósticos y pruebas). */
export function esTokenFirmado(token: string): boolean {
  return PATRON_FIRMADO.test(String(token || '').trim());
}
