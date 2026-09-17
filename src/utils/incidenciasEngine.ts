import {
  Incidencia,
  CategoriaIncidencia,
  PrioridadIncidencia,
  EstadoIncidencia,
  ResponsabilidadIncidencia,
  EstadoSeguroIncidencia,
  ViaActuacionIncidencia,
  HistorialIncidenciaItem,
  UsuarioApp,
} from '../types';

export const CATEGORIAS_INCIDENCIA_LABELS: Record<CategoriaIncidencia, { label: string; iconName: string; color: string }> = {
  AGUA: { label: 'Agua / Fuga', iconName: 'Droplets', color: 'blue' },
  ELECTRICIDAD: { label: 'Electricidad', iconName: 'Zap', color: 'amber' },
  FONTANERIA: { label: 'Fontanería', iconName: 'Wrench', color: 'cyan' },
  CLIMATIZACION: { label: 'Climatización / Caldera', iconName: 'Flame', color: 'orange' },
  ELECTRODOMESTICO: { label: 'Electrodoméstico', iconName: 'Tv', color: 'purple' },
  CERRAJERIA: { label: 'Cerrajería / Llaves', iconName: 'Key', color: 'slate' },
  HUMEDADES: { label: 'Humedades / Filtraciones', iconName: 'CloudRain', color: 'indigo' },
  ESTRUCTURAL: { label: 'Estructural / Grietas', iconName: 'Building', color: 'red' },
  COMUNIDAD: { label: 'Comunidad / Bajantes', iconName: 'Users', color: 'teal' },
  PLAGAS: { label: 'Plagas / Salubridad', iconName: 'Bug', color: 'rose' },
  OTRO: { label: 'Otro Desperfecto', iconName: 'AlertCircle', color: 'gray' },
};

