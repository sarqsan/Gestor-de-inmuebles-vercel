/**
 * FASE 4 · B1 — MOTOR DE NORMALIZACIÓN PURA (Rentasync v1 → modelos ERP).
 *
 * Reglas implementadas = mapa FASE 2 (docs/FASE2-MAPA-ORIGEN-DESTINO-RENTASYNC.md).
 * PROHIBIDO Y NO OCURRE AQUÍ:
 *  - escribir en Firestore/Storage (capa sin I/O);
 *  - resolver incidencias C (se MARCAN en camposRequierenValidacion/incidencias);
 *  - fusionar duplicados de origen (se conservan; dedup.ts los ENLAZA);
 *  - inventar ids/fechas/importes ausentes (quedan null/PENDIENTE);
 *  - convertir agregados (expenses.*, yearlyFinancials) en movimientos (clase D).
 *
 * Determinismo: mismas entradas → mismas salidas (sin Date.now, sin aleatorios).
 */
import type { CategoriaGasto } from '../../types';
import type {
  EstadoEvidencia,
  GastoNormalizado,
  IncidenciaDetectada,
  InmuebleNormalizado,
  ProcedenciaRegistro,
  RegistroInmuebleExterno,
  RegistroMovimientoExterno,
  RegistroNormalizado,
} from './tipos';
import { MARCA_NO_DISPONIBLE, PREFIJO_ID_NO_RECUPERADO, SISTEMA_ORIGEN_RENTASYNC } from './tipos';

export interface CtxNormalizacion {
  loteId: string | null;
  fuente: string;
}

const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const CAMPOS_CONOCIDOS_MOVIMIENTO = new Set([
  'id', 'type', 'category', 'amount', 'propertyId', 'date', 'description',
  'receiptType', 'receiptName', 'receiptUrl', 'receiptUrl_estado', '_fuente',
]);

const CAMPOS_CONOCIDOS_INMUEBLE = new Set([
  'id', 'address', 'cadastralReference', 'registrationDate', 'purchasePrice', 'currentValue',
  'monthlyRent', 'landValuePercent', 'amortizationAmount', 'expenses',
  'ownershipPercentageUser1', 'ownershipPercentageUser2', 'owner', 'contract',
  'tenantName', 'tenantDni', 'tenantHistory', 'yearlyFinancials',
]);

// ---------- utilidades puras ----------

