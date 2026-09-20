/**
 * MOTOR OPERATIVO DETERMINISTA DE REFORMAS (NECESIDAD -> PROYECTO -> PARTIDAS -> PRESUPUESTO -> ASIGNACIÓN -> OT -> GASTOS -> CIERRE)
 *
 * Arquitectura modular y pura:
 * 1. Reutiliza el modelo de Presupuestos (`PresupuestoProfesional`), Profesionales (`Profesional`) y Órdenes de Trabajo (`TrabajoProfesional`).
 * 2. Trazabilidad inmutable mediante histórico append-only.
 * 3. Idempotencia en la generación de gastos de explotación asociados.
 * 4. Integración patrimonial neutral sin invención automática de incremento de valor.
 */

import {
  NecesidadReforma,
  ProyectoReforma,
  PartidaReforma,
  HistorialProyectoReformaItem,
  ResumenCierreReforma,
  ImpactoPatrimonialReforma,
  EstadoNecesidadReforma,
  EstadoProyectoReforma,
  EstadoPartidaReforma,
  CategoriaReforma,
  CategoriaPartidaReforma,
  AccionHistorialProyectoReforma,
  Incidencia,
  ExpedienteRecomercializacion,
  MejoraROI,
  Profesional,
  PresupuestoProfesional,
  TrabajoProfesional,
  Gasto,
  Inmueble,
  PrioridadIncidencia,
} from '../types';

import {
  calcularTotalesPresupuesto,
  crearItemHistorialPresupuesto,
} from './profesionalesEngine';

// =========================================================================
// ETIQUETAS Y METADATOS DE CONFIGURACIÓN
// =========================================================================

export const CATEGORIA_REFORMA_LABELS: Record<
  CategoriaReforma,
  { label: string; badgeClass: string; descripcion: string }
> = {
  INTEGRAL: {
    label: 'Reforma Integral',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    descripcion: 'Renovación completa de todas las estancias e instalaciones.',
  },
  COCINA: {
    label: 'Cocina',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    descripcion: 'Mobiliario, encimeras, electrodomésticos y fontanería de cocina.',
  },
  BANO: {
    label: 'Baño / Aseo',
    badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    descripcion: 'Sanitarios, alicatados, plato de ducha y griferías.',
  },
  SUELOS: {
    label: 'Suelos y Pavimentos',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    descripcion: 'Tarima, gres, pulido o sustitución de pavimento.',
  },
  PINTURA: {
    label: 'Pintura y Enlucidos',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    descripcion: 'Pintura plástica, alisado de paredes y eliminación de gotelé.',
  },
  CLIMATIZACION: {
    label: 'Climatización y Calefacción',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-200',
    descripcion: 'Aire acondicionado, caldera, radiadores y aerotermia.',
  },
  ELECTRICIDAD: {
    label: 'Instalación Eléctrica',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    descripcion: 'Cuadro eléctrico, cableado, mecanismos e iluminación LED.',
  },
  FONTANERIA: {
    label: 'Fontanería y Saneamiento',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-200',
    descripcion: 'Tuberías, bajantes, llaves de paso y desagües.',
  },
  CARPINTERIA: {
    label: 'Carpintería Interior/Exterior',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    descripcion: 'Puertas de paso, armarios empotrados y cerrajería.',
  },
  FACHADA_EXTERIOR: {
    label: 'Fachada y Exteriores',
    badgeClass: 'bg-stone-100 text-stone-800 border-stone-200',
    descripcion: 'Balcones, terrazas, impermeabilización y carpintería exterior.',
  },
  PARCIAL: {
    label: 'Reforma Parcial',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    descripcion: 'Actuaciones localizadas en varias áreas del inmueble.',
  },
  OTRO: {
    label: 'Otras Reformas',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-200',
    descripcion: 'Actuaciones y adaptaciones no catalogadas en los tipos estándar.',
  },
};

export const ESTADO_NECESIDAD_REFORMA_LABELS: Record<
  EstadoNecesidadReforma,
  { label: string; badgeClass: string; stepOrder: number }
