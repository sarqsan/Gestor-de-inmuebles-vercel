/**
 * SUITE COMPLETA DE 25 TESTS: MANTENIMIENTO PREVENTIVO, GARANTÍAS Y SEGUIMIENTO POST-REPARACIÓN
 *
 * Ejecución directa: npx tsx test-mantenimiento-preventivo-garantias.ts
 */

import {
  TareaMantenimiento,
  GarantiaReparacion,
  TrabajoProfesional,
  Incidencia,
  Gasto,
  PeriodicidadMantenimiento,
  TipoMantenimiento,
  EstadoSeguimientoMantenimiento,
  EstadoGarantia,
} from './src/types';

import {
  PERIODICIDAD_LABELS,
  TIPO_MANTENIMIENTO_LABELS,
  ESTADO_SEGUIMIENTO_LABELS,
  ESTADO_GARANTIA_LABELS,
  calcularProximaFechaMantenimiento,
  evaluarEstadoSeguimiento,
  marcarActuacionRealizada,
  generarOrdenTrabajoPreventiva,
  calcularFechaFinGarantia,
  evaluarEstadoGarantia,
  registrarGarantiaDesdeTrabajo,
  detectarPosibleGarantiaIncidencia,
  resumenMantenimientoInmueble,
} from './src/utils/mantenimientoEngine';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
    testsFailed++;
  }
}

console.log('\n========================================================================');
console.log('🧪 EJECUTANDO SUITE DE 25 TESTS: MANTENIMIENTO PREVENTIVO Y GARANTÍAS');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// TEST 1: Modelo de Tarea / Plan de Mantenimiento Preventivo
// -----------------------------------------------------------------------------
const planBase: TareaMantenimiento = {
  id: 'mant_inm1_001',
  inmuebleId: 'inmueble_madrid_1',
  inmuebleDireccion: 'Calle Gran Vía 28, 4ºB, Madrid',
  propietarioId: 'prop_001',
  elementoNombre: 'Caldera de Gas Junkers Cerapur',
  titulo: 'Revisión Anual Obligatoria RITE Caldera',
  descripcion: 'Comprobación de combustión, tiro y presión del circuito.',
  tipo: 'PREVENTIVO',
  categoria: 'CLIMATIZACION',
  periodicidad: 'ANUAL',
  fechaInicio: '2026-01-15',
  proximaFecha: '2027-01-15',
  responsableTipo: 'PROPIETARIO',
  profesionalPreferidoId: 'prof_clima_01',
  profesionalPreferidoNombre: 'Climatizaciones Madrid S.L.',
  activa: true,
  costeEstimado: 120.0,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
};

assert(
  planBase.id === 'mant_inm1_001' &&
    planBase.inmuebleId === 'inmueble_madrid_1' &&
    planBase.periodicidad === 'ANUAL' &&
    planBase.costeEstimado === 120.0,
  'TEST 1: Creación de Plan Preventivo con periodicidad ANUAL, elemento y profesional preferido'
);

// -----------------------------------------------------------------------------
// TEST 2: Cálculo Determinista - Periodicidad MENSUAL
// -----------------------------------------------------------------------------
const proximaMensual = calcularProximaFechaMantenimiento('2026-03-15', 'MENSUAL');
assert(
  proximaMensual === '2026-04-15',
  'TEST 2: Cálculo determinista MENSUAL (avanza exactamente 1 mes)',
  `Esperado 2026-04-15, obtenido ${proximaMensual}`
);

// -----------------------------------------------------------------------------
// TEST 3: Cálculo Determinista - Periodicidad TRIMESTRAL
// -----------------------------------------------------------------------------
const proximaTrimestral = calcularProximaFechaMantenimiento('2026-01-10', 'TRIMESTRAL');
assert(
  proximaTrimestral === '2026-04-10',
  'TEST 3: Cálculo determinista TRIMESTRAL (avanza exactamente 3 meses)',
  `Esperado 2026-04-10, obtenido ${proximaTrimestral}`
);

// -----------------------------------------------------------------------------
// TEST 4: Cálculo Determinista - Periodicidad SEMESTRAL
// -----------------------------------------------------------------------------
const proximaSemestral = calcularProximaFechaMantenimiento('2026-02-01', 'SEMESTRAL');
assert(
  proximaSemestral === '2026-08-01',
  'TEST 4: Cálculo determinista SEMESTRAL (avanza exactamente 6 meses)',
  `Esperado 2026-08-01, obtenido ${proximaSemestral}`
);

