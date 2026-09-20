import {
  Candidato,
  Inmueble,
  UserProfile,
  SolicitudDocumentacion,
  ContratoFormalizacion,
  EvaluacionAsegurabilidad,
  ActaEntregaLlaves,
  ClausulaPersonalizada,
  EstadoFormalizacion,
  Propietario,
} from '../types';
import { formatEuro } from './formatters';
import { calcularValuracionCandidato } from './solvenciaEngine';

/**
 * Realiza la evaluación técnica de solvencia y asegurabilidad para seguro de impago de alquiler
 */
export function evaluarAsegurabilidadCandidato(
  candidato: Candidato,
  inmueble?: Inmueble,
  solicitudDoc?: SolicitudDocumentacion
): EvaluacionAsegurabilidad {
  const renta = inmueble ? inmueble.precio : 900;
  
  // Ingresos totales computables
  const ingresosCotitular = (candidato.cotitular?.ingresosNetos || 0) + (candidato.cotitular?.otrosIngresos || 0);
  const ingresosTotales = candidato.ingresosNetos + (candidato.otrosIngresos || 0) + ingresosCotitular;
  
  // Ratio de esfuerzo financiero
  const ratioEsfuerzo = ingresosTotales > 0
    ? Number(((renta / ingresosTotales) * 100).toFixed(1))
    : 100;

  const ingresosSobrantes = Math.max(0, ingresosTotales - renta);
  
  // Documentos validados
  const docsValidados = solicitudDoc
    ? solicitudDoc.documentos.filter((d) => d.estado === 'validado').length
    : (candidato.documentosAnalizados?.filter((d) => d.estadoAnalisis === 'analizado').length || 0);

  const docsObligatorios = solicitudDoc
    ? solicitudDoc.documentos.filter((d) => d.obligatorio)
    : [];
  
  const docsObligatoriosCompletos = solicitudDoc
    ? docsObligatorios.length > 0 && docsObligatorios.every((d) => d.estado === 'validado' || (d.archivos && d.archivos.length > 0))
    : docsValidados >= 2;

  // Antigüedad laboral
  const esFuncionarioOPensionista = candidato.tipoEmpleo === 'funcionario' || candidato.tipoEmpleo === 'pensionista';
  const esIndefinido = candidato.tipoContrato === 'indefinido';
  const antiguedadStr = (candidato.antiguedadLaboral || '').toLowerCase();
  const tieneAntiguedadAnios = antiguedadStr.includes('año') || antiguedadStr.includes('ano') || parseInt(antiguedadStr) >= 1;
  const antiguedadSuficiente = esFuncionarioOPensionista || (esIndefinido && (tieneAntiguedadAnios || !antiguedadStr.includes('mes')));

  // Solvency score
  const solvenciaResult = calcularValuracionCandidato(candidato, inmueble);
  const score = solvenciaResult.indiceSolvencia;

  // Factores y puntos
  const puntosPositivos: string[] = [];
  const factoresRiesgo: string[] = [];
  const recomendaciones: string[] = [];

  if (ratioEsfuerzo <= 33) {
    puntosPositivos.push(`Ratio de esfuerzo óptimo del ${ratioEsfuerzo}% (inferior al límite estándar de aseguradoras del 35%).`);
  } else if (ratioEsfuerzo <= 40) {
    puntosPositivos.push(`Ratio de esfuerzo del ${ratioEsfuerzo}%, dentro de márgenes aceptables de suscripción.`);
  } else {
    factoresRiesgo.push(`Ratio de esfuerzo elevado (${ratioEsfuerzo}%). Supera el 40% recomendado para pólizas sin aval.`);
  }

  if (esFuncionarioOPensionista) {
    puntosPositivos.push('Estabilidad garantizada por condición de funcionario público o pensionista.');
  } else if (esIndefinido) {
    puntosPositivos.push('Contrato laboral indefinido.');
  } else {
    factoresRiesgo.push(`Contrato ${candidato.tipoContrato || 'temporal'}. Puede requerir avalista solidario en la aseguradora.`);
  }

  if (candidato.avalista) {
    puntosPositivos.push('Cuenta con avalista solidario como garantía complementaria.');
  }

  if (docsObligatoriosCompletos) {
    puntosPositivos.push('Documentación laboral y de identidad aportada y verificada.');
  } else {
    factoresRiesgo.push('Documentación laboral o DNI pendiente de validación completa.');
  }

  // Dictamen final
  let dictamen: EvaluacionAsegurabilidad['dictamen'] = 'APTO_RECOMENDADO';

  if (ratioEsfuerzo <= 38 && (esFuncionarioOPensionista || esIndefinido || candidato.avalista) && score >= 60) {
    dictamen = 'APTO_RECOMENDADO';
    recomendaciones.push('Perfil con alta probabilidad de aceptación directa en aseguradoras de impago (SEAG, Caser, Mutua, Arag).');
    recomendaciones.push('Fianza legal estándar de 1 mensualidad suficiente según LAU.');
  } else if (ratioEsfuerzo <= 45 || score >= 45 || candidato.avalista) {
    dictamen = 'APTO_CON_CONDICIONES';
    recomendaciones.push('Se aconseja solicitar garantía adicional de 1 mes (Art. 36.5 LAU) o incorporar avalista solidario en el contrato.');
    recomendaciones.push('Verificar últimas nóminas y contrato de trabajo antes de la firma.');
  } else {
    dictamen = 'RIESGO_ELEVADO';
    recomendaciones.push('El esfuerzo económico o inestabilidad contractual desaconsejan formalizar sin aval solvente.');
    recomendaciones.push('En caso de proceder, es indispensable un avalista con nómina indefinida y ratio < 35%.');
  }

  // Coste estimado del seguro (aprox 3.8% - 4.5% de la renta anual)
  const rentaAnual = renta * 12;
  const primaEstimadaAnual = Math.round(rentaAnual * 0.04); // 4%
  const primaEstimadaMensual = Math.round(primaEstimadaAnual / 12);

  return {
    dictamen,
    scoreSolvencia: score,
    ratioEsfuerzo,
    ingresosNetosMensuales: ingresosTotales,
    rentaMensual: renta,
    ingresosSobrantes,
    antiguedadSuficiente,
    documentosValidadosCount: docsValidados,
    documentosObligatoriosCompletos: docsObligatoriosCompletos,
    puntosPositivos,
    factoresRiesgo,
    recomendaciones,
    primaEstimadaAnual,
    primaEstimadaMensual,
    coberturasSugeridas: {
      mesesImpago: 12,
      defensaJuridicaImporte: 3000,
      actosVandalicosImporte: 3000,
    },
  };
}

