import {
  Profesional,
  TrabajoProfesional,
  PresupuestoProfesional,
  PartidaPresupuesto,
  ValoracionProfesionalTrabajo,
  Inmueble,
  EspecialidadCodigo,
  EstadoTrabajoProfesional,
  EstadoPresupuestoProfesional,
  TipoProfesional,
  EstadoProfesional,
  PrioridadIncidencia,
  HistorialTrabajoItem,
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
  { label: string; badgeClass: string }
> = {
  BORRADOR: { label: 'Borrador', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  RECIBIDO: { label: 'Recibido', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  EN_REVISION: { label: 'En Revisión', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  ACEPTADO: { label: 'Aceptado', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  RECHAZADO: { label: 'Rechazado', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
  CADUCADO: { label: 'Caducado', badgeClass: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
  EN_NEGOCIACION: { label: 'En Negociación', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
};

export const PRIORIDAD_TRABAJO_LABELS: Record<
  PrioridadIncidencia,
  { label: string; badgeClass: string }
> = {
  URGENTE: { label: 'Urgente', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200 font-bold' },
  ALTA: { label: 'Alta', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  NORMAL: { label: 'Normal', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  BAJA: { label: 'Baja', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
};

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

    // Comprobación por provincia
    if (zonaProvincia && inmProvincia.includes(zonaProvincia)) return true;
    if (zonaProvincia && zonaProvincia.includes(inmProvincia) && inmProvincia.length > 2) return true;

    // Comprobación por municipio
    if (zonaMunicipio && inmMunicipio.includes(zonaMunicipio)) return true;
    if (zonaMunicipio && zonaMunicipio.includes(inmMunicipio) && inmMunicipio.length > 2) return true;

    // Comprobación por código postal
    if (zona.codigosPostales && inmCP) {
      if (zona.codigosPostales.includes(inmCP)) return true;
      // Comprobar prefijo de CP (ej: 46xxx o 28xxx)
      if (zona.codigosPostales.some((cp) => cp.length >= 2 && inmCP.startsWith(cp.slice(0, 2)))) {
        return true;
      }
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
  trabajos: TrabajoProfesional[] = []
): Profesional[] {
  return profesionales.filter((prof) => {
    // 1. Estado activo
    if (filtros.soloActivos !== false) {
      const isActivo = prof.estado ? prof.estado === 'ACTIVO' : prof.activo !== false;
      if (!isActivo) return false;
    }

    // 2. Filtro por especialidad
    if (filtros.especialidad && filtros.especialidad !== 'TODAS') {
      const targetEsp = filtros.especialidad.toLowerCase();
      const hasEsp = prof.especialidades.some((e) => {
        const norm = e.toLowerCase();
        return norm === targetEsp || norm.includes(targetEsp) || targetEsp.includes(norm);
      });
      if (!hasEsp) return false;
    }

    // 3. Filtro por servicio
    if (filtros.servicio && filtros.servicio.trim()) {
      const targetServ = filtros.servicio.toLowerCase().trim();
      const hasServ = prof.servicios?.some((s) => {
        return (
          s.nombre.toLowerCase().includes(targetServ) ||
          s.descripcion?.toLowerCase().includes(targetServ) ||
          s.especialidad.toLowerCase().includes(targetServ)
        );
      });
      if (!hasServ) return false;
    }

    // 4. Ubicación geográfica respecto al inmueble
    if (filtros.inmueble) {
      if (!coincideUbicacion(prof, filtros.inmueble)) {
        return false;
      }
    }

    // 5. Relación histórica con inmueble si se especifica
    if (filtros.inmuebleId) {
      // Prioridad a profesionales que ya hayan trabajado en este inmueble
      // (No excluye a otros si no es estricto, pero se pondera)
    }

    // 6. Texto libre (nombre, CIF, teléfono, email, observaciones)
    if (filtros.texto && filtros.texto.trim()) {
      const term = filtros.texto.toLowerCase().trim();
      const matchNomComercial = prof.nombreComercial?.toLowerCase().includes(term);
      const matchRazon = prof.razonSocial?.toLowerCase().includes(term) || prof.empresa?.toLowerCase().includes(term);
      const matchCif = prof.cifNif?.toLowerCase().includes(term);
      const matchContacto = prof.contactoNombre?.toLowerCase().includes(term);
      const matchEmail = prof.email?.toLowerCase().includes(term);
      const matchTel = prof.telefono?.toLowerCase().includes(term);
      const matchEsp = prof.especialidades.some((e) => e.toLowerCase().includes(term));
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
  trabajos: TrabajoProfesional[],
  presupuestos: PresupuestoProfesional[],
  valoraciones: ValoracionProfesionalTrabajo[] = []
) {
  const misTrabajos = trabajos.filter((t) => t.profesionalId === profesional.id);
  const misPresupuestos = presupuestos.filter((p) => p.profesionalId === profesional.id);
  const misValoraciones = valoraciones.filter(
    (v) => v.profesionalId === profesional.id || misTrabajos.some((t) => t.id === v.trabajoId)
  );

  const trabajosFinalizados = misTrabajos.filter((t) => t.estado === 'FINALIZADO').length;
  const trabajosEnCurso = misTrabajos.filter(
    (t) => t.estado === 'EN_EJECUCION' || t.estado === 'PROGRAMADO' || t.estado === 'ACEPTADO'
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

  // Inmuebles únicos en los que ha intervenido
  const inmueblesIntervenidos = Array.from(
    new Set(misTrabajos.map((t) => t.inmuebleId).filter(Boolean))
  );

  // Valoración media
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
    (t) => t.prioridad === 'URGENTE' && t.estado !== 'FINALIZADO' && t.estado !== 'FINALIZADA' && t.estado !== 'CANCELADO' && t.estado !== 'CANCELADA'
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
