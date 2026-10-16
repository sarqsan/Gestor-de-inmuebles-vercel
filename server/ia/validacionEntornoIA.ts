/**
 * IA · FASE 8 — VALIDACIÓN EN ENTORNO NO PRODUCTIVO (SIN COSTE REAL)
 * ==================================================================
 * Reúne, en un módulo de SERVIDOR y sin red externa, todo lo necesario para
 * ensayar la activación gradual de la IA antes de autorizar nada:
 *
 *   1. `evaluarEntornoIA`: ¿estamos en producción?, ¿qué falta para poder
 *      validar?, ¿qué límites (proyecto, entorno y gasto) están identificados?
 *   2. `limitesGastoIA`: los límites FINITOS del sistema a partir de las cuotas
 *      y tarifas declaradas en la política (`IA_POLITICA_JSON`): peor caso por
 *      usuario y peor caso del sistema para el número de usuarios previsto.
 *   3. `proveedorSimulado`: doble de prueba del proveedor (sin SDK, sin clave y
 *      sin red) para ensayar las doce operaciones con una CUENTA DE PRUEBA.
 *   4. `ejecutarSandboxIA`: recorre las 12 operaciones del catálogo con el
 *      núcleo real, el gobierno en memoria y el proveedor simulado, y devuelve
 *      el consumo, los reembolsos y los eventos de log de cada operación.
 *
 * INVARIANTE DE LA FASE: este módulo **no puede activar nada por sí mismo**.
 * El proveedor real no se instancia aquí, la validación en producción se
 * rechaza de plano y cualquier paso que implique coste real queda como bloqueo
 * explícito a resolver con autorización expresa.
 */
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import {
  clienteIA,
  crearNucleoIA,
  generateGeminiWithRetry,
  type ClienteProveedorIA,
  type EventoNucleoIA,
} from './nucleoIA.js';
import { crearRegistroMemoria, type RegistroOperacionIA } from './registroOperacionesIA.js';
import { crearGobiernoMemoria, type GobiernoMemoriaIA } from './gobiernoIA.js';
import { resolverConfiguracionIA } from './configuracionIA.js';
import { OPERACIONES_IA, type IdOperacionIA } from '../../src/ia/catalogoOperacionesIA.js';
import {
  TIPOS_PERFIL_IA,
  politicaCompletaIA,
  resumenPoliticaGobiernoIA,
  type PoliticaGobiernoIA,
  type TipoPerfilIA,
} from '../../src/ia/gobiernoIAContrato.js';

// ---------------------------------------------------------------------------
// 1 · Guardia de entorno
// ---------------------------------------------------------------------------

export interface EvaluacionEntornoIA {
  /** `VERCEL` o `NODE_ENV=production`: NUNCA se valida aquí. */
  produccion: boolean;
  /** Motivos que impiden la validación (uno por línea, accionables). */
  bloqueos: string[];
  /** Avisos que no impiden validar pero deben revisarse. */
  avisos: string[];
  /** Proyecto, base de datos y entorno identificados (nunca se imprime la clave). */
  identificacion: { proyecto: string | null; baseDatos: string | null; entorno: string };
  /** true sólo si es seguro (y útil) ejecutar el sandbox. */
  puedeValidarEnSandbox: boolean;
}

/** Un error de configuración que impide el ensayo (la ausencia de credencial no lo es: el sandbox es en memoria). */
function proyectoCoherente(errorConfiguracion: string | undefined): boolean {
  return Boolean(errorConfiguracion) && errorConfiguracion !== 'FIREBASE_CREDENCIAL_AUSENTE';
}

