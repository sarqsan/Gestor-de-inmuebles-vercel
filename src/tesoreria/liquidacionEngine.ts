/**
 * BLOQUE B — Motor determinista y trazable de liquidación del propietario.
 *
 * Concepto: ingresos EFECTIVAMENTE COBRADOS menos honorarios (+IVA cuando proceda),
 * gastos/adelantos imputables y retenciones cuando legalmente procedan = neto a liquidar.
 *
 * Reglas:
 * - Solo liquida COBRADO (CobroPeriodo en RECIBIDO/VERIFICADO con importeRecibido > 0).
 * - Lo devengado pendiente se informa (naturaleza devengado_pendiente) pero NO suma.
 * - Redondeo a céntimos por línea; descuadre > 0,01 € bloquea aprobación.
 * - Idempotencia: id `liq_{propietarioId}_{YYYY-MM}` + claveIdempotencia con hash.
 * - BORRADOR recalculable; APROBADA preparada para pago; PAGADA con evidencia;
 *   ANULADA/REVERSADA conservan trazabilidad. Sin borrado físico.
 */
import type { CobroPeriodo, ContratoFormalizacion, Propietario } from '../types';
import {
  esPeriodoValido,
  formatoImporteSepa,
  hashContenido,
  redondear2,
} from './sepaUtils';
import type {
  ConfigFiscalLiquidacion,
  EstadoLiquidacion,
  GastoInmueble,
  HistorialLiquidacionItem,
  LineaLiquidacion,
  LiquidacionPropietario,
} from './tipos';

export const CONFIG_FISCAL_DEFECTO: ConfigFiscalLiquidacion = {
  honorariosPct: 8,
  ivaHonorariosPct: 21,
  aplicaIvaHonorarios: true,
  aplicaRetencion: false, // vivienda habitual: sin retención (ver docs normativa)
  retencionPct: 19,
  fuenteRegla: 'Valores por defecto parametrizables. Sin retención (uso vivienda). IVA honorarios 21% (general). Ver docs/BLOQUE-B-NORMATIVA-Y-AUDITORIA.md',
};

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function itemHistorial(
  accion: string,
  detalle?: string,
  actor?: { id?: string; nombre?: string },
  estadoAnterior?: EstadoLiquidacion,
  estadoNuevo?: EstadoLiquidacion,
): HistorialLiquidacionItem {
  return {
    id: uid('hl'),
    fecha: new Date().toISOString(),
    actorId: actor?.id,
    actorNombre: actor?.nombre,
    accion,
    detalle,
    estadoAnterior,
    estadoNuevo,
  };
}

export interface ValidacionConfigFiscal {
  valida: boolean;
  errores: string[];
}

export function validarConfigFiscal(config: ConfigFiscalLiquidacion): ValidacionConfigFiscal {
  const errores: string[] = [];
  if (!(config.honorariosPct >= 0 && config.honorariosPct <= 100)) {
    errores.push('honorariosPct debe estar entre 0 y 100');
  }
  if (!(config.ivaHonorariosPct >= 0 && config.ivaHonorariosPct <= 100)) {
    errores.push('ivaHonorariosPct debe estar entre 0 y 100');
  }
  if (config.aplicaRetencion) {
    if (!(config.retencionPct > 0 && config.retencionPct <= 100)) {
      errores.push('retencionPct debe ser > 0 cuando aplicaRetencion es true');
    }
    if (!config.motivoRetencion?.trim() || !config.fuenteRegla?.trim()) {
      errores.push('Con retención es obligatorio indicar motivoRetencion y fuenteRegla (norma aplicada)');
    }
  }
  const reparto = config.repartoCopropiedad;
  if (reparto) {
    if (!reparto.segundoPropietarioId?.trim()) errores.push('repartoCopropiedad: falta segundoPropietarioId');
    if (!(reparto.porcentajeSegundo > 0 && reparto.porcentajeSegundo < 100)) {
      errores.push('repartoCopropiedad: porcentajeSegundo debe estar entre 0 y 100 (exclusivo)');
    }
  }
  return { valida: errores.length === 0, errores };
}

