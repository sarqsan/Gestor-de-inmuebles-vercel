/**
 * Mapping Registry central y único del importador canónico.
 *
 * Campo origen → campo(s) canónico(s), con alias, transformación, tipo,
 * obligatorio/opcional, entidad, versión y procedencia.
 *
 * PROCEDENCIA DE LOS ALIAS (prohibido inventar; cada alias cita su fuente):
 *  · 'ERP:types.ts' — el propio campo canónico (regla 'canonico').
 *  · 'rentasync-v1:B1+FASE2' — esquema histórico documentado en
 *    docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json + docs/FASE2-MAPA-ORIGEN-DESTINO-RENTASYNC.md
 *    con semántica de src/lib/importacion/normalizar.ts (B1).
 *  · 'B4:entidades/resolucion' — alias que el propio motor B4 ya lee
 *    (chequearCompletitud, resolucion, proponerDestino, clasificarFiscal).
 *  · 'O12:test' — alias introducidos únicamente por tests del contrato.
 *
 * Los alias dudosos NO se asumen: van a ALIAS_PENDIENTES documentados.
 * Los campos conocidos SIN destino (B1: agregados, titularidad pendiente)
 * van a CAMPOS_SIN_DESTINO con motivo (no son desconocidos, no se importan).
 *
 * NORMALIZACIÓN DE CABECERAS (INCIDENCIA IMPORTACIÓN INMUEBLES):
 * La búsqueda compara por CLAVE NORMALIZADA (`claveCabecera`), no por
 * igualdad literal. Sin esto, cualquier cabecera con acento, doble espacio,
 * espacio duro (U+00A0), distinta capitalización o símbolos (€, %) se
 * clasificaba como «campo desconocido» aunque existiera un alias equivalente.
 * La normalización es determinista, sin diccionarios ni aproximaciones:
 *   'Dirección Completa' → 'direccion completa'
 *   'Precio Adquisición (€)' → 'precio adquisicion'
 *   '% Propietario 1' → 'propietario 1'
 * Dos claves distintas pueden colisionar sólo si son el mismo campo escrito
 * distinto; en ese caso se devuelven TODAS las entradas que coincidan.
 *
 * PROCEDENCIA 'plantilla-inmuebles-es:v1': cabeceras de la plantilla Excel de
 * inmuebles aportada por el usuario (17 columnas). Cada una se mapea a un
 * campo compatible del modelo o queda declarada en CAMPOS_SIN_DESTINO.
 * Ninguna de ellas inventa datos: los porcentajes y la cotitularidad NO se
 * reparten ni se infieren (ni 50/50 ni 100 %).
 */
import { ESQUEMA_IMPORT_EXPORT_VERSION } from './contrato';
import type { ClaseDatoImportado, EstadoDatoImportado } from '../../types';

export type TipoMapeo = 'string' | 'number' | 'entero' | 'fecha' | 'boolean' | 'categoriaGasto';

export interface AliasMapeo {
  nombre: string;
  procedencia: string;
  /** Transformación con nombre trazable (implementada en normalizar.ts). */
  transformacion?: string;
}

export interface EntradaMapping {
  entidad: string;
  canonico: string;
  tipo: TipoMapeo;
  /** Debe coincidir con los exigidos por B4 `chequearCompletitud` (no duplicar criterio). */
  obligatorio: boolean;
  version: string;
  alias: readonly AliasMapeo[];
}

/**
 * Dato declarado en el origen que se CONSERVA con destino persistente propio
 * (no es un campo del modelo, pero tampoco se descarta).
 *
 * INCIDENCIA (columnas «reconocidas pero no incorporadas»): la plantilla de
 * inmuebles trae 17 columnas y 10 de ellas quedaban en «sin destino» (no se
 * importaban). Cada una tiene aquí un destino real:
 *  · `AGREGADO_ANUAL` → importe anual agregado conservado con categoría y
 *    ejercicio cuando constan; NUNCA se convierte en gastos individuales ni se
 *    suma otra vez a los movimientos detallados.
 *  · `HISTORICO_DECLARADO` → dato histórico declarado (amortización anual,
 *    fecha de registro, renta, % de suelo): se identifica como importado y no
 *    pisa ningún cálculo derivado (p. ej. la amortización fiscal del ERP).
 *  · `RELACION_PENDIENTE` → relación (titularidad, inquilino) cuya identidad
 *    exige resolución humana explícita: el valor original se conserva y queda
 *    PENDIENTE_RESOLUCION; no se infiere ni se reparte nada.
 */
export interface EntradaConservacion {
  entidad: string;
  /** Cabecera/alias tal cual aparece en el archivo. */
  campo: string;
  /** Clave estable de conservación (la usa el registro patrimonial importado). */
  clave: string;
  clase: ClaseDatoImportado;
  /** Tipo de normalización del valor conservado. */
  tipo: 'string' | 'number' | 'porcentaje';
  /** Categoría cuando el propio campo la determina (agregados de gasto). */
  categoria?: string;
  /** Relación declarada que exige resolución humana. */
  relacion?: 'TITULARIDAD_TEXTO' | 'TITULARIDAD_PORCENTAJE' | 'INQUILINO_NOMBRE' | 'INQUILINO_DNI';
  /** Ranura de titularidad (1|2) cuando el campo es un porcentaje declarado. */
  ranura?: number;
  /** Estado con el que nace el dato conservado. */
  estado: EstadoDatoImportado;
  procedencia: string;
  motivo: string;
}

const V = ESQUEMA_IMPORT_EXPORT_VERSION;
const RENTASYNC = 'rentasync-v1:B1+FASE2' as const;
/** Traducciones directas del modelo ERP al castellano (mismo campo, otro idioma). */
const ES = 'ERP:tipos-es' as const;
/** Cabeceras de la plantilla Excel de inmuebles aportada por el usuario. */
const PLANTILLA_INMUEBLES = 'plantilla-inmuebles-es:v1' as const;

/**
 * Clave normalizada de una cabecera/campo. Determinista y sin diccionarios:
 * quita acentos, símbolos y espacios sobrantes (incluido el espacio duro que
 * Excel/Google Sheets insertan al exportar).
 */
