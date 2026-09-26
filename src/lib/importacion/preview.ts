/**
 * FASE 4 · B3 — SERVICIO DE PREVIEW / DRY-RUN (sin escrituras).
 *
 * Responde a: "¿Qué va a cambiar si confirmo esta importación?" SIN cambiar nada.
 * - No escribe en Firestore ni en Storage (el snapshot de datos existentes se
 *   INYECTA por parámetro; en B0-B3 nunca se lee de productivo).
 * - Determinista: misma entrada + misma fechaHora/actor → mismo informe byte a byte.
 * - Las incidencias C de FASE 2 se REPORTAN, no se resuelven.
 */
import { calcularLoteSha256, crearContratoMigracion, type ContratoMigracion, type ModoMigracion } from './contratoMigracion';
import {
  claveImporteInmuebleCategoria,
  claveOrigen,
  clasificarDuplicidad,
  huellaCobro,
  huellaExacta,
  huellaFuerte,
  indicesDesdeExistentes,
  registrarEnIndices,
  type EstadoDedup,
  type IndicesDedup,
  type RegistroExistenteRef,
} from './dedup';
import { sha256Hex } from './hash';
import { normalizarInmueble, normalizarMovimiento } from './normalizar';
import { SISTEMA_ORIGEN_RENTASYNC, type IncidenciaDetectada, type RegistroInmuebleExterno, type RegistroMovimientoExterno } from './tipos';

export interface LoteExterno {
  sistema: string;
  fuente: string;
  ficheroNombre: string;
  /** JSON estable del contenido del lote: base del sha256 (puerta de idempotencia). */
  contenidoNormalizado: string;
  inmuebles?: RegistroInmuebleExterno[];
  movimientos?: RegistroMovimientoExterno[];
}

export interface SnapshotExistente {
  gastos?: RegistroExistenteRef[];
  cobros?: RegistroExistenteRef[];
  inmuebles?: { id: string }[];
}

export type EstadoLinea = EstadoDedup | 'BLOQUEADO';

export interface LineaPreview {
  entidad: 'INMUEBLE' | 'GASTO' | 'COBRO' | 'TRUNCADO' | 'DESCONOCIDO';
  origenId: string | null;
  fuente: string;
  inmuebleId: string | null;
  idDestino: string | null;
  estado: EstadoLinea;
  estadoEvidencia: 'VERIFICADO' | 'PENDIENTE' | 'REQUIERE_VALIDACION';
  importe: number | null;
  categoriaODestino: string | null;
  camposRequierenValidacion: string[];
  motivoBloqueo?: string;
  vinculadoA: string[];
}

export interface DocumentoPendientePreview {
  origenId: string | null;
  receiptName: string | null;
  estado: 'PENDIENTE_BINARIO_NO_DISPONIBLE' | 'PENDIENTE_SUBIDA_STORAGE';
}

export interface IncidenciaAgrupada {
  codigo: IncidenciaDetectada['codigo'];
  incidenciaFase2?: string;
  severidad: IncidenciaDetectada['severidad'];
  ocurrencias: number;
  ejemplo: string;
}

export interface ResumenPorInmueble {
  analizados: number;
  nuevos: number;
  bloqueados: number;
  requierenValidacion: number;
  duplicados: number;
  gastosPorCategoria: Record<string, { n: number; importe: number }>;
  rent: { anual: number; mensual: number };
}

export interface InformePreview {
  contrato: ContratoMigracion;
  determinismo: { huellaInforme: string };
  totales: {
    analizados: number;
    nuevos: number;
    yaImportados: number;
    duplicadoExacto: number;
    duplicadoOrigen: number;
    posibleDuplicado: number;
    colisiones: number;
    incompatibles: number;
    bloqueados: number;
    requierenValidacion: number;
  };
  porEntidad: Record<string, number>;
  porInmueble: Record<string, ResumenPorInmueble>;
  porOrigen: Record<string, number>;
  registros: LineaPreview[];
  transformacionesConteo: Record<string, number>;
  camposDesconocidos: string[];
  documentosPendientes: DocumentoPendientePreview[];
  errores: string[];
  incidencias: IncidenciaAgrupada[];
  dependenciasArquitectonicas: string[];
}

const DEPENDENCIAS_ARQUITECTONICAS = [
  'propietarioId de cada registro: depende del futuro modelo de Cuenta de acceso / Titular / Gestor (permisos y cesión/devolución de gestión). NO resuelto en B0-B3 (FASE 4, regla 9).',
  'CobroPeriodo exige contrato vigente (registroCobros embebido): las rentas importadas quedan PENDIENTES hasta crear ContratoFormalizacion destino (FASE 3 §J).',
  'Documentos/comprobantes: la subida real a Storage (sha256 + metadatos) es del bloque B5; aquí solo se inventarían como pendientes.',
];

