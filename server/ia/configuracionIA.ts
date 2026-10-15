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
 *   · Gobierno de uso (FASE 2): sigue al registro — Firestore en producción,
 *     memoria en desarrollo. La política viene de `src/ia/gobiernoIAContrato.ts`
 *     (por defecto conserva Fase 1) o de `IA_POLITICA_JSON`; si la variable
 *     existe y no es válida, se bloquean las operaciones (fallo cerrado).
 *   · Proveedor: `GEMINI_API_KEY` (la misma clave de siempre).
 *
 * Una credencial de otro proyecto bloquea las operaciones, no el arranque HTTP.
 * No escribe ni modifica secretos: sólo los lee.
 */
import { resolverAccesoFirebase, type CodigoErrorConfiguracionFirebase } from '../titularidades/configuracionFirebase.js';
import { ClienteFirestoreRest, verificarIdToken, type CuentaServicio } from '../titularidades/googleBackend.js';
import { crearClienteGemini, type DependenciasNucleoIA, type ModoRegistroIA } from './nucleoIA.js';
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
): DependenciasNucleoIA & { configuracion: ConfiguracionNucleoIA; politica: PoliticaGobiernoIA | null; errorPolitica?: string } {
  const acceso = resolverAccesoFirebase(entorno);
  const configuracion = configurar(acceso, entorno);
  const politicaResultado = politicaGobiernoIADesdeEntorno(entorno);
  const politica = politicaResultado.estado === 'VALIDA' ? politicaResultado.politica : null;
  const errorPolitica = politicaResultado.estado === 'INVALIDA' ? politicaResultado.error : undefined;

  let registro: DependenciasNucleoIA['registro'] = null;
  let gobierno: GobiernoIA | null = null;
  if (acceso.cuenta && configuracion.modoRegistro === 'FIRESTORE' && configuracion.baseDatosId) {
    const firestore = new ClienteFirestoreRest({ cuenta: acceso.cuenta, baseDatosId: configuracion.baseDatosId });
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

  const { proyectoId, errorConfiguracion } = configuracion;
  return {
    configuracion,
    politica,
    ...(errorPolitica ? { errorPolitica } : {}),
    registro,
    gobierno,
    ...(errorConfiguracion ? { errorConfiguracion } : {}),
    ...(errorPolitica ? { errorGobierno: 'POLITICA_IA_INVALIDA' as const } : {}),
    verificarToken: (token: string) => proyectoId && !errorConfiguracion ? verificarIdToken(token, proyectoId) : Promise.resolve(null),
    crearClienteProveedor: () => (errorConfiguracion || errorPolitica ? null : crearClienteGemini(entorno.GEMINI_API_KEY)),
  };
}
