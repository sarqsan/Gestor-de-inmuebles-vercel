import type { IncomingMessage, ServerResponse } from 'http';
import app from '../server';

/**
 * Punto de entrada serverless para Vercel.
 *
 * Todas las rutas `/api/*` definidas en server.ts (Express) se canalizan
 * hacia esta única función mediante el rewrite de vercel.json.
 *
 * Una instancia de Express es por sí misma un manejador `(req, res) => void`,
 * así que basta con invocarla con la petición y respuesta del runtime.
 */
export default function vercelApiHandler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
