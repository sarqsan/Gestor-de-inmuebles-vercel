/**
 * IA · FASE 7 — GOBIERNO DE IA: PERMISOS EXPLÍCITOS, TARIFAS Y CUOTAS FINITAS
 * ==========================================================================
 * Peticiones HTTP REALES contra una app Express en puerto efímero con las doce
 * rutas del catálogo montadas por el núcleo real (identidad, idempotencia,
 * permisos, cuotas, saldo, registro), gobierno y registro en memoria y un
 * proveedor DOBLE: sin red, sin Firebase y sin consumo real.
 *
 * Comprueba lo que exige la fase:
 *   · no hay comodines: cada permiso se declara operación a operación;
 *   · no hay tarifas implícitas: sin la tarifa de las 12 operaciones la política
 *     es INVÁLIDA (y el servidor cierra con 503, nunca con un respaldo);
 *   · no hay cuotas ilimitadas: día y mes son finitos;
 *   · las once operaciones anteriores MÁS la nueva (asistente de incidencias del
 *     inquilino) se revisan una a una (12 × 4 perfiles = 48 combinaciones);
 *   · créditos, idempotencia, reembolso y registro de consumo siguen siendo los
 *     de Fase 2, ahora con la tarifa declarada de la operación nueva;
 *   · con la política incompleta el consumo queda DESACTIVADO (por defecto y con
 *     `IA_POLITICA_JSON` inválida).
 */
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { clienteIA, crearNucleoIA, generateGeminiWithRetry, type ClienteProveedorIA, type EventoNucleoIA } from '../server/ia/nucleoIA';
import { CAMPOS_REGISTRO_IA, crearRegistroMemoria, type RegistroOperacionesIAMemoria } from '../server/ia/registroOperacionesIA';
import { crearGobiernoMemoria, type GobiernoMemoriaIA } from '../server/ia/gobiernoIA';
import type { ResultadoResolverTitularNucleoIA } from '../server/ia/nucleoIA';
import type { ServicioLlavesIA } from '../server/ia/llavesUsuarioIA';
import { OPERACIONES_IA, type IdOperacionIA } from '../src/ia/catalogoOperacionesIA';
import {
  CUOTAS_IA_REFERENCIA,
  OPERACIONES_IA_IDS,
  PERMISOS_IA_REFERENCIA,
  TARIFAS_IA_REFERENCIA,
  TIPOS_PERFIL_IA,
  VARIABLE_ENTORNO_POLITICA_IA,
  construirPoliticaIACompleta,
  permiteOperacion,
  politicaCompletaIA,
  politicaGobiernoIADesdeEntorno,
  resumenPoliticaGobiernoIA,
  validarPoliticaGobiernoIA,
  type PoliticaGobiernoIA,
  type TipoPerfilIA,
} from '../src/ia/gobiernoIAContrato';
import type { IdentidadVerificada } from '../server/titularidades/googleBackend';

const RAIZ = resolve(__dirname, '..');
const OP_NUEVA: IdOperacionIA = 'ASISTENTE_INCIDENCIAS_INQUILINO';
const OP_HISTORICA: IdOperacionIA = 'ANALIZAR_INCIDENCIA';

const TOKENS: Record<string, IdentidadVerificada> = {
  'token-admin': { uid: 'uid-admin' },
  'token-inquilino': { uid: 'uid-inquilino' },
  'token-propietario': { uid: 'uid-propietario' },
};

/** Perfiles veraces que el gobierno lee del espejo de identidad (nunca del cuerpo). */
const PERFILES: Array<{ uid: string; tipoPerfil: TipoPerfilIA }> = [
  { uid: 'uid-admin', tipoPerfil: 'ADMINISTRADOR' },
  { uid: 'uid-inquilino', tipoPerfil: 'INQUILINO' },
  { uid: 'uid-propietario', tipoPerfil: 'PROPIETARIO' },
];

