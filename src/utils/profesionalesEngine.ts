import {
  Profesional,
  TrabajoProfesional,
  PresupuestoProfesional,
  PartidaPresupuesto,
  ValoracionProfesionalTrabajo,
  Inmueble,
  Incidencia,
  CategoriaIncidencia,
  EspecialidadCodigo,
  EstadoTrabajoProfesional,
  EstadoPresupuestoProfesional,
  CategoriaMotivoAjuste,
  AccionHistorialPresupuesto,
  HistorialDecisionPresupuesto,
  TipoProfesional,
  EstadoProfesional,
  PrioridadIncidencia,
  HistorialTrabajoItem,
  NivelCompatibilidad,
  EstadoZonaCompatibilidad,
  ResultadoCompatibilidadProfesional,
} from '../types';

export interface EspecialidadCatalogoItem {
  codigo: EspecialidadCodigo;
  nombre: string;
  descripcion: string;
  icono: string;
}

export const ESPECIALIDADES_CATALOGO: EspecialidadCatalogoItem[] = [
  { codigo: 'FONTANERIA', nombre: 'Fontanería', descripcion: 'Reparación de fugas, tuberías, grifería, desatascos y sanitarios', icono: 'Droplet' },
  { codigo: 'ELECTRICIDAD', nombre: 'Electricidad', descripcion: 'Instalaciones eléctricas, cuadros, enchufes, iluminación y boletines', icono: 'Zap' },
  { codigo: 'CLIMATIZACION', nombre: 'Climatización', descripcion: 'Aire acondicionado, bombas de calor, splits y recarga de gas', icono: 'Wind' },
  { codigo: 'CERRAJERIA', nombre: 'Cerrajería', descripcion: 'Aperturas urgentes 24h, cerraduras de seguridad y bombines', icono: 'Key' },
  { codigo: 'ALBANILERIA', nombre: 'Albañilería', descripcion: 'Tabiquería, alicatados, solados, yeso, enfoscados y reformas', icono: 'Hammer' },
  { codigo: 'PINTURA', nombre: 'Pintura', descripcion: 'Pintura plástica interior, alisado de paredes, gotelé y fachadas', icono: 'Paintbrush' },
  { codigo: 'CARPINTERIA', nombre: 'Carpintería', descripcion: 'Puertas, armarios, parqué, carpintería metálica y aluminio', icono: 'Scissors' },
  { codigo: 'CRISTALERIA', nombre: 'Cristalería', descripcion: 'Vidrios climalit, espejos, ventanas y mamparas de baño', icono: 'Layers' },
  { codigo: 'ELECTRODOMESTICOS', nombre: 'Electrodomésticos', descripcion: 'Reparación de lavadoras, frigoríficos, hornos y lavavajillas', icono: 'Tv' },
  { codigo: 'CALEFACCION', nombre: 'Calefacción', descripcion: 'Calderas de gas/gasoil, radiadores, termostatos y revisiones', icono: 'Flame' },
  { codigo: 'TELECOMUNICACIONES', nombre: 'Telecomunicaciones', descripcion: 'Antenas TDT, porteros automáticos, videoporteros y cableado de red', icono: 'Radio' },
  { codigo: 'PLAGAS', nombre: 'Control de Plagas', descripcion: 'Desinsectación, desratización y control higiénico-sanitario', icono: 'ShieldAlert' },
  { codigo: 'LIMPIEZA', nombre: 'Limpieza', descripcion: 'Limpiezas profundas de fin de obra, entre inquilinos y siniestros', icono: 'Sparkles' },
  { codigo: 'JARDINERIA', nombre: 'Jardinería', descripcion: 'Mantenimiento de jardines, podas, riego automático y piscinas', icono: 'Flower' },
  { codigo: 'REFORMAS', nombre: 'Reformas Integrales', descripcion: 'Coordinación completa de reformas de viviendas y baños', icono: 'Home' },
  { codigo: 'TECNICO', nombre: 'Servicio Técnico', descripcion: 'Servicios técnicos especializados de mantenimiento de instalaciones', icono: 'Wrench' },
  { codigo: 'ARQUITECTURA', nombre: 'Arquitectura', descripcion: 'Proyectos, cédulas de habitabilidad, ITE y licencias de actividad', icono: 'Compass' },
  { codigo: 'APAREJADOR', nombre: 'Aparejador / Arquitectura Técnica', descripcion: 'Dirección de obra, peritajes judiciales e informes de patologías', icono: 'FileCheck' },
  { codigo: 'INGENIERIA', nombre: 'Ingeniería', descripcion: 'Certificados de eficiencia energética (CEE) e instalaciones complejas', icono: 'Cpu' },
  { codigo: 'SEGUROS', nombre: 'Peritaje de Seguros', descripcion: 'Peritaciones técnicas contradictorias y reclamación a aseguradoras', icono: 'ShieldCheck' },
  { codigo: 'OTRO', nombre: 'Otros Trabajos', descripcion: 'Otros servicios y oficios para el mantenimiento del inmueble', icono: 'MoreHorizontal' },
];

