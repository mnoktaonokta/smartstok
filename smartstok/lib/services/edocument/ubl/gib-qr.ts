import "server-only";

import { deflateSync } from "node:zlib";
import { create as createQr } from "qrcode";
import type { UblInvoiceInput, UblLine } from "../types";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function money(n: number) {
  return round2(n).toFixed(2);
}

function lineNet(line: UblLine) {
  const gross = line.unitPrice * line.quantity;
  const discount = Math.min(line.discount, gross);
  return round2(Math.max(0, gross - discount));
}

/** GİB Karekod Standardı kılavuzu — fatura JSON içeriği. */
export function buildGibInvoiceQrJson(input: UblInvoiceInput): string {
  const taxByRate = new Map<number, { taxable: number; tax: number }>();
  let lineExtension = 0;
  for (const line of input.lines) {
    const net = lineNet(line);
    const tax = round2(net * (line.taxRate / 100));
    lineExtension = round2(lineExtension + net);
    const cur = taxByRate.get(line.taxRate) ?? { taxable: 0, tax: 0 };
    cur.taxable = round2(cur.taxable + net);
    cur.tax = round2(cur.tax + tax);
    taxByRate.set(line.taxRate, cur);
  }
  const taxAmount = [...taxByRate.values()].reduce(
    (s, v) => round2(s + v.tax),
    0,
  );
  const payable = round2(lineExtension + taxAmount);

  const payload: Record<string, string> = {
    vkntckn: input.supplier.vknTckn.replace(/\D/g, ""),
    avkntckn: input.customer.vknTckn.replace(/\D/g, ""),
    senaryo: input.profileId,
    tip: input.invoiceTypeCode,
    tarih: input.issueDate,
    no: input.documentId,
    ettn: input.uuid,
    parabirimi: input.documentCurrencyCode,
    malhizmettoplam: money(lineExtension),
  };
  for (const [rate, v] of [...taxByRate.entries()].sort((a, b) => a[0] - b[0])) {
    const r = String(rate);
    payload[`kdvmatrah(${r})`] = money(v.taxable);
    payload[`hesaplanankdv(${r})`] = money(v.tax);
  }
  payload.vergidahil = money(payable);
  payload.odenecek = money(payable);
  return JSON.stringify(payload);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function matrixToPngBase64(modules: {
  size: number;
  get(row: number, col: number): number;
}): string {
  const margin = 4;
  const scale = 4;
  const n = modules.size;
  const dim = (n + margin * 2) * scale;
  const rowSize = dim * 3;
  const raw = Buffer.alloc((rowSize + 1) * dim);
  for (let y = 0; y < dim; y++) {
    const rowStart = y * (rowSize + 1);
    raw[rowStart] = 0;
    const row = Math.floor(y / scale) - margin;
    for (let x = 0; x < dim; x++) {
      const col = Math.floor(x / scale) - margin;
      const dark =
        row >= 0 &&
        col >= 0 &&
        row < n &&
        col < n &&
        modules.get(row, col);
      const v = dark ? 0 : 255;
      const p = rowStart + 1 + x * 3;
      raw[p] = v;
      raw[p + 1] = v;
      raw[p + 2] = v;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(dim, 0);
  ihdr.writeUInt32BE(dim, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return png.toString("base64");
}

export function gibInvoiceQrPng(input: UblInvoiceInput): {
  mimeType: "image/png";
  base64: string;
} | null {
  try {
    const qr = createQr(buildGibInvoiceQrJson(input), {
      errorCorrectionLevel: "M",
    });
    return { mimeType: "image/png", base64: matrixToPngBase64(qr.modules) };
  } catch {
    return null;
  }
}
