import React, { useState, useMemo, useEffect } from 'react';
import {
  Gasto,
  Inmueble,
  UsuarioApp,
  CategoriaGasto,
  EstadoGasto,
  Propietario,
  CATEGORIA_GASTO_LABELS,
  ESTADO_GASTO_LABELS,
  DocumentoGasto,
  HistorialGastoItem,
} from '../../types';
import {
  calcularTotalesPorCategoria,
  calcularTotalGastos,
  obtenerDireccionGasto,
  canAccessGasto,
} from '../../utils/gastosEngine';
import {
  TrendingDown,
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  FileText,
  Upload,
  Euro,
  Calendar,
  Building2,
  History,
  Eye,
  X,
  Download,
  Paperclip,
  AlertCircle,
} from 'lucide-react';
import {
  saveGastoFirestore,
  deleteGastoFirestore,
  uploadGastoDocumentoStorage,
  subscribeGastosSeguros,
} from '../../lib/firebase';

interface GastosSectionProps {
  gastos?: Gasto[];
  inmuebles: Inmueble[];
  propietarios?: Propietario[];
  currentUser?: UsuarioApp | null;
  modo?: 'ADMIN' | 'PROPIETARIO';
  onSaveGasto?: (gasto: Gasto) => Promise<void>;
  onDeleteGasto?: (gastoId: string) => Promise<void>;
}

