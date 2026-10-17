/**
 * IA · FASE 5 — PANEL DEL ASISTENTE DE INCIDENCIAS (portal del inquilino)
 * ======================================================================
 * Presenta el diagnóstico guiado que devuelve el SERVIDOR y recoge las
 * respuestas a las preguntas aclaratorias. Principios visibles en la interfaz:
 *
 *   · separa PLANOS: hipótesis técnica (a comprobar) · lectura orientativa de
 *     las cláusulas del contrato · quién decide y paga (decisión económica);
 *   · muestra la INCERTIDUMBRE y los límites del análisis;
 *   · las medidas preventivas y las advertencias las aporta el servidor; este
 *     componente no añade ni filtra ninguna;
 *   · el inquilino decide si pide DERIVACIÓN: el botón sólo solicita que gestión
 *     reciba la incidencia con el contexto; no genera cargos ni órdenes.
 */
import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ClipboardList, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import type { DiagnosticoIncidenciaIA, RespuestaAclaratoriaIA } from '../../ia/asistenteIncidenciasIA';
import { analizarIncidenciaInquilino } from '../../lib/clienteAsistenteIncidencias';

interface Props {
  contratoId: string;
  incidenciaId?: string;
  descripcionInicial?: string;
  categoriaInicial?: string;
  /** Solicitud de derivación (la gestiona la capa de seguimiento; aquí no ejecuta nada por sí sola). */
  onSolicitarDerivacion?: (destinos: string[]) => Promise<void> | void;
}

type Estado = 'CERRADO' | 'FORMULARIO' | 'CARGANDO' | 'RESULTADO' | 'ERROR';

const URGENCIA_CLASE: Record<string, string> = {
  URGENTE: 'bg-red-100 text-red-800 border-red-200',
  ALTA: 'bg-orange-100 text-orange-800 border-orange-200',
  NORMAL: 'bg-blue-100 text-blue-800 border-blue-200',
  BAJA: 'bg-slate-100 text-slate-700 border-slate-200',
};

const ETIQUETA_URGENCIA: Record<string, string> = {
  URGENTE: 'Urgente',
  ALTA: 'Prioridad alta',
  NORMAL: 'Normal',
  BAJA: 'Sin urgencia aparente',
};

