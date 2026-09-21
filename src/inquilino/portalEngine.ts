/**
 * BLOQUE E — Motor del portal (puro, sin Firebase).
 * Validaciones de invitación/mensajes/incidencias, vistas saneadas
 * (whitelist: nunca exponen campos internos) e historial del inquilino.
 */
import type {
  CambioTitularSuministro,
  ContratoFormalizacion,
  EnlaceRegistro,
  HistorialInquilinoItem,
  Incidencia,
  Inmueble,
  LecturaSuministro,
  MensajePortal,
  Suministro,
} from '../types';
import type { ResultadoValidacion } from './suministrosEngine';

// ---------------------------------------------------------------------------
// Validaciones
// ---------------------------------------------------------------------------

function resultado(errores: string[]): ResultadoValidacion {
  return { ok: errores.length === 0, errores };
}

export interface DatosEnlaceInquilino {
  activo?: boolean;
  tipoPerfil?: string;
  contratoIdVinculado?: string;
  fechaCaducidad?: string;
  usosMaximos?: number;
  usosActuales?: number;
  ahoraIso?: string;
}

/** Valida una invitación de registro de inquilino (UX; las reglas la verifican). */
export function validarEnlaceInquilino(e: DatosEnlaceInquilino): ResultadoValidacion {
  const errores: string[] = [];
  if (!e.activo) {
    errores.push('Este enlace de invitación no está activo.');
  }
  if (e.tipoPerfil !== 'INQUILINO') {
    errores.push('Este enlace no es una invitación de inquilino.');
  }
  if (!e.contratoIdVinculado) {
    errores.push('Esta invitación no tiene contrato vinculado.');
  }
  if (e.fechaCaducidad) {
    const cad = new Date(e.fechaCaducidad);
    const ahora = e.ahoraIso ? new Date(e.ahoraIso) : new Date();
    if (!isNaN(cad.getTime()) && cad.getTime() < ahora.getTime()) {
      errores.push('Este enlace de invitación ha caducado.');
    }
  }
  if (
    typeof e.usosMaximos === 'number' &&
    typeof e.usosActuales === 'number' &&
    e.usosActuales >= e.usosMaximos
  ) {
    errores.push('Este enlace ha alcanzado el número máximo de usos permitidos.');
  }
  return resultado(errores);
}

/** Adaptador desde la entidad EnlaceRegistro. */
export function validarEnlaceRegistroInquilino(
  enlace: EnlaceRegistro,
  ahoraIso?: string
): ResultadoValidacion {
  return validarEnlaceInquilino({ ...enlace, ahoraIso });
}

/** Mensaje del hilo portal: 1–4000 caracteres (mismo límite que las reglas). */
export function validarMensajePortal(texto: string | undefined | null): ResultadoValidacion {
  const t = (texto || '').trim();
  if (t.length < 1) return resultado(['El mensaje no puede estar vacío.']);
  if (t.length > 4000) return resultado(['El mensaje no puede superar los 4000 caracteres.']);
  return resultado([]);
}

export interface DatosIncidenciaInquilino {
  titulo?: string;
  descripcion?: string;
}

/** Incidencia creada por el inquilino (mismos mínimos que las reglas). */
export function validarIncidenciaInquilino(d: DatosIncidenciaInquilino): ResultadoValidacion {
  const errores: string[] = [];
  if (!d.titulo || d.titulo.trim().length < 3) {
    errores.push('El título debe tener al menos 3 caracteres.');
  }
  if (!d.descripcion || d.descripcion.trim().length < 10) {
    errores.push('La descripción debe tener al menos 10 caracteres.');
  }
  return resultado(errores);
}

// ---------------------------------------------------------------------------
// Vistas saneadas (whitelist estricta: lo que no está aquí NO se muestra)
// ---------------------------------------------------------------------------

/**
 * Vista del contrato para el inquilino.
 * Excluye SIEMPRE: DNI/dirección del arrendador, datos de contacto del
 * segundo propietario, avalista, scoring de asegurabilidad, notas privadas,
 * historial interno de formalización y token/solicitud vinculados.
 */
