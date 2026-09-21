/**
 * BLOQUE E — Batería de pruebas: Portal del Inquilino + Suministros.
 * Ejecutar con: npx tsx scripts/test-bloque-e.ts
 * Cubre: alcance/aislamiento, invitaciones, lecturas, reparto, cambio de
 * titular, mensajes/incidencias, saneado de vistas, historial y reglas.
 */
import * as fs from 'fs';
import * as path from 'path';
import type {
  ContratoFormalizacion,
  EnlaceRegistro,
  Incidencia,
  Inmueble,
} from '../src/types';
import {
  contratosDelInquilino,
  esPerfilInquilino,
  puedeAccederContrato,
  puedeAccederInmueble,
  resolverAlcance,
} from '../src/inquilino/scope';
import {
  calcularRepartoImporte,
  esCupsValido,
  unidadSugerida,
  validarAltaSuministro,
  validarCambioTitular,
  validarLectura,
  validarReparto,
} from '../src/inquilino/suministrosEngine';
import {
  construirHistorialInquilino,
  sanearContratoParaInquilino,
  sanearIncidenciaParaInquilino,
  sanearInmuebleParaInquilino,
  validarEnlaceInquilino,
  validarIncidenciaInquilino,
  validarMensajePortal,
} from '../src/inquilino/portalEngine';

let passed = 0;
let failed = 0;

function assert(cond: boolean, id: number, name: string, detail?: string) {
  if (cond) {
    passed++;
    console.log(`✅ [E-${String(id).padStart(2, '0')}] PASS: ${name}`);
  } else {
    failed++;
    console.error(`❌ [E-${String(id).padStart(2, '0')}] FAIL: ${name} — ${detail || 'assertion failed'}`);
  }
}

// ---------------------------------------------------------------- fixtures
const CONTRATOS = [
  { id: 'ct_A', inmuebleId: 'inm_1' },
  { id: 'ct_B', inmuebleId: 'inm_2' },
  { id: 'ct_C', inmuebleId: 'inm_1' },
];
const PERFIL_INQ_A = { tipoPerfil: 'INQUILINO', contratoIds: ['ct_A'] };
const PERFIL_INQ_AB = { tipoPerfil: 'INQUILINO', contratoIds: ['ct_A', 'ct_B', 'ct_X'] };
const PERFIL_PROP = { tipoPerfil: 'PROPIETARIO', contratoIds: ['ct_A'] };
const PERFIL_INQ_SIN = { tipoPerfil: 'INQUILINO', contratoIds: [] };

// ------------------------------------------------- A. Alcance / aislamiento
assert(
  contratosDelInquilino(PERFIL_INQ_A, CONTRATOS).map((c) => c.id).join() === 'ct_A',
  1, 'El inquilino solo obtiene sus contratos vinculados'
);
assert(contratosDelInquilino(PERFIL_PROP, CONTRATOS).length === 0, 2, 'Otro perfil no obtiene contratos de inquilino');
assert(contratosDelInquilino(PERFIL_INQ_SIN, CONTRATOS).length === 0, 3, 'Inquilino sin vínculos obtiene lista vacía');
assert(contratosDelInquilino(null, CONTRATOS).length === 0, 4, 'Perfil nulo obtiene lista vacía');
assert(puedeAccederContrato(PERFIL_INQ_A, 'ct_A') === true, 5, 'Acceso permitido a contrato vinculado');
assert(puedeAccederContrato(PERFIL_INQ_A, 'ct_B') === false, 6, 'Acceso denegado a contrato ajeno (A no ve B)');
assert(puedeAccederInmueble(PERFIL_INQ_A, 'inm_1', CONTRATOS) === true, 7, 'Acceso al inmueble vía contrato vinculado');
assert(puedeAccederInmueble(PERFIL_INQ_A, 'inm_2', CONTRATOS) === false, 8, 'Sin acceso a inmueble sin contrato');
assert(puedeAccederInmueble(PERFIL_PROP, 'inm_1', CONTRATOS) === false, 9, 'Alcance inquilino no aplica a otros perfiles');
{
  const alc = resolverAlcance(PERFIL_INQ_AB, CONTRATOS);
  assert(
    alc.contratos.length === 2 && alc.inmuebleIds.join() === 'inm_1,inm_2',
    10, 'resolverAlcance deriva contratos e inmuebles (ignora IDs desconocidos)'
  );
}
assert(esPerfilInquilino(PERFIL_INQ_A) && !esPerfilInquilino(PERFIL_PROP), 11, 'Detección de perfil INQUILINO');