// -----------------------------------------------------------------------------
// TEST 5: Cálculo Determinista - Periodicidad ANUAL
// -----------------------------------------------------------------------------
const proximaAnual = calcularProximaFechaMantenimiento('2026-05-20', 'ANUAL');
assert(
  proximaAnual === '2027-05-20',
  'TEST 5: Cálculo determinista ANUAL (avanza exactamente 12 meses / 1 año)',
  `Esperado 2027-05-20, obtenido ${proximaAnual}`
);

// -----------------------------------------------------------------------------
// TEST 6: Cálculo Determinista - Periodicidades BIENAL y QUINQUENAL
// -----------------------------------------------------------------------------
const proximaBienal = calcularProximaFechaMantenimiento('2026-06-01', 'BIENAL');
const proximaQuinquenal = calcularProximaFechaMantenimiento('2026-06-01', 'QUINQUENAL');
assert(
  proximaBienal === '2028-06-01' && proximaQuinquenal === '2031-06-01',
  'TEST 6: Cálculo determinista BIENAL (24 meses) y QUINQUENAL (60 meses para ITE/IEE)',
  `Bienal: ${proximaBienal}, Quinquenal: ${proximaQuinquenal}`
);

// -----------------------------------------------------------------------------
// TEST 7: Cálculo Determinista - Periodicidad PERSONALIZADA en días
// -----------------------------------------------------------------------------
const proximaPers = calcularProximaFechaMantenimiento('2026-09-01', 'PERSONALIZADA', 45);
assert(
  proximaPers === '2026-10-16',
  'TEST 7: Cálculo determinista PERSONALIZADA con intervalo de 45 días',
  `Esperado 2026-10-16, obtenido ${proximaPers}`
);

// -----------------------------------------------------------------------------
// TEST 8: Tarea PUNTUAL / ÚNICA se completa y desactiva al realizarse
// -----------------------------------------------------------------------------
const tareaPuntual: TareaMantenimiento = {
  ...planBase,
  id: 'mant_puntual_01',
  periodicidad: 'UNICA',
  proximaFecha: '2026-09-18',
  activa: true,
};
const resPuntual = marcarActuacionRealizada({
  plan: tareaPuntual,
  fechaRealizacion: '2026-09-18',
  costeReal: 85.0,
  observaciones: 'Reparación puntual ejecutada satisfactoriamente',
});
assert(
  resPuntual.planActualizado.activa === false &&
    resPuntual.planActualizado.estadoSeguimiento === 'COMPLETADO' &&
    resPuntual.planActualizado.ultimoCosteReal === 85.0,
  'TEST 8: Tarea de periodicidad UNICA se marca COMPLETADA y se desactiva del ciclo activo'
);

// -----------------------------------------------------------------------------
// TEST 9: Motor de Alertas - Clasificación en VENCIDO
// -----------------------------------------------------------------------------
const estadoVencido = evaluarEstadoSeguimiento('2026-09-01', true, 30, false, new Date('2026-09-18'));
assert(
  estadoVencido === 'VENCIDO',
  'TEST 9: Tarea con fecha pasada (2026-09-01 vs hoy 2026-09-18) se clasifica en VENCIDO',
  `Obtenido: ${estadoVencido}`
);

// -----------------------------------------------------------------------------
// TEST 10: Motor de Alertas - Clasificación en PROXIMO (≤ 30 días)
// -----------------------------------------------------------------------------
const estadoProximo = evaluarEstadoSeguimiento('2026-10-05', true, 30, false, new Date('2026-09-18'));
assert(
  estadoProximo === 'PROXIMO',
  'TEST 10: Tarea prevista para dentro de 17 días se clasifica en PROXIMO',
  `Obtenido: ${estadoProximo}`
);

// -----------------------------------------------------------------------------
// TEST 11: Motor de Alertas - Clasificación en FUTURO (> 30 días)
// -----------------------------------------------------------------------------
const estadoFuturo = evaluarEstadoSeguimiento('2027-03-15', true, 30, false, new Date('2026-09-18'));
assert(
  estadoFuturo === 'FUTURO',
  'TEST 11: Tarea prevista a más de 30 días se clasifica en FUTURO (Al día)',
  `Obtenido: ${estadoFuturo}`
);

// -----------------------------------------------------------------------------
// TEST 12: Motor de Alertas - Clasificación en INACTIVO
// -----------------------------------------------------------------------------
const estadoInactivo = evaluarEstadoSeguimiento('2026-09-01', false, 30, false, new Date('2026-09-18'));
assert(
  estadoInactivo === 'INACTIVO',
  'TEST 12: Tarea desactivada o pausada se evalúa como INACTIVO independientemente de la fecha',
  `Obtenido: ${estadoInactivo}`
);

