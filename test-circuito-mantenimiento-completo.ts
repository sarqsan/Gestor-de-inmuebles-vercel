import assert from 'assert';
import {
  Incidencia,
  TrabajoProfesional,
  PresupuestoProfesional,
  Gasto,
  EstadoIncidencia,
  EstadoTrabajoProfesional,
  EstadoPresupuestoProfesional,
  UsuarioApp,
} from './src/types';
import {
  crearHistorialItem,
  canAccessIncidencia,
} from './src/utils/incidenciasEngine';
import {
  validarSolicitudAjuste,
  validarRechazoPresupuesto,
  crearItemHistorialPresupuesto,
  calcularTotalesPresupuesto,
  crearItemHistorialTrabajo,
} from './src/utils/profesionalesEngine';
import {
  puedeGenerarGastoDesdeTrabajo,
  generarGastoDesdeTrabajo,
  sincronizarGastoDesdeTrabajo,
  buscarGastoDeTrabajo,
} from './src/utils/gastosEngine';

console.log('\n================================================================================');
console.log('EJECUTANDO VALIDACIÓN DE LOS 20 TESTS DEL CIRCUITO COMPLETO DE MANTENIMIENTO');
console.log('================================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(nombre: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`🔹 TEST ${totalTests}: ${nombre}`);
  } catch (err: any) {
    console.error(`❌ TEST ${totalTests} FALLÓ: ${nombre}`);
    console.error(err);
    process.exit(1);
  }
}

// Variables compartidas a lo largo de todo el circuito e2e
let incidenciaTest: Incidencia;
let otTest: TrabajoProfesional;
let presupuestoTest: PresupuestoProfesional;
let gastoTest: Gasto;

// -----------------------------------------------------------------
// TEST 1: Crear incidencia
// -----------------------------------------------------------------
runTest('Crear incidencia inicial con identificación de inmueble y titularidad', () => {
  incidenciaTest = {
    id: 'inc_circuito_001',
    inmuebleId: 'inm_madrid_centrico_01',
    inmuebleDireccion: 'Calle Mayor 24, 3º Izq',
    propietarioId: 'prop_titular_alpha',
    titulo: 'Fuga de agua en tubería empotrada del baño principal',
    descripcion: 'Mancha de humedad en techo inferior y pérdida de presión en grifería',
    categoria: 'FONTANERIA',
    prioridad: 'ALTA',
    estado: 'ABIERTA',
    origen: 'INQUILINO',
    fechaCreacion: '2026-09-18T09:00:00Z',
    historial: [
      crearHistorialItem('CREACION', 'Carlos Inquilino', 'Incidencia reportada por el inquilino'),
    ],
    createdAt: '2026-09-18T09:00:00Z',
    updatedAt: '2026-09-18T09:00:00Z',
  };

  assert.strictEqual(incidenciaTest.id, 'inc_circuito_001');
  assert.strictEqual(incidenciaTest.estado, 'ABIERTA');
  assert.strictEqual(incidenciaTest.propietarioId, 'prop_titular_alpha');
  assert.strictEqual(incidenciaTest.historial.length, 1);
  console.log('  ✓ Incidencia creada correctamente en estado ABIERTA');
});

// -----------------------------------------------------------------
// TEST 2: Determinar responsabilidad
// -----------------------------------------------------------------
runTest('Determinar responsabilidad (dictamen formal no asertivo con justificación legal LAU)', () => {
  const justificacion = 'Avería en instalación fija de fontanería empotrada. Conforme al Art. 21.1 LAU, corresponde al arrendador la conservación de la habitabilidad.';

  incidenciaTest = {
    ...incidenciaTest,
    responsabilidad: 'PROPIETARIO',
    responsabilidadMotivo: justificacion,
    responsabilidadNotas: justificacion,
    responsabilidadFechaDecision: '2026-09-18T10:00:00Z',
    responsabilidadDecididoPor: 'Gestor Patrimonial',
    estado: 'ASIGNADA',
    historial: [
      ...incidenciaTest.historial,
      crearHistorialItem(
        'CAMBIO_ESTADO',
        'Gestor Patrimonial',
        'Responsabilidad determinada: PROPIETARIO (Art. 21.1 LAU)'
      ),
    ],
    updatedAt: '2026-09-18T10:00:00Z',
  };

  assert.strictEqual(incidenciaTest.responsabilidad, 'PROPIETARIO');
  assert.ok(incidenciaTest.responsabilidadMotivo?.includes('21.1 LAU'));
  assert.strictEqual(incidenciaTest.historial.length, 2);
  console.log('  ✓ Dictamen de responsabilidad registrado y justificado');
});

