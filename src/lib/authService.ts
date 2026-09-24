import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User as FirebaseUser,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { auth, db, USUARIOS_COL, ENLACES_REGISTRO_COL, saveAuditLogFirestore } from './firebase';
import { validarActivacionPendiente } from './accesoPropietarios';
import {
  contratosDelInquilino,
  puedeAccederContrato,
  puedeAccederInmueble,
  resolverAlcance,
} from '../inquilino/scope';
import {
  UsuarioApp,
  Inmueble,
  ContratoFormalizacion,
  Candidato,
  EnlaceRegistro,
  Propietario,
  Profesional,
  TipoProfesional,
  TipoPropietario,
  CobroPeriodo,
  ROLES_PREDEFINIDOS,
  PERMISOS_SISTEMA,
} from '../types';

export const ADMIN_MASTER_EMAIL = 'sarqsan2@gmail.com';

/**
 * FASE 1.4 — Mantiene el espejo de identidad `usuarios_auth/{uid}` que las
 * Security Rules usan para resolver el rol y el propietarioId a partir del UID
 * de Firebase Authentication (las reglas no pueden hacer consultas, sólo una
 * lectura puntual por ruta). El documento es reducido y el usuario sólo puede
 * escribirlo si coincide con su perfil autoritativo de `usuarios/{id}` (la
 * propia regla lo fuerza), por lo que no sirve para escalar privilegios.
 * Es idempotente y nunca debe bloquear el inicio de sesión.
 */
export async function syncAuthIndex(
  usuario: UsuarioApp,
  authUser?: { uid: string } | null
): Promise<void> {
  try {
    const fb = authUser || auth.currentUser;
    if (!fb || !fb.uid || !usuario || !usuario.id) return;
    const payload = {
      uid: fb.uid,
      usuarioId: usuario.id,
      email: usuario.email || '',
      tipoPerfil: usuario.tipoPerfil,
      estado: usuario.estado,
      roles: Array.isArray(usuario.roles) ? usuario.roles : [],
      propietarioId: usuario.propietarioId || '',
      profesionalId: usuario.profesionalId || '',
      inmuebleIds: Array.isArray(usuario.inmuebleIds) ? usuario.inmuebleIds : [],
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'usuarios_auth', fb.uid), payload, { merge: true });
  } catch (err) {
    console.warn('No se pudo sincronizar el espejo de identidad usuarios_auth:', err);
  }
}

/**
 * Genera un hash criptográfico SHA-256 seguro para verificación de credenciales directas.
 */
async function hashPassword(password: string): Promise<string> {
  try {
    const enc = new TextEncoder();
    const data = enc.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    // Fallback simple si crypto.subtle no está disponible
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `fb_${Math.abs(hash).toString(16)}`;
  }
}

/**
 * Busca un usuario en la colección `usuarios` mediante su Firebase Auth UID.
 * Si no lo encuentra por authUid pero existe un registro con el mismo email,
 * vincula de forma segura el authUid al documento existente.
 */
export async function getUsuarioByAuthUid(
  authUid: string,
  fallbackEmail?: string | null
): Promise<UsuarioApp | null> {
  try {
    // 0. Búsqueda directa por doc ID = authUid
    try {
      const directSnap = await getDoc(doc(db, 'usuarios', authUid));
      if (directSnap.exists()) {
        return { id: directSnap.id, ...directSnap.data() } as UsuarioApp;
      }
    } catch (e) {
      // Continuar
    }

    // Si es el Administrador Principal, comprobar directamente su documento fijo
    if (fallbackEmail && fallbackEmail.trim().toLowerCase() === ADMIN_MASTER_EMAIL) {
      try {
        const adminSnap = await getDoc(doc(db, 'usuarios', 'user_admin_principal'));
        if (adminSnap.exists()) {
          const adminData = adminSnap.data() as UsuarioApp;
          if (adminData.authUid !== authUid) {
            const updated = {
              ...adminData,
              authUid,
              updatedAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString(),
            };
            await setDoc(doc(db, 'usuarios', 'user_admin_principal'), updated, { merge: true });
            return { id: 'user_admin_principal', ...updated } as UsuarioApp;
          }
          return { id: adminSnap.id, ...adminData } as UsuarioApp;
        }
      } catch (e) {
        // Continuar
      }
    }

    // 0b. ACCESO-PROPIETARIOS: resolución por espejo de identidad.
    // Lecturas directas (permitidas al titular) en lugar de consultas
    // globales, que las reglas solo permiten al administrador.
    try {
      const mirrorSnap = await getDoc(doc(db, 'usuarios_auth', authUid));
      if (mirrorSnap.exists()) {
        const usuarioId = (mirrorSnap.data() as { usuarioId?: unknown })?.usuarioId;
        if (typeof usuarioId === 'string' && usuarioId.length > 0) {
          const perfilSnap = await getDoc(doc(db, 'usuarios', usuarioId));
          if (perfilSnap.exists()) {
            return { id: perfilSnap.id, ...perfilSnap.data() } as UsuarioApp;
          }
        }
      }
    } catch (e) {
      // Continuar con la resolución histórica
    }

    // 1. Búsqueda directa por authUid
    const qAuth = query(USUARIOS_COL, where('authUid', '==', authUid));
    const snapAuth = await getDocs(qAuth);
    if (!snapAuth.empty) {
      const docSnap = snapAuth.docs[0];
      return { id: docSnap.id, ...docSnap.data() } as UsuarioApp;
    }

    // 2. Si no se encuentra por authUid pero tenemos el email verificado de Firebase Auth
    if (fallbackEmail) {
      const normalizedEmail = fallbackEmail.trim().toLowerCase();
      const qEmail = query(USUARIOS_COL, where('email', '==', normalizedEmail));
      const snapEmail = await getDocs(qEmail);

      if (!snapEmail.empty) {
        const docSnap = snapEmail.docs[0];
        const existingData = docSnap.data() as UsuarioApp;

        // Vinculación unívoca e invariable con Firebase Auth UID
        const updatedUser: UsuarioApp = {
          ...existingData,
          id: docSnap.id,
          authUid,
          updatedAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        };

        await setDoc(doc(db, 'usuarios', docSnap.id), updatedUser, { merge: true });

        await saveAuditLogFirestore({
          usuarioId: docSnap.id,
          usuarioEmail: normalizedEmail,
          usuarioNombre: existingData.nombre,
          accion: 'USUARIO_AUTHUID_VINCULADO',
          descripcion: `Vinculación de identidad real de Firebase Authentication UID [${authUid}] con el registro de usuario.`,
          entidadAfectada: 'usuario',
          idAfectado: docSnap.id,
          resultado: 'EXITO',
        });

        return updatedUser;
      }
    }

    return null;
  } catch (error) {
    console.error('Error buscando usuario por authUid:', error);
    return null;
  }
}