> = {
  BORRADOR: { label: 'Borrador', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', stepOrder: 1 },
  IDENTIFICADA: { label: 'Identificada', badgeClass: 'bg-sky-100 text-sky-800 border-sky-300', stepOrder: 2 },
  EN_ESTUDIO: { label: 'En Estudio', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300', stepOrder: 3 },
  PRESUPUESTANDO: { label: 'Presupuestando', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300', stepOrder: 4 },
  APROBADA: { label: 'Aprobada', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', stepOrder: 5 },
  EN_EJECUCION: { label: 'En Ejecución', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300', stepOrder: 6 },
  FINALIZADA: { label: 'Finalizada', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', stepOrder: 7 },
  CANCELADA: { label: 'Cancelada', badgeClass: 'bg-rose-100 text-rose-700 border-rose-300', stepOrder: 0 },
};

export const ESTADO_PROYECTO_REFORMA_LABELS: Record<
  EstadoProyectoReforma,
  { label: string; badgeClass: string; stepOrder: number }
> = {
  PENDIENTE: { label: 'Planificación Pendiente', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300', stepOrder: 1 },
  PRESUPUESTANDO: { label: 'Solicitando Presupuestos', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300', stepOrder: 2 },
  ADJUDICADO: { label: 'Presupuesto Adjudicado', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300', stepOrder: 3 },
  ASIGNADO: { label: 'Profesional Asignado', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300', stepOrder: 3 },
  EN_EJECUCION: { label: 'Obra en Ejecución', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300', stepOrder: 4 },
  PAUSADO: { label: 'Obra en Pausa', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300', stepOrder: 4 },
  PAUSADA: { label: 'Obra en Pausa', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300', stepOrder: 4 },
  FINALIZADO: { label: 'Obra Finalizada', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', stepOrder: 5 },
  FINALIZADA: { label: 'Obra Finalizada', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', stepOrder: 5 },
  CANCELADO: { label: 'Proyecto Cancelado', badgeClass: 'bg-rose-100 text-rose-700 border-rose-300', stepOrder: 0 },
  CANCELADA: { label: 'Proyecto Cancelado', badgeClass: 'bg-rose-100 text-rose-700 border-rose-300', stepOrder: 0 },
};

export const ESTADO_PARTIDA_LABELS: Record<
  EstadoPartidaReforma,
  { label: string; badgeClass: string }
> = {
  PENDIENTE: { label: 'Pendiente', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
  PRESUPUESTADA: { label: 'Presupuestada', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  EN_EJECUCION: { label: 'En Ejecución', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
  EJECUTADA: { label: 'Ejecutada', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  CANCELADA: { label: 'Cancelada', badgeClass: 'bg-rose-100 text-rose-700 border-rose-200' },
};

// =========================================================================
// GENERADORES DE IDS Y AYUDAS HISTÓRICAS
// =========================================================================

export function nuevoNecesidadReformaId(inmuebleId: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 6);
  return `nec_ref_${inmuebleId}_${ts}_${rand}`;
}

export function nuevoProyectoReformaId(inmuebleId: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 6);
  return `proj_ref_${inmuebleId}_${ts}_${rand}`;
}

export function nuevaPartidaId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 6);
  return `part_${ts}_${rand}`;
}

export function crearItemHistorialProyecto(params: {
  usuario: string;
  usuarioId?: string;
  accion: AccionHistorialProyectoReforma;
  estadoAnterior?: string;
  estadoNuevo?: string;
  profesionalId?: string;
  presupuestoId?: string;
  partidaId?: string;
  ordenTrabajoId?: string;
  gastoId?: string;
  importe?: number;
  motivo?: string;
  observacion?: string;
}): HistorialProyectoReformaItem {
  return {
    id: `hist_ref_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fecha: new Date().toISOString(),
    usuario: params.usuario || 'Gestor Operativo',
    usuarioId: params.usuarioId,
    accion: params.accion,
    estadoAnterior: params.estadoAnterior,
    estadoNuevo: params.estadoNuevo,
    profesionalId: params.profesionalId,
    presupuestoId: params.presupuestoId,
    partidaId: params.partidaId,
    ordenTrabajoId: params.ordenTrabajoId,
    gastoId: params.gastoId,
    importe: params.importe,
    motivo: params.motivo,
    observacion: params.observacion,
  };
}

// =========================================================================
// GESTIÓN DE NECESIDADES DE REFORMA
// =========================================================================

export function crearNecesidadReforma(params: {
  inmuebleId: string;
  propietarioId: string;
  titulo: string;
  descripcion: string;
  categoria?: CategoriaReforma | string;
  prioridad?: PrioridadIncidencia;
  estado?: EstadoNecesidadReforma;
  inmuebleDireccion?: string;
  incidenciaId?: string;
  expedienteId?: string;
  mejoraRoiId?: string;
  presupuestoEstimadoMin?: number;
  presupuestoEstimadoMax?: number;
  observaciones?: string;
  fotos?: string[] | any[];
  documentos?: any[];
  creadoPor?: string;
}): NecesidadReforma {
  const now = new Date().toISOString();
  return {
    id: nuevoNecesidadReformaId(params.inmuebleId),
    inmuebleId: params.inmuebleId,
    inmuebleDireccion: params.inmuebleDireccion,
    propietarioId: params.propietarioId,
    incidenciaId: params.incidenciaId,
    expedienteId: params.expedienteId,
    mejoraRoiId: params.mejoraRoiId,
    titulo: params.titulo.trim(),
    descripcion: params.descripcion.trim(),
    categoria: params.categoria || 'INTEGRAL',
    tipoReforma: params.categoria || 'INTEGRAL',
    prioridad: params.prioridad || 'NORMAL',
    estado: params.estado || 'IDENTIFICADA',
    presupuestoEstimadoMin: params.presupuestoEstimadoMin,
    presupuestoEstimadoMax: params.presupuestoEstimadoMax,
    observaciones: params.observaciones,
    fotos: params.fotos || [],
    documentos: params.documentos || [],
    fechaIdentificacion: now,
    fecha: now,
    creadoPor: params.creadoPor || 'Sistema',
    createdAt: now,
    updatedAt: now,
  };
}

export function cambiarEstadoNecesidadReforma(params: {
  necesidad: NecesidadReforma;
  nuevoEstado: EstadoNecesidadReforma;
  motivo?: string;
  usuarioNombre?: string;
}): NecesidadReforma {
  const { necesidad, nuevoEstado } = params;
  const now = new Date().toISOString();
  return {
    ...necesidad,
    estado: nuevoEstado,
    observaciones: params.motivo
      ? `${necesidad.observaciones ? `${necesidad.observaciones}\n` : ''}[${now}] Cambio a ${nuevoEstado}: ${params.motivo}`
      : necesidad.observaciones,
    updatedAt: now,
  };
}

export function crearNecesidadDesdeIncidencia(params: {
  incidencia: Incidencia;
  categoriaReforma?: CategoriaReforma | string;
  usuarioNombre?: string;
}): NecesidadReforma {
  const { incidencia, categoriaReforma, usuarioNombre } = params;
  return crearNecesidadReforma({
    inmuebleId: incidencia.inmuebleId,
    propietarioId: incidencia.propietarioId,
    inmuebleDireccion: incidencia.inmuebleDireccion,
    incidenciaId: incidencia.id,
    titulo: `Reforma derivada de incidencia: ${incidencia.titulo}`,
    descripcion: `Necesidad de reforma motivada por avería/incidencia registrada (#${incidencia.numero || incidencia.id}): ${incidencia.descripcion}`,
    categoria: categoriaReforma || 'PARCIAL',
    prioridad: incidencia.prioridad || 'ALTA',
    estado: 'IDENTIFICADA',
    fotos: incidencia.fotos?.map((f: any) => (typeof f === 'string' ? f : f.url)) || [],
    documentos: incidencia.documentos || [],
    creadoPor: usuarioNombre || 'Gestor Operativo',
  });
}

export function crearNecesidadDesdeMejoraROI(params: {
  mejora: MejoraROI;
  expediente: ExpedienteRecomercializacion;
  usuarioNombre?: string;
}): NecesidadReforma {
  const { mejora, expediente, usuarioNombre } = params;
  return crearNecesidadReforma({
    inmuebleId: expediente.inmuebleId,
    propietarioId: expediente.propietarioId,
    expedienteId: expediente.id,
    mejoraRoiId: mejora.id,
    titulo: `Reforma comercial: ${mejora.actuacion}`,
    descripcion: `Intervención de valorización recomendada en comercialización. Categoría: ${mejora.categoria || 'MEJORA'}. Renta estimada adicional: ${mejora.incrementoRentaMensual ? `+${mejora.incrementoRentaMensual} €/mes` : 'N/D'}.`,
    categoria: (mejora.categoria as any) || 'PARCIAL',
    prioridad: 'NORMAL',
    estado: 'IDENTIFICADA',
    presupuestoEstimadoMin: mejora.costeEstimadoMin,
    presupuestoEstimadoMax: mejora.costeEstimadoMax,
    creadoPor: usuarioNombre || 'Gestor de Recomercialización',
  });
}

// =========================================================================
// GESTIÓN DE PROYECTOS DE REFORMA Y PARTIDAS
// =========================================================================

export function calcularTotalesProyectoReforma(proyecto: ProyectoReforma): {
  presupuestoPrevisto: number;
  costeReal: number;
  desviacionCoste: number;
  numPartidas: number;
  numPartidasCompletadas: number;
  porcentajeEjecucion: number;
} {
  const partidas = proyecto.partidas || [];
  let presupuestoPrevisto = 0;
  let costeReal = 0;
  let numPartidasCompletadas = 0;

  for (const part of partidas) {
    const impEst = Number(part.importeEstimado) || (Number(part.cantidad) * Number(part.precioEstimado)) || 0;
    presupuestoPrevisto += impEst;

    const impReal = Number(part.importeReal) || (Number(part.precioReal) !== undefined ? Number(part.cantidad) * Number(part.precioReal) : 0) || 0;
    costeReal += impReal;

    if (part.estado === 'EJECUTADA') {
      numPartidasCompletadas++;
    }
  }

  // Si existe presupuesto adjudicado formal, ese fija el techo del contrato
  const basePresupuesto = proyecto.presupuestoAdjudicadoImporte || presupuestoPrevisto;
  const desviacionCoste = costeReal - basePresupuesto;
  const porcentajeEjecucion = partidas.length > 0 ? Math.round((numPartidasCompletadas / partidas.length) * 100) : 0;

  return {
    presupuestoPrevisto: Math.round(presupuestoPrevisto * 100) / 100,
    costeReal: Math.round(costeReal * 100) / 100,
    desviacionCoste: Math.round(desviacionCoste * 100) / 100,
    numPartidas: partidas.length,
    numPartidasCompletadas,
    porcentajeEjecucion,
  };
}

export function crearProyectoDesdeNecesidad(params: {
  necesidad: NecesidadReforma;
  titulo?: string;
  alcance?: string;
  partidasIniciales?: Omit<PartidaReforma, 'id'>[];
  fechaPrevistaInicio?: string;
  fechaPrevistaFin?: string;
  usuarioNombre?: string;
}): ProyectoReforma {
  const { necesidad, titulo, alcance, partidasIniciales = [], fechaPrevistaInicio, fechaPrevistaFin, usuarioNombre = 'Gestor Operativo' } = params;
  const now = new Date().toISOString();
  const id = nuevoProyectoReformaId(necesidad.inmuebleId);

  const partidasFormateadas: PartidaReforma[] = partidasIniciales.map((p) => ({
    ...p,
    id: nuevaPartidaId(),
    proyectoId: id,
    importeEstimado: Number(p.importeEstimado) || (Number(p.cantidad) * Number(p.precioEstimado)) || 0,
    estado: p.estado || 'PENDIENTE',
  }));

  const proyectoBase: ProyectoReforma = {
    id,
    inmuebleId: necesidad.inmuebleId,
    inmuebleDireccion: necesidad.inmuebleDireccion,
    propietarioId: necesidad.propietarioId,
    necesidadId: necesidad.id,
    incidenciaId: necesidad.incidenciaId,
    expedienteId: necesidad.expedienteId,
    titulo: titulo?.trim() || `Proyecto: ${necesidad.titulo}`,
    descripcion: necesidad.descripcion,
    alcance: alcance || necesidad.observaciones,
    categoria: necesidad.categoria,
    tipoReforma: necesidad.categoria,
    fechaPrevistaInicio,
    fechaPrevistaFin,
    estado: 'PENDIENTE',
    prioridad: necesidad.prioridad,
    partidas: partidasFormateadas,
    presupuestoPrevisto: 0,
    costeReal: 0,
    desviacionCoste: 0,
    ordenesTrabajoIds: [],
    presupuestosIds: [],
    gastosIds: [],
    documentos: necesidad.documentos || [],
    fotosAntes: necesidad.fotos || [],
    fotosDurante: [],
    fotosDespues: [],
    historial: [
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PROYECTO_CREADO',
        estadoNuevo: 'PENDIENTE',
        observacion: `Proyecto de reforma formalizado a partir de la necesidad #${necesidad.id}`,
      }),
    ],
    creadoPor: usuarioNombre,
    actualizadoPor: usuarioNombre,
    createdAt: now,
    updatedAt: now,
  };

  const totales = calcularTotalesProyectoReforma(proyectoBase);
  proyectoBase.presupuestoPrevisto = totales.presupuestoPrevisto;
  proyectoBase.costeReal = totales.costeReal;
  proyectoBase.desviacionCoste = totales.desviacionCoste;

  return proyectoBase;
}

export function crearProyectoReformaDirecto(params: {
  inmuebleId: string;
  propietarioId: string;
  titulo: string;
  descripcion: string;
  alcance?: string;
  categoria?: CategoriaReforma | string;
  prioridad?: PrioridadIncidencia;
  inmuebleDireccion?: string;
  partidas?: Omit<PartidaReforma, 'id'>[];
  fechaPrevistaInicio?: string;
  fechaPrevistaFin?: string;
  usuarioNombre?: string;
}): ProyectoReforma {
  const { inmuebleId, propietarioId, titulo, descripcion, alcance, categoria = 'INTEGRAL', prioridad = 'NORMAL', inmuebleDireccion, partidas = [], fechaPrevistaInicio, fechaPrevistaFin, usuarioNombre = 'Gestor Operativo' } = params;
  const now = new Date().toISOString();
  const id = nuevoProyectoReformaId(inmuebleId);

  const partidasFormateadas: PartidaReforma[] = partidas.map((p) => ({
    ...p,
    id: nuevaPartidaId(),
    proyectoId: id,
    importeEstimado: Number(p.importeEstimado) || (Number(p.cantidad) * Number(p.precioEstimado)) || 0,
    estado: p.estado || 'PENDIENTE',
  }));

  const proyecto: ProyectoReforma = {
    id,
    inmuebleId,
    inmuebleDireccion,
    propietarioId,
    titulo: titulo.trim(),
    descripcion: descripcion.trim(),
    alcance,
    categoria,
    tipoReforma: categoria,
    prioridad,
    fechaPrevistaInicio,
    fechaPrevistaFin,
    estado: 'PENDIENTE',
    partidas: partidasFormateadas,
    presupuestoPrevisto: 0,
    costeReal: 0,
    desviacionCoste: 0,
    ordenesTrabajoIds: [],
    presupuestosIds: [],
    gastosIds: [],
    documentos: [],
    fotosAntes: [],
    fotosDurante: [],
    fotosDespues: [],
    historial: [
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PROYECTO_CREADO',
        estadoNuevo: 'PENDIENTE',
        observacion: `Proyecto de reforma "${titulo}" registrado directamente.`,
      }),
    ],
    creadoPor: usuarioNombre,
    actualizadoPor: usuarioNombre,
    createdAt: now,
    updatedAt: now,
  };

  const totales = calcularTotalesProyectoReforma(proyecto);
  proyecto.presupuestoPrevisto = totales.presupuestoPrevisto;
  proyecto.costeReal = totales.costeReal;
  proyecto.desviacionCoste = totales.desviacionCoste;

  return proyecto;
}

export function agregarPartidaAProyecto(params: {
  proyecto: ProyectoReforma;
  partida: Omit<PartidaReforma, 'id'>;
  usuarioNombre?: string;
}): ProyectoReforma {
  const { proyecto, partida, usuarioNombre = 'Gestor Operativo' } = params;
  const now = new Date().toISOString();
  const nuevaPartida: PartidaReforma = {
    ...partida,
    id: nuevaPartidaId(),
    proyectoId: proyecto.id,
    importeEstimado: Number(partida.importeEstimado) || (Number(partida.cantidad) * Number(partida.precioEstimado)) || 0,
    estado: partida.estado || 'PENDIENTE',
  };

  const partidas = [...(proyecto.partidas || []), nuevaPartida];
  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    partidas,
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PARTIDA_ANADIDA',
        partidaId: nuevaPartida.id,
        importe: nuevaPartida.importeEstimado,
        observacion: `Partida añadida: ${nuevaPartida.concepto} (${nuevaPartida.cantidad} ${nuevaPartida.unidad} × ${nuevaPartida.precioEstimado} € = ${nuevaPartida.importeEstimado} €)`,
      }),
    ],
    updatedAt: now,
  };

  const totales = calcularTotalesProyectoReforma(proyectoActualizado);
  proyectoActualizado.presupuestoPrevisto = totales.presupuestoPrevisto;
  proyectoActualizado.costeReal = totales.costeReal;
  proyectoActualizado.desviacionCoste = totales.desviacionCoste;

  return proyectoActualizado;
}

export function modificarPartidaProyecto(params: {
  proyecto: ProyectoReforma;
  partidaId: string;
  cambios: Partial<PartidaReforma>;
  usuarioNombre?: string;
}): ProyectoReforma {
  const { proyecto, partidaId, cambios, usuarioNombre = 'Gestor Operativo' } = params;
  const now = new Date().toISOString();

  const partidas = (proyecto.partidas || []).map((p) => {
    if (p.id !== partidaId) return p;
    const actualizada = { ...p, ...cambios };
    if (cambios.cantidad !== undefined || cambios.precioEstimado !== undefined) {
      actualizada.importeEstimado = (Number(actualizada.cantidad) || 0) * (Number(actualizada.precioEstimado) || 0);
    }
    if (cambios.precioReal !== undefined && cambios.importeReal === undefined) {
      actualizada.importeReal = (Number(actualizada.cantidad) || 0) * (Number(actualizada.precioReal) || 0);
    }
    return actualizada;
  });

  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    partidas,
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PARTIDA_MODIFICADA',
        partidaId,
        observacion: `Partida actualizada: ${cambios.concepto || partidaId}`,
      }),
    ],
    updatedAt: now,
  };

  const totales = calcularTotalesProyectoReforma(proyectoActualizado);
  proyectoActualizado.presupuestoPrevisto = totales.presupuestoPrevisto;
  proyectoActualizado.costeReal = totales.costeReal;
  proyectoActualizado.desviacionCoste = totales.desviacionCoste;

  return proyectoActualizado;
}

export function eliminarPartidaProyecto(params: {
  proyecto: ProyectoReforma;
  partidaId: string;
  usuarioNombre?: string;
}): ProyectoReforma {
  const { proyecto, partidaId, usuarioNombre = 'Gestor Operativo' } = params;
  const now = new Date().toISOString();
  const eliminada = (proyecto.partidas || []).find((p) => p.id === partidaId);
  const partidas = (proyecto.partidas || []).filter((p) => p.id !== partidaId);

  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    partidas,
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PARTIDA_ELIMINADA',
        partidaId,
        observacion: `Partida eliminada: ${eliminada?.concepto || partidaId}`,
      }),
    ],
    updatedAt: now,
  };

  const totales = calcularTotalesProyectoReforma(proyectoActualizado);
  proyectoActualizado.presupuestoPrevisto = totales.presupuestoPrevisto;
  proyectoActualizado.costeReal = totales.costeReal;
  proyectoActualizado.desviacionCoste = totales.desviacionCoste;

  return proyectoActualizado;
}