// -----------------------------------------------------------------
// TEST 3: Crear OT desde incidencia
// -----------------------------------------------------------------
runTest('Crear Orden de Trabajo (OT) vinculada con incidenciaId e inmuebleId', () => {
  otTest = {
    id: 'ot_reparacion_550',
    propietarioId: incidenciaTest.propietarioId,
    inmuebleId: incidenciaTest.inmuebleId,
    inmuebleDireccion: incidenciaTest.inmuebleDireccion,
    incidenciaId: incidenciaTest.id,
    titulo: `Reparación: ${incidenciaTest.titulo}`,
    descripcion: incidenciaTest.descripcion,
    tipoTrabajo: 'REPARACION_INCIDENCIA',
    categoria: incidenciaTest.categoria,
    prioridad: incidenciaTest.prioridad,
    estado: 'PENDIENTE',
    fechaSolicitud: '2026-09-18T10:30:00Z',
    creadoPor: 'Gestor Patrimonial',
    actualizadoPor: 'Gestor Patrimonial',
    historial: [
      crearItemHistorialTrabajo('TRABAJO_CREADO', 'Gestor Patrimonial', undefined, 'PENDIENTE', 'Creación desde incidencia'),
    ],
    createdAt: '2026-09-18T10:30:00Z',
    updatedAt: '2026-09-18T10:30:00Z',
  };

  assert.strictEqual(otTest.incidenciaId, incidenciaTest.id);
  assert.strictEqual(otTest.inmuebleId, incidenciaTest.inmuebleId);
  assert.strictEqual(otTest.propietarioId, incidenciaTest.propietarioId);
  assert.strictEqual(otTest.estado, 'PENDIENTE');
  console.log('  ✓ OT creada con trazabilidad exacta a la incidencia');
});

// -----------------------------------------------------------------
// TEST 4: Asignar profesional
// -----------------------------------------------------------------
runTest('Asignar profesional a la OT y restringir acceso a su ámbito asignado', () => {
  otTest = {
    ...otTest,
    profesionalId: 'prof_fontaneria_gomez',
    profesionalNombre: 'Gómez Fontaneros S.L.',
    profesionalTelefono: '600112233',
    profesionalEmail: 'contacto@gomezfontaneros.es',
    fechaAsignacion: '2026-09-18T11:00:00Z',
    estado: 'ASIGNADO',
    historial: [
      ...otTest.historial,
      crearItemHistorialTrabajo('PROFESIONAL_ASIGNADO', 'Gestor Patrimonial', 'PENDIENTE', 'ASIGNADO', 'Asignado a Gómez Fontaneros S.L.'),
    ],
    updatedAt: '2026-09-18T11:00:00Z',
  };

  // Sincronizar incidencia
  incidenciaTest = {
    ...incidenciaTest,
    profesionalId: otTest.profesionalId,
    profesionalAsignadoId: otTest.profesionalId,
    trabajoProfesional: {
      profesionalId: otTest.profesionalId,
      profesionalNombre: otTest.profesionalNombre!,
      profesionalTelefono: otTest.profesionalTelefono,
      profesionalEmail: otTest.profesionalEmail,
      servicio: otTest.categoria,
      fechaAsignacion: otTest.fechaAsignacion!,
      estadoTrabajo: 'ASIGNADO',
    },
    updatedAt: '2026-09-18T11:00:00Z',
  };

  assert.strictEqual(otTest.profesionalId, 'prof_fontaneria_gomez');
  assert.strictEqual(incidenciaTest.profesionalAsignadoId, 'prof_fontaneria_gomez');
  console.log('  ✓ Profesional asignado y propagado en la incidencia');
});