export interface MiContratoVM {
  id: string;
  inmuebleNombre: string;
  inmuebleDireccion: string;
  inmuebleCiudad: string;
  inmuebleCodigoPostal?: string;
  inmuebleSuperficieM2?: number;
  inmuebleHabitaciones?: number;
  inmuebleCertificadoEnergetico?: string;
  arrendadorNombre: string;
  arrendadorTelefono: string;
  arrendadorEmail: string;
  ibanPago: string;
  segundoArrendadorNombre?: string;
  arrendatarioNombre: string;
  arrendatarioTelefono: string;
  arrendatarioEmail: string;
  cotitularNombre?: string;
  cotitularTelefono?: string;
  rentaMensual: number;
  fianzaLegalMeses: number;
  fianzaLegalImporte: number;
  garantiaAdicionalMeses: number;
  garantiaAdicionalImporte: number;
  fechaInicioContrato: string;
  fechaFinContrato?: string;
  esVigente?: boolean;
  modalidadAlquiler?: 'completo' | 'habitaciones';
  habitacionIdentificador?: string;
  duracionAnios: number;
  diaLimitePagoMes: number;
  permitirMascotas: boolean;
  clausulaMascotasDetalle?: string;
  permitirSubarriendo: boolean;
  incluyeMueblesInventario: boolean;
  inventarioDetalle?: string;
  gastosComunidadCargo: 'arrendador' | 'arrendatario';
  ibiCargo: 'arrendador' | 'arrendatario';
  suministrosCargo: 'arrendatario' | 'arrendador';
  clausulaDesistimientoAnticipado: boolean;
  clausulasPersonalizadas: { titulo: string; contenido: string }[];
  estado: string;
  actaEntregaLlaves: ContratoFormalizacion['actaEntregaLlaves'];
  firmaArrendador: { firmado: boolean; fecha?: string };
  firmaArrendatario: { firmado: boolean; fecha?: string };
  fechaCreacion: string;
}

export function sanearContratoParaInquilino(c: ContratoFormalizacion): MiContratoVM {
  return {
    id: c.id,
    inmuebleNombre: c.inmuebleNombre,
    inmuebleDireccion: c.inmuebleDireccion,
    inmuebleCiudad: c.inmuebleCiudad,
    inmuebleCodigoPostal: c.inmuebleCodigoPostal,
    inmuebleSuperficieM2: c.inmuebleSuperficieM2,
    inmuebleHabitaciones: c.inmuebleHabitaciones,
    inmuebleCertificadoEnergetico: c.inmuebleCertificadoEnergetico,
    arrendadorNombre: c.propietarioNombre,
    arrendadorTelefono: c.propietarioTelefono,
    arrendadorEmail: c.propietarioEmail,
    ibanPago: c.propietarioIban,
    segundoArrendadorNombre: c.tieneSegundoPropietario ? c.segundoPropietarioNombre : undefined,
    arrendatarioNombre: c.candidatoNombre,
    arrendatarioTelefono: c.candidatoTelefono,
    arrendatarioEmail: c.candidatoEmail,
    cotitularNombre: c.tieneCotitular ? c.cotitularNombre : undefined,
    cotitularTelefono: c.tieneCotitular ? c.cotitularTelefono : undefined,
    rentaMensual: c.rentaMensual,
    fianzaLegalMeses: c.fianzaLegalMeses,
    fianzaLegalImporte: c.fianzaLegalImporte,
    garantiaAdicionalMeses: c.garantiaAdicionalMeses,
    garantiaAdicionalImporte: c.garantiaAdicionalImporte,
    fechaInicioContrato: c.fechaInicioContrato,
    fechaFinContrato: c.fechaFinContrato,
    esVigente: c.esVigente,
    modalidadAlquiler: c.modalidadAlquiler,
    habitacionIdentificador: c.habitacionIdentificador,
    duracionAnios: c.duracionAnios,
    diaLimitePagoMes: c.diaLimitePagoMes,
    permitirMascotas: c.permitirMascotas,
    clausulaMascotasDetalle: c.clausulaMascotasDetalle,
    permitirSubarriendo: c.permitirSubarriendo,
    incluyeMueblesInventario: c.incluyeMueblesInventario,
    inventarioDetalle: c.inventarioDetalle,
    gastosComunidadCargo: c.gastosComunidadCargo,
    ibiCargo: c.ibiCargo,
    suministrosCargo: c.suministrosCargo,
    clausulaDesistimientoAnticipado: c.clausulaDesistimientoAnticipado,
    clausulasPersonalizadas: (c.clausulasPersonalizadas || []).map((cl) => ({
      titulo: cl.titulo,
      contenido: cl.contenido,
    })),
    estado: c.estado,
    actaEntregaLlaves: c.actaEntregaLlaves,
    firmaArrendador: { firmado: c.firmaArrendador?.firmado === true, fecha: c.firmaArrendador?.fecha },
    firmaArrendatario: { firmado: c.firmaArrendatario?.firmado === true, fecha: c.firmaArrendatario?.fecha },
    fechaCreacion: c.fechaCreacion,
  };
}

