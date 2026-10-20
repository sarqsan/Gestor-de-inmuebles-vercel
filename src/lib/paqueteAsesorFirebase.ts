/**
 * P6 — ADAPTADOR FIREBASE DE SOLO LECTURA PARA EL PAQUETE DEL ASESOR.
 *
 * Única pieza con I/O. Reutiliza los suscriptores existentes (con
 * `DataAccessScope`; las Rules son la autorización efectiva) y la custodia
 * documental P3 (`inmuebles/{id}/documentos_patrimoniales` + Storage).
 *
 * GARANTÍAS:
 *  · CERO ESCRITURAS: no se actualizan estados documentales ni se escribe
 *    auditoría. Por eso la lectura de bytes NO usa
 *    `descargarDocumentoPatrimonial` (P3), que muta el metadato a
 *    ERROR_STORAGE y registra auditoría al fallar.
 *  · Sin Base64, sin data-URL y sin URLs públicas: `getBytes` con la sesión
 *    del usuario y los bytes viajan solo dentro del ZIP en memoria.
 *  · Las colecciones cuyo `list` las Rules limitan al titular (facturas,
 *    liquidaciones) se consultan SOLO con ámbito; para otros perfiles se
 *    declara la limitación en vez de forzar una consulta denegada.
 */
// AG-03.2: motor mediado por el servidor (autoriza contra la base Firestore con nombre).
import { getBytes, ref } from './custodiaDocumental/almacenServidor';
import type { Inmueble, PolizaSeguro, Titularidad, UsuarioApp } from '../types';
import type { Factura } from '../types/facturacion';
import type { LiquidacionPropietario } from '../tesoreria/tipos';
import type { DocumentoPatrimonial } from './expedienteDocumental/tipos';
import {
  FACTURAS_COL,
  auth,
  storage,
  subscribeColeccionPorAmbito,
  subscribeFacturas,
  subscribePolizas,
  type DataAccessScope,
} from './firebase';
import { cargarFuentesCatalogo, type FuentesCatalogo } from './importExportFirebase';
import { subscribeLiquidaciones } from './tesoreriaFirestore';
import { subscribeTitularidadesEscopo } from './titularidadesFirestore';
import { subscribeDocumentosPatrimoniales } from './expedienteDocumental/gestorFirebase';
import { esUsuarioMaster } from './adminUsuarios';
import type { AmbitoAutorizado } from './importExport/contrato';
import type { PaqueteAsesorGenerado, ResultadoEmpaquetadoAsesor, SolicitudPaqueteAsesor } from './paqueteAsesor/tipos';
import {
  MOTIVO_SOLO_TITULAR,
  TIMEOUT_LECTURA_PAQUETE_MS,
  cargarFuentesCon,
  empaquetarConBinarios,
  vistaPreviaPaqueteAsesor,
  type CargadorFuentesPaquete,
  type FuentesPaqueteAsesor,
  type ResultadoCarga,
} from './paqueteAsesor/adaptador';

export {
  MAX_INMUEBLES_DOCUMENTOS_PAQUETE,
  TIMEOUT_LECTURA_PAQUETE_MS,
  type CargadorFuentesPaquete,
  type DisponibilidadFuentesPaquete,
  type FuentesPaqueteAsesor,
} from './paqueteAsesor/adaptador';

/** Cota por defecto de las lecturas del adaptador. */
const TIMEOUT = TIMEOUT_LECTURA_PAQUETE_MS;

function leerUnaVez<T>(
  suscribir: (cb: (valor: T) => void, onError?: (e: Error) => void) => () => void,
  etiqueta: string,
  timeoutMs = TIMEOUT,
): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    let fin = false;
    const terminar = (fn: () => void): void => {
      if (fin) return;
      fin = true;
      clearTimeout(temporizador);
      queueMicrotask(() => { try { off(); } catch { /* noop */ } });
      fn();
    };
    const off = suscribir(
      (valor) => terminar(() => resolver(valor)),
      (e) => terminar(() => rechazar(e)),
    );
    const temporizador = setTimeout(() => {
      terminar(() => rechazar(new Error(
        `lectura de ${etiqueta} sin respuesta en ${timeoutMs} ms (posible denegación de Rules)`,
      )));
    }, timeoutMs);
    if (typeof (temporizador as unknown as { unref?: () => void }).unref === 'function') {
      (temporizador as unknown as { unref: () => void }).unref();
    }
  });
}