// =========================================================================
// INTEGRACIÓN CON PRESUPUESTOS (PresupuestoProfesional)
// =========================================================================

export function crearPresupuestoParaProyecto(params: {
  proyecto: ProyectoReforma;
  profesional: Profesional;
  partidas?: PartidaReforma[];
  validez?: string;
  porcentajeIva?: number;
  descripcion?: string;
  usuarioNombre?: string;
}): PresupuestoProfesional {
  const { proyecto, profesional, partidas, validez = '30 días', porcentajeIva = 21, descripcion, usuarioNombre = 'Gestor Operativo' } = params;
  const now = new Date().toISOString();
  const id = `ppt_ref_${proyecto.id}_${profesional.id}_${Date.now()}`;

  const partidasOrigen = partidas || proyecto.partidas || [];
  const partidasPresupuesto = partidasOrigen.map((p, idx) => ({
    id: `part_ppt_${idx + 1}`,
    concepto: p.concepto,
    cantidad: p.cantidad || 1,
    precioUnitario: p.precioEstimado || 0,
    importe: p.importeEstimado || ((p.cantidad || 1) * (p.precioEstimado || 0)),
  }));

  const totales = calcularTotalesPresupuesto(partidasPresupuesto, porcentajeIva);

  const nuevoPresupuesto: PresupuestoProfesional = {
    id,
    numeroPresupuesto: `PPT-REF-${Date.now().toString().slice(-6)}`,
    trabajoId: proyecto.id,
    proyectoId: proyecto.id,
    profesionalId: profesional.id,
    profesionalNombre: profesional.nombreComercial || profesional.nombre,
    propietarioId: proyecto.propietarioId,
    inmuebleId: proyecto.inmuebleId,
    inmuebleDireccion: proyecto.inmuebleDireccion,
    fecha: now,
    fechaPresupuesto: now,
    importeBase: totales.importeBase,
    iva: totales.iva,
    porcentajeIva,
    importeTotal: totales.importeTotal,
    importePresupuestado: totales.importeTotal,
    validez,
    descripcion: descripcion || `Presupuesto para reforma: ${proyecto.titulo}`,
    partidas: partidasPresupuesto,
    estado: 'RECIBIDO',
    version: 1,
    historialDecision: [
      crearItemHistorialPresupuesto({
        usuario: usuarioNombre,
        accion: 'CREACION',
        estadoAnterior: 'RECIBIDO',
        estadoNuevo: 'RECIBIDO',
        version: 1,
        importeTotal: totales.importeTotal,
        partidasSnapshot: partidasPresupuesto,
        observaciones: `Propuesta económica de reforma emitida por ${profesional.nombreComercial || profesional.nombre}`,
      }),
    ],
    creadoPor: usuarioNombre,
    actualizadoPor: usuarioNombre,
    createdAt: now,
    updatedAt: now,
  };

  return nuevoPresupuesto;
}

