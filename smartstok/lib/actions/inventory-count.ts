"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureMainDepot } from "@/lib/inventory";
import {
  assertCanMutate,
  canAccessInboundReceipt,
  hasRole,
  mutationDeniedMessage,
} from "@/lib/roles";
import { extractBarcodeOnly } from "@/lib/utils/barcode-parser";

export type InventoryCountListItem = {
  id: string;
  status: "DRAFT" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  totalDifference: number;
  matchedCount: number;
  shortCount: number;
  overCount: number;
};

export type InventoryCountLine = {
  id: string;
  productId: string;
  productName: string;
  referenceCode: string;
  barcode: string | null;
  brand: string;
  expectedQuantity: number;
  countedQuantity: number;
  difference: number;
};

export type InventoryCountDetail = {
  id: string;
  status: "DRAFT" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
  items: InventoryCountLine[];
};

function revalidateCountPaths(countId?: string) {
  revalidatePath("/dashboard/sayim");
  revalidatePath("/dashboard/depots");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
  if (countId) {
    revalidatePath(`/dashboard/sayim/${countId}`);
  }
}

async function requireCountAccess(mutate: boolean) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Oturum bulunamadı." as const, session: null };
  }
  const roles = session.user.roles;
  // Admin + Depo (mal kabul ile aynı yetki yüzeyi); Gözlemci salt okur
  if (!canAccessInboundReceipt(roles) && !hasRole(roles, "OBSERVER")) {
    return {
      error: "Bu sayfaya erişim yetkiniz yok." as const,
      session: null,
    };
  }
  if (mutate) {
    try {
      assertCanMutate(roles);
    } catch (e) {
      return {
        error: mutationDeniedMessage(e) ?? "Değişiklik yapılamaz.",
        session: null,
      };
    }
    if (!canAccessInboundReceipt(roles)) {
      return {
        error: "Sayım işlemi için ADMIN veya DEPO yetkisi gerekli." as const,
        session: null,
      };
    }
  }
  return { error: null, session };
}

function mapLine(item: {
  id: string;
  productId: string;
  expectedQuantity: number;
  countedQuantity: number;
  product: {
    name: string;
    referenceCode: string;
    barcode: string | null;
    brand: string;
  };
}): InventoryCountLine {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    referenceCode: item.product.referenceCode,
    barcode: item.product.barcode,
    brand: item.product.brand,
    expectedQuantity: item.expectedQuantity,
    countedQuantity: item.countedQuantity,
    difference: item.countedQuantity - item.expectedQuantity,
  };
}

/** Geçmiş / aktif sayım fişleri */
export async function listInventoryCountsAction(): Promise<{
  error?: string;
  counts?: InventoryCountListItem[];
}> {
  const gate = await requireCountAccess(false);
  if (gate.error) return { error: gate.error };

  const rows = await prisma.inventoryCount.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        select: {
          expectedQuantity: true,
          countedQuantity: true,
        },
      },
    },
  });

  const counts: InventoryCountListItem[] = rows.map((row) => {
    let totalDifference = 0;
    let matchedCount = 0;
    let shortCount = 0;
    let overCount = 0;
    for (const item of row.items) {
      const diff = item.countedQuantity - item.expectedQuantity;
      totalDifference += Math.abs(diff);
      if (diff === 0) matchedCount += 1;
      else if (diff < 0) shortCount += 1;
      else overCount += 1;
    }
    return {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      itemCount: row.items.length,
      totalDifference,
      matchedCount,
      shortCount,
      overCount,
    };
  });

  return { counts };
}

/** Merkez depo stok snapshot’ı ile yeni DRAFT sayım fişi */
export async function startInventoryCountAction(): Promise<{
  error?: string;
  countId?: string;
}> {
  try {
    const gate = await requireCountAccess(true);
    if (gate.error) return { error: gate.error };

    const open = await prisma.inventoryCount.findFirst({
      where: { status: "DRAFT" },
      select: { id: true },
    });
    if (open) {
      return {
        error:
          "Zaten açık bir taslak sayım var. Önce onu tamamlayın veya onu silin.",
      };
    }

    const mainDepot = await ensureMainDepot();

    const stockGroups = await prisma.stockItem.groupBy({
      by: ["productId"],
      where: {
        locationId: mainDepot.id,
        isAvailable: true,
      },
      _count: { _all: true },
    });

    // Stokta 0 olan aktif ürünler de dahil — fazla sayım / eksik katalog yakalama
    const activeProducts = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    const qtyByProduct = new Map(
      stockGroups.map((g) => [g.productId, g._count._all]),
    );
    for (const p of activeProducts) {
      if (!qtyByProduct.has(p.id)) qtyByProduct.set(p.id, 0);
    }

    if (qtyByProduct.size === 0) {
      return { error: "Sayılacak aktif ürün bulunamadı." };
    }

    const count = await prisma.inventoryCount.create({
      data: {
        status: "DRAFT",
        items: {
          create: Array.from(qtyByProduct.entries()).map(
            ([productId, expectedQuantity]) => ({
              productId,
              expectedQuantity,
              countedQuantity: 0,
            }),
          ),
        },
      },
      select: { id: true },
    });

    revalidateCountPaths(count.id);
    return { countId: count.id };
  } catch (error) {
    console.error("[startInventoryCountAction]", error);
    return { error: "Sayım fişi oluşturulamadı." };
  }
}

