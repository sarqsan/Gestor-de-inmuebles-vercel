/**
 * BLOQUE C — Motor de morosidad: detección determinista + expediente + evidencias.
 * Motor PURO (sin I/O). Única fuente de verdad económica: `CobroPeriodo`
 * (`contratos_formalizacion.registroCobros`, gestionado por `cobrosEngine`).
 *
 * Este módulo NO crea un segundo circuito de cobros:
 *  - lee el estado/importe del cobro canónico;
 *  - nunca escribe en `registroCobros` (eso solo lo hacen `registrarPagoPeriodo`
 *    y la conciliación GAP6, que a su vez usa `registrarPagoPeriodo`);
 *  - deriva deuda, abre expediente y lo sincroniza cuando la fuente cambia.
 */

import type { CobroPeriodo, ContratoFormalizacion, UsuarioApp } from '../../types';
import type {
  ClasificacionDeuda,
  ComunicacionExpediente,
  EstadoExpediente,
  EstadoTramoDeuda,
  EvidenciaMorosidad,
  ExpedienteMorosidad,
  MotivoTransicion,
  PiezaDeuda,
  PoliticaMorosidad,
  ResumenMorosidadPropietario,
  TransicionExpediente,
} from '../../types/morosidad';
import {
  CLAVES_PROHIBIDAS_EVIDENCIA,
} from '../../types/morosidad';
import {
  construirTransicion,
  redondear2,
  simpleHash,
  validarTransicion,
} from './morosidadEstados';
import {
  diasEntre,
  normalizarId,
  politicaDefecto,
  proximasAcciones,
} from './dunningPolicy';

export const TOLERANCIA_CENTIMOS = 0.009;

export function fechaHoyISO(fechaRef?: string): string {
  return fechaRef ? `${fechaRef}T00:00:00.000Z` : new Date().toISOString();
}

// ==========================================================================
// 1) CLASIFICACIÓN Y DETECCIÓN DE DEUDA
// ==========================================================================

/**
 * Clasifica un periodo de cobro canónico. Determinista: depende solo de
 * (estado, importePrevisto, importeRecibido, fechaVencimiento, fechaReferencia).
 *
 * Reglas anti-falsos-positivos:
 *  - ANULADO/DEVUELTO → no reclamable (nunca se abre expediente por un recibo anulado);
 *  - RECIBIDO/VERIFICADO/PAGADO con saldo cubierto → pagada (VERIFICADO = conciliado GAP6);
 *  - INCIDENCIA → en disputa (no recobrable automáticamente);
 *  - un recibo existente PERO no vencido no es morosidad;
 *  - días de gracia configurables (por defecto 2, coherente con
 *    `DIAS_GRACIA_RETRASO` de cobrosEngine).
 */
export function clasificarCobro(
  cobro: CobroPeriodo,
  opts: { fechaReferencia: string; diasGracia?: number } = { fechaReferencia: new Date().toISOString().slice(0, 10) },
): { clasificacion: ClasificacionDeuda; saldo: number; diasRetraso: number; reclamable: boolean } {
  const previsto = redondear2(Number(cobro.importePrevisto || 0));
  const recibido = redondear2(Number(cobro.importeRecibido || 0));
  const saldo = redondear2(Math.max(0, previsto - recibido));
  const diasGracia = Math.max(0, Number(opts.diasGracia ?? 2));
  const diasRetraso = Math.max(0, diasEntre(cobro.fechaVencimiento, opts.fechaReferencia));

  const estado = String(cobro.estado || '').toUpperCase();
  if (estado === 'ANULADO' || estado === 'DEVUELTO') {
    return { clasificacion: 'NO_RECLAMABLE', saldo, diasRetraso, reclamable: false };
  }
  if (estado === 'RECIBIDO' || estado === 'VERIFICADO') {
    return { clasificacion: 'PAGADA', saldo: 0, diasRetraso, reclamable: false };
  }
  if (estado === 'PAGADO') {
    return saldo > TOLERANCIA_CENTIMOS
      ? { clasificacion: 'VENCIDA_PARCIAL', saldo, diasRetraso, reclamable: diasRetraso > diasGracia }
      : { clasificacion: 'PAGADA_SIN_VERIFICAR', saldo, diasRetraso, reclamable: false };
  }
  if (estado === 'INCIDENCIA' || estado === 'EN_DISPUTA') {
    return { clasificacion: 'EN_DISPUTA', saldo, diasRetraso, reclamable: false };
  }
  if (previsto <= 0) {
    return { clasificacion: 'NO_RECLAMABLE', saldo: 0, diasRetraso, reclamable: false };
  }
  if (diasRetraso <= diasGracia) {
    return { clasificacion: 'EN_PLAZO', saldo, diasRetraso, reclamable: false };
  }
  if (saldo <= TOLERANCIA_CENTIMOS) {
    return { clasificacion: 'PAGADA', saldo: 0, diasRetraso, reclamable: false };
  }
  if (recibido > TOLERANCIA_CENTIMOS) {
    return { clasificacion: 'VENCIDA_PARCIAL', saldo, diasRetraso, reclamable: true };
  }
  return { clasificacion: 'VENCIDA_TOTAL', saldo, diasRetraso, reclamable: true };
}

function estadoTramoDesdeCobro(clasificacion: ClasificacionDeuda, cobro: CobroPeriodo): EstadoTramoDeuda {
  if (clasificacion === 'EN_DISPUTA') return 'EN_DISPUTA';
  if (clasificacion === 'PAGADA' || clasificacion === 'PAGADA_SIN_VERIFICAR') return 'PAGADA';
  if (clasificacion === 'VENCIDA_PARCIAL') return 'PARCIALMENTE_PAGADA';
  return 'ABIERTA';
}

