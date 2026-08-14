"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertCanMutate } from "@/lib/roles";
import { EDocumentFactory } from "@/lib/services/edocument/EDocumentFactory";
import {
  buildInvoiceUbl,
  createEttn,
  createGibDocumentId,
  gibSeriesYearPrefix,
  parseGibDocumentSequence,
} from "@/lib/services/edocument/ubl/buildInvoiceUbl";
import { buildDespatchUbl } from "@/lib/services/edocument/ubl/buildDespatchUbl";
import { renderDespatchPdfForInvoice } from "@/lib/services/edocument/load-despatch-print";
import { buildTibbiCihazIdentificationIds } from "@/lib/services/edocument/ubl/tibbi-cihaz";
import { buildInvoiceDocumentNote } from "@/lib/services/edocument/invoice-note";
import {
  buildPublicEntityUblExtras,
  resolveInvoiceProfileId,
} from "@/lib/services/edocument/kamu-invoice";
import { getOrCreateCompanySettings } from "@/lib/services/erp/company-settings";

const TAX_RATE = 10;

const draftSchema = z.object({
  customerId: z.string().min(1),
  locationId: z.string().min(1),
  note: z.string().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        lotNumber: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative(),
        discount: z.number().nonnegative(),
      }),
    )
    .min(1, "En az bir kalem seçilmeli."),
});

function decodePdf(b64: string | null | undefined): Buffer | null {
  if (!b64?.trim()) return null;
  try {
    const buf = Buffer.from(b64.replace(/\s/g, ""), "base64");
    if (buf.length > 4 && buf.subarray(0, 4).toString("utf8") === "%PDF") {
      return buf;
    }
    return null;
  } catch {
    return null;
  }
}

function revalidateInvoicePaths(locationId?: string | null) {
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/e-belge-fatura");
  revalidatePath("/dashboard/uts-tracking");
  revalidatePath("/dashboard/depots");
  if (locationId) {
    revalidatePath(`/dashboard/depots/${locationId}`);
  }
}