/** ¿Es un cobro liquidable? Solo cobrado real. */
export function esCobroLiquidable(c: CobroPeriodo): boolean {
  return (
    (c.estado === 'RECIBIDO' || c.estado === 'VERIFICADO') &&
    Number(c.importeRecibido) > 0
  );
}

/** ¿Pertenece el cobro al propietario y periodo indicados? */
export function cobroPerteneceA(c: CobroPeriodo, propietarioId: string, periodo: string): boolean {
  if (c.propietarioId && c.propietarioId !== propietarioId) return false;
  return c.periodoMesAnio === periodo;
}

export interface EntradaLiquidacion {
  propietario: Propietario;
  periodo: string; // YYYY-MM
  contratos: ContratoFormalizacion[]; // contratos del propietario (o todos; se filtra)
  gastos: GastoInmueble[]; // gastos candidatos (se filtra por propietario/periodo/estado)
  config?: Partial<ConfigFiscalLiquidacion>;
  actor?: { id?: string; nombre?: string };
  cuentaAbonoId?: string; // id de cuenta bancaria del propietario
  notas?: string;
  /** Cobros ya usados en otras liquidaciones (para evitar duplicar). */
  cobroIdsExcluidos?: string[];
  gastoIdsExcluidos?: string[];
}

export interface ResultadoLiquidacion {
  ok: boolean;
  errores: string[];
  liquidacion?: LiquidacionPropietario;
}

/**
 * Construye (o reconstruye) el BORRADOR de liquidación para propietario+periodo.
 * Determinista: mismos inputs ⇒ mismo hashCalculo.
 */
