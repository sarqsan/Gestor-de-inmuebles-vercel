import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Building2,
  MapPin,
  Calculator,
  Euro,
  Home,
  Plus,
  Save,
  Copy,
  Archive,
  Trash2,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Info,
  Layers,
  Hammer,
  Banknote,
  Percent,
  BarChart3,
  ArrowUpRight,
  Clock,
  Edit3,
  Eye,
  Building,
} from 'lucide-react';
import { Inmueble, UsuarioApp } from '../../types';
import type {
  AnalisisInversion,
  DatosInmuebleAnalisis,
  ValoracionAnalisis,
  ComparableInversion,
  CosteCompraAnalisis,
  FinanciacionAnalisis,
  AlquilerEstimado,
  PartidaReformaInversion,
  ReformaAnalisis,
  ValorDespuesReforma,
  EscenarioInversionDetalle,
} from '../../types/inversion';
import {
  calcularPrecioM2,
  calcularDiferenciaPrecioValor,
  calcularCosteCompra,
  cuotaFrancesaDeterminista,
  calcularFinanciacion,
  calcularAlquiler,
  calcularReforma,
  calcularValorDespuesReforma,
  calcularResumen,
  calcularIndicadores,
  generarEscenarios,
  generarEscenariosNiveles,
  MENSAJE_INSUFICIENTE_VALORACION,
  MENSAJE_INSUFICIENTE_COSTE,
  MENSAJE_INSUFICIENTE_ALQUILER,
  redondear2,
} from '../../utils/inversionEngine';
import {
  subscribeAnalisisInversion,
  saveAnalisisInversionFirestore,
  deleteAnalisisInversionFirestore,
} from '../../lib/firebaseInversion';

interface InversionSectionProps {
  inmuebles: Inmueble[];
  currentUser?: UsuarioApp;
  onAddInmueble?: (inm: Inmueble) => void;
  onSelectInmueble?: (id: string) => void;
}

type TabKey =
  | 'datos'
  | 'valoracion'
  | 'comparables'
  | 'costes'
  | 'financiacion'
  | 'alquiler'
  | 'reforma'
  | 'valorDespues'
  | 'escenarios'
  | 'resumen';

const CATEGORIAS_REFORMA: { id: string; label: string }[] = [
  { id: 'COCINA', label: 'Cocina' },
  { id: 'BANOS', label: 'Baños' },
  { id: 'INSTALACIONES', label: 'Instalaciones' },
  { id: 'PINTURA', label: 'Pintura' },
  { id: 'SUELOS', label: 'Suelos' },
  { id: 'PUERTAS', label: 'Puertas' },
  { id: 'VENTANAS', label: 'Ventanas' },
  { id: 'ELECTRICIDAD', label: 'Electricidad' },
  { id: 'FONTANERIA', label: 'Fontanería' },
  { id: 'CLIMATIZACION', label: 'Climatización' },
  { id: 'MOBILIARIO', label: 'Mobiliario' },
  { id: 'OTROS', label: 'Otros' },
];

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function formatEur(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
function formatPct(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)} %`;
}
function formatM2(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('es-ES')} €/m²`;
}

