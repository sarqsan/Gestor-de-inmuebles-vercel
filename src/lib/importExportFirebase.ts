/**
 * Adaptador Firebase del importador/exportador canónicos.
 *
 * ÚNICA pieza con I/O del módulo: implementa `PuertoPersistenciaImport` y
 * construye catálogos/ámbitos. Reutiliza SIEMPRE persistencia existente:
 *  · lecturas: `subscribePropietarios`/`subscribeInmuebles`/`subscribeContratos`/
 *    `subscribeGastos` (con `DataAccessScope`; Rules = autorización efectiva);
 *  · escrituras: `saveGastoFirestore` / `saveContratoFirestore` (cobros
 *    embebidos vía read-modify-write; las Rules validan propietario/cartera);
 *  · auditoría: `registrarAuditoriaFirestore` best-effort (transporte
 *    genérico de firebase.ts; NO el transaccional de operaciones — se
 *    conserva la distinción documentada en `src/lib/auditoria.ts`);
 *  · carteras: `proyectarCarterasGestionadas` (D2/D3 intactos).
 *
 * Sin cambios en Rules: las escrituras cursan por colecciones existentes con
 * las reglas existentes (master/titular/carterasE). Sin bypass admin.
 */
import { arrayUnion, doc, getDoc, setDoc, writeBatch, type DocumentReference } from 'firebase/firestore';
import type {
  CobroPeriodo,
  ContratoFormalizacion,
  Gasto,
  Inmueble,
  Propietario,
} from '../types';
import {
  auth,
  db,
  deepCleanForFirestore,
  registrarAuditoriaFirestore,
  saveContratoFirestore,
  saveGastoFirestore,
  subscribeContratos,
  subscribeGastos,
  subscribeInmuebles,
  subscribePropietarios,
  type DataAccessScope,
} from './firebase';
import { ambitoAutorizadoDesdeUsuario } from './importExport/ambito';
import type { IdentidadCanonica } from '../features/operaciones/persistence/authorization';
import { crearTransporteFirebase } from '../features/operaciones/persistence/firebase';
import type { CatalogosMigracion, ExistenteDestino } from './migracion/tipos';
import type {
  EventoAuditoriaImport,
  InmueblePatrimonialNuevo,
  PuertoPersistenciaImport,
} from './importExport/ejecucion';
import type { EstadoExistencia } from './importExport/ejecucion';

/** Cota anti-cuelgue de lecturas únicas (los suscriptores tragan el error de Rules). */
export const LECTURA_UNICA_TIMEOUT_MS = 25_000;

/** Una lectura única a partir de un suscriptor existente (sin duplicar consultas). */
function unaVez<T>(
  suscribir: (cb: (v: T) => void, scope?: DataAccessScope) => () => void,
  scope?: DataAccessScope,
  timeoutMs = LECTURA_UNICA_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    let fin = false;
    const off = suscribir((v) => {
      if (fin) return;
      fin = true;
      clearTimeout(timer);
      queueMicrotask(() => off());
      resolver(v);
    }, scope);
    // Anti-cuelgue (auditoría 3ac21a5/D2): si Rules deniega la consulta, el
    // suscriptor solo hace console.error y jamás llama al callback. Sin cota,
    // el panel se quedaba en "Analizando…" para siempre. Ahora falla honesto.
    const timer = setTimeout(() => {
      if (fin) return;
      fin = true;
      try { off(); } catch { /* noop */ }
      rechazar(new Error(`lectura de catálogo sin respuesta en ${timeoutMs} ms (posible denegación de Rules por ámbito; no se continúa a ciegas)`));
    }, timeoutMs);
    // Evita que el timer retenga el proceso en Node/tests.
    if (typeof (timer as unknown as { unref?: () => void }).unref === 'function') {
      (timer as unknown as { unref: () => void }).unref();
    }
  });
}

export interface FuentesCatalogo {
  propietarios: Propietario[];
  inmuebles: Inmueble[];
  contratos: ContratoFormalizacion[];
  gastos: Gasto[];
}

export async function cargarFuentesCatalogo(scope?: DataAccessScope, timeoutMs = LECTURA_UNICA_TIMEOUT_MS): Promise<FuentesCatalogo> {
  const [propietarios, inmuebles, contratos, gastos] = await Promise.all([
    unaVez(subscribePropietarios, scope, timeoutMs),
    unaVez(subscribeInmuebles, scope, timeoutMs),
    unaVez(subscribeContratos, scope, timeoutMs),
    unaVez(subscribeGastos, scope, timeoutMs),
  ]);
  return { propietarios, inmuebles, contratos, gastos };
}

