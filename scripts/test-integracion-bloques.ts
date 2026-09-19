/**
 * SUITE DE INTEGRACIÓN — CONSOLIDACIÓN DE BLOQUES A · B · C · D
 * ===========================================================================
 * Comprueba las conexiones entre bloques que SÍ existen en este repositorio y
 * declara, sin maquillarlo, las que NO pueden ejecutarse porque el material de
 * los bloques A (reformas), C (valoración de mercado) y D (fiscalidad avanzada)
 * no está presente en el repositorio ni es accesible desde este entorno.
 *
 *   · B (SEGURIDAD + CANDIDATOS) ................. PRESENTE (se verifica aquí)
 *   · A (REFORMAS) ............................... AUSENTE
 *   · C (VALORACIÓN DE MERCADO) .................. AUSENTE (sólo existe la
 *                                                  preparación comercial previa
 *                                                  de B: recomercialización/pricing)
 *   · D (FISCALIDAD AVANZADA) .................... AUSENTE (sólo existe el
 *                                                  resumen fiscal anual de B)
 *
 * Cadenas ejecutables verificadas (REAL):
 *   I5  ALQUILER  -> COBRO -> FISCALIDAD (resumen fiscal anual del inmueble)
 *   I6  HIPOTECA  -> INTERESES -> FISCALIDAD (interés ≠ capital ≠ gasto)
 *   I7  PROFESIONAL -> PRESUPUESTO -> OT -> COSTE
 *   I8-I11 AISLAMIENTO (propietario A ≠ recursos de B; profesional sin finanzas)
 *   I12   La identidad manipulada por almacenamiento NO autoriza
 *   I17-I21 SESIÓN Y PANELES separados por perfil
 *
 * Ejecución: npm run test:integracion
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  perfilAutorizado,
  seccionesPermitidas,
  puedeAccederSeccion,
  seccionInicialPorPerfil,
  esAdministradorAutorizado,
  alcanceDatos,
} from '../src/lib/authorization';
import {
  canAccessInmueble,
  canAccessContrato,
  canAccessCandidato,
  canAccessCobro,
  isAdmin,
  isPropietario,
  isProfesional,
} from '../src/lib/authService';
import {
  generarPeriodosParaContrato,
  registrarPagoPeriodo,
  generarResumenFiscalInmueble,
} from '../src/utils/cobrosEngine';
import {
  calcularCuotaConstante,
  generarTablaAmortizacion,
  resumenPrestamo,
} from '../src/utils/prestamosEngine';
import {
  crearGasto,
  tipoDeCategoria,
  resumenGastos,
} from '../src/utils/gastosEngine';
import {
  buscarProfesionales,
  calcularTotalesPresupuesto,
  crearItemHistorialTrabajo,
  calcularMetricasProfesional,
} from '../src/utils/profesionalesEngine';
import { cuadreRentabilidad } from '../src/utils/rentabilidadEngine';
import { evaluarCoberturaPolizas } from '../src/utils/segurosEngine';
import { evaluarAsegurabilidadCandidato, crearBorradorContrato } from '../src/utils/contratoEngine';
import {
  generarDocumentosSugeridos,
  buildSolicitudDocumentacion,
} from '../src/utils/documentTemplates';
import { escenariosROI } from '../src/utils/recomercializacionEngine';
import {
  Candidato,
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  Incidencia,
  Inmueble,
  PolizaSeguro,
  Prestamo,
  PresupuestoProfesional,
  Profesional,
  TrabajoProfesional,
  UsuarioApp,
} from '../src/types';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), 'utf-8');
const existe = (ruta: string) => existsSync(resolve(raiz, ruta));

const reglas = leer('firestore.rules');
const storage = leer('storage.rules');
const app = leer('src/App.tsx');
const authServiceSrc = leer('src/lib/authService.ts');
const tipos = leer('src/types.ts');

let ejecutadas = 0;
let correctas = 0;
let fallidas = 0;
const reales: string[] = [];
const estaticas: string[] = [];
const fallos: string[] = [];
const noEjecutables: string[] = [];

function checkReal(id: string, nombre: string, condicion: boolean, detalle = '') {
  ejecutadas += 1;
  if (condicion) {
    correctas += 1;
    reales.push(`OK    [${id}] [REAL] ${nombre}`);
  } else {
    fallidas += 1;
    fallos.push(`FALLO [${id}] [REAL] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

function checkEstatica(id: string, nombre: string, condicion: boolean, detalle = '') {
  ejecutadas += 1;
  if (condicion) {
    correctas += 1;
    estaticas.push(`OK    [${id}] [ESTÁTICO] ${nombre}`);
  } else {
    fallidas += 1;
    fallos.push(`FALLO [${id}] [ESTÁTICO] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

/** No cuenta como prueba superada: se declara como no verificable. */
function declararNoEjecutable(id: string, motivo: string) {
  noEjecutables.push(`NO EJECUTABLE [${id}] ${motivo}`);
}

