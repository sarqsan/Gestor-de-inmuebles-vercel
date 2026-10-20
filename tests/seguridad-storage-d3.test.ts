/**
 * D3 (ORDEN 4 §7) — Storage: fin del acceso transversal por path conocido.
 * ---------------------------------------------------------------------------
 * METODOLOGÍA (2026-10-20 · ORDEN AG-03.2): la decisión ya no está en
 * `storage.rules` (las reglas de Storage sólo pueden leer la base Firestore
 * `(default)`, que no forma parte de la arquitectura). Se evalúa el
 * AUTORIZADOR REAL del servidor (`server/documentos/autorizacionDocumental.ts`)
 * con el harness `tests/helpers/autorizacionDocumentalHarness.ts` sobre una
 * mini-base en memoria que representa la base con nombre. La validación con
 * cuentas reales contra el proyecto sigue PENDIENTE.
 *
 * Regla probada: el segmento `{propietarioId}` (o su derivación
 * inmueble/incidencia/contrato/suministro/solicitud → pid) se valida contra
 * el espejo canónico `usuarios_auth/{uid}` (+ administración). Titular lee/
 * escribe/borra lo suyo; cartera L lee; cartera E escribe; nadie transversal;
 * revocación ⇒ deny inmediato (sin ventana de token).
 */
import { describe, expect, it } from 'vitest';
import { EMAIL_MASTER } from '../server/titularidades/backendTitulares';
import { permiteServidor, type PeticionServidor } from './helpers/autorizacionDocumentalHarness';

const EMAIL_ADMIN = EMAIL_MASTER;

const espejo = (tipoPerfil: string, propietarioId: string, extra: Record<string, unknown> = {}) => ({
  tipoPerfil, estado: 'ACTIVO', propietarioId, profesionalId: '', inmuebleIds: [], ...extra,
});

const DB: PeticionServidor['db'] = {
  'usuarios/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', authUid: 'uid_admin' },
  'usuarios/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', contratoIds: ['ct_A'], authUid: 'uid_inq' },
  'usuarios_auth/uid_propA': espejo('PROPIETARIO', 'prop_A'),
  'usuarios_auth/uid_propB': espejo('PROPIETARIO', 'prop_B'),
  'usuarios_auth/uid_gestorE': espejo('PROPIETARIO', '', { carterasL: ['prop_A'], carterasE: ['prop_A'] }),
  'usuarios_auth/uid_gestorL': espejo('PROPIETARIO', '', { carterasL: ['prop_A'] }),
  'usuarios_auth/uid_gestorRev': espejo('PROPIETARIO', ''),
  'usuarios_auth/uid_prof': espejo('PROFESIONAL', '', { profesionalId: 'prof_1' }),
  'usuarios_auth/uid_profOtro': espejo('PROFESIONAL', '', { profesionalId: 'prof_9' }),
  'inmuebles/inm_A': { propietarioId: 'prop_A', contratoActivoId: 'ct_A' },
  'inmuebles/inm_B': { propietarioId: 'prop_B' },
  'contratos_formalizacion/ct_A': { propietarioId: 'prop_A', inmuebleId: 'inm_A' },
  'incidencias/inc_A': { propietarioId: 'prop_A', inmuebleId: 'inm_A', contratoId: 'ct_A', profesionalAsignadoId: 'prof_1' },
  'suministros/sum_A': { inmuebleId: 'inm_A' },
  'lecturas_suministro/lec_A': { suministroId: 'sum_A', inmuebleId: 'inm_A', contratoId: 'ct_A' },
  'solicitudes_documentacion/sd_A': { candidatoId: 'cand_A', inmuebleId: 'inm_A', token: 'tok-sd-A-123456' },
  'candidatos/cand_A': { inmuebleId: 'inm_A' },
  'candidatos/cand_B': { inmuebleId: 'inm_B' },
};

