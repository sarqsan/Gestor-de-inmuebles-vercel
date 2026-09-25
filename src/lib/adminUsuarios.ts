/**
 * adminUsuarios.ts — Administración de usuarios y permisos.
 *
 * Módulo PURO (sin llamadas a Firebase): concentra las reglas de protección de
 * la edición administrativa y el cálculo de diferencias para auditoría.
 *
 * Capas de seguridad de la edición (de exterior a interior):
 *  1. UI (CrearUsuarioModal): bloquea campos no editables según el caso.
 *  2. Este validador (validarEdicionAdmin): rechaza el guardado si viola reglas.
 *  3. firestore.rules: solo el master puede escribir en `usuarios`.
 *
 * Restricciones aplicadas (Bloque Administración):
 *  - La edición modifica el documento `usuarios` existente: nunca crea un
 *    segundo usuario, ni toca Auth, ni crea fichas.
 *  - Identidad y vínculos inmutables: authUid, uid, email, tipoPerfil,
 *    propietarioId, profesionalId, contratoIds, enlaceRegistroId,
 *    habitacionIdentificador, inmuebleIds, creadoPor, createdAt, rol, activo.
 *  - Estados editables: ACTIVO / INACTIVO / BLOQUEADO. Nunca se crea un
 *    PENDIENTE manual ni se cambia el estado de un PENDIENTE (invitaciones).
 *  - SUPERADMIN: nunca asignable ni retirable desde este editor.
 *  - Cuenta maestra: protegida (solo nombre/apellidos/teléfono editables).
 *  - Autoedición: sin cambios de roles/permisos propios ni autobloqueo.
 */
import type { UsuarioApp } from '../types';
import { ADMIN_MASTER_EMAIL } from './authService';

/** Id documental reservado de la cuenta maestra (ver authService). */
export const MASTER_USER_ID = 'user_admin_principal';

/** Rol con bypass total: nunca asignable desde el editor. */
export const ROL_SUPERADMIN = 'SUPERADMIN';

/** Quién opera el editor (cuenta autenticada en App). */
export interface OperadorAdmin {
  id: string;
  email: string;
}

/**
 * ¿Es la cuenta maestra? Por id reservado o por email maestro.
 * La comparación de email es insensible a mayúsculas/espacios.
 */
export function esUsuarioMaster(
  u: Pick<UsuarioApp, 'id' | 'email'> | null | undefined
): boolean {
  if (!u) return false;
  if (u.id === MASTER_USER_ID) return true;
  const email = (u.email || '').trim().toLowerCase();
  return !!email && email === ADMIN_MASTER_EMAIL.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Comparadores con normalización (undefined ≈ null ≈ '' en escalares)
// ---------------------------------------------------------------------------

function normScalar(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  return String(v);
}

function normArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.map((x) => String(x)))).sort();
}

function mismoScalar(a: unknown, b: unknown): boolean {
  return normScalar(a) === normScalar(b);
}

function mismoArr(a: unknown, b: unknown): boolean {
  const na = normArr(a);
  const nb = normArr(b);
  return na.length === nb.length && na.every((x, i) => x === nb[i]);
}

// ---------------------------------------------------------------------------
// Validador de edición administrativa
// ---------------------------------------------------------------------------

export interface ValidarEdicionInput {
  operador: OperadorAdmin | null | undefined;
  original: UsuarioApp;
  editado: UsuarioApp;
}

/**
 * Valida una edición administrativa. Devuelve `null` si es aceptable o el
 * mensaje de rechazo (mostrable al operador) en caso contrario.
 */