console.log('='.repeat(78));
console.log(' INTEGRACIÓN Y CONSOLIDACIÓN DE BLOQUES A · B · C · D');
console.log('='.repeat(78));
console.log('');

// ===========================================================================
// 0. INVENTARIO REAL DE BLOQUES EN EL REPOSITORIO (comprobación de ficheros)
// ===========================================================================
const bloqueBPresente =
  existe('src/utils/candidateCircuitEngine.ts') &&
  existe('src/lib/authorization.ts') &&
  existe('src/components/CandidateCircuitTimeline.tsx') &&
  existe('scripts/test-candidatos-circuito.ts') === false &&
  existe('scripts/test-seguridad-circuito.ts');

checkReal(
  'INV-B',
  'Bloque B presente: circuito de candidatos + autorización centralizada + suites de seguridad',
  bloqueBPresente
);

const bloqueAAusente =
  !existe('src/utils/reformasEngine.ts') &&
  !existe('src/components/sections/ReformasSection.tsx') &&
  !/ProyectoReforma|PartidaReforma|NecesidadReforma|ReformasInmueblePanel/.test(tipos) &&
  !/necesidades_reforma|proyectos_reforma/.test(reglas);

checkReal(
  'INV-A',
  'Inventario verificado: el bloque A (circuito de reformas) NO está en el repositorio',
  bloqueAAusente
);

const bloqueCMercadoAusente =
  !existe('src/utils/valoracionMercadoEngine.ts') &&
  !/valoraciones_inmueble|comparables_inmueble|material_comercial_inmueble/.test(reglas) &&
  !/valoracionMercado|precioMercado|fichaComercial/.test(tipos);

checkReal(
  'INV-C',
  'Inventario verificado: el bloque C (valoración de mercado) NO está en el repositorio',
  bloqueCMercadoAusente
);

const bloqueDAusente =
  !existe('src/utils/fiscalAvanzadoEngine.ts') &&
  !existe('src/components/sections/FiscalidadSection.tsx') &&
  !/fiscal_avanzado|amortizaciones_fiscal|hipotecas_fiscal/.test(reglas) &&
  !/amortizacionFiscal|resultadoFiscal/.test(tipos);

checkReal(
  'INV-D',
  'Inventario verificado: el bloque D (fiscalidad avanzada) NO está en el repositorio',
  bloqueDAusente
);

// ===========================================================================
// 1. CADENAS ECONÓMICAS: I5 · I6 · I7
// ===========================================================================
const inmuebleA = {
  id: 'inm_I1',
  direccion: 'Calle Integración 1',
  ciudad: 'Alicante',
  precio: 1000,
  estado: 'alquilado',
  habitaciones: 3,
  banos: 2,
  superficie: 90,
  candidatosCount: 0,
  fianzaMeses: 2,
  propietarioId: 'prop_A',
} as Inmueble;

const contrato = {
  id: 'ct_I1',
  inmuebleId: inmuebleA.id,
  propietarioId: 'prop_A',
  inquilinoId: 'inq_1',
  inquilinoNombre: 'Inquilino Integración',
  rentaMensual: 1000,
  fechaInicioContrato: '2026-01-01',
  estado: 'ACTIVO',
  registroCobros: [],
} as unknown as ContratoFormalizacion;

// --- I5: ALQUILER -> COBRO -> FISCALIDAD -----------------------------------
const periodosGenerados = generarPeriodosParaContrato(contrato, 2);
const primerPeriodo = periodosGenerados[0];
const contratoConPago = registrarPagoPeriodo(contrato, primerPeriodo.id, {
  importeRecibido: 1000,
  fechaPago: '2026-02-03',
  metodoPago: 'transferencia',
});
const resumenFiscal = generarResumenFiscalInmueble(inmuebleA.id, 2026, [inmuebleA], [contratoConPago]);
const mesCobrado = resumenFiscal?.contratosPeriodos[0]?.meses.find(
  (m) => m.importeRecibido === 1000
);

