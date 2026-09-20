import React, { useEffect, useMemo, useState } from 'react';
import {
  Inmueble,
  Propietario,
  UsuarioApp,
  ContratoFormalizacion,
} from '../../types';
import type {
  Factura,
  RegistroFacturacion,
  SerieFacturacion,
  EnvioVerifactu,
} from '../../types/facturacion';
import {
  idFactura,
  idRegistroFacturacion,
  idSerie,
  ETIQUETAS_ESTADO_FACTURA,
} from '../../types/facturacion';
import {
  subscribeFacturas,
  subscribeRegistrosFacturacion,
  subscribeEnviosVerifactu,
  subscribeSeriesFacturacion,
  saveFacturaFirestore,
  createRegistroFacturacionFirestore,
  saveEnvioVerifactuFirestore,
  saveSerieFacturacionFirestore,
} from '../../lib/firebase';
import {
  calcularLinea,
  totalesFactura,
  numeroFacturaFormateado,
  cadenaHashAlta,
  hashSha256,
  generarRegistroFacturacionAlta,
  verificarCadenaFacturacion,
  urlQrFactura,
  crearFacturaRectificativa,
  anularFactura,
  fechaExpedicionDesdeFecha,
  fechaHoraHusoActual,
} from '../../utils/facturacionEngine';
import {
  crearEnvioPendiente,
} from '../../utils/verifactuTransport';
import { FacturaElectronicaB2BPanel } from './FacturaElectronicaB2BPanel';
import {
  QrCode,
  FileText,
  Plus,
  X,
  Search,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Receipt,
  Hash,
  Link2,
  Send,
} from 'lucide-react';

interface FacturacionSectionProps {
  inmuebles: Inmueble[];
  contratos?: ContratoFormalizacion[];
  propietarios?: Propietario[];
  currentUser?: UsuarioApp | null;
}

const euro2 = (n: number): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const IVA_TIPOS = [21, 10, 4, 0];

/** Prepara registro de facturación + envío VERI*FACTU (identidad determinista). */
function generarRegistroYEnvio(
  factura: Factura,
  previo: RegistroFacturacion | null,
  numeroFacturaFormateada: string
): { registro: RegistroFacturacion; envio: EnvioVerifactu } {
  const generado = generarRegistroFacturacionAlta({
    propietarioId: factura.propietarioId,
    facturaId: factura.id,
    idEmisorFactura: factura.emisor.nif || factura.propietarioId,
    numSerieFactura: numeroFacturaFormateada,
    fechaExpedicionFactura: factura.fechaExpedicion,
    tipoFactura: factura.tipo,
    cuotaTotal: factura.cuotaIva,
    importeTotal: factura.importeTotal,
    fechaHoraHusoGenRegistro: fechaHoraHusoActual(),
    modalidad: 'VERIFACTU',
    registroAnterior: previo,
  });
  const envio = crearEnvioPendiente(generado.registro, factura.propietarioId);
  return { registro: generado.registro, envio };
}

