import React, { useEffect, useMemo, useState } from 'react';
import { DoorOpen, Plus, Save } from 'lucide-react';
import {
  ContratoFormalizacion,
  EstadoHabitacion,
  HabitacionInmueble,
  Inmueble,
  Profesional,
  UsuarioApp,
} from '../types';
import { saveHabitacionFirestore, subscribeHabitacionesInmueble } from '../lib/firebase';
import {
  ESTADO_HABITACION_LABELS,
  ESTADOS_HABITACION,
  aplicarCambioEstadoHabitacion,
  aplicarDesactivarHabitacion,
  canAccessHabitacionesInmueble,
  canMutateHabitaciones,
  disponibilidadHabitacion,
  inmuebleEnModoHabitaciones,
  profesionalPuedeVerEconomiaHabitacion,
  resumenRentasHabitaciones,
} from '../utils/habitacionesEngine';
import { obtenerCobrosInmueble } from '../utils/cobrosEngine';

interface Props {
  inmueble: Inmueble;
  currentUser?: UsuarioApp | null;
  profesional?: Profesional | null;
  contratos?: ContratoFormalizacion[];
  onUpdateInmueble?: (inmueble: Inmueble) => void;
}

export const HabitacionesInmueblePanel: React.FC<Props> = ({
  inmueble,
  currentUser,
  profesional,
  contratos = [],
  onUpdateInmueble,
}) => {
  const canView = canAccessHabitacionesInmueble(currentUser, inmueble, profesional);
  const canEdit = canMutateHabitaciones(currentUser, inmueble, profesional);
  const verEco = profesionalPuedeVerEconomiaHabitacion(currentUser);
  const modoHabitaciones = inmuebleEnModoHabitaciones(inmueble);

  const [habitaciones, setHabitaciones] = useState<HabitacionInmueble[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<HabitacionInmueble | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [estado, setEstado] = useState<EstadoHabitacion>('DISPONIBLE');
  const [superficie, setSuperficie] = useState<number>(0);
  const [precio, setPrecio] = useState<number>(0);
  const [fianza, setFianza] = useState<number>(0);
  const [caracteristicas, setCaracteristicas] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!canView) {
      setHabitaciones([]);
      return;
    }
    const unsub = subscribeHabitacionesInmueble(inmueble.id, setHabitaciones);
    return () => unsub();
  }, [inmueble.id, canView]);

  const resumen = useMemo(
    () => resumenRentasHabitaciones(habitaciones, contratos),
    [habitaciones, contratos]
  );

  const cobrosInmueble = useMemo(
    () => obtenerCobrosInmueble(inmueble.id, contratos),
    [inmueble.id, contratos]
  );

  if (!canView) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
        Acceso denegado: no puedes consultar las habitaciones de este inmueble.
      </div>
    );
  }

  const actor = currentUser?.nombre || currentUser?.email || 'Usuario';
  const propId = inmueble.propietarioId || inmueble.propietarioPrincipalId;

  const handleToggleModalidad = (modo: 'completo' | 'habitaciones') => {
    if (!canEdit || !onUpdateInmueble) return;
    onUpdateInmueble({ ...inmueble, modalidadAlquiler: modo });
  };

  const openNew = () => {
    setEditItem(null);
    setNombre('');
    setDescripcion('');
    setEstado('DISPONIBLE');
    setSuperficie(0);
    setPrecio(0);
    setFianza(0);
    setCaracteristicas('');
    setFormOpen(true);
  };

  const openEdit = (h: HabitacionInmueble) => {
    setEditItem(h);
    setNombre(h.nombre);
    setDescripcion(h.descripcion || '');
    setEstado(h.estado);
    setSuperficie(h.superficie || 0);
    setPrecio(h.precioObjetivo || 0);
    setFianza(h.fianza || 0);
    setCaracteristicas(h.caracteristicas || '');
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!canEdit || !nombre.trim()) return;
    const now = new Date().toISOString();
    const id = editItem?.id || `hab_${inmueble.id}_${Date.now()}`;
    const hab: HabitacionInmueble = {
      id,
      inmuebleId: inmueble.id,
      propietarioId: editItem?.propietarioId || propId,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      estado,
      superficie: superficie || undefined,
      precioObjetivo: precio || undefined,
      fianza: fianza || undefined,
      caracteristicas: caracteristicas.trim() || undefined,
      activo: editItem ? editItem.activo : true,
      fechaAlta: editItem?.fechaAlta || now,
      fechaModificacion: now,
      creadoPor: editItem?.creadoPor || actor,
      actualizadoPor: actor,
      historial: editItem?.historial,
    };
    await saveHabitacionFirestore(hab);
    setFormOpen(false);
  };

  const handleEstado = async (h: HabitacionInmueble, nuevo: EstadoHabitacion) => {
    if (!canEdit) return;
    setErrorMsg('');
    try {
      const next = aplicarCambioEstadoHabitacion(h, nuevo, actor);
      await saveHabitacionFirestore(next);
    } catch (e) {
      setErrorMsg((e as Error).message);
    }
  };

  const handleDesactivar = async (h: HabitacionInmueble) => {
    if (!canEdit) return;
    try {
      await saveHabitacionFirestore(aplicarDesactivarHabitacion(h, actor));
    } catch (e) {
      setErrorMsg((e as Error).message);
    }
  };

  const handleReactivar = async (h: HabitacionInmueble) => {
    if (!canEdit) return;
    try {
      await saveHabitacionFirestore(aplicarCambioEstadoHabitacion(h, 'DISPONIBLE', actor));
    } catch (e) {
      setErrorMsg((e as Error).message);
    }
  };

  const detalle = habitaciones.find((h) => h.id === detalleId);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <DoorOpen className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Habitaciones (unidades alquilables)</h3>
            <p className="text-[11px] text-slate-500">
              Un único inmueble físico ({inmueble.id}). Cambiar de modo no borra habitaciones.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => handleToggleModalidad('completo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              !modoHabitaciones ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Vivienda completa
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => handleToggleModalidad('habitaciones')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              modoHabitaciones ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Por habitaciones
          </button>
        </div>
      </div>

      {errorMsg && <p className="text-xs text-rose-700">{errorMsg}</p>}

      {!modoHabitaciones ? (
        <p className="text-xs text-slate-500">
          Modo vivienda completa. Las habitaciones no se muestran ni se crean automáticamente.
          {habitaciones.length > 0 ? ` Hay ${habitaciones.length} habitación(es) históricas conservadas.` : ''}
        </p>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="p-2 bg-slate-50 rounded-xl border">Total {resumen.total}</div>
            <div className="p-2 bg-emerald-50 rounded-xl border">Disp. {resumen.disponibles}</div>
            <div className="p-2 bg-amber-50 rounded-xl border">Res. {resumen.reservadas}</div>
            <div className="p-2 bg-indigo-50 rounded-xl border">Ocup. {resumen.ocupadas}</div>
            <div className="p-2 bg-slate-100 rounded-xl border">Bloq./Inact. {resumen.bloqueadas + resumen.inactivas}</div>
          </div>
          {verEco && (
            <p className="text-[11px] text-slate-600">
              Renta potencial {resumen.rentaPotencial.toLocaleString('es-ES')} € · ocupada {resumen.rentaOcupada.toLocaleString('es-ES')} € · pendiente {resumen.rentaPendiente.toLocaleString('es-ES')} €
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">{habitaciones.length} habitación(es)</span>
            {canEdit && (
              <button type="button" onClick={openNew} className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-1">
                <Plus className="w-4 h-4" />
                Nueva habitación
              </button>
            )}
          </div>

          {habitaciones.length === 0 ? (
            <p className="text-center py-6 text-slate-500">Sin habitaciones. Crea la primera sin duplicar el inmueble.</p>
          ) : (
            <div className="overflow-x-auto border rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2">Habitación</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Inquilino</th>
                    <th className="p-2">Renta</th>
                    <th className="p-2">Desde</th>
                    <th className="p-2">Hasta</th>
                  </tr>
                </thead>
                <tbody>
                  {habitaciones.map((h) => {
                    const d = disponibilidadHabitacion(h, contratos);
                    return (
                      <tr key={h.id} className="border-t cursor-pointer hover:bg-slate-50" onClick={() => setDetalleId(h.id)}>
                        <td className="p-2 font-semibold">{h.nombre}</td>
                        <td className="p-2">{ESTADO_HABITACION_LABELS[d.estado]}</td>
                        <td className="p-2">{d.inquilino || '—'}</td>
                        <td className="p-2">{verEco ? `${(d.renta || h.precioObjetivo || 0).toLocaleString('es-ES')} €` : '—'}</td>
                        <td className="p-2">{d.ocupadaDesde || '—'}</td>
                        <td className="p-2">{d.ocupadaHasta || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {detalle && (
            <div className="p-3 border rounded-xl bg-slate-50 space-y-2">
              <div className="flex justify-between">
                <strong>{detalle.nombre}</strong>
                <button type="button" onClick={() => setDetalleId(null)} className="text-slate-500">Cerrar</button>
              </div>
              <p>{detalle.descripcion || 'Sin descripción'}</p>
              {verEco && <p>Renta objetivo: {detalle.precioObjetivo || 0} € · Fianza: {detalle.fianza || 0} €</p>}
              {(() => {
                const d = disponibilidadHabitacion(detalle, contratos);
                return (
                  <p>
                    Ocupación: {ESTADO_HABITACION_LABELS[d.estado]} {d.inquilino ? `· ${d.inquilino}` : ''} {d.contratoId ? `· contrato ${d.contratoId}` : ''}
                  </p>
                );
              })()}
              {verEco && (
                <p>
                  Cobros: {cobrosInmueble.filter((c) => c.habitacionId === detalle.id).length} periodo(s)
                </p>
              )}
              {canEdit && (
                <div className="flex flex-wrap gap-1">
                  <select value={detalle.estado} onChange={(e) => void handleEstado(detalle, e.target.value as EstadoHabitacion)} className="px-2 py-1 border rounded-lg">
                    {ESTADOS_HABITACION.map((s) => (
                      <option key={s} value={s}>{ESTADO_HABITACION_LABELS[s]}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => openEdit(detalle)} className="px-2 py-1 bg-white border rounded-lg">Editar</button>
                  {detalle.activo === false ? (
                    <button type="button" onClick={() => void handleReactivar(detalle)} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">Reactivar</button>
                  ) : (
                    <button type="button" onClick={() => void handleDesactivar(detalle)} className="px-2 py-1 bg-rose-50 text-rose-700 rounded-lg">Desactivar</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 text-xs">
            <h4 className="font-bold text-sm">{editItem ? 'Editar habitación' : 'Nueva habitación'}</h4>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre o número *" className="w-full px-3 py-2 border rounded-xl" />
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción" className="w-full px-3 py-2 border rounded-xl" />
            <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoHabitacion)} className="w-full px-3 py-2 border rounded-xl">
              {ESTADOS_HABITACION.map((s) => (
                <option key={s} value={s}>{ESTADO_HABITACION_LABELS[s]}</option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" min={0} value={superficie || ''} onChange={(e) => setSuperficie(Number(e.target.value))} placeholder="m²" className="px-3 py-2 border rounded-xl" />
              <input type="number" min={0} value={precio || ''} onChange={(e) => setPrecio(Number(e.target.value))} placeholder="€/mes" className="px-3 py-2 border rounded-xl" />
              <input type="number" min={0} value={fianza || ''} onChange={(e) => setFianza(Number(e.target.value))} placeholder="Fianza €" className="px-3 py-2 border rounded-xl" />
            </div>
            <input value={caracteristicas} onChange={(e) => setCaracteristicas(e.target.value)} placeholder="Características" className="w-full px-3 py-2 border rounded-xl" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-3 py-2 bg-slate-100 rounded-xl">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-3 py-2 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-1">
                <Save className="w-4 h-4" />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
