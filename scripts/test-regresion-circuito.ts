/**
 * SUITE DE REGRESIÓN DE LOS CIRCUITOS YA CERRADOS
 * ---------------------------------------------------------------------------
 * Ejecuta REALMENTE los motores puros de los circuitos existentes para
 * comprobar que la integración del circuito de candidatos NO los ha degradado:
 *
 *   · PRESUPUESTOS PROFESIONALES  (calcularTotalesPresupuesto)
 *   · ÓRDENES DE TRABAJO          (crearItemHistorialTrabajo, métricas)
 *   · PROFESIONALES / MATCHING    (buscarProfesionales, coincideUbicacion)
 *   · INCIDENCIAS                 (canAccessIncidencia / canManageResponsabilidad)
 *   · MANTENIMIENTO Y GARANTÍAS   (etiquetas de responsabilidad + garantía)
 *   · GASTOS Y RECURRENTES        (crearGasto, generarGastosRecurrentes)
 *   · COBROS Y FISCALIDAD         (generarPeriodosParaContrato, resumen fiscal)
 *   · HIPOTECAS / PRÉSTAMOS       (calcularCuotaConstante, tabla de amortización)
 *   · RENTABILIDAD Y PATRIMONIO   (cuadreRentabilidad)
 *
 * NOTA HONESTA: no existen en el repositorio suites previas de estos circuitos
 * (las únicas suites del proyecto son test-candidate-circuit y
 * test-seguridad-circuito). Por tanto esta es una verificación REAL de la
 * lógica de dominio, no una ejecución de pruebas de interfaz ni de Firebase
 * (sin emulador ni credenciales en este entorno).
 *
 * Ejecución: npm run test:regresion
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  calcularTotalesPresupuesto,
  crearItemHistorialTrabajo,
  calcularMetricasGeneralesTrabajos,
  coincideUbicacion,
  buscarProfesionales,
} from '../src/utils/profesionalesEngine';
import { crearGasto, crearGastoRecurrente, generarGastosRecurrentes, resumenGastos } from '../src/utils/gastosEngine';
import { calcularCuotaConstante, generarTablaAmortizacion, resumenPrestamo } from '../src/utils/prestamosEngine';
import { generarPeriodosParaContrato, calcularResumenCobros } from '../src/utils/cobrosEngine';
import {
  canAccessIncidencia,
  canManageResponsabilidad,
  RESPONSABILIDADES_LABELS,
  calcularMetricasIncidencias,
} from '../src/utils/incidenciasEngine';
import { cuadreRentabilidad } from '../src/utils/rentabilidadEngine';
import { Gasto, Inmueble, Incidencia, PresupuestoProfesional, Profesional, TrabajoProfesional, UsuarioApp } from '../src/types';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), 'utf-8');

let ejecutadas = 0;
let fallidas = 0;
const lineas: string[] = [];
const fallos: string[] = [];

function check(area: string, nombre: string, condicion: boolean, detalle = '') {
  ejecutadas += 1;
  if (condicion) lineas.push(`OK    [${area}] ${nombre}`);
  else {
    fallidas += 1;
    fallos.push(`FALLO [${area}] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
  }
}

const inmueble = {
  id: 'inm_R1',
  direccion: 'Av. Regresión 10',
  ciudad: 'Valencia',
  precio: 1000,
  estado: 'disponible',
  habitaciones: 3,
  banos: 2,
  superficie: 95,
  candidatosCount: 0,
  fianzaMeses: 2,
  propietarioId: 'prop_R',
} as Inmueble;

const propietario = {
  id: 'user_R',
  nombre: 'Propietario Regresión',
  email: 'r@example.com',
  tipoPerfil: 'PROPIETARIO',
  roles: [],
  permisos: [],
  estado: 'ACTIVO',
  propietarioId: 'prop_R',
  inmuebleIds: ['inm_R1'],
} as UsuarioApp;

// --- PRESUPUESTOS ----------------------------------------------------------
const presupuesto = {
  id: 'pres_R1',
  trabajoId: 'tr_R1',
  inmuebleId: inmueble.id,
  propietarioId: 'prop_R',
  profesionalId: 'prof_R1',
  descripcion: 'Sustitución de caldera',
  estado: 'BORRADOR',
  fecha: '2026-02-01',
  validez: '30 días',
  partidas: [
    { id: 'l1', concepto: 'Caldera', cantidad: 1, precioUnitario: 1200, importe: 1200 },
    { id: 'l2', concepto: 'Mano de obra', cantidad: 4, precioUnitario: 50, importe: 200 },
    { id: 'l3', concepto: 'Material menor', cantidad: 1, precioUnitario: 80, importe: 80 },
  ],
} as unknown as PresupuestoProfesional;
const totales = calcularTotalesPresupuesto(presupuesto.partidas);
check('PRESUPUESTOS', 'Totales con IVA calculados sin desviación (1200+200+80 = 1480 + 21% = 1790,80)',
  Math.abs(totales.importeBase - 1480) < 0.01 && Math.abs(totales.importeTotal - 1790.8) < 0.01 && Math.abs(totales.iva - 310.8) < 0.01,
  JSON.stringify(totales));
check('PRESUPUESTOS', 'Sin partidas el cálculo devuelve cero (defensivo, no rompe el circuito)',
  calcularTotalesPresupuesto([]).importeTotal === 0);
check('PRESUPUESTOS', 'Un presupuesto sin partidas (nulo) tampoco rompe el cálculo',
  calcularTotalesPresupuesto(undefined as unknown as Parameters<typeof calcularTotalesPresupuesto>[0]).importeTotal === 0);

// --- ÓRDENES DE TRABAJO / MANTENIMIENTO ------------------------------------
const trabajo = {
  id: 'tr_R1',
  inmuebleId: inmueble.id,
  propietarioId: 'prop_R',
  profesionalId: 'prof_R1',
  titulo: 'Reparación de persiana',
  estado: 'ASIGNADA',
  prioridad: 'URGENTE',
  fechaCreacion: '2026-02-01',
  historial: [],
} as unknown as TrabajoProfesional;
const itemHistorial = crearItemHistorialTrabajo('ESTADO_MODIFICADO', 'Profesional Regresión', 'ASIGNADA', 'EN_EJECUCION', 'Inicio de obra');
check('OT / MANTENIMIENTO', 'El histórico de la orden de trabajo registra acción, autor y transición de estados',
  !!itemHistorial &&
    itemHistorial.accion === 'ESTADO_MODIFICADO' &&
    itemHistorial.usuario === 'Profesional Regresión' &&
    itemHistorial.estadoAnterior === 'ASIGNADA' &&
    itemHistorial.estadoNuevo === 'EN_EJECUCION' &&
    !!itemHistorial.fecha);
const metricas = calcularMetricasGeneralesTrabajos(
  [{ ...trabajo, estado: 'EN_EJECUCION' } as TrabajoProfesional],
  [presupuesto],
  [{ id: 'prof_R1', nombreComercial: 'Técnico R' } as Profesional],
  []
);
check('OT / MANTENIMIENTO', 'Las métricas de trabajos siguen calculándose (activos/urgentes)',
  metricas.activos === 1 && metricas.urgentes === 1, JSON.stringify(metricas));

// --- PROFESIONALES / MATCHING ----------------------------------------------
const profesional = {
  id: 'prof_R1',
  nombreComercial: 'Técnico R',
  especialidadPrincipal: 'fontaneria',
  zonasServicio: [{ ciudad: 'Valencia', provincia: 'Valencia' }],
  activo: true,
} as unknown as Profesional;
check('PROFESIONALES / MATCHING', 'El matching por ubicación sigue operativo',
  coincideUbicacion(profesional, inmueble) === true &&
  buscarProfesionales([profesional], inmueble).length === 1);

// --- INCIDENCIAS / GARANTÍAS ----------------------------------------------
check('INCIDENCIAS / GARANTÍAS', 'Las responsabilidades legales (incl. garantía) siguen definidas',
  !!RESPONSABILIDADES_LABELS.GARANTIA && !!RESPONSABILIDADES_LABELS.PROPIETARIO && !!RESPONSABILIDADES_LABELS.SEGURO);
const incidencia = { id: 'inc_R1', inmuebleId: inmueble.id, propietarioId: 'prop_R', estado: 'ABIERTA' } as unknown as Incidencia;
check('INCIDENCIAS / GARANTÍAS', 'Sin usuario autenticado NO se accede ni se dictamina una incidencia',
  canAccessIncidencia(incidencia, null) === false && canManageResponsabilidad(incidencia, null) === false);
check('INCIDENCIAS / GARANTÍAS', 'El propietario titular gestiona su incidencia y un tercero no',
  canAccessIncidencia(incidencia, propietario) === true &&
  canManageResponsabilidad(incidencia, propietario) === true &&
  canAccessIncidencia(incidencia, { ...propietario, propietarioId: 'prop_OTRO', inmuebleIds: [] }) === false);
check('INCIDENCIAS / GARANTÍAS', 'Las métricas de incidencias siguen calculándose',
  calcularMetricasIncidencias([incidencia]).abiertas >= 1);

// --- GASTOS Y RECURRENTES --------------------------------------------------
const gasto = crearGasto({
  inmuebleId: inmueble.id,
  propietarioId: 'prop_R',
  categoria: 'COMUNIDAD',
  importe: 120,
  fechaDevengo: '2026-02-01',
  concepto: 'Comunidad febrero',
});
check('GASTOS', 'El alta de gasto mantiene sus campos obligatorios (id, periodo contable, importe)',
  !!gasto.id && gasto.importe === 120 && gasto.periodoMesAnio === '2026-02' && gasto.fechaDevengo === '2026-02-01',
  JSON.stringify(gasto).slice(0, 180));
const resumen = resumenGastos([{ ...gasto, estado: 'PAGADO' }]);
check('GASTOS', 'El resumen de gastos sigue agregando la salida de caja pagada de explotación',
  resumen.numero === 1 && resumen.explotacionPagado === 120 && resumen.salidaCajaPagada === 120,
  JSON.stringify(resumen));
const recurrente = crearGastoRecurrente({
  inmuebleId: inmueble.id,
  propietarioId: 'prop_R',
  categoria: 'CUOTA_HIPOTECARIA',
  importe: 600,
  concepto: 'Hipoteca',
  frecuencia: 'MENSUAL',
  diaVencimiento: 1,
  fechaInicio: '2026-01-01',
});
const generados = generarGastosRecurrentes(
  [recurrente],
  [{ ...gasto, estado: 'PAGADO' }],
  new Date('2026-04-15T00:00:00Z')
);
check('GASTOS', 'Los gastos recurrentes materializan los periodos debidos con ids únicos',
  generados.gastos.length >= 3 &&
    new Set(generados.gastos.map((g) => g.id)).size === generados.gastos.length &&
    generados.gastos.every((g) => g.importe === 600),
  `generados=${generados.gastos.length}`);
const generados2 = generarGastosRecurrentes([recurrente], [...generados.gastos], new Date('2026-04-15T00:00:00Z'));
check('GASTOS', 'Volver a generar el mismo mes NO duplica apuntes (idempotencia real)',
  generados2.gastos.length === 0, `repetidos=${generados2.gastos.length}`);

// --- COBROS Y FISCALIDAD ---------------------------------------------------
const contrato = {
  id: 'ct_R1',
  inmuebleId: inmueble.id,
  propietarioId: 'prop_R',
  inquilinoNombre: 'Inquilino R',
  rentaMensual: 1000,
  rentaMensualTotal: 1000,
  fianzaMeses: 2,
  fechaInicioContrato: '2026-01-01',
  fechaFinContrato: '2026-12-31',
  estado: 'ACTIVO',
  modalidad: 'completo',
  registroCobros: [],
} as unknown as Parameters<typeof generarPeriodosParaContrato>[0];
const periodos = generarPeriodosParaContrato(contrato, 24);
check('COBROS / FISCALIDAD', 'La generación de periodos de cobro sigue produciendo la serie del contrato a 1.000 €/mes',
  periodos.length >= 12 &&
    periodos.every((p) => p.importePrevisto === 1000) &&
    periodos[0].periodoMesAnio === '2026-01' &&
    periodos.every((p) => p.importeRecibido === 0),
  `periodos=${periodos.length} · ${periodos.map((p) => `${p.periodoMesAnio}:${p.importePrevisto}`).join(',')}`);
check('COBROS / FISCALIDAD', 'Los estados de vencimiento se calculan (meses pasados RETRASADO, futuros PENDIENTE)',
  periodos.filter((p) => p.estado === 'RETRASADO').length > 0 &&
    periodos.filter((p) => p.estado === 'PENDIENTE').length > 0);
const resumenCobros = calcularResumenCobros(periodos);
check('COBROS / FISCALIDAD', 'El resumen de cobros sigue cuadrando el previsto con la serie generada',
  Math.abs((resumenCobros.totalPrevisto || 0) - periodos.length * 1000) < 0.01,
  JSON.stringify(resumenCobros).slice(0, 200));

// --- HIPOTECAS / PATRIMONIO ------------------------------------------------
const cuota = calcularCuotaConstante(150000, 2.5, 300);
check('HIPOTECAS', 'La cuota hipotecaria constante se calcula correctamente (150.000 € · 2,5% · 300 meses ≈ 672,9 €)',
  cuota > 660 && cuota < 685, String(cuota));
const prestamo = {
  id: 'prest_R1',
  inmuebleId: inmueble.id,
  propietarioId: 'prop_R',
  tipo: 'HIPOTECA',
  capitalInicial: 120000,
  tasaInteresAnual: 3,
  plazoMeses: 120,
  fechaInicio: '2026-01',
  diaVencimiento: 1,
  activo: true,
} as unknown as Parameters<typeof generarTablaAmortizacion>[0];
const tabla = generarTablaAmortizacion(prestamo);
check('HIPOTECAS', 'La tabla de amortización cubre el plazo y cierra el saldo pendiente',
  tabla.length === 120 && Math.abs((tabla[tabla.length - 1].saldoFinal ?? 0)) < 1,
  `filas=${tabla.length}`);
check('HIPOTECAS', 'El resumen del préstamo sigue devolviendo totales coherentes de intereses',
  (resumenPrestamo(prestamo).totalIntereses || 0) > 0,
  JSON.stringify(resumenPrestamo(prestamo)).slice(0, 160));

// --- RENTABILIDAD ----------------------------------------------------------
const cuadre = cuadreRentabilidad({
  inmuebles: [inmueble],
  gastos: [{ ...gasto, estado: 'PAGADO' }],
  cobros: periodos,
});
check('RENTABILIDAD / PATRIMONIO', 'El cuadre de rentabilidad sigue devolviendo una fila por inmueble con su resultado',
  Array.isArray(cuadre) &&
  cuadre.length === 1 &&
  cuadre[0].inmuebleId === inmueble.id &&
  typeof cuadre[0].cashFlowNeto === 'number' &&
  typeof cuadre[0].resultadoOperativo === 'number',
  JSON.stringify(cuadre).slice(0, 200));
check('RENTABILIDAD / PATRIMONIO', 'El cuadre incluye la base fiscal deducible (fiscalidad anual intacta)',
  typeof cuadre[0].baseFiscalDeducible === 'number');

// --- CIRCUITOS PROTEGIDOS SIN BLOQUEOS GLOBALES ----------------------------
const fb = leer('src/lib/firebase.ts');
check('AISLAMIENTO', 'Ninguna escucha interna vuelve a descargar candidatos para todos los perfiles',
  !/export function subscribeCandidatos[\s\S]{0,400}?onSnapshot\(\s*CANDIDATOS_COL,\s*\(snapshot\)/.test(fb.split('if (scope?.tipoPerfil')[0].split('export function subscribeCandidatos')[1] || '') ||
  /export function subscribeCandidatos[\s\S]*?if \(scopeEsAdminConocido\(scope\)\)/.test(fb));
check('AISLAMIENTO', 'El alcance del propietario sigue siendo no global en las colecciones del circuito',
  leer('src/lib/firebase.ts').includes("if (scope?.tipoPerfil === 'PROPIETARIO')"));

console.log('='.repeat(78));
console.log(' REGRESIÓN DE CIRCUITOS YA CERRADOS (ejecución REAL de motores de dominio)');
console.log('='.repeat(78));
console.log(lineas.join('\n'));
if (fallos.length) {
  console.log('');
  console.log(fallos.join('\n'));
}
console.log('');
console.log('='.repeat(78));
console.log(`ASSERTIONS EJECUTADAS: ${ejecutadas} | CORRECTAS: ${ejecutadas - fallidas} | FALLIDAS: ${fallidas}`);
console.log(fallidas === 0 ? 'RESULTADO: OK — sin regresiones en los circuitos existentes' : 'RESULTADO: FALLOS DETECTADOS');
console.log('='.repeat(78));
if (fallidas > 0) process.exit(1);
