/**
 * DIAGNÓSTICO «Lectura · Carteras: No tienes permisos…» — instrumentación.
 * ---------------------------------------------------------------------------
 * QUÉ ES
 *  La consulta `gestiones_cartera where gestorUsuarioId == <id de perfil>` la abre
 *  `App` para toda cuenta PROPIETARIO/PROFESIONAL (ROADMAP-04). Cuando Firestore
 *  la deniega, el aviso solo dice «No tienes permisos»: no dice POR QUÉ. Este
 *  módulo convierte esa denegación en un veredicto comprobable.
 *
 * CÓMO FUNCIONA
 *  La regla de `firestore.rules` para `list` de `gestiones_cartera` es
 *      esAdminInmuebles() || gestionInvolucraAMi(resource.data)
 *  y, para una cuenta no administradora, la rama que autoriza la consulta del
 *  gestor es
 *      activeUser()                       // = perfilActualVeraz()
 *      && 'gestorUsuarioId' in d && 'usuarioId' in me()
 *      && d.gestorUsuarioId == me().usuarioId
 *  Cada término de esa expresión depende de DOS documentos que la propia persona
 *  puede leer (su espejo `usuarios_auth/{uid}` y su ficha `usuarios/{id}`) y del
 *  valor de la consulta. Aquí se reproduce, término a término, qué diría la regla
 *  con lo que el cliente observa, y se señala el primero que falla.
 *
 * QUÉ NO ES
 *  · No decide ni concede nada: las Firestore Rules siguen siendo la única
 *    autoridad. Es lectura pura de documentos propios y un reintento de la misma
 *    consulta, solo tras una denegación.
 *  · No toca la interfaz: el resultado va a la consola técnica. Nunca incluye
 *    correo, nombre ni ningún dato de la ficha: solo identificadores técnicos,
 *    estados y contadores.
 *  · El veredicto `REGLAS_PUBLICADAS_O_PLANIFICADOR` NO se afirma como causa: dice
 *    que el estado observable cumple la regla del repositorio y que, aun así, la
 *    denegación persiste; lo que falta por comprobar queda fuera del cliente
 *    (reglas PUBLICADAS en Firebase o planificador de consultas).
 *
 * LECTURA POR RELACIÓN (2026-10-01) — qué se hace con ese veredicto
 *  Cuando TODOS los términos observables de la regla del gestor se cumplen y aun así
 *  la CONSULTA de colección (`list`) se deniega, la denegación no la explica el estado
 *  de la persona: la explica la propia consulta (reglas publicadas distintas en
 *  `allow list` o una consulta que el motor no demuestra; ninguna de las dos es
 *  comprobable fuera de Firebase). Pero `get` y `list` de `gestiones_cartera` comparten
 *  el mismo predicado (`gestionInvolucraAMi`) y `get` se evalúa sobre el documento
 *  REAL, sin planificador. El espejo propio indexa las relaciones del gestor
 *  (`gestionesPorPropietario`: titular → id de gestión; es el mismo índice que usan las
 *  reglas para autorizar inmuebles delegados), así que la capa de datos puede leer
 *  cada relación por su id. Si esas lecturas se autorizan, la persona SÍ está
 *  autorizada y no se le muestra un falso «No tienes permisos». Si alguna se deniega,
 *  la denegación es real y se avisa. Ninguna regla se relaja en ningún caso.
 *
 * Módulo PURO: cero imports de Firebase (el adaptador vive en `firebase.ts`).
 * Se mantiene sincronizado con las reglas mediante
 * `tests/carteras-diagnostico-puro.test.ts` (equivalencia con la regla y pines de
 * fuente) y `tests/carteras-lectura-matriz-reglas.test.ts`: fallan si cambia el
 * texto de `perfilActualVeraz`, `gestionInvolucraAMi` o el `allow list` de
 * `gestiones_cartera`.
 */

export const TRAZA_CARTERAS = '[diag:carteras]';

