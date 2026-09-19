// ============================================================
// FASE 2.0 — Motor de GASTOS
// Clasifica cada apunte en EXPLOTACIÓN o FINANCIACIÓN y calcula
// totales separados. La distinción es contable y fiscal:
//  · Explotación  -> coste de mantener/alquilar la vivienda; computa al
//                    resultado operativo y suele ser deducible en IRPF.
//  · Financiación -> cuota hipotecaria; es salida de CAJA, no gasto
//                    operativo. La parte de capital amortiza deuda y solo
//                    los intereses son gasto financiero.
// ============================================================

import type {
  CategoriaGasto,
  EstadoGasto,
  FrecuenciaRecurrente,
  Gasto,
  GastoRecurrente,
  TipoGasto,
} from '../types';

export interface CategoriaGastoDef {
  value: CategoriaGasto;
  label: string;
  tipo: TipoGasto;
  descripcion: string;
  deduciblePorDefecto: boolean;
  aCargoDePorDefecto: 'arrendador' | 'arrendatario';
}

export const CATEGORIAS_GASTO: CategoriaGastoDef[] = [
  // --- Explotación -----------------------------------------------------
  {
    value: 'COMUNIDAD',
    label: 'Comunidad de propietarios',
    tipo: 'EXPLOTACION',
    descripcion: 'Cuota ordinaria/derramas de la comunidad de vecinos.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'IBI',
    label: 'IBI',
    tipo: 'EXPLOTACION',
    descripcion: 'Impuesto de Bienes Inmuebles.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'SEGURO_HOGAR',
    label: 'Seguro de hogar',
    tipo: 'EXPLOTACION',
    descripcion: 'Póliza de seguro del continente/contenido de la vivienda.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'SUMINISTROS',
    label: 'Suministros',
    tipo: 'EXPLOTACION',
    descripcion: 'Agua, luz, gas, internet cuando van por cuenta del arrendador.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendatario',
  },
  {
    value: 'MANTENIMIENTO',
    label: 'Mantenimiento',
    tipo: 'EXPLOTACION',
    descripcion: 'Mantenimiento preventivo y revisiones periódicas.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'REPARACION',
    label: 'Reparación',
    tipo: 'EXPLOTACION',
    descripcion: 'Reparaciones y obras de conservación de la vivienda.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'ADMINISTRACION',
    label: 'Comisión de administración',
    tipo: 'EXPLOTACION',
    descripcion: 'Honorarios del administrador/gestor del alquiler.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'LIMPIEZA',
    label: 'Limpieza',
    tipo: 'EXPLOTACION',
    descripcion: 'Servicios de limpieza vinculados al inmueble.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'OTRO_EXPLOTACION',
    label: 'Otros gastos de explotación',
    tipo: 'EXPLOTACION',
    descripcion: 'Cualquier otro coste operativo del alquiler.',
    deduciblePorDefecto: true,
    aCargoDePorDefecto: 'arrendador',
  },
  // --- Financiación ----------------------------------------------------
  {
    value: 'CUOTA_HIPOTECARIA',
    label: 'Cuota hipotecaria',
    tipo: 'FINANCIACION',
    descripcion:
      'Cuota mensual íntegra del préstamo (capital + intereses). Financiación, no explotación.',
    deduciblePorDefecto: false,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'INTERESES_PRESTAMO',
    label: 'Intereses de préstamo',
    tipo: 'FINANCIACION',
    descripcion:
      'Parte de intereses de financiación ajena (gasto financiero), si se registra suelta.',
    deduciblePorDefecto: false,
    aCargoDePorDefecto: 'arrendador',
  },
  {
    value: 'OTRO_FINANCIACION',
    label: 'Otros gastos financieros',
    tipo: 'FINANCIACION',
    descripcion: 'Comisiones bancarias, seguros vinculados al préstamo, etc.',
    deduciblePorDefecto: false,
    aCargoDePorDefecto: 'arrendador',
  },
];