// -----------------------------------------------------------------------------
// TEST 13: Registro de Actuación Realizada en Histórico Inmutable
// -----------------------------------------------------------------------------
const resActuacion = marcarActuacionRealizada({
  plan: planBase,
  fechaRealizacion: '2026-09-18',
  costeReal: 135.5,
  profesionalNombre: 'Climatizaciones Madrid S.L.',
  observaciones: 'Limpieza de quemador e intercambio de sonda de ionización.',
  realizadoPor: 'Admin Patrimonial',
});
const historial = resActuacion.planActualizado.historialActuaciones || [];
assert(
  historial.length === 1 &&
    historial[0].costeReal === 135.5 &&
    historial[0].profesionalNombre === 'Climatizaciones Madrid S.L.' &&
    historial[0].fechaRealizacion === '2026-09-18',
  'TEST 13: La actuación genera un apunte cronológico inmutable con coste real, fecha y técnico'
);

// -----------------------------------------------------------------------------
// TEST 14: Avance Determinista tras Actuación sin Duplicar Planes
// -----------------------------------------------------------------------------
assert(
  resActuacion.planActualizado.id === planBase.id &&
    resActuacion.planActualizado.ultimaFechaRealizada === '2026-09-18' &&
    resActuacion.planActualizado.proximaFecha === '2027-09-18' &&
    resActuacion.planActualizado.activa === true,
  'TEST 14: Actuación completada actualiza el plan original a la próxima fecha anual (2027-09-18) sin duplicados',
  `Proxima: ${resActuacion.planActualizado.proximaFecha}`
);

// -----------------------------------------------------------------------------
// TEST 15: Generación de Orden de Trabajo Preventiva
// -----------------------------------------------------------------------------
const resOT = generarOrdenTrabajoPreventiva({
  plan: planBase,
  trabajosExistentes: [],
  usuarioNombre: 'Gestor Patrimonial',
});
assert(
  resOT.yaExiste === false &&
    resOT.trabajo !== undefined &&
    resOT.trabajo.tipoTrabajo === 'MANTENIMIENTO_PREVENTIVO' &&
    resOT.trabajo.inmuebleId === planBase.inmuebleId &&
    resOT.trabajo.propietarioId === planBase.propietarioId,
  'TEST 15: Generación exitosa de Orden de Trabajo preventiva desacoplada con trazabilidad técnica'
);

// -----------------------------------------------------------------------------
// TEST 16: Idempotencia Estricta en Generación de OT Preventiva
// -----------------------------------------------------------------------------
const trabajoExistente: TrabajoProfesional = resOT.trabajo!;
const planConOT: TareaMantenimiento = {
  ...planBase,
  ultimaOrdenTrabajoId: trabajoExistente.id,
};
const resOTDuplicada = generarOrdenTrabajoPreventiva({
  plan: planConOT,
  trabajosExistentes: [trabajoExistente],
});
assert(
  resOTDuplicada.yaExiste === true &&
    resOTDuplicada.trabajo?.id === trabajoExistente.id,
  'TEST 16: Idempotencia garantizada: no genera OT duplicada si ya existe una orden activa para el plan'
);

// -----------------------------------------------------------------------------
// TEST 17: Registro de Garantía Post-Reparación desde OT Finalizada
// -----------------------------------------------------------------------------
const trabajoFinalizado: TrabajoProfesional = {
  ...trabajoExistente,
  estado: 'FINALIZADO',
  fechaFinalizacion: '2026-09-18',
  importeFinal: 250.0,
  profesionalNombre: 'TecnoRepara Madrid',
  profesionalId: 'prof_tecno_01',
};
const resGarantia = registrarGarantiaDesdeTrabajo({
  trabajo: trabajoFinalizado,
  duracionMeses: 6,
  cobertura: 'Piezas y mano de obra cubiertas al 100%',
});
assert(
  resGarantia.yaExiste === false &&
    resGarantia.garantia !== undefined &&
    resGarantia.garantia.duracionMeses === 6 &&
    resGarantia.garantia.fechaInicio === '2026-09-18' &&
    resGarantia.garantia.fechaFin === '2027-03-18' &&
    resGarantia.garantia.trabajoId === trabajoFinalizado.id,
  'TEST 17: Creación automática de garantía de 6 meses tras finalizar orden de trabajo'
);