/**
 * Iniciar sesión con Email y Contraseña. Soporta tanto Firebase Authentication como verificación directa.
 */
export async function loginWithEmail(
  emailInput: string,
  passwordInput: string
): Promise<{ firebaseUser: FirebaseUser | null; usuarioApp: UsuarioApp }> {
  const email = emailInput.trim().toLowerCase();

  let firebaseUser: FirebaseUser | null = null;
  let authProviderDisabled = false;

  // 1. Autenticación real en Firebase Auth (si está habilitado el proveedor)
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, passwordInput);
    firebaseUser = userCredential.user;
  } catch (authErr: any) {
    if (authErr?.code === 'auth/operation-not-allowed' || authErr?.message?.includes('operation-not-allowed')) {
      authProviderDisabled = true;
      console.warn('Firebase Auth: Proveedor Email/Contraseña deshabilitado en Firebase Console. Procediendo con verificación directa.');
    } else {
      throw authErr;
    }
  }

  // 2. Localización y validación del usuario en Firestore
  let usuario: UsuarioApp | null = null;

  if (firebaseUser) {
    usuario = await getUsuarioByAuthUid(firebaseUser.uid, firebaseUser.email);
  } else if (authProviderDisabled) {
    const pHash = await hashPassword(passwordInput);

    if (email === ADMIN_MASTER_EMAIL) {
      const adminSnap = await getDoc(doc(db, 'usuarios', 'user_admin_principal'));
      if (adminSnap.exists()) {
        const adminData = adminSnap.data() as any;
        if (adminData.passwordHash && adminData.passwordHash !== pHash) {
          throw new Error('Contraseña incorrecta para el Administrador Principal.');
        }
        usuario = { id: 'user_admin_principal', ...adminData } as UsuarioApp;
      }
    } else {
      const qEmail = query(USUARIOS_COL, where('email', '==', email));
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) {
        const uDoc = snapEmail.docs[0];
        const uData = uDoc.data() as any;
        if (uData.passwordHash && uData.passwordHash !== pHash) {
          throw new Error('Contraseña incorrecta.');
        }
        usuario = { id: uDoc.id, ...uData } as UsuarioApp;
      }
    }
  }

  if (!usuario) {
    // Si es el email del administrador principal y por algún motivo no estaba en la colección, crearlo
    if (email === ADMIN_MASTER_EMAIL) {
      const pHash = await hashPassword(passwordInput);
      const adminId = 'user_admin_principal';
      usuario = {
        id: adminId,
        authUid: firebaseUser ? firebaseUser.uid : 'admin_master_uid',
        nombre: 'Administrador Principal',
        apellidos: 'RentSelect',
        email: ADMIN_MASTER_EMAIL,
        telefono: '+34 600 111 222',
        tipoPerfil: 'ADMINISTRADOR',
        estado: 'ACTIVO',
        roles: ['SUPERADMIN'],
        permisos: PERMISOS_SISTEMA.map((p) => p.codigo),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'usuarios', adminId), { ...usuario, passwordHash: pHash }, { merge: true });
    } else {
      if (firebaseUser) await signOut(auth);
      throw new Error(
        'Acceso denegado: Tu cuenta no tiene un perfil registrado en la plataforma. Contacta con el administrador o utiliza un enlace de invitación.'
      );
    }
  }

  // 3. Comprobación de seguridad: Usuario bloqueado
  if (usuario.estado === 'BLOQUEADO') {
    if (firebaseUser) await signOut(auth);
    throw new Error('Esta cuenta ha sido bloqueada por la administración del sistema.');
  }
  // LOGIN ÚNICO §6: solo ACTIVO accede (mensajes comprensibles, sin internos).
  if (usuario.estado === 'PENDIENTE') {
    if (firebaseUser) await signOut(auth);
    throw new Error('Tu cuenta está pendiente de activación. Revisa tu invitación o contacta con la administración.');
  }
  if (usuario.estado === 'INACTIVO') {
    if (firebaseUser) await signOut(auth);
    throw new Error('Tu cuenta está desactivada. Contacta con la administración si necesitas acceso.');
  }

  // 4. Guardar sesión activa local para persistencia segura
  try {
    localStorage.setItem('rentselect_active_session', JSON.stringify(usuario));
    localStorage.setItem('rentselect_current_user_id', usuario.id);
  } catch (e) {}

  // 5. Actualizar timestamp de último acceso y registrar auditoría
  await setDoc(
    doc(db, 'usuarios', usuario.id),
    { lastLoginAt: new Date().toISOString() },
    { merge: true }
  );

  await saveAuditLogFirestore({
    usuarioId: usuario.id,
    usuarioEmail: usuario.email,
    usuarioNombre: usuario.nombre,
    accion: 'LOGIN_EXITOSO',
    descripcion: `Inicio de sesión exitoso como ${usuario.tipoPerfil} (${firebaseUser ? `Firebase Auth UID: ${firebaseUser.uid}` : 'Acceso Directo'}).`,
    entidadAfectada: 'usuario',
    idAfectado: usuario.id,
    resultado: 'EXITO',
  });

  // FASE 1.4: escribir el espejo de identidad para las Security Rules.
  if (firebaseUser) {
    await syncAuthIndex(usuario, firebaseUser);
  }

  return { firebaseUser, usuarioApp: usuario };
}

/**
 * Procedimiento de configuración inicial para el primer Administrador del sistema.
 * Solo puede ser invocado para el email designado (ADMIN_MASTER_EMAIL).
 */
