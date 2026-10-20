import type { Gasto, Inmueble } from '../types';
import type { CamposFacturaOcr } from './ocrFactura';
import { claveFacturaOcr } from './ocrFactura';
import { sha256Hex } from '../utils/sha256';
import { categoriaDef, normalizarGasto } from '../utils/gastosEngine';
import type { DocumentoPatrimonial } from './expedienteDocumental/tipos';

export interface DatosConfirmadosFacturaOcr {
  inmuebleId: string;
  concepto: string;
  proveedor: string;
  importeTotal: number;
  categoria: Gasto['categoria'];
  aCargoDe: Gasto['aCargoDe'];
  fechaEmision?: string;
  numeroFactura?: string;
  nifProveedor?: string;
  baseImponible?: number;
  tipoIva?: number;
  importeIva?: number;
  otrosImpuestos?: number;
}

export function importeDesdeTexto(texto: string): number | undefined {
  const limpio = texto.replace(/[^\d,.-]/g, '');
  if (!limpio) return undefined;
  const coma = limpio.lastIndexOf(',');
  const punto = limpio.lastIndexOf('.');
  let normalizado: string;
  if (coma >= 0 && punto >= 0) {
    const decimal = coma > punto ? ',' : '.';
    normalizado = limpio.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  } else {
    const separador = coma >= 0 ? ',' : punto >= 0 ? '.' : '';
    const grupos = separador ? limpio.split(separador) : [];
    const miles = grupos.length > 1 && grupos[0].length >= 1 && grupos[0].length <= 3
      && grupos.slice(1).every((grupo) => /^\d{3}$/.test(grupo));
    if (miles) normalizado = grupos.join('');
    else if (coma >= 0) normalizado = limpio.replace(/\./g, '').replace(',', '.');
    else normalizado = limpio;
  }
  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : undefined;
}

export function construirClaveOcr(campos: CamposFacturaOcr, sha256: string, inmuebleId?: string): string {
  return claveFacturaOcr(campos, sha256, inmuebleId);
}

/** Quita el ámbito de inmueble de una clave P5.2 para obtener su forma legada P5. */
export function claveSinAmbitoInmueble(clave: string, inmuebleId?: string): string {
  if (!inmuebleId) return clave;
  for (const prefijo of ['factura:', 'documento:']) {
    const conAmbito = `${prefijo}${inmuebleId}:`;
    if (clave.startsWith(conAmbito)) return prefijo + clave.slice(conAmbito.length);
  }
  return clave;
}

const normalizarTextoDedupe = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES').replace(/[^a-z0-9]+/g, ' ').trim();

function formasNifNumero(ocr: NonNullable<Gasto['facturaOcr']>): [string, string][] {
  return [
    [ocr.nifProveedor || '', ocr.numeroFactura || ''],
    [ocr.camposReconocidos?.nifProveedor || '', ocr.camposReconocidos?.numeroFactura || ''],
    [ocr.camposConfirmados?.nifProveedor || '', ocr.camposConfirmados?.numeroFactura || ''],
  ];
}

function claveDesde(nif: string, numero: string, sha256: string, inmuebleId?: string): string {
  return claveFacturaOcr({
    nifProveedor: { valor: nif, estado: 'RECONOCIDO' },
    numeroFactura: { valor: numero, estado: 'RECONOCIDO' },
  } as Pick<CamposFacturaOcr, 'nifProveedor' | 'numeroFactura'>, sha256, inmuebleId);
}

/** ¿La clave/huella entrantes identifican la MISMA factura que este gasto OCR? (ámbito aparte) */
function mismaFacturaOcr(gasto: Gasto, claveLegada: string, sha256: string): boolean {
  const ocr = gasto.facturaOcr;
  if (!ocr) return false;
  if (ocr.sha256Documento && sha256 && ocr.sha256Documento === sha256) return true;
  if (claveSinAmbitoInmueble(ocr.claveDeduplicacion || '', gasto.inmuebleId) === claveLegada && claveLegada) return true;
  return formasNifNumero(ocr).some(([nif, numero]) => Boolean(nif && numero) && claveDesde(nif, numero, '') === claveLegada);
}

