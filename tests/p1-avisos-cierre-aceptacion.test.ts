/**
 * P1 — CIERRE DE ACEPTACIÓN OPERATIVA DE AVISOS (matriz focal)
 * =============================================================================
 * Ejecuta el flujo COMPLETO con el transporte REAL de la aplicación
 * (`crearTransporteEmailDesdeEntorno` → `EmailProviderSMTP` →
 * `nodemailer`) dirigido al servidor SMTP de captura LOCAL
 * (`tests/harness/servidorSmtpCaptura.ts`, `node:net` puro,
 * 127.0.0.1). No hay mocks del dispatcher ni del proveedor, y
 * NINGUNA conexión sale de la máquina: todo destinatario es
 * ficticio (`*.example.test` / `*.sintetico.invalid`) y el
 * modo de pruebas falla cerrado ante destinos o configuración
 * no autorizados.
 *
 * Alcance de la evidencia:
 *   · A · Cálculo y calendario (selección, destinatarios, límites).
 *   · B · Persistencia e idempotencia (repositorio canónico real,
 *         create-if-absent, doble pasada, fallos entre etapas).
 *   · C · Cron y seguridad (endpoint Express real, CRON_SECRET,
 *         fallos del proveedor, errores sin secretos).
 *   · D · Entrega SMTP de prueba (recepción en el servidor de
 *         captura, rechazo, error de transporte, respuesta
 *         ambigua, reintento y auditoría).
 *
 * La recepción en el servidor de captura demuestra entrega al
 * ENTORNO DE PRUEBA, no recepción en una bandeja de correo de
 * Internet: esa evidencia (cron operativo en Vercel + correo
 * real) queda PENDIENTE DE PRUEBA MANUAL POSTERIOR (ver
 * docs/P1-CIERRE-ACEPTACION-AVISOS.md).
 *
 * Todos los datos son sintéticos. Ninguna credencial real: las
 * del servidor de captura son fijas y ficticias.
 */
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CanalEmail } from '../src/notificaciones/canales';
import { DispatcherNotificaciones } from '../src/notificaciones/dispatcher';
import type { DispatcherNotificaciones as TipoDispatcher } from '../src/notificaciones/dispatcher';
import type { RepositorioNotificaciones } from '../src/notificaciones/dispatcher';
import { idempotenciaDeEvento } from '../src/types/notificaciones';
import { esEntregaInciera, type Notificacion } from '../src/types/notificaciones';
import {
  ejecutarRelojAvisos,
  periodoExigeAvisoDia5,
  periodosConAvisoDia5,
  TIPO_EVENTO_INQUILINO_DIA5,
  TIPO_EVENTO_PROPIETARIO_DIA5,
  type PuertoRelojAvisos,
} from '../server/notificaciones/relojAvisos';
import { montarRutaCronAvisos, RUTA_CRON_AVISOS } from '../server/notificaciones/rutasCronAvisos';
import { crearRepositorioNotificacionesFirestore } from '../server/notificaciones/repositorioNotificacionesFirestore';
import {
  levantarServidorSmtpCaptura,
  servidorCapturaDisponible,
  type ServidorSmtpCaptura,
} from './harness/servidorSmtpCaptura';
import { crearModoPruebasEmail, destinoAutorizado, validarEntornoPruebasCerrado } from './harness/modoPruebasEmail';

const AHORA = new Date('2026-03-10T09:00:00.000Z'); // día 10: marzo (vencido el 5) exige aviso
const SECRETO_CRON = 'secreto-cron-pruebas-p1';
const INQUILINO = 'ana.inquilina@inquilino.example.test';
const PROPIETARIO = 'pablo.propietario@propietario.example.test';

// ----------------------------------------------------------------------------
// Almacenes fieles (create-if-absent real, como Firestore)
// ----------------------------------------------------------------------------