export function claveCabecera(campo: string): string {
  return campo
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const REGISTRO_MAPPINGS: readonly EntradaMapping[] = [
  // ================= GASTO =================
  {
    entidad: 'GASTO', canonico: 'importe', tipo: 'number', obligatorio: true, version: V,
    alias: [{ nombre: 'amount', procedencia: RENTASYNC, transformacion: 'redondeo2' }],
  },
  {
    entidad: 'GASTO', canonico: 'fechaDevengo', tipo: 'fecha', obligatorio: true, version: V,
    alias: [
      { nombre: 'date', procedencia: RENTASYNC, transformacion: 'fechaISOoDMY' },
      { nombre: 'fecha', procedencia: 'B4:entidades', transformacion: 'fechaISOoDMY' },
    ],
  },
  {
    entidad: 'GASTO', canonico: 'categoria', tipo: 'categoriaGasto', obligatorio: true, version: V,
    alias: [{ nombre: 'category', procedencia: RENTASYNC, transformacion: 'tablaB1' }],
  },
  {
    entidad: 'GASTO', canonico: 'concepto', tipo: 'string', obligatorio: true, version: V,
    alias: [{ nombre: 'description', procedencia: RENTASYNC }],
  },
  { entidad: 'GASTO', canonico: 'propertyId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'inmuebleId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'propietarioId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'contratoId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'proveedor', tipo: 'string', obligatorio: false, version: V, alias: [] },
  {
    entidad: 'GASTO', canonico: 'deducible', tipo: 'boolean', obligatorio: false, version: V,
    alias: [{ nombre: 'esDeducible', procedencia: 'ERP:types.ts' }],
  },
  { entidad: 'GASTO', canonico: 'ejercicioFiscal', tipo: 'entero', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'periodoMesAnio', tipo: 'string', obligatorio: false, version: V, alias: [] },
  {
    entidad: 'GASTO', canonico: 'fechaPago', tipo: 'fecha', obligatorio: false, version: V,
    alias: [],
  },
  { entidad: 'GASTO', canonico: 'metodoPago', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'notas', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'receiptName', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'receiptType', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'GASTO', canonico: 'receiptUrl', tipo: 'string', obligatorio: false, version: V, alias: [] },
  // ================= COBRO =================
  {
    entidad: 'COBRO', canonico: 'importe', tipo: 'number', obligatorio: true, version: V,
    alias: [{ nombre: 'amount', procedencia: RENTASYNC, transformacion: 'redondeo2' }],
  },
  { entidad: 'COBRO', canonico: 'mes', tipo: 'entero', obligatorio: true, version: V, alias: [] },
  { entidad: 'COBRO', canonico: 'anio', tipo: 'entero', obligatorio: true, version: V, alias: [] },
  {
    entidad: 'COBRO', canonico: 'concepto', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'description', procedencia: RENTASYNC }],
  },
  { entidad: 'COBRO', canonico: 'propertyId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'COBRO', canonico: 'inmuebleId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'COBRO', canonico: 'contratoId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'COBRO', canonico: 'propietarioId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'COBRO', canonico: 'inquilinoId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  {
    entidad: 'COBRO', canonico: 'fechaPago', tipo: 'fecha', obligatorio: false, version: V,
    alias: [{ nombre: 'date', procedencia: RENTASYNC, transformacion: 'fechaISOoDMY' }],
  },
  { entidad: 'COBRO', canonico: 'metodoPago', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'COBRO', canonico: 'observaciones', tipo: 'string', obligatorio: false, version: V, alias: [] },
  // ================= INMUEBLE =================
  {
    entidad: 'INMUEBLE', canonico: 'direccion', tipo: 'string', obligatorio: true, version: V,
    alias: [
      { nombre: 'address', procedencia: RENTASYNC, transformacion: 'trim' },
      // INCIDENCIA: la plantilla del usuario trae la dirección completa en una
      // sola columna. `direccionCompleta` separa SOLO el código postal y la
      // ciudad cuando aparecen explícitos al final (', 03001 Alicante'); si no
      // hay ese patrón, la dirección se conserva íntegra (nunca se recorta).
      { nombre: 'Dirección Completa', procedencia: PLANTILLA_INMUEBLES, transformacion: 'direccionCompleta' },
      { nombre: 'Direccion Completa', procedencia: PLANTILLA_INMUEBLES, transformacion: 'direccionCompleta' },
      { nombre: 'Dirección', procedencia: ES, transformacion: 'trim' },
      { nombre: 'Domicilio', procedencia: ES, transformacion: 'trim' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'ciudad', tipo: 'string', obligatorio: false, version: V,
    alias: [
      { nombre: 'Ciudad', procedencia: ES, transformacion: 'trim' },
      { nombre: 'Municipio', procedencia: ES, transformacion: 'trim' },
      { nombre: 'Localidad', procedencia: ES, transformacion: 'trim' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'referenciaCatastral', tipo: 'string', obligatorio: false, version: V,
    alias: [
      { nombre: 'cadastralReference', procedencia: RENTASYNC, transformacion: 'trim' },
      { nombre: 'Referencia Catastral', procedencia: PLANTILLA_INMUEBLES, transformacion: 'trim' },
      { nombre: 'Referencia Catastral ', procedencia: PLANTILLA_INMUEBLES, transformacion: 'trim' },
      { nombre: 'Ref Catastral', procedencia: ES, transformacion: 'trim' },
    ],
  },
  // Campos del propio modelo que el exportador ya emite con su nombre
  // canónico: cerrar el viaje exportación → importación sin «desconocidos»
  // fantasma (no se traduce nada, es el mismo campo).
  { entidad: 'INMUEBLE', canonico: 'propietarioPrincipalId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'INMUEBLE', canonico: 'estado', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'INMUEBLE', canonico: 'tipoInmueble', tipo: 'string', obligatorio: false, version: V, alias: [] },
  {
    // Identificador del titular destino declarado POR COLUMNA. Sólo se admiten
    // cabeceras inequívocamente de identificador (nunca 'Propietario' a secas,
    // que suele traer el nombre en texto libre y podría inventar un destino).
    entidad: 'INMUEBLE', canonico: 'propietarioId', tipo: 'string', obligatorio: false, version: V,
    alias: [
      { nombre: 'ID Propietario', procedencia: PLANTILLA_INMUEBLES, transformacion: 'trim' },
      { nombre: 'Id Propietario', procedencia: PLANTILLA_INMUEBLES, transformacion: 'trim' },
      { nombre: 'Propietario ID', procedencia: PLANTILLA_INMUEBLES, transformacion: 'trim' },
    ],
  },
  {
    // INCIDENCIA (semántica verificada): la columna «Renta Mensual (€)» NO se mapea a
    // `precio` ni a `rentaMensual`. `precio` alimenta la ficha pública (publicar
    // la renta declarada sería publicar un anuncio) y `rentaMensual` es la renta
    // vigente de explotación; la fila sólo DECLARA una renta, que se conserva en
    // `rentaMensualDeclarada` (campo propio, verificable). El alias `monthlyRent`
    // de Rentasync (fuente externa con adaptador propio) se mantiene.
    entidad: 'INMUEBLE', canonico: 'precio', tipo: 'number', obligatorio: false, version: V,
    alias: [{ nombre: 'monthlyRent', procedencia: RENTASYNC, transformacion: 'redondeo2' }],
  },
  {
    entidad: 'INMUEBLE', canonico: 'rentaMensual', tipo: 'number', obligatorio: false, version: V,
    alias: [{ nombre: 'monthlyRent', procedencia: RENTASYNC, transformacion: 'redondeo2' }],
  },
  {
    // Renta DECLARADA por el archivo (equivalente a `monthlyRent` del Gestor
    // Patrimonial de referencia). Se persiste y se puede releer; no se mezcla
    // con la renta vigente ni con el precio de publicación.
    entidad: 'INMUEBLE', canonico: 'rentaMensualDeclarada', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: 'Renta Mensual (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'redondeo2' },
      { nombre: 'Renta Mensual', procedencia: PLANTILLA_INMUEBLES, transformacion: 'redondeo2' },
      // `monthlyRent` del Gestor Patrimonial de referencia es la renta DECLARADA
      // del activo (`Property.monthlyRent`): se conserva y se persiste como tal.
      // Además mantiene su 1→N histórico hacia `precio`/`rentaMensual`, pero el
      // alta patrimonial NO escribe esos dos (publicación/explotación): sin este
      // alias, la renta de un respaldo real quedaba sólo en la evidencia del
      // dry-run y se perdía en la ficha importada.
      { nombre: 'monthlyRent', procedencia: RENTASYNC, transformacion: 'redondeo2' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'valorAdquisicion', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: 'purchasePrice', procedencia: RENTASYNC, transformacion: 'redondeo2' },
      { nombre: 'Precio Adquisición (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'redondeo2' },
      { nombre: 'Precio de Adquisición', procedencia: ES, transformacion: 'redondeo2' },
      { nombre: 'Valor Adquisición', procedencia: ES, transformacion: 'redondeo2' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'valoracionEstimada', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: 'currentValue', procedencia: RENTASYNC, transformacion: 'redondeo2' },
      { nombre: 'Valoración Estimada', procedencia: ES, transformacion: 'redondeo2' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'fechaAdquisicion', tipo: 'fecha', obligatorio: false, version: V,
    alias: [
      // NOTA (verificación semántica): la fuente externa documentó
      // `registrationDate` como fecha de adquisición en su día (FASE 2 I-04,
      // clasificación B). Sin embargo, el Gestor Patrimonial de referencia —que
      // importa sus propios archivos— lo trata como FECHA DE REGISTRO, y la
      // plantilla en español lo confirma: son dos hechos distintos. Por eso el
      // alias homónimo va a `fechaRegistroPatrimonial` y la adquisición sólo se
      // escribe cuando la fuente la declara con su nombre (`Fecha Adquisición`,
      // `purchaseDate`). Cualquier fecha de registro NO se convierte en
      // adquisición: cada una tiene su campo.
      { nombre: 'purchaseDate', procedencia: RENTASYNC, transformacion: 'fechaISOoDMY' },
      { nombre: 'fechaCompra', procedencia: ES, transformacion: 'fechaISOoDMY' },
      { nombre: 'Fecha Adquisición', procedencia: ES, transformacion: 'fechaISOoDMY' },
      { nombre: 'Fecha de Adquisición', procedencia: ES, transformacion: 'fechaISOoDMY' },
    ],
  },
  {
    // INCIDENCIA (verificación semántica): «Fecha Registro» de la plantilla NO
    // es la fecha de adquisición. Son dos hechos distintos (registro
    // patrimonial vs. adquisición) y equipararlos falseaba `fechaAdquisicion`
    // (dato del que dependen valoraciones e informes). Tiene campo propio.
    entidad: 'INMUEBLE', canonico: 'fechaRegistroPatrimonial', tipo: 'fecha', obligatorio: false, version: V,
    alias: [
      { nombre: 'Fecha Registro', procedencia: PLANTILLA_INMUEBLES, transformacion: 'fechaISOoDMY' },
      { nombre: 'Fecha de Registro', procedencia: PLANTILLA_INMUEBLES, transformacion: 'fechaISOoDMY' },
      { nombre: 'registrationDate', procedencia: RENTASYNC, transformacion: 'fechaDMYdiaPrimer' },
      { nombre: 'fechaRegistro', procedencia: ES, transformacion: 'fechaISOoDMY' },
    ],
  },
  {
    // INCIDENCIA (verificación semántica): el porcentaje de suelo catastral
    // tenía destino declarado inexistente. Campo patrimonial propio, validado
    // (0–100]; un valor fuera de rango no se corrige: no se escribe y el
    // original queda conservado con su motivo. Equivale a `landValuePercent` del
    // Gestor Patrimonial de referencia.
    entidad: 'INMUEBLE', canonico: 'porcentajeSueloCatastral', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: '% Suelo Catastral', procedencia: PLANTILLA_INMUEBLES, transformacion: 'porcentaje0a100' },
      { nombre: 'Porcentaje Suelo Catastral', procedencia: PLANTILLA_INMUEBLES, transformacion: 'porcentaje0a100' },
      { nombre: 'landValuePercent', procedencia: RENTASYNC, transformacion: 'porcentaje0a100' },
    ],
  },
  {
    // Amortización ANUAL DECLARADA por el origen (equivalente a
    // `amortizationAmount` del Gestor Patrimonial). Se identifica como importada:
    // NO se escribe en ningún cálculo fiscal derivado (el ERP calcula el suyo) ni
    // se duplica en movimientos.
    entidad: 'INMUEBLE', canonico: 'amortizacionAnualDeclarada', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: 'Amortización Anual (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'redondeo2' },
      { nombre: 'Amortizacion Anual (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'redondeo2' },
      { nombre: 'Amortización Anual', procedencia: PLANTILLA_INMUEBLES, transformacion: 'redondeo2' },
      { nombre: 'amortizationAmount', procedencia: RENTASYNC, transformacion: 'redondeo2' },
    ],
  },
  {
    // AGREGADOS ANUALES de gasto declarados. Cada columna se fusiona en el
    // objeto `gastosAnualesDeclarados` (no se sobrescriben entre sí) y NUNCA se
    // convierte en gastos individuales (no tienen fecha ni devengo) ni se suma
    // al detalle. Equivalen a expensesCommunity/IBI/Insurance/Repairs del
    // Gestor Patrimonial de referencia.
    entidad: 'INMUEBLE', canonico: 'gastosAnualesDeclarados', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: 'Gastos Comunidad (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:comunidad' },
      { nombre: 'Gastos Comunidad', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:comunidad' },
      { nombre: 'expensesCommunity', procedencia: RENTASYNC, transformacion: 'agregadoAnual:comunidad' },
      { nombre: 'Gastos IBI (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:ibi' },
      { nombre: 'Gastos IBI', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:ibi' },
      { nombre: 'expensesIBI', procedencia: RENTASYNC, transformacion: 'agregadoAnual:ibi' },
      { nombre: 'Gastos Reparaciones (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:reparaciones' },
      { nombre: 'Gastos Reparaciones', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:reparaciones' },
      { nombre: 'expensesRepairs', procedencia: RENTASYNC, transformacion: 'agregadoAnual:reparaciones' },
      { nombre: 'Gastos Seguro (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:seguro' },
      { nombre: 'Gastos Seguros (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:seguro' },
      { nombre: 'Gastos Seguro', procedencia: PLANTILLA_INMUEBLES, transformacion: 'agregadoAnual:seguro' },
      { nombre: 'expensesInsurance', procedencia: RENTASYNC, transformacion: 'agregadoAnual:seguro' },
      // Nombres que emite NUESTRO exportador para cada agregado: el archivo
      // exportado se puede reimportar sin perder los agregados anuales
      // (ida y vuelta real, ver `exportador.ts`).
      { nombre: 'gastosAnualesDeclarados.comunidad', procedencia: ES, transformacion: 'agregadoAnual:comunidad' },
      { nombre: 'gastosAnualesDeclarados.ibi', procedencia: ES, transformacion: 'agregadoAnual:ibi' },
      { nombre: 'gastosAnualesDeclarados.reparaciones', procedencia: ES, transformacion: 'agregadoAnual:reparaciones' },
      { nombre: 'gastosAnualesDeclarados.seguro', procedencia: ES, transformacion: 'agregadoAnual:seguro' },
    ],
  },
  {
    // Ejercicio declarado de la fila: identifica el año de los agregados
    // anuales conservados. Si no consta, el ejercicio queda `null` (jamás se
    // inventa un año).
    entidad: 'INMUEBLE', canonico: 'ejercicioDeclarado', tipo: 'entero', obligatorio: false, version: V,
    alias: [
      { nombre: 'Ejercicio', procedencia: PLANTILLA_INMUEBLES },
      { nombre: 'Año', procedencia: PLANTILLA_INMUEBLES },
      { nombre: 'Anio', procedencia: PLANTILLA_INMUEBLES },
      { nombre: 'Ejercicio Fiscal', procedencia: PLANTILLA_INMUEBLES },
      { nombre: 'year', procedencia: ES },
    ],
  },
  {
    // INCIDENCIA (verificación semántica): «Inquilino» de la plantilla es un
    // NOMBRE DECLARADO en texto libre, no el inquilino actual de la vivienda.
    // Escribirlo como `inquilinoActualNombre` afirmaba un arrendamiento que el
    // archivo no acredita; ahora se conserva como relación pendiente de
    // resolución (ver CAMPOS_CONSERVADOS). Los alias que sí afirman el estado
    // actual («Inquilino Actual», y `tenantName` de Rentasync) se mantienen.
    entidad: 'INMUEBLE', canonico: 'inquilinoActualNombre', tipo: 'string', obligatorio: false, version: V,
    alias: [
      { nombre: 'tenantName', procedencia: RENTASYNC, transformacion: 'primerInquilino' },
      { nombre: 'Inquilino Actual', procedencia: ES, transformacion: 'primerInquilino' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'codigoPostal', tipo: 'string', obligatorio: false, version: V,
    alias: [
      { nombre: 'Código Postal', procedencia: ES, transformacion: 'trim' },
      { nombre: 'Codigo Postal', procedencia: ES, transformacion: 'trim' },
      { nombre: 'CP', procedencia: ES, transformacion: 'trim' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'superficie', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: 'Superficie (m²)', procedencia: ES, transformacion: 'redondeo2' },
      { nombre: 'Superficie m2', procedencia: ES, transformacion: 'redondeo2' },
      { nombre: 'Superficie', procedencia: ES, transformacion: 'redondeo2' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'habitaciones', tipo: 'entero', obligatorio: false, version: V,
    alias: [
      { nombre: 'Habitaciones', procedencia: ES },
      { nombre: 'Dormitorios', procedencia: ES },
    ],
  },
  // ================= PROPIETARIO =================
  {
    entidad: 'PROPIETARIO', canonico: 'nombre', tipo: 'string', obligatorio: true, version: V,
    alias: [
      { nombre: 'Nombre', procedencia: ES, transformacion: 'trim' },
      { nombre: 'Nombre completo', procedencia: ES, transformacion: 'trim' },
      { nombre: 'Titular', procedencia: ES, transformacion: 'trim' },
    ],
  },
  {
    entidad: 'PROPIETARIO', canonico: 'nifCif', tipo: 'string', obligatorio: false, version: V,
    alias: [
      { nombre: 'nif', procedencia: 'B4:entidades' },
      { nombre: 'cif', procedencia: 'B4:entidades' },
      { nombre: 'NIF', procedencia: ES, transformacion: 'trim' },
      { nombre: 'NIF/CIF', procedencia: ES, transformacion: 'trim' },
      { nombre: 'DNI', procedencia: ES, transformacion: 'trim' },
    ],
  },
  {
    entidad: 'PROPIETARIO', canonico: 'email', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'Email', procedencia: ES, transformacion: 'trim' }, { nombre: 'Correo', procedencia: ES, transformacion: 'trim' }],
  },
  {
    entidad: 'PROPIETARIO', canonico: 'telefono', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'Teléfono', procedencia: ES, transformacion: 'trim' }, { nombre: 'Telefono', procedencia: ES, transformacion: 'trim' }],
  },
  {
    entidad: 'PROPIETARIO', canonico: 'direccion', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'Dirección', procedencia: ES, transformacion: 'trim' }, { nombre: 'Domicilio', procedencia: ES, transformacion: 'trim' }],
  },
  {
    entidad: 'PROPIETARIO', canonico: 'ciudad', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'Ciudad', procedencia: ES, transformacion: 'trim' }],
  },
  {
    entidad: 'PROPIETARIO', canonico: 'codigoPostal', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'Código Postal', procedencia: ES, transformacion: 'trim' }, { nombre: 'CP', procedencia: ES, transformacion: 'trim' }],
  },
  // ================= CONTRATO =================
  { entidad: 'CONTRATO', canonico: 'inmuebleId', tipo: 'string', obligatorio: true, version: V, alias: [] },
  { entidad: 'CONTRATO', canonico: 'propietarioId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'CONTRATO', canonico: 'candidatoId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'CONTRATO', canonico: 'inquilinoId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  {
    entidad: 'CONTRATO', canonico: 'fechaInicio', tipo: 'fecha', obligatorio: false, version: V,
    alias: [{ nombre: 'startDate', procedencia: 'O12:test', transformacion: 'fechaISOoDMY' }],
  },
  {
    entidad: 'CONTRATO', canonico: 'fechaFin', tipo: 'fecha', obligatorio: false, version: V,
    alias: [{ nombre: 'endDate', procedencia: 'O12:test', transformacion: 'fechaISOoDMY' }],
  },
  { entidad: 'CONTRATO', canonico: 'rentaMensual', tipo: 'number', obligatorio: false, version: V, alias: [] },
  // ================= DOCUMENTO =================
  {
    entidad: 'DOCUMENTO', canonico: 'nombreOriginal', tipo: 'string', obligatorio: true, version: V,
    alias: [
      { nombre: 'receiptName', procedencia: 'B4:entidades' },
      { nombre: 'nombre', procedencia: 'B4:entidades' },
    ],
  },
  {
    entidad: 'DOCUMENTO', canonico: 'rutaOriginal', tipo: 'string', obligatorio: true, version: V,
    alias: [
      { nombre: 'receiptUrl', procedencia: 'B4:entidades' },
      { nombre: 'ruta', procedencia: 'B4:entidades' },
    ],
  },
  {
    entidad: 'DOCUMENTO', canonico: 'tipo', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'receiptType', procedencia: 'B4:entidades' }],
  },
  { entidad: 'DOCUMENTO', canonico: 'propietarioId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'DOCUMENTO', canonico: 'entidadRef', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'DOCUMENTO', canonico: 'entidadId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  // ================= LEGACY_STORAGE =================
  {
    entidad: 'LEGACY_STORAGE', canonico: 'rutaOrigen', tipo: 'string', obligatorio: true, version: V,
    alias: [{ nombre: 'ruta', procedencia: 'B4:entidades' }],
  },
];

