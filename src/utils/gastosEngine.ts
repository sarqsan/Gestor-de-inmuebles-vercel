import {
  Gasto,
  CategoriaGasto,
  EstadoGasto,
  HistorialGastoItem,
  UsuarioApp,
  Inmueble,
} from '../types';
import { CATEGORIA_GASTO_LABELS, ESTADO_GASTO_LABELS } from '../types';

/**
 * ARENA D - Circuito GASTO → INMUEBLE → CATEGORÍA → DOCUMENTO → HISTÓRICO
 * Reutiliza arquitectura existente, sin crear segunda colección.
 */

export function crearHistorialGastoItem(
  usuario: string,
  accion: HistorialGastoItem['accion'],
  detalle?: string,
  valorAnterior?: string,
  valorNuevo?: string,
  usuarioId?: string,
  observaciones?: string
): HistorialGastoItem {
  return {
    id: `hist_gasto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fecha: new Date().toISOString(),
    usuario: usuario || 'Sistema',
    usuarioId,
    accion,
    detalle,
    valorAnterior,
    valorNuevo,
    observaciones,
  };
}

/**
 * Determina si un usuario puede acceder a un gasto según inmuebleId y propietarioId
 * - ADMINISTRADOR: siempre
 * - PROPIETARIO: si inmuebleId está en sus inmuebleIds o propietarioId coincide
 * - PROFESIONAL: nunca (gastos privados)
 */
export function canAccessGasto(gasto: Gasto, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true; // legacy admin sin usuario
  const perfil = currentUser.tipoPerfil || 'ADMINISTRADOR';
  if (perfil === 'ADMINISTRADOR') return true;

  if (perfil === 'PROPIETARIO') {
    if (currentUser.propietarioId && gasto.propietarioId && gasto.propietarioId === currentUser.propietarioId) {
      return true;
    }
    if (currentUser.inmuebleIds && gasto.inmuebleId && currentUser.inmuebleIds.includes(gasto.inmuebleId)) {
      return true;
    }
    return false;
  }

  if (perfil === 'PROFESIONAL') {
    return false;
  }

  return false;
}

export function filtrarGastosPorUsuario(gastos: Gasto[], currentUser?: UsuarioApp | null): Gasto[] {
  if (!currentUser) return gastos;
  if (currentUser.tipoPerfil === 'ADMINISTRADOR') return gastos;
  return gastos.filter((g) => canAccessGasto(g, currentUser));
}

/**
 * Validación básica de gasto - datos mínimos
 */
export function validarGasto(gasto: Partial<Gasto>): { valido: boolean; errores: string[]; advertencias: string[] } {
  const errores: string[] = [];
  const advertencias: string[] = [];

  if (!gasto.inmuebleId) errores.push('Inmueble no especificado (inmuebleId requerido)');
  if (!gasto.fecha) errores.push('Fecha no especificada');
  if (!gasto.concepto || gasto.concepto.trim().length < 3) errores.push('Concepto demasiado corto o vacío');
  if (!gasto.categoria) errores.push('Categoría no especificada');
  if (gasto.importe === undefined || gasto.importe === null) errores.push('Importe no especificado');
  else if (gasto.importe < 0) errores.push('Importe no puede ser negativo');
  else if (gasto.importe === 0) advertencias.push('Importe 0€, verificar');

  if (gasto.fecha) {
    const d = new Date(gasto.fecha);
    if (isNaN(d.getTime())) errores.push('Fecha inválida');
    else {
      const hoy = new Date();
      if (d > hoy) advertencias.push('Fecha futura, verificar');
    }
  }

  return { valido: errores.length === 0, errores, advertencias };
}

/**
 * Calcula totales por categoría
 */
export function calcularTotalesPorCategoria(gastos: Gasto[]): Record<CategoriaGasto, number> {
  const totales = {} as Record<CategoriaGasto, number>;
  for (const g of gastos) {
    if (g.estado === 'ANULADO') continue;
    totales[g.categoria] = (totales[g.categoria] || 0) + (g.importe || 0);
  }
  return totales;
}

export function calcularTotalGastos(gastos: Gasto[]): number {
  return gastos.filter((g) => g.estado !== 'ANULADO').reduce((sum, g) => sum + (g.importe || 0), 0);
}

/**
 * Obtiene inmuebleDireccion denormalizada si existe, o busca en lista inmuebles
 */
export function obtenerDireccionGasto(gasto: Gasto, inmuebles?: Inmueble[]): string {
  if (gasto.inmuebleDireccion) return gasto.inmuebleDireccion;
  if (inmuebles) {
    const inm = inmuebles.find((i) => i.id === gasto.inmuebleId);
    if (inm) return inm.direccion;
  }
  return gasto.inmuebleId || 'Sin inmueble';
}

/**
 * Genera concepto de gasto sugerido según categoría
 */
export function obtenerConceptosSugeridos(categoria: CategoriaGasto): string[] {
  switch (categoria) {
    case 'MANTENIMIENTO':
      return ['Revisión anual caldera', 'Mantenimiento ascensor', 'Mantenimiento jardín', 'Mantenimiento piscina'];
    case 'REPARACION':
      return ['Reparación fontanería', 'Reparación eléctrica', 'Reparación persiana', 'Reparación cerradura'];
    case 'SUMINISTROS':
      return ['Factura electricidad', 'Factura agua', 'Factura gas', 'Internet comunidad'];
    case 'SEGUROS':
      return ['Seguro hogar', 'Seguro comunidad', 'Seguro impago alquiler', 'Seguro RC'];
    case 'IMPUESTOS_TASAS':
      return ['IBI', 'Tasa basura', 'Tasa vado', 'Plusvalía'];
    case 'COMUNIDAD':
      return ['Cuota comunidad ordinaria', 'Derrama comunidad', 'Cuota garaje', 'Cuota trastero'];
    case 'ELECTRODOMESTICOS':
      return ['Lavadora', 'Frigorífico', 'Horno', 'Vitrocerámica'];
    case 'MOBILIARIO':
      return ['Sofá', 'Mesa comedor', 'Armario', 'Colchón'];
    case 'REFORMAS':
      return ['Reforma baño', 'Reforma cocina', 'Pintura vivienda', 'Cambio ventanas'];
    case 'LIMPIEZA':
      return ['Limpieza fin de alquiler', 'Limpieza profunda', 'Limpieza cristales', 'Desinfección'];
    case 'GESTION':
      return ['Honorarios gestión', 'Gestoría', 'Certificado energético', 'Cédula habitabilidad'];
    default:
      return ['Gasto general', 'Otro concepto'];
  }
}

export { CATEGORIA_GASTO_LABELS, ESTADO_GASTO_LABELS };
