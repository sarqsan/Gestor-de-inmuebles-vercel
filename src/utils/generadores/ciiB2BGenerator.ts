/**
 * GAP 8 — GENERADOR CII (UN/CEFACT Cross Industry Invoice, EN 16931 / D16B).
 * Sintaxis estándar europea priorizada para el intercambio B2B.
 *
 * - Generación DETERMINISTA: mismos datos → mismo documento byte a byte.
 * - NO se definen XSD propios: el mensaje sigue la estructura pública EN 16931
 *   (ramm:CrossIndustryInvoice / rsm:ExchangedDocumentContext / rsm:ExchangedDocument
 *   / rsm:SupplyChainTradeTransaction / ApplicableHeaderTradeAgreement / Delivery /
 *   Settlement / TradeLineItems).
 * - Si la autoridad publicara esquemas/validadores oficiales adicionales, se
 *   incorporarán como adaptador de validación sin alterar este generador.
 */

import { FacturaElectronicaB2B } from '../../types/facturaElectronicaB2B';
import {
  agruparPorTipoIva,
  categoriaIva,
  cantidadXml,
  fechaIso,
  importeXml,
  porcentajeXml,
  xmlEscape,
} from '../facturaElectronicaXml';

const NS = [
  'xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
  'xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
  'xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"',
].join(' ');