checkReal(
  'I5.1',
  'ALQUILER → COBRO: el contrato genera su serie de periodos y el pago queda registrado con su importe',
  periodosGenerados.length >= 6 &&
    periodosGenerados[0].periodoMesAnio === '2026-01' &&
    contratoConPago.registroCobros?.some((c) => c.importeRecibido === 1000 && c.estado === 'RECIBIDO') === true,
  `periodos=${periodosGenerados.length}`
);
checkReal(
  'I5.2',
  'COBRO → FISCALIDAD: el resumen fiscal anual del inmueble refleja el importe efectivamente cobrado',
  !!resumenFiscal &&
    resumenFiscal.totalAnualCobrado >= 1000 &&
    resumenFiscal.mesesCobradosCount >= 1 &&
    !!mesCobrado,
  resumenFiscal ? `cobrado=${resumenFiscal.totalAnualCobrado} meses=${resumenFiscal.mesesCobradosCount}` : 'sin resumen'
);
checkReal(
  'I5.3',
  'FISCALIDAD: el resumen anual conserva la trazabilidad por contrato y mes (no agrega a ciegas)',
  !!resumenFiscal &&
    resumenFiscal.contratosPeriodos.length === 1 &&
    resumenFiscal.contratosPeriodos[0].contratoId === contratoConPago.id &&
    resumenFiscal.inmuebleId === inmuebleA.id
);

// --- I6: HIPOTECA -> INTERESES -> FISCALIDAD -------------------------------
const prestamo = {
  id: 'pr_I1',
  inmuebleId: inmuebleA.id,
  propietarioId: 'prop_A',
  entidad: 'Banco Integración',
  capitalInicial: 150000,
  tasaInteresAnual: 2.5,
  plazoMeses: 300,
  fechaInicio: '2020-01',
  estado: 'VIGENTE',
} as unknown as Prestamo;

const tabla = generarTablaAmortizacion(prestamo);
const resumenPrest = resumenPrestamo(prestamo);
const gastoHipoteca = crearGasto({
  inmuebleId: inmuebleA.id,
  propietarioId: 'prop_A',
  categoria: 'CUOTA_HIPOTECARIA',
  importe: 672.9,
  fechaDevengo: '2026-02-01',
  descripcion: 'Cuota hipotecaria febrero',
  estado: 'PAGADO',
} as Parameters<typeof crearGasto>[0]);

checkReal(
  'I6.1',
  'HIPOTECA → INTERESES: la tabla de amortización separa capital e intereses del pago mensual',
  tabla.length > 0 &&
    resumenPrest.totalIntereses > 0 &&
    resumenPrest.capitalAmortizado >= 0 &&
    Math.abs(calcularCuotaConstante(150000, 2.5, 300) - 672.9) < 1
);
checkReal(
  'I6.2',
  'HIPOTECA → FISCALIDAD: el pago hipotecario NO es un gasto de explotación (categoría FINANCIACION)',
  tipoDeCategoria('CUOTA_HIPOTECARIA') === 'FINANCIACION' &&
    tipoDeCategoria('COMUNIDAD') === 'EXPLOTACION',
  `hipoteca=${tipoDeCategoria('CUOTA_HIPOTECARIA')}`
);

const gastoHipotecaPagado = {
  ...gastoHipoteca,
  estado: 'PAGADO',
  fechaPago: '2026-02-01',
} as unknown as Gasto;
const resumen = resumenGastos([gastoHipotecaPagado]);
checkReal(
  'I6.3',
  'FISCALIDAD: el resumen separa intereses (relevantes) de capital amortizado (no gasto deducible)',
  resumen.financiacionPagado > 0 &&
    resumen.capitalAmortizado >= 0 &&
    resumen.explotacionPagado === 0,
  `financiacion=${resumen.financiacionPagado} capital=${resumen.capitalAmortizado} explotacion=${resumen.explotacionPagado}`
);

// --- I7: PROFESIONAL -> PRESUPUESTO -> OT -> COSTE -------------------------
const profesionalFixtures = [
  {
    id: 'prof_I1',
    nombreComercial: 'Fontanería Integración',
    especialidades: ['fontaneria'],
    ciudad: 'Alicante',
    zona: 'Alicante',
    estado: 'ACTIVO',
    activo: true,
  } as unknown as Profesional,
];