/** Pieza de deuda derivada (id determinista por cobro ⇒ idempotencia total). */
export function construirPiezaDeuda(
  cobro: CobroPeriodo,
  opts: { fechaReferencia: string; diasGracia?: number; fechaDeteccion?: string },
): PiezaDeuda | null {
  const r = clasificarCobro(cobro, opts);
  if (!r.reclamable && r.clasificacion !== 'EN_DISPUTA') return null;
  const fechaDeteccion = opts.fechaDeteccion || fechaHoyISO(opts.fechaReferencia);
  return {
    id: `pieza_${cobro.id}`,
    cobroId: cobro.id,
    contratoId: cobro.contratoId,
    inmuebleId: cobro.inmuebleId,
    propietarioId: cobro.propietarioId,
    habitacionId: cobro.habitacionId,
    periodoMesAnio: cobro.periodoMesAnio,
    nombreMes: cobro.nombreMes,
    fechaVencimiento: cobro.fechaVencimiento,
    importePrevisto: redondear2(cobro.importePrevisto || 0),
    importeRecibido: redondear2(cobro.importeRecibido || 0),
    importeReclamado: r.clasificacion === 'EN_DISPUTA' ? 0 : r.saldo,
    estadoCobroOrigen: cobro.estado,
    clasificacion: r.clasificacion,
    estado: estadoTramoDesdeCobro(r.clasificacion, cobro),
    diasRetraso: r.diasRetraso,
    motivoDisputa: cobro.motivoIncidencia,
    fechaDeteccion,
    ultimaActualizacion: fechaDeteccion,
  };
}

/**
 * Detecta la deuda de un contrato a partir de su calendario canónico.
 * Solo periodos vencidos y con saldo real. Excluye habitaciones de otros
 * contratos (aislamiento ya garantizado por `cobrosEngine.cobrosPorHabitacion`).
 */
export function detectarDeudasContrato(
  contrato: ContratoFormalizacion,
  opts: { fechaReferencia: string; diasGracia?: number },
): PiezaDeuda[] {
  const periodos = Array.isArray(contrato.registroCobros) ? contrato.registroCobros : [];
  const piezas: PiezaDeuda[] = [];
  for (const cobro of periodos) {
    if (cobro.contratoId && cobro.contratoId !== contrato.id) continue;
    const pieza = construirPiezaDeuda(cobro, opts);
    if (pieza) piezas.push(pieza);
  }
  return piezas.sort((a, b) =>
    a.fechaVencimiento < b.fechaVencimiento
      ? -1
      : a.fechaVencimiento > b.fechaVencimiento
        ? 1
        : a.periodoMesAnio < b.periodoMesAnio
          ? -1
          : 1,
  );
}

export function totalPiezas(piezas: PiezaDeuda[]): {
  principal: number;
  cubierto: number;
  saldo: number;
  numAbiertos: number;
} {
  let principal = 0;
  let cubierto = 0;
  let saldo = 0;
  let numAbiertos = 0;
  for (const p of piezas) {
    if (p.estado === 'ANULADA' || p.estado === 'CORREGIDA') continue;
    principal += p.importePrevisto;
    cubierto += p.importeRecibido;
    if (p.estado === 'PAGADA') continue;
    saldo += Math.max(0, p.importePrevisto - p.importeRecibido);
    numAbiertos += 1;
  }
  return {
    principal: redondear2(principal),
    cubierto: redondear2(cubierto),
    saldo: redondear2(saldo),
    numAbiertos,
  };
}

// ==========================================================================
// 2) IDENTIDAD DETERMINISTA DEL EXPEDIENTE (idempotencia, FASE 1 y 17)
// ==========================================================================

/**
 * Firma de los tramos: lista ordenada de `cobroId`s. Misma firma ⇒ mismo
 * expediente ⇒ la detección repetida NO duplica expedientes.
 */
export function firmaDeTramos(piezas: Pick<PiezaDeuda, 'cobroId'>[]): string {
  const ids = piezas.map((p) => p.cobroId).filter(Boolean).sort();
  return `f${simpleHash(ids.join('|')).toString(16).padStart(8, '0')}_${ids.length}`;
}

export function idExpedienteDeterminista(
  contratoId: string,
  piezas: Pick<PiezaDeuda, 'cobroId'>[],
  ocurrencia = 1,
): { id: string; firma: string } {
  const firma = firmaDeTramos(piezas);
  const id = `mor_${normalizarId(contratoId)}_${firma}${ocurrencia > 1 ? `#${ocurrencia}` : ''}`;
  return { id, firma };
}

export interface EntradaExpediente {
  contrato: ContratoFormalizacion;
  piezas: PiezaDeuda[];
  fechaReferencia: string; // YYYY-MM-DD
  politicaId?: string;
  versionPolitica?: number;
  origenCreacion?: 'DETECTOR_AUTOMATICO' | 'APERTURA_MANUAL';
  actor?: Pick<UsuarioApp, 'id' | 'nombre' | 'email'> | null;
  ocurrencia?: number;
  notas?: string;
}

