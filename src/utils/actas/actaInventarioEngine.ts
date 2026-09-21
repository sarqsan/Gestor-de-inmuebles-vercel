import { ElementoActaInventario, CategoriaElementoActa, EstadoElementoActa } from '../../types/actas';

export const ESTADOS_ELEMENTO_ACTA: { id: EstadoElementoActa; label: string; descripcion: string; nivel: number }[] = [
  { id: 'NUEVO', label: 'Nuevo', descripcion: 'Elemento nuevo sin uso', nivel: 0 },
  { id: 'CORRECTO', label: 'Correcto', descripcion: 'Estado correcto sin incidencias', nivel: 0 },
  { id: 'BUEN_ESTADO', label: 'Buen estado', descripcion: 'Buen estado general', nivel: 1 },
  { id: 'CON_DESGASTE_LEVE', label: 'Desgaste leve', descripcion: 'Desgaste leve por uso normal', nivel: 2 },
  { id: 'CON_DESGASTE', label: 'Con desgaste', descripcion: 'Desgaste por uso', nivel: 3 },
  { id: 'USADO', label: 'Usado', descripcion: 'Uso normal', nivel: 3 },
  { id: 'DETERIORADO', label: 'Deteriorado', descripcion: 'Deterioro notable', nivel: 4 },
  { id: 'DANADO', label: 'Dañado', descripcion: 'Daño identificable', nivel: 5 },
  { id: 'DEFECTUOSO', label: 'Defectuoso', descripcion: 'No funciona correctamente', nivel: 5 },
  { id: 'REPARADO', label: 'Reparado', descripcion: 'Reparado tras incidencia', nivel: 2 },
  { id: 'AUSENTE', label: 'Ausente', descripcion: 'Elemento no presente', nivel: 6 },
  { id: 'NO_VERIFICABLE', label: 'No verificable', descripcion: 'No se pudo verificar', nivel: 6 },
  { id: 'PENDIENTE_REVISAR', label: 'Pendiente revisar', descripcion: 'Pendiente de revisión', nivel: 3 },
];

export const CATEGORIAS_ELEMENTO_ACTA: { id: CategoriaElementoActa; label: string }[] = [
  { id: 'COCINA', label: 'Cocina' },
  { id: 'SALON', label: 'Salón' },
  { id: 'DORMITORIO', label: 'Dormitorio' },
  { id: 'BANO', label: 'Baño' },
  { id: 'TERRAZA', label: 'Terraza' },
  { id: 'EXTERIOR', label: 'Exterior' },
  { id: 'ELECTRODOMESTICOS', label: 'Electrodomésticos' },
  { id: 'MOBILIARIO', label: 'Mobiliario' },
  { id: 'ILUMINACION', label: 'Iluminación' },
  { id: 'CLIMATIZACION', label: 'Climatización' },
  { id: 'INSTALACIONES', label: 'Instalaciones' },
  { id: 'SEGURIDAD', label: 'Seguridad' },
  { id: 'VENTANAS', label: 'Ventanas' },
  { id: 'PUERTAS', label: 'Puertas' },
  { id: 'SUELOS', label: 'Suelos' },
  { id: 'PAREDES_TECHOS', label: 'Paredes/Techos' },
  { id: 'FONTANERIA', label: 'Fontanería' },
  { id: 'ELECTRICIDAD', label: 'Electricidad' },
  { id: 'ESTRUCTURA', label: 'Estructura' },
  { id: 'OTROS', label: 'Otros' },
];

export function crearElementoActaInventario(
  actaId: string,
  data: Partial<ElementoActaInventario> & { elemento: string; categoria: CategoriaElementoActa; estado: EstadoElementoActa }
): ElementoActaInventario {
  const now = new Date().toISOString();
  return {
    id: `elem_${actaId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    actaId,
    categoria: data.categoria,
    elemento: data.elemento,
    descripcion: data.descripcion,
    estado: data.estado,
    estadoEntrada: data.estadoEntrada,
    estadoSalida: data.estadoSalida,
    observaciones: data.observaciones,
    cantidad: data.cantidad ?? 1,
    unidadCantidad: data.unidadCantidad || 'uds',
    ubicacion: data.ubicacion,
    marca: data.marca,
    modelo: data.modelo,
    evidenciaIds: data.evidenciaIds || [],
    fotoUrl: data.fotoUrl,
    activo: data.activo ?? true,
    orden: data.orden ?? 0,
  };
}

export function validarElementoInventario(elem: ElementoActaInventario): string[] {
  const errores: string[] = [];
  if (!elem.elemento || elem.elemento.trim().length < 2) errores.push('Elemento debe tener nombre');
  if (!elem.categoria) errores.push('Categoría requerida');
  if (!elem.estado) errores.push('Estado requerido');
  if (elem.cantidad !== undefined && elem.cantidad < 0) errores.push('Cantidad no puede ser negativa');
  return errores;
}

export function ordenarInventarioPorCategoria(inventario: ElementoActaInventario[]): ElementoActaInventario[] {
  return [...inventario].sort((a, b) => {
    if (a.categoria !== b.categoria) return a.categoria.localeCompare(b.categoria);
    return a.orden - b.orden;
  });
}
