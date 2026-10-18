/**
 * IA · FASE 2 — GOBIERNO DEL USO DE IA (permisos, cuotas, créditos y bloqueos)
 * ===========================================================================
 * Se monta DENTRO del núcleo (`server/ia/nucleoIA.ts`), ANTES de crear el
 * cliente del proveedor: nada de lo que decide se delega al cliente.
 *
 *   · PERFIL VERAZ — la identidad autorizada es el espejo `usuarios_auth/{uid}`
 *     contrastado con la ficha `usuarios/{usuarioId}` (mismo criterio que
 *     `perfilActualVeraz()` de `firestore.rules`): mismo `authUid`, estado
 *     `ACTIVO` y mismo `tipoPerfil`. Sin espejo, sin ficha o con discordancia ⇒
 *     rechazo. Nunca se consultan prompts, cuerpos ni datos personales.
 *   · PERMISOS — por rol (`tipoPerfil` del espejo veraz) y por operación del
 *     catálogo (`src/ia/gobiernoIAContrato.ts`). Los roles NO se inventan.
 *   · CUOTAS Y SALDO — una cuenta por usuario en `ia_cuentas/{uid}`. La reserva
 *     de uso es un compare-and-swap sobre `updateTime` de Firestore: bajo
 *     concurrencia, cada petición valida y descuenta sobre la versión que lee;
 *     si otra la gana, relee y reintenta (máx. `MAX_INTENTOS_CAS`). El saldo
 *     inicial es 0: sólo lo mueve un administrador con importes explícitos.
 *   · REEMBOLSO — si la operación cierra sin ninguna llamada exitosa al
 *     proveedor, los créditos reservados se devuelven (mismo CAS) y el registro
 *     queda cerrado con `creditosReembolsados`.
 *   · AJUSTES — `ia_ajustes/{id determinista}` ancla la idempotencia de cada
 *     acción de administración (crédito o bloqueo) con la `Idempotency-Key`.
 *
 * Colecciones: `ia_cuentas` e `ia_ajustes` NO tienen `match` propio en
 * `firestore.rules`, así que la denegación global las cubre: sólo el servidor
 * (credencial de servicio, REST) puede leerlas y escribirlas. No se modifican
 * reglas ni datos existentes.
 *
 * Qué NO se guarda: prompts, documentos, tokens de autenticación, emails ni
 * nombres — sólo uids, contadores, códigos normalizados y motivos breves (máx.
 * 120 caracteres) escritos por administradores.
 */
import { createHash } from 'node:crypto';
import type { IdOperacionIA } from '../../src/ia/catalogoOperacionesIA.js';
import {
  TIPOS_PERFIL_IA,
  costeOperacion,
  permiteOperacion,
  type AjusteResumenIADTO,
  type CuentaIADTO,
  type OperacionResumenIADTO,
  type PerfilVerazIADTO,
  type PoliticaGobiernoIA,
  type TipoAjusteIADTO,
  type TipoPerfilIA,
} from '../../src/ia/gobiernoIAContrato.js';

// Los tipos de datos del panel viven en el contrato compartido; aquí se
// reexportan con el nombre que usa el servidor.
export type PerfilVerazIA = PerfilVerazIADTO;
export type CuentaIA = CuentaIADTO;
export type OperacionResumenIA = OperacionResumenIADTO;
export type AjusteResumenIA = AjusteResumenIADTO;
export type TipoAjusteIA = TipoAjusteIADTO;
import type { RegistroOperacionIA } from './registroOperacionesIA.js';

export const COLECCION_CUENTAS_IA = 'ia_cuentas';
export const COLECCION_AJUSTES_IA = 'ia_ajustes';
export const VERSION_CUENTA_IA = 1;
export const MAX_INTENTOS_CAS = 5;
export const MAX_CREDITOS = 1_000_000;
export const MAX_LONGITUD_MOTIVO = 120;

// ---------------------------------------------------------------------------
// Tipos del contrato de gobierno (servidor)
// ---------------------------------------------------------------------------

export type CodigoRechazoGobiernoIA =
  | 'PERFIL_NO_ENCONTRADO'
  | 'USUARIO_NO_ACTIVO'
  | 'PERFIL_INCOHERENTE'
  | 'OPERACION_NO_PERMITIDA'
  | 'CUENTA_BLOQUEADA'
  | 'SALDO_INSUFICIENTE'
  | 'CUOTA_DIA_EXCEDIDA'
  | 'CUOTA_MES_EXCEDIDA'
  | 'GOBIERNO_NO_DISPONIBLE';

