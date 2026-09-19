/**
 * ORDEN 10 — CIRCUITO DE SEGURIDAD END-TO-END
 * ---------------------------------------------------------------------------
 * Este script combina DOS niveles de verificación, deliberadamente separados:
 *
 *  A) VERIFICACIÓN REAL (se ejecuta de verdad):
 *     Lógica de autorización de la aplicación (`src/lib/authorization.ts`), que
 *     es la única estrategia de decisión de navegación/UI. Se comprueban los 15
 *     escenarios exigidos + los casos extra de manipulación.
 *
 *  B) VERIFICACIÓN ESTÁTICA (no se ejecuta Firestore/Storage):
 *     Comprobaciones sobre el TEXTO de `firestore.rules`, `storage.rules` y el
 *     código fuente. En este entorno no hay emulador de Firebase ni credenciales
 *     para ejecutar reglas, por lo que NO se puede afirmar "ejecutado contra
 *     Firestore": lo que se afirma es que la regla exigida está escrita, que no
 *     hay rutas de permiso global y que las consultas nacen acotadas.
 *
 * Ejecución: npm run test:seguridad
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsuarioApp } from '../src/types';
import {
  alcanceDatos,
  puedeAccederSeccion,
  perfilAutorizado,
  seccionesPermitidas,
  seccionInicialPorPerfil,
  esAdministradorAutorizado,
} from '../src/lib/authorization';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta: string) => readFileSync(resolve(raiz, ruta), 'utf-8');
const servidor = leer('server.ts');

let fallos = 0;
let pruebas = 0;
const resultados: string[] = [];

function real(nombre: string, condicion: boolean, detalle = '') {
  pruebas += 1;
  if (!condicion) fallos += 1;
  resultados.push(`${condicion ? 'OK  ' : 'FALLO'} [REAL] ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

function estatica(nombre: string, condicion: boolean, detalle = '') {
  pruebas += 1;
  if (!condicion) fallos += 1;
  resultados.push(
    `${condicion ? 'OK  ' : 'FALLO'} [ESTÁTICO] ${nombre}${detalle ? ` — ${detalle}` : ''}`
  );
}

// ---------------------------------------------------------------------------
// A) AUTORIZACIÓN (verificación real)
// ---------------------------------------------------------------------------
const usuario = (parcial: Partial<UsuarioApp>): UsuarioApp =>
  ({
    id: 'user_1',
    nombre: 'Prueba',
    email: 'prueba@example.com',
    tipoPerfil: 'PROPIETARIO',
    roles: [],
    permisos: [],
    estado: 'ACTIVO',
    ...parcial,
  } as UsuarioApp);

const sinUsuario = [null, undefined];
sinUsuario.forEach((u, i) => {
  real(`S1.${i + 1} Sin usuario autenticado -> DENEGADO`, perfilAutorizado(u) === null);
  real(`S1.${i + 1}b Sin usuario -> ninguna sección`, seccionesPermitidas(u).length === 0);
  real(
    `S1.${i + 1}c Sin usuario -> ninguna sección accesible ('administracion')`,
    puedeAccederSeccion(u, 'administracion') === false
  );
});

const admin = usuario({ tipoPerfil: 'ADMINISTRADOR' });
real('S2 ADMINISTRADOR ACTIVO -> perfil autorizado', perfilAutorizado(admin) === 'ADMINISTRADOR');
real('S2b ADMINISTRADOR -> Centro de Control permitido', puedeAccederSeccion(admin, 'administracion'));
real('S2c ADMINISTRADOR -> sección inicial = administracion', seccionInicialPorPerfil(admin) === 'administracion');
real('S2d ADMINISTRADOR -> esAdministradorAutorizado', esAdministradorAutorizado(admin));

const propietario = usuario({ tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-1' });
real('S3 PROPIETARIO -> administracion DENEGADO', !puedeAccederSeccion(propietario, 'administracion'));
real('S3b PROPIETARIO -> propietarios permitido', puedeAccederSeccion(propietario, 'propietarios'));
real('S3c PROPIETARIO -> candidatos DENEGADO', !puedeAccederSeccion(propietario, 'candidatos'));
real('S3d PROPIETARIO -> solicitudes DENEGADO', !puedeAccederSeccion(propietario, 'solicitudes'));
real('S3e PROPIETARIO -> preseleccionados DENEGADO', !puedeAccederSeccion(propietario, 'preseleccionados'));
real('S3f PROPIETARIO -> seguro_impago DENEGADO', !puedeAccederSeccion(propietario, 'seguro_impago'));
real('S3g PROPIETARIO -> NO es administrador', !esAdministradorAutorizado(propietario));
real('S3h PROPIETARIO -> sección inicial = propietarios', seccionInicialPorPerfil(propietario) === 'propietarios');

const profesional = usuario({ tipoPerfil: 'PROFESIONAL', profesionalId: 'prof-1' });
real('S4 PROFESIONAL -> su portal (administracion) permitido', puedeAccederSeccion(profesional, 'administracion'));
real('S4b PROFESIONAL -> candidatos globales DENEGADO', !puedeAccederSeccion(profesional, 'candidatos'));
real('S4c PROFESIONAL -> solicitudes DENEGADO', !puedeAccederSeccion(profesional, 'solicitudes'));
real('S4d PROFESIONAL -> preseleccionados DENEGADO', !puedeAccederSeccion(profesional, 'preseleccionados'));
real('S4e PROFESIONAL -> seguro_impago DENEGADO', !puedeAccederSeccion(profesional, 'seguro_impago'));
real('S4f PROFESIONAL -> cobros DENEGADO', !puedeAccederSeccion(profesional, 'cobros'));
real('S4g PROFESIONAL -> gastos DENEGADO', !puedeAccederSeccion(profesional, 'gastos'));
real('S4h PROFESIONAL -> propietarios DENEGADO', !puedeAccederSeccion(profesional, 'propietarios'));
real('S4i PROFESIONAL -> NO es administrador', !esAdministradorAutorizado(profesional));

const pendiente = usuario({ tipoPerfil: 'ADMINISTRADOR', estado: 'PENDIENTE' });
real('S5 PENDIENTE -> DENEGADO (aunque sea ADMINISTRADOR)', perfilAutorizado(pendiente) === null);
real('S5b PENDIENTE -> sin secciones', seccionesPermitidas(pendiente).length === 0);

const bloqueado = usuario({ tipoPerfil: 'PROPIETARIO', estado: 'BLOQUEADO' });
real('S6 BLOQUEADO -> DENEGADO', perfilAutorizado(bloqueado) === null);

const inactivo = usuario({ tipoPerfil: 'PROFESIONAL', estado: 'INACTIVO' });
real('S7 INACTIVO -> DENEGADO', perfilAutorizado(inactivo) === null);

const sinEstado = usuario({ tipoPerfil: 'ADMINISTRADOR', estado: undefined });
real('S8 Sin estado -> DENEGADO (nunca ACTIVO por defecto)', perfilAutorizado(sinEstado) === null);

const sinPerfil = usuario({ tipoPerfil: undefined });
real('S9 tipoPerfil ausente -> DENEGADO (NUNCA administrador)', perfilAutorizado(sinPerfil) === null);
real(
  'S9b tipoPerfil ausente -> ninguna sección de administración',
  !puedeAccederSeccion(sinPerfil, 'administracion')
);

(['SUPERADMIN', 'GESTOR_INMUEBLES', 'ADMIN', ''] as unknown as string[]).forEach((perfilFalso, i) => {
  const u = usuario({ tipoPerfil: perfilFalso as UsuarioApp['tipoPerfil'] });
  real(`S10.${i + 1} tipoPerfil desconocido "${perfilFalso}" -> DENEGADO`, perfilAutorizado(u) === null);
});

// Manipulación del propio perfil: cambiar tipoPerfil/estado no se concede a sí mismo
const manipulador = usuario({
  tipoPerfil: 'PROPIETARIO',
  propietarioId: 'prop-1',
  permisos: ['SUPERADMIN'],
  roles: ['ADMINISTRADOR'],
});
real(
  'S11 Roles/permisos manipulados en el perfil NO elevan: sigue siendo PROPIETARIO',
  perfilAutorizado(manipulador) === 'PROPIETARIO' && !esAdministradorAutorizado(manipulador)
);
real(
  'S11b Rol manipulado -> administracion sigue DENEGADO',
  !puedeAccederSeccion(manipulador, 'administracion')
);

// Alcance de datos (aislamiento por origen)
real(
  'S12 Sin usuario -> alcance NO global y sin inmuebles',
  alcanceDatos(null).global === false && alcanceDatos(null).inmuebleIds.length === 0
);
real('S12b ADMINISTRADOR -> alcance global explícito', alcanceDatos(admin).global === true);
const alcanceProp = alcanceDatos(propietario);
real(
  'S13 PROPIETARIO -> alcance acotado a SU propietarioId',
  alcanceProp.global === false && alcanceProp.propietarioId === 'prop-1'
);
const alcanceProf = alcanceDatos(profesional);
real(
  'S14 PROFESIONAL -> alcance acotado a SU profesionalId',
  alcanceProf.global === false && alcanceProf.profesionalId === 'prof-1'
);
real(
  'S15 PENDIENTE/BLOQUEADO -> alcance NO global',
  alcanceDatos(pendiente).global === false && alcanceDatos(bloqueado).global === false
);

// ---------------------------------------------------------------------------
// B) VERIFICACIÓN ESTÁTICA: código de la aplicación
// ---------------------------------------------------------------------------
const app = leer('src/App.tsx');
const firebase = leer('src/lib/firebase.ts');
const authService = leer('src/lib/authService.ts');
const sidebar = leer('src/components/Sidebar.tsx');
const mobileNav = leer('src/components/MobileNav.tsx');
const incidenciasSection = leer('src/components/sections/IncidenciasSection.tsx');
const profesionalesSection = leer('src/components/sections/ProfesionalesSection.tsx');
const firestoreRules = leer('firestore.rules');
const storageRules = leer('storage.rules');

estatica(
  'Sin fallback "tipoPerfil || ADMINISTRADOR" en el código',
  !/\|\|\s*'ADMINISTRADOR'/.test(app + sidebar + mobileNav + incidenciasSection + profesionalesSection)
);
estatica(
  'Sidebar/MobileNav usan la autorización central',
  sidebar.includes('perfilAutorizado(currentUser)') &&
    mobileNav.includes('perfilAutorizado(currentUser)') &&
    sidebar.includes('seccionesPermitidas(currentUser)') &&
    mobileNav.includes('seccionesPermitidas(currentUser)')
);
estatica(
  'Secciones de UI usan perfilAutorizado (sin valor por defecto)',
  incidenciasSection.includes('perfilAutorizado(currentUser)') &&
    profesionalesSection.includes('perfilAutorizado(currentUser)')
);
estatica(
  'El App no reconstruye identidad desde localStorage',
  !/localStorage\.getItem\(\s*'rentselect_(current_user_id|active_session)'/.test(app) &&
    !/setCurrentUser\([^)]*JSON\.parse/.test(app)
);
estatica(
  'El App limpia las cachés locales al cerrar sesión',
  app.includes('limpiarCachesLocales()') && app.includes("setActiveSection('inicio')")
);
estatica(
  'El guard de navegación usa la decisión central',
  app.includes('puedeAccederSeccion(currentUser, activeSection)')
);
estatica(
  'La sección inicial del panel sale de la autorización central',
  app.includes('seccionInicialPorPerfil(usuario)')
);
estatica(
  'Los estados PENDIENTE/BLOQUEADO/INACTIVO se rechazan al hidratar la sesión',
  app.includes("usuarioApp.estado !== 'ACTIVO'") || authService.includes("usuarioApp.estado !== 'ACTIVO'")
);
estatica(
  'AdministracionSection no es una segunda puerta de administración (no se renderiza)',
  !/<\s*AdministracionSection[\s/>]/.test(app)
);
estatica(
  'El panel de administración se decide por tipoPerfil',
  app.includes("currentUser.tipoPerfil === 'ADMINISTRADOR' ? (") &&
    app.includes('<ProfesionalPortalSection')
);
estatica(
  'Consultas nacidas acotadas: candidatos/solicitudes/seguro sólo administración',
  firebase.includes('scopeEsAdminConocido(scope)')
);
estatica(
  'Consultas nacidas acotadas: colecciones de flujo público con alcance de sesión',
  firebase.includes('scopePermiteFlujoPublico(scope)') &&
    firebase.includes('subscribeInvitaciones(callback: (items: InvitacionVisita[]) => void, scope?: DataAccessScope)') &&
    firebase.includes('subscribeSolicitudesDoc(')
);
estatica(
  'Inmuebles: un propietario consulta por titularidad y un profesional por asignación',
  firebase.includes("where(campo, '==', pid)") &&
    firebase.includes("where(documentId(), 'in', bloque)")
);
estatica(
  'Inmuebles: el profesional resuelve sus viviendas asignadas desde su ficha',
  firebase.includes('inmuebleIdsAsignados') && firebase.includes('getInmueblePorId')
);
estatica(
  'Profesionales: el profesional sólo escucha su propia ficha',
  firebase.includes("query(PROFESIONALES_COL, where('usuarioId', '==', scope.usuarioId))")
);
estatica(
  'La vivienda de los flujos públicos se resuelve puntualmente y se sanitiza',
  app.includes('getInmueblePorId(activePublicSolicitudToken)') &&
    app.includes('sanitizeInmuebleParaFlujoPublico')
);
estatica(
  'Identidad: resolución por espejo usuarios_auth/{uid} antes de consultar la colección',
  authService.includes("doc(db, 'usuarios_auth', authUid)") &&
    authService.includes('perfil.authUid === authUid')
);

// ---------------------------------------------------------------------------
// C) VERIFICACIÓN ESTÁTICA: reglas de Firestore
// ---------------------------------------------------------------------------
const bloque = (nombre: string): string => {
  const etiqueta = `match /${nombre}/`;
  const i = firestoreRules.indexOf(etiqueta);
  if (i < 0) return '';
  // recorta hasta la siguiente declaración `match` de la misma profundidad
  const j = firestoreRules.indexOf('    match /', i + etiqueta.length);
  return firestoreRules.slice(i, j > 0 ? j : firestoreRules.length);
};

estatica('Rules: negación global por defecto', /match \/\{document=\*\*\} \{\s*allow read, write: if false;/.test(firestoreRules));
estatica(
  'Rules: helpers de rol/estado (espejo usuarios_auth) presentes',
  firestoreRules.includes('function hasIndex()') &&
    firestoreRules.includes('function isAdminRole()') &&
    firestoreRules.includes('function isStaff()') &&
    firestoreRules.includes('function profTieneAsignado(')
);
estatica(
  'Rules: el estado no ACTIVO no obtiene identidad (activeUser exige ACTIVO)',
  /function activeUser\(\) \{\s*return hasIndex\(\) && me\(\)\.estado == 'ACTIVO';/.test(firestoreRules)
);
estatica(
  'Rules: usuarios -> get propio o administración; list sólo administración',
  bloque('usuarios').includes('allow get: if isStaff()') && bloque('usuarios').includes('allow list: if isStaff();')
);
estatica(
  'Rules: usuarios -> tipoPerfil/roles/estado/permisos/propietarioId/profesionalId/inmuebleIds protegidos',
  ['tipoPerfil', 'roles', 'estado', 'permisos', 'propietarioId', 'profesionalId', 'inmuebleIds'].every((campo) =>
    bloque('usuarios').includes(`incoming().${campo} == existing().${campo}`) ||
    bloque('usuarios').includes(`'${campo}'`)
  )
);
estatica(
  'Rules: authUid inmutable (sólo vinculación inicial con email verificado)',
  bloque('usuarios').includes("'authUid'") &&
    bloque('usuarios').includes('incoming().authUid == request.auth.uid') &&
    bloque('usuarios').includes('incoming().email == authEmail()')
);
estatica(
  'Rules: usuarios_auth no permite auto-declararse administrador sin perfil autoritativo',
  bloque('usuarios_auth').includes('indexIsTruthful()')
);
estatica(
  'Rules: inmuebles -> sin descarga global (list acotada por rol)',
  bloque('inmuebles').includes('allow list: if isStaff()') &&
    bloque('inmuebles').includes('profTieneAsignado(inmuebleId)') &&
    bloque('inmuebles').includes('propietarioPrincipalId')
);
estatica(
  'Rules: inmuebles -> get público residual documentado (flujos por token)',
  bloque('inmuebles').includes('allow get: if true;') &&
    bloque('inmuebles').includes('RIESGO RESIDUAL DOCUMENTADO')
);
estatica(
  'Rules: candidatos -> list sólo administración o PROPIETARIO TITULAR (nunca profesionales ni terceros)',
  bloque('candidatos').includes('allow list: if isStaff() || (isPropietarioRole() && (') &&
    bloque('candidatos').includes('resource.data.propietarioId == myPropId()') &&
    bloque('candidatos').includes('myInmuebleIds().hasAny([resource.data.inmuebleId])') &&
    bloque('candidatos').includes('!esProfesionalAutenticado()')
);
estatica(
  'Rules: solicitudes -> lectura sólo administración o propietario del inmueble; alta pública con campos mínimos',
  bloque('solicitudes').includes('allow list: if isStaff() || (isPropietarioRole() && (') &&
    bloque('solicitudes').includes("esMiInmueble(resource.data.inmuebleId)") &&
    bloque('solicitudes').includes("keys().hasAll(['nombre', 'email', 'telefono', 'inmuebleId', 'estado'])") &&
    !/allow read: if isSignedIn\(\);/.test(firestoreRules)
);
estatica(
  'Rules: invitaciones/slots/documentación -> escritura acotada por campos',
  bloque('invitaciones').includes('hasOnly(') &&
    bloque('slots_visita').includes('hasOnly(') &&
    bloque('solicitudes_documentacion').includes('hasOnly(')
);
estatica(
  'Rules: las tres colecciones de flujo público no permiten cambiar inmuebleId ni identidad',
  bloque('invitaciones').includes("'inmuebleId', 'candidateId'") &&
    bloque('slots_visita').includes("hasAny(['inmuebleId', 'propietarioId'])") &&
    bloque('solicitudes_documentacion').includes("'candidatoId', 'ownerId'")
);
estatica(
  'Rules: aseguradoras sólo administración; seguro de impago administración o propietario TITULAR del inmueble',
  bloque('configuracion_aseguradoras').includes('allow read: if isStaff();') &&
    bloque('configuracion_aseguradoras').includes('allow write: if isStaff();') &&
    bloque('solicitudes_seguro_impago').includes('allow get: if isStaff() || (isPropietarioRole() && (') &&
    bloque('solicitudes_seguro_impago').includes('allow list: if isStaff() || (isPropietarioRole() && (') &&
    bloque('solicitudes_seguro_impago').includes('esMiInmueble(resource.data.inmuebleId)') &&
    !bloque('solicitudes_seguro_impago').includes('esProfesionalAutenticado() ||')
);
estatica(
  'Rules: system -> sólo modulos_config es público (get)',
  bloque('system').includes("allow get: if systemDocId == 'modulos_config' || isStaff();") &&
    bloque('system').includes('allow list: if isStaff();')
);
estatica(
  'Rules: profesionales -> list no expone el directorio a profesionales ajenos',
  bloque('profesionales').includes('allow list: if isStaff()') &&
    bloque('profesionales').includes('esProfesionalAutenticado() && (') &&
    bloque('profesionales').includes('resource.data.usuarioId == request.auth.uid')
);
estatica(
  'Rules: enlaces_registro -> escritura exclusiva de administración (sin escalada)',
  bloque('enlaces_registro').includes('allow create, update, delete: if isStaff();')
);
estatica(
  'Rules: especialidades -> edición del catálogo interna',
  bloque('especialidades').includes('allow write: if isStaff();')
);
estatica(
  'Rules: audit_logs -> update/delete denegados (inmutable) y create controlado',
  bloque('audit_logs').includes('allow update, delete: if false;') &&
    bloque('audit_logs').includes("'LOGIN_EXITOSO'") &&
    bloque('audit_logs').includes('incoming().keys().hasAll(')
);
estatica(
  'Rules: colecciones económicas del propietario siguen exigiendo titularidad',
  ['gastos', 'prestamos', 'expedientes_recomercializacion', 'propuestas_inmobiliaria', 'leads_inmobiliario'].every(
    (c) => bloque(c).includes('isPropietarioRole()') && bloque(c).includes('isStaff()')
  )
);
estatica(
  'Rules: incidencias/trabajos/presupuestos -> propietario por titularidad y profesional por asignación',
  bloque('incidencias').includes('profIdAsignado(existing())') &&
    bloque('incidencias').includes('recursoPropietarioListable(resource.data)') &&
    bloque('trabajos_profesionales').includes('recursoProfesionalListable') &&
    bloque('presupuestos_profesionales').includes('recursoProfesionalListable')
);
estatica(
  'Rules: propietarios -> ficha propia o administración (IBAN/fiscalidad protegidos)',
  bloque('propietarios').includes('allow get: if isStaff() || ownsPropietario(propietarioId);') &&
    bloque('propietarios').includes('allow list: if isStaff();')
);
estatica(
  'Rules: ningún rol no administrador obtiene lectura global de candidatos/solicitudes/seguro',
  !/allow (read|list): if isSignedIn\(\);/.test(firestoreRules) &&
    !/allow list: if isSig?nedIn\(\);/.test(firestoreRules) &&
    (firestoreRules.match(/allow (read|list): if isSignedIn\(\)/g) || []).length === 0
);
estatica(
  'Rules: sin valores por defecto administrativos (no isSignedIn() concediendo escritura global)',
  !/allow write: if isSignedIn\(\);/.test(firestoreRules) &&
    !/allow create, update: if true;/.test(firestoreRules) &&
    !/allow read, write: if isSignedIn\(\);/.test(firestoreRules)
);
// Inventario exacto de lecturas públicas: cada una debe pertenecer a un flujo
// por token (o al catálogo público de especialidades) y estar documentada.
const coleccionesConLecturaPublica = [
  'inmuebles',
  'candidatos',
  'invitaciones',
  'slots_visita',
  'solicitudes_documentacion',
  'profesionales',
  'enlaces_registro',
  'especialidades',
];
const coleccionesRules = Array.from(firestoreRules.matchAll(/    match \/([A-Za-z_]+)\//g)).map((m) => m[1]);
const conLecturaPublica = coleccionesRules.filter((c) =>
  /allow (read|get): if true;/.test(bloque(c))
);
estatica(
  'Rules: las lecturas públicas son EXACTAMENTE los 8 flujos por token documentados',
  conLecturaPublica.length === 8 &&
    coleccionesConLecturaPublica.every((c) => conLecturaPublica.includes(c)),
  `encontradas: ${conLecturaPublica.join(', ')}`
);
estatica(
  'Rules: ninguna lectura pública adicional en colecciones internas',
  coleccionesRules
    .filter((c) => !coleccionesConLecturaPublica.includes(c))
    .every((c) => !/allow (read|get): if true;/.test(bloque(c)))
);
estatica(
  'Rules: los residuos públicos quedan documentados en el propio fichero',
  firestoreRules.includes('residual')
);

// ---------------------------------------------------------------------------
// D) VERIFICACIÓN ESTÁTICA: reglas de Storage
// ---------------------------------------------------------------------------
estatica('Storage: negación global por defecto', storageRules.includes('allow read, write: if false;'));
estatica(
  'Storage: superficie sin sesión acotada a las dos rutas de flujo público',
  storageRules.includes('match /inmuebles/{inmuebleId}/{allFiles=**}') &&
    storageRules.includes('allow read: if true;') &&
    storageRules.includes('match /documentos_solicitados/{solicitudDocId}/{allFiles=**}') &&
    storageRules.includes('allow create: if request.resource.size < 15 * 1024 * 1024')
);
estatica(
  'Storage: carpetas económicas exigen cuenta interna (residual por falta de claims)',
  ['cobros_justificantes/{propietarioId}', 'gastos_facturas/{propietarioId}', 'polizas/{propietarioId}', 'siniestros/{propietarioId}'].every(
    (ruta) => storageRules.includes(`match /${ruta}/`)
  ) && storageRules.includes('allow read: if internalUser();')
);
estatica(
  'Storage: límite técnico documentado (sin custom claims no hay aislamiento fino)',
  storageRules.includes('NO pueden leer Firestore') && storageRules.includes('PENDIENTE')
);

estatica(
  'Portal público: el registro del enlace exige sesión verificada (no hay alta anónima)',
  servidor.includes('identitytoolkit.googleapis.com/v1/accounts:lookup') &&
    servidor.includes("res.status(401).json({ error: 'No autorizado: se requiere sesión autenticada válida.' })") &&
    servidor.includes('FIREBASE_API_KEY')
);
estatica(
  'Portal público: sin configuración de auth el registro falla cerrado (503, jamás alta anónima)',
  servidor.includes("res.status(503).json({") &&
    servidor.includes('Registro no disponible: el servidor no tiene configuración de autenticación.')
);
estatica(
  'Portal público: la aportación del candidato se persiste por id de documento, sin listados',
  firebase.includes('export async function updateSolicitudDocPublicaFirestore') &&
    firebase.includes("updateDoc(doc(db, 'solicitudes_documentacion', id)") &&
    !/solicitudes_documentacion[\s\S]{0,400}?getDocs\(/.test(firebase)
);
estatica(
  'Portal público: el candidato sólo puede aportar documentos/estado/historial (append-only)',
  firestoreRules.includes("'fechaUltimaActividad', 'propietarioId'") &&
    firestoreRules.includes("'token', 'inmuebleId', 'candidatoId', 'ownerId', 'profesionalId'") &&
    firestoreRules.includes('incoming().historial.size() >= existing().historial.size()')
);
estatica(
  'Portal público: la lectura por token no expone titularidad ni notas internas',
  servidor.includes('NO scoring, NO internal owner notes') &&
    !/publicData = \{[\s\S]{0,800}?ownerId:/.test(servidor) &&
    !/publicData = \{[\s\S]{0,800}?notasPropietario:/.test(servidor) &&
    !/publicData = \{[\s\S]{0,800}?candidatoId:/.test(servidor)
);

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
console.log(resultados.join('\n'));
console.log('');
console.log(`Pruebas ejecutadas: ${pruebas} | fallos: ${fallos}`);
console.log(
  fallos === 0
    ? 'RESULTADO: OK — autorización real verificada + reglas revisadas estáticamente'
    : 'RESULTADO: FALLOS DETECTADOS'
);
if (fallos > 0) process.exit(1);