const CATEGORIA_MAP: Record<CategoriaGasto, CategoriaGastoDef> = CATEGORIAS_GASTO.reduce(
  (acc, def) => {
    acc[def.value] = def;
    return acc;
  },
  {} as Record<CategoriaGasto, CategoriaGastoDef>
);

export function categoriaDef(categoria: CategoriaGasto): CategoriaGastoDef {
  return (
    CATEGORIA_MAP[categoria] || {
      value: categoria,
      label: categoria,
      tipo: 'EXPLOTACION',
      descripcion: '',
      deduciblePorDefecto: true,
      aCargoDePorDefecto: 'arrendador',
    }
  );
}

export function tipoDeCategoria(categoria: CategoriaGasto): TipoGasto {
  return categoriaDef(categoria).tipo;
}

export const TIPO_GASTO_LABEL: Record<TipoGasto, string> = {
  EXPLOTACION: 'Explotación',
  FINANCIACION: 'Financiación (hipoteca)',
};

export const ESTADO_GASTO_LABEL: Record<EstadoGasto, string> = {
  PENDIENTE: 'Pendiente',
  PAGADO: 'Pagado',
  ANULADO: 'Anulado',
};

export function etiquetaMesAnio(periodoMesAnio?: string): string {
  if (!periodoMesAnio) return 'Sin período';
  const [anio, mes] = periodoMesAnio.split('-').map((n) => parseInt(n, 10));
  if (!anio || !mes) return periodoMesAnio;
  const fecha = new Date(anio, mes - 1, 1);
  return fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

export function nuevoGastoId(inmuebleId: string): string {
  const seg = (inmuebleId || 'inm').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `gas_${seg}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function periodoDesdeFecha(fechaISO?: string): string | undefined {
  if (!fechaISO) return undefined;
  const d = new Date(fechaISO.length <= 10 ? `${fechaISO}T00:00:00` : fechaISO);
  if (isNaN(d.getTime())) return undefined;
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mes}`;
}

/**
 * Construye un Gasto nuevo aplicando los valores por defecto propios de la
 * categoría y garantizando la coherencia tipo<->categoría.
 */
export function crearGasto(input: {
  inmuebleId: string;
  propietarioId: string;
  categoria: CategoriaGasto;
  concepto?: string;
  importe?: number;
  fechaDevengo?: string;
  creadoPor?: string;
  creadoPorId?: string;
  contratoId?: string;
}): Gasto {
  const def = categoriaDef(input.categoria);
  const now = new Date().toISOString();
  const fechaDevengo =
    input.fechaDevengo || new Date().toISOString().split('T')[0];
  return {
    id: nuevoGastoId(input.inmuebleId),
    inmuebleId: input.inmuebleId,
    propietarioId: input.propietarioId,
    contratoId: input.contratoId,
    tipo: def.tipo,
    categoria: input.categoria,
    concepto: input.concepto?.trim() || def.label,
    importe: typeof input.importe === 'number' ? input.importe : 0,
    estado: 'PENDIENTE',
    fechaDevengo,
    fechaPago: undefined,
    periodoMesAnio: periodoDesdeFecha(fechaDevengo),
    aCargoDe: def.aCargoDePorDefecto,
    deducible: def.deduciblePorDefecto,
    capitalAmortizado: undefined,
    intereses: undefined,
    metodoPago: 'transferencia',
    notas: '',
    creadoPor: input.creadoPor,
    creadoPorId: input.creadoPorId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Normaliza un gasto antes de guardarlo: garantiza tipo coherente con la
 * categoría, el período y que el desglose financiero solo exista en
 * FINANCIACION.
 */
export function normalizarGasto(g: Gasto): Gasto {
  const def = categoriaDef(g.categoria);
  const periodo = g.periodoMesAnio || periodoDesdeFecha(g.fechaDevengo);
  const hoy = new Date().toISOString().split('T')[0];
  const normalizado: Gasto = {
    ...g,
    tipo: def.tipo,
    concepto: g.concepto?.trim() || def.label,
    periodoMesAnio: periodo,
    updatedAt: new Date().toISOString(),
  };
  // Coherencia estado <-> fecha de pago.
  if (normalizado.estado === 'PAGADO' && !normalizado.fechaPago) {
    normalizado.fechaPago = normalizado.fechaDevengo || hoy;
  }
  if (normalizado.estado === 'PENDIENTE' || normalizado.estado === 'ANULADO') {
    normalizado.fechaPago = undefined;
  }
  if (def.tipo !== 'FINANCIACION') {
    normalizado.capitalAmortizado = undefined;
    normalizado.intereses = undefined;
  }
  return normalizado;
}

export interface ResumenGastos {
  numero: number;
  /** Gastos de explotación pagados (resultado operativo). */
  explotacionPagado: number;
  /** Cuotas de financiación pagadas (salida de caja completa). */
  financiacionPagado: number;
  /** Intereses financieros pagados (gasto financiero). */
  interesesPagado: number;
  /** Capital de hipoteca amortizado (no es gasto; reduce la deuda). */
  capitalAmortizado: number;
  /** Suma pendiente de abonar (explotación + financiación). */
  pendiente: number;
  /** Total de salida de caja pagada (explotación + financiación íntegras). */
  salidaCajaPagada: number;
}

const vacio = (): ResumenGastos => ({
  numero: 0,
  explotacionPagado: 0,
  financiacionPagado: 0,
  interesesPagado: 0,
  capitalAmortizado: 0,
  pendiente: 0,
  salidaCajaPagada: 0,
});

export function resumenGastos(gastos: Gasto[]): ResumenGastos {
  return gastos
    .filter((g) => g.estado !== 'ANULADO')
    .reduce<ResumenGastos>((acc, g) => {
      acc.numero += 1;
      const importe = Number(g.importe) || 0;
      if (g.estado === 'PENDIENTE') {
        acc.pendiente += importe;
        return acc;
      }
      // PAGADO
      if (g.tipo === 'FINANCIACION') {
        acc.financiacionPagado += importe;
        // Si hay desglose informado, separamos capital e intereses.
        const intereses = Number(g.intereses) || 0;
        const capital =
          typeof g.capitalAmortizado === 'number'
            ? Number(g.capitalAmortizado) || 0
            : Math.max(importe - intereses, 0);
        acc.interesesPagado += intereses;
        acc.capitalAmortizado += capital;
      } else {
        acc.explotacionPagado += importe;
      }
      acc.salidaCajaPagada += importe;
      return acc;
    }, vacio());
}

/**
 * Agrupa los gastos por inmueble y devuelve el resumen de cada uno, ordenado
 * por importe de salida de caja descendente.
 */
export function resumenPorInmueble(
  gastos: Gasto[]
): Array<{ inmuebleId: string; resumen: ResumenGastos }> {
  const mapa = new Map<string, Gasto[]>();
  gastos.forEach((g) => {
    const lista = mapa.get(g.inmuebleId) || [];
    lista.push(g);
    mapa.set(g.inmuebleId, lista);
  });
  return Array.from(mapa.entries())
    .map(([inmuebleId, lista]) => ({ inmuebleId, resumen: resumenGastos(lista) }))
    .sort((a, b) => b.resumen.salidaCajaPagada - a.resumen.salidaCajaPagada);
}

// ============================================================
// FASE 2.2 — GASTOS RECURRENTES (plantillas)
// ============================================================

export const FRECUENCIA_LABEL: Record<FrecuenciaRecurrente, string> = {
  MENSUAL: 'Mensual',
  TRIMESTRAL: 'Trimestral',
  ANUAL: 'Anual',
};

export const FRECUENCIA_PASO_MESES: Record<FrecuenciaRecurrente, number> = {
  MENSUAL: 1,
  TRIMESTRAL: 3,
  ANUAL: 12,
};

/**
 * Backfill automático de plantillas antiguas limitado a 12 meses: evita crear
 * cientos de apuntes pendientes si el alta se hace con fecha de inicio pasada.
 */
export const MAX_MESES_BACKFILL = 12;

export function periodoActual(ref: Date = new Date()): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
}

export function sumarMeses(periodo: string, meses: number): string {
  const [anio, mes] = periodo.split('-').map((n) => parseInt(n, 10));
  const fecha = new Date(anio, mes - 1 + meses, 1);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

export function nuevoRecurrenteId(inmuebleId: string): string {
  const seg = (inmuebleId || 'inm').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `rec_${seg}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

/** ID determinista del apunte generado por una plantilla en un período. */
export function recurrenteGastoId(recId: string, anio: number, mes: number): string {
  const seg = recId.replace(/[^a-zA-Z0-9_]/g, '_');
  return `grec_${seg}_${anio}_${String(mes).padStart(2, '0')}`;
}

export function crearGastoRecurrente(input: {
  inmuebleId: string;
  propietarioId: string;
  categoria: CategoriaGasto;
  concepto?: string;
  importe?: number;
  frecuencia?: FrecuenciaRecurrente;
  diaVencimiento?: number;
  fechaInicio?: string;
  fechaFin?: string;
  aCargoDe?: 'arrendador' | 'arrendatario';
  deducible?: boolean;
  metodoPago?: Gasto['metodoPago'];
  notas?: string;
  creadoPor?: string;
  creadoPorId?: string;
}): GastoRecurrente {
  const def = categoriaDef(input.categoria);
  const now = new Date().toISOString();
  return {
    id: nuevoRecurrenteId(input.inmuebleId),
    inmuebleId: input.inmuebleId,
    propietarioId: input.propietarioId,
    tipo: def.tipo,
    categoria: input.categoria,
    concepto: input.concepto?.trim() || def.label,
    proveedor: undefined,
    importe: typeof input.importe === 'number' ? input.importe : 0,
    frecuencia: input.frecuencia || 'MENSUAL',
    diaVencimiento: input.diaVencimiento || 1,
    fechaInicio: input.fechaInicio || periodoActual(),
    fechaFin: input.fechaFin || undefined,
    aCargoDe: input.aCargoDe || def.aCargoDePorDefecto,
    deducible: input.deducible ?? def.deduciblePorDefecto,
    metodoPago: input.metodoPago || 'domiciliacion',
    notas: input.notas?.trim() || undefined,
    activo: true,
    ultimoPeriodoGenerado: undefined,
    creadoPor: input.creadoPor,
    creadoPorId: input.creadoPorId,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizarRecurrente(r: GastoRecurrente): GastoRecurrente {
  const def = categoriaDef(r.categoria);
  const dia = Math.min(Math.max(Number(r.diaVencimiento) || 1, 1), 28);
  const normalizado: GastoRecurrente = {
    ...r,
    tipo: def.tipo,
    concepto: r.concepto?.trim() || def.label,
    importe: Number(r.importe) || 0,
    diaVencimiento: dia,
    aCargoDe: r.aCargoDe || def.aCargoDePorDefecto,
    deducible: def.tipo === 'FINANCIACION' ? false : r.deducible ?? def.deduciblePorDefecto,
    updatedAt: new Date().toISOString(),
  };
  return normalizado;
}

/** Períodos debidos de una plantilla hasta `hasta` (inclusive), sin materializar. */
export function periodosDebidos(
  r: GastoRecurrente,
  hasta: string = periodoActual()
): string[] {
  const resultado: string[] = [];
  // Ventana inclusiva de MAX_MESES_BACKFILL meses contando el mes en curso.
  const limiteInferior = sumarMeses(hasta, -(MAX_MESES_BACKFILL - 1));
  const paso = FRECUENCIA_PASO_MESES[r.frecuencia] || 1;
  let periodo = r.fechaInicio;
  // Seguridad anti-bucle: como mucho 600 iteraciones (50 años mensuales).
  let guard = 0;
  while (periodo <= hasta && guard < 600) {
    guard += 1;
    if (periodo >= limiteInferior && (!r.fechaFin || periodo <= r.fechaFin)) {
      if (!r.ultimoPeriodoGenerado || periodo > r.ultimoPeriodoGenerado) {
        resultado.push(periodo);
      }
    }
    periodo = sumarMeses(periodo, paso);
  }
  return resultado;
}

/** Materializa el apunte PENDIENTE de una plantilla para un período concreto. */
export function materializarGastoRecurrente(
  r: GastoRecurrente,
  periodo: string
): Gasto {
  const [anio, mes] = periodo.split('-').map((n) => parseInt(n, 10));
  const dia = String(Math.min(r.diaVencimiento || 1, 28)).padStart(2, '0');
  const def = categoriaDef(r.categoria);
  const now = new Date().toISOString();
  return {
    id: recurrenteGastoId(r.id, anio, mes),
    inmuebleId: r.inmuebleId,
    propietarioId: r.propietarioId,
    tipo: def.tipo,
    categoria: r.categoria,
    concepto: `${r.concepto} · ${etiquetaMesAnio(periodo)}`,
    proveedor: r.proveedor,
    importe: Number(r.importe) || 0,
    estado: 'PENDIENTE',
    fechaDevengo: `${periodo}-${dia}`,
    fechaPago: undefined,
    periodoMesAnio: periodo,
    aCargoDe: r.aCargoDe,
    deducible: def.tipo === 'FINANCIACION' ? false : r.deducible ?? def.deduciblePorDefecto,
    metodoPago: r.metodoPago,
    notas: r.notas,
    creadoPor: r.creadoPor || 'Sistema',
    creadoPorId: r.id,
    createdAt: now,
    updatedAt: now,
  };
}

export interface ResultadoGeneracionRecurrentes {
  gastos: Gasto[];
  plantillasActualizadas: GastoRecurrente[];
}

/**
 * Genera los apuntes pendientes de todas las plantillas activas hasta el mes en
 * curso. Es idempotente: los IDs son deterministas y se ignoran los apuntes ya
 * existentes. Devuelve los gastos nuevos y las plantillas con el cursor
 * `ultimoPeriodoGenerado` avanzado.
 */
export function generarGastosRecurrentes(
  plantillas: GastoRecurrente[],
  gastosExistentes: Gasto[],
  ref: Date = new Date()
): ResultadoGeneracionRecurrentes {
  const hasta = periodoActual(ref);
  const idsExistentes = new Set(gastosExistentes.map((g) => g.id));
  const gastos: Gasto[] = [];
  const plantillasActualizadas: GastoRecurrente[] = [];

  plantillas
    .filter((r) => r.activo !== false)
    .forEach((r) => {
      const pendientes = periodosDebidos(r, hasta).filter((p) => {
        const [anio, mes] = p.split('-').map((n) => parseInt(n, 10));
        return !idsExistentes.has(recurrenteGastoId(r.id, anio, mes));
      });
      if (pendientes.length === 0) return;
      pendientes.forEach((p) => {
        const gasto = materializarGastoRecurrente(r, p);
        gastos.push(gasto);
        idsExistentes.add(gasto.id);
      });
      plantillasActualizadas.push({
        ...r,
        ultimoPeriodoGenerado: pendientes[pendientes.length - 1],
        updatedAt: new Date().toISOString(),
      });
    });

  return { gastos, plantillasActualizadas };
}

/** Etiqueta del próximo vencimiento de una plantilla (para el listado). */
export function proximoPeriodoRecurrente(r: GastoRecurrente, ref: Date = new Date()): string {
  const actual = periodoActual(ref);
  const periodos = periodosDebidos(r, actual);
  if (periodos.length > 0) return periodos[0];
  // No debe nada: el siguiente es la primera ocurrencia estrictamente futura.
  const paso = FRECUENCIA_PASO_MESES[r.frecuencia] || 1;
  let candidato = r.ultimoPeriodoGenerado
    ? sumarMeses(r.ultimoPeriodoGenerado, paso)
    : r.fechaInicio;
  let guard = 0;
  while (candidato <= actual && guard < 600) {
    candidato = sumarMeses(candidato, paso);
    guard += 1;
  }
  return candidato;
}