/**
 * Campos CONOCIDOS sin destino en el ERP (semántica B1, no desconocidos):
 * no se importan, no rompen, quedan documentados con motivo.
 */
export const CAMPOS_SIN_DESTINO: ReadonlyArray<{ entidad: string; campo: string; motivo: string; procedencia: string }> = [
  { entidad: 'INMUEBLE', campo: 'owner', motivo: 'user1/user2 exige mapeo documentado user→propietarioId (nunca asumido); la resolución va por catálogos/mapeos B4', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'expenses', motivo: 'AGREGADO anual: se conserva como dato declarado importado (ver CAMPOS_CONSERVADOS), nunca como detalle duplicado', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'yearlyFinancials', motivo: 'resumen anual derivado; el ERP lo recalcula (B1 clase D)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'tenantHistory', motivo: 'sin entidad de histórico de inquilinos en el ERP (B1 clase D, INC-11)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'contract', motivo: 'subcampos REQUIERE_MAPEO hacia CONTRATO (B1 I-13); no se aplana automáticamente', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'mortgage*', motivo: 'prefijo mortgage* → PRESTAMO, sin adaptador seguro en v1 (B1 I-16)', procedencia: RENTASYNC },
  { entidad: 'GASTO', campo: 'type', motivo: 'discriminante de entidad (gasto/ingreso), no dato canónico', procedencia: RENTASYNC },
  { entidad: 'COBRO', campo: 'type', motivo: 'discriminante de entidad (gasto/ingreso), no dato canónico', procedencia: RENTASYNC },
  { entidad: 'GASTO', campo: 'id', motivo: 'identidad de origen: va a sourceRecordId/proveniencia, no a datos', procedencia: RENTASYNC },
  { entidad: 'COBRO', campo: 'id', motivo: 'identidad de origen: va a sourceRecordId/proveniencia, no a datos', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'id', motivo: 'identidad de origen: va a sourceRecordId/proveniencia, no a datos', procedencia: RENTASYNC },
];

