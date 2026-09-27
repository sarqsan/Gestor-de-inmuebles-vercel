/**
 * BLOQUE 3 — Expediente documental + fiscal por inmueble (motor puro).
 * ---------------------------------------------------------------------------
 * REUTILIZA sin duplicar:
 *  · `generarResumenFiscalAnual` / `esGastoDeducible` / `recopilarDocumentacionFiscal`
 *    (src/utils/fiscalEngine.ts) para ingresos, gastos, deducibilidad y
 *    documentación fiscal (DATO_CALCULADO con la regla ya existente);
 *  · el índice documental de `./indice.ts` (proyección de los documentos que
 *    ya viven en sus modelos canónicos);
 *  · el ZIP B6 (`generarExpedienteFiscal` + `empaquetarExpediente`): la
 *    integración añade el índice como entrada adicional determinista SIN
 *    reescribir el motor — el exportId B6 se calcula sobre su contenido
 *    canónico y no cambia; el índice viaja como material complementario con
 *    su propio hash en el manifest.
 *
 * Seguro ↔ expediente: las pólizas del Bloque 1 se REFERENCIAN (ids), nunca
 * se copian. Reparaciones/mantenimiento: sólo se ENLAZAN movimientos ya
 * existentes (el motor nuevo de operaciones corresponde a Arena C).
 *
 * 100% puro: sin Firebase, sin Storage, fechas explícitas. CERO escrituras.
 */
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  GarantiaReparacion,
  Incidencia,
  Inmueble,
  PolizaSeguro,
  TareaMantenimiento,
} from '../../types';
import { generarResumenFiscalAnual, esGastoDeducible } from '../../utils/fiscalEngine';
import type {
  DocumentoExpediente,
  ExpedienteFiscal,
} from '../expedienteFiscal/tipos';
import { stringifyDeterminista } from '../expedienteFiscal/motor';
import { sha256Hex } from '../../utils/sha256';
import { construirIndiceDocumentalInmueble, entradasPorEntidad, type EntradaIndiceEntrada } from './indice';
import {
  AVISO_EXPEDIENTE_INTERNO,
  POLITICA_RETENCION,
  type ExpedienteDocumentalInmueble,
  type IncidenciaDocumental,
  type ReparacionExpedienteRef,
  type SeguroExpedienteRef,
  type TributoExpediente,
} from './tipos';

export interface EntradaExpedienteInmueble {
  inmueble: Inmueble;
  ejercicio: number;
  cobros?: CobroPeriodo[];
  gastos?: Gasto[];
  contratos?: ContratoFormalizacion[];
  polizas?: PolizaSeguro[];
  incidencias?: Incidencia[];
  tareasMantenimiento?: TareaMantenimiento[];
  garantias?: GarantiaReparacion[];
  /** ISO explícito del llamante (determinismo; nunca Date.now() interno). */
  generadoEl: string;
}

