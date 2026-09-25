/**
 * ACCESO-PROPIETARIOS — Flujo nominal de alta de propietarios.
 *
 * Alta (admin) → usuario PENDIENTE vinculado a propietarioId → invitación
 * nominal de UN SOLO USO (usuarioIdVinculado + propietarioIdVinculado) →
 * el propietario crea su Auth con el email invitado → su ficha pendiente
 * pasa a ACTIVO y se vincula su UID. NUNCA se duplica usuario ni propietario.
 *
 * Módulo 100% puro (sin Firebase): validación, builders y URLs. Testeable.
 */
import type { EnlaceRegistro, Propietario, UsuarioApp } from '../types';

export interface ResultadoValidacionAcceso {
  ok: boolean;
  errores: string[];
}

function resultado(errores: string[]): ResultadoValidacionAcceso {
  return { ok: errores.length === 0, errores };
}

/** Una invitación es nominal de propietario si referencia al usuario pendiente. */
export function esInvitacionNominalPropietario(enlace: EnlaceRegistro): boolean {
  return (
    enlace.tipoPerfil === 'PROPIETARIO' &&
    typeof enlace.usuarioIdVinculado === 'string' &&
    enlace.usuarioIdVinculado.length > 0
  );
}

/**
 * Valida una invitación nominal de propietario (lectura directa por ID).
 * Si se aporta `emailFormulario`, exige coincidencia exacta con el invitado.
 */
export function validarInvitacionPropietario(
  enlace: EnlaceRegistro | null | undefined,
  emailFormulario?: string,
  ahoraIso?: string
): ResultadoValidacionAcceso {
  if (!enlace) {
    return resultado(['La invitación no existe o ha sido desactivada.']);
  }
  const errores: string[] = [];
  if (!enlace.activo) {
    errores.push('Esta invitación ha sido desactivada por la administración.');
  }
  if (enlace.fechaCaducidad && new Date(enlace.fechaCaducidad) < new Date(ahoraIso || new Date().toISOString())) {
    errores.push('Esta invitación ha caducado.');
  }
  if (
    enlace.usosMaximos !== undefined &&
    (enlace.usosActuales || 0) >= enlace.usosMaximos
  ) {
    errores.push('Esta invitación ya ha sido utilizada (un solo uso).');
  }
  if (enlace.tipoPerfil !== 'PROPIETARIO') {
    errores.push('Esta invitación no es de perfil propietario.');
  }
  if (!enlace.usuarioIdVinculado) {
    errores.push('Esta invitación no está vinculada a ningún usuario pendiente.');
  }
  if (!enlace.propietarioIdVinculado) {
    errores.push('Esta invitación no está vinculada a ningún propietario.');
  }
  const invitado = (enlace.emailInvitado || '').trim().toLowerCase();
  const form = (emailFormulario || '').trim().toLowerCase();
  if (invitado && form && invitado !== form) {
    errores.push('Esta invitación nominal solo puede usarla el correo invitado.');
  }
  return resultado(errores);
}

/**
 * Valida la ficha pendiente contra la invitación nominal antes de activarla.
 * Pura: recibe los documentos ya leídos (el servicio los carga por get directo).
 */
export function validarActivacionPendiente(
  pendiente: UsuarioApp | null | undefined,
  enlace: EnlaceRegistro,
  emailFormulario: string
): ResultadoValidacionAcceso {
  if (!pendiente) {
    return resultado(['El usuario pendiente de esta invitación ya no existe.']);
  }
  const errores: string[] = [];
  if (pendiente.tipoPerfil !== 'PROPIETARIO') {
    errores.push('La cuenta vinculada no es de perfil propietario.');
  }
  if (pendiente.estado !== 'PENDIENTE') {
    errores.push('Esta cuenta ya fue activada anteriormente.');
  }
  if (pendiente.authUid) {
    errores.push('Esta cuenta ya tiene acceso vinculado.');
  }
  if (
    (pendiente.email || '').trim().toLowerCase() !== emailFormulario.trim().toLowerCase()
  ) {
    errores.push('El correo no coincide con el de la cuenta invitada.');
  }
  if (
    enlace.propietarioIdVinculado &&
    pendiente.propietarioId !== enlace.propietarioIdVinculado
  ) {
    errores.push('La cuenta no está vinculada al propietario de la invitación.');
  }
  return resultado(errores);
}

