/**
 * DIAGNÓSTICO «Lectura · Inmuebles: No tienes permisos…» — instrumentación.
 * ---------------------------------------------------------------------------
 * QUÉ ES
 *  `subscribeInmuebles` (`firebase.ts`) abre hasta cinco lecturas distintas de la
 *  colección `inmuebles`. Todas reportan al MISMO origen del canal de incidencias
 *  (`reportarErrorLectura('inmuebles', …)`), así que el aviso global
 *  «Lectura · Inmuebles: No tienes permisos…» no dice CUÁL falló ni POR QUÉ.
 *  Este módulo convierte esa denegación en un veredicto comprobable, por escucha.
 *
 * CÓMO FUNCIONA
 *  Cada lectura tiene una condición candidata en `allow list`/`allow get` de
 *  `match /inmuebles/{inmuebleId}`:
 *    INM-OWN   `where('propietarioId','==', pid)`          → inmuebleEsMio
 *    INM-COT   `where('titularesIds','array-contains',pid)`→ myPropId() in d.titularesIds
 *    INM-GEST  `where('propietarioId','==', pidGestion)`   → inmuebleEnCarteraGestionada
 *    INM-ID    `get(inmuebles/{id})`                       → inmuebleEsMio | inmuebleAutorizadoExplicito | cartera | parcial
 *    INM-ADMIN `list` de la colección completa             → esAdminInmuebles()
 *  Todas las ramas no administrativas pasan por `activeUser()` =
 *  `perfilActualVeraz()`, que depende de DOS documentos que la propia persona
 *  puede leer (su espejo de identidad por UID y su ficha de perfil). Aquí se
 *  reproduce, término a término y con el valor EXACTO de la consulta, qué diría
 *  la regla con lo que el cliente observa, y se señala el primer término que falla.
 *
 * QUÉ NO ES
 *  · No decide ni concede nada: las Firestore Rules siguen siendo la única autoridad.
 *  · No cambia ninguna consulta, ningún dato, ninguna regla ni la interfaz: solo
 *    observa documentos PROPIOS y escribe en la consola técnica.
 *  · Nunca imprime documentos completos ni datos personales: identificadores
 *    técnicos, estados y contadores.
 *  · `ESTADO_CUMPLE_LA_REGLA` NO se afirma como causa: dice que el estado
 *    observable cumple la regla del repositorio y que la denegación persiste; lo
 *    que falta por comprobar (reglas PUBLICADAS en Firebase o planificador de
 *    consultas) queda fuera del cliente.
 *
 * Módulo PURO: cero imports de Firebase (el adaptador vive en `firebase.ts`, que
 * es el único módulo de la aplicación que habla con Firestore).
 */
import type { LecturaDocumento } from './diagnosticoCarteras';

export const TRAZA_INMUEBLES = '[DIAG-INMUEBLES]';

/** Las cinco lecturas que pueden producir el aviso de `inmuebles`, etiquetadas. */
export type OrigenLecturaInmuebles = 'INM-OWN' | 'INM-COT' | 'INM-GEST' | 'INM-ID' | 'INM-ADMIN';

/** Lo que ya sabe la capa de datos al abrir (o al fallar) la lectura. */
export interface ContextoLecturaInmuebles {
  origen: OrigenLecturaInmuebles;
  /** Consulta exacta que falló, en su forma literal (sin datos personales). */
  consulta: string;
  /** Valor EXACTO del `pid` de la consulta (INM-OWN / INM-COT) o del pid gestionado (INM-GEST). */
  pid: string | null;
  /** `inmuebles/{id}` de una lectura `get` (INM-ID). */
  inmuebleId?: string | null;
  /** UID de Firebase Auth (`request.auth.uid`); `null` si no hay sesión. */
  authUid: string | null;
  tipoPerfil: string | null;
  /** `propietarioId` con el que el CLIENTE construyó el ámbito (`dataScope`). */
  propietarioIdCliente: string | null;
  /** Tamaño del ámbito con el que se abrió la suscripción (nunca los ids). */
  numeroInmuebleIds: number;
  numeroInmueblesParciales: number;
  numeroCarterasGestionadas: number;
  /** Procedencia del `inmuebleId` de INM-ID: autorización explícita o delegación parcial. */
  inmuebleIdEnEspejo?: boolean;
  inmuebleIdParcial?: boolean;
  proyecto: string;
  baseDeDatos: string;
  codigoError: string;
  mensajeError: string;
}