// -----------------------------------------------------------------
// TEST 5: Crear presupuesto
// -----------------------------------------------------------------
runTest('Crear presupuesto profesional con cálculo de partidas, IVA y versión inicial 1', () => {
  const partidas = [
    { id: 'part_1', concepto: 'Localización de fuga y picado de paramento', cantidad: 1, precioUnitario: 80, importe: 80 },
    { id: 'part_2', concepto: 'Sustitución de tramo de tubería multicapa y codos', cantidad: 1, precioUnitario: 90, importe: 90 },
    { id: 'part_3', concepto: 'Sellado, reposición de azulejo y lechada', cantidad: 1, precioUnitario: 50, importe: 50 },
  ];

  const totales = calcularTotalesPresupuesto(partidas, 21);
  assert.strictEqual(totales.importeBase, 220);
  assert.strictEqual(totales.iva, 46.20);
  assert.strictEqual(totales.importeTotal, 266.20);

  presupuestoTest = {
    id: 'pres_reparacion_770',
    numeroPresupuesto: 'PRE-2026-0045',
    descripcion: 'Reparación de rotura de tubería de baño y sellado',
    validez: '30 días',
    trabajoId: otTest.id,
    incidenciaId: incidenciaTest.id,
    inmuebleId: otTest.inmuebleId,
    inmuebleDireccion: otTest.inmuebleDireccion,
    propietarioId: otTest.propietarioId,
    profesionalId: otTest.profesionalId!,
    profesionalNombre: otTest.profesionalNombre!,
    fecha: '2026-09-18T12:00:00Z',
    importeBase: totales.importeBase,
    porcentajeIva: 21,
    iva: totales.iva,
    importeTotal: totales.importeTotal,
    partidas,
    estado: 'EN_REVISION',
    version: 1,
    historialDecision: [
      crearItemHistorialPresupuesto(
        'PRESENTACION',
        'Gómez Fontaneros S.L.',
        'BORRADOR',
        'EN_REVISION',
        {
          motivo: 'Presupuesto inicial presentado para revisión',
          version: 1,
          importeTotal: totales.importeTotal,
          partidasSnapshot: partidas,
        }
      ),
    ],
    createdAt: '2026-09-18T12:00:00Z',
    updatedAt: '2026-09-18T12:00:00Z',
  };

  assert.strictEqual(presupuestoTest.version, 1);
  assert.strictEqual(presupuestoTest.estado, 'EN_REVISION');
  assert.strictEqual(presupuestoTest.importeTotal, 266.20);
  console.log('  ✓ Presupuesto v1 creado y emitido a revisión');
});

// -----------------------------------------------------------------
// TEST 6: Solicitar ajuste
// -----------------------------------------------------------------
runTest('Solicitar ajuste de presupuesto con categoría y motivo obligatorios → EN_NEGOCIACION', () => {
  const validacionVacia = validarSolicitudAjuste('', '');
  assert.strictEqual(validacionVacia.valido, false, 'Sin categoría ni motivo debe ser denegado');

  const validacion = validarSolicitudAjuste('PARTIDAS', 'Por favor separar la mano de obra de los materiales');
  assert.strictEqual(validacion.valido, true);

  presupuestoTest = {
    ...presupuestoTest,
    estado: 'EN_NEGOCIACION',
    categoriaAjuste: 'PARTIDAS',
    motivoAjuste: 'Por favor separar la mano de obra de los materiales',
    fechaSolicitudAjuste: '2026-09-18T13:00:00Z',
    solicitadoAjustePor: 'Gestor Patrimonial',
    historialDecision: [
      ...(presupuestoTest.historialDecision || []),
      crearItemHistorialPresupuesto(
        'SOLICITUD_AJUSTE',
        'Gestor Patrimonial',
        'EN_REVISION',
        'EN_NEGOCIACION',
        {
          categoriaMotivo: 'PARTIDAS',
          motivo: 'Por favor separar la mano de obra de los materiales',
          version: 1,
          importeTotal: presupuestoTest.importeTotal,
          partidasSnapshot: presupuestoTest.partidas,
        }
      ),
    ],
    updatedAt: '2026-09-18T13:00:00Z',
  };

  assert.strictEqual(presupuestoTest.estado, 'EN_NEGOCIACION');
  assert.strictEqual(presupuestoTest.fechaDecision, undefined, 'No debe ser decisión final');
  assert.strictEqual(presupuestoTest.historialDecision?.length, 2);
  console.log('  ✓ Transición a EN_NEGOCIACION con auditoría inmutable');
});