export const GastosSection: React.FC<GastosSectionProps> = ({
  gastos: gastosProp,
  inmuebles,
  propietarios = [],
  currentUser,
  modo = 'ADMIN',
  onSaveGasto,
  onDeleteGasto,
}) => {
  const isOwner = modo === 'PROPIETARIO' || currentUser?.tipoPerfil === 'PROPIETARIO';
  const [gastosState, setGastosState] = useState<Gasto[]>(gastosProp || []);
  const [loading, setLoading] = useState(!gastosProp);

  useEffect(() => {
    if (gastosProp) {
      setGastosState(gastosProp);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeGastosSeguros(currentUser as any, (items) => {
      setGastosState(items);
      setLoading(false);
    });
    return () => unsub();
  }, [gastosProp, currentUser?.id, (currentUser as any)?.propietarioId, JSON.stringify((currentUser as any)?.inmuebleIds)]);

  const gastos = gastosProp || gastosState;

  // Filtros
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>('TODOS');
  const [selectedCategoria, setSelectedCategoria] = useState<CategoriaGasto | 'TODOS'>('TODOS');
  const [selectedEstado, setSelectedEstado] = useState<EstadoGasto | 'TODOS'>('TODOS');
  const [selectedYear, setSelectedYear] = useState<number | 'TODOS'>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gastoToEdit, setGastoToEdit] = useState<Gasto | null>(null);
  const [gastoParaHistorial, setGastoParaHistorial] = useState<Gasto | null>(null);
  const [gastoParaVerDoc, setGastoParaVerDoc] = useState<Gasto | null>(null);

  // Formulario
  const [formInmuebleId, setFormInmuebleId] = useState('');
  const [formFecha, setFormFecha] = useState(new Date().toISOString().split('T')[0]);
  const [formConcepto, setFormConcepto] = useState('');
  const [formCategoria, setFormCategoria] = useState<CategoriaGasto>('MANTENIMIENTO');
  const [formImporte, setFormImporte] = useState<number>(0);
  const [formProveedor, setFormProveedor] = useState('');
  const [formEstado, setFormEstado] = useState<EstadoGasto>('PAGADO');
  const [formObservaciones, setFormObservaciones] = useState('');
  const [formDocFile, setFormDocFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Inmuebles visibles según seguridad (reutiliza lógica propietario)
  const inmueblesVisibles = useMemo(() => {
    if (!currentUser) return inmuebles;
    if (currentUser.tipoPerfil === 'ADMINISTRADOR') return inmuebles;
    if (currentUser.tipoPerfil === 'PROPIETARIO') {
      return inmuebles.filter((inm) => {
        if (currentUser.propietarioId && inm.propietarioPrincipalId === currentUser.propietarioId) return true;
        if (currentUser.inmuebleIds && currentUser.inmuebleIds.includes(inm.id)) return true;
        return false;
      });
    }
    return [];
  }, [inmuebles, currentUser]);

  // Gastos filtrados por seguridad + filtros UI
  const filteredGastos = useMemo(() => {
    let base = gastos;
    // Seguridad: propietario solo autorizados (canAccessGasto)
    if (currentUser?.tipoPerfil === 'PROPIETARIO') {
      base = base.filter((g) => canAccessGasto(g, currentUser));
    } else if (currentUser?.tipoPerfil === 'PROFESIONAL') {
      base = [];
    }

    return base.filter((g) => {
      if (selectedInmuebleId !== 'TODOS' && g.inmuebleId !== selectedInmuebleId) return false;
      if (selectedCategoria !== 'TODOS' && g.categoria !== selectedCategoria) return false;
      if (selectedEstado !== 'TODOS' && g.estado !== selectedEstado) return false;
      if (selectedYear !== 'TODOS') {
        const y = new Date(g.fecha).getFullYear();
        if (y !== selectedYear) return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesConcepto = g.concepto.toLowerCase().includes(term);
        const matchesProveedor = g.proveedor?.toLowerCase().includes(term);
        const matchesDireccion = g.inmuebleDireccion?.toLowerCase().includes(term);
        if (!matchesConcepto && !matchesProveedor && !matchesDireccion) return false;
      }
      return true;
    });
  }, [gastos, currentUser, selectedInmuebleId, selectedCategoria, selectedEstado, selectedYear, searchTerm]);

  const totalesPorCategoria = useMemo(() => calcularTotalesPorCategoria(filteredGastos), [filteredGastos]);
  const totalGeneral = useMemo(() => calcularTotalGastos(filteredGastos), [filteredGastos]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    years.add(currentYear - 1);
    gastos.forEach((g) => {
      try {
        years.add(new Date(g.fecha).getFullYear());
      } catch {}
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [gastos]);

  const resetForm = () => {
    setFormInmuebleId(inmueblesVisibles[0]?.id || '');
    setFormFecha(new Date().toISOString().split('T')[0]);
    setFormConcepto('');
    setFormCategoria('MANTENIMIENTO');
    setFormImporte(0);
    setFormProveedor('');
    setFormEstado('PAGADO');
    setFormObservaciones('');
    setFormDocFile(null);
  };

  const openCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEdit = (gasto: Gasto) => {
    setGastoToEdit(gasto);
    setFormInmuebleId(gasto.inmuebleId);
    setFormFecha(gasto.fecha);
    setFormConcepto(gasto.concepto);
    setFormCategoria(gasto.categoria);
    setFormImporte(gasto.importe);
    setFormProveedor(gasto.proveedor || '');
    setFormEstado(gasto.estado);
    setFormObservaciones(gasto.observaciones || '');
    setFormDocFile(null);
    setShowCreateModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formInmuebleId || !formConcepto.trim() || formImporte < 0) {
      alert('Completa inmueble, concepto e importe válido');
      return;
    }
    setIsSaving(true);
    try {
      const inmueble = inmuebles.find((i) => i.id === formInmuebleId);
      const propietarioId = inmueble?.propietarioPrincipalId || inmueble?.propietarioId || propietarios.find((p) => p.id === inmueble?.propietarioPrincipalId)?.id;

      let documento: DocumentoGasto | undefined = gastoToEdit?.documento;
      let documentos = gastoToEdit?.documentos || [];
      const historial: HistorialGastoItem[] = gastoToEdit?.historial ? [...gastoToEdit.historial] : [];

      // Subida documento si hay archivo
      if (formDocFile) {
        const gastoIdTemp = gastoToEdit?.id || `gasto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const { downloadUrl, storagePath } = await uploadGastoDocumentoStorage(gastoIdTemp, formDocFile, formDocFile.name);
        const newDoc: DocumentoGasto = {
          id: `doc_${Date.now()}`,
          nombre: formDocFile.name,
          tipo: formDocFile.name.toLowerCase().endsWith('.pdf') ? 'FACTURA' : formDocFile.type.includes('image') ? 'TICKET' : 'RECIBO',
          url: downloadUrl,
          storagePath,
          fechaSubida: new Date().toISOString(),
          tamanoBytes: formDocFile.size,
          mimeType: formDocFile.type,
          subidoPor: currentUser?.nombre || currentUser?.email || 'Usuario',
          subidoPorId: currentUser?.id,
        };
        documento = newDoc;
        documentos = [newDoc, ...documentos];

        // Historial sustitución doc
        historial.push({
          id: `hist_${Date.now()}`,
          fecha: new Date().toISOString(),
          usuario: currentUser?.nombre || currentUser?.email || 'Usuario',
          usuarioId: currentUser?.id,
          accion: gastoToEdit?.documento ? 'SUSTITUCION_DOCUMENTO' : 'DOCUMENTO_ADJUNTADO',
          detalle: gastoToEdit?.documento ? `Sustitución documento: ${formDocFile.name}` : `Documento adjuntado: ${formDocFile.name}`,
          valorNuevo: formDocFile.name,
        });
      }

      const nowIso = new Date().toISOString();
      const isNew = !gastoToEdit;

      if (isNew) {
        historial.push({
          id: `hist_${Date.now()}`,
          fecha: nowIso,
          usuario: currentUser?.nombre || currentUser?.email || 'Sistema',
          usuarioId: currentUser?.id,
          accion: 'CREACION',
          detalle: `Gasto creado: ${formConcepto} - ${formImporte}€`,
        });
      } else {
        // Detectar cambios relevantes para histórico
        if (gastoToEdit.importe !== formImporte) {
          historial.push({
            id: `hist_${Date.now()}_imp`,
            fecha: nowIso,
            usuario: currentUser?.nombre || 'Usuario',
            usuarioId: currentUser?.id,
            accion: 'MODIFICACION_IMPORTE',
            detalle: `Importe modificado`,
            valorAnterior: `${gastoToEdit.importe}€`,
            valorNuevo: `${formImporte}€`,
          });
        }
        if (gastoToEdit.categoria !== formCategoria) {
          historial.push({
            id: `hist_${Date.now()}_cat`,
            fecha: nowIso,
            usuario: currentUser?.nombre || 'Usuario',
            usuarioId: currentUser?.id,
            accion: 'MODIFICACION_CATEGORIA',
            detalle: `Categoría modificada`,
            valorAnterior: gastoToEdit.categoria,
            valorNuevo: formCategoria,
          });
        }
        if (gastoToEdit.inmuebleId !== formInmuebleId) {
          historial.push({
            id: `hist_${Date.now()}_inm`,
            fecha: nowIso,
            usuario: currentUser?.nombre || 'Usuario',
            usuarioId: currentUser?.id,
            accion: 'MODIFICACION_INMUEBLE',
            detalle: `Inmueble modificado`,
            valorAnterior: gastoToEdit.inmuebleDireccion || gastoToEdit.inmuebleId,
            valorNuevo: inmueble?.direccion || formInmuebleId,
          });
        }
        if (gastoToEdit.concepto !== formConcepto) {
          historial.push({
            id: `hist_${Date.now()}_con`,
            fecha: nowIso,
            usuario: currentUser?.nombre || 'Usuario',
            usuarioId: currentUser?.id,
            accion: 'MODIFICACION_CONCEPTO',
            detalle: `Concepto modificado`,
            valorAnterior: gastoToEdit.concepto,
            valorNuevo: formConcepto,
          });
        }
        if (gastoToEdit.estado !== formEstado) {
          historial.push({
            id: `hist_${Date.now()}_est`,
            fecha: nowIso,
            usuario: currentUser?.nombre || 'Usuario',
            usuarioId: currentUser?.id,
            accion: 'MODIFICACION_ESTADO',
            detalle: `Estado modificado`,
            valorAnterior: gastoToEdit.estado,
            valorNuevo: formEstado,
          });
        }
      }

      const gastoToSave: Gasto = {
        id: gastoToEdit?.id || `gasto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        inmuebleId: formInmuebleId,
        inmuebleDireccion: inmueble?.direccion || obtenerDireccionGasto({ inmuebleId: formInmuebleId } as Gasto, inmuebles),
        propietarioId,
        fecha: formFecha,
        concepto: formConcepto.trim(),
        categoria: formCategoria,
        importe: Number(formImporte),
        proveedor: formProveedor.trim() || undefined,
        estado: formEstado,
        documento,
        documentos,
        observaciones: formObservaciones.trim() || undefined,
        historial,
        createdAt: gastoToEdit?.createdAt || nowIso,
        updatedAt: nowIso,
        creadoPor: gastoToEdit?.creadoPor || currentUser?.nombre || currentUser?.email || 'Usuario',
        creadoPorId: gastoToEdit?.creadoPorId || currentUser?.id,
      };

      if (onSaveGasto) {
        await onSaveGasto(gastoToSave);
      } else {
        await saveGastoFirestore(gastoToSave);
      }

      setShowCreateModal(false);
      setGastoToEdit(null);
      resetForm();
    } catch (err) {
      console.error('Error guardando gasto', err);
      alert('Error al guardar gasto');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (gasto: Gasto) => {
    if (!confirm(`¿Eliminar gasto "${gasto.concepto}" de ${gasto.importe}€?`)) return;
    try {
      if (onDeleteGasto) {
        await onDeleteGasto(gasto.id);
      } else {
        await deleteGastoFirestore(gasto.id);
      }
    } catch (err) {
      console.error('Error eliminando gasto', err);
      alert('Error al eliminar');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 text-sm">Cargando gastos patrimoniales...</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {isOwner ? 'Mis Gastos Patrimoniales' : 'Gestión de Gastos Patrimoniales'}
            </h2>
            <p className="text-xs text-slate-500">
              Circuito: GASTO → INMUEBLE (oficial) → CATEGORÍA → DOCUMENTO → HISTÓRICO · Total {filteredGastos.length} registros
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Gasto</span>
        </button>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Total Gastos Filtrados</span>
            <Euro className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {totalGeneral.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </div>
          <div className="text-[11px] text-slate-500">{filteredGastos.length} gastos</div>
        </div>
        {(Object.entries(totalesPorCategoria) as [CategoriaGasto, number][])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cat, total]) => {
            const label = CATEGORIA_GASTO_LABELS[cat];
            return (
              <div key={cat} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="truncate">{label?.label || cat}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${label?.badgeClass || 'bg-slate-100'}`}>
                    {cat}
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                  {total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                </div>
              </div>
            );
          })}
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Filter className="w-4 h-4 text-amber-600" />
          <span>Filtrar Gastos por Inmueble, Categoría y Documento</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Inmueble (oficial)</label>
            <select
              value={selectedInmuebleId}
              onChange={(e) => setSelectedInmuebleId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
            >
              <option value="TODOS">Todos los inmuebles</option>
              {inmueblesVisibles.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.alias || i.direccion} ({i.ciudad})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Categoría</label>
            <select
              value={selectedCategoria}
              onChange={(e) => setSelectedCategoria(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
            >
              <option value="TODOS">Todas categorías</option>
              {Object.entries(CATEGORIA_GASTO_LABELS).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Estado</label>
            <select
              value={selectedEstado}
              onChange={(e) => setSelectedEstado(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
            >
              <option value="TODOS">Todos estados</option>
              {Object.entries(ESTADO_GASTO_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Año</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value === 'TODOS' ? 'TODOS' : Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
            >
              <option value="TODOS">Todos años</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-600 mb-1">Buscar</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Concepto, proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-3" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-sm text-slate-900">Listado Gastos ({filteredGastos.length})</h3>
          </div>
          <span className="text-xs text-slate-500">Inmueble → Categoría → Documento → Histórico</span>
        </div>

        {filteredGastos.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <TrendingDown className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-700 text-sm">No hay gastos para este filtro</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Crea tu primer gasto vinculándolo a un inmueble oficial, categoría existente y adjunta factura/ticket/recibo usando storagePath/downloadURL.
            </p>
            <button onClick={openCreate} className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold">
              Crear Gasto Ahora
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-[10px] uppercase font-bold tracking-wider border-b">
                <tr>
                  <th className="py-3 px-4">Fecha / Concepto</th>
                  <th className="py-3 px-4">Inmueble Oficial</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4 text-right">Importe</th>
                  <th className="py-3 px-4 text-center">Documento</th>
                  <th className="py-3 px-4 text-center">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredGastos.map((gasto) => {
                  const catLabel = CATEGORIA_GASTO_LABELS[gasto.categoria];
                  const estLabel = ESTADO_GASTO_LABELS[gasto.estado];
                  return (
                    <tr key={gasto.id} className="hover:bg-slate-50/80">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{gasto.fecha}</span>
                        </div>
                        <div className="font-semibold text-slate-800 truncate max-w-[220px]">{gasto.concepto}</div>
                        {gasto.proveedor && <div className="text-[11px] text-slate-500">{gasto.proveedor}</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate max-w-[180px]">{gasto.inmuebleDireccion || gasto.inmuebleId}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{gasto.inmuebleId}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold border ${catLabel?.badgeClass || 'bg-slate-100'}`}>
                          {catLabel?.label || gasto.categoria}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        <span className={gasto.estado === 'ANULADO' ? 'line-through text-slate-400' : 'text-slate-900'}>
                          {gasto.importe.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {gasto.documento ? (
                          <button
                            onClick={() => setGastoParaVerDoc(gasto)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-[11px] font-bold"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[80px]">{gasto.documento.nombre}</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sin doc</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold border ${estLabel?.badgeClass || 'bg-slate-100'}`}>
                          {estLabel?.label || gasto.estado}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(gasto)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => setGastoParaHistorial(gasto)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
                            <History className="w-4 h-4" />
                          </button>
                          {!isOwner && (
                            <button onClick={() => handleDelete(gasto)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear/Editar */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-lg overflow-hidden animate-in fade-in max-h-[90vh] flex flex-col">
            <div className="p-4 border-b bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5" />
                <h3 className="font-bold">{gastoToEdit ? 'Editar Gasto' : 'Nuevo Gasto Patrimonial'}</h3>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setGastoToEdit(null);
                }}
                className="p-1 text-amber-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Inmueble Oficial *</label>
                  <select
                    required
                    value={formInmuebleId}
                    onChange={(e) => setFormInmuebleId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
                  >
                    <option value="">Selecciona inmueble</option>
                    {inmueblesVisibles.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.alias || i.direccion} - {i.ciudad}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Fecha *</label>
                  <input
                    type="date"
                    required
                    value={formFecha}
                    onChange={(e) => setFormFecha(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Categoría *</label>
                  <select
                    value={formCategoria}
                    onChange={(e) => setFormCategoria(e.target.value as CategoriaGasto)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl font-semibold"
                  >
                    {Object.entries(CATEGORIA_GASTO_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Concepto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. IBI 2026, Seguro hogar, Reparación caldera..."
                    value={formConcepto}
                    onChange={(e) => setFormConcepto(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Importe € *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formImporte}
                    onChange={(e) => setFormImporte(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Estado</label>
                  <select
                    value={formEstado}
                    onChange={(e) => setFormEstado(e.target.value as EstadoGasto)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl font-semibold"
                  >
                    {Object.entries(ESTADO_GASTO_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Proveedor (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. Iberdrola, Mapfre, Comunidad..."
                    value={formProveedor}
                    onChange={(e) => setFormProveedor(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Documento justificativo (factura/ticket/recibo) - storagePath/downloadURL</label>
                  {gastoToEdit?.documento && !formDocFile && (
                    <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="font-bold text-blue-900">{gastoToEdit.documento.nombre}</span>
                      </div>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">Actual</span>
                    </div>
                  )}
                  <div className="border border-dashed border-slate-300 rounded-xl p-3 text-center bg-slate-50">
                    <input
                      type="file"
                      id="gastoDocUpload"
                      accept=".pdf,image/*"
                      onChange={(e) => e.target.files && setFormDocFile(e.target.files[0])}
                      className="hidden"
                    />
                    <label htmlFor="gastoDocUpload" className="cursor-pointer flex flex-col items-center gap-1">
                      <Upload className="w-5 h-5 text-slate-400" />
                      <span className="font-semibold">
                        {formDocFile ? `Seleccionado: ${formDocFile.name}` : 'Adjuntar factura / ticket / recibo'}
                      </span>
                      <span className="text-[10px] text-slate-400">Reutiliza storagePath/downloadURL existente, no segundo sistema Storage</span>
                    </label>
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">Observaciones</label>
                  <textarea
                    rows={2}
                    value={formObservaciones}
                    onChange={(e) => setFormObservaciones(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl"
                    placeholder="Notas internas..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setGastoToEdit(null);
                  }}
                  className="px-4 py-2 border rounded-xl font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>{isSaving ? 'Guardando...' : gastoToEdit ? 'Guardar Cambios' : 'Crear Gasto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Historial */}
      {gastoParaHistorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col">
            <div className="p-4 border-b bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold">Histórico Gasto</h3>
              </div>
              <button onClick={() => setGastoParaHistorial(null)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              <div className="p-3 bg-slate-50 border rounded-xl">
                <div className="font-bold text-sm">{gastoParaHistorial.concepto}</div>
                <div className="text-slate-600">{gastoParaHistorial.inmuebleDireccion} · {gastoParaHistorial.fecha} · {gastoParaHistorial.importe}€</div>
              </div>
              <h4 className="font-bold flex items-center gap-1.5">
                <History className="w-4 h-4" />
                Cambios Registrados (creación, importe, categoría, inmueble, documento, estado)
              </h4>
              {gastoParaHistorial.historial && gastoParaHistorial.historial.length > 0 ? (
                <div className="space-y-2 border-l-2 border-slate-200 pl-3 ml-1">
                  {gastoParaHistorial.historial
                    .slice()
                    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                    .map((h) => (
                      <div key={h.id} className="bg-slate-50 p-2.5 rounded-xl border">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{h.accion}</span>
                          <span className="text-[10px] text-slate-400">{new Date(h.fecha).toLocaleString('es-ES')}</span>
                        </div>
                        {h.detalle && <p className="text-slate-600">{h.detalle}</p>}
                        {(h.valorAnterior || h.valorNuevo) && (
                          <div className="text-[11px] mt-1">
                            {h.valorAnterior && <span className="text-rose-600 line-through mr-2">{h.valorAnterior}</span>}
                            {h.valorNuevo && <span className="text-emerald-700 font-bold">{h.valorNuevo}</span>}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 pt-1 border-t mt-1">Usuario: {h.usuario}</div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-slate-400 italic">Sin histórico registrado (gasto antiguo compatible)</p>
              )}
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button onClick={() => setGastoParaHistorial(null)} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Documento */}
      {gastoParaVerDoc && gastoParaVerDoc.documento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b bg-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                <h3 className="font-bold">Documento Justificativo</h3>
              </div>
              <button onClick={() => setGastoParaVerDoc(null)} className="p-1 text-blue-200 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border rounded-xl">
                <div className="font-bold">{gastoParaVerDoc.documento.nombre}</div>
                <div className="text-slate-500">
                  Tipo: {gastoParaVerDoc.documento.tipo} · {gastoParaVerDoc.documento.mimeType} ·{' '}
                  {gastoParaVerDoc.documento.tamanoBytes ? `${(gastoParaVerDoc.documento.tamanoBytes / 1024).toFixed(1)} KB` : ''}
                </div>
                <div className="text-slate-500">Subido: {new Date(gastoParaVerDoc.documento.fechaSubida).toLocaleString('es-ES')} por {gastoParaVerDoc.documento.subidoPor}</div>
                <div className="text-[10px] font-mono text-slate-400 mt-1 break-all">storagePath: {gastoParaVerDoc.documento.storagePath}</div>
              </div>
              <div className="flex gap-2">
                <a
                  href={gastoParaVerDoc.documento.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5"
                >
                  <Eye className="w-4 h-4" />
                  Ver / Descargar
                </a>
                <a
                  href={gastoParaVerDoc.documento.url}
                  download={gastoParaVerDoc.documento.nombre}
                  className="px-4 py-2 border rounded-xl font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Descargar
                </a>
              </div>
              {gastoParaVerDoc.documentos && gastoParaVerDoc.documentos.length > 1 && (
                <div>
                  <h4 className="font-bold mb-2">Histórico documentos ({gastoParaVerDoc.documentos.length})</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {gastoParaVerDoc.documentos.map((d) => (
                      <div key={d.id} className="flex items-center justify-between p-2 bg-slate-50 border rounded-lg">
                        <span className="truncate">{d.nombre}</span>
                        <span className="text-[10px] text-slate-400">{new Date(d.fechaSubida).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-slate-50 flex justify-end">
              <button onClick={() => setGastoParaVerDoc(null)} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
