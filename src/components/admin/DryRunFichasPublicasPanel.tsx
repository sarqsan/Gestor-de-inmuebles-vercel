/**
 * R3 · Panel de SOLO LECTURA para el DRY-RUN del backfill de `fichas_publicas_inmueble`.
 *
 * - Visible únicamente para el master (`puedeEjecutarDryRunFichasPublicas`);
 *   para cualquier otro usuario no renderiza nada.
 * - El único efecto es invocar `ejecutarDryRunFichasPublicas` (análisis) y
 *   mostrar/descargar el informe. No existe ningún botón ni ruta de escritura:
 *   este componente no importa `materializarFichasPublicas`.
 */
import React, { useState } from 'react';
import type { UsuarioApp } from '../../types';
import {
  ejecutarDryRunFichasPublicas,
  puedeEjecutarDryRunFichasPublicas,
  serializarInformeDryRun,
  type InformeDryRunFichasPublicas,
} from '../../lib/dryRunFichasPublicas';
import type { EstadoItemBackfill } from '../../lib/backfillFichasPublicas';

interface Props {
  currentUser: UsuarioApp;
  /** Email de la sesión Firebase Auth (si se conoce). */
  emailSesion?: string | null;
  /** Inyectable en tests; por defecto la ejecución real de solo lectura. */
  ejecutar?: typeof ejecutarDryRunFichasPublicas;
}

const ETIQUETAS: Record<EstadoItemBackfill, string> = {
  CREAR: 'A crear (sin ficha)',
  ACTUALIZAR: 'A actualizar (ficha distinta)',
  AL_DIA: 'Al día',
  SIN_FICHA_POSIBLE: 'Sin ficha posible (sin titular)',
  ERROR: 'Errores',
};

const ORDEN: EstadoItemBackfill[] = ['CREAR', 'ACTUALIZAR', 'AL_DIA', 'SIN_FICHA_POSIBLE', 'ERROR'];

export const DryRunFichasPublicasPanel: React.FC<Props> = ({ currentUser, emailSesion, ejecutar }) => {
  const [informe, setInforme] = useState<InformeDryRunFichasPublicas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!puedeEjecutarDryRunFichasPublicas(currentUser, emailSesion)) return null;

  const lanzar = async () => {
    setCargando(true);
    setError(null);
    try {
      const fn = ejecutar || ejecutarDryRunFichasPublicas;
      setInforme(await fn(currentUser, { emailSesion }));
    } catch (err) {
      setInforme(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCargando(false);
    }
  };

  const descargar = () => {
    if (!informe) return;
    const blob = new Blob([serializarInformeDryRun(informe)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dry-run-fichas-publicas-${informe.generadoEn.replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl" data-testid="dry-run-fichas-publicas">
      <h3 className="text-sm font-bold text-white mb-2">Fichas públicas · DRY-RUN del backfill (solo lectura)</h3>
      <p className="text-xs text-slate-400 mb-4">
        Analiza los inmuebles reales y clasifica su ficha pública sin escribir nada en Firestore. Este panel no
        materializa fichas: la ejecución del backfill requiere una orden aparte.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={lanzar}
          disabled={cargando}
          className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold cursor-pointer"
        >
          {cargando ? 'Analizando…' : 'Ejecutar DRY-RUN (solo lectura)'}
        </button>
        {informe && (
          <button
            type="button"
            onClick={descargar}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
          >
            Descargar informe JSON
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-xl p-3 mb-4" role="alert">
          {error}
        </p>
      )}

      {informe && (
        <div className="space-y-4 text-xs text-slate-300">
          <p className="font-mono text-slate-400">{informe.informe.resumen}</p>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <dt className="text-slate-500">N (inmuebles)</dt>
              <dd className="text-lg font-bold text-white" data-testid="dry-run-N">{informe.resumen.N}</dd>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <dt className="text-slate-500">A crear</dt>
              <dd className="text-lg font-bold text-white" data-testid="dry-run-aCrear">{informe.resumen.aCrear}</dd>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <dt className="text-slate-500">A actualizar</dt>
              <dd className="text-lg font-bold text-white" data-testid="dry-run-aActualizar">{informe.resumen.aActualizar}</dd>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <dt className="text-slate-500">Al día</dt>
              <dd className="text-lg font-bold text-white" data-testid="dry-run-alDia">{informe.resumen.alDia}</dd>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <dt className="text-slate-500">Sin ficha posible</dt>
              <dd className="text-lg font-bold text-white" data-testid="dry-run-noAptos">{informe.resumen.noAptos}</dd>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
              <dt className="text-slate-500">Errores</dt>
              <dd className="text-lg font-bold text-white" data-testid="dry-run-errores">{informe.resumen.errores}</dd>
            </div>
          </dl>

          {ORDEN.map((estado) => (
            <details key={estado} className="bg-slate-950 border border-slate-800 rounded-xl p-3" data-testid={`dry-run-ids-${estado}`}>
              <summary className="cursor-pointer font-semibold text-slate-200">
                {ETIQUETAS[estado]} · {informe.resumen.ids[estado].length}
              </summary>
              {informe.resumen.ids[estado].length > 0 ? (
                <ul className="mt-2 font-mono text-[11px] text-slate-400 space-y-0.5 max-h-48 overflow-y-auto">
                  {informe.resumen.ids[estado].map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-slate-500">—</p>
              )}
            </details>
          ))}

          {informe.informe.errores.length > 0 && (
            <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-3">
              <p className="font-semibold text-rose-200 mb-2">Detalle de errores</p>
              <ul className="font-mono text-[11px] text-rose-200/90 space-y-1">
                {informe.informe.errores.map((e) => (
                  <li key={e.inmuebleId}>
                    {e.inmuebleId} · {e.motivo}{e.error ? ` · ${e.error}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
