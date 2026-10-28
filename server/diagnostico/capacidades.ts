/**
 * P0.1 — Mapa de capacidades REALMENTE disponibles en el servidor.
 * ===========================================================================
 * Antes, `/api/health` solo decía `status: ok` aunque media aplicación
 * estuviera caída (sin Firestore, sin Storage, sin SMTP, sin cron) o en modo
 * simulación. Ese `ok` no era verificable y podía hacer creer que un
 * despliegue estaba operativo cuando las rutas respondían 503.
 *
 * Este módulo es PURO (sin Express, sin Firebase, sin E/S): recibe el estado
 * de las dependencias ya resueltas por `server.ts` y produce un mapa con un
 * vocabulario cerrado:
 *
 *   OK             → servicio real conectado y persistente
 *   NO_CONFIGURADO → falta configuración; las rutas responden 503
 *   SIMULACION     → funciona pero con memoria/datos de demostración
 *   BLOQUEADO      → desactivado por una decisión explícita (no es un fallo)
 *
 * `scripts/doctor.mjs` consume este mapa desde `/api/health`. Los tests
 * cubren todas las combinaciones sin necesidad de levantar el servidor.
 */

export type EstadoCapacidad = 'OK' | 'NO_CONFIGURADO' | 'SIMULACION' | 'BLOQUEADO';

export interface Capacidad {
  readonly estado: EstadoCapacidad;
  readonly detalle: string;
}

export type MapaCapacidades = Readonly<Record<string, Capacidad>>;

export interface EntradasCapacidades {
  /**
   * H-13 — ¿Está configurada la verificación de ID tokens? Exige proyecto
   * Firebase resoluble: sin él `verificarIdToken` devuelve `null` y TODAS las
   * rutas autenticadas responden 401. Antes esta capacidad estaba fijada a `OK`
   * por escrito, así que el mapa mentía cuando faltaba la configuración.
   */
  readonly autenticacion: boolean;
  /** ¿Hay credencial de servicio y firestoreAdmin disponible? */
  readonly firestore: boolean;
  /** ¿Hay bucket de Storage con IAM resuelto? */
  readonly storage: boolean;
  /** Modo del registro de operaciones IA. */
  readonly registroIA: 'FIRESTORE' | 'MEMORIA' | 'NO_CONFIGURADO';
  /** Modo de las llaves de usuario IA. */
  readonly llavesIA: string;
  /** ¿Sigue activo el bloqueo preventivo de aprobación comercial de IA? */
  readonly bloqueoComercialIA: boolean;
  /** ¿Hay clave de modelo configurada en el servidor? */
  readonly claveModeloServidor: boolean;
  /** Modo del transporte de correo. */
  readonly modoEmail: 'REAL' | 'MODO_SEGURO';
  /** ¿Hay secreto de cron configurado? */
  readonly cron: boolean;
  /** ¿Persisten las notificaciones en Firestore o en memoria? */
  readonly notificacionesDuraderas: boolean;
  /** Servicios montados (null ⇒ rutas 503). */
  readonly portalesPublicos: boolean;
  readonly justificantesCobro: boolean;
  readonly actualizacionRenta: boolean;
  readonly seguimientoIncidencias: boolean;
  readonly documentos: boolean;
}

function porConfiguracion(
  disponible: boolean,
  detalleOk: string,
  detalleFalta: string,
): Capacidad {
  return disponible
    ? { estado: 'OK', detalle: detalleOk }
    : { estado: 'NO_CONFIGURADO', detalle: detalleFalta };
}

/** Construye el mapa. No lanza, no consulta el entorno, no hace E/S. */
export function construirCapacidades(e: EntradasCapacidades): MapaCapacidades {
  return {
    autenticacion: porConfiguracion(
      e.autenticacion,
      'Verificación de ID token configurada (RS256, aud/iss/exp) con denegación por defecto; los certificados se obtienen en la primera petición',
      'Sin proyecto Firebase resoluble no se puede verificar ningún ID token: las rutas autenticadas responden 401',
    ),
    firestore: porConfiguracion(
      e.firestore,
      'Credencial de servicio y base Firestore con nombre disponibles',
      'Sin credencial de servicio: las rutas dependientes responden 503',
    ),
    almacenDocumental: porConfiguracion(
      e.storage,
      'Bucket de Storage con IAM resuelto',
      'Sin Storage/IAM: custodia documental no disponible',
    ),
    portalesPublicos: porConfiguracion(
      e.portalesPublicos,
      'Portales por token (visita, cuestionario, documentación) operativos',
      'Portales públicos no montados: responden 503',
    ),
    custodia: porConfiguracion(
      e.documentos,
      'Custodia documental autorizada sobre Firestore + Storage',
      'Custodia documental no montada: responden 503',
    ),
    justificantesCobro: porConfiguracion(
      e.justificantesCobro,
      'Justificantes de cobro custodiados de forma duradera',
      'Gestión documental de justificantes no disponible',
    ),
    actualizacionRenta: porConfiguracion(
      e.actualizacionRenta,
      'Actualización de renta con preview y confirmación atómica',
      'Actualización de renta no montada: responde 503',
    ),
    seguimiento: porConfiguracion(
      e.seguimientoIncidencias,
      'Seguimiento de incidencias con notificaciones',
      'Seguimiento de incidencias no montado: responde 503',
    ),
    notificaciones: e.notificacionesDuraderas
      ? { estado: 'OK', detalle: 'Bandeja y entregas persistidas en Firestore' }
      : {
          estado: 'SIMULACION',
          detalle: 'Repositorio EN MEMORIA: los avisos se pierden al reiniciar',
        },
    modoEmail:
      e.modoEmail === 'REAL'
        ? { estado: 'OK', detalle: 'Transporte SMTP/API real configurado' }
        : {
            estado: 'SIMULACION',
            detalle: 'MODO_SEGURO: no se envía ningún correo; no hay entrega real',
          },
    cron: porConfiguracion(
      e.cron,
      'CRON_SECRET configurado; reloj de avisos protegido',
      'Sin CRON_SECRET: el reloj de avisos no puede ejecutarse',
    ),
    registroIA:
      e.registroIA === 'FIRESTORE'
        ? { estado: 'OK', detalle: 'Registro de operaciones IA duradero' }
        : {
            estado: 'SIMULACION',
            detalle: `Registro de operaciones IA en ${e.registroIA}: no es auditoría durable`,
          },
    llavesIA:
      e.llavesIA === 'NO_CONFIGURADO' || e.llavesIA === 'DESACTIVADO'
        ? {
            estado: 'NO_CONFIGURADO',
            detalle: `Llaves de usuario IA: ${e.llavesIA}`,
          }
        : { estado: 'OK', detalle: `Llaves de usuario IA: ${e.llavesIA}` },
    analisisIA: e.bloqueoComercialIA
      ? {
          estado: 'BLOQUEADO',
          detalle: 'IA desactivada por defecto: aprobación política/comercial pendiente (D4)',
        }
      : porConfiguracion(
          e.claveModeloServidor,
          'Proveedor de modelo disponible en servidor',
          'Sin clave de modelo en servidor',
        ),
  };
}

/** Estados que `scripts/doctor.mjs` considera no verificables como reales. */
export const ESTADOS_NO_REALES: readonly EstadoCapacidad[] = [
  'NO_CONFIGURADO',
  'SIMULACION',
  'BLOQUEADO',
];
