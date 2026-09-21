import {
  Acta,
  ElementoActaInventario,
  ComparacionElemento,
  ComparacionContador,
  ComparacionIncidencias,
  ResumenDiferencias,
  DiferenciaElemento,
  EstadoElementoActa,
  LecturaContador,
} from '../../types/actas';
import { ESTADOS_ELEMENTO_ACTA } from './actaInventarioEngine';

function nivelEstado(estado: EstadoElementoActa): number {
  const found = ESTADOS_ELEMENTO_ACTA.find(e => e.id === estado);
  return found ? found.nivel : 3;
}

// Reglas deterministas sin IA para decidir diferencia
function determinarDiferencia(
  estadoEntrada: EstadoElementoActa,
  estadoSalida: EstadoElementoActa
): DiferenciaElemento {
  if (estadoEntrada === estadoSalida) return 'SIN_CAMBIOS';
  if (estadoSalida === 'AUSENTE') return 'AUSENCIA';
  if (estadoSalida === 'NO_VERIFICABLE') return 'NO_VERIFICABLE';
  
  const nivelEntrada = nivelEstado(estadoEntrada);
  const nivelSalida = nivelEstado(estadoSalida);
  
  if (nivelSalida < nivelEntrada) return 'MEJORA'; // mejora
  if (nivelSalida === nivelEntrada + 1) {
    if (estadoSalida === 'CON_DESGASTE_LEVE' || estadoSalida === 'CON_DESGASTE') return 'DESGASTE_LEVE';
    return 'DESGASTE';
  }
  if (nivelSalida === nivelEntrada + 2) return 'DESGASTE';
  if (nivelSalida >= nivelEntrada + 3) {
    if (estadoSalida === 'DANADO' || estadoSalida === 'DEFECTUOSO') return 'DANO';
    return 'DETERIORO';
  }
  // Por defecto, si empeora
  if (nivelSalida > nivelEntrada) return 'DETERIORO';
  return 'SIN_CAMBIOS';
}

export function compararInventarios(
  inventarioEntrada: ElementoActaInventario[],
  inventarioSalida: ElementoActaInventario[]
): ComparacionElemento[] {
  const comparaciones: ComparacionElemento[] = [];
  const mapaEntrada = new Map<string, ElementoActaInventario>();
  const mapaSalida = new Map<string, ElementoActaInventario>();
  
  // Indexar por elemento nombre + categoria para matching tolerante
  for (const elem of inventarioEntrada) {
    const key = `${elem.categoria}|${elem.elemento.toLowerCase()}`;
    mapaEntrada.set(key, elem);
    mapaEntrada.set(elem.id, elem);
  }
  for (const elem of inventarioSalida) {
    const key = `${elem.categoria}|${elem.elemento.toLowerCase()}`;
    mapaSalida.set(key, elem);
    mapaSalida.set(elem.id, elem);
  }

  // Comparar elementos de entrada que deben estar en salida
  for (const elemEntrada of inventarioEntrada) {
    const key = `${elemEntrada.categoria}|${elemEntrada.elemento.toLowerCase()}`;
    const elemSalida = mapaSalida.get(key) || mapaSalida.get(elemEntrada.id);
    
    if (!elemSalida) {
      comparaciones.push({
        elementoId: elemEntrada.id,
        elementoIdEntrada: elemEntrada.id,
        nombre: elemEntrada.elemento,
        categoria: elemEntrada.categoria,
        estadoEntrada: elemEntrada.estado,
        estadoSalida: 'AUSENTE',
        diferencia: 'AUSENCIA',
        observaciones: `Elemento presente en entrada no encontrado en salida`,
        requiereAtencion: true,
      });
    } else {
      const diff = determinarDiferencia(elemEntrada.estado, elemSalida.estado);
      comparaciones.push({
        elementoId: elemEntrada.id,
        elementoIdEntrada: elemEntrada.id,
        elementoIdSalida: elemSalida.id,
        nombre: elemEntrada.elemento,
        categoria: elemEntrada.categoria,
        estadoEntrada: elemEntrada.estado,
        estadoSalida: elemSalida.estado,
        diferencia: diff,
        observaciones: diff !== 'SIN_CAMBIOS' ? `Cambio: ${elemEntrada.estado} → ${elemSalida.estado}` : undefined,
        requiereAtencion: diff === 'DANO' || diff === 'DETERIORO' || diff === 'AUSENCIA' || diff === 'INCIDENCIA_NUEVA',
      });
    }
  }

  // Elementos nuevos en salida que no estaban en entrada
  for (const elemSalida of inventarioSalida) {
    const key = `${elemSalida.categoria}|${elemSalida.elemento.toLowerCase()}`;
    const existeEntrada = mapaEntrada.get(key) || mapaEntrada.get(elemSalida.id);
    if (!existeEntrada) {
      comparaciones.push({
        elementoId: elemSalida.id,
        elementoIdSalida: elemSalida.id,
        nombre: elemSalida.elemento,
        categoria: elemSalida.categoria,
        estadoEntrada: 'NO_VERIFICABLE',
        estadoSalida: elemSalida.estado,
        diferencia: 'ELEMENTO_NUEVO',
        observaciones: 'Elemento nuevo registrado en salida',
        requiereAtencion: false,
      });
    }
  }

  return comparaciones;
}