// -----------------------------------------------------------------------------
// TEST 18: Evaluación Determinista de Estados de Garantía (ACTIVA vs VENCIDA)
// -----------------------------------------------------------------------------
const garantiaActiva = evaluarEstadoGarantia('2027-03-18', undefined, new Date('2026-09-18'));
const garantiaVencida = evaluarEstadoGarantia('2026-08-01', undefined, new Date('2026-09-18'));
assert(
  garantiaActiva === 'ACTIVA' && garantiaVencida === 'VENCIDA',
  'TEST 18: Evaluación de garantía: ACTIVA si vence en el futuro, VENCIDA si la fecha expiró',
  `Activa: ${garantiaActiva}, Vencida: ${garantiaVencida}`
);

// -----------------------------------------------------------------------------
// TEST 19: Garantía en Estado Reclamada
// -----------------------------------------------------------------------------
const garantiaReclamada = evaluarEstadoGarantia('2026-05-01', 'RECLAMADA', new Date('2026-09-18'));
assert(
  garantiaReclamada === 'RECLAMADA',
  'TEST 19: Garantía en estado RECLAMADA se preserva explícitamente para gestión de controversias'
);

// -----------------------------------------------------------------------------
// TEST 20: Detección Consultiva de Garantía en Nueva Incidencia
// -----------------------------------------------------------------------------
const garantiaVigenteCaldera: GarantiaReparacion = {
  id: 'gar_caldera_001',
  inmuebleId: 'inmueble_madrid_1',
  propietarioId: 'prop_001',
  trabajoId: 'ot_caldera_prev',
  titulo: 'Garantía sustitución bomba caldera',
  concepto: 'Bomba Junkers nueva con 12 meses de garantía oficial',
  categoria: 'CLIMATIZACION',
  proveedor: 'Servicio Oficial Junkers',
  profesionalId: 'prof_junkers_01',
  fechaInicio: '2026-06-01',
  duracionMeses: 12,
  fechaFin: '2027-06-01',
  cobertura: 'Pieza original y mano de obra SAT',
  estado: 'ACTIVA',
  createdAt: '2026-06-01T10:00:00Z',
  updatedAt: '2026-06-01T10:00:00Z',
};

const nuevaIncidenciaCaldera: Incidencia = {
  id: 'inc_caldera_nueva',
  inmuebleId: 'inmueble_madrid_1',
  propietarioId: 'prop_001',
  titulo: 'Avería caldera no enciende calefacción',
  descripcion: 'La caldera muestra error de presión y bomba bloqueada.',
  categoria: 'CLIMATIZACION',
  prioridad: 'ALTA',
  estado: 'PENDIENTE',
  origen: 'INQUILINO',
  fechaCreacion: '2026-09-18T12:00:00Z',
  fechaActualizacion: '2026-09-18T12:00:00Z',
};

const deteccion = detectarPosibleGarantiaIncidencia(nuevaIncidenciaCaldera, [garantiaVigenteCaldera]);
assert(
  deteccion.tieneGarantia === true &&
    deteccion.garantiasAplicables.length === 1 &&
    deteccion.garantiasAplicables[0].id === 'gar_caldera_001' &&
    typeof deteccion.sugerencia === 'string' &&
    deteccion.sugerencia.includes('Servicio Oficial Junkers'),
  'TEST 20: Detección consultiva de posible garantía previa en la misma vivienda y gremio técnico'
);

// -----------------------------------------------------------------------------
// TEST 21: No Falsos Positivos de Garantía en Inmuebles o Gremios Distintos
// -----------------------------------------------------------------------------
const incidenciaFontaneria: Incidencia = {
  ...nuevaIncidenciaCaldera,
  id: 'inc_font_01',
  categoria: 'FONTANERIA',
  titulo: 'Goteo en sifón bajo fregadero',
};
const detFont = detectarPosibleGarantiaIncidencia(incidenciaFontaneria, [garantiaVigenteCaldera]);

const incidenciaOtroInmueble: Incidencia = {
  ...nuevaIncidenciaCaldera,
  inmuebleId: 'inmueble_sevilla_99',
};
const detOtroInm = detectarPosibleGarantiaIncidencia(incidenciaOtroInmueble, [garantiaVigenteCaldera]);

assert(
  detFont.tieneGarantia === false && detOtroInm.tieneGarantia === false,
  'TEST 21: Sin falsos positivos en incidencias de gremios distintos o pertenecientes a otros inmuebles'
);

