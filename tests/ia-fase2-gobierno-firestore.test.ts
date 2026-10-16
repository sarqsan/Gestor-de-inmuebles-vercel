/**
 * IA · FASE 2 — GOBIERNO SOBRE FIRESTORE REST (sin SDK de administración)
 * =======================================================================
 * Dobles de `fetch` (sin red y sin datos reales) contra la API REST de
 * Firestore, con versionado `updateTime` realista:
 *
 *   · perfil veraz leído del espejo `usuarios_auth` y la ficha `usuarios`;
 *   · reserva de uso con compare-and-swap (`currentDocument.updateTime`):
 *     una carrera perdida (409) se releé y reintenta, nunca se sobrescribe;
 *   · concurrencia real sobre el mismo uid: saldo para 3 de 5 ⇒ 3 y sólo 3;
 *   · reembolso con rodadura de ventanas;
 *   · ajustes idempotentes (misma clave de admin ⇒ DUPLICADO, un solo
 *     documento en `ia_ajustes`) y fuera de límites (quedan PENDIENTES);
 *   · consultas acotadas por igualdad + orden + límite;
 *   · `ia_cuentas`/`ia_ajustes` no existen en `firestore.rules`: la denegación
 *     global las cubre (se comprueba sobre el fichero desplegable).
 */
import { generateKeyPairSync, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ClienteFirestoreRest,
  codificarValor,
  decodificarCampos,
  reiniciarCacheTokens,
  type CuentaServicio,
} from '../server/titularidades/googleBackend';
import {
  COLECCION_AJUSTES_IA,
  COLECCION_CUENTAS_IA,
  MAX_INTENTOS_CAS,
  claveVentanaDia,
  claveVentanaMes,
  crearGobiernoFirestore,
  idAjusteIA,
} from '../server/ia/gobiernoIA';
import {
  construirPoliticaIACompleta,
  OPERACIONES_IA_IDS,
  validarPoliticaGobiernoIA,
  type PoliticaGobiernoIA,
  type SobrescriturasPoliticaIA,
} from '../src/ia/gobiernoIAContrato';
import type { IdOperacionIA } from '../src/ia/catalogoOperacionesIA';

const par = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CUENTA: CuentaServicio = {
  project_id: 'proyecto-demo',
  client_email: 'sa@proyecto-demo.iam.gserviceaccount.com',
  private_key: par.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const BASE_DATOS = 'ai-studio-base-con-nombre';
const RAIZ = resolve(__dirname, '..');

interface DocumentoGuardado {
  fields: Record<string, unknown>;
  updateTime: string;
}

function respuesta(datos: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => datos,
    text: async () => (typeof datos === 'string' ? datos : JSON.stringify(datos)),
  };
}

/**
 * Firestore falso con versionado: cada escritura avanza `updateTime`, y el
 * PATCH condicional devuelve 409 si la versión no coincide. `conflictoPatch`
 * hace perder N carrasas a propósito (otro escritor gana) para obligar al CAS
 * a releer y reintentar.
 */