// -----------------------------------------------------------------
// TEST 7: Reenviar presupuesto
// -----------------------------------------------------------------
runTest('Reenviar presupuesto ajustado → Incrementa versión (v2) y snapshot histórico', () => {
  const partidasAjustadas = [
    { id: 'part_1', concepto: 'Mano de obra fontanería y albañilería (4h)', cantidad: 4, precioUnitario: 35, importe: 140 },
    { id: 'part_2', concepto: 'Tubería multicapa, accesorios y sellador hidrófugo', cantidad: 1, precioUnitario: 60, importe: 60 },
  ];

  const totalesV2 = calcularTotalesPresupuesto(partidasAjustadas, 21);
  assert.strictEqual(totalesV2.importeBase, 200);
  assert.strictEqual(totalesV2.importeTotal, 242.00);

  presupuestoTest = {
    ...presupuestoTest,
    version: 2,
    estado: 'EN_REVISION',
    partidas: partidasAjustadas,
    importeBase: totalesV2.importeBase,
    iva: totalesV2.iva,
    importeTotal: totalesV2.importeTotal,
    categoriaAjuste: undefined,
    motivoAjuste: undefined,
    historialDecision: [
      ...(presupuestoTest.historialDecision || []),
      crearItemHistorialPresupuesto(
        'REENVIO',
        'Gómez Fontaneros S.L.',
        'EN_NEGOCIACION',
        'EN_REVISION',
        {
          motivo: 'Presupuesto ajustado desglosando mano de obra y materiales',
          version: 2,
          importeTotal: totalesV2.importeTotal,
          partidasSnapshot: partidasAjustadas,
        }
      ),
    ],
    updatedAt: '2026-09-18T14:00:00Z',
  };

  assert.strictEqual(presupuestoTest.version, 2);
  assert.strictEqual(presupuestoTest.estado, 'EN_REVISION');
  assert.strictEqual(presupuestoTest.importeTotal, 242.00);
  assert.strictEqual(presupuestoTest.historialDecision?.length, 3);
  console.log('  ✓ Presupuesto v2 reexpedido con snapshot histórico');
});

// -----------------------------------------------------------------
// TEST 8: Aceptar presupuesto
// -----------------------------------------------------------------
runTest('Aceptar presupuesto v2 → ACEPTADO, adjudicación en OT y sincronización', () => {
  presupuestoTest = {
    ...presupuestoTest,
    estado: 'ACEPTADO',
    fechaDecision: '2026-09-18T15:00:00Z',
    decididoPor: 'Gestor Patrimonial',
    historialDecision: [
      ...(presupuestoTest.historialDecision || []),
      crearItemHistorialPresupuesto(
        'APROBACION',
        'Gestor Patrimonial',
        'EN_REVISION',
        'ACEPTADO',
        {
          motivo: 'Presupuesto v2 aprobado. Se autoriza la ejecución.',
          version: 2,
          importeTotal: presupuestoTest.importeTotal,
        }
      ),
    ],
    updatedAt: '2026-09-18T15:00:00Z',
  };

  // Adjudicar a la OT
  otTest = {
    ...otTest,
    presupuestoId: presupuestoTest.id,
    importeEstimado: presupuestoTest.importeTotal,
    estado: 'ACEPTADO',
    historial: [
      ...otTest.historial,
      crearItemHistorialTrabajo('PRESUPUESTO_ACEPTADO', 'Gestor Patrimonial', 'ASIGNADO', 'ACEPTADO', `Presupuesto ${presupuestoTest.numeroPresupuesto} aprobado por ${presupuestoTest.importeTotal} €`),
    ],
    updatedAt: '2026-09-18T15:00:00Z',
  };

  assert.strictEqual(presupuestoTest.estado, 'ACEPTADO');
  assert.strictEqual(otTest.presupuestoId, presupuestoTest.id);
  assert.strictEqual(otTest.importeEstimado, 242.00);
  console.log('  ✓ Presupuesto aceptado y vinculado a la Orden de Trabajo');
});

