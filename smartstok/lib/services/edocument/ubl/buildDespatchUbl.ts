import { randomUUID } from "crypto";
import type { CompanySettings, Customer } from "@/app/generated/prisma/client";
import { parseTrAddress } from "../parse-tr-address";
import { gibDespatchQrPng } from "./gib-qr";
import { eirsaliyeXsltBase64, ublLogoFromSettings } from "./xslt/load-xslt";

export type DespatchLineInput = {
  productName: string;
  lotNumber: string;
  quantity: number;
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function postalAddressXml(opts: {
  street?: string | null;
  district?: string | null;
  city?: string | null;
  postalZone?: string | null;
  indent?: string;
}): string {
  const pad = opts.indent ?? "        ";
  const parsed = parseTrAddress(opts.street, {
    city: opts.city,
    district: opts.district,
  });
  const street = parsed.street || (opts.street || "").trim() || ".";
  const district = parsed.district;
  const city = parsed.city;
  const postalZone =
    (opts.postalZone || "").trim() || parsed.postalZone;
  const postalXml = postalZone
    ? `
${pad}  <cbc:PostalZone>${xmlEscape(postalZone)}</cbc:PostalZone>`
    : "";
  return `${pad}<cac:PostalAddress>
${pad}  <cbc:StreetName>${xmlEscape(street)}</cbc:StreetName>
${pad}  <cbc:CitySubdivisionName>${xmlEscape(district)}</cbc:CitySubdivisionName>
${pad}  <cbc:CityName>${xmlEscape(city)}</cbc:CityName>${postalXml}
${pad}  <cac:Country>
${pad}    <cbc:IdentificationCode>TR</cbc:IdentificationCode>
${pad}    <cbc:Name>Türkiye</cbc:Name>
${pad}  </cac:Country>
${pad}</cac:PostalAddress>`;
}

function deliveryAddressXml(opts: {
  street?: string | null;
  district?: string | null;
  city?: string | null;
  postalZone?: string | null;
}): string {
  const parsed = parseTrAddress(opts.street, {
    city: opts.city,
    district: opts.district,
  });
  const street = parsed.street || (opts.street || "").trim() || ".";
  const postalZone = (opts.postalZone || "").trim() || parsed.postalZone;
  const postalXml = postalZone
    ? `
        <cbc:PostalZone>${xmlEscape(postalZone)}</cbc:PostalZone>`
    : "";
  return `      <cac:DeliveryAddress>
        <cbc:StreetName>${xmlEscape(street)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${xmlEscape(parsed.district)}</cbc:CitySubdivisionName>
        <cbc:CityName>${xmlEscape(parsed.city)}</cbc:CityName>${postalXml}
        <cac:Country>
          <cbc:IdentificationCode>TR</cbc:IdentificationCode>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:DeliveryAddress>`;
}

function partyIdentification(vknTckn: string): string {
  const scheme = vknTckn.length === 11 ? "TCKN" : "VKN";
  return `<cac:PartyIdentification>
          <cbc:ID schemeID="${scheme}">${xmlEscape(vknTckn)}</cbc:ID>
        </cac:PartyIdentification>`;
}

function customerPersonOrContact(customer: Customer): string {
  if (customer.vknTckn.length === 11) {
    return `<cac:Person>
          <cbc:FirstName>${xmlEscape(customer.name)}</cbc:FirstName>
          <cbc:FamilyName>.</cbc:FamilyName>
        </cac:Person>`;
  }
  return `<cac:Contact>
          <cbc:Telephone>${xmlEscape(customer.phone || "0000000000")}</cbc:Telephone>
        </cac:Contact>`;
}

/**
 * e-İrsaliye (DESPATCHADVICE) UBL — birim fiyat yok / 0.
 * GİB örnek yapısına yakın sade şablon.
 */
export function buildDespatchUbl(params: {
  uuid: string;
  despatchNumber: string;
  issueDate: Date;
  company: CompanySettings;
  customer: Customer;
  lines: DespatchLineInput[];
  note?: string | null;
}): string {
  const { uuid, despatchNumber, issueDate, company, customer, lines, note } =
    params;
  const dateStr = issueDate.toISOString().slice(0, 10);
  const timeStr = issueDate.toISOString().slice(11, 19);
  const supplierVkn = (company.qnbVkn || company.vkn || "").trim();
  const companyName = company.companyName || "Firma";
  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const logo = ublLogoFromSettings(company);
  const qr = gibDespatchQrPng({
    supplierVkn,
    customerVkn: customer.vknTckn,
    documentId: despatchNumber,
    uuid,
    issueDate: dateStr,
    despatchDate: dateStr,
  });
  const xsltB64 = eirsaliyeXsltBase64(logo, qr);

  const lineXml = lines
    .map((line, idx) => {
      const lineId = String(idx + 1);
      return `  <cac:DespatchLine>
    <cbc:ID>${lineId}</cbc:ID>
    <cbc:DeliveredQuantity unitCode="C62">${line.quantity}</cbc:DeliveredQuantity>
    <cac:OrderLineReference>
      <cbc:LineID>${lineId}</cbc:LineID>
    </cac:OrderLineReference>
    <cac:Item>
      <cbc:Name>${xmlEscape(line.productName)}</cbc:Name>
      <cac:AdditionalItemIdentification>
        <cbc:ID>${xmlEscape(line.lotNumber)}</cbc:ID>
      </cac:AdditionalItemIdentification>
    </cac:Item>
    <cac:Shipment>
      <cbc:ID>${lineId}</cbc:ID>
    </cac:Shipment>
  </cac:DespatchLine>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="eIrsaliye.xslt"?>
<DespatchAdvice xmlns="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:n4="http://www.altova.com/samplexml/other-ns"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xsi:schemaLocation="urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2 UBL-DespatchAdvice-2.1.xsd">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <n4:auto-generated_for_wildcard>
          <ds:Signature>
            <ds:SignedInfo>
              <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
              <ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
              <ds:Reference>
                <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
                <ds:DigestValue/>
              </ds:Reference>
            </ds:SignedInfo>
            <ds:SignatureValue/>
          </ds:Signature>
        </n4:auto-generated_for_wildcard>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2.1</cbc:CustomizationID>
  <cbc:ProfileID>TEMELIRSALIYE</cbc:ProfileID>
  <cbc:ID>${xmlEscape(despatchNumber)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${dateStr}</cbc:IssueDate>
  <cbc:IssueTime>${timeStr}</cbc:IssueTime>
  <cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>
  ${note ? `<cbc:Note>${xmlEscape(note)}</cbc:Note>` : "<cbc:Note/>"}
  <cbc:LineCountNumeric>${lines.length}</cbc:LineCountNumeric>
  <cac:OrderReference>
    <cbc:ID>${xmlEscape(despatchNumber)}</cbc:ID>
    <cbc:IssueDate>${dateStr}</cbc:IssueDate>
  </cac:OrderReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>${randomUUID()}</cbc:ID>
    <cbc:IssueDate>${dateStr}</cbc:IssueDate>
    <cbc:DocumentType>XSLT</cbc:DocumentType>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="application/xml" encodingCode="Base64" characterSetCode="UTF-8" filename="eIrsaliye.xslt">${xsltB64}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:Signature>
    <cbc:ID>${uuid}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${xmlEscape(supplierVkn)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${xmlEscape(companyName)}</cbc:Name>
      </cac:PartyName>
${postalAddressXml({ street: company.address })}
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#Signature</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:DespatchSupplierParty>
    <cac:Party>
      ${partyIdentification(supplierVkn)}
      <cac:PartyName>
        <cbc:Name>${xmlEscape(companyName)}</cbc:Name>
      </cac:PartyName>
${postalAddressXml({ street: company.address })}
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${xmlEscape(company.taxOffice || ".")}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:DespatchSupplierParty>
  <cac:DeliveryCustomerParty>
    <cac:Party>
      ${partyIdentification(customer.vknTckn)}
      <cac:PartyName>
        <cbc:Name>${xmlEscape(customer.name)}</cbc:Name>
      </cac:PartyName>
${postalAddressXml({ street: customer.address })}
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:Name>${xmlEscape(customer.taxOffice || ".")}</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      ${customerPersonOrContact(customer)}
    </cac:Party>
  </cac:DeliveryCustomerParty>
  <cac:Shipment>
    <cbc:ID>1</cbc:ID>
    <cbc:TotalTransportHandlingUnitQuantity>${totalQty}</cbc:TotalTransportHandlingUnitQuantity>
    <cac:Delivery>
${deliveryAddressXml({
  street: customer.address,
})}
      <cac:CarrierParty>
        ${partyIdentification(supplierVkn)}
        <cac:PartyName>
          <cbc:Name>${xmlEscape(companyName)}</cbc:Name>
        </cac:PartyName>
${postalAddressXml({
  street: company.address,
  indent: "          ",
})}
      </cac:CarrierParty>
      <cac:Despatch>
        <cbc:ActualDespatchDate>${dateStr}</cbc:ActualDespatchDate>
        <cbc:ActualDespatchTime>${timeStr}</cbc:ActualDespatchTime>
      </cac:Despatch>
    </cac:Delivery>
  </cac:Shipment>
${lineXml}
</DespatchAdvice>`;
}