export function construirExpedienteDocumentalInmueble(
  entrada: EntradaExpedienteInmueble
): ExpedienteDocumentalInmueble | null {
  const { inmueble, ejercicio, generadoEl } = entrada;

  const resumen = generarResumenFiscalAnual(
    inmueble.id,
    ejercicio,
    [inmueble],
    entrada.contratos || [],
    entrada.gastos || []
  );
  if (!resumen) return null;

  // -- Índice documental (proyección de lo ya existente) ----------------------
  const indice = construirIndiceDocumentalInmueble({
    inmueble,
    gastos: entrada.gastos,
    cobros: entrada.cobros,
    contratos: entrada.contratos,
    polizas: entrada.polizas,
    incidencias: entrada.incidencias,
    tareasMantenimiento: entrada.tareasMantenimiento,
    garantias: entrada.garantias,
    generadoEl,
  } as EntradaIndiceEntrada);

  // -- Ingresos (motor fiscal existente) --------------------------------------
  const ingresos = resumen.ingresos;
  const docIdsIngresos = ingresos.cobros
    .flatMap((c) => entradasPorEntidad(indice, { cobroId: c.id }).map((e) => e.id));

  // -- Gastos (deducibilidad del motor, no re-decidida) ------------------------
  const gastosEj = resumen.gastos;
  const porCategoria: Record<string, { count: number; importe: number }> = {};
  const docIdsGastos: string[] = [];
  const incidenciasFiscales: IncidenciaDocumental[] = [...indice.incidencias];
  for (const g of gastosEj.gastos) {
    const cat = porCategoria[g.categoria] || { count: 0, importe: 0 };
    cat.count += 1;
    cat.importe += g.importe || 0;
    porCategoria[g.categoria] = cat;
    const docs = entradasPorEntidad(indice, { gastoId: g.id });
    docIdsGastos.push(...docs.map((d) => d.id));
    if (docs.length === 0) {
      incidenciasFiscales.push({
        codigo: 'MOVIMIENTO_SIN_DOCUMENTO',
        severidad: 'AVISO',
        descripcion: `Gasto ${g.id} (${g.categoria} — ${g.concepto}, ${(g.importe || 0).toFixed(2)} €) sin documento justificativo en el índice; queda señalado, no se inventa.`,
        entidad: 'gastos',
        id: g.id,
      });
    }
  }

  // -- Tributos/tasas (categorías ya existentes; no se inventan tipos) ---------
  const tributos: TributoExpediente[] = gastosEj.gastos
    .filter((g) => g.categoria === 'IBI' || g.categoria === 'IMPUESTOS_TASAS')
    .map((g) => ({
      gastoId: g.id,
      categoria: g.categoria as 'IBI' | 'IMPUESTOS_TASAS',
      concepto: g.concepto,
      importe: g.importe || 0,
      ejercicio: g.ejercicioFiscal ?? ejercicio,
      fecha: g.fechaDevengo || g.fechaPago || g.fecha,
      documentoIds: entradasPorEntidad(indice, { gastoId: g.id }).map((d) => d.id),
      deducibleSegunMotor: esGastoDeducible(g),
    }));

  // -- Seguros: REFERENCIAS al Bloque 1 (no duplicación) -----------------------
  const seguros: SeguroExpedienteRef[] = (entrada.polizas || [])
    .filter((p) => p.inmuebleId === inmueble.id || (!p.inmuebleId && p.propietarioId === inmueble.propietarioId))
    .filter((p) => p.estado === 'VIGENTE' || p.estado === 'VENCIDA' || p.estado === 'EN_TRAMITE')
    .map((p) => ({
      polizaId: p.id,
      aseguradora: p.aseguradora,
      numeroPoliza: p.numeroPoliza,
      tipo: p.tipo,
      estado: p.estado,
      fechaVencimiento: p.fechaVencimiento,
      primaAnual: p.primaAnual,
      documentoIds: entradasPorEntidad(indice, { polizaId: p.id }).map((d) => d.id),
    }));

  // -- Reparaciones/mantenimiento: sólo enlaces a movimientos existentes -------
  const reparaciones: ReparacionExpedienteRef[] = [];
  for (const g of gastosEj.gastos.filter(
    (x) => x.origen === 'REPARACION' || x.origen === 'ORDEN_TRABAJO' || x.origen === 'INCIDENCIA' ||
           x.categoria === 'REPARACION' || x.categoria === 'MANTENIMIENTO' || x.categoria === 'MANTENIMIENTO_REPARACION'
  )) {
    reparaciones.push({
      tipo: 'GASTO_REPARACION',
      id: g.id,
      concepto: g.concepto,
      fecha: g.fechaDevengo || g.fechaPago || g.fecha,
      importe: g.importe,
      incidenciaId: g.incidenciaId,
      documentoIds: entradasPorEntidad(indice, { gastoId: g.id }).map((d) => d.id),
    });
  }
  for (const t of (entrada.tareasMantenimiento || []).filter((x) => x.inmuebleId === inmueble.id)) {
    reparaciones.push({
      tipo: 'TAREA_MANTENIMIENTO',
      id: t.id,
      concepto: t.titulo,
      fecha: t.ultimaFechaRealizada || t.ultimaFecha || t.proximaFecha,
      importe: t.ultimoCosteReal,
      incidenciaId: t.ultimaIncidenciaId,
      documentoIds: entradasPorEntidad(indice, { tareaMantenimientoId: t.id }).map((d) => d.id),
    });
  }
  for (const g of (entrada.garantias || []).filter((x) => x.inmuebleId === inmueble.id)) {
    reparaciones.push({
      tipo: 'GARANTIA',
      id: g.id,
      concepto: `${g.titulo} (${g.proveedor})`,
      fecha: g.fechaFin,
      incidenciaId: g.incidenciaId,
      documentoIds: entradasPorEntidad(indice, { garantiaId: g.id }).map((d) => d.id),
    });
  }

  return {
    schema: 'rentasync-expediente-inmueble-v1',
    inmuebleId: inmueble.id,
    inmuebleDireccion: inmueble.direccion,
    ejercicio,
    generadoEl,
    ingresos: {
      totalCobros: ingresos.countTotal,
      cobrados: ingresos.countCobrados,
      importePrevisto: ingresos.totalPrevisto,
      importeRecibido: ingresos.totalCobrado,
      contratosActivos: resumen.numContratos,
      documentoIds: docIdsIngresos,
    },
    gastos: {
      total: gastosEj.countTotal,
      importeTotal: gastosEj.total,
      deducibles: gastosEj.countDeducible,
      importeDeducible: gastosEj.totalDeducible,
      noDeducibles: gastosEj.countNoDeducible,
      porCategoria,
      documentoIds: docIdsGastos,
      clasificacion: 'CALCULADO',
    },
    tributos,
    seguros,
    reparaciones,
    indiceDocumental: indice,
    incidenciasFiscales: incidenciasFiscales.sort(
      (a, b) => a.codigo.localeCompare(b.codigo) || (a.id || '').localeCompare(b.id || '')
    ),
    retencion: { ...POLITICA_RETENCION },
    procedencia: {
      sistema: 'ERP Gestor de Inmuebles',
      modo: 'LECTURA',
      escriturasFirestore: 0,
      escriturasStorage: 0,
      formatoOficialAEAT: false,
      avisoAEAT: AVISO_EXPEDIENTE_INTERNO,
      motoresReutilizados: [
        'fiscalEngine.generarResumenFiscalAnual',
        'fiscalEngine.esGastoDeducible',
        'expedienteFiscal (B6) generarExpedienteFiscal/empaquetarExpediente',
        'importacion (B0-B3) dedup/procedencia/rawSnapshot',
        'audit_logs (auditoría única)',
      ],
    },
  };
}