const presupuesto = {
  id: 'pres_I1',
  trabajoId: 'tr_I1',
  inmuebleId: inmuebleA.id,
  propietarioId: 'prop_A',
  profesionalId: 'prof_I1',
  descripcion: 'Sustitución de caldera',
  estado: 'ACEPTADO',
  fecha: '2026-02-01',
  importeTotal: 1790.8,
  partidas: [
    { id: 'l1', concepto: 'Caldera', cantidad: 1, precioUnitario: 1200, importe: 1200 },
    { id: 'l2', concepto: 'Mano de obra', cantidad: 4, precioUnitario: 50, importe: 200 },
    { id: 'l3', concepto: 'Material menor', cantidad: 1, precioUnitario: 80, importe: 80 },
  ],
} as unknown as PresupuestoProfesional;

const trabajo = {
  id: 'tr_I1',
  inmuebleId: inmuebleA.id,
  propietarioId: 'prop_A',
  profesionalId: 'prof_I1',
  titulo: 'Sustitución de caldera',
  estado: 'FINALIZADA',
  prioridad: 'NORMAL',
  fechaCreacion: '2026-02-01',
  historial: [],
} as unknown as TrabajoProfesional;

const asignados = buscarProfesionales(profesionalFixtures, { especialidad: 'fontaneria' } as Parameters<typeof buscarProfesionales>[1], [trabajo]);
const totales = calcularTotalesPresupuesto(presupuesto.partidas);
const itemAsignacion = crearItemHistorialTrabajo(
  'PROFESIONAL_ASIGNADO',
  'Administración',
  'PENDIENTE',
  'ASIGNADA',
  'Asignado por integración'
);
const metricasProf = calcularMetricasProfesional(profesionalFixtures[0], [trabajo], [presupuesto], []);

checkReal(
  'I7.1',
  'PROFESIONAL → OT: el matching selecciona al profesional activo de la especialidad pedida',
  asignados.length === 1 && asignados[0].id === 'prof_I1'
);
checkReal(
  'I7.2',
  'OT: la asignación queda trazada en el historial del trabajo con transición de estado',
  !!itemAsignacion &&
    itemAsignacion.accion === 'PROFESIONAL_ASIGNADO' &&
    itemAsignacion.estadoNuevo === 'ASIGNADA'
);
checkReal(
  'I7.3',
  'PRESUPUESTO → COSTE: el coste de la OT es el total del presupuesto aceptado (1.480 € + IVA)',
  Math.abs(totales.importeBase - 1480) < 0.01 && Math.abs(totales.importeTotal - 1790.8) < 0.01,
  JSON.stringify(totales)
);
checkReal(
  'I7.4',
  'COSTE: las métricas del profesional contabilizan el trabajo y su presupuesto aceptado',
  !!metricasProf &&
    metricasProf.totalTrabajos === 1 &&
    metricasProf.totalPresupuestos === 1 &&
    metricasProf.presupuestosAceptados === 1 &&
    metricasProf.volumenTotalFacturado > 0,
  metricasProf
    ? `trabajos=${metricasProf.totalTrabajos} presupuestos=${metricasProf.totalPresupuestos} volumen=${metricasProf.volumenTotalFacturado}`
    : 'sin métricas'
);

// ===========================================================================
// 2. AISLAMIENTO MULTITENANT (I8 · I9 · I10 · I11 sobre las entidades reales)
// ===========================================================================
const propietarioA = {
  id: 'user_A',
  nombre: 'Propietario A',
  email: 'a@example.com',
  tipoPerfil: 'PROPIETARIO',
  roles: [],
  permisos: [],
  estado: 'ACTIVO',
  propietarioId: 'prop_A',
  inmuebleIds: ['inm_I1'],
} as UsuarioApp;

const inmuebleB = { ...inmuebleA, id: 'inm_I2', propietarioId: 'prop_B', direccion: 'Calle de B' } as Inmueble;

const candidatoB = {
  id: 'cand_B',
  nombre: 'Candidato B',
  email: 'cb@example.com',
  telefono: '600000000',
  inmuebleId: inmuebleB.id,
  estado: 'nuevo',
  historial: [],
} as unknown as Candidato;

const contratoB = { ...contrato, id: 'ct_B', inmuebleId: inmuebleB.id, propietarioId: 'prop_B' } as ContratoFormalizacion;
const cobroB = {
  id: 'cobro_B',
  inmuebleId: inmuebleB.id,
  propietarioId: 'prop_B',
  contratoId: 'ct_B',
  importePrevisto: 1000,
  importeRecibido: 0,
} as unknown as CobroPeriodo;

