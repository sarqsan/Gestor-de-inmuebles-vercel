/** BLOQUE E — Suministros: lecturas inmutables, fotos de contador y cambio de titular. */
import React, { useMemo, useState } from 'react';
import { Camera, ChevronDown, Droplets, Flame, Plus, Wifi, X, Zap } from 'lucide-react';
import {
  auditarAccionPortal,
  registrarLectura,
  solicitarCambioTitular,
  subirFotoLectura,
} from '../../lib/suministrosFirestore';
import {
  unidadSugerida,
  validarCambioTitular,
  validarLectura,
} from '../../inquilino/suministrosEngine';
import type {
  CambioTitularSuministro,
  ContratoFormalizacion,
  LecturaSuministro,
  Suministro,
  TipoSuministro,
  UsuarioApp,
} from '../../types';
import { MiniaturaEvidencia } from './MiniaturaEvidencia';

interface Props {
  usuario: UsuarioApp;
  contrato: ContratoFormalizacion;
  suministros: Suministro[];
  lecturas: LecturaSuministro[];
  cambios: CambioTitularSuministro[];
  onCambio: () => void;
}

const ICONO_TIPO: Record<string, React.ReactNode> = {
  LUZ: <Zap className="w-5 h-5" />,
  AGUA: <Droplets className="w-5 h-5" />,
  GAS: <Flame className="w-5 h-5" />,
  INTERNET: <Wifi className="w-5 h-5" />,
  OTRO: <Zap className="w-5 h-5" />,
};

const NOMBRE_TIPO: Record<string, string> = {
  LUZ: 'Electricidad', AGUA: 'Agua', GAS: 'Gas', INTERNET: 'Internet', OTRO: 'Otro suministro',
};

function fmtFecha(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString('es-ES');
}