export type ResultadoPerfilIA =
  | { estado: 'VERAZ'; perfil: PerfilVerazIA }
  | { estado: 'RECHAZADO'; codigo: 'PERFIL_NO_ENCONTRADO' | 'USUARIO_NO_ACTIVO' | 'PERFIL_INCOHERENTE' };

export type ResultadoReservaUsoIA =
  | { estado: 'RESERVADO'; coste: number }
  | { estado: 'RECHAZADO'; codigo: 'CUENTA_BLOQUEADA' | 'SALDO_INSUFICIENTE' | 'CUOTA_DIA_EXCEDIDA' | 'CUOTA_MES_EXCEDIDA' };

export interface EntradaReservaUsoIA {
  uid: string;
  operacion: IdOperacionIA;
  operacionId: string;
  ahora: Date;
}

export interface EntradaReembolsoIA {
  uid: string;
  creditos: number;
  operacionId: string;
  /** Ventana de la RESERVA: si ya rodó, no se tocan los contadores actuales. */
  ventanaDiaClave: string;
  ventanaMesClave: string;
  ahora: Date;
}

export interface EntradaAjusteIA {
  uid: string;
  adminUid: string;
  claveIdempotencia: string;
  motivo?: string;
  ahora: Date;
}

export interface EntradaCreditoIA extends EntradaAjusteIA {
  /** Entero ≠ 0 (positivo = conceder, negativo = corregir a la baja). */
  creditos: number;
}

export interface EntradaBloqueoIA extends EntradaAjusteIA {
  bloqueado: boolean;
}

export type ResultadoAjusteIA =
  | { estado: 'APLICADO' }
  | { estado: 'DUPLICADO' }
  | { estado: 'FUERA_DE_LIMITES'; detalle: string };

/** Puerto Firestore que necesita el gobierno (lo cumple `ClienteFirestoreRest`). */
export interface PuertoGobiernoFirestoreIA {
  leerDocumento(ruta: string): Promise<{ datos: Record<string, unknown>; updateTime?: string } | null>;
  crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarCamposSiVersion(
    coleccion: string,
    id: string,
    datos: Record<string, unknown>,
    updateTimeEsperado: string,
  ): Promise<boolean>;
  consultarIgualdadesOrden(
    coleccion: string,
    consulta: {
      igualdades?: Array<[campo: string, valor: string]>;
      orden?: { campo: string; direccion: 'ASCENDING' | 'DESCENDING' };
      limite: number;
    },
  ): Promise<Array<{ id: string; datos: Record<string, unknown> }>>;
}

export interface GobiernoIA {
  readonly modo: 'FIRESTORE' | 'MEMORIA';
  readonly politica: PoliticaGobiernoIA;
  /** Espejo veraz del uid (fuente de identidad autorizada). */
  perfilVeraz(uid: string): Promise<ResultadoPerfilIA>;
  /** Valida bloqueo/cuotas/saldo y descuenta ATÓMICAMENTE antes del proveedor. */
  reservarUso(entrada: EntradaReservaUsoIA): Promise<ResultadoReservaUsoIA>;
  /** Devuelve los créditos de una reserva (sin llamadas exitosas al proveedor). */
  reembolsar(entrada: EntradaReembolsoIA): Promise<boolean>;
  cuenta(uid: string): Promise<CuentaIA | null>;
  bloquear(entrada: EntradaBloqueoIA): Promise<ResultadoAjusteIA>;
  ajustarCredito(entrada: EntradaCreditoIA): Promise<ResultadoAjusteIA>;
  operacionesDeUsuario(uid: string, limite?: number): Promise<OperacionResumenIA[]>;
  operacionesRecientes(limite?: number): Promise<OperacionResumenIA[]>;
  ajustesDeUsuario(uid: string, limite?: number): Promise<AjusteResumenIA[]>;
}

// ---------------------------------------------------------------------------
// Utilidades puras (exportadas para pruebas directas)
// ---------------------------------------------------------------------------

export function claveVentanaDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function claveVentanaMes(fecha: Date): string {
  return fecha.toISOString().slice(0, 7);
}

