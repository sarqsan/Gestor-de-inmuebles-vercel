/**
 * IA · FASE 1 — REGISTRO DE OPERACIONES DE IA POR USUARIO
 * =======================================================
 * Libro de operaciones del núcleo de IA (`server/ia/nucleoIA.ts`): un documento
 * por operación en la colección `ia_operaciones`, con id determinista derivado
 * de (uid del token, clave de idempotencia). Eso da las dos garantías de la
 * fase:
 *
 *   · TRAZABLE: quién (uid verificado en servidor), qué operación, cuándo,
 *     resultado HTTP, si respondió el proveedor o el respaldo heurístico,
 *     llamadas al proveedor, modelos y tokens declarados por el proveedor.
 *   · SIN DUPLICADOS: la reserva es una CREACIÓN con id fijo. Si el documento
 *     ya existe, la operación es un duplicado y NO se ejecuta (409).
 *
 * Qué NO se guarda nunca: prompts, cuerpos de petición o respuesta, documentos,
 * nombres, email ni claves. Sólo metadatos de uso.
 *
 * Seguridad: `ia_operaciones` no tiene `match` propio en `firestore.rules`, así
 * que la denegación global (`match /{document=**} { allow read, write: if
 * false; }`) impide cualquier lectura o escritura desde clientes; sólo escribe
 * el servidor con su credencial de servicio (REST, sin SDK de administración).
 *
 * Fuera de alcance (fases posteriores): créditos y saldo, límites o cuotas por
 * usuario, permisos por rol y operación, y paneles de consumo.
 */
import type { IdOperacionIA } from '../../src/ia/catalogoOperacionesIA';

export const COLECCION_OPERACIONES_IA = 'ia_operaciones';
export const VERSION_REGISTRO_IA = 1;

export type EstadoOperacionIA = 'EN_CURSO' | 'COMPLETADA' | 'FALLIDA';
/** PROVEEDOR = respondió el modelo; RESPALDO = heurística local sin consumo; ERROR = respuesta ≥ 400. */
export type OrigenRespuestaIA = 'PROVEEDOR' | 'RESPALDO' | 'ERROR';

/** Datos de apertura: se escriben ANTES de ejecutar la operación. */
export interface AperturaOperacionIA {
  id: string;
  uid: string;
  operacion: IdOperacionIA;
  ruta: string;
  iniciadaEn: Date;
}

/** Datos de cierre: se escriben ANTES de entregar la respuesta al cliente. */
export interface CierreOperacionIA {
  estado: Exclude<EstadoOperacionIA, 'EN_CURSO'>;
  codigoHttp: number;
  finalizadaEn: Date;
  duracionMs: number;
  origenRespuesta: OrigenRespuestaIA;
  llamadasProveedor: number;
  llamadasProveedorFallidas: number;
  modelos: string[];
  tokensEntrada: number;
  tokensSalida: number;
  tokensRazonamiento: number;
  tokensTotales: number;
  /** Código normalizado del último error del proveedor (nunca el mensaje crudo). */
  errorProveedor?: string;
}

/** Documento completo tal y como queda en el registro. */
export interface RegistroOperacionIA extends Partial<Omit<CierreOperacionIA, 'estado'>> {
  version: number;
  id: string;
  uid: string;
  operacion: IdOperacionIA;
  ruta: string;
  estado: EstadoOperacionIA;
  iniciadaEn: Date;
}

export type ResultadoReservaIA =
  | { estado: 'RESERVADA' }
  | { estado: 'DUPLICADA'; previa: { estado?: string } | null };

export interface RegistroOperacionesIA {
  readonly tipo: 'FIRESTORE' | 'MEMORIA';
  /** Crea el registro de la operación. `DUPLICADA` si ya existía (no se ejecuta). */
  reservar(apertura: AperturaOperacionIA): Promise<ResultadoReservaIA>;
  /** Cierra el registro con el resultado y el uso del proveedor. */
  completar(id: string, cierre: CierreOperacionIA): Promise<void>;
}

/** Lista blanca de campos persistidos: cualquier otro dato queda fuera del registro. */
export const CAMPOS_REGISTRO_IA = [
  'version', 'id', 'uid', 'operacion', 'ruta', 'estado', 'iniciadaEn',
  'codigoHttp', 'finalizadaEn', 'duracionMs', 'origenRespuesta',
  'llamadasProveedor', 'llamadasProveedorFallidas', 'modelos',
  'tokensEntrada', 'tokensSalida', 'tokensRazonamiento', 'tokensTotales', 'errorProveedor',
] as const;

function documentoApertura(apertura: AperturaOperacionIA): RegistroOperacionIA {
  return {
    version: VERSION_REGISTRO_IA,
    id: apertura.id,
    uid: apertura.uid,
    operacion: apertura.operacion,
    ruta: apertura.ruta,
    estado: 'EN_CURSO',
    iniciadaEn: apertura.iniciadaEn,
  };
}