export function compararPresupuestosProyecto(presupuestos: PresupuestoProfesional[]): {
  presupuestos: PresupuestoProfesional[];
  importeMinimo: number;
  importeMaximo: number;
  importeMedio: number;
  totalPropuestas: number;
  propuestasAceptadas: number;
  propuestasRechazadas: number;
  propuestasEnRevision: number;
} {
  if (!presupuestos || presupuestos.length === 0) {
    return {
      presupuestos: [],
      importeMinimo: 0,
      importeMaximo: 0,
      importeMedio: 0,
      totalPropuestas: 0,
      propuestasAceptadas: 0,
      propuestasRechazadas: 0,
      propuestasEnRevision: 0,
    };
  }

  const importes = presupuestos.map((p) => p.importeTotal);
  const importeMinimo = Math.min(...importes);
  const importeMaximo = Math.max(...importes);
  const suma = importes.reduce((acc, curr) => acc + curr, 0);
  const importeMedio = Math.round((suma / importes.length) * 100) / 100;

  const propuestasAceptadas = presupuestos.filter((p) => p.estado === 'ACEPTADO').length;
  const propuestasRechazadas = presupuestos.filter((p) => p.estado === 'RECHAZADO').length;
  const propuestasEnRevision = presupuestos.filter((p) => ['RECIBIDO', 'EN_REVISION', 'EN_NEGOCIACION'].includes(p.estado)).length;

  return {
    presupuestos,
    importeMinimo,
    importeMaximo,
    importeMedio,
    totalPropuestas: presupuestos.length,
    propuestasAceptadas,
    propuestasRechazadas,
    propuestasEnRevision,
  };
}

