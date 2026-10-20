/**
 * AG-03.2 · Autorizador documental del servidor (paridad D3 con las antiguas
 * `storage.rules`, resuelta contra la base Firestore CON NOMBRE).
 *
 * La "base" es un lector falso en memoria: cada prueba fija qué documentos
 * existen en la base con nombre y comprueba la decisión. Ninguna lectura
 * acude a `(default)` ni a ninguna otra base: el puerto recibe rutas relativas
 * (`usuarios_auth/{uid}`, `inmuebles/{id}`…) y el cliente real las resuelve
 * sobre la única base configurada (ver `googleBackend.ts`).
 */
import { describe, expect, it } from 'vitest';
import { EMAIL_MASTER } from '../titularidades/backendTitulares.js';
import {
  ContextoAutorizacion,
  DESTINOS,
  ErrorFuenteAutorizacion,
  decidirAccion,
  esRutaSegura,
  identidadAActor,
  resolverObjeto,
  validarContenido,
  type ActorDocumental,
} from './autorizacionDocumental.js';

type Base = Record<string, Record<string, unknown>>;

function puertoDe(base: Base, trazas: string[] = []) {
  return {
    async leerDocumento(ruta: string) {
      trazas.push(ruta);
      const datos = base[decodeURIComponent(ruta)];
      return datos ? { id: ruta.slice(ruta.lastIndexOf('/') + 1), datos } : null;
    },
  };
}

const actor = (uid: string, email = `${uid}@test.local`): ActorDocumental => identidadAActor({ uid, email });
const MASTER = identidadAActor({ uid: 'uid_master', email: EMAIL_MASTER });

