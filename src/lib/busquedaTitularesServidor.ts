/**
 * BÚSQUEDA DE TITULARES EN SERVIDOR (F3) — CLIENTE
 * ================================================
 * El cliente NO tiene credenciales ni lista propietarios por su cuenta: pide la
 * búsqueda al endpoint `/api/titulares/buscar` con el token del usuario, y el
 * servidor devuelve SÓLO `{ id, nombre }` (lista blanca: sin NIF, sin email, sin
 * IBAN, sin datos fiscales).
 *
 * Vive aquí, y no dentro de una pantalla, para que el Portal del Propietario y
 * la edición de inmuebles usen EXACTAMENTE el mismo contrato (URL, token,
 * errores) sin duplicarlo.
 */
import type { CandidatoTitular } from '../types';

/** Token del usuario para el endpoint de servidor. `null` si no hay sesión. */
export async function tokenUsuarioActual(): Promise<string | null> {
  try {
    const { auth } = await import('./firebase');
    return (await auth.currentUser?.getIdToken()) || null;
  } catch {
    return null;
  }
}

/**
 * Busca titulares en el servidor. Lanza un Error con `detalle` legible cuando
 * el endpoint responde con error (la UI muestra ese detalle tal cual).
 */
export async function buscarTitularesEnServidor(
  inmuebleId: string,
  termino: string,
): Promise<CandidatoTitular[]> {
  const token = await tokenUsuarioActual();
  const respuesta = await fetch('/api/titulares/buscar', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ inmuebleId, termino }),
  });
  const datos = (await respuesta.json().catch(() => ({}))) as {
    ok?: boolean;
    resultados?: CandidatoTitular[];
    detalle?: string;
    error?: string;
  };
  if (!respuesta.ok) {
    const mensaje = datos?.detalle || 'No se ha podido realizar la búsqueda de titulares.';
    const error = new Error(mensaje) as Error & { detalle?: string; codigoHttp?: number };
    error.detalle = mensaje;
    error.codigoHttp = respuesta.status;
    throw error;
  }
  return datos?.resultados || [];
}