export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function normalizarConcepto(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function origenIdValido(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0
    && !id.startsWith(PREFIJO_ID_NO_RECUPERADO)
    && !id.includes('NO_DISPONIBLE');
}

function esFechaISO(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** fechaUtil: fecha presente, no marcada NO_DISPONIBLE y con formato válido. */
export function fechaUtil(v: unknown): v is string {
  return typeof v === 'string' && v !== MARCA_NO_DISPONIBLE && esFechaISO(v);
}

/** Parseo EXPLÍCITO día-primer para registrationDate 'D/M/YYYY' (FASE 2 I-04). */
export function parseFechaDMY(v: unknown): { iso: string | null; ambigua: boolean } {
  if (typeof v !== 'string') return { iso: null, ambigua: false };
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
  if (!m) return { iso: null, ambigua: false };
  const d = Number(m[1]); const mo = Number(m[2]); const y = Number(m[3]);
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!esFechaISO(iso)) return { iso: null, ambigua: false };
  // Ambigua solo si ambas lecturas (día/mes vs mes/día) serían válidas y distintas.
  const ambigua = d <= 12 && mo <= 12 && d !== mo;
  return { iso, ambigua };
}

// ---------- normalización de movimientos (gastos / rentas) ----------

function mapaCategoriaGasto(
  category: string,
  concepto: string,
): { categoria: CategoriaGasto | null; regla: string; clasificacion: 'A' | 'B' | 'C'; ambigua?: string; incidenciaFase2?: string } {
  const c = normalizarConcepto(concepto);
  switch (category) {
    case 'community':
      if (c.includes('derrama')) {
        return {
          categoria: 'COMUNIDAD',
          regla: 'community→COMUNIDAD; "derrama" NO se decide: agregado del inmueble la trata como repairs (FASE 2 INC-03)',
          clasificacion: 'C',
          ambigua: 'Derrama: COMUNIDAD (detalle origen) vs REPARACION (agregado inmueble). Decisión humana.',
          incidenciaFase2: 'INC-03',
        };
      }
      return { categoria: 'COMUNIDAD', regla: 'community→COMUNIDAD', clasificacion: 'A' };
    case 'ibi':
      if (c.includes('basura')) {
        return {
          categoria: 'IMPUESTOS_TASAS',
          regla: 'ibi+"Basuras"→IMPUESTOS_TASAS (tasa distinta del IBI, FASE 2 G-05); propuesta, requiere confirmación',
          clasificacion: 'C',
          ambigua: 'Categoría original "ibi" con concepto "Basuras": se propone IMPUESTOS_TASAS.',
        };
      }
      return { categoria: 'IBI', regla: 'ibi→IBI', clasificacion: 'A' };
    case 'insurance':
      if (c.includes('impago')) return { categoria: 'SEGUROS', regla: 'insurance+"impago"→SEGUROS', clasificacion: 'B' };
      if (c.includes('hogar')) return { categoria: 'SEGURO_HOGAR', regla: 'insurance+"hogar"→SEGURO_HOGAR', clasificacion: 'B' };
      return {
        categoria: 'SEGUROS',
        regla: 'insurance→SEGUROS por defecto (descripción no concluyente)',
        clasificacion: 'C',
        ambigua: 'Seguro sin "impago"/"hogar" en la descripción: SEGUROS vs SEGURO_HOGAR sin decidir.',
      };
    case 'repairs':
      return { categoria: 'REPARACION', regla: 'repairs→REPARACION', clasificacion: 'A' };
    default:
      return { categoria: null, regla: `categoría '${category}' no reconocida`, clasificacion: 'C' };
  }
}

export function normalizarMovimiento(
  reg: RegistroMovimientoExterno,
  ctx: CtxNormalizacion,
): RegistroNormalizado {
  const rawSnapshot: Record<string, unknown> = { ...reg };
  const incidencias: IncidenciaDetectada[] = [];
  const transformaciones: GastoNormalizado['transformaciones'] = [];
  const camposRequierenValidacion: string[] = [];
  const bloqueos: string[] = [];

  // --- Registro truncado (registro 27 de FASE 1/2): evidencia, no datos ---
  if ('__TRUNCADO__' in reg) {
    return {
      entidad: 'TRUNCADO',
      procedencia: {
        sistema: SISTEMA_ORIGEN_RENTASYNC, origenId: null, fuente: ctx.fuente,
        loteId: ctx.loteId, estadoEvidencia: 'PENDIENTE',
        evidenciaNota: String(reg['__TRUNCADO__']),
      },
      transformaciones: [],
      incidencias: [{
        codigo: 'REGISTRO_TRUNCADO',
        incidenciaFase2: 'INC-08',
        detalle: 'Registro truncado en origen (PDF firmado). id/importe/inmueble/fecha DESCONOCIDOS: se conserva la evidencia, NO se inventan valores. Posibles registros posteriores no recibidos (INC-09).',
        severidad: 'BLOQUEANTE',
      }],
      camposRequierenValidacion: [],
      rawSnapshot,
      destino: {},
      bloqueado: true,
      motivoBloqueo: 'Registro truncado en origen (FASE 1/2: registro 27)',
    };
  }

  // --- Campos desconocidos: se conservan en rawSnapshot, nunca se descartan ---
  for (const k of Object.keys(reg).sort()) {
    if (!CAMPOS_CONOCIDOS_MOVIMIENTO.has(k)) {
      incidencias.push({
        codigo: 'CAMPO_DESCONOCIDO',
        detalle: `Campo no soportado por el destino: '${k}' (conservado en rawSnapshot; REQUIERE_MAPEO)`,
        severidad: 'INFO',
      });
    }
  }

  const origenId = origenIdValido(reg.id) ? (reg.id as string) : null;
  const fuente = typeof reg._fuente === 'string' && reg._fuente ? reg._fuente : ctx.fuente;
  const propertyId = typeof reg.propertyId === 'string' && reg.propertyId ? reg.propertyId : null;
  const amountOk = typeof reg.amount === 'number' && Number.isFinite(reg.amount);
  const importe = amountOk ? redondear2(reg.amount as number) : null;
  if (amountOk) transformaciones.push({ campo: 'amount→importe', regla: 'redondeo explícito a 2 decimales (INC-14)', clasificacion: 'B' });

  const descripcionOk = typeof reg.description === 'string' && reg.description !== MARCA_NO_DISPONIBLE;
  const concepto = descripcionOk ? (reg.description as string) : '';
  if (!descripcionOk) camposRequierenValidacion.push('concepto');

  const dateOk = fechaUtil(reg.date);
  const date = dateOk ? (reg.date as string) : null;
  if (!dateOk) camposRequierenValidacion.push('fechaDevengo', 'fechaPago', 'periodoMesAnio', 'ejercicioFiscal');

  let estadoEvidencia: EstadoEvidencia = (origenId && dateOk) ? 'VERIFICADO' : 'PENDIENTE';
  const procedencia: ProcedenciaRegistro = {
    sistema: SISTEMA_ORIGEN_RENTASYNC,
    origenId,
    fuente,
    loteId: ctx.loteId,
    estadoEvidencia,
    ...(origenId ? {} : { evidenciaNota: 'id de origen no recuperable (reset 3): NO se inventa; el registro queda BLOQUEADO' }),
  };

  if (!propertyId) bloqueos.push('propertyId ausente');
  if (importe === null) bloqueos.push('importe ausente o no numérico');
  if (!origenId) bloqueos.push('origenId no recuperable: sin id determinista posible');

  const tipo = reg.type;
  const category = typeof reg.category === 'string' ? reg.category : null;

  // Documento/comprobante: solo se señala; la subida a Storage es del bloque B5.
  const documentoPendiente = (reg.receiptName || reg.receiptUrl || reg.receiptUrl_estado)
    ? {
        receiptName: typeof reg.receiptName === 'string' ? reg.receiptName : null,
        receiptType: typeof reg.receiptType === 'string' ? reg.receiptType : null,
        estado: reg.receiptUrl_estado ? 'PENDIENTE_BINARIO_NO_DISPONIBLE' : 'PENDIENTE_SUBIDA_STORAGE',
      }
    : null;

  const base = { procedencia, transformaciones, incidencias, camposRequierenValidacion, rawSnapshot };

  // ================= INGRESO / RENTA → CobroPeriodo =================
  if (tipo === 'ingreso' && category === 'rent') {
    const m = /alquiler\s+([a-záéíóúüñ]+)\s+(\d{4})/i.exec(concepto);
    const mes = m && MESES_ES[m[1].toLowerCase()] ? MESES_ES[m[1].toLowerCase()] : null;
    const anio = m ? Number(m[2]) : null;
    const rentaAnual = /año completo/i.test(concepto);

    if (mes && anio) transformaciones.push({ campo: 'description→mes/anio', regla: 'parseo "Alquiler {mes} {anio}" (FASE 2 G-03)', clasificacion: 'B' });
    if (rentaAnual || mes === null || anio === null) {
      estadoEvidencia = 'REQUIERE_VALIDACION';
      camposRequierenValidacion.push('mes', 'anio');
      incidencias.push({
        codigo: 'RENTA_ANUAL_VS_MENSUAL',
        incidenciaFase2: 'INC-06',
        detalle: rentaAnual
          ? 'Renta "año completo": CobroPeriodo exige mes 1-12. Materializar 12 cobros podría DOBLE-computar con rentas mensuales si coexisten (INC-06). NO se decide aquí.'
          : 'No se pudo derivar mes/año de la descripción: PENDIENTE, no se inventa.',
        severidad: 'REQUIERE_VALIDACION',
      });
    }
    // Cobros exigen contrato vigente (FASE 3 §J): id determinista cobro_{contratoId}_{anio}_{mes}
    // no computable todavía; la clave de identidad provisional es sistema+origenId.
    for (const c of ['contratoId', 'inquilinoId', 'propietarioId', 'estado', 'importePrevisto', 'fechaVencimiento']) {
      if (!camposRequierenValidacion.includes(c)) camposRequierenValidacion.push(c);
    }
    if (estadoEvidencia === 'VERIFICADO') estadoEvidencia = 'REQUIERE_VALIDACION'; // dependencia de contrato
    base.procedencia.estadoEvidencia = estadoEvidencia;

    return {
      ...base,
      entidad: 'COBRO',
      mes,
      anio,
      rentaAnual,
      destino: {
        inmuebleId: propertyId ?? undefined,
        importeRecibido: importe ?? undefined,
        ...(mes && anio ? { mes, anio, periodoMesAnio: `${anio}-${String(mes).padStart(2, '0')}` } : {}),
        ...(date ? { fechaPago: date } : {}),
        observaciones: `procedencia:${SISTEMA_ORIGEN_RENTASYNC}:${origenId ?? 'sin-id'}${documentoPendiente ? ' | comprobante pendiente' : ''}`,
      },
      bloqueado: bloqueos.length > 0,
      motivoBloqueo: bloqueos.length ? bloqueos.join('; ') : undefined,
    };
  }

  // ================= GASTO → Gasto (EXPLOTACION) =================
  if (tipo === 'gasto' && category) {
    const mapa = mapaCategoriaGasto(category, concepto);
    if (!mapa.categoria) bloqueos.push(mapa.regla);
    if (mapa.ambigua) {
      estadoEvidencia = 'REQUIERE_VALIDACION';
      camposRequierenValidacion.push('categoria');
      incidencias.push({
        codigo: 'CLASIFICACION_AMBIGUA',
        ...(mapa.incidenciaFase2 ? { incidenciaFase2: mapa.incidenciaFase2 } : {}),
        detalle: mapa.ambigua,
        severidad: 'REQUIERE_VALIDACION',
      });
    }
    transformaciones.push({ campo: 'category→categoria', regla: mapa.regla, clasificacion: mapa.clasificacion });
    if (date) transformaciones.push({ campo: 'date→fechaDevengo/fechaPago/periodoMesAnio/ejercicioFiscal', regla: '1→4 (2 copias + 2 derivados, FASE 2 G-10)', clasificacion: 'B' });

    // Supuestos NO aplicados (FASE 2 G-13): sin decisión humana no hay aCargoDe/estado/deducible.
    for (const c of ['propietarioId', 'aCargoDe', 'estado', 'deducible']) camposRequierenValidacion.push(c);
    if (camposRequierenValidacion.includes('categoria')) estadoEvidencia = 'REQUIERE_VALIDACION';
    base.procedencia.estadoEvidencia = estadoEvidencia;

    const destino: GastoNormalizado['destino'] = {
      ...(origenId && propertyId ? { id: `gas_${propertyId}_${origenId}` } : {}),
      inmuebleId: propertyId ?? undefined,
      tipo: 'EXPLOTACION',
      ...(mapa.categoria ? { categoria: mapa.categoria } : {}),
      ...(importe !== null ? { importe } : {}),
      concepto,
      origen: 'IMPORTACION',
      ...(origenId ? { origenId } : {}),
      ...(date ? { fechaDevengo: date, fechaPago: date, periodoMesAnio: date.slice(0, 7), ejercicioFiscal: Number(date.slice(0, 4)) } : {}),
    };

    return {
      ...base,
      entidad: 'GASTO',
      destino,
      bloqueado: bloqueos.length > 0,
      motivoBloqueo: bloqueos.length ? bloqueos.join('; ') : undefined,
    };
  }

  // ================= type/category no reconocidos =================
  bloqueos.push(`type/category no reconocidos (type='${String(tipo)}', category='${String(category)}')`);
  return {
    ...base,
    entidad: 'DESCONOCIDO',
    destino: {},
    bloqueado: true,
    motivoBloqueo: bloqueos.join('; '),
  };
}

// ---------- normalización de inmuebles ----------

export function normalizarInmueble(
  reg: RegistroInmuebleExterno,
  ctx: CtxNormalizacion,
): RegistroNormalizado {
  const rawSnapshot: Record<string, unknown> = { ...reg };
  const incidencias: IncidenciaDetectada[] = [];
  const transformaciones: InmuebleNormalizado['transformaciones'] = [];
  const camposRequierenValidacion: string[] = [];
  const agregadosNoImportables: string[] = [];
  const camposSinDestino: string[] = [];
  const bloqueos: string[] = [];

  const id = typeof reg.id === 'string' && reg.id ? reg.id : null;
  if (!id) bloqueos.push('id ausente');

  for (const k of Object.keys(reg).sort()) {
    if (!CAMPOS_CONOCIDOS_INMUEBLE.has(k) && !k.startsWith('mortgage')) {
      incidencias.push({ codigo: 'CAMPO_DESCONOCIDO', detalle: `Campo no soportado: '${k}' (rawSnapshot; REQUIERE_MAPEO)`, severidad: 'INFO' });
    }
    if (k.startsWith('mortgage')) camposSinDestino.push(k); // → Prestamo, REQUIERE_MAPEO por subcampo (FASE 2 I-16)
  }

  const destino: InmuebleNormalizado['destino'] = { ...(id ? { id } : {}) };

  if (typeof reg.address === 'string') {
    const trim = reg.address.trim();
    if (trim !== reg.address) transformaciones.push({ campo: 'address→direccion', regla: 'trim de espacio final (FASE 2 I-02)', clasificacion: 'B' });
    destino.direccion = trim;
    camposRequierenValidacion.push('ciudad'); // obligatorio en ERP, el origen no la separa
  }
  const catastral = typeof reg.cadastralReference === 'string' ? reg.cadastralReference.trim() : '';
  if (catastral) destino.referenciaCatastral = catastral;
  else {
    camposRequierenValidacion.push('referenciaCatastral');
    incidencias.push({ codigo: 'DATO_INCOMPLETO', incidenciaFase2: 'INC-10', detalle: 'cadastralReference vacía/ausente: NO se usa como clave (la clave es el id externo).', severidad: 'REQUIERE_VALIDACION' });
  }
  const f = parseFechaDMY(reg.registrationDate);
  if (f.iso) {
    destino.fechaAdquisicion = f.iso;
    transformaciones.push({ campo: 'registrationDate→fechaAdquisicion', regla: 'parseo D/M/YYYY día-primer explícito (FASE 2 I-04)', clasificacion: 'B' });
    if (f.ambigua) {
      camposRequierenValidacion.push('fechaAdquisicion');
      incidencias.push({ codigo: 'CLASIFICACION_AMBIGUA', detalle: `Fecha '${String(reg.registrationDate)}' ambigua (día/mes intercambiables): se aplica día-primer, requiere confirmación.`, severidad: 'REQUIERE_VALIDACION' });
    }
  } else if (reg.registrationDate !== undefined) {
    camposRequierenValidacion.push('fechaAdquisicion');
  }
  if (typeof reg.purchasePrice === 'number' && Number.isFinite(reg.purchasePrice)) {
    destino.valorAdquisicion = redondear2(reg.purchasePrice);
    transformaciones.push({ campo: 'purchasePrice→valorAdquisicion', regla: 'copia numérica + redondeo (FASE 2 I-05)', clasificacion: 'B' });
  }
  if (typeof reg.currentValue === 'number' && Number.isFinite(reg.currentValue)) {
    destino.valoracionEstimada = redondear2(reg.currentValue);
    transformaciones.push({ campo: 'currentValue→valoracionEstimada', regla: 'copia numérica + redondeo (FASE 2 I-06)', clasificacion: 'B' });
  }
  if (typeof reg.monthlyRent === 'number' && Number.isFinite(reg.monthlyRent)) {
    destino.precio = redondear2(reg.monthlyRent);
    destino.rentaMensual = redondear2(reg.monthlyRent);
    transformaciones.push({ campo: 'monthlyRent→precio/rentaMensual', regla: '€/mes; OJO: puede estar desactualizado frente al contrato vigente (INC-07)', clasificacion: 'B' });
  }
  // Agregados anuales: NUNCA se convierten en movimientos (FASE 2 I-10/I-17, clase D).
  if (reg.expenses !== undefined) {
    agregadosNoImportables.push('expenses');
    incidencias.push({ codigo: 'AGREGADO_NO_IMPORTABLE', detalle: 'expenses{Community,IBI,Insurance,Repairs} es un AGREGADO anual: no se importa (duplicaría el detalle). Uso exclusivo: reconciliación.', severidad: 'INFO' });
  }
  if (reg.yearlyFinancials !== undefined) {
    agregadosNoImportables.push('yearlyFinancials');
    incidencias.push({ codigo: 'AGREGADO_NO_IMPORTABLE', detalle: 'yearlyFinancials: resumen anual derivado; el ERP lo recalcula desde cobros/gastos. No se importa.', severidad: 'INFO' });
  }
  for (const k of ['landValuePercent', 'amortizationAmount', 'ownershipPercentageUser1', 'ownershipPercentageUser2']) {
    if (reg[k] !== undefined) camposSinDestino.push(k);
  }
  if (camposSinDestino.length) {
    incidencias.push({ codigo: 'DEPENDENCIA_PERMISOS', detalle: `Campos sin destino en el ERP: [${camposSinDestino.join(', ')}]. Los % de titularidad dependen del futuro modelo de Cuenta/Titular/Gestor: NO se resuelven en B0-B3.`, severidad: 'REQUIERE_VALIDACION' });
  }
  if (typeof reg.tenantName === 'string' && reg.tenantName.includes(',')) {
    const partes = reg.tenantName.split(',').map((s) => s.trim()).filter(Boolean);
    destino.inquilinoActualNombre = partes[0];
    camposRequierenValidacion.push('inquilinoActualNombre');
    incidencias.push({ codigo: 'DATO_INCOMPLETO', incidenciaFase2: 'INC-13', detalle: `Multi-inquilino en string plano (${partes.length} nombres): 1º→candidato, 2º→cotitular; >2 sin modelo. Split propuesto, requiere validación.`, severidad: 'REQUIERE_VALIDACION' });
  } else if (typeof reg.tenantName === 'string' && reg.tenantName) {
    destino.inquilinoActualNombre = reg.tenantName.trim();
  }
  if (reg.contract !== undefined) camposRequierenValidacion.push('contrato'); // FASE 2 I-13: subcampos REQUIERE_MAPEO
  if (reg.tenantHistory !== undefined) {
    camposSinDestino.push('tenantHistory');
    incidencias.push({ codigo: 'AGREGADO_NO_IMPORTABLE', incidenciaFase2: 'INC-11', detalle: 'tenantHistory: sin entidad de histórico de inquilinos en el ERP (clase D); fechas invertidas detectadas en FASE 1.', severidad: 'INFO' });
  }
  camposRequierenValidacion.push('propietarioId');

  return {
    entidad: 'INMUEBLE',
    procedencia: {
      sistema: SISTEMA_ORIGEN_RENTASYNC,
      origenId: id,
      fuente: ctx.fuente,
      loteId: ctx.loteId,
      estadoEvidencia: id ? 'REQUIERE_VALIDACION' : 'PENDIENTE', // titular/ciudad/contrato pendientes
    },
    transformaciones,
    incidencias,
    camposRequierenValidacion: [...new Set(camposRequierenValidacion)],
    rawSnapshot,
    destino,
    agregadosNoImportables,
    camposSinDestino,
    bloqueado: bloqueos.length > 0,
    motivoBloqueo: bloqueos.length ? bloqueos.join('; ') : undefined,
  };
}
