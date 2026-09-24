/**
 * GAP 8 — GENERADOR UBL 2.1 (OASIS Invoice, EN 16931).
 * Además de ser sintaxis admitida para el intercambio, la COPIA FIEL a la
 * solución pública (SPFE) debe remitirse en sintaxis UBL según el RD 238/2026.
 * Generación determinista; sin XSD inventados.
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

export function generarUbl(feb: FacturaElectronicaB2B): string {
  const fecha = fechaIso(feb.fechaExpedicion);
  const grupos = agruparPorTipoIva(feb.lineas);

  const lineasXml = feb.lineas
    .map((l, i) => {
      const exenta = (l.tipoIva || 0) === 0 && l.cuotaIva === 0;
      const cat = categoriaIva(l.tipoIva, exenta);
      return [
        `  <cac:InvoiceLine>`,
        `    <cbc:ID>${i + 1}</cbc:ID>`,
        `    <cbc:InvoicedQuantity unitCode="C62">${cantidadXml(l.cantidad)}</cbc:InvoicedQuantity>`,
        `    <cbc:LineExtensionAmount currencyID="${feb.moneda}">${importeXml(l.baseImponible)}</cbc:LineExtensionAmount>`,
        `    <cac:Item>`,
        `      <cbc:Name>${xmlEscape(l.concepto)}</cbc:Name>`,
        `    </cac:Item>`,
        `    <cac:Price>`,
        `      <cbc:PriceAmount currencyID="${feb.moneda}">${importeXml(l.precioUnitario)}</cbc:PriceAmount>`,
        `    </cac:Price>`,
        `    <cac:TaxTotal>`,
        `      <cbc:TaxAmount currencyID="${feb.moneda}">${importeXml(l.cuotaIva)}</cbc:TaxAmount>`,
        `      <cac:TaxSubtotal>`,
        `        <cbc:TaxableAmount currencyID="${feb.moneda}">${importeXml(l.baseImponible)}</cbc:TaxableAmount>`,
        `        <cbc:TaxAmount currencyID="${feb.moneda}">${importeXml(l.cuotaIva)}</cbc:TaxAmount>`,
        `        <cac:TaxCategory>`,
        `          <cbc:Percent>${porcentajeXml(l.tipoIva)}</cbc:Percent>`,
        `          <cbc:TaxExemptionReasonCode>${cat.codigo}</cbc:TaxExemptionReasonCode>`,
        `          <cac:TaxScheme>`,
        `            <cbc:ID>VAT</cbc:ID>`,
        `          </cac:TaxScheme>`,
        `        </cac:TaxCategory>`,
        `      </cac:TaxSubtotal>`,
        `    </cac:TaxTotal>`,
        `  </cac:InvoiceLine>`,
      ].join('\n');
    })
    .join('\n');

  const impuestosXml = grupos
    .map((g) => {
      const cat = categoriaIva(g.tipoIva, g.exenta);
      return [
        `    <cac:TaxSubtotal>`,
        `      <cbc:TaxableAmount currencyID="${feb.moneda}">${importeXml(g.base)}</cbc:TaxableAmount>`,
        `      <cbc:TaxAmount currencyID="${feb.moneda}">${importeXml(g.cuota)}</cbc:TaxAmount>`,
        `      <cac:TaxCategory>`,
        `        <cbc:Percent>${porcentajeXml(g.tipoIva)}</cbc:Percent>`,
        `        <cbc:TaxExemptionReasonCode>${cat.codigo}</cbc:TaxExemptionReasonCode>`,
        `        <cac:TaxScheme>`,
        `          <cbc:ID>VAT</cbc:ID>`,
        `        </cac:TaxScheme>`,
        `      </cac:TaxCategory>`,
        `    </cac:TaxSubtotal>`,
      ].join('\n');
    })
    .join('\n');

  const doc = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">`,
    `  <cbc:CustomizationID>urn:cen.eu:en16931:2017</cbc:CustomizationID>`,
    `  <cbc:ID>${xmlEscape(feb.numeroCompleto)}</cbc:ID>`,
    `  <cbc:IssueDate>${fecha}</cbc:IssueDate>`,
    `  <cbc:DueDate>${fechaIso(feb.vencimiento) || fecha}</cbc:DueDate>`,
    `  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>`,
    `  <cbc:DocumentCurrencyCode>${feb.moneda}</cbc:DocumentCurrencyCode>`,
    `  <cac:AccountingSupplierParty>`,
    `    <cac:Party>`,
    bloqueParte(feb.emisor, feb),
    `    </cac:Party>`,
    `  </cac:AccountingSupplierParty>`,
    `  <cac:AccountingCustomerParty>`,
    `    <cac:Party>`,
    bloqueParte(feb.receptor, feb),
    `    </cac:Party>`,
    `  </cac:AccountingCustomerParty>`,
    `  <cac:PaymentMeans>`,
    `    <cbc:ID>1</cbc:ID>`,
    `    <cbc:PaymentMeansCode>${codigoMedioPago(feb)}</cbc:PaymentMeansCode>`,
    feb.informacionPago?.iban
      ? `    <cac:PayeeFinancialAccount>\n      <cbc:ID>${xmlEscape(feb.informacionPago.iban)}</cbc:ID>\n    </cac:PayeeFinancialAccount>`
      : '',
    `  </cac:PaymentMeans>`,
    `  <cac:TaxTotal>`,
    `    <cbc:TaxAmount currencyID="${feb.moneda}">${importeXml(feb.cuotaIva)}</cbc:TaxAmount>`,
    impuestosXml,
    `  </cac:TaxTotal>`,
    `  <cac:LegalMonetaryTotal>`,
    `    <cbc:LineExtensionAmount currencyID="${feb.moneda}">${importeXml(feb.baseImponible)}</cbc:LineExtensionAmount>`,
    `    <cbc:TaxExclusiveAmount currencyID="${feb.moneda}">${importeXml(feb.baseImponible)}</cbc:TaxExclusiveAmount>`,
    `    <cbc:PayableAmount currencyID="${feb.moneda}">${importeXml(feb.importeTotal)}</cbc:PayableAmount>`,
    `  </cac:LegalMonetaryTotal>`,
    lineasXml,
    `</Invoice>`,
  ].filter(Boolean).join('\n');

  return doc;
}

function bloqueParte(p: FacturaElectronicaB2B['emisor'], feb: FacturaElectronicaB2B): string {
  const partes: string[] = [
    `      <cac:PartyLegalEntity>`,
    `        <cbc:RegistrationName>${xmlEscape(p.nombreRazonSocial)}</cbc:RegistrationName>`,
    `        <cbc:CompanyID schemeID="9920" schemeName="VAT">${xmlEscape(p.nif)}</cbc:CompanyID>`,
    `      </cac:PartyLegalEntity>`,
  ];
  if (p.direccion || p.municipio || p.codigoPostal || p.pais) {
    partes.unshift(
      `      <cac:PostalAddress>`,
      ...(p.direccion ? [`        <cbc:StreetName>${xmlEscape(p.direccion)}</cbc:StreetName>`] : []),
      ...(p.municipio ? [`        <cbc:CityName>${xmlEscape(p.municipio)}</cbc:CityName>`] : []),
      ...(p.codigoPostal ? [`        <cbc:PostalZone>${xmlEscape(p.codigoPostal)}</cbc:PostalZone>`] : []),
      ...(p.pais ? [`        <cac:Country>\n          <cbc:IdentificationCode>${xmlEscape(p.pais)}</cbc:IdentificationCode>\n        </cac:Country>`] : []),
      `      </cac:PostalAddress>`
    );
  }
  return partes.join('\n');
}

function codigoMedioPago(feb: FacturaElectronicaB2B): string {
  switch (feb.informacionPago?.formaPago) {
    case 'transferencia': return '30';
    case 'domiciliacion': return '49';
    case 'efectivo': return '10';
    case 'bizum': return 'ZZZ';
    default: return '1';
  }
}
