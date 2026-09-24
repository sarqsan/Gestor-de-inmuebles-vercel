/**
 * CAPA TRANSVERSAL §6 — FASE 4 · Adaptador del proveedor Gemini (desacoplado).
 *
 * - `construirPromptAsistente(req)` y `parsearRespuestaModelo(texto)` son PUROS (se usan en el
 *   servidor y en tests, sin red).
 * - `crearProveedorGeminiRemoto()` es el proveedor de CLIENTE: llama a `POST /api/asistente/interpretar`
 *   (Express canónico, `server.ts`), que es quien tiene la clave `GEMINI_API_KEY` (única
 *   configuración Gemini del proyecto). El navegador nunca ve la clave ni habla con Gemini.
 * - El servidor NO recibe permisos ni ejecuta nada: recibe la petición ya filtrada
 *   (`AIIntentRequest` sin `requiredPermission`) y devuelve una `PropuestaIA` que el cliente
 *   valida deterministamente (`validarResolucionIA`). Aunque el modelo se equivoque, no puede
 *   ampliar capacidades.
 * - Sin proveedor real disponible (sin clave, sin red, error, timeout) el circuito cae a
 *   `proveedorLocal`. La validación real de Gemini queda pendiente fuera del sandbox.
 */
import type { AIIntentRequest, PropuestaIA, ProveedorIA } from './tipos';

export const RUTA_API_ASISTENTE = '/api/asistente/interpretar';

/** Cuerpo que viaja al servidor: solo lo necesario para interpretar (nunca códigos de permiso). */
export interface CuerpoInterpretar {
  input: string;
  host: string;
  module?: string;
  section?: string;
  role?: string;
  capabilities: Array<{ id: string; descripcion: string; module: string; tipo?: string; parametros?: string[]; keywords?: string[] }>;
  helpEntries: Array<{ id: string; title: string }>;
  tutorials: Array<{ id: string; title: string }>;
  routes: string[];
}

export function cuerpoDesdeRequest(req: AIIntentRequest): CuerpoInterpretar {
  return {
    input: req.input,
    host: req.host,
    module: req.module,
    section: req.section,
    role: req.role,
    capabilities: req.capabilities.map((c) => ({ id: c.id, descripcion: c.descripcion, module: c.module, tipo: c.tipo, parametros: c.parametros ? Object.keys(c.parametros) : undefined, keywords: c.keywords })),
    helpEntries: req.helpEntries,
    tutorials: req.tutorials,
    routes: req.routes,
  };
}

/** Prompt cerrado: el modelo solo puede elegir entre los ids listados. */
export function construirPromptAsistente(cuerpo: CuerpoInterpretar): string {
  const caps = cuerpo.capabilities.map((c) => `- ${c.id} [${c.tipo ?? 'CONSULTA'}] (${c.module}): ${c.descripcion}${c.parametros?.length ? ` · parámetros: ${c.parametros.join(', ')}` : ''}`).join('\n');
  const ayudas = cuerpo.helpEntries.map((e) => `- ${e.id}: ${e.title}`).join('\n') || '- (ninguna)';
  const tutos = cuerpo.tutorials.map((t) => `- ${t.id}: ${t.title}`).join('\n') || '- (ninguno)';
  return `Eres el asistente de un ERP de gestión de alquileres (aplicación: ${cuerpo.host === 'PORTAL_INQUILINO' ? 'Portal del Inquilino' : 'ERP de gestión'}).
Tu única tarea es clasificar la petición del usuario en UNA de las capacidades permitidas listadas abajo. No puedes inventar capacidades, permisos, pantallas, contenidos ni tutoriales: si la petición no encaja, responde intencion "NINGUNA".
El usuario está en la sección "${cuerpo.section ?? 'desconocida'}" (módulo "${cuerpo.module ?? 'desconocido'}"), rol "${cuerpo.role ?? 'desconocido'}".

CAPACIDADES PERMITIDAS (usa exactamente estos ids):
${caps}

CONTENIDOS DE AYUDA VISIBLES (para intencion EXPLICAR, parámetro helpEntryId):
${ayudas}

TUTORIALES DISPONIBLES (para intencion TUTORIAL, parámetro tutorialId):
${tutos}

PANTALLAS ACCESIBLES (para cap.navegacion.ir, parámetro route): ${cuerpo.routes.join(', ') || '(ninguna)'}

REGLAS:
1. intencion ∈ {NAVEGAR, EXPLICAR, TUTORIAL, CONSULTAR, EJECUTAR, NINGUNA}.
2. capabilityId debe ser uno de los ids permitidos, o null.
3. Si la petición encaja con varias capacidades de módulos distintos, deja capabilityId null y rellena "alternativas" con 2 a 4 ids permitidos.
4. Las capacidades [ESCRITURA] nunca se ejecutan: el sistema pedirá confirmación al usuario y solo abrirá la pantalla.
5. Los parámetros solo pueden ser los indicados para la capacidad; no añadas otros.
6. "explicacion": una frase breve en español dirigida al usuario. Sin datos personales, sin inventar información del sistema.
7. "confianza": número entre 0 y 1.

PETICIÓN DEL USUARIO:
"""${cuerpo.input.replace(/"""/g, '"')}"""

Responde ÚNICAMENTE con JSON válido con este esquema exacto:
{"intencion":"NAVEGAR|EXPLICAR|TUTORIAL|CONSULTAR|EJECUTAR|NINGUNA","capabilityId":"id o null","parametros":{},"alternativas":[],"confianza":0.0,"explicacion":"texto"}`;
}

