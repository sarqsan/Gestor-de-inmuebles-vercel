/**
 * F3 — MANEJADOR HTTP `POST /api/titulares/buscar`
 * =================================================
 * Capa fina sobre `buscarTitulares`: traduce la petición HTTP a la entrada del
 * servicio y el resultado del servicio a códigos de estado REALES (no siempre
 * 200 con un cuerpo de error).
 *
 * Contrato:
 *   Cabecera: `Authorization: Bearer <ID token de Firebase>`
 *   Cuerpo:   `{ "inmuebleId": "...", "termino": "..." }`
 *   Respuestas:
 *     200 → `{ ok: true, resultados: [{ id, nombre }] }`   (máx. 10)
 *     400 → término menor de 3 caracteres o petición inválida
 *     401 → sin token, token inválido o sesión no verificable
 *     403 → el llamador no puede gestionar ese inmueble
 *     503 → el servidor no tiene credencial de servicio configurada
 *     500 → error interno (sin detalle técnico al cliente)
 *
 * Las dependencias son inyectables para poder probar los códigos reales.
 */
import type { Request, Response } from 'express';
import { buscarTitulares } from './backendTitulares';
import type { DependenciasBackendTitulares } from './backendTitulares';

function tokenDe(req: Request): string {
  const cabecera = req.headers?.authorization;
  if (typeof cabecera !== 'string') return '';
  return cabecera.replace(/^Bearer\s+/i, '').trim();
}

export function crearManejadorBuscarTitulares(deps: DependenciasBackendTitulares = {}) {
  return async function manejador(req: Request, res: Response): Promise<void> {
    const cuerpo = (req.body ?? {}) as { inmuebleId?: unknown; termino?: unknown };
    const entrada = {
      idToken: tokenDe(req),
      inmuebleId: typeof cuerpo.inmuebleId === 'string' ? cuerpo.inmuebleId : '',
      termino: typeof cuerpo.termino === 'string' ? cuerpo.termino : '',
    };

    const resultado = await buscarTitulares(entrada, deps);

    if (resultado.ok) {
      res.status(200).json({ ok: true, resultados: resultado.resultados ?? [] });
      return;
    }
    // Nunca se devuelven trazas ni mensajes internos: sólo motivo + detalle
    // accionable (el 503 explica qué variable de entorno falta).
    res.status(resultado.codigo).json({
      ok: false,
      error: resultado.motivo,
      detalle: resultado.detalle,
    });
  };
}