export interface ObservacionEspejoInmuebles {
  /** Espejo de identidad por UID; `null` si ni siquiera se intentó (sin sesión). */
  espejo: LecturaDocumento | null;
  /** Ficha de perfil `usuarios/{espejo.usuarioId}`; `null` si el espejo no aporta un id válido. */
  perfil: LecturaDocumento | null;
  /** Ficha `usuarios/{request.auth.uid}`: es la que mira `esAdminInmuebles()` (id = UID, no el usuarioId). */
  perfilPorUid: LecturaDocumento | null;
}

export type IdComprobacionInmuebles =
  | 'SESION'
  | 'ESPEJO_LEIBLE'
  | 'ESPEJO_EXISTE'
  | 'ESPEJO_USUARIOID_VALIDO'
  | 'PERFIL_LEIBLE'
  | 'PERFIL_EXISTE'
  | 'PERFIL_VERAZ'
  | 'PID_ES_CONSULTA'
  | 'PID_ESPEJO'
  | 'PID_PERFIL'
  | 'CARTERA_DEL_PID'
  | 'INMUEBLE_EN_ESPEJO'
  | 'AMBITO_ADMINISTRATIVO';

export interface ComprobacionInmuebles {
  id: IdComprobacionInmuebles;
  /** Término literal de `firestore.rules` que se está reproduciendo. */
  regla: string;
  /** `null` = no evaluable porque un término anterior ya impide leer lo necesario. */
  ok: boolean | null;
  observado: string;
}

export type CausaInmuebles =
  | 'SIN_SESION_FIREBASE'
  | 'ESPEJO_AUSENTE_O_ILEGIBLE'
  | 'ESPEJO_SIN_USUARIOID_VALIDO'
  | 'PERFIL_AUSENTE_O_NO_VINCULADO'
  | 'PERFIL_NO_VERAZ'
  | 'PID_DISTINTO_DEL_ESPEJO'
  | 'PID_DISTINTO_DEL_PERFIL'
  | 'CARTERA_NO_INDEXADA_EN_EL_ESPEJO'
  | 'INMUEBLE_NO_AUTORIZADO_O_INEXISTENTE'
  | 'SIN_AMBITO_ADMINISTRATIVO'
  | 'ESTADO_CUMPLE_LA_REGLA'
  | 'INCONCLUSA';

export interface InformeInmuebles {
  readonly momento: string;
  readonly origen: OrigenLecturaInmuebles;
  readonly consulta: string;
  readonly authUid: string | null;
  readonly tipoPerfil: string | null;
  readonly propietarioIdCliente: string | null;
  readonly pid: string | null;
  readonly inmuebleId: string | null;
  readonly ambito: {
    readonly inmuebleIds: number;
    readonly inmueblesParciales: number;
    readonly carterasGestionadas: number;
    readonly inmuebleIdEnEspejo?: boolean;
    readonly inmuebleIdParcial?: boolean;
  };
  readonly proyecto: string;
  readonly baseDeDatos: string;
  readonly errorFirebase: { codigo: string; mensaje: string };
  readonly espejo: Record<string, unknown> | null;
  readonly perfil: Record<string, unknown> | null;
  readonly perfilPorUid: Record<string, unknown> | null;
  readonly comprobaciones: readonly ComprobacionInmuebles[];
  readonly causa: CausaInmuebles;
  readonly lectura: string;
  readonly dondeComprobarReglas: string;
}

const ESTADO_ACTIVO = 'ACTIVO';

/** `isValidId` de firestore.rules: cadena de 1 a 128 caracteres. */
export function esIdValidoInmuebles(valor: unknown): valor is string {
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
    case 'DENEGADA': return 'lectura denegada';
    case 'ERROR': return `error de lectura (${lectura.codigo})`;
  }
}

const texto = (v: unknown): string =>
  typeof v === 'string' ? `'${v}'` : v === undefined ? 'ausente' : JSON.stringify(v);

