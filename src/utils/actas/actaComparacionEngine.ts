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
  // Mapas por ID estable
  const mapaEntradaPorId = new Map<string, ElementoActaInventario>();
  const mapaSalidaPorId = new Map<string, ElementoActaInventario>();
  const mapaSalidaPorEntradaId = new Map<string, ElementoActaInventario>();
  const mapaEntradaPorClave = new Map<string, ElementoActaInventario[]>();
  const mapaSalidaPorClave = new Map<string, ElementoActaInventario[]>();
  
  for (const elem of inventarioEntrada) {
    mapaEntradaPorId.set(elem.id, elem);
    const key = `${elem.categoria}|${elem.elemento.toLowerCase()}`;
    if (!mapaEntradaPorClave.has(key)) mapaEntradaPorClave.set(key, []);
    mapaEntradaPorClave.get(key)!.push(elem);
  }
  for (const elem of inventarioSalida) {
    mapaSalidaPorId.set(elem.id, elem);
    if (elem.elementoEntradaId) mapaSalidaPorEntradaId.set(elem.elementoEntradaId, elem);
    if (elem.idOriginalEntrada) mapaSalidaPorEntradaId.set(elem.idOriginalEntrada, elem);
    const key = `${elem.categoria}|${elem.elemento.toLowerCase()}`;
    if (!mapaSalidaPorClave.has(key)) mapaSalidaPorClave.set(key, []);
    mapaSalidaPorClave.get(key)!.push(elem);
  }

  const salidaYaEmparejada = new Set<string>();

  // Comparar elementos de entrada que deben estar en salida — prioridad ID estable
  for (const elemEntrada of inventarioEntrada) {
    let elemSalida: ElementoActaInventario | undefined;
    // 1. ID idéntico (caso versión corregida: salida conserva mismo ID)
    elemSalida = mapaSalidaPorId.get(elemEntrada.id);
    // 2. Referencia elementoEntradaId (caso crearActaSalidaDesdeEntrada con identidad estable)
    if (!elemSalida) elemSalida = mapaSalidaPorEntradaId.get(elemEntrada.id);
    // 3. Matching por clave categoria|elemento solo si es único en ambos lados (evita falsos emparejamientos por texto ambiguo)
    if (!elemSalida) {
      const key = `${elemEntrada.categoria}|${elemEntrada.elemento.toLowerCase()}`;
      const candidatosEntrada = mapaEntradaPorClave.get(key) || [];
      const candidatosSalida = mapaSalidaPorClave.get(key) || [];
      if (candidatosEntrada.length === 1 && candidatosSalida.length === 1) {
        elemSalida = candidatosSalida[0];
      }
    }
    
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
      salidaYaEmparejada.add(elemSalida.id);
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
    if (salidaYaEmparejada.has(elemSalida.id)) continue;
    // Si tiene elementoEntradaId que ya existe en entrada, ya fue emparejado arriba (aunque por clave), no considerar nuevo
    if (elemSalida.elementoEntradaId && mapaEntradaPorId.has(elemSalida.elementoEntradaId)) continue;
    if (elemSalida.idOriginalEntrada && mapaEntradaPorId.has(elemSalida.idOriginalEntrada)) continue;
    // Si su clave no existe en entrada, es nuevo
    const key = `${elemSalida.categoria}|${elemSalida.elemento.toLowerCase()}`;
    if (!mapaEntradaPorClave.has(key)) {
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
    } else {
      // Si clave existe pero no fue emparejada (duplicados ambiguos), también considerar nuevo para evitar pérdida, pero marcar requiere revisión
      const yaExiste = comparaciones.some(c => c.elementoIdSalida === elemSalida.id);
      if (!yaExiste) {
        // Si hay duplicados ambiguos, no emparejar automáticamente para evitar falsos positivos; tratar como nuevo con atención
        const candidatosEntrada = mapaEntradaPorClave.get(key) || [];
        if (candidatosEntrada.length !== 1) {
          comparaciones.push({
            elementoId: elemSalida.id,
            elementoIdSalida: elemSalida.id,
            nombre: elemSalida.elemento,
            categoria: elemSalida.categoria,
            estadoEntrada: 'NO_VERIFICABLE',
            estadoSalida: elemSalida.estado,
            diferencia: 'ELEMENTO_NUEVO',
            observaciones: 'Elemento con nombre ambiguo duplicado, tratado como nuevo para evitar falso emparejamiento',
            requiereAtencion: true,
          });
        }
      }
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