/**
 * Cláusulas predeterminadas recomendadas conforme a la LAU española
 */
export const CLAUSULAS_PREDETERMINADAS: ClausulaPersonalizada[] = [
  {
    id: 'cl-dest-viv',
    titulo: 'Destino Exclusivo a Vivienda Habitual',
    contenido:
      'El inmueble arrendado se destinará única y exclusivamente a vivienda permanente y habitual del Arrendatario y su unidad de convivencia. Queda terminantemente prohibido su destino a actividades profesionales abiertas al público, comerciales, industriales o de uso turístico.',
    activa: true,
    categoria: 'general',
  },
  {
    id: 'cl-subarriendo',
    titulo: 'Prohibición Expresa de Subarriendo y Cesión',
    contenido:
      'Queda expresamente prohibido al Arrendatario la cesión del contrato, así como el subarriendo total o parcial de la vivienda, ni a título oneroso ni gratuito, incluidas plataformas turísticas o de alquiler por habitaciones (Art. 8 LAU). El incumplimiento facultará al Arrendador para la resolución inmediata del contrato.',
    activa: true,
    categoria: 'general',
  },
  {
    id: 'cl-suministros',
    titulo: 'Suministros y Contadores',
    contenido:
      'Los gastos por consumos de electricidad, agua, gas y telecomunicaciones individualizados mediante contador serán de cuenta íntegra y exclusiva del Arrendatario a partir de la fecha de entrega de llaves. El Arrendatario se compromete al cambio de titularidad de los contratos en el plazo máximo de 15 días.',
    activa: true,
    categoria: 'suministros',
  },
  {
    id: 'cl-obras',
    titulo: 'Conservación, Mantenimiento y Prohibición de Obras',
    contenido:
      'El Arrendatario no podrá realizar ningún tipo de obra ni modificación en la vivienda sin la previa autorización expresa y por escrito del Arrendador. Las pequeñas reparaciones que exija el desgaste por el uso ordinario de la vivienda serán de cargo del Arrendatario (Art. 21.4 LAU).',
    activa: true,
    categoria: 'obras',
  },
  {
    id: 'cl-mascotas',
    titulo: 'Tenencia de Animales de Compañía',
    contenido:
      'Se permite la tenencia responsable de animales domésticos, debiendo el Arrendatario garantizar en todo momento la ausencia de ruidos molestos, olores o daños a elementos de la vivienda o a la comunidad. Todo daño ocasionado será reparado con cargo a la fianza/garantía.',
    activa: true,
    categoria: 'mascotas',
  },
  {
    id: 'cl-desistimiento',
    titulo: 'Desistimiento del Contrato e Indemnización',
    contenido:
      'El Arrendatario podrá desistir del contrato una vez transcurridos al menos seis meses de vigencia, comunicándolo con una antelación mínima de 30 días. En tal caso, indemnizará al Arrendador con una cantidad equivalente a una mensualidad de renta por cada año del contrato que reste por cumplir (Art. 11 LAU).',
    activa: true,
    categoria: 'penalizaciones',
  },
  {
    id: 'cl-jurisdiccion',
    titulo: 'Notificaciones y Sumisión Jurisdiccional',
    contenido:
      'Para cualquier controversia derivada del presente contrato, ambas partes se someten a los Juzgados y Tribunales del lugar donde radica la finca arrendada, renunciando a cualquier otro fuero que pudiera corresponderles.',
    activa: true,
    categoria: 'general',
  },
];

/**
 * Crea un borrador de contrato inicial pre-rellenado con datos del candidato, inmueble y perfil
 */