export async function initFirstAdminAccount(
  passwordInput: string
): Promise<{ firebaseUser: FirebaseUser | null; usuarioApp: UsuarioApp }> {
  if (passwordInput.length < 6) {
    throw new Error('La contraseña debe tener al menos 6 caracteres.');
  }

  let firebaseUser: FirebaseUser | null = null;
  let providerDisabled = false;

  try {
    // Intentar crear la cuenta en Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, ADMIN_MASTER_EMAIL, passwordInput);
    firebaseUser = cred.user;
    await updateProfile(firebaseUser, { displayName: 'Administrador Principal' });
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      try {
        const cred = await signInWithEmailAndPassword(auth, ADMIN_MASTER_EMAIL, passwordInput);
        firebaseUser = cred.user;
      } catch (loginErr: any) {
        console.warn('El administrador ya existe en Auth, iniciando verificación local:', loginErr);
      }
    } else if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
      providerDisabled = true;
      console.warn('Firebase Auth: Proveedor Email/Contraseña deshabilitado en Firebase Console. Inicializando credenciales en Firestore directamente.');
    } else {
      throw err;
    }
  }

  const pHash = await hashPassword(passwordInput);

  // Vincular o crear el registro en la colección `usuarios`
  const adminId = 'user_admin_principal';
  const adminUser: UsuarioApp = {
    id: adminId,
    authUid: firebaseUser ? firebaseUser.uid : 'admin_master_uid',
    nombre: 'Administrador Principal',
    apellidos: 'RentSelect',
    email: ADMIN_MASTER_EMAIL,
    telefono: '+34 600 111 222',
    tipoPerfil: 'ADMINISTRADOR',
    estado: 'ACTIVO',
    roles: ['SUPERADMIN'],
    permisos: PERMISOS_SISTEMA.map((p) => p.codigo),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'usuarios', adminId), {
    ...adminUser,
    passwordHash: pHash,
    authMethod: providerDisabled ? 'direct_firestore' : 'firebase_auth',
  }, { merge: true });

  // Guardar sesión activa local para persistencia segura
  try {
    localStorage.setItem('rentselect_active_session', JSON.stringify(adminUser));
    localStorage.setItem('rentselect_current_user_id', adminId);
  } catch (e) {}

  await saveAuditLogFirestore({
    usuarioId: adminId,
    usuarioEmail: ADMIN_MASTER_EMAIL,
    usuarioNombre: adminUser.nombre,
    accion: 'ADMIN_CUENTA_CONFIGURADA',
    descripcion: providerDisabled
      ? 'Configuración exitosa de credenciales de Administrador Principal con acceso directo garantizado.'
      : 'Inicialización segura de credenciales de Firebase Authentication para el Administrador Principal.',
    entidadAfectada: 'usuario',
    idAfectado: adminId,
    resultado: 'EXITO',
  });

  return { firebaseUser, usuarioApp: adminUser };
}

/**
 * ACCESO-PROPIETARIOS — Activa el usuario pendiente de una invitación nominal.
 * Vincula el UID de Auth recién creado y pasa la ficha a ACTIVO. No crea
 * usuario ni propietario; no toca identidad, roles, permisos ni vínculos.
 */
async function activarUsuarioVinculado(params: {
  enlace: EnlaceRegistro;
  email: string;
  nombre: string;
  apellidos?: string;
  telefono?: string;
  firebaseUser: FirebaseUser;
}): Promise<{ firebaseUser: FirebaseUser | null; usuarioApp: UsuarioApp }> {
  const { enlace, email, nombre, apellidos, telefono, firebaseUser } = params;
  const emailNorm = email.trim().toLowerCase();

  // 1. Leer la ficha pendiente por get() directo (firmado).
  const pendienteSnap = await getDoc(doc(db, 'usuarios', enlace.usuarioIdVinculado as string));
  const pendiente = (
    pendienteSnap.exists() ? { id: pendienteSnap.id, ...pendienteSnap.data() } : null
  ) as UsuarioApp | null;

  // 2. Validar contra la invitación (perfil, estado, email, propietario).
  const v = validarActivacionPendiente(pendiente, enlace, emailNorm);
  if (!v.ok || !pendiente) {
    throw new Error(v.errores[0] || 'No se puede activar esta cuenta.');
  }

  await updateProfile(firebaseUser, {
    displayName: `${nombre} ${apellidos || ''}`.trim() || pendiente.nombre,
  });

  // 3. Vincular UID + activar. Solo claves permitidas por las reglas
  //    (PENDIENTE→ACTIVO con email coincidente; lo demás queda intacto).
  const ahora = new Date().toISOString();
  const actualizacion: Record<string, unknown> = {
    authUid: firebaseUser.uid,
    estado: 'ACTIVO',
    enlaceRegistroId: enlace.id,
    updatedAt: ahora,
    lastLoginAt: ahora,
  };
  if (nombre.trim()) actualizacion.nombre = nombre.trim();
  if (apellidos?.trim()) actualizacion.apellidos = apellidos.trim();
  if (telefono?.trim()) actualizacion.telefono = telefono.trim();
  await updateDoc(doc(db, 'usuarios', pendiente.id), actualizacion);
  const usuarioActivado: UsuarioApp = {
    ...pendiente,
    ...(actualizacion as Partial<UsuarioApp>),
  };

  // 4. Espejo de identidad (las reglas lo exigen veraz contra la ficha).
  await syncAuthIndex(usuarioActivado, firebaseUser);

  // 5. Consumir la invitación nominal (un solo uso).
  await setDoc(
    doc(db, 'enlaces_registro', enlace.id),
    { usosActuales: (enlace.usosActuales || 0) + 1 },
    { merge: true }
  );

  // 6. Sesión local + auditoría (mismo contrato que el alta clásica).
  try {
    localStorage.setItem('rentselect_active_session', JSON.stringify(usuarioActivado));
    localStorage.setItem('rentselect_current_user_id', usuarioActivado.id);
  } catch (e) {}

  await saveAuditLogFirestore({
    usuarioId: usuarioActivado.id,
    usuarioEmail: usuarioActivado.email,
    usuarioNombre: usuarioActivado.nombre,
    accion: 'ACTIVACION_USUARIO_INVITACION',
    descripcion: `Activación de cuenta PROPIETARIO pendiente mediante invitación nominal [${enlace.token}].`,
    entidadAfectada: 'usuario',
    idAfectado: usuarioActivado.id,
    resultado: 'EXITO',
  });

  return { firebaseUser, usuarioApp: usuarioActivado };
}

/**
 * Registro de un usuario nuevo mediante un enlace de invitación oficial.
 * Restricción estricta: NUNCA permite crear privilegios de ADMINISTRADOR ni SUPERADMIN.
 */
