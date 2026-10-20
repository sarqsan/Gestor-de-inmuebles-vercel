/**
 * AG-03.2 · Harness de la AUTORIZACIÓN DOCUMENTAL DEL SERVIDOR.
 * ---------------------------------------------------------------------------
 * Hasta la ORDEN AG-03.2 las matrices de acceso a documentos se evaluaban
 * interpretando el texto de `storage.rules` (reglas con `firestore.get()`).
 * Esas reglas sólo pueden leer la base Firestore `(default)`, que NO forma
 * parte de la arquitectura: la aplicación opera únicamente sobre la base con
 * nombre. La decisión de acceso vive ahora en
 * `server/documentos/autorizacionDocumental.ts` (lecturas de la base con
 * nombre) y `storage.rules` ya no concede nada salvo el catálogo público.
 *
 * Este módulo conserva la forma de petición de los harness anteriores
 * (`auth`, mini-base Firestore, ruta, metadatos del objeto entrante) y la
 * resuelve contra el autorizador REAL del servidor, de modo que las matrices
 * existentes (titular, carteras L/E, delegación parcial, inquilino,
 * profesional, revocación, administración, nombres hostiles, tipo/tamaño)
 * siguen demostrando la misma semántica sobre el código que se ejecuta.
 *
 * Traducción de verbos: get ⇒ LEER · create ⇒ CREAR · update ⇒ SOBRESCRIBIR ·
 * delete ⇒ BORRAR · list ⇒ SIEMPRE denegado (la API del servidor no expone
 * enumeración de objetos; ningún cliente del repositorio usa `listAll`).
 *
 * Portal de candidatos: la antigua regla admitía la subida ANÓNIMA en la ruta
 * plana de `documentos_solicitados`. El servidor exige el token de la
 * solicitud (verificado contra la base con nombre); aquí se modela con
 * `publico: { solicitudDocId, token }` y se comprueba contra la mini-base.
 *
 * Igual que antes, esto NO es el motor de Google ni el emulador: es el
 * autorizador del servidor ejecutado con dobles en memoria. La aceptación
 * real (cuenta normal contra el proyecto) queda como paso pendiente.
 */
import {
  ContextoAutorizacion,
  DESTINOS,
  decidirAccion,
  identidadAActor,
  resolverObjeto,
  type AccionDocumental,
  type ClaveDestino,
  type PuertoLecturaDocumental,
} from '../../server/documentos/autorizacionDocumental';

export type Verbo = 'get' | 'list' | 'create' | 'update' | 'delete';

export interface AuthSintetica {
  uid: string;
  token?: Record<string, unknown>;
}

export interface RecursoEntrante {
  /** Nombre COMPLETO del objeto (ruta). */
  name?: string;
  size: number;
  contentType: string;
  /** `customMetadata` del objeto subido (P3/P5: documentoId, inmuebleId, sha256…). */
  metadata?: Record<string, unknown>;
}

export interface PeticionServidor {
  auth: AuthSintetica | null;
  /** Mini-base Firestore CON NOMBRE: `coleccion/id` (o subcolección) → datos. */
  db: Record<string, Record<string, unknown>>;
  path: string;
  /** Sólo en create/update. */
  metadata?: RecursoEntrante | null;
  /** Portal público de candidatos (token de la solicitud). */
  publico?: { solicitudDocId: string; token: string };
}

export interface DecisionServidor {
  permitido: boolean;
  motivo: string;
  /** Destino resuelto para la ruta (`null` ⇒ sin bloque: denegación por defecto). */
  destino: ClaveDestino | null;
}

/** Puerto de lectura sobre la mini-base (rutas relativas, como el servidor). */
export function puertoDeMiniBase(db: Record<string, Record<string, unknown>>): PuertoLecturaDocumental {
  return {
    async leerDocumento(ruta: string) {
      const clave = decodeURIComponent(ruta);
      const datos = db[clave];
      return datos ? { id: clave.slice(clave.lastIndexOf('/') + 1), datos } : null;
    },
  };
}

const ACCION: Record<Exclude<Verbo, 'list'>, AccionDocumental> = {
  get: 'LEER',
  create: 'CREAR',
  update: 'SOBRESCRIBIR',
  delete: 'BORRAR',
};

function customMetadataDe(md: RecursoEntrante | null | undefined): Record<string, string> | undefined {
  if (!md?.metadata) return undefined;
  const salida: Record<string, string> = {};
  for (const [k, v] of Object.entries(md.metadata)) if (typeof v === 'string') salida[k] = v;
  return salida;
}