/**
 * Columnas CONOCIDAS que se CONSERVAN con destino persistente (no se pierden ni
 * se inventan). Sustituyen a las antiguas entradas «sin destino» de la
 * plantilla de inmuebles (INCIDENCIA: 10 de 17 columnas quedaban reconocidas
 * pero sin incorporar).
 *
 * Reglas que esta tabla materializa, sin excepción:
 *  · los porcentajes de titularidad NO se reparten ni se asumen (ni 50/50 ni
 *    100 %): sin titular identificado quedan PENDIENTE_RESOLUCION;
 *  · los agregados anuales de gasto NO se convierten en gastos individuales
 *    (no tienen fecha ni devengo) ni se suman a los movimientos;
 *  · la amortización anual declarada NO sobrescribe el cálculo fiscal del ERP:
 *    se conserva identificada como importada;
 *  · el DNI del inquilino NO crea contratos ni vínculos ambiguos.
 */
export const CAMPOS_CONSERVADOS: ReadonlyArray<EntradaConservacion> = [
  {
    entidad: 'INMUEBLE', campo: 'Titularidad', clave: 'titularidadDeclarada.texto', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'TITULARIDAD_TEXTO', estado: 'PENDIENTE_RESOLUCION', procedencia: PLANTILLA_INMUEBLES,
    motivo: 'TITULARIDAD declarada en texto libre: se conserva como evidencia y queda PENDIENTE_RESOLUCION hasta que la persona resuelva quién es cada titular (el texto no identifica a nadie)',
  },
  {
    entidad: 'INMUEBLE', campo: '% Propietario 1', clave: 'titularidadDeclarada.propietario1', clase: 'RELACION_PENDIENTE',
    tipo: 'porcentaje', relacion: 'TITULARIDAD_PORCENTAJE', ranura: 1, estado: 'PENDIENTE_RESOLUCION', procedencia: PLANTILLA_INMUEBLES,
    motivo: 'PORCENTAJE declarado sin titular identificado: se conserva el valor original (nunca se reparte ni se asume el 100 %) y queda PENDIENTE_RESOLUCION hasta que se asigne a un titular existente',
  },
  {
    entidad: 'INMUEBLE', campo: '% Propietario 2', clave: 'titularidadDeclarada.propietario2', clase: 'RELACION_PENDIENTE',
    tipo: 'porcentaje', relacion: 'TITULARIDAD_PORCENTAJE', ranura: 2, estado: 'PENDIENTE_RESOLUCION', procedencia: PLANTILLA_INMUEBLES,
    motivo: 'PORCENTAJE declarado sin titular identificado: se conserva el valor original (nunca se reparte 50/50) y queda PENDIENTE_RESOLUCION hasta que se asigne a un titular existente',
  },
  {
    entidad: 'INMUEBLE', campo: 'ownershipPercentageUser1', clave: 'titularidadDeclarada.propietario1', clase: 'RELACION_PENDIENTE',
    tipo: 'porcentaje', relacion: 'TITULARIDAD_PORCENTAJE', ranura: 1, estado: 'PENDIENTE_RESOLUCION', procedencia: RENTASYNC,
    motivo: 'PORCENTAJE declarado sin titular identificado (user1/user2 exige mapeo documentado): se conserva y queda PENDIENTE_RESOLUCION',
  },
  {
    entidad: 'INMUEBLE', campo: 'ownershipPercentageUser2', clave: 'titularidadDeclarada.propietario2', clase: 'RELACION_PENDIENTE',
    tipo: 'porcentaje', relacion: 'TITULARIDAD_PORCENTAJE', ranura: 2, estado: 'PENDIENTE_RESOLUCION', procedencia: RENTASYNC,
    motivo: 'PORCENTAJE declarado sin titular identificado (user1/user2 exige mapeo documentado): se conserva y queda PENDIENTE_RESOLUCION',
  },
  {
    // `owner` de Rentasync (user1/user2/both) declara a QUÉ ranura pertenece la
    // propiedad, no quién es el titular: se conserva como evidencia textual.
    entidad: 'INMUEBLE', campo: 'owner', clave: 'titularidadDeclarada.texto', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'TITULARIDAD_TEXTO', estado: 'PENDIENTE_RESOLUCION', procedencia: RENTASYNC,
    motivo: 'titularidad declarada como user1/user2/both: se conserva como evidencia y queda PENDIENTE_RESOLUCION (exige mapeo documentado a un titular real)',
  },
  {
    entidad: 'INMUEBLE', campo: 'Inquilino', clave: 'inquilinoDeclarado.nombre', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'INQUILINO_NOMBRE', estado: 'PENDIENTE_RESOLUCION', procedencia: PLANTILLA_INMUEBLES,
    motivo: 'INQUILINO declarado en texto libre: se conserva y queda PENDIENTE_RESOLUCION; NO se escribe como inquilino actual (no se inventa un arrendamiento)',
  },
  {
    entidad: 'INMUEBLE', campo: 'tenantName', clave: 'inquilinoDeclarado.nombre', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'INQUILINO_NOMBRE', estado: 'PENDIENTE_RESOLUCION', procedencia: RENTASYNC,
    motivo: 'INQUILINO declarado por la fuente externa: se conserva y queda PENDIENTE_RESOLUCION (la relación real se crea con contrato/candidato documentado)',
  },
  {
    entidad: 'INMUEBLE', campo: 'DNI Inquilino', clave: 'inquilinoDeclarado.dni', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'INQUILINO_DNI', estado: 'PENDIENTE_RESOLUCION', procedencia: PLANTILLA_INMUEBLES,
    motivo: 'DNI DE INQUILINO declarado: se conserva y queda PENDIENTE_RESOLUCION; sólo se vincula con un contrato/inquilino existente cuando la coincidencia es inequívoca y la confirma una persona (nunca se crean contratos ni vínculos ambiguos)',
  },
  {
    entidad: 'INMUEBLE', campo: 'tenantDni', clave: 'inquilinoDeclarado.dni', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'INQUILINO_DNI', estado: 'PENDIENTE_RESOLUCION', procedencia: RENTASYNC,
    motivo: 'DNI de inquilino de la fuente externa: se conserva y queda PENDIENTE_RESOLUCION (vínculo inequívoco + confirmación humana)',
  },
  // ── Nombres que emite NUESTRO exportador ────────────────────────────────
  // El archivo exportado se reimporta SIN perder lo declarado: cada dato vuelve
  // a quedar declarado (y pendiente lo que exige resolución humana). No se
  // inventa nada: se recupera exactamente lo que el inmueble ya declaraba.
  {
    entidad: 'INMUEBLE', campo: 'titularidadDeclarada.texto', clave: 'titularidadDeclarada.texto', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'TITULARIDAD_TEXTO', estado: 'PENDIENTE_RESOLUCION', procedencia: ES,
    motivo: 'titularidad declarada exportada por el propio ERP: se recupera como evidencia y sigue PENDIENTE_RESOLUCION (el texto no identifica a nadie)',
  },
  {
    entidad: 'INMUEBLE', campo: 'titularidadDeclarada.propietario1', clave: 'titularidadDeclarada.propietario1', clase: 'RELACION_PENDIENTE',
    tipo: 'porcentaje', relacion: 'TITULARIDAD_PORCENTAJE', ranura: 1, estado: 'PENDIENTE_RESOLUCION', procedencia: ES,
    motivo: 'porcentaje declarado exportado por el propio ERP: se recupera tal cual y queda PENDIENTE_RESOLUCION (nunca se reparte)',
  },
  {
    entidad: 'INMUEBLE', campo: 'titularidadDeclarada.propietario2', clave: 'titularidadDeclarada.propietario2', clase: 'RELACION_PENDIENTE',
    tipo: 'porcentaje', relacion: 'TITULARIDAD_PORCENTAJE', ranura: 2, estado: 'PENDIENTE_RESOLUCION', procedencia: ES,
    motivo: 'porcentaje declarado exportado por el propio ERP: se recupera tal cual y queda PENDIENTE_RESOLUCION (nunca se reparte)',
  },
  {
    entidad: 'INMUEBLE', campo: 'inquilinoDeclarado.nombre', clave: 'inquilinoDeclarado.nombre', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'INQUILINO_NOMBRE', estado: 'PENDIENTE_RESOLUCION', procedencia: ES,
    motivo: 'inquilino declarado exportado por el propio ERP: se recupera y sigue PENDIENTE_RESOLUCION (no se crea arrendamiento)',
  },
  {
    entidad: 'INMUEBLE', campo: 'inquilinoDeclarado.dni', clave: 'inquilinoDeclarado.dni', clase: 'RELACION_PENDIENTE',
    tipo: 'string', relacion: 'INQUILINO_DNI', estado: 'PENDIENTE_RESOLUCION', procedencia: ES,
    motivo: 'DNI de inquilino exportado por el propio ERP: se recupera y sigue PENDIENTE_RESOLUCION (vínculo inequívoco + confirmación humana)',
  },
];