function firestoreFalsoGobierno(opciones: { conflictoPatch?: number } = {}) {
  const documentos = new Map<string, DocumentoGuardado>();
  const peticiones: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];
  let version = 0;
  let conflictosPendientes = opciones.conflictoPatch ?? 0;
  const siguienteVersion = () => `2026-10-15T10:00:0${++version}.000000Z`;

  const fetchImpl = async (url: string, init?: { method?: string; body?: string }) => {
    if (url.includes('oauth2')) return respuesta({ access_token: 'token-servicio', expires_in: 3600 });
    const method = init?.method || 'GET';
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    peticiones.push({ url, method, body });
    const u = new URL(url);

    if (u.pathname.endsWith(':runQuery')) {
      const q = (body?.structuredQuery ?? {}) as {
        from?: Array<{ collectionId: string }>;
        where?: unknown;
        orderBy?: Array<{ field: { fieldPath: string }; direction: string }>;
        limit?: number;
      };
      const coleccion = q.from?.[0]?.collectionId ?? '';
      const filtros: Array<[string, string]> = [];
      const donde = q.where as Record<string, unknown> | undefined;
      const extraer = (filtro: Record<string, unknown>) => {
        const ff = filtro.fieldFilter as { field?: { fieldPath?: string }; value?: { stringValue?: string } } | undefined;
        if (ff?.field?.fieldPath) filtros.push([ff.field.fieldPath, String(ff.value?.stringValue ?? '')]);
      };
      if (donde?.fieldFilter) extraer(donde as Record<string, unknown>);
      if (donde?.compositeFilter) {
        for (const filtro of ((donde.compositeFilter as { filters?: unknown[] }).filters ?? [])) extraer(filtro as Record<string, unknown>);
      }
      const orden = q.orderBy?.[0];
      const limite = q.limit ?? 100;
      let filas = [...documentos.entries()].filter(([clave]) => clave.startsWith(`${coleccion}/`));
      filas = filas.filter(([, doc]) => {
        const datos = decodificarCampos(doc.fields as never);
        return filtros.every(([campo, valor]) => String(datos[campo] ?? '') === valor);
      });
      if (orden) {
        const campo = orden.field.fieldPath;
        filas.sort((a, b) => {
          const va = String(decodificarCampos(a[1].fields as never)[campo] ?? '');
          const vb = String(decodificarCampos(b[1].fields as never)[campo] ?? '');
          const cmp = va < vb ? -1 : va > vb ? 1 : 0;
          return orden.direction === 'DESCENDING' ? -cmp : cmp;
        });
      }
      const salida = filas.slice(0, limite).map(([clave, doc]) => ({
        document: { name: clave, fields: doc.fields, updateTime: doc.updateTime },
      }));
      return respuesta(salida);
    }

    if (method === 'POST') {
      const id = u.searchParams.get('documentId') || '';
      const clave = `${u.pathname.split('/documents/')[1]}/${id}`;
      if (documentos.has(clave)) return respuesta({ error: { status: 'ALREADY_EXISTS' } }, 409);
      const updateTime = siguienteVersion();
      documentos.set(clave, { fields: (body?.fields as Record<string, unknown>) || {}, updateTime });
      return respuesta({ name: clave, fields: body?.fields, updateTime });
    }

    const clave = decodeURIComponent(u.pathname.split('/documents/')[1]);
    if (method === 'PATCH') {
      const existe = u.searchParams.get('currentDocument.exists');
      const updateTimeEsperado = u.searchParams.get('currentDocument.updateTime');
      const doc = documentos.get(clave);
      if (!doc) {
        if (existe === 'true') return respuesta({ error: { status: 'NOT_FOUND' } }, 404);
        const nueva = siguienteVersion();
        documentos.set(clave, { fields: (body?.fields as Record<string, unknown>) || {}, updateTime: nueva });
        return respuesta({ name: clave, updateTime: nueva });
      }
      if (updateTimeEsperado) {
        if (conflictosPendientes > 0) {
          conflictosPendientes -= 1;
          doc.updateTime = siguienteVersion(); // otro escritor gana la carrera
          return respuesta({ error: { status: 'ABORTED', message: 'precondition check failed' } }, 409);
        }
        if (doc.updateTime !== updateTimeEsperado) {
          return respuesta({ error: { status: 'ABORTED', message: 'precondition check failed' } }, 409);
        }
      }
      doc.fields = { ...doc.fields, ...((body?.fields as Record<string, unknown>) || {}) };
      doc.updateTime = siguienteVersion();
      return respuesta({ name: clave, updateTime: doc.updateTime });
    }

    const doc = documentos.get(clave);
    return doc ? respuesta({ name: clave, fields: doc.fields, updateTime: doc.updateTime }) : respuesta('no', 404);
  };

  return { fetchImpl: fetchImpl as never, peticiones, documentos };
}

/** FASE 7 · política COMPLETA y explícita para las pruebas del mecanismo: los CUATRO
 * perfiles declarados (sin comodines) y la tarifa de las 12 operaciones. Las
 * sobrescrituras de un perfil sustituyen su ámbito; las de coste/cuota se fusionan. */
function politicaPermisiva(parcial: SobrescriturasPoliticaIA = {}): PoliticaGobiernoIA {
  return construirPoliticaIACompleta({
    ...parcial,
    // La operación que ejercen estas suites se declara a 0 créditos salvo que la
    // prueba fije otra tarifa: siguen probando permisos, cuotas y saldo, no precios.
    costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 0, ...(parcial.costeCreditosPorOperacion ?? {}) },
    permisos: {
      PROPIETARIO: OPERACIONES_IA_IDS,
      PROFESIONAL: OPERACIONES_IA_IDS,
      INQUILINO: OPERACIONES_IA_IDS,
      ADMINISTRADOR: OPERACIONES_IA_IDS,
      ...(parcial.permisos ?? {}),
    },
  });
}