/** Resumen NO sensible del espejo: solo los campos que usan las reglas y contadores. */
export function resumenEspejoInmuebles(lectura: LecturaDocumento | null): Record<string, unknown> | null {
  if (!lectura) return null;
  const d = datosDe(lectura);
  if (!d) return { lectura: lectura.estado, ...(lectura.estado === 'ERROR' ? { codigo: lectura.codigo } : {}) };
  const indice = d.gestionesPorPropietario;
  return {
    lectura: 'EXISTE',
    usuarioId: d.usuarioId,
    tipoPerfil: d.tipoPerfil,
    estado: d.estado,
    propietarioId: d.propietarioId,
    inmuebleIds: Array.isArray(d.inmuebleIds) ? d.inmuebleIds.length : 0,
    carterasL: Array.isArray(d.carterasL) ? d.carterasL.length : 0,
    carterasE: Array.isArray(d.carterasE) ? d.carterasE.length : 0,
    entradasIndiceGestiones: indice && typeof indice === 'object' ? Object.keys(indice as object).length : 0,
  };
}

/** Resumen NO sensible de una ficha de perfil: solo los campos que usan las reglas. */
export function resumenPerfilInmuebles(lectura: LecturaDocumento | null): Record<string, unknown> | null {
  if (!lectura) return null;
  const d = datosDe(lectura);
  if (!d) return { lectura: lectura.estado, ...(lectura.estado === 'ERROR' ? { codigo: lectura.codigo } : {}) };
  return {
    lectura: 'EXISTE',
    id: d.id,
    authUid: d.authUid,
    estado: d.estado,
    tipoPerfil: d.tipoPerfil,
    propietarioId: d.propietarioId,
    inmuebleIds: Array.isArray(d.inmuebleIds) ? d.inmuebleIds.length : 0,
  };
}

/**
 * Reproduce, término a término y en el orden de `firestore.rules`, la rama que
 * debería autorizar ESTA lectura con lo que el cliente observa de sus propios
 * documentos. El primer término que falla explica la denegación.
 */