export function construirBorradorLiquidacion(entrada: EntradaLiquidacion): ResultadoLiquidacion {
  const errores: string[] = [];
  const { propietario, periodo } = entrada;

  if (!propietario?.id) errores.push('Falta propietario');
  if (!esPeriodoValido(periodo)) errores.push(`Periodo inválido (esperado YYYY-MM): ${periodo}`);

  const config: ConfigFiscalLiquidacion = { ...CONFIG_FISCAL_DEFECTO, ...(entrada.config || {}) };
  const valCfg = validarConfigFiscal(config);
  if (!valCfg.valida) errores.push(...valCfg.errores);
  if (errores.length > 0) return { ok: false, errores };

  const [anioStr, mesStr] = periodo.split('-');
  const anio = Number(anioStr);
  const mes = Number(mesStr);

  const excluidosCobros = new Set(entrada.cobroIdsExcluidos || []);
  const excluidosGastos = new Set(entrada.gastoIdsExcluidos || []);

  // --- Cobros del periodo para este propietario ---
  const cobrosPeriodo: CobroPeriodo[] = [];
  for (const contrato of entrada.contratos || []) {
    for (const c of contrato.registroCobros || []) {
      if (excluidosCobros.has(c.id)) continue;
      // Propietario: por cobro o por contrato
      const propCobro = c.propietarioId || contrato.propietarioId || '';
      if (propCobro && propCobro !== propietario.id) continue;
      if (c.periodoMesAnio !== periodo) continue;
      cobrosPeriodo.push(c);
    }
  }

  const lineas: LineaLiquidacion[] = [];
  const cobroIds: string[] = [];
  const contratoIds = new Set<string>();
  const inmuebleIds = new Set<string>();
  let nLinea = 0;
  const nid = () => `lin_${periodo}_${++nLinea}`;

  let totalBrutoCobrado = 0;
  let totalDevengadoPendiente = 0;

  const ordenados = [...cobrosPeriodo].sort((a, b) =>
    `${a.inmuebleDireccion || ''}${a.id}`.localeCompare(`${b.inmuebleDireccion || ''}${b.id}`),
  );
  for (const c of ordenados) {
    if (c.contratoId) contratoIds.add(c.contratoId);
    if (c.inmuebleId) inmuebleIds.add(c.inmuebleId);
    if (esCobroLiquidable(c)) {
      const importe = redondear2(Number(c.importeRecibido) || 0);
      totalBrutoCobrado = redondear2(totalBrutoCobrado + importe);
      cobroIds.push(c.id);
      lineas.push({
        id: nid(),
        naturaleza: 'cobrado',
        concepto: `Alquiler cobrado — ${c.nombreMes || periodo}`,
        importe,
        inmuebleId: c.inmuebleId,
        inmuebleDireccion: c.inmuebleDireccion,
        contratoId: c.contratoId,
        cobroId: c.id,
        periodoMesAnio: c.periodoMesAnio,
        referencia: c.referenciaBancaria,
        detalle: `Inquilino: ${c.inquilinoNombre || '—'} · Previsto ${formatoImporteSepa(c.importePrevisto)} € · Cobrado ${formatoImporteSepa(c.importeRecibido)} €${c.fechaPago ? ` · ${c.fechaPago}` : ''} · ${c.estado}`,
      });
    } else {
      const pendiente = redondear2(Math.max(0, (Number(c.importePrevisto) || 0) - (Number(c.importeRecibido) || 0)));
      totalDevengadoPendiente = redondear2(totalDevengadoPendiente + pendiente);
      lineas.push({
        id: nid(),
        naturaleza: 'devengado_pendiente',
        concepto: `Pendiente de cobro (informativo, no liquida) — ${c.nombreMes || periodo}`,
        importe: 0,
        inmuebleId: c.inmuebleId,
        inmuebleDireccion: c.inmuebleDireccion,
        contratoId: c.contratoId,
        cobroId: c.id,
        periodoMesAnio: c.periodoMesAnio,
        detalle: `Previsto ${formatoImporteSepa(c.importePrevisto)} € · Recibido ${formatoImporteSepa(c.importeRecibido)} € · Estado ${c.estado}`,
      });
    }
  }

  // --- Gastos imputables al propietario del periodo ---
  // Criterio: mismo propietario, imputableA=propietario, pagadoPor=administracion
  // (adelantado por administración y por tanto descontable), estado pendiente/pagado,
  // fechaGasto dentro del periodo YYYY-MM. Los pagados por el propio propietario se
  // informan pero no se descuentan (ya los asumió).
  const gastosCandidatos = (entrada.gastos || []).filter((g) => {
    if (excluidosGastos.has(g.id)) return false;
    if (g.propietarioId !== propietario.id) return false;
    if (g.estado !== 'pendiente' && g.estado !== 'pagado') return false;
    if (g.imputableA !== 'propietario') return false;
    if (!g.fechaGasto?.startsWith(periodo)) return false;
    return true;
  });

  const gastoIds: string[] = [];
  let totalGastos = 0;
  const gastosOrdenados = [...gastosCandidatos].sort((a, b) =>
    `${a.fechaGasto}${a.id}`.localeCompare(`${b.fechaGasto}${b.id}`),
  );
  for (const g of gastosOrdenados) {
    if (g.inmuebleId) inmuebleIds.add(g.inmuebleId);
    if (g.contratoId) contratoIds.add(g.contratoId);
    if (g.pagadoPor === 'administracion') {
      const importe = redondear2(Number(g.total) || 0);
      totalGastos = redondear2(totalGastos + importe);
      gastoIds.push(g.id);
      lineas.push({
        id: nid(),
        naturaleza: 'gasto',
        concepto: `Gasto imputable — ${g.concepto}`,
        importe: -importe,
        inmuebleId: g.inmuebleId,
        inmuebleDireccion: g.inmuebleDireccion,
        contratoId: g.contratoId,
        gastoId: g.id,
        referencia: g.facturaNumero,
        detalle: `${g.categoria} · Base ${formatoImporteSepa(g.base)} € + IVA ${g.ivaPct}% (${formatoImporteSepa(g.ivaImporte)} €) · Pagado por administración${g.proveedorNombre ? ` · ${g.proveedorNombre}` : ''}${g.trabajoId ? ` · trabajo ${g.trabajoId}` : ''}`,
      });
    } else {
      // pagado por el propietario: informativo
      lineas.push({
        id: nid(),
        naturaleza: 'ajuste',
        concepto: `Gasto asumido por propietario (informativo) — ${g.concepto}`,
        importe: 0,
        inmuebleId: g.inmuebleId,
        gastoId: g.id,
        detalle: `Total ${formatoImporteSepa(g.total)} € · no se descuenta (pagado por ${g.pagadoPor})`,
      });
    }
  }

  // --- Honorarios sobre cobrado ---
  const totalHonorarios = redondear2((totalBrutoCobrado * config.honorariosPct) / 100);
  if (totalHonorarios > 0 || totalBrutoCobrado > 0) {
    lineas.push({
      id: nid(),
      naturaleza: 'honorario',
      concepto: `Honorarios de administración (${config.honorariosPct}% sobre cobrado)`,
      importe: -totalHonorarios,
      detalle: `${formatoImporteSepa(totalBrutoCobrado)} € × ${config.honorariosPct}%`,
    });
  }
  let totalIvaHonorarios = 0;
  if (config.aplicaIvaHonorarios && totalHonorarios > 0) {
    totalIvaHonorarios = redondear2((totalHonorarios * config.ivaHonorariosPct) / 100);
    lineas.push({
      id: nid(),
      naturaleza: 'iva_honorarios',
      concepto: `IVA honorarios (${config.ivaHonorariosPct}%)`,
      importe: -totalIvaHonorarios,
      detalle: `${formatoImporteSepa(totalHonorarios)} € × ${config.ivaHonorariosPct}%`,
    });
  }

  // --- Retención (solo si procede legalmente y está configurada) ---
  let totalRetenciones = 0;
  if (config.aplicaRetencion && totalBrutoCobrado > 0) {
    totalRetenciones = redondear2((totalBrutoCobrado * config.retencionPct) / 100);
    lineas.push({
      id: nid(),
      naturaleza: 'retencion',
      concepto: `Retención (${config.retencionPct}%) — ${config.motivoRetencion || 'ver fuente'}`,
      importe: -totalRetenciones,
      detalle: `Base ${formatoImporteSepa(totalBrutoCobrado)} € · Fuente: ${config.fuenteRegla || '—'}`,
    });
  }

  const totalDeducciones = redondear2(totalHonorarios + totalIvaHonorarios + totalGastos + totalRetenciones);
  let netoPropietario = redondear2(totalBrutoCobrado - totalDeducciones);

  // --- Reparto copropiedad explícito (opcional) ---
  if (config.repartoCopropiedad && netoPropietario !== 0) {
    const pct2 = config.repartoCopropiedad.porcentajeSegundo;
    const parteSegundo = redondear2((netoPropietario * pct2) / 100);
    netoPropietario = redondear2(netoPropietario - parteSegundo);
    lineas.push({
      id: nid(),
      naturaleza: 'retenido',
      concepto: `Parte copropietario ${config.repartoCopropiedad.segundoPropietarioNombre} (${pct2}%)`,
      importe: -parteSegundo,
      detalle: 'Reparto explícito configurado; el neto mostrado corresponde al titular principal',
    });
  }

  // --- Cuadre: suma de líneas debe igualar el neto ---
  const sumaLineas = redondear2(lineas.reduce((acc, l) => acc + l.importe, 0));
  const descuadre = redondear2(sumaLineas - netoPropietario);
  if (Math.abs(descuadre) > 0.001) {
    // Absorber descuadres de redondeo ≤ 0,01 € en línea visible; si mayor, error.
    if (Math.abs(descuadre) <= 0.011) {
      lineas.push({
        id: nid(),
        naturaleza: 'ajuste',
        concepto: 'Ajuste de redondeo',
        importe: redondear2(-descuadre),
        detalle: `Cuadre técnico de céntimos (${formatoImporteSepa(descuadre)} €)`,
      });
    } else {
      errores.push(`Descuadre interno de cálculo: ${formatoImporteSepa(descuadre)} € (bloquea la liquidación)`);
      return { ok: false, errores };
    }
  }

  const netoFinal = redondear2(lineas.reduce((acc, l) => acc + l.importe, 0));
  const totalAjustes = redondear2(
    lineas.filter((l) => l.naturaleza === 'ajuste').reduce((acc, l) => acc + l.importe, 0),
  );

  // Cuenta de abono: la indicada o la principal
  const cuenta =
    (entrada.cuentaAbonoId &&
      (propietario.cuentasBancarias || []).find((c) => c.id === entrada.cuentaAbonoId)) ||
    (propietario.cuentasBancarias || []).find((c) => c.esPrincipal) ||
    (propietario.cuentasBancarias || [])[0];

  const id = `liq_${propietario.id}_${periodo}`;
  const hashCalculo = hashContenido(
    JSON.stringify({
      p: propietario.id, per: periodo,
      cobros: [...cobroIds].sort(),
      gastos: [...gastoIds].sort(),
      bruto: totalBrutoCobrado, ded: totalDeducciones, neto: netoFinal,
      cfg: config,
    }),
  );
  const claveIdempotencia = `${propietario.id}|${periodo}|${hashCalculo}`;

  const liquidacion: LiquidacionPropietario = {
    id,
    propietarioId: propietario.id,
    propietarioNombre: propietario.nombre,
    propietarioNif: propietario.nifCif,
    periodo,
    anio,
    mes,
    inmuebleIds: [...inmuebleIds],
    contratoIds: [...contratoIds],
    cobroIds,
    gastoIds,
    lineas,
    totalBrutoCobrado,
    totalDevengadoPendiente,
    totalHonorarios,
    totalIvaHonorarios,
    totalGastos,
    totalRetenciones,
    totalAjustes,
    totalDeducciones: redondear2(totalDeducciones + (netoFinal - netoPropietario)),
    netoPropietario: netoFinal,
    estado: 'BORRADOR',
    configFiscal: config,
    claveIdempotencia,
    hashCalculo,
    cuentaAbonoIban: cuenta?.iban,
    cuentaAbonoTitular: cuenta?.titular || propietario.nombre,
    fechaGeneracion: new Date().toISOString(),
    creadoPor: entrada.actor?.nombre,
    creadoPorId: entrada.actor?.id,
    historial: [
      itemHistorial(
        'Borrador generado',
        `Periodo ${periodo} · Cobrado ${formatoImporteSepa(totalBrutoCobrado)} € · Deducciones ${formatoImporteSepa(totalDeducciones)} € · Neto ${formatoImporteSepa(netoFinal)} € · hash ${hashCalculo}`,
        entrada.actor,
        undefined,
        'BORRADOR',
      ),
    ],
    notas: entrada.notas,
  };

  return { ok: true, errores: [], liquidacion };
}

