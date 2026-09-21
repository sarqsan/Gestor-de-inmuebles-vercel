/**
 * BLOQUE E — Fixtures SINTÉTICAS de la batería automatizada (ORDEN 8).
 *
 * Dos contextos de inquilino completamente separados:
 *   TENANT_TEST_A → contrato ct_TEST_A → inmueble inm_TEST_A → suministro sum_TEST_A
 *   TENANT_TEST_B → contrato ct_TEST_B → inmueble inm_TEST_B → suministro sum_TEST_B
 * Todos los identificadores llevan `TEST` y ningún dato corresponde a personas,
 * inmuebles ni contratos reales.
 */
import type {
  ContratoFormalizacion,
  EnlaceRegistro,
  Incidencia,
  Inmueble,
  LecturaSuministro,
  MensajePortal,
  Suministro,
  UsuarioApp,
} from '../../types';
import type { Acta } from '../../types/actas';
import { memoria } from './firestoreMemoria';

export const IDS = {
  A: {
    uid: 'uid_TEST_TENANT_A',
    contrato: 'ct_TEST_A',
    inmueble: 'inm_TEST_A',
    suministro: 'sum_TEST_A',
    lectura: 'lec_TEST_A_1',
    mensaje: 'msg_TEST_A_1',
    incidencia: 'inc_TEST_A_1',
    acta: 'acta_TEST_A_1',
    enlace: 'enl_inq_TEST_A',
  },
  B: {
    uid: 'uid_TEST_TENANT_B',
    contrato: 'ct_TEST_B',
    inmueble: 'inm_TEST_B',
    suministro: 'sum_TEST_B',
    lectura: 'lec_TEST_B_1',
    mensaje: 'msg_TEST_B_1',
    incidencia: 'inc_TEST_B_1',
    acta: 'acta_TEST_B_1',
    enlace: 'enl_inq_TEST_B',
  },
} as const;

type Letra = 'A' | 'B';

const SECRETOS: Record<Letra, { dniPropietario: string; notasPrivadas: string; notasInternas: string; telefonoProfesional: string }> = {
  A: { dniPropietario: 'DNI_PRIVADO_PROP_TEST_A', notasPrivadas: 'NOTA_PRIVADA_CONTRATO_TEST_A', notasInternas: 'NOTA_INTERNA_INMUEBLE_TEST_A', telefonoProfesional: 'TEL_PRIVADO_PROF_TEST_A' },
  B: { dniPropietario: 'DNI_PRIVADO_PROP_TEST_B', notasPrivadas: 'NOTA_PRIVADA_CONTRATO_TEST_B', notasInternas: 'NOTA_INTERNA_INMUEBLE_TEST_B', telefonoProfesional: 'TEL_PRIVADO_PROF_TEST_B' },
};

export function secretosDe(l: Letra) {
  return SECRETOS[l];
}

export function contratoTest(l: Letra, extra: Partial<ContratoFormalizacion> = {}): ContratoFormalizacion {
  const ids = IDS[l];
  return {
    id: ids.contrato,
    inmuebleId: ids.inmueble,
    inmuebleNombre: `Piso TEST ${l}`,
    inmuebleDireccion: `Calle Test ${l}, 1`,
    inmuebleCiudad: 'Ciudad Test',
    propietarioId: `prop_TEST_${l}`,
    propietarioNombre: `Propietario Test ${l}`,
    propietarioDni: SECRETOS[l].dniPropietario,
    propietarioDireccion: `Dirección privada propietario ${l}`,
    propietarioTelefono: `600TEST${l}`,
    propietarioEmail: `prop.test.${l.toLowerCase()}@test.invalid`,
    propietarioIban: `ES00TEST${l}000000000000000`,
    tieneSegundoPropietario: false,
    candidatoNombre: `Inquilino Test ${l}`,
    candidatoTelefono: `611TEST${l}`,
    candidatoEmail: `inq.test.${l.toLowerCase()}@test.invalid`,
    tieneCotitular: false,
    tieneAvalista: false,
    rentaMensual: l === 'A' ? 700 : 950,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: l === 'A' ? 700 : 950,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    fechaInicioContrato: '2026-01-01',
    duracionAnios: 1,
    diaLimitePagoMes: 5,
    permitirMascotas: false,
    permitirSubarriendo: false,
    incluyeMueblesInventario: false,
    gastosComunidadCargo: 'arrendatario',
    ibiCargo: 'arrendador',
    suministrosCargo: 'arrendatario',
    clausulaDesistimientoAnticipado: true,
    clausulasPersonalizadas: [],
    estado: 'VIGENTE',
    firmaArrendador: { firmado: true, fecha: '2026-01-01', firmanteNombre: `Propietario Test ${l}` },
    firmaArrendatario: { firmado: true, fecha: '2026-01-01' },
    fechaCreacion: '2025-12-20',
    fechaActualizacion: '2025-12-20',
    notasPrivadas: SECRETOS[l].notasPrivadas,
    historial: [],
    registroCobros: [],
    incidenciaIds: [],
    mensajeIds: [],
    ...extra,
  } as unknown as ContratoFormalizacion;
}