export function evaluarComprobacionesInmuebles(
  ctx: ContextoLecturaInmuebles,
  obs: ObservacionEspejoInmuebles
): ComprobacionInmuebles[] {
  const salida: ComprobacionInmuebles[] = [];
  const poner = (id: IdComprobacionInmuebles, regla: string, ok: boolean | null, observado: string) =>
    salida.push({ id, regla, ok, observado });

  const sesion = Boolean(ctx.authUid);
  poner('SESION', 'isSignedIn()  [request.auth != null]', sesion,
    sesion ? 'sesión de Firebase Auth presente' : 'auth.currentUser = null');

  const lecturaEspejo = obs.espejo?.estado;
  poner('ESPEJO_LEIBLE',
    'usuarios_auth/{uid}  allow read: isSignedIn() && request.auth.uid == uid',
    sesion && lecturaEspejo ? lecturaEspejo !== 'DENEGADA' : null,
    sesion ? `espejo propio: ${describirLectura(obs.espejo)}` : 'sin sesión');
  poner('ESPEJO_EXISTE', "exists(/usuarios_auth/$(request.auth.uid))  [perfilActualVeraz]",
    sesion ? lecturaEspejo === 'EXISTE' : null,
    sesion ? `espejo propio: ${describirLectura(obs.espejo)}` : 'sin sesión');

  const espejo = datosDe(obs.espejo);
  const usuarioIdValido = esIdValidoInmuebles(espejo?.usuarioId);
  poner('ESPEJO_USUARIOID_VALIDO', 'isValidId(me().usuarioId)',
    espejo ? usuarioIdValido : null,
    espejo ? `usuarioId del espejo: ${texto(espejo.usuarioId)}` : 'espejo no legible');

  const lecturaPerfil = obs.perfil?.estado;
  poner('PERFIL_LEIBLE', 'usuarios/{me().usuarioId}  (documento propio del titular)',
    usuarioIdValido && lecturaPerfil ? lecturaPerfil !== 'DENEGADA' : null,
    usuarioIdValido ? `ficha de perfil: ${describirLectura(obs.perfil)}` : 'sin usuarioId válido en el espejo');
  poner('PERFIL_EXISTE', 'exists(/usuarios/$(me().usuarioId))  [perfilActualVeraz]',
    usuarioIdValido ? lecturaPerfil === 'EXISTE' : null,
    usuarioIdValido ? `ficha de perfil: ${describirLectura(obs.perfil)}` : 'sin usuarioId válido en el espejo');

  const perfil = datosDe(obs.perfil);
  if (espejo && perfil) {
    const terminos: Array<[string, boolean]> = [
      ["me().estado == 'ACTIVO'", espejo.estado === ESTADO_ACTIVO],
      ['usuarios/{usuarioId}.authUid == request.auth.uid', perfil.authUid === ctx.authUid],
      ["usuarios/{usuarioId}.estado == 'ACTIVO'", perfil.estado === ESTADO_ACTIVO],
      ['usuarios/{usuarioId}.tipoPerfil == me().tipoPerfil', perfil.tipoPerfil === espejo.tipoPerfil],
    ];
    const falla = terminos.find(([, ok]) => !ok);
    poner('PERFIL_VERAZ', 'activeUser() = perfilActualVeraz()  [esPropietarioRole/esAdminInmuebles]', !falla,
      falla
        ? `falla «${falla[0]}» → espejo{estado:${texto(espejo.estado)}, tipoPerfil:${texto(espejo.tipoPerfil)}} · perfil{authUid:${texto(perfil.authUid)}, estado:${texto(perfil.estado)}, tipoPerfil:${texto(perfil.tipoPerfil)}} · request.auth.uid:${texto(ctx.authUid)}`
        : 'los cuatro términos de perfilActualVeraz() se cumplen');
  } else {
    poner('PERFIL_VERAZ', 'activeUser() = perfilActualVeraz()', null, 'no evaluable sin espejo y ficha legibles');
  }

  const pid = ctx.pid;
  const pidEnConsulta = Boolean(pid && pid.length > 0);
  // Solo las lecturas que se acotan por identidad llevan un `pid` en la consulta:
  // en INM-ID es informativo y en INM-ADMIN la consulta es la colección completa.
  if (ctx.origen === 'INM-OWN' || ctx.origen === 'INM-COT' || ctx.origen === 'INM-GEST') {
    poner('PID_ES_CONSULTA', 'valor exacto del `where(... == pid)` que acota la consulta', pidEnConsulta,
      pidEnConsulta ? `pid de la consulta: ${texto(pid)}` : 'la consulta no lleva pid (rama sin acotar)');
  }

  if (ctx.origen === 'INM-OWN' || ctx.origen === 'INM-COT') {
    const pidEspejo = espejo ? espejo.propietarioId : undefined;
    poner('PID_ESPEJO', 'myPropId() == pid  (myPropId = me().propietarioId)',
      espejo ? pidEnConsulta && pidEspejo === pid : null,
      espejo ? `pid consulta ${texto(pid)} vs myPropId ${texto(pidEspejo)}` : 'espejo no legible');
  }

  if (ctx.origen === 'INM-GEST') {
    const carteras = espejo
      ? [...(Array.isArray(espejo.carterasL) ? espejo.carterasL : []), ...(Array.isArray(espejo.carterasE) ? espejo.carterasE : [])]
      : null;
    poner('CARTERA_DEL_PID',
      "inmuebleEnCarteraGestionada(d) → carterasLectura()/carterasEscritura().hasAny([d.propietarioId])",
      carteras ? pidEnConsulta && carteras.includes(pid as string) : null,
      carteras ? `pid ${texto(pid)} en carteras del espejo: ${carteras.includes(pid as string)}` : 'espejo no legible');
  }

  if (ctx.origen === 'INM-ID') {
    const lista = espejo && Array.isArray(espejo.inmuebleIds) ? (espejo.inmuebleIds as string[]) : [];
    poner('INMUEBLE_EN_ESPEJO',
      'inmuebleAutorizadoExplicito(inmuebleId) → myInmuebleIds().hasAny([inmuebleId])',
      espejo ? Boolean(ctx.inmuebleId && lista.includes(ctx.inmuebleId)) : null,
      espejo
        ? `inmuebleId ${texto(ctx.inmuebleId)} presente en inmuebleIds del espejo: ${Boolean(ctx.inmuebleId && lista.includes(ctx.inmuebleId))}`
        : 'espejo no legible');
  }

  if (ctx.origen === 'INM-ADMIN') {
    const otro = datosDe(obs.perfilPorUid);
    const lecturaPorUid = obs.perfilPorUid?.estado;
    const ok = otro
      ? otro.tipoPerfil === 'ADMINISTRADOR' && otro.estado === ESTADO_ACTIVO && otro.authUid === ctx.authUid
      : lecturaPorUid === 'NO_EXISTE' ? false : null;
    poner('AMBITO_ADMINISTRATIVO',
      "esAdminInmuebles() → usuarios/{request.auth.uid} con tipoPerfil 'ADMINISTRADOR', estado 'ACTIVO' y authUid == uid",
      ok,
      otro
        ? `usuarios/{uid}: tipoPerfil ${texto(otro.tipoPerfil)}, estado ${texto(otro.estado)}, authUid ${texto(otro.authUid)}`
        : `usuarios/{request.auth.uid}: ${describirLectura(obs.perfilPorUid)}` +
          (lecturaPorUid === 'NO_EXISTE' ? ' → esAdminInmuebles() no puede cumplirse (la colección completa solo la lista el ámbito administrativo)' : ''));
  }

  const pidPerfil = perfil ? perfil.propietarioId : undefined;
  if (perfil && (ctx.origen === 'INM-OWN' || ctx.origen === 'INM-COT' || ctx.origen === 'INM-GEST')) {
    poner('PID_PERFIL', 'identidad cliente↔espejo: usuarios/{usuarioId}.propietarioId == pid de la consulta',
      pidEnConsulta && pidPerfil === pid,
      `pid consulta ${texto(pid)} vs propietarioId del perfil ${texto(pidPerfil)}`);
  }

  return salida;
}