export function validarEdicionAdmin(input: ValidarEdicionInput): string | null {
  const { operador, original, editado } = input;
  if (!operador || !operador.id) {
    return 'Operación no permitida: falta el operador autenticado.';
  }
  if (!original || !editado) {
    return 'Operación no permitida: falta el usuario original o el editado.';
  }
  if (!original.id || original.id !== editado.id) {
    return 'No se puede cambiar el identificador del usuario.';
  }

  const master = esUsuarioMaster(original);
  const esSelf = operador.id === original.id;

  // 1. Identidad, cuenta de acceso y vínculos: inmutables.
  if (!mismoScalar(original.authUid, editado.authUid)) {
    return 'El vínculo con la cuenta de acceso (authUid) no puede modificarse desde este editor.';
  }
  if (!mismoScalar(original.uid, editado.uid)) {
    return 'El identificador de la cuenta de acceso (uid) no puede modificarse desde este editor.';
  }
  if (!mismoScalar(original.email, editado.email)) {
    return 'El email de acceso no puede modificarse desde este editor.';
  }
  if (!mismoScalar(original.tipoPerfil, editado.tipoPerfil)) {
    return 'El tipo de perfil no puede modificarse desde este editor.';
  }
  const escalaresVinculo: (keyof UsuarioApp)[] = [
    'propietarioId',
    'profesionalId',
    'enlaceRegistroId',
    'habitacionIdentificador',
    'creadoPor',
    'createdAt',
    'rol',
    'activo',
  ];
  const arraysVinculo: (keyof UsuarioApp)[] = ['contratoIds', 'inmuebleIds'];
  const vinculoTocado =
    escalaresVinculo.some((k) => !mismoScalar(original[k], editado[k])) ||
    arraysVinculo.some((k) => !mismoArr(original[k], editado[k]));
  if (vinculoTocado) {
    return 'Los vínculos con fichas, contratos o viviendas no pueden modificarse desde este editor.';
  }

  // 2. Estados: solo ACTIVO / INACTIVO / BLOQUEADO; PENDIENTE gestionado por invitaciones.
  if (original.estado === 'PENDIENTE' && editado.estado !== 'PENDIENTE') {
    return 'Un usuario pendiente de invitación no puede cambiar de estado desde este editor.';
  }
  if (original.estado !== 'PENDIENTE' && editado.estado === 'PENDIENTE') {
    return 'No se puede marcar un usuario como pendiente desde este editor.';
  }
  if (
    editado.estado !== 'ACTIVO' &&
    editado.estado !== 'INACTIVO' &&
    editado.estado !== 'BLOQUEADO' &&
    editado.estado !== 'PENDIENTE'
  ) {
    return 'Estado no permitido desde este editor.';
  }
  if (esSelf && original.estado === 'ACTIVO' && editado.estado !== 'ACTIVO') {
    return 'No puedes bloquear ni desactivar tu propia cuenta.';
  }

  // 3. Cuenta maestra: protegida (estado, roles y permisos inmutables).
  if (master) {
    if (!mismoScalar(original.estado, editado.estado)) {
      return 'La cuenta maestra no puede cambiar de estado.';
    }
    if (!mismoArr(original.roles, editado.roles)) {
      return 'Los roles de la cuenta maestra no pueden modificarse.';
    }
    if (!mismoArr(original.permisos, editado.permisos)) {
      return 'Los permisos de la cuenta maestra no pueden modificarse.';
    }
  }

  // 4. Roles: SUPERADMIN nunca asignable/retirable; sin autoedición de roles.
  const teniaSuper = normArr(original.roles).includes(ROL_SUPERADMIN);
  const tieneSuper = normArr(editado.roles).includes(ROL_SUPERADMIN);
  if (!teniaSuper && tieneSuper) {
    return 'No se puede asignar el rol SUPERADMIN desde este editor.';
  }
  if (teniaSuper && !mismoArr(original.roles, editado.roles)) {
    return 'Los roles de un usuario SUPERADMIN no pueden modificarse desde este editor.';
  }
  if (!master && esSelf && !mismoArr(original.roles, editado.roles)) {
    return 'No puedes modificar tus propios roles.';
  }

  // 5. Permisos: sin autoasignación (el master ya está cubierto arriba).
  if (!master && esSelf && !mismoArr(original.permisos, editado.permisos)) {
    return 'No puedes modificar tus propios permisos.';
  }

  // 6. Integridad mínima.
  if (!normScalar(editado.nombre)) {
    return 'El nombre no puede quedar vacío.';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Diferencias para auditoría (sin secretos: nunca contraseñas ni tokens)
// ---------------------------------------------------------------------------

type CampoAuditable = {
  key: keyof UsuarioApp;
  etiqueta: string;
  tipo: 'scalar' | 'array';
};

const CAMPOS_AUDITABLES: CampoAuditable[] = [
  { key: 'estado', etiqueta: 'estado', tipo: 'scalar' },
  { key: 'tipoPerfil', etiqueta: 'perfil', tipo: 'scalar' },
  { key: 'email', etiqueta: 'email', tipo: 'scalar' },
  { key: 'nombre', etiqueta: 'nombre', tipo: 'scalar' },
  { key: 'apellidos', etiqueta: 'apellidos', tipo: 'scalar' },
  { key: 'telefono', etiqueta: 'teléfono', tipo: 'scalar' },
  { key: 'roles', etiqueta: 'roles', tipo: 'array' },
  { key: 'permisos', etiqueta: 'permisos', tipo: 'array' },
  { key: 'inmuebleIds', etiqueta: 'viviendas', tipo: 'array' },
  { key: 'propietarioId', etiqueta: 'ficha propietario', tipo: 'scalar' },
  { key: 'profesionalId', etiqueta: 'ficha profesional', tipo: 'scalar' },
  { key: 'contratoIds', etiqueta: 'contratos', tipo: 'array' },
  // authUid solo aparecería si algo lo cambió fuera del editor: señal de alarma.
  { key: 'authUid', etiqueta: 'cuenta de acceso', tipo: 'scalar' },
];

/**
 * Claves (etiquetas) de campos administrativos que difieren entre dos
 * versiones. Ignora metadatos (updatedAt/createdAt/lastLoginAt).
 */
export function camposModificadosUsuario(a: UsuarioApp, b: UsuarioApp): string[] {
  const out: string[] = [];
  for (const c of CAMPOS_AUDITABLES) {
    const difiere =
      c.tipo === 'array' ? !mismoArr(a[c.key], b[c.key]) : !mismoScalar(a[c.key], b[c.key]);
    if (difiere) out.push(c.etiqueta);
  }
  return out;
}

function fmtScalar(v: unknown): string {
  const n = normScalar(v);
  return n === null ? '—' : n;
}

/**
 * Resumen legible de cambios para el detalle de auditoría.
 * Escalares: `etiqueta: antes→después`. Arrays: `etiqueta: +añadido, -retirado`.
 * Sin cambios: 'sin cambios administrativos'.
 */
export function resumenCambiosUsuario(a: UsuarioApp, b: UsuarioApp): string {
  const partes: string[] = [];
  for (const c of CAMPOS_AUDITABLES) {
    if (c.tipo === 'scalar') {
      if (!mismoScalar(a[c.key], b[c.key])) {
        partes.push(`${c.etiqueta}: ${fmtScalar(a[c.key])}→${fmtScalar(b[c.key])}`);
      }
    } else {
      const antes = normArr(a[c.key]);
      const despues = normArr(b[c.key]);
      const alta = despues.filter((x) => !antes.includes(x));
      const baja = antes.filter((x) => !despues.includes(x));
      if (alta.length > 0 || baja.length > 0) {
        const delta = [...alta.map((x) => `+${x}`), ...baja.map((x) => `-${x}`)].join(', ');
        partes.push(`${c.etiqueta}: ${delta}`);
      }
    }
  }
  return partes.length > 0 ? partes.join('; ') : 'sin cambios administrativos';
}

// ---------------------------------------------------------------------------
// Baja segura de acceso (Bloque Borrado Seguro)
// ---------------------------------------------------------------------------
// El borrado FÍSICO (deleteDoc + Auth + espejo) no es seguro con la
// arquitectura actual: no existe vía frontend para eliminar la cuenta de
// Auth, y el espejo rancio + isStaff() dejarían acceso residual. La baja
// segura retira el acceso pasando a INACTIVO (mecanismo que el modelo ya
// soporta: login, listener y guardias rechazan no-ACTIVO), conserva todos
// los datos patrimoniales e históricos, y sincroniza el espejo para revocar
// el rol en las reglas. No inventa estados nuevos y nunca borra documentos.

export interface ValidarBajaInput {
  operador: OperadorAdmin | null | undefined;
  objetivo: UsuarioApp;
}

/**
 * Valida una baja de acceso. `null` si procede; mensaje de rechazo si no.
 * Protege: auto-baja, master, SUPERADMIN, pendientes (invitación) y bajas
 * repetidas. La ejecución efectiva sigue restringida al master por reglas.
 */
export function validarBajaUsuario(input: ValidarBajaInput): string | null {
  const { operador, objetivo } = input;
  if (!operador || !operador.id) {
    return 'Operación no permitida: falta el operador autenticado.';
  }
  if (!objetivo || !objetivo.id) {
    return 'Operación no permitida: falta el usuario objetivo.';
  }
  if (operador.id === objetivo.id) {
    return 'No puedes dar de baja tu propia cuenta.';
  }
  if (esUsuarioMaster(objetivo)) {
    return 'La cuenta maestra no puede darse de baja.';
  }
  if ((objetivo.roles || []).includes(ROL_SUPERADMIN)) {
    return 'Un usuario SUPERADMIN no puede darse de baja desde este panel.';
  }
  if (objetivo.estado === 'PENDIENTE') {
    return 'Un usuario pendiente de invitación no puede darse de baja desde este panel.';
  }
  if (objetivo.estado === 'INACTIVO') {
    return 'Este usuario ya está de baja (inactivo).';
  }
  return null;
}

/**
 * Construye el documento de baja: SOLO cambia el estado a INACTIVO.
 * Preserva identidad, authUid, vínculos, contratos, roles, permisos y
 * metadatos (el guardado usa merge, así nada se pierde).
 */
export function aplicarBajaUsuario(objetivo: UsuarioApp): UsuarioApp {
  return { ...objetivo, estado: 'INACTIVO' };
}

/**
 * Detalle de auditoría de la baja: quién, transición, qué se conserva y
 * motivo (sin secretos: nunca contraseñas ni tokens).
 */
export function detalleBajaUsuario(
  objetivo: UsuarioApp,
  motivo: string | undefined,
  estadoAnterior: string
): string {
  const base =
    `Baja de acceso de ${objetivo.nombre} (${objetivo.email}): ` +
    `${estadoAnterior}→INACTIVO. Se conserva ficha patrimonial, inmuebles, ` +
    `contratos, documentos, históricos y auditoría.`;
  return motivo && motivo.trim() ? `${base} Motivo: ${motivo.trim()}` : base;
}
