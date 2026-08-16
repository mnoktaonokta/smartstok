import "server-only";

import type { UblInvoiceInput, UblLine } from "../types";
import { escapeXml } from "../soap";
import { amountInTurkishWords } from "./amount-in-words-tr";
import { gibInvoiceQrPng } from "./gib-qr";
import { invoiceVisualXsltBase64 } from "./xslt/load-xslt";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function lineNet(line: UblLine) {
  const gross = line.unitPrice * line.quantity;
  const discount = Math.min(line.discount, gross);
  return round2(Math.max(0, gross - discount));
}

function lineTax(line: UblLine) {
  return round2(lineNet(line) * (line.taxRate / 100));
}

function schemeId(vknTckn: string): "VKN" | "TCKN" {
  return vknTckn.replace(/\D/g, "").length === 11 ? "TCKN" : "VKN";
}

/** Ad soyadı FirstName / FamilyName olarak ayır (TCKN zorunlu). */
function splitPersonName(fullName: string): { firstName: string; familyName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "Ad", familyName: "Soyad" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0]!, familyName: parts[0]! };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    familyName: parts[parts.length - 1]!,
  };
}

function partyXml(
  party: UblInvoiceInput["supplier"],
  role:
    | "AccountingSupplierParty"
    | "AccountingCustomerParty"
    | "BuyerCustomerParty",
) {
  const digits = party.vknTckn.replace(/\D/g, "");
  const id = escapeXml(digits);
  const scheme = schemeId(digits);
  const name = escapeXml(party.name);
  const taxOffice = escapeXml(party.taxOffice ?? "");
  const street = escapeXml(party.address ?? "");
  const city = escapeXml(party.city ?? "İstanbul");
  const district = escapeXml(party.district ?? "");
  const country = escapeXml(party.country ?? "Türkiye");
  const phone = escapeXml(party.phone ?? "");
  const email = escapeXml(party.email ?? "");

  const person =
    scheme === "TCKN"
      ? (() => {
          const { firstName, familyName } = splitPersonName(party.name);
          return `
    <cac:Person>
      <cbc:FirstName>${escapeXml(firstName)}</cbc:FirstName>
      <cbc:FamilyName>${escapeXml(familyName)}</cbc:FamilyName>
    </cac:Person>`;
        })()
      : "";

  return `<cac:${role}>
  <cac:Party>
    <cac:PartyIdentification>
      <cbc:ID schemeID="${scheme}">${id}</cbc:ID>
    </cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${name}</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>${street}</cbc:StreetName>
      <cbc:CitySubdivisionName>${district}</cbc:CitySubdivisionName>
      <cbc:CityName>${city}</cbc:CityName>
      <cac:Country>
        <cbc:IdentificationCode>TR</cbc:IdentificationCode>
        <cbc:Name>${country}</cbc:Name>
      </cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cac:TaxScheme><cbc:Name>${taxOffice || (scheme === "TCKN" ? "—" : "")}</cbc:Name></cac:TaxScheme>
    </cac:PartyTaxScheme>
    <cac:Contact>
      <cbc:Telephone>${phone}</cbc:Telephone>
      <cbc:ElectronicMail>${email}</cbc:ElectronicMail>
    </cac:Contact>${person}
  </cac:Party>
</cac:${role}>`;
}

function paymentMeansXml(
  iban: string | null | undefined,
  note?: string | null,
): string {
  const digits = iban?.replace(/\s+/g, "").trim();
  const instruction = note?.trim();
  if (!digits && !instruction) return "";
  const account = digits
    ? `
  <cac:PayeeFinancialAccount>
    <cbc:ID>${escapeXml(digits.toUpperCase())}</cbc:ID>
    <cbc:CurrencyCode>TRY</cbc:CurrencyCode>
  </cac:PayeeFinancialAccount>`
    : "";
  const instructionXml = instruction
    ? `
  <cbc:InstructionNote>${escapeXml(instruction)}</cbc:InstructionNote>`
    : "";
  return `<cac:PaymentMeans>
  <cbc:PaymentMeansCode>42</cbc:PaymentMeansCode>${instructionXml}${account}
</cac:PaymentMeans>`;
}

