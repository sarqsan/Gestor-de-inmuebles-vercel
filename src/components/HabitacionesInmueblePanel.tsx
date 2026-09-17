import React, { useEffect, useState } from 'react';
import { DoorOpen, Plus, Save } from 'lucide-react';
import { EstadoHabitacion, HabitacionInmueble, Inmueble, Profesional, UsuarioApp } from '../types';
import { saveHabitacionFirestore, subscribeHabitacionesInmueble } from '../lib/firebase';
import {
  ESTADO_HABITACION_LABELS,
  ESTADOS_HABITACION,
  aplicarDesactivarHabitacion,
  canAccessHabitacionesInmueble,
  canMutateHabitaciones,
  inmuebleEnModoHabitaciones,
} from '../utils/habitacionesEngine';

interface Props {
  inmueble: Inmueble;
  currentUser?: UsuarioApp | null;
  profesional?: Profesional | null;
  onUpdateInmueble?: (inmueble: Inmueble) => void;
}

export const HabitacionesInmueblePanel: React.FC<Props> = ({
  inmueble,
  currentUser,
  profesional,
  onUpdateInmueble,
}) => {
  const canView = canAccessHabitacionesInmueble(currentUser, inmueble, profesional);
  const canEdit = canMutateHabitaciones(currentUser, inmueble, profesional);
  const modoHabitaciones = inmuebleEnModoHabitaciones(inmueble);

  const [habitaciones, setHabitaciones] = useState<HabitacionInmueble[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<HabitacionInmueble | null>(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [estado, setEstado] = useState<EstadoHabitacion>('DISPONIBLE');
  const [superficie, setSuperficie] = useState<number>(0);
  const [precio, setPrecio] = useState<number>(0);
  const [caracteristicas, setCaracteristicas] = useState('');

  useEffect(() => {
    if (!canView) {
      setHabitaciones([]);
      return;
    }
    const unsub = subscribeHabitacionesInmueble(inmueble.id, setHabitaciones);
    return () => unsub();
  }, [inmueble.id, canView]);

  if (!canView) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
        Acceso denegado: no puedes consultar las habitaciones de este inmueble.
      </div>
    );
  }

  const actor = currentUser?.nombre || currentUser?.email || 'Usuario';

  const handleToggleModalidad = (modo: 'completo' | 'habitaciones') => {
    if (!canEdit || !onUpdateInmueble) return;
    onUpdateInmueble({
      ...inmueble,
      modalidadAlquiler: modo,
    });
  };

  const openNew = () => {
    setEditItem(null);
    setNombre('');
    setDescripcion('');
    setEstado('DISPONIBLE');
    setSuperficie(0);
    setPrecio(0);
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
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      estado,
      superficie: superficie || undefined,
      precioObjetivo: precio || undefined,
      caracteristicas: caracteristicas.trim() || undefined,
      activo: editItem ? editItem.activo : true,
      fechaAlta: editItem?.fechaAlta || now,
      fechaModificacion: now,
      creadoPor: editItem?.creadoPor || actor,
      actualizadoPor: actor,
    };
    await saveHabitacionFirestore(hab);
    setFormOpen(false);
  };

  const handleEstado = async (h: HabitacionInmueble, nuevo: EstadoHabitacion) => {
    if (!canEdit) return;
    await saveHabitacionFirestore({
      ...h,
      estado: nuevo,
      fechaModificacion: new Date().toISOString(),
      actualizadoPor: actor,
    });
  };

  const handleDesactivar = async (h: HabitacionInmueble) => {
    if (!canEdit) return;
    await saveHabitacionFirestore(aplicarDesactivarHabitacion(h, actor));
  };

  const handleReactivar = async (h: HabitacionInmueble) => {
    if (!canEdit) return;
    await saveHabitacionFirestore({
      ...h,
      activo: true,
      fechaModificacion: new Date().toISOString(),
      actualizadoPor: actor,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <DoorOpen className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Modo de explotación</h3>
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

      {!modoHabitaciones ? (
        <p className="text-xs text-slate-500">
          Modo vivienda completa. Las habitaciones no se muestran ni se crean automáticamente.
          {habitaciones.length > 0
            ? ` Hay ${habitaciones.length} habitación(es) históricas conservadas.`
            : ''}
        </p>
      ) : (
        <div className="space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700">{habitaciones.length} habitación(es)</span>
            {canEdit && (
              <button
                type="button"
                onClick={openNew}
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                Nueva habitación
              </button>
            )}
          </div>

          {habitaciones.length === 0 ? (
            <p className="text-center py-6 text-slate-500">Sin habitaciones. Crea la primera sin duplicar el inmueble.</p>
          ) : (
            <div className="divide-y border rounded-xl overflow-hidden">
              {habitaciones.map((h) => (
                <div key={h.id} className={`p-3 ${h.activo === false ? 'bg-slate-50 opacity-70' : 'bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-slate-900">{h.nombre}</strong>
                      {!h.activo && (
                        <span className="ml-2 text-[10px] font-bold text-slate-500">INACTIVA</span>
                      )}
                      <p className="text-[11px] text-slate-500">
                        {ESTADO_HABITACION_LABELS[h.estado]}
                        {h.superficie ? ` · ${h.superficie} m²` : ''}
                        {h.precioObjetivo ? ` · ${h.precioObjetivo} €/mes` : ''}
                      </p>
                      {h.descripcion && <p className="text-slate-600 mt-0.5">{h.descripcion}</p>}
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap gap-1 justify-end">
                        <select
                          value={h.estado}
                          onChange={(e) => void handleEstado(h, e.target.value as EstadoHabitacion)}
                          className="px-2 py-1 border rounded-lg text-[11px]"
                        >
                          {ESTADOS_HABITACION.map((s) => (
                            <option key={s} value={s}>
                              {ESTADO_HABITACION_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <button type="button" onClick={() => openEdit(h)} className="px-2 py-1 bg-slate-100 rounded-lg font-semibold">
                          Editar
                        </button>
                        {h.activo === false ? (
                          <button type="button" onClick={() => void handleReactivar(h)} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">
                            Reactivar
                          </button>
                        ) : (
                          <button type="button" onClick={() => void handleDesactivar(h)} className="px-2 py-1 bg-rose-50 text-rose-700 rounded-lg">
                            Desactivar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
                <option key={s} value={s}>
                  {ESTADO_HABITACION_LABELS[s]}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={0} value={superficie || ''} onChange={(e) => setSuperficie(Number(e.target.value))} placeholder="m²" className="px-3 py-2 border rounded-xl" />
              <input type="number" min={0} value={precio || ''} onChange={(e) => setPrecio(Number(e.target.value))} placeholder="€/mes objetivo" className="px-3 py-2 border rounded-xl" />
            </div>
            <input value={caracteristicas} onChange={(e) => setCaracteristicas(e.target.value)} placeholder="Características (luz, baño, terraza…)" className="w-full px-3 py-2 border rounded-xl" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-3 py-2 bg-slate-100 rounded-xl">
                Cancelar
              </button>
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