// ============================================================================
// Integración con la exportación B6 (sin reescribir el motor)
// ============================================================================

export interface ResultadoIntegracionIndice {
  /** Serialización determinista del índice (entrada ZIP complementaria). */
  contenido: string;
  /** Hash sha256 del contenido (se registra en manifest.hashes). */
  sha256: string;
  rutaLogica: 'indice-documental.json';
}

/**
 * Prepara la entrada complementaria del índice documental para el ZIP B6.
 * El exportId B6 se calcula sobre el contenido canónico del expediente y NO
 * cambia: el índice viaja como material complementario con su propio hash.
 */
export async function prepararEntradaIndiceParaExportacion(
  indice: ReturnType<typeof construirIndiceDocumentalInmueble>
): Promise<ResultadoIntegracionIndice> {
  const contenido = stringifyDeterminista(indice);
  // Minúsculas: misma convención que el sha256Hex de B6 (lib/importacion/hash).
  return {
    contenido,
    sha256: (await sha256Hex(contenido)).toLowerCase(),
    rutaLogica: 'indice-documental.json',
  };
}

/**
 * Convierte entradas del índice con naturaleza INGRESO/GASTO al contrato
 * `DocumentoExpediente` de B6 (sólo referencias; el binario lo resuelve B6).
 * DEDUP contra los documentos que el motor B6 ya incluye por su cuenta
 * (`doc_{id}` de justificantes/first-documento): nunca duplica referencias.
 * No modifica el expediente: devuelve la lista para que el llamante decida.
 */