/** Construye el expediente nuevo a partir de los tramos detectados (sin I/O). */
export function construirExpediente(entrada: EntradaExpediente): {
  ok: boolean;
  errores: string[];
  expediente?: ExpedienteMorosidad;
} {
  const errores: string[] = [];
  const { contrato, piezas, fechaReferencia } = entrada;
  if (!contrato?.id) errores.push('contrato_requerido');
  if (!piezas || piezas.length === 0) errores.push('sin_deuda_detectada');
  if (
    contrato?.id &&
    piezas.some((p) => p.contratoId && p.contratoId !== contrato.id)
  ) {
    errores.push('pieza_de_otro_contrato');
  }
  if (contrato?.propietarioId && piezas.some((p) => p.propietarioId && p.propietarioId !== contrato.propietarioId)) {
    errores.push('pieza_de_otro_propietario');
  }
  if (!/^(\d{4})-(\d{2})-(\d{2})$/.test(fechaReferencia || '')) errores.push('fecha_referencia_invalida');
  if (errores.length > 0) return { ok: false, errores };

  const tot = totalPiezas(piezas);
  const { id, firma } = idExpedienteDeterminista(
    contrato.id,
    piezas,
    Math.max(1, Number(entrada.ocurrencia || 1)),
  );
  const hoy = fechaHoyISO(fechaReferencia);
  const masAntiguo = piezas.slice().sort((a, b) => (a.fechaVencimiento < b.fechaVencimiento ? -1 : 1))[0];
  const estado: EstadoExpediente = tot.saldo <= TOLERANCIA_CENTIMOS ? 'PAGADA' : 'DETECTADA';

  const expediente: ExpedienteMorosidad = {
    id,
    claveIdempotencia: `mor:${normalizarId(contrato.id)}:${firma}`,
    firmaTramos: firma,
    ocurrencia: Math.max(1, Number(entrada.ocurrencia || 1)),
    propietarioId: String(contrato.propietarioId || piezas[0].propietarioId || ''),
    propietarioNombre: contrato.propietarioNombre,
    inmuebleId: String(contrato.inmuebleId || piezas[0].inmuebleId || ''),
    inmuebleDireccion: contrato.inmuebleDireccion,
    contratoId: contrato.id,
    habitacionId: contrato.habitacionId,
    inquilinoReferencia: contrato.candidatoNombre || contrato.candidatoDni ? `cont_${normalizarId(contrato.id)}:arrendatario` : undefined,
    estado,
    versionEstado: 1,
    piezasDeuda: piezas.map((p) => ({ ...p })),
    cobroIds: piezas.map((p) => p.cobroId).sort(),
    importePrincipal: tot.principal,
    importeInteresesReclamados: 0,
    importeGastosReclamables: 0,
    importeTotalReclamado: redondear2(tot.saldo),
    importeCubierto: tot.cubierto,
    saldoPendiente: tot.saldo,
    fechaDeteccion: hoy,
    fechaUltimaVencimiento: masAntiguo?.fechaVencimiento || fechaReferencia,
    diasRetrasoActual: masAntiguo ? diasEntre(masAntiguo.fechaVencimiento, fechaReferencia) : 0,
    politicaId: entrada.politicaId || `pol_${normalizarId(String(contrato.propietarioId || 'global'))}_defecto`,
    versionPolitica: entrada.versionPolitica || 1,
    planRecobro: [],
    comunicaciones: [],
    requerimientoFehacienteExiste: false,
    numEvidencias: 0,
    enDisputa: piezas.some((p) => p.estado === 'EN_DISPUTA'),
    liquidacionIds: [],
    ordenPagoIds: [],
    origenCreacion: entrada.origenCreacion || 'DETECTOR_AUTOMATICO',
    creadoPor: entrada.actor?.nombre || entrada.actor?.email,
    creadoPorId: entrada.actor?.id,
    actualizadoPor: entrada.actor?.nombre || entrada.actor?.email,
    actualizadoPorId: entrada.actor?.id,
    creadoEn: hoy,
    actualizadoEn: hoy,
    numHistorial: 0,
    notas: entrada.notas,
  };
  return { ok: true, errores: [], expediente };
}

// ==========================================================================
// 3) SINCRONIZACIÓN CON LA FUENTE CANÓNICA (cobros / GAP6 / BLOQUE B)
// ==========================================================================

export interface ResultadoSincronizar {
  expediente: ExpedienteMorosidad;
  cambios: {
    nuevos: string[];
    pagados: string[];
    parciales: string[];
    retirados: string[];
    disputas: string[];
  };
  /** true si la deuda real cambió y hay que actuar (transición/plan/histórico). */
  modificado: boolean;
  transicionSugerida?: { estadoNuevo: EstadoExpediente; motivo: MotivoTransicion };
  advertencias: string[];
}

/**
 * Vuelve a derivar la deuda del expediente contra los cobros canónicos.
 *  - un cobro que pasa a RECIBIDO/VERIFICADO (pago registrado o conciliado por
 *    GAP6 ⇒ `registrarPagoPeriodo`) marca el tramo como PAGADA y baja el saldo;
 *  - un cobro anulado/devuelto se RETIRA de la reclamación con nota (no se borra);
 *  - un cobro nuevo vencido se AÑADE al expediente existente (misma ocurrencia);
 *  - NUNCA se toca el cobro: el sentido de la integración es solo lectura.
 */