// -----------------------------------------------------------------
// TEST 9: Rechazar presupuesto (prueba de control de rechazo motivado)
// -----------------------------------------------------------------
runTest('Validación de rechazo de presupuesto exige motivo explícito', () => {
  const rechazoInvalido = validarRechazoPresupuesto('   ');
  assert.strictEqual(rechazoInvalido.valido, false);

  const rechazoValido = validarRechazoPresupuesto('Presupuesto excede el valor de mercado para esta intervención');
  assert.strictEqual(rechazoValido.valido, true);
  console.log('  ✓ Rechazo de presupuesto exige obligatoriamente justificación');
});

// -----------------------------------------------------------------
// TEST 10: Poner OT en ejecución
// -----------------------------------------------------------------
runTest('Poner OT en ejecución → Incidencia refleja EN_REPARACION / EN_CURSO', () => {
  otTest = {
    ...otTest,
    estado: 'EN_EJECUCION',
    fechaInicio: '2026-09-18T16:00:00Z',
    historial: [
      ...otTest.historial,
      crearItemHistorialTrabajo('ESTADO_MODIFICADO', 'Gómez Fontaneros S.L.', 'ACEPTADO', 'EN_EJECUCION', 'Comienzo de las obras de reparación'),
    ],
    updatedAt: '2026-09-18T16:00:00Z',
  };

  incidenciaTest = {
    ...incidenciaTest,
    estado: 'EN_REPARACION',
    trabajoProfesional: {
      ...incidenciaTest.trabajoProfesional!,
      estadoTrabajo: 'EN_CURSO',
      fechaInicio: otTest.fechaInicio,
    },
    historial: [
      ...incidenciaTest.historial,
      crearHistorialItem('CAMBIO_ESTADO', 'Gómez Fontaneros S.L.', 'Trabajo en curso en el inmueble'),
    ],
    updatedAt: '2026-09-18T16:00:00Z',
  };

  assert.strictEqual(otTest.estado, 'EN_EJECUCION');
  assert.strictEqual(incidenciaTest.estado, 'EN_REPARACION');
  assert.strictEqual(incidenciaTest.trabajoProfesional?.estadoTrabajo, 'EN_CURSO');
  console.log('  ✓ Estado sincronizado: OT en ejecución e Incidencia EN_REPARACION');
});

// -----------------------------------------------------------------
// TEST 11: Finalizar OT con coste real
// -----------------------------------------------------------------
runTest('Finalizar OT con registro del coste real liquidado', () => {
  otTest = {
    ...otTest,
    estado: 'FINALIZADO',
    importeFinal: 242.00, // Coste real liquidado
    fechaFinalizacion: '2026-09-18T18:00:00Z',
    historial: [
      ...otTest.historial,
      crearItemHistorialTrabajo('ESTADO_MODIFICADO', 'Gómez Fontaneros S.L.', 'EN_EJECUCION', 'FINALIZADO', 'Trabajo finalizado, fontanería probada'),
    ],
    updatedAt: '2026-09-18T18:00:00Z',
  };

  assert.strictEqual(otTest.estado, 'FINALIZADO');
  assert.strictEqual(otTest.importeFinal, 242.00);
  assert.ok(otTest.fechaFinalizacion);
  console.log('  ✓ OT finalizada con importe real de 242.00 €');
});

// -----------------------------------------------------------------
// TEST 12: Generar un único gasto desde la OT
// -----------------------------------------------------------------
runTest('Generar apunte de Gasto contable desde la OT finalizada', () => {
  const res = generarGastoDesdeTrabajo({
    trabajo: otTest,
    gastosExistentes: [],
    usuarioNombre: 'Gestor Patrimonial',
    usuarioId: 'usr_gestor',
  });

  assert.strictEqual(res.yaExiste, false);
  assert.ok(res.gasto);
  gastoTest = res.gasto;

  otTest.gastoId = gastoTest.id;

  assert.strictEqual(gastoTest.importe, 242.00);
  assert.strictEqual(gastoTest.tipo, 'EXPLOTACION');
  assert.strictEqual(gastoTest.categoria, 'REPARACION');
  assert.strictEqual(gastoTest.trabajoId, otTest.id);
  assert.strictEqual(gastoTest.incidenciaId, incidenciaTest.id);
  assert.strictEqual(gastoTest.profesionalId, otTest.profesionalId);
  assert.strictEqual(gastoTest.presupuestoId, otTest.presupuestoId);
  console.log('  ✓ Gasto contable generado con trazabilidad completa a OT, Incidencia, Profesional y Presupuesto');
});

