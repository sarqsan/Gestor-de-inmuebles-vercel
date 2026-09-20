import React, { useEffect, useMemo, useState } from 'react';
import {
  Inmueble,
  Propietario,
  UsuarioApp,
} from '../../types';
import type {
  Financiacion,
  ModalidadInteres,
  SistemaAmortizacion,
  TipoCarencia,
} from '../../types/financiacion';
import {
  subscribeFinanciaciones,
  saveFinanciacionFirestore,
  deleteFinanciacionFirestore,
} from '../../lib/firebase';
import {
  crearFinanciacion,
  calcularCosteFinanciero,
  calcularImpacto,
  simularAmortizacionAnticipada,
  resumenCuadro,
} from '../../utils/financiacionEngine';
import {
  Banknote,
  Building2,
  Calculator,
  CheckCircle2,
  Euro,
  Landmark,
  Percent,
  Plus,
  ScrollText,
  Trash2,
  TrendingDown,
  X,
} from 'lucide-react';

interface FinanciacionSectionProps {
  inmuebles: Inmueble[];
  propietarios?: Propietario[];
  currentUser?: UsuarioApp | null;
}

const MODALIDAD_LABEL: Record<ModalidadInteres, string> = {
  FIJO: 'Tipo fijo',
  VARIABLE: 'Tipo variable',
  MIXTO: 'Tipo mixto',
};

const SISTEMA_LABEL: Record<SistemaAmortizacion, string> = {
  FRANCES: 'Francés (cuota constante)',
  LINEAL: 'Lineal (capital uniforme)',
};

const CARENCIA_LABEL: Record<TipoCarencia, string> = {
  NINGUNA: 'Sin carencia',
  SOLO_INTERESES: 'Carencia de capital (solo intereses)',
  TOTAL: 'Carencia total',
};

/** Formateador financiero con céntimos (precisión de cuotas e intereses). */
const euro2 = (n: number): string =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