export function sincronizarExpediente(
  expediente: ExpedienteMorosidad,
  cobros: CobroPeriodo[],
  opts: {
    fechaReferencia: string;
    diasGracia?: number;
    actor?: Pick<UsuarioApp, 'id' | 'nombre' | 'email'> | null;
  },
): ResultadoSincronizar {
  const porCobro = new Map<string, CobroPeriodo>();
  for (const c of cobros || []) porCobro.set(c.id, c);
  const cambios: ResultadoSincronizar['cambios'] = {
    nuevos: [],
    pagados: [],
    parciales: [],
    retirados: [],
    disputas: [],
  };
  const advertencias: string[] = [];
  const hoy = fechaHoyISO(opts.fechaReferencia);

  const piezas = (expediente.piezasDeuda || []).map((p) => ({ ...p }));
  for (const pieza of piezas) {
    const cobro = porCobro.get(pieza.cobroId);
    if (!cobro) {
      // El cobro ya no existe en la fuente: NO se borra la deuda (sería una
      // desaparición silenciosa). Se marca y se advierte.
      cambios.retirados.push(pieza.cobroId);
      pieza.notaRectificacion = `cobro_no_encontrado_en_fuente:${hoy}`;
      advertencias.push(`cobro_sin_fuente:${pieza.cobroId}`);
      continue;
    }
    const r = clasificarCobro(cobro, { fechaReferencia: opts.fechaReferencia, diasGracia: opts.diasGracia });
    const saldoAnterior = Math.max(0, redondear2(pieza.importePrevisto - pieza.importeRecibido));
    pieza.importePrevisto = redondear2(cobro.importePrevisto || 0);
    pieza.importeRecibido = redondear2(cobro.importeRecibido || 0);
    pieza.estadoCobroOrigen = cobro.estado;
    pieza.diasRetraso = r.diasRetraso;
    pieza.motivoDisputa = cobro.motivoIncidencia;
    pieza.ultimaActualizacion = hoy;

    if (r.clasificacion === 'NO_RECLAMABLE') {
      const motivo = String(cobro.estado).toUpperCase() === 'ANULADO' ? 'ANULADO' : 'DEVUELTO';
      pieza.estado = motivo === 'ANULADO' ? 'ANULADA' : 'CORREGIDA';
      pieza.importeReclamado = 0;
      pieza.notaRectificacion = `cobro_${motivo.toLowerCase()}:${cobro.observaciones || cobro.motivoIncidencia || 'sin_detalle'}`;
      cambios.retirados.push(pieza.cobroId);
      continue;
    }
    if (r.clasificacion === 'EN_DISPUTA') {
      pieza.estado = 'EN_DISPUTA';
      pieza.importeReclamado = 0;
      cambios.disputas.push(pieza.cobroId);
      continue;
    }
    if (r.saldo <= TOLERANCIA_CENTIMOS) {
      if (pieza.estado !== 'PAGADA') cambios.pagados.push(pieza.cobroId);
      pieza.estado = 'PAGADA';
      pieza.importeReclamado = 0;
      continue;
    }
    pieza.importeReclamado = r.saldo;
    if (r.clasificacion === 'VENCIDA_PARCIAL') {
      pieza.estado = 'PARCIALMENTE_PAGADA';
      if (r.saldo < saldoAnterior - TOLERANCIA_CENTIMOS) cambios.parciales.push(pieza.cobroId);
    } else {
      pieza.estado = expediente.estado === 'CERRADA' || expediente.estado === 'PAGADA' ? pieza.estado : pieza.estado;
      if (pieza.estado === 'PAGADA') pieza.estado = 'ABIERTA';
    }
  }

  // Nuevos tramos vencidos del mismo contrato no incluidos aún.
  const incluidos = new Set(piezas.map((p) => p.cobroId));
  for (const cobro of cobros || []) {
    if (cobro.contratoId && cobro.contratoId !== expediente.contratoId) continue;
    if (incluidos.has(cobro.id)) continue;
    const pieza = construirPiezaDeuda(cobro, {
      fechaReferencia: opts.fechaReferencia,
      diasGracia: opts.diasGracia,
    });
    if (!pieza) continue;
    piezas.push(pieza);
    cambios.nuevos.push(cobro.id);
  }

  const tot = totalPiezas(piezas);
  const modificado =
    cambios.nuevos.length + cambios.pagados.length + cambios.parciales.length + cambios.retirados.length + cambios.disputas.length > 0;

  const actualizado: ExpedienteMorosidad = {
    ...expediente,
    piezasDeuda: piezas,
    cobroIds: piezas.map((p) => p.cobroId).sort(),
    importePrincipal: tot.principal,
    importeCubierto: tot.cubierto,
    saldoPendiente: tot.saldo,
    importeTotalReclamado: redondear2(
      tot.saldo + Number(expediente.importeInteresesReclamados || 0) + Number(expediente.importeGastosReclamables || 0),
    ),
    enDisputa: piezas.some((p) => p.estado === 'EN_DISPUTA'),
    diasRetrasoActual: (() => {
      const abiertas = piezas.filter((p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA');
      const mas = abiertas.slice().sort((a, b) => (a.fechaVencimiento < b.fechaVencimiento ? -1 : 1))[0];
      return mas ? diasEntre(mas.fechaVencimiento, opts.fechaReferencia) : 0;
    })(),
    actualizadoEn: hoy,
    actualizadoPor: opts.actor?.nombre || opts.actor?.email || expediente.actualizadoPor,
    actualizadoPorId: opts.actor?.id || expediente.actualizadoPorId,
  };

  let transicionSugerida: ResultadoSincronizar['transicionSugerida'];
  if (actualizado.saldoPendiente <= TOLERANCIA_CENTIMOS && actualizado.estado !== 'PAGADA' && actualizado.estado !== 'CERRADA') {
    transicionSugerida = { estadoNuevo: 'PAGADA', motivo: 'DEUDA_SALDADA' };
  } else if (cambios.parciales.length > 0 && actualizado.estado !== 'PAGO_PARCIAL' && actualizado.estado !== 'COMPROMISO_PAGO') {
    transicionSugerida = { estadoNuevo: 'PAGO_PARCIAL', motivo: 'PAGO_PARCIAL_RECIBIDO' };
  } else if ((cambios.retirados.length > 0 || cambios.disputas.length > 0) && !actualizado.enDisputa) {
    transicionSugerida = { estadoNuevo: 'CERRADA', motivo: 'ANULACION_O_RECTIFICACION' };
  }

  return { expediente: actualizado, cambios, modificado, transicionSugerida, advertencias };
}

/** Aplica la transición al expediente + produce el item de histórico append-only. */
export function aplicarTransicionEnExpediente(
  expediente: ExpedienteMorosidad,
  nuevo: EstadoExpediente,
  motivo: MotivoTransicion | undefined,
  opts: {
    observaciones?: string;
    actor?: Pick<UsuarioApp, 'id' | 'nombre' | 'email'> | null;
    evidenciaId?: string;
    confirmarCierreConSaldo?: boolean;
    forzarSinEvidencia?: boolean;
    exigeMascParaJuridica?: boolean;
    fecha?: string;
  } = {},
): {
  ok: boolean;
  errores: string[];
  advertencias: string[];
  expediente?: ExpedienteMorosidad;
  transicion?: TransicionExpediente;
} {
  const v = validarTransicion(expediente, nuevo, motivo, {
    confirmarCierreConSaldo: opts.confirmarCierreConSaldo,
    forzarSinEvidencia: opts.forzarSinEvidencia,
    exigeMascParaJuridica: opts.exigeMascParaJuridica !== false,
  });
  if (!v.ok) {
    return { ok: false, errores: v.errores, advertencias: v.advertencias };
  }
  const fecha = opts.fecha || new Date().toISOString();
  const transicion = construirTransicion({
    expedienteId: expediente.id,
    propietarioId: expediente.propietarioId,
    estadoAnterior: expediente.estado,
    estadoNuevo: nuevo,
    motivo: v.motivo,
    observaciones: opts.observaciones,
    actorId: opts.actor?.id,
    actorNombre: opts.actor?.nombre || opts.actor?.email,
    evidenciaId: opts.evidenciaId,
    importeTotalAntes: Number(expediente.importeTotalReclamado || 0),
    importeTotalDespues: Number(expediente.importeTotalReclamado || 0),
    fecha,
  });
  const actualizado: ExpedienteMorosidad = {
    ...expediente,
    estado: nuevo,
    versionEstado: Number(expediente.versionEstado || 1) + 1,
    actualizadoEn: fecha,
    actualizadoPor: opts.actor?.nombre || opts.actor?.email || expediente.actualizadoPor,
    actualizadoPorId: opts.actor?.id || expediente.actualizadoPorId,
    numHistorial: Number(expediente.numHistorial || 0) + 1,
    fechaCierre: nuevo === 'CERRADA' || nuevo === 'PAGADA' ? fecha : expediente.fechaCierre,
    motivoCierre: nuevo === 'CERRADA' ? opts.observaciones || v.motivo : expediente.motivoCierre,
    subestado: undefined,
  };
  return { ok: true, errores: [], advertencias: v.advertencias, expediente: actualizado, transicion };
}

// ==========================================================================
// 4) EVIDENCIAS (append-only, sin secretos)
// ==========================================================================

export interface EntradaEvidencia {
  expedienteId: string;
  /** Clave de aislamiento (las reglas 34 la exigen al escribir). */
  propietarioId?: string;
  tipo: EvidenciaMorosidad['tipo'];
  fecha: string; // YYYY-MM-DD
  hora?: string;
  resumen: string;
  detalle?: string;
  piezaDeudaId?: string;
  cobroId?: string;
  referenciaEntidadTipo?: EvidenciaMorosidad['referenciaEntidadTipo'];
  referenciaEntidadId?: string;
  storagePath?: string;
  storageBucket?: string;
  nombreArchivo?: string;
  tipoMime?: string;
  tamanoBytes?: number;
  importeRelacionado?: number;
  resultado?: string;
  actor?: Pick<UsuarioApp, 'id' | 'nombre' | 'email'> | null;
  corrigeEvidenciaId?: string;
  /** Clave estable para idempotencia (si se omite se deriva del contenido). */
  claveEstable?: string;
  /** Campos libres del usuario; se filtran claves sensibles antes de persistir. */
  datosAdicionales?: Record<string, unknown>;
}

/** Devuelve una copia sin claves que parezcan credenciales (defensa en profundidad). */
export function sanearEvidencia<T extends Record<string, unknown>>(objeto: T): { limpio: T; filtradas: string[] } {
  const filtradas: string[] = [];
  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(objeto || {})) {
    const esProhibida = CLAVES_PROHIBIDAS_EVIDENCIA.some(
      (prohibida) => clave.toLowerCase() === String(prohibida).toLowerCase(),
    );
    if (esProhibida) {
      filtradas.push(clave);
      continue;
    }
    limpio[clave] = valor;
  }
  return { limpio: limpio as T, filtradas };
}

export function idEvidencia(
  expedienteId: string,
  tipo: EvidenciaMorosidad['tipo'],
  claveEstable: string,
): string {
  return `evi_${normalizarId(expedienteId)}_${normalizarId(tipo)}_${simpleHash(claveEstable).toString(16).padStart(8, '0')}`;
}

/** Crea la evidencia de forma idempotente (replay ⇒ mismo id ⇒ no duplica). */
export function crearEvidencia(
  entrada: EntradaEvidencia,
  opts: { fechaRegistro?: string; claveEstable?: string } = {},
): { ok: boolean; errores: string[]; filtradas: string[]; evidencia?: EvidenciaMorosidad } {
  const errores: string[] = [];
  if (!entrada.expedienteId) errores.push('expediente_requerido');
  if (!entrada.tipo) errores.push('tipo_requerido');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha || '')) errores.push('fecha_invalida');
  if (!entrada.resumen || entrada.resumen.trim().length < 3) errores.push('resumen_requerido');
  if (entrada.resumen && entrada.resumen.length > 1000) errores.push('resumen_excesivo');
  if (entrada.detalle && entrada.detalle.length > 4000) errores.push('detalle_excesivo');
  if (errores.length > 0) return { ok: false, errores, filtradas: [] };

  const { limpio: extras, filtradas } = sanearEvidencia({ ...(entrada.datosAdicionales || {}) });
  const importe =
    typeof entrada.importeRelacionado === 'number' ? redondear2(entrada.importeRelacionado) : undefined;
  const clave =
    entrada.claveEstable ||
    opts.claveEstable ||
    `${entrada.tipo}|${entrada.fecha}|${(entrada.resumen || '').toLowerCase().slice(0, 64)}|${entrada.referenciaEntidadId || ''}`;
  const evidencia: EvidenciaMorosidad = {
    id: idEvidencia(entrada.expedienteId, entrada.tipo, clave),
    expedienteId: entrada.expedienteId,
    propietarioId: entrada.propietarioId,
    piezaDeudaId: entrada.piezaDeudaId,
    cobroId: entrada.cobroId,
    tipo: entrada.tipo,
    fecha: entrada.fecha,
    hora: entrada.hora,
    resumen: entrada.resumen.trim(),
    detalle: entrada.detalle?.trim(),
    referenciaEntidadTipo: entrada.referenciaEntidadTipo,
    referenciaEntidadId: entrada.referenciaEntidadId,
    storagePath: entrada.storagePath,
    storageBucket: entrada.storageBucket,
    nombreArchivo: entrada.nombreArchivo,
    tipoMime: entrada.tipoMime,
    tamanoBytes: entrada.tamanoBytes,
    importeRelacionado: importe,
    resultado: entrada.resultado,
    actorId: entrada.actor?.id,
    actorNombre: entrada.actor?.nombre || entrada.actor?.email,
    creadoEn: opts.fechaRegistro || new Date().toISOString(),
    corrigeEvidenciaId: entrada.corrigeEvidenciaId,
  };
  if (Object.keys(extras).length > 0) {
    (evidencia as unknown as Record<string, unknown>).datosAdicionales = extras;
  }
  return { ok: true, errores: [], filtradas, evidencia };
}