export function seleccionarPresupuestoProyecto(params: {
  proyecto: ProyectoReforma;
  presupuestoSeleccionado: PresupuestoProfesional;
  presupuestosDisponibles: PresupuestoProfesional[];
  usuarioNombre: string;
  motivoDecision: string;
}): {
  proyectoActualizado: ProyectoReforma;
  presupuestosActualizados: PresupuestoProfesional[];
} {
  const { proyecto, presupuestoSeleccionado, presupuestosDisponibles, usuarioNombre, motivoDecision } = params;
  const now = new Date().toISOString();

  if (!motivoDecision || !motivoDecision.trim()) {
    throw new Error('Debe justificarse formalmente el motivo de la adjudicación del presupuesto de reforma.');
  }

  // 1. Actualizar el presupuesto seleccionado a ACEPTADO
  // 2. Marcar las demás propuestas recibidas como RECHAZADO (conservándolas intactas en base de datos)
  const presupuestosActualizados: PresupuestoProfesional[] = presupuestosDisponibles.map((ppt) => {
    if (ppt.id === presupuestoSeleccionado.id) {
      return {
        ...ppt,
        estado: 'ACEPTADO',
        fechaDecision: now,
        fechaAceptacion: now,
        decididoPor: usuarioNombre,
        historialDecision: [
          ...(ppt.historialDecision || []),
          crearItemHistorialPresupuesto({
            usuario: usuarioNombre,
            accion: 'APROBACION',
            estadoAnterior: ppt.estado,
            estadoNuevo: 'ACEPTADO',
            version: ppt.version || 1,
            importeTotal: ppt.importeTotal,
            observaciones: `Presupuesto adjudicado para el proyecto de reforma: ${motivoDecision}`,
          }),
        ],
        updatedAt: now,
      };
    }

    if (ppt.estado !== 'ACEPTADO' && ppt.estado !== 'RECHAZADO') {
      return {
        ...ppt,
        estado: 'RECHAZADO',
        fechaDecision: now,
        motivoRechazo: `Propuesta descartada en favor del presupuesto adjudicado #${presupuestoSeleccionado.numeroPresupuesto || presupuestoSeleccionado.id}.`,
        decididoPor: usuarioNombre,
        historialDecision: [
          ...(ppt.historialDecision || []),
          crearItemHistorialPresupuesto({
            usuario: usuarioNombre,
            accion: 'RECHAZO',
            estadoAnterior: ppt.estado,
            estadoNuevo: 'RECHAZADO',
            version: ppt.version || 1,
            importeTotal: ppt.importeTotal,
            observaciones: `Descartado en comparativa competitiva: Adjudicado a ${presupuestoSeleccionado.profesionalNombre}.`,
          }),
        ],
        updatedAt: now,
      };
    }

    return ppt;
  });

  // 3. Actualizar el Proyecto de Reforma vinculando la adjudicación
  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    estado: 'ADJUDICADO',
    presupuestoAdjudicadoId: presupuestoSeleccionado.id,
    presupuestoAdjudicadoImporte: presupuestoSeleccionado.importeTotal,
    profesionalPrincipalId: presupuestoSeleccionado.profesionalId,
    profesionalPrincipalNombre: presupuestoSeleccionado.profesionalNombre,
    presupuestosIds: Array.from(new Set([...(proyecto.presupuestosIds || []), ...presupuestosDisponibles.map((p) => p.id)])),
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PRESUPUESTO_SELECCIONADO',
        estadoAnterior: proyecto.estado,
        estadoNuevo: 'ADJUDICADO',
        presupuestoId: presupuestoSeleccionado.id,
        profesionalId: presupuestoSeleccionado.profesionalId,
        importe: presupuestoSeleccionado.importeTotal,
        motivo: motivoDecision.trim(),
        observacion: `Presupuesto de ${presupuestoSeleccionado.profesionalNombre} adjudicado por ${presupuestoSeleccionado.importeTotal} €. Motivo: ${motivoDecision.trim()}`,
      }),
    ],
    updatedAt: now,
  };

  const totales = calcularTotalesProyectoReforma(proyectoActualizado);
  proyectoActualizado.presupuestoPrevisto = totales.presupuestoPrevisto;
  proyectoActualizado.costeReal = totales.costeReal;
  proyectoActualizado.desviacionCoste = totales.desviacionCoste;

  return {
    proyectoActualizado,
    presupuestosActualizados,
  };
}

// =========================================================================
// ASIGNACIÓN Y PROFESIONALES
// =========================================================================