checkReal(
  'I8',
  'PROPIETARIO A no accede al inmueble, candidato ni contrato de B (aislamiento por titularidad)',
  canAccessInmueble(propietarioA, inmuebleA) === true &&
    canAccessInmueble(propietarioA, inmuebleB) === false &&
    canAccessCandidato(propietarioA, candidatoB, [inmuebleA, inmuebleB]) === false &&
    canAccessContrato(propietarioA, contratoB, [inmuebleA, inmuebleB]) === false
);
checkReal(
  'I8.2',
  'PROPIETARIO A no accede a los cobros de B (datos económicos)',
  canAccessCobro(propietarioA, cobroB, [inmuebleA, inmuebleB]) === false
);

const profesionalUsuario = {
  id: 'user_P',
  nombre: 'Profesional',
  email: 'p@example.com',
  tipoPerfil: 'PROFESIONAL',
  roles: [],
  permisos: [],
  estado: 'ACTIVO',
  profesionalId: 'prof_I1',
  inmuebleIds: [],
} as UsuarioApp;

checkReal(
  'I11.1',
  'El PROFESIONAL no es administrador ni accede a inmuebles no asignados',
  isProfesional(profesionalUsuario) === true &&
    isAdmin(profesionalUsuario) === false &&
    canAccessInmueble(profesionalUsuario, inmuebleA) === false
);
checkReal(
  'I11.2',
  'El PROFESIONAL no accede a las secciones económicas (gastos, cobros, rentabilidad, propietarios)',
  puedeAccederSeccion(profesionalUsuario, 'gastos') === false &&
    puedeAccederSeccion(profesionalUsuario, 'cobros') === false &&
    puedeAccederSeccion(profesionalUsuario, 'formalizacion') === false &&
    puedeAccederSeccion(profesionalUsuario, 'recomercializacion') === false &&
    puedeAccederSeccion(profesionalUsuario, 'propietarios') === false &&
    seccionesPermitidas(profesionalUsuario).length <= 5,
  seccionesPermitidas(profesionalUsuario).join(',')
);