/**
 * Cabeceras que IDENTIFICAN EL REGISTRO DE ORIGEN (no son datos del modelo).
 *
 * Van a `proveniencia.sourceRecordId` (y por tanto a la migrationKey y a la
 * detección de duplicados), nunca a un campo canónico: si 'ID Inmueble' se
 * tratara como `inmuebleId` canónico, una fila nueva señalaría un inmueble
 * inexistente en el catálogo y quedaría INCOMPLETO sin poder importarse.
 */
export const ALIAS_IDENTIDAD_ORIGEN: ReadonlyArray<{ nombre: string; entidad: string; procedencia: string }> = [
  { nombre: 'ID Inmueble', entidad: 'INMUEBLE', procedencia: PLANTILLA_INMUEBLES },
  { nombre: 'Id Inmueble', entidad: 'INMUEBLE', procedencia: PLANTILLA_INMUEBLES },
  { nombre: 'Identificador Inmueble', entidad: 'INMUEBLE', procedencia: ES },
  { nombre: 'ID Inmueble ', entidad: 'INMUEBLE', procedencia: PLANTILLA_INMUEBLES },
];

/** ¿Esta cabecera es la identidad de origen de la entidad? (comparación normalizada). */
export function esIdentidadOrigen(entidad: string, campo: string): { procedencia: string } | null {
  const clave = claveCabecera(campo);
  const hallada = ALIAS_IDENTIDAD_ORIGEN.find((a) => a.entidad === entidad && claveCabecera(a.nombre) === clave);
  return hallada ? { procedencia: hallada.procedencia } : null;
}

