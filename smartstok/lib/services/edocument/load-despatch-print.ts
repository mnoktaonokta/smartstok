import "server-only";

import { prisma } from "@/lib/prisma";
import { gibDespatchQrPng } from "./ubl/gib-qr";
import { ublLogoFromSettings } from "./ubl/xslt/load-xslt";
import {
  buildDespatchPrintPdf,
  type DespatchPrintInput,
} from "./despatch-print-pdf";

export async function loadDespatchPrintInput(
  invoiceId: string,
): Promise<DespatchPrintInput | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    omit: { pdfData: true, despatchPdfData: true },
    include: {
      customer: true,
      items: {
        include: {
          stockItem: {
            include: {
              product: { select: { referenceCode: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!invoice?.despatchUuid) return null;

  const settings = await prisma.companySettings.findUnique({
    where: { id: 1 },
  });
  const logo = settings ? ublLogoFromSettings(settings) : null;
  const issueDate = invoice.despatchedAt ?? invoice.createdAt;
  const despatchNumber = invoice.despatchNo || invoice.invoiceNo || invoice.id;
  const qr = gibDespatchQrPng({
    supplierVkn: (settings?.qnbVkn || settings?.vkn || "").trim(),
    customerVkn: invoice.customer?.vknTckn ?? "",
    documentId: despatchNumber,
    uuid: invoice.despatchUuid,
    issueDate: issueDate.toISOString().slice(0, 10),
  });

  const lineMap = new Map<
    string,
    { productName: string; lotNumber: string; quantity: number }
  >();
  for (const item of invoice.items) {
    const p = item.stockItem.product;
    const lot = item.stockItem.lotNumber;
    const key = `${p.referenceCode}::${lot}`;
    const existing = lineMap.get(key);
    if (existing) existing.quantity += 1;
    else {
      lineMap.set(key, {
        productName: `${p.referenceCode} ${p.name}`,
        lotNumber: lot,
        quantity: 1,
      });
    }
  }

  return {
    despatchNumber,
    uuid: invoice.despatchUuid,
    issueDate,
    companyName: settings?.companyName ?? "",
    companyVkn: (settings?.qnbVkn || settings?.vkn || "").trim(),
    companyAddress: settings?.address ?? "",
    customerName: invoice.customer?.name ?? "",
    customerVkn: invoice.customer?.vknTckn ?? "",
    customerAddress: invoice.customer?.address ?? "",
    lines: Array.from(lineMap.values()),
    note: invoice.note,
    logo,
    qrPngBase64: qr?.base64 ?? null,
  };
}

export async function renderDespatchPdfForInvoice(
  invoiceId: string,
): Promise<Buffer | null> {
  const input = await loadDespatchPrintInput(invoiceId);
  if (!input) return null;
  return buildDespatchPrintPdf(input);
}
