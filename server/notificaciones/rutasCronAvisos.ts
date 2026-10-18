/**
 * FASE A — RELOJ DIARIO PROTEGIDO (`GET /api/cron/avisos`)
 * =======================================================
 * Endpoint que dispara el barrido del reloj de avisos. Lo llama el **cron de
 * Vercel** (declarado en `vercel.json`), no un usuario:
 *
 *   · Exige `CRON_SECRET` en el servidor. Sin la variable **no se ejecuta nada**
 *     (503 `cron_no_configurado`): fallo cerrado, nunca un barrido anónimo.
 *   · Autorización exclusivamente por `Authorization: Bearer <CRON_SECRET>`
 *     (lo que envía Vercel Cron). No se acepta el secreto en query string, para
 *     evitar filtrarlo en logs, historial o cabeceras Referer. Comparación en
 *     tiempo constante.
 *   · Idempotente: el motor usa claves de idempotencia deterministas, así que
 *     repetir la llamada el mismo día no duplica avisos ni reenvía correos.
 *   · El resultado es un resumen trazable (procesadas, emitidas, fallidas,
 *     truncamiento de consultas y errores) que nunca afirma una entrega que no
 *     haya ocurrido.
 */
import { timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares.js';
import type { ResumenRelojAvisos } from './relojAvisos.js';

export const RUTA_CRON_AVISOS = '/api/cron/avisos';

export interface DependenciasCronAvisos {
  /** Secreto del cron (`CRON_SECRET`). `null` ⇒ 503 y no se ejecuta. */
  secreto: string | null;
  /** Barrido real. `null` ⇒ 503 (sin credencial de servicio no hay lectura/escritura duradera). */
  ejecutar: ((origen: string) => Promise<ResumenRelojAvisos>) | null;
  /** Motivo de que el reloj no esté disponible (sin secretos). */
  motivoNoDisponible?: string;
}

function igualesEnTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function montarRutaCronAvisos(app: Express, deps: DependenciasCronAvisos): void {
  app.get(RUTA_CRON_AVISOS, async (req, res) => {
    try {
      const secreto = deps.secreto?.trim() || '';
      if (!secreto) {
        res.status(503).json({
          ok: false,
          error: 'cron_no_configurado',
          motivoDenegacion: 'Falta CRON_SECRET en el entorno del servidor: el reloj no se ejecuta (fallo cerrado).',
        });
        return;
      }
      if (!deps.ejecutar) {
        res.status(503).json({
          ok: false,
          error: 'reloj_no_disponible',
          motivoDenegacion: deps.motivoNoDisponible || 'El reloj necesita la credencial de servicio de Firestore.',
        });
        return;
      }

      const authorization = req.headers?.authorization;
      const presentado = typeof authorization === 'string' && /^Bearer\s+/i.test(authorization) ? tokenDe(req) : '';
      if (!presentado || !igualesEnTiempoConstante(presentado, secreto)) {
        res.status(401).json({ ok: false, error: 'no_autorizado', motivoDenegacion: 'Secreto de cron ausente o inválido.' });
        return;
      }

      const resumen = await deps.ejecutar('CRON');
      res.status(200).json({
        ok: true,
        ...resumen,
        entregadas: resumen.emitidos.filter((e) => e.entregada).length,
        duplicadas: resumen.emitidos.filter((e) => e.duplicada).length,
        fallidas: resumen.emitidos.filter((e) => !e.entregada && !e.duplicada).length,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: 'error_reloj',
        motivoDenegacion: err instanceof Error ? err.message : 'Error inesperado en el reloj de avisos.',
      });
    }
  });
}