export const TIPO_PROFESIONAL_LABELS: Record<TipoProfesional, { label: string; badgeClass: string }> = {
  AUTONOMO: { label: 'Autónomo', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200' },
  EMPRESA: { label: 'Empresa / S.L.', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  PROFESIONAL_INDIVIDUAL: { label: 'Profesional Individual', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  PARTICULAR: { label: 'Particular', badgeClass: 'bg-slate-100 text-slate-800 border-slate-200' },
  OTRO: { label: 'Otro', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
};

export const ESTADO_PROFESIONAL_LABELS: Record<EstadoProfesional, { label: string; badgeClass: string }> = {
  ACTIVO: { label: 'Activo', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  INACTIVO: { label: 'Inactivo', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
  PAUSADO: { label: 'Pausado', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  PENDIENTE_VALIDACION: { label: 'Pendiente Validación', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  BLOQUEADO: { label: 'Bloqueado', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
};

export const ESTADO_TRABAJO_LABELS: Record<
  EstadoTrabajoProfesional,
  { label: string; badgeClass: string; step: number; color: string }
> = {
  PENDIENTE: { label: 'Pendiente', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', step: 1, color: 'slate' },
  BUSCANDO_PROFESIONAL: { label: 'Buscando Profesional', badgeClass: 'bg-sky-100 text-sky-800 border-sky-200', step: 2, color: 'sky' },
  PROFESIONAL_PROPUESTO: { label: 'Profesional Propuesto', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', step: 2, color: 'blue' },
  ASIGNADO: { label: 'Asignada', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', step: 2, color: 'blue' },
  ASIGNADA: { label: 'Asignada', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', step: 2, color: 'blue' },
  PRESUPUESTO_SOLICITADO: { label: 'Presupuesto Solicitado', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', step: 3, color: 'amber' },
  PRESUPUESTO_RECIBIDO: { label: 'Presupuesto Recibido', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200', step: 4, color: 'purple' },
  PENDIENTE_ACEPTACION: { label: 'Pendiente Aceptación', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200', step: 4, color: 'indigo' },
  ACEPTADO: { label: 'Aceptado', badgeClass: 'bg-teal-100 text-teal-800 border-teal-200', step: 5, color: 'teal' },
  PROGRAMADO: { label: 'Programado', badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-200', step: 6, color: 'cyan' },
  EN_EJECUCION: { label: 'En Ejecución', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 animate-pulse', step: 7, color: 'blue' },
  EN_CURSO: { label: 'En Curso', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse', step: 7, color: 'amber' },
  PENDIENTE_MATERIAL: { label: 'Pendiente Material', badgeClass: 'bg-orange-100 text-orange-800 border-orange-200', step: 7, color: 'orange' },
  PENDIENTE_PROPIETARIO: { label: 'Pendiente Propietario', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200', step: 7, color: 'yellow' },
  FINALIZADO: { label: 'Finalizada', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200', step: 8, color: 'emerald' },
  FINALIZADA: { label: 'Finalizada', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200', step: 8, color: 'emerald' },
  CANCELADO: { label: 'Cancelada', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', step: 0, color: 'rose' },
  CANCELADA: { label: 'Cancelada', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', step: 0, color: 'rose' },
};

export const ESTADO_PRESUPUESTO_LABELS: Record<
  EstadoPresupuestoProfesional,
  { label: string; badgeClass: string; descripcion: string }
> = {
  BORRADOR: {
    label: 'Borrador',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    descripcion: 'Presupuesto en elaboración o borrador preliminar',
  },
  RECIBIDO: {
    label: 'Recibido',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    descripcion: 'Presupuesto remitido por el profesional, listo para revisión',
  },
  EN_REVISION: {
    label: 'En Revisión',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    descripcion: 'Presupuesto en proceso de evaluación por el propietario o gestor',
  },
  EN_NEGOCIACION: {
    label: 'En Negociación',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
    descripcion: 'Se ha solicitado un ajuste al profesional con motivo justificado',
  },
  ACEPTADO: {
    label: 'Aceptado',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    descripcion: 'Presupuesto aprobado formalmente y trabajo adjudicado',
  },
  RECHAZADO: {
    label: 'Rechazado',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
    descripcion: 'Presupuesto desestimado formalmente con motivo indicado',
  },
  CADUCADO: {
    label: 'Caducado',
    badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    descripcion: 'Plazo de validez de la oferta expirado',
  },
};

export const CATEGORIA_AJUSTE_LABELS: Record<
  CategoriaMotivoAjuste,
  { label: string; descripcion: string }
> = {
  PRECIO: {
    label: 'Precio / Importe',
    descripcion: 'El importe total o precios unitarios son superiores al presupuesto previsto o al mercado',
  },
  ALCANCE: {
    label: 'Alcance del Trabajo',
    descripcion: 'Se requiere ampliar, reducir o redefinir las actuaciones a ejecutar',
  },
  MATERIALES: {
    label: 'Materiales / Calidades',
    descripcion: 'Se solicitan cambios en las marcas, calidades o especificaciones técnicas de los materiales',
  },
  PARTIDAS: {
    label: 'Desglose de Partidas',
    descripcion: 'Faltan partidas esenciales o se solicita mayor nivel de detalle en las unidades de obra',
  },
  CANTIDADES: {
    label: 'Cantidades / Mediciones',
    descripcion: 'Las mediciones o unidades presupuestadas no corresponden con la realidad del inmueble',
  },
  PLAZO: {
    label: 'Plazo de Ejecución',
    descripcion: 'Los tiempos de ejecución o las fechas de inicio/fin propuestas no son compatibles',
  },
  DOCUMENTACION: {
    label: 'Documentación y Garantías',
    descripcion: 'Se requiere aportar certificados, garantías extendidas, licencias o seguros específicos',
  },
  OTRO: {
    label: 'Otro Motivo',
    descripcion: 'Otras consideraciones específicas detalladas en las observaciones del ajuste',
  },
};

export const PRIORIDAD_TRABAJO_LABELS: Record<
  PrioridadIncidencia,
  { label: string; badgeClass: string }
> = {
  URGENTE: { label: 'Urgente', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200 font-bold' },
  ALTA: { label: 'Alta', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  NORMAL: { label: 'Normal', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  MEDIA: { label: 'Media', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  BAJA: { label: 'Baja', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
};

/**
 * Validador obligatorio de solicitud de ajuste.
 */
export function validarSolicitudAjuste(
  categoria?: string,
  motivo?: string
): { valido: boolean; error?: string } {
  if (!categoria || !categoria.trim()) {
    return { valido: false, error: 'Debe seleccionar una categoría para el motivo del ajuste.' };
  }
  if (!motivo || !motivo.trim()) {
    return { valido: false, error: 'Debe indicar el detalle o motivo del ajuste solicitado.' };
  }
  return { valido: true };
}

/**
 * Validador obligatorio de rechazo de presupuesto.
 */
export function validarRechazoPresupuesto(motivo?: string): { valido: boolean; error?: string } {
  if (!motivo || !motivo.trim()) {
    return { valido: false, error: 'Debe indicar el motivo del rechazo del presupuesto.' };
  }
  return { valido: true };
}

/**
 * Constructor de evento de auditoría/historial de presupuesto.
 */
export function crearItemHistorialPresupuesto(
  arg1:
    | AccionHistorialPresupuesto
    | {
        accion: AccionHistorialPresupuesto;
        usuario: string;
        estadoAnterior: EstadoPresupuestoProfesional;
        estadoNuevo: EstadoPresupuestoProfesional;
        motivo?: string;
        categoriaMotivo?: CategoriaMotivoAjuste | string;
        observaciones?: string;
        version?: number;
        importeTotal?: number;
        partidasSnapshot?: PartidaPresupuesto[];
        usuarioId?: string;
      },
  usuarioArg?: string,
  estadoAnteriorArg?: EstadoPresupuestoProfesional,
  estadoNuevoArg?: EstadoPresupuestoProfesional,
  opcionesArg?: {
    motivo?: string;
    categoriaMotivo?: CategoriaMotivoAjuste | string;
    observaciones?: string;
    version?: number;
    importeTotal?: number;
    partidasSnapshot?: PartidaPresupuesto[];
    usuarioId?: string;
  }
): HistorialDecisionPresupuesto {
  let accion: AccionHistorialPresupuesto;
  let usuario: string;
  let estadoAnterior: EstadoPresupuestoProfesional;
  let estadoNuevo: EstadoPresupuestoProfesional;
  let opciones: {
    motivo?: string;
    categoriaMotivo?: CategoriaMotivoAjuste | string;
    observaciones?: string;
    version?: number;
    importeTotal?: number;
    partidasSnapshot?: PartidaPresupuesto[];
    usuarioId?: string;
  } | undefined;

  if (typeof arg1 === 'object' && 'accion' in arg1) {
    accion = arg1.accion;
    usuario = arg1.usuario;
    estadoAnterior = arg1.estadoAnterior;
    estadoNuevo = arg1.estadoNuevo;
    opciones = arg1;
  } else {
    accion = arg1 as AccionHistorialPresupuesto;
    usuario = usuarioArg || 'Gestor Operativo';
    estadoAnterior = estadoAnteriorArg || 'RECIBIDO';
    estadoNuevo = estadoNuevoArg || 'RECIBIDO';
    opciones = opcionesArg;
  }

  return {
    id: `hdec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fecha: new Date().toISOString(),
    usuario,
    usuarioId: opciones?.usuarioId,
    accion,
    estadoAnterior,
    estadoNuevo,
    motivo: opciones?.motivo?.trim(),
    categoriaMotivo: opciones?.categoriaMotivo,
    observaciones: opciones?.observaciones?.trim(),
    version: opciones?.version,
    importeTotal: opciones?.importeTotal,
    partidasSnapshot: opciones?.partidasSnapshot
      ? JSON.parse(JSON.stringify(opciones.partidasSnapshot))
      : undefined,
  };
}

/**
 * Comprueba si el ámbito geográfico del profesional cubre la ubicación del inmueble.
 */
export function coincideUbicacion(profesional: Profesional, inmueble?: Inmueble): boolean {
  if (!inmueble) return true;
  if (!profesional.zonasServicio || profesional.zonasServicio.length === 0) return true;

  const inmProvincia = ((inmueble.datosFiscales as Record<string, any>)?.provincia || inmueble.ciudad || '').toLowerCase().trim();
  const inmMunicipio = (inmueble.ciudad || '').toLowerCase().trim();
  const inmCP = (inmueble.datosFiscales?.codigoPostal || '').trim();

  return profesional.zonasServicio.some((zona) => {
    const zonaProvincia = (zona.provincia || '').toLowerCase().trim();
    const zonaMunicipio = (zona.municipio || '').toLowerCase().trim();

    if (zonaProvincia && inmProvincia.includes(zonaProvincia)) return true;
    if (zonaProvincia && zonaProvincia.includes(inmProvincia) && inmProvincia.length > 2) return true;

    if (zonaMunicipio && inmMunicipio.includes(zonaMunicipio)) return true;
    if (zonaMunicipio && zonaMunicipio.includes(inmMunicipio) && inmMunicipio.length > 2) return true;

    if (zona.codigosPostales && inmCP) {
      if (zona.codigosPostales.includes(inmCP)) return true;
    }

    return false;
  });
}

export interface FiltrosProfesionales {
  texto?: string;
  especialidad?: string;
  servicio?: string;
  inmuebleId?: string;
  inmueble?: Inmueble;
  propietarioId?: string;
  soloActivos?: boolean;
}

/**
 * Motor de búsqueda y filtrado de profesionales.
 */
export function buscarProfesionales(
  profesionales: Profesional[],
  filtros: FiltrosProfesionales,
  _trabajos: TrabajoProfesional[] = []
): Profesional[] {
  return profesionales.filter((prof) => {
    if (filtros.soloActivos !== false) {
      const isActivo = prof.estado ? prof.estado === 'ACTIVO' : prof.activo !== false;
      if (!isActivo) return false;
    }

    if (filtros.especialidad && filtros.especialidad !== 'TODAS') {
      const targetEsp = filtros.especialidad.toLowerCase();
      const hasEsp = prof.especialidades?.some((e) => {
        const norm = e.toLowerCase();
        return norm === targetEsp || norm.includes(targetEsp) || targetEsp.includes(norm);
      });
      if (!hasEsp) return false;
    }

    if (filtros.servicio && filtros.servicio.trim()) {
      const targetServ = filtros.servicio.toLowerCase().trim();
      const hasServ = prof.servicios?.some((s) => {
        if (typeof s === 'string') {
          return s.toLowerCase().includes(targetServ);
        }
        return (
          s.nombre.toLowerCase().includes(targetServ) ||
          s.descripcion?.toLowerCase().includes(targetServ) ||
          s.especialidad.toLowerCase().includes(targetServ)
        );
      });
      if (!hasServ) return false;
    }

    if (filtros.inmueble) {
      if (!coincideUbicacion(prof, filtros.inmueble)) {
        return false;
      }
    }

    if (filtros.texto && filtros.texto.trim()) {
      const term = filtros.texto.toLowerCase().trim();
      const matchNomComercial = prof.nombreComercial?.toLowerCase().includes(term);
      const matchRazon = prof.razonSocial?.toLowerCase().includes(term) || prof.empresa?.toLowerCase().includes(term);
      const matchCif = prof.cifNif?.toLowerCase().includes(term);
      const matchContacto = prof.contactoNombre?.toLowerCase().includes(term);
      const matchEmail = prof.email?.toLowerCase().includes(term);
      const matchTel = prof.telefono?.toLowerCase().includes(term);
      const matchEsp = prof.especialidades?.some((e) => e.toLowerCase().includes(term));
      const matchZonas = prof.zonasServicio?.some(
        (z) => z.provincia?.toLowerCase().includes(term) || z.municipio?.toLowerCase().includes(term)
      );

      if (
        !matchNomComercial &&
        !matchRazon &&
        !matchCif &&
        !matchContacto &&
        !matchEmail &&
        !matchTel &&
        !matchEsp &&
        !matchZonas
      ) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Calcula métricas detalladas para el perfil de un profesional.
 */
export function calcularMetricasProfesional(
  profesional: Profesional,
  trabajos: TrabajoProfesional[] = [],
  presupuestos: PresupuestoProfesional[] = [],
  valoraciones: ValoracionProfesionalTrabajo[] = []
) {
  const misTrabajos = trabajos.filter((t) => t.profesionalId === profesional.id);
  const misPresupuestos = presupuestos.filter((p) => p.profesionalId === profesional.id);
  const misValoraciones = valoraciones.filter(
    (v) => v.profesionalId === profesional.id || misTrabajos.some((t) => t.id === v.trabajoId)
  );

  const trabajosFinalizados = misTrabajos.filter((t) => t.estado === 'FINALIZADO' || t.estado === 'FINALIZADA').length;
  const trabajosEnCurso = misTrabajos.filter(
    (t) => t.estado === 'EN_EJECUCION' || t.estado === 'EN_CURSO' || t.estado === 'PROGRAMADO' || t.estado === 'ACEPTADO'
  ).length;

  const presupuestosAceptados = misPresupuestos.filter((p) => p.estado === 'ACEPTADO').length;
  const presupuestosRechazados = misPresupuestos.filter((p) => p.estado === 'RECHAZADO').length;
  const totalPresupuestosEvaluados = presupuestosAceptados + presupuestosRechazados;
  const tasaAceptacion =
    totalPresupuestosEvaluados > 0
      ? Math.round((presupuestosAceptados / totalPresupuestosEvaluados) * 100)
      : 0;

  const volumenTotalFacturado = misPresupuestos
    .filter((p) => p.estado === 'ACEPTADO')
    .reduce((acc, p) => acc + (p.importeTotal || 0), 0);

  const inmueblesIntervenidos = Array.from(
    new Set(misTrabajos.map((t) => t.inmuebleId).filter(Boolean))
  );

  let mediaPuntuacion = profesional.valoracionMedia || 0;
  let mediaCalidad = 0;
  let mediaPuntualidad = 0;
  let mediaPrecio = 0;
  let mediaComunicacion = 0;

  if (misValoraciones.length > 0) {
    const sumPunt = misValoraciones.reduce((acc, v) => acc + v.puntuacion, 0);
    const sumCal = misValoraciones.reduce((acc, v) => acc + v.calidad, 0);
    const sumPuntual = misValoraciones.reduce((acc, v) => acc + v.puntualidad, 0);
    const sumPrec = misValoraciones.reduce((acc, v) => acc + v.precio, 0);
    const sumCom = misValoraciones.reduce((acc, v) => acc + v.comunicacion, 0);

    mediaPuntuacion = Number((sumPunt / misValoraciones.length).toFixed(1));
    mediaCalidad = Number((sumCal / misValoraciones.length).toFixed(1));
    mediaPuntualidad = Number((sumPuntual / misValoraciones.length).toFixed(1));
    mediaPrecio = Number((sumPrec / misValoraciones.length).toFixed(1));
    mediaComunicacion = Number((sumCom / misValoraciones.length).toFixed(1));
  }

  return {
    totalTrabajos: misTrabajos.length,
    trabajosFinalizados,
    trabajosEnCurso,
    totalPresupuestos: misPresupuestos.length,
    presupuestosAceptados,
    presupuestosRechazados,
    tasaAceptacion,
    volumenTotalFacturado,
    inmueblesCount: inmueblesIntervenidos.length,
    totalValoraciones: misValoraciones.length,
    mediaPuntuacion,
    mediaCalidad,
    mediaPuntualidad,
    mediaPrecio,
    mediaComunicacion,
    misTrabajos,
    misPresupuestos,
    misValoraciones,
  };
}

/**
 * Calcula los importes de base imponible, IVA y total para las partidas de un presupuesto.
 */
export function calcularTotalesPresupuesto(
  partidas: PartidaPresupuesto[] = [],
  porcentajeIva: number = 21
) {
  const importeBase = partidas.reduce(
    (sum, p) => sum + (p.importe || (p.cantidad * p.precioUnitario) || 0),
    0
  );
  const iva = Math.round(importeBase * (porcentajeIva / 100) * 100) / 100;
  const importeTotal = Math.round((importeBase + iva) * 100) / 100;
  return {
    importeBase: Number(importeBase.toFixed(2)),
    iva: Number(iva.toFixed(2)),
    importeTotal: Number(importeTotal.toFixed(2)),
  };
}

/**
 * Calcula métricas agregadas de todos los trabajos y presupuestos profesionales.
 */
export function calcularMetricasGeneralesTrabajos(
  trabajos: TrabajoProfesional[] = [],
  presupuestos: PresupuestoProfesional[] = [],
  profesionales: Profesional[] = [],
  valoraciones: ValoracionProfesionalTrabajo[] = []
) {
  const activos = trabajos.filter(
    (t) => t.estado !== 'FINALIZADO' && t.estado !== 'FINALIZADA' && t.estado !== 'CANCELADO' && t.estado !== 'CANCELADA'
  ).length;

  const urgentes = trabajos.filter(
    (t) => (t.prioridad === 'URGENTE' || t.prioridad === 'ALTA') && t.estado !== 'FINALIZADO' && t.estado !== 'FINALIZADA' && t.estado !== 'CANCELADO' && t.estado !== 'CANCELADA'
  ).length;

  const pendientesPresupuesto = trabajos.filter(
    (t) => t.estado === 'PRESUPUESTO_SOLICITADO' || t.estado === 'PRESUPUESTO_RECIBIDO' || t.estado === 'PENDIENTE_ACEPTACION'
  ).length;

  const enEjecucion = trabajos.filter(
    (t) => t.estado === 'EN_EJECUCION' || t.estado === 'EN_CURSO' || t.estado === 'PROGRAMADO'
  ).length;

  const finalizados = trabajos.filter(
    (t) => t.estado === 'FINALIZADO' || t.estado === 'FINALIZADA'
  ).length;

  const presupuestosAceptadosList = presupuestos.filter((p) => p.estado === 'ACEPTADO');
  const gastoTotalAprobado = presupuestosAceptadosList.reduce((sum, p) => sum + (p.importeTotal || 0), 0);

  const profesionalesActivos = profesionales.filter((p) =>
    p.estado ? p.estado === 'ACTIVO' : p.activo !== false
  ).length;

  let mediaPuntuacionGlobal = 0;
  if (valoraciones && valoraciones.length > 0) {
    const sumPunt = valoraciones.reduce((acc, v) => acc + (v.puntuacion || 0), 0);
    mediaPuntuacionGlobal = Number((sumPunt / valoraciones.length).toFixed(1));
  } else if (profesionales.length > 0) {
    const profsConValoracion = profesionales.filter((p) => typeof p.valoracionMedia === 'number' && p.valoracionMedia > 0);
    if (profsConValoracion.length > 0) {
      const sum = profsConValoracion.reduce((acc, p) => acc + (p.valoracionMedia || 0), 0);
      mediaPuntuacionGlobal = Number((sum / profsConValoracion.length).toFixed(1));
    }
  }

  return {
    totalTrabajos: trabajos.length,
    activos,
    urgentes,
    pendientesPresupuesto,
    enEjecucion,
    trabajosEnEjecucion: enEjecucion,
    finalizados,
    trabajosFinalizados: finalizados,
    gastoTotalAprobado,
    totalImporteFacturado: gastoTotalAprobado,
    totalPresupuestos: presupuestos.length,
    presupuestosAceptados: presupuestosAceptadosList.length,
    profesionalesActivos,
    totalProfesionales: profesionales.length,
    mediaPuntuacionGlobal,
  };
}

/**
 * Constructor de evento de auditoría/historial de trabajo.
 */
export function crearItemHistorialTrabajo(
  accion: HistorialTrabajoItem['accion'],
  usuario: string,
  estadoAnterior?: EstadoTrabajoProfesional,
  estadoNuevo?: EstadoTrabajoProfesional,
  observacion?: string
): HistorialTrabajoItem {
  return {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fecha: new Date().toISOString(),
    usuario,
    accion,
    estadoAnterior,
    estadoNuevo,
    observacion,
  };
}

/**
 * Normaliza un texto para comparaciones operativas inmunes a tildes, mayúsculas y espacios.
 */
export function normalizarTexto(str?: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Mapeo canónico de servicios técnicos habituales hacia códigos de Especialidad oficial.
 */
export const SERVICIOS_ESPECIALIDADES_MAP: Record<string, EspecialidadCodigo> = {
  // Fontanería y saneamiento
  fontaneria: 'FONTANERIA',
  fontanero: 'FONTANERIA',
  'fuga de agua': 'FONTANERIA',
  'fuga agua': 'FONTANERIA',
  fuga: 'FONTANERIA',
  grifo: 'FONTANERIA',
  griferia: 'FONTANERIA',
  desatasco: 'FONTANERIA',
  desatascos: 'FONTANERIA',
  tuberia: 'FONTANERIA',
  termo: 'FONTANERIA',
  inodoro: 'FONTANERIA',
  cisterna: 'FONTANERIA',
  sanitarios: 'FONTANERIA',
  bajante: 'FONTANERIA',
  sifon: 'FONTANERIA',
  desague: 'FONTANERIA',
  humedad: 'FONTANERIA',

  // Electricidad
  electricidad: 'ELECTRICIDAD',
  electricista: 'ELECTRICIDAD',
  'cuadro electrico': 'ELECTRICIDAD',
  enchufe: 'ELECTRICIDAD',
  enchufes: 'ELECTRICIDAD',
  luz: 'ELECTRICIDAD',
  iluminacion: 'ELECTRICIDAD',
  diferencial: 'ELECTRICIDAD',
  cortocircuito: 'ELECTRICIDAD',
  boletin: 'ELECTRICIDAD',
  cableado: 'ELECTRICIDAD',
  interruptor: 'ELECTRICIDAD',

  // Climatización & Calefacción
  climatizacion: 'CLIMATIZACION',
  'aire acondicionado': 'CLIMATIZACION',
  split: 'CLIMATIZACION',
  'bomba de calor': 'CLIMATIZACION',
  clima: 'CLIMATIZACION',
  calefaccion: 'CALEFACCION',
  caldera: 'CALEFACCION',
  radiador: 'CALEFACCION',
  radiadores: 'CALEFACCION',
  termostato: 'CALEFACCION',
  gas: 'CALEFACCION',

  // Cerrajería
  cerrajeria: 'CERRAJERIA',
  cerrajero: 'CERRAJERIA',
  cerradura: 'CERRAJERIA',
  bombin: 'CERRAJERIA',
  'puerta bloqueada': 'CERRAJERIA',
  llaves: 'CERRAJERIA',
  apertura: 'CERRAJERIA',

  // Albañilería
  albanileria: 'ALBANILERIA',
  albanil: 'ALBANILERIA',
  alicatado: 'ALBANILERIA',
  solado: 'ALBANILERIA',
  tabique: 'ALBANILERIA',
  grieta: 'ALBANILERIA',
  yeso: 'ALBANILERIA',
  escayola: 'ALBANILERIA',

  // Pintura
  pintura: 'PINTURA',
  pintor: 'PINTURA',
  pintar: 'PINTURA',
  gotele: 'PINTURA',
  alisado: 'PINTURA',
  fachada: 'PINTURA',

  // Carpintería
  carpinteria: 'CARPINTERIA',
  carpintero: 'CARPINTERIA',
  puerta: 'CARPINTERIA',
  puertas: 'CARPINTERIA',
  parquet: 'CARPINTERIA',
  tarima: 'CARPINTERIA',
  persiana: 'CARPINTERIA',
  persianas: 'CARPINTERIA',
  aluminio: 'CARPINTERIA',
  ventana: 'CARPINTERIA',

  // Cristalería
  cristaleria: 'CRISTALERIA',
  cristalero: 'CRISTALERIA',
  vidrio: 'CRISTALERIA',
  climalit: 'CRISTALERIA',
  espejo: 'CRISTALERIA',
  mampara: 'CRISTALERIA',

  // Electrodomésticos
  electrodomesticos: 'ELECTRODOMESTICOS',
  lavadora: 'ELECTRODOMESTICOS',
  frigorifico: 'ELECTRODOMESTICOS',
  horno: 'ELECTRODOMESTICOS',
  lavavajillas: 'ELECTRODOMESTICOS',
  vitroceramica: 'ELECTRODOMESTICOS',
  campana: 'ELECTRODOMESTICOS',
  microondas: 'ELECTRODOMESTICOS',

  // Limpieza
  limpieza: 'LIMPIEZA',
  desinfeccion: 'LIMPIEZA',
  'fin de obra': 'LIMPIEZA',

  // Plagas
  plagas: 'PLAGAS',
  desinsectacion: 'PLAGAS',
  desratizacion: 'PLAGAS',

  // Telecomunicaciones
  telecomunicaciones: 'TELECOMUNICACIONES',
  antena: 'TELECOMUNICACIONES',
  portero: 'TELECOMUNICACIONES',
  videoportero: 'TELECOMUNICACIONES',
  interfono: 'TELECOMUNICACIONES',
  wifi: 'TELECOMUNICACIONES',

  // Reformas y Técnico
  reformas: 'REFORMAS',
  reforma: 'REFORMAS',
  'reforma integral': 'REFORMAS',
  tecnico: 'TECNICO',
  mantenimiento: 'TECNICO',
  'mantenimiento preventivo': 'TECNICO',
  revision: 'TECNICO',
};

/**
 * Deduce de forma determinista la especialidad requerida a partir del servicio o categoría.
 */
export function mapearServicioAEspecialidad(
  servicio?: string,
  categoria?: string
): EspecialidadCodigo | undefined {
  // 1. Coincidencia directa por código de especialidad
  if (categoria) {
    const catNorm = normalizarTexto(categoria).toUpperCase();
    const matchCod = ESPECIALIDADES_CATALOGO.find((e) => e.codigo === catNorm);
    if (matchCod) return matchCod.codigo;

    // Categorías específicas de incidencia
    if (catNorm === 'CALEFACCION_ACS') return 'CALEFACCION';
    if (catNorm === 'PLAGAS_SANEAMIENTO') return 'PLAGAS';
    if (catNorm === 'DESATASCO') return 'FONTANERIA';
  }

  // 2. Coincidencia por nombre de servicio en el diccionario
  if (servicio) {
    const servNorm = normalizarTexto(servicio);
    if (SERVICIOS_ESPECIALIDADES_MAP[servNorm]) {
      return SERVICIOS_ESPECIALIDADES_MAP[servNorm];
    }

    // Comprobación por tokens o subcadenas clave
    for (const [clave, espCod] of Object.entries(SERVICIOS_ESPECIALIDADES_MAP)) {
      if (servNorm.includes(clave) || clave.includes(servNorm)) {
        return espCod;
      }
    }
  }

  // 3. Comprobación en el catálogo por nombre
  if (categoria) {
    const catNorm = normalizarTexto(categoria);
    const matchCat = ESPECIALIDADES_CATALOGO.find((e) => normalizarTexto(e.nombre) === catNorm);
    if (matchCat) return matchCat.codigo;
  }

  return undefined;
}

/**
 * Evalúa la compatibilidad geográfica entre la ubicación del inmueble y el área de servicio del profesional.
 * Prioridad estricta:
 * 1. Municipio / Ciudad / Localidad o Código Postal exacto.
 * 2. Provincia.
 * 3. ZONA_NO_DETERMINADA si falta información geográfica.
 * 4. FUERA_DE_ZONA si el profesional opera exclusivamente en otra zona.
 */
export function evaluarZonaProfesional(
  inmueble: Partial<Inmueble> | undefined,
  profesional: Profesional
): {
  compatible: boolean;
  estadoZona: EstadoZonaCompatibilidad;
  detalle: string;
} {
  if (!inmueble) {
    return {
      compatible: false,
      estadoZona: 'ZONA_NO_DETERMINADA',
      detalle: 'No se ha especificado el inmueble de referencia.',
    };
  }

  const inmMunicipio = normalizarTexto(
    inmueble.ciudad || (inmueble as any).municipio || (inmueble as any).localidad
  );
  const inmProvincia = normalizarTexto(
    (inmueble.datosFiscales as any)?.provincia || (inmueble as any).provincia || ''
  );
  const inmCP = (
    (inmueble.datosFiscales as any)?.codigoPostal ||
    (inmueble as any).codigoPostal ||
    ''
  ).trim();

  // Si el inmueble no tiene datos de ubicación
  if (!inmMunicipio && !inmProvincia && !inmCP) {
    return {
      compatible: false,
      estadoZona: 'ZONA_NO_DETERMINADA',
      detalle: 'El inmueble no dispone de datos de ubicación geográfica suficientes.',
    };
  }

  // Si el profesional no tiene zonas configuradas
  if (!profesional.zonasServicio || profesional.zonasServicio.length === 0) {
    return {
      compatible: false,
      estadoZona: 'ZONA_NO_DETERMINADA',
      detalle: 'El profesional no tiene registradas zonas geográficas de servicio.',
    };
  }

  let coincidenciaMunicipio = false;
  let coincidenciaCP = false;
  let coincidenciaProvincia = false;

  for (const zona of profesional.zonasServicio) {
    const zonaMunicipio = normalizarTexto(zona.municipio || zona.localidad);
    const zonaProvincia = normalizarTexto(zona.provincia);
    const zonaMunicipios = Array.isArray((zona as any).municipios)
      ? (zona as any).municipios.map((m: string) => normalizarTexto(m))
      : [];

    // 1. Código postal exacto
    if (zona.codigosPostales && inmCP && (zona.codigosPostales.includes(inmCP) || zona.codigosPostales.some((cp) => cp.trim() === inmCP))) {
      coincidenciaCP = true;
      break;
    }

    // 2. Municipio / Ciudad
    if (inmMunicipio) {
      if (
        (zonaMunicipio && (zonaMunicipio === inmMunicipio || zonaMunicipio.includes(inmMunicipio) || inmMunicipio.includes(zonaMunicipio))) ||
        zonaMunicipios.some((m: string) => m === inmMunicipio || m.includes(inmMunicipio) || inmMunicipio.includes(m))
      ) {
        coincidenciaMunicipio = true;
        break;
      }
    }

    // 3. Cobertura provincial
    if (zonaProvincia && (inmProvincia || inmMunicipio)) {
      if (
        (inmProvincia && (zonaProvincia === inmProvincia || zonaProvincia.includes(inmProvincia) || inmProvincia.includes(zonaProvincia))) ||
        (inmMunicipio && (zonaProvincia === inmMunicipio || zonaProvincia.includes(inmMunicipio) || inmMunicipio.includes(zonaProvincia)))
      ) {
        coincidenciaProvincia = true;
      }
    }
  }

  if (coincidenciaCP || coincidenciaMunicipio) {
    return {
      compatible: true,
      estadoZona: 'MUNICIPIO_O_CP_EXACTO',
      detalle: `Cobertura municipal confirmada para ${inmMunicipio || inmCP}.`,
    };
  }

  if (coincidenciaProvincia) {
    return {
      compatible: true,
      estadoZona: 'PROVINCIAL',
      detalle: `Cobertura provincial confirmada para ${inmProvincia || inmMunicipio}.`,
    };
  }

  return {
    compatible: false,
    estadoZona: 'FUERA_DE_ZONA',
    detalle: `Inmueble fuera del área geográfica de cobertura del profesional (${profesional.zonasServicio.map((z: any) => z.municipios ? z.municipios.join(', ') : (z.municipio || z.provincia)).filter(Boolean).join(', ')}).`,
  };
}

/**
 * Obtiene todas las especialidades posibles mapeadas a partir de un texto o descripción de servicio.
 */
export function obtenerEspecialidadesParaServicio(servicioOTexto?: string): EspecialidadCodigo[] {
  if (!servicioOTexto) return [];
  const norm = normalizarTexto(servicioOTexto);
  const resultado = new Set<EspecialidadCodigo>();

  for (const [clave, esp] of Object.entries(SERVICIOS_ESPECIALIDADES_MAP)) {
    if (norm.includes(normalizarTexto(clave)) || normalizarTexto(clave).includes(norm)) {
      resultado.add(esp);
    }
  }

  if (resultado.size === 0) {
    const espDirecta = mapearServicioAEspecialidad(servicioOTexto);
    if (espDirecta) resultado.add(espDirecta);
  }

  return Array.from(resultado);
}

/**
 * Evalúa la compatibilidad operativa total de un profesional con una necesidad técnica e inmueble.
 */
export function evaluarCompatibilidadProfesional(
  arg1:
    | {
        inmueble?: Inmueble;
        profesional: Profesional;
        servicioRequerido?: string;
        especialidadRequerida?: EspecialidadCodigo | string;
        categoria?: string;
      }
    | Profesional,
  arg2?: Inmueble,
  arg3?: {
    categoria?: string;
    servicioRequerido?: string;
    especialidadRequerida?: EspecialidadCodigo | string;
  }
): ResultadoCompatibilidadProfesional {
  let profesional: Profesional;
  let inmueble: Inmueble | undefined;
  let servicioRequerido: string | undefined;
  let especialidadRequerida: EspecialidadCodigo | string | undefined;
  let categoria: string | undefined;

  if ('profesional' in (arg1 as any)) {
    const params = arg1 as {
      inmueble?: Inmueble;
      profesional: Profesional;
      servicioRequerido?: string;
      especialidadRequerida?: EspecialidadCodigo | string;
      categoria?: string;
    };
    profesional = params.profesional;
    inmueble = params.inmueble;
    servicioRequerido = params.servicioRequerido;
    especialidadRequerida = params.especialidadRequerida;
    categoria = params.categoria;
  } else {
    profesional = arg1 as Profesional;
    inmueble = arg2;
    categoria = arg3?.categoria;
    servicioRequerido = arg3?.servicioRequerido;
    especialidadRequerida = arg3?.especialidadRequerida;
  }

  // 1. Estado operativo del profesional
  const cumpleEstado =
    profesional.activo !== false &&
    profesional.disponible !== false &&
    profesional.estado !== 'INACTIVO' &&
    profesional.estado !== 'PAUSADO' &&
    profesional.estado !== 'BLOQUEADO';

  // 2. Especialidad requerida
  const especialidadObjetivo =
    especialidadRequerida || mapearServicioAEspecialidad(servicioRequerido, categoria);

  let cumpleEspecialidad = false;
  if (!especialidadObjetivo && !categoria && !servicioRequerido) {
    cumpleEspecialidad = true;
  } else {
    const espNorm = normalizarTexto(especialidadObjetivo || categoria || servicioRequerido);

    // Comprobación en especialidades del profesional
    if (profesional.especialidades && profesional.especialidades.length > 0) {
      cumpleEspecialidad = profesional.especialidades.some((e) => {
        const norm = normalizarTexto(e);
        return (
          norm === espNorm ||
          norm.includes(espNorm) ||
          espNorm.includes(norm) ||
          mapearServicioAEspecialidad(e) === especialidadObjetivo
        );
      });
    }

    // Comprobación en servicios ofrecidos
    if (!cumpleEspecialidad && profesional.servicios && profesional.servicios.length > 0) {
      cumpleEspecialidad = profesional.servicios.some((s: any) => {
        const sNom = typeof s === 'string' ? s : s.nombre || '';
        const sEsp = typeof s === 'object' && s.especialidad ? s.especialidad : '';
        const normEsp = normalizarTexto(sEsp);
        const normNom = normalizarTexto(sNom);
        return (
          normEsp === espNorm ||
          normEsp.includes(espNorm) ||
          normNom.includes(espNorm) ||
          (especialidadObjetivo && mapearServicioAEspecialidad(sNom) === especialidadObjetivo) ||
          (servicioRequerido && normNom.includes(normalizarTexto(servicioRequerido)))
        );
      });
    }
  }

  // 3. Zona geográfica
  const evaluacionZona = evaluarZonaProfesional(inmueble, profesional);
  const cumpleZona = evaluacionZona.compatible;

  // 4. Determinación de Nivel
  let nivel: NivelCompatibilidad = 'NO_COMPATIBLE';
  let motivo = '';

  if (!cumpleEstado) {
    nivel = 'NO_COMPATIBLE';
    motivo = 'Profesional inactivo, pausado o no disponible operativamente.';
  } else if (!cumpleEspecialidad) {
    nivel = 'NO_COMPATIBLE';
    motivo = `El profesional no dispone de la especialidad técnica requerida (${especialidadObjetivo || categoria || 'solicitada'}).`;
  } else if (evaluacionZona.estadoZona === 'FUERA_DE_ZONA') {
    nivel = 'NO_COMPATIBLE';
    motivo = evaluacionZona.detalle;
  } else if (evaluacionZona.estadoZona === 'PROVINCIAL' || evaluacionZona.estadoZona === 'ZONA_NO_DETERMINADA') {
    nivel = 'COMPATIBLE_CON_RESERVA';
    motivo =
      evaluacionZona.estadoZona === 'PROVINCIAL'
        ? `Especialidad confirmada con cobertura en toda la provincia (${evaluacionZona.detalle}).`
        : 'Cumple la especialidad requerida, pero la cobertura geográfica requiere confirmación operativa.';
  } else {
    nivel = 'COMPATIBLE';
    motivo = `Profesional compatible: especialidad confirmada y cobertura geográfica verificada (${evaluacionZona.detalle}).`;
  }

  return {
    profesional,
    nivel,
    cumpleEspecialidad,
    cumpleZona,
    cumpleEstado,
    estadoZona: evaluacionZona.estadoZona,
    especialidadEvaluada: especialidadObjetivo,
    servicioEvaluado: servicioRequerido,
    motivo,
    detalles: {
      especialidad: cumpleEspecialidad ? 'Especialidad válida' : 'Sin especialidad requerida',
      zona: evaluacionZona.detalle,
      estado: cumpleEstado ? 'Activo y disponible' : 'No disponible',
    },
  };
}

/**
 * Busca y clasifica todos los profesionales disponibles para un inmueble y servicio.
 */
export function buscarProfesionalesCompatibles(params: {
  inmueble?: Inmueble;
  profesionales: Profesional[];
  servicioRequerido?: string;
  especialidadRequerida?: EspecialidadCodigo | string;
  categoria?: string;
  incluirNoCompatibles?: boolean;
}): ResultadoCompatibilidadProfesional[] {
  const {
    inmueble,
    profesionales = [],
    servicioRequerido,
    especialidadRequerida,
    categoria,
    incluirNoCompatibles = false,
  } = params;

  const resultados: ResultadoCompatibilidadProfesional[] = profesionales.map((prof) =>
    evaluarCompatibilidadProfesional({
      inmueble,
      profesional: prof,
      servicioRequerido,
      especialidadRequerida,
      categoria,
    })
  );

  // Ordenación determinista y pura:
  // 1. COMPATIBLE (MUNICIPIO_O_CP_EXACTO > PROVINCIAL)
  // 2. COMPATIBLE_CON_RESERVA
  // 3. NO_COMPATIBLE
  resultados.sort((a, b) => {
    const ordenNivel: Record<NivelCompatibilidad, number> = {
      COMPATIBLE: 1,
      COMPATIBLE_CON_RESERVA: 2,
      NO_COMPATIBLE: 3,
    };
    const diffNivel = ordenNivel[a.nivel] - ordenNivel[b.nivel];
    if (diffNivel !== 0) return diffNivel;

    if (a.nivel === 'COMPATIBLE' && b.nivel === 'COMPATIBLE') {
      if (a.estadoZona === 'MUNICIPIO_O_CP_EXACTO' && b.estadoZona !== 'MUNICIPIO_O_CP_EXACTO') return -1;
      if (b.estadoZona === 'MUNICIPIO_O_CP_EXACTO' && a.estadoZona !== 'MUNICIPIO_O_CP_EXACTO') return 1;
    }

    return (a.profesional.nombreComercial || a.profesional.nombre || '').localeCompare(
      b.profesional.nombreComercial || b.profesional.nombre || ''
    );
  });

  if (incluirNoCompatibles) {
    return resultados;
  }

  return resultados.filter((r) => r.nivel !== 'NO_COMPATIBLE');
}

/**
 * Asigna de forma determinista un profesional a una incidencia.
 */
export function asignarProfesionalAIncidencia(params: {
  incidencia: Incidencia;
  profesional: Profesional;
  usuarioNombre?: string;
  usuarioId?: string;
  motivo?: string;
}): Incidencia {
  const { incidencia, profesional, usuarioNombre = 'Gestor Patrimonial', motivo } = params;
  const now = new Date().toISOString();
  const profNombre = profesional.nombreComercial || profesional.nombre || profesional.contactoNombre || 'Profesional Asignado';

  const obsHistorial = `Profesional asignado a la incidencia: ${profNombre}.${motivo ? ` Motivo: ${motivo}` : ''}`;

  return {
    ...incidencia,
    profesionalId: profesional.id,
    profesionalAsignadoId: profesional.id,
    profesionalAsignadoNombre: profNombre,
    estado: 'ASIGNADA',
    trabajoProfesional: incidencia.trabajoProfesional
      ? {
          ...incidencia.trabajoProfesional,
          profesionalId: profesional.id,
          profesionalNombre: profNombre,
          profesionalTelefono: profesional.telefono,
          profesionalEmail: profesional.email,
          fechaAsignacion: now,
          estadoTrabajo: 'ASIGNADO',
        }
      : {
          profesionalId: profesional.id,
          profesionalNombre: profNombre,
          profesionalTelefono: profesional.telefono,
          profesionalEmail: profesional.email,
          servicio: incidencia.categoria || 'Mantenimiento',
          fechaAsignacion: now,
          estadoTrabajo: 'ASIGNADO',
        },
    historial: [
      ...(incidencia.historial || []),
      {
        id: `hist_inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fecha: now,
        usuario: usuarioNombre,
        accion: 'ASIGNACION_PROFESIONAL',
        valorAnterior: incidencia.estado,
        valorNuevo: 'ASIGNADA',
        observacion: obsHistorial,
      },
    ],
    updatedAt: now,
  };
}

/**
 * Asigna de forma determinista y con trazabilidad inmutable un profesional a un trabajo u orden técnica.
 */
export function asignarProfesionalATrabajo(params: {
  trabajo: TrabajoProfesional;
  profesional: Profesional;
  usuarioNombre?: string;
  usuarioId?: string;
  motivo?: string;
  incidencia?: Incidencia;
}): TrabajoProfesional & {
  trabajoActualizado: TrabajoProfesional;
  incidenciaActualizada?: Incidencia;
  error?: string;
} {
  const { trabajo, profesional, usuarioNombre = 'Gestor Patrimonial', motivo, incidencia } = params;

  // Validación estricta: OTs finalizadas o canceladas no pueden reasignarse arbitrariamente
  if (
    trabajo.estado === 'FINALIZADO' ||
    trabajo.estado === 'FINALIZADA' ||
    trabajo.estado === 'CANCELADO' ||
    trabajo.estado === 'CANCELADA'
  ) {
    throw new Error('No se puede reasignar un profesional a una orden de trabajo finalizada o cancelada.');
  }

  const now = new Date().toISOString();
  const profNombre = profesional.nombreComercial || profesional.nombre || profesional.contactoNombre || 'Profesional Asignado';

  const estadoAnterior = trabajo.estado;
  let estadoNuevo: EstadoTrabajoProfesional = trabajo.estado;
  if (
    trabajo.estado === 'PENDIENTE' ||
    trabajo.estado === 'BUSCANDO_PROFESIONAL' ||
    trabajo.estado === 'PROFESIONAL_PROPUESTO'
  ) {
    estadoNuevo = 'ASIGNADO';
  }

  const esCambio = Boolean(trabajo.profesionalId && trabajo.profesionalId !== profesional.id);
  const accionHistorial = esCambio ? 'PROFESIONAL_CAMBIADO' : 'PROFESIONAL_ASIGNADO';
  const obsHistorial = esCambio
    ? `Cambio de profesional: ${trabajo.profesionalNombre || trabajo.profesionalId} → ${profNombre}.${motivo ? ` Motivo: ${motivo}` : ''}`
    : `Profesional asignado para ejecución técnica: ${profNombre} (${profesional.telefono || profesional.email || 'Contacto registrado'}).${motivo ? ` Detalle: ${motivo}` : ''}`;

  const nuevoItemHistorial: HistorialTrabajoItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fecha: now,
    usuario: usuarioNombre,
    accion: accionHistorial,
    estadoAnterior,
    estadoNuevo,
    profesionalAnteriorId: esCambio ? trabajo.profesionalId : undefined,
    profesionalNuevoId: profesional.id,
    motivo: motivo || undefined,
    observacion: obsHistorial,
  };

  const trabajoActualizado: TrabajoProfesional = {
    ...trabajo,
    // Inmutabilidad de claves primarias
    id: trabajo.id,
    inmuebleId: trabajo.inmuebleId,
    propietarioId: trabajo.propietarioId,
    // Asignación operativa
    profesionalId: profesional.id,
    profesionalNombre: profNombre,
    profesionalTelefono: profesional.telefono,
    profesionalEmail: profesional.email,
    fechaAsignacion: now,
    estado: estadoNuevo,
    historial: [...(trabajo.historial || []), nuevoItemHistorial],
    updatedAt: now,
  };

  let incidenciaActualizada: Incidencia | undefined = undefined;
  if (incidencia) {
    incidenciaActualizada = {
      ...incidencia,
      profesionalId: profesional.id,
      profesionalAsignadoId: profesional.id,
      profesionalAsignadoNombre: profNombre,
      trabajoProfesional: incidencia.trabajoProfesional
        ? {
            ...incidencia.trabajoProfesional,
            profesionalId: profesional.id,
            profesionalNombre: profNombre,
            profesionalTelefono: profesional.telefono,
            profesionalEmail: profesional.email,
            fechaAsignacion: now,
            estadoTrabajo: 'ASIGNADO',
          }
        : {
            profesionalId: profesional.id,
            profesionalNombre: profNombre,
            profesionalTelefono: profesional.telefono,
            profesionalEmail: profesional.email,
            servicio: trabajo.categoria || 'Mantenimiento',
            fechaAsignacion: now,
            estadoTrabajo: 'ASIGNADO',
          },
      historial: [
        ...(incidencia.historial || []),
        {
          id: `hist_inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          fecha: now,
          usuario: usuarioNombre,
          accion: 'ASIGNACION',
          valorAnterior: incidencia.estado,
          valorNuevo: incidencia.estado,
          observacion: obsHistorial,
        },
      ],
      updatedAt: now,
    };
  }

  return Object.assign({}, trabajoActualizado, {
    trabajoActualizado,
    incidenciaActualizada,
  });
}

/**
 * Reasigna un trabajo a un nuevo profesional requiriendo motivo justificado e historial inmutable.
 */
export function reasignarProfesionalTrabajo(params: {
  trabajo: TrabajoProfesional;
  nuevoProfesional?: Profesional;
  profesionalNuevo?: Profesional;
  usuarioNombre?: string;
  usuarioId?: string;
  motivo: string;
  incidencia?: Incidencia;
}): TrabajoProfesional & {
  trabajoActualizado: TrabajoProfesional;
  incidenciaActualizada?: Incidencia;
  error?: string;
} {
  const profesionalTarget = params.nuevoProfesional || params.profesionalNuevo;
  if (!profesionalTarget) {
    throw new Error('Debe indicarse un profesional de destino para la reasignación.');
  }
  if (!params.motivo || !params.motivo.trim()) {
    throw new Error('Debe especificarse obligatoriamente un motivo para el cambio de profesional.');
  }

  return asignarProfesionalATrabajo({
    trabajo: params.trabajo,
    profesional: profesionalTarget,
    usuarioNombre: params.usuarioNombre || 'Gestor Patrimonial',
    usuarioId: params.usuarioId,
    motivo: params.motivo.trim(),
    incidencia: params.incidencia,
  });
}

export const cambiarProfesionalDeTrabajo = reasignarProfesionalTrabajo;
