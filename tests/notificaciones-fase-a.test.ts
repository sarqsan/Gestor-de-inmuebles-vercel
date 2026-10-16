/**
 * FASE A (2026-10-16) — AVISOS QUE DE VERDAD SALEN
 * ================================================
 * Puerta de salida de la fase, en local:
 *   · el transporte de correo REAL acepta/rechaza con causa y el MODO SEGURO
 *     nunca puede devolver `ok` (prohibido el falso «enviado»);
 *   · el endpoint de notificaciones monta verificador de token y fuente de
 *     perfil REALES (regresión del hallazgo A16-03);
 *   · el reloj diario emite la regla del día 5 al inquilino y al propietario,
 *     es idempotente, no toca los cobros y deja constancia de cada entrega;
 *   · el cron está protegido (CRON_SECRET) y declarado en `vercel.json`.
 */
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CanalEmail, EmailProviderSafeMode, EmailProviderHTTP } from '../src/notificaciones/canales';
import {
  crearTransporteEmailDesdeEntorno,
  identidadDespachoDesdeEntorno,
  RECETA_GMAIL_SMTP,
} from '../server/notificaciones/proveedoresEmail';
import { EmailProviderSMTP, enmascararCredenciales, type FabricaTransporteSmtp } from '../server/notificaciones/proveedorSmtp';
import { crearFuentePerfilFirestore, perfilDeTipoPerfil } from '../server/notificaciones/perfilUsuarioFirestore';
import { resolverAutorizacion } from '../src/notificaciones/autorizacion';
import { DispatcherNotificaciones } from '../src/notificaciones/dispatcher';
import type { EnviadorCanal, RepositorioNotificaciones } from '../src/notificaciones/dispatcher';
import { MAX_REINTENTOS } from '../src/notificaciones/dispatcher';
import {
  ejecutarRelojAvisos,
  periodoExigeAvisoDia5,
  ubicacionInmueble,
  TIPO_EVENTO_INQUILINO_DIA5,
  TIPO_EVENTO_PROPIETARIO_DIA5,
  type PuertoRelojAvisos,
} from '../server/notificaciones/relojAvisos';
import { montarRutaCronAvisos, RUTA_CRON_AVISOS } from '../server/notificaciones/rutasCronAvisos';
import type { Notificacion } from '../src/types/notificaciones';

const RAIZ = resolve(__dirname, '..');
const SERVER_SRC = readFileSync(join(RAIZ, 'server.ts'), 'utf8');
const CANALES_SRC = readFileSync(join(RAIZ, 'src/notificaciones/canales.ts'), 'utf8');
const VERCEL_JSON = JSON.parse(readFileSync(join(RAIZ, 'vercel.json'), 'utf8')) as {
  crons?: Array<{ path: string; schedule: string }>;
};

const AHORA = new Date('2026-03-10T09:00:00.000Z');

// ---------------------------------------------------------------------------
// Utilidades de prueba
// ---------------------------------------------------------------------------

class RepoMemoria implements RepositorioNotificaciones {
  store = new Map<string, Notificacion>();
  async buscarPorId(id: string) {
    return this.store.get(id) || null;
  }
  async buscarPorIdempotencia(key: string) {
    for (const n of this.store.values()) if (n.idempotencyKey === key) return n;
    return null;
  }
  async guardar(n: Notificacion) {
    this.store.set(n.id, n);
  }
}

class CanalEmailGrabador implements EnviadorCanal {
  readonly canal = 'EMAIL' as const;
  enviados: Notificacion[] = [];
  async enviar(n: Notificacion) {
    this.enviados.push(n);
    return { ok: true, provider: 'email', externalId: `ext-${n.id}`, enviadoEn: new Date().toISOString() };
  }
}

function dispatcherCon(canal: EnviadorCanal, repo: RepositorioNotificaciones): DispatcherNotificaciones {
  return new DispatcherNotificaciones({
    autorizacion: { perfil: 'SISTEMA' },
    repositorio: repo,
    canales: { EMAIL: canal, INAPP: null, WEBHOOK: null, WHATSAPP: null },
  });
}

type Fila = { id: string; datos: Record<string, unknown> };

function puertoFake(filas: { contratos?: Fila[]; notificaciones?: Fila[]; propietarios?: Record<string, Fila> }): PuertoRelojAvisos {
  return {
    async consultarIgualdadesOrden(coleccion, consulta) {
      let candidatas: Fila[] = [];
      if (coleccion === 'contratos_formalizacion') candidatas = filas.contratos || [];
      else if (coleccion === 'notificaciones') {
        const estado = consulta.igualdades?.find(([campo]) => campo === 'estado')?.[1];
        candidatas = (filas.notificaciones || []).filter((f) => !estado || f.datos.estado === estado);
      }
      return candidatas.slice(0, consulta.limite);
    },
    async leerDocumento(ruta) {
      const doc = filas.propietarios?.[ruta];
      return doc ? { datos: doc.datos } : null;
    },
  };
}