function camposCierre(cierre: CierreOperacionIA): CierreOperacionIA {
  const campos: CierreOperacionIA = {
    estado: cierre.estado,
    codigoHttp: cierre.codigoHttp,
    finalizadaEn: cierre.finalizadaEn,
    duracionMs: cierre.duracionMs,
    origenRespuesta: cierre.origenRespuesta,
    llamadasProveedor: cierre.llamadasProveedor,
    llamadasProveedorFallidas: cierre.llamadasProveedorFallidas,
    modelos: [...cierre.modelos],
    tokensEntrada: cierre.tokensEntrada,
    tokensSalida: cierre.tokensSalida,
    tokensRazonamiento: cierre.tokensRazonamiento,
    tokensTotales: cierre.tokensTotales,
  };
  if (cierre.errorProveedor) campos.errorProveedor = cierre.errorProveedor;
  return campos;
}

// ---------------------------------------------------------------------------
// Registro en memoria (SOLO desarrollo local y pruebas)
// ---------------------------------------------------------------------------

export interface RegistroOperacionesIAMemoria extends RegistroOperacionesIA {
  listar(): RegistroOperacionIA[];
  obtener(id: string): RegistroOperacionIA | undefined;
}

/**
 * Registro NO duradero (se pierde al reiniciar el proceso y no se comparte entre
 * instancias). El núcleo sólo lo usa fuera de producción; en producción sin
 * credencial el modo es NO_CONFIGURADO (sin llamadas al proveedor).
 * La reserva es atómica: no hay `await` entre la comprobación y la escritura.
 */
export function crearRegistroMemoria(opciones: { maxEntradas?: number } = {}): RegistroOperacionesIAMemoria {
  const maxEntradas = Math.max(1, opciones.maxEntradas ?? 5000);
  const entradas = new Map<string, RegistroOperacionIA>();
  const copia = (registro: RegistroOperacionIA): RegistroOperacionIA => ({
    ...registro,
    ...(registro.modelos ? { modelos: [...registro.modelos] } : {}),
  });

  return {
    tipo: 'MEMORIA',
    async reservar(apertura) {
      const previa = entradas.get(apertura.id);
      if (previa) return { estado: 'DUPLICADA', previa: { estado: previa.estado } };
      entradas.set(apertura.id, documentoApertura(apertura));
      while (entradas.size > maxEntradas) {
        const masAntigua = entradas.keys().next().value;
        if (masAntigua === undefined) break;
        entradas.delete(masAntigua);
      }
      return { estado: 'RESERVADA' };
    },
    async completar(id, cierre) {
      const actual = entradas.get(id);
      if (!actual) throw new Error(`La operación de IA ${id} no está reservada.`);
      entradas.set(id, { ...actual, ...camposCierre(cierre) });
    },
    listar: () => [...entradas.values()].map(copia),
    obtener: (id) => {
      const registro = entradas.get(id);
      return registro ? copia(registro) : undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// Registro en Firestore (producción) — REST con la credencial de servicio
// ---------------------------------------------------------------------------

/** Puerto mínimo de Firestore que necesita el registro (lo cumple `ClienteFirestoreRest`). */
export interface PuertoFirestoreRegistroIA {
  crearDocumento(coleccion: string, id: string, datos: Record<string, unknown>): Promise<'CREADO' | 'YA_EXISTE'>;
  actualizarCampos(coleccion: string, id: string, datos: Record<string, unknown>): Promise<void>;
  leer(coleccion: string, id: string): Promise<{ id: string; datos: Record<string, unknown> } | null>;
}

export function crearRegistroFirestore(firestore: PuertoFirestoreRegistroIA): RegistroOperacionesIA {
  return {
    tipo: 'FIRESTORE',
    async reservar(apertura) {
      const resultado = await firestore.crearDocumento(
        COLECCION_OPERACIONES_IA,
        apertura.id,
        documentoApertura(apertura) as unknown as Record<string, unknown>,
      );
      if (resultado === 'CREADO') return { estado: 'RESERVADA' };
      // Duplicado: el estado previo es informativo (mejor esfuerzo); la decisión
      // de NO ejecutar ya está tomada por la creación rechazada.
      let previa: { estado?: string } | null = null;
      try {
        const documento = await firestore.leer(COLECCION_OPERACIONES_IA, apertura.id);
        previa = documento
          ? { estado: typeof documento.datos.estado === 'string' ? documento.datos.estado : undefined }
          : null;
      } catch {
        previa = null;
      }
      return { estado: 'DUPLICADA', previa };
    },
    async completar(id, cierre) {
      await firestore.actualizarCampos(
        COLECCION_OPERACIONES_IA,
        id,
        camposCierre(cierre) as unknown as Record<string, unknown>,
      );
    },
  };
}
