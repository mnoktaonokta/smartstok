import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EIRSALIYE_DEFAULT_XSLT } from "./eirsaliye-default-source";
import {
  EARSIV_XSLT_BASE64,
  EFATURA_XSLT_BASE64,
} from "./embeddedXslt";

/** Sahte “Firma Logo” hücresi — logo + sağ üst karekod buraya basılır. */
const FIRMA_LOGO_CELL =
  /<td([^>]*)>\s*<img\b[^>]*alt\s*=\s*['"]Firma Logo['"][\s\S]*?\/>\s*<\/td>/i;
const FIRMA_LOGO_IMG =
  /<img\b[^>]*alt\s*=\s*['"]Firma Logo['"][\s\S]*?\/>/i;
const FIRMA_IMZA_IMG =
  /<img\b[^>]*alt\s*=\s*['"]Firma İmzası['"][\s\S]*?\/>/i;
/** e-Arşiv şablonuna gömülü Koluman adres / IBAN bloğu. */
const FIRM_NOTES_BLOCK =
  /<p\s+id=["']firmNotes["']>[\s\S]*?<\/p>\s*<\/p>/i;

const MAX_LOGO_BYTES = 1_500_000;

function xsltDir(): string | null {
  const candidates = [
    join(process.cwd(), "lib/services/edocument/ubl/xslt"),
    join(process.cwd(), "smartstok/lib/services/edocument/ubl/xslt"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "eirsaliye-default.xslt"))) return dir;
  }
  return null;
}

function toBase64(xml: string): string {
  return Buffer.from(xml, "utf8").toString("base64");
}

export type UblLogo = {
  mimeType: string;
  base64: string;
};

export function ublLogoFromSettings(settings: {
  logoData?: Uint8Array | Buffer | null;
  logoMimeType?: string | null;
}): UblLogo | null {
  const data = settings.logoData;
  const mime = settings.logoMimeType?.trim();
  if (!data?.length || !mime) return null;
  if (data.length > MAX_LOGO_BYTES) return null;
  return {
    mimeType: mime,
    base64: Buffer.from(data).toString("base64").replace(/\s+/g, ""),
  };
}

function headerBrandHtml(logo?: UblLogo | null, qr?: UblLogo | null): string {
  const logoImg =
    logo?.base64 && logo.mimeType
      ? `<img style='max-width:220px; max-height:100px;' alt='Firma Logo' src='data:${logo.mimeType};base64,${logo.base64}'/>`
      : "";
  const qrImg =
    qr?.base64 && qr.mimeType
      ? `<img style='width:112px; height:112px;' alt='Karekod' src='data:${qr.mimeType};base64,${qr.base64}'/>`
      : "";
  return `<td width='100%' valign='middle' align='right'><table width='100%' cellpadding='0' cellspacing='0'><tr><td valign='middle' align='center'>${logoImg}</td><td valign='top' align='right' width='120'>${qrImg}</td></tr></table></td>`;
}

function sanitizeInvoiceXslt(
  xsltXml: string,
  logo?: UblLogo | null,
  qr?: UblLogo | null,
): string {
  let xml = xsltXml.replace(FIRM_NOTES_BLOCK, '<p id="firmNotes"/>');
  xml = xml.replace(FIRMA_IMZA_IMG, "");
  const cell = headerBrandHtml(logo, qr);
  const before = xml;
  xml = xml.replace(FIRMA_LOGO_CELL, () => cell);
  if (xml === before) {
    xml = xml.replace(FIRMA_LOGO_IMG, () => cell);
  }
  return xml;
}

/**
 * e-Logo’nun doğrulanmış GİB görsel XSLT’si + Admin’deki firma logosu.
 * Yeni sade şablon e-Logo PDF motorunda belgeyi düşürüyordu.
 */
export function invoiceVisualXsltBase64(
  logo?: UblLogo | null,
  kind: "efatura" | "earsiv" = "efatura",
  qr?: UblLogo | null,
): string {
  const packed = kind === "earsiv" ? EARSIV_XSLT_BASE64 : EFATURA_XSLT_BASE64;
  const xml = Buffer.from(packed.replace(/\s+/g, ""), "base64").toString("utf8");
  return toBase64(sanitizeInvoiceXslt(xml, logo, qr));
}

export function eirsaliyeXsltBase64(): string {
  const dir = xsltDir();
  if (dir) {
    return toBase64(
      readFileSync(join(dir, "eirsaliye-default.xslt"), "utf8"),
    );
  }
  return toBase64(EIRSALIYE_DEFAULT_XSLT);
}