// ------------------------------------------------- B. Invitación de inquilino
const ENLACE_OK = {
  activo: true, tipoPerfil: 'INQUILINO', contratoIdVinculado: 'ct_A',
  fechaCaducidad: '2030-01-01', usosMaximos: 1, usosActuales: 0, ahoraIso: '2026-01-01T00:00:00.000Z',
};
assert(validarEnlaceInquilino(ENLACE_OK).ok, 12, 'Invitación válida aceptada');
assert(!validarEnlaceInquilino({ ...ENLACE_OK, activo: false }).ok, 13, 'Invitación inactiva rechazada');
assert(!validarEnlaceInquilino({ ...ENLACE_OK, tipoPerfil: 'PROPIETARIO' }).ok, 14, 'Otro tipo de enlace rechazado');
assert(!validarEnlaceInquilino({ ...ENLACE_OK, contratoIdVinculado: undefined }).ok, 15, 'Sin contrato vinculado rechazada');
assert(
  !validarEnlaceInquilino({ ...ENLACE_OK, fechaCaducidad: '2020-01-01' }).ok,
  16, 'Invitación caducada rechazada'
);
assert(!validarEnlaceInquilino({ ...ENLACE_OK, usosActuales: 1 }).ok, 17, 'Invitación con usos agotados rechazada');
assert(
  validarEnlaceInquilino({ ...ENLACE_OK, usosMaximos: undefined, usosActuales: 9 }).ok,
  18, 'Sin límite de usos permite registros sucesivos'
);

// ------------------------------------------------- C. Lecturas
const LEC_OK = { valor: 1234.5, unidad: 'kWh', fechaLectura: '2026-06-01T10:00:00.000Z', ahoraIso: '2026-06-02T00:00:00.000Z' };
assert(validarLectura(LEC_OK).ok, 19, 'Lectura válida aceptada');
assert(!validarLectura({ ...LEC_OK, valor: -1 }).ok, 20, 'Valor negativo rechazado');
assert(!validarLectura({ ...LEC_OK, valor: NaN }).ok, 21, 'Valor no numérico rechazado');
assert(
  !validarLectura({ ...LEC_OK, fechaLectura: '2027-01-01T00:00:00.000Z' }).ok,
  22, 'Fecha futura rechazada'
);
assert(!validarLectura({ ...LEC_OK, fechaLectura: 'no-fecha' }).ok, 23, 'Fecha inválida rechazada');
assert(
  !validarLectura({ ...LEC_OK, ultimoValor: 2000 }).ok,
  24, 'Lectura decreciente respecto a la última rechazada'
);
assert(validarLectura({ ...LEC_OK, ultimoValor: 1234.5 }).ok, 25, 'Lectura igual a la última aceptada (contador parado)');
assert(!validarLectura({ ...LEC_OK, unidad: '' }).ok, 26, 'Unidad vacía rechazada');

// ------------------------------------------------- D. Reparto
const TRAMOS_OK = [{ etiqueta: 'HAB-1', porcentaje: 50 }, { etiqueta: 'HAB-2', porcentaje: 30 }, { etiqueta: 'Común', porcentaje: 20 }];
assert(validarReparto(TRAMOS_OK).ok, 27, 'Reparto 100% aceptado');
assert(!validarReparto([{ etiqueta: 'A', porcentaje: 60 }]).ok, 28, 'Suma distinta de 100 rechazada');
assert(!validarReparto([{ etiqueta: '', porcentaje: 100 }]).ok, 29, 'Etiqueta vacía rechazada');
assert(
  !validarReparto([{ etiqueta: 'A', porcentaje: 50 }, { etiqueta: 'a', porcentaje: 50 }]).ok,
  30, 'Etiqueta duplicada rechazada'
);
assert(!validarReparto([{ etiqueta: 'A', porcentaje: 0 }]).ok, 31, 'Porcentaje cero rechazado');
{
  const calc = calcularRepartoImporte(
    [{ etiqueta: 'A', porcentaje: 33.33 }, { etiqueta: 'B', porcentaje: 33.33 }, { etiqueta: 'C', porcentaje: 33.34 }],
    100
  );
  const suma = calc.reduce((a, t) => a + t.importe, 0);
  assert(Math.abs(suma - 100) < 0.001 && calc.length === 3, 32, 'Reparto de 100 € suma exactamente el total (redondeo ajustado)');
}