/**
 * Alias DUDOSOS: documentados como pendientes, NO asumidos.
 * Solo entran al registro con una decisión explícita futura (nueva versión).
 */
export const ALIAS_PENDIENTES: ReadonlyArray<{ campo: string; candidato: string; entidad: string; motivo: string }> = [
  { campo: 'city', candidato: 'ciudad', entidad: 'INMUEBLE', motivo: 'sin fuente real que lo use; asumirlo confundiría ciudad/municipio' },
  { campo: 'phone', candidato: 'telefono', entidad: 'PROPIETARIO', motivo: 'sin fuente real; podría ser móvil/fijo/fax' },
  { campo: 'zip', candidato: 'codigoPostal', entidad: 'INMUEBLE', motivo: 'sin fuente real; formato por país desconocido' },
  { campo: 'postalCode', candidato: 'codigoPostal', entidad: 'INMUEBLE', motivo: 'sin fuente real en el proyecto' },
  { campo: 'rent', candidato: 'precio', entidad: 'INMUEBLE', motivo: 'ambigüedad mensual/anual sin fuente que lo fije' },
  { campo: 'ownerName', candidato: 'nombre', entidad: 'PROPIETARIO', motivo: 'nombre de titular en texto libre: sin regla de identidad' },
  { campo: 'month', candidato: 'mes', entidad: 'COBRO', motivo: 'Rentasync deriva mes/año de la descripción (B1); alias directo sin fuente' },
  { campo: 'year', candidato: 'anio', entidad: 'COBRO', motivo: 'Rentasync deriva mes/año de la descripción (B1); alias directo sin fuente' },
];