export interface EntradaDuplicadosOcr {
  /** Clave entrante (con ámbito de inmueble si se construyó así). */
  clave: string;
  sha256: string;
  inmuebleId: string;
  importeTotal?: number;
  fechaEmision?: string;
  proveedor?: string;
}

export interface EvaluacionDuplicadosOcr {
  /** Misma factura y mismo inmueble: bloquea un segundo alta. */
  exacto?: Gasto;
  /**
   * Coincidencias NO concluyentes para revisar (gasto manual del mismo
   * inmueble con importe/fecha/proveedor coincidentes, o la misma factura
   * en OTRO inmueble). Nunca bloquean ni modifican esos registros.
   */
  posibles: Gasto[];
}

/**
 * Detección de duplicados delimitada por inmueble (P5.2-C):
 * - `exacto` solo dentro del MISMO inmueble y solo para gastos OCR con la
 *   misma huella o el mismo emisor+número (claves P5.2 y legadas P5).
 * - Los gastos MANUALES no guardan huella ni número de factura, así que solo
 *   pueden ser `posibles` (aviso para revisión humana) cuando coinciden
 *   inmueble + importe + fecha + proveedor y tienen justificante/documento.
 * - La misma factura en otro inmueble ya NO bloquea el alta: es `posible`.
 */
export function evaluarDuplicadosFacturaOcr(gastos: Gasto[], entrada: EntradaDuplicadosOcr): EvaluacionDuplicadosOcr {
  const claveLegada = claveSinAmbitoInmueble(entrada.clave, entrada.inmuebleId);
  let exacto: Gasto | undefined;
  const posibles: Gasto[] = [];
  const proveedorEntrada = normalizarTextoDedupe(entrada.proveedor || '');
  for (const gasto of gastos) {
    if (gasto.estado === 'ANULADO') continue;
    if (gasto.facturaOcr) {
      if (!mismaFacturaOcr(gasto, claveLegada, entrada.sha256)) continue;
      if (gasto.inmuebleId === entrada.inmuebleId) {
        // El duplicado exacto también casa por clave con ámbito: se cubre
        // porque mismaFacturaOcr compara en forma legada y por huella.
        exacto ||= gasto;
      } else {
        posibles.push(gasto);
      }
      continue;
    }
    // Gasto manual: solo puede ser coincidencia dudosa del mismo inmueble.
    if (gasto.inmuebleId !== entrada.inmuebleId) continue;
    const tieneSoporte = Boolean(gasto.justificanteUrl || gasto.justificantePath || gasto.documento?.id || gasto.documentos?.length);
    if (!tieneSoporte) continue;
    if (entrada.importeTotal === undefined || Math.round((Number(gasto.importe) || 0) * 100) !== Math.round(entrada.importeTotal * 100)) continue;
    const fechaGasto = gasto.fechaDevengo || gasto.fecha;
    if (entrada.fechaEmision && fechaGasto !== entrada.fechaEmision) continue;
    if (!proveedorEntrada || !gasto.proveedor) continue;
    const proveedorGasto = normalizarTextoDedupe(gasto.proveedor);
    if (!proveedorGasto || !(proveedorGasto.includes(proveedorEntrada) || proveedorEntrada.includes(proveedorGasto))) continue;
    posibles.push(gasto);
  }
  return { exacto, posibles };
}

/**
 * Compatibilidad P5: sin `inmuebleId` busca en cualquier inmueble (semántica
 * original); con `inmuebleId` devuelve solo el duplicado exacto de ese
 * inmueble (semántica P5.2). Los llamantes de UI usan la forma con inmueble
 * o, preferentemente, `evaluarDuplicadosFacturaOcr`.
 */
export function duplicadoFacturaOcr(gastos: Gasto[], clave: string, sha256: string, inmuebleId?: string): Gasto | undefined {
  if (inmuebleId) {
    return evaluarDuplicadosFacturaOcr(gastos, { clave, sha256, inmuebleId }).exacto;
  }
  const [, nifEntrada, numeroEntrada] = clave.split(':');
  return gastos.find((g) => {
    const ocr = g.facturaOcr;
    if (!ocr) return false;
    if (ocr.claveDeduplicacion === clave || ocr.sha256Documento === sha256) return true;
    if (!nifEntrada || !numeroEntrada) return false;
    const formas = [
      [ocr.nifProveedor, ocr.numeroFactura],
      [ocr.camposReconocidos.nifProveedor, ocr.camposReconocidos.numeroFactura],
      [ocr.camposConfirmados.nifProveedor, ocr.camposConfirmados.numeroFactura],
    ];
    return formas.some(([nif, numero]) => claveFacturaOcr({
      nifProveedor: { valor: nif || '', estado: 'RECONOCIDO' },
      numeroFactura: { valor: numero || '', estado: 'RECONOCIDO' },
    } as Pick<CamposFacturaOcr, 'nifProveedor' | 'numeroFactura'>, '') === clave);
  });
}