/** Decide con el autorizador real del servidor. */
export async function decidirEnServidor(verbo: Verbo, pet: PeticionServidor): Promise<DecisionServidor> {
  const objeto = resolverObjeto(pet.path);
  if (!objeto) return { permitido: false, motivo: 'SIN_DESTINO', destino: null };
  if (verbo === 'list') return { permitido: false, motivo: 'SIN_ENUMERACION', destino: objeto.destino.clave };
  if ((verbo === 'create' || verbo === 'update') && !pet.metadata) {
    throw new Error(`La operación ${verbo} necesita metadata (size/contentType)`);
  }
  if (pet.metadata?.name && pet.metadata.name !== pet.path) throw new Error('metadata.name debe coincidir con la ruta');

  const email = typeof pet.auth?.token?.email === 'string' ? (pet.auth!.token!.email as string) : undefined;
  const actor = pet.auth ? identidadAActor({ uid: pet.auth.uid, ...(email ? { email } : {}) }) : null;
  const ctx = new ContextoAutorizacion(actor, puertoDeMiniBase(pet.db));

  let publicoVerificado = false;
  if (pet.publico && verbo === 'create') {
    if (objeto.destino.clave !== 'DOCUMENTOS_SOLICITADOS') return { permitido: false, motivo: 'PORTAL_SOLO_DOCUMENTOS_SOLICITADOS', destino: objeto.destino.clave };
    const token = pet.publico.token.trim();
    const solicitud = pet.db[`solicitudes_documentacion/${pet.publico.solicitudDocId}`];
    if (!token || token.length < 8 || pet.publico.solicitudDocId !== objeto.ids.solicitudDocId || !solicitud || solicitud.token !== token) {
      return { permitido: false, motivo: 'TOKEN_NO_COINCIDE', destino: objeto.destino.clave };
    }
    publicoVerificado = true;
  }

  const contenido = pet.metadata
    ? { contentType: pet.metadata.contentType, tamanoBytes: pet.metadata.size, customMetadata: customMetadataDe(pet.metadata) }
    : {};
  const decision = await decidirAccion(ctx, objeto, ACCION[verbo], contenido, publicoVerificado);
  return { permitido: decision.permitido, motivo: decision.motivo, destino: objeto.destino.clave };
}

export async function permiteServidor(verbo: Verbo, pet: PeticionServidor): Promise<boolean> {
  return (await decidirEnServidor(verbo, pet)).permitido;
}

/** Plantilla legible de cada destino (sustituye a los patrones `match` de las reglas). */
export const PLANTILLAS_DESTINO: Record<ClaveDestino, string> = {
  COBROS_JUSTIFICANTES: 'cobros_justificantes/{propietarioId}/{cobroPeriodoId}/{fileName}',
  COBROS_JUSTIFICANTES_LEGADO: 'cobros_justificantes/{cobroPeriodoId}/{fileName}',
  GASTOS_FACTURAS: 'gastos_facturas/{propietarioId}/{gastoId}/{fileName}',
  DOCUMENTOS_SOLICITADOS: 'documentos_solicitados/{solicitudDocId}/{fileName}',
  DOCUMENTOS_SOLICITADOS_PROFUNDO: 'documentos_solicitados/{solicitudDocId}/{allFiles=**}',
  INMUEBLE_DOCUMENTO_PATRIMONIAL: 'inmuebles/{inmuebleId}/documentos_patrimoniales/{documentoId}/{fileName}',
  INMUEBLE_INVENTARIO: 'inmuebles/{inmuebleId}/inventario/{allFiles=**}',
  INMUEBLE_FOTO: 'inmuebles/{inmuebleId}/{fileName}',
  PROFESIONAL_DOCUMENTO: 'profesionales/{profesionalId}/documentos/{documentoId}/{fileName}',
  RECOMERCIALIZACION_FOTOS: 'recomercializacion_fotos/{propietarioId}/{expedienteId}/{fileName}',
  INCIDENCIAS_FOTOS: 'incidencias_fotos/{propietarioId}/{incidenciaId}/{fileName}',
  REFORMAS_DOCUMENTOS: 'reformas_documentos/{propietarioId}/{proyectoId}/{fileName}',
  REFORMAS_FOTOS: 'reformas_fotos/{propietarioId}/{proyectoId}/{fileName}',
  ACTAS_FOTOS: 'actas_fotos/{propietarioId}/{actaId}/{fileName}',
  ACTAS_PDFS: 'actas_pdfs/{propietarioId}/{actaId}/{fileName}',
  INCIDENCIA_EVIDENCIA: 'incidencias/{incidenciaId}/{file=**}',
  SUMINISTRO_LECTURA: 'suministros/{suministroId}/lecturas/{lecturaId}/{file=**}',
  CONTRATO_DOCUMENTO: 'contratos/{contratoId}/{file=**}',
  RECIBO: 'recibos/{contratoId}/{claveCobro}/{file=**}',
  MOROSIDAD_EVIDENCIA: 'morosidad_evidencias/{propietarioId}/{expedienteId}/{fileName}',
};

/** Ruta de ejemplo (segmentos `x`, fichero `a_1.pdf`) para cada destino. */
export function rutaEjemplo(clave: ClaveDestino): string {
  return PLANTILLAS_DESTINO[clave].replace(/\{\w+=\*\*\}/, 'a_1.pdf').replace(/\{\w+\}/g, 'x');
}

export const CLAVES_DESTINO: ClaveDestino[] = DESTINOS.map((d) => d.clave);
