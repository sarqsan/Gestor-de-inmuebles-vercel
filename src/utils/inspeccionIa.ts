// ============================================================
// FASE 3.3 — Cliente del diagnóstico asistido por IA para las
// fotografías de inspección de recomercialización.
// Llama al endpoint serverless /api/analizar-inspeccion por lotes.
// El resultado (lenguaje no asertivo) se vuela en FotoInspeccion.analisisIa.
// ============================================================

import type { FotoInspeccion } from '../types';

export type ResultadoAnalisisFoto = NonNullable<FotoInspeccion['analisisIa']>;

interface ResultadoLote {
  id: string;
  ok: boolean;
  observaciones: string[];
  sugerenciasMejora: string[];
  prioridad: 'baja' | 'media' | 'alta';
  motor: 'gemini' | 'heuristico';
}

const TAM_LOTE = 8;

/** Convierte una URL de imagen en un data URL base64 (mejor esfuerzo). */
async function urlADataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function postLote(
  fotos: FotoInspeccion[],
  modo: 'url' | 'base64',
  contexto: { direccion?: string; destino?: string }
): Promise<{ resultados: ResultadoLote[]; motorGlobal: 'gemini' | 'heuristico' }> {
  const fotosPayload = await Promise.all(
    fotos.map(async (f) => {
      const base: Record<string, unknown> = { id: f.id, estancia: f.estancia };
      if (modo === 'base64') {
        const dataUrl = await urlADataUrl(f.url);
        if (!dataUrl) return null;
        base.imageBase64 = dataUrl;
        base.mimeType = dataUrl.startsWith('data:') ? dataUrl.slice(5, dataUrl.indexOf(';')) : 'image/jpeg';
      } else {
        base.imageUrl = f.url;
      }
      return base;
    })
  );
  const payload = fotosPayload.filter(Boolean);
  if (payload.length === 0) return { resultados: [], motorGlobal: 'heuristico' };

  const resp = await fetch('/api/analizar-inspeccion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fotos: payload, contexto }),
  });
  if (!resp.ok) {
    throw new Error(`El análisis de inspección respondió ${resp.status}.`);
  }
  const json = await resp.json();
  return {
    resultados: Array.isArray(json.resultados) ? json.resultados : [],
    motorGlobal: json.motorGlobal === 'gemini' ? 'gemini' : 'heuristico',
  };
}

/**
 * Analiza un conjunto de fotos y devuelve un mapa id -> análisis (con
 * `analizFecha`). Estrategia resilente:
 *  1) Lotes enviando la URL firmada (el servidor descarga la imagen, sin CORS).
 *  2) Si el servidor tiene Gemini pero alguna foto no pudo descargarse, se
 *     reintenta esa foto enviando el base64 desde el navegador.
 *  3) Si no hay modelo, el servidor responde una guía honesta de revisión
 *     manual (motor 'heuristico'), que también se conserva.
 */
export async function analizarFotosInspeccion(
  fotos: FotoInspeccion[],
  contexto: { direccion?: string; destino?: string } = {},
  onProgreso?: (texto: string, completadas: number, total: number) => void,
  onLote?: (mapaParcial: Map<string, ResultadoAnalisisFoto>) => void
): Promise<Map<string, ResultadoAnalisisFoto>> {
  const pendientes = [...fotos];
  const total = pendientes.length;
  const mapa = new Map<string, ResultadoAnalisisFoto>();
  const ahora = new Date().toISOString();

  let completadas = 0;
  let motorGlobal: 'gemini' | 'heuristico' = 'gemini';
  const fallidas: FotoInspeccion[] = [];

  for (let i = 0; i < pendientes.length; i += TAM_LOTE) {
    const lote = pendientes.slice(i, i + TAM_LOTE);
    onProgreso?.(`Analizando fotografías ${i + 1}-${Math.min(i + TAM_LOTE, total)} de ${total}…`, completadas, total);
    const { resultados, motorGlobal: mg } = await postLote(lote, 'url', contexto);
    motorGlobal = mg;
    const porId = new Map(resultados.map((r) => [r.id, r]));
    for (const f of lote) {
      const r = porId.get(f.id);
      if (r && r.ok) {
        mapa.set(f.id, {
          observaciones: r.observaciones,
          sugerenciasMejora: r.sugerenciasMejora,
          prioridad: r.prioridad,
          motor: r.motor,
          analizFecha: ahora,
        });
      } else {
        fallidas.push(f);
      }
    }
    completadas = Math.min(i + TAM_LOTE, total);
    onLote?.(new Map(mapa));
    onProgreso?.(`Analizando fotografías ${completadas} de ${total}…`, completadas, total);
  }

  // Reintento en base64 solo si aparentemente hay modelo (pudo fallar la descarga).
  if (fallidas.length > 0 && motorGlobal === 'gemini') {
    for (let i = 0; i < fallidas.length; i += TAM_LOTE) {
      const lote = fallidas.slice(i, i + TAM_LOTE);
      onProgreso?.(`Reintentando ${lote.length} fotografía(s)…`, total - fallidas.length + i, total);
      try {
        const { resultados } = await postLote(lote, 'base64', contexto);
        for (const r of resultados) {
          if (r.ok) {
            mapa.set(r.id, {
              observaciones: r.observaciones,
              sugerenciasMejora: r.sugerenciasMejora,
              prioridad: r.prioridad,
              motor: r.motor,
              analizFecha: ahora,
            });
          }
        }
        onLote?.(new Map(mapa));
      } catch {
        // Se conservan sin análisis (el usuario puede reintentar).
      }
    }
  }

  onProgreso?.('', total, total);
  return mapa;
}