/** Id determinista del ajuste: la misma clave del mismo admin es el mismo ajuste. */
export function idAjusteIA(adminUid: string, claveIdempotencia: string): string {
  const huella = createHash('sha256').update(`${adminUid}\n${claveIdempotencia}`).digest('hex');
  return `iaadj_${huella.slice(0, 40)}`;
}

function entero(valor: unknown, porDefecto = 0): number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? Math.floor(valor) : porDefecto;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor !== '' ? valor : undefined;
}

/** Reconstruye la cuenta desde el almacén, defensivamente. */
export function normalizarCuentaIA(datos: Record<string, unknown>, uid: string): CuentaIA {
  const version = entero(datos.version, 0);
  if (version !== VERSION_CUENTA_IA) {
    throw new Error(`La cuenta de IA ${uid} tiene versión ${version}, no soportada (esperada ${VERSION_CUENTA_IA}).`);
  }
  return {
    version,
    uid,
    saldoCreditos: entero(datos.saldoCreditos),
    bloqueada: datos.bloqueada === true,
    motivoBloqueo: texto(datos.motivoBloqueo),
    ventanaDiaClave: texto(datos.ventanaDiaClave) ?? '',
    ventanaDiaUsos: entero(datos.ventanaDiaUsos),
    ventanaMesClave: texto(datos.ventanaMesClave) ?? '',
    ventanaMesUsos: entero(datos.ventanaMesUsos),
    totalOperaciones: entero(datos.totalOperaciones),
    totalCreditosConsumidos: entero(datos.totalCreditosConsumidos),
    ultimoOperacionId: texto(datos.ultimoOperacionId),
    actualizadoEn: texto(datos.actualizadoEn) ?? new Date(0).toISOString(),
  };
}

/** Valida el uso contra la cuenta y la política. Rechazos en orden estable. */
export function validarUsoCuentaIA(
  cuenta: CuentaIA,
  politica: PoliticaGobiernoIA,
  ahora: Date,
): Exclude<ResultadoReservaUsoIA, { estado: 'RESERVADO' }> | null {
  if (cuenta.bloqueada) return { estado: 'RECHAZADO', codigo: 'CUENTA_BLOQUEADA' };
  if (cuenta.ventanaDiaClave === claveVentanaDia(ahora)
    && politica.cuotas.operacionesPorDia !== null
    && cuenta.ventanaDiaUsos >= politica.cuotas.operacionesPorDia) {
    return { estado: 'RECHAZADO', codigo: 'CUOTA_DIA_EXCEDIDA' };
  }
  if (cuenta.ventanaMesClave === claveVentanaMes(ahora)
    && politica.cuotas.operacionesPorMes !== null
    && cuenta.ventanaMesUsos >= politica.cuotas.operacionesPorMes) {
    return { estado: 'RECHAZADO', codigo: 'CUOTA_MES_EXCEDIDA' };
  }
  return null;
}

/** Aplica el uso a la cuenta (puro): descuenta saldo y avanza contadores con rodadura de ventanas. */
export function aplicarUsoCuentaIA(cuenta: CuentaIA, coste: number, operacionId: string, ahora: Date): CuentaIA {
  const dia = claveVentanaDia(ahora);
  const mes = claveVentanaMes(ahora);
  return {
    ...cuenta,
    saldoCreditos: cuenta.saldoCreditos - coste,
    ventanaDiaClave: dia,
    ventanaDiaUsos: cuenta.ventanaDiaClave === dia ? cuenta.ventanaDiaUsos + 1 : 1,
    ventanaMesClave: mes,
    ventanaMesUsos: cuenta.ventanaMesClave === mes ? cuenta.ventanaMesUsos + 1 : 1,
    totalOperaciones: cuenta.totalOperaciones + 1,
    totalCreditosConsumidos: cuenta.totalCreditosConsumidos + coste,
    ultimoOperacionId: operacionId,
    actualizadoEn: ahora.toISOString(),
  };
}

/** Aplica el reembolso (puro): devuelve saldo y, si la ventana no rodó, el uso. */
export function aplicarReembolsoCuentaIA(cuenta: CuentaIA, entrada: EntradaReembolsoIA): CuentaIA {
  const mismaDia = cuenta.ventanaDiaClave === entrada.ventanaDiaClave;
  const mismaMes = cuenta.ventanaMesClave === entrada.ventanaMesClave;
  return {
    ...cuenta,
    saldoCreditos: cuenta.saldoCreditos + entrada.creditos,
    ventanaDiaUsos: mismaDia ? Math.max(0, cuenta.ventanaDiaUsos - 1) : cuenta.ventanaDiaUsos,
    ventanaMesUsos: mismaMes ? Math.max(0, cuenta.ventanaMesUsos - 1) : cuenta.ventanaMesUsos,
    totalCreditosConsumidos: Math.max(0, cuenta.totalCreditosConsumidos - entrada.creditos),
    actualizadoEn: entrada.ahora.toISOString(),
  };
}

