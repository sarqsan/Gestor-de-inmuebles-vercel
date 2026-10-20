/**
 * C-SECURITY · SEGURIDAD DE ACCESO A DOCUMENTOS Y FIREBASE STORAGE
 * Integración reformulada (2026-09-22) del bloque `520bda7` de la Arena C sobre
 * la canónica `c4cee78`. Documento: docs/AUDITORIA-SEGURIDAD-STORAGE-DOCUMENTOS-2026-09-22.md
 * ---------------------------------------------------------------------------
 * METODOLOGÍA (leer antes de dar por bueno ningún verde):
 *  · 2026-10-20 (ORDEN AG-03.2): la decisión de acceso a documentos ya NO vive
 *    en `storage.rules`. Las reglas de Storage sólo pueden consultar la base
 *    Firestore `(default)`, que no forma parte de la arquitectura (la única
 *    base es la base con nombre), así que toda regla con `firestore.get()`
 *    denegaba a cualquier cuenta no maestra. La autorización se ejecuta en el
 *    servidor (`server/documentos/autorizacionDocumental.ts`) con lecturas de
 *    la base con nombre, y el navegador opera a través de `/api/documentos/*`.
 *    Esta suite evalúa ESE autorizador real con una mini-base en memoria
 *    (tests/helpers/autorizacionDocumentalHarness.ts). No es el motor de
 *    Google ni el emulador: la aceptación con cuentas reales queda PENDIENTE.
 *  · `storage.rules` queda reducido al catálogo público (`get` de
 *    `inmuebles/{id}/{foto}`) y a la denegación total del resto: la sección G
 *    lo comprueba sobre el texto real.
 *  · `list`: la API del servidor no expone enumeración (ningún cliente usa
 *    `listAll`); se deniega para TODOS, también para la administración.
 *  · 2026-10-20 (ORDEN 1 · AG-04): el servidor de documentos efímero
 *    (`src/lib/documentosServidor.ts`, `/api/upload-document`, `/api/documents/:id`)
 *    se RETIRÓ: era un almacén en RAM de la función de Vercel que producía
 *    pérdida de binarios con apariencia de éxito. La sección G comprueba que
 *    `server.ts` ya no instancia ningún almacén y responde 410 en esas rutas.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EMAIL_MASTER } from '../server/titularidades/backendTitulares';
import { DESTINOS, esRutaSegura, resolverObjeto, validarContenido } from '../server/documentos/autorizacionDocumental';
import { CLAVES_DESTINO, decidirEnServidor, permiteServidor, rutaEjemplo, type PeticionServidor, type RecursoEntrante, type Verbo } from './helpers/autorizacionDocumentalHarness';

const raiz = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const FUENTE = readFileSync(raiz('storage.rules'), 'utf8');

// ---------------------------------------------------------------------------
// Actores sintéticos
// ---------------------------------------------------------------------------
const ADMIN_EMAIL = EMAIL_MASTER;
const DOC_PENDING_ID = `doc_${'a'.repeat(64)}`;
const DOC_DELETE_ID = `doc_${'b'.repeat(64)}`;
const DOC_AVAILABLE_ID = `doc_${'c'.repeat(64)}`;
const STORAGE_DOC_PENDING = `inmuebles/INM_A/documentos_patrimoniales/${DOC_PENDING_ID}/factura.pdf`;
const STORAGE_DOC_DELETE = `inmuebles/INM_A/documentos_patrimoniales/${DOC_DELETE_ID}/factura.pdf`;
const STORAGE_DOC_AVAILABLE = `inmuebles/INM_A/documentos_patrimoniales/${DOC_AVAILABLE_ID}/factura.pdf`;
// D3 (ORDEN 4 §7): el criterio de los árboles internos ya no es "cualquiera
// autenticado" sino el espejo `usuarios_auth/{uid}` (+ titularidad derivada).
// El FS sintético refleja la realidad: espejos ACTIVOS para las cuentas que
// los tienen (los inquilinos NO tienen espejo) y `propietarioId` en los
// documentos de los que deriva el ámbito. Sin espejo ⇒ deny (R-1/R-2).
const FS = {
  'usuarios/uid_propA': { tipoPerfil: 'PROPIETARIO', propietarioId: 'PROP_A' },
  'usuarios/uid_propB': { tipoPerfil: 'PROPIETARIO', propietarioId: 'PROP_B' },
  'usuarios/uid_prof': { tipoPerfil: 'PROFESIONAL' },
  'usuarios/uid_inqA': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', authUid: 'uid_inqA', contratoIds: ['CON_A'] },
  'usuarios/uid_inqB': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', authUid: 'uid_inqB', contratoIds: ['CON_B'] },
  'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'PROP_A', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_propB': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'PROP_B', profesionalId: '', inmuebleIds: [] },
  'usuarios_auth/uid_managerL': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'M_L', carterasL: ['PROP_A'] },
  'usuarios_auth/uid_managerE': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'M_E', carterasE: ['PROP_A'] },
  'usuarios_auth/uid_partial': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', usuarioId: 'usr_partial', propietarioId: '', profesionalId: 'M_P', gestionesPorPropietario: { PROP_A: 'G_P' } },
  'gestiones_cartera/G_P': { id: 'G_P', propietarioId: 'PROP_A', gestorUsuarioId: 'usr_partial', estado: 'ACTIVA', resolucionInvitacion: 'ACEPTADA', inmuebleIds: ['INM_A'], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR' },
  'usuarios_auth/uid_prof': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', propietarioId: '', profesionalId: 'PRO1', inmuebleIds: [] },
  'incidencias/INC_A': { contratoId: 'CON_A', propietarioId: 'PROP_A', profesionalAsignadoId: 'PRO1' },
  'incidencias/INC_B': { contratoId: 'CON_B', propietarioId: 'PROP_B' },
  'incidencias/INC_SIN_CONTRATO': {},
  'suministros/SUM_A': { inmuebleId: 'INM_A' },
  'inmuebles/INM_A': { contratoActivoId: 'CON_A', propietarioId: 'PROP_A' },
  'inmuebles/inm-1': { propietarioId: 'PROP_A' },
  [`inmuebles/INM_A/documentos_patrimoniales/${DOC_PENDING_ID}`]: {
    id: DOC_PENDING_ID, inmuebleId: 'INM_A', propietarioId: 'PROP_A', estado: 'PENDIENTE_STORAGE',
    storagePath: STORAGE_DOC_PENDING, nombreStorage: 'factura.pdf', mimeType: 'application/pdf', tamanoBytes: 1024, sha256: 'a'.repeat(64),
  },
  [`inmuebles/INM_A/documentos_patrimoniales/${DOC_AVAILABLE_ID}`]: {
    id: DOC_AVAILABLE_ID, inmuebleId: 'INM_A', propietarioId: 'PROP_A', estado: 'DISPONIBLE',
    storagePath: STORAGE_DOC_AVAILABLE, nombreStorage: 'factura.pdf', mimeType: 'application/pdf', tamanoBytes: 1024, sha256: 'c'.repeat(64),
  },
  [`inmuebles/INM_A/documentos_patrimoniales/${DOC_DELETE_ID}`]: {
    id: DOC_DELETE_ID, inmuebleId: 'INM_A', propietarioId: 'PROP_A', estado: 'PENDIENTE_ELIMINACION',
    storagePath: STORAGE_DOC_DELETE, nombreStorage: 'factura.pdf', mimeType: 'application/pdf', tamanoBytes: 1024, sha256: 'b'.repeat(64),
  },
  'solicitudes_documentacion/sol-1': { candidatoId: 'CAND_1', token: 'tok-sol-1-abcdef' },
  'solicitudes_documentacion/sol-1758556800000': { candidatoId: 'CAND_1', token: 'tok-sol-ts-abcdef' },
  'candidatos/CAND_1': { inmuebleId: 'INM_A' },
  'contratos_formalizacion/CON_A': { propietarioId: 'PROP_A', inmuebleId: 'INM_A' },
  'contratos_formalizacion/CON_B': { propietarioId: 'PROP_B' },
  'lecturas_suministro/LEC_A': { contratoId: 'CON_A' },
} as const;

type Actor = 'anonimo' | 'admin' | 'propietarioA' | 'propietarioB' | 'gestorL' | 'gestorE' | 'gestorParcial' | 'profesional' | 'inquilinoA' | 'inquilinoB' | 'autenticadoSinFicha';

type Recurso = RecursoEntrante & { name: string };
const PORTAL = { solicitudDocId: 'sol-1', token: 'tok-sol-1-abcdef' };
const TOKENS_PORTAL: Record<string, string> = { 'sol-1': 'tok-sol-1-abcdef', 'sol-1758556800000': 'tok-sol-ts-abcdef' };

function ctx(actor: Actor, ruta: string, resource?: Recurso, publico?: PeticionServidor['publico']): PeticionServidor {
  const auth: Record<Actor, PeticionServidor['auth']> = {
    anonimo: null,
    admin: { uid: 'uid_admin', token: { email: ADMIN_EMAIL, email_verified: true } },
    propietarioA: { uid: 'uid_propA', token: { email: 'a@example.com' } },
    propietarioB: { uid: 'uid_propB', token: { email: 'b@example.com' } },
    gestorL: { uid: 'uid_managerL', token: { email: 'gestor-l@example.com' } },
    gestorE: { uid: 'uid_managerE', token: { email: 'gestor-e@example.com' } },
    gestorParcial: { uid: 'uid_partial', token: { email: 'gestor-parcial@example.com' } },
    profesional: { uid: 'uid_prof', token: { email: 'p@example.com' } },
    inquilinoA: { uid: 'uid_inqA', token: { email: 'ia@example.com' } },
    inquilinoB: { uid: 'uid_inqB', token: { email: 'ib@example.com' } },
    autenticadoSinFicha: { uid: 'uid_sin_ficha', token: {} },
  };
  return { auth: auth[actor], db: FS as unknown as Record<string, Record<string, unknown>>, path: ruta, metadata: resource ?? null, ...(publico ? { publico } : {}) };
}

const PDF = (name: string, size = 1024): Recurso => ({ name, size, contentType: 'application/pdf' });
const JPG = (name: string, size = 1024): Recurso => ({ name, size, contentType: 'image/jpeg' });
const MB = 1024 * 1024;

const puede = (actor: Actor, metodo: Verbo, ruta: string, recurso?: Recurso) =>
  permiteServidor(metodo, ctx(actor, ruta, recurso));
const crea = (actor: Actor, recurso: Recurso) => puede(actor, 'create', recurso.name, recurso);
/** Portal de candidatos: subida con el token de la solicitud (sin sesión). */
const creaPortal = (recurso: Recurso, publico: PeticionServidor['publico'] = PORTAL) =>
  permiteServidor('create', ctx('anonimo', recurso.name, recurso, publico));