/** Recalcula un BORRADOR con los mismos u otros inputs (conserva id e historial). */
export function recalcularBorrador(
  previa: LiquidacionPropietario,
  entrada: EntradaLiquidacion,
): ResultadoLiquidacion {
  if (previa.estado !== 'BORRADOR') {
    return { ok: false, errores: [`Solo un BORRADOR puede recalcularse (estado actual: ${previa.estado})`] };
  }
  const res = construirBorradorLiquidacion(entrada);
  if (!res.ok || !res.liquidacion) return res;
  res.liquidacion.historial = [
    ...previa.historial,
    itemHistorial(
      'Borrador recalculado',
      `hash anterior ${previa.hashCalculo} → nuevo ${res.liquidacion.hashCalculo}`,
      entrada.actor,
      'BORRADOR',
      'BORRADOR',
    ),
  ];
  // Conservar fecha de generación original
  res.liquidacion.fechaGeneracion = previa.fechaGeneracion;
  res.liquidacion.creadoPor = previa.creadoPor;
  res.liquidacion.creadoPorId = previa.creadoPorId;
  return res;
}

/** Aprueba un BORRADOR (verifica cuadre y configuración). */
export function aprobarLiquidacion(
  liq: LiquidacionPropietario,
  actor?: { id?: string; nombre?: string },
): ResultadoLiquidacion {
  if (liq.estado !== 'BORRADOR') {
    return { ok: false, errores: [`Solo un BORRADOR puede aprobarse (estado: ${liq.estado})`] };
  }
  const suma = redondear2(liq.lineas.reduce((a, l) => a + l.importe, 0));
  if (Math.abs(suma - liq.netoPropietario) > 0.01) {
    return { ok: false, errores: [`Descuadre ${formatoImporteSepa(suma - liq.netoPropietario)} €: no se puede aprobar`] };
  }
  const valCfg = validarConfigFiscal(liq.configFiscal);
  if (!valCfg.valida) return { ok: false, errores: valCfg.errores };
  if (!liq.cuentaAbonoIban) {
    return { ok: false, errores: ['Sin cuenta de abono (IBAN del propietario). Configure una cuenta bancaria.'] };
  }
  const aprobada: LiquidacionPropietario = {
    ...liq,
    estado: 'APROBADA',
    fechaAprobacion: new Date().toISOString(),
    aprobadaPor: actor?.nombre,
    aprobadaPorId: actor?.id,
    historial: [
      ...liq.historial,
      itemHistorial(
        'Liquidación aprobada',
        `Neto ${formatoImporteSepa(liq.netoPropietario)} € → ${liq.cuentaAbonoIban}`,
        actor,
        'BORRADOR',
        'APROBADA',
      ),
    ],
  };
  return { ok: true, errores: [], liquidacion: aprobada };
}

