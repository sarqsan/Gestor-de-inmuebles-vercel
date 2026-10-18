import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, LoaderCircle } from 'lucide-react';
import type { CobroPeriodo, RegistroJustificanteCobro } from '../../types';
import {
  ErrorApiJustificantesCobro,
  nuevaClaveIdempotencia,
  presentarJustificanteCobro,
} from '../../lib/justificantesCobroApi';

const MAX_BYTES = 4 * 1024 * 1024;
const METODOS: Array<{ value: RegistroJustificanteCobro['metodoPagoDeclarado']; label: string }> = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'domiciliacion', label: 'Domiciliación' },
  { value: 'bizum', label: 'Bizum' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'otro', label: 'Otro' },
];

interface Props {
  contratoId: string;
  cobro: CobroPeriodo;
  registro?: RegistroJustificanteCobro;
  onActualizado: () => Promise<void>;
}

function parsearImporte(texto: string): number | null {
  const limpio = texto.trim().replace(/\s|€/g, '');
  if (!limpio) return null;
  const normalizado = limpio.includes(',')
    ? limpio.replace(/\./g, '').replace(',', '.')
    : limpio;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const valor = Number(normalizado);
  return Number.isFinite(valor) && valor > 0 && valor <= 1_000_000 ? valor : null;
}

function keyStorage(contratoId: string, cobroId: string): string {
  return `p2.justificante:${encodeURIComponent(contratoId)}:${encodeURIComponent(cobroId)}`;
}

