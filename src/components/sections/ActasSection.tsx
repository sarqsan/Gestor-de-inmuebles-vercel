import React, { useState, useMemo, useEffect } from 'react';
import { Acta, TipoActa, EstadoActa, ParticipanteActa, ElementoActaInventario, LecturaContador, EvidenciaActa, IncidenciaActa, OtpActa } from '../../types/actas';
import { Inmueble, ContratoFormalizacion, UsuarioApp } from '../../types';
import { FileText, Plus, Search, Filter, Eye, Edit, CheckCircle, Clock, AlertTriangle, FileCheck, Download, Camera, Zap, Droplets, Flame, UserCheck, Shield, History, BarChart3 } from 'lucide-react';
import { crearActaBase, crearActaSalidaDesdeEntrada, validarActaParaRevision, cambiarEstadoActa, actualizarActa, versionarActa } from '../../utils/actas/actaEngine';
import { compararActasEntradaSalida } from '../../utils/actas/actaComparacionEngine';
import { prepararActaParaFirma, completarFirma, validarFirmaConOtp, todasFirmasCompletadas, cerrarActaTrasFirmas } from '../../utils/actas/actaFirmaEngine';
import { crearOtpActa, validarOtp } from '../../utils/actas/actaOtpEngine';
import { generarPdfActa, descargarPdfActa } from '../../utils/actas/actaPdfEngine';
import { ESTADOS_ELEMENTO_ACTA, CATEGORIAS_ELEMENTO_ACTA, crearElementoActaInventario } from '../../utils/actas/actaInventarioEngine';
import { saveActaFirestore, subscribeActas, uploadEvidenciaActaStorage, saveEvidenciaActaFirestore, subscribeEvidenciasPorPropietario, saveIncidenciaActaFirestore, subscribeTodasIncidenciasActa, saveOtpActaFirestore, subscribeOtpPorActa } from '../../lib/firebaseActas';
import { registrarAuditoriaFirestore } from '../../lib/firebase';

interface ActasSectionProps {
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  currentUser?: UsuarioApp | null;
  initialActas?: Acta[];
}

