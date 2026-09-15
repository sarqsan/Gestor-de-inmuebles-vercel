import React, { useState, useEffect } from 'react';
import {
  Candidato,
  Inmueble,
  ConfiguracionAseguradora,
  SolicitudSeguroImpago,
  TitularExpedienteSeguro,
  AvalistaExpedienteSeguro,
  DocumentoAdjuntoSeguro,
  TipoDocumento,
} from '../types';
import {
  X,
  ShieldCheck,
  Building2,
  Users,
  UserPlus,
  FileCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Calculator,
  ChevronRight,
  Check,
} from 'lucide-react';
import { getTipoDocumentoLabel } from '../utils/formatters';

interface CrearSolicitudSeguroModalProps {
  candidato?: Candidato | null;
  inmueble?: Inmueble | null;
  candidatosList: Candidato[];
  inmueblesList: Inmueble[];
  aseguradoras: ConfiguracionAseguradora[];
  onClose: () => void;
  onCrearSolicitud: (solicitud: SolicitudSeguroImpago) => void;
}

export const CrearSolicitudSeguroModal: React.FC<CrearSolicitudSeguroModalProps> = ({
  candidato,
  inmueble,
  candidatosList,
  inmueblesList,
  aseguradoras,
  onClose,
  onCrearSolicitud,
}) => {
  // Inmueble state
  const [selectedInmuebleId, setSelectedInmuebleId] = useState<string>(
    inmueble?.id || candidato?.inmuebleInteresId || inmueblesList[0]?.id || ''
  );
  const currentInmueble = inmueblesList.find((i) => i.id === selectedInmuebleId) || inmueblesList[0];
  const [rentaMensual, setRentaMensual] = useState<number>(currentInmueble?.precio || 1200);

  // Aseguradora state
  const defaultAsegId =
    aseguradoras.find((a) => a.id === 'seag' || a.nombre.toLowerCase().includes('seag'))?.id ||
    aseguradoras[0]?.id ||
    'seag';

  const [selectedAseguradoraId, setSelectedAseguradoraId] = useState<string>(defaultAsegId);
  const currentAseguradora =
    aseguradoras.find((a) => a.id === selectedAseguradoraId) ||
    aseguradoras.find((a) => a.id === 'seag') ||
    aseguradoras[0];

  // Candidato Principal (Titular 1)
  const [selectedCandidatoId, setSelectedCandidatoId] = useState<string>(
    candidato?.id || candidatosList[0]?.id || ''
  );
  const currentCandidato =
    candidatosList.find((c) => c.id === selectedCandidatoId) || candidatosList[0];

  // Número de orden de candidato para este inmueble (e.g. 1 para Candidato 1, 2 para Candidato 2...)
  const [numeroCandidatoInmueble, setNumeroCandidatoInmueble] = useState<number>(1);

  const [titular1, setTitular1] = useState<TitularExpedienteSeguro>({
    nombre: currentCandidato?.nombre || '',
    dniNie: currentCandidato?.dni || '',
    telefono: currentCandidato?.telefono || '',
    email: currentCandidato?.email || '',
    tipoEmpleo: currentCandidato?.tipoEmpleo || 'cuenta_ajena_indefinido',
    empresa: currentCandidato?.empresa || '',
    tipoContrato: currentCandidato?.tipoContrato || 'Indefinido',
    antiguedadLaboral: currentCandidato?.antiguedadLaboral || 'Más de 1 año',
    ingresosNetosMensuales: currentCandidato?.ingresosNetos || 2400,
  });

  // Titular 2 (Cotitular)
  const [hasTitular2, setHasTitular2] = useState<boolean>(false);
  const [titular2, setTitular2] = useState<TitularExpedienteSeguro>({
    nombre: '',
    dniNie: '',
    telefono: '',
    email: '',
    tipoEmpleo: 'cuenta_ajena_indefinido',
    empresa: '',
    tipoContrato: 'Indefinido',
    antiguedadLaboral: 'Más de 1 año',
    ingresosNetosMensuales: 1500,
  });

  // Avalista
  const [tieneAvalista, setTieneAvalista] = useState<boolean>(false);
  const [avalista, setAvalista] = useState<AvalistaExpedienteSeguro>({
    nombre: '',
    dniNie: '',
    telefono: '',
    email: '',
    relacion: 'Familiar directo (Padres/Hermanos)',
    tipoEmpleo: 'Indefinido / Pensionista',
    ingresosNetosMensuales: 2000,
  });

  // Selected Documents
  const [documentosAdjuntos, setDocumentosAdjuntos] = useState<DocumentoAdjuntoSeguro[]>([]);

  // Update titular1 whenever selected candidate changes
  useEffect(() => {
    if (currentCandidato) {
      setTitular1({
        nombre: currentCandidato.nombre || '',
        dniNie: currentCandidato.dni || '',
        telefono: currentCandidato.telefono || '',
        email: currentCandidato.email || '',
        tipoEmpleo: currentCandidato.tipoEmpleo || 'cuenta_ajena_indefinido',
        empresa: currentCandidato.empresa || '',
        tipoContrato: currentCandidato.tipoContrato || 'Indefinido',
        antiguedadLaboral: currentCandidato.antiguedadLaboral || 'Más de 1 año',
        ingresosNetosMensuales: currentCandidato.ingresosNetos || 2400,
      });

      // Prepare attached docs
      const docs: DocumentoAdjuntoSeguro[] = (currentCandidato.documentosAnalizados || []).map((doc) => ({
        id: doc.id,
        nombre: doc.nombreArchivo,
        tipo: doc.tipoDocumento,
        verificado: doc.estadoAnalisis === 'analizado' || doc.confirmadoUsuario || false,
        url: doc.url,
        base64Data: doc.base64Data,
      }));

      // If no analyzed docs, populate standard required list
      if (docs.length === 0) {
        setDocumentosAdjuntos([
          { id: 'doc_dni', nombre: 'DNI_NIE_Frontal_Trasero.pdf', tipo: 'dni_nie', verificado: true },
          { id: 'doc_nom1', nombre: 'Ultima_Nomina_Mes_Anterior.pdf', tipo: 'nomina', verificado: true },
          { id: 'doc_nom2', nombre: 'Nomina_Penultimo_Mes.pdf', tipo: 'nomina', verificado: true },
          { id: 'doc_contr', nombre: 'Contrato_Laboral_Indefinido.pdf', tipo: 'contrato', verificado: true },
          { id: 'doc_vida', nombre: 'Informe_Vida_Laboral_TGSS.pdf', tipo: 'vida_laboral', verificado: true },
        ]);
      } else {
        setDocumentosAdjuntos(docs);
      }
    }
  }, [selectedCandidatoId]);

  // Update renta when inmueble changes
  useEffect(() => {
    if (currentInmueble) {
      setRentaMensual(currentInmueble.precio || 1200);
    }
  }, [selectedInmuebleId]);

  // Financial calculations
  const totalIngresos =
    titular1.ingresosNetosMensuales + (hasTitular2 ? titular2.ingresosNetosMensuales : 0);
  const ratioEsfuerzo =
    totalIngresos > 0 ? Math.round((rentaMensual / totalIngresos) * 100 * 10) / 10 : 0;
  const ratioMaximoAseguradora = currentAseguradora?.ratioEsfuerzoMaximo || 40;
  const cumpleRatio = ratioEsfuerzo <= ratioMaximoAseguradora;

  const handleToggleDocVerificado = (docId: string) => {
    setDocumentosAdjuntos((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, verificado: !d.verificado } : d))
    );
  };

  const handleCrear = () => {
    const timestamp = Date.now().toString().slice(-4);
    const refCode = `REF-IMPAGO-${new Date().getFullYear()}-${timestamp}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    const scoreAI = currentCandidato?.scoringTotal || (cumpleRatio ? 92 : 68);
    const nivelRiesgoAI = ratioEsfuerzo <= 35 ? 'Bajo' : ratioEsfuerzo <= 42 ? 'Medio' : 'Alto';

    const nuevaSolicitud: SolicitudSeguroImpago = {
      id: `sol_seguro_${Date.now()}`,
      referenciaUnica: refCode,
      candidatoId: currentCandidato?.id || 'cand_1',
      inmuebleId: currentInmueble?.id || 'inm_1',
      inmuebleNombre: currentInmueble?.titulo || 'Inmueble Residencial',
      inmuebleDireccion: currentInmueble?.direccion || '',
      inmuebleCiudad: currentInmueble?.ciudad || 'Madrid',
      rentaMensual: rentaMensual,

      aseguradoraId: currentAseguradora.id,
      aseguradoraNombre: currentAseguradora.nombre,
      aseguradoraEmail: currentAseguradora.emailTramitacion,

      numTitulares: hasTitular2 ? 2 : 1,
      numeroCandidatoInmueble: numeroCandidatoInmueble || 1,
      titular1: titular1,
      titular2: hasTitular2 ? titular2 : undefined,
      tieneAvalista: tieneAvalista,
      avalista: tieneAvalista ? avalista : undefined,
      ingresosTotalesConjuntos: totalIngresos,
      ratioEsfuerzoCalculado: ratioEsfuerzo,

      documentosAdjuntos: documentosAdjuntos,
      documentacionCompletaSegunAseguradora: documentosAdjuntos.filter((d) => d.verificado).length >= 3,

      resumenSolvenciaIA: `Expediente preparado para ${titular1.nombre}. Ingresos conjuntos de ${totalIngresos} €/mes con ratio de esfuerzo del ${ratioEsfuerzo}% frente a renta de ${rentaMensual} €/mes. ${cumpleRatio ? 'Cumple holgadamente el criterio de riesgo de ' + currentAseguradora.nombre : 'Supera ligeramente el umbral estándar del ' + ratioMaximoAseguradora + '%.'}`,
      scoreSolvenciaIA: scoreAI,
      alertasDetectadasIA: cumpleRatio
        ? []
        : [`El ratio de esfuerzo (${ratioEsfuerzo}%) supera el máximo aconsejado del ${ratioMaximoAseguradora}% para ${currentAseguradora.nombre}. Se recomienda aportar avalista.`],
      nivelRiesgoIA: nivelRiesgoAI,

      estado: 'BORRADOR',
      metodoEnvio: 'GMAIL_API',
      dictamenAseguradora: 'EN_ESTUDIO',
      procesadoConIA: false,

      decisionFinalPropietario: 'PENDIENTE',

      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
      historial: [
        {
          id: `hist_${Date.now()}`,
          fecha: new Date().toISOString(),
          autor: 'propietario',
          accion: 'Creación de expediente de seguro de impago',
          detalle: `Expediente generado con código ${refCode} para ${currentAseguradora.nombre}.`,
        },
      ],
    };

    onCrearSolicitud(nuevaSolicitud);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto max-h-[94vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between sticky top-0 z-20 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-600/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base sm:text-lg">
                Nuevo Expediente de Seguro de Impago
              </h3>
              <p className="text-xs text-slate-500">
                Prepara la información de solvencia, documentos y titulares para la aseguradora
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-sm">
          {/* STEP 1: INMUEBLE Y ASEGURADORA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Building2 className="w-4 h-4 text-blue-600" />
                Inmueble y Renta
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Seleccionar Inmueble:</label>
                <select
                  value={selectedInmuebleId}
                  onChange={(e) => setSelectedInmuebleId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {inmueblesList.map((inm) => (
                    <option key={inm.id} value={inm.id}>
                      {inm.titulo} ({inm.precio} €/mes) - {inm.ciudad}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Renta Mensual Asegurable (€):</label>
                <input
                  type="number"
                  value={rentaMensual}
                  onChange={(e) => setRentaMensual(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-black text-slate-900 border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                Aseguradora Destino
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Seleccionar Compañía / Garantía:</label>
                <select
                  value={selectedAseguradoraId}
                  onChange={(e) => setSelectedAseguradoraId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {aseguradoras.map((aseg) => {
                    const isSeag = aseg.id === 'seag' || aseg.nombre.toLowerCase().includes('seag');
                    return (
                      <option key={aseg.id} value={aseg.id}>
                        {isSeag ? '★ ' : ''}{aseg.nombre} (Máx {aseg.ratioEsfuerzoMaximo}% esfuerzo - Prima {aseg.tasaPrimaAnualPorcentaje}%)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="p-2.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs space-y-1">
                <div className="flex justify-between font-bold text-indigo-950">
                  <span>Email de trámite:</span>
                  <span className="font-mono text-[11px] text-indigo-700">{currentAseguradora?.emailTramitacion}</span>
                </div>
                <div className="flex justify-between text-indigo-800 text-[11px]">
                  <span>Prima estimada ({currentAseguradora?.tasaPrimaAnualPorcentaje}%):</span>
                  <span className="font-bold">
                    {Math.round(rentaMensual * 12 * ((currentAseguradora?.tasaPrimaAnualPorcentaje || 4.5) / 100))} €/año
                  </span>
                </div>
                {(currentAseguradora?.id === 'seag' || currentAseguradora?.nombre.toLowerCase().includes('seag')) && (
                  <div className="pt-1 mt-1 border-t border-indigo-200/60 flex items-center justify-between text-[10px] text-indigo-900 font-extrabold">
                    <span>⚡ Garantía SEAG: Cobro día 1</span>
                    <span>Respuesta &lt; 2h</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* STEP 2: TITULARES Y SOLVENCIA */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-700" />
                <h4 className="font-black text-slate-900 text-sm">Titulares y Candidatos del Inmueble</h4>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 bg-indigo-50/80 px-2 py-1 rounded-lg border border-indigo-200/70">
                  <label className="text-[11px] font-bold text-indigo-900">Orden:</label>
                  <select
                    value={numeroCandidatoInmueble}
                    onChange={(e) => setNumeroCandidatoInmueble(Number(e.target.value))}
                    className="px-1.5 py-0.5 text-xs font-black text-indigo-700 bg-white border border-indigo-200 rounded"
                  >
                    <option value={1}>Candidato 1</option>
                    <option value={2}>Candidato 2</option>
                    <option value={3}>Candidato 3</option>
                    <option value={4}>Candidato 4</option>
                    <option value={5}>Candidato 5</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-slate-600">Candidato base:</label>
                  <select
                    value={selectedCandidatoId}
                    onChange={(e) => setSelectedCandidatoId(e.target.value)}
                    className="px-2.5 py-1 text-xs font-bold border border-slate-300 rounded-lg bg-white"
                  >
                    {candidatosList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.ingresosNetos} €)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Titular 1 Card */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                  Titular 1 (Principal)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Nombre y Apellidos:</label>
                  <input
                    type="text"
                    value={titular1.nombre}
                    onChange={(e) => setTitular1({ ...titular1, nombre: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">DNI / NIE:</label>
                  <input
                    type="text"
                    value={titular1.dniNie || ''}
                    onChange={(e) => setTitular1({ ...titular1, dniNie: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Ingresos Netos Mensuales (€):</label>
                  <input
                    type="number"
                    value={titular1.ingresosNetosMensuales}
                    onChange={(e) => setTitular1({ ...titular1, ingresosNetosMensuales: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 text-xs font-black text-slate-900 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Empresa:</label>
                  <input
                    type="text"
                    value={titular1.empresa || ''}
                    onChange={(e) => setTitular1({ ...titular1, empresa: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Tipo de Contrato:</label>
                  <input
                    type="text"
                    value={titular1.tipoContrato || ''}
                    onChange={(e) => setTitular1({ ...titular1, tipoContrato: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Antigüedad:</label>
                  <input
                    type="text"
                    value={titular1.antiguedadLaboral || ''}
                    onChange={(e) => setTitular1({ ...titular1, antiguedadLaboral: e.target.value })}
                    className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Toggle Titular 2 */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-xs text-slate-800 block">¿Añadir Segundo Titular (Cotitular)?</span>
                <span className="text-[11px] text-slate-500">Permite computar ingresos conjuntos de pareja o conviviente.</span>
              </div>
              <button
                type="button"
                onClick={() => setHasTitular2(!hasTitular2)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  hasTitular2 ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-700'
                }`}
              >
                {hasTitular2 ? '2 Titulares Activo' : '+ Añadir 2º Titular'}
              </button>
            </div>

            {/* Titular 2 Card if active */}
            {hasTitular2 && (
              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-3 animate-in fade-in duration-150">
                <span className="text-xs font-bold text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-md">
                  Titular 2 (Cotitular)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Nombre y Apellidos:</label>
                    <input
                      type="text"
                      value={titular2.nombre}
                      onChange={(e) => setTitular2({ ...titular2, nombre: e.target.value })}
                      placeholder="Nombre del cotitular"
                      className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">DNI / NIE:</label>
                    <input
                      type="text"
                      value={titular2.dniNie || ''}
                      onChange={(e) => setTitular2({ ...titular2, dniNie: e.target.value })}
                      placeholder="12345678Z"
                      className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Ingresos Netos Mensuales (€):</label>
                    <input
                      type="number"
                      value={titular2.ingresosNetosMensuales}
                      onChange={(e) => setTitular2({ ...titular2, ingresosNetosMensuales: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 text-xs font-black text-slate-900 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Toggle Avalista */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-xs text-slate-800 block">¿Añadir Avalista / Garante?</span>
                <span className="text-[11px] text-slate-500">Recomendado si el ratio de esfuerzo supera el 40%.</span>
              </div>
              <button
                type="button"
                onClick={() => setTieneAvalista(!tieneAvalista)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  tieneAvalista ? 'bg-amber-600 text-white' : 'bg-white border border-slate-300 text-slate-700'
                }`}
              >
                {tieneAvalista ? 'Avalista Incluido' : '+ Añadir Avalista'}
              </button>
            </div>

            {tieneAvalista && (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3 animate-in fade-in duration-150">
                <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                  Garante / Avalista
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Nombre Avalista:</label>
                    <input
                      type="text"
                      value={avalista.nombre}
                      onChange={(e) => setAvalista({ ...avalista, nombre: e.target.value })}
                      placeholder="Nombre del avalista"
                      className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Parentesco / Relación:</label>
                    <input
                      type="text"
                      value={avalista.relacion || ''}
                      onChange={(e) => setAvalista({ ...avalista, relacion: e.target.value })}
                      placeholder="Padre / Madre / Familiar"
                      className="w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-500 block mb-0.5">Ingresos Avalista (€):</label>
                    <input
                      type="number"
                      value={avalista.ingresosNetosMensuales || 0}
                      onChange={(e) => setAvalista({ ...avalista, ingresosNetosMensuales: Number(e.target.value) })}
                      className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* FINANCIAL SUMMARY & RATIO CALCULATION */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-slate-300">
                  Cálculo de Solvencia y Ratio de Esfuerzo
                </span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                cumpleRatio ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}>
                {cumpleRatio ? 'Ratio Favorable' : 'Ratio Elevado'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="p-2 bg-slate-800/80 rounded-xl">
                <span className="text-[10px] text-slate-400 block">Renta Inmueble</span>
                <span className="text-base font-black text-white">{rentaMensual.toLocaleString('es-ES')} €</span>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-xl">
                <span className="text-[10px] text-slate-400 block">Ingresos Conjuntos</span>
                <span className="text-base font-black text-emerald-400">{totalIngresos.toLocaleString('es-ES')} €</span>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-xl">
                <span className="text-[10px] text-slate-400 block">Ratio Calculado</span>
                <span className={`text-base font-black ${cumpleRatio ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {ratioEsfuerzo}%
                </span>
              </div>
              <div className="p-2 bg-slate-800/80 rounded-xl">
                <span className="text-[10px] text-slate-400 block">Límite {currentAseguradora?.nombre}</span>
                <span className="text-base font-black text-slate-300">{ratioMaximoAseguradora}%</span>
              </div>
            </div>
          </div>

          {/* STEP 3: DOCUMENTACIÓN APORTADA */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-slate-700" />
                <h4 className="font-black text-slate-900 text-sm">Documentación Aportada para Adjuntar</h4>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {documentosAdjuntos.filter((d) => d.verificado).length} adjuntos seleccionados
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {documentosAdjuntos.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => handleToggleDocVerificado(doc.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    doc.verificado
                      ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                      : 'bg-slate-50 border-slate-200 text-slate-500 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                      doc.verificado ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'
                    }`}>
                      <Check className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs truncate">{doc.nombre}</p>
                      <p className="text-[10px] text-slate-500">{getTipoDocumentoLabel(doc.tipo)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-colors"
          >
            Cancelar
          </button>

          <button
            onClick={handleCrear}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-colors shadow-lg shadow-indigo-600/20 flex items-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            Crear Expediente y Preparar Solicitud
          </button>
        </div>
      </div>
    </div>
  );
};