/** Lo que aporta quien abre la escucha (el UID de Auth lo lee la capa de datos). */
export interface ContextoSuscripcionCarteras {
  tipoPerfil?: string | null;
  roles?: readonly string[] | null;
  /** 0 = primera suscripción de la sesión; > 0 = «Reintentar lectura». */
  intento?: number;
}

/** Lo que el cliente sabe de la consulta que va a abrir (o acaba de abrir). */
export interface ContextoConsultaCarteras {
  /** UID de Firebase Auth (`request.auth.uid`); `null` si no hay sesión. */
  authUid: string | null;
  /** Valor EXACTO de `where('gestorUsuarioId', '==', …)`: id de perfil `usuarios/{id}`. */
  gestorUsuarioId: string;
  tipoPerfil: string | null;
  roles: readonly string[];
  /** `inicio` = primera suscripción de la sesión; `reintento` = «Reintentar lectura». */
  motivo: 'inicio' | 'reintento';
  /** Proyecto Firebase al que habla ESTA compilación (donde deben estar publicadas las reglas). */
  proyecto: string;
  /** Base de datos Firestore a la que habla ESTA compilación. */
  baseDeDatos: string;
}

/** Lectura puntual de un documento PROPIO, tal y como la ve el cliente. */
export type LecturaDocumento =
  | { estado: 'EXISTE'; datos: Record<string, unknown> }
  | { estado: 'NO_EXISTE' }
  /** `permission-denied`: documento inexistente o ajeno (Firestore no distingue). */
  | { estado: 'DENEGADA' }
  | { estado: 'ERROR'; codigo: string };

export interface ObservacionDocumentos {
  /** `usuarios_auth/{authUid}`; `null` si ni siquiera se intentó (sin sesión). */
  espejo: LecturaDocumento | null;
  /** `usuarios/{espejo.usuarioId}`; `null` si el espejo no aporta un id válido. */
  perfil: LecturaDocumento | null;
}

export type IdComprobacion =
  | 'SESION'
  | 'ESPEJO_LEIBLE'
  | 'ESPEJO_EXISTE'
  | 'ESPEJO_USUARIOID_VALIDO'
  | 'PERFIL_LEIBLE'
  | 'ESPEJO_ACTIVO'
  | 'PERFIL_AUTHUID'
  | 'PERFIL_ACTIVO'
  | 'PERFIL_TIPO'
  | 'CONSULTA_ES_USUARIOID_DEL_ESPEJO';

export interface Comprobacion {
  id: IdComprobacion;
  /** Término literal de `firestore.rules` que se está reproduciendo. */
  regla: string;
  /** `null` = no evaluable porque un término anterior ya impide leer lo necesario. */
  ok: boolean | null;
  observado: string;
}

export type ResultadoReintento = 'OK' | 'DENEGADO' | `ERROR:${string}`;

/**
 * Resultado de la lectura DETERMINISTA por relación (un `get` por cada gestión
 * indexada en el espejo propio). `SIN_RELACIONES`: el índice está vacío, no hay nada
 * que leer (no es una confirmación de `get`, pero tampoco hay delegación que perder).
 */
export type ResultadoLecturaRelaciones = 'OK' | 'SIN_RELACIONES' | 'DENEGADA' | `ERROR:${string}`;

/**
 * Qué hace la capa de datos tras una consulta denegada:
 *  · `REABRIR_CONSULTA`: el reintento inmediato SÍ se autoriza (denegación transitoria).
 *  · `LEER_POR_RELACION`: el estado cumple la regla pero la consulta sigue denegada.
 *  · `AVISAR`: la denegación tiene causa observable (o no es concluyente): es real.
 */
export type AccionTrasDenegacion = 'REABRIR_CONSULTA' | 'LEER_POR_RELACION' | 'AVISAR';