const BASE: Base = {
  'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', usuarioId: 'usr_propA' },
  'usuarios/usr_propA': { authUid: 'uid_propA', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' },
  'usuarios_auth/uid_propB': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B', usuarioId: 'usr_propB' },
  'usuarios_auth/uid_gestorL': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: '', carterasL: ['prop_A'], carterasE: [] },
  'usuarios_auth/uid_gestorE': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: '', carterasL: [], carterasE: ['prop_A'] },
  'usuarios_auth/uid_suspendido': { tipoPerfil: 'PROPIETARIO', estado: 'SUSPENDIDO', propietarioId: 'prop_A' },
  'usuarios_auth/uid_admin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', usuarioId: 'usr_admin' },
  'usuarios/usr_admin': { authUid: 'uid_admin', estado: 'ACTIVO', tipoPerfil: 'ADMINISTRADOR' },
  'usuarios_auth/uid_falsoAdmin': { tipoPerfil: 'ADMINISTRADOR', estado: 'ACTIVO', usuarioId: 'usr_falsoAdmin' },
  'usuarios/usr_falsoAdmin': { authUid: 'uid_falsoAdmin', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO' },
  'usuarios_auth/uid_parcial': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: '', usuarioId: 'usr_parcial', carterasL: ['prop_A'], carterasE: ['prop_A'], gestionesPorPropietario: { prop_A: 'rel_1' } },
  'gestiones_cartera/rel_1': { propietarioId: 'prop_A', gestorUsuarioId: 'usr_parcial', estado: 'ACTIVA', resolucionInvitacion: 'ACEPTADA', inmuebleIds: ['inm_A'], permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR' },
  'usuarios_auth/uid_inq': { tipoPerfil: 'INQUILINO', estado: 'ACTIVO', usuarioId: 'usr_inq' },
  'usuarios/usr_inq': { authUid: 'uid_inq', estado: 'ACTIVO', tipoPerfil: 'INQUILINO', contratoIds: ['con_A'] },
  'usuarios_auth/uid_prof': { tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO', profesionalId: 'prof_1' },
  'inmuebles/inm_A': { propietarioId: 'prop_A', contratoActivoId: 'con_A' },
  'inmuebles/inm_A2': { propietarioId: 'prop_A' },
  'inmuebles/inm_B': { propietarioId: 'prop_B' },
  'contratos_formalizacion/con_A': { propietarioId: 'prop_A', inmuebleId: 'inm_A' },
  'incidencias/inc_A': { propietarioId: 'prop_A', contratoId: 'con_A', profesionalAsignadoId: 'prof_1' },
  'suministros/sum_A': { inmuebleId: 'inm_A' },
  'lecturas_suministro/lec_A': { contratoId: 'con_A' },
  'solicitudes_documentacion/sol_A': { candidatoId: 'cand_A', token: 'tok-sol-A-123456' },
  'candidatos/cand_A': { inmuebleId: 'inm_A' },
  'profesionales/prof_1': { creadoPorPropietarioId: 'prop_A' },
  'inmuebles/inm_A/documentos_patrimoniales/docpat_A': {
    id: 'docpat_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', estado: 'PENDIENTE_STORAGE',
    storagePath: 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf', nombreStorage: 'escritura.pdf',
    mimeType: 'application/pdf', tamanoBytes: 1000, sha256: 'a'.repeat(64),
  },
  'profesionales/prof_1/documentos_profesionales/docprof_1': {
    id: 'docprof_1', profesionalId: 'prof_1', estado: 'DISPONIBLE',
    storagePath: 'profesionales/prof_1/documentos/docprof_1/seguro.pdf', nombreStorage: 'seguro.pdf',
    mimeType: 'application/pdf', tamanoBytes: 500, sha256: 'b'.repeat(64),
  },
};

const PDF = { contentType: 'application/pdf', tamanoBytes: 1000 };

async function decide(quien: ActorDocumental | null, path: string, accion: 'LEER' | 'CREAR' | 'SOBRESCRIBIR' | 'BORRAR', contenido: Record<string, unknown> = PDF, base: Base = BASE, publico = false) {
  const objeto = resolverObjeto(path);
  if (!objeto) throw new Error(`ruta sin destino: ${path}`);
  return decidirAccion(new ContextoAutorizacion(quien, puertoDe(base)), objeto, accion, contenido, publico);
}

describe('rutas y destinos', () => {
  it('rechaza rutas inseguras y sin bloque (denegación por defecto)', () => {
    for (const ruta of ['', '/abs/x.pdf', 'a//b.pdf', 'a/../b.pdf', 'a/./b.pdf', 'gastos_facturas/p/g/..', 'presupuestos/p1/f.pdf', 'trabajos/t1/f.pdf', 'profesionales/prof_1/documentos/plano.pdf', 'otra_coleccion/x.pdf', 'inmuebles/inm_A/.oculto']) {
      expect(resolverObjeto(ruta), ruta).toBeNull();
    }
    expect(esRutaSegura('inmuebles/inm_A/foto_1.jpg')).toBe(true);
  });

  it('resuelve cada prefijo de la antigua matriz a su destino con sus identificadores', () => {
    const casos: Array<[string, string, Record<string, string>]> = [
      ['cobros_justificantes/prop_A/cob1/1_j.pdf', 'COBROS_JUSTIFICANTES', { propietarioId: 'prop_A', cobroPeriodoId: 'cob1' }],
      ['cobros_justificantes/cob1/1_j.pdf', 'COBROS_JUSTIFICANTES_LEGADO', { cobroPeriodoId: 'cob1' }],
      ['gastos_facturas/prop_A/g1/1_f.pdf', 'GASTOS_FACTURAS', { propietarioId: 'prop_A', gastoId: 'g1' }],
      ['documentos_solicitados/sol_A/item_1_f.pdf', 'DOCUMENTOS_SOLICITADOS', { solicitudDocId: 'sol_A' }],
      ['documentos_solicitados/sol_A/sub/f.pdf', 'DOCUMENTOS_SOLICITADOS_PROFUNDO', { solicitudDocId: 'sol_A' }],
      ['inmuebles/inm_A/foto.jpg', 'INMUEBLE_FOTO', { inmuebleId: 'inm_A' }],
      ['inmuebles/inm_A/inventario/inv1/1_f.jpg', 'INMUEBLE_INVENTARIO', { inmuebleId: 'inm_A' }],
      ['inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf', 'INMUEBLE_DOCUMENTO_PATRIMONIAL', { inmuebleId: 'inm_A', documentoId: 'docpat_A' }],
      ['profesionales/prof_1/documentos/docprof_1/seguro.pdf', 'PROFESIONAL_DOCUMENTO', { profesionalId: 'prof_1', documentoId: 'docprof_1' }],
      ['recomercializacion_fotos/prop_A/exp1/f.jpg', 'RECOMERCIALIZACION_FOTOS', { propietarioId: 'prop_A' }],
      ['incidencias_fotos/prop_A/inc_A/f.jpg', 'INCIDENCIAS_FOTOS', { propietarioId: 'prop_A' }],
      ['reformas_documentos/prop_A/pr1/f.pdf', 'REFORMAS_DOCUMENTOS', { propietarioId: 'prop_A' }],
      ['reformas_fotos/prop_A/pr1/f.jpg', 'REFORMAS_FOTOS', { propietarioId: 'prop_A' }],
      ['actas_fotos/prop_A/acta1/f.jpg', 'ACTAS_FOTOS', { propietarioId: 'prop_A' }],
      ['actas_pdfs/prop_A/acta1/acta.pdf', 'ACTAS_PDFS', { propietarioId: 'prop_A' }],
      ['incidencias/inc_A/1_f.jpg', 'INCIDENCIA_EVIDENCIA', { incidenciaId: 'inc_A' }],
      ['suministros/sum_A/lecturas/lec_A/f.jpg', 'SUMINISTRO_LECTURA', { suministroId: 'sum_A', lecturaId: 'lec_A' }],
      ['contratos/con_A/firmado.pdf', 'CONTRATO_DOCUMENTO', { contratoId: 'con_A' }],
      ['recibos/con_A/2026-01/recibo.pdf', 'RECIBO', { contratoId: 'con_A' }],
      ['morosidad_evidencias/prop_A/exp1/f.pdf', 'MOROSIDAD_EVIDENCIA', { propietarioId: 'prop_A' }],
    ];
    for (const [ruta, clave, ids] of casos) {
      const objeto = resolverObjeto(ruta);
      expect(objeto?.destino.clave, ruta).toBe(clave);
      expect(objeto?.ids, ruta).toMatchObject(ids);
    }
    expect(DESTINOS.map((d) => d.clave)).toHaveLength(20);
  });

  it('valida tipo y tamaño con los mismos límites que la regla original', () => {
    const d = (clave: string) => DESTINOS.find((x) => x.clave === clave)!;
    expect(validarContenido(d('GASTOS_FACTURAS'), 'application/pdf', 12 * 1024 * 1024 - 1).permitido).toBe(true);
    expect(validarContenido(d('GASTOS_FACTURAS'), 'application/pdf', 12 * 1024 * 1024).motivo).toBe('TAMANO_EXCEDIDO');
    expect(validarContenido(d('GASTOS_FACTURAS'), 'text/plain', 10).motivo).toBe('TIPO_NO_ADMITIDO');
    expect(validarContenido(d('INMUEBLE_FOTO'), 'application/pdf', 10).motivo).toBe('TIPO_NO_ADMITIDO');
    expect(validarContenido(d('INMUEBLE_DOCUMENTO_PATRIMONIAL'), 'image/png', 20 * 1024 * 1024).permitido).toBe(true);
    expect(validarContenido(d('INMUEBLE_DOCUMENTO_PATRIMONIAL'), 'image/gif', 10).motivo).toBe('TIPO_NO_ADMITIDO');
    expect(validarContenido(d('INCIDENCIA_EVIDENCIA'), 'image/webp', 10 * 1024 * 1024).motivo).toBe('TAMANO_EXCEDIDO');
    expect(validarContenido(d('COBROS_JUSTIFICANTES_LEGADO'), 'application/pdf', 10).motivo).toBe('DESTINO_SIN_SUBIDA');
    expect(validarContenido(d('GASTOS_FACTURAS'), 'application/pdf', 0).motivo).toBe('TAMANO_INVALIDO');
  });
});

describe('identidad: master por identidad verificada, administración por ficha veraz', () => {
  it('el master se reconoce por el correo del ID token verificado (no por lo que diga el cliente)', () => {
    expect(MASTER.esMaster).toBe(true);
    expect(actor('uid_x', 'alguien@otro.test').esMaster).toBe(false);
    expect(identidadAActor({ uid: 'u' }).esMaster).toBe(false);
  });

  it('ADMINISTRADOR veraz pasa; un espejo que se autoproclama administrador sin ficha coherente, no', async () => {
    expect((await decide(actor('uid_admin'), 'gastos_facturas/prop_B/g1/1_f.pdf', 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_falsoAdmin'), 'gastos_facturas/prop_B/g1/1_f.pdf', 'LEER')).permitido).toBe(false);
  });

  it('sin sesión todo se deniega salvo el catálogo público (sólo LEER de inmuebles/{id}/{foto})', async () => {
    expect((await decide(null, 'gastos_facturas/prop_A/g1/1_f.pdf', 'LEER')).permitido).toBe(false);
    expect((await decide(null, 'documentos_solicitados/sol_A/item_f.pdf', 'CREAR')).permitido).toBe(false);
    expect((await decide(null, 'inmuebles/inm_A/foto.jpg', 'LEER')).permitido).toBe(true);
    expect((await decide(null, 'inmuebles/inm_A/foto.jpg', 'CREAR', { contentType: 'image/jpeg', tamanoBytes: 10 })).permitido).toBe(false);
  });
});

describe('matriz D3 por propietario (titular, carteras, revocación)', () => {
  const RUTAS = ['gastos_facturas/prop_A/g1/1_f.pdf', 'cobros_justificantes/prop_A/cob1/1_j.pdf', 'actas_pdfs/prop_A/acta1/acta.pdf'];

  it('(3) el propietario opera SOLO sobre sus documentos', async () => {
    for (const ruta of RUTAS) {
      expect((await decide(actor('uid_propA'), ruta, 'LEER')).permitido, ruta).toBe(true);
      expect((await decide(actor('uid_propA'), ruta, 'CREAR')).permitido, ruta).toBe(true);
      expect((await decide(actor('uid_propA'), ruta, 'BORRAR')).permitido, ruta).toBe(true);
      const ajena = ruta.replace('prop_A', 'prop_B');
      expect((await decide(actor('uid_propA'), ajena, 'LEER')).permitido, ajena).toBe(false);
      expect((await decide(actor('uid_propA'), ajena, 'CREAR')).permitido, ajena).toBe(false);
      expect((await decide(actor('uid_propA'), ajena, 'BORRAR')).permitido, ajena).toBe(false);
    }
  });

  it('(4) gestor con cartera L lee pero no escribe; con cartera E lee y escribe pero no borra', async () => {
    const ruta = RUTAS[0];
    expect((await decide(actor('uid_gestorL'), ruta, 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_gestorL'), ruta, 'CREAR')).permitido).toBe(false);
    expect((await decide(actor('uid_gestorL'), ruta, 'BORRAR')).permitido).toBe(false);
    expect((await decide(actor('uid_gestorE'), ruta, 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_gestorE'), ruta, 'CREAR')).permitido).toBe(true);
    expect((await decide(actor('uid_gestorE'), ruta, 'BORRAR')).permitido).toBe(false);
    expect((await decide(actor('uid_gestorE'), ruta.replace('prop_A', 'prop_B'), 'LEER')).permitido).toBe(false);
  });

  it('(5) una cuenta autenticada sin espejo en la base con nombre queda denegada en todo', async () => {
    for (const ruta of RUTAS) {
      for (const accion of ['LEER', 'CREAR', 'BORRAR'] as const) {
        expect((await decide(actor('uid_desconocido'), ruta, accion)).permitido, `${accion} ${ruta}`).toBe(false);
      }
    }
  });

  it('(6) la revocación (espejo SUSPENDIDO) bloquea nuevas operaciones aunque el espejo conserve el propietario', async () => {
    for (const accion of ['LEER', 'CREAR', 'BORRAR'] as const) {
      expect((await decide(actor('uid_suspendido'), RUTAS[0], accion)).permitido, accion).toBe(false);
    }
    // La misma cuenta, reactivada en la base con nombre, vuelve a operar (se lee fresco en cada petición).
    const reactivada: Base = { ...BASE, 'usuarios_auth/uid_suspendido': { ...BASE['usuarios_auth/uid_suspendido'], estado: 'ACTIVO' } };
    expect((await decide(actor('uid_suspendido'), RUTAS[0], 'LEER', PDF, reactivada)).permitido).toBe(true);
  });

  it('(7) master y ADMINISTRADOR conservan permisos legítimos sin que eso enmascare al resto', async () => {
    for (const ruta of RUTAS) {
      expect((await decide(MASTER, ruta, 'CREAR')).permitido, ruta).toBe(true);
      expect((await decide(actor('uid_admin'), ruta, 'BORRAR')).permitido, ruta).toBe(true);
    }
    // Morosidad: sólo master, ni siquiera el titular ni el administrador por ficha.
    const mor = 'morosidad_evidencias/prop_A/exp1/f.pdf';
    expect((await decide(MASTER, mor, 'CREAR')).permitido).toBe(true);
    expect((await decide(actor('uid_propA'), mor, 'CREAR')).permitido).toBe(false);
    expect((await decide(actor('uid_admin'), mor, 'LEER')).permitido).toBe(false);
    expect((await decide(MASTER, mor, 'BORRAR')).permitido).toBe(false); // append-only
  });

  it('`sin_asignar` y el esquema heredado no admiten subida (ni para el master); lo heredado sólo lo lee administración', async () => {
    expect((await decide(MASTER, 'gastos_facturas/sin_asignar/g1/1_f.pdf', 'CREAR')).motivo).toBe('SIN_TITULAR');
    expect((await decide(actor('uid_propA'), 'gastos_facturas/sin_asignar/g1/1_f.pdf', 'CREAR')).permitido).toBe(false);
    expect((await decide(MASTER, 'gastos_facturas/sin_asignar/g1/1_f.pdf', 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_propA'), 'cobros_justificantes/cob1/1_j.pdf', 'CREAR')).permitido).toBe(false);
    expect((await decide(actor('uid_propA'), 'cobros_justificantes/cob1/1_j.pdf', 'LEER')).permitido).toBe(false);
    expect((await decide(actor('uid_admin'), 'cobros_justificantes/cob1/1_j.pdf', 'LEER')).permitido).toBe(true);
  });

  it('sobrescribir sólo en destinos que lo admiten (actas_pdfs, incidencias, suministros, contratos, recibos, inventario)', async () => {
    expect((await decide(actor('uid_propA'), 'actas_pdfs/prop_A/acta1/acta.pdf', 'SOBRESCRIBIR')).permitido).toBe(true);
    expect((await decide(actor('uid_propA'), 'gastos_facturas/prop_A/g1/1_f.pdf', 'SOBRESCRIBIR')).motivo).toBe('SOBRESCRITURA_NO_ADMITIDA');
    expect((await decide(actor('uid_propA'), 'inmuebles/inm_A/foto.jpg', 'SOBRESCRIBIR', { contentType: 'image/jpeg', tamanoBytes: 10 })).motivo).toBe('SOBRESCRITURA_NO_ADMITIDA');
  });
});

describe('derivaciones: inmueble, contrato, incidencia, suministro, solicitud, parcial vigente', () => {
  it('inmueble → propietario: fotos, inventario; identificadores manipulados caen fuera del ámbito', async () => {
    const img = { contentType: 'image/jpeg', tamanoBytes: 10 };
    expect((await decide(actor('uid_propA'), 'inmuebles/inm_A/foto.jpg', 'CREAR', img)).permitido).toBe(true);
    expect((await decide(actor('uid_propA'), 'inmuebles/inm_B/foto.jpg', 'CREAR', img)).permitido).toBe(false);
    expect((await decide(actor('uid_propA'), 'inmuebles/inm_inexistente/foto.jpg', 'CREAR', img)).permitido).toBe(false);
    expect((await decide(actor('uid_gestorL'), 'inmuebles/inm_A/inventario/i1/f.jpg', 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_gestorL'), 'inmuebles/inm_A/inventario/i1/f.jpg', 'CREAR', img)).permitido).toBe(false);
    expect((await decide(actor('uid_propB'), 'inmuebles/inm_A/inventario/i1/f.jpg', 'LEER')).permitido).toBe(false);
  });

  it('delegación parcial vigente: sólo los inmuebles enumerados y escritura sólo con LECTURA_ESCRITURA + responsable GESTOR', async () => {
    const img = { contentType: 'image/jpeg', tamanoBytes: 10 };
    expect((await decide(actor('uid_parcial'), 'inmuebles/inm_A/foto.jpg', 'CREAR', img)).permitido).toBe(true);
    expect((await decide(actor('uid_parcial'), 'inmuebles/inm_A2/foto.jpg', 'CREAR', img)).permitido).toBe(false);
    const soloLectura: Base = { ...BASE, 'gestiones_cartera/rel_1': { ...BASE['gestiones_cartera/rel_1'], permiso: 'LECTURA' } };
    expect((await decide(actor('uid_parcial'), 'inmuebles/inm_A/inventario/i1/f.jpg', 'LEER', PDF, soloLectura)).permitido).toBe(true);
    expect((await decide(actor('uid_parcial'), 'inmuebles/inm_A/foto.jpg', 'CREAR', img, soloLectura)).permitido).toBe(false);
    // Con relación indexada, la cartera completa del espejo NO aplica a documentos por propietario.
    expect((await decide(actor('uid_parcial'), 'gastos_facturas/prop_A/g1/1_f.pdf', 'LEER')).permitido).toBe(false);
  });

  it('contratos/recibos: titular y parcial vigente; inquilino sólo lee los de SU contrato', async () => {
    expect((await decide(actor('uid_propA'), 'contratos/con_A/firmado.pdf', 'CREAR')).permitido).toBe(true);
    expect((await decide(actor('uid_propB'), 'contratos/con_A/firmado.pdf', 'LEER')).permitido).toBe(false);
    expect((await decide(actor('uid_inq'), 'contratos/con_A/firmado.pdf', 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_inq'), 'contratos/con_A/firmado.pdf', 'CREAR')).permitido).toBe(false);
    expect((await decide(actor('uid_inq'), 'recibos/con_A/2026-01/r.pdf', 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_inq'), 'recibos/con_Z/2026-01/r.pdf', 'LEER')).permitido).toBe(false);
    expect((await decide(actor('uid_parcial'), 'recibos/con_A/2026-01/r.pdf', 'CREAR')).permitido).toBe(true);
  });

  it('incidencias: titular, profesional asignado (lee y aporta, no borra) e inquilino del contrato (lee y aporta)', async () => {
    const img = { contentType: 'image/jpeg', tamanoBytes: 10 };
    expect((await decide(actor('uid_propA'), 'incidencias/inc_A/f.jpg', 'BORRAR')).permitido).toBe(true);
    expect((await decide(actor('uid_prof'), 'incidencias/inc_A/f.jpg', 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_prof'), 'incidencias/inc_A/f.jpg', 'CREAR', img)).permitido).toBe(true);
    expect((await decide(actor('uid_prof'), 'incidencias/inc_A/f.jpg', 'BORRAR')).permitido).toBe(false);
    expect((await decide(actor('uid_inq'), 'incidencias/inc_A/f.jpg', 'CREAR', img)).permitido).toBe(true);
    expect((await decide(actor('uid_inq'), 'incidencias/inc_A/f.jpg', 'BORRAR')).permitido).toBe(false);
    expect((await decide(actor('uid_propB'), 'incidencias/inc_A/f.jpg', 'LEER')).permitido).toBe(false);
  });

  it('suministros: por inmueble; el inquilino lee y aporta lecturas de su contrato', async () => {
    const img = { contentType: 'image/jpeg', tamanoBytes: 10 };
    expect((await decide(actor('uid_propA'), 'suministros/sum_A/lecturas/lec_A/f.jpg', 'CREAR', img)).permitido).toBe(true);
    expect((await decide(actor('uid_inq'), 'suministros/sum_A/lecturas/lec_A/f.jpg', 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_inq'), 'suministros/sum_A/lecturas/lec_A/f.jpg', 'CREAR', img)).permitido).toBe(true);
    expect((await decide(actor('uid_inq'), 'suministros/sum_A/lecturas/lec_A/f.jpg', 'BORRAR')).permitido).toBe(false);
    expect((await decide(actor('uid_propB'), 'suministros/sum_A/lecturas/lec_A/f.jpg', 'LEER')).permitido).toBe(false);
  });

  it('documentos solicitados: solicitud → candidato → inmueble → propietario; el portal sólo CREA con token verificado por el servicio', async () => {
    const ruta = 'documentos_solicitados/sol_A/item_1_f.pdf';
    expect((await decide(actor('uid_propA'), ruta, 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_gestorL'), ruta, 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_propB'), ruta, 'LEER')).permitido).toBe(false);
    expect((await decide(null, ruta, 'CREAR', PDF, BASE, true)).permitido).toBe(true);
    expect((await decide(null, ruta, 'LEER', PDF, BASE, true)).permitido).toBe(false);
    expect((await decide(null, ruta, 'BORRAR', PDF, BASE, true)).permitido).toBe(false);
    expect((await decide(null, 'documentos_solicitados/sol_A/sub/f.pdf', 'CREAR', PDF, BASE, true)).permitido).toBe(false);
  });
});

describe('P3/P5: estados de los metadatos canónicos', () => {
  const ruta = 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf';
  const contenido = { contentType: 'application/pdf', tamanoBytes: 1000, customMetadata: { documentoId: 'docpat_A', inmuebleId: 'inm_A', sha256: 'a'.repeat(64) } };

  it('crear exige PENDIENTE_STORAGE y coherencia (tamaño, MIME, huella, identificadores)', async () => {
    expect((await decide(actor('uid_propA'), ruta, 'CREAR', contenido)).permitido).toBe(true);
    expect((await decide(actor('uid_propA'), ruta, 'CREAR', { ...contenido, tamanoBytes: 999 })).motivo).toBe('TAMANO_DISCREPANTE');
    expect((await decide(actor('uid_propA'), ruta, 'CREAR', { ...contenido, customMetadata: { ...contenido.customMetadata, sha256: 'c'.repeat(64) } })).motivo).toBe('HUELLA_DISCREPANTE');
    expect((await decide(actor('uid_propA'), ruta, 'CREAR', { ...contenido, customMetadata: { ...contenido.customMetadata, documentoId: 'otro' } })).motivo).toBe('METADATO_DOCUMENTOID_DISCREPANTE');
    expect((await decide(actor('uid_propB'), ruta, 'CREAR', contenido)).permitido).toBe(false);
    expect((await decide(actor('uid_gestorE'), ruta, 'CREAR', contenido)).permitido).toBe(true);
  });

  it('leer exige DISPONIBLE; borrar exige PENDIENTE_ELIMINACION; sin metadato coherente no hay nada', async () => {
    expect((await decide(actor('uid_propA'), ruta, 'LEER')).permitido).toBe(false);
    const disponible: Base = { ...BASE, [`inmuebles/inm_A/documentos_patrimoniales/docpat_A`]: { ...BASE['inmuebles/inm_A/documentos_patrimoniales/docpat_A'], estado: 'DISPONIBLE' } };
    expect((await decide(actor('uid_propA'), ruta, 'LEER', PDF, disponible)).permitido).toBe(true);
    expect((await decide(actor('uid_propA'), ruta, 'BORRAR', PDF, disponible)).permitido).toBe(false);
    const eliminando: Base = { ...BASE, [`inmuebles/inm_A/documentos_patrimoniales/docpat_A`]: { ...BASE['inmuebles/inm_A/documentos_patrimoniales/docpat_A'], estado: 'PENDIENTE_ELIMINACION' } };
    expect((await decide(actor('uid_propA'), ruta, 'BORRAR', PDF, eliminando)).permitido).toBe(true);
    expect((await decide(actor('uid_propA'), 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/otro.pdf', 'LEER', PDF, disponible)).motivo).toBe('METADATA_INCOHERENTE');
  });

  it('documentos profesionales: el propio profesional lee/aporta; el propietario creador según cartera; metadato coherente obligatorio', async () => {
    const rutaProf = 'profesionales/prof_1/documentos/docprof_1/seguro.pdf';
    expect((await decide(actor('uid_prof'), rutaProf, 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_propA'), rutaProf, 'LEER')).permitido).toBe(true);
    expect((await decide(actor('uid_propB'), rutaProf, 'LEER')).permitido).toBe(false);
    expect((await decide(actor('uid_prof'), rutaProf, 'BORRAR')).permitido).toBe(false);
  });
});

describe('fuente no disponible y registro de lecturas', () => {
  it('un fallo de transporte NO se convierte en denegación silenciosa ni en permiso: se propaga como ErrorFuenteAutorizacion', async () => {
    const puerto = { leerDocumento: async () => { throw new Error('red caída'); } };
    const objeto = resolverObjeto('gastos_facturas/prop_A/g1/1_f.pdf')!;
    await expect(decidirAccion(new ContextoAutorizacion(actor('uid_propA'), puerto), objeto, 'LEER')).rejects.toBeInstanceOf(ErrorFuenteAutorizacion);
  });

  it('todas las lecturas son rutas relativas de la base con nombre (ninguna menciona otra base) y se memorizan por petición', async () => {
    const trazas: string[] = [];
    const ctx = new ContextoAutorizacion(actor('uid_gestorE'), puertoDe(BASE, trazas));
    const objeto = resolverObjeto('inmuebles/inm_A/inventario/i1/f.jpg')!;
    await decidirAccion(ctx, objeto, 'LEER');
    await decidirAccion(ctx, objeto, 'CREAR', { contentType: 'image/jpeg', tamanoBytes: 10 });
    expect(trazas.length).toBeGreaterThan(0);
    expect(new Set(trazas).size).toBe(trazas.length);
    for (const ruta of trazas) expect(ruta).not.toMatch(/databases|\(default\)|^\//);
  });
});
