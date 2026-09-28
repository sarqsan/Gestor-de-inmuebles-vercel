import React, { useMemo, useRef, useState } from 'react';
import { Download, FilePlus2, Pencil, Trash2 } from 'lucide-react';
import type { ContratoFormalizacion, Gasto, GarantiaReparacion, Incidencia, Inmueble, PolizaSeguro, TareaMantenimiento, UsuarioApp } from '../../types';
import {
  actualizarMetadatosDocumentoPatrimonial,
  descargarDocumentoPatrimonial,
  eliminarDocumentoPatrimonial,
  subirDocumentoPatrimonial,
} from '../../lib/expedienteDocumental/gestorFirebase';
import type { DocumentoPatrimonial, TipoDocumentoExpediente } from '../../lib/expedienteDocumental/tipos';
import { confirmar } from '../../feedback/confirmacion';
import { avisarOperacion } from '../../feedback/canalFeedback';
import { mensajeDeErrorUsuario } from '../../feedback/mensajes';

const TIPOS: { value: TipoDocumentoExpediente; label: string }[] = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'ANEXO_CONTRATO', label: 'Anexo de contrato' },
  { value: 'FACTURA_GASTO', label: 'Factura de gasto' },
  { value: 'JUSTIFICANTE_PAGO_GASTO', label: 'Comprobante de gasto/pago' },
  { value: 'JUSTIFICANTE_COBRO', label: 'Justificante de cobro' },
  { value: 'RECIBO', label: 'Recibo' },
  { value: 'POLIZA_SEGURO', label: 'Póliza de seguro' },
  { value: 'DOCUMENTO_POLIZA', label: 'Documento de póliza' },
  { value: 'DOCUMENTO_RENOVACION_POLIZA', label: 'Renovación de póliza' },
  { value: 'LIQUIDACION_IBI', label: 'IBI' },
  { value: 'TASA', label: 'Tasa o tributo' },
  { value: 'FOTO_INCIDENCIA', label: 'Fotografía de incidencia' },
  { value: 'DOCUMENTO_INCIDENCIA', label: 'Incidencia/reparación' },
  { value: 'DOCUMENTO_MANTENIMIENTO', label: 'Mantenimiento' },
  { value: 'DOCUMENTO_GARANTIA', label: 'Garantía' },
  { value: 'DOCUMENTO_INVENTARIO', label: 'Inventario' },
  { value: 'OTRO', label: 'Administración / otro' },
];

interface Props {
  inmueble: Inmueble;
  currentUser?: UsuarioApp | null;
  contratos: ContratoFormalizacion[];
  gastos: Gasto[];
  incidencias: Incidencia[];
  polizas: PolizaSeguro[];
  tareas: TareaMantenimiento[];
  garantias: GarantiaReparacion[];
  documentos: DocumentoPatrimonial[];
}

function opcionesRelacion(props: Props): { value: string; label: string }[] {
  return [
    ...props.contratos.filter((x) => x.inmuebleId === props.inmueble.id).map((x) => ({ value: `contrato:${x.id}`, label: `Contrato · ${x.id}` })),
    ...props.gastos.filter((x) => x.inmuebleId === props.inmueble.id && x.estado !== 'ANULADO').map((x) => ({ value: `gasto:${x.id}`, label: `Gasto/operación · ${x.concepto}` })),
    ...props.incidencias.filter((x) => x.inmuebleId === props.inmueble.id).map((x) => ({ value: `incidencia:${x.id}`, label: `Incidencia · ${x.titulo}` })),
    ...props.polizas.filter((x) => x.inmuebleId === props.inmueble.id).map((x) => ({ value: `poliza:${x.id}`, label: `Póliza · ${x.aseguradora} ${x.numeroPoliza}` })),
    ...props.tareas.filter((x) => x.inmuebleId === props.inmueble.id).map((x) => ({ value: `tarea:${x.id}`, label: `Mantenimiento · ${x.titulo}` })),
    ...props.garantias.filter((x) => x.inmuebleId === props.inmueble.id).map((x) => ({ value: `garantia:${x.id}`, label: `Garantía · ${x.titulo}` })),
  ];
}

function relacionesDeSeleccion(value: string) {
  if (!value) return {};
  const [tipo, id] = value.split(':', 2);
  if (tipo === 'gasto') return { gastoId: id, movimientoId: `GASTO:${id}` };
  if (tipo === 'contrato') return { contratoId: id };
  if (tipo === 'incidencia') return { incidenciaId: id };
  if (tipo === 'poliza') return { polizaId: id };
  if (tipo === 'tarea') return { tareaMantenimientoId: id };
  if (tipo === 'garantia') return { garantiaId: id };
  return {};
}

