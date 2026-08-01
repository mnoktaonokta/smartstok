"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatProductSize } from "@/lib/product-format";
import { assertCanMutate, mutationDeniedMessage } from "@/lib/roles";
import {
  getFirmInventory,
  queryInventoryByUno,
  type UtsInventoryItem,
} from "@/lib/services/utsService";
import { sendVermeBildirimi } from "@/lib/uts-api";
import { resolveUtsCredentials } from "@/lib/services/app-credentials";

export type UtsItemResult = {
  id: string;
  success: boolean;
  errorMessage?: string;
  notificationId?: string;
};

export type UtsPendingRow = {
  id: string;
  locationId: string;
  lotNumber: string;
  serialNumber: string | null;
  referenceCode: string;
  productName: string;
  brand: string;
  barcode: string | null;
  sizeLabel: string | null;
  locationName: string;
  customerName: string | null;
  customerVkn: string | null;
  invoiceNo: string | null;
  updatedAt: string;
  /** Son bildirim denemesinden gelen satır hatası (yalnızca client state) */
  errorMessage?: string | null;
};

export type UtsPendingGroup = {
  locationId: string;
  locationName: string;
  customerName: string | null;
  customerVkn: string | null;
  pendingCount: number;
  items: UtsPendingRow[];
};

/** Yalnızca utsStatus: PENDING ürünleri depo bazında gruplar. */
export async function listUtsPendingGroupsAction(): Promise<UtsPendingGroup[]> {
  const items = await prisma.stockItem.findMany({
    where: {
      isAvailable: false,
      utsStatus: "PENDING",
    },
    include: {
      product: {
        select: {
          referenceCode: true,
          name: true,
          brand: true,
          barcode: true,
          diameter: true,
          length: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
          customer: { select: { name: true, vknTckn: true } },
        },
      },
      invoiceItems: {
        take: 1,
        orderBy: { invoice: { createdAt: "desc" } },
        include: {
          invoice: { select: { invoiceNo: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });

  const groups = new Map<string, UtsPendingGroup>();

  for (const item of items) {
    const locationId = item.location.id;
    const row: UtsPendingRow = {
      id: item.id,
      locationId,
      lotNumber: item.lotNumber,
      serialNumber: item.serialNumber,
      referenceCode: item.product.referenceCode,
      productName: item.product.name,
      brand: item.product.brand,
      barcode: item.product.barcode,
      sizeLabel: formatProductSize(item.product.diameter, item.product.length),
      locationName: item.location.name,
      customerName: item.location.customer?.name ?? null,
      customerVkn: item.location.customer?.vknTckn ?? null,
      invoiceNo: item.invoiceItems[0]?.invoice.invoiceNo ?? null,
      updatedAt: item.updatedAt.toISOString(),
    };

    const existing = groups.get(locationId);
    if (existing) {
      existing.items.push(row);
      existing.pendingCount = existing.items.length;
    } else {
      groups.set(locationId, {
        locationId,
        locationName: item.location.name,
        customerName: item.location.customer?.name ?? null,
        customerVkn: item.location.customer?.vknTckn ?? null,
        pendingCount: 1,
        items: [row],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.locationName.localeCompare(b.locationName, "tr"),
  );
}

/** @deprecated Yerine listUtsPendingGroupsAction kullanın */
export async function listUtsPendingAction(): Promise<UtsPendingRow[]> {
  const groups = await listUtsPendingGroupsAction();
  return groups.flatMap((g) => g.items);
}

export type NotifyUtsActionResult = {
  error?: string;
  successCount?: number;
  failCount?: number;
  summary?: string;
  results?: UtsItemResult[];
};

function resolveUno(barcode: string | null, referenceCode: string): string {
  const fromBarcode = barcode?.trim();
  if (fromBarcode) return fromBarcode;
  return referenceCode.trim();
}

/**
 * Seçili stok kalemlerini ÜTS’ye Verme bildirimi olarak gönderir.
 * alanKurumNo = Customer.utsInstitutionNumber (VKN kullanılmaz).
 * Yalnızca success dönenlerin utsStatus değeri SUCCESS yapılır.
 */
export async function notifySelectedToUtsAction(
  stockItemIds: string[],
): Promise<NotifyUtsActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = z.array(z.string().min(1)).min(1).safeParse(stockItemIds);
    if (!parsed.success) {
      return { error: "En az bir ürün seçilmeli." };
    }

    const utsCreds = await resolveUtsCredentials();
    const gonderenKurumNo = utsCreds.firmNo;
    if (!gonderenKurumNo) {
      return {
        error:
          "ÜTS yapılandırması eksik: ÜTS Firma No tanımlı değil. Admin → Firma Bilgileri’nden girin.",
      };
    }

    const items = await prisma.stockItem.findMany({
      where: {
        id: { in: parsed.data },
        isAvailable: false,
        utsStatus: "PENDING",
      },
      include: {
        product: {
          select: {
            barcode: true,
            referenceCode: true,
          },
        },
        location: {
          select: {
            customer: {
              select: {
                utsInstitutionNumber: true,
                name: true,
              },
            },
          },
        },
        invoiceItems: {
          take: 1,
          orderBy: { invoice: { createdAt: "desc" } },
          include: {
            invoice: { select: { invoiceNo: true } },
          },
        },
      },
    });

    if (items.length === 0) {
      return { error: "Seçilen ürünler bekleyen listesinde bulunamadı." };
    }

    const allResults: UtsItemResult[] = [];

    for (const item of items) {
      const alanKurumNo = item.location.customer?.utsInstitutionNumber?.trim();
      if (!alanKurumNo) {
        allResults.push({
          id: item.id,
          success: false,
          errorMessage:
            "ÜTS Kurum No eksik. Lütfen müşteri kartından VKN ile sorgulatarak ekleyin.",
        });
        continue;
      }

      const invoiceNo = item.invoiceItems[0]?.invoice.invoiceNo?.trim();
      if (!invoiceNo) {
        allResults.push({
          id: item.id,
          success: false,
          errorMessage: "Hata: Fatura numarası bulunamadı.",
        });
        continue;
      }

      const urunBarkodu = resolveUno(
        item.product.barcode,
        item.product.referenceCode,
      );
      if (!urunBarkodu) {
        allResults.push({
          id: item.id,
          success: false,
          errorMessage:
            "Hata: Ürün barkodu / ÜTS ürün numarası tanımlı değil.",
        });
        continue;
      }

      const vermePayload = {
        gonderenKurumNo,
        alanKurumNo,
        urunBarkodu,
        lotBrcNo: item.lotNumber,
        miktar: 1,
        belgeNo: invoiceNo,
      };

      console.log("[ÜTS] notifySelectedToUtsAction → kalem", {
        stockItemId: item.id,
        customerName: item.location.customer?.name ?? null,
        payload: vermePayload,
      });

      try {
        const apiResult = await sendVermeBildirimi(vermePayload);
        console.log("[ÜTS] notifySelectedToUtsAction → kalem başarılı", {
          stockItemId: item.id,
          notificationId: apiResult.notificationId,
        });
        allResults.push({
          id: item.id,
          success: true,
          notificationId: apiResult.notificationId,
        });
      } catch (itemError) {
        const message =
          itemError instanceof Error
            ? itemError.message
            : "ÜTS bildirimi sırasında beklenmeyen bir hata oluştu.";
        console.error("[ÜTS] notifySelectedToUtsAction → kalem hata", {
          stockItemId: item.id,
          payload: vermePayload,
          error: message,
          itemError,
        });
        allResults.push({
          id: item.id,
          success: false,
          errorMessage: message,
        });
      }
    }

    const successIds = allResults.filter((r) => r.success).map((r) => r.id);

    if (successIds.length > 0) {
      await prisma.stockItem.updateMany({
        where: {
          id: { in: successIds },
          isAvailable: false,
          utsStatus: "PENDING",
        },
        data: { utsStatus: "SUCCESS" },
      });
    }

    revalidatePath("/dashboard/uts-tracking");

    const successCount = allResults.filter((r) => r.success).length;
    const failCount = allResults.filter((r) => !r.success).length;
    const uniqueErrors = [
      ...new Set(
        allResults
          .filter((r) => !r.success)
          .map((r) => r.errorMessage?.trim())
          .filter((m): m is string => Boolean(m)),
      ),
    ];

    let summary: string;
    if (successCount > 0 && failCount === 0) {
      summary = `${successCount} ürün başarıyla ÜTS’ye bildirildi.`;
    } else if (successCount > 0 && failCount > 0) {
      summary = `${successCount} ürün bildirildi, ${failCount} üründe hata var.`;
    } else {
      summary = `${failCount} üründe bildirim yapılamadı.`;
    }

    if (uniqueErrors.length > 0) {
      summary += `\n\nSebep:\n${uniqueErrors.map((e) => `• ${e}`).join("\n")}`;

      const needsKurumNo = uniqueErrors.some((e) =>
        e.toLocaleLowerCase("tr-TR").includes("kurum no"),
      );
      if (needsKurumNo) {
        summary +=
          "\n\nNe yapmalısınız?\nMüşteriler sayfasından ilgili kliniği düzenleyin → «ÜTS'den Sorgula» ile Kurum No’yu alın → Kaydet → buradan tekrar bildirin.";
      }
    }

    return {
      successCount,
      failCount,
      summary,
      results: allResults,
    };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[ÜTS] notifySelectedToUtsAction → genel hata", error);
    const message =
      error instanceof Error
        ? error.message
        : "ÜTS bildirimi sırasında beklenmeyen bir hata oluştu.";
    return { error: message };
  }
}

export async function queryUtsFirmInventoryAction(): Promise<{
  error?: string;
  items?: UtsInventoryItem[];
  notices?: string[];
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }

    const result = await getFirmInventory();
    if (result.items.length > 0) {
      return { items: result.items, notices: result.notices };
    }

    // Liste API’leri boşsa: SmartStok’taki barkodlarla tekil sorgu (UNO zorunlu API)
    const products = await prisma.product.findMany({
      where: {
        OR: [{ barcode: { not: null } }, { referenceCode: { not: "" } }],
      },
      select: { barcode: true, referenceCode: true, name: true },
      take: 200,
    });

    const codes = Array.from(
      new Set(
        products
          .flatMap((p) => [p.barcode?.trim(), p.referenceCode?.trim()])
          .filter(
            (c): c is string =>
              typeof c === "string" && /^\d{8,14}$/.test(c),
          ),
      ),
    );

    const merged: UtsInventoryItem[] = [];
    const seen = new Set<string>();
    const notices = [...(result.notices ?? [])];

    for (const code of codes) {
      const rows = await queryInventoryByUno(code);
      for (const row of rows) {
        const key = `${row.barcode}::${row.lotNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!row.productName) {
          const hit = products.find(
            (p) => p.barcode === code || p.referenceCode === code,
          );
          row.productName = hit?.name;
        }
        merged.push(row);
      }
    }

    if (merged.length > 0) {
      notices.push(
        "Liste, SmartStok ürün barkodlarıyla tekil ÜTS sorgusu üzerinden dolduruldu.",
      );
      return { items: merged, notices };
    }

    return { items: [], notices };
  } catch (error) {
    console.error(error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "ÜTS envanter sorgusu başarısız oldu.",
    };
  }
}