/** Yalnızca DRAFT sayım fişini siler (stok değişmez) */
export async function deleteInventoryCountDraftAction(
  countId: string,
): Promise<{ error?: string; ok?: boolean }> {
  try {
    const gate = await requireCountAccess(true);
    if (gate.error) return { error: gate.error };

    const row = await prisma.inventoryCount.findUnique({
      where: { id: countId },
      select: { id: true, status: true },
    });
    if (!row) return { error: "Sayım fişi bulunamadı." };
    if (row.status !== "DRAFT") {
      return { error: "Yalnızca taslak sayımlar silinebilir." };
    }

    await prisma.inventoryCount.delete({ where: { id: countId } });
    revalidateCountPaths(countId);
    return { ok: true };
  } catch (error) {
    console.error("[deleteInventoryCountDraftAction]", error);
    return { error: "Sayım fişi silinemedi." };
  }
}

export async function getInventoryCountAction(
  countId: string,
): Promise<{ error?: string; count?: InventoryCountDetail }> {
  const gate = await requireCountAccess(false);
  if (gate.error) return { error: gate.error };

  const row = await prisma.inventoryCount.findUnique({
    where: { id: countId },
    include: {
      items: {
        include: {
          product: {
            select: {
              name: true,
              referenceCode: true,
              barcode: true,
              brand: true,
            },
          },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });

  if (!row) return { error: "Sayım fişi bulunamadı." };

  return {
    count: {
      id: row.id,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items: row.items.map(mapLine),
    },
  };
}

/** Taslak kaydet — stoklara dokunmaz */
export async function saveInventoryCountDraftAction(input: {
  countId: string;
  items: Array<{ id: string; countedQuantity: number }>;
}): Promise<{ error?: string; success?: boolean }> {
  try {
    const gate = await requireCountAccess(true);
    if (gate.error) return { error: gate.error };

    const count = await prisma.inventoryCount.findUnique({
      where: { id: input.countId },
      select: { id: true, status: true },
    });
    if (!count) return { error: "Sayım fişi bulunamadı." };
    if (count.status !== "DRAFT") {
      return { error: "Tamamlanmış sayım düzenlenemez." };
    }

    await prisma.$transaction(
      input.items.map((item) =>
        prisma.inventoryCountItem.updateMany({
          where: { id: item.id, countId: input.countId },
          data: {
            countedQuantity: Math.max(
              0,
              Math.floor(Number(item.countedQuantity) || 0),
            ),
          },
        }),
      ),
    );

    await prisma.inventoryCount.update({
      where: { id: input.countId },
      data: { updatedAt: new Date() },
    });

    revalidateCountPaths(input.countId);
    return { success: true };
  } catch (error) {
    console.error("[saveInventoryCountDraftAction]", error);
    return { error: "Taslak kaydedilemedi." };
  }
}

/** Barkod okut → countedQuantity +1 */
export async function incrementCountByBarcodeAction(input: {
  countId: string;
  barcode: string;
}): Promise<{
  error?: string;
  item?: InventoryCountLine;
}> {
  try {
    const gate = await requireCountAccess(true);
    if (gate.error) return { error: gate.error };

    const code = extractBarcodeOnly(input.barcode).trim();
    if (!code) return { error: "Barkod gerekli." };

    const count = await prisma.inventoryCount.findUnique({
      where: { id: input.countId },
      select: { id: true, status: true },
    });
    if (!count) return { error: "Sayım fişi bulunamadı." };
    if (count.status !== "DRAFT") {
      return { error: "Tamamlanmış sayıma ürün eklenemez." };
    }

    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { barcode: code },
          { referenceCode: { equals: code, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (!product) {
      return { error: `Barkod sistemde yok: ${code}` };
    }

    let item = await prisma.inventoryCountItem.findUnique({
      where: {
        countId_productId: {
          countId: input.countId,
          productId: product.id,
        },
      },
      include: {
        product: {
          select: {
            name: true,
            referenceCode: true,
            barcode: true,
            brand: true,
          },
        },
      },
    });

    if (!item) {
      // Fişe sonradan eklenen ürün
      const mainDepot = await ensureMainDepot();
      const expectedQuantity = await prisma.stockItem.count({
        where: {
          productId: product.id,
          locationId: mainDepot.id,
          isAvailable: true,
        },
      });
      item = await prisma.inventoryCountItem.create({
        data: {
          countId: input.countId,
          productId: product.id,
          expectedQuantity,
          countedQuantity: 1,
        },
        include: {
          product: {
            select: {
              name: true,
              referenceCode: true,
              barcode: true,
              brand: true,
            },
          },
        },
      });
    } else {
      item = await prisma.inventoryCountItem.update({
        where: { id: item.id },
        data: { countedQuantity: { increment: 1 } },
        include: {
          product: {
            select: {
              name: true,
              referenceCode: true,
              barcode: true,
              brand: true,
            },
          },
        },
      });
    }

    await prisma.inventoryCount.update({
      where: { id: input.countId },
      data: { updatedAt: new Date() },
    });

    revalidateCountPaths(input.countId);
    return { item: mapLine(item) };
  } catch (error) {
    console.error("[incrementCountByBarcodeAction]", error);
    return { error: "Barkod işlenemedi." };
  }
}

/** Satırda manuel miktar */
export async function setCountItemQuantityAction(input: {
  countId: string;
  itemId: string;
  countedQuantity: number;
}): Promise<{ error?: string; item?: InventoryCountLine }> {
  try {
    const gate = await requireCountAccess(true);
    if (gate.error) return { error: gate.error };

    const count = await prisma.inventoryCount.findUnique({
      where: { id: input.countId },
      select: { status: true },
    });
    if (!count) return { error: "Sayım fişi bulunamadı." };
    if (count.status !== "DRAFT") {
      return { error: "Tamamlanmış sayım düzenlenemez." };
    }

    const qty = Math.max(0, Math.floor(Number(input.countedQuantity) || 0));
    const item = await prisma.inventoryCountItem.updateMany({
      where: { id: input.itemId, countId: input.countId },
      data: { countedQuantity: qty },
    });
    if (item.count === 0) return { error: "Satır bulunamadı." };

    const updated = await prisma.inventoryCountItem.findUnique({
      where: { id: input.itemId },
      include: {
        product: {
          select: {
            name: true,
            referenceCode: true,
            barcode: true,
            brand: true,
          },
        },
      },
    });
    if (!updated) return { error: "Satır bulunamadı." };

    await prisma.inventoryCount.update({
      where: { id: input.countId },
      data: { updatedAt: new Date() },
    });

    revalidateCountPaths(input.countId);
    return { item: mapLine(updated) };
  } catch (error) {
    console.error("[setCountItemQuantityAction]", error);
    return { error: "Miktar güncellenemedi." };
  }
}

/**
 * Stokları countedQuantity ile eşitle + COMPLETED.
 * Eksik → isAvailable=false; fazla → SAYIM-YYYYMMDD lot ile ekle.
 */
export async function completeInventoryCountAction(
  countId: string,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const gate = await requireCountAccess(true);
    if (gate.error) return { error: gate.error };

    const count = await prisma.inventoryCount.findUnique({
      where: { id: countId },
      include: {
        items: {
          select: {
            productId: true,
            countedQuantity: true,
          },
        },
      },
    });
    if (!count) return { error: "Sayım fişi bulunamadı." };
    if (count.status !== "DRAFT") {
      return { error: "Bu sayım zaten tamamlanmış." };
    }

    const mainDepot = await ensureMainDepot();
    const lotNumber = `SAYIM-${new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "")}`;

    await prisma.$transaction(async (tx) => {
      for (const line of count.items) {
        const target = Math.max(0, Math.floor(line.countedQuantity));
        const available = await tx.stockItem.findMany({
          where: {
            productId: line.productId,
            locationId: mainDepot.id,
            isAvailable: true,
          },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });
        const current = available.length;

        if (target > current) {
          const add = target - current;
          await tx.stockItem.createMany({
            data: Array.from({ length: add }, () => ({
              productId: line.productId,
              lotNumber,
              locationId: mainDepot.id,
              isAvailable: true,
            })),
          });
        } else if (target < current) {
          const removeIds = available.slice(target).map((i) => i.id);
          await tx.stockItem.updateMany({
            where: { id: { in: removeIds } },
            data: { isAvailable: false, utsStatus: "SUCCESS" },
          });
        }
      }

      await tx.inventoryCount.update({
        where: { id: countId },
        data: { status: "COMPLETED" },
      });
    });

    revalidateCountPaths(countId);
    return { success: true };
  } catch (error) {
    console.error("[completeInventoryCountAction]", error);
    return { error: "Stoklar güncellenirken bir hata oluştu." };
  }
}