/** Genera el documento CII de una FacturaElectronicaB2B. Determinista. */
export function generarCii(feb: FacturaElectronicaB2B): string {
  const fecha = fechaIso(feb.fechaExpedicion);
  const grupos = agruparPorTipoIva(feb.lineas);

  const lineasXml = feb.lineas
    .map((l, i) => {
      const exenta = (l.tipoIva || 0) === 0 && l.cuotaIva === 0;
      const cat = categoriaIva(l.tipoIva, exenta);
      return [
        `    <ram:IncludedSupplyChainTradeLineItem>`,
        `      <ram:AssociatedDocumentLineDocument>`,
        `        <ram:LineID>${i + 1}</ram:LineID>`,
        `      </ram:AssociatedDocumentLineDocument>`,
        `      <ram:SpecifiedTradeProduct>`,
        `        <ram:Name>${xmlEscape(l.concepto)}</ram:Name>`,
        `      </ram:SpecifiedTradeProduct>`,
        `      <ram:SpecifiedLineTradeAgreement>`,
        `        <ram:NetPriceProductTradePrice>`,
        `          <ram:ChargeAmount>${importeXml(l.precioUnitario)}</ram:ChargeAmount>`,
        `        </ram:NetPriceProductTradePrice>`,
        `      </ram:SpecifiedLineTradeAgreement>`,
        `      <ram:SpecifiedLineTradeDelivery>`,
        `        <ram:BilledQuantity unitCode="C62">${cantidadXml(l.cantidad)}</ram:BilledQuantity>`,
        `      </ram:SpecifiedLineTradeDelivery>`,
        `      <ram:SpecifiedLineTradeSettlement>`,
        `        <ram:ApplicableTradeTax>`,
        `          <ram:TypeCode>VAT</ram:TypeCode>`,
        `          <ram:CategoryCode>${cat.codigo}</ram:CategoryCode>`,
        `          <ram:RateApplicablePercent>${porcentajeXml(l.tipoIva)}</ram:RateApplicablePercent>`,
        `        </ram:ApplicableTradeTax>`,
        `        <ram:SpecifiedTradeSettlementLineMonetarySummation>`,
        `          <ram:LineTotalAmount>${importeXml(l.baseImponible)}</ram:LineTotalAmount>`,
        `        </ram:SpecifiedTradeSettlementLineMonetarySummation>`,
        `      </ram:SpecifiedLineTradeSettlement>`,
        `    </ram:IncludedSupplyChainTradeLineItem>`,
      ].join('\n');
    })
    .join('\n');

  const impuestosXml = grupos
    .map((g) => {
      const cat = categoriaIva(g.tipoIva, g.exenta);
      return [
        `      <ram:ApplicableTradeTax>`,
        `        <ram:CalculatedAmount>${importeXml(g.cuota)}</ram:CalculatedAmount>`,
        `        <ram:TypeCode>VAT</ram:TypeCode>`,
        `        <ram:BasisAmount>${importeXml(g.base)}</ram:BasisAmount>`,
        `        <ram:CategoryCode>${cat.codigo}</ram:CategoryCode>`,
        `        <ram:RateApplicablePercent>${porcentajeXml(g.tipoIva)}</ram:RateApplicablePercent>`,
        `      </ram:ApplicableTradeTax>`,
      ].join('\n');
    })
    .join('\n');

  const partes = {
    emisor: bloqueParte(feb.emisor),
    receptor: bloqueParte(feb.receptor),
  };

  const pago = feb.informacionPago;
  const formaPagoCodigo = codigoMedioPago(feb);

  const doc = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rsm:CrossIndustryInvoice ${NS}>`,
    `  <rsm:ExchangedDocumentContext>`,
    `    <ram:GuidelineSpecifiedDocumentContextParameter>`,
    `      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>`,
    `    </ram:GuidelineSpecifiedDocumentContextParameter>`,
    `  </rsm:ExchangedDocumentContext>`,
    `  <rsm:ExchangedDocument>`,
    `    <ram:ID>${xmlEscape(feb.numeroCompleto)}</ram:ID>`,
    `    <ram:TypeCode>380</ram:TypeCode>`,
    `    <ram:IssueDateTime>`,
    `      <udt:DateTimeString format="102">${fecha.replace(/-/g, '')}</udt:DateTimeString>`,
    `    </ram:IssueDateTime>`,
    `  </rsm:ExchangedDocument>`,
    `  <rsm:SupplyChainTradeTransaction>`,
    lineasXml,
    `    <ram:ApplicableHeaderTradeAgreement>`,
    `      <ram:SellerTradeParty>`,
    partes.emisor,
    `      </ram:SellerTradeParty>`,
    `      <ram:BuyerTradeParty>`,
    partes.receptor,
    `      </ram:BuyerTradeParty>`,
    `    </ram:ApplicableHeaderTradeAgreement>`,
    `    <ram:ApplicableHeaderTradeDelivery>`,
    `      <ram:ActualDeliverySupplyChainEvent>`,
    `        <ram:OccurrenceDateTime>`,
    `          <udt:DateTimeString format="102">${(fechaIso(feb.fechaOperacion) || fecha).replace(/-/g, '')}</udt:DateTimeString>`,
    `        </ram:OccurrenceDateTime>`,
    `      </ram:ActualDeliverySupplyChainEvent>`,
    `    </ram:ApplicableHeaderTradeDelivery>`,
    `    <ram:ApplicableHeaderTradeSettlement>`,
    `      <ram:InvoiceCurrencyCode>${feb.moneda}</ram:InvoiceCurrencyCode>`,
    impuestosXml,
    `      <ram:SpecifiedTradeSettlementPaymentMeans>`,
    `        <ram:TypeCode>${formaPagoCodigo}</ram:TypeCode>`,
    pago?.iban ? `        <ram:PayeePartyCreditorFinancialAccount>\n          <ram:IBANID>${xmlEscape(pago.iban)}</ram:IBANID>\n        </ram:PayeePartyCreditorFinancialAccount>` : '',
    `      </ram:SpecifiedTradeSettlementPaymentMeans>`,
    `      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>`,
    `        <ram:LineTotalAmount>${importeXml(feb.baseImponible)}</ram:LineTotalAmount>`,
    `        <ram:TaxBasisTotalAmount>${importeXml(feb.baseImponible)}</ram:TaxBasisTotalAmount>`,
    `        <ram:TaxTotalAmount currencyID="${feb.moneda}">${importeXml(feb.cuotaIva)}</ram:TaxTotalAmount>`,
    `        <ram:GrandTotalAmount>${importeXml(feb.baseImponible + feb.cuotaIva)}</ram:GrandTotalAmount>`,
    `        <ram:DuePayableAmount>${importeXml(feb.importeTotal)}</ram:DuePayableAmount>`,
    `      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>`,
    `    </ram:ApplicableHeaderTradeSettlement>`,
    `  </rsm:SupplyChainTradeTransaction>`,
    `</rsm:CrossIndustryInvoice>`,
  ].filter(Boolean).join('\n');

  return doc;
}

function bloqueParte(p: FacturaElectronicaB2B['emisor']): string {
  const partes: string[] = [
    `        <ram:Name>${xmlEscape(p.nombreRazonSocial)}</ram:Name>`,
  ];
  if (p.direccion || p.municipio || p.codigoPostal || p.pais) {
    partes.push(`        <ram:PostalTradeAddress>`);
    if (p.direccion) partes.push(`          <ram:LineOne>${xmlEscape(p.direccion)}</ram:LineOne>`);
    if (p.municipio) partes.push(`          <ram:CityName>${xmlEscape(p.municipio)}</ram:CityName>`);
    if (p.codigoPostal) partes.push(`          <ram:PostcodeCode>${xmlEscape(p.codigoPostal)}</ram:PostcodeCode>`);
    if (p.pais) partes.push(`          <ram:CountryID>${xmlEscape(p.pais)}</ram:CountryID>`);
    partes.push(`        </ram:PostalTradeAddress>`);
  }
  partes.push(
    `        <ram:SpecifiedTaxRegistration>`,
    `          <ram:ID schemeID="VA">${xmlEscape(p.nif)}</ram:ID>`,
    `        </ram:SpecifiedTaxRegistration>`,
    `        <ram:SpecifiedTaxRegistration>`,
    `          <ram:ID schemeID="FC">${xmlEscape(p.nif)}</ram:ID>`,
    `        </ram:SpecifiedTaxRegistration>`
  );
  return partes.join('\n');
}

/** Código UN/ECE 4461 de medio de pago (determinista). */
function codigoMedioPago(feb: FacturaElectronicaB2B): string {
  switch (feb.informacionPago?.formaPago) {
    case 'transferencia': return '30';
    case 'domiciliacion': return '49';
    case 'efectivo': return '10';
    case 'bizum': return 'ZZZ';
    default: return '1';
  }
}