export interface ResultadoBusquedaMapeo {
  /** null = sin mapping (desconocido). */
  canonicos: string[];
  regla: string;
  transformacion?: string;
  tipo?: TipoMapeo;
  sinDestino?: { motivo: string };
  /** La cabecera es la identidad de origen del registro (no un dato). */
  identidadOrigen?: { procedencia: string };
  /**
   * El campo se CONSERVA con destino persistente propio (dato declarado
   * importado). Puede coexistir con un mapeo canónico (p. ej. la renta declarada
   * se mapea al modelo de alquiler y además se conserva como histórico).
   */
  conservar?: EntradaConservacion;
  /** Tipo de normalización del valor conservado cuando no hay mapeo canónico. */
  tipoConservado?: 'string' | 'number' | 'porcentaje';
}

const INDICE: Map<string, EntradaMapping[]> = new Map();
for (const e of REGISTRO_MAPPINGS) {
  const lista = INDICE.get(e.entidad) ?? [];
  lista.push(e);
  INDICE.set(e.entidad, lista);
}

/**
 * Índice por CLAVE NORMALIZADA: entidad → clave → entradas que la responden.
 * Una clave puede apuntar a varias entradas (alias 1→N, p. ej. monthlyRent →
 * precio + rentaMensual, y variantes ortográficas del mismo campo).
 */
const INDICE_CLAVES: Map<string, Map<string, EntradaMapping[]>> = new Map();
function indiceClavesDe(entidad: string): Map<string, EntradaMapping[]> {
  let indice = INDICE_CLAVES.get(entidad);
  if (!indice) {
    indice = new Map();
    for (const e of REGISTRO_MAPPINGS) {
      if (e.entidad !== entidad) continue;
      const claves = [claveCabecera(e.canonico), ...e.alias.map((a) => claveCabecera(a.nombre))];
      for (const c of claves) {
        const lista = indice.get(c) ?? [];
        if (!lista.includes(e)) lista.push(e);
        indice.set(c, lista);
      }
    }
    INDICE_CLAVES.set(entidad, indice);
  }
  return indice;
}