export const FacturacionSection: React.FC<FacturacionSectionProps> = ({
  inmuebles,
  propietarios = [],
  currentUser,
}) => {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [registros, setRegistros] = useState<RegistroFacturacion[]>([]);
  const [envios, setEnvios] = useState<EnvioVerifactu[]>([]);
  const [series, setSeries] = useState<SerieFacturacion[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>('TODAS');
  const [filtroEjercicio, setFiltroEjercicio] = useState<string>('TODOS');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const unsubs = [
      subscribeFacturas(setFacturas),
      subscribeRegistrosFacturacion(setRegistros),
      subscribeEnviosVerifactu(setEnvios),
      subscribeSeriesFacturacion(setSeries),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const scoped = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return facturas;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      const inmIds = new Set(currentUser.inmuebleIds || []);
      return facturas.filter(
        (f) =>
          (currentUser.propietarioId && f.propietarioId === currentUser.propietarioId) ||
          (f.inmuebleId && inmIds.has(f.inmuebleId))
      );
    }
    return [];
  }, [currentUser, facturas]);

  const ejercicios = useMemo(() => {
    const porEjercicio = Array.from(new Set<number>(facturas.map((f) => f.ejercicio)));
    return porEjercicio.sort((a: number, b: number) => b - a);
  }, [facturas]);

  const filtradas = useMemo(() => {
    return scoped.filter((f) => {
      if (filtroEstado !== 'TODAS') {
        const fiscal = f.estadoFiscal || f.estado;
        if (fiscal !== filtroEstado) return false;
      }
      if (filtroEjercicio !== 'TODOS' && String(f.ejercicio) !== filtroEjercicio) return false;
      if (busqueda.trim()) {
        const q = busqueda.trim().toLowerCase();
        const serieNum = numeroFacturaFormateado(f.serie, f.numero, f.ejercicio).toLowerCase();
        const receptor = (f.receptor?.nombre || '').toLowerCase();
        if (!serieNum.includes(q) && !receptor.includes(q) && !(f.receptor?.nif || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [scoped, filtroEstado, filtroEjercicio, busqueda]);

  const persistirEmision = async (
    factura: Factura,
    reg: RegistroFacturacion,
    env: EnvioVerifactu
  ) => {
    await saveFacturaFirestore(factura);
    await createRegistroFacturacionFirestore(reg);
    await saveEnvioVerifactuFirestore(env);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" /> Facturación
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Facturas, registro de facturación (huella SHA-256 encadenada) y preparación VERI*FACTU. Sin secretos ni conexión real a la AEAT.
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nueva factura
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar nº de factura o receptor…"
            className="pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm w-64"
          />
        </div>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">
          <option value="TODAS">Todos los estados</option>
          {Object.entries(ETIQUETAS_ESTADO_FACTURA).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
          <option value="PENDIENTE_REMISION">Pendiente de remisión</option>
        </select>
        <select value={filtroEjercicio} onChange={(e) => setFiltroEjercicio(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm">
          <option value="TODOS">Todos los ejercicios</option>
          {ejercicios.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {filtradas.length === 0 && !showForm && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-500">
          <FileText className="w-8 h-8 mx-auto text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">No hay facturas registradas.</p>
          <p className="text-sm mt-1">Crea la primera factura para empezar el registro de facturación.</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Nº factura</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 font-semibold">Receptor</th>
              <th className="px-4 py-3 font-semibold text-right">Base</th>
              <th className="px-4 py-3 font-semibold text-right">Total</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 font-semibold">VERI*FACTU</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => {
              const fiscal = f.estadoFiscal || f.estado;
              return (
                <tr
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  className="border-t border-slate-100 hover:bg-blue-50/40 cursor-pointer"
                >
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {f.tipo !== 'F1' && <span className="text-amber-600 mr-1">[{f.tipo}]</span>}
                    {numeroFacturaFormateado(f.serie, f.numero, f.ejercicio)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{f.fechaExpedicion}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {f.receptor?.nombre || '—'}
                    {f.receptor?.nif && <span className="text-xs text-slate-400 ml-1">{f.receptor.nif}</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{euro2(f.baseImponible)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{euro2(f.importeTotal)}</td>
                  <td className="px-4 py-3"><EstadoBadge estado={f.estado} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{ETIQUETAS_ESTADO_FACTURA[fiscal] || fiscal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <FormularioFactura
          inmuebles={inmuebles}
          propietarios={propietarios}
          series={series}
          facturas={facturas}
          registros={registros}
          currentUser={currentUser}
          onClose={() => setShowForm(false)}
          onSaved={(f) => {
            setShowForm(false);
            setSelectedId(f.id);
          }}
        />
      )}

      {selectedId && (
        <DetalleFactura
          factura={scoped.find((f) => f.id === selectedId) || null}
          registros={registros}
          envios={envios}
          onClose={() => setSelectedId(null)}
          onActualizar={async (f) => { await saveFacturaFirestore(f); }}
          onEmitir={persistirEmision}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};

function EstadoBadge({ estado }: { estado: string }) {
  const mapa: Record<string, string> = {
    BORRADOR: 'bg-slate-100 text-slate-600 border-slate-200',
    EMITIDA: 'bg-blue-50 text-blue-700 border-blue-200',
    PENDIENTE_REMISION: 'bg-amber-50 text-amber-700 border-amber-200',
    ENVIADA: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    ACEPTADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ACEPTADA_CON_ERRORES: 'bg-lime-50 text-lime-700 border-lime-200',
    RECHAZADA: 'bg-rose-50 text-rose-700 border-rose-200',
    ERROR: 'bg-rose-100 text-rose-700 border-rose-200',
    ANULADA: 'bg-slate-100 text-slate-500 border-slate-200 line-through',
  };
  const etiqueta = ETIQUETAS_ESTADO_FACTURA[estado as keyof typeof ETIQUETAS_ESTADO_FACTURA] || estado;
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${mapa[estado] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {etiqueta}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Formulario de creación
// ---------------------------------------------------------------------------

interface FormProps {
  inmuebles: Inmueble[];
  propietarios: Propietario[];
  series: SerieFacturacion[];
  facturas: Factura[];
  registros: RegistroFacturacion[];
  currentUser?: UsuarioApp | null;
  onClose: () => void;
  onSaved: (f: Factura) => void;
}

function FormularioFactura({ inmuebles, propietarios, series, facturas, registros, currentUser, onClose, onSaved }: FormProps) {
  const [inmuebleId, setInmuebleId] = useState(inmuebles[0]?.id || '');
  const [serieCodigo, setSerieCodigo] = useState('ALQ');
  const [concepto, setConcepto] = useState('Renta mensual');
  const [cantidad, setCantidad] = useState<number>(1);
  const [precio, setPrecio] = useState<number>(0);
  const [tipoIva, setTipoIva] = useState<number>(21);
  const [retencion, setRetencion] = useState<number>(19);
  const [receptorNombre, setReceptorNombre] = useState('');
  const [receptorNif, setReceptorNif] = useState('');
  const [receptorDireccion, setReceptorDireccion] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [formaPago, setFormaPago] = useState<'transferencia' | 'domiciliacion' | 'bizum' | 'efectivo' | 'otro'>('transferencia');
  const [emitir, setEmitir] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inm = inmuebles.find((i) => i.id === inmuebleId);
  const propietarioId = inm?.propietarioId || currentUser?.propietarioId || propietarios[0]?.id || 'propietario_desconocido';
  const propietario = propietarios.find((p) => p.id === propietarioId) || propietarios[0];

  const ejercicio = new Date().getFullYear();
  const delEjercicio = facturas.filter((f) => f.propietarioId === propietarioId && f.serie === serieCodigo && f.ejercicio === ejercicio);
  const siguienteNumero = delEjercicio.reduce((max, f) => Math.max(max, f.numero), 0) + 1;

  const linea = calcularLinea({ concepto, cantidad, precioUnitario: precio, tipoIva, retencionTipo: retencion });
  const totales = totalesFactura([linea]);

  const submit = async () => {
    try {
      setError(null);
      if (receptorNombre.trim() === '') throw new Error('El receptor es obligatorio.');
      const hora = new Date();
      const fechaExp = fechaExpedicionDesdeFecha(hora);
      const factura: Factura = {
        id: idFactura(serieCodigo, siguienteNumero, ejercicio, propietarioId),
        propietarioId,
        inmuebleId: inmuebleId || undefined,
        clase: 'EMITIDA',
        tipo: 'F1',
        serie: serieCodigo,
        numero: siguienteNumero,
        ejercicio,
        fechaExpedicion: fechaExp,
        fechaOperacion: fechaExp,
        fechaExpedicionUtc: hora.toISOString(),
        emisor: {
          nombre: propietario?.nombre || propietarioId,
          nif: propietario?.nifCif || '',
        },
        receptor: {
          nombre: receptorNombre.trim(),
          nif: receptorNif.trim() || undefined,
          direccion: receptorDireccion.trim() || undefined,
        },
        lineas: [linea],
        baseImponible: totales.baseImponible,
        cuotaIva: totales.cuotaIva,
        cuotaRetencion: totales.cuotaRetencion,
        importeTotal: totales.importeTotal,
        vencimiento: vencimiento || undefined,
        formaPago,
        estado: emitir ? 'EMITIDA' : 'BORRADOR',
        estadoFiscal: emitir ? 'PENDIENTE_REMISION' : null,
        creadoPor: currentUser?.nombre,
        creadoPorId: currentUser?.id,
        createdAt: hora.toISOString(),
        updatedAt: hora.toISOString(),
      };

      // Asegurar serie (correlación) y guardar la factura.
      const serieId = idSerie(propietarioId, serieCodigo, ejercicio);
      const serieExistente = series.find((s) => s.id === serieId);
      await saveSerieFacturacionFirestore({
        id: serieId,
        propietarioId,
        codigo: serieCodigo,
        ejercicio,
        tipo: 'ALQUILER',
        ultimoNumero: Math.max(siguienteNumero, serieExistente?.ultimoNumero || 0),
        activa: true,
        createdAt: serieExistente?.createdAt || hora.toISOString(),
        updatedAt: hora.toISOString(),
      });

      if (emitir) {
        // Encadenar con el registro previo del propietario (orden por marca).
        const previos = registros
          .filter((r) => r.propietarioId === propietarioId)
          .sort((a, b) => a.fechaHoraHusoGenRegistro.localeCompare(b.fechaHoraHusoGenRegistro));
        const { registro, envio } = generarRegistroYEnvio(
          factura,
          previos.length > 0 ? previos[previos.length - 1] : null,
          numeroFacturaFormateado(factura.serie, factura.numero, factura.ejercicio)
        );
        factura.registroFacturacionId = registro.id;
        await saveFacturaFirestore(factura);
        await createRegistroFacturacionFirestore(registro);
        await saveEnvioVerifactuFirestore(envio);
      } else {
        await saveFacturaFirestore(factura);
      }

      onSaved(factura);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear la factura');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" /> Nueva factura
        </h3>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-sm text-blue-800">
        <p className="font-semibold">Borrador de factura</p>
        <p>
          {numeroFacturaFormateado(serieCodigo, siguienteNumero, ejercicio)} · Base {euro2(totales.baseImponible)} · IVA {euro2(totales.cuotaIva)}
          {totales.cuotaRetencion > 0 && <> · Ret. {euro2(totales.cuotaRetencion)}</>} · <b>Total {euro2(totales.importeTotal)}</b>
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Inmueble</span>
          <select value={inmuebleId} onChange={(e) => setInmuebleId(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {inmuebles.length === 0 && <option value="">Sin inmuebles</option>}
            {inmuebles.map((i) => (
              <option key={i.id} value={i.id}>{i.direccion || i.id}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Serie</span>
          <input value={serieCodigo} onChange={(e) => setSerieCodigo(e.target.value.toUpperCase())} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Concepto</span>
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600 font-medium">Cantidad</span>
            <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 font-medium">Precio unitario (€)</span>
            <input type="number" min={0} step="0.01" value={precio} onChange={(e) => setPrecio(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">IVA (%)</span>
          <select value={tipoIva} onChange={(e) => setTipoIva(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
            {IVA_TIPOS.map((t) => <option key={t} value={t}>{t}%</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Retención IRPF (%)</span>
          <input type="number" min={0} step="0.5" value={retencion} onChange={(e) => setRetencion(Number(e.target.value))} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Receptor (nombre)</span>
          <input value={receptorNombre} onChange={(e) => setReceptorNombre(e.target.value)} placeholder="Inquilino / receptor" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Receptor (NIF)</span>
          <input value={receptorNif} onChange={(e) => setReceptorNif(e.target.value)} placeholder="Opcional en simplificada" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600 font-medium">Dirección receptor</span>
          <input value={receptorDireccion} onChange={(e) => setReceptorDireccion(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-slate-600 font-medium">Vencimiento</span>
            <input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 font-medium">Forma de pago</span>
            <select value={formaPago} onChange={(e) => setFormaPago(e.target.value as typeof formaPago)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
              <option value="transferencia">Transferencia</option>
              <option value="domiciliacion">Domiciliación</option>
              <option value="bizum">Bizum</option>
              <option value="efectivo">Efectivo</option>
              <option value="otro">Otro</option>
            </select>
          </label>
        </div>
      </div>

      <label className="flex items-center gap-2 mt-4 text-sm text-slate-700">
        <input type="checkbox" checked={emitir} onChange={(e) => setEmitir(e.target.checked)} />
        Emitir ahora (genera registro de facturación y preparación VERI*FACTU)
      </label>

      {error && <div className="mt-3 text-rose-600 text-sm font-medium">{error}</div>}

      <div className="mt-5 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer">Cancelar</button>
        <button onClick={submit} className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl cursor-pointer">
          {emitir ? 'Emitir y registrar' : 'Guardar borrador'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalle de factura
// ---------------------------------------------------------------------------

function DetalleFactura({
  factura,
  registros,
  envios,
  onClose,
  onActualizar,
  onEmitir,
  currentUser,
}: {
  factura: Factura | null;
  registros: RegistroFacturacion[];
  envios: EnvioVerifactu[];
  onClose: () => void;
  onActualizar: (f: Factura) => Promise<void>;
  onEmitir: (f: Factura, reg: RegistroFacturacion, env: EnvioVerifactu) => Promise<void>;
  currentUser?: UsuarioApp | null;
}) {
  const [qrData, setQrData] = useState<string | null>(null);
  const [errorOp, setErrorOp] = useState<string | null>(null);
  const [motivoRectificacion, setMotivoRectificacion] = useState('');

  const facturaRegistro = factura ? registros.find((r) => r.facturaId === factura.id) : undefined;
  const envio = factura ? envios.find((e) => e.registroFacturacionId === idRegistroFacturacion(factura.id)) : undefined;

  const registrosDelPropietario = useMemo(() => {
    if (!factura) return [];
    return registros
      .filter((r) => r.propietarioId === factura.propietarioId)
      .sort((a, b) => a.fechaHoraHusoGenRegistro.localeCompare(b.fechaHoraHusoGenRegistro));
  }, [registros, factura]);

  const verificacion = useMemo(() => {
    if (registrosDelPropietario.length === 0) return null;
    return verificarCadenaFacturacion(registrosDelPropietario);
  }, [registrosDelPropietario]);

  useEffect(() => {
    let activo = true;
    setQrData(null);
    if (factura && factura.clase === 'EMITIDA' && factura.estado === 'EMITIDA') {
      const url = urlQrFactura({
        nif: factura.emisor.nif || factura.propietarioId,
        numserie: numeroFacturaFormateado(factura.serie, factura.numero, factura.ejercicio),
        fecha: factura.fechaExpedicion,
        importe: factura.importeTotal,
        entorno: 'produccion',
        claseSistema: 'VERIFACTU',
      });
      import('qrcode')
        .then((QRCode) => QRCode.toDataURL(url, { width: 240, margin: 1 }))
        .then((d) => { if (activo) setQrData(d); })
        .catch(() => {});
    }
    return () => { activo = false; };
  }, [factura]);

  if (!factura) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={onClose}>
        <div className="bg-white rounded-2xl max-w-2xl w-full my-6 p-6" onClick={(e) => e.stopPropagation()}>
          Factura no encontrada.
          <button onClick={onClose} className="ml-3 text-blue-600 font-medium cursor-pointer">Cerrar</button>
        </div>
      </div>
    );
  }

  const rectificarFactura = async () => {
    setErrorOp(null);
    try {
      const rect = crearFacturaRectificativa(
        factura,
        factura.lineas,
        motivoRectificacion.trim() || 'Rectificación de importes'
      );
      await onActualizar({ ...factura, rectificadaPorId: rect.id, updatedAt: new Date().toISOString() });
      await onActualizar(rect);
      onClose();
    } catch (e) {
      setErrorOp(e instanceof Error ? e.message : 'Error en la factura rectificativa');
    }
  };

  const anularFacturaSeleccionada = async () => {
    setErrorOp(null);
    try {
      const { factura: anulada } = anularFactura(factura, 'Anulación registrada por el usuario');
      await onActualizar(anulada);
      onClose();
    } catch (e) {
      setErrorOp(e instanceof Error ? e.message : 'Error al anular la factura');
    }
  };

  const emitirBorrador = async () => {
    setErrorOp(null);
    try {
      const emitida: Factura = {
        ...factura,
        estado: 'EMITIDA',
        estadoFiscal: 'PENDIENTE_REMISION',
        fechaExpedicionUtc: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const previos = registros
        .filter((r) => r.propietarioId === emitida.propietarioId)
        .sort((a, b) => a.fechaHoraHusoGenRegistro.localeCompare(b.fechaHoraHusoGenRegistro));
      const { registro, envio: env } = generarRegistroYEnvio(
        emitida,
        previos.length > 0 ? previos[previos.length - 1] : null,
        numeroFacturaFormateado(emitida.serie, emitida.numero, emitida.ejercicio)
      );
      emitida.registroFacturacionId = registro.id;
      await onEmitir(emitida, registro, env);
      onClose();
    } catch (e) {
      setErrorOp(e instanceof Error ? e.message : 'Error al emitir la factura');
    }
  };

  const registroIndividualCorrecto = facturaRegistro
    ? cadenaHashAlta({
        idEmisorFactura: facturaRegistro.idEmisorFactura,
        numSerieFactura: facturaRegistro.numSerieFactura,
        fechaExpedicionFactura: facturaRegistro.fechaExpedicionFactura,
        tipoFactura: facturaRegistro.tipoFactura,
        cuotaTotal: facturaRegistro.cuotaTotal,
        importeTotal: facturaRegistro.importeTotal,
        huellaAnterior: facturaRegistro.huellaAnterior || '',
        fechaHoraHusoGenRegistro: facturaRegistro.fechaHoraHusoGenRegistro,
      })
    : '';
  const huellaRecalculada = registroIndividualCorrecto ? hashSha256(registroIndividualCorrecto) : '';
  const registroIntegro = facturaRegistro ? huellaRecalculada === facturaRegistro.huella : false;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-start justify-center p-4 z-50 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full my-6 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              {factura.tipo !== 'F1' && <span className="text-amber-600 mr-1">[{factura.tipo}]</span>}
              {numeroFacturaFormateado(factura.serie, factura.numero, factura.ejercicio)}
            </h3>
            <p className="text-sm text-slate-500">
              {factura.fechaExpedicion} · Emisor: {factura.emisor.nombre} ({factura.emisor.nif || 'NIF no informado'})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <EstadoBadge estado={factura.estado} />
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Stat label="Base imponible" value={euro2(factura.baseImponible)} />
          <Stat label="Cuota IVA" value={euro2(factura.cuotaIva)} />
          <Stat label="Retención" value={factura.cuotaRetencion != null ? euro2(factura.cuotaRetencion) : '—'} />
          <Stat label="Total" value={euro2(factura.importeTotal)} />
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm mb-5">
          <p className="font-semibold text-slate-700 mb-2">Líneas</p>
          {factura.lineas.map((l) => (
            <div key={l.id} className="flex justify-between text-slate-600 py-1 border-b border-slate-100 last:border-0">
              <span>{l.concepto} × {l.cantidad}</span>
              <span>{euro2(l.precioUnitario)} · IVA {l.tipoIva}%{l.retencionTipo ? ` · Ret ${l.retencionTipo}%` : ''}</span>
            </div>
          ))}
          {factura.receptor && (
            <p className="mt-2 text-slate-500">
              Receptor: {factura.receptor.nombre}{factura.receptor.nif ? ` (${factura.receptor.nif})` : ''}
              {factura.receptor.direccion ? ` · ${factura.receptor.direccion}` : ''}
            </p>
          )}
          {factura.vencimiento && <p className="text-slate-500">Vencimiento: {factura.vencimiento}</p>}
          {factura.formaPago && <p className="text-slate-500">Forma de pago: {factura.formaPago}</p>}
        </div>

        {/* Registro de facturación y verificación de cadena */}
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <div className="border border-slate-200 rounded-xl p-4">
            <p className="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-blue-600" /> Registro de facturación
            </p>
            {facturaRegistro ? (
              <div className="text-xs text-slate-600 space-y-1 break-all">
                <p><span className="text-slate-400">Huella:</span> {facturaRegistro.huella}</p>
                <p><span className="text-slate-400">Anterior:</span> {facturaRegistro.huellaAnterior || '— (primer registro)'}</p>
                <p><span className="text-slate-400">Marca:</span> {facturaRegistro.fechaHoraHusoGenRegistro}</p>
                <CadenaDerivada registro={facturaRegistro} />
              </div>
            ) : (
              <p className="text-xs text-slate-400">Sin registro de facturación vinculado.</p>
            )}
          </div>

          <div className="border border-slate-200 rounded-xl p-4">
            <p className="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Verificación de cadena
            </p>
            {verificacion === null ? (
              <p className="text-xs text-slate-400">No hay registros para verificar.</p>
            ) : verificacion.valida ? (
              <p className="text-xs text-emerald-700 font-medium">
                Cadena íntegra: {verificacion.registros} registros encadenados correctamente.
              </p>
            ) : (
              <p className="text-xs text-rose-700 font-medium">
                Cadena rota: {verificacion.error}
              </p>
            )}
            {facturaRegistro && (
              registroIntegro ? (
                <p className="text-xs text-emerald-700 mt-1">Huella del registro verificada (SHA-256).</p>
              ) : (
                <p className="text-xs text-rose-700 mt-1">Huella del registro NO coincide (alteración).</p>
              )
            )}
          </div>
        </div>

        {/* QR conforme v0.5.0 */}
        {factura.clase === 'EMITIDA' && factura.estado === 'EMITIDA' && (
          <div className="border border-slate-200 rounded-xl p-4 mb-5 flex items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold text-slate-700 text-sm mb-1 flex items-center gap-1.5">
                <QrCode className="w-4 h-4 text-blue-600" /> QR tributario
              </p>
              <p className="text-xs text-slate-500 break-all">
                {urlQrFactura({
                  nif: factura.emisor.nif || factura.propietarioId,
                  numserie: numeroFacturaFormateado(factura.serie, factura.numero, factura.ejercicio),
                  fecha: factura.fechaExpedicion,
                  importe: factura.importeTotal,
                  entorno: 'produccion',
                  claseSistema: 'VERIFACTU',
                })}
              </p>
            </div>
            {qrData && <img src={qrData} alt="QR tributario" className="w-28 h-28 border border-slate-200 rounded-lg" />}
          </div>
        )}

        {/* Estado VERI*FACTU */}
        <div className="border border-slate-200 rounded-xl p-4 mb-5">
          <p className="font-semibold text-slate-700 text-sm mb-2 flex items-center gap-1.5">
            <Send className="w-4 h-4 text-indigo-600" /> Remisión VERI*FACTU
          </p>
          {envio ? (
            <div className="text-xs text-slate-600 space-y-1">
              <p>Estado: <b>{envio.estado}</b> · Intentos: {envio.intentos}</p>
              {envio.codigoError && <p>Error: {envio.codigoError}{envio.descripcionError ? ` — ${envio.descripcionError}` : ''}</p>}
              {envio.codigoSeguroVerificacion && <p>CSV: {envio.codigoSeguroVerificacion}</p>}
              <p className="text-slate-400">Conexión real con AEAT pendiente (certificado/URL oficiales). Sin secretos.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Sin preparación de envío.</p>
          )}
        </div>

        {/* Acciones de inalterabilidad */}
        <div className="flex flex-wrap gap-3 items-center mt-2">
          {factura.estado === 'BORRADOR' && (
            <button
              onClick={emitirBorrador}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" /> Emitir y registrar
            </button>
          )}

          {(factura.estado === 'EMITIDA' || factura.estado === 'ACEPTADA') && (
            <button
              onClick={rectificarFactura}
              className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-sm font-semibold cursor-pointer"
            >
              <Link2 className="w-4 h-4" /> Rectificar
            </button>
          )}

          {factura.estado !== 'ANULADA' && (
            <button
              onClick={anularFacturaSeleccionada}
              className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-sm font-semibold cursor-pointer"
            >
              <Ban className="w-4 h-4" /> Anular
            </button>
          )}

          <input
            value={motivoRectificacion}
            onChange={(e) => setMotivoRectificacion(e.target.value)}
            placeholder="Motivo de rectificación"
            className="border border-slate-300 rounded-xl px-3 py-2 text-sm w-56"
          />
          {errorOp && <div className="text-rose-600 text-sm font-medium">{errorOp}</div>}
        </div>

        {/* GAP 8 — Factura electrónica B2B (bloque separado de RRSIF/VERI*FACTU) */}
        <FacturaElectronicaB2BPanel factura={factura} currentUser={currentUser ?? null} />

        <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          Factura emitida ≠ cobro. El pago lo gestiona Cobros y Conciliación (GAP6). Nada se renunera ni altera silenciosamente.
        </div>
      </div>
    </div>
  );
}

function CadenaDerivada({ registro }: { registro: RegistroFacturacion }) {
  const cadena = useMemo(() => {
    return cadenaHashAlta({
      idEmisorFactura: registro.idEmisorFactura,
      numSerieFactura: registro.numSerieFactura,
      fechaExpedicionFactura: registro.fechaExpedicionFactura,
      tipoFactura: registro.tipoFactura,
      cuotaTotal: registro.cuotaTotal,
      importeTotal: registro.importeTotal,
      huellaAnterior: registro.huellaAnterior || '',
      fechaHoraHusoGenRegistro: registro.fechaHoraHusoGenRegistro,
    });
  }, [registro]);
  return <p className="text-xs text-slate-400 break-all">Cadena: {cadena}</p>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="font-bold text-slate-800 text-sm">{value}</p>
    </div>
  );
}
