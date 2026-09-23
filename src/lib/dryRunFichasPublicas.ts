/**
 * R3 · DRY-RUN DE AUDITORÍA DEL BACKFILL DE `fichas_publicas_inmueble`.
 * -------------------------------------------------------------------------
 * Punto de invocación de SOLO LECTURA para ejecutar `analizarFichasPublicas`
 * contra los datos reales de Firestore con la sesión autenticada del master.
 *
 * Garantías estructurales de este módulo:
 *  · Solo importa `analizarFichasPublicas` (la función de análisis). NUNCA
 *    importa ni invoca `materializarFichasPublicas`; sus opciones no admiten
 *    ningún flag de ejecución. No existe camino de escritura.
 *  · De `firebase/firestore` únicamente se usan `collection`, `getDocs`, `doc`
 *    y `getDoc` (lecturas). No se importa `setDoc`, `updateDoc`, `deleteDoc`,
 *    `addDoc`, `writeBatch` ni `runTransaction`.
 *  · `listarInmueblesUnaVez` es una lectura única (`getDocs`), no `onSnapshot`.
 *  · `leerFichaPublicaEstricta` PROPAGA cualquier error de lectura (permisos,
 *    red…) en lugar de convertirlo en `null` como hace el lector canónico
 *    `getFichaPublicaInmueble`; así el motor clasifica el inmueble como
 *    `ERROR · lectura_ficha_fallo` y nunca como `CREAR` espurio.
 *  · Acceso restringido al master: perfil ADMINISTRADOR + email del
 *    administrador principal en el perfil Y en la sesión Firebase Auth (mismo
 *    criterio que `isMasterAdmin()` en las reglas). La comprobación se hace
 *    ANTES de tocar Firestore.
 */
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ADMIN_MASTER_EMAIL } from './authService';
import type { Inmueble, UsuarioApp } from '../types';
import {
  CAMPOS_FICHA_PUBLICA,
  FICHAS_PUBLICAS_COL,
  buildFichaPublicaInmueble,
} from './fichaPublicaInmueble';
import {
  analizarFichasPublicas,
  type DependenciasAnalisis,
  type EstadoItemBackfill,
  type FichaPublicaRef,
  type InformeBackfill,
} from './backfillFichasPublicas';

/** Colección origen del backfill (lectura única). */
export const INMUEBLES_COL_NOMBRE = 'inmuebles';

/** Prefijo de los errores de autorización de este módulo. */
export const ERROR_DRY_RUN_NO_AUTORIZADO = 'DRY_RUN_NO_AUTORIZADO';

// ==========================================================================
// Autorización: solo el master (perfil ADMINISTRADOR + email principal)
// ==========================================================================

function emailNormalizado(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}

/**
 * ¿Puede este usuario lanzar el DRY-RUN? Exige perfil ADMINISTRADOR, email de
 * perfil igual al del administrador principal y, si se conoce el email de la
 * sesión Firebase Auth, que coincida también (es el que evalúan las reglas).
 * Pura y sin E/S.
 */
export function puedeEjecutarDryRunFichasPublicas(
  usuario: UsuarioApp | null | undefined,
  emailSesion?: string | null,
): boolean {
  if (!usuario) return false;
  if (usuario.tipoPerfil !== 'ADMINISTRADOR') return false;
  if (emailNormalizado(usuario.email) !== ADMIN_MASTER_EMAIL) return false;
  if (emailSesion !== undefined && emailNormalizado(emailSesion) !== ADMIN_MASTER_EMAIL) return false;
  return true;
}

// ==========================================================================
// Lecturas reales (únicas piezas de E/S del módulo; ambas de solo lectura)
// ==========================================================================

/** Lectura ÚNICA de `inmuebles` (getDocs). Propaga errores. */
export async function listarInmueblesUnaVez(): Promise<Inmueble[]> {
  const snap = await getDocs(collection(db, INMUEBLES_COL_NOMBRE));
  const items: Inmueble[] = [];
  snap.forEach((d) => {
    items.push({ id: d.id, ...(d.data() as object) } as Inmueble);
  });
  return items;
}

/**
 * Lector ESTRICTO de la ficha pública: `null` solo si el documento no existe;
 * cualquier fallo de lectura (permisos, red, cuota) se propaga tal cual.
 */
export async function leerFichaPublicaEstricta(fichaId: string): Promise<FichaPublicaRef | null> {
  const id = String(fichaId || '').trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, FICHAS_PUBLICAS_COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as object) } as FichaPublicaRef;
}

// ==========================================================================
// Ejecución del DRY-RUN (solo análisis)
// ==========================================================================

/** Ids agrupados por estado del análisis. */
export type IdsPorEstado = Record<EstadoItemBackfill, string[]>;

