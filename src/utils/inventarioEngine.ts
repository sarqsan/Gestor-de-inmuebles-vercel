import {
  CategoriaInventario,
  ElementoInventario,
  EstadoInventario,
  HistorialInventarioItem,
  Inmueble,
  Profesional,
  UsuarioApp,
} from '../types';
import { canAccessInmueble, isAdmin, isProfesional, isPropietario } from '../lib/authService';

export const CATEGORIAS_INVENTARIO: CategoriaInventario[] = [
  'COCINA',
  'SALON',
  'DORMITORIO',
  'BANO',
  'TERRAZA',
  'EXTERIOR',
  'ELECTRODOMESTICOS',
  'MOBILIARIO',
  'ILUMINACION',
  'CLIMATIZACION',
  'OTROS',
];

export const ESTADOS_INVENTARIO: EstadoInventario[] = [
  'NUEVO',
  'BUEN_ESTADO',
  'USADO',
  'DETERIORADO',
  'REPARAR',
  'BAJA',
];

export const CATEGORIA_LABELS: Record<CategoriaInventario, string> = {
  COCINA: 'Cocina',
  SALON: 'Salón',
  DORMITORIO: 'Dormitorio',
  BANO: 'Baño',
  TERRAZA: 'Terraza',
  EXTERIOR: 'Exterior',
  ELECTRODOMESTICOS: 'Electrodomésticos',
  MOBILIARIO: 'Mobiliario',
  ILUMINACION: 'Iluminación',
  CLIMATIZACION: 'Climatización',
  OTROS: 'Otros',
};

export const ESTADO_INVENTARIO_LABELS: Record<EstadoInventario, string> = {
  NUEVO: 'Nuevo',
  BUEN_ESTADO: 'Buen estado',
  USADO: 'Usado',
  DETERIORADO: 'Deteriorado',
  REPARAR: 'A reparar',
  BAJA: 'Baja',
};

/**
 * Acceso a inventario: nunca se usa getAll().filter como seguridad.
 * El inmueble debe estar autorizado para el usuario.
 */
export function canAccessInventarioInmueble(
  usuario: UsuarioApp | null | undefined,
  inmueble: Inmueble | undefined,
  profesional?: Profesional | null
): boolean {
  if (!usuario || !inmueble) return false;
  return canAccessInmueble(usuario, inmueble, profesional);
}

export function canMutateInventario(
  usuario: UsuarioApp | null | undefined,
  inmueble: Inmueble | undefined,
  profesional?: Profesional | null
): boolean {
  if (!canAccessInventarioInmueble(usuario, inmueble, profesional)) return false;
  if (isAdmin(usuario) || isPropietario(usuario)) return true;
  // Profesional asignado: puede consultar, no mutar el inventario completo
  if (isProfesional(usuario)) return false;
  return false;
}

/**
 * Control de acceso al historial de inventario
 */
export function canAccessHistorialInventario(
  usuario: UsuarioApp | null | undefined,
  inmueble: Inmueble | undefined,
  historialInmuebleId: string
): boolean {
  if (!usuario || !inmueble) return false;
  if (inmueble.id !== historialInmuebleId) return false;
  return canAccessInventarioInmueble(usuario, inmueble);
}

/**
 * Valida que no se altere el inmuebleId durante la modificación
 */
export function validarInmutabilidadInmuebleId(
  itemOriginal: ElementoInventario,
  itemModificado: ElementoInventario
): boolean {
  return itemOriginal.inmuebleId === itemModificado.inmuebleId;
}

export function filtrarInventarioPorCategoria(
  items: ElementoInventario[],
  categoria: CategoriaInventario | 'TODAS'
): ElementoInventario[] {
  if (categoria === 'TODAS') return items;
  return items.filter((i) => i.categoria === categoria);
}

export function asegurarInventarioDelInmueble(
  items: ElementoInventario[],
  inmuebleId: string
): ElementoInventario[] {
  return items.filter((i) => i.inmuebleId === inmuebleId);
}

export function crearElementoInventario(
  inmuebleId: string,
  datos: Partial<ElementoInventario> & { nombre: string },
  usuarioNombre: string,
  usuarioId?: string
): ElementoInventario {
  const now = new Date().toISOString();
  const id = datos.id || `inv_${inmuebleId}_${Date.now()}`;
  const histEntry: HistorialInventarioItem = {
    id: `hist_${Date.now()}`,
    fecha: now,
    usuarioId,
    usuarioNombre,
    accion: 'CREACION',
    elementoAfectado: id,
    estadoNuevo: (datos.estado as EstadoInventario) || 'BUEN_ESTADO',
    cambios: `Alta: ${datos.nombre.trim()} (${datos.categoria || 'OTROS'})`,
  };

  return {
    id,
    inmuebleId,
    nombre: datos.nombre.trim(),
    categoria: datos.categoria || 'OTROS',
    descripcion: datos.descripcion?.trim() || undefined,
    cantidad: datos.cantidad !== undefined ? Math.max(1, datos.cantidad) : 1,
    estado: datos.estado || 'BUEN_ESTADO',
    ubicacion: datos.ubicacion?.trim() || undefined,
    estancia: datos.estancia?.trim() || undefined,
    observaciones: datos.observaciones?.trim() || undefined,
    fechaAlta: now,
    fechaModificacion: now,
    creadoPor: usuarioNombre,
    actualizadoPor: usuarioNombre,
    activo: datos.estado !== 'BAJA',
    documentos: datos.documentos || [],
    historial: [histEntry],
  };
}

