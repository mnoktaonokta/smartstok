"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcLineAmounts } from "@/services/bizimHesap";
import { assertCanMutate } from "@/lib/roles";
import { EDocumentFactory } from "@/lib/services/edocument/EDocumentFactory";
import {
  buildInvoiceUbl,
  createEttn,
  createGibDocumentId,
  gibSeriesYearPrefix,
  parseGibDocumentSequence,
} from "@/lib/services/edocument/ubl/buildInvoiceUbl";
import { buildTibbiCihazIdentificationIds } from "@/lib/services/edocument/ubl/tibbi-cihaz";
import {
  buildInvoiceDocumentNote,
  extractIbanFromText,
} from "@/lib/services/edocument/invoice-note";
import {
  buildPublicEntityUblExtras,
  resolveInvoiceProfileId,
} from "@/lib/services/edocument/kamu-invoice";
import type { UblParty } from "@/lib/services/edocument/types";
import { getOrCreateCompanySettings } from "@/lib/services/erp/company-settings";
import { ublLogoFromSettings } from "@/lib/services/edocument/ubl/xslt/load-xslt";

const TAX_RATE = 10;

async function nextGibDocumentId(
  documentType: "EARCHIVE" | "EINVOICE",
  year: number,
): Promise<string> {
  const series =
    (documentType === "EARCHIVE"
      ? process.env.EDOC_SERIES_EARCHIVE
      : process.env.EDOC_SERIES_EINVOICE
    )?.trim() ||
    (documentType === "EARCHIVE" ? "SSA" : "SSE");

  const prefix = gibSeriesYearPrefix(series, year);
  const recent = await prisma.invoice.findMany({
    where: {
      OR: [
        { invoiceNo: { startsWith: prefix } },
        { faturaNo: { startsWith: prefix } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
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

const createSchema = z.object({
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

export async function createQnbInvoiceAction(
  input: z.infer<typeof createSchema>,
): Promise<{
  error?: string;
  success?: boolean;
  invoiceId?: string;
  documentType?: "EARCHIVE" | "EINVOICE";
  docStatus?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const parsed = createSchema.safeParse(input);
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
    if (!settings.companyName || !(settings.qnbVkn || settings.vkn)) {
      return {
        error:
          "Firma unvanı ve VKN gerekli. Admin → Firma Bilgileri’ni doldurun.",
      };
    }

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };
    const provider = factory.provider;

    const taxQuery = await provider.queryTaxpayer(customer.vknTckn);
    if (!taxQuery.ok) return { error: `Mükellef sorgu: ${taxQuery.error}` };

    const isPublicEntity = customer.isPublicEntity;
    if (isPublicEntity && !taxQuery.isEInvoiceUser) {
      return {
        error:
          "Kamu kurumu e-Fatura mükellefi olmalı (KAMUFATURASI). e-Arşiv ile kesilemez.",
      };
    }

    const isEInvoice = isPublicEntity ? true : taxQuery.isEInvoiceUser;
    const documentType = isEInvoice ? "EINVOICE" : "EARCHIVE";

    const selectedStockIds: string[] = [];
    const detailLines: Array<{
      stockItemIds: string[];
      productName: string;
      referenceCode: string;
      barcode: string | null;
      lotNumber: string;
      expiryDate: Date | null;
      quantity: number;
      unitPrice: number;
      discount: number;
      amounts: ReturnType<typeof calcLineAmounts>;
      units: Array<{
        uno: string;
        lno: string;
        sno: string | null;
        productionDate: Date | null;
        expiryDate: Date | null;
      }>;
    }> = [];

    for (const line of parsed.data.lines) {
      const available = await prisma.stockItem.findMany({
        where: {
          productId: line.productId,
          locationId: location.id,
          lotNumber: line.lotNumber,
          isAvailable: true,
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
      const barcode = product.barcode?.trim() || null;
      if (!barcode) {
        return {
          error: `${product.referenceCode} ${product.name}: UNO (ürün barkodu) zorunlu.`,
        };
      }
      const amounts = calcLineAmounts({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        discount: line.discount,
        taxRate: TAX_RATE,
      });
      const ids = available.map((s) => s.id);
      selectedStockIds.push(...ids);
      detailLines.push({
        stockItemIds: ids,
        productName: `${product.referenceCode} ${product.name}`.trim(),
        referenceCode: product.referenceCode,
        barcode,
        lotNumber: line.lotNumber,
        expiryDate: available[0].expiryDate ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        amounts,
        units: available.map((s) => ({
          uno: barcode,
          lno: s.lotNumber,
          sno: s.serialNumber?.trim() || null,
          productionDate:
            s.productionDate ?? product.productionDate ?? null,
          expiryDate: s.expiryDate ?? product.expiryDate ?? null,
        })),
      });
    }

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

    const supplierVkn = (
      settings.qnbVkn ||
      settings.vkn ||
      ""
    ).trim();

    let profileId = resolveInvoiceProfileId({
      isPublicEntity,
      isEInvoice,
    });
    let buyer: UblParty | null = null;
    let paymentIban: string | null = null;
    let note = buildInvoiceDocumentNote(
      parsed.data.note,
      settings.bankAccountInfo,
    );

    if (isPublicEntity) {
      const kamu = buildPublicEntityUblExtras(
        customer,
        settings.bankAccountInfo,
        parsed.data.note,
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
        vknTckn: customer.vknTckn,
        name: customer.name,
        taxOffice: customer.taxOffice,
        address: customer.address,
        phone: customer.phone,
      },
      buyer,
      paymentIban:
        paymentIban ?? extractIbanFromText(settings.bankAccountInfo),
      logo: ublLogoFromSettings(settings),
      issueTime: now.toISOString().slice(11, 19),
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
      const invoice = await prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            invoiceNo,
            customerId: customer.id,
            documentType: "EARCHIVE",
            eDocumentProvider: settings.eDocumentProvider,
            docStatus: "COMPLETED",
            uuid: sent.uuid,
            faturaNo: sent.faturaNo ?? invoiceNo,
            externalViewUrl: sent.faturaURL ?? null,
            pdfData: pdf ? new Uint8Array(pdf) : undefined,
            lastError: pdf
              ? null
              : "PDF henüz oluşmadı. Biraz bekleyip PDF yenile deneyin.",
          },
        });
        for (const line of detailLines) {
          const unitDiscount = line.discount / line.quantity;
          for (const stockItemId of line.stockItemIds) {
            await tx.invoiceItem.create({
              data: {
                invoiceId: created.id,
                stockItemId,
                salePrice: line.unitPrice,
                discount: unitDiscount,
              },
            });
          }
        }
        await finalizeStock(tx, selectedStockIds);
        return created;
      });

      revalidatePaths(location.id);
      return {
        success: true,
        invoiceId: invoice.id,
        documentType: "EARCHIVE",
        docStatus: "COMPLETED",
      };
    }

    // e-Fatura: asenkron — stok rezerve (isAvailable=false), ÜTS COMPLETED’ta
    const sent = await provider.sendEInvoice({
      ublXml,
      uuid,
      alias: taxQuery.alias,
    });
    if (!sent.ok) return { error: `e-Fatura: ${sent.error}` };

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNo,
          customerId: customer.id,
          documentType: "EINVOICE",
          eDocumentProvider: settings.eDocumentProvider,
          docStatus: "PROCESSING",
          uuid: sent.uuid,
          belgeOid: sent.belgeOid,
          faturaNo: invoiceNo,
        },
      });
      for (const line of detailLines) {
        const unitDiscount = line.discount / line.quantity;
        for (const stockItemId of line.stockItemIds) {
          await tx.invoiceItem.create({
            data: {
              invoiceId: created.id,
              stockItemId,
              salePrice: line.unitPrice,
              discount: unitDiscount,
            },
          });
        }
      }
      await tx.stockItem.updateMany({
        where: { id: { in: selectedStockIds } },
        data: { isAvailable: false },
      });
      return created;
    });

    revalidatePaths(location.id);
    return {
      success: true,
      invoiceId: invoice.id,
      documentType: "EINVOICE",
      docStatus: "PROCESSING",
    };
  } catch (error) {
    console.error("[createQnbInvoiceAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "E-belge faturası oluşturulurken hata oluştu.",
    };
  }
}

