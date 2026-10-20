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
  Titularidad,
} from '../../types';
import type { Factura } from '../../types/facturacion';
import type { LiquidacionPropietario } from '../../tesoreria/tipos';
import type { DocumentoPatrimonial } from '../expedienteDocumental/tipos';
import type { AmbitoAutorizado } from '../importExport/contrato';

/** Versión del contrato del paquete (documento interno versionado). */
export const PAQUETE_ASESOR_SCHEMA = 'erp-paquete-asesor-v1';

/**
 * Intervalo de fechas INCLUSIVO `YYYY-MM-DD` (P6). Se suma al filtro anual y
 * mensual ya existente: los tres se aplican en intersección. Un intervalo
 * parcial (p. ej. 15/03–20/06) selecciona por la FECHA del libro o de la
 * factura, no por meses completos, para no incluir movimientos fuera del
 * periodo solicitado.
 */
export interface RangoFechasPaquete {
  desde: string;
  hasta: string;
}

/**
 * Estado de un documento original en el índice del paquete (P6).
 * Solo `INCLUIDO` significa que sus bytes viajan en el ZIP y que la huella
 * SHA-256 registrada se ha verificado al empaquetar. El resto se declara sin
 * ocultarse (nunca se sustituye el original por una transcripción OCR).
 */
export type EstadoDocumentoPaquete =
  | 'PENDIENTE_BINARIO'   // índice construido; el binario aún no se ha leído
  | 'INCLUIDO'            // bytes en el ZIP e huella verificada
  | 'NO_DISPONIBLE'       // el registro de custodia dice que no hay objeto
  | 'SIN_HASH'            // sin huella registrada: no verificable ⇒ no se incluye
  | 'NO_ACCESIBLE'        // Storage/Rules denegó o falló la lectura (se declara)
  | 'INTEGRIDAD_DUDOSA';  // el contenido no coincide con la huella registrada

/** Referencia a un registro canónico del ERP relacionado con un documento. */
export interface ReferenciaRegistroDocumento {
  /** Colección canónica (gastos, cobros, contratos, facturas, polizas_seguros…). */
  entidad: string;
  id: string;
}

/**
 * Entrada del índice documental del paquete. Es una REFERENCIA trazable al
 * documento original custodiado en P2/P3; no es una copia ni un resumen.
 */
export interface DocumentoIndicePaquete {
  documentoId: string;
  inmuebleId: string;
  propietarioId: string;
  tipo: string;
  nombre: string;
  mimeType: string;
  tamanoBytes: number | null;
  /** SHA-256 registrado en la custodia P3 (huella del ORIGINAL). */
  sha256: string | null;
  /**
   * SHA-256 de los bytes realmente incluidos. Debe coincidir con `sha256`;
   * si no coincide el documento NO se incluye (`INTEGRIDAD_DUDOSA`).
   */
  sha256Incluido: string | null;
  /** Ruta relativa dentro del ZIP; null si no se incluyó. */
  rutaZip: string | null;
  referencia: string | null;
  fechaDocumental: string | null;
  fechaIncorporacion: string | null;
  version: number;
  sustituyeA: string | null;
  estado: EstadoDocumentoPaquete;
  /** Código/motivo legible cuando `estado !== 'INCLUIDO'`. */
  motivo: string | null;
  relaciones: ReferenciaRegistroDocumento[];
  origen: 'P3_DOCUMENTOS_PATRIMONIALES';
}

/** Binario original aportado por el llamante (ya leído de Storage). */
export interface DocumentoOriginalPaquete {
  documentoId: string;
  bytes: Uint8Array;
  /** Huella calculada por el llamante; el núcleo la recalcula igualmente. */
  sha256?: string;
}

/** Fallo de lectura de un binario (no se incluye y se declara). */
export interface FalloBinarioPaquete {
  documentoId: string;
  codigo:
    | 'NO_ACCESIBLE'
    | 'OBJETO_AUSENTE'
    | 'SIN_BINARIO'
    | 'TAMANO_EXCESIVO'
    | 'LIMITE_TOTAL'
    | 'ERROR_LECTURA';
  detalle?: string;
}

/** Ficha de inmueble del resumen estructurado (datos registrados, sin inferir). */
export interface FichaInmueblePaquete {
  id: string;
  direccion: string;
  ciudad: string;
  codigoPostal: string;
  referenciaCatastral: string;
  tipoInmueble: string;
  estado: string;
  estadoPatrimonial: string;
  superficie: number | null;
  habitaciones: number | null;
  banos: number | null;
  precio: number | null;
  valorAdquisicion: number | null;
  fechaAdquisicion: string | null;
  valoracionEstimada: number | null;
  porcentajeSueloCatastral: number | null;
  amortizacionAnualDeclarada: number | null;
  rentaMensualDeclarada: number | null;
  fechaRegistroPatrimonial: string | null;
  gastosAnualesDeclarados: {
    comunidad: number | null;
    ibi: number | null;
    reparaciones: number | null;
    seguro: number | null;
    ejercicio: number | null;
  } | null;
  titularidadDeclarada: {
    texto: string;
    porcentajePropietario1: number | null;
    porcentajePropietario2: number | null;
    resuelta: boolean;
  } | null;
  /** Titularidades REGISTRADAS; `porcentajeTitularidad` null = PENDIENTE. */
  titulares: Array<{
    propietarioId: string;
    porcentajeTitularidad: number | null;
    estado: string;
    fechaInicio: string;
    fechaCierre: string | null;
  }>;
}