export function crearBorradorContrato(
  candidato: Candidato,
  inmueble: Inmueble,
  userProfile?: UserProfile,
  solicitudDoc?: SolicitudDocumentacion,
  propietarios?: Propietario[]
): ContratoFormalizacion {
  const renta = inmueble.precio || 900;
  const hoy = new Date().toISOString().split('T')[0];
  const evaluacion = evaluarAsegurabilidadCandidato(candidato, inmueble, solicitudDoc);

  // Fecha inicio (1 del mes siguiente o próxima quincena)
  const dateObj = new Date();
  dateObj.setDate(dateObj.getDate() + 7);
  const fechaInicioSugerida = dateObj.toISOString().split('T')[0];

  // Extraer datos fiscales del inmueble si están configurados
  const datosFiscales = inmueble.datosFiscales;
  let propPrincipal = datosFiscales?.propietarioPrincipal;
  let propSecundario = datosFiscales?.segundoPropietario;

  // Si hay lista de propietarios y el inmueble está vinculado a uno, autocompletar
  if (propietarios && propietarios.length > 0) {
    const owner1 = propietarios.find((p) => p.id === (inmueble.propietarioPrincipalId || propPrincipal?.propietarioId));
    if (owner1) {
      propPrincipal = {
        nombre: owner1.nombre,
        nifDni: owner1.nifCif,
        direccion: `${owner1.direccion}${owner1.ciudad ? `, ${owner1.ciudad}` : ''}`,
        telefono: owner1.telefono,
        email: owner1.email,
        esPersonaJuridica:
          owner1.tipoPropietario === 'persona_juridica' ||
          owner1.tipoPropietario === 'comunidad_bienes',
        propietarioId: owner1.id,
      };
    }
    const owner2 = propietarios.find((p) => p.id === (inmueble.propietarioSecundarioId || propSecundario?.propietarioId));
    if (owner2) {
      propSecundario = {
        nombre: owner2.nombre,
        nifDni: owner2.nifCif,
        direccion: `${owner2.direccion}${owner2.ciudad ? `, ${owner2.ciudad}` : ''}`,
        telefono: owner2.telefono,
        email: owner2.email,
        esPersonaJuridica:
          owner2.tipoPropietario === 'persona_juridica' ||
          owner2.tipoPropietario === 'comunidad_bienes',
        propietarioId: owner2.id,
      };
    }
  }

  const tieneSegundoProp = !!((datosFiscales?.tieneSegundoPropietario || inmueble.propietarioSecundarioId) && propSecundario?.nombre?.trim());

  const propNombre = propPrincipal?.nombre?.trim() || userProfile?.nombre || 'Propietario / Arrendador';
  const propDni = propPrincipal?.nifDni?.trim() || '12345678Z';
  const propDir = propPrincipal?.direccion?.trim() || (userProfile?.empresa ? `${userProfile.empresa}, España` : 'Calle Mayor 1, España');
  const propTel = propPrincipal?.telefono?.trim() || userProfile?.telefono || '600000000';
  const propEmail = propPrincipal?.email?.trim() || userProfile?.email || 'propietario@rentselect.es';
  const propIban = datosFiscales?.ibanCobro?.trim() || inmueble.ibanCobro?.trim() || 'ES91 2100 0418 4502 0005 1332';
  const refCatastral = datosFiscales?.referenciaCatastral?.trim() || inmueble.referenciaCatastral || '9876543VK4797S0001TR';
  const codPostal = datosFiscales?.codigoPostal?.trim() || inmueble.codigoPostal || '28001';
  const certEnergetico = datosFiscales?.certificadoEnergetico?.trim() || 'Calificación Energética E (145 kWh/m² año)';

  return {
    id: `cont-${candidato.id}-${Date.now().toString(36)}`,
    token: `cnt-${Math.random().toString(36).substring(2, 9)}`,
    candidatoId: candidato.id,
    inmuebleId: inmueble.id,
    propietarioId: propPrincipal?.propietarioId || inmueble.propietarioId || inmueble.propietarioPrincipalId || undefined,
    solicitudDocId: solicitudDoc?.id,
    esVigente: true,
    modalidadAlquiler: inmueble.modalidadAlquiler || (candidato.habitacionId ? 'habitaciones' : 'completo'),
    habitacionId: candidato.habitacionId,

    // Inmueble
    inmuebleNombre: inmueble.direccion || 'Vivienda en Alquiler',
    inmuebleDireccion: inmueble.direccion || 'Calle Ejemplo, 12, 3º A',
    inmuebleCiudad: inmueble.ciudad || 'Madrid',
    inmuebleCodigoPostal: codPostal,
    inmuebleReferenciaCatastral: refCatastral,
    inmuebleSuperficieM2: inmueble.superficie || 75,
    inmuebleHabitaciones: inmueble.habitaciones || 2,
    inmuebleCertificadoEnergetico: certEnergetico,

    // Arrendador Principal (Propietario)
    propietarioNombre: propNombre,
    propietarioDni: propDni,
    propietarioDireccion: propDir,
    propietarioTelefono: propTel,
    propietarioEmail: propEmail,
    propietarioIban: propIban,
    propietarioEsPersonaJuridica: propPrincipal?.esPersonaJuridica || false,

    // Segundo Propietario (si aplica)
    tieneSegundoPropietario: tieneSegundoProp,
    segundoPropietarioNombre: tieneSegundoProp ? propSecundario?.nombre : '',
    segundoPropietarioDni: tieneSegundoProp ? propSecundario?.nifDni : '',
    segundoPropietarioDireccion: tieneSegundoProp ? (propSecundario?.direccion || propDir) : '',
    segundoPropietarioTelefono: tieneSegundoProp ? propSecundario?.telefono : '',
    segundoPropietarioEmail: tieneSegundoProp ? propSecundario?.email : '',
    segundoPropietarioEsPersonaJuridica: tieneSegundoProp ? propSecundario?.esPersonaJuridica : false,

    // Arrendatario
    candidatoNombre: candidato.nombre,
    candidatoDni: '87654321X',
    candidatoTelefono: candidato.telefono,
    candidatoEmail: candidato.email,
    candidatoDireccionActual: 'Domicilio actual del candidato',

    // Cotitular
    tieneCotitular: !!candidato.cotitular?.nombre,
    cotitularNombre: candidato.cotitular?.nombre || '',
    cotitularDni: '11223344A',
    cotitularTelefono: candidato.cotitular?.telefono || '',
    cotitularEmail: candidato.cotitular?.email || '',

    // Avalista
    tieneAvalista: candidato.avalista,
    avalistaNombre: candidato.avalista ? 'Avalista Garante' : '',
    avalistaDni: '',
    avalistaDireccion: '',
    avalistaTelefono: '',

    // Condiciones Económicas
    rentaMensual: renta,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: renta,
    garantiaAdicionalMeses: evaluacion.dictamen === 'APTO_CON_CONDICIONES' ? 1 : 0,
    garantiaAdicionalImporte: evaluacion.dictamen === 'APTO_CON_CONDICIONES' ? renta : 0,
    fechaInicioContrato: fechaInicioSugerida,
    duracionAnios: 1,
    diaLimitePagoMes: 5,

    // Cláusulas de Configuración
    permitirMascotas: true,
    clausulaMascotasDetalle: 'Animales domésticos con tenencia responsable',
    permitirSubarriendo: false,
    incluyeMueblesInventario: true,
    inventarioDetalle: 'Mobiliario según anexo I (cocina equipada con horno, placa, campana, lavadora, frigorífico y caldera).',
    gastosComunidadCargo: 'arrendador',
    ibiCargo: 'arrendador',
    suministrosCargo: 'arrendatario',
    clausulaDesistimientoAnticipado: true,

    // Cláusulas
    clausulasPersonalizadas: [...CLAUSULAS_PREDETERMINADAS],

    // Estado
    estado: 'BORRADOR_CONTRATO',

    // GAP 2: modalidad contractual y versión de la cadena histórica
    modalidadContractual: (inmueble.modalidadAlquiler || (candidato.habitacionId ? 'habitaciones' : 'completo')) === 'habitaciones' ? 'HABITACION' : 'VIVIENDA_HABITUAL',
    version: 1,

    // Evaluación
    evaluacionAsegurabilidad: evaluacion,

    // Acta de Entrega de Llaves inicial
    actaEntregaLlaves: {
      fechaEntrega: fechaInicioSugerida,
      horaEntrega: '11:00',
      contadorElectricidadKwh: '14250.5',
      contadorAguaM3: '312.4',
      contadorGasM3: '104.2',
      juegosLlavesVivienda: 2,
      juegosLlavesPortal: 2,
      juegosLlavesBuzon: 1,
      juegosLlavesGarajeTrastero: 0,
      estadoPintura: 'bueno',
      estadoLimpieza: 'optimo',
      electrodomesticosRevisados: true,
      inventarioAdjunto: true,
      observacionesEstado: 'Vivienda revisada conjuntamente por ambas partes en perfecto estado de habitabilidad y funcionamiento.',
      firmadaPorAmbasPartes: false,
      fechaFirma: '',
    },

    // Firmas
    firmaArrendador: { firmado: false },
    firmaArrendatario: { firmado: false },

    // Metadatos
    fechaCreacion: new Date().toISOString(),
    fechaActualizacion: new Date().toISOString(),
    historial: [
      {
        id: `h-${Date.now()}`,
        fecha: new Date().toLocaleString('es-ES'),
        autor: 'propietario',
        accion: 'Borrador de contrato generado',
        detalle: `Se generó el borrador para ${candidato.nombre} con renta de ${formatEuro(renta)}/mes`,
      },
    ],
  };
}

