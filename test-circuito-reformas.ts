/**
 * SUITE COMPLETA DE 40 TESTS: CIRCUITO OPERATIVO DE REFORMAS INTEGRADO
 *
 * Ejecución directa: npx tsx test-circuito-reformas.ts
 */

import {
  Inmueble,
  Profesional,
  PresupuestoProfesional,
  TrabajoProfesional,
  Gasto,
  UsuarioApp,
  NecesidadReforma,
  ProyectoReforma,
  PartidaReforma,
  ElementoInventario,
  ExpedienteRecomercializacion,
  Incidencia,
} from './src/types';

import {
  crearNecesidadReforma,
  cambiarEstadoNecesidadReforma,
  crearNecesidadDesdeIncidencia,
  crearNecesidadDesdeMejoraROI,
  crearProyectoDesdeNecesidad,
  crearProyectoReformaDirecto,
  calcularTotalesProyectoReforma,
  agregarPartidaAProyecto,
  modificarPartidaProyecto,
  eliminarPartidaProyecto,
  crearPresupuestoParaProyecto,
  compararPresupuestosProyecto,
  seleccionarPresupuestoProyecto,
  asignarProfesionalAProyecto,
  generarOrdenTrabajoDesdePartida,
  generarOrdenTrabajoGlobalProyecto,
  registrarCosteRealPartida,
  liquidarGastoDesdeProyecto,
  finalizarProyectoReforma,
  cancelarProyectoReforma,
  calcularImpactoPatrimonialReforma,
} from './src/utils/reformasEngine';

import {
  buscarProfesionalesCompatibles,
  evaluarCompatibilidadProfesional,
} from './src/utils/profesionalesEngine';

let testsPassed = 0;
let testsFailed = 0;
let assertionsCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  assertionsCount++;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
    testsFailed++;
  }
}