/**
 * Cobertura fiscal INFORMATIVA: distingue gasto registrado, factura vinculada,
 * justificante de pago y decisión del motor de deducibilidad. No interpreta
 * deducibilidad ni convierte un justificante en movimiento contable.
 */
export interface CoberturaFiscalPaquete {
  gastosRegistrados: number;
  gastosConFacturaVinculada: number;
  gastosSinFacturaVinculada: number;
  gastosConJustificantePagoRegistrado: number;
  gastosDeduciblesSegunMotor: number;
  gastosNoDeduciblesSegunMotor: number;
  documentosTipoFactura: number;
  documentosTipoJustificantePago: number;
}

/** Resumen estructurado (`resumen.json`) — opcional, activado por el llamante. */
export interface ResumenPaqueteAsesor {
  schemaVersion: string;
  generatedAt: string;
  generadoPor: string | null;
  ambito: {
    propietarios: string[];
    inmuebles: string[] | null;
    ejercicios: number[] | null;
    meses: string[] | null;
    rangoFechas: RangoFechasPaquete | null;
  };
  conteos: Record<string, number>;
  totales: TotalesPaqueteAsesor;
  coberturaFiscal: CoberturaFiscalPaquete;
  inmuebles: FichaInmueblePaquete[];
  /** Titularidades registradas incluidas en el paquete (porcentaje tal cual). */
  titularidades: Array<{
    id: string;
    inmuebleId: string;
    propietarioId: string;
    porcentajeTitularidad: number | null;
    estado: string;
    fechaInicio: string;
    fechaCierre: string | null;
    origen: 'TITULARIDAD_REGISTRADA';
  }>;
  documentos: {
    indice: DocumentoIndicePaquete[];
    incluidos: number;
    noIncluidos: number;
    limitacion: string;
  };
  limitaciones: string[];
}

/** Lo que el usuario pide (espejo multi-entidad de `AmbitoExportacionSolicitado`). */
export interface SolicitudPaqueteAsesor {
  /** Propietarios solicitados; vacío = todos los legibles (master: prohibido). */
  propietarioIds: readonly string[];
  /** Inmuebles solicitados; vacío/ausente = todos los de los propietarios efectivos. */
  inmuebleIds?: readonly string[];
  /** Ejercicios (años); vacío/ausente = todos (con aviso en el manifest). */
  ejercicios?: readonly number[];
  /**
   * Meses concretos `YYYY-MM` (continuación aislada). Semántica en `motor.ts`:
   * refinan los ejercicios (intersección, como el exportador canónico);
   * si un mes pertenece a un año fuera de `ejercicios`, la solicitud se
   * deniega por contradictoria en vez de producir un paquete vacío en silencio.
   * Vacío/ausente = sin filtro mensual.
   */
  meses?: readonly string[];
  /**
   * P6 — intervalo de fechas INCLUSIVO (`YYYY-MM-DD`) para seleccionar por la
   * fecha del movimiento/factura (no por meses completos). Se aplica en
   * intersección con `ejercicios` y `meses`; una combinación contradictoria se
   * deniega en vez de devolver un paquete vacío en silencio.
   */
  rangoFechas?: RangoFechasPaquete;
  /** Entidades documentales opcionales a incluir cuando haya datos. */
  incluirPolizas?: boolean; // por defecto true («y PÓLIZA si procede»)
  incluirLiquidaciones?: boolean; // por defecto true
  incluirFacturas?: boolean; // por defecto true
  /**
   * P6 — incorporar el índice de documentos originales custodiados (P3) y sus
   * binarios cuando Storage lo autorice. Por defecto **false** para no cambiar
   * el contrato de los paquetes existentes; la interfaz lo activa.
   */
  incluirDocumentos?: boolean;
  /** P6 — tipos documentales solicitados; vacío/ausente = todos. */
  tiposDocumento?: readonly string[];
  /**
   * P6 — añadir `resumen.json` con fichas de inmueble, titularidades
   * registradas y cobertura fiscal informativa. Por defecto **false** (los
   * paquetes anteriores mantienen 12 entradas exactas).
   */
  incluirResumenEstructurado?: boolean;
}