export const PresentarJustificanteCobro: React.FC<Props> = ({ contratoId, cobro, registro, onActualizado }) => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [importe, setImporte] = useState('');
  const [fecha, setFecha] = useState('');
  const [metodo, setMetodo] = useState<RegistroJustificanteCobro['metodoPagoDeclarado'] | ''>('');
  const [enviando, setEnviando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [respuestaLocal, setRespuestaLocal] = useState<RegistroJustificanteCobro | null>(null);
  const claveActual = useRef<string | null>(null);
  const actual = registro || respuestaLocal;

  const claveReintento = (): string => {
    if (claveActual.current) return claveActual.current;
    const storageKey = keyStorage(contratoId, cobro.id);
    try {
      const existente = sessionStorage.getItem(storageKey);
      if (existente) {
        claveActual.current = existente;
        return existente;
      }
    } catch { /* el modo privado puede bloquear sessionStorage; la ref sigue siendo suficiente */ }
    const nueva = nuevaClaveIdempotencia();
    claveActual.current = nueva;
    try { sessionStorage.setItem(storageKey, nueva); } catch { /* reintento solo durante esta sesión */ }
    return nueva;
  };

  const cerrarClaveReintento = (): void => {
    claveActual.current = null;
    try { sessionStorage.removeItem(keyStorage(contratoId, cobro.id)); } catch { /* sin almacenamiento de sesión */ }
  };

  const invalidarClaveSiCambiaElPayload = (): void => {
    // Una clave de retry sólo puede acompañar al payload original. Editar
    // cualquier dato abre un intento nuevo, sin falsear la idempotencia.
    cerrarClaveReintento();
  };

  const actualizarEstado = async () => {
    setActualizando(true);
    try { await onActualizado(); }
    finally { setActualizando(false); }
  };

  const puedeAportar = !['RECIBIDO', 'VERIFICADO', 'PAGADO', 'ANULADO', 'DEVUELTO'].includes(cobro.estado);
  const yaEnCurso = actual?.estado === 'PENDIENTE_REVISION' || actual?.estado === 'ACEPTADO' || actual?.estado === 'SUBIENDO';
  if (!puedeAportar || yaEnCurso) {
    if (!actual) return null;
    const textoEstado = actual.estado === 'PENDIENTE_REVISION'
      ? 'Justificante recibido y pendiente de revisión humana.'
      : actual.estado === 'ACEPTADO'
        ? 'Justificante aceptado. Esto no registra el cobro como recibido ni lo concilia con el banco.'
        : actual.estado === 'RECHAZADO'
          ? 'El justificante fue rechazado. Consulta el motivo con gestión.'
          : actual.estado === 'ERROR_SUBIDA'
            ? 'La subida no quedó confirmada. Actualiza el portal antes de reintentar.'
            : 'La subida está en curso. Actualiza el portal antes de iniciar otra.';
    return (
      <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-950" data-testid={`estado-justificante-${cobro.id}`}>
        <p className="font-bold">{textoEstado}</p>
        <p className="mt-1">{actual.nombreArchivo}</p>
        {actual.motivoRevision && <p className="mt-1 text-slate-700">Motivo de gestión: {actual.motivoRevision}</p>}
        <button type="button" onClick={() => void actualizarEstado()} disabled={actualizando} className="mt-2 inline-flex items-center gap-1 font-bold underline disabled:opacity-50">
          {actualizando ? 'Actualizando…' : 'Actualizar estado'}
        </button>
      </div>
    );
  }

  const enviar = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setConfirmacion('');
    if (!archivo) return setError('Selecciona el justificante (PDF, PNG o JPEG).');
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(archivo.type)) {
      return setError('El archivo debe ser un PDF, PNG o JPEG válido.');
    }
    if (archivo.size <= 0 || archivo.size > MAX_BYTES) return setError('El archivo debe pesar como máximo 4 MiB.');
    const importeDeclarado = parsearImporte(importe);
    if (!importeDeclarado) return setError('Indica el importe exacto que aparece en el comprobante.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setError('Indica la fecha que figura en el comprobante.');
    if (!metodo) return setError('Selecciona el método de pago declarado.');

    setEnviando(true);
    try {
      // Un rechazo anterior inicia un intento nuevo y trazable (misma evidencia
      // histórica, nueva clave; no se elimina ni se reutiliza la decisión previa).
      if (actual?.estado === 'RECHAZADO') cerrarClaveReintento();
      const resultado = await presentarJustificanteCobro({
        contratoId,
        cobroPeriodoId: cobro.id,
        claveIdempotencia: claveReintento(),
        archivo,
        importeDeclarado,
        fechaPagoDeclarada: fecha,
        metodoPagoDeclarado: metodo,
      });
      setRespuestaLocal(resultado.justificante);
      cerrarClaveReintento();
      setArchivo(null);
      setImporte('');
      setFecha('');
      setMetodo('');
      setConfirmacion(resultado.duplicada
        ? 'Este envío ya estaba registrado; no se creó un duplicado.'
        : 'El justificante se recibió para revisión. El cobro y su conciliación no se modificaron.');
      void onActualizado().catch(() => undefined);
    } catch (err) {
      const mensaje = err instanceof ErrorApiJustificantesCobro
        ? err.message
        : 'No se pudo confirmar la operación. Conserva el mismo archivo y datos si reintentas.';
      setError(mensaje);
      // Mantiene la clave de idempotencia ante timeouts; si el servidor alcanzó
      // Storage, el mismo reintento recupera el objeto y no vuelve a crear otro.
      if (err instanceof ErrorApiJustificantesCobro && err.status === 409 && err.codigo === 'JUSTIFICANTE_EN_CURSO') {
        void onActualizado().catch(() => undefined);
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid={`form-justificante-${cobro.id}`}>
      <div>
        <p className="text-xs font-extrabold text-slate-800">Presentar justificante</p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-600">
          Gestión revisará el documento. Enviarlo o aceptarlo no marca el dinero como recibido ni concilia una operación bancaria.
        </p>
      </div>
      {actual?.estado === 'RECHAZADO' && (
        <div role="status" className="rounded-lg bg-rose-50 p-2 text-[11px] text-rose-800">
          Rechazado: {actual.motivoRevision || 'consulta el motivo con gestión'}. Puedes presentar una nueva versión; la anterior queda auditada.
        </div>
      )}
      {actual?.estado === 'ERROR_SUBIDA' && (
        <div role="status" className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">
          La subida no quedó confirmada. Si el resultado fue incierto, reintenta con el mismo archivo y los mismos datos.
        </div>
      )}
      <label className="block text-[11px] font-semibold text-slate-700">
        Archivo (PDF, JPEG o PNG · máximo 4 MiB)
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
          onChange={(e) => {
            const siguiente = e.target.files?.[0] || null;
            if (siguiente?.name !== archivo?.name || siguiente?.size !== archivo?.size || siguiente?.lastModified !== archivo?.lastModified) {
              invalidarClaveSiCambiaElPayload();
            }
            setArchivo(siguiente);
          }}
          disabled={enviando}
          className="mt-1 block w-full text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-indigo-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-indigo-800"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] font-semibold text-slate-700">
          Importe declarado (€)
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={importe}
            onChange={(e) => {
              if (e.target.value !== importe) invalidarClaveSiCambiaElPayload();
              setImporte(e.target.value);
            }}
            placeholder="Ej. 850,00"
            disabled={enviando}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-700">
          Fecha declarada
          <input
            type="date"
            value={fecha}
            onChange={(e) => {
              if (e.target.value !== fecha) invalidarClaveSiCambiaElPayload();
              setFecha(e.target.value);
            }}
            disabled={enviando}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal"
          />
        </label>
      </div>
      <label className="block text-[11px] font-semibold text-slate-700">
        Método declarado
        <select
          value={metodo}
          onChange={(e) => {
            if (e.target.value !== metodo) invalidarClaveSiCambiaElPayload();
            setMetodo(e.target.value as typeof metodo);
          }}
          disabled={enviando}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm font-normal"
        >
          <option value="">Selecciona…</option>
          {METODOS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
        </select>
      </label>
      {error && <p role="alert" className="flex gap-1.5 text-[11px] font-semibold text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      {confirmacion && <p role="status" className="flex gap-1.5 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{confirmacion}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-3 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-800 disabled:cursor-wait disabled:opacity-60"
      >
        {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {enviando ? 'Enviando…' : actual?.estado === 'ERROR_SUBIDA' ? 'Reintentar subida' : 'Enviar a gestión'}
      </button>
    </form>
  );
};
