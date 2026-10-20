/**
 * P6 — ORQUESTACIÓN PURA ENTRE EL MOTOR Y LAS FUENTES YA CARGADAS.
 *
 * Este módulo NO importa Firebase, no lee Storage y no escribe nada: recibe un
 * `CargadorFuentesPaquete` (implementado en `../paqueteAsesorFirebase.ts`) y un
 * lector de binarios inyectado. Así el reparto completo (vista previa →
 * empaquetado → verificación) es comprobable con dobles y el adaptador real
 * queda reducido a I/O de solo lectura.
 *
 * Reglas del reparto:
 *  · Una fuente no legible NO bloquea el paquete: se declara su ausencia y se
 *    sigue (fail-open en datos, fail-closed en permisos: nunca se consulta sin
 *    ámbito ni se rellena por suposición).
 *  · La vista previa no toca binarios: las incidencias se enseñan antes.
 *  · Los documentos se resuelven uno a uno: un fallo se declara, no tumba el ZIP.
 */
import type { ContratoFormalizacion, Gasto, Inmueble, PolizaSeguro, Propietario, Titularidad, UsuarioApp } from '../../types';
import type { Factura } from '../../types/facturacion';
import type { LiquidacionPropietario } from '../../tesoreria/tipos';
import type { DocumentoPatrimonial } from '../expedienteDocumental/tipos';
import type { DataAccessScope } from '../firebase';
import type { FuentesCatalogo } from '../importExportFirebase';
import type { AmbitoAutorizado } from '../importExport/contrato';
import type {
  DocumentoIndicePaquete,
  DocumentoOriginalPaquete,
  EntradaPaqueteAsesor,
  FalloBinarioPaquete,
  PaqueteAsesorGenerado,
  ResultadoEmpaquetadoAsesor,
  SolicitudPaqueteAsesor,
} from './tipos';
import { empaquetarPaqueteAsesor, generarPaqueteAsesor } from './motor';
import { resolverBinariosDocumentos } from './documentos';

/** Cota por defecto de la espera de una lectura (los suscriptores no avisan de Rules). */
export const TIMEOUT_LECTURA_PAQUETE_MS = 20_000;
/** Tope de inmuebles cuyos documentos se consultan (lecturas puntuales P3). */
export const MAX_INMUEBLES_DOCUMENTOS_PAQUETE = 120;

const MOTIVO_SOLO_TITULAR =
  'Las reglas solo permiten listar esta colección al titular o al administrador principal; '
  + 'el paquete se genera sin ella y la ausencia queda declarada.';

export type ResultadoCarga<T> =
  | { datos: T; motivo: null }
  | { datos: undefined; motivo: string };

/** Motivo legible por el que una fuente no está disponible para este perfil. */
export interface DisponibilidadFuentesPaquete {
  facturas: string | null;
  liquidaciones: string | null;
  polizas: string | null;
  titularidades: string | null;
  documentos: string | null;
}

export interface FuentesPaqueteAsesor {
  entrada: EntradaPaqueteAsesor;
  propietarios: Propietario[];
  inmuebles: Inmueble[];
  disponibilidad: DisponibilidadFuentesPaquete;
  /** documentoId → storagePath. Solo en memoria; jamás se serializa en el ZIP. */
  rutasStorageDocumentos: ReadonlyMap<string, string>;
  /** Avisos de disponibilidad (para la vista previa). */
  avisos: string[];
}

/** Puerto de carga: la implementación real vive en `../paqueteAsesorFirebase.ts`. */
export interface CargadorFuentesPaquete {
  catalogo(scope: DataAccessScope | undefined): Promise<FuentesCatalogo>;
  facturas(usuario: UsuarioApp, scope: DataAccessScope | undefined): Promise<ResultadoCarga<Factura[]>>;
  liquidaciones(usuario: UsuarioApp): Promise<ResultadoCarga<LiquidacionPropietario[]>>;
  polizas(scope: DataAccessScope | undefined): Promise<ResultadoCarga<PolizaSeguro[]>>;
  titularidades(inmuebles: readonly Inmueble[]): Promise<ResultadoCarga<Titularidad[]>>;
  documentos(inmuebleId: string): Promise<DocumentoPatrimonial[]>;
}