function notificacionProgramada(opciones: {
  id: string;
  clave: string;
  estado: Notificacion['estado'];
  programarPara?: string;
  intentos?: number;
}): Fila {
  const notificacion: Notificacion = {
    id: opciones.id,
    idempotencyKey: opciones.clave,
    tipo: 'cobro.proximo_vencimiento',
    origen: 'COBRO',
    canal: 'EMAIL',
    destinatario: { email: 'inquilino@ejemplo.es', nombre: 'Inquilino' },
    asunto: 'Prueba',
    plantilla: 'cobro.proximo_vencimiento',
    datos: {},
    entidadId: opciones.id,
    fechaCreacion: '2026-03-01T00:00:00.000Z',
    estado: opciones.estado,
    intentos: opciones.intentos ?? 0,
    ...(opciones.programarPara ? { programarPara: opciones.programarPara } : {}),
    audit: { eventos: [] },
  };
  return { id: notificacion.id, datos: notificacion as unknown as Record<string, unknown> };
}

/** Contrato con febrero pagado y marzo (vencido el día 5) sin cobrar. */
function contratoFixture(extra: Record<string, unknown> = {}): Fila {
  const datos: Record<string, unknown> = {
    id: 'ctr-1',
    inmuebleId: 'inm-1',
    propietarioId: 'prop-1',
    candidatoId: 'inq-1',
    inmuebleDireccion: 'Calle Prueba 1',
    inmuebleCiudad: 'Alicante',
    candidatoNombre: 'Ana Inquilina',
    candidatoDni: '00000000T',
    candidatoTelefono: '600000000',
    candidatoEmail: 'ana@ejemplo.es',
    propietarioNombre: 'Pablo Propietario',
    propietarioEmail: 'pablo@ejemplo.es',
    rentaMensual: 900,
    fianzaLegalMeses: 1,
    fianzaLegalImporte: 900,
    garantiaAdicionalMeses: 0,
    garantiaAdicionalImporte: 0,
    fechaInicioContrato: '2026-02-01',
    duracionAnios: 1,
    diaLimitePagoMes: 5,
    permitirMascotas: false,
    permitirSubarriendo: false,
    incluyeMueblesInventario: false,
    gastosComunidadCargo: 'arrendador',
    ibiCargo: 'arrendador',
    suministrosCargo: 'arrendatario',
    clausulaDesistimientoAnticipado: false,
    clausulasPersonalizadas: [],
    registroCobros: [
      {
        id: 'cobro_ctr-1_2026_02',
        inmuebleId: 'inm-1',
        contratoId: 'ctr-1',
        inquilinoId: 'inq-1',
        propietarioId: 'prop-1',
        inmuebleDireccion: 'Calle Prueba 1',
        inquilinoNombre: 'Ana Inquilina',
        inquilinoEmail: 'ana@ejemplo.es',
        periodoMesAnio: '2026-02',
        mes: 2,
        anio: 2026,
        nombreMes: 'Febrero 2026',
        importePrevisto: 900,
        importeRecibido: 900,
        fechaVencimiento: '2026-02-05',
        fechaPago: '2026-02-04',
        estado: 'RECIBIDO',
        historialCambios: [],
      },
    ],
    ...extra,
  };
  return { id: String(datos.id), datos };
}

// ---------------------------------------------------------------------------
// 1. Transporte de correo
// ---------------------------------------------------------------------------

