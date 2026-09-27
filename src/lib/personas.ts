/** ROADMAP-01: identidad de dominio, SIN resolver de ámbito alternativo.
 * Los roles describen la persona; D2/D3 siguen autorizando exclusivamente
 * desde usuarios_auth + titularidad + gestiones_cartera. Nada aquí crea Auth,
 * propietario, gestión, inmueble o permiso. Legacy sin personaId permanece válido.
 */
import type { Propietario, UsuarioApp, AuditLog } from '../types';
import type { EstadoDatos } from '../features/patrimonial/contracts';

export type RolPersona = 'PROPIETARIO' | 'GESTOR_PROPIETARIO' | 'GESTOR_PROFESIONAL';
export type EstadoPersona = 'ACTIVA' | 'BLOQUEADA';
export type EstadoAccesoPersona = 'PENDIENTE' | 'ACTIVO' | 'REVOCADO' | 'BLOQUEADO';

export interface Persona {
  id: string;
  nombre: string;
  estado: EstadoPersona;
  estadoDatos: EstadoDatos;
  roles: RolPersona[];
  /** Referencias a propietarios jurídicos, NO carteras gestionadas. */
  propietarioIds: string[];
  /** usuarios/{id}, NO el UID de Auth. Ausente cuando no existe perfil. */
  usuarioId?: string;
  createdAt: string;
  updatedAt: string;
}

export function crearPersona(id: string, nombre: string, fecha: string): Persona {
  if (!id || !nombre.trim() || !Number.isFinite(Date.parse(fecha))) throw new Error('Identidad incompleta');
  return { id, nombre: nombre.trim(), estado: 'ACTIVA', estadoDatos: 'INCOMPLETO',
    roles: [], propietarioIds: [], createdAt: fecha, updatedAt: fecha };
}

export function vincularPropietario(persona: Persona, propietario: Propietario, fecha: string): {
  persona: Persona; propietario: Propietario;
} {
  if (!propietario.id || (propietario.personaId && propietario.personaId !== persona.id))
    throw new Error('Propietario vinculado a otra persona');
  return {
    persona: { ...persona, propietarioIds: Array.from(new Set([...persona.propietarioIds, propietario.id])),
      roles: Array.from(new Set([...persona.roles, 'PROPIETARIO'])) as RolPersona[], updatedAt: fecha },
    propietario: { ...propietario, personaId: persona.id },
  };
}

export function vincularUsuario(persona: Persona, usuario: UsuarioApp, fecha: string): {
  persona: Persona; usuario: UsuarioApp;
} {
  if (!usuario.id || (persona.usuarioId && persona.usuarioId !== usuario.id) ||
      (usuario.personaId && usuario.personaId !== persona.id)) throw new Error('Cuenta/perfil ya vinculado a otra persona');
  if (usuario.propietarioId && !persona.propietarioIds.includes(usuario.propietarioId))
    throw new Error('El propietario propio del usuario no pertenece a esta persona');
  return { persona: { ...persona, usuarioId: usuario.id, updatedAt: fecha },
    usuario: { ...usuario, personaId: persona.id } };
}

export function cambiarRolesPersona(persona: Persona, roles: readonly RolPersona[], fecha: string): Persona {
  const permitidos: readonly string[] = ['PROPIETARIO', 'GESTOR_PROPIETARIO', 'GESTOR_PROFESIONAL'];
  if (roles.some(r => !permitidos.includes(r)) || new Set(roles).size !== roles.length)
    throw new Error('Roles de persona inválidos');
  if (roles.includes('PROPIETARIO') !== (persona.propietarioIds.length > 0))
    throw new Error('La propiedad se deriva del vínculo jurídico, no del rol');
  if (roles.includes('GESTOR_PROPIETARIO') && !roles.includes('PROPIETARIO'))
    throw new Error('Un gestor propietario debe ser propietario');
  if (roles.includes('GESTOR_PROFESIONAL') && roles.includes('PROPIETARIO'))
    throw new Error('Usar GESTOR_PROPIETARIO cuando la persona es titular');
  return { ...persona, roles: [...roles], updatedAt: fecha };
}

/** Estado de acceso informativo; jamás autoriza recursos ni reemplaza D2/D3. */
export function estadoAccesoPersona(persona: Persona, usuario?: UsuarioApp | null): EstadoAccesoPersona {
  // El estado de la persona no bloquea una cuenta: hay que bloquear el
  // usuario/espejo explícitamente. Nunca inferir revocación desde los datos.
  if (usuario?.estado === 'BLOQUEADO') return 'BLOQUEADO';
  if (!usuario || !usuario.authUid || usuario.estado === 'PENDIENTE') return 'PENDIENTE';
  return usuario.estado === 'ACTIVO' ? 'ACTIVO' : 'REVOCADO';
}

/** Envelope ya utilizado en audit_logs; sólo metadatos, nunca secretos/PII adicional. */
export function auditoriaPersona(p: { id: string; accion: string; personaId: string; actorUid: string;
  actorEmail: string; fecha: string; detalle: Record<string, string> }): AuditLog {
  return { id: p.id, usuarioId: p.actorUid, usuarioEmail: p.actorEmail,
    usuarioNombre: p.actorEmail, accion: `PERSONA_${p.accion}`, descripcion: p.accion,
    fechaHora: p.fecha, entidadAfectada: 'persona', idAfectado: p.personaId,
    resultado: 'EXITO', detalles: p.detalle };
}
