/**
 * IA · FASE 9 — RUTAS DEL ALTA GUIADA DE LA LLAVE PROPIA (Vía 2)
 * ===============================================================
 * Superficie HTTP con la que el usuario gestiona SU llave del proveedor:
 *
 *   GET    /api/ia/llave            — estado del subsistema + resumen SIN
 *          secretos de la llave del usuario + pasos del alta guiada.
 *   PUT    /api/ia/llave            — alta o sustitución ({ llave }).
 *   DELETE /api/ia/llave            — revocación.
 *   POST   /api/ia/llave/verificar  — verificación con el proveedor (sólo si
 *          el entorno la activa; por defecto 503 VERIFICACION_NO_DISPONIBLE).
 *
 * Autorización SIEMPRE en servidor: token Firebase verificado → uid → perfil
 * veraz del espejo de identidad (misma fuente que el núcleo y el gobierno). La
 * llave de un usuario sólo la gestiona ese usuario: no hay ruta de
 * administración que lea llaves ajenas. Las mutaciones exigen la misma
 * `Idempotency-Key` que el resto de la capa de IA.
 *
 * Sin clave maestra (estado del repositorio) todo responde 503
 * LLAVES_NO_CONFIGURADAS: nadie puede registrar llaves y el núcleo nunca crea
 * el cliente del proveedor. Los logs llevan uid, estado y sufijo: NUNCA la
 * llave.
 */
import type { Express, RequestHandler } from 'express';
import { CABECERA_IDEMPOTENCIA_IA, PATRON_CLAVE_IDEMPOTENCIA_IA } from '../../src/ia/catalogoOperacionesIA.js';
import {
  MAX_LONGITUD_ENTRADA_LLAVE,
  RUTA_LLAVE_USUARIO_IA,
  RUTA_VERIFICAR_LLAVE_USUARIO_IA,
  type CodigoRechazoLlavesIA,
  type ModoLlavesIA,
  type ModoSinLlaveIA,
  type ModoVerificacionLlaveIA,
} from '../../src/ia/llavesUsuarioContrato.js';
import { resumenAltaGuiadaLlave } from '../../src/ia/tutorialLlaveUsuarioIA.js';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares.js';
import type { IdentidadVerificada } from '../titularidades/googleBackend';
import type { GobiernoIA } from './gobiernoIA.js';
import { ConflictoConcurrenciaLlavesIA, type ServicioLlavesIA } from './llavesUsuarioIA.js';
import type { ResultadoVerificadorLlaveIA, VerificadorLlaveIA } from './nucleoIA.js';

export interface EventoLlavesIA {
  evento: 'LLAVE_ALTA' | 'LLAVE_SUSTITUIDA' | 'LLAVE_REVOCADA' | 'LLAVE_VERIFICADA' | 'LLAVE_RECHAZADA' | 'LLAVES_RECHAZADA';
  ruta: string;
  codigo?: string;
  codigoHttp?: number;
  uid?: string;
  sufijo?: string | null;
}

// El verificador real (`crearVerificadorGeminiReal`) vive en nucleoIA.ts: el SDK
// del proveedor sólo se instancia allí (invariante de la Fase 1).
export type { ResultadoVerificadorLlaveIA, VerificadorLlaveIA } from './nucleoIA.js';

export interface DependenciasRutasLlavesIA {
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  /** Gobierno para el perfil veraz (misma fuente que el núcleo). `null` ⇒ 503. */
  gobierno: GobiernoIA | null;
  /** Servicio de llaves; `null` ⇒ 503 LLAVES_NO_CONFIGURADAS. */
  llaves: ServicioLlavesIA | null;
  /** Clave maestra presente pero inválida: fallo cerrado. */
  errorLlaves?: 'LLAVES_CLAVE_MAESTRA_INVALIDA';
  sinLlave: ModoSinLlaveIA;
  /** Verificador real (sólo con IA_LLAVES_VERIFICACION=PROVEEDOR); `null` ⇒ desactivado. */
  verificador: VerificadorLlaveIA | null;
  ahora?: () => Date;
  log?: (evento: EventoLlavesIA) => void;
}

function logPorDefecto(evento: EventoLlavesIA): void {
  const linea = `[ia-llaves] ${JSON.stringify(evento)}`;
  if (evento.evento === 'LLAVES_RECHAZADA' || evento.evento === 'LLAVE_RECHAZADA') console.warn(linea);
  else console.info(linea);
}

function modoLlaves(deps: Pick<DependenciasRutasLlavesIA, 'llaves' | 'errorLlaves'>): ModoLlavesIA {
  if (deps.errorLlaves) return 'CLAVE_MAESTRA_INVALIDA';
  return deps.llaves ? 'USUARIO' : 'NO_CONFIGURADO';
}

function modoVerificacion(deps: Pick<DependenciasRutasLlavesIA, 'verificador'>): ModoVerificacionLlaveIA {
  return deps.verificador ? 'PROVEEDOR' : 'DESACTIVADA';
}