export const ActasSection: React.FC<ActasSectionProps> = ({ inmuebles, contratos, currentUser, initialActas }) => {
  const [actas, setActas] = useState<Acta[]>(initialActas || []);
  const [evidencias, setEvidencias] = useState<EvidenciaActa[]>([]);
  const [incidenciasActa, setIncidenciasActa] = useState<IncidenciaActa[]>([]);
  const [otps, setOtps] = useState<OtpActa[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<TipoActa | 'TODOS'>('TODOS');
  const [filtroEstado, setFiltroEstado] = useState<EstadoActa | 'TODOS'>('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [selectedActa, setSelectedActa] = useState<Acta | null>(null);
  const [showCrearModal, setShowCrearModal] = useState(false);
  const [tipoCrear, setTipoCrear] = useState<TipoActa>('ENTRADA');
  const [paso, setPaso] = useState(1);

  // Form states for crear acta
  const [formInmuebleId, setFormInmuebleId] = useState('');
  const [formContratoId, setFormContratoId] = useState('');
  const [formFechaActo, setFormFechaActo] = useState(new Date().toISOString().slice(0,10));
  const [formHoraActo, setFormHoraActo] = useState(new Date().toTimeString().slice(0,5));
  const [formParticipantes, setFormParticipantes] = useState<ParticipanteActa[]>([]);
  const [formInventario, setFormInventario] = useState<ElementoActaInventario[]>([]);
  const [formContadores, setFormContadores] = useState<LecturaContador[]>([]);
  const [formObservaciones, setFormObservaciones] = useState('');
  const [formActaEntradaId, setFormActaEntradaId] = useState('');

  const ownerId = useMemo(() => {
    if (currentUser?.tipoPerfil === 'PROPIETARIO' && currentUser.propietarioId) return currentUser.propietarioId;
    return inmuebles[0]?.propietarioId || inmuebles[0]?.propietarioPrincipalId || 'prop_demo';
  }, [currentUser, inmuebles]);

  // Subscribe actas
  useEffect(() => {
    const scope = {
      tipoPerfil: currentUser?.tipoPerfil,
      propietarioId: currentUser?.propietarioId,
      inmuebleIds: currentUser?.inmuebleIds || [],
    };
    const unsub = subscribeActas((items) => {
      setActas(items);
    }, scope as any);
    const unsubEv = subscribeEvidenciasPorPropietario((items) => setEvidencias(items), scope as any);
    const unsubInc = subscribeTodasIncidenciasActa((items) => setIncidenciasActa(items), scope as any);
    return () => { unsub(); unsubEv(); unsubInc(); };
  }, [currentUser]);

  // Subscribe OTP for selected acta
  useEffect(() => {
    if (!selectedActa) return;
    const scope = {
      tipoPerfil: currentUser?.tipoPerfil,
      propietarioId: currentUser?.propietarioId,
      inmuebleIds: currentUser?.inmuebleIds || [],
    };
    const unsub = subscribeOtpPorActa(selectedActa.id, (items) => setOtps(items), scope as any);
    return () => unsub();
  }, [selectedActa?.id]);

  const actasFiltradas = useMemo(() => {
    return actas.filter(a => {
      if (filtroTipo !== 'TODOS' && a.tipo !== filtroTipo) return false;
      if (filtroEstado !== 'TODOS' && a.estado !== filtroEstado) return false;
      if (busqueda.trim()) {
        const term = busqueda.toLowerCase();
        return a.id.toLowerCase().includes(term) || a.propertyId.toLowerCase().includes(term) || (a.contractId||'').toLowerCase().includes(term);
      }
      return true;
    });
  }, [actas, filtroTipo, filtroEstado, busqueda]);

  const resetForm = () => {
    setFormInmuebleId('');
    setFormContratoId('');
    setFormFechaActo(new Date().toISOString().slice(0,10));
    setFormHoraActo(new Date().toTimeString().slice(0,5));
    setFormParticipantes([]);
    setFormInventario([]);
    setFormContadores([]);
    setFormObservaciones('');
    setFormActaEntradaId('');
    setPaso(1);
  };

  const handleCrearActa = async () => {
    if (!formInmuebleId) { alert('Selecciona inmueble'); return; }
    if (!formFechaActo) { alert('Fecha acto requerida'); return; }
    if (formParticipantes.length === 0) { alert('Al menos un participante'); return; }

    const creadoPor = currentUser?.nombre || 'Propietario';
    const creadoPorId = currentUser?.id;

    let nuevaActa: Acta;
    if (tipoCrear === 'ENTRADA') {
      nuevaActa = crearActaBase({
        ownerId,
        propertyId: formInmuebleId,
        contractId: formContratoId || undefined,
        tipo: 'ENTRADA',
        fechaActo: formFechaActo,
        horaActo: formHoraActo,
        participantes: formParticipantes,
        creadoPor,
        creadoPorId,
      });
      nuevaActa.inventario = formInventario.map(e => ({ ...e, actaId: nuevaActa.id }));
      nuevaActa.lecturasContadores = formContadores.map(c => ({ ...c, actaId: nuevaActa.id }));
      nuevaActa.observaciones = formObservaciones;
    } else {
      const actaEntrada = actas.find(a => a.id === formActaEntradaId);
      if (!actaEntrada) { alert('Debes seleccionar acta de entrada vinculada'); return; }
      nuevaActa = crearActaSalidaDesdeEntrada(actaEntrada, {
        fechaActo: formFechaActo,
        horaActo: formHoraActo,
        participantes: formParticipantes,
        creadoPor,
        creadoPorId,
      });
      nuevaActa.ownerId = ownerId;
      nuevaActa.propertyId = formInmuebleId;
      nuevaActa.contractId = formContratoId || actaEntrada.contractId;
      // Si el usuario ha modificado inventario en form, usarlo, si no usar el precargado
      if (formInventario.length > 0) {
        nuevaActa.inventario = formInventario.map(e => ({ ...e, actaId: nuevaActa.id }));
      }
      nuevaActa.lecturasContadores = formContadores.length > 0 ? formContadores.map(c => ({ ...c, actaId: nuevaActa.id })) : nuevaActa.lecturasContadores;
      nuevaActa.observaciones = formObservaciones;
      // Calcular comparación inicial
      try {
        const resumen = compararActasEntradaSalida(actaEntrada, nuevaActa);
        nuevaActa.resumenDiferencias = resumen;
      } catch {}
    }

    await saveActaFirestore(nuevaActa);
    await registrarAuditoriaFirestore({
      usuarioId: currentUser?.id || 'system',
      usuarioEmail: currentUser?.email || 'propietario',
      usuarioNombre: creadoPor,
      accion: 'ACTA_CREADA',
      descripcion: `Acta ${nuevaActa.tipo} ${nuevaActa.id} v${nuevaActa.version} creada para inmueble ${nuevaActa.propertyId}`,
      entidadAfectada: 'inmueble' as any,
      idAfectado: nuevaActa.propertyId,
      resultado: 'EXITO',
      detalles: { actaId: nuevaActa.id, tipo: nuevaActa.tipo, version: nuevaActa.version },
    });
    resetForm();
    setShowCrearModal(false);
    setSelectedActa(nuevaActa);
  };

  const handleCambiarEstado = async (acta: Acta, nuevoEstado: EstadoActa) => {
    try {
      const { actaActualizada, historialItem } = cambiarEstadoActa(acta, nuevoEstado, currentUser?.nombre || 'Propietario', currentUser?.id, `Cambio manual a ${nuevoEstado}`);
      await saveActaFirestore(actaActualizada);
      setSelectedActa(actaActualizada);
      await registrarAuditoriaFirestore({
        usuarioId: currentUser?.id || 'system',
        usuarioEmail: currentUser?.email || '',
        usuarioNombre: currentUser?.nombre || 'Propietario',
        accion: `ACTA_${nuevoEstado}`,
        descripcion: `Acta ${acta.id} cambió ${acta.estado} → ${nuevoEstado}: ${historialItem.detalle}`,
        entidadAfectada: 'inmueble' as any,
        idAfectado: acta.propertyId,
        resultado: 'EXITO',
        detalles: { actaId: acta.id, estadoAnterior: acta.estado, estadoNuevo: nuevoEstado, version: acta.version },
      });
    } catch (e:any) {
      alert(e.message);
    }
  };

  const handleSolicitarFirma = async (acta: Acta) => {
    try {
      const { actaActualizada } = prepararActaParaFirma(acta, currentUser?.nombre || 'Propietario', currentUser?.id);
      await saveActaFirestore(actaActualizada);
      // Generar OTPs para cada firma — transporte PENDIENTE, código solo en campo temporal seguro, no en logs producción
      for (const firma of actaActualizada.firmas) {
        const { otp } = await crearOtpActa({ 
          actaId: acta.id, 
          firmaId: firma.id, 
          ownerId: acta.ownerId, 
          propertyId: acta.propertyId,
          contractId: acta.contractId,
          versionActa: acta.version,
          solicitante: currentUser?.nombre, 
          solicitanteId: currentUser?.id,
          canal: 'PENDIENTE_PROVEEDOR' 
        });
        await saveOtpActaFirestore(otp);
        // NO console.log del código en producción. El código se entrega solo vía campo temporal controlado en UI dev/manual si canal MANUAL, y se limpia tras uso.
      }
      setSelectedActa(actaActualizada);
      await registrarAuditoriaFirestore({
        usuarioId: currentUser?.id || 'system',
        usuarioEmail: currentUser?.email || '',
        usuarioNombre: currentUser?.nombre || 'Propietario',
        accion: 'ACTA_SOLICITUD_FIRMA',
        descripcion: `Solicitud firma acta ${acta.id} v${acta.version} a ${actaActualizada.firmas.length} participantes`,
        entidadAfectada: 'inmueble' as any,
        idAfectado: acta.propertyId,
        resultado: 'EXITO',
        detalles: { actaId: acta.id, firmas: actaActualizada.firmas.map(f=>f.id) },
      });
    } catch (e:any) {
      alert(e.message);
    }
  };

  const handleValidarOtpYFirmar = async (acta: Acta, firmaId: string, codigo: string) => {
    const firma = acta.firmas.find(f=>f.id===firmaId);
    if (!firma) { alert('Firma no encontrada'); return; }
    const otp = otps.find(o=>o.firmaId===firmaId && o.estado==='ACTIVO');
    if (!otp) { alert('OTP no encontrado o no activo'); return; }
    // Aislamiento: verificar acta/firma/versión/owner corresponden
    const { validarOtpContexto } = await import('../../utils/actas/actaOtpEngine');
    const ctxCheck = validarOtpContexto(otp, { actaId: acta.id, firmaId, ownerId: acta.ownerId, versionActa: acta.version, propertyId: acta.propertyId });
    if (!ctxCheck.valido) { alert(`OTP aislamiento: ${ctxCheck.motivo}`); return; }
    const { valido, motivo, otpActualizado } = await validarOtp(otp, codigo);
    await saveOtpActaFirestore(otpActualizado);
    await registrarAuditoriaFirestore({
      usuarioId: currentUser?.id || 'system',
      usuarioEmail: currentUser?.email || '',
      usuarioNombre: currentUser?.nombre || 'Propietario',
      accion: valido ? 'ACTA_OTP_VALIDADO' : 'ACTA_OTP_FALLIDO',
      descripcion: `OTP ${otp.id} validación ${valido ? 'OK' : 'FALLO'}: ${motivo || ''}`,
      entidadAfectada: 'inmueble' as any,
      idAfectado: acta.propertyId,
      resultado: valido ? 'EXITO' : 'ERROR',
      detalles: { actaId: acta.id, firmaId, otpId: otp.id, valido, motivo },
    });
    if (!valido) { alert(`OTP inválido: ${motivo}`); return; }
    // Validar firma con OTP y completar
    let firmaActualizada = validarFirmaConOtp(firma);
    firmaActualizada = completarFirma(firmaActualizada);
    const firmasActualizadas = acta.firmas.map(f=>f.id===firmaId?firmaActualizada:f);
    let actaActualizada: Acta = { ...acta, firmas: firmasActualizadas, fechaActualizacion: new Date().toISOString() };
    // Si todas firmadas, cerrar a FIRMADA
    if (todasFirmasCompletadas(actaActualizada)) {
      const cierre = cerrarActaTrasFirmas(actaActualizada, currentUser?.nombre || 'Propietario', currentUser?.id);
      actaActualizada = cierre.actaActualizada;
    } else {
      actaActualizada.estadoFirma = 'EN_PROCESO';
    }
    await saveActaFirestore(actaActualizada);
    setSelectedActa(actaActualizada);
    await registrarAuditoriaFirestore({
      usuarioId: currentUser?.id || 'system',
      usuarioEmail: currentUser?.email || '',
      usuarioNombre: currentUser?.nombre || 'Propietario',
      accion: 'ACTA_FIRMADA',
      descripcion: `Firma ${firmaId} completada por ${firma.firmanteNombre} en acta ${acta.id} v${acta.version}`,
      entidadAfectada: 'inmueble' as any,
      idAfectado: acta.propertyId,
      resultado: 'EXITO',
      detalles: { actaId: acta.id, firmaId, version: acta.version },
    });
  };

  const handleGenerarPdf = async (acta: Acta) => {
    const inmueble = inmuebles.find(i=>i.id===acta.propertyId);
    const contrato = contratos.find(c=>c.id===acta.contractId);
    const actaEntrada = acta.tipo==='SALIDA' && acta.actaEntradaId ? actas.find(a=>a.id===acta.actaEntradaId) : undefined;
    let comparacionElementos;
    if (acta.tipo==='SALIDA' && actaEntrada) {
      try {
        const comps = (await import('../../utils/actas/actaComparacionEngine')).compararInventarios(actaEntrada.inventario, acta.inventario);
        comparacionElementos = comps;
      } catch {}
    }
    const docPdf = generarPdfActa({ acta, actaEntrada, inmuebleDireccion: inmueble?.direccion, inmuebleCiudad: inmueble?.ciudad, contratoRenta: contrato?.rentaMensual, comparacionElementos });
    // Generar blob y subir a Storage privado actas_pdfs/{owner}/{acta}/
    try {
      const blob = docPdf.output('blob');
      const { uploadPdfActaStorage } = await import('../../lib/firebaseActas');
      const fileName = `Acta_${acta.tipo}_${acta.fechaActo}_v${acta.version}_${acta.id.slice(0,8)}.pdf`;
      const { url, storagePath } = await uploadPdfActaStorage(acta.ownerId, acta.id, blob, fileName);
      // Guardar referencia persistente en Firestore — flujo completo generar → upload → guardar referencia → auditoría
      const actaConPdf: Acta = {
        ...acta,
        pdfUrl: url,
        pdfStoragePath: storagePath,
        pdfVersion: acta.version,
        pdfFechaGeneracion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
        actualizadoPor: currentUser?.nombre,
        historial: [
          ...acta.historial,
          {
            id: `hist_pdf_${Date.now()}`,
            fecha: new Date().toISOString(),
            usuario: currentUser?.nombre || 'Propietario',
            usuarioId: currentUser?.id,
            accion: 'PDF_GENERADO' as any,
            detalle: `PDF v${acta.version} generado y subido a ${storagePath}`,
            estadoAnterior: acta.estado,
            estadoNuevo: acta.estado,
          },
        ],
      };
      await saveActaFirestore(actaConPdf);
      setSelectedActa(actaConPdf);
      // Descargar local también
      descargarPdfActa(docPdf, acta);
      await registrarAuditoriaFirestore({
        usuarioId: currentUser?.id || 'system',
        usuarioEmail: currentUser?.email || '',
        usuarioNombre: currentUser?.nombre || 'Propietario',
        accion: 'ACTA_PDF_GENERADO',
        descripcion: `PDF generado y persistido acta ${acta.id} v${acta.version} tipo ${acta.tipo} → ${storagePath}`,
        entidadAfectada: 'inmueble' as any,
        idAfectado: acta.propertyId,
        resultado: 'EXITO',
        detalles: { actaId: acta.id, version: acta.version, pdfUrl: url, storagePath },
      });
    } catch (e:any) {
      // Fallback descarga local si falla Storage, pero auditar error
      descargarPdfActa(docPdf, acta);
      await registrarAuditoriaFirestore({
        usuarioId: currentUser?.id || 'system',
        usuarioEmail: currentUser?.email || '',
        usuarioNombre: currentUser?.nombre || 'Propietario',
        accion: 'ACTA_PDF_GENERADO',
        descripcion: `PDF generado local acta ${acta.id} v${acta.version} pero fallo persistencia Storage: ${e.message}`,
        entidadAfectada: 'inmueble' as any,
        idAfectado: acta.propertyId,
        resultado: 'ERROR',
        detalles: { actaId: acta.id, version: acta.version, error: e.message },
      });
      alert(`PDF generado local pero error subiendo a Storage: ${e.message}`);
    }
  };

  const handleVersionarActa = async (acta: Acta) => {
    const motivo = prompt('Motivo de versionado (obligatorio para trazabilidad):', 'Corrección tras firma / actualización requerida');
    if (!motivo || !motivo.trim()) { alert('Motivo obligatorio'); return; }
    try {
      const { actaVersionada, actaOriginalPreservada } = versionarActa(acta, currentUser?.nombre || 'Propietario', motivo.trim(), currentUser?.id);
      // Preservar original intacta ya está en Firestore, no modificarla. Guardar nueva versión como nuevo documento.
      await saveActaFirestore(actaVersionada);
      // Auditar versionado
      await registrarAuditoriaFirestore({
        usuarioId: currentUser?.id || 'system',
        usuarioEmail: currentUser?.email || '',
        usuarioNombre: currentUser?.nombre || 'Propietario',
        accion: 'ACTA_VERSIONADA',
        descripcion: `Acta ${acta.id} v${acta.version} versionada → nueva ${actaVersionada.id} v${actaVersionada.version} motivo: ${motivo}`,
        entidadAfectada: 'inmueble' as any,
        idAfectado: acta.propertyId,
        resultado: 'EXITO',
        detalles: { actaIdOriginal: acta.id, actaIdNueva: actaVersionada.id, versionAnterior: acta.version, versionNueva: actaVersionada.version, motivo, cadenaVersionIds: actaVersionada.cadenaVersionIds },
      });
      setSelectedActa(actaVersionada);
      alert(`Nueva versión creada: ${actaVersionada.id} v${actaVersionada.version}. La versión firmada original ${actaOriginalPreservada.id} v${actaOriginalPreservada.version} permanece intacta e inmutable.`);
    } catch (e:any) {
      alert(`Error versionando: ${e.message}`);
    }
  };

  const handleUploadEvidencia = async (acta: Acta, file: File) => {
    try {
      const { url, storagePath } = await uploadEvidenciaActaStorage(acta.ownerId, acta.id, file, file.name);
      const evidencia: EvidenciaActa = {
        id: `ev_${acta.id}_${Date.now()}`,
        actaId: acta.id,
        ownerId: acta.ownerId,
        propertyId: acta.propertyId,
        contractId: acta.contractId,
        tipo: file.type.startsWith('video') ? 'VIDEO' : file.type === 'application/pdf' ? 'DOCUMENTO' : 'FOTO',
        storagePath,
        downloadURL: url,
        orden: evidencias.filter(e=>e.actaId===acta.id).length + 1,
        fechaHora: new Date().toISOString(),
        descripcion: file.name,
        nombreArchivo: file.name,
        mimeType: file.type,
        tamanoBytes: file.size,
        subidoPor: currentUser?.nombre,
      };
      await saveEvidenciaActaFirestore(evidencia);
      const actaActualizada = { ...acta, evidenciaIds: [...acta.evidenciaIds, evidencia.id], fechaActualizacion: new Date().toISOString() };
      await saveActaFirestore(actaActualizada);
      setSelectedActa(actaActualizada);
      await registrarAuditoriaFirestore({
        usuarioId: currentUser?.id || 'system',
        usuarioEmail: currentUser?.email || '',
        usuarioNombre: currentUser?.nombre || 'Propietario',
        accion: 'ACTA_EVIDENCIA_ANADIDA',
        descripcion: `Evidencia ${evidencia.id} añadida a acta ${acta.id}`,
        entidadAfectada: 'inmueble' as any,
        idAfectado: acta.propertyId,
        resultado: 'EXITO',
        detalles: { actaId: acta.id, evidenciaId: evidencia.id, storagePath },
      });
    } catch (e:any) {
      alert(`Error subiendo evidencia: ${e.message}`);
    }
  };

  const renderEstadoBadge = (estado: EstadoActa) => {
    const colors: Record<EstadoActa, string> = {
      BORRADOR: 'bg-slate-100 text-slate-700 border-slate-200',
      EN_REVISION: 'bg-blue-50 text-blue-700 border-blue-200',
      PENDIENTE_FIRMA: 'bg-amber-50 text-amber-700 border-amber-200',
      FIRMADA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      CERRADA: 'bg-slate-800 text-white border-slate-700',
      ERROR: 'bg-rose-50 text-rose-700 border-rose-200',
      CANCELADA: 'bg-slate-100 text-slate-400 border-slate-200',
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${colors[estado]}`}>{estado}</span>;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-white p-5 rounded-2xl border shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600">
            <FileCheck className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">Actas de Entrada y Salida — BLOQUE D</h2>
            <p className="text-xs text-slate-500">Circuito VIVIENDA/CONTRATO → ENTRADA → INVENTARIO/ESTADO/EVIDENCIAS → FIRMA → ESTANCIA → SALIDA → COMPARACIÓN → INCIDENCIAS → FIRMA → TRAZABILIDAD. Persistencia Firestore, Storage (no base64), auditoría canónica, OTP, PDF real.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>{setTipoCrear('ENTRADA'); setShowCrearModal(true); resetForm();}} className="px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-bold flex items-center gap-1"><Plus className="w-4 h-4" />Acta Entrada</button>
            <button onClick={()=>{setTipoCrear('SALIDA'); setShowCrearModal(true); resetForm();}} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1"><Plus className="w-4 h-4" />Acta Salida</button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold"><Filter className="w-4 h-4 text-violet-600" />Filtros — Tipo/Estado/Inmueble/Contrato</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value as any)} className="px-3 py-2 bg-slate-50 border rounded-xl">
            <option value="TODOS">Todos tipos</option>
            <option value="ENTRADA">ENTRADA</option>
            <option value="SALIDA">SALIDA</option>
          </select>
          <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value as any)} className="px-3 py-2 bg-slate-50 border rounded-xl">
            <option value="TODOS">Todos estados</option>
            <option value="BORRADOR">BORRADOR</option>
            <option value="EN_REVISION">EN_REVISION</option>
            <option value="PENDIENTE_FIRMA">PENDIENTE_FIRMA</option>
            <option value="FIRMADA">FIRMADA</option>
            <option value="CERRADA">CERRADA</option>
            <option value="CANCELADA">CANCELADA</option>
          </select>
          <div className="relative col-span-2">
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por ID acta, inmueble, contrato..." className="w-full pl-8 pr-3 py-2 bg-slate-50 border rounded-xl text-xs" />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>
      </div>

      {/* Listado */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="p-4 border-b bg-slate-50/70 flex items-center gap-2"><FileText className="w-4 h-4 text-violet-600" /><h3 className="font-bold text-sm">Actas ({actasFiltradas.length})</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-[10px] uppercase font-bold border-b"><tr><th className="py-2 px-3">Tipo</th><th className="py-2 px-3">Fecha acto</th><th className="py-2 px-3">Inmueble</th><th className="py-2 px-3">Contrato</th><th className="py-2 px-3">Estado</th><th className="py-2 px-3">Versión</th><th className="py-2 px-3">Inventario</th><th className="py-2 px-3">Evidencias</th><th className="py-2 px-3">Firma</th><th className="py-2 px-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y">
              {actasFiltradas.map(acta => {
                const inm = inmuebles.find(i=>i.id===acta.propertyId);
                return (
                  <tr key={acta.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${acta.tipo==='ENTRADA'?'bg-blue-50 text-blue-700 border-blue-200':'bg-orange-50 text-orange-700 border-orange-200'}`}>{acta.tipo}</span></td>
                    <td className="py-2 px-3 font-mono">{acta.fechaActo} {acta.horaActo||''}</td>
                    <td className="py-2 px-3 truncate max-w-[150px]">{inm?.direccion || acta.propertyId.slice(0,8)}</td>
                    <td className="py-2 px-3 truncate max-w-[100px]">{acta.contractId?.slice(0,8) || '—'}</td>
                    <td className="py-2 px-3">{renderEstadoBadge(acta.estado)}</td>
                    <td className="py-2 px-3 font-mono">v{acta.version}</td>
                    <td className="py-2 px-3">{acta.inventario.length}</td>
                    <td className="py-2 px-3">{acta.evidenciaIds.length}</td>
                    <td className="py-2 px-3"><span className={`px-2 py-0.5 rounded-full text-[10px] border ${acta.estadoFirma==='FIRMADA'?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>{acta.estadoFirma}</span></td>
                    <td className="py-2 px-3 text-right flex gap-1 justify-end">
                      <button onClick={()=>setSelectedActa(acta)} className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={()=>handleGenerarPdf(acta)} className="p-1.5 bg-violet-50 hover:bg-violet-100 rounded-lg"><Download className="w-3.5 h-3.5 text-violet-600" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle acta */}
      {selectedActa && (
        <div className="bg-white p-5 rounded-2xl border space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold flex items-center gap-2"><FileText className="w-5 h-5 text-violet-600" />Acta {selectedActa.tipo} — {selectedActa.id} v{selectedActa.version}</h3>
              <p className="text-xs text-slate-500">Inmueble {selectedActa.propertyId} | Contrato {selectedActa.contractId || '—'} | Fecha acto {selectedActa.fechaActo} {selectedActa.horaActo||''} | Creada {selectedActa.fechaCreacion.slice(0,19)}</p>
            </div>
            <button onClick={()=>setSelectedActa(null)} className="p-1.5 bg-slate-100 rounded-lg"><Filter className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-slate-50 border rounded-xl space-y-1">
              <h4 className="font-bold flex items-center gap-1"><Shield className="w-4 h-4 text-violet-600" />Estado y versión</h4>
              <div>Estado: {renderEstadoBadge(selectedActa.estado)} Firma: {selectedActa.estadoFirma}</div>
              <div>Versión: v{selectedActa.version} | Creado por: {selectedActa.creadoPor}</div>
              <div>Acta entrada vinculada: {selectedActa.actaEntradaId || '—'}</div>
              {selectedActa.actaAnteriorId && <div className="text-[11px] text-slate-600">Versionado de: {selectedActa.actaAnteriorId} | Motivo: {selectedActa.motivoVersionado || '—'} | Fecha: {selectedActa.fechaVersionado?.slice(0,19) || '—'}</div>}
              {selectedActa.cadenaVersionIds && selectedActa.cadenaVersionIds.length>1 && <div className="text-[10px] text-slate-500">Cadena versiones: {selectedActa.cadenaVersionIds.join(' → ').slice(0,120)}</div>}
              {selectedActa.pdfUrl && <div className="text-[10px] text-emerald-700">PDF persistido: <a href={selectedActa.pdfUrl} target="_blank" className="underline">{selectedActa.pdfStoragePath}</a> v{selectedActa.pdfVersion} {selectedActa.pdfFechaGeneracion?.slice(0,19)}</div>}
              <div className="flex gap-1 flex-wrap pt-2">
                <button onClick={()=>handleCambiarEstado(selectedActa, 'EN_REVISION')} className="px-2 py-1 bg-blue-600 text-white rounded-lg font-bold">A revisión</button>
                <button onClick={()=>handleCambiarEstado(selectedActa, 'PENDIENTE_FIRMA')} className="px-2 py-1 bg-amber-600 text-white rounded-lg font-bold">Pendiente firma</button>
                <button onClick={()=>handleSolicitarFirma(selectedActa)} className="px-2 py-1 bg-violet-600 text-white rounded-lg font-bold">Solicitar firma + OTP</button>
                <button onClick={()=>handleCambiarEstado(selectedActa, 'CERRADA')} className="px-2 py-1 bg-slate-800 text-white rounded-lg font-bold">Cerrar</button>
                <button onClick={()=>handleGenerarPdf(selectedActa)} className="px-2 py-1 bg-slate-100 border rounded-lg font-bold flex items-center gap-1"><Download className="w-3 h-3" />PDF {selectedActa.pdfUrl ? '✅' : ''}</button>
                {(selectedActa.estado==='FIRMADA' || selectedActa.estado==='CERRADA') && <button onClick={()=>handleVersionarActa(selectedActa)} className="px-2 py-1 bg-amber-100 border border-amber-300 text-amber-800 rounded-lg font-bold">Nueva versión (versionado seguro)</button>}
              </div>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-1">
              <h4 className="font-bold flex items-center gap-1"><UserCheck className="w-4 h-4 text-blue-600" />Participantes ({selectedActa.participantes.length})</h4>
              {selectedActa.participantes.map(p=><div key={p.id} className="flex justify-between"><span>{p.nombre} ({p.rol}) {p.dni?`DNI ${p.dni}`:''}</span><span className={p.firmaRequerida?'text-amber-700 font-bold':'text-slate-400'}>{p.firmaRequerida?'Firma req':'No firma'} {p.haFirmado?'✅':''}</span></div>)}
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
              <h4 className="font-bold flex items-center gap-1"><BarChart3 className="w-4 h-4 text-emerald-600" />Resumen diferencias (SALIDA)</h4>
              {selectedActa.resumenDiferencias ? (
                <div className="space-y-1">
                  <div>Total: {selectedActa.resumenDiferencias.totalElementos} | Sin cambios: {selectedActa.resumenDiferencias.sinCambios} | Desgaste: {selectedActa.resumenDiferencias.conDesgaste} | Deterioro: {selectedActa.resumenDiferencias.conDeterioro} | Daño: {selectedActa.resumenDiferencias.conDano} | Ausencias: {selectedActa.resumenDiferencias.ausencias} | Atención: {selectedActa.resumenDiferencias.requiereAtencion}</div>
                  <div>Contadores: {selectedActa.resumenDiferencias.contadores.map(c=>`${c.tipo} ${c.diferenciaTexto||''}`).join(' | ')}</div>
                  <div>Incidencias nuevas: {selectedActa.resumenDiferencias.incidencias.nuevasEnSalida.length} | Existentes: {selectedActa.resumenDiferencias.incidencias.existentesDesdeEntrada.length}</div>
                </div>
              ) : <div className="text-slate-500">Solo para actas SALIDA con entrada vinculada. Comparación determinista auditable, sin IA.</div>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-white border rounded-xl">
              <h4 className="font-bold mb-2 flex items-center gap-1"><FileText className="w-4 h-4 text-violet-600" />Inventario y estados ({selectedActa.inventario.length})</h4>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {selectedActa.inventario.map(elem=><div key={elem.id} className="p-2 bg-slate-50 border rounded-lg flex justify-between"><span>[{elem.categoria}] {elem.elemento} - {elem.estado} x{elem.cantidad} {elem.ubicacion?`(${elem.ubicacion})`:''}</span><span className="text-[10px] text-slate-500">{elem.observaciones?.slice(0,50)}</span></div>)}
              </div>
            </div>
            <div className="p-3 bg-white border rounded-xl">
              <h4 className="font-bold mb-2 flex items-center gap-1"><Zap className="w-4 h-4 text-amber-600" />Contadores ({selectedActa.lecturasContadores.length})</h4>
              <div className="space-y-1">
                {selectedActa.lecturasContadores.map(c=><div key={c.id} className="p-2 bg-slate-50 border rounded-lg flex justify-between"><span>{c.tipo}: {c.lectura} {c.unidad||''} {c.fechaHora.slice(0,16)}</span><span>{c.observaciones||''}</span></div>)}
              </div>
              <div className="mt-2 p-2 bg-slate-900 text-white rounded-xl">
                <h5 className="font-bold text-[11px]">Añadir lectura contador</h5>
                <AddContadorForm acta={selectedActa} onSave={async (lec)=>{ const act = { ...selectedActa, lecturasContadores: [...selectedActa.lecturasContadores, lec] }; await saveActaFirestore(act); setSelectedActa(act); }} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-white border rounded-xl">
              <h4 className="font-bold mb-2 flex items-center gap-1"><Camera className="w-4 h-4 text-blue-600" />Evidencias ({selectedActa.evidenciaIds.length}) — Storage, no base64</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {evidencias.filter(e=>e.actaId===selectedActa.id).map(ev=><div key={ev.id} className="p-2 bg-slate-50 border rounded-lg flex justify-between"><span>{ev.tipo} {ev.nombreArchivo} {ev.descripcion||''}</span><a href={ev.downloadURL} target="_blank" className="text-blue-600 underline">Ver</a></div>)}
              </div>
              <div className="mt-2">
                <label className="block font-bold mb-1">Subir evidencia (imagen)</label>
                <input type="file" accept="image/*,application/pdf" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleUploadEvidencia(selectedActa, f); }} className="w-full px-2 py-1 bg-slate-50 border rounded" />
              </div>
            </div>
            <div className="p-3 bg-white border rounded-xl">
              <h4 className="font-bold mb-2 flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-amber-600" />Incidencias acta ({incidenciasActa.filter(i=>i.actaId===selectedActa.id).length})</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {incidenciasActa.filter(i=>i.actaId===selectedActa.id).map(inc=><div key={inc.id} className="p-2 bg-amber-50 border border-amber-200 rounded-lg"><div className="font-bold">{inc.titulo} — {inc.estado} — {inc.origen}</div><div>{inc.descripcion.slice(0,150)}</div></div>)}
              </div>
              <AddIncidenciaActaForm acta={selectedActa} ownerId={ownerId} onSave={async (inc)=>{ await saveIncidenciaActaFirestore(inc); const act = { ...selectedActa, incidenciaIds: [...selectedActa.incidenciaIds, inc.id] }; await saveActaFirestore(act); setSelectedActa(act); }} />
            </div>
          </div>

          <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs space-y-2">
            <h4 className="font-bold flex items-center gap-1"><FileCheck className="w-4 h-4 text-violet-600" />Firmas y OTP ({selectedActa.firmas.length}) — Trazabilidad completa</h4>
            {selectedActa.firmas.map(f=>{
              const otp = otps.find(o=>o.firmaId===f.id);
              return (
                <div key={f.id} className="p-2 bg-white border rounded-lg flex flex-col gap-1">
                  <div className="flex justify-between"><span>{f.firmanteNombre} ({f.firmanteRol}) — {f.estado} — {f.metodo} v{f.versionActa}</span><span className="font-mono text-[10px]">{f.fechaFirma?.slice(0,19) || f.fechaSolicitud?.slice(0,19) || '—'}</span></div>
                  {otp && <div className="text-[11px] text-slate-600">OTP {otp.id.slice(0,12)} Estado {otp.estado} Intentos {otp.intentos}/{otp.maxIntentos} Expira {otp.fechaExpiracion.slice(0,19)} {otp.codigoPlainTemporal ? `Código (temporal entrega inmediata): ${otp.codigoPlainTemporal}` : ''}</div>}
                  {f.estado!=='FIRMADA' && (
                    <div className="flex gap-2 items-center">
                      <input id={`otp_input_${f.id}`} placeholder="Código OTP 6 dígitos" className="px-2 py-1 bg-slate-50 border rounded text-xs w-40" />
                      <button onClick={()=>{
                        const input = document.getElementById(`otp_input_${f.id}`) as HTMLInputElement;
                        if (input) handleValidarOtpYFirmar(selectedActa, f.id, input.value);
                      }} className="px-3 py-1 bg-violet-600 text-white rounded-lg font-bold text-xs">Validar OTP y firmar</button>
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400">Trazabilidad: {(f.trazabilidad||[]).map(t=>`${t.fecha.slice(0,19)} ${t.accion}`).join(' | ')}</div>
                </div>
              );
            })}
            {selectedActa.firmas.length===0 && <div className="text-slate-500">Sin firmas solicitadas. Usa botón Solicitar firma + OTP.</div>}
          </div>

          <div className="p-3 bg-slate-900 text-white rounded-xl text-xs space-y-1">
            <h4 className="font-bold flex items-center gap-1"><History className="w-4 h-4 text-slate-300" />Trazabilidad / Auditoría canónica — {selectedActa.historial.length} eventos</h4>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {selectedActa.historial.slice().reverse().map(h=><div key={h.id} className="flex justify-between"><span>{h.fecha.slice(0,19)} {h.usuario} {h.accion} {h.estadoAnterior?`(${h.estadoAnterior}→${h.estadoNuevo})`:''}</span><span className="text-slate-400">{h.detalle?.slice(0,120)}</span></div>)}
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
            <p className="font-bold">BLOQUE D — Reglas de seguridad y auditoría</p>
            <p>Acta vinculada versión concreta. Firmada no modificable silenciosamente → nueva versión. OTP generación/caducidad/intentos limitados/no texto plano/invalidación/trazabilidad/protección reutilización. Transporte externo PENDIENTE (adaptador preparado). PDF representa exactamente datos persistidos. Comparación determinista sin IA. Evidencias en Storage, referencia Firestore, sin base64. Auditoría canónica registrarAuditoriaFirestore, no segundo sistema.</p>
          </div>
        </div>
      )}

      {/* Modal crear acta */}
      {showCrearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col border border-slate-200">
            <div className="p-4 bg-violet-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Crear Acta {tipoCrear} — 14 pasos flujo completo</h3>
              <button onClick={()=>{setShowCrearModal(false); resetForm();}} className="p-1 rounded-lg bg-white/10 hover:bg-white/20"><Filter className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="flex gap-2 text-[11px]">
                {[1,2,3,4,5].map(n=><button key={n} onClick={()=>setPaso(n)} className={`px-3 py-1 rounded-full border font-bold ${paso===n?'bg-violet-600 text-white border-violet-600':'bg-slate-100'}`}>Paso {n}</button>)}
              </div>

              {paso===1 && (
                <div className="space-y-3">
                  <h4 className="font-bold">Paso 1 — Seleccionar inmueble/contrato + crear acta base</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="block font-semibold">Inmueble *</label><select value={formInmuebleId} onChange={e=>setFormInmuebleId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl">{['', ...inmuebles.map(i=>i.id)].map(id=>{ const inm=inmuebles.find(x=>x.id===id); return <option key={id} value={id}>{id ? `${inm?.direccion || id} — ${inm?.ciudad||''}` : 'Selecciona inmueble'}</option>; })}</select></div>
                    <div><label className="block font-semibold">Contrato (opcional)</label><select value={formContratoId} onChange={e=>setFormContratoId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl">{['', ...contratos.filter(c=>!formInmuebleId || c.inmuebleId===formInmuebleId).map(c=>c.id)].map(id=>{ const c=contratos.find(x=>x.id===id); return <option key={id} value={id}>{id ? `${c?.candidatoNombre || id} — ${c?.inmuebleNombre || ''}` : 'Sin contrato'}</option>; })}</select></div>
                    {tipoCrear==='SALIDA' && <div className="md:col-span-2"><label className="block font-semibold">Acta ENTRADA vinculada * (para SALIDA)</label><select value={formActaEntradaId} onChange={e=>setFormActaEntradaId(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl">{['', ...actas.filter(a=>a.tipo==='ENTRADA' && (!formInmuebleId || a.propertyId===formInmuebleId)).map(a=>a.id)].map(id=>{ const a=actas.find(x=>x.id===id); return <option key={id} value={id}>{id ? `${a?.id.slice(0,8)} — ${a?.fechaActo} — ${a?.propertyId.slice(0,8)}` : 'Selecciona acta entrada'}</option>; })}</select></div>}
                    <div><label className="block font-semibold">Fecha acto *</label><input type="date" value={formFechaActo} onChange={e=>setFormFechaActo(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl" /></div>
                    <div><label className="block font-semibold">Hora acto</label><input type="time" value={formHoraActo} onChange={e=>setFormHoraActo(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl" /></div>
                  </div>
                  <button onClick={()=>setPaso(2)} className="px-4 py-2 bg-violet-600 text-white rounded-xl font-bold">Siguiente — Participantes</button>
                </div>
              )}

              {paso===2 && (
                <div className="space-y-3">
                  <h4 className="font-bold">Paso 2 — Participantes (arrendador/arrendatario/testigo/gestor)</h4>
                  <AddParticipanteForm onAdd={(p)=>setFormParticipantes([...formParticipantes, p])} />
                  <div className="space-y-1">{formParticipantes.map(p=><div key={p.id} className="p-2 bg-slate-50 border rounded-lg flex justify-between"><span>{p.nombre} — {p.rol} {p.dni?`DNI ${p.dni}`:''} {p.firmaRequerida?'[Firma req]':''}</span><button onClick={()=>setFormParticipantes(formParticipantes.filter(x=>x.id!==p.id))} className="text-rose-600 font-bold">Eliminar</button></div>)}</div>
                  <div className="flex gap-2"><button onClick={()=>setPaso(1)} className="px-3 py-1 bg-slate-100 border rounded-lg">Atrás</button><button onClick={()=>setPaso(3)} className="px-4 py-2 bg-violet-600 text-white rounded-xl font-bold">Siguiente — Inventario</button></div>
                </div>
              )}

              {paso===3 && (
                <div className="space-y-3">
                  <h4 className="font-bold">Paso 3 — Inventario por elemento (categoría/elemento/descripción/estado/observaciones/cantidad/evidencia)</h4>
                  <AddInventarioForm onAdd={(e)=>setFormInventario([...formInventario, e])} />
                  <div className="max-h-48 overflow-y-auto space-y-1">{formInventario.map(el=><div key={el.id} className="p-2 bg-slate-50 border rounded-lg flex justify-between"><span>[{el.categoria}] {el.elemento} — {el.estado} x{el.cantidad}</span><button onClick={()=>setFormInventario(formInventario.filter(x=>x.id!==el.id))} className="text-rose-600 font-bold">Eliminar</button></div>)}</div>
                  <div className="flex gap-2"><button onClick={()=>setPaso(2)} className="px-3 py-1 bg-slate-100 border rounded-lg">Atrás</button><button onClick={()=>setPaso(4)} className="px-4 py-2 bg-violet-600 text-white rounded-xl font-bold">Siguiente — Contadores</button></div>
                </div>
              )}

              {paso===4 && (
                <div className="space-y-3">
                  <h4 className="font-bold">Paso 4 — Lecturas contadores (electricidad/agua/gas/otros tipo/lectura/unidad/fecha/observaciones/evidencia)</h4>
                  <AddContadorFormSimple onAdd={(c)=>setFormContadores([...formContadores, c])} />
                  <div className="space-y-1">{formContadores.map(c=><div key={c.id} className="p-2 bg-slate-50 border rounded-lg flex justify-between"><span>{c.tipo}: {c.lectura} {c.unidad||''} {c.fechaHora.slice(0,16)}</span><button onClick={()=>setFormContadores(formContadores.filter(x=>x.id!==c.id))} className="text-rose-600 font-bold">Eliminar</button></div>)}</div>
                  <div className="flex gap-2"><button onClick={()=>setPaso(3)} className="px-3 py-1 bg-slate-100 border rounded-lg">Atrás</button><button onClick={()=>setPaso(5)} className="px-4 py-2 bg-violet-600 text-white rounded-xl font-bold">Siguiente — Revisión y crear</button></div>
                </div>
              )}

              {paso===5 && (
                <div className="space-y-3">
                  <h4 className="font-bold">Paso 5 — Observaciones, revisión, PENDIENTE_FIRMA, firma, trazabilidad, PDF</h4>
                  <div><label className="block font-semibold">Observaciones generales</label><textarea value={formObservaciones} onChange={e=>setFormObservaciones(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border rounded-xl h-20" /></div>
                  <div className="p-3 bg-slate-900 text-white rounded-xl text-[11px] space-y-1">
                    <div>Resumen: Inmueble {formInmuebleId} | Contrato {formContratoId || '—'} | Fecha {formFechaActo} {formHoraActo} | Participantes {formParticipantes.length} | Inventario {formInventario.length} | Contadores {formContadores.length}</div>
                    <div>Flujo acta ENTRADA: seleccionar inmueble/contrato → crear → fecha/hora → participantes → inventario → estados → observaciones → contadores → evidencias (tras crear) → incidencias (tras crear) → revisión → PENDIENTE_FIRMA → firma → trazabilidad → PDF</div>
                    <div>Flujo acta SALIDA: seleccionar contrato → recuperar entrada → crear salida → revisar inventario inicial → estado final → diferencias → lecturas finales → fotos → incidencias → observaciones → resumen diferencias → revisión → firma → trazabilidad</div>
                    <div>Estados: BORRADOR → EN_REVISION → PENDIENTE_FIRMA → FIRMADA → CERRADA (+ ERROR/CANCELADA). Transiciones controladas dominio, firmada/cerrada no vuelve silenciosa borrador.</div>
                  </div>
                  <div className="flex gap-2"><button onClick={()=>setPaso(4)} className="px-3 py-1 bg-slate-100 border rounded-lg">Atrás</button><button onClick={handleCrearActa} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-1"><CheckCircle className="w-4 h-4" />Crear acta {tipoCrear} — BORRADOR</button></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponentes formularios
const AddParticipanteForm: React.FC<{ onAdd: (p: ParticipanteActa) => void }> = ({ onAdd }) => {
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState<ParticipanteActa['rol']>('ARRENDATARIO');
  const [dni, setDni] = useState('');
  const [firmaReq, setFirmaReq] = useState(true);
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 bg-slate-50 border rounded-xl">
      <input placeholder="Nombre completo *" value={nombre} onChange={e=>setNombre(e.target.value)} className="px-2 py-1 bg-white border rounded" />
      <select value={rol} onChange={e=>setRol(e.target.value as any)} className="px-2 py-1 bg-white border rounded"><option>ARRENDADOR</option><option>ARRENDATARIO</option><option>COTITULAR</option><option>AVALISTA</option><option>TESTIGO</option><option>GESTOR</option><option>ADMINISTRADOR</option><option>OTRO</option></select>
      <input placeholder="DNI/NIE" value={dni} onChange={e=>setDni(e.target.value)} className="px-2 py-1 bg-white border rounded" />
      <div className="flex items-center gap-2"><label className="flex items-center gap-1"><input type="checkbox" checked={firmaReq} onChange={e=>setFirmaReq(e.target.checked)} />Firma req</label><button onClick={()=>{ if(!nombre.trim()){alert('Nombre requerido'); return;} const p: ParticipanteActa = { id: `part_${Date.now()}`, nombre: nombre.trim(), rol, dni: dni.trim()||undefined, firmaRequerida: firmaReq, haFirmado: false }; onAdd(p); setNombre(''); setDni(''); }} className="px-3 py-1 bg-violet-600 text-white rounded-lg font-bold">Añadir</button></div>
    </div>
  );
};

const AddInventarioForm: React.FC<{ onAdd: (e: ElementoActaInventario) => void }> = ({ onAdd }) => {
  const [categoria, setCategoria] = useState('COCINA');
  const [elemento, setElemento] = useState('');
  const [estado, setEstado] = useState('CORRECTO');
  const [cantidad, setCantidad] = useState(1);
  const [ubicacion, setUbicacion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 p-3 bg-slate-50 border rounded-xl">
      <select value={categoria} onChange={e=>setCategoria(e.target.value)} className="px-2 py-1 bg-white border rounded">{CATEGORIAS_ELEMENTO_ACTA.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>
      <input placeholder="Elemento *" value={elemento} onChange={e=>setElemento(e.target.value)} className="px-2 py-1 bg-white border rounded" />
      <select value={estado} onChange={e=>setEstado(e.target.value)} className="px-2 py-1 bg-white border rounded">{ESTADOS_ELEMENTO_ACTA.map(es=><option key={es.id} value={es.id}>{es.label}</option>)}</select>
      <input type="number" min={1} value={cantidad} onChange={e=>setCantidad(parseInt(e.target.value)||1)} className="px-2 py-1 bg-white border rounded" />
      <input placeholder="Ubicación" value={ubicacion} onChange={e=>setUbicacion(e.target.value)} className="px-2 py-1 bg-white border rounded" />
      <div className="flex gap-1"><input placeholder="Observaciones" value={observaciones} onChange={e=>setObservaciones(e.target.value)} className="px-2 py-1 bg-white border rounded flex-1" /><button onClick={()=>{ if(!elemento.trim()){alert('Elemento requerido'); return;} const el = crearElementoActaInventario('tmp', { elemento: elemento.trim(), categoria: categoria as any, estado: estado as any, cantidad, ubicacion: ubicacion||undefined, observaciones: observaciones||undefined, orden: 0 }); onAdd(el); setElemento(''); setObservaciones(''); }} className="px-2 py-1 bg-violet-600 text-white rounded font-bold">+</button></div>
    </div>
  );
};

const AddContadorFormSimple: React.FC<{ onAdd: (c: LecturaContador) => void }> = ({ onAdd }) => {
  const [tipo, setTipo] = useState<LecturaContador['tipo']>('ELECTRICIDAD');
  const [lectura, setLectura] = useState('');
  const [unidad, setUnidad] = useState('kWh');
  const [obs, setObs] = useState('');
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 p-3 bg-slate-50 border rounded-xl">
      <select value={tipo} onChange={e=>{ setTipo(e.target.value as any); setUnidad(e.target.value==='ELECTRICIDAD'?'kWh':e.target.value==='AGUA'?'m3':e.target.value==='GAS'?'m3':''); }} className="px-2 py-1 bg-white border rounded"><option>ELECTRICIDAD</option><option>AGUA</option><option>GAS</option><option>CALEFACCION</option><option>OTRO</option></select>
      <input placeholder="Lectura *" value={lectura} onChange={e=>setLectura(e.target.value)} className="px-2 py-1 bg-white border rounded" />
      <input placeholder="Unidad" value={unidad} onChange={e=>setUnidad(e.target.value)} className="px-2 py-1 bg-white border rounded" />
      <input placeholder="Observaciones" value={obs} onChange={e=>setObs(e.target.value)} className="px-2 py-1 bg-white border rounded" />
      <button onClick={()=>{ if(!lectura.trim()){alert('Lectura requerida'); return;} const num = parseFloat(lectura.replace(',', '.')); const lec: LecturaContador = { id: `lec_${Date.now()}`, actaId: 'tmp', tipo, lectura: lectura.trim(), lecturaNumerica: isNaN(num)?undefined:num, unidad: unidad||undefined, fechaHora: new Date().toISOString(), observaciones: obs||undefined }; onAdd(lec); setLectura(''); setObs(''); }} className="px-3 py-1 bg-violet-600 text-white rounded-lg font-bold">Añadir</button>
    </div>
  );
};

const AddContadorForm: React.FC<{ acta: Acta; onSave: (lec: LecturaContador) => void }> = ({ acta, onSave }) => {
  const [tipo, setTipo] = useState<LecturaContador['tipo']>('ELECTRICIDAD');
  const [lectura, setLectura] = useState('');
  const [unidad, setUnidad] = useState('kWh');
  return (
    <div className="flex gap-2">
      <select value={tipo} onChange={e=>{ setTipo(e.target.value as any); setUnidad(e.target.value==='ELECTRICIDAD'?'kWh':e.target.value==='AGUA'?'m3':'m3'); }} className="px-2 py-1 bg-white border rounded text-xs"><option>ELECTRICIDAD</option><option>AGUA</option><option>GAS</option><option>OTRO</option></select>
      <input placeholder="Lectura" value={lectura} onChange={e=>setLectura(e.target.value)} className="px-2 py-1 bg-white border rounded text-xs w-24" />
      <input placeholder="Unidad" value={unidad} onChange={e=>setUnidad(e.target.value)} className="px-2 py-1 bg-white border rounded text-xs w-16" />
      <button onClick={()=>{ if(!lectura.trim()) return; const num=parseFloat(lectura); onSave({ id: `lec_${Date.now()}`, actaId: acta.id, tipo, lectura, lecturaNumerica: isNaN(num)?undefined:num, unidad, fechaHora: new Date().toISOString() }); setLectura(''); }} className="px-2 py-1 bg-white text-slate-900 rounded font-bold text-xs">Añadir</button>
    </div>
  );
};

const AddIncidenciaActaForm: React.FC<{ acta: Acta; ownerId: string; onSave: (inc: IncidenciaActa) => void }> = ({ acta, ownerId, onSave }) => {
  const [titulo, setTitulo] = useState('');
  const [desc, setDesc] = useState('');
  const [origen, setOrigen] = useState<IncidenciaActa['origen']>('SALIDA');
  return (
    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
      <div className="font-bold">Añadir incidencia acta</div>
      <input placeholder="Título *" value={titulo} onChange={e=>setTitulo(e.target.value)} className="w-full px-2 py-1 bg-white border rounded text-xs" />
      <textarea placeholder="Descripción *" value={desc} onChange={e=>setDesc(e.target.value)} className="w-full px-2 py-1 bg-white border rounded text-xs h-16" />
      <div className="flex gap-2"><select value={origen} onChange={e=>setOrigen(e.target.value as any)} className="px-2 py-1 bg-white border rounded text-xs"><option>ENTRADA</option><option>SALIDA</option><option>ESTANCIA</option><option>COMPARACION</option></select><button onClick={()=>{ if(!titulo.trim()||!desc.trim()){alert('Título y descripción requeridos'); return;} const inc: IncidenciaActa = { id: `inc_acta_${Date.now()}`, actaId: acta.id, ownerId, propertyId: acta.propertyId, contractId: acta.contractId, titulo: titulo.trim(), descripcion: desc.trim(), estado: 'ABIERTA', origen, fechaHora: new Date().toISOString() }; onSave(inc); setTitulo(''); setDesc(''); }} className="px-3 py-1 bg-amber-600 text-white rounded-lg font-bold text-xs">Crear incidencia</button></div>
    </div>
  );
};