export function asignarProfesionalAProyecto(params: {
  proyecto: ProyectoReforma;
  profesional: Profesional;
  usuarioNombre: string;
  motivo?: string;
  partidaId?: string;
}): ProyectoReforma {
  const { proyecto, profesional, usuarioNombre, motivo, partidaId } = params;
  const now = new Date().toISOString();
  const profNombre = profesional.nombreComercial || profesional.nombre || 'Profesional';

  let partidas = proyecto.partidas || [];
  if (partidaId) {
    partidas = partidas.map((p) =>
      p.id === partidaId
        ? { ...p, profesionalId: profesional.id, profesionalNombre: profNombre, estado: 'EN_EJECUCION' }
        : p
    );
  }

  const asignadosPrevios = proyecto.profesionalesAsignados || [];
  const yaRegistrado = asignadosPrevios.some((a) => a.profesionalId === profesional.id && a.partidaId === partidaId);
  const nuevosAsignados = yaRegistrado
    ? asignadosPrevios
    : [
        ...asignadosPrevios,
        {
          profesionalId: profesional.id,
          nombre: profNombre,
          especialidad: profesional.especialidades?.[0] || 'Reforma',
          partidaId,
        },
      ];

  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    profesionalPrincipalId: proyecto.profesionalPrincipalId || profesional.id,
    profesionalPrincipalNombre: proyecto.profesionalPrincipalNombre || profNombre,
    profesionalesAsignados: nuevosAsignados,
    partidas,
    estado: proyecto.estado === 'PENDIENTE' || proyecto.estado === 'PRESUPUESTANDO' ? 'ASIGNADO' : proyecto.estado,
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PROFESIONAL_ASIGNADO',
        profesionalId: profesional.id,
        partidaId,
        motivo,
        observacion: `Profesional ${profNombre} asignado al proyecto${partidaId ? ` (Partida #${partidaId})` : ''}.${motivo ? ` Motivo: ${motivo}` : ''}`,
      }),
    ],
    updatedAt: now,
  };

  return proyectoActualizado;
}

// =========================================================================
// ÓRDENES DE TRABAJO (TrabajoProfesional) DESDE PROYECTO
// =========================================================================

export function generarOrdenTrabajoDesdePartida(params: {
  proyecto: ProyectoReforma;
  partidaId: string;
  profesional?: Profesional;
  usuarioNombre?: string;
}): {
  trabajo: TrabajoProfesional;
  proyectoActualizado: ProyectoReforma;
} {
  const { proyecto, partidaId, profesional, usuarioNombre = 'Gestor Operativo' } = params;
  const partida = (proyecto.partidas || []).find((p) => p.id === partidaId);
  if (!partida) {
    throw new Error(`No se encontró la partida con ID ${partidaId} en el proyecto de reforma.`);
  }

  const now = new Date().toISOString();
  const trabajoId = `ot_ref_${proyecto.id}_${partidaId}_${Date.now()}`;
  const profId = profesional?.id || partida.profesionalId || proyecto.profesionalPrincipalId;
  const profNombre = profesional?.nombreComercial || profesional?.nombre || partida.profesionalNombre || proyecto.profesionalPrincipalNombre;

  const nuevoTrabajo: TrabajoProfesional = {
    id: trabajoId,
    propietarioId: proyecto.propietarioId,
    inmuebleId: proyecto.inmuebleId,
    inmuebleDireccion: proyecto.inmuebleDireccion,
    incidenciaId: proyecto.incidenciaId,
    proyectoId: proyecto.id,
    partidaId: partida.id,
    titulo: `Reforma [${proyecto.titulo}]: ${partida.concepto}`,
    descripcion: `Ejecución técnica de la partida "${partida.concepto}" (${partida.cantidad} ${partida.unidad}). Categoría: ${partida.categoria}. Alcance: ${proyecto.alcance || proyecto.descripcion}`,
    categoria: partida.categoria || proyecto.categoria || 'Reforma',
    servicioRequerido: partida.concepto,
    tipoTrabajo: 'REFORMA',
    prioridad: proyecto.prioridad || 'NORMAL',
    estado: profId ? 'ASIGNADO' : 'PENDIENTE',
    fechaSolicitud: now,
    fechaAsignacion: profId ? now : undefined,
    profesionalId: profId,
    profesionalNombre: profNombre,
    profesionalTelefono: profesional?.telefono,
    profesionalEmail: profesional?.email,
    importeEstimado: partida.importeEstimado,
    presupuestoId: proyecto.presupuestoAdjudicadoId,
    creadoPor: usuarioNombre,
    actualizadoPor: usuarioNombre,
    historial: [
      {
        id: `hist_ot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fecha: now,
        usuario: usuarioNombre,
        accion: 'TRABAJO_CREADO',
        estadoNuevo: profId ? 'ASIGNADO' : 'PENDIENTE',
        observacion: `Orden de trabajo generada para la partida de reforma "${partida.concepto}".`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const partidasActualizadas = (proyecto.partidas || []).map((p) =>
    p.id === partidaId
      ? { ...p, ordenTrabajoId: trabajoId, estado: (profId ? 'EN_EJECUCION' : 'PRESUPUESTADA') as EstadoPartidaReforma }
      : p
  );

  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    partidas: partidasActualizadas,
    ordenesTrabajoIds: Array.from(new Set([...(proyecto.ordenesTrabajoIds || []), trabajoId])),
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'OT_GENERADA',
        partidaId,
        ordenTrabajoId: trabajoId,
        profesionalId: profId,
        observacion: `Orden de trabajo técnica (#${trabajoId}) generada para la partida "${partida.concepto}".`,
      }),
    ],
    updatedAt: now,
  };

  return {
    trabajo: nuevoTrabajo,
    proyectoActualizado,
  };
}

export function generarOrdenTrabajoGlobalProyecto(params: {
  proyecto: ProyectoReforma;
  profesional: Profesional;
  usuarioNombre?: string;
}): {
  trabajo: TrabajoProfesional;
  proyectoActualizado: ProyectoReforma;
} {
  const { proyecto, profesional, usuarioNombre = 'Gestor Operativo' } = params;
  const now = new Date().toISOString();
  const trabajoId = `ot_master_ref_${proyecto.id}_${Date.now()}`;
  const profNombre = profesional.nombreComercial || profesional.nombre;

  const nuevoTrabajo: TrabajoProfesional = {
    id: trabajoId,
    propietarioId: proyecto.propietarioId,
    inmuebleId: proyecto.inmuebleId,
    inmuebleDireccion: proyecto.inmuebleDireccion,
    incidenciaId: proyecto.incidenciaId,
    proyectoId: proyecto.id,
    titulo: `Ejecución Integral de Reforma: ${proyecto.titulo}`,
    descripcion: `Intervención completa de reforma. Partidas incluidas: ${(proyecto.partidas || []).map((p) => p.concepto).join(', ')}. Alcance: ${proyecto.alcance || proyecto.descripcion}`,
    categoria: proyecto.categoria || 'REFORMA',
    servicioRequerido: proyecto.titulo,
    tipoTrabajo: 'REFORMA',
    prioridad: proyecto.prioridad || 'NORMAL',
    estado: 'ASIGNADO',
    fechaSolicitud: now,
    fechaAsignacion: now,
    profesionalId: profesional.id,
    profesionalNombre: profNombre,
    profesionalTelefono: profesional.telefono,
    profesionalEmail: profesional.email,
    importeEstimado: proyecto.presupuestoAdjudicadoImporte || proyecto.presupuestoPrevisto,
    presupuestoId: proyecto.presupuestoAdjudicadoId,
    creadoPor: usuarioNombre,
    actualizadoPor: usuarioNombre,
    historial: [
      {
        id: `hist_ot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        fecha: now,
        usuario: usuarioNombre,
        accion: 'TRABAJO_CREADO',
        estadoNuevo: 'ASIGNADO',
        observacion: `Orden de trabajo global generada para el proyecto de reforma.`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const partidasActualizadas = (proyecto.partidas || []).map((p) => ({
    ...p,
    ordenTrabajoId: trabajoId,
    profesionalId: profesional.id,
    profesionalNombre: profNombre,
    estado: 'EN_EJECUCION' as EstadoPartidaReforma,
  }));

  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    estado: 'EN_EJECUCION',
    partidas: partidasActualizadas,
    ordenesTrabajoIds: Array.from(new Set([...(proyecto.ordenesTrabajoIds || []), trabajoId])),
    profesionalPrincipalId: profesional.id,
    profesionalPrincipalNombre: profNombre,
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'EJECUCION_INICIADA',
        ordenTrabajoId: trabajoId,
        profesionalId: profesional.id,
        observacion: `Iniciada la ejecución integral de obra con la orden master #${trabajoId}.`,
      }),
    ],
    updatedAt: now,
  };

  return {
    trabajo: nuevoTrabajo,
    proyectoActualizado,
  };
}