function primerFallo(comprobaciones: readonly ComprobacionInmuebles[]): ComprobacionInmuebles | undefined {
  return comprobaciones.find((c) => c.ok === false);
}

export function causaDeDenegacionInmuebles(
  ctx: ContextoLecturaInmuebles,
  comprobaciones: readonly ComprobacionInmuebles[]
): CausaInmuebles {
  const fallo = primerFallo(comprobaciones);
  if (!fallo) return 'ESTADO_CUMPLE_LA_REGLA';
  switch (fallo.id) {
    case 'SESION': return 'SIN_SESION_FIREBASE';
    case 'ESPEJO_LEIBLE':
    case 'ESPEJO_EXISTE': return 'ESPEJO_AUSENTE_O_ILEGIBLE';
    case 'ESPEJO_USUARIOID_VALIDO': return 'ESPEJO_SIN_USUARIOID_VALIDO';
    case 'PERFIL_LEIBLE':
    case 'PERFIL_EXISTE': return 'PERFIL_AUSENTE_O_NO_VINCULADO';
    case 'PERFIL_VERAZ': return 'PERFIL_NO_VERAZ';
    case 'PID_ESPEJO': return 'PID_DISTINTO_DEL_ESPEJO';
    case 'PID_PERFIL': return 'PID_DISTINTO_DEL_PERFIL';
    case 'CARTERA_DEL_PID': return 'CARTERA_NO_INDEXADA_EN_EL_ESPEJO';
    case 'INMUEBLE_EN_ESPEJO': return ctx.inmuebleIdParcial ? 'INCONCLUSA' : 'INMUEBLE_NO_AUTORIZADO_O_INEXISTENTE';
    case 'AMBITO_ADMINISTRATIVO': return 'SIN_AMBITO_ADMINISTRATIVO';
    default: return 'INCONCLUSA';
  }
}

