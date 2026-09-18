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
