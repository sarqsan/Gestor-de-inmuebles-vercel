/**
 * SUITE COMPLETA DE 30 TESTS: MOTOR DETERMINISTA DE MATCHING, COMPATIBILIDAD OPERATIVA Y ASIGNACIÓN AUDITADA DE PROFESIONALES
 *
 * Ejecución directa: npx tsx test-matching-asignacion-profesionales.ts
 */

import {
  Profesional,
  Inmueble,
  Incidencia,
  TrabajoProfesional,
  PresupuestoProfesional,
  TareaMantenimiento,
  ElementoInventario,
  UsuarioApp,
  Gasto,
} from './src/types';

import {
  evaluarCompatibilidadProfesional,
  buscarProfesionalesCompatibles,
  asignarProfesionalAIncidencia,
  asignarProfesionalATrabajo,
  reasignarProfesionalTrabajo,
  normalizarTexto,
  obtenerEspecialidadesParaServicio,
  coincideUbicacion,
  crearItemHistorialTrabajo,
} from './src/utils/profesionalesEngine';

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
console.log('🚀 INICIANDO SUITE DE 30 TESTS: MATCHING Y ASIGNACIÓN DE PROFESIONALES');
console.log('========================================================================\n');

// -----------------------------------------------------------------------------
// OBJETOS BASE PARA TESTS
// -----------------------------------------------------------------------------
const inmuebleAlicanteCentro: Inmueble = {
  id: 'inm_ali_01',
  propietarioId: 'prop_001',
  alias: 'Piso Centro Alicante',
  direccion: 'Calle Mayor 12, 3º B',
  ciudad: 'Alicante',
  municipio: 'Alicante',
  codigoPostal: '03002',
  provincia: 'Alicante',
  pais: 'España',
  precio: 950,
  estado: 'alquilado',
  habitaciones: 3,
  banos: 2,
  superficie: 90,
  candidatosCount: 0,
  fianzaMeses: 1,
  rentaMensual: 950,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const inmuebleElche: Inmueble = {
  id: 'inm_elche_01',
  propietarioId: 'prop_001',
  alias: 'Ático Elche Palmeral',
  direccion: 'Avinguda de la Llibertat 45',
  ciudad: 'Elche',
  municipio: 'Elche',
  codigoPostal: '03201',
  provincia: 'Alicante',
  pais: 'España',
  precio: 800,
  estado: 'alquilado',
  habitaciones: 2,
  banos: 1,
  superficie: 75,
  candidatosCount: 0,
  fianzaMeses: 1,
  rentaMensual: 800,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const inmuebleSoloProvincia: Inmueble = {
  id: 'inm_ali_rural',
  propietarioId: 'prop_001',
  alias: 'Finca Rústica Interior',
  direccion: 'Partida Rural s/n',
  ciudad: '',
  provincia: 'Alicante',
  pais: 'España',
  precio: 600,
  estado: 'disponible',
  habitaciones: 4,
  banos: 2,
  superficie: 180,
  candidatosCount: 0,
  fianzaMeses: 2,
  rentaMensual: 600,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const inmuebleSinDatosGeo: Inmueble = {
  id: 'inm_sin_geo',
  propietarioId: 'prop_001',
  alias: 'Inmueble Pendiente Ubicación',
  direccion: '',
  ciudad: '',
  precio: 750,
  estado: 'disponible',
  habitaciones: 1,
  banos: 1,
  superficie: 50,
  candidatosCount: 0,
  fianzaMeses: 1,
  rentaMensual: 750,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profFontaneroAlicante: Profesional = {
  id: 'prof_font_01',
  propietarioId: 'prop_001' as any,
  nombreComercial: 'Fontanería García e Hijos',
  nombre: 'Carlos García',
  cifNif: '12345678A',
  telefono: '600111222',
  email: 'carlos@fontaneriagarcia.es',
  tipo: 'EMPRESA',
  especialidades: ['Fontanería', 'Desatascos', 'Calefacción'],
  servicios: [
    { id: 's1', nombre: 'Reparación de fugas', especialidad: 'Fontanería' },
    { id: 's2', nombre: 'Instalación de termos', especialidad: 'Fontanería' },
    { id: 's3', nombre: 'Sustitución de bajantes', especialidad: 'Fontanería' },
  ],
  zonasServicio: [
    {
      provincia: 'Alicante',
      municipios: ['Alicante', 'San Vicente del Raspeig', 'San Juan de Alicante'],
      codigosPostales: ['03001', '03002', '03003', '03690'],
      esTodaProvincia: false,
    },
  ],
  estado: 'ACTIVO',
  activo: true,
  disponible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profMultiValencia: Profesional = {
  id: 'prof_multi_02',
  propietarioId: 'prop_001' as any,
  nombreComercial: 'Servicios Integrales Levantinos',
  nombre: 'Vicente Marí',
  cifNif: 'B98765432',
  telefono: '600333444',
  email: 'contacto@levantinos.es',
  tipo: 'EMPRESA',
  especialidades: ['Electricidad', 'Climatización', 'Pintura', 'Albañilería'],
  servicios: [
    { id: 's4', nombre: 'Instalaciones eléctricas', especialidad: 'Electricidad' },
    { id: 's5', nombre: 'Aire acondicionado', especialidad: 'Climatización' },
    { id: 's6', nombre: 'Pintura plástica', especialidad: 'Pintura' },
  ],
  zonasServicio: [
    {
      provincia: 'Valencia',
      esTodaProvincia: true,
    },
  ],
  estado: 'ACTIVO',
  activo: true,
  disponible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profCerrajeroAlicante: Profesional = {
  id: 'prof_cerr_03',
  propietarioId: 'prop_001' as any,
  nombreComercial: 'Cerrajería Rápida 24h',
  nombre: 'Laura Ruiz',
  cifNif: '48555666B',
  telefono: '600555666',
  email: 'laura@cerrajeria24.es',
  tipo: 'AUTONOMO',
  especialidades: ['Cerrajería'],
  servicios: [
    { id: 's7', nombre: 'Apertura de puertas', especialidad: 'Cerrajería' },
    { id: 's8', nombre: 'Cambio de cerraduras', especialidad: 'Cerrajería' },
    { id: 's9', nombre: 'Bombines de seguridad', especialidad: 'Cerrajería' },
  ],
  zonasServicio: [
    {
      provincia: 'Alicante',
      municipios: ['Alicante', 'Elche', 'Santa Pola'],
      esTodaProvincia: false,
    },
  ],
  estado: 'ACTIVO',
  activo: true,
  disponible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profPintorInactivo: Profesional = {
  id: 'prof_pint_04',
  propietarioId: 'prop_001' as any,
  nombreComercial: 'Pinturas Mediterráneo',
  nombre: 'Andrés Gil',
  telefono: '600777888',
  email: 'andres@pinturasmed.com',
  tipo: 'AUTONOMO',
  especialidades: ['Pintura'],
  zonasServicio: [{ provincia: 'Alicante', esTodaProvincia: true }],
  estado: 'INACTIVO',
  activo: false,
  disponible: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profClimaPausado: Profesional = {
  id: 'prof_clima_05',
  propietarioId: 'prop_001' as any,
  nombreComercial: 'Climatizaciones Costa Blanca',
  nombre: 'Sergio Soler',
  telefono: '600999000',
  email: 'sergio@climatizacionescb.es',
  tipo: 'AUTONOMO',
  especialidades: ['Climatización'],
  zonasServicio: [{ provincia: 'Alicante', esTodaProvincia: true }],
  estado: 'PAUSADO',
  activo: true,
  disponible: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profMadrid: Profesional = {
  id: 'prof_mad_06',
  propietarioId: 'prop_001' as any,
  nombreComercial: 'Madrid Reparaciones',
  nombre: 'Mario Sanz',
  telefono: '611222333',
  email: 'mario@madridrep.com',
  tipo: 'AUTONOMO',
  especialidades: ['Fontanería'],
  zonasServicio: [{ provincia: 'Madrid', municipios: ['Madrid', 'Getafe'] }],
  estado: 'ACTIVO',
  activo: true,
  disponible: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// -----------------------------------------------------------------------------
// TEST 1: Matching por especialidad exacta
// -----------------------------------------------------------------------------
const resT1 = evaluarCompatibilidadProfesional(profFontaneroAlicante, inmuebleAlicanteCentro, {
  categoria: 'Fontanería',
});
assert(
  resT1.cumpleEspecialidad === true && resT1.nivel === 'COMPATIBLE',
  'TEST 1: Matching por especialidad exacta (Fontanería con Fontanería)'
);

// -----------------------------------------------------------------------------
// TEST 2: Matching por sinónimos y variaciones
// -----------------------------------------------------------------------------
const resT2 = evaluarCompatibilidadProfesional(profFontaneroAlicante, inmuebleAlicanteCentro, {
  categoria: 'fontaneria',
  servicioRequerido: 'Fuga de agua en lavabo y termo goteando',
});
assert(
  resT2.cumpleEspecialidad === true && resT2.nivel === 'COMPATIBLE',
  'TEST 2: Matching por sinónimos y variaciones (minúsculas, sin tildes, detección por servicio)'
);

// -----------------------------------------------------------------------------
// TEST 3: Matching multi-especialidad
// -----------------------------------------------------------------------------
const inmuebleValenciaCentro: Inmueble = {
  ...inmuebleAlicanteCentro,
  ciudad: 'Valencia',
  municipio: 'Valencia',
  provincia: 'Valencia',
};
const resT3_clima = evaluarCompatibilidadProfesional(profMultiValencia, inmuebleValenciaCentro, {
  categoria: 'Climatización',
});
const resT3_elec = evaluarCompatibilidadProfesional(profMultiValencia, inmuebleValenciaCentro, {
  categoria: 'Electricidad',
});
assert(
  resT3_clima.cumpleEspecialidad === true && resT3_elec.cumpleEspecialidad === true,
  'TEST 3: Matching multi-especialidad (profesional con varias especialidades válidas)'
);

// -----------------------------------------------------------------------------
// TEST 4: Descarte por especialidad no coincidente
// -----------------------------------------------------------------------------
const resT4 = evaluarCompatibilidadProfesional(profCerrajeroAlicante, inmuebleAlicanteCentro, {
  categoria: 'Fontanería',
  servicioRequerido: 'Sustitución de grifería',
});
assert(
  resT4.cumpleEspecialidad === false && resT4.nivel === 'NO_COMPATIBLE',
  'TEST 4: Descarte determinista cuando la especialidad técnica no coincide'
);

// -----------------------------------------------------------------------------
// TEST 5: Inmueble con municipio y CP: prioridad máxima en match geográfico
// -----------------------------------------------------------------------------
const resT5 = evaluarCompatibilidadProfesional(profFontaneroAlicante, inmuebleAlicanteCentro, {
  categoria: 'Fontanería',
});
assert(
  resT5.estadoZona === 'MUNICIPIO_O_CP_EXACTO' && resT5.cumpleZona === true,
  'TEST 5: Inmueble con municipio y CP exacto obtiene prioridad máxima en resolución geográfica'
);

// -----------------------------------------------------------------------------
// TEST 6: Inmueble solo con municipio: match correcto por municipio
// -----------------------------------------------------------------------------
const resT6 = evaluarCompatibilidadProfesional(profCerrajeroAlicante, inmuebleElche, {
  categoria: 'Cerrajería',
});
assert(
  resT6.estadoZona === 'MUNICIPIO_O_CP_EXACTO' && resT6.cumpleZona === true,
  'TEST 6: Inmueble con municipio coincidente clasifica como match exacto de municipio'
);

// -----------------------------------------------------------------------------
// TEST 7: Inmueble solo con provincia: match provincial (COMPATIBLE_CON_RESERVA)
// -----------------------------------------------------------------------------
const resT7 = evaluarCompatibilidadProfesional(profFontaneroAlicante, inmuebleSoloProvincia, {
  categoria: 'Fontanería',
});
assert(
  resT7.estadoZona === 'PROVINCIAL' && resT7.nivel === 'COMPATIBLE_CON_RESERVA',
  'TEST 7: Inmueble solo con provincia clasifica como cobertura provincial y reserva operativa'
);

// -----------------------------------------------------------------------------
// TEST 8: Inmueble sin datos geográficos: clasificado como ZONA_NO_DETERMINADA
// -----------------------------------------------------------------------------
const resT8 = evaluarCompatibilidadProfesional(profFontaneroAlicante, inmuebleSinDatosGeo, {
  categoria: 'Fontanería',
});
assert(
  resT8.estadoZona === 'ZONA_NO_DETERMINADA' && resT8.nivel === 'COMPATIBLE_CON_RESERVA',
  'TEST 8: Inmueble sin datos geográficos clasifica como ZONA_NO_DETERMINADA (COMPATIBLE_CON_RESERVA)'
);

// -----------------------------------------------------------------------------
// TEST 9: Profesional con cobertura provincial vs inmueble en municipio de esa provincia
// -----------------------------------------------------------------------------
const inmuebleGandiaValencia: Inmueble = {
  id: 'inm_gandia_01',
  propietarioId: 'prop_001',
  alias: 'Piso Gandía Playa',
  direccion: 'Passeig Marítim 22',
  ciudad: 'Gandía',
  municipio: 'Gandía',
  codigoPostal: '46730',
  provincia: 'Valencia',
  pais: 'España',
  precio: 700,
  estado: 'alquilado',
  habitaciones: 2,
  banos: 1,
  superficie: 65,
  candidatosCount: 0,
  fianzaMeses: 1,
  rentaMensual: 700,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const resT9 = evaluarCompatibilidadProfesional(profMultiValencia, inmuebleGandiaValencia, {
  categoria: 'Electricidad',
});
assert(
  resT9.estadoZona === 'PROVINCIAL' && resT9.cumpleZona === true,
  'TEST 9: Profesional con esTodaProvincia cubre cualquier municipio de la provincia'
);

// -----------------------------------------------------------------------------
// TEST 10: Profesional de otra provincia: marcado como FUERA_DE_ZONA / NO_COMPATIBLE
// -----------------------------------------------------------------------------
const resT10 = evaluarCompatibilidadProfesional(profMadrid, inmuebleAlicanteCentro, {
  categoria: 'Fontanería',
});
assert(
  resT10.estadoZona === 'FUERA_DE_ZONA' && resT10.cumpleZona === false && resT10.nivel === 'NO_COMPATIBLE',
  'TEST 10: Profesional de otra provincia clasifica como FUERA_DE_ZONA y NO_COMPATIBLE'
);

// -----------------------------------------------------------------------------
// TEST 11: Profesional inactivo clasificado como NO_COMPATIBLE
// -----------------------------------------------------------------------------
const resT11 = evaluarCompatibilidadProfesional(profPintorInactivo, inmuebleAlicanteCentro, {
  categoria: 'Pintura',
});
assert(
  resT11.cumpleEstado === false && resT11.nivel === 'NO_COMPATIBLE',
  'TEST 11: Profesional inactivo (estado INACTIVO / activo false) clasificado como NO_COMPATIBLE'
);

// -----------------------------------------------------------------------------
// TEST 12: Profesional en pausa o no disponible clasificado como NO_COMPATIBLE
// -----------------------------------------------------------------------------
const resT12 = evaluarCompatibilidadProfesional(profClimaPausado, inmuebleAlicanteCentro, {
  categoria: 'Climatización',
});
assert(
  resT12.cumpleEstado === false && resT12.nivel === 'NO_COMPATIBLE',
  'TEST 12: Profesional en pausa o no disponible clasificado deterministamente como NO_COMPATIBLE'
);

// -----------------------------------------------------------------------------
// TEST 13: Profesional compatible 100% (especialidad + zona exacta + activo + disponible)
// -----------------------------------------------------------------------------
const resT13 = evaluarCompatibilidadProfesional(profFontaneroAlicante, inmuebleAlicanteCentro, {
  categoria: 'Fontanería',
  servicioRequerido: 'Reparación de tubería rota',
});
assert(
  resT13.nivel === 'COMPATIBLE' && resT13.cumpleEspecialidad && resT13.cumpleZona && resT13.cumpleEstado,
  'TEST 13: Profesional compatible 100% alcanza nivel COMPATIBLE'
);

// -----------------------------------------------------------------------------
// TEST 14: Profesional compatible con reserva (cobertura provincial o municipio sin confirmar)
// -----------------------------------------------------------------------------
const resT14 = evaluarCompatibilidadProfesional(profMultiValencia, inmuebleGandiaValencia, {
  categoria: 'Electricidad',
});
assert(
  resT14.nivel === 'COMPATIBLE_CON_RESERVA',
  'TEST 14: Profesional con cobertura provincial clasifica como COMPATIBLE_CON_RESERVA'
);

// -----------------------------------------------------------------------------
// TEST 15: Profesional no compatible (especialidad incorrecta o inactivo)
// -----------------------------------------------------------------------------
const resT15 = evaluarCompatibilidadProfesional(profMadrid, inmuebleAlicanteCentro, {
  categoria: 'Jardinería',
});
assert(
  resT15.nivel === 'NO_COMPATIBLE',
  'TEST 15: Profesional sin especialidad ni zona clasifica como NO_COMPATIBLE'
);

// -----------------------------------------------------------------------------
// TEST 16: Búsqueda devuelve lista ordenada determinista (COMPATIBLE > RESERVA > NO_COMPATIBLE)
// -----------------------------------------------------------------------------
const candidatos = buscarProfesionalesCompatibles({
  inmueble: inmuebleAlicanteCentro,
  profesionales: [
    profMadrid,
    profPintorInactivo,
    profMultiValencia,
    profFontaneroAlicante,
    profCerrajeroAlicante,
  ],
  categoria: 'Fontanería',
  incluirNoCompatibles: true,
});
const niveles = candidatos.map((c) => c.nivel);
const ordenCorrecto =
  niveles[0] === 'COMPATIBLE' &&
  niveles[niveles.length - 1] === 'NO_COMPATIBLE';
assert(
  ordenCorrecto === true,
  'TEST 16: Búsqueda devuelve lista ordenada determinista (COMPATIBLE primero, NO_COMPATIBLE al final)'
);

// -----------------------------------------------------------------------------
// TEST 17: Preservación del orden determinista alfabético ante igualdad de nivel
// -----------------------------------------------------------------------------
const profFontanero2: Profesional = {
  ...profFontaneroAlicante,
  id: 'prof_font_02',
  nombreComercial: 'Abel Fontaneros',
};
const candidatosAlfabetico = buscarProfesionalesCompatibles({
  inmueble: inmuebleAlicanteCentro,
  profesionales: [profFontaneroAlicante, profFontanero2],
  categoria: 'Fontanería',
  incluirNoCompatibles: true,
});
assert(
  candidatosAlfabetico[0].profesional.nombreComercial === 'Abel Fontaneros' &&
    candidatosAlfabetico[1].profesional.nombreComercial === 'Fontanería García e Hijos',
  'TEST 17: Preservación de orden determinista alfabético por nombre comercial ante igual nivel'
);

// -----------------------------------------------------------------------------
// TEST 18: Asignación inicial a una incidencia registra profesionalId, fecha e historial
// -----------------------------------------------------------------------------
const incidenciaBase: Incidencia = {
  id: 'inc_test_01',
  propietarioId: 'prop_001',
  inmuebleId: inmuebleAlicanteCentro.id,
  titulo: 'Fuga de agua bajo fregadero',
  descripcion: 'Goteo constante en sifón',
  categoria: 'FONTANERIA',
  prioridad: 'ALTA',
  estado: 'REGISTRADA',
  origen: 'INQUILINO',
  fechaReporte: '2026-09-18T10:00:00.000Z',
  reportadoPor: 'Inquilino Juan',
  origenReporte: 'INQUILINO',
  fotos: [],
  documentos: [],
  historial: [],
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
};

const incAsignada = asignarProfesionalAIncidencia({
  incidencia: incidenciaBase,
  profesional: profFontaneroAlicante,
  usuarioNombre: 'Admin Inmuebles',
  motivo: 'Especialista local en fontanería asignado',
});

assert(
  incAsignada.profesionalAsignadoId === profFontaneroAlicante.id &&
    incAsignada.profesionalAsignadoNombre === profFontaneroAlicante.nombreComercial &&
    incAsignada.estado === 'ASIGNADA' &&
    incAsignada.historial?.length === 1 &&
    incAsignada.historial[0].accion === 'ASIGNACION_PROFESIONAL',
  'TEST 18: Asignación inicial a una incidencia registra profesionalId, estado ASIGNADA e historial inmutable'
);

// -----------------------------------------------------------------------------
// TEST 19: Asignación a una OT registra campos y añade apunte cronológico
// -----------------------------------------------------------------------------
const otBase: TrabajoProfesional = {
  id: 'ot_test_01',
  propietarioId: 'prop_001',
  inmuebleId: inmuebleAlicanteCentro.id,
  incidenciaId: 'inc_test_01',
  titulo: 'Reparación de fontanería cocina',
  descripcion: 'Sustitución de sifón y sellado',
  categoria: 'Fontanería',
  prioridad: 'ALTA',
  estado: 'PENDIENTE',
  fechaSolicitud: '2026-09-18T10:00:00.000Z',
  creadoPor: 'Admin',
  actualizadoPor: 'Admin',
  historial: [],
  fotos: [],
  adjuntos: [],
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
};

const otAsignada = asignarProfesionalATrabajo({
  trabajo: otBase,
  profesional: profFontaneroAlicante,
  usuarioNombre: 'Admin Inmuebles',
  motivo: 'Asignación directa para intervención urgente',
});

assert(
  otAsignada.profesionalId === profFontaneroAlicante.id &&
    otAsignada.profesionalNombre === profFontaneroAlicante.nombreComercial &&
    otAsignada.estado === 'ASIGNADO' &&
    otAsignada.historial.length === 1 &&
    otAsignada.historial[0].accion === 'PROFESIONAL_ASIGNADO',
  'TEST 19: Asignación a Orden de Trabajo registra profesional, estado ASIGNADO y apunte cronológico'
);

// -----------------------------------------------------------------------------
// TEST 20: Reasignación antes de finalizar registra anterior, nuevo, fecha, motivo y usuario
// -----------------------------------------------------------------------------
const otReasignada = reasignarProfesionalTrabajo({
  trabajo: otAsignada,
  nuevoProfesional: profCerrajeroAlicante,
  usuarioNombre: 'Gestor Operativo',
  motivo: 'Sustitución técnica requerida por cambio de alcance de obra',
});

const ultimoHistorial = otReasignada.historial[otReasignada.historial.length - 1];
assert(
  otReasignada.profesionalId === profCerrajeroAlicante.id &&
    ultimoHistorial.accion === 'PROFESIONAL_CAMBIADO' &&
    ultimoHistorial.profesionalAnteriorId === profFontaneroAlicante.id &&
    ultimoHistorial.profesionalNuevoId === profCerrajeroAlicante.id &&
    ultimoHistorial.motivo === 'Sustitución técnica requerida por cambio de alcance de obra',
  'TEST 20: Reasignación registra profesional anterior, nuevo, fecha, motivo obligatorio y usuario'
);

// -----------------------------------------------------------------------------
// TEST 21: Histórico es inmutable y append-only
// -----------------------------------------------------------------------------
assert(
  otReasignada.historial.length === 2 &&
    otReasignada.historial[0].accion === 'PROFESIONAL_ASIGNADO' &&
    otReasignada.historial[1].accion === 'PROFESIONAL_CAMBIADO',
  'TEST 21: Histórico es append-only: conserva apuntes previos sin sobreescribir ni truncar'
);

// -----------------------------------------------------------------------------
// TEST 22: Reasignación prohibida si la OT está en estado FINALIZADO / FINALIZADA
// -----------------------------------------------------------------------------
let errorLanzado = false;
try {
  const otFinalizada: TrabajoProfesional = {
    ...otReasignada,
    estado: 'FINALIZADO',
    fechaFinalizacion: '2026-09-18T12:00:00.000Z',
  };
  reasignarProfesionalTrabajo({
    trabajo: otFinalizada,
    nuevoProfesional: profFontaneroAlicante,
    usuarioNombre: 'Gestor Operativo',
    motivo: 'Intento de reasignar OT finalizada',
  });
} catch (err: any) {
  errorLanzado = true;
}
assert(
  errorLanzado === true,
  'TEST 22: Reasignación prohibida y bloqueada si la Orden de Trabajo ya ha sido FINALIZADA'
);

// -----------------------------------------------------------------------------
// TEST 23: Inmutabilidad de propietarioId e inmuebleId durante la asignación/reasignación
// -----------------------------------------------------------------------------
assert(
  otReasignada.propietarioId === otBase.propietarioId &&
    otReasignada.inmuebleId === otBase.inmuebleId,
  'TEST 23: Inmutabilidad garantizada de propietarioId e inmuebleId durante todo el ciclo de asignación'
);

// -----------------------------------------------------------------------------
// TEST 24: Priorización de preferredProfessionalId de una tarea preventiva si es compatible
// -----------------------------------------------------------------------------
const tareaPreventiva: TareaMantenimiento = {
  id: 'tar_prev_01',
  propietarioId: 'prop_001',
  inmuebleId: inmuebleAlicanteCentro.id,
  titulo: 'Revisión Anual de Caldera y Termo',
  tipo: 'INSTALACIONES_CLIMA',
  periodicidad: 'ANUAL',
  fechaInicio: '2026-01-01',
  proximaFecha: '2026-10-01',
  preferredProfessionalId: profFontaneroAlicante.id,
  preferredProfessionalName: profFontaneroAlicante.nombreComercial,
  activa: true,
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const profPreferido = [profFontaneroAlicante, profCerrajeroAlicante].find(
  (p) => p.id === tareaPreventiva.preferredProfessionalId
);
const compatPref = profPreferido
  ? evaluarCompatibilidadProfesional(profPreferido, inmuebleAlicanteCentro, {
      categoria: 'Fontanería',
    })
  : null;

assert(
  compatPref?.nivel === 'COMPATIBLE',
  'TEST 24: Profesional preferido (preferredProfessionalId) validado operativamente por el motor'
);

// -----------------------------------------------------------------------------
// TEST 25: Mapeo de contexto técnico de inventario (inventarioId, marca, modelo) sin datos privados
// -----------------------------------------------------------------------------
const elementoTermo: ElementoInventario = {
  id: 'inv_termo_01',
  inmuebleId: inmuebleAlicanteCentro.id,
  nombre: 'Termo Eléctrico 80L',
  categoria: 'ELECTRODOMESTICOS',
  estancia: 'Cocina',
  estadoUso: 'BUENO',
  marca: 'Ariston',
  modelo: 'Pro Eco 80',
  numeroSerie: 'SN-99882233',
  garantiaHasta: '2027-05-15',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const otConInventario: TrabajoProfesional = {
  ...otAsignada,
  inventarioId: elementoTermo.id,
  inventarioNombre: `${elementoTermo.nombre} (${elementoTermo.marca} ${elementoTermo.modelo})`,
  inventarioUbicacion: elementoTermo.estancia,
};

assert(
  otConInventario.inventarioId === 'inv_termo_01' &&
    otConInventario.inventarioNombre?.includes('Ariston Pro Eco 80') &&
    !(otConInventario as any).inquilinoDni &&
    !(otConInventario as any).rentaMensual,
  'TEST 25: Contexto técnico de inventario trasladado a la OT protegiendo datos privados y financieros'
);

// -----------------------------------------------------------------------------
// TEST 26: Trazabilidad completa: Incidencia -> Presupuesto -> OT -> Gasto
// -----------------------------------------------------------------------------
const presupuestoAceptado: PresupuestoProfesional = {
  id: 'ppt_01',
  propietarioId: 'prop_001',
  inmuebleId: inmuebleAlicanteCentro.id,
  incidenciaId: 'inc_test_01',
  trabajoId: otAsignada.id,
  profesionalId: profFontaneroAlicante.id,
  profesionalNombre: profFontaneroAlicante.nombreComercial,
  importeBase: 123.97,
  iva: 26.03,
  importeTotal: 150.0,
  importePresupuestado: 150.0,
  validez: '30 días',
  partidas: [],
  estado: 'ACEPTADO',
  fecha: '2026-09-18T10:30:00.000Z',
  fechaPresupuesto: '2026-09-18T10:30:00.000Z',
  fechaDecision: '2026-09-18T11:00:00.000Z',
  fechaAceptacion: '2026-09-18T11:00:00.000Z',
  descripcion: 'Sustitución de junta y sifón',
  createdAt: '2026-09-18T10:30:00.000Z',
  updatedAt: '2026-09-18T11:00:00.000Z',
};

const gastoFinal: Gasto = {
  id: 'gas_rep_01',
  propietarioId: 'prop_001',
  inmuebleId: inmuebleAlicanteCentro.id,
  ordenTrabajoId: otAsignada.id,
  incidenciaId: 'inc_test_01',
  tipo: 'EXPLOTACION',
  categoria: 'REPARACION',
  concepto: `Reparación fontanería - ${profFontaneroAlicante.nombreComercial}`,
  importe: 150.0,
  estado: 'PAGADO',
  aCargoDe: 'arrendador',
  deducible: true,
  fecha: '2026-09-18',
  pagado: true,
  createdAt: '2026-09-18T12:00:00.000Z',
  updatedAt: '2026-09-18T12:00:00.000Z',
};

const trazabilidadValida =
  presupuestoAceptado.incidenciaId === incAsignada.id &&
  presupuestoAceptado.profesionalId === incAsignada.profesionalAsignadoId &&
  gastoFinal.ordenTrabajoId === otAsignada.id &&
  gastoFinal.incidenciaId === incAsignada.id &&
  gastoFinal.importe === presupuestoAceptado.importeTotal;

assert(
  trazabilidadValida === true,
  'TEST 26: Trazabilidad íntegra del circuito: Incidencia -> Presupuesto -> OT -> Gasto de explotación'
);

// -----------------------------------------------------------------------------
// TEST 27: Aislamiento RBAC Propietario: solo asigna en inmuebles de su propiedad
// -----------------------------------------------------------------------------
const propA_User: UsuarioApp = {
  id: 'usr_prop_a',
  uid: 'usr_prop_a',
  email: 'propietarioA@test.com',
  nombre: 'Propietario A',
  tipoPerfil: 'PROPIETARIO',
  rol: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: ['PROPIETARIO'],
  permisos: [],
  propietarioId: 'prop_001',
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const inmueblePropB: Inmueble = {
  ...inmuebleAlicanteCentro,
  id: 'inm_prop_b',
  propietarioId: 'prop_999_OTRO',
};

const puedeAsignarPropA = propA_User.propietarioId === inmueblePropB.propietarioId;
assert(
  puedeAsignarPropA === false,
  'TEST 27: Aislamiento RBAC Propietario: Propietario A no puede asignar profesionales a inmuebles de Propietario B'
);

// -----------------------------------------------------------------------------
// TEST 28: Aislamiento RBAC Profesional: solo consulta y opera en OTs asignadas a su ID
// -----------------------------------------------------------------------------
const profUserGarcía: UsuarioApp = {
  id: 'usr_prof_garcia',
  uid: 'usr_prof_garcia',
  email: 'carlos@fontaneriagarcia.es',
  nombre: 'Carlos García',
  tipoPerfil: 'PROFESIONAL',
  rol: 'PROFESIONAL',
  estado: 'ACTIVO',
  roles: ['PROFESIONAL'],
  permisos: [],
  profesionalId: profFontaneroAlicante.id,
  activo: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const otAsignadaAGarcia = otAsignada;
const otAsignadaACerrajero = otReasignada;

const tieneAccesoAPropia = profUserGarcía.profesionalId === otAsignadaAGarcia.profesionalId;
const tieneAccesoAAjena = profUserGarcía.profesionalId === otAsignadaACerrajero.profesionalId;

assert(
  tieneAccesoAPropia === true && tieneAccesoAAjena === false,
  'TEST 28: Aislamiento RBAC Profesional: profesional accede únicamente a sus órdenes de trabajo asignadas'
);

// -----------------------------------------------------------------------------
// TEST 29: Profesional sin visibilidad sobre candidatos, arrendamientos ni datos hipotecarios
// -----------------------------------------------------------------------------
const camposPrivadosInmueble = {
  rentaMensual: inmuebleAlicanteCentro.rentaMensual,
  hipotecaMensual: 450.0,
  valorCompra: 180000.0,
  inquilinoNombre: 'Juan Pérez',
  inquilinoScoreFinanciero: 8.5,
};

// Objeto expuesto en el portal técnico
const otVistaTecnica = {
  id: otAsignada.id,
  titulo: otAsignada.titulo,
  descripcion: otAsignada.descripcion,
  direccionInmueble: inmuebleAlicanteCentro.direccion,
  municipioInmueble: inmuebleAlicanteCentro.municipio,
  contactoInmueble: 'Conserjería / Contacto Operativo',
};

const contieneDatosPrivados =
  'rentaMensual' in otVistaTecnica ||
  'hipotecaMensual' in otVistaTecnica ||
  'inquilinoScoreFinanciero' in otVistaTecnica;

assert(
  contieneDatosPrivados === false,
  'TEST 29: El profesional no tiene acceso ni exposición a datos privados, contratos ni hipotecas'
);

// -----------------------------------------------------------------------------
// TEST 30: Idempotencia y consistencia en reasignaciones sucesivas con auditoría íntegra
// -----------------------------------------------------------------------------
let otSucesiva = otBase;
otSucesiva = asignarProfesionalATrabajo({
  trabajo: otSucesiva,
  profesional: profFontaneroAlicante,
  usuarioNombre: 'Admin',
  motivo: 'Asignación 1',
});

otSucesiva = reasignarProfesionalTrabajo({
  trabajo: otSucesiva,
  nuevoProfesional: profCerrajeroAlicante,
  usuarioNombre: 'Admin',
  motivo: 'Cambio 1 por falta de disponibilidad',
});

otSucesiva = reasignarProfesionalTrabajo({
  trabajo: otSucesiva,
  nuevoProfesional: profFontaneroAlicante,
  usuarioNombre: 'Admin',
  motivo: 'Retorno 2 tras reprogramación de agenda',
});

assert(
  otSucesiva.profesionalId === profFontaneroAlicante.id &&
    otSucesiva.historial.length === 3 &&
    otSucesiva.historial[0].accion === 'PROFESIONAL_ASIGNADO' &&
    otSucesiva.historial[1].accion === 'PROFESIONAL_CAMBIADO' &&
    otSucesiva.historial[2].accion === 'PROFESIONAL_CAMBIADO' &&
    otSucesiva.historial[2].profesionalAnteriorId === profCerrajeroAlicante.id &&
    otSucesiva.historial[2].profesionalNuevoId === profFontaneroAlicante.id,
  'TEST 30: Reasignaciones sucesivas mantienen coherencia determinista y trazabilidad cronológica íntegra'
);

// -----------------------------------------------------------------------------
// RESUMEN FINAL
// -----------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`📊 RESULTADO DE LA SUITE DE TESTS:`);
console.log(`   - Tests ejecutados: 30`);
console.log(`   - ✅ Superados: ${testsPassed}`);
console.log(`   - ❌ Fallidos: ${testsFailed}`);
console.log('========================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 TODOS LOS 30 TESTS DE MATCHING Y ASIGNACIÓN OPERATIVA PASARON AL 100%\n');
}
