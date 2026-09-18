// ============================================================
// BLOQUE 4 — Motor de INCIDENCIAS Y MANTENIMIENTO
// Metadatos de estados/categorías/prioridades, máquina de
// estados, factorías y helpers de eventos y órdenes de trabajo.
// ============================================================

import type {
  CategoriaIncidencia,
  EstadoIncidencia,
  EventoIncidencia,
  Incidencia,
  OrigenIncidencia,
  PeriodicidadMantenimiento,
  PresupuestoProfesional,
  PrioridadIncidencia,
  Profesional,
  TareaMantenimiento,
  ResponsabilidadIncidencia,
  EstadoSeguroIncidencia,
  ViaActuacionIncidencia,
  HistorialIncidenciaItem,
  UsuarioApp,
} from '../types';

export const CATEGORIAS_INCIDENCIA_LABELS: Record<
  CategoriaIncidencia,
  { label: string; iconName: string; color: string }
> = {
  FONTANERIA: { label: 'Fontanería / Fugas', iconName: 'Wrench', color: 'cyan' },
  ELECTRICIDAD: { label: 'Electricidad / Cuadro', iconName: 'Zap', color: 'amber' },
  CALEFACCION_ACS: { label: 'Calefacción / Caldera / ACS', iconName: 'Flame', color: 'orange' },
  CERRAJERIA: { label: 'Cerrajería / Puertas / Cerraduras', iconName: 'Key', color: 'slate' },
  ELECTRODOMESTICOS: { label: 'Electrodomésticos', iconName: 'Tv', color: 'purple' },
  HUMEDADES: { label: 'Humedades / Goteras / Filtraciones', iconName: 'CloudRain', color: 'indigo' },
  CARPINTERIA: { label: 'Carpintería / Persianas', iconName: 'Scissors', color: 'amber' },
  PINTURA: { label: 'Pintura / Acabados', iconName: 'Paintbrush', color: 'emerald' },
  CRISTALERIA: { label: 'Cristalería / Ventanas', iconName: 'Layers', color: 'blue' },
  PLAGAS_SANEAMIENTO: { label: 'Plagas / Saneamiento / Salubridad', iconName: 'Bug', color: 'rose' },
  LIMPIEZA: { label: 'Limpieza / Puesta a punto', iconName: 'Sparkles', color: 'teal' },
  OTROS: { label: 'Otros desperfectos', iconName: 'AlertCircle', color: 'gray' },
};

export const CATEGORIA_INCIDENCIA_LABEL: Record<CategoriaIncidencia, string> = {
  FONTANERIA: 'Fontanería',
  ELECTRICIDAD: 'Electricidad',
  CALEFACCION_ACS: 'Calefacción / ACS',
  CERRAJERIA: 'Cerrajería',
  ELECTRODOMESTICOS: 'Electrodomésticos',
  HUMEDADES: 'Humedades / goteras',
  CARPINTERIA: 'Carpintería / persianas',
  PINTURA: 'Pintura / acabados',
  CRISTALERIA: 'Cristalería',
  PLAGAS_SANEAMIENTO: 'Plagas / saneamiento',
  LIMPIEZA: 'Limpieza',
  OTROS: 'Otros',
};

// Especialidades aproximadas del catálogo de profesionales
export const CATEGORIA_ESPECIALIDAD: Record<CategoriaIncidencia, string[]> = {
  FONTANERIA: ['fontan', 'fontanería', 'fontaneria', 'calefacción', 'calefaccion', 'climatización'],
  ELECTRICIDAD: ['electric'],
  CALEFACCION_ACS: ['calefacción', 'calefaccion', 'caldera', 'climatización', 'climatizacion', 'gas', 'fontan'],
  CERRAJERIA: ['cerraj'],
  ELECTRODOMESTICOS: ['electrodomést', 'electrodomest', 'reparación de aparatos'],
  HUMEDADES: ['humedad', 'impermeab', 'cubierta', 'tejado', 'albañil', 'reformas', 'fontan'],
  CARPINTERIA: ['carpinter', 'persiana', 'cerrajer'],
  PINTURA: ['pintor', 'pintura', 'reformas', 'albañil'],
  CRISTALERIA: ['cristal', 'vidrier'],
  PLAGAS_SANEAMIENTO: ['plaga', 'desratiz', 'desinsect', 'saneamiento', 'limpieza industrial'],
  LIMPIEZA: ['limpiez'],
  OTROS: ['mantenimiento', 'reformas'],
};