function mensaje(e: unknown): string {
  return e instanceof Error ? e.message : 'error de lectura';
}

/**
 * Carga las fuentes del paquete y las estructura para el motor. No escribe
 * nada. Sin identidad no se llama: la UI lo bloquea antes (fail-closed).
 */
export async function cargarFuentesCon(
  cargador: CargadorFuentesPaquete,
  usuario: UsuarioApp,
  scope: DataAccessScope | undefined,
  opciones: { maxInmueblesDocumentos?: number } = {},
): Promise<FuentesPaqueteAsesor> {
  const maxInmuebles = opciones.maxInmueblesDocumentos ?? MAX_INMUEBLES_DOCUMENTOS_PAQUETE;
  const disponibilidad: DisponibilidadFuentesPaquete = {
    facturas: null, liquidaciones: null, polizas: null, titularidades: null, documentos: null,
  };
  const avisos: string[] = [];

  const catalogo = await cargador.catalogo(scope);
  const [facturas, liquidaciones, polizas, titularidades] = await Promise.all([
    cargador.facturas(usuario, scope),
    cargador.liquidaciones(usuario),
    cargador.polizas(scope),
    cargador.titularidades(catalogo.inmuebles),
  ]);
  disponibilidad.facturas = facturas.motivo;
  disponibilidad.liquidaciones = liquidaciones.motivo;
  disponibilidad.polizas = polizas.motivo;
  disponibilidad.titularidades = titularidades.motivo;

  // Documentos P3: metadatos por inmueble, en lotes de 5 y con tope. Lo que no
  // se consulta se declara; no se simula.
  const documentosPatrimoniales: DocumentoPatrimonial[] = [];
  const rutas = new Map<string, string>();
  const inmueblesDocumentos = catalogo.inmuebles.slice(0, maxInmuebles);
  if (catalogo.inmuebles.length > maxInmuebles) {
    disponibilidad.documentos = `Solo se consultaron documentos de ${maxInmuebles} de ${catalogo.inmuebles.length} inmuebles (tope de lecturas); el resto no se incluye ni se simula.`;
  }
  const fallosDocumentos: string[] = [];
  for (let i = 0; i < inmueblesDocumentos.length; i += 5) {
    const lote = inmueblesDocumentos.slice(i, i + 5);
    const resultados = await Promise.all(lote.map(async (inmueble) => {
      try {
        return { documentos: await cargador.documentos(inmueble.id) };
      } catch (e) {
        return { error: `${inmueble.id}: ${mensaje(e)}` };
      }
    }));
    for (const r of resultados) {
      if ('error' in r) fallosDocumentos.push(r.error);
      else documentosPatrimoniales.push(...r.documentos);
    }
  }
  if (fallosDocumentos.length > 0) {
    const motivo = `No se pudieron leer documentos de ${fallosDocumentos.length} inmueble(s): ${fallosDocumentos.slice(0, 3).join(' | ')}${fallosDocumentos.length > 3 ? '…' : ''}`;
    disponibilidad.documentos = disponibilidad.documentos ? `${disponibilidad.documentos} ${motivo}` : motivo;
  }
  for (const documento of documentosPatrimoniales) {
    if (typeof documento.storagePath === 'string' && documento.storagePath !== '') {
      rutas.set(documento.id, documento.storagePath);
    }
  }
  for (const motivo of Object.values(disponibilidad)) {
    if (motivo !== null) avisos.push(motivo);
  }

  const entrada: EntradaPaqueteAsesor = {
    inmuebles: catalogo.inmuebles,
    contratos: catalogo.contratos,
    gastos: catalogo.gastos,
    ...(facturas.datos !== undefined ? { facturas: facturas.datos } : {}),
    ...(liquidaciones.datos !== undefined ? { liquidaciones: liquidaciones.datos } : {}),
    ...(polizas.datos !== undefined ? { polizas: polizas.datos } : {}),
    ...(titularidades.datos !== undefined ? { titularidades: titularidades.datos } : {}),
    documentosPatrimoniales,
  };

  return {
    entrada,
    propietarios: catalogo.propietarios,
    inmuebles: catalogo.inmuebles,
    disponibilidad,
    rutasStorageDocumentos: rutas,
    avisos,
  };
}

