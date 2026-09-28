/** ROADMAP-02: orquestación sobre Persona, propietarios, usuarios,
 * enlaces_registro y gestiones_cartera existentes. Nunca crea ni elimina Auth.
 * Cada paso Firestore confirma junto con audit_logs; IDs estables permiten
 * reanudar tras desconexión sin sobrescribir identidades ni titularidades. */
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where, runTransaction } from 'firebase/firestore';
import { auth, db, sanitizeObjectForFirestore } from './firebase';
import type { EnlaceRegistro, Propietario, UsuarioApp } from '../types';
import { crearPersona, vincularPropietario, vincularUsuario, type Persona } from './personas';
import { crearGestion, registrarEvento, type GestionCartera, type PermisoGestion } from './gestionesCartera';
import { buildInvitacionNominalPropietario } from './accesoPropietarios';

function id(value: string) {
  if (!value || value.length > 128 || /[\/~]/.test(value)) throw new Error('Identificador inválido');
  return value;
}
function actor(master = false) {
  const u = auth.currentUser;
  if (!u?.email || (master && u.email.toLowerCase() !== 'sarqsan2@gmail.com'))
    throw new Error('Se requiere una sesión autenticada autorizada');
  return u;
}
function log(uid: string, email: string, auditId: string, accion: string, rutas: string[]) {
  return { id: auditId, usuarioId: uid, usuarioEmail: email, usuarioNombre: email,
    accion, descripcion: accion, fechaHora: new Date().toISOString(),
    entidadAfectada: 'enlace', idAfectado: rutas[0].split('/')[1], resultado: 'EXITO',
    detalles: { actorUid: uid, rutas } };
}
function datos<T>(s: { id: string; data(): unknown }): T { return { ...s.data() as object, id: s.id } as T; }

export interface AltaOnboarding {
  propietarioId: string;
  nombre: string;
  email?: string;
  personaId?: string;
  usuarioId?: string;
  sinCuenta?: boolean;
}

/** Cuenta existente: seleccionarla explícitamente; nunca deducir titularidad del email.
 * Cuenta nueva: ID derivado del email para serializar altas simultáneas de ese correo.
 * Propietario existente: no se cambia nombre, email, NIF ni titularidad histórica. */
export async function prepararOnboardingPropietarioFirestore(p: AltaOnboarding) {
  const a = actor(true), fecha = new Date().toISOString();
  const ownerRef = doc(db, 'propietarios', id(p.propietarioId));
  const email = (p.email || '').trim().toLowerCase();
  if (!p.nombre.trim() || (!p.sinCuenta && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))
    throw new Error('Nombre y correo válido obligatorios para crear una cuenta');
  let usuarioId = p.usuarioId;
  if (!p.sinCuenta && !usuarioId) {
    const existentes = await getDocs(query(collection(db, 'usuarios'), where('email', '==', email)));
    if (existentes.docs.length > 1) throw new Error('Correo con varias cuentas; seleccione una identidad explícita');
    if (!existentes.empty) usuarioId = existentes.docs[0].id;
    else {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
      usuarioId = 'r02_' + Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
    }
  }
  const userRef = !p.sinCuenta && usuarioId ? doc(db, 'usuarios', id(usuarioId)) : null;
  const auditRef = doc(collection(db, 'audit_logs'));
  return runTransaction(db, async tx => {
    const o = await tx.get(ownerRef), u = userRef ? await tx.get(userRef) : null;
    const owner = o.exists() ? datos<Propietario>(o) : { id: ownerRef.id, nombre: p.nombre.trim(), email } as Propietario;
    const personaId = p.personaId || owner.personaId || (u?.exists() ? u.data().personaId as string : '') || `p_${ownerRef.id}`;
    const personaRef = doc(db, 'personas', id(personaId));
    const ps = await tx.get(personaRef);
    if (p.personaId && !ps.exists()) throw new Error('La Persona seleccionada no existe');
    let persona = ps.exists() ? datos<Persona>(ps) : crearPersona(personaId, owner.nombre, fecha);
    const usuario = userRef ? (u?.exists() ? datos<UsuarioApp>(u) : {
      id: userRef.id, email, nombre: p.nombre.trim(), tipoPerfil: 'PROPIETARIO', estado: 'PENDIENTE',
      roles: ['PROPIETARIO_ESTANDAR'], propietarioId: owner.id, createdAt: fecha, updatedAt: fecha,
    } as UsuarioApp) : null;
    if (usuario && (usuario.email !== email || usuario.tipoPerfil !== 'PROPIETARIO' ||
        (usuario.propietarioId && usuario.propietarioId !== owner.id) ||
        !['PENDIENTE', 'ACTIVO'].includes(usuario.estado))) throw new Error('Cuenta incompatible; no se reasigna la identidad');
    const vinculo = vincularPropietario(persona, owner, fecha);
    persona = vinculo.persona;
    const cuenta = usuario ? vincularUsuario(persona, { ...usuario, propietarioId: owner.id }, fecha) : null;
    if (cuenta) persona = cuenta.persona;
    const yaVinculado = o.exists() && owner.personaId === personaId && ps.exists() &&
      (!userRef || (u?.exists() && u.data().personaId === personaId && u.data().propietarioId === owner.id));
    if (yaVinculado) return { propietarioId: owner.id, personaId, usuarioId: usuario?.id };
    const rutas = [ownerRef.path, personaRef.path, ...(userRef ? [userRef.path] : [])];
    tx.set(personaRef, { ...persona, roadmap01AuditId: auditRef.id });
    tx.set(ownerRef, sanitizeObjectForFirestore({ ...vinculo.propietario, roadmap01AuditId: auditRef.id }));
    if (userRef && cuenta) tx.set(userRef, sanitizeObjectForFirestore({ ...cuenta.usuario, roadmap01AuditId: auditRef.id }));
    tx.set(auditRef, log(a.uid, a.email!, auditRef.id, 'ONBOARDING_VINCULADO', rutas));
    return { propietarioId: owner.id, personaId, usuarioId: usuario?.id };
  });
}