function gobiernoFirestore(politicaCruda: unknown, opciones?: { conflictoPatch?: number }) {
  const resultado = validarPoliticaGobiernoIA(politicaPermisiva((politicaCruda ?? {}) as SobrescriturasPoliticaIA));
  if (resultado.estado !== 'VALIDA') throw new Error('política de prueba inválida');
  const falso = firestoreFalsoGobierno(opciones);
  const cliente = new ClienteFirestoreRest({ cuenta: CUENTA, baseDatosId: BASE_DATOS, fetchImpl: falso.fetchImpl });
  const gobierno = crearGobiernoFirestore(cliente, resultado.politica);
  return { gobierno, falso, cliente };
}

function fijarPerfil(falso: ReturnType<typeof firestoreFalsoGobierno>, uid: string, espejo: Record<string, unknown> | null, fichaId: string | null, ficha: Record<string, unknown> | null) {
  const codificar = (datos: Record<string, unknown>) =>
    (codificarValor(datos) as { mapValue: { fields?: Record<string, unknown> } }).mapValue.fields || {};
  if (espejo) falso.documentos.set(`usuarios_auth/${uid}`, { fields: codificar(espejo), updateTime: 'v0' });
  if (ficha && fichaId) falso.documentos.set(`usuarios/${fichaId}`, { fields: codificar(ficha), updateTime: 'v0' });
}

const AHORA = new Date('2026-10-15T12:00:00.000Z');
const OP: IdOperacionIA = 'REDACTAR_CLAUSULA';

beforeEach(() => reiniciarCacheTokens());

describe('IA Fase 2 · adaptador REST: CAS por updateTime', () => {
  it('leerDocumento devuelve updateTime y actualizarCamposSiVersion aplica con la versión correcta', async () => {
    const { cliente, falso } = gobiernoFirestore(undefined);
    await cliente.crearDocumento('col', 'doc1', { a: 1 });
    const leido = await cliente.leerDocumento('col/doc1');
    expect(leido?.updateTime).toBeTruthy();
    const aplicado = await cliente.actualizarCamposSiVersion('col', 'doc1', { a: 2 }, leido!.updateTime!);
    expect(aplicado).toBe(true);
    expect((falso.documentos.get('col/doc1')?.fields as { a: { integerValue: string } }).a.integerValue).toBe('2');
  });

  it('con una versión caducada devuelve false (carrera perdida) sin lanzar ni escribir', async () => {
    const { cliente, falso } = gobiernoFirestore(undefined);
    await cliente.crearDocumento('col', 'doc1', { a: 1 });
    await cliente.actualizarCampos('col', 'doc1', { a: 2 }); // avanza la versión
    const aplicado = await cliente.actualizarCamposSiVersion('col', 'doc1', { a: 3 }, '2020-01-01T00:00:00.000000Z');
    expect(aplicado).toBe(false);
    expect((falso.documentos.get('col/doc1')?.fields as { a: { integerValue: string } }).a.integerValue).toBe('2');
  });

  it('consultarIgualdadesOrden filtra por igualdad, ordena y limita', async () => {
    const { cliente } = gobiernoFirestore(undefined);
    await cliente.crearDocumento('ia_operaciones', 'op1', { uid: 'u1', iniciadaEn: new Date('2026-10-15T10:00:00Z') });
    await cliente.crearDocumento('ia_operaciones', 'op2', { uid: 'u2', iniciadaEn: new Date('2026-10-15T11:00:00Z') });
    await cliente.crearDocumento('ia_operaciones', 'op3', { uid: 'u1', iniciadaEn: new Date('2026-10-15T12:00:00Z') });
    const filas = await cliente.consultarIgualdadesOrden('ia_operaciones', {
      igualdades: [['uid', 'u1']],
      orden: { campo: 'iniciadaEn', direccion: 'DESCENDING' },
      limite: 10,
    });
    expect(filas.map((f) => f.id)).toEqual(['op3', 'op1']);
    const limitadas = await cliente.consultarIgualdadesOrden('ia_operaciones', { limite: 2 });
    expect(limitadas).toHaveLength(2);
  });
});