/**
 * Prefill del alta de usuario desde la ficha del propietario seleccionado
 * (§1: App ya no pierde el propietario al abrir CrearUsuarioModal).
 */
export function buildPrefillUsuarioDesdePropietario(
  propietario: Propietario
): Partial<UsuarioApp> {
  return {
    tipoPerfil: 'PROPIETARIO',
    estado: 'PENDIENTE',
    propietarioId: propietario.id,
    nombre: propietario.nombre,
    email: propietario.email,
    telefono: propietario.telefono || undefined,
    roles: ['PROPIETARIO_ESTANDAR'],
  };
}

/** Id técnico estable para enlaces (inyectable en tests vía `azar`). */
export function generarIdEnlace(azar?: () => number): string {
  const r = (azar || Math.random)().toString(36).substring(2, 6);
  return `enlace_${Date.now()}_${r}`;
}

export function generarTokenInvitacionPropietario(azar?: () => number): string {
  const r = (azar || Math.random)().toString(36).substring(2, 10);
  return `prop_${r}`;
}

/**
 * Construye la invitación nominal de un solo uso para un usuario pendiente.
 * NO asigna `id`: lo aporta el modal (estable para previsualizar la URL).
 */
export function buildInvitacionNominalPropietario(params: {
  usuario: Pick<UsuarioApp, 'id' | 'email' | 'nombre' | 'propietarioId'>;
  diasCaducidad?: number;
  textoVisible?: string;
  descripcion?: string;
  creadoPor?: string;
  azar?: () => number;
  ahoraIso?: string;
}): Omit<EnlaceRegistro, 'id'> {
  const {
    usuario,
    diasCaducidad = 14,
    textoVisible,
    descripcion,
    creadoPor = 'admin',
    azar,
    ahoraIso,
  } = params;
  const ahora = ahoraIso || new Date().toISOString();
  return {
    token: generarTokenInvitacionPropietario(azar),
    tipoPerfil: 'PROPIETARIO',
    textoVisible: textoVisible || `🔑 Activa tu cuenta de propietario (${usuario.email})`,
    descripcion:
      descripcion ||
      `Invitación nominal e intransferible para ${usuario.nombre}. De un solo uso.`,
    activo: true,
    fechaCaducidad: new Date(new Date(ahora).getTime() + diasCaducidad * 86400000).toISOString(),
    usosMaximos: 1,
    usosActuales: 0,
    creadoPor,
    createdAt: ahora,
    propietarioIdVinculado: usuario.propietarioId,
    usuarioIdVinculado: usuario.id,
    emailInvitado: usuario.email.trim().toLowerCase(),
  };
}

/** URL nominal por ID directo (sin listar): `?registroProp=<enlaceId>`. */
export function buildUrlInvitacionPropietario(enlaceId: string, origin: string): string {
  return `${origin}?registroProp=${encodeURIComponent(enlaceId)}`;
}

/** URL genérica por token (flujo histórico, requiere lista cargada). */
export function buildUrlInvitacionGenerica(token: string, origin: string): string {
  return `${origin}?registro=${encodeURIComponent(token)}`;
}

/** URL que debe copiar la administración según el tipo de invitación. */
export function buildUrlInvitacion(enlace: EnlaceRegistro, origin: string): string {
  return esInvitacionNominalPropietario(enlace)
    ? buildUrlInvitacionPropietario(enlace.id, origin)
    : buildUrlInvitacionGenerica(enlace.token, origin);
}