export async function registerWithInvitationLink(params: {
  enlace: EnlaceRegistro;
  email: string;
  password: string;
  nombre: string;
  apellidos?: string;
  telefono?: string;
  cifNif?: string;
  nombreComercial?: string;
  especialidades?: string[];
  provincia?: string;
  municipio?: string;
}): Promise<{ firebaseUser: FirebaseUser | null; usuarioApp: UsuarioApp }> {
  const {
    enlace,
    email,
    password,
    nombre,
    apellidos,
    telefono,
    cifNif,
    nombreComercial,
    especialidades = [],
    provincia = 'Almería',
    municipio = '',
  } = params;

  // Verificación estricta de seguridad contra elevación de privilegios
  if ((enlace.tipoPerfil as string) === 'ADMINISTRADOR') {
    throw new Error('Seguridad: Los enlaces públicos no pueden crear perfiles de administración.');
  }

  const tipoPerfil: 'PROPIETARIO' | 'PROFESIONAL' | 'INQUILINO' =
    enlace.tipoPerfil === 'PROFESIONAL'
      ? 'PROFESIONAL'
      : enlace.tipoPerfil === 'INQUILINO'
      ? 'INQUILINO'
      : 'PROPIETARIO';

  // BLOQUE E: la invitación de inquilino exige contrato vinculado (alcance del portal)
  if (tipoPerfil === 'INQUILINO' && !enlace.contratoIdVinculado) {
    throw new Error('Seguridad: esta invitación de inquilino no tiene contrato vinculado.');
  }

  let firebaseUser: FirebaseUser | null = null;
  try {
    // 1. Crear usuario real en Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    firebaseUser = userCredential.user;
    await updateProfile(firebaseUser, { displayName: `${nombre} ${apellidos || ''}`.trim() });
  } catch (err: any) {
    if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
      console.warn('Firebase Auth: Proveedor Email/Contraseña deshabilitado en Firebase Console. Registrando usuario directamente.');
    } else {
      throw err;
    }
  }

  // ACCESO-PROPIETARIOS: la invitación nominal activa el usuario pendiente
  // vinculado (sin crear usuario ni propietario). Solo perfil PROPIETARIO;
  // INQUILINO y PROFESIONAL conservan su flujo intacto.
  if (tipoPerfil === 'PROPIETARIO' && enlace.usuarioIdVinculado) {
    if (!firebaseUser) {
      throw new Error('La activación nominal requiere Firebase Authentication (proveedor Email/Contraseña).');
    }
    return activarUsuarioVinculado({
      enlace,
      email,
      nombre,
      apellidos,
      telefono,
      firebaseUser,
    });
  }

  // 2. Determinar rol predefinido según el enlace
  const rolDef = ROLES_PREDEFINIDOS.find((r) =>
    tipoPerfil === 'PROPIETARIO'
      ? r.id === 'PROPIETARIO_ESTANDAR'
      : tipoPerfil === 'INQUILINO'
      ? r.id === 'INQUILINO_PORTAL'
      : r.id === 'PROFESIONAL_MANTENIMIENTO'
  );

  // BLOQUE E: el inquilino usa su Auth UID como ID de documento, porque las reglas
  // resuelven el alcance vía usuarios/{uid}. Sin Firebase Auth no hay aislamiento.
  if (tipoPerfil === 'INQUILINO' && !firebaseUser) {
    throw new Error('El registro de inquilino requiere Firebase Authentication (proveedor Email/Contraseña).');
  }
  const userId =
    tipoPerfil === 'INQUILINO' && firebaseUser
      ? firebaseUser.uid
      : `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const pHash = await hashPassword(password);

  const nuevoUsuario: UsuarioApp = {
    id: userId,
    authUid: firebaseUser ? firebaseUser.uid : `uid_${Date.now()}`,
    nombre: nombre.trim(),
    apellidos: apellidos?.trim() || undefined,
    email: email.trim().toLowerCase(),
    telefono: telefono?.trim() || undefined,
    tipoPerfil,
    estado: 'ACTIVO',
    roles: rolDef ? [rolDef.id] : [],
    permisos: rolDef ? rolDef.permisos : [],
    ...(tipoPerfil === 'INQUILINO' && enlace.contratoIdVinculado
      ? { contratoIds: [enlace.contratoIdVinculado], enlaceRegistroId: enlace.id }
      : {}),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  // 3. Determinar el ID de la entidad relacionada y vincularlo al usuario
  // BLOQUE E: el inquilino no crea entidad; su alcance es su contrato vinculado.
  let propId: string | undefined;
  let profId: string | undefined;
  if (tipoPerfil === 'PROPIETARIO') {
    propId = enlace.propietarioIdVinculado || `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    nuevoUsuario.propietarioId = propId;
  } else if (tipoPerfil === 'PROFESIONAL') {
    profId = enlace.profesionalIdVinculado || `prof_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    nuevoUsuario.profesionalId = profId;
  }

  // 4. Guardar PRIMERO el registro de usuario (documento autoritativo)...
  await setDoc(doc(db, 'usuarios', userId), { ...nuevoUsuario, passwordHash: pHash });

  // 4b. ...y después el espejo de identidad que leen las Security Rules.
  //     Debe existir antes de crear la ficha de propietario (su regla lo exige).
  if (firebaseUser) {
    await syncAuthIndex(nuevoUsuario, firebaseUser);
  }

  // 5. Crear la entidad relacionada (Propietario o Profesional)
  if (tipoPerfil === 'PROPIETARIO' && propId) {
    // ACCESO-PROPIETARIOS: si el ID vino de la invitación y la ficha ya
    // existe, reutilizarla sin sobrescribir datos reales con marcadores.
    if (enlace.propietarioIdVinculado && propId === enlace.propietarioIdVinculado) {
      try {
        const fichaPrevia = await getDoc(doc(db, 'propietarios', propId));
        if (fichaPrevia.exists()) {
          propId = undefined;
        }
      } catch (e) {
        // Sin lectura: mantener el alta clásica.
      }
    }
  }
  if (tipoPerfil === 'PROPIETARIO' && propId) {
    const propietarioData: Propietario = {
      id: propId,
      nombre: `${nombre.trim()} ${apellidos?.trim() || ''}`.trim(),
      nifCif: cifNif?.trim() || 'NO_INDICADO',
      email: email.trim().toLowerCase(),
      telefono: telefono?.trim() || '',
      direccion: 'Pendiente de cumplimentar',
      ciudad: municipio?.trim() || 'Pendiente',
      codigoPostal: '00000',
      provincia: provincia.trim() || undefined,
      tipoPropietario: 'persona_fisica',
      cuentasBancarias: [],
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    };
    await setDoc(doc(db, 'propietarios', propId), propietarioData, { merge: true });
  } else if (tipoPerfil === 'PROFESIONAL' && profId) {
    const profesionalData: Profesional = {
      id: profId,
      usuarioId: userId,
      tipo: 'AUTONOMO',
      nombreComercial: nombreComercial?.trim() || nombre.trim(),
      contactoNombre: nombre.trim(),
      cifNif: cifNif?.trim() || undefined,
      email: email.trim().toLowerCase(),
      telefono: telefono?.trim() || undefined,
      especialidades,
      zonasServicio: [{ id: 'z1', provincia: provincia.trim(), municipio: municipio.trim() || undefined }],
      inmuebleIdsAsignados: [],
      activo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'profesionales', profId), profesionalData, { merge: true });
  }

  // 6. Incrementar usos del enlace
  await setDoc(
    doc(db, 'enlaces_registro', enlace.id),
    { usosActuales: (enlace.usosActuales || 0) + 1 },
    { merge: true }
  );

  // Guardar sesión activa local para persistencia segura
  try {
    localStorage.setItem('rentselect_active_session', JSON.stringify(nuevoUsuario));
    localStorage.setItem('rentselect_current_user_id', userId);
  } catch (e) {}

  // 6. Registro de auditoría
  await saveAuditLogFirestore({
    usuarioId: userId,
    usuarioEmail: nuevoUsuario.email,
    usuarioNombre: nuevoUsuario.nombre,
    accion: 'REGISTRO_USUARIO_INVITACION',
    descripcion: `Alta exitosa de nuevo ${tipoPerfil} mediante enlace [${enlace.token}].`,
    entidadAfectada: 'usuario',
    idAfectado: userId,
    resultado: 'EXITO',
  });

  return { firebaseUser, usuarioApp: nuevoUsuario };
}

// =========================================================================
// REGISTRO AUTÓNOMO — Alta sin invitación (PROPIETARIO / PROFESIONAL)
// -------------------------------------------------------------------------
// Núcleo interno de altas autónomas. La UI (formularios/selectores) llegará
// en un bloque posterior; este servicio define el contrato y las garantías.
// NO sustituye a `registerWithInvitationLink` (invitaciones intactas).
// Orden de escrituras exigido por las reglas: usuarios → espejo → ficha.
// =========================================================================

export interface RegisterAutonomoBaseParams {
  tipoPerfil: 'PROPIETARIO' | 'PROFESIONAL';
  email: string;
  password: string;
  nombre: string;
  apellidos?: string;
  telefono?: string;
}

export interface RegisterAutonomoPropietarioParams extends RegisterAutonomoBaseParams {
  tipoPerfil: 'PROPIETARIO';
  /** NIF/CIF/NIE real (obligatorio: el modelo Propietario no admite marcadores). */
  nifCif: string;
  /** Domicilio real a efectos de notificaciones. */
  direccion: string;
  ciudad: string;
  codigoPostal: string;
  provincia?: string;
  tipoPropietario?: TipoPropietario;
}

export interface RegisterAutonomoProfesionalParams extends RegisterAutonomoBaseParams {
  tipoPerfil: 'PROFESIONAL';
  nombreComercial: string;
  cifNif?: string;
  /** Al menos una especialidad real (mismo criterio que el alta manual). */
  especialidades: string[];
  /** Provincia de la zona de servicio (obligatoria). */
  provincia: string;
  municipio?: string;
  tipo?: TipoProfesional;
  /** Zonas de cobertura adicionales (la principal va en provincia/municipio). */
  zonasAdicionales?: Array<{ provincia: string; municipio?: string }>;
}

export type RegisterAutonomoParams =
  | RegisterAutonomoPropietarioParams
  | RegisterAutonomoProfesionalParams;

/** Rol estándar exacto que corresponde a cada perfil autónomo (nunca admin). */
const ROLES_AUTONOMOS: Record<'PROPIETARIO' | 'PROFESIONAL', string> = {
  PROPIETARIO: 'PROPIETARIO_ESTANDAR',
  PROFESIONAL: 'PROFESIONAL_MANTENIMIENTO',
};

/** IDs con el mismo formato que el resto de altas (`prefijo_timestamp_aleatorio`). */
function generarIdAutonomo(prefijo: string): string {
  return `${prefijo}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

/** Email con el mismo criterio que el resto del sistema (ver notificaciones/resolucion). */
function esEmailAutonomoValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function exigirTextoAutonomo(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    throw new Error(`Registro autónomo: el campo '${campo}' es obligatorio.`);
  }
  return valor.trim();
}