export function evaluarEntornoIA(
  entorno: NodeJS.ProcessEnv = process.env,
  politica: PoliticaGobiernoIA | null = null,
): EvaluacionEntornoIA {
  const produccion = Boolean(entorno.VERCEL?.trim()) || entorno.NODE_ENV === 'production';
  const bloqueos: string[] = [];
  const avisos: string[] = [];
  // La identificación usa la MISMA fuente que el servidor (variable de entorno o
  // `firebase-applet-config.json`): nada de valores inventados ni de otro proyecto.
  const configuracion = resolverConfiguracionIA(entorno);
  const proyecto = configuracion.proyectoId;
  const baseDatos = configuracion.baseDatosId;
  const entornoNombre = entorno.NODE_ENV?.trim() || (produccion ? 'production' : 'desconocido');
  const tieneCredencial = Boolean(
    entorno.FIREBASE_SERVICE_ACCOUNT?.trim() || entorno.FIREBASE_SERVICE_ACCOUNT_B64?.trim()
      || entorno.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() || entorno.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
  const tieneClaveProveedor = Boolean(entorno.GEMINI_API_KEY?.trim());

  if (produccion) {
    bloqueos.push('El entorno se identifica como PRODUCCIÓN (VERCEL/NODE_ENV=production): la validación sólo se ejecuta en entorno no productivo.');
  }
  // Sin credencial de servicio el ensayo es posible (almacenes en memoria): sólo
  // bloquean los errores REALES de configuración (proyecto/base incoherentes).
  if (configuracion.errorConfiguracion && configuracion.errorConfiguracion !== 'FIREBASE_CREDENCIAL_AUSENTE') {
    bloqueos.push(`Configuración Firebase bloqueada (${configuracion.errorConfiguracion}): revisa el proyecto y la base de datos antes de validar.`);
  } else if (!proyecto) {
    bloqueos.push('Falta identificar el proyecto (FIREBASE_PROJECT_ID o el projectId de firebase-applet-config.json).');
  }
  if (!politica) {
    bloqueos.push('No hay política de IA declarada: sin una política COMPLETA (permisos de los 4 perfiles, tarifa de las 12 operaciones y cuotas finitas) el consumo está bloqueado por diseño.');
  } else if (politica.origen !== 'ENTORNO') {
    bloqueos.push(`La política vigente es POR_DEFECTO (sin ${'IA_POLITICA_JSON'}): declara y verifica la política aprobada antes de validar.`);
  } else if (!politicaCompletaIA(politica)) {
    bloqueos.push('La política de IA está incompleta: faltan permisos, tarifas o cuotas finitas.');
  }
  if (!tieneCredencial) {
    avisos.push('Sin credencial de servicio (FIREBASE_SERVICE_ACCOUNT…) el registro/goierno duradero no se puede usar: la validación en sandbox usa almacenes en memoria.');
  }
  if (!baseDatos) {
    avisos.push('Sin FIRESTORE_DATABASE_ID no se puede fijar la base de datos de la validación.');
  }
  if (tieneClaveProveedor) {
    avisos.push('GEMINI_API_KEY presente: el ensayo NO la usa (el sandbox corre con proveedor simulado); su uso real exige autorización expresa y límites de gasto verificados.');
  }

  return {
    produccion,
    bloqueos,
    avisos,
    identificacion: { proyecto, baseDatos, entorno: entornoNombre },
    puedeValidarEnSandbox: !produccion && !proyectoCoherente(configuracion.errorConfiguracion) && Boolean(proyecto) && Boolean(politica)
      && (politica as PoliticaGobiernoIA).origen === 'ENTORNO' && politicaCompletaIA(politica as PoliticaGobiernoIA),
  };
}

// ---------------------------------------------------------------------------
// 2 · Límites de gasto (peor caso) derivados de la política
// ---------------------------------------------------------------------------

export interface LimitesGastoIA {
  usuariosPrevistos: number;
  operacionesPorDiaPorUsuario: number;
  operacionesPorMesPorUsuario: number;
  creditosPorOperacionMasCara: number;
  operacionesMesSistema: number;
  creditosMesSistema: number;
  operacionesDiaSistema: number;
  creditosDiaPeorCaso: number;
  perfilesPorOperacion: Record<IdOperacionIA, TipoPerfilIA[]>;
}

/**
 * Peor caso ARITMÉTICO con las cuotas y tarifas declaradas. Es un techo de
 * negocio (créditos internos), no una factura: el coste real del proveedor se
 * limita en Google Cloud (presupuesto y cuotas de API) y se verifica en la
 * revisión de consumo antes de autorizar la activación.
 */
export function limitesGastoIA(politica: PoliticaGobiernoIA, usuariosPrevistos: number): LimitesGastoIA {
  const tarifas = Object.values(politica.costeCreditosPorOperacion) as number[];
  const tarifaMaxima = tarifas.length > 0 ? Math.max(...tarifas) : 0;
  const operacionesMesSistema = politica.cuotas.operacionesPorMes * usuariosPrevistos;
  const perfilesPorOperacion = {} as Record<IdOperacionIA, TipoPerfilIA[]>;
  for (const { id } of OPERACIONES_IA) {
    perfilesPorOperacion[id] = TIPOS_PERFIL_IA.filter((perfil) => politica.permisos[perfil].includes(id));
  }
  return {
    usuariosPrevistos,
    operacionesPorDiaPorUsuario: politica.cuotas.operacionesPorDia,
    operacionesPorMesPorUsuario: politica.cuotas.operacionesPorMes,
    creditosPorOperacionMasCara: tarifaMaxima,
    operacionesMesSistema,
    creditosMesSistema: operacionesMesSistema * tarifaMaxima,
    operacionesDiaSistema: politica.cuotas.operacionesPorDia * usuariosPrevistos,
    creditosDiaPeorCaso: politica.cuotas.operacionesPorDia * usuariosPrevistos * tarifaMaxima,
    perfilesPorOperacion,
  };
}

// ---------------------------------------------------------------------------
// 3 · Proveedor simulado (nunca el proveedor real)
// ---------------------------------------------------------------------------

/** Credencial sintética: el núcleo no debe ver ninguna clave real en el sandbox. */
export const CLAVE_PROVEEDOR_SIMULADO = 'MY_GEMINI_API_KEY';

/**
 * Doble de prueba: sin SDK, sin red y sin coste. Cuenta llamadas, registra la
 * operación ensayada y permite simular fallos por operación (para verificar
 * reembolsos y respaldos sin llamar al proveedor real).
 */
export function proveedorSimulado(opciones: { fallos?: Partial<Record<IdOperacionIA, number>> } = {}) {
  const llamadas: IdOperacionIA[] = [];
  const fallos: Partial<Record<IdOperacionIA, number>> = { ...(opciones.fallos ?? {}) };
  const cliente: ClienteProveedorIA = {
    models: {
      async generateContent(params: unknown) {
        const operacion = (params as { operacion?: IdOperacionIA } | null)?.operacion;
        if (operacion) llamadas.push(operacion);
        if (operacion && (fallos[operacion] ?? 0) > 0) {
          fallos[operacion] = (fallos[operacion] ?? 0) - 1;
          throw Object.assign(new Error('503 UNAVAILABLE: high demand'), { status: 503 });
        }
        return { text: '{"ok":true}', usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, totalTokenCount: 16 } };
      },
    },
  };
  return { cliente, llamadas, fallosRestantes: fallos };
}

