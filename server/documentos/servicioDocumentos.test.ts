/**
 * AG-03.2 · Servicio y rutas HTTP de custodia documental.
 *
 * Dobles: la base Firestore CON NOMBRE es un lector en memoria; Cloud Storage
 * es un almacén en memoria con la misma superficie que `ClienteGoogleStorageRest`
 * (metadatos, sesión reanudable, borrado, parche de metadatos, URL con token).
 * Se prueba el contrato completo: autorización en cada entrada, validación de
 * tipo/tamaño/destino, idempotencia del reintento, retirada del objeto cuando
 * no respeta el destino, revocación entre inicio y confirmación, token de la
 * solicitud pública, ausencia de respaldo en memoria y registro sin datos sensibles.
 */
import express from 'express';
import { createServer, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_MASTER } from '../titularidades/backendTitulares.js';
import { ErrorAlmacenGoogleStorage, type MetadatosObjetoStorage, type PeticionSesionResumable } from '../cobros/almacenGoogleStorage.js';
import { crearServicioDocumentos, ErrorDocumental, META_ORIGEN, META_TOKENS, META_UID, type EventoCustodia, type ServicioDocumentos } from './servicioDocumentos.js';
import { montarRutasDocumentos } from './rutasDocumentos.js';

type Base = Record<string, Record<string, unknown>>;

const BASE: Base = {
  'usuarios_auth/uid_propA': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_A', usuarioId: 'usr_propA' },
  'usuarios_auth/uid_propB': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: 'prop_B' },
  'usuarios_auth/uid_gestorE': { tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO', propietarioId: '', carterasL: [], carterasE: ['prop_A'] },
  'inmuebles/inm_A': { propietarioId: 'prop_A' },
  'solicitudes_documentacion/sol_A': { candidatoId: 'cand_A', token: 'tok-sol-A-123456' },
  'candidatos/cand_A': { inmuebleId: 'inm_A' },
  'inmuebles/inm_A/documentos_patrimoniales/docpat_A': {
    id: 'docpat_A', inmuebleId: 'inm_A', propietarioId: 'prop_A', estado: 'PENDIENTE_STORAGE',
    storagePath: 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf', nombreStorage: 'escritura.pdf',
    mimeType: 'application/pdf', tamanoBytes: 1000, sha256: 'a'.repeat(64),
  },
};

function puertoDe(base: Base) {
  return {
    async leerDocumento(ruta: string) {
      const datos = base[decodeURIComponent(ruta)];
      return datos ? { id: ruta.slice(ruta.lastIndexOf('/') + 1), datos } : null;
    },
    async consultarIgualdadesOrden(coleccion: string, consulta: { igualdades?: Array<[string, string]>; limite: number }) {
      return Object.entries(base)
        .filter(([ruta]) => ruta.startsWith(`${coleccion}/`) && ruta.split('/').length === 2)
        .filter(([, datos]) => (consulta.igualdades || []).every(([campo, valor]) => datos[campo] === valor))
        .slice(0, consulta.limite)
        .map(([ruta, datos]) => ({ id: ruta.slice(ruta.lastIndexOf('/') + 1), datos }));
    },
  };
}