// ==========================================================================
// 5) COMUNICACIONES (espejo local; el registro vivo es GAP1)
// ==========================================================================

export function idComunicacionDeIdempotencia(idempotencyKey: string): string {
  return `com_${simpleHash(idempotencyKey).toString(16).padStart(12, '0')}`;
}

export interface RegistroComunicacion {
  estadoComunicacion: ComunicacionExpediente['estado'];
  medio: ComunicacionExpediente['medio'];
  /** true si un transporte REAL confirmó la entrega (dispatcher GAP1 con canal activo). */
  entregado: boolean;
}

/**
 * Traduce el resultado del dispatcher GAP1 al estado del espejo local.
 * NUNCA produce 'ENVIADA' sin confirmación real del canal.
 */
export function mapearEstadoComunicacion(dispatch: {
  ok?: boolean;
  estado?: string;
  entregada?: boolean;
  duplicada?: boolean;
  error?: string;
  provider?: string;
}): RegistroComunicacion {
  if (dispatch.entregada === true && dispatch.estado === 'ENVIADA') {
    return { estadoComunicacion: 'ENVIADA', medio: 'EMAIL', entregado: true };
  }
  if (dispatch.estado === 'PROGRAMADA') {
    return { estadoComunicacion: 'PROGRAMADA', medio: 'EMAIL', entregado: false };
  }
  if (dispatch.duplicada) {
    return { estadoComunicacion: 'ENVIADA', medio: 'EMAIL', entregado: false };
  }
  if (dispatch.ok === false && (dispatch.error === 'canal_no_disponible' || dispatch.error === 'payload_invalido')) {
    return {
      estadoComunicacion: dispatch.error === 'canal_no_disponible' ? 'DEPENDENCIA_EXTERNA' : 'PENDIENTE_ENVIO',
      medio: 'EMAIL',
      entregado: false,
    };
  }
  if (dispatch.estado === 'FALLIDA') {
    return { estadoComunicacion: 'FALLIDA', medio: 'EMAIL', entregado: false };
  }
  // Sin transporte: preparación real del registro, sin envío fingido.
  return { estadoComunicacion: 'PREPARADA', medio: 'EMAIL', entregado: false };
}