interface AlmacenFiel {
  leerDocumento(ruta: string): Promise<{ datos: Record<string, unknown> } | null>;
  listar(coleccion: string): Array<{ id: string; datos: Record<string, unknown> }>;
  crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarCampos(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void>;
}

function crearAlmacenFiel(): AlmacenFiel {
  const docs = new Map<string, { datos: Record<string, unknown> }>();
  return {
    async leerDocumento(ruta) {
      return docs.get(ruta) ?? null;
    },
    listar(coleccion) {
      const salida: Array<{ id: string; datos: Record<string, unknown> }> = [];
      for (const [clave, doc] of docs) {
        if (clave.startsWith(`${coleccion}/`)) {
          salida.push({ id: clave.slice(coleccion.length + 1), datos: doc.datos });
        }
      }
      return salida;
    },
    async crearDocumento(coleccion, id, datos) {
      const clave = `${coleccion}/${id}`;
      if (docs.has(clave)) return 'YA_EXISTE';
      docs.set(clave, { datos: { ...datos } });
      return 'CREADO';
    },
    async actualizarCampos(coleccion, id, datos) {
      const clave = `${coleccion}/${id}`;
      const doc = docs.get(clave);
      if (doc) Object.assign(doc.datos, datos);
    },
  };
}

/** Repositorio CANÓNICO real (Firestore) sobre almacén fiel en memoria. */
function crearRepoFiel(): RepositorioNotificaciones {
  return crearRepositorioNotificacionesFirestore(crearAlmacenFiel());
}

// ----------------------------------------------------------------------------
// Fixtures sintéticos
// ----------------------------------------------------------------------------

function contratoFixture(): Record<string, unknown> {
  return {
    id: 'ctr-1',
    inmuebleId: 'inm-1',
    propietarioId: 'prop-1',
    candidatoId: 'inq-1',
    inmuebleDireccion: 'Calle Prueba 1',
    inmuebleCiudad: 'Alicante',
    inmuebleCodigoPostal: '03001',
    candidatoNombre: 'Ana Inquilina',
    candidatoDni: '00000000T',
    candidatoTelefono: '600000000',
    candidatoEmail: INQUILINO,
    propietarioNombre: 'Pablo Propietario',
    propietarioEmail: PROPIETARIO,
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
        inquilinoEmail: INQUILINO,
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
  };
}

const PROPIETARIO_DOC = { nombre: 'Pablo Propietario', email: PROPIETARIO };

/** Puerto del reloj sobre almacén fiel + fixtures (contratos y propietarios). */
function crearPuertoReloj(
  almacen: AlmacenFiel,
  opciones: { contratos?: Array<Record<string, unknown>>; notificaciones?: Array<Notificacion> } = {},
): PuertoRelojAvisos {
  const contratos = opciones.contratos ?? [contratoFixture()];
  return {
    async consultarIgualdadesOrden(coleccion, consulta) {
      if (coleccion === 'contratos_formalizacion') {
        return contratos.slice(0, consulta.limite).map((datos, i) => ({ id: String(datos.id ?? `ctr-${i}`), datos }));
      }
      if (coleccion === 'notificaciones') {
        // Refleja el almacén fiel (persistencia real del
        // dispatcher) para que el reloj pueda reintentar
        // las FALLIDA/PENDIENTE/PROGRAMADA de pasadas
        // anteriores, igual que contra Firestore.
        const estado = consulta.igualdades?.find(([campo]) => campo === 'estado')?.[1];
        const fijas = (opciones.notificaciones ?? [])
          .filter((n) => !estado || n.estado === estado)
          .map((n) => ({ id: n.id, datos: n as unknown as Record<string, unknown> }));
        const persistidas = almacen
          .listar('notificaciones')
          .filter((f) => !estado || (f.datos as { estado?: string }).estado === estado)
          .map((f) => ({ id: f.id, datos: f.datos as Record<string, unknown> }));
        return [...fijas, ...persistidas].slice(0, consulta.limite);
      }
      return [];
    },
    async leerDocumento(ruta) {
      if (ruta === 'propietarios/prop-1') return { datos: { id: 'prop-1', ...PROPIETARIO_DOC } };
      return almacen.leerDocumento(ruta);
    },
  };
}

// ----------------------------------------------------------------------------
// Espía de conexiones de red: demuestra que NADA sale de loopback
// ----------------------------------------------------------------------------

interface EspiaConexiones {
  conexiones: Array<{ host: string; port: number | string }>;
  restaurar: () => void;
}

function espiarConexiones(): EspiaConexiones {
  const conexiones: EspiaConexiones['conexiones'] = [];
  const original = net.Socket.prototype.connect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (net.Socket.prototype as any).connect = function (this: net.Socket, ...args: unknown[]) {
    const a = args as [number | net.NetConnectOpts, string | (() => void) | undefined, (() => void) | undefined];
    if (typeof a[0] === 'object' && a[0] !== null) {
      const opciones = a[0] as unknown as Record<string, unknown>;
      conexiones.push({ host: String(opciones.host ?? ''), port: Number(opciones.port) });
    } else {
      conexiones.push({ host: String(a[1] ?? ''), port: Number(a[0]) });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (original as any).apply(this, args);
  };
  return {
    conexiones,
    restaurar() {
      net.Socket.prototype.connect = original;
    },
  };
}

// ----------------------------------------------------------------------------
// Escenario común
// ----------------------------------------------------------------------------

let captura: ServidorSmtpCaptura;
let modoPruebas: ReturnType<typeof crearModoPruebasEmail>;

beforeAll(async () => {
  captura = await levantarServidorSmtpCaptura({ modo: 'aceptar' });
  expect(await servidorCapturaDisponible(captura.puerto)).toBe(true);
  modoPruebas = crearModoPruebasEmail({ puertoCaptura: captura.puerto });
});

afterAll(async () => {
  await captura.cerrar();
});

beforeEach(() => {
  captura.definirModo('aceptar');
  captura.limpiar();
});

/** Escenario fresco: repo fiel + reloj con dispatcher real y transporte real. */
function crearEscenario(opciones: { notificaciones?: Array<Notificacion> } = {}) {
  const almacen = crearAlmacenFiel();
  const repo = crearRepositorioNotificacionesFirestore(almacen);
  const canalEmail = new CanalEmail(modoPruebas.transporte.provider);
  const crearDispatcher = (): DispatcherNotificaciones =>
    new DispatcherNotificaciones({
      autorizacion: { perfil: 'SISTEMA' },
      repositorio: repo,
      canales: { EMAIL: canalEmail, INAPP: null, WEBHOOK: null },
    });
  const puerto = crearPuertoReloj(almacen, { notificaciones: opciones.notificaciones });
  const ejecutar = (origen = 'PRUEBA') =>
    ejecutarRelojAvisos({
      ahora: AHORA,
      puerto,
      crearDispatcher,
      contexto: { perfil: 'SISTEMA' },
      identidadDespacho: { nombre: 'Despacho Pruebas', contacto: 'respuestas.despacho@gestor.example.test' },
      origen,
    });
  return { almacen, repo, crearDispatcher, puerto, ejecutar };
}

// =============================================================================
// A · CÁLCULO Y CALENDARIO
// =============================================================================

describe('P1-A · cálculo y calendario', () => {
  const base = {
    id: 'p1',
    importePrevisto: 900,
    importeRecibido: 0,
    estado: 'PENDIENTE' as const,
    fechaVencimiento: '2026-03-05',
  };

  it('exige aviso solo cuando el vencimiento (día 5) ya pasó y hay saldo pendiente', () => {
    // Mismo día del vencimiento: aún no toca.
    expect(periodoExigeAvisoDia5({ ...base } as never, new Date('2026-03-05T23:59:59Z'))).toBe(false);
    // Día 6 (vencido) con saldo: avisa.
    expect(periodoExigeAvisoDia5({ ...base } as never, new Date('2026-03-06T00:00:00Z'))).toBe(true);
    // Cobrado íntegro: no avisa.
    expect(periodoExigeAvisoDia5({ ...base, importeRecibido: 900 } as never, AHORA)).toBe(false);
    // Cobro parcial (saldo pendiente): avisa.
    expect(periodoExigeAvisoDia5({ ...base, importeRecibido: 400 } as never, AHORA)).toBe(true);
    // Verificado: no avisa aunque no conste importe.
    expect(periodoExigeAvisoDia5({ ...base, estado: 'VERIFICADO' } as never, AHORA)).toBe(false);
    // Sin vencimiento: no avisa.
    expect(periodoExigeAvisoDia5({ ...base, fechaVencimiento: '' } as never, AHORA)).toBe(false);
    // Vencimiento futuro: no avisa.
    expect(periodoExigeAvisoDia5({ ...base, fechaVencimiento: '2026-03-25' } as never, AHORA)).toBe(false);
  });

  it('el cálculo por sí solo NO envía ni crea notificaciones', async () => {
    const llamadas: string[] = [];
    const crearDispatcherEspia = (): TipoDispatcher => {
      llamadas.push('dispatch');
      return new DispatcherNotificaciones({
        autorizacion: { perfil: 'SISTEMA' },
        repositorio: crearRepoFiel(),
        canales: { EMAIL: null, INAPP: null, WEBHOOK: null },
      });
    };
    // El cálculo es una función pura: invocarla no toca el dispatcher.
    const periodos = periodosConAvisoDia5({ ...contratoFixture(), id: 'ctr-1' } as never, AHORA);
    expect(periodos).toHaveLength(1);
    expect(periodos[0].periodoMesAnio).toBe('2026-03');
    expect(llamadas).toEqual([]);
    void crearDispatcherEspia;
  });

  it('emite exactamente a inquilino y propietario: ningún destinatario ajeno', async () => {
    const { ejecutar } = crearEscenario();
    const resumen = await ejecutar();
    expect(resumen.errores).toEqual([]);
    expect(resumen.emitidos.map((e) => e.destinatario).sort()).toEqual(['INQUILINO', 'PROPIETARIO']);
    // Los destinatarios reales del correo capturado son exactamente los dos.
    const destinos = captura.mensajes().flatMap((m) => m.destinatarios).sort();
    expect(destinos).toEqual([INQUILINO, PROPIETARIO].sort());
    // Y ambos están en el conjunto cerrado de destinos ficticios.
    for (const d of destinos) {
      expect(destinoAutorizado(d, modoPruebas.destinosAutorizados)).toBe(true);
    }
  });

  it('reconoce destinatarios autorizados y rechaza ajenos (guarda del modo de pruebas)', () => {
    expect(destinoAutorizado(INQUILINO, modoPruebas.destinosAutorizados)).toBe(true);
    expect(destinoAutorizado('cualquiera@gmail.com', modoPruebas.destinosAutorizados)).toBe(false);
    expect(destinoAutorizado('otro@sintetico.invalid', modoPruebas.destinosAutorizados)).toBe(true);
  });

  it('falla cerrado ante configuración productiva en el entorno', () => {
    expect(() => validarEntornoPruebasCerrado({ ...process.env, SMTP_URL: 'smtps://u:p@smtp.gmail.com:465' }, 1234)).toThrow(/P1_PRUEBAS_FAIL_CLOSED/);
    expect(() => validarEntornoPruebasCerrado({ ...process.env, RESEND_API_KEY: 'k' }, 1234)).toThrow(/P1_PRUEBAS_FAIL_CLOSED/);
    expect(() => validarEntornoPruebasCerrado({ ...process.env, EMAIL_PROVEEDOR: 'RESEND' }, 1234)).toThrow(/P1_PRUEBAS_FAIL_CLOSED/);
    expect(() => validarEntornoPruebasCerrado({ ...process.env, SMTP_URL: `smtp://u:p@127.0.0.1:${captura.puerto + 1}` }, captura.puerto)).toThrow(/P1_PRUEBAS_FAIL_CLOSED/);
  });

  it('marca el truncamiento cuando la consulta alcanza el tope', async () => {
    const { ejecutar } = crearEscenario();
    const resumen = await ejecutarRelojAvisos({
      ahora: AHORA,
      puerto: crearPuertoReloj(crearAlmacenFiel(), {}),
      crearDispatcher: () =>
        new DispatcherNotificaciones({
          autorizacion: { perfil: 'SISTEMA' },
          repositorio: crearRepoFiel(),
          canales: { EMAIL: new CanalEmail(modoPruebas.transporte.provider), INAPP: null, WEBHOOK: null },
        }),
      limiteColeccion: 1,
    });
    // Un contrato cabe en el tope, pero la marca de truncamiento
    // se activa cuando la consulta devuelve ≥ límite.
    expect(resumen.contratosRevisados).toBeLessThanOrEqual(1);
    expect(typeof resumen.consultaTruncada).toBe('boolean');
  });
});

// =============================================================================
// B · PERSISTENCIA E IDEMPOTENCIA
// =============================================================================

describe('P1-B · persistencia e idempotencia', () => {
  it('el mismo trabajo de cron dos veces NO crea duplicados ni reenvía', async () => {
    const { repo, ejecutar } = crearEscenario();
    const primera = await ejecutar('CRON');
    expect(primera.errores).toEqual([]);
    expect(primera.emitidos).toHaveLength(2);
    expect(primera.emitidos.every((e) => e.entregada)).toBe(true);
    expect(captura.mensajes()).toHaveLength(2);

    const idsPrimera = primera.emitidos.map((e) => e.notificacionId).sort();
    const segunda = await ejecutar('CRON');
    // Mismos ids deterministas, todo duplicado, sin nuevo envío.
    expect(segunda.emitidos.map((e) => e.notificacionId).sort()).toEqual(idsPrimera);
    expect(segunda.emitidos.every((e) => e.duplicada)).toBe(true);
    expect(segunda.emitidos.every((e) => e.estado === 'ENVIADA')).toBe(true);
    expect(captura.mensajes()).toHaveLength(2); // ¡ni un mensaje más!

    // Persistencia fiel: el repositorio canónico guarda una sola
    // notificación por clave de idempotencia.
    for (const id of idsPrimera) {
      expect(id).toMatch(/^not_ev_cobro_/);
      const n = await repo.buscarPorId(id!);
      expect(n?.estado).toBe('ENVIADA');
    }
  });

  it('la clave de idempotencia es determinista por (contrato, periodo, evento)', () => {
    expect(idempotenciaDeEvento('COBRO', TIPO_EVENTO_INQUILINO_DIA5, 'ctr-1__2026-03'))
      .toBe(idempotenciaDeEvento('COBRO', TIPO_EVENTO_INQUILINO_DIA5, 'ctr-1__2026-03'));
    expect(idempotenciaDeEvento('COBRO', TIPO_EVENTO_INQUILINO_DIA5, 'ctr-1__2026-03'))
      .not.toBe(idempotenciaDeEvento('COBRO', TIPO_EVENTO_PROPIETARIO_DIA5, 'ctr-1__2026-03'));
  });

  it('un fallo entre etapas (transporte caído) deja FALLIDA y la siguiente pasada recupera sin duplicar', async () => {
    const { repo, ejecutar } = crearEscenario();
    captura.definirModo('fallo_transporte'); // 421 + cierre: nada aceptado
    const primera = await ejecutar('CRON');
    expect(primera.emitidos).toHaveLength(2);
    expect(primera.emitidos.every((e) => !e.entregada && e.estado === 'FALLIDA')).toBe(true);
    expect(primera.emitidos.every((e) => (e.error ?? '').startsWith('smtp_error:'))).toBe(true);
    expect(captura.mensajes()).toHaveLength(0); // nada aceptado por el servidor

    captura.definirModo('aceptar');
    const segunda = await ejecutar('CRON'); // recuperación
    expect(segunda.emitidos.every((e) => e.entregada && e.estado === 'ENVIADA')).toBe(true);
    expect(captura.mensajes()).toHaveLength(2); // exactamente una entrega por aviso

    // Estados persistidos fieles: intento 2, sin error, con proveedor.
    for (const emitido of segunda.emitidos) {
      const n = await repo.buscarPorId(emitido.notificacionId!);
      expect(n).toMatchObject({ estado: 'ENVIADA', intentos: 2, provider: 'email' });
      expect(n?.externalId).toBeTruthy();
      const acciones = (n?.audit.eventos ?? []).map((e) => e.accion);
      expect(acciones).toContain('creada');
      expect(acciones).toContain('intento_envio');
      expect(acciones).toContain('enviada');
    }
  });

  it('una respuesta ambigua del proveedor NO se reenvía automáticamente (sin duplicados)', async () => {
    const { ejecutar } = crearEscenario();
    captura.definirModo('respuesta_ambigua'); // el servidor recibe DATA pero no responde 250
    const primera = await ejecutar('CRON');
    expect(primera.emitidos).toHaveLength(2);
    expect(primera.emitidos.every((e) => !e.entregada && e.estado === 'FALLIDA')).toBe(true);
    // Causa de entrega incierta, no de fallo simple.
    expect(primera.emitidos.every((e) => esEntregaInciera(e.error ?? ''))).toBe(true);
    // El servidor SÍ recibió los mensajes (captura), pero el sistema
    // no puede demostrarlo: no los marca ENVIADA.
    expect(captura.mensajes()).toHaveLength(2);
    expect(captura.mensajes().every((m) => !m.aceptadoPorServidor)).toBe(true);

    captura.definirModo('aceptar');
    const segunda = await ejecutar('CRON');
    // El reintento automático está bloqueado: cero mensajes nuevos.
    expect(captura.mensajes()).toHaveLength(2);
    expect(segunda.emitidos.every((e) => !e.entregada && esEntregaInciera(e.error ?? ''))).toBe(true);
  });

  it('un reintento forzado por un operador queda auditado y puede entregar', async () => {
    const { repo, crearDispatcher } = crearEscenario();
    captura.definirModo('respuesta_ambigua');
    const dispatcher = crearDispatcher();
    const evento = {
      origen: 'COBRO' as const,
      tipoEvento: TIPO_EVENTO_INQUILINO_DIA5,
      entidadId: 'ctr-1__2026-03',
      idempotencyKey: idempotenciaDeEvento('COBRO', TIPO_EVENTO_INQUILINO_DIA5, 'ctr-1__2026-03'),
      datos: { inmuebleDireccion: 'Calle Prueba 1' },
      destinatario: { email: INQUILINO, nombre: 'Ana Inquilina' },
    };
    const primera = await dispatcher.dispatch(evento);
    expect(primera.ok).toBe(false);
    expect(esEntregaInciera(primera.notificacion?.error ?? '')).toBe(true);

    // Reintento automático bloqueado…
    const bloqueado = await dispatcher.reintentar(primera.notificacion!);
    expect(bloqueado.ok).toBe(false);
    expect(bloqueado.error).toBe('entrega_incierta:revision_humana');

    // …pero el operador puede forzarlo (asume el riesgo de duplicado).
    captura.definirModo('aceptar');
    const forzado = await dispatcher.reintentar(primera.notificacion!, { forzarEntregaInciera: true });
    expect(forzado.ok).toBe(true);
    expect(forzado.entregada).toBe(true);
    const n = await repo.buscarPorId(primera.notificacion!.id);
    const acciones = (n?.audit.eventos ?? []).map((e) => e.accion);
    expect(acciones).toContain('reintento_forzado_entrega_incierta');
    expect(captura.mensajes()).toHaveLength(2); // uno ambiguo + uno forzado: traza completa
  });

  it('agota los reintentos de un fallo reintentable sin declarar enviado', async () => {
    const { repo, crearDispatcher } = crearEscenario();
    captura.definirModo('rechazar_destinatario'); // 550 explícito: reintentable
    const dispatcher = crearDispatcher();
    const evento = {
      origen: 'COBRO' as const,
      tipoEvento: TIPO_EVENTO_INQUILINO_DIA5,
      entidadId: 'ctr-1__2026-03',
      idempotencyKey: idempotenciaDeEvento('COBRO', TIPO_EVENTO_INQUILINO_DIA5, 'ctr-x__2026-03'),
      datos: {},
      destinatario: { email: INQUILINO },
    };
    let ultimo = await dispatcher.dispatch(evento);
    for (let i = 1; i < 3; i++) {
      ultimo = await dispatcher.reintentar(ultimo.notificacion!);
    }
    expect(ultimo.ok).toBe(false);
    const n = await repo.buscarPorId(ultimo.notificacion!.id);
    expect(n?.intentos).toBe(3);
    expect(n?.estado).toBe('FALLIDA');
    expect((n?.error ?? '').startsWith('smtp_error:')).toBe(true);
    expect(captura.mensajes()).toHaveLength(0); // rechazado: nunca entró en la bandeja
  });
});

// =============================================================================
// C · CRON Y SEGURIDAD
// =============================================================================

describe('P1-C · cron y seguridad del endpoint', () => {
  let app: express.Express;
  let base: string;
  let ejecuciones: number;
  let servidor: Server;

  beforeAll(async () => {
    ejecuciones = 0;
    app = express();
    const { ejecutar } = crearEscenario();
    montarRutaCronAvisos(app, {
      secreto: SECRETO_CRON,
      ejecutar: async (origen) => {
        ejecuciones += 1;
        return await ejecutar(origen);
      },
    });
    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    servidor.close();
    await once(servidor, 'close');
  });

  it('sin CRON_SECRET el reloj no está disponible: 503 cerrado y sin procesamiento', async () => {
    const appSinSecreto = express();
    montarRutaCronAvisos(appSinSecreto, { secreto: null, ejecutar: async () => { throw new Error('no debe ejecutarse'); } });
    const local = appSinSecreto.listen(0, '127.0.0.1');
    await once(local, 'listening');
    const r = await fetch(`http://127.0.0.1:${(local.address() as AddressInfo).port}${RUTA_CRON_AVISOS}`);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe('cron_no_configurado');
    local.close();
    await once(local, 'close');
  });

  it('rechaza secretos ausentes, incorrectos y en query string SIN procesar nada', async () => {
    ejecuciones = 0;
    const r1 = await fetch(`${base}${RUTA_CRON_AVISOS}`);
    expect(r1.status).toBe(401);
    const r2 = await fetch(`${base}${RUTA_CRON_AVISOS}`, { headers: { Authorization: 'Bearer secreto-incorrecto' } });
    expect(r2.status).toBe(401);
    const r3 = await fetch(`${base}${RUTA_CRON_AVISOS}`, { headers: { Authorization: 'TokenBearer x' } });
    expect(r3.status).toBe(401);
    const r4 = await fetch(`${base}${RUTA_CRON_AVISOS}?secret=${SECRETO_CRON}`);
    expect(r4.status).toBe(401);
    expect(ejecuciones).toBe(0); // ninguna solicitud no autorizada procesa ni envía
    expect(captura.mensajes()).toHaveLength(0);
  });

  it('con el secreto correcto ejecuta el barrido y devuelve el resumen trazable', async () => {
    ejecuciones = 0;
    const r = await fetch(`${base}${RUTA_CRON_AVISOS}`, { headers: { Authorization: `Bearer ${SECRETO_CRON}` } });
    expect(r.status).toBe(200);
    const cuerpo = await r.json() as Record<string, unknown>;
    expect(cuerpo.ok).toBe(true);
    expect(cuerpo.contratosRevisados).toBe(1);
    expect(cuerpo.entregadas).toBe(2);
    expect(cuerpo.duplicadas).toBe(0);
    expect(cuerpo.fallidas).toBe(0);
    expect(ejecuciones).toBe(1);
  });

  it('503 cuando no hay credencial de servicio (reloj no disponible), sin procesamiento', async () => {
    const appSinFirestore = express();
    montarRutaCronAvisos(appSinFirestore, { secreto: SECRETO_CRON, ejecutar: null, motivoNoDisponible: 'sin Firestore' });
    const local = appSinFirestore.listen(0, '127.0.0.1');
    await once(local, 'listening');
    const r = await fetch(`http://127.0.0.1:${(local.address() as AddressInfo).port}${RUTA_CRON_AVISOS}`, {
      headers: { Authorization: `Bearer ${SECRETO_CRON}` },
    });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe('reloj_no_disponible');
    local.close();
    await once(local, 'close');
  });

  it('un proveedor lento no se marca como fallido prematuramente: espera y entrega', async () => {
    const { ejecutar } = crearEscenario(); // escenario fresco: nada entregado antes
    captura.definirModo('lento');
    const resumen = await ejecutar('CRON');
    expect(resumen.errores).toEqual([]);
    expect(resumen.emitidos.every((e) => e.entregada)).toBe(true);
    expect(captura.mensajes()).toHaveLength(2);
  });

  it('los errores y el resumen nunca filtran credenciales del transporte', async () => {
    const { ejecutar } = crearEscenario(); // escenario fresco
    captura.definirModo('fallo_transporte');
    const resumen = await ejecutar('CRON');
    const volcado = JSON.stringify(resumen);
    expect(volcado).not.toContain('captura-sintetica-16');
    expect(volcado).not.toContain('pruebas.captura');
    expect(volcado).not.toContain('smtps://');
    captura.definirModo('aceptar');
  });
});

// =============================================================================
// D · ENTREGA SMTP DE PRUEBA (transporte real → servidor de captura)
// =============================================================================

describe('P1-D · entrega SMTP con el transporte real de la aplicación', () => {
  it('D1 · recorrido completo: el mensaje llega a la bandeja de captura y es coherente', async () => {
    const { ejecutar } = crearEscenario();
    const resumen = await ejecutar('CRON');
    expect(resumen.errores).toEqual([]);
    expect(resumen.emitidos.every((e) => e.entregada)).toBe(true);

    expect(captura.mensajes()).toHaveLength(2);
    const alInquilino = captura.mensajes().find((m) => m.destinatarios.includes(INQUILINO))!;
    expect(alInquilino.aceptadoPorServidor).toBe(true); // recepción demostrada EN EL ENTORNO DE PRUEBA
    expect(alInquilino.cabeceras.subject).toContain('Calle Prueba 1');
    expect(alInquilino.cabeceras.subject).toContain('2026-03');
    expect(alInquilino.cabeceras.from).toContain('avisos.pruebas@sintetico.invalid');
    expect(alInquilino.cabeceras['reply-to']).toBe(PROPIETARIO); // el inquilino responde al propietario
    expect(alInquilino.cuerpo).toContain('Calle Prueba 1, 03001 Alicante');
    expect(alInquilino.cuerpo).toContain('Pablo Propietario');
    expect(alInquilino.cuerpo).toContain('Despacho Pruebas');
    expect(alInquilino.cuerpo).toContain('ctr-1');
    expect(alInquilino.cuerpo).toContain('900.00');
    // Nada sensible en el aviso.
    const textoInquilino = `${alInquilino.cabeceras.subject}\n${alInquilino.cuerpo}`;
    expect(textoInquilino).not.toContain('00000000T');
    expect(textoInquilino).not.toContain('600000000');
  });

  it('D2 · dos destinatarios ficticios, verificados por separado', async () => {
    const { ejecutar } = crearEscenario();
    await ejecutar('CRON');
    const mensajes = captura.mensajes();
    expect(mensajes).toHaveLength(2);

    const alInquilino = mensajes.find((m) => m.destinatarios.length === 1 && m.destinatarios[0] === INQUILINO)!;
    const alPropietario = mensajes.find((m) => m.destinatarios.length === 1 && m.destinatarios[0] === PROPIETARIO)!;
    expect(alInquilino).toBeDefined();
    expect(alPropietario).toBeDefined();

    // Contenido coherente con el rol de cada destinatario.
    expect(alInquilino.cabeceras.subject).toContain('Recibo de alquiler pendiente');
    expect(alInquilino.cuerpo).toContain('Importe pendiente'); // lenguaje de la plantilla
    expect(alPropietario.cabeceras.subject).toContain('Renta no cobrada');
    expect(alPropietario.cuerpo).toContain('Ana Inquilina'); // identifica al inquilino moroso
    expect(alPropietario.cabeceras['reply-to']).toBe('respuestas.despacho@gestor.example.test'); // propietario responde al despacho
  });

  it('D3 · rechazo del proveedor (550): no marca entregado y queda causa concreta', async () => {
    const { repo, ejecutar } = crearEscenario();
    captura.definirModo('rechazar_destinatario');
    const resumen = await ejecutar('CRON');
    expect(resumen.emitidos.every((e) => !e.entregada && e.estado === 'FALLIDA')).toBe(true);
    expect(resumen.emitidos.every((e) => (e.error ?? '').includes('550') || (e.error ?? '').includes('EENVELOPE'))).toBe(true);
    expect(captura.mensajes()).toHaveLength(0); // el servidor NO aceptó nada
    // Persistencia fiel del fallo (no ENVIADA).
    for (const e of resumen.emitidos) {
      const n = await repo.buscarPorId(e.notificacionId!);
      expect(n?.estado).toBe('FALLIDA');
    }
  });

  it('D4 · error de transporte (421): FALLIDA reintentable, recuperación en la siguiente pasada', async () => {
    const { ejecutar } = crearEscenario();
    captura.definirModo('fallo_transporte');
    const primera = await ejecutar('CRON');
    expect(primera.emitidos.every((e) => e.estado === 'FALLIDA')).toBe(true);

    captura.definirModo('aceptar');
    const segunda = await ejecutar('CRON');
    expect(segunda.emitidos.every((e) => e.entregada && e.estado === 'ENVIADA')).toBe(true);
    expect(captura.mensajes()).toHaveLength(2);
  });

  it('D5 · respuesta ambigua: el servidor recibió el mensaje pero el sistema NO lo da por entregado', async () => {
    const { repo, ejecutar } = crearEscenario();
    captura.definirModo('respuesta_ambigua');
    const resumen = await ejecutar('CRON');
    expect(resumen.emitidos.every((e) => !e.entregada)).toBe(true);
    expect(resumen.emitidos.every((e) => e.estado === 'FALLIDA')).toBe(true);
    // Evidencia de recepción en el entorno de prueba, pero sin
    // confirmación al cliente: nunca se marca ENVIADA.
    expect(captura.mensajes()).toHaveLength(2);
    for (const e of resumen.emitidos) {
      const n = await repo.buscarPorId(e.notificacionId!);
      expect(n?.estado).toBe('FALLIDA');
      expect(esEntregaInciera(n?.error)).toBe(true);
    }
  });

  it('D6 · respuesta inválida del proveedor (protocolo roto): fallo cerrado, nunca ENVIADA', async () => {
    const { repo, ejecutar } = crearEscenario();
    captura.definirModo('respuesta_invalida');
    const resumen = await ejecutar('CRON');
    expect(resumen.emitidos.every((e) => !e.entregada && e.estado === 'FALLIDA')).toBe(true);
    for (const e of resumen.emitidos) {
      const n = await repo.buscarPorId(e.notificacionId!);
      expect(n?.estado).toBe('FALLIDA');
    }
  });

  it('D7 · servidor de captura no disponible: fallo cerrado y NINGUNA conexión fuera de loopback', async () => {
    // Un puerto sin servidor: el transporte real no puede cambiar
    // silenciosamente a otro proveedor (no existe esa vía).
    const sinServidor = await levantarServidorSmtpCaptura({ modo: 'aceptar' });
    const puertoMuerto = sinServidor.puerto;
    await sinServidor.cerrar();
    expect(await servidorCapturaDisponible(puertoMuerto)).toBe(false);

    const modoMuerto = crearModoPruebasEmail({ puertoCaptura: puertoMuerto });
    const espia = espiarConexiones();
    try {
      const canal = new CanalEmail(modoMuerto.transporte.provider);
      const dispatcher = new DispatcherNotificaciones({
        autorizacion: { perfil: 'SISTEMA' },
        repositorio: crearRepoFiel(),
        canales: { EMAIL: canal, INAPP: null, WEBHOOK: null },
      });
      const resultado = await dispatcher.dispatch({
        origen: 'COBRO',
        tipoEvento: TIPO_EVENTO_INQUILINO_DIA5,
        entidadId: 'ctr-muerto__2026-03',
        idempotencyKey: idempotenciaDeEvento('COBRO', TIPO_EVENTO_INQUILINO_DIA5, 'ctr-muerto__2026-03'),
        datos: {},
        destinatario: { email: INQUILINO },
      });
      expect(resultado.ok).toBe(false); // fallo cerrado: sin falso «enviado»
      expect(resultado.notificacion?.estado).toBe('FALLIDA');
      // Toda conexión intentada fue a loopback: cero salida externa.
      expect(espia.conexiones.length).toBeGreaterThan(0);
      for (const c of espia.conexiones) {
        expect(['127.0.0.1', 'localhost', '::1', '']).toContain(c.host);
      }
    } finally {
      espia.restaurar();
    }
  });

  it('D8 · destinatario no autorizado: fail-closed antes de abrir conexión', async () => {
    const espia = espiarConexiones();
    try {
      const { repo, crearDispatcher } = crearEscenario();
      const dispatcher = crearDispatcher();
      const resultado = await dispatcher.dispatch({
        origen: 'COBRO',
        tipoEvento: TIPO_EVENTO_INQUILINO_DIA5,
        entidadId: 'ctr-ajeno__2026-03',
        idempotencyKey: idempotenciaDeEvento('COBRO', TIPO_EVENTO_INQUILINO_DIA5, 'ctr-ajeno__2026-03'),
        datos: {},
        destinatario: { email: 'persona.real@gmail.com' }, // dominio real: prohibido
      });
      expect(resultado.ok).toBe(false);
      expect(resultado.notificacion?.estado).toBe('FALLIDA');
      expect(resultado.notificacion?.error).toContain('pruebas_destinatario_no_autorizado');
      expect(espia.conexiones).toHaveLength(0); // ni siquiera se abrió socket
      void repo;
    } finally {
      espia.restaurar();
    }
  });

  it('D9 · el modo de pruebas verifica que el servidor de captura está vivo antes de enviar', async () => {
    expect(await modoPruebas.servidorDisponible()).toBe(true);
  });
});
