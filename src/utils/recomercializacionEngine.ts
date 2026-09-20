// ============================================================
// FASE 3.0 — Motor de RECOMERCIALIZACIÓN
// Metadatos de la máquina de estados, transiciones permitidas y
// factorías de expedientes. La inspección por IA (3.3), el ROI
// (3.4) y el pricing (3.5) se apoyan sobre estos datos.
// ============================================================

import type {
  CategoriaMejora,
  DestinoInmueble,
  EstadoRecomercializacion,
  EstanciaFoto,
  ExpedienteRecomercializacion,
  FotoInspeccion,
  InmobiliariaDirectorio,
  LeadInmobiliario,
  MejoraROI,
  ModalidadComercializacion,
  PropuestaInmobiliaria,
} from '../types';

export const ESTADOS_RECOMERCIALIZACION: Record<
  EstadoRecomercializacion,
  { label: string; orden: number; color: string; cierre?: boolean }
> = {
  BORRADOR: { label: 'Borrador', orden: 0, color: 'bg-slate-100 text-slate-600' },
  SALIDA_NOTIFICADA: { label: 'Salida notificada', orden: 1, color: 'bg-amber-100 text-amber-800' },
  REVISION_PENDIENTE: { label: 'Revisión pendiente', orden: 2, color: 'bg-orange-100 text-orange-800' },
  FOTOS_ACTUALIZADAS: { label: 'Fotos actualizadas', orden: 3, color: 'bg-sky-100 text-sky-800' },
  VALORACION_COMPLETADA: { label: 'Valoración completada', orden: 4, color: 'bg-teal-100 text-teal-800' },
  DECISION_ESTRATEGIA: { label: 'Decisión de estrategia', orden: 5, color: 'bg-indigo-100 text-indigo-800' },
  EN_COMERCIALIZACION: { label: 'En comercialización', orden: 6, color: 'bg-violet-100 text-violet-800' },
  CERRADO_REARRENDADO: {
    label: 'Cerrado · rearrendado',
    orden: 7,
    color: 'bg-emerald-100 text-emerald-800',
    cierre: true,
  },
  CERRADO_VENDIDO: {
    label: 'Cerrado · vendido',
    orden: 8,
    color: 'bg-emerald-100 text-emerald-800',
    cierre: true,
  },
  CANCELADO: { label: 'Cancelado', orden: 9, color: 'bg-slate-200 text-slate-500', cierre: true },
};

/**
 * Transiciones válidas del ciclo. Se declara de forma explícita para que la UI
 * sólo ofrezca el siguiente paso razonable (máquina de estados controlada).
 */
export const TRANSICIONES_RECOMERCIALIZACION: Record<
  EstadoRecomercializacion,
  EstadoRecomercializacion[]
> = {
  BORRADOR: ['SALIDA_NOTIFICADA', 'CANCELADO'],
  SALIDA_NOTIFICADA: ['REVISION_PENDIENTE', 'CANCELADO'],
  REVISION_PENDIENTE: ['FOTOS_ACTUALIZADAS', 'VALORACION_COMPLETADA', 'CANCELADO'],
  FOTOS_ACTUALIZADAS: ['VALORACION_COMPLETADA', 'REVISION_PENDIENTE', 'CANCELADO'],
  VALORACION_COMPLETADA: ['DECISION_ESTRATEGIA', 'FOTOS_ACTUALIZADAS', 'CANCELADO'],
  DECISION_ESTRATEGIA: ['EN_COMERCIALIZACION', 'CANCELADO'],
  EN_COMERCIALIZACION: ['CERRADO_REARRENDADO', 'CERRADO_VENDIDO', 'DECISION_ESTRATEGIA', 'CANCELADO'],
  CERRADO_REARRENDADO: [],
  CERRADO_VENDIDO: [],
  CANCELADO: ['BORRADOR'],
};

export function puedeTransicionar(
  desde: EstadoRecomercializacion,
  hacia: EstadoRecomercializacion
): boolean {
  return TRANSICIONES_RECOMERCIALIZACION[desde]?.includes(hacia) ?? false;
}

export function esEstadoCierre(estado: EstadoRecomercializacion): boolean {
  return !!ESTADOS_RECOMERCIALIZACION[estado]?.cierre;
}

export const DESTINO_INMUEBLE_LABEL: Record<DestinoInmueble, string> = {
  ALQUILER_TRADICIONAL: 'Alquiler tradicional',
  ALQUILER_HABITACIONES: 'Alquiler por habitaciones',
  ALQUILER_TEMPORAL: 'Alquiler temporal',
  VENTA: 'Venta',
  INDECISO: 'Indeciso',
};

