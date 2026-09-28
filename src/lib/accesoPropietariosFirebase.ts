/** Escrituras nominales sobre enlaces_registro + audit_logs existentes.
 * ROADMAP-01: no crea Auth, usuarios ni propietarios; ROADMAP-02 hará UX de onboarding.
 */
import { collection, doc, runTransaction } from 'firebase/firestore';
import { db, auth } from './firebase';
import { validarInvitacionPropietario } from './accesoPropietarios';
import type { EnlaceRegistro, UsuarioApp } from '../types';

function master() {
  const user = auth.currentUser;
  if (!user || user.email?.toLowerCase() !== 'sarqsan2@gmail.com') throw new Error('Solo el master puede administrar invitaciones nominales');
  return user;
}
function idSeguro(id: string) { return !!id && id.length <= 128 && !/[\/]/.test(id); }

/** Emite una sola vez; nunca sobreescribe un enlace histórico. */
export async function emitirInvitacionNominalFirestore(enlace: EnlaceRegistro): Promise<void> {
  const actor = master();
  if (!idSeguro(enlace.id) || !idSeguro(enlace.usuarioIdVinculado || '') || !idSeguro(enlace.propietarioIdVinculado || '') ||
      enlace.estadoInvitacion !== 'PENDIENTE' || enlace.usosMaximos !== 1 || enlace.usosActuales !== 0 ||
      !Number.isFinite(enlace.fechaCaducidadMs) || enlace.fechaCaducidadMs! <= Date.now() ||
      !enlace.activo || !enlace.emailInvitado || !enlace.token)
    throw new Error('Invitación nominal incompleta o no vigente');
  const link = doc(db,'enlaces_registro',enlace.id);
  const user = doc(db,'usuarios',enlace.usuarioIdVinculado!);
  const owner = doc(db,'propietarios',enlace.propietarioIdVinculado!);
  const audit = doc(collection(db,'audit_logs'));
  await runTransaction(db, async tx => {
    const [l,u,o] = await Promise.all([tx.get(link),tx.get(user),tx.get(owner)]);
    if (l.exists() || !u.exists() || !o.exists()) throw new Error('Invitación ya existente o destino inexistente');
    const usuario = { ...u.data(), id:u.id } as UsuarioApp;
    const validacion = validarInvitacionPropietario(enlace,usuario.email);
    if (!validacion.ok || usuario.tipoPerfil !== 'PROPIETARIO' || usuario.estado !== 'PENDIENTE' || usuario.authUid ||
        usuario.propietarioId !== o.id ||
        (usuario.personaId && usuario.personaId !== o.data().personaId))
      throw new Error(validacion.errores[0] || 'Usuario/Persona/propietario incoherente');
    tx.set(link,{ ...enlace, roadmap01AuditId:audit.id });
    tx.set(audit,{
      id:audit.id,usuarioId:actor.uid,usuarioEmail:actor.email,usuarioNombre:actor.email,
      accion:'INVITACION_NOMINAL_CREADA',descripcion:'Invitación nominal para usuario existente',
      fechaHora:new Date().toISOString(),entidadAfectada:'enlace',idAfectado:enlace.id,resultado:'EXITO',
      detalles:{ usuarioIdVinculado:usuario.id,propietarioIdVinculado:o.id,
        actorUid:actor.uid,rutas:[`enlaces_registro/${enlace.id}`] },
    });
  });
}

/** Rechazo/revocación administrativa, inmutables una vez aceptada. Repetir es no-op. */
export async function resolverInvitacionNominalFirestore(id: string, decision: 'RECHAZADA'|'REVOCADA'): Promise<void> {
  const actor = master();
  if (!idSeguro(id)) throw new Error('ID inválido');
  const link = doc(db,'enlaces_registro',id);
  const audit = doc(collection(db,'audit_logs'));
  await runTransaction(db, async tx => {
    const snap = await tx.get(link);
    if (!snap.exists() || !snap.data().usuarioIdVinculado) throw new Error('Invitación nominal inexistente');
    const actual = { ...snap.data(), id:snap.id } as EnlaceRegistro;
    if (actual.estadoInvitacion === decision && !actual.activo) return;
    if (actual.estadoInvitacion !== 'PENDIENTE' || !actual.activo || actual.usosActuales !== 0)
      throw new Error('La invitación ya fue resuelta; no se reabre');
    tx.update(link,{ estadoInvitacion:decision,activo:false,roadmap01AuditId:audit.id });
    tx.set(audit,{
      id:audit.id,usuarioId:actor.uid,usuarioEmail:actor.email,usuarioNombre:actor.email,
      accion:`INVITACION_NOMINAL_${decision}`,descripcion:'Resolución administrativa de invitación nominal',
      fechaHora:new Date().toISOString(),entidadAfectada:'enlace',idAfectado:id,resultado:'EXITO',
      detalles:{ usuarioIdVinculado:actual.usuarioIdVinculado,propietarioIdVinculado:actual.propietarioIdVinculado,
        actorUid:actor.uid,rutas:[`enlaces_registro/${id}`] },
    });
  });
}