/** Vista previa: genera el paquete TIPADO sin leer ningún binario. */
export function vistaPreviaPaqueteAsesor(
  fuentes: Pick<FuentesPaqueteAsesor, 'entrada'>,
  solicitud: SolicitudPaqueteAsesor,
  autorizado: AmbitoAutorizado,
  opciones: { generatedAt: string; generatedBy?: string | null },
): PaqueteAsesorGenerado {
  return generarPaqueteAsesor(fuentes.entrada, solicitud, autorizado, {
    generatedAt: opciones.generatedAt,
    ...(opciones.generatedBy !== undefined ? { generatedBy: opciones.generatedBy } : {}),
  });
}

/** Lector de binarios con la ruta YA resuelta por el índice (inyectado). */
export function crearLectorBinariosPaquete(
  rutas: ReadonlyMap<string, string>,
  leer: (ruta: string) => Promise<Uint8Array>,
): (documento: DocumentoIndicePaquete) => Promise<Uint8Array> {
  return async (documento) => {
    const ruta = rutas.get(documento.documentoId);
    if (!ruta) {
      const error = new Error('documento sin ruta de Storage registrada');
      (error as unknown as { code?: string }).code = 'storage/object-not-found';
      throw error;
    }
    return leer(ruta);
  };
}

/**
 * Resuelve y empaqueta. Los documentos no legibles NO bloquean el paquete:
 * quedan declarados en el índice y en las advertencias del informe.
 */
export async function empaquetarConBinarios(
  paquete: PaqueteAsesorGenerado,
  opciones: {
    rutas: ReadonlyMap<string, string>;
    incluirBinarios: boolean;
    leer: (ruta: string) => Promise<Uint8Array>;
    maxBytesPorDocumento?: number;
    maxBytesTotal?: number;
  },
): Promise<{ resultado: ResultadoEmpaquetadoAsesor; avisos: string[] }> {
  let binarios: DocumentoOriginalPaquete[] = [];
  let fallos: FalloBinarioPaquete[] = [];
  const avisos: string[] = [];
  if (opciones.incluirBinarios) {
    const resuelto = await resolverBinariosDocumentos(
      paquete.documentos,
      crearLectorBinariosPaquete(opciones.rutas, opciones.leer),
      {
        ...(opciones.maxBytesPorDocumento !== undefined ? { maxBytesPorDocumento: opciones.maxBytesPorDocumento } : {}),
        ...(opciones.maxBytesTotal !== undefined ? { maxBytesTotal: opciones.maxBytesTotal } : {}),
      },
    );
    binarios = resuelto.binarios;
    fallos = resuelto.fallos;
    avisos.push(...resuelto.avisos);
  }
  // Sin `incluirBinarios` no se pasan listas: los documentos quedan
  // PENDIENTE_BINARIO (no se intentó leerlos) en vez de NO_ACCESIBLE.
  const resultado = empaquetarPaqueteAsesor(paquete, opciones.incluirBinarios
    ? {
      documentosOriginales: binarios,
      fallosDocumentos: fallos,
      incluirIndiceDocumentos: paquete.documentos.length > 0,
    }
    : { incluirIndiceDocumentos: paquete.documentos.length > 0 });
  return { resultado, avisos };
}

export { MOTIVO_SOLO_TITULAR };