async function nextGibDocumentId(
  documentType: "EARCHIVE" | "EINVOICE" | "DESPATCH",
  year: number,
): Promise<string> {
  const series =
    (documentType === "EARCHIVE"
      ? process.env.EDOC_SERIES_EARCHIVE
      : documentType === "EINVOICE"
        ? process.env.EDOC_SERIES_EINVOICE
        : process.env.EDOC_SERIES_DESPATCH
    )?.trim() ||
    (documentType === "EARCHIVE"
      ? "SSA"
      : documentType === "EINVOICE"
        ? "SSE"
        : "SSI");

  const prefix = gibSeriesYearPrefix(series, year);

  if (documentType === "DESPATCH") {
    const recent = await prisma.invoice.findMany({
      where: {
        OR: [
          { despatchNo: { startsWith: prefix } },
          { despatchUuid: { not: null } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { despatchNo: true, despatchUuid: true },
    });

    let maxSeq = 0;
    let despatchedWithoutNo = 0;
    for (const row of recent) {
      const n = parseGibDocumentSequence(row.despatchNo, series, year);
      if (n != null && n > maxSeq) maxSeq = n;
      else if (row.despatchUuid && !row.despatchNo) despatchedWithoutNo += 1;
    }
    // Eski kayıtlarda despatchNo yoksa e-Logo’da kullanılmış sayıyı kaçırmamak için taban
    maxSeq = Math.max(maxSeq, despatchedWithoutNo);

    return createGibDocumentId({ series, year, sequence: maxSeq + 1 });
  }

  const recent = await prisma.invoice.findMany({
    where: {
      OR: [
        { invoiceNo: { startsWith: prefix } },
        { faturaNo: { startsWith: prefix } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { invoiceNo: true, faturaNo: true },
  });

  let maxSeq = 0;
  for (const row of recent) {
    for (const cand of [row.faturaNo, row.invoiceNo]) {
      const n = parseGibDocumentSequence(cand, series, year);
      if (n != null && n > maxSeq) maxSeq = n;
    }
  }

  return createGibDocumentId({ series, year, sequence: maxSeq + 1 });
}

type DetailLine = {
  stockItemIds: string[];
  productName: string;
  lotNumber: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

async function pickStockLines(params: {
  locationId: string;
  lines: z.infer<typeof draftSchema>["lines"];
  /** Güncellemede bu faturanın mevcut rezerve stokları da seçilebilir */
  allowStockIds?: string[];
}): Promise<{ error?: string; detailLines?: DetailLine[]; selectedIds?: string[] }> {
  const allow = new Set(params.allowStockIds ?? []);
  const selectedStockIds: string[] = [];
  const detailLines: DetailLine[] = [];

  for (const line of params.lines) {
    const available = await prisma.stockItem.findMany({
      where: {
        productId: line.productId,
        locationId: params.locationId,
        lotNumber: line.lotNumber,
        OR: [
          { isAvailable: true },
          ...(allow.size > 0 ? [{ id: { in: [...allow] } }] : []),
        ],
      },
      take: line.quantity,
      orderBy: { createdAt: "asc" },
      include: { product: true },
    });

    if (available.length < line.quantity) {
      return {
        error: `Lot ${line.lotNumber}: istenen ${line.quantity}, müsait ${available.length}.`,
      };
    }

    const product = available[0].product;
    const ids = available.map((s) => s.id);
    selectedStockIds.push(...ids);
    detailLines.push({
      stockItemIds: ids,
      productName: `${product.referenceCode} ${product.name}`,
      lotNumber: line.lotNumber,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
    });
  }

  return { detailLines, selectedIds: selectedStockIds };
}

async function writeInvoiceItems(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  invoiceId: string,
  detailLines: DetailLine[],
) {
  for (const line of detailLines) {
    const unitDiscount = line.discount / line.quantity;
    for (const stockItemId of line.stockItemIds) {
      await tx.invoiceItem.create({
        data: {
          invoiceId,
          stockItemId,
          salePrice: line.unitPrice,
          discount: unitDiscount,
        },
      });
    }
  }
}

/** E-belge formu: taslak kaydet + stok rezerve */
export async function saveDraftInvoiceAction(
  input: z.infer<typeof draftSchema>,
): Promise<{ error?: string; success?: boolean; invoiceId?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId },
    });
    if (!customer) return { error: "Müşteri bulunamadı." };

    const location = await prisma.location.findFirst({
      where: {
        id: parsed.data.locationId,
        customerId: customer.id,
        type: "CLINIC_DEPOT",
      },
    });
    if (!location) return { error: "Seçilen konsinye deposu geçersiz." };

    const settings = await getOrCreateCompanySettings();
    const picked = await pickStockLines({
      locationId: location.id,
      lines: parsed.data.lines,
    });
    if (picked.error || !picked.detailLines || !picked.selectedIds) {
      return { error: picked.error ?? "Stok seçilemedi." };
    }

    const invoiceNo = `DRAFT-${Date.now().toString(36).toUpperCase()}`;

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNo,
          customerId: customer.id,
          locationId: location.id,
          note: parsed.data.note?.trim() || null,
          eDocumentProvider: settings.eDocumentProvider,
          docStatus: "DRAFT",
        },
      });
      await writeInvoiceItems(tx, created.id, picked.detailLines!);
      await tx.stockItem.updateMany({
        where: { id: { in: picked.selectedIds! } },
        data: { isAvailable: false },
      });
      return created;
    });

    revalidateInvoicePaths(location.id);
    revalidatePath(`/dashboard/invoices/${invoice.id}`);
    return { success: true, invoiceId: invoice.id };
  } catch (error) {
    console.error("[saveDraftInvoiceAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Taslak kaydedilirken hata oluştu.",
    };
  }
}

