/** BLOQUE E — Incidencias del inquilino: seguimiento saneado + nueva avería con fotos. */
import React, { useMemo, useState } from 'react';
import { Camera, ChevronDown, Plus, User, Wrench, X } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, saveIncidenciaFirestore } from '../../lib/firebase';
import {
  auditarAccionPortal,
  subirEvidenciaIncidencia,
  vincularIncidenciaAContrato,
} from '../../lib/suministrosFirestore';
import { crearHistorialItem } from '../../utils/incidenciasEngine';
import { sanearIncidenciaParaInquilino, validarIncidenciaInquilino } from '../../inquilino/portalEngine';
import type {
  AdjuntoIncidencia,
  CategoriaIncidencia,
  ContratoFormalizacion,
  Incidencia,
  Inmueble,
  PrioridadIncidencia,
  UsuarioApp,
} from '../../types';
import { MiniaturaEvidencia } from './MiniaturaEvidencia';

interface Props {
  usuario: UsuarioApp;
  contrato: ContratoFormalizacion;
  inmueble: Inmueble | null;
  incidencias: Incidencia[];
  onCambio: () => void;
}

const ESTADO_CLASE: Record<string, string> = {
  ABIERTA: 'bg-amber-100 text-amber-800',
  EN_CURSO: 'bg-blue-100 text-blue-800',
  RESUELTA: 'bg-emerald-100 text-emerald-800',
  CERRADA: 'bg-slate-200 text-slate-600',
};

// BLOQUE E (reconciliado): categorías canónicas de incidencia (Arena A).
const CATEGORIAS: CategoriaIncidencia[] = [
  'FONTANERIA', 'ELECTRICIDAD', 'CALEFACCION_ACS', 'CERRAJERIA', 'ELECTRODOMESTICOS',
  'HUMEDADES', 'CARPINTERIA', 'PINTURA', 'CRISTALERIA', 'PLAGAS_SANEAMIENTO', 'LIMPIEZA', 'OTROS',
];