/** Her satır ayrı cbc:Note — XSLT Genel Açıklamalar’da satır kırılımı için. */
function documentNotesXml(rawNote: string | null | undefined, yalniz: string): string {
  const lines = (rawNote ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toUpperCase().startsWith("YALNIZ"));
  return [...lines, yalniz]
    .map((line) => `  <cbc:Note>${escapeXml(line)}</cbc:Note>`)
    .join("\n");
}

function xsltAttachmentXml(input: UblInvoiceInput): string {
  const isEarsiv = input.profileId === "EARSIVFATURA";
  const b64 = invoiceVisualXsltBase64(
    input.logo,
    isEarsiv ? "earsiv" : "efatura",
    gibInvoiceQrPng(input),
  );
  const filename = isEarsiv
    ? "smartstok-earsiv.xslt"
    : input.profileId === "ILAC_TIBBICIHAZ"
      ? "smartstok-ilac-tibbicihaz.xslt"
      : input.profileId === "KAMUFATURASI"
        ? "smartstok-kamu.xslt"
        : "smartstok-efatura.xslt";
  const issueDate = escapeXml(input.issueDate);
  const docId = escapeXml(input.documentId);

  const earsivExtras = isEarsiv
    ? `<cac:AdditionalDocumentReference>
  <cbc:ID>gonderimSekli</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DocumentType>ELEKTRONIK</cbc:DocumentType>
</cac:AdditionalDocumentReference>
<cac:AdditionalDocumentReference>
  <cbc:ID>duzenlemeTarihi</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DocumentType>${new Date().toISOString().slice(11, 19)}</cbc:DocumentType>
</cac:AdditionalDocumentReference>`
    : "";

  return `${earsivExtras}
<cac:AdditionalDocumentReference>
  <cbc:ID>${docId}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cac:Attachment>
    <cbc:EmbeddedDocumentBinaryObject characterSetCode="UTF-8" encodingCode="Base64" filename="${filename}" mimeCode="application/xml">${b64}</cbc:EmbeddedDocumentBinaryObject>
  </cac:Attachment>
</cac:AdditionalDocumentReference>`;
}