export function idGastoOcr(clave: string): string {
  return `gas_ocr_${sha256Hex(clave).slice(0, 40)}`;
}

/**
 * ¿Es este gasto un alta OCR incompleta de la misma factura que puede
 * completarse reintentando (sin documento enlazado y con el ID estable,
 * en su forma P5.2 o legada P5)? Solo en ese caso la re-confirmación
 * reutiliza el registro; un duplicado completo nunca se sobrescribe.
 */
export function esReintentoVinculoOcr(gasto: Gasto | undefined, clave: string, claveLegada?: string): boolean {
  if (!gasto || !clave) return false;
  if (gasto.facturaOcr?.documentoId || gasto.documento?.id) return false;
  // El llamante pasa el duplicado EXACTO (misma factura/inmueble ya
  // establecidos por huella o emisor+número): basta que su ID estable
  // derive de la clave entrante, de su forma legada o de la clave que el
  // propio gasto almacenó al crearse (reintento tras corregir campos).
  const claveAlmacenada = gasto.facturaOcr?.claveDeduplicacion;
  return gasto.id === idGastoOcr(clave)
    || (claveLegada ? gasto.id === idGastoOcr(claveLegada) : false)
    || (claveAlmacenada ? gasto.id === idGastoOcr(claveAlmacenada) : false);
}

/**
 * Confirma un alta OCR en tres etapas NO atómicas (P5.2-A: la arquitectura
 * no ofrece transacción gasto+documento ni rollback garantizado, y esta
 * función no los promete). Contratos exigidos a los adaptadores:
 * `guardarGasto` DEBE lanzar si la escritura no se confirma y
 * `eliminarGasto` DEBE lanzar si el borrado es denegado; con adaptadores
 * que tragan errores no hay garantía ninguna (defecto D-01 corregido en
 * el cableado de la UI con la persistencia verificada).
 *
 * Recuperación ante fallo de custodia: se intenta borrar el gasto; si el
 * borrado no es posible (p. ej. un gestor con cartera de escritura pero
 * sin permiso de borrado en las reglas actuales), se ANULA el gasto con
 * nota de trazabilidad para que no tenga efecto económico; si tampoco se
 * puede anular, el error ordena revisión manual e identifica el gasto.
 * El mensaje final describe el estado real alcanzado en cada caso.
 */