/** Taslak düzenle: stok serbest bırak / yeniden rezerve */
export async function updateDraftInvoiceAction(
  invoiceId: string,
  input: z.infer<typeof draftSchema>,
): Promise<{ error?: string; success?: boolean; invoiceId?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const parsed = draftSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const existing = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: { select: { stockItemId: true } } },
    });
    if (!existing) return { error: "Fatura bulunamadı." };
    if (existing.docStatus !== "DRAFT") {
      return { error: "Yalnızca taslak faturalar düzenlenebilir." };
    }
    if (existing.bizimHesapGuid) {
      return { error: "Bizim Hesap faturaları bu ekrandan düzenlenemez." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId },
    });
    if (!customer) return { error: "Müşteri bulunamadı." };

    const location = await prisma.location.findFirst({
      where: {
        id: parsed.data.locationId,
        customerId: customer.id,
        type: "CLINIC_DEPOT",
      },
    });
    if (!location) return { error: "Seçilen konsinye deposu geçersiz." };

    const oldIds = existing.items.map((i) => i.stockItemId);
    const picked = await pickStockLines({
      locationId: location.id,
      lines: parsed.data.lines,
      allowStockIds: oldIds,
    });
    if (picked.error || !picked.detailLines || !picked.selectedIds) {
      return { error: picked.error ?? "Stok seçilemedi." };
    }

    const newIds = new Set(picked.selectedIds);
    const releaseIds = oldIds.filter((id) => !newIds.has(id));

    await prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId } });
      if (releaseIds.length > 0) {
        await tx.stockItem.updateMany({
          where: { id: { in: releaseIds } },
          data: { isAvailable: true },
        });
      }
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId: customer.id,
          locationId: location.id,
          note: parsed.data.note?.trim() || null,
        },
      });
      await writeInvoiceItems(tx, invoiceId, picked.detailLines!);
      await tx.stockItem.updateMany({
        where: { id: { in: picked.selectedIds! } },
        data: { isAvailable: false },
      });
    });

    revalidateInvoicePaths(location.id);
    revalidatePath(`/dashboard/invoices/${invoiceId}`);
    revalidatePath(`/dashboard/invoices/${invoiceId}/edit`);
    return { success: true, invoiceId };
  } catch (error) {
    console.error("[updateDraftInvoiceAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Taslak güncellenirken hata oluştu.",
    };
  }
}