function proveedorFalso(opciones: { fallos?: number } = {}) {
  const llamadas: string[] = [];
  let fallosPendientes = opciones.fallos ?? 0;
  const cliente: ClienteProveedorIA = {
    models: {
      async generateContent(params: unknown) {
        llamadas.push(JSON.stringify(params).slice(0, 40));
        if (fallosPendientes > 0) {
          fallosPendientes -= 1;
          throw Object.assign(new Error('503 UNAVAILABLE: high demand'), { status: 503 });
        }
        return { text: '{"ok":true}', usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } };
      },
    },
  };
  return { cliente, llamadas };
}

/** Todas las tarifas declaradas a 0 (explícitas): aísla permisos y cuotas del saldo. */
const COSTES_CERO: Partial<Record<IdOperacionIA, number>> = Object.fromEntries(
  OPERACIONES_IA_IDS.map((id) => [id, 0]),
) as Partial<Record<IdOperacionIA, number>>;

const plantillaCosteCero = (): PoliticaGobiernoIA => construirPoliticaIACompleta({ costeCreditosPorOperacion: COSTES_CERO });

const servidores: Server[] = [];
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

interface OpcionesMontaje {
  politica?: PoliticaGobiernoIA;
  /** Gobierno construido SIN `IA_POLITICA_JSON` (política POR_DEFECTO: deniega todo y bloquea). */
  porDefecto?: boolean;
  errorGobierno?: 'POLITICA_IA_INVALIDA';
  proveedor?: ClienteProveedorIA | null;
}

