/**
 * B4 — Reglas por entidad: completitud (§12), legacy Storage (§13),
 * documentos (§14), fiscalidad (§15) y destinos deterministas (§16/§18).
 *
 * Capa PURA. Principios:
 *  · No se rellena silenciosamente con usuario/propietario/fecha actual,
 *    valores por defecto ni inferencias no confirmadas.
 *  · B4 NO recalcula fiscalidad histórica (no existe transformador puro
 *    validado disponible): conserva original + transformado y deja
 *    `deducible` en null salvo que viniera explícito.
 *  · Un documento asociado solo por nombre de fichero NUNCA es AUTO.
 *  · Los ids deterministas siguen el contrato B0 (`gas_…`, `cobro_…`).
 */
import { idDeterministaCobro, idDeterministaGasto } from '../importacion/dedup';
import type {
  DestinoPropuesto,
  FiscalLinea,
  LineaDryRun,
} from './tipos';

function textoPlano(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function numeroValido(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function fechaISOValida(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return v;
}

export interface ChequeoCompletitud {
  /** Campos necesarios ausentes (fuerzan INCOMPLETO como mínimo). */
  faltantes: string[];
  /** Campos recomendados ausentes (topan a REVISIÓN como máximo). */
  recomendadosAusentes: string[];
}

/**
 * Campos necesarios por entidad (§12). `datos` = crudo + normalizado B1
 * (el llamante los fusiona dando prioridad al normalizado para leer).
 */
export function chequearCompletitud(entidad: string, lectura: Record<string, unknown>): ChequeoCompletitud {
  const faltantes: string[] = [];
  const recomendadosAusentes: string[] = [];
  const exige = (campo: string, ok: boolean) => { if (!ok) faltantes.push(campo); };
  const recomienda = (campo: string, ok: boolean) => { if (!ok) recomendadosAusentes.push(campo); };

  switch (entidad) {
    case 'GASTO':
      exige('importe', numeroValido(lectura['importe']) !== null);
      exige('fechaDevengo', fechaISOValida(lectura['fechaDevengo'] ?? lectura['fecha']) !== null);
      exige('categoria', textoPlano(lectura['categoria']) !== null);
      exige('concepto', textoPlano(lectura['concepto'] ?? lectura['description']) !== null);
      // `proveedor` es opcional en el modelo destino (`Gasto.proveedor?`):
      // su ausencia NO baja a REVISIÓN (autocorrección B4: sin falsos positivos).
      break;
    case 'COBRO':
      exige('importe', numeroValido(lectura['importe']) !== null);
      exige('mes', typeof lectura['mes'] === 'number' && (lectura['mes'] as number) >= 1 && (lectura['mes'] as number) <= 12);
      exige('anio', typeof lectura['anio'] === 'number' && (lectura['anio'] as number) >= 1900 && (lectura['anio'] as number) <= 2100);
      recomienda('inquilinoId', textoPlano(lectura['inquilinoId']) !== null);
      break;
    case 'INMUEBLE':
      exige('direccion', textoPlano(lectura['direccion'] ?? lectura['address']) !== null);
      recomienda('ciudad', textoPlano(lectura['ciudad']) !== null);
      recomienda('referenciaCatastral', textoPlano(lectura['referenciaCatastral'] ?? lectura['cadastralReference']) !== null);
      break;
    case 'PROPIETARIO':
      exige('nombre', textoPlano(lectura['nombre']) !== null);
      recomienda('nifCif', textoPlano(lectura['nifCif'] ?? lectura['nif'] ?? lectura['cif']) !== null);
      break;
    case 'CONTRATO':
      exige('inmuebleId', textoPlano(lectura['inmuebleId']) !== null);
      recomienda('candidatoId', textoPlano(lectura['candidatoId']) !== null);
      break;
    case 'DOCUMENTO':
      exige('nombreOriginal', textoPlano(lectura['nombreOriginal'] ?? lectura['receiptName'] ?? lectura['nombre']) !== null);
      exige('rutaOriginal', textoPlano(lectura['rutaOriginal'] ?? lectura['receiptUrl'] ?? lectura['ruta']) !== null);
      recomienda('tipo', textoPlano(lectura['tipo'] ?? lectura['receiptType']) !== null);
      break;
    case 'LEGACY_STORAGE':
      exige('rutaOrigen', textoPlano(lectura['rutaOrigen'] ?? lectura['ruta']) !== null);
      break;
    default:
      break;
  }
  return { faltantes, recomendadosAusentes };
}

// ---------------------------------------------------------------------------
// Destinos deterministas (§16/§18)
// ---------------------------------------------------------------------------

export interface ContextoDestino {
  entidad: string;
  lectura: Record<string, unknown>;
  propiedadId: string | null;
  inmuebleId: string | null;
  contratoId: string | null;
  /** Id de origen válido (sin prefijo de sistema) para ids deterministas. */
  origenId: string | null;
  /** Id existente cuando la resolución fue por match (VINCULAR). */
  matchExistenteId: string | null;
}

/** Propone destino computable. null = sin destino proponible. */
export function proponerDestino(c: ContextoDestino): DestinoPropuesto | null {
  switch (c.entidad) {
    case 'GASTO':
      if (c.inmuebleId && c.origenId) {
        return { coleccion: 'gastos', destinoId: idDeterministaGasto(c.inmuebleId, c.origenId), operacion: 'CREAR' };
      }
      return null;
    case 'COBRO': {
      const mes = c.lectura['mes'];
      const anio = c.lectura['anio'];
      if (c.contratoId && typeof mes === 'number' && typeof anio === 'number') {
        return { coleccion: 'contratos_formalizacion/registroCobros(embebido)', destinoId: idDeterministaCobro(c.contratoId, anio, mes), operacion: 'CREAR' };
      }
      return null;
    }
    case 'INMUEBLE':
      if (c.matchExistenteId) {
        return { coleccion: 'inmuebles', destinoId: c.matchExistenteId, operacion: 'VINCULAR' };
      }
      // Sin match: la creación futura la decide un humano (ID lo asigna la confirmación).
      return { coleccion: 'inmuebles', destinoId: null, operacion: 'CREAR' };
    case 'PROPIETARIO':
      if (c.matchExistenteId) {
        return { coleccion: 'propietarios', destinoId: c.matchExistenteId, operacion: 'VINCULAR' };
      }
      return { coleccion: 'propietarios', destinoId: null, operacion: 'CREAR' };
    case 'CONTRATO':
      if (c.matchExistenteId) {
        return { coleccion: 'contratos_formalizacion', destinoId: c.matchExistenteId, operacion: 'VINCULAR' };
      }
      return { coleccion: 'contratos_formalizacion', destinoId: null, operacion: 'CREAR' };
    case 'DOCUMENTO': {
      const nombre = textoPlano(c.lectura['nombreOriginal'] ?? c.lectura['receiptName'] ?? c.lectura['nombre']);
      if (c.propiedadId && nombre) {
        const seguro = nombre.replace(/[^a-zA-Z0-9._-]/g, '_');
        return { coleccion: 'Storage(gastos_facturas)', destinoId: `gastos_facturas/${c.propiedadId}/doc-historico/${seguro}`, operacion: 'CREAR' };
      }
      return null;
    }
    case 'LEGACY_STORAGE': {
      const ruta = textoPlano(c.lectura['rutaOrigen'] ?? c.lectura['ruta']);
      if (!ruta) return null;
      const resto = ruta.replace(/^cobros_justificantes\//, '');
      if (c.propiedadId && resto !== ruta) {
        return { coleccion: 'Storage(cobros_justificantes)', destinoId: `cobros_justificantes/${c.propiedadId}/${resto}`, operacion: 'CREAR' };
      }
      return { coleccion: 'Storage(cobros_justificantes)', destinoId: null, operacion: 'CREAR' };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Fiscalidad (§15): conservar, no recalcular
// ---------------------------------------------------------------------------

export function clasificarFiscal(p: {
  entidad: string;
  datos: Record<string, unknown>;
  normalizadoDestino?: Record<string, unknown>;
}): FiscalLinea | undefined {
  if (p.entidad !== 'GASTO' && p.entidad !== 'COBRO') return undefined;
  const original = {
    importe: p.datos['amount'] ?? p.datos['importe'] ?? null,
    categoria: p.datos['category'] ?? p.datos['categoria'] ?? null,
    fecha: p.datos['date'] ?? p.datos['fecha'] ?? p.datos['fechaDevengo'] ?? null,
  };
  const transformado = {
    importe: p.normalizadoDestino?.['importe'] ?? null,
    categoria: p.normalizadoDestino?.['categoria'] ?? null,
    fechaDevengo: p.normalizadoDestino?.['fechaDevengo'] ?? null,
  };
  const explicito = p.normalizadoDestino?.['deducible'];
  const deducible = typeof explicito === 'boolean' ? explicito : null;
  return {
    original,
    transformado,
    deducible,
    clasificacion: typeof transformado.categoria === 'string' && transformado.categoria ? String(transformado.categoria) : 'SIN_CLASIFICAR',
    motivo: deducible === null
      ? 'B4 no calcula deducibilidad histórica (sin transformador puro validado; la migración no destruye el original)'
      : 'deducible explícito conservado del normalizado (B4 no lo recalcula)',
  };
}

// ---------------------------------------------------------------------------
// Documentos (§14): asociación solo por nombre ⇒ nunca AUTO
// ---------------------------------------------------------------------------

/** Tipo documental declarado (extensión/MIME del origen; no inferido por contenido). */
export function tipoDocumentalDeclarado(lectura: Record<string, unknown>): string {
  const declarado = textoPlano(lectura['tipo'] ?? lectura['receiptType']);
  if (declarado) return declarado;
  const nombre = textoPlano(lectura['nombreOriginal'] ?? lectura['receiptName'] ?? lectura['nombre']) ?? '';
  const m = nombre.match(/\.([a-zA-Z0-9]{1,5})$/);
  return m ? `extension:.${m[1].toLowerCase()}` : 'DESCONOCIDO';
}

/** Solo para tipado interno del motor (evita imports circulares en tests). */
export type LineaParaDestino = Pick<LineaDryRun, 'entidad' | 'propietarioDestinoId' | 'inmuebleDestinoId'>;