export function compararContadores(
  lecturasEntrada: LecturaContador[],
  lecturasSalida: LecturaContador[]
): ComparacionContador[] {
  const mapaEntrada = new Map<string, LecturaContador>();
  for (const lec of lecturasEntrada) {
    mapaEntrada.set(lec.tipo, lec);
  }

  const comparaciones: ComparacionContador[] = [];

  for (const lecSalida of lecturasSalida) {
    const lecEntrada = mapaEntrada.get(lecSalida.tipo);
    if (!lecEntrada) {
      comparaciones.push({
        tipo: lecSalida.tipo,
        lecturaSalida: lecSalida.lectura,
        lecturaSalidaNumerica: lecSalida.lecturaNumerica,
        unidad: lecSalida.unidad,
        diferenciaTexto: 'Sin lectura de entrada',
        observaciones: 'No hay lectura inicial para comparar',
      });
    } else {
      let diff: number | undefined;
      let diffTexto: string | undefined;
      if (lecEntrada.lecturaNumerica !== undefined && lecSalida.lecturaNumerica !== undefined) {
        diff = lecSalida.lecturaNumerica - lecEntrada.lecturaNumerica;
        diffTexto = `${diff.toFixed(2)} ${lecSalida.unidad || ''}`.trim();
      } else {
        diffTexto = `${lecEntrada.lectura} → ${lecSalida.lectura}`;
      }
      comparaciones.push({
        tipo: lecSalida.tipo,
        lecturaEntrada: lecEntrada.lectura,
        lecturaEntradaNumerica: lecEntrada.lecturaNumerica,
        lecturaSalida: lecSalida.lectura,
        lecturaSalidaNumerica: lecSalida.lecturaNumerica,
        diferencia: diff,
        diferenciaTexto: diffTexto,
        unidad: lecSalida.unidad || lecEntrada.unidad,
      });
    }
  }

  // Contadores que estaban en entrada pero no en salida
  for (const lecEntrada of lecturasEntrada) {
    const existeSalida = lecturasSalida.some(l => l.tipo === lecEntrada.tipo);
    if (!existeSalida) {
      comparaciones.push({
        tipo: lecEntrada.tipo,
        lecturaEntrada: lecEntrada.lectura,
        lecturaEntradaNumerica: lecEntrada.lecturaNumerica,
        unidad: lecEntrada.unidad,
        diferenciaTexto: 'Sin lectura de salida',
        observaciones: 'No se registró lectura final',
      });
    }
  }

  return comparaciones;
}

export function generarResumenDiferencias(
  comparacionElementos: ComparacionElemento[],
  comparacionContadores: ComparacionContador[],
  comparacionIncidencias: ComparacionIncidencias
): ResumenDiferencias {
  return {
    totalElementos: comparacionElementos.length,
    sinCambios: comparacionElementos.filter(c => c.diferencia === 'SIN_CAMBIOS').length,
    conDesgaste: comparacionElementos.filter(c => c.diferencia === 'DESGASTE' || c.diferencia === 'DESGASTE_LEVE').length,
    conDeterioro: comparacionElementos.filter(c => c.diferencia === 'DETERIORO').length,
    conDano: comparacionElementos.filter(c => c.diferencia === 'DANO').length,
    ausencias: comparacionElementos.filter(c => c.diferencia === 'AUSENCIA').length,
    noVerificables: comparacionElementos.filter(c => c.diferencia === 'NO_VERIFICABLE').length,
    incidenciasNuevas: comparacionIncidencias.nuevasEnSalida.length,
    elementosNuevos: comparacionElementos.filter(c => c.diferencia === 'ELEMENTO_NUEVO').length,
    requiereAtencion: comparacionElementos.filter(c => c.requiereAtencion).length,
    contadores: comparacionContadores,
    incidencias: comparacionIncidencias,
    fechaComparacion: new Date().toISOString(),
  };
}

export function compararActasEntradaSalida(actaEntrada: Acta, actaSalida: Acta): ResumenDiferencias {
  if (actaEntrada.tipo !== 'ENTRADA') throw new Error('Primera acta debe ser ENTRADA');
  if (actaSalida.tipo !== 'SALIDA') throw new Error('Segunda acta debe ser SALIDA');
  if (actaEntrada.propertyId !== actaSalida.propertyId) throw new Error('Las actas deben ser del mismo inmueble');
  
  const compElementos = compararInventarios(actaEntrada.inventario, actaSalida.inventario);
  const compContadores = compararContadores(actaEntrada.lecturasContadores, actaSalida.lecturasContadores);
  
  // Incidencias: distinguir existentes desde entrada vs nuevas en salida
  const incidenciasEntrada = actaEntrada.incidenciaIds || [];
  const incidenciasSalida = actaSalida.incidenciaIds || [];
  const nuevasEnSalida = incidenciasSalida.filter(id => !incidenciasEntrada.includes(id));
  const existentesDesdeEntrada = incidenciasSalida.filter(id => incidenciasEntrada.includes(id));
  
  const compIncidencias: ComparacionIncidencias = {
    existentesDesdeEntrada,
    nuevasEnSalida,
    resueltas: [], // se determinaría por estado
  };

  return generarResumenDiferencias(compElementos, compContadores, compIncidencias);
}