function cuentaInicialIA(uid: string, ahora: Date): CuentaIA {
  return {
    version: VERSION_CUENTA_IA,
    uid,
    saldoCreditos: 0,
    bloqueada: false,
    ventanaDiaClave: claveVentanaDia(ahora),
    ventanaDiaUsos: 0,
    ventanaMesClave: claveVentanaMes(ahora),
    ventanaMesUsos: 0,
    totalOperaciones: 0,
    totalCreditosConsumidos: 0,
    actualizadoEn: ahora.toISOString(),
  };
}

function aCamposCuenta(cuenta: CuentaIA): Record<string, unknown> {
  const campos: Record<string, unknown> = { ...cuenta };
  delete (campos as { uid?: string }).uid; // el id del documento ya la identifica
  campos.motivoBloqueo = cuenta.motivoBloqueo ?? null;
  campos.ultimoOperacionId = cuenta.ultimoOperacionId ?? null;
  return campos;
}

function aResumenOperacion(id: string, datos: Record<string, unknown>): OperacionResumenIA {
  const fecha = (v: unknown): string | undefined => {
    if (typeof v === 'string') return v;
    if (v instanceof Date) return v.toISOString();
    return undefined;
  };
  return {
    id,
    uid: String(datos.uid ?? ''),
    ...(typeof datos.uidTitular === 'string' ? { uidTitular: datos.uidTitular } : {}),
    ...(typeof datos.propietarioId === 'string' ? { propietarioId: datos.propietarioId } : {}),
    operacion: datos.operacion as IdOperacionIA,
    estado: String(datos.estado ?? ''),
    ...(datos.codigoHttp !== undefined ? { codigoHttp: entero(datos.codigoHttp) } : {}),
    ...(datos.origenRespuesta !== undefined ? { origenRespuesta: String(datos.origenRespuesta) } : {}),
    iniciadaEn: fecha(datos.iniciadaEn) ?? new Date(0).toISOString(),
    ...(datos.finalizadaEn !== undefined ? { finalizadaEn: fecha(datos.finalizadaEn) } : {}),
    ...(datos.tokensTotales !== undefined ? { tokensTotales: entero(datos.tokensTotales) } : {}),
    ...(datos.costeCreditos !== undefined ? { costeCreditos: entero(datos.costeCreditos) } : {}),
    ...(datos.creditosReembolsados !== undefined ? { creditosReembolsados: entero(datos.creditosReembolsados) } : {}),
  };
}

function aResumenAjuste(id: string, datos: Record<string, unknown>): AjusteResumenIA {
  return {
    id,
    tipo: (datos.tipo as TipoAjusteIA) ?? 'CREDITO',
    uidDestino: String(datos.uidDestino ?? ''),
    uidAdmin: String(datos.uidAdmin ?? ''),
    ...(datos.creditos !== undefined && datos.creditos !== null ? { creditos: Number(datos.creditos) } : {}),
    ...(datos.motivo !== undefined && datos.motivo !== null ? { motivo: String(datos.motivo) } : {}),
    estado: datos.estado === 'APLICADO' ? 'APLICADO' : 'PENDIENTE',
    creadoEn: typeof datos.creadoEn === 'string' ? datos.creadoEn : new Date(0).toISOString(),
  };
}

/** ¿Puede el perfil usar la operación? (delegado en la política compartida). */
export function permiteOperacionIA(politica: PoliticaGobiernoIA, perfil: TipoPerfilIA, operacion: IdOperacionIA): boolean {
  return permiteOperacion(politica, perfil, operacion);
}