export async function confirmarGastoConFactura(input: {
  gasto: Gasto;
  guardarGasto: (gasto: Gasto) => Promise<Gasto | void> | Gasto | void;
  subirDocumento: (gasto: Gasto) => Promise<DocumentoPatrimonial>;
  eliminarGasto: (gastoId: string) => Promise<void> | void;
}): Promise<Gasto> {
  // Etapa 1 · guardar el gasto. Si el adaptador verificado lanza, no se da
  // por creado nada y no se intenta custodiar un documento huérfano.
  let guardado: Gasto;
  try {
    guardado = (await input.guardarGasto(input.gasto)) || input.gasto;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'error desconocido';
    throw new Error(`No se pudo guardar el gasto; no se ha creado ni se ha subido el documento. Motivo: ${motivo}`);
  }

  // Etapa 2 · custodiar el original (P3 fail-closed). Un documento que no
  // vuelve DISPONIBLE se trata como fallo de custodia, no como éxito.
  let documento: DocumentoPatrimonial;
  try {
    documento = await input.subirDocumento(guardado);
    if (typeof documento.estado === 'string' && documento.estado !== 'DISPONIBLE') {
      throw new Error(`La custodia no confirmó el documento como disponible (estado: ${documento.estado}).`);
    }
  } catch (errorCustodia) {
    const motivo = errorCustodia instanceof Error ? errorCustodia.message : 'error desconocido';
    try {
      await input.eliminarGasto(guardado.id);
    } catch {
      // Sin borrado garantizado: neutralizar ANULANDO (la actualización sí
      // está al alcance de propietario y cartera de escritura).
      try {
        const nota = `Alta OCR anulada automáticamente: no se pudo custodiar el documento (${motivo}). Reprocesar la factura para darla de alta correctamente.`;
        await input.guardarGasto(normalizarGasto({
          ...guardado,
          estado: 'ANULADO',
          notas: guardado.notas ? `${guardado.notas} ${nota}` : nota,
        }));
      } catch {
        throw new Error(`No se pudo custodiar el documento ni revertir el gasto ${guardado.id}. El gasto puede haber quedado pendiente SIN factura enlazada: revísalo o elimínalo manualmente antes de reintentar. Motivo de custodia: ${motivo}`);
      }
      throw new Error(`No se pudo custodiar el documento. El gasto creado (${guardado.id}) se ha ANULADO para que no tenga efecto económico; vuelve a procesar la factura para darla de alta correctamente. Motivo: ${motivo}`);
    }
    throw errorCustodia;
  }

  // Etapa 3 · enlace cruzado gasto↔documento. Si falla, gasto y documento
  // existen verificados: se informa sin fingir éxito y el reintento con la
  // misma factura completa el enlace (ID estable, sin segundo gasto).
  const actualizado: Gasto = {
    ...guardado,
    documento: { id: documento.id, nombre: documento.nombre, url: '', storagePath: documento.storagePath },
    documentos: [{ id: documento.id, nombre: documento.nombre, url: '', storagePath: documento.storagePath }],
    facturaOcr: { ...guardado.facturaOcr!, documentoId: documento.id },
  };
  const enlazado = normalizarGasto(actualizado);
  try {
    await input.guardarGasto(enlazado);
  } catch {
    throw new Error('El gasto y el documento original ya están guardados, pero no se completó su referencia cruzada. Reprocesa esta misma factura para terminar el enlace; el ID estable evita crear otro gasto.');
  }
  return enlazado;
}

export function construirGastoOcr(input: {
  datos: DatosConfirmadosFacturaOcr;
  camposReconocidos: CamposFacturaOcr;
  confianzaOcr: number;
  sha256Documento: string;
  claveDeduplicacion: string;
  inmueble: Inmueble;
  creadoPor?: string;
  creadoPorId?: string;
  fechaProceso?: string;
}): Gasto {
  const { datos, camposReconocidos, inmueble } = input;
  const now = input.fechaProceso || new Date().toISOString();
  const categoria = datos.categoria;
  return {
    id: idGastoOcr(input.claveDeduplicacion),
    inmuebleId: inmueble.id,
    propietarioId: inmueble.propietarioId || inmueble.propietarioPrincipalId || '',
    tipo: categoriaDef(categoria).tipo,
    categoria,
    concepto: datos.concepto.trim(),
    proveedor: datos.proveedor.trim() || undefined,
    importe: datos.importeTotal,
    estado: 'PENDIENTE',
    fechaDevengo: datos.fechaEmision,
    periodoMesAnio: datos.fechaEmision?.slice(0, 7),
    aCargoDe: datos.aCargoDe,
    deducible: false,
    origen: 'FACTURA',
    facturaOcr: {
      version: 1,
      sha256Documento: input.sha256Documento,
      claveDeduplicacion: input.claveDeduplicacion,
      procesadoEl: now,
      confianzaOcr: input.confianzaOcr,
      camposReconocidos: Object.fromEntries(Object.entries(camposReconocidos).filter(([, field]) => field.valor).map(([key, field]) => [key, field.valor])),
      camposConfirmados: Object.fromEntries(Object.entries(datos).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])),
      nifProveedor: datos.nifProveedor || undefined,
      numeroFactura: datos.numeroFactura || undefined,
      baseImponible: datos.baseImponible,
      tipoIva: datos.tipoIva,
      importeIva: datos.importeIva,
      otrosImpuestos: datos.otrosImpuestos,
    },
    creadoPor: input.creadoPor,
    creadoPorId: input.creadoPorId,
    createdAt: now,
    updatedAt: now,
  };
}
