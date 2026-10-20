import React, { useState, useRef } from 'react';
import { AlertTriangle, CalendarClock, FileSearch, RefreshCw, ShieldCheck } from 'lucide-react';
import type { ContratoFormalizacion } from '../types';
import { formatEuro } from '../utils/formatters';
import {
  confirmarActualizacionRenta,
  previsualizarActualizacionRenta,
  type ConfirmacionActualizacionRentaApi,
} from '../lib/actualizacionRentaApi';
import type { PreviewActualizacionRenta } from '../utils/actualizacionRentaEngine';

interface ActualizacionRentaPreviewPanelProps {
  contrato: ContratoFormalizacion;
  disabled?: boolean;
}

const estadoClausula: Record<string, string> = {
  ACREDITADA: 'Acreditada',
  AUSENTE_CONFIRMADA: 'Ausencia confirmada',
  NO_ACREDITADA: 'No acreditada',
};

const etiquetaEstado = (preview: PreviewActualizacionRenta): string => {
  if (preview.estado === 'CALCULABLE') return 'Previsualización calculable (sin confirmar)';
  if (preview.estado === 'SIN_ACTUALIZACION') return 'Sin actualización según los datos acreditados';
  return 'REQUIERE_REVISION · no se propone importe';
};

function claveIdempotencia(): string {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('Este navegador no permite generar una clave segura de reintento.');
  }
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const datos = new Uint8Array(24);
  crypto.getRandomValues(datos);
  return Array.from(datos, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fechaHoyMadrid(): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

export const ActualizacionRentaPreviewPanel: React.FC<ActualizacionRentaPreviewPanelProps> = ({ contrato, disabled = false }) => {
  const enCurso = useRef(false);
  const [fechaComunicacion, setFechaComunicacion] = useState('');
  const [referenciaComunicacion, setReferenciaComunicacion] = useState('');
  const [declaroEvidencia, setDeclaroEvidencia] = useState(false);
  const [preview, setPreview] = useState<PreviewActualizacionRenta | null>(null);
  const [huellaPreview, setHuellaPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmacionActualizacionRentaApi | null>(null);
  const [cargando, setCargando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [fechaProgramadaAviso, setFechaProgramadaAviso] = useState('');
  const [aceptoConfirmar, setAceptoConfirmar] = useState(false);
  const [claveReintento, setClaveReintento] = useState<string | null>(null);

  const invalidarPreview = () => {
    setPreview(null); setHuellaPreview(null); setAceptoConfirmar(false); setClaveReintento(null); setConfirmacion(null);
  };
  const solicitarPreview = async () => {
    if (enCurso.current || disabled) return;
    enCurso.current = true;
    setCargando(true);
    setError(null);
    setConfirmacion(null);
    setFechaProgramadaAviso('');
    setAceptoConfirmar(false);
    setClaveReintento(null);
    try {
      const resultado = await previsualizarActualizacionRenta(contrato.id, declaroEvidencia ? {
        fecha: fechaComunicacion, referenciaDocumental: referenciaComunicacion, declaradaPorActor: true,
      } : undefined);
      setPreview(resultado.preview);
      setHuellaPreview(resultado.huellaPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo obtener la previsualización desde el servidor.');
      setPreview(null);
      setHuellaPreview(null);
    } finally {
      setCargando(false); enCurso.current = false;
    }
  };

  const confirmar = async () => {
    if (enCurso.current || disabled || !preview?.evidenciaComunicacion || !preview.fechaEfectividad || preview.fechaEfectividad > fechaHoyMadrid() || !preview.fechaAniversario || preview.fechaEfectividad < preview.fechaAniversario || !huellaPreview || preview.estado !== 'CALCULABLE' || !fechaProgramadaAviso || !aceptoConfirmar) return;
    enCurso.current = true;
    setConfirmando(true);
    setError(null);
    try {
      const clave = claveReintento || claveIdempotencia();
      setClaveReintento(clave);
      const resultado = await confirmarActualizacionRenta({
        contratoId: contrato.id,
        huellaPreview,
        evidenciaComunicacion: preview.evidenciaComunicacion,
        fechaProgramadaAviso,
        confirmacionExplicita: true,
        idempotencyKey: clave,
      });
      setConfirmacion(resultado);
    } catch (err) {
      // Se conserva la clave durante los errores de red para que un reintento
      // reproduzca el resultado sin crear un segundo anexo o aviso.
      setError(err instanceof Error ? err.message : 'No se pudo confirmar la actualización. No se ha afirmado ningún envío.');
    } finally {
      setConfirmando(false); enCurso.current = false;
    }
  };

  const topesTexto = [
    preview?.topes?.iravPct !== undefined ? `IRAV ${preview.topes.iravPct.toFixed(2)} %` : undefined,
    preview?.topes?.limiteExtraordinarioPct !== undefined ? `DF 6.ª: ${preview.topes.limiteExtraordinarioPct.toFixed(2)} % si no hay nuevo pacto` : undefined,
    preview?.topes?.limitePrecioReferencia !== undefined ? `máximo oficial ${formatEuro(preview.topes.limitePrecioReferencia)}/mes` : undefined,
    ...(preview?.topes?.aplicable || []),
  ].filter(Boolean).join(' · ');

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-3" aria-label={`Previsualización de actualización de renta: ${contrato.inmuebleNombre}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" aria-hidden="true" />
          <div>
            <h4 className="text-xs font-bold text-slate-900">Actualización anual de renta · P4</h4>
            <p className="mt-0.5 max-w-xl text-[11px] leading-relaxed text-slate-600">
              El servidor verifica titularidad/permiso y vuelve a calcular antes de guardar. La previsualización por sí sola no autoriza el cambio ni programa el aviso.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={solicitarPreview}
          disabled={disabled || cargando || confirmando}
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3 py-2 text-[11px] font-bold text-indigo-800 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cargando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />}
          {cargando ? 'Consultando…' : preview ? 'Actualizar preview' : 'Previsualizar'}
        </button>
      </div>

      {!confirmacion && <fieldset disabled={disabled || cargando || confirmando} className="space-y-2 text-xs">
        <legend>Comunicación ya realizada por otro medio (declaración del actor, no verificación externa)</legend>
        <label className="block">Fecha de comunicación realizada
          <input className="block rounded-lg border border-slate-300 bg-white px-2.5 py-2" type="date" max={fechaHoyMadrid()} value={fechaComunicacion} onChange={(e) => { setFechaComunicacion(e.target.value); invalidarPreview(); }} />
        </label>
        <label className="block">Referencia documental de la comunicación
          <input className="block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2" type="text" maxLength={1000} value={referenciaComunicacion} onChange={(e) => { setReferenciaComunicacion(e.target.value); invalidarPreview(); }} />
        </label>
        <label className="block"><input type="checkbox" checked={declaroEvidencia} onChange={(e) => { setDeclaroEvidencia(e.target.checked); invalidarPreview(); }} />Declaro que la comunicación indicada ya se realizó y consta en la referencia documental.</label>
        <p>Sin declaración no se aplica la renta. La efectividad se deriva del mes siguiente; no se anticipa una renta futura ni se acredita entrega SMTP.</p>
      </fieldset>}
      {(confirmacion?.estadoActualizacion === 'EFECTIVA' || contrato.actualizacionRentaVigente) && (
        <p role="status">Renta vigente: {formatEuro(confirmacion?.rentaVigente ?? contrato.rentaMensual)} · Efectiva desde {confirmacion?.fechaEfectividad ?? contrato.actualizacionRentaVigente?.fechaEfectividad}</p>
      )}
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">{error}</p>}

      {preview && (
        <div className="space-y-3 border-t border-indigo-100 pt-3" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${preview.estado === 'CALCULABLE' ? 'bg-emerald-100 text-emerald-800' : preview.estado === 'SIN_ACTUALIZACION' ? 'bg-slate-200 text-slate-800' : 'bg-amber-100 text-amber-900'}`}>
              {confirmacion?.estadoActualizacion === 'EFECTIVA' ? 'Actualización efectiva registrada' : etiquetaEstado(preview)}
            </span>
            {preview.codigo && <code className="text-[10px] text-slate-500">{preview.codigo}</code>}
          </div>

          <dl className="grid grid-cols-1 gap-x-5 gap-y-2 text-[11px] sm:grid-cols-2 xl:grid-cols-3">
            <div><dt className="text-slate-500">Celebración del contrato</dt><dd className="font-semibold text-slate-800">{preview.fechaCelebracion || 'No acreditada'}</dd></div>
            <div><dt className="text-slate-500">Inicio contractual / aniversario</dt><dd className="font-semibold text-slate-800">{preview.fechaInicioContrato || 'No acreditado'} · {preview.fechaAniversario || 'sin resolver'}</dd></div>
            <div><dt className="text-slate-500">Comunicación programada</dt><dd className="font-semibold text-slate-800">{confirmacion?.fechaProgramadaAviso || (preview.estadoAviso === 'NO_PROGRAMADO' ? 'Aviso de la aplicación no programado; se elige al confirmar' : preview.estadoAviso)}</dd></div>
            <div><dt className="text-slate-500">Modalidad / uso</dt><dd className="font-semibold text-slate-800">{preview.modalidad || 'No acreditada'} · {preview.finalidadUso || 'No acreditado'}</dd></div>
            <div><dt className="text-slate-500">Cláusula de actualización</dt><dd className="font-semibold text-slate-800">{preview.evidenciaClausula ? estadoClausula[preview.evidenciaClausula.estado] : 'No acreditada'}{preview.evidenciaClausula?.mecanismo ? ` · ${preview.evidenciaClausula.mecanismo}` : ''}</dd></div>
            <div><dt className="text-slate-500">Renta de partida</dt><dd className="font-semibold text-slate-800">{preview.rentaActual !== undefined ? formatEuro(preview.rentaActual) : 'No acreditada'}</dd></div>
            <div><dt className="text-slate-500">Versión de cálculo</dt><dd>{preview.versionCalculo || 'Sin acreditar'}</dd></div>
            <div><dt className="text-slate-500">Índice oficial</dt><dd className="font-semibold text-slate-800">{preview.indice ? `${preview.indice.serie} ${preview.indice.periodo} · ${preview.indice.valorPct.toFixed(2)} % · ${preview.indice.estado}` : 'No aplicable / no disponible'}</dd></div>
            <div><dt className="text-slate-500">Publicación / consulta del índice</dt><dd className="font-semibold text-slate-800">{preview.indice ? `${preview.indice.publicadoEn} / ${preview.indice.consultadoEn}` : '—'}</dd></div>
            <div><dt className="text-slate-500">Índice y topes</dt><dd className="font-semibold text-slate-800">{topesTexto || 'Pendientes de verificar'}</dd></div>
            <div><dt className="text-slate-500">Propuesta aritmética</dt><dd className="font-semibold text-slate-800">{preview.rentaFutura !== undefined ? `${formatEuro(preview.rentaFutura)} (${preview.porcentajeAplicado?.toFixed(2)} %; +${formatEuro(preview.importeIncremento || 0)})` : 'Ningún importe propuesto'}</dd></div>
            <div><dt className="text-slate-500">Efectividad / comunicación</dt><dd className="font-semibold text-slate-800">{confirmacion?.fechaEfectividad || preview.fechaEfectividad || 'Sin determinar'} · {preview.evidenciaComunicacion ? 'Comunicación previa declarada por el actor; aviso de la aplicación no enviado' : 'No comunicado'}</dd></div>
            {preview.evidenciaComunicacion && <div><dt className="text-slate-500">Comunicación previa declarada</dt><dd>{preview.evidenciaComunicacion.fecha} · {preview.evidenciaComunicacion.referenciaDocumental}</dd></div>}
            <div><dt className="text-slate-500">Estado del aviso</dt><dd className="font-semibold text-slate-800">{confirmacion?.estadoAviso || preview.estadoAviso}</dd></div>
          </dl>

          {preview.motivo && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-950">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p>{preview.motivo}</p>
            </div>
          )}

          {preview.evidenciaClausula?.textoExtracto && (
            <blockquote className="rounded-xl border-l-2 border-indigo-300 bg-white/70 p-2.5 text-[11px] italic text-slate-700">
              “{preview.evidenciaClausula.textoExtracto}”
              {preview.evidenciaClausula.referenciaDocumental && <cite className="mt-1 block not-italic text-[10px] text-slate-500">Referencia: {preview.evidenciaClausula.referenciaDocumental}</cite>}
            </blockquote>
          )}

          {preview.estado === 'CALCULABLE' && (!preview.fechaEfectividad || !preview.fechaAniversario || preview.fechaEfectividad > fechaHoyMadrid() || preview.fechaEfectividad < preview.fechaAniversario) && <p role="alert">No se puede aplicar: falta evidencia o la fecha efectiva no ha llegado o precede a la anualidad.</p>}
          {preview.estado === 'CALCULABLE' && !confirmacion && (
            <div className="space-y-3 rounded-xl border border-indigo-200 bg-white/80 p-3">
              <div>
                <h5 className="text-[11px] font-bold text-slate-900">Aplicación efectiva y aviso pendiente</h5>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-600">
                  La fecha se elige expresamente; no se presupone un preaviso legal de 30 días. Confirmar actualiza la renta canónica, conserva el historial y registra un anexo no firmado y un aviso PENDIENTE_ENVIO. No se envía correo, no se publica en la bandeja, no se firma y no se modifican recibos ni cobros.
                </p>
              </div>
              <label className="flex flex-col gap-1 text-[10px] font-semibold text-slate-700 sm:max-w-xs">
                Fecha elegida para programar la comunicación
                <input
                  type="date"
                  min={fechaHoyMadrid()}
                  value={fechaProgramadaAviso}
                  onChange={(event) => { setFechaProgramadaAviso(event.target.value); setClaveReintento(null); }}
                  disabled={disabled || confirmando}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
                  required
                />
              </label>
              <label className="flex items-start gap-2 text-[10px] leading-relaxed text-slate-700">
                <input
                  type="checkbox"
                  checked={aceptoConfirmar}
                  onChange={(event) => setAceptoConfirmar(event.target.checked)}
                  disabled={disabled || confirmando}
                  className="mt-0.5"
                />
                <span>Confirmo expresamente, como propietario o actor con permiso de escritura, que deseo aplicar la nueva renta con la fecha efectiva mostrada y registrar el anexo y aviso indicado, sujeto a la nueva verificación del servidor.</span>
              </label>
              <button
                type="button"
                onClick={confirmar}
                disabled={disabled || cargando || confirmando || !fechaProgramadaAviso || !aceptoConfirmar || !preview.evidenciaComunicacion || !preview.fechaEfectividad || preview.fechaEfectividad > fechaHoyMadrid() || !preview.fechaAniversario || preview.fechaEfectividad < preview.fechaAniversario}
                className="rounded-xl bg-indigo-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirmando ? 'Verificando y guardando…' : 'Confirmar y aplicar renta'}
              </button>
              <button type="button" disabled={confirmando} onClick={invalidarPreview}>{claveReintento ? 'Cerrar sin revertir la operación solicitada' : 'Cancelar sin aplicar'}</button>
            </div>
          )}

          {confirmacion && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] leading-relaxed text-emerald-900">
              <strong>Registro durable {confirmacion.estado === 'REPETIDA' ? 'recuperado por reintento' : 'creado'}.</strong>
              {' '}Anexo {confirmacion.anexoId}, versión {confirmacion.version}, anexo no firmado. Aviso {confirmacion.avisoId} en {confirmacion.estadoAviso}, previsto para {confirmacion.fechaProgramadaAviso}. La aplicación no ha enviado este aviso ni acredita recepción. La comunicación previa es una declaración del actor, no una verificación externa.
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl bg-white/75 p-2.5 text-[10px] leading-relaxed text-slate-600">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-700" aria-hidden="true" />
            <p>El estado calculable es aritmético, no autorización jurídica ni prueba de entrega. La autorización y confirmación se verifican de nuevo en servidor. Correo y bandeja interna quedan con estados de validación independientes; no se afirma recepción SMTP ni publicación interna.</p>
          </div>

          {preview.fuenteNormativa && preview.fuenteNormativa.length > 0 && (
            <div className="space-y-1 text-[10px] leading-relaxed text-slate-600">
              <h5 className="font-bold text-slate-700">Reglas normativas consideradas</h5>
              <ul className="list-disc space-y-0.5 pl-4">
                {preview.fuenteNormativa.map((regla, index) => <li key={`${index}-${regla}`}>{regla}</li>)}
              </ul>
            </div>
          )}

          {preview.fuentesOficiales && preview.fuentesOficiales.length > 0 && (
            <div className="space-y-1 text-[10px] text-slate-500">
              <h5 className="font-bold text-slate-600">Fuentes oficiales registradas</h5>
              <ul className="space-y-1">
                {preview.fuentesOficiales.map((fuente) => (
                  <li key={`${fuente.identificador}-${fuente.url}`}>
                    <a href={fuente.url} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 underline">{fuente.organismo} · {fuente.identificador}</a>
                    {fuente.periodo && ` · ${fuente.periodo}`}
                    {fuente.valorPct !== undefined && ` · ${fuente.valorPct.toFixed(2)} %`}
                    {fuente.fechaPublicacion && ` · publicación ${fuente.fechaPublicacion}`}
                    {` · consulta ${fuente.fechaConsulta}`}
                    {fuente.estadoFuente && ` · ${fuente.estadoFuente}`}
                    {fuente.nota && ` · ${fuente.nota}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