interface BaseAutonomaValidada {
  tipoPerfil: 'PROPIETARIO' | 'PROFESIONAL';
  email: string;
  password: string;
  nombre: string;
  apellidos?: string;
  telefono?: string;
  rolId: string;
}

/**
 * Valida y normaliza los datos comunes ANTES de tocar Firebase Auth.
 * Fija rol y permisos de forma inmutable: el llamante nunca puede indicarlos
 * (ni siquiera con `as any`). Las reglas Firestore son la segunda barrera.
 */
function validarBaseAutonoma(params: RegisterAutonomoParams): BaseAutonomaValidada {
  if (!params || typeof params !== 'object') {
    throw new Error('Registro autónomo: faltan los datos del alta.');
  }
  const crudo = params as unknown as Record<string, unknown>;
  if ('roles' in crudo || 'permisos' in crudo) {
    throw new Error('Seguridad: no está permitido indicar roles ni permisos en el alta autónoma.');
  }
  const tipoPerfil = crudo.tipoPerfil;
  if (tipoPerfil !== 'PROPIETARIO' && tipoPerfil !== 'PROFESIONAL') {
    throw new Error('Seguridad: el alta autónoma solo admite perfiles PROPIETARIO o PROFESIONAL.');
  }
  const email = exigirTextoAutonomo(crudo.email, 'email').toLowerCase();
  if (!esEmailAutonomoValido(email)) {
    throw new Error('Registro autónomo: el email no es válido.');
  }
  if (typeof crudo.password !== 'string' || crudo.password.length < 6) {
    throw new Error('Registro autónomo: la contraseña debe tener al menos 6 caracteres.');
  }
  const nombre = exigirTextoAutonomo(crudo.nombre, 'nombre');
  const apellidos =
    typeof crudo.apellidos === 'string' && crudo.apellidos.trim().length > 0
      ? crudo.apellidos.trim()
      : undefined;
  const telefono =
    typeof crudo.telefono === 'string' && crudo.telefono.trim().length > 0
      ? crudo.telefono.trim()
      : undefined;

  // Rol exacto por perfil, verificado contra el catálogo (nunca admin).
  const rolId = ROLES_AUTONOMOS[tipoPerfil];
  const rolDef = ROLES_PREDEFINIDOS.find((r) => r.id === rolId);
  if (!rolDef || rolDef.id === 'SUPERADMIN') {
    throw new Error('Seguridad: rol no disponible para el alta autónoma.');
  }
  return { tipoPerfil, email, password: crudo.password, nombre, apellidos, telefono, rolId };
}

/**
 * REGISTRO AUTÓNOMO — Alta sin invitación (PROPIETARIO o PROFESIONAL).
 *
 * Flujo: valida datos → crea Firebase Auth → genera IDs nuevos →
 * `usuarios/{id}` (ACTIVO, rol exacto, sin permisos) → espejo
 * `usuarios_auth/{uid}` → ficha `propietarios/{id}` o `profesionales/{id}`
 * con los datos reales del formulario → auditoría → sesión local.
 *
 * Garantías: solo PROPIETARIO/PROFESIONAL; email válido ligado a la cuenta
 * Auth; IDs siempre nuevos; sin roles/permisos administrativos (imposibles
 * de inyectar); sin datos ficticios (los obligatorios se exigen).
 * Email duplicado → error controlado (no toca la cuenta existente).
 * Fallo tras crear Auth → error técnico controlado (sin auto-reparación).
 */