/** Proyecta entidades ERP a catálogos B4 (snapshots; B4 nunca lee en vivo). */
export function catalogosDesdeFuentes(
  fuentes: FuentesCatalogo,
  extra?: {
    mapeos?: CatalogosMigracion['mapeos'];
    propietariosPermitidosIds?: string[];
    importador?: CatalogosMigracion['importador'];
  },
): CatalogosMigracion {
  const existentes: ExistenteDestino[] = fuentes.gastos.map((g) => ({
    claveOrigen: g.origen && g.origenId ? `${g.origen}:${g.origenId}` : undefined,
    destinoId: g.id,
    entidad: 'GASTO' as const,
  }));
  for (const c of fuentes.contratos) {
    for (const cobro of c.registroCobros ?? []) {
      existentes.push({ destinoId: cobro.id, entidad: 'COBRO' as const });
    }
  }
  return {
    propietarios: fuentes.propietarios.map((p) => ({ id: p.id, nombre: p.nombre, nifCif: p.nifCif, email: p.email })),
    inmuebles: fuentes.inmuebles.map((i) => ({
      id: i.id,
      direccion: i.direccion,
      ciudad: i.ciudad,
      referenciaCatastral: i.referenciaCatastral,
      propietarioId: i.propietarioId ?? i.propietarioPrincipalId,
    })),
    contratos: fuentes.contratos.map((c) => ({ id: c.id, inmuebleId: c.inmuebleId, propietarioId: c.propietarioId })),
    mapeos: extra?.mapeos ?? [],
    existentes,
    ...(extra?.propietariosPermitidosIds ? { propietariosPermitidosIds: extra.propietariosPermitidosIds } : {}),
    ...(extra?.importador ? { importador: extra.importador } : {}),
  };
}

/** Reexportado del núcleo puro (D2/D3 intactos; Rules = autorización efectiva). */
export { ambitoAutorizadoDesdeUsuario };

/**
 * Identidad CANÓNICA de la sesión para el preflight. Reutiliza el lector canónico
 * ya existente (`transporte.identidad()` de operaciones: espejo `usuarios_auth/{uid}`
 * + perfil, proyectados con `proyectarIdentidad`). No añade ningún lector nuevo del
 * espejo: la lista cerrada de lectores de identidad (fase14) sigue intacta.
 * Devuelve `null` si no hay espejo (fail-closed: no se escribe).
 */
export async function leerIdentidadCanonicaImport(): Promise<IdentidadCanonica | null> {
  return crearTransporteFirebase(db, auth).identidad();
}

/** ¿Es un error de permisos de Firestore (SDK o motor)? */
export function esPermisoDenegado(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const mensaje = e instanceof Error ? e.message : String(e);
  return code === 'permission-denied' || /permission-denied|Missing or insufficient permissions/i.test(mensaje);
}

/**
 * ¿Existe ya el documento PARA ESTA SESIÓN? (comprobación previa a la escritura).
 *
 * CONDICIÓN DEL INCIDENTE «Missing or insufficient permissions.»: las reglas de
 * `inmuebles`, `gastos` y `titularidades` evalúan `resource.data` en su `get`. Sobre
 * un documento que NO existe, `resource` es `null` y la evaluación falla: el motor
 * deniega la lectura incluso a un PROPIETARIO titular del alta. Antes, esa denegación
 * abortaba el registro antes de intentar la creación legítima.
 *
 * Tratamiento: una denegación de lectura significa «no visible para esta sesión»,
 * NO «existe». La decisión la toma la regla de CREACIÓN, que es la autoridad.
 *
 * Por qué no permite sobrescribir un documento existente que no se puede leer:
 * para `inmuebles`, toda autorización de `update` implica autorización de `get`
 * (invariante probado en tests/promocion-creacion-inmueble-reglas.test.ts). Si la lectura se deniega,
 * el `setDoc` posterior sobre un documento existente (que Firestore evalúa como
 * `update`) también se deniega: el error real queda registrado y nada se sobrescribe.
 *
 * Cualquier error que NO sea de permisos se propaga (red, cuota, etc.).
 */
export async function consultarExistencia(referencia: DocumentReference): Promise<EstadoExistencia> {
  try {
    const snap = await getDoc(referencia);
    return snap.exists() ? 'EXISTE' : 'NO_EXISTE';
  } catch (e) {
    // Denegación de LECTURA ≠ inexistencia: no se puede afirmar ninguna de las dos.
    if (esPermisoDenegado(e)) return 'NO_VERIFICABLE';
    throw e;
  }
}

/** Compatibilidad booleana: sólo `true` cuando el documento es legible y existe. */
export async function existeVisible(referencia: DocumentReference): Promise<boolean> {
  return (await consultarExistencia(referencia)) === 'EXISTE';
}

