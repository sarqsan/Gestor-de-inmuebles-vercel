/**
 * IA · contexto contractual por titular. Todo el transporte es simulado:
 * Firestore en memoria, credenciales sintéticas y cliente proveedor falso.
 * No se accede a Google AI ni a servicios reales.
 */
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crearServicioContextoTitularIA, type PuertoContextoTitularIA } from '../server/ia/contextoTitularIA';
import { contratoIdDePeticionIA } from '../server/ia/configuracionIA';
import { clienteIA, crearClienteGemini, crearNucleoIA, type ClienteProveedorIA, type ContextoProveedorIA } from '../server/ia/nucleoIA';
import { crearRegistroMemoria } from '../server/ia/registroOperacionesIA';
import { crearGobiernoMemoria } from '../server/ia/gobiernoIA';
import { crearServicioLlavesMemoria } from '../server/ia/llavesUsuarioIA';
import { construirPoliticaIACompleta, OPERACIONES_IA_IDS, type TipoPerfilIA } from '../src/ia/gobiernoIAContrato';
import type { IdentidadVerificada } from '../server/titularidades/googleBackend';

class FirestoreMemoria implements PuertoContextoTitularIA {
  readonly documentos = new Map<string, Record<string, unknown>>();
  falloLectura = false;

  guardar(ruta: string, datos: Record<string, unknown>): void {
    this.documentos.set(ruta, { ...datos });
  }

  async leerDocumento(ruta: string) {
    if (this.falloLectura) throw new Error('Firestore simulado no disponible');
    const datos = this.documentos.get(ruta);
    return datos ? { id: ruta.split('/').at(-1) ?? '', datos: { ...datos } } : null;
  }

  async consultarIgualdadesOrden(
    coleccion: string,
    consulta: { igualdades?: Array<[string, string]>; limite: number },
  ) {
    if (this.falloLectura) throw new Error('Firestore simulado no disponible');
    const prefijo = `${coleccion}/`;
    return [...this.documentos.entries()]
      .filter(([ruta]) => ruta.startsWith(prefijo) && ruta.slice(prefijo.length).indexOf('/') < 0)
      .filter(([, datos]) => (consulta.igualdades ?? []).every(([campo, valor]) => datos[campo] === valor))
      .slice(0, consulta.limite)
      .map(([ruta, datos]) => ({ id: ruta.slice(prefijo.length), datos: { ...datos } }));
  }
}

function guardarUsuario(
  db: FirestoreMemoria,
  uid: string,
  usuarioId: string,
  tipoPerfil: 'PROPIETARIO' | 'INQUILINO' | 'ADMINISTRADOR' | 'PROFESIONAL',
  fichaExtra: Record<string, unknown> = {},
  espejoExtra: Record<string, unknown> = {},
): void {
  db.guardar(`usuarios_auth/${uid}`, {
    authUid: uid, usuarioId, tipoPerfil, estado: 'ACTIVO', ...espejoExtra,
  });
  db.guardar(`usuarios/${usuarioId}`, {
    id: usuarioId, authUid: uid, tipoPerfil, estado: 'ACTIVO', ...fichaExtra,
  });
}

function crearFixtures(): FirestoreMemoria {
  const db = new FirestoreMemoria();
  for (const sufijo of ['a', 'b']) {
    db.guardar(`usuarios/owner-user-${sufijo}`, {
      id: `owner-user-${sufijo}`, authUid: `owner-${sufijo}`, propietarioId: `prop-${sufijo}`,
      tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
    });
    db.guardar(`usuarios_auth/owner-${sufijo}`, {
      authUid: `owner-${sufijo}`, usuarioId: `owner-user-${sufijo}`, propietarioId: `prop-${sufijo}`,
      tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
    });
    db.guardar(`contratos_formalizacion/contrato-${sufijo}`, {
      id: `contrato-${sufijo}`, propietarioId: `prop-${sufijo}`, inmuebleId: `inmueble-${sufijo}`,
    });
    guardarUsuario(db, `inquilino-${sufijo}`, `tenant-user-${sufijo}`, 'INQUILINO', { contratoIds: [`contrato-${sufijo}`] });
  }
  guardarUsuario(
    db,
    'gestor-1',
    'gestor-user-1',
    'ADMINISTRADOR',
    {},
    { gestionesPorPropietario: { 'prop-a': 'gestion-a' } },
  );
  db.guardar('gestiones_cartera/gestion-a', {
    propietarioId: 'prop-a', gestorUsuarioId: 'gestor-user-1', estado: 'ACTIVA',
    resolucionInvitacion: 'ACEPTADA', permiso: 'LECTURA_ESCRITURA',
    responsableActual: 'GESTOR', inmuebleIds: ['inmueble-a'],
  });
  return db;
}

