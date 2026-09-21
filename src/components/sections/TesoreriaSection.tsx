/**
 * BLOQUE B — Sección de Tesorería (Administración):
 * Liquidaciones · Gastos · SEPA pain.008 · SEPA pain.001 · Movimientos.
 */
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  History,
  Landmark,
  Plus,
  Receipt,
  Send,
  ShieldCheck,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  Inmueble,
  Propietario,
  TrabajoProfesional,
  UsuarioApp,
} from '../../types';
import type { MovimientoBancario, PropuestaConciliacion } from '../../types/conciliacion';
import {
  aprobarLiquidacion,
  anularLiquidacion,
  construirBorradorLiquidacion,
  CONFIG_FISCAL_DEFECTO,
  existeLiquidacionPeriodo,
  marcarLiquidacionPagada,
  recalcularBorrador,
} from '../../tesoreria/liquidacionEngine';
import {
  clasificarCobrosPeriodo,
  marcarCobrosLiquidados,
  movimientosBancariosParaLiquidacion,
  proyectarMovimientos,
  resumenGastosLiquidados,
  resumenCobrosLiquidados,
} from '../../tesoreria/conciliacionAdapter';
import { crearGastoManual, gastoDesdeGastoCanonico, gastoDesdeTrabajo } from '../../tesoreria/gastosEngine';
import { generarPain008 } from '../../tesoreria/sepaPain008';
import { aprobarOrdenPago, crearOrdenPagoLiquidacion, generarPain001 } from '../../tesoreria/sepaPain001';
import { calcularCreditorIdES, formatoImporteSepa, validarIban } from '../../tesoreria/sepaUtils';
import { imprimirLiquidacionPDF } from '../../tesoreria/liquidacionPdf';
import {
  eventoLiquidacionAnulada,
  eventoLiquidacionAprobada,
  eventoLiquidacionGenerada,
  eventoLiquidacionPagada,
  eventoSepaError,
  eventoSepaPreparado,
  publicarEventoTesoreria,
} from '../../tesoreria/notificaciones';
import type {
  ConfigFiscalLiquidacion,
  EstadoLiquidacion,
  FicheroSEPA,
  GastoInmueble,
  LiquidacionPropietario,
  MandatoSEPA,
  OrdenPago,
} from '../../tesoreria/tipos';

interface TesoreriaSectionProps {
  contratos: ContratoFormalizacion[];
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  liquidaciones: LiquidacionPropietario[];
  gastos: GastoInmueble[];
  ordenes: OrdenPago[];
  ficheros: FicheroSEPA[];
  mandatos: MandatoSEPA[];
  trabajos?: TrabajoProfesional[];
  currentUser?: UsuarioApp | null;
  /** INTEGRACIÓN A (GAP 6): movimientos bancarios canónicos para evidencia de pago. */
  movimientosBancarios?: MovimientoBancario[];
  /** INTEGRACIÓN A (GAP 6): propuestas de conciliación (estado CONFIRMADO = conciliado). */
  propuestasConciliacion?: PropuestaConciliacion[];
  /** INTEGRACIÓN A: gastos del modelo oficial (colección `gastos`) para importación. */
  gastosCanonicos?: Gasto[];
  onSaveLiquidacion: (l: LiquidacionPropietario) => Promise<void> | void;
  onSaveGasto: (g: GastoInmueble) => Promise<void> | void;
  onDeleteGasto: (id: string) => Promise<void> | void;
  onSaveOrdenPago: (o: OrdenPago) => Promise<void> | void;
  onSaveFicheroSepa: (f: FicheroSEPA) => Promise<void> | void;
  onSaveMandato: (m: MandatoSEPA) => Promise<void> | void;
  onSaveContratos: (cs: ContratoFormalizacion[]) => Promise<void> | void;
}

type TabId = 'liquidaciones' | 'gastos' | 'sepa008' | 'sepa001' | 'movimientos';

function periodoActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function badgeEstadoLiquidacion(e: EstadoLiquidacion) {
  switch (e) {
    case 'BORRADOR': return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'APROBADA': return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'PAGADA': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'ANULADA': return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'REVERSADA': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export const TesoreriaSection: React.FC<TesoreriaSectionProps> = (props) => {
  const {
    contratos, inmuebles, propietarios, liquidaciones, gastos, ordenes, ficheros, mandatos,
    trabajos = [], currentUser,
    movimientosBancarios = [], propuestasConciliacion = [], gastosCanonicos = [],
    onSaveLiquidacion, onSaveGasto, onDeleteGasto,
    onSaveOrdenPago, onSaveFicheroSepa, onSaveMandato, onSaveContratos,
  } = props;

  const [tab, setTab] = useState<TabId>('liquidaciones');
  const [filtroProp, setFiltroProp] = useState<string>('TODOS');
  const [detalleLiq, setDetalleLiq] = useState<LiquidacionPropietario | null>(null);
  const [showGenerar, setShowGenerar] = useState(false);
  const [showGasto, setShowGasto] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // Form generar liquidación
  const [genPropId, setGenPropId] = useState(propietarios[0]?.id || '');
  const [genPeriodo, setGenPeriodo] = useState(periodoActual());
  const [genHonorarios, setGenHonorarios] = useState(CONFIG_FISCAL_DEFECTO.honorariosPct);
  const [genIva, setGenIva] = useState(CONFIG_FISCAL_DEFECTO.ivaHonorariosPct);
  const [genAplicaIva, setGenAplicaIva] = useState(true);
  const [genRetencion, setGenRetencion] = useState(false);
  const [genRetPct, setGenRetPct] = useState(19);
  const [genMotivoRet, setGenMotivoRet] = useState('');
  const [genFuente, setGenFuente] = useState(CONFIG_FISCAL_DEFECTO.fuenteRegla || '');

  // Form gasto manual
  const [gInmuebleId, setGInmuebleId] = useState('');
  const [gConcepto, setGConcepto] = useState('');
  const [gImporte, setGImporte] = useState(0);
  const [gEsBase, setGEsBase] = useState(false);
  const [gIva, setGIva] = useState(21);
  const [gFecha, setGFecha] = useState(new Date().toISOString().slice(0, 10));
  const [gCategoria, setGCategoria] = useState('reparacion');
  const [gFactura, setGFactura] = useState('');
  const [gProveedor, setGProveedor] = useState('');

  // Form SEPA 008
  const [s008Acreedor, setS008Acreedor] = useState('Administración RentSelect');
  const [s008CI, setS008CI] = useState('');
  const [s008Iban, setS008Iban] = useState('');
  const [s008Fecha, setS008Fecha] = useState(new Date().toISOString().slice(0, 10));
  const [s008Sel, setS008Sel] = useState<string[]>([]);
  // Mandato rápido
  const [mCobroId, setMCobroId] = useState('');
  const [mNombre, setMNombre] = useState('');
  const [mIban, setMIban] = useState('');
  const [mFecha, setMFecha] = useState(new Date().toISOString().slice(0, 10));
  const [mSec, setMSec] = useState<'FRST' | 'RCUR' | 'FNAL' | 'OOFF'>('RCUR');

  // Form SEPA 001
  const [s001Ord, setS001Ord] = useState('Administración RentSelect');
  const [s001Iban, setS001Iban] = useState('');
  const [s001Fecha, setS001Fecha] = useState(new Date().toISOString().slice(0, 10));
  const [s001Sel, setS001Sel] = useState<string[]>([]);

  // Pago liquidación
  const [pagoLiq, setPagoLiq] = useState<LiquidacionPropietario | null>(null);
  const [pagoRef, setPagoRef] = useState('');
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [pagoEvidenciaId, setPagoEvidenciaId] = useState<string>('');

  // Evidencia de pago desde movimiento bancario conciliado (GAP 6)
  const evidenciasPago = useMemo(() => {
    if (!pagoLiq) return [];
    return movimientosBancariosParaLiquidacion(movimientosBancarios, propuestasConciliacion, pagoLiq);
  }, [movimientosBancarios, propuestasConciliacion, pagoLiq]);

  const onElegirEvidencia = (idMov: string) => {
    setPagoEvidenciaId(idMov);
    if (!idMov) return;
    const ev = evidenciasPago.find((e) => e.idMovimiento === idMov);
    if (ev) {
      setPagoRef(ev.referenciaBancaria);
      if (ev.fechaPago) setPagoFecha(ev.fechaPago);
    }
  };

  // INTEGRACIÓN A: importación unidireccional del modelo oficial `gastos` (colección canónica)
  const [showGastoImport, setShowGastoImport] = useState(false);
  const [gimpId, setGimpId] = useState('');
  const [gimpImputa, setGimpImputa] = useState<'propietario' | 'inquilino'>('propietario');

  const gastosCanonicosImportables = useMemo(() => {
    return gastosCanonicos.filter((g) => !gastos.some((gi) => gi.id === `gas_gasto_${g.id}`));
  }, [gastosCanonicos, gastos]);

  const handleImportarGastoCanonico = () => {
    const g = gastosCanonicos.find((x) => x.id === gimpId);
    if (!g) { avisar('error', 'Seleccione un gasto canónico'); return; }
    const res = gastoDesdeGastoCanonico(g, gastos.find((gi) => gi.id === `gas_gasto_${g.id}`), { imputableA: gimpImputa });
    if (!res.ok || !res.gasto) { avisar('error', res.errores.join(' · ')); return; }
    void onSaveGasto(res.gasto);
    setShowGastoImport(false);
    setGimpId('');
    avisar('ok', `Gasto canónico ${g.id} importado a la liquidación (idempotente, sin duplicar).`);
  };

  const actor = { id: currentUser?.id, nombre: currentUser?.nombre || currentUser?.email || 'Administración' };

  const avisar = (tipo: 'ok' | 'error', texto: string) => {
    setMensaje({ tipo, texto });
    setTimeout(() => setMensaje(null), 6000);
  };

  const liqsFiltradas = useMemo(() => {
    const list = filtroProp === 'TODOS' ? liquidaciones : liquidaciones.filter((l) => l.propietarioId === filtroProp);
    return [...list].sort((a, b) => (a.periodo < b.periodo ? 1 : -1));
  }, [liquidaciones, filtroProp]);

  const cobrosPendientesDomiciliar = useMemo(() => {
    const out: CobroPeriodo[] = [];
    for (const c of contratos) {
      for (const p of c.registroCobros || []) {
        if ((p.estado === 'PENDIENTE' || p.estado === 'RETRASADO') && (p.importePrevisto || 0) > 0) out.push(p);
      }
    }
    return out.slice(0, 200);
  }, [contratos]);

  const movimientos = useMemo(
    () => proyectarMovimientos(contratos, liquidaciones, ordenes, gastos),
    [contratos, liquidaciones, ordenes, gastos],
  );

  const metricas = useMemo(() => {
    const vigentes = liquidaciones.filter((l) => l.estado !== 'ANULADA' && l.estado !== 'REVERSADA');
    return {
      numLiq: vigentes.length,
      netoTotal: vigentes.reduce((s, l) => s + (l.netoPropietario || 0), 0),
      pagadas: vigentes.filter((l) => l.estado === 'PAGADA').length,
      borradores: vigentes.filter((l) => l.estado === 'BORRADOR').length,
      numFicheros: ficheros.filter((f) => f.estado !== 'ANULADO').length,
      gastoPendiente: gastos.filter((g) => g.estado === 'pendiente').reduce((s, g) => s + (g.total || 0), 0),
    };
  }, [liquidaciones, ficheros, gastos]);

  // ---- Acciones liquidación ----
  const handleGenerar = async (e: React.FormEvent) => {
    e.preventDefault();
    const propietario = propietarios.find((p) => p.id === genPropId);
    if (!propietario) { avisar('error', 'Seleccione un propietario'); return; }
    const existente = existeLiquidacionPeriodo(liquidaciones, genPropId, genPeriodo);
    if (existente) { avisar('error', `Ya existe liquidación ${genPeriodo} en estado ${existente.estado} (idempotencia)`); return; }

    const config: ConfigFiscalLiquidacion = {
      honorariosPct: Number(genHonorarios) || 0,
      ivaHonorariosPct: Number(genIva) || 0,
      aplicaIvaHonorarios: genAplicaIva,
      aplicaRetencion: genRetencion,
      retencionPct: Number(genRetPct) || 0,
      motivoRetencion: genMotivoRet.trim() || undefined,
      fuenteRegla: genFuente.trim() || undefined,
    };
    const cobroIdsExcl = [...resumenCobrosLiquidados(liquidaciones)];
    const gastoIdsExcl = [...resumenGastosLiquidados(liquidaciones)];
    const res = construirBorradorLiquidacion({
      propietario, periodo: genPeriodo, contratos, gastos, config, actor,
      cobroIdsExcluidos: cobroIdsExcl, gastoIdsExcluidos: gastoIdsExcl,
    });
    if (!res.ok || !res.liquidacion) { avisar('error', res.errores.join(' · ')); return; }
    await onSaveLiquidacion(res.liquidacion);
    // Marcar gastos como liquidados
    for (const gid of res.liquidacion.gastoIds) {
      const g = gastos.find((x) => x.id === gid);
      if (g && g.estado !== 'liquidado') await onSaveGasto({ ...g, estado: 'liquidado', liquidacionId: res.liquidacion.id, fechaActualizacion: new Date().toISOString() });
    }
    publicarEventoTesoreria(eventoLiquidacionGenerada({
      liquidacionId: res.liquidacion.id, periodo: genPeriodo, propietarioId: propietario.id,
      propietarioNombre: propietario.nombre, neto: res.liquidacion.netoPropietario, actorNombre: actor.nombre,
    }));
    setShowGenerar(false);
    avisar('ok', `Borrador ${genPeriodo} generado: neto ${formatoImporteSepa(res.liquidacion.netoPropietario)} € (hash ${res.liquidacion.hashCalculo})`);
  };

  const handleRecalcular = async (liq: LiquidacionPropietario) => {
    const propietario = propietarios.find((p) => p.id === liq.propietarioId);
    if (!propietario) { avisar('error', 'Propietario no encontrado'); return; }
    const otras = liquidaciones.filter((l) => l.id !== liq.id);
    const res = recalcularBorrador(liq, {
      propietario, periodo: liq.periodo, contratos, gastos, config: liq.configFiscal, actor,
      cobroIdsExcluidos: [...resumenCobrosLiquidados(otras)],
      gastoIdsExcluidos: [...resumenGastosLiquidados(otras)],
    });
    if (!res.ok || !res.liquidacion) { avisar('error', res.errores.join(' · ')); return; }
    await onSaveLiquidacion(res.liquidacion);
    setDetalleLiq(res.liquidacion);
    avisar('ok', `Borrador recalculado (hash ${res.liquidacion.hashCalculo})`);
  };

  const handleAprobar = async (liq: LiquidacionPropietario) => {
    const res = aprobarLiquidacion(liq, actor);
    if (!res.ok || !res.liquidacion) { avisar('error', res.errores.join(' · ')); return; }
    await onSaveLiquidacion(res.liquidacion);
    // Conciliación posterior: marcar cobros incluidos
    const actualizados = marcarCobrosLiquidados(contratos, res.liquidacion.cobroIds, res.liquidacion.id, actor.nombre);
    await onSaveContratos(actualizados);
    publicarEventoTesoreria(eventoLiquidacionAprobada({
      liquidacionId: liq.id, periodo: liq.periodo, propietarioId: liq.propietarioId,
      propietarioNombre: liq.propietarioNombre, neto: liq.netoPropietario, actorNombre: actor.nombre,
    }));
    setDetalleLiq(res.liquidacion);
    avisar('ok', 'Liquidación APROBADA y lista para pago');
  };

  const handleAnular = async (liq: LiquidacionPropietario) => {
    const motivo = window.prompt('Motivo de anulación (obligatorio, queda en trazabilidad):');
    if (!motivo?.trim()) return;
    const res = anularLiquidacion(liq, motivo.trim(), actor);
    if (!res.ok || !res.liquidacion) { avisar('error', res.errores.join(' · ')); return; }
    await onSaveLiquidacion(res.liquidacion);
    // Liberar gastos
    for (const gid of liq.gastoIds) {
      const g = gastos.find((x) => x.id === gid);
      if (g && g.liquidacionId === liq.id) await onSaveGasto({ ...g, estado: 'pendiente', liquidacionId: undefined, fechaActualizacion: new Date().toISOString() });
    }
    publicarEventoTesoreria(eventoLiquidacionAnulada({
      liquidacionId: liq.id, periodo: liq.periodo, propietarioId: liq.propietarioId,
      propietarioNombre: liq.propietarioNombre, neto: liq.netoPropietario, actorNombre: actor.nombre, motivo: motivo.trim(),
    }));
    setDetalleLiq(res.liquidacion);
    avisar('ok', 'Liquidación ANULADA (trazabilidad conservada)');
  };

  const handleConfirmarPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pagoLiq || !pagoRef.trim()) { avisar('error', 'Indique la referencia bancaria del pago'); return; }
    const res = marcarLiquidacionPagada(pagoLiq, { referenciaBancaria: pagoRef.trim(), fechaPago: pagoFecha }, actor);
    if (!res.ok || !res.liquidacion) { avisar('error', res.errores.join(' · ')); return; }
    await onSaveLiquidacion(res.liquidacion);
    publicarEventoTesoreria(eventoLiquidacionPagada({
      liquidacionId: pagoLiq.id, periodo: pagoLiq.periodo, propietarioId: pagoLiq.propietarioId,
      propietarioNombre: pagoLiq.propietarioNombre, neto: pagoLiq.netoPropietario,
      actorNombre: actor.nombre, referenciaBancaria: pagoRef.trim(),
    }));
    setPagoLiq(null); setPagoRef('');
    setDetalleLiq(res.liquidacion);
    avisar('ok', 'Pago registrado con evidencia bancaria');
  };

  const handleCrearOrden = async (liq: LiquidacionPropietario) => {
    const prop = propietarios.find((p) => p.id === liq.propietarioId);
    const cuenta = (prop?.cuentasBancarias || []).find((c) => c.iban === liq.cuentaAbonoIban) || (prop?.cuentasBancarias || [])[0];
    const res = crearOrdenPagoLiquidacion(
      { id: liq.id, periodo: liq.periodo, propietarioNombre: liq.propietarioNombre, netoPropietario: liq.netoPropietario, cuentaAbonoIban: liq.cuentaAbonoIban, estado: liq.estado },
      cuenta?.swiftBic, actor,
    );
    if (!res.ok || !res.orden) { avisar('error', res.errores.join(' · ')); return; }
    const existente = ordenes.find((o) => o.id === res.orden!.id);
    if (existente) { avisar('error', `Ya existe orden ${res.orden.id} en estado ${existente.estado} (idempotencia)`); return; }
    const aprobada = aprobarOrdenPago(res.orden, actor);
    await onSaveOrdenPago(aprobada);
    await onSaveLiquidacion({ ...liq, ordenPagoId: aprobada.id, historial: [...liq.historial, { id: `h_op_${Date.now().toString(36)}`, fecha: new Date().toISOString(), actorNombre: actor.nombre, accion: 'Orden de pago creada', detalle: aprobada.id }] });
    avisar('ok', `Orden ${aprobada.id} creada y APROBADA (lista para pain.001)`);
  };

  // ---- Gastos ----
  const handleCrearGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    const inm = inmuebles.find((i) => i.id === gInmuebleId);
    const propId = inm?.propietarioId || inm?.propietarioPrincipalId || '';
    if (!inm || !propId) { avisar('error', 'Seleccione un inmueble con propietario vinculado'); return; }
    const res = crearGastoManual({
      inmuebleId: inm.id, inmuebleDireccion: inm.direccion, propietarioId: propId,
      categoria: gCategoria, concepto: gConcepto, baseOtotal: Number(gImporte) || 0,
      esBaseSinIva: gEsBase, ivaPct: Number(gIva) || 0, fechaGasto: gFecha,
      pagadoPor: 'administracion', imputableA: 'propietario',
      facturaNumero: gFactura.trim() || undefined, proveedorNombre: gProveedor.trim() || undefined, actor,
    });
    if (!res.ok || !res.gasto) { avisar('error', res.errores.join(' · ')); return; }
    await onSaveGasto(res.gasto);
    setShowGasto(false); setGConcepto(''); setGImporte(0); setGFactura(''); setGProveedor('');
    avisar('ok', `Gasto registrado: ${formatoImporteSepa(res.gasto.total)} €`);
  };

  const handleImportarTrabajo = async (t: TrabajoProfesional) => {
    const ya = gastos.find((g) => g.id === `gas_${t.id}`);
    if (ya) { avisar('error', `El trabajo ya generó el gasto ${ya.id} (idempotencia)`); return; }
    const res = gastoDesdeTrabajo(t, { actor });
    if (!res.ok || !res.gasto) { avisar('error', res.errores.join(' · ')); return; }
    await onSaveGasto(res.gasto);
    avisar('ok', `Gasto importado del trabajo: ${formatoImporteSepa(res.gasto.total)} €`);
  };

  // ---- SEPA 008 ----
  const handleGuardarMandato = async (e: React.FormEvent) => {
    e.preventDefault();
    const cobro = cobrosPendientesDomiciliar.find((c) => c.id === mCobroId);
    if (!cobro) { avisar('error', 'Seleccione el cobro origen del mandato'); return; }
    const ib = validarIban(mIban);
    if (!ib.valido) { avisar('error', `IBAN deudor: ${ib.error}`); return; }
    if (!mNombre.trim()) { avisar('error', 'Indique el nombre del deudor'); return; }
    const mandato: MandatoSEPA = {
      id: `MND-${cobro.contratoId}-${cobro.periodoMesAnio}`.replace(/[^A-Za-z0-9-]/g, ''),
      deudorNombre: mNombre.trim(), deudorIban: ib.iban!,
      acreedorNombre: s008Acreedor, acreedorId: s008CI || calcularCreditorIdES('000', 'B00000000'),
      fechaFirma: mFecha, secuencia: mSec, esquema: 'CORE',
      contratoId: cobro.contratoId, inmuebleId: cobro.inmuebleId,
      referenciaContrato: cobro.id, activo: true, fechaCreacion: new Date().toISOString(),
    };
    await onSaveMandato(mandato);
    setMNombre(''); setMIban(''); setMCobroId('');
    avisar('ok', `Mandato ${mandato.id} guardado`);
  };

  const handleGenerar008 = async (e: React.FormEvent) => {
    e.preventDefault();
    const adeudos = cobrosPendientesDomiciliar
      .filter((c) => s008Sel.includes(c.id))
      .map((cobro) => {
        const mandato = mandatos.find((m) => m.activo && (m.referenciaContrato === cobro.id || (m.contratoId === cobro.contratoId)));
        return mandato ? { cobro, mandato } : null;
      })
      .filter(Boolean) as { cobro: CobroPeriodo; mandato: MandatoSEPA }[];
    if (adeudos.length === 0) { avisar('error', 'Seleccione cobros con mandato SEPA activo'); return; }
    const res = generarPain008({
      acreedor: { nombre: s008Acreedor, creditorId: s008CI, iban: s008Iban },
      adeudos, fechaCobro: s008Fecha, esquema: 'CORE', actor, ficherosExistentes: ficheros,
    });
    if (!res.ok || !res.fichero) {
      publicarEventoTesoreria(eventoSepaError({ ficheroId: 'nuevo', tipo: 'pain.008', msgId: '—', numOperaciones: adeudos.length, importeTotal: 0, actorNombre: actor.nombre, errores: res.errores }));
      avisar('error', res.errores.join(' · ')); return;
    }
    const preparado: FicheroSEPA = { ...res.fichero, estado: 'PREPARADO', historial: [...res.fichero.historial, { id: `h_prep_${Date.now().toString(36)}`, fecha: new Date().toISOString(), accion: 'Fichero preparado para banca electrónica', actorNombre: actor.nombre }] };
    await onSaveFicheroSepa(preparado);
    publicarEventoTesoreria(eventoSepaPreparado({ ficheroId: preparado.id, tipo: 'pain.008', msgId: preparado.msgId, numOperaciones: preparado.numOperaciones, importeTotal: preparado.importeTotal, actorNombre: actor.nombre }));
    setS008Sel([]);
    avisar('ok', `pain.008 ${preparado.msgId}: ${preparado.numOperaciones} adeudos, ${formatoImporteSepa(preparado.importeTotal)} €`);
  };

  // ---- SEPA 001 ----
  const handleGenerar001 = async (e: React.FormEvent) => {
    e.preventDefault();
    const seleccionadas = ordenes.filter((o) => s001Sel.includes(o.id));
    if (seleccionadas.length === 0) { avisar('error', 'Seleccione órdenes APROBADAS'); return; }
    const res = generarPain001({
      ordenante: { nombre: s001Ord, iban: s001Iban },
      ordenes: seleccionadas, fechaEjecucion: s001Fecha, actor, ficherosExistentes: ficheros,
    });
    if (!res.ok || !res.fichero) {
      publicarEventoTesoreria(eventoSepaError({ ficheroId: 'nuevo', tipo: 'pain.001', msgId: '—', numOperaciones: seleccionadas.length, importeTotal: 0, actorNombre: actor.nombre, errores: res.errores }));
      avisar('error', res.errores.join(' · ')); return;
    }
    const preparado: FicheroSEPA = { ...res.fichero, estado: 'PREPARADO', historial: [...res.fichero.historial, { id: `h_prep_${Date.now().toString(36)}`, fecha: new Date().toISOString(), accion: 'Fichero preparado para banca electrónica', actorNombre: actor.nombre }] };
    await onSaveFicheroSepa(preparado);
    for (const o of seleccionadas) {
      await onSaveOrdenPago({ ...o, estado: 'EN_FICHERO', ficheroSepaId: preparado.id, historial: [...o.historial, { id: `h_f_${Date.now().toString(36)}`, fecha: new Date().toISOString(), accion: `Incluida en fichero ${preparado.msgId}`, actorNombre: actor.nombre }] });
    }
    publicarEventoTesoreria(eventoSepaPreparado({ ficheroId: preparado.id, tipo: 'pain.001', msgId: preparado.msgId, numOperaciones: preparado.numOperaciones, importeTotal: preparado.importeTotal, actorNombre: actor.nombre }));
    setS001Sel([]);
    avisar('ok', `pain.001 ${preparado.msgId}: ${preparado.numOperaciones} transferencias, ${formatoImporteSepa(preparado.importeTotal)} €`);
  };

  const descargarXml = async (f: FicheroSEPA) => {
    const blob = new Blob([f.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${f.msgId}.xml`; a.click();
    URL.revokeObjectURL(url);
    await onSaveFicheroSepa({ ...f, estado: 'DESCARGADO', historial: [...f.historial, { id: `h_dl_${Date.now().toString(36)}`, fecha: new Date().toISOString(), accion: 'Fichero descargado', actorNombre: actor.nombre }] });
  };

  const trabajosFinalizados = useMemo(
    () => trabajos.filter((t) => (t.estado === 'FINALIZADO' || t.estado === 'FINALIZADA') && Number(t.importeFinal) > 0).slice(0, 50),
    [trabajos],
  );

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'liquidaciones', label: 'Liquidaciones', icon: <Wallet className="w-4 h-4" /> },
    { id: 'gastos', label: 'Gastos', icon: <Receipt className="w-4 h-4" /> },
    { id: 'sepa008', label: 'SEPA Adeudos (008)', icon: <Download className="w-4 h-4" /> },
    { id: 'sepa001', label: 'SEPA Pagos (001)', icon: <Send className="w-4 h-4" /> },
    { id: 'movimientos', label: 'Movimientos', icon: <Landmark className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
            <Banknote className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Tesorería y Liquidaciones</h2>
            <p className="text-xs text-slate-500">Cobro → Banco → Liquidación propietario → Pago · SEPA pain.008 / pain.001 (generar→validar→preparar)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={filtroProp} onChange={(e) => setFiltroProp(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
            <option value="TODOS">Todos los propietarios</option>
            {propietarios.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={() => { setGenPropId(propietarios[0]?.id || ''); setShowGenerar(true); }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5">
            <Plus className="w-4 h-4" /><span>Nueva liquidación</span>
          </button>
        </div>
      </div>

      {mensaje && (
        <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2 ${mensaje.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {mensaje.tipo === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{mensaje.texto}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Liquidaciones', valor: String(metricas.numLiq) },
          { label: 'Neto acumulado', valor: `${formatoImporteSepa(metricas.netoTotal)} €` },
          { label: 'Pagadas', valor: String(metricas.pagadas) },
          { label: 'Borradores', valor: String(metricas.borradores) },
          { label: 'Ficheros SEPA', valor: String(metricas.numFicheros) },
          { label: 'Gasto pendiente', valor: `${formatoImporteSepa(metricas.gastoPendiente)} €` },
        ].map((m) => (
          <div key={m.label} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] text-slate-500">{m.label}</div>
            <div className="text-lg font-bold text-slate-900 font-mono">{m.valor}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="flex overflow-x-auto border-b border-slate-200 px-3">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 whitespace-nowrap ${tab === t.id ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'liquidaciones' && (
            <div className="space-y-4">
              {liqsFiltradas.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-700">Sin liquidaciones</p>
                  <p>Genere el primer borrador mensual por propietario. Solo se liquida lo efectivamente cobrado.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600 border-b">
                      <tr><th className="py-2.5 px-3">Periodo</th><th className="py-2.5 px-3">Propietario</th><th className="py-2.5 px-3 text-right">Bruto</th><th className="py-2.5 px-3 text-right">Deducc.</th><th className="py-2.5 px-3 text-right">Neto</th><th className="py-2.5 px-3 text-center">Estado</th><th className="py-2.5 px-3 text-right">Acciones</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {liqsFiltradas.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="py-3 px-3 font-bold">{l.periodo}</td>
                          <td className="py-3 px-3">{l.propietarioNombre}</td>
                          <td className="py-3 px-3 text-right font-mono">{formatoImporteSepa(l.totalBrutoCobrado)} €</td>
                          <td className="py-3 px-3 text-right font-mono text-rose-700">−{formatoImporteSepa(l.totalDeducciones)} €</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700">{formatoImporteSepa(l.netoPropietario)} €</td>
                          <td className="py-3 px-3 text-center"><span className={`px-2 py-1 rounded-full border text-[10px] font-bold ${badgeEstadoLiquidacion(l.estado)}`}>{l.estado}</span></td>
                          <td className="py-3 px-3">
                            <div className="flex justify-end gap-1.5 flex-wrap">
                              <button onClick={() => setDetalleLiq(l)} className="px-2.5 py-1.5 bg-slate-800 text-white rounded-lg text-[11px] font-bold">Detalle</button>
                              <button onClick={() => imprimirLiquidacionPDF(l)} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold flex items-center gap-1"><FileText className="w-3.5 h-3.5" />PDF</button>
                              {l.estado === 'BORRADOR' && <button onClick={() => handleAprobar(l)} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-[11px] font-bold">Aprobar</button>}
                              {l.estado === 'APROBADA' && (<>
                                <button onClick={() => handleCrearOrden(l)} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold">Orden pago</button>
                                <button onClick={() => { setPagoLiq(l); setPagoRef(''); setPagoEvidenciaId(''); }} className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-bold">Pagar</button>
                              </>)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {ordenes.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-800 mb-2 mt-2">Órdenes de pago ({ordenes.length})</h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="py-2 px-3">Orden</th><th className="py-2 px-3">Beneficiario</th><th className="py-2 px-3 text-right">Importe</th><th className="py-2 px-3">Origen</th><th className="py-2 px-3">Estado</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {ordenes.slice(0, 30).map((o) => (
                          <tr key={o.id}><td className="py-2 px-3 font-mono text-[11px]">{o.id}</td><td className="py-2 px-3">{o.beneficiarioNombre}</td><td className="py-2 px-3 text-right font-mono font-bold">{formatoImporteSepa(o.importe)} €</td><td className="py-2 px-3 text-[11px]">{o.origenTipo}:{o.origenId}</td><td className="py-2 px-3"><span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold">{o.estado}</span></td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'gastos' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h4 className="text-xs font-bold text-slate-800">Gastos imputables ({gastos.length}) — base/IVA/total, origen trazable</h4>
                <div className="flex gap-2">
                  <button onClick={() => { setGInmuebleId(inmuebles[0]?.id || ''); setShowGasto(true); }} className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Plus className="w-4 h-4" /><span>Nuevo gasto</span></button>
                  {gastosCanonicosImportables.length > 0 && (
                    <button onClick={() => { setGimpId(gastosCanonicosImportables[0].id); setGimpImputa('propietario'); setShowGastoImport(true); }} className="px-3 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"><Upload className="w-4 h-4" /><span>Importar de gastos canónicos ({gastosCanonicosImportables.length})</span></button>
                  )}
                </div>
              </div>
              {trabajosFinalizados.filter((t) => !gastos.some((g) => g.id === `gas_${t.id}`)).length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                  <p className="font-bold text-amber-900 mb-2 flex items-center gap-1.5"><Upload className="w-4 h-4" />Trabajos finalizados pendientes de importar como gasto</p>
                  <div className="flex flex-wrap gap-2">
                    {trabajosFinalizados.filter((t) => !gastos.some((g) => g.id === `gas_${t.id}`)).slice(0, 10).map((t) => (
                      <button key={t.id} onClick={() => handleImportarTrabajo(t)} className="px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-[11px] font-semibold hover:bg-amber-100">
                        {t.titulo} — {formatoImporteSepa(Number(t.importeFinal) || 0)} €
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600 border-b"><tr><th className="py-2.5 px-3">Fecha</th><th className="py-2.5 px-3">Concepto</th><th className="py-2.5 px-3">Inmueble</th><th className="py-2.5 px-3 text-right">Base</th><th className="py-2.5 px-3 text-right">IVA</th><th className="py-2.5 px-3 text-right">Total</th><th className="py-2.5 px-3">Estado</th><th className="py-2.5 px-3"></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {gastos.slice(0, 100).map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 whitespace-nowrap">{g.fechaGasto}</td>
                        <td className="py-2.5 px-3"><span className="font-semibold">{g.concepto}</span><span className="text-[10px] text-slate-400 block">{g.categoria}{g.facturaNumero ? ` · Fact. ${g.facturaNumero}` : ''}{g.trabajoId ? ` · trabajo ${g.trabajoId}` : ''}</span></td>
                        <td className="py-2.5 px-3 text-[11px]">{g.inmuebleDireccion || g.inmuebleId}</td>
                        <td className="py-2.5 px-3 text-right font-mono">{formatoImporteSepa(g.base)} €</td>
                        <td className="py-2.5 px-3 text-right font-mono text-[11px]">{formatoImporteSepa(g.ivaImporte)} € ({g.ivaPct}%)</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold">{formatoImporteSepa(g.total)} €</td>
                        <td className="py-2.5 px-3"><span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold">{g.estado}{g.liquidacionId ? ` · ${g.liquidacionId}` : ''}</span></td>
                        <td className="py-2.5 px-3 text-right">{(g.estado === 'pendiente') && <button onClick={() => { if (window.confirm('¿Eliminar gasto pendiente?')) onDeleteGasto(g.id); }} className="text-rose-600 text-[11px] font-bold">Eliminar</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'sepa008' && (
            <div className="space-y-5">
              <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900">
                <p className="font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />SEPA Direct Debit — pain.008.001.02 (CORE)</p>
                <p className="mt-1">Generar → Validar → Preparar. El fichero se descarga para banca electrónica; <strong>nunca se ejecuta ningún cargo automáticamente</strong>. Cada adeudo requiere mandato (MndtId + firma) y produce EndToEndId trazable al cobro.</p>
              </div>
              <form onSubmit={handleGenerar008} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div><label className="font-semibold block mb-1">Acreedor</label><input value={s008Acreedor} onChange={(e) => setS008Acreedor(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl" /></div>
                <div><label className="font-semibold block mb-1">Creditor ID (AT-02)</label><input value={s008CI} onChange={(e) => setS008CI(e.target.value)} placeholder="ES... (validación mod-97)" className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono" /></div>
                <div><label className="font-semibold block mb-1">IBAN abono acreedor</label><input value={s008Iban} onChange={(e) => setS008Iban(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono" /></div>
                <div><label className="font-semibold block mb-1">Fecha de cobro</label><input type="date" value={s008Fecha} onChange={(e) => setS008Fecha(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl" /></div>
                <div className="sm:col-span-2 lg:col-span-4">
                  <label className="font-semibold block mb-1">Cobros pendientes a domiciliar ({cobrosPendientesDomiciliar.length}) — marque con mandato activo</label>
                  <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
                    {cobrosPendientesDomiciliar.length === 0 && <p className="p-3 text-slate-400 italic">Sin cobros pendientes</p>}
                    {cobrosPendientesDomiciliar.map((c) => {
                      const tieneMandato = mandatos.some((m) => m.activo && (m.referenciaContrato === c.id || m.contratoId === c.contratoId));
                      return (
                        <label key={c.id} className="flex items-center gap-2 p-2 text-[11px] hover:bg-slate-50">
                          <input type="checkbox" checked={s008Sel.includes(c.id)} onChange={(e) => setS008Sel(e.target.checked ? [...s008Sel, c.id] : s008Sel.filter((x) => x !== c.id))} />
                          <span className="font-semibold">{c.nombreMes}</span><span className="text-slate-500 truncate">{c.inmuebleDireccion} · {c.inquilinoNombre}</span>
                          <span className="ml-auto font-mono font-bold">{formatoImporteSepa(c.importePrevisto)} €</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${tieneMandato ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{tieneMandato ? 'mandato ✓' : 'sin mandato'}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">Generar y validar pain.008 ({s008Sel.length})</button>
                </div>
              </form>

              <form onSubmit={handleGuardarMandato} className="p-4 bg-white border border-slate-200 rounded-xl text-xs space-y-3">
                <p className="font-bold text-slate-800">Alta rápida de mandato SEPA (vinculado a cobro)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div><label className="font-semibold block mb-1">Cobro origen</label><select value={mCobroId} onChange={(e) => setMCobroId(e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-xl"><option value="">—</option>{cobrosPendientesDomiciliar.map((c) => <option key={c.id} value={c.id}>{c.nombreMes} · {c.inquilinoNombre} · {formatoImporteSepa(c.importePrevisto)} €</option>)}</select></div>
                  <div><label className="font-semibold block mb-1">Deudor</label><input value={mNombre} onChange={(e) => setMNombre(e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-xl" /></div>
                  <div><label className="font-semibold block mb-1">IBAN deudor</label><input value={mIban} onChange={(e) => setMIban(e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-xl font-mono" /></div>
                  <div><label className="font-semibold block mb-1">Firma</label><input type="date" value={mFecha} onChange={(e) => setMFecha(e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-xl" /></div>
                  <div><label className="font-semibold block mb-1">Secuencia</label><select value={mSec} onChange={(e) => setMSec(e.target.value as 'FRST' | 'RCUR' | 'FNAL' | 'OOFF')} className="w-full px-2 py-2 border border-slate-200 rounded-xl"><option>FRST</option><option>RCUR</option><option>FNAL</option><option>OOFF</option></select></div>
                </div>
                <div className="flex justify-end"><button type="submit" className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold">Guardar mandato</button></div>
              </form>

              <FicherosList ficheros={ficheros.filter((f) => f.tipo === 'pain.008')} onDescargar={descargarXml} />
            </div>
          )}

          {tab === 'sepa001' && (
            <div className="space-y-5">
              <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs text-indigo-900">
                <p className="font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" />SEPA Credit Transfer — pain.001.001.03 (SCT)</p>
                <p className="mt-1">Liquidación aprobada → orden de pago → fichero pain.001 → preparado para banca electrónica → conciliación posterior. <strong>Se rechaza cualquier importe sin origen trazable.</strong></p>
              </div>
              <form onSubmit={handleGenerar001} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div><label className="font-semibold block mb-1">Ordenante</label><input value={s001Ord} onChange={(e) => setS001Ord(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl" /></div>
                <div><label className="font-semibold block mb-1">IBAN cargo</label><input value={s001Iban} onChange={(e) => setS001Iban(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono" /></div>
                <div><label className="font-semibold block mb-1">Fecha ejecución</label><input type="date" value={s001Fecha} onChange={(e) => setS001Fecha(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl" /></div>
                <div className="sm:col-span-3">
                  <label className="font-semibold block mb-1">Órdenes APROBADAS a incluir</label>
                  <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
                    {ordenes.filter((o) => o.estado === 'APROBADA').length === 0 && <p className="p-3 text-slate-400 italic">Sin órdenes aprobadas (créelas desde una liquidación APROBADA)</p>}
                    {ordenes.filter((o) => o.estado === 'APROBADA').map((o) => (
                      <label key={o.id} className="flex items-center gap-2 p-2 text-[11px] hover:bg-slate-50">
                        <input type="checkbox" checked={s001Sel.includes(o.id)} onChange={(e) => setS001Sel(e.target.checked ? [...s001Sel, o.id] : s001Sel.filter((x) => x !== o.id))} />
                        <span className="font-semibold">{o.beneficiarioNombre}</span><span className="text-slate-500 truncate">{o.concepto}</span>
                        <span className="ml-auto font-mono font-bold">{formatoImporteSepa(o.importe)} €</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-3 flex justify-end">
                  <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Generar y validar pain.001 ({s001Sel.length})</button>
                </div>
              </form>
              <FicherosList ficheros={ficheros.filter((f) => f.tipo === 'pain.001')} onDescargar={descargarXml} />
            </div>
          )}

          {tab === 'movimientos' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Vista de lectura: cobros, pagos, gastos y liquidaciones con referencias cruzadas (base para futura conciliación camt.053).</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] uppercase font-bold text-slate-600 border-b"><tr><th className="py-2.5 px-3">Fecha</th><th className="py-2.5 px-3">Movimiento</th><th className="py-2.5 px-3 text-right">Importe</th><th className="py-2.5 px-3">Estado</th><th className="py-2.5 px-3">Referencia</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {movimientos.slice(0, 150).map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 whitespace-nowrap">{m.fecha}</td>
                        <td className="py-2.5 px-3"><span className="font-semibold">{m.descripcion}</span><span className="text-[10px] text-slate-400 block">{m.tipo}{m.liquidacionId ? ` · ${m.liquidacionId}` : ''}{m.cobroId ? ` · ${m.cobroId}` : ''}{m.ordenPagoId ? ` · ${m.ordenPagoId}` : ''}</span></td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold ${m.importe >= 0 ? 'text-emerald-700' : 'text-slate-800'}`}>{formatoImporteSepa(m.importe)} €</td>
                        <td className="py-2.5 px-3"><span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold">{m.estado}</span></td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">{m.referenciaBancaria || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {showGenerar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden my-auto">
            <div className="p-4 bg-emerald-700 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Wallet className="w-5 h-5" />Generar liquidación mensual</h3>
              <button onClick={() => setShowGenerar(false)} className="p-1 hover:bg-emerald-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleGenerar} className="p-5 space-y-4 text-xs">
              <PreviewCobros propietarioId={genPropId} periodo={genPeriodo} contratos={contratos} />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-semibold block mb-1">Propietario *</label><select value={genPropId} onChange={(e) => setGenPropId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold">{propietarios.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                <div><label className="font-semibold block mb-1">Periodo (YYYY-MM) *</label><input value={genPeriodo} onChange={(e) => setGenPeriodo(e.target.value)} pattern="20\d{2}-(0[1-9]|1[0-2])" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono" /></div>
                <div><label className="font-semibold block mb-1">Honorarios % *</label><input type="number" step="0.01" min="0" max="100" value={genHonorarios} onChange={(e) => setGenHonorarios(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
                <div><label className="font-semibold block mb-1">IVA honorarios %</label><div className="flex gap-2"><input type="number" step="0.01" value={genIva} onChange={(e) => setGenIva(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /><label className="flex items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={genAplicaIva} onChange={(e) => setGenAplicaIva(e.target.checked)} />Aplica</label></div></div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <label className="flex items-center gap-2 font-bold text-amber-900"><input type="checkbox" checked={genRetencion} onChange={(e) => setGenRetencion(e.target.checked)} />Aplicar retención (SOLO si existe obligación legal — nunca en vivienda)</label>
                {genRetencion && (<div className="grid grid-cols-3 gap-2">
                  <div><label className="font-semibold block mb-1">% retención</label><input type="number" step="0.01" value={genRetPct} onChange={(e) => setGenRetPct(Number(e.target.value))} className="w-full px-2 py-1.5 border border-amber-300 rounded-lg" /></div>
                  <div className="col-span-2"><label className="font-semibold block mb-1">Motivo *</label><input value={genMotivoRet} onChange={(e) => setGenMotivoRet(e.target.value)} placeholder="Ej. Arrendatario empresa, local urbano" className="w-full px-2 py-1.5 border border-amber-300 rounded-lg" /></div>
                </div>)}
              </div>
              <div><label className="font-semibold block mb-1">Fuente/regla aplicada</label><textarea rows={2} value={genFuente} onChange={(e) => setGenFuente(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
              <div className="flex justify-end gap-2 pt-2 border-t"><button type="button" onClick={() => setShowGenerar(false)} className="px-4 py-2 border border-slate-200 rounded-xl font-semibold">Cancelar</button><button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold">Generar borrador</button></div>
            </form>
          </div>
        </div>
      )}

      {showGasto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Receipt className="w-5 h-5" />Nuevo gasto imputable</h3>
              <button onClick={() => setShowGasto(false)} className="p-1 hover:bg-slate-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCrearGasto} className="p-5 space-y-3 text-xs">
              <div><label className="font-semibold block mb-1">Inmueble *</label><select value={gInmuebleId} onChange={(e) => setGInmuebleId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">{inmuebles.map((i) => <option key={i.id} value={i.id}>{i.direccion} ({i.ciudad})</option>)}</select></div>
              <div><label className="font-semibold block mb-1">Concepto *</label><input value={gConcepto} onChange={(e) => setGConcepto(e.target.value)} placeholder="Ej. Reparación caldera, cuota comunidad septiembre..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="font-semibold block mb-1">Importe *</label><input type="number" step="0.01" min="0" value={gImporte} onChange={(e) => setGImporte(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono" /></div>
                <div><label className="font-semibold block mb-1">IVA %</label><input type="number" step="0.01" value={gIva} onChange={(e) => setGIva(Number(e.target.value))} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
                <div><label className="font-semibold block mb-1">Categoría</label><select value={gCategoria} onChange={(e) => setGCategoria(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"><option value="reparacion">Reparación</option><option value="comunidad">Comunidad</option><option value="ibi">IBI</option><option value="seguro">Seguro</option><option value="suministro">Suministro</option><option value="administracion">Administración</option><option value="otro">Otro</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="font-semibold block mb-1">Fecha *</label><input type="date" value={gFecha} onChange={(e) => setGFecha(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
                <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={gEsBase} onChange={(e) => setGEsBase(e.target.checked)} />El importe es base sin IVA</label>
                <div><label className="font-semibold block mb-1">Factura nº</label><input value={gFactura} onChange={(e) => setGFactura(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
                <div><label className="font-semibold block mb-1">Proveedor</label><input value={gProveedor} onChange={(e) => setGProveedor(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
              </div>
              <p className="text-[11px] text-slate-500">Se registra como pagado por administración e imputable al propietario (descontable en liquidación).</p>
              <div className="flex justify-end gap-2 pt-2 border-t"><button type="button" onClick={() => setShowGasto(false)} className="px-4 py-2 border border-slate-200 rounded-xl font-semibold">Cancelar</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold">Guardar gasto</button></div>
            </form>
          </div>
        </div>
      )}

      {showGastoImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><Upload className="w-5 h-5" />Importar gasto canónico</h3>
              <button onClick={() => setShowGastoImport(false)} className="p-1 hover:bg-slate-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-500">Importación <strong>unidireccional</strong> del modelo oficial de gastos (colección <span className="font-mono">gastos</span>) a la proyección de liquidación. Es idempotente: reimportar no duplica. La contabilidad oficial se conserva intacta.</p>
              <div><label className="font-semibold block mb-1">Gasto canónico *</label>
                <select value={gimpId} onChange={(e) => setGimpId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {gastosCanonicosImportables.map((g) => (
                    <option key={g.id} value={g.id}>
                      {(g.fechaDevengo || '').slice(0, 10)} · {g.concepto || g.id} — {formatoImporteSepa(Number(g.importe) || 0)} € ({g.aCargoDe === 'arrendador' ? 'a cargo del propietario' : 'a cargo del inquilino'})
                    </option>
                  ))}
                </select>
              </div>
              <div><label className="font-semibold block mb-1">Imputación en liquidación</label>
                <select value={gimpImputa} onChange={(e) => setGimpImputa(e.target.value as 'propietario' | 'inquilino')} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                  <option value="propietario">Propietario (descontable de su liquidación)</option>
                  <option value="inquilino">Inquilino (a recuperar)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t"><button type="button" onClick={() => setShowGastoImport(false)} className="px-4 py-2 border border-slate-200 rounded-xl font-semibold">Cancelar</button><button type="button" onClick={handleImportarGastoCanonico} className="px-4 py-2 bg-slate-800 text-white rounded-xl font-bold">Importar</button></div>
            </div>
          </div>
        </div>
      )}

      {detalleLiq && (
        <DetalleLiquidacionModal
          liq={liquidaciones.find((l) => l.id === detalleLiq.id) || detalleLiq}
          onClose={() => setDetalleLiq(null)}
          onRecalcular={() => handleRecalcular(liquidaciones.find((l) => l.id === detalleLiq.id) || detalleLiq)}
          onAprobar={() => handleAprobar(liquidaciones.find((l) => l.id === detalleLiq.id) || detalleLiq)}
          onAnular={() => handleAnular(liquidaciones.find((l) => l.id === detalleLiq.id) || detalleLiq)}
          onPagar={(l) => { setDetalleLiq(null); setPagoLiq(l); setPagoRef(''); setPagoEvidenciaId(''); }}
          onCrearOrden={(l) => { handleCrearOrden(l); }}
          onPdf={(l) => imprimirLiquidacionPDF(l)}
        />
      )}

      {pagoLiq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 bg-emerald-700 text-white flex items-center justify-between">
              <h3 className="font-bold">Registrar pago — {pagoLiq.periodo}</h3>
              <button onClick={() => setPagoLiq(null)} className="p-1 hover:bg-emerald-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleConfirmarPago} className="p-5 space-y-3 text-xs">
              <p>Neto a transferir a <strong>{pagoLiq.propietarioNombre}</strong>: <strong className="font-mono text-emerald-700 text-base">{formatoImporteSepa(pagoLiq.netoPropietario)} €</strong></p>
              <p className="text-slate-500">IBAN destino: <span className="font-mono">{pagoLiq.cuentaAbonoIban}</span></p>
              {evidenciasPago.length > 0 && (
                <div>
                  <label className="font-semibold block mb-1">Evidencia: movimiento bancario conciliado (GAP 6)</label>
                  <select value={pagoEvidenciaId} onChange={(e) => onElegirEvidencia(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
                    <option value="">— Introducir referencia manualmente —</option>
                    {evidenciasPago.map((ev) => (
                      <option key={ev.idMovimiento} value={ev.idMovimiento}>
                        {ev.fechaPago || 's/f'} · {ev.referenciaBancaria} · {formatoImporteSepa(ev.importe)} €
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">Selección rellena referencia y fecha. El movimiento debe estar CONCILIADO/CONFIRMADO en Conciliación bancaria.</p>
                </div>
              )}
              <div><label className="font-semibold block mb-1">Referencia bancaria * (evidencia)</label><input value={pagoRef} onChange={(e) => setPagoRef(e.target.value)} placeholder="Ej. TRF-2026-09-001" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
              <div><label className="font-semibold block mb-1">Fecha de pago</label><input type="date" value={pagoFecha} onChange={(e) => setPagoFecha(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl" /></div>
              <div className="flex justify-end gap-2 pt-2 border-t"><button type="button" onClick={() => setPagoLiq(null)} className="px-4 py-2 border border-slate-200 rounded-xl font-semibold">Cancelar</button><button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold">Confirmar pago</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const PreviewCobros: React.FC<{ propietarioId: string; periodo: string; contratos: ContratoFormalizacion[] }> = ({ propietarioId, periodo, contratos }) => {
  const { liquidables, pendientes } = clasificarCobrosPeriodo(contratos, propietarioId, periodo);
  const cobrado = liquidables.reduce((s, c) => s + (Number(c.importeRecibido) || 0), 0);
  const pendiente = pendientes.reduce((s, c) => s + Math.max(0, (Number(c.importePrevisto) || 0) - (Number(c.importeRecibido) || 0)), 0);
  return (
    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 gap-2 text-center">
      <div><span className="text-[10px] uppercase font-bold text-emerald-700 block">Cobrado (liquida)</span><span className="font-mono font-bold text-emerald-700">{formatoImporteSepa(cobrado)} € · {liquidables.length} cobros</span></div>
      <div><span className="text-[10px] uppercase font-bold text-slate-500 block">Pendiente (no liquida)</span><span className="font-mono font-bold text-slate-600">{formatoImporteSepa(pendiente)} € · {pendientes.length} recibos</span></div>
    </div>
  );
};

const FicherosList: React.FC<{ ficheros: FicheroSEPA[]; onDescargar: (f: FicheroSEPA) => void }> = ({ ficheros, onDescargar }) => {
  const [verXml, setVerXml] = useState<FicheroSEPA | null>(null);
  if (ficheros.length === 0) return <p className="text-xs text-slate-400 italic">Sin ficheros generados todavía.</p>;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold text-slate-800">Historial de ficheros ({ficheros.length})</h4>
      {ficheros.slice(0, 20).map((f) => (
        <div key={f.id} className="p-3 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono font-bold">{f.msgId}</span>
          <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold">{f.estado}</span>
          <span>{f.numOperaciones} ops · <strong className="font-mono">{formatoImporteSepa(f.importeTotal)} €</strong></span>
          <span className="text-[10px] text-slate-400 font-mono">hash {f.hashContenido} · ejec. {f.fechaEjecucion}</span>
          <span className="ml-auto flex gap-1.5">
            <button onClick={() => setVerXml(f)} className="px-2.5 py-1.5 bg-slate-100 rounded-lg font-bold text-[11px]">Ver XML</button>
            <button onClick={() => onDescargar(f)} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg font-bold text-[11px]">Descargar</button>
          </span>
        </div>
      ))}
      {verXml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm font-mono">{verXml.msgId}.xml</h3>
              <button onClick={() => setVerXml(null)} className="p-1 hover:bg-slate-700 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <pre className="p-4 text-[10px] font-mono overflow-auto flex-1 bg-slate-950 text-emerald-200 whitespace-pre-wrap">{verXml.xml}</pre>
            <div className="p-3 border-t flex justify-end gap-2 shrink-0"><button onClick={() => { onDescargar(verXml); setVerXml(null); }} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Descargar XML</button><button onClick={() => setVerXml(null)} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold">Cerrar</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

const DetalleLiquidacionModal: React.FC<{
  liq: LiquidacionPropietario;
  onClose: () => void;
  onRecalcular: () => void;
  onAprobar: () => void;
  onAnular: () => void;
  onPagar: (l: LiquidacionPropietario) => void;
  onCrearOrden: (l: LiquidacionPropietario) => void;
  onPdf: (l: LiquidacionPropietario) => void;
}> = ({ liq, onClose, onRecalcular, onAprobar, onAnular, onPagar, onCrearOrden, onPdf }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold">Liquidación {liq.periodo} — {liq.propietarioNombre}</h3>
            <p className="text-[11px] text-slate-300 font-mono">{liq.id} · hash {liq.hashCalculo} · <span className={`px-1.5 py-0.5 rounded ${badgeEstadoLiquidacion(liq.estado)}`}>{liq.estado}</span></p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl"><span className="text-[10px] font-bold text-emerald-800 block">BRUTO COBRADO</span><span className="font-mono font-bold text-emerald-700">{formatoImporteSepa(liq.totalBrutoCobrado)} €</span></div>
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl"><span className="text-[10px] font-bold text-rose-800 block">DEDUCCIONES</span><span className="font-mono font-bold text-rose-700">−{formatoImporteSepa(liq.totalDeducciones)} €</span></div>
            <div className="p-2.5 bg-emerald-100 border border-emerald-300 rounded-xl"><span className="text-[10px] font-bold text-emerald-900 block">NETO</span><span className="font-mono font-bold text-emerald-800 text-base">{formatoImporteSepa(liq.netoPropietario)} €</span></div>
            <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl"><span className="text-[10px] font-bold text-slate-600 block">PENDIENTE (INFO)</span><span className="font-mono font-bold text-slate-600">{formatoImporteSepa(liq.totalDevengadoPendiente)} €</span></div>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-slate-50"><tr><th className="py-2 px-3">Concepto</th><th className="py-2 px-3 text-right">Importe</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {liq.lineas.map((x) => (
                  <tr key={x.id}><td className="py-2 px-3"><span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-bold mr-1.5">{x.naturaleza}</span><strong>{x.concepto}</strong>{x.detalle && <span className="block text-[10px] text-slate-500">{x.detalle}</span>}</td><td className={`py-2 px-3 text-right font-mono font-bold whitespace-nowrap ${x.importe < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatoImporteSepa(x.importe)} €</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
            <p><strong>Cuenta abono:</strong> <span className="font-mono">{liq.cuentaAbonoIban} ({liq.cuentaAbonoTitular})</span></p>
            <p><strong>Config:</strong> honorarios {liq.configFiscal.honorariosPct}% · IVA {liq.configFiscal.aplicaIvaHonorarios ? `${liq.configFiscal.ivaHonorariosPct}%` : '—'} · retención {liq.configFiscal.aplicaRetencion ? `${liq.configFiscal.retencionPct}% (${liq.configFiscal.motivoRetencion})` : '—'}</p>
            <p><strong>Fuente:</strong> {liq.configFiscal.fuenteRegla}</p>
            {liq.fechaPago && <p><strong>Pagada:</strong> {liq.fechaPago} · ref. {liq.referenciaBancariaPago}{liq.ordenPagoId ? ` · orden ${liq.ordenPagoId}` : ''}</p>}
          </div>
          <div>
            <h4 className="font-bold mb-1.5 flex items-center gap-1.5"><History className="w-4 h-4" />Historial</h4>
            <div className="space-y-1.5 border-l-2 border-slate-200 pl-3">
              {liq.historial.map((h) => (<div key={h.id} className="text-[11px]"><strong>{h.accion}</strong> <span className="text-slate-500">— {h.detalle} ({new Date(h.fecha).toLocaleString('es-ES')}{h.actorNombre ? ` · ${h.actorNombre}` : ''})</span></div>))}
            </div>
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2 flex-wrap shrink-0 bg-slate-50">
          <button onClick={() => onPdf(liq)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold flex items-center gap-1.5"><FileText className="w-4 h-4" />PDF</button>
          {liq.estado === 'BORRADOR' && (<>
            <button onClick={onRecalcular} className="px-3 py-2 bg-amber-500 text-white rounded-xl font-bold">Recalcular</button>
            <button onClick={onAprobar} className="px-3 py-2 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-1.5"><BadgeCheck className="w-4 h-4" />Aprobar</button>
            <button onClick={onAnular} className="px-3 py-2 bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold">Anular</button>
          </>)}
          {liq.estado === 'APROBADA' && (<>
            <button onClick={() => onCrearOrden(liq)} className="px-3 py-2 bg-indigo-600 text-white rounded-xl font-bold">Orden de pago</button>
            <button onClick={() => onPagar(liq)} className="px-3 py-2 bg-emerald-600 text-white rounded-xl font-bold">Registrar pago</button>
            <button onClick={onAnular} className="px-3 py-2 bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold">Anular</button>
          </>)}
          <button onClick={onClose} className="px-3 py-2 bg-slate-800 text-white rounded-xl font-semibold">Cerrar</button>
        </div>
      </div>
    </div>
  );
};