/**
 * El proveedor REAL no se instancia en la validación no productiva: sin
 * autorización expresa el único camino es seguir con el proveedor simulado.
 */
export function proveedorRealBloqueado(): never {
  throw new Error(
    'Uso del proveedor real bloqueado: exige autorización expresa, clave de un proyecto NO productivo y límites de gasto (presupuesto + cuotas de API) identificados y verificados.',
  );
}

// ---------------------------------------------------------------------------
// 4 · Sandbox: las 12 operaciones con cuenta de prueba
// ---------------------------------------------------------------------------

export interface FilaSandboxIA {
  operacion: IdOperacionIA;
  ruta: string;
  permitida: boolean;
  codigoHttp: number;
  codigo?: string;
  motor: 'gemini-simulado' | 'respaldo';
  costeCreditos: number;
  creditosReembolsados: number;
  llamadasProveedor: number;
}

export interface InformeSandboxIA {
  perfil: TipoPerfilIA;
  uidPrueba: string;
  filas: FilaSandboxIA[];
  consumo: { operaciones: number; creditosConsumidos: number; creditosReembolsados: number; llamadasProveedor: number };
  eventos: EventoNucleoIA[];
  /** Documentos del registro en memoria (consumo) con la lista blanca de campos. */
  registros: RegistroOperacionIA[];
}

export interface OpcionesSandboxIA {
  politica: PoliticaGobiernoIA;
  /** Perfil veraz con el que se ensaya (cuenta de prueba). */
  perfil: TipoPerfilIA;
  uidPrueba?: string;
  perfilesExtra?: TipoPerfilIA[];
  usuarioIdPrueba?: string;
  creditoInicial?: number;
  ahora?: () => Date;
  proveedor?: ClienteProveedorIA;
}

const UID_POR_DEFECTO = 'uid-prueba-fase8';

/**
 * Ejecuta las DOCE rutas del catálogo contra la app real montada en memoria con
 * una cuenta de prueba: identidad veraz, permisos de la política, cuotas,
 * saldo, reembolso y registro. Sin red externa y sin proveedor real.
 */
