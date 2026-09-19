import {
  Incidencia,
  PolizaSeguro,
  EstadoSeguroIncidencia,
  CategoriaIncidencia,
} from '../types';

export interface EvaluacionSeguroResultado {
  estado: EstadoSeguroIncidencia;
  polizasAplicables: PolizaSeguro[];
  polizaPrincipal?: PolizaSeguro;
  coberturasIdentificadas: string[];
  explicacion: string;
  recomendacion: string;
  telefonoAsistencia?: string;
  franquiciaAplicable?: number;
  requierePeritaje: boolean;
  advertencia: string;
}

// Mapeo orientativo de categorías de incidencias a posibles coberturas típicas de seguros multirriesgo
const MAPEO_COBERTURAS_CATEGORIA: Record<CategoriaIncidencia, string[]> = {
  FONTANERIA: [
    'Daños por agua',
    'Rotura de tuberías e instalaciones',
    'Fontanería de urgencia',
    'Asistencia 24h',
    'Filtraciones',
    'Localización de averías',
    'Gastos de desatasco',
    'Responsabilidad Civil por agua',
  ],
  ELECTRICIDAD: [
    'Daños eléctricos',
    'Subida de tensión',
    'Electricidad de urgencia 24h',
    'Averías en instalaciones fijas',
  ],
  CALEFACCION_ACS: [
    'Avería de caldera o termo',
    'Instalaciones fijas de climatización',
    'Asistencia técnica de urgencia',
    'Gas y calefacción',
  ],
  ELECTRODOMESTICOS: [
    'Avería de electrodomésticos (línea blanca)',
    'Daños eléctricos en electrodomésticos',
    'Rotura de vitrocerámica',
  ],
  CERRAJERIA: [
    'Cerrajería urgente 24h',
    'Pérdida o robo de llaves',
    'Inutilización de cerradura por vandalismo',
  ],
  HUMEDADES: [
    'Daños por agua',
    'Filtraciones de lluvia',
    'Fenómenos meteorológicos',
    'Daños a terceros (RC)',
  ],
  CARPINTERIA: [
    'Puertas, ventanas y cerraduras',
    'Daños en tarima o parqué por agua',
    'Persianas exteriores',
  ],
  PINTURA: [
    'Restauración estética por siniestro cubierto',
    'Pintura por daños de agua',
  ],
  CRISTALERIA: [
    'Rotura accidental de cristales, espejos y lunas',
    'Mamparas de baño',
    'Vidrios de ventanas climalit',
  ],
  PLAGAS_SANEAMIENTO: [
    'Control de plagas y desinfección',
    'Saneamiento higiénico',
  ],
  LIMPIEZA: [
    'Limpieza y achique tras siniestro',
    'Desescombro',
  ],
  OTROS: [
    'Responsabilidad Civil general',
    'Defensa jurídica',
    'Asistencia en el hogar',
  ],
};

/**
 * Evalúa las pólizas disponibles para el inmueble/propietario de la incidencia
 * de forma objetiva, sin inventar coberturas ni asumir decisiones vinculantes.
 */