export const DocumentosPatrimonialesPanel: React.FC<Props> = (props) => {
  const [tipo, setTipo] = useState<TipoDocumentoExpediente>('OTRO');
  const [relacion, setRelacion] = useState('');
  const [fechaDocumental, setFechaDocumental] = useState('');
  const [referencia, setReferencia] = useState('');
  const [facturaId, setFacturaId] = useState('');
  const [sustituyeA, setSustituyeA] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const relaciones = useMemo(() => opcionesRelacion(props), [props.inmueble.id, props.contratos, props.gastos, props.incidencias, props.polizas, props.tareas, props.garantias]);

  const subir = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!archivo || ocupado) return;
    setOcupado(true); setError(''); setMensaje('');
    try {
      const resultado = await subirDocumentoPatrimonial({
        inmuebleId: props.inmueble.id,
        tipo,
        archivo,
        fechaDocumental: fechaDocumental || undefined,
        relaciones: { ...relacionesDeSeleccion(relacion), ...(facturaId.trim() ? { facturaId: facturaId.trim() } : {}) },
        sustituyeA: sustituyeA || undefined,
        referencia,
        actorNombre: props.currentUser?.nombre || props.currentUser?.email || 'Usuario',
      });
      setMensaje(resultado.duplicado ? 'El mismo archivo ya constaba; se reutilizó su referencia.' : 'Documento incorporado y auditado.');
      setArchivo(null);
      formRef.current?.reset();
      setTipo('OTRO'); setRelacion(''); setFechaDocumental(''); setReferencia(''); setFacturaId(''); setSustituyeA('');
    } catch (e) {
      setError(mensajeDeErrorUsuario(e, 'No se pudo incorporar el documento.'));
    } finally { setOcupado(false); }
  };

  const descargar = async (documento: DocumentoPatrimonial) => {
    setError('');
    try {
      const result = await descargarDocumentoPatrimonial(props.inmueble.id, documento.id);
      const url = URL.createObjectURL(new Blob([result.blob], { type: result.mimeType }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.nombre; anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(mensajeDeErrorUsuario(e, 'No se pudo recuperar el archivo.')); }
  };

  const editar = async (documento: DocumentoPatrimonial) => {
    const { confirmado: confirmarReferencia, texto: nuevaReferencia } = await confirmar({
      titulo: 'Editar documento',
      mensaje: 'Actualiza la referencia documental del expediente.',
      etiquetaConfirmar: 'Continuar',
      peligroso: false,
      entradaTexto: {
        etiqueta: 'Referencia documental',
        valorInicial: documento.referencia || '',
      },
    });
    if (!confirmarReferencia) return;
    const { confirmado: confirmarObservaciones, texto: observaciones } = await confirmar({
      titulo: 'Editar documento',
      mensaje: 'Añade o actualiza las observaciones del documento.',
      etiquetaConfirmar: 'Guardar metadatos',
      peligroso: false,
      entradaTexto: {
        etiqueta: 'Observaciones',
        valorInicial: documento.observaciones || '',
      },
    });
    if (!confirmarObservaciones) return;
    try {
      await actualizarMetadatosDocumentoPatrimonial(props.inmueble.id, documento.id, {
        tipo: documento.tipo, nombre: documento.nombre, fechaDocumental: documento.fechaDocumental,
        referencia: nuevaReferencia, observaciones,
      }, props.currentUser?.nombre || props.currentUser?.email || 'Usuario');
      setMensaje('Metadatos actualizados y auditados.'); setError('');
    } catch (e) { setError(mensajeDeErrorUsuario(e, 'No se pudieron guardar los metadatos.')); }
  };

  const eliminar = async (documento: DocumentoPatrimonial) => {
    const { confirmado } = await confirmar({
      titulo: 'Eliminar documento',
      mensaje: `¿Eliminar «${documento.nombre}»?`,
      detalle: 'Se borrará el archivo y se conservará la traza de auditoría.',
      etiquetaConfirmar: 'Eliminar',
      peligroso: true,
      alConfirmar: async () => {
        try {
          await eliminarDocumentoPatrimonial(props.inmueble.id, documento.id, props.currentUser?.nombre || props.currentUser?.email || 'Usuario');
          avisarOperacion({ tipo: 'exito', mensaje: 'Documento eliminado; su traza de auditoría se conserva.' });
          setMensaje('Documento eliminado. Se conserva el registro de auditoría.'); setError('');
        } catch (e) {
          const mensaje = mensajeDeErrorUsuario(e, 'No se ha podido eliminar el documento.');
          avisarOperacion({ tipo: 'error', mensaje });
          setError(mensaje);
          throw new Error(mensaje);
        }
      },
    });
    return confirmado;
  };

  return <section className="border border-indigo-100 bg-indigo-50/30 rounded-xl p-4 space-y-3">
    <div>
      <h4 className="font-bold text-slate-800 text-sm">Gestión documental patrimonial</h4>
      <p className="text-[11px] text-slate-500 mt-0.5">Metadatos en el expediente del inmueble; binarios privados en Storage. Los importes y cálculos permanecen en gastos, facturas y operaciones.</p>
    </div>
    <form ref={formRef} onSubmit={subir} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
      <label className="text-[10px] font-bold text-slate-500">Archivo (PDF/JPEG/PNG/WEBP, máx. 20 MB)
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className="block w-full mt-1 text-[10px]" />
      </label>
      <label className="text-[10px] font-bold text-slate-500">Categoría
        <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumentoExpediente)} className="block w-full mt-1 px-2 py-2 border rounded-lg text-xs bg-white">
          {TIPOS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </label>
      <label className="text-[10px] font-bold text-slate-500">Relacionar con
        <select value={relacion} onChange={(e) => setRelacion(e.target.value)} className="block w-full mt-1 px-2 py-2 border rounded-lg text-xs bg-white">
          <option value="">Sólo inmueble</option>
          {relaciones.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </label>
      <label className="text-[10px] font-bold text-slate-500">Fecha documental
        <input type="date" value={fechaDocumental} onChange={(e) => setFechaDocumental(e.target.value)} className="block w-full mt-1 px-2 py-2 border rounded-lg text-xs bg-white" />
      </label>
      <button disabled={!archivo || ocupado} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1">
        <FilePlus2 className="w-3.5 h-3.5" /> {ocupado ? 'Guardando…' : 'Añadir documento'}
      </button>
      <label className="sm:col-span-2 text-[10px] font-bold text-slate-500">Factura existente (ID, opcional)
        <input value={facturaId} onChange={(e) => setFacturaId(e.target.value)} maxLength={160} placeholder="No se crea ni modifica la factura" className="block w-full mt-1 px-2 py-2 border rounded-lg text-xs bg-white" />
      </label>
      <label className="sm:col-span-3 text-[10px] font-bold text-slate-500">Referencia documental
        <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={160} placeholder="Nº factura, expediente, referencia catastral…" className="block w-full mt-1 px-2 py-2 border rounded-lg text-xs bg-white" />
      </label>
      <label className="sm:col-span-2 lg:col-span-5 text-[10px] font-bold text-slate-500">Versión anterior que sustituye (opcional; se conserva recuperable)
        <select value={sustituyeA} onChange={(e) => setSustituyeA(e.target.value)} className="block w-full mt-1 px-2 py-2 border rounded-lg text-xs bg-white">
          <option value="">No sustituye a otra versión</option>
          {props.documentos.filter((d) => d.estado === 'DISPONIBLE').map((d) => <option key={d.id} value={d.id}>{d.nombre} · v{d.version}</option>)}
        </select>
      </label>
    </form>
    {error && <p role="alert" className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">{error}</p>}
    {mensaje && <p role="status" className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">{mensaje}</p>}
    <div className="space-y-1.5">
      {props.documentos.length === 0 ? <p className="text-[11px] text-slate-400">Todavía no hay documentos del gestor.</p> : props.documentos.map((d) => <div key={d.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5 items-center"><span className="text-xs font-bold text-slate-700 truncate">{d.nombre}</span><span className="px-1.5 py-0.5 rounded bg-slate-100 text-[9px] font-bold">{d.tipo}</span><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${d.estado === 'DISPONIBLE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{d.estado}</span></div>
          <div className="text-[10px] text-slate-400 mt-0.5">{d.fechaDocumental || d.fechaIncorporacion.slice(0, 10)} · {(d.tamanoBytes / 1024).toFixed(1)} KB · {d.mimeType}{d.referencia ? ` · ${d.referencia}` : ''}</div>
        </div>
        <div className="flex gap-1 shrink-0">
          {d.estado === 'DISPONIBLE' && <button type="button" aria-label={`Descargar ${d.nombre}`} onClick={() => void descargar(d)} className="p-2 rounded-lg hover:bg-slate-100 text-indigo-700"><Download className="w-4 h-4" /></button>}
          {d.estado === 'DISPONIBLE' && <button type="button" aria-label={`Editar metadatos de ${d.nombre}`} onClick={() => void editar(d)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"><Pencil className="w-4 h-4" /></button>}
          {d.estado !== 'ELIMINADO' && <button type="button" aria-label={`Eliminar ${d.nombre}`} onClick={() => void eliminar(d)} className="p-2 rounded-lg hover:bg-rose-50 text-rose-600"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>)}
    </div>
  </section>;
};
