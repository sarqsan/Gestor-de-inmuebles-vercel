import React, { useState } from 'react';
import {
  X,
  FileText,
  Building2,
  Calendar,
  DollarSign,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Edit,
  Wrench,
  AlertCircle,
  Briefcase,
} from 'lucide-react';
import {
  PresupuestoProfesional,
  TrabajoProfesional,
  Profesional,
  Inmueble,
  UsuarioApp,
  EstadoPresupuestoProfesional,
  HistorialDecisionPresupuesto,
} from '../../types';
import { ESTADO_PRESUPUESTO_LABELS, ESTADO_TRABAJO_LABELS, crearItemHistorialTrabajo } from '../../utils/profesionalesEngine';
import { savePresupuestoProfesionalFirestore, saveTrabajoProfesionalFirestore } from '../../lib/firebase';

interface DetallePresupuestoProfesionalModalProps {
  isOpen: boolean;
  onClose: () => void;
  presupuesto: PresupuestoProfesional;
  trabajos: TrabajoProfesional[];
  profesionales: Profesional[];
  inmuebles: Inmueble[];
  currentUser?: UsuarioApp;
  onEditarPresupuesto?: (presupuesto: PresupuestoProfesional) => void;
  onVerTrabajo?: (trabajo: TrabajoProfesional) => void;
}

