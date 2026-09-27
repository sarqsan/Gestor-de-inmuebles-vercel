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
    alias: [{ nombre: 'address', procedencia: RENTASYNC, transformacion: 'trim' }],
  },
  { entidad: 'INMUEBLE', canonico: 'ciudad', tipo: 'string', obligatorio: false, version: V, alias: [] },
  {
    entidad: 'INMUEBLE', canonico: 'referenciaCatastral', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'cadastralReference', procedencia: RENTASYNC, transformacion: 'trim' }],
  },
  { entidad: 'INMUEBLE', canonico: 'propietarioId', tipo: 'string', obligatorio: false, version: V, alias: [] },
  {
    entidad: 'INMUEBLE', canonico: 'precio', tipo: 'number', obligatorio: false, version: V,
    alias: [{ nombre: 'monthlyRent', procedencia: RENTASYNC, transformacion: 'redondeo2' }],
  },
  {
    entidad: 'INMUEBLE', canonico: 'rentaMensual', tipo: 'number', obligatorio: false, version: V,
    alias: [{ nombre: 'monthlyRent', procedencia: RENTASYNC, transformacion: 'redondeo2' }],
  },
  {
    entidad: 'INMUEBLE', canonico: 'valorAdquisicion', tipo: 'number', obligatorio: false, version: V,
    alias: [{ nombre: 'purchasePrice', procedencia: RENTASYNC, transformacion: 'redondeo2' }],
  },
  {
    entidad: 'INMUEBLE', canonico: 'valoracionEstimada', tipo: 'number', obligatorio: false, version: V,
    alias: [{ nombre: 'currentValue', procedencia: RENTASYNC, transformacion: 'redondeo2' }],
  },
  {
    entidad: 'INMUEBLE', canonico: 'fechaAdquisicion', tipo: 'fecha', obligatorio: false, version: V,
    alias: [{ nombre: 'registrationDate', procedencia: RENTASYNC, transformacion: 'fechaDMYdiaPrimer' }],
  },
  {
    entidad: 'INMUEBLE', canonico: 'inquilinoActualNombre', tipo: 'string', obligatorio: false, version: V,
    alias: [{ nombre: 'tenantName', procedencia: RENTASYNC, transformacion: 'primerInquilino' }],
  },
  { entidad: 'INMUEBLE', canonico: 'codigoPostal', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'INMUEBLE', canonico: 'superficie', tipo: 'number', obligatorio: false, version: V, alias: [] },
  { entidad: 'INMUEBLE', canonico: 'habitaciones', tipo: 'entero', obligatorio: false, version: V, alias: [] },
  // ================= PROPIETARIO =================
  { entidad: 'PROPIETARIO', canonico: 'nombre', tipo: 'string', obligatorio: true, version: V, alias: [] },
  {
    entidad: 'PROPIETARIO', canonico: 'nifCif', tipo: 'string', obligatorio: false, version: V,
    alias: [
      { nombre: 'nif', procedencia: 'B4:entidades' },
      { nombre: 'cif', procedencia: 'B4:entidades' },
    ],
  },
  { entidad: 'PROPIETARIO', canonico: 'email', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'PROPIETARIO', canonico: 'telefono', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'PROPIETARIO', canonico: 'direccion', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'PROPIETARIO', canonico: 'ciudad', tipo: 'string', obligatorio: false, version: V, alias: [] },
  { entidad: 'PROPIETARIO', canonico: 'codigoPostal', tipo: 'string', obligatorio: false, version: V, alias: [] },
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
];

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
}

const INDICE: Map<string, EntradaMapping[]> = new Map();
for (const e of REGISTRO_MAPPINGS) {
  const lista = INDICE.get(e.entidad) ?? [];
  lista.push(e);
  INDICE.set(e.entidad, lista);
}

/** Busca mapping para (entidad, campoOrigen). Canónico directo incluido. */
export function buscarMapeo(entidad: string, campoOrigen: string): ResultadoBusquedaMapeo | null {
  const entradas = INDICE.get(entidad) ?? [];
  // 1) Canónico directo.
  const directa = entradas.find((e) => e.canonico === campoOrigen);
  if (directa) {
    return { canonicos: [directa.canonico], regla: 'canonico', tipo: directa.tipo };
  }
  // 2) Alias (puede ser 1→N: p. ej. monthlyRent→precio+rentaMensual).
  const destinos: string[] = [];
  let regla = '';
  let transformacion: string | undefined;
  let tipo: TipoMapeo | undefined;
  for (const e of entradas) {
    const a = e.alias.find((x) => x.nombre === campoOrigen);
    if (a) {
      destinos.push(e.canonico);
      regla = `alias:${a.procedencia}`;
      transformacion = a.transformacion;
      tipo = e.tipo;
    }
  }
  if (destinos.length > 0) return { canonicos: destinos, regla, transformacion, tipo };
  // 3) Conocido sin destino (incluye prefijo mortgage*).
  const sin = CAMPOS_SIN_DESTINO.find(
    (s) => s.entidad === entidad && (s.campo === campoOrigen || (s.campo.endsWith('*') && campoOrigen.startsWith(s.campo.slice(0, -1)))),
  );
  if (sin) return { canonicos: [], regla: 'conocido_sin_destino', sinDestino: { motivo: sin.motivo } };
  return null;
}

/** Campos canónicos obligatorios de una entidad (≡ B4). */
export function camposObligatorios(entidad: string): string[] {
  return (INDICE.get(entidad) ?? []).filter((e) => e.obligatorio).map((e) => e.canonico);
}
