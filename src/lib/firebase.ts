import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  deleteField,
  onSnapshot,
  writeBatch,
  runTransaction,
  query,
  where,
  type Unsubscribe,
  type QuerySnapshot,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Candidato,
  Inmueble,
  Propietario,
  SolicitudAlquiler,
  InvitacionVisita,
  VisitSlot,
  SolicitudDocumentacion,
  ContratoFormalizacion,
  Gasto,
  GastoRecurrente,
  Prestamo,
  ExpedienteRecomercializacion,
  InmobiliariaDirectorio,
  PropuestaInmobiliaria,
  LeadInmobiliario,
  Incidencia,
  TareaMantenimiento,
  GarantiaReparacion,
  TrabajoProfesional,
  PresupuestoProfesional,
  ValoracionProfesionalTrabajo,
  NecesidadReforma,
  ProyectoReforma,
  ElementoInventario,
  HabitacionInmueble,
  PolizaSeguro,
  Siniestro,
  ConfiguracionAseguradora,
  SolicitudSeguroImpago,
  GmailIntegracionConfig,
  UsuarioApp,
  Profesional,
  EnlaceRegistro,
  Especialidad,
  AuditLog,
  ModulosConfig,
  DEFAULT_MODULOS_CONFIG,
  PERMISOS_SISTEMA,
} from '../types';
import type { Financiacion } from '../types/financiacion';
import type {
  Factura,
  RegistroFacturacion,
  EnvioVerifactu,
  SerieFacturacion,
} from '../types/facturacion';
import type { FacturaElectronicaB2B } from '../types/facturaElectronicaB2B';
import type { GestionCartera } from './gestionesCartera';
import { propietariosGestionadosDe, type InmuebleDelegadoParcial } from './carterasGestion';
import {
  codigoDeError,
  limpiarIncidenciasDe,
  reportarErrorGuardado,
  reportarErrorLectura,
} from '../estadoDatos/canalIncidencias';
import { FIREBASE_BASE_DATOS_ID, FIREBASE_PROYECTO_ID } from './entornoFirebase';
import {
  TRAZA_CARTERAS,
  construirInformeCarteras,
  esIdValido,
  type ContextoConsultaCarteras,
  type ContextoSuscripcionCarteras,
  type LecturaDocumento,
  type ResultadoReintento,
} from './diagnosticoCarteras';
import {
  INITIAL_CANDIDATOS,
  INITIAL_INMUEBLES,
  INITIAL_PROPIETARIOS,
  INITIAL_SOLICITUDES,
  INITIAL_INVITACIONES,
  INITIAL_VISIT_SLOTS,
  INITIAL_SOLICITUDES_DOC,
  INITIAL_CONTRATOS,
  INITIAL_ASEGURADORAS,
  INITIAL_GMAIL_CONFIG,
} from '../data/mockData';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const firestoreDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = firestoreDbId
  ? getFirestore(app, firestoreDbId)
  : getFirestore(app);

export const storage = getStorage(app);
export const auth = getAuth(app);

// Firestore Collections
const PROPIETARIOS_COL = collection(db, 'propietarios');
const INMUEBLES_COL = collection(db, 'inmuebles');
const CANDIDATOS_COL = collection(db, 'candidatos');
const SOLICITUDES_COL = collection(db, 'solicitudes');
const INVITACIONES_COL = collection(db, 'invitaciones');
const SLOTS_VISITA_COL = collection(db, 'slots_visita');
const SOLICITUDES_DOC_COL = collection(db, 'solicitudes_documentacion');
const CONTRATOS_COL = collection(db, 'contratos_formalizacion');
const GASTOS_COL = collection(db, 'gastos');
const GASTOS_RECURRENTES_COL = collection(db, 'gastos_recurrentes');
const PRESTAMOS_COL = collection(db, 'prestamos');
// FASE 3 — Recomercialización inteligente
const EXPEDIENTES_RECOMERCIALIZACION_COL = collection(db, 'expedientes_recomercializacion');
const INMOBILIARIAS_DIRECTORIO_COL = collection(db, 'inmobiliarias_directorio');
const PROPUESTAS_INMOBILIARIA_COL = collection(db, 'propuestas_inmobiliaria');
const LEADS_INMOBILIARIOS_COL = collection(db, 'leads_inmobiliario');
const INCIDENCIAS_COL = collection(db, 'incidencias');
const TAREAS_MANTENIMIENTO_COL = collection(db, 'tareas_mantenimiento');
export const GARANTIAS_REPARACION_COL = collection(db, 'garantias_reparacion');
const ASEGURADORAS_COL = collection(db, 'configuracion_aseguradoras');
const SOLICITUDES_SEGURO_COL = collection(db, 'solicitudes_seguro_impago');
export const POLIZAS_SEGUROS_COL = collection(db, 'polizas_seguros');
export const SINIESTROS_COL = collection(db, 'siniestros');
export const TRABAJOS_PROFESIONALES_COL = collection(db, 'trabajos_profesionales');
export const PRESUPUESTOS_PROFESIONALES_COL = collection(db, 'presupuestos_profesionales');
export const VALORACIONES_PROFESIONALES_COL = collection(db, 'valoraciones_profesionales');
export const NECESIDADES_REFORMA_COL = collection(db, 'necesidades_reforma');
export const PROYECTOS_REFORMA_COL = collection(db, 'proyectos_reforma');
export const INVENTARIO_COL = collection(db, 'inventario_inmuebles');
export const INVENTARIO_HISTORIAL_COL = collection(db, 'inventario_historial');
export const HABITACIONES_COL = collection(db, 'habitaciones_inmueble');
export const FINANCIACIONES_COL = collection(db, 'financiaciones');

// Colecciones estructurales de usuarios, perfiles, permisos y profesionales
export const USUARIOS_COL = collection(db, 'usuarios');
export const PROFESIONALES_COL = collection(db, 'profesionales');
export const ENLACES_REGISTRO_COL = collection(db, 'enlaces_registro');
export const ESPECIALIDADES_COL = collection(db, 'especialidades');
export const AUDIT_LOGS_COL = collection(db, 'audit_logs');
export const MODULOS_CONFIG_REF = doc(db, 'system', 'modulos_config');

/**
 * Seeds initial mock data into Firestore if database has never been initialized,
 * or updates existing mock candidates with test questionnaires if missing.
 */
export async function seedInitialDataIfEmpty() {
  // Only attempt seeding if an authenticated user is present
  if (!auth.currentUser) {
    return;
  }
  try {
    const metaRef = doc(db, 'system', 'metadata');
    const metaSnap = await getDocs(collection(db, 'system'));
    
    if (metaSnap.empty) {
      await setDoc(metaRef, { initialized: true, createdAt: new Date().toISOString() });
    }

    // Seed default insurers if empty
    const aseguradorasSnap = await getDocs(ASEGURADORAS_COL);
    if (aseguradorasSnap.empty) {
      const aBatch = writeBatch(db);
      INITIAL_ASEGURADORAS.forEach((aseg) => {
        const cleanAseg = sanitizeObjectForFirestore(aseg);
        aBatch.set(doc(db, 'configuracion_aseguradoras', aseg.id), cleanAseg);
      });
      await aBatch.commit();
    }

    // Seed auth, roles, especialidades, modulos and initial demo users if empty
    await seedAuthAndRolesIfEmpty();
  } catch (error) {
    console.warn('Notice during initial Firestore check:', error);
  }
}

/**
 * Ámbito de acceso a datos (FASE 1.4).
 * - ADMINISTRADOR / sin ámbito: colección completa.
 * - PROPIETARIO: únicamente sus propios recursos.
 * - PROFESIONAL: solo recursos explícitamente asignados o derivados de cartera/inmueble; Rules revalidan el permiso efectivo.
 */
export interface DataAccessScope {
  tipoPerfil?: string;
  propietarioId?: string;
  inmuebleIds?: string[];
  /** Propietarios de carteras completas legibles; cada PID se consulta aparte. */
  propietariosGestionados?: string[];
  /** IDs deducidos de gestiones parciales activas; solo acotan consultas. */
  inmueblesGestionadosParciales?: string[];
  ambitosParcialesGestionados?: InmuebleDelegadoParcial[];
  /**
   * BLOQUE 12 · A-01: profesional vinculado (`myProfId` en las reglas). Sólo
   * acota la consulta de las colecciones cuyo `list` concede la rama
   * profesional (`trabajos_profesionales`, `incidencias`, ...).
   */
  profesionalId?: string;
  /**
   * BLOQUE 12 · A-01: contratos visibles (`tenantContratoIds`/ámbito de
   * inmueble en las reglas). `mensajes_portal` exige `contratoId` en el
   * documento, así que se consulta contrato a contrato.
   */
  contratoIds?: string[];
}

/**
 * Real-time listener for Propietarios.
 * Con ámbito de propietario escucha únicamente SU ficha (datos fiscales/cuentas);
 * los profesionales no reciben nada y el administrador, la colección completa.
 */
