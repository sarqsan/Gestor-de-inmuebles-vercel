import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, Check, FileText, Loader2, ScanLine, X } from 'lucide-react';
import type { CategoriaGasto, Gasto, Inmueble, UsuarioApp } from '../../types';
import { CATEGORIAS_GASTO } from '../../utils/gastosEngine';
import { subirDocumentoPatrimonial } from '../../lib/expedienteDocumental/gestorFirebase';
import type { CamposFacturaOcr, CampoFacturaOcr, CampoReconocidoOcr } from '../../lib/ocrFactura';
import { esArchivoOcrAdmitido, extraerCamposFactura, huellaFacturaOcr, reconocerDocumentoLocal } from '../../lib/ocrFactura';
import { construirGastoOcr, construirClaveOcr, confirmarGastoConFactura, duplicadoFacturaOcr, idGastoOcr, importeDesdeTexto } from '../../lib/flujoFacturaOcr';
import { useDialogoAccesible } from '../../accesibilidad/dialogo';

interface Props {
  gastos: Gasto[];
  inmuebles: Inmueble[];
  currentUser?: UsuarioApp | null;
  onSave: (gasto: Gasto) => Promise<Gasto | void> | Gasto | void;
  onDelete: (gastoId: string) => Promise<void> | void;
  onClose: () => void;
}

const ETIQUETAS: Record<CampoFacturaOcr, string> = {
  proveedor: 'Proveedor / razón social', nifProveedor: 'NIF/CIF del proveedor', numeroFactura: 'Número de factura', fechaEmision: 'Fecha de emisión',
  baseImponible: 'Base imponible (€)', tipoIva: 'Tipo de IVA (%)', importeIva: 'Importe de IVA (€)', otrosImpuestos: 'Otros impuestos / retenciones (€)', importeTotal: 'Importe total (€)', concepto: 'Concepto / descripción',
};
const CAMPOS: CampoFacturaOcr[] = ['proveedor', 'nifProveedor', 'numeroFactura', 'fechaEmision', 'baseImponible', 'tipoIva', 'importeIva', 'otrosImpuestos', 'importeTotal', 'concepto'];
const vacío = (): CamposFacturaOcr => Object.fromEntries(CAMPOS.map((key) => [key, { valor: '', estado: 'AUSENTE' }])) as CamposFacturaOcr;
const fechaISOValida = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const fecha = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === s;
};