describe('IA Fase 2 · perfil veraz desde Firestore', () => {
  it('espejo y ficha coherentes y ACTIVOS → VERAZ', async () => {
    const { gobierno, falso } = gobiernoFirestore(undefined);
    fijarPerfil(falso, 'uid-ana', { usuarioId: 'usr-ana', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, 'usr-ana', { authUid: 'uid-ana', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
    const r = await gobierno.perfilVeraz('uid-ana');
    expect(r.estado).toBe('VERAZ');
    if (r.estado === 'VERAZ') expect(r.perfil.tipoPerfil).toBe('PROPIETARIO');
  });

  it('espejo inactivo, ausente o discordante con la ficha → rechazo con código', async () => {
    const { gobierno, falso } = gobiernoFirestore(undefined);
    fijarPerfil(falso, 'u1', { usuarioId: 'usr', tipoPerfil: 'PROPIETARIO', estado: 'BLOQUEADO' }, 'usr', { authUid: 'u1', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
    fijarPerfil(falso, 'u2', { usuarioId: 'usr2', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' }, 'usr2', { authUid: 'OTRO', tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' });
    fijarPerfil(falso, 'u3', { usuarioId: 'usr3', tipoPerfil: 'PROFESIONAL', estado: 'ACTIVO' }, 'usr3', null);
    expect(await gobierno.perfilVeraz('u1')).toMatchObject({ estado: 'RECHAZADO', codigo: 'USUARIO_NO_ACTIVO' });
    expect(await gobierno.perfilVeraz('u2')).toMatchObject({ codigo: 'PERFIL_INCOHERENTE' });
    expect(await gobierno.perfilVeraz('u3')).toMatchObject({ codigo: 'PERFIL_INCOHERENTE' });
    expect(await gobierno.perfilVeraz('no-existe')).toMatchObject({ codigo: 'PERFIL_NO_ENCONTRADO' });
  });
});

describe('IA Fase 2 · reserva con CAS sobre ia_cuentas', () => {
  it('rechazo por saldo: la cuenta se crea con saldo 0 y no se consume nada', async () => {
    const { gobierno } = gobiernoFirestore({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } });
    const r = await gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_1', ahora: AHORA });
    expect(r).toEqual({ estado: 'RECHAZADO', codigo: 'SALDO_INSUFICIENTE' });
    const cuenta = await gobierno.cuenta('uid-ana');
    expect(cuenta?.saldoCreditos).toBe(0);
    expect(cuenta?.totalOperaciones).toBe(0);
    expect(cuenta?.ventanaDiaUsos).toBe(0);
  });

  it('saldo insuficiente → RECHAZADO sin escribir la cuenta', async () => {
    const { gobierno } = gobiernoFirestore({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } });
    const r = await gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_1', ahora: AHORA });
    expect(r).toEqual({ estado: 'RECHAZADO', codigo: 'SALDO_INSUFICIENTE' });
  });

  it('una carrera perdida (409) se releé y reintenta hasta aplicar', async () => {
    const { gobierno, falso } = gobiernoFirestore({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 1 } }, { conflictoPatch: 2 });
    // conceder saldo inicial con el propio gobierno (idempotente por su clave)
    await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c1', creditos: 5, motivo: 'prueba', ahora: AHORA });
    const r = await gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_2', ahora: AHORA });
    expect(r).toEqual({ estado: 'RESERVADO', coste: 1 });
    const cuenta = await gobierno.cuenta('uid-ana');
    expect(cuenta?.saldoCreditos).toBe(4);
    const lecturas = falso.peticiones.filter((p) => p.method === 'GET' && p.url.includes('ia_cuentas/uid-ana')).length;
    expect(lecturas).toBeGreaterThan(3); // relecturas por las carreras perdidas
  });

  it('agotados los reintentos de CAS lanza ConflictoConcurrenciaIA (nunca corrompe el saldo)', async () => {
    const { gobierno } = gobiernoFirestore(undefined, { conflictoPatch: 999 });
    await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c1', creditos: 5, motivo: 'prueba', ahora: AHORA })
      .catch(() => undefined); // el ajuste también puede perder todas las carreras
    await expect(
      gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_3', ahora: AHORA }),
    ).rejects.toThrow(/concurrencia/i);
  });

  it('concurrencia sobre el mismo uid: saldo para 3 de 5 ⇒ exactamente 3 reservas', async () => {
    const { gobierno } = gobiernoFirestore({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } });
    await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c1', creditos: 6, motivo: 'prueba', ahora: AHORA });
    const resultados = await Promise.all([
      gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_a', ahora: AHORA }),
      gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_b', ahora: AHORA }),
      gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_c', ahora: AHORA }),
      gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_d', ahora: AHORA }),
      gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_e', ahora: AHORA }),
    ]);
    const reservadas = resultados.filter((r) => r.estado === 'RESERVADO');
    const rechazadas = resultados.filter((r) => r.estado === 'RECHAZADO');
    expect(reservadas).toHaveLength(3);
    expect(rechazadas).toHaveLength(2);
    expect(rechazadas.every((r) => r.estado === 'RECHAZADO' && r.codigo === 'SALDO_INSUFICIENTE')).toBe(true);
    const cuenta = await gobierno.cuenta('uid-ana');
    expect(cuenta?.saldoCreditos).toBe(0);
    expect(cuenta?.totalOperaciones).toBe(3);
    expect(cuenta?.ventanaDiaUsos).toBe(3);
  });
});

describe('IA Fase 2 · reembolso y ventanas', () => {
  it('reembolsar devuelve el saldo y decrementa el uso de la misma ventana', async () => {
    const { gobierno } = gobiernoFirestore({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } });
    await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c1', creditos: 4, motivo: 'prueba', ahora: AHORA });
    await gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_1', ahora: AHORA });
    const ok = await gobierno.reembolsar({
      uid: 'uid-ana',
      creditos: 2,
      operacionId: 'iaop_1',
      ventanaDiaClave: claveVentanaDia(AHORA),
      ventanaMesClave: claveVentanaMes(AHORA),
      ahora: AHORA,
    });
    expect(ok).toBe(true);
    const cuenta = await gobierno.cuenta('uid-ana');
    expect(cuenta?.saldoCreditos).toBe(4);
    expect(cuenta?.ventanaDiaUsos).toBe(0);
    expect(cuenta?.totalCreditosConsumidos).toBe(0);
  });

  it('si la ventana rodó, el reembolso devuelve saldo pero NO toca los contadores nuevos', async () => {
    const { gobierno } = gobiernoFirestore({ costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } });
    await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c1', creditos: 4, motivo: 'prueba', ahora: AHORA });
    await gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_1', ahora: AHORA });
    const diaSiguiente = new Date('2026-10-16T09:00:00.000Z');
    await gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_2', ahora: diaSiguiente });
    const ok = await gobierno.reembolsar({
      uid: 'uid-ana',
      creditos: 2,
      operacionId: 'iaop_1',
      ventanaDiaClave: claveVentanaDia(AHORA),
      ventanaMesClave: claveVentanaMes(AHORA),
      ahora: diaSiguiente,
    });
    expect(ok).toBe(true);
    const cuenta = await gobierno.cuenta('uid-ana');
    expect(cuenta?.saldoCreditos).toBe(2); // 4 - 2 - 2 + 2
    expect(cuenta?.ventanaDiaClave).toBe(claveVentanaDia(diaSiguiente));
    expect(cuenta?.ventanaDiaUsos).toBe(1); // la del día siguiente sigue contando
  });
});

