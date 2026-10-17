/**
 * IA · FASE 1 + 2 — DEPENDENCIAS REALES DEL NÚCLEO DE IA
 * =====================================================
 * Construye, a partir del entorno del servidor, las dependencias del núcleo
 * (`server/ia/nucleoIA.ts`) reutilizando la integración Google ya existente
 * (`server/titularidades/googleBackend.ts`, sin SDK de administración):
 *
 *   · Proyecto para verificar el ID token: `FIREBASE_PROJECT_ID` o, por
 *     defecto, el `projectId` con el que la app inicializa Firebase
 *     (`firebase-applet-config.json`, el mismo que lee `src/lib/entornoFirebase.ts`).
 *     La audiencia nunca se deriva de una credencial de otro proyecto.
 *     Sin credencial en producción se bloquea antes de autenticar.
 *   · Registro: con credencial de servicio (`FIREBASE_SERVICE_ACCOUNT`,
 *     `_B64`, `_PATH` o `GOOGLE_APPLICATION_CREDENTIALS`, las mismas variables
 *     que la búsqueda de titulares) → Firestore REST en la base de datos de la
 *     aplicación (`FIRESTORE_DATABASE_ID` o la de la configuración). Sin
 *     credencial: memoria solo en desarrollo explícito; bloqueo en producción.
 *   · Gobierno de uso (FASE 2 + 7): sigue al registro — Firestore en producción,
 *     memoria en desarrollo. La política viene de `src/ia/gobiernoIAContrato.ts`
 *     (por defecto DENIEGA todas las operaciones y mantiene el bloqueo por
 *     aprobación comercial pendiente) o de `IA_POLITICA_JSON`, que exige la
 *     política completa (permisos explícitos de los 4 perfiles, tarifa de las 12
 *     operaciones y cuotas finitas); si la variable existe y no es válida, se
 *     bloquean las operaciones (fallo cerrado).
 *   · Proveedor (FASE 9, Vía 2): la llave PROPIA de cada usuario, custodiada
 *     cifrada por `server/ia/llavesUsuarioIA.ts` con la clave maestra
 *     `IA_LLAVES_CLAVE_MAESTRA`. Sin clave maestra el subsistema queda
 *     NO_CONFIGURADO (nadie registra llaves y nunca se crea el cliente del
 *     proveedor); con clave maestra inválida, fallo cerrado. `GEMINI_API_KEY`
 *     YA NO se usa para operaciones de usuario (sólo se informa en /api/health).
 *
 * Una credencial de otro proyecto bloquea las operaciones, no el arranque HTTP.
 * No escribe ni modifica secretos: sólo los lee.
 */
import { resolverAccesoFirebase, type CodigoErrorConfiguracionFirebase } from '../titularidades/configuracionFirebase.js';
import { ClienteFirestoreRest, verificarIdToken, type CuentaServicio } from '../titularidades/googleBackend.js';
import { ClienteGoogleStorageRest, resolverBucketStorage } from '../cobros/almacenGoogleStorage.js';
import {
  crearClienteGemini,
  type DependenciasNucleoIA,
  type ModoRegistroIA,
  type ResultadoResolverTitularNucleoIA,
} from './nucleoIA.js';
import { crearRegistroFirestore, crearRegistroMemoria } from './registroOperacionesIA.js';
import {
  crearGobiernoFirestore,
  crearGobiernoMemoria,
  type GobiernoIA,
} from './gobiernoIA.js';
import {
  VARIABLE_ENTORNO_POLITICA_IA,
  politicaGobiernoIADesdeEntorno,
  type PoliticaGobiernoIA,
} from '../../src/ia/gobiernoIAContrato.js';
import {
  modoSinLlaveDesdeEntorno,
  modoVerificacionDesdeEntorno,
  VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES,
  type ModoSinLlaveIA,
  type ModoVerificacionLlaveIA,
} from '../../src/ia/llavesUsuarioContrato.js';
import { resolverClaveMaestraLlaves } from './cifradoLlavesIA.js';
import { crearServicioLlavesFirestore, crearServicioLlavesMemoria, type ServicioLlavesIA } from './llavesUsuarioIA.js';
import { crearServicioContextoTitularIA } from './contextoTitularIA.js';
import type { IdOperacionIA } from '../../src/ia/catalogoOperacionesIA.js';

/**
 * Referencias de contrato admitidas por cada ruta IA. El identificador puede
 * venir del cliente como localizador, nunca como prueba de permiso: el servicio
 * vuelve a leer contrato/actor/cartera/titular en Firestore. No se acepta un
 * `propietarioId`, UID pagador o llave suministrados por el cliente.
 */