const EXPLICACION_CAUSA: Record<CausaInmuebles, string> = {
  SIN_SESION_FIREBASE:
    'No hay sesión de Firebase Auth: ninguna regla puede autorizar la lectura. Es un problema de sesión, no de la consulta.',
  ESPEJO_AUSENTE_O_ILEGIBLE:
    'El espejo de identidad por UID no existe o no es legible. `activeUser()` lo exige en TODAS las ramas no administrativas de `allow list`/`allow get` de inmuebles, así que cualquier consulta acotada por identidad se deniega. Es un problema de identidad/perfil (dato), no de la consulta.',
  ESPEJO_SIN_USUARIOID_VALIDO:
    'El espejo existe pero no aporta un `usuarioId` válido, así que `perfilActualVeraz()` no puede resolver la ficha y la rama que autoriza la consulta se cae. Identidad/perfil desincronizado.',
  PERFIL_AUSENTE_O_NO_VINCULADO:
    'La ficha de perfil a la que apunta el espejo no existe o no es legible: `perfilActualVeraz()` exige `exists(usuarios/{me().usuarioId})`. Identidad/perfil desincronizado.',
  PERFIL_NO_VERAZ:
    'Espejo y ficha existen pero no concuerdan en estado, authUid o tipoPerfil (o alguno no está ACTIVO). `perfilActualVeraz()` es el primer término de la rama que autorizaría la consulta: cualquier divergencia la deniega. Identidad/perfil desincronizado.',
  PID_DISTINTO_DEL_ESPEJO:
    'El `pid` con el que el cliente acota la consulta NO es el `propietarioId` del espejo (`myPropId()`), que es el valor con el que la regla compara. La consulta es indemostrable para CUALQUIER documento: se deniega entera. Hay una discrepancia entre el `propietarioId` del cliente y el del espejo.',
  PID_DISTINTO_DEL_PERFIL:
    'El `pid` de la consulta no coincide con el `propietarioId` de la ficha de perfil: el cliente consulta con un valor distinto del que refleja la ficha. Identidad/perfil desincronizado.',
  CARTERA_NO_INDEXADA_EN_EL_ESPEJO:
    'El `pid` gestionado de esta escucha no aparece en `carterasL`/`carterasE` del espejo propio: la regla no puede autorizar esa cartera (el cliente la conoce por `gestiones_cartera`, pero la proyección del espejo que usan las reglas no la tiene). Discrepancia de proyección, no de la consulta.',
  INMUEBLE_NO_AUTORIZADO_O_INEXISTENTE:
    'El id de esta lectura `get` no está en `inmuebleIds` del espejo y no procede de una cartera ni de una delegación parcial: Firestore devuelve `permission-denied` tanto si el documento no existe como si existe en otra cartera (un `get` sobre un documento inexistente también deniega). Denegación REAL; el id es obsoleto o ajeno.',
  SIN_AMBITO_ADMINISTRATIVO:
    'Esta lectura es la colección COMPLETA, reservada a `esAdminInmuebles()`: ni el perfil es ADMINISTRADOR ACTIVO con `authUid == uid` ni la cuenta es el master. Para un usuario ordinario es denegación por diseño.',
  ESTADO_CUMPLE_LA_REGLA:
    'Con lo observable desde el cliente, TODOS los términos de la regla del repositorio que autorizarían esta lectura se cumplen y la denegación persiste. Eso no lo explica el estado de la persona: lo explica la propia consulta frente al motor (reglas PUBLICADAS distintas de `firestore.rules` o una consulta que el planificador no demuestra). Ninguna de las dos es comprobable desde el cliente.',
  INCONCLUSA:
    'El diagnóstico no puede concluir con lo observado (faltan documentos propios legibles o el caso es una delegación parcial).',
};