export const MODALIDAD_COMERCIALIZACION_LABEL: Record<ModalidadComercializacion, string> = {
  GESTION_PROPIA: 'Gestión propia',
  INMOBILIARIA: 'Delegar en inmobiliaria',
  AMBAS: 'Híbrida / ambas',
};

export const ESTANCIA_LABEL: Record<EstanciaFoto, string> = {
  salon: 'Salón / Comedor',
  cocina: 'Cocina',
  bano: 'Baños',
  dormitorio: 'Dormitorios',
  terraza: 'Terraza / Balcón',
  exterior: 'Zonas comunes / Exterior',
  otro: 'Otras zonas',
};

// Orden de recorrido sugerido en la inspección visual (FASE 3.2).
export const ESTANCIAS_ORDEN: EstanciaFoto[] = [
  'salon',
  'cocina',
  'bano',
  'dormitorio',
  'terraza',
  'exterior',
  'otro',
];

export function nuevoExpedienteId(inmuebleId: string): string {
  const seg = (inmuebleId || 'inm').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `exp_${seg}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function nuevoFotoInspeccionId(estancia: EstanciaFoto | string): string {
  const seg = (estancia || 'otro').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `foto_${seg}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * FASE 3.2 — Devuelve una copia del expediente con una foto de inspección
 * añadida a la revisión fotográfica (la inicializa si aún no existe).
 * Inmutable: no modifica el expediente de entrada.
 */
export function agregarFotoInspeccion(
  expediente: ExpedienteRecomercializacion,
  foto: FotoInspeccion
): ExpedienteRecomercializacion {
  const actuales = expediente.revisionFotografica?.fotografias ?? [];
  const ahora = new Date().toISOString();
  return {
    ...expediente,
    revisionFotografica: {
      fechaCarga: expediente.revisionFotografica?.fechaCarga || ahora,
      fotografias: [...actuales, foto],
    },
    updatedAt: ahora,
  };
}

/** Devuelve una copia del expediente sin la foto indicada (y borra el objeto de Storage aparte). */
export function quitarFotoInspeccion(
  expediente: ExpedienteRecomercializacion,
  fotoId: string
): ExpedienteRecomercializacion {
  const actuales = expediente.revisionFotografica?.fotografias ?? [];
  const fotografias = actuales.filter((f) => f.id !== fotoId);
  const ahora = new Date().toISOString();
  return {
    ...expediente,
    revisionFotografica: {
      // La revisión sigue considerándose cargada mientras quede alguna foto.
      fechaCarga: expediente.revisionFotografica?.fechaCarga || ahora,
      fotografias,
    },
    updatedAt: ahora,
  };
}

/**
 * FASE 3.3 — Aplica los resultados del diagnóstico de IA a las fotos del
 * expediente (mapa id de foto -> análisis). Inmutable; no toca las fotos que
 * no estén en el mapa.
 */
export function aplicarAnalisisFotos(
  expediente: ExpedienteRecomercializacion,
  analisis: Map<string, FotoInspeccion['analisisIa']>
): ExpedienteRecomercializacion {
  const actuales = expediente.revisionFotografica?.fotografias ?? [];
  const ahora = new Date().toISOString();
  const fotografias = actuales.map((f) =>
    analisis.has(f.id) ? { ...f, analisisIa: analisis.get(f.id) } : f
  );
  return {
    ...expediente,
    revisionFotografica: {
      fechaCarga: expediente.revisionFotografica?.fechaCarga || ahora,
      fotografias,
    },
    updatedAt: ahora,
  };
}

// ============================================================
// FASE 3.4 — REFORMAS Y OPTIMIZACIÓN (SIMULADOR DE ROI)
// ============================================================

export const CATEGORIA_MEJORA_LABEL: Record<CategoriaMejora, string> = {
  PINTURA: 'Pintura y acabados',
  ILUMINACION: 'Iluminación',
  COCINA: 'Cocina',
  BANO: 'Baños',
  SUELOS: 'Suelos',
  MOBILIARIO: 'Mobiliario y decoración',
  LIMPIEZA_PUESTA_A_PUNTO: 'Limpieza y puesta a punto',
  EFICIENCIA_ENERGETICA: 'Eficiencia energética',
  REPARACION: 'Reparaciones',
  OTRA: 'Otras mejoras',
};

export function nuevoMejoraId(): string {
  return `mej_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

const ahoraISO = () => new Date().toISOString();

/** Coste medio estimado de una mejora (punto medio del rango, redondeado). */
export function costeMedioMejora(m: MejoraROI): number {
  const min = Number(m.costeEstimadoMin) || 0;
  const max = Number(m.costeEstimadoMax) || 0;
  if (min > 0 && max > 0) return Math.round((min + max) / 2);
  return Math.round(max || min || 0);
}

/** Payback orientativo en meses: inversión media / incremento de renta mensual. */
export function paybackMejora(m: MejoraROI): number | undefined {
  const renta = Number(m.incrementoRentaMensual) || 0;
  const coste = costeMedioMejora(m);
  if (renta <= 0 || coste <= 0) return undefined;
  return Math.round((coste / renta) * 10) / 10;
}

/**
 * Completa los campos derivados (payback) de una mejora. Inmutable.
 */
export function normalizarMejora(m: MejoraROI): MejoraROI {
  const payback = paybackMejora(m);
  return { ...m, paybackMeses: payback };
}

export function agregarMejora(
  expediente: ExpedienteRecomercializacion,
  mejora: MejoraROI
): ExpedienteRecomercializacion {
  const actuales = expediente.mejorasPropuestas ?? [];
  return {
    ...expediente,
    mejorasPropuestas: [...actuales, normalizarMejora(mejora)],
    updatedAt: ahoraISO(),
  };
}

export function actualizarMejora(
  expediente: ExpedienteRecomercializacion,
  mejora: MejoraROI
): ExpedienteRecomercializacion {
  const actuales = expediente.mejorasPropuestas ?? [];
  const normalizada = normalizarMejora(mejora);
  return {
    ...expediente,
    mejorasPropuestas: actuales.map((m) => (m.id === normalizada.id ? normalizada : m)),
    updatedAt: ahoraISO(),
  };
}

export function quitarMejora(
  expediente: ExpedienteRecomercializacion,
  mejoraId: string
): ExpedienteRecomercializacion {
  const actuales = expediente.mejorasPropuestas ?? [];
  return {
    ...expediente,
    mejorasPropuestas: actuales.filter((m) => m.id !== mejoraId),
    updatedAt: ahoraISO(),
  };
}

export interface EscenarioROI {
  id: 'sin_reforma' | 'parcial' | 'completa';
  label: string;
  descripcion: string;
  numeroMejoras: number;
  inversionMin: number;
  inversionMax: number;
  inversionMedia: number;
  rentaExtraMensual: number;
  rentaExtraAnual: number;
  plusvaliaEstimada: number;
  paybackMeses: number | undefined;
  roiAnualPct: number | undefined;
}

function sumarEscenario(id: EscenarioROI['id'], label: string, descripcion: string, mejoras: MejoraROI[]): EscenarioROI {
  const inversionMin = mejoras.reduce((acc, m) => acc + (Number(m.costeEstimadoMin) || 0), 0);
  const inversionMax = mejoras.reduce((acc, m) => acc + (Number(m.costeEstimadoMax) || 0), 0);
  const inversionMedia = mejoras.reduce((acc, m) => acc + costeMedioMejora(m), 0);
  const rentaExtraMensual = mejoras.reduce((acc, m) => acc + (Number(m.incrementoRentaMensual) || 0), 0);
  const plusvaliaEstimada = mejoras.reduce((acc, m) => acc + (Number(m.incrementoValoracion) || 0), 0);
  const rentaExtraAnual = Math.round(rentaExtraMensual * 12 * 100) / 100;
  return {
    id,
    label,
    descripcion,
    numeroMejoras: mejoras.length,
    inversionMin: Math.round(inversionMin),
    inversionMax: Math.round(inversionMax),
    inversionMedia: Math.round(inversionMedia),
    rentaExtraMensual: Math.round(rentaExtraMensual * 100) / 100,
    rentaExtraAnual,
    plusvaliaEstimada: Math.round(plusvaliaEstimada),
    paybackMeses:
      rentaExtraMensual > 0 && inversionMedia > 0
        ? Math.round((inversionMedia / rentaExtraMensual) * 10) / 10
        : undefined,
    roiAnualPct:
      inversionMedia > 0 ? Math.round((rentaExtraAnual / inversionMedia) * 1000) / 10 : undefined,
  };
}

/**
 * FASE 3.4 — Los tres escenarios de la especificación:
 *  - sin_reforma: no se actúa.
 *  - parcial: solo las mejoras confirmadas por el propietario (puesta a punto).
 *  - completa: todas las mejoras propuestas.
 */
export function escenariosROI(mejoras: MejoraROI[]): EscenarioROI[] {
  const confirmadas = mejoras.filter((m) => m.confirmadaPorPropietario);
  return [
    sumarEscenario('sin_reforma', 'Sin reformar', 'Se publica la vivienda en su estado actual.', []),
    sumarEscenario(
      'parcial',
      'Reforma parcial / puesta a punto',
      'Actuaciones confirmadas: pintura, limpieza, pequeños arreglos y mejoras de bajo coste.',
      confirmadas
    ),
    sumarEscenario(
      'completa',
      'Reforma completa',
      'Todas las mejoras propuestas, incluidas cocina, baños y actualizaciones de fondo.',
      mejoras
    ),
  ];
}

/**
 * Agrupa las sugerencias del diagnóstico de fotos que aún no tienen mejora
 * asociada (texto libre orientativo para alimentar al generador de IA).
 */
export function sugerenciasDesdeFotos(expediente: ExpedienteRecomercializacion): string[] {
  const fotos = expediente.revisionFotografica?.fotografias ?? [];
  const lista: { estancia: string; textos: string[] }[] = [];
  fotos.forEach((f) => {
    const textos = f.analisisIa?.sugerenciasMejora ?? [];
    if (textos.length) lista.push({ estancia: ESTANCIA_LABEL[f.estancia] || 'Estancia', textos });
  });
  return lista.flatMap((l) => l.textos.map((t) => `${l.estancia}: ${t}`));
}

/** Crea un expediente nuevo en BORRADOR/SALIDA según se informe la salida. */
export function crearExpediente(input: {
  inmuebleId: string;
  propietarioId: string;
  contratoAnteriorId?: string;
  destinoPrevisto?: DestinoInmueble;
  creadoPor?: string;
  creadoPorId?: string;
}): ExpedienteRecomercializacion {
  const now = new Date().toISOString();
  return {
    id: nuevoExpedienteId(input.inmuebleId),
    inmuebleId: input.inmuebleId,
    propietarioId: input.propietarioId,
    contratoAnteriorId: input.contratoAnteriorId,
    fechaInicio: now,
    estado: 'BORRADOR',
    destinoPrevisto: input.destinoPrevisto || 'INDECISO',
    revisionFotografica: { fotografias: [] },
    comercializacion: { inmobiliariasContactadasIds: [] },
    mejorasPropuestas: [],
    creadoPor: input.creadoPor,
    creadoPorId: input.creadoPorId,
    createdAt: now,
    updatedAt: now,
  };
}

export function nuevoInmobiliariaId(): string {
  return `inmb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function crearInmobiliaria(input: Partial<InmobiliariaDirectorio>): InmobiliariaDirectorio {
  const now = new Date().toISOString();
  return {
    id: input.id || nuevoInmobiliariaId(),
    nombreComercial: input.nombreComercial || 'Nueva inmobiliaria',
    razonSocial: input.razonSocial,
    cifNif: input.cifNif,
    logoUrl: input.logoUrl,
    telefono: input.telefono || '',
    email: input.email || '',
    web: input.web,
    localidad: input.localidad || '',
    provincia: input.provincia || '',
    codigosPostales: input.codigosPostales || [],
    operaVenta: input.operaVenta ?? false,
    operaAlquiler: input.operaAlquiler ?? true,
    operaHabitaciones: input.operaHabitaciones ?? false,
    especialidades: input.especialidades || [],
    comisionMediaVenta: input.comisionMediaVenta,
    comisionMediaAlquiler: input.comisionMediaAlquiler,
    origen: input.origen || 'REGISTRADA_EN_PLATAFORMA',
    verificada: input.verificada ?? false,
    esPatrocinada: input.esPatrocinada ?? false,
    activo: input.activo ?? true,
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export function nuevaPropuestaId(): string {
  return `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function crearPropuesta(input: {
  expedienteId: string;
  inmuebleId: string;
  propietarioId: string;
  inmobiliariaId: string;
  honorariosPropuestos: string;
  plazoEstimadoDias: number;
  serviciosIncluidos?: string[];
  estrategiaResumen: string;
}): PropuestaInmobiliaria {
  const now = new Date().toISOString();
  return {
    id: nuevaPropuestaId(),
    expedienteId: input.expedienteId,
    inmuebleId: input.inmuebleId,
    propietarioId: input.propietarioId,
    inmobiliariaId: input.inmobiliariaId,
    fechaPropuesta: now,
    honorariosPropuestos: input.honorariosPropuestos,
    plazoEstimadoDias: input.plazoEstimadoDias,
    serviciosIncluidos: input.serviciosIncluidos || [],
    estrategiaResumen: input.estrategiaResumen,
    estado: 'PENDIENTE',
    createdAt: now,
  };
}

export function nuevoLeadId(): string {
  return `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

export function crearLead(input: {
  inmuebleId: string;
  propietarioId: string;
  inmobiliariaId: string;
  tipoOperacion: LeadInmobiliario['tipoOperacion'];
  notas?: string;
}): LeadInmobiliario {
  const now = new Date().toISOString();
  return {
    id: nuevoLeadId(),
    inmuebleId: input.inmuebleId,
    propietarioId: input.propietarioId,
    inmobiliariaId: input.inmobiliariaId,
    fechaSolicitud: now,
    tipoOperacion: input.tipoOperacion,
    estado: 'SOLICITADO',
    notas: input.notas,
    createdAt: now,
  };
}
