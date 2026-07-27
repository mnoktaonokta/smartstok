"use server";

import { prisma } from "@/lib/prisma";
import { formatProductLabel } from "@/lib/inventory";

export type ProductSearchHit = {
  productId: string;
  referenceCode: string;
  name: string;
  brand: string;
  barcode: string | null;
  diameter: number | null;
  length: number | null;
  totalCount: number;
  label: string;
};

/**
 * Referans kodu, ürün adı veya barkod ile anlık ürün arama.
 * Sonuçlar StockItem üzerinden gruplanır.
 */
export async function searchProductsAction(
  query: string,
  options?: { locationId?: string; onlyAvailable?: boolean },
): Promise<ProductSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const onlyAvailable = options?.onlyAvailable ?? true;

  const stockItems = await prisma.stockItem.findMany({
    where: {
      ...(onlyAvailable ? { isAvailable: true } : {}),
      ...(options?.locationId ? { locationId: options.locationId } : {}),
      product: {
        OR: [
          { referenceCode: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
        ],
      },
    },
    include: {
      product: true,
    },
    take: 500,
  });

  const grouped = new Map<
    string,
    {
      product: (typeof stockItems)[number]["product"];
      totalCount: number;
    }
  >();

  for (const item of stockItems) {
    const current = grouped.get(item.productId);
    if (current) {
      current.totalCount += 1;
    } else {
      grouped.set(item.productId, {
        product: item.product,
        totalCount: 1,
      });
    }
  }

  return Array.from(grouped.values())
    .map(({ product, totalCount }) => ({
      productId: product.id,
      referenceCode: product.referenceCode,
      name: product.name,
      brand: product.brand,
      barcode: product.barcode,
      diameter: product.diameter,
      length: product.length,
      totalCount,
      label: formatProductLabel({
        referenceCode: product.referenceCode,
        name: product.name,
        diameter: product.diameter,
        length: product.length,
        totalCount,
      }),
    }))
    .sort((a, b) => a.referenceCode.localeCompare(b.referenceCode))
    .slice(0, 20);
}

export type LotAvailability = {
  lotNumber: string;
  count: number;
  stockItemIds: string[];
};

/** Belirli bir ürün için depodaki lot bazlı müsait stok. */
export async function getProductLotsAction(
  productId: string,
  locationId: string,
): Promise<LotAvailability[]> {
  const items = await prisma.stockItem.findMany({
    where: {
      productId,
      locationId,
      isAvailable: true,
    },
    select: {
      id: true,
      lotNumber: true,
    },
    orderBy: { lotNumber: "asc" },
  });

  const lots = new Map<string, string[]>();

  for (const item of items) {
    const list = lots.get(item.lotNumber) ?? [];
    list.push(item.id);
    lots.set(item.lotNumber, list);
  }

  return Array.from(lots.entries()).map(([lotNumber, stockItemIds]) => ({
    lotNumber,
    count: stockItemIds.length,
    stockItemIds,
  }));
}
