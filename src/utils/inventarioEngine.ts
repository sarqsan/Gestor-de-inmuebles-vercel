import {
  CategoriaInventario,
  ElementoInventario,
  EstadoInventario,
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

export function aplicarBajaLogica(item: ElementoInventario, usuarioNombre: string): ElementoInventario {
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
        usuarioNombre,
        accion: 'BAJA_LOGICA',
        elementoAfectado: item.id,
        estadoAnterior: (item.estado as EstadoInventario) || undefined,
        estadoNuevo: 'BAJA',
      },
      ...(item.historial || []),
    ],
  };
}