export interface ResumenDryRun {
  /** Inmuebles leídos (N). */
  N: number;
  aCrear: number;
  aActualizar: number;
  alDia: number;
  noAptos: number;
  errores: number;
  ids: IdsPorEstado;
}

export interface InformeDryRunFichasPublicas {
  /** Siempre 'DRY_RUN' (solo análisis). */
  modo: 'DRY_RUN';
  generadoEn: string;
  ejecutadoPor: string;
  resumen: ResumenDryRun;
  /** Informe íntegro del motor (items, errores, resumen textual). */
  informe: InformeBackfill;
}

/**
 * Opciones del DRY-RUN. Deliberadamente NO existe ningún campo `ejecutar`: las
 * dependencias inyectables son solo las de análisis (sin escritor).
 */
export interface OpcionesDryRunFichasPublicas {
  /**
   * Email de la sesión Firebase Auth. Si se omite se toma de `auth.currentUser`
   * (la identidad que evalúan las reglas); sin sesión Auth → no autorizado.
   */
  emailSesion?: string | null;
  /** Fecha ISO inyectable (informes reproducibles). */
  ahoraIso?: string;
  /** Fuente de inmuebles (por defecto lectura única real). */
  listarInmuebles?: () => Promise<Inmueble[]>;
  /** Dependencias de análisis (por defecto builder/lista blanca de R3 + lector estricto). */
  deps?: Partial<DependenciasAnalisis>;
  /** Lote acotado (opcional). */
  soloInmuebleIds?: string[];
  limite?: number;
}

export function agruparIdsPorEstado(informe: InformeBackfill): IdsPorEstado {
  const ids: IdsPorEstado = { CREAR: [], ACTUALIZAR: [], AL_DIA: [], SIN_FICHA_POSIBLE: [], ERROR: [] };
  for (const item of informe.items) ids[item.estado].push(item.inmuebleId);
  return ids;
}

export function resumirDryRun(informe: InformeBackfill): ResumenDryRun {
  return {
    N: informe.inmueblesLeidos,
    aCrear: informe.aCrear,
    aActualizar: informe.aActualizar,
    alDia: informe.alDia,
    noAptos: informe.noAptos,
    errores: informe.errores.length,
    ids: agruparIdsPorEstado(informe),
  };
}

/**
 * Ejecuta el DRY-RUN real. Comprueba la autorización ANTES de cualquier lectura,
 * lee `inmuebles` una sola vez y analiza con el lector estricto. No escribe:
 * únicamente invoca `analizarFichasPublicas`, cuya firma no admite escritor.
 *
 * @throws `DRY_RUN_NO_AUTORIZADO` si el usuario no es el master.
 */
export async function ejecutarDryRunFichasPublicas(
  usuario: UsuarioApp | null | undefined,
  opciones: OpcionesDryRunFichasPublicas = {},
): Promise<InformeDryRunFichasPublicas> {
  const emailSesion = opciones.emailSesion !== undefined ? opciones.emailSesion : (auth.currentUser?.email ?? null);
  if (!puedeEjecutarDryRunFichasPublicas(usuario, emailSesion)) {
    throw new Error(`${ERROR_DRY_RUN_NO_AUTORIZADO}: solo el administrador principal puede lanzar el DRY-RUN de fichas públicas.`);
  }
  const deps: DependenciasAnalisis = {
    // `FichaPublicaInmueble` (interfaz cerrada de R3) es estructuralmente una `FichaPublicaRef`;
    // la copia superficial la expone con el tipo abierto que espera el motor, sin alterar claves.
    construir: (inm, ahora) => {
      const ficha = buildFichaPublicaInmueble(inm, ahora);
      return ficha ? { ...ficha } : null;
    },
    leerFicha: leerFichaPublicaEstricta,
    camposPublicos: CAMPOS_FICHA_PUBLICA,
    ...(opciones.deps || {}),
  };
  const informe = await analizarFichasPublicas({
    listarInmuebles: opciones.listarInmuebles || listarInmueblesUnaVez,
    deps,
    ahoraIso: opciones.ahoraIso,
    soloInmuebleIds: opciones.soloInmuebleIds,
    limite: opciones.limite,
  });
  return {
    modo: 'DRY_RUN',
    generadoEn: opciones.ahoraIso || new Date().toISOString(),
    ejecutadoPor: emailNormalizado(usuario?.email),
    resumen: resumirDryRun(informe),
    informe,
  };
}

/** JSON descargable del informe (2 espacios; contenido íntegro). */
export function serializarInformeDryRun(informe: InformeDryRunFichasPublicas): string {
  return JSON.stringify(informe, null, 2);
}
