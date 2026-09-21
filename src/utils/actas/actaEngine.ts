import {
  Acta,
  TipoActa,
  EstadoActa,
  ParticipanteActa,
  ElementoActaInventario,
  LecturaContador,
  HistorialActa,
  ResumenDiferencias,
} from '../../types/actas';
import { validarTransicion, esEstadoEditable } from './actaStateMachine';
import { compararActasEntradaSalida } from './actaComparacionEngine';

export function generarIdActa(): string {
  return `acta_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function crearActaBase(params: {
  ownerId: string;
  propertyId: string;
  contractId?: string;
  tipo: TipoActa;
  fechaActo: string; // YYYY-MM-DD
  horaActo?: string;
  participantes: ParticipanteActa[];
  creadoPor: string;
  creadoPorId?: string;
  actaEntradaId?: string;
}): Acta {
  const ahora = new Date().toISOString();
  const id = generarIdActa();
  
  const historialInicial: HistorialActa = {
    id: `hist_${Date.now()}`,
    fecha: ahora,
    usuario: params.creadoPor,
    usuarioId: params.creadoPorId,
    accion: 'CREADA',
    estadoNuevo: 'BORRADOR',
    detalle: `Acta ${params.tipo} creada para inmueble ${params.propertyId}`,
    version: 1,
  };

  return {
    id,
    ownerId: params.ownerId,
    propertyId: params.propertyId,
    contractId: params.contractId,
    tipo: params.tipo,
    estado: 'BORRADOR',
    version: 1,
    fechaCreacion: ahora,
    fechaActualizacion: ahora,
    fechaActo: params.fechaActo,
    horaActo: params.horaActo,
    participantes: params.participantes,
    inventario: [],
    lecturasContadores: [],
    evidenciaIds: [],
    incidenciaIds: [],
    actaEntradaId: params.actaEntradaId,
    firmas: [],
    estadoFirma: 'PENDIENTE',
    historial: [historialInicial],
    creadoPor: params.creadoPor,
    creadoPorId: params.creadoPorId,
  };
}

export function validarActaParaRevision(acta: Acta): string[] {
  const errores: string[] = [];
  if (!acta.propertyId) errores.push('Inmueble requerido');
  if (!acta.fechaActo) errores.push('Fecha del acto requerida');
  if (acta.participantes.length === 0) errores.push('Al menos un participante requerido');
  if (acta.inventario.length === 0) errores.push('Inventario no puede estar vacío para revisión');
  if (acta.lecturasContadores.length === 0) errores.push('Al menos una lectura de contador requerida');
  return errores;
}

export function actualizarActa(
  acta: Acta,
  cambios: Partial<Acta>,
  usuario: string,
  usuarioId?: string
): { actaActualizada: Acta; historialItem: HistorialActa } {
  if (!esEstadoEditable(acta.estado)) {
    throw new Error(`Acta en estado ${acta.estado} no es editable. Estados editables: BORRADOR, EN_REVISION, ERROR`);
  }

  // Protección: no modificar campos críticos si ya firmada (aunque esEstadoEditable lo bloquea, doble check)
  if (acta.estado === 'FIRMADA' || acta.estado === 'CERRADA') {
    throw new Error(`No se puede modificar acta ${acta.estado} silenciosamente. Debe versionarse.`);
  }

  const ahora = new Date().toISOString();
  const historialItem: HistorialActa = {
    id: `hist_${Date.now()}`,
    fecha: ahora,
    usuario,
    usuarioId,
    accion: 'MODIFICADA',
    estadoAnterior: acta.estado,
    estadoNuevo: acta.estado,
    detalle: `Acta modificada: ${Object.keys(cambios).join(', ')}`,
    version: acta.version,
  };

  return {
    actaActualizada: {
      ...acta,
      ...cambios,
      id: acta.id, // proteger id
      ownerId: acta.ownerId, // proteger ownerId
      version: acta.version, // versión no se incrementa en modificación simple
      historial: [...acta.historial, historialItem],
      fechaActualizacion: ahora,
      actualizadoPor: usuario,
    },
    historialItem,
  };
}

export function versionarActa(
  acta: Acta,
  usuario: string,
  motivo: string,
  usuarioId?: string
): { actaVersionada: Acta; actaOriginalPreservada: Acta; historialItem: HistorialActa } {
  const ahora = new Date().toISOString();
  const nuevaVersion = acta.version + 1;
  const nuevoId = generarIdActa();

  const historialItem: HistorialActa = {
    id: `hist_${Date.now()}`,
    fecha: ahora,
    usuario,
    usuarioId,
    accion: 'VERSIONADA',
    estadoAnterior: acta.estado,
    estadoNuevo: 'BORRADOR',
    detalle: `Versionado de acta ${acta.id} v${acta.version} → ${nuevoId} v${nuevaVersion}: ${motivo}. Versión anterior ${acta.estado} preservada íntegra.`,
    version: nuevaVersion,
  };

  // La versión original se preserva intacta, no se muta. Solo se le añade al historial un evento de que se ha versionado (para trazabilidad), pero en Firestore la original debe quedar inmutable.
  // Para la nueva versión documental, creamos un nuevo documento con nuevo ID, version incrementada, estado BORRADOR, sin firmas, con referencia a anterior.
  const cadenaPrevia = acta.cadenaVersionIds || [acta.id];
  const actaVersionada: Acta = {
    ...acta,
    id: nuevoId,
    version: nuevaVersion,
    estado: 'BORRADOR',
    estadoFirma: 'PENDIENTE',
    firmas: [],
    actaAnteriorId: acta.id,
    motivoVersionado: motivo,
    fechaVersionado: ahora,
    cadenaVersionIds: [...cadenaPrevia, nuevoId],
    historial: [...acta.historial, historialItem],
    fechaCreacion: ahora,
    fechaActualizacion: ahora,
    creadoPor: usuario,
    creadoPorId: usuarioId || acta.creadoPorId,
    actualizadoPor: usuario,
    // PDF no se hereda, debe generarse de nuevo para nueva versión
    pdfUrl: undefined,
    pdfStoragePath: undefined,
    pdfVersion: undefined,
    pdfFechaGeneracion: undefined,
  };

  // Acta original preservada: no se modifica su estado, solo se podría añadir un historial de que se versionó, pero para garantizar inmutabilidad documental, la original en Firestore permanece tal cual. Aquí devolvemos la original sin cambios para tests.
  const actaOriginalPreservada: Acta = { ...acta };

  return {
    actaVersionada,
    actaOriginalPreservada,
    historialItem,
  };
}

export function cambiarEstadoActa(
  acta: Acta,
  nuevoEstado: EstadoActa,
  usuario: string,
  usuarioId?: string,
  detalle?: string
): { actaActualizada: Acta; historialItem: HistorialActa } {
  validarTransicion(acta.estado, nuevoEstado);

  const ahora = new Date().toISOString();
  let accion: HistorialActa['accion'] = 'MODIFICADA';
  if (nuevoEstado === 'CERRADA') accion = 'CERRADA';
  if (nuevoEstado === 'CANCELADA') accion = 'CANCELADA';

  const historialItem: HistorialActa = {
    id: `hist_${Date.now()}`,
    fecha: ahora,
    usuario,
    usuarioId,
    accion,
    estadoAnterior: acta.estado,
    estadoNuevo: nuevoEstado,
    detalle: detalle || `Cambio estado ${acta.estado} → ${nuevoEstado}`,
    version: acta.version,
  };

  return {
    actaActualizada: {
      ...acta,
      estado: nuevoEstado,
      historial: [...acta.historial, historialItem],
      fechaActualizacion: ahora,
      actualizadoPor: usuario,
      ...(nuevoEstado === 'CERRADA' ? { fechaCierre: ahora, cerradoPor: usuario } : {}),
    },
    historialItem,
  };
}

export function anadirElementoInventario(
  acta: Acta,
  elemento: ElementoActaInventario,
  usuario: string,
  usuarioId?: string
): { actaActualizada: Acta; historialItem: HistorialActa } {
  if (!esEstadoEditable(acta.estado)) throw new Error(`Acta no editable en estado ${acta.estado}`);

  const ahora = new Date().toISOString();
  const historialItem: HistorialActa = {
    id: `hist_${Date.now()}`,
    fecha: ahora,
    usuario,
    usuarioId,
    accion: 'ELEMENTO_ANADIDO',
    detalle: `Elemento añadido: ${elemento.elemento} (${elemento.categoria})`,
    version: acta.version,
  };

  return {
    actaActualizada: {
      ...acta,
      inventario: [...acta.inventario, elemento],
      historial: [...acta.historial, historialItem],
      fechaActualizacion: ahora,
      actualizadoPor: usuario,
    },
    historialItem,
  };
}

export function registrarLecturaContador(
  acta: Acta,
  lectura: LecturaContador,
  usuario: string,
  usuarioId?: string
): { actaActualizada: Acta; historialItem: HistorialActa } {
  if (!esEstadoEditable(acta.estado)) throw new Error(`Acta no editable en estado ${acta.estado}`);

  const ahora = new Date().toISOString();
  const historialItem: HistorialActa = {
    id: `hist_${Date.now()}`,
    fecha: ahora,
    usuario,
    usuarioId,
    accion: 'CONTADOR_REGISTRADO',
    detalle: `Contador ${lectura.tipo}: ${lectura.lectura} ${lectura.unidad || ''}`,
    version: acta.version,
  };

  return {
    actaActualizada: {
      ...acta,
      lecturasContadores: [...acta.lecturasContadores, lectura],
      historial: [...acta.historial, historialItem],
      fechaActualizacion: ahora,
      actualizadoPor: usuario,
    },
    historialItem,
  };
}

export function vincularActaSalidaConEntrada(
  actaSalida: Acta,
  actaEntrada: Acta
): Acta {
  if (actaSalida.tipo !== 'SALIDA') throw new Error('Solo acta SALIDA puede vincularse a ENTRADA');
  if (actaEntrada.tipo !== 'ENTRADA') throw new Error('Acta referenciada debe ser ENTRADA');
  if (actaSalida.propertyId !== actaEntrada.propertyId) throw new Error('Inmuebles deben coincidir');

  const resumen = compararActasEntradaSalida(actaEntrada, actaSalida);

  return {
    ...actaSalida,
    actaEntradaId: actaEntrada.id,
    resumenDiferencias: resumen,
  };
}

export function crearActaSalidaDesdeEntrada(
  actaEntrada: Acta,
  params: {
    fechaActo: string;
    horaActo?: string;
    participantes: ParticipanteActa[];
    creadoPor: string;
    creadoPorId?: string;
  }
): Acta {
  const actaSalida = crearActaBase({
    ownerId: actaEntrada.ownerId,
    propertyId: actaEntrada.propertyId,
    contractId: actaEntrada.contractId,
    tipo: 'SALIDA',
    fechaActo: params.fechaActo,
    horaActo: params.horaActo,
    participantes: params.participantes,
    creadoPor: params.creadoPor,
    creadoPorId: params.creadoPorId,
    actaEntradaId: actaEntrada.id,
  });

  // Pre-cargar inventario con estados de entrada como referencia, preservando identidad estable para comparación determinista
  // - id se conserva igual al de entrada para matching por ID (evita falsos emparejamientos por texto ambiguo)
  // - estadoEntrada, cantidadEntrada, observacionesEntrada, fotoUrlEntrada, evidenciaIdsEntrada conservan original
  // - estado = PENDIENTE_REVISAR hasta revisión
  const inventarioPreCargado: ElementoActaInventario[] = actaEntrada.inventario.map(elem => ({
    ...elem,
    id: elem.id, // identidad estable conservada para comparación por ID
    actaId: actaSalida.id,
    estadoEntrada: elem.estado,
    estadoSalida: undefined,
    observacionesEntrada: elem.observaciones,
    cantidadEntrada: elem.cantidad,
    fotoUrlEntrada: elem.fotoUrl,
    evidenciaIdsEntrada: elem.evidenciaIds ? [...elem.evidenciaIds] : [],
    elementoEntradaId: elem.id,
    idOriginalEntrada: elem.id,
    estado: 'PENDIENTE_REVISAR', // pendiente revisar en salida
    // evidencias y foto de salida vacías hasta nueva aportación
    evidenciaIds: [],
    fotoUrl: undefined,
    observaciones: '', // observación de salida separada
    orden: elem.orden,
  }));

  return {
    ...actaSalida,
    inventario: inventarioPreCargado,
    // Relación inequívoca
    actaEntradaId: actaEntrada.id,
    // cadenaVersion para trazabilidad entrada→salida si se necesita
    cadenaVersionIds: [...(actaEntrada.cadenaVersionIds || [actaEntrada.id]), actaSalida.id],
  };
}