export function construirInformeInmuebles(entrada: {
  ctx: ContextoLecturaInmuebles;
  observacion: ObservacionEspejoInmuebles;
  momento: string;
}): InformeInmuebles {
  const { ctx, observacion } = entrada;
  const comprobaciones = evaluarComprobacionesInmuebles(ctx, observacion);
  const causa = causaDeDenegacionInmuebles(ctx, comprobaciones);
  return {
    momento: entrada.momento,
    origen: ctx.origen,
    consulta: ctx.consulta,
    authUid: ctx.authUid,
    tipoPerfil: ctx.tipoPerfil,
    propietarioIdCliente: ctx.propietarioIdCliente,
    pid: ctx.pid,
    inmuebleId: ctx.inmuebleId ?? null,
    ambito: {
      inmuebleIds: ctx.numeroInmuebleIds,
      inmueblesParciales: ctx.numeroInmueblesParciales,
      carterasGestionadas: ctx.numeroCarterasGestionadas,
      ...(ctx.inmuebleIdEnEspejo !== undefined ? { inmuebleIdEnEspejo: ctx.inmuebleIdEnEspejo } : {}),
      ...(ctx.inmuebleIdParcial !== undefined ? { inmuebleIdParcial: ctx.inmuebleIdParcial } : {}),
    },
    proyecto: ctx.proyecto,
    baseDeDatos: ctx.baseDeDatos,
    errorFirebase: { codigo: ctx.codigoError, mensaje: ctx.mensajeError },
    espejo: resumenEspejoInmuebles(observacion.espejo),
    perfil: resumenPerfilInmuebles(observacion.perfil),
    perfilPorUid: resumenPerfilInmuebles(observacion.perfilPorUid),
    comprobaciones,
    causa,
    lectura: EXPLICACION_CAUSA[causa],
    dondeComprobarReglas:
      `Firebase Console › proyecto «${ctx.proyecto}» › Firestore Database › base de datos «${ctx.baseDeDatos}» › Reglas ` +
      '(comprobar que el `allow list` de `match /inmuebles/{inmuebleId}` contiene la condición candidata de esta lectura).',
  };
}

// ────────────────────────────────────────────────────── registro visible (preview)

/**
 * Registro EN MEMORIA de los diagnósticos de esta sesión (observador pasivo de la
 * instrumentación). Conserva TODOS los errores en
 * orden temporal (el primero arriba), sin sobrescribir ninguno, y solo con datos
 * técnicos: es el mismo contenido que ya se escribe en la consola como
 * `[DIAG-INMUEBLES]`. Nunca escribe en Firestore, ni en la caché, ni en el canal
 * de incidencias: es un observador pasivo más.
 */
export interface EntradaDiagnosticoInmuebles {
  readonly id: string;
  /** Número de error de la sesión, en orden temporal (1 = primero). */
  readonly numero: number;
  readonly momento: string;
  readonly origen: OrigenLecturaInmuebles;
  readonly causa: CausaInmuebles;
  readonly codigoError: string;
  readonly consulta: string;
  readonly tipoPerfil: string | null;
  readonly usuarioIdEspejo: string | null;
  readonly propietarioIdCliente: string | null;
  readonly pid: string | null;
  readonly propietarioIdEspejo: string | null;
  readonly propietarioIdPerfil: string | null;
  readonly inmuebleId: string | null;
  readonly proyecto: string;
  readonly baseDeDatos: string;
  readonly terminoQueFalla: string | null;
  /** Bloque `[DIAG-INMUEBLES] …` completo, tal y como se escribe en consola. */
  readonly texto: string;
}

const MAXIMO_ENTRADAS_VISIBLES = 50;

let entradas: EntradaDiagnosticoInmuebles[] = [];
const oyentesVisibles = new Set<() => void>();
let secuenciaVisible = 0;

function notificarVisibles(): void {
  for (const oyente of Array.from(oyentesVisibles)) {
    try {
      oyente();
    } catch {
      // Un oyente defectuoso no puede romper el diagnóstico.
    }
  }
}

function propietarioDe(resumen: Record<string, unknown> | null): string | null {
  if (!resumen) return null;
  const valor = resumen.propietarioId;
  return typeof valor === 'string' ? valor : null;
}

function usuarioIdDe(resumen: Record<string, unknown> | null): string | null {
  if (!resumen) return null;
  const valor = resumen.usuarioId;
  return typeof valor === 'string' ? valor : null;
}

/**
 * Registra un informe ya construido (misma salida que `[DIAG-INMUEBLES]`). No
 * añade ninguna lectura nueva: solo conserva lo que el diagnóstico ya observó.
 */