// ------------------------------------------------- E. Cambio de titular
const CT_OK = { titularNuevoNombre: 'María López', titularNuevoNif: '12345678Z', fechaEfecto: '2026-07-01' };
assert(validarCambioTitular(CT_OK).ok, 33, 'Cambio de titular válido aceptado');
assert(!validarCambioTitular({ ...CT_OK, titularNuevoNombre: 'AB' }).ok, 34, 'Nombre corto rechazado');
assert(!validarCambioTitular({ ...CT_OK, titularNuevoNif: 'XYZ' }).ok, 35, 'NIF con formato inválido rechazado');
assert(
  validarCambioTitular({ titularNuevoNombre: 'María López', fechaEfecto: '2026-07-01' }).ok,
  36, 'NIF opcional: sin NIF aceptado'
);
assert(!validarCambioTitular({ ...CT_OK, fechaEfecto: 'xxx' }).ok, 37, 'Fecha de efecto inválida rechazada');

// ------------------------------------------------- F. Mensajes e incidencias
assert(!validarMensajePortal('').ok && !validarMensajePortal('   ').ok, 38, 'Mensaje vacío rechazado');
assert(!validarMensajePortal('x'.repeat(4001)).ok, 39, 'Mensaje de más de 4000 caracteres rechazado');
assert(validarMensajePortal('Hola, hay una fuga en el baño.').ok, 40, 'Mensaje válido aceptado');
assert(
  !validarIncidenciaInquilino({ titulo: 'AB', descripcion: 'Descripción suficientemente larga.' }).ok,
  41, 'Incidencia con título corto rechazada'
);
assert(
  !validarIncidenciaInquilino({ titulo: 'Fuga en baño', descripcion: 'Corta' }).ok,
  42, 'Incidencia con descripción corta rechazada'
);
assert(
  validarIncidenciaInquilino({ titulo: 'Fuga en baño', descripcion: 'Goteo constante bajo el lavabo desde ayer.' }).ok,
  43, 'Incidencia válida aceptada'
);

// ------------------------------------------------- G. Alta de suministro / CUPS
assert(esCupsValido('ES0021000000000001AB'), 44, 'CUPS válido aceptado');
assert(esCupsValido('ES0021000000000001AB-001'), 45, 'CUPS con sufijo aceptado');
assert(!esCupsValido('0021000000000001AB') && !esCupsValido('ES123'), 46, 'CUPS inválidos rechazados');
assert(
  !validarAltaSuministro({ inmuebleId: 'inm_1', tipo: 'LUZ', cups: 'MAL' }).ok,
  47, 'Alta de luz sin CUPS válido rechazada'
);
assert(
  validarAltaSuministro({ inmuebleId: 'inm_1', tipo: 'LUZ', cups: 'ES0021000000000001AB' }).ok,
  48, 'Alta de luz con CUPS válida aceptada'
);
assert(
  !validarAltaSuministro({ inmuebleId: 'inm_1', tipo: 'AGUA', potenciaContratadaKw: 0 }).ok,
  49, 'Potencia no positiva rechazada'
);
assert(unidadSugerida('LUZ') === 'kWh' && unidadSugerida('AGUA') === 'm3', 50, 'Unidades sugeridas por tipo');