/** Perfil veraz desde espejo + ficha (puro sobre datos ya leídos). */
export function perfilVerazDesdeDocumentos(
  uid: string,
  espejo: Record<string, unknown> | null,
  ficha: Record<string, unknown> | null,
): ResultadoPerfilIA {
  if (!espejo) return { estado: 'RECHAZADO' as const, codigo: 'PERFIL_NO_ENCONTRADO' as const };
  if (espejo.estado !== 'ACTIVO') return { estado: 'RECHAZADO' as const, codigo: 'USUARIO_NO_ACTIVO' as const };
  const tipoPerfil = espejo.tipoPerfil;
  if (typeof tipoPerfil !== 'string' || !(TIPOS_PERFIL_IA as readonly string[]).includes(tipoPerfil)) {
    return { estado: 'RECHAZADO' as const, codigo: 'PERFIL_INCOHERENTE' as const };
  }
  if (!ficha) return { estado: 'RECHAZADO' as const, codigo: 'PERFIL_INCOHERENTE' as const };
  if (ficha.authUid !== uid || ficha.estado !== 'ACTIVO' || ficha.tipoPerfil !== tipoPerfil) {
    return { estado: 'RECHAZADO' as const, codigo: 'PERFIL_INCOHERENTE' as const };
  }
  return { estado: 'VERAZ' as const, perfil: { uid, tipoPerfil: tipoPerfil as TipoPerfilIA, estado: 'ACTIVO' as const } };
}

// ---------------------------------------------------------------------------
// Gobierno sobre Firestore (producción) — CAS por updateTime
// ---------------------------------------------------------------------------

/** Agotados los reintentos de CAS: el llamador decide (503 en el núcleo, false en reembolso). */
export class ConflictoConcurrenciaIA extends Error {
  constructor(operacion: string) {
    super(`Conflicto de concurrencia persistente en la cuenta de IA (${operacion}).`);
  }
}

interface PasoCas<T> {
  aplicar?: CuentaIA;
  resultado?: T;
}