/** Parseo tolerante: extrae el primer objeto JSON del texto; devuelve `null` si no es utilizable. */
export function parsearRespuestaModelo(texto: unknown): PropuestaIA | null {
  if (typeof texto !== 'string') return null;
  let raw = texto.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const ini = raw.indexOf('{');
  const fin = raw.lastIndexOf('}');
  if (ini < 0 || fin <= ini) return null;
  try {
    const obj = JSON.parse(raw.slice(ini, fin + 1)) as Record<string, unknown>;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const limpio: PropuestaIA = {};
    if (typeof obj.intencion === 'string') limpio.intencion = obj.intencion;
    if (typeof obj.capabilityId === 'string' && obj.capabilityId && obj.capabilityId !== 'null') limpio.capabilityId = obj.capabilityId;
    if (obj.parametros && typeof obj.parametros === 'object' && !Array.isArray(obj.parametros)) limpio.parametros = obj.parametros as Record<string, unknown>;
    if (Array.isArray(obj.alternativas)) limpio.alternativas = obj.alternativas.filter((x): x is string => typeof x === 'string');
    if (typeof obj.confianza === 'number') limpio.confianza = obj.confianza;
    if (typeof obj.explicacion === 'string') limpio.explicacion = obj.explicacion.slice(0, 300);
    if (typeof obj.helpEntryId === 'string') limpio.helpEntryId = obj.helpEntryId;
    if (typeof obj.tutorialId === 'string') limpio.tutorialId = obj.tutorialId;
    return limpio;
  } catch {
    return null;
  }
}

/** Respuesta del endpoint. `disponible:false` = el servidor no tiene proveedor (sin clave) → fallback local. */
export interface RespuestaInterpretar {
  disponible: boolean;
  proveedor?: string;
  modelo?: string;
  propuesta?: PropuestaIA | null;
  error?: string;
}

/**
 * Proveedor de cliente que delega en el servidor Express. Lanza si el servidor no está
 * disponible o responde que no hay proveedor: `resolverPeticion` capturará y usará el local.
 */
export function crearProveedorGeminiRemoto(fetchImpl: typeof fetch = (input, init) => fetch(input, init), ruta: string = RUTA_API_ASISTENTE): ProveedorIA {
  return {
    nombre: 'gemini',
    async interpretar(req) {
      const r = await fetchImpl(ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpoDesdeRequest(req)) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as RespuestaInterpretar;
      if (!data || data.disponible === false) throw new Error('PROVEEDOR_NO_CONFIGURADO');
      if (data.error) throw new Error(data.error);
      if (!data.propuesta) throw new Error('RESPUESTA_VACIA');
      return data.propuesta;
    },
  };
}