const AUTH = {
  propA: { uid: 'uid_propA', token: { email: 'prop-a@test.local' } },
  propB: { uid: 'uid_propB', token: { email: 'prop-b@test.local' } },
  gestorE: { uid: 'uid_gestorE', token: { email: 'gestor-e@test.local' } },
  gestorL: { uid: 'uid_gestorL', token: { email: 'gestor-l@test.local' } },
  gestorRev: { uid: 'uid_gestorRev', token: { email: 'gestor-rev@test.local' } },
  prof: { uid: 'uid_prof', token: { email: 'prof@test.local' } },
  profOtro: { uid: 'uid_profOtro', token: { email: 'prof9@test.local' } },
  /** Admin-perfil SIN espejo: la administración se reconoce por la ficha. */
  admin: { uid: 'uid_admin', token: { email: 'admin@test.local' } },
  inq: { uid: 'uid_inq', token: { email: 'inq@test.local' } },
  desconocido: { uid: 'uid_sin_ficha', token: { email: 'nadie@test.local' } },
  master: { uid: 'uid_master', token: { email: EMAIL_ADMIN } },
  anon: null,
};
type AuthKey = keyof typeof AUTH;
type Verbo = 'get' | 'list' | 'create' | 'update' | 'delete';

const pdf = (path: string, size = 1000) => ({ size, contentType: 'application/pdf', name: path });
const img = (path: string, size = 1000) => ({ size, contentType: 'image/jpeg', name: path });

type Metadata = { size: number; contentType: string; name: string; metadata?: Record<string, unknown> };

function op(verbo: Verbo, quien: AuthKey, path: string, metadata?: Metadata | null, publico?: PeticionServidor['publico']): Promise<boolean> {
  const pet: PeticionServidor = { auth: AUTH[quien], db: DB, path, metadata: metadata ?? null, ...(publico ? { publico } : {}) };
  return permiteServidor(verbo, pet);
}