export async function refreshQnbInvoiceStatusAction(
  invoiceId: string,
): Promise<{ error?: string; success?: boolean; docStatus?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: { select: { stockItemId: true } } },
    });
    if (!invoice) return { error: "Fatura bulunamadı." };
    if (invoice.documentType !== "EINVOICE") {
      return { error: "Durum sorgusu yalnızca e-Fatura için geçerlidir." };
    }
    if (!invoice.belgeOid && !invoice.uuid) {
      return { error: "belgeOid / uuid yok." };
    }
    if (invoice.docStatus === "COMPLETED") {
      return { success: true, docStatus: "COMPLETED" };
    }

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };

    const ref = invoice.belgeOid || invoice.uuid!;
    const docOpts = {
      documentType: "EINVOICE" as const,
      uuid: invoice.uuid,
    };

    const status = await factory.provider.getOutgoingStatus(ref, docOpts);
    if (!status.ok) return { error: status.error };

    if (status.status === "PROCESSING") {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { docStatus: "PROCESSING", lastError: status.message },
      });
      return { success: true, docStatus: "PROCESSING" };
    }

    if (status.status === "FAILED") {
      const stockIds = invoice.items.map((i) => i.stockItemId);
      await prisma.$transaction(async (tx) => {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            docStatus: "FAILED",
            lastError: status.message ?? "QNB işlem hatası",
          },
        });
        await tx.stockItem.updateMany({
          where: { id: { in: stockIds } },
          data: { isAvailable: true },
        });
      });
      revalidatePath("/dashboard/invoices");
      revalidatePath("/dashboard/depots");
      return { success: true, docStatus: "FAILED" };
    }

    let pdf = decodePdf(status.pdfBase64);
    let viewUrl = status.faturaURL ?? null;
    if (!pdf) {
      const dl = await factory.provider.downloadOutgoing(ref, docOpts);
      if (dl.ok) {
        pdf = decodePdf(dl.pdfBase64);
        viewUrl = viewUrl ?? dl.faturaURL ?? null;
      }
    }

    const stockIds = invoice.items.map((i) => i.stockItemId);
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          docStatus: "COMPLETED",
          faturaNo: status.faturaNo ?? invoice.faturaNo,
          externalViewUrl: viewUrl,
          pdfData: pdf ? new Uint8Array(pdf) : undefined,
          lastError: null,
        },
      });
      await finalizeStock(tx, stockIds);
    });

    revalidatePath("/dashboard/invoices");
    revalidatePath("/dashboard/uts-tracking");
    revalidatePath("/dashboard/depots");
    return { success: true, docStatus: "COMPLETED" };
  } catch (error) {
    console.error("[refreshQnbInvoiceStatusAction]", error);
    return { error: "Durum sorgulanamadı." };
  }
}