function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function generarPreview(
  lote: LoteExterno,
  existente: SnapshotExistente,
  opts: { fechaHora: string; actor: string; modo?: ModoMigracion },
): InformePreview {
  const loteSha256 = calcularLoteSha256(lote.contenidoNormalizado);
  const ctx = { loteId: loteSha256, fuente: lote.fuente };

  const indices: IndicesDedup = indicesDesdeExistentes([
    ...(existente.gastos ?? []),
    ...(existente.cobros ?? []),
  ]);
  const inmueblesExistentes = new Set((existente.inmuebles ?? []).map((i) => i.id));

  const registros: LineaPreview[] = [];
  const porEntidad: Record<string, number> = {};
  const porInmueble: Record<string, ResumenPorInmueble> = {};
  const porOrigen: Record<string, number> = {};
  const transformacionesConteo: Record<string, number> = {};
  const camposDesconocidos = new Set<string>();
  const documentosPendientes: DocumentoPendientePreview[] = [];
  const errores: string[] = [];
  const incidenciasTodas: IncidenciaDetectada[] = [];

  const t = {
    analizados: 0, nuevos: 0, yaImportados: 0, duplicadoExacto: 0, duplicadoOrigen: 0,
    posibleDuplicado: 0, colisiones: 0, incompatibles: 0, bloqueados: 0, requierenValidacion: 0,
  };

  function bucketInmueble(id: string): ResumenPorInmueble {
    if (!porInmueble[id]) {
      porInmueble[id] = {
        analizados: 0, nuevos: 0, bloqueados: 0, requierenValidacion: 0, duplicados: 0,
        gastosPorCategoria: {}, rent: { anual: 0, mensual: 0 },
      };
    }
    return porInmueble[id];
  }

  function contarIncidencias(incs: IncidenciaDetectada[]): void {
    for (const i of incs) incidenciasTodas.push(i);
  }

  function contarTransformaciones(regla: string): void {
    transformacionesConteo[regla] = (transformacionesConteo[regla] ?? 0) + 1;
  }

  // ---------- INMUEBLES ----------
  for (const reg of lote.inmuebles ?? []) {
    t.analizados++;
    const n = normalizarInmueble(reg, ctx);
    porEntidad[n.entidad] = (porEntidad[n.entidad] ?? 0) + 1;
    porOrigen[n.procedencia.fuente] = (porOrigen[n.procedencia.fuente] ?? 0) + 1;
    n.transformaciones.forEach((tr) => contarTransformaciones(tr.regla));
    contarIncidencias(n.incidencias);
    const yaExiste = n.procedencia.origenId ? inmueblesExistentes.has(n.procedencia.origenId) : false;
    const estado: EstadoLinea = n.bloqueado ? 'BLOQUEADO' : yaExiste ? 'YA_IMPORTADO' : 'NUEVO';
    if (estado === 'BLOQUEADO') t.bloqueados++;
    else if (estado === 'YA_IMPORTADO') t.yaImportados++;
    else t.nuevos++;
    if (n.camposRequierenValidacion.length > 0 && estado !== 'BLOQUEADO') t.requierenValidacion++;
    registros.push({
      entidad: n.entidad,
      origenId: n.procedencia.origenId,
      fuente: n.procedencia.fuente,
      inmuebleId: n.procedencia.origenId,
      idDestino: n.procedencia.origenId,
      estado,
      estadoEvidencia: n.procedencia.estadoEvidencia,
      importe: null,
      categoriaODestino: null,
      camposRequierenValidacion: n.camposRequierenValidacion,
      motivoBloqueo: n.motivoBloqueo,
      vinculadoA: [],
    });
  }

  // ---------- MOVIMIENTOS (gastos / rentas) ----------
  for (const reg of lote.movimientos ?? []) {
    t.analizados++;
    const n = normalizarMovimiento(reg, ctx);
    porEntidad[n.entidad] = (porEntidad[n.entidad] ?? 0) + 1;
    porOrigen[n.procedencia.fuente] = (porOrigen[n.procedencia.fuente] ?? 0) + 1;
    n.transformaciones.forEach((tr) => contarTransformaciones(tr.regla));
    contarIncidencias(n.incidencias);

    // Documentos pendientes (inventario, sin subida real — bloque B5).
    if ('receiptName' in n.rawSnapshot || 'receiptUrl' in n.rawSnapshot || 'receiptUrl_estado' in n.rawSnapshot) {
      documentosPendientes.push({
        origenId: n.procedencia.origenId,
        receiptName: typeof n.rawSnapshot.receiptName === 'string' ? n.rawSnapshot.receiptName : null,
        estado: n.rawSnapshot.receiptUrl_estado ? 'PENDIENTE_BINARIO_NO_DISPONIBLE' : 'PENDIENTE_SUBIDA_STORAGE',
      });
    }

    let inmuebleId: string | null = null;
    let importe: number | null = null;
    if (n.entidad === 'GASTO') {
      inmuebleId = typeof n.destino.inmuebleId === 'string' ? n.destino.inmuebleId : null;
      importe = typeof n.destino.importe === 'number' ? n.destino.importe : null;
    } else if (n.entidad === 'COBRO') {
      inmuebleId = typeof n.destino.inmuebleId === 'string' ? n.destino.inmuebleId : null;
      importe = typeof n.destino.importeRecibido === 'number' ? n.destino.importeRecibido : null;
    }

    let estado: EstadoLinea = 'BLOQUEADO';
    let idDestino: string | null = n.entidad === 'GASTO' && typeof n.destino.id === 'string' ? n.destino.id : null;
    let vinculadoA: string[] = [];

    if (!n.bloqueado) {
      const clave = n.procedencia.origenId ? claveOrigen(n.procedencia.sistema ?? SISTEMA_ORIGEN_RENTASYNC, n.procedencia.origenId) : null;
      let huella: string | null = null;
      let fuerte: string | null = null;
      let claveImp: string | null = null;
      if (n.entidad === 'GASTO' && inmuebleId && importe !== null && typeof n.destino.categoria === 'string') {
        const input = { inmuebleId, importe, categoria: n.destino.categoria, fechaDevengo: typeof n.destino.fechaDevengo === 'string' ? n.destino.fechaDevengo : undefined, concepto: n.destino.concepto ?? '' };
        huella = huellaExacta(input);
        fuerte = huellaFuerte(input);
        claveImp = claveImporteInmuebleCategoria(inmuebleId, importe, n.destino.categoria);
      } else if (n.entidad === 'COBRO' && inmuebleId && importe !== null) {
        huella = huellaCobro({ inmuebleId, importe, mes: n.mes, anio: n.anio, concepto: String(n.rawSnapshot.description ?? '') });
        fuerte = huella;
        claveImp = claveImporteInmuebleCategoria(inmuebleId, importe, 'RENT');
      }
      const v = clasificarDuplicidad({ idDestino, clave, huella, huellaFuerte: fuerte, claveImporte: claveImp }, indices);
      estado = v.estado;
      vinculadoA = v.contra;
      // Registro intra-lote: permite detectar duplicados DENTRO del mismo fichero (INC-05).
      registrarEnIndices(indices, {
        id: idDestino, claveOrigen: clave, huellaContenido: huella,
        huellaFuerteContenido: fuerte, claveImporte: claveImp,
        inmuebleId: inmuebleId ?? undefined, importe: importe ?? undefined,
      });
    }

    switch (estado) {
      case 'NUEVO': t.nuevos++; break;
      case 'YA_IMPORTADO': t.yaImportados++; break;
      case 'DUPLICADO_EXACTO': t.duplicadoExacto++; break;
      case 'DUPLICADO_ORIGEN': t.duplicadoOrigen++; break;
      case 'POSIBLE_DUPLICADO': t.posibleDuplicado++; break;
      case 'COLISION': t.colisiones++; break;
      case 'INCOMPATIBLE': t.incompatibles++; break;
      case 'BLOQUEADO': t.bloqueados++; break;
    }
    if (!n.bloqueado && n.camposRequierenValidacion.length > 0) t.requierenValidacion++;

    // Resumen por inmueble (incluye bloqueados: el dato existe aunque no sea importable aún).
    if (inmuebleId) {
      const b = bucketInmueble(inmuebleId);
      b.analizados++;
      if (estado === 'BLOQUEADO') b.bloqueados++;
      else if (estado === 'NUEVO') b.nuevos++;
      if (estado === 'DUPLICADO_ORIGEN' || estado === 'DUPLICADO_EXACTO' || estado === 'POSIBLE_DUPLICADO') b.duplicados++;
      if (!n.bloqueado && n.camposRequierenValidacion.length > 0) b.requierenValidacion++;
      if (n.entidad === 'GASTO' && importe !== null && typeof n.destino.categoria === 'string') {
        const cat = n.destino.categoria;
        if (!b.gastosPorCategoria[cat]) b.gastosPorCategoria[cat] = { n: 0, importe: 0 };
        b.gastosPorCategoria[cat].n++;
        b.gastosPorCategoria[cat].importe = redondear2(b.gastosPorCategoria[cat].importe + importe);
      }
      if (n.entidad === 'COBRO' && importe !== null) {
        if (n.rentaAnual) b.rent.anual = redondear2(b.rent.anual + importe);
        else if (n.mes !== null) b.rent.mensual = redondear2(b.rent.mensual + importe);
      }
    }

    registros.push({
      entidad: n.entidad,
      origenId: n.procedencia.origenId,
      fuente: n.procedencia.fuente,
      inmuebleId,
      idDestino,
      estado,
      estadoEvidencia: n.procedencia.estadoEvidencia,
      importe,
      categoriaODestino: n.entidad === 'GASTO' ? (n.destino.categoria ?? null) : n.entidad === 'COBRO' ? 'RENT' : null,
      camposRequierenValidacion: n.camposRequierenValidacion,
      motivoBloqueo: n.motivoBloqueo,
      vinculadoA,
    });
  }

  // ---------- Renta anual vs mensual por inmueble (INC-06 / INC-07) ----------
  const incidenciasRenta: IncidenciaDetectada[] = [];
  for (const [inmuebleId, b] of Object.entries(porInmueble)) {
    if (b.rent.anual > 0 && b.rent.mensual > 0) {
      const delta = redondear2(b.rent.anual - b.rent.mensual);
      incidenciasRenta.push({
        codigo: 'RENTA_ANUAL_VS_MENSUAL',
        incidenciaFase2: delta === 0 ? 'INC-06' : 'INC-07',
        detalle: `${inmuebleId}: coexisten rentas "año completo" (${b.rent.anual.toFixed(2)}) y mensuales (${b.rent.mensual.toFixed(2)}); delta ${delta.toFixed(2)}. Doble cómputo potencial: NO se decide sin evidencia del usuario.`,
        severidad: 'REQUIERE_VALIDACION',
      });
    }
  }
  contarIncidencias(incidenciasRenta);

  // ---------- Orden determinista de registros ----------
  registros.sort((a, b) =>
    a.entidad.localeCompare(b.entidad)
    || (a.inmuebleId ?? '').localeCompare(b.inmuebleId ?? '')
    || (a.origenId ?? '~').localeCompare(b.origenId ?? '~')
    || (a.importe ?? 0) - (b.importe ?? 0));

  // ---------- Incidencias agrupadas ----------
  const agrupadas = new Map<string, IncidenciaAgrupada>();
  for (const i of incidenciasTodas) {
    const k = `${i.codigo}|${i.incidenciaFase2 ?? ''}|${i.severidad}`;
    const g = agrupadas.get(k);
    if (g) g.ocurrencias++;
    else agrupadas.set(k, { codigo: i.codigo, ...(i.incidenciaFase2 ? { incidenciaFase2: i.incidenciaFase2 } : {}), severidad: i.severidad, ocurrencias: 1, ejemplo: i.detalle });
  }
  const incidencias = [...agrupadas.values()].sort((a, b) =>
    a.codigo.localeCompare(b.codigo) || (a.incidenciaFase2 ?? '').localeCompare(b.incidenciaFase2 ?? ''));

  // ---------- Campos desconocidos (lista única) ----------
  for (const i of incidenciasTodas) {
    if (i.codigo === 'CAMPO_DESCONOCIDO') {
      const m = /'([^']+)'/.exec(i.detalle);
      if (m) camposDesconocidos.add(m[1]);
    }
  }

  const contrato = crearContratoMigracion({
    sistemaOrigen: lote.sistema,
    loteSha256,
    modo: opts.modo ?? 'DRY_RUN',
    fechaHora: opts.fechaHora,
    actor: opts.actor,
    resultado: {
      analizados: t.analizados,
      importados: 0, // B0-B3 NUNCA importa
      bloqueados: t.bloqueados,
      pendientesValidacion: t.requierenValidacion,
      duplicadosDetectados: t.duplicadoExacto + t.duplicadoOrigen + t.posibleDuplicado,
      documentosProcesados: 0, // subida real = bloque B5
      estado: 'NO_EJECUTADO',
    },
  });

  const informeSinHuella = {
    contrato, totales: t, porEntidad, porInmueble, porOrigen, registros,
    transformacionesConteo, camposDesconocidos: [...camposDesconocidos].sort(),
    documentosPendientes, errores, incidencias, dependenciasArquitectonicas: DEPENDENCIAS_ARQUITECTONICAS,
  };

  return {
    ...informeSinHuella,
    determinismo: { huellaInforme: sha256Hex(JSON.stringify(informeSinHuella)) },
  };
}