export async function ejecutarSandboxIA(opciones: OpcionesSandboxIA): Promise<InformeSandboxIA> {
  const uidPrueba = opciones.uidPrueba ?? UID_POR_DEFECTO;
  const usuarioIdPrueba = opciones.usuarioIdPrueba ?? `usuario-${uidPrueba}`;
  const ahora = opciones.ahora ?? (() => new Date());
  const registro = crearRegistroMemoria();
  const gobierno: GobiernoMemoriaIA = crearGobiernoMemoria(opciones.politica, { listarOperaciones: () => registro.listar() });
  const cuentasCredito = new Map<string, number>([[uidPrueba, opciones.creditoInicial ?? 100]]);
  const fijarPerfil = (uid: string, tipoPerfil: TipoPerfilIA) =>
    gobierno.fijarPerfil(
      uid,
      { usuarioId: `usuario-${uid}`, tipoPerfil, estado: 'ACTIVO' },
      { authUid: uid, tipoPerfil, estado: 'ACTIVO' },
    );
  fijarPerfil(uidPrueba, opciones.perfil);
  for (const extra of opciones.perfilesExtra ?? []) fijarPerfil(`uid-prueba-${extra.toLowerCase()}`, extra);
  // Saldo de prueba: se concede con el propio gobierno (idempotente por clave).
  const creditoInicial = cuentasCredito.get(uidPrueba) ?? 0;
  if (creditoInicial > 0) {
    await gobierno.ajustarCredito({
      uid: uidPrueba, adminUid: uidPrueba, claveIdempotencia: 'sandbox-credito-inicial',
      creditos: creditoInicial, motivo: 'validación Fase 8', ahora: ahora(),
    });
  }

  const simulado = opciones.proveedor ? null : proveedorSimulado();
  const cliente = opciones.proveedor ?? (simulado as ReturnType<typeof proveedorSimulado>).cliente;
  const llamadas = simulado?.llamadas ?? [];
  const eventos: EventoNucleoIA[] = [];
  const nucleo = crearNucleoIA({
    verificarToken: async (token) => (token === `token-${uidPrueba}` ? { uid: uidPrueba } : null),
    registro,
    gobierno,
    crearClienteProveedor: () => cliente,
    log: (evento) => eventos.push(evento),
    ahora,
  });

  const app = express();
  app.use(express.json());
  for (const { id, ruta } of OPERACIONES_IA) {
    app.post(ruta, nucleo.operacion(id), async (req, res) => {
      const ai = clienteIA(res);
      if (!ai) return res.json({ operacion: id, motor: 'respaldo' });
      try {
        const r = await generarContenidoSimulado(ai, id);
        return res.json({ operacion: id, motor: 'gemini-simulado', texto: r });
      } catch {
        return res.json({ operacion: id, motor: 'respaldo' });
      }
    });
  }
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const filas: FilaSandboxIA[] = [];
  try {
    for (const { id, ruta } of OPERACIONES_IA) {
      const antesOps = registro.listar().length;
      const respuesta = await fetch(`${base}${ruta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer token-${uidPrueba}`,
          'Idempotency-Key': `sandbox-${id.toLowerCase()}`,
        },
        body: JSON.stringify({ operacion: id, prompt: 'validación no productiva' }),
      });
      const cuerpo = (await respuesta.json()) as { motor?: string; codigo?: string };
      const registros = registro.listar();
      const ultimo = registros.length > antesOps ? registros[registros.length - 1] : undefined;
      filas.push({
        operacion: id,
        ruta,
        permitida: respuesta.status !== 403,
        codigoHttp: respuesta.status,
        ...(cuerpo.codigo ? { codigo: cuerpo.codigo } : {}),
        motor: cuerpo.motor === 'gemini-simulado' ? 'gemini-simulado' : 'respaldo',
        costeCreditos: ultimo?.costeCreditos ?? 0,
        creditosReembolsados: ultimo?.creditosReembolsados ?? 0,
        llamadasProveedor: ultimo?.llamadasProveedor ?? 0,
      });
    }
  } finally {
    await new Promise<void>((resolve) => servidor.close(() => resolve()));
  }

  const registros = registro.listar();
  return {
    perfil: opciones.perfil,
    uidPrueba,
    filas,
    consumo: {
      operaciones: registros.length,
      creditosConsumidos: registros.reduce((total, r) => total + r.costeCreditos, 0)
        - registros.reduce((total, r) => total + (r.creditosReembolsados ?? 0), 0),
      creditosReembolsados: registros.reduce((total, r) => total + (r.creditosReembolsados ?? 0), 0),
      llamadasProveedor: llamadas.length,
    },
    eventos,
    registros,
  };
}

/**
 * Llamada al doble simulado a través del mismo reintento del núcleo (sin SDK).
 * La operación viaja en los parámetros para que el doble pueda simular fallos
 * por operación; el proveedor real ignora ese campo adicional.
 */
async function generarContenidoSimulado(ai: ReturnType<typeof clienteIA>, operacion: IdOperacionIA): Promise<string | undefined> {
  if (!ai) return undefined;
  const respuesta = await generateGeminiWithRetry(ai, {
    model: 'modelo-simulado',
    contents: { parts: [{ text: `validación no productiva ${operacion}` }] },
    operacion,
  });
  return respuesta?.text;
}