export function evaluarCoberturaPolizas(
  incidencia: Pick<Incidencia, 'categoria' | 'titulo' | 'descripcion' | 'inmuebleId' | 'propietarioId'>,
  polizas: PolizaSeguro[]
): EvaluacionSeguroResultado {
  // 1. Filtrar pólizas vigentes asociadas al inmueble o al propietario
  const polizasRelevantes = polizas.filter((p) => {
    if (p.estado !== 'VIGENTE') return false;
    if (p.inmuebleId && p.inmuebleId === incidencia.inmuebleId) return true;
    if (p.propietarioId === incidencia.propietarioId && (!p.inmuebleId || p.inmuebleId === incidencia.inmuebleId)) {
      return true;
    }
    return false;
  });

  if (polizasRelevantes.length === 0) {
    return {
      estado: 'NO_APLICA',
      polizasAplicables: [],
      coberturasIdentificadas: [],
      explicacion: 'No se han localizado pólizas de seguro vigentes registradas para este inmueble o propietario.',
      recomendacion: 'Se recomienda verificar si existe un seguro de la Comunidad de Propietarios o dar de alta la póliza de hogar/arrendador.',
      requierePeritaje: false,
      advertencia: 'Comprobación técnica no vinculante. Verifique la documentación original de la póliza antes de acometer gastos.',
    };
  }

  // 2. Coberturas típicas sugeridas según la categoría de la incidencia
  const coberturasSugeridas = MAPEO_COBERTURAS_CATEGORIA[incidencia.categoria] || [];
  const textoIncidencia = `${incidencia.titulo} ${incidencia.descripcion}`.toLowerCase();

  // 3. Buscar coincidencias en las coberturas reales declaradas en las pólizas
  const polizasConCoincidencias: { poliza: PolizaSeguro; coberturasEncontradas: string[] }[] = [];

  for (const poliza of polizasRelevantes) {
    const encontradas: string[] = [];
    const cobPoliza = poliza.coberturas || [];

    for (const cob of cobPoliza) {
      const cobLower = cob.toLowerCase();
      const coincideConSugeridas = coberturasSugeridas.some((sug) =>
        cobLower.includes(sug.toLowerCase()) || sug.toLowerCase().includes(cobLower)
      );
      const coincideConTexto =
        (textoIncidencia.includes('agua') && cobLower.includes('agua')) ||
        (textoIncidencia.includes('fuga') && cobLower.includes('tubería')) ||
        (textoIncidencia.includes('llave') && cobLower.includes('cerrajer')) ||
        (textoIncidencia.includes('cristal') && cobLower.includes('cristal')) ||
        (textoIncidencia.includes('electric') && cobLower.includes('eléctric')) ||
        (textoIncidencia.includes('vitro') && cobLower.includes('electrodom'));

      if (coincideConSugeridas || coincideConTexto) {
        if (!encontradas.includes(cob)) {
          encontradas.push(cob);
        }
      }
    }

    if (encontradas.length > 0) {
      polizasConCoincidencias.push({ poliza, coberturasEncontradas: encontradas });
    }
  }

  // 4. Determinar el estado resultante
  if (polizasConCoincidencias.length > 0) {
    const mejor = polizasConCoincidencias[0];
    const todasCoberturas = Array.from(
      new Set(polizasConCoincidencias.flatMap((p) => p.coberturasEncontradas))
    );

    return {
      estado: 'POSIBLE_COBERTURA',
      polizasAplicables: polizasConCoincidencias.map((p) => p.poliza),
      polizaPrincipal: mejor.poliza,
      coberturasIdentificadas: todasCoberturas,
      explicacion: `Se detectaron coberturas compatibles en la póliza ${mejor.poliza.aseguradora} (Nº ${mejor.poliza.numeroPoliza}): ${todasCoberturas.join(', ')}.`,
      recomendacion: 'Contactar inmediatamente con la línea de asistencia de la aseguradora antes de iniciar reparaciones privadas.',
      telefonoAsistencia: mejor.poliza.contacto?.asistencia24h || mejor.poliza.contacto?.telefono,
      franquiciaAplicable: mejor.poliza.franquicia,
      requierePeritaje: incidencia.categoria === 'FONTANERIA' || incidencia.categoria === 'HUMEDADES',
      advertencia: 'COMPROBACIÓN ORIENTATIVA: La cobertura real está supeditada al dictamen del perito de la aseguradora y al clausulado particular.',
    };
  }

  return {
    estado: 'PENDIENTE_VERIFICACION',
    polizasAplicables: polizasRelevantes,
    polizaPrincipal: polizasRelevantes[0],
    coberturasIdentificadas: [],
    explicacion: `Existen pólizas activas (${polizasRelevantes.map((p) => p.aseguradora).join(', ')}), pero la categoría "${incidencia.categoria}" no coincide explícitamente con las coberturas registradas.`,
    recomendacion: 'Revisar las condiciones generales de la póliza o consultar con la compañía si está amparado bajo Responsabilidad Civil o Todo Riesgo accidental.',
    telefonoAsistencia: polizasRelevantes[0]?.contacto?.asistencia24h || polizasRelevantes[0]?.contacto?.telefono,
    requierePeritaje: false,
    advertencia: 'No descartar cobertura sin antes contrastar con el mediador de seguros o el servicio de atención al cliente.',
  };
}

// ============================================================================
// ARENA D - CIRCUITO DE RENOVACIÓN DE PÓLIZAS
// ============================================================================

import {
  EstadoRenovacionPoliza,
  AlertaRenovacionPoliza,
  HistorialPolizaItem,
  ComparacionPoliza,
  UsuarioApp,
  TipoPolizaSeguro,
  DatosExtraidosRenovacion,
} from '../types';
import { isAdmin, isPropietario } from '../lib/authService';