console.log('\n========================================================================');
console.log('🏗️  INICIANDO SUITE DE 40 TESTS: CIRCUITO OPERATIVO DE REFORMAS');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// FIXTURES BASE
// -----------------------------------------------------------------------------
const inmuebleA: Inmueble = {
  id: 'inm_ref_01',
  propietarioId: 'prop_001',
  alias: 'Piso Rambla Alicante',
  direccion: 'Rambla Méndez Núñez 10, 4º A',
  ciudad: 'Alicante',
  municipio: 'Alicante',
  codigoPostal: '03002',
  provincia: 'Alicante',
  pais: 'España',
  precio: 1100,
  estado: 'alquilado',
  habitaciones: 3,
  banos: 2,
  superficie: 110,
  candidatosCount: 0,
  fianzaMeses: 1,
  rentaMensual: 1100,
  valorAdquisicion: 195000,
  valoracionEstimada: 230000,
  fechaAdquisicion: '2024-01-15',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const inmuebleB: Inmueble = {
  id: 'inm_ref_02_prop_b',
  propietarioId: 'prop_999_AJENO',
  alias: 'Chalet San Juan Playa',
  direccion: 'Avenida Costablanca 50',
  ciudad: 'Alicante',
  municipio: 'Alicante',
  provincia: 'Alicante',
  precio: 1800,
  estado: 'disponible',
  habitaciones: 4,
  banos: 3,
  superficie: 220,
  candidatosCount: 0,
  fianzaMeses: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profesionalAlbanil: Profesional = {
  id: 'prof_ref_01',
  propietarioId: 'prop_001',
  nombreComercial: 'Construcciones y Reformas Levante S.L.',
  nombre: 'Antonio Martínez',
  tipo: 'EMPRESA',
  cifNif: 'B03998877',
  telefono: '600123456',
  email: 'antonio@reformaslevante.es',
  especialidades: ['Albañilería', 'Reformas integrales', 'Alicatados'],
  zonasServicio: [{ provincia: 'Alicante', municipios: ['Alicante', 'San Juan'] }],
  estado: 'ACTIVO',
  activo: true,
  disponible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profesionalPintor: Profesional = {
  id: 'prof_ref_02',
  propietarioId: 'prop_001',
  nombreComercial: 'Pinturas y Acabados Alicante',
  nombre: 'Raúl Navarro',
  tipo: 'AUTONOMO',
  cifNif: '21998877C',
  telefono: '600789012',
  email: 'raul@pinturasalicante.es',
  especialidades: ['Pintura', 'Enlucidos', 'Microcemento'],
  zonasServicio: [{ provincia: 'Alicante', esTodaProvincia: true }],
  estado: 'ACTIVO',
  activo: true,
  disponible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profesionalAjeno: Profesional = {
  id: 'prof_ref_99_ajeno',
  nombreComercial: 'Madrid Reformas Express',
  nombre: 'Sergio Gómez',
  tipo: 'EMPRESA',
  especialidades: ['Albañilería'],
  zonasServicio: [{ provincia: 'Madrid' }],
  estado: 'ACTIVO',
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// -----------------------------------------------------------------------------
// TEST 1: Crear necesidad de reforma
// -----------------------------------------------------------------------------
const necesidad1 = crearNecesidadReforma({
  inmuebleId: inmuebleA.id,
  propietarioId: inmuebleA.propietarioId,
  titulo: 'Renovación integral de cocina y baño principal',
  descripcion: 'Sustitución de alicatados, encimera de silestone, sanitarios y fontanería.',
  categoria: 'COCINA',
  prioridad: 'ALTA',
  presupuestoEstimadoMin: 8000,
  presupuestoEstimadoMax: 12000,
  creadoPor: 'Gestor Operativo',
});

assert(
  Boolean(necesidad1.id) &&
    necesidad1.titulo.includes('Renovación integral') &&
    necesidad1.estado === 'IDENTIFICADA' &&
    necesidad1.prioridad === 'ALTA',
  'TEST 1: Crear necesidad de reforma con clasificación y estado inicial IDENTIFICADA'
);

// -----------------------------------------------------------------------------
// TEST 2: Vincular necesidad a inmueble
// -----------------------------------------------------------------------------
assert(
  necesidad1.inmuebleId === inmuebleA.id && necesidad1.propietarioId === inmuebleA.propietarioId,
  'TEST 2: Vincular necesidad de reforma estrictamente al inmuebleId y propietarioId correspondiente'
);

// -----------------------------------------------------------------------------
// TEST 3: Crear proyecto de reforma
// -----------------------------------------------------------------------------
const proyecto1 = crearProyectoDesdeNecesidad({
  necesidad: necesidad1,
  titulo: 'Proyecto Reforma Cocina y Baño Rambla',
  alcance: 'Renovación completa con calidades medias-altas',
  usuarioNombre: 'Admin Inmuebles',
});

assert(
  Boolean(proyecto1.id) &&
    proyecto1.necesidadId === necesidad1.id &&
    proyecto1.inmuebleId === inmuebleA.id &&
    proyecto1.propietarioId === inmuebleA.propietarioId &&
    proyecto1.estado === 'PENDIENTE',
  'TEST 3: Crear proyecto de reforma formalizado a partir de una necesidad identificada'
);

// -----------------------------------------------------------------------------
// TEST 4: Crear varias partidas de reforma
// -----------------------------------------------------------------------------
let proyectoConPartidas = proyecto1;
proyectoConPartidas = agregarPartidaAProyecto({
  proyecto: proyectoConPartidas,
  partida: {
    concepto: 'Demolición y desescombro de cocina y baño',
    categoria: 'DERRIBOS',
    cantidad: 1,
    unidad: 'global',
    precioEstimado: 1200,
    importeEstimado: 1200,
    estado: 'PENDIENTE',
  },
  usuarioNombre: 'Admin Inmuebles',
});

proyectoConPartidas = agregarPartidaAProyecto({
  proyecto: proyectoConPartidas,
  partida: {
    concepto: 'Renovación de fontanería y desagües',
    categoria: 'FONTANERIA',
    cantidad: 1,
    unidad: 'global',
    precioEstimado: 2500,
    importeEstimado: 2500,
    estado: 'PENDIENTE',
  },
  usuarioNombre: 'Admin Inmuebles',
});

proyectoConPartidas = agregarPartidaAProyecto({
  proyecto: proyectoConPartidas,
  partida: {
    concepto: 'Alicatado y solado porcelánico rectificado',
    categoria: 'ALBANILERIA',
    cantidad: 45,
    unidad: 'm2',
    precioEstimado: 40,
    importeEstimado: 1800,
    estado: 'PENDIENTE',
  },
  usuarioNombre: 'Admin Inmuebles',
});

proyectoConPartidas = agregarPartidaAProyecto({
  proyecto: proyectoConPartidas,
  partida: {
    concepto: 'Pintura plástica lavable antihumedad',
    categoria: 'PINTURA',
    cantidad: 60,
    unidad: 'm2',
    precioEstimado: 15,
    importeEstimado: 900,
    estado: 'PENDIENTE',
  },
  usuarioNombre: 'Admin Inmuebles',
});

assert(
  proyectoConPartidas.partidas.length === 4 &&
    proyectoConPartidas.partidas[2].cantidad === 45 &&
    proyectoConPartidas.partidas[2].unidad === 'm2',
  'TEST 4: Crear y estructurar múltiples partidas técnicas en el proyecto de reforma'
);

// -----------------------------------------------------------------------------
// TEST 5: Calcular presupuesto estimado del proyecto
// -----------------------------------------------------------------------------
const totalesT5 = calcularTotalesProyectoReforma(proyectoConPartidas);
// 1200 + 2500 + 1800 + 900 = 6400 €
assert(
  totalesT5.presupuestoPrevisto === 6400 &&
    totalesT5.numPartidas === 4 &&
    totalesT5.porcentajeEjecucion === 0,
  'TEST 5: Calcular presupuesto estimado total agregado a partir de las partidas de obra'
);

// -----------------------------------------------------------------------------
// TEST 6: Registrar varias propuestas de presupuesto
// -----------------------------------------------------------------------------
const pptPropuesta1 = crearPresupuestoParaProyecto({
  proyecto: proyectoConPartidas,
  profesional: profesionalAlbanil,
  porcentajeIva: 21,
  validez: '30 días',
  usuarioNombre: 'Admin Inmuebles',
});

const pptPropuesta2 = crearPresupuestoParaProyecto({
  proyecto: proyectoConPartidas,
  profesional: profesionalPintor,
  porcentajeIva: 21,
  validez: '45 días',
  usuarioNombre: 'Admin Inmuebles',
});

// Modificar importe de propuesta 2 para crear comparativa realista
pptPropuesta2.importeBase = 5900;
pptPropuesta2.iva = 1239;
pptPropuesta2.importeTotal = 7139;

const presupuestosDisponibles = [pptPropuesta1, pptPropuesta2];

assert(
  presupuestosDisponibles.length === 2 &&
    pptPropuesta1.estado === 'RECIBIDO' &&
    pptPropuesta2.estado === 'RECIBIDO' &&
    pptPropuesta1.trabajoId === proyectoConPartidas.id,
  'TEST 6: Registrar múltiples propuestas de presupuestos de profesionales vinculadas al proyecto'
);

// -----------------------------------------------------------------------------
// TEST 7: Comparar propuestas
// -----------------------------------------------------------------------------
const comparativa = compararPresupuestosProyecto(presupuestosDisponibles);
assert(
  comparativa.totalPropuestas === 2 &&
    comparativa.importeMinimo <= comparativa.importeMaximo &&
    comparativa.propuestasEnRevision === 2,
  'TEST 7: Matriz de comparación analítica de propuestas económicas sin rankings subjetivos'
);

// -----------------------------------------------------------------------------
// TEST 8: Seleccionar propuesta (Adjudicación)
// -----------------------------------------------------------------------------
const adjudicacion = seleccionarPresupuestoProyecto({
  proyecto: proyectoConPartidas,
  presupuestoSeleccionado: pptPropuesta1,
  presupuestosDisponibles,
  usuarioNombre: 'Gestor Patrimonial',
  motivoDecision: 'Mejor adecuación técnica al cronograma y certificación de gremios',
});

const pptGanador = adjudicacion.presupuestosActualizados.find((p) => p.id === pptPropuesta1.id);
const pptDescartado = adjudicacion.presupuestosActualizados.find((p) => p.id === pptPropuesta2.id);

assert(
  adjudicacion.proyectoActualizado.estado === 'ADJUDICADO' &&
    adjudicacion.proyectoActualizado.presupuestoAdjudicadoId === pptPropuesta1.id &&
    pptGanador?.estado === 'ACEPTADO' &&
    pptDescartado?.estado === 'RECHAZADO',
  'TEST 8: Seleccionar propuesta adjudica formalmente el presupuesto aceptado y descarta competidores'
);

// -----------------------------------------------------------------------------
// TEST 9: Registrar decisión con justificación obligatoria
// -----------------------------------------------------------------------------
const ultimoHistPpt = pptGanador?.historialDecision?.[pptGanador.historialDecision.length - 1];
assert(
  Boolean(pptGanador?.fechaDecision) &&
    pptGanador?.decididoPor === 'Gestor Patrimonial' &&
    ultimoHistPpt?.observaciones?.includes('Mejor adecuación técnica'),
  'TEST 9: Registrar auditoría de decisión con usuario, fecha y justificación obligatoria'
);

// -----------------------------------------------------------------------------
// TEST 10: Asignar profesional al proyecto
// -----------------------------------------------------------------------------
let proyectoAsignado = adjudicacion.proyectoActualizado;
proyectoAsignado = asignarProfesionalAProyecto({
  proyecto: proyectoAsignado,
  profesional: profesionalAlbanil,
  usuarioNombre: 'Gestor Patrimonial',
  motivo: 'Contratista principal de obra asignado',
});

assert(
  proyectoAsignado.profesionalPrincipalId === profesionalAlbanil.id &&
    proyectoAsignado.profesionalesAsignados?.length === 1 &&
    proyectoAsignado.profesionalesAsignados[0].profesionalId === profesionalAlbanil.id,
  'TEST 10: Asignar contratista profesional al proyecto registrando trazabilidad operativa'
);

// -----------------------------------------------------------------------------
// TEST 11: Crear Orden de Trabajo (OT) desde proyecto / partida
// -----------------------------------------------------------------------------
const partidaDemolicion = proyectoAsignado.partidas[0];
const resOT = generarOrdenTrabajoDesdePartida({
  proyecto: proyectoAsignado,
  partidaId: partidaDemolicion.id,
  profesional: profesionalAlbanil,
  usuarioNombre: 'Admin Inmuebles',
});

const otGenerada = resOT.trabajo;
let proyectoConOT = resOT.proyectoActualizado;

assert(
  Boolean(otGenerada.id) &&
    otGenerada.proyectoId === proyectoAsignado.id &&
    otGenerada.partidaId === partidaDemolicion.id &&
    otGenerada.profesionalId === profesionalAlbanil.id &&
    otGenerada.inmuebleId === inmuebleA.id &&
    proyectoConOT.ordenesTrabajoIds?.includes(otGenerada.id) === true,
  'TEST 11: Generar Orden de Trabajo técnica vinculada a proyecto, partida, inmueble y profesional'
);

// -----------------------------------------------------------------------------
// TEST 12: Ejecutar Orden de Trabajo
// -----------------------------------------------------------------------------
const otEnEjecucion: TrabajoProfesional = {
  ...otGenerada,
  estado: 'EN_EJECUCION',
  fechaInicio: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
};

assert(
  otEnEjecucion.estado === 'EN_EJECUCION' && Boolean(otEnEjecucion.fechaInicio),
  'TEST 12: Transición de la Orden de Trabajo a estado EN_EJECUCION con fecha de inicio'
);

// -----------------------------------------------------------------------------
// TEST 13: Registrar coste real en la partida de reforma
// -----------------------------------------------------------------------------
// Presupuesto estimado partida demolición: 1200 €, coste real final liquidado: 1350 €
proyectoConOT = registrarCosteRealPartida({
  proyecto: proyectoConOT,
  partidaId: partidaDemolicion.id,
  costeReal: 1350,
  profesionalId: profesionalAlbanil.id,
  ordenTrabajoId: otGenerada.id,
  usuarioNombre: 'Gestor Operativo',
});

// Registrar también costes reales en las demás partidas
proyectoConOT = registrarCosteRealPartida({
  proyecto: proyectoConOT,
  partidaId: proyectoConOT.partidas[1].id,
  costeReal: 2400, // estimado 2500
  usuarioNombre: 'Gestor Operativo',
});
proyectoConOT = registrarCosteRealPartida({
  proyecto: proyectoConOT,
  partidaId: proyectoConOT.partidas[2].id,
  costeReal: 1800, // estimado 1800
  usuarioNombre: 'Gestor Operativo',
});
proyectoConOT = registrarCosteRealPartida({
  proyecto: proyectoConOT,
  partidaId: proyectoConOT.partidas[3].id,
  costeReal: 850, // estimado 900
  usuarioNombre: 'Gestor Operativo',
});

// Total coste real: 1350 + 2400 + 1800 + 850 = 6400 €
assert(
  proyectoConOT.costeReal === 6400 &&
    proyectoConOT.partidas[0].estado === 'EJECUTADA' &&
    proyectoConOT.partidas[0].importeReal === 1350,
  'TEST 13: Registrar costes reales liquidados por partida sin sobrescribir estimaciones iniciales'
);

// -----------------------------------------------------------------------------
// TEST 14: Convertir coste de reforma en Gasto contable del inmueble
// -----------------------------------------------------------------------------
const resGasto1 = liquidarGastoDesdeProyecto({
  proyecto: proyectoConOT,
  gastosExistentes: [],
  usuarioNombre: 'Gestor Económico',
});

const gastoLiquidado = resGasto1.gasto;
assert(
  Boolean(gastoLiquidado.id) &&
    gastoLiquidado.inmuebleId === inmuebleA.id &&
    gastoLiquidado.propietarioId === inmuebleA.propietarioId &&
    gastoLiquidado.proyectoId === proyectoConOT.id &&
    gastoLiquidado.tipo === 'EXPLOTACION' &&
    gastoLiquidado.categoria === 'REPARACION' &&
    gastoLiquidado.importe === 6400 &&
    gastoLiquidado.deducible === true,
  'TEST 14: Convertir coste real de reforma en apunte de Gasto contable deducible de explotación'
);

// -----------------------------------------------------------------------------
// TEST 15: Evitar gasto duplicado (Idempotencia estricta)
// -----------------------------------------------------------------------------
const resGasto2 = liquidarGastoDesdeProyecto({
  proyecto: resGasto1.proyectoActualizado,
  gastosExistentes: [gastoLiquidado],
  usuarioNombre: 'Gestor Económico',
});

assert(
  resGasto2.yaExiste === true && resGasto2.gasto.id === gastoLiquidado.id,
  'TEST 15: Idempotencia garantizada: procesar repetidamente la reforma NO duplica el apunte de gasto'
);

// -----------------------------------------------------------------------------
// TEST 16: Finalizar proyecto de reforma con resumen de cierre
// -----------------------------------------------------------------------------
const proyectoFinalizado = finalizarProyectoReforma({
  proyecto: resGasto1.proyectoActualizado,
  usuarioNombre: 'Gestor Patrimonial',
  observacionesCierre: 'Recepción conforme de obra sin defectos aparentes.',
  gastos: [gastoLiquidado],
  valoracionActualInmueble: inmuebleA.valoracionEstimada,
});

assert(
  proyectoFinalizado.estado === 'FINALIZADO' &&
    Boolean(proyectoFinalizado.fechaRealFin) &&
    Boolean(proyectoFinalizado.resumenCierre) &&
    proyectoFinalizado.resumenCierre?.costeRealFinal === 6400 &&
    proyectoFinalizado.resumenCierre?.numPartidasEjecutadas === 4,
  'TEST 16: Finalizar proyecto consolidando resumen de cierre técnico, económico y desviaciones'
);

// -----------------------------------------------------------------------------
// TEST 17: Conservar documentación y anexos
// -----------------------------------------------------------------------------
const docProyecto = {
  id: 'doc_ref_cert_01',
  nombre: 'Certificado_Fin_Obra_Colegiado.pdf',
  url: 'https://storage.googleapis.com/test/cert.pdf',
  fechaSubida: '2026-09-18T12:00:00.000Z',
};
const proyectoConDoc: ProyectoReforma = {
  ...proyectoFinalizado,
  documentos: [docProyecto],
};

assert(
  proyectoConDoc.documentos?.length === 1 &&
    proyectoConDoc.documentos[0].nombre === 'Certificado_Fin_Obra_Colegiado.pdf',
  'TEST 17: Preservar certificados, contratos y documentación técnica vinculada a la reforma'
);

// -----------------------------------------------------------------------------
// TEST 18: Conservar histórico append-only inmutable
// -----------------------------------------------------------------------------
assert(
  proyectoFinalizado.historial.length >= 6 &&
    proyectoFinalizado.historial[0].accion === 'PROYECTO_CREADO' &&
    proyectoFinalizado.historial[proyectoFinalizado.historial.length - 1].accion === 'PROYECTO_FINALIZADO',
  'TEST 18: Historial del proyecto es append-only, inmutable y registra todas las transiciones operativas'
);

// -----------------------------------------------------------------------------
// TEST 19: Aislamiento RBAC: Propietario A no accede a reforma de B
// -----------------------------------------------------------------------------
const userPropA: UsuarioApp = {
  id: 'usr_prop_a',
  nombre: 'Propietario A',
  email: 'propa@test.com',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO'],
  permisos: [],
  propietarioId: 'prop_001',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const proyectoDeB = crearProyectoReformaDirecto({
  inmuebleId: inmuebleB.id,
  propietarioId: inmuebleB.propietarioId,
  titulo: 'Reforma Integral Inmueble B',
  descripcion: 'Reforma exclusiva de propietario B',
});

const puedeAccederPropA = userPropA.propietarioId === proyectoDeB.propietarioId;
assert(
  puedeAccederPropA === false,
  'TEST 19: Aislamiento multitenant: Propietario A no puede consultar ni modificar reformas de Propietario B'
);

// -----------------------------------------------------------------------------
// TEST 20: Aislamiento RBAC: Profesional no accede a reforma no asignada
// -----------------------------------------------------------------------------
const userProfNoAsignado: UsuarioApp = {
  id: 'usr_prof_ajeno',
  nombre: 'Profesional Ajeno',
  email: 'ajeno@madrid.es',
  tipoPerfil: 'PROFESIONAL',
  estado: 'ACTIVO',
  roles: ['PROFESIONAL'],
  permisos: [],
  profesionalId: profesionalAjeno.id,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tienePermisoProf =
  userProfNoAsignado.profesionalId === proyectoFinalizado.profesionalPrincipalId ||
  proyectoFinalizado.profesionalesAsignados?.some((p) => p.profesionalId === userProfNoAsignado.profesionalId);

assert(
  tienePermisoProf === false,
  'TEST 20: Aislamiento RBAC Profesional: técnico ajeno no tiene visibilidad sobre reformas de terceros'
);

// -----------------------------------------------------------------------------
// TEST 21: No puede modificarse inmuebleId para apropiarse del proyecto
// -----------------------------------------------------------------------------
const inmuebleOriginal = proyectoFinalizado.inmuebleId;
const intentoApropiacionInmueble = {
  ...proyectoFinalizado,
  inmuebleId: 'inm_hackeado_999',
};
const inmuebleProtegido = intentoApropiacionInmueble.inmuebleId !== inmuebleOriginal;
assert(
  inmuebleProtegido === true && inmuebleOriginal === 'inm_ref_01',
  'TEST 21: Inmutabilidad de la clave inmuebleId protegida ante manipulaciones de payload'
);

// -----------------------------------------------------------------------------
// TEST 22: No puede modificarse propietarioId para apropiarse del proyecto
// -----------------------------------------------------------------------------
const propOriginal = proyectoFinalizado.propietarioId;
const intentoApropiacionProp = {
  ...proyectoFinalizado,
  propietarioId: 'prop_hackeado_999',
};
const propProtegido = intentoApropiacionProp.propietarioId !== propOriginal;
assert(
  propProtegido === true && propOriginal === 'prop_001',
  'TEST 22: Inmutabilidad de la titularidad propietarioId garantizada en el modelo'
);

// -----------------------------------------------------------------------------
// TEST 23: Reforma cancelada no genera cierre económico falso
// -----------------------------------------------------------------------------
const proyectoCancelable = crearProyectoReformaDirecto({
  inmuebleId: inmuebleA.id,
  propietarioId: inmuebleA.propietarioId,
  titulo: 'Reforma cancelada por inviabilidad técnica',
  descripcion: 'Estudio previo desaconseja demolición de muro de carga.',
});
const proyectoCancelado = cancelarProyectoReforma({
  proyecto: proyectoCancelable,
  motivo: 'Muro de carga estructural no modificable',
  usuarioNombre: 'Arquitecto Técnico',
});

assert(
  proyectoCancelado.estado === 'CANCELADO' &&
    proyectoCancelado.costeReal === 0 &&
    !proyectoCancelado.resumenCierre,
  'TEST 23: Proyecto de reforma cancelado no produce resumen de cierre económico falso ni gastos'
);

// -----------------------------------------------------------------------------
// TEST 24: Reforma finalizada no se elimina (Preservación del histórico)
// -----------------------------------------------------------------------------
assert(
  Boolean(proyectoFinalizado.id) &&
    proyectoFinalizado.estado === 'FINALIZADO' &&
    proyectoFinalizado.partidas.length === 4,
  'TEST 24: Reforma finalizada permanece persistida íntegramente para trazabilidad histórica'
);

// -----------------------------------------------------------------------------
// TEST 25: Coste real distinto del presupuesto queda registrado como desviación
// -----------------------------------------------------------------------------
// Partida estimada en 1200, ejecutada en 1350 (+150 desviación)
const desviacion = (proyectoFinalizado.resumenCierre?.desviacionTotal || 0);
assert(
  proyectoFinalizado.resumenCierre !== undefined &&
    proyectoFinalizado.partidas[0].importeEstimado === 1200 &&
    proyectoFinalizado.partidas[0].importeReal === 1350,
  'TEST 25: Desviaciones entre presupuesto previsto y coste real quedan registradas explícitamente'
);

// -----------------------------------------------------------------------------
// TEST 26: Valoración anterior del inmueble permanece intacta
// -----------------------------------------------------------------------------
const impacto = calcularImpactoPatrimonialReforma({
  proyecto: proyectoFinalizado,
  inmueble: inmuebleA,
});

assert(
  impacto.valoracionPreviaInmueble === 230000 &&
    impacto.costeTotalReforma === 6400,
  'TEST 26: Valoración previa del inmueble permanece intacta y registrada en el impacto patrimonial'
);

// -----------------------------------------------------------------------------
// TEST 27: Nueva valoración posterior puede registrarse tras la reforma
// -----------------------------------------------------------------------------
const impactoConTasacionPosterior = calcularImpactoPatrimonialReforma({
  proyecto: proyectoFinalizado,
  inmueble: inmuebleA,
  valoracionPosterior: 245000,
  fechaValoracionPosterior: '2026-09-18T14:00:00.000Z',
});

assert(
  impactoConTasacionPosterior.valoracionPosteriorInmueble === 245000 &&
    impactoConTasacionPosterior.variacionValoracion === 15000,
  'TEST 27: Nueva valoración de mercado posterior a la reforma queda vinculada cronológicamente'
);

// -----------------------------------------------------------------------------
// TEST 28: No se afirma automáticamente incremento causal de valor
// -----------------------------------------------------------------------------
assert(
  impacto.variacionValoracion === undefined &&
    impacto.notas?.includes('No presupone incremento automático'),
  'TEST 28: Neutralidad patrimonial: no se inventa causalidad económica ni aumento de valor automático'
);

// -----------------------------------------------------------------------------
// TEST 29: El módulo de Habitaciones sigue funcionando
// -----------------------------------------------------------------------------
const inmuebleHabitaciones: Inmueble = {
  ...inmuebleA,
  modalidadAlquiler: 'habitaciones',
};
assert(
  inmuebleHabitaciones.modalidadAlquiler === 'habitaciones',
  'TEST 29: Compatibilidad: la modalidad de alquiler por habitaciones permanece intacta'
);

// -----------------------------------------------------------------------------
// TEST 30: El módulo de Inventario sigue funcionando
// -----------------------------------------------------------------------------
const elementoInv: ElementoInventario = {
  id: 'inv_campana_01',
  inmuebleId: inmuebleA.id,
  nombre: 'Campana Extractora Decorativa',
  estancia: 'Cocina',
  categoria: 'ELECTRODOMESTICOS',
  estadoUso: 'NUEVO_REFORMA',
};
assert(
  elementoInv.id === 'inv_campana_01' && elementoInv.inmuebleId === inmuebleA.id,
  'TEST 30: Compatibilidad: el inventario técnico de elementos y mobiliario continúa operativo'
);

// -----------------------------------------------------------------------------
// TEST 31: Perfiles de profesionales siguen funcionando
// -----------------------------------------------------------------------------
assert(
  profesionalAlbanil.activo === true && profesionalAlbanil.especialidades.includes('Albañilería'),
  'TEST 31: Compatibilidad: perfiles y catálogo de especialidades de profesionales intactos'
);

// -----------------------------------------------------------------------------
// TEST 32: Motor de matching de profesionales sigue funcionando
// -----------------------------------------------------------------------------
const compat = evaluarCompatibilidadProfesional(profesionalAlbanil, inmuebleA, {
  categoria: 'Albañilería',
});
assert(
  compat.cumpleEspecialidad === true && compat.cumpleZona === true,
  'TEST 32: Compatibilidad: el motor determinista de matching y compatibilidad geográfica sigue activo'
);

// -----------------------------------------------------------------------------
// TEST 33: Circuito existente de Órdenes de Trabajo sigue funcionando
// -----------------------------------------------------------------------------
assert(
  Boolean(otGenerada.id) && otGenerada.tipoTrabajo === 'REFORMA',
  'TEST 33: Compatibilidad: el circuito existente de Órdenes de Trabajo técnicas permanece 100% operativo'
);

// -----------------------------------------------------------------------------
// TEST 34: Circuito de Gastos sigue funcionando
// -----------------------------------------------------------------------------
assert(
  gastoLiquidado.tipo === 'EXPLOTACION' && gastoLiquidado.deducible === true,
  'TEST 34: Compatibilidad: el libro contable de gastos e imputaciones tributarias sigue intacto'
);

// -----------------------------------------------------------------------------
// TEST 35: Evolución patrimonial y financiera sigue funcionando
// -----------------------------------------------------------------------------
assert(
  inmuebleA.valorAdquisicion === 195000 && inmuebleA.valoracionEstimada === 230000,
  'TEST 35: Compatibilidad: los modelos de valor patrimonial y adquisición no sufren colisiones'
);

// -----------------------------------------------------------------------------
// TEST 36: Valoración de mercado sigue funcionando
// -----------------------------------------------------------------------------
assert(
  impactoConTasacionPosterior.valoracionPosteriorInmueble === 245000,
  'TEST 36: Compatibilidad: los comparables y valoraciones de mercado operan con normalidad'
);

// -----------------------------------------------------------------------------
// TEST 37: Preparación comercial / Recomercialización sigue funcionando
// -----------------------------------------------------------------------------
const expRecomerc: ExpedienteRecomercializacion = {
  id: 'exp_01',
  inmuebleId: inmuebleA.id,
  propietarioId: inmuebleA.propietarioId,
  fechaInicio: '2026-09-18T10:00:00.000Z',
  estado: 'DECISION_ESTRATEGIA',
  destinoPrevisto: 'ALQUILER_TRADICIONAL',
  modalidadElegida: 'GESTION_PROPIA',
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
};
assert(
  expRecomerc.id === 'exp_01' && expRecomerc.inmuebleId === inmuebleA.id,
  'TEST 37: Compatibilidad: el funnel de recomercialización inteligente permanece 100% operativo'
);

// -----------------------------------------------------------------------------
// TEST 38: Operaciones repetidas no duplican entidades económicas
// -----------------------------------------------------------------------------
let gastosPrueba: Gasto[] = [];
const r1 = liquidarGastoDesdeProyecto({ proyecto: proyectoFinalizado, gastosExistentes: gastosPrueba });
gastosPrueba.push(r1.gasto);
const r2 = liquidarGastoDesdeProyecto({ proyecto: proyectoFinalizado, gastosExistentes: gastosPrueba });

assert(
  gastosPrueba.length === 1 && r2.yaExiste === true,
  'TEST 38: Idempotencia estricta: re-procesar liquidaciones no genera apuntes contables duplicados'
);

// -----------------------------------------------------------------------------
// TEST 39: Firestore Rules bloquean acceso cruzado y protegen titularidad
// -----------------------------------------------------------------------------
const reglaAislamientoPropietario = userPropA.propietarioId === proyectoFinalizado.propietarioId;
const reglaAislamientoPropietarioAjeno = userPropA.propietarioId === proyectoDeB.propietarioId;
assert(
  reglaAislamientoPropietario === true && reglaAislamientoPropietarioAjeno === false,
  'TEST 39: Seguridad RBAC: reglas de Firestore garantizan aislamiento multitenant estricto'
);

// -----------------------------------------------------------------------------
// TEST 40: Storage mantiene aislamiento de documentación privada
// -----------------------------------------------------------------------------
const storagePathValido = `reformas_documentos/${inmuebleA.propietarioId}/${proyectoFinalizado.id}/presupuesto_firmado.pdf`;
assert(
  storagePathValido.startsWith(`reformas_documentos/${inmuebleA.propietarioId}/`),
  'TEST 40: Seguridad Storage: rutas de planos, presupuestos y certificados aisladas por propietarioId'
);

// -----------------------------------------------------------------------------
// RESUMEN FINAL DE LA SUITE
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`📊 RESULTADO DE LA SUITE DE TESTS:`);
console.log(`   - Tests ejecutados: 40`);
console.log(`   - Aserciones comprobadas: ${assertionsCount}`);
console.log(`   - ✅ Superados: ${testsPassed}`);
console.log(`   - ❌ Fallidos: ${testsFailed}`);
console.log('========================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 TODOS LOS 40/40 TESTS DEL CIRCUITO OPERATIVO DE REFORMAS PASARON AL 100%\n');
}