async function montar(opciones: OpcionesMontaje = {}) {
  const politica = opciones.politica ?? (opciones.porDefecto ? desdeEntorno({}).politica : plantillaCosteCero());
  const registro: RegistroOperacionesIAMemoria = crearRegistroMemoria();
  const gobierno: GobiernoMemoriaIA = crearGobiernoMemoria(politica, { listarOperaciones: () => registro.listar() });
  const fijarPerfil = (uid: string, tipoPerfil: string) => gobierno.fijarPerfil(
    uid,
    { usuarioId: `usr-${uid}`, tipoPerfil, estado: 'ACTIVO' },
    { authUid: uid, tipoPerfil, estado: 'ACTIVO' },
  );
  for (const { uid, tipoPerfil } of PERFILES) {
    fijarPerfil(uid, tipoPerfil);
    fijarPerfil(`owner-${uid}`, 'PROPIETARIO');
  }
  const llaves = {
    resolverParaOperacion: async (uid: string) => ({ estado: 'DISPONIBLE' as const, valor: `mock-key-${uid}`, sufijo: 'MOCK' }),
  } as unknown as ServicioLlavesIA;
  const resolverTitularIA = async ({ uidActor }: { uidActor: string }): Promise<ResultadoResolverTitularNucleoIA> => ({
    estado: 'RESUELTO',
    contexto: {
      propietarioUid: `owner-${uidActor}`, propietarioId: `prop-${uidActor}`,
      contratoId: `contract-${uidActor}`, inmuebleId: `asset-${uidActor}`,
    },
  });
  const { cliente, llamadas } = proveedorFalso();
  const eventos: EventoNucleoIA[] = [];
  const nucleo = crearNucleoIA({
    verificarToken: async (token) => TOKENS[token] ?? null,
    registro,
    gobierno,
    llaves,
    resolverTitularIA,
    ...(opciones.errorGobierno ? { errorGobierno: opciones.errorGobierno } : {}),
    crearClienteProveedor: () => (opciones.proveedor === null ? null : opciones.proveedor ?? cliente),
    log: (evento) => eventos.push(evento),
  });
  // Las DOCE rutas del catálogo, montadas con el mismo middleware del núcleo.
  const ejecuciones: IdOperacionIA[] = [];
  const app = express();
  app.use(express.json());
  for (const { id, ruta } of OPERACIONES_IA) {
    app.post(ruta, nucleo.operacion(id), async (_req, res) => {
      ejecuciones.push(id);
      const ai = clienteIA(res);
      if (!ai) return res.json({ motor: 'respaldo', operacion: id });
      try {
        const r = await generateGeminiWithRetry(ai, { model: 'gemini-3.7-flash', contents: { parts: [{ text: 'x' }] } });
        return res.json({ motor: 'gemini', texto: r?.text, operacion: id });
      } catch {
        return res.json({ motor: 'respaldo', operacion: id });
      }
    });
  }
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  servidores.push(servidor);
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const rutaDe = (id: IdOperacionIA) => OPERACIONES_IA.find((o) => o.id === id)!.ruta;
  const llamar = (id: IdOperacionIA, cabeceras: Record<string, string> = {}, cuerpo: unknown = { prompt: 'x' }) =>
    fetch(`${base}${rutaDe(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabeceras },
      body: JSON.stringify(cuerpo),
    });
  const autenticado = (token: string, clave: string) => ({ Authorization: `Bearer ${token}`, 'Idempotency-Key': clave });
  return { nucleo, gobierno, registro, llamadas, ejecuciones, eventos, llamar, autenticado, base };
}

function desdeEntorno(entorno: NodeJS.ProcessEnv): { politica: PoliticaGobiernoIA; error?: string } {
  const resultado = politicaGobiernoIADesdeEntorno(entorno);
  if (resultado.estado === 'INVALIDA') throw new Error(`política de entorno inválida: ${resultado.error}`);
  return { politica: resultado.politica };
}

// ---------------------------------------------------------------------------
// A · Contrato de política: sin comodines, sin implícitos, sin ilimitados
// ---------------------------------------------------------------------------

describe('IA Fase 7 · contrato de política (explícito, completo y finito)', () => {
  it('la plantilla de referencia es válida, completa y cubre el catálogo entero', () => {
    const plantilla = construirPoliticaIACompleta();
    expect(validarPoliticaGobiernoIA(plantilla).estado).toBe('VALIDA');
    expect(politicaCompletaIA(plantilla)).toBe(true);
    expect(Object.keys(plantilla.permisos).sort()).toEqual([...TIPOS_PERFIL_IA].sort());
    expect(Object.keys(plantilla.costeCreditosPorOperacion)).toHaveLength(OPERACIONES_IA.length);
    for (const { id } of OPERACIONES_IA) {
      expect(Number.isInteger(plantilla.costeCreditosPorOperacion[id]), id).toBe(true);
      expect(plantilla.costeCreditosPorOperacion[id]).toBeGreaterThanOrEqual(0);
    }
    expect(Number.isInteger(plantilla.cuotas.operacionesPorDia)).toBe(true);
    expect(Number.isInteger(plantilla.cuotas.operacionesPorMes)).toBe(true);
    expect(plantilla.cuotas.operacionesPorDia).toBeGreaterThan(0);
    expect(plantilla.cuotas.operacionesPorMes).toBeGreaterThan(0);
    // Ninguna operación del catálogo queda sin dueño y ningún perfil queda sin declarar.
    for (const { id } of OPERACIONES_IA) {
      const perfiles = TIPOS_PERFIL_IA.filter((perfil) => permiteOperacion(plantilla, perfil, id));
      expect(perfiles.length, `sin perfil para ${id}`).toBeGreaterThan(0);
    }
    for (const perfil of TIPOS_PERFIL_IA) {
      for (const id of plantilla.permisos[perfil]) expect(OPERACIONES_IA_IDS).toContain(id);
    }
    // El comodín desaparece también de la serialización (lo que viaja en IA_POLITICA_JSON).
    expect(JSON.stringify(plantilla)).not.toContain('"*"');
  });

  it('el fichero de política de ejemplo versionado es válido y completo (misma matriz que la referencia)', () => {
    const crudo = JSON.parse(readFileSync(join(RAIZ, 'docs', 'politica-ia.ejemplo.json'), 'utf8'));
    const resultado = validarPoliticaGobiernoIA(crudo);
    expect(resultado.estado).toBe('VALIDA');
    if (resultado.estado !== 'VALIDA') return;
    expect(politicaCompletaIA(resultado.politica)).toBe(true);
    expect(resultado.politica).toEqual(construirPoliticaIACompleta());
    expect(resumenPoliticaGobiernoIA(resultado.politica).pendienteAprobacionComercial).toBe(false);
  });

  it('el comodín «*» ya no se admite en ninguna forma ni en ningún perfil', () => {
    const casos: unknown[] = [
      { permisos: { PROPIETARIO: '*' } },
      { permisos: { PROPIETARIO: ['*', 'REDACTAR_CLAUSULA'] } },
      construirPoliticaIACompleta({ permisos: { INQUILINO: ['*'] as never } }),
      { ...construirPoliticaIACompleta(), permisos: { ...construirPoliticaIACompleta().permisos, PROFESIONAL: '*' } },
    ];
    for (const crudo of casos) {
      const r = validarPoliticaGobiernoIA(crudo);
      expect(r.estado).toBe('INVALIDA');
      expect(r.estado === 'INVALIDA' && r.error).toMatch(/comodín|perfil desconocido/);
    }
  });

  it('una política parcial es INVÁLIDA: no hay permisos, tarifas ni cuotas heredados', () => {
    const completa = construirPoliticaIACompleta();
    const sinPerfiles = { ...completa } as Record<string, unknown>;
    delete sinPerfiles.permisos;
    const sinTarifas = { ...completa } as Record<string, unknown>;
    delete sinTarifas.costeCreditosPorOperacion;
    const sinCuotas = { ...completa } as Record<string, unknown>;
    delete sinCuotas.cuotas;
    const tablas: Array<{ caso: unknown; patron: RegExp }> = [
      { caso: sinPerfiles, patron: /permisos/i },
      { caso: sinTarifas, patron: /tarifa|costeCreditosPorOperacion/i },
      { caso: sinCuotas, patron: /cuotas/i },
      { caso: { ...completa, permisos: { PROPIETARIO: ['RECIBIR_INFORMACION'] } }, patron: /perfil desconocido|permisos/i },
      { caso: { ...completa, cuotas: { operacionesPorDia: null, operacionesPorMes: null } }, patron: /ilimitad/i },
      { caso: { ...completa, cuotas: { operacionesPorDia: 0 } }, patron: /cuotas/i },
      { caso: { ...completa, costeCreditosPorOperacion: { REDACTAR_CLAUSULA: 2 } }, patron: /tarifa/i },
    ];
    for (const { caso, patron } of tablas) {
      const r = validarPoliticaGobiernoIA(caso);
      expect(r.estado, JSON.stringify(caso).slice(0, 60)).toBe('INVALIDA');
      expect(r.estado === 'INVALIDA' && r.error).toMatch(patron);
    }
  });

  it('la tabla declarada en el repositorio no tiene huecos ni deriva respecto al catálogo', () => {
    // Si alguien añade una operación al catálogo sin declararla, esto falla (anti-deriva).
    expect(Object.keys(TARIFAS_IA_REFERENCIA)).toEqual([...OPERACIONES_IA_IDS]);
    expect(OPERACIONES_IA).toHaveLength(12);
    expect(OPERACIONES_IA_IDS).toHaveLength(12);
    expect(CUOTAS_IA_REFERENCIA.operacionesPorDia).toBeLessThan(CUOTAS_IA_REFERENCIA.operacionesPorMes);
    // Matriz de referencia documentada (mínimo privilegio, sin comodines).
    expect([...PERMISOS_IA_REFERENCIA.ADMINISTRADOR]).toEqual([...OPERACIONES_IA_IDS]);
    expect([...PERMISOS_IA_REFERENCIA.INQUILINO]).toEqual([OP_NUEVA, 'ASISTENTE_INTERPRETAR']);
    expect(PERMISOS_IA_REFERENCIA.PROFESIONAL).toContain('ANALIZAR_INSPECCION');
    expect(PERMISOS_IA_REFERENCIA.PROPIETARIO).toContain('ESTIMAR_PRICING');
    for (const perfil of TIPOS_PERFIL_IA) {
      expect([...PERMISOS_IA_REFERENCIA[perfil]].length).toBeGreaterThan(0);
    }
  });

  it('matriz completa 12 × 4: la concesión coincide EXACTAMENTE con la declarada', () => {
    const politica = construirPoliticaIACompleta({ permisos: { PROFESIONAL: [OP_HISTORICA] } });
    const declaradas = TIPOS_PERFIL_IA.flatMap((perfil) =>
      OPERACIONES_IA_IDS.map((id) => ({
        perfil,
        id,
        esperado: (politica.permisos[perfil] as readonly IdOperacionIA[]).includes(id),
        obtenido: permiteOperacion(politica, perfil, id),
      })),
    );
    expect(declaradas).toHaveLength(48);
    for (const combinacion of declaradas) {
      expect(combinacion.obtenido, `${combinacion.perfil} → ${combinacion.id}`).toBe(combinacion.esperado);
    }
    // Cobertura útil: el profesional sólo tiene su operación; el administrador, todas.
    expect(permiteOperacion(politica, 'PROFESIONAL', OP_HISTORICA)).toBe(true);
    expect(permiteOperacion(politica, 'PROFESIONAL', OP_NUEVA)).toBe(false);
    expect(OPERACIONES_IA_IDS.every((id) => permiteOperacion(politica, 'ADMINISTRADOR', id))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B · Las doce rutas del catálogo con la política aprobada
// ---------------------------------------------------------------------------

describe('IA Fase 7 · las doce operaciones por el núcleo real', () => {
  it('con la plantilla: ADMINISTRADOR ejecuta las 12; el inquilino sólo la suya (403 el resto)', async () => {
    const m = await montar({ politica: plantillaCosteCero() });
    for (const { id } of OPERACIONES_IA) {
      const r = await m.llamar(id, m.autenticado('token-admin', `f7-admin-${id.toLowerCase()}`));
      expect(r.status, `ADMINISTRADOR → ${id}`).toBe(200);
      expect((await r.json()).operacion).toBe(id);
    }
    expect(m.ejecuciones).toHaveLength(12);
    expect(m.llamadas).toHaveLength(12);

    const permitidasInquilino = new Set<IdOperacionIA>(['ASISTENTE_INTERPRETAR', OP_NUEVA]);
    for (const { id } of OPERACIONES_IA) {
      const r = await m.llamar(id, m.autenticado('token-inquilino', `f7-inq-${id.toLowerCase()}`));
      if (permitidasInquilino.has(id)) {
        expect(r.status, `INQUILINO → ${id}`).toBe(200);
      } else {
        expect(r.status, `INQUILINO → ${id}`).toBe(403);
        expect(await r.json()).toMatchObject({ codigo: 'OPERACION_NO_PERMITIDA' });
      }
    }
    // El proveedor sólo se llamó por lo permitido: 12 (admin) + 2 (inquilino).
    expect(m.llamadas).toHaveLength(14);
    expect(m.ejecuciones).toHaveLength(14);
    // El rechazo por permiso ocurre ANTES de abrir operación: sin traza en el registro…
    expect(m.registro.listar().every((r) => r.estado === 'COMPLETADA')).toBe(true);
    expect(m.registro.listar()).toHaveLength(14);
    // …pero sí queda en el log del núcleo, con el código y sin datos personales.
    const rechazos = m.eventos.filter((e) => e.evento === 'RECHAZADA');
    expect(rechazos).toHaveLength(10);
    for (const rechazo of rechazos) {
      expect(rechazo).toMatchObject({ codigo: 'OPERACION_NO_PERMITIDA', codigoHttp: 403 });
    }
    expect(JSON.stringify(rechazos)).not.toMatch(/Bearer|@example\.com/);
  });

  it('la operación nueva está en el catálogo con perímetro propio: INQUILINO y ADMINISTRADOR sí; PROPIETARIO y PROFESIONAL no', async () => {
    const m = await montar({ politica: plantillaCosteCero() });
    expect(OPERACIONES_IA.filter((o) => o.id === OP_NUEVA)).toHaveLength(1);
    expect(PERMISOS_IA_REFERENCIA.INQUILINO).toContain(OP_NUEVA);
    expect(PERMISOS_IA_REFERENCIA.ADMINISTRADOR).toContain(OP_NUEVA);
    expect(PERMISOS_IA_REFERENCIA.PROPIETARIO).not.toContain(OP_NUEVA);
    expect(PERMISOS_IA_REFERENCIA.PROFESIONAL).not.toContain(OP_NUEVA);

    expect((await m.llamar(OP_NUEVA, m.autenticado('token-inquilino', 'f7-nueva-inq-1'))).status).toBe(200);
    expect((await m.llamar(OP_NUEVA, m.autenticado('token-admin', 'f7-nueva-adm-1'))).status).toBe(200);
    const propietario = await m.llamar(OP_NUEVA, m.autenticado('token-propietario', 'f7-nueva-prop-1'));
    expect(propietario.status).toBe(403);
    expect(await propietario.json()).toMatchObject({ codigo: 'OPERACION_NO_PERMITIDA' });
    expect(m.llamadas).toHaveLength(2);
    // El administrador también puede la histórica; el propietario no puede la nueva.
    expect((await m.llamar(OP_HISTORICA, m.autenticado('token-admin', 'f7-hist-admin'))).status).toBe(200);
  });

  it('sin permiso no se llama al proveedor ni se ejecuta el manejador (403 antes de todo)', async () => {
    const m = await montar({ politica: construirPoliticaIACompleta({ permisos: { INQUILINO: [] } }) });
    const r = await m.llamar(OP_NUEVA, m.autenticado('token-inquilino', 'f7-denegado-01'));
    expect(r.status).toBe(403);
    expect(m.llamadas).toHaveLength(0);
    expect(m.ejecuciones).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C · Créditos, idempotencia, reembolso, cuotas y registro con tarifas finitas
// ---------------------------------------------------------------------------

describe('IA Fase 7 · créditos, idempotencia, reembolso y registro de consumo', () => {
  const tarifas = { [OP_NUEVA]: 2, [OP_HISTORICA]: 3 } as Partial<Record<IdOperacionIA, number>>;

  it('la operación nueva cobra su tarifa declarada y el registro lo refleja (lista blanca)', async () => {
    const m = await montar({ politica: construirPoliticaIACompleta({ costeCreditosPorOperacion: tarifas }) });
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-inquilino', adminUid: 'uid-admin', claveIdempotencia: 'f7-carga-1', creditos: 5, motivo: 'prueba', ahora: new Date() });
    const r = await m.llamar(OP_NUEVA, m.autenticado('token-inquilino', 'f7-cobra-nueva-01'));
    expect(r.status).toBe(200);
    const cuenta = await m.gobierno.cuenta('owner-uid-inquilino');
    expect(cuenta).toMatchObject({ saldoCreditos: 3, totalOperaciones: 1, totalCreditosConsumidos: 2, ventanaDiaUsos: 1, ventanaMesUsos: 1 });
    const [registro] = m.registro.listar();
    expect(registro).toMatchObject({ uid: 'uid-inquilino', operacion: OP_NUEVA, estado: 'COMPLETADA', codigoHttp: 200, costeCreditos: 2 });
    for (const clave of Object.keys(registro)) expect(CAMPOS_REGISTRO_IA).toContain(clave);
    expect(JSON.stringify(registro)).not.toMatch(/prompt|descripcion|email|Bearer/i);
  });

  it('la operación histórica conserva su tarifa (ANALIZAR_INCIDENCIA del profesional)', async () => {
    const m = await montar({ politica: construirPoliticaIACompleta({ costeCreditosPorOperacion: tarifas }) });
    expect((await m.llamar(OP_HISTORICA, m.autenticado('token-inquilino', 'f7-hist-sin-permiso'))).status).toBe(403); // el inquilino no puede
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-admin', adminUid: 'uid-admin', claveIdempotencia: 'f7-carga-2', creditos: 3, motivo: 'prueba', ahora: new Date() });
    const r = await m.llamar(OP_HISTORICA, m.autenticado('token-admin', 'f7-hist-admin-01'));
    expect(r.status).toBe(200);
    const cuenta = await m.gobierno.cuenta('owner-uid-admin');
    expect(cuenta).toMatchObject({ saldoCreditos: 0, totalCreditosConsumidos: 3 });
    expect(m.registro.listar()).toHaveLength(1);
    expect(m.registro.listar()[0]).toMatchObject({ operacion: OP_HISTORICA, uid: 'uid-admin', costeCreditos: 3, estado: 'COMPLETADA' });
  });

  it('misma clave de idempotencia ⇒ 409 OPERACION_DUPLICADA y un único descuento', async () => {
    const m = await montar({ politica: construirPoliticaIACompleta({ costeCreditosPorOperacion: tarifas }) });
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-inquilino', adminUid: 'uid-admin', claveIdempotencia: 'f7-carga-3', creditos: 5, motivo: 'prueba', ahora: new Date() });
    const cabeceras = m.autenticado('token-inquilino', 'f7-idempotente-01');
    const primera = await m.llamar(OP_NUEVA, cabeceras);
    const segunda = await m.llamar(OP_NUEVA, cabeceras);
    expect(primera.status).toBe(200);
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toMatchObject({ codigo: 'OPERACION_DUPLICADA', operacionId: primera.headers.get('x-ia-operacion-id') });
    const cuenta = await m.gobierno.cuenta('owner-uid-inquilino');
    expect(cuenta).toMatchObject({ saldoCreditos: 3, totalOperaciones: 1 });
    expect(m.registro.listar()).toHaveLength(1);
    expect(m.llamadas).toHaveLength(1);
  });

  it('proveedor sin éxito ⇒ reembolso íntegro de la tarifa declarada de la operación nueva', async () => {
    const { cliente } = proveedorFalso({ fallos: 5 });
    const m = await montar({ politica: construirPoliticaIACompleta({ costeCreditosPorOperacion: { [OP_NUEVA]: 3 } }), proveedor: cliente });
    await m.gobierno.ajustarCredito({ uid: 'owner-uid-inquilino', adminUid: 'uid-admin', claveIdempotencia: 'f7-carga-4', creditos: 3, motivo: 'prueba', ahora: new Date() });
    const r = await m.llamar(OP_NUEVA, m.autenticado('token-inquilino', 'f7-reembolso-01'));
    expect(r.status).toBe(200); // el manejador cae a su respaldo determinista
    const cuenta = await m.gobierno.cuenta('owner-uid-inquilino');
    expect(cuenta).toMatchObject({ saldoCreditos: 3, totalCreditosConsumidos: 0 });
    const [registro] = m.registro.listar();
    expect(registro).toMatchObject({ origenRespuesta: 'RESPALDO', costeCreditos: 3, creditosReembolsados: 3 });
  });

  it('cuotas FINITAS de la operación nueva: día 2 ⇒ tercera 429; mes 1 ⇒ segunda 429', async () => {
    const porDia = await montar({ politica: construirPoliticaIACompleta({ costeCreditosPorOperacion: COSTES_CERO, cuotas: { operacionesPorDia: 2 } }) });
    expect((await porDia.llamar(OP_NUEVA, porDia.autenticado('token-inquilino', 'f7-dia-1'))).status).toBe(200);
    expect((await porDia.llamar(OP_NUEVA, porDia.autenticado('token-inquilino', 'f7-dia-2'))).status).toBe(200);
    const tercera = await porDia.llamar(OP_NUEVA, porDia.autenticado('token-inquilino', 'f7-dia-3'));
    expect(tercera.status).toBe(429);
    expect(await tercera.json()).toMatchObject({ codigo: 'CUOTA_DIA_EXCEDIDA' });
    expect(porDia.llamadas).toHaveLength(2);

    const porMes = await montar({ politica: construirPoliticaIACompleta({ costeCreditosPorOperacion: COSTES_CERO, cuotas: { operacionesPorMes: 1 } }) });
    expect((await porMes.llamar(OP_NUEVA, porMes.autenticado('token-inquilino', 'f7-mes-1'))).status).toBe(200);
    const segunda = await porMes.llamar(OP_NUEVA, porMes.autenticado('token-inquilino', 'f7-mes-2'));
    expect(segunda.status).toBe(429);
    expect(await segunda.json()).toMatchObject({ codigo: 'CUOTA_MES_EXCEDIDA' });
  });

  it('cuenta bloqueada y aislamiento entre usuarios siguen intactos', async () => {
    const m = await montar({ politica: plantillaCosteCero() });
    await m.gobierno.bloquear({ uid: 'owner-uid-inquilino', adminUid: 'uid-admin', claveIdempotencia: 'f7-bloqueo-1', bloqueado: true, motivo: 'abuso', ahora: new Date() });
    const bloqueada = await m.llamar(OP_NUEVA, m.autenticado('token-inquilino', 'f7-bloq-1'));
    expect(bloqueada.status).toBe(403);
    expect(await bloqueada.json()).toMatchObject({ codigo: 'CUENTA_BLOQUEADA' });
    expect((await m.llamar(OP_NUEVA, m.autenticado('token-admin', 'f7-bloq-2'))).status).toBe(200);
    expect(m.llamadas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// D · Sin política completa NO se consume IA (configuración incompleta)
// ---------------------------------------------------------------------------

describe('IA Fase 7 · el consumo sigue desactivado sin política completa', () => {
  it('sin IA_POLITICA_JSON: 503 APROBACION_COMERCIAL_PENDIENTE en las 12 rutas y cero consumo', async () => {
    const m = await montar({ porDefecto: true });
    expect(m.nucleo.estado()).toMatchObject({ gobierno: 'MEMORIA', bloqueoComercial: 'APROBACION_PENDIENTE', operaciones: 12 });
    for (const { id } of OPERACIONES_IA) {
      const r = await m.llamar(id, m.autenticado('token-admin', `f7-bloqueo-${id.toLowerCase()}`));
      expect(r.status, `bloqueada → ${id}`).toBe(503);
      expect(await r.json()).toMatchObject({ codigo: 'APROBACION_COMERCIAL_PENDIENTE' });
    }
    expect(m.llamadas).toHaveLength(0);
    expect(m.ejecuciones).toHaveLength(0);
    expect(m.registro.listar()).toHaveLength(0);
  });

  it('IA_POLITICA_JSON con el formato antiguo (comodines y tarifa única) ⇒ INVÁLIDA y 503 POLITICA_IA_INVALIDA', async () => {
    // Es exactamente la política que viajaba en `.env.example` antes de la Fase 7.
    const antigua = '{"permisos":{"PROPIETARIO":"*"},"costeCreditosPorOperacion":{"ESTIMAR_PRICING":1},"cuotas":{"operacionesPorDia":50,"operacionesPorMes":1000}}';
    const resultado = politicaGobiernoIADesdeEntorno({ [VARIABLE_ENTORNO_POLITICA_IA]: antigua });
    expect(resultado.estado).toBe('INVALIDA');
    expect(resultado.estado === 'INVALIDA' && resultado.error).toMatch(/comodín|faltan perfiles|tarifa/i);

    const m = await montar({ politica: plantillaCosteCero(), errorGobierno: 'POLITICA_IA_INVALIDA' });
    for (const { id } of OPERACIONES_IA) {
      const r = await m.llamar(id, m.autenticado('token-admin', `f7-invalida-${id.toLowerCase()}`));
      expect(r.status, `política inválida → ${id}`).toBe(503);
      expect(await r.json()).toMatchObject({ codigo: 'POLITICA_IA_INVALIDA' });
    }
    expect(m.llamadas).toHaveLength(0);
    expect(m.registro.listar()).toHaveLength(0);
  });

  it('la variable de entorno SOLO habilita el consumo con la plantilla completa declarada', () => {
    const entornoConPlantilla = { [VARIABLE_ENTORNO_POLITICA_IA]: JSON.stringify(construirPoliticaIACompleta()) };
    const { politica } = desdeEntorno(entornoConPlantilla);
    expect(politica.origen).toBe('ENTORNO');
    expect(resumenPoliticaGobiernoIA(politica).pendienteAprobacionComercial).toBe(false);
    // Y sin la variable, el resumen sigue pendiente y sin permisos concedidos.
    const { politica: porDefecto } = desdeEntorno({});
    const resumen = resumenPoliticaGobiernoIA(porDefecto);
    expect(resumen.pendienteAprobacionComercial).toBe(true);
    expect(resumen.politicaCompleta).toBe(false);
    for (const { id } of OPERACIONES_IA) expect(resumen.perfilesPorOperacion[id]).toEqual([]);
  });
});