/** Guardia: subsistema configurado + token verificado + perfil veraz ACTIVO. */
export function crearGuardiaLlavesIA(deps: DependenciasRutasLlavesIA): RequestHandler {
  const log = deps.log ?? logPorDefecto;
  return async function guardiaLlavesIA(req, res, next): Promise<void> {
    const responder = (codigoHttp: number, codigo: CodigoRechazoLlavesIA | string, mensaje: string): void => {
      log({ evento: 'LLAVES_RECHAZADA', ruta: req.path, codigo, codigoHttp });
      res.status(codigoHttp).json({ error: mensaje, codigo, llaves: modoLlaves(deps) });
    };
    if (deps.errorLlaves) {
      return void responder(503, deps.errorLlaves, 'La clave maestra de las llaves de IA está mal configurada en el servidor.');
    }
    if (!deps.llaves) {
      return void responder(503, 'LLAVES_NO_CONFIGURADAS', 'El alta de llaves propias de IA no está disponible en este entorno.');
    }
    if (!deps.gobierno) {
      return void responder(503, 'GOBIERNO_NO_DISPONIBLE', 'El gobierno de IA no está configurado (sin credencial de servicio).');
    }
    const token = tokenDe(req);
    if (!token) return void responder(401, 'NO_AUTENTICADO', 'Inicia sesión para gestionar tu llave de IA.');
    let identidad: IdentidadVerificada | null = null;
    try {
      identidad = await deps.verificarToken(token);
    } catch {
      identidad = null;
    }
    if (!identidad?.uid) return void responder(401, 'NO_AUTENTICADO', 'La sesión no es válida o ha caducado.');
    let perfil;
    try {
      perfil = await deps.gobierno.perfilVeraz(identidad.uid);
    } catch {
      return void responder(503, 'GOBIERNO_NO_DISPONIBLE', 'No se ha podido verificar tu identidad.');
    }
    if (perfil.estado === 'RECHAZADO') return void responder(403, 'PERFIL_NO_VALIDO', 'Tu perfil no está disponible o no está activo.');
    res.locals.uidLlavesIA = identidad.uid;
    next();
  };
}

function exigirClaveIdempotencia(req: { get: (nombre: string) => string | undefined }): string | null {
  const clave = req.get(CABECERA_IDEMPOTENCIA_IA) ?? '';
  return PATRON_CLAVE_IDEMPOTENCIA_IA.test(clave) ? clave : null;
}

