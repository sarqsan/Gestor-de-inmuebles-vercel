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
  reintento: ResultadoReintento
): CausaCarteras {
  if (reintento === 'OK') return 'TRANSITORIA';
  const fallo = comprobaciones.find((c) => c.ok === false);
  if (fallo) return CAUSA_POR_COMPROBACION[fallo.id];
  if (comprobaciones.some((c) => c.ok === null)) return 'INCONCLUSA';
  if (reintento === 'DENEGADO') return 'REGLAS_PUBLICADAS_O_PLANIFICADOR';
  return 'INCONCLUSA';
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
  REGLAS_PUBLICADAS_O_PLANIFICADOR:
    'El estado observable cumple TODOS los términos de la regla del repositorio y el reintento también es denegado. El repositorio ' +
    'autoriza esta consulta, así que la diferencia no está en el cliente: reglas PUBLICADAS en Firebase distintas de firestore.rules ' +
    'o consulta no demostrable para el motor. Siguiente paso: comparar las reglas publicadas con el repositorio.',
  INCONCLUSA:
    'No se pudo completar la comprobación (lecturas o reintento con error distinto de permission-denied). Repite con conexión estable.',
};

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
  momento: string;
}): InformeDenegacionCarteras {
  const { ctx, observacion, reintento } = entrada;
  const comprobaciones = evaluarComprobacionesCarteras(ctx, observacion);
  const causa = causaDeDenegacion(comprobaciones, reintento);
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
    causa,
    lectura: EXPLICACION_CAUSA[causa],
    dondeComprobarReglas:
      `Firebase Console › proyecto «${ctx.proyecto}» › Firestore Database › base de datos «${ctx.baseDeDatos}» › Reglas ` +
      `(deben ser las de firestore.rules de esta rama).`,
  };
}
