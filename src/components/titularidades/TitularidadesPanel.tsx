/**
 * PANEL DE TITULARIDADES (N TITULARES)
 * =====================================
 * Flujo: ver titulares actuales → «Añadir titular» → buscar → seleccionar →
 * indicar porcentaje SI SE CONOCE (si no, queda PENDIENTE) → confirmar.
 *
 * Reglas que este panel NO puede saltarse:
 *  · NO se inventan porcentajes: sin dato fiable se muestra «Pendiente» y se
 *    guarda `null`. No existe el 50/50 por defecto.
 *  · CERRAR ≠ BORRAR: el cierre registra fecha, motivo y detalle; la
 *    titularidad pasa al histórico y sigue consultable en este mismo panel.
 *  · Añadir un titular crea una RELACIÓN PATRIMONIAL: nunca una cuenta de
 *    acceso (eso es otra cosa y se gestiona en otro sitio).
 *  · La búsqueda se hace contra el endpoint de servidor (F3): el cliente no
 *    tiene credenciales ni lista propietarios por su cuenta.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BadgeCheck, Clock, History, Plus, Search, ShieldAlert, X } from 'lucide-react';
import type { CandidatoTitular, Inmueble, MotivoCierreTitularidad, Titularidad } from '../../types';
import { MOTIVO_CIERRE_TITULARIDAD_LABEL } from '../../types';
import {
  etiquetaPorcentaje,
  titularidadesHistoricas,
  titularidadesVigentes,
  validarPorcentajes,
} from '../../utils/titularidadesEngine';
import { MINIMO_CARACTERES, terminoValido } from '../../titularidades/busquedaTitulares';
import { porcentajeDesdeTexto } from '../../lib/titularesModelo';
import { confirmar } from '../../feedback/confirmacion';
import { avisoCicloPatrimonial } from '../../utils/fichaInmueblePresentacion';

export interface TitularidadesPanelProps {
  inmueble: Inmueble;
  /** Titularidades del inmueble ya resueltas por la capa de datos (F2). */
  titularidades: Titularidad[];
  /** Nombres conocidos (del lote de propietarios del usuario). */
  nombresPropietarios?: Record<string, string>;
  /** ¿Puede gestionar las titularidades de este inmueble? */
  puedeGestionar?: boolean;
  /** Alta: devuelve una promesa que SÓLO se resuelve bien si se persistió. */
  onAnadirTitular?: (inmuebleId: string, propietarioId: string, porcentaje: number | null) => Promise<void>;
  /** Cierre (NUNCA borrado) de una titularidad vigente. */
  onCerrarTitularidad?: (titularidadId: string, motivo: MotivoCierreTitularidad, detalle?: string) => Promise<void>;
  /** Búsqueda servidor (F3): mínimo 3 caracteres, máximo 10 resultados. */
  onBuscarTitulares?: (inmuebleId: string, termino: string) => Promise<CandidatoTitular[]>;
  /**
   * Cambiar el TITULAR FISCAL PRINCIPAL del inmueble. No transmite la
   * titularidad canónica: sólo declara quién actúa como principal. La capa de
   * datos y las Rules revalidan.
   */
  onCambiarPrincipal?: (inmuebleId: string, propietarioId: string) => Promise<void>;
  /**
   * Modificar el porcentaje declarado de una titularidad existente
   * (`null` = PENDIENTE). Nunca se inventa un reparto.
   */
  onActualizarPorcentaje?: (titularidadId: string, porcentaje: number | null) => Promise<void>;
  /** ¿Se ofrece cambiar de principal? (por defecto, sí cuando `puedeGestionar`). */
  puedeCambiarPrincipal?: boolean;
}

const MOTIVOS: MotivoCierreTitularidad[] = [
  'VENTA',
  'DONACION',
  'HERENCIA',
  'DIVORCIO',
  'DISOLUCION_CONDOMINIO',
  'ERROR_DATOS',
  'OTRO',
];