export function inmuebleTest(l: Letra, extra: Partial<Inmueble> = {}): Inmueble {
  const ids = IDS[l];
  return {
    id: ids.inmueble,
    direccion: `Calle Test ${l}, 1`,
    ciudad: 'Ciudad Test',
    precio: l === 'A' ? 700 : 950,
    estado: 'alquilado',
    habitaciones: 2,
    banos: 1,
    superficie: 70,
    descripcion: `Inmueble sintético ${l}`,
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: `prop_TEST_${l}`,
    notasInternas: SECRETOS[l].notasInternas,
    valorAdquisicion: 100000,
    contratoActivoId: ids.contrato,
    suministroIds: [ids.suministro],
    contratoIdsAutorizados: [ids.contrato],
    ...extra,
  } as unknown as Inmueble;
}

export function suministroTest(l: Letra, extra: Partial<Suministro> = {}): Suministro {
  const ids = IDS[l];
  return {
    id: ids.suministro,
    inmuebleId: ids.inmueble,
    tipo: 'LUZ',
    cups: `ES0031TEST${l}000000000000`,
    comercializadora: `Comercializadora Test ${l}`,
    modoReparto: 'SIN_REPARTO',
    activo: true,
    contratoIdsAutorizados: [ids.contrato],
    lecturaIds: [ids.lectura],
    cambioTitularIds: [],
    fechaAlta: '2026-01-02T00:00:00.000Z',
    fechaActualizacion: '2026-01-02T00:00:00.000Z',
    ...extra,
  };
}

export function lecturaTest(l: Letra, extra: Partial<LecturaSuministro> = {}): LecturaSuministro {
  const ids = IDS[l];
  return {
    id: ids.lectura,
    suministroId: ids.suministro,
    inmuebleId: ids.inmueble,
    contratoId: ids.contrato,
    valor: l === 'A' ? 1000 : 5000,
    unidad: 'kWh',
    fechaLectura: '2026-01-15T12:00:00.000Z',
    origen: 'ADMIN',
    createdAt: '2026-01-15T12:00:00.000Z',
    ...extra,
  };
}

export function mensajeTest(l: Letra, extra: Partial<MensajePortal> = {}): MensajePortal {
  const ids = IDS[l];
  return {
    id: ids.mensaje,
    contratoId: ids.contrato,
    inmuebleId: ids.inmueble,
    remitenteUid: 'uid_TEST_GESTION',
    remitenteNombre: 'Gestión Test',
    remitenteRol: 'GESTION',
    texto: `MENSAJE_PRIVADO_TENANT_${l}`,
    leidoPorGestion: true,
    leidoPorInquilino: false,
    createdAt: '2026-02-01T10:00:00.000Z',
    ...extra,
  };
}

export function incidenciaTest(l: Letra, extra: Partial<Incidencia> = {}): Incidencia {
  const ids = IDS[l];
  return {
    id: ids.incidencia,
    inmuebleId: ids.inmueble,
    contratoId: ids.contrato,
    propietarioId: `prop_TEST_${l}`,
    titulo: `INCIDENCIA_TENANT_${l}`,
    descripcion: `Descripción sintética de la incidencia del inquilino ${l}`,
    categoria: 'AGUA',
    prioridad: 'MEDIA',
    estado: 'ABIERTA',
    origen: 'INQUILINO',
    fechaCreacion: '2026-02-03T09:00:00.000Z',
    fechaActualizacion: '2026-02-03T09:00:00.000Z',
    trabajoProfesional: {
      profesionalId: `prof_TEST_${l}`,
      profesionalNombre: `Profesional Test ${l}`,
      profesionalTelefono: SECRETOS[l].telefonoProfesional,
      servicio: 'Revisión',
      fechaAsignacion: '2026-02-04',
      presupuestoEstimado: 100,
      costeReal: 123.45,
      facturaNumero: `FACTURA_PRIVADA_${l}`,
      estadoTrabajo: 'EN_CURSO',
    },
    historial: [],
    fotografias: [],
    documentos: [],
    ...extra,
  } as unknown as Incidencia;
}