/** Ámbito efectivo tras validar (defensa en profundidad; las Rules mandan). */
export interface VeredictoAmbitoPaquete {
  ok: boolean;
  error?: string;
  propietariosEfectivos: string[];
  /** null = todos los inmuebles de los propietarios efectivos. */
  inmueblesEfectivos: string[] | null;
  /** Ejercicios efectivos ordenados; null = sin filtro anual. */
  ejerciciosEfectivos: number[] | null;
  /** Meses efectivos `YYYY-MM` ordenados; null = sin filtro mensual. */
  mesesEfectivos: string[] | null;
  /** Intervalo de fechas efectivo; null = sin filtro por fechas. */
  rangoFechasEfectivo: RangoFechasPaquete | null;
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
  /** P6 — titularidades registradas (porcentaje tal cual; null = PENDIENTE). */
  titularidades?: readonly Titularidad[];
  /**
   * P6 — documentos originales custodiados en `documentos_patrimoniales`
   * (P3). Solo metadatos: los bytes los lee el adaptador con Storage y se
   * verifican al empaquetar. `undefined` = no se aportaron (se declara).
   */
  documentosPatrimoniales?: readonly DocumentoPatrimonial[];
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
  /**
   * Nombre del documento REFERENCIADO (sin binario en v1); '' si no consta.
   * Una referencia por nombre NO prueba que el original exista ni que esté
   * disponible: cada línea con referencia genera además la incidencia
   * `DOCUMENTO_SIN_BINARIO_VERIFICABLE`.
   */
  documentoNombre: string;
  /**
   * `FACTURA_INCONSISTENTE`: hay factura vinculada pero su desglose no cuadra
   * (`base + IVA - retención != importeTotal`, fórmula del motor de
   * facturación del ERP) o no es utilizable; base/IVA quedan a null.
   */
  desgloseFiscal: 'SIN_DESGLOSE_EN_ORIGEN' | 'FACTURA_VINCULADA' | 'FACTURA_INCONSISTENTE';
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

/** Mismos agregados que por ejercicio, agrupados por `YYYY-MM` de la fecha del libro. */
export interface TotalesMesAsesor {
  mes: string; // YYYY-MM
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
  /** Desglose mensual (derivada de `fecha` de cada línea; recalculable por el verificador). */
  porMes: TotalesMesAsesor[];
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
  /**
   * Meses efectivos `YYYY-MM` (campo aditivo de la continuación; los paquetes
   * generados por el commit `60bb0c5` no lo traen y el verificador los trata
   * como `null` con advertencia de manifiesto heredado).
   */
  mesesEfectivos: string[] | null;
  /**
   * P6 — intervalo de fechas efectivo (inclusivo). Los paquetes anteriores no
   * lo traen y el verificador los interpreta como `null` (sin filtro).
   */
  rangoFechasEfectivo?: RangoFechasPaquete | null;
  conteos: Record<string, number>;
  totales: TotalesPaqueteAsesor;
  verificaciones: VerificacionCuadre[];
  /** ruta ZIP → sha256 (se completa al empaquetar; el manifest se excluye). */
  hashes: Record<string, string>;
  numIncidencias: number;
  avisos: string[];
  advertencias: string[];
  formatoOficialAEAT: false;
  /**
   * `true` solo si el ZIP incorpora al menos un documento original con huella
   * verificada. Un índice con documentos no accesibles NO activa la bandera.
   */
  incluyeBinariosDocumentales: boolean;
  /**
   * P6 — índice de documentos originales custodiados (P3). Se completa al
   * empaquetar con el estado definitivo de cada uno. Los paquetes anteriores
   * no lo traen (se interpreta como lista vacía).
   */
  documentos?: DocumentoIndicePaquete[];
  numDocumentosIncluidos?: number;
  numDocumentosNoIncluidos?: number;
  /** P6 — `resumen.json` presente (fichas, titularidades y cobertura). */
  incluyeResumenEstructurado?: boolean;
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
  /** P6 — índice documental (metadatos + estado). */
  documentos: DocumentoIndicePaquete[];
  /** P6 — resumen estructurado, solo si se solicitó. */
  resumen?: ResumenPaqueteAsesor;
}

/** Opciones de empaquetado P6: binarios ya leídos y fallos de lectura. */
export interface OpcionesEmpaquetadoPaqueteAsesor {
  /**
   * Binarios originales por documento. El núcleo recalcula el SHA-256 y solo
   * incluye los que coinciden con la huella registrada en custodia.
   */
  documentosOriginales?: readonly DocumentoOriginalPaquete[];
  /** Documentos que el adaptador no pudo leer (Storage/Rules/tamaño). */
  fallosDocumentos?: readonly FalloBinarioPaquete[];
  /** Forzar el índice `documentos.json` aunque aún no haya binarios. */
  incluirIndiceDocumentos?: boolean;
}

export interface ResultadoEmpaquetadoAsesor {
  zip: Uint8Array;
  sha256Zip: string;
  entradas: { ruta: string; sha256: string; bytes: number }[];
  /** Manifiesto FINAL serializado (con estados documentales definitivos). */
  manifest: ManifestPaqueteAsesor;
  /** Índice documental con estados definitivos. */
  documentos: DocumentoIndicePaquete[];
}

export type { AmbitoAutorizado };
