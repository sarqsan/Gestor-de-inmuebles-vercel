/**
 * ANALIZADOR DE INVERSIÓN Y VALORACIÓN INMOBILIARIA
 * Modelos independientes de la cartera real (no crean inmueble automáticamente).
 * Aislamiento por propietarioId, persistencia Firestore colección `analisis_inversion`.
 * Todos los cálculos son deterministas, transparentes, sin datos ficticios.
 */

export type EstadoAnalisisInversion = 'BORRADOR' | 'ANALIZADO' | 'CONVERTIDO' | 'ARCHIVADO';
export type TipoEscenarioInversion = 'SIN_REFORMA' | 'CON_REFORMA' | 'PERSONALIZADO';
export type NivelEscenario = 'CONSERVADOR' | 'CENTRAL' | 'FAVORABLE';
export type CategoriaPartidaInversion =
  | 'COCINA'
  | 'BANOS'
  | 'INSTALACIONES'
  | 'PINTURA'
  | 'SUELOS'
  | 'PUERTAS'
  | 'VENTANAS'
  | 'ELECTRICIDAD'
  | 'FONTANERIA'
  | 'CLIMATIZACION'
  | 'MOBILIARIO'
  | 'OTROS'
  | string;

export interface DatosInmuebleAnalisis {
  // Identificación introducida
  direccion: string; // dato introducido
  ciudad?: string;
  codigoPostal?: string;
  provincia?: string;
  // Características introducidas
  superficie?: number; // m2 dato introducido
  habitaciones?: number;
  banos?: number;
  planta?: string;
  ascensor?: boolean;
  estadoConservacion?: 'nuevo' | 'muy_bueno' | 'bueno' | 'a_reformar' | 'en_obras';
  tipoInmueble?: 'piso' | 'casa' | 'chalet' | 'estudio' | 'atico' | 'duplex' | 'local' | string;
  caracteristicasRelevantes?: string;
  observaciones?: string;
  // Precios introducidos
  precioAnunciado?: number; // precio solicitado
  precioPrevistoCompra?: number; // precio que prevé pagar
  // Fotos/documentación si arquitectura lo permite (Storage refs, no base64)
  fotosUrls?: string[];
  documentacionUrls?: string[];
}

export interface ValoracionAnalisis {
  // Datos introducidos vs calculados
  superficie?: number; // reutiliza de datosInmueble
  precioSolicitado?: number; // dato introducido
  valorEstimadoMercado?: number; // dato introducido o calculado
  precioM2?: number | null; // calculado
  diferenciaPrecioValor?: number | null; // calculado: solicitado - estimado
  diferenciaPct?: number | null;
  // Escenarios
  escenarioConservador?: number;
  escenarioCentral?: number;
  escenarioFavorable?: number;
  // Trazabilidad
  datosSuficientes: boolean;
  mensajeInsuficiencia?: string;
  notas?: string;
  fuente?: string; // manual, comparables, etc.
}

export interface ComparableInversion {
  id: string;
  ubicacion: string;
  superficie?: number;
  precio?: number;
  precioM2?: number | null;
  caracteristicas?: string;
  fecha?: string; // YYYY-MM-DD
  fuente?: string;
  observaciones?: string;
}

export interface CosteCompraAnalisis {
  precioCompra: number; // dato introducido obligatorio para coste total
  impuestos?: number;
  notaria?: number;
  registro?: number;
  gestoria?: number;
  otrosGastos?: number;
  reformaInicial?: number; // si corresponde
  otrosCostes?: number;
  // Calculados
  gastosAdquisicion?: number; // suma impuestos+notaria+registro+gestoria+otros
  costeTotalAdquisicion?: number | null; // precioCompra + gastosAdquisicion + reformaInicial + otrosCostes
  inversionInicialSinFinanciacion?: number | null; // alias costeTotalAdquisicion
}

export interface FinanciacionAnalisis {
  usarFinanciacion: boolean;
  importeFinanciado?: number; // dato introducido
  entrada?: number; // dato introducido o calculado
  tipoInteresAnual?: number;
  plazoMeses?: number;
  cuotaEstimada?: number | null; // calculado
  gastosFinancieros?: number;
  // Calculados
  capitalAportado?: number | null; // costeTotal - importeFinanciado
  costeFinancieroTotal?: number | null; // intereses totales
  flujoCajaMensualFinanciado?: number | null;
}