export interface InvitarCartera {
  enlaceId: string; // conservar este ID al reintentar; un nuevo ID es una reemisión explícita
  propietarioId: string;
  usuarioId: string;
  gestorUsuarioId?: string;
  inmuebleIds?: string[]; // [] = completa; nunca se convierte una parcial en global
  permiso?: PermisoGestion;
  dias?: number;
}

/** Emite para cuenta pendiente o activa. La invitación no concede acceso.
 * El índice del espejo SOLO selecciona una relación: Rules comprueba su estado vivo.
 * La pareja propietario/gestor identifica una relación canónica, no un duplicado por envío. */
export async function invitarCarteraFirestore(p: InvitarCartera): Promise<EnlaceRegistro> {
  const a = actor(true), fecha = new Date().toISOString();
  const ref = doc(db, 'enlaces_registro', id(p.enlaceId));
  const ur = doc(db, 'usuarios', id(p.usuarioId)), or = doc(db, 'propietarios', id(p.propietarioId));
  // Reutilizar relación histórica explícita; no migrar ni duplicar su historial.
  const previas = p.gestorUsuarioId ? await getDocs(query(collection(db, 'gestiones_cartera'),
    where('gestorUsuarioId', '==', id(p.gestorUsuarioId)))) : null;
  const parejas = previas?.docs.filter(d => d.data().propietarioId === p.propietarioId) || [];
  if (parejas.length > 1) throw new Error('Varias relaciones históricas: resolver la ambigüedad antes de invitar');
  const gestionId = parejas[0]?.id || `${id(p.propietarioId)}~${p.gestorUsuarioId ? id(p.gestorUsuarioId) : ''}`;
  if (gestionId.length > 128) throw new Error('Identificadores de relación demasiado largos');
  const gr = p.gestorUsuarioId ? doc(db, 'gestiones_cartera', gestionId) : null;
  const audit = doc(collection(db, 'audit_logs'));
  const alcance = [...new Set(p.inmuebleIds || [])].sort();
  if (alcance.length > 20 || !(p.dias === undefined || (p.dias >= 1 && p.dias <= 90)) ||
      (p.permiso && !['LECTURA', 'LECTURA_ESCRITURA'].includes(p.permiso))) throw new Error('Alcance, permiso o caducidad inválidos');
  return runTransaction(db, async tx => {
    const [es, us, os] = await Promise.all([tx.get(ref), tx.get(ur), tx.get(or)]);
    if (!us.exists() || !os.exists()) throw new Error('Cuenta o propietario inexistente');
    const usuario = datos<UsuarioApp>(us), owner = datos<Propietario>(os);
    if (!usuario.personaId || owner.personaId !== usuario.personaId || usuario.propietarioId !== owner.id ||
        usuario.tipoPerfil !== 'PROPIETARIO' || !['PENDIENTE', 'ACTIVO'].includes(usuario.estado)) throw new Error('Complete primero la vinculación Cuenta ↔ Persona ↔ propietario');
    if (es.exists()) {
      const existente = datos<EnlaceRegistro>(es);
      if (existente.usuarioIdVinculado !== usuario.id || existente.propietarioIdVinculado !== owner.id ||
          existente.gestionId !== gr?.id || JSON.stringify(existente.alcanceInmuebleIds || []) !== JSON.stringify(alcance) ||
          existente.permisoGestion !== (p.permiso || 'LECTURA')) throw new Error('ID de operación reutilizado con otro contenido');
      return existente;
    }
    const ps = await tx.get(doc(db, 'personas', usuario.personaId));
    if (!ps.exists() || ps.data().usuarioId !== usuario.id) throw new Error('Persona incoherente');
    let gestion: GestionCartera | null = null;
    let mirrorRef: ReturnType<typeof doc> | null = null;
    let mirror: Record<string, any> = {};
    if (gr && p.gestorUsuarioId) {
      const [gs, gestor, ...inms] = await Promise.all([tx.get(gr), tx.get(doc(db, 'usuarios', p.gestorUsuarioId)),
        ...alcance.map(i => tx.get(doc(db, 'inmuebles', id(i))))]);
      if (!gestor.exists() || gestor.data().estado !== 'ACTIVO' || !gestor.data().authUid ||
          !gestor.data().roles?.includes('GESTOR_PATRIMONIAL') || p.gestorUsuarioId === usuario.id)
        throw new Error('El gestor debe tener cuenta activa y rol patrimonial, sin ser el titular');
      if (inms.some(i => !i.exists() || i.data().propietarioId !== owner.id)) throw new Error('Inmueble fuera de la cartera');
      mirrorRef = doc(db, 'usuarios_auth', gestor.data().authUid);
      const ms = await tx.get(mirrorRef);
      if (!ms.exists() || ms.data().usuarioId !== gestor.id || ms.data().estado !== 'ACTIVO') throw new Error('Espejo del gestor no sincronizado');
      mirror = ms.data();
      if (gs.exists()) {
        gestion = datos<GestionCartera>(gs);
        if (gestion.estado !== 'PENDIENTE_ACEPTACION' || gestion.propietarioId !== owner.id ||
            gestion.gestorUsuarioId !== gestor.id || gestion.permiso !== (p.permiso || 'LECTURA') ||
            JSON.stringify([...gestion.inmuebleIds].sort()) !== JSON.stringify(alcance)) throw new Error('Relación existente incompatible; no se reemplaza su histórico');
        const anteriorId = gs.data().enlaceRegistroId;
        if (anteriorId) {
          const anterior = await tx.get(doc(db, 'enlaces_registro', anteriorId));
          if (anterior.exists() && anterior.data().estadoInvitacion === 'PENDIENTE' && anterior.data().fechaCaducidadMs > Date.now())
            throw new Error(`Ya existe una invitación pendiente: ${anteriorId}`);
        }
      } else {
        const creada = crearGestion({ id: gr.id, propietarioId: owner.id, gestorUsuarioId: gestor.id,
          tipoGestor: gestor.data().propietarioId ? 'PROPIETARIO_GESTOR' : 'GESTOR_PROFESIONAL',
          propietarioTieneCuenta: true, permiso: p.permiso || 'LECTURA', inmuebleIds: alcance, fecha, actorId: a.uid });
        if (creada.ok === false) throw new Error(creada.error);
        gestion = creada.gestion;
      }
      const invitada = registrarEvento({ ...gestion, requiereAceptacion: true }, { tipo: 'INVITACION', fecha, actorId: a.uid });
      if (invitada.ok === false) throw new Error(invitada.error);
      gestion = invitada.gestion;
    }
    const enlace: EnlaceRegistro = { ...buildInvitacionNominalPropietario({ usuario, creadoPor: a.uid, diasCaducidad: p.dias || 14, ahoraIso: fecha }),
      id: ref.id, token: ref.id, finalidad: 'ONBOARDING_CARTERA', personaIdVinculada: usuario.personaId,
      ...(gr ? { gestionId: gr.id } : {}), alcanceInmuebleIds: alcance, permisoGestion: p.permiso || 'LECTURA' };
    const rutas = [ref.path, ...(gr ? [gr.path] : []), ...(mirrorRef ? [mirrorRef.path] : [])];
    tx.set(ref, { ...enlace, roadmap01AuditId: audit.id });
    if (gr && gestion) tx.set(gr, sanitizeObjectForFirestore({ ...gestion, enlaceRegistroId: ref.id, roadmap01AuditId: audit.id }));
    if (mirrorRef && gr) tx.update(mirrorRef, {
      gestionesPorPropietario: { ...(mirror.gestionesPorPropietario || {}), [owner.id]: gr.id },
      // Retirar posibles proyecciones globales anteriores: la relación viva manda.
      carterasL: (mirror.carterasL || []).filter((x: string) => x !== owner.id),
      ultimaInvitacionCarteraId: ref.id,
      carterasE: (mirror.carterasE || []).filter((x: string) => x !== owner.id), roadmap01AuditId: audit.id,
    });
    tx.set(audit, log(a.uid, a.email!, audit.id, 'ONBOARDING_INVITACION_CREADA', rutas));
    return enlace;
  });
}

