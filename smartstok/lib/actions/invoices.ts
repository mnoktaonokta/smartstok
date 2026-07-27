"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  calcLineAmounts,
  formatBizimHesapAmount,
  postBizimHesapInvoice,
} from "@/services/bizimHesap";
import { assertCanMutate } from "@/lib/roles";
import { customerPortfolioWhere } from "@/lib/portfolio";
import type { UserRole } from "@/types/next-auth";

const TAX_RATE = 10;

export type InvoiceStockRow = {
  key: string;
  productId: string;
  referenceCode: string;
  productName: string;
  brand: string;
  barcode: string | null;
  lotNumber: string;
  available: number;
  stockItemIds: string[];
  defaultSalePrice: string;
};

export async function getInvoiceFormDataAction() {
  const session = await auth();
  const where = customerPortfolioWhere(
    session?.user?.id,
    session?.user?.roles as UserRole[] | undefined,
  );

  const customers = await prisma.customer.findMany({
    where,
    select: {
      id: true,
      name: true,
      vknTckn: true,
      taxOffice: true,
      address: true,
      phone: true,
      locations: {
        where: { type: "CLINIC_DEPOT" },
        select: { id: true, name: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return { customers };
}

export async function getLocationStockForInvoiceAction(
  locationId: string,
): Promise<InvoiceStockRow[]> {
  const items = await prisma.stockItem.findMany({
    where: {
      locationId,
      isAvailable: true,
    },
    include: {
      product: {
        select: {
          id: true,
          referenceCode: true,
          name: true,
          brand: true,
          barcode: true,
          salePrice: true,
        },
      },
    },
    orderBy: [{ lotNumber: "asc" }],
  });

  const map = new Map<string, InvoiceStockRow>();

  for (const item of items) {
    const key = `${item.productId}::${item.lotNumber}`;
    const existing = map.get(key);
    if (existing) {
      existing.available += 1;
      existing.stockItemIds.push(item.id);
    } else {
      map.set(key, {
        key,
        productId: item.product.id,
        referenceCode: item.product.referenceCode,
        productName: item.product.name,
        brand: item.product.brand,
        barcode: item.product.barcode,
        lotNumber: item.lotNumber,
        available: 1,
        stockItemIds: [item.id],
        defaultSalePrice: item.product.salePrice.toString(),
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.referenceCode.localeCompare(b.referenceCode, "tr"),
  );
}

const createInvoiceSchema = z.object({
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

export async function createInvoiceAction(
  input: z.infer<typeof createInvoiceSchema>,
): Promise<{
  error?: string;
  success?: boolean;
  invoiceId?: string;
  bizimHesapUrl?: string | null;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const firmId = process.env.BIZIMHESAP_FIRM_ID?.trim();
    if (!firmId) {
      return {
        error:
          "BIZIMHESAP_FIRM_ID tanımlı değil. .env dosyasına ekleyip sunucuyu yeniden başlatın.",
      };
    }

    const parsed = createInvoiceSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId },
    });

    if (!customer) {
      return { error: "Müşteri bulunamadı." };
    }

    const location = await prisma.location.findFirst({
      where: {
        id: parsed.data.locationId,
        customerId: customer.id,
        type: "CLINIC_DEPOT",
      },
    });

    if (!location) {
      return { error: "Seçilen konsinye deposu geçersiz." };
    }

    // Stokları kilitleyip seç
    const selectedStockIds: string[] = [];
    const detailLines: Array<{
      stockItemIds: string[];
      productId: string;
      productName: string;
      barcode: string | null;
      referenceCode: string;
      lotNumber: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      amounts: ReturnType<typeof calcLineAmounts>;
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
        include: {
          product: true,
        },
      });

      if (available.length < line.quantity) {
        return {
          error: `Lot ${line.lotNumber}: istenen ${line.quantity}, müsait ${available.length}.`,
        };
      }

      const product = available[0].product;
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
        productId: product.id,
        productName: `${product.referenceCode} ${product.name}`,
        barcode: product.barcode,
        referenceCode: product.referenceCode,
        lotNumber: line.lotNumber,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        amounts,
      });
    }

    const resolveBizimHesapProductId = (line: (typeof detailLines)[number]) => {
      const barcode = line.barcode?.trim();
      if (barcode) return barcode;

      const ref = line.referenceCode?.trim();
      if (ref) return ref;

      // Barkod ve referans yoksa kısa, okunabilir bir kod üret
      const nameSlug = line.productName
        .replace(/\s+/g, "-")
        .slice(0, 40)
        .toUpperCase();
      return nameSlug || "URUN";
    };

    const totals = detailLines.reduce(
      (acc, line) => ({
        gross: acc.gross + line.amounts.gross,
        discount: acc.discount + line.amounts.discount,
        net: acc.net + line.amounts.net,
        tax: acc.tax + line.amounts.tax,
        total: acc.total + line.amounts.total,
      }),
      { gross: 0, discount: 0, net: 0, tax: 0, total: 0 },
    );

    const now = new Date();
    const due = new Date(now);
    due.setDate(due.getDate() + 30);
    const invoiceNo = `SD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Date.now().toString(36).toUpperCase()}`;

    const payload = {
      firmId,
      invoiceNo,
      invoiceType: 3,
      note: parsed.data.note || "SmartStok konsinye faturalandırma",
      dates: {
        invoiceDate: now.toISOString(),
        dueDate: due.toISOString(),
        deliveryDate: now.toISOString(),
      },
      customer: {
        customerId: customer.id,
        title: customer.name,
        address: customer.address ?? undefined,
        taxOffice: customer.taxOffice ?? undefined,
        taxNo: customer.vknTckn,
        phone: customer.phone ?? undefined,
      },
      amounts: {
        currency: "TL",
        gross: formatBizimHesapAmount(totals.gross),
        discount: formatBizimHesapAmount(totals.discount),
        net: formatBizimHesapAmount(totals.net),
        tax: formatBizimHesapAmount(totals.tax),
        total: formatBizimHesapAmount(totals.total),
      },
      details: detailLines.map((line) => ({
        productId: resolveBizimHesapProductId(line),
        productName: line.productName,
        note: `Lot ${line.lotNumber}`,
        barcode: line.barcode ?? undefined,
        taxRate: TAX_RATE.toFixed(2),
        quantity: line.quantity,
        unitPrice: formatBizimHesapAmount(line.unitPrice),
        grossPrice: formatBizimHesapAmount(line.amounts.gross),
        discount: formatBizimHesapAmount(line.amounts.discount),
        net: formatBizimHesapAmount(line.amounts.net),
        tax: formatBizimHesapAmount(line.amounts.tax),
        total: formatBizimHesapAmount(line.amounts.total),
      })),
    };

    const apiResult = await postBizimHesapInvoice(payload);

    if (apiResult.error) {
      return { error: `Bizim Hesap: ${apiResult.error}` };
    }

    if (!apiResult.guid) {
      return { error: "Bizim Hesap GUID dönmedi; fatura kaydı yapılmadı." };
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNo,
          customerId: customer.id,
          bizimHesapGuid: apiResult.guid,
          bizimHesapUrl: apiResult.url || null,
        },
      });

      // Her fiziksel kutu için InvoiceItem
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
        data: {
          isAvailable: false,
          utsStatus: "PENDING",
        },
      });

      return created;
    });

    revalidatePath("/dashboard/invoices");
    revalidatePath("/dashboard/uts-tracking");
    revalidatePath("/dashboard/depots");
    revalidatePath(`/dashboard/depots/${location.id}`);

    return {
      success: true,
      invoiceId: invoice.id,
      bizimHesapUrl: invoice.bizimHesapUrl,
    };
  } catch (error) {
    console.error(error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Fatura oluşturulurken bir hata oluştu.",
    };
  }
}

export async function listInvoicesAction() {
  const invoices = await prisma.invoice.findMany({
    include: {
      customer: { select: { name: true, vknTckn: true } },
      items: { select: { id: true, salePrice: true, discount: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return invoices.map((inv) => {
    const itemCount = inv.items.length;
    const gross = inv.items.reduce(
      (s, i) => s + Number(i.salePrice) - Number(i.discount),
      0,
    );
    return {
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      createdAt: inv.createdAt.toISOString(),
      customerName: inv.customer?.name ?? "—",
      customerVkn: inv.customer?.vknTckn ?? "—",
      itemCount,
      netApprox: gross.toFixed(2),
      bizimHesapGuid: inv.bizimHesapGuid,
      bizimHesapUrl: inv.bizimHesapUrl,
    };
  });
}
