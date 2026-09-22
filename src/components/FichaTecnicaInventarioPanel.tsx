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
  subscribeHistorialInventario,
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
  crearElementoInventario,
  modificarElementoInventario,
  calcularCompletitudFichaTecnica,
  obtenerResumenInventario,
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
  CheckCircle2,
  Clock,
  Layers,
  FileText,
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

  const [tab, setTab] = useState<'ficha' | 'inventario' | 'historial'>('ficha');
  const [items, setItems] = useState<ElementoInventario[]>([]);
  const [historialGlobal, setHistorialGlobal] = useState<any[]>([]);
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
      setHistorialGlobal([]);
      return;
    }
    const unsubInv = subscribeInventarioInmueble(inmueble.id, setItems);
    const unsubHist = subscribeHistorialInventario(inmueble.id, setHistorialGlobal);
    return () => {
      unsubInv();
      unsubHist();
    };
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

  const completitudFicha = useMemo(() => {
    return calcularCompletitudFichaTecnica(inmueble);
  }, [inmueble]);

  const resumenInventario = useMemo(() => {
    return obtenerResumenInventario(items);
  }, [items]);

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
      cambios: `Actualización de ficha técnica (${completitudFicha.porcentaje}% completada)`,
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
    setCategoria((item.categoria as CategoriaInventario) || 'OTROS');
    setDescripcion(item.descripcion || '');
    setCantidad(item.cantidad || 1);
    setEstado((item.estado as EstadoInventario) || 'BUEN_ESTADO');
    setUbicacion(item.ubicacion || '');
    setObservaciones(item.observaciones || '');
    setFormOpen(true);
  };

  const handleSaveItem = async () => {
    if (!canEdit || !nombre.trim()) return;
    
    if (editItem) {
      const updated = modificarElementoInventario(
        editItem,
        {
          nombre: nombre.trim(),
          categoria,
          descripcion: descripcion.trim() || undefined,
          cantidad,
          estado,
          ubicacion: ubicacion.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
        },
        actor,
        currentUser?.id
      );
      await saveElementoInventarioFirestore(updated);
      await registrarHistorialInventarioFirestore({
        inmuebleId: inmueble.id,
        inventarioId: updated.id,
        fecha: new Date().toISOString(),
        usuarioId: currentUser?.id,
        usuarioNombre: actor,
        accion: editItem.estado !== estado ? 'CAMBIO_ESTADO' : 'MODIFICACION',
        elementoAfectado: updated.id,
        cambios: `${nombre.trim()} (${CATEGORIA_LABELS[categoria]})`,
      });
    } else {
      const nuevo = crearElementoInventario(
        inmueble.id,
        {
          nombre: nombre.trim(),
          categoria,
          descripcion: descripcion.trim() || undefined,
          cantidad,
          estado,
          ubicacion: ubicacion.trim() || undefined,
          observaciones: observaciones.trim() || undefined,
        },
        actor,
        currentUser?.id
      );
      await saveElementoInventarioFirestore(nuevo);
      await registrarHistorialInventarioFirestore({
        inmuebleId: inmueble.id,
        inventarioId: nuevo.id,
        fecha: new Date().toISOString(),
        usuarioId: currentUser?.id,
        usuarioNombre: actor,
        accion: 'CREACION',
        elementoAfectado: nuevo.id,
        cambios: `${nombre.trim()} (${CATEGORIA_LABELS[categoria]})`,
      });
    }
    setFormOpen(false);
  };

  const handleBaja = async (item: ElementoInventario) => {
    if (!canEdit) return;
    const updated = aplicarBajaLogica(item, actor, currentUser?.id);
    await saveElementoInventarioFirestore(updated);
    await registrarHistorialInventarioFirestore({
      inmuebleId: inmueble.id,
      inventarioId: item.id,
      fecha: updated.fechaModificacion || new Date().toISOString(),
      usuarioId: currentUser?.id,
      usuarioNombre: actor,
      accion: 'BAJA_LOGICA',
      elementoAfectado: item.id,
      cambios: `Baja lógica de ${item.nombre}`,
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
          usuarioId: currentUser?.id,
          usuarioNombre: actor,
          accion: 'ADJUNTO_SUBIDO',
          elementoAfectado: item.id,
          cambios: `Adjunto: ${file.name}`,
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
      accion: 'ADJUNTO_SUBIDO',
      elementoAfectado: item.id,
      cambios: `Adjunto: ${file.name}`,
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-4 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">Ficha Técnica & Inventario</h3>
            <p className="text-[11px] text-slate-500">
              Datos constructivos, equipamiento e inventario por estancia de {inmueble.direccion}
            </p>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab('ficha')}
            className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
              tab === 'ficha' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Ficha Técnica ({completitudFicha.porcentaje}%)
          </button>
          <button
            type="button"
            onClick={() => setTab('inventario')}
            className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
              tab === 'inventario' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Inventario ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('historial')}
            className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
              tab === 'historial' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Historial ({historialGlobal.length})
          </button>
        </div>
      </div>

      {tab === 'ficha' && (
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <span className="font-bold text-slate-800">Completitud de la Ficha Técnica: {completitudFicha.porcentaje}%</span>
              <p className="text-[11px] text-slate-500">{completitudFicha.camposCompletados} de {completitudFicha.totalCampos} campos registrados</p>
            </div>
            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${completitudFicha.porcentaje}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold mb-1">Provincia</label>
              <input disabled={!canEdit} value={provincia} onChange={(e) => setProvincia(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Planta / Puerta</label>
              <input disabled={!canEdit} value={planta} onChange={(e) => setPlanta(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Orientación</label>
              <input disabled={!canEdit} value={orientacion} onChange={(e) => setOrientacion(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Año construcción</label>
              <input type="number" disabled={!canEdit} value={anioConstruccion || ''} onChange={(e) => setAnioConstruccion(Number(e.target.value))} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Tipo de inmueble</label>
              <input disabled={!canEdit} value={tipoInmueble} onChange={(e) => setTipoInmueble(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Estado conservación</label>
              <input disabled={!canEdit} value={estadoConservacion} onChange={(e) => setEstadoConservacion(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Tipo de ventanas</label>
              <input disabled={!canEdit} value={tipoVentanas} onChange={(e) => setTipoVentanas(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Tipo de persianas</label>
              <input disabled={!canEdit} value={tipoPersianas} onChange={(e) => setTipoPersianas(e.target.value)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold mb-1">Distribución</label>
              <select disabled={!canEdit} value={interiorExterior} onChange={(e) => setInteriorExterior(e.target.value as any)} className="w-full px-2 py-1.5 bg-slate-50 border rounded-lg">
                <option value="exterior">Exterior</option>
                <option value="interior">Interior</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 pt-2">
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
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={aireAcondicionado} onChange={(e) => setAireAcondicionado(e.target.checked)} />
              Aire acond.
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={calefaccion} onChange={(e) => setCalefaccion(e.target.checked)} />
              Calefacción
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={cocinaEquipada} onChange={(e) => setCocinaEquipada(e.target.checked)} />
              Cocina equip.
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={electrodomesticosIncluidos} onChange={(e) => setElectrodomesticosIncluidos(e.target.checked)} />
              Electrodomésticos
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" disabled={!canEdit} checked={armariosEmpotrados} onChange={(e) => setArmariosEmpotrados(e.target.checked)} />
              Armarios emp.
            </label>
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <span className="text-[11px] text-slate-500">
              Última actualización: {inmueble.fechaActualizacionFicha ? new Date(inmueble.fechaActualizacionFicha).toLocaleString('es-ES') : 'sin registrar'}
              {inmueble.actualizadoPorFicha ? ` · ${inmueble.actualizadoPorFicha}` : ''}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={handleSaveFicha}
                disabled={savingFicha}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors"
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
          {/* Métricas rápidas de inventario */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-500">Total Elementos</span>
              <p className="text-base font-bold text-slate-900">{resumenInventario.totalElementos} ({resumenInventario.totalUnidades} uds.)</p>
            </div>
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-emerald-700">Activos</span>
              <p className="text-base font-bold text-emerald-900">{resumenInventario.activos}</p>
            </div>
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-amber-700">A Reparar</span>
              <p className="text-base font-bold text-amber-900">{resumenInventario.paraReparar}</p>
            </div>
            <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-500">Bajas</span>
              <p className="text-base font-bold text-slate-700">{resumenInventario.bajas}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, zona o descripción..."
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value as CategoriaInventario | 'TODAS')}
                className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl"
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
              <button type="button" onClick={openNew} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1 transition-colors">
                <Plus className="w-4 h-4" />
                Alta Elemento
              </button>
            )}
          </div>

          {filtrados.length === 0 ? (
            <p className="text-center py-6 text-slate-500">Sin elementos de inventario para este inmueble.</p>
          ) : (
            <div className="divide-y border border-slate-200 rounded-xl overflow-hidden">
              {filtrados.map((item) => (
                <div key={item.id} className="p-3 bg-white space-y-2 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-slate-900 text-sm">{item.nombre}</strong>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        <span className="font-semibold text-slate-700">{CATEGORIA_LABELS[item.categoria as CategoriaInventario] || item.categoria}</span> · <span className="text-blue-700 font-semibold">{ESTADO_INVENTARIO_LABELS[item.estado as EstadoInventario] || item.estado}</span> · x{item.cantidad || 1}
                        {item.ubicacion ? ` · 📍 ${item.ubicacion}` : ''}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => openEdit(item)} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold transition-colors">
                          Editar
                        </button>
                        {item.estado !== 'BAJA' && (
                          <button type="button" onClick={() => handleBaja(item)} className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg transition-colors" title="Dar de baja">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {item.descripcion && <p className="text-slate-600">{item.descripcion}</p>}
                  {(item.documentos || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {item.documentos!.map((d) => (
                        <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px] hover:underline">
                          <FileText className="w-3 h-3" /> {d.nombre}
                        </a>
                      ))}
                    </div>
                  )}
                  {canEdit && (
                    <label className="inline-flex items-center gap-1 text-blue-700 cursor-pointer pt-1 font-medium hover:underline">
                      <Upload className="w-3.5 h-3.5" />
                      Adjuntar factura / foto
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
                    <details className="text-[11px] text-slate-500 pt-1">
                      <summary className="cursor-pointer flex items-center gap-1 font-medium text-slate-600">
                        <History className="w-3 h-3" /> Ver historial ({item.historial.length})
                      </summary>
                      <ul className="mt-1 space-y-0.5 pl-4 border-l-2 border-slate-200">
                        {item.historial.slice(0, 8).map((h) => (
                          <li key={h.id}>
                            <span className="font-semibold text-slate-700">{new Date(h.fecha).toLocaleString('es-ES')}</span> · {h.usuarioNombre} · <span className="italic">{h.accion}</span> {h.cambios ? `(${h.cambios})` : ''}
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

      {tab === 'historial' && (
        <div className="space-y-3 text-xs">
          <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
            <Clock className="w-4 h-4 text-blue-600" />
            <span className="font-bold text-slate-800">Trazabilidad Inmutable de Inventario y Ficha Técnica</span>
          </div>

          {historialGlobal.length === 0 ? (
            <p className="text-center py-6 text-slate-500">Sin eventos registrados para este inmueble.</p>
          ) : (
            <div className="divide-y border border-slate-200 rounded-xl overflow-hidden">
              {historialGlobal.map((h) => (
                <div key={h.id} className="p-3 bg-white space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-800">{h.accion}</span>
                    <span className="text-slate-400">{new Date(h.fecha || h.timestamp || 0).toLocaleString('es-ES')}</span>
                  </div>
                  <p className="text-slate-600">{h.cambios || 'Evento de inventario'}</p>
                  <p className="text-[10px] text-slate-400">Registrado por: {h.usuarioNombre || 'Sistema'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3 text-xs shadow-xl">
            <h4 className="font-bold text-sm text-slate-900">{editItem ? 'Editar elemento de inventario' : 'Nuevo elemento de inventario'}</h4>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nombre *</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Frigorífico combi, Sofá 3 plazas..." className="w-full px-3 py-2 border rounded-xl" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Categoría</label>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaInventario)} className="w-full px-3 py-2 border rounded-xl">
                {CATEGORIAS_INVENTARIO.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Descripción</label>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Marca, modelo, número de serie..." className="w-full px-3 py-2 border rounded-xl" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cantidad</label>
                <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} className="w-full px-3 py-2 border rounded-xl" />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Estado</label>
                <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoInventario)} className="w-full px-3 py-2 border rounded-xl">
                  {ESTADOS_INVENTARIO.map((s) => (
                    <option key={s} value={s}>
                      {ESTADO_INVENTARIO_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ubicación / Estancia</label>
              <input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej: Habitación 1, Cocina, Salón principal..." className="w-full px-3 py-2 border rounded-xl" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Observaciones</label>
              <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Notas de uso, mantenimiento o garantías..." className="w-full px-3 py-2 border rounded-xl" rows={2} />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button type="button" onClick={() => setFormOpen(false)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={() => void handleSaveItem()} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};