export type CausaCarteras =
  | 'TRANSITORIA'
  | 'SIN_SESION_FIREBASE'
  | 'ESPEJO_ILEGIBLE_POR_SU_TITULAR'
  | 'ESPEJO_AUSENTE'
  | 'ESPEJO_SIN_USUARIOID_VALIDO'
  | 'PERFIL_AUSENTE_O_NO_VINCULADO'
  | 'ESPEJO_NO_ACTIVO'
  | 'PERFIL_AUTHUID_DISTINTO'
  | 'PERFIL_NO_ACTIVO'
  | 'PERFIL_TIPO_DISTINTO_DEL_ESPEJO'
  | 'CONSULTA_DISTINTA_DEL_ESPEJO'
  | 'SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA'
  | 'REGLAS_PUBLICADAS_O_PLANIFICADOR'
  | 'INCONCLUSA';

const ESTADO_ACTIVO = 'ACTIVO';

/** `isValidId` de firestore.rules: cadena de 1 a 128 caracteres. */
export function esIdValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= 128;
}

function datosDe(lectura: LecturaDocumento | null): Record<string, unknown> | null {
  return lectura && lectura.estado === 'EXISTE' ? lectura.datos : null;
}

function describirLectura(lectura: LecturaDocumento | null): string {
  if (!lectura) return 'no leído';
  switch (lectura.estado) {
    case 'EXISTE': return 'existe';
    case 'NO_EXISTE': return 'no existe';
    case 'DENEGADA': return 'lectura denegada (no existe o no es de este UID)';
    case 'ERROR': return `error de lectura (${lectura.codigo})`;
  }
}

const txt = (v: unknown): string => (typeof v === 'string' ? `'${v}'` : v === undefined ? 'ausente' : JSON.stringify(v));

/**
 * Reproduce, término a término y en el orden de `firestore.rules`, la rama del
 * GESTOR de `gestionInvolucraAMi` con lo que el cliente observa.
 */