export const TitularidadesPanel: React.FC<TitularidadesPanelProps> = ({
  inmueble,
  titularidades,
  nombresPropietarios = {},
  puedeGestionar = false,
  onAnadirTitular,
  onCerrarTitularidad,
  onBuscarTitulares,
  onCambiarPrincipal,
  onActualizarPorcentaje,
  puedeCambiarPrincipal,
}) => {
  const nombreDe = useCallback(
    (propietarioId: string): string => nombresPropietarios[propietarioId] || propietarioId,
    [nombresPropietarios],
  );

  const vigentes = useMemo(() => titularidadesVigentes(titularidades, inmueble.id), [titularidades, inmueble.id]);
  const historicas = useMemo(
    () => titularidadesHistoricas(titularidades, inmueble.id),
    [titularidades, inmueble.id],
  );
  const diagnostico = useMemo(() => validarPorcentajes(titularidades, inmueble.id), [titularidades, inmueble.id]);

  // --- Alta de titular ------------------------------------------------------
  const [buscando, setBuscando] = useState(false);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<CandidatoTitular[]>([]);
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [seleccionado, setSeleccionado] = useState<CandidatoTitular | null>(null);
  const [porcentaje, setPorcentaje] = useState('');
  const [guardando, setGuardando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const ejecutarBusqueda = useCallback(
    async (valor: string) => {
      if (!onBuscarTitulares) return;
      if (!terminoValido(valor)) {
        setResultados([]);
        setErrorBusqueda(null);
        return;
      }
      setBuscando(true);
      setErrorBusqueda(null);
      try {
        const encontrados = await onBuscarTitulares(inmueble.id, valor);
        setResultados(encontrados);
        if (encontrados.length === 0) setErrorBusqueda('Sin coincidencias para esa búsqueda.');
      } catch (error) {
        setResultados([]);
        setErrorBusqueda(
          error && typeof error === 'object' && 'detalle' in error
            ? String((error as { detalle?: string }).detalle)
            : 'No se ha podido realizar la búsqueda.',
        );
      } finally {
        setBuscando(false);
      }
    },
    [inmueble.id, onBuscarTitulares],
  );

  const alCambiarTermino = (valor: string) => {
    setTermino(valor);
    setSeleccionado(null);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      void ejecutarBusqueda(valor);
    }, 300);
  };

  const yaEsTitular = (id: string) => vigentes.some((t) => t.propietarioId === id);

  const confirmarAlta = async () => {
    if (!seleccionado || !onAnadirTitular) return;
    const bruto = porcentaje.trim().replace(',', '.');
    const pct = bruto === '' ? null : Number(bruto);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      await confirmar({
        titulo: 'Porcentaje no válido',
        mensaje: 'El porcentaje debe ser un número entre 0 y 100, o dejarse vacío para marcarlo como pendiente.',
        etiquetaConfirmar: 'Entendido',
      });
      return;
    }
    const { confirmado } = await confirmar({
      titulo: 'Añadir titular',
      mensaje: `Se añadirá a ${seleccionado.nombre} como titular de ${inmueble.direccion}.`,
      detalle:
        pct === null
          ? 'Sin porcentaje: quedará PENDIENTE. No se asume ningún reparto (ni 50/50 ni otro).'
          : `Con el ${pct} % de titularidad. Recuerde que el reparto debe sumar 100 %.`,
      etiquetaConfirmar: 'Añadir titular',
    });
    if (!confirmado) return;

    setGuardando(true);
    try {
      // La confirmación visual la emite la capa superior SÓLO si esto resuelve.
      await onAnadirTitular(inmueble.id, seleccionado.id, pct);
      setMostrarAlta(false);
      setTermino('');
      setResultados([]);
      setSeleccionado(null);
      setPorcentaje('');
    } finally {
      setGuardando(false);
    }
  };

  // --- Cierre de titularidad ------------------------------------------------
  const [cierreEnCurso, setCierreEnCurso] = useState<string | null>(null);
  const [motivoCierre, setMotivoCierre] = useState<MotivoCierreTitularidad>('VENTA');
  const [detalleCierre, setDetalleCierre] = useState('');

  const confirmarCierre = async (t: Titularidad) => {
    if (!onCerrarTitularidad) return;
    const { confirmado, texto } = await confirmar({
      titulo: 'Cerrar titularidad',
      mensaje: `La titularidad de ${nombreDe(t.propietarioId)} pasará al histórico.`,
      detalle:
        'Cerrar NO borra: la titularidad queda registrada con fecha y motivo y seguirá consultable en el histórico patrimonial.',
      peligroso: true,
      etiquetaConfirmar: 'Cerrar titularidad',
      entradaTexto: {
        etiqueta: 'Motivo / detalle del cierre',
        marcador: 'Ej.: Escritura de compraventa ante notario…',
        obligatorio: true,
        valorInicial: detalleCierre,
        errorObligatorio: 'Indique el motivo del cierre para poder registrarlo.',
      },
    });
    if (!confirmado) return;
    setCierreEnCurso(t.id);
    try {
      await onCerrarTitularidad(t.id, motivoCierre, texto?.trim() || undefined);
      setCierreEnCurso(null);
      setDetalleCierre('');
    } finally {
      setCierreEnCurso(null);
    }
  };

  // --- Principal fiscal y porcentaje (edición de una relación existente) ----
  const esPrincipalFiscal = (t: Titularidad): boolean =>
    (inmueble.propietarioPrincipalId || '').trim() === t.propietarioId ||
    (inmueble.propietarioId || '').trim() === t.propietarioId;

  const permiteCambiarPrincipal = puedeCambiarPrincipal ?? puedeGestionar;
  const [principalEnCurso, setPrincipalEnCurso] = useState<string | null>(null);

  const confirmarPrincipal = async (t: Titularidad) => {
    if (!onCambiarPrincipal) return;
    const { confirmado } = await confirmar({
      titulo: 'Cambiar titular principal',
      mensaje: `¿Declarar a ${nombreDe(t.propietarioId)} como titular principal del inmueble?`,
      detalle:
        'Cambia el titular fiscal principal (quién actúa como principal). No transmite la propiedad ni borra ninguna titularidad.',
      etiquetaConfirmar: 'Sí, es el principal',
    });
    if (!confirmado) return;
    setPrincipalEnCurso(t.id);
    try {
      await onCambiarPrincipal(inmueble.id, t.propietarioId);
    } finally {
      setPrincipalEnCurso(null);
    }
  };

  const [porcentajeEnCurso, setPorcentajeEnCurso] = useState<string | null>(null);
  const [porcentajeTexto, setPorcentajeTexto] = useState('');
  const [guardandoPorcentaje, setGuardandoPorcentaje] = useState(false);
  const [errorPorcentaje, setErrorPorcentaje] = useState<string | null>(null);

  const abrirPorcentaje = (t: Titularidad) => {
    setPorcentajeEnCurso(t.id);
    setPorcentajeTexto(t.porcentajeTitularidad === null ? '' : String(t.porcentajeTitularidad));
    setErrorPorcentaje(null);
  };

  const confirmarPorcentaje = async (t: Titularidad) => {
    if (!onActualizarPorcentaje) return;
    const pct = porcentajeDesdeTexto(porcentajeTexto);
    if (pct === undefined) {
      setErrorPorcentaje('Indica un porcentaje entre 0 y 100, o déjalo vacío para marcarlo como pendiente.');
      return;
    }
    setErrorPorcentaje(null);
    setGuardandoPorcentaje(true);
    try {
      await onActualizarPorcentaje(t.id, pct);
      setPorcentajeEnCurso(null);
      setPorcentajeTexto('');
    } finally {
      setGuardandoPorcentaje(false);
    }
  };

  const avisoCiclo = avisoCicloPatrimonial(inmueble);

  return (
    <div className="space-y-4" data-testid="panel-titularidades">
      {avisoCiclo && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">{avisoCiclo}</p>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">Titulares actuales ({vigentes.length})</h4>
          <p className="text-xs text-slate-500">
            Relación de titularidad del inmueble. El porcentaje sólo se muestra si consta: si no, queda
            <span className="font-semibold"> pendiente</span> (nunca se inventa).
          </p>
        </div>
        {puedeGestionar && onAnadirTitular && (
          <button
            type="button"
            onClick={() => setMostrarAlta((v) => !v)}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
          >
            {mostrarAlta ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {mostrarAlta ? 'Cancelar' : 'Añadir titular'}
          </button>
        )}
      </div>

      {diagnostico.bloquea && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-xs">{diagnostico.mensaje}</p>
        </div>
      )}

      {/* Alta de titular */}
      {mostrarAlta && (
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="buscar-titular">
              Buscar titular (mínimo {MINIMO_CARACTERES} caracteres)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="buscar-titular"
                type="text"
                value={termino}
                onChange={(e) => alCambiarTermino(e.target.value)}
                placeholder="Nombre o razón social"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                autoComplete="off"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              La búsqueda se realiza en servidor: sólo se devuelven nombre e identificador.
            </p>
          </div>

          {buscando && <p className="text-xs text-slate-500">Buscando…</p>}
          {errorBusqueda && !buscando && <p className="text-xs text-rose-700">{errorBusqueda}</p>}

          {resultados.length > 0 && (
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {resultados.map((c) => {
                const titular = yaEsTitular(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => !titular && setSeleccionado(c)}
                      disabled={titular}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 ${
                        seleccionado?.id === c.id ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'
                      } ${titular ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span>{c.nombre}</span>
                      {titular ? (
                        <span className="text-[11px] text-slate-500">Ya es titular</span>
                      ) : (
                        <BadgeCheck className={`w-4 h-4 ${seleccionado?.id === c.id ? 'text-blue-600' : 'text-slate-300'}`} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {seleccionado && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1" htmlFor="porcentaje-titular">
                  Porcentaje (opcional)
                </label>
                <input
                  id="porcentaje-titular"
                  type="text"
                  inputMode="decimal"
                  value={porcentaje}
                  onChange={(e) => setPorcentaje(e.target.value)}
                  placeholder="Vacío = pendiente"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Si no se conoce, déjelo vacío: quedará como PENDIENTE. No se asume ningún reparto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void confirmarAlta()}
                disabled={guardando}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold"
              >
                {guardando ? 'Guardando…' : `Confirmar alta de ${seleccionado.nombre}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Vigentes */}
      {vigentes.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <p className="text-xs font-bold text-slate-700">Sin titulares declarados</p>
          <p className="text-xs text-slate-500 mt-1">
            Añada los titulares del inmueble. Sin titularidades, la liquidación no reparte entre varios.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {vigentes.map((t) => {
            const principal = esPrincipalFiscal(t);
            return (
              <li key={t.id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate flex items-center gap-2">
                      {nombreDe(t.propietarioId)}
                      {principal && (
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800"
                          data-testid="titular-principal"
                        >
                          Principal
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Desde {t.fechaInicio?.slice(0, 10) || '—'}
                      {t.propietarioNombre ? ` · ${t.propietarioNombre}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                        t.porcentajeTitularidad === null
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {etiquetaPorcentaje(t)}
                    </span>
                    {puedeGestionar && onActualizarPorcentaje && (
                      <button
                        type="button"
                        onClick={() => (porcentajeEnCurso === t.id ? setPorcentajeEnCurso(null) : abrirPorcentaje(t))}
                        className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-blue-700 border border-slate-200 rounded-lg"
                        data-testid={`editar-porcentaje-${t.id}`}
                      >
                        {porcentajeEnCurso === t.id ? 'Cancelar' : 'Editar %'}
                      </button>
                    )}
                    {puedeGestionar && onCerrarTitularidad && (
                      <button
                        type="button"
                        onClick={() => void confirmarCierre(t)}
                        disabled={cierreEnCurso === t.id}
                        className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-rose-700 border border-slate-200 rounded-lg"
                        title="Cerrar (no borrar): pasa al histórico"
                      >
                        {cierreEnCurso === t.id ? 'Cerrando…' : 'Cerrar titularidad'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Cambiar principal: relación existente, sin transmisión ni borrado */}
                {permiteCambiarPrincipal && !principal && onCambiarPrincipal && (
                  <button
                    type="button"
                    onClick={() => void confirmarPrincipal(t)}
                    disabled={principalEnCurso === t.id}
                    className="px-2 py-1 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 border border-indigo-200 bg-indigo-50 rounded-lg"
                    data-testid={`marcar-principal-${t.id}`}
                  >
                    {principalEnCurso === t.id ? 'Actualizando…' : 'Marcar como principal'}
                  </button>
                )}

                {/* Porcentaje: se declara si consta; vacío = PENDIENTE (nunca 50/50) */}
                {porcentajeEnCurso === t.id && (
                  <div className="flex flex-wrap items-end gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <label className="text-[11px] font-bold text-slate-700">
                      Porcentaje (%)
                      <input
                        type="text"
                        inputMode="decimal"
                        value={porcentajeTexto}
                        onChange={(e) => setPorcentajeTexto(e.target.value)}
                        placeholder="Vacío = pendiente"
                        aria-label={`Porcentaje de ${nombreDe(t.propietarioId)}`}
                        className="ml-2 w-28 px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void confirmarPorcentaje(t)}
                      disabled={guardandoPorcentaje}
                      className="px-3 py-1.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg"
                      data-testid={`guardar-porcentaje-${t.id}`}
                    >
                      {guardandoPorcentaje ? 'Guardando…' : 'Guardar porcentaje'}
                    </button>
                    {errorPorcentaje && <p className="text-[11px] text-rose-700 w-full">{errorPorcentaje}</p>}
                    <p className="text-[10px] text-slate-500 w-full">
                      Si no consta, déjalo vacío: queda PENDIENTE. No se asume ningún reparto.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Selector de motivo (se aplica al siguiente cierre) */}
      {puedeGestionar && vigentes.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-slate-600" htmlFor="motivo-cierre">
            Motivo por defecto del cierre
          </label>
          <select
            id="motivo-cierre"
            value={motivoCierre}
            onChange={(e) => setMotivoCierre(e.target.value as MotivoCierreTitularidad)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white"
          >
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_CIERRE_TITULARIDAD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Histórico: NUNCA se borra */}
      <div className="pt-2">
        <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <History className="w-4 h-4" /> Histórico patrimonial ({historicas.length})
        </h5>
        {historicas.length === 0 ? (
          <p className="text-[11px] text-slate-500 mt-1">Sin titularidades cerradas.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {historicas.map((t) => (
              <li key={t.id} className="px-4 py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{nombreDe(t.propietarioId)}</p>
                  <p className="text-[11px] text-slate-500">
                    {t.motivoCierre ? MOTIVO_CIERRE_TITULARIDAD_LABEL[t.motivoCierre] : 'Cierre'}
                    {t.detalleCierre ? ` · ${t.detalleCierre}` : ''}
                  </p>
                </div>
                <span className="text-[11px] text-slate-500 flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3" /> {t.fechaCierre?.slice(0, 10) || '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TitularidadesPanel;