/** Marca una APROBADA como PAGADA (requiere evidencia bancaria). */
export function marcarLiquidacionPagada(
  liq: LiquidacionPropietario,
  evidencia: { referenciaBancaria: string; fechaPago?: string; ordenPagoId?: string },
  actor?: { id?: string; nombre?: string },
): ResultadoLiquidacion {
  if (liq.estado !== 'APROBADA') {
    return { ok: false, errores: [`Solo una APROBADA puede marcarse PAGADA (estado: ${liq.estado})`] };
  }
  if (!evidencia.referenciaBancaria?.trim()) {
    return { ok: false, errores: ['Se requiere referencia bancaria del pago (evidencia)'] };
  }
  const pagada: LiquidacionPropietario = {
    ...liq,
    estado: 'PAGADA',
    fechaPago: evidencia.fechaPago || new Date().toISOString().slice(0, 10),
    referenciaBancariaPago: evidencia.referenciaBancaria.trim(),
    ordenPagoId: evidencia.ordenPagoId || liq.ordenPagoId,
    historial: [
      ...liq.historial,
      itemHistorial(
        'Pago registrado',
        `Ref. bancaria ${evidencia.referenciaBancaria.trim()}${evidencia.ordenPagoId ? ` · orden ${evidencia.ordenPagoId}` : ''}`,
        actor,
        'APROBADA',
        'PAGADA',
      ),
    ],
  };
  // Línea informativa de pago (importe 0, no altera el neto)
  pagada.lineas = [
    ...pagada.lineas,
    {
      id: `lin_pago_${Date.now().toString(36)}`,
      naturaleza: 'pagado',
      concepto: `Pagado al propietario — ref. ${evidencia.referenciaBancaria.trim()}`,
      importe: 0,
      detalle: `Neto transferido ${formatoImporteSepa(pagada.netoPropietario)} € a ${pagada.cuentaAbonoIban}`,
    },
  ];
  return { ok: true, errores: [], liquidacion: pagada };
}

