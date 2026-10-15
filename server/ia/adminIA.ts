/**
 * IA · FASE 2 — RUTAS DE ADMINISTRACIÓN DEL GOBIERNO DE USO
 * =========================================================
 * Panel de consulta y acción para ADMINISTRADORES (verificado en servidor con
 * la misma fuente de identidad autorizada que el núcleo: token Firebase → uid
 * → espejo `usuarios_auth` veraz). Nada de esto se expone a perfiles no
 * administradores y ningún valor lo decide el cliente.
 *
 *   GET  /api/ia/admin/resumen             — política (con su estado de
 *        aprobación), modo del gobierno y últimas operaciones globales.
 *   GET  /api/ia/admin/cuenta/:uid         — cuenta (saldo, cuotas, bloqueo),
 *        sus últimas operaciones y sus ajustes.
 *   POST /api/ia/admin/cuenta/:uid/bloqueo — bloquear/desbloquear el uso de IA.
 *   POST /api/ia/admin/cuenta/:uid/credito — mover el saldo con un importe
 *        EXPLÍCITO del administrador (no hay tarifas ni saldos inventados).
 *
 * Los POST exigen la misma cabecera `Idempotency-Key` que el núcleo: el id del
 * ajuste es determinista por (admin, clave), de modo que un reintento no aplica
 * dos veces el mismo cambio. Los ajustes quedan en `ia_ajustes` (auditoría con
 * uids, importes y motivos breves; sin datos personales innecesarios).
 */
import type { Express, RequestHandler } from 'express';
import {
  CABECERA_IDEMPOTENCIA_IA,
  PATRON_CLAVE_IDEMPOTENCIA_IA,
} from '../../src/ia/catalogoOperacionesIA.js';
import { resumenPoliticaGobiernoIA, type PoliticaGobiernoIA } from '../../src/ia/gobiernoIAContrato.js';
import { tokenDe } from '../titularidades/manejadorBuscarTitulares.js';
import type { IdentidadVerificada } from '../titularidades/googleBackend';
import { ConflictoConcurrenciaIA, MAX_CREDITOS, MAX_LONGITUD_MOTIVO, type GobiernoIA } from './gobiernoIA.js';

export interface EventoAdminIA {
  evento: 'ADMIN_ACCION' | 'ADMIN_RECHAZADA';
  ruta: string;
  codigo?: string;
  codigoHttp?: number;
  uid?: string;
  uidDestino?: string;
  ajusteId?: string;
  estado?: string;
}

export interface DependenciasAdminIA {
  verificarToken: (token: string) => Promise<IdentidadVerificada | null>;
  gobierno: GobiernoIA | null;
  politica: PoliticaGobiernoIA | null;
  errorPolitica?: string;
  ahora?: () => Date;
  log?: (evento: EventoAdminIA) => void;
}

const PATRON_UID = /^[A-Za-z0-9_-]{1,128}$/;

function logPorDefecto(evento: EventoAdminIA): void {
  const linea = `[ia-admin] ${JSON.stringify(evento)}`;
  if (evento.evento === 'ADMIN_RECHAZADA') console.warn(linea);
  else console.info(linea);
}

function esUidValido(valor: string): boolean {
  return PATRON_UID.test(valor);
}

function motivoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length >= 1 && valor.trim().length <= MAX_LONGITUD_MOTIVO;
}

/** Guardia: token verificado + perfil veraz ADMINISTRADOR y ACTIVO. */
export function crearGuardiaAdministradorIA(deps: DependenciasAdminIA): RequestHandler {
  return async function guardiaAdministradorIA(req, res, next): Promise<void> {
    const responder = (codigoHttp: number, codigo: string, mensaje: string): void => {
      deps.log?.({ evento: 'ADMIN_RECHAZADA', ruta: req.path, codigo, codigoHttp });
      res.status(codigoHttp).json({ error: mensaje, codigo });
    };
    if (deps.errorPolitica) {
      return void responder(503, 'POLITICA_IA_INVALIDA', 'La política de uso de IA está mal configurada.');
    }
    if (!deps.gobierno) {
      return void responder(503, 'GOBIERNO_NO_DISPONIBLE', 'El gobierno de IA no está configurado (sin credencial de servicio).');
    }
    const token = tokenDe(req);
    if (!token) return void responder(401, 'NO_AUTENTICADO', 'Inicia sesión como administrador.');
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
    if (perfil.perfil.tipoPerfil !== 'ADMINISTRADOR') {
      return void responder(403, 'NO_ADMINISTRADOR', 'Esta consulta requiere un perfil ADMINISTRADOR.');
    }
    res.locals.uidAdministradorIA = identidad.uid;
    next();
  };
}