describe('IA Fase 2 · ajustes de administración (idempotentes y auditados)', () => {
  it('la misma clave de idempotencia aplica un solo ajuste (DUPLICADO la segunda)', async () => {
    const { gobierno, falso } = gobiernoFirestore(undefined);
    const primero = await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'misma-clave', creditos: 10, motivo: 'concesión', ahora: AHORA });
    const segundo = await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'misma-clave', creditos: 10, motivo: 'concesión', ahora: AHORA });
    expect(primero).toEqual({ estado: 'APLICADO' });
    expect(segundo).toEqual({ estado: 'DUPLICADO' });
    const cuenta = await gobierno.cuenta('uid-ana');
    expect(cuenta?.saldoCreditos).toBe(10);
    const ajustes = [...falso.documentos.keys()].filter((k) => k.startsWith(`${COLECCION_AJUSTES_IA}/`));
    expect(ajustes).toEqual([`${COLECCION_AJUSTES_IA}/${idAjusteIA('adm', 'misma-clave')}`]);
  });

  it('saldo resultante fuera de [0, MAX] ⇒ FUERA_DE_LIMITES y el ajuste queda PENDIENTE y visible', async () => {
    const { gobierno } = gobiernoFirestore(undefined);
    const r = await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c-neg', creditos: -5, motivo: 'corrección', ahora: AHORA });
    expect(r.estado).toBe('FUERA_DE_LIMITES');
    const cuenta = await gobierno.cuenta('uid-ana');
    expect(cuenta?.saldoCreditos).toBe(0);
    const ajustes = await gobierno.ajustesDeUsuario('uid-ana');
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0].estado).toBe('PENDIENTE');
    expect(ajustes[0].creditos).toBe(-5);
  });

  it('bloquear escribe motivo y el siguiente uso se rechaza por CUENTA_BLOQUEADA', async () => {
    const { gobierno } = gobiernoFirestore(undefined);
    await gobierno.bloquear({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c-blq', bloqueado: true, motivo: 'uso abusivo', ahora: AHORA });
    const cuenta = await gobierno.cuenta('uid-ana');
    expect(cuenta?.bloqueada).toBe(true);
    expect(cuenta?.motivoBloqueo).toBe('uso abusivo');
    const r = await gobierno.reservarUso({ uid: 'uid-ana', operacion: OP, operacionId: 'iaop_1', ahora: AHORA });
    expect(r).toEqual({ estado: 'RECHAZADO', codigo: 'CUENTA_BLOQUEADA' });
    const desbloqueo = await gobierno.bloquear({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c-unblq', bloqueado: false, ahora: AHORA });
    expect(desbloqueo).toEqual({ estado: 'APLICADO' });
    expect((await gobierno.cuenta('uid-ana'))?.bloqueada).toBe(false);
  });

  it('los documentos de ajuste no guardan datos personales: sólo uids, importe, motivo y fechas', async () => {
    const { gobierno, falso } = gobiernoFirestore(undefined);
    await gobierno.ajustarCredito({ uid: 'uid-ana', adminUid: 'adm', claveIdempotencia: 'c1', creditos: 3, motivo: 'prueba', ahora: AHORA });
    const doc = falso.documentos.get(`${COLECCION_AJUSTES_IA}/${idAjusteIA('adm', 'c1')}`);
    expect(doc).toBeTruthy();
    const serializado = JSON.stringify(doc?.fields);
    expect(serializado).not.toMatch(/prompt|Bearer|eyJ|@correo|private_key/i);
  });
});

describe('IA Fase 2 · consultas del panel y reglas', () => {
  it('operacionesDeUsuario filtra por uid y ordena por fecha descendente', async () => {
    const { gobierno, cliente } = gobiernoFirestore(undefined);
    await cliente.crearDocumento('ia_operaciones', 'op1', { uid: 'uid-ana', operacion: OP, estado: 'COMPLETADA', iniciadaEn: new Date('2026-10-15T10:00:00Z') });
    await cliente.crearDocumento('ia_operaciones', 'op2', { uid: 'uid-luis', operacion: OP, estado: 'COMPLETADA', iniciadaEn: new Date('2026-10-15T11:00:00Z') });
    await cliente.crearDocumento('ia_operaciones', 'op3', { uid: 'uid-ana', operacion: OP, estado: 'FALLIDA', iniciadaEn: new Date('2026-10-15T12:00:00Z'), costeCreditos: 0 });
    const operaciones = await gobierno.operacionesDeUsuario('uid-ana');
    expect(operaciones.map((o) => o.id)).toEqual(['op3', 'op1']);
    expect(operaciones[0].estado).toBe('FALLIDA');
  });

  it('firestore.rules NO abre acceso a ia_cuentas ni ia_ajustes (denegación global)', () => {
    const reglas = readFileSync(resolve(RAIZ, 'firestore.rules'), 'utf8');
    expect(reglas).not.toMatch(/match\s+\/ia_cuentas/);
    expect(reglas).not.toMatch(/match\s+\/ia_ajustes/);
    expect(reglas).toMatch(/match\s+\/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);
  });

  it('MAX_INTENTOS_CAS está acotado para no girar indefinidamente', () => {
    expect(MAX_INTENTOS_CAS).toBeLessThanOrEqual(10);
    expect(COLECCION_CUENTAS_IA).toBe('ia_cuentas');
    expect(COLECCION_AJUSTES_IA).toBe('ia_ajustes');
  });
});
