/**
 * C-SECURITY · SEGURIDAD DE ACCESO A DOCUMENTOS Y FIREBASE STORAGE
 * Integración reformulada (2026-09-22) del bloque `520bda7` de la Arena C sobre
 * la canónica `c4cee78`. Documento: docs/AUDITORIA-SEGURIDAD-STORAGE-DOCUMENTOS-2026-09-22.md
 * ---------------------------------------------------------------------------
 * METODOLOGÍA (leer antes de dar por bueno ningún verde):
 *  · NO hay emulador de Firebase en este entorno (`firebase-tools`/Java no
 *    instalados, sin red). Las reglas se evalúan con un INTÉRPRETE PROPIO del
 *    subconjunto del lenguaje que usa `storage.rules`
 *    (tests/helpers/evaluadorReglasStorage.ts): parsea el texto real del
 *    fichero y decide cada operación con un contexto sintético (auth, documentos
 *    Firestore, recurso subido). Reproduce la semántica documentada (v2, OR de
 *    bloques solapados, `read`/`write` expandidos, error ⇒ denegado) pero NO es
 *    el motor de Google: la validación en emulador/proyecto queda PENDIENTE (NV).
 *  · `src/lib/documentosServidor.ts` (servidor de documentos de `server.ts`) sí
 *    se ejecuta de verdad.
 *  · Sección G: invariantes textuales mínimos (catch-all último, `server.ts`
 *    usa el módulo). No sustituyen a las secciones semánticas.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decidir, parsearReglas, permitido, type ContextoPeticion, type Metodo } from './helpers/evaluadorReglasStorage';
import {
  AlmacenDocumentosEfimeros,
  MAX_BYTES_POR_DOCUMENTO,
  cabecerasDocumento,
  decodificarBase64Documento,
  generarIdDocumento,
  idDeDocumentoValido,
  nombreMostrable,
  normalizarTipoContenido,
} from '../src/lib/documentosServidor';

const raiz = (rel: string) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const FUENTE = readFileSync(raiz('storage.rules'), 'utf8');
const REGLAS = parsearReglas(FUENTE);

// ---------------------------------------------------------------------------
// Actores sintéticos
// ---------------------------------------------------------------------------
const ADMIN_EMAIL = 'sarqsan2@gmail.com';
const FS = {
  'usuarios/uid_propA': { tipoPerfil: 'PROPIETARIO', propietarioId: 'PROP_A' },
  'usuarios/uid_propB': { tipoPerfil: 'PROPIETARIO', propietarioId: 'PROP_B' },
  'usuarios/uid_prof': { tipoPerfil: 'PROFESIONAL' },
  'usuarios/uid_inqA': { tipoPerfil: 'INQUILINO', contratoIds: ['CON_A'] },
  'usuarios/uid_inqB': { tipoPerfil: 'INQUILINO', contratoIds: ['CON_B'] },
  'incidencias/INC_A': { contratoId: 'CON_A' },
  'incidencias/INC_B': { contratoId: 'CON_B' },
  'incidencias/INC_SIN_CONTRATO': {},
  'suministros/SUM_A': { inmuebleId: 'INM_A' },
  'inmuebles/INM_A': { contratoActivoId: 'CON_A' },
  'lecturas_suministro/LEC_A': { contratoId: 'CON_A' },
} as const;

type Actor = 'anonimo' | 'admin' | 'propietarioA' | 'propietarioB' | 'profesional' | 'inquilinoA' | 'inquilinoB' | 'autenticadoSinFicha';

function ctx(actor: Actor, resource?: ContextoPeticion['resource']): ContextoPeticion {
  const auth: Record<Actor, ContextoPeticion['auth']> = {
    anonimo: null,
    admin: { uid: 'uid_admin', token: { email: ADMIN_EMAIL, email_verified: true } },
    propietarioA: { uid: 'uid_propA', token: { email: 'a@example.com' } },
    propietarioB: { uid: 'uid_propB', token: { email: 'b@example.com' } },
    profesional: { uid: 'uid_prof', token: { email: 'p@example.com' } },
    inquilinoA: { uid: 'uid_inqA', token: { email: 'ia@example.com' } },
    inquilinoB: { uid: 'uid_inqB', token: { email: 'ib@example.com' } },
    autenticadoSinFicha: { uid: 'uid_sin_ficha', token: {} },
  };
  return { auth: auth[actor], firestore: FS as unknown as Record<string, Record<string, unknown>>, resource };
}

const PDF = (name: string, size = 1024) => ({ name, size, contentType: 'application/pdf' });
const JPG = (name: string, size = 1024) => ({ name, size, contentType: 'image/jpeg' });
const MB = 1024 * 1024;

const puede = (actor: Actor, metodo: Metodo, ruta: string, recurso?: ContextoPeticion['resource']) =>
  permitido(REGLAS, ruta, metodo, ctx(actor, recurso));
const crea = (actor: Actor, recurso: NonNullable<ContextoPeticion['resource']>) => puede(actor, 'create', recurso.name, recurso);

const TODOS: Actor[] = ['anonimo', 'admin', 'propietarioA', 'propietarioB', 'profesional', 'inquilinoA', 'inquilinoB', 'autenticadoSinFicha'];
const AUTENTICADOS: Actor[] = TODOS.filter((a) => a !== 'anonimo');
const INTERNOS_NO_ADMIN: Actor[] = ['propietarioA', 'propietarioB', 'profesional', 'autenticadoSinFicha'];

// ---------------------------------------------------------------------------
// A · hasSafeObjectName(): forma del nombre de objeto sobre la ruta completa
// ---------------------------------------------------------------------------
describe('A · hasSafeObjectName(): nombre de objeto seguro (validado sobre el nombre completo del objeto)', () => {
  // Nombres EXACTOS que construyen los clientes del repositorio (ver
  // src/lib/firebase.ts, firebaseActas.ts, suministrosFirestore.ts,
  // morosidadEvidenciasStorage.ts) tras su saneado `[^a-zA-Z0-9._-] → _`.
  const LEGITIMOS: Array<[Actor, NonNullable<ContextoPeticion['resource']>]> = [
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

  it('acepta el nombre que genera cada cliente real (ninguna subida legítima se rompe)', () => {
    for (const [actor, recurso] of LEGITIMOS) {
      expect(crea(actor, recurso), `${actor} → ${recurso.name}`).toBe(true);
    }
  });

  it('acepta nombres sin extensión y con un solo carácter (el tipo lo gobierna contentType)', () => {
    expect(crea('propietarioA', PDF('gastos_facturas/PROP_A/G1/x'))).toBe(true);
    expect(crea('propietarioA', PDF('gastos_facturas/PROP_A/G1/1758556800000_factura'))).toBe(true);
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

  it('rechaza nombres hostiles aunque el actor esté autorizado y el tipo/tamaño sean válidos', () => {
    for (const [motivo, name] of HOSTILES) {
      expect(crea('propietarioA', PDF(name)), motivo).toBe(false);
      expect(crea('admin', PDF(name)), `${motivo} (admin)`).toBe(false);
    }
  });

  it('el límite de 255 del último segmento es exacto (255 pasa, 256 no)', () => {
    expect(crea('propietarioA', PDF(`gastos_facturas/PROP_A/G1/${'a'.repeat(251)}.pdf`))).toBe(true); // 255
    expect(crea('propietarioA', PDF(`gastos_facturas/PROP_A/G1/${'a'.repeat(252)}.pdf`))).toBe(false); // 256
  });

  it('trayectos `..` se rechazan también en los árboles recursivos (`{file=**}`) y en el inventario', () => {
    expect(crea('profesional', JPG('incidencias/INC_A/../INC_B/foto.jpg'))).toBe(false);
    expect(crea('profesional', JPG('incidencias/INC_A/./foto.jpg'))).toBe(false);
    expect(crea('profesional', JPG('incidencias/INC_A//foto.jpg'))).toBe(false);
    expect(crea('inquilinoA', JPG('suministros/SUM_A/lecturas/LEC_A/../LEC_B/foto.jpg'))).toBe(false);
    expect(crea('propietarioA', JPG('inmuebles/INM_A/inventario/../portada.jpg'))).toBe(false);
    expect(crea('propietarioA', JPG('inmuebles/INM_A/inventario/INV1/.oculto.jpg'))).toBe(false);
  });

  it('el helper está definido una sola vez y valida el nombre completo con las cuatro condiciones', () => {
    const def = FUENTE.match(/function hasSafeObjectName\(\) \{[\s\S]*?\n\s*\}/g) || [];
    expect(def).toHaveLength(1);
    expect(def[0]).toContain('request.resource.name.size() <= 1024');
    expect(def[0]).toContain("matches('.*//.*')");
    expect(def[0]).toContain("matches('.*/[.]{1,2}/.*')");
    expect(def[0]).toContain("[A-Za-z0-9._-]{0,253}[A-Za-z0-9_-])')");
  });
});

