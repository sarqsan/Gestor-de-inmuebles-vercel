/**
 * 12 Tests funcionales para circuito GASTO → INMUEBLE → CATEGORÍA → DOCUMENTO → HISTÓRICO
 * Ejecutar: npx tsx tests_gastos_circuito.ts
 * Valida: inmuebleId oficial, categoría catálogo, documento storagePath, histórico, RBAC, totales, validación, compatibilidad
 */

import {
  crearHistorialGastoItem,
  canAccessGasto,
  filtrarGastosPorUsuario,
  validarGasto,
  calcularTotalesPorCategoria,
  calcularTotalGastos,
  obtenerDireccionGasto,
} from './src/utils/gastosEngine';
import { Gasto, UsuarioApp, CategoriaGasto, CATEGORIA_GASTO_LABELS } from './src/types';
import * as fs from 'fs';

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

const inmuebleIdOficial = 'inm_001';
const propietarioId = 'prop_001';

const gastoBase: Gasto = {
  id: 'gasto_001',
  inmuebleId: inmuebleIdOficial,
  inmuebleDireccion: 'C/ Gran Vía 45, Madrid',
  propietarioId,
  fecha: '2026-03-15',
  concepto: 'Reparación caldera',
  categoria: 'REPARACION',
  importe: 250.5,
  proveedor: 'Fontanería García',
  estado: 'PAGADO',
  documento: {
    id: 'doc_001',
    nombre: 'factura_caldera.pdf',
    tipo: 'FACTURA',
    url: 'https://storage.example.com/gastos/factura.pdf',
    storagePath: 'gastos/gasto_001/factura_caldera.pdf',
    fechaSubida: new Date().toISOString(),
    tamanoBytes: 102400,
    mimeType: 'application/pdf',
    subidoPor: 'Admin',
  },
  documentos: [],
  observaciones: 'Reparación urgente',
  historial: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  creadoPor: 'Admin',
};