export function entradasIndiceComoDocumentosExpediente(
  indice: ReturnType<typeof construirIndiceDocumentalInmueble>,
  ejercicio: number,
  documentosYaIncluidos: DocumentoExpediente[] = []
): DocumentoExpediente[] {
  const idsExistentes = new Set([
    ...documentosYaIncluidos.map((d) => d.documentoId),
    // B6 id-canónico por documento de origen:
    ...documentosYaIncluidos.map((d) => d.documentoId.replace(/^doc_/, '')),
  ]);
  const yaIncluidos = new Set<string>();
  const salida: DocumentoExpediente[] = [];
  for (const e of indice.entradas) {
    const esIngreso = Boolean(e.cobroId);
    const esGasto = Boolean(e.gastoId);
    if (!esIngreso && !esGasto) continue;
    if (e.estado === 'SUSTITUIDO') continue; // viaja la versión vigente; el histórico queda en el índice
    if (yaIncluidos.has(e.id)) continue;
    if (idsExistentes.has(e.origenDocumentoId) || idsExistentes.has(e.id)) continue; // dedup con B6
    yaIncluidos.add(e.id);
    salida.push({
      documentoId: e.id,
      movimientoId: esGasto ? `GASTO:${e.gastoId}` : `COBRO:${e.cobroId}`,
      inmuebleId: e.inmuebleId,
      ejercicio: e.ejercicio ?? ejercicio,
      tipo: esIngreso && !esGasto ? 'INGRESO' : 'GASTO',
      nombre: e.nombre,
      hash: e.hash,
      rutaLogica: `documentos/${e.id}`,
      storagePath: e.storagePath,
      estado: 'PENDIENTE', // binario lo resuelve el resolver de B6
    });
  }
  return salida.sort((a, b) => a.documentoId.localeCompare(b.documentoId));
}

// ============================================================================
// IA documental/fiscal — preparación, NO decisión
// ============================================================================

export interface ContextoIaDocumentalFiscal {
  finalidad: string;
  inmuebleId: string;
  ejercicio: number;
  documentos: {
    id: string;
    tipo: string;
    nombre: string;
    fechaDocumental?: string;
    entidadOrigen: string;
    estado: string;
    relaciones: Record<string, string | undefined>;
  }[];
  movimientosSinDocumento: { id: string; concepto: string; importe: number }[];
  deducibilidadSegunMotor: { gastoId: string; deducible: boolean }[];
  limitaciones: string[];
}

/**
 * Prepara el contexto para futuras funciones de IA (clasificación, extracción,
 * detección de campos faltantes, comparación documental, explicación de
 * cálculos). La IA NUNCA decide por sí sola: deducibilidad definitiva,
 * cobertura de seguro, titularidad, validez jurídica o dato fiscal definitivo
 * siguen siendo humanos/motor existente.
 */
export function prepararContextoIaDocumentalFiscal(
  expediente: ExpedienteDocumentalInmueble,
  gastos: Gasto[]
): ContextoIaDocumentalFiscal {
  const gastosEj = gastos.filter(
    (g) => g.inmuebleId === expediente.inmuebleId &&
      (g.ejercicioFiscal === expediente.ejercicio ||
        (g.fechaDevengo || g.fechaPago || g.fecha || '').startsWith(String(expediente.ejercicio)))
  );
  return {
    finalidad:
      'Preparar datos para asistencia IA documental/fiscal (clasificar, extraer, detectar faltantes, comparar, explicar cálculos). No es una decisión fiscal.',
    inmuebleId: expediente.inmuebleId,
    ejercicio: expediente.ejercicio,
    documentos: expediente.indiceDocumental.entradas.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      nombre: e.nombre,
      fechaDocumental: e.fechaDocumental,
      entidadOrigen: e.entidadOrigen,
      estado: e.estado,
      relaciones: {
        gastoId: e.gastoId,
        cobroId: e.cobroId,
        contratoId: e.contratoId,
        polizaId: e.polizaId,
        incidenciaId: e.incidenciaId,
      },
    })),
    movimientosSinDocumento: gastosEj
      .filter((g) => !expediente.gastos.documentoIds.some((id) => {
        const e = expediente.indiceDocumental.entradas.find((x) => x.id === id);
        return e?.gastoId === g.id;
      }))
      .map((g) => ({ id: g.id, concepto: g.concepto, importe: g.importe || 0 })),
    deducibilidadSegunMotor: gastosEj.map((g) => ({ gastoId: g.id, deducible: esGastoDeducible(g) })),
    limitaciones: [
      'La IA NO decide deducibilidad definitiva: la aplica el motor fiscal existente y la confirma el usuario.',
      'La IA NO afirma cobertura de seguro (ver Bloque 1: evidencia clasificada, conclusión pendiente de revisión).',
      'La IA NO decide titularidad ni validez jurídica.',
      'Toda salida de IA se registra como INTERPRETACION/HIPOTESIS/PENDIENTE_REVISION: nunca pasa automáticamente a dato fiscal oficial.',
      AVISO_EXPEDIENTE_INTERNO,
    ],
  };
}
