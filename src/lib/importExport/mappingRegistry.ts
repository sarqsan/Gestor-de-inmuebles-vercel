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
    entidad: 'INMUEBLE', canonico: 'precio', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: 'monthlyRent', procedencia: RENTASYNC, transformacion: 'redondeo2' },
      { nombre: 'Renta Mensual (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'redondeo2' },
      { nombre: 'Renta Mensual', procedencia: ES, transformacion: 'redondeo2' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'rentaMensual', tipo: 'number', obligatorio: false, version: V,
    alias: [
      { nombre: 'monthlyRent', procedencia: RENTASYNC, transformacion: 'redondeo2' },
      { nombre: 'Renta Mensual (€)', procedencia: PLANTILLA_INMUEBLES, transformacion: 'redondeo2' },
      { nombre: 'Renta Mensual', procedencia: ES, transformacion: 'redondeo2' },
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
      { nombre: 'registrationDate', procedencia: RENTASYNC, transformacion: 'fechaDMYdiaPrimer' },
      // En la plantilla del usuario, 'Fecha Registro' es la fecha de
      // inscripción/adquisición declarada en la hoja patrimonial (mismo
      // significado que `registrationDate` en Rentasync). Se documenta la
      // equivalencia; no se interpreta ningún otro significado.
      { nombre: 'Fecha Registro', procedencia: PLANTILLA_INMUEBLES, transformacion: 'fechaISOoDMY' },
      { nombre: 'Fecha Adquisición', procedencia: ES, transformacion: 'fechaISOoDMY' },
      { nombre: 'Fecha de Adquisición', procedencia: ES, transformacion: 'fechaISOoDMY' },
    ],
  },
  {
    entidad: 'INMUEBLE', canonico: 'inquilinoActualNombre', tipo: 'string', obligatorio: false, version: V,
    alias: [
      { nombre: 'tenantName', procedencia: RENTASYNC, transformacion: 'primerInquilino' },
      { nombre: 'Inquilino', procedencia: PLANTILLA_INMUEBLES, transformacion: 'primerInquilino' },
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
  { entidad: 'INMUEBLE', campo: 'ownershipPercentageUser1', motivo: 'titularidad pendiente de mapeo documentado (B1: DEPENDENCIA_PERMISOS)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'ownershipPercentageUser2', motivo: 'titularidad pendiente de mapeo documentado (B1: DEPENDENCIA_PERMISOS)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'landValuePercent', motivo: 'sin destino en el ERP (B1: camposSinDestino)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'amortizationAmount', motivo: 'derivado fiscal: el ERP lo recalcula; no se importa (B1)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'expenses', motivo: 'AGREGADO anual: importarlo duplicaría el detalle (B1 clase D)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'yearlyFinancials', motivo: 'resumen anual derivado; el ERP lo recalcula (B1 clase D)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'tenantHistory', motivo: 'sin entidad de histórico de inquilinos en el ERP (B1 clase D, INC-11)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'tenantDni', motivo: 'sin destino directo (B1: REQUIERE_MAPEO con contrato/candidato)', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'contract', motivo: 'subcampos REQUIERE_MAPEO hacia CONTRATO (B1 I-13); no se aplana automáticamente', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'mortgage*', motivo: 'prefijo mortgage* → PRESTAMO, sin adaptador seguro en v1 (B1 I-16)', procedencia: RENTASYNC },
  { entidad: 'GASTO', campo: 'type', motivo: 'discriminante de entidad (gasto/ingreso), no dato canónico', procedencia: RENTASYNC },
  { entidad: 'COBRO', campo: 'type', motivo: 'discriminante de entidad (gasto/ingreso), no dato canónico', procedencia: RENTASYNC },
  { entidad: 'GASTO', campo: 'id', motivo: 'identidad de origen: va a sourceRecordId/proveniencia, no a datos', procedencia: RENTASYNC },
  { entidad: 'COBRO', campo: 'id', motivo: 'identidad de origen: va a sourceRecordId/proveniencia, no a datos', procedencia: RENTASYNC },
  { entidad: 'INMUEBLE', campo: 'id', motivo: 'identidad de origen: va a sourceRecordId/proveniencia, no a datos', procedencia: RENTASYNC },
  // ---- Plantilla Excel de inmuebles (INCIDENCIA) ----
  // Conocidas SIN destino: no son desconocidas, no se importan y el motivo
  // queda a la vista. Ninguna admite inferencia (ni 50/50 ni 100 %).
  { entidad: 'INMUEBLE', campo: '% Propietario 1', motivo: 'TITULARIDAD: el importador no reparte porcentajes ni crea titularidades; se declaran en el panel N-TITULARES (no se infiere 100 %)', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: '% Propietario 2', motivo: 'TITULARIDAD: el importador no reparte porcentajes ni crea titularidades; se declaran en el panel N-TITULARES (no se infiere 50/50)', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: 'Titularidad', motivo: 'TITULARIDAD en texto libre: sin destino; la relación de titulares se declara en el panel N-TITULARES (no se separa por intuición)', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: 'Amortización Anual (€)', motivo: 'derivado fiscal anual: el ERP lo recalcula; importarlo duplicaría el cálculo (no se importa)', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: 'Gastos Comunidad (€)', motivo: 'AGREGADO anual de gastos: importarlo duplicaría el detalle; cada gasto exige fecha y categoría (entidad GASTO)', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: 'Gastos IBI (€)', motivo: 'AGREGADO anual de gastos: importarlo duplicaría el detalle; cada gasto exige fecha y categoría (entidad GASTO)', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: 'Gastos Reparaciones (€)', motivo: 'AGREGADO anual de gastos: importarlo duplicaría el detalle; cada gasto exige fecha y categoría (entidad GASTO)', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: 'Gastos Seguro (€)', motivo: 'AGREGADO anual de gastos: importarlo duplicaría el detalle; cada gasto exige fecha y categoría (entidad GASTO)', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: '% Suelo Catastral', motivo: 'sin destino en el ERP: `datosCatastrales` no modela el porcentaje de suelo', procedencia: PLANTILLA_INMUEBLES },
  { entidad: 'INMUEBLE', campo: 'DNI Inquilino', motivo: 'sin destino directo: requiere mapeo documentado a candidato/contrato (B1: REQUIERE_MAPEO)', procedencia: PLANTILLA_INMUEBLES },
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

/**
 * Busca mapping para (entidad, campoOrigen). Canónico directo incluido y
 * comparación por clave normalizada (acentos, espacios duros, símbolos).
 */
export function buscarMapeo(entidad: string, campoOrigen: string): ResultadoBusquedaMapeo | null {
  const entradas = INDICE.get(entidad) ?? [];
  // 0) Identidad de origen: NO es un dato del modelo, va a proveniencia.
  const identidad = esIdentidadOrigen(entidad, campoOrigen);
  if (identidad) {
    return { canonicos: [], regla: `identidad_origen:${identidad.procedencia}`, identidadOrigen: identidad };
  }
  // 1) Canónico directo (literal y normalizado).
  const directa = entradas.find((e) => e.canonico === campoOrigen);
  if (directa) {
    return { canonicos: [directa.canonico], regla: 'canonico', tipo: directa.tipo };
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
    return { canonicos: destinos, regla, transformacion, tipo };
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

/** Campos canónicos obligatorios de una entidad (≡ B4). */
export function camposObligatorios(entidad: string): string[] {
  return (INDICE.get(entidad) ?? []).filter((e) => e.obligatorio).map((e) => e.canonico);
}