// ------------------------------------------------- H. Saneado e historial
const CONTRATO_FIX = {
  id: 'ct_A',
  inmuebleId: 'inm_1',
  inmuebleNombre: 'Piso Centro', inmuebleDireccion: 'Calle Mayor 1', inmuebleCiudad: 'Almería',
  propietarioNombre: 'Juan Prop', propietarioDni: '11111111A', propietarioDireccion: 'Secreta 1',
  propietarioTelefono: '600111222', propietarioEmail: 'juan@x.es', propietarioIban: 'ES0000000000000000000000',
  tieneSegundoPropietario: true, segundoPropietarioNombre: 'Ana Seg', segundoPropietarioDni: '22222222B',
  segundoPropietarioEmail: 'ana@x.es', segundoPropietarioTelefono: '600333444',
  candidatoNombre: 'Luis Inq', candidatoTelefono: '600555666', candidatoEmail: 'luis@x.es',
  tieneCotitular: false, tieneAvalista: true, avalistaNombre: 'Aval', avalistaDni: '33333333C', avalistaTelefono: '1',
  rentaMensual: 750, fianzaLegalMeses: 1, fianzaLegalImporte: 750, garantiaAdicionalMeses: 0, garantiaAdicionalImporte: 0,
  fechaInicioContrato: '2026-01-01', duracionAnios: 1, diaLimitePagoMes: 5,
  permitirMascotas: false, permitirSubarriendo: false, incluyeMueblesInventario: false,
  gastosComunidadCargo: 'arrendatario', ibiCargo: 'arrendador', suministrosCargo: 'arrendatario',
  clausulaDesistimientoAnticipado: true, clausulasPersonalizadas: [],
  estado: 'VIGENTE', evaluacionAsegurabilidad: { score: 90 }, actaEntregaLlaves: { fechaEntrega: '2026-01-01' },
  firmaArrendador: { firmado: true, fecha: '2026-01-01', firmanteNombre: 'X' },
  firmaArrendatario: { firmado: true, fecha: '2026-01-01' },
  fechaCreacion: '2025-12-20', fechaActualizacion: '2025-12-20',
  historial: [{ id: 'h1' }], notasPrivadas: 'INTERNO', registroCobros: [],
} as unknown as ContratoFormalizacion;

{
  const vm = sanearContratoParaInquilino(CONTRATO_FIX);
  const keys = Object.keys(vm);
  const prohibidos = ['propietarioDni', 'notasPrivadas', 'evaluacionAsegurabilidad', 'avalistaNombre', 'avalistaDni', 'historial', 'segundoPropietarioEmail', 'segundoPropietarioDni'];
  assert(prohibidos.every((k) => !keys.includes(k)), 51, 'Contrato saneado excluye campos internos y de terceros');
  assert(
    vm.rentaMensual === 750 && vm.ibanPago === 'ES0000000000000000000000' && vm.firmaArrendador.firmado === true,
    52, 'Contrato saneado conserva renta, IBAN de pago y firmas'
  );
}

const INCIDENCIA_FIX = {
  id: 'inc_1', titulo: 'Fuga', descripcion: 'Goteo', categoria: 'AGUA', prioridad: 'ALTA', estado: 'EN_CURSO',
  fechaCreacion: '2026-02-01', fechaActualizacion: '2026-02-02', resolucion: undefined,
  trabajoProfesional: {
    profesionalId: 'p1', profesionalNombre: 'Font Vera', profesionalTelefono: '600999888',
    profesionalEmail: 'f@x.es', servicio: 'Reparar fuga', fechaAsignacion: '2026-02-02',
    presupuestoEstimado: 120, costeReal: 150, facturaNumero: 'F-1', estadoTrabajo: 'EN_CURSO',
  },
  historial: [{ id: 'h1', fecha: '2026-02-02', usuario: 'gestor@x.es', accion: 'ASIGNADA', valorNuevo: 'Font Vera' }],
  fotografias: [], documentos: [],
} as unknown as Incidencia;

{
  const vm = sanearIncidenciaParaInquilino(INCIDENCIA_FIX);
  const plano = JSON.stringify(vm);
  assert(
    !plano.includes('600999888') && !plano.includes('150') && !plano.includes('F-1') && !plano.includes('gestor@x.es'),
    53, 'Incidencia saneada excluye importes, factura y contactos internos'
  );
  assert(
    vm.trabajo?.profesionalNombre === 'Font Vera' && vm.seguimiento.length === 1 && vm.seguimiento[0].accion === 'ASIGNADA',
    54, 'Incidencia saneada conserva profesional, servicio y seguimiento'
  );
}

const INMUEBLE_FIX = {
  id: 'inm_1', direccion: 'Calle Mayor 1', ciudad: 'Almería', precio: 750, estado: 'alquilado',
  habitaciones: 3, banos: 1, superficie: 80, descripcion: 'Bonito piso', imagenUrl: 'https://img/1.jpg',
  images: [{ downloadURL: 'https://img/2.jpg' }], candidatosCount: 0, fianzaMeses: 1,
  propietarioId: 'prop_1', ibanCobro: 'ES999', notasInternas: 'INTERNO', valorAdquisicion: 120000,
} as unknown as Inmueble;