const destinoDe = (ruta: string) => resolverObjeto(ruta)?.destino.clave ?? null;
/** PDF si el destino lo admite; si sólo admite imagen, JPG (el tipo no debe decidir el ámbito). */
function recursoAdmitido(ruta: string): Recurso {
  const destino = resolverObjeto(ruta)?.destino;
  if (destino && destino.contenido && !validarContenido(destino, 'application/pdf', 1024).permitido) return JPG(ruta);
  return PDF(ruta);
}

const TODOS: Actor[] = ['anonimo', 'admin', 'propietarioA', 'propietarioB', 'profesional', 'inquilinoA', 'inquilinoB', 'autenticadoSinFicha'];
const AUTENTICADOS: Actor[] = TODOS.filter((a) => a !== 'anonimo');
const INTERNOS_NO_ADMIN: Actor[] = ['propietarioA', 'propietarioB', 'profesional', 'autenticadoSinFicha'];

// ---------------------------------------------------------------------------
// A · hasSafeObjectName(): forma del nombre de objeto sobre la ruta completa
// ---------------------------------------------------------------------------
describe('BLOQUE 6 · documentos patrimoniales: path, metadata y aislamiento por inmueble', () => {
  const carga = {
    name: STORAGE_DOC_PENDING, size: 1024, contentType: 'application/pdf',
    metadata: { documentoId: DOC_PENDING_ID, inmuebleId: 'INM_A', sha256: 'a'.repeat(64) },
  };

  it('sólo sube bajo metadata pendiente, MIME/tamaño iguales y titular/gestor con escritura del inmueble', async () => {
    expect(await crea('propietarioA', carga)).toBe(true);
    expect(await crea('propietarioB', carga)).toBe(false);
    expect(await crea('anonimo', carga)).toBe(false);
    expect(await crea('propietarioA', { ...carga, size: 2048 })).toBe(false);
    expect(await crea('propietarioA', { ...carga, contentType: 'image/png' })).toBe(false);
    expect(await crea('propietarioA', { ...carga, metadata: { ...carga.metadata, inmuebleId: 'INM_B' } })).toBe(false);
  });

  it('honra carteras: L sólo lee, E escribe y los gestores no borran', async () => {
    expect(await puede('gestorL', 'get', STORAGE_DOC_AVAILABLE)).toBe(true);
    expect(await crea('gestorL', carga)).toBe(false);
    expect(await crea('gestorE', carga)).toBe(true);
    expect(await puede('gestorE', 'delete', STORAGE_DOC_DELETE)).toBe(false);
  });

  it('descarga exige el ID referenciado en metadata disponible y acceso al inmueble; no admite enumerar Storage', async () => {
    expect(await puede('propietarioA', 'get', STORAGE_DOC_AVAILABLE)).toBe(true);
    expect(await puede('propietarioB', 'get', STORAGE_DOC_AVAILABLE)).toBe(false);
    expect(await puede('anonimo', 'get', STORAGE_DOC_AVAILABLE)).toBe(false);
    expect(await puede('propietarioA', 'get', STORAGE_DOC_PENDING)).toBe(false);
    expect(await puede('propietarioA', 'get', 'inmuebles/INM_A/documentos_patrimoniales/doc_desconocido/factura.pdf')).toBe(false);
    expect(await puede('propietarioA', 'list', STORAGE_DOC_AVAILABLE)).toBe(false);
  });

  it('sólo el titular/admin puede borrar el binario en estado PENDIENTE_ELIMINACION; nunca se actualiza ni se sobrescribe', async () => {
    expect(await puede('propietarioA', 'delete', STORAGE_DOC_DELETE)).toBe(true);
    expect(await puede('propietarioB', 'delete', STORAGE_DOC_DELETE)).toBe(false);
    expect(await puede('profesional', 'delete', STORAGE_DOC_DELETE)).toBe(false);
    expect(await puede('propietarioA', 'update', STORAGE_DOC_AVAILABLE, PDF(STORAGE_DOC_AVAILABLE))).toBe(false);
    expect(await puede('propietarioA', 'delete', STORAGE_DOC_AVAILABLE)).toBe(false);
  });
});