/** Primera emisión de un suscriptor; si Rules deniega, cota y falla. */
function suscripcionUnica<T>(
  suscribir: (cb: (valor: T) => void) => () => void,
  etiqueta: string,
  timeoutMs = TIMEOUT,
): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    let fin = false;
    const terminar = (fn: () => void): void => {
      if (fin) return;
      fin = true;
      clearTimeout(temporizador);
      queueMicrotask(() => { try { off(); } catch { /* noop */ } });
      fn();
    };
    const off = suscribir((valor) => terminar(() => resolver(valor)));
    const temporizador = setTimeout(() => {
      terminar(() => rechazar(new Error(
        `lectura de ${etiqueta} sin respuesta en ${timeoutMs} ms (posible denegación de Rules)`,
      )));
    }, timeoutMs);
    if (typeof (temporizador as unknown as { unref?: () => void }).unref === 'function') {
      (temporizador as unknown as { unref: () => void }).unref();
    }
  });
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : 'error de lectura';
}

/** Cargador real: suscriptores existentes + lecturas P3 (solo lectura). */
export function crearCargadorFirebase(timeoutMs = TIMEOUT): CargadorFuentesPaquete {
  return {
    catalogo: (scope) => cargarFuentesCatalogo(scope, timeoutMs),
    async facturas(usuario, scope) {
      if (!esUsuarioMaster(usuario) && usuario.tipoPerfil !== 'PROPIETARIO') {
        return { datos: undefined, motivo: MOTIVO_SOLO_TITULAR };
      }
      try {
        // Master: `list` global permitido por Rules. Titular: la consulta se
        // acota por `propietarioId` (una consulta sin filtro sería denegada).
        const lista = esUsuarioMaster(usuario)
          ? await suscripcionUnica<Factura[]>((cb) => subscribeFacturas(cb), 'facturas', timeoutMs)
          : await suscripcionUnica<Factura[]>(
            (cb) => subscribeColeccionPorAmbito<Factura>(
              FACTURAS_COL, cb, scope, 'facturas', { campo: 'propietarioId' },
            ),
            'facturas',
            timeoutMs,
          );
        return { datos: lista, motivo: null };
      } catch (e) {
        return { datos: undefined, motivo: `No se pudieron leer las facturas (${mensaje(e)}); el paquete se genera sin ellas y lo declara.` };
      }
    },
    async liquidaciones(usuario) {
      if (!esUsuarioMaster(usuario) && usuario.tipoPerfil !== 'PROPIETARIO') {
        return { datos: undefined, motivo: MOTIVO_SOLO_TITULAR };
      }
      try {
        const lista = await suscripcionUnica<LiquidacionPropietario[]>(
          (cb) => subscribeLiquidaciones(cb, usuario), 'liquidaciones', timeoutMs,
        );
        return { datos: lista, motivo: null };
      } catch (e) {
        return { datos: undefined, motivo: `No se pudieron leer las liquidaciones (${mensaje(e)}); el paquete se genera sin ellas y lo declara.` };
      }
    },
    async polizas(scope) {
      try {
        const datos = await leerUnaVez<PolizaSeguro[]>((cb) => subscribePolizas(cb, scope), 'pólizas', timeoutMs);
        return { datos, motivo: null } as ResultadoCarga<PolizaSeguro[]>;
      } catch (e) {
        return { datos: undefined, motivo: `No se pudieron leer las pólizas (${mensaje(e)}); el paquete se genera sin ellas y lo declara.` };
      }
    },
    async titularidades(inmuebles) {
      const conIndice = inmuebles.filter((i) => (i.titularesIds ?? []).length > 0);
      if (conIndice.length === 0) return { datos: [], motivo: null };
      try {
        const datos = await leerUnaVez<Titularidad[]>(
          (cb) => subscribeTitularidadesEscopo({ inmuebles: conIndice }, cb),
          'titularidades',
          timeoutMs,
        );
        return { datos, motivo: null };
      } catch (e) {
        return { datos: undefined, motivo: `No se pudieron leer las titularidades (${mensaje(e)}); no se reconstruyen por suposición.` };
      }
    },
    documentos(inmuebleId) {
      return leerUnaVez<DocumentoPatrimonial[]>(
        (cb, onError) => subscribeDocumentosPatrimoniales(inmuebleId, cb, onError),
        `documentos de ${inmuebleId}`,
        timeoutMs,
      );
    },
  };
}