export const PRIORIDADES_INCIDENCIA_LABELS: Record<PrioridadIncidencia, { label: string; badgeClass: string }> = {
  URGENTE: { label: 'Urgente (Inmediata)', badgeClass: 'bg-red-100 text-red-700 border-red-200' },
  ALTA: { label: 'Alta (< 24-48h)', badgeClass: 'bg-orange-100 text-orange-700 border-orange-200' },
  NORMAL: { label: 'Normal (Estándar)', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  BAJA: { label: 'Baja (Programable)', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const ESTADOS_INCIDENCIA_LABELS: Record<EstadoIncidencia, { label: string; badgeClass: string; stepOrder: number }> = {
  ABIERTA: { label: 'Abierta', badgeClass: 'bg-sky-100 text-sky-800 border-sky-300', stepOrder: 1 },
  EN_ANALISIS: { label: 'En Análisis IA', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300', stepOrder: 2 },
  PENDIENTE_INFORMACION: { label: 'Pendiente Información', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300', stepOrder: 3 },
  PENDIENTE_SEGURO: { label: 'Pendiente Seguro / Siniestro', badgeClass: 'bg-purple-100 text-purple-800 border-purple-300', stepOrder: 4 },
  PENDIENTE_PROFESIONAL: { label: 'Pendiente Profesional', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300', stepOrder: 5 },
  EN_REPARACION: { label: 'En Reparación', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300', stepOrder: 6 },
  PENDIENTE_RESOLUCION: { label: 'Pendiente Resolución', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300', stepOrder: 7 },
  RESUELTA: { label: 'Resuelta', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', stepOrder: 8 },
  CERRADA: { label: 'Cerrada / Archivada', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', stepOrder: 9 },
  CANCELADA: { label: 'Cancelada', badgeClass: 'bg-rose-100 text-rose-700 border-rose-300', stepOrder: 10 },
};

export const RESPONSABILIDADES_LABELS: Record<ResponsabilidadIncidencia, { label: string; badgeClass: string; explicacion: string }> = {
  PENDIENTE_DE_DETERMINAR: {
    label: 'Pendiente de Determinar',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    explicacion: 'No se ha determinado aún quién debe asumir la actuación o los costes de la incidencia.',
  },
  PROPIETARIO: {
    label: 'Propietario / Arrendador (Art. 21.1 LAU)',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    explicacion: 'Conservación de la habitabilidad de la vivienda, instalaciones fijas o deterioro por antigüedad.',
  },
  INQUILINO: {
    label: 'Inquilino / Arrendatario (Art. 21.4 LAU)',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    explicacion: 'Pequeñas reparaciones por desgaste de uso ordinario o desperfecto por negligencia/mal uso.',
  },
  GARANTIA: {
    label: 'Garantía (Fabricante / Instalador / Obra previa)',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    explicacion: 'Avería cubierta por garantía vigente de electrodoméstico, instalación o trabajo profesional previo.',
  },
  SEGURO: {
    label: 'Seguro (Póliza Hogar / Arrendador / Comunidad)',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    explicacion: 'Siniestro indemnizable o con asistencia directa de la compañía aseguradora vinculada.',
  },
  PROFESIONAL: {
    label: 'Profesional (Garantía de Obra / Defecto de Ejecución)',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    explicacion: 'Actuación a cargo del técnico o empresa reparadora por garantía de intervención anterior.',
  },
  COMUNIDAD: {
    label: 'Comunidad de Propietarios',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    explicacion: 'Afectación originada en elementos comunes del edificio (bajante comunitaria, fachada, etc.).',
  },
  TERCERO: {
    label: 'Tercero / Vecino Colindante',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    explicacion: 'Daño originado por una vivienda superior, contigua o un tercero ajeno a la finca.',
  },
  // Compatibilidad con valores periciales previos
  POSIBLE_PROPIETARIO: {
    label: 'Propietario / Arrendador (Estimada)',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    explicacion: 'Conservación de la vivienda para servir al uso convenido (desgaste natural o instalaciones fijas).',
  },
  POSIBLE_INQUILINO: {
    label: 'Inquilino / Arrendatario (Estimada)',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    explicacion: 'Pequeñas reparaciones por desgaste de uso ordinario o daño imputable a negligencia/mal uso.',
  },
  POSIBLE_COMUNIDAD: {
    label: 'Comunidad de Propietarios (Estimada)',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    explicacion: 'Afectación originada en elementos comunes del edificio (bajante comunitaria, cubierta, fachada).',
  },
  POSIBLE_TERCERO: {
    label: 'Tercero / Vecino Colindante (Estimada)',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    explicacion: 'Daño originado por una vivienda superior o contigua (ej. fuga en baño del piso de arriba).',
  },
  INDETERMINADA: {
    label: 'Pendiente de Determinar',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    explicacion: 'No existen elementos suficientes para asignar responsabilidad clara en este momento.',
  },
  PENDIENTE_COMPROBACION: {
    label: 'Pendiente de Determinar',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    explicacion: 'Se precisa visita técnica o comprobación para determinar quién asume la actuación.',
  },
};

export const ESTADO_SEGURO_LABELS: Record<EstadoSeguroIncidencia, { label: string; badgeClass: string }> = {
  POSIBLEMENTE_CUBIERTA: { label: 'Posiblemente Cubierta por Póliza', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  NO_CUBIERTA_SEGUN_DATOS: { label: 'No Cubierta según Póliza', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
  COBERTURA_DUDOSA: { label: 'Cobertura Dudosa / A Consultar', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  SIN_SEGURO_APLICABLE: { label: 'Sin Seguro Aplicable Registrado', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  PENDIENTE_COMPROBACION: { label: 'Pendiente de Cotejo con Aseguradora', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
};

export const RESPONSABILIDAD_LABELS = RESPONSABILIDADES_LABELS;
export const SEGURO_ESTADO_LABELS = ESTADO_SEGURO_LABELS;

export const VIA_ACTUACION_LABELS: Record<ViaActuacionIncidencia, { label: string; descripcion: string }> = {
  REPARACION_DIRECTA: { label: 'Reparación Directa', descripcion: 'El inquilino o propietario resuelve directamente el desperfecto menor.' },
  SOLICITAR_INFORMACION: { label: 'Solicitar más Información / Fotos', descripcion: 'Falta documentación o fotos para evaluar la avería.' },
  PROFESIONAL: { label: 'Asignar Profesional de Mantenimiento', descripcion: 'Enviar técnico electricista, fontanero o cerrajero para valoración.' },
  SEGURO: { label: 'Dar Parte al Seguro / Siniestro', descripcion: 'Tramitar con la aseguradora de hogar, arrendador o comunidad.' },
  COMUNIDAD: { label: 'Reclamar al Administrador de Fincas', descripcion: 'Notificar a la comunidad de propietarios por afección en elementos comunes.' },
  TERCERO: { label: 'Reclamar a Tercero / Vecino', descripcion: 'Contactar con el propietario colindante causante de la filtración.' },
};

/**
 * Crea una entrada estructurada de auditoría para el historial inmutable de la incidencia.
 */
export function crearHistorialItem(
  usuario: string,
  accion: string,
  valorAnterior?: string,
  valorNuevo?: string,
  observacion?: string
): HistorialIncidenciaItem {
  return {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fecha: new Date().toISOString(),
    usuario: usuario || 'Sistema',
    accion,
    valorAnterior,
    valorNuevo,
    observacion,
  };
}

/**
 * Control de acceso RBAC granular para incidencias
 */
export function canAccessIncidencia(incidencia: Incidencia, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true; // En modo local de pruebas

  const perfil = currentUser.tipoPerfil || 'ADMINISTRADOR';
  if (perfil === 'ADMINISTRADOR') return true;

  if (perfil === 'PROPIETARIO') {
    if (currentUser.propietarioId && incidencia.propietarioId === currentUser.propietarioId) {
      return true;
    }
    if (currentUser.inmuebleIds && currentUser.inmuebleIds.includes(incidencia.inmuebleId)) {
      return true;
    }
    return false;
  }

  if (perfil === 'PROFESIONAL') {
    if (currentUser.profesionalId && incidencia.profesionalId === currentUser.profesionalId) {
      return true;
    }
    if (currentUser.inmuebleIds && currentUser.inmuebleIds.includes(incidencia.inmuebleId)) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Verifica si el usuario actual está formalmente autorizado para clasificar
 * y registrar la responsabilidad legal y económica de la incidencia.
 */
export function canManageResponsabilidad(incidencia: Incidencia, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true; // Modo local / demo

  const perfil = currentUser.tipoPerfil || 'ADMINISTRADOR';
  if (perfil === 'ADMINISTRADOR') return true;

  if (perfil === 'PROPIETARIO') {
    if (currentUser.propietarioId && incidencia.propietarioId === currentUser.propietarioId) {
      return true;
    }
    if (currentUser.inmuebleIds && currentUser.inmuebleIds.includes(incidencia.inmuebleId)) {
      return true;
    }
    return false;
  }

  // Profesionales e inquilinos pueden consultar la decisión pero no modificar la clasificación
  return false;
}

export interface MetricasIncidencias {
  total: number;
  abiertas: number;
  urgentes: number;
  enProceso: number;
  enReparacion: number;
  pendientesSeguro: number;
  siniestrosAbiertos: number;
  resueltas: number;
  cerradas: number;
}

export function calcularMetricasIncidencias(
  incidencias: Incidencia[],
  siniestros?: { estado: string }[]
): MetricasIncidencias {
  let abiertas = 0;
  let urgentes = 0;
  let enProceso = 0;
  let enReparacion = 0;
  let pendientesSeguro = 0;
  let resueltas = 0;
  let cerradas = 0;

  for (const inc of incidencias) {
    if (inc.estado === 'ABIERTA' || inc.estado === 'EN_ANALISIS' || inc.estado === 'PENDIENTE_INFORMACION') {
      abiertas++;
    }
    if (
      (inc.prioridad === 'URGENTE' || inc.prioridad === 'ALTA') &&
      inc.estado !== 'RESUELTA' &&
      inc.estado !== 'CERRADA' &&
      inc.estado !== 'CANCELADA'
    ) {
      urgentes++;
    }
    if (inc.estado === 'EN_REPARACION' || inc.estado === 'PENDIENTE_PROFESIONAL') {
      enProceso++;
      if (inc.estado === 'EN_REPARACION') enReparacion++;
    }
    if (inc.estado === 'PENDIENTE_SEGURO' || inc.siniestroId) {
      pendientesSeguro++;
    }
    if (inc.estado === 'RESUELTA') {
      resueltas++;
    }
    if (inc.estado === 'CERRADA') {
      cerradas++;
    }
  }

  const siniestrosAbiertos = siniestros
    ? siniestros.filter((s) => s.estado !== 'CERRADO' && s.estado !== 'INDEMNIZADO').length
    : pendientesSeguro;

  return {
    total: incidencias.length,
    abiertas,
    urgentes,
    enProceso,
    enReparacion,
    pendientesSeguro,
    siniestrosAbiertos,
    resueltas,
    cerradas,
  };
}

export function filtrarIncidencias(
  incidencias: Incidencia[],
  searchTerm: string,
  filtroInmueble: string,
  filtroCategoria: string,
  filtroPrioridad: string,
  filtroEstado: string
): Incidencia[] {
  const normSearch = searchTerm.trim().toLowerCase();

  return incidencias.filter((inc) => {
    if (filtroInmueble !== 'TODOS' && inc.inmuebleId !== filtroInmueble) {
      return false;
    }
    if (filtroCategoria !== 'TODAS' && inc.categoria !== filtroCategoria) {
      return false;
    }
    if (filtroPrioridad !== 'TODAS' && inc.prioridad !== filtroPrioridad) {
      return false;
    }
    if (filtroEstado !== 'TODOS' && inc.estado !== filtroEstado) {
      return false;
    }

    if (normSearch) {
      const matchTitulo = inc.titulo.toLowerCase().includes(normSearch);
      const matchDesc = inc.descripcion.toLowerCase().includes(normSearch);
      const matchInm = inc.inmuebleDireccion?.toLowerCase().includes(normSearch);
      const matchInq = inc.inquilinoNombre?.toLowerCase().includes(normSearch);
      const matchProf = inc.trabajoProfesional?.profesionalNombre?.toLowerCase().includes(normSearch);
      if (!matchTitulo && !matchDesc && !matchInm && !matchInq && !matchProf) {
        return false;
      }
    }

    return true;
  });
}