export async function obtenerInvitacionCarteraFirestore(enlaceId: string): Promise<EnlaceRegistro | null> {
  const snap = await getDoc(doc(db, 'enlaces_registro', id(enlaceId)));
  return snap.exists() ? datos<EnlaceRegistro>(snap) : null;
}

/** El destinatario autenticado decide. Rechazo/expiración no activan Auth ni perfil.
 * Auth se autentica antes; perfil, invitación y relación confirman atómicamente.
 * Si falla Firestore, Auth se conserva y el mismo enlace permite reanudar. */
export async function resolverInvitacionCarteraFirestore(enlaceId: string,
  decision: 'ACEPTADA' | 'RECHAZADA' | 'REVOCADA' | 'EXPIRADA'): Promise<void> {
  const a = actor(), ref = doc(db, 'enlaces_registro', id(enlaceId));
  const audit = doc(collection(db, 'audit_logs')), fecha = new Date().toISOString();
  await runTransaction(db, async tx => {
    const es = await tx.get(ref);
    if (!es.exists() || es.data().finalidad !== 'ONBOARDING_CARTERA') throw new Error('Invitación de cartera inexistente');
    const e = datos<EnlaceRegistro>(es);
    const master = a.email!.toLowerCase() === 'sarqsan2@gmail.com';
    if ((['REVOCADA','EXPIRADA'].includes(decision) && !master) || (!master && e.emailInvitado !== a.email!.toLowerCase())) throw new Error('Destinatario no autorizado');
    const us = await tx.get(doc(db, 'usuarios', e.usuarioIdVinculado!));
    if (!us.exists()) throw new Error('Cuenta inexistente');
    const u = datos<UsuarioApp>(us);
    if (!master && (u.email !== a.email!.toLowerCase() || (u.authUid && u.authUid !== a.uid))) throw new Error('UID no coincide');
    const gr = e.gestionId ? doc(db, 'gestiones_cartera', e.gestionId) : null;
    const gs = gr ? await tx.get(gr) : null;
    if (!master && !a.emailVerified) throw new Error('Verifica primero tu correo');
    if (e.estadoInvitacion === decision && (!gr || gs?.data()?.resolucionInvitacion === decision)) return;
    if (e.estadoInvitacion !== 'PENDIENTE' || e.usosActuales !== 0) throw new Error('Invitación ya resuelta');
    if (decision === 'EXPIRADA' ? e.fechaCaducidadMs! > Date.now() : ['ACEPTADA','RECHAZADA'].includes(decision) && e.fechaCaducidadMs! <= Date.now()) throw new Error('Caducidad incompatible con la decisión');
    if (decision === 'ACEPTADA' && (!a.emailVerified || !['ACTIVO', 'PENDIENTE'].includes(u.estado) || (u.authUid && u.authUid !== a.uid) || u.email !== a.email!.toLowerCase() || u.personaId !== e.personaIdVinculada ||
        u.propietarioId !== e.propietarioIdVinculado)) throw new Error('Active primero la cuenta invitada con su propia sesión');
    let gestion: GestionCartera | null = null;
    if (gr) {
      if (!gs?.exists() || gs.data().enlaceRegistroId !== e.id) throw new Error('Relación o invitación reemplazada');
      gestion = datos<GestionCartera>(gs);
      if (gestion.estado !== 'PENDIENTE_ACEPTACION' || gestion.propietarioId !== e.propietarioIdVinculado ||
          gestion.permiso !== e.permisoGestion || JSON.stringify(gestion.inmuebleIds) !== JSON.stringify(e.alcanceInmuebleIds)) throw new Error('Relación incoherente');
      // Rechazo/expiración dejan la relación pendiente para una reemisión;
      // revocación explícita se resuelve administrativamente en el servicio canónico.
      if (decision === 'ACEPTADA') {
        const r = registrarEvento(gestion, { tipo: 'ACEPTACION', fecha, actorId: u.id });
        if (r.ok === false) throw new Error(r.error);
        gestion = r.gestion;
      }
    }
    const userRef = doc(db, 'usuarios', u.id);
    const activaUsuario = decision === 'ACEPTADA' && u.estado === 'PENDIENTE';
    const rutas = [ref.path, ...(gr ? [gr.path] : []), ...(activaUsuario ? [userRef.path] : [])];
    if (activaUsuario) tx.update(userRef, { authUid: a.uid, estado: 'ACTIVO', enlaceRegistroId: e.id,
      updatedAt: fecha, roadmap01AuditId: audit.id });
    tx.update(ref, { estadoInvitacion: decision, activo: false, usosActuales: decision === 'ACEPTADA' ? 1 : 0,
      resueltaAt: fecha, resueltaPor: a.uid, roadmap01AuditId: audit.id });
    if (gr && gestion) tx.set(gr, sanitizeObjectForFirestore({ ...gestion, enlaceRegistroId: e.id,
      resolucionInvitacion: decision, roadmap01AuditId: audit.id }));
    tx.set(audit, log(a.uid, a.email!, audit.id, `ONBOARDING_INVITACION_${decision}`, rutas));
  });
}