describe('A · transporte de correo: real y seguro', () => {
  it('sin variables de proveedor el canal queda en MODO SEGURO y NO envía', async () => {
    const transporte = crearTransporteEmailDesdeEntorno({});
    expect(transporte.modo).toBe('MODO_SEGURO');
    const resultado = await transporte.provider.enviar({ to: 'a@b.es', subject: 'x', body: 'y' });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBeTruthy();
  });

  it('ENABLE_EMAIL=true sin proveedor real ya NO puede simular un envío', async () => {
    const transporte = crearTransporteEmailDesdeEntorno({ ENABLE_EMAIL: 'true' });
    expect(transporte.modo).toBe('MODO_SEGURO');
    const resultado = await transporte.provider.enviar({ to: 'a@b.es', subject: 'x', body: 'y' });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain('modo_seguro');
    expect(resultado.externalId).toBeUndefined();
  });

  it('el modo seguro nunca devuelve ok, ni activo ni inactivo', async () => {
    for (const activo of [true, false]) {
      const resultado = await new EmailProviderSafeMode({ activo }).enviar({ to: 'a@b.es', subject: 'x', body: 'y' });
      expect(resultado.ok).toBe(false);
    }
    // El código fuente ya no puede generar ids `safe-*` que aparenten envío.
    expect(CANALES_SRC).not.toContain('safe-${');
  });

  it('RESEND real: acepta con id externo y llama al endpoint correcto', async () => {
    const llamadas: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFalso = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'resend-123' }),
        headers: { get: () => null },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const transporte = crearTransporteEmailDesdeEntorno(
      { EMAIL_PROVEEDOR: 'RESEND', RESEND_API_KEY: 'clave-secreta', EMAIL_FROM: 'avisos@mi.es' },
      fetchFalso,
    );
    expect(transporte.modo).toBe('REAL');
    expect(transporte.detalle).not.toContain('clave-secreta');

    const resultado = await transporte.provider.enviar({ to: 'ana@ejemplo.es', subject: 'Asunto', body: 'Cuerpo' });
    expect(resultado.ok).toBe(true);
    expect(resultado.externalId).toBe('resend-123');
    expect(llamadas[0].url).toBe('https://api.resend.com/emails');
    expect(String(llamadas[0].init?.body)).toContain('ana@ejemplo.es');
  });

  it('RESEND real: un rechazo del proveedor es un fallo explícito (nunca ok)', async () => {
    const fetchFalso = (async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      headers: { get: () => null },
    })) as unknown as typeof fetch;
    const transporte = crearTransporteEmailDesdeEntorno(
      { EMAIL_PROVEEDOR: 'RESEND', RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.es' },
      fetchFalso,
    );
    const resultado = await transporte.provider.enviar({ to: 'x@y.es', subject: 's', body: 'b' });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toBe('resend_http_500');
  });

  it('SENDGRID real: 2xx con x-message-id queda trazado', async () => {
    const fetchFalso = (async () => ({
      ok: true,
      status: 202,
      json: async () => ({}),
      headers: { get: (nombre: string) => (nombre.toLowerCase() === 'x-message-id' ? 'sg-999' : null) },
    })) as unknown as typeof fetch;
    const transporte = crearTransporteEmailDesdeEntorno(
      { EMAIL_PROVEEDOR: 'SENDGRID', SENDGRID_API_KEY: 'k', EMAIL_FROM: 'a@b.es' },
      fetchFalso,
    );
    expect(transporte.modo).toBe('REAL');
    const resultado = await transporte.provider.enviar({ to: 'x@y.es', subject: 's', body: 'b' });
    expect(resultado).toEqual({ ok: true, externalId: 'sg-999' });
  });

  it('EmailProviderHTTP sin credenciales no envía', async () => {
    const provider = new EmailProviderHTTP({ proveedor: 'RESEND', apiKey: '', from: '' });
    const resultado = await provider.enviar({ to: 'x@y.es', subject: 's', body: 'b' });
    expect(resultado).toEqual({ ok: false, error: 'proveedor_email_sin_credenciales' });
  });
});

// ---------------------------------------------------------------------------
// 2. Autorización del endpoint (A16-03)
// ---------------------------------------------------------------------------