export function construirComunicacion(
  expedienteId: string,
  evento: {
    tipoEvento: string;
    origen: string;
    idempotencyKey: string;
    asunto?: string;
    destinatarioTipo: ComunicacionExpediente['destinatarioTipo'];
    destinatarioReferencia?: string;
    canalReal?: string;
    notificacionId?: string;
    piezaDeudaId?: string;
    cobroId?: string;
    fechaPrevista?: string;
    actor?: Pick<UsuarioApp, 'id' | 'nombre' | 'email'> | null;
  },
  resultado: {
    estado: ComunicacionExpediente['estado'];
    medio?: ComunicacionExpediente['medio'];
    canal?: string;
    provider?: string;
    externalId?: string;
    error?: string;
    cuerpoResumen?: string;
  },
  fechaRegistro?: string,
): ComunicacionExpediente {
  const hoy = fechaRegistro || new Date().toISOString();
  return {
    id: idComunicacionDeIdempotencia(evento.idempotencyKey),
    expedienteId,
    piezaDeudaId: evento.piezaDeudaId,
    cobroId: evento.cobroId,
    tipoEvento: evento.tipoEvento,
    plantillaId: evento.tipoEvento,
    origenNotificacion: evento.origen,
    idempotencyKey: evento.idempotencyKey,
    notificacionId: evento.notificacionId,
    medio: resultado.medio || 'EMAIL',
    canalReal: resultado.canal || evento.canalReal,
    destinatarioTipo: evento.destinatarioTipo,
    destinatarioReferencia: evento.destinatarioReferencia,
    asunto: evento.asunto,
    cuerpoResumen: resultado.cuerpoResumen,
    estado: resultado.estado,
    provider: resultado.provider,
    externalId: resultado.externalId,
    error: resultado.error,
    fechaPrevista: evento.fechaPrevista,
    fechaRegistro: hoy,
    fechaEnvio: resultado.estado === 'ENVIADA' ? hoy : undefined,
    actorId: evento.actor?.id,
    actorNombre: evento.actor?.nombre || evento.actor?.email,
    externa: false,
  };
}