/**
 * Añade `colección/id` al error de una escritura conservando el MENSAJE REAL de
 * Firestore (sin ocultar la causa). El código de error original se mantiene.
 */
export async function conContextoEscritura<T>(
  coleccion: string,
  id: string,
  operacion: () => Promise<T>,
): Promise<T> {
  try {
    return await operacion();
  } catch (e) {
    const original = e instanceof Error ? e.message : String(e);
    const nuevo = new Error(`${coleccion}/${id}: ${original}`);
    const code = (e as { code?: unknown } | null)?.code;
    if (code !== undefined) Object.assign(nuevo, { code });
    throw nuevo;
  }
}

/** Existencia tri-state de un destino escribible por importación (gastos/inmuebles). */
async function estadoDestinoImport(coleccion: string, destinoId: string): Promise<EstadoExistencia> {
  if (coleccion !== 'gastos' && coleccion !== 'inmuebles') {
    throw new Error(`colección no escribible por importación: '${coleccion}'`);
  }
  return consultarExistencia(doc(db, coleccion, destinoId));
}

/** Puerto real: escrituras por funciones existentes + auditoría best-effort. */
export function crearPuertoFirebase(
  identidad: { usuarioId: string; usuarioEmail: string; usuarioNombre: string },
): PuertoPersistenciaImport {
  return {
    async existeDestino(coleccion: string, destinoId: string): Promise<boolean> {
      return (await estadoDestinoImport(coleccion, destinoId)) === 'EXISTE';
    },
    estadoDestino: estadoDestinoImport,
    async existeCobro(contratoId: string, cobroId: string): Promise<boolean> {
      const snap = await getDoc(doc(db, 'contratos_formalizacion', contratoId));
      if (!snap.exists()) return false;
      const data = snap.data() as Partial<ContratoFormalizacion>;
      return (data.registroCobros ?? []).some((c) => c.id === cobroId);
    },
    async crearGasto(gasto: Gasto): Promise<void> {
      // Verificación post-escritura (auditoría 3ac21a5/D12): saveGastoFirestore
      // traga errores (catch+console.error sin rethrow, preexistente en
      // firebase.ts y NO tocado aquí por radio de impacto). Sin verificar, una
      // denegación de Rules se informaba como CREADO (+auditoría falsa EXITO).
      await saveGastoFirestore(gasto);
      const verif = await getDoc(doc(db, 'gastos', gasto.id));
      if (!verif.exists()) {
        throw new Error(`escritura no verificada en 'gastos/${gasto.id}' (posible denegación de Rules o fallo de red; no se informa CREADO)`);
      }
    },
    /**
     * ALTA DE INMUEBLE PATRIMONIAL (importación).
     *
     * Escribe SÓLO `inmuebles/{id}` y SÓLO los campos declarados. Deliberadamente
     * NO se reutiliza `saveInmuebleFirestore`: ese camino escribe además el
     * espejo público `fichas_publicas_inmueble` (R3) y el builder no exige
     * estado de publicación, así que daría de ALTA un inmueble sin datos de
     * alquiler a la vez que lo PUBLICARÍA (la ficha es de lectura abierta). Un
     * alta patrimonial no es una publicación: aquí no se publica nada. La
     * publicación sigue siendo un acto explícito del panel de inmuebles.
     *
     * Verificación post-escritura (mismo criterio que `crearGasto`): `setDoc`
     * puede fallar por Rules y hay que demostrar que el documento existe antes
     * de informar CREADO. Un id ya ocupado se detecta antes (existeDestino) y
     * jamás se sobrescribe: aquí no se usa `merge`.
     */
    async crearInmueble(inmueble: InmueblePatrimonialNuevo): Promise<void> {
      const { id, ...campos } = inmueble;
      await conContextoEscritura('inmuebles', id, () =>
        setDoc(doc(db, 'inmuebles', id), { id, ...deepCleanForFirestore(campos) }),
      );
      const verif = await conContextoEscritura('inmuebles', id, () => getDoc(doc(db, 'inmuebles', id)));
      if (!verif.exists()) {
        throw new Error(`escritura no verificada en 'inmuebles/${id}' (posible denegación de Rules o fallo de red; no se informa CREADO)`);
      }
    },

    /**
     * ¿Existe ya la titularidad `{inmuebleId}__{propietarioId}`? Idempotencia de
     * las relaciones: reimportar el mismo archivo no duplica ni reescribe nada.
     */
    /**
     * Titular del inmueble existente (`propietarioId`), o `null` si no existe, no
     * consta o no es legible para esta sesión (denegación = no verificable, nunca
     * «es mío»). Sólo sirve para decidir si se completan relaciones pendientes.
     */
    async propietarioDeInmueble(inmuebleId: string): Promise<string | null> {
      try {
        const snap = await getDoc(doc(db, 'inmuebles', inmuebleId));
        if (!snap.exists()) return null;
        const propietario = (snap.data() as { propietarioId?: unknown }).propietarioId;
        return typeof propietario === 'string' && propietario ? propietario : null;
      } catch (e) {
        if (esPermisoDenegado(e)) return null;
        throw e;
      }
    },

    async existeTitularidad(inmuebleId: string, propietarioId: string): Promise<boolean> {
      const clave = `${inmuebleId}__${propietarioId}`;
      return existeVisible(doc(db, 'titularidades', clave));
    },

    /**
     * Crea la RELACIÓN de titularidad por el flujo autorizado, en un único lote
     * atómico: documento `titularidades/{inmuebleId}__{propietarioId}` + índice
     * `inmuebles/{inmuebleId}.titularesIds` (misma escritura que la app).
     *
     * · Sólo se invoca con una ranura RESUELTA por una persona a un titular
     *   existente del ámbito escribible (el plan lo valida antes).
     * · El inmueble debe existir ya (las Rules lo comprueban).
     * · `porcentajeTitularidad` es el DECLARADO por el archivo o `null` cuando no
     *   consta: nunca se calcula, se reparte ni se completa un 100 %.
     * · NO crea propietarios ni contratos.
     */
    async crearTitularidad(t: {
      inmuebleId: string;
      propietarioId: string;
      propietarioNombre?: string;
      porcentajeTitularidad: number | null;
      campoOrigen: string;
      valorOriginal: unknown;
      importRunId: string;
      migrationRunId: string;
    }): Promise<void> {
      const clave = `${t.inmuebleId}__${t.propietarioId}`;
      const ahora = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(doc(db, 'titularidades', clave), deepCleanForFirestore({
        id: clave,
        inmuebleId: t.inmuebleId,
        propietarioId: t.propietarioId,
        ...(t.propietarioNombre ? { propietarioNombre: t.propietarioNombre } : {}),
        porcentajeTitularidad: t.porcentajeTitularidad,
        estado: 'VIGENTE',
        fechaInicio: ahora,
        createdAt: ahora,
        updatedAt: ahora,
        // Trazabilidad de la importación (qué columna lo declaró y con qué valor).
        origenImportacion: {
          tipo: 'IMPORTACION',
          importRunId: t.importRunId,
          migrationRunId: t.migrationRunId,
          campoOrigen: t.campoOrigen,
          valorOriginal: t.valorOriginal,
        },
      }));
      batch.update(doc(db, 'inmuebles', t.inmuebleId), { titularesIds: arrayUnion(t.propietarioId), updatedAt: ahora });
      await conContextoEscritura('titularidades', clave, () => batch.commit());
      const verif = await conContextoEscritura('titularidades', clave, () => getDoc(doc(db, 'titularidades', clave)));
      if (!verif.exists()) {
        throw new Error(`escritura no verificada en 'titularidades/${clave}' (posible denegación de Rules; no se informa CREADO)`);
      }
    },

    async anexarCobro(contratoId: string, cobro: CobroPeriodo): Promise<void> {
      const ref = doc(db, 'contratos_formalizacion', contratoId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error(`contrato destino inexistente: '${contratoId}'`);
      const contrato = { id: snap.id, ...(snap.data() as object) } as ContratoFormalizacion;
      const actuales = contrato.registroCobros ?? [];
      if (actuales.some((c) => c.id === cobro.id)) return; // idempotente
      await saveContratoFirestore({ ...contrato, registroCobros: [...actuales, cobro] });
    },
    async auditar(evento: EventoAuditoriaImport): Promise<void> {
      await registrarAuditoriaFirestore({
        usuarioId: identidad.usuarioId,
        usuarioEmail: identidad.usuarioEmail,
        usuarioNombre: identidad.usuarioNombre,
        accion: `IMPORTACION_${evento.accion}`,
        descripcion: `${evento.descripcion} [run ${evento.importRunId} / ${evento.migrationRunId} ← ${evento.source}:${evento.sourceRecordId}]`,
        entidadAfectada: 'importacion_general',
        idAfectado: evento.entidadId,
        resultado: evento.resultado === 'FALLIDO' ? 'ERROR' : 'EXITO',
        detalles: {
          entidad: evento.entidad,
          propietarioId: evento.propietarioId,
          ...(evento.inmuebleId ? { inmuebleId: evento.inmuebleId } : {}),
          importRunId: evento.importRunId,
          migrationRunId: evento.migrationRunId,
          source: evento.source,
          sourceRecordId: evento.sourceRecordId,
          resultado: evento.resultado,
          ...(evento.motivo ? { motivo: evento.motivo } : {}),
        },
      });
    },
  };
}