/** Anula una liquidación (BORRADOR/APROBADA). Las PAGADAS solo se REVERSAN. */
export function anularLiquidacion(
  liq: LiquidacionPropietario,
  motivo: string,
  actor?: { id?: string; nombre?: string },
): ResultadoLiquidacion {
  if (liq.estado !== 'BORRADOR' && liq.estado !== 'APROBADA') {
    return { ok: false, errores: [`No se puede anular en estado ${liq.estado} (use reversión si PAGADA)`] };
  }
  if (!motivo?.trim()) return { ok: false, errores: ['Se requiere motivo de anulación'] };
  return {
    ok: true,
    errores: [],
    liquidacion: {
      ...liq,
      estado: 'ANULADA',
      anuladaMotivo: motivo.trim(),
      historial: [
        ...liq.historial,
        itemHistorial('Liquidación anulada', motivo.trim(), actor, liq.estado, 'ANULADA'),
      ],
    },
  };
}

/** Genera la liquidación de reversión de una PAGADA (trazable, sin borrar). */
export function reversarLiquidacionPagada(
  liq: LiquidacionPropietario,
  motivo: string,
  actor?: { id?: string; nombre?: string },
): ResultadoLiquidacion {
  if (liq.estado !== 'PAGADA') {
    return { ok: false, errores: [`Solo una PAGADA puede reversarse (estado: ${liq.estado})`] };
  }
  if (!motivo?.trim()) return { ok: false, errores: ['Se requiere motivo de reversión'] };
  const reverso: LiquidacionPropietario = {
    ...liq,
    id: `${liq.id}_REV_${Date.now().toString(36)}`,
    estado: 'REVERSADA',
    anuladaMotivo: motivo.trim(),
    reversaALiquidacionId: liq.id,
    lineas: liq.lineas.map((l, i) => ({
      ...l,
      id: `rev_${i}_${l.id}`,
      importe: l.naturaleza === 'pagado' || l.naturaleza === 'devengado_pendiente' ? 0 : redondear2(-l.importe),
      concepto: `REVERSO — ${l.concepto}`,
    })),
    totalBrutoCobrado: redondear2(-liq.totalBrutoCobrado),
    totalDevengadoPendiente: 0,
    totalHonorarios: redondear2(-liq.totalHonorarios),
    totalIvaHonorarios: redondear2(-liq.totalIvaHonorarios),
    totalGastos: redondear2(-liq.totalGastos),
    totalRetenciones: redondear2(-liq.totalRetenciones),
    totalAjustes: redondear2(-liq.totalAjustes),
    totalDeducciones: redondear2(-liq.totalDeducciones),
    netoPropietario: redondear2(-liq.netoPropietario),
    claveIdempotencia: `${liq.claveIdempotencia}|REVERSO`,
    hashCalculo: hashContenido(`REVERSO${liq.claveIdempotencia}${motivo}`),
    historial: [
      ...liq.historial,
      itemHistorial('Liquidación reversada', motivo.trim(), actor, 'PAGADA', 'REVERSADA'),
    ],
  };
  return { ok: true, errores: [], liquidacion: reverso };
}

/** Detecta si ya existe liquidación para propietario+periodo (idempotencia). */
export function existeLiquidacionPeriodo(
  liquidaciones: LiquidacionPropietario[],
  propietarioId: string,
  periodo: string,
): LiquidacionPropietario | undefined {
  return liquidaciones.find(
    (l) => l.propietarioId === propietarioId && l.periodo === periodo && l.estado !== 'ANULADA' && l.estado !== 'REVERSADA',
  );
}
