/**
 * P0.1 — Estados iniciales de la interfaz, SIN datos de demostración por defecto.
 * ===========================================================================
 * `App.tsx` y `firebase.ts` inicializaban sus estados con `INITIAL_*` de
 * `mockData.ts` (o con caché localStorage). Eso hacía que, antes de que
 * llegara el primer snapshot de Firestore —o si la lectura era denegada—,
 * la pantalla mostrara propietarios, inmuebles, candidatos y una cuenta de
 * Gmail "conectada" que no existían. Además `subscribeAseguradoras` escribía
 * una aseguradora SEAG en Firestore como efecto colateral de una lectura.
 *
 * Ahora todo dato de demo pasa por `datosDemoHabilitados()` (flag
 * `VITE_DEMO_DATA`). Sin el flag, los estados arrancan VACÍOS y no se escribe
 * nada. Los datos reales llegan por las suscripciones existentes.
 *
 * El perfil de usuario y la configuración de Gmail no son listas: se
 * devuelven valores neutros (sin correo personal, sin conexión fingida).
 */
import type {
  Candidato,
  ConfiguracionAseguradora,
  ContratoFormalizacion,
  GmailIntegracionConfig,
  Inmueble,
  InvitacionVisita,
  Propietario,
  SolicitudAlquiler,
  SolicitudDocumentacion,
  SolicitudSeguroImpago,
  UserProfile,
  VisitSlot,
} from '../types';
import { datosDemoHabilitados } from '../lib/flags';
import {
  INITIAL_ASEGURADORAS,
  INITIAL_CANDIDATOS,
  INITIAL_CONTRATOS,
  INITIAL_GMAIL_CONFIG,
  INITIAL_INMUEBLES,
  INITIAL_INVITACIONES,
  INITIAL_PROPIETARIOS,
  INITIAL_SOLICITUDES,
  INITIAL_SOLICITUDES_DOC,
  INITIAL_SOLICITUDES_SEGURO,
  INITIAL_USER_PROFILE,
  INITIAL_VISIT_SLOTS,
} from './mockData';

/** Valor neutro: NADA conectado y ningún correo personal. */
export const GMAIL_CONFIG_VACIO: GmailIntegracionConfig = {
  conectado: false,
  emailConectado: '',
  nombreTitular: undefined,
  tokenExpira: undefined,
  ultimoSondeo: undefined,
  autoProcesarRespuestas: false,
};

/** Valor neutro para el formulario de Configuración. */
export const PERFIL_USUARIO_VACIO: UserProfile = {
  nombre: '',
  email: '',
  telefono: '',
  empresa: '',
  notificacionesEmail: false,
  ratioSolvenciaMaximo: 35,
};

function demo<T>(valorDemo: T, valorVacio: T): T {
  return datosDemoHabilitados() ? valorDemo : valorVacio;
}

export const inicialPropietarios = (): Propietario[] => demo(INITIAL_PROPIETARIOS, []);
export const inicialCandidatos = (): Candidato[] => demo(INITIAL_CANDIDATOS, []);
export const inicialInmuebles = (): Inmueble[] => demo(INITIAL_INMUEBLES, []);
export const inicialSolicitudes = (): SolicitudAlquiler[] => demo(INITIAL_SOLICITUDES, []);
export const inicialInvitaciones = (): InvitacionVisita[] => demo(INITIAL_INVITACIONES, []);
export const inicialSlots = (): VisitSlot[] => demo(INITIAL_VISIT_SLOTS, []);
export const inicialSolicitudesDoc = (): SolicitudDocumentacion[] => demo(INITIAL_SOLICITUDES_DOC, []);
export const inicialContratos = (): ContratoFormalizacion[] => demo(INITIAL_CONTRATOS, []);
export const inicialAseguradoras = (): ConfiguracionAseguradora[] => demo(INITIAL_ASEGURADORAS, []);
export const inicialSolicitudesSeguro = (): SolicitudSeguroImpago[] => demo(INITIAL_SOLICITUDES_SEGURO, []);
export const inicialGmailConfig = (): GmailIntegracionConfig => demo(INITIAL_GMAIL_CONFIG, GMAIL_CONFIG_VACIO);
export const inicialPerfilUsuario = (): UserProfile => demo(INITIAL_USER_PROFILE, PERFIL_USUARIO_VACIO);