// =========================================================================
// COSTES REALES Y LIQUIDACIÓN EN GASTOS (Gasto)
// =========================================================================

export function registrarCosteRealPartida(params: {
  proyecto: ProyectoReforma;
  partidaId: string;
  costeReal: number;
  profesionalId?: string;
  ordenTrabajoId?: string;
  usuarioNombre?: string;
}): ProyectoReforma {
  const { proyecto, partidaId, costeReal, profesionalId, ordenTrabajoId, usuarioNombre = 'Gestor Operativo' } = params;
  const now = new Date().toISOString();

  const partidas = (proyecto.partidas || []).map((p) => {
    if (p.id !== partidaId) return p;
    return {
      ...p,
      importeReal: Number(costeReal) || 0,
      precioReal: (Number(costeReal) || 0) / (Number(p.cantidad) || 1),
      estado: 'EJECUTADA' as EstadoPartidaReforma,
      profesionalId: profesionalId || p.profesionalId,
      ordenTrabajoId: ordenTrabajoId || p.ordenTrabajoId,
    };
  });

  const partidaAfectada = (proyecto.partidas || []).find((p) => p.id === partidaId);

  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    partidas,
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'COSTE_REGISTRADO',
        partidaId,
        ordenTrabajoId,
        profesionalId,
        importe: costeReal,
        observacion: `Coste real liquidado para la partida "${partidaAfectada?.concepto || partidaId}": ${costeReal} € (Estimado: ${partidaAfectada?.importeEstimado || 0} €).`,
      }),
    ],
    updatedAt: now,
  };

  const totales = calcularTotalesProyectoReforma(proyectoActualizado);
  proyectoActualizado.presupuestoPrevisto = totales.presupuestoPrevisto;
  proyectoActualizado.costeReal = totales.costeReal;
  proyectoActualizado.desviacionCoste = totales.desviacionCoste;

  return proyectoActualizado;
}

export function liquidarGastoDesdeProyecto(params: {
  proyecto: ProyectoReforma;
  gastosExistentes: Gasto[];
  conceptoGasto?: string;
  aCargoDe?: 'arrendador' | 'arrendatario';
  deducible?: boolean;
  fechaPago?: string;
  usuarioNombre?: string;
}): {
  gasto: Gasto;
  yaExiste: boolean;
  proyectoActualizado: ProyectoReforma;
} {
  const {
    proyecto,
    gastosExistentes = [],
    conceptoGasto,
    aCargoDe = 'arrendador',
    deducible = true,
    fechaPago,
    usuarioNombre = 'Gestor Económico',
  } = params;

  const now = new Date().toISOString();
  const fechaHoy = now.split('T')[0];

  // Idempotencia estricta: Comprobar si ya existe un gasto liquidado para este proyecto de reforma
  const gastoPrevio = gastosExistentes.find(
    (g) =>
      g.proyectoId === proyecto.id ||
      g.origenId === proyecto.id ||
      (g.concepto && g.concepto.includes(`[Reforma #${proyecto.id}]`))
  );

  if (gastoPrevio) {
    // Si ya existe, actualizamos importe respetando idempotencia
    const gastoActualizado: Gasto = {
      ...gastoPrevio,
      importe: proyecto.costeReal || gastoPrevio.importe,
      proveedor: proyecto.profesionalPrincipalNombre || gastoPrevio.proveedor,
      updatedAt: now,
    };

    return {
      gasto: gastoActualizado,
      yaExiste: true,
      proyectoActualizado: proyecto,
    };
  }

  const gastoId = `gas_ref_${proyecto.id}_${Date.now()}`;
  const conceptoFinal = conceptoGasto?.trim() || `Liquidación de Obra y Reforma: ${proyecto.titulo} [Reforma #${proyecto.id}]`;

  const nuevoGasto: Gasto = {
    id: gastoId,
    inmuebleId: proyecto.inmuebleId,
    propietarioId: proyecto.propietarioId,
    proyectoId: proyecto.id,
    incidenciaId: proyecto.incidenciaId,
    profesionalId: proyecto.profesionalPrincipalId,
    presupuestoId: proyecto.presupuestoAdjudicadoId,
    tipo: 'EXPLOTACION',
    categoria: 'REPARACION',
    concepto: conceptoFinal,
    proveedor: proyecto.profesionalPrincipalNombre || 'Contratista / Profesionales de Reforma',
    importe: Number(proyecto.costeReal) || Number(proyecto.presupuestoAdjudicadoImporte) || Number(proyecto.presupuestoPrevisto) || 0,
    estado: 'PAGADO',
    aCargoDe,
    deducible,
    fecha: fechaPago || fechaHoy,
    fechaPago: fechaPago || fechaHoy,
    fechaDevengo: fechaHoy,
    periodoMesAnio: (fechaPago || fechaHoy).slice(0, 7),
    origen: 'ORDEN_TRABAJO',
    origenId: proyecto.id,
    creadoPor: usuarioNombre,
    createdAt: now,
    updatedAt: now,
  };

  const proyectoActualizado: ProyectoReforma = {
    ...proyecto,
    gastosIds: Array.from(new Set([...(proyecto.gastosIds || []), gastoId])),
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'GASTO_GENERADO',
        gastoId,
        importe: nuevoGasto.importe,
        observacion: `Gasto contable de explotación generado automáticamente (#${gastoId}) por importe de ${nuevoGasto.importe} €.`,
      }),
    ],
    updatedAt: now,
  };

  return {
    gasto: nuevoGasto,
    yaExiste: false,
    proyectoActualizado,
  };
}

// =========================================================================
// CIERRE DE REFORMA E IMPACTO PATRIMONIAL
// =========================================================================