export function registrarDiagnosticoInmuebles(informe: InformeInmuebles): EntradaDiagnosticoInmuebles {
  const fallo = informe.comprobaciones.find((c) => c.ok === false);
  const entrada: EntradaDiagnosticoInmuebles = {
    id: `diag-inm-${++secuenciaVisible}`,
    numero: secuenciaVisible,
    momento: informe.momento,
    origen: informe.origen,
    causa: informe.causa,
    codigoError: informe.errorFirebase.codigo,
    consulta: informe.consulta,
    tipoPerfil: informe.tipoPerfil,
    usuarioIdEspejo: usuarioIdDe(informe.espejo),
    propietarioIdCliente: informe.propietarioIdCliente,
    pid: informe.pid,
    propietarioIdEspejo: propietarioDe(informe.espejo),
    propietarioIdPerfil: propietarioDe(informe.perfil),
    inmuebleId: informe.inmuebleId,
    proyecto: informe.proyecto,
    baseDeDatos: informe.baseDeDatos,
    terminoQueFalla: fallo ? `${fallo.id} → ${fallo.observado}` : null,
    texto: renderInformeInmuebles(informe),
  };
  // Sin deduplicar ni sobrescribir: el orden temporal es la evidencia.
  entradas = [...entradas, entrada].slice(-MAXIMO_ENTRADAS_VISIBLES);
  notificarVisibles();
  return entrada;
}

/** Todas las entradas de la sesión, en orden temporal. Referencia estable para React. */
export function diagnosticosInmuebles(): readonly EntradaDiagnosticoInmuebles[] {
  return entradas;
}

export function suscribirDiagnosticosInmuebles(oyente: () => void): () => void {
  oyentesVisibles.add(oyente);
  return () => {
    oyentesVisibles.delete(oyente);
  };
}

/**
 * Borra SOLO las entradas visibles de esta sesión (nunca datos ni incidencias
 * reales). La numeración vuelve a empezar: tras limpiar, la siguiente captura
 * arranca en `ERROR #1`.
 */
export function limpiarDiagnosticosInmuebles(): void {
  secuenciaVisible = 0;
  if (entradas.length === 0) return;
  entradas = [];
  notificarVisibles();
}

/** Texto para «Copiar diagnóstico»: únicamente los bloques técnicos ya generados. */
export function textoDiagnosticosInmuebles(): string {
  if (entradas.length === 0) return `${TRAZA_INMUEBLES} (sin errores de inmuebles en esta sesión)`;
  return entradas.map((e) => e.texto).join('\n\n');
}

/**
 * Texto de una línea por campo, con `origen=INM-XXX` como primer dato: es lo que
 * permite identificar individualmente QUÉ escucha falló sin abrir el objeto.
 */
export function renderInformeInmuebles(informe: InformeInmuebles): string {
  const fallo = primerFallo(informe.comprobaciones);
  const lineas: string[] = [
    `origen=${informe.origen}`,
    `consulta=${informe.consulta}`,
    `authUid=${informe.authUid ?? 'sin sesión'}`,
    `tipoPerfil=${texto(informe.tipoPerfil)}`,
    `propietarioIdCliente=${texto(informe.propietarioIdCliente)}`,
    `pid=${texto(informe.pid)}`,
    ...(informe.inmuebleId ? [`inmuebleId=${texto(informe.inmuebleId)}`] : []),
    `ambito=inmuebleIds:${informe.ambito.inmuebleIds},parciales:${informe.ambito.inmueblesParciales},carteras:${informe.ambito.carterasGestionadas}`,
    `proyecto=${informe.proyecto}`,
    `baseDeDatos=${informe.baseDeDatos}`,
    `errorFirebase=${informe.errorFirebase.codigo} (${informe.errorFirebase.mensaje})`,
    `espejo=${JSON.stringify(informe.espejo)}`,
    `perfil=${JSON.stringify(informe.perfil)}`,
    `usuarios/{uid}=${JSON.stringify(informe.perfilPorUid)}`,
    `terminoQueFalla=${fallo ? `${fallo.id} → ${fallo.observado}` : 'ninguno (el estado observable cumple la regla del repositorio)'}`,
    `causa=${informe.causa}`,
    `lectura=${informe.lectura}`,
  ];
  return `${TRAZA_INMUEBLES} ${lineas.join('\n')}`;
}