export function evaluarComprobacionesCarteras(
  ctx: Pick<ContextoConsultaCarteras, 'authUid' | 'gestorUsuarioId'>,
  obs: ObservacionDocumentos
): Comprobacion[] {
  const salida: Comprobacion[] = [];
  const poner = (id: IdComprobacion, regla: string, ok: boolean | null, observado: string) =>
    salida.push({ id, regla, ok, observado });

  const sesion = Boolean(ctx.authUid);
  poner('SESION', 'isSignedIn()  [request.auth != null]', sesion, sesion ? 'sesión de Firebase Auth presente' : 'auth.currentUser = null');

  const espejo = datosDe(obs.espejo);
  const lecturaEspejo = obs.espejo?.estado;
  poner(
    'ESPEJO_LEIBLE',
    'usuarios_auth/{uid}  allow read: isSignedIn() && request.auth.uid == uid   (cada UID lee SU espejo)',
    sesion && lecturaEspejo && lecturaEspejo !== 'ERROR' ? lecturaEspejo !== 'DENEGADA' : null,
    sesion ? `usuarios_auth/{uid}: ${describirLectura(obs.espejo)}` : 'sin sesión'
  );

  const espejoExiste = sesion && lecturaEspejo === 'EXISTE';
  poner(
    'ESPEJO_EXISTE',
    'exists(usuarios_auth/$(request.auth.uid))',
    sesion && (lecturaEspejo === 'EXISTE' || lecturaEspejo === 'NO_EXISTE') ? espejoExiste : null,
    sesion ? `usuarios_auth/{uid}: ${describirLectura(obs.espejo)}` : 'sin sesión'
  );

  const usuarioIdEspejo = espejo?.usuarioId;
  const usuarioIdValido = espejoExiste && esIdValido(usuarioIdEspejo);
  poner(
    'ESPEJO_USUARIOID_VALIDO',
    "isValidId(me().usuarioId)  &&  'usuarioId' in me()",
    espejoExiste ? usuarioIdValido : null,
    espejoExiste ? `espejo.usuarioId = ${txt(usuarioIdEspejo)}` : 'espejo no disponible'
  );

  const perfilLeible = usuarioIdValido && obs.perfil?.estado === 'EXISTE';
  poner(
    'PERFIL_LEIBLE',
    'exists(usuarios/$(me().usuarioId))',
    usuarioIdValido && obs.perfil && obs.perfil.estado !== 'ERROR' ? perfilLeible : null,
    usuarioIdValido ? `usuarios/{espejo.usuarioId}: ${describirLectura(obs.perfil)}` : 'sin id de perfil válido en el espejo'
  );

  poner(
    'ESPEJO_ACTIVO',
    "me().estado == 'ACTIVO'",
    espejoExiste ? espejo?.estado === ESTADO_ACTIVO : null,
    espejoExiste ? `espejo.estado = ${txt(espejo?.estado)}` : 'espejo no disponible'
  );

  const perfil = datosDe(obs.perfil);
  poner(
    'PERFIL_AUTHUID',
    'get(usuarios/$(me().usuarioId)).data.authUid == request.auth.uid',
    perfilLeible ? Boolean(ctx.authUid) && perfil?.authUid === ctx.authUid : null,
    perfilLeible ? `perfil.authUid ${perfil?.authUid === ctx.authUid ? 'coincide con' : `= ${txt(perfil?.authUid)} ≠`} el UID de la sesión` : 'perfil no legible'
  );
  poner(
    'PERFIL_ACTIVO',
    "get(usuarios/$(me().usuarioId)).data.estado == 'ACTIVO'",
    perfilLeible ? perfil?.estado === ESTADO_ACTIVO : null,
    perfilLeible ? `perfil.estado = ${txt(perfil?.estado)}` : 'perfil no legible'
  );
  poner(
    'PERFIL_TIPO',
    'get(usuarios/$(me().usuarioId)).data.tipoPerfil == me().tipoPerfil',
    perfilLeible && espejoExiste ? perfil?.tipoPerfil !== undefined && perfil?.tipoPerfil === espejo?.tipoPerfil : null,
    perfilLeible && espejoExiste ? `perfil.tipoPerfil = ${txt(perfil?.tipoPerfil)}; espejo.tipoPerfil = ${txt(espejo?.tipoPerfil)}` : 'perfil o espejo no legibles'
  );

  poner(
    'CONSULTA_ES_USUARIOID_DEL_ESPEJO',
    "'gestorUsuarioId' in d  &&  d.gestorUsuarioId == me().usuarioId   (d = lo que fija la consulta)",
    usuarioIdValido ? usuarioIdEspejo === ctx.gestorUsuarioId : null,
    usuarioIdValido
      ? `where gestorUsuarioId == ${txt(ctx.gestorUsuarioId)}; espejo.usuarioId = ${txt(usuarioIdEspejo)}`
      : 'espejo sin id de perfil válido'
  );

  return salida;
}

/** `true` si TODA la rama del gestor de `gestionInvolucraAMi` se cumple con lo observado. */
export function reglaDelGestorSeCumple(comprobaciones: readonly Comprobacion[]): boolean {
  return comprobaciones.every((c) => c.ok === true);
}

const CAUSA_POR_COMPROBACION: Record<IdComprobacion, CausaCarteras> = {
  SESION: 'SIN_SESION_FIREBASE',
  ESPEJO_LEIBLE: 'ESPEJO_ILEGIBLE_POR_SU_TITULAR',
  ESPEJO_EXISTE: 'ESPEJO_AUSENTE',
  ESPEJO_USUARIOID_VALIDO: 'ESPEJO_SIN_USUARIOID_VALIDO',
  PERFIL_LEIBLE: 'PERFIL_AUSENTE_O_NO_VINCULADO',
  ESPEJO_ACTIVO: 'ESPEJO_NO_ACTIVO',
  PERFIL_AUTHUID: 'PERFIL_AUTHUID_DISTINTO',
  PERFIL_ACTIVO: 'PERFIL_NO_ACTIVO',
  PERFIL_TIPO: 'PERFIL_TIPO_DISTINTO_DEL_ESPEJO',
  CONSULTA_ES_USUARIOID_DEL_ESPEJO: 'CONSULTA_DISTINTA_DEL_ESPEJO',
};

