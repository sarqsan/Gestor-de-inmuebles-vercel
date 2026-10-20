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

export function construirClaveOcr(campos: CamposFacturaOcr, sha256: string): string {
  return claveFacturaOcr(campos, sha256);
}

export function duplicadoFacturaOcr(gastos: Gasto[], clave: string, sha256: string): Gasto | undefined {
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

export async function confirmarGastoConFactura(input: {
  gasto: Gasto;
  guardarGasto: (gasto: Gasto) => Promise<Gasto | void> | Gasto | void;
  subirDocumento: (gasto: Gasto) => Promise<DocumentoPatrimonial>;
  eliminarGasto: (gastoId: string) => Promise<void> | void;
}): Promise<Gasto> {
  const guardado = (await input.guardarGasto(input.gasto)) || input.gasto;
  let documento: DocumentoPatrimonial;
  try {
    documento = await input.subirDocumento(guardado);
  } catch (error) {
    try { await input.eliminarGasto(guardado.id); }
    catch { throw new Error('No se pudo guardar el documento ni revertir el gasto. Revisa el gasto antes de volver a intentarlo.'); }
    throw error;
  }
  const actualizado: Gasto = {
    ...guardado,
    documento: { id: documento.id, nombre: documento.nombre, url: '', storagePath: documento.storagePath },
    documentos: [{ id: documento.id, nombre: documento.nombre, url: '', storagePath: documento.storagePath }],
    facturaOcr: { ...guardado.facturaOcr!, documentoId: documento.id },
  };
  // Si esta segunda escritura falla, el gasto y el documento ya existen. No
  // se deshace el gasto: el usuario puede reintentar la vinculación idempotente.
  try {
    await input.guardarGasto(normalizarGasto(actualizado));
  } catch {
    throw new Error('El gasto y el documento original ya están guardados, pero no se completó su referencia cruzada. Reprocesa esta misma factura para terminar el enlace; el ID estable evita crear otro gasto.');
  }
  return actualizado;
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