const RUTAS_CONTRATO_IA: Readonly<Record<IdOperacionIA, readonly string[]>> = {
  ANALIZAR_DOCUMENTO: ['contratoId', 'contexto.contratoId', 'candidatoManualData.contratoId'],
  GENERAR_CORREO_ASEGURADORA: ['contratoId', 'solicitudSeguro.contratoId'],
  ANALIZAR_RESPUESTA_ASEGURADORA: ['contratoId'],
  ASISTENTE_INTERPRETAR: ['contratoId'],
  ASISTENTE_INCIDENCIAS_INQUILINO: ['contratoId'],
  ANALIZAR_CUESTIONARIO: ['contratoId'],
  REDACTAR_CLAUSULA: ['contratoId', 'contextoInmueble.contratoId'],
  ANALIZAR_INSPECCION: ['contratoId', 'contexto.contratoId'],
  PROPONER_MEJORAS: ['contratoId'],
  ESTIMAR_PRICING: ['contratoId'],
  GENERAR_KIT_PUBLICACION: ['contratoId'],
  ANALIZAR_INCIDENCIA: ['contratoId', 'incidencia.contratoId', 'contratoContexto.contratoId'],
};

function objetoPeticionIA(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? valor as Record<string, unknown>
    : {};
}

/** Devuelve sólo un id sintácticamente válido; la autorización sucede en Firestore. */
export function contratoIdDePeticionIA(operacion: IdOperacionIA, cuerpo: unknown): string | null {
  const raiz = objetoPeticionIA(cuerpo);
  for (const ruta of RUTAS_CONTRATO_IA[operacion]) {
    const valor = ruta.split('.').reduce<unknown>((actual, segmento) => objetoPeticionIA(actual)[segmento], raiz);
    if (typeof valor === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(valor)) return valor;
  }
  return null;
}

export interface ConfiguracionNucleoIA {
  proyectoId: string | null;
  baseDatosId: string | null;
  produccion: boolean;
  modoRegistro: ModoRegistroIA;
  errorConfiguracion?: CodigoErrorConfiguracionFirebase;
}

function configurar(acceso: ReturnType<typeof resolverAccesoFirebase>, entorno: NodeJS.ProcessEnv): ConfiguracionNucleoIA {
  const produccion = Boolean(entorno.VERCEL?.trim()) || entorno.NODE_ENV === 'production';
  // Única excepción: desarrollo explícito SIN ninguna credencial (no inválida).
  const memoria = !produccion && entorno.NODE_ENV === 'development'
    && acceso.errorConfiguracion === 'FIREBASE_CREDENCIAL_AUSENTE';
  const errorConfiguracion = memoria ? undefined : acceso.errorConfiguracion;
  const modoRegistro: ModoRegistroIA = errorConfiguracion ? 'NO_CONFIGURADO' : memoria ? 'MEMORIA' : 'FIRESTORE';
  return { proyectoId: acceso.proyectoId, baseDatosId: acceso.baseDatosId, produccion, modoRegistro,
    ...(errorConfiguracion ? { errorConfiguracion } : {}) };
}

/** Solo lectura local; nunca prueba permisos ni conectividad de Google. */
export function resolverConfiguracionIA(entorno: NodeJS.ProcessEnv = process.env, cuenta?: CuentaServicio | null): ConfiguracionNucleoIA {
  return configurar(resolverAccesoFirebase(entorno, cuenta), entorno);
}