/**
 * Genera el documento completo del Contrato de Arrendamiento en texto estructurado
 */
export function generarTextoContratoLAU(contrato: ContratoFormalizacion): string {
  const fianzaTotal = contrato.fianzaLegalImporte + contrato.garantiaAdicionalImporte;
  const garantiaTexto = contrato.garantiaAdicionalMeses > 0
    ? ` y una GARANTÍA ADICIONAL de ${formatEuro(contrato.garantiaAdicionalImporte)} (${contrato.garantiaAdicionalMeses} mensualidad/es conforme al Art. 36.5 LAU)`
    : '';

  const segundoPropietarioTexto = (contrato.tieneSegundoPropietario && contrato.segundoPropietarioNombre)
    ? `\nY D./Dña. ${contrato.segundoPropietarioNombre}, mayor de edad, con DNI/NIF ${contrato.segundoPropietarioDni || '---'}, y con domicilio a efectos de notificaciones en ${contrato.segundoPropietarioDireccion || contrato.propietarioDireccion}${contrato.segundoPropietarioTelefono ? `, teléfono ${contrato.segundoPropietarioTelefono}` : ''}${contrato.segundoPropietarioEmail ? ` y email ${contrato.segundoPropietarioEmail}` : ''}, interviniendo como copropietario/a arrendador/a solidario/a.`
    : '';

  return `CONTRATO DE ARRENDAMIENTO DE VIVIENDA HABITUAL
Sometido a la Ley 29/1994, de 24 de noviembre, de Arrendamientos Urbanos (LAU)

En ${contrato.inmuebleCiudad}, a ${contrato.fechaInicioContrato}

REUNIDOS

DE UNA PARTE, COMO PARTE ARRENDADORA:
D./Dña. ${contrato.propietarioNombre}, mayor de edad, con DNI/NIF ${contrato.propietarioDni}, y con domicilio a efectos de notificaciones en ${contrato.propietarioDireccion}, teléfono ${contrato.propietarioTelefono} y correo electrónico ${contrato.propietarioEmail}.${segundoPropietarioTexto}

DE OTRA PARTE, COMO PARTE ARRENDATARIA:
D./Dña. ${contrato.candidatoNombre}, mayor de edad, con DNI/NIE ${contrato.candidatoDni}, teléfono ${contrato.candidatoTelefono} y correo electrónico ${contrato.candidatoEmail}.${
    contrato.tieneCotitular && contrato.cotitularNombre
      ? `\nY D./Dña. ${contrato.cotitularNombre}, mayor de edad, con DNI/NIE ${contrato.cotitularDni || '---'}, en calidad de cotitular solidario.`
      : ''
  }${
    contrato.tieneAvalista && contrato.avalistaNombre
      ? `\nY D./Dña. ${contrato.avalistaNombre}, con DNI/NIF ${contrato.avalistaDni || '---'}, quien interviene en calidad de AVALISTA SOLIDARIO.`
      : ''
  }

Ambas partes se reconocen mutuamente capacidad legal suficiente para el otorgamiento del presente contrato, y a tal efecto:

EXPONEN

I.- Que la PARTE ARRENDADORA es propietaria de la finca urbana sita en ${contrato.inmuebleDireccion}, ${contrato.inmuebleCiudad} (C.P. ${contrato.inmuebleCodigoPostal || '---'}), con Referencia Catastral ${contrato.inmuebleReferenciaCatastral || '---'}, que dispone de una superficie construida aproximada de ${contrato.inmuebleSuperficieM2 || 75} m² y ${contrato.inmuebleHabitaciones || 2} dormitorios.

II.- Que interesando a la PARTE ARRENDATARIA tomar en arrendamiento dicho inmueble para destinarlo exclusivamente a su VIVIENDA PERMANENTE Y HABITUAL, ambas partes convienen las siguientes:

ESTIPULACIONES

PRIMERA.- OBJETO Y DESTINO.
La PARTE ARRENDADORA cede en arrendamiento a la PARTE ARRENDATARIA la vivienda descrita en el Expositivo I. La vivienda se destinará exclusivamente a satisfacer la necesidad permanente de vivienda del arrendatario y su unidad familiar, no pudiendo destinarse a ningún otro uso sin el consentimiento previo y por escrito del arrendador.

SEGUNDA.- DURACIÓN Y PRÓRROGAS.
El plazo de duración del presente contrato se fija en UN AÑO, con efectos desde el día ${contrato.fechaInicioContrato}. Llegado el día del vencimiento del contrato, éste se prorrogará obligatoriamente por plazos anuales hasta que el arrendamiento alcance una duración mínima de cinco años (o siete años si el arrendador fuese persona jurídica), de conformidad con lo establecido en el artículo 9 de la LAU, salvo que el arrendatario manifieste al arrendador, con treinta días de antelación como mínimo a la fecha de terminación del contrato o de cualquiera de las prórrogas, su voluntad de no renovarlo.

TERCERA.- RENTA Y ACTUALIZACIÓN.
La renta anual se fija en la cantidad de ${formatEuro(contrato.rentaMensual * 12)}, pagadera en mensualidades anticipadas de ${formatEuro(contrato.rentaMensual)} cada una.
El abono se efectuará dentro de los primeros CINCO días de cada mes mediante transferencia o ingreso bancario en la cuenta designada por el arrendador:
IBAN: ${contrato.propietarioIban}
La renta se actualizará en la fecha en que se cumpla cada año de vigencia del contrato, conforme a la variación que experimente el índice legalmente aplicable.

CUARTA.- FIANZA LEGAL Y GARANTÍAS ADICIONALES.
En este acto, la PARTE ARRENDATARIA hace entrega a la PARTE ARRENDADORA de la cantidad de ${formatEuro(contrato.fianzaLegalImporte)}, correspondiente a UNA MENSUALIDAD de renta en concepto de FIANZA LEGAL obligatoria (Art. 36.1 LAU), que será depositada en el organismo público autonómico competente${garantiaTexto}.
Dicha cantidad queda afecta a la restitución de la vivienda en el mismo estado en que se entrega y al cumplimiento de todas las obligaciones dimanantes del presente contrato.

QUINTA.- GASTOS Y SUMINISTROS.
Serán de cuenta exclusiva del Arrendatario los consumos de agua, electricidad, gas, teléfono y cualesquiera otros individualizados mediante contador. Los gastos ordinarios de comunidad de propietarios y el Impuesto sobre Bienes Inmuebles (IBI) serán de cuenta del ${contrato.gastosComunidadCargo === 'arrendador' ? 'Arrendador' : 'Arrendatario'}.

${contrato.clausulasPersonalizadas
  .filter((c) => c.activa)
  .map((c, i) => `SEXTA.${i + 1}.- ${c.titulo.toUpperCase()}.\n${c.contenido}`)
  .join('\n\n')}

Y en prueba de total conformidad con cuanto antecede, las partes firman el presente contrato por duplicado ejemplar y a un solo efecto en el lugar y fecha arriba indicados.

LA PARTE ARRENDADORA                     LA PARTE ARRENDATARIA
D./Dña. ${contrato.propietarioNombre}           D./Dña. ${contrato.candidatoNombre}${
    contrato.tieneSegundoPropietario && contrato.segundoPropietarioNombre
      ? `\nD./Dña. ${contrato.segundoPropietarioNombre} (Copropietario/a)`
      : ''
  }${
    contrato.tieneCotitular && contrato.cotitularNombre
      ? `\nD./Dña. ${contrato.cotitularNombre} (Cotitular)`
      : ''
  }`;
}