export const FinanciacionSection: React.FC<FinanciacionSectionProps> = ({
  inmuebles,
  propietarios = [],
  currentUser,
}) => {
  const [financiaciones, setFinanciaciones] = useState<Financiacion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeFinanciaciones(setFinanciaciones);
    return () => unsub();
  }, []);

  // Ámbito RBAC idéntico al resto de módulos (la autorización dura la aplica Firestore).
  const scoped = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return financiaciones;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      const inmIds = new Set(currentUser.inmuebleIds || []);
      return financiaciones.filter(
        (f) =>
          (currentUser.propietarioId && f.propietarioId === currentUser.propietarioId) ||
          inmIds.has(f.inmuebleId)
      );
    }
    return [];
  }, [currentUser, financiaciones]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Landmark className="w-5 h-5 text-blue-600" /> Financiación Hipotecaria
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Préstamos, LTV, cuadros de amortización y simulaciones. Sin credenciales ni conexión bancaria.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nueva financiación
        </button>
      </div>

      {scoped.length === 0 && !showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
          <Banknote className="w-8 h-8 mx-auto text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No hay financiaciones registradas.</p>
          <p className="text-sm mt-1">Crea la primera para ver LTV y cuadro de amortización.</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {scoped.map((fin) => {
          const coste = calcularCosteFinanciero(fin.cuadroAmortizacion, fin.importeFinanciado, fin.valorReferencia);
          const inm = inmuebles.find((i) => i.id === fin.inmuebleId);
          return (
            <div
              key={fin.id}
              onClick={() => setSelectedId(fin.id)}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md hover:border-blue-300 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-800">{fin.entidad.nombre}</p>
                  <p className="text-sm text-slate-500">{inm?.direccion || fin.inmuebleId}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  LTV {fin.ltv.toFixed(2)}%
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">Financiado</p>
                  <p className="font-semibold">{euro2(fin.importeFinanciado)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Pendiente</p>
                  <p className="font-semibold text-amber-600">{euro2(coste.capitalPendiente)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Modalidad</p>
                  <p className="font-semibold">{MODALIDAD_LABEL[fin.modalidadInteres]}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Tipo</p>
                  <p className="font-semibold">{fin.tipoInteresAnual.toFixed(2)}%</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">{SISTEMA_LABEL[fin.sistemaAmortizacion]}</span>
                <span className={`font-bold ${fin.estado === 'SOLICITADA' ? 'text-blue-600' : fin.estado === 'FORMALIZADA' ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {fin.estado}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <FormularioFinanciacion
          inmuebles={inmuebles}
          propietarios={propietarios}
          currentUser={currentUser}
          onClose={() => setShowForm(false)}
          onSaved={(f) => {
            setShowForm(false);
            setSelectedId(f.id);
          }}
        />
      )}

      {selectedId && (
        <DetalleFinanciacion
          fin={scoped.find((f) => f.id === selectedId) || null}
          inmuebles={inmuebles}
          onClose={() => setSelectedId(null)}
          onDelete={async () => {
            await deleteFinanciacionFirestore(selectedId);
            setSelectedId(null);
          }}
          onUpdate={async (f) => {
            await saveFinanciacionFirestore(f);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Formulario de creación
// ---------------------------------------------------------------------------

interface FormProps {
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  currentUser?: UsuarioApp | null;
  onClose: () => void;
  onSaved: (f: Financiacion) => void;
}

function FormularioFinanciacion({ inmuebles, propietarios, currentUser, onClose, onSaved }: FormProps) {
  const [inmuebleId, setInmuebleId] = useState(inmuebles[0]?.id || '');
  const [entidadNombre, setEntidadNombre] = useState('');
  const [importe, setImporte] = useState<number>(0);
  const [valorRef, setValorRef] = useState<number>(0);
  const [plazo, setPlazo] = useState<number>(240);
  const [tipo, setTipo] = useState<number>(3.0);
  const [modalidad, setModalidad] = useState<ModalidadInteres>('FIJO');
  const [sistema, setSistema] = useState<SistemaAmortizacion>('FRANCES');
  const [carencia, setCarencia] = useState<TipoCarencia>('NINGUNA');
  const [carenciaMeses, setCarenciaMeses] = useState<number>(0);
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [gastos, setGastos] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const inm = inmuebles.find((i) => i.id === inmuebleId);
  const propietarioId =
    inm?.propietarioId ||
    currentUser?.propietarioId ||
    propietarios[0]?.id ||
    'propietario_desconocido';

  const ltvPreview = valorRef > 0 ? ((importe / valorRef) * 100).toFixed(2) : '—';

  const submit = async () => {
    try {
      setError(null);
      const res = crearFinanciacion({
        id: `fin_${inmuebleId}_${Date.now()}`,
        inmuebleId,
        propietarioId,
        entidadNombre: entidadNombre.trim() || 'Entidad financiera',
        importeFinanciado: importe,
        valorReferencia: valorRef,
        plazoMeses: plazo,
        tipoInteresAnual: tipo,
        modalidadInteres: modalidad,
        sistemaAmortizacion: sistema,
        carencia,
        carenciaMeses: carencia === 'NINGUNA' ? 0 : carenciaMeses,
        fechaFormalizacion: fecha,
        gastosFormalizacion: gastos || undefined,
      });
      await saveFinanciacionFirestore(res.financiacion);
      onSaved(res.financiacion);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la financiación');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" /> Nueva financiación
        </h3>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Inmueble</span>
          <select
            value={inmuebleId}
            onChange={(e) => setInmuebleId(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {inmuebles.map((i) => (
              <option key={i.id} value={i.id}>{i.direccion || i.id}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Entidad financiera</span>
          <input
            value={entidadNombre}
            onChange={(e) => setEntidadNombre(e.target.value)}
            placeholder="p. ej. Banco Ejemplo"
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Importe financiado (€)</span>
          <input
            type="number"
            min={0}
            value={importe}
            onChange={(e) => setImporte(Number(e.target.value))}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Valor de referencia (€)</span>
          <input
            type="number"
            min={0}
            value={valorRef}
            onChange={(e) => setValorRef(Number(e.target.value))}
            placeholder={inm?.valorAdquisicion ? `Ej. tasación ${inm.valorAdquisicion}` : 'Valor de tasación/adquisición'}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Plazo (meses)</span>
          <input
            type="number"
            min={1}
            value={plazo}
            onChange={(e) => setPlazo(Number(e.target.value))}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Tipo de interés anual (%)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={tipo}
            onChange={(e) => setTipo(Number(e.target.value))}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Modalidad de interés</span>
          <select
            value={modalidad}
            onChange={(e) => setModalidad(e.target.value as ModalidadInteres)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {(Object.keys(MODALIDAD_LABEL) as ModalidadInteres[]).map((m) => (
              <option key={m} value={m}>{MODALIDAD_LABEL[m]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Sistema de amortización</span>
          <select
            value={sistema}
            onChange={(e) => setSistema(e.target.value as SistemaAmortizacion)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {(Object.keys(SISTEMA_LABEL) as SistemaAmortizacion[]).map((s) => (
              <option key={s} value={s}>{SISTEMA_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Carencia</span>
          <select
            value={carencia}
            onChange={(e) => setCarencia(e.target.value as TipoCarencia)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          >
            {(Object.keys(CARENCIA_LABEL) as TipoCarencia[]).map((c) => (
              <option key={c} value={c}>{CARENCIA_LABEL[c]}</option>
            ))}
          </select>
        </label>
        {carencia !== 'NINGUNA' && (
          <label className="block text-sm">
            <span className="text-slate-600 font-medium">Meses de carencia</span>
            <input
              type="number"
              min={0}
              value={carenciaMeses}
              onChange={(e) => setCarenciaMeses(Number(e.target.value))}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Fecha de formalización</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Gastos de formalización (€)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={gastos}
            onChange={(e) => setGastos(Number(e.target.value))}
            className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-4 flex-wrap">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-sm font-semibold text-blue-700">
          LTV previsto: {String(ltvPreview)}%
        </div>
        {error && <div className="text-rose-600 text-sm font-medium">{error}</div>}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">
          Cancelar
        </button>
        <button
          onClick={submit}
          className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer"
        >
          Crear financiación
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalle con cuadro de amortización y simulador anticipado
// ---------------------------------------------------------------------------

function DetalleFinanciacion({
  fin,
  inmuebles,
  onClose,
  onDelete,
  onUpdate,
}: {
  fin: Financiacion | null;
  inmuebles: Inmueble[];
  onClose: () => void;
  onDelete: () => void;
  onUpdate: (f: Financiacion) => Promise<void>;
}) {
  const [antImporte, setAntImporte] = useState<number>(0);
  const [antModalidad, setAntModalidad] = useState<'reducir_cuota' | 'reducir_plazo'>('reducir_cuota');
  const antResult = useMemo(() => {
    if (!fin) return null;
    const pendiente = fin.cuadroAmortizacion.length > 0
      ? fin.cuadroAmortizacion[fin.cuadroAmortizacion.length - 1].capitalPendiente
      : fin.saldoPendiente;
    const ejecutadas = fin.cuadroAmortizacion.filter((a) => a.capitalPendiente < fin.importeFinanciado).length;
    const restantes = Math.max(0, fin.plazoMeses - ejecutadas);
    return simularAmortizacionAnticipada(
      { principalInicial: fin.importeFinanciado, saldoPendiente: pendiente, periodosRestantes: restantes, tipoInteresAnual: fin.tipoInteresAnual },
      antImporte,
      antModalidad
    );
  }, [fin, antImporte, antModalidad]);

  if (!fin) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500">
        Financiación no encontrada.
        <button onClick={onClose} className="ml-3 text-blue-600 font-medium cursor-pointer">Cerrar</button>
      </div>
    );
  }

  const coste = calcularCosteFinanciero(fin.cuadroAmortizacion, fin.importeFinanciado, fin.valorReferencia);
  const impacto = calcularImpacto(fin.cuadroAmortizacion, fin.importeFinanciado, fin.valorReferencia);
  const resumen = resumenCuadro(fin.cuadroAmortizacion);
  const inm = inmuebles.find((i) => i.id === fin.inmuebleId);

  const confirmarAmortizacion = async () => {
    if (!antResult || antResult.importeAmortizado <= 0) return;
    const pendienteAntes = coste.capitalPendiente;
    // Persistir la amortización anticipada con trazabilidad (no altera periodos cerrados).
    const reembolso = {
      id: `rei_${Date.now()}`,
      fecha: new Date().toISOString(),
      importe: antResult.importeAmortizado,
      gastoCancelacion: antResult.gastoCancelacion,
      capitalPendienteAntes: pendienteAntes,
      capitalPendienteDespues: antResult.capitalPendienteDespues,
      traza: `Amortización anticipada (${antModalidad === 'reducir_cuota' ? 'reducir cuota' : 'reducir plazo'}) registrada.`,
    };
    const eventos = [
      ...(fin.eventos || []),
      { fecha: new Date().toISOString(), accion: 'AMORTIZACION_ANTICIPADA' as const, detalle: reembolso.traza },
    ];
    const actualizada: Financiacion = {
      ...fin,
      saldoPendiente: antResult.capitalPendienteDespues,
      reembolsosAnticipados: [...(fin.reembolsosAnticipados || []), reembolso],
      eventos,
      updatedAt: new Date().toISOString(),
    };
    await onUpdate(actualizada);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-4xl w-full my-6 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{fin.entidad.nombre}</h3>
            <p className="text-sm text-slate-500">{inm?.direccion || fin.inmuebleId} · {SISTEMA_LABEL[fin.sistemaAmortizacion]}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onDelete} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer" title="Eliminar">
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat icon={<Euro className="w-4 h-4" />} label="Financiado" value={euro2(fin.importeFinanciado)} />
          <Stat icon={<Percent className="w-4 h-4" />} label="LTV" value={`${fin.ltv.toFixed(2)}%`} />
          <Stat icon={<Calculator className="w-4 h-4" />} label="Intereses totales" value={euro2(resumen.totalIntereses)} />
          <Stat icon={<TrendingDown className="w-4 h-4" />} label="Pendiente" value={euro2(coste.capitalPendiente)} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-1.5">
            <p className="font-semibold text-slate-700">Coste financiero</p>
            <p className="flex justify-between"><span className="text-slate-500">Principal</span><span>{euro2(coste.principal)}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Intereses</span><span>{euro2(coste.totalIntereses)}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Total pagado</span><span className="font-semibold">{euro2(coste.totalPagado)}</span></p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm space-y-1.5">
            <p className="font-semibold text-slate-700">Impacto del propietario</p>
            <p className="flex justify-between"><span className="text-slate-500">Valor referencia</span><span>{euro2(impacto.inversionInicial)}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Capital aportado</span><span>{euro2(impacto.capitalAportado)}</span></p>
            <p className="flex justify-between"><span className="text-slate-500">Salida por cuotas</span><span className="font-semibold">{euro2(impacto.flujoCajaSalidaCuotas)}</span></p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ScrollText className="w-4 h-4 text-blue-600" />
            <h4 className="font-bold text-slate-700 text-sm">Cuadro de amortización (primeros periodos)</h4>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs min-w-[560px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Nº</th>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-right">Cuota</th>
                  <th className="px-3 py-2 text-right">Intereses</th>
                  <th className="px-3 py-2 text-right">Capital</th>
                  <th className="px-3 py-2 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {fin.cuadroAmortizacion.slice(0, 24).map((a) => (
                  <tr key={a.periodo} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{a.periodo}{a.tipoTramo === 'carencia_total' ? ' · carencia' : a.tipoTramo === 'carencia_solo_intereses' ? ' · solo int.' : ''}</td>
                    <td className="px-3 py-1.5">{a.fecha}</td>
                    <td className="px-3 py-1.5 text-right">{euro2(a.cuotaTotal)}</td>
                    <td className="px-3 py-1.5 text-right">{euro2(a.intereses)}</td>
                    <td className="px-3 py-1.5 text-right">{euro2(a.capitalAmortizado)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{euro2(a.capitalPendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Último periodo → capital pendiente {euro2(fin.cuadroAmortizacion[fin.cuadroAmortizacion.length - 1]?.capitalPendiente || 0)} (cuadra a cero).
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h4 className="font-bold text-amber-800 text-sm mb-3 flex items-center gap-2">
            <Calculator className="w-4 h-4" /> Simular amortización anticipada
          </h4>
          <div className="flex flex-wrap gap-3 items-end">
            <label className="block text-sm">
              <span className="text-amber-800/80 font-medium">Importe (€)</span>
              <input
                type="number"
                min={0}
                value={antImporte}
                onChange={(e) => setAntImporte(Number(e.target.value))}
                className="mt-1 border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-amber-800/80 font-medium">Modalidad</span>
              <select
                value={antModalidad}
                onChange={(e) => setAntModalidad(e.target.value as 'reducir_cuota' | 'reducir_plazo')}
                className="mt-1 border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="reducir_cuota">Reducir cuota</option>
                <option value="reducir_plazo">Reducir plazo</option>
              </select>
            </label>
            <button
              onClick={confirmarAmortizacion}
              disabled={!antResult || antResult.importeAmortizado <= 0}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold cursor-pointer"
            >
              Registrar amortización
            </button>
          </div>
          {antResult && (
            <div className="mt-3 text-sm grid md:grid-cols-2 gap-2 text-amber-900">
              <p>Pendiente antes: <b>{euro2(antResult.capitalPendienteAntes)}</b></p>
              <p>Pendiente después: <b>{euro2(antResult.capitalPendienteDespues)}</b></p>
              {antResult.nuevaCuota != null && <p>Nueva cuota (aprox.): <b>{euro2(antResult.nuevaCuota)}</b></p>}
              {antResult.nuevoPlazoMeses != null && <p>Nuevo plazo (aprox.): <b>{antResult.nuevoPlazoMeses} meses</b></p>}
            </div>
          )}
        </div>

        {fin.reembolsosAnticipados && fin.reembolsosAnticipados.length > 0 && (
          <div className="mt-4">
            <h4 className="font-bold text-slate-700 text-sm mb-2">Amortizaciones registradas</h4>
            <div className="space-y-1.5">
              {fin.reembolsosAnticipados.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>{r.traza}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
        {icon} <span>{label}</span>
      </div>
      <p className="font-bold text-slate-800 text-sm">{value}</p>
    </div>
  );
}
