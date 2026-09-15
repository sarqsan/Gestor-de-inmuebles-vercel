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

export const getCandidateStatusLabel = (status: CandidateStatus): string => {
  switch (status) {
    case 'nuevo':
      return 'Nuevo';
    case 'pendiente_doc':
      return 'Pendiente documentación';
    case 'pendiente_analisis':
      return 'Pendiente análisis';
    case 'analizado':
      return 'Analizado';
    case 'preseleccionado':
      return 'Preseleccionado ⭐';
    case 'visita_reservada':
      return 'Visita reservada 📅';
    case 'seleccionado':
      return 'Seleccionado';
    case 'no_seleccionado':
      return 'No seleccionado';
    default:
      return status;
  }
};

export const getCandidateStatusBadgeStyle = (status: CandidateStatus): string => {
  switch (status) {
    case 'nuevo':
      return 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-500/10';
    case 'pendiente_doc':
      return 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-500/10';
    case 'pendiente_analisis':
      return 'bg-purple-50 text-purple-700 border-purple-200 ring-1 ring-purple-500/10';
    case 'analizado':
      return 'bg-teal-50 text-teal-700 border-teal-200 ring-1 ring-teal-500/10';
    case 'preseleccionado':
      return 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-500/20 font-semibold';
    case 'visita_reservada':
      return 'bg-indigo-50 text-indigo-800 border-indigo-300 ring-1 ring-indigo-500/20 font-semibold';
    case 'seleccionado':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200 ring-1 ring-emerald-500/10 font-semibold';
    case 'no_seleccionado':
      return 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-500/10';
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
