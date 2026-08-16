import "server-only";

import { jsPDF } from "jspdf";

export type DespatchPrintLine = {
  productName: string;
  lotNumber: string;
  quantity: number;
};

export type DespatchPrintInput = {
  despatchNumber: string;
  uuid: string;
  issueDate: Date;
  companyName: string;
  companyVkn: string;
  companyAddress: string;
  customerName: string;
  customerVkn: string;
  customerAddress: string;
  lines: DespatchPrintLine[];
  note?: string | null;
  logo?: { mimeType: string; base64: string } | null;
  qrPngBase64?: string | null;
};

/** jsPDF WinAnsi uyumu + bozuk “harf arası boşluklu” metinleri toparla */
function pdfText(value: string): string {
  let s = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .trim();

  // "M A C 3 5 1 3  3 . 5  X  1 3" → "MAC3513 3.5 X 13"
  const tokens = s.split(/\s+/).filter(Boolean);
  const singleRatio =
    tokens.length === 0
      ? 0
      : tokens.filter((t) => t.length === 1).length / tokens.length;
  if (tokens.length >= 5 && singleRatio >= 0.5) {
    s = /\s{2,}/.test(s)
      ? s
          .split(/\s{2,}/)
          .map((part) => part.replace(/\s+/g, ""))
          .filter(Boolean)
          .join(" ")
      : s.replace(/\s+/g, "");
  } else {
    s = s.replace(/\s+/g, " ");
    s = s.replace(/\b(?:[\w.%]\s+){2,}[\w.%]\b/g, (chunk) =>
      chunk.replace(/\s+/g, ""),
    );
  }

  return s
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c");
}

function wrapText(
  doc: jsPDF,
  text: string,
  maxWidth: number,
): string[] {
  const lines = doc.splitTextToSize(text, maxWidth);
  return Array.isArray(lines) ? lines : [String(lines)];
}

export function buildDespatchPrintPdf(input: DespatchPrintInput): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFont("helvetica", "normal");

  const dateStr = input.issueDate.toLocaleString("tr-TR");
  const totalQty = input.lines.reduce((s, l) => s + l.quantity, 0);

  if (input.qrPngBase64) {
    try {
      doc.addImage(
        `data:image/png;base64,${input.qrPngBase64}`,
        "PNG",
        174,
        10,
        22,
        22,
      );
    } catch {
      /* karekod gömülemezse belge yine basılır */
    }
  }
  if (input.logo?.base64) {
    const mime = input.logo.mimeType.toLowerCase();
    const fmt = mime.includes("png")
      ? "PNG"
      : mime.includes("jpeg") || mime.includes("jpg")
        ? "JPEG"
        : null;
    if (fmt) {
      try {
        doc.addImage(
          `data:${input.logo.mimeType};base64,${input.logo.base64}`,
          fmt,
          118,
          10,
          48,
          18,
        );
      } catch {
        /* logo gömülemezse belge yine basılır */
      }
    }
  }

  doc.setFontSize(16);
  doc.text("e-Irsaliye", 14, 16);
  doc.setFontSize(10);
  doc.text("SEVK / TEMELIRSALIYE", 14, 22);

  doc.setFontSize(9);
  doc.text(`Irsaliye No: ${pdfText(input.despatchNumber)}`, 14, 32);
  doc.text(`Tarih: ${dateStr}`, 14, 37);
  doc.text(`ETTN: ${input.uuid}`, 14, 42);

  doc.setFontSize(10);
  doc.text("Gonderici", 14, 52);
  doc.setFontSize(9);
  doc.text(pdfText(input.companyName || "-"), 14, 57);
  doc.text(`VKN/TCKN: ${input.companyVkn || "-"}`, 14, 62);
  const companyAddr = wrapText(
    doc,
    pdfText(input.companyAddress || "-"),
    88,
  );
  doc.text(companyAddr, 14, 67);

  doc.setFontSize(10);
  doc.text("Alici", 110, 52);
  doc.setFontSize(9);
  doc.text(pdfText(input.customerName || "-"), 110, 57);
  doc.text(`VKN/TCKN: ${input.customerVkn || "-"}`, 110, 62);
  const customerAddr = wrapText(
    doc,
    pdfText(input.customerAddress || "-"),
    86,
  );
  doc.text(customerAddr, 110, 67);

  // Manuel tablo — autoTable bazı metinlerde harf aralığı bozabiliyor
  const colX = [14, 28, 130, 170];
  const colW = [14, 100, 38, 26];
  let y = 88;

  doc.setFillColor(30, 64, 175);
  doc.rect(14, y - 5, 182, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text("Sira", colX[0]!, y);
  doc.text("Mal / Hizmet", colX[1]!, y);
  doc.text("Lot", colX[2]!, y);
  doc.text("Miktar", colX[3]!, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 8;

  input.lines.forEach((line, i) => {
    const nameLines = wrapText(doc, pdfText(line.productName), colW[1]! - 2);
    const rowH = Math.max(7, nameLines.length * 4.5 + 2);
    doc.setDrawColor(180);
    doc.rect(14, y - 4, 182, rowH);
    doc.text(String(i + 1), colX[0]!, y);
    doc.text(nameLines, colX[1]!, y);
    doc.text(pdfText(line.lotNumber), colX[2]!, y);
    doc.text(String(line.quantity), colX[3]!, y, { align: "right" });
    y += rowH;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });

  y += 6;
  doc.setFontSize(9);
  doc.text(`Toplam miktar: ${totalQty} adet`, 14, y);
  doc.text("Bu belgede birim fiyat ve tutar yer almaz.", 14, y + 6);
  if (input.note?.trim()) {
    doc.text(`Not: ${pdfText(input.note.trim())}`, 14, y + 12, {
      maxWidth: 180,
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}
