import { Candidato, Inmueble, ContractType, EmploymentType } from '../types';

export interface FactorDesglose {
  id: string;
  nombre: string;
  puntosObtenidos: number;
  puntosMaximos: number;
  porcentaje: number;
  explicacion: string;
  detalles: string[];
}

export interface DiscrepanciaDocumentalIA {
  campo: string;
  valorManual: string | number;
  valorDocumento?: string | number;
  tipoDocumento: 'nomina' | 'contrato' | 'vida_laboral' | 'renta' | 'dni';
  coincide: boolean;
  observacion: string;
}

export interface AnalisisDocumentalIA {
  documentoId: string;
  nombreDocumento: string;
  subido: boolean;
  estadoLectura: 'pendiente' | 'completado' | 'discrepancia' | 'no_subido';
  discrepancias: DiscrepanciaDocumentalIA[];
}

export interface ResultadoValuracion {
  candidatoId: string;
  candidatoNombre: string;
  inmuebleNombre: string;
  alquilerMensual: number;
  ingresosTotales: number;
  ratioEsfuerzo: number; // Porcentaje (ej: 28.5)
  
  indiceSolvencia: number; // 0 - 100
  nivelClasificacion: 'Muy favorable' | 'Favorable' | 'Revisar' | 'Riesgo económico elevado';
  badgeColorStyle: string;
  
  desglose: {
    capacidadPago: FactorDesglose;
    estabilidadLaboral: FactorDesglose;
    ingresos: FactorDesglose;
    documentacion: FactorDesglose;
    avalista: FactorDesglose;
  };

  tieneAvalista: boolean;
  
  aspectosARevisar: string[]; // Alertas objetivas
  aspectosFavorables: string[]; // Aspectos positivos

  // Arquitectura preparada para OCR Gemini posterior
  analisisDocumentalIA?: AnalisisDocumentalIA[];
}

/**
 * Motor central de cálculo del Índice de Solvencia (0-100)
 * Basado en reglas transparentes y explicables.
 */