/**
 * Causa más específica que el cliente puede AFIRMAR.
 *  · Un reintento autorizado manda: la denegación no era estable.
 *  · Si falla algún término observable de la regla, ese es el motivo (el primero).
 *  · Si todos se cumplen y el reintento sigue denegado, el cliente NO puede ir más
 *    allá: la diferencia está en las reglas publicadas o en el planificador.
 */
export function causaDeDenegacion(
  comprobaciones: readonly Comprobacion[],
  reintento: ResultadoReintento,
  lecturaPorRelacion?: ResultadoLecturaRelaciones
): CausaCarteras {
  if (reintento === 'OK') return 'TRANSITORIA';
  const fallo = comprobaciones.find((c) => c.ok === false);
  if (fallo) return CAUSA_POR_COMPROBACION[fallo.id];
  if (comprobaciones.some((c) => c.ok === null)) return 'INCONCLUSA';
  if (reintento === 'DENEGADO') {
    // Estado cumplido + consulta denegada: si las relaciones se leen (o no hay ninguna que
    // leer) lo único denegado es la CONSULTA de colección. Si ni el `get` por relación se
    // autoriza, la diferencia está en las reglas publicadas.
    return lecturaPorRelacion === 'OK' || lecturaPorRelacion === 'SIN_RELACIONES'
      ? 'SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA'
      : 'REGLAS_PUBLICADAS_O_PLANIFICADOR';
  }
  return 'INCONCLUSA';
}

/**
 * Acción de la capa de datos tras una consulta denegada (ver «LECTURA POR RELACIÓN»
 * en la cabecera). Pura y exhaustiva: solo `REGLAS_PUBLICADAS_O_PLANIFICADOR` (todos
 * los términos cumplidos y reintento denegado) habilita la lectura por relación; toda
 * causa observable —incluida la consulta con un id distinto del que enlaza el
 * espejo— se sigue avisando, así que el aislamiento por gestor no se puede esquivar.
 */
export function decidirTrasDenegacion(
  comprobaciones: readonly Comprobacion[],
  reintento: ResultadoReintento
): AccionTrasDenegacion {
  if (reintento === 'OK') return 'REABRIR_CONSULTA';
  if (reintento === 'DENEGADO' && reglaDelGestorSeCumple(comprobaciones)) return 'LEER_POR_RELACION';
  return 'AVISAR';
}

