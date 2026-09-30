import React, { useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, Clock, Plus, ShieldAlert, X } from 'lucide-react';
import type { Inmueble, Propietario, Titularidad, UsuarioApp } from '../types';
import {
  numeroTitulares,
  titularidadesHistoricas,
  titularidadesVigentes,
  validarPorcentajes,
} from '../utils/titularidadesEngine';
import { formatearPorcentaje } from '../utils/titularidadesPresentacion';

interface TitularidadesPanelProps {
  inmueble: Inmueble;
  /** Todas las titularidades disponibles para el usuario actual. */
  titularidades: Titularidad[];
  propietarios: Propietario[];
  currentUser: UsuarioApp;
  /** Alta de un nuevo titular (N titulares: 2º, 3º, 4º… sin límite). */
  onAnadirTitular?: (inmuebleId: string, propietarioId: string, porcentaje?: number | null) => Promise<void>;
  /** Cierre (NUNCA borrado) de una titularidad vigente. */
  onCerrarTitularidad?: (titularidadId: string, motivo: string) => Promise<void>;
  /** ¿Puede gestionar titularidad? (el titular principal / administración). */
  puedeGestionar?: boolean;
}

/**
 * PANEL DE TITULARIDAD (BLOQUE 2 · 2.5 / 2.6 · BLOQUE 3 · 3.1)
 * =============================================================
 * Muestra los N titulares del inmueble, su porcentaje (o la PENDENCIA cuando no
 * se conoce) y permite añadir o cerrar titulares.
 *
 * Reglas que respeta:
 *   · NUNCA muestra un reparto inventado: si no hay porcentaje, muestra
 *     "Pendiente" (2.3).
 *   · Separar FICHA PATRIMONIAL de CUENTA DE ACCESO: añadir un titular crea la
 *     relación de titularidad; NO crea un usuario ni una contraseña (2.6).
 *   · Cerrar NO borra: la relación pasa al histórico y sigue consultable (2.2).
 */
