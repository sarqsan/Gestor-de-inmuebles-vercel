/**
 * FASE 4 · B0-B3 — Hash determinista (sha256) para loteId y claves de contenido.
 * FASE 6 · B6 — extendido para aceptar bytes (hash documental de binarios).
 *
 * USO EXCLUSIVO Node (CLI `scripts/`, tests vitest): importa 'node:crypto'.
 * NO importar desde el bundle de navegador: cuando la UI necesite hashing se
 * añadirá un adaptador WebCrypto (decisión de bloques posteriores, no de B0-B3).
 *
 * Esta capa no escribe en Firestore ni en Storage.
 */
import { createHash } from 'node:crypto';

export function sha256Hex(input: string | Uint8Array): string {
  const h = createHash('sha256');
  if (typeof input === 'string') h.update(input, 'utf8');
  else h.update(input);
  return h.digest('hex');
}