/** Paso del seguimiento de una incidencia visible para el inquilino. */
export interface PasoSeguimientoVM {
  fecha: string;
  accion: string;
  detalle?: string;
}

/**
 * Vista de incidencia para el inquilino.
 * Excluye SIEMPRE: importes y facturas del trabajo profesional, contacto del
 * profesional, notas internas de responsabilidad y seguro, análisis IA,
 * observaciones internas y autoría del historial.
 */
export interface MiIncidenciaVM {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  prioridad: string;
  estado: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  fechaCierre?: string;
  resolucion?: string;
  viaActuacion?: string;
  trabajo?: {
    profesionalNombre: string;
    especialidad?: string;
    servicio: string;
    fechaAsignacion: string;
    fechaInicio?: string;
    fechaFinalizacion?: string;
    estadoTrabajo: string;
  };
  seguimiento: PasoSeguimientoVM[];
  fotografias: { id: string; nombre: string; storagePath?: string; url: string; fechaSubida: string }[];
  documentos: { id: string; nombre: string; storagePath?: string; url: string; fechaSubida: string }[];
}

export function sanearIncidenciaParaInquilino(i: Incidencia): MiIncidenciaVM {
  return {
    id: i.id,
    titulo: i.titulo,
    descripcion: i.descripcion,
    categoria: i.categoria,
    prioridad: i.prioridad,
    estado: i.estado,
    fechaCreacion: i.fechaCreacion,
    fechaActualizacion: i.fechaActualizacion,
    fechaCierre: i.fechaCierre,
    resolucion: i.resolucion,
    viaActuacion: i.viaActuacion,
    trabajo: i.trabajoProfesional
      ? {
          profesionalNombre: i.trabajoProfesional.profesionalNombre,
          especialidad: i.trabajoProfesional.especialidad,
          servicio: i.trabajoProfesional.servicio,
          fechaAsignacion: i.trabajoProfesional.fechaAsignacion,
          fechaInicio: i.trabajoProfesional.fechaInicio,
          fechaFinalizacion: i.trabajoProfesional.fechaFinalizacion,
          estadoTrabajo: i.trabajoProfesional.estadoTrabajo,
        }
      : undefined,
    seguimiento: (i.historial || []).map((h) => ({
      fecha: h.fecha,
      accion: h.accion,
      detalle: h.valorNuevo,
    })),
    fotografias: (i.fotografias || []).map((a) => ({
      id: a.id,
      nombre: a.nombre,
      storagePath: a.storagePath,
      url: a.url,
      fechaSubida: a.fechaSubida,
    })),
    documentos: (i.documentos || []).map((a) => ({
      id: a.id,
      nombre: a.nombre,
      storagePath: a.storagePath,
      url: a.url,
      fechaSubida: a.fechaSubida,
    })),
  };
}

/**
 * Vista del inmueble para el inquilino.
 * Excluye SIEMPRE: notas internas, valores patrimoniales y datos del propietario.
 */
export interface MiViviendaVM {
  id: string;
  direccion: string;
  ciudad: string;
  codigoPostal?: string;
  tipo?: string;
  superficieM2?: number;
  habitaciones?: number;
  banos?: number;
  descripcion?: string;
  fotografias: string[];
}