// ---------------------------------------------------------------------------
// B · Aislamiento entre propietarios y enumeración
// ---------------------------------------------------------------------------
describe('B · aislamiento propietario A / B, enumeración y acceso anónimo', () => {
  const OBJ_A = 'gastos_facturas/PROP_A/G1/1_factura.pdf';
  const CARPETA_A = 'gastos_facturas/PROP_A/G1';

  it('anónimo: nada en los árboles privados (get, list, create, update, delete)', () => {
    for (const ruta of [OBJ_A, 'cobros_justificantes/PROP_A/C1/1_j.pdf', 'cobros_justificantes/C1/1_j.pdf', 'reformas_documentos/PROP_A/P1/1_d.pdf', 'actas_pdfs/PROP_A/A1/Acta_v1.pdf', 'inmuebles/INM_A/inventario/I1/1_f.png', 'incidencias/INC_A/1_f.jpg', 'morosidad_evidencias/PROP_A/M1/1_r.pdf']) {
      expect(puede('anonimo', 'get', ruta), `get ${ruta}`).toBe(false);
      expect(puede('anonimo', 'list', ruta), `list ${ruta}`).toBe(false);
      expect(puede('anonimo', 'create', ruta, PDF(ruta)), `create ${ruta}`).toBe(false);
      expect(puede('anonimo', 'update', ruta, PDF(ruta)), `update ${ruta}`).toBe(false);
      expect(puede('anonimo', 'delete', ruta), `delete ${ruta}`).toBe(false);
    }
  });

  it('enumeración cerrada: ninguna cuenta interna no-admin puede LISTAR un árbol privado; el admin sí', () => {
    for (const carpeta of [CARPETA_A, 'cobros_justificantes/PROP_A/C1', 'cobros_justificantes/C1', 'documentos_solicitados/S1', 'recomercializacion_fotos/PROP_A/E1', 'incidencias_fotos/PROP_A/I1', 'reformas_documentos/PROP_A/P1', 'reformas_fotos/PROP_A/P1', 'actas_fotos/PROP_A/A1', 'actas_pdfs/PROP_A/A1']) {
      const objeto = `${carpeta}/x`;
      for (const actor of INTERNOS_NO_ADMIN) expect(puede(actor, 'list', objeto), `${actor} list ${carpeta}`).toBe(false);
      expect(puede('admin', 'list', objeto), `admin list ${carpeta}`).toBe(true);
    }
  });

  it('RESIDUAL R-2 (declarado, no corregido): sin custom claims, una cuenta interna de B puede hacer `get` de un objeto de A por su nombre exacto', () => {
    expect(puede('propietarioB', 'get', OBJ_A)).toBe(true);
    expect(puede('propietarioA', 'get', OBJ_A)).toBe(true);
    // ...pero no puede descubrirlo enumerando (B) ni el anónimo abrirlo.
    expect(puede('propietarioB', 'list', OBJ_A)).toBe(false);
    expect(puede('anonimo', 'get', OBJ_A)).toBe(false);
    expect(FUENTE).toMatch(/R-2 sin custom claims/);
  });

  it('RESIDUAL R-1 (declarado, no corregido): `internalUser()` no excluye al perfil INQUILINO en los árboles internos', () => {
    expect(puede('inquilinoA', 'get', OBJ_A)).toBe(true);
    expect(puede('inquilinoA', 'list', OBJ_A)).toBe(false);
    expect(FUENTE).toMatch(/R-1 `internalUser\(\)` == cualquier cuenta autenticada/);
  });

  it('morosidad_evidencias (R2): sólo el master lee/crea; nadie actualiza ni borra; el propietario titular tampoco', () => {
    const r = 'morosidad_evidencias/PROP_A/M1/1_req.pdf';
    expect(puede('admin', 'get', r)).toBe(true);
    expect(puede('admin', 'list', r)).toBe(true);
    expect(crea('admin', PDF(r))).toBe(true);
    expect(crea('admin', { name: r, size: 1024, contentType: 'image/gif' })).toBe(false);
    expect(crea('admin', PDF(r, 10 * MB))).toBe(false);
    for (const actor of ['propietarioA', 'propietarioB', 'profesional', 'inquilinoA', 'anonimo'] as Actor[]) {
      expect(puede(actor, 'get', r), actor).toBe(false);
      expect(crea(actor, PDF(r)), actor).toBe(false);
    }
    for (const actor of TODOS) {
      expect(puede(actor, 'update', r, PDF(r)), `${actor} update`).toBe(false);
      expect(puede(actor, 'delete', r), `${actor} delete`).toBe(false);
    }
  });

  it('cualquier prefijo no declarado cae en la denegación por defecto para todos los actores', () => {
    for (const ruta of ['otro/x.pdf', 'presupuestos/PRE1/1_p.pdf', 'trabajos/TRA1/1_t.pdf', 'profesionales/PRO1/documentos/1_c.pdf', 'gastos_facturas/x.pdf', 'inmuebles/x.jpg']) {
      for (const actor of TODOS) {
        expect(puede(actor, 'get', ruta), `${actor} get ${ruta}`).toBe(false);
        expect(puede(actor, 'create', ruta, PDF(ruta)), `${actor} create ${ruta}`).toBe(false);
        expect(puede(actor, 'delete', ruta), `${actor} delete ${ruta}`).toBe(false);
      }
      const d = decidir(REGLAS, ruta, 'get', ctx('admin'));
      expect(d.casan).toEqual(['/{allPaths=**}']);
    }
    // R-5 registrado en el propio fichero de reglas.
    expect(FUENTE).toMatch(/R-5 `presupuestos\/`, `trabajos\/` y `profesionales\/\{id\}\/documentos\/`/);
  });
});