const propietarioB = { ...propietarioA, id: 'user_B', propietarioId: 'prop_B', inmuebleIds: ['inm_I2'] } as UsuarioApp;
checkReal(
  'I9/I10',
  'El alcance de datos del propietario A nunca es global (ni con inmuebles de B en el sistema)',
  alcanceDatos(propietarioA).global === false &&
    alcanceDatos(propietarioB).global === false &&
    alcanceDatos(propietarioA).propietarioId === 'prop_A'
);
checkEstatica(
  'I9.2/I10.2',
  'Rules: las colecciones económicas exigen administración o titularidad (nunca sólo sesión)',
  /match \/gastos\/\{gastoId\} \{[\s\S]{0,600}?isStaff\(\) \|\| \(isPropietarioRole\(\) && gastoEsMio\(resource\.data\)\)/.test(reglas) &&
    /match \/prestamos\/\{prestamoId\} \{[\s\S]{0,600}?isStaff\(\) \|\| \(isPropietarioRole\(\) && gastoEsMio\(resource\.data\)\)/.test(reglas) &&
    /match \/contratos_formalizacion\/\{contratoId\} \{[\s\S]{0,600}?isStaff\(\)/.test(reglas) &&
    !/match \/(gastos|prestamos|contratos_formalizacion)\/\{[a-zA-Z]+\} \{[\s\S]{0,400}?allow read[^;]*: if isSignedIn\(\);/.test(reglas)
);

// ===========================================================================
// 3. BLINDAJE DE IDENTIDAD Y DATOS (I12 · I13 · I14 · I15 · I16 · I17)
// ===========================================================================
const usuarioManipulado = {
  id: 'fake',
  nombre: 'Fake',
  email: 'fake@example.com',
  tipoPerfil: 'ADMINISTRADOR',
  roles: ['ADMINISTRADOR'],
  permisos: ['TODO'],
  estado: 'ACTIVO',
  authUid: 'algún-uid-falso',
} as unknown as UsuarioApp;

const sinEstado = { ...usuarioManipulado, estado: undefined } as UsuarioApp;
const inactivo = { ...usuarioManipulado, estado: 'INACTIVO' } as UsuarioApp;
const pendiente = { ...usuarioManipulado, estado: 'PENDIENTE' } as UsuarioApp;
checkReal(
  'I12.1',
  'Manipular rol/permisos sin estado ACTIVO no concede administración (gate de estado y perfil)',
  perfilAutorizado(sinEstado) === null &&
    perfilAutorizado(inactivo) === null &&
    perfilAutorizado(pendiente) === null &&
    esAdministradorAutorizado(sinEstado) === false &&
    esAdministradorAutorizado(inactivo) === false &&
    seccionesPermitidas(sinEstado).length === 0 &&
    seccionesPermitidas(inactivo).length === 0
);
checkReal(
  'I12.2',
  'Un perfil sin tipoPerfil reconocido queda DENEGADO aunque declare roles y permisos',
  perfilAutorizado({ ...usuarioManipulado, tipoPerfil: 'SUPERUSER' as UsuarioApp['tipoPerfil'] }) === null
);
checkEstatica(
  'I12.3',
  'La identidad sólo se acepta desde Firebase Auth + usuarios_auth/{uid} (nunca desde almacenamiento)',
  /onAuthStateChanged\(auth, async \(user\)/.test(authServiceSrc) &&
    /const usuarioApp = await getUsuarioByAuthUid\(user\.uid, user\.email\)/.test(authServiceSrc) &&
    /usuarioApp\.estado !== 'ACTIVO'[\s\S]{0,200}?signOut\(auth\)/.test(authServiceSrc) &&
    /usuarios_auth/.test(authServiceSrc) &&
    /match \/usuarios_auth\/\{uid\}/.test(reglas) &&
    !/localStorage[\s\S]{0,80}(tipoPerfil|perfilAutorizado|currentUser\s*=)/.test(authServiceSrc) &&
    !/localStorage.getItem\(['"]?(usuario|user|perfil|rol)/.test(app) &&
    !/\|\|\s*'ADMINISTRADOR'/.test(app) &&
    !/find\(\(\w+\)\s*=>\s*\w+\.tipoPerfil\s*===\s*'ADMINISTRADOR'\)/.test(app)
);

checkEstatica(
  'I13',
  'Rules: no se puede cambiar la titularidad (propietarioId/ownerId) desde el cliente',
  /allow update: if !esProfesionalAutenticado\(\)[\s\S]{0,400}'token', 'inmuebleId', 'candidatoId', 'ownerId', 'profesionalId'/.test(reglas) &&
    /incoming\(\)\.propietarioId == myPropId\(\)/.test(reglas)
);
checkEstatica(
  'I14',
  'Rules: no se puede reasignar inmuebleId/candidatoId para apropiarse de datos ajenos',
  /affectedKeys\(\)\.hasAny\(\[\s*'token', 'inmuebleId', 'candidatoId'/.test(reglas) &&
    reglas.includes('esMiInmueble(incoming().inmuebleId)')
);
checkEstatica(
  'I15',
  'Rules: audit_logs es inmutable (sin update ni delete)',
  /match \/audit_logs\/\{auditId\} \{[\s\S]{0,900}?allow update, delete: if false;/.test(reglas)
);
checkEstatica(
  'I16',
  'Storage: la documentación privada no es pública (sólo la galería de inmuebles lo es)',
  /match \/documentos_solicitados\/\{solicitudDocId\}\/\{allFiles=\*\*\} \{[\s\S]{0,400}?allow read: if internalUser\(\);/.test(storage) &&
    /match \/polizas\/\{propietarioId\}\/\{polizaId\}\/\{fileName\} \{[\s\S]{0,200}?allow read: if internalUser\(\);/.test(storage) &&
    (storage.match(/allow read: if true;/g) || []).length === 1
);
checkReal(
  'I17.1',
  'Sin sesión, la autorización DENIEGA (el cierre de sesión no deja permisos vivos)',
  perfilAutorizado(null) === null &&
    perfilAutorizado(undefined) === null &&
    seccionesPermitidas(null).length === 0 &&
    esAdministradorAutorizado(null) === false
);
checkEstatica(
  'I17.2',
  'El cierre de sesión destruye la sesión de Firebase y limpia el estado en memoria',
  /export async function logoutUser/.test(authServiceSrc) &&
    /signOut\(/.test(authServiceSrc) &&
    /const handleLogout[\s\S]{0,1200}?(setCurrentUser\(null\)|logoutUser\()/.test(app)
);

// ===========================================================================
// 4. PANELES SEPARADOS POR PERFIL (I18 · I19 · I20 · I21)
// ===========================================================================
const admin = {
  id: 'user_ADM',
  nombre: 'Admin',
  email: 'adm@example.com',
  tipoPerfil: 'ADMINISTRADOR',
  roles: [],
  permisos: [],
  estado: 'ACTIVO',
} as UsuarioApp;

checkReal(
  'I18.1',
  'Sin sesión no hay perfil autorizado y la sección inicial es la de entrada',
  perfilAutorizado(null) === null && seccionInicialPorPerfil(null) === 'inicio'
);
checkEstatica(
  'I18.2',
  'App: sin usuario se renderiza el Login (no hay acceso directo a paneles)',
  /if \(!currentUser\)[\s\S]{0,400}?<LoginView/.test(app)
);

checkReal(
  'I19.1',
  'ADMIN → panel de administración y visión global autorizada',
  esAdministradorAutorizado(admin) === true &&
    seccionInicialPorPerfil(admin) === 'administracion' &&
    alcanceDatos(admin).global === true
);
checkEstatica(
  'I19.2',
  'App: el AdminControlCenter sólo se monta para el perfil ADMINISTRADOR',
  /currentUser\.tipoPerfil === 'ADMINISTRADOR' \? \(\s*<AdminControlCenter/.test(app)
);

checkReal(
  'I20.1',
  'PROPIETARIO → sección inicial de propietarios y alcance acotado a su titularidad',
  isPropietario(propietarioA) === true &&
    seccionInicialPorPerfil(propietarioA) === 'propietarios' &&
    alcanceDatos(propietarioA).global === false
);
checkEstatica(
  'I20.2',
  'App: el portal del propietario se monta con los datos ya acotados (scoped)',
  /<PropietarioPortalSection[\s\S]{0,600}?inmuebles=\{scopedInmuebles\}/.test(app)
);

checkReal(
  'I21.1',
  'PROFESIONAL → no es administrador y su portal es el suyo (sin panel admin)',
  isProfesional(profesionalUsuario) === true && esAdministradorAutorizado(profesionalUsuario) === false
);
checkEstatica(
  'I21.2',
  'App: el profesional ve su propio portal dentro de la sección de administración',
  /currentUser\.tipoPerfil === 'PROFESIONAL' \? \(\s*<ProfesionalPortalSection/.test(app)
);

// ===========================================================================
// 5. REGRESIÓN DE CIRCUITOS EXISTENTES (punto 17)
// ===========================================================================
const poliza = {
  id: 'pol_I1',
  inmuebleId: inmuebleA.id,
  propietarioId: 'prop_A',
  estado: 'VIGENTE',
  tipo: 'multirriesgo_hogar',
  aseguradora: 'Aseguradora Integración',
  numeroPoliza: 'POL-1',
  coberturas: ['danos_agua', 'electricidad'],
} as unknown as PolizaSeguro;

const incidencia = {
  id: 'inc_I1',
  inmuebleId: inmuebleA.id,
  propietarioId: 'prop_A',
  categoria: 'fontaneria',
  titulo: 'Fuga de agua',
  descripcion: 'Fuga bajo el fregadero',
  estado: 'ABIERTA',
} as unknown as Incidencia;

const evaluacionSeguro = evaluarCoberturaPolizas(incidencia, [poliza]);
checkReal(
  'REG-SEGUROS',
  'El circuito de seguros sigue evaluando la cobertura de una incidencia con la póliza vigente',
  !!evaluacionSeguro &&
    evaluacionSeguro.polizasAplicables.length === 1 &&
    evaluacionSeguro.polizasAplicables[0].id === poliza.id &&
    typeof evaluacionSeguro.estado === 'string',
  evaluacionSeguro ? `estado=${evaluacionSeguro.estado}` : 'sin evaluación'
);

const candidatoFormalizable = {
  id: 'cand_F',
  nombre: 'Candidata Formalización',
  email: 'cf@example.com',
  telefono: '600000001',
  inmuebleId: inmuebleA.id,
  estado: 'doc_recibida',
  ingresosNetos: 2600,
  otrosIngresos: 0,
  tipoEmpleo: 'cuenta_ajena',
  tipoContrato: 'indefinido',
  documentos: [],
} as unknown as Candidato;

const asegurabilidad = evaluarAsegurabilidadCandidato(candidatoFormalizable, inmuebleA);
const borrador = crearBorradorContrato(candidatoFormalizable, inmuebleA);
checkReal(
  'REG-ALQUILER',
  'El circuito de formalización sigue evaluando asegurabilidad y generando borrador de contrato',
  !!asegurabilidad && !!borrador && borrador.inmuebleId === inmuebleA.id
);

const docsSugeridos = generarDocumentosSugeridos(candidatoFormalizable);
const solicitudDoc = buildSolicitudDocumentacion(candidatoFormalizable, inmuebleA, docsSugeridos);
checkReal(
  'REG-DOCUMENTACION',
  'El circuito documental sigue generando requisitos y su solicitud con token propio',
  docsSugeridos.length > 0 && !!solicitudDoc.token && solicitudDoc.documentos.length === docsSugeridos.length
);

const escenarios = escenariosROI([]);
checkReal(
  'REG-COMERCIAL',
  'La preparación comercial existente sigue ofreciendo sus escenarios de reforma (ROI)',
  escenarios.length === 3 &&
    escenarios[0].id === 'sin_reforma' &&
    escenarios.some((e) => e.id === 'parcial') &&
    escenarios.some((e) => e.id === 'completa')
);

const cuadre = cuadreRentabilidad({
  cobros: [cobroB],
  gastos: [gastoHipoteca as unknown as Gasto],
  inmuebles: [inmuebleA, inmuebleB],
});
checkReal(
  'REG-PATRIMONIO',
  'El cuadre de rentabilidad/patrimonio sigue devolviendo una fila por inmueble con su resultado',
  Array.isArray(cuadre) && cuadre.length === 2
);

checkEstatica(
  'REG-HABITACIONES',
  'El modelo conserva el identificador de habitación (alquiler por habitaciones intacto)',
  /habitacionIdentificador\?: string;/.test(tipos)
);

// ===========================================================================
// 6. DECLARACIÓN DE PRUEBAS NO EJECUTABLES (bloques ausentes)
// ===========================================================================
declararNoEjecutable('I1', 'REFORMA → GASTO → FISCALIDAD: requiere el bloque A (motor y entidades de reforma), ausente');
declararNoEjecutable('I2', 'REFORMA → COSTE → PATRIMONIO: requiere el bloque A (coste real de proyecto), ausente');
declararNoEjecutable('I3', 'REFORMA → VALORACIÓN POSTERIOR: requiere los bloques A y C, ausentes');
declararNoEjecutable('I4', 'VALORACIÓN → FICHA COMERCIAL: requiere el bloque C (valoración de mercado), ausente');
declararNoEjecutable('I9/A-D', 'PROPIETARIO A vs fiscalidad de B: la colección fiscal avanzada del bloque D no existe');
declararNoEjecutable('I10/A-D', 'PROPIETARIO A vs valoración/comercialización de B: colecciones del bloque C inexistentes');
declararNoEjecutable('A-SUITE', 'Suite test-circuito-reformas.ts: no existe en el repositorio (bloque A ausente)');
declararNoEjecutable('D-SUITE', 'Suite tests_fiscal_avanzado.ts: no existe en el repositorio (bloque D ausente)');
declararNoEjecutable('C-SUITE', 'Suite de valoración/mercado: no existe en el repositorio (bloque C ausente)');

// ===========================================================================
// RESULTADO
// ===========================================================================
console.log(reales.join('\n'));
console.log('');
console.log(estaticas.join('\n'));
console.log('');
if (noEjecutables.length > 0) {
  console.log('-'.repeat(78));
  console.log('NO EJECUTABLES (no se cuentan como superadas):');
  console.log(noEjecutables.join('\n'));
  console.log('-'.repeat(78));
  console.log('');
}
if (fallos.length > 0) {
  console.log('FALLOS:');
  console.log(fallos.join('\n'));
  console.log('');
}
console.log('='.repeat(78));
console.log(`ASSERTIONS EJECUTADAS: ${ejecutadas}`);
console.log(`  · REALES (motores/autorización ejecutados): ${reales.length}`);
console.log(`  · ESTÁTICAS (texto de reglas/código): ${estaticas.length}`);
console.log(`CORRECTAS: ${correctas} | FALLIDAS: ${fallidas}`);
console.log(`NO EJECUTABLES (bloques A/C/D ausentes): ${noEjecutables.length}`);
console.log('='.repeat(78));
console.log(
  fallidas === 0
    ? 'RESULTADO: OK — integración del bloque B verificada; bloques A, C y D NO integrables (material ausente)'
    : 'RESULTADO: FALLOS DETECTADOS'
);
if (fallidas > 0) process.exit(1);