export const PortalIncidencias: React.FC<Props> = ({ usuario, contrato, inmueble, incidencias, onCambio }) => {
  const [expandida, setExpandida] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  const vms = useMemo(() => incidencias.map(sanearIncidenciaParaInquilino), [incidencias]);

  return (
    <div className="space-y-3">
      {vms.length === 0 && (
        <div className="text-center py-10">
          <Wrench className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="mt-2 text-sm text-slate-500 font-medium">No tienes averías registradas.</p>
        </div>
      )}

      {vms.map((vm) => (
        <article key={vm.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setExpandida(expandida === vm.id ? null : vm.id)}
            className="w-full p-4 text-left cursor-pointer"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold">{vm.titulo}</h3>
                <p className="text-[11px] text-slate-500 capitalize">
                  {vm.categoria.toLowerCase()} · {new Date(vm.fechaCreacion).toLocaleDateString('es-ES')}
                </p>
              </div>
              <span className="flex items-center gap-1 shrink-0">
                <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${ESTADO_CLASE[vm.estado] || 'bg-slate-100 text-slate-700'}`}>
                  {vm.estado.replace('_', ' ')}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandida === vm.id ? 'rotate-180' : ''}`} />
              </span>
            </div>
          </button>

          {expandida === vm.id && (
            <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-700 leading-relaxed">{vm.descripcion}</p>
              {vm.resolucion && (
                <p className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl p-2.5">
                  <strong>Resolución:</strong> {vm.resolucion}
                </p>
              )}

              {vm.trabajo && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="flex items-center gap-1.5 text-xs font-bold">
                    <User className="w-3.5 h-3.5 text-indigo-700" /> {vm.trabajo.profesionalNombre}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">{vm.trabajo.servicio}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Estado: <strong>{vm.trabajo.estadoTrabajo.replace('_', ' ')}</strong>
                    {vm.trabajo.fechaInicio && ` · Inicio: ${new Date(vm.trabajo.fechaInicio).toLocaleDateString('es-ES')}`}
                    {vm.trabajo.fechaFinalizacion && ` · Fin: ${new Date(vm.trabajo.fechaFinalizacion).toLocaleDateString('es-ES')}`}
                  </p>
                </div>
              )}

              {vm.seguimiento.length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Seguimiento</p>
                  <ol className="space-y-1.5 border-l-2 border-indigo-100 ml-1 pl-3">
                    {vm.seguimiento.map((p, i) => (
                      <li key={i} className="text-xs">
                        <span className="font-bold">{p.accion.replaceAll('_', ' ')}</span>{' '}
                        <span className="text-slate-500">{new Date(p.fecha).toLocaleDateString('es-ES')}</span>
                        {p.detalle && <span className="block text-slate-600">{p.detalle}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {(vm.fotografias.length > 0 || vm.documentos.length > 0) && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Evidencias</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[...vm.fotografias, ...vm.documentos].map((a) => (
                      <MiniaturaEvidencia key={a.id} nombre={a.nombre} url={a.url} storagePath={a.storagePath} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </article>
      ))}

      <button
        onClick={() => setModalAbierto(true)}
        className="fixed bottom-20 right-1/2 translate-x-[calc(224px-2rem)] sm:translate-x-[calc(224px-2rem)] w-14 h-14 bg-indigo-700 hover:bg-indigo-800 text-white rounded-full shadow-xl flex items-center justify-center cursor-pointer z-10"
        aria-label="Notificar avería"
      >
        <Plus className="w-6 h-6" />
      </button>

      {modalAbierto && (
        <NuevaIncidenciaModal
          usuario={usuario}
          contrato={contrato}
          inmueble={inmueble}
          onCerrar={() => setModalAbierto(false)}
          onCreada={() => {
            setModalAbierto(false);
            onCambio();
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

function NuevaIncidenciaModal({
  usuario, contrato, inmueble, onCerrar, onCreada,
}: {
  usuario: UsuarioApp;
  contrato: ContratoFormalizacion;
  inmueble: Inmueble | null;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState<CategoriaIncidencia>('OTROS');
  const [prioridad, setPrioridad] = useState<PrioridadIncidencia>('NORMAL');
  const [fotos, setFotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const anadirFotos = (list: FileList | null) => {
    if (!list) return;
    const validas = Array.from(list).filter((f) => f.type.startsWith('image/')).slice(0, 6 - fotos.length);
    setFotos([...fotos, ...validas]);
  };

  const guardar = async () => {
    const v = validarIncidenciaInquilino({ titulo, descripcion });
    if (!v.ok) {
      setError(v.errores[0]);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const ahora = new Date().toISOString();
      const nombre = `${usuario.nombre} ${usuario.apellidos || ''}`.trim();
      const incidencia: Incidencia = {
        id: `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        propietarioId: contrato.propietarioId || inmueble?.propietarioId || 'sin_asignar',
        inmuebleId: contrato.inmuebleId,
        inmuebleDireccion: contrato.inmuebleDireccion,
        inmuebleCiudad: contrato.inmuebleCiudad,
        contratoId: contrato.id,
        contratoIdsVisibles: [contrato.id],
        inquilinoNombre: nombre,
        inquilinoTelefono: usuario.telefono,
        titulo: titulo.trim(),
        descripcion: descripcion.trim(),
        categoria,
        prioridad,
        estado: 'ABIERTA',
        origen: 'INQUILINO',
        fechaCreacion: ahora,
        fechaActualizacion: ahora,
        responsabilidad: 'PENDIENTE_DETERMINAR',
        responsabilidadNotas: 'Pendiente de determinar quién debe asumir la actuación.',
        seguroEstado: 'PENDIENTE_VERIFICACION',
        seguroComprobacionNotas: 'Cotejando con pólizas de seguro del inmueble.',
        viaActuacion: 'PROFESIONAL_DIRECTO',
        creadoPor: nombre,
        actualizadoPor: nombre,
        fotografias: [],
        documentos: [],
        historial: [
          crearHistorialItem(nombre, 'INCIDENCIA_CREADA', undefined, 'ABIERTA', `Avería notificada desde el portal por ${nombre}.`),
        ],
      };
      await saveIncidenciaFirestore(incidencia);

      // Evidencias (la incidencia ya existe: la regla de Storage la verifica)
      const adjuntos: AdjuntoIncidencia[] = [];
      for (const foto of fotos) {
        const { storagePath, downloadURL } = await subirEvidenciaIncidencia(incidencia.id, foto, foto.name);
        adjuntos.push({
          id: `adj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          incidenciaId: incidencia.id,
          inmuebleId: incidencia.inmuebleId,
          nombre: foto.name,
          tipo: 'imagen',
          mimeType: foto.type,
          url: downloadURL,
          storagePath,
          tamanoBytes: foto.size,
          fechaSubida: new Date().toISOString(),
          subidoPor: nombre,
        });
      }
      if (adjuntos.length > 0) {
        await updateDoc(doc(db, 'incidencias', incidencia.id), {
          fotografias: adjuntos,
          fechaActualizacion: new Date().toISOString(),
        });
      }

      await vincularIncidenciaAContrato(contrato.id, incidencia.id);
      await auditarAccionPortal({
        usuarioId: usuario.id,
        usuarioEmail: usuario.email,
        usuarioNombre: nombre,
        accion: 'INQUILINO_INCIDENCIA_CREADA',
        descripcion: `Avería notificada desde el portal: ${incidencia.titulo} (${contrato.inmuebleDireccion}).`,
        entidadAfectada: 'incidencia',
        idAfectado: incidencia.id,
      });
      onCreada();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se ha podido registrar la avería.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-30 flex items-end sm:items-center justify-center" onClick={onCerrar}>
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold">Notificar avería</h2>
          <button onClick={onCerrar} className="p-1.5 rounded-full hover:bg-slate-100 cursor-pointer" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <p className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">{error}</p>}

        <label className="block text-xs font-bold text-slate-600 mb-1">Título *</label>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej. Fuga bajo el fregadero"
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl mb-3"
        />

        <label className="block text-xs font-bold text-slate-600 mb-1">Descripción * (mínimo 10 caracteres)</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={4}
          placeholder="Describe qué ocurre, dónde y desde cuándo…"
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl mb-3"
        />

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Categoría</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaIncidencia)}
              className="w-full px-2 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
            >
              {CATEGORIAS.map((c) => (
                <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Prioridad</label>
            <select
              value={prioridad}
              onChange={(e) => setPrioridad(e.target.value as PrioridadIncidencia)}
              className="w-full px-2 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
            >
              <option value="NORMAL">Normal</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
        </div>

        <label className="block text-xs font-bold text-slate-600 mb-1">Fotos (máx. 6, 10 MB cada una)</label>
        <label className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-600 cursor-pointer mb-2">
          <Camera className="w-4 h-4" /> Añadir fotos
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => anadirFotos(e.target.files)} />
        </label>
        {fotos.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {fotos.map((f, i) => (
              <span key={i} className="text-[11px] bg-slate-100 rounded-lg px-2 py-1 font-medium flex items-center gap-1">
                {f.name.slice(0, 18)}
                <button onClick={() => setFotos(fotos.filter((_, j) => j !== i))} className="cursor-pointer" aria-label="Quitar">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full py-3 bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50"
        >
          {guardando ? 'Registrando…' : 'Enviar avería'}
        </button>
      </div>
    </div>
  );
};
