/**
 * GAP 8 — GENERADOR FACTURAE 3.2.2 (sintaxis oficial española, EN 16931).
 *
 * ACLARACIÓN DE ALCANCE: este generador produce Facturae como sintaxis admitida
 * para el intercambio B2B (RD 238/2026). NO se usa para envíos B2G/FACe
 * (Ley 25/2013), que quedan FUERA de alcance de GAP 8.
 * Generación determinista; sin XSD inventados.
 */

import { FacturaElectronicaB2B } from '../../types/facturaElectronicaB2B';
import {
  agruparPorTipoIva,
  cantidadXml,
  fechaIso,
  importeXml,
  porcentajeXml,
  xmlEscape,
} from '../facturaElectronicaXml';

export function generarFacturae(feb: FacturaElectronicaB2B): string {
  const fecha = fechaIso(feb.fechaExpedicion);
  const grupos = agruparPorTipoIva(feb.lineas);

  const impuestosLineas = feb.lineas
    .map((l) => {
      const ret = l.tipoRetencion && l.tipoRetencion > 0;
      return [
        `          <InvoiceLine>`,
        `            <ItemDescription>${xmlEscape(l.concepto)}</ItemDescription>`,
        `            <Quantity>${cantidadXml(l.cantidad)}</Quantity>`,
        `            <UnitPrice>${importeXml(l.precioUnitario)}</UnitPrice>`,
        `            <TotalCost>${importeXml(l.baseImponible)}</TotalCost>`,
        `            <TaxesOutputs>`,
        `              <Tax>`,
        `                <TaxTypeCode>01</TaxTypeCode>`,
        `                <TaxRate>${porcentajeXml(l.tipoIva)}</TaxRate>`,
        `                <TaxableBase><TotalAmount>${importeXml(l.baseImponible)}</TotalAmount></TaxableBase>`,
        `                <TaxAmount><TotalAmount>${importeXml(l.cuotaIva)}</TotalAmount></TaxAmount>`,
        `              </Tax>`,
        `            </TaxesOutputs>`,
        ret
          ? `            <TaxesWithheld>\n              <Tax>\n                <TaxTypeCode>04</TaxTypeCode>\n                <TaxRate>${porcentajeXml(l.tipoRetencion)}</TaxRate>\n                <TaxableBase><TotalAmount>${importeXml(l.baseImponible)}</TotalAmount></TaxableBase>\n                <TaxAmount><TotalAmount>${importeXml(l.cuotaRetencion || 0)}</TotalAmount></TaxAmount>\n              </Tax>\n            </TaxesWithheld>`
          : '',
        `          </InvoiceLine>`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const impuestosResumen = grupos
    .map((g) => {
      return [
        `          <TaxOutput>`,
        `            <TaxTypeCode>01</TaxTypeCode>`,
        `            <TaxRate>${porcentajeXml(g.tipoIva)}</TaxRate>`,
        `            <TaxableBase><TotalAmount>${importeXml(g.base)}</TotalAmount></TaxableBase>`,
        `            <TaxAmount><TotalAmount>${importeXml(g.cuota)}</TotalAmount></TaxAmount>`,
        `          </TaxOutput>`,
      ].join('\n');
    })
    .join('\n');

  const totalRetenciones = feb.cuotaRetencion || 0;
  const doc = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml">`,
    `  <FileHeader>`,
    `    <SchemaVersion>3.2.2</SchemaVersion>`,
    `    <Modality>I</Modality>`,
    `    <InvoiceIssuerType>EM</InvoiceIssuerType>`,
    `    <Batch>`,
    `      <BatchIdentifier>${xmlEscape(feb.numeroCompleto)}</BatchIdentifier>`,
    `      <InvoicesCount>1</InvoicesCount>`,
    `      <TotalInvoicesAmount><TotalAmount>${importeXml(feb.importeTotal)}</TotalAmount></TotalInvoicesAmount>`,
    `      <TotalOutstandingAmount><TotalAmount>${importeXml(feb.importeTotal)}</TotalOutstandingAmount>`,
    `      <TotalExecutableAmount><TotalAmount>${importeXml(feb.importeTotal)}</TotalExecutableAmount>`,
    `      <InvoiceCurrencyCode>${feb.moneda}</InvoiceCurrencyCode>`,
    `    </Batch>`,
    `  </FileHeader>`,
    `  <Parties>`,
    `    <SellerParty>`,
    bloqueParteFacturae(feb.emisor),
    `    </SellerParty>`,
    `    <BuyerParty>`,
    bloqueParteFacturae(feb.receptor),
    `    </BuyerParty>`,
    `  </Parties>`,
    `  <Invoices>`,
    `    <Invoice>`,
    `      <InvoiceHeader>`,
    `        <InvoiceNumber>${String(feb.numero)}</InvoiceNumber>`,
    `        <InvoiceSeriesCode>${xmlEscape(feb.serie)}</InvoiceSeriesCode>`,
    `        <InvoiceDocumentType>FC</InvoiceDocumentType>`,
    `        <InvoiceClass>OO</InvoiceClass>`,
    `      </InvoiceHeader>`,
    `      <InvoiceIssueData>`,
    `        <IssueDate>${fecha}</IssueDate>`,
    `        <InvoiceCurrencyCode>${feb.moneda}</InvoiceCurrencyCode>`,
    `        <TaxCurrencyCode>${feb.moneda}</TaxCurrencyCode>`,
    `        <LanguageName>es</LanguageName>`,
    `      </InvoiceIssueData>`,
    `      <TaxesOutputs>`,
    impuestosResumen,
    `      </TaxesOutputs>`,
    totalRetenciones > 0
      ? `      <TaxesWithheld>\n        <Tax>\n          <TaxTypeCode>04</TaxTypeCode>\n          <TaxableBase><TotalAmount>${importeXml(feb.baseImponible)}</TotalAmount></TaxableBase>\n          <TaxAmount><TotalAmount>${importeXml(totalRetenciones)}</TotalAmount></TaxAmount>\n        </Tax>\n      </TaxesWithheld>`
      : '',
    `      <InvoiceTotals>`,
    `        <TotalGrossAmount>${importeXml(feb.baseImponible)}</TotalGrossAmount>`,
    `        <TotalGeneralDiscounts>0.00</TotalGeneralDiscounts>`,
    `        <TotalGeneralSurcharges>0.00</TotalGeneralSurcharges>`,
    `        <TotalTaxesOutputs>${importeXml(feb.cuotaIva)}</TotalTaxesOutputs>`,
    `        <TotalTaxesWithheld>${importeXml(totalRetenciones)}</TotalTaxesWithheld>`,
    `        <InvoiceTotal>${importeXml(feb.importeTotal)}</InvoiceTotal>`,
    `        <TotalOutstandingAmount>${importeXml(feb.importeTotal)}</TotalOutstandingAmount>`,
    `        <TotalExecutableAmount>${importeXml(feb.importeTotal)}</TotalExecutableAmount>`,
    `      </InvoiceTotals>`,
    `      <Items>`,
    impuestosLineas,
    `      </Items>`,
    feb.informacionPago?.iban
      ? `      <PaymentDetails>\n        <Installment>\n          <InstallmentDueDate>${fechaIso(feb.vencimiento) || fecha}</InstallmentDueDate>\n          <PaymentMeans>04</PaymentMeans>\n          <AccountToBeCredited>\n            <IBAN>${xmlEscape(feb.informacionPago.iban)}</IBAN>\n          </AccountToBeCredited>\n        </Installment>\n      </PaymentDetails>`
      : '',
    `    </Invoice>`,
    `  </Invoices>`,
    `</fe:Facturae>`,
  ]
    .filter(Boolean)
    .join('\n');

  return doc;
}

function bloqueParteFacturae(p: FacturaElectronicaB2B['emisor']): string {
  const partes: string[] = [
    `      <TaxIdentification>`,
    `        <PersonTypeCode>J</PersonTypeCode>`,
    `        <ResidenceTypeCode>R</ResidenceTypeCode>`,
    `        <TaxIdentificationNumber>${xmlEscape(p.nif)}</TaxIdentificationNumber>`,
    `      </TaxIdentification>`,
    `      <LegalEntity>`,
    `        <CorporateName>${xmlEscape(p.nombreRazonSocial)}</CorporateName>`,
    `        <TradeName>${xmlEscape(p.nombreRazonSocial)}</TradeName>`,
    `      </LegalEntity>`,
  ];
  if (p.direccion || p.municipio || p.codigoPostal || p.pais) {
    partes.push(
      `      <AddressInSpain>`,
      `        <Address>${xmlEscape(p.direccion || '')}</Address>`,
      `        <PostCode>${xmlEscape(p.codigoPostal || '')}</PostCode>`,
      `        <Town>${xmlEscape(p.municipio || '')}</Town>`,
      `        <CountryCode>ESP</CountryCode>`,
      `      </AddressInSpain>`
    );
  }
  return partes.join('\n');
}