export function subscribePropietarios(
  callback: (propietarios: Propietario[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }

  if (scope?.tipoPerfil === 'PROPIETARIO') {
    const pid = scope.propietarioId;
    const delegados = Array.from(new Set(scope.propietariosGestionados ?? []));
    const entregados: Propietario[] = [];
    const notificar = () => callback([...entregados.filter((p) => p.id === pid), ...entregados.filter((p) => p.id !== pid)]);
    const subs: Unsubscribe[] = [];
    const escuchar = (id: string) => subs.push(onSnapshot(doc(db, 'propietarios', id), (snap) => {
      const index = entregados.findIndex((p) => p.id === id);
      if (snap.exists()) { if(index >= 0) entregados[index] = {id:snap.id,...snap.data()} as Propietario; else entregados.push({id:snap.id,...snap.data()} as Propietario); }
      else if(index >= 0) entregados.splice(index,1);
      notificar();
    }, (err) => reportarErrorLectura('propietarios', err, `Firestore propietario (${id}) snapshot error:`)));
    if (pid) escuchar(pid);
    for (const id of delegados) if (id && id !== pid) escuchar(id);
    if (!pid && !delegados.length) callback([]);
    return () => subs.forEach((unsub) => unsub());
  }

  return onSnapshot(
    PROPIETARIOS_COL,
    (snapshot) => {
      const items: Propietario[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Propietario);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('propietarios', err, 'Firestore propietarios snapshot error:');
    }
  );
}

/**
 * Save / Update Propietario in Firestore
 */
export async function savePropietarioFirestore(propietario: Propietario) {
  const cleanProp = sanitizeObjectForFirestore(propietario);
  if (auth.currentUser?.email?.toLowerCase() === 'sarqsan2@gmail.com') {
    const { guardarAccesoAuditado } = await import('./auditoriaAccesoFirebase');
    await guardarAccesoAuditado('propietarios', propietario.id, cleanProp, 'GUARDAR_PROPIETARIO');
  } else {
    await setDoc(doc(db, 'propietarios', propietario.id), cleanProp, { merge: true });
  }
}

/**
 * Delete Propietario from Firestore
 */
export async function deletePropietarioFirestore(_propietarioId: string) {
  throw new Error('La identidad jurídica no se purga: desvincule mediante el servicio auditado.');
}

/**
 * D2a/D2b — Fusión "propios ∪ autorizados explícitos ∪ carteras gestionadas"
 * sin duplicados.
 *
 * Fuentes (todas demostrables para las reglas):
 * · `propietarioId` (titularidad): `where('propietarioId','==', pid)` — la
 *   ÚNICA condición que las reglas pueden demostrar para un `list` (mismo
 *   criterio que `contratoEsMio`: el valor se obtiene con un `get` de ruta
 *   fija que el motor trata como constante).
 * · `autorizadoIds` (inmuebleIds explícitos): listeners DOCUMENTO A DOCUMENTO
 *   (`onSnapshot(doc(...))`). La pertenencia a un array no es demostrable
 *   para una consulta `list`; el `get` sí admite `hasAny([...])`.
 * · `gestionadoIds` (D2b — propietarioIds de carterasL ∪ carterasE): UN
 *   listener de igualdad POR PROPIETARIO. No se usa `where('in', ...)`: el
 *   motor no puede demostrar la pertenencia de un conjunto literal contra la
 *   lista constante del espejo; pid a pid, cada consulta sí lo es.
 *
 * Cada fuente mantiene su propio mapa y la unión se notifica deduplicada por
 * id de documento en cada cambio.
 */
function subscribeUnionInmuebles(
  callback: (inmuebles: Inmueble[]) => void,
  opts: { propietarioId?: string; autorizadoIds: string[]; gestionadoIds: string[] }
): Unsubscribe {
  const porFuente = new Map<string, Map<string, Inmueble>>();
  const fuentes: Unsubscribe[] = [];

  const notificar = () => {
    const union = new Map<string, Inmueble>();
    porFuente.forEach((fuente) => fuente.forEach((v, k) => union.set(k, v)));
    callback(Array.from(union.values()));
  };

  const escucharPorPropietario = (clave: string, pid: string) => {
    fuentes.push(
      onSnapshot(
        query(INMUEBLES_COL, where('propietarioId', '==', pid)),
        (snap) => {
          const parcial = new Map<string, Inmueble>();
          snap.forEach((ds) => parcial.set(ds.id, { id: ds.id, ...ds.data() } as Inmueble));
          porFuente.set(clave, parcial);
          notificar();
        },
        (err) => {
          reportarErrorLectura('inmuebles', err, `Firestore inmuebles (${clave}) snapshot error:`);
        }
      )
    );
  };

  if (opts.propietarioId) escucharPorPropietario('propios', opts.propietarioId);

  // N TITULARES (F2) — COTITULARIDAD: una ÚNICA consulta de igualdad por array
  // (`array-contains`), que SÍ es demostrable para el motor de reglas (al
  // contrario que `array-contains-any` combinado o un `or()`). Devuelve los
  // inmuebles en los que el propietario aparece en el índice `titularesIds`
  // aunque NO sea el titular canónico (`propietarioId`). Con eso el cotitular
  // ve la vivienda y, a partir de su índice, el resto de titularidades por su
  // clave determinista —sin conocer de antemano el id de los demás titulares—.
  const escucharPorCotitularidad = (pid: string) => {
    if (!pid) return;
    fuentes.push(
      onSnapshot(
        query(INMUEBLES_COL, where('titularesIds', 'array-contains', pid)),
        (snap) => {
          const parcial = new Map<string, Inmueble>();
          snap.forEach((ds) => parcial.set(ds.id, { id: ds.id, ...ds.data() } as Inmueble));
          porFuente.set('cotitular', parcial);
          notificar();
        },
        (err) => {
          reportarErrorLectura('inmuebles', err, 'Firestore inmuebles (cotitularidad) snapshot error:');
        }
      )
    );
  };
  if (opts.propietarioId) escucharPorCotitularidad(opts.propietarioId);

  // D2b: carteras gestionadas, un listener por propietario gestionado. Un
  // propietario que además gestiona carteras recibe la unión completa.
  for (const pid of opts.gestionadoIds) {
    if (pid && pid !== opts.propietarioId) escucharPorPropietario(`gestion:${pid}`, pid);
  }

  for (const inmuebleId of opts.autorizadoIds) {
    fuentes.push(
      onSnapshot(
        doc(db, 'inmuebles', inmuebleId),
        (ds) => {
          const autorizados = porFuente.get('autorizados') ?? new Map<string, Inmueble>();
          if (ds.exists()) {
            autorizados.set(inmuebleId, { id: ds.id, ...ds.data() } as Inmueble);
          } else {
            autorizados.delete(inmuebleId);
          }
          porFuente.set('autorizados', autorizados);
          notificar();
        },
        (err) => {
          reportarErrorLectura('inmuebles', err, `Firestore inmueble autorizado ${inmuebleId} snapshot error:`);
        }
      )
    );
  }

  return () => fuentes.forEach((unsub) => unsub());
}

/** Lectura puntual de un documento PROPIO para el diagnóstico (nunca alimenta la interfaz). */
async function leerDocumentoPropio(coleccion: string, id: string): Promise<LecturaDocumento> {
  try {
    const snap = await getDoc(doc(db, coleccion, id));
    return snap.exists()
      ? { estado: 'EXISTE', datos: snap.data() as Record<string, unknown> }
      : { estado: 'NO_EXISTE' };
  } catch (err) {
    const codigo = codigoDeError(err);
    return codigo === 'permission-denied' ? { estado: 'DENEGADA' } : { estado: 'ERROR', codigo };
  }
}

/**
 * DIAGNÓSTICO de «Lectura · Carteras: No tienes permisos…» (ver
 * `src/lib/diagnosticoCarteras.ts`). Solo se ejecuta TRAS una denegación; lee
 * únicamente los dos documentos propios que usa `perfilActualVeraz()` y repite la
 * misma consulta una vez. Va a la consola técnica: no crea incidencias ni toca la
 * interfaz, y nunca lanza.
 */
async function diagnosticarDenegacionCarteras(ctx: ContextoConsultaCarteras, err: unknown): Promise<void> {
  try {
    const codigoError = codigoDeError(err);
    if (codigoError !== 'permission-denied') {
      console.warn(TRAZA_CARTERAS, 'fallo de lectura distinto de permission-denied: no se diagnostica por reglas', {
        momento: new Date().toISOString(),
        codigo: codigoError,
        gestorUsuarioId: ctx.gestorUsuarioId,
      });
      return;
    }
    const espejo = ctx.authUid ? await leerDocumentoPropio('usuarios_auth', ctx.authUid) : null;
    const usuarioIdEspejo = espejo && espejo.estado === 'EXISTE' ? espejo.datos.usuarioId : undefined;
    const perfil = esIdValido(usuarioIdEspejo) ? await leerDocumentoPropio('usuarios', usuarioIdEspejo) : null;
    let reintento: ResultadoReintento;
    try {
      await getDocs(query(collection(db, 'gestiones_cartera'), where('gestorUsuarioId', '==', ctx.gestorUsuarioId)));
      reintento = 'OK';
    } catch (errReintento) {
      const codigo = codigoDeError(errReintento);
      reintento = codigo === 'permission-denied' ? 'DENEGADO' : `ERROR:${codigo}`;
    }
    console.warn(
      TRAZA_CARTERAS,
      'denegada',
      construirInformeCarteras({
        ctx,
        codigoError,
        observacion: { espejo, perfil },
        reintento,
        momento: new Date().toISOString(),
      })
    );
  } catch (fallo) {
    console.warn(TRAZA_CARTERAS, 'el diagnóstico no pudo completarse', fallo);
  }
}

/**
 * Suscribe únicamente las gestiones de cartera cuyo gestorUsuarioId coincide.
 *
 * `gestorUsuarioId` es el id de PERFIL (`usuarios/{id}`) de quien consulta, no el
 * UID de Firebase Auth: la regla `gestionInvolucraAMi` lo compara con
 * `usuarios_auth/{uid}.usuarioId`. Traza técnica (consola, nunca interfaz): al abrir
 * la escucha, en su primer resultado y, si Firestore la deniega, el diagnóstico
 * completo de `diagnosticarDenegacionCarteras`.
 *
 * CAPACIDAD ADICIONAL (2026-10-01): la incidencia se registra con
 * `alcance: 'CAPACIDAD'` — el error queda documentado igual (código + traza
 * `[diag:carteras]`), pero NO se convierte en un error de carga de los datos del
 * Portal: no entra en el aviso global «No se han podido leer algunos datos», no
 * cambia el estado de ninguna pantalla y la aplicación sigue funcionando sin
 * carteras. `useEstadoLecturas.reintentarCapacidad` vuelve a abrir ESTA escucha.
 */
export function subscribeGestionesCarteraGestor(
  callback: (gestiones: GestionCartera[]) => void,
  gestorUsuarioId?: string,
  contexto?: ContextoSuscripcionCarteras
): Unsubscribe {
  if (!gestorUsuarioId) {
    callback([]);
    return () => {};
  }
  // Cada apertura (inicio o «Reintentar lectura») parte limpia: el aviso anterior
  // de ESTE origen se sustituye por el resultado de este intento.
  limpiarIncidenciasDe('gestiones_cartera', 'LECTURA');
  const ctx: ContextoConsultaCarteras = {
    authUid: auth.currentUser?.uid ?? null,
    gestorUsuarioId,
    tipoPerfil: contexto?.tipoPerfil ?? null,
    roles: contexto?.roles ?? [],
    motivo: (contexto?.intento ?? 0) > 0 ? 'reintento' : 'inicio',
    proyecto: FIREBASE_PROYECTO_ID,
    baseDeDatos: FIREBASE_BASE_DATOS_ID,
  };
  console.info(TRAZA_CARTERAS, 'consulta', {
    momento: new Date().toISOString(),
    ...ctx,
    consulta: `gestiones_cartera where gestorUsuarioId == '${gestorUsuarioId}'`,
  });
  let primerResultado = true;
  return onSnapshot(
    query(collection(db, 'gestiones_cartera'), where('gestorUsuarioId', '==', gestorUsuarioId)),
    (snap) => {
      if (primerResultado) {
        primerResultado = false;
        console.info(TRAZA_CARTERAS, 'resultado', {
          momento: new Date().toISOString(),
          gestorUsuarioId,
          documentos: snap.docs.length,
          desdeCache: Boolean(snap.metadata?.fromCache),
        });
      }
      callback(snap.docs.map((ds) => ({ id: ds.id, ...ds.data() } as GestionCartera)));
    },
    (err) => {
      reportarErrorLectura(
        'gestiones_cartera',
        err,
        `Firestore gestiones_cartera (gestorUsuarioId=${gestorUsuarioId}) snapshot error:`,
        { alcance: 'CAPACIDAD' }
      );
      void diagnosticarDenegacionCarteras(ctx, err);
    }
  );
}

/**
 * Real-time listener for Inmuebles.
 *
 * D2a — suscripción con ámbito (cierre de F5-1): el acceso server-side deja
 * de ser "autenticado no-tenant ⇒ colección completa".
 * D2b — se completa la parte reservada: `scope.propietariosGestionados`
 * (propietarioIds de las carteras en gestión autorizada, proyección D1R que
 * sólo el master escribe en el espejo `usuarios_auth/{uid}`).
 *
 * · PROPIETARIO: propios ∪ autorizados explícitos ∪ carteras gestionadas.
 * · PROFESIONAL (y cualquier perfil no titular): SOLO autorizados explícitos
 *   y carteras gestionadas; sin ellos, vacío. Nunca la colección completa.
 * · ADMINISTRADOR / sin ámbito: colección completa (ámbito administrativo
 *   legítimo ya existente, sin ampliación).
 *
 * La gestión de carteras NO modifica titularidad ni concede escritura más
 * allá de carterasE (reglas de `inmuebles/update`).
 */
export function subscribeInmuebles(
  callback: (inmuebles: Inmueble[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  const autorizados = Array.from(
    new Set([...(scope?.inmuebleIds ?? []), ...(scope?.inmueblesGestionadosParciales ?? [])].filter((id) => typeof id === 'string' && id.length > 0))
  );
  const gestionados = Array.from(
    new Set(
      (scope?.propietariosGestionados ?? []).filter((id) => typeof id === 'string' && id.length > 0)
    )
  );

  // A) PROPIETARIO — propios ∪ autorizados ∪ carteras gestionadas.
  if (scope?.tipoPerfil === 'PROPIETARIO') {
    const pid = scope.propietarioId;
    if (!pid && autorizados.length === 0 && gestionados.length === 0) {
      callback([]);
      return () => {};
    }
    return subscribeUnionInmuebles(callback, { propietarioId: pid, autorizadoIds: autorizados, gestionadoIds: gestionados });
  }

  // B) Cualquier otro perfil conocido no administrativo (PROFESIONAL,
  //    INQUILINO, …): sin acceso a la colección; solo autorización explícita
  //    o carteras gestionadas.
  if (scope?.tipoPerfil && scope.tipoPerfil !== 'ADMINISTRADOR') {
    if (autorizados.length === 0 && gestionados.length === 0) {
      callback([]);
      return () => {};
    }
    return subscribeUnionInmuebles(callback, { autorizadoIds: autorizados, gestionadoIds: gestionados });
  }

  // C) ADMINISTRADOR / sin ámbito — colección completa (comportamiento
  //    administrativo legítimo conservado tal cual).
  return onSnapshot(
    INMUEBLES_COL,
    (snapshot) => {
      const items: Inmueble[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Inmueble);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('inmuebles', err, 'Firestore inmuebles snapshot error:');
    }
  );
}

/**
 * Real-time listener for Candidatos
 */
export function subscribeCandidatos(callback: (candidatos: Candidato[]) => void) {
  return onSnapshot(
    CANDIDATOS_COL,
    (snapshot) => {
      const items: Candidato[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as Candidato;
        const initialMatch = INITIAL_CANDIDATOS.find((ic) => ic.id === docSnap.id);

        if (!data.cuestionarioToken) {
          data.cuestionarioToken = initialMatch?.cuestionarioToken || `q-${docSnap.id}`;
        }

        // Merge initial mock questionnaire if completely missing on Firestore doc
        if (initialMatch?.cuestionarioIncidencias && !data.cuestionarioIncidencias) {
          data.cuestionarioIncidencias = initialMatch.cuestionarioIncidencias;
        }

        items.push({ id: docSnap.id, ...data });
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('candidatos', err, 'Firestore candidatos snapshot error:');
    }
  );
}

/**
 * Real-time listener for Solicitudes
 */
export function subscribeSolicitudes(callback: (solicitudes: SolicitudAlquiler[]) => void) {
  return onSnapshot(
    SOLICITUDES_COL,
    (snapshot) => {
      const items: SolicitudAlquiler[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as SolicitudAlquiler);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('solicitudes', err, 'Firestore solicitudes snapshot error:');
    }
  );
}

/**
 * Cleans an Inmueble object before saving to Firestore to guarantee
 * that document size remains strictly under Firestore's 1MB limit.
 */
export function sanitizeInmuebleForFirestore(inmueble: Inmueble): Inmueble {
  const clean: Inmueble = JSON.parse(JSON.stringify(inmueble));

  // Measure JSON payload size
  let jsonStr = JSON.stringify(clean);
  if (jsonStr.length > 850000) {
    if (clean.images && Array.isArray(clean.images)) {
      // Limit images to fit within Firestore limit
      clean.images = clean.images.slice(0, 10);
      jsonStr = JSON.stringify(clean);
      if (jsonStr.length > 850000) {
        clean.images = clean.images.slice(0, 6);
      }
    }
  }

  return clean;
}

/**
 * Save / Update Inmueble in Firestore
 */
export async function saveInmuebleFirestore(inmueble: Inmueble): Promise<boolean> {
  try {
    const cleanInmueble = sanitizeInmuebleForFirestore(inmueble);
    await setDoc(doc(db, 'inmuebles', cleanInmueble.id), cleanInmueble, { merge: true });
    // R3: espejo público mínimo (mejor esfuerzo: nunca rompe el guardado principal).
    try {
      const ficha = buildFichaPublicaInmueble(inmueble);
      if (ficha) await saveFichaPublicaInmueble(ficha);
    } catch (errMirror) {
      console.warn('No se pudo actualizar la ficha pública del inmueble:', errMirror);
    }
    return true;
  } catch (err) {
    reportarErrorGuardado('inmuebles', err, 'Error saving inmueble to Firestore:');
    return false;
  }
}

// El borrado físico de inmuebles NO existe: la operación de usuario es la BAJA
// PATRIMONIAL (`src/lib/bajaPatrimonialInmuebleFirestore.ts`), que hace `update`
// del estado y CONSERVA el inmueble, sus titularidades y su histórico. El
// documento sólo puede borrarlo la administración por otras vías auditadas.

import { compressImageForUpload } from '../utils/fileCompressor';
import { buildFichaPublicaInmueble, saveFichaPublicaInmueble } from './fichaPublicaInmueble';

/**
 * Recursively cleans any object or array to ensure it contains NO `undefined` values,
 * which Firestore strictly rejects.
 * - For objects: keys with `undefined` values are omitted.
 * - For arrays: items are recursively sanitized, and `undefined` entries are filtered out.
 * - Dates are converted to ISO strings.
 */
export function deepCleanForFirestore(val: any): any {
  if (val === undefined) {
    return null;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val
      .filter((item) => item !== undefined)
      .map((item) => deepCleanForFirestore(item));
  }
  const cleaned: Record<string, any> = {};
  Object.keys(val).forEach((k) => {
    const v = val[k];
    if (v !== undefined) {
      cleaned[k] = deepCleanForFirestore(v);
    }
  });
  return cleaned;
}

/**
 * Sanitizes an object for Firestore setDoc/updateDoc calls.
 * Removes all undefined properties recursively from objects and arrays.
 */
export function sanitizeObjectForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  return deepCleanForFirestore(obj);
}

/**
 * Ensures candidate document objects do not exceed the 1MB Firestore limit.
 * Keeps URLs, metadata, and optimizes/trims oversized base64 strings so Firestore never rejects writes.
 */
export function sanitizeDocForFirestore(docObj: Record<string, any>): Record<string, any> {
  const clean = deepCleanForFirestore(docObj);
  try {
    if (Array.isArray(clean.documentos)) {
      clean.documentos = clean.documentos.map((item: any) => {
        if (Array.isArray(item.archivos)) {
          const trimmedArchivos = item.archivos.map((arch: any) => {
            // If the archivo has a server or cloud URL (/api/documents/ or http), strip bulky base64Data completely so Firestore doc stays tiny (<20KB)
            if (arch.url && (arch.url.startsWith('http') || arch.url.startsWith('/api/documents/') || arch.url.startsWith('/api/'))) {
              const { base64Data, ...rest } = arch;
              return rest;
            }
            // If base64Data is large (> 25KB), convert reference to server URL and strip raw string
            if (arch.base64Data && arch.base64Data.length > 25000) {
              const safeUrl = arch.url || `/api/documents/${arch.id || 'doc'}`;
              const { base64Data, ...rest } = arch;
              return { ...rest, url: safeUrl };
            }
            return arch;
          });
          return { ...item, archivos: trimmedArchivos };
        }
        return item;
      });
    }
  } catch (err) {
    console.error('Error optimizing doc for Firestore:', err);
  }
  return clean;
}

/**
 * Save / Update Candidato in Firestore
 */
export async function saveCandidatoFirestore(candidato: Candidato) {
  try {
    let cleanCand = deepCleanForFirestore(candidato);
    if (Array.isArray(cleanCand.documentosAnalizados)) {
      cleanCand.documentosAnalizados = cleanCand.documentosAnalizados.map((d: any) => {
        if (d.url && (d.url.startsWith('http') || d.url.startsWith('/api/documents/') || d.url.startsWith('/api/'))) {
          const { base64Data, ...rest } = d;
          return rest;
        }
        if (d.base64Data && d.base64Data.length > 25000) {
          const safeUrl = d.url || `/api/documents/${d.id || 'doc'}`;
          const { base64Data, ...rest } = d;
          return { ...rest, url: safeUrl };
        }
        return d;
      });
    }
    await setDoc(doc(db, 'candidatos', candidato.id), cleanCand, { merge: true });
  } catch (err) {
    reportarErrorGuardado('candidatos', err, 'Error saving candidato to Firestore:');
  }
}

/**
 * Delete Candidato from Firestore
 */
export async function deleteCandidatoFirestore(candidateId: string) {
  try {
    await deleteDoc(doc(db, 'candidatos', candidateId));
  } catch (err) {
    reportarErrorGuardado('candidatos', err, 'Error deleting candidato from Firestore:');
  }
}

/**
 * Real-time listener for Invitaciones de Visita
 */
export function subscribeInvitaciones(callback: (invitaciones: InvitacionVisita[]) => void) {
  return onSnapshot(
    INVITACIONES_COL,
    (snapshot) => {
      const items: InvitacionVisita[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as InvitacionVisita);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('invitaciones', err, 'Firestore invitaciones snapshot error:');
    }
  );
}

/**
 * Real-time listener for Visit Slots
 */
export function subscribeVisitSlots(callback: (slots: VisitSlot[]) => void) {
  return onSnapshot(
    SLOTS_VISITA_COL,
    (snapshot) => {
      const items: VisitSlot[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as VisitSlot);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('slots_visita', err, 'Firestore visit slots snapshot error:');
    }
  );
}

/**
 * Save / Update Invitacion in Firestore
 */
export async function saveInvitacionFirestore(invitacion: InvitacionVisita) {
  try {
    const cleanInv = sanitizeObjectForFirestore(invitacion);
    await setDoc(doc(db, 'invitaciones', invitacion.id), cleanInv, { merge: true });
  } catch (err) {
    reportarErrorGuardado('invitaciones', err, 'Error saving invitacion to Firestore:');
  }
}

/**
 * Delete Invitacion from Firestore
 */
export async function deleteInvitacionFirestore(invitacionId: string) {
  try {
    await deleteDoc(doc(db, 'invitaciones', invitacionId));
  } catch (err) {
    reportarErrorGuardado('invitaciones', err, 'Error deleting invitacion from Firestore:');
  }
}

/**
 * Atomic booking of a visit slot in Firestore using runTransaction.
 * Guarantees that if two candidates attempt to book the exact same slot simultaneously,
 * only one succeeds and the other receives an error.
 */
export async function bookSlotTransaction(
  slotId: string,
  candidateData: { id: string; nombre: string; telefono: string; email?: string },
  invitacionId: string,
  fullAddress: string,
  notas?: string
) {
  const slotRef = doc(db, 'slots_visita', slotId);
  const invRef = doc(db, 'invitaciones', invitacionId);
  const candRef = doc(db, 'candidatos', candidateData.id);

  return await runTransaction(db, async (transaction) => {
    const slotSnap = await transaction.get(slotRef);
    if (!slotSnap.exists()) {
      throw new Error('El horario seleccionado no existe en el sistema.');
    }

    const slotData = slotSnap.data() as VisitSlot;
    if (!slotData.disponible || slotData.reservaCandidateId) {
      throw new Error('Lo sentimos, este horario acaba de ser reservado. Selecciona otro horario.');
    }

    const nowIso = new Date().toISOString();

    // 1. Update slot atomically
    transaction.update(slotRef, {
      disponible: false,
      reservaCandidateId: candidateData.id,
      reservaCandidateNombre: candidateData.nombre,
      reservaInvitationId: invitacionId,
      ...(slotData.habitacionId ? { habitacionId: slotData.habitacionId } : {}),
    });

    // 2. Update invitation status
    transaction.update(invRef, {
      status: 'HORARIO RESERVADO',
      bookedAt: nowIso,
      reserva: {
        slotId: slotData.id,
        fecha: slotData.fecha,
        horaInicio: slotData.horaInicio,
        horaFin: slotData.horaFin,
        direccionCompleta: fullAddress,
        notasCandidato: notas || '',
      },
    });

    // 3. Update candidate status
    transaction.update(candRef, {
      estado: 'visita_reservada',
    });

    return { ...slotData, disponible: false };
  });
}

/**
 * Saves a list of generated visit slots for an inmueble to Firestore in a batch write.
 */
export async function saveAgendaSlotsFirestore(slots: VisitSlot[]) {
  try {
    const batch = writeBatch(db);
    slots.forEach((s) => {
      const slotRef = doc(db, 'slots_visita', s.id);
      batch.set(slotRef, sanitizeObjectForFirestore(s), { merge: true });
    });
    await batch.commit();
  } catch (err) {
    reportarErrorGuardado('slots_visita', err, 'Error saving agenda slots to Firestore:');
  }
}

/**
 * Save / Update Visit Slot in Firestore
 */
export async function saveVisitSlotFirestore(slot: VisitSlot) {
  try {
    const cleanSlot = sanitizeObjectForFirestore(slot);
    await setDoc(doc(db, 'slots_visita', slot.id), cleanSlot, { merge: true });
  } catch (err) {
    reportarErrorGuardado('slots_visita', err, 'Error saving visit slot to Firestore:');
  }
}

/**
 * Delete Visit Slot from Firestore
 */
export async function deleteVisitSlotFirestore(slotId: string) {
  try {
    await deleteDoc(doc(db, 'slots_visita', slotId));
  } catch (err) {
    reportarErrorGuardado('slots_visita', err, 'Error deleting visit slot from Firestore:');
  }
}

/**
 * Delete multiple Visit Slots from Firestore in a batch write
 */
export async function deleteMultipleSlotsFirestore(slotIds: string[]) {
  if (!slotIds || slotIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    slotIds.forEach((id) => {
      batch.delete(doc(db, 'slots_visita', id));
    });
    await batch.commit();
  } catch (err) {
    reportarErrorGuardado('slots_visita', err, 'Error deleting multiple visit slots from Firestore:');
  }
}

/**
 * Save / Update Solicitud in Firestore
 */
export async function saveSolicitudFirestore(solicitud: SolicitudAlquiler) {
  try {
    const cleanSol = sanitizeObjectForFirestore(solicitud);
    await setDoc(doc(db, 'solicitudes', solicitud.id), cleanSol, { merge: true });
  } catch (err) {
    reportarErrorGuardado('solicitudes', err, 'Error saving solicitud to Firestore:');
  }
}

/**
 * Real-time listener for Solicitudes de Documentación Post-Visita
 */
export function subscribeSolicitudesDoc(callback: (solicitudesDoc: SolicitudDocumentacion[]) => void) {
  return onSnapshot(
    SOLICITUDES_DOC_COL,
    (snapshot) => {
      const items: SolicitudDocumentacion[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as SolicitudDocumentacion);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('solicitudes_documentacion', err, 'Firestore solicitudes_documentacion snapshot error:');
    }
  );
}

/**
 * Save / Update Solicitud de Documentación in Firestore
 */
export async function saveSolicitudDocFirestore(solicitudDoc: SolicitudDocumentacion) {
  try {
    const cleanDoc = sanitizeDocForFirestore(solicitudDoc);
    await setDoc(doc(db, 'solicitudes_documentacion', solicitudDoc.id), cleanDoc, { merge: true });
  } catch (err) {
    reportarErrorGuardado('solicitudes_documentacion', err, 'Error saving solicitud documentacion to Firestore:');
  }
}

/**
 * Delete Solicitud de Documentación from Firestore
 */
export async function deleteSolicitudDocFirestore(solicitudDocId: string) {
  try {
    await deleteDoc(doc(db, 'solicitudes_documentacion', solicitudDocId));
  } catch (err) {
    reportarErrorGuardado('solicitudes_documentacion', err, 'Error deleting solicitud documentacion from Firestore:');
  }
}

/**
 * Real-time listener for Contratos de Formalización (Fase 3).
 * FASE 1.4: con ámbito de PROPIETARIO lanza una consulta acotada por
 * propietarioId (nunca la colección completa). Es exactamente el filtro que las
 * Security Rules exigen para conceder el listado. Los profesionales no reciben
 * contratos. El administrador mantiene la escucha global.
 */
export function subscribeContratos(
  callback: (contratos: ContratoFormalizacion[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  if (!scope || scope.tipoPerfil === 'ADMINISTRADOR') {
    return onSnapshot(CONTRATOS_COL, (snapshot) => {
      const items: ContratoFormalizacion[] = [];
      snapshot.forEach((docSnap) => items.push({ id: docSnap.id, ...docSnap.data() } as ContratoFormalizacion));
      callback(items);
    }, (err) => reportarErrorLectura('contratos', err, 'Firestore contratos_formalizacion snapshot error:'));
  }

  // Los contratos del inquilino se cargan por get de cada ID vinculado; nunca
  // se permite una consulta list a la colección desde ese perfil.
  if (scope.tipoPerfil === 'INQUILINO') {
    callback([]);
    return () => {};
  }

  const pids = [
    ...(scope.tipoPerfil === 'PROPIETARIO' && scope.propietarioId ? [scope.propietarioId] : []),
    ...(scope.propietariosGestionados ?? []),
  ];
  const inmuebleIds = scope.inmuebleIds ?? [];
  return subscribeUnionContratosPorAmbito(pids, inmuebleIds, scope.ambitosParcialesGestionados ?? [], callback);
}

/**
 * Save / Update Contrato de Formalización in Firestore
 */
export async function saveContratoFirestore(contrato: ContratoFormalizacion) {
  try {
    const refC = doc(db, 'contratos_formalizacion', contrato.id);
    const existing = await getDoc(refC);
    if (existing.exists()) {
      const prev = existing.data() as ContratoFormalizacion;
      if (prev.habitacionId && contrato.habitacionId && prev.habitacionId !== contrato.habitacionId) {
        throw new Error('No se puede reasignar habitacionId de un contrato activo.');
      }
      if (prev.inmuebleId && contrato.inmuebleId && prev.inmuebleId !== contrato.inmuebleId) {
        throw new Error('No se puede reasignar inmuebleId de un contrato.');
      }
    }
    const cleanContrato = sanitizeObjectForFirestore(contrato);
    await setDoc(refC, cleanContrato, { merge: true });
  } catch (err) {
    reportarErrorGuardado('contratos', err, 'Error saving contrato formalizacion to Firestore:');
    throw err;
  }
}

export interface PersistirTransicionAlquilerOpts {
  marcarInmuebleAlquilado?: boolean;
  liberarInmueble?: boolean;
  habitacion?: HabitacionInmueble;
}

/**
 * Persiste en un único commit una transición de alquiler y sus referencias
 * patrimoniales. Contrato, ficha de inmueble, habitación (si aplica) y evento
 * de auditoría no pueden quedar a medias.
 */
export async function persistirTransicionAlquilerFirestore(
  contrato: ContratoFormalizacion,
  opciones: PersistirTransicionAlquilerOpts
): Promise<{ contrato: ContratoFormalizacion; inmueble?: Inmueble; habitacion?: HabitacionInmueble }> {
  const contratoRef = doc(db, 'contratos_formalizacion', contrato.id);
  const inmuebleRef = doc(db, 'inmuebles', contrato.inmuebleId);
  const fichaRef = doc(db, 'fichas_publicas_inmueble', contrato.inmuebleId);
  const habitacionId = opciones.habitacion?.id || (opciones.liberarInmueble ? contrato.habitacionId : undefined);
  const habitacionRef = habitacionId ? doc(db, 'habitaciones_inmueble', habitacionId) : undefined;
  const auditRef = doc(AUDIT_LOGS_COL);
  const ahora = new Date().toISOString();
  const actor = auth.currentUser;
  if (!actor) throw new Error('Se requiere una sesión autenticada para cambiar el ciclo de alquiler.');
  if (!contrato.id || !contrato.inmuebleId) throw new Error('Contrato sin ID o sin inmueble vinculado.');
  if (!opciones.marcarInmuebleAlquilado && !opciones.liberarInmueble) {
    throw new Error('La transición debe activar o finalizar un vínculo patrimonial.');
  }
  if (opciones.marcarInmuebleAlquilado && contrato.habitacionId && !opciones.habitacion) {
    throw new Error('El contrato por habitación requiere persistir la habitación vinculada en el mismo ciclo.');
  }
  if (opciones.habitacion && (opciones.habitacion.inmuebleId !== contrato.inmuebleId || opciones.habitacion.id !== contrato.habitacionId)) {
    throw new Error('La habitación no corresponde al inmueble/habitación del contrato.');
  }

  const resultado = await runTransaction(db, async (tx) => {
    const contratoSnap = await tx.get(contratoRef);
    const inmuebleSnap = await tx.get(inmuebleRef);
    const fichaSnap = await tx.get(fichaRef);
    const habitacionSnap = habitacionRef ? await tx.get(habitacionRef) : undefined;
    if (!inmuebleSnap.exists()) throw new Error('El inmueble vinculado al contrato ya no existe.');
    if (habitacionRef && !habitacionSnap?.exists()) throw new Error('La habitación vinculada al contrato ya no existe.');

    const anterior = contratoSnap.exists() ? contratoSnap.data() as ContratoFormalizacion : undefined;
    if (anterior?.id && anterior.id !== contratoSnap.id) {
      throw new Error('El ID almacenado del contrato no coincide con su ruta Firestore.');
    }
    const inmuebleData = inmuebleSnap.data() as Inmueble;
    if (inmuebleData.id && inmuebleData.id !== inmuebleSnap.id) {
      throw new Error('El ID almacenado del inmueble no coincide con su ruta Firestore.');
    }
    const yaFinalizado = opciones.liberarInmueble && !opciones.marcarInmuebleAlquilado && anterior?.estado === 'FINALIZADO';
    if (opciones.marcarInmuebleAlquilado && anterior && ['FINALIZADO', 'RESCINDIDO', 'CANCELADO'].includes(anterior.estado)) {
      throw new Error('No se puede activar un contrato que ya está finalizado, rescindido o cancelado.');
    }
    let contratoTx = yaFinalizado ? anterior! : contrato;
    if (anterior?.inmuebleId && anterior.inmuebleId !== contratoTx.inmuebleId) {
      throw new Error('Conflicto de persistencia: el contrato ya está vinculado a otro inmueble.');
    }
    if (anterior?.habitacionId && contratoTx.habitacionId && anterior.habitacionId !== contratoTx.habitacionId) {
      throw new Error('Conflicto de persistencia: no se puede reasignar la habitación del contratoTx.');
    }

    const inmueble = { ...inmuebleData, id: inmuebleSnap.id } as Inmueble;
    const propietarioInmueble = inmueble.propietarioId || inmueble.propietarioPrincipalId;
    if (contratoTx.propietarioId && propietarioInmueble && contratoTx.propietarioId !== propietarioInmueble) {
      throw new Error('El contrato y el inmueble no pertenecen al mismo titular.');
    }
    if (!contratoTx.propietarioId && propietarioInmueble) contratoTx = { ...contratoTx, propietarioId: propietarioInmueble };

    let inmuebleActualizado: Inmueble | undefined;
    let habitacionActualizada: HabitacionInmueble | undefined;
    const guardarInmuebleEnTransaccion = (valor: Inmueble) => {
      const limpio: Record<string, any> = sanitizeInmuebleForFirestore(valor);
      for (const campo of ['inquilinoActualId', 'inquilinoActualNombre', 'contratoActivoId'] as const) {
        if (!valor[campo]) limpio[campo] = deleteField();
      }
      tx.set(inmuebleRef, limpio, { merge: true });
    };
    const guardarHabitacionEnTransaccion = (valor: HabitacionInmueble) => {
      const limpio = sanitizeObjectForFirestore(valor);
      if (opciones.liberarInmueble && !valor.contratoId) limpio.contratoId = deleteField();
      tx.set(habitacionRef!, limpio, { merge: true });
    };
    if (habitacionRef) {
      const habitacionData = habitacionSnap!.data() as HabitacionInmueble;
      if (habitacionData.id && habitacionData.id !== habitacionSnap!.id) {
        throw new Error('El ID almacenado de la habitación no coincide con su ruta Firestore.');
      }
      const habitacionActual = { ...habitacionData, id: habitacionSnap!.id } as HabitacionInmueble;
      if (habitacionActual.inmuebleId !== contratoTx.inmuebleId || habitacionActual.id !== contratoTx.habitacionId) {
        throw new Error('La referencia de habitación persistida no coincide con el contrato.');
      }
      if (habitacionActual.propietarioId && contratoTx.propietarioId && habitacionActual.propietarioId !== contratoTx.propietarioId) {
        throw new Error('La habitación y el contrato no pertenecen al mismo titular.');
      }
      if (opciones.habitacion) {
        if (opciones.habitacion.contratoId && opciones.habitacion.contratoId !== contratoTx.id) {
          throw new Error('La habitación pertenece a otro contrato; no se puede liberar desde este ciclo.');
        }
        if (opciones.liberarInmueble && habitacionActual.contratoId !== contratoTx.id) {
          throw new Error('La habitación ya no está vinculada al contrato que se intenta finalizar.');
        }
        habitacionActualizada = opciones.habitacion;
        guardarHabitacionEnTransaccion(habitacionActualizada);
      } else if (opciones.liberarInmueble && habitacionActual.contratoId === contratoTx.id) {
        // Cierres que llegan desde recomercialización también liberan la
        // habitación en la misma transacción, aunque no aporten el objeto UI.
        habitacionActualizada = {
          ...habitacionActual, estado: 'DISPONIBLE', contratoId: undefined,
          fechaModificacion: ahora, actualizadoPor: actor.uid,
        };
        guardarHabitacionEnTransaccion(habitacionActualizada);
      } else if (!yaFinalizado) {
        throw new Error('La habitación ya no está vinculada al contrato que se intenta finalizar.');
      }
    }

    if (opciones.marcarInmuebleAlquilado) {
      if (inmueble.contratoActivoId && inmueble.contratoActivoId !== contratoTx.id) {
        throw new Error('El inmueble ya tiene otro contrato activo vinculado.');
      }
      if (inmueble.inquilinoActualId && inmueble.inquilinoActualId !== contratoTx.candidatoId) {
        throw new Error('El inmueble ya está ocupado por otro inquilino; no se puede sustituir su referencia.');
      }
      if (!contratoTx.habitacionId) {
        inmuebleActualizado = {
          ...inmueble,
          estado: 'alquilado',
          inquilinoActualId: contratoTx.candidatoId,
          inquilinoActualNombre: contratoTx.candidatoNombre,
          contratoActivoId: contratoTx.id,
        };
        guardarInmuebleEnTransaccion(inmuebleActualizado);
      }
    } else if (opciones.liberarInmueble && !contratoTx.habitacionId) {
      if (inmueble.contratoActivoId && inmueble.contratoActivoId !== contratoTx.id) {
        // Puede existir una nueva ocupación sobre la misma ficha. El contrato
        // histórico se cierra, pero jamás libera ni borra la referencia nueva.
      } else if (!inmueble.inquilinoActualId || inmueble.inquilinoActualId === contratoTx.candidatoId) {
        inmuebleActualizado = {
          ...inmueble,
          estado: 'disponible',
          inquilinoActualId: undefined,
          inquilinoActualNombre: undefined,
          contratoActivoId: undefined,
        };
        guardarInmuebleEnTransaccion(inmuebleActualizado);
      }
    }

    if (yaFinalizado && !inmuebleActualizado && !habitacionActualizada) {
      // Reintento seguro: si el cierre ya se persistió y no queda ningún
      // vínculo patrimonial por reparar, evita historial/auditoría duplicados.
      return { contrato: contratoTx };
    }

    if (inmuebleActualizado && fichaSnap.exists()) {
      const fichaPublicaActualizada = buildFichaPublicaInmueble(inmuebleActualizado, ahora);
      if (fichaPublicaActualizada) tx.set(fichaRef, sanitizeObjectForFirestore(fichaPublicaActualizada));
    }
    tx.set(contratoRef, sanitizeObjectForFirestore(contratoTx), { merge: true });
    const audit: AuditLog = {
      id: auditRef.id,
      usuarioId: actor.uid,
      usuarioEmail: actor.email || '',
      usuarioNombre: actor.displayName || actor.email || actor.uid,
      accion: opciones.marcarInmuebleAlquilado ? 'ALQUILER_CONTRATO_ACTIVADO' : 'ALQUILER_CONTRATO_FINALIZADO',
      descripcion: opciones.marcarInmuebleAlquilado
        ? (contratoTx.habitacionId
          ? 'Contrato y habitación vinculados en una transición atómica de alquiler.'
          : 'Contrato e inmueble vinculados en una transición atómica de alquiler.')
        : 'Finalización contractual persistida con actualización condicionada de sus vínculos patrimoniales.',
      fechaHora: ahora,
      entidadAfectada: 'contrato',
      idAfectado: contratoTx.id,
      resultado: 'EXITO',
      detalles: {
        contratoId: contratoTx.id,
        inmuebleId: contratoTx.inmuebleId,
        habitacionId: contratoTx.habitacionId || null,
        contratoAnteriorId: anterior?.id || null,
        rutas: [`contratos_formalizacion/${contratoTx.id}`,
          ...(inmuebleActualizado ? [`inmuebles/${contratoTx.inmuebleId}`] : []),
          ...(habitacionActualizada && habitacionRef ? [`habitaciones_inmueble/${habitacionRef.id}`] : []),
          ...(inmuebleActualizado && fichaSnap.exists() ? [`fichas_publicas_inmueble/${contratoTx.inmuebleId}`] : [])],
      },
    };
    tx.set(auditRef, sanitizeObjectForFirestore(audit));
    return { contrato: contratoTx, inmueble: inmuebleActualizado, habitacion: habitacionActualizada };
  });

  return resultado;
}

/**
 * Delete Contrato de Formalización from Firestore
 */
export async function deleteContratoFirestore(contratoId: string) {
  try {
    await deleteDoc(doc(db, 'contratos_formalizacion', contratoId));
  } catch (err) {
    reportarErrorGuardado('contratos', err, 'Error deleting contrato formalizacion from Firestore:');
  }
}

// ============================================================
// FASE 2.0 — GASTOS (explotación vs financiación)
// ============================================================

/**
 * Listener de gastos con el mismo aislamiento que los contratos:
 * - PROFESIONAL: cero acceso (son datos económicos).
 * - PROPIETARIO: consulta demostrable where('propietarioId','==', pid).
 * - ADMINISTRADOR / sin ámbito: colección completa.
 */
export function subscribeGastos(
  callback: (gastos: Gasto[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // D2 (§2): mismo aislamiento que contratos, con unión multicartera para
  // el gestor (pid propio + carteras pid-a-pid; profesional sin carteras
  // conserva cero acceso a datos económicos).
  const gestionadosGastos = scope?.propietariosGestionados ?? [];
  if (scope?.tipoPerfil === 'PROFESIONAL' && gestionadosGastos.length === 0) {
    callback([]);
    return () => {};
  }
  if (
    gestionadosGastos.length > 0 &&
    (scope?.tipoPerfil === 'PROPIETARIO' || scope?.tipoPerfil === 'PROFESIONAL')
  ) {
    const pids =
      scope.tipoPerfil === 'PROPIETARIO' && scope.propietarioId
        ? [scope.propietarioId, ...gestionadosGastos]
        : gestionadosGastos;
    return subscribeUnionPorPropietario<Gasto>(GASTOS_COL, pids, callback, 'gastos');
  }

  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(
      GASTOS_COL,
      (snapshot) => {
        const items: Gasto[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as Gasto);
        });
        callback(items);
      },
      (err) => {
        reportarErrorLectura('gastos', err, 'Firestore gastos snapshot error:');
      }
    );
  }

  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }

  const scopedQuery = query(GASTOS_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    scopedQuery,
    (snap) => {
      const items: Gasto[] = [];
      snap.forEach((ds) => {
        items.push({ id: ds.id, ...ds.data() } as Gasto);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('gastos', err, 'Firestore gastos (scoped) snapshot error:');
    }
  );
}

export type FirestoreWriteResult =
  | { ok: true }
  | { ok: false; error: unknown };

/** Escritura verificable para flujos que no pueden tratar un fallo como éxito. */
export async function saveGastoFirestoreWithResult(gasto: Gasto): Promise<FirestoreWriteResult> {
  try {
    const cleanGasto = sanitizeObjectForFirestore(gasto);
    await setDoc(doc(db, 'gastos', gasto.id), cleanGasto, { merge: true });
    return { ok: true };
  } catch (error) {
    reportarErrorGuardado('gastos', error, `Error saving gasto '${gasto.id}' to Firestore:`);
    return { ok: false, error };
  }
}

/** API histórica best-effort; conserva Promise<void> para sus consumidores existentes. */
export async function saveGastoFirestore(gasto: Gasto): Promise<void> {
  await saveGastoFirestoreWithResult(gasto);
}

export async function deleteGastoFirestore(gastoId: string) {
  try {
    await deleteDoc(doc(db, 'gastos', gastoId));
  } catch (err) {
    reportarErrorGuardado('gastos', err, 'Error deleting gasto from Firestore:');
  }
}

/**
 * Listener de plantillas de gastos recurrentes con el mismo aislamiento que los
 * gastos: profesionales sin datos, propietario por where('propietarioId','=='),
 * administrador con la colección completa.
 */
export function subscribeGastosRecurrentes(
  callback: (plantillas: GastoRecurrente[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // D2 (§2): unión multicartera para el gestor (mismo patrón que gastos).
  const gestionadosRecurrentes = scope?.propietariosGestionados ?? [];
  if (scope?.tipoPerfil === 'PROFESIONAL' && gestionadosRecurrentes.length === 0) {
    callback([]);
    return () => {};
  }
  if (
    gestionadosRecurrentes.length > 0 &&
    (scope?.tipoPerfil === 'PROPIETARIO' || scope?.tipoPerfil === 'PROFESIONAL')
  ) {
    const pids =
      scope.tipoPerfil === 'PROPIETARIO' && scope.propietarioId
        ? [scope.propietarioId, ...gestionadosRecurrentes]
        : gestionadosRecurrentes;
    return subscribeUnionPorPropietario<GastoRecurrente>(GASTOS_RECURRENTES_COL, pids, callback, 'gastos_recurrentes');
  }
  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(
      GASTOS_RECURRENTES_COL,
      (snapshot) => {
        const items: GastoRecurrente[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as GastoRecurrente);
        });
        callback(items);
      },
      (err) => {
        reportarErrorLectura('gastos_recurrentes', err, 'Firestore gastos_recurrentes snapshot error:');
      }
    );
  }
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }
  const scopedQuery = query(GASTOS_RECURRENTES_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    scopedQuery,
    (snap) => {
      const items: GastoRecurrente[] = [];
      snap.forEach((ds) => {
        items.push({ id: ds.id, ...ds.data() } as GastoRecurrente);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('gastos_recurrentes', err, 'Firestore gastos_recurrentes (scoped) snapshot error:');
    }
  );
}

export async function saveGastoRecurrenteFirestore(plantilla: GastoRecurrente) {
  try {
    const clean = sanitizeObjectForFirestore(plantilla);
    await setDoc(doc(db, 'gastos_recurrentes', plantilla.id), clean, { merge: true });
  } catch (err) {
    reportarErrorGuardado('gastos_recurrentes', err, 'Error saving gasto recurrente to Firestore:');
  }
}

export async function deleteGastoRecurrenteFirestore(plantillaId: string) {
  try {
    // No se eliminan los apuntes ya materializados: se conserva el histórico.
    await deleteDoc(doc(db, 'gastos_recurrentes', plantillaId));
  } catch (err) {
    reportarErrorGuardado('gastos_recurrentes', err, 'Error deleting gasto recurrente from Firestore:');
  }
}

// ============================================================
// FASE 2.3 — PRÉSTAMOS / HIPOTECAS (condiciones financieras)
// ============================================================

export function subscribePrestamos(
  callback: (prestamos: Prestamo[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }
  if (!scope || scope.tipoPerfil !== 'PROPIETARIO') {
    return onSnapshot(
      PRESTAMOS_COL,
      (snapshot) => {
        const items: Prestamo[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...docSnap.data() } as Prestamo);
        });
        callback(items);
      },
      (err) => {
        reportarErrorLectura('prestamos', err, 'Firestore prestamos snapshot error:');
      }
    );
  }
  const pid = scope.propietarioId;
  if (!pid) {
    callback([]);
    return () => {};
  }
  const scopedQuery = query(PRESTAMOS_COL, where('propietarioId', '==', pid));
  return onSnapshot(
    scopedQuery,
    (snap) => {
      const items: Prestamo[] = [];
      snap.forEach((ds) => {
        items.push({ id: ds.id, ...ds.data() } as Prestamo);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('prestamos', err, 'Firestore prestamos (scoped) snapshot error:');
    }
  );
}

export async function savePrestamoFirestore(prestamo: Prestamo) {
  try {
    const clean = sanitizeObjectForFirestore(prestamo);
    await setDoc(doc(db, 'prestamos', prestamo.id), clean, { merge: true });
  } catch (err) {
    reportarErrorGuardado('prestamos', err, 'Error saving prestamo to Firestore:');
  }
}

export async function deletePrestamoFirestore(prestamoId: string) {
  try {
    await deleteDoc(doc(db, 'prestamos', prestamoId));
  } catch (err) {
    reportarErrorGuardado('prestamos', err, 'Error deleting prestamo from Firestore:');
  }
}

// ============================================================
// D2 (§2) — Unión de listeners pid-a-pid para el gestor multicartera.
// Cada pid (propio + carteras gestionadas) se escucha con una consulta
// demostrable where('propietarioId','==', pid); los resultados se fusionan
// por id de documento. Un listener revocado falla cerrado (error aislado,
// resto intacto); el gestor nunca consulta la colección completa.
// ============================================================
/**
 * Campos de aislamiento con los que las reglas conceden `list` a un perfil no
 * master. Son los MISMOS nombres que usan `firestore.rules` (`aisladoEsMio`,
 * `ambitoPorInmuebleLectura`, `myProfId`, `profesionalAsignadoId`,
 * `ambitoPorContratoLectura`): la consulta acotada debe declarar el campo que
 * la regla compara.
 */
export type CampoAmbito =
  | 'propietarioId'
  | 'inmuebleId'
  | 'profesionalId'
  | 'profesionalAsignadoId'
  | 'contratoId';

/**
 * BLOQUE 12 · A-01 — Unión de consultas acotadas por campo de aislamiento.
 * Una consulta por valor (`where(campo,'==',valor)`) para que las reglas puedan
 * demostrar la pertenencia documento a documento; Firestore NO usa reglas como
 * filtros, de modo que una consulta sin acotar sobre una colección con
 * condición por documento es denegada para todo perfil no master.
 */
function subscribeUnionDeFuentes<T extends { id: string }>(
  col: ReturnType<typeof collection>,
  fuentesAmbito: Array<{ campo: CampoAmbito; valores: Array<string | undefined> }>,
  callback: (items: T[]) => void,
  etiqueta: string
): Unsubscribe {
  const porFuente = new Map<string, Map<string, T>>();
  const fuentes: Unsubscribe[] = [];
  const notificar = () => {
    const union = new Map<string, T>();
    porFuente.forEach((fuente) => fuente.forEach((v, k) => union.set(k, v)));
    callback(Array.from(union.values()));
  };
  const vistos = new Set<string>();
  for (const { campo, valores } of fuentesAmbito) {
    for (const valor of valores) {
      if (!valor) continue;
      const clave = `${campo}:${valor}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      fuentes.push(
        onSnapshot(
          query(col, where(campo, '==', valor)),
          (snap) => {
            const parcial = new Map<string, T>();
            snap.forEach((ds) => parcial.set(ds.id, { id: ds.id, ...ds.data() } as unknown as T));
            porFuente.set(clave, parcial);
            notificar();
          },
          (err) => {
            reportarErrorLectura(etiqueta, err, `Firestore ${etiqueta} (${clave}) snapshot error:`);
          }
        )
      );
    }
  }
  if (fuentes.length === 0) {
    callback([]);
    return () => {};
  }
  return () => {
    fuentes.forEach((u) => u());
  };
}

function subscribeUnionPorCampo<T extends { id: string }>(
  col: ReturnType<typeof collection>,
  campo: CampoAmbito,
  valores: Array<string | undefined>,
  callback: (items: T[]) => void,
  etiqueta: string
): Unsubscribe {
  return subscribeUnionDeFuentes<T>(col, [{ campo, valores }], callback, etiqueta);
}

function subscribeUnionPorPropietario<T extends { id: string }>(
  col: ReturnType<typeof collection>,
  pids: Array<string | undefined>,
  callback: (items: T[]) => void,
  etiqueta: string
): Unsubscribe {
  return subscribeUnionPorCampo<T>(col, 'propietarioId', pids, callback, etiqueta);
}

/**
 * BLOQUE 12 · A-01 — Ámbito de consulta derivado del usuario de sesión.
 * Única derivación autorizada para las secciones: mismas claves que ya usa la
 * capa global de `App.tsx` (`propietariosGestionadosDe` = L ∪ E). Las reglas
 * revalidan cada consulta: esto sólo delimita lo que se pide.
 */
export function scopeDeUsuario(usuario?: UsuarioApp | null): DataAccessScope | undefined {
  if (!usuario) return undefined;
  return {
    tipoPerfil: usuario.tipoPerfil,
    propietarioId: usuario.propietarioId,
    inmuebleIds: usuario.inmuebleIds || [],
    profesionalId: usuario.profesionalId,
    propietariosGestionados: propietariosGestionadosDe({
      carterasL: usuario.carterasL || [],
      carterasE: usuario.carterasE || [],
    }),
    inmueblesGestionadosParciales: usuario.inmueblesDelegadosParciales || [],
  };
}

/**
 * BLOQUE 12 · A-01 — Clave estable de un ámbito para dependencias de efecto.
 * Las secciones la usan como dependencia: al cambiar el ámbito (otro titular,
 * otra cartera, revocación o cambio de inmuebles) el efecto se re-ejecuta y las
 * suscripciones anteriores se desmontan en su limpieza.
 */
export function claveScope(scope?: DataAccessScope): string {
  if (!scope) return 'sin-ambito';
  return JSON.stringify([
    scope.tipoPerfil ?? '',
    scope.propietarioId ?? '',
    [...(scope.inmuebleIds ?? [])].sort(),
    [...(scope.propietariosGestionados ?? [])].sort(),
    [...(scope.inmueblesGestionadosParciales ?? [])].sort(),
    scope.profesionalId ?? '',
    [...(scope.contratoIds ?? [])].sort(),
  ]);
}

/**
 * BLOQUE 12 · A-01 — Suscripción acotada por ámbito y campo de aislamiento.
 *
 * Semántica (idéntica para todas las colecciones):
 *  · sin ámbito o ADMINISTRADOR → colección completa (las reglas deciden; el
 *    master es el único perfil con `list` global en las colecciones aisladas);
 *  · PROPIETARIO → su pid (+ carteras si la colección las admite);
 *  · PROFESIONAL → por `profesionalId`/`profesionalAsignadoId` o, en
 *    colecciones con lectura de cartera, unión pid a pid; sin ámbito aplicable
 *    devuelve vacío (fallo en cerrado, nunca consulta global);
 *  · PROPIETARIO/PROFESIONAL por `inmuebleId`/`contratoId` → una consulta por
 *    identificador permitido; sin identificadores, vacío.
 */
export function subscribeColeccionPorAmbito<T extends { id: string }>(
  col: ReturnType<typeof collection>,
  callback: (items: T[]) => void,
  scope: DataAccessScope | undefined,
  etiqueta: string,
  opciones: {
    campo?: CampoAmbito;
    conCarteras?: boolean;
    /**
     * Campo con el que las reglas conceden `list` al profesional vinculado
     * (`profesionalAsignadoId` en incidencias, `profesionalId` en trabajos y
     * presupuestos). Se une a la consulta de cartera cuando el gestor además
     * tiene titulares delegados.
     */
    campoProfesional?: 'profesionalId' | 'profesionalAsignadoId';
  } = {}
): Unsubscribe {
  const campo: CampoAmbito = opciones.campo ?? 'propietarioId';
  const conCarteras = opciones.conCarteras ?? false;
  const perfil = scope?.tipoPerfil;
  const mapear = (snap: QuerySnapshot) => {
    const items: T[] = [];
    snap.forEach((ds) => items.push({ id: ds.id, ...ds.data() } as unknown as T));
    callback(items);
  };
  const onError = (err: unknown) => reportarErrorLectura(etiqueta, err, `Firestore ${etiqueta} snapshot error:`);
  const vacio = () => {
    callback([]);
    return () => {};
  };

  // Sin ámbito (master/admin de sistema) o ADMINISTRADOR: colección completa
  // para las colecciones cuyo aislamiento es por propietario. Las colecciones
  // que exigen una clave por documento (`inmuebleId`/`contratoId`) se resuelven
  // por identificador también para el administrador: la condición documental
  // no es demostrable sin el filtro.
  const coleccionCompleta = perfil !== 'PROPIETARIO' && perfil !== 'PROFESIONAL';

  if (campo === 'inmuebleId') {
    // Titulares (propios ∪ autorizados) y delegaciones parciales activas; el
    // gestor de cartera completa ve los inmuebles de su cartera porque el
    // llamante ya entrega el conjunto acotado (p. ej. `scopedInmuebles`).
    const ids = [...(scope?.inmuebleIds ?? []), ...(scope?.inmueblesGestionadosParciales ?? [])];
    if (ids.length === 0) {
      return coleccionCompleta ? onSnapshot(col, mapear, onError) : vacio();
    }
    return subscribeUnionPorCampo<T>(col, 'inmuebleId', ids, callback, etiqueta);
  }

  if (campo === 'contratoId') {
    const ids = scope?.contratoIds ?? [];
    if (ids.length === 0) {
      return coleccionCompleta ? onSnapshot(col, mapear, onError) : vacio();
    }
    return subscribeUnionPorCampo<T>(col, 'contratoId', ids, callback, etiqueta);
  }

  if (!scope || perfil === 'ADMINISTRADOR' || !perfil) {
    return onSnapshot(col, mapear, onError);
  }

  if (campo === 'profesionalId' || campo === 'profesionalAsignadoId') {
    if (perfil !== 'PROFESIONAL' || !scope.profesionalId) return vacio();
    return onSnapshot(query(col, where(campo, '==', scope.profesionalId)), mapear, onError);
  }

  // campo === 'propietarioId'
  const gestionados = conCarteras ? (scope.propietariosGestionados ?? []) : [];
  if (perfil === 'PROFESIONAL') {
    const fuentes: Array<{ campo: CampoAmbito; valores: Array<string | undefined> }> = [];
    if (gestionados.length > 0) fuentes.push({ campo: 'propietarioId', valores: gestionados });
    if (opciones.campoProfesional && scope.profesionalId) {
      fuentes.push({ campo: opciones.campoProfesional, valores: [scope.profesionalId] });
    }
    if (fuentes.length === 0) return vacio();
    return subscribeUnionDeFuentes<T>(col, fuentes, callback, etiqueta);
  }
  if (perfil === 'PROPIETARIO') {
    if (!scope.propietarioId && gestionados.length === 0) return vacio();
    return subscribeUnionPorCampo<T>(
      col,
      'propietarioId',
      [scope.propietarioId, ...gestionados],
      callback,
      etiqueta
    );
  }
  return vacio();
}

/**
 * Unión de consultas de contratos: cartera completa por propietario y
 * delegación parcial por inmueble. Firestore Rules revalidan cada consulta;
 * los IDs locales solo delimitan el conjunto solicitado.
 */
function subscribeUnionContratosPorAmbito(
  pids: string[],
  inmuebleIds: string[],
  ambitosParciales: InmuebleDelegadoParcial[],
  callback: (items: ContratoFormalizacion[]) => void
): Unsubscribe {
  const fuentesDatos = new Map<string, Map<string, ContratoFormalizacion>>();
  const fuentes: Unsubscribe[] = [];
  const notificar = () => {
    const union = new Map<string, ContratoFormalizacion>();
    fuentesDatos.forEach((fuente) => fuente.forEach((v, k) => union.set(k, v)));
    callback(Array.from(union.values()));
  };
  const configuraciones = [
    ...Array.from(new Set(pids)).filter(Boolean).map((pid) => ({ clave: `pid:${pid}`, filtros: [where('propietarioId', '==', pid)] })),
    ...Array.from(new Set(inmuebleIds)).filter(Boolean).map((id) => ({ clave: `inmueble:${id}`, filtros: [where('inmuebleId', '==', id)] })),
    ...ambitosParciales.map(({ propietarioId, inmuebleId }) => ({
      clave: `parcial:${propietarioId}:${inmuebleId}`,
      filtros: [where('propietarioId', '==', propietarioId), where('inmuebleId', '==', inmuebleId)],
    })),
  ];
  for (const fuente of configuraciones) {
    fuentes.push(onSnapshot(
      query(CONTRATOS_COL, ...fuente.filtros),
      (snap) => {
        const datos = new Map<string, ContratoFormalizacion>();
        snap.forEach((ds) => datos.set(ds.id, { id: ds.id, ...ds.data() } as ContratoFormalizacion));
        fuentesDatos.set(fuente.clave, datos);
        notificar();
      },
      (err) => reportarErrorLectura('contratos', err, `Firestore contratos (${fuente.clave}) snapshot error:`)
    ));
  }
  if (!fuentes.length) callback([]);
  return () => fuentes.forEach((unsubscribe) => unsubscribe());
}

// ============================================================
// FASE 3.0 — RECOMERCIALIZACIÓN INTELIGENTE
// Suscripción genérica aislada por propietario (patrón de
// contratos/gastos): profesionales sin datos, propietario con
// where('propietarioId','==', pid), administrador con todo.
// ============================================================
function subscribeColeccionPropietario<T extends { id: string }>(
  col: ReturnType<typeof collection>,
  callback: (items: T[]) => void,
  scope: DataAccessScope | undefined,
  etiqueta: string,
  // D2 (§2): solo las colecciones cuyas Rules conceden lectura a carteras
  // (hoy: incidencias) activan la unión multicartera. El resto conserva el
  // aislamiento estricto por pid propio aunque el scope traiga carteras.
  conCarteras?: boolean
): Unsubscribe {
  // BLOQUE 12 · A-01: una sola implementación del aislamiento por propietario.
  return subscribeColeccionPorAmbito<T>(col, callback, scope, etiqueta, {
    campo: 'propietarioId',
    conCarteras,
  });
}

// ---- Expedientes de recomercialización ----
export function subscribeExpedientesRecomercializacion(
  callback: (items: ExpedienteRecomercializacion[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<ExpedienteRecomercializacion>(
    EXPEDIENTES_RECOMERCIALIZACION_COL,
    callback,
    scope,
    'expedientes_recomercializacion'
  );
}
export async function saveExpedienteRecomercializacionFirestore(item: ExpedienteRecomercializacion) {
  try {
    await setDoc(
      doc(db, 'expedientes_recomercializacion', item.id),
      sanitizeObjectForFirestore(item),
      { merge: true }
    );
  } catch (err) {
    reportarErrorGuardado('expedientes_recomercializacion', err, 'Error saving expediente recomercializacion:');
  }
}
export async function deleteExpedienteRecomercializacionFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'expedientes_recomercializacion', id));
  } catch (err) {
    reportarErrorGuardado('expedientes_recomercializacion', err, 'Error deleting expediente recomercializacion:');
  }
}

// ---- Directorio de inmobiliarias (lectura propietario+admin; escritura admin) ----
export function subscribeInmobiliarias(
  callback: (items: InmobiliariaDirectorio[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // El directorio lo consultan administrador y propietario (bolsa para delegar);
  // los profesionales no participan en la comercialización.
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    INMOBILIARIAS_DIRECTORIO_COL,
    (snap) => {
      const items: InmobiliariaDirectorio[] = [];
      snap.forEach((ds) => items.push({ id: ds.id, ...ds.data() } as InmobiliariaDirectorio));
      callback(items);
    },
    (err) => reportarErrorLectura('inmobiliarias', err, 'Firestore inmobiliarias_directorio snapshot error:')
  );
}
export async function saveInmobiliariaFirestore(item: InmobiliariaDirectorio) {
  try {
    await setDoc(doc(db, 'inmobiliarias_directorio', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    reportarErrorGuardado('inmobiliarias', err, 'Error saving inmobiliaria:');
  }
}
export async function deleteInmobiliariaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'inmobiliarias_directorio', id));
  } catch (err) {
    reportarErrorGuardado('inmobiliarias', err, 'Error deleting inmobiliaria:');
  }
}

// ---- Propuestas de inmobiliarias (RFP) ----
export function subscribePropuestasInmobiliaria(
  callback: (items: PropuestaInmobiliaria[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<PropuestaInmobiliaria>(
    PROPUESTAS_INMOBILIARIA_COL,
    callback,
    scope,
    'propuestas_inmobiliaria'
  );
}
export async function savePropuestaInmobiliariaFirestore(item: PropuestaInmobiliaria) {
  try {
    await setDoc(doc(db, 'propuestas_inmobiliaria', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    reportarErrorGuardado('propuestas_inmobiliaria', err, 'Error saving propuesta inmobiliaria:');
  }
}
export async function deletePropuestaInmobiliariaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'propuestas_inmobiliaria', id));
  } catch (err) {
    reportarErrorGuardado('propuestas_inmobiliaria', err, 'Error deleting propuesta inmobiliaria:');
  }
}

// ---- Leads de intermediación ----
export function subscribeLeadsInmobiliarios(
  callback: (items: LeadInmobiliario[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<LeadInmobiliario>(
    LEADS_INMOBILIARIOS_COL,
    callback,
    scope,
    'leads_inmobiliario'
  );
}
export async function saveLeadInmobiliarioFirestore(item: LeadInmobiliario) {
  try {
    await setDoc(doc(db, 'leads_inmobiliario', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    reportarErrorGuardado('leads_inmobiliarios', err, 'Error saving lead inmobiliario:');
  }
}
export async function deleteLeadInmobiliarioFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'leads_inmobiliario', id));
  } catch (err) {
    reportarErrorGuardado('leads_inmobiliarios', err, 'Error deleting lead inmobiliario:');
  }
}

// ============================================================
// BLOQUE 4 — INCIDENCIAS Y MANTENIMIENTO
// Aislamiento por propietarioId (patrón de contratos/gastos). Los
// profesionales también necesitan ver sus órdenes ASIGNADAS: se
// resuelve en la regla con where('profesionalAsignadoId','==', id).
// ============================================================
export function subscribeIncidencias(
  callback: (items: Incidencia[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // D2 (§2): Rules de incidencias con lectura de cartera.
  // BLOQUE 12 · A-01: y con la rama del profesional asignado
  // (`profesionalAsignadoId == myProfId()`): el gestor profesional que además
  // tiene cartera recibe la unión de ambas, nunca la colección completa.
  return subscribeColeccionPorAmbito<Incidencia>(
    INCIDENCIAS_COL,
    callback,
    scope,
    'incidencias',
    { campo: 'propietarioId', conCarteras: true, campoProfesional: 'profesionalAsignadoId' }
  );
}
export async function saveIncidenciaFirestore(item: Incidencia) {
  try {
    await setDoc(doc(db, 'incidencias', item.id), sanitizeObjectForFirestore(item), { merge: true });
  } catch (err) {
    reportarErrorGuardado('incidencias', err, 'Error saving incidencia:');
  }
}
export async function deleteIncidenciaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'incidencias', id));
  } catch (err) {
    reportarErrorGuardado('incidencias', err, 'Error deleting incidencia:');
  }
}

export function subscribeTareasMantenimiento(
  callback: (items: TareaMantenimiento[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<TareaMantenimiento>(
    TAREAS_MANTENIMIENTO_COL,
    callback,
    scope,
    'tareas_mantenimiento'
  );
}
export async function saveTareaMantenimientoFirestoreWithResult(
  item: TareaMantenimiento
): Promise<FirestoreWriteResult> {
  try {
    await setDoc(doc(db, 'tareas_mantenimiento', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
    return { ok: true };
  } catch (error) {
    reportarErrorGuardado('tareas_mantenimiento', error, `Error saving tarea mantenimiento '${item.id}':`);
    return { ok: false, error };
  }
}

/** API histórica best-effort; conserva Promise<void> para sus consumidores existentes. */
export async function saveTareaMantenimientoFirestore(item: TareaMantenimiento): Promise<void> {
  await saveTareaMantenimientoFirestoreWithResult(item);
}
export async function deleteTareaMantenimientoFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'tareas_mantenimiento', id));
  } catch (err) {
    reportarErrorGuardado('tareas_mantenimiento', err, 'Error deleting tarea mantenimiento:');
  }
}

export function subscribeGarantiasReparacion(
  callback: (items: GarantiaReparacion[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<GarantiaReparacion>(
    GARANTIAS_REPARACION_COL,
    callback,
    scope,
    'garantias_reparacion'
  );
}

export async function saveGarantiaReparacionFirestoreWithResult(
  item: GarantiaReparacion
): Promise<FirestoreWriteResult> {
  try {
    await setDoc(doc(db, 'garantias_reparacion', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
    return { ok: true };
  } catch (error) {
    reportarErrorGuardado('garantias_reparacion', error, `Error saving garantia reparacion '${item.id}':`);
    return { ok: false, error };
  }
}

/** API histórica best-effort; conserva Promise<void> para sus consumidores existentes. */
export async function saveGarantiaReparacionFirestore(item: GarantiaReparacion): Promise<void> {
  await saveGarantiaReparacionFirestoreWithResult(item);
}

export async function deleteGarantiaReparacionFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'garantias_reparacion', id));
  } catch (err) {
    reportarErrorGuardado('garantias_reparacion', err, 'Error deleting garantia reparacion:');
  }
}

// =========================================================================
// REFORMAS: NECESIDADES Y PROYECTOS DE REFORMA
// =========================================================================

export function subscribeNecesidadesReforma(
  callback: (items: NecesidadReforma[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<NecesidadReforma>(
    NECESIDADES_REFORMA_COL,
    callback,
    scope,
    'necesidades_reforma'
  );
}

export async function saveNecesidadReformaFirestore(item: NecesidadReforma) {
  try {
    await setDoc(doc(db, 'necesidades_reforma', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    reportarErrorGuardado('necesidades_reforma', err, 'Error saving necesidad de reforma:');
    throw err;
  }
}

export async function deleteNecesidadReformaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'necesidades_reforma', id));
  } catch (err) {
    reportarErrorGuardado('necesidades_reforma', err, 'Error deleting necesidad de reforma:');
    throw err;
  }
}

export function subscribeProyectosReforma(
  callback: (items: ProyectoReforma[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<ProyectoReforma>(
    PROYECTOS_REFORMA_COL,
    callback,
    scope,
    'proyectos_reforma'
  );
}

export async function saveProyectoReformaFirestore(item: ProyectoReforma) {
  try {
    await setDoc(doc(db, 'proyectos_reforma', item.id), sanitizeObjectForFirestore(item), {
      merge: true,
    });
  } catch (err) {
    reportarErrorGuardado('proyectos_reforma', err, 'Error saving proyecto de reforma:');
    throw err;
  }
}

export async function deleteProyectoReformaFirestore(id: string) {
  try {
    await deleteDoc(doc(db, 'proyectos_reforma', id));
  } catch (err) {
    reportarErrorGuardado('proyectos_reforma', err, 'Error deleting proyecto de reforma:');
    throw err;
  }
}

export async function uploadReformaAdjuntoStorage(
  proyectoId: string,
  file: File | Blob,
  fileName: string,
  propietarioId?: string
): Promise<{ url: string; storagePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `reformas_documentos/${ownerSeg}/${proyectoId}/${Date.now()}_${safeName}`;
  const mime =
    (file as File).type ||
    (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

  try {
    const fileRef = ref(storage, storagePath);
    const uploadWork = (async () => {
      await uploadBytes(fileRef, file, { contentType: mime });
      return await getDownloadURL(fileRef);
    })();
    const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const url = await Promise.race([uploadWork, timeoutGuard]);
    if (url && typeof url === 'string') {
      return { url, storagePath };
    }
  } catch (err) {
    console.warn('Storage upload error / timeout, using fallback data URL:', err);
  }

  // Fallback seguro a data URL local
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ url: reader.result as string, storagePath });
    reader.onerror = () => resolve({ url: '', storagePath });
    reader.readAsDataURL(file);
  });
}

// ============================================================
// FASE 2.2 — FACTURAS / JUSTIFICANTES DE GASTOS en Storage
// Ruta: gastos_facturas/{propietarioId}/{gastoId}/{archivo}
// ============================================================

export async function uploadFacturaGasto(
  gastoId: string,
  file: File | Blob,
  fileName: string,
  propietarioId?: string
): Promise<{ url: string; storagePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `gastos_facturas/${ownerSeg}/${gastoId}/${Date.now()}_${safeName}`;
  const mime =
    (file as File).type ||
    (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

  try {
    const fileRef = ref(storage, storagePath);
    const uploadWork = (async () => {
      await uploadBytes(fileRef, file, { contentType: mime });
      return await getDownloadURL(fileRef);
    })();
    const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const url = await Promise.race([uploadWork, timeoutGuard]);
    if (url && typeof url === 'string') {
      return { url, storagePath };
    }
    console.warn('Timeout subiendo la factura del gasto a Firebase Storage.');
  } catch (err) {
    console.warn('Firebase Storage no disponible para la factura del gasto:', err);
  }

  // Respaldo por el endpoint del servidor (igual que los justificantes de cobro).
  try {
    const dataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
    const res = await fetch('/api/upload-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: dataURL, filename: fileName, mimeType: mime, itemId: gastoId }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.url) {
        return { url: json.url as string, storagePath: (json.storagePath as string) || storagePath };
      }
    }
  } catch (serverErr) {
    console.warn('Falló también la subida de la factura por servidor:', serverErr);
  }

  throw new Error('No se ha podido almacenar la factura. Revisa la conexión e inténtalo de nuevo.');
}

export async function deleteFacturaGastoStorage(storagePath?: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('local_') || storagePath.startsWith('server_')) {
    return;
  }
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    console.warn('No se pudo eliminar la factura de Storage:', err);
  }
}

/**
 * Real-time listener for Configuracion de Aseguradoras (Fase 4)
 */
export function subscribeAseguradoras(callback: (aseguradoras: ConfiguracionAseguradora[]) => void) {
  return onSnapshot(
    ASEGURADORAS_COL,
    (snapshot) => {
      const items: ConfiguracionAseguradora[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as ConfiguracionAseguradora);
      });
      if (items.length === 0) {
        callback(INITIAL_ASEGURADORAS);
      } else {
        // Ensure SEAG is present in the list
        const hasSeag = items.some(
          (i) => i.id === 'seag' || i.nombre.toLowerCase().includes('seag')
        );
        if (!hasSeag) {
          const seagDefault = INITIAL_ASEGURADORAS.find((a) => a.id === 'seag');
          if (seagDefault) {
            const merged = [seagDefault, ...items];
            callback(merged);
            // Proactively save SEAG to Firestore
            saveAseguradoraFirestore(seagDefault);
            return;
          }
        }
        callback(items);
      }
    },
    (err) => {
      reportarErrorLectura('aseguradoras', err, 'Firestore configuracion_aseguradoras snapshot error:');
      callback(INITIAL_ASEGURADORAS);
    }
  );
}

/**
 * Save / Update Aseguradora in Firestore
 */
export async function saveAseguradoraFirestore(aseguradora: ConfiguracionAseguradora) {
  try {
    const cleanAseg = sanitizeObjectForFirestore(aseguradora);
    await setDoc(doc(db, 'configuracion_aseguradoras', aseguradora.id), cleanAseg, { merge: true });
  } catch (err) {
    reportarErrorGuardado('aseguradoras', err, 'Error saving aseguradora to Firestore:');
  }
}

/**
 * Delete Aseguradora from Firestore
 */
export async function deleteAseguradoraFirestore(aseguradoraId: string) {
  try {
    await deleteDoc(doc(db, 'configuracion_aseguradoras', aseguradoraId));
  } catch (err) {
    reportarErrorGuardado('aseguradoras', err, 'Error deleting aseguradora from Firestore:');
  }
}

/**
 * Real-time listener for Solicitudes de Seguro de Impago (Fase 4 & 5)
 */
export function subscribeSolicitudesSeguro(callback: (solicitudes: SolicitudSeguroImpago[]) => void) {
  return onSnapshot(
    SOLICITUDES_SEGURO_COL,
    (snapshot) => {
      const items: SolicitudSeguroImpago[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as SolicitudSeguroImpago);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('solicitudes_seguro', err, 'Firestore solicitudes_seguro_impago snapshot error:');
    }
  );
}

/**
 * Save / Update Solicitud de Seguro de Impago in Firestore
 */
export async function saveSolicitudSeguroFirestore(solicitud: SolicitudSeguroImpago) {
  try {
    const cleanSol = sanitizeObjectForFirestore(solicitud);
    await setDoc(doc(db, 'solicitudes_seguro_impago', solicitud.id), cleanSol, { merge: true });
  } catch (err) {
    reportarErrorGuardado('solicitudes_seguro', err, 'Error saving solicitud seguro impago to Firestore:');
  }
}

/**
 * Delete Solicitud de Seguro de Impago from Firestore
 */
export async function deleteSolicitudSeguroFirestore(solicitudId: string) {
  try {
    await deleteDoc(doc(db, 'solicitudes_seguro_impago', solicitudId));
  } catch (err) {
    reportarErrorGuardado('solicitudes_seguro', err, 'Error deleting solicitud seguro impago from Firestore:');
  }
}

/**
 * Real-time listener for Gmail Integration Config (Fase 5)
 */
export function subscribeGmailConfig(callback: (config: GmailIntegracionConfig) => void) {
  const configDocRef = doc(db, 'system', 'gmail_config');
  return onSnapshot(
    configDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data() as GmailIntegracionConfig);
      } else {
        callback(INITIAL_GMAIL_CONFIG);
      }
    },
    (err) => {
      reportarErrorLectura('gmail_config', err, 'Firestore gmail_config snapshot error:');
    }
  );
}

/**
 * Save / Update Gmail Integration Config in Firestore
 */
export async function saveGmailConfigFirestore(config: GmailIntegracionConfig) {
  try {
    const cleanConfig = sanitizeObjectForFirestore(config);
    await setDoc(doc(db, 'system', 'gmail_config'), cleanConfig, { merge: true });
  } catch (err) {
    reportarErrorGuardado('gmail_config', err, 'Error saving gmail config to Firestore:');
  }
}

/**
 * Uploads a candidate-provided document file to server document store / Firebase Storage with resilient fallback.
 * Automatically optimizes and compresses image uploads for rapid saving and small payload footprint.
 */
export async function uploadDocumentoAportadoFile(
  solicitudDocId: string,
  itemId: string,
  fileOrBlob: File | Blob,
  fileName: string
): Promise<{ downloadURL: string; storagePath: string; base64Data?: string }> {
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  let targetBlob = fileOrBlob;
  let compressedDataUrl = '';

  if (fileOrBlob instanceof File && fileOrBlob.type.startsWith('image/')) {
    try {
      const comp = await compressImageForUpload(fileOrBlob, 1400, 1400, 0.72);
      targetBlob = comp.blob;
      compressedDataUrl = comp.dataUrl;
    } catch (e) {
      console.warn('Image compression fallback:', e);
    }
  }

  const getDataUrlFallback = async (): Promise<string> => {
    if (compressedDataUrl) return compressedDataUrl;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(targetBlob);
    });
  };

  try {
    const dataURL = await getDataUrlFallback();

    // 1. Try uploading to server document store first (instant, works for large multi-page PDFs)
    try {
      const serverUploadRes = await fetch('/api/upload-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64: dataURL,
          filename: fileName,
          mimeType: targetBlob.type || 'application/pdf',
          solicitudId: solicitudDocId,
          itemId,
        }),
      });

      if (serverUploadRes.ok) {
        const json = await serverUploadRes.json();
        if (json.url) {
          return {
            downloadURL: json.url,
            storagePath: json.storagePath || `server_${json.fileId}`,
            base64Data: dataURL,
          };
        }
      }
    } catch (serverErr) {
      console.warn('Server upload error, attempting Firebase Storage fallback:', serverErr);
    }

    // 2. Fallback to Firebase Storage if available
    const storagePath = `documentos_solicitados/${solicitudDocId}/${itemId}_${Date.now()}_${sanitizedName}`;
    const uploadWork = (async () => {
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, targetBlob, {
        contentType: targetBlob.type || 'application/pdf',
      });
      return await getDownloadURL(fileRef);
    })();

    // 2.5-second timeout guard for Cloud Storage
    const timeoutGuard = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 2500);
    });

    const resultURL = await Promise.race([uploadWork, timeoutGuard]);

    if (resultURL && typeof resultURL === 'string') {
      return { downloadURL: resultURL, base64Data: dataURL, storagePath };
    } else {
      return { downloadURL: dataURL, base64Data: dataURL, storagePath: `local_${itemId}` };
    }
  } catch (err) {
    console.warn('Document upload error fallback:', err);
    const dataURL = await getDataUrlFallback();
    return { downloadURL: dataURL, base64Data: dataURL, storagePath: `local_${itemId}` };
  }
}

/**
 * Delete Solicitud from Firestore
 */
export async function deleteSolicitudFirestore(solicitudId: string) {
  try {
    await deleteDoc(doc(db, 'solicitudes', solicitudId));
  } catch (err) {
    reportarErrorGuardado('solicitudes', err, 'Error deleting solicitud from Firestore:');
  }
}

/**
 * Uploads an image blob to Firebase Storage.
 * Uses a fast 2-second timeout guard. If Firebase Storage is unavailable or slow,
 * it immediately returns a lightweight compressed Data URL so image uploading NEVER blocks or fails.
 */
export async function uploadInmuebleImageToStorage(
  inmuebleId: string,
  imageId: string,
  blob: Blob,
  fileName: string
): Promise<{ downloadURL: string; storagePath: string }> {
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `inmuebles/${inmuebleId}/${imageId}_${sanitizedName}`;

  // Helper to quickly convert blob to data URL as fallback
  const getDataUrlFallback = async (): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  };

  try {
    const uploadWork = (async () => {
      const imageRef = ref(storage, storagePath);
      await uploadBytes(imageRef, blob, {
        contentType: blob.type || 'image/jpeg',
      });
      return await getDownloadURL(imageRef);
    })();

    // 2-second timeout guard for Cloud Storage
    const timeoutGuard = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 2000);
    });

    const resultURL = await Promise.race([uploadWork, timeoutGuard]);

    if (resultURL && typeof resultURL === 'string') {
      return { downloadURL: resultURL, storagePath };
    } else {
      console.warn('Firebase Storage upload timed out, using compressed Data URL fallback.');
      const dataURL = await getDataUrlFallback();
      return { downloadURL: dataURL || URL.createObjectURL(blob), storagePath: `local_${imageId}` };
    }
  } catch (err) {
    console.warn('Firebase Storage upload failed, using compressed Data URL fallback:', err);
    const dataURL = await getDataUrlFallback();
    return { downloadURL: dataURL || URL.createObjectURL(blob), storagePath: `local_${imageId}` };
  }
}

// ============================================================
// FASE 3.2 — FOTOGRAFÍAS DE INSPECCIÓN (recomercialización)
// Ruta privada por propietario y expediente:
//   recomercializacion_fotos/{propietarioId}/{expedienteId}/{archivo}
// A diferencia de las imágenes de catálogo, estas fotos son documentos de
// trabajo internos (estado/deterioro) y NO se leen públicamente. Tampoco se
// usa fallback base64: un expediente acumula muchas fotos y un data URL
// inflaría el documento de Firestore por encima de su límite de 1 MB. Si
// Storage falla, se lanza el error y la UI ofrece reintentar.
// ============================================================

export async function uploadFotoInspeccionStorage(
  propietarioId: string,
  expedienteId: string,
  estancia: string,
  blob: Blob,
  fileName: string
): Promise<{ url: string; storagePath: string }> {
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const expSeg = (expedienteId || 'exp').replace(/[^a-zA-Z0-9._-]/g, '_');
  const estSeg = (estancia || 'otro').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeName = (fileName || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const rand = Math.random().toString(36).substring(2, 6);
  const storagePath = `recomercializacion_fotos/${ownerSeg}/${expSeg}/${estSeg}_${Date.now()}_${rand}_${safeName}`;

  const fileRef = ref(storage, storagePath);
  const uploadWork = (async () => {
    await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(fileRef);
  })();

  // 20 s: las inspecciones pueden incluir varias fotos con conexión lenta.
  const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
  const url = await Promise.race([uploadWork, timeoutGuard]);
  if (!url || typeof url !== 'string') {
    throw new Error('La subida de la fotografía ha tardado demasiado. Revisa la conexión e inténtalo de nuevo.');
  }
  return { url, storagePath };
}

export async function deleteFotoInspeccionStorage(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  // Nunca borrar referencias locales/efímeras ni URLs http directas.
  if (
    storagePath.startsWith('local_') ||
    storagePath.startsWith('server_') ||
    storagePath.startsWith('data:') ||
    storagePath.startsWith('http')
  ) {
    return;
  }
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    // El objeto puede ya no existir; no debe bloquear la baja del metadato.
    console.warn('No se pudo eliminar la foto de inspección de Storage:', err);
  }
}

// ============================================================
// BLOQUE 4 — FOTOGRAFÍAS DE INCIDENCIAS
// Ruta privada: incidencias_fotos/{propietarioId}/{incidenciaId}/{archivo}
// Documentos internos de trabajo (desperfectos), nunca públicos.
// ============================================================
export async function uploadFotoIncidenciaStorage(
  propietarioId: string,
  incidenciaId: string,
  blob: Blob,
  fileName: string
): Promise<{ url: string; storagePath: string }> {
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const incSeg = (incidenciaId || 'inc').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeName = (fileName || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const rand = Math.random().toString(36).substring(2, 6);
  const storagePath = `incidencias_fotos/${ownerSeg}/${incSeg}/${Date.now()}_${rand}_${safeName}`;

  const fileRef = ref(storage, storagePath);
  const uploadWork = (async () => {
    await uploadBytes(fileRef, blob, { contentType: blob.type || 'image/jpeg' });
    return getDownloadURL(fileRef);
  })();
  const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
  const url = await Promise.race([uploadWork, timeoutGuard]);
  if (!url || typeof url !== 'string') {
    throw new Error('La subida de la fotografía ha tardado demasiado. Revisa la conexión e inténtalo de nuevo.');
  }
  return { url, storagePath };
}

export async function deleteFotoIncidenciaStorage(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  if (
    storagePath.startsWith('local_') ||
    storagePath.startsWith('server_') ||
    storagePath.startsWith('data:') ||
    storagePath.startsWith('http')
  ) {
    return;
  }
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    console.warn('No se pudo eliminar la foto de incidencia de Storage:', err);
  }
}

/**
 * Sube el justificante mensual de un cobro (transferencia / ingreso) a Firebase Storage.
 * Regla arquitectónica: Firestore guarda SOLO metadatos y la URL; el PDF/imagen va a Storage.
 * Nunca se codifica el documento en base64 dentro del documento económico.
 *
 * Estrategia resilente:
 *  1) Firebase Storage (almacenamiento duradero).
 *  2) Si Storage falla o tarda demasiado, se intenta mediante el endpoint del servidor.
 *  3) Si ambos fallan, se lanza un error para no guardar una referencia efímera/rota.
 */
export async function uploadJustificanteCobro(
  cobroPeriodoId: string,
  file: File | Blob,
  fileName: string,
  propietarioId?: string,
  contratoId?: string
): Promise<{ url: string; storagePath: string }> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  // FASE 1.4: se segmenta por propietario para que Storage Rules pueda aislar
  // los justificantes (datos económicos). Si no hay propietarioId se usa la
  // carpeta genérica "sin_asignar".
  const ownerSeg = (propietarioId || 'sin_asignar').replace(/[^a-zA-Z0-9._-]/g, '_');
  const contractSeg = contratoId?.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = contractSeg
    ? `recibos/${contractSeg}/${cobroPeriodoId}/${Date.now()}_${safeName}`
    : `cobros_justificantes/${ownerSeg}/${cobroPeriodoId}/${Date.now()}_${safeName}`;
  const mime =
    (file as File).type ||
    (safeName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

  // 1) Firebase Storage
  try {
    const fileRef = ref(storage, storagePath);
    const uploadWork = (async () => {
      await uploadBytes(fileRef, file, { contentType: mime });
      return await getDownloadURL(fileRef);
    })();

    const timeoutGuard = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const url = await Promise.race([uploadWork, timeoutGuard]);

    if (url && typeof url === 'string') {
      return { url, storagePath };
    }
    console.warn('Timeout subiendo justificante a Firebase Storage; se intenta por servidor.');
  } catch (err) {
    console.warn('Firebase Storage no disponible para el justificante; se intenta por servidor:', err);
  }

  // 2) Respaldo mediante el endpoint del servidor (almacén de proceso)
  try {
    const dataURL = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });

    const res = await fetch('/api/upload-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64: dataURL,
        filename: fileName,
        mimeType: mime,
        itemId: cobroPeriodoId,
      }),
    });

    if (res.ok) {
      const json = await res.json();
      if (json.url) {
        return { url: json.url as string, storagePath: (json.storagePath as string) || storagePath };
      }
    }
  } catch (serverErr) {
    console.warn('Fallo también la subida del justificante por servidor:', serverErr);
  }

  throw new Error(
    'No se ha podido almacenar el justificante. Revisa la conexión o Firebase Storage e inténtalo de nuevo.'
  );
}

/**
 * Elimina un justificante de Firebase Storage. Las referencias del almacén temporal
 * del servidor (server_*) no se eliminan de Storage.
 */
export async function deleteJustificanteCobro(storagePath?: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('local_') || storagePath.startsWith('server_')) {
    return;
  }
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    console.warn('No se pudo eliminar el justificante de Storage:', err);
  }
}

/**
 * Deletes an image file from Firebase Storage.
 */
export async function deleteInmuebleImageFromStorage(storagePath: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('local_') || storagePath.startsWith('http')) {
    return;
  }
  try {
    const imageRef = ref(storage, storagePath);
    await deleteObject(imageRef);
  } catch (err) {
    console.warn('Error deleting image from Firebase Storage:', err);
  }
}

// =========================================================================
// GESTIÓN DE USUARIOS (RBAC)
// =========================================================================

export function subscribeUsuarios(callback: (usuarios: UsuarioApp[]) => void) {
  return onSnapshot(
    USUARIOS_COL,
    (snapshot) => {
      const items: UsuarioApp[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as UsuarioApp);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('usuarios', err, 'Firestore usuarios snapshot error:');
    }
  );
}

export async function saveUsuarioFirestore(usuario: UsuarioApp & { passwordHash?: string; authMethod?: 'direct_firestore' | 'firebase_auth' }, accion = 'GUARDAR_USUARIO'): Promise<void> {
  const userRef = doc(db, 'usuarios', usuario.id);
  const clean = sanitizeObjectForFirestore({
    ...usuario,
    updatedAt: new Date().toISOString(),
  });
  if (auth.currentUser?.email?.toLowerCase() === 'sarqsan2@gmail.com') {
    const { guardarAccesosAuditados } = await import('./auditoriaAccesoFirebase');
    await guardarAccesosAuditados([
      {coleccion:'usuarios',id:usuario.id,datos:clean},
      ...(usuario.authUid ? [{coleccion:'usuarios_auth' as const,id:usuario.authUid,datos:{
        uid:usuario.authUid,usuarioId:usuario.id,email:usuario.email,tipoPerfil:usuario.tipoPerfil,
        estado:usuario.estado,roles:usuario.roles,propietarioId:usuario.propietarioId || '',
        profesionalId:usuario.profesionalId || '',inmuebleIds:usuario.inmuebleIds || [],
        updatedAt:new Date().toISOString(),
      }}] : []),
    ],accion);
  } else {
    await setDoc(userRef, clean, { merge: true });
  }
}

export async function deleteUsuarioFirestore(_usuarioId: string): Promise<void> {
  throw new Error('La cuenta no se purga: use baja auditada y revocación del espejo.');
}

// =========================================================================
// GESTIÓN DE PROFESIONALES Y MANTENIMIENTO
// =========================================================================

export function subscribeProfesionales(callback: (profesionales: Profesional[]) => void) {
  return onSnapshot(
    PROFESIONALES_COL,
    (snapshot) => {
      const items: Profesional[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Profesional);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('profesionales', err, 'Firestore profesionales snapshot error:');
    }
  );
}

export async function saveProfesionalFirestore(profesional: Profesional): Promise<void> {
  const profRef = doc(db, 'profesionales', profesional.id);
  const clean = sanitizeObjectForFirestore({
    ...profesional,
    updatedAt: new Date().toISOString(),
  });
  await setDoc(profRef, clean, { merge: true });
}

export async function deleteProfesionalFirestore(profesionalId: string): Promise<void> {
  const profRef = doc(db, 'profesionales', profesionalId);
  await deleteDoc(profRef);
}

// =========================================================================
// ENLACES DE REGISTRO E INVITACIONES
// =========================================================================

export function subscribeEnlacesRegistro(callback: (enlaces: EnlaceRegistro[]) => void, scope?: UsuarioApp | null) {
  // Contexto autenticado/autorizado EXPLÍCITO antes de tocar Firestore: sin
  // usuario (p. ej. el primer render de App con `currentUser === null`) NO se
  // ejecuta ninguna query (ni permission-denied, ni aviso). El guard cubre
  // también a los call sites que aún no han resuelto la sesión.
  if (!scope || !['ADMINISTRADOR', 'SUPERADMIN'].includes(String(scope.tipoPerfil))) {
    // Private R02 invites are resolved by document ID only in the authenticated invitation view.
    callback([]);
    return () => {};
  }
  return onSnapshot(
    ENLACES_REGISTRO_COL,
    (snapshot) => {
      const items: EnlaceRegistro[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as EnlaceRegistro);
      });
      callback(items);
    },
    (err) => {
      reportarErrorLectura('enlaces_registro', err, 'Firestore enlaces_registro snapshot error:');
    }
  );
}

export async function saveEnlaceRegistroFirestore(enlace: EnlaceRegistro): Promise<void> {
  const clean = sanitizeObjectForFirestore(enlace);
  const { guardarAccesoAuditado } = await import('./auditoriaAccesoFirebase');
  await guardarAccesoAuditado('enlaces_registro', enlace.id, clean, 'GUARDAR_ENLACE_REGISTRO');
}

export async function deleteEnlaceRegistroFirestore(_enlaceId: string): Promise<void> {
  throw new Error('El enlace se conserva para auditoría: revóquelo de forma auditada.');
}

// =========================================================================
// CATÁLOGO DE ESPECIALIDADES
// =========================================================================

export function subscribeEspecialidades(callback: (especialidades: Especialidad[]) => void) {
  return onSnapshot(
    ESPECIALIDADES_COL,
    (snapshot) => {
      const items: Especialidad[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Especialidad);
      });
      items.sort((a, b) => (a.orden || 99) - (b.orden || 99));
      callback(items);
    },
    (err) => {
      reportarErrorLectura('especialidades', err, 'Firestore especialidades snapshot error:');
    }
  );
}

export async function saveEspecialidadFirestore(especialidad: Especialidad): Promise<void> {
  const espRef = doc(db, 'especialidades', especialidad.id);
  const clean = sanitizeObjectForFirestore(especialidad);
  await setDoc(espRef, clean, { merge: true });
}

export async function deleteEspecialidadFirestore(especialidadId: string): Promise<void> {
  const espRef = doc(db, 'especialidades', especialidadId);
  await deleteDoc(espRef);
}

// =========================================================================
// REGISTRO DE AUDITORÍA (INMUTABLE)
// =========================================================================

export function subscribeAuditLogs(callback: (logs: AuditLog[]) => void) {
  return onSnapshot(
    AUDIT_LOGS_COL,
    (snapshot) => {
      const items: AuditLog[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
      });
      // Sort descending by date
      items.sort((a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime());
      callback(items);
    },
    (err) => {
      reportarErrorLectura('audit_logs', err, 'Firestore audit_logs snapshot error:');
    }
  );
}

/**
 * Logger de auditoría BEST-EFFORT independiente (fuera de transacción).
 * COEXISTENCIA (FASE 9, decisión NO consolidar): el módulo de operaciones usa
 * OTRA `registrarAuditoriaFirestore` (`src/lib/auditoria.ts`), síncrona y
 * transaccional, que escribe dentro de la misma transacción que la entidad.
 * No son intercambiables: esta NO debe usarse donde la auditoría deba
 * revertirse junto a los datos, y la transaccional NO debe sustituirse por
 * esta (crearía auditorías fantasma ante abortos). Mismo libro mayor
 * (`audit_logs`), dos transportes según el consumidor.
 */
export async function registrarAuditoriaFirestore(
  log: Omit<AuditLog, 'id' | 'fechaHora'> & { id?: string; fechaHora?: string }
): Promise<void> {
  try {
    const id = log.id || `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fechaHora = log.fechaHora || new Date().toISOString();
    const logRef = doc(db, 'audit_logs', id);
    const clean = sanitizeObjectForFirestore({
      id,
      fechaHora,
      ...log,
    });
    await setDoc(logRef, clean);
  } catch (err) {
    console.warn('Error saving audit log:', err);
  }
}

export const saveAuditLogFirestore = registrarAuditoriaFirestore;

// =========================================================================
// CONFIGURACIÓN DE MÓDULOS DEL SISTEMA
// =========================================================================

export function subscribeModulosConfig(callback: (config: ModulosConfig) => void) {
  return onSnapshot(
    MODULOS_CONFIG_REF,
    (snapshot) => {
      if (snapshot.exists()) {
        callback({ ...DEFAULT_MODULOS_CONFIG, ...snapshot.data() } as ModulosConfig);
      } else {
        callback(DEFAULT_MODULOS_CONFIG);
      }
    },
    (err) => {
      reportarErrorLectura('modulos_config', err, 'Firestore modulos_config snapshot error:');
      callback(DEFAULT_MODULOS_CONFIG);
    }
  );
}

export async function saveModulosConfigFirestore(config: ModulosConfig): Promise<void> {
  const clean = sanitizeObjectForFirestore(config);
  await setDoc(MODULOS_CONFIG_REF, clean, { merge: true });
}

// =========================================================================
// BOOTSTRAP DE USUARIOS, ROLES, ENLACES Y ESPECIALIDADES
// =========================================================================

export const DEFAULT_ESPECIALIDADES_INITIAL: Especialidad[] = [
  { id: 'esp_manitas', nombre: 'Manitas / Reparaciones Menores', icono: 'Wrench', activa: true, orden: 1 },
  { id: 'esp_fontaneria', nombre: 'Fontanería', icono: 'Droplet', activa: true, orden: 2 },
  { id: 'esp_electricidad', nombre: 'Electricidad e Iluminación', icono: 'Zap', activa: true, orden: 3 },
  { id: 'esp_albanileria', nombre: 'Albañilería y Reformas', icono: 'Hammer', activa: true, orden: 4 },
  { id: 'esp_pintura', nombre: 'Pintura y Empapelado', icono: 'Paintbrush', activa: true, orden: 5 },
  { id: 'esp_cerrajeria', nombre: 'Cerrajería 24h', icono: 'Key', activa: true, orden: 6 },
  { id: 'esp_climatizacion', nombre: 'Aire Acondicionado y Climatización', icono: 'Wind', activa: true, orden: 7 },
  { id: 'esp_calefaccion', nombre: 'Calefacción y Calderas', icono: 'Flame', activa: true, orden: 8 },
  { id: 'esp_electrodomesticos', nombre: 'Reparación de Electrodomésticos', icono: 'Tv', activa: true, orden: 9 },
  { id: 'esp_limpieza', nombre: 'Limpieza y Desinfección', icono: 'Sparkles', activa: true, orden: 10 },
  { id: 'esp_cristaleria', nombre: 'Cristalería y Ventanas', icono: 'Layers', activa: true, orden: 11 },
  { id: 'esp_carpinteria', nombre: 'Carpintería de Madera y Metal', icono: 'Scissors', activa: true, orden: 12 },
  { id: 'esp_persianas', nombre: 'Persianas y Toldos', icono: 'Sun', activa: true, orden: 13 },
  { id: 'esp_jardineria', nombre: 'Jardinería y Piscinas', icono: 'Flower', activa: true, orden: 14 },
  { id: 'esp_otros', nombre: 'Otros Servicios Técnicos', icono: 'Settings', activa: true, orden: 15 },
];

export async function seedAuthAndRolesIfEmpty() {
  try {
    // 1. Seed admin user if not exists
    const usersSnap = await getDocs(USUARIOS_COL);
    if (usersSnap.empty) {
      // Admin principal
      const adminUser: UsuarioApp = {
        id: 'user_admin_principal',
        nombre: 'Administrador Principal',
        apellidos: 'RentSelect',
        email: 'sarqsan2@gmail.com',
        telefono: '+34 600 111 222',
        tipoPerfil: 'ADMINISTRADOR',
        estado: 'ACTIVO',
        roles: ['SUPERADMIN'],
        permisos: PERMISOS_SISTEMA.map((p) => p.codigo),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      await saveUsuarioFirestore(adminUser);

      // Propietario demo
      const propUser: UsuarioApp = {
        id: 'user_propietario_demo',
        nombre: 'Propietario Demo',
        apellidos: 'García Rentas',
        email: 'propietario@email.com',
        telefono: '+34 611 223 344',
        tipoPerfil: 'PROPIETARIO',
        estado: 'ACTIVO',
        roles: ['PROPIETARIO_ESTANDAR'],
        permisos: [
          'inmuebles.ver',
          'inmuebles.editar',
          'contratos.ver',
          'profesionales.ver',
          'profesionales.crear',
          'profesionales.asignar',
        ],
        propietarioId: 'prop_demo_1',
        inmuebleIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveUsuarioFirestore(propUser);

      // Profesional demo
      const profUser: UsuarioApp = {
        id: 'user_profesional_demo',
        nombre: 'Juan García',
        apellidos: 'Técnico Instalador',
        email: 'contacto@fontaneriagarcia.es',
        telefono: '+34 622 334 455',
        tipoPerfil: 'PROFESIONAL',
        estado: 'ACTIVO',
        roles: ['PROFESIONAL_MANTENIMIENTO'],
        permisos: ['profesionales.ver'],
        profesionalId: 'prof_demo_1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveUsuarioFirestore(profUser);

    }

    // 2. Seed default especialidades if empty
    const espSnap = await getDocs(ESPECIALIDADES_COL);
    if (espSnap.empty) {
      const eBatch = writeBatch(db);
      DEFAULT_ESPECIALIDADES_INITIAL.forEach((esp) => {
        eBatch.set(doc(db, 'especialidades', esp.id), sanitizeObjectForFirestore(esp));
      });
      await eBatch.commit();
    }

    // 3. Seed demo profesional if empty
    const profSnap = await getDocs(PROFESIONALES_COL);
    if (profSnap.empty) {
      const pBatch = writeBatch(db);
      const demoProf: Profesional = {
        id: 'prof_demo_1',
        usuarioId: 'user_profesional_demo',
        tipo: 'AUTONOMO',
        nombreComercial: 'Fontanería y Reparaciones García',
        razonSocial: 'Juan García Fontaneros S.L.U.',
        cifNif: 'B04998877',
        contactoNombre: 'Juan García',
        email: 'contacto@fontaneriagarcia.es',
        telefono: '+34 622 334 455',
        especialidades: ['Fontanería', 'Calefacción y Calderas', 'Manitas / Reparaciones Menores'],
        zonasServicio: [
          { id: 'zona_1', provincia: 'Almería', municipio: 'Vera', codigosPostales: ['04620', '04621'] },
          { id: 'zona_2', provincia: 'Almería', municipio: 'Roquetas de Mar', codigosPostales: ['04740'] },
          { id: 'zona_3', provincia: 'Alicante', municipio: 'Alicante', codigosPostales: ['03001'] },
        ],
        inmuebleIdsAsignados: [],
        activo: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      pBatch.set(doc(db, 'profesionales', demoProf.id), sanitizeObjectForFirestore(demoProf));
      await pBatch.commit();
    }

    // 4. Seed default enlaces de registro if empty
    const enlacesSnap = await getDocs(ENLACES_REGISTRO_COL);
    if (enlacesSnap.empty) {
      const enlaceProp: EnlaceRegistro = {
        id: 'enlace_prop_publico',
        token: 'registro_propietario_oficial',
        tipoPerfil: 'PROPIETARIO',
        textoVisible: '🏠 Regístrate como propietario',
        descripcion: 'Enlace oficial para alta de nuevos propietarios y arrendadores de viviendas',
        activo: true,
        usosActuales: 0,
        creadoPor: 'user_admin_principal',
        createdAt: new Date().toISOString(),
      };
      const enlaceProf: EnlaceRegistro = {
        id: 'enlace_prof_publico',
        token: 'registro_profesional_oficial',
        tipoPerfil: 'PROFESIONAL',
        textoVisible: '🔧 Regístrate como profesional o empresa de mantenimiento',
        descripcion: 'Enlace oficial para registro de autónomos, fontaneros, electricistas y empresas de reformas',
        activo: true,
        usosActuales: 0,
        creadoPor: 'user_admin_principal',
        createdAt: new Date().toISOString(),
      };
      await saveEnlaceRegistroFirestore(enlaceProp);
      await saveEnlaceRegistroFirestore(enlaceProf);
    }

    // 5. Seed initial audit log if empty
    const auditSnap = await getDocs(AUDIT_LOGS_COL);
    if (auditSnap.empty) {
      await registrarAuditoriaFirestore({
        usuarioId: 'user_admin_principal',
        usuarioEmail: 'sarqsan2@gmail.com',
        usuarioNombre: 'Administrador Principal',
        accion: 'SISTEMA_INICIALIZADO',
        descripcion: 'Capa estructural de autenticación, usuarios, perfiles, permisos y profesionales inicializada con éxito.',
        entidadAfectada: 'modulo',
        idAfectado: 'sistema',
        resultado: 'EXITO',
      });
    }
  } catch (err) {
    console.error('Error seeding auth and roles:', err);
  }
}

// =========================================================================
// PÓLIZAS DE SEGUROS Y SINIESTROS
// =========================================================================

export function subscribePolizas(
  callback: (items: PolizaSeguro[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // BLOQUE 12 · A-01: `polizas_seguros` concede `list` a titular y cartera
  // (`aisladoEsMio`/`inmuebleEnCarteraGestionada`): la consulta se acota.
  return subscribeColeccionPorAmbito<PolizaSeguro>(
    POLIZAS_SEGUROS_COL,
    (items) => {
      const ordenadas = [...items].sort(
        (a, b) => new Date(b.createdAt || b.fechaInicio).getTime() - new Date(a.createdAt || a.fechaInicio).getTime()
      );
      callback(ordenadas);
    },
    scope,
    'polizas',
    { campo: 'propietarioId', conCarteras: true }
  );
}

export const subscribePolizasSeguras = subscribePolizas;
export const subscribeGastosSeguros = subscribeGastos;

export async function savePolizaFirestore(poliza: PolizaSeguro): Promise<void> {
  try {
    const cleanPol = sanitizeObjectForFirestore({ ...poliza, updatedAt: new Date().toISOString() });
    await setDoc(doc(db, 'polizas_seguros', poliza.id), cleanPol, { merge: true });
  } catch (err) {
    reportarErrorGuardado('polizas', err, 'Error saving poliza to Firestore:');
    throw err;
  }
}

export async function deletePolizaFirestore(polizaId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'polizas_seguros', polizaId));
  } catch (err) {
    reportarErrorGuardado('polizas', err, 'Error deleting poliza from Firestore:');
    throw err;
  }
}

/**
 * BLOQUE 1 — guarda la póliza (y opcionalmente su sucesora en
 * renovaciones/sustituciones) y registra la operación sensible en
 * `audit_logs`. REUTILIZA la auditoría existente: no crea un sistema
 * paralelo. Si la escritura falla, no se audita éxito.
 */
export async function guardarPolizaConAuditoria(
  poliza: PolizaSeguro,
  contexto: {
    accion: string; // p. ej. SEGUROS_ALTA_POLIZA | SEGUROS_MODIFICACION | SEGUROS_RENOVACION | SEGUROS_CAMBIO_COMPANIA | SEGUROS_DOCUMENTO_ADJUNTADO | SEGUROS_CANCELACION
    descripcion: string;
    actor: { id?: string; email?: string; nombre: string };
    detalles?: Record<string, unknown>;
    polizaNueva?: PolizaSeguro;
  }
): Promise<void> {
  await savePolizaFirestore(poliza);
  if (contexto.polizaNueva) {
    await savePolizaFirestore(contexto.polizaNueva);
  }
  await registrarAuditoriaFirestore({
    usuarioId: contexto.actor.id || 'desconocido',
    usuarioEmail: contexto.actor.email || '',
    usuarioNombre: contexto.actor.nombre,
    accion: contexto.accion,
    descripcion: contexto.descripcion,
    entidadAfectada: 'poliza_seguro',
    idAfectado: poliza.id,
    resultado: 'EXITO',
    detalles: {
      ...(contexto.detalles || {}),
      polizaId: poliza.id,
      polizaNuevaId: contexto.polizaNueva?.id,
      documentosTotales: (poliza.documentos?.length || 0),
    },
  });
}

export function subscribeSiniestros(
  callback: (items: Siniestro[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // BLOQUE 12 · A-01: `siniestros` concede `list` a titular y cartera.
  return subscribeColeccionPorAmbito<Siniestro>(
    SINIESTROS_COL,
    (items) => {
      const ordenados = [...items].sort(
        (a, b) => new Date(b.fechaComunicacion).getTime() - new Date(a.fechaComunicacion).getTime()
      );
      callback(ordenados);
    },
    scope,
    'siniestros',
    { campo: 'propietarioId', conCarteras: true }
  );
}

export async function saveSiniestroFirestore(siniestro: Siniestro): Promise<void> {
  try {
    const cleanSin = sanitizeObjectForFirestore({ ...siniestro, updatedAt: new Date().toISOString() });
    await setDoc(doc(db, 'siniestros', siniestro.id), cleanSin, { merge: true });
  } catch (err) {
    reportarErrorGuardado('siniestros', err, 'Error saving siniestro to Firestore:');
    throw err;
  }
}

export async function deleteSiniestroFirestore(siniestroId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'siniestros', siniestroId));
  } catch (err) {
    reportarErrorGuardado('siniestros', err, 'Error deleting siniestro from Firestore:');
    throw err;
  }
}

export async function uploadIncidenciaAdjuntoStorage(
  incidenciaId: string,
  file: File | Blob,
  nombreArchivo: string,
  tipo?: 'imagen' | 'video' | 'documento'
): Promise<string> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `incidencias/${incidenciaId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);

  try {
    const mimeType = file.type || (tipo === 'imagen' ? 'image/jpeg' : 'application/pdf');
    await uploadBytes(fileRef, file, { contentType: mimeType });
    return await getDownloadURL(fileRef);
  } catch (err) {
    console.warn('Firebase Storage upload failed for incidencia adjunto, fallback to data url:', err);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
}

// =========================================================================
// TRABAJOS PROFESIONALES, PRESUPUESTOS Y VALORACIONES
// =========================================================================

export function subscribeTrabajosProfesionales(
  callback: (items: TrabajoProfesional[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // BLOQUE 12 · A-01: `trabajos_profesionales` concede `list` al titular (propietarioId)
  // y al profesional vinculado (profesionalId) cuando procede.
  const campo = scope?.tipoPerfil === 'PROFESIONAL' ? ('profesionalId' as const) : ('propietarioId' as const);
  return subscribeColeccionPorAmbito<TrabajoProfesional>(
    TRABAJOS_PROFESIONALES_COL,
    (items) => {
      const ordenados = [...items].sort(
        (a, b) => new Date(b.createdAt || b.fechaSolicitud).getTime() - new Date(a.createdAt || a.fechaSolicitud).getTime()
      );
      callback(ordenados);
    },
    scope,
    'trabajos_profesionales',
    { campo }
  );
}

export async function saveTrabajoProfesionalFirestore(trabajo: TrabajoProfesional): Promise<void> {
  try {
    const cleanTrabajo = sanitizeObjectForFirestore({
      ...trabajo,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'trabajos_profesionales', trabajo.id), cleanTrabajo, { merge: true });
  } catch (err) {
    reportarErrorGuardado('trabajos_profesionales', err, 'Error saving trabajo profesional to Firestore:');
    throw err;
  }
}

export async function deleteTrabajoProfesionalFirestore(trabajoId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'trabajos_profesionales', trabajoId));
  } catch (err) {
    reportarErrorGuardado('trabajos_profesionales', err, 'Error deleting trabajo profesional from Firestore:');
    throw err;
  }
}

export function subscribePresupuestosProfesionales(
  callback: (items: PresupuestoProfesional[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  // BLOQUE 12 · A-01: `presupuestos_profesionales` concede `list` al titular (propietarioId)
  // y al profesional vinculado (profesionalId) cuando procede.
  const campo = scope?.tipoPerfil === 'PROFESIONAL' ? ('profesionalId' as const) : ('propietarioId' as const);
  return subscribeColeccionPorAmbito<PresupuestoProfesional>(
    PRESUPUESTOS_PROFESIONALES_COL,
    (items) => {
      const ordenados = [...items].sort(
        (a, b) => new Date(b.createdAt || b.fecha).getTime() - new Date(a.createdAt || a.fecha).getTime()
      );
      callback(ordenados);
    },
    scope,
    'presupuestos_profesionales',
    { campo }
  );
}

export async function savePresupuestoProfesionalFirestore(presupuesto: PresupuestoProfesional): Promise<void> {
  try {
    const cleanPresupuesto = sanitizeObjectForFirestore({
      ...presupuesto,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'presupuestos_profesionales', presupuesto.id), cleanPresupuesto, { merge: true });
  } catch (err) {
    reportarErrorGuardado('presupuestos_profesionales', err, 'Error saving presupuesto profesional to Firestore:');
    throw err;
  }
}

export async function deletePresupuestoProfesionalFirestore(presupuestoId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'presupuestos_profesionales', presupuestoId));
  } catch (err) {
    reportarErrorGuardado('presupuestos_profesionales', err, 'Error deleting presupuesto profesional from Firestore:');
    throw err;
  }
}

/**
 * Valoraciones de trabajos profesionales, aisladas por propietario (patrón
 * `subscribeColeccionPropietario`): PROPIETARIO → where('propietarioId','==', pid)
 * (única consulta compatible con la regla `list`); PROFESIONAL → sin datos;
 * administrador/sin ámbito → colección completa. Sin orderBy: se ordena en cliente.
 */
export function subscribeValoracionesProfesionales(
  callback: (valoraciones: ValoracionProfesionalTrabajo[]) => void,
  scope?: DataAccessScope
): Unsubscribe {
  return subscribeColeccionPropietario<ValoracionProfesionalTrabajo & { id: string }>(
    VALORACIONES_PROFESIONALES_COL,
    (items) => {
      const ordenadas = [...items].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
      callback(ordenadas);
    },
    scope,
    'valoraciones_profesionales'
  );
}

export async function saveValoracionProfesionalFirestore(valoracion: ValoracionProfesionalTrabajo): Promise<void> {
  try {
    const valId = valoracion.id || `val_${valoracion.trabajoId}_${Date.now()}`;
    const cleanVal = sanitizeObjectForFirestore({ ...valoracion, id: valId });
    await setDoc(doc(db, 'valoraciones_profesionales', valId), cleanVal, { merge: true });

    if (valoracion.trabajoId) {
      await setDoc(
        doc(db, 'trabajos_profesionales', valoracion.trabajoId),
        { valoracion: cleanVal, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    }
  } catch (err) {
    reportarErrorGuardado('valoraciones_profesionales', err, 'Error saving valoracion profesional to Firestore:');
    throw err;
  }
}

export async function uploadProfesionalDocumentoStorage(
  profesionalId: string,
  file: File | Blob,
  nombreArchivo: string,
  _tipoDoc?: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `profesionales/${profesionalId}/documentos/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);

  try {
    const mimeType = file.type || 'application/pdf';
    await uploadBytes(fileRef, file, { contentType: mimeType });
    const downloadUrl = await getDownloadURL(fileRef);
    return { downloadUrl, storagePath };
  } catch (err) {
    console.warn('Firebase Storage upload failed for profesional document, using local fallback:', err);
    const downloadUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    return { downloadUrl, storagePath };
  }
}

export async function uploadPresupuestoDocumentoStorage(
  presupuestoId: string,
  file: File | Blob,
  nombreArchivo: string
): Promise<{ downloadUrl: string; storagePath: string }> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `presupuestos/${presupuestoId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);

  try {
    const mimeType = file.type || 'application/pdf';
    await uploadBytes(fileRef, file, { contentType: mimeType });
    const downloadUrl = await getDownloadURL(fileRef);
    return { downloadUrl, storagePath };
  } catch (err) {
    console.warn('Firebase Storage upload failed for presupuesto document, using fallback:', err);
    const downloadUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    return { downloadUrl, storagePath };
  }
}

export async function uploadTrabajoAdjuntoStorage(
  trabajoId: string,
  file: File | Blob,
  nombreArchivo: string
): Promise<string> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `trabajos/${trabajoId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);

  try {
    const mimeType = file.type || 'image/jpeg';
    await uploadBytes(fileRef, file, { contentType: mimeType });
    return await getDownloadURL(fileRef);
  } catch (err) {
    console.warn('Firebase Storage upload failed for trabajo adjunto, using fallback:', err);
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
}

// =========================================================================
// INVENTARIO Y HABITACIONES (ARENA C)
// =========================================================================

export function subscribeInventarioInmueble(
  inmuebleId: string,
  callback: (items: ElementoInventario[]) => void
) {
  if (!inmuebleId) {
    callback([]);
    return () => undefined;
  }
  const qInv = query(INVENTARIO_COL, where('inmuebleId', '==', inmuebleId));
  return onSnapshot(
    qInv,
    (snapshot) => {
      const items: ElementoInventario[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as ElementoInventario);
      });
      items.sort(
        (a, b) => new Date(b.fechaModificacion).getTime() - new Date(a.fechaModificacion).getTime()
      );
      callback(items);
    },
    (err) => {
      reportarErrorLectura('inventario', err, 'Firestore inventario snapshot error:');
      callback([]);
    }
  );
}

export async function saveElementoInventarioFirestore(item: ElementoInventario): Promise<void> {
  const clean = sanitizeObjectForFirestore(item);
  await setDoc(doc(db, 'inventario_inmuebles', item.id), clean, { merge: true });
}

export async function deleteElementoInventarioFirestore(inventarioId: string): Promise<void> {
  await deleteDoc(doc(db, 'inventario_inmuebles', inventarioId));
}

export async function registrarHistorialInventarioFirestore(entry: {
  id?: string;
  inmuebleId: string;
  inventarioId?: string;
  fecha: string;
  usuarioId?: string;
  usuarioNombre: string;
  accion: string;
  elementoAfectado: string;
  cambios?: string;
}): Promise<void> {
  const id = entry.id || `invh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await setDoc(
    doc(db, 'inventario_historial', id),
    sanitizeObjectForFirestore({ ...entry, id }),
    { merge: false }
  );
}

export function subscribeHistorialInventario(
  inmuebleId: string,
  callback: (items: any[]) => void
) {
  if (!inmuebleId) {
    callback([]);
    return () => undefined;
  }
  const qHist = query(INVENTARIO_HISTORIAL_COL, where('inmuebleId', '==', inmuebleId));
  return onSnapshot(
    qHist,
    (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      items.sort(
        (a, b) => new Date(b.fecha || b.timestamp || 0).getTime() - new Date(a.fecha || a.timestamp || 0).getTime()
      );
      callback(items);
    },
    (err) => {
      reportarErrorLectura('inventario_historial', err, 'Firestore historial inventario snapshot error:');
      callback([]);
    }
  );
}

export async function uploadInventarioAdjuntoStorage(
  inmuebleId: string,
  inventarioId: string,
  file: File | Blob,
  nombreArchivo: string
): Promise<{ downloadURL: string; storagePath: string }> {
  const sanitizedName = nombreArchivo.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `inmuebles/${inmuebleId}/inventario/${inventarioId}/${Date.now()}_${sanitizedName}`;
  const fileRef = ref(storage, storagePath);
  try {
    await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
    const downloadURL = await getDownloadURL(fileRef);
    return { downloadURL, storagePath };
  } catch (err) {
    console.warn('Storage inventario fallback:', err);
    const downloadURL = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
    return { downloadURL, storagePath };
  }
}

export function subscribeHabitacionesInmueble(
  inmuebleId: string,
  callback: (items: HabitacionInmueble[]) => void
) {
  if (!inmuebleId) {
    callback([]);
    return () => undefined;
  }
  const qHab = query(HABITACIONES_COL, where('inmuebleId', '==', inmuebleId));
  return onSnapshot(
    qHab,
    (snapshot) => {
      const items: HabitacionInmueble[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as HabitacionInmueble);
      });
      items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      callback(items);
    },
    (err) => {
      reportarErrorLectura('habitaciones', err, 'Firestore habitaciones snapshot error:');
      callback([]);
    }
  );
}

export async function saveHabitacionFirestore(habitacion: HabitacionInmueble): Promise<void> {
  const refH = doc(db, 'habitaciones_inmueble', habitacion.id);
  const existing = await getDoc(refH);
  if (existing.exists()) {
    const prev = existing.data() as HabitacionInmueble;
    if (prev.inmuebleId && prev.inmuebleId !== habitacion.inmuebleId) {
      throw new Error('No se puede reasignar inmuebleId de una habitación.');
    }
  }
  const clean = sanitizeObjectForFirestore(habitacion);
  await setDoc(refH, clean, { merge: true });
}

/** Asignación atómica: solo un candidato puede quedar selectedCandidatoId. */
export async function asignarCandidatoHabitacionFirestore(
  habitacionId: string,
  candidatoId: string,
  usuarioNombre: string
): Promise<HabitacionInmueble> {
  const refH = doc(db, 'habitaciones_inmueble', habitacionId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(refH);
    if (!snap.exists()) throw new Error('La habitación no existe.');
    const prev = { id: snap.id, ...snap.data() } as HabitacionInmueble;
    if (prev.selectedCandidatoId && prev.selectedCandidatoId !== candidatoId) {
      throw new Error('Conflicto: la habitación ya está asignada a otro candidato.');
    }
    const next: HabitacionInmueble = {
      ...prev,
      selectedCandidatoId: candidatoId,
      fechaModificacion: new Date().toISOString(),
      actualizadoPor: usuarioNombre,
    };
    transaction.set(refH, sanitizeObjectForFirestore(next), { merge: true });
    return next;
  });
}

// =========================================================================
// GAP4 — FINANCIACIÓN HIPOTECARIA AVANZADA
// =========================================================================

/**
 * Suscripción en tiempo real de financiaciones.
 * La autorización/aislamiento real la aplica Firestore rules; aquí se devuelve
 * la lista y el ámbito (scoping) lo decide la UI igual que el resto de módulos.
 */
export function subscribeFinanciaciones(
  callback: (financiaciones: Financiacion[]) => void,
  scope?: DataAccessScope
) {
  const mapear = (snapshot: QuerySnapshot) => {
    const items: Financiacion[] = [];
    snapshot.forEach((docSnap) => {
      items.push({ id: docSnap.id, ...docSnap.data() } as Financiacion);
    });
    items.sort((a, b) => (b.fechaFormalizacion || '').localeCompare(a.fechaFormalizacion || ''));
    callback(items);
  };
  const onError = (err: unknown) => {
    reportarErrorLectura('financiaciones', err, 'Firestore financiaciones snapshot error:');
  };
  // D2 (E4): el list de Rules obliga a where('propietarioId','==', pid).
  // Profesional: cero acceso (datos hipotecarios). Sin ámbito (master/admin
  // operativo): colección completa. Otros perfiles con scope: la colección
  // completa la deniegan las Rules (fail-closed), como en contratos.
  if (scope?.tipoPerfil === 'PROFESIONAL') {
    callback([]);
    return () => {};
  }
  if (scope?.tipoPerfil === 'PROPIETARIO') {
    if (!scope.propietarioId) {
      callback([]);
      return () => {};
    }
    return onSnapshot(
      query(FINANCIACIONES_COL, where('propietarioId', '==', scope.propietarioId)),
      mapear,
      onError
    );
  }
  return onSnapshot(FINANCIACIONES_COL, mapear, onError);
}

/**
 * Guarda o actualiza una Financiación. Sin secretos: `sanitizeObjectForFirestore`
 * elimina undefined y el modelo Financiacion no contempla credenciales.
 */
export async function saveFinanciacionFirestore(financiacion: Financiacion): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...financiacion,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'financiaciones', financiacion.id), clean, { merge: true });
  } catch (err) {
    reportarErrorGuardado('financiaciones', err, 'Error saving financiacion to Firestore:');
    throw err;
  }
}

/**
 * Elimina una financiación. La cancelación lógica (estado CANCELADA) es la vía
 * habitual; el borrado físico queda restringido por reglas a administrador.
 */
export async function deleteFinanciacionFirestore(financiacionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'financiaciones', financiacionId));
  } catch (err) {
    reportarErrorGuardado('financiaciones', err, 'Error deleting financiacion from Firestore:');
    throw err;
  }
}

// =========================================================================
// GAP7 — FACTURACIÓN Y VERI*FACTU (aislamiento por propietario; sin secretos)
// =========================================================================

export const FACTURAS_COL = collection(db, 'facturas');
export const REGISTROS_FACTURACION_COL = collection(db, 'registros_facturacion');
export const ENVIOS_VERIFACTU_COL = collection(db, 'envios_verifactu');
export const SERIES_FACTURACION_COL = collection(db, 'series_facturacion');

/**
 * Suscripción en tiempo real de facturas. La autorización/aislamiento real la
 * aplica Firestore rules; la UI aplica el ámbito igual que el resto de módulos.
 */
export function subscribeFacturas(callback: (facturas: Factura[]) => void) {
  return onSnapshot(
    FACTURAS_COL,
    (snapshot) => {
      const items: Factura[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as Factura);
      });
      items.sort((a, b) => (b.fechaExpedicionUtc || '').localeCompare(a.fechaExpedicionUtc || ''));
      callback(items);
    },
    (err) => {
      reportarErrorLectura('facturas', err, 'Firestore facturas snapshot error:');
    }
  );
}

/** Guarda una factura. Sin secretos: modelo Factura no contempla credenciales. */
export async function saveFacturaFirestore(factura: Factura): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...factura,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'facturas', factura.id), clean, { merge: true });
  } catch (err) {
    reportarErrorGuardado('facturas', err, 'Error saving factura to Firestore:');
    throw err;
  }
}

export async function deleteFacturaFirestore(facturaId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'facturas', facturaId));
  } catch (err) {
    reportarErrorGuardado('facturas', err, 'Error deleting factura from Firestore:');
    throw err;
  }
}

/** Suscripción en tiempo real de registros de facturación (RRSIF). */
export function subscribeRegistrosFacturacion(callback: (registros: RegistroFacturacion[]) => void) {
  return onSnapshot(
    REGISTROS_FACTURACION_COL,
    (snapshot) => {
      const items: RegistroFacturacion[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as RegistroFacturacion);
      });
      items.sort((a, b) => a.fechaHoraHusoGenRegistro.localeCompare(b.fechaHoraHusoGenRegistro));
      callback(items);
    },
    (err) => {
      reportarErrorLectura('registros_facturacion', err, 'Firestore registros_facturacion snapshot error:');
    }
  );
}

/**
 * Guarda un registro de facturación. El registro es INALTERABLE: una vez
 * existente, no se sobrescribe (merge: false) salvo que el documento no exista.
 */
export async function createRegistroFacturacionFirestore(registro: RegistroFacturacion): Promise<void> {
  try {
    const refReg = doc(db, 'registros_facturacion', registro.id);
    const existente = await getDoc(refReg);
    if (existente.exists()) {
      throw new Error('El registro de facturación ya existe y es inalterable.');
    }
    const clean = sanitizeObjectForFirestore(registro);
    await setDoc(refReg, clean, { merge: false });
  } catch (err) {
    reportarErrorGuardado('registros_facturacion', err, 'Error creating registro_facturacion in Firestore:');
    throw err;
  }
}

/** Suscripción en tiempo real de envíos VERI*FACTU. */
export function subscribeEnviosVerifactu(callback: (envios: EnvioVerifactu[]) => void) {
  return onSnapshot(
    ENVIOS_VERIFACTU_COL,
    (snapshot) => {
      const items: EnvioVerifactu[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as EnvioVerifactu);
      });
      items.sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));
      callback(items);
    },
    (err) => {
      reportarErrorLectura('envios_verifactu', err, 'Firestore envios_verifactu snapshot error:');
    }
  );
}

/** Crea o actualiza un envío VERI*FACTU conservando su identidad idempotente. */
export async function saveEnvioVerifactuFirestore(envio: EnvioVerifactu): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore(envio);
    await setDoc(doc(db, 'envios_verifactu', envio.id), clean, { merge: true });
  } catch (err) {
    reportarErrorGuardado('envios_verifactu', err, 'Error saving envio_verifactu to Firestore:');
    throw err;
  }
}

/** Suscripción en tiempo real de series de facturación. */
export function subscribeSeriesFacturacion(callback: (series: SerieFacturacion[]) => void) {
  return onSnapshot(
    SERIES_FACTURACION_COL,
    (snapshot) => {
      const items: SerieFacturacion[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as SerieFacturacion);
      });
      items.sort((a, b) => `${b.ejercicio}-${b.codigo}`.localeCompare(`${a.ejercicio}-${a.codigo}`));
      callback(items);
    },
    (err) => {
      reportarErrorLectura('series_facturacion', err, 'Firestore series_facturacion snapshot error:');
    }
  );
}

/** Guarda o actualiza una serie de facturación (avanza la correlación). */
export async function saveSerieFacturacionFirestore(serie: SerieFacturacion): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...serie,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'series_facturacion', serie.id), clean, { merge: true });
  } catch (err) {
    reportarErrorGuardado('series_facturacion', err, 'Error saving serie_facturacion to Firestore:');
    throw err;
  }
}

// =========================================================================
// GAP8 — FACTURA ELECTRÓNICA B2B (RD 238/2026). Colección propia y aislada de
// facturas / registros_facturacion / envios_verifactu. Sin secretos: el modelo
// FacturaElectronicaB2B no contempla credenciales ni certificados.
// =========================================================================

export const FACTURAS_ELECTRONICAS_B2B_COL = collection(db, 'facturas_electronicas_b2b');

/** Suscripción en tiempo real de representaciones electrónicas B2B. */
export function subscribeFacturasElectronicasB2B(callback: (items: FacturaElectronicaB2B[]) => void) {
  return onSnapshot(
    FACTURAS_ELECTRONICAS_B2B_COL,
    (snapshot) => {
      const items: FacturaElectronicaB2B[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as FacturaElectronicaB2B);
      });
      items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      callback(items);
    },
    (err) => {
      reportarErrorLectura('facturas_b2b', err, 'Firestore facturas_electronicas_b2b snapshot error:');
    }
  );
}

/**
 * Crea o actualiza una factura electrónica B2B. Idempotencia por id determinista
 * (mismo factura+formato+versión ⇒ mismo id ⇒ no duplica documentos).
 * El historial es append-only a nivel de motor; Firestore rules lo garantizan.
 */
export async function saveFacturaElectronicaB2BFirestore(feb: FacturaElectronicaB2B): Promise<void> {
  try {
    const clean = sanitizeObjectForFirestore({
      ...feb,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(doc(db, 'facturas_electronicas_b2b', feb.id), clean, { merge: true });
  } catch (err) {
    reportarErrorGuardado('facturas_b2b', err, 'Error saving factura_electronica_b2b to Firestore:');
    throw err;
  }
}

export {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  where,
};