export function actaTest(l: Letra, extra: Partial<Acta> = {}): Acta {
  const ids = IDS[l];
  return {
    id: ids.acta,
    ownerId: `prop_TEST_${l}`,
    propertyId: ids.inmueble,
    contractId: ids.contrato,
    tipo: 'ENTRADA',
    estado: 'FIRMADA',
    version: 1,
    fechaCreacion: '2026-01-01T10:00:00.000Z',
    fechaActualizacion: '2026-01-01T10:00:00.000Z',
    fechaActo: '2026-01-01',
    participantes: [
      { id: 'p1', nombre: `Propietario Test ${l}`, rol: 'ARRENDADOR', dni: SECRETOS[l].dniPropietario, firmaRequerida: true, haFirmado: true },
      { id: 'p2', nombre: `Inquilino Test ${l}`, rol: 'ARRENDATARIO', firmaRequerida: true, haFirmado: true },
    ],
    inventario: [],
    lecturasContadores: [],
    evidenciaIds: [],
    incidenciaIds: [],
    firmas: [],
    estadoFirma: 'FIRMADA',
    historial: [],
    creadoPor: 'gestor.test@test.invalid',
    notasInternas: `NOTA_INTERNA_ACTA_${l}`,
    ...extra,
  } as Acta;
}

export function usuarioInquilinoTest(l: Letra, extra: Partial<UsuarioApp> = {}): UsuarioApp {
  const ids = IDS[l];
  return {
    id: ids.uid,
    authUid: ids.uid,
    nombre: `Inquilino`,
    apellidos: `Test ${l}`,
    email: `inq.test.${l.toLowerCase()}@test.invalid`,
    tipoPerfil: 'INQUILINO',
    estado: 'ACTIVO',
    roles: ['INQUILINO_PORTAL'],
    permisos: ['inmuebles.ver', 'contratos.ver'],
    contratoIds: [ids.contrato],
    enlaceRegistroId: ids.enlace,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...extra,
  };
}

export function usuarioStaffTest(): UsuarioApp {
  return {
    id: 'uid_TEST_STAFF',
    authUid: 'uid_TEST_STAFF',
    nombre: 'Gestor',
    apellidos: 'Test',
    email: 'gestor.test@test.invalid',
    tipoPerfil: 'ADMINISTRADOR',
    estado: 'ACTIVO',
    roles: ['ADMINISTRADOR'],
    permisos: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

export function enlaceTest(l: Letra, extra: Partial<EnlaceRegistro> = {}): EnlaceRegistro {
  const ids = IDS[l];
  return {
    id: ids.enlace,
    token: ids.enlace,
    tipoPerfil: 'INQUILINO',
    textoVisible: 'Accede a tu portal de inquilino',
    activo: true,
    contratoIdVinculado: ids.contrato,
    inmuebleIdVinculado: ids.inmueble,
    usosMaximos: 1,
    usosActuales: 0,
    creadoPor: 'uid_TEST_STAFF',
    createdAt: '2026-01-02T00:00:00.000Z',
    ...extra,
  } as EnlaceRegistro;
}

/** Siembra el universo completo de A y B en la memoria. */
export function sembrarUniverso(): void {
  for (const l of ['A', 'B'] as const) {
    memoria.sembrar('contratos_formalizacion', IDS[l].contrato, contratoTest(l, { incidenciaIds: [IDS[l].incidencia], mensajeIds: [IDS[l].mensaje] }) as unknown as Record<string, unknown>);
    memoria.sembrar('inmuebles', IDS[l].inmueble, inmuebleTest(l) as unknown as Record<string, unknown>);
    memoria.sembrar('suministros', IDS[l].suministro, suministroTest(l) as unknown as Record<string, unknown>);
    memoria.sembrar('lecturas_suministro', IDS[l].lectura, lecturaTest(l) as unknown as Record<string, unknown>);
    memoria.sembrar('mensajes_portal', IDS[l].mensaje, mensajeTest(l) as unknown as Record<string, unknown>);
    memoria.sembrar('incidencias', IDS[l].incidencia, incidenciaTest(l) as unknown as Record<string, unknown>);
    memoria.sembrar('actas', IDS[l].acta, actaTest(l) as unknown as Record<string, unknown>);
    memoria.sembrar('usuarios', IDS[l].uid, usuarioInquilinoTest(l) as unknown as Record<string, unknown>);
    memoria.sembrar('enlaces_registro', IDS[l].enlace, enlaceTest(l) as unknown as Record<string, unknown>);
  }
}