export function modificarElementoInventario(
  itemOriginal: ElementoInventario,
  cambios: Partial<ElementoInventario>,
  usuarioNombre: string,
  usuarioId?: string
): ElementoInventario {
  // Garantía estricta de inmutabilidad del inmuebleId
  if (cambios.inmuebleId && cambios.inmuebleId !== itemOriginal.inmuebleId) {
    throw new Error('Violación de seguridad: No está permitido transferir un elemento de inventario a otro inmueble.');
  }

  const now = new Date().toISOString();
  const nuevoEstado = (cambios.estado || itemOriginal.estado) as EstadoInventario;
  const huboCambioEstado = cambios.estado && cambios.estado !== itemOriginal.estado;

  const histEntry: HistorialInventarioItem = {
    id: `hist_${Date.now()}`,
    fecha: now,
    usuarioId,
    usuarioNombre,
    accion: huboCambioEstado ? 'CAMBIO_ESTADO' : 'MODIFICACION',
    elementoAfectado: itemOriginal.id,
    estadoAnterior: itemOriginal.estado as EstadoInventario,
    estadoNuevo: nuevoEstado,
    cambios: huboCambioEstado
      ? `Estado: ${itemOriginal.estado} ➔ ${nuevoEstado}`
      : `Modificación de atributos (${cambios.nombre || itemOriginal.nombre})`,
  };

  return {
    ...itemOriginal,
    ...cambios,
    inmuebleId: itemOriginal.inmuebleId, // Inmutable
    id: itemOriginal.id, // Inmutable
    fechaModificacion: now,
    actualizadoPor: usuarioNombre,
    activo: nuevoEstado !== 'BAJA',
    historial: [histEntry, ...(itemOriginal.historial || [])],
  };
}

export function aplicarBajaLogica(item: ElementoInventario, usuarioNombre: string, usuarioId?: string): ElementoInventario {
  const now = new Date().toISOString();
  return {
    ...item,
    estado: 'BAJA',
    activo: false,
    fechaModificacion: now,
    actualizadoPor: usuarioNombre,
    historial: [
      {
        id: `hist_${Date.now()}`,
        fecha: now,
        usuarioId,
        usuarioNombre,
        accion: 'BAJA_LOGICA',
        elementoAfectado: item.id,
        estadoAnterior: (item.estado as EstadoInventario) || undefined,
        estadoNuevo: 'BAJA',
        cambios: `Baja lógica de ${item.nombre}`,
      },
      ...(item.historial || []),
    ],
  };
}

export interface ResumenInventarioInmueble {
  totalElementos: number;
  totalUnidades: number;
  activos: number;
  bajas: number;
  paraReparar: number;
  deteriorados: number;
  porCategoria: Record<CategoriaInventario, number>;
}

export function obtenerResumenInventario(items: ElementoInventario[]): ResumenInventarioInmueble {
  const resumen: ResumenInventarioInmueble = {
    totalElementos: items.length,
    totalUnidades: 0,
    activos: 0,
    bajas: 0,
    paraReparar: 0,
    deteriorados: 0,
    porCategoria: {
      COCINA: 0,
      SALON: 0,
      DORMITORIO: 0,
      BANO: 0,
      TERRAZA: 0,
      EXTERIOR: 0,
      ELECTRODOMESTICOS: 0,
      MOBILIARIO: 0,
      ILUMINACION: 0,
      CLIMATIZACION: 0,
      OTROS: 0,
    },
  };

  items.forEach((item) => {
    const qty = item.cantidad || 1;
    resumen.totalUnidades += qty;
    if (item.activo !== false && item.estado !== 'BAJA') {
      resumen.activos += 1;
    } else {
      resumen.bajas += 1;
    }

    if (item.estado === 'REPARAR') resumen.paraReparar += 1;
    if (item.estado === 'DETERIORADO') resumen.deteriorados += 1;

    const cat = item.categoria as CategoriaInventario;
    if (cat && resumen.porCategoria[cat] !== undefined) {
      resumen.porCategoria[cat] += qty;
    } else {
      resumen.porCategoria.OTROS += qty;
    }
  });

  return resumen;
}

export function calcularCompletitudFichaTecnica(inmueble: Inmueble): {
  porcentaje: number;
  camposCompletados: number;
  totalCampos: number;
  faltantes: string[];
} {
  const campos: Array<{ nombre: string; valor: any }> = [
    { nombre: 'Provincia', valor: inmueble.provincia },
    { nombre: 'Planta', valor: inmueble.planta },
    { nombre: 'Orientación', valor: inmueble.orientacion },
    { nombre: 'Año de Construcción', valor: inmueble.anioConstruccion },
    { nombre: 'Estado de Conservación', valor: inmueble.estadoConservacion },
    { nombre: 'Tipo de Inmueble', valor: inmueble.tipoInmueble },
    { nombre: 'Tipo de Ventanas', valor: inmueble.tipoVentanas },
    { nombre: 'Tipo de Persianas', valor: inmueble.tipoPersianas },
    { nombre: 'Interior / Exterior', valor: inmueble.interiorExterior },
  ];

  const faltantes: string[] = [];
  let completados = 0;

  campos.forEach((c) => {
    if (c.valor !== undefined && c.valor !== null && String(c.valor).trim() !== '' && c.valor !== 0) {
      completados++;
    } else {
      faltantes.push(c.nombre);
    }
  });

  return {
    porcentaje: Math.round((completados / campos.length) * 100),
    camposCompletados: completados,
    totalCampos: campos.length,
    faltantes,
  };
}

