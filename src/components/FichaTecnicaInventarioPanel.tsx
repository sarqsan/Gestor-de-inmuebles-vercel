import React, { useEffect, useMemo, useState } from 'react';
import {
  CategoriaInventario,
  ElementoInventario,
  EstadoInventario,
  Inmueble,
  Profesional,
  UsuarioApp,
} from '../types';
import {
  saveElementoInventarioFirestore,
  subscribeInventarioInmueble,
  uploadInventarioAdjuntoStorage,
  registrarHistorialInventarioFirestore,
} from '../lib/firebase';
import {
  CATEGORIA_LABELS,
  CATEGORIAS_INVENTARIO,
  ESTADO_INVENTARIO_LABELS,
  ESTADOS_INVENTARIO,
  aplicarBajaLogica,
  canAccessInventarioInmueble,
  canMutateInventario,
  filtrarInventarioPorCategoria,
} from '../utils/inventarioEngine';
import {
  ClipboardList,
  Package,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  History,
  Filter,
} from 'lucide-react';

interface Props {
  inmueble: Inmueble;
  currentUser?: UsuarioApp | null;
  profesional?: Profesional | null;
  onUpdateInmueble?: (inmueble: Inmueble) => void;
}

export const FichaTecnicaInventarioPanel: React.FC<Props> = ({
  inmueble,
  currentUser,
  profesional,
  onUpdateInmueble,
}) => {
  const canView = canAccessInventarioInmueble(currentUser, inmueble, profesional);
  const canEdit = canMutateInventario(currentUser, inmueble, profesional);

  const [tab, setTab] = useState<'ficha' | 'inventario'>('ficha');
  const [items, setItems] = useState<ElementoInventario[]>([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaInventario | 'TODAS'>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [savingFicha, setSavingFicha] = useState(false);
  const [fichaMsg, setFichaMsg] = useState('');

  const [provincia, setProvincia] = useState(inmueble.provincia || '');
  const [planta, setPlanta] = useState(inmueble.planta || '');
  const [ascensor, setAscensor] = useState(!!inmueble.ascensor);
  const [terraza, setTerraza] = useState(!!inmueble.terraza);
  const [balcon, setBalcon] = useState(!!inmueble.balcon);
  const [interiorExterior, setInteriorExterior] = useState(inmueble.interiorExterior || 'exterior');
  const [orientacion, setOrientacion] = useState(inmueble.orientacion || '');
  const [anioConstruccion, setAnioConstruccion] = useState(inmueble.anioConstruccion || 0);
  const [estadoConservacion, setEstadoConservacion] = useState(inmueble.estadoConservacion || 'bueno');
  const [tipoInmueble, setTipoInmueble] = useState(inmueble.tipoInmueble || 'piso');
  const [aireAcondicionado, setAireAcondicionado] = useState(!!inmueble.aireAcondicionado);
  const [calefaccion, setCalefaccion] = useState(!!inmueble.calefaccion);
  const [cocinaEquipada, setCocinaEquipada] = useState(!!inmueble.cocinaEquipada);
  const [electrodomesticosIncluidos, setElectrodomesticosIncluidos] = useState(!!inmueble.electrodomesticosIncluidos);
  const [armariosEmpotrados, setArmariosEmpotrados] = useState(!!inmueble.armariosEmpotrados);
  const [tipoVentanas, setTipoVentanas] = useState(inmueble.tipoVentanas || '');
  const [tipoPersianas, setTipoPersianas] = useState(inmueble.tipoPersianas || '');

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<ElementoInventario | null>(null);
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState<CategoriaInventario>('OTROS');
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [estado, setEstado] = useState<EstadoInventario>('BUEN_ESTADO');
  const [ubicacion, setUbicacion] = useState('');
  const [observaciones, setObservaciones] = useState('');

  useEffect(() => {
    setProvincia(inmueble.provincia || '');
    setPlanta(inmueble.planta || '');
    setAscensor(!!inmueble.ascensor);
    setTerraza(!!inmueble.terraza);
    setBalcon(!!inmueble.balcon);
    setInteriorExterior(inmueble.interiorExterior || 'exterior');
    setOrientacion(inmueble.orientacion || '');
    setAnioConstruccion(inmueble.anioConstruccion || 0);
    setEstadoConservacion(inmueble.estadoConservacion || 'bueno');
    setTipoInmueble(inmueble.tipoInmueble || 'piso');
    setAireAcondicionado(!!inmueble.aireAcondicionado);
    setCalefaccion(!!inmueble.calefaccion);
    setCocinaEquipada(!!inmueble.cocinaEquipada);
    setElectrodomesticosIncluidos(!!inmueble.electrodomesticosIncluidos);
    setArmariosEmpotrados(!!inmueble.armariosEmpotrados);
    setTipoVentanas(inmueble.tipoVentanas || '');
    setTipoPersianas(inmueble.tipoPersianas || '');
  }, [inmueble.id]);

  useEffect(() => {
    if (!canView) {
      setItems([]);
      return;
    }
    const unsub = subscribeInventarioInmueble(inmueble.id, setItems);
    return () => unsub();
  }, [inmueble.id, canView]);

  const filtrados = useMemo(() => {
    const byCat = filtrarInventarioPorCategoria(items, categoriaFiltro);
    const q = busqueda.trim().toLowerCase();
    if (!q) return byCat;
    return byCat.filter(
      (i) =>
        i.nombre.toLowerCase().includes(q) ||
        (i.ubicacion || '').toLowerCase().includes(q) ||
        (i.descripcion || '').toLowerCase().includes(q)
    );
  }, [items, categoriaFiltro, busqueda]);

  if (!canView) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800">
        Acceso denegado: no tienes autorización para consultar la ficha o el inventario de este inmueble.
      </div>
    );
  }

  const actor = currentUser?.nombre || currentUser?.email || 'Usuario';

  const handleSaveFicha = () => {
    if (!canEdit || !onUpdateInmueble) return;
    setSavingFicha(true);
    const updated: Inmueble = {
      ...inmueble,
      provincia: provincia.trim() || undefined,
      planta: planta.trim() || undefined,
      ascensor,
      terraza,
      balcon,
      interiorExterior,
      orientacion: orientacion.trim() || undefined,
      anioConstruccion: anioConstruccion || undefined,
      estadoConservacion,
      tipoInmueble,
      aireAcondicionado,
      calefaccion,
      cocinaEquipada,
      electrodomesticosIncluidos,
      armariosEmpotrados,
      tipoVentanas: tipoVentanas.trim() || undefined,
      tipoPersianas: tipoPersianas.trim() || undefined,
      fechaActualizacionFicha: new Date().toISOString(),
      actualizadoPorFicha: actor,
    };
    onUpdateInmueble(updated);
    void registrarHistorialInventarioFirestore({
      inmuebleId: inmueble.id,
      fecha: new Date().toISOString(),
      usuarioId: currentUser?.id,
      usuarioNombre: actor,
      accion: 'FICHA_TECNICA_ACTUALIZADA',
      elementoAfectado: inmueble.id,
      cambios: 'Actualización de ficha técnica',
    });
    setFichaMsg('Ficha técnica guardada');
    setSavingFicha(false);
    setTimeout(() => setFichaMsg(''), 2500);
  };

  const openNew = () => {
    setEditItem(null);
    setNombre('');
    setCategoria('OTROS');
    setDescripcion('');
    setCantidad(1);
    setEstado('BUEN_ESTADO');
    setUbicacion('');
    setObservaciones('');
    setFormOpen(true);
  };

  const openEdit = (item: ElementoInventario) => {
    setEditItem(item);
    setNombre(item.nombre);
    setCategoria(item.categoria);
    setDescripcion(item.descripcion || '');
    setCantidad(item.cantidad);
    setEstado(item.estado);
    setUbicacion(item.ubicacion || '');
    setObservaciones(item.observaciones || '');
    setFormOpen(true);
  };

  const handleSaveItem = async () => {
    if (!canEdit || !nombre.trim()) return;
    const now = new Date().toISOString();
    const id = editItem?.id || `inv_${inmueble.id}_${Date.now()}`;
    const histEntry = {
      id: `hist_${Date.now()}`,
      fecha: now,
      usuarioId: currentUser?.id,
      usuarioNombre: actor,
      accion: editItem ? (editItem.estado !== estado ? 'CAMBIO_ESTADO' : 'MODIFICACION') : 'CREACION',
      elementoAfectado: id,
      estadoAnterior: editItem?.estado,
      estadoNuevo: estado,
      cambios: `${nombre.trim()} · ${CATEGORIA_LABELS[categoria]}`,
    };
    const item: ElementoInventario = {
      id,
      inmuebleId: inmueble.id,
      nombre: nombre.trim(),
      categoria,
      descripcion: descripcion.trim() || undefined,
      cantidad,
      estado,
      ubicacion: ubicacion.trim() || undefined,
      observaciones: observaciones.trim() || undefined,
      fechaAlta: editItem?.fechaAlta || now,
      fechaModificacion: now,
      creadoPor: editItem?.creadoPor || actor,
      actualizadoPor: actor,
      activo: estado !== 'BAJA',
      documentos: editItem?.documentos || [],
      historial: [histEntry, ...(editItem?.historial || [])],
    };
    await saveElementoInventarioFirestore(item);
    await registrarHistorialInventarioFirestore({
      ...histEntry,
      inmuebleId: inmueble.id,
      inventarioId: id,
    });
    setFormOpen(false);
  };

  const handleBaja = async (item: ElementoInventario) => {
    if (!canEdit) return;
    const updated = aplicarBajaLogica(item, actor);
    await saveElementoInventarioFirestore(updated);
    await registrarHistorialInventarioFirestore({
      inmuebleId: inmueble.id,
      inventarioId: item.id,
      fecha: updated.fechaModificacion,
      usuarioId: currentUser?.id,
      usuarioNombre: actor,
      accion: 'BAJA_LOGICA',
      elementoAfectado: item.id,
    });
  };

  const handleUploadDoc = async (item: ElementoInventario, file: File) => {
    if (!canEdit) return;
    const up = await uploadInventarioAdjuntoStorage(inmueble.id, item.id, file, file.name);
    const docItem = {
      id: `doc_${Date.now()}`,
      inventarioId: item.id,
      inmuebleId: inmueble.id,
      nombre: file.name,
      mimeType: file.type,
      url: up.downloadURL,
      storagePath: up.storagePath,
      tamanoBytes: file.size,
      fechaSubida: new Date().toISOString(),
      subidoPor: actor,
    };
    const updated: ElementoInventario = {
      ...item,
      documentos: [...(item.documentos || []), docItem],
      fechaModificacion: new Date().toISOString(),
      actualizadoPor: actor,
      historial: [
        {
          id: `hist_${Date.now()}`,
          fecha: new Date().toISOString(),
          usuarioNombre: actor,
          accion: 'DOCUMENTACION_ANADIDA',
          elementoAfectado: item.id,
          cambios: file.name,
        },
        ...(item.historial || []),
      ],
    };
    await saveElementoInventarioFirestore(updated);
    await registrarHistorialInventarioFirestore({
      inmuebleId: inmueble.id,
      inventarioId: item.id,
      fecha: new Date().toISOString(),
      usuarioId: currentUser?.id,
      usuarioNombre: actor,
      accion: 'DOCUMENTACION_ANADIDA',
      elementoAfectado: item.id,
      cambios: file.name,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <button
          type="button"
          onClick={() => setTab('ficha')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
            tab === 'ficha' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Ficha técnica
        </button>
        <button
          type="button"
          onClick={() => setTab('inventario')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
            tab === 'inventario' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
          }`}
        >
          <Package className="w-4 h-4" />
          Inventario ({items.filter((i) => i.activo !== false && i.estado !== 'BAJA').length})
        </button>
      </div>

      {tab === 'ficha' && (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">ID</span>
              <span className="font-mono font-bold">{inmueble.id}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Referencia</span>
              <span className="font-mono">{inmueble.referenciaCatastral || '—'}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Dirección</span>
              <span className="font-semibold">{inmueble.direccion}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Estado</span>
              <span className="font-semibold">{inmueble.estado}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold mb-1">Localidad</label>
              <input disabled value={inmueble.ciudad} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Provincia</label>
              <input
                disabled={!canEdit}
                value={provincia}
                onChange={(e) => setProvincia(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Código postal</label>
              <input disabled value={inmueble.codigoPostal || ''} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Tipo</label>
              <select
                disabled={!canEdit}
                value={tipoInmueble}
                onChange={(e) => setTipoInmueble(e.target.value as Inmueble['tipoInmueble'])}
                className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg"
              >
                <option value="piso">Piso</option>
                <option value="casa">Casa</option>
                <option value="chalet">Chalet</option>
                <option value="estudio">Estudio</option>
                <option value="atico">Ático</option>
                <option value="duplex">Dúplex</option>
                <option value="habitacion">Habitación</option>
                <option value="local">Local</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold mb-1">Superficie m²</label>
              <input disabled value={inmueble.superficie} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Habitaciones</label>
              <input disabled value={inmueble.habitaciones} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Baños</label>
              <input disabled value={inmueble.banos} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Planta</label>
              <input
                disabled={!canEdit}
                value={planta}
                onChange={(e) => setPlanta(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={ascensor} onChange={(e) => setAscensor(e.target.checked)} />
              Ascensor
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={terraza} onChange={(e) => setTerraza(e.target.checked)} />
              Terraza
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={balcon} onChange={(e) => setBalcon(e.target.checked)} />
              Balcón
            </label>
            <div>
              <label className="block font-semibold mb-1">Exterior / interior</label>
              <select
                disabled={!canEdit}
                value={interiorExterior}
                onChange={(e) => setInteriorExterior(e.target.value as 'exterior' | 'interior' | 'mixto')}
                className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg"
              >
                <option value="exterior">Exterior</option>
                <option value="interior">Interior</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-semibold mb-1">Orientación</label>
              <input disabled={!canEdit} value={orientacion} onChange={(e) => setOrientacion(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Año construcción</label>
              <input
                type="number"
                disabled={!canEdit}
                value={anioConstruccion || ''}
                onChange={(e) => setAnioConstruccion(Number(e.target.value))}
                className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Conservación</label>
              <select
                disabled={!canEdit}
                value={estadoConservacion}
                onChange={(e) => setEstadoConservacion(e.target.value as Inmueble['estadoConservacion'])}
                className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg"
              >
                <option value="nuevo">Nuevo</option>
                <option value="muy_bueno">Muy bueno</option>
                <option value="bueno">Bueno</option>
                <option value="a_reformar">A reformar</option>
                <option value="en_obras">En obras</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">Ventanas</label>
              <input disabled={!canEdit} value={tipoVentanas} onChange={(e) => setTipoVentanas(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={aireAcondicionado} onChange={(e) => setAireAcondicionado(e.target.checked)} />
              Aire acondicionado
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={calefaccion} onChange={(e) => setCalefaccion(e.target.checked)} />
              Calefacción
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={cocinaEquipada} onChange={(e) => setCocinaEquipada(e.target.checked)} />
              Cocina equipada
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={electrodomesticosIncluidos} onChange={(e) => setElectrodomesticosIncluidos(e.target.checked)} />
              Electrodomésticos
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={armariosEmpotrados} onChange={(e) => setArmariosEmpotrados(e.target.checked)} />
              Armarios
            </label>
            <div>
              <label className="block font-semibold mb-1">Persianas</label>
              <input disabled={!canEdit} value={tipoPersianas} onChange={(e) => setTipoPersianas(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-[11px] text-slate-500">
              Última actualización: {inmueble.fechaActualizacionFicha ? new Date(inmueble.fechaActualizacionFicha).toLocaleString('es-ES') : 'sin registrar'}
              {inmueble.actualizadoPorFicha ? ` · ${inmueble.actualizadoPorFicha}` : ''}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveFicha}
                disabled={savingFicha}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                Guardar ficha
              </button>
            )}
          </div>
          {fichaMsg && <p className="text-emerald-700 font-semibold">{fichaMsg}</p>}
        </div>
      )}

      {tab === 'inventario' && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar elemento..."
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border rounded-xl"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value as CategoriaInventario | 'TODAS')}
                className="px-2 py-2 bg-slate-50 border rounded-xl"
              >
                <option value="TODAS">Todas las categorías</option>
                {CATEGORIAS_INVENTARIO.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            {canEdit && (
              <button type="button" onClick={openNew} className="px-3 py-2 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-1">
                <Plus className="w-4 h-4" />
                Alta
              </button>
            )}
          </div>

          {filtrados.length === 0 ? (
            <p className="text-center py-6 text-slate-500">Sin elementos de inventario para este inmueble.</p>
          ) : (
            <div className="divide-y border rounded-xl overflow-hidden">
              {filtrados.map((item) => (
                <div key={item.id} className="p-3 bg-white space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-slate-900">{item.nombre}</strong>
                      <p className="text-[11px] text-slate-500">
                        {CATEGORIA_LABELS[item.categoria]} · {ESTADO_INVENTARIO_LABELS[item.estado]} · x{item.cantidad}
                        {item.ubicacion ? ` · ${item.ubicacion}` : ''}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(item)} className="px-2 py-1 bg-slate-100 rounded-lg font-semibold">
                          Editar
                        </button>
                        {item.estado !== 'BAJA' && (
                          <button type="button" onClick={() => handleBaja(item)} className="px-2 py-1 bg-rose-50 text-rose-700 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {item.descripcion && <p className="text-slate-600">{item.descripcion}</p>}
                  {(item.documentos || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.documentos!.map((d) => (
                        <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="text-blue-700 underline text-[11px]">
                          {d.nombre}
                        </a>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <label className="inline-flex items-center gap-1 text-blue-700 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Foto / documento
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleUploadDoc(item, f);
                        }}
                      />
                    </label>
                  )}
                  {item.historial && item.historial.length > 0 && (
                    <details className="text-[11px] text-slate-500">
                      <summary className="cursor-pointer flex items-center gap-1">
                        <History className="w-3 h-3" /> Histórico
                      </summary>
                      <ul className="mt-1 space-y-0.5">
                        {item.historial.slice(0, 8).map((h) => (
                          <li key={h.id}>
                            {new Date(h.fecha).toLocaleString('es-ES')} · {h.usuarioNombre} · {h.accion}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 text-xs">
            <h4 className="font-bold text-sm">{editItem ? 'Editar elemento' : 'Nuevo elemento de inventario'}</h4>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre *" className="w-full px-3 py-2 border rounded-xl" />
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaInventario)} className="w-full px-3 py-2 border rounded-xl">
              {CATEGORIAS_INVENTARIO.map((c) => (
                <option key={c} value={c}>
                  {CATEGORIA_LABELS[c]}
                </option>
              ))}
            </select>
            <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción" className="w-full px-3 py-2 border rounded-xl" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="px-3 py-2 border rounded-xl" />
              <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoInventario)} className="px-3 py-2 border rounded-xl">
                {ESTADOS_INVENTARIO.map((s) => (
                  <option key={s} value={s}>
                    {ESTADO_INVENTARIO_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ubicación / zona" className="w-full px-3 py-2 border rounded-xl" />
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones" className="w-full px-3 py-2 border rounded-xl" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-3 py-2 bg-slate-100 rounded-xl">
                Cancelar
              </button>
              <button type="button" onClick={() => void handleSaveItem()} className="px-3 py-2 bg-blue-600 text-white rounded-xl font-bold">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