export const EscanerFacturaModal: React.FC<Props> = ({ gastos, inmuebles, currentUser, onSave, onDelete, onClose }) => {
  const { refDialogo, propsDialogo } = useDialogoAccesible({ abierto: true, onCerrar: onClose }, 'Escanear factura');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [camposOcr, setCamposOcr] = useState<CamposFacturaOcr>(vacío);
  const [valores, setValores] = useState<Record<CampoFacturaOcr, string>>(() => Object.fromEntries(CAMPOS.map((key) => [key, ''])) as Record<CampoFacturaOcr, string>);
  const [textoOcr, setTextoOcr] = useState('');
  const [confianza, setConfianza] = useState(0);
  const [huella, setHuella] = useState('');
  const [inmuebleId, setInmuebleId] = useState(inmuebles.length === 1 ? inmuebles[0].id : '');
  const [categoria, setCategoria] = useState<CategoriaGasto>('OTRO');
  const [aCargoDe, setACargoDe] = useState<Gasto['aCargoDe'] | ''>('');
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const camposClave = useMemo(() => {
    const ajustados = { ...camposOcr };
    ajustados.nifProveedor = { ...ajustados.nifProveedor, valor: valores.nifProveedor };
    ajustados.numeroFactura = { ...ajustados.numeroFactura, valor: valores.numeroFactura };
    return ajustados;
  }, [camposOcr, valores.nifProveedor, valores.numeroFactura]);
  const clave = huella ? construirClaveOcr(camposClave, huella) : '';
  const duplicado = clave ? duplicadoFacturaOcr(gastos, clave, huella) : undefined;
  const puedeReintentarVinculo = Boolean(
    duplicado && clave && duplicado.id === idGastoOcr(clave)
    && !duplicado.facturaOcr?.documentoId && !duplicado.documento?.id,
  );
  useEffect(() => {
    if (puedeReintentarVinculo && duplicado?.inmuebleId && inmuebleId !== duplicado.inmuebleId) {
      setInmuebleId(duplicado.inmuebleId);
    }
  }, [puedeReintentarVinculo, duplicado?.inmuebleId, inmuebleId]);
  const propietario = inmuebles.find((i) => i.id === inmuebleId);

  const analizarArchivo = async (seleccionado: File) => {
    setError(''); setMensaje(''); setTextoOcr(''); setCamposOcr(vacío()); setValores(Object.fromEntries(CAMPOS.map((key) => [key, ''])) as Record<CampoFacturaOcr, string>);
    const problema = esArchivoOcrAdmitido(seleccionado);
    if (problema) { setError(problema); setArchivo(null); return; }
    const extension = seleccionado.name.split('.').pop()?.toLowerCase();
    const tipo = seleccionado.type || ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[extension || ''] || '';
    const valido = new File([seleccionado], seleccionado.name, { type: tipo, lastModified: seleccionado.lastModified });
    setArchivo(valido); setOcupado(true); setProgreso(0);
    try {
      const [resultado, bytes] = await Promise.all([
        reconocerDocumentoLocal(valido, setProgreso), valido.arrayBuffer(),
      ]);
      const reconocidos = extraerCamposFactura(resultado.texto, resultado.confianza);
      setTextoOcr(resultado.texto); setConfianza(resultado.confianza); setCamposOcr(reconocidos);
      setValores(Object.fromEntries(CAMPOS.map((key) => [key, reconocidos[key].valor])) as Record<CampoFacturaOcr, string>);
      setHuella(await huellaFacturaOcr(new Uint8Array(bytes)));
      if (resultado.confianza < 50) setMensaje('La lectura es de baja confianza. Revisa con cuidado cada dato antes de confirmar.');
    } catch (e) {
      setArchivo(null);
      setError(e instanceof Error ? e.message : 'No se pudo leer el documento.');
    } finally { setOcupado(false); }
  };

  const cambiar = (campo: CampoFacturaOcr, valor: string) => setValores((prev) => ({ ...prev, [campo]: valor }));
  const campoVisual = (campo: CampoFacturaOcr) => {
    const estado: CampoReconocidoOcr['estado'] = !camposOcr[campo]?.valor ? 'AUSENTE' : camposOcr[campo].estado;
    return <label key={campo} className="block text-xs">
      <span className="mb-1 flex items-center justify-between gap-2 font-semibold text-slate-700">
        {ETIQUETAS[campo]}
        <span className={`text-[10px] font-bold ${estado === 'RECONOCIDO' ? 'text-emerald-700' : estado === 'DUDOSO' ? 'text-amber-700' : 'text-rose-700'}`}>
          {estado === 'RECONOCIDO' ? 'Reconocido' : estado === 'DUDOSO' ? 'Revisar' : 'No encontrado'}
        </span>
      </span>
      <input type={campo === 'fechaEmision' && /^\d{4}-\d{2}-\d{2}$/.test(valores[campo]) ? 'date' : 'text'} value={valores[campo]} onChange={(e) => cambiar(campo, e.target.value)} maxLength={campo === 'concepto' ? 200 : 120} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
    </label>;
  };

  const confirmar = async () => {
    setError(''); setMensaje('');
    if (!archivo || !huella) { setError('Selecciona y procesa un documento antes de continuar.'); return; }
    if (!propietario) { setError('Selecciona el inmueble relacionado.'); return; }
    if (!aCargoDe) { setError('Indica quién asume el gasto según el documento o la decisión de gestión.'); return; }
    const total = importeDesdeTexto(valores.importeTotal);
    if (total === undefined || total <= 0) { setError('Revisa el importe total; debe ser un importe numérico mayor que cero.'); return; }
    if (valores.fechaEmision && !fechaISOValida(valores.fechaEmision)) { setError('La fecha de emisión no es válida.'); return; }
    const claveFinal = construirClaveOcr(camposClave, huella);
    const repetido = duplicadoFacturaOcr(gastos, claveFinal, huella);
    if (repetido && repetido.id !== idGastoOcr(claveFinal)) { setError('Ya existe un gasto con este documento o número de factura. No se ha creado otro.'); return; }
    const confirmado = {
      inmuebleId: propietario.id,
      concepto: valores.concepto.trim(),
      proveedor: valores.proveedor.trim(),
      importeTotal: total,
      categoria,
      aCargoDe,
      fechaEmision: valores.fechaEmision || undefined,
      numeroFactura: valores.numeroFactura.trim() || undefined,
      nifProveedor: valores.nifProveedor.trim() || undefined,
      baseImponible: importeDesdeTexto(valores.baseImponible),
      tipoIva: importeDesdeTexto(valores.tipoIva),
      importeIva: importeDesdeTexto(valores.importeIva),
      otrosImpuestos: importeDesdeTexto(valores.otrosImpuestos),
    };
    if (!confirmado.concepto) { setError('Escribe o confirma el concepto de la factura.'); return; }
    setOcupado(true); setConfirmando(true);
    try {
      const base = construirGastoOcr({ datos: confirmado, camposReconocidos: camposOcr, confianzaOcr: confianza, sha256Documento: huella, claveDeduplicacion: claveFinal, inmueble: propietario, creadoPor: currentUser?.nombre, creadoPorId: currentUser?.id });
      await confirmarGastoConFactura({
        gasto: base,
        guardarGasto: onSave,
        eliminarGasto: onDelete,
        subirDocumento: async (gasto) => {
          const resultado = await subirDocumentoPatrimonial({
            inmuebleId: propietario.id,
            tipo: 'FACTURA_GASTO',
            archivo,
            fechaDocumental: confirmado.fechaEmision,
            relaciones: { gastoId: gasto.id },
            referencia: confirmado.numeroFactura || '',
            observaciones: `OCR local revisado; confianza global ${confianza}%.`,
            actorNombre: currentUser?.nombre || currentUser?.email || 'Usuario',
          });
          return resultado.documento;
        },
      });
      setMensaje('Factura incorporada al expediente del inmueble y al flujo canónico de gastos. El gasto queda pendiente; no se registra ningún pago.');
      window.setTimeout(onClose, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo incorporar la factura. No se muestra como completada.');
    } finally { setOcupado(false); setConfirmando(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm">
    <div ref={refDialogo} {...propsDialogo} className="my-auto flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <header className="flex items-center justify-between border-b bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-100 p-2 text-indigo-700"><ScanLine className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-900">Escanear factura</h2><p className="text-xs text-slate-500">OCR local · revisión antes de guardar</p></div></div>
        <button type="button" aria-label="Cerrar" onClick={onClose} disabled={confirmando} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 disabled:opacity-40"><X className="h-5 w-5" /></button>
      </header>
      <div className="overflow-y-auto p-5">
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-xs text-indigo-950">
          El reconocimiento se procesa en este navegador con Tesseract; ni el archivo ni el texto OCR se envían a un proveedor de IA. La primera ejecución descarga el motor y el idioma español desde una CDN pública. Sólo al confirmar se sube el original al expediente seguro P3 del inmueble elegido. PDF e imágenes · máximo 20 MB y 5 páginas.
        </div>
        <label onClick={(e) => { if (ocupado) e.preventDefault(); }} className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 hover:border-indigo-400">
          <Camera className="h-6 w-6 text-indigo-600" /><span className="flex-1"><strong className="block text-sm">Selecciona o captura una factura</strong><small className="text-xs text-slate-500">PDF, JPG, PNG o WEBP</small></span>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" capture="environment" disabled={ocupado} className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) void analizarArchivo(file); e.currentTarget.value = ''; }} />
        </label>
        {ocupado && <div className="mb-4 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{confirmando ? 'Guardando gasto y documento en el expediente seguro…' : `Reconociendo documento localmente (${progreso}%)…`}</span><div className="mt-2 h-1.5 overflow-hidden rounded bg-indigo-100"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progreso}%` }} /></div></div>}
        {error && <div role="alert" className="mb-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        {mensaje && <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{mensaje}</div>}
        {archivo && textoOcr && <>
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-600"><FileText className="h-4 w-4" /><strong>{archivo.name}</strong><span>· Confianza global: {confianza}%</span></div>
          <fieldset className="mb-4 rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-bold text-slate-900">1. Revisa y corrige los datos reconocidos</legend>
            <p className="mb-3 text-xs text-slate-500">“Reconocido”, “Revisar” y “No encontrado” describen el resultado OCR, no una validación contable. Los valores editados que confirmes se guardarán por separado.</p>
            <div className="grid gap-3 sm:grid-cols-2">{CAMPOS.map(campoVisual)}</div>
          </fieldset>
          <fieldset className="mb-4 grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-bold text-slate-900">2. Datos de imputación manual</legend>
            <label className="text-xs font-semibold text-slate-700">Inmueble relacionado *<select required value={inmuebleId} disabled={puedeReintentarVinculo} onChange={(e) => setInmuebleId(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"><option value="">Selecciona el inmueble</option>{inmuebles.map((i) => <option key={i.id} value={i.id}>{i.direccion}{i.ciudad ? `, ${i.ciudad}` : ''}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-700">Categoría de gasto *<select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">{CATEGORIAS_GASTO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-700">Quién asume el gasto *<select required value={aCargoDe} onChange={(e) => setACargoDe(e.target.value as Gasto['aCargoDe'] | '')} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Indica quién asume el gasto</option><option value="arrendador">Propietario / arrendador</option><option value="arrendatario">Inquilino / arrendatario</option></select></label>
            <p className="self-center text-xs text-slate-500">El gasto se crea como PENDIENTE. No se marcará pagado ni se decidirá la deducibilidad fiscal.</p>
          </fieldset>
          {duplicado && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{puedeReintentarVinculo ? `Ya existe el gasto ${duplicado.id} de un intento anterior. Puedes reintentar para completar la referencia al documento sin crear otro gasto.` : `Posible duplicado: ya hay un gasto registrado (${duplicado.id}) con el mismo identificador de factura o archivo. No se permite crear otro.`}</div>}
          <details className="mb-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Texto completo reconocido por OCR</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">{textoOcr}</pre></details>
        </>}
      </div>
      <footer className="flex justify-end gap-2 border-t bg-slate-50 p-4">
        <button type="button" onClick={onClose} disabled={confirmando} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700">Cancelar</button>
        {archivo && textoOcr && <button type="button" onClick={() => void confirmar()} disabled={ocupado || (!!duplicado && !puedeReintentarVinculo) || !valores.importeTotal} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />Confirmar y añadir gasto</button>}
      </footer>
    </div>
  </div>;
};