/** UBL-TR fatura XML — gömülü görsel XSLT içerir. */
export function buildInvoiceUbl(input: UblInvoiceInput): string {
  const lines = input.lines;
  const lineExtension = round2(lines.reduce((s, l) => s + lineNet(l), 0));
  const taxAmount = round2(lines.reduce((s, l) => s + lineTax(l), 0));
  const allowanceTotal = round2(
    lines.reduce((s, l) => {
      const gross = l.unitPrice * l.quantity;
      return s + Math.min(l.discount, gross);
    }, 0),
  );
  const payable = round2(lineExtension + taxAmount);
  const uuid = escapeXml(input.uuid);
  const documentId = escapeXml(input.documentId);
  const issueDate = escapeXml(input.issueDate);
  const issueTime = escapeXml(
    (input.issueTime?.trim() || new Date().toISOString().slice(11, 19)).slice(
      0,
      8,
    ),
  );
  const yalniz = `YALNIZ: ${amountInTurkishWords(payable)}`;
  const notesXml = documentNotesXml(input.note, yalniz);

  const invoiceLines = lines
    .map((line) => {
      const net = lineNet(line);
      const tax = lineTax(line);
      const gross = round2(line.unitPrice * line.quantity);
      const discount = round2(Math.min(line.discount, gross));
      const discRate = gross > 0 ? round2((discount / gross) * 100) : 0;
      const name = escapeXml(line.name);
      // Görsel XSLT açıklama satırında cbc:Description kullanır
      const description = escapeXml(line.note?.trim() || line.name);
      const sellersId = escapeXml(line.sellersItemId?.trim() || "");
      const sellersXml = sellersId
        ? `
    <cac:SellersItemIdentification>
      <cbc:ID>${sellersId}</cbc:ID>
    </cac:SellersItemIdentification>`
        : "";
      const tibbiXml = (line.tibbiCihazIds ?? [])
        .map(
          (raw) => `
    <cac:AdditionalItemIdentification>
      <cbc:ID schemeID="TIBBICIHAZ">${escapeXml(raw)}</cbc:ID>
    </cac:AdditionalItemIdentification>`,
        )
        .join("");
      const allowanceXml =
        discount > 0
          ? `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:MultiplierFactorNumeric>${discRate.toFixed(2)}</cbc:MultiplierFactorNumeric>
    <cbc:Amount currencyID="TRY">${discount.toFixed(2)}</cbc:Amount>
    <cbc:BaseAmount currencyID="TRY">${gross.toFixed(2)}</cbc:BaseAmount>
  </cac:AllowanceCharge>`
          : "";
      return `<cac:InvoiceLine>
  <cbc:ID>${line.id}</cbc:ID>
  <cbc:InvoicedQuantity unitCode="C62">${line.quantity}</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="TRY">${net.toFixed(2)}</cbc:LineExtensionAmount>${allowanceXml}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">${tax.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">${net.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">${tax.toFixed(2)}</cbc:TaxAmount>
      <cbc:Percent>${line.taxRate}</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:Item>
    <cbc:Description>${description}</cbc:Description>
    <cbc:Name>${name}</cbc:Name>${sellersXml}${tibbiXml}
  </cac:Item>
  <cac:Price>
    <cbc:PriceAmount currencyID="TRY">${line.unitPrice.toFixed(2)}</cbc:PriceAmount>
  </cac:Price>
</cac:InvoiceLine>`;
    })
    .join("\n");

  const taxByRate = new Map<number, { taxable: number; tax: number }>();
  for (const line of lines) {
    const net = lineNet(line);
    const tax = lineTax(line);
    const cur = taxByRate.get(line.taxRate) ?? { taxable: 0, tax: 0 };
    cur.taxable = round2(cur.taxable + net);
    cur.tax = round2(cur.tax + tax);
    taxByRate.set(line.taxRate, cur);
  }
  const taxSubtotals = [...taxByRate.entries()]
    .map(
      ([rate, v]) => `<cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="TRY">${v.taxable.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="TRY">${v.tax.toFixed(2)}</cbc:TaxAmount>
      <cbc:Percent>${rate}</cbc:Percent>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`,
    )
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${input.profileId}</cbc:ProfileID>
  <cbc:ID>${documentId}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${uuid}</cbc:UUID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:IssueTime>${issueTime}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${input.invoiceTypeCode}</cbc:InvoiceTypeCode>
${notesXml}
  <cbc:DocumentCurrencyCode>${input.documentCurrencyCode}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${lines.length}</cbc:LineCountNumeric>
  ${xsltAttachmentXml(input)}
  ${partyXml(input.supplier, "AccountingSupplierParty")}
  ${partyXml(input.customer, "AccountingCustomerParty")}
  ${input.buyer ? partyXml(input.buyer, "BuyerCustomerParty") : ""}
  ${paymentMeansXml(input.paymentIban, input.paymentNote)}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="TRY">${taxAmount.toFixed(2)}</cbc:TaxAmount>
    ${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="TRY">${lineExtension.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="TRY">${lineExtension.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="TRY">${payable.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="TRY">${allowanceTotal.toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="TRY">${payable.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${invoiceLines}
</Invoice>`;
}

export function createEttn(): string {
  return crypto.randomUUID();
}

/**
 * GIB fatura no: 3 karakter seri + 4 yıl + 9 rakam (16 karakter).
 * Örn. SST2026000000001
 */
export function createGibDocumentId(opts: {
  series: string;
  year: number;
  sequence: number;
}): string {
  const series = opts.series
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .padEnd(3, "X")
    .slice(0, 3);
  const year = String(opts.year).padStart(4, "0").slice(0, 4);
  const seq = Math.max(1, Math.floor(opts.sequence));
  const sequence = String(seq).padStart(9, "0").slice(-9);
  return `${series}${year}${sequence}`;
}

export function gibSeriesYearPrefix(series: string, year: number): string {
  const s = series
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .padEnd(3, "X")
    .slice(0, 3);
  const y = String(year).padStart(4, "0").slice(0, 4);
  return `${s}${y}`;
}

export function parseGibDocumentSequence(
  documentId: string | null | undefined,
  series: string,
  year: number,
): number | null {
  if (!documentId || documentId.length !== 16) return null;
  const prefix = gibSeriesYearPrefix(series, year);
  if (!documentId.startsWith(prefix)) return null;
  const n = Number(documentId.slice(7));
  return Number.isFinite(n) ? n : null;
}