export async function getDraftInvoiceForEditAction(invoiceId: string): Promise<{
  error?: string;
  draft?: {
    id: string;
    customerId: string;
    locationId: string;
    note: string;
    lines: Array<{
      productId: string;
      lotNumber: string;
      quantity: number;
      unitPrice: number;
      discount: number;
    }>;
  };
}> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: {
        include: {
          stockItem: { select: { productId: true, lotNumber: true } },
        },
      },
    },
  });
  if (!invoice) return { error: "Fatura bulunamadı." };
  if (invoice.docStatus !== "DRAFT") {
    return { error: "Yalnızca taslak düzenlenebilir." };
  }
  if (!invoice.customerId || !invoice.locationId) {
    return { error: "Taslak müşteri/depo bilgisi eksik." };
  }

  const map = new Map<
    string,
    {
      productId: string;
      lotNumber: string;
      quantity: number;
      unitPrice: number;
      discount: number;
    }
  >();

  for (const item of invoice.items) {
    const key = `${item.stockItem.productId}::${item.stockItem.lotNumber}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.discount += Number(item.discount);
    } else {
      map.set(key, {
        productId: item.stockItem.productId,
        lotNumber: item.stockItem.lotNumber,
        quantity: 1,
        unitPrice: Number(item.salePrice),
        discount: Number(item.discount),
      });
    }
  }

  return {
    draft: {
      id: invoice.id,
      customerId: invoice.customerId,
      locationId: invoice.locationId,
      note: invoice.note ?? "",
      lines: Array.from(map.values()),
    },
  };
}

export async function getEDocumentInvoiceDetailAction(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    omit: { pdfData: true, despatchPdfData: true },
    include: {
      customer: true,
      items: {
        include: {
          stockItem: {
            include: {
              product: {
                select: {
                  id: true,
                  referenceCode: true,
                  name: true,
                  brand: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!invoice) return { error: "Fatura bulunamadı." as const };

  const hasDespatchPdfRow = await prisma.invoice.findFirst({
    where: { id: invoiceId, despatchPdfData: { not: null } },
    select: { id: true },
  });
  const hasDespatchPdf = Boolean(hasDespatchPdfRow);

  const lineMap = new Map<
    string,
    {
      productName: string;
      lotNumber: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      lineTotal: number;
    }
  >();

  for (const item of invoice.items) {
    const p = item.stockItem.product;
    const key = `${p.id}::${item.stockItem.lotNumber}`;
    const unitPrice = Number(item.salePrice);
    const discount = Number(item.discount);
    const existing = lineMap.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.discount += discount;
      existing.lineTotal += unitPrice - discount;
    } else {
      lineMap.set(key, {
        productName: `${p.referenceCode} ${p.name}`,
        lotNumber: item.stockItem.lotNumber,
        quantity: 1,
        unitPrice,
        discount,
        lineTotal: unitPrice - discount,
      });
    }
  }

  const lines = Array.from(lineMap.values());
  const netApprox = lines.reduce((s, l) => s + l.lineTotal, 0);
  const hasPdfStored = Boolean(invoice.externalViewUrl);
  const canShowPdf =
    Boolean(invoice.documentType) &&
    (invoice.docStatus === "COMPLETED" ||
      invoice.docStatus === "SENT" ||
      invoice.docStatus === "PROCESSING");

  return {
    invoice: {
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      faturaNo: invoice.faturaNo,
      note: invoice.note,
      docStatus: invoice.docStatus,
      documentType: invoice.documentType,
      eDocumentProvider: invoice.eDocumentProvider,
      uuid: invoice.uuid,
      belgeOid: invoice.belgeOid,
      despatchUuid: invoice.despatchUuid,
      despatchNo: invoice.despatchNo,
      despatchedAt: invoice.despatchedAt?.toISOString() ?? null,
      externalViewUrl: invoice.externalViewUrl,
      lastError: invoice.lastError,
      createdAt: invoice.createdAt.toISOString(),
      customerId: invoice.customerId,
      locationId: invoice.locationId,
      customerName: invoice.customer?.name ?? "—",
      customerVkn: invoice.customer?.vknTckn ?? "—",
      bizimHesapGuid: invoice.bizimHesapGuid,
      bizimHesapUrl: invoice.bizimHesapUrl,
      lines,
      netApprox,
      canShowPdf,
      hasExternalPdf: hasPdfStored,
      hasDespatchPdf,
      itemCount: invoice.items.length,
    },
  };
}

/** e-İrsaliye kes (stoka dokunmaz) */
export async function issueDespatchAction(
  invoiceId: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        items: {
          include: {
            stockItem: {
              include: {
                product: {
                  select: { referenceCode: true, name: true },
                },
              },
            },
          },
        },
      },
    });
    if (!invoice) return { error: "Fatura bulunamadı." };
    if (invoice.docStatus !== "DRAFT") {
      return { error: "e-İrsaliye yalnızca taslak üzerinden kesilebilir." };
    }
    if (!invoice.customer) return { error: "Müşteri bulunamadı." };
    if (invoice.items.length === 0) return { error: "Kalem yok." };

    const settings = await getOrCreateCompanySettings();
    if (settings.eDocumentProvider !== "ELOGO") {
      return {
        error:
          "e-İrsaliye yalnızca e-Logo ile desteklenir. Admin → Firma Bilgileri’nden e-Logo seçin.",
      };
    }
    if (!settings.companyName || !(settings.qnbVkn || settings.vkn)) {
      return {
        error:
          "Firma unvanı ve VKN gerekli. Admin → Firma Bilgileri’ni doldurun.",
      };
    }

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };

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

    const now = new Date();
    const uuid = createEttn();
    const despatchNumber = await nextGibDocumentId("DESPATCH", now.getFullYear());

    const ublXml = buildDespatchUbl({
      uuid,
      despatchNumber,
      issueDate: now,
      company: settings,
      customer: invoice.customer,
      lines: Array.from(lineMap.values()),
      note: invoice.note,
    });

    const sent = await factory.provider.sendDespatch({ ublXml, uuid });
    if (!sent.ok) return { error: `e-İrsaliye: ${sent.error}` };

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        docStatus: "DESPATCHED",
        despatchUuid: sent.uuid,
        despatchBelgeOid: sent.belgeOid,
        despatchNo: despatchNumber,
        despatchedAt: now,
        eDocumentProvider: settings.eDocumentProvider,
        lastError: null,
      },
    });

    const localPdf = await renderDespatchPdfForInvoice(invoice.id);
    if (localPdf) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { despatchPdfData: new Uint8Array(localPdf) },
      });
    }

    revalidateInvoicePaths(invoice.locationId);
    revalidatePath(`/dashboard/invoices/${invoice.id}`);
    return { success: true };
  } catch (error) {
    console.error("[issueDespatchAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "e-İrsaliye kesilirken hata oluştu.",
    };
  }
}

/** e-İrsaliye PDF’sini e-Logo’dan çekip sakla */
export async function fetchDespatchPdfAction(
  invoiceId: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        despatchUuid: true,
        despatchBelgeOid: true,
        eDocumentProvider: true,
      },
    });
    if (!invoice) return { error: "Fatura bulunamadı." };
    if (!invoice.despatchUuid && !invoice.despatchBelgeOid) {
      return { error: "e-İrsaliye UUID yok; PDF çekilemez." };
    }

    const pdf = await renderDespatchPdfForInvoice(invoice.id);
    if (!pdf) {
      return { error: "e-İrsaliye yazdırma verisi oluşturulamadı." };
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        despatchPdfData: new Uint8Array(pdf),
        lastError: null,
      },
    });

    revalidatePath("/dashboard/invoices");
    revalidatePath(`/dashboard/invoices/${invoice.id}`);
    return { success: true };
  } catch (error) {
    console.error("[fetchDespatchPdfAction]", error);
    return {
      error:
        error instanceof Error ? error.message : "e-İrsaliye PDF indirilemedi.",
    };
  }
}

async function finalizeStock(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  stockItemIds: string[],
) {
  if (stockItemIds.length === 0) return;
  await tx.stockItem.updateMany({
    where: { id: { in: stockItemIds } },
    data: { isAvailable: false, utsStatus: "PENDING" },
  });
}

/** Taslak veya e-irsaliyeden e-Fatura / e-Arşiv kes */
export async function finalizeEDocumentInvoiceAction(
  invoiceId: string,
): Promise<{
  error?: string;
  success?: boolean;
  documentType?: "EARCHIVE" | "EINVOICE";
  docStatus?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        items: {
          include: {
            stockItem: {
              include: {
                product: {
                  select: {
                    referenceCode: true,
                    name: true,
                    id: true,
                    barcode: true,
                    productionDate: true,
                    expiryDate: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!invoice) return { error: "Fatura bulunamadı." };
    if (invoice.docStatus !== "DRAFT" && invoice.docStatus !== "DESPATCHED") {
      return { error: "Bu fatura zaten kesilmiş veya işleniyor." };
    }
    if (!invoice.customer) return { error: "Müşteri bulunamadı." };
    if (invoice.items.length === 0) return { error: "Kalem yok." };

    const settings = await getOrCreateCompanySettings();
    if (!settings.companyName || !(settings.qnbVkn || settings.vkn)) {
      return {
        error:
          "Firma unvanı ve VKN gerekli. Admin → Firma Bilgileri’ni doldurun.",
      };
    }

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };
    const provider = factory.provider;

    const taxQuery = await provider.queryTaxpayer(invoice.customer.vknTckn);
    if (!taxQuery.ok) return { error: `Mükellef sorgu: ${taxQuery.error}` };

    const isPublicEntity = invoice.customer.isPublicEntity;
    if (isPublicEntity && !taxQuery.isEInvoiceUser) {
      return {
        error:
          "Kamu kurumu e-Fatura mükellefi olmalı (KAMUFATURASI). e-Arşiv ile kesilemez.",
      };
    }

    const isEInvoice = isPublicEntity ? true : taxQuery.isEInvoiceUser;
    const documentType = isEInvoice ? "EINVOICE" : "EARCHIVE";

    const lineMap = new Map<
      string,
      {
        productName: string;
        referenceCode: string;
        barcode: string | null;
        lotNumber: string;
        expiryDate: Date | null;
        quantity: number;
        unitPrice: number;
        discount: number;
        units: Array<{
          uno: string;
          lno: string;
          sno: string | null;
          productionDate: Date | null;
          expiryDate: Date | null;
        }>;
      }
    >();
    for (const item of invoice.items) {
      const p = item.stockItem.product;
      const stock = item.stockItem;
      const uno = (p.barcode?.trim() || "").trim();
      const key = `${p.id}::${stock.lotNumber}::${Number(item.salePrice)}`;
      const existing = lineMap.get(key);
      const unit = {
        uno: uno || p.referenceCode.trim(),
        lno: stock.lotNumber,
        sno: stock.serialNumber?.trim() || null,
        productionDate: stock.productionDate ?? p.productionDate ?? null,
        expiryDate: stock.expiryDate ?? p.expiryDate ?? null,
      };
      if (existing) {
        existing.quantity += 1;
        existing.discount += Number(item.discount);
        existing.units.push(unit);
      } else {
        lineMap.set(key, {
          productName: `${p.referenceCode} ${p.name}`.trim(),
          referenceCode: p.referenceCode,
          barcode: p.barcode,
          lotNumber: stock.lotNumber,
          expiryDate: stock.expiryDate ?? null,
          quantity: 1,
          unitPrice: Number(item.salePrice),
          discount: Number(item.discount),
          units: [unit],
        });
      }
    }
    const detailLines = Array.from(lineMap.values());
    for (const line of detailLines) {
      if (!line.barcode?.trim()) {
        return {
          error: `${line.productName}: UNO (ürün barkodu) zorunlu. Ürün kartına barkod girin.`,
        };
      }
      for (const u of line.units) {
        u.uno = line.barcode.trim();
      }
    }
    const selectedStockIds = invoice.items.map((i) => i.stockItemId);

    const ublLines = [];
    for (let i = 0; i < detailLines.length; i++) {
      const l = detailLines[i]!;
      const tibbi = buildTibbiCihazIdentificationIds(l.units);
      if (!tibbi.ok) {
        return {
          error: `${l.productName} / Lot ${l.lotNumber}: ${tibbi.error}`,
        };
      }
      const skt = l.expiryDate
        ? ` SKT ${l.expiryDate.toLocaleDateString("tr-TR")}`
        : "";
      ublLines.push({
        id: i + 1,
        name: l.productName,
        sellersItemId: l.referenceCode,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRate: TAX_RATE,
        note: `${l.productName} | Lot ${l.lotNumber}${skt}`,
        tibbiCihazIds: tibbi.ids,
      });
    }

    const now = new Date();
    const year = now.getFullYear();
    const uuid = createEttn();
    const issueDate = now.toISOString().slice(0, 10);
    const invoiceNo = await nextGibDocumentId(documentType, year);
    const supplierVkn = (settings.qnbVkn || settings.vkn || "").trim();

    // e-Fatura: tıbbi cihaz veya kamu senaryosu; e-Arşiv: EARSIVFATURA
    let profileId = resolveInvoiceProfileId({
      isPublicEntity,
      isEInvoice,
    });
    let buyer = null as
      | {
          vknTckn: string;
          name: string;
          taxOffice: string | null;
          address: string | null;
          phone: string | null;
        }
      | null;
    let paymentIban: string | null = null;
    let note = buildInvoiceDocumentNote(
      invoice.note,
      settings.bankAccountInfo,
    );

    if (isPublicEntity) {
      const kamu = buildPublicEntityUblExtras(
        invoice.customer,
        settings.bankAccountInfo,
        invoice.note,
      );
      if (!kamu.ok) return { error: kamu.error };
      profileId = kamu.profileId;
      buyer = kamu.buyer;
      paymentIban = kamu.paymentIban;
      note = kamu.note;
    }

    const ublXml = buildInvoiceUbl({
      uuid,
      documentId: invoiceNo,
      issueDate,
      invoiceTypeCode: "SATIS",
      documentCurrencyCode: "TRY",
      profileId,
      supplier: {
        vknTckn: supplierVkn,
        name: settings.companyName,
        taxOffice: settings.taxOffice,
        address: settings.address,
        phone: settings.phone,
      },
      customer: {
        vknTckn: invoice.customer.vknTckn,
        name: invoice.customer.name,
        taxOffice: invoice.customer.taxOffice,
        address: invoice.customer.address,
        phone: invoice.customer.phone,
      },
      buyer,
      paymentIban,
      lines: ublLines,
      note,
    });

    if (documentType === "EARCHIVE") {
      const sent = await provider.sendEArchive({
        ublXml,
        uuid,
        donenBelgeFormati: 3,
        taslagaYonlendir: 0,
      });
      if (!sent.ok) return { error: `e-Arşiv: ${sent.error}` };

      const pdf = decodePdf(sent.pdfBase64);
      await prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            invoiceNo,
            documentType: "EARCHIVE",
            eDocumentProvider: settings.eDocumentProvider,
            docStatus: "COMPLETED",
            uuid: sent.uuid,
            faturaNo: sent.faturaNo ?? invoiceNo,
            externalViewUrl: sent.faturaURL ?? null,
            pdfData: pdf ? new Uint8Array(pdf) : undefined,
            lastError: null,
          },
        });
        await finalizeStock(tx, selectedStockIds);
      });

      revalidateInvoicePaths(invoice.locationId);
      revalidatePath(`/dashboard/invoices/${invoice.id}`);
      return {
        success: true,
        documentType: "EARCHIVE",
        docStatus: "COMPLETED",
      };
    }

    const sent = await provider.sendEInvoice({
      ublXml,
      uuid,
      alias: taxQuery.alias,
    });
    if (!sent.ok) return { error: `e-Fatura: ${sent.error}` };

    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          invoiceNo,
          documentType: "EINVOICE",
          eDocumentProvider: settings.eDocumentProvider,
          docStatus: "PROCESSING",
          uuid: sent.uuid,
          belgeOid: sent.belgeOid,
          faturaNo: invoiceNo,
          lastError: null,
        },
      });
      await tx.stockItem.updateMany({
        where: { id: { in: selectedStockIds } },
        data: { isAvailable: false },
      });
    });

    revalidateInvoicePaths(invoice.locationId);
    revalidatePath(`/dashboard/invoices/${invoice.id}`);
    return {
      success: true,
      documentType: "EINVOICE",
      docStatus: "PROCESSING",
    };
  } catch (error) {
    console.error("[finalizeEDocumentInvoiceAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Fatura kesilirken hata oluştu.",
    };
  }
}