export function sanearInmuebleParaInquilino(v: Inmueble): MiViviendaVM {
  const fotos: string[] = [];
  if (v.imagenUrl) fotos.push(v.imagenUrl);
  for (const img of v.images || []) {
    if (img.downloadURL) fotos.push(img.downloadURL);
  }
  return {
    id: v.id,
    direccion: v.direccion,
    ciudad: v.ciudad,
    codigoPostal: v.codigoPostal,
    tipo: v.tipoInmueble,
    superficieM2: v.superficie,
    habitaciones: v.habitaciones,
    banos: v.banos,
    descripcion: v.descripcion,
    fotografias: Array.from(new Set(fotos)),
  };
}

// ---------------------------------------------------------------------------
// Historial del inquilino (derivado de entidades visibles, ordenado desc)
// ---------------------------------------------------------------------------

export interface FuentesHistorial {
  contratos: ContratoFormalizacion[];
  incidencias: Incidencia[];
  mensajes: MensajePortal[];
  lecturas: LecturaSuministro[];
  cambios: CambioTitularSuministro[];
  suministros: Suministro[];
  /** Nombre de contrato/suministro para títulos legibles. */
  nombreContrato?: (contratoId: string) => string;
  nombreSuministro?: (suministroId: string) => string;
}

/**
 * Construye el historial visible del inquilino a partir de las entidades
 * de su alcance. No lee audit_logs (información interna); las acciones del
 * portal sí escriben auditoría mediante el sistema canónico.
 */
export function construirHistorialInquilino(f: FuentesHistorial): HistorialInquilinoItem[] {
  const items: HistorialInquilinoItem[] = [];
  const nomC = f.nombreContrato || ((id: string) => id);
  const nomS = f.nombreSuministro || ((id: string) => id);

  for (const c of f.contratos) {
    items.push({
      id: `contrato-${c.id}`,
      fecha: c.fechaInicioContrato || c.fechaCreacion,
      categoria: 'CONTRATO',
      titulo: `Inicio de contrato — ${c.inmuebleDireccion || nomC(c.id)}`,
      detalle: `Renta ${c.rentaMensual} €/mes`,
      entidadId: c.id,
    });
    for (const cobro of c.registroCobros || []) {
      const pagado = cobro.estado === 'RECIBIDO' || cobro.estado === 'VERIFICADO';
      items.push({
        id: `recibo-${cobro.id}`,
        fecha: cobro.fechaPago || cobro.fechaVencimiento,
        categoria: 'RECIBO',
        titulo: `Recibo ${cobro.nombreMes || cobro.periodoMesAnio} — ${pagado ? 'pagado' : 'pendiente'}`,
        detalle: `${cobro.importePrevisto} €`,
        entidadId: cobro.id,
      });
    }
  }
  for (const i of f.incidencias) {
    items.push({
      id: `incidencia-${i.id}`,
      fecha: i.fechaActualizacion || i.fechaCreacion,
      categoria: 'INCIDENCIA',
      titulo: `${i.titulo} — ${i.estado}`,
      detalle: i.resolucion ? `Resolución: ${i.resolucion}` : undefined,
      entidadId: i.id,
    });
  }
  for (const m of f.mensajes) {
    items.push({
      id: `mensaje-${m.id}`,
      fecha: m.createdAt,
      categoria: 'MENSAJE',
      titulo: m.remitenteRol === 'INQUILINO' ? 'Mensaje enviado a gestión' : 'Mensaje recibido de gestión',
      detalle: m.texto.length > 80 ? `${m.texto.slice(0, 80)}…` : m.texto,
      entidadId: m.id,
    });
  }
  for (const l of f.lecturas) {
    items.push({
      id: `lectura-${l.id}`,
      fecha: l.fechaLectura,
      categoria: 'SUMINISTRO',
      titulo: `Lectura ${nomS(l.suministroId)}: ${l.valor} ${l.unidad}`,
      detalle: l.corrigeLecturaId ? 'Corrige una lectura anterior' : undefined,
      entidadId: l.id,
    });
  }
  for (const c of f.cambios) {
    items.push({
      id: `cambio-${c.id}`,
      fecha: c.fechaActualizacion || c.createdAt,
      categoria: 'SUMINISTRO',
      titulo: `Cambio de titular (${nomS(c.suministroId)}) — ${c.estado}`,
      detalle: `Nuevo titular: ${c.titularNuevoNombre}`,
      entidadId: c.id,
    });
  }

  items.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  return items;
}