/** Exige una `Idempotency-Key` válida (misma regla que el núcleo de IA). */
function exigirClaveIdempotencia(req: { get: (nombre: string) => string | undefined }): string | null {
  const clave = req.get(CABECERA_IDEMPOTENCIA_IA) ?? '';
  return PATRON_CLAVE_IDEMPOTENCIA_IA.test(clave) ? clave : null;
}

export function montarRutasAdminIA(app: Express, deps: DependenciasAdminIA): void {
  const ahora = deps.ahora ?? (() => new Date());
  const log = deps.log ?? logPorDefecto;
  const guardia = crearGuardiaAdministradorIA(deps);
  const gobierno = deps.gobierno;

  app.get('/api/ia/admin/resumen', guardia, async (_req, res) => {
    if (!gobierno) return res.status(503).json({ error: 'El gobierno de IA no está configurado.', codigo: 'GOBIERNO_NO_DISPONIBLE' });
    const operaciones = await gobierno.operacionesRecientes(25);
    return res.json({
      gobierno: { modo: gobierno.modo, ...(deps.errorPolitica ? { errorPolitica: deps.errorPolitica } : {}) },
      politica: deps.politica ? resumenPoliticaGobiernoIA(deps.politica) : null,
      operacionesRecientes: operaciones,
    });
  });

  app.get('/api/ia/admin/cuenta/:uid', guardia, async (req, res) => {
    if (!gobierno) return res.status(503).json({ error: 'El gobierno de IA no está configurado.', codigo: 'GOBIERNO_NO_DISPONIBLE' });
    const uid = String(req.params.uid ?? '');
    if (!esUidValido(uid)) return res.status(400).json({ error: 'Uid no válido.', codigo: 'UID_INVALIDO' });
    const [cuenta, operaciones, ajustes] = await Promise.all([
      gobierno.cuenta(uid),
      gobierno.operacionesDeUsuario(uid, 25),
      gobierno.ajustesDeUsuario(uid, 25),
    ]);
    return res.json({ uid, cuenta, operaciones, ajustes });
  });

  app.post('/api/ia/admin/cuenta/:uid/bloqueo', guardia, async (req, res) => {
    if (!gobierno) return res.status(503).json({ error: 'El gobierno de IA no está configurado.', codigo: 'GOBIERNO_NO_DISPONIBLE' });
    const uid = String(req.params.uid ?? '');
    const adminUid = (res.locals.uidAdministradorIA as string | undefined) ?? '';
    if (!esUidValido(uid)) return res.status(400).json({ error: 'Uid no válido.', codigo: 'UID_INVALIDO' });
    if (uid === adminUid) return res.status(422).json({ error: 'Un administrador no puede bloquearse a sí mismo.', codigo: 'AUTOBLOQUEO' });
    const clave = exigirClaveIdempotencia(req);
    if (!clave) {
      return res.status(400).json({
        error: `Falta la cabecera ${CABECERA_IDEMPOTENCIA_IA} o no es válida (8-128 caracteres: letras, números, _ - : .).`,
        codigo: 'IDEMPOTENCIA_REQUERIDA',
      });
    }
    const bloqueado = req.body?.bloqueado;
    if (typeof bloqueado !== 'boolean') return res.status(422).json({ error: 'bloqueado debe ser true o false.', codigo: 'CUERPO_INVALIDO' });
    const motivo = req.body?.motivo;
    if (motivo !== undefined && !motivoValido(motivo)) {
      return res.status(422).json({ error: `motivo debe tener entre 1 y ${MAX_LONGITUD_MOTIVO} caracteres.`, codigo: 'CUERPO_INVALIDO' });
    }
    let resultado: Awaited<ReturnType<GobiernoIA['bloquear']>>;
    try {
      resultado = await gobierno.bloquear({
        uid,
        adminUid,
        claveIdempotencia: clave,
        bloqueado,
        ...(motivoValido(motivo) ? { motivo: motivo.trim() } : {}),
        ahora: ahora(),
      });
    } catch (error) {
      if (error instanceof ConflictoConcurrenciaIA) {
        log({ evento: 'ADMIN_ACCION', ruta: '/api/ia/admin/cuenta/:uid/bloqueo', uid: adminUid, uidDestino: uid, estado: 'ERROR_CONCURRENCIA' });
        return res.status(503).json({
          error: 'La cuenta cambió mientras se aplicaba el ajuste; vuelve a intentarlo en unos segundos.',
          codigo: 'CONFLICTO_CONCURRENCIA',
        });
      }
      throw error;
    }
    log({
      evento: 'ADMIN_ACCION',
      ruta: '/api/ia/admin/cuenta/:uid/bloqueo',
      uid: adminUid,
      uidDestino: uid,
      estado: resultado.estado,
      ...(bloqueado ? {} : { codigo: 'DESBLOQUEO' }),
    });
    if (resultado.estado === 'DUPLICADO') {
      return res.status(409).json({ error: 'Este ajuste ya se aplicó con la misma clave de idempotencia.', codigo: 'AJUSTE_DUPLICADO' });
    }
    return res.json({ estado: resultado.estado, uid });
  });

  app.post('/api/ia/admin/cuenta/:uid/credito', guardia, async (req, res) => {
    if (!gobierno) return res.status(503).json({ error: 'El gobierno de IA no está configurado.', codigo: 'GOBIERNO_NO_DISPONIBLE' });
    const uid = String(req.params.uid ?? '');
    const adminUid = (res.locals.uidAdministradorIA as string | undefined) ?? '';
    if (!esUidValido(uid)) return res.status(400).json({ error: 'Uid no válido.', codigo: 'UID_INVALIDO' });
    const clave = exigirClaveIdempotencia(req);
    if (!clave) {
      return res.status(400).json({
        error: `Falta la cabecera ${CABECERA_IDEMPOTENCIA_IA} o no es válida (8-128 caracteres: letras, números, _ - : .).`,
        codigo: 'IDEMPOTENCIA_REQUERIDA',
      });
    }
    const creditos = req.body?.creditos;
    if (typeof creditos !== 'number' || !Number.isInteger(creditos) || creditos === 0 || Math.abs(creditos) > MAX_CREDITOS) {
      return res.status(422).json({
        error: `creditos debe ser un entero distinto de 0 entre -${MAX_CREDITOS} y ${MAX_CREDITOS}.`,
        codigo: 'CUERPO_INVALIDO',
      });
    }
    const motivo = req.body?.motivo;
    if (!motivoValido(motivo)) {
      return res.status(422).json({ error: `motivo es obligatorio (1-${MAX_LONGITUD_MOTIVO} caracteres).`, codigo: 'CUERPO_INVALIDO' });
    }
    let resultado: Awaited<ReturnType<GobiernoIA['ajustarCredito']>>;
    try {
      resultado = await gobierno.ajustarCredito({
        uid,
        adminUid,
        claveIdempotencia: clave,
        creditos,
        motivo: motivo.trim(),
        ahora: ahora(),
      });
    } catch (error) {
      if (error instanceof ConflictoConcurrenciaIA) {
        log({ evento: 'ADMIN_ACCION', ruta: '/api/ia/admin/cuenta/:uid/credito', uid: adminUid, uidDestino: uid, estado: 'ERROR_CONCURRENCIA' });
        return res.status(503).json({
          error: 'La cuenta cambió mientras se aplicaba el ajuste; vuelve a intentarlo en unos segundos.',
          codigo: 'CONFLICTO_CONCURRENCIA',
        });
      }
      throw error;
    }
    log({
      evento: 'ADMIN_ACCION',
      ruta: '/api/ia/admin/cuenta/:uid/credito',
      uid: adminUid,
      uidDestino: uid,
      estado: resultado.estado,
    });
    if (resultado.estado === 'DUPLICADO') {
      return res.status(409).json({ error: 'Este ajuste ya se aplicó con la misma clave de idempotencia.', codigo: 'AJUSTE_DUPLICADO' });
    }
    if (resultado.estado === 'FUERA_DE_LIMITES') {
      return res.status(422).json({ error: resultado.detalle, codigo: 'SALDO_FUERA_DE_LIMITES' });
    }
    return res.json({ estado: resultado.estado, uid, creditos });
  });
}