export function montarRutasLlavesIA(app: Express, deps: DependenciasRutasLlavesIA): void {
  const ahora = deps.ahora ?? (() => new Date());
  const log = deps.log ?? logPorDefecto;
  const guardia = crearGuardiaLlavesIA(deps);
  const estadoSubsistema = () => ({ modo: modoLlaves(deps), sinLlave: deps.sinLlave, verificacion: modoVerificacion(deps) });
  const faltaIdempotencia = (res: Parameters<RequestHandler>[1]) =>
    res.status(400).json({
      error: `Falta la cabecera ${CABECERA_IDEMPOTENCIA_IA} o no es válida (8-128 caracteres: letras, números, _ - : .).`,
      codigo: 'IDEMPOTENCIA_REQUERIDA',
    });

  app.get(RUTA_LLAVE_USUARIO_IA, guardia, async (_req, res) => {
    const llaves = deps.llaves as ServicioLlavesIA;
    const uid = res.locals.uidLlavesIA as string;
    const resumen = await llaves.resumen(uid);
    return res.json({ llaves: estadoSubsistema(), llave: resumen, altaGuiada: resumenAltaGuiadaLlave() });
  });

  app.put(RUTA_LLAVE_USUARIO_IA, guardia, async (req, res) => {
    const llaves = deps.llaves as ServicioLlavesIA;
    const uid = res.locals.uidLlavesIA as string;
    const clave = exigirClaveIdempotencia(req);
    if (!clave) return faltaIdempotencia(res);
    const entrada = req.body?.llave;
    if (typeof entrada !== 'string' || entrada.length > MAX_LONGITUD_ENTRADA_LLAVE) {
      log({ evento: 'LLAVE_RECHAZADA', ruta: RUTA_LLAVE_USUARIO_IA, uid, codigo: 'CUERPO_INVALIDO', codigoHttp: 422 });
      return res.status(422).json({ error: `llave debe ser un texto de hasta ${MAX_LONGITUD_ENTRADA_LLAVE} caracteres.`, codigo: 'CUERPO_INVALIDO' });
    }
    let resultado;
    try {
      resultado = await llaves.registrar({ uid, valor: entrada, claveIdempotencia: clave, ahora: ahora() });
    } catch (error) {
      if (error instanceof ConflictoConcurrenciaLlavesIA) {
        return res.status(503).json({ error: 'La llave cambió mientras se guardaba; vuelve a intentarlo.', codigo: 'CONFLICTO_CONCURRENCIA' });
      }
      throw error;
    }
    if (resultado.estado === 'FORMATO_INVALIDO') {
      log({ evento: 'LLAVE_RECHAZADA', ruta: RUTA_LLAVE_USUARIO_IA, uid, codigo: resultado.codigo, codigoHttp: 422 });
      return res.status(422).json({ error: resultado.mensaje, codigo: 'LLAVE_FORMATO_INVALIDO', detalle: resultado.codigo });
    }
    if (resultado.estado === 'DUPLICADA') {
      return res.status(409).json({ error: 'Esta acción ya se aplicó con la misma clave de idempotencia.', codigo: 'LLAVE_ACCION_DUPLICADA' });
    }
    if (resultado.estado === 'REGISTRADA') {
      log({ evento: resultado.sustitucion ? 'LLAVE_SUSTITUIDA' : 'LLAVE_ALTA', ruta: RUTA_LLAVE_USUARIO_IA, uid, sufijo: resultado.resumen.sufijo });
    }
    return res.json({ estado: resultado.estado, llave: resultado.resumen, llaves: estadoSubsistema() });
  });

  app.delete(RUTA_LLAVE_USUARIO_IA, guardia, async (req, res) => {
    const llaves = deps.llaves as ServicioLlavesIA;
    const uid = res.locals.uidLlavesIA as string;
    const clave = exigirClaveIdempotencia(req);
    if (!clave) return faltaIdempotencia(res);
    let resultado;
    try {
      resultado = await llaves.revocar({ uid, claveIdempotencia: clave, ahora: ahora() });
    } catch (error) {
      if (error instanceof ConflictoConcurrenciaLlavesIA) {
        return res.status(503).json({ error: 'La llave cambió mientras se revocaba; vuelve a intentarlo.', codigo: 'CONFLICTO_CONCURRENCIA' });
      }
      throw error;
    }
    if (resultado.estado === 'SIN_LLAVE') return res.status(404).json({ error: 'No tienes ninguna llave activa que revocar.', codigo: 'SIN_LLAVE' });
    if (resultado.estado === 'DUPLICADA') {
      return res.status(409).json({ error: 'Esta acción ya se aplicó con la misma clave de idempotencia.', codigo: 'LLAVE_ACCION_DUPLICADA' });
    }
    log({ evento: 'LLAVE_REVOCADA', ruta: RUTA_LLAVE_USUARIO_IA, uid });
    return res.json({ estado: 'REVOCADA', llave: resultado.resumen, llaves: estadoSubsistema() });
  });

  app.post(RUTA_VERIFICAR_LLAVE_USUARIO_IA, guardia, async (req, res) => {
    const llaves = deps.llaves as ServicioLlavesIA;
    const uid = res.locals.uidLlavesIA as string;
    const clave = exigirClaveIdempotencia(req);
    if (!clave) return faltaIdempotencia(res);
    if (!deps.verificador) {
      // Estado del repositorio: la comprobación con el proveedor exige autorización
      // expresa (es una llamada real). La llave sigue REGISTRADA y utilizable.
      return res.status(503).json({
        error: 'La comprobación con el proveedor está desactivada en este entorno; la primera operación de IA servirá de comprobación.',
        codigo: 'VERIFICACION_NO_DISPONIBLE',
        llaves: estadoSubsistema(),
      });
    }
    const resolucion = await llaves.resolverParaOperacion(uid);
    if (resolucion.estado !== 'DISPONIBLE') return res.status(404).json({ error: 'No tienes ninguna llave activa que comprobar.', codigo: 'SIN_LLAVE' });
    let veredicto: ResultadoVerificadorLlaveIA;
    try {
      veredicto = await deps.verificador(resolucion.valor);
    } catch {
      veredicto = 'ERROR';
    }
    if (veredicto === 'ERROR') {
      return res.status(503).json({ error: 'No se ha podido contactar con el proveedor para comprobar la llave. Inténtalo más tarde.', codigo: 'PROVEEDOR_NO_DISPONIBLE' });
    }
    const marca = await llaves.marcarVerificacion({ uid, resultado: veredicto === 'OK' ? 'OK' : 'FALLIDA', claveIdempotencia: clave, ahora: ahora() });
    if (marca.estado === 'DUPLICADA') {
      return res.status(409).json({ error: 'Esta comprobación ya se aplicó con la misma clave de idempotencia.', codigo: 'LLAVE_ACCION_DUPLICADA' });
    }
    if (marca.estado === 'SIN_LLAVE') return res.status(404).json({ error: 'No tienes ninguna llave activa que comprobar.', codigo: 'SIN_LLAVE' });
    if (veredicto === 'RECHAZADA') {
      log({ evento: 'LLAVE_RECHAZADA', ruta: RUTA_VERIFICAR_LLAVE_USUARIO_IA, uid, codigo: 'LLAVE_RECHAZADA_POR_PROVEEDOR', codigoHttp: 422, sufijo: resolucion.sufijo });
      return res.status(422).json({ error: 'El proveedor ha rechazado la llave. Revisa que sigue activa en Google AI Studio o registra una nueva.', codigo: 'LLAVE_RECHAZADA_POR_PROVEEDOR', llave: marca.resumen });
    }
    log({ evento: 'LLAVE_VERIFICADA', ruta: RUTA_VERIFICAR_LLAVE_USUARIO_IA, uid, sufijo: resolucion.sufijo });
    return res.json({ estado: 'VERIFICADA', llave: marca.resumen, llaves: estadoSubsistema() });
  });
}