function hacerProviderFake(llamadas: Array<{ contexto: ContextoProveedorIA; params: unknown }>): ClienteProveedorIA {
  return {
    models: {
      async generateContent(params: unknown) {
        return { text: 'resultado-sintetico', usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 } };
      },
    },
  };
}

const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((servidor) => new Promise<void>((resolve) => servidor.close(() => resolve()))));
  vi.unstubAllEnvs();
});

async function montarNucleoConMock() {
  const db = crearFixtures();
  const resolverContexto = crearServicioContextoTitularIA(db);
  const ahora = new Date('2026-10-17T12:00:00.000Z');
  const politica = construirPoliticaIACompleta({
    permisos: {
      PROPIETARIO: OPERACIONES_IA_IDS,
      PROFESIONAL: OPERACIONES_IA_IDS,
      INQUILINO: OPERACIONES_IA_IDS,
      ADMINISTRADOR: OPERACIONES_IA_IDS,
    },
    costeCreditosPorOperacion: Object.fromEntries(OPERACIONES_IA_IDS.map((id) => [id, 2])) as Record<(typeof OPERACIONES_IA_IDS)[number], number>,
    cuotas: { operacionesPorDia: 100, operacionesPorMes: 1000 },
  });
  const registro = crearRegistroMemoria();
  const gobierno = crearGobiernoMemoria(politica, { ahora: () => ahora, listarOperaciones: () => registro.listar() });
  const perfilIA = (uid: string, tipoPerfil: TipoPerfilIA) => gobierno.fijarPerfil(
    uid,
    { usuarioId: `gobierno-user-${uid}`, tipoPerfil, estado: 'ACTIVO' },
    { authUid: uid, tipoPerfil, estado: 'ACTIVO' },
  );
  for (const uid of ['inquilino-a', 'inquilino-b']) perfilIA(uid, 'INQUILINO');
  perfilIA('gestor-1', 'ADMINISTRADOR');
  for (const uid of ['owner-a', 'owner-b']) perfilIA(uid, 'PROPIETARIO');
  for (const uid of ['owner-a', 'owner-b']) {
    await gobierno.ajustarCredito({
      uid, adminUid: 'admin-sintetico', claveIdempotencia: `carga-${uid}`,
      creditos: 10, ahora,
    });
  }

  const claveMaestra = Buffer.alloc(32, 7);
  const llaves = crearServicioLlavesMemoria(claveMaestra);
  const valoresLlave = { 'owner-a': 'AIza' + 'A'.repeat(35), 'owner-b': 'AIza' + 'B'.repeat(35) };
  for (const [uid, valor] of Object.entries(valoresLlave)) {
    await llaves.registrar({ uid, valor, claveIdempotencia: `registro-${uid}`, ahora });
  }

  const proveedorLlamadas: Array<{ contexto: ContextoProveedorIA; params: unknown }> = [];
  // Valores sintéticos retenidos solo dentro del test para probar que cada UID
  // recibe su llave independiente; nunca se registran en logs/Firestore.
  const llavesEntregadas: Array<{ uid: string; llave: string }> = [];
  const proveedor = hacerProviderFake(proveedorLlamadas);
  const tokenUid: Record<string, string> = {
    'token-inquilino-a': 'inquilino-a',
    'token-inquilino-b': 'inquilino-b',
    'token-gestor': 'gestor-1',
  };
  const nucleo = crearNucleoIA({
    verificarToken: async (token): Promise<IdentidadVerificada | null> => tokenUid[token] ? { uid: tokenUid[token] } : null,
    registro,
    gobierno,
    llaves,
    sinLlave: 'EXIGIR',
    resolverTitularIA: async ({ uidActor, request }) => {
      const body = request.body as Record<string, unknown>;
      if (typeof body.contratoId !== 'string') return { estado: 'RECHAZADO', codigo: 'PETICION_INVALIDA' };
      const resuelto = await resolverContexto.resolver({ uidActor, contratoId: body.contratoId });
      if (resuelto.estado !== 'RESUELTO') return { estado: 'RECHAZADO', codigo: resuelto.codigo };
      return {
        estado: 'RESUELTO',
        contexto: {
          propietarioUid: resuelto.propietarioUid,
          propietarioId: resuelto.propietarioId,
          contratoId: resuelto.contratoId,
          inmuebleId: resuelto.inmuebleId,
        },
      };
    },
    crearClienteProveedor: (contexto) => {
      if (!contexto?.llaveUsuario) return null;
      // Guardamos metadatos no secretos del titular y una huella no sensible de
      // qué llave se entregó, sin registrar su valor en los documentos de prueba.
      llavesEntregadas.push({ uid: contexto.uid, llave: contexto.llaveUsuario });
      proveedorLlamadas.push({ contexto, params: { llavePropietario: contexto.uid, longitudLlave: contexto.llaveUsuario.length } });
      return proveedor;
    },
    ahora: () => ahora,
  });
  const app = express();
  app.use(express.json());
  app.post('/api/prueba-ia', nucleo.operacion('REDACTAR_CLAUSULA'), async (_req, res) => {
    const ai = clienteIA(res);
    if (!ai) return res.status(503).json({ codigo: 'PROVEEDOR_NO_CONFIGURADO' });
    await ai.models.generateContent({ prompt: 'contenido sintético' });
    return res.json({ ok: true });
  });
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  servidores.push(servidor);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const llamar = (token: string, clave: string, cuerpo: Record<string, unknown>) => fetch(`${base}/api/prueba-ia`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': clave },
    body: JSON.stringify(cuerpo),
  });
  return { db, resolverContexto, registro, gobierno, llaves, valoresLlave, proveedorLlamadas, llavesEntregadas, llamar };
}

