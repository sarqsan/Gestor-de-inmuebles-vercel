/**
 * IA · FASE 9 — CIFRADO EN REPOSO DE LAS LLAVES DE USUARIO
 * =========================================================
 * AES-256-GCM con una clave maestra que vive SOLO en el entorno del servidor
 * (`IA_LLAVES_CLAVE_MAESTRA`, 32 bytes en base64). Cada cifrado usa un IV
 * aleatorio de 12 bytes y lleva como datos autenticados adicionales (AAD) el
 * uid del propietario: un criptograma copiado al documento de otro usuario NO
 * descifra. La huella es un HMAC-SHA256 con la misma clave maestra (no un hash
 * plano): permite detectar que se vuelve a registrar la misma llave sin que el
 * almacén sea un oráculo de llaves.
 *
 * Fallo cerrado: una clave maestra mal formada se informa como
 * `CLAVE_MAESTRA_INVALIDA` y el núcleo bloquea las operaciones; nunca se
 * «repara» ni se deriva de otro secreto.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES } from '../../src/ia/llavesUsuarioContrato.js';

export const ALGORITMO_CIFRADO_LLAVES = 'AES-256-GCM' as const;
export const BYTES_CLAVE_MAESTRA = 32;
const BYTES_IV = 12;
const BYTES_ETIQUETA = 16;

export interface LlaveCifrada {
  algoritmo: typeof ALGORITMO_CIFRADO_LLAVES;
  iv: string;
  etiqueta: string;
  datos: string;
}

export type ResolucionClaveMaestra =
  | { estado: 'VALIDA'; clave: Buffer }
  | { estado: 'AUSENTE' }
  | { estado: 'INVALIDA'; error: string };

/** Lee y valida la clave maestra del entorno. Nunca la imprime. */
export function resolverClaveMaestraLlaves(entorno: NodeJS.ProcessEnv = process.env): ResolucionClaveMaestra {
  const crudo = entorno[VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES];
  if (crudo === undefined || crudo.trim() === '') return { estado: 'AUSENTE' };
  const texto = crudo.trim();
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(texto)) {
    return { estado: 'INVALIDA', error: `${VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES}: debe ser base64 (estándar o URL) de ${BYTES_CLAVE_MAESTRA} bytes` };
  }
  const clave = Buffer.from(texto.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (clave.length !== BYTES_CLAVE_MAESTRA) {
    return { estado: 'INVALIDA', error: `${VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES}: se esperaban ${BYTES_CLAVE_MAESTRA} bytes y hay ${clave.length}` };
  }
  return { estado: 'VALIDA', clave };
}

/** Genera una clave maestra nueva (base64 estándar) para el script del operador. */
export function generarClaveMaestraLlaves(): string {
  return randomBytes(BYTES_CLAVE_MAESTRA).toString('base64');
}

export function cifrarLlaveUsuario(valor: string, claveMaestra: Buffer, uid: string): LlaveCifrada {
  if (claveMaestra.length !== BYTES_CLAVE_MAESTRA) throw new Error('Clave maestra de longitud incorrecta.');
  const iv = randomBytes(BYTES_IV);
  const cifrador = createCipheriv('aes-256-gcm', claveMaestra, iv);
  cifrador.setAAD(Buffer.from(uid, 'utf8'));
  const datos = Buffer.concat([cifrador.update(valor, 'utf8'), cifrador.final()]);
  const etiqueta = cifrador.getAuthTag();
  return { algoritmo: ALGORITMO_CIFRADO_LLAVES, iv: iv.toString('base64'), etiqueta: etiqueta.toString('base64'), datos: datos.toString('base64') };
}

/** Devuelve `null` si el criptograma está corrupto, es de otro uid o de otra clave maestra. */
export function descifrarLlaveUsuario(cifrado: LlaveCifrada, claveMaestra: Buffer, uid: string): string | null {
  try {
    if (cifrado.algoritmo !== ALGORITMO_CIFRADO_LLAVES) return null;
    const iv = Buffer.from(cifrado.iv, 'base64');
    const etiqueta = Buffer.from(cifrado.etiqueta, 'base64');
    if (iv.length !== BYTES_IV || etiqueta.length !== BYTES_ETIQUETA) return null;
    const descifrador = createDecipheriv('aes-256-gcm', claveMaestra, iv);
    descifrador.setAAD(Buffer.from(uid, 'utf8'));
    descifrador.setAuthTag(etiqueta);
    const texto = Buffer.concat([descifrador.update(Buffer.from(cifrado.datos, 'base64')), descifrador.final()]);
    return texto.toString('utf8');
  } catch {
    return null;
  }
}

/** Huella no reversible (HMAC con la clave maestra) para detectar re-registro de la misma llave. */
export function huellaLlaveUsuario(valor: string, claveMaestra: Buffer): string {
  return createHmac('sha256', claveMaestra).update(valor, 'utf8').digest('hex');
}

export function mismaHuella(a: string | undefined | null, b: string): boolean {
  if (typeof a !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Reconstruye el criptograma desde el almacén, defensivamente (`null` si no tiene la forma esperada). */
export function llaveCifradaDesdeDatos(datos: unknown): LlaveCifrada | null {
  if (!datos || typeof datos !== 'object') return null;
  const d = datos as Record<string, unknown>;
  if (d.algoritmo !== ALGORITMO_CIFRADO_LLAVES) return null;
  if (typeof d.iv !== 'string' || typeof d.etiqueta !== 'string' || typeof d.datos !== 'string') return null;
  return { algoritmo: ALGORITMO_CIFRADO_LLAVES, iv: d.iv, etiqueta: d.etiqueta, datos: d.datos };
}
