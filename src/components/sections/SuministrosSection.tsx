/**
 * BLOQUE E — Gestión ERP de suministros.
 * Administrador: alta, edición, lecturas, cambios y reparto.
 * Propietario: consulta de sus inmuebles + registro de lecturas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Droplets,
  Flame,
  Plus,
  Trash2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  actualizarSuministro,
  crearSuministro,
  eliminarSuministro,
  registrarLectura,
  resolverCambioTitular,
  solicitarCambioTitular,
  subirFotoLectura,
  subscribeCambiosTitular,
  subscribeLecturas,
  subscribeSuministros,
} from '../../lib/suministrosFirestore';
import {
  calcularRepartoImporte,
  unidadSugerida,
  validarAltaSuministro,
  validarCambioTitular,
  validarLectura,
  validarReparto,
} from '../../inquilino/suministrosEngine';
import type {
  CambioTitularSuministro,
  Inmueble,
  LecturaSuministro,
  ModoRepartoSuministro,
  Suministro,
  TipoSuministro,
  TramoRepartoSuministro,
  UsuarioApp,
} from '../../types';

interface Props {
  currentUser: UsuarioApp;
  inmuebles: Inmueble[];
}

const TIPOS: TipoSuministro[] = ['LUZ', 'AGUA', 'GAS', 'INTERNET', 'OTRO'];
const NOMBRE_TIPO: Record<string, string> = { LUZ: 'Electricidad', AGUA: 'Agua', GAS: 'Gas', INTERNET: 'Internet', OTRO: 'Otro' };
const ICONO_TIPO: Record<string, React.ReactNode> = {
  LUZ: <Zap className="w-5 h-5" />, AGUA: <Droplets className="w-5 h-5" />, GAS: <Flame className="w-5 h-5" />,
  INTERNET: <Wifi className="w-5 h-5" />, OTRO: <Zap className="w-5 h-5" />,
};

function fmtFecha(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('es-ES');
}

export const SuministrosSection: React.FC<Props> = ({ currentUser, inmuebles }) => {
  const esAdmin = currentUser.tipoPerfil === 'ADMINISTRADOR';
  const [suministros, setSuministros] = useState<Suministro[]>([]);
  const [lecturas, setLecturas] = useState<LecturaSuministro[]>([]);
  const [cambios, setCambios] = useState<CambioTitularSuministro[]>([]);
  const [filtroInmueble, setFiltroInmueble] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [modalAlta, setModalAlta] = useState(false);
  const [editar, setEditar] = useState<Suministro | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    const u1 = subscribeSuministros(setSuministros);
    const u2 = subscribeLecturas(setLecturas);
    const u3 = subscribeCambiosTitular(setCambios);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const visibles = useMemo(() => {
    const ids = new Set(inmuebles.map((v) => v.id));
    return suministros.filter((s) => ids.has(s.inmuebleId) && (!filtroInmueble || s.inmuebleId === filtroInmueble));
  }, [suministros, inmuebles, filtroInmueble]);

  const nombreInmueble = (id: string) => {
    const v = inmuebles.find((x) => x.id === id);
    return v ? `${v.direccion} · ${v.ciudad}` : id;
  };

  const informar = (m: string) => {
    setAviso(m);
    setTimeout(() => setAviso(''), 4000);
  };

  const borrar = async (s: Suministro) => {
    const n = lecturas.filter((l) => l.suministroId === s.id).length;
    if (!window.confirm(`¿Eliminar el suministro ${NOMBRE_TIPO[s.tipo]} de ${nombreInmueble(s.inmuebleId)}? Tiene ${n} lecturas.`)) return;
    await eliminarSuministro(s.id, s.inmuebleId);
    informar('Suministro eliminado.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-600" /> Suministros
        </h2>
        {esAdmin && (
          <button
            onClick={() => setModalAlta(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Alta
          </button>
        )}
      </div>

      {aviso && (
        <p className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {aviso}
        </p>
      )}

      <select
        value={filtroInmueble}
        onChange={(e) => setFiltroInmueble(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
      >
        <option value="">Todos los inmuebles</option>
        {inmuebles.map((v) => (
          <option key={v.id} value={v.id}>{v.direccion} · {v.ciudad}</option>
        ))}
      </select>

      {visibles.length === 0 && (
        <p className="text-sm text-slate-500 py-6 text-center">Sin suministros para este filtro.</p>
      )}

      {visibles.map((s) => {
        const lecs = lecturas.filter((l) => l.suministroId === s.id).sort((a, b) => (a.fechaLectura < b.fechaLectura ? 1 : -1));
        const cams = cambios.filter((c) => c.suministroId === s.id);
        const pendientes = cams.filter((c) => c.estado === 'SOLICITADO').length;
        const abierto = expandido === s.id;
        return (
          <article key={s.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button onClick={() => setExpandido(abierto ? null : s.id)} className="w-full p-4 text-left cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  {ICONO_TIPO[s.tipo]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold">
                    {NOMBRE_TIPO[s.tipo]} · {nombreInmueble(s.inmuebleId)}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {s.cups || s.numeroContador || 'Sin identificador'} · {s.titularNombre || 'Sin titular'} ·{' '}
                    {lecs.length} lecturas{pendientes > 0 ? ` · ${pendientes} cambios pendientes` : ''}
                  </p>
                </div>
                {!s.activo && (
                  <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-slate-200 text-slate-600">Inactivo</span>
                )}
              </div>
            </button>
            {abierto && (
              <DetalleSuministro
                suministro={s}
                lecturas={lecs}
                cambios={cams}
                esAdmin={esAdmin}
                currentUser={currentUser}
                informar={informar}
                onEditar={() => setEditar(s)}
                onBorrar={() => borrar(s)}
              />
            )}
          </article>
        );
      })}

      {(modalAlta || editar) && (
        <SuministroModal
          currentUser={currentUser}
          inmuebles={inmuebles}
          inicial={editar || undefined}
          onCerrar={() => {
            setModalAlta(false);
            setEditar(null);
          }}
          onGuardado={(m) => {
            setModalAlta(false);
            setEditar(null);
            informar(m);
          }}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------- detalle
function DetalleSuministro({
  suministro: s, lecturas, cambios, esAdmin, currentUser, informar, onEditar, onBorrar,
}: {
  suministro: Suministro;
  lecturas: LecturaSuministro[];
  cambios: CambioTitularSuministro[];
  esAdmin: boolean;
  currentUser: UsuarioApp;
  informar: (m: string) => void;
  onEditar: () => void;
  onBorrar: () => void;
}) {
  const [pestana, setPestana] = useState<'ficha' | 'lecturas' | 'cambios' | 'reparto'>('ficha');
  const [modalLec, setModalLec] = useState(false);
  const [modalCambio, setModalCambio] = useState(false);
  const [importe, setImporte] = useState('');

  const confirmarCambio = async (c: CambioTitularSuministro) => {
    if (!window.confirm(`¿Confirmar el cambio de titular a ${c.titularNuevoNombre}? Se actualizará el suministro.`)) return;
    await resolverCambioTitular(c.id, 'CONFIRMADO', currentUser.authUid || currentUser.id);
    await actualizarSuministro(s.id, { titularNombre: c.titularNuevoNombre, titularNif: c.titularNuevoNif });
    informar('Cambio confirmado y titular actualizado.');
  };

  const rechazarCambio = async (c: CambioTitularSuministro) => {
    const motivo = window.prompt('Motivo del rechazo:') || '';
    if (!motivo.trim()) return;
    await resolverCambioTitular(c.id, 'RECHAZADO', currentUser.authUid || currentUser.id, motivo.trim());
    informar('Cambio rechazado.');
  };

  const repartoCalc = useMemo(() => {
    const n = Number(String(importe).replace(',', '.'));
    if (!s.reparto || !(n > 0)) return [];
    return calcularRepartoImporte(s.reparto, n);
  }, [importe, s.reparto]);

  return (
    <div className="px-4 pb-4 border-t border-slate-100 pt-3">
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {(
          [
            { id: 'ficha', etiqueta: 'Ficha' },
            { id: 'lecturas', etiqueta: `Lecturas (${lecturas.length})` },
            { id: 'cambios', etiqueta: `Titular (${cambios.filter((c) => c.estado === 'SOLICITADO').length} pdtes.)` },
            { id: 'reparto', etiqueta: 'Reparto' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setPestana(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
              pestana === t.id ? 'bg-indigo-100 text-indigo-800' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'ficha' && (
        <div className="text-xs space-y-1.5">
          <Fila e="Tipo" v={`${NOMBRE_TIPO[s.tipo]} (${s.tipo})`} />
          {s.cups && <Fila e="CUPS" v={<span className="font-mono">{s.cups}</span>} />}
          {s.numeroContador && <Fila e="Contador" v={s.numeroContador} />}
          <Fila e="Titular" v={`${s.titularNombre || '—'}${s.titularNif ? ` (${s.titularNif})` : ''}`} />
          <Fila e="Comercializadora" v={s.comercializadora || '—'} />
          <Fila e="Tarifa" v={s.tarifa || '—'} />
          {s.potenciaContratadaKw !== undefined && <Fila e="Potencia" v={`${s.potenciaContratadaKw} kW`} />}
          <Fila e="Reparto" v={`${s.modoReparto}${s.reparto?.length ? ` (${s.reparto.length} tramos)` : ''}`} />
          <Fila e="Alta" v={fmtFecha(s.fechaAlta)} />
          {esAdmin && (
            <div className="flex gap-2 pt-2">
              <button onClick={onEditar} className="flex-1 py-2 bg-slate-100 text-xs font-bold rounded-xl cursor-pointer">
                Editar
              </button>
              <button onClick={onBorrar} className="flex items-center justify-center gap-1 px-3 py-2 bg-red-50 text-red-700 text-xs font-bold rounded-xl cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {pestana === 'lecturas' && (
        <div>
          <button
            onClick={() => setModalLec(true)}
            className="mb-2 w-full py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            Registrar lectura
          </button>
          {lecturas.length === 0 && <p className="text-xs text-slate-500">Sin lecturas.</p>}
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {lecturas.map((l) => (
              <div key={l.id} className="text-xs bg-slate-50 rounded-xl px-2.5 py-2">
                <span className="font-black">{l.valor} {l.unidad}</span>{' '}
                <span className="text-slate-500">{fmtFecha(l.fechaLectura)} · {l.origen}</span>
                <span className="block text-slate-500">
                  {l.registradoPorNombre || l.registradoPorEmail || ''}
                  {l.corrigeLecturaId ? ' · Corrige anterior' : ''}
                </span>
                {l.observaciones && <span className="block text-slate-600">{l.observaciones}</span>}
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">Las lecturas son inmutables: sin edición ni borrado.</p>
        </div>
      )}

      {pestana === 'cambios' && (
        <div className="space-y-2">
          <button
            onClick={() => setModalCambio(true)}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-xl cursor-pointer"
          >
            Solicitar cambio de titular
          </button>
          {cambios.length === 0 && <p className="text-xs text-slate-500">Sin solicitudes.</p>}
          {cambios.map((c) => (
            <div key={c.id} className="text-xs bg-slate-50 rounded-xl px-2.5 py-2">
              <span className="font-bold">{c.titularAnteriorNombre || '—'} → {c.titularNuevoNombre}</span>{' '}
              <EstadoCambio estado={c.estado} />
              <span className="block text-slate-500">
                Efecto: {fmtFecha(c.fechaEfecto)} · Solicitado: {fmtFecha(c.createdAt)}
                {c.solicitadoPorEmail ? ` por ${c.solicitadoPorEmail}` : ''}
              </span>
              {c.estado === 'RECHAZADO' && c.motivoRechazo && (
                <span className="block text-red-700">Motivo: {c.motivoRechazo}</span>
              )}
              {esAdmin && c.estado === 'SOLICITADO' && (
                <span className="flex gap-2 mt-1.5">
                  <button onClick={() => confirmarCambio(c)} className="flex-1 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded-lg cursor-pointer">
                    Confirmar
                  </button>
                  <button onClick={() => rechazarCambio(c)} className="flex-1 py-1.5 bg-red-100 text-red-700 text-[11px] font-bold rounded-lg cursor-pointer">
                    Rechazar
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {pestana === 'reparto' && (
        <div>
          {(!s.reparto || s.reparto.length === 0) && <p className="text-xs text-slate-500">Sin reparto configurado ({s.modoReparto}).</p>}
          {s.reparto && s.reparto.length > 0 && (
            <>
              <label className="block text-xs font-bold text-slate-600 mb-1">Importe de factura (€)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                placeholder="Ej. 85.40"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mb-2"
              />
              {(repartoCalc.length > 0 ? repartoCalc : s.reparto.map((t) => ({ ...t, importe: 0 }))).map((t, i) => (
                <div key={i} className="flex justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5 mb-1 font-medium">
                  <span>{t.etiqueta}</span>
                  <span>
                    {t.porcentaje}%{repartoCalc.length > 0 ? ` · ${(t as { importe: number }).importe.toFixed(2)} €` : ''}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {modalLec && (
        <LecturaGestorModal
          currentUser={currentUser}
          suministro={s}
          ultima={lecturas[0]}
          onCerrar={() => setModalLec(false)}
          onCreada={() => {
            setModalLec(false);
            informar('Lectura registrada.');
          }}
        />
      )}
      {modalCambio && (
        <CambioGestorModal
          currentUser={currentUser}
          suministro={s}
          onCerrar={() => setModalCambio(false)}
          onCreada={() => {
            setModalCambio(false);
            informar('Cambio solicitado.');
          }}
        />
      )}
    </div>
  );
}

function Fila({ e, v }: { e: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500 font-medium">{e}</span>
      <span className="font-bold text-right">{v}</span>
    </div>
  );
}

function EstadoCambio({ estado }: { estado: string }) {
  const clase =
    estado === 'CONFIRMADO' ? 'bg-emerald-100 text-emerald-800' : estado === 'RECHAZADO' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${clase}`}>{estado}</span>;
}

// ------------------------------------------------------- alta / edición
function SuministroModal({
  currentUser, inmuebles, inicial, onCerrar, onGuardado,
}: {
  currentUser: UsuarioApp;
  inmuebles: Inmueble[];
  inicial?: Suministro;
  onCerrar: () => void;
  onGuardado: (m: string) => void;
}) {
  const [inmuebleId, setInmuebleId] = useState(inicial?.inmuebleId || inmuebles[0]?.id || '');
  const [tipo, setTipo] = useState<TipoSuministro>(inicial?.tipo || 'LUZ');
  const [cups, setCups] = useState(inicial?.cups || '');
  const [contador, setContador] = useState(inicial?.numeroContador || '');
  const [titular, setTitular] = useState(inicial?.titularNombre || '');
  const [nif, setNif] = useState(inicial?.titularNif || '');
  const [comer, setComer] = useState(inicial?.comercializadora || '');
  const [tarifa, setTarifa] = useState(inicial?.tarifa || '');
  const [potencia, setPotencia] = useState(inicial?.potenciaContratadaKw?.toString() || '');
  const [modo, setModo] = useState<ModoRepartoSuministro>(inicial?.modoReparto || 'SIN_REPARTO');
  const [tramos, setTramos] = useState<TramoRepartoSuministro[]>(inicial?.reparto || []);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [nuevoPct, setNuevoPct] = useState('');
  const [activo, setActivo] = useState(inicial?.activo ?? true);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const anadirTramo = () => {
    const pct = Number(String(nuevoPct).replace(',', '.'));
    if (!nuevaEtiqueta.trim() || !(pct > 0)) {
      setError('Indica etiqueta y porcentaje mayor que cero para el tramo.');
      return;
    }
    setTramos([...tramos, { etiqueta: nuevaEtiqueta.trim(), porcentaje: pct }]);
    setNuevaEtiqueta('');
    setNuevoPct('');
    setError('');
  };

  const guardar = async () => {
    const v = validarAltaSuministro({
      inmuebleId,
      tipo,
      cups: cups.trim() || undefined,
      numeroContador: contador.trim() || undefined,
      potenciaContratadaKw: potencia ? Number(potencia) : undefined,
    });
    if (!v.ok) {
      setError(v.errores[0]);
      return;
    }
    if ((modo === 'POR_HABITACION' || modo === 'PERSONALIZADO' || modo === 'IGUALITARIO') && tramos.length > 0) {
      const r = validarReparto(tramos);
      if (!r.ok) {
        setError(r.errores[0]);
        return;
      }
    }
    setGuardando(true);
    setError('');
    try {
      if (inicial) {
        await actualizarSuministro(inicial.id, {
          tipo, cups: cups.trim() || undefined, numeroContador: contador.trim() || undefined,
          titularNombre: titular.trim() || undefined, titularNif: nif.trim() || undefined,
          comercializadora: comer.trim() || undefined, tarifa: tarifa.trim() || undefined,
          potenciaContratadaKw: potencia ? Number(potencia) : undefined,
          modoReparto: modo, reparto: tramos.length > 0 ? tramos : undefined, activo,
        });
        onGuardado('Suministro actualizado.');
      } else {
        await crearSuministro({
          inmuebleId, tipo,
          cups: cups.trim() || undefined, numeroContador: contador.trim() || undefined,
          titularNombre: titular.trim() || undefined, titularNif: nif.trim() || undefined,
          comercializadora: comer.trim() || undefined, tarifa: tarifa.trim() || undefined,
          potenciaContratadaKw: potencia ? Number(potencia) : undefined,
          modoReparto: modo, reparto: tramos.length > 0 ? tramos : undefined,
          createdByUid: currentUser.authUid || currentUser.id, createdByEmail: currentUser.email,
        });
        onGuardado('Suministro dado de alta.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se ha podido guardar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onCerrar}>
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold">{inicial ? 'Editar suministro' : 'Alta de suministro'}</h2>
          <button onClick={onCerrar} className="p-1.5 rounded-full hover:bg-slate-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</p>}

        <div className="grid grid-cols-2 gap-2 mb-2">
          <div className="col-span-2">
            <label className="block text-xs font-bold text-slate-600 mb-1">Inmueble *</label>
            <select value={inmuebleId} onChange={(e) => setInmuebleId(e.target.value)} disabled={!!inicial} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl bg-white disabled:opacity-60">
              {inmuebles.map((v) => (
                <option key={v.id} value={v.id}>{v.direccion} · {v.ciudad}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Tipo *</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoSuministro)} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl bg-white">
              {TIPOS.map((t) => (
                <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Potencia (kW)</label>
            <input value={potencia} onChange={(e) => setPotencia(e.target.value)} type="number" min="0" step="any" placeholder="4.6" className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">CUPS {(tipo === 'LUZ' || tipo === 'GAS') ? '*' : ''}</label>
            <input value={cups} onChange={(e) => setCups(e.target.value.toUpperCase())} placeholder="ES…" className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl font-mono" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Contador</label>
            <input value={contador} onChange={(e) => setContador(e.target.value)} placeholder="Nº contador" className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Titular</label>
            <input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Nombre" className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">NIF titular</label>
            <input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="12345678Z" className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Comercializadora</label>
            <input value={comer} onChange={(e) => setComer(e.target.value)} placeholder="Ej. Iberdrola" className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Tarifa</label>
            <input value={tarifa} onChange={(e) => setTarifa(e.target.value)} placeholder="Ej. 2.0TD" className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
        </div>

        <label className="block text-xs font-bold text-slate-600 mb-1">Modo de reparto</label>
        <select value={modo} onChange={(e) => setModo(e.target.value as ModoRepartoSuministro)} className="w-full px-2 py-2 text-sm border border-slate-200 rounded-xl bg-white mb-2">
          <option value="SIN_REPARTO">Sin reparto</option>
          <option value="IGUALITARIO">Igualitario</option>
          <option value="POR_HABITACION">Por habitación</option>
          <option value="PERSONALIZADO">Personalizado</option>
        </select>

        {modo !== 'SIN_REPARTO' && (
          <div className="mb-2">
            {tramos.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-1.5 mb-1">
                <span className="flex-1 font-bold">{t.etiqueta}</span>
                <span>{t.porcentaje}%</span>
                <button onClick={() => setTramos(tramos.filter((_, j) => j !== i))} className="cursor-pointer" aria-label="Quitar tramo">
                  <X className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            ))}
            <div className="flex gap-1.5">
              <input value={nuevaEtiqueta} onChange={(e) => setNuevaEtiqueta(e.target.value)} placeholder="Etiqueta (HAB-1…)" className="flex-1 px-2 py-2 text-xs border border-slate-200 rounded-xl" />
              <input value={nuevoPct} onChange={(e) => setNuevoPct(e.target.value)} type="number" min="0" max="100" step="any" placeholder="%" className="w-20 px-2 py-2 text-xs border border-slate-200 rounded-xl" />
              <button onClick={anadirTramo} className="px-3 bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer">+</button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">La suma debe ser 100%.</p>
          </div>
        )}

        {inicial && (
          <label className="flex items-center gap-2 mb-2 text-xs font-medium cursor-pointer">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} /> Suministro activo
          </label>
        )}

        <button onClick={guardar} disabled={guardando} className="w-full py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50">
          {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Dar de alta'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------- lectura de gestión
function LecturaGestorModal({
  currentUser, suministro, ultima, onCerrar, onCreada,
}: {
  currentUser: UsuarioApp;
  suministro: Suministro;
  ultima?: LecturaSuministro;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [foto, setFoto] = useState<File | null>(null);
  const [obs, setObs] = useState('');
  const [contratoId, setContratoId] = useState((suministro.contratoIdsAutorizados || [])[0] || '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const unidad = unidadSugerida(suministro.tipo) || 'unidades';
  const esAdmin = currentUser.tipoPerfil === 'ADMINISTRADOR';

  const guardar = async () => {
    const num = Number(String(valor).replace(',', '.'));
    const v = validarLectura({ valor: num, unidad, fechaLectura: new Date(`${fecha}T12:00:00`).toISOString(), ultimoValor: ultima?.valor });
    if (!v.ok) {
      setError(v.errores[0]);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const lecturaId = `lec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      let fotoStoragePath: string | undefined;
      if (foto) {
        const sub = await subirFotoLectura(suministro.id, lecturaId, foto, foto.name);
        fotoStoragePath = sub.storagePath;
      }
      await registrarLectura({
        id: lecturaId,
        suministroId: suministro.id,
        inmuebleId: suministro.inmuebleId,
        contratoId: contratoId || undefined,
        valor: num,
        unidad,
        fechaLectura: new Date(`${fecha}T12:00:00`).toISOString(),
        origen: esAdmin ? 'ADMIN' : 'PROPIETARIO',
        registradoPorUid: currentUser.authUid || currentUser.id,
        registradoPorEmail: currentUser.email,
        registradoPorNombre: currentUser.nombre,
        fotoStoragePath,
        observaciones: obs.trim() || undefined,
      });
      onCreada();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se ha podido registrar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold">Registrar lectura</h2>
          <button onClick={onCerrar} className="p-1.5 rounded-full hover:bg-slate-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</p>}
        {ultima && (
          <p className="mb-3 text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5">
            Última: <strong>{ultima.valor} {ultima.unidad}</strong> ({fmtFecha(ultima.fechaLectura)})
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Valor ({unidad}) *</label>
            <input type="number" min="0" step="any" value={valor} onChange={(e) => setValor(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Fecha *</label>
            <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
        </div>
        {(suministro.contratoIdsAutorizados || []).length > 0 && (
          <>
            <label className="block text-xs font-bold text-slate-600 mb-1">Contrato asociado (visible para su inquilino)</label>
            <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white mb-2">
              <option value="">Sin asociar</option>
              {(suministro.contratoIdsAutorizados || []).map((cid) => (
                <option key={cid} value={cid}>{cid}</option>
              ))}
            </select>
          </>
        )}
        <label className="flex items-center justify-center gap-2 w-full py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-xs font-bold text-slate-600 cursor-pointer mb-2">
          <Camera className="w-4 h-4" /> {foto ? foto.name.slice(0, 30) : 'Foto del contador (opcional)'}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFoto(e.target.files?.[0] || null)} />
        </label>
        <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observaciones (opcional)" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mb-3" />
        <button onClick={guardar} disabled={guardando} className="w-full py-2.5 bg-indigo-700 text-white text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50">
          {guardando ? 'Registrando…' : 'Registrar (inmutable)'}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------- cambio de gestión
function CambioGestorModal({
  currentUser, suministro, onCerrar, onCreada,
}: {
  currentUser: UsuarioApp;
  suministro: Suministro;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [nombre, setNombre] = useState('');
  const [nif, setNif] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const v = validarCambioTitular({ titularNuevoNombre: nombre, titularNuevoNif: nif, fechaEfecto: fecha });
    if (!v.ok) {
      setError(v.errores[0]);
      return;
    }
    setGuardando(true);
    try {
      await solicitarCambioTitular({
        suministroId: suministro.id,
        inmuebleId: suministro.inmuebleId,
        contratoId: (suministro.contratoIdsAutorizados || [])[0] || '',
        titularAnteriorNombre: suministro.titularNombre,
        titularNuevoNombre: nombre,
        titularNuevoNif: nif,
        fechaEfecto: new Date(`${fecha}T12:00:00`).toISOString(),
        solicitadoPorUid: currentUser.authUid || currentUser.id,
        solicitadoPorEmail: currentUser.email,
      });
      onCreada();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se ha podido solicitar.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold">Solicitar cambio de titular</h2>
          <button onClick={onCerrar} className="p-1.5 rounded-full hover:bg-slate-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</p>}
        <label className="block text-xs font-bold text-slate-600 mb-1">Nuevo titular *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl mb-2" />
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">NIF/NIE</label>
            <input value={nif} onChange={(e) => setNif(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Efecto *</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
          </div>
        </div>
        <button onClick={guardar} disabled={guardando} className="w-full py-2.5 bg-indigo-700 text-white text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50">
          {guardando ? 'Enviando…' : 'Solicitar'}
        </button>
      </div>
    </div>
  );
}