/**
 * Genera el documento del Acta de Entrega de Llaves
 */
export function generarTextoActaEntrega(contrato: ContratoFormalizacion): string {
  const acta = contrato.actaEntregaLlaves;
  return `ACTA DE ENTREGA DE LLAVES Y LECTURA DE CONTADORES

Inmueble: ${contrato.inmuebleDireccion}, ${contrato.inmuebleCiudad}
Fecha de Entrega: ${acta.fechaEntrega} ${acta.horaEntrega ? `a las ${acta.horaEntrega} horas` : ''}

REUNIDOS
De una parte, D./Dña. ${contrato.propietarioNombre} (Arrendador)
De otra parte, D./Dña. ${contrato.candidatoNombre} (Arrendatario)

HACEN CONSTAR:

1. ENTREGA DE LLAVES:
La parte Arrendadora hace entrega material a la parte Arrendataria de los siguientes juegos de llaves:
- Llaves de la vivienda: ${acta.juegosLlavesVivienda} juego(s).
- Llaves del portal/acceso: ${acta.juegosLlavesPortal} juego(s).
- Llaves del buzón: ${acta.juegosLlavesBuzon} juego(s).
- Llaves/mandos de garaje/trastero: ${acta.juegosLlavesGarajeTrastero} juego(s).

2. ESTADO DE CONTADORES A FECHA DE ENTRADA:
- Contador Electricidad: ${acta.contadorElectricidadKwh || '---'} kWh
- Contador Agua: ${acta.contadorAguaM3 || '---'} m³
- Contador Gas: ${acta.contadorGasM3 || '---'} m³

3. ESTADO GENERAL Y EQUIPAMIENTO:
- Estado de pintura: ${acta.estadoPintura || 'Bueno'}
- Estado de limpieza: ${acta.estadoLimpieza || 'Óptimo'}
- Electrodomésticos comprobados y en funcionamiento: ${acta.electrodomesticosRevisados ? 'SÍ' : 'NO'}
- Observaciones: ${acta.observacionesEstado || 'Sin desperfectos reseñables.'}

En prueba de conformidad, ambas partes firman la presente acta.

Firma Arrendador: _____________________      Firma Arrendatario: _____________________`;
}