export const INTERVALOS_ALERTA_RENOVACION = [60, 45, 30, 15] as const;
export type NivelAlertaRenovacion = 60 | 45 | 30 | 15 | 0 | -1;

export const ESTADO_RENOVACION_LABELS: Record<EstadoRenovacionPoliza, { label: string; color: string; badgeClass: string; descripcion: string }> = {
  VIGENTE: { label: 'Vigente', color: 'emerald', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', descripcion: 'Póliza vigente sin acción de renovación requerida aún' },
  PENDIENTE: { label: 'Pendiente', color: 'slate', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', descripcion: 'Estado pendiente genérico' },
  PENDIENTE_RENOVACION: { label: 'Pendiente de Renovación', color: 'amber', badgeClass: 'bg-amber-50 text-amber-800 border-amber-200', descripcion: 'Próxima a vencer, requiere comprobación' },
  RENOVACION_SOLICITADA: { label: 'Renovación Solicitada', color: 'blue', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200', descripcion: 'Se ha solicitado a la compañía la renovación o condiciones' },
  RENOVACION_RECIBIDA: { label: 'Renovación Recibida', color: 'indigo', badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200', descripcion: 'Carta o nueva póliza recibida, pendiente de revisión' },
  RENOVADA: { label: 'Renovada', color: 'emerald', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300', descripcion: 'Póliza renovada confirmada' },
  NO_RENOVADA: { label: 'No Renovada', color: 'rose', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200', descripcion: 'No se renueva con esta compañía' },
  SUSTITUIDA: { label: 'Sustituida', color: 'purple', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200', descripcion: 'Sustituida por otra póliza de otra compañía' },
  CANCELADA: { label: 'Cancelada', color: 'rose', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', descripcion: 'Póliza cancelada' },
};

export const TIPO_POLIZA_LABELS: Record<TipoPolizaSeguro, { label: string; icon: string }> = {
  HOGAR: { label: 'Hogar Multirriesgo', icon: 'Home' },
  ARRENDADOR: { label: 'Protección Arrendador', icon: 'ShieldCheck' },
  IMPAGO_ALQUILER: { label: 'Impago de Alquiler', icon: 'FileCheck' },
  RESPONSABILIDAD_CIVIL: { label: 'Responsabilidad Civil', icon: 'Scale' },
  COMUNIDAD: { label: 'Comunidad de Propietarios', icon: 'Building2' },
  ELECTRODOMESTICOS: { label: 'Electrodomésticos', icon: 'Tv' },
  OTRO: { label: 'Otro Seguro', icon: 'FileText' },
};

export function calcularDiasRestantes(fechaVencimiento: string): number {
  if (!fechaVencimiento) return 9999;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVencimiento);
  venc.setHours(0, 0, 0, 0);
  const diffMs = venc.getTime() - hoy.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function obtenerNivelAlerta(diasRestantes: number): NivelAlertaRenovacion | null {
  if (diasRestantes < 0) return -1;
  if (diasRestantes === 0) return 0;
  if (diasRestantes <= 15) return 15;
  if (diasRestantes <= 30) return 30;
  if (diasRestantes <= 45) return 45;
  if (diasRestantes <= 60) return 60;
  return null;
}

export function generarAlertaRenovacion(poliza: PolizaSeguro): AlertaRenovacionPoliza | null {
  const diasRestantes = calcularDiasRestantes(poliza.fechaVencimiento);
  const nivel = obtenerNivelAlerta(diasRestantes);
  if (nivel === null) return null;

  const estadoRenov = poliza.estadoRenovacion || (poliza.estado === 'VIGENTE' ? 'VIGENTE' : 'PENDIENTE');
  if (['RENOVADA', 'SUSTITUIDA', 'NO_RENOVADA', 'CANCELADA'].includes(estadoRenov)) {
    return null;
  }

  return {
    polizaId: poliza.id,
    polizaNumero: poliza.numeroPoliza,
    aseguradora: poliza.aseguradora,
    inmuebleId: poliza.inmuebleId,
    inmuebleDireccion: poliza.inmuebleDireccion,
    propietarioId: poliza.propietarioId,
    fechaVencimiento: poliza.fechaVencimiento,
    diasRestantes,
    nivelProximidad: nivel,
    estadoRenovacion: estadoRenov as EstadoRenovacionPoliza,
    tipoPoliza: poliza.tipo,
    primaAnual: poliza.primaAnual,
    ultimaComprobacion: poliza.fechaUltimaComprobacion,
  };
}

export function detectarPolizasProximasVencer(polizas: PolizaSeguro[]): AlertaRenovacionPoliza[] {
  const alertas: AlertaRenovacionPoliza[] = [];
  for (const pol of polizas) {
    const alerta = generarAlertaRenovacion(pol);
    if (alerta) alertas.push(alerta);
  }
  return alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
}

export function debeGenerarAlerta(
  poliza: PolizaSeguro,
  alertaAnterior?: { nivel: NivelAlertaRenovacion; fecha: string }
): boolean {
  const dias = calcularDiasRestantes(poliza.fechaVencimiento);
  const nivelActual = obtenerNivelAlerta(dias);
  if (nivelActual === null) return false;
  if (!alertaAnterior) return true;
  if (alertaAnterior.nivel !== nivelActual) return true;
  const ultima = new Date(alertaAnterior.fecha).getTime();
  const ahora = Date.now();
  const horas = (ahora - ultima) / (1000 * 3600);
  return horas > 24;
}

export function crearHistorialPolizaItem(
  usuario: string,
  accion: HistorialPolizaItem['accion'],
  detalle?: string,
  resultado?: string,
  observaciones?: string,
  usuarioId?: string,
  estadoAnterior?: string,
  estadoNuevo?: string
): HistorialPolizaItem {
  return {
    id: `hist_pol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    fecha: new Date().toISOString(),
    usuario: usuario || 'Sistema',
    usuarioId,
    accion,
    detalle,
    resultado,
    observaciones,
    estadoAnterior,
    estadoNuevo,
  };
}

export function compararPolizas(anterior: PolizaSeguro, nueva: PolizaSeguro): ComparacionPoliza {
  const primaAnterior = anterior.primaAnual;
  const primaNueva = nueva.primaAnual;

  let diferenciaAbsoluta: number | undefined;
  let variacionPorcentual: number | undefined;
  if (primaAnterior !== undefined && primaNueva !== undefined) {
    diferenciaAbsoluta = Math.round((primaNueva - primaAnterior) * 100) / 100;
    if (primaAnterior !== 0) {
      variacionPorcentual = Math.round(((primaNueva - primaAnterior) / primaAnterior) * 10000) / 100;
    }
  }

  const coberturasAnterior = anterior.coberturas || [];
  const coberturasNueva = nueva.coberturas || [];

  const coberturasAnadidas = coberturasNueva.filter((c) => !coberturasAnterior.includes(c));
  const coberturasEliminadas = coberturasAnterior.filter((c) => !coberturasNueva.includes(c));
  const coberturasComunes = coberturasNueva.filter((c) => coberturasAnterior.includes(c));

  const franquiciaAnterior = anterior.franquicia;
  const franquiciaNueva = nueva.franquicia;
  let diferenciaFranquicia: number | undefined;
  if (franquiciaAnterior !== undefined && franquiciaNueva !== undefined) {
    diferenciaFranquicia = franquiciaNueva - franquiciaAnterior;
  }

  const aumentoPrima = diferenciaAbsoluta !== undefined ? diferenciaAbsoluta > 0 : false;
  const reduccionCobertura = coberturasEliminadas.length > 0;
  const aumentoFranquicia = diferenciaFranquicia !== undefined ? diferenciaFranquicia > 0 : false;
  const modificacionLimites =
    coberturasAnadidas.some((c) => c.toLowerCase().includes('límite') || c.toLowerCase().includes('limite')) ||
    coberturasEliminadas.some((c) => c.toLowerCase().includes('límite') || c.toLowerCase().includes('limite')) ||
    (nueva.observaciones?.toLowerCase().includes('límite') ?? false);

  return {
    id: `comp_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    polizaAnteriorId: anterior.id,
    polizaNuevaId: nueva.id,
    primaAnterior,
    primaNueva,
    diferenciaAbsoluta,
    variacionPorcentual,
    fechaInicioAnterior: anterior.fechaInicio,
    fechaInicioNueva: nueva.fechaInicio,
    fechaVencimientoAnterior: anterior.fechaVencimiento,
    fechaVencimientoNueva: nueva.fechaVencimiento,
    coberturasAnadidas,
    coberturasEliminadas,
    coberturasComunes,
    franquiciaAnterior,
    franquiciaNueva,
    diferenciaFranquicia,
    aumentoPrima,
    reduccionCobertura,
    aumentoFranquicia,
    modificacionLimites,
    fechaComparacion: new Date().toISOString(),
  };
}

export function canAccessPoliza(poliza: PolizaSeguro, currentUser?: UsuarioApp | null): boolean {
  if (!currentUser) return true;
  if (isAdmin(currentUser)) return true;
  if (isPropietario(currentUser)) {
    if (currentUser.propietarioId && poliza.propietarioId === currentUser.propietarioId) return true;
    if (currentUser.inmuebleIds && poliza.inmuebleId && currentUser.inmuebleIds.includes(poliza.inmuebleId)) return true;
    return false;
  }
  return false;
}

export function filtrarPolizasPorUsuario(polizas: PolizaSeguro[], currentUser?: UsuarioApp | null): PolizaSeguro[] {
  if (!currentUser) return polizas;
  if (isAdmin(currentUser)) return polizas;
  return polizas.filter((p) => canAccessPoliza(p, currentUser));
}

export function obtenerCadenaHistorialPoliza(
  polizaId: string,
  todasPolizas: PolizaSeguro[]
): PolizaSeguro[] {
  const mapa = new Map(todasPolizas.map((p) => [p.id, p]));
  const cadena: PolizaSeguro[] = [];

  let actual: PolizaSeguro | undefined = mapa.get(polizaId);
  const visitados = new Set<string>();

  while (actual && actual.polizaAnteriorId && !visitados.has(actual.id)) {
    visitados.add(actual.id);
    const anterior = mapa.get(actual.polizaAnteriorId);
    if (!anterior) break;
    actual = anterior;
  }

  visitados.clear();
  while (actual && !visitados.has(actual.id)) {
    visitados.add(actual.id);
    cadena.push(actual);
    if (actual.polizaSiguienteId) {
      actual = mapa.get(actual.polizaSiguienteId);
    } else {
      const siguiente = todasPolizas.find((p) => p.polizaAnteriorId === actual!.id);
      actual = siguiente;
    }
  }

  return cadena.sort((a, b) => new Date(a.fechaInicio).getTime() - new Date(b.fechaInicio).getTime());
}

export function validarDatosExtraidos(
  datos: Partial<DatosExtraidosRenovacion> & { confianza?: 'ALTA' | 'MEDIA' | 'BAJA' }
): { valido: boolean; errores: string[]; advertencias: string[] } {
  const errores: string[] = [];
  const advertencias: string[] = [];

  if (!datos.aseguradora) errores.push('Compañía no detectada en el documento');
  if (!datos.numeroPoliza) errores.push('Número de póliza no detectado');
  if (!datos.fechaVencimiento) errores.push('Fecha de vencimiento no detectada');

  if (!datos.fechaInicio) advertencias.push('Fecha de inicio no detectada');
  if (!datos.primaAnual) advertencias.push('Prima anual no detectada');

  if (datos.fechaInicio && datos.fechaVencimiento) {
    const inicio = new Date(datos.fechaInicio);
    const venc = new Date(datos.fechaVencimiento);
    if (isNaN(inicio.getTime()) || isNaN(venc.getTime())) {
      errores.push('Fechas inválidas');
    } else {
      if (inicio >= venc) errores.push('Fecha de inicio posterior o igual a fecha de vencimiento');
      const diffDias = (venc.getTime() - inicio.getTime()) / (1000 * 3600 * 24);
      if (diffDias > 400) advertencias.push('Duración de póliza superior a 13 meses, verificar');
      if (diffDias < 30) advertencias.push('Duración de póliza inferior a 1 mes, verificar');
    }
  }

  const confianza = (datos as any).confianza;
  if (confianza === 'BAJA') {
    advertencias.push('Extracción con confianza BAJA, requiere revisión manual obligatoria');
  } else if (confianza === 'MEDIA') {
    advertencias.push('Extracción con confianza MEDIA, verificar campos críticos');
  }

  return {
    valido: errores.length === 0,
    errores,
    advertencias,
  };
}

export function obtenerTextoDiasRestantes(dias: number): string {
  if (dias < 0) return `Vencida hace ${Math.abs(dias)} días`;
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Vence en ${dias} días`;
}