export async function fetchInvoicePdfAction(
  invoiceId: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return { error: "Fatura bulunamadı." };
    if (!invoice.uuid && !invoice.belgeOid) {
      return { error: "UUID / belgeOid yok; PDF çekilemez." };
    }
    if (
      invoice.documentType !== "EARCHIVE" &&
      invoice.documentType !== "EINVOICE"
    ) {
      return { error: "Bu fatura tipi için e-belge PDF’si yok." };
    }

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };

    const ref = invoice.belgeOid || invoice.uuid!;
    const docOpts = {
      documentType:
        invoice.documentType === "EARCHIVE"
          ? ("EARCHIVE" as const)
          : ("EINVOICE" as const),
      uuid: invoice.uuid,
    };

    const dl = await factory.provider.downloadOutgoing(ref, docOpts);
    if (!dl.ok) return { error: dl.error };
    const pdf = decodePdf(dl.pdfBase64);
    if (!pdf) {
      return {
        error:
          "İndirilen içerik geçerli PDF değil. Birkaç saniye sonra tekrar deneyin.",
      };
    }

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        pdfData: new Uint8Array(pdf),
        externalViewUrl: dl.faturaURL ?? invoice.externalViewUrl,
        lastError: null,
      },
    });

    revalidatePath("/dashboard/invoices");
    return { success: true };
  } catch (error) {
    console.error("[fetchInvoicePdfAction]", error);
    return {
      error:
        error instanceof Error ? error.message : "PDF indirilemedi.",
    };
  }
}

function revalidatePaths(locationId: string) {
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/e-belge-fatura");
  revalidatePath("/dashboard/uts-tracking");
  revalidatePath("/dashboard/depots");
  revalidatePath(`/dashboard/depots/${locationId}`);
}
