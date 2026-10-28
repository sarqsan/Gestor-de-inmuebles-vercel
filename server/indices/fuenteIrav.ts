/**
 * P1.2 (parcial y HONESTA) — Fuente del IRAV desacoplada del motor de cálculo.
 * ===========================================================================
 * `calcularPreviewActualizacionRenta` ya admite una `serie` inyectada y ya se
 * NIEGA a calcular si la verificación (`consultadoEn`) tiene más de
 * `MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV` días. Lo que faltaba era un contrato
 * explícito de proveedor que distinga un SNAPSHOT LOCAL de una fuente VIVA.
 *
 * ESTADO REAL A 2026-10-27:
 * - El sandbox NO tiene salida a `ine.es` (solo github/npm/pypi) y NO existe
 *   staging. Por tanto NO se ha podido verificar un endpoint de descarga real.
 * - NO se inventa ninguna URL de API del INE: el proveedor remoto queda como
 *   `PENDIENTE` y FALLA CERRADO. Nunca se presenta el snapshot como fuente viva.
 * - El snapshot codificado sigue siendo el del motor (2026M08 2,47 % y
 *   2026M09 2,54 %, consultado el 2026-10-17) y caduca a los 45 días.
 *
 * Para completar P1.2 hará falta: (1) autorizar salida a la URL oficial de la
 * serie IRAV1, (2) verificar formato/firma con una captura real, (3) publicar la
 * versión consultada y (4) probar el refresco sin redespliegue. Hasta entonces
 * este módulo es la costura verificable, NO la integración terminada.
 */
import {
  FUENTES_IRAV_OFICIALES,
  MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV,
  type DatoIRAVOficial,
} from '../../src/utils/actualizacionRentaEngine.js';

export type OrigenFuenteIrav = 'SNAPSHOT_LOCAL' | 'REMOTO_VERIFICADO' | 'PENDIENTE';

export interface ResultadoFuenteIrav {
  origen: OrigenFuenteIrav;
  serie: readonly DatoIRAVOficial[];
  /** Fecha ISO en que se verificó la fuente. Obligatoria si hay datos. */
  consultadoEn: string | null;
  aviso: string | null;
}

export interface ProveedorFuenteIrav {
  readonly id: string;
  obtenerSerie(): Promise<ResultadoFuenteIrav>;
}

export class ErrorFuenteIravNoDisponible extends Error {
  readonly codigo = 'FUENTE_IRAV_NO_DISPONIBLE';
  constructor(motivo: string) {
    super(motivo);
    this.name = 'ErrorFuenteIravNoDisponible';
  }
}

const SNAPSHOT_AVISO =
  'SNAPSHOT LOCAL codificado en el repositorio. NO es una fuente viva: caduca a los 45 días desde 2026-10-17.';

/** Proveedor por defecto: deja explícito que los datos NO están vivos. */
export function proveedorSnapshotLocal(): ProveedorFuenteIrav {
  return {
    id: 'irav_snapshot_local',
    async obtenerSerie() {
      return {
        origen: 'SNAPSHOT_LOCAL' as const,
        serie: FUENTES_IRAV_OFICIALES,
        consultadoEn: consultaMasReciente(FUENTES_IRAV_OFICIALES),
        aviso: SNAPSHOT_AVISO,
      };
    },
  };
}

/**
 * Proveedor remoto PENDIENTE. Falla cerrado y NO simula una descarga. Sirve
 * como punto de sustitución: cuando exista integración verificada se cambia
 * esta implementación sin tocar el motor de cálculo.
 */
export function proveedorRemotoPendiente(): ProveedorFuenteIrav {
  return {
    id: 'irav_remoto_pendiente',
    async obtenerSerie() {
      throw new ErrorFuenteIravNoDisponible(
        'PENDIENTE: no hay descarga verificada de la serie IRAV1 del INE. No se inventa un endpoint ni se simula una fuente viva.',
      );
    },
  };
}

export function consultaMasReciente(serie: readonly DatoIRAVOficial[]): string | null {
  const fechas = serie.map((d) => d.consultadoEn).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f));
  return fechas.length ? fechas.sort().at(-1)! : null;
}

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

export interface ValidacionFrescura {
  ok: boolean;
  dias: number;
  motivo: string | null;
}

/** Rechaza series vacías, fechas futuras, malformadas o con más de 45 días. */
export function validarFrescuraSerie(
  serie: readonly DatoIRAVOficial[],
  hoy: string,
  maxDias: number = MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV,
): ValidacionFrescura {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return { ok: false, dias: -1, motivo: 'HOY_INVALIDO' };
  if (serie.length === 0) return { ok: false, dias: -1, motivo: 'SERIE_VACIA' };
  const consultadoEn = consultaMasReciente(serie);
  if (!consultadoEn) return { ok: false, dias: -1, motivo: 'SIN_FECHA_CONSULTA' };
  const dias = diasEntre(consultadoEn, hoy);
  if (dias < 0) return { ok: false, dias, motivo: 'FECHA_CONSULTA_FUTURA' };
  if (dias > maxDias) return { ok: false, dias, motivo: 'FUENTE_IRAV_DESACTUALIZADA' };
  return { ok: true, dias, motivo: null };
}

/**
 * Resuelve la serie que se puede inyectar en el motor. Si la fuente no está
 * fresca o el proveedor remoto no está implementado, LANZA: el llamador debe
 * devolver una revisión humana, NUNCA calcular con datos caducados.
 */
export async function resolverSerieIrav(
  proveedor: ProveedorFuenteIrav,
  hoy: string,
): Promise<ResultadoFuenteIrav> {
  let resultado: ResultadoFuenteIrav;
  try {
    resultado = await proveedor.obtenerSerie();
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    throw new ErrorFuenteIravNoDisponible(`Proveedor «${proveedor.id}» no disponible: ${mensaje}`);
  }
  if (!resultado.consultadoEn) {
    throw new ErrorFuenteIravNoDisponible(`Proveedor «${proveedor.id}» no declara fecha de consulta.`);
  }
  const validacion = validarFrescuraSerie(resultado.serie, hoy);
  if (!validacion.ok) {
    throw new ErrorFuenteIravNoDisponible(
      `Proveedor «${proveedor.id}» rechazado (${validacion.motivo}, ${validacion.dias} días). No se calcula la actualización.`,
    );
  }
  return resultado;
}