export const PRIORIDADES_INCIDENCIA_LABELS: Record<
  PrioridadIncidencia,
  { label: string; badgeClass: string }
> = {
  URGENTE: { label: 'Urgente (Inmediata)', badgeClass: 'bg-red-100 text-red-700 border-red-200 font-bold' },
  ALTA: { label: 'Alta (< 24-48h)', badgeClass: 'bg-orange-100 text-orange-700 border-orange-200' },
  NORMAL: { label: 'Normal (Estándar)', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  MEDIA: { label: 'Media (Estándar)', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  BAJA: { label: 'Baja (Programable)', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const PRIORIDAD_INCIDENCIA_META: Record<
  PrioridadIncidencia,
  { label: string; color: string; badgeClass: string; horasMaximoAtencion: number }
> = {
  URGENTE: { label: 'Urgente', color: 'rose', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', horasMaximoAtencion: 4 },
  ALTA: { label: 'Alta', color: 'amber', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', horasMaximoAtencion: 24 },
  NORMAL: { label: 'Normal', color: 'blue', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', horasMaximoAtencion: 72 },
  MEDIA: { label: 'Media', color: 'blue', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', horasMaximoAtencion: 72 },
  BAJA: { label: 'Baja', color: 'slate', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', horasMaximoAtencion: 168 },
};

export const ESTADOS_INCIDENCIA_LABELS: Record<
  EstadoIncidencia,
  { label: string; badgeClass: string; stepOrder: number }
> = {
  ABIERTA: { label: 'Abierta', badgeClass: 'bg-sky-100 text-sky-800 border-sky-300', stepOrder: 1 },
  REPORTADA: { label: 'Reportada', badgeClass: 'bg-sky-100 text-sky-800 border-sky-300', stepOrder: 1 },
  EN_VALORACION: { label: 'En Valoración', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300', stepOrder: 2 },
  PRESUPUESTOS: { label: 'En Presupuestos', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300', stepOrder: 3 },
  ASIGNADA: { label: 'Asignada a Profesional', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300', stepOrder: 4 },
  EN_REPARACION: { label: 'En Reparación', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300', stepOrder: 5 },
  RESUELTA: { label: 'Resuelta', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', stepOrder: 6 },
  CERRADA: { label: 'Cerrada / Archivada', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', stepOrder: 7 },
  CANCELADA: { label: 'Cancelada', badgeClass: 'bg-rose-100 text-rose-700 border-rose-300', stepOrder: 0 },
  RECHAZADA: { label: 'Rechazada', badgeClass: 'bg-rose-100 text-rose-700 border-rose-300', stepOrder: 0 },
};

export const ESTADO_INCIDENCIA_META: Record<
  EstadoIncidencia,
  { label: string; descripcion: string; badgeClass: string }
> = {
  ABIERTA: { label: 'Abierta', descripcion: 'Registrada recientemente', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200' },
  REPORTADA: { label: 'Reportada', descripcion: 'Reportada y pendiente de triaje inicial', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200' },
  EN_VALORACION: { label: 'En valoración', descripcion: 'Revisión técnica o análisis pericial', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  PRESUPUESTOS: { label: 'Presupuestos', descripcion: 'Solicitando y comparando ofertas de profesionales', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
  ASIGNADA: { label: 'Asignada', descripcion: 'Orden de trabajo emitida al profesional', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  EN_REPARACION: { label: 'En reparación', descripcion: 'Profesional trabajando en el inmueble', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  RESUELTA: { label: 'Resuelta', descripcion: 'Trabajo finalizado, pendiente de confirmación', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  CERRADA: { label: 'Cerrada', descripcion: 'Confirmada, liquidada y archivada', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  CANCELADA: { label: 'Cancelada', descripcion: 'Cancelada sin intervención', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
  RECHAZADA: { label: 'Rechazada', descripcion: 'No procede su reparación a cargo del arrendador', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
};

export const RESPONSABILIDADES_LABELS: Record<
  ResponsabilidadIncidencia,
  { label: string; badgeClass: string; explicacion: string }
> = {
  PENDIENTE_DETERMINAR: {
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
  INDETERMINADA: {
    label: 'Pendiente de Determinar',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    explicacion: 'No existen elementos suficientes para asignar responsabilidad clara en este momento.',
  },
};

export const ESTADO_SEGURO_LABELS: Record<
  EstadoSeguroIncidencia,
  { label: string; badgeClass: string }
> = {
  PENDIENTE_VERIFICACION: { label: 'Pendiente Cotejo Póliza', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  POSIBLE_COBERTURA: { label: 'Posible Cobertura', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  SINIESTRO_APERTURADO: { label: 'Siniestro Aperturado', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  RECHAZADO_ASEGURADORA: { label: 'Rechazado por Aseguradora', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
  INDEMNIZADO: { label: 'Indemnizado / Liquidado', badgeClass: 'bg-teal-100 text-teal-800 border-teal-200' },
  NO_APLICA: { label: 'No Aplica Seguro', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const RESPONSABILIDAD_LABELS = RESPONSABILIDADES_LABELS;
export const SEGURO_ESTADO_LABELS = ESTADO_SEGURO_LABELS;

export const VIA_ACTUACION_LABELS: Record<
  ViaActuacionIncidencia,
  { label: string; descripcion: string }
> = {
  PROFESIONAL_DIRECTO: { label: 'Profesional de Mantenimiento', descripcion: 'Enviar técnico o empresa reparadora autorizada.' },
  SEGURO: { label: 'Dar Parte al Seguro / Siniestro', descripcion: 'Tramitar con la aseguradora de hogar, arrendador o comunidad.' },
  COMUNIDAD: { label: 'Reclamar a Comunidad de Propietarios', descripcion: 'Notificar al administrador de fincas por afección en bajantes/elementos comunes.' },
  INQUILINO_GESTIONA: { label: 'Gestión por Inquilino', descripcion: 'El inquilino resuelve la pequeña reparación a su cargo según Art. 21.4 LAU.' },
  GARANTIA_CONSTRUCTOR: { label: 'Garantía de Obra / Constructor', descripcion: 'Reclamar bajo garantía de electrodoméstico o constructora.' },
};

export const ORIGEN_INCIDENCIA_LABEL: Record<OrigenIncidencia, string> = {
  INQUILINO: 'Inquilino',
  PROPIETARIO: 'Propietario / Gestor',
  INSPECCION: 'Inspección técnica',
  MANTENIMIENTO_PREVENTIVO: 'Mantenimiento preventivo',
  REFORMA_ROI: 'Mejora / ROI',
  OTRO: 'Otro origen',
};

/**
 * Crea una entrada estructurada de auditoría para el historial de la incidencia.
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
 * Control de acceso RBAC granular para incidencias.
 */
export function canAccessIncidencia(incidencia: Incidencia, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true;

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
 * Permisos para determinar responsabilidad legal.
 */
export function canManageResponsabilidad(incidencia: Incidencia, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true;

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
    if (inc.estado === 'ABIERTA' || inc.estado === 'REPORTADA' || inc.estado === 'EN_VALORACION') {
      abiertas++;
    }
    if (
      (inc.prioridad === 'URGENTE' || inc.prioridad === 'ALTA') &&
      inc.estado !== 'RESUELTA' &&
      inc.estado !== 'CERRADA' &&
      inc.estado !== 'CANCELADA' &&
      inc.estado !== 'RECHAZADA'
    ) {
      urgentes++;
    }
    if (inc.estado === 'EN_REPARACION' || inc.estado === 'ASIGNADA' || inc.estado === 'PRESUPUESTOS') {
      enProceso++;
      if (inc.estado === 'EN_REPARACION') enReparacion++;
    }
    if (inc.seguroEstado === 'POSIBLE_COBERTURA' || inc.seguroEstado === 'SINIESTRO_APERTURADO' || inc.siniestroId) {
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

export function nuevaIncidenciaId(): string {
  return `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export function nuevoNumeroIncidencia(existentes: Incidencia[], fecha = new Date()): string {
  const anio = fecha.getFullYear();
  const prefijo = `INC-${anio}-`;
  const delAnio = existentes
    .map((i) => i.numero || '')
    .filter((num) => num.startsWith(prefijo));
  const maxSeq = delAnio.reduce((max, num) => {
    const seq = parseInt(num.replace(prefijo, ''), 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  return `${prefijo}${String(maxSeq + 1).padStart(4, '0')}`;
}

export function nuevoNumeroOT(existentes: Incidencia[], fecha = new Date()): string {
  const anio = fecha.getFullYear();
  const prefijo = `OT-${anio}-`;
  const delAnio = existentes
    .map((i) => i.ordenTrabajo?.numero || '')
    .filter((num) => num.startsWith(prefijo));
  const maxSeq = delAnio.reduce((max, num) => {
    const seq = parseInt(num.replace(prefijo, ''), 10);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  return `${prefijo}${String(maxSeq + 1).padStart(4, '0')}`;
}

export function nuevoEvento(
  tipo: EventoIncidencia['tipo'],
  descripcion: string,
  autor?: string
): EventoIncidencia {
  return {
    id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fecha: new Date().toISOString(),
    tipo,
    autor,
    descripcion,
  };
}

export function nuevoPresupuestoId(): string {
  return `ppt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function profesionalesCompatibles(
  profesionales: Profesional[],
  categoria: CategoriaIncidencia,
  cp?: string,
  localidad?: string
): { profesional: Profesional; enZona: boolean }[] {
  const claves = CATEGORIA_ESPECIALIDAD[categoria] ?? [];
  const texto = (p: Profesional) =>
    [...(p.especialidades || []), p.nombreComercial, ...(p.zonasServicio?.map((z) => `${z.localidad || ''} ${z.municipio || ''} ${(z.codigosPostales || []).join(' ')}`) || [])]
      .join(' ')
      .toLowerCase();
  const enLaZona = (p: Profesional): boolean => {
    const zonas = p.zonasServicio || [];
    if (zonas.length === 0) return true;
    if (cp && zonas.some((z) => (z.codigosPostales || []).includes(cp))) return true;
    if (localidad && zonas.some((z) => (z.localidad || z.municipio || '').toLowerCase().includes(localidad.toLowerCase()))) return true;
    return false;
  };

  return profesionales
    .filter((p) => p.activo !== false && claves.some((k) => texto(p).includes(k)))
    .map((p) => ({ profesional: p, enZona: enLaZona(p) }))
    .sort((a, b) => (b.enZona ? 1 : 0) - (a.enZona ? 1 : 0));
}

export const PERIODICIDAD_MESES: Record<PeriodicidadMantenimiento, number> = {
  PUNTUAL: 0,
  UNICA: 0,
  MENSUAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
  BIENAL: 24,
  QUINQUENAL: 60,
  PERSONALIZADA: 0,
};

export const PERIODICIDAD_LABEL: Record<PeriodicidadMantenimiento, string> = {
  PUNTUAL: 'Puntual',
  UNICA: 'Única vez',
  MENSUAL: 'Mensual',
  BIMESTRAL: 'Cada 2 meses',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
  BIENAL: 'Cada 2 años',
  QUINQUENAL: 'Cada 5 años',
  PERSONALIZADA: 'Personalizada',
};

export function sumarMeses(fechaISO: string, meses: number): string {
  const d = new Date(fechaISO);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export function calcularProximaFecha(
  periodicidad: PeriodicidadMantenimiento,
  desde: Date = new Date()
): string {
  const meses = PERIODICIDAD_MESES[periodicidad] ?? 12;
  const d = new Date(desde);
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

export function tareaVencida(t: TareaMantenimiento, hoy: Date = new Date()): boolean {
  if (!t.activa) return false;
  const target = new Date(t.proximaFecha);
  return target.getTime() <= hoy.getTime();
}

export const PLANTILLAS_MANTENIMIENTO: {
  titulo: string;
  descripcion: string;
  categoria: CategoriaIncidencia;
  periodicidad: PeriodicidadMantenimiento;
}[] = [
  {
    titulo: 'Revisión anual obligatoria de caldera / termo de gas',
    descripcion: 'Inspección de combustión, tiro y estanqueidad según RITE.',
    categoria: 'CALEFACCION_ACS',
    periodicidad: 'ANUAL',
  },
  {
    titulo: 'Limpieza de filtros y desinfección de aire acondicionado',
    descripcion: 'Puesta a punto antes de la temporada de verano/invierno.',
    categoria: 'CALEFACCION_ACS',
    periodicidad: 'SEMESTRAL',
  },
  {
    titulo: 'Comprobación de cuadro eléctrico y diferenciales',
    descripcion: 'Test de salto de diferenciales y apriete de bornes.',
    categoria: 'ELECTRICIDAD',
    periodicidad: 'ANUAL',
  },
  {
    titulo: 'Revisión de estanqueidad de sellados en baños y cocina',
    descripcion: 'Comprobación de siliconas en bañera/plato de ducha y fregadero.',
    categoria: 'HUMEDADES',
    periodicidad: 'ANUAL',
  },
  {
    titulo: 'Inspección de griferías, cisternas y llaves de paso',
    descripcion: 'Detección temprana de goteos y comprobación de corte general.',
    categoria: 'FONTANERIA',
    periodicidad: 'ANUAL',
  },
];
