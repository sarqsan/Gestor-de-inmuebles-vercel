/**
 * BLOQUE 12 · diagnóstico de alcance de `list` por perfil (SOLO LECTURA).
 *
 * Evalúa el TEXTO REAL de `firestore.rules` con el harness compartido del repo y
 * responde, para cada colección y perfil, si ese perfil podría listar un
 * documento PROPIO (el que su consulta acotada devolvería). Es la evidencia que
 * clasifica A-01: donde el perfil no puede listar NI su propio documento, la
 * consulta acotada no existe y la sección no puede funcionar para ese perfil.
 *
 * No escribe nada, no usa datos reales y no sustituye al emulador (INFRA-01).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearEvaluadorReglas, type Peticion } from '../tests/harness/firestoreRulesEval';
import { completarPerfilesSinteticos } from '../tests/harness/perfilesSinteticos';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
const { permite } = crearEvaluadorReglas(RULES);
const EMAIL_MASTER = (RULES.match(/function\s+isMasterAdmin\(\)\s*\{[\s\S]*?'([^'@\s]+@[^'\s]+)'/) || [])[1]!;

const PROP_A = 'prop_A';
const PROP_B = 'prop_B';
const INM_A = { id: 'inm_A', propietarioId: PROP_A, address: 'Calle A' };
const DB: Peticion['db'] = {
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', authUid: 'uid_propA', propietarioId: PROP_A },
  'usuarios/uid_gestor': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', authUid: 'uid_gestor', profesionalId: 'prof_1' },
  'usuarios_auth/uid_admin': { usuarioId: 'uid_admin', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', inmuebleIds: [] },
  'usuarios_auth/uid_propA': { usuarioId: 'uid_propA', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: PROP_A, inmuebleIds: ['inm_A'], profesionalId: '' },
  'usuarios_auth/uid_gestor': { usuarioId: 'uid_gestor', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'prof_1', inmuebleIds: [], carterasL: [PROP_A], carterasE: [PROP_A], gestionesPorPropietario: {} },
  'usuarios_auth/uid_master': { usuarioId: 'uid_master', tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', inmuebleIds: [] },
  'usuarios/uid_master': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_master' },
  'inmuebles/inm_A': INM_A,
  'propietarios/prop_A': { id: PROP_A, nombre: 'Titular A' },
};
completarPerfilesSinteticos(DB);

const AUTH = {
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local', email_verified: true } },
  propA: { uid: 'uid_propA', token: { email: 'prop-a@test.local', email_verified: true } },
  gestor: { uid: 'uid_gestor', token: { email: 'gestor@test.local', email_verified: true } },
  master: { uid: 'uid_master', token: { email: EMAIL_MASTER, email_verified: true } },
} as const;

type Perfil = keyof typeof AUTH;

/** Documento PROPIO de cada perfil: el que devolvería su consulta acotada. */
const DOCS: Record<string, Record<Perfil, Record<string, unknown>>> = {
  incidencias: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A', profesionalAsignadoId: 'prof_1' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  polizas_seguros: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  siniestros: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  tareas_mantenimiento: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  garantias_reparacion: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A', profesionalId: 'prof_1' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  trabajos_profesionales: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A', profesionalId: 'prof_1' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  presupuestos_profesionales: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A', profesionalId: 'prof_1' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  necesidades_reforma: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  proyectos_reforma: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A', profesionalPrincipalId: 'prof_1' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  gastos: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  valoraciones_profesionales: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A', profesionalId: 'prof_1' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  habitaciones_inmueble: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  suministros: {
    admin: { id: 'x', inmuebleId: 'inm_A' },
    propA: { id: 'x', inmuebleId: 'inm_A' },
    gestor: { id: 'x', inmuebleId: 'inm_A' },
    master: { id: 'x', inmuebleId: 'inm_A' },
  },
  lecturas_suministro: {
    admin: { id: 'x', inmuebleId: 'inm_A' },
    propA: { id: 'x', inmuebleId: 'inm_A' },
    gestor: { id: 'x', inmuebleId: 'inm_A' },
    master: { id: 'x', inmuebleId: 'inm_A' },
  },
  cambios_titular: {
    admin: { id: 'x', inmuebleId: 'inm_A', contratoId: 'ct_A' },
    propA: { id: 'x', inmuebleId: 'inm_A', contratoId: 'ct_A' },
    gestor: { id: 'x', inmuebleId: 'inm_A', contratoId: 'ct_A' },
    master: { id: 'x', inmuebleId: 'inm_A', contratoId: 'ct_A' },
  },
  mensajes_portal: {
    admin: { id: 'x', contratoId: 'ct_A', inmuebleId: 'inm_A' },
    propA: { id: 'x', contratoId: 'ct_A', inmuebleId: 'inm_A' },
    gestor: { id: 'x', contratoId: 'ct_A', inmuebleId: 'inm_A' },
    master: { id: 'x', contratoId: 'ct_A', inmuebleId: 'inm_A' },
  },
  actas: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  actas_evidencias: {
    admin: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    propA: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    gestor: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    master: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
  },
  actas_incidencias: {
    admin: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    propA: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    gestor: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    master: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
  },
  actas_otp: {
    admin: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    propA: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    gestor: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
    master: { id: 'x', propietarioId: PROP_A, actaId: 'a_1' },
  },
  sindicacion_inmuebles: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  contratos_formalizacion: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  notificaciones: {
    admin: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    propA: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    gestor: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
    master: { id: 'x', propietarioId: PROP_A, inmuebleId: 'inm_A' },
  },
  configuracion_aseguradoras: {
    admin: { id: 'x', nombre: 'Aseguradora' },
    propA: { id: 'x', nombre: 'Aseguradora' },
    gestor: { id: 'x', nombre: 'Aseguradora' },
    master: { id: 'x', nombre: 'Aseguradora' },
  },
  system: {
    admin: { id: 'x', clave: 'valor' },
    propA: { id: 'x', clave: 'valor' },
    gestor: { id: 'x', clave: 'valor' },
    master: { id: 'x', clave: 'valor' },
  },
  solicitudes: {
    admin: { id: 'x', propietarioId: PROP_A },
    propA: { id: 'x', propietarioId: PROP_A },
    gestor: { id: 'x', propietarioId: PROP_A },
    master: { id: 'x', propietarioId: PROP_A },
  },
  operaciones: {
    admin: { id: 'x', propietarioId: PROP_A },
    propA: { id: 'x', propietarioId: PROP_A },
    gestor: { id: 'x', propietarioId: PROP_A },
    master: { id: 'x', propietarioId: PROP_A },
  },
  entidades: {
    admin: { id: 'x', propietarioId: PROP_A },
    propA: { id: 'x', propietarioId: PROP_A },
    gestor: { id: 'x', propietarioId: PROP_A },
    master: { id: 'x', propietarioId: PROP_A },
  },
};

function evaluar(col: string, perfil: Perfil) {
  const doc = (DOCS[col] ?? {})[perfil] ?? { id: 'x' };
  const req: Peticion = { auth: AUTH[perfil], db: DB, resource: doc, requestResource: null, docId: 'x' };
  const r = (v: 'get' | 'list') => {
    try { return permite(col, v, req) ? 'OK ' : 'NO '; } catch (e) { return `?? `; }
  };
  return `${r('list')}${r('get')}`;
}

const COLECCIONES = Object.keys(DOCS);
console.log('colección'.padEnd(30), 'ADMIN  PROP   GESTOR MASTER   (list/get)');
console.log('-'.repeat(72));
for (const col of COLECCIONES) {
  console.log(col.padEnd(30), ['admin', 'propA', 'gestor', 'master'].map((p) => evaluar(col, p as Perfil)).join('   '));
}