describe('A · hasSafeObjectName(): nombre de objeto seguro (validado sobre el nombre completo del objeto)', () => {
  // Nombres EXACTOS que construyen los clientes del repositorio (ver
  // src/lib/firebase.ts, firebaseActas.ts, suministrosFirestore.ts,
  // morosidadEvidenciasStorage.ts) tras su saneado `[^a-zA-Z0-9._-] → _`.
  const LEGITIMOS: Array<[Actor, Recurso]> = [
    ['propietarioA', PDF('cobros_justificantes/PROP_A/cobro_c1_2026_01/1758556800000_justificante.pdf')],
    ['propietarioA', PDF('gastos_facturas/PROP_A/gasto_1/1758556800000_Factura_Luz_enero.pdf')],
    ['anonimo', PDF('documentos_solicitados/sol-1758556800000/req-preset-1758556800000_1758556800001_DNI_frontal.pdf')],
    ['anonimo', JPG('documentos_solicitados/sol-1/req-custom-1_2_nomina.jpg')],
    ['propietarioA', JPG('inmuebles/inm-1/img_1758556800000_ab12c_salon.jpg')],
    ['propietarioA', JPG('inmuebles/inm-1/inventario/doc_1758556800000/1758556800000_frigorifico.png')],
    ['propietarioA', JPG('recomercializacion_fotos/PROP_A/exp_1/salon_1758556800000_x9k2_foto.jpg')],
    ['propietarioA', JPG('incidencias_fotos/PROP_A/inc_1/1758556800000_x9k2_foto.jpg')],
    ['propietarioA', PDF('reformas_documentos/PROP_A/proy_1/1758556800000_presupuesto_cocina.pdf')],
    ['propietarioA', JPG('reformas_fotos/PROP_A/proy_1/1758556800000_antes.jpg')],
    ['propietarioA', JPG('actas_fotos/PROP_A/acta_1/1758556800000_x9k2_evidencia.jpg')],
    ['propietarioA', PDF('actas_pdfs/PROP_A/acta_1/Acta_ENTRADA_2026-09-22_v1_abcd1234.pdf')],
    ['profesional', JPG('incidencias/INC_A/1758556800000_fuga_cocina.jpg')],
    ['inquilinoA', JPG('incidencias/INC_A/ev_m1abc_x9k2q1_fuga.jpg')],
    ['inquilinoA', JPG('suministros/SUM_A/lecturas/LEC_A/foto_m1abc_x9k2q1_contador.jpg')],
    ['admin', PDF('morosidad_evidencias/PROP_A/mor_1/1758556800000_ab12_requerimiento.pdf')],
  ];

  it('acepta el nombre que genera cada cliente real (ninguna subida legítima se rompe)', async () => {
    for (const [actor, recurso] of LEGITIMOS) {
      if (actor === 'anonimo') {
        // Portal de candidatos: la subida va con el token de la solicitud (AG-03.2).
        const solicitudDocId = recurso.name.split('/')[1];
        expect(await creaPortal(recurso, { solicitudDocId, token: TOKENS_PORTAL[solicitudDocId] }), `portal → ${recurso.name}`).toBe(true);
        continue;
      }
      expect(await crea(actor, recurso), `${actor} → ${recurso.name}`).toBe(true);
    }
  });

  it('acepta nombres sin extensión y con un solo carácter (el tipo lo gobierna contentType)', async () => {
    expect(await crea('propietarioA', PDF('gastos_facturas/PROP_A/G1/x'))).toBe(true);
    expect(await crea('propietarioA', PDF('gastos_facturas/PROP_A/G1/1758556800000_factura'))).toBe(true);
  });

  const HOSTILES: Array<[string, string]> = [
    ['segmento extra (anidación no prevista)', 'gastos_facturas/PROP_A/G1/sub/factura.pdf'],
    ['segmento vacío intermedio', 'gastos_facturas/PROP_A//factura.pdf'],
    ['nombre vacío (termina en barra)', 'gastos_facturas/PROP_A/G1/'],
    ['trayecto `..` como nombre', 'gastos_facturas/PROP_A/G1/..'],
    ['trayecto `.` como nombre', 'gastos_facturas/PROP_A/G1/.'],
    ['nombre que empieza por punto (oculto)', 'gastos_facturas/PROP_A/G1/.htaccess'],
    ['nombre que termina en punto', 'gastos_facturas/PROP_A/G1/factura.'],
    ['espacio', 'gastos_facturas/PROP_A/G1/mi factura.pdf'],
    ['carácter de control', 'gastos_facturas/PROP_A/G1/factura\u0000.pdf'],
    ['salto de línea', 'gastos_facturas/PROP_A/G1/factura\n.pdf'],
    ['unicode no ASCII', 'gastos_facturas/PROP_A/G1/facturá.pdf'],
    ['barra invertida', 'gastos_facturas/PROP_A/G1/..\\factura.pdf'],
    ['porcentaje / codificación', 'gastos_facturas/PROP_A/G1/%2e%2e%2ffactura.pdf'],
    ['último segmento > 255', `gastos_facturas/PROP_A/G1/${'a'.repeat(256)}.pdf`],
    ['nombre completo > 1024', `gastos_facturas/${'P'.repeat(400)}/${'G'.repeat(400)}/${'a'.repeat(230)}.pdf`],
  ];

  it('rechaza nombres hostiles aunque el actor esté autorizado y el tipo/tamaño sean válidos', async () => {
    for (const [motivo, name] of HOSTILES) {
      expect(await crea('propietarioA', PDF(name)), motivo).toBe(false);
      expect(await crea('admin', PDF(name)), `${motivo} (admin)`).toBe(false);
    }
  });

  it('el límite de 255 del último segmento es exacto (255 pasa, 256 no)', async () => {
    expect(await crea('propietarioA', PDF(`gastos_facturas/PROP_A/G1/${'a'.repeat(251)}.pdf`))).toBe(true); // 255
    expect(await crea('propietarioA', PDF(`gastos_facturas/PROP_A/G1/${'a'.repeat(252)}.pdf`))).toBe(false); // 256
  });

  it('trayectos `..` se rechazan también en los árboles recursivos (`{file=**}`) y en el inventario', async () => {
    expect(await crea('profesional', JPG('incidencias/INC_A/../INC_B/foto.jpg'))).toBe(false);
    expect(await crea('profesional', JPG('incidencias/INC_A/./foto.jpg'))).toBe(false);
    expect(await crea('profesional', JPG('incidencias/INC_A//foto.jpg'))).toBe(false);
    expect(await crea('inquilinoA', JPG('suministros/SUM_A/lecturas/LEC_A/../LEC_B/foto.jpg'))).toBe(false);
    expect(await crea('propietarioA', JPG('inmuebles/INM_A/inventario/../portada.jpg'))).toBe(false);
    expect(await crea('propietarioA', JPG('inmuebles/INM_A/inventario/INV1/.oculto.jpg'))).toBe(false);
  });

  it('la forma segura del nombre se valida en el servidor sobre la ruta completa (paridad con hasSafeObjectName)', async () => {
    expect(esRutaSegura('gastos_facturas/PROP_A/G1/x')).toBe(true);
    expect(esRutaSegura('a'.repeat(1025))).toBe(false);
    expect(esRutaSegura('gastos_facturas/PROP_A//f.pdf')).toBe(false);
    expect(esRutaSegura('gastos_facturas/PROP_A/./f.pdf')).toBe(false);
    expect(esRutaSegura('gastos_facturas/PROP_A/../f.pdf')).toBe(false);
    expect(esRutaSegura('gastos_facturas/PROP_A/G1/.oculto')).toBe(false);
    expect(esRutaSegura(`gastos_facturas/PROP_A/G1/${'a'.repeat(255)}`)).toBe(true);
    expect(esRutaSegura(`gastos_facturas/PROP_A/G1/${'a'.repeat(256)}`)).toBe(false);
    // Una ruta insegura no tiene destino: ni la administración opera sobre ella.
    for (const [, name] of HOSTILES) expect(destinoDe(name), name).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B · Aislamiento entre propietarios y enumeración
// ---------------------------------------------------------------------------
describe('B · aislamiento propietario A / B, enumeración y acceso anónimo', () => {
  const OBJ_A = 'gastos_facturas/PROP_A/G1/1_factura.pdf';
  const CARPETA_A = 'gastos_facturas/PROP_A/G1';

  it('anónimo: nada en los árboles privados (get, list, create, update, delete)', async () => {
    for (const ruta of [OBJ_A, 'cobros_justificantes/PROP_A/C1/1_j.pdf', 'cobros_justificantes/C1/1_j.pdf', 'reformas_documentos/PROP_A/P1/1_d.pdf', 'actas_pdfs/PROP_A/A1/Acta_v1.pdf', 'inmuebles/INM_A/inventario/I1/1_f.png', 'incidencias/INC_A/1_f.jpg', 'morosidad_evidencias/PROP_A/M1/1_r.pdf']) {
      expect(await puede('anonimo', 'get', ruta), `get ${ruta}`).toBe(false);
      expect(await puede('anonimo', 'list', ruta), `list ${ruta}`).toBe(false);
      expect(await puede('anonimo', 'create', ruta, PDF(ruta)), `create ${ruta}`).toBe(false);
      expect(await puede('anonimo', 'update', ruta, PDF(ruta)), `update ${ruta}`).toBe(false);
      expect(await puede('anonimo', 'delete', ruta), `delete ${ruta}`).toBe(false);
    }
  });

  it('enumeración cerrada: la API del servidor no expone LISTAR ningún árbol privado (tampoco a la administración)', async () => {
    for (const carpeta of [CARPETA_A, 'cobros_justificantes/PROP_A/C1', 'cobros_justificantes/C1', 'documentos_solicitados/S1', 'recomercializacion_fotos/PROP_A/E1', 'incidencias_fotos/PROP_A/I1', 'reformas_documentos/PROP_A/P1', 'reformas_fotos/PROP_A/P1', 'actas_fotos/PROP_A/A1', 'actas_pdfs/PROP_A/A1']) {
      const objeto = `${carpeta}/x`;
      for (const actor of INTERNOS_NO_ADMIN) expect(await puede(actor, 'list', objeto), `${actor} list ${carpeta}`).toBe(false);
      expect(await puede('admin', 'list', objeto), `admin list ${carpeta}`).toBe(false);
    }
  });

  it('D3 RESUELVE R-2: ni por nombre exacto hay lectura transversal (ámbito por espejo, sin custom claims)', async () => {
    expect(await puede('propietarioB', 'get', OBJ_A)).toBe(false);
    expect(await puede('propietarioB', 'create', OBJ_A, PDF(OBJ_A))).toBe(false);
    expect(await puede('propietarioB', 'delete', OBJ_A)).toBe(false);
    expect(await puede('propietarioA', 'get', OBJ_A)).toBe(true);
    expect(await puede('propietarioB', 'list', OBJ_A)).toBe(false);
    expect(await puede('anonimo', 'get', OBJ_A)).toBe(false);
    // El motivo es el ámbito del espejo de la base con nombre, no un custom claim.
    expect((await decidirEnServidor('get', ctx('propietarioB', OBJ_A))).motivo).toBe('AMBITO_PROPIETARIO_LECTURA');
  });

  it('D3 RESUELVE R-1: el inquilino (sin espejo) no entra en los árboles internos', async () => {
    expect(await puede('inquilinoA', 'get', OBJ_A)).toBe(false);
    expect(await puede('inquilinoA', 'create', OBJ_A, PDF(OBJ_A))).toBe(false);
    expect(await puede('inquilinoA', 'delete', OBJ_A)).toBe(false);
    expect(await puede('inquilinoA', 'list', OBJ_A)).toBe(false);
    expect(await puede('autenticadoSinFicha', 'get', OBJ_A)).toBe(false);
  });

  it('morosidad_evidencias (R2): sólo el master lee/crea; nadie actualiza ni borra; el propietario titular tampoco', async () => {
    const r = 'morosidad_evidencias/PROP_A/M1/1_req.pdf';
    expect(await puede('admin', 'get', r)).toBe(true);
    expect(await puede('admin', 'list', r)).toBe(false); // sin enumeración en la API
    expect(await crea('admin', PDF(r))).toBe(true);
    expect(await crea('admin', { name: r, size: 1024, contentType: 'image/gif' })).toBe(false);
    expect(await crea('admin', PDF(r, 10 * MB))).toBe(false);
    for (const actor of ['propietarioA', 'propietarioB', 'profesional', 'inquilinoA', 'anonimo'] as Actor[]) {
      expect(await puede(actor, 'get', r), actor).toBe(false);
      expect(await crea(actor, PDF(r)), actor).toBe(false);
    }
    for (const actor of TODOS) {
      expect(await puede(actor, 'update', r, PDF(r)), `${actor} update`).toBe(false);
      expect(await puede(actor, 'delete', r), `${actor} delete`).toBe(false);
    }
  });

  it('cualquier prefijo no declarado cae en la denegación por defecto para todos los actores', async () => {
    for (const ruta of ['otro/x.pdf', 'presupuestos/PRE1/1_p.pdf', 'trabajos/TRA1/1_t.pdf', 'profesionales/PRO1/documentos/1_c.pdf', 'gastos_facturas/x.pdf', 'inmuebles/x.jpg']) {
      for (const actor of TODOS) {
        expect(await puede(actor, 'get', ruta), `${actor} get ${ruta}`).toBe(false);
        expect(await puede(actor, 'create', ruta, PDF(ruta)), `${actor} create ${ruta}`).toBe(false);
        expect(await puede(actor, 'delete', ruta), `${actor} delete ${ruta}`).toBe(false);
      }
      expect(destinoDe(ruta), ruta).toBeNull();
      expect((await decidirEnServidor('get', ctx('admin', ruta))).motivo).toBe('SIN_DESTINO');
    }
  });
});

// ---------------------------------------------------------------------------
// C · Incidencias (E.1): un solo bloque `{file=**}`; aislamiento del inquilino
// ---------------------------------------------------------------------------
describe('C · incidencias/{incidenciaId}/{file=**} (E.1) — aislamiento del inquilino, evidencias válidas, sin bloque solapado', () => {
  const EV_A = 'incidencias/INC_A/ev_1_fuga.jpg';
  const EV_B = 'incidencias/INC_B/ev_1_humedad.jpg';

  it('existe exactamente un destino para incidencias/ (árbol recursivo) y NO se integró el `{fileName}` de la Arena C', async () => {
    for (const ruta of [EV_A, 'incidencias/INC_A/adjuntos/2026/ev_1.jpg']) {
      expect(DESTINOS.filter((d) => d.patron.test(ruta)).map((d) => d.clave), ruta).toEqual(['INCIDENCIA_EVIDENCIA']);
    }
    expect(destinoDe(EV_A)).toBe('INCIDENCIA_EVIDENCIA');
    expect(destinoDe('incidencias/INC_A/adjuntos/2026/ev_1.jpg')).toBe('INCIDENCIA_EVIDENCIA');
  });

  it('lectura: el inquilino sólo ve evidencias de incidencias de SUS contratos (intacto); el personal sólo las de SU ámbito (D3); anónimo nada', async () => {
    expect(await puede('inquilinoA', 'get', EV_A)).toBe(true);
    expect(await puede('inquilinoA', 'get', EV_B)).toBe(false);
    expect(await puede('inquilinoB', 'get', EV_A)).toBe(false);
    expect(await puede('inquilinoB', 'get', EV_B)).toBe(true);
    expect(await puede('inquilinoA', 'get', 'incidencias/INC_SIN_CONTRATO/ev.jpg')).toBe(false);
    expect(await puede('inquilinoA', 'get', 'incidencias/INC_INEXISTENTE/ev.jpg')).toBe(false);
    // D3: titular en lo suyo, profesional asignado en la suya, admin global.
    expect(await puede('admin', 'get', EV_A)).toBe(true);
    expect(await puede('admin', 'get', EV_B)).toBe(true);
    expect(await puede('propietarioA', 'get', EV_A)).toBe(true);
    expect(await puede('propietarioA', 'get', EV_B)).toBe(false);
    expect(await puede('propietarioB', 'get', EV_A)).toBe(false);
    expect(await puede('propietarioB', 'get', EV_B)).toBe(true);
    expect(await puede('profesional', 'get', EV_A)).toBe(true); // asignado a INC_A
    expect(await puede('profesional', 'get', EV_B)).toBe(false);
    expect(await puede('anonimo', 'get', EV_A)).toBe(false);
  });

  it('subida: inquilino sólo a su incidencia, con tipo permitido, < 10 MB y nombre seguro', async () => {
    expect(await crea('inquilinoA', JPG(EV_A))).toBe(true);
    expect(await crea('inquilinoA', PDF('incidencias/INC_A/ev_1_informe.pdf'))).toBe(true);
    expect(await crea('inquilinoA', { name: 'incidencias/INC_A/ev_1_f.png', size: 10 * MB - 1, contentType: 'image/png' })).toBe(true);
    // ajena
    expect(await crea('inquilinoA', JPG(EV_B))).toBe(false);
    expect(await crea('inquilinoB', JPG(EV_A))).toBe(false);
    // incidencia inexistente / sin contrato
    expect(await crea('inquilinoA', JPG('incidencias/INC_INEXISTENTE/ev.jpg'))).toBe(false);
    expect(await crea('inquilinoA', JPG('incidencias/INC_SIN_CONTRATO/ev.jpg'))).toBe(false);
    // tamaño y tipo (esEvidenciaValida)
    expect(await crea('inquilinoA', JPG(EV_A, 10 * MB))).toBe(false);
    expect(await crea('inquilinoA', { name: EV_A, size: 1024, contentType: 'text/html' })).toBe(false);
    expect(await crea('inquilinoA', { name: EV_A, size: 1024, contentType: 'image/svg+xml' })).toBe(false);
    expect(await crea('inquilinoA', { name: EV_A, size: 1024, contentType: 'video/mp4' })).toBe(false);
    expect(await crea('inquilinoA', { name: EV_A, size: 1024, contentType: 'application/octet-stream' })).toBe(false);
    // nombre hostil
    expect(await crea('inquilinoA', JPG('incidencias/INC_A/../INC_B/ev.jpg'))).toBe(false);
    expect(await crea('inquilinoA', JPG('incidencias/INC_A/ev con espacio.jpg'))).toBe(false);
  });

  it('subida: el personal aporta SÓLO en su ámbito con evidencia válida (D3); anónimo nunca', async () => {
    for (const actor of ['admin', 'propietarioA', 'profesional'] as Actor[]) {
      expect(await crea(actor, JPG(EV_A)), actor).toBe(true);
      expect(await crea(actor, { name: EV_A, size: 1024, contentType: 'text/html' }), `${actor} html`).toBe(false);
      expect(await crea(actor, JPG(EV_A, 10 * MB)), `${actor} 10MB`).toBe(false);
    }
    expect(await crea('admin', JPG(EV_B))).toBe(true);
    expect(await crea('propietarioA', JPG(EV_B))).toBe(false); // transversal
    expect(await crea('profesional', JPG(EV_B))).toBe(false); // no asignado a INC_B
    expect(await crea('propietarioB', JPG(EV_A))).toBe(false); // transversal
    expect(await crea('propietarioB', JPG(EV_B))).toBe(true);
    expect(await crea('anonimo', JPG(EV_A))).toBe(false);
  });

  it('borrado: nunca el inquilino ni el anónimo; titular en lo suyo y admin (D3: el profesional no borra)', async () => {
    expect(await puede('inquilinoA', 'delete', EV_A)).toBe(false);
    expect(await puede('anonimo', 'delete', EV_A)).toBe(false);
    expect(await puede('admin', 'delete', EV_A)).toBe(true);
    expect(await puede('propietarioA', 'delete', EV_A)).toBe(true);
    expect(await puede('propietarioA', 'delete', EV_B)).toBe(false);
    expect(await puede('propietarioB', 'delete', EV_A)).toBe(false);
    expect(await puede('profesional', 'delete', EV_A)).toBe(false);
  });

  it('el subárbol recursivo sigue cubierto (rutas más profundas heredan el mismo aislamiento, no la denegación)', async () => {
    const profunda = 'incidencias/INC_A/adjuntos/2026/ev_1.jpg';
    expect(await puede('inquilinoA', 'get', profunda)).toBe(true);
    expect(await puede('inquilinoB', 'get', profunda)).toBe(false);
    expect(await crea('inquilinoA', JPG(profunda))).toBe(true);
    expect(await crea('inquilinoB', JPG(profunda))).toBe(false);
  });

  it('E.2 lecturas de contador: el inquilino sube sólo si su contrato es el activo del inmueble del suministro', async () => {
    const foto = 'suministros/SUM_A/lecturas/LEC_A/foto_1_contador.jpg';
    expect(await crea('inquilinoA', JPG(foto))).toBe(true);
    expect(await crea('inquilinoB', JPG(foto))).toBe(false);
    expect(await crea('inquilinoA', JPG('suministros/SUM_INEXISTENTE/lecturas/L/foto.jpg'))).toBe(false);
    expect(await puede('inquilinoA', 'get', foto)).toBe(true);
    expect(await puede('inquilinoB', 'get', foto)).toBe(false);
    expect(await puede('inquilinoA', 'delete', foto)).toBe(false);
    expect(await puede('profesional', 'delete', foto)).toBe(false); // D3: el profesional no borra
    expect(await puede('propietarioA', 'delete', foto)).toBe(true); // titular del inmueble del suministro
    expect(await puede('propietarioB', 'delete', foto)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D · Actas: flujo legítimo de PDF (re-subida del mismo nombre) y fotos
// ---------------------------------------------------------------------------
describe('D · actas_pdfs / actas_fotos — flujo legítimo del PDF de acta', () => {
  const PDF_ACTA = 'actas_pdfs/PROP_A/acta_1/Acta_SALIDA_2026-09-22_v2_1a2b3c4d.pdf';
  const FOTO_ACTA = 'actas_fotos/PROP_A/acta_1/1758556800000_x9k2_evidencia.jpg';

  it('el personal sube el PDF con el nombre determinista que construye ActasSection.handleGenerarPdf', async () => {
    for (const actor of ['admin', 'propietarioA'] as Actor[]) expect(await crea(actor, PDF(PDF_ACTA)), actor).toBe(true);
    expect(await crea('profesional', PDF(PDF_ACTA))).toBe(false); // D3: sin ámbito en PROP_A
    expect(await crea('propietarioB', PDF(PDF_ACTA))).toBe(false); // D3: transversal
    expect(await crea('anonimo', PDF(PDF_ACTA))).toBe(false);
    expect(await crea('propietarioA', PDF(PDF_ACTA, 20 * MB))).toBe(false);
    expect(await crea('propietarioA', { name: PDF_ACTA, size: 1024, contentType: 'text/html' })).toBe(false);
  });

  it('regenerar la misma versión (mismo nombre) sigue permitido: `update` interno conservado SÓLO en actas_pdfs', async () => {
    expect(await puede('propietarioA', 'update', PDF_ACTA, PDF(PDF_ACTA))).toBe(true);
    expect(await puede('anonimo', 'update', PDF_ACTA, PDF(PDF_ACTA))).toBe(false);
    // Las fotos de acta llevan `Date.now()_rand_` → nombre único → sin update.
    expect(await crea('propietarioA', JPG(FOTO_ACTA))).toBe(true);
    expect(await puede('propietarioA', 'update', FOTO_ACTA, JPG(FOTO_ACTA))).toBe(false);
    expect(await puede('admin', 'update', FOTO_ACTA, JPG(FOTO_ACTA))).toBe(false);
  });

  it('lectura en ámbito (D3), sin listado, borrado titular/admin', async () => {
    for (const actor of ['admin', 'propietarioA'] as Actor[]) expect(await puede(actor, 'get', PDF_ACTA), actor).toBe(true);
    for (const actor of ['propietarioB', 'profesional', 'inquilinoA', 'inquilinoB', 'autenticadoSinFicha'] as Actor[]) {
      expect(await puede(actor, 'get', PDF_ACTA), actor).toBe(false);
    }
    for (const actor of INTERNOS_NO_ADMIN) expect(await puede(actor, 'list', PDF_ACTA), actor).toBe(false);
    expect(await puede('admin', 'list', PDF_ACTA)).toBe(false); // sin enumeración en la API
    expect(await puede('propietarioA', 'delete', PDF_ACTA)).toBe(true);
    expect(await puede('propietarioB', 'delete', PDF_ACTA)).toBe(false);
    expect(await puede('anonimo', 'delete', PDF_ACTA)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E · Matriz `update` / `delete` por ruta (sin `update:false` global)
// ---------------------------------------------------------------------------
describe('E · update (metadatos) y delete por ruta — decisiones específicas, no globales', () => {
  const SIN_UPDATE = [
    'cobros_justificantes/PROP_A/C1/1_j.pdf',
    'cobros_justificantes/C1/1_j.pdf',
    'gastos_facturas/PROP_A/G1/1_f.pdf',
    'documentos_solicitados/S1/req_1_dni.pdf',
    'documentos_solicitados/S1/legado/req_1_dni.pdf',
    'inmuebles/INM_A/img_1_a.jpg',
    'recomercializacion_fotos/PROP_A/E1/salon_1_x_f.jpg',
    'incidencias_fotos/PROP_A/I1/1_x_f.jpg',
    'reformas_documentos/PROP_A/P1/1_d.pdf',
    'reformas_fotos/PROP_A/P1/1_a.jpg',
    'actas_fotos/PROP_A/A1/1_x_e.jpg',
    'morosidad_evidencias/PROP_A/M1/1_r.pdf',
  ];
  const CON_UPDATE_INTERNO = [
    'actas_pdfs/PROP_A/A1/Acta_v1.pdf', // re-subida determinista
    'inmuebles/INM_A/inventario/I1/1_f.png', // bloque R3 conservado tal cual
    'contratos/CON_A/contrato.pdf', // E.3 conservado
    'recibos/CON_A/2026_01/recibo.pdf', // E.4 conservado
  ];

  it('update denegado para TODOS los actores en las rutas de nombre único por subida', async () => {
    for (const ruta of SIN_UPDATE) for (const actor of TODOS) {
      expect(await puede(actor, 'update', ruta, PDF(ruta)), `${actor} update ${ruta}`).toBe(false);
    }
  });

  it('update conservado (como en la canónica) sólo donde el flujo o el bloque validado lo requieren', async () => {
    for (const ruta of CON_UPDATE_INTERNO) {
      // La sobrescritura respeta el tipo del destino (el inventario sólo admite imagen).
      expect(await puede('propietarioA', 'update', ruta, recursoAdmitido(ruta)), ruta).toBe(true);
      expect(await puede('anonimo', 'update', ruta, recursoAdmitido(ruta)), ruta).toBe(false);
    }
    expect(await puede('propietarioA', 'update', 'inmuebles/INM_A/inventario/I1/1_f.png', PDF('inmuebles/INM_A/inventario/I1/1_f.png'))).toBe(false);
    // E.1/E.2: update sujeto a la MISMA validación de evidencia y aislamiento que create.
    expect(await puede('inquilinoA', 'update', 'incidencias/INC_A/ev.jpg', JPG('incidencias/INC_A/ev.jpg'))).toBe(true);
    expect(await puede('inquilinoA', 'update', 'incidencias/INC_B/ev.jpg', JPG('incidencias/INC_B/ev.jpg'))).toBe(false);
    expect(await puede('inquilinoA', 'update', 'incidencias/INC_A/ev.jpg', { name: 'incidencias/INC_A/ev.jpg', size: 1, contentType: 'text/html' })).toBe(false);
  });

  it('la sobrescritura no es una decisión global: es por destino (semántica, no texto)', async () => {
    // Para cada destino se evalúa `update` (SOBRESCRIBIR) del admin sobre un objeto de ejemplo.
    const denegados: string[] = [];
    const concedidos: string[] = [];
    for (const clave of CLAVES_DESTINO) {
      const ruta = rutaEjemplo(clave);
      ((await puede('admin', 'update', ruta, recursoAdmitido(ruta))) ? concedidos : denegados).push(clave);
    }
    expect(denegados.sort()).toEqual([
      'COBROS_JUSTIFICANTES',
      'COBROS_JUSTIFICANTES_LEGADO',
      'GASTOS_FACTURAS',
      'DOCUMENTOS_SOLICITADOS',
      'DOCUMENTOS_SOLICITADOS_PROFUNDO',
      'INMUEBLE_FOTO',
      'INMUEBLE_DOCUMENTO_PATRIMONIAL',
      // P3: documentos de profesionales — nombre único por documentoId, sin update.
      'PROFESIONAL_DOCUMENTO',
      'RECOMERCIALIZACION_FOTOS',
      'INCIDENCIAS_FOTOS',
      'REFORMAS_DOCUMENTOS',
      'REFORMAS_FOTOS',
      'ACTAS_FOTOS',
      'MOROSIDAD_EVIDENCIA',
    ].sort());
    expect(concedidos.sort()).toEqual([
      'INMUEBLE_INVENTARIO',
      'ACTAS_PDFS',
      'INCIDENCIA_EVIDENCIA',
      'SUMINISTRO_LECTURA',
      'CONTRATO_DOCUMENTO',
      'RECIBO',
    ].sort());
    // Fuera de todo destino no hay sobrescritura posible.
    expect(await puede('admin', 'update', 'otro/x.pdf', PDF('otro/x.pdf'))).toBe(false);
  });

  it('delete: nunca anónimo; titular en lo suyo (D3: B no borra lo de A); nunca inquilino en E.1/E.2; nadie en morosidad', async () => {
    for (const ruta of [...SIN_UPDATE, ...CON_UPDATE_INTERNO]) expect(await puede('anonimo', 'delete', ruta), ruta).toBe(false);
    // D3: propietarioB no es titular de nada de la matriz (todo PROP_A/S1/INM_A/CON_A) ⇒ deny.
    for (const ruta of SIN_UPDATE.filter((r) => !r.startsWith('morosidad_'))) expect(await puede('propietarioB', 'delete', ruta), ruta).toBe(false);
    // ...mientras el titular sí borra lo suyo (sin pérdida de operativa legítima).
    for (const ruta of SIN_UPDATE.filter((r) => r.includes('/PROP_A/') && !r.startsWith('morosidad_'))) {
      expect(await puede('propietarioA', 'delete', ruta), ruta).toBe(true);
    }
    expect(await puede('propietarioA', 'delete', 'inmuebles/INM_A/img_1_a.jpg')).toBe(true); // titular del inmueble
    expect(await puede('propietarioB', 'delete', 'inmuebles/INM_A/img_1_a.jpg')).toBe(false);
    expect(await puede('inquilinoA', 'delete', 'incidencias/INC_A/ev.jpg')).toBe(false);
    expect(await puede('inquilinoA', 'delete', 'contratos/CON_A/contrato.pdf')).toBe(false);
    expect(await puede('inquilinoA', 'delete', 'recibos/CON_A/k/recibo.pdf')).toBe(false);
    expect(await puede('admin', 'delete', 'morosidad_evidencias/PROP_A/M1/1_r.pdf')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F · Rutas con cambio de forma: documentos_solicitados, catálogo e inventario
// ---------------------------------------------------------------------------
describe('F · documentos_solicitados (portal anónimo), catálogo público e inventario R3', () => {
  const PLANO = 'documentos_solicitados/sol-1/req-preset-1_2_dni.pdf';
  const ANIDADO = 'documentos_solicitados/sol-1/otra/carpeta/dni.pdf';

  it('portal: el candidato sube UN objeto en la ruta plana con el TOKEN de su solicitud, PDF/imagen, < 15 MB, nombre seguro', async () => {
    // AG-03.2: sin token no hay subida anónima (antes la regla la admitía a cualquiera que conociera la ruta).
    expect(await crea('anonimo', PDF(PLANO))).toBe(false);
    expect(await creaPortal(PDF(PLANO))).toBe(true);
    expect(await creaPortal(JPG(PLANO))).toBe(true);
    expect(await creaPortal({ name: PLANO, size: 1024, contentType: 'application/octet-stream' })).toBe(true); // R-3 declarado
    expect(await creaPortal(PDF(PLANO, 15 * MB))).toBe(false);
    expect(await creaPortal({ name: PLANO, size: 1024, contentType: 'text/html' })).toBe(false);
    expect(await creaPortal({ name: PLANO, size: 1024, contentType: 'application/x-msdownload' })).toBe(false);
    expect(await creaPortal(PDF('documentos_solicitados/sol-1/dni con espacios.pdf'))).toBe(false);
    // Token equivocado, de otra solicitud o ruta de otra solicitud: denegado.
    expect(await creaPortal(PDF(PLANO), { solicitudDocId: 'sol-1', token: 'tok-equivocado-123' })).toBe(false);
    expect(await creaPortal(PDF('documentos_solicitados/sol-2/dni.pdf'), PORTAL)).toBe(false);
    // El token sólo CREA en la ruta plana: ni lee, ni borra, ni sube anidado.
    expect(await creaPortal(PDF(ANIDADO))).toBe(false);
    expect(await puede('anonimo', 'get', PLANO)).toBe(false);
  });

  it('portal: la subida anónima anidada (antes admitida por `{allFiles=**}`) queda cerrada; ningún actor crea ahí', async () => {
    for (const actor of TODOS) {
      expect(await crea(actor, PDF(ANIDADO)), `${actor} create anidado`).toBe(false);
      expect(await puede(actor, 'update', ANIDADO, PDF(ANIDADO)), `${actor} update anidado`).toBe(false);
    }
  });

  it('portal: los objetos anidados YA EXISTENTES sólo en ámbito (solicitud → candidato → inmueble → titular; admin huérfanos)', async () => {
    // `sol-1` deriva a INM_A/PROP_A: titular lee y borra; el resto no. Una
    // solicitud inexistente sólo la opera la administración (huérfanos).
    expect(await puede('admin', 'get', ANIDADO)).toBe(true);
    expect(await puede('admin', 'delete', ANIDADO)).toBe(true);
    expect(await puede('propietarioA', 'get', ANIDADO)).toBe(true);
    expect(await puede('propietarioA', 'delete', ANIDADO)).toBe(true);
    for (const actor of ['propietarioB', 'profesional', 'inquilinoA', 'inquilinoB', 'autenticadoSinFicha'] as Actor[]) {
      expect(await puede(actor, 'get', ANIDADO), `${actor} get`).toBe(false);
      expect(await puede(actor, 'delete', ANIDADO), `${actor} delete`).toBe(false);
    }
    const HUERFANO = 'documentos_solicitados/sol-inexistente/otra/dni.pdf';
    expect(await puede('admin', 'get', HUERFANO)).toBe(true);
    expect(await puede('propietarioA', 'get', HUERFANO)).toBe(false);
    expect(await puede('anonimo', 'get', ANIDADO)).toBe(false);
    expect(await puede('anonimo', 'get', PLANO)).toBe(false);
    expect(await puede('anonimo', 'delete', PLANO)).toBe(false);
    for (const actor of INTERNOS_NO_ADMIN) expect(await puede(actor, 'list', PLANO), actor).toBe(false);
    expect(await puede('admin', 'list', PLANO)).toBe(false); // sin enumeración en la API
  });

  it('catálogo: `get` público del objeto plano (también en storage.rules); sin `list`; el inventario nunca público', async () => {
    const portada = 'inmuebles/inm-1/img_1_portada.jpg';
    const inventario = 'inmuebles/inm-1/inventario/doc_1/1_frigorifico.png';
    expect(await puede('anonimo', 'get', portada)).toBe(true);
    expect(await puede('anonimo', 'list', portada)).toBe(false);
    // AG-03.2: la API no enumera; la antigua excepción UX (`list` con sesión) desaparece con el SDK.
    expect(await puede('propietarioA', 'list', portada)).toBe(false);
    expect(await puede('admin', 'list', portada)).toBe(false);
    // Es la ÚNICA concesión que conserva storage.rules (lectura directa del catálogo por URL).
    expect(FUENTE).toMatch(/match \/inmuebles\/\{inmuebleId\}\/\{fileName\} \{[^}]*allow get: if true;/);
    expect(await puede('anonimo', 'get', inventario)).toBe(false);
    expect(await puede('anonimo', 'list', inventario)).toBe(false);
    expect(await puede('propietarioA', 'get', inventario)).toBe(true);
    expect(await crea('anonimo', JPG(portada))).toBe(false);
    expect(await crea('propietarioA', JPG(portada))).toBe(true);
    expect(await crea('propietarioA', PDF(portada))).toBe(false); // sólo imagen
    expect(await crea('propietarioA', JPG(inventario))).toBe(true);
    expect(await crea('propietarioA', PDF(inventario))).toBe(false); // sólo imagen (F-7 de la auditoría, no ampliado)
    expect(destinoDe(inventario)).toBe('INMUEBLE_INVENTARIO');
    expect(destinoDe(portada)).toBe('INMUEBLE_FOTO');
  });
});

// ---------------------------------------------------------------------------
// G · Estructura del fichero e integración de server.ts (invariantes mínimos)
// ---------------------------------------------------------------------------
describe('G · estructura de storage.rules e integración server.ts', () => {
  it('rules_version 2, catch-all deny último, llaves balanceadas, sin match anidados', async () => {
    expect(FUENTE.startsWith("rules_version = '2';")).toBe(true);
    expect((FUENTE.match(/{/g) || []).length).toBe((FUENTE.match(/}/g) || []).length);
    const catchAll = FUENTE.indexOf('match /{allPaths=**}');
    expect(catchAll).toBeGreaterThan(0);
    expect(FUENTE.slice(catchAll)).toContain('allow read, write: if false;');
    expect(FUENTE.indexOf('match /', catchAll + 10)).toBe(-1);
  });

  it('AG-03.2: storage.rules no consulta Firestore (ninguna base) y sólo concede el `get` del catálogo', async () => {
    const sinComentarios = FUENTE.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(sinComentarios).not.toMatch(/firestore\.(get|exists)\(/);
    expect(sinComentarios).not.toContain('/databases/');
    expect(sinComentarios).not.toContain('(default)');
    const concesiones = sinComentarios.match(/allow [a-z, ]+: if (?!false;)[^;]+;/g) || [];
    expect(concesiones).toEqual(['allow get: if true;']);
    expect(FUENTE).not.toMatch(/allow read: if true/);
    expect(FUENTE).not.toMatch(/allow list: if true/);
  });

  it('no hay ningún `list` público: ni en las reglas ni en el servidor', async () => {
    for (const clave of CLAVES_DESTINO) {
      expect(await puede('anonimo', 'list', rutaEjemplo(clave)), `list anónimo en ${clave}`).toBe(false);
    }
  });

  it('AG-04: server.ts ya no instancia ningún almacén de documentos en memoria ni sirve binarios por URL de capacidad', async () => {
    const src = readFileSync(raiz('server.ts'), 'utf8');
    expect(src).not.toContain('documentosServidor');
    expect(src).not.toContain('AlmacenDocumentosEfimeros');
    expect(src).not.toMatch(/new Map<\s*string,\s*\{ buffer: Buffer/);
    expect(src).not.toContain('storagePath: `server_${fileId}`');
    expect(src).not.toMatch(/Cache-Control',\s*'public/);
    // Las rutas antiguas siguen declaradas SOLO para responder 410 (retirada explícita).
    expect(src).toMatch(/app\.post\('\/api\/upload-document',\s*\(_req, res\) => responderAlmacenTemporalRetirado\(res\)\)/);
    expect(src).toMatch(/app\.get\('\/api\/documents\/:fileId',\s*\(_req, res\) => responderAlmacenTemporalRetirado\(res\)\)/);
    expect(src).toContain("res.status(410)");
    expect(src).toContain("codigo: 'ALMACEN_TEMPORAL_RETIRADO'");
  });
});