/** Autenticar o recuperar Auth existente; jamás compensar borrando Auth.
 * Tras éxito Firestore, syncAuthIndex puede reintentarse en el siguiente login. */
export async function autenticarInvitadoCartera(enlaceId: string, email: string, password: string): Promise<EnlaceRegistro> {
  id(enlaceId);
  const correo = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error('Correo inválido');
  if (auth.currentUser?.email?.toLowerCase() !== correo) {
    try { await signInWithEmailAndPassword(auth, correo, password); }
    catch (error) {
      const code = (error as {code?: string}).code;
      if (!['auth/user-not-found', 'auth/invalid-credential'].includes(code || '')) throw error;
      // Con email-enumeration protection un usuario inexistente devuelve invalid-credential.
      // Si existe y su contraseña es errónea create falla: no se sustituye su UID.
      await createUserWithEmailAndPassword(auth, correo, password);
    }
  }
  await auth.currentUser!.reload();
  await auth.currentUser!.getIdToken(true);
  if (!auth.currentUser!.emailVerified) {
    await sendEmailVerification(auth.currentUser!, { url: `${window.location.origin}/?cartera=${encodeURIComponent(enlaceId)}` });
    throw new Error('Verifica el correo que acabamos de enviar y pulsa de nuevo Aceptar / recuperar operación');
  }
  const e = await obtenerInvitacionCarteraFirestore(enlaceId);
  if (!e || e.finalidad !== 'ONBOARDING_CARTERA' || e.emailInvitado !== correo ||
      !['PENDIENTE', 'ACEPTADA'].includes(e.estadoInvitacion || '')) throw new Error('Invitación no disponible para ese destinatario');
  if (e.estadoInvitacion === 'PENDIENTE' && e.fechaCaducidadMs! <= Date.now()) throw new Error('Invitación expirada');
  return e;
}