export interface AlquilerEstimado {
  // Introducidos
  alquilerMensual?: number;
  ocupacionPrevistaPct?: number; // 0-100
  mesesVacancia?: number; // 0-12
  gastosComunidad?: number; // anual o mensual? Definimos anual para cálculo
  ibi?: number; // anual
  seguro?: number; // anual
  mantenimiento?: number; // anual
  otrosGastosAnuales?: number; // anual
  // Calculados
  alquilerAnualBruto?: number | null; // mensual*12
  ingresosBrutosAnuales?: number | null; // anual * ocupación
  gastosAnualesTotales?: number | null;
  ingresosNetosAnuales?: number | null;
  rentabilidadBruta?: number | null; // %
  rentabilidadNeta?: number | null; // %
  flujoCajaAnual?: number | null;
  flujoCajaMensual?: number | null;
}

export interface PartidaReformaInversion {
  id: string;
  categoria: CategoriaPartidaInversion;
  descripcion: string;
  costeEstimado: number;
  observaciones?: string;
}

export interface ReformaAnalisis {
  partidas: PartidaReformaInversion[];
  costeTotalReforma: number | null;
  contingenciaPct?: number; // %
  costeConContingencia?: number | null;
}

export interface ValorDespuesReforma {
  valorAntes?: number;
  valorDespues?: number;
  alquilerAntes?: number; // mensual
  alquilerDespues?: number; // mensual
  // Calculados
  incrementoValor?: number | null;
  incrementoValorPct?: number | null;
  incrementoAlquiler?: number | null;
  incrementoAlquilerPct?: number | null;
  inversionAdicional?: number | null; // coste reforma
  rentabilidadReforma?: number | null; // incrementoValor / inversionAdicional *100 ?
  recuperacionMeses?: number | null;
  recuperacionAnios?: number | null;
}

export interface EscenarioInversionDetalle {
  id: string;
  tipo: TipoEscenarioInversion;
  nombre: string;
  // Datos base
  precioCompra: number;
  gastosAdquisicion: number;
  costeReforma: number;
  inversionTotal: number | null;
  alquilerMensual: number;
  alquilerAnual: number | null;
  gastosAnuales: number;
  ingresosNetos: number | null;
  rentabilidadBruta: number | null;
  rentabilidadNeta: number | null;
  flujoCajaAnual: number | null;
  valorEstimado: number | null;
  incrementoValor?: number | null;
  recuperacionMeses?: number | null;
  // Trazabilidad
  esEstimacion: boolean;
  notas?: string;
}

export interface EscenariosComparables {
  valoracion: {
    conservadora?: number;
    central?: number;
    favorable?: number;
  };
  alquiler: {
    conservador?: number;
    central?: number;
    favorable?: number;
  };
  reforma: {
    previsto?: number;
    superior?: number;
    maximo?: number;
  };
}

export interface ResumenOperacion {
  compraPrecio: number | null;
  gastosAdquisicion: number | null;
  reformaCoste: number | null;
  inversionTotal: number | null;
  valorFinalEstimado: number | null;
  alquilerMensual: number | null;
  alquilerAnual: number | null;
  rentabilidadBruta: number | null;
  rentabilidadNeta: number | null;
  flujoCajaAnual: number | null;
  incrementoValor: number | null;
  recuperacionMeses: number | null;
}

export interface IndicadoresClave {
  rentabilidadBruta: number | null;
  rentabilidadNeta: number | null;
  cashFlowAnual: number | null;
  cashFlowMensual: number | null;
  inversionTotal: number | null;
  diferenciaCompraValoracion: number | null;
  diferenciaCompraValoracionPct: number | null;
  incrementoValorReforma: number | null;
  incrementoAlquilerReforma: number | null;
  retornoReformaPct: number | null;
  plazoRecuperacionMeses: number | null;
  plazoRecuperacionAnios: number | null;
  capitalPropioNecesario: number | null;
}

export interface AnalisisInversion {
  id: string;
  propietarioId: string; // aislamiento
  inmuebleId?: string; // si es existente
  esNuevoInmueble: boolean;
  titulo: string; // ej "Análisis C/ Mayor 5"
  estado: EstadoAnalisisInversion;
  datosInmueble: DatosInmuebleAnalisis;
  valoracion: ValoracionAnalisis;
  comparables: ComparableInversion[];
  costeCompra: CosteCompraAnalisis;
  financiacion?: FinanciacionAnalisis;
  alquiler: AlquilerEstimado;
  reforma: ReformaAnalisis;
  valorDespuesReforma?: ValorDespuesReforma;
  escenarios: EscenarioInversionDetalle[];
  escenariosNiveles?: EscenariosComparables;
  resumen: ResumenOperacion;
  indicadores: IndicadoresClave;
  // Histórico y conversión
  convertidoEnInmuebleId?: string;
  fechaConversion?: string;
  historial?: { id: string; fecha: string; accion: string; detalle?: string }[];
  // Metadatos
  creadoPor?: string;
  creadoPorId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