export const DetallePresupuestoProfesionalModal: React.FC<DetallePresupuestoProfesionalModalProps> = ({
  isOpen,
  onClose,
  presupuesto,
  trabajos,
  profesionales,
  inmuebles,
  currentUser,
  onEditarPresupuesto,
  onVerTrabajo,
}) => {
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [mostrandoRechazo, setMostrandoRechazo] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!isOpen) return null;

  const estadoInfo = ESTADO_PRESUPUESTO_LABELS[presupuesto.estado] || ESTADO_PRESUPUESTO_LABELS.BORRADOR;
  const trabajo = trabajos.find((t) => t.id === presupuesto.trabajoId);
  const profesional = profesionales.find((p) => p.id === presupuesto.profesionalId);
  const inmueble = inmuebles.find((i) => i.id === presupuesto.inmuebleId);

  const handleCambiarEstado = async (nuevoEstado: EstadoPresupuestoProfesional, motivo?: string) => {
    try {
      setIsUpdating(true);
      const usuarioNombre = currentUser?.nombre
        ? `${currentUser.nombre} ${currentUser.apellidos || ''}`.trim()
        : 'Administrador';

      const decisionItem: HistorialDecisionPresupuesto = {
        fecha: new Date().toISOString(),
        usuario: usuarioNombre,
        estadoAnterior: presupuesto.estado,
        estadoNuevo: nuevoEstado,
        observaciones:
          motivo ||
          (nuevoEstado === 'ACEPTADO'
            ? 'Presupuesto aprobado y adjudicado'
            : nuevoEstado === 'RECHAZADO'
            ? 'Presupuesto rechazado'
            : `Estado modificado a ${nuevoEstado}`),
      };

      const presActualizado: PresupuestoProfesional = {
        ...presupuesto,
        estado: nuevoEstado,
        motivoRechazo: motivo || (nuevoEstado === 'RECHAZADO' ? presupuesto.motivoRechazo : undefined),
        fechaDecision: new Date().toISOString(),
        decididoPor: usuarioNombre,
        historialDecision: [...(presupuesto.historialDecision || []), decisionItem],
        updatedAt: new Date().toISOString(),
      };

      await savePresupuestoProfesionalFirestore(presActualizado);

      // Sync linked work order
      if (trabajo) {
        if (nuevoEstado === 'ACEPTADO') {
          const nuevoHistorial = [
            ...(trabajo.historial || []),
            crearItemHistorialTrabajo(
              'ESTADO_MODIFICADO',
              usuarioNombre,
              trabajo.estado,
              'ACEPTADO',
              `Presupuesto ${presupuesto.numeroPresupuesto || presupuesto.id} aprobado (${presupuesto.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })})`
            ),
          ];

          const trabajoActualizado: TrabajoProfesional = {
            ...trabajo,
            estado: 'ACEPTADO',
            presupuestoId: presupuesto.id,
            importeEstimado: presupuesto.importeTotal,
            historial: nuevoHistorial,
            updatedAt: new Date().toISOString(),
          };
          await saveTrabajoProfesionalFirestore(trabajoActualizado);
        } else if (nuevoEstado === 'RECHAZADO' && trabajo.presupuestoId === presupuesto.id) {
          const nuevoHistorial = [
            ...(trabajo.historial || []),
            crearItemHistorialTrabajo(
              'ESTADO_MODIFICADO',
              usuarioNombre,
              trabajo.estado,
              'BUSCANDO_PROFESIONAL',
              `Presupuesto ${presupuesto.numeroPresupuesto || presupuesto.id} rechazado${motivo ? `: ${motivo}` : ''}`
            ),
          ];

          const trabajoActualizado: TrabajoProfesional = {
            ...trabajo,
            estado: 'BUSCANDO_PROFESIONAL',
            presupuestoId: undefined,
            historial: nuevoHistorial,
            updatedAt: new Date().toISOString(),
          };
          await saveTrabajoProfesionalFirestore(trabajoActualizado);
        }
      }

      setMostrandoRechazo(false);
    } catch (err) {
      console.error('Error updating presupuesto status:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      id="detalle-presupuesto-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center text-emerald-700">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-xl font-bold text-slate-900 font-mono">
                  {presupuesto.numeroPresupuesto || `PRE-${presupuesto.id.slice(-6)}`}
                </h2>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${estadoInfo.badgeClass}`}>
                  {estadoInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Emitido por <strong className="text-slate-700">{presupuesto.profesionalNombre || profesional?.nombreComercial}</strong> • Fecha:{' '}
                {new Date(presupuesto.fecha).toLocaleDateString('es-ES')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onEditarPresupuesto && (
              <button
                onClick={() => onEditarPresupuesto(presupuesto)}
                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-xl transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Decision Toolbar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-500">Decisión sobre el presupuesto:</span>
            {presupuesto.decididoPor && (
              <span className="text-slate-400">
                (Decidido por {presupuesto.decididoPor} el {new Date(presupuesto.fechaDecision!).toLocaleDateString('es-ES')})
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {presupuesto.estado !== 'ACEPTADO' && (
              <button
                disabled={isUpdating}
                onClick={() => handleCambiarEstado('ACEPTADO')}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Aprobar y Adjudicar</span>
              </button>
            )}

            {presupuesto.estado !== 'RECHAZADO' && !mostrandoRechazo && (
              <button
                disabled={isUpdating}
                onClick={() => setMostrandoRechazo(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-lg transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Rechazar</span>
              </button>
            )}

            {presupuesto.estado !== 'EN_REVISION' && (
              <button
                disabled={isUpdating}
                onClick={() => handleCambiarEstado('EN_REVISION')}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold rounded-lg transition-colors"
              >
                Solicitar Ajuste / Revisión
              </button>
            )}
          </div>
        </div>

        {/* Reject reason prompt */}
        {mostrandoRechazo && (
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-200 flex items-center space-x-3 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <input
              type="text"
              placeholder="Indica el motivo del rechazo (ej: precio elevado, plazo excesivo)..."
              value={motivoRechazo}
              onChange={(e) => setMotivoRechazo(e.target.value)}
              className="flex-1 p-1.5 border border-rose-300 rounded-lg text-xs bg-white"
            />
            <button
              onClick={() => handleCambiarEstado('RECHAZADO', motivoRechazo)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg"
            >
              Confirmar Rechazo
            </button>
            <button
              onClick={() => setMostrandoRechazo(false)}
              className="px-2 py-1 text-slate-500 hover:text-slate-700"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 bg-white space-y-6">
          {/* Decision Status Banner */}
          {presupuesto.estado === 'ACEPTADO' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm text-emerald-800">Presupuesto Aprobado y Adjudicado</h4>
                  <p className="text-emerald-700 mt-0.5">
                    {presupuesto.decididoPor ? `Aprobado por ${presupuesto.decididoPor}` : 'Presupuesto aceptado formalmente'}
                    {presupuesto.fechaDecision ? ` el ${new Date(presupuesto.fechaDecision).toLocaleDateString('es-ES')}` : ''}.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold">
                Adjudicación en firme
              </span>
            </div>
          )}

          {presupuesto.estado === 'RECHAZADO' && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
              <div className="flex items-center space-x-2">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <h4 className="font-bold text-sm text-rose-800">Presupuesto Rechazado</h4>
                {presupuesto.fechaDecision && (
                  <span className="text-rose-600">
                    ({new Date(presupuesto.fechaDecision).toLocaleDateString('es-ES')})
                  </span>
                )}
              </div>
              {presupuesto.motivoRechazo && (
                <p className="text-rose-700 pl-6">
                  <strong>Motivo:</strong> {presupuesto.motivoRechazo}
                </p>
              )}
              {presupuesto.decididoPor && (
                <p className="text-rose-500 pl-6 text-[11px]">Decidido por: {presupuesto.decididoPor}</p>
              )}
            </div>
          )}

          {/* Linked Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider block">Trabajo e Inmueble</span>
              {trabajo ? (
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{trabajo.titulo}</h4>
                  <p className="text-slate-600 mt-1">{presupuesto.inmuebleDireccion || inmueble?.direccion}</p>
                  {onVerTrabajo && (
                    <button
                      onClick={() => onVerTrabajo(trabajo)}
                      className="text-blue-600 hover:underline font-semibold mt-2 inline-flex items-center space-x-1"
                    >
                      <span>Ver Orden de Trabajo</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-slate-400">Orden de trabajo no encontrada.</p>
              )}
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider block">Profesional Emisor</span>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  {presupuesto.profesionalNombre || profesional?.nombreComercial}
                </h4>
                {profesional?.cifNif && <p className="text-slate-500">CIF: {profesional.cifNif}</p>}
                {profesional?.telefono && <p className="text-slate-600 mt-1">Tel: {profesional.telefono}</p>}
                {presupuesto.documentoUrl && (
                  <a
                    href={presupuesto.documentoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline font-semibold mt-2 inline-flex items-center space-x-1"
                  >
                    <span>Descargar PDF Oficial</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Alcance Presupuestado</h4>
            <p className="text-xs text-slate-700 bg-white border border-slate-200 p-3 rounded-xl leading-relaxed">
              {presupuesto.descripcion}
            </p>
          </div>

          {/* Line items table */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Desglose de Partidas</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3 pl-4">Concepto / Partida</th>
                    <th className="p-3 text-center w-20">Cantidad</th>
                    <th className="p-3 text-right w-28">Precio Ud</th>
                    <th className="p-3 text-right w-28 pr-4">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {presupuesto.partidas?.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="p-3 pl-4 font-medium text-slate-800">{item.concepto}</td>
                      <td className="p-3 text-center text-slate-600">{item.cantidad}</td>
                      <td className="p-3 text-right text-slate-600">
                        {item.precioUnitario.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900 pr-4">
                        {item.importe.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="flex justify-end">
            <div className="w-full sm:w-72 bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Base Imponible:</span>
                <span className="font-semibold">
                  {presupuesto.importeBase.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>IVA:</span>
                <span className="font-semibold">
                  {presupuesto.iva.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Importe Total:</span>
                <span className="text-emerald-700">
                  {presupuesto.importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
            </div>
          </div>

          {/* Historial de Decisiones */}
          {presupuesto.historialDecision && presupuesto.historialDecision.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Historial de Decisiones y Cambios de Estado</span>
              </h4>
              <div className="space-y-2">
                {presupuesto.historialDecision.map((dec, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between flex-wrap gap-2"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">
                        {dec.estadoAnterior} → {dec.estadoNuevo}
                      </span>
                      {dec.observaciones && <p className="text-slate-600 mt-0.5">{dec.observaciones}</p>}
                    </div>
                    <div className="text-right text-[11px] text-slate-400">
                      <span>{new Date(dec.fecha).toLocaleString('es-ES')}</span>
                      <span className="block">Por: {dec.usuario}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