export function crearGobiernoFirestore(puerto: PuertoGobiernoFirestoreIA, politica: PoliticaGobiernoIA): GobiernoIA {
  async function leerCuenta(uid: string): Promise<{ cuenta: CuentaIA; updateTime: string } | null> {
    const leido = await puerto.leerDocumento(`${COLECCION_CUENTAS_IA}/${uid}`);
    if (!leido) return null;
    if (!leido.updateTime) throw new Error(`La cuenta de IA ${uid} se leyó sin versión (updateTime).`);
    return { cuenta: normalizarCuentaIA(leido.datos, uid), updateTime: leido.updateTime };
  }

  async function asegurarCuenta(uid: string, ahora: Date): Promise<void> {
    const leida = await leerCuenta(uid);
    if (leida) return;
    await puerto.crearDocumento(COLECCION_CUENTAS_IA, uid, aCamposCuenta(cuentaInicialIA(uid, ahora)));
  }

  /**
   * CAS genérico: relee y reintenta mientras otra escritura gane la carrera.
   * `paso` decide con la versión leída: `resultado` corta la ejecución (rechazo
   * o límite), `aplicar` intenta la escritura condicionada a su `updateTime`.
   */
  async function conCas<T>(uid: string, operacion: string, paso: (cuenta: CuentaIA) => PasoCas<T>): Promise<T | undefined> {
    for (let intento = 0; intento < MAX_INTENTOS_CAS; intento++) {
      const leida = await leerCuenta(uid);
      if (!leida) throw new Error(`La cuenta de IA ${uid} desapareció durante ${operacion}.`);
      const decision = paso(leida.cuenta);
      if (decision.resultado !== undefined) return decision.resultado;
      if (!decision.aplicar) continue;
      const escrita = await puerto.actualizarCamposSiVersion(
        COLECCION_CUENTAS_IA,
        uid,
        aCamposCuenta(decision.aplicar),
        leida.updateTime,
      );
      if (escrita) return undefined; // aplicado sin resultado explícito
    }
    throw new ConflictoConcurrenciaIA(operacion);
  }

  /** Marca el ajuste como APLICADO (mejor esfuerzo: si falla, queda PENDIENTE y visible en el panel). */
  async function marcarAjusteAplicado(id: string): Promise<void> {
    try {
      const leido = await puerto.leerDocumento(`${COLECCION_AJUSTES_IA}/${id}`);
      if (leido?.updateTime) {
        await puerto.actualizarCamposSiVersion(COLECCION_AJUSTES_IA, id, { estado: 'APLICADO' }, leido.updateTime);
      }
    } catch {
      /* mejor esfuerzo */
    }
  }

  return {
    modo: 'FIRESTORE',
    politica,

    async perfilVeraz(uid) {
      const espejo = await puerto.leerDocumento(`usuarios_auth/${uid}`);
      const usuarioId = espejo && typeof espejo.datos.usuarioId === 'string' ? espejo.datos.usuarioId : null;
      const ficha = usuarioId ? await puerto.leerDocumento(`usuarios/${usuarioId}`) : null;
      return perfilVerazDesdeDocumentos(uid, espejo?.datos ?? null, ficha?.datos ?? null);
    },

    async reservarUso(entrada) {
      const coste = costeOperacion(politica, entrada.operacion);
      await asegurarCuenta(entrada.uid, entrada.ahora);
      const resultado = await conCas<ResultadoReservaUsoIA>(entrada.uid, 'reservarUso', (cuenta) => {
        const rechazo = validarUsoCuentaIA(cuenta, politica, entrada.ahora);
        if (rechazo) return { resultado: rechazo };
        if (cuenta.saldoCreditos < coste) return { resultado: { estado: 'RECHAZADO', codigo: 'SALDO_INSUFICIENTE' } };
        return { aplicar: aplicarUsoCuentaIA(cuenta, coste, entrada.operacionId, entrada.ahora) };
      });
      return resultado ?? { estado: 'RESERVADO', coste };
    },

    async reembolsar(entrada) {
      if (entrada.creditos <= 0) return true;
      try {
        await conCas(entrada.uid, 'reembolsar', (cuenta) => ({
          aplicar: aplicarReembolsoCuentaIA(cuenta, entrada),
        }));
        return true;
      } catch (error) {
        if (error instanceof ConflictoConcurrenciaIA) return false;
        throw error;
      }
    },

    async cuenta(uid) {
      const leida = await leerCuenta(uid);
      return leida ? leida.cuenta : null;
    },

    async bloquear(entrada) {
      const id = idAjusteIA(entrada.adminUid, entrada.claveIdempotencia);
      const creado = await puerto.crearDocumento(COLECCION_AJUSTES_IA, id, {
        version: VERSION_CUENTA_IA,
        id,
        tipo: entrada.bloqueado ? 'BLOQUEO' : 'DESBLOQUEO',
        uidDestino: entrada.uid,
        uidAdmin: entrada.adminUid,
        ...(entrada.motivo ? { motivo: entrada.motivo } : {}),
        estado: 'PENDIENTE',
        creadoEn: entrada.ahora.toISOString(),
      });
      if (creado === 'YA_EXISTE') return { estado: 'DUPLICADO' };
      await asegurarCuenta(entrada.uid, entrada.ahora);
      await conCas(entrada.uid, 'bloquear', (cuenta) => ({
        aplicar: {
          ...cuenta,
          bloqueada: entrada.bloqueado,
          motivoBloqueo: entrada.bloqueado ? entrada.motivo : undefined,
          actualizadoEn: entrada.ahora.toISOString(),
        },
      }));
      await marcarAjusteAplicado(id);
      return { estado: 'APLICADO' };
    },

    async ajustarCredito(entrada) {
      const id = idAjusteIA(entrada.adminUid, entrada.claveIdempotencia);
      const creado = await puerto.crearDocumento(COLECCION_AJUSTES_IA, id, {
        version: VERSION_CUENTA_IA,
        id,
        tipo: 'CREDITO',
        uidDestino: entrada.uid,
        uidAdmin: entrada.adminUid,
        creditos: entrada.creditos,
        ...(entrada.motivo ? { motivo: entrada.motivo } : {}),
        estado: 'PENDIENTE',
        creadoEn: entrada.ahora.toISOString(),
      });
      if (creado === 'YA_EXISTE') return { estado: 'DUPLICADO' };
      await asegurarCuenta(entrada.uid, entrada.ahora);
      const resultado = await conCas<ResultadoAjusteIA>(entrada.uid, 'ajustarCredito', (cuenta) => {
        const saldo = cuenta.saldoCreditos + entrada.creditos;
        if (saldo < 0 || saldo > MAX_CREDITOS) {
          // El ajuste queda PENDIENTE y visible: nunca se fuerzan saldos negativos.
          return {
            resultado: {
              estado: 'FUERA_DE_LIMITES',
              detalle: `El saldo resultante (${saldo}) quedaría fuera de [0, ${MAX_CREDITOS}].`,
            },
          };
        }
        return { aplicar: { ...cuenta, saldoCreditos: saldo, actualizadoEn: entrada.ahora.toISOString() } };
      });
      if (resultado === undefined) {
        await marcarAjusteAplicado(id);
        return { estado: 'APLICADO' };
      }
      return resultado;
    },

    async operacionesDeUsuario(uid, limite = 25) {
      const [porTitular, legadoPorActor] = await Promise.all([
        puerto.consultarIgualdadesOrden('ia_operaciones', {
          igualdades: [['uidTitular', uid]],
          orden: { campo: 'iniciadaEn', direccion: 'DESCENDING' },
          limite,
        }),
        puerto.consultarIgualdadesOrden('ia_operaciones', {
          igualdades: [['uid', uid]],
          orden: { campo: 'iniciadaEn', direccion: 'DESCENDING' },
          limite,
        }),
      ]);
      const porId = new Map<string, { id: string; datos: Record<string, unknown> }>();
      for (const fila of [...porTitular, ...legadoPorActor]) {
        // La segunda consulta conserva histórico anterior al campo uidTitular;
        // un registro actual sólo cuenta para el UID que el servidor resolvió.
        if (fila.datos.uidTitular === uid || (fila.datos.uidTitular === undefined && fila.datos.uid === uid)) {
          porId.set(fila.id, fila);
        }
      }
      return [...porId.values()]
        .sort((a, b) => String(b.datos.iniciadaEn ?? '').localeCompare(String(a.datos.iniciadaEn ?? '')))
        .slice(0, limite)
        .map((f) => aResumenOperacion(f.id, f.datos));
    },

    async operacionesRecientes(limite = 25) {
      const filas = await puerto.consultarIgualdadesOrden('ia_operaciones', {
        orden: { campo: 'iniciadaEn', direccion: 'DESCENDING' },
        limite,
      });
      return filas.map((f) => aResumenOperacion(f.id, f.datos));
    },

    async ajustesDeUsuario(uid, limite = 25) {
      const filas = await puerto.consultarIgualdadesOrden(COLECCION_AJUSTES_IA, {
        igualdades: [['uidDestino', uid]],
        orden: { campo: 'creadoEn', direccion: 'DESCENDING' },
        limite,
      });
      return filas.map((f) => aResumenAjuste(f.id, f.datos));
    },
  };
}