// ---------------------------------------------------------------------------
// C · Incidencias (E.1): un solo bloque `{file=**}`; aislamiento del inquilino
// ---------------------------------------------------------------------------
describe('C · incidencias/{incidenciaId}/{file=**} (E.1) — aislamiento del inquilino, evidencias válidas, sin bloque solapado', () => {
  const EV_A = 'incidencias/INC_A/ev_1_fuga.jpg';
  const EV_B = 'incidencias/INC_B/ev_1_humedad.jpg';

  it('existe exactamente un bloque para incidencias/ y NO se integró el `{fileName}` de la Arena C', () => {
    const bloques = REGLAS.bloques.filter((b) => b.segmentos[0] === 'incidencias');
    expect(bloques.map((b) => b.patron)).toEqual(['/incidencias/{incidenciaId}/{file=**}']);
    expect(decidir(REGLAS, EV_A, 'get', ctx('inquilinoA')).casan).toEqual(['/incidencias/{incidenciaId}/{file=**}', '/{allPaths=**}']);
  });

  it('lectura: el inquilino sólo ve evidencias de incidencias de SUS contratos; el personal ve todas; anónimo nada', () => {
    expect(puede('inquilinoA', 'get', EV_A)).toBe(true);
    expect(puede('inquilinoA', 'get', EV_B)).toBe(false);
    expect(puede('inquilinoB', 'get', EV_A)).toBe(false);
    expect(puede('inquilinoB', 'get', EV_B)).toBe(true);
    expect(puede('inquilinoA', 'get', 'incidencias/INC_SIN_CONTRATO/ev.jpg')).toBe(false);
    expect(puede('inquilinoA', 'get', 'incidencias/INC_INEXISTENTE/ev.jpg')).toBe(false);
    for (const actor of ['admin', 'propietarioA', 'propietarioB', 'profesional'] as Actor[]) {
      expect(puede(actor, 'get', EV_A), actor).toBe(true);
      expect(puede(actor, 'get', EV_B), actor).toBe(true);
    }
    expect(puede('anonimo', 'get', EV_A)).toBe(false);
  });

  it('subida: inquilino sólo a su incidencia, con tipo permitido, < 10 MB y nombre seguro', () => {
    expect(crea('inquilinoA', JPG(EV_A))).toBe(true);
    expect(crea('inquilinoA', PDF('incidencias/INC_A/ev_1_informe.pdf'))).toBe(true);
    expect(crea('inquilinoA', { name: 'incidencias/INC_A/ev_1_f.png', size: 10 * MB - 1, contentType: 'image/png' })).toBe(true);
    // ajena
    expect(crea('inquilinoA', JPG(EV_B))).toBe(false);
    expect(crea('inquilinoB', JPG(EV_A))).toBe(false);
    // incidencia inexistente / sin contrato
    expect(crea('inquilinoA', JPG('incidencias/INC_INEXISTENTE/ev.jpg'))).toBe(false);
    expect(crea('inquilinoA', JPG('incidencias/INC_SIN_CONTRATO/ev.jpg'))).toBe(false);
    // tamaño y tipo (esEvidenciaValida)
    expect(crea('inquilinoA', JPG(EV_A, 10 * MB))).toBe(false);
    expect(crea('inquilinoA', { name: EV_A, size: 1024, contentType: 'text/html' })).toBe(false);
    expect(crea('inquilinoA', { name: EV_A, size: 1024, contentType: 'image/svg+xml' })).toBe(false);
    expect(crea('inquilinoA', { name: EV_A, size: 1024, contentType: 'video/mp4' })).toBe(false);
    expect(crea('inquilinoA', { name: EV_A, size: 1024, contentType: 'application/octet-stream' })).toBe(false);
    // nombre hostil
    expect(crea('inquilinoA', JPG('incidencias/INC_A/../INC_B/ev.jpg'))).toBe(false);
    expect(crea('inquilinoA', JPG('incidencias/INC_A/ev con espacio.jpg'))).toBe(false);
  });

  it('subida: el personal (no inquilino) puede aportar a cualquier incidencia con evidencia válida; anónimo nunca', () => {
    for (const actor of ['admin', 'propietarioA', 'profesional'] as Actor[]) {
      expect(crea(actor, JPG(EV_A)), actor).toBe(true);
      expect(crea(actor, JPG(EV_B)), actor).toBe(true);
      expect(crea(actor, { name: EV_A, size: 1024, contentType: 'text/html' }), `${actor} html`).toBe(false);
      expect(crea(actor, JPG(EV_A, 10 * MB)), `${actor} 10MB`).toBe(false);
    }
    expect(crea('anonimo', JPG(EV_A))).toBe(false);
  });

  it('borrado: nunca el inquilino ni el anónimo; sí el personal', () => {
    expect(puede('inquilinoA', 'delete', EV_A)).toBe(false);
    expect(puede('anonimo', 'delete', EV_A)).toBe(false);
    for (const actor of ['admin', 'propietarioA', 'profesional'] as Actor[]) expect(puede(actor, 'delete', EV_A), actor).toBe(true);
  });

  it('el subárbol recursivo sigue cubierto (rutas más profundas heredan el mismo aislamiento, no la denegación)', () => {
    const profunda = 'incidencias/INC_A/adjuntos/2026/ev_1.jpg';
    expect(puede('inquilinoA', 'get', profunda)).toBe(true);
    expect(puede('inquilinoB', 'get', profunda)).toBe(false);
    expect(crea('inquilinoA', JPG(profunda))).toBe(true);
    expect(crea('inquilinoB', JPG(profunda))).toBe(false);
  });

  it('E.2 lecturas de contador: el inquilino sube sólo si su contrato es el activo del inmueble del suministro', () => {
    const foto = 'suministros/SUM_A/lecturas/LEC_A/foto_1_contador.jpg';
    expect(crea('inquilinoA', JPG(foto))).toBe(true);
    expect(crea('inquilinoB', JPG(foto))).toBe(false);
    expect(crea('inquilinoA', JPG('suministros/SUM_INEXISTENTE/lecturas/L/foto.jpg'))).toBe(false);
    expect(puede('inquilinoA', 'get', foto)).toBe(true);
    expect(puede('inquilinoB', 'get', foto)).toBe(false);
    expect(puede('inquilinoA', 'delete', foto)).toBe(false);
    expect(puede('profesional', 'delete', foto)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D · Actas: flujo legítimo de PDF (re-subida del mismo nombre) y fotos
// ---------------------------------------------------------------------------
describe('D · actas_pdfs / actas_fotos — flujo legítimo del PDF de acta', () => {
  const PDF_ACTA = 'actas_pdfs/PROP_A/acta_1/Acta_SALIDA_2026-09-22_v2_1a2b3c4d.pdf';
  const FOTO_ACTA = 'actas_fotos/PROP_A/acta_1/1758556800000_x9k2_evidencia.jpg';

  it('el personal sube el PDF con el nombre determinista que construye ActasSection.handleGenerarPdf', () => {
    for (const actor of ['admin', 'propietarioA', 'profesional'] as Actor[]) expect(crea(actor, PDF(PDF_ACTA)), actor).toBe(true);
    expect(crea('anonimo', PDF(PDF_ACTA))).toBe(false);
    expect(crea('propietarioA', PDF(PDF_ACTA, 20 * MB))).toBe(false);
    expect(crea('propietarioA', { name: PDF_ACTA, size: 1024, contentType: 'text/html' })).toBe(false);
  });

  it('regenerar la misma versión (mismo nombre) sigue permitido: `update` interno conservado SÓLO en actas_pdfs', () => {
    expect(puede('propietarioA', 'update', PDF_ACTA, PDF(PDF_ACTA))).toBe(true);
    expect(puede('anonimo', 'update', PDF_ACTA, PDF(PDF_ACTA))).toBe(false);
    // Las fotos de acta llevan `Date.now()_rand_` → nombre único → sin update.
    expect(crea('propietarioA', JPG(FOTO_ACTA))).toBe(true);
    expect(puede('propietarioA', 'update', FOTO_ACTA, JPG(FOTO_ACTA))).toBe(false);
    expect(puede('admin', 'update', FOTO_ACTA, JPG(FOTO_ACTA))).toBe(false);
  });

  it('lectura interna, listado sólo admin, borrado interno', () => {
    for (const actor of AUTENTICADOS) expect(puede(actor, 'get', PDF_ACTA), actor).toBe(true);
    for (const actor of INTERNOS_NO_ADMIN) expect(puede(actor, 'list', PDF_ACTA), actor).toBe(false);
    expect(puede('admin', 'list', PDF_ACTA)).toBe(true);
    expect(puede('propietarioA', 'delete', PDF_ACTA)).toBe(true);
    expect(puede('anonimo', 'delete', PDF_ACTA)).toBe(false);
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

  it('update denegado para TODOS los actores en las rutas de nombre único por subida', () => {
    for (const ruta of SIN_UPDATE) for (const actor of TODOS) {
      expect(puede(actor, 'update', ruta, PDF(ruta)), `${actor} update ${ruta}`).toBe(false);
    }
  });

  it('update conservado (como en la canónica) sólo donde el flujo o el bloque validado lo requieren', () => {
    for (const ruta of CON_UPDATE_INTERNO) {
      expect(puede('propietarioA', 'update', ruta, PDF(ruta)), ruta).toBe(true);
      expect(puede('anonimo', 'update', ruta, PDF(ruta)), ruta).toBe(false);
    }
    // E.1/E.2: update sujeto a la MISMA validación de evidencia y aislamiento que create.
    expect(puede('inquilinoA', 'update', 'incidencias/INC_A/ev.jpg', JPG('incidencias/INC_A/ev.jpg'))).toBe(true);
    expect(puede('inquilinoA', 'update', 'incidencias/INC_B/ev.jpg', JPG('incidencias/INC_B/ev.jpg'))).toBe(false);
    expect(puede('inquilinoA', 'update', 'incidencias/INC_A/ev.jpg', { name: 'incidencias/INC_A/ev.jpg', size: 1, contentType: 'text/html' })).toBe(false);
  });

  it('el fichero no impone un `update: if false` global: la decisión es por bloque (semántica, no texto)', () => {
    // Para cada bloque se evalúa `update` del admin sobre un objeto de ejemplo del propio patrón.
    const ejemplo = (patron: string) => patron.replace(/^\//, '').replace(/\{\w+=\*\*\}/, 'a_1.pdf').replace(/\{\w+\}/g, 'x');
    const denegados: string[] = [];
    const concedidos: string[] = [];
    for (const b of REGLAS.bloques) {
      const ruta = ejemplo(b.patron);
      (puede('admin', 'update', ruta, PDF(ruta)) ? concedidos : denegados).push(b.patron);
    }
    expect(denegados).toEqual([
      '/cobros_justificantes/{propietarioId}/{cobroPeriodoId}/{fileName}',
      '/cobros_justificantes/{cobroPeriodoId}/{fileName}',
      '/gastos_facturas/{propietarioId}/{gastoId}/{fileName}',
      '/documentos_solicitados/{solicitudDocId}/{allFiles=**}',
      '/documentos_solicitados/{solicitudDocId}/{fileName}',
      '/inmuebles/{inmuebleId}/{fileName}',
      '/recomercializacion_fotos/{propietarioId}/{expedienteId}/{fileName}',
      '/incidencias_fotos/{propietarioId}/{incidenciaId}/{fileName}',
      '/reformas_documentos/{propietarioId}/{proyectoId}/{fileName}',
      '/reformas_fotos/{propietarioId}/{proyectoId}/{fileName}',
      '/actas_fotos/{propietarioId}/{actaId}/{fileName}',
      '/morosidad_evidencias/{propietarioId}/{expedienteId}/{fileName}',
      '/{allPaths=**}',
    ]);
    expect(concedidos).toEqual([
      '/inmuebles/{inmuebleId}/inventario/{allFiles=**}',
      '/actas_pdfs/{propietarioId}/{actaId}/{fileName}',
      '/incidencias/{incidenciaId}/{file=**}',
      '/suministros/{suministroId}/lecturas/{lecturaId}/{file=**}',
      '/contratos/{contratoId}/{file=**}',
      '/recibos/{contratoId}/{claveCobro}/{file=**}',
    ]);
  });

  it('delete: nunca anónimo; interno en árboles internos; nunca inquilino en E.1/E.2; nadie en morosidad', () => {
    for (const ruta of [...SIN_UPDATE, ...CON_UPDATE_INTERNO]) expect(puede('anonimo', 'delete', ruta), ruta).toBe(false);
    for (const ruta of SIN_UPDATE.filter((r) => !r.startsWith('morosidad_'))) expect(puede('propietarioB', 'delete', ruta), ruta).toBe(true);
    expect(puede('inquilinoA', 'delete', 'incidencias/INC_A/ev.jpg')).toBe(false);
    expect(puede('inquilinoA', 'delete', 'contratos/CON_A/contrato.pdf')).toBe(false);
    expect(puede('inquilinoA', 'delete', 'recibos/CON_A/k/recibo.pdf')).toBe(false);
    expect(puede('admin', 'delete', 'morosidad_evidencias/PROP_A/M1/1_r.pdf')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F · Rutas con cambio de forma: documentos_solicitados, catálogo e inventario
// ---------------------------------------------------------------------------
describe('F · documentos_solicitados (portal anónimo), catálogo público e inventario R3', () => {
  const PLANO = 'documentos_solicitados/sol-1/req-preset-1_2_dni.pdf';
  const ANIDADO = 'documentos_solicitados/sol-1/otra/carpeta/dni.pdf';

  it('portal: el candidato anónimo sube UN objeto en la ruta plana, PDF/imagen, < 15 MB, nombre seguro', () => {
    expect(crea('anonimo', PDF(PLANO))).toBe(true);
    expect(crea('anonimo', JPG(PLANO))).toBe(true);
    expect(crea('anonimo', { name: PLANO, size: 1024, contentType: 'application/octet-stream' })).toBe(true); // R-3 declarado
    expect(crea('anonimo', PDF(PLANO, 15 * MB))).toBe(false);
    expect(crea('anonimo', { name: PLANO, size: 1024, contentType: 'text/html' })).toBe(false);
    expect(crea('anonimo', { name: PLANO, size: 1024, contentType: 'application/x-msdownload' })).toBe(false);
    expect(crea('anonimo', PDF('documentos_solicitados/sol-1/dni con espacios.pdf'))).toBe(false);
  });

  it('portal: la subida anónima anidada (antes admitida por `{allFiles=**}`) queda cerrada; ningún actor crea ahí', () => {
    for (const actor of TODOS) {
      expect(crea(actor, PDF(ANIDADO)), `${actor} create anidado`).toBe(false);
      expect(puede(actor, 'update', ANIDADO, PDF(ANIDADO)), `${actor} update anidado`).toBe(false);
    }
  });

  it('portal: los objetos anidados YA EXISTENTES siguen legibles y borrables por cuentas internas (sin pérdida)', () => {
    for (const actor of AUTENTICADOS) {
      expect(puede(actor, 'get', ANIDADO), `${actor} get`).toBe(true);
      expect(puede(actor, 'delete', ANIDADO), `${actor} delete`).toBe(true);
    }
    expect(puede('anonimo', 'get', ANIDADO)).toBe(false);
    expect(puede('anonimo', 'get', PLANO)).toBe(false);
    expect(puede('anonimo', 'delete', PLANO)).toBe(false);
    for (const actor of INTERNOS_NO_ADMIN) expect(puede(actor, 'list', PLANO), actor).toBe(false);
    expect(puede('admin', 'list', PLANO)).toBe(true);
  });

  it('catálogo: `get` público del objeto plano; `list` sólo con sesión; el inventario nunca público', () => {
    const portada = 'inmuebles/inm-1/img_1_portada.jpg';
    const inventario = 'inmuebles/inm-1/inventario/doc_1/1_frigorifico.png';
    expect(puede('anonimo', 'get', portada)).toBe(true);
    expect(puede('anonimo', 'list', portada)).toBe(false);
    expect(puede('propietarioA', 'list', portada)).toBe(true);
    expect(puede('anonimo', 'get', inventario)).toBe(false);
    expect(puede('anonimo', 'list', inventario)).toBe(false);
    expect(puede('propietarioA', 'get', inventario)).toBe(true);
    expect(crea('anonimo', JPG(portada))).toBe(false);
    expect(crea('propietarioA', JPG(portada))).toBe(true);
    expect(crea('propietarioA', PDF(portada))).toBe(false); // sólo imagen
    expect(crea('propietarioA', JPG(inventario))).toBe(true);
    expect(crea('propietarioA', PDF(inventario))).toBe(false); // sólo imagen (F-7 de la auditoría, no ampliado)
    expect(decidir(REGLAS, inventario, 'get', ctx('anonimo')).casan).toEqual(['/inmuebles/{inmuebleId}/inventario/{allFiles=**}', '/{allPaths=**}']);
  });
});

// ---------------------------------------------------------------------------
// G · Estructura del fichero e integración de server.ts (invariantes mínimos)
// ---------------------------------------------------------------------------
describe('G · estructura de storage.rules e integración server.ts', () => {
  it('rules_version 2, catch-all deny último, llaves balanceadas, sin match anidados', () => {
    expect(FUENTE.startsWith("rules_version = '2';")).toBe(true);
    expect(REGLAS.bloques[REGLAS.bloques.length - 1].patron).toBe('/{allPaths=**}');
    expect((FUENTE.match(/{/g) || []).length).toBe((FUENTE.match(/}/g) || []).length);
    const catchAll = FUENTE.indexOf('match /{allPaths=**}');
    expect(FUENTE.slice(catchAll)).toContain('allow read, write: if false;');
    expect(FUENTE.indexOf('match /', catchAll + 10)).toBe(-1);
  });

  it('no hay ningún `list` público ni ningún `read: if true` en todo el bucket', () => {
    for (const b of REGLAS.bloques) {
      for (const ruta of [b.patron.replace(/^\//, '').replace(/\{\w+=\*\*\}/, 'a/b').replace(/\{\w+\}/g, 'x')]) {
        expect(puede('anonimo', 'list', ruta), `list anónimo en ${b.patron}`).toBe(false);
      }
    }
    expect(FUENTE).not.toMatch(/allow read: if true/);
  });

  it('server.ts usa el módulo de documentos y ya no sirve con caché pública ni id predecible', () => {
    const src = readFileSync(raiz('server.ts'), 'utf8');
    expect(src).toContain("from './src/lib/documentosServidor'");
    expect(src).toContain('new AlmacenDocumentosEfimeros()');
    expect(src).toContain('generarIdDocumento()');
    expect(src).toContain('idDeDocumentoValido(fileId)');
    expect(src).toContain('cabecerasDocumento(');
    expect(src).not.toMatch(/Cache-Control',\s*'public/);
    expect(src).not.toMatch(/max-age=86400/);
    expect(src).not.toMatch(/new Map<\s*string,\s*\{ buffer: Buffer/);
    for (const clave of ['url: fileUrl', 'downloadURL: fileUrl', 'storagePath: `server_${fileId}`', 'mimeType: tipo', 'size: buffer.length']) {
      expect(src, clave).toContain(clave);
    }
  });
});

// ---------------------------------------------------------------------------
// H · Servidor de documentos (ejecución real del módulo)
// ---------------------------------------------------------------------------
describe('H · documentosServidor.ts — lo que se ejecuta de verdad', () => {
  it('S-1: sólo tipos visualizables van inline; HTML/SVG/JS/desconocidos se degradan a descarga', () => {
    expect(normalizarTipoContenido('text/html', 'f.html')).toEqual({ tipo: 'application/octet-stream', permitirInline: false });
    expect(normalizarTipoContenido('image/svg+xml', 'l.svg')).toEqual({ tipo: 'application/octet-stream', permitirInline: false });
    expect(normalizarTipoContenido('application/javascript', 'x.js').permitirInline).toBe(false);
    expect(normalizarTipoContenido('application/pdf', 'c.pdf')).toEqual({ tipo: 'application/pdf', permitirInline: true });
    expect(normalizarTipoContenido('image/jpeg', 'c.jpg').permitirInline).toBe(true);
    expect(normalizarTipoContenido('video/mp4', 'v.mp4')).toEqual({ tipo: 'video/mp4', permitirInline: false });
    expect(normalizarTipoContenido(undefined, 'sin_tipo.pdf').tipo).toBe('application/pdf');
    expect(normalizarTipoContenido(undefined, 'sin_tipo.html').tipo).toBe('application/octet-stream');
    expect(normalizarTipoContenido('Image/PNG; charset=x', 'a').tipo).toBe('image/png');
  });

  it('S-2/S-5: cabeceras privadas, nosniff, sin CR/LF ni comillas inyectables', () => {
    const h = cabecerasDocumento('application/pdf', true, 'x.pdf\r\nSet-Cookie: a=b"');
    expect(h['Cache-Control']).toBe('private, no-store, max-age=0');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    for (const v of Object.values(h)) expect(v).not.toMatch(/[\r\n"]/);
    expect(cabecerasDocumento('application/octet-stream', false, 'a.svg')['Content-Disposition']).toMatch(/^attachment;/);
    expect(nombreMostrable('../../etc/passwd')).not.toMatch(/[\\/]/);
    expect(nombreMostrable('')).toBe('documento');
    expect(nombreMostrable('ñ'.repeat(300)).length).toBeLessThanOrEqual(120);
  });

  it('S-3: id de 128 bits con forma fija; la lectura rechaza cualquier otra forma', () => {
    const ids = new Set(Array.from({ length: 500 }, generarIdDocumento));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(/^doc_[0-9a-f]{32}$/);
    for (const malo of ['doc_1758556800000_ab12c', 'doc_' + 'g'.repeat(32), 'DOC_' + 'a'.repeat(32), '', '../x', 'server_doc_' + 'a'.repeat(32), 42, null, undefined]) {
      expect(idDeDocumentoValido(malo), String(malo)).toBe(false);
    }
  });

  it('S-4: base64 validado antes de reservar memoria; tope por documento', () => {
    expect(decodificarBase64Documento('data:application/pdf;base64,JVBERi0=')).toMatchObject({ ok: true, bytes: 5 });
    expect(decodificarBase64Documento('JVBERi0=')).toMatchObject({ ok: true, bytes: 5 });
    expect(decodificarBase64Documento('data:text/plain,hola').ok).toBe(false);
    expect(decodificarBase64Documento('%%% no base64').ok).toBe(false);
    expect(decodificarBase64Documento('').ok).toBe(false);
    expect(decodificarBase64Documento(123).ok).toBe(false);
    expect(decodificarBase64Documento('A'.repeat(Math.ceil(((MAX_BYTES_POR_DOCUMENTO + 3) * 4) / 3) + 4)).ok).toBe(false);
    expect(MAX_BYTES_POR_DOCUMENTO).toBe(15 * MB);
  });

  it('S-4: almacén acotado por entradas, bytes y TTL; inmutable por id; el rol no interviene (URL de capacidad)', () => {
    let reloj = Date.parse('2026-09-22T00:00:00.000Z');
    const a = new AlmacenDocumentosEfimeros({ maxEntradas: 2, maxBytes: 500, ttlMs: 60_000, ahora: () => reloj });
    const id = (n: number) => `doc_${n.toString(16).padStart(32, '0')}`;
    const doc = (bytes: number) => ({ buffer: Buffer.alloc(bytes), mimeType: 'application/pdf', filename: 'x.pdf', uploadedAt: new Date(reloj).toISOString(), permitirInline: true, bytes });
    expect(a.set(id(1), doc(100)).ok).toBe(true);
    expect(a.set(id(1), doc(100)).motivo).toBe('id_ya_existe');
    expect(a.set('doc_x', doc(1)).motivo).toBe('id_no_valido');
    expect(a.set(id(2), doc(600)).motivo).toBe('documento_demasiado_grande');
    a.set(id(3), doc(100));
    a.set(id(4), doc(100));
    expect(a.tamano).toBe(2);
    expect(a.get(id(1))).toBeNull(); // desalojado (LRU por inserción)
    expect(a.get(id(4))).not.toBeNull();
    a.set(id(5), doc(300)); // 100+100+300 > 500 → desaloja el más antiguo
    expect(a.bytes).toBeLessThanOrEqual(500);
    reloj += 61_000;
    expect(a.get(id(5))).toBeNull(); // TTL
    expect(a.purgar()).toBeGreaterThanOrEqual(0);
    expect(a.tamano).toBe(0);
  });
});