export const EXPLICACION_CAUSA: Record<CausaCarteras, string> = {
  TRANSITORIA:
    'La primera lectura fue denegada pero un reintento inmediato SÍ se autoriza: no es un problema de reglas sino de momento/estado ' +
    '(perfil o espejo aún no consistentes al abrir la escucha). Una escucha denegada no se reabre sola: hay que reintentar.',
  SIN_SESION_FIREBASE: 'No hay sesión de Firebase Auth: las reglas deniegan toda lectura (request.auth == null).',
  ESPEJO_ILEGIBLE_POR_SU_TITULAR:
    'Firestore deniega a este UID leer SU PROPIO usuarios_auth/{uid}, cosa que la regla del repositorio siempre permite ' +
    '(allow read: request.auth.uid == uid). Las reglas PUBLICADAS no son las del repositorio: compáralas y vuelve a publicarlas.',
  ESPEJO_AUSENTE:
    'No existe usuarios_auth/{uid}: perfilActualVeraz() es falso y se deniegan TODAS las lecturas por rol, no solo Carteras. ' +
    'La escritura del espejo (syncAuthIndex) no se completó o la regla del espejo la rechazó (se avisa solo con console.warn).',
  ESPEJO_SIN_USUARIOID_VALIDO: 'El espejo no tiene un usuarioId válido (cadena de 1 a 128 caracteres): perfilActualVeraz() es falso.',
  PERFIL_AUSENTE_O_NO_VINCULADO:
    'usuarios/{espejo.usuarioId} no existe o su authUid no es este UID (Firestore deniega su lectura): perfilActualVeraz() es falso.',
  ESPEJO_NO_ACTIVO: "El espejo no está en estado 'ACTIVO': perfilActualVeraz() es falso.",
  PERFIL_AUTHUID_DISTINTO: 'La ficha usuarios/{id} no está enlazada a este UID de Firebase Auth: perfilActualVeraz() es falso.',
  PERFIL_NO_ACTIVO: "La ficha usuarios/{id} no está en estado 'ACTIVO': perfilActualVeraz() es falso.",
  PERFIL_TIPO_DISTINTO_DEL_ESPEJO: 'El tipoPerfil de la ficha y el del espejo no coinciden: perfilActualVeraz() es falso.',
  CONSULTA_DISTINTA_DEL_ESPEJO:
    'La consulta pide gestorUsuarioId = X pero el espejo enlaza a otro usuarioId: la regla compara contra el del espejo, así que ' +
    'pedir otro id se deniega (aislamiento por gestor). El cliente usa un id de perfil distinto del que enlaza el espejo.',
  SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA:
    'El estado observable cumple TODOS los términos de la regla del gestor y la consulta de colección sigue denegada, pero la lectura ' +
    'de cada relación por su id (get) SÍ se autoriza o no hay relaciones que leer. Lo único denegado es la CONSULTA (list): reglas ' +
    'PUBLICADAS distintas de firestore.rules en `allow list`, o una consulta que el motor no demuestra. La aplicación lee las carteras ' +
    'por relación y no muestra aviso; ninguna regla se ha relajado. Si quieres la consulta de colección, compara las reglas publicadas ' +
    'con el repositorio.',
  REGLAS_PUBLICADAS_O_PLANIFICADOR:
    'El estado observable cumple TODOS los términos de la regla del repositorio y el reintento también es denegado. El repositorio ' +
    'autoriza esta consulta, así que la diferencia no está en el cliente: reglas PUBLICADAS en Firebase distintas de firestore.rules ' +
    'o consulta no demostrable para el motor. Si además la lectura por relación (get) también se deniega, no es el planificador (el ' +
    '`get` no lo usa) y apunta a reglas publicadas distintas. Siguiente paso: comparar las reglas publicadas con el repositorio.',
  INCONCLUSA:
    'No se pudo completar la comprobación (lecturas o reintento con error distinto de permission-denied). Repite con conexión estable.',
};

/**
 * Texto para la PERSONA (no para la consola) cuando la denegación es REAL: qué comprobación falló y
 * qué puede hacer. Sin datos personales; incluye el código de la causa para el soporte.
 * `undefined` = no hay nada que decirle (`TRANSITORIA` se recupera sola y `SOLO_LA_CONSULTA…` se
 * resuelve leyendo por relación): jamás se muestra un aviso por ellas.
 */
export function ayudaUsuarioDeCausa(causa: CausaCarteras): string | undefined {
  const codigo = `Código de diagnóstico: ${causa}.`;
  switch (causa) {
    case 'TRANSITORIA':
    case 'SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA':
      return undefined;
    case 'SIN_SESION_FIREBASE':
      return `Tu sesión ya no es válida. Cierra sesión y vuelve a entrar. ${codigo}`;
    case 'ESPEJO_ILEGIBLE_POR_SU_TITULAR':
    case 'REGLAS_PUBLICADAS_O_PLANIFICADOR':
      return (
        'Tu perfil y tu sesión están correctos, pero las reglas de seguridad publicadas en Firebase no coinciden con las de ' +
        `esta versión de la aplicación: avisa al administrador para que las publique. ${codigo}`
      );
    case 'INCONCLUSA':
      return `No se pudo comprobar la causa. Reintenta la lectura; si el aviso persiste, avisa al administrador. ${codigo}`;
    default:
      // Espejo ausente/no activo, ficha no enlazada/no activa, tipo distinto, id de consulta ajeno…
      return (
        'Tu perfil y tu sesión no están sincronizados. Cierra sesión y vuelve a entrar para resincronizarlos; ' +
        `si el aviso persiste, avisa al administrador. ${codigo}`
      );
  }
}