// ---------------------------------------------------------------------------
// Gobierno en memoria (SOLO desarrollo local y pruebas)
// ---------------------------------------------------------------------------

export interface GobiernoMemoriaIA extends GobiernoIA {
  listarCuentas(): CuentaIA[];
  listarAjustes(): AjusteResumenIA[];
  /** Fija el espejo y la ficha que `perfilVeraz` devolverá (solo pruebas/desarrollo). */
  fijarPerfil(uid: string, espejo: Record<string, unknown> | null, ficha: Record<string, unknown> | null): void;
}

export function crearGobiernoMemoria(
  politica: PoliticaGobiernoIA,
  opciones: { ahora?: () => Date; listarOperaciones?: () => RegistroOperacionIA[] } = {},
): GobiernoMemoriaIA {
  const ahoraPorDefecto = opciones.ahora ?? (() => new Date());
  const cuentas = new Map<string, CuentaIA>();
  const ajustes = new Map<string, AjusteResumenIA>();
  const perfiles = new Map<string, { espejo: Record<string, unknown> | null; ficha: Record<string, unknown> | null }>();

  function cuentaONueva(uid: string): CuentaIA {
    let cuenta = cuentas.get(uid);
    if (!cuenta) {
      cuenta = cuentaInicialIA(uid, ahoraPorDefecto());
      cuentas.set(uid, cuenta);
    }
    return cuenta;
  }

  return {
    modo: 'MEMORIA',
    politica,
    listarCuentas: () => [...cuentas.values()].map((c) => ({ ...c })),
    listarAjustes: () => [...ajustes.values()].map((a) => ({ ...a })),
    fijarPerfil: (uid, espejo, ficha) => perfiles.set(uid, { espejo, ficha }),

    async perfilVeraz(uid) {
      const fijado = perfiles.get(uid);
      if (!fijado) return { estado: 'RECHAZADO' as const, codigo: 'PERFIL_NO_ENCONTRADO' as const };
      return perfilVerazDesdeDocumentos(uid, fijado.espejo, fijado.ficha);
    },

    async reservarUso(entrada) {
      const coste = costeOperacion(politica, entrada.operacion);
      // Atómico en proceso: sin `await` entre la validación y la escritura.
      const cuenta = cuentaONueva(entrada.uid);
      const rechazo = validarUsoCuentaIA(cuenta, politica, entrada.ahora);
      if (rechazo) return rechazo;
      if (cuenta.saldoCreditos < coste) return { estado: 'RECHAZADO', codigo: 'SALDO_INSUFICIENTE' };
      cuentas.set(entrada.uid, aplicarUsoCuentaIA(cuenta, coste, entrada.operacionId, entrada.ahora));
      return { estado: 'RESERVADO', coste };
    },

    async reembolsar(entrada) {
      if (entrada.creditos <= 0) return true;
      const cuenta = cuentas.get(entrada.uid);
      if (!cuenta) return false;
      cuentas.set(entrada.uid, aplicarReembolsoCuentaIA(cuenta, entrada));
      return true;
    },

    async cuenta(uid) {
      const cuenta = cuentas.get(uid);
      return cuenta ? { ...cuenta } : null;
    },

    async bloquear(entrada) {
      const id = idAjusteIA(entrada.adminUid, entrada.claveIdempotencia);
      if (ajustes.has(id)) return { estado: 'DUPLICADO' };
      ajustes.set(id, {
        id,
        tipo: entrada.bloqueado ? 'BLOQUEO' : 'DESBLOQUEO',
        uidDestino: entrada.uid,
        uidAdmin: entrada.adminUid,
        ...(entrada.motivo ? { motivo: entrada.motivo } : {}),
        estado: 'APLICADO',
        creadoEn: entrada.ahora.toISOString(),
      });
      const cuenta = cuentaONueva(entrada.uid);
      cuentas.set(entrada.uid, {
        ...cuenta,
        bloqueada: entrada.bloqueado,
        motivoBloqueo: entrada.bloqueado ? entrada.motivo : undefined,
        actualizadoEn: entrada.ahora.toISOString(),
      });
      return { estado: 'APLICADO' };
    },

    async ajustarCredito(entrada) {
      const id = idAjusteIA(entrada.adminUid, entrada.claveIdempotencia);
      if (ajustes.has(id)) return { estado: 'DUPLICADO' };
      const cuenta = cuentaONueva(entrada.uid);
      const saldo = cuenta.saldoCreditos + entrada.creditos;
      const dentro = saldo >= 0 && saldo <= MAX_CREDITOS;
      ajustes.set(id, {
        id,
        tipo: 'CREDITO',
        uidDestino: entrada.uid,
        uidAdmin: entrada.adminUid,
        creditos: entrada.creditos,
        ...(entrada.motivo ? { motivo: entrada.motivo } : {}),
        estado: dentro ? 'APLICADO' : 'PENDIENTE',
        creadoEn: entrada.ahora.toISOString(),
      });
      if (dentro) cuentas.set(entrada.uid, { ...cuenta, saldoCreditos: saldo, actualizadoEn: entrada.ahora.toISOString() });
      return dentro
        ? { estado: 'APLICADO' }
        : { estado: 'FUERA_DE_LIMITES', detalle: `El saldo resultante (${saldo}) quedaría fuera de [0, ${MAX_CREDITOS}].` };
    },

    async operacionesDeUsuario(uid, limite = 25) {
      const operaciones = (opciones.listarOperaciones?.() ?? [])
        .filter((o) => o.uidTitular === uid || (o.uidTitular === undefined && o.uid === uid))
        .sort((a, b) => (a.iniciadaEn < b.iniciadaEn ? 1 : -1))
        .slice(0, limite);
      return operaciones.map((o) => aResumenOperacion(o.id, o as unknown as Record<string, unknown>));
    },

    async operacionesRecientes(limite = 25) {
      const operaciones = (opciones.listarOperaciones?.() ?? [])
        .sort((a, b) => (a.iniciadaEn < b.iniciadaEn ? 1 : -1))
        .slice(0, limite);
      return operaciones.map((o) => aResumenOperacion(o.id, o as unknown as Record<string, unknown>));
    },

    async ajustesDeUsuario(uid, limite = 25) {
      return [...ajustes.values()]
        .filter((a) => a.uidDestino === uid)
        .sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : -1))
        .slice(0, limite);
    },
  };
}