export const InversionSection: React.FC<InversionSectionProps> = ({ inmuebles, currentUser, onAddInmueble }) => {
  const propietarioId = currentUser?.propietarioId || currentUser?.id || 'sin_propietario';
  const [analisisList, setAnalisisList] = useState<AnalisisInversion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('datos');
  const [filtroTexto, setFiltroTexto] = useState('');

  // Form state
  const [form, setForm] = useState<Partial<AnalisisInversion> | null>(null);

  // Subscribe
  useEffect(() => {
    const scope = currentUser
      ? {
          tipoPerfil: currentUser.tipoPerfil,
          propietarioId: currentUser.propietarioId,
          inmuebleIds: currentUser.inmuebleIds,
        }
      : undefined;
    const unsub = subscribeAnalisisInversion(setAnalisisList, scope as any);
    return () => unsub();
  }, [currentUser]);

  const selectedAnalisis = useMemo(
    () => analisisList.find((a) => a.id === selectedId) || null,
    [analisisList, selectedId]
  );

  // Crear nuevo análisis vacío
  const handleNuevo = (inmuebleExistenteId?: string) => {
    const baseInmueble = inmuebleExistenteId ? inmuebles.find((i) => i.id === inmuebleExistenteId) : undefined;
    const datos: DatosInmuebleAnalisis = baseInmueble
      ? {
          direccion: baseInmueble.direccion || baseInmueble.alias || '',
          ciudad: baseInmueble.ciudad,
          codigoPostal: baseInmueble.codigoPostal,
          provincia: baseInmueble.provincia,
          superficie: baseInmueble.superficie,
          habitaciones: baseInmueble.habitaciones,
          banos: baseInmueble.banos,
          planta: baseInmueble.planta,
          ascensor: baseInmueble.ascensor,
          estadoConservacion: baseInmueble.estadoConservacion,
          tipoInmueble: (baseInmueble.tipoInmueble as any) || 'piso',
          precioAnunciado: baseInmueble.precio,
          precioPrevistoCompra: baseInmueble.valorAdquisicion,
        }
      : {
          direccion: '',
          superficie: undefined,
          habitaciones: undefined,
          banos: undefined,
          tipoInmueble: 'piso',
        };

    const nuevo: AnalisisInversion = {
      id: genId('ana'),
      propietarioId,
      inmuebleId: baseInmueble?.id,
      esNuevoInmueble: !baseInmueble,
      titulo: baseInmueble ? `Análisis ${baseInmueble.alias || baseInmueble.direccion}` : 'Nuevo análisis de inversión',
      estado: 'BORRADOR',
      datosInmueble: datos,
      valoracion: {
        datosSuficientes: false,
        mensajeInsuficiencia: MENSAJE_INSUFICIENTE_VALORACION,
        superficie: datos.superficie,
        precioSolicitado: datos.precioAnunciado,
      },
      comparables: [],
      costeCompra: {
        precioCompra: datos.precioPrevistoCompra || datos.precioAnunciado || 0,
        impuestos: undefined,
        notaria: undefined,
        registro: undefined,
        gestoria: undefined,
        otrosGastos: undefined,
      },
      financiacion: {
        usarFinanciacion: false,
      },
      alquiler: {
        alquilerMensual: undefined,
        ocupacionPrevistaPct: 95,
      },
      reforma: {
        partidas: [],
        costeTotalReforma: null,
        costeConContingencia: null,
        contingenciaPct: 10,
      },
      escenarios: [],
      resumen: {
        compraPrecio: null,
        gastosAdquisicion: null,
        reformaCoste: null,
        inversionTotal: null,
        valorFinalEstimado: null,
        alquilerMensual: null,
        alquilerAnual: null,
        rentabilidadBruta: null,
        rentabilidadNeta: null,
        flujoCajaAnual: null,
        incrementoValor: null,
        recuperacionMeses: null,
      },
      indicadores: {
        rentabilidadBruta: null,
        rentabilidadNeta: null,
        cashFlowAnual: null,
        cashFlowMensual: null,
        inversionTotal: null,
        diferenciaCompraValoracion: null,
        diferenciaCompraValoracionPct: null,
        incrementoValorReforma: null,
        incrementoAlquilerReforma: null,
        retornoReformaPct: null,
        plazoRecuperacionMeses: null,
        plazoRecuperacionAnios: null,
        capitalPropioNecesario: null,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      historial: [{ id: genId('hist'), fecha: new Date().toISOString(), accion: 'CREADO', detalle: 'Análisis creado' }],
    };

    setForm(nuevo);
    setIsCreating(true);
    setSelectedId(null);
    setActiveTab('datos');
  };

  const handleEditar = (a: AnalisisInversion) => {
    setForm(JSON.parse(JSON.stringify(a)));
    setIsCreating(true);
    setSelectedId(a.id);
    setActiveTab('datos');
  };

  const handleDuplicar = async (a: AnalisisInversion) => {
    const dup: AnalisisInversion = {
      ...JSON.parse(JSON.stringify(a)),
      id: genId('ana'),
      titulo: `${a.titulo} (copia)`,
      estado: 'BORRADOR',
      convertidoEnInmuebleId: undefined,
      fechaConversion: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      historial: [
        ...(a.historial || []),
        { id: genId('hist'), fecha: new Date().toISOString(), accion: 'DUPLICADO', detalle: `Duplicado de ${a.id}` },
      ],
    };
    await saveAnalisisInversionFirestore(dup);
  };

  const recalcular = (draft: Partial<AnalisisInversion>): Partial<AnalisisInversion> => {
    if (!draft.datosInmueble || !draft.costeCompra || !draft.alquiler || !draft.reforma) return draft;

    // Valoración
    const valoracionCalc = (() => {
      const v: ValoracionAnalisis = draft.valoracion || { datosSuficientes: false };
      const datos = draft.datosInmueble!;
      const superficie = datos.superficie ?? v.superficie;
      const precioSolicitado = datos.precioAnunciado ?? v.precioSolicitado ?? datos.precioPrevistoCompra;
      const valorEstimado = v.valorEstimadoMercado ?? precioSolicitado;

      const precioM2 = calcularPrecioM2(precioSolicitado, superficie);
      const valorM2 = calcularPrecioM2(valorEstimado, superficie);
      const diff = calcularDiferenciaPrecioValor(precioSolicitado, valorEstimado);
      const datosSuf = precioSolicitado != null || valorEstimado != null;

      return {
        ...v,
        superficie,
        precioSolicitado,
        valorEstimadoMercado: valorEstimado,
        precioM2: precioM2 ?? valorM2 ?? null,
        diferenciaPrecioValor: diff.diferencia,
        diferenciaPct: diff.pct,
        datosSuficientes: datosSuf,
        mensajeInsuficiencia: datosSuf ? undefined : MENSAJE_INSUFICIENTE_VALORACION,
        fuente: datosSuf ? v.fuente || 'manual' : undefined,
      };
    })();

    // Coste compra
    const costeCalc = calcularCosteCompra(draft.costeCompra as CosteCompraAnalisis);

    // Financiación
    const finanCalc = calcularFinanciacion(draft.financiacion, costeCalc.costeTotalAdquisicion ?? null);

    // Alquiler
    const alqCalc = calcularAlquiler(draft.alquiler as AlquilerEstimado);

    // Reforma
    const refCalc = calcularReforma(draft.reforma as ReformaAnalisis);

    // Valor después reforma
    const valorDespuesCalc = draft.valorDespuesReforma
      ? calcularValorDespuesReforma(
          draft.valorDespuesReforma as ValorDespuesReforma,
          refCalc.costeConContingencia ?? refCalc.costeTotalReforma
        )
      : undefined;

    // Escenarios
    const escenarios = generarEscenarios(costeCalc, refCalc, alqCalc, valoracionCalc, valorDespuesCalc);
    const niveles = generarEscenariosNiveles(valoracionCalc, alqCalc, refCalc);

    // Resumen e indicadores
    const resumen = calcularResumen(costeCalc, refCalc, alqCalc, valoracionCalc, valorDespuesCalc);
    const indicadores = calcularIndicadores(costeCalc, valoracionCalc, alqCalc, refCalc, valorDespuesCalc, finanCalc);

    return {
      ...draft,
      valoracion: valoracionCalc,
      costeCompra: costeCalc,
      financiacion: finanCalc,
      alquiler: alqCalc,
      reforma: refCalc,
      valorDespuesReforma: valorDespuesCalc,
      escenarios,
      escenariosNiveles: niveles,
      resumen,
      indicadores,
    };
  };

  const handleGuardar = async () => {
    if (!form) return;
    const recalc = recalcular(form) as AnalisisInversion;
    const toSave: AnalisisInversion = {
      ...(recalc as AnalisisInversion),
      propietarioId,
      updatedAt: new Date().toISOString(),
      version: (recalc.version || 1) + 1,
      historial: [
        ...(recalc.historial || []),
        { id: genId('hist'), fecha: new Date().toISOString(), accion: 'GUARDADO', detalle: 'Análisis actualizado' },
      ],
    };
    await saveAnalisisInversionFirestore(toSave);
    setIsCreating(false);
    setSelectedId(toSave.id);
    setForm(null);
  };

  const handleEliminar = async (id: string) => {
    if (!confirm('¿Eliminar este análisis de inversión? Esta acción no se puede deshacer.')) return;
    await deleteAnalisisInversionFirestore(id);
    setSelectedId(null);
    setIsCreating(false);
  };

  const handleConvertir = async () => {
    if (!form) return;
    if (!onAddInmueble) {
      alert('Conversión no disponible en este contexto');
      return;
    }
    if (!confirm('¿Convertir este análisis en inmueble de cartera? Se creará un nuevo inmueble con los datos del análisis. El histórico del análisis se mantendrá.')) return;

    const d = form.datosInmueble!;
    const nuevoInmueble: Inmueble = {
      id: genId('inm'),
      direccion: d.direccion || 'Sin dirección',
      ciudad: d.ciudad || '',
      precio: form.alquiler?.alquilerMensual || 0,
      estado: 'disponible',
      habitaciones: d.habitaciones || 0,
      banos: d.banos || 0,
      superficie: d.superficie || 0,
      descripcion: d.observaciones || d.caracteristicasRelevantes || '',
      candidatosCount: 0,
      fianzaMeses: 1,
      tipoInmueble: (d.tipoInmueble as any) || 'piso',
      planta: d.planta,
      ascensor: d.ascensor,
      estadoConservacion: d.estadoConservacion as any,
      valorAdquisicion: form.costeCompra?.precioCompra,
      valoracionEstimada: form.valoracion?.valorEstimadoMercado,
      propietarioId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onAddInmueble(nuevoInmueble);

    // Marcar análisis como convertido
    const actualizado = {
      ...(form as AnalisisInversion),
      estado: 'CONVERTIDO' as const,
      convertidoEnInmuebleId: nuevoInmueble.id,
      fechaConversion: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      historial: [
        ...(form.historial || []),
        { id: genId('hist'), fecha: new Date().toISOString(), accion: 'CONVERTIDO', detalle: `Convertido a inmueble ${nuevoInmueble.id}` },
      ],
    };
    await saveAnalisisInversionFirestore(actualizado as AnalisisInversion);
    setIsCreating(false);
    setSelectedId(actualizado.id);
  };

  // Filtro lista
  const listaFiltrada = useMemo(() => {
    if (!filtroTexto) return analisisList;
    const q = filtroTexto.toLowerCase();
    return analisisList.filter(
      (a) =>
        a.titulo.toLowerCase().includes(q) ||
        a.datosInmueble.direccion.toLowerCase().includes(q) ||
        (a.datosInmueble.ciudad || '').toLowerCase().includes(q)
    );
  }, [analisisList, filtroTexto]);

  // Render lista
  if (!isCreating && !selectedId) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Inversión y Valoración Inmobiliaria</h1>
                <p className="text-xs text-slate-500">Analiza compra → costes → reforma → alquiler → rentabilidad → escenarios</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleNuevo()}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" /> Nuevo análisis
              </button>
            </div>
          </div>

          {/* Selector inmueble existente */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Analizar inmueble existente de cartera</label>
              <select
                onChange={(e) => {
                  if (e.target.value) handleNuevo(e.target.value);
                }}
                defaultValue=""
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
              >
                <option value="">Selecciona inmueble para analizar…</option>
                {inmuebles.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.alias || i.direccion} — {i.ciudad} {i.superficie ? `· ${i.superficie}m²` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">No crea inmueble real automáticamente. Registro independiente.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Buscar análisis guardados</label>
              <input
                type="text"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Filtrar por título, dirección, ciudad…"
                className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
          </div>
        </div>

        {/* Lista análisis */}
        {listaFiltrada.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 border border-dashed border-slate-200 text-center space-y-3">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">No hay análisis guardados</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Crea un nuevo análisis para una oportunidad de inversión. Podrás valorar precio de mercado, costes de adquisición, reforma estimada, alquiler potencial y rentabilidad en escenarios conservador, central y favorable. Sin datos ficticios: si falta información verás “No hay datos suficientes para calcular…”.
            </p>
            <button
              onClick={() => handleNuevo()}
              className="mt-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
            >
              Crear primer análisis
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listaFiltrada.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-slate-300 transition">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                          a.estado === 'CONVERTIDO'
                            ? 'bg-emerald-100 text-emerald-700'
                            : a.estado === 'ANALIZADO'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {a.estado}
                      </span>
                      <span className="text-[10px] text-slate-400">{new Date(a.updatedAt).toLocaleDateString()}</span>
                    </div>
                    <h3 className="mt-2 font-bold text-sm text-slate-900 line-clamp-1">{a.titulo}</h3>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" /> {a.datosInmueble.direccion} {a.datosInmueble.ciudad ? `· ${a.datosInmueble.ciudad}` : ''}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-50 rounded-xl p-2">
                    <div className="text-[10px] text-slate-500">Compra</div>
                    <div className="font-bold text-slate-900">{formatEur(a.costeCompra?.precioCompra)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <div className="text-[10px] text-slate-500">Inversión total</div>
                    <div className="font-bold text-slate-900">{formatEur(a.resumen?.inversionTotal)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <div className="text-[10px] text-slate-500">Alquiler</div>
                    <div className="font-bold text-slate-900">{formatEur(a.alquiler?.alquilerMensual)}/mes</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2">
                    <div className="text-[10px] text-slate-500">Rent. neta</div>
                    <div className="font-bold text-emerald-700">{formatPct(a.indicadores?.rentabilidadNeta)}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => setSelectedId(a.id)}
                    className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" /> Ver
                  </button>
                  <button
                    onClick={() => handleEditar(a)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDuplicar(a)}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleEliminar(a.id)}
                    className="px-3 py-2 bg-white border border-rose-100 text-rose-600 rounded-xl text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Nota seguridad */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Privacidad:</span> Los análisis son privados por propietario (aislamiento propietarioId, deny-by-default). No se crean inmuebles reales automáticamente. Datos introducidos vs calculados se distinguen en la UI. Estimaciones marcadas como tal.
          </div>
        </div>
      </div>
    );
  }

  // Vista detalle solo lectura
  if (selectedAnalisis && !isCreating) {
    const a = selectedAnalisis;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedId(null)} className="p-2 bg-white border border-slate-200 rounded-xl">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="font-bold text-slate-900">{a.titulo}</h2>
          <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 rounded-md">{a.estado}</span>
        </div>

        {/* Resumen visual */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Resumen visual COMPRA/GASTOS/REFORMA/INVERSIÓN/VALOR/ALQUILER/RENTABILIDAD
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-500">COMPRA</div>
                <div className="font-bold">{formatEur(a.resumen.compraPrecio)}</div>
                <div className="text-[10px] text-slate-400 mt-1">Dato introducido</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-500">GASTOS ADQ.</div>
                <div className="font-bold">{formatEur(a.resumen.gastosAdquisicion)}</div>
                <div className="text-[10px] text-slate-400 mt-1">Calculado</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-500">REFORMA</div>
                <div className="font-bold">{formatEur(a.resumen.reformaCoste)}</div>
                <div className="text-[10px] text-slate-400 mt-1">Estimación</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                <div className="text-[10px] text-emerald-700">INVERSIÓN TOTAL</div>
                <div className="font-bold text-emerald-900">{formatEur(a.resumen.inversionTotal)}</div>
                <div className="text-[10px] text-emerald-600 mt-1">Calculado</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <div className="text-[10px] text-blue-700">VALOR FINAL</div>
                <div className="font-bold text-blue-900">{formatEur(a.resumen.valorFinalEstimado)}</div>
                <div className="text-[10px] text-blue-600 mt-1">Estimación</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-500">ALQUILER</div>
                <div className="font-bold">{formatEur(a.resumen.alquilerMensual)}/mes</div>
                <div className="text-[10px] text-slate-400 mt-1">Dato introducido</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-500">RENT. BRUTA</div>
                <div className="font-bold">{formatPct(a.resumen.rentabilidadBruta)}</div>
                <div className="text-[10px] text-slate-400 mt-1">Calculado</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="text-[10px] text-slate-500">RENT. NETA</div>
                <div className="font-bold">{formatPct(a.resumen.rentabilidadNeta)}</div>
                <div className="text-[10px] text-slate-400 mt-1">Calculado</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div className="rounded-xl border border-slate-200 p-3 text-xs">
                <div className="font-semibold">Flujo caja anual</div>
                <div className="text-lg font-bold">{formatEur(a.resumen.flujoCajaAnual)}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-xs">
                <div className="font-semibold">Incremento valor reforma</div>
                <div className="text-lg font-bold">{formatEur(a.resumen.incrementoValor)}</div>
                <div className="text-[10px] text-slate-400">Estimación</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 text-xs">
                <div className="font-semibold">Recuperación</div>
                <div className="text-lg font-bold">{a.resumen.recuperacionMeses ? `${a.resumen.recuperacionMeses} meses` : '—'}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h3 className="font-bold text-sm">Indicadores clave</h3>
            <div className="space-y-2 text-xs">
              {[
                ['Rentabilidad bruta', formatPct(a.indicadores.rentabilidadBruta), 'calculado'],
                ['Rentabilidad neta', formatPct(a.indicadores.rentabilidadNeta), 'calculado'],
                ['Cash flow anual', formatEur(a.indicadores.cashFlowAnual), 'calculado'],
                ['Cash flow mensual', formatEur(a.indicadores.cashFlowMensual), 'calculado'],
                ['Inversión total', formatEur(a.indicadores.inversionTotal), 'calculado'],
                ['Dif. compra-valoración', formatEur(a.indicadores.diferenciaCompraValoracion), 'calculado'],
                ['% dif. compra-valoración', formatPct(a.indicadores.diferenciaCompraValoracionPct), 'calculado'],
                ['Incremento valor reforma', formatEur(a.indicadores.incrementoValorReforma), 'estimación'],
                ['Incremento alquiler reforma', formatEur(a.indicadores.incrementoAlquilerReforma), 'estimación'],
                ['Retorno reforma', formatPct(a.indicadores.retornoReformaPct), 'estimación'],
                ['Plazo recuperación', a.indicadores.plazoRecuperacionMeses ? `${a.indicadores.plazoRecuperacionMeses} meses` : '—', 'estimación'],
                ['Capital propio', formatEur(a.indicadores.capitalPropioNecesario), 'calculado si disponible'],
              ].map(([label, val, tipo]) => (
                <div key={label as string} className="flex justify-between border-b border-slate-50 py-1.5">
                  <span className="text-slate-500">
                    {label} <span className="text-[10px]">({tipo})</span>
                  </span>
                  <span className="font-semibold">{val as string}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 flex gap-2">
              <button
                onClick={() => handleEditar(a)}
                className="flex-1 px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
              >
                Editar análisis
              </button>
              <button
                onClick={() => handleDuplicar(a)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold"
              >
                Duplicar
              </button>
            </div>
          </div>
        </div>

        {/* Escenarios lado a lado */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-sm mb-3">Comparación escenarios lado a lado</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {a.escenarios.map((esc) => (
              <div key={esc.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="font-bold text-xs">{esc.nombre}</div>
                <div className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md inline-block">ESTIMACIÓN / ESCENARIO</div>
                <div className="text-xs space-y-1 pt-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Inversión total</span>
                    <span className="font-semibold">{formatEur(esc.inversionTotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Alquiler mes</span>
                    <span className="font-semibold">{formatEur(esc.alquilerMensual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Rent. neta</span>
                    <span className="font-semibold">{formatPct(esc.rentabilidadNeta)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Flujo anual</span>
                    <span className="font-semibold">{formatEur(esc.flujoCajaAnual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Valor est.</span>
                    <span className="font-semibold">{formatEur(esc.valorEstimado)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Escenarios conservador/central/favorable */}
          {a.escenariosNiveles && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="font-semibold">Valoración</div>
                <div>Conservadora: {formatEur(a.escenariosNiveles.valoracion.conservadora)}</div>
                <div>Central: {formatEur(a.escenariosNiveles.valoracion.central)}</div>
                <div>Favorable: {formatEur(a.escenariosNiveles.valoracion.favorable)}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="font-semibold">Alquiler mensual</div>
                <div>Conservador: {formatEur(a.escenariosNiveles.alquiler.conservador)}</div>
                <div>Central: {formatEur(a.escenariosNiveles.alquiler.central)}</div>
                <div>Favorable: {formatEur(a.escenariosNiveles.alquiler.favorable)}</div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <div className="font-semibold">Reforma</div>
                <div>Previsto: {formatEur(a.escenariosNiveles.reforma.previsto)}</div>
                <div>Superior: {formatEur(a.escenariosNiveles.reforma.superior)}</div>
                <div>Máximo: {formatEur(a.escenariosNiveles.reforma.maximo)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Histórico */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-bold text-sm mb-3">Histórico</h3>
          <div className="space-y-2 text-xs">
            {(a.historial || []).map((h) => (
              <div key={h.id} className="flex gap-2 border-b border-slate-50 py-1.5">
                <span className="text-slate-400">{new Date(h.fecha).toLocaleString()}</span>
                <span className="font-semibold">{h.accion}</span>
                <span className="text-slate-500">{h.detalle}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Modo edición/creación
  const draft = form;
  if (!draft) return null;

  const recalcPreview = recalcular(draft) as AnalisisInversion;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setIsCreating(false);
            setForm(null);
            setSelectedId(selectedId);
          }}
          className="p-2 bg-white border border-slate-200 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <input
            value={draft.titulo || ''}
            onChange={(e) => setForm({ ...draft, titulo: e.target.value })}
            className="w-full text-lg font-bold bg-transparent border-b border-slate-200 focus:border-emerald-500 outline-none"
            placeholder="Título del análisis"
          />
          <p className="text-[11px] text-slate-400">Registro independiente de la cartera real. No crea inmueble automáticamente.</p>
        </div>
        <button onClick={handleGuardar} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
          <Save className="w-4 h-4" /> Guardar análisis
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex overflow-x-auto border-b border-slate-200 px-2 gap-1">
          {(
            [
              { id: 'datos', label: 'Inmueble', icon: Home },
              { id: 'valoracion', label: 'Valoración', icon: Euro },
              { id: 'comparables', label: 'Comparables', icon: Building },
              { id: 'costes', label: 'Costes compra', icon: Calculator },
              { id: 'financiacion', label: 'Financiación', icon: Banknote },
              { id: 'alquiler', label: 'Alquiler', icon: TrendingUp },
              { id: 'reforma', label: 'Reforma', icon: Hammer },
              { id: 'valorDespues', label: 'Valor post-reforma', icon: ArrowUpRight },
              { id: 'escenarios', label: 'Escenarios', icon: Layers },
              { id: 'resumen', label: 'Resultado', icon: BarChart3 },
            ] as { id: TabKey; label: string; icon: any }[]
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-3 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap ${
                  active ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === 'datos' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Datos del inmueble analizado</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Dirección (dato introducido) *</span>
                  <input
                    value={draft.datosInmueble?.direccion || ''}
                    onChange={(e) => setForm({ ...draft, datosInmueble: { ...draft.datosInmueble!, direccion: e.target.value } })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    placeholder="C/ Mayor 5, 2ºB"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Ciudad (dato introducido)</span>
                  <input
                    value={draft.datosInmueble?.ciudad || ''}
                    onChange={(e) => setForm({ ...draft, datosInmueble: { ...draft.datosInmueble!, ciudad: e.target.value } })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Superficie m² (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.datosInmueble?.superficie || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        datosInmueble: { ...draft.datosInmueble!, superficie: e.target.value ? Number(e.target.value) : undefined },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Habitaciones / Baños / Planta</span>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      placeholder="Hab"
                      value={draft.datosInmueble?.habitaciones || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          datosInmueble: { ...draft.datosInmueble!, habitaciones: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Baños"
                      value={draft.datosInmueble?.banos || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          datosInmueble: { ...draft.datosInmueble!, banos: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                    <input
                      placeholder="Planta"
                      value={draft.datosInmueble?.planta || ''}
                      onChange={(e) => setForm({ ...draft, datosInmueble: { ...draft.datosInmueble!, planta: e.target.value } })}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Tipo inmueble / Estado / Ascensor</span>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={draft.datosInmueble?.tipoInmueble || 'piso'}
                      onChange={(e) => setForm({ ...draft, datosInmueble: { ...draft.datosInmueble!, tipoInmueble: e.target.value } })}
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                    >
                      <option value="piso">Piso</option>
                      <option value="casa">Casa</option>
                      <option value="atico">Ático</option>
                      <option value="estudio">Estudio</option>
                      <option value="duplex">Dúplex</option>
                      <option value="local">Local</option>
                    </select>
                    <select
                      value={draft.datosInmueble?.estadoConservacion || 'bueno'}
                      onChange={(e) =>
                        setForm({ ...draft, datosInmueble: { ...draft.datosInmueble!, estadoConservacion: e.target.value as any } })
                      }
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                    >
                      <option value="nuevo">Nuevo</option>
                      <option value="muy_bueno">Muy bueno</option>
                      <option value="bueno">Bueno</option>
                      <option value="a_reformar">A reformar</option>
                    </select>
                    <label className="flex items-center gap-2 text-xs px-2">
                      <input
                        type="checkbox"
                        checked={!!draft.datosInmueble?.ascensor}
                        onChange={(e) => setForm({ ...draft, datosInmueble: { ...draft.datosInmueble!, ascensor: e.target.checked } })}
                      />
                      Ascensor
                    </label>
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Precio anunciado / Previsto compra (dato introducido)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Anunciado"
                      value={draft.datosInmueble?.precioAnunciado || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          datosInmueble: {
                            ...draft.datosInmueble!,
                            precioAnunciado: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Previsto compra"
                      value={draft.datosInmueble?.precioPrevistoCompra || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          datosInmueble: {
                            ...draft.datosInmueble!,
                            precioPrevistoCompra: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })
                      }
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                </label>
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold">Observaciones / Características relevantes (dato introducido)</span>
                  <textarea
                    value={draft.datosInmueble?.observaciones || draft.datosInmueble?.caracteristicasRelevantes || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        datosInmueble: { ...draft.datosInmueble!, observaciones: e.target.value },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    rows={3}
                  />
                </label>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600 flex gap-2">
                <Info className="w-4 h-4 shrink-0" />
                <span>Distinción dato introducido vs calculado: todos los campos de esta sección son introducidos. Los calculados aparecen en Valoración, Costes, etc.</span>
              </div>
            </div>
          )}

          {activeTab === 'valoracion' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Valoración inmobiliaria</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Valor estimado de mercado (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.valoracion?.valorEstimadoMercado || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        valoracion: {
                          ...draft.valoracion!,
                          valorEstimadoMercado: e.target.value ? Number(e.target.value) : undefined,
                          datosSuficientes: true,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    placeholder="Ej 185000"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Precio solicitado (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.valoracion?.precioSolicitado || draft.datosInmueble?.precioAnunciado || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        valoracion: { ...draft.valoracion!, precioSolicitado: e.target.value ? Number(e.target.value) : undefined, datosSuficientes: true },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Escenarios valoración (dato introducido opcional)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      placeholder="Conservador"
                      value={draft.valoracion?.escenarioConservador || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          valoracion: { ...draft.valoracion!, escenarioConservador: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Central"
                      value={draft.valoracion?.escenarioCentral || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          valoracion: { ...draft.valoracion!, escenarioCentral: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Favorable"
                      value={draft.valoracion?.escenarioFavorable || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          valoracion: { ...draft.valoracion!, escenarioFavorable: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Fuente / Notas</span>
                  <input
                    value={draft.valoracion?.fuente || ''}
                    onChange={(e) => setForm({ ...draft, valoracion: { ...draft.valoracion!, fuente: e.target.value } })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    placeholder="manual, comparables, tasación…"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="bg-slate-50 rounded-xl p-3 text-xs">
                  <div className="text-slate-500">€/m² (calculado)</div>
                  <div className="font-bold text-sm">{formatM2(recalcPreview.valoracion?.precioM2)}</div>
                  {!recalcPreview.valoracion?.datosSuficientes && (
                    <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2 text-[11px]">
                      {MENSAJE_INSUFICIENTE_VALORACION}
                    </div>
                  )}
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-xs">
                  <div className="text-slate-500">Diferencia compra-valoración (calculado)</div>
                  <div className="font-bold text-sm">{formatEur(recalcPreview.valoracion?.diferenciaPrecioValor)}</div>
                  <div className="text-[11px] text-slate-400">{formatPct(recalcPreview.valoracion?.diferenciaPct)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-xs">
                  <div className="text-slate-500">Arquitectura preparada</div>
                  <div className="text-[11px] text-slate-600 mt-1">Comparables, APIs externas, IA — integración preparada sin scraping implementado.</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'comparables' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Comparables de mercado</h3>
              <div className="space-y-3">
                {(draft.comparables || []).map((c, idx) => (
                  <div key={c.id} className="border border-slate-200 rounded-xl p-3 grid grid-cols-1 md:grid-cols-6 gap-2 text-xs">
                    <input
                      placeholder="Ubicación"
                      value={c.ubicacion}
                      onChange={(e) => {
                        const arr = [...(draft.comparables || [])];
                        arr[idx] = { ...c, ubicacion: e.target.value };
                        setForm({ ...draft, comparables: arr });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Superficie"
                      value={c.superficie || ''}
                      onChange={(e) => {
                        const arr = [...(draft.comparables || [])];
                        arr[idx] = { ...c, superficie: e.target.value ? Number(e.target.value) : undefined };
                        setForm({ ...draft, comparables: arr });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Precio"
                      value={c.precio || ''}
                      onChange={(e) => {
                        const arr = [...(draft.comparables || [])];
                        arr[idx] = { ...c, precio: e.target.value ? Number(e.target.value) : undefined, precioM2: calcularPrecioM2(e.target.value ? Number(e.target.value) : undefined, c.superficie) };
                        setForm({ ...draft, comparables: arr });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg"
                    />
                    <div className="px-2 py-1.5 bg-slate-50 rounded-lg">{formatM2(c.precioM2 ?? calcularPrecioM2(c.precio, c.superficie))}</div>
                    <input
                      placeholder="Fuente"
                      value={c.fuente || ''}
                      onChange={(e) => {
                        const arr = [...(draft.comparables || [])];
                        arr[idx] = { ...c, fuente: e.target.value };
                        setForm({ ...draft, comparables: arr });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg"
                    />
                    <button
                      onClick={() => {
                        const arr = (draft.comparables || []).filter((_, i) => i !== idx);
                        setForm({ ...draft, comparables: arr });
                      }}
                      className="px-2 py-1.5 bg-rose-50 text-rose-600 rounded-lg"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const nuevo: ComparableInversion = { id: genId('comp'), ubicacion: '', precioM2: null };
                    setForm({ ...draft, comparables: [...(draft.comparables || []), nuevo] });
                  }}
                  className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
                >
                  + Añadir comparable
                </button>
              </div>

              {recalcPreview.comparables && recalcPreview.comparables.length > 0 && (
                <div className="mt-4 text-xs">
                  <h4 className="font-semibold mb-2">Comparación analizado ↔ comparables (calculado)</h4>
                  <div className="space-y-1">
                    {recalcPreview.comparables.map((c) => {
                      const m2Ana = recalcPreview.valoracion?.precioM2;
                      const m2Comp = c.precioM2 ?? calcularPrecioM2(c.precio, c.superficie);
                      const diff = m2Ana != null && m2Comp != null ? redondear2(m2Comp - m2Ana) : null;
                      return (
                        <div key={c.id} className="flex justify-between border-b border-slate-100 py-1">
                          <span>{c.ubicacion || 'Sin ubicación'}</span>
                          <span>
                            {formatM2(m2Comp)} {diff != null ? `(Δ ${formatEur(diff)})` : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'costes' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Coste real de compra</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Precio compra (dato introducido) *</span>
                  <input
                    type="number"
                    value={draft.costeCompra?.precioCompra || ''}
                    onChange={(e) =>
                      setForm({ ...draft, costeCompra: { ...draft.costeCompra!, precioCompra: e.target.value ? Number(e.target.value) : 0 } })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs">Impuestos (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.costeCompra?.impuestos || ''}
                      onChange={(e) =>
                        setForm({ ...draft, costeCompra: { ...draft.costeCompra!, impuestos: e.target.value ? Number(e.target.value) : undefined } })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Notaría (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.costeCompra?.notaria || ''}
                      onChange={(e) =>
                        setForm({ ...draft, costeCompra: { ...draft.costeCompra!, notaria: e.target.value ? Number(e.target.value) : undefined } })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Registro (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.costeCompra?.registro || ''}
                      onChange={(e) =>
                        setForm({ ...draft, costeCompra: { ...draft.costeCompra!, registro: e.target.value ? Number(e.target.value) : undefined } })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Gestoría (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.costeCompra?.gestoria || ''}
                      onChange={(e) =>
                        setForm({ ...draft, costeCompra: { ...draft.costeCompra!, gestoria: e.target.value ? Number(e.target.value) : undefined } })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Otros gastos (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.costeCompra?.otrosGastos || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          costeCompra: { ...draft.costeCompra!, otrosGastos: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Otros costes (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.costeCompra?.otrosCostes || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          costeCompra: { ...draft.costeCompra!, otrosCostes: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-xs">
                  <div className="text-slate-500">Gastos adquisición (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.costeCompra?.gastosAdquisicion)}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-xs">
                  <div className="text-emerald-700">COSTE TOTAL ADQUISICIÓN (calculado)</div>
                  <div className="font-bold text-emerald-900 text-sm">{formatEur(recalcPreview.costeCompra?.costeTotalAdquisicion)}</div>
                  <div className="text-[10px] text-emerald-600 mt-1">Distingue precio / gastos / inversión / financiación / capital propio</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
                  No se aplican porcentajes fiscales inventados rígidos. Introduce impuestos reales si los conoces.
                  {(!recalcPreview.costeCompra?.costeTotalAdquisicion || recalcPreview.costeCompra?.precioCompra === 0) && (
                    <div className="mt-2 font-semibold">{MENSAJE_INSUFICIENTE_COSTE}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'financiacion' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Financiación (opcional)</h3>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!draft.financiacion?.usarFinanciacion}
                  onChange={(e) => setForm({ ...draft, financiacion: { ...draft.financiacion!, usarFinanciacion: e.target.checked } })}
                />
                Usar financiación
              </label>

              {draft.financiacion?.usarFinanciacion && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <label className="space-y-1">
                    <span className="text-xs">Importe financiado (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.financiacion?.importeFinanciado || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          financiacion: { ...draft.financiacion!, importeFinanciado: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Tipo interés anual % (dato introducido)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={draft.financiacion?.tipoInteresAnual || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          financiacion: { ...draft.financiacion!, tipoInteresAnual: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Plazo meses (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.financiacion?.plazoMeses || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          financiacion: { ...draft.financiacion!, plazoMeses: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs">Gastos financieros (dato introducido)</span>
                    <input
                      type="number"
                      value={draft.financiacion?.gastosFinancieros || ''}
                      onChange={(e) =>
                        setForm({
                          ...draft,
                          financiacion: { ...draft.financiacion!, gastosFinancieros: e.target.value ? Number(e.target.value) : undefined },
                        })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    />
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Cuota estimada (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.financiacion?.cuotaEstimada)}/mes</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Capital aportado (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.financiacion?.capitalAportado)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Coste financiero total (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.financiacion?.costeFinancieroTotal)}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'alquiler' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Alquiler estimado</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-semibold">Alquiler mensual (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.alquiler?.alquilerMensual || ''}
                    onChange={(e) =>
                      setForm({ ...draft, alquiler: { ...draft.alquiler!, alquilerMensual: e.target.value ? Number(e.target.value) : undefined } })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Ocupación prevista % (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.alquiler?.ocupacionPrevistaPct || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        alquiler: { ...draft.alquiler!, ocupacionPrevistaPct: e.target.value ? Number(e.target.value) : undefined },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Meses vacancia (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.alquiler?.mesesVacancia || ''}
                    onChange={(e) =>
                      setForm({ ...draft, alquiler: { ...draft.alquiler!, mesesVacancia: e.target.value ? Number(e.target.value) : undefined } })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Comunidad anual (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.alquiler?.gastosComunidad || ''}
                    onChange={(e) =>
                      setForm({ ...draft, alquiler: { ...draft.alquiler!, gastosComunidad: e.target.value ? Number(e.target.value) : undefined } })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">IBI anual (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.alquiler?.ibi || ''}
                    onChange={(e) =>
                      setForm({ ...draft, alquiler: { ...draft.alquiler!, ibi: e.target.value ? Number(e.target.value) : undefined } })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Seguro anual (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.alquiler?.seguro || ''}
                    onChange={(e) =>
                      setForm({ ...draft, alquiler: { ...draft.alquiler!, seguro: e.target.value ? Number(e.target.value) : undefined } })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Mantenimiento anual (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.alquiler?.mantenimiento || ''}
                    onChange={(e) =>
                      setForm({ ...draft, alquiler: { ...draft.alquiler!, mantenimiento: e.target.value ? Number(e.target.value) : undefined } })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Otros gastos anuales (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.alquiler?.otrosGastosAnuales || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        alquiler: { ...draft.alquiler!, otrosGastosAnuales: e.target.value ? Number(e.target.value) : undefined },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Ingresos brutos anuales (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.alquiler?.ingresosBrutosAnuales)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Gastos anuales (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.alquiler?.gastosAnualesTotales)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Ingresos netos (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.alquiler?.ingresosNetosAnuales)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Flujo caja mensual (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.alquiler?.flujoCajaMensual)}</div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
                Estimación ≠ dato real. Los gastos son introducidos; ingresos brutos/netos/rentabilidad son calculados. Si falta alquiler mensual, no se calcula.
              </div>
            </div>
          )}

          {activeTab === 'reforma' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Reforma — partidas</h3>
              <div className="space-y-2">
                {(draft.reforma?.partidas || []).map((p, idx) => (
                  <div key={p.id} className="border border-slate-200 rounded-xl p-3 grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
                    <select
                      value={p.categoria}
                      onChange={(e) => {
                        const arr = [...(draft.reforma?.partidas || [])];
                        arr[idx] = { ...p, categoria: e.target.value };
                        setForm({ ...draft, reforma: { ...draft.reforma!, partidas: arr } });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg bg-white"
                    >
                      {CATEGORIAS_REFORMA.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Descripción"
                      value={p.descripcion}
                      onChange={(e) => {
                        const arr = [...(draft.reforma?.partidas || [])];
                        arr[idx] = { ...p, descripcion: e.target.value };
                        setForm({ ...draft, reforma: { ...draft.reforma!, partidas: arr } });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg"
                    />
                    <input
                      type="number"
                      placeholder="Coste estimado"
                      value={p.costeEstimado || ''}
                      onChange={(e) => {
                        const arr = [...(draft.reforma?.partidas || [])];
                        arr[idx] = { ...p, costeEstimado: e.target.value ? Number(e.target.value) : 0 };
                        setForm({ ...draft, reforma: { ...draft.reforma!, partidas: arr } });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg"
                    />
                    <input
                      placeholder="Observaciones"
                      value={p.observaciones || ''}
                      onChange={(e) => {
                        const arr = [...(draft.reforma?.partidas || [])];
                        arr[idx] = { ...p, observaciones: e.target.value };
                        setForm({ ...draft, reforma: { ...draft.reforma!, partidas: arr } });
                      }}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg"
                    />
                    <button
                      onClick={() => {
                        const arr = (draft.reforma?.partidas || []).filter((_, i) => i !== idx);
                        setForm({ ...draft, reforma: { ...draft.reforma!, partidas: arr } });
                      }}
                      className="px-2 py-1.5 bg-rose-50 text-rose-600 rounded-lg"
                    >
                      Eliminar
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const nueva: PartidaReformaInversion = { id: genId('part'), categoria: 'OTROS', descripcion: '', costeEstimado: 0 };
                    setForm({ ...draft, reforma: { ...draft.reforma!, partidas: [...(draft.reforma?.partidas || []), nueva] } });
                  }}
                  className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold"
                >
                  + Añadir partida
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <label className="space-y-1">
                  <span>Contingencia % (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.reforma?.contingenciaPct || ''}
                    onChange={(e) =>
                      setForm({ ...draft, reforma: { ...draft.reforma!, contingenciaPct: e.target.value ? Number(e.target.value) : undefined } })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Coste total reforma (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.reforma?.costeTotalReforma)}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <div className="text-emerald-700">Coste con contingencia (calculado)</div>
                  <div className="font-bold text-emerald-900">{formatEur(recalcPreview.reforma?.costeConContingencia)}</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'valorDespues' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Valor después de reforma (estimaciones)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs">Valor antes (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.valorDespuesReforma?.valorAntes || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        valorDespuesReforma: {
                          ...draft.valorDespuesReforma!,
                          valorAntes: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Valor después (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.valorDespuesReforma?.valorDespues || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        valorDespuesReforma: {
                          ...draft.valorDespuesReforma!,
                          valorDespues: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Alquiler antes mensual (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.valorDespuesReforma?.alquilerAntes || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        valorDespuesReforma: {
                          ...draft.valorDespuesReforma!,
                          alquilerAntes: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs">Alquiler después mensual (dato introducido)</span>
                  <input
                    type="number"
                    value={draft.valorDespuesReforma?.alquilerDespues || ''}
                    onChange={(e) =>
                      setForm({
                        ...draft,
                        valorDespuesReforma: {
                          ...draft.valorDespuesReforma!,
                          alquilerDespues: e.target.value ? Number(e.target.value) : undefined,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Incremento valor (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.valorDespuesReforma?.incrementoValor)}</div>
                  <div className="text-[10px] text-slate-400">{formatPct(recalcPreview.valorDespuesReforma?.incrementoValorPct)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Incremento alquiler (calculado)</div>
                  <div className="font-bold">{formatEur(recalcPreview.valorDespuesReforma?.incrementoAlquiler)}</div>
                  <div className="text-[10px] text-slate-400">{formatPct(recalcPreview.valorDespuesReforma?.incrementoAlquilerPct)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Rentabilidad reforma (calculado)</div>
                  <div className="font-bold">{formatPct(recalcPreview.valorDespuesReforma?.rentabilidadReforma)}</div>
                  <div className="text-[10px] text-slate-400">Estimación</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-slate-500">Recuperación (calculado)</div>
                  <div className="font-bold">
                    {recalcPreview.valorDespuesReforma?.recuperacionMeses
                      ? `${recalcPreview.valorDespuesReforma.recuperacionMeses} meses`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-slate-400">Estimación</div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
                Resultados reforma como ESTIMACIONES/ESCENARIOS, no certezas.
              </div>
            </div>
          )}

          {activeTab === 'escenarios' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Comparación escenarios</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {recalcPreview.escenarios.map((esc) => (
                  <div key={esc.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
                    <div className="font-bold text-xs">{esc.nombre}</div>
                    <div className="text-[10px] px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md inline-block">ESTIMACIÓN</div>
                    <div className="text-xs space-y-1 pt-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Inversión total</span>
                        <span className="font-semibold">{formatEur(esc.inversionTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Alquiler mes</span>
                        <span className="font-semibold">{formatEur(esc.alquilerMensual)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Rent. neta</span>
                        <span className="font-semibold">{formatPct(esc.rentabilidadNeta)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Flujo anual</span>
                        <span className="font-semibold">{formatEur(esc.flujoCajaAnual)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {recalcPreview.escenariosNiveles && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs mt-4">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="font-semibold">Valoración</div>
                    <div>Conservadora: {formatEur(recalcPreview.escenariosNiveles.valoracion.conservadora)}</div>
                    <div>Central: {formatEur(recalcPreview.escenariosNiveles.valoracion.central)}</div>
                    <div>Favorable: {formatEur(recalcPreview.escenariosNiveles.valoracion.favorable)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="font-semibold">Alquiler</div>
                    <div>Conservador: {formatEur(recalcPreview.escenariosNiveles.alquiler.conservador)}</div>
                    <div>Central: {formatEur(recalcPreview.escenariosNiveles.alquiler.central)}</div>
                    <div>Favorable: {formatEur(recalcPreview.escenariosNiveles.alquiler.favorable)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <div className="font-semibold">Reforma</div>
                    <div>Previsto: {formatEur(recalcPreview.escenariosNiveles.reforma.previsto)}</div>
                    <div>Superior: {formatEur(recalcPreview.escenariosNiveles.reforma.superior)}</div>
                    <div>Máximo: {formatEur(recalcPreview.escenariosNiveles.reforma.maximo)}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'resumen' && (
            <div className="space-y-4">
              <h3 className="font-bold text-sm">Resumen visual y resultado</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] text-slate-500">COMPRA</div>
                  <div className="font-bold">{formatEur(recalcPreview.resumen?.compraPrecio)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] text-slate-500">GASTOS</div>
                  <div className="font-bold">{formatEur(recalcPreview.resumen?.gastosAdquisicion)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] text-slate-500">REFORMA</div>
                  <div className="font-bold">{formatEur(recalcPreview.resumen?.reformaCoste)}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <div className="text-[10px] text-emerald-700">INVERSIÓN TOTAL</div>
                  <div className="font-bold text-emerald-900">{formatEur(recalcPreview.resumen?.inversionTotal)}</div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <div className="text-[10px] text-blue-700">VALOR FINAL</div>
                  <div className="font-bold text-blue-900">{formatEur(recalcPreview.resumen?.valorFinalEstimado)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] text-slate-500">ALQUILER</div>
                  <div className="font-bold">{formatEur(recalcPreview.resumen?.alquilerMensual)}/mes</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] text-slate-500">RENT. BRUTA</div>
                  <div className="font-bold">{formatPct(recalcPreview.resumen?.rentabilidadBruta)}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="text-[10px] text-slate-500">RENT. NETA</div>
                  <div className="font-bold">{formatPct(recalcPreview.resumen?.rentabilidadNeta)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2">
                <div className="rounded-xl border p-3">
                  <div className="font-semibold">Flujo caja anual</div>
                  <div className="text-lg font-bold">{formatEur(recalcPreview.resumen?.flujoCajaAnual)}</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="font-semibold">Incremento valor</div>
                  <div className="text-lg font-bold">{formatEur(recalcPreview.resumen?.incrementoValor)}</div>
                  <div className="text-[10px] text-slate-400">Estimación</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="font-semibold">Recuperación</div>
                  <div className="text-lg font-bold">
                    {recalcPreview.resumen?.recuperacionMeses ? `${recalcPreview.resumen.recuperacionMeses} meses` : '—'}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-2">
                <button onClick={handleGuardar} className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold flex items-center gap-2">
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button
                  onClick={handleConvertir}
                  className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold flex items-center gap-2"
                >
                  <Building2 className="w-4 h-4" /> Convertir en inmueble cartera
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900">
                Confirmación requerida para conversión. Mantiene histórico del análisis. Reutiliza datos del análisis para crear inmueble.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
