/**
 * B4 — Relaciones padre→hijo (§9) y huérfanos (§11).
 *
 * Capa PURA. Regla inviolable: NO se migra un hijo si su padre no puede
 * resolverse con seguridad. NO se inventan padres para solucionar huérfanos:
 * cada caso se clasifica (INCOMPLETO si falta el dato, BLOQUEADO si la
 * referencia apunta a algo inexistente o contradictorio).
 *
 * Padres canónicos:
 *  GASTO → INMUEBLE · COBRO → CONTRATO (→ INMUEBLE) · DOCUMENTO → su entidad
 *  INMUEBLE → PROPIETARIO · CONTRATO → INMUEBLE · LEGACY_STORAGE → PROPIETARIO
 */
import type {
  CatalogosMigracion,
  ClasificacionHuerfano,
  RelacionesLinea,
  ResolucionDestino,
} from './tipos';

function textoPlano(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Resuelve el contrato destino (los cobros van embebidos: sin contrato no hay
 * cobro migrable — FASE 3 §J). Vías: (1) id explícito; (2) mapeo documentado.
 * NO se deriva de inmueble+periodo (sería inferencia).
 */
export function resolverContrato(p: {
  datos: Record<string, unknown>;
  normalizadoDestino?: Record<string, unknown>;
  claveOrigen?: string | null;
  catalogos: CatalogosMigracion;
}): ResolucionDestino {
  const explicito = textoPlano(p.datos['contratoId']) ?? textoPlano(p.normalizadoDestino?.['contratoId']);
  if (explicito) {
    const fichas = p.catalogos.contratos.filter((c) => c.id === explicito);
    if (fichas.length === 1) {
      return { id: explicito, estado: 'RESUELTO', evidencia: `contrato '${explicito}' existente en catálogo` };
    }
    if (fichas.length > 1) {
      return { id: null, estado: 'BLOQUEADO', evidencia: `contrato '${explicito}' duplicado en catálogo`, candidatos: fichas.map((f) => f.id) };
    }
    return { id: null, estado: 'INCOMPLETO', evidencia: `contrato '${explicito}' inexistente en catálogo (referencia a contrato inexistente)` };
  }
  if (p.claveOrigen) {
    const mapeos = p.catalogos.mapeos.filter((m) => m.alcance === 'CONTRATO' && m.origen === p.claveOrigen);
    if (mapeos.length > 1) {
      return { id: null, estado: 'BLOQUEADO', evidencia: `mapeo de contrato contradictorio para '${p.claveOrigen}'`, candidatos: mapeos.map((m) => m.destino) };
    }
    if (mapeos.length === 1) {
      const fichas = p.catalogos.contratos.filter((c) => c.id === mapeos[0].destino);
      if (fichas.length === 1) {
        return { id: mapeos[0].destino, estado: 'RESUELTO', evidencia: `mapeo documentado '${p.claveOrigen}' → contrato '${mapeos[0].destino}'` };
      }
      return { id: null, estado: 'BLOQUEADO', evidencia: `mapeo apunta a contrato inexistente '${mapeos[0].destino}'` };
    }
  }
  return { id: null, estado: 'INCOMPLETO', evidencia: 'sin contrato destino (sin id explícito ni mapeo; el cobro exige contrato previo)' };
}

export interface EntradaRelaciones {
  entidad: string;
  datos: Record<string, unknown>;
  propietario: ResolucionDestino;
  inmueble: ResolucionDestino;
  contrato: ResolucionDestino | null;
}

export interface VeredictoRelaciones {
  relaciones: RelacionesLinea;
  huerfano: ClasificacionHuerfano;
  /** Motivos que fuerzan BLOQUEADO (padre inexistente/contradictorio). */
  bloqueos: string[];
  /** Motivos que fuerzan INCOMPLETO (padre ausente sin conflicto). */
  faltantes: string[];
}

/** Evalúa padre + orfandad para una línea ya resuelta. Determinista. */
export function evaluarRelaciones(e: EntradaRelaciones): VeredictoRelaciones {
  const bloqueos: string[] = [];
  const faltantes: string[] = [];
  let padre: string | null = null;
  let padreResuelto = true;
  let huerfano: ClasificacionHuerfano = { es: false };

  const marcaHuerfano = (motivo: string, bloqueante: boolean) => {
    huerfano = { es: true, motivo };
    padreResuelto = false;
    if (bloqueante) bloqueos.push(motivo);
    else faltantes.push(motivo);
  };

  switch (e.entidad) {
    case 'PROPIETARIO':
      padre = null;
      padreResuelto = true;
      break;

    case 'INMUEBLE':
      if (e.propietario.id) {
        padre = e.propietario.id;
      } else if (e.propietario.estado === 'BLOQUEADO') {
        marcaHuerfano(`inmueble con titular en conflicto: ${e.propietario.evidencia}`, true);
      } else {
        marcaHuerfano('entidad sin propietario (inmueble sin titular determinable)', false);
      }
      break;

    case 'CONTRATO':
      if (e.inmueble.id) {
        padre = e.inmueble.id;
      } else if (e.inmueble.estado === 'BLOQUEADO') {
        marcaHuerfano(`contrato con inmueble en conflicto: ${e.inmueble.evidencia}`, true);
      } else {
        marcaHuerfano('entidad sin inmueble (contrato sin inmueble determinable)', false);
      }
      break;

    case 'GASTO':
      if (e.inmueble.id) {
        padre = e.inmueble.id;
      } else if (e.inmueble.estado === 'BLOQUEADO') {
        marcaHuerfano(`gasto con inmueble en conflicto: ${e.inmueble.evidencia} (no se elige por similitud)`, true);
      } else {
        marcaHuerfano('entidad sin inmueble (gasto → inmueble desconocido: NO migrable sin padre)', false);
      }
      break;

    case 'COBRO':
      if (e.contrato?.id) {
        padre = e.contrato.id;
      } else if (e.contrato?.estado === 'BLOQUEADO') {
        marcaHuerfano(`cobro con contrato en conflicto: ${e.contrato.evidencia}`, true);
      } else {
        marcaHuerfano('cobro sin contrato destino (los cobros van embebidos en el contrato)', false);
      }
      break;

    case 'DOCUMENTO': {
      const entidadRef = textoPlano(e.datos['entidadRef'] ?? e.datos['entidad']) ?? null;
      const entidadId = textoPlano(e.datos['entidadId'] ?? e.datos['entidadOrigenId']) ?? null;
      if (!entidadRef || !entidadId) {
        marcaHuerfano('documento sin entidad asociada (sin entidadRef/entidadId)', false);
      } else {
        // Vinculación declarada en origen: el padre destino se hereda de la
        // resolución de la propia línea (propietario/inmueble), no se inventa.
        padre = `${entidadRef}:${entidadId}`;
        padreResuelto = e.propietario.id !== null || e.inmueble.id !== null;
        if (!padreResuelto) {
          marcaHuerfano(`documento de ${entidadRef} '${entidadId}' sin destino resoluble (hereda orfandad)`, false);
        }
      }
      break;
    }

    case 'LEGACY_STORAGE':
      if (e.propietario.id) {
        padre = e.propietario.id;
      } else if (e.propietario.estado === 'BLOQUEADO') {
        marcaHuerfano(`objeto legacy con propietario en conflicto: ${e.propietario.evidencia}`, true);
      } else {
        marcaHuerfano('objeto legacy sin propietario determinable (sin pid no hay ruta destino)', false);
      }
      break;

    default:
      padreResuelto = false;
      huerfano = { es: false };
      break;
  }

  return { relaciones: { padre, padreResuelto, motivo: huerfano.motivo }, huerfano, bloqueos, faltantes };
}
