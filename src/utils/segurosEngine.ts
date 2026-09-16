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
  AGUA: [
    'Daños por agua',
    'Rotura de tuberías',
    'Filtraciones',
    'Localización de averías',
    'Gastos de desatasco',
    'Responsabilidad Civil por agua',
  ],
  FONTANERIA: [
    'Daños por agua',
    'Rotura de tuberías e instalaciones',
    'Fontanería de urgencia',
    'Asistencia 24h',
  ],
  ELECTRICIDAD: [
    'Daños eléctricos',
    'Subida de tensión',
    'Electricidad de urgencia 24h',
    'Averías en instalaciones fijas',
  ],
  CLIMATIZACION: [
    'Avería de caldera o termo',
    'Instalaciones fijas de climatización',
    'Asistencia técnica de urgencia',
  ],
  ELECTRODOMESTICO: [
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
  ESTRUCTURAL: [
    'Daños al continente',
    'Fenómenos extraordinarios (Consorcio)',
    'Hundimiento o colapso',
    'Responsabilidad Civil inmobiliaria',
  ],
  COMUNIDAD: [
    'Seguro de la Comunidad de Propietarios',
    'Elementos comunes (bajantes, cubierta, fachadas)',
    'Responsabilidad Civil comunitaria',
  ],
  PLAGAS: [
    'Control de plagas (si está contratado servicio especial)',
    'Desinfección / Desinsectación',
  ],
  OTRO: [
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
    // Si la póliza está explícitamente ligada a este inmueble
    if (p.inmuebleId && p.inmuebleId === incidencia.inmuebleId) return true;
    // Si es póliza de comunidad o global del propietario sin inmuebleId restrictivo
    if (p.propietarioId === incidencia.propietarioId && (!p.inmuebleId || p.inmuebleId === incidencia.inmuebleId)) {
      return true;
    }
    return false;
  });

  if (polizasRelevantes.length === 0) {
    return {
      estado: 'SIN_SEGURO_APLICABLE',
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
      // Ver si coincide con palabras clave de la categoría o el texto de la incidencia
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
      estado: 'POSIBLEMENTE_CUBIERTA',
      polizasAplicables: polizasConCoincidencias.map((p) => p.poliza),
      polizaPrincipal: mejor.poliza,
      coberturasIdentificadas: todasCoberturas,
      explicacion: `Se detectaron coberturas compatibles en la póliza ${mejor.poliza.aseguradora} (Nº ${mejor.poliza.numeroPoliza}): ${todasCoberturas.join(', ')}.`,
      recomendacion: 'Contactar inmediatamente con la línea de asistencia de la aseguradora antes de iniciar reparaciones privadas.',
      telefonoAsistencia: mejor.poliza.contacto?.asistencia24h || mejor.poliza.contacto?.telefono,
      franquiciaAplicable: mejor.poliza.franquicia,
      requierePeritaje: incidencia.categoria === 'AGUA' || incidencia.categoria === 'ESTRUCTURAL' || incidencia.categoria === 'HUMEDADES',
      advertencia: 'COMPROBACIÓN ORIENTATIVA: La cobertura real está supeditada al dictamen del perito de la aseguradora y al clausulado particular.',
    };
  }

  // Si hay pólizas vigentes pero ninguna cobertura coincide de forma evidente
  return {
    estado: 'COBERTURA_DUDOSA',
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