describe('B · autorización real del endpoint de notificaciones', () => {
  it('server.ts monta verificador de token y fuente de perfil (sin dependencias undefined)', () => {
    expect(SERVER_SRC).toContain('resolverAutorizacion(req.headers.authorization, verificadorTokenNotificaciones, fuentePerfilNotificaciones())');
    expect(SERVER_SRC).not.toMatch(/noVerificador|noFuente/);
    expect(SERVER_SRC).toContain('crearFuentePerfilFirestore(dependenciasIA.firestore)');
    expect(SERVER_SRC).toContain('crearTransporteEmailDesdeEntorno()');
  });

  it('un token verificado con perfil ACTIVO se autoriza; el resto se deniega', async () => {
    const verificador = { verificar: async (token: string) => (token === 'token-bueno' ? 'uid-1' : null) };
    const fuente = {
      resolver: async (uid: string) =>
        uid === 'uid-1' ? { uid, perfil: 'PROPIETARIO' as const, propietarioId: 'prop-1', inmuebleIds: ['inm-1'] } : null,
    };
    const ok = await resolverAutorizacion('Bearer token-bueno', verificador, fuente);
    expect(ok).toEqual({ perfil: 'PROPIETARIO', uid: 'uid-1', propietarioId: 'prop-1', profesionalId: undefined, inmuebleIds: ['inm-1'] });

    const malo = await resolverAutorizacion('Bearer token-malo', verificador, fuente);
    expect(malo).toEqual({ perfil: null });
    const anonimo = await resolverAutorizacion(undefined, verificador, fuente);
    expect(anonimo).toEqual({ perfil: null });
  });

  it('la fuente de perfil exige estado ACTIVO y perfil notificable', async () => {
    const puerto = (filas: Fila[]) => ({
      async consultarIgualdadesOrden() {
        return filas;
      },
    });
    const fuente = crearFuentePerfilFirestore(puerto([
      { id: 'u1', datos: { authUid: 'uid-1', estado: 'ACTIVO', tipoPerfil: 'PROPIETARIO', propietarioId: 'prop-1', inmuebleIds: ['inm-1'] } },
    ]));
    const resuelto = await fuente.resolver('uid-1');
    expect(resuelto?.perfil).toBe('PROPIETARIO');
    expect(resuelto?.propietarioId).toBe('prop-1');
    expect(resuelto?.inmuebleIds).toEqual(['inm-1']);

    const pendiente = crearFuentePerfilFirestore(puerto([
      { id: 'u2', datos: { authUid: 'uid-2', estado: 'PENDIENTE', tipoPerfil: 'PROPIETARIO' } },
    ]));
    expect(await pendiente.resolver('uid-2')).toBeNull();

    const inquilino = crearFuentePerfilFirestore(puerto([
      { id: 'u3', datos: { authUid: 'uid-3', estado: 'ACTIVO', tipoPerfil: 'INQUILINO' } },
    ]));
    expect(await inquilino.resolver('uid-3')).toBeNull();
    expect(perfilDeTipoPerfil('ADMINISTRADOR')).toBe('ADMINISTRADOR');
    expect(perfilDeTipoPerfil('desconocido')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Reloj diario: regla del día 5 e idempotencia
// ---------------------------------------------------------------------------

describe('C · reloj diario de avisos', () => {
  it('la regla del día 5 exige vencimiento pasado y saldo pendiente', () => {
    const base = {
      id: 'p1',
      importePrevisto: 900,
      importeRecibido: 0,
      estado: 'PENDIENTE' as const,
      fechaVencimiento: '2026-03-05',
    };
    expect(periodoExigeAvisoDia5({ ...base } as never, new Date('2026-03-05T09:00:00Z'))).toBe(false);
    expect(periodoExigeAvisoDia5({ ...base } as never, new Date('2026-03-06T09:00:00Z'))).toBe(true);
    expect(periodoExigeAvisoDia5({ ...base, importeRecibido: 900 } as never, new Date('2026-03-06T09:00:00Z'))).toBe(false);
    expect(periodoExigeAvisoDia5({ ...base, estado: 'VERIFICADO' } as never, new Date('2026-03-06T09:00:00Z'))).toBe(false);
  });

  it('emite aviso al inquilino y al propietario una sola vez (idempotente)', async () => {
    const repo = new RepoMemoria();
    const canal = new CanalEmailGrabador();
    const puerto = puertoFake({
      contratos: [contratoFixture()],
      propietarios: { 'propietarios/prop-1': { id: 'prop-1', datos: { nombre: 'Pablo Propietario', email: 'pablo@ejemplo.es' } } },
    });

    const primera = await ejecutarRelojAvisos({
      ahora: AHORA,
      puerto,
      crearDispatcher: () => dispatcherCon(canal, repo),
      origen: 'PRUEBA',
    });

    expect(primera.errores).toEqual([]);
    expect(primera.contratosRevisados).toBe(1);
    // Febrero está cobrado; solo marzo (vencido el día 5) genera avisos.
    const tipos = primera.emitidos.map((e) => e.tipoEvento).sort();
    expect(tipos).toEqual([TIPO_EVENTO_INQUILINO_DIA5, TIPO_EVENTO_PROPIETARIO_DIA5].sort());
    expect(primera.emitidos.every((e) => e.entregada)).toBe(true);
    expect(canal.enviados).toHaveLength(2);
    const asuntoInquilino = canal.enviados.find((n) => n.tipo === TIPO_EVENTO_INQUILINO_DIA5)?.asunto || '';
    expect(asuntoInquilino).toContain('Calle Prueba 1');
    const asuntoPropietario = canal.enviados.find((n) => n.tipo === TIPO_EVENTO_PROPIETARIO_DIA5)?.asunto || '';
    expect(asuntoPropietario).toContain('Renta no cobrada');

    // Segunda pasada del mismo día: no reenvía nada nuevo.
    const segunda = await ejecutarRelojAvisos({
      ahora: AHORA,
      puerto,
      crearDispatcher: () => dispatcherCon(canal, repo),
      origen: 'PRUEBA',
    });
    expect(segunda.emitidos.every((e) => e.duplicada)).toBe(true);
    expect(canal.enviados).toHaveLength(2);
  });

  it('sin transporte real los avisos quedan FALLIDA: jamás un falso enviado', async () => {
    const repo = new RepoMemoria();
    const puerto = puertoFake({
      contratos: [contratoFixture()],
      propietarios: { 'propietarios/prop-1': { id: 'prop-1', datos: { email: 'pablo@ejemplo.es' } } },
    });
    const dispatcherSeguro = new DispatcherNotificaciones({
      autorizacion: { perfil: 'SISTEMA' },
      repositorio: repo,
      canales: { EMAIL: { canal: 'EMAIL', enviar: async () => ({ ok: false, provider: 'email', error: 'modo_seguro_activo' }) }, INAPP: null, WEBHOOK: null, WHATSAPP: null },
    });

    const resumen = await ejecutarRelojAvisos({ ahora: AHORA, puerto, crearDispatcher: () => dispatcherSeguro });
    expect(resumen.emitidos).toHaveLength(2);
    expect(resumen.emitidos.every((e) => !e.entregada && e.estado === 'FALLIDA')).toBe(true);
  });

  it('sin contacto de email no se afirma nada: queda registrado como no emitido', async () => {
    const repo = new RepoMemoria();
    const canal = new CanalEmailGrabador();
    const contrato = contratoFixture({
      id: 'ctr-2',
      candidatoEmail: '',
      propietarioEmail: '',
      registroCobros: [],
    });
    const resumen = await ejecutarRelojAvisos({
      ahora: AHORA,
      puerto: puertoFake({ contratos: [contrato] }),
      crearDispatcher: () => dispatcherCon(canal, repo),
    });
    expect(resumen.emitidos).toHaveLength(0);
    // Febrero y marzo (ambos vencidos y sin cobrar) × (inquilino + propietario).
    expect(resumen.noEmitidos).toHaveLength(4);
    expect(resumen.noEmitidos.every((n) => n.motivo === 'sin_email_contacto')).toBe(true);
    expect(canal.enviados).toHaveLength(0);
  });

  it('procesa programadas vencidas, pendientes y fallidas con reintentos disponibles', async () => {
    const repo = new RepoMemoria();
    const canal = new CanalEmailGrabador();
    const programada = notificacionProgramada({
      id: 'not_prog',
      clave: 'ev:cobro:prog',
      estado: 'PROGRAMADA',
      programarPara: '2026-03-09T06:00:00.000Z',
    });
    const futura = notificacionProgramada({
      id: 'not_futura',
      clave: 'ev:cobro:futura',
      estado: 'PROGRAMADA',
      programarPara: '2026-03-20T06:00:00.000Z',
    });
    const agotada = notificacionProgramada({
      id: 'not_agotada',
      clave: 'ev:cobro:agotada',
      estado: 'FALLIDA',
      intentos: MAX_REINTENTOS,
    });
    const puerto = puertoFake({
      notificaciones: [
        { id: 'not_prog', datos: { ...programada.datos } },
        { id: 'not_futura', datos: { ...futura.datos } },
        { id: 'not_agotada', datos: { ...agotada.datos } },
      ],
      contratos: [],
    });

    const resumen = await ejecutarRelojAvisos({ ahora: AHORA, puerto, crearDispatcher: () => dispatcherCon(canal, repo) });
    expect(resumen.pendientesProcesadas).toBe(1);
    expect(resumen.pendientesEntregadas).toBe(1);
    expect(canal.enviados.map((n) => n.id)).toEqual(['not_prog']);
  });

  it('marca el truncamiento cuando la consulta alcanza el tope', async () => {
    const repo = new RepoMemoria();
    const canal = new CanalEmailGrabador();
    const contratos = [contratoFixture()];
    const resumen = await ejecutarRelojAvisos({
      ahora: AHORA,
      puerto: puertoFake({ contratos }),
      crearDispatcher: () => dispatcherCon(canal, repo),
      limiteColeccion: 1,
    });
    expect(resumen.consultaTruncada).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Endpoint del cron
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// A ter · el mensaje identifica el inmueble (sin datos sensibles) y la
// respuesta va al propietario
// ---------------------------------------------------------------------------

describe('A ter · identificación del aviso y respuesta al propietario', () => {
  const IDENTIDAD = { nombre: 'Despacho Prueba', contacto: 'despacho@ejemplo.es' };

  async function avisosDelDia5() {
    const repo = new RepoMemoria();
    const canal = new CanalEmailGrabador();
    const puerto = puertoFake({
      contratos: [contratoFixture()],
      propietarios: { 'propietarios/prop-1': { id: 'prop-1', datos: { nombre: 'Pablo Propietario', email: 'pablo@ejemplo.es' } } },
    });
    const resumen = await ejecutarRelojAvisos({
      ahora: AHORA,
      puerto,
      crearDispatcher: () => dispatcherCon(canal, repo),
      identidadDespacho: IDENTIDAD,
      origen: 'PRUEBA',
    });
    return { resumen, canal };
  }

  it('el aviso al inquilino identifica inmueble, propietario, contrato y quién escribe', async () => {
    const { resumen, canal } = await avisosDelDia5();
    expect(resumen.errores).toEqual([]);
    const inquilino = canal.enviados.find((n) => n.tipo === TIPO_EVENTO_INQUILINO_DIA5)!;
    // El CUERPO se envía renderizado (ya no va la clave de la plantilla).
    expect(inquilino.cuerpo).toBeTruthy();
    expect(inquilino.cuerpo).not.toContain('cobro.retraso_pago');
    expect(inquilino.cuerpo).toContain('Calle Prueba 1, Alicante');
    expect(inquilino.cuerpo).toContain('Pablo Propietario');
    expect(inquilino.cuerpo).toContain('Despacho Prueba');
    expect(inquilino.cuerpo).toContain('ctr-1');
    expect(inquilino.cuerpo).toContain('900.00');
    // Enlaces y props sin resolver no deben quedar en el texto.
    expect(inquilino.cuerpo).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(inquilino.asunto).toContain('Calle Prueba 1');
  });

  it('ningún aviso filtra datos sensibles (DNI, IBAN, teléfono)', async () => {
    const { canal } = await avisosDelDia5();
    for (const aviso of canal.enviados) {
      const texto = `${aviso.asunto}\n${aviso.cuerpo}`;
      expect(texto).not.toContain('00000000T'); // DNI del inquilino (fixture)
      expect(texto).not.toContain('600000000'); // teléfono del inquilino (fixture)
      expect(texto).not.toMatch(/ES\d{2}[\s\d]{10,}/); // IBAN
      expect(texto).not.toContain('Referencia catastral');
    }
  });

  it('el inquilino responde al PROPIETARIO y el propietario al despacho (Reply-To)', async () => {
    const { canal } = await avisosDelDia5();
    const inquilino = canal.enviados.find((n) => n.tipo === TIPO_EVENTO_INQUILINO_DIA5)!;
    const propietario = canal.enviados.find((n) => n.tipo === TIPO_EVENTO_PROPIETARIO_DIA5)!;
    expect(inquilino.responderA).toBe('pablo@ejemplo.es');
    expect(propietario.responderA).toBe('despacho@ejemplo.es');
    // El remitente NO cambia: sigue siendo el buzón único de la plataforma.
    expect(inquilino.destinatario.email).toBe('ana@ejemplo.es');
  });

  it('sin contacto del propietario el aviso sale igual, con el buzón del despacho', async () => {
    const repo = new RepoMemoria();
    const canal = new CanalEmailGrabador();
    const puerto = puertoFake({ contratos: [contratoFixture()], propietarios: {} });
    await ejecutarRelojAvisos({
      ahora: AHORA,
      puerto,
      crearDispatcher: () => dispatcherCon(canal, repo),
      identidadDespacho: IDENTIDAD,
      origen: 'PRUEBA',
    });
    const inquilino = canal.enviados.find((n) => n.tipo === TIPO_EVENTO_INQUILINO_DIA5);
    // El propietario cae al email desnormalizado del contrato (fixture: pablo@).
    expect(inquilino?.responderA).toBe('pablo@ejemplo.es');
  });

  it('el canal EMAIL envía el texto renderizado y falla en claro si falta', async () => {
    const capturado: Array<{ to: string; subject: string; body: string; replyTo?: string }> = [];
    const canalEmail = new CanalEmail({
      async enviar(message) {
        capturado.push(message);
        return { ok: true, externalId: 'ext-1' };
      },
    });
    const base = { id: 'n1', asunto: 'Asunto', plantilla: 'cobro.retraso_pago', destinatario: { email: 'ana@ejemplo.es' } };
    const conCuerpo = await canalEmail.enviar({
      ...base,
      cuerpo: 'Texto del aviso',
      responderA: 'pablo@ejemplo.es',
    } as unknown as Notificacion);
    expect(conCuerpo.ok).toBe(true);
    expect(capturado[0].body).toBe('Texto del aviso');
    expect(capturado[0].replyTo).toBe('pablo@ejemplo.es');

    const sinCuerpo = await canalEmail.enviar({ ...base } as unknown as Notificacion);
    expect(sinCuerpo.ok).toBe(false);
    expect(sinCuerpo.error).toContain('cuerpo_no_renderizado');
    expect(capturado).toHaveLength(1);
  });

  it('un Reply-To con forma inválida no se envía como cabecera', async () => {
    const capturado: Array<{ replyTo?: string }> = [];
    const canalEmail = new CanalEmail({
      async enviar(message) {
        capturado.push(message);
        return { ok: true };
      },
    });
    await canalEmail.enviar({
      id: 'n2',
      asunto: 'Asunto',
      cuerpo: 'Texto',
      plantilla: 'cobro.retraso_pago',
      destinatario: { email: 'ana@ejemplo.es' },
      responderA: 'no-es-un-email',
    } as unknown as Notificacion);
    expect(capturado[0].replyTo).toBeUndefined();
  });

  it('SMTP envía la cabecera Reply-To (y no la inventa si no hay dirección)', async () => {
    const opciones: Array<{ from: string; to: string; subject: string; text: string; replyTo?: string }> = [];
    const fabrica: FabricaTransporteSmtp = () => ({
      async sendMail(o) {
        opciones.push(o);
        return { messageId: 'mid-1' };
      },
    });
    const proveedor = new EmailProviderSMTP(
      { url: 'smtps://cuenta%40gmail.com:clave@smtp.gmail.com:465', from: 'Despacho <cuenta@gmail.com>' },
      fabrica,
    );
    await proveedor.enviar({ to: 'ana@ejemplo.es', subject: 's', body: 'b', replyTo: 'pablo@ejemplo.es' });
    expect(opciones[0].replyTo).toBe('pablo@ejemplo.es');
    await proveedor.enviar({ to: 'ana@ejemplo.es', subject: 's', body: 'b' });
    expect(opciones[1].replyTo).toBeUndefined();
  });

  it('el proveedor HTTP (Resend/SendGrid) traduce el Reply-To a su campo', async () => {
    const cuerpos: Array<Record<string, unknown>> = [];
    const fetchFalso = (async (_url: string, init?: { body?: string }) => {
      cuerpos.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 'r-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const resend = new EmailProviderHTTP({
      proveedor: 'RESEND',
      apiKey: 'k',
      from: 'Despacho <cuenta@gmail.com>',
      replyTo: 'despacho@ejemplo.es',
      fetchImpl: fetchFalso,
    });
    await resend.enviar({ to: 'ana@ejemplo.es', subject: 's', body: 'b' });
    expect(cuerpos[0].reply_to).toBe('despacho@ejemplo.es');
  });

  it('la identidad del despacho sale del entorno sin exponer credenciales', async () => {
    const identidad = identidadDespachoDesdeEntorno({
      EMAIL_FROM: 'Gestor de Inmuebles <avisos@gmail.com>',
      EMAIL_REPLY_TO: 'respuestas@tudominio.es',
      SMTP_URL: 'smtps://cuenta:clave@smtp.gmail.com:465',
    });
    expect(identidad).toEqual({ nombre: 'Gestor de Inmuebles', contacto: 'respuestas@tudominio.es' });
    expect(JSON.stringify(identidad)).not.toContain('clave');

    // Sin EMAIL_REPLY_TO el contacto es el propio buzón remitente; y el nombre
    // tiene un valor por defecto legible si EMAIL_FROM es solo una dirección.
    const minimo = identidadDespachoDesdeEntorno({ EMAIL_FROM: 'avisos@gmail.com' });
    expect(minimo.contacto).toBe('avisos@gmail.com');
    expect(minimo.nombre).toBe('Gestión de alquileres');
  });

  it('la ubicación del inmueble se compone sin huecos', () => {
    expect(ubicacionInmueble({ direccion: 'Calle Prueba 1', ciudad: 'Alicante', codigoPostal: '03001' }))
      .toBe('Calle Prueba 1, 03001 Alicante');
    expect(ubicacionInmueble({ direccion: 'Calle Prueba 1' })).toBe('Calle Prueba 1');
    expect(ubicacionInmueble({})).toBe('el inmueble');
  });
});

describe('D · endpoint protegido del cron', () => {
  let servidor: Server;
  let base: string;
  const resumenVacio = {
    fecha: AHORA.toISOString(),
    origen: 'CRON',
    pendientesProcesadas: 0,
    pendientesEntregadas: 0,
    pendientesFallidas: 0,
    contratosRevisados: 0,
    consultaTruncada: false,
    emitidos: [],
    noEmitidos: [],
    errores: [],
  };

  beforeAll(async () => {
    const app = express();
    montarRutaCronAvisos(app, { secreto: 'secreto-de-prueba', ejecutar: async () => resumenVacio });
    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    servidor.close();
    await once(servidor, 'close');
  });

  it('sin CRON_SECRET no se ejecuta nada (503)', async () => {
    const app = express();
    montarRutaCronAvisos(app, { secreto: null, ejecutar: async () => resumenVacio });
    const local = app.listen(0, '127.0.0.1');
    await once(local, 'listening');
    const puerto = (local.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${puerto}${RUTA_CRON_AVISOS}`);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe('cron_no_configurado');
    local.close();
    await once(local, 'close');
  });

  it('secreto inválido o ausente → 401', async () => {
    const sinSecreto = await fetch(`${base}${RUTA_CRON_AVISOS}`);
    expect(sinSecreto.status).toBe(401);
    const malo = await fetch(`${base}${RUTA_CRON_AVISOS}`, { headers: { Authorization: 'Bearer otro' } });
    expect(malo.status).toBe(401);
  });

  it('con el secreto correcto devuelve el resumen trazable y contadores', async () => {
    const r = await fetch(`${base}${RUTA_CRON_AVISOS}`, { headers: { Authorization: 'Bearer secreto-de-prueba' } });
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.contratosRevisados).toBe(0);
    expect(cuerpo.entregadas).toBe(0);
    expect(cuerpo.duplicadas).toBe(0);
    expect(cuerpo.fallidas).toBe(0);
  });

  it('acepta la ejecución manual por query (?secret=)', async () => {
    const r = await fetch(`${base}${RUTA_CRON_AVISOS}?secret=secreto-de-prueba`);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  it('sin credencial de servicio el endpoint responde 503 reloj_no_disponible', async () => {
    const app = express();
    montarRutaCronAvisos(app, { secreto: 's', ejecutar: null, motivoNoDisponible: 'sin Firestore' });
    const local = app.listen(0, '127.0.0.1');
    await once(local, 'listening');
    const r = await fetch(`http://127.0.0.1:${(local.address() as AddressInfo).port}${RUTA_CRON_AVISOS}?secret=s`);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe('reloj_no_disponible');
    local.close();
    await once(local, 'close');
  });

  it('el cron está declarado en vercel.json y el reloj nunca marca cobros', () => {
    expect(VERCEL_JSON.crons).toEqual([{ path: RUTA_CRON_AVISOS, schedule: '0 6 * * *' }]);
    expect(SERVER_SRC).toContain('montarRutaCronAvisos(app');
    expect(SERVER_SRC).toContain("perfil: 'SISTEMA'");
    // El reloj avisa; el cobro solo se registra por la vía canónica.
    const relojSrc = readFileSync(join(RAIZ, 'server/notificaciones/relojAvisos.ts'), 'utf8');
    expect(relojSrc).not.toMatch(/registrarPagoPeriodo\s*\(/);
  });
});

// ---------------------------------------------------------------------------
// 1.bis SMTP (Gmail) — transporte real del servidor
// ---------------------------------------------------------------------------

const URL_SMTP_PRUEBA = 'smtps://despacho%40gmail.com:contrasena_16_chars@smtp.gmail.com:465';

function fabricaSmtpFalsa(comportamiento: { messageId?: string; error?: string }): {
  fabrica: FabricaTransporteSmtp;
  enviados: Array<{ from: string; to: string; subject: string; text: string }>;
} {
  const enviados: Array<{ from: string; to: string; subject: string; text: string }> = [];
  const fabrica: FabricaTransporteSmtp = () => ({
    async sendMail(opciones) {
      enviados.push(opciones);
      if (comportamiento.error) throw new Error(comportamiento.error);
      return { messageId: comportamiento.messageId };
    },
  });
  return { fabrica, enviados };
}

describe('A bis · SMTP de Gmail: el envío real del despacho', () => {
  it('EMAIL_PROVEEDOR=SMTP con URL y remitente deja el transporte en REAL y entrega', async () => {
    const { fabrica, enviados } = fabricaSmtpFalsa({ messageId: '<gmail-1@mail.gmail.com>' });
    const transporte = crearTransporteEmailDesdeEntorno(
      { EMAIL_PROVEEDOR: 'SMTP', SMTP_URL: URL_SMTP_PRUEBA, EMAIL_FROM: 'Despacho <despacho@gmail.com>' },
      undefined,
      fabrica,
    );
    expect(transporte.modo).toBe('REAL');
    expect(transporte.proveedor).toBe('SMTP');

    const resultado = await transporte.provider.enviar({ to: 'propietario@ejemplo.es', subject: 'Renta no cobrada', body: 'Detalle' });
    expect(resultado.ok).toBe(true);
    expect(resultado.externalId).toBe('<gmail-1@mail.gmail.com>');
    expect(enviados).toHaveLength(1);
    expect(enviados[0].from).toContain('despacho@gmail.com');
  });

  it('SMTP_URL presente sin declarar proveedor también usa SMTP (receta Gmail)', async () => {
    const { fabrica } = fabricaSmtpFalsa({ messageId: 'x' });
    const transporte = crearTransporteEmailDesdeEntorno({ SMTP_URL: RECETA_GMAIL_SMTP, EMAIL_FROM: 'a@b.es' }, undefined, fabrica);
    expect(transporte.modo).toBe('REAL');
    expect(transporte.proveedor).toBe('SMTP');
  });

  it('SMTP declarado sin URL cae en MODO SEGURO (nunca finge envío)', async () => {
    const transporte = crearTransporteEmailDesdeEntorno({ EMAIL_PROVEEDOR: 'SMTP', EMAIL_FROM: 'a@b.es' });
    expect(transporte.modo).toBe('MODO_SEGURO');
    const resultado = await transporte.provider.enviar({ to: 'x@y.es', subject: 's', body: 'b' });
    expect(resultado.ok).toBe(false);
  });

  it('un fallo de SMTP es explícito y NUNCA filtra la contraseña de aplicación', async () => {
    const { fabrica } = fabricaSmtpFalsa({ error: `Invalid login at ${URL_SMTP_PRUEBA}` });
    const provider = new EmailProviderSMTP({ url: URL_SMTP_PRUEBA, from: 'a@b.es' }, fabrica);
    const resultado = await provider.enviar({ to: 'x@y.es', subject: 's', body: 'b' });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain('smtp_error');
    expect(resultado.error).not.toContain('contrasena_16_chars');
    expect(resultado.error).toContain('smtp.gmail.com');
    expect(enmascararCredenciales('smtps://u:p@h:465 no')).toBe('smtps://***@h:465 no');
    // También con el usuario sin codificar (`@` literal) y en la receta pública.
    expect(enmascararCredenciales('smtps://u@gmail.com:p@h:465 no')).toBe('smtps://***@h:465 no');
    expect(enmascararCredenciales(RECETA_GMAIL_SMTP)).not.toContain('CONTRASENA_DE_APLICACION');
  });

  it('sin URL ni remitente el proveedor SMTP no envía', async () => {
    const provider = new EmailProviderSMTP({ url: '', from: '' });
    expect(await provider.enviar({ to: 'x@y.es', subject: 's', body: 'b' })).toEqual({ ok: false, error: 'smtp_sin_credenciales' });
  });

  it('la receta de Gmail documentada es la esperada', () => {
    expect(RECETA_GMAIL_SMTP).toBe('smtps://cuenta@gmail.com:CONTRASENA_DE_APLICACION@smtp.gmail.com:465');
  });
});
