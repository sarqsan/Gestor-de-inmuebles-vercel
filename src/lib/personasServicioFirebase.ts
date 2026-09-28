/** Adaptador opt-in ROADMAP-01. Escrituras master-only, atómicas con audit_logs.
 * No ejecuta migraciones ni se invoca desde el onboarding existente. El master
 * debe vincular explícitamente la ficha jurídica y, si existe, el usuario.
 */
import { collection, deleteField, doc, getDocs, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Persona, RolPersona } from './personas';
import { crearPersona, vincularPropietario, vincularUsuario, desvincularUsuario, desvincularPropietario, cambiarRolesPersona, auditoriaPersona } from './personas';
import type { Propietario, UsuarioApp } from '../types';

const MASTER = 'sarqsan2@gmail.com';
function actor() {
  const u = auth.currentUser;
  if (!u || u.email?.toLowerCase() !== MASTER) throw new Error('Operación reservada al master autenticado');
  return { uid: u.uid, email: u.email };
}
function idValido(id: string): boolean { return !!id && id.length <= 128 && !/[\/]/.test(id); }
function refs(id: string) {
  if (!idValido(id)) throw new Error('ID inválido');
  return doc(db, 'personas', id);
}

/** En cada transacción la auditoría y el vínculo confirman o abortan juntos.
 * Las Rules son la autoridad; este guard de cliente es sólo defensa adicional.
 */
function contexto(accion: string, personaId: string, detalle: Record<string, string>) {
  const operador = actor();
  const fecha = new Date().toISOString();
  const auditRef = doc(collection(db, 'audit_logs'));
  const log = auditoriaPersona({ id: auditRef.id, accion, personaId,
    actorUid: operador.uid, actorEmail: operador.email!, fecha, detalle });
  log.detalles = { ...detalle, actorUid: operador.uid,
    rutas: [`personas/${personaId}`, ...(detalle.propietarioId ? [`propietarios/${detalle.propietarioId}`] : []),
      ...(detalle.usuarioId ? [`usuarios/${detalle.usuarioId}`] : [])] };
  return { fecha, auditRef, log };
}

export async function crearPersonaFirestore(id: string, nombre: string): Promise<Persona> {
  const ref = refs(id);
  const c = contexto('CREACION', id, {});
  const persona = crearPersona(id, nombre, c.fecha);
  await runTransaction(db, async tx => {
    if ((await tx.get(ref)).exists()) throw new Error('Persona ya existente');
    tx.set(ref, { ...persona, roadmap01AuditId: c.auditRef.id });
    tx.set(c.auditRef, c.log);
  });
  return persona;
}

/** Lista administrativa, jamás resuelve permisos; legacy sin Persona es válido. */
export async function listarPersonasMasterFirestore(): Promise<Persona[]> {
  actor();
  const snap = await getDocs(collection(db, 'personas'));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }) as Persona);
}

/** Alta explícita tras descartar una Persona existente: transacción única,
 * sin ficha huérfana si falla el vínculo, sin alterar titularidad.
 */
export async function crearPersonaParaPropietarioFirestore(propietarioId: string): Promise<Persona> {
  if (!idValido(propietarioId)) throw new Error('ID inválido');
  const propietarioRef = doc(db, 'propietarios', propietarioId);
  const personaRef = doc(collection(db, 'personas'));
  const c = contexto('CREACION_Y_VINCULO', personaRef.id, { propietarioId });
  return runTransaction(db, async tx => {
    const [owner, previo] = await Promise.all([tx.get(propietarioRef), tx.get(personaRef)]);
    if (!owner.exists() || previo.exists()) throw new Error('Ficha inexistente o colisión de identidad');
    if (owner.data().personaId) throw new Error('La ficha ya tiene una Persona; no duplicar');
    const persona = vincularPropietario(crearPersona(personaRef.id, owner.data().nombre as string, c.fecha),
      { ...owner.data(), id: owner.id } as Propietario, c.fecha).persona;
    tx.set(personaRef, { ...persona, roadmap01AuditId: c.auditRef.id });
    tx.update(propietarioRef, { personaId: persona.id, roadmap01AuditId: c.auditRef.id });
    tx.set(c.auditRef, c.log);
    return persona;
  });
}

export async function vincularPropietarioPersonaFirestore(personaId: string, propietarioId: string): Promise<void> {
  const personaRef = refs(personaId);
  const propietarioRef = doc(db, 'propietarios', propietarioId);
  if (!idValido(propietarioId)) throw new Error('ID inválido');
  const c = contexto('VINCULO_PROPIETARIO', personaId, { propietarioId });
  await runTransaction(db, async tx => {
    const [p, o] = await Promise.all([tx.get(personaRef), tx.get(propietarioRef)]);
    if (!p.exists() || !o.exists()) throw new Error('Persona o propietario inexistente');
    const antes = p.data() as Persona;
    const owner = o.data() as Propietario;
    if (antes.propietarioIds.includes(propietarioId) && owner.personaId === personaId) return;
    if (antes.propietarioIds.includes(propietarioId) || owner.personaId)
      throw new Error('Vínculo inconsistente o perteneciente a otra persona');
    const nuevo = vincularPropietario(antes, { ...owner, id: o.id }, c.fecha);
    tx.set(personaRef, { ...nuevo.persona, roadmap01AuditId: c.auditRef.id });
    tx.update(propietarioRef, { personaId, roadmap01AuditId: c.auditRef.id }); // jamás altera titularidad/histórico
    tx.set(c.auditRef, c.log);
  });
}