// ---------------------------------------------------------------------------
// A — PATHS {propietarioId}: titular, carteras, cross-cartera, revocación
// ---------------------------------------------------------------------------
describe('D3 Storage · A — Paths por propietario', () => {
  const PIDS = [
    'cobros_justificantes/prop_A/cob1/1699_j.pdf',
    'gastos_facturas/prop_A/g1/1699_f.pdf',
    'recomercializacion_fotos/prop_A/exp1/foto.jpg',
    'incidencias_fotos/prop_A/inc_A/foto.jpg',
    'reformas_documentos/prop_A/pr1/plano.pdf',
    'reformas_fotos/prop_A/pr1/foto.jpg',
    'actas_fotos/prop_A/acta1/foto.jpg',
    'actas_pdfs/prop_A/acta1/Acta_ENTRADA_2026_v1_a1b2c3d4.pdf',
  ];
  it('A1 · el titular opera lo suyo (get/create/delete)', async () => {
    for (const p of PIDS) {
      const md = p.endsWith('.pdf') ? pdf(p) : img(p);
      expect(await op('get', 'propA', p)).toBe(true);
      expect(await op('create', 'propA', p, md)).toBe(true);
      expect(await op('delete', 'propA', p)).toBe(true);
    }
  });
  it('A2 · cartera L lee; cartera E lee+escribe; nadie borra; revocado fuera', async () => {
    for (const p of PIDS) {
      const md = p.endsWith('.pdf') ? pdf(p) : img(p);
      expect(await op('get', 'gestorL', p)).toBe(true);
      expect(await op('create', 'gestorL', p, md)).toBe(false);
      expect(await op('delete', 'gestorL', p)).toBe(false);
      expect(await op('get', 'gestorE', p)).toBe(true);
      expect(await op('create', 'gestorE', p, md)).toBe(true);
      expect(await op('delete', 'gestorE', p)).toBe(false);
      expect(await op('get', 'gestorRev', p)).toBe(false);
      expect(await op('create', 'gestorRev', p, md)).toBe(false);
    }
  });
  it('A3 · cross-cartera por path conocido: denegado (cierre R-2)', async () => {
    for (const p of PIDS) {
      const md = p.endsWith('.pdf') ? pdf(p) : img(p);
      expect(await op('get', 'propB', p)).toBe(false);
      expect(await op('create', 'propB', p, md)).toBe(false);
      expect(await op('delete', 'propB', p)).toBe(false);
      expect(await op('get', 'prof', p)).toBe(false);
      expect(await op('get', 'inq', p)).toBe(false);
      expect(await op('get', 'desconocido', p)).toBe(false);
      expect(await op('get', 'anon', p)).toBe(false);
    }
  });
  it('A4 · administración y master intactos; list no existe en la API (ni para el master)', async () => {
    for (const p of PIDS) {
      const md = p.endsWith('.pdf') ? pdf(p) : img(p);
      expect(await op('get', 'admin', p)).toBe(true);
      expect(await op('delete', 'admin', p)).toBe(true);
      expect(await op('get', 'master', p)).toBe(true);
      expect(await op('create', 'master', p, md)).toBe(true);
      expect(await op('list', 'master', p)).toBe(false);
      expect(await op('list', 'propA', p)).toBe(false);
    }
  });
  it('A5 · forma intacta (tamaño/tipo/nombre no debilitados)', async () => {
    const p = 'gastos_facturas/prop_A/g1/1699_f.pdf';
    expect(await op('create', 'propA', p, pdf(p, 20 * 1024 * 1024))).toBe(false); // >12MB
    expect(await op('create', 'propA', p, { size: 100, contentType: 'text/plain', name: p })).toBe(false);
    const trav = 'gastos_facturas/prop_A/g1/../x.pdf';
    expect(await op('create', 'propA', trav, { size: 100, contentType: 'application/pdf', name: trav })).toBe(false);
  });
  it('A6 · actas_pdfs conserva update acotado (regeneración); resto sin update', async () => {
    const pdfActa = 'actas_pdfs/prop_A/acta1/Acta_ENTRADA_2026_v1_a1b2c3d4.pdf';
    expect(await op('update', 'propA', pdfActa, pdf(pdfActa))).toBe(true);
    expect(await op('update', 'gestorE', pdfActa, pdf(pdfActa))).toBe(true);
    expect(await op('update', 'propB', pdfActa, pdf(pdfActa))).toBe(false);
    expect(await op('update', 'propA', 'gastos_facturas/prop_A/g1/1699_f.pdf', pdf('gastos_facturas/prop_A/g1/1699_f.pdf'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B — LEGACY sin propietario: fail-closed + migración pendiente
// ---------------------------------------------------------------------------
describe('D3 Storage · B — Ruta heredada sin ámbito', () => {
  const LEGACY = 'cobros_justificantes/cob1/j.pdf';
  it('B1 · fail-closed: ni titular ni gestor; solo administración', async () => {
    expect(await op('get', 'propA', LEGACY)).toBe(false);
    expect(await op('delete', 'propA', LEGACY)).toBe(false);
    expect(await op('get', 'gestorE', LEGACY)).toBe(false);
    expect(await op('get', 'admin', LEGACY)).toBe(true);
    expect(await op('delete', 'admin', LEGACY)).toBe(true);
    expect(await op('get', 'master', LEGACY)).toBe(true);
    expect(await op('create', 'master', LEGACY, pdf(LEGACY))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C — DOCUMENTOS SOLICITADOS (derivación + funnel intacto)
// ---------------------------------------------------------------------------
describe('D3 Storage · C — Documentos de candidatos', () => {
  const DOC = 'documentos_solicitados/sd_A/dni_1699_dni.pdf';
  it('C1 · ámbito solicitud→candidato→inmueble→propietario', async () => {
    expect(await op('get', 'propA', DOC)).toBe(true);
    expect(await op('delete', 'propA', DOC)).toBe(true);
    expect(await op('get', 'gestorE', DOC)).toBe(true);
    expect(await op('get', 'gestorL', DOC)).toBe(true);
    expect(await op('get', 'propB', DOC)).toBe(false);
    expect(await op('delete', 'propB', DOC)).toBe(false);
    expect(await op('get', 'prof', DOC)).toBe(false);
    expect(await op('get', 'admin', DOC)).toBe(true);
    expect(await op('get', 'master', DOC)).toBe(true);
  });
  it('C2 · create del funnel con el token de la solicitud (forma intacta); sin token o get/delete anónimos denegados', async () => {
    const PORTAL = { solicitudDocId: 'sd_A', token: 'tok-sd-A-123456' };
    expect(await op('create', 'anon', DOC, pdf(DOC), PORTAL)).toBe(true);
    expect(await op('create', 'anon', DOC, pdf(DOC, 20 * 1024 * 1024), PORTAL)).toBe(false);
    expect(await op('create', 'anon', DOC, pdf(DOC))).toBe(false); // AG-03.2: sin token no hay subida anónima
    expect(await op('create', 'anon', DOC, pdf(DOC), { solicitudDocId: 'sd_A', token: 'tok-otro-999999' })).toBe(false);
    expect(await op('get', 'anon', DOC)).toBe(false);
    expect(await op('delete', 'anon', DOC)).toBe(false);
  });
  it('C3 · árbol profundo hereda el mismo ámbito (OR de matches)', async () => {
    const deep = 'documentos_solicitados/sd_A/sub/carpeta/doc.pdf';
    expect(await op('get', 'propA', deep)).toBe(true);
    expect(await op('get', 'propB', deep)).toBe(false);
    expect(await op('create', 'propA', deep, pdf(deep))).toBe(false); // árbol: sin create
  });
});

// ---------------------------------------------------------------------------
// D — FOTOS DE INMUEBLE (público deliberado intacto; escritura acotada)
// ---------------------------------------------------------------------------
describe('D3 Storage · D — Catálogo público e inventario', () => {
  const FOTO_A = 'inmuebles/inm_A/portada.jpg';
  const INV_A = 'inmuebles/inm_A/inventario/inv_1/1699_sofa.jpg';
  it('D1 · get público intacto (R3, §11: no convertir público en autenticado)', async () => {
    expect(await op('get', 'anon', FOTO_A)).toBe(true);
    expect(await op('get', 'propB', FOTO_A)).toBe(true);
  });
  it('D2 · subir/borrar foto exige ámbito del inmueble', async () => {
    expect(await op('create', 'propA', FOTO_A, img(FOTO_A))).toBe(true);
    expect(await op('delete', 'propA', FOTO_A)).toBe(true);
    expect(await op('create', 'gestorE', FOTO_A, img(FOTO_A))).toBe(true);
    expect(await op('delete', 'gestorE', FOTO_A)).toBe(false);
    expect(await op('create', 'propB', FOTO_A, img(FOTO_A))).toBe(false);
    expect(await op('delete', 'propB', FOTO_A)).toBe(false);
    expect(await op('create', 'anon', FOTO_A, img(FOTO_A))).toBe(false);
    expect(await op('delete', 'admin', FOTO_A)).toBe(true);
  });
  it('D3 · inventario: interno + ámbito (nunca público)', async () => {
    expect(await op('get', 'anon', INV_A)).toBe(false);
    expect(await op('get', 'propA', INV_A)).toBe(true);
    expect(await op('create', 'propA', INV_A, img(INV_A))).toBe(true);
    expect(await op('delete', 'propA', INV_A)).toBe(true);
    expect(await op('get', 'propB', INV_A)).toBe(false);
    expect(await op('create', 'gestorE', INV_A, img(INV_A))).toBe(true);
    expect(await op('delete', 'gestorE', INV_A)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E — E.1 EVIDENCIAS DE INCIDENCIA
// ---------------------------------------------------------------------------
describe('D3 Storage · E — E.1 incidencias', () => {
  const EV = 'incidencias/inc_A/1699_fuga.jpg';
  it('E1 · ámbito + profesional asignado + tenant vinculado', async () => {
    expect(await op('get', 'propA', EV)).toBe(true);
    expect(await op('create', 'propA', EV, img(EV))).toBe(true);
    expect(await op('delete', 'propA', EV)).toBe(true);
    expect(await op('get', 'prof', EV)).toBe(true); // asignado a inc_A
    expect(await op('create', 'prof', EV, img(EV))).toBe(true);
    expect(await op('delete', 'prof', EV)).toBe(false); // no borra
    expect(await op('get', 'inq', EV)).toBe(true); // contrato ct_A vinculado
    expect(await op('create', 'inq', EV, img(EV))).toBe(true);
    expect(await op('delete', 'inq', EV)).toBe(false);
  });
  it('E2 · transversal denegado (otra cartera, otro profesional, revocado)', async () => {
    expect(await op('get', 'propB', EV)).toBe(false);
    expect(await op('create', 'propB', EV, img(EV))).toBe(false);
    expect(await op('get', 'profOtro', EV)).toBe(false);
    expect(await op('create', 'profOtro', EV, img(EV))).toBe(false);
    expect(await op('get', 'gestorRev', EV)).toBe(false);
    expect(await op('get', 'anon', EV)).toBe(false);
    expect(await op('get', 'gestorE', EV)).toBe(true); // cartera prop_A
    expect(await op('delete', 'gestorE', EV)).toBe(false);
  });
  it('E3 · forma de evidencia intacta', async () => {
    expect(await op('create', 'propA', EV, { size: 100, contentType: 'text/plain', name: EV })).toBe(false);
    expect(await op('create', 'propA', EV, img(EV, 11 * 1024 * 1024))).toBe(false); // >10MB
  });
});

// ---------------------------------------------------------------------------
// F — E.2 FOTOS DE LECTURA
// ---------------------------------------------------------------------------
describe('D3 Storage · F — E.2 suministros/lecturas', () => {
  const FOTO = 'suministros/sum_A/lecturas/lec_A/1699_contador.jpg';
  it('F1 · ámbito suministro→inmueble→propietario + tenant', async () => {
    expect(await op('get', 'propA', FOTO)).toBe(true);
    expect(await op('create', 'propA', FOTO, img(FOTO))).toBe(true);
    expect(await op('delete', 'propA', FOTO)).toBe(true);
    expect(await op('get', 'gestorE', FOTO)).toBe(true);
    expect(await op('create', 'gestorE', FOTO, img(FOTO))).toBe(true);
    expect(await op('delete', 'gestorE', FOTO)).toBe(false);
    expect(await op('get', 'inq', FOTO)).toBe(true); // lec_A.contratoId = ct_A
    expect(await op('create', 'inq', FOTO, img(FOTO))).toBe(true); // contrato activo
    expect(await op('delete', 'inq', FOTO)).toBe(false);
  });
  it('F2 · transversal denegado', async () => {
    expect(await op('get', 'propB', FOTO)).toBe(false);
    expect(await op('create', 'propB', FOTO, img(FOTO))).toBe(false);
    expect(await op('get', 'prof', FOTO)).toBe(false);
    expect(await op('get', 'anon', FOTO)).toBe(false);
    expect(await op('delete', 'admin', FOTO)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G — E.3 CONTRATOS / E.4 RECIBOS
// ---------------------------------------------------------------------------
describe('D3 Storage · G — E.3/E.4 contratos y recibos', () => {
  const DOC_CT = 'contratos/ct_A/lau.pdf';
  const REC = 'recibos/ct_A/2026-09/recibo.pdf';
  it('G1 · ámbito contrato→propietario; tenant solo lee', async () => {
    for (const p of [DOC_CT, REC]) {
      const md = pdf(p);
      expect(await op('get', 'propA', p)).toBe(true);
      expect(await op('create', 'propA', p, md)).toBe(true);
      expect(await op('delete', 'propA', p)).toBe(true);
      expect(await op('get', 'gestorE', p)).toBe(true);
      expect(await op('create', 'gestorE', p, md)).toBe(true);
      expect(await op('delete', 'gestorE', p)).toBe(false);
      expect(await op('get', 'inq', p)).toBe(true);
      expect(await op('create', 'inq', p, md)).toBe(false);
      expect(await op('delete', 'inq', p)).toBe(false);
    }
  });
  it('G2 · transversal denegado', async () => {
    for (const p of [DOC_CT, REC]) {
      expect(await op('get', 'propB', p)).toBe(false);
      expect(await op('create', 'propB', p, pdf(p))).toBe(false);
      expect(await op('get', 'prof', p)).toBe(false);
      expect(await op('get', 'anon', p)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// H — MOROSIDAD, CATCH-ALL, LISTADOS
// ---------------------------------------------------------------------------
describe('D3 Storage · H — Morosidad, catch-all y listados', () => {
  it('H1 · morosidad sigue master-only (intacto)', async () => {
    const p = 'morosidad_evidencias/prop_A/exp1/ev.pdf';
    expect(await op('get', 'master', p)).toBe(true);
    expect(await op('create', 'master', p, pdf(p))).toBe(true);
    expect(await op('get', 'propA', p)).toBe(false);
    expect(await op('get', 'admin', p)).toBe(false);
    expect(await op('update', 'master', p, pdf(p))).toBe(false);
    expect(await op('delete', 'master', p)).toBe(false);
  });
  it('H2 · catch-all: deny explícito para rutas desconocidas', async () => {
    expect(await op('get', 'master', 'ruta/desconocida/x.pdf')).toBe(false);
    expect(await op('create', 'propA', 'ruta/desconocida/x.pdf', pdf('ruta/desconocida/x.pdf'))).toBe(false);
  });
  it('H3 · listados: la API del servidor no enumera árboles privados para nadie', async () => {
    expect(await op('list', 'master', 'gastos_facturas/prop_A/g1/1699_f.pdf')).toBe(false);
    expect(await op('list', 'propA', 'gastos_facturas/prop_A/g1/1699_f.pdf')).toBe(false);
    expect(await op('list', 'admin', 'gastos_facturas/prop_A/g1/1699_f.pdf')).toBe(false);
  });
});