export function calcularValuracionCandidato(
  candidato: Candidato,
  inmueble?: Inmueble
): ResultadoValuracion {
  // 1. Obtener precio de alquiler del inmueble
  const alquilerMensual = inmueble ? inmueble.precio : 950;
  
  // 2. Ingresos mensuales totales (incluye cotitular si existe)
  const cotitularIngresos = (candidato.cotitular?.ingresosNetos || 0) + (candidato.cotitular?.otrosIngresos || 0);
  const ingresosTotales = Math.max(0, candidato.ingresosNetos + (candidato.otrosIngresos || 0) + cotitularIngresos);

  // 3. Ratio de esfuerzo (alquiler / ingresos)
  const ratioEsfuerzo = ingresosTotales > 0
    ? Number(((alquilerMensual / ingresosTotales) * 100).toFixed(1))
    : 100;

  // --- FACTOR A: Capacidad de pago (Máx 35 puntos) ---
  let puntosCapacidad = 0;
  let explicacionCapacidad = '';
  
  if (ratioEsfuerzo <= 25) {
    puntosCapacidad = 35;
    explicacionCapacidad = `Ratio de esfuerzo del ${ratioEsfuerzo}% (≤ 25%). Máxima capacidad de pago.`;
  } else if (ratioEsfuerzo <= 30) {
    puntosCapacidad = 32;
    explicacionCapacidad = `Ratio de esfuerzo del ${ratioEsfuerzo}% (25% a 30%). Capacidad de pago muy favorable.`;
  } else if (ratioEsfuerzo <= 35) {
    puntosCapacidad = 28;
    explicacionCapacidad = `Ratio de esfuerzo del ${ratioEsfuerzo}% (30% a 35%). Dentro del rango recomendado.`;
  } else if (ratioEsfuerzo <= 40) {
    puntosCapacidad = 20;
    explicacionCapacidad = `Ratio de esfuerzo del ${ratioEsfuerzo}% (35% a 40%). Moderadamente ajustado.`;
  } else if (ratioEsfuerzo <= 45) {
    puntosCapacidad = 10;
    explicacionCapacidad = `Ratio de esfuerzo del ${ratioEsfuerzo}% (40% a 45%). Compromete más del 40% del presupuesto.`;
  } else {
    puntosCapacidad = 0;
    explicacionCapacidad = `Ratio de esfuerzo del ${ratioEsfuerzo}% (> 45%). Elevada carga financiera sobre los ingresos declaredos.`;
  }

  const factorCapacidadPago: FactorDesglose = {
    id: 'capacidad_pago',
    nombre: 'Capacidad de pago',
    puntosObtenidos: puntosCapacidad,
    puntosMaximos: 35,
    porcentaje: Math.round((puntosCapacidad / 35) * 100),
    explicacion: explicacionCapacidad,
    detalles: [
      `Alquiler mensual: ${alquilerMensual} €`,
      `Ingresos mensuales totales: ${ingresosTotales} €`,
      `Fórmula: (${alquilerMensual} € / ${ingresosTotales} €) × 100 = ${ratioEsfuerzo}%`,
      `Puntuación según tramo de referencia: ${puntosCapacidad} / 35 ptos`,
    ],
  };

  // --- FACTOR B: Estabilidad laboral (Máx 25 puntos) ---
  let puntosContrato = 0;
  let detContrato = '';

  switch (candidato.tipoEmpleo) {
    case 'funcionario':
      puntosContrato = 15;
      detContrato = 'Empleo público / Funcionario (Máxima estabilidad)';
      break;
    case 'pensionista':
      puntosContrato = 14;
      detContrato = 'Pensionista / Jubilado (Ingreso garantizado por el Estado)';
      break;
    case 'cuenta_ajena':
      if (candidato.tipoContrato === 'indefinido') {
        puntosContrato = 14;
        detContrato = 'Por cuenta ajena con contrato Indefinido';
      } else if (candidato.tipoContrato === 'fijo_discontinuo') {
        puntosContrato = 10;
        detContrato = 'Por cuenta ajena con contrato Fijo discontinuo';
      } else if (candidato.tipoContrato === 'temporal') {
        puntosContrato = 6;
        detContrato = 'Por cuenta ajena con contrato Temporal';
      } else {
        puntosContrato = 4;
        detContrato = 'Por cuenta ajena (Prácticas / Otro)';
      }
      break;
    case 'autonomo':
      puntosContrato = 9;
      detContrato = 'Trabajador autónomo (Sujeto a variabilidad sectorial)';
      break;
    default:
      puntosContrato = 3;
      detContrato = 'Estudiante u otra situación';
      break;
  }

  // Antigüedad laboral (Máx 10 puntos)
  let puntosAntiguedad = 0;
  let detAntiguedad = '';
  const antLower = (candidato.antiguedadLaboral || '').toLowerCase();

  if (antLower.includes('año') || antLower.includes('ano')) {
    const numAnos = parseInt(antLower) || 1;
    if (numAnos >= 3) {
      puntosAntiguedad = 10;
      detAntiguedad = 'Antigüedad laboral ≥ 3 años (10 ptos)';
    } else if (numAnos >= 1) {
      puntosAntiguedad = 7;
      detAntiguedad = 'Antigüedad laboral de 1 a 3 años (7 ptos)';
    } else {
      puntosAntiguedad = 4;
      detAntiguedad = 'Antigüedad laboral inferior a 1 año (4 ptos)';
    }
  } else if (antLower.includes('mes')) {
    const numMeses = parseInt(antLower) || 6;
    if (numMeses >= 12) {
      puntosAntiguedad = 7;
      detAntiguedad = 'Antigüedad de 12 a 35 meses (7 ptos)';
    } else if (numMeses >= 6) {
      puntosAntiguedad = 4;
      detAntiguedad = 'Antigüedad laboral de 6 a 11 meses (4 ptos)';
    } else {
      puntosAntiguedad = 2;
      detAntiguedad = 'Antigüedad laboral reciente (< 6 meses) (2 ptos)';
    }
  } else {
    // Valor por defecto si la cadena no especifica claramente
    puntosAntiguedad = 5;
    detAntiguedad = 'Antigüedad declarada: ' + candidato.antiguedadLaboral;
  }

  const puntosEstabilidadTotal = Math.min(25, puntosContrato + puntosAntiguedad);

  const factorEstabilidadLaboral: FactorDesglose = {
    id: 'estabilidad_laboral',
    nombre: 'Estabilidad laboral',
    puntosObtenidos: puntosEstabilidadTotal,
    puntosMaximos: 25,
    porcentaje: Math.round((puntosEstabilidadTotal / 25) * 100),
    explicacion: `Valoración basada en la modalidad de empleo (${puntosContrato} ptos) y la antigüedad acreditada (${puntosAntiguedad} ptos).`,
    detalles: [
      `Situación: ${detContrato} (${puntosContrato} ptos)`,
      `Antigüedad: ${detAntiguedad}`,
      `Sumatorio parcial: ${puntosEstabilidadTotal} / 25 ptos`,
    ],
  };

  // --- FACTOR C: Ingresos y estabilidad económica (Máx 15 puntos) ---
  let puntosVolumenIngresos = 0;
  const multiplicadorIngresos = alquilerMensual > 0 ? ingresosTotales / alquilerMensual : 0;

  if (multiplicadorIngresos >= 3.5) {
    puntosVolumenIngresos = 7;
  } else if (multiplicadorIngresos >= 3.0) {
    puntosVolumenIngresos = 6;
  } else if (multiplicadorIngresos >= 2.5) {
    puntosVolumenIngresos = 4;
  } else if (multiplicadorIngresos >= 2.0) {
    puntosVolumenIngresos = 2;
  } else {
    puntosVolumenIngresos = 1;
  }

  let puntosRegularidad = 0;
  if (['funcionario', 'pensionista'].includes(candidato.tipoEmpleo) || candidato.tipoContrato === 'indefinido') {
    puntosRegularidad = 5;
  } else if (candidato.tipoEmpleo === 'autonomo' || candidato.tipoContrato === 'fijo_discontinuo') {
    puntosRegularidad = 3;
  } else {
    puntosRegularidad = 2;
  }

  let puntosCoherencia = 3;
  if (candidato.otrosIngresos > 0) {
    puntosCoherencia = candidato.descripcionOtrosIngresos ? 3 : 2;
  }

  const puntosIngresosTotal = Math.min(15, puntosVolumenIngresos + puntosRegularidad + puntosCoherencia);

  const factorIngresos: FactorDesglose = {
    id: 'ingresos',
    nombre: 'Ingresos y estabilidad económica',
    puntosObtenidos: puntosIngresosTotal,
    puntosMaximos: 15,
    porcentaje: Math.round((puntosIngresosTotal / 15) * 100),
    explicacion: `Evalúa el volumen global de ingresos (${multiplicadorIngresos.toFixed(1)}x el alquiler), la regularidad del cobro y la coherencia de datos.`,
    detalles: [
      `Ingresos netos declarados: ${candidato.ingresosNetos} €/mes`,
      candidato.otrosIngresos > 0
        ? `Otros ingresos declarados: ${candidato.otrosIngresos} €/mes (${candidato.descripcionOtrosIngresos || 'Sin especificar'})`
        : 'Sin otros ingresos adicionales declarados',
      `Múltiplo de cobertura: ${multiplicadorIngresos.toFixed(1)} veces la renta mensual`,
    ],
  };

  // --- FACTOR D: Documentación (Máx 15 puntos) ---
  const totalDocs = candidato.documentos.length || 1;
  const subidosDocs = candidato.documentos.filter((d) => d.subido).length;
  const porcentajeDocs = Math.round((subidosDocs / totalDocs) * 100);

  let puntosDoc = 2;
  if (porcentajeDocs === 100) {
    puntosDoc = 15;
  } else if (porcentajeDocs >= 80) {
    puntosDoc = 12;
  } else if (porcentajeDocs >= 60) {
    puntosDoc = 9;
  } else if (porcentajeDocs >= 40) {
    puntosDoc = 5;
  } else {
    puntosDoc = 2;
  }

  const factorDocumentacion: FactorDesglose = {
    id: 'documentacion',
    nombre: 'Documentación',
    puntosObtenidos: puntosDoc,
    puntosMaximos: 15,
    porcentaje: porcentajeDocs,
    explicacion: `Aportados ${subidosDocs} de ${totalDocs} documentos (${porcentajeDocs}%). La documentación faltante se considera pendiente de verificar y no como falta implícita de solvencia.`,
    detalles: [
      `Grado de avance: ${porcentajeDocs}%`,
      `Documentos aportados: ${subidosDocs} / ${totalDocs}`,
      porcentajeDocs < 100
        ? `Pendientes: ${candidato.documentos.filter((d) => !d.subido).map((d) => d.nombre).join(', ')}`
        : 'Toda la documentación requerida ha sido entregada',
    ],
  };

  // --- FACTOR E: Avalista (Máx 10 puntos o Redistribución proporcional) ---
  let puntosAvalista = 0;
  let explicacionAvalista = '';
  let detallesAvalista: string[] = [];

  if (candidato.avalista) {
    puntosAvalista = 10;
    explicacionAvalista = 'Aporta avalista como garantía económica adicional (+10 ptos).';
    detallesAvalista = [
      'Garantía adicional confirmada en la ficha',
      'El avalista aporta respaldo financiero ante eventualidades de impago',
    ];
  } else {
    puntosAvalista = 0;
    explicacionAvalista = 'No dispone de avalista. Para evitar penalizar injustamente al candidato, la puntuación base de los demás factores se pondera sobre 90 puntos e escala a base 100.';
    detallesAvalista = [
      'Sin avalista declarado',
      'Sin penalización automática: la puntuación de los demás factores se ajusta proporcionalmente',
    ];
  }

  const factorAvalista: FactorDesglose = {
    id: 'avalista',
    nombre: 'Avalista',
    puntosObtenidos: puntosAvalista,
    puntosMaximos: candidato.avalista ? 10 : 0, // Si no tiene avalista, se muestra sobre 0/no aplica
    porcentaje: candidato.avalista ? 100 : 0,
    explicacion: explicacionAvalista,
    detalles: detallesAvalista,
  };

  // --- CÁLCULO DE LA PUNTUACIÓN GLOBAL (Índice de Solvencia 0-100) ---
  let indiceSolvencia = 0;
  
  if (candidato.avalista) {
    indiceSolvencia = Math.min(
      100,
      puntosCapacidad + puntosEstabilidadTotal + puntosIngresosTotal + puntosDoc + puntosAvalista
    );
  } else {
    // Si no tiene avalista, sumamos A(35) + B(25) + C(15) + D(15) = 90 max
    // Y escalamos sobre 100
    const sumaSubtotal = puntosCapacidad + puntosEstabilidadTotal + puntosIngresosTotal + puntosDoc;
    indiceSolvencia = Math.min(100, Math.round((sumaSubtotal / 90) * 100));
  }

  // Clasificación visual
  let nivelClasificacion: 'Muy favorable' | 'Favorable' | 'Revisar' | 'Riesgo económico elevado';
  let badgeColorStyle = '';

  if (indiceSolvencia >= 80) {
    nivelClasificacion = 'Muy favorable';
    badgeColorStyle = 'bg-emerald-500 text-white border-emerald-600 shadow-sm';
  } else if (indiceSolvencia >= 65) {
    nivelClasificacion = 'Favorable';
    badgeColorStyle = 'bg-teal-600 text-white border-teal-700 shadow-sm';
  } else if (indiceSolvencia >= 50) {
    nivelClasificacion = 'Revisar';
    badgeColorStyle = 'bg-amber-500 text-white border-amber-600 shadow-sm';
  } else {
    nivelClasificacion = 'Riesgo económico elevado';
    badgeColorStyle = 'bg-rose-600 text-white border-rose-700 shadow-sm';
  }

  // --- ALERTAS OBJETIVAS ("Aspectos a revisar") ---
  const aspectosARevisar: string[] = [];

  if (ratioEsfuerzo > 35) {
    aspectosARevisar.push(`⚠️ Ratio alquiler/ingresos elevado (${ratioEsfuerzo}% de esfuerzo sobre el presupuesto).`);
  }
  if (candidato.tipoContrato === 'temporal' || candidato.tipoContrato === 'practicas') {
    aspectosARevisar.push(`⚠️ Tipo de contrato ${candidato.tipoContrato} (duración determinada).`);
  }
  if (puntosAntiguedad <= 4) {
    aspectosARevisar.push(`⚠️ Antigüedad laboral reducida (${candidato.antiguedadLaboral}).`);
  }
  if (porcentajeDocs < 100) {
    aspectosARevisar.push(`⚠️ Documentación pendiente (${100 - porcentajeDocs}% por adjuntar).`);
  }
  if (ingresosTotales === 0) {
    aspectosARevisar.push('⚠️ Datos económicos incompletos o sin ingresos netos registrados.');
  }

  // --- PUNTOS POSITIVOS ("Aspectos favorables") ---
  const aspectosFavorables: string[] = [];

  if (ratioEsfuerzo <= 30) {
    aspectosFavorables.push(`✓ Ratio alquiler/ingresos óptimo (${ratioEsfuerzo}% de esfuerzo).`);
  } else if (ratioEsfuerzo <= 35) {
    aspectosFavorables.push(`✓ Ratio alquiler/ingresos adecuado (${ratioEsfuerzo}%).`);
  }

  if (['funcionario', 'pensionista'].includes(candidato.tipoEmpleo) || candidato.tipoContrato === 'indefinido') {
    aspectosFavorables.push(`✓ Estabilidad contractual sólida (${candidato.tipoEmpleo === 'funcionario' ? 'Funcionario' : 'Contrato Indefinido'}).`);
  }

  if (puntosAntiguedad >= 7) {
    aspectosFavorables.push(`✓ Antigüedad laboral acreditada (${candidato.antiguedadLaboral}).`);
  }

  if (porcentajeDocs === 100) {
    aspectosFavorables.push('✓ Documentación completa presentada (100%).');
  }

  if (multiplicadorIngresos >= 3) {
    aspectosFavorables.push(`✓ Ingresos suficientes (${multiplicadorIngresos.toFixed(1)} veces el importe del alquiler).`);
  }

  if (candidato.avalista) {
    aspectosFavorables.push('✓ Dispone de avalista declarado como respaldo.');
  }

  // --- ESTRUCTURA PREPARADA PARA ANÁLISIS DOCUMENTAL GEMINI IA FUTURO ---
  const analisisDocumentalIA: AnalisisDocumentalIA[] = candidato.documentos.map((doc) => {
    return {
      documentoId: doc.id,
      nombreDocumento: doc.nombre,
      subido: doc.subido,
      estadoLectura: doc.subido ? 'completado' : 'no_subido',
      discrepancias: doc.subido
        ? [
            {
              campo: 'Nombre Titular',
              valorManual: candidato.nombre,
              valorDocumento: candidato.nombre,
              tipoDocumento: 'dni',
              coincide: true,
              observacion: 'Coincidencia exacta con datos introducidos.',
            },
          ]
        : [],
    };
  });

  return {
    candidatoId: candidato.id,
    candidatoNombre: candidato.nombre,
    inmuebleNombre: candidato.inmuebleNombre,
    alquilerMensual,
    ingresosTotales,
    ratioEsfuerzo,
    indiceSolvencia,
    nivelClasificacion,
    badgeColorStyle,
    desglose: {
      capacidadPago: factorCapacidadPago,
      estabilidadLaboral: factorEstabilidadLaboral,
      ingresos: factorIngresos,
      documentacion: factorDocumentacion,
      avalista: factorAvalista,
    },
    tieneAvalista: candidato.avalista,
    aspectosARevisar,
    aspectosFavorables,
    analisisDocumentalIA,
  };
}