/** Carga real (Firebase) de las fuentes del paquete. */
export function cargarFuentesPaqueteAsesor(
  usuario: UsuarioApp,
  scope: DataAccessScope | undefined,
  opciones: { timeoutMs?: number; maxInmueblesDocumentos?: number; cargador?: CargadorFuentesPaquete } = {},
): Promise<FuentesPaqueteAsesor> {
  const cargador = opciones.cargador ?? crearCargadorFirebase(opciones.timeoutMs);
  return cargarFuentesCon(cargador, usuario, scope, opciones);
}

/** Lectura de un original desde Storage con la sesión del usuario (sin URLs). */
export async function leerBinarioStorage(ruta: string): Promise<Uint8Array> {
  const bytes = await getBytes(ref(storage, ruta));
  return new Uint8Array(bytes);
}

/** Empaqueta con los binarios que Storage autorice (los fallos se declaran). */
export function empaquetarConBinariosStorage(
  paquete: PaqueteAsesorGenerado,
  fuentes: Pick<FuentesPaqueteAsesor, 'rutasStorageDocumentos'>,
  incluirBinarios: boolean,
): Promise<{ resultado: ResultadoEmpaquetadoAsesor; avisos: string[] }> {
  return empaquetarConBinarios(paquete, {
    rutas: fuentes.rutasStorageDocumentos,
    incluirBinarios: incluirBinarios && auth.currentUser !== null,
    leer: leerBinarioStorage,
  });
}

/** Atajo completo: carga → vista previa → binarios → ZIP verificado. */
export async function generarPaqueteAsesorFirebase(opciones: {
  usuario: UsuarioApp;
  scope?: DataAccessScope;
  autorizado: AmbitoAutorizado;
  solicitud: SolicitudPaqueteAsesor;
  generatedAt: string;
  generatedBy?: string | null;
  incluirBinarios?: boolean;
  fuentes?: FuentesPaqueteAsesor;
  timeoutMs?: number;
  maxInmueblesDocumentos?: number;
}): Promise<{
  paquete: PaqueteAsesorGenerado;
  resultado: ResultadoEmpaquetadoAsesor;
  fuentes: FuentesPaqueteAsesor;
  avisos: string[];
}> {
  const fuentes = opciones.fuentes ?? await cargarFuentesPaqueteAsesor(opciones.usuario, opciones.scope, {
    ...(opciones.timeoutMs !== undefined ? { timeoutMs: opciones.timeoutMs } : {}),
    ...(opciones.maxInmueblesDocumentos !== undefined ? { maxInmueblesDocumentos: opciones.maxInmueblesDocumentos } : {}),
  });
  const paquete = vistaPreviaPaqueteAsesor(fuentes, opciones.solicitud, opciones.autorizado, {
    generatedAt: opciones.generatedAt,
    ...(opciones.generatedBy !== undefined ? { generatedBy: opciones.generatedBy } : {}),
  });
  const { resultado, avisos } = await empaquetarConBinariosStorage(paquete, fuentes, opciones.incluirBinarios === true);
  return { paquete, resultado, fuentes, avisos: [...fuentes.avisos, ...avisos] };
}