export const AsistenteIncidenciaAsistida: React.FC<Props> = ({
  contratoId,
  incidenciaId,
  descripcionInicial,
  categoriaInicial,
  onSolicitarDerivacion,
}) => {
  const [estado, setEstado] = useState<Estado>('CERRADO');
  const [descripcion, setDescripcion] = useState(descripcionInicial || '');
  const [diagnostico, setDiagnostico] = useState<DiagnosticoIncidenciaIA | null>(null);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [avisos, setAvisos] = useState<string[]>([]);
  const [origen, setOrigen] = useState<'DETERMINISTA' | 'PROVEEDOR'>('DETERMINISTA');
  const [sinLlaveConectada, setSinLlaveConectada] = useState(false);
  const [derivacionEnviada, setDerivacionEnviada] = useState(false);

  const analizar = async (respuestasEnviadas: RespuestaAclaratoriaIA[]) => {
    setEstado('CARGANDO');
    setError('');
    const resultado = await analizarIncidenciaInquilino({
      contratoId,
      ...(incidenciaId ? { incidenciaId } : {}),
      ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
      ...(categoriaInicial ? { categoria: categoriaInicial } : {}),
      ...(respuestasEnviadas.length > 0 ? { respuestas: respuestasEnviadas } : {}),
    });
    if (resultado.estado === 'ERROR') {
      setError(resultado.error);
      setEstado('ERROR');
      return;
    }
    setDiagnostico(resultado.diagnostico);
    setOrigen(resultado.origenRespuesta);
    setSinLlaveConectada(resultado.llaveUsuario === 'ausente');
    setAvisos(resultado.avisos);
    setDerivacionEnviada(false);
    setEstado('RESULTADO');
  };

  const responderYReanalizar = () => {
    const guardadas = respuestas as Record<string, string>;
    const enviadas: RespuestaAclaratoriaIA[] = [];
    for (const preguntaId of Object.keys(guardadas)) {
      const valor = (guardadas[preguntaId] || '').trim();
      if (valor !== '') enviadas.push({ preguntaId, respuesta: valor });
    }
    if (enviadas.length === 0) return;
    setRespuestas({});
    void analizar(enviadas);
  };

  if (estado === 'CERRADO') {
    return (
      <button
        type="button"
        onClick={() => setEstado('FORMULARIO')}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-xl px-3 py-2"
      >
        <Sparkles className="w-3.5 h-3.5" /> Diagnóstico asistido
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3" aria-label="Diagnóstico asistido de incidencias">
      <header className="flex items-start justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-extrabold text-indigo-900">
          <Sparkles className="w-4 h-4" /> Diagnóstico asistido
        </h4>
        <button
          type="button"
          onClick={() => setEstado('CERRADO')}
          className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
        >
          Cerrar
        </button>
      </header>

      {estado === 'FORMULARIO' && (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700" htmlFor={`desc-${incidenciaId || contratoId}`}>
            Cuéntame qué ocurre
          </label>
          <textarea
            id={`desc-${incidenciaId || contratoId}`}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Describe el problema, desde cuándo y si hay riesgo para personas"
            className="w-full text-xs rounded-xl border border-slate-300 p-2.5"
          />
          <button
            type="button"
            disabled={descripcion.trim().length < 10}
            onClick={() => void analizar([])}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 rounded-xl px-3 py-2"
          >
            <ClipboardList className="w-3.5 h-3.5" /> Analizar incidencia
          </button>
          <p className="text-[11px] text-slate-500">
            Este análisis es orientativo y no sustituye a una visita técnica ni decide quién paga la reparación.
          </p>
        </div>
      )}

      {estado === 'CARGANDO' && (
        <p role="status" className="flex items-center gap-2 text-xs font-bold text-indigo-800">
          <Loader2 className="w-4 h-4 animate-spin" /> Analizando con la información de tu contrato…
        </p>
      )}

      {estado === 'ERROR' && (
        <p role="alert" className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-2.5">
          {error}
        </p>
      )}

      {estado === 'RESULTADO' && diagnostico && (
        <div className="space-y-3" data-testid="diagnostico-incidencia" data-origen={origen} data-urgencia={diagnostico.urgencia}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${URGENCIA_CLASE[diagnostico.urgencia] || URGENCIA_CLASE.NORMAL}`}>
              {ETIQUETA_URGENCIA[diagnostico.urgencia] || diagnostico.urgencia}
            </span>
            <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-600">
              Incertidumbre {diagnostico.incertidumbre.nivel.toLowerCase()}
            </span>
            <span className="text-[11px] px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-500">
              {origen === 'PROVEEDOR' ? 'Análisis asistido ampliado' : 'Análisis determinista del asistente'}
            </span>
          </div>

          {sinLlaveConectada && (
            <div role="status" data-testid="aviso-ia-no-conectada" className="flex items-start gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-xl p-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p>
                <strong>Análisis básico, sin inteligencia artificial.</strong> Este resultado lo ha generado el análisis por reglas del asistente.
                Si tienes dudas sobre la incidencia, puedes contactar con tu propietario.
              </p>
            </div>
          )}

          {diagnostico.accionInmediata && (
            <p role="alert" className="flex items-start gap-2 text-xs font-bold text-red-800 bg-red-50 border border-red-200 rounded-xl p-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {diagnostico.accionInmediata}
            </p>
          )}

          {avisos.length > 0 && (
            <ul className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 space-y-1">
              {avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Hipótesis técnica (a comprobar)</p>
            <ul className="mt-1 space-y-1.5">
              {diagnostico.hipotesisTecnica.map((h) => (
                <li key={h.codigo} className="text-xs bg-white rounded-xl border border-slate-200 p-2.5">
                  <span className="font-bold text-slate-800">{h.descripcion}</span>
                  {h.indicios.length > 0 && (
                    <ul className="mt-1 list-disc list-inside text-[11px] text-slate-500">
                      {h.indicios.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  )}
                  <span className="block mt-1 text-[11px] text-slate-400">Hipótesis pendiente de comprobación técnica.</span>
                </li>
              ))}
            </ul>
          </div>

          {diagnostico.preguntas.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Preguntas para afinar el análisis</p>
              <div className="mt-1 space-y-2">
                {diagnostico.preguntas.map((p) => (
                  <div key={p.id}>
                    <label htmlFor={`preg-${p.id}`} className="block text-xs font-semibold text-slate-700">
                      {p.pregunta}
                    </label>
                    <p className="text-[11px] text-slate-500">{p.motivo}</p>
                    <input
                      id={`preg-${p.id}`}
                      value={respuestas[p.id] || ''}
                      onChange={(e) => setRespuestas((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      maxLength={500}
                      className="mt-1 w-full text-xs rounded-xl border border-slate-300 p-2"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={responderYReanalizar}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-800 border border-indigo-200 bg-white hover:bg-indigo-50 rounded-xl px-3 py-2"
              >
                Analizar con estas respuestas
              </button>
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Medidas preventivas seguras</p>
            <ul className="mt-1 space-y-1">
              {diagnostico.medidasPreventivas.map((m) => (
                <li key={m.codigo} className="text-xs text-slate-700 bg-white border border-slate-200 rounded-xl p-2.5">
                  {m.inmediata && <span className="font-bold text-red-700">Prioritario: </span>}
                  {m.medida}
                </li>
              ))}
            </ul>
            {diagnostico.medidasProhibidas.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {diagnostico.medidasProhibidas.map((m) => (
                  <li key={m.codigo} className="text-[11px] text-slate-600">No hacer: {m.advertencia}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Lectura orientativa de tu contrato</p>
            {diagnostico.interpretacionClausulas.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500">No hay cláusulas del contrato relacionadas con este tipo de incidencia.</p>
            ) : (
              <ul className="mt-1 space-y-1.5">
                {diagnostico.interpretacionClausulas.map((c) => (
                  <li key={c.referencia} className="text-xs bg-white border border-slate-200 rounded-xl p-2.5">
                    <span className="text-[11px] font-bold text-slate-500">{c.referencia}</span>
                    <p className="text-[11px] text-slate-600 italic mt-0.5">{c.textoAutorizado}</p>
                    <p className="mt-1 text-slate-700">{c.interpretacionOrientativa}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Quién decide</p>
            <p className="text-xs text-slate-700 mt-0.5">{diagnostico.decisionEconomica.aviso}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Requiere autorización previa de la propiedad o la administración · este asistente no estima importes.
            </p>
          </div>

          <details className="bg-white border border-slate-200 rounded-xl p-2.5">
            <summary className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer">
              <ChevronDown className="w-3.5 h-3.5" /> Qué no sabe este análisis ({diagnostico.incertidumbre.nivel.toLowerCase()})
            </summary>
            <ul className="mt-1.5 list-disc list-inside text-[11px] text-slate-600 space-y-1">
              {diagnostico.incertidumbre.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <ul className="mt-2 text-[11px] text-slate-500 space-y-1">
              {diagnostico.limites.map((l) => (
                <li key={l} className="flex items-start gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" /> {l}
                </li>
              ))}
            </ul>
          </details>

          {diagnostico.derivacion.recomendada && (
            <div className="bg-white border border-slate-200 rounded-xl p-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Derivación</p>
              <p className="text-xs text-slate-700 mt-0.5">{diagnostico.derivacion.motivo}</p>
              <p className="text-[11px] text-slate-500 mt-1">Destinos posibles: {diagnostico.derivacion.destinos.join(', ').toLowerCase()}</p>
              {onSolicitarDerivacion && (
                <button
                  type="button"
                  disabled={derivacionEnviada}
                  onClick={() => {
                    void Promise.resolve(onSolicitarDerivacion(diagnostico.derivacion.destinos)).then(() => setDerivacionEnviada(true));
                  }}
                  className="mt-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 rounded-xl px-3 py-2"
                >
                  {derivacionEnviada ? 'Derivación solicitada' : 'Derivar a gestión'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
