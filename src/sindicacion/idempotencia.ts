/**
 * GAP 5 · FASE 1 — HUECO 2: decisor de idempotencia (qué hay que hacer en el portal).
 * ---------------------------------------------------------------------------------
 * Función PURA: a partir de (a) la publicación normalizada que se QUIERE tener y
 * (b) la instantánea de lo que ya está publicado, decide la acción mínima.
 * No publica, no escribe, no consulta redes: devuelve una decisión.
 *
 * El motor central no contiene ningún `if (portal === ...)`: la decisión es igual
 * para todos los portales; lo específico de cada uno vive en su adaptador (fase 2).
 *
 * Reglas (deliberadamente simples y auditables):
 *   · retirar solicitado + hay algo publicado          → RETIRAR
 *   · retirar solicitado + nunca se publicó             → SIN_CAMBIOS  (no hay nada que retirar)
 *   · sin precedente + contenido válido                 → NUEVO
 *   · ya retirado en el portal                            → SIN_CAMBIOS  (no se reactiva solo)
 *   · sin precedente + contenido no publicable          → BLOQUEADO
 *   · huella igual a la publicada                         → SIN_CAMBIOS (no republicar)
 *   · huella distinta + válido                            → ACTUALIZAR (versión + 1)
 *   · huella distinta + no publicable                     → BLOQUEADO   (el cambio NO se envía)
 */
import type { PortalInmobiliario, PublicacionInmueble } from '../types';
import { identidadPublicacionPortal } from '../utils/publicacionEngine';
import { camposQueCambiaron, calcularVersionPublicable, type VersionPublicable } from './hashContenido';
import { codigosDeValidacion, validarModeloPublicable, type ErrorValidacionEstructurado, type ValidacionEstructurada } from './validacion';

export type AccionSindicacion = 'NUEVO' | 'SIN_CAMBIOS' | 'ACTUALIZAR' | 'RETIRAR' | 'BLOQUEADO';

export type MotivoAccionSindicacion =
  | 'SIN_PRECEDENTE'
  | 'HASH_IGUAL'
  | 'HASH_DISTINTO'
  | 'RETIRADA_SOLICITADA'
  | 'RETIRADA_SIN_PUBLICAR'
  | 'RETIRADA_VIGENTE'
  | 'VALIDACION_BLOQUEANTE'
  | 'MODELO_AUSENTE';

export interface InstantaneaPublicada {
  /** `externalId` devuelto por el portal en su día (o derivado: es determinista). */
  externalId?: string;
  /** Huella publicada o versión completa; también se admite `{ hashContenido, numero }`. */
  version?: VersionPublicable | string | { hashContenido: string; numero?: number };
  /** Publicación con la que se generó esa versión: permite el diff de campos. */
  publicacion?: PublicacionInmueble;
  /** Estado declarado por el llamador. Sólo importa un detalle: si está retirado. */
  retirado?: boolean;
}

export interface IntencionSindicacion {
  /** true cuando el inmueble debe salir de los portales (retirada/baja). */
  retirar?: boolean;
}

export interface DecisionSindicacion {
  inmuebleId: string;
  portal: PortalInmobiliario;
  /** Clave estable `PORTAL:inmuebleId` (identidad reutilizada del motor). */
  claveIdentidad: string;
  externalId: string;
  accion: AccionSindicacion;
  motivo: MotivoAccionSindicacion;
  /**
   * true si la huella del contenido difiere de la publicada. OJO: es un dato sobre el
   * CONTENIDO, no una orden: puede venir `true` con `accion: 'RETIRAR'` o con
   * `accion: 'SIN_CAMBIOS'` (publicación ya retirada) sin contradicción.
   */
  cambioDetectado: boolean;
  /** Versión resultante (numero+1 sólo cuando la huella cambia). */
  version: VersionPublicable;
  versionAnterior?: VersionPublicable;
  /** Campos públicos que cambiaron (diagnóstico para el adaptador). */
  camposQueCambiaron?: string[];
  /** Códigos estables de los bloqueos, cuando los hay. */
  bloqueos?: string[];
  validacion: ValidacionEstructurada;
  /** Códigos de las advertencias (no impiden la acción). */
  advertencias?: string[];
  resumen: string;
}

function normalizarVersionPrevia(
  version: InstantaneaPublicada['version'],
  publicacion?: PublicacionInmueble,
): VersionPublicable | undefined {
  // Sin huella guardada pero con la payload publicada: la huella se DEDUCE del payload
  // (si no hay nada de qué partir, no hay precedente contra el que comparar).
  if (!version) return publicacion ? calcularVersionPublicable(publicacion) : undefined;
  const canonica = calcularVersionPublicable(publicacion as PublicacionInmueble);
  if (typeof version === 'string') {
    // El llamador sólo guardó la huella: se reconstruye una versión sintética (numero 0).
    const huella = version.trim().toLowerCase();
    return { ...canonica, numero: 0, etiqueta: `v0·${huella.slice(0, 8)}`, hashContenido: huella, hashCorto: huella.slice(0, 8) };
  }
  const hashContenido = 'hashContenido' in version ? version.hashContenido.trim().toLowerCase() : canonica.hashContenido;
  const numero = 'numero' in version && typeof version.numero === 'number' ? version.numero : 0;
  return { ...canonica, numero, hashContenido, hashCorto: hashContenido.slice(0, 8) };
}

