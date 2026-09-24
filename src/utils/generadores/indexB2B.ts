/**
 * GAP 8 — Despachador de formatos de factura electrónica B2B.
 * Selección de sintaxis EN 16931: CII, UBL 2.1, Facturae 3.2.2 implementadas.
 * EDIFACT: PREPARADO-PENDIENTE-ESPECIFICACIÓN (adaptador previsto; sin esquema propio).
 */

import { FacturaElectronicaB2B, FormatoFacturaElectronica } from '../../types/facturaElectronicaB2B';
import { generarCii } from './ciiB2BGenerator';
import { generarUbl } from './ublB2BGenerator';
import { generarFacturae } from './facturaeB2BGenerator';

export interface DocumentoB2B {
  formato: FormatoFacturaElectronica;
  contenido: string; // XML determinista
  tipoMime: string;
  extension: string;
  nombreFichero: string;
}

export function generarDocumentoB2B(feb: FacturaElectronicaB2B): DocumentoB2B {
  let contenido: string;
  let tipoMime: string;
  let extension: string;

  switch (feb.formato) {
    case 'CII':
      contenido = generarCii(feb);
      tipoMime = 'application/xml';
      extension = 'xml';
      break;
    case 'UBL_2_1':
      contenido = generarUbl(feb);
      tipoMime = 'application/xml';
      extension = 'xml';
      break;
    case 'FACTURAE_3_2':
      contenido = generarFacturae(feb);
      tipoMime = 'application/xml';
      extension = 'xml';
      break;
    case 'EDIFACT':
    default:
      throw new Error(
        'EDIFACT: sintaxis admitida por la normativa pero PENDIENTE DE ESPECIFICACIÓN/ADAPTADOR en esta solución. No se genera contenido inventado.'
      );
  }

  const nombreFichero = `${feb.numeroCompleto.replace(/[^A-Za-z0-9_-]+/g, '_')}_${feb.formato}.${extension}`;
  return { formato: feb.formato, contenido, tipoMime, extension, nombreFichero };
}

/** Lista de formatos y su estado real (para UI y documentación). */
export function estadoFormatosB2B(): Array<{ formato: FormatoFacturaElectronica; estado: 'IMPLEMENTADO' | 'PREPARADO-PENDIENTE-SERVICIO' | 'PENDIENTE-ESPECIFICACION' }> {
  return [
    { formato: 'CII', estado: 'IMPLEMENTADO' },
    { formato: 'UBL_2_1', estado: 'IMPLEMENTADO' },
    { formato: 'FACTURAE_3_2', estado: 'IMPLEMENTADO' },
    { formato: 'EDIFACT', estado: 'PENDIENTE-ESPECIFICACION' },
  ];
}
