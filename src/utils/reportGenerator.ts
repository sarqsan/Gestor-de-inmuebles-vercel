import { Candidato, Inmueble, InformeInteligente, ElementoCoherencia } from '../types';
import { calcularValuracionCandidato } from './solvenciaEngine';
import { formatEuro } from './formatters';

export function generarInformeInteligente(
  candidato: Candidato,
  inmueble?: Inmueble
): InformeInteligente {
  const precioAlquiler = inmueble ? inmueble.precio : 950;
  const docsAnalizados = candidato.documentosAnalizados || [];

  // 1. Calculate net average income from analyzed pay slips if present
  const nominasAnalizadas = docsAnalizados.filter(
    (d) => d.tipoDocumento === 'nomina' && d.estadoAnalisis === 'analizado' && d.datosExtraidos
  );

  const valoresNetosNominas: number[] = [];
  let empresaExtraida = '';
  let contratoExtraido = '';

  nominasAnalizadas.forEach((nom) => {
    const fieldNeto = nom.datosExtraidos?.salarioNeto?.valor || nom.datosExtraidos?.liquido?.valor;
    if (fieldNeto) {
      const parsedNum = typeof fieldNeto === 'number'
        ? fieldNeto
        : parseFloat(String(fieldNeto).replace(/[^0-9,.-]/g, '').replace(',', '.'));
      if (!isNaN(parsedNum) && parsedNum > 0) {
        valoresNetosNominas.push(parsedNum);
      }
    }
    if (nom.datosExtraidos?.empresa?.valor) {
      empresaExtraida = String(nom.datosExtraidos.empresa.valor);
    }
    if (nom.datosExtraidos?.tipoContrato?.valor) {
      contratoExtraido = String(nom.datosExtraidos.tipoContrato.valor);
    }
  });

  // Calculate net average income (including cotitular if defined)
  const cotitularIngresos = (candidato.cotitular?.ingresosNetos || 0) + (candidato.cotitular?.otrosIngresos || 0);
  const ingresosManuales = candidato.ingresosNetos + (candidato.otrosIngresos || 0) + cotitularIngresos;
  let ingresosNetosMedios = ingresosManuales;

  if (valoresNetosNominas.length > 0) {
    const suma = valoresNetosNominas.reduce((acc, curr) => acc + curr, 0);
    ingresosNetosMedios = Math.round(suma / valoresNetosNominas.length) + (candidato.otrosIngresos || 0) + cotitularIngresos;
  }

  // 2. Effort ratio calculation
  const ratioEsfuerzo = ingresosNetosMedios > 0
    ? Number(((precioAlquiler / ingresosNetosMedios) * 100).toFixed(1))
    : 100;

  // 3. Solvency score calculation using standard rules engine
  const resultadoSolvencia = calcularValuracionCandidato(candidato, inmueble);
  const scoreSolvencia = resultadoSolvencia.indiceSolvencia;

  // 4. Capacidad de Pago
  let valoracionCapacidad: 'Favorable' | 'Aceptable' | 'Elevado' | 'Crítico' = 'Favorable';
  let explicacionCapacidad = '';

  if (ratioEsfuerzo <= 30) {
    valoracionCapacidad = 'Favorable';
    explicacionCapacidad = `El alquiler representa un ${ratioEsfuerzo}% de los ingresos netos medios (${formatEuro(ingresosNetosMedios)}), holgadamente por debajo del umbral recomendado del 35%.`;
  } else if (ratioEsfuerzo <= 35) {
    valoracionCapacidad = 'Favorable';
    explicacionCapacidad = `El alquiler representa un ${ratioEsfuerzo}% de los ingresos netos medios (${formatEuro(ingresosNetosMedios)}), dentro del límite recomendado del 35%.`;
  } else if (ratioEsfuerzo <= 45) {
    valoracionCapacidad = 'Aceptable';
    explicacionCapacidad = `El alquiler representa un ${ratioEsfuerzo}% de los ingresos. Supera ligeramente la recomendación del 35%, por lo que requiere revisar la estabilidad global.`;
  } else {
    valoracionCapacidad = 'Elevado';
    explicacionCapacidad = `El alquiler representa un ${ratioEsfuerzo}% de los ingresos netos. Supone un esfuerzo financiero elevado sobre el presupuesto disponible.`;
  }

  // 5. Estabilidad Laboral
  const empresaNombre = empresaExtraida || 'Empresa según documentación';
  const tipoContratoTexto = contratoExtraido || (candidato.tipoContrato === 'indefinido' ? 'Indefinido' : candidato.tipoContrato);
  const antiguedadTexto = candidato.antiguedadLaboral || 'No indicada';
  const tipoEmpleoNombre = candidato.tipoEmpleo === 'funcionario'
    ? 'Funcionario'
    : candidato.tipoEmpleo === 'cuenta_ajena'
    ? 'Cuenta Ajena'
    : candidato.tipoEmpleo === 'autonomo'
    ? 'Autónomo'
    : candidato.tipoEmpleo === 'pensionista'
    ? 'Pensionista'
    : 'Estudiante / Otro';

  let valoracionEstabilidad = '';
  let explicacionEstabilidad = '';

  if (candidato.tipoEmpleo === 'funcionario' || candidato.tipoEmpleo === 'pensionista') {
    valoracionEstabilidad = 'Muy alta';
    explicacionEstabilidad = `Situación de ${tipoEmpleoNombre} con ingresos garantizados.`;
  } else if (candidato.tipoContrato === 'indefinido') {
    valoracionEstabilidad = 'Alta';
    explicacionEstabilidad = `Contrato indefinido con antigüedad registrada de ${antiguedadTexto}. Muestra continuidad laboral.`;
  } else if (candidato.tipoContrato === 'fijo_discontinuo') {
    valoracionEstabilidad = 'Media';
    explicacionEstabilidad = `Contrato fijo discontinuo. Se recomienda verificar periodos de actividad anuales.`;
  } else {
    valoracionEstabilidad = 'En revisión';
    explicacionEstabilidad = `Contrato temporal o en prácticas. Conviene verificar fecha de finalización o renovación.`;
  }

  // 6. Documentación status
  const totalesEsperados = candidato.documentos.length || 1;
  const recibidos = candidato.documentos.filter((d) => d.subido).length;
  const analizados = docsAnalizados.filter((d) => d.estadoAnalisis === 'analizado').length;
  const pendientesLista = candidato.documentos.filter((d) => !d.subido).map((d) => d.nombre);
  const pendientesCount = pendientesLista.length;

  // 7. Coherencia de Datos
  const diferencias: ElementoCoherencia[] = [];

  // Check manual income vs extracted pay slip
  if (valoresNetosNominas.length > 0) {
    const nominaNetoPromedio = Math.round(valoresNetosNominas.reduce((a, b) => a + b, 0) / valoresNetosNominas.length);
    const difIngresos = Math.abs(candidato.ingresosNetos - nominaNetoPromedio);

    if (difIngresos >= 50) {
      diferencias.push({
        campo: 'Ingresos netos mensuales',
        manual: `${formatEuro(candidato.ingresosNetos)}`,
        documental: `${formatEuro(nominaNetoPromedio)} (según nómina)`,
        diferencia: `${formatEuro(difIngresos)}`,
        accionRecomendada: 'Revisar el dato con el candidato.',
      });
    }
  }

  // Check warnings attached by document AI
  docsAnalizados.forEach((doc) => {
    if (doc.coherenciaWarnings && doc.coherenciaWarnings.length > 0) {
      doc.coherenciaWarnings.forEach((warn) => {
        // avoid adding duplicates
        if (!diferencias.some((d) => warn.includes(d.campo))) {
          diferencias.push({
            campo: `Documento: ${doc.nombreArchivo}`,
            manual: 'Dato introducido',
            documental: 'Dato extraído del archivo',
            diferencia: warn,
            accionRecomendada: 'Revisar la información del archivo adjunto.',
          });
        }
      });
    }
  });

  const tieneDiferencias = diferencias.length > 0;

  // 8. Aspectos Favorables
  const aspectosFavorables: string[] = [];
  aspectosFavorables.push(`✓ Ratio alquiler/ingresos del ${ratioEsfuerzo}% (${formatEuro(ingresosNetosMedios)} netos)`);
  
  if (candidato.tipoContrato === 'indefinido' || candidato.tipoEmpleo === 'funcionario') {
    aspectosFavorables.push(`✓ Contrato ${tipoContratoTexto}`);
  }
  if (antiguedadTexto && antiguedadTexto !== 'No indicada') {
    aspectosFavorables.push(`✓ ${antiguedadTexto} de antigüedad laboral`);
  }
  if (recibidos >= totalesEsperados) {
    aspectosFavorables.push('✓ Documentación mayoritariamente completa');
  } else {
    aspectosFavorables.push(`✓ ${recibidos} de ${totalesEsperados} documentos aportados`);
  }
  if (candidato.avalista) {
    aspectosFavorables.push('✓ Dispone de avalista declarado como garantía adicional');
  }

  // 9. Aspectos a Revisar
  const aspectosARevisar: string[] = [];
  if (tieneDiferencias) {
    diferencias.forEach((dif) => {
      aspectosARevisar.push(`⚠️ Diferencia detectada en ${dif.campo}: ${dif.diferencia}`);
    });
  }
  if (ratioEsfuerzo > 35) {
    aspectosARevisar.push(`⚠️ Ratio de esfuerzo del ${ratioEsfuerzo}% (supera el 35% recomendado)`);
  }
  if (pendientesCount > 0) {
    aspectosARevisar.push(`⚠️ Documentación pendiente: ${pendientesLista.slice(0, 3).join(', ')}${pendientesLista.length > 3 ? '...' : ''}`);
  }
  if (candidato.tipoContrato === 'temporal') {
    aspectosARevisar.push('⚠️ Duración de contrato temporal');
  }

  // 10. Información Faltante
  const informacionFaltante: string[] = [];
  pendientesLista.forEach((p) => {
    informacionFaltante.push(`Falta aportar: ${p}`);
  });
  if (valoresNetosNominas.length === 0) {
    informacionFaltante.push('Nómina no analizada aún para cotejo automático');
  }

  // 11. Valoración General (Conclusión) - NO "Aceptar" / "Rechazar"
  let valoracionGeneral: 'Favorable' | 'Requiere revisión' | 'Información insuficiente' = 'Favorable';

  if (pendientesCount >= 3 || recibidos === 0) {
    valoracionGeneral = 'Información insuficiente';
  } else if (tieneDiferencias || ratioEsfuerzo > 35 || candidatosContratoInestable(candidato)) {
    valoracionGeneral = 'Requiere revisión';
  } else {
    valoracionGeneral = 'Favorable';
  }

  // 12. Calidad de la información (Nivel de confianza)
  let calidadInformacion: 'Alta' | 'Media' | 'Baja' = 'Alta';
  let explicacionCalidad = '';

  const porcentajeDocsSubidos = (recibidos / totalesEsperados) * 100;
  if (porcentajeDocsSubidos >= 80 && !tieneDiferencias && analizados > 0) {
    calidadInformacion = 'Alta';
    explicacionCalidad = 'Alta completitud documental y coherencia sin diferencias detectadas.';
  } else if (porcentajeDocsSubidos >= 50 && (!tieneDiferencias || diferencias.length === 1)) {
    calidadInformacion = 'Media';
    explicacionCalidad = 'Documentación parcialmente aportada o existen puntos específicos por revisar.';
  } else {
    calidadInformacion = 'Baja';
    explicacionCalidad = 'Elevado volumen de documentación pendiente o datos sin cotejar.';
  }

  // 13. Resumen explicativo general
  const resumenExplicativo = `El candidato presenta ingresos netos medios aproximados de ${formatEuro(ingresosNetosMedios)} mensuales para un alquiler de ${formatEuro(precioAlquiler)}, equivalente a un ${ratioEsfuerzo} % de sus ingresos.`;

  // Version counter
  const versionNum = (candidato.informesHistorico?.length || 0) + 1;
  const now = new Date();
  const fechaGeneracion = `${now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;

  return {
    id: `informe-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    candidatoId: candidato.id,
    versionNum,
    fechaGeneracion,
    timestamp: Date.now(),
    resumenExplicativo,
    capacidadPago: {
      alquiler: precioAlquiler,
      ingresosNetosMedios,
      ratioEsfuerzo,
      valoracion: valoracionCapacidad,
      explicacion: explicacionCapacidad,
    },
    estabilidadLaboral: {
      empresa: empresaNombre,
      tipoContrato: tipoContratoTexto,
      antiguedad: antiguedadTexto,
      tipoEmpleoNombre,
      valoracion: valoracionEstabilidad,
      explicacion: explicacionEstabilidad,
    },
    documentacion: {
      recibidos,
      totalesEsperados,
      analizados,
      pendientesCount,
      pendientesLista,
    },
    coherenciaDatos: {
      tieneDiferencias,
      diferencias,
    },
    aspectosFavorables,
    aspectosARevisar,
    informacionFaltante,
    valoracionGeneral,
    scoreSolvencia,
    explicacionScore: 'Esta puntuación se basa en los criterios configurados en la aplicación.',
    calidadInformacion,
    explicacionCalidad,
  };
}

function candidatosContratoInestable(candidato: Candidato): boolean {
  return candidato.tipoContrato === 'temporal' || candidato.tipoContrato === 'practicas';
}