/** Registra una comunicación ya realizada fuera del ERP (burofax, llamada, notarial). */
export function registrarComunicacionExterna(
  expedienteId: string,
  datos: {
    tipoEvento: string;
    medio: ComunicacionExpediente['medio'];
    destinatarioTipo: ComunicacionExpediente['destinatarioTipo'];
    destinatarioReferencia?: string;
    asunto?: string;
    resumen?: string;
    fecha: string; // YYYY-MM-DD
    evidenciaId?: string;
    actor?: Pick<UsuarioApp, 'id' | 'nombre' | 'email'> | null;
    notas?: string;
  },
): { comunicacion: ComunicacionExpediente; requiereEvidencia: boolean } {
  const esFehaciente = datos.medio === 'BUROFAX' || datos.medio === 'CARTA_CERTIFICADA' || datos.medio === 'NOTARIAL';
  const requiereEvidencia = esFehaciente && !datos.evidenciaId;
  const idempotencyKey = `ev:morosidad:manual:${normalizarId(datos.tipoEvento)}:${expedienteId}:${datos.fecha}`;
  const comunicacion: ComunicacionExpediente = {
    id: idComunicacionDeIdempotencia(`${idempotencyKey}|${datos.medio}`),
    expedienteId,
    tipoEvento: datos.tipoEvento,
    plantillaId: datos.tipoEvento,
    origenNotificacion: 'MOROSIDAD_MANUAL',
    idempotencyKey,
    medio: datos.medio,
    destinatarioTipo: datos.destinatarioTipo,
    destinatarioReferencia: datos.destinatarioReferencia,
    asunto: datos.asunto,
    cuerpoResumen: datos.resumen,
    estado: 'REGISTRADA_MANUALMENTE',
    fechaPrevista: datos.fecha,
    fechaRegistro: new Date().toISOString(),
    // Sin transporte real: NO se pone fechaEnvio (no se afirma el envío).
    evidenciaId: datos.evidenciaId,
    actorId: datos.actor?.id,
    actorNombre: datos.actor?.nombre || datos.actor?.email,
    externa: true,
    notas: datos.notas,
  };
  return { comunicacion, requiereEvidencia };
}

/** ¿El expediente tiene ya un requerimiento con constancia fidedigna? */
export function tieneRequerimientoFehaciente(comunicaciones: ComunicacionExpediente[]): boolean {
  return (comunicaciones || []).some(
    (c) =>
      ['BUROFAX', 'CARTA_CERTIFICADA', 'NOTARIAL'].includes(c.medio) ||
      c.tipoEvento === 'morosidad.requerimiento_fehaciente',
  );
}

// ==========================================================================
// 6) RESUMENES Y VISTA DE MÍNIMO PRIVILEGIO PARA EL PROPIETARIO
// ==========================================================================

export interface ResumenMorosidadGlobal {
  deudaTotal: number;
  expedientesAbiertos: number;
  periodosVencidos: number;
  compromisosVigentes: number;
  escalados: number;
  enDisputa: number;
  porEstado: Record<string, number>;
  importeCubierto: number;
}