export async function vincularUsuarioPersonaFirestore(personaId: string, usuarioId: string): Promise<void> {
  const personaRef = refs(personaId);
  if (!idValido(usuarioId)) throw new Error('ID inválido');
  const usuarioRef = doc(db, 'usuarios', usuarioId);
  const c = contexto('VINCULO_CUENTA', personaId, { usuarioId });
  await runTransaction(db, async tx => {
    const [p, u] = await Promise.all([tx.get(personaRef), tx.get(usuarioRef)]);
    if (!p.exists() || !u.exists()) throw new Error('Persona o usuario inexistente');
    const persona = p.data() as Persona;
    const usuario = u.data() as UsuarioApp;
    if (persona.usuarioId === usuarioId && usuario.personaId === personaId) return;
    if (persona.usuarioId || usuario.personaId) throw new Error('Vínculo inconsistente o perteneciente a otra persona');
    const nuevo = vincularUsuario(persona, { ...usuario, id: u.id }, c.fecha);
    tx.set(personaRef, { ...nuevo.persona, roadmap01AuditId: c.auditRef.id });
    tx.update(usuarioRef, { personaId, roadmap01AuditId: c.auditRef.id }); // NO cambia Auth, propietarioId ni permisos
    tx.set(c.auditRef, c.log);
  });
}

export async function desvincularUsuarioPersonaFirestore(personaId: string, usuarioId: string): Promise<void> {
  const personaRef = refs(personaId);
  if (!idValido(usuarioId)) throw new Error('ID inválido');
  const usuarioRef = doc(db, 'usuarios', usuarioId);
  const c = contexto('DESVINCULO_CUENTA', personaId, { usuarioId });
  await runTransaction(db, async tx => {
    const [p, u] = await Promise.all([tx.get(personaRef), tx.get(usuarioRef)]);
    if (!p.exists() || !u.exists()) throw new Error('Persona o usuario inexistente');
    const nuevo = desvincularUsuario(p.data() as Persona, { ...u.data(), id: u.id } as UsuarioApp, c.fecha);
    tx.set(personaRef, { ...nuevo.persona, roadmap01AuditId: c.auditRef.id });
    tx.update(usuarioRef, { personaId: deleteField(), roadmap01AuditId: c.auditRef.id });
    tx.set(c.auditRef, c.log);
  });
}

export async function desvincularPropietarioPersonaFirestore(personaId: string, propietarioId: string): Promise<void> {
  const personaRef = refs(personaId);
  if (!idValido(propietarioId)) throw new Error('ID inválido');
  const propietarioRef = doc(db, 'propietarios', propietarioId);
  const c = contexto('DESVINCULO_PROPIETARIO', personaId, { propietarioId });
  await runTransaction(db, async tx => {
    const [p, o] = await Promise.all([tx.get(personaRef), tx.get(propietarioRef)]);
    if (!p.exists() || !o.exists()) throw new Error('Persona o propietario inexistente');
    const persona = p.data() as Persona;
    const usuarioRef = persona.usuarioId ? doc(db, 'usuarios', persona.usuarioId) : null;
    const u = usuarioRef ? await tx.get(usuarioRef) : null;
    const nuevo = desvincularPropietario(persona, { ...o.data(), id: o.id } as Propietario,
      u?.exists() ? { ...u.data(), id: u.id } as UsuarioApp : null, c.fecha);
    tx.set(personaRef, { ...nuevo.persona, roadmap01AuditId: c.auditRef.id });
    tx.update(propietarioRef, { personaId: deleteField(), roadmap01AuditId: c.auditRef.id });
    tx.set(c.auditRef, c.log);
  });
}

export async function cambiarRolesPersonaFirestore(personaId: string, roles: RolPersona[]): Promise<void> {
  const ref = refs(personaId);
  const c = contexto('CAMBIO_ROLES', personaId, {});
  await runTransaction(db, async tx => {
    const p = await tx.get(ref);
    if (!p.exists()) throw new Error('Persona inexistente');
    const antes = p.data() as Persona;
    const despues = cambiarRolesPersona(antes, roles, c.fecha);
    if (JSON.stringify(antes.roles) === JSON.stringify(roles)) throw new Error('Sin cambios de roles');
    c.log.detalles = { ...c.log.detalles, antes: antes.roles.join(','), despues: roles.join(',') };
    tx.set(ref, { ...despues, roadmap01AuditId: c.auditRef.id });
    tx.set(c.auditRef, c.log);
  });
}
