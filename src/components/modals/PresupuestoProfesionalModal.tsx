import React, { useState } from 'react';
import {
  X,
  FileText,
  Building2,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
  Loader2,
  Wrench,
  Percent,
} from 'lucide-react';
import {
  PresupuestoProfesional,
  PartidaPresupuesto,
  TrabajoProfesional,
  Profesional,
  Inmueble,
  UsuarioApp,
  EstadoPresupuestoProfesional,
  HistorialDecisionPresupuesto,
} from '../../types';
import {
  ESTADO_PRESUPUESTO_LABELS,
  calcularTotalesPresupuesto,
  crearItemHistorialTrabajo,
} from '../../utils/profesionalesEngine';
import {
  savePresupuestoProfesionalFirestore,
  uploadPresupuestoDocumentoStorage,
  saveTrabajoProfesionalFirestore,
} from '../../lib/firebase';

interface PresupuestoProfesionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  presupuestoParaEditar?: PresupuestoProfesional | null;
  trabajos: TrabajoProfesional[];
  profesionales: Profesional[];
  inmuebles: Inmueble[];
  currentUser?: UsuarioApp;
  trabajoPreseleccionado?: TrabajoProfesional | null;
  profesionalPreseleccionadoId?: string;
  onSaveSuccess?: (presupuesto: PresupuestoProfesional) => void;
}

