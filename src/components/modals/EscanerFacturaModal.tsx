import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, FileText, Loader2, ScanLine, X } from 'lucide-react';
import type { CategoriaGasto, Gasto, Inmueble, UsuarioApp } from '../../types';
import { CATEGORIAS_GASTO } from '../../utils/gastosEngine';
import { subirDocumentoPatrimonial } from '../../lib/expedienteDocumental/gestorFirebase';
import type { CamposFacturaOcr, CampoFacturaOcr, CampoReconocidoOcr } from '../../lib/ocrFactura';
import { esArchivoOcrAdmitido, esErrorOcrCancelado, extraerCamposFactura, huellaFacturaOcr, reconocerDocumentoLocal } from '../../lib/ocrFactura';
import { construirGastoOcr, construirClaveOcr, confirmarGastoConFactura, esReintentoVinculoOcr, evaluarDuplicadosFacturaOcr, importeDesdeTexto } from '../../lib/flujoFacturaOcr';
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

export const MENSAJE_ABONO_NO_ADMITIDO = 'El importe total es negativo: parece una factura de abono o rectificativa. El escáner no crea gastos en negativo ni movimientos de devolución automáticos; regístrala manualmente para reflejarla como corresponda. No se ha guardado nada.';

/** P5.4: nunca se sobrescribe un alta ANULADA; se pide reactivación explícita. */
export const MENSAJE_FACTURA_ANULADA = 'Esta factura ya tiene un gasto ANULADO en este inmueble. No se sobrescribirá: reactívalo desde Gastos (estado «Pendiente») si debe volver a estar activo y, si le falta la factura, vuelve a procesarla. No se ha creado ni modificado ningún gasto.';

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
  const [previewUrl, setPreviewUrl] = useState('');
  // P5.2-D: cancelación real del reconocimiento (botón, cierre o desmontaje).
  const cancelacionRef = useRef<AbortController | null>(null);

  useEffect(() => () => { cancelacionRef.current?.abort(); }, []);

  // Vista local del original para contrastar campos (URL efímera del propio
  // archivo elegido; nunca se persiste ni se presenta como custodia).
  useEffect(() => {
    if (!archivo || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') { setPreviewUrl(''); return; }
    // La vista previa es accesoria: si el entorno no puede crearla, se omite
    // sin bloquear la lectura ni la revisión.
    let url = '';
    try { url = URL.createObjectURL(archivo); } catch { setPreviewUrl(''); return; }
    setPreviewUrl(url);
    return () => { try { URL.revokeObjectURL(url); } catch { /* sin efecto */ } };
  }, [archivo]);

  const camposClave = useMemo(() => {
    const ajustados = { ...camposOcr };
    ajustados.nifProveedor = { ...ajustados.nifProveedor, valor: valores.nifProveedor };
    ajustados.numeroFactura = { ...ajustados.numeroFactura, valor: valores.numeroFactura };
    return ajustados;
  }, [camposOcr, valores.nifProveedor, valores.numeroFactura]);
  // P5.2-C: la identidad del alta incluye el inmueble; la forma legada P5
  // sigue reconociéndose para completar enlaces de gastos antiguos.
  const claveLegada = huella ? construirClaveOcr(camposClave, huella) : '';
  const clave = huella ? construirClaveOcr(camposClave, huella, inmuebleId || undefined) : '';
  const evaluacion = huella && inmuebleId
    ? evaluarDuplicadosFacturaOcr(gastos, {
      clave,
      sha256: huella,
      inmuebleId,
      importeTotal: importeDesdeTexto(valores.importeTotal),
      fechaEmision: fechaISOValida(valores.fechaEmision) ? valores.fechaEmision : undefined,
      proveedor: valores.proveedor,
    })
    : undefined;
  const duplicado = evaluacion?.exacto;
  // P5.4: un alta OCR ANULADA comparte ID estable con el alta nueva; reescanear
  // la resucitaría. Se bloquea y se guía a una reactivación explícita.
  const anulado = evaluacion?.anulado;
  const posibles = evaluacion?.posibles || [];
  const puedeReintentarVinculo = esReintentoVinculoOcr(duplicado, clave, claveLegada);
  const propietario = inmuebles.find((i) => i.id === inmuebleId);

  const analizarArchivo = async (seleccionado: File) => {
    cancelacionRef.current?.abort();
    const cancelacion = new AbortController();
    cancelacionRef.current = cancelacion;
    setError(''); setMensaje(''); setTextoOcr(''); setHuella(''); setCamposOcr(vacío()); setValores(Object.fromEntries(CAMPOS.map((key) => [key, ''])) as Record<CampoFacturaOcr, string>);
    const problema = esArchivoOcrAdmitido(seleccionado);
    if (problema) { setError(problema); setArchivo(null); return; }
    const extension = seleccionado.name.split('.').pop()?.toLowerCase();
    const tipo = seleccionado.type || ({ pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[extension || ''] || '';
    const valido = new File([seleccionado], seleccionado.name, { type: tipo, lastModified: seleccionado.lastModified });
    setArchivo(valido); setOcupado(true); setProgreso(0);
    try {
      const [resultado, bytes] = await Promise.all([
        reconocerDocumentoLocal(valido, setProgreso, { senal: cancelacion.signal }), valido.arrayBuffer(),
      ]);
      const reconocidos = extraerCamposFactura(resultado.texto, resultado.confianza);
      setTextoOcr(resultado.texto); setConfianza(resultado.confianza); setCamposOcr(reconocidos);
      setValores(Object.fromEntries(CAMPOS.map((key) => [key, reconocidos[key].valor])) as Record<CampoFacturaOcr, string>);
      setHuella(await huellaFacturaOcr(new Uint8Array(bytes)));
      if (resultado.confianza < 50) setMensaje('La lectura es de baja confianza. Revisa con cuidado cada dato antes de confirmar.');
    } catch (e) {
      // Se conserva el archivo seleccionado para poder reintentar la lectura.
      if (esErrorOcrCancelado(e)) {
        setMensaje('Lectura cancelada. Puedes reintentarlo o elegir otro archivo. No se ha guardado nada.');
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo leer el documento.');
      }
    } finally { setOcupado(false); }
  };

  const cancelarLectura = () => { cancelacionRef.current?.abort(); };

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
    // P5.2-D: abonos/rectificativas quedan fuera del alta automática de gasto.
    if (total !== undefined && total < 0) { setError(MENSAJE_ABONO_NO_ADMITIDO); return; }
    if (total === undefined || total <= 0) { setError('Revisa el importe total; debe ser un importe numérico mayor que cero.'); return; }
    if (valores.fechaEmision && !fechaISOValida(valores.fechaEmision)) { setError('La fecha de emisión no es válida.'); return; }
    // P5.2-C + defensa en la función que escribe (no solo en el botón)
    const evaluacionFinal = evaluarDuplicadosFacturaOcr(gastos, {
      clave: construirClaveOcr(camposClave, huella, propietario.id),
      sha256: huella,
      inmuebleId: propietario.id,
      importeTotal: total,
      fechaEmision: valores.fechaEmision || undefined,
      proveedor: valores.proveedor,
    });
    if (evaluacionFinal.anulado) { setError(MENSAJE_FACTURA_ANULADA); return; }
    const repetido = evaluacionFinal.exacto;
    const esReintento = esReintentoVinculoOcr(repetido, construirClaveOcr(camposClave, huella, propietario.id), claveLegada);
    if (repetido && !esReintento) { setError('Ya existe un gasto con este documento o número de factura en este inmueble. No se ha creado ni modificado ningún gasto.'); return; }
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
      // En un reintento se reutiliza la clave que el gasto ya almacenó (y por
      // tanto su ID estable): completar el enlace no debe crear otro gasto.
      const claveNueva = construirClaveOcr(camposClave, huella, propietario.id);
      const claveFinal = esReintento && repetido?.facturaOcr?.claveDeduplicacion ? repetido.facturaOcr.claveDeduplicacion : claveNueva;
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
        {ocupado && <div className="mb-4 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-800"><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{confirmando ? 'Guardando gasto y documento en el expediente seguro…' : `Reconociendo documento localmente (${progreso}%)…`}</span><div className="mt-2 h-1.5 overflow-hidden rounded bg-indigo-100"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progreso}%` }} /></div>{!confirmando && <button type="button" onClick={cancelarLectura} className="mt-2 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-indigo-800">Cancelar lectura</button>}</div>}
        {archivo && !textoOcr && !ocupado && (error || mensaje) && <div className="mb-4"><button type="button" onClick={() => void analizarArchivo(archivo)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Reintentar lectura del mismo archivo</button></div>}
        {error && <div role="alert" className="mb-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        {mensaje && <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{mensaje}</div>}
        {archivo && textoOcr && <>
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-600"><FileText className="h-4 w-4" /><strong>{archivo.name}</strong><span>· Confianza global: {confianza}%</span></div>
          {previewUrl && <div className="mb-4 rounded-xl border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-700">Documento original (vista local para contrastar; aún no está guardado)</p>
            {archivo.type.startsWith('image/')
              ? <img src={previewUrl} alt={`Factura escaneada ${archivo.name}`} className="max-h-72 w-auto rounded-lg border border-slate-200 object-contain" />
              : <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-700">Abrir el PDF original en otra pestaña</a>}
          </div>}
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
          {duplicado && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{puedeReintentarVinculo ? `Ya existe el gasto ${duplicado.id} de un intento anterior sin el enlace al documento. Puedes reintentar para completar la referencia al documento sin crear otro gasto.` : `Duplicado: esta factura ya está registrada en este inmueble (gasto ${duplicado.id}). No se creará ni modificará ningún gasto.`}</div>}
          {anulado && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{MENSAJE_FACTURA_ANULADA} (gasto {anulado.id})</div>}
          {posibles.length > 0 && <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <strong>Posibles coincidencias para revisar</strong> (no bloquean el alta ni modifican esos gastos):
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {posibles.slice(0, 3).map((g) => <li key={g.id}>{g.inmuebleId === inmuebleId ? 'Este inmueble' : 'Otro inmueble'} · «{g.concepto}» · {g.importe} €{g.facturaOcr ? ' · alta OCR con la misma factura' : ' · gasto manual con importe/fecha/proveedor coincidentes'} ({g.id})</li>)}
            </ul>
            <span>Confirma solo si has comprobado que no es la misma factura ya registrada.</span>
          </div>}
          <details className="mb-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Texto completo reconocido por OCR</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600">{textoOcr}</pre></details>
        </>}
      </div>
      <footer className="flex justify-end gap-2 border-t bg-slate-50 p-4">
        <button type="button" onClick={onClose} disabled={confirmando} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700">Cancelar</button>
        {archivo && textoOcr && <button type="button" onClick={() => void confirmar()} disabled={ocupado || !!anulado || (!!duplicado && !puedeReintentarVinculo) || !valores.importeTotal} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />Confirmar y añadir gasto</button>}
      </footer>
    </div>
  </div>;
};