export function resumenMorosidad(
  expedientes: ExpedienteMorosidad[],
  opts: { fechaReferencia?: string } = {},
): ResumenMorosidadGlobal {
  const porEstado: Record<string, number> = {};
  let deudaTotal = 0;
  let periodosVencidos = 0;
  let compromisosVigentes = 0;
  let escalados = 0;
  let enDisputa = 0;
  let importeCubierto = 0;
  for (const ex of expedientes || []) {
    porEstado[ex.estado] = (porEstado[ex.estado] || 0) + 1;
    const abierto = ex.estado !== 'PAGADA' && ex.estado !== 'CERRADA';
    importeCubierto += Number(ex.importeCubierto || 0);
    if (abierto) {
      deudaTotal += Number(ex.saldoPendiente || 0);
      periodosVencidos += (ex.piezasDeuda || []).filter(
        (p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA',
      ).length;
    }
    if (ex.compromisoVigenteId) compromisosVigentes += 1;
    if (ex.estado === 'ESCALADA' || ex.estado === 'JURIDICA') escalados += 1;
    if (ex.enDisputa) enDisputa += 1;
  }
  return {
    deudaTotal: redondear2(deudaTotal),
    expedientesAbiertos: (expedientes || []).filter((e) => e.estado !== 'PAGADA' && e.estado !== 'CERRADA').length,
    periodosVencidos,
    compromisosVigentes,
    escalados,
    enDisputa,
    porEstado,
    importeCubierto: redondear2(importeCubierto),
  };
}

/**
 * Vista del propietario. Mínimo privilegio: NO expone nombre/DNI/contacto del
 * inquilino, ni estrategia de recobro, ni abogado/aseguradora, ni penalizaciones.
 */
export function construirResumenPropietario(
  expediente: ExpedienteMorosidad,
  opts: { versionFuente?: number; ultimoHechoResumen?: string } = {},
): ResumenMorosidadPropietario {
  const abiertas = (expediente.piezasDeuda || []).filter(
    (p) => p.estado !== 'PAGADA' && p.estado !== 'ANULADA' && p.estado !== 'CORREGIDA',
  );
  const periodos = (expediente.piezasDeuda || []).map((p) => p.periodoMesAnio).sort();
  const estadoVisible: ResumenMorosidadPropietario['estadoVisible'] =
    expediente.enDisputa
      ? 'EN_REVISION'
      : expediente.saldoPendiente <= TOLERANCIA_CENTIMOS
        ? 'SALDADA'
        : expediente.estado === 'JURIDICA' || expediente.estado === 'ESCALADA'
          ? 'EN_TRAMITE_EXTERNO'
          : expediente.compromisoVigenteId
            ? 'COMPROMISO_ACTIVO'
            : expediente.saldoPendiente < expediente.importeTotalReclamado - TOLERANCIA_CENTIMOS
              ? 'PAGO_PARCIAL'
              : expediente.estado === 'DETECTADA' || expediente.estado === 'PENDIENTE_CONTACTO'
                ? 'DEUDA_ABIERTA'
                : 'EN_GESTION';
  const etiquetas: Record<ResumenMorosidadPropietario['estadoVisible'], string> = {
    DEUDA_ABIERTA: 'Deuda pendiente de pago',
    EN_GESTION: 'En gestión de cobro',
    COMPROMISO_ACTIVO: 'Con calendario de pagos activo',
    PAGO_PARCIAL: 'Pago parcial recibido',
    EN_TRAMITE_EXTERNO: 'En trámite con un tercero externo',
    SALDADA: 'Deuda saldada',
    EN_REVISION: 'En revisión',
  };
  return {
    id: expediente.id,
    expedienteId: expediente.id,
    propietarioId: expediente.propietarioId,
    inmuebleId: expediente.inmuebleId,
    inmuebleDireccion: expediente.inmuebleDireccion,
    contratoId: expediente.contratoId,
    periodoDesde: periodos[0] || '',
    periodoHasta: periodos[periodos.length - 1] || '',
    numPeriodosImpagados: abiertas.length,
    importeTotalReclamado: redondear2(expediente.importeTotalReclamado || 0),
    importeCubierto: redondear2(expediente.importeCubierto || 0),
    saldoPendiente: redondear2(expediente.saldoPendiente || 0),
    estadoVisible,
    estadoEtiqueta: etiquetas[estadoVisible],
    diasRetraso: Number(expediente.diasRetrasoActual || 0),
    ultimaActualizacion: expediente.actualizadoEn,
    fechaProximosPasos: expediente.proximaAccionFecha,
    ultimoHechoResumen: opts.ultimoHechoResumen,
    numHistorial: Number(expediente.numHistorial || 0),
    versionFuente: Number(opts.versionFuente || expediente.versionEstado || 1),
  };
}

/** Claves EXACTAS permitidas en la vista del propietario (la regla §35 lo exige). */
export const CAMPOS_RESUMEN_PROPIETARIO: string[] = [
  'id',
  'expedienteId',
  'propietarioId',
  'inmuebleId',
  'inmuebleDireccion',
  'contratoId',
  'periodoDesde',
  'periodoHasta',
  'numPeriodosImpagados',
  'importeTotalReclamado',
  'importeCubierto',
  'saldoPendiente',
  'estadoVisible',
  'estadoEtiqueta',
  'diasRetraso',
  'ultimaActualizacion',
  'fechaProximosPasos',
  'ultimoHechoResumen',
  'numHistorial',
  'versionFuente',
];

/** Recorta a los campos mínimos (se aplica ANTES de escribir en la colección espejo). */
export function recortarResumenPropietario(resumen: ResumenMorosidadPropietario): ResumenMorosidadPropietario {
  const limpio: Record<string, unknown> = {};
  for (const campo of CAMPOS_RESUMEN_PROPIETARIO) {
    const v = (resumen as unknown as Record<string, unknown>)[campo];
    if (v !== undefined) limpio[campo] = v;
  }
  return limpio as unknown as ResumenMorosidadPropietario;
}

/**
 * Política efectiva: la del propietario si existe y está activa; si no, la de
 * referencia del ERP. Nunca deja un expediente sin plan.
 */
export function resolverPolitica(
  politicas: PoliticaMorosidad[] | undefined,
  propietarioId: string,
  fechaISO: string,
): { politica: PoliticaMorosidad; esDefecto: boolean } {
  const candidatas = (politicas || []).filter((p) => p.activo !== false);
  const delPropio = candidatas
    .filter((p) => p.propietarioId === propietarioId)
    .sort((a, b) => (a.version || 1) - (b.version || 1))
    .pop();
  if (delPropio) return { politica: delPropio, esDefecto: false };
  const global = candidatas
    .filter((p) => !p.propietarioId)
    .sort((a, b) => (a.version || 1) - (b.version || 1))
    .pop();
  if (global) return { politica: global, esDefecto: !global.origenDefecto };
  return { politica: politicaDefecto(propietarioId, fechaISO), esDefecto: true };
}

/** Reordena el plan y devuelve la próxima acción (para UI y scheduling). */
export function calcularProximaAccion(
  plan: ExpedienteMorosidad['planRecobro'],
  fechaReferencia: string,
): { fecha?: string; codigo?: string } {
  const proximera = proximasAcciones(plan || [], fechaReferencia, 1)[0];
  return { fecha: proximera?.fechaObjetivo, codigo: proximera?.pasoCodigo };
}

export type { CobroPeriodo, ContratoFormalizacion };