export function finalizarProyectoReforma(params: {
  proyecto: ProyectoReforma;
  usuarioNombre: string;
  observacionesCierre?: string;
  gastos?: Gasto[];
  valoracionActualInmueble?: number;
}): ProyectoReforma {
  const { proyecto, usuarioNombre, observacionesCierre, gastos = [], valoracionActualInmueble } = params;
  const now = new Date().toISOString();

  if (proyecto.estado === 'FINALIZADO' || proyecto.estado === 'FINALIZADA') {
    return proyecto;
  }

  const totales = calcularTotalesProyectoReforma(proyecto);
  const presupuestoSeleccionado = proyecto.presupuestoAdjudicadoImporte || totales.presupuestoPrevisto;
  const costeRealFinal = totales.costeReal;
  const desviacionTotal = costeRealFinal - presupuestoSeleccionado;
  const desviacionPorcentaje = presupuestoSeleccionado > 0 ? Math.round((desviacionTotal / presupuestoSeleccionado) * 10000) / 100 : 0;

  const gastosRelacionados = gastos.filter(
    (g) => g.proyectoId === proyecto.id || g.origenId === proyecto.id || proyecto.gastosIds?.includes(g.id)
  );
  const gastosGeneradosTotal = gastosRelacionados.reduce((acc, g) => acc + (Number(g.importe) || 0), 0) || costeRealFinal;

  const numPartidasEjecutadas = (proyecto.partidas || []).filter((p) => p.estado === 'EJECUTADA').length;

  const profesionalesMap = new Map<string, { id: string; nombre: string; partidas: string[] }>();
  for (const part of proyecto.partidas || []) {
    if (part.profesionalId) {
      const existing = profesionalesMap.get(part.profesionalId) || {
        id: part.profesionalId,
        nombre: part.profesionalNombre || 'Profesional',
        partidas: [],
      };
      existing.partidas.push(part.concepto);
      profesionalesMap.set(part.profesionalId, existing);
    }
  }
  if (proyecto.profesionalPrincipalId && !profesionalesMap.has(proyecto.profesionalPrincipalId)) {
    profesionalesMap.set(proyecto.profesionalPrincipalId, {
      id: proyecto.profesionalPrincipalId,
      nombre: proyecto.profesionalPrincipalNombre || 'Profesional Principal',
      partidas: ['Dirección General de Reforma'],
    });
  }

  const resumenCierre: ResumenCierreReforma = {
    fechaCierre: now,
    presupuestoInicial: totales.presupuestoPrevisto,
    presupuestoSeleccionado,
    costeRealFinal,
    desviacionTotal,
    desviacionPorcentaje,
    gastosGeneradosTotal,
    numPartidasEjecutadas,
    numOTsCompletadas: (proyecto.ordenesTrabajoIds || []).length,
    profesionalesParticipantes: Array.from(profesionalesMap.values()),
    observacionesCierre,
    cerradoPor: usuarioNombre,
  };

  const impactoPatrimonial: ImpactoPatrimonialReforma = {
    costeTotalReforma: costeRealFinal,
    fechaCierreReforma: now,
    inmuebleId: proyecto.inmuebleId,
    valoracionPreviaInmueble: valoracionActualInmueble,
    notas: 'Registro neutral de coste de reforma. La valoración posterior requerirá tasación o comparables de mercado.',
  };

  const partidasFinalizadas = (proyecto.partidas || []).map((p) =>
    p.estado === 'EN_EJECUCION' || p.estado === 'PRESUPUESTADA' || p.estado === 'PENDIENTE'
      ? { ...p, estado: 'EJECUTADA' as EstadoPartidaReforma }
      : p
  );

  return {
    ...proyecto,
    estado: 'FINALIZADO',
    fechaRealFin: now,
    fechaCierre: now,
    partidas: partidasFinalizadas,
    costeReal: costeRealFinal,
    desviacionCoste: desviacionTotal,
    resumenCierre,
    impactoPatrimonial,
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PROYECTO_FINALIZADO',
        estadoAnterior: proyecto.estado,
        estadoNuevo: 'FINALIZADO',
        importe: costeRealFinal,
        observacion: `Reforma finalizada formalmente. Coste real liquidado: ${costeRealFinal} € (Desviación: ${desviacionTotal > 0 ? `+${desviacionTotal}` : desviacionTotal} €).`,
      }),
    ],
    updatedAt: now,
  };
}

export function cancelarProyectoReforma(params: {
  proyecto: ProyectoReforma;
  motivo: string;
  usuarioNombre: string;
}): ProyectoReforma {
  const { proyecto, motivo, usuarioNombre } = params;
  const now = new Date().toISOString();

  if (proyecto.estado === 'FINALIZADO' || proyecto.estado === 'FINALIZADA') {
    throw new Error('No se puede cancelar un proyecto de reforma que ya ha sido finalizado.');
  }

  const partidasCanceladas = (proyecto.partidas || []).map((p) =>
    p.estado !== 'EJECUTADA' ? { ...p, estado: 'CANCELADA' as EstadoPartidaReforma } : p
  );

  return {
    ...proyecto,
    estado: 'CANCELADO',
    partidas: partidasCanceladas,
    historial: [
      ...(proyecto.historial || []),
      crearItemHistorialProyecto({
        usuario: usuarioNombre,
        accion: 'PROYECTO_CANCELADO',
        estadoAnterior: proyecto.estado,
        estadoNuevo: 'CANCELADO',
        motivo: motivo.trim(),
        observacion: `Proyecto de reforma cancelado: ${motivo.trim()}`,
      }),
    ],
    updatedAt: now,
  };
}

export function calcularImpactoPatrimonialReforma(params: {
  proyecto: ProyectoReforma;
  inmueble: Inmueble;
  valoracionPosterior?: number;
  fechaValoracionPosterior?: string;
  notas?: string;
}): ImpactoPatrimonialReforma {
  const { proyecto, inmueble, valoracionPosterior, fechaValoracionPosterior, notas } = params;
  const now = new Date().toISOString();

  const valoracionPrevia = inmueble.valoracionEstimada || inmueble.valorAdquisicion;
  const variacionValoracion =
    valoracionPosterior !== undefined && valoracionPrevia !== undefined
      ? valoracionPosterior - valoracionPrevia
      : undefined;

  return {
    costeTotalReforma: proyecto.costeReal || proyecto.presupuestoAdjudicadoImporte || proyecto.presupuestoPrevisto,
    gastoAsociadoId: proyecto.gastosIds?.[0],
    fechaCierreReforma: proyecto.fechaCierre || now,
    inmuebleId: inmueble.id,
    valoracionPreviaInmueble: valoracionPrevia,
    fechaValoracionPrevia: inmueble.fechaAdquisicion,
    valoracionPosteriorInmueble: valoracionPosterior,
    fechaValoracionPosterior: fechaValoracionPosterior || (valoracionPosterior ? now : undefined),
    variacionValoracion,
    notas: notas || 'Comparación temporal informativa entre valor previo y posterior a la reforma. No presupone incremento automático.',
  };
}