export interface InformeDenegacionCarteras {
  momento: string;
  motivo: ContextoConsultaCarteras['motivo'];
  authUid: string | null;
  gestorUsuarioId: string;
  tipoPerfil: string | null;
  roles: readonly string[];
  proyecto: string;
  baseDeDatos: string;
  consulta: string;
  errorFirebase: { codigo: string };
  espejo: Record<string, unknown> | null;
  perfil: Record<string, unknown> | null;
  comprobaciones: readonly Comprobacion[];
  reintento: ResultadoReintento;
  /** Resultado de la lectura por relación (`undefined` si no se llegó a intentar). */
  lecturaPorRelacion?: ResultadoLecturaRelaciones;
  causa: CausaCarteras;
  lectura: string;
  /** Dónde comparar las reglas publicadas con `firestore.rules` (proyecto y base reales de esta compilación). */
  dondeComprobarReglas: string;
}

/** Resumen NO sensible del espejo: solo estados y contadores (nunca correo ni nombre). */
export function resumenEspejo(lectura: LecturaDocumento | null): Record<string, unknown> | null {
  if (!lectura) return null;
  const d = datosDe(lectura);
  if (!d) return { lectura: lectura.estado, ...(lectura.estado === 'ERROR' ? { codigo: lectura.codigo } : {}) };
  const indice = d.gestionesPorPropietario;
  return {
    lectura: 'EXISTE',
    usuarioId: d.usuarioId,
    estado: d.estado,
    tipoPerfil: d.tipoPerfil,
    entradasIndiceGestiones: indice && typeof indice === 'object' ? Object.keys(indice as object).length : 0,
    carterasL: Array.isArray(d.carterasL) ? d.carterasL.length : 0,
    carterasE: Array.isArray(d.carterasE) ? d.carterasE.length : 0,
  };
}

/** Resumen NO sensible de la ficha: solo los tres campos que lee `perfilActualVeraz()`. */
export function resumenPerfil(lectura: LecturaDocumento | null): Record<string, unknown> | null {
  if (!lectura) return null;
  const d = datosDe(lectura);
  if (!d) return { lectura: lectura.estado, ...(lectura.estado === 'ERROR' ? { codigo: lectura.codigo } : {}) };
  return { lectura: 'EXISTE', authUid: d.authUid, estado: d.estado, tipoPerfil: d.tipoPerfil };
}

export function construirInformeCarteras(entrada: {
  ctx: ContextoConsultaCarteras;
  codigoError: string;
  observacion: ObservacionDocumentos;
  reintento: ResultadoReintento;
  /** Resultado de la lectura por relación, si se intentó (solo tras `LEER_POR_RELACION`). */
  lecturaPorRelacion?: ResultadoLecturaRelaciones;
  momento: string;
}): InformeDenegacionCarteras {
  const { ctx, observacion, reintento, lecturaPorRelacion } = entrada;
  const comprobaciones = evaluarComprobacionesCarteras(ctx, observacion);
  const causa = causaDeDenegacion(comprobaciones, reintento, lecturaPorRelacion);
  return {
    momento: entrada.momento,
    motivo: ctx.motivo,
    authUid: ctx.authUid,
    gestorUsuarioId: ctx.gestorUsuarioId,
    tipoPerfil: ctx.tipoPerfil,
    roles: ctx.roles,
    proyecto: ctx.proyecto,
    baseDeDatos: ctx.baseDeDatos,
    consulta: `gestiones_cartera where gestorUsuarioId == '${ctx.gestorUsuarioId}'`,
    errorFirebase: { codigo: entrada.codigoError },
    espejo: resumenEspejo(observacion.espejo),
    perfil: resumenPerfil(observacion.perfil),
    comprobaciones,
    reintento,
    ...(lecturaPorRelacion ? { lecturaPorRelacion } : {}),
    causa,
    lectura: EXPLICACION_CAUSA[causa],
    dondeComprobarReglas:
      `Firebase Console › proyecto «${ctx.proyecto}» › Firestore Database › base de datos «${ctx.baseDeDatos}» › Reglas ` +
      `(deben ser las de firestore.rules de esta rama).`,
  };
}