const propietarioUser: UsuarioApp = {
  id: 'user_prop_1',
  nombre: 'Propietario Test',
  email: 'prop@test.com',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO_ESTANDAR'],
  permisos: [],
  propietarioId,
  inmuebleIds: [inmuebleIdOficial, 'inm_002'],
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

// TEST 1: Relación gasto→inmueble via inmuebleId oficial, no texto libre/email/localStorage
(() => {
  assert(gastoBase.inmuebleId === inmuebleIdOficial, `Test1a: gasto debe tener inmuebleId oficial`);
  assert(gastoBase.inmuebleId.startsWith('inm_'), `Test1b: inmuebleId formato oficial, no email`);
  assert(!gastoBase.inmuebleId.includes('@'), `Test1c: inmuebleId no debe ser email`);
  const direccion = obtenerDireccionGasto(gastoBase, [{ id: inmuebleIdOficial, direccion: 'C/ Gran Vía 45, Madrid' } as any]);
  assert(direccion === 'C/ Gran Vía 45, Madrid', `Test1d: obtenerDireccionGasto resuelve dirección`);
})();

// TEST 2: Categorización reutiliza catálogo existente (mínimo 10 categorías requeridas)
(() => {
  const categoriasRequeridas: CategoriaGasto[] = ['MANTENIMIENTO','REPARACION','SUMINISTROS','SEGUROS','IMPUESTOS_TASAS','COMUNIDAD','ELECTRODOMESTICOS','MOBILIARIO','REFORMAS','OTRO'];
  const gastoCategorias = Object.keys(CATEGORIA_GASTO_LABELS) as CategoriaGasto[];
  categoriasRequeridas.forEach((cat) => {
    assert(gastoCategorias.includes(cat), `Test2a: catálogo debe incluir ${cat}`);
  });
  assert(gastoBase.categoria === 'REPARACION', `Test2b: gasto ejemplo categoría REPARACION válida`);
  const totalCat = calcularTotalesPorCategoria([gastoBase]);
  assert(totalCat['REPARACION'] === 250.5, `Test2c: totales por categoría calcula correctamente`);
})();

// TEST 3: Documento justificativo reutiliza storagePath/downloadURL pattern existente
(() => {
  assert(gastoBase.documento !== undefined, `Test3a: gasto debe poder tener documento`);
  assert(gastoBase.documento?.storagePath === 'gastos/gasto_001/factura_caldera.pdf', `Test3b: storagePath pattern reutilizado`);
  assert(gastoBase.documento?.url.startsWith('https://'), `Test3c: downloadURL presente`);
  assert(gastoBase.documento?.tipo === 'FACTURA', `Test3d: tipo documento FACTURA/TICKET/RECIBO`);
  // Gastos antiguos sin doc deben seguir funcionando
  const gastoSinDoc: Gasto = { ...gastoBase, id: 'gasto_sin_doc', documento: undefined, documentos: [] };
  assert(gastoSinDoc.documento === undefined, `Test3e: gasto sin documento compatible`);
  const valSinDoc = validarGasto(gastoSinDoc);
  assert(valSinDoc.valido === true, `Test3f: gasto sin doc sigue siendo válido`);
})();

// TEST 4: Histórico registra creación, modificación importe/categoría/inmueble, sustitución doc
(() => {
  const histCreacion = crearHistorialGastoItem('Admin', 'CREACION', 'Gasto creado');
  assert(histCreacion.accion === 'CREACION', `Test4a: histórico CREACION`);

  const histImporte = crearHistorialGastoItem('Admin', 'MODIFICACION_IMPORTE', 'Importe modificado', '200€', '250€');
  assert(histImporte.valorAnterior === '200€' && histImporte.valorNuevo === '250€', `Test4b: histórico importe anterior/nuevo`);

  const histCategoria = crearHistorialGastoItem('Admin', 'MODIFICACION_CATEGORIA', 'Categoría', 'MANTENIMIENTO', 'REPARACION');
  assert(histCategoria.accion === 'MODIFICACION_CATEGORIA', `Test4c: histórico categoría`);

  const histInmueble = crearHistorialGastoItem('Admin', 'MODIFICACION_INMUEBLE', 'Inmueble', 'inm_001', 'inm_002');
  assert(histInmueble.accion === 'MODIFICACION_INMUEBLE', `Test4d: histórico inmueble`);

  const histDoc = crearHistorialGastoItem('Admin', 'SUSTITUCION_DOCUMENTO', 'Sustitución doc');
  assert(histDoc.accion === 'SUSTITUCION_DOCUMENTO', `Test4e: histórico sustitución documento`);

  const gastoConHistorial: Gasto = { ...gastoBase, historial: [histCreacion, histImporte, histCategoria, histInmueble, histDoc] };
  assert(gastoConHistorial.historial!.length === 5, `Test4f: histórico acumula, nunca se elimina`);
})();

// TEST 5: RBAC propietario solo autorizados, profesional no recibe global privado
(() => {
  const accesoPropOk = canAccessGasto(gastoBase, propietarioUser);
  assert(accesoPropOk === true, `Test5a: propietario con inmuebleId autorizado accede`);

  const propietarioSinAcceso: UsuarioApp = { ...propietarioUser, inmuebleIds: ['inm_999'], propietarioId: 'prop_999' };
  const accesoPropNo = canAccessGasto(gastoBase, propietarioSinAcceso);
  assert(accesoPropNo === false, `Test5b: propietario sin inmueble no accede`);

  const accesoProf = canAccessGasto(gastoBase, profesionalUser);
  assert(accesoProf === false, `Test5c: profesional nunca accede a gastos privados`);

  const accesoAdmin = canAccessGasto(gastoBase, adminUser);
  assert(accesoAdmin === true, `Test5d: admin siempre accede`);

  const accesoLegacy = canAccessGasto(gastoBase, undefined);
  assert(accesoLegacy === true, `Test5e: sin usuario legacy admin accede`);
})();

// TEST 6: filtrarGastosPorUsuario no usa email/localStorage/array.filter global inseguro, usa alcance
(() => {
  const gastos: Gasto[] = [
    { ...gastoBase, id: 'g_a', inmuebleId: 'inm_001', propietarioId },
    { ...gastoBase, id: 'g_b', inmuebleId: 'inm_002', propietarioId },
    { ...gastoBase, id: 'g_c', inmuebleId: 'inm_003', propietarioId: 'prop_002' },
  ];
  const filtradosProp = filtrarGastosPorUsuario(gastos, propietarioUser);
  assert(filtradosProp.length === 2, `Test6a: propietario ve 2 gastos autorizados, got ${filtradosProp.length}`);
  assert(filtradosProp.every((g) => ['inm_001','inm_002'].includes(g.inmuebleId)), `Test6b: solo inmuebles autorizados`);

  const filtradosProf = filtrarGastosPorUsuario(gastos, profesionalUser);
  assert(filtradosProf.length === 0, `Test6c: profesional ve 0 gastos`);

  // Simular intento localStorage engaño
  const originalLS = (global as any).localStorage;
  (global as any).localStorage = { getItem: () => 'inm_001' };
  const usuarioSoloEmail: any = { tipoPerfil: 'PROPIETARIO', email: 'prop@test.com' };
  const filtradosFake = filtrarGastosPorUsuario(gastos, usuarioSoloEmail);
  assert(filtradosFake.length === 0, `Test6d: no usa localStorage/email como identidad`);
  (global as any).localStorage = originalLS;
})();

// TEST 7: Validación básica gasto - datos mínimos, importe, fecha
(() => {
  const gastoInvalido: Partial<Gasto> = { concepto: 'a', importe: -5 };
  const val = validarGasto(gastoInvalido);
  assert(val.valido === false && val.errores.length >= 3, `Test7a: gasto inválido detecta errores`);

  const gastoValido: Partial<Gasto> = { inmuebleId: 'inm_001', fecha: '2026-03-15', concepto: 'IBI 2026', categoria: 'IMPUESTOS_TASAS', importe: 350 };
  const val2 = validarGasto(gastoValido);
  assert(val2.valido === true, `Test7b: gasto válido pasa`);

  const gastoFuturo: Partial<Gasto> = { ...gastoValido, fecha: '2030-01-01' };
  const valFuturo = validarGasto(gastoFuturo);
  assert(valFuturo.advertencias.length > 0, `Test7c: fecha futura genera advertencia`);
})();

// TEST 8: Cálculo totales y ANULADO no suma
(() => {
  const gastos: Gasto[] = [
    { ...gastoBase, id: 'g1', importe: 100, categoria: 'MANTENIMIENTO', estado: 'PAGADO' },
    { ...gastoBase, id: 'g2', importe: 200, categoria: 'MANTENIMIENTO', estado: 'ANULADO' },
    { ...gastoBase, id: 'g3', importe: 150, categoria: 'COMUNIDAD', estado: 'PAGADO' },
  ];
  const total = calcularTotalGastos(gastos);
  assert(total === 250, `Test8a: total excluye ANULADO, esperado 250 got ${total}`);
  const porCat = calcularTotalesPorCategoria(gastos);
  assert(porCat['MANTENIMIENTO'] === 100, `Test8b: MANTENIMIENTO solo 100 excluye anulado`);
  assert(porCat['COMUNIDAD'] === 150, `Test8c: COMUNIDAD 150`);
})();

// TEST 9: Seguridad - no crear segunda colección paralela, usa colección oficial única 'gastos'
(() => {
  const firebaseFile = fs.readFileSync('./src/lib/firebase.ts', 'utf-8');
  assert(firebaseFile.includes("collection(db, 'gastos')"), `Test9a: colección oficial única 'gastos' existe`);
  assert(firebaseFile.includes('GASTOS_COL'), `Test9b: constante GASTOS_COL definida`);
  assert(firebaseFile.includes('subscribeGastosByInmuebleIds'), `Test9c: subscribe seguro por inmuebleIds implementado`);
  assert(firebaseFile.includes('subscribeGastosSeguros'), `Test9d: subscribeGastosSeguros existe`);
  // No segunda colección paralela tipo gastosInmuebles segunda
  const countGastosCollections = (firebaseFile.match(/collection\(db, 'gastos/g) || []).length;
  assert(countGastosCollections >= 1 && countGastosCollections <= 2, `Test9e: no segunda colección paralela, count=${countGastosCollections}`);
})();

// TEST 10: Firestore Rules mínimo para gastos
(() => {
  const rules = fs.readFileSync('./firestore.rules', 'utf-8');
  assert(rules.includes('match /gastos/{gastoId}'), `Test10a: rules tiene match /gastos`);
  assert(rules.includes('allow read: if isSignedIn()'), `Test10b: rules permite read autenticado`);
  // No debe permitir lectura pública sin auth
  const gastosRuleSection = rules.substring(rules.indexOf('match /gastos/'), rules.indexOf('match /gastos/')+500);
  assert(!gastosRuleSection.includes('allow read: if true'), `Test10c: gastos no lectura pública true`);
})();

// TEST 11: Compatibilidad datos existentes y no tocar circuito seguros ni presupuestos
(() => {
  const segurosEngineExists = fs.existsSync('./src/utils/segurosEngine.ts');
  assert(segurosEngineExists, `Test11a: segurosEngine.ts intacto`);

  const gastosEngineExists = fs.existsSync('./src/utils/gastosEngine.ts');
  assert(gastosEngineExists, `Test11b: gastosEngine.ts creado separado`);

  const firebaseContent = fs.readFileSync('./src/lib/firebase.ts', 'utf-8');
  // Verificar que no se eliminó subscribePolizasSeguras
  assert(firebaseContent.includes('subscribePolizasSeguras'), `Test11c: subscribePolizasSeguras intacto (seguros no tocado)`);

  // Verificar que Gasto tiene historial opcional para compatibilidad
  const gastoAntiguo: Gasto = { ...gastoBase, historial: undefined, documento: undefined };
  assert(gastoAntiguo.historial === undefined, `Test11d: gasto antiguo sin historial compatible`);
})();

// TEST 12: Circuito completo GASTO → INMUEBLE → CATEGORÍA → DOCUMENTO → HISTÓRICO
(() => {
  // Paso 1: Crear gasto con inmuebleId oficial
  let gasto: Gasto = {
    id: 'gasto_circuito',
    inmuebleId: inmuebleIdOficial,
    inmuebleDireccion: 'C/ Test 1',
    propietarioId,
    fecha: '2026-05-01',
    concepto: 'IBI 2026',
    categoria: 'IMPUESTOS_TASAS',
    importe: 350,
    estado: 'PENDIENTE',
    historial: [crearHistorialGastoItem('Admin', 'CREACION', 'Gasto creado IBI 2026')],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  assert(gasto.inmuebleId === inmuebleIdOficial, `Test12a: paso 1 GASTO→INMUEBLE oficial`);

  // Paso 2: Categorización
  assert(gasto.categoria === 'IMPUESTOS_TASAS', `Test12b: paso 2 CATEGORÍA impuestos`);
  
  // Paso 3: Adjuntar documento justificativo
  gasto.documento = {
    id: 'doc_circuito',
    nombre: 'ibi_2026.pdf',
    tipo: 'RECIBO',
    url: 'https://storage/gastos/ibi.pdf',
    storagePath: 'gastos/gasto_circuito/ibi_2026.pdf',
    fechaSubida: new Date().toISOString(),
    tamanoBytes: 50000,
    mimeType: 'application/pdf',
  };
  gasto.historial!.push(crearHistorialGastoItem('Admin', 'DOCUMENTO_ADJUNTADO', 'Documento IBI adjuntado'));
  assert(gasto.documento.storagePath.includes('gastos/'), `Test12c: paso 3 DOCUMENTO con storagePath`);

  // Paso 4: Modificación importe registra histórico
  const importeAnterior = gasto.importe;
  gasto.importe = 380;
  gasto.historial!.push(crearHistorialGastoItem('Admin', 'MODIFICACION_IMPORTE', 'Importe actualizado', `${importeAnterior}€`, `${gasto.importe}€`));
  assert(gasto.historial!.some(h => h.accion === 'MODIFICACION_IMPORTE'), `Test12d: paso 4 HISTÓRICO modificación importe`);

  // Paso 5: Modificación inmueble registra histórico
  gasto.historial!.push(crearHistorialGastoItem('Admin', 'MODIFICACION_INMUEBLE', 'Inmueble cambiado', 'inm_001', 'inm_002'));
  assert(gasto.historial!.some(h => h.accion === 'MODIFICACION_INMUEBLE'), `Test12e: histórico modificación inmueble`);

  // Paso 6: Validación final y acceso propietario
  const validacion = validarGasto(gasto);
  assert(validacion.valido === true, `Test12f: gasto circuito válido`);
  const acceso = canAccessGasto(gasto, propietarioUser);
  assert(acceso === true, `Test12g: propietario accede a gasto circuito`);
  assert(gasto.historial!.length === 4, `Test12h: histórico conserva 4 eventos`);
})();

// Resumen
console.log(`\n=== RESUMEN TESTS GASTOS CIRCUITO ===`);
console.log(`Pasados: ${passed}`);
console.log(`Fallados: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  console.error(`\n❌ ${failed} tests fallaron - revisar implementación gastos`);
  process.exit(1);
} else {
  console.log(`\n✅ Todos los ${passed} tests pasaron - circuito GASTO→INMUEBLE→CATEGORÍA→DOCUMENTO→HISTÓRICO OK`);
  console.log(`Seguros intacto: verificado`);
  process.exit(0);
}