export async function registerAutonomo(
  params: RegisterAutonomoParams
): Promise<{ firebaseUser: FirebaseUser; usuarioApp: UsuarioApp }> {
  // 0. Validación de servicio (antes de crear nada en Firebase Auth).
  const base = validarBaseAutonoma(params);
  const { tipoPerfil, email, password, nombre, apellidos, rolId } = base;

  // Datos reales de la ficha (nunca marcadores ficticios).
  let telefonoProp = '';
  let nifCif = '';
  let direccion = '';
  let ciudad = '';
  let codigoPostal = '';
  let provinciaProp: string | undefined;
  let tipoProp: TipoPropietario = 'persona_fisica';
  let nombreComercial = '';
  let cifNifProf: string | undefined;
  let especialidades: string[] = [];
  let provinciaProf = '';
  let zonasAdicionales: Array<{ provincia: string; municipio?: string }> = [];
  let municipioProf: string | undefined;
  let tipoProf: TipoProfesional = 'AUTONOMO';

  if (tipoPerfil === 'PROPIETARIO') {
    const p = params as RegisterAutonomoPropietarioParams;
    telefonoProp = exigirTextoAutonomo(base.telefono, 'telefono');
    nifCif = exigirTextoAutonomo(p.nifCif, 'nifCif');
    direccion = exigirTextoAutonomo(p.direccion, 'direccion');
    ciudad = exigirTextoAutonomo(p.ciudad, 'ciudad');
    codigoPostal = exigirTextoAutonomo(p.codigoPostal, 'codigoPostal');
    provinciaProp =
      typeof p.provincia === 'string' && p.provincia.trim().length > 0 ? p.provincia.trim() : undefined;
    if (p.tipoPropietario !== undefined) {
      if (
        p.tipoPropietario !== 'persona_fisica' &&
        p.tipoPropietario !== 'persona_juridica' &&
        p.tipoPropietario !== 'comunidad_bienes'
      ) {
        throw new Error('Registro autónomo: el campo \'tipoPropietario\' no es válido.');
      }
      tipoProp = p.tipoPropietario;
    }
  } else {
    const p = params as RegisterAutonomoProfesionalParams;
    nombreComercial = exigirTextoAutonomo(p.nombreComercial, 'nombreComercial');
    cifNifProf =
      typeof p.cifNif === 'string' && p.cifNif.trim().length > 0 ? p.cifNif.trim() : undefined;
    especialidades = (Array.isArray(p.especialidades) ? p.especialidades : [])
      .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
      .map((e) => e.trim());
    if (especialidades.length === 0) {
      throw new Error('Registro autónomo: indica al menos una especialidad.');
    }
    provinciaProf = exigirTextoAutonomo(p.provincia, 'provincia');
    municipioProf =
      typeof p.municipio === 'string' && p.municipio.trim().length > 0 ? p.municipio.trim() : undefined;
    if (p.zonasAdicionales !== undefined) {
      if (!Array.isArray(p.zonasAdicionales)) {
        throw new Error('Registro autónomo: el campo \'zonasAdicionales\' no es válido.');
      }
      zonasAdicionales = p.zonasAdicionales.map((z, i) => {
        const zona = (z && typeof z === 'object' ? z : {}) as Record<string, unknown>;
        const prov = exigirTextoAutonomo(zona.provincia, `provincia de la zona adicional ${i + 1}`);
        const mun =
          typeof zona.municipio === 'string' && zona.municipio.trim().length > 0
            ? zona.municipio.trim()
            : undefined;
        return mun ? { provincia: prov, municipio: mun } : { provincia: prov };
      });
    }
    if (p.tipo !== undefined) {
      if (
        p.tipo !== 'EMPRESA' &&
        p.tipo !== 'AUTONOMO' &&
        p.tipo !== 'PARTICULAR' &&
        p.tipo !== 'PROFESIONAL_INDIVIDUAL' &&
        p.tipo !== 'OTRO'
      ) {
        throw new Error('Registro autónomo: el campo \'tipo\' de profesional no es válido.');
      }
      tipoProf = p.tipo;
    }
  }

  // 1-2. Crear la cuenta en Firebase Auth y obtener el UID real.
  // A diferencia del flujo con invitación, aquí Auth es obligatorio: las
  // reglas exigen authUid == UID y email == token.email en cada escritura.
  let firebaseUser: FirebaseUser | null = null;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    firebaseUser = cred.user;
    await updateProfile(firebaseUser, { displayName: `${nombre} ${apellidos || ''}`.trim() });
  } catch (err: any) {
    if (err?.code === 'auth/email-already-in-use') {
      throw new Error('Este correo electrónico ya tiene una cuenta. Inicia sesión con tu contraseña.');
    }
    if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
      throw new Error('Registro autónomo no disponible: el proveedor Email/Contraseña no está habilitado.');
    }
    throw err;
  }
  if (!firebaseUser) {
    throw new Error('Registro autónomo: no se pudo crear la cuenta de acceso.');
  }

  // 3. IDs completamente nuevos (nunca reutilizar entidades existentes).
  const userId = generarIdAutonomo('user');
  const entidadId = generarIdAutonomo(tipoPerfil === 'PROPIETARIO' ? 'prop' : 'prof');
  const ahora = new Date().toISOString();

  // 4. Documento autoritativo `usuarios/{id}` (rol exacto, sin permisos).
  const nuevoUsuario: UsuarioApp = {
    id: userId,
    authUid: firebaseUser.uid,
    nombre,
    ...(apellidos ? { apellidos } : {}),
    email,
    ...(base.telefono ? { telefono: base.telefono } : {}),
    tipoPerfil,
    estado: 'ACTIVO',
    roles: [rolId],
    permisos: [],
    ...(tipoPerfil === 'PROPIETARIO' ? { propietarioId: entidadId } : { profesionalId: entidadId }),
    createdAt: ahora,
    updatedAt: ahora,
    lastLoginAt: ahora,
  };

  // 5-6. Espejo de identidad + ficha. Escrituras secuenciales (no batch):
  // la regla de `propietarios/create` exige que el espejo ya exista.
  // Si algo falla tras crear Auth: error técnico controlado, sin
  // reparaciones silenciosas ni datos fabricados (§7).
  try {
    await setDoc(doc(db, 'usuarios', userId), nuevoUsuario);
    await syncAuthIndex(nuevoUsuario, firebaseUser);
    if (tipoPerfil === 'PROPIETARIO') {
      const ficha: Propietario = {
        id: entidadId,
        nombre: `${nombre} ${apellidos || ''}`.trim(),
        nifCif,
        email,
        telefono: telefonoProp,
        direccion,
        ciudad,
        codigoPostal,
        ...(provinciaProp ? { provincia: provinciaProp } : {}),
        tipoPropietario: tipoProp,
        cuentasBancarias: [],
        fechaCreacion: ahora,
        fechaActualizacion: ahora,
      };
      await setDoc(doc(db, 'propietarios', entidadId), ficha, { merge: true });
    } else {
      const ficha: Profesional = {
        id: entidadId,
        usuarioId: userId,
        tipo: tipoProf,
        nombreComercial,
        contactoNombre: `${nombre} ${apellidos || ''}`.trim(),
        ...(cifNifProf ? { cifNif: cifNifProf } : {}),
        email,
        ...(base.telefono ? { telefono: base.telefono } : {}),
        especialidades,
        zonasServicio: [
          { id: 'z1', provincia: provinciaProf, ...(municipioProf ? { municipio: municipioProf } : {}) },
          ...zonasAdicionales.map((z, i) => ({ id: `z${i + 2}`, ...z })),
        ],
        inmuebleIdsAsignados: [],
        activo: true,
        createdAt: ahora,
        updatedAt: ahora,
      };
      await setDoc(doc(db, 'profesionales', entidadId), ficha, { merge: true });
    }
  } catch (err: any) {
    await saveAuditLogFirestore({
      usuarioId: userId,
      usuarioEmail: email,
      usuarioNombre: nombre,
      accion: 'REGISTRO_AUTONOMO',
      descripcion:
        `Fallo parcial de alta autónoma ${tipoPerfil} [${email}]: cuenta Auth creada ` +
        `(UID ${firebaseUser.uid}) pero la escritura de documentos falló ` +
        `(${err?.code || err?.message || 'error desconocido'}).`,
      entidadAfectada: 'usuario',
      idAfectado: userId,
      resultado: 'ERROR',
    });
    throw new Error(
      `Alta incompleta: tu cuenta de acceso (${email}) se creó pero no se pudo completar el perfil. ` +
        'No se ha creado ningún perfil válido. Contacta con soporte indicando tu email. ' +
        `Detalle técnico: ${err?.code || err?.message || 'escritura denegada'}`
    );
  }

  // 7-8. Sesión local + auditoría del alta + retorno para continuar el login.
  try {
    localStorage.setItem('rentselect_active_session', JSON.stringify(nuevoUsuario));
    localStorage.setItem('rentselect_current_user_id', userId);
  } catch (e) {}

  await saveAuditLogFirestore({
    usuarioId: userId,
    usuarioEmail: email,
    usuarioNombre: nombre,
    accion: 'REGISTRO_AUTONOMO',
    descripcion: `Alta autónoma exitosa de nuevo ${tipoPerfil} [${email}] sin invitación.`,
    entidadAfectada: 'usuario',
    idAfectado: userId,
    resultado: 'EXITO',
  });

  return { firebaseUser, usuarioApp: nuevoUsuario };
}