export const PortalSuministros: React.FC<Props> = ({ usuario, contrato, suministros, lecturas, cambios, onCambio }) => {
  const [expandido, setExpandido] = useState<string | null>(null);
  const [modalLectura, setModalLectura] = useState<Suministro | null>(null);
  const [modalCambio, setModalCambio] = useState<Suministro | null>(null);

  const lecturasPorSum = useMemo(() => {
    const mapa = new Map<string, LecturaSuministro[]>();
    for (const l of lecturas) {
      const arr = mapa.get(l.suministroId) || [];
      arr.push(l);
      mapa.set(l.suministroId, arr);
    }
    for (const arr of mapa.values()) arr.sort((a, b) => (a.fechaLectura < b.fechaLectura ? 1 : -1));
    return mapa;
  }, [lecturas]);

  const cambiosPorSum = useMemo(() => {
    const mapa = new Map<string, CambioTitularSuministro[]>();
    for (const c of cambios) {
      const arr = mapa.get(c.suministroId) || [];
      arr.push(c);
      mapa.set(c.suministroId, arr);
    }
    return mapa;
  }, [cambios]);

  const miHabitacion = usuario.habitacionIdentificador || contrato.habitacionIdentificador;

  if (suministros.length === 0) {
    return <p className="text-center text-sm text-slate-500 py-10">No hay suministros registrados en tu vivienda.</p>;
  }

  return (
    <div className="space-y-3">
      {suministros.map((s) => {
        const lecs = lecturasPorSum.get(s.id) || [];
        const cams = cambiosPorSum.get(s.id) || [];
        const ultima = lecs[0];
        const abierto = expandido === s.id;
        return (
          <article key={s.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <button onClick={() => setExpandido(abierto ? null : s.id)} className="w-full p-4 text-left cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  {ICONO_TIPO[s.tipo] || ICONO_TIPO.OTRO}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-extrabold">{NOMBRE_TIPO[s.tipo] || s.tipo}</h3>
                  <p className="text-[11px] text-slate-500 truncate">
                    {s.comercializadora || 'Sin comercializadora'}
                    {s.tarifa ? ` · ${s.tarifa}` : ''}
                  </p>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
              </div>
              <div className="mt-2 flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Última lectura</span>
                <span className="text-sm font-black text-indigo-800">
                  {ultima ? `${ultima.valor} ${ultima.unidad} · ${fmtFecha(ultima.fechaLectura)}` : 'Sin lecturas'}
                </span>
              </div>
            </button>

            {abierto && (
              <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                <div className="text-xs space-y-1">
                  {s.cups && <Fila e="CUPS" v={<span className="font-mono text-[11px]">{s.cups}</span>} />}
                  {s.numeroContador && <Fila e="Contador" v={s.numeroContador} />}
                  {s.titularNombre && <Fila e="Titular" v={s.titularNombre} />}
                  {s.potenciaContratadaKw !== undefined && <Fila e="Potencia" v={`${s.potenciaContratadaKw} kW`} />}
                </div>

                {s.reparto && s.reparto.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Reparto</p>
                    <div className="space-y-1">
                      {s.reparto.map((t, i) => {
                        const esMio = miHabitacion && t.habitacionIdentificador === miHabitacion;
                        return (
                          <div
                            key={i}
                            className={`flex justify-between text-xs px-2.5 py-1.5 rounded-lg font-medium ${
                              esMio ? 'bg-indigo-100 text-indigo-900 font-bold' : 'bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span>{t.etiqueta}{esMio ? ' (tu parte)' : ''}</span>
                            <span>{t.porcentaje}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {lecs.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                      Historial de lecturas ({lecs.length})
                    </p>
                    <ol className="space-y-1.5 max-h-56 overflow-y-auto">
                      {lecs.map((l) => (
                        <li key={l.id} className="flex items-center gap-2 text-xs bg-slate-50 rounded-xl px-2.5 py-2">
                          <div className="flex-1">
                            <span className="font-black">{l.valor} {l.unidad}</span>{' '}
                            <span className="text-slate-500">{fmtFecha(l.fechaLectura)}</span>
                            {l.corrigeLecturaId && <span className="block text-[10px] text-amber-700">Corrige una lectura anterior</span>}
                            {l.observaciones && <span className="block text-slate-600">{l.observaciones}</span>}
                          </div>
                          {l.fotoStoragePath && (
                            <span className="w-10 shrink-0">
                              <MiniaturaEvidencia nombre="foto-contador.jpg" storagePath={l.fotoStoragePath} />
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-1 text-[10px] text-slate-400">Las lecturas no se pueden modificar ni borrar.</p>
                  </div>
                )}

                {cams.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Cambios de titular</p>
                    {cams.map((c) => (
                      <div key={c.id} className="text-xs bg-slate-50 rounded-xl px-2.5 py-2 mb-1.5">
                        <span className="font-bold">{c.titularNuevoNombre}</span>{' '}
                        <EstadoCambio estado={c.estado} />
                        <span className="block text-slate-500">Efecto: {fmtFecha(c.fechaEfecto)}</span>
                        {c.estado === 'RECHAZADO' && c.motivoRechazo && (
                          <span className="block text-red-700">Motivo: {c.motivoRechazo}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setModalLectura(s)}
                    className="flex items-center justify-center gap-1 py-2.5 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Dar lectura
                  </button>
                  <button
                    onClick={() => setModalCambio(s)}
                    className="py-2.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Cambio de titular
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}

      {modalLectura && (
        <NuevaLecturaModal
          usuario={usuario}
          contrato={contrato}
          suministro={modalLectura}
          ultima={lecturasPorSum.get(modalLectura.id)?.[0]}
          onCerrar={() => setModalLectura(null)}
          onCreada={() => {
            setModalLectura(null);
            onCambio();
          }}
        />
      )}
      {modalCambio && (
        <CambioTitularModal
          usuario={usuario}
          contrato={contrato}
          suministro={modalCambio}
          onCerrar={() => setModalCambio(null)}
          onCreada={() => {
            setModalCambio(null);
            onCambio();
          }}
        />
      )}
    </div>
  );
};

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
    estado === 'CONFIRMADO'
      ? 'bg-emerald-100 text-emerald-800'
      : estado === 'RECHAZADO'
      ? 'bg-red-100 text-red-800'
      : 'bg-amber-100 text-amber-800';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${clase}`}>{estado}</span>;
}

// ---------------------------------------------------------------------------

function NuevaLecturaModal({
  usuario, contrato, suministro, ultima, onCerrar, onCreada,
}: {
  usuario: UsuarioApp;
  contrato: ContratoFormalizacion;
  suministro: Suministro;
  ultima?: LecturaSuministro;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [foto, setFoto] = useState<File | null>(null);
  const [observaciones, setObservaciones] = useState('');
  const [esCorreccion, setEsCorreccion] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const unidad = unidadSugerida(suministro.tipo) || 'unidades';

  const guardar = async () => {
    const num = Number(String(valor).replace(',', '.'));
    const v = validarLectura({
      valor: num,
      unidad,
      fechaLectura: new Date(`${fecha}T12:00:00`).toISOString(),
      ultimoValor: !esCorreccion ? ultima?.valor : undefined,
    });
    if (!v.ok) {
      setError(v.errores[0]);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const nombre = `${usuario.nombre} ${usuario.apellidos || ''}`.trim();
      // ID prefijado: la foto se sube ANTES de crear la lectura (inmutable).
      const lecturaId = `lec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      let fotoStoragePath: string | undefined;
      if (foto) {
        try {
          const sub = await subirFotoLectura(suministro.id, lecturaId, foto, foto.name);
          fotoStoragePath = sub.storagePath;
        } catch {
          throw new Error('No se ha podido subir la foto del contador. Inténtalo sin foto o más tarde.');
        }
      }
      await registrarLectura({
        id: lecturaId,
        suministroId: suministro.id,
        inmuebleId: suministro.inmuebleId,
        contratoId: contrato.id,
        valor: num,
        unidad,
        fechaLectura: new Date(`${fecha}T12:00:00`).toISOString(),
        origen: 'INQUILINO',
        registradoPorUid: usuario.authUid || usuario.id,
        registradoPorEmail: usuario.email,
        registradoPorNombre: nombre,
        fotoStoragePath,
        corrigeLecturaId: esCorreccion && ultima ? ultima.id : undefined,
        observaciones: observaciones.trim() || undefined,
      });
      await auditarAccionPortal({
        usuarioId: usuario.id,
        usuarioEmail: usuario.email,
        usuarioNombre: nombre,
        accion: 'INQUILINO_LECTURA_REGISTRADA',
        descripcion: `Lectura ${suministro.tipo}: ${num} ${unidad} (${contrato.inmuebleDireccion}).`,
        entidadAfectada: 'suministro',
        idAfectado: suministro.id,
      });
      onCreada();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se ha podido registrar la lectura.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold">Nueva lectura · {NOMBRE_TIPO[suministro.tipo]}</h2>
          <button onClick={onCerrar} className="p-1.5 rounded-full hover:bg-slate-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</p>}
        {ultima && (
          <p className="mb-3 text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5">
            Última lectura: <strong>{ultima.valor} {ultima.unidad}</strong> ({fmtFecha(ultima.fechaLectura)})
          </p>
        )}

        <label className="block text-xs font-bold text-slate-600 mb-1">Valor del contador ({unidad}) *</label>
        <input
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Ej. 1234.5"
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl mb-3"
        />

        <label className="block text-xs font-bold text-slate-600 mb-1">Fecha de la lectura *</label>
        <input
          type="date"
          value={fecha}
          max={hoy}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl mb-3"
        />

        <label className="block text-xs font-bold text-slate-600 mb-1">Foto del contador (recomendada)</label>
        <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-600 cursor-pointer mb-1">
          <Camera className="w-4 h-4" /> {foto ? foto.name.slice(0, 28) : 'Añadir foto'}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFoto(e.target.files?.[0] || null)} />
        </label>
        <p className="text-[11px] text-slate-400 mb-3">Máx. 10 MB. Se guarda de forma privada, nunca en la base de datos.</p>

        <label className="block text-xs font-bold text-slate-600 mb-1">Observaciones</label>
        <input
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          placeholder="Opcional"
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl mb-3"
        />

        {ultima && (
          <label className="flex items-center gap-2 mb-3 text-xs font-medium text-slate-700 cursor-pointer">
            <input type="checkbox" checked={esCorreccion} onChange={(e) => setEsCorreccion(e.target.checked)} />
            Esta lectura corrige la anterior ({ultima.valor} {ultima.unidad})
          </label>
        )}

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full py-3 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50"
        >
          {guardando ? 'Registrando…' : 'Registrar lectura'}
        </button>
        <p className="mt-2 text-[11px] text-slate-400 text-center">Las lecturas no se pueden modificar ni borrar.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CambioTitularModal({
  usuario, contrato, suministro, onCerrar, onCreada,
}: {
  usuario: UsuarioApp;
  contrato: ContratoFormalizacion;
  suministro: Suministro;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [nombre, setNombre] = useState('');
  const [nif, setNif] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
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
    setError('');
    try {
      const solicitante = `${usuario.nombre} ${usuario.apellidos || ''}`.trim();
      const cambio = await solicitarCambioTitular({
        suministroId: suministro.id,
        inmuebleId: suministro.inmuebleId,
        contratoId: contrato.id,
        titularAnteriorNombre: suministro.titularNombre,
        titularNuevoNombre: nombre,
        titularNuevoNif: nif,
        titularNuevoTelefono: telefono,
        titularNuevoEmail: email,
        fechaEfecto: new Date(`${fecha}T12:00:00`).toISOString(),
        solicitadoPorUid: usuario.authUid || usuario.id,
        solicitadoPorEmail: usuario.email,
      });
      await auditarAccionPortal({
        usuarioId: usuario.id,
        usuarioEmail: usuario.email,
        usuarioNombre: solicitante,
        accion: 'INQUILINO_CAMBIO_TITULAR_SOLICITADO',
        descripcion: `Cambio de titular solicitado (${suministro.tipo}): ${cambio.titularNuevoNombre}.`,
        entidadAfectada: 'suministro',
        idAfectado: suministro.id,
      });
      onCreada();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se ha podido solicitar el cambio.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold">Cambio de titular · {NOMBRE_TIPO[suministro.tipo]}</h2>
          <button onClick={onCerrar} className="p-1.5 rounded-full hover:bg-slate-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        {error && <p className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</p>}
        <p className="mb-3 text-xs text-slate-600 bg-slate-50 rounded-xl p-2.5">
          Titular actual: <strong>{suministro.titularNombre || 'No indicado'}</strong>. Gestión revisará tu solicitud.
        </p>

        <label className="block text-xs font-bold text-slate-600 mb-1">Nuevo titular (nombre completo) *</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl mb-3" />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">NIF/NIE</label>
            <input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="12345678Z" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+34…" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl" />
          </div>
        </div>

        <label className="block text-xs font-bold text-slate-600 mb-1">Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl mb-3" />

        <label className="block text-xs font-bold text-slate-600 mb-1">Fecha de efecto *</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl mb-3" />

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full py-3 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50"
        >
          {guardando ? 'Enviando…' : 'Solicitar cambio'}
        </button>
      </div>
    </div>
  );
}

export type { TipoSuministro };