describe('IA · resolución contractual por titular (solo fixtures y mocks)', () => {
  it('no crea cliente de proveedor desde GEMINI_API_KEY global si no se resuelve llave propia', () => {
    vi.stubEnv('GEMINI_API_KEY', `AIza${'G'.repeat(35)}`);
    expect(crearClienteGemini(undefined)).toBeNull();
  });

  it('las doce rutas tienen un localizador de contrato explícito; UID/propietario del cliente nunca son localizadores', () => {
    const casos = [
      ['ANALIZAR_DOCUMENTO', { candidatoManualData: { contratoId: 'contrato-a' } }],
      ['GENERAR_CORREO_ASEGURADORA', { solicitudSeguro: { contratoId: 'contrato-a' } }],
      ['ANALIZAR_RESPUESTA_ASEGURADORA', { contratoId: 'contrato-a' }],
      ['ASISTENTE_INTERPRETAR', { contratoId: 'contrato-a' }],
      ['ANALIZAR_CUESTIONARIO', { contratoId: 'contrato-a' }],
      ['REDACTAR_CLAUSULA', { contextoInmueble: { contratoId: 'contrato-a' } }],
      ['ANALIZAR_INSPECCION', { contexto: { contratoId: 'contrato-a' } }],
      ['PROPONER_MEJORAS', { contratoId: 'contrato-a' }],
      ['ESTIMAR_PRICING', { contratoId: 'contrato-a' }],
      ['GENERAR_KIT_PUBLICACION', { contratoId: 'contrato-a' }],
      ['ANALIZAR_INCIDENCIA', { incidencia: { contratoId: 'contrato-a' } }],
      ['ASISTENTE_INCIDENCIAS_INQUILINO', { contratoId: 'contrato-a' }],
    ] as const;
    expect(casos.map(([id]) => id)).toEqual(OPERACIONES_IA_IDS);
    for (const [id, cuerpo] of casos) expect(contratoIdDePeticionIA(id, cuerpo), id).toBe('contrato-a');
    expect(contratoIdDePeticionIA('REDACTAR_CLAUSULA', { propietarioId: 'prop-a', propietarioUid: 'owner-a', uidTitular: 'owner-a' })).toBeNull();
    expect(contratoIdDePeticionIA('REDACTAR_CLAUSULA', { contratoId: '../contrato-a' })).toBeNull();
  });

  it('dos inquilinos quedan aislados y el propietario se deriva del contrato, no del cuerpo', async () => {
    const db = crearFixtures();
    const servicio = crearServicioContextoTitularIA(db);
    const [a, b, propietario, suplantada] = await Promise.all([
      servicio.resolver({ uidActor: 'inquilino-a', contratoId: 'contrato-a' }),
      servicio.resolver({ uidActor: 'inquilino-b', contratoId: 'contrato-b' }),
      servicio.resolver({ uidActor: 'owner-a', contratoId: 'contrato-a' }),
      servicio.resolver({
        uidActor: 'inquilino-a', contratoId: 'contrato-a',
        ...({ propietarioId: 'prop-b', propietarioUid: 'owner-b' } as object),
      } as { uidActor: string; contratoId: string }),
    ]);
    expect(a).toMatchObject({ estado: 'RESUELTO', propietarioId: 'prop-a', propietarioUid: 'owner-a', actorTipo: 'INQUILINO' });
    expect(b).toMatchObject({ estado: 'RESUELTO', propietarioId: 'prop-b', propietarioUid: 'owner-b', actorTipo: 'INQUILINO' });
    expect(propietario).toMatchObject({ estado: 'RESUELTO', propietarioId: 'prop-a', propietarioUid: 'owner-a', actorTipo: 'PROPIETARIO' });
    expect(suplantada).toEqual(a);
    await expect(servicio.resolver({ uidActor: 'inquilino-a', contratoId: 'contrato-b' }))
      .resolves.toEqual({ estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO' });
  });

  it('gestor solo resuelve titular dentro de cartera, inmueble y permiso activos', async () => {
    const db = crearFixtures();
    const servicio = crearServicioContextoTitularIA(db);
    await expect(servicio.resolver({ uidActor: 'gestor-1', contratoId: 'contrato-a' }))
      .resolves.toMatchObject({ estado: 'RESUELTO', propietarioUid: 'owner-a', actorTipo: 'GESTOR' });
    await expect(servicio.resolver({ uidActor: 'gestor-1', contratoId: 'contrato-b' }))
      .resolves.toMatchObject({ estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO' });
    await expect(servicio.resolver({ uidActor: 'gestor-1', contratoId: 'contrato-a', permisoMinimo: 'LECTURA_ESCRITURA' }))
      .resolves.toMatchObject({ estado: 'RESUELTO' });
    db.guardar('gestiones_cartera/gestion-a', {
      propietarioId: 'prop-a', gestorUsuarioId: 'gestor-user-1', estado: 'ACTIVA',
      resolucionInvitacion: 'ACEPTADA', permiso: 'LECTURA',
      responsableActual: 'PROPIETARIO', inmuebleIds: ['inmueble-a'],
    });
    await expect(servicio.resolver({ uidActor: 'gestor-1', contratoId: 'contrato-a', permisoMinimo: 'LECTURA_ESCRITURA' }))
      .resolves.toMatchObject({ estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO' });
  });

  it('trata cartera completa solo con [] explícito y no amplía un ámbito ausente o corrupto', async () => {
    const db = crearFixtures();
    const servicio = crearServicioContextoTitularIA(db);
    const base = {
      propietarioId: 'prop-a', gestorUsuarioId: 'gestor-user-1', estado: 'ACTIVA',
      resolucionInvitacion: 'ACEPTADA', permiso: 'LECTURA_ESCRITURA', responsableActual: 'GESTOR',
    };
    db.guardar('gestiones_cartera/gestion-a', base);
    await expect(servicio.resolver({ uidActor: 'gestor-1', contratoId: 'contrato-a' }))
      .resolves.toMatchObject({ estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO' });
    db.guardar('gestiones_cartera/gestion-a', { ...base, inmuebleIds: ['inmueble-a', 17] });
    await expect(servicio.resolver({ uidActor: 'gestor-1', contratoId: 'contrato-a' }))
      .resolves.toMatchObject({ estado: 'RECHAZADO', codigo: 'CONTRATO_NO_AUTORIZADO' });
    db.guardar('gestiones_cartera/gestion-a', { ...base, inmuebleIds: [] });
    await expect(servicio.resolver({ uidActor: 'gestor-1', contratoId: 'contrato-a' }))
      .resolves.toMatchObject({ estado: 'RESUELTO', propietarioUid: 'owner-a', actorTipo: 'GESTOR' });
  });

  it('falla cerrado con contrato incompleto, titular ambiguo o Firestore caído', async () => {
    const db = crearFixtures();
    const servicio = crearServicioContextoTitularIA(db);
    db.guardar('contratos_formalizacion/sin-titular', { id: 'sin-titular', inmuebleId: 'inmueble-a' });
    await expect(servicio.resolver({ uidActor: 'inquilino-a', contratoId: 'sin-titular' }))
      .resolves.toMatchObject({ estado: 'RECHAZADO', codigo: 'TITULAR_NO_RESUELTO' });
    db.guardar('usuarios/owner-user-a-duplicado', {
      id: 'owner-user-a-duplicado', authUid: 'owner-a-duplicado', propietarioId: 'prop-a',
      tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
    });
    db.guardar('usuarios_auth/owner-a-duplicado', {
      authUid: 'owner-a-duplicado', usuarioId: 'owner-user-a-duplicado', propietarioId: 'prop-a',
      tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO',
    });
    await expect(servicio.resolver({ uidActor: 'inquilino-a', contratoId: 'contrato-a' }))
      .resolves.toMatchObject({ estado: 'RECHAZADO', codigo: 'TITULAR_NO_RESUELTO' });
    db.falloLectura = true;
    await expect(servicio.resolver({ uidActor: 'inquilino-a', contratoId: 'contrato-a' }))
      .resolves.toMatchObject({ estado: 'RECHAZADO', codigo: 'FUENTE_NO_DISPONIBLE' });
  });

  it('usa la llave y reserva coste/cuota del titular para dos inquilinos; idempotencia no duplica cargos', async () => {
    const m = await montarNucleoConMock();
    const [a, b] = await Promise.all([
      m.llamar('token-inquilino-a', 'clave-tenant-a-001', {
        contratoId: 'contrato-a', propietarioId: 'prop-b', uidTitular: 'owner-b',
      }),
      m.llamar('token-inquilino-b', 'clave-tenant-b-001', {
        contratoId: 'contrato-b', propietarioId: 'prop-a', uidTitular: 'owner-a',
      }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(m.proveedorLlamadas.map((entrada) => entrada.contexto.uid).sort()).toEqual(['owner-a', 'owner-b']);
    expect(m.proveedorLlamadas.map((entrada) => entrada.contexto.actorUid).sort()).toEqual(['inquilino-a', 'inquilino-b']);
    expect(m.proveedorLlamadas.map((entrada) => entrada.contexto.propietarioId).sort()).toEqual(['prop-a', 'prop-b']);
    expect(m.llavesEntregadas.sort((a, b) => a.uid.localeCompare(b.uid))).toEqual([
      { uid: 'owner-a', llave: m.valoresLlave['owner-a'] },
      { uid: 'owner-b', llave: m.valoresLlave['owner-b'] },
    ]);
    expect(m.llavesEntregadas[0].llave).not.toBe(m.llavesEntregadas[1].llave);
    expect((await m.gobierno.cuenta('owner-a'))).toMatchObject({ saldoCreditos: 8, totalCreditosConsumidos: 2, totalOperaciones: 1 });
    expect((await m.gobierno.cuenta('owner-b'))).toMatchObject({ saldoCreditos: 8, totalCreditosConsumidos: 2, totalOperaciones: 1 });
    expect(await m.gobierno.cuenta('inquilino-a')).toBeNull();
    expect(await m.gobierno.cuenta('inquilino-b')).toBeNull();
    expect((await m.gobierno.operacionesDeUsuario('owner-a')).map((op) => op.uid)).toEqual(['inquilino-a']);
    expect(await m.gobierno.operacionesDeUsuario('inquilino-a')).toEqual([]);
    expect(m.registro.listar()).toEqual(expect.arrayContaining([
      expect.objectContaining({ uid: 'inquilino-a', uidTitular: 'owner-a', propietarioId: 'prop-a' }),
      expect.objectContaining({ uid: 'inquilino-b', uidTitular: 'owner-b', propietarioId: 'prop-b' }),
    ]));
    expect(m.registro.listar().some((registro) => JSON.stringify(registro).includes('AIza'))).toBe(false);

    const reintento = await m.llamar('token-inquilino-a', 'clave-tenant-a-001', { contratoId: 'contrato-a' });
    expect(reintento.status).toBe(409);
    expect(m.proveedorLlamadas).toHaveLength(2);
    expect((await m.gobierno.cuenta('owner-a'))?.saldoCreditos).toBe(8);
  });

  it('gestor con cartera autorizada paga con el propietario; actor fuera de cartera no llega a llave ni cuota', async () => {
    const m = await montarNucleoConMock();
    const permitido = await m.llamar('token-gestor', 'clave-gestor-001', { contratoId: 'contrato-a' });
    expect(permitido.status).toBe(200);
    expect(m.proveedorLlamadas[0].contexto).toMatchObject({ uid: 'owner-a', actorUid: 'gestor-1', propietarioId: 'prop-a' });
    expect((await m.gobierno.cuenta('owner-a'))).toMatchObject({ saldoCreditos: 8, totalOperaciones: 1 });
    expect(await m.gobierno.cuenta('gestor-1')).toBeNull();

    const antesLlaves = m.llaves.documentos().size;
    const denegado = await m.llamar('token-gestor', 'clave-gestor-002', { contratoId: 'contrato-b' });
    expect(denegado.status).toBe(403);
    expect(await denegado.json()).toMatchObject({ codigo: 'CONTRATO_IA_NO_AUTORIZADO' });
    expect(m.llaves.documentos().size).toBe(antesLlaves);
    expect(m.proveedorLlamadas).toHaveLength(1);
    expect((await m.gobierno.cuenta('owner-b'))).toMatchObject({ saldoCreditos: 10, totalOperaciones: 0 });
  });

  it('sin contexto contractual o sin llave del propietario no usa fallback global ni consume', async () => {
    const m = await montarNucleoConMock();
    const sinContrato = await m.llamar('token-inquilino-a', 'clave-sin-contrato-01', { prompt: 'no se debe ejecutar' });
    expect(sinContrato.status).toBe(400);
    expect(await sinContrato.json()).toMatchObject({ codigo: 'CONTEXTO_IA_INVALIDO' });
    expect(m.llaves.documentos().has('inquilino-a')).toBe(false);
    expect(m.proveedorLlamadas).toHaveLength(0);

    await m.llaves.revocar({ uid: 'owner-a', claveIdempotencia: 'revoca-owner-a', ahora: new Date('2026-10-17T12:01:00.000Z') });
    const sinLlave = await m.llamar('token-inquilino-a', 'clave-sin-llave-01', { contratoId: 'contrato-a' });
    expect(sinLlave.status).toBe(428);
    expect(await sinLlave.json()).toMatchObject({ codigo: 'LLAVE_USUARIO_REQUERIDA' });
    expect((await m.gobierno.cuenta('owner-a'))?.totalOperaciones).toBe(0);
    expect(m.proveedorLlamadas).toHaveLength(0);
  });
});