/**
 * RECUPERACIÓN — Envía el correo de restablecimiento de Firebase Auth.
 * Anti-enumeración: valida formato sin consultar Firestore y trata la
 * inexistencia de cuenta como éxito neutral (mismo camino que el envío).
 * Los errores técnicos se propagan para mostrar un mensaje genérico.
 */
export async function enviarRecuperacionPassword(emailInput: string): Promise<void> {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Indica un correo electrónico válido para recuperar tu contraseña.');
  }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-email') {
      return;
    }
    throw err;
  }
}

/**
 * Cerrar sesión en la aplicación.
 */
export async function logoutUser(): Promise<void> {
  const current = auth.currentUser;
  if (current) {
    try {
      await saveAuditLogFirestore({
        usuarioId: current.uid,
        usuarioEmail: current.email || 'desconocido',
        usuarioNombre: current.displayName || 'Usuario',
        accion: 'LOGOUT',
        descripcion: 'Cierre de sesión seguro en la plataforma.',
        entidadAfectada: 'usuario',
        idAfectado: current.uid,
        resultado: 'EXITO',
      });
    } catch (e) {
      console.warn('Audit log on logout error:', e);
    }
  }

  try {
    localStorage.removeItem('rentselect_active_session');
    localStorage.removeItem('rentselect_current_user_id');
    localStorage.removeItem('rentselect_propietarios');
    localStorage.removeItem('rentselect_candidatos');
    localStorage.removeItem('rentselect_inmuebles');
    localStorage.removeItem('rentselect_solicitudes');
    localStorage.removeItem('rentselect_invitaciones');
    localStorage.removeItem('rentselect_slots');
    localStorage.removeItem('rentselect_solicitudes_doc');
    localStorage.removeItem('rentselect_contratos');
    localStorage.removeItem('rentselect_solicitudes_seguro');
  } catch (e) {}

  try {
    await signOut(auth);
  } catch (e) {}
}

/**
 * Suscripción al estado de autenticación.
 * Notifica al callback con el usuario autenticado y su perfil en Firestore.
 */