export const TitularidadesPanel: React.FC<TitularidadesPanelProps> = ({
  inmueble,
  titularidades,
  propietarios,
  currentUser,
  onAnadirTitular,
  onCerrarTitularidad,
  puedeGestionar = false,
}) => {
  const [nuevoTitularId, setNuevoTitularId] = useState('');
  const [porcentajeNuevo, setPorcentajeNuevo] = useState('');
  const [motivoCierre, setMotivoCierre] = useState<Record<string, string>>({});
  const [operando, setOperando] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const vigentes = useMemo(
    () => titularidadesVigentes(titularidades, inmueble.id),
    [titularidades, inmueble.id]
  );
  const historicas = useMemo(
    () => titularidadesHistoricas(titularidades, inmueble.id),
    [titularidades, inmueble.id]
  );

  const validacion = useMemo(() => validarPorcentajes(vigentes), [vigentes]);

  const nombreDe = (propietarioId: string) =>
    propietarios.find((p) => p.id === propietarioId)?.nombre ?? propietarioId;

  const disponibles = propietarios.filter(
    (p) => !vigentes.some((t) => t.propietarioId === p.id)
  );

  const anadir = async () => {
    setErrorLocal(null);
    if (!nuevoTitularId) {
      setErrorLocal('Selecciona el titular que quieres añadir.');
      return;
    }
    if (!onAnadirTitular) return;
    const pct = porcentajeNuevo.trim() === '' ? null : Number(porcentajeNuevo.replace(',', '.'));
    if (pct !== null && (!Number.isFinite(pct) || pct <= 0 || pct > 100)) {
      setErrorLocal('El porcentaje debe ser un número entre 0 y 100 (o dejarse vacío).');
      return;
    }
    setOperando(true);
    try {
      await onAnadirTitular(inmueble.id, nuevoTitularId, pct);
      setNuevoTitularId('');
      setPorcentajeNuevo('');
    } catch (e) {
      setErrorLocal(e instanceof Error ? e.message : 'No se ha podido añadir el titular.');
    } finally {
      setOperando(false);
    }
  };

  const cerrar = async (titularidadId: string) => {
    setErrorLocal(null);
    const motivo = (motivoCierre[titularidadId] || '').trim();
    if (motivo.length < 3) {
      setErrorLocal('Indica el motivo del cierre (queda registrado en el historial).');
      return;
    }
    if (!onCerrarTitularidad) return;
    setOperando(true);
    try {
      await onCerrarTitularidad(titularidadId, motivo);
      setMotivoCierre((prev) => ({ ...prev, [titularidadId]: '' }));
    } catch (e) {
      setErrorLocal(e instanceof Error ? e.message : 'No se ha podido cerrar la titularidad.');
    } finally {
      setOperando(false);
    }
  };

  const n = numeroTitulares(titularidades, inmueble.id);

  return (
    <section
      className="space-y-3"
      aria-label="Titularidad del inmueble"
      data-testid="panel-titularidades"
    >
      <header className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-blue-600" />
            Titularidad ({n} {n === 1 ? 'titular' : 'titulares'})
          </h4>
          <p className="text-[11px] text-slate-500">
            Relación de titulares vigente e histórica. Cerrar una titularidad no la borra: queda en
            el historial patrimonial.
          </p>
        </div>
      </header>

      {/* Aviso de porcentajes: NUNCA se presenta un dato inventado como real. */}
      {validacion.pendientes.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800">
            Hay {validacion.pendientes.length} titular(es) con el porcentaje{' '}
            <strong>PENDIENTE</strong>. No se muestra ningún reparto estimado: hay que indicar el
            porcentaje real o, en su defecto, dejarlo marcado como pendiente.
          </p>
        </div>
      )}
      {validacion.errores.map((e) => (
        <div
          key={e}
          className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex gap-2"
          data-testid="error-titularidad"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-800">{e}</p>
        </div>
      ))}

      {/* Vigentes */}
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
        {vigentes.length === 0 && (
          <li className="p-4 text-[11px] text-slate-500 text-center">
            Sin titularidad vigente registrada.
          </li>
        )}
        {vigentes.map((t) => (
          <li key={t.id} className="p-3 bg-white flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">
                {nombreDe(t.propietarioId)}
                {t.esPrincipal && (
                  <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[9px] font-bold">
                    PRINCIPAL
                  </span>
                )}
              </p>
              <p className="text-[10px] text-slate-500">
                {t.rol} · desde {new Date(t.fechaDesde).toLocaleDateString('es-ES')}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  t.porcentajePendiente
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
                data-testid="porcentaje-titular"
              >
                {formatearPorcentaje(t.porcentaje)}
              </span>

              {puedeGestionar && onCerrarTitularidad && (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={motivoCierre[t.id] || ''}
                    onChange={(e) =>
                      setMotivoCierre((prev) => ({ ...prev, [t.id]: e.target.value }))
                    }
                    placeholder="Motivo del cierre"
                    aria-label={`Motivo del cierre de ${nombreDe(t.propietarioId)}`}
                    className="w-40 px-2 py-1 border border-slate-200 rounded-lg text-[10px]"
                  />
                  <button
                    type="button"
                    disabled={operando}
                    onClick={() => cerrar(t.id)}
                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] rounded-lg disabled:opacity-50"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Alta de un titular más (2º, 3º, 4º… N) */}
      {puedeGestionar && onAnadirTitular && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Añadir otro titular
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={nuevoTitularId}
              onChange={(e) => setNuevoTitularId(e.target.value)}
              aria-label="Nuevo titular"
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] bg-white"
            >
              <option value="">— Selecciona un titular —</option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.nifCif})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={porcentajeNuevo}
              onChange={(e) => setPorcentajeNuevo(e.target.value)}
              placeholder="% (vacío = pendiente)"
              aria-label="Porcentaje del nuevo titular"
              className="w-40 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] bg-white"
            />
            <button
              type="button"
              disabled={operando || !nuevoTitularId}
              onClick={anadir}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] rounded-lg disabled:opacity-50"
            >
              Añadir titularidad
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            Añadir un titular crea la <strong>relación de titularidad</strong> sobre el inmueble.
            No crea una cuenta de acceso: la cuenta de usuario y la autorización de acceso se
            gestionan aparte.
          </p>
        </div>
      )}

      {/* Histórico */}
      {historicas.length > 0 && (
        <details className="border border-slate-200 rounded-xl overflow-hidden">
          <summary className="cursor-pointer px-3 py-2 bg-slate-50 text-[11px] font-bold text-slate-700 select-none">
            Histórico patrimonial ({historicas.length})
          </summary>
          <ul className="divide-y divide-slate-100">
            {historicas.map((t) => (
              <li key={t.id} className="p-3 flex items-start justify-between gap-3 bg-white">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-700 truncate">
                    {nombreDe(t.propietarioId)}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {t.estado} · {new Date(t.fechaDesde).toLocaleDateString('es-ES')}
                    {t.fechaHasta ? ` → ${new Date(t.fechaHasta).toLocaleDateString('es-ES')}` : ''}
                    {t.motivoBaja ? ` · ${t.motivoBaja}` : ''}
                  </p>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold shrink-0">
                  {formatearPorcentaje(t.porcentaje)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {errorLocal && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
          <X className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-800">{errorLocal}</p>
        </div>
      )}

      <p className="text-[10px] text-slate-400 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Usuario: {currentUser.email}
      </p>
    </section>
  );
};

export default TitularidadesPanel;