export const PresupuestoProfesionalModal: React.FC<PresupuestoProfesionalModalProps> = ({
  isOpen,
  onClose,
  presupuestoParaEditar,
  trabajos,
  profesionales,
  inmuebles,
  currentUser,
  trabajoPreseleccionado,
  profesionalPreseleccionadoId,
  onSaveSuccess,
}) => {
  const isEditing = !!presupuestoParaEditar;

  const [trabajoId, setTrabajoId] = useState<string>(
    presupuestoParaEditar?.trabajoId || trabajoPreseleccionado?.id || (trabajos[0]?.id || '')
  );

  const trabajoActual = trabajos.find((t) => t.id === trabajoId) || trabajoPreseleccionado;

  const [profesionalId, setProfesionalId] = useState<string>(
    presupuestoParaEditar?.profesionalId ||
      trabajoActual?.profesionalId ||
      profesionalPreseleccionadoId ||
      (profesionales[0]?.id || '')
  );

  const [numeroPresupuesto, setNumeroPresupuesto] = useState<string>(
    presupuestoParaEditar?.numeroPresupuesto || `PRE-${Date.now().toString().slice(-6)}`
  );
  const [fecha, setFecha] = useState<string>(
    presupuestoParaEditar?.fecha ? presupuestoParaEditar.fecha.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [validez, setValidez] = useState<string>(
    presupuestoParaEditar?.validez || '30 días'
  );
  const [descripcion, setDescripcion] = useState<string>(
    presupuestoParaEditar?.descripcion ||
      (trabajoActual ? `Presupuesto para: ${trabajoActual.titulo}` : '')
  );
  const [estado, setEstado] = useState<EstadoPresupuestoProfesional>(
    presupuestoParaEditar?.estado || 'RECIBIDO'
  );
  const [porcentajeIva, setPorcentajeIva] = useState<number>(
    presupuestoParaEditar?.iva !== undefined && presupuestoParaEditar?.importeBase
      ? Math.round((presupuestoParaEditar.iva / presupuestoParaEditar.importeBase) * 100)
      : 21
  );

  // Line items
  const [partidas, setPartidas] = useState<PartidaPresupuesto[]>(
    presupuestoParaEditar?.partidas || [
      {
        id: 'p1',
        concepto: 'Mano de obra especializada e intervención',
        cantidad: 1,
        precioUnitario: 120,
        importe: 120,
      },
      {
        id: 'p2',
        concepto: 'Materiales, repuestos y consumibles',
        cantidad: 1,
        precioUnitario: 45,
        importe: 45,
      },
    ]
  );

  const [documentoUrl, setDocumentoUrl] = useState<string>(presupuestoParaEditar?.documentoUrl || '');
  const [nombreArchivo, setNombreArchivo] = useState<string>('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const profesionalSeleccionado = profesionales.find((p) => p.id === profesionalId);
  const inmuebleSeleccionado = inmuebles.find((i) => i.id === trabajoActual?.inmuebleId);

  // Calculations
  const { importeBase, iva, importeTotal } = calcularTotalesPresupuesto(partidas, porcentajeIva);

  const handleUpdatePartida = (index: number, campo: keyof PartidaPresupuesto, valor: any) => {
    const updated = [...partidas];
    const item = { ...updated[index], [campo]: valor };
    if (campo === 'cantidad' || campo === 'precioUnitario') {
      const cant = campo === 'cantidad' ? parseFloat(valor) || 0 : item.cantidad;
      const prec = campo === 'precioUnitario' ? parseFloat(valor) || 0 : item.precioUnitario;
      item.importe = Math.round(cant * prec * 100) / 100;
    }
    updated[index] = item;
    setPartidas(updated);
  };

  const handleAddPartida = () => {
    const nueva: PartidaPresupuesto = {
      id: `p_${Date.now()}`,
      concepto: 'Nueva partida de trabajo o material',
      cantidad: 1,
      precioUnitario: 50,
      importe: 50,
    };
    setPartidas([...partidas, nueva]);
  };

  const handleRemovePartida = (index: number) => {
    if (partidas.length === 1) return;
    setPartidas(partidas.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingDoc(true);
      setErrorMsg('');
      const tempPresId = presupuestoParaEditar?.id || `pres_${Date.now()}`;
      const downloadUrl = await uploadPresupuestoDocumentoStorage(tempPresId, file, file.name);
      setDocumentoUrl(downloadUrl);
      setNombreArchivo(file.name);
    } catch (err: any) {
      console.error('Error uploading presupuesto doc:', err);
      setErrorMsg('Error al subir el archivo del presupuesto.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!trabajoId) {
      setErrorMsg('Por favor selecciona la orden de trabajo correspondiente.');
      return;
    }
    if (!profesionalId) {
      setErrorMsg('Por favor selecciona el profesional emisor del presupuesto.');
      return;
    }

    try {
      setGuardando(true);
      setErrorMsg('');

      const presId =
        presupuestoParaEditar?.id || `pres_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Usuario';

      const historialDecision = presupuestoParaEditar?.historialDecision ? [...presupuestoParaEditar.historialDecision] : [];
      if (estado === 'ACEPTADO' && (!presupuestoParaEditar || presupuestoParaEditar.estado !== 'ACEPTADO')) {
        historialDecision.push({
          fecha: new Date().toISOString(),
          usuario: usuarioNombre,
          estadoAnterior: presupuestoParaEditar?.estado || 'BORRADOR',
          estadoNuevo: 'ACEPTADO',
          observaciones: 'Presupuesto aprobado y adjudicado',
        });
      }

      const presupuestoFinal: PresupuestoProfesional = {
        id: presId,
        trabajoId,
        profesionalId,
        profesionalNombre: profesionalSeleccionado?.nombreComercial || 'Profesional',
        propietarioId: trabajoActual?.propietarioId || currentUser?.propietarioId || 'prop_default',
        inmuebleId: trabajoActual?.inmuebleId || '',
        inmuebleDireccion: trabajoActual?.inmuebleDireccion || inmuebleSeleccionado?.direccion,
        incidenciaId: trabajoActual?.incidenciaId || undefined,
        numeroPresupuesto: numeroPresupuesto.trim(),
        fecha: new Date(fecha).toISOString(),
        validez: validez.trim(),
        descripcion: descripcion.trim(),
        partidas,
        importeBase,
        iva,
        porcentajeIva,
        importeTotal,
        documentoUrl: documentoUrl || undefined,
        estado,
        historialDecision: historialDecision.length > 0 ? historialDecision : undefined,
        creadoPor: presupuestoParaEditar?.creadoPor || usuarioNombre,
        actualizadoPor: usuarioNombre,
        createdAt: presupuestoParaEditar?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await savePresupuestoProfesionalFirestore(presupuestoFinal);

      // If budget is registered, sync work order status and budget ID
      if (trabajoActual) {
        let nuevoEstadoTrabajo = trabajoActual.estado;
        if (estado === 'ACEPTADO' && trabajoActual.estado !== 'ACEPTADO' && trabajoActual.estado !== 'PROGRAMADO' && trabajoActual.estado !== 'EN_EJECUCION' && trabajoActual.estado !== 'FINALIZADO') {
          nuevoEstadoTrabajo = 'ACEPTADO';
        } else if (trabajoActual.estado === 'PENDIENTE' || trabajoActual.estado === 'BUSCANDO_PROFESIONAL' || trabajoActual.estado === 'PRESUPUESTO_SOLICITADO') {
          nuevoEstadoTrabajo = 'PRESUPUESTO_RECIBIDO';
        }

        const nuevoHistorial = [
          ...(trabajoActual.historial || []),
          crearItemHistorialTrabajo(
            'PRESUPUESTO_RECIBIDO',
            usuarioNombre,
            trabajoActual.estado,
            nuevoEstadoTrabajo,
            `Presupuesto ${presupuestoFinal.numeroPresupuesto || presId} registrado por ${importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`
          ),
        ];

        const trabajoActualizado: TrabajoProfesional = {
          ...trabajoActual,
          estado: nuevoEstadoTrabajo,
          presupuestoId: presId,
          importeEstimado: importeTotal,
          historial: nuevoHistorial,
          updatedAt: new Date().toISOString(),
        };

        await saveTrabajoProfesionalFirestore(trabajoActualizado);
      }

      if (onSaveSuccess) onSaveSuccess(presupuestoFinal);
      onClose();
    } catch (err: any) {
      console.error('Error saving presupuesto:', err);
      setErrorMsg(err?.message || 'Error al guardar el presupuesto en Firestore.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      id="presupuesto-profesional-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center text-emerald-700">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {isEditing ? 'Modificar Presupuesto Profesional' : 'Registro de Presupuesto de Profesional'}
              </h3>
              <p className="text-xs text-slate-500">
                Desglose de partidas, cálculo de base imponible, IVA y vinculación directa con la orden técnica
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
              {errorMsg}
            </div>
          )}

          {/* Section 1: Trabajo y Profesional Vinculado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Orden de Trabajo Vinculada <span className="text-red-500">*</span>
              </label>
              <select
                value={trabajoId}
                onChange={(e) => {
                  const tid = e.target.value;
                  setTrabajoId(tid);
                  const trab = trabajos.find((t) => t.id === tid);
                  if (trab?.profesionalId) {
                    setProfesionalId(trab.profesionalId);
                  }
                  if (trab && !descripcion) {
                    setDescripcion(`Presupuesto para: ${trab.titulo}`);
                  }
                }}
                required
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white"
              >
                <option value="">Selecciona orden de trabajo...</option>
                {trabajos.map((trab) => (
                  <option key={trab.id} value={trab.id}>
                    [{trab.categoria}] {trab.titulo} - {trab.inmuebleDireccion || 'Inmueble'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Profesional o Empresa Emisora <span className="text-red-500">*</span>
              </label>
              <select
                value={profesionalId}
                onChange={(e) => setProfesionalId(e.target.value)}
                required
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
              >
                <option value="">Selecciona profesional...</option>
                {profesionales.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.nombreComercial} ({prof.tipo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 2: Metadata del Presupuesto */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nº Referencia / Presupuesto</label>
              <input
                type="text"
                required
                value={numeroPresupuesto}
                onChange={(e) => setNumeroPresupuesto(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Fecha Emisión</label>
              <input
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Plazo de Validez</label>
              <input
                type="text"
                value={validez}
                onChange={(e) => setValidez(e.target.value)}
                placeholder="Ej: 30 días, hasta 31/12"
                className="w-full text-xs p-2.5 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {/* Section 3: Descripción General */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Objeto / Resumen del Presupuesto</label>
            <input
              type="text"
              required
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl font-medium"
            />
          </div>

          {/* Section 4: Desglose de Partidas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Partidas Detalladas del Presupuesto
              </label>
              <button
                type="button"
                onClick={handleAddPartida}
                className="inline-flex items-center space-x-1 text-xs font-bold text-blue-600 hover:text-blue-800"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Añadir Partida</span>
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 pl-3">Concepto / Unidad de Obra</th>
                    <th className="p-2.5 w-20 text-center">Cant.</th>
                    <th className="p-2.5 w-28 text-right">Precio Ud (€)</th>
                    <th className="p-2.5 w-28 text-right">Importe (€)</th>
                    <th className="p-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {partidas.map((p, idx) => (
                    <tr key={p.id || idx}>
                      <td className="p-2 pl-3">
                        <input
                          type="text"
                          required
                          value={p.concepto}
                          onChange={(e) => handleUpdatePartida(idx, 'concepto', e.target.value)}
                          className="w-full p-1.5 border border-slate-200 rounded-lg text-xs"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          step="0.1"
                          min="0.01"
                          required
                          value={p.cantidad}
                          onChange={(e) => handleUpdatePartida(idx, 'cantidad', e.target.value)}
                          className="w-full p-1.5 border border-slate-200 rounded-lg text-xs text-center"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={p.precioUnitario}
                          onChange={(e) => handleUpdatePartida(idx, 'precioUnitario', e.target.value)}
                          className="w-full p-1.5 border border-slate-200 rounded-lg text-xs text-right"
                        />
                      </td>
                      <td className="p-2 text-right font-bold text-slate-800 pr-3">
                        {p.importe.toFixed(2)} €
                      </td>
                      <td className="p-2 text-center">
                        {partidas.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemovePartida(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 5: Totales & IVA */}
          <div className="flex flex-col sm:flex-row items-end justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="w-full sm:w-auto space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Tipo de Gravamen IVA</label>
              <div className="flex items-center space-x-2">
                {[21, 10, 0].map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setPorcentajeIva(tipo)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      porcentajeIva === tipo
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {tipo}% {tipo === 10 ? '(Reducido)' : tipo === 0 ? '(Exento)' : '(General)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full sm:w-64 space-y-1.5 text-xs text-slate-700">
              <div className="flex justify-between">
                <span>Base Imponible:</span>
                <span className="font-semibold">{importeBase.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span>IVA ({porcentajeIva}%):</span>
                <span className="font-semibold">{iva.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-slate-200 text-sm font-bold text-slate-900">
                <span>Total Presupuesto:</span>
                <span className="text-base text-emerald-700">{importeTotal.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Section 6: Adjunto PDF / Documento Escaneado */}
          <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                Documento Escaneado / PDF Oficial
              </span>
              <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingDoc ? 'Subiendo...' : 'Adjuntar PDF'}</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileUpload}
                  disabled={uploadingDoc}
                  className="hidden"
                />
              </label>
            </div>

            {documentoUrl ? (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-semibold">Documento adjuntado correctamente</span>
                  {nombreArchivo && <span className="text-[11px] text-emerald-600">({nombreArchivo})</span>}
                </div>
                <a
                  href={documentoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 hover:underline font-semibold"
                >
                  Ver archivo
                </a>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Opcional. Puedes adjuntar el PDF original enviado por el profesional.</p>
            )}
          </div>

          {/* Section 7: Estado Inicial */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Estado de Aprobación</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as any)}
              className="w-full text-xs p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
            >
              {Object.entries(ESTADO_PRESUPUESTO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {/* Footer Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando || uploadingDoc}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              {guardando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isEditing ? 'Guardar Cambios' : 'Registrar Presupuesto'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