/** Cloud Storage en memoria con la superficie usada por el servicio. */
function almacenFalso() {
  const objetos = new Map<string, MetadatosObjetoStorage>();
  const sesiones: PeticionSesionResumable[] = [];
  let generacion = 1;
  const api = {
    objetos,
    sesiones,
    caido: false,
    /** Simula el `PUT` del navegador a la sesión: materializa el objeto. */
    completar(path: string, size: number, contentType?: string, metadataExtra: Record<string, string> = {}) {
      const sesion = [...sesiones].reverse().find((s) => s.path === path);
      if (!sesion) throw new Error('sin sesión para ' + path);
      objetos.set(path, {
        name: path, bucket: 'bucket-test', generation: String(generacion++), size,
        contentType: contentType || sesion.contentType, md5Hash: 'md5', timeCreated: '2026-10-20T10:00:00Z',
        metadata: { ...sesion.metadata, ...metadataExtra },
      });
    },
    async metadatos(path: string) {
      if (api.caido) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
      return objetos.get(path) || null;
    },
    async iniciarSesionResumable(peticion: PeticionSesionResumable) {
      if (api.caido) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
      if (peticion.soloSiNoExiste && objetos.has(peticion.path)) return 'YA_EXISTE' as const;
      sesiones.push(peticion);
      return { sesionUri: `https://storage.googleapis.com/upload/storage/v1/b/bucket-test/o?upload_id=${sesiones.length}` };
    },
    async borrar(path: string) {
      if (api.caido) throw new ErrorAlmacenGoogleStorage('STORAGE_NO_DISPONIBLE');
      return objetos.delete(path) ? 'BORRADO' as const : 'NO_EXISTE' as const;
    },
    async parchearMetadatos(path: string, metadata: Record<string, string | null>) {
      const actual = objetos.get(path);
      if (!actual) throw new ErrorAlmacenGoogleStorage('STORAGE_PRECONDICION');
      const nuevo = { ...actual.metadata };
      for (const [k, v] of Object.entries(metadata)) { if (v === null) delete nuevo[k]; else nuevo[k] = v; }
      const parcheado = { ...actual, metadata: nuevo };
      objetos.set(path, parcheado);
      return parcheado;
    },
    urlDescargaConToken(path: string, token: string) {
      return `https://firebasestorage.googleapis.com/v0/b/bucket-test/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    },
  };
  return api;
}

function montar(base: Base = BASE) {
  const almacen = almacenFalso();
  const eventos: EventoCustodia[] = [];
  let contador = 0;
  const servicio = crearServicioDocumentos({
    puerto: puertoDe(base),
    almacen,
    auditar: (e) => eventos.push(e),
    generarToken: () => `token-${++contador}`,
  });
  return { servicio, almacen, eventos };
}

const PROP_A = { uid: 'uid_propA', email: 'a@test.local' };
const PROP_B = { uid: 'uid_propB', email: 'b@test.local' };
const GESTOR_E = { uid: 'uid_gestorE', email: 'g@test.local' };
const MASTER = { uid: 'uid_master', email: EMAIL_MASTER };
const DESCONOCIDO = { uid: 'uid_nadie', email: 'nadie@test.local' };
const RUTA = 'gastos_facturas/prop_A/g1/1699_factura.pdf';
const PDF = { contentType: 'application/pdf', tamanoBytes: 1000 };

async function fallo(p: Promise<unknown>): Promise<ErrorDocumental> {
  try { await p; } catch (error) { if (error instanceof ErrorDocumental) return error; throw error; }
  throw new Error('se esperaba ErrorDocumental');
}

describe('subida: inicio → bytes directos → confirmación', () => {
  it('(8) el titular abre sesión con nombre/tipo/metadatos fijados por el servidor y confirma con el objeto real', async () => {
    const { servicio, almacen, eventos } = montar();
    const inicio = await servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF, origen: 'https://app.example', customMetadata: { origenCliente: 'gastos' } });
    expect(inicio.estado).toBe('SESION');
    const sesion = almacen.sesiones[0];
    expect(sesion.path).toBe(RUTA);
    expect(sesion.origen).toBe('https://app.example');
    expect(sesion.soloSiNoExiste).toBe(true);
    expect(sesion.metadata[META_ORIGEN]).toBeTruthy();
    expect(sesion.metadata[META_UID]).toBe('uid_propA');
    expect(sesion.metadata[META_TOKENS]).toBe('token-1');
    expect(sesion.metadata.origenCliente).toBe('gastos');

    almacen.completar(RUTA, 1000);
    const confirmacion = await servicio.confirmarSubida({ identidad: PROP_A, storagePath: RUTA });
    expect(confirmacion.metadatos).toMatchObject({ storagePath: RUTA, tamanoBytes: 1000, contentType: 'application/pdf' });
    expect(confirmacion.metadatos.customMetadata).not.toHaveProperty(META_TOKENS);
    expect(confirmacion.url).toContain('token=token-1');
    expect(eventos.map((e) => `${e.operacion}:${e.resultado}`)).toEqual(['INICIAR_SUBIDA:OK', 'CONFIRMAR_SUBIDA:OK']);
    for (const e of eventos) {
      expect(e.carpeta).toBe('gastos_facturas/prop_A/g1');
      expect(JSON.stringify(e)).not.toContain('1699_factura.pdf');
      expect(JSON.stringify(e)).not.toContain('@');
    }
  });

  it('(3)(5) otro propietario, un gestor sin cartera o una cuenta sin espejo no abren sesión; el error es explícito', async () => {
    const { servicio, almacen } = montar();
    expect((await fallo(servicio.iniciarSubida({ identidad: PROP_B, storagePath: RUTA, ...PDF }))).codigo).toBe('SIN_PERMISO');
    expect((await fallo(servicio.iniciarSubida({ identidad: DESCONOCIDO, storagePath: RUTA, ...PDF }))).codigo).toBe('SIN_PERMISO');
    expect((await fallo(servicio.iniciarSubida({ identidad: null, storagePath: RUTA, ...PDF }))).codigo).toBe('NO_AUTENTICADO');
    expect(almacen.sesiones).toHaveLength(0);
  });

  it('(4) el gestor con cartera E sube en la carpeta del titular; (7) el master también', async () => {
    const { servicio } = montar();
    expect((await servicio.iniciarSubida({ identidad: GESTOR_E, storagePath: RUTA, ...PDF })).estado).toBe('SESION');
    expect((await servicio.iniciarSubida({ identidad: MASTER, storagePath: 'gastos_facturas/prop_B/g9/f.pdf', ...PDF })).estado).toBe('SESION');
  });

  it('(9) tipo y tamaño se validan contra el destino ANTES de abrir sesión (413/400); las rutas manipuladas se rechazan', async () => {
    const { servicio, almacen } = montar();
    const grande = await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, contentType: 'application/pdf', tamanoBytes: 12 * 1024 * 1024 }));
    expect(grande.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
    expect(grande.status).toBe(413);
    expect((await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, contentType: 'text/html', tamanoBytes: 10 }))).codigo).toBe('ARCHIVO_INVALIDO');
    expect((await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, contentType: 'application/pdf', tamanoBytes: 0 }))).codigo).toBe('ARCHIVO_INVALIDO');
    expect((await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: 'gastos_facturas/prop_A/../prop_B/g1/f.pdf', ...PDF }))).codigo).toBe('RUTA_NO_ADMITIDA');
    expect((await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: 'presupuestos/p1/f.pdf', ...PDF }))).codigo).toBe('RUTA_NO_ADMITIDA');
    expect((await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF, customMetadata: { [META_UID]: 'uid_master' } }))).codigo).toBe('PETICION_INVALIDA');
    expect(almacen.sesiones).toHaveLength(0);
  });

  it('(10) confirmar sin objeto no es éxito; un objeto que no respeta el destino se retira y se informa error', async () => {
    const { servicio, almacen } = montar();
    await servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF });
    const sinObjeto = await fallo(servicio.confirmarSubida({ identidad: PROP_A, storagePath: RUTA }));
    expect(sinObjeto.codigo).toBe('OBJETO_INCOMPLETO');

    // El navegador envió 13 MB en vez de los 1000 bytes declarados.
    almacen.completar(RUTA, 13 * 1024 * 1024);
    const excedido = await fallo(servicio.confirmarSubida({ identidad: PROP_A, storagePath: RUTA }));
    expect(excedido.codigo).toBe('ARCHIVO_DEMASIADO_GRANDE');
    expect(almacen.objetos.has(RUTA)).toBe(false);

    // Tipo real distinto del admitido.
    await servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF });
    almacen.completar(RUTA, 1000, 'text/html');
    expect((await fallo(servicio.confirmarSubida({ identidad: PROP_A, storagePath: RUTA }))).codigo).toBe('ARCHIVO_INVALIDO');
    expect(almacen.objetos.has(RUTA)).toBe(false);
  });

  it('(6) la revocación entre inicio y confirmación deniega y retira el objeto recién subido', async () => {
    const base: Base = JSON.parse(JSON.stringify(BASE));
    const { servicio, almacen } = montar(base);
    await servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF });
    almacen.completar(RUTA, 1000);
    base['usuarios_auth/uid_propA'] = { ...base['usuarios_auth/uid_propA'], estado: 'SUSPENDIDO' };
    expect((await fallo(servicio.confirmarSubida({ identidad: PROP_A, storagePath: RUTA }))).codigo).toBe('SIN_PERMISO');
    expect(almacen.objetos.has(RUTA)).toBe(false);
  });

  it('confirmar NO borra objetos ajenos: la confirmación no es una vía de borrado', async () => {
    const { servicio, almacen } = montar();
    await servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF });
    almacen.completar(RUTA, 1000);
    await servicio.confirmarSubida({ identidad: PROP_A, storagePath: RUTA });
    // El gestor E tiene ámbito de escritura pero no subió este objeto.
    expect((await fallo(servicio.confirmarSubida({ identidad: GESTOR_E, storagePath: RUTA }))).motivo).toBe('OBJETO_AJENO');
    expect(almacen.objetos.has(RUTA)).toBe(true);
    // Un objeto heredado (sin marca del servidor) tampoco se toca.
    almacen.objetos.set('gastos_facturas/prop_A/g2/legado.pdf', { name: 'gastos_facturas/prop_A/g2/legado.pdf', bucket: 'b', generation: '1', size: 10, contentType: 'application/pdf', metadata: {} });
    expect((await fallo(servicio.confirmarSubida({ identidad: PROP_A, storagePath: 'gastos_facturas/prop_A/g2/legado.pdf' }))).motivo).toBe('OBJETO_AJENO');
    expect(almacen.objetos.has('gastos_facturas/prop_A/g2/legado.pdf')).toBe(true);
    // Sin ámbito, ni siquiera se llega a mirar la marca.
    expect((await fallo(servicio.confirmarSubida({ identidad: PROP_B, storagePath: RUTA }))).codigo).toBe('SIN_PERMISO');
    expect(almacen.objetos.has(RUTA)).toBe(true);
  });

  it('(10) reintento tras subida completada: el MISMO contenido se reconoce (YA_EXISTE) sin re-subir; otro contenido no pisa el objeto', async () => {
    const { servicio, almacen } = montar();
    const ruta = 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf';
    const meta = { documentoId: 'docpat_A', inmuebleId: 'inm_A', sha256: 'a'.repeat(64) };
    await servicio.iniciarSubida({ identidad: PROP_A, storagePath: ruta, ...PDF, customMetadata: meta });
    almacen.completar(ruta, 1000);
    const repetido = await servicio.iniciarSubida({ identidad: PROP_A, storagePath: ruta, ...PDF, customMetadata: meta });
    expect(repetido.estado).toBe('YA_EXISTE');
    expect(almacen.sesiones).toHaveLength(1);
    if (repetido.estado === 'YA_EXISTE') expect(repetido.url).toBeUndefined(); // P5: sin URL persistente

    const distinto = await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: ruta, ...PDF, customMetadata: { ...meta, sha256: 'c'.repeat(64) } }));
    expect(['OBJETO_EXISTENTE', 'SIN_PERMISO']).toContain(distinto.codigo);
    expect(almacen.sesiones).toHaveLength(1);

    const gastos = await servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF, customMetadata: { sha256: 'd'.repeat(64) } });
    expect(gastos.estado).toBe('SESION');
    almacen.completar(RUTA, 1000);
    const otraVez = await servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF, customMetadata: { sha256: 'd'.repeat(64) } });
    expect(otraVez.estado).toBe('YA_EXISTE');
    if (otraVez.estado === 'YA_EXISTE') expect(otraVez.url).toContain('token=');
    expect((await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF }))).codigo).toBe('OBJETO_EXISTENTE');
  });

  it('destinos sobrescribibles (actas_pdfs) re-suben el mismo nombre sin `ifGenerationMatch=0`', async () => {
    const { servicio, almacen } = montar();
    const ruta = 'actas_pdfs/prop_A/acta1/acta.pdf';
    await servicio.iniciarSubida({ identidad: PROP_A, storagePath: ruta, ...PDF });
    almacen.completar(ruta, 1000);
    const segunda = await servicio.iniciarSubida({ identidad: PROP_A, storagePath: ruta, contentType: 'application/pdf', tamanoBytes: 2000 });
    expect(segunda.estado).toBe('SESION');
    expect(almacen.sesiones[1].soloSiNoExiste).toBe(false);
  });

  it('(10) sin Storage o sin Firestore no hay respaldo: 503 y ninguna sesión', async () => {
    const { servicio, almacen } = montar();
    almacen.caido = true;
    const e = await fallo(servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF }));
    expect(e.codigo).toBe('ALMACEN_NO_DISPONIBLE');
    expect(e.status).toBe(503);
    const sinFuente = crearServicioDocumentos({
      puerto: { leerDocumento: async () => { throw new Error('firestore caído'); }, consultarIgualdadesOrden: async () => { throw new Error('firestore caído'); } },
      almacen: almacenFalso(),
      auditar: () => undefined,
    });
    const f = await fallo(sinFuente.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF }));
    expect(f.codigo).toBe('FUENTE_NO_DISPONIBLE');
    expect(f.status).toBe(503);
  });
});

describe('acceso y borrado', () => {
  async function conObjeto(ruta = RUTA, identidad = PROP_A) {
    const m = montar();
    await m.servicio.iniciarSubida({ identidad, storagePath: ruta, ...PDF });
    m.almacen.completar(ruta, 1000);
    await m.servicio.confirmarSubida({ identidad, storagePath: ruta });
    return m;
  }

  it('(8) lectura: titular y cartera L/E reciben la URL con token; otros no; el token no se re-emite en destinos ordinarios', async () => {
    const { servicio } = await conObjeto();
    const a = await servicio.acceso({ identidad: PROP_A, storagePath: RUTA });
    expect(a.url).toContain('token=token-1');
    const g = await servicio.acceso({ identidad: GESTOR_E, storagePath: RUTA });
    expect(g.url).toBe(a.url);
    expect((await fallo(servicio.acceso({ identidad: PROP_B, storagePath: RUTA }))).codigo).toBe('SIN_PERMISO');
    expect((await fallo(servicio.acceso({ identidad: PROP_A, storagePath: 'gastos_facturas/prop_A/g1/no_existe.pdf' }))).codigo).toBe('OBJETO_NO_ENCONTRADO');
  });

  it('P3/P5: la URL se rota en cada lectura autorizada conservando sólo el token anterior', async () => {
    const base: Base = JSON.parse(JSON.stringify(BASE));
    const { servicio, almacen } = montar(base);
    const ruta = 'inmuebles/inm_A/documentos_patrimoniales/docpat_A/escritura.pdf';
    const meta = { documentoId: 'docpat_A', inmuebleId: 'inm_A', sha256: 'a'.repeat(64) };
    await servicio.iniciarSubida({ identidad: PROP_A, storagePath: ruta, ...PDF, customMetadata: meta });
    almacen.completar(ruta, 1000);
    const conf = await servicio.confirmarSubida({ identidad: PROP_A, storagePath: ruta });
    expect(conf.url).toBeUndefined();
    // Antes de DISPONIBLE no hay lectura (paridad P3).
    expect((await fallo(servicio.acceso({ identidad: PROP_A, storagePath: ruta }))).codigo).toBe('SIN_PERMISO');
    base['inmuebles/inm_A/documentos_patrimoniales/docpat_A'].estado = 'DISPONIBLE';
    const a1 = await servicio.acceso({ identidad: PROP_A, storagePath: ruta });
    const a2 = await servicio.acceso({ identidad: PROP_A, storagePath: ruta });
    const a3 = await servicio.acceso({ identidad: PROP_A, storagePath: ruta });
    expect(a1.url).not.toBe(a2.url);
    const tokens = almacen.objetos.get(ruta)!.metadata[META_TOKENS].split(',');
    expect(tokens).toHaveLength(2);
    expect(a3.url).toContain(`token=${tokens[0]}`);
    expect(a2.url).toContain(`token=${tokens[1]}`);
    expect(a1.url.includes(tokens[0]) || a1.url.includes(tokens[1])).toBe(false);
  });

  it('(8) borrado: titular y master sí; cartera E, otro titular o sin sesión no; inexistente ⇒ NO_EXISTE', async () => {
    const { servicio, almacen } = await conObjeto();
    expect((await fallo(servicio.borrar({ identidad: GESTOR_E, storagePath: RUTA }))).codigo).toBe('SIN_PERMISO');
    expect((await fallo(servicio.borrar({ identidad: PROP_B, storagePath: RUTA }))).codigo).toBe('SIN_PERMISO');
    expect(almacen.objetos.has(RUTA)).toBe(true);
    expect((await servicio.borrar({ identidad: PROP_A, storagePath: RUTA })).estado).toBe('BORRADO');
    expect((await servicio.borrar({ identidad: MASTER, storagePath: RUTA })).estado).toBe('NO_EXISTE');
  });
});

describe('portal público de candidatos (token de la solicitud en la base con nombre)', () => {
  const ruta = 'documentos_solicitados/sol_A/item1_1699_nomina.pdf';

  it('con el token correcto sólo CREA en la ruta plana de SU solicitud; nunca lee ni borra', async () => {
    const { servicio, almacen } = montar();
    const inicio = await servicio.iniciarSubida({ identidad: null, publico: { solicitudDocId: 'sol_A', token: 'tok-sol-A-123456' }, storagePath: ruta, ...PDF });
    expect(inicio.estado).toBe('SESION');
    expect(almacen.sesiones[0].metadata[META_UID]).toBe('portal-publico');
    almacen.completar(ruta, 1000);
    const conf = await servicio.confirmarSubida({ identidad: null, publico: { solicitudDocId: 'sol_A', token: 'tok-sol-A-123456' }, storagePath: ruta });
    expect(conf.url).toContain('token=');
    // Mismo token, otra solicitud o ruta profunda: denegado.
    expect((await fallo(servicio.iniciarSubida({ identidad: null, publico: { solicitudDocId: 'sol_B', token: 'tok-sol-A-123456' }, storagePath: 'documentos_solicitados/sol_B/f.pdf', ...PDF }))).codigo).toBe('SOLICITUD_NO_VALIDA');
    expect((await fallo(servicio.iniciarSubida({ identidad: null, publico: { solicitudDocId: 'sol_A', token: 'tok-sol-A-123456' }, storagePath: 'documentos_solicitados/sol_A/sub/f.pdf', ...PDF }))).codigo).toBe('SIN_PERMISO');
    expect((await fallo(servicio.iniciarSubida({ identidad: null, publico: { solicitudDocId: 'sol_A', token: 'tok-sol-A-123456' }, storagePath: RUTA, ...PDF }))).codigo).toBe('SIN_PERMISO');
    expect((await fallo(servicio.acceso({ identidad: null as never, storagePath: ruta }))).codigo).toBe('NO_AUTENTICADO');
  });

  it('token incorrecto, ausente o de otra solicitud ⇒ SOLICITUD_NO_VALIDA sin tocar Storage', async () => {
    const { servicio, almacen } = montar();
    for (const token of ['tok-sol-A-XXXXXX', '', 'corto']) {
      expect((await fallo(servicio.iniciarSubida({ identidad: null, publico: { solicitudDocId: 'sol_A', token }, storagePath: ruta, ...PDF }))).codigo).toBe('SOLICITUD_NO_VALIDA');
    }
    expect(almacen.sesiones).toHaveLength(0);
  });

  it('el identificador `sol-{token}` que construye el portal sin id se resuelve por el token real', async () => {
    const { servicio } = montar();
    const r = await servicio.iniciarSubida({ identidad: null, publico: { solicitudDocId: 'sol-tok-sol-A-123456', token: 'tok-sol-A-123456' }, storagePath: 'documentos_solicitados/sol-tok-sol-A-123456/item1_f.pdf', ...PDF });
    expect(r.estado).toBe('SESION');
  });
});

// ---------------------------------------------------------------------------
// Rutas HTTP
// ---------------------------------------------------------------------------

const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function baseLocal(app: express.Express): Promise<string> {
  const server = createServer(app);
  servidores.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor sintético');
  return `http://127.0.0.1:${address.port}`;
}

function appCon(servicio: ServicioDocumentos | null) {
  const app = express();
  app.use(express.json());
  montarRutasDocumentos(app, {
    servicio,
    verificarToken: async (token) => (token === 'token-propA' ? PROP_A : token === 'token-propB' ? PROP_B : null),
  });
  return app;
}

async function post(base: string, ruta: string, body: unknown, token?: string) {
  const r = await fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: 'https://app.example' },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json() as Record<string, unknown> };
}