{
  const vm = sanearInmuebleParaInquilino(INMUEBLE_FIX);
  const plano = JSON.stringify(vm);
  assert(
    !plano.includes('INTERNO') && !plano.includes('120000') && !plano.includes('ES999'),
    55, 'Vivienda saneada excluye notas internas y datos patrimoniales/fiscales'
  );
  assert(vm.fotografias.length === 2 && vm.direccion === 'Calle Mayor 1', 56, 'Vivienda saneada conserva dirección y fotos');
}

{
  const hist = construirHistorialInquilino({
    contratos: [CONTRATO_FIX],
    incidencias: [INCIDENCIA_FIX],
    mensajes: [{ id: 'm1', createdAt: '2026-03-01T00:00:00.000Z', remitenteRol: 'GESTION', texto: 'Hola' } as never],
    lecturas: [{ id: 'l1', suministroId: 's1', valor: 100, unidad: 'kWh', fechaLectura: '2026-02-15T00:00:00.000Z' } as never],
    cambios: [],
    suministros: [{ id: 's1' } as never],
    nombreSuministro: () => 'Luz',
  });
  const fechas = hist.map((h) => h.fecha);
  const ordenado = fechas.every((f, i) => i === 0 || fechas[i - 1] >= f);
  const cats = new Set(hist.map((h) => h.categoria));
  assert(ordenado && hist.length === 4, 57, 'Historial ordenado descendente con todas las fuentes');
  assert(cats.has('CONTRATO') && cats.has('INCIDENCIA') && cats.has('MENSAJE') && cats.has('SUMINISTRO'), 58, 'Historial cubre contrato, incidencia, mensaje y suministro');
}

// ------------------------------------------------- I. Reglas (verificación estática)
const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const FIRESTORE_RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const STORAGE_RULES = fs.readFileSync(path.join(ROOT, 'storage.rules'), 'utf8');

assert(
  FIRESTORE_RULES.includes('function isTenant()') && FIRESTORE_RULES.includes('function isStaff()') &&
  FIRESTORE_RULES.includes('function tenantTieneContrato(contratoId)'),
  59, 'firestore.rules incluye helpers E.0 (isTenant/isStaff/tenantTieneContrato)'
);
assert(
  ['E.1. BLOQUE E: MENSAJES', 'E.2. BLOQUE E: SUMINISTROS', 'E.3. BLOQUE E: LECTURAS', 'E.4. BLOQUE E: CAMBIOS']
    .every((s) => FIRESTORE_RULES.includes(s)),
  60, 'firestore.rules incluye secciones E.1–E.4'
);
assert(
  /match \/lecturas_suministro\/\{lecturaId\}[\s\S]*?allow update, delete: if false;/.test(FIRESTORE_RULES),
  61, 'Lecturas inmutables: update/delete denegados en reglas'
);
assert(
  (FIRESTORE_RULES.match(/allow list: if isStaff\(\);/g) || []).length >= 10 &&
  !/match \/(mensajes_portal|suministros|lecturas_suministro|cambios_titular)\/[\s\S]*?allow list: if isSignedIn\(\);/.test(FIRESTORE_RULES),
  62, 'Deny list para inquilino: listados restringidos a isStaff()'
);
assert(
  FIRESTORE_RULES.includes('enlaceInquilinoValido(incoming().enlaceRegistroId, incoming().contratoIds)'),
  63, 'Alta INQUILINO exige invitación válida vinculada al contrato'
);
assert(
  ['E.1. BLOQUE E — EVIDENCIAS', 'E.2. BLOQUE E — FOTOS', 'E.3. BLOQUE E — DOCUMENTOS', 'E.4. BLOQUE E — RECIBOS']
    .every((s) => STORAGE_RULES.includes(s)) && STORAGE_RULES.includes('function esEvidenciaValida()'),
  64, 'storage.rules incluye secciones E.1–E.4 y validación de evidencias'
);

// ---------------------------------------------------------------- resumen
console.log('\n================================================================');
console.log(` RESULTADO BLOQUE E: ${passed} PASS · ${failed} FAIL (${passed + failed} pruebas)`);
console.log('================================================================\n');
if (failed > 0) {
  process.exit(1);
}