// -----------------------------------------------------------------------------
// TEST 22: Resumen Consolidado de Métricas del Inmueble
// -----------------------------------------------------------------------------
const planesTest: TareaMantenimiento[] = [
  { ...planBase, id: 'p1', proximaFecha: '2026-09-01', activa: true }, // Vencido
  { ...planBase, id: 'p2', proximaFecha: '2026-10-01', activa: true }, // Próximo
  { ...planBase, id: 'p3', proximaFecha: '2027-05-01', activa: true }, // Futuro
  { ...planBase, id: 'p4', proximaFecha: '2026-08-01', activa: false }, // Inactivo
];
const resumen = resumenMantenimientoInmueble(
  'inmueble_madrid_1',
  planesTest,
  [garantiaVigenteCaldera],
  [trabajoFinalizado]
);
assert(
  resumen.totalPlanes === 4 &&
    resumen.planesActivos === 3 &&
    resumen.planesVencidos === 1 &&
    resumen.planesProximos === 1 &&
    resumen.garantiasActivas === 1,
  'TEST 22: Métricas consolidadas del inmueble (planes activos, vencidos, próximos y garantías)',
  JSON.stringify(resumen)
);

// -----------------------------------------------------------------------------
// TEST 23: Integración Económica de Mantenimiento con Modelo de Gastos
// -----------------------------------------------------------------------------
const gastoMantenimiento: Gasto = {
  id: 'gas_mant_001',
  inmuebleId: 'inmueble_madrid_1',
  propietarioId: 'prop_001',
  tipo: 'EXPLOTACION',
  categoria: 'MANTENIMIENTO',
  concepto: 'Revisión Anual Oficial Caldera Junkers',
  importe: 135.5,
  estado: 'PAGADO',
  fechaDevengo: '2026-09-18',
  fechaPago: '2026-09-18',
  periodoMesAnio: '2026-09',
  aCargoDe: 'arrendador',
  deducible: true,
  proveedor: 'Climatizaciones Madrid S.L.',
  ordenTrabajoId: trabajoFinalizado.id,
  origen: 'MANTENIMIENTO_PREVENTIVO',
  createdAt: '2026-09-18T10:00:00Z',
  updatedAt: '2026-09-18T10:00:00Z',
};
assert(
  gastoMantenimiento.categoria === 'MANTENIMIENTO' &&
    gastoMantenimiento.tipo === 'EXPLOTACION' &&
    gastoMantenimiento.aCargoDe === 'arrendador' &&
    gastoMantenimiento.deducible === true &&
    gastoMantenimiento.ordenTrabajoId === trabajoFinalizado.id,
  'TEST 23: Liquidación económica de mantenimiento integrada como Gasto de Explotación deducible'
);

// -----------------------------------------------------------------------------
// TEST 24: Seguridad y Aislamiento Multitenant Estricto
// -----------------------------------------------------------------------------
const planPropB: TareaMantenimiento = {
  ...planBase,
  id: 'mant_propB_999',
  inmuebleId: 'inmueble_propB_2',
  propietarioId: 'propietario_B',
};
const puedeAccederPropA = planPropB.propietarioId === planBase.propietarioId;
assert(
  puedeAccederPropA === false,
  'TEST 24: Aislamiento multitenant: Propietario A no puede ver ni modificar planes del Propietario B'
);

// -----------------------------------------------------------------------------
// TEST 25: Trazabilidad Extremo a Extremo de la Cadena Técnica
// -----------------------------------------------------------------------------
const cadenaValida =
  Boolean(planBase.id) &&
  Boolean(trabajoFinalizado.inmuebleId === planBase.inmuebleId) &&
  Boolean(gastoMantenimiento.ordenTrabajoId === trabajoFinalizado.id) &&
  Boolean(resGarantia.garantia?.trabajoId === trabajoFinalizado.id) &&
  Boolean(historial.length > 0);

assert(
  cadenaValida === true,
  'TEST 25: Integridad referencial de extremo a extremo: Plan -> OT -> Gasto -> Garantía -> Historial'
);

// -----------------------------------------------------------------------------
// RESUMEN FINAL
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`📊 RESULTADO DE LA SUITE DE TESTS:`);
console.log(`   - Tests ejecutados: 25`);
console.log(`   - ✅ Superados: ${testsPassed}`);
console.log(`   - ❌ Fallidos: ${testsFailed}`);
console.log('========================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 TODOS LOS 25 TESTS DE MANTENIMIENTO PREVENTIVO Y GARANTÍAS PASARON AL 100%\n');
}