/** Índice normalizado de CAMPOS_SIN_DESTINO (mismo criterio de comparación). */
const INDICE_SIN_DESTINO: Map<string, Map<string, (typeof CAMPOS_SIN_DESTINO)[number]>> = new Map();
function indiceSinDestinoDe(entidad: string): Map<string, (typeof CAMPOS_SIN_DESTINO)[number]> {
  let indice = INDICE_SIN_DESTINO.get(entidad);
  if (!indice) {
    indice = new Map();
    for (const s of CAMPOS_SIN_DESTINO) {
      if (s.entidad !== entidad) continue;
      indice.set(claveCabecera(s.campo), s);
    }
    INDICE_SIN_DESTINO.set(entidad, indice);
  }
  return indice;
}

/** Índice normalizado de CAMPOS_CONSERVADOS (mismo criterio de comparación). */
const INDICE_CONSERVADOS: Map<string, Map<string, EntradaConservacion>> = new Map();
function indiceConservadosDe(entidad: string): Map<string, EntradaConservacion> {
  let indice = INDICE_CONSERVADOS.get(entidad);
  if (!indice) {
    indice = new Map();
    for (const c of CAMPOS_CONSERVADOS) {
      if (c.entidad !== entidad) continue;
      indice.set(claveCabecera(c.campo), c);
    }
    INDICE_CONSERVADOS.set(entidad, indice);
  }
  return indice;
}

/** Entrada de conservación declarada para (entidad, campo), si existe. */
export function buscarConservacion(entidad: string, campoOrigen: string): EntradaConservacion | null {
  return indiceConservadosDe(entidad).get(claveCabecera(campoOrigen)) ?? null;
}

/**
 * Busca mapping para (entidad, campoOrigen). Canónico directo incluido y
 * comparación por clave normalizada (acentos, espacios duros, símbolos).
 * Un campo puede tener mapeo canónico Y conservación declarada: en ese caso se
 * devuelven ambos (el valor se escribe en el modelo y además se conserva).
 */
export function buscarMapeo(entidad: string, campoOrigen: string): ResultadoBusquedaMapeo | null {
  const entradas = INDICE.get(entidad) ?? [];
  const conservacion = buscarConservacion(entidad, campoOrigen);
  const conConservacion = (r: ResultadoBusquedaMapeo): ResultadoBusquedaMapeo =>
    conservacion
      ? { ...r, conservar: conservacion, ...(r.canonicos.length === 0 ? { tipoConservado: conservacion.tipo } : {}) }
      : r;
  // 0) Identidad de origen: NO es un dato del modelo, va a proveniencia.
  const identidad = esIdentidadOrigen(entidad, campoOrigen);
  if (identidad) {
    return { canonicos: [], regla: `identidad_origen:${identidad.procedencia}`, identidadOrigen: identidad };
  }
  // 1) Canónico directo (literal y normalizado).
  const directa = entradas.find((e) => e.canonico === campoOrigen);
  if (directa) {
    return conConservacion({ canonicos: [directa.canonico], regla: 'canonico', tipo: directa.tipo });
  }
  // 2) Alias / canónico por clave normalizada (puede ser 1→N).
  const porClave = indiceClavesDe(entidad).get(claveCabecera(campoOrigen)) ?? [];
  if (porClave.length > 0) {
    const destinos: string[] = [];
    let regla = '';
    let transformacion: string | undefined;
    let tipo: TipoMapeo | undefined;
    for (const e of porClave) {
      const canonicoDirecto = claveCabecera(e.canonico) === claveCabecera(campoOrigen);
      const a = e.alias.find((x) => claveCabecera(x.nombre) === claveCabecera(campoOrigen));
      destinos.push(e.canonico);
      // El canónico escrito en otro idioma/formato sigue siendo canónico:
      // conserva la regla 'canonico' para que no lo pise un alias (orden 2
      // pasadas de `aplicarMapping`).
      regla = canonicoDirecto && !a ? 'canonico' : `alias:${(a ?? e.alias[0]).procedencia}`;
      transformacion = a?.transformacion;
      tipo = e.tipo;
    }
    return conConservacion({ canonicos: destinos, regla, transformacion, tipo });
  }
  // 2b) Dato declarado conservado (destino persistente propio, no campo del modelo).
  if (conservacion) {
    return {
      canonicos: [],
      regla: `conservado:${conservacion.clase}`,
      conservar: conservacion,
      tipoConservado: conservacion.tipo,
      transformacion: conservacion.tipo === 'porcentaje' ? 'porcentaje0a100' : undefined,
    };
  }
  // 3) Conocido sin destino (incluye prefijo mortgage*).
  const sinDestino = indiceSinDestinoDe(entidad);
  const clave = claveCabecera(campoOrigen);
  const sin = sinDestino.get(clave)
    ?? [...sinDestino.entries()].find(([, s]) => s.campo.endsWith('*') && clave.startsWith(claveCabecera(s.campo.slice(0, -1))))?.[1];
  if (sin) return { canonicos: [], regla: 'conocido_sin_destino', sinDestino: { motivo: sin.motivo } };
  return null;
}

/** Campos conocidos sin destino declarados para una entidad (para la UI). */
export function camposSinDestinoDeclarados(entidad: string): ReadonlyArray<{ campo: string; motivo: string }> {
  return CAMPOS_SIN_DESTINO.filter((s) => s.entidad === entidad).map((s) => ({ campo: s.campo, motivo: s.motivo }));
}

/**
 * Destinos declarados de las columnas conservadas de una entidad (para la UI de
 * correspondencia): cada columna reconocida tiene aquí su destino (clave de
 * conservación) y su clase. Es la prueba visible de que «reconocida» ya no
 * significa «no incorporada».
 */
export function camposConservadosDeclarados(entidad: string): ReadonlyArray<{
  campo: string;
  clave: string;
  clase: ClaseDatoImportado;
  estado: EstadoDatoImportado;
  categoria?: string;
  ranura?: number;
  motivo: string;
  procedencia: string;
}> {
  return CAMPOS_CONSERVADOS.filter((c) => c.entidad === entidad).map((c) => ({
    campo: c.campo, clave: c.clave, clase: c.clase, estado: c.estado,
    ...(c.categoria ? { categoria: c.categoria } : {}),
    ...(c.ranura ? { ranura: c.ranura } : {}),
    motivo: c.motivo, procedencia: c.procedencia,
  }));
}

/** Campos canónicos obligatorios de una entidad (≡ B4). */
export function camposObligatorios(entidad: string): string[] {
  return (INDICE.get(entidad) ?? []).filter((e) => e.obligatorio).map((e) => e.canonico);
}