describe('rutas /api/documentos/*', () => {
  it('sin servicio (Firestore/Storage no configurados) responde 503 en todas las rutas: nunca memoria', async () => {
    const base = await baseLocal(appCon(null));
    for (const ruta of ['/api/documentos/subidas', '/api/documentos/subidas/confirmar', '/api/documentos/acceso', '/api/documentos/borrar', '/api/documentos/publico/subidas', '/api/documentos/publico/subidas/confirmar']) {
      const r = await post(base, ruta, { storagePath: RUTA }, 'token-propA');
      expect(r.status, ruta).toBe(503);
      expect(r.json.codigo).toBe('CUSTODIA_NO_DISPONIBLE');
    }
  });

  it('exige sesión verificada (401), rechaza campos no previstos (400) y propaga el Origin a la sesión', async () => {
    const { servicio, almacen } = montar();
    const base = await baseLocal(appCon(servicio));
    expect((await post(base, '/api/documentos/subidas', { storagePath: RUTA, ...PDF })).status).toBe(401);
    expect((await post(base, '/api/documentos/subidas', { storagePath: RUTA, ...PDF }, 'token-falso')).status).toBe(401);
    const conUid = await post(base, '/api/documentos/subidas', { storagePath: RUTA, ...PDF, uid: 'uid_master' }, 'token-propB');
    expect(conUid.status).toBe(400);
    const denegado = await post(base, '/api/documentos/subidas', { storagePath: RUTA, ...PDF }, 'token-propB');
    expect(denegado.status).toBe(403);
    expect(denegado.json.codigo).toBe('SIN_PERMISO');
    const ok = await post(base, '/api/documentos/subidas', { storagePath: RUTA, ...PDF }, 'token-propA');
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ ok: true, estado: 'SESION', storagePath: RUTA });
    expect(almacen.sesiones[0].origen).toBe('https://app.example');

    almacen.completar(RUTA, 1000);
    const conf = await post(base, '/api/documentos/subidas/confirmar', { storagePath: RUTA }, 'token-propA');
    expect(conf.status).toBe(200);
    expect((conf.json.metadatos as { tamanoBytes: number }).tamanoBytes).toBe(1000);
    const acceso = await post(base, '/api/documentos/acceso', { storagePath: RUTA }, 'token-propA');
    expect(acceso.status).toBe(200);
    expect(String(acceso.json.url)).toContain('firebasestorage.googleapis.com');
    expect((await post(base, '/api/documentos/acceso', { storagePath: RUTA }, 'token-propB')).status).toBe(403);
    const borrado = await post(base, '/api/documentos/borrar', { storagePath: RUTA }, 'token-propA');
    expect(borrado.json.estado).toBe('BORRADO');
  });

  it('el portal público no exige sesión pero sí token de solicitud; con sesión usa la identidad', async () => {
    const { servicio, almacen } = montar();
    const base = await baseLocal(appCon(servicio));
    const ruta = 'documentos_solicitados/sol_A/item1_1_f.pdf';
    const sinToken = await post(base, '/api/documentos/publico/subidas', { storagePath: ruta, ...PDF });
    expect(sinToken.status).toBe(400);
    const malo = await post(base, '/api/documentos/publico/subidas', { storagePath: ruta, ...PDF, solicitudDocId: 'sol_A', token: 'tok-equivocado' });
    expect(malo.status).toBe(403);
    expect(malo.json.codigo).toBe('SOLICITUD_NO_VALIDA');
    const bueno = await post(base, '/api/documentos/publico/subidas', { storagePath: ruta, ...PDF, solicitudDocId: 'sol_A', token: 'tok-sol-A-123456' });
    expect(bueno.status).toBe(200);
    almacen.completar(ruta, 1000);
    const conf = await post(base, '/api/documentos/publico/subidas/confirmar', { storagePath: ruta, solicitudDocId: 'sol_A', token: 'tok-sol-A-123456' });
    expect(conf.status).toBe(200);
    // Con sesión del titular, misma ruta: el token no hace falta pero el cuerpo lo exige igual (contrato estable).
    const conSesion = await post(base, '/api/documentos/publico/subidas', { storagePath: 'documentos_solicitados/sol_A/item2_f.pdf', ...PDF, solicitudDocId: 'sol_A', token: 'tok-sol-A-123456' }, 'token-propA');
    expect(conSesion.status).toBe(200);
    expect(almacen.sesiones[1].metadata[META_UID]).toBe('uid_propA');
    // Con sesión SIN ámbito: la identidad manda (no se degrada al token).
    const ajeno = await post(base, '/api/documentos/publico/subidas', { storagePath: 'documentos_solicitados/sol_A/item3_f.pdf', ...PDF, solicitudDocId: 'sol_A', token: 'tok-sol-A-123456' }, 'token-propB');
    expect(ajeno.status).toBe(403);
  });

  it('los errores HTTP no incluyen rutas de Firestore ni identificadores internos', async () => {
    const { servicio } = montar();
    const base = await baseLocal(appCon(servicio));
    const r = await post(base, '/api/documentos/acceso', { storagePath: RUTA }, 'token-propB');
    expect(JSON.stringify(r.json)).not.toMatch(/usuarios_auth|databases|uid_/);
  });
});

describe('registro de auditoría por defecto', () => {
  it('escribe en console.info con prefijo [documentos] y sin nombre de fichero', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    try {
      const almacen = almacenFalso();
      const servicio = crearServicioDocumentos({ puerto: puertoDe(BASE), almacen });
      await servicio.iniciarSubida({ identidad: PROP_A, storagePath: RUTA, ...PDF });
      expect(info).toHaveBeenCalledTimes(1);
      const linea = String(info.mock.calls[0][0]);
      expect(linea.startsWith('[documentos] ')).toBe(true);
      expect(linea).not.toContain('1699_factura.pdf');
      expect(JSON.parse(linea.slice('[documentos] '.length))).toMatchObject({ operacion: 'INICIAR_SUBIDA', resultado: 'OK', destino: 'GASTOS_FACTURAS', actor: 'uid:uid_propA' });
    } finally {
      info.mockRestore();
    }
  });
});