/**
 * Abre una ventana emergente de impresión para el contrato en formato PDF formal
 */
export function imprimirContratoPDF(contrato: ContratoFormalizacion): void {
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (!printWindow) return;

  const segundoPropietarioHTML = (contrato.tieneSegundoPropietario && contrato.segundoPropietarioNombre)
    ? `<br>Y D./Dña. <strong>${contrato.segundoPropietarioNombre}</strong>, con DNI/NIF <strong>${contrato.segundoPropietarioDni || '---'}</strong>, con domicilio en ${contrato.segundoPropietarioDireccion || contrato.propietarioDireccion}${contrato.segundoPropietarioTelefono ? `, teléfono ${contrato.segundoPropietarioTelefono}` : ''}${contrato.segundoPropietarioEmail ? ` y email ${contrato.segundoPropietarioEmail}` : ''}, en calidad de copropietario/a arrendador/a.`
    : '';

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Contrato de Arrendamiento - ${contrato.inmuebleNombre}</title>
  <style>
    body { font-family: 'Times New Roman', Times, serif; color: #111827; padding: 40px; line-height: 1.6; font-size: 12pt; }
    h1 { font-size: 15pt; text-align: center; margin-bottom: 5px; font-weight: bold; }
    h2 { font-size: 11pt; text-align: center; margin-top: 0; margin-bottom: 25px; font-weight: normal; color: #4b5563; }
    .seccion { font-weight: bold; margin-top: 20px; margin-bottom: 8px; text-transform: uppercase; font-size: 11pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; }
    p { margin-bottom: 12px; text-align: justify; }
    .signatures { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 30px; margin-top: 50px; page-break-inside: avoid; }
    .sig-block { border-top: 1px solid #000; padding-top: 8px; text-align: center; min-height: 80px; }
    .clausula-titulo { font-weight: bold; margin-top: 15px; margin-bottom: 4px; }
    .watermark { text-align: center; font-size: 8.5pt; color: #9ca3af; margin-top: 40px; border-top: 1px dashed #e5e7eb; padding-top: 10px; }
    @media print {
      body { padding: 20px; }
      button { display: none !important; }
    }
  </style>
</head>
<body>
  <div style="text-align: right; margin-bottom: 20px;">
    <button onclick="window.print()" style="background:#2563eb;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;font-family:sans-serif;">🖨️ Imprimir / Guardar en PDF</button>
  </div>
  
  <h1>CONTRATO DE ARRENDAMIENTO DE VIVIENDA HABITUAL</h1>
  <h2>Conforme a la Ley 29/1994, de 24 de noviembre, de Arrendamientos Urbanos (LAU)</h2>

  <p>En <strong>${contrato.inmuebleCiudad}</strong>, a <strong>${contrato.fechaInicioContrato}</strong></p>

  <div class="seccion">REUNIDOS</div>
  <p><strong>DE UNA PARTE, COMO PARTE ARRENDADORA:</strong><br>
  D./Dña. <strong>${contrato.propietarioNombre}</strong>, con DNI/NIF <strong>${contrato.propietarioDni}</strong>, con domicilio en ${contrato.propietarioDireccion}, teléfono ${contrato.propietarioTelefono} y email ${contrato.propietarioEmail}.${segundoPropietarioHTML}</p>

  <p><strong>DE OTRA PARTE, COMO PARTE ARRENDATARIA:</strong><br>
  D./Dña. <strong>${contrato.candidatoNombre}</strong>, con DNI/NIE <strong>${contrato.candidatoDni}</strong>, teléfono ${contrato.candidatoTelefono} y email ${contrato.candidatoEmail}.${
    contrato.tieneCotitular && contrato.cotitularNombre
      ? `<br>Y D./Dña. <strong>${contrato.cotitularNombre}</strong>, con DNI/NIE <strong>${contrato.cotitularDni || '---'}</strong>, como cotitular solidario.`
      : ''
  }${
    contrato.tieneAvalista && contrato.avalistaNombre
      ? `<br>Y D./Dña. <strong>${contrato.avalistaNombre}</strong>, con DNI/NIF <strong>${contrato.avalistaDni || '---'}</strong>, como AVALISTA SOLIDARIO.`
      : ''
  }</p>

  <div class="seccion">EXPONEN</div>
  <p><strong>I.-</strong> Que la PARTE ARRENDADORA es propietaria en pleno dominio del inmueble sito en <strong>${contrato.inmuebleDireccion}, ${contrato.inmuebleCiudad}</strong> (C.P. ${contrato.inmuebleCodigoPostal || '---'}, Ref. Catastral: <em>${contrato.inmuebleReferenciaCatastral || '---'}</em>, Sup.: ${contrato.inmuebleSuperficieM2 || 75} m²).</p>
  <p><strong>II.-</strong> Que convienen el arrendamiento del citado inmueble con sujeción a las siguientes:</p>

  <div class="seccion">ESTIPULACIONES</div>
  
  <div class="clausula-titulo">PRIMERA.- OBJETO Y DESTINO.</div>
  <p>El inmueble se destina exclusivamente a satisfacer la necesidad de vivienda permanente y habitual del Arrendatario y sus convivientes.</p>

  <div class="clausula-titulo">SEGUNDA.- DURACIÓN Y PRÓRROGAS.</div>
  <p>El plazo de duración pactado es de <strong>UN AÑO</strong> a contar desde el <strong>${contrato.fechaInicioContrato}</strong>, prorrogable anualmente hasta cinco años (o siete si es persona jurídica) según el Art. 9 de la LAU.</p>

  <div class="clausula-titulo">TERCERA.- RENTA Y PAGO.</div>
  <p>La renta mensual se fija en <strong>${formatEuro(contrato.rentaMensual)}</strong>, pagadera en los primeros cinco días de cada mes en la cuenta IBAN <strong>${contrato.propietarioIban}</strong>.</p>

  <div class="clausula-titulo">CUARTA.- FIANZA LEGAL Y GARANTÍA ADICIONAL.</div>
  <p>Se hace entrega de <strong>${formatEuro(contrato.fianzaLegalImporte)}</strong> en concepto de fianza legal obligatoria (1 mes)${
    contrato.garantiaAdicionalImporte > 0
      ? ` y <strong>${formatEuro(contrato.garantiaAdicionalImporte)}</strong> en concepto de garantía complementaria pactada (Art. 36.5 LAU)`
      : ''
  }.</p>

  <div class="clausula-titulo">QUINTA.- SUMINISTROS Y GASTOS.</div>
  <p>Los suministros con contador individual serán a cargo del Arrendatario. El IBI y comunidad de propietarios a cargo del ${contrato.gastosComunidadCargo === 'arrendador' ? 'Arrendador' : 'Arrendatario'}.</p>

  ${contrato.clausulasPersonalizadas
    .filter((c) => c.activa)
    .map(
      (c, i) => `
    <div class="clausula-titulo">SEXTA.${i + 1}.- ${c.titulo.toUpperCase()}.</div>
    <p>${c.contenido}</p>`
    )
    .join('')}

  <div class="signatures">
    <div class="sig-block">
      <p><strong>PARTE ARRENDADORA</strong></p>
      <p style="font-size: 10pt; color: #4b5563; margin-top: 30px;">Fdo.: ${contrato.propietarioNombre}</p>
    </div>
    ${
      contrato.tieneSegundoPropietario && contrato.segundoPropietarioNombre
        ? `<div class="sig-block">
            <p><strong>COPROPIETARIO/A ARRENDADOR/A</strong></p>
            <p style="font-size: 10pt; color: #4b5563; margin-top: 30px;">Fdo.: ${contrato.segundoPropietarioNombre}</p>
          </div>`
        : ''
    }
    <div class="sig-block">
      <p><strong>PARTE ARRENDATARIA</strong></p>
      <p style="font-size: 10pt; color: #4b5563; margin-top: 30px;">Fdo.: ${contrato.candidatoNombre}</p>
    </div>
    ${
      contrato.tieneCotitular && contrato.cotitularNombre
        ? `<div class="sig-block">
            <p><strong>COTITULAR ARRENDATARIO/A</strong></p>
            <p style="font-size: 10pt; color: #4b5563; margin-top: 30px;">Fdo.: ${contrato.cotitularNombre}</p>
          </div>`
        : ''
    }
    ${
      contrato.tieneAvalista && contrato.avalistaNombre
        ? `<div class="sig-block">
            <p><strong>AVALISTA SOLIDARIO/A</strong></p>
            <p style="font-size: 10pt; color: #4b5563; margin-top: 30px;">Fdo.: ${contrato.avalistaNombre}</p>
          </div>`
        : ''
    }
  </div>

  <div class="watermark">Documento formalizado electrónicamente mediante RentSelect • Inmueble Ref. Catastral: ${contrato.inmuebleReferenciaCatastral || '---'}</div>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Obtiene la etiqueta y estilos correspondientes a cada estado de formalización
 */
export function getFormalizacionEstadoInfo(estado: EstadoFormalizacion): {
  label: string;
  badgeClass: string;
  iconName: string;
} {
  switch (estado) {
    case 'EN_ESTUDIO':
      return {
        label: 'En Estudio',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        iconName: 'Clock',
      };
    case 'ADJUDICADO':
      return {
        label: 'Adjudicado',
        badgeClass: 'bg-indigo-100 text-indigo-700 border-indigo-200',
        iconName: 'UserCheck',
      };
    case 'BORRADOR_CONTRATO':
      return {
        label: 'Borrador Contrato',
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
        iconName: 'FileText',
      };
    case 'ENVIADO_FIRMA':
      return {
        label: 'Enviado para Firma',
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
        iconName: 'Send',
      };
    case 'FIRMADO':
      return {
        label: 'Contrato Firmado',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        iconName: 'CheckCircle2',
      };
    case 'FIANZA_DEPOSITADA':
      return {
        label: 'Fianza Recibida',
        badgeClass: 'bg-teal-100 text-teal-700 border-teal-200',
        iconName: 'Euro',
      };
    case 'FORMALIZADO_ACTIVO':
      return {
        label: 'Formalizado (Activo)',
        badgeClass: 'bg-purple-100 text-purple-700 border-purple-200',
        iconName: 'Key',
      };
    case 'FINALIZADO':
      return {
        label: 'Finalizado (Histórico)',
        badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
        iconName: 'Archive',
      };
    case 'RESCINDIDO':
      return {
        label: 'Rescindido',
        badgeClass: 'bg-orange-100 text-orange-700 border-orange-200',
        iconName: 'AlertTriangle',
      };
    case 'CANCELADO':
      return {
        label: 'Cancelado',
        badgeClass: 'bg-red-100 text-red-700 border-red-200',
        iconName: 'XCircle',
      };
    default:
      return {
        label: 'En Trámite',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        iconName: 'Clock',
      };
  }
}