export function resolverAccionSindicacion(params: {
  publicacion: PublicacionInmueble;
  portal: PortalInmobiliario;
  publicada?: InstantaneaPublicada;
  intencion?: IntencionSindicacion;
}): DecisionSindicacion {
  const { publicacion, portal, publicada, intencion } = params;
  const inmuebleId = String(publicacion?.inmuebleId || '');
  const identidad = identidadPublicacionPortal(inmuebleId, portal);
  const validacion = validarModeloPublicable(publicacion);
  const bloqueos = codigosDeValidacion(validacion, 'BLOQUEANTE');
  const advertencias = codigosDeValidacion(validacion, 'ADVERTENCIA');
  const anterior = normalizarVersionPrevia(publicada?.version, publicada?.publicacion);
  const version = calcularVersionPublicable(publicacion, anterior);
  const hayPrecedente = Boolean(publicada && (publicada.version || publicada.externalId || publicada.publicacion));
  const cambioDetectado = !anterior ? true : anterior.hashContenido !== version.hashContenido;
  const externalId = publicada?.externalId || identidad.externalId;

  const base = {
    inmuebleId,
    portal,
    claveIdentidad: identidad.clave,
    externalId,
    version,
    cambioDetectado,
    ...(anterior ? { versionAnterior: anterior } : {}),
    validacion,
    ...(advertencias.length > 0 ? { advertencias } : {}),
  };

  // 1) Si ya está retirado en el portal, no hay nada que enviar RETIRAR otra vez
  //    (ni se reactiva en silencio: para eso hace falta una intención explícita de publicar).
  if (publicada?.retirado === true) {
    return {
      ...base,
      accion: 'SIN_CAMBIOS',
      motivo: 'RETIRADA_VIGENTE',
      resumen: `Ya retirado en ${portal}: sin acción (reactivar requiere intención explícita).`,
    };
  }

  // 2) RETIRADA: es la única intención que manda sobre el contenido.
  if (intencion?.retirar === true) {
    // (el caso «ya retirado» devolvió arriba, en el paso 1)
    if (hayPrecedente) {
      return { ...base, accion: 'RETIRAR', motivo: 'RETIRADA_SOLICITADA', resumen: `Retirar ${externalId} en ${portal}.` };
    }
    return {
      ...base,
      accion: 'SIN_CAMBIOS',
      motivo: 'RETIRADA_SIN_PUBLICAR',
      resumen: `Nada que retirar en ${portal}: no hay publicación previa.`,
    };
  }

  // 3) Sin precedente: publicar o quedar bloqueado.
  if (!hayPrecedente) {
    if (bloqueos.length > 0) {
      return {
        ...base,
        accion: 'BLOQUEADO',
        motivo: 'VALIDACION_BLOQUEANTE',
        bloqueos,
        resumen: `BLOQUEADO en ${portal}: ${bloqueos.join(', ')} (no se envía).`,
      };
    }
    return { ...base, accion: 'NUEVO', motivo: 'SIN_PRECEDENTE', resumen: `Publicar ${externalId} en ${portal} (v${version.numero}).` };
  }

  // 4) Con precedente: ¿cambió el contenido publicable?
  if (!cambioDetectado) {
    return {
      ...base,
      accion: 'SIN_CAMBIOS',
      motivo: 'HASH_IGUAL',
      resumen: `Sin cambios en ${portal}: la versión v${version.numero} ya está publicada.`,
    };
  }
  const campos = publicada?.publicacion ? camposQueCambiaron(publicada.publicacion, publicacion) : [];
  if (bloqueos.length > 0) {
    return {
      ...base,
      accion: 'BLOQUEADO',
      motivo: 'VALIDACION_BLOQUEANTE',
      bloqueos,
      ...(campos.length > 0 ? { camposQueCambiaron: campos } : {}),
      resumen: `BLOQUEADO en ${portal}: hay cambios (${campos.join(', ') || 'no clasificados'}) pero el contenido no es publicable.`,
    };
  }
  return {
    ...base,
    accion: 'ACTUALIZAR',
    motivo: 'HASH_DISTINTO',
    ...(campos.length > 0 ? { camposQueCambiaron: campos } : {}),
    resumen: `Actualizar ${externalId} en ${portal}: v${versionAnteriorNumero(anterior)} → v${version.numero} (${campos.join(', ') || 'contenido'}).`,
  };
}

function versionAnteriorNumero(anterior?: VersionPublicable): number {
  return anterior ? anterior.numero : 0;
}

/** ¿Hay que enviar algo al portal? (`BLOQUEADO` y `SIN_CAMBIOS` nunca generan tráfico). */
export function requiereEnvio(decision: DecisionSindicacion): boolean {
  return decision.accion === 'NUEVO' || decision.accion === 'ACTUALIZAR' || decision.accion === 'RETIRAR';
}

/** Acción inversa que el portal verá: útil para logs y para la fase 2. */
export function operacionDeAccion(decision: DecisionSindicacion): 'publicar' | 'actualizar' | 'retirar' | 'ninguna' {
  switch (decision.accion) {
    case 'NUEVO':
      return 'publicar';
    case 'ACTUALIZAR':
      return 'actualizar';
    case 'RETIRAR':
      return 'retirar';
    default:
      return 'ninguna';
  }
}

export function erroresDeDecision(decision: DecisionSindicacion): ErrorValidacionEstructurado[] {
  return decision.validacion.errores;
}
