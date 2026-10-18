/**
 * FASE F (PLAN-CAPACIDADES 2026-10-16, §5) — PAQUETE CONTABLE DEL ASESOR.
 * Contrato del núcleo aislado (arena paralela, sin merge).
 *
 * Qué es: capa PURA (sin I/O, sin Firebase, sin reloj implícito) que, a partir
 * de registros ya leídos del modelo canónico, construye en UN solo paquete:
 * contratos vigentes en el/los ejercicio(s), cobros, gastos, facturas,
 * liquidaciones y pólizas del ámbito, el LIBRO DE INGRESOS Y GASTOS por fecha
 * y un índice/manifest con hashes SHA-256 por entrada.
 *
 * Qué NO es (límites declarados, no ocultos):
 *  · No es un formato oficial AEAT ni una presentación telemática.
 *  · No inventa bases/IVA: un `Gasto` no guarda desglose; solo se consigna
 *    base/IVA cuando existe una `Factura` vinculada (`gasto.facturaId`).
 *  · No duplica en el libro: facturas y liquidaciones viajan como
 *    documentación de contraste, nunca como segunda línea de ingreso/gasto
 *    (factura emitida ≠ cobro; liquidación = agregación de cobros/gastos).
 *  · No empaqueta binarios (PDF) en esta v1: las referencias documentales
 *    viajan por nombre; el binario exige un resolver de Storage autorizado
 *    en la integración (mismo patrón PENDIENTE del expediente fiscal B6).
 *  · No introduce PSD2, conexión bancaria ni escrituras: cero Firestore,
 *    cero Storage, cero red. La conciliación sigue siendo manual/importada.
 *  · Minimización: nunca incluye IBAN, DNI de inquilino, teléfonos ni
 *    correos. Los NIF de factura (emisor/receptor) sí viajan por ser el
 *    dato fiscal que el asesor necesita para contabilizar la factura.
 *
 * Correspondencia con la nomenclatura «P»: en `main` (f782e53) no existe un
 * documento que nombre «P5–P7» como fases. La arena principal
 * (`arena/d2bfa306-…`, no integrada) etiqueta P1≈avisos fail-closed,
 * P2≈justificantes, P3≈conciliación y P4≈actualización de renta, que
 * coinciden funcionalmente con las Fases A–D del plan. Por esa
 * correspondencia (explícitamente NO un nombre canónico verificado) esta
 * Fase F es la candidata «P6». Este módulo se nombra sin «P» adrede.
 */
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  Inmueble,
  PolizaSeguro,
} from '../../types';
import type { Factura } from '../../types/facturacion';
import type { LiquidacionPropietario } from '../../tesoreria/tipos';
import type { AmbitoAutorizado } from '../importExport/contrato';

/** Versión del contrato del paquete (documento interno versionado). */
export const PAQUETE_ASESOR_SCHEMA = 'erp-paquete-asesor-v1';

/** Lo que el usuario pide (espejo multi-entidad de `AmbitoExportacionSolicitado`). */
export interface SolicitudPaqueteAsesor {
  /** Propietarios solicitados; vacío = todos los legibles (master: prohibido). */
  propietarioIds: readonly string[];
  /** Inmuebles solicitados; vacío/ausente = todos los de los propietarios efectivos. */
  inmuebleIds?: readonly string[];
  /** Ejercicios (años); vacío/ausente = todos (con aviso en el manifest). */
  ejercicios?: readonly number[];
  /** Entidades documentales opcionales a incluir cuando haya datos. */
  incluirPolizas?: boolean; // por defecto true («y PÓLIZA si procede»)
  incluirLiquidaciones?: boolean; // por defecto true
  incluirFacturas?: boolean; // por defecto true
}

/** Ámbito efectivo tras validar (defensa en profundidad; las Rules mandan). */
export interface VeredictoAmbitoPaquete {
  ok: boolean;
  error?: string;
  propietariosEfectivos: string[];
  /** null = todos los inmuebles de los propietarios efectivos. */
  inmueblesEfectivos: string[] | null;
  /** Ejercicios efectivos ordenados; null = sin filtro temporal. */
  ejerciciosEfectivos: number[] | null;
  avisos: string[];
}

/** Entrada del motor: registros YA leídos por el llamante (con sus Rules). */
export interface EntradaPaqueteAsesor {
  inmuebles: readonly Inmueble[];
  contratos: readonly ContratoFormalizacion[];
  gastos: readonly Gasto[];
  /** Opcionales: si el llamante no los aporta, el paquete lo declara. */
  facturas?: readonly Factura[];
  liquidaciones?: readonly LiquidacionPropietario[];
  polizas?: readonly PolizaSeguro[];
}