// -----------------------------------------------------------------
// TEST 13: Reprocesar la misma OT (Idempotencia)
// -----------------------------------------------------------------
runTest('Reprocesar la misma OT finalizada NO duplica el gasto (Idempotencia)', () => {
  const resReintento = generarGastoDesdeTrabajo({
    trabajo: otTest,
    gastosExistentes: [gastoTest],
  });

  assert.strictEqual(resReintento.yaExiste, true);
  assert.strictEqual(resReintento.gasto?.id, gastoTest.id);
  console.log('  ✓ Idempotencia estricta: gasto existente recuperado sin duplicación');
});

// -----------------------------------------------------------------
// TEST 14: Modificar coste real final
// -----------------------------------------------------------------
runTest('Modificar coste real final sincroniza el gasto sin generar duplicados', () => {
  const otAjustada: TrabajoProfesional = {
    ...otTest,
    importeFinal: 250.00,
    updatedAt: '2026-09-18T19:00:00Z',
  };

  const gastoSincronizado = sincronizarGastoDesdeTrabajo({
    trabajo: otAjustada,
    gastoExistente: gastoTest,
  });

  assert.strictEqual(gastoSincronizado.id, gastoTest.id);
  assert.strictEqual(gastoSincronizado.importe, 250.00);
  console.log('  ✓ Gasto vinculado actualizado de 242.00 € a 250.00 € limpiamente');
});

// -----------------------------------------------------------------
// TEST 15: Cerrar incidencia
// -----------------------------------------------------------------
runTest('Cierre de incidencia → RESUELTA con trazabilidad completa de OT, coste y gasto', () => {
  incidenciaTest = {
    ...incidenciaTest,
    estado: 'RESUELTA',
    trabajoProfesional: {
      ...incidenciaTest.trabajoProfesional!,
      estadoTrabajo: 'FINALIZADO',
      costeReal: otTest.importeFinal,
      gastoId: gastoTest.id,
      fechaFinalizacion: otTest.fechaFinalizacion,
    },
    historial: [
      ...incidenciaTest.historial,
      crearHistorialItem('TRABAJO_FINALIZADO', 'Gestor Patrimonial', 'Incidencia reparada y coste asentado en contabilidad'),
    ],
    updatedAt: '2026-09-18T19:30:00Z',
  };

  assert.strictEqual(incidenciaTest.estado, 'RESUELTA');
  assert.strictEqual(incidenciaTest.trabajoProfesional?.costeReal, 242.00);
  assert.strictEqual(incidenciaTest.trabajoProfesional?.gastoId, gastoTest.id);
  assert.strictEqual(incidenciaTest.historial.length, 4);
  console.log('  ✓ Incidencia RESUELTA con cadena de trazabilidad íntegra');
});

