import { CandidateStatus, EmploymentType, ContractType, TipoDocumento, EstadoAnalisisDoc } from '../types';

export const formatEuro = (amount: number): string => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const getTipoDocumentoLabel = (tipo: TipoDocumento): string => {
  switch (tipo) {
    case 'nomina':
      return 'Nómina';
    case 'contrato':
      return 'Contrato laboral';
    case 'vida_laboral':
      return 'Vida laboral';
    case 'renta':
      return 'Declaración de la renta';
    case 'dni_nie':
      return 'DNI / NIE';
    case 'justificante_bancario':
      return 'Justificante bancario';
    case 'otros_ingresos':
      return 'Justificante de otros ingresos';
    case 'avalista':
      return 'Documentación de avalista';
    case 'otro':
    default:
      return 'Otro documento';
  }
};

export const getEstadoAnalisisInfo = (estado: EstadoAnalisisDoc) => {
  switch (estado) {
    case 'pendiente':
      return {
        label: 'Pendiente de análisis',
        emoji: '🟡',
        badgeStyle: 'bg-amber-50 text-amber-800 border-amber-200/80',
        dotClass: 'bg-amber-500',
      };
    case 'analizando':
      return {
        label: 'Analizando con Gemini...',
        emoji: '🔵',
        badgeStyle: 'bg-blue-50 text-blue-800 border-blue-200/80 animate-pulse',
        dotClass: 'bg-blue-500',
      };
    case 'analizado':
      return {
        label: 'Analizado',
        emoji: '🟢',
        badgeStyle: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        dotClass: 'bg-emerald-500',
      };
    case 'error':
      return {
        label: 'Error en análisis',
        emoji: '🔴',
        badgeStyle: 'bg-rose-50 text-rose-800 border-rose-200/80',
        dotClass: 'bg-rose-500',
      };
  }
};

export const getCandidateStatusLabel = (status: CandidateStatus | string): string => {
  switch (status) {
    case 'nuevo':
      return 'Nuevo';
    case 'preseleccionado':
      return 'Preseleccionado ⭐';
    case 'visita_reservada':
      return 'Visita reservada 📅';
    case 'seleccionado':
      return 'Seleccionado 🏆';
    case 'pendiente_doc':
    case 'doc_solicitada':
      return 'Doc. Solicitada 📄';
    case 'doc_recibida':
      return 'Doc. Recibida ✓';
    case 'pendiente_analisis':
    case 'en_analisis':
      return 'En Análisis IA 🔍';
    case 'analizado':
      return 'Analizado 📊';
    case 'seguro_solicitado':
      return 'Seguro Solicitado 🛡️';
    case 'aprobado_seguro':
      return 'Seguro Favorable 🟢';
    case 'rechazado_seguro':
      return 'Seguro Desfavorable 🔴';
    case 'decision_pendiente':
      return 'Decisión Pendiente ⚖️';
    case 'aceptado_final':
      return 'Aceptado Final ✅';
    case 'rechazado_final':
    case 'no_seleccionado':
      return 'No seleccionado ❌';
    case 'formalizado':
      return 'Formalizado 📝';
    default:
      return status;
  }
};

export const getCandidateStatusBadgeStyle = (status: CandidateStatus | string): string => {
  switch (status) {
    case 'nuevo':
      return 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-500/10';
    case 'preseleccionado':
      return 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-500/20 font-semibold';
    case 'visita_reservada':
      return 'bg-indigo-50 text-indigo-800 border-indigo-300 ring-1 ring-indigo-500/20 font-semibold';
    case 'seleccionado':
      return 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-500/20 font-bold';
    case 'pendiente_doc':
    case 'doc_solicitada':
      return 'bg-sky-50 text-sky-800 border-sky-300 ring-1 ring-sky-500/20 font-medium';
    case 'doc_recibida':
      return 'bg-teal-50 text-teal-800 border-teal-300 ring-1 ring-teal-500/20 font-medium';
    case 'pendiente_analisis':
    case 'en_analisis':
      return 'bg-purple-50 text-purple-700 border-purple-200 ring-1 ring-purple-500/10 font-medium';
    case 'analizado':
      return 'bg-cyan-50 text-cyan-800 border-cyan-200 ring-1 ring-cyan-500/10 font-medium';
    case 'seguro_solicitado':
      return 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-blue-500/20 font-medium';
    case 'aprobado_seguro':
      return 'bg-emerald-100 text-emerald-900 border-emerald-400 ring-1 ring-emerald-600/20 font-bold';
    case 'rechazado_seguro':
      return 'bg-rose-100 text-rose-900 border-rose-400 ring-1 ring-rose-600/20 font-bold';
    case 'decision_pendiente':
      return 'bg-amber-100 text-amber-900 border-amber-400 ring-1 ring-amber-600/20 font-bold';
    case 'aceptado_final':
      return 'bg-emerald-600 text-white border-emerald-700 shadow-xs font-black';
    case 'rechazado_final':
    case 'no_seleccionado':
      return 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-500/10';
    case 'formalizado':
      return 'bg-violet-100 text-violet-900 border-violet-300 ring-1 ring-violet-500/20 font-bold';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

export const getEmploymentTypeLabel = (type: EmploymentType): string => {
  switch (type) {
    case 'cuenta_ajena':
      return 'Por cuenta ajena';
    case 'autonomo':
      return 'Autónomo';
    case 'funcionario':
      return 'Funcionario / Empleo Público';
    case 'pensionista':
      return 'Pensionista / Jubilado';
    case 'estudiante_otro':
      return 'Estudiante / Otro';
    default:
      return type;
  }
};

export const getContractTypeLabel = (type: ContractType): string => {
  switch (type) {
    case 'indefinido':
      return 'Indefinido';
    case 'temporal':
      return 'Temporal';
    case 'practicas':
      return 'En prácticas';
    case 'fijo_discontinuo':
      return 'Fijo discontinuo';
    case 'no_aplica':
      return 'No aplica';
    default:
      return type;
  }
};