export function crearDependenciasNucleoIA(
  entorno: NodeJS.ProcessEnv = process.env,
): DependenciasNucleoIA & {
  configuracion: ConfiguracionNucleoIA;
  politica: PoliticaGobiernoIA | null;
  errorPolitica?: string;
  /** Fuente autorizada de datos (Firestore REST con credencial de servicio) o `null`. */
  firestore: ClienteFirestoreRest | null;
  /** Storage privado de justificantes P2; `null` ⇒ 503, nunca memoria temporal. */
  storage: ClienteGoogleStorageRest | null;
  /** FASE 9 · servicio de llaves de usuario (`null` ⇒ NO_CONFIGURADO). */
  llaves: ServicioLlavesIA | null;
  /** FASE 9 · qué hace el núcleo sin llave del usuario. */
  sinLlave: ModoSinLlaveIA;
  /** FASE 9 · si la verificación con el proveedor está activada (sólo por decisión expresa). */
  verificacionLlaves: ModoVerificacionLlaveIA;
} {
  const acceso = resolverAccesoFirebase(entorno);
  const configuracion = configurar(acceso, entorno);
  const politicaResultado = politicaGobiernoIADesdeEntorno(entorno);
  const politica = politicaResultado.estado === 'VALIDA' ? politicaResultado.politica : null;
  const errorPolitica = politicaResultado.estado === 'INVALIDA' ? politicaResultado.error : undefined;

  let registro: DependenciasNucleoIA['registro'] = null;
  let gobierno: GobiernoIA | null = null;
  let firestore: ClienteFirestoreRest | null = null;
  let storage: ClienteGoogleStorageRest | null = null;
  if (acceso.cuenta && configuracion.modoRegistro === 'FIRESTORE' && configuracion.baseDatosId) {
    firestore = new ClienteFirestoreRest({ cuenta: acceso.cuenta, baseDatosId: configuracion.baseDatosId });
    const bucket = resolverBucketStorage();
    if (bucket) storage = new ClienteGoogleStorageRest({ cuenta: acceso.cuenta, bucket });
    registro = crearRegistroFirestore(firestore);
    if (politica) gobierno = crearGobiernoFirestore(firestore, politica);
  } else if (configuracion.modoRegistro === 'MEMORIA') {
    console.warn('[ia] Registro EN MEMORIA: solo desarrollo explícito sin credencial.');
    const memoria = crearRegistroMemoria();
    registro = memoria;
    if (politica) gobierno = crearGobiernoMemoria(politica, { listarOperaciones: () => memoria.listar() });
  } else {
    console.warn(`[ia] ${configuracion.errorConfiguracion}: operaciones bloqueadas.`);
  }
  if (politicaResultado.estado === 'INVALIDA') {
    console.warn(`[ia] ${VARIABLE_ENTORNO_POLITICA_IA} inválida: ${politicaResultado.error}. Operaciones bloqueadas.`);
  }

  // FASE 9 · llaves de usuario: siguen al registro (Firestore en producción, memoria
  // en desarrollo explícito). Sin clave maestra ⇒ NO_CONFIGURADO; inválida ⇒ fallo cerrado.
  const claveMaestra = resolverClaveMaestraLlaves(entorno);
  let llaves: ServicioLlavesIA | null = null;
  let errorLlaves: 'LLAVES_CLAVE_MAESTRA_INVALIDA' | undefined;
  if (claveMaestra.estado === 'INVALIDA') {
    errorLlaves = 'LLAVES_CLAVE_MAESTRA_INVALIDA';
    console.warn(`[ia] ${VARIABLE_ENTORNO_CLAVE_MAESTRA_LLAVES} inválida: ${claveMaestra.error}. Operaciones bloqueadas.`);
  } else if (claveMaestra.estado === 'VALIDA') {
    if (firestore) llaves = crearServicioLlavesFirestore(firestore, claveMaestra.clave);
    else if (configuracion.modoRegistro === 'MEMORIA') llaves = crearServicioLlavesMemoria(claveMaestra.clave);
  }
  const sinLlave = modoSinLlaveDesdeEntorno(entorno);
  const verificacionLlaves = modoVerificacionDesdeEntorno(entorno);
  const servicioContextoTitularIA = firestore ? crearServicioContextoTitularIA(firestore) : null;

  const { proyectoId, errorConfiguracion } = configuracion;
  return {
    configuracion,
    politica,
    firestore,
    storage,
    llaves,
    sinLlave,
    verificacionLlaves,
    ...(errorPolitica ? { errorPolitica } : {}),
    registro,
    gobierno,
    ...(servicioContextoTitularIA ? {
      resolverTitularIA: async ({ uidActor, operacion, request }: { uidActor: string; operacion: IdOperacionIA; request: import('express').Request }): Promise<ResultadoResolverTitularNucleoIA> => {
        const contratoId = contratoIdDePeticionIA(operacion, request.body);
        if (!contratoId) return { estado: 'RECHAZADO', codigo: 'PETICION_INVALIDA' };
        const resultado = await servicioContextoTitularIA.resolver({ uidActor, contratoId });
        if (resultado.estado !== 'RESUELTO') return { estado: 'RECHAZADO', codigo: resultado.codigo };
        return {
          estado: 'RESUELTO',
          contexto: {
            propietarioUid: resultado.propietarioUid,
            propietarioId: resultado.propietarioId,
            contratoId: resultado.contratoId,
            inmuebleId: resultado.inmuebleId,
          },
        };
      },
    } : {}),
    ...(errorConfiguracion ? { errorConfiguracion } : {}),
    ...(errorPolitica ? { errorGobierno: 'POLITICA_IA_INVALIDA' as const } : {}),
    ...(errorLlaves ? { errorLlaves } : {}),
    verificarToken: (token: string) => proyectoId && !errorConfiguracion ? verificarIdToken(token, proyectoId) : Promise.resolve(null),
    // FASE 9 · el cliente del proveedor SOLO nace de la llave propia del usuario que
    // resolvió el núcleo. Sin contexto o sin llave ⇒ null (respaldo). La clave
    // compartida del entorno (GEMINI_API_KEY) no se lee aquí.
    crearClienteProveedor: (contexto) =>
      errorConfiguracion || errorPolitica || errorLlaves || !contexto?.llaveUsuario ? null : crearClienteGemini(contexto.llaveUsuario),
  };
}