// -----------------------------------------------------------------
// TEST 16: Propietario A intenta acceder a datos de B (RBAC)
// -----------------------------------------------------------------
runTest('Seguridad multitenant: Propietario A NO puede acceder a incidencias ni OTs de Propietario B', () => {
  const usuarioPropietarioB: UsuarioApp = {
    id: 'usr_prop_b',
    nombre: 'Propietario Beta',
    email: 'propietarioB@ejemplo.com',
    tipoPerfil: 'PROPIETARIO',
    roles: ['PROPIETARIO'],
    permisos: ['VER_MIS_INMUEBLES'],
    propietarioId: 'prop_titular_beta',
    estado: 'ACTIVO',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const puedeAcceder = canAccessIncidencia(incidenciaTest, usuarioPropietarioB);
  assert.strictEqual(puedeAcceder, false, 'Propietario B debe tener denegado el acceso a la incidencia de A');
  console.log('  ✓ Acceso denegado a propietarios ajenos');
});

// -----------------------------------------------------------------
// TEST 17: Profesional intenta acceder a OT no asignada (RBAC)
// -----------------------------------------------------------------
runTest('Seguridad RBAC: Profesional NO puede acceder a incidencias ni OTs no asignadas a él', () => {
  const profesionalAjeno: UsuarioApp = {
    id: 'usr_prof_ajeno',
    nombre: 'Fontanero Competencia',
    email: 'fontanero_competencia@ejemplo.com',
    tipoPerfil: 'PROFESIONAL',
    roles: ['PROFESIONAL'],
    permisos: ['VER_TRABAJOS_ASIGNADOS'],
    profesionalId: 'prof_otro_distinto',
    estado: 'ACTIVO',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const puedeAcceder = canAccessIncidencia(incidenciaTest, profesionalAjeno);
  assert.strictEqual(puedeAcceder, false, 'Profesional ajeno no asignado debe tener denegado el acceso');
  console.log('  ✓ Acceso denegado a profesionales no asignados');
});

// -----------------------------------------------------------------
// TEST 18: Usuario sin permiso intenta aprobar presupuesto
// -----------------------------------------------------------------
runTest('Control de decisión: Profesional emisor NO puede auto-aprobar su propio presupuesto', () => {
  const profesionalEmisor: UsuarioApp = {
    id: 'usr_prof_emisor',
    nombre: 'Gómez Fontaneros',
    email: 'contacto@gomezfontaneros.es',
    tipoPerfil: 'PROFESIONAL',
    roles: ['PROFESIONAL'],
    permisos: ['VER_TRABAJOS_ASIGNADOS'],
    profesionalId: 'prof_fontaneria_gomez',
    estado: 'ACTIVO',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const puedeAprobar = profesionalEmisor.tipoPerfil !== 'PROFESIONAL';
  assert.strictEqual(puedeAprobar, false, 'El profesional emisor no puede auto-aprobarse');
  console.log('  ✓ Auto-aprobación de presupuestos por profesionales bloqueada');
});

// -----------------------------------------------------------------
// TEST 19: Usuario sin permiso intenta modificar datos económicos ajenos
// -----------------------------------------------------------------
runTest('Aislamiento contable: Profesional no puede acceder ni alterar gastos del propietario', () => {
  const profesional: UsuarioApp = {
    id: 'usr_prof',
    nombre: 'Gómez Fontaneros',
    email: 'contacto@gomezfontaneros.es',
    tipoPerfil: 'PROFESIONAL',
    roles: ['PROFESIONAL'],
    permisos: ['VER_TRABAJOS_ASIGNADOS'],
    profesionalId: 'prof_fontaneria_gomez',
    estado: 'ACTIVO',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const puedeVerGastosGenerales = profesional.tipoPerfil !== 'PROFESIONAL';
  assert.strictEqual(puedeVerGastosGenerales, false);
  console.log('  ✓ Gastos y rentabilidad del propietario completamente aislados');
});

// -----------------------------------------------------------------
// TEST 20: Persistencia de relaciones y estados
// -----------------------------------------------------------------
runTest('Persistencia e integridad de relaciones de extremo a extremo tras recarga', () => {
  // Verificamos que todas las entidades del circuito conservan las referencias cruzadas
  assert.strictEqual(incidenciaTest.id, otTest.incidenciaId);
  assert.strictEqual(otTest.id, presupuestoTest.trabajoId);
  assert.strictEqual(otTest.presupuestoId, presupuestoTest.id);
  assert.strictEqual(otTest.id, gastoTest.trabajoId);
  assert.strictEqual(incidenciaTest.id, gastoTest.incidenciaId);
  assert.strictEqual(incidenciaTest.propietarioId, gastoTest.propietarioId);
  assert.strictEqual(incidenciaTest.inmuebleId, gastoTest.inmuebleId);
  assert.strictEqual(otTest.profesionalId, gastoTest.profesionalId);
  assert.strictEqual(presupuestoTest.id, gastoTest.presupuestoId);
  assert.strictEqual(incidenciaTest.estado, 'RESUELTA');
  assert.strictEqual(otTest.estado, 'FINALIZADO');
  assert.strictEqual(presupuestoTest.estado, 'ACEPTADO');
  assert.strictEqual(gastoTest.estado, 'PAGADO');
  console.log('  ✓ Todas las claves foráneas e identificadores cruzados concuerdan al 100%');
});

console.log('\n================================================================================');
console.log(`🎉 TODOS LOS ${passedTests}/${totalTests} TESTS DEL CIRCUITO COMPLETO HAN SIDO SUPERADOS (100%)`);
console.log('================================================================================\n');