/** Una línea del libro de ingresos y gastos (PLAN §5 Fase F). */
export interface LineaLibroAsesor {
  fecha: string; // YYYY-MM-DD
  ejercicio: number;
  tipo: 'INGRESO' | 'GASTO';
  concepto: string;
  inmuebleId: string;
  inmuebleDireccion: string;
  /** Inquilino (ingresos) o proveedor (gastos); '' si no consta. Solo nombre. */
  contraparte: string;
  /** Base imponible: SOLO si hay factura vinculada; si no, null (no se inventa). */
  base: number | null;
  /** Cuota de IVA: solo con factura vinculada; si no, null. */
  iva: number | null;
  /** Retención: solo con factura vinculada que la declare; si no, null. */
  retencion: number | null;
  total: number;
  categoria: string;
  /** null en ingresos; en gastos, la decisión de `analizarDeducibilidad`. */
  deducible: boolean | null;
  /** Origen de la decisión de deducibilidad (vacío en ingresos). */
  origenDeducibilidad: string;
  fuenteTipo: 'COBRO' | 'GASTO';
  fuenteId: string;
  /** Nombre del documento referenciado (sin binario en v1); '' si no consta. */
  documentoNombre: string;
  desgloseFiscal: 'SIN_DESGLOSE_EN_ORIGEN' | 'FACTURA_VINCULADA';
}

export interface IncidenciaPaqueteAsesor {
  codigo: string;
  severidad: 'AVISO' | 'CRITICA';
  descripcion: string;
  entidad?: string;
  id?: string;
}

export interface TotalesEjercicioAsesor {
  ejercicio: number;
  numIngresos: number;
  numGastos: number;
  totalIngresos: number;
  totalGastos: number;
  totalGastosDeducibles: number;
  totalGastosNoDeducibles: number;
  resultado: number; // ingresos - gastos
}

export interface TotalesPaqueteAsesor {
  totalIngresos: number;
  totalGastos: number;
  totalGastosDeducibles: number;
  totalGastosNoDeducibles: number;
  resultado: number;
  porEjercicio: TotalesEjercicioAsesor[];
  /** Suma informativa de netos de liquidación incluidos (NO entra en el libro). */
  totalNetoLiquidacionesIncluidas: number;
}

/** Comprobación de cuadre libro ↔ fuentes computables (puerta de salida). */
export interface VerificacionCuadre {
  nombre: string;
  ok: boolean;
  esperado: number;
  obtenido: number;
}

export interface ManifestPaqueteAsesor {
  /** SHA-256 del contenido canónico (excluye generatedAt: reproducible). */
  paqueteId: string;
  schemaVersion: string;
  /** ISO aportado por el llamante (el motor nunca llama al reloj). */
  generatedAt: string;
  generatedBy: string | null;
  propietariosEfectivos: string[];
  inmueblesEfectivos: string[] | null;
  ejerciciosEfectivos: number[] | null;
  conteos: Record<string, number>;
  totales: TotalesPaqueteAsesor;
  verificaciones: VerificacionCuadre[];
  /** ruta ZIP → sha256 (se completa al empaquetar; el manifest se excluye). */
  hashes: Record<string, string>;
  numIncidencias: number;
  avisos: string[];
  advertencias: string[];
  formatoOficialAEAT: false;
  incluyeBinariosDocumentales: false;
  escrituras: 0;
}

/** Paquete generado (estructurado; listo para empaquetar o inspeccionar). */
export interface PaqueteAsesorGenerado {
  manifest: ManifestPaqueteAsesor;
  libro: LineaLibroAsesor[];
  /** Filas proyectadas por entidad (mismas columnas que su CSV). */
  filas: {
    inmuebles: Record<string, unknown>[];
    contratos: Record<string, unknown>[];
    cobros: (CobroPeriodo & Record<string, unknown>)[];
    gastos: Record<string, unknown>[];
    facturas: Record<string, unknown>[];
    liquidaciones: Record<string, unknown>[];
    polizas: Record<string, unknown>[];
  };
  incidencias: IncidenciaPaqueteAsesor[];
}

export interface ResultadoEmpaquetadoAsesor {
  zip: Uint8Array;
  sha256Zip: string;
  entradas: { ruta: string; sha256: string; bytes: number }[];
}

export type { AmbitoAutorizado };