export function subscribeAuthState(
  callback: (
    firebaseUser: FirebaseUser | null,
    usuarioApp: UsuarioApp | null,
    loading: boolean
  ) => void
) {
  // Comprobación síncrona/inmediata de sesión activa almacenada
  const checkStoredSession = async () => {
    try {
      const saved = localStorage.getItem('rentselect_active_session');
      if (saved) {
        const parsed = JSON.parse(saved) as UsuarioApp;
        if (parsed && parsed.id) {
          callback(null, parsed, false);
          // Verificar en segundo plano si el usuario sigue activo en Firestore
          try {
            const snap = await getDoc(doc(db, 'usuarios', parsed.id));
            if (snap.exists()) {
              const fresh = { id: snap.id, ...snap.data() } as UsuarioApp;
              if (fresh.estado === 'BLOQUEADO' || fresh.estado === 'PENDIENTE' || fresh.estado === 'INACTIVO') {
                localStorage.removeItem('rentselect_active_session');
                callback(null, null, false);
              } else {
                localStorage.setItem('rentselect_active_session', JSON.stringify(fresh));
                callback(null, fresh, false);
              }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}
  };

  checkStoredSession();

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      const saved = localStorage.getItem('rentselect_active_session');
      if (!saved) {
        callback(null, null, false);
      }
      return;
    }

    try {
      const usuarioApp = await getUsuarioByAuthUid(user.uid, user.email);

      if (!usuarioApp) {
        console.warn(`Usuario ${user.uid} autenticado en Auth pero no encontrado en Firestore.`);
        callback(user, null, false);
        return;
      }

      // LOGIN ÚNICO §6: el listener tampoco admite estados no activos.
      if (
        usuarioApp.estado === 'BLOQUEADO' ||
        usuarioApp.estado === 'PENDIENTE' ||
        usuarioApp.estado === 'INACTIVO'
      ) {
        await signOut(auth);
        localStorage.removeItem('rentselect_active_session');
        callback(null, null, false);
        return;
      }

      // FASE 1.4: asegurar que el espejo de identidad existe ANTES de que la
      // aplicación abra las suscripciones de datos (las reglas lo necesitan).
      await syncAuthIndex(usuarioApp, user);

      try {
        localStorage.setItem('rentselect_active_session', JSON.stringify(usuarioApp));
      } catch (e) {}
      callback(user, usuarioApp, false);
    } catch (err) {
      console.error('Error en listener de autenticación:', err);
      callback(user, null, false);
    }
  });
}

// =========================================================================
// HELPERS DE ALCANCE Y AISLAMIENTO DE DATOS (DATA SCOPING)
// =========================================================================

export function isAdmin(usuario?: UsuarioApp | null): boolean {
  return usuario?.tipoPerfil === 'ADMINISTRADOR';
}

export function isPropietario(usuario?: UsuarioApp | null): boolean {
  return usuario?.tipoPerfil === 'PROPIETARIO';
}

export function isProfesional(usuario?: UsuarioApp | null): boolean {
  return usuario?.tipoPerfil === 'PROFESIONAL';
}

// =========================================================================
// BLOQUE E — ALCANCE DEL PORTAL DEL INQUILINO
// Aislamiento: inquilino → contrato(s) vinculado(s) → inmueble(s).
// Estos helpers alimentan la UI; la aplicación real es deny-by-default
// en las reglas de Firestore/Storage (sección E).
// =========================================================================

export function isInquilino(usuario?: UsuarioApp | null): boolean {
  return usuario?.tipoPerfil === 'INQUILINO';
}

/** Contratos del inquilino (intersección de sus contratoIds con los contratos cargados). */
export function getContratosDelInquilino(
  usuario: UsuarioApp | null | undefined,
  allContratos: ContratoFormalizacion[]
): ContratoFormalizacion[] {
  if (!usuario) return [];
  return contratosDelInquilino(
    { tipoPerfil: usuario.tipoPerfil, contratoIds: usuario.contratoIds },
    allContratos
  );
}

/** ¿Puede el inquilino acceder a este contrato? (pertenencia estricta). */
export function canTenantAccessContrato(
  usuario: UsuarioApp | null | undefined,
  contratoId: string
): boolean {
  if (!usuario) return false;
  return puedeAccederContrato(
    { tipoPerfil: usuario.tipoPerfil, contratoIds: usuario.contratoIds },
    contratoId
  );
}

/**
 * ¿Puede el inquilino acceder a este inmueble?
 * Solo a través de un contrato vinculado que apunte al inmueble.
 */
export function canTenantAccessInmueble(
  usuario: UsuarioApp | null | undefined,
  inmuebleId: string,
  allContratos: ContratoFormalizacion[]
): boolean {
  if (!usuario) return false;
  return puedeAccederInmueble(
    { tipoPerfil: usuario.tipoPerfil, contratoIds: usuario.contratoIds },
    inmuebleId,
    allContratos
  );
}

export interface TenantScope {
  contratos: ContratoFormalizacion[];
  inmuebleIds: string[];
}

/** Resuelve el alcance visible del inquilino (contratos + inmuebles derivados). */
export function resolveTenantScope(
  usuario: UsuarioApp | null | undefined,
  allContratos: ContratoFormalizacion[]
): TenantScope {
  if (!usuario) return { contratos: [], inmuebleIds: [] };
  return resolverAlcance(
    { tipoPerfil: usuario.tipoPerfil, contratoIds: usuario.contratoIds },
    allContratos
  );
}

/**
 * Comprueba si un usuario tiene acceso autorizado a un inmueble determinado.
 * - Administrador: Acceso global de consulta.
 * - Propietario: Únicamente si es el propietario principal o está en sus inmuebleIds.
 * - Profesional: Únicamente si el inmueble está en sus asignaciones autorizadas.
 */
export function canAccessInmueble(
  usuario: UsuarioApp | null | undefined,
  inmueble: Inmueble,
  profesional?: Profesional | null
): boolean {
  if (!usuario) return false;
  if (isAdmin(usuario)) return true;

  if (isPropietario(usuario)) {
    const propId = inmueble.propietarioId || inmueble.propietarioPrincipalId;
    if (usuario.propietarioId && propId === usuario.propietarioId) {
      return true;
    }
    if (usuario.inmuebleIds && usuario.inmuebleIds.includes(inmueble.id)) {
      return true;
    }
    return false;
  }

  if (isProfesional(usuario)) {
    if (profesional?.inmuebleIdsAsignados?.includes(inmueble.id)) {
      return true;
    }
    if (usuario.inmuebleIds && usuario.inmuebleIds.includes(inmueble.id)) {
      return true;
    }
    return false;
  }

  return false;
}

/**
 * Comprueba si un usuario puede acceder a un contrato.
 */
export function canAccessContrato(
  usuario: UsuarioApp | null | undefined,
  contrato: ContratoFormalizacion,
  allInmuebles: Inmueble[]
): boolean {
  if (!usuario) return false;
  if (isAdmin(usuario)) return true;

  if (isPropietario(usuario)) {
    if (usuario.propietarioId && contrato.propietarioId === usuario.propietarioId) {
      return true;
    }
    const inmueble = allInmuebles.find((i) => i.id === contrato.inmuebleId);
    if (!inmueble) return false;
    return canAccessInmueble(usuario, inmueble);
  }

  // Los profesionales no tienen acceso a contratos de arrendamiento privados
  return false;
}

/**
 * Comprueba si un usuario puede acceder a un candidato.
 */
export function canAccessCandidato(
  usuario: UsuarioApp | null | undefined,
  candidato: Candidato,
  allInmuebles: Inmueble[]
): boolean {
  if (!usuario) return false;
  if (isAdmin(usuario)) return true;

  if (isPropietario(usuario)) {
    const inmueble = allInmuebles.find((i) => i.id === candidato.inmuebleId);
    if (!inmueble) return false;
    return canAccessInmueble(usuario, inmueble);
  }

  // Los profesionales no tienen acceso a candidatos privados
  return false;
}

/**
 * Comprueba si un usuario puede acceder a un cobro de alquiler.
 * El propietario sólo puede consultar los cobros de sus propios inmuebles.
 * El administrador mantiene su visión global.
 */
export function canAccessCobro(
  usuario: UsuarioApp | null | undefined,
  cobro: CobroPeriodo,
  allInmuebles: Inmueble[]
): boolean {
  if (!usuario) return false;
  if (isAdmin(usuario)) return true;

  if (isPropietario(usuario)) {
    if (usuario.propietarioId && cobro.propietarioId === usuario.propietarioId) {
      return true;
    }
    const inmueble = allInmuebles.find((i) => i.id === cobro.inmuebleId);
    if (!inmueble) return false;
    return canAccessInmueble(usuario, inmueble);
  }

  return false;
}