export async function aceptarOnboardingConCredenciales(enlaceId: string, email: string, password: string): Promise<UsuarioApp> {
  const e = await autenticarInvitadoCartera(enlaceId, email, password);
  await resolverInvitacionCarteraFirestore(enlaceId, 'ACEPTADA');
  const snap = await getDoc(doc(db, 'usuarios', e.usuarioIdVinculado!));
  const usuario = datos<UsuarioApp>(snap);
  const { syncAuthIndex } = await import('./authService');
  await syncAuthIndex(usuario, auth.currentUser!);
  return usuario;
}

/** Direct reads for partial delegation; never query the entire owner portfolio
 * for a partial relation. Rules recheck each returned property at read time. */
export async function cargarCarterasOnboarding(usuario: UsuarioApp) {
  const a = actor();
  const mirror = await getDoc(doc(db, 'usuarios_auth', a.uid));
  if (!mirror.exists() || mirror.data().usuarioId !== usuario.id || mirror.data().estado !== 'ACTIVO')
    throw new Error('Identidad de cartera no sincronizada');
  const snap = await getDocs(query(collection(db, 'gestiones_cartera'), where('gestorUsuarioId', '==', mirror.data().usuarioId)));
  return Promise.all(snap.docs.map(async gs => {
    const gestion = datos<GestionCartera>(gs);
    if (gestion.estado !== 'ACTIVA') return { gestion, inmuebles: [] };
    const documentos = gestion.inmuebleIds.length
      ? await Promise.all(gestion.inmuebleIds.map(i => getDoc(doc(db, 'inmuebles', i))))
      : (await getDocs(query(collection(db, 'inmuebles'), where('propietarioId', '==', gestion.propietarioId)))).docs;
    return { gestion, inmuebles: documentos.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() } as { id: string; descripcion?: string })) };
  }));
}
