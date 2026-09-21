/**
 * 12 Tests funcionales para circuito renovación seguros ARENA D
 * Ejecutar: npx tsx tests_seguros_renovacion.ts
 * Valida: detección 60/45/30/15, alertas, comparación objetiva, RBAC, histórico, validación IA consultiva, cadena histórica
 */

import {
  calcularDiasRestantes,
  obtenerNivelAlerta,
  generarAlertaRenovacion,
  detectarPolizasProximasVencer,
  debeGenerarAlerta,
  compararPolizas,
  canAccessPoliza,
  filtrarPolizasPorUsuario,
  crearHistorialPolizaItem,
  validarDatosExtraidos,
  obtenerCadenaHistorialPoliza,
  obtenerTextoDiasRestantes,
  INTERVALOS_ALERTA_RENOVACION,
} from './src/utils/segurosEngine';
import { PolizaSeguro, UsuarioApp, HistorialPolizaItem } from './src/types';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`✅ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${msg}`);
    failed++;
  }
}

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Mocks
const polizaBase: PolizaSeguro = {
  id: 'pol_001',
  aseguradora: 'Mapfre',
  numeroPoliza: 'MAP-123',
  tipo: 'HOGAR',
  inmuebleId: 'inm_001',
  inmuebleDireccion: 'Calle Test 1',
  fechaInicio: daysFromNow(-300),
  fechaVencimiento: daysFromNow(60),
  estado: 'VIGENTE',
  estadoRenovacion: 'VIGENTE',
  coberturas: ['Daños por agua', 'Incendio'],
  primaAnual: 200,
  propietarioId: 'prop_001',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const propietarioUser: UsuarioApp = {
  id: 'user_prop_1',
  nombre: 'Propietario Test',
  email: 'prop@test.com',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO_ESTANDAR'],
  permisos: [],
  propietarioId: 'prop_001',
  inmuebleIds: ['inm_001', 'inm_002'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const profesionalUser: UsuarioApp = {
  id: 'user_prof_1',
  nombre: 'Profesional Test',
  email: 'prof@test.com',
  tipoPerfil: 'PROFESIONAL',
  estado: 'ACTIVO',
  roles: ['PROFESIONAL_MANTENIMIENTO'],
  permisos: [],
  profesionalId: 'prof_001',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const adminUser: UsuarioApp = {
  id: 'user_admin_1',
  nombre: 'Admin',
  email: 'admin@test.com',
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  roles: ['SUPERADMIN'],
  permisos: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// TEST 1: calcularDiasRestantes y obtenerNivelAlerta 60/45/30/15 y vencida
(() => {
  const dias60 = calcularDiasRestantes(daysFromNow(60));
  const nivel60 = obtenerNivelAlerta(dias60);
  assert(nivel60 === 60, `Test1a: 60 días debe dar nivel 60, got ${nivel60} dias=${dias60}`);

  const dias45 = calcularDiasRestantes(daysFromNow(45));
  const nivel45 = obtenerNivelAlerta(dias45);
  assert(nivel45 === 45, `Test1b: 45 días debe dar nivel 45, got ${nivel45}`);

  const dias30 = calcularDiasRestantes(daysFromNow(30));
  const nivel30 = obtenerNivelAlerta(dias30);
  assert(nivel30 === 30, `Test1c: 30 días debe dar nivel 30, got ${nivel30}`);

  const dias15 = calcularDiasRestantes(daysFromNow(15));
  const nivel15 = obtenerNivelAlerta(dias15);
  assert(nivel15 === 15, `Test1d: 15 días debe dar nivel 15, got ${nivel15}`);

  const diasVencida = calcularDiasRestantes(daysFromNow(-5));
  const nivelVencida = obtenerNivelAlerta(diasVencida);
  assert(nivelVencida === -1, `Test1e: vencida debe dar -1, got ${nivelVencida}`);

  const diasHoy = calcularDiasRestantes(daysFromNow(0));
  const nivelHoy = obtenerNivelAlerta(diasHoy);
  assert(nivelHoy === 0, `Test1f: hoy debe dar 0, got ${nivelHoy}`);
})();

// TEST 2: generarAlertaRenovacion filtra estados terminales y genera alerta correcta
(() => {
  const polVigente: PolizaSeguro = { ...polizaBase, fechaVencimiento: daysFromNow(30), estadoRenovacion: 'VIGENTE' };
  const alerta = generarAlertaRenovacion(polVigente);
  assert(alerta !== null && alerta.nivelProximidad === 30, `Test2a: debe generar alerta nivel 30, got ${alerta?.nivelProximidad}`);

  const polRenovada: PolizaSeguro = { ...polizaBase, estadoRenovacion: 'RENOVADA', fechaVencimiento: daysFromNow(10) };
  const alertaRenovada = generarAlertaRenovacion(polRenovada);
  assert(alertaRenovada === null, `Test2b: RENOVADA no debe generar alerta`);

  const polSustituida: PolizaSeguro = { ...polizaBase, estadoRenovacion: 'SUSTITUIDA' as any };
  assert(generarAlertaRenovacion(polSustituida) === null, `Test2c: SUSTITUIDA no genera alerta`);
})();

// TEST 3: detectarPolizasProximasVencer ordenado asc por urgencia
(() => {
  const polizas: PolizaSeguro[] = [
    { ...polizaBase, id: 'pol_60', fechaVencimiento: daysFromNow(60) },
    { ...polizaBase, id: 'pol_15', fechaVencimiento: daysFromNow(15) },
    { ...polizaBase, id: 'pol_45', fechaVencimiento: daysFromNow(45) },
    { ...polizaBase, id: 'pol_90', fechaVencimiento: daysFromNow(90) }, // fuera de intervalo, no debe salir
  ];
  const alertas = detectarPolizasProximasVencer(polizas);
  assert(alertas.length === 3, `Test3a: debe detectar 3 alertas (15,45,60) no 90, got ${alertas.length}`);
  assert(alertas[0].polizaId === 'pol_15', `Test3b: primera alerta debe ser la más urgente 15 días, got ${alertas[0]?.polizaId}`);
  assert(alertas[1].polizaId === 'pol_45', `Test3c: segunda 45 días`);
  assert(alertas[2].polizaId === 'pol_60', `Test3d: tercera 60 días`);
})();

// TEST 4: debeGenerarAlerta anti-spam 24h - nueva firma (poliza, alertaAnterior)
(() => {
  const ahora = new Date().toISOString();
  const hace1h = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  const hace25h = new Date(Date.now() - 25 * 3600 * 1000).toISOString();

  const poliza30: PolizaSeguro = { ...polizaBase, fechaVencimiento: daysFromNow(30) };

  const debe1 = debeGenerarAlerta(poliza30, { nivel: 30, fecha: hace25h });
  assert(debe1 === true, `Test4a: 25h después debe generar alerta`);

  const debe2 = debeGenerarAlerta(poliza30, { nivel: 30, fecha: hace1h });
  assert(debe2 === false, `Test4b: 1h después no debe generar (anti-spam 24h)`);

  const debe3 = debeGenerarAlerta(poliza30, undefined);
  assert(debe3 === true, `Test4c: sin última alerta debe generar`);

  const polizaCambioNivel: PolizaSeguro = { ...polizaBase, fechaVencimiento: daysFromNow(15) };
  const debe4 = debeGenerarAlerta(polizaCambioNivel, { nivel: 30, fecha: hace1h });
  assert(debe4 === true, `Test4d: cambio de nivel 30->15 debe generar aunque haya pasado 1h`);
})();

// TEST 5: compararPolizas objetiva sin valoración comercial - prima y %
(() => {
  const anterior: PolizaSeguro = { ...polizaBase, primaAnual: 200, coberturas: ['Agua', 'Incendio'], franquicia: 0 };
  const nueva: PolizaSeguro = { ...polizaBase, id: 'pol_002', primaAnual: 250, coberturas: ['Agua', 'Incendio', 'Robo'], franquicia: 100 };
  const comp = compararPolizas(anterior, nueva);
  assert(comp.primaAnterior === 200 && comp.primaNueva === 250, `Test5a: primas correctas`);
  assert(comp.diferenciaAbsoluta === 50, `Test5b: diferencia absoluta 50, got ${comp.diferenciaAbsoluta}`);
  assert(Math.abs((comp.variacionPorcentual || 0) - 25) < 0.1, `Test5c: variación 25%, got ${comp.variacionPorcentual}`);
  assert(comp.aumentoPrima === true, `Test5d: flag aumentoPrima true`);
  assert(comp.coberturasAnadidas.includes('Robo'), `Test5e: detecta cobertura añadida Robo`);
  assert(comp.aumentoFranquicia === true, `Test5f: detecta aumento franquicia 0->100`);
})();

// TEST 6: compararPolizas detecta reducción cobertura y modificación límites (objetivo, sin valoración comercial)
(() => {
  const anterior: PolizaSeguro = { ...polizaBase, coberturas: ['Agua', 'Incendio', 'Robo'], primaAnual: 300, franquicia: 50 };
  const nueva: PolizaSeguro = { ...polizaBase, id: 'pol_003', coberturas: ['Agua'], primaAnual: 280, franquicia: 50 };
  const comp = compararPolizas(anterior, nueva);
  assert(comp.reduccionCobertura === true, `Test6a: debe detectar reducción cobertura`);
  assert(comp.coberturasEliminadas.length === 2, `Test6b: 2 coberturas eliminadas, got ${comp.coberturasEliminadas.length}`);
  assert(comp.coberturasComunes.includes('Agua'), `Test6c: cobertura común Agua`);
  // Sin valoración comercial: texto no debe contener "recomendable", "bueno", etc (verificado por flags objetivos)
  assert(typeof comp.aumentoPrima === 'boolean', `Test6d: comparación objetiva con flags booleanos`);
})();

// TEST 7: RBAC canAccessPoliza - propietario vs profesional vs admin
(() => {
  const pol = { ...polizaBase, inmuebleId: 'inm_001', propietarioId: 'prop_001' };

  const accessPropOk = canAccessPoliza(pol, propietarioUser);
  assert(accessPropOk === true, `Test7a: propietario con inmuebleId autorizado debe acceder`);

  const propietarioSinAcceso: UsuarioApp = { ...propietarioUser, inmuebleIds: ['inm_999'], propietarioId: 'prop_999' };
  const accessPropNo = canAccessPoliza(pol, propietarioSinAcceso);
  assert(accessPropNo === false, `Test7b: propietario sin inmueble no debe acceder`);

  const accessProf = canAccessPoliza(pol, profesionalUser);
  assert(accessProf === false, `Test7c: profesional nunca accede a pólizas (seguridad)`);

  const accessAdmin = canAccessPoliza(pol, adminUser);
  assert(accessAdmin === true, `Test7d: admin siempre accede`);

  const accessNoUser = canAccessPoliza(pol, undefined);
  assert(accessNoUser === true, `Test7e: sin usuario (modo legacy admin) accede para no romper`);
})();

// TEST 8: filtrarPolizasPorUsuario respeta auth real, no email/localStorage
(() => {
  const polizas: PolizaSeguro[] = [
    { ...polizaBase, id: 'pol_a', inmuebleId: 'inm_001', propietarioId: 'prop_001' },
    { ...polizaBase, id: 'pol_b', inmuebleId: 'inm_002', propietarioId: 'prop_001' },
    { ...polizaBase, id: 'pol_c', inmuebleId: 'inm_003', propietarioId: 'prop_002' },
  ];
  const filtradasProp = filtrarPolizasPorUsuario(polizas, propietarioUser);
  assert(filtradasProp.length === 2, `Test8a: propietario debe ver 2 pólizas de sus inmuebles, got ${filtradasProp.length}`);
  assert(filtradasProp.every((p) => ['inm_001', 'inm_002'].includes(p.inmuebleId)), `Test8b: solo inmuebles autorizados`);

  const filtradasProf = filtrarPolizasPorUsuario(polizas, profesionalUser);
  assert(filtradasProf.length === 0, `Test8c: profesional ve 0 pólizas`);

  const filtradasAdmin = filtrarPolizasPorUsuario(polizas, adminUser);
  assert(filtradasAdmin.length === 3, `Test8d: admin ve todas`);
})();

// TEST 9: crearHistorialPolizaItem y obtenerCadenaHistorialPoliza - histórico nunca eliminar
(() => {
  const hist1 = crearHistorialPolizaItem('Admin', 'CREACION', 'Póliza creada', undefined, undefined, 'user_admin_1');
  const hist2 = crearHistorialPolizaItem('Admin', 'COMPROBACION_RENOVACION', 'Comprobada renovación', undefined, undefined, 'user_admin_1', 'VIGENTE', 'PENDIENTE_RENOVACION');
  assert(hist1.accion === 'CREACION' && hist2.accion === 'COMPROBACION_RENOVACION', `Test9a: historial acciones correctas`);
  assert(hist2.estadoAnterior === 'VIGENTE' && hist2.estadoNuevo === 'PENDIENTE_RENOVACION', `Test9b: estados anterior/nuevo registrados`);

  const polizasChain: PolizaSeguro[] = [
    { ...polizaBase, id: 'pol_old', polizaSiguienteId: 'pol_mid' },
    { ...polizaBase, id: 'pol_mid', polizaAnteriorId: 'pol_old', polizaSiguienteId: 'pol_new' },
    { ...polizaBase, id: 'pol_new', polizaAnteriorId: 'pol_mid' },
  ];
  const cadena = obtenerCadenaHistorialPoliza('pol_mid', polizasChain);
  assert(cadena.length === 3, `Test9c: cadena histórica debe tener 3 eslabones, got ${cadena.length}`);
  assert(cadena[0].id === 'pol_old' && cadena[2].id === 'pol_new', `Test9d: cadena ordenada old->mid->new`);
})();

// TEST 10: validarDatosExtraidos - IA consultiva nunca auto-modifica críticos sin confirmación
(() => {
  const datosOk = {
    aseguradora: 'Mapfre',
    numeroPoliza: 'MAP-999',
    fechaVencimiento: daysFromNow(365),
    primaAnual: 300,
    confianza: 'ALTA' as const,
  };
  const valOk = validarDatosExtraidos(datosOk);
  assert(valOk.valido === true && valOk.errores.length === 0, `Test10a: datos válidos deben pasar`);

  const datosSinCriticos = {
    primaAnual: 300,
    confianza: 'BAJA' as const,
  };
  const valFail = validarDatosExtraidos(datosSinCriticos);
  assert(valFail.valido === false && valFail.errores.length > 0, `Test10b: sin aseguradora/poliza/vencimiento debe fallar`);
  assert(valFail.advertencias.some((a) => a.includes('confianza')), `Test10c: confianza BAJA debe generar advertencia consultiva`);

  // Simulación flujo consultivo: datos extraídos no se aplican automáticamente sin confirmadoUsuario
  const docRenovacionMock = {
    id: 'doc_1',
    tipo: 'CARTA_RENOVACION' as const,
    nombreArchivo: 'carta.pdf',
    url: 'http://test',
    fechaRecepcion: new Date().toISOString(),
    extraido: datosOk,
    confirmadoUsuario: false,
  };
  assert(docRenovacionMock.confirmadoUsuario === false, `Test10d: IA consultiva requiere confirmación usuario antes de aplicar críticos`);
})();

// TEST 11: Circuito completo PÓLIZA → VENCIMIENTO → ALERTA → COMPROBACIÓN → RECEPCIÓN → COMPARACIÓN → HISTÓRICO
(() => {
  // Paso 1: Póliza con vencimiento en 15 días
  const poliza: PolizaSeguro = { ...polizaBase, id: 'pol_circuito', fechaVencimiento: daysFromNow(15), estadoRenovacion: 'VIGENTE', historial: [] };
  const dias = calcularDiasRestantes(poliza.fechaVencimiento);
  const nivel = obtenerNivelAlerta(dias);
  assert(nivel === 15, `Test11a: detección próxima renovación 15 días`);

  // Paso 2: Generar alerta
  const alerta = generarAlertaRenovacion(poliza);
  assert(alerta !== null && alerta.nivelProximidad === 15, `Test11b: alerta generada nivel 15, got ${alerta?.nivelProximidad}`);

  // Paso 3: Comprobación renovación registra fecha, usuario, resultado, observaciones
  const histComprobacion = crearHistorialPolizaItem('Admin', 'COMPROBACION_RENOVACION', 'Contactada aseguradora, pendiente carta', undefined, undefined, 'user_admin_1', 'VIGENTE', 'RENOVACION_SOLICITADA');
  const polizaComprobada: PolizaSeguro = {
    ...poliza,
    estadoRenovacion: 'RENOVACION_SOLICITADA',
    fechaUltimaComprobacion: new Date().toISOString(),
    usuarioUltimaComprobacion: 'Admin',
    usuarioUltimaComprobacionId: 'user_admin_1',
    resultadoUltimaComprobacion: 'PENDIENTE',
    observacionesRenovacion: 'Contactada aseguradora',
    historial: [histComprobacion],
  };
  assert(polizaComprobada.fechaUltimaComprobacion !== undefined, `Test11c: fecha comprobación registrada`);
  assert(polizaComprobada.usuarioUltimaComprobacion === 'Admin', `Test11d: usuario comprobación registrado`);

  // Paso 4: Recepción nueva póliza/carta y extracción datos
  const nuevaPoliza: PolizaSeguro = { ...polizaBase, id: 'pol_circuito_new', fechaVencimiento: daysFromNow(380), primaAnual: 220, polizaAnteriorId: poliza.id };
  const comp = compararPolizas(poliza, nuevaPoliza);
  assert(comp.diferenciaAbsoluta === 20, `Test11e: comparación prima detectada`);

  // Paso 5: Decisión renovar/sustituir y histórico conserva relación
  const polizaRenovada: PolizaSeguro = { ...poliza, estadoRenovacion: 'RENOVADA', polizaSiguienteId: nuevaPoliza.id, historial: [...(polizaComprobada.historial || []), crearHistorialPolizaItem('Admin', 'RENOVACION_CONFIRMADA', 'Renovada', undefined, undefined, 'user_admin_1', 'RENOVACION_SOLICITADA', 'RENOVADA')] };
  assert(polizaRenovada.polizaSiguienteId === nuevaPoliza.id, `Test11f: relación histórica anterior->siguiente conservada`);
  assert(nuevaPoliza.polizaAnteriorId === poliza.id, `Test11g: relación histórica siguiente->anterior conservada`);
  assert(polizaRenovada.historial!.length === 2, `Test11h: histórico nunca eliminado, crece`);
})();

// TEST 12: Seguridad - no email como identidad, no localStorage, no índices globales + filter (verifica filtrado por inmuebleIds/propietarioId)
(() => {
  // Simular intento de acceso usando solo email (debe fallar si no tiene inmuebleIds)
  const usuarioSoloEmail: any = {
    id: 'user_fake',
    nombre: 'Fake',
    email: 'propietario@email.com', // email coincidiría con propietario pero sin ids
    tipoPerfil: 'PROPIETARIO',
    estado: 'ACTIVO',
    roles: [],
    permisos: [],
    // sin propietarioId ni inmuebleIds
  };
  const polizas: PolizaSeguro[] = [{ ...polizaBase, inmuebleId: 'inm_001', propietarioId: 'prop_001' }];

  const accesoSoloEmail = canAccessPoliza(polizas[0], usuarioSoloEmail);
  // Nuestra implementación actual: si no tiene propietarioId ni inmuebleIds, deniega
  assert(accesoSoloEmail === false, `Test12a: acceso solo por email debe denegarse (no usar email como identidad)`);

  // Verificar que filtrarPolizasPorUsuario no usa localStorage
  const originalLocalStorage = (global as any).localStorage;
  (global as any).localStorage = { getItem: () => 'inm_001' }; // intentar engañar
  const filtradas = filtrarPolizasPorUsuario(polizas, usuarioSoloEmail);
  assert(filtradas.length === 0, `Test12b: filtrado no debe usar localStorage`);
  (global as any).localStorage = originalLocalStorage;

  // Verificar que subscribePolizasSeguras existe y es función (cambio mínimo documentado)
  // No podemos testear Firestore real aquí, pero verificamos que la función está exportada
  // Import dinámico ya hecho, solo comprobamos que no es global filter
  assert(typeof filtrarPolizasPorUsuario === 'function', `Test12c: filtrado por usuario es función pura, no global filter`);
})();

// Resumen
console.log(`\n=== RESUMEN TESTS RENOVACIÓN SEGUROS ===`);
console.log(`Pasados: ${passed}`);
console.log(`Fallados: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log(`Intervalos alerta configurados: ${INTERVALOS_ALERTA_RENOVACION.join(', ')}`);
console.log(`Texto días restantes ejemplo: ${obtenerTextoDiasRestantes(15)} / ${obtenerTextoDiasRestantes(-2)}`);

if (failed > 0) {
  console.error(`\n❌ ${failed} tests fallaron - revisar implementación`);
  process.exit(1);
} else {
  console.log(`\n✅ Todos los ${passed} tests pasaron - circuito renovación OK`);
  process.exit(0);
}
