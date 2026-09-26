/**
 * FASE 4 · B0-B3 — Tipos compartidos de la infraestructura de importación.
 *
 * Capa PURA: sin persistencia, sin Firebase, sin I/O. Nada de lo definido aquí
 * escribe en Firestore ni resuelve incidencias C de FASE 2 (INC-01…INC-15):
 * los casos dudosos se MARCAN, nunca se deciden.
 *
 * Fuentes de diseño: docs/FASE2-MAPA-ORIGEN-DESTINO-RENTASYNC.md y
 * docs/FASE3-ESTRATEGIA-MIGRACION-ARQUITECTURA-IMPORT-EXPORT.md.
 */
import type { CobroPeriodo, Gasto, Inmueble } from '../../types';

export const SISTEMA_ORIGEN_RENTASYNC = 'RENTASYNC';
export const MARCA_NO_DISPONIBLE = '__NO_DISPONIBLE__';
export const PREFIJO_ID_NO_RECUPERADO = '__ID_NO_RECUPERADO_';

export type EstadoEvidencia = 'VERIFICADO' | 'PENDIENTE' | 'REQUIERE_VALIDACION';

export type ClasificacionFase2 = 'A' | 'B' | 'C' | 'D';

export interface ProcedenciaRegistro {
  sistema: string; // 'RENTASYNC'
  origenId: string | null; // exp_* / prop_*; null si el id de origen no es recuperable
  fuente: string; // p.ej. 'pegado_A' | 'pegado_B' | 'ambos_pegados' | 'fichero_original'
  loteId: string | null; // sha256 del lote (ver contratoMigracion)
  estadoEvidencia: EstadoEvidencia;
  evidenciaNota?: string;
}

export interface TransformacionAplicada {
  campo: string;
  regla: string;
  clasificacion: ClasificacionFase2;
}

export type TipoIncidencia =
  | 'DUPLICADO_ORIGEN'
  | 'POSIBLE_DUPLICADO'
  | 'COLISION'
  | 'CAMPO_DESCONOCIDO'
  | 'DATO_INCOMPLETO'
  | 'CLASIFICACION_AMBIGUA'
  | 'AGREGADO_NO_IMPORTABLE'
  | 'REGISTRO_TRUNCADO'
  | 'DEPENDENCIA_PERMISOS'
  | 'RENTA_ANUAL_VS_MENSUAL';

export interface IncidenciaDetectada {
  codigo: TipoIncidencia;
  /** Referencia al registro de incidencias de FASE 2 cuando aplica (INC-01…INC-15). */
  incidenciaFase2?: string;
  detalle: string;
  severidad: 'INFO' | 'BLOQUEANTE' | 'REQUIERE_VALIDACION';
}

/** Registro externo crudo (esquema Rentasync v1). Se acepta cualquier campo extra. */
export interface RegistroMovimientoExterno {
  id?: string;
  type?: string;
  category?: string;
  amount?: unknown;
  propertyId?: string;
  date?: string;
  description?: string;
  receiptType?: string;
  receiptName?: string;
  receiptUrl?: string;
  receiptUrl_estado?: string; // marcador de custodia (FASE 2): base64 no transcrito
  _fuente?: string;
  [clave: string]: unknown;
}

export interface RegistroInmuebleExterno {
  id?: string;
  [clave: string]: unknown;
}

export interface NormalizacionBase {
  procedencia: ProcedenciaRegistro;
  transformaciones: TransformacionAplicada[];
  incidencias: IncidenciaDetectada[];
  /** Campos del destino que NO se autocompletan: exigen validación humana (FASE 2 C). */
  camposRequierenValidacion: string[];
  /** Copia inmutable del registro externo tal cual llegó (campos desconocidos incluidos). */
  rawSnapshot: Record<string, unknown>;
  bloqueado: boolean;
  motivoBloqueo?: string;
}

export interface GastoNormalizado extends NormalizacionBase {
  entidad: 'GASTO';
  destino: Partial<Gasto>;
}

export interface CobroNormalizado extends NormalizacionBase {
  entidad: 'COBRO';
  destino: Partial<CobroPeriodo>;
  mes: number | null;
  anio: number | null;
  rentaAnual: boolean;
}

export interface InmuebleNormalizado extends NormalizacionBase {
  entidad: 'INMUEBLE';
  destino: Partial<Inmueble>;
  /** Agregados/anuales del origen que NO se importan (FASE 2 clase D). */
  agregadosNoImportables: string[];
  /** Campos conocidos del origen sin destino en el ERP (REQUIERE_MAPEO). */
  camposSinDestino: string[];
}

/** Registro truncado o no reconocible: se conserva la evidencia, no se transforma. */
export interface RegistroNoNormalizable extends NormalizacionBase {
  entidad: 'TRUNCADO' | 'DESCONOCIDO';
  destino: Record<string, never>;
}

export type RegistroNormalizado =
  | GastoNormalizado
  | CobroNormalizado
  | InmuebleNormalizado
  | RegistroNoNormalizable;
