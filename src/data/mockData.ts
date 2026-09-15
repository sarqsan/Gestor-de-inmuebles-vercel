import {
  Candidato,
  Inmueble,
  Propietario,
  UserProfile,
  SolicitudAlquiler,
  InvitacionVisita,
  VisitSlot,
  SolicitudDocumentacion,
  ContratoFormalizacion,
  ConfiguracionAseguradora,
  SolicitudSeguroImpago,
  GmailIntegracionConfig,
} from '../types';

export const INITIAL_PROPIETARIOS: Propietario[] = [];

export const INITIAL_INMUEBLES: Inmueble[] = [];

export const INITIAL_CANDIDATOS: Candidato[] = [];

export const INITIAL_USER_PROFILE: UserProfile = {
  nombre: 'Propietario',
  email: 'propietario@email.com',
  telefono: '+34 600 000 000',
  empresa: 'RentSelect Gestión',
  notificacionesEmail: true,
  ratioSolvenciaMaximo: 35,
};

export const INITIAL_SOLICITUDES: SolicitudAlquiler[] = [];

export const INITIAL_INVITACIONES: InvitacionVisita[] = [];

export const INITIAL_VISIT_SLOTS: VisitSlot[] = [];

export const INITIAL_SOLICITUDES_DOC: SolicitudDocumentacion[] = [];

export const INITIAL_CONTRATOS: ContratoFormalizacion[] = [];

export const INITIAL_ASEGURADORAS: ConfiguracionAseguradora[] = [
  {
    id: 'seag',
    nombre: 'SEAG (Sociedad Española de Alquiler Garantizado)',
    nombreComercial: 'SEAG Garantía Total Alquiler',
    emailTramitacion: 'estudios@seag.es',
    activa: true,
    ratioEsfuerzoMaximo: 45,
    antiguedadMinimaMeses: 3,
    documentosRequeridos: ['dni_nie', 'nomina', 'vida_laboral'],
    tasaPrimaAnualPorcentaje: 4.5,
    mesesCoberturaImpago: 12,
    tiempoMedioRespuestaHoras: 2,
    coberturasSugeridas: {
      mesesImpago: 12,
      defensaJuridicaEuros: 3000,
      actosVandalicosEuros: 3000,
    },
    instruccionesEnvio: 'Sociedad Española de Alquiler Garantizado (SEAG). Garantía de cobro puntual el día 1 de cada mes y protección jurídica integral. Adjuntar DNI/NIE en vigor y 2 últimas nóminas (o trimestres IRPF para autónomos). Permite sumar ingresos de cotitulares.',
    formatoAsuntoEmail: '[REF-IMPAGO] Solicitud Estudio SEAG - Inmueble {inmueble} - Inquilino {candidato}',
  },
  {
    id: 'arag',
    nombre: 'ARAG Seguros',
    nombreComercial: 'ARAG Alquiler Protección',
    emailTramitacion: 'estudios.alquiler@arag.es',
    activa: true,
    ratioEsfuerzoMaximo: 40,
    antiguedadMinimaMeses: 6,
    documentosRequeridos: ['dni_nie', 'nomina', 'contrato', 'vida_laboral'],
    tasaPrimaAnualPorcentaje: 4.25,
    mesesCoberturaImpago: 12,
    tiempoMedioRespuestaHoras: 24,
    coberturasSugeridas: {
      mesesImpago: 12,
      defensaJuridicaEuros: 3000,
      actosVandalicosEuros: 3000,
    },
    instruccionesEnvio: 'Adjuntar DNI por ambas caras y últimas 2 nóminas (3 si salario variable) y contrato.',
    formatoAsuntoEmail: '[REF-IMPAGO] Solicitud Estudio ARAG - Inmueble {inmueble} - Inquilino {candidato}',
  },
  {
    id: 'caser',
    nombre: 'Caser Seguros',
    nombreComercial: 'Caser Protección Alquiler',
    emailTramitacion: 'estudios.impago@caser.es',
    activa: true,
    ratioEsfuerzoMaximo: 38,
    antiguedadMinimaMeses: 12,
    documentosRequeridos: ['dni_nie', 'nomina', 'contrato'],
    tasaPrimaAnualPorcentaje: 4.5,
    mesesCoberturaImpago: 12,
    tiempoMedioRespuestaHoras: 24,
    coberturasSugeridas: {
      mesesImpago: 12,
      defensaJuridicaEuros: 3000,
      actosVandalicosEuros: 3000,
    },
    instruccionesEnvio: 'Estudio de solvencia directo para contratos indefinidos con más de 1 año de antigüedad.',
    formatoAsuntoEmail: '[REF-IMPAGO] Expediente Caser - Inmueble {inmueble} - {candidato}',
  },
  {
    id: 'mutua_propietarios',
    nombre: 'Mutua de Propietarios',
    nombreComercial: 'Seguro Impago Alquiler Mutua',
    emailTramitacion: 'tramitacion.alquiler@mutuadepropietarios.es',
    activa: true,
    ratioEsfuerzoMaximo: 40,
    antiguedadMinimaMeses: 6,
    documentosRequeridos: ['dni_nie', 'nomina', 'vida_laboral'],
    tasaPrimaAnualPorcentaje: 4.0,
    mesesCoberturaImpago: 12,
    tiempoMedioRespuestaHoras: 48,
    coberturasSugeridas: {
      mesesImpago: 12,
      defensaJuridicaEuros: 3500,
      actosVandalicosEuros: 3000,
    },
    instruccionesEnvio: 'Permite cómputo de 2 cotitulares y avalistas familiares directos.',
    formatoAsuntoEmail: '[REF-IMPAGO] Estudio Solvencia Mutua - {inmueble} - {candidato}',
  },
  {
    id: 'das',
    nombre: 'DAS Seguros',
    nombreComercial: 'DAS Defensa del Arrendador',
    emailTramitacion: 'estudios@das.es',
    activa: true,
    ratioEsfuerzoMaximo: 35,
    antiguedadMinimaMeses: 12,
    documentosRequeridos: ['dni_nie', 'nomina', 'contrato', 'vida_laboral'],
    tasaPrimaAnualPorcentaje: 4.8,
    mesesCoberturaImpago: 12,
    tiempoMedioRespuestaHoras: 24,
    coberturasSugeridas: {
      mesesImpago: 12,
      defensaJuridicaEuros: 4000,
      actosVandalicosEuros: 4000,
    },
    instruccionesEnvio: 'Incluye amplia cobertura jurídica y reclamación de suministros impagados.',
    formatoAsuntoEmail: '[REF-IMPAGO] Solicitud DAS - {inmueble} - {candidato}',
  },
];

export const INITIAL_SOLICITUDES_SEGURO: SolicitudSeguroImpago[] = [];

export const INITIAL_GMAIL_CONFIG: GmailIntegracionConfig = {
  conectado: true,
  emailConectado: 'sarqsan2@gmail.com',
  nombreTitular: 'Usuario RentSelect',
  autoProcesarRespuestas: true,
};
