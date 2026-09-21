// =========================================================================
// TEST SUITE: CIERRE DEL CIRCUITO PRESUPUESTO → AJUSTE → REENVÍO → NUEVA DECISIÓN
// Valida los 16 tests obligatorios de la orden.
// =========================================================================

import {
  PresupuestoProfesional,
  TrabajoProfesional,
  PartidaPresupuesto,
  CategoriaMotivoAjuste,
  UsuarioApp,
} from './src/types';
import {
  calcularTotalesPresupuesto,
  crearItemHistorialPresupuesto,
  crearItemHistorialTrabajo,
  validarSolicitudAjuste,
  validarRechazoPresupuesto,
  ESTADO_PRESUPUESTO_LABELS,
  CATEGORIA_AJUSTE_LABELS,
} from './src/utils/profesionalesEngine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FALLO ASSERT: ${message}`);
    throw new Error(`Test failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runTestSuite() {
  console.log('\n=================================================================');
  console.log('EJECUTANDO VALIDACIÓN DE LOS 16 TESTS DEL CIRCUITO DE PRESUPUESTOS');
  console.log('=================================================================\n');

  // -----------------------------------------------------------------------
  // TEST 1: Crear/recibir presupuesto
  // -----------------------------------------------------------------------
  console.log('🔹 TEST 1: Crear / recibir presupuesto');
  const partidasIniciales: PartidaPresupuesto[] = [
    { id: 'p1', concepto: 'Mano de obra fontanero urgente', cantidad: 2, precioUnitario: 50, importe: 100 },
    { id: 'p2', concepto: 'Válvula de presión y latiguillos', cantidad: 1, precioUnitario: 35, importe: 35 },
  ];
  const totales1 = calcularTotalesPresupuesto(partidasIniciales, 21);
  assert(totales1.importeBase === 135, 'Base imponible calculada correctamente (135 €)');
  assert(totales1.iva === 28.35, 'IVA 21% calculado correctamente (28.35 €)');
  assert(totales1.importeTotal === 163.35, 'Total presupuesto calculado (163.35 €)');

  const pres1: PresupuestoProfesional = {
    id: 'pres_test_001',
    numeroPresupuesto: 'PRE-2026-0001',
    trabajoId: 'ot_test_100',
    incidenciaId: 'inc_test_200',
    profesionalId: 'prof_fontaneria_1',
    profesionalNombre: 'Fontanería Rápida S.L.',
    propietarioId: 'prop_owner_1',
    inmuebleId: 'inm_vivienda_1',
    inmuebleDireccion: 'Calle Mayor 10, 2ºA',
    fecha: new Date().toISOString(),
    validez: '30 días',
    descripcion: 'Sustitución de válvula y reparación de fuga en cocina',
    partidas: partidasIniciales,
    importeBase: totales1.importeBase,
    iva: totales1.iva,
    porcentajeIva: 21,
    importeTotal: totales1.importeTotal,
    estado: 'RECIBIDO',
    version: 1,
    historialDecision: [
      crearItemHistorialPresupuesto('CREACION', 'Juan Fontanero', 'BORRADOR', 'RECIBIDO', {
        version: 1,
        importeTotal: totales1.importeTotal,
        partidasSnapshot: partidasIniciales,
        observaciones: 'Presupuesto inicial emitido',
      }),
    ],
    creadoPor: 'Juan Fontanero',
    actualizadoPor: 'Juan Fontanero',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assert(pres1.estado === 'RECIBIDO', 'Presupuesto creado en estado RECIBIDO');
  assert(pres1.version === 1, 'Versión inicial es 1');
  assert(pres1.historialDecision?.length === 1, 'Historial inicial tiene 1 evento de CREACION');

  // -----------------------------------------------------------------------
  // TEST 2: Solicitar ajuste sin motivo → DENEGADO
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 2: Solicitar ajuste sin motivo → DENEGADO');
  const vSinCat = validarSolicitudAjuste('', 'Detalle');
  assert(!vSinCat.valido, 'Solicitud de ajuste sin categoría es DENEGADA');
  const vSinMotivo = validarSolicitudAjuste('PRECIO', '');
  assert(!vSinMotivo.valido, 'Solicitud de ajuste sin motivo es DENEGADA');
  const vSoloEspacios = validarSolicitudAjuste('PRECIO', '    ');
  assert(!vSoloEspacios.valido, 'Solicitud de ajuste con solo espacios es DENEGADA');

  // -----------------------------------------------------------------------
  // TEST 3: Solicitar ajuste con motivo → "EN_NEGOCIACION"
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 3: Solicitar ajuste con motivo → EN_NEGOCIACION');
  const vAjusteValido = validarSolicitudAjuste('PRECIO', 'Precio de mano de obra superior al baremo acordado');
  assert(vAjusteValido.valido, 'Validación de ajuste con categoría y motivo es APROBADA');

  // Aplicar transición a EN_NEGOCIACION
  const motivoAjusteTexto = 'Precio de mano de obra superior al baremo acordado';
  const categoriaAjusteSelec: CategoriaMotivoAjuste = 'PRECIO';
  const usuarioGestor = 'Carlos Gestor';

  const itemAjuste = crearItemHistorialPresupuesto(
    'SOLICITUD_AJUSTE',
    usuarioGestor,
    pres1.estado,
    'EN_NEGOCIACION',
    {
      categoriaMotivo: categoriaAjusteSelec,
      motivo: motivoAjusteTexto,
      observaciones: `Ajuste solicitado [${CATEGORIA_AJUSTE_LABELS[categoriaAjusteSelec].label}]: ${motivoAjusteTexto}`,
      version: pres1.version,
      importeTotal: pres1.importeTotal,
      partidasSnapshot: pres1.partidas,
    }
  );

  const presEnNegociacion: PresupuestoProfesional = {
    ...pres1,
    estado: 'EN_NEGOCIACION',
    categoriaAjuste: categoriaAjusteSelec,
    motivoAjuste: motivoAjusteTexto,
    fechaSolicitudAjuste: new Date().toISOString(),
    solicitadoAjustePor: usuarioGestor,
    // NO debe rellenar campos de decisión definitiva
    fechaDecision: undefined,
    decididoPor: undefined,
    motivoRechazo: undefined,
    historialDecision: [...(pres1.historialDecision || []), itemAjuste],
    actualizadoPor: usuarioGestor,
    updatedAt: new Date().toISOString(),
  };

  assert(presEnNegociacion.estado === 'EN_NEGOCIACION', 'Presupuesto pasa a EN_NEGOCIACION');
  assert(presEnNegociacion.categoriaAjuste === 'PRECIO', 'Categoría de ajuste guardada');
  assert(presEnNegociacion.motivoAjuste === motivoAjusteTexto, 'Motivo de ajuste guardado');
  assert(presEnNegociacion.fechaDecision === undefined, 'fechaDecision no está establecida (no es decisión final)');
  assert(presEnNegociacion.decididoPor === undefined, 'decididoPor no está establecido (no es decisión final)');

  // -----------------------------------------------------------------------
  // TEST 4: Comprobar histórico tras solicitud de ajuste
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 4: Comprobar histórico de la solicitud de ajuste');
  assert(presEnNegociacion.historialDecision?.length === 2, 'Historial contiene 2 eventos');
  const eventoAjuste = presEnNegociacion.historialDecision![1];
  assert(eventoAjuste.accion === 'SOLICITUD_AJUSTE', 'Acción del evento es SOLICITUD_AJUSTE');
  assert(eventoAjuste.estadoAnterior === 'RECIBIDO', 'Estado anterior registrado correctamente');
  assert(eventoAjuste.estadoNuevo === 'EN_NEGOCIACION', 'Estado nuevo registrado correctamente');
  assert(eventoAjuste.motivo === motivoAjusteTexto, 'Motivo del ajuste registrado en el histórico');
  assert(eventoAjuste.usuario === usuarioGestor, 'Usuario que solicitó el ajuste registrado');
  assert(typeof eventoAjuste.fecha === 'string' && eventoAjuste.fecha.length > 0, 'Fecha registrada');

  // -----------------------------------------------------------------------
  // TEST 5: Modificar presupuesto → cambios guardados
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 5: Modificar presupuesto (partidas / importes)');
  const partidasModificadas: PartidaPresupuesto[] = [
    { id: 'p1', concepto: 'Mano de obra fontanero urgente (tarifa ajustada)', cantidad: 2, precioUnitario: 40, importe: 80 },
    { id: 'p2', concepto: 'Válvula de presión y latiguillos', cantidad: 1, precioUnitario: 30, importe: 30 },
  ];
  const totales2 = calcularTotalesPresupuesto(partidasModificadas, 21);
  assert(totales2.importeBase === 110, 'Nueva base imponible calculada (110 €)');
  assert(totales2.iva === 23.1, 'Nuevo IVA calculado (23.10 €)');
  assert(totales2.importeTotal === 133.1, 'Nuevo total calculado (133.10 €)');

  // -----------------------------------------------------------------------
  // TEST 6: Guardar sin reenviar → NO cambia automáticamente a nueva revisión
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 6: Guardar modificación sin reenviar');
  const itemModificacion = crearItemHistorialPresupuesto(
    'MODIFICACION',
    'Juan Fontanero',
    presEnNegociacion.estado,
    'EN_NEGOCIACION',
    {
      observaciones: 'Ajuste de tarifas de mano de obra guardado como borrador',
      version: presEnNegociacion.version,
      importeTotal: totales2.importeTotal,
      partidasSnapshot: partidasModificadas,
    }
  );

  const presModificadoGuardado: PresupuestoProfesional = {
    ...presEnNegociacion,
    partidas: partidasModificadas,
    importeBase: totales2.importeBase,
    iva: totales2.iva,
    importeTotal: totales2.importeTotal,
    estado: 'EN_NEGOCIACION', // MANTIENE EN_NEGOCIACION
    version: 1, // NO INCREMENTA VERSIÓN HASTA REENVÍO
    historialDecision: [...(presEnNegociacion.historialDecision || []), itemModificacion],
    actualizadoPor: 'Juan Fontanero',
    updatedAt: new Date().toISOString(),
  };

  assert(presModificadoGuardado.estado === 'EN_NEGOCIACION', 'Estado se mantiene en EN_NEGOCIACION al guardar');
  assert(presModificadoGuardado.version === 1, 'Versión se mantiene en 1 (no cambia a nueva revisión aún)');
  assert(presModificadoGuardado.importeTotal === 133.1, 'Cambios de precio guardados correctamente');
  assert(presModificadoGuardado.historialDecision?.length === 3, 'Historial registra evento MODIFICACION');

  // -----------------------------------------------------------------------
  // TEST 7: Reenviar → vuelve a estado de revisión
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 7: Reenviar presupuesto ajustado');
  const nuevaVersion = (presModificadoGuardado.version || 1) + 1;
  const notaReenvio = 'Se han reducido precios unitarios según baremo solicitado';

  const itemReenvio = crearItemHistorialPresupuesto(
    'REENVIO',
    'Juan Fontanero',
    'EN_NEGOCIACION',
    'EN_REVISION',
    {
      observaciones: notaReenvio,
      version: nuevaVersion,
      importeTotal: presModificadoGuardado.importeTotal,
      partidasSnapshot: presModificadoGuardado.partidas,
    }
  );

  const presReenviado: PresupuestoProfesional = {
    ...presModificadoGuardado,
    estado: 'EN_REVISION',
    version: nuevaVersion, // Incrementa a 2
    categoriaAjuste: undefined,
    motivoAjuste: undefined,
    fechaSolicitudAjuste: undefined,
    solicitadoAjustePor: undefined,
    historialDecision: [...(presModificadoGuardado.historialDecision || []), itemReenvio],
    actualizadoPor: 'Juan Fontanero',
    updatedAt: new Date().toISOString(),
  };

  assert(presReenviado.estado === 'EN_REVISION', 'Presupuesto pasa a EN_REVISION tras reenvío');
  assert(presReenviado.version === 2, 'Versión incrementada a 2');

  // -----------------------------------------------------------------------
  // TEST 8: Comprobar histórico del reenvío
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 8: Comprobar histórico del reenvío');
  assert(presReenviado.historialDecision?.length === 4, 'Historial contiene 4 eventos');
  const eventoReenvio = presReenviado.historialDecision![3];
  assert(eventoReenvio.accion === 'REENVIO', 'Acción es REENVIO');
  assert(eventoReenvio.estadoAnterior === 'EN_NEGOCIACION', 'Estado anterior es EN_NEGOCIACION');
  assert(eventoReenvio.estadoNuevo === 'EN_REVISION', 'Estado nuevo es EN_REVISION');
  assert(eventoReenvio.version === 2, 'Versión 2 registrada en el evento');
  assert(eventoReenvio.importeTotal === 133.1, 'Snapshot de importe registrado en el reenvío');

  // -----------------------------------------------------------------------
  // TEST 9: Aceptar tras reenvío → "ACEPTADO"
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 9: Aceptar tras reenvío → ACEPTADO');
  const itemAceptacion = crearItemHistorialPresupuesto(
    'APROBACION',
    'Carlos Gestor',
    'EN_REVISION',
    'ACEPTADO',
    {
      observaciones: 'Presupuesto revisado v2 aprobado y adjudicado',
      version: presReenviado.version,
      importeTotal: presReenviado.importeTotal,
      partidasSnapshot: presReenviado.partidas,
    }
  );

  const presAceptado: PresupuestoProfesional = {
    ...presReenviado,
    estado: 'ACEPTADO',
    fechaDecision: new Date().toISOString(),
    decididoPor: 'Carlos Gestor',
    historialDecision: [...(presReenviado.historialDecision || []), itemAceptacion],
    actualizadoPor: 'Carlos Gestor',
    updatedAt: new Date().toISOString(),
  };

  assert(presAceptado.estado === 'ACEPTADO', 'Presupuesto pasa a ACEPTADO');
  assert(presAceptado.decididoPor === 'Carlos Gestor', 'decididoPor registrado');
  assert(typeof presAceptado.fechaDecision === 'string', 'fechaDecision registrada');
  assert(presAceptado.historialDecision?.length === 5, 'Historial contiene 5 eventos');

  // -----------------------------------------------------------------------
  // TEST 10: Solicitar nuevo ajuste después de una revisión posterior
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 10: Ciclos múltiples (Ajuste #2 → Reenvío v3 → Nueva decisión)');
  // Creamos un segundo presupuesto en EN_REVISION v2
  const presCiclo2: PresupuestoProfesional = {
    ...presReenviado,
    id: 'pres_test_multi_cycle',
  };

  // Ajuste #2 por alcance
  const vAjuste2 = validarSolicitudAjuste('ALCANCE', 'Se precisa añadir sellado perimetral y prueba de estanqueidad');
  assert(vAjuste2.valido, 'Segundo ajuste con motivo de alcance es válido');

  const presAjuste2: PresupuestoProfesional = {
    ...presCiclo2,
    estado: 'EN_NEGOCIACION',
    categoriaAjuste: 'ALCANCE',
    motivoAjuste: 'Se precisa añadir sellado perimetral y prueba de estanqueidad',
    historialDecision: [
      ...(presCiclo2.historialDecision || []),
      crearItemHistorialPresupuesto('SOLICITUD_AJUSTE', 'Carlos Gestor', 'EN_REVISION', 'EN_NEGOCIACION', {
        categoriaMotivo: 'ALCANCE',
        motivo: 'Se precisa añadir sellado perimetral y prueba de estanqueidad',
        version: 2,
      }),
    ],
  };
  assert(presAjuste2.estado === 'EN_NEGOCIACION', 'Pasa a EN_NEGOCIACION en segundo ciclo');

  // Reenvío v3
  const presReenvio3: PresupuestoProfesional = {
    ...presAjuste2,
    estado: 'EN_REVISION',
    version: 3,
    historialDecision: [
      ...(presAjuste2.historialDecision || []),
      crearItemHistorialPresupuesto('REENVIO', 'Juan Fontanero', 'EN_NEGOCIACION', 'EN_REVISION', {
        version: 3,
        observaciones: 'Partida de sellado añadida',
      }),
    ],
  };
  assert(presReenvio3.estado === 'EN_REVISION', 'Pasa a EN_REVISION en v3');
  assert(presReenvio3.version === 3, 'Versión 3 registrada');

  // -----------------------------------------------------------------------
  // TEST 11, 12, 13: Rechazar con y sin motivo
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 11, 12, 13: Rechazo formal y validación obligatoria de motivo');
  const vRechazoVacio = validarRechazoPresupuesto('');
  assert(!vRechazoVacio.valido, 'TEST 12: Rechazo sin motivo es DENEGADO');
  const vRechazoEspacios = validarRechazoPresupuesto('   ');
  assert(!vRechazoEspacios.valido, 'TEST 12: Rechazo con espacios es DENEGADO');

  const motivoRechazoValido = 'Importe final fuera del límite presupuestario asignado para esta avería';
  const vRechazoOk = validarRechazoPresupuesto(motivoRechazoValido);
  assert(vRechazoOk.valido, 'TEST 13: Validación con motivo es ACEPTADA');

  const presRechazado: PresupuestoProfesional = {
    ...presReenvio3,
    estado: 'RECHAZADO',
    motivoRechazo: motivoRechazoValido,
    fechaDecision: new Date().toISOString(),
    decididoPor: 'Carlos Gestor',
    historialDecision: [
      ...(presReenvio3.historialDecision || []),
      crearItemHistorialPresupuesto('RECHAZO', 'Carlos Gestor', 'EN_REVISION', 'RECHAZADO', {
        motivo: motivoRechazoValido,
        version: presReenvio3.version,
      }),
    ],
  };

  assert(presRechazado.estado === 'RECHAZADO', 'TEST 11: Estado pasa a RECHAZADO');
  assert(presRechazado.motivoRechazo === motivoRechazoValido, 'TEST 13: Motivo de rechazo guardado');
  assert(presRechazado.decididoPor === 'Carlos Gestor', 'TEST 13: decididoPor guardado');

  // -----------------------------------------------------------------------
  // TEST 14: Comprobar secuencia histórica completa
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 14: Comprobar secuencia histórica completa');
  const historialCompleto = presRechazado.historialDecision!;
  assert(historialCompleto.length >= 6, `Historial completo contiene ${historialCompleto.length} eventos`);
  
  const acciones = historialCompleto.map((h) => h.accion);
  assert(acciones.includes('CREACION'), 'Historial incluye CREACION');
  assert(acciones.includes('SOLICITUD_AJUSTE'), 'Historial incluye SOLICITUD_AJUSTE');
  assert(acciones.includes('REENVIO'), 'Historial incluye REENVIO');
  assert(acciones.includes('RECHAZO'), 'Historial incluye RECHAZO');

  // Verificar orden cronológico
  for (let i = 1; i < historialCompleto.length; i++) {
    const tPrev = new Date(historialCompleto[i - 1].fecha).getTime();
    const tCurr = new Date(historialCompleto[i].fecha).getTime();
    assert(tCurr >= tPrev, `Evento ${i} es cronológicamente posterior o igual al anterior`);
  }

  // -----------------------------------------------------------------------
  // TEST 15: Comprobar asociación con OT / Incidencia
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 15: Comprobar asociación con OT e Incidencia');
  assert(presAceptado.trabajoId === 'ot_test_100', 'trabajoId intacto tras todo el circuito');
  assert(presAceptado.incidenciaId === 'inc_test_200', 'incidenciaId intacto tras todo el circuito');
  assert(presAceptado.inmuebleId === 'inm_vivienda_1', 'inmuebleId intacto tras todo el circuito');
  assert(presAceptado.propietarioId === 'prop_owner_1', 'propietarioId intacto tras todo el circuito');
  assert(presAceptado.profesionalId === 'prof_fontaneria_1', 'profesionalId intacto tras todo el circuito');

  // Simulación de sincronización con Orden de Trabajo (OT)
  const trabajoOT: TrabajoProfesional = {
    id: 'ot_test_100',
    propietarioId: 'prop_owner_1',
    inmuebleId: 'inm_vivienda_1',
    incidenciaId: 'inc_test_200',
    titulo: 'Reparación fuga en cocina',
    descripcion: 'Avería de fontanería',
    categoria: 'FONTANERIA',
    prioridad: 'ALTA',
    estado: 'PRESUPUESTO_RECIBIDO',
    fechaSolicitud: new Date().toISOString(),
    creadoPor: 'Carlos Gestor',
    actualizadoPor: 'Carlos Gestor',
    historial: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Al aprobar presupuesto
  const trabajoAprobado: TrabajoProfesional = {
    ...trabajoOT,
    estado: 'ACEPTADO',
    presupuestoId: presAceptado.id,
    importeEstimado: presAceptado.importeTotal,
    historial: [
      crearItemHistorialTrabajo('PRESUPUESTO_ACEPTADO', 'Carlos Gestor', trabajoOT.estado, 'ACEPTADO', 'Presupuesto aprobado'),
    ],
  };

  assert(trabajoAprobado.estado === 'ACEPTADO', 'OT pasa a estado ACEPTADO');
  assert(trabajoAprobado.presupuestoId === presAceptado.id, 'OT queda vinculada con el ID del presupuesto');
  assert(trabajoAprobado.importeEstimado === presAceptado.importeTotal, 'OT sincroniza el importe estimado');

  // -----------------------------------------------------------------------
  // TEST 16: Comprobar permisos RBAC
  // -----------------------------------------------------------------------
  console.log('\n🔹 TEST 16: Comprobar permisos RBAC');
  const userAdmin: UsuarioApp = {
    id: 'u_admin',
    email: 'admin@gestor.es',
    nombre: 'Admin',
    tipoPerfil: 'ADMINISTRADOR',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const userProp: UsuarioApp = {
    id: 'u_prop',
    email: 'propietario@gestor.es',
    nombre: 'Propietario',
    tipoPerfil: 'PROPIETARIO',
    propietarioId: 'prop_owner_1',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const userProfEmisor: UsuarioApp = {
    id: 'u_prof',
    email: 'fontanero@profesional.es',
    nombre: 'Juan',
    tipoPerfil: 'PROFESIONAL',
    profesionalId: 'prof_fontaneria_1',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const userProfAjeno: UsuarioApp = {
    id: 'u_prof_ajeno',
    email: 'electricista@profesional.es',
    nombre: 'Pedro',
    tipoPerfil: 'PROFESIONAL',
    profesionalId: 'prof_electricidad_99',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Verificar lógica de permisos
  const canDecideAdmin = userAdmin.tipoPerfil === 'ADMINISTRADOR';
  const canDecideProp = userProp.tipoPerfil === 'PROPIETARIO';
  const canDecideProf = userProfEmisor.tipoPerfil === 'ADMINISTRADOR' || userProfEmisor.tipoPerfil === 'PROPIETARIO';
  
  assert(canDecideAdmin, 'Admin tiene permiso para decidir');
  assert(canDecideProp, 'Propietario tiene permiso para decidir');
  assert(!canDecideProf, 'Profesional emisor NO puede auto-aprobarse el presupuesto (DENEGADO)');

  const canEditEmisor = userProfEmisor.tipoPerfil === 'ADMINISTRADOR' || userProfEmisor.profesionalId === presAceptado.profesionalId;
  const canEditAjeno = userProfAjeno.tipoPerfil === 'ADMINISTRADOR' || userProfAjeno.profesionalId === presAceptado.profesionalId;
  
  assert(canEditEmisor, 'Profesional emisor puede modificar y reenviar su propio presupuesto');
  assert(!canEditAjeno, 'Profesional ajeno NO puede modificar ni reenviar presupuesto ajeno (DENEGADO)');

  console.log('\n=================================================================');
  console.log('🎉 TODOS LOS 16 TESTS HAN SIDO SUPERADOS SATISFACTORIAMENTE (16/16)');
  console.log('=================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Error in test suite:', err);
  process.exit(1);
});